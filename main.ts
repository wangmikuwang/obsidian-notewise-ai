import {
  App, BasesEntry, BasesView, Command, Editor, FuzzySuggestModal, ItemView, MarkdownView, Menu, Modal, Notice, Platform,
  Plugin, PluginSettingTab, QueryController, Setting, TFile, TFolder, TextAreaComponent, WorkspaceLeaf, debounce, getAllTags, getLanguage, moment,
  normalizePath, parsePropertyId, requestUrl, setIcon,
} from "obsidian";
import type { Moment } from "moment";

// TS 6 下 obsidian 导出的 moment 类型不可调用，补上用到的签名
const day = moment as unknown as (inp?: string, format?: string, strict?: boolean) => Moment;

interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxChars: number;
  homepage: string;
  // 每行「命令 id | 图标 | 名称」
  buttons: string;
  // 每行「文件夹路径 = emoji」
  folderIcons: string;
}

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
  openHome: "Open homepage", noHome: "Set a homepage note in NoteWise settings first", today: "Today", home: "Home",
  moveUp: "Move list item up", moveDown: "Move list item down", formatTable: "Format table", insertRow: "Insert table row",
  notInTable: "Cursor is not in a table", spaceCJK: "Add spaces between Chinese and English",
  calendar: "Calendar", openCalendar: "Open calendar", createDaily: "Create daily note ",
  kanban: "Kanban", kanbanColumn: "Column property", kanbanColumns: "Columns (comma-separated)",
  kanbanNone: "(none)", moveCardTo: "Move to", newCard: "New card", kanbanNeedProp: "Pick a note property for the columns in the view options",
  colDefault: "To do, Doing, Done", statusProp: "status",
  workflow: "Workflow", homepage: "Homepage", homepageDesc: "Note opened on startup and by the Home button, e.g. Home. Empty = off",
  buttons: "Header buttons", buttonsDesc: "Shown at the top of every page. One per line: command id | icon | name",
  addButton: "Add command", folderIcons: "Folder icons", folderIconsDesc: "One per line: folder path = emoji. For notes, set an icon property (emoji) instead.",
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
  openHome: "打开主页", noHome: "请先在 NoteWise 设置里填写主页笔记", today: "今天", home: "主页",
  moveUp: "列表项上移", moveDown: "列表项下移", formatTable: "格式化表格", insertRow: "表格插入一行",
  notInTable: "光标不在表格里", spaceCJK: "中英文之间加空格",
  calendar: "日历", openCalendar: "打开日历", createDaily: "新建日记 ",
  kanban: "看板", kanbanColumn: "分列属性", kanbanColumns: "列（逗号分隔）",
  kanbanNone: "（未设置）", moveCardTo: "移到", newCard: "新卡片", kanbanNeedProp: "请在视图选项里选一个笔记属性作为分列依据",
  colDefault: "待办, 进行中, 已完成", statusProp: "状态",
  workflow: "工作流", homepage: "主页", homepageDesc: "启动时和点「主页」按钮时打开的笔记，如：主页。留空则关闭",
  buttons: "页面顶部按钮", buttonsDesc: "显示在每个页面顶部。每行一个：命令 id | 图标 | 名称",
  addButton: "添加命令", folderIcons: "文件夹图标", folderIconsDesc: "每行一个：文件夹路径 = emoji。笔记的图标写在 icon 属性里（emoji）。",
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

const DEFAULTS: Settings = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-flash",
  maxChars: 12000,
  homepage: "",
  buttons: `notewise-ai:open-homepage | home | ${t.home}\ndaily-notes | calendar-check | ${t.today}\nnotewise-ai:quick-log | sparkles | ${t.quickLog}`,
  folderIcons: "",
};

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
  commands: { executeCommandById(id: string): boolean; listCommands(): Command[] };
}

const KANBAN = "notewise-kanban";
const CALENDAR = "notewise-calendar";

// 记录目标：日记文件夹或 Templater 文件夹模板，字段取自模板的 frontmatter
interface Target { folder: string; format: string; daily: boolean; template: TFile | null; fields: Record<string, unknown> }
type Log = Record<string, Record<string, unknown>>;

