import {
  App, Editor, FuzzySuggestModal, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting,
  TFile, TFolder, getAllTags, getLanguage, moment, normalizePath, requestUrl,
} from "obsidian";
import type { Moment } from "moment";

// TS 6 下 obsidian 导出的 moment 类型不可调用，补上用到的签名
const day = moment as unknown as (inp?: string, format?: string, strict?: boolean) => Moment;

interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxChars: number;
}

const DEFAULTS: Settings = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-flash",
  maxChars: 12000,
};

type Msg = { role: "system" | "user" | "assistant"; content: string };
type ChatResponse = { choices: { message: { content: string } }[] };
type StreamChunk = { choices?: { delta?: { content?: string } }[] };

const en = {
  askAI: "Ask AI", askVault: "Ask your vault", summarize: "Summarize note into properties",
  tag: "Auto-tag note", file: "Suggest folder and move note", link: "Suggest related note links",
  thinking: "AI is thinking…", needKey: "Set your API key in settings first", needNote: "Open a Markdown note first",
  noJSON: "AI did not return JSON: ", httpErr: "API returned ",
  summaryDone: "Summary saved to properties", tagsDone: "Added tags: ", alreadyThere: "Already in the best folder",
  moveTo: "Move to", moved: "Moved to ", noRelated: "No related notes found", linksAdded: "Links added: ",
  relatedHeading: "Related notes", pickAction: "What should AI do?", customPh: "Tell AI what to do…",
  draftPh: "Describe what to write, e.g. a blog outline about…", vaultPh: "Ask anything about your notes…",
  ok: "OK", cancel: "Cancel", replace: "Replace selection", insert: "Insert below", copy: "Copy",
  copied: "Copied", retry: "Retry", saveNote: "Save as note", followPh: "Tell AI what to change…", send: "Send",
  qaTitle: "AI answer", settingsIntro: "Works with any OpenAI-compatible API: DeepSeek, Qwen, Kimi, OpenAI, Ollama (http://localhost:11434/v1) and more. Note content you run AI on is sent to this API.",
  baseUrl: "API base URL", baseUrlDesc: "For DeepSeek: https://api.deepseek.com", apiKey: "API key",
  apiKeyDesc: "Stored locally in this vault's plugin data", model: "Model", modelDesc: "e.g. deepseek-flash, deepseek-v4-pro, qwen-plus, gpt-4o-mini",
  maxChars: "Max characters per request", maxCharsDesc: "Upper limit of note content sent in one request",
  test: "Test connection", testBtn: "Test", testOk: "Connection OK: ",
  quickLog: "Quick log with AI", quickLogPh: "e.g. fasting glucose 6.2, took morning meds, weight 94.0",
  review: "Review the last 7 days", noTargets: "No log folders found. Set up Daily notes or Templater folder templates first",
  nothingParsed: "Nothing to log was found", logTo: "Write these values?", logged: "Logged: ",
  noRecent: "No notes from the last 7 days", dailyFail: "Daily note was not created", startReview: "Insert & review",
  actions: {
    continue: "Continue writing", improve: "Improve writing", grammar: "Fix spelling & grammar",
    shorter: "Make shorter", longer: "Make longer", simplify: "Simplify language",
    professional: "Change tone: professional", casual: "Change tone: casual", friendly: "Change tone: friendly",
    toZh: "Translate to Chinese", toEn: "Translate to English", toJa: "Translate to Japanese",
    summary: "Summarize", todo: "Find action items", explain: "Explain this", outline: "Make an outline",
    brainstorm: "Brainstorm ideas", flashcards: "Make flashcards", draft: "Draft with AI…", custom: "Custom instruction…",
  },
};

