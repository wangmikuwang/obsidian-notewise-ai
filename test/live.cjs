// 真实接口测试：DEEPSEEK_API_KEY=sk-... pnpm live
const assert = require("assert");
const { default: NoteWise, parseJSON } = require("./main.js");
(async () => {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("set DEEPSEEK_API_KEY");
  const p = new NoteWise({});
  p.settings = { baseUrl: "https://api.deepseek.com", apiKey: key, model: process.env.MODEL || "deepseek-chat", maxChars: 12000 };

  const tags = parseJSON(await p.chat([
    { role: "system", content: "Pick 1-5 tags for the note. Output only a JSON array of strings." },
    { role: "user", content: "今天学习了 Python 的 asyncio 和协程，写了一个爬虫。" },
  ]));
  assert(Array.isArray(tags) && tags.length > 0);
  console.log("chat/json ok:", tags);

  let updates = 0;
  const out = await p.stream([
    { role: "system", content: "Translate into English. Output only the translation." },
    { role: "user", content: "Text:\n今天天气很好，我们去公园散步吧。" },
  ], () => updates++, new AbortController().signal);
  assert(/park/i.test(out) && updates > 1, `stream: ${updates} updates, "${out}"`);
  console.log(`stream ok (${updates} chunks):`, out);

  const ac = new AbortController();
  const aborted = p.stream([{ role: "user", content: "写一篇 2000 字的文章" }], () => ac.abort(), ac.signal);
  await assert.rejects(aborted);
  console.log("abort ok");

  await assert.rejects(new NoteWise({}).chat.call(Object.assign(new NoteWise({}), { settings: { ...p.settings, apiKey: "sk-bad" } }), [{ role: "user", content: "hi" }]), /401/);
  console.log("bad key ok");
})().catch((e) => { console.error(e); process.exit(1); });
