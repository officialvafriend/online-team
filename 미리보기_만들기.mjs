// 화면(index.html)에 가장 최근 시트 백업을 넣어 미리보기.html 을 만든다. 미리보기는 시트에 저장하지 않음
//   node 시트백업.mjs && node 미리보기_만들기.mjs
import fs from "node:fs";
const f = fs.readdirSync("백업").filter((n) => n.startsWith("시트백업_")).sort().pop();
let data = fs.readFileSync(`백업/${f}`, "utf8");
// 미리보기 창은 큰 파일(약 50만 자)을 못 열어서, 너무 크면 받아쓴 글(원문, 분류)만 빼고 넣음
if (Buffer.byteLength(data) > 250000) { const d = JSON.parse(data); d.recs.forEach((r) => { r.원문 = "[]"; r.분류 = "[]"; }); data = JSON.stringify(d); }
const html = fs.readFileSync("index.html", "utf8").replace("<script>\n", `<script>window.PREVIEW_DATA = ${data.replace(/</g, "\\u003c")};</script>\n<script>\n`);
fs.writeFileSync("미리보기.html", html);
console.log("미리보기.html <-", f);