export default class NoteWise extends Plugin {
  settings!: Settings;
  private buttonEls: HTMLElement[] = [];
  private buttoned = new WeakSet<ItemView>();
  private observed = new WeakSet<HTMLElement>();
  refreshIcons = debounce(() => this.decorateIcons(), 100, true);

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

    // 工作流：主页、页面顶部按钮、图标、看板、列表移动、表格、中英文空格、日历
    this.addCommand({ id: "open-homepage", name: t.openHome, icon: "home", callback: () => this.run(() => this.openHomepage()) });
    this.addCommand({ id: "move-item-up", name: t.moveUp, icon: "arrow-up", editorCallback: (e) => moveItem(e, -1) });
    this.addCommand({ id: "move-item-down", name: t.moveDown, icon: "arrow-down", editorCallback: (e) => moveItem(e, 1) });
    this.addCommand({ id: "format-table", name: t.formatTable, icon: "table", editorCallback: (e) => tableCommand(e, false) });
    this.addCommand({ id: "insert-row", name: t.insertRow, icon: "between-horizontal-end", editorCallback: (e) => tableCommand(e, true) });
    this.addCommand({ id: "space-cjk", name: t.spaceCJK, icon: "space", editorCallback: (e) => spaceEditor(e) });
    this.addCommand({ id: "open-calendar", name: t.openCalendar, icon: "calendar", callback: () => void this.openCalendar() });
    this.addRibbonIcon("calendar", t.openCalendar, () => void this.openCalendar());
    this.registerView(CALENDAR, (leaf) => new CalendarView(leaf, this));
    this.registerBasesView(KANBAN, {
      name: t.kanban, icon: "square-kanban", factory: (c, el) => new KanbanView(c, el),
      options: () => [
        { type: "property", key: "column", displayName: t.kanbanColumn, default: `note.${t.statusProp}`, filter: (p) => p.startsWith("note.") },
        { type: "text", key: "columns", displayName: t.kanbanColumns, default: t.colDefault },
      ],
    });
    this.app.workspace.onLayoutReady(() => {
      this.refreshButtons();
      this.decorateIcons();
      if (this.settings.homepage) void this.run(() => this.openHomepage());
    });
    this.registerEvent(this.app.workspace.on("layout-change", () => { this.refreshButtons(); this.refreshIcons(); }));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshIcons()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshIcons()));
    this.register(() => {
      for (const b of this.buttonEls) b.remove();
      activeDocument.querySelectorAll<HTMLElement>("[data-notewise-icon]").forEach((x) => setIconAttr(x, ""));
    });
  }

  // 主页开在主编辑区：安卓上 getLeaf(false) 可能拿到侧边抽屉里的面板
  mainLeaf(): WorkspaceLeaf {
    const ws = this.app.workspace;
    return ws.getMostRecentLeaf(ws.rootSplit) ?? ws.getLeaf(true);
  }

  async openHomepage() {
    const f = this.settings.homepage && this.app.metadataCache.getFirstLinkpathDest(this.settings.homepage, "");
    if (!f) throw new Error(t.noHome);
    const leaf = this.mainLeaf();
    await leaf.openFile(f);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  refreshButtons(reset = false) {
    if (reset) {
      for (const b of this.buttonEls) b.remove();
      this.buttonEls = [];
      this.buttoned = new WeakSet();
    }
    const buttons = parseButtons(this.settings.buttons).reverse();
    this.app.workspace.iterateRootLeaves((leaf) => {
      const v = leaf.view;
      if (!(v instanceof ItemView) || this.buttoned.has(v)) return;
      this.buttoned.add(v);
      // addAction 往最前面插，倒着加出来才是设置里的顺序
      for (const b of buttons) {
        this.buttonEls.push(v.addAction(b.icon, b.name, () => { this.host().commands.executeCommandById(b.id); }));
      }
    });
  }

  // 图标写成 data 属性，样式表里用 ::before 显示；文件列表会按需重建条目，所以盯着它的 DOM 变化
  decorateIcons() {
    const folders = parseIcons(this.settings.folderIcons);
    const iconOf = (path = "") => {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (!(f instanceof TFile)) return folders[path] ?? "";
      const v: unknown = this.app.metadataCache.getFileCache(f)?.frontmatter?.icon;
      return typeof v === "string" ? v : "";
    };
    for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
      const root = leaf.view.containerEl;
      root.querySelectorAll<HTMLElement>(".nav-file-title[data-path], .nav-folder-title[data-path]").forEach((el) =>
        setIconAttr(el.querySelector(".nav-file-title-content, .nav-folder-title-content"), iconOf(el.dataset.path)));
      if (!this.observed.has(root)) {
        this.observed.add(root);
        const mo = new MutationObserver(() => this.refreshIcons());
        mo.observe(root, { childList: true, subtree: true });
        this.register(() => mo.disconnect());
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const v = leaf.view;
      if (v instanceof MarkdownView && v.file) setIconAttr(v.containerEl.querySelector(".inline-title"), iconOf(v.file.path));
    }
  }

  dailyOptions() {
    const d = this.host().internalPlugins.getPluginById("daily-notes");
    return (d?.enabled && d.instance.options) || {};
  }

  dailyPath(d: Moment) {
    const o = this.dailyOptions();
    return normalizePath(`${o.folder ?? ""}/${d.format(o.format || "YYYY-MM-DD")}.md`);
  }

  // 日历点日期：有就打开，没有就确认后按日记模板新建（和日记核心插件一样替换 {{date}} {{title}} {{time}}）
  async openDaily(d: Moment) {
    const path = this.dailyPath(d);
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      if (!await confirm(this.app, `${t.createDaily}${d.format("YYYY-MM-DD")}?`)) return;
      const o = this.dailyOptions();
      const tpl = o.template ? this.app.metadataCache.getFirstLinkpathDest(o.template, "") : null;
      const raw = tpl ? await this.app.vault.read(tpl) : "";
      const title = d.format(o.format || "YYYY-MM-DD");
      const text = raw.replace(/{{\s*(date|title|time)\s*(?::(.*?))?}}/gi, (_m, k: string, fmt?: string) =>
        k.toLowerCase() === "time" ? day().format(fmt || "HH:mm") : k.toLowerCase() === "title" ? title : d.format(fmt || o.format || "YYYY-MM-DD"));
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      f = await this.createNote(path, text);
    }
    if (!(f instanceof TFile)) return;
    await this.mainLeaf().openFile(f);
    if (Platform.isPhone) this.app.workspace.rightSplit.collapse();
  }

  async openCalendar() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(CALENDAR)[0];
    if (!leaf) {
      const right = ws.getRightLeaf(false);
      if (!right) return;
      await right.setViewState({ type: CALENDAR, active: true });
      leaf = right;
    }
    await ws.revealLeaf(leaf);
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

