# AI Notes（Obsidian 插件）

接入任意 OpenAI 兼容接口（DeepSeek / 通义千问 / Kimi / OpenAI / Ollama…）管理笔记。

命令（Ctrl+P 搜 "AI Notes"）：
- 总结当前笔记 → 写入 frontmatter `summary`
- 自动打标签 → 优先复用库里已有标签，合并进 `tags`
- 建议归档文件夹并移动 → 确认后移动，自动更新反向链接
- 推荐相关笔记链接 → 末尾追加 `## 相关笔记`
- 用 AI 处理选中文本 → 润色/翻译/改写，原地替换
- 向知识库提问（左侧机器人图标）→ 检索相关笔记后回答，可保存为笔记

## 开发
    pnpm install
    pnpm build   # 类型检查 + 打包出 main.js
    pnpm test    # 自检

安装：把 `main.js`、`manifest.json` 复制到 `<库>/.obsidian/plugins/ai-notes/`，在“第三方插件”里启用。
