const assert = require("assert");
const obsidian = require("obsidian");
obsidian.requestUrl = async (r) => { globalThis.lastReq = r; return { status: 200, text: "", json: { choices: [{ message: { content: ' ["a","b"] ' } }] } }; };
const { default: NoteWise, parseJSON } = require("./main.js");
(async () => {
  assert.deepStrictEqual(parseJSON('好的：```json\n{"folder":"读书","reason":"x"}\n```'), { folder: "读书", reason: "x" });
  const files = [
    { basename: "机器学习笔记", text: "梯度下降 python" },
    { basename: "菜谱", text: "红烧肉" },
  ];
  const p = new NoteWise({ vault: { getMarkdownFiles: () => files, cachedRead: async (f) => f.text } });
  p.settings = { baseUrl: "https://x/v1/", apiKey: "k", model: "m", maxChars: 1000 };
  const hits = await p.search("机器学习怎么做梯度下降", 3);
  assert.deepStrictEqual(hits.map((h) => h.file.basename), ["机器学习笔记"]);
  assert.strictEqual(await p.chat([{ role: "user", content: "hi" }]), '["a","b"]');
  assert.strictEqual(lastReq.url, "https://x/v1/chat/completions");
  console.log("ok");
})().catch((e) => { console.error(e); process.exit(1); });