const zh: typeof en = {
  askAI: "问 AI", askVault: "向知识库提问", summarize: "总结笔记（写入属性）",
  tag: "自动打标签", file: "建议归档文件夹并移动", link: "推荐相关笔记链接",
  thinking: "AI 思考中…", needKey: "请先在设置里填写 API Key", needNote: "请先打开一篇 Markdown 笔记",
  noJSON: "AI 没有返回 JSON：", httpErr: "接口返回 ",
  summaryDone: "已写入 summary 属性", tagsDone: "已添加标签：", alreadyThere: "已经在最合适的文件夹里了",
  moveTo: "移动到", moved: "已移动到 ", noRelated: "没找到相关笔记", linksAdded: "已添加链接：",
  relatedHeading: "相关笔记", pickAction: "让 AI 做什么？", customPh: "告诉 AI 要做什么…",
  draftPh: "描述要写的内容，如：一篇关于…的博客大纲", vaultPh: "问问你的笔记…",
  ok: "确定", cancel: "取消", replace: "替换选中内容", insert: "插入到下方", copy: "复制",
  copied: "已复制", retry: "重试", saveNote: "保存为笔记", followPh: "告诉 AI 怎么改…", send: "发送",
  qaTitle: "AI 回答", settingsIntro: "支持任何 OpenAI 兼容接口：DeepSeek、通义千问、Kimi、OpenAI、Ollama（http://localhost:11434/v1）等。使用 AI 的笔记内容会发送到该接口。",
  baseUrl: "接口地址", baseUrlDesc: "DeepSeek 填 https://api.deepseek.com", apiKey: "API Key",
  apiKeyDesc: "只保存在本库的插件数据里", model: "模型", modelDesc: "如 deepseek-flash、deepseek-v4-pro、qwen-plus、gpt-4o-mini",
  maxChars: "单次最多发送字符数", maxCharsDesc: "单次请求附带的笔记内容上限",
  test: "测试连接", testBtn: "测试", testOk: "连接成功：",
  quickLog: "AI 快速记录", quickLogPh: "如：空腹 6.2，二甲双胍早上吃了，体重 94.0",
  review: "AI 回顾最近 7 天", noTargets: "没找到记录文件夹，请先设置日记或 Templater 文件夹模板",
  nothingParsed: "没识别出要记录的内容", logTo: "写入这些数据？", logged: "已记录：",
  noRecent: "最近 7 天没有记录", dailyFail: "日记没有建出来", startReview: "插入并复习",
  actions: {
    continue: "续写", improve: "改进写作", grammar: "修正拼写和语法",
    shorter: "缩短", longer: "扩写", simplify: "简化语言",
    professional: "语气：专业", casual: "语气：随意", friendly: "语气：友好",
    toZh: "翻译成中文", toEn: "翻译成英文", toJa: "翻译成日文",
    summary: "总结", todo: "提取待办事项", explain: "解释", outline: "生成大纲",
    brainstorm: "头脑风暴", flashcards: "生成闪卡", draft: "AI 起草…", custom: "自定义指令…",
  },
};

const t = getLanguage().startsWith("zh") ? zh : en;

type ActionId = keyof typeof en.actions;
interface Action {
  id: ActionId;
  prompt: string;
  // ask: 先让用户输入；context: 用光标前文而不是选区
  ask?: string;
  context?: boolean;
}

const KEEP = "Keep the original language and Markdown formatting. Output only the result, no preamble.";
const ACTIONS: Action[] = [
  { id: "continue", context: true, prompt: "Continue writing from where the text ends. Match its language, tone and style. Output only the new text." },
  { id: "improve", prompt: `Improve the writing: clearer, more fluent, better structured. ${KEEP}` },
  { id: "grammar", prompt: `Fix spelling, grammar and punctuation only. ${KEEP}` },
  { id: "shorter", prompt: `Make it more concise while keeping the key points. ${KEEP}` },
  { id: "longer", prompt: `Expand it with more detail and examples. ${KEEP}` },
  { id: "simplify", prompt: `Rewrite in simpler, plain language. ${KEEP}` },
  { id: "professional", prompt: `Rewrite in a professional tone. ${KEEP}` },
  { id: "casual", prompt: `Rewrite in a casual tone. ${KEEP}` },
  { id: "friendly", prompt: `Rewrite in a warm, friendly tone. ${KEEP}` },
  { id: "toZh", prompt: "Translate into Simplified Chinese. Keep Markdown. Output only the translation." },
  { id: "toEn", prompt: "Translate into English. Keep Markdown. Output only the translation." },
  { id: "toJa", prompt: "Translate into Japanese. Keep Markdown. Output only the translation." },
  { id: "summary", prompt: "Summarize the key points as a short Markdown list, in the text's language." },
  { id: "todo", prompt: "Extract action items as a Markdown task list (- [ ] ...), in the text's language. If none, say so." },
  { id: "explain", prompt: "Explain this clearly and concisely, in the text's language." },
  { id: "outline", prompt: "Create a structured Markdown outline (headings and bullets), in the text's language." },
  { id: "brainstorm", prompt: "Brainstorm 8-10 diverse ideas related to this as a Markdown list, in the text's language." },
  { id: "flashcards", prompt: "Turn the key facts into flashcards, one per line as `front{sep}back`, in the text's language. Put {tag} alone on the first line. Output only the cards." },
  { id: "draft", ask: t.draftPh, prompt: "Write what the user asks for in Markdown. Use the user's language. Output only the content." },
  { id: "custom", ask: t.customPh, prompt: "Follow the user's instruction on the text. Use Markdown. Output only the result." },
];