export function parseButtons(text: string) {
  return text.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => x[0])
    .map(([id, icon, name]) => ({ id, icon: icon || "terminal", name: name || id }));
}

export function parseIcons(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of text.split("\n")) {
    const i = l.lastIndexOf("=");
    if (i > 0 && l.slice(i + 1).trim()) out[normalizePath(l.slice(0, i).trim())] = l.slice(i + 1).trim();
  }
  return out;
}

function setIconAttr(el: Element | null, icon: string) {
  if (!(el instanceof HTMLElement)) return;
  if (icon) el.dataset.notewiseIcon = icon;
  else delete el.dataset.notewiseIcon;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s/;
const indentOf = (s: string) => /^\s*/.exec(s)?.[0].length ?? 0;

// 把光标所在列表项（连同子项）和上/下一个同级项互换；返回要替换的行范围、新内容和光标新行号
export function moveListItem(lines: string[], line: number, dir: -1 | 1) {
  let start = line;
  while (start >= 0 && !LIST_ITEM.test(lines[start])) {
    if (!lines[start].trim()) return null;
    start--;
  }
  if (start < 0) return null;
  const ind = indentOf(lines[start]);
  const endOf = (s: number) => {
    let e = s;
    while (e + 1 < lines.length && lines[e + 1].trim() && indentOf(lines[e + 1]) > ind) e++;
    return e;
  };
  const sibling = (n: number) => n >= 0 && n < lines.length && LIST_ITEM.test(lines[n]) && indentOf(lines[n]) === ind;
  let a: number, b: number, c: number, d: number;
  if (dir < 0) {
    let p = start - 1;
    while (p >= 0 && lines[p].trim() && indentOf(lines[p]) > ind) p--;
    if (!sibling(p)) return null;
    [a, b, c, d] = [p, start - 1, start, endOf(start)];
  } else {
    const n = endOf(start) + 1;
    if (!sibling(n)) return null;
    [a, b, c, d] = [start, n - 1, n, endOf(n)];
  }
  const text = [...lines.slice(c, d + 1), ...lines.slice(a, b + 1)];
  return { from: a, to: d, text, line: line + (dir < 0 ? a - c : d - b) };
}

function moveItem(editor: Editor, dir: -1 | 1) {
  const cur = editor.getCursor();
  const lines = editor.getValue().split("\n");
  const r = moveListItem(lines, cur.line, dir);
  if (!r) return;
  editor.transaction({
    changes: [{ from: { line: r.from, ch: 0 }, to: { line: r.to, ch: lines[r.to].length }, text: r.text.join("\n") }],
    selection: { from: { line: r.line, ch: cur.ch } },
  });
}

// 中日韩文字和全角符号按 2 个宽度算，表格才对得齐
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}]/u;
const widthOf = (s: string) => [...s].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0);

