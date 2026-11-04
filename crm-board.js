/* 액상덕후 CRM 칸 (할 일 > 액상덕후 CRM): 보기 전용
   CRM 시트의 '할 일 목록', '발송 목록'만 받아서 오늘 할 일, 요약, 결과 목록, 달력으로 보여 줌.
   이름, 전화번호 명단은 서버(Apps Script crmGet)가 아예 보내지 않음.
   상태(F)와 결과(H~L: 보낸시간, 구매, 적립금사용, 회수, 메모)는 클로드 액상덕후 세션이 시트에 적음 */
const CRM = { d: null, busy: false, err: "", open: "", month: "", kind: {} };
const crmMD = (s) => String(s || "").slice(0, 5).replace("/", "-"); // '11/04(수)' → '11-04'
const crmNum = (v) => { const n = Number(String(v || "").replace(/[^\d.]/g, "")); return String(v || "").trim() && !isNaN(n) ? n : null; };
const crmWon = (n) => (n >= 10000 ? (Math.round(n / 1000) / 10).toLocaleString() + "만원" : n.toLocaleString() + "원");
const crmIsSend = (x) => String(x.인원 || "").trim() !== "" && /^\d\d-\d\d$/.test(x.날짜);
const crmSends = (x) => (CRM.d?.sends || []).filter((s) => crmMD(s.날짜) === x.날짜);
const crmMoney = (x) => { const m = String(x.내용 || "").match(/적립금 최대 ([\d,]+)원/); return m && m[1] !== "0" ? m[1] : ""; };

async function crmLoad() {
  if (CRM.busy) return; CRM.busy = true; CRM.err = "";
  try {
    if (DEMO) CRM.d = crmDemo();
    else {
      const r = await (await fetch(`${APPS_URL}?k=${encodeURIComponent(KEY)}&crm=1&t=${Date.now()}`, { cache: "no-store" })).json();
      if (!r.ok) throw new Error(r.detail || r.error || "fail");
      CRM.d = r;
    }
  } catch (e) { CRM.err = String(e.message || e); }
  CRM.busy = false;
  if (tab === "crm") render();
}
function crmHtml() {
  if (!CRM.d) {
    if (!CRM.busy && !CRM.err) setTimeout(crmLoad, 0); // 그리는 중에 다시 그리지 않게 한 박자 뒤에
    return CRM.err ? `<div class="empty">CRM 시트를 못 불러왔어요<br><small>${esc(CRM.err)}</small><br><button class="btn" data-crm="reload" style="margin-top:10px">다시 불러오기</button></div>` : `<div class="empty">CRM 시트를 불러오는 중이에요…</div>`;
  }
  const t = today(), tmd = t.slice(5), rows = CRM.d.todo || [];
  const mon = CRM.month || t.slice(0, 7), mm = mon.slice(5), inMon = rows.filter((x) => x.날짜.startsWith(mm + "-"));
  const todays = rows.filter((x) => x.날짜 === tmd && x.종류 !== "기타");
  const next = rows.filter((x) => crmIsSend(x) && x.날짜 > tmd)[0];
  const top = todays.length ? todays.map(crmToday).join("") : `<div class="crm-today"><div class="crm-th"><div><b>오늘은 보낼 문자가 없어요</b><span>${next ? `다음: ${+next.날짜.slice(0, 2)}/${+next.날짜.slice(3)}(${esc(next.요일)}) ${esc(next.할일)}` : "이번 달 일정이 끝났어요"}</span></div></div></div>`;
  return `<div class="crm">${top}
    <div class="crm-mhead"><button data-crm-mon="-1" aria-label="이전 달">‹</button><b>${+mon.slice(0, 4)}년 ${+mm}월</b><button data-crm-mon="1" aria-label="다음 달">›</button><button class="crm-re" data-crm="reload">↻ 다시 불러오기</button></div>
    ${crmSum(inMon)}
    <div class="crm-sec">${+mm}월 일정 ${inMon.length}개</div>
    ${inMon.length ? inMon.map(crmCard).join("") : `<div class="empty">이 달에는 CRM 시트에 일정이 없어요</div>`}
    <div class="crm-sec">달력 <small>일정을 누르면 위 목록이 열려요</small></div>
    ${crmCal(mon, inMon)}</div>`;
}

