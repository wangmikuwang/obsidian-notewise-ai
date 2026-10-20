import {
  App, Editor, MarkdownRenderer, Modal, Notice, Plugin, PluginSettingTab,
  Setting, TFile, TFolder, requestUrl,
} from "obsidian";

interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxChars: number;
}

const DEFAULTS: Settings = {
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  maxChars: 12000,
};

type Msg = { role: "system" | "user"; content: string };

export default class AINotes extends Plugin {
  settings!: Settings;

  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new AINotesSettingTab(this.app, this));

    this.addCommand({ id: "summarize", name: "总结当前笔记（写入 summary 属性）",
      callback: () => this.run(() => this.summarize()) });
    this.addCommand({ id: "tag", name: "自动打标签",
      callback: () => this.run(() => this.autoTag()) });
    this.addCommand({ id: "file", name: "建议归档文件夹并移动",
      callback: () => this.run(() => this.suggestFolder()) });
    this.addCommand({ id: "link", name: "推荐相关笔记链接",
      callback: () => this.run(() => this.suggestLinks()) });
    this.addCommand({ id: "selection", name: "用 AI 处理选中文本",
      editorCallback: (e) => this.run(() => this.transformSelection(e)) });
    this.addCommand({ id: "ask", name: "向知识库提问",
      callback: () => this.run(() => this.askVault()) });
    this.addRibbonIcon("bot", "向知识库提问", () => this.run(() => this.askVault()));
  }

  async saveSettings() { await this.saveData(this.settings); }

  // 统一捕获错误，避免命令静默失败
  async run(fn: () => Promise<void>) {
    try { await fn(); } catch (e) { new Notice(`AI Notes：${(e as Error).message}`, 8000); }
  }

  async chat(messages: Msg[]): Promise<string> {
    const s = this.settings;
    if (!s.apiKey) throw new Error("请先在设置里填写 API Key");
    const notice = new Notice("AI 思考中…", 0);
    try {
      const res = await requestUrl({
        url: s.baseUrl.replace(/\/+$/, "") + "/chat/completions",
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
        body: JSON.stringify({ model: s.model, messages }),
        throw: false,
      });
      if (res.status >= 400) throw new Error(`接口返回 ${res.status}：${res.text.slice(0, 200)}`);
      return res.json.choices[0].message.content.trim();
    } finally {
      notice.hide();
    }
  }

  activeFile(): TFile {
    const f = this.app.workspace.getActiveFile();
    if (!f || f.extension !== "md") throw new Error("请先打开一篇 Markdown 笔记");
    return f;
  }

  async noteText(f: TFile) {
    return (await this.app.vault.cachedRead(f)).slice(0, this.settings.maxChars);
  }

  async summarize() {
    const f = this.activeFile();
    const summary = await this.chat([
      { role: "system", content: "用一到两句话总结笔记，语言与笔记一致，只输出总结本身。" },
      { role: "user", content: await this.noteText(f) },
    ]);
    await this.app.fileManager.processFrontMatter(f, (fm) => { fm.summary = summary; });
    new Notice("已写入 summary");
  }

  async autoTag() {
    const f = this.activeFile();
    // getTags 未写进官方类型，但桌面/移动端都可用
    const existing = Object.keys((this.app.metadataCache as any).getTags?.() ?? {})
      .map((t) => t.replace(/^#/, "")).slice(0, 300);
    const reply = await this.chat([
      { role: "system", content: "为笔记挑选 1-5 个标签。优先复用已有标签，必要时才新建。标签不含 # 和空格。只输出 JSON 字符串数组。" },
      { role: "user", content: `已有标签：${existing.join(", ") || "（无）"}\n\n笔记：\n${await this.noteText(f)}` },
    ]);
    const tags = parseJSON<string[]>(reply).map((t) => String(t).replace(/^#/, "").replace(/\s+/g, "-"));
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      const old: string[] = [].concat(fm.tags ?? []);
      fm.tags = [...new Set([...old, ...tags])];
    });
    new Notice(`已添加标签：${tags.join(", ")}`);
  }

  async suggestFolder() {
    const f = this.activeFile();
    const folders = this.app.vault.getAllLoadedFiles()
      .filter((x): x is TFolder => x instanceof TFolder && !x.path.startsWith("."))
      .map((x) => x.path);
    const reply = await this.chat([
      { role: "system", content: '从给定文件夹中为笔记选出最合适的一个；都不合适可以提议新文件夹。只输出 JSON：{"folder": "路径", "reason": "一句话理由"}。根目录用 "/"。' },
      { role: "user", content: `文件夹：\n${folders.join("\n")}\n\n笔记标题：${f.basename}\n${await this.noteText(f)}` },
    ]);
    const { folder, reason } = parseJSON<{ folder: string; reason: string }>(reply);
    const dir = folder.replace(/^\/+|\/+$/g, "");
    if ((f.parent?.path ?? "/") === (dir || "/")) return void new Notice("已经在最合适的文件夹里了");
    const ok = await confirm(this.app, `移动到「${dir || "/"}」？\n\n${reason}`);
    if (!ok) return;
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    // renameFile 会自动更新其他笔记里指向它的链接
    await this.app.fileManager.renameFile(f, (dir ? dir + "/" : "") + f.name);
    new Notice(`已移动到 ${dir || "/"}`);
  }

  async suggestLinks() {
    const f = this.activeFile();
    // ponytail: 只把标题给 AI，笔记数上千时截断；需要更准再做向量检索
    const titles = this.app.vault.getMarkdownFiles()
      .filter((x) => x !== f).map((x) => x.basename).slice(0, 1500);
    const reply = await this.chat([
      { role: "system", content: "从候选笔记标题中选出与当前笔记最相关的 0-8 个，必须原样使用候选标题。只输出 JSON 字符串数组。" },
      { role: "user", content: `候选：\n${titles.join("\n")}\n\n当前笔记：\n${await this.noteText(f)}` },
    ]);
    const picked = parseJSON<string[]>(reply).filter((t) => titles.includes(t));
    if (!picked.length) return void new Notice("没找到相关笔记");
    await this.app.vault.process(f, (s) =>
      s.trimEnd() + "\n\n## 相关笔记\n" + picked.map((t) => `- [[${t}]]`).join("\n") + "\n");
    new Notice(`已添加 ${picked.length} 个链接`);
  }

  async transformSelection(editor: Editor) {
    const sel = editor.getSelection();
    if (!sel) throw new Error("请先选中文本");
    const instruction = await prompt(this.app, "要怎么处理这段文本？", "如：润色 / 翻译成英文 / 改成要点列表");
    if (!instruction) return;
    const out = await this.chat([
      { role: "system", content: "按用户要求处理文本，只输出处理后的结果，保持 Markdown 格式。" },
      { role: "user", content: `要求：${instruction}\n\n文本：\n${sel}` },
    ]);
    editor.replaceSelection(out);
  }

  async askVault() {
    const q = await prompt(this.app, "向你的知识库提问", "比如：我之前记过哪些关于 XX 的想法？");
    if (!q) return;
    const docs = await this.search(q, 6);
    const ctx = docs.map((d) => `### [[${d.file.basename}]]\n${d.text}`).join("\n\n");
    const answer = await this.chat([
      { role: "system", content: "根据提供的笔记回答问题。引用时用 [[笔记名]]。笔记里没有的信息要明说。" },
      { role: "user", content: `笔记：\n${ctx || "（没有检索到相关笔记）"}\n\n问题：${q}` },
    ]);
    new AnswerModal(this.app, this, q, answer).open();
  }

  // ponytail: 关键词 + 中文二字切分的朴素检索，每次全库扫描；库很大时改成索引/向量检索
  async search(q: string, k: number) {
    const terms = [...new Set(
      (q.toLowerCase().match(/[a-z0-9_]{2,}|[一-鿿]+/g) ?? []).flatMap((w) =>
        /^[a-z0-9_]/.test(w) ? [w] : w.length < 2 ? [] : [...Array(w.length - 1)].map((_, i) => w.slice(i, i + 2))),
    )];
    if (!terms.length) return [];
    const per = Math.floor(this.settings.maxChars / k);
    const scored = await Promise.all(this.app.vault.getMarkdownFiles().map(async (file) => {
      const text = await this.app.vault.cachedRead(file);
      const hay = (file.basename + "\n" + text).toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.split(t).length - 1), 0);
      return { file, text: text.slice(0, per), score };
    }));
    return scored.filter((d) => d.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
}

export function parseJSON<T>(s: string): T {
  const m = s.match(/[\[{][\s\S]*[\]}]/);
  if (!m) throw new Error("AI 没有返回 JSON：" + s.slice(0, 100));
  return JSON.parse(m[0]);
}

function prompt(app: App, title: string, placeholder: string): Promise<string | null> {
  return new Promise((resolve) => {
    const m = new Modal(app);
    let value = "";
    m.titleEl.setText(title);
    const input = m.contentEl.createEl("textarea", { attr: { placeholder, rows: "3" } });
    input.style.width = "100%";
    const submit = () => { value = input.value.trim(); m.close(); };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    new Setting(m.contentEl).addButton((b) => b.setButtonText("确定").setCta().onClick(submit));
    m.onClose = () => resolve(value || null);
    m.open();
    input.focus();
  });
}

function confirm(app: App, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const m = new Modal(app);
    let ok = false;
    m.contentEl.createEl("p", { text }).style.whiteSpace = "pre-wrap";
    new Setting(m.contentEl)
      .addButton((b) => b.setButtonText("取消").onClick(() => m.close()))
      .addButton((b) => b.setButtonText("确定").setCta().onClick(() => { ok = true; m.close(); }));
    m.onClose = () => resolve(ok);
    m.open();
  });
}