function splitRow(row: string) {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "\\|"; i++; }
    else if (s[i] === "|") { cells.push(cur.trim()); cur = ""; }
    else cur += s[i];
  }
  if (cur.trim() || cells.length) cells.push(cur.trim());
  return cells;
}

export function formatTable(rows: string[]) {
  const cells = rows.map(splitRow);
  const isSep = (c: string[]) => c.length > 0 && c.every((x) => /^:?-+:?$/.test(x));
  const n = Math.max(...cells.map((c) => c.length));
  const w = Array.from({ length: n }, (_, i) =>
    Math.max(3, ...cells.filter((c) => !isSep(c)).map((c) => widthOf(c[i] ?? ""))));
  return cells.map((c) => "| " + w.map((wi, i) => {
    const x = c[i] ?? "";
    if (!isSep(c)) return x + " ".repeat(wi - widthOf(x));
    return (x.startsWith(":") ? ":" : "-") + "-".repeat(wi - 2) + (x.length > 1 && x.endsWith(":") ? ":" : "-");
  }).join(" | ") + " |");
}

function tableCommand(editor: Editor, addRow: boolean) {
  const cur = editor.getCursor();
  const isRow = (n: number) => n >= 0 && n < editor.lineCount() && editor.getLine(n).trim().startsWith("|");
  if (!isRow(cur.line)) return void new Notice(t.notInTable);
  let a = cur.line, b = cur.line;
  while (isRow(a - 1)) a--;
  while (isRow(b + 1)) b++;
  const rows: string[] = [];
  for (let i = a; i <= b; i++) rows.push(editor.getLine(i));
  let at = cur.line - a;
  // 在表头或分隔行上插入时，新行放到分隔行下面
  if (addRow) { at = Math.max(at, 1) + 1; rows.splice(at, 0, "|"); }
  const out = formatTable(rows);
  editor.transaction({
    changes: [{ from: { line: a, ch: 0 }, to: { line: b, ch: editor.getLine(b).length }, text: out.join("\n") }],
    selection: { from: { line: a + at, ch: addRow ? 2 : Math.min(cur.ch, out[at].length) } },
  });
}