// 其他插件和核心插件没有公开类型，这里只声明用到的部分
interface Host {
  plugins: { plugins: Record<string, {
    settings?: { folder_templates?: { folder: string; template: string }[] };
    templater?: {
      create_new_note_from_template(tpl: TFile, folder: TFolder, name: string, open: boolean): Promise<TFile | undefined>;
      files_with_pending_templates: Set<string>;
    };
    dataManager?: { data: { settings: { singleLineCardSeparator?: string; flashcardTags?: string[] } } };
  } | undefined> };
  internalPlugins: { getPluginById(id: string): { enabled: boolean; instance: { options: { folder?: string; format?: string; template?: string } } } | null };
  commands: { executeCommandById(id: string): boolean };
}

// 记录目标：日记文件夹或 Templater 文件夹模板，字段取自模板的 frontmatter
interface Target { folder: string; format: string; daily: boolean; template: TFile | null; fields: Record<string, unknown> }
type Log = Record<string, Record<string, unknown>>;

export default class NoteWise extends Plugin {
  settings!: Settings;

  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData() as Partial<Settings>);
    this.addSettingTab(new NoteWiseSettingTab(this.app, this));

    this.addCommand({ id: "ask-ai", name: t.askAI, icon: "sparkles", editorCallback: (e) => this.askAI(e) });
    this.addCommand({ id: "ask-vault", name: t.askVault, icon: "message-circle-question", callback: () => this.run(() => this.askVault()) });
    this.addCommand({ id: "summarize", name: t.summarize, icon: "file-text", callback: () => this.run(() => this.summarize()) });
    this.addCommand({ id: "tag", name: t.tag, icon: "tags", callback: () => this.run(() => this.autoTag()) });
    this.addCommand({ id: "file", name: t.file, icon: "folder-input", callback: () => this.run(() => this.suggestFolder()) });
    this.addCommand({ id: "link", name: t.link, icon: "link", callback: () => this.run(() => this.suggestLinks()) });
    this.addCommand({ id: "quick-log", name: t.quickLog, icon: "pencil-line", callback: () => this.run(() => this.quickLog()) });
    this.addCommand({ id: "review", name: t.review, icon: "calendar-range", callback: () => this.run(() => this.review()) });
    this.addRibbonIcon("sparkles", t.askVault, () => this.run(() => this.askVault()));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      menu.addItem((i) => i.setTitle(t.askAI).setIcon("sparkles").onClick(() => this.askAI(editor)));
    }));
    // 安卓长按弹的是系统文字菜单，不是 editor-menu；手机上从右上角 ⋮ 菜单进入
    this.registerEvent(this.app.workspace.on("file-menu", (menu, _file, _source, leaf) => {
      const view = leaf?.view ?? this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!(view instanceof MarkdownView) || view.getMode() !== "source") return;
      menu.addItem((i) => i.setTitle(t.askAI).setIcon("sparkles").setSection("action")
        .onClick(() => this.askAI(view.editor)));
    }));
  }

  async saveSettings() { await this.saveData(this.settings); }

  // 统一捕获错误，避免命令静默失败
  async run(fn: () => Promise<void>) {
    try { await fn(); } catch (e) { new Notice(`NoteWise AI: ${(e as Error).message}`, 8000); }
  }

  endpoint() {
    const s = this.settings;
    if (!s.apiKey) throw new Error(t.needKey);
    return {
      url: s.baseUrl.replace(/\/+$/, "") + "/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
    };
  }

  async chat(messages: Msg[]): Promise<string> {
    const { url, headers } = this.endpoint();
    const notice = new Notice(t.thinking, 0);
    try {
      const res = await requestUrl({
        url, method: "POST", headers, throw: false,
        body: JSON.stringify({ model: this.settings.model, messages }),
      });
      if (res.status >= 400) throw new Error(`${t.httpErr}${res.status}: ${res.text.slice(0, 200)}`);
      return (res.json as ChatResponse).choices[0].message.content.trim();
    } finally {
      notice.hide();
    }
  }

  // requestUrl 不支持流式，这里用 fetch；被 CORS 拦下时退回 requestUrl 一次性返回
  async stream(messages: Msg[], onText: (full: string) => void, signal: AbortSignal): Promise<string> {
    const { url, headers } = this.endpoint();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST", headers, signal,
        body: JSON.stringify({ model: this.settings.model, messages, stream: true }),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      const full = await this.chat(messages);
      onText(full);
      return full;
    }
    if (!res.ok || !res.body) throw new Error(`${t.httpErr}${res.status}: ${(await res.text()).slice(0, 200)}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.replace(/^data:\s*/, "").trim();
        if (!line.startsWith("data:") || data === "[DONE]") continue;
        const delta = (JSON.parse(data) as StreamChunk).choices?.[0]?.delta?.content;
        if (delta) { full += delta; onText(full); }
      }
    }
    return full;
  }

  activeFile(): TFile {
    const f = this.app.workspace.getActiveFile();
    if (!f || f.extension !== "md") throw new Error(t.needNote);
    return f;
  }

  async noteText(f: TFile) {
    return (await this.app.vault.cachedRead(f)).slice(0, this.settings.maxChars);
  }

  host() { return this.app as unknown as Host; }

  askAI(editor: Editor) {
    // 先记下选区：手机上弹出面板/键盘时编辑器会失焦，之后再读选区可能已经丢了
    const from = editor.getCursor("from");
    const end = editor.getCursor("to");
    const selection = editor.getSelection();
    new ActionPicker(this.app, async (action) => {
      const extra = action.ask ? await prompt(this.app, t.actions[action.id], action.ask) : "";
      if (action.ask && !extra) return;
      const max = this.settings.maxChars;
      const text = action.context
        ? editor.getRange({ line: 0, ch: 0 }, end).slice(-max)
        : (selection || editor.getValue()).slice(0, max);
      const user = action.id === "draft"
        ? `${extra}\n\nContext (current note, may be empty):\n${editor.getValue().slice(0, max)}`
        : `${extra ? `Instruction: ${extra}\n\n` : ""}Text:\n${text}`;
      const insertBelow = (out: string) => {
        const line = editor.getLine(end.line);
        // 续写直接接在光标处，其余结果另起一段
        if (action.context) editor.replaceRange(out, end);
        else editor.replaceRange(`${line ? "\n\n" : ""}${out}\n`, { line: end.line, ch: line.length });
      };
      const buttons: Button[] = [{ label: t.insert, cta: !selection || !!action.context, onClick: insertBelow }];
      if (selection && !action.context) {
        buttons.unshift({ label: t.replace, cta: true, onClick: (out) => editor.replaceRange(out, from, end) });
      }
      let system = action.prompt;
      if (action.id === "flashcards") {
        // 分隔符和标签跟随闪卡插件的设置，生成的卡片它才认得
        const sr = this.host().plugins.plugins["obsidian-spaced-repetition"]?.dataManager?.data.settings;
        system = system.replace("{sep}", sr?.singleLineCardSeparator ?? "::").replace("{tag}", sr?.flashcardTags?.[0] ?? "#flashcards");
        if (sr) buttons.push({ label: t.startReview, onClick: async (out) => {
          insertBelow(out);
          await this.app.workspace.getActiveViewOfType(MarkdownView)?.save();
          this.host().commands.executeCommandById("obsidian-spaced-repetition:srs-review-flashcards");
        } });
      }
      new ResultModal(this, t.actions[action.id], [
        { role: "system", content: system },
        { role: "user", content: user },
      ], buttons).open();
    }).open();
  }

  async askVault() {
    const q = await prompt(this.app, t.askVault, t.vaultPh);
    if (!q) return;
    const docs = await this.search(q, 6);
    const ctx = docs.map((d) => `### [[${d.file.basename}]]\n${d.text}`).join("\n\n");
    new ResultModal(this, q, [
      { role: "system", content: "Answer the question using the provided notes. Cite notes as [[note name]]. Say clearly when the notes don't contain the answer. Answer in the question's language." },
      { role: "user", content: `Notes:\n${ctx || "(no relevant notes found)"}\n\nQuestion: ${q}` },
    ], this.answerButtons(t.qaTitle, `> ${q}`)).open();
  }

  answerButtons(title: string, header: string): Button[] {
    const editor = this.app.workspace.activeEditor?.editor;
    const buttons: Button[] = [{
      label: t.saveNote, cta: true, onClick: async (out) => {
        const f = await this.createNote(`${title} ${new Date().toLocaleString("sv").replace(/:/g, "")}.md`, `${header}\n\n${out}\n`);
        await this.app.workspace.getLeaf(true).openFile(f);
      },
    }];
    if (editor) buttons.push({ label: t.insert, onClick: (out) => editor.replaceSelection(out) });
    return buttons;
  }

  targets(): Target[] {
    const h = this.host();
    const out: Target[] = [];
    const add = (folder: string, tpl: string | undefined, format: string, daily: boolean) => {
      const template = tpl ? this.app.metadataCache.getFirstLinkpathDest(tpl, "") : null;
      const fields = (template && this.app.metadataCache.getFileCache(template)?.frontmatter) ?? {};
      if (Object.keys(fields).length) out.push({ folder: normalizePath(folder || "/"), format, daily, template, fields });
    };
    const daily = h.internalPlugins.getPluginById("daily-notes");
    if (daily?.enabled) {
      const o = daily.instance.options;
      add(o.folder ?? "", o.template, o.format || "YYYY-MM-DD", true);
    }
    for (const p of h.plugins.plugins["templater-obsidian"]?.settings?.folder_templates ?? []) add(p.folder, p.template, "YYYY-MM-DD", false);
    return out;
  }

  todayPath(x: Target) { return normalizePath(`${x.folder}/${day().format(x.format)}.md`); }

  // 今天的笔记不存在就交给原插件新建，模板照常套上
  async todayNote(x: Target): Promise<TFile> {
    const path = this.todayPath(x);
    const found = this.app.vault.getAbstractFileByPath(path);
    if (found instanceof TFile) return found;
    if (x.daily) {
      // ponytail: 只等文件建好；日记模板若还要被 Templater 二次处理，可能和写属性抢先后
      const created = new Promise<TFile>((resolve, reject) => {
        const ref = this.app.vault.on("create", (f) => {
          if (f.path === path && f instanceof TFile) { this.app.vault.offref(ref); resolve(f); }
        });
        window.setTimeout(() => { this.app.vault.offref(ref); reject(new Error(t.dailyFail)); }, 5000);
      });
      this.host().commands.executeCommandById("daily-notes");
      return created;
    }
    if (!this.app.vault.getAbstractFileByPath(x.folder)) await this.app.vault.createFolder(x.folder);
    const folder = this.app.vault.getAbstractFileByPath(x.folder);
    const tp = this.host().plugins.plugins["templater-obsidian"]?.templater;
    const f = tp && x.template && folder instanceof TFolder
      ? await tp.create_new_note_from_template(x.template, folder, day().format(x.format), false) : undefined;
    return f ?? this.app.vault.create(path, x.template ? await this.app.vault.read(x.template) : "");
  }

  // Templater 开了「新建文件时触发」会重新解析新文件，在安卓上会把内容清空；先登记成它的待处理文件，让它跳过
  async createNote(path: string, content: string) {
    const pending = this.host().plugins.plugins["templater-obsidian"]?.templater?.files_with_pending_templates;
    pending?.add(path);
    try {
      return await this.app.vault.create(path, content);
    } finally {
      // ponytail: Templater 固定等 300ms 再检查，这里 1 秒后撤销登记；它改了延迟就要跟着调
      window.setTimeout(() => pending?.delete(path), 1000);
    }
  }

  async quickLog() {
    const targets = this.targets();
    if (!targets.length) throw new Error(t.noTargets);
    const text = await prompt(this.app, t.quickLog, t.quickLogPh);
    if (!text) return;
    const schema = Object.fromEntries(targets.map((x) => [x.folder, x.fields]));
    const reply = await this.chat([
      { role: "system", content: 'Turn the user\'s log into note properties. The schema maps folder -> {field: template default}. Output only JSON {"folder": {"field": value}} with exact folder and field names, only for things the user clearly mentioned. Use true/false for fields whose default is a boolean, plain numbers for measurements, short text otherwise.' },
      { role: "user", content: `Schema: ${JSON.stringify(schema)}\n\nLog: ${text}` },
    ]);
    const picked = pickLog(parseJSON<Log>(reply), targets);
    if (!picked.length) return void new Notice(t.nothingParsed);
    const preview = picked.map(({ target, values }) => `📁 ${this.todayPath(target)}\n` +
      Object.entries(values).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join("\n")).join("\n\n");
    if (!await confirm(this.app, `${t.logTo}\n\n${preview}`)) return;
    for (const { target, values } of picked) {
      const f = await this.todayNote(target);
      await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => { Object.assign(fm, values); });
    }
    new Notice(t.logged + picked.flatMap((x) => Object.keys(x.values)).join(", "));
  }

  async review() {
    const since = day().subtract(6, "days").startOf("day");
    const parts: string[] = [];
    for (const x of this.targets()) {
      const dir = this.app.vault.getAbstractFileByPath(x.folder);
      if (!(dir instanceof TFolder)) continue;
      // ponytail: 只看文件夹第一层、按文件名认日期；日记格式带子目录（YYYY/MM/DD）时要改成递归
      for (const f of dir.children) {
        if (!(f instanceof TFile) || f.extension !== "md") continue;
        const d = day(f.basename, x.format, true);
        if (d.isValid() && !d.isBefore(since)) parts.push(`## ${f.path}\n${await this.app.vault.cachedRead(f)}`);
      }
    }
    if (!parts.length) return void new Notice(t.noRecent);
    new ResultModal(this, t.review, [
      { role: "system", content: "Review the user's self-tracking notes from the last 7 days (daily check-ins and measurements). Write a short, warm review in the notes' language: trends in the numbers, habits kept or missed, notable moments, and 2-3 gentle suggestions for next week. Do not give medication or dosage advice; for anything medical, suggest asking their doctor." },
      { role: "user", content: `Today: ${day().format("YYYY-MM-DD")}\n\n${parts.sort().join("\n\n").slice(-this.settings.maxChars)}` },
    ], this.answerButtons(t.review, `# ${t.review}`)).open();
  }

  async summarize() {
    const f = this.activeFile();
    const summary = await this.chat([
      { role: "system", content: "Summarize the note in one or two sentences, in the note's language. Output only the summary." },
      { role: "user", content: await this.noteText(f) },
    ]);
    await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => { fm.summary = summary; });
    new Notice(t.summaryDone);
  }

  vaultTags() {
    const tags = new Set<string>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(f);
      for (const tag of (cache && getAllTags(cache)) ?? []) tags.add(tag.replace(/^#/, ""));
    }
    return [...tags].slice(0, 300);
  }

  async autoTag() {
    const f = this.activeFile();
    const reply = await this.chat([
      { role: "system", content: "Pick 1-5 tags for the note. Prefer reusing existing tags; create new ones only if needed. Tags have no # and no spaces. Output only a JSON array of strings." },
      { role: "user", content: `Existing tags: ${this.vaultTags().join(", ") || "(none)"}\n\nNote:\n${await this.noteText(f)}` },
    ]);
    const tags = parseJSON<string[]>(reply).map((x) => String(x).replace(/^#/, "").replace(/\s+/g, "-"));
    await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
      const old = ([] as unknown[]).concat(fm.tags ?? []).map(String);
      fm.tags = [...new Set([...old, ...tags])];
    });
    new Notice(t.tagsDone + tags.join(", "));
  }

  async suggestFolder() {
    const f = this.activeFile();
    const folders = this.app.vault.getAllLoadedFiles()
      .filter((x): x is TFolder => x instanceof TFolder && !x.path.startsWith("."))
      .map((x) => x.path);
    const reply = await this.chat([
      { role: "system", content: 'Choose the best folder for the note from the list; propose a new folder only if none fits. Output only JSON: {"folder": "path", "reason": "one sentence in the note\'s language"}. Use "/" for root.' },
      { role: "user", content: `Folders:\n${folders.join("\n")}\n\nNote title: ${f.basename}\n${await this.noteText(f)}` },
    ]);
    const { folder, reason } = parseJSON<{ folder: string; reason: string }>(reply);
    const dir = folder.replace(/^\/+|\/+$/g, "");
    if ((f.parent?.path ?? "/") === (dir || "/")) return void new Notice(t.alreadyThere);
    if (!await confirm(this.app, `${t.moveTo} "${dir || "/"}"?\n\n${reason}`)) return;
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    // renameFile 会自动更新其他笔记里指向它的链接
    await this.app.fileManager.renameFile(f, (dir ? dir + "/" : "") + f.name);
    new Notice(t.moved + (dir || "/"));
  }

  async suggestLinks() {
    const f = this.activeFile();
    // ponytail: 只把标题给 AI，笔记数上千时截断；需要更准再做向量检索
    const titles = this.app.vault.getMarkdownFiles()
      .filter((x) => x !== f).map((x) => x.basename).slice(0, 1500);
    const reply = await this.chat([
      { role: "system", content: "From the candidate note titles, pick the 0-8 most related to the current note, using titles exactly as given. Output only a JSON array of strings." },
      { role: "user", content: `Candidates:\n${titles.join("\n")}\n\nCurrent note:\n${await this.noteText(f)}` },
    ]);
    const picked = parseJSON<string[]>(reply).filter((x) => titles.includes(x));
    if (!picked.length) return void new Notice(t.noRelated);
    await this.app.vault.process(f, (s) =>
      s.trimEnd() + `\n\n## ${t.relatedHeading}\n` + picked.map((x) => `- [[${x}]]`).join("\n") + "\n");
    new Notice(t.linksAdded + picked.length);
  }

  // ponytail: 关键词 + 中文二字切分的朴素检索，每次全库扫描；库很大时改成索引/向量检索
  async search(q: string, k: number) {
    const terms = [...new Set(
      (q.toLowerCase().match(/[a-z0-9_]{2,}|[一-鿿]+/g) ?? []).flatMap((w) =>
        /^[a-z0-9_]/.test(w) ? [w] : Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))),
    )];
    if (!terms.length) return [];
    const per = Math.floor(this.settings.maxChars / k);
    const scored = await Promise.all(this.app.vault.getMarkdownFiles().map(async (file) => {
      const text = await this.app.vault.cachedRead(file);
      const hay = (file.basename + "\n" + text).toLowerCase();
      const score = terms.reduce((n, x) => n + (hay.split(x).length - 1), 0);
      return { file, text: text.slice(0, per), score };
    }));
    return scored.filter((d) => d.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
}