class AnswerModal extends Modal {
  constructor(app: App, private plugin: Plugin, private q: string, private answer: string) { super(app); }

  onOpen() {
    this.titleEl.setText(this.q);
    MarkdownRenderer.render(this.app, this.answer, this.contentEl.createDiv(), "", this.plugin);
    new Setting(this.contentEl).addButton((b) => b.setButtonText("保存为笔记").onClick(async () => {
      const name = `AI 问答 ${window.moment().format("YYYY-MM-DD HHmmss")}.md`;
      const f = await this.app.vault.create(name, `> ${this.q}\n\n${this.answer}\n`);
      await this.app.workspace.getLeaf(true).openFile(f);
      this.close();
    }));
  }
}

class AINotesSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AINotes) { super(app, plugin); }

  display() {
    const { containerEl: el } = this;
    const s = this.plugin.settings;
    el.empty();
    el.createEl("p", { text: "支持任何 OpenAI 兼容接口：DeepSeek、通义千问、Kimi、OpenAI、Ollama（http://localhost:11434/v1）等。" });
    const text = (name: string, desc: string, key: "baseUrl" | "apiKey" | "model", secret = false) =>
      new Setting(el).setName(name).setDesc(desc).addText((t) => {
        if (secret) t.inputEl.type = "password";
        t.setValue(s[key]).onChange(async (v) => { s[key] = v.trim(); await this.plugin.saveSettings(); });
      });
    text("接口地址", "以 /v1 结尾的 Base URL", "baseUrl");
    text("API Key", "只保存在本地库的插件配置里", "apiKey", true);
    text("模型", "如 deepseek-chat、qwen-plus、gpt-4o-mini", "model");
    new Setting(el).setName("最多发送字符数").setDesc("单次请求附带的笔记内容上限").addText((t) =>
      t.setValue(String(s.maxChars)).onChange(async (v) => {
        const n = parseInt(v); if (n > 0) { s.maxChars = n; await this.plugin.saveSettings(); }
      }));
  }
}