function crmToday(x) {
  const send = crmIsSend(x), money = crmMoney(x), st = x.상태 || "예정";
  const info = [x.인원 ? (crmNum(x.인원) || 0).toLocaleString() + "명" : "", money ? "적립금 최대 " + money + "원" : "", x.시간 ? x.시간 + " 발송" : ""].filter(Boolean).join(", ");
  const sends = send ? crmSends(x) : [], kinds = [...new Set(sends.map((s) => s.종류))], k = CRM.kind[x.r] || kinds[0] || "", s = sends.find((y) => y.종류 === k);
  return `<div class="crm-today"><div class="crm-th"><div><b>${st === "완료" ? "✓ " : ""}오늘 ${esc(x.할일)}</b><span>${esc(info || x.내용)}</span></div><span class="crm-st ${st === "완료" ? "ok" : st === "진행중" ? "ing" : ""}">${esc(st)}</span></div>
    ${kinds.length ? `<div class="crm-tb"><div class="crm-row"><span class="crm-lb">보낼 문자 ${kinds.length}종류</span><div class="crm-chs crm-flow">${kinds.map((n) => `<button class="chip ${n === k ? "on" : ""}" data-crm-kind="${x.r}|${esc(n)}">${esc(n)}</button>`).join("")}</div></div>
      <div class="crm-bub">${esc(String(s?.문자 || "").replace(/{이름}/g, "덕후"))}</div></div>` : ""}</div>`;
}

function crmSum(list) {
  const sends = list.filter(crmIsSend), done = sends.filter((x) => x.상태 === "완료");
  const sum = (k, l) => l.reduce((a, x) => a + (crmNum(x[k]) || 0), 0), has = (k) => list.some((x) => crmNum(x[k]) != null);
  const box = (t, v, e, later) => `<div><small>${t}</small><b class="${later ? "later" : ""}">${v}</b><em>${e}</em></div>`;
  return `<div class="crm-sum">
    ${box("보낸 날", `${done.length} / ${sends.length}일`, sends.length - done.length ? `남은 날 ${sends.length - done.length}일` : "다 보냈어요")}
    ${box("보낸 사람", `${sum("인원", done).toLocaleString()}명`, `계획 ${sum("인원", sends).toLocaleString()}명`)}
    ${has("구매") ? box("구매", `${sum("구매", list).toLocaleString()}명`, "적어 둔 것만 더함") : box("구매", "마감 뒤에 적어요", "", true)}
    ${has("회수") ? box("회수 완료", crmWon(sum("회수", list)), "") : box("회수 완료", "아직 없어요", "", true)}</div>`;
}

function crmCard(x) {
  const open = CRM.open === String(x.r), st = x.상태 || "예정";
  const nums = [["인원", x.인원 ? (crmNum(x.인원) || 0).toLocaleString() + "명" : ""], ["보낸 시간", x.시간], ["구매", x.구매], ["적립금 사용", x.적립금사용], ["회수", x.회수]].filter(([, v]) => String(v || "").trim());
  const kinds = {}; crmSends(x).forEach((s) => { kinds[s.종류] = (kinds[s.종류] || 0) + (crmNum(s.인원) || 0); });
  return `<div class="crm-card ${open ? "open" : ""}" id="crmCard${x.r}"><button class="crm-ch" data-crm-open="${x.r}" aria-expanded="${open}">
      <span class="crm-top"><span class="crm-d">${+x.날짜.slice(0, 2) || ""}/${+x.날짜.slice(3) || esc(x.날짜)} ${esc(x.요일)}</span><span class="crm-tt">${esc(x.할일)}</span><span class="crm-st ${st === "완료" ? "ok" : st === "진행중" ? "ing" : ""}">${esc(st)}</span><span class="crm-chev" aria-hidden="true">›</span></span>
      ${nums.length ? `<span class="crm-line">${nums.map(([k, v]) => `${k} <b>${esc(v)}</b>`).join('<i class="crm-sep"></i>')}</span>` : ""}</button>
    ${open ? `<div class="crm-more">
      ${x.내용 ? `<p class="crm-memo">${esc(x.내용)}</p>` : ""}
      ${Object.keys(kinds).length ? `<p class="crm-memo">${Object.entries(kinds).map(([k, n]) => `${esc(k)} ${n.toLocaleString()}명`).join(", ")}</p>` : ""}
      ${x.메모 ? `<p class="crm-memo">메모: ${esc(x.메모)}</p>` : ""}
      ${!x.구매 && !x.적립금사용 && !x.회수 && x.상태 !== "완료" ? `<p class="crm-memo crm-dim">결과는 보낸 뒤에 시트에 적히면 여기 나와요</p>` : ""}</div>` : ""}</div>`;
}

