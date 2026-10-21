const assert = require("assert");
const obsidian = require("obsidian");
obsidian.requestUrl = async (r) => { globalThis.lastReq = r; return { status: 200, text: "", json: { choices: [{ message: { content: ' ["a","b"] ' } }] } }; };
const { default: NoteWise, parseJSON, pickLog, moveListItem, formatTable, spaceCJK, parseButtons, parseIcons } = require("./main.js");
(async () => {
  // 列表项连同子项一起和同级项互换
  const list = ["- a", "  - a1", "- b", "  - b1", "  - b2", "- c"];
  const apply = (r) => [...list.slice(0, r.from), ...r.text, ...list.slice(r.to + 1)];
  let r = moveListItem(list, 2, -1);
  assert.deepStrictEqual(apply(r), ["- b", "  - b1", "  - b2", "- a", "  - a1", "- c"]);
  assert.strictEqual(r.line, 0);
  r = moveListItem(list, 2, 1);
  assert.deepStrictEqual(apply(r), ["- a", "  - a1", "- c", "- b", "  - b1", "  - b2"]);
  assert.strictEqual(r.line, 3);
  assert.strictEqual(moveListItem(list, 0, -1), null);
  assert.strictEqual(moveListItem(list, 1, -1), null);
  assert.deepStrictEqual(apply(moveListItem(list, 4, -1)), ["- a", "  - a1", "- b", "  - b2", "  - b1", "- c"]);

  assert.deepStrictEqual(formatTable(["|上海话|意思|", "|:-|-:|", "|侬好|你好|", "|", "|a\\|b|x|"]), [
    "| 上海话 | 意思 |",
    "| :----- | ---: |",
    "| 侬好   | 你好 |",
    "|        |      |",
    "| a\\|b   | x    |",
  ]);

  assert.strictEqual(spaceCJK("---\nHRT用药: true\n---\n用DeepSeek写了3篇，见[[HRT 管理]]和`a中b`、https://x.com/中"),
    "---\nHRT用药: true\n---\n用 DeepSeek 写了 3 篇，见[[HRT 管理]]和`a中b`、https://x.com/中");
  assert.deepStrictEqual(parseButtons("daily-notes | calendar | 今天\n\nnotewise-ai:review"),
    [{ id: "daily-notes", icon: "calendar", name: "今天" }, { id: "notewise-ai:review", icon: "terminal", name: "notewise-ai:review" }]);
  assert.deepStrictEqual(parseIcons("02 健康/ = 🩺\na=b = ✨\n坏行"), { "02 健康": "🩺", "a=b": "✨" });

  const targets = [{ folder: "01 每日打卡", fields: { 空腹血糖: null, 二甲双胍早: false } }, { folder: "02 健康/体脂秤记录", fields: { 体重: null } }];
  assert.deepStrictEqual(pickLog({ "01 每日打卡": { 空腹血糖: 6.2, 二甲双胍早: "true", 瞎编: 1 }, "02 健康/体脂秤记录": { 体重: "" }, 别处: { x: 1 } }, targets),
    [{ target: targets[0], values: { 空腹血糖: 6.2, 二甲双胍早: true } }]);
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
