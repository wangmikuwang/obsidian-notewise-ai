# NoteWise AI

An AI writing assistant and note manager for Obsidian, inspired by Notion AI. Works with **DeepSeek** out of the box and with any OpenAI-compatible API (Qwen, Kimi, OpenAI, Ollama, …).

[中文说明](#中文说明)

## Features

**Ask AI** — right-click in the editor (or run the command) and pick an action. Results stream into a panel where you can edit them, refine with follow-up instructions, retry, then replace the selection or insert below.

- Continue writing
- Improve writing · Fix spelling & grammar · Make shorter / longer · Simplify
- Change tone (professional / casual / friendly)
- Translate to Chinese / English / Japanese
- Summarize · Find action items · Explain · Outline · Brainstorm
- Draft with AI… · Custom instruction…

Works on the selection, or the whole note when nothing is selected.

**On mobile (Android / iOS)**: open **Ask AI** from the note’s ⋮ menu (top right), since long-press opens the system text menu there. You can also add "Ask AI" to the mobile toolbar in Settings → Toolbar.

**Logging & review** — works with Daily notes, Templater folder templates and Spaced Repetition:

- **Quick log with AI** — type one sentence like "fasting glucose 6.2, took morning meds, weight 94.0". NoteWise reads the property fields from your daily note template and Templater folder templates, maps your sentence to them, shows what it will write, then fills today's notes (creating them through Daily notes / Templater so your templates still apply).
- **Review the last 7 days** — reads the notes in those folders from the past week and writes a short review (trends, habits kept or missed, suggestions). No medication advice.
- **Make flashcards** (Ask AI action) — turns the selection into cards using your Spaced Repetition separator and tag; "Insert & review" starts a review right away.

**Note management**

- **Ask your vault** — finds relevant notes and answers with `[[links]]`; save the answer as a note.
- **Summarize note into properties** — writes a `summary` property.
- **Auto-tag note** — prefers tags already used in your vault.
- **Suggest folder and move note** — asks before moving; links are updated.
- **Suggest related note links** — appends a "Related notes" list.

**Workflow** (Notion-style basics, so you need fewer plugins; desktop and mobile)

- **Homepage** — opens a chosen note on startup; "Open homepage" command.
- **Header buttons** — any commands as buttons at the top of every page (default: Home, Today, Quick log).
- **Icons** — an `icon` property (emoji) shows before a note's name in the file list and its title; folder icons are set in settings (`path = emoji`).
- **Kanban view for Bases** — pick "Kanban" in a `.base`; columns come from a note property (default `status`), drag cards (or use a card's ⋯ menu on mobile) to change it, "+ New card" creates a note in that column.
- **Move list item up / down** — moves the item with its children; add them to the mobile toolbar.
- **Format table / Insert table row** — aligns Markdown tables (CJK-width aware).
- **Add spaces between Chinese and English** — skips properties, code, links and URLs.
- **Calendar** — month view in the sidebar; dots mark days with a daily note, click a day to open or create it.

Requires Obsidian 1.10.2+ (Bases view API).

The UI follows Obsidian's language (Chinese or English).

## Setup

1. Get an API key, e.g. from <https://platform.deepseek.com>.
2. Settings → NoteWise AI: fill in API key. Defaults: base URL `https://api.deepseek.com`, model `deepseek-flash`.
3. Click **Test connection**.

For other providers, set the base URL (e.g. `https://dashscope.aliyuncs.com/compatible-mode/v1`, `http://localhost:11434/v1`) and model name.

## Privacy & network use

This plugin sends the text you run AI on (selected text, current note, for "Ask your vault" excerpts of matching notes, for linking the list of note titles, for quick log your sentence plus the template field names, and for the review the past week's notes in your log folders) to the API endpoint you configure. Nothing is sent until you run a command. Your API key is stored locally in `.obsidian/plugins/notewise-ai/data.json` — exclude it from sync if you share your vault. No telemetry.

## Development

```bash
pnpm install
pnpm build   # type-check + bundle main.js
pnpm lint    # eslint-plugin-obsidianmd
pnpm test    # offline self-check
DEEPSEEK_API_KEY=sk-... pnpm live   # real API test
```

Release: bump `version` in `manifest.json`, `package.json` and `versions.json`, then push an annotated tag with the same version (no `v`). GitHub Actions builds, checks, attests (`gh attestation verify main.js -R wangmikuwang/obsidian-notewise-ai`) and publishes the release.

---

## 中文说明

参考 Notion AI 的 Obsidian AI 插件，默认接入 **DeepSeek**，也支持任何 OpenAI 兼容接口（通义千问、Kimi、OpenAI、Ollama 等）。

**问 AI**：编辑器里右键 →「问 AI」，或命令面板运行。结果流式显示，可以手动修改、继续追问、重试，再选择替换选中内容或插入到下方。动作包括：续写、改进写作、修正拼写语法、缩短/扩写、简化、改语气、中/英/日翻译、总结、提取待办、解释、大纲、头脑风暴、AI 起草、自定义指令。没选中文字时作用于整篇笔记。

**手机（安卓 / iOS）**：在笔记右上角 ⋮ 菜单里点「问 AI」（手机上长按弹的是系统菜单）；也可以在 设置 → 工具栏 里把「问 AI」加到编辑工具栏。

**记录与回顾**（配合日记、Templater 文件夹模板、Spaced Repetition 闪卡插件）：

- **AI 快速记录**：输入一句话，如「空腹 6.2，二甲双胍早上吃了，体重 94.0」。NoteWise 读取日记模板和 Templater 文件夹模板里的属性字段，把这句话拆进对应字段，先给你确认，再写进今天的笔记（笔记不存在时通过日记 / Templater 新建，模板照常生效）。
- **AI 回顾最近 7 天**：读取这些文件夹里最近一周的笔记，写一段简短回顾（数据趋势、习惯完成情况、建议），不给用药建议。
- **生成闪卡**（问 AI 里的动作）：把选中内容转成闪卡，分隔符和标签跟随闪卡插件设置；「插入并复习」直接开始复习。

**笔记管理**：向知识库提问（带 `[[链接]]` 引用，可存成笔记）、总结写入 `summary` 属性、自动打标签（优先复用已有标签）、建议归档文件夹（确认后移动，自动更新链接）、推荐相关笔记链接。

**工作流**（Notion 式的常用功能，少装几个插件；电脑和手机都能用）：启动时打开主页；每个页面顶部的命令按钮（默认：主页、今天、快速记录）；笔记 `icon` 属性（emoji）和文件夹图标显示在文件列表和标题前；Bases 的「看板」视图（按笔记属性分列，默认「状态」，拖动卡片或用卡片的 ⋯ 菜单改列）；列表项连同子项上移/下移；表格对齐和插入行；中英文之间加空格（跳过属性、代码、链接）；侧栏月历（有日记的日期带圆点，点日期打开或新建）。需要 Obsidian 1.10.2 及以上。

**设置**：设置 → NoteWise AI 填写 API Key，点「测试连接」。默认接口 `https://api.deepseek.com`，模型 `deepseek-flash`。

**隐私**：只有在你运行命令时，才会把相关文本发送到你配置的接口（快速记录发送你输入的那句话和模板字段名，回顾发送记录文件夹里最近 7 天的笔记）。API Key 保存在本地 `.obsidian/plugins/notewise-ai/data.json`，同步库时注意排除。无任何统计上报。

## License

MIT