function crmCal(mon, list) {
  const y = +mon.slice(0, 4), m = +mon.slice(5) - 1, first = new Date(y, m, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const tmd = today().slice(5); let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m) break;
    const md2 = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, out = d.getMonth() !== m;
    const ev = out ? [] : list.filter((x) => x.날짜 === md2).map((x) => `<button class="crm-ev ${x.상태 === "완료" ? "done" : x.상태 === "진행중" ? "ing" : "wait"}" data-crm-open="${x.r}" aria-label="${esc(x.할일)} ${esc(x.상태)}">${x.상태 === "완료" ? "✓" : x.시간 ? `<span class="crm-nm">${esc(x.시간)} </span>` : ""}<span class="crm-nm">${x.상태 === "완료" ? " " : ""}${esc(x.종류)}</span><span class="crm-sh">${esc(String(x.종류).slice(0, 2))}</span></button>`);
    html += `<div class="crm-day ${out ? "out" : ""} ${md2 === tmd && !out ? "today" : ""}"><span class="n">${d.getDate()}</span>${ev.join("")}</div>`;
  }
  return `<div class="crm-cal"><div class="crm-wk h">${["월", "화", "수", "목", "금", "토", "일"].map((w) => `<div>${w}</div>`).join("")}</div><div class="crm-wk">${html}</div></div>`;
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-crm],[data-crm-mon],[data-crm-open],[data-crm-kind]"); if (!el) return;
  const ds = el.dataset, row = (v) => (CRM.d?.todo || []).find((x) => String(x.r) === String(v).split("|")[0]);
  if (ds.crm === "reload") { CRM.d = null; CRM.err = ""; render(); return; }
  if (ds.crmMon) { const c = CRM.month || today(), b = new Date(+c.slice(0, 4), +c.slice(5, 7) - 1 + +ds.crmMon, 1); CRM.month = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}`; render(); return; }
  if (ds.crmKind) { const [r, ...k] = ds.crmKind.split("|"); CRM.kind[r] = k.join("|"); render(); return; }
  if (ds.crmOpen) {
    const x = row(ds.crmOpen); if (!x) return;
    CRM.open = el.closest(".crm-cal") ? String(x.r) : CRM.open === String(x.r) ? "" : String(x.r); render();
    if (CRM.open) document.getElementById("crmCard" + x.r)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }
});

// 예시 화면(?demo=1)용: 실제 시트 모양 그대로, 명단 없이
function crmDemo() {
  const t = today().slice(5), y = (n) => { const d = new Date(today() + "T00:00:00"); d.setDate(d.getDate() + n); return { md: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, w: "일월화수목금토"[d.getDay()] }; };
  const R = (n, 종류, 할일, 인원, 상태, 내용, extra = {}) => ({ 날짜: y(n).md, 요일: y(n).w, 종류, 할일, 인원: String(인원), 상태, 내용, 시간: "", 구매: "", 적립금사용: "", 회수: "", 메모: "", ...extra });
  const todo = [R(-2, "적립금", "적립금 리마인드 3,000원", 1256, "완료", "적립금 리마인드 1256 / 적립금 최대 3,768,000원", { 시간: "15:00", 구매: "41", 적립금사용: "29명" }), R(-1, "선물하기", "선물하기 (빼빼로데이)", 1287, "완료", "선물하기 1287 / 적립금 최대 0원", { 시간: "18:00" }),
    R(0, "생애주기", "생애주기 문자", 1482, "예정", "이탈 방지(1회) 707, 첫구매 유도 380 / 적립금 최대 7,531,800원"), R(1, "신규액상", "신규액상 1 (과일멘솔)", 3741, "예정", "신규액상 3741 / 적립금 최대 0원"), R(3, "액상 추천", "액상 추천 (브랜드별)", 1182, "예정", "액상 추천 1182 / 적립금 최대 0원"), R(5, "적립금", "적립금 데이 10% 지급", "", "예정", "결제 주문 확인 → 결제금액 10% 적립")].map((x, i) => ({ ...x, r: i + 2 }));
  const sends = [{ 날짜: t, 종류: "신규 2회차", 인원: "34", 문자: "[액상덕후] {이름}님, 첫 주문 감사합니다! 받아보신 덕후 액상은 입에 잘 맞으셨나요? 두 번째 주문에 쓰시라고 5,000원 넣어뒀어요." }, { 날짜: t, 종류: "이탈 방지(1회)", 인원: "274", 문자: "[액상덕후] {이름}님, 지난번 주문하신 덕후 액상은 입에 잘 맞으셨을까요? 5,000원 적립금 넣어뒀어요." }, { 날짜: t, 종류: "첫구매 유도", 인원: "380", 문자: "[액상덕후] {이름}님, 액상덕후 가입 감사해요! 첫 주문에 쓰시라고 5,000원 넣어뒀어요." }];
  return { ok: true, todo, sends };
}