export function parseJSON<T>(s: string): T {
  const m = s.match(/[[{][\s\S]*[\]}]/);
  if (!m) throw new Error(t.noJSON + s.slice(0, 100));
  return JSON.parse(m[0]) as T;
}

// 只保留目标里存在的文件夹和字段；模板默认值是布尔的字段转成 true/false
export function pickLog<T extends { folder: string; fields: Record<string, unknown> }>(reply: Log, targets: T[]) {
  return targets.map((target) => {
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(reply[target.folder] ?? {})) {
      if (!(k in target.fields) || v === null || v === "") continue;
      values[k] = typeof target.fields[k] === "boolean" ? v === true || v === "true" : v;
    }
    return { target, values };
  }).filter((x) => Object.keys(x.values).length);
}

class ActionPicker extends FuzzySuggestModal<Action> {
  constructor(app: App, private onPick: (a: Action) => Promise<void>) {
    super(app);
    this.setPlaceholder(t.pickAction);
  }
  getItems() { return ACTIONS; }
  getItemText(a: Action) { return t.actions[a.id]; }
  onChooseItem(a: Action) { void this.onPick(a); }
}

interface Button { label: string; cta?: boolean; onClick: (text: string) => void | Promise<void> }

// 类似 Notion AI 的结果面板：流式显示、可手改、可追问、可重试，最后选择插入方式
class ResultModal extends Modal {
  private abort = new AbortController();
  private output!: HTMLTextAreaElement;
  private last = "";

