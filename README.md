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

**Note management**

- **Ask your vault** — finds relevant notes and answers with `[[links]]`; save the answer as a note.
- **Summarize note into properties** — writes a `summary` property.
- **Auto-tag note** — prefers tags already used in your vault.
- **Suggest folder and move note** — asks before moving; links are updated.
- **Suggest related note links** — appends a "Related notes" list.

The UI follows Obsidian's language (Chinese or English).

## Setup

1. Get an API key, e.g. from <https://platform.deepseek.com>.
2. Settings → NoteWise AI: fill in API key. Defaults: base URL `https://api.deepseek.com`, model `deepseek-flash`.
3. Click **Test connection**.

For other providers, set the base URL (e.g. `https://dashscope.aliyuncs.com/compatible-mode/v1`, `http://localhost:11434/v1`) and model name.

## Privacy & network use

This plugin sends the text you run AI on (selected text, current note, or for "Ask your vault" excerpts of matching notes and for linking the list of note titles) to the API endpoint you configure. Nothing is sent until you run a command. Your API key is stored locally in `.obsidian/plugins/notewise-ai/data.json` — exclude it from sync if you share your vault. No telemetry.

## Development

```bash
pnpm install
pnpm build   # type-check + bundle main.js
pnpm lint    # eslint-plugin-obsidianmd
pnpm test    # offline self-check
DEEPSEEK_API_KEY=sk-... pnpm live   # real API test
```

---

## 中文说明

参考 Notion AI 的 Obsidian AI 插件，默认接入 **DeepSeek**，也支持任何 OpenAI 兼容接口（通义千问、Kimi、OpenAI、Ollama 等）。

**问 AI**：编辑器里右键 →「问 AI」，或命令面板运行。结果流式显示，可以手动修改、继续追问、重试，再选择替换选中内容或插入到下方。动作包括：续写、改进写作、修正拼写语法、缩短/扩写、简化、改语气、中/英/日翻译、总结、提取待办、解释、大纲、头脑风暴、AI 起草、自定义指令。没选中文字时作用于整篇笔记。

**笔记管理**：向知识库提问（带 `[[链接]]` 引用，可存成笔记）、总结写入 `summary` 属性、自动打标签（优先复用已有标签）、建议归档文件夹（确认后移动，自动更新链接）、推荐相关笔记链接。

**设置**：设置 → NoteWise AI 填写 API Key，点「测试连接」。默认接口 `https://api.deepseek.com`，模型 `deepseek-flash`。

**隐私**：只有在你运行命令时，才会把相关文本发送到你配置的接口。API Key 保存在本地 `.obsidian/plugins/notewise-ai/data.json`，同步库时注意排除。无任何统计上报。

## License

MIT