const CJK = "⺀-⿿぀-ヿ㐀-䶿一-鿿豈-﫿";
const CJK_LATIN = new RegExp(`([${CJK}])([A-Za-z0-9])`, "g");
const LATIN_CJK = new RegExp(`([A-Za-z0-9])([${CJK}])`, "g");
// 跳过 frontmatter、代码、双链、链接地址和网址，免得改坏属性名和链接目标
const PROTECTED = /^---\n[\s\S]*?\n---(?:\n|$)|```[\s\S]*?```|`[^`\n]*`|\[\[[^\]]*\]\]|\]\([^)]*\)|https?:\/\/\S+/g;

export function spaceCJK(s: string) {
  const fix = (x: string) => x.replace(CJK_LATIN, "$1 $2").replace(LATIN_CJK, "$1 $2");
  let out = "", last = 0;
  for (const m of s.matchAll(PROTECTED)) {
    out += fix(s.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fix(s.slice(last));
}

function spaceEditor(editor: Editor) {
  if (editor.somethingSelected()) return editor.replaceSelection(spaceCJK(editor.getSelection()));
  const before = editor.getValue(), after = spaceCJK(before);
  if (after === before) return;
  const c = editor.getCursor();
  editor.setValue(after);
  editor.setCursor(c);
}

// Bases 看板视图：按一个笔记属性分列，拖动卡片（手机上用卡片的 ⋯ 菜单）就改这个属性
class KanbanView extends BasesView {
  type = KANBAN;

  constructor(controller: QueryController, private el: HTMLElement) { super(controller); }

  onDataUpdated() {
    const el = this.el;
    el.empty();
    el.addClass("notewise-kanban");
    const prop = this.config.getAsPropertyId("column") ?? (`note.${t.statusProp}` as const);
    if (!prop.startsWith("note.")) return void el.createEl("p", { text: t.kanbanNeedProp });
    const name = parsePropertyId(prop).name;
    const configured = this.config.get("columns");
    const cols = (typeof configured === "string" ? configured : t.colDefault).split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    const groups = new Map<string, BasesEntry[]>([["", []], ...cols.map((c): [string, BasesEntry[]] => [c, []])]);
    for (const e of this.data.data) {
      const v = e.getValue(prop);
      const k = v?.isTruthy() ? v.toString() : "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)?.push(e);
    }
    if (!groups.get("")?.length) groups.delete("");
    const shown = this.config.getOrder().filter((p) => p !== prop && p !== "file.name");
    const keys = [...groups.keys()];
    for (const [col, entries] of groups) {
      const colEl = el.createDiv({ cls: "notewise-col" });
      colEl.createDiv({ cls: "notewise-col-head", text: `${col || t.kanbanNone} · ${entries.length}` });
      colEl.addEventListener("dragover", (ev) => { ev.preventDefault(); colEl.addClass("is-over"); });
      colEl.addEventListener("dragleave", () => colEl.removeClass("is-over"));
      colEl.addEventListener("drop", (ev) => {
        ev.preventDefault();
        colEl.removeClass("is-over");
        const f = this.app.vault.getAbstractFileByPath(ev.dataTransfer?.getData("text/plain") ?? "");
        if (f instanceof TFile) void this.move(f, name, col);
      });
      for (const e of entries) {
        const card = colEl.createDiv({ cls: "notewise-card", attr: { draggable: "true" } });
        card.addEventListener("dragstart", (ev) => ev.dataTransfer?.setData("text/plain", e.file.path));
        const head = card.createDiv({ cls: "notewise-card-head" });
        head.createSpan({ cls: "notewise-card-title", text: e.file.basename })
          .addEventListener("click", () => void this.app.workspace.openLinkText(e.file.path, "", false));
        const more = head.createSpan({ cls: "notewise-card-move clickable-icon", attr: { "aria-label": t.moveCardTo } });
        setIcon(more, "more-horizontal");
        more.addEventListener("click", (ev) => {
          const menu = new Menu();
          for (const k of keys) {
            if (k !== col) menu.addItem((i) => i.setTitle(`${t.moveCardTo} ${k || t.kanbanNone}`).onClick(() => void this.move(e.file, name, k)));
          }
          menu.showAtMouseEvent(ev);
        });
        for (const p of shown) {
          const v = e.getValue(p);
          if (v?.isTruthy()) card.createDiv({ cls: "notewise-card-prop", text: `${this.config.getDisplayName(p)}: ${v.toString()}` });
        }
      }
      colEl.createDiv({ cls: "notewise-col-add", text: `+ ${t.newCard}` }).addEventListener("click", () =>
        void this.createFileForView(undefined, (fm: Record<string, unknown>) => { if (col) fm[name] = col; }));
    }
  }

  async move(file: TFile, name: string, col: string) {
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (col) fm[name] = col;
      else delete fm[name];
    });
  }
}

// 侧栏月历：有日记的日期带圆点，点日期打开或新建那天的日记
class CalendarView extends ItemView {
  private month = day().startOf("month");

  constructor(leaf: WorkspaceLeaf, private plugin: NoteWise) { super(leaf); }
  getViewType() { return CALENDAR; }
  getDisplayText() { return t.calendar; }
  getIcon() { return "calendar"; }

  async onOpen() {
    this.render();
    const rerender = () => this.render();
    this.registerEvent(this.app.vault.on("create", rerender));
    this.registerEvent(this.app.vault.on("delete", rerender));
    this.registerEvent(this.app.vault.on("rename", rerender));
    // 跨过零点后「今天」要跟着变
    this.registerInterval(window.setInterval(rerender, 10 * 60 * 1000));
  }

  render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("notewise-calendar");
    const head = el.createDiv({ cls: "notewise-cal-head" });
    const nav = (icon: string, label: string, fn: () => void) => {
      const b = head.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
      setIcon(b, icon);
      b.addEventListener("click", () => { fn(); this.render(); });
    };
    nav("chevron-left", "-1", () => { this.month = this.month.clone().subtract(1, "month"); });
    head.createSpan({ cls: "notewise-cal-title", text: this.month.format("YYYY-MM") });
    nav("chevron-right", "+1", () => { this.month = this.month.clone().add(1, "month"); });
    nav("calendar-check", t.today, () => { this.month = day().startOf("month"); });
    const grid = el.createDiv({ cls: "notewise-cal-grid" });
    const start = this.month.clone().startOf("week");
    for (let i = 0; i < 7; i++) grid.createDiv({ cls: "notewise-cal-dow", text: start.clone().add(i, "days").format("dd") });
    const today = day();
    for (let i = 0; i < 42; i++) {
      const d = start.clone().add(i, "days");
      const cell = grid.createDiv({ cls: "notewise-cal-day", text: String(d.date()) });
      if (d.month() !== this.month.month()) cell.addClass("is-other");
      if (d.isSame(today, "day")) cell.addClass("is-today");
      if (this.app.vault.getAbstractFileByPath(this.plugin.dailyPath(d))) cell.addClass("has-note");
      cell.addEventListener("click", () => void this.plugin.run(() => this.plugin.openDaily(d)));
    }
  }
}

class CommandPicker extends FuzzySuggestModal<Command> {
  constructor(app: App, private commands: Command[], private onPick: (c: Command) => void) { super(app); }
  getItems() { return this.commands; }
  getItemText(c: Command) { return c.name; }
  onChooseItem(c: Command) { this.onPick(c); }
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

    new Setting(el).setName(t.workflow).setHeading();
    new Setting(el).setName(t.homepage).setDesc(t.homepageDesc).addText((x) =>
      x.setValue(s.homepage).onChange(async (v) => { s.homepage = v.trim(); await this.plugin.saveSettings(); }));
    const area = (name: string, desc: string, key: "buttons" | "folderIcons", after: () => void) => {
      let input!: TextAreaComponent;
      const setting = new Setting(el).setName(name).setDesc(desc).addTextArea((x) => {
        input = x;
        x.inputEl.rows = 5;
        x.inputEl.addClass("notewise-setting-area");
        x.setValue(s[key]).onChange(async (v) => { s[key] = v; await this.plugin.saveSettings(); after(); });
      });
      return { setting, input };
    };
    const buttons = area(t.buttons, t.buttonsDesc, "buttons", () => this.plugin.refreshButtons(true));
    buttons.setting.addButton((b) => b.setButtonText(t.addButton).onClick(() => {
      new CommandPicker(this.app, this.plugin.host().commands.listCommands(), (c) => {
        s.buttons = `${s.buttons.trimEnd()}\n${c.id} | ${c.icon ?? "terminal"} | ${c.name}`.trimStart();
        buttons.input.setValue(s.buttons);
        void this.plugin.saveSettings().then(() => this.plugin.refreshButtons(true));
      }).open();
    }));
    area(t.folderIcons, t.folderIconsDesc, "folderIcons", () => this.plugin.refreshIcons());
  }
}