  constructor(private plugin: NoteWise, private title: string, private messages: Msg[], private buttons: Button[]) {
    super(plugin.app);
  }

  onOpen() {
    this.titleEl.setText(this.title);
    this.modalEl.addClass("notewise-modal");
    this.output = this.contentEl.createEl("textarea", { cls: "notewise-output", attr: { rows: "12" } });
    const row = this.contentEl.createDiv({ cls: "notewise-follow" });
    const follow = row.createEl("input", { attr: { type: "text", placeholder: t.followPh, enterkeyhint: "send" } });
    const send = () => {
      if (!follow.value.trim()) return;
      this.messages.push({ role: "assistant", content: this.output.value }, { role: "user", content: follow.value.trim() });
      follow.value = "";
      void this.generate();
    };
    follow.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) send(); });
    // 手机键盘不一定有回车，给个按钮
    row.createEl("button", { text: t.send }).addEventListener("click", send);
    const bar = new Setting(this.contentEl);
    for (const b of this.buttons) {
      bar.addButton((btn) => {
        btn.setButtonText(b.label).onClick(async () => { await b.onClick(this.output.value); this.close(); });
        if (b.cta) btn.setCta();
      });
    }
    bar.addButton((b) => b.setButtonText(t.copy).onClick(async () => {
      await navigator.clipboard.writeText(this.output.value);
      new Notice(t.copied);
    }));
    bar.addButton((b) => b.setButtonText(t.retry).onClick(() => void this.generate()));
    void this.generate();
  }

  async generate() {
    this.abort.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.output.value = t.thinking;
    this.output.readOnly = true;
    try {
      this.last = await this.plugin.stream(this.messages, (full) => {
        this.output.value = full;
        this.output.scrollTop = this.output.scrollHeight;
      }, signal);
    } catch (e) {
      if (!signal.aborted) this.output.value = `⚠ ${(e as Error).message}`;
    } finally {
      if (!signal.aborted) this.output.readOnly = false;
    }
  }

  onClose() { this.abort.abort(); this.contentEl.empty(); }
}

