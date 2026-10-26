// 10/26 회의 "버프 광고 돌릴 후보" 20건을 시트에 넣는다 (한 번만 실행)
//   node 안건넣기_버프광고.mjs <웹앱 /exec 주소>
// 비밀번호는 온라인팀_열쇠.txt 첫 줄에서 읽는다. 같은 제목이 이미 있으면 건너뜀
import fs from "node:fs";
const URL = process.argv[2]; if (!URL) { console.error("웹앱 주소를 주세요"); process.exit(1); }
const KEY = fs.readFileSync("온라인팀_열쇠.txt", "utf8").match(/비밀번호:\s*(\S+)/)[1];
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const get = async () => (await fetch(`${URL}?k=${encodeURIComponent(KEY)}&t=${Date.now()}`)).json();
const post = async (b) => { const r = await (await fetch(URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ k: KEY, ...b }) })).json(); if (!r.ok) throw new Error(JSON.stringify(r)); return r; };

const MEET = { 날짜: "2026-10-26", 제목: "버프 광고 돌릴 후보", 브랜드: "액상덕후", 참석: "", 메모: "온라인팀 첫 회의. 후보 20개를 놓고 상태를 정함" };
// [제목, 상태, 분야, 확인할 것, 메모]
const ITEMS = [
  ["네이버 블로그 (체험단)", "확정", "마케팅-바이럴", "", ""],
  ["네이버 파워링크", "확인필요", "마케팅-바이럴", "집행 가능 여부, 단가", ""],
  ["쓰레드 (쓰레드봇, 대표 쓰레드, 직원 쓰레드 댓글)", "후보", "마케팅-바이럴", "", "쓰레드봇 가능"],
  ["틱톡", "제외", "마케팅-바이럴", "", ""],
  ["메타 광고", "시도", "마케팅-바이럴", "", ""],
  ["커뮤니티 바이럴 (지식인, 커뮤니티, 게임계정, 네이버카페, 티스토리)", "후보", "마케팅-바이럴", "", ""],
  ["인스타그램 다계정 바이럴 (피드)", "후보", "마케팅-바이럴", "", ""],
  ["인스타그램 본계정 피드 (오피셜)", "후보", "콘텐츠", "", ""],
  ["카톡 주문, 시니어", "후보", "CRM", "", ""],
  ["CRM", "후보", "CRM", "", ""],
  ["후기형 바이럴 (멘솔 세다는 식의 솔직 후기, 멘솔 좋아하는 사람에게)", "후보", "마케팅-바이럴", "", "노구라윤서 사례처럼 까는 척 후기"],
  ["신뢰 요소 (직원 20명 고용 등)", "후보", "브랜딩", "", ""],
  ["토스쇼핑 방식", "후보", "기타", "", ""],
  ["SEO, GEO, 웹탭", "후보", "마케팅-바이럴", "", ""],
  ["당근 우회광고", "후보", "마케팅-바이럴", "가능 여부", ""],
  ["인플루언서", "후보", "마케팅-바이럴", "", ""],
  ["광고 랜딩페이지 (확실한 광고 소구점)", "후보", "콘텐츠", "", ""],
  ["오늘의집 UI UX, 배너만", "후보", "제품 디자인", "", ""],
  ["브랜딩 스토리", "후보", "브랜딩", "", ""],
  ["슬로건, 광고 메시지, 포지셔닝 (펩시 vs 코카콜라, 레딜은 타격감, 버프는 멘솔, 오븐스는 단맛)", "후보", "브랜딩", "", ""],
];
const D = await get(); if (!D.ok) throw new Error("열쇠 또는 주소 오류 " + JSON.stringify(D));
let m = D.meetings.find((x) => x.제목 === MEET.제목 && x.날짜 === MEET.날짜);
if (!m) { m = { id: uid("m_"), ...MEET }; await post({ type: "save", kind: "meeting", data: m }); console.log("회의 생성", m.id); } else console.log("회의 있음", m.id);
const have = new Set(D.items.filter((x) => x.회의id === m.id).map((x) => x.제목));
let n = D.items.filter((x) => x.회의id === m.id).length;
for (const [제목, 상태, 분야, 확인할것, 메모] of ITEMS) {
  if (have.has(제목)) { console.log("건너뜀", 제목); continue; }
  n++;
  await post({ type: "save", kind: "item", data: { id: uid("i_"), 회의id: m.id, 순서: n, 제목, 상태, 브랜드: "", 분야, 담당자: "", 시작: "", 마감: "", 메모, 확인할것 } });
  console.log("넣음", n, 제목);
  await new Promise((r) => setTimeout(r, 400));
}
console.log("끝");