function prompt(app: App, title: string, placeholder: string): Promise<string | null> {
  return new Promise((resolve) => {
    const m = new Modal(app);
    let value = "";
    m.titleEl.setText(title);
    const input = m.contentEl.createEl("textarea", { cls: "notewise-input", attr: { placeholder, rows: "3" } });
    const submit = () => { value = input.value.trim(); m.close(); };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    new Setting(m.contentEl).addButton((b) => b.setButtonText(t.ok).setCta().onClick(submit));
    m.onClose = () => resolve(value || null);
    m.open();
    input.focus();
  });
}

function confirm(app: App, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const m = new Modal(app);
    let ok = false;
    m.contentEl.createEl("p", { text, cls: "notewise-pre" });
    new Setting(m.contentEl)
      .addButton((b) => b.setButtonText(t.cancel).onClick(() => m.close()))
      .addButton((b) => b.setButtonText(t.ok).setCta().onClick(() => { ok = true; m.close(); }));
    m.onClose = () => resolve(ok);
    m.open();
  });
}

class NoteWiseSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: NoteWise) { super(app, plugin); }

  display() {
    const { containerEl: el } = this;
    const s = this.plugin.settings;
    el.empty();
    el.createEl("p", { text: t.settingsIntro });
    const text = (name: string, desc: string, key: "baseUrl" | "apiKey" | "model", secret = false) =>
      new Setting(el).setName(name).setDesc(desc).addText((x) => {
        if (secret) x.inputEl.type = "password";
        x.setValue(s[key]).onChange(async (v) => { s[key] = v.trim(); await this.plugin.saveSettings(); });
      });
    text(t.baseUrl, t.baseUrlDesc, "baseUrl");
    text(t.apiKey, t.apiKeyDesc, "apiKey", true);
    text(t.model, t.modelDesc, "model");
    new Setting(el).setName(t.maxChars).setDesc(t.maxCharsDesc).addText((x) =>
      x.setValue(String(s.maxChars)).onChange(async (v) => {
        const n = parseInt(v); if (n > 0) { s.maxChars = n; await this.plugin.saveSettings(); }
      }));
    new Setting(el).setName(t.test).addButton((b) => b.setButtonText(t.testBtn).onClick(() =>
      this.plugin.run(async () => {
        new Notice(t.testOk + await this.plugin.chat([{ role: "user", content: "Reply with: OK" }]));
      })));
  }
}
