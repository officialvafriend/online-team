/* 온라인팀 새 보드 (1단계): 이름+비밀번호 로그인, 오늘, 메신저(실시간), 전체 > 할 일, 회의
   데이터는 슈파베이스. 표 이름: meetings, items, logs, notes, recs. 보안 잠금(RLS)이 걸려 있어 로그인한 팀원만 읽고 씀 */
const sb = window.supabase.createClient(window.SB.url, window.SB.key, { auth: { persistSession: true, autoRefreshToken: true } });
const TEAM = [
  { name: "한섭", full: "정한섭", label: "한섭 이사님", email: "hanseob@online-team.invalid" },
  { name: "보혜", full: "안보혜", label: "보혜", email: "bohye@online-team.invalid" },
  { name: "시원", full: "김시원", label: "시원", email: "siwon@online-team.invalid" },
  { name: "진", full: "진", label: "진", email: "jin@online-team.invalid" },
];
const ACTIVE = ["확인필요", "시도", "확정"];
const S = { me: null, tab: "today", page: "", room: "", items: [], logs: [], notes: [], meetings: [], pick: "", err: "", loading: false, at: "" };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const stamp = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "");
const wide = () => matchMedia("(min-width:720px)").matches;
const pc = () => matchMedia("(min-width:1024px)").matches;
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const teamOf = (s) => TEAM.filter((p) => new RegExp(p.name).test(String(s || "")));
const hasMe = (s) => teamOf(s).some((p) => p.name === S.me.name);
const who = (a) => (TEAM.find((p) => p.name === a) || { label: a }).label;
const IC = {
  today: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M20.5 12a8 8 0 0 1-11.7 7.1L3.5 20.5l1.4-5A8 8 0 1 1 20.5 12z"/></svg>',
  all: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  clip: '<svg viewBox="0 0 24 24" style="width:var(--t3);height:var(--t3)"><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4L14.6 7.5"/></svg>',
};

/* ── 로그인 ── */
async function boot() {
  const { data } = await sb.auth.getSession();
  const email = data.session?.user?.email;
  S.me = TEAM.find((p) => p.email === email) || null;
  if (!S.me) return renderLogin();
  await loadAll();
  if (!ls.get("nb-init-" + S.me.name)) { rooms().forEach(markSeen); ls.set("nb-init-" + S.me.name, stamp()); } /* 처음 들어온 기기는 지금까지 메시지를 읽은 걸로 시작 */
  live(); render();
}
/* 이름을 누르면: 이미 비밀번호를 정한 사람은 비밀번호 칸, 처음인 사람은 "비밀번호 정하기" 칸 */
async function pick(name) {
  S.pick = name; S.err = ""; S.taken = null; renderLogin();
  const p = TEAM.find((x) => x.name === name), { data, error } = await sb.rpc("name_taken", { p_email: p.email });
  if (S.pick !== name) return;
  S.taken = error ? true : !!data; renderLogin();
}
function renderLogin() {
  const err = S.err ? `<p class="err">${esc(S.err)}</p>` : "";
  const form = !S.pick ? "" : S.taken === null ? `<p class="empty">확인하는 중이에요…</p>`
    : S.taken ? `<form class="pw" data-login><input type="password" name="pw" autocomplete="current-password" aria-label="비밀번호" placeholder="${esc(S.pick)}님 비밀번호"><button class="btn">들어가기</button>${err}</form>`
    : `<form class="pw" data-setup><p>${esc(S.pick)}님은 처음이에요. 앞으로 쓸 비밀번호를 정해 주세요</p><input type="password" name="pw" autocomplete="new-password" aria-label="새 비밀번호" placeholder="새 비밀번호 (8자 이상)"><input type="password" name="pw2" autocomplete="new-password" aria-label="새 비밀번호 한 번 더" placeholder="한 번 더"><button class="btn">비밀번호 정하고 들어가기</button>${err}</form>`;
  $("#app").innerHTML = `<div class="login"><h1>온라인팀 보드</h1><p>내 이름을 누르세요</p>
    <div class="who">${TEAM.map((p) => `<button data-pick="${p.name}" class="${S.pick === p.name ? "on" : ""}">${esc(p.label)}</button>`).join("")}</div>${form}</div>`;
  $(".pw input")?.focus();
}
async function login(pw) {
  const p = TEAM.find((x) => x.name === S.pick); S.err = "";
  const { error } = await sb.auth.signInWithPassword({ email: p.email, password: pw });
  if (error) { S.err = /Invalid login/i.test(error.message) ? "비밀번호가 맞지 않아요. 다시 넣어 주세요" : "들어가지 못했어요: " + error.message; return renderLogin(); }
  boot();
}
async function setup(pw, pw2) {
  const p = TEAM.find((x) => x.name === S.pick); S.err = "";
  if (pw.length < 8) { S.err = "비밀번호는 8자 이상으로 정해 주세요"; return renderLogin(); }
  if (pw !== pw2) { S.err = "두 칸의 비밀번호가 달라요. 다시 넣어 주세요"; return renderLogin(); }
  const { data, error } = await sb.auth.signUp({ email: p.email, password: pw });
  if (error) { S.err = /registered/i.test(error.message) ? "이미 비밀번호를 정한 이름이에요. 비밀번호로 들어가 주세요" : "정하지 못했어요: " + error.message; S.taken = /registered/i.test(error.message) ? true : S.taken; return renderLogin(); }
  if (!data.session) { const r = await sb.auth.signInWithPassword({ email: p.email, password: pw }); if (r.error) { S.err = "정했지만 들어가지 못했어요. 비밀번호로 다시 들어가 주세요"; S.taken = true; return renderLogin(); } }
  toast("비밀번호를 정했어요"); boot();
}

/* ── 데이터 ── */
async function loadAll() {
  S.loading = true;
  const [it, lg, nt, mt] = await Promise.all([
    sb.from("items").select("*"), sb.from("logs").select("*").order("at"), sb.from("notes").select("id,kind,author,to_who,status,brand,title,body,created_at,updated_at"), sb.from("meetings").select("*").order("date", { ascending: false }),
  ]);
  const bad = [it, lg, nt, mt].find((r) => r.error);
  if (bad) toast("불러오지 못했어요: " + bad.error.message);
  S.items = it.data || []; S.logs = lg.data || []; S.notes = nt.data || []; S.meetings = mt.data || []; S.loading = false; S.at = stamp();
}
let chan = null;
function live() {
  if (chan) return;
  chan = sb.channel("logs-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "logs" }, (p) => {
    if (S.logs.some((l) => l.id === p.new.id)) return;
    S.logs.push(p.new); if (p.new.author !== S.me.name && S.room !== p.new.target_id) toast(`${who(p.new.author)}: ${plain(p.new.body).slice(0, 30)}`);
    render();
  }).subscribe();
  document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible") { await loadAll(); render(); } });
}

/* ── 메시지 글 정리: 사진 표시, 답글, 고정 신호 ── */
const PIN = /^\[\[메시지고정:/;
function plain(b) {
  const s = String(b || ""), n = (s.match(/\[\[파일:/g) || []).length;
  const t = s.replace(/\[\[[^\]]+\]\]\n?/g, "").replace(/\s+/g, " ").trim();
  return [t, n ? `사진 ${n}장` : ""].filter(Boolean).join(" ");
}
function bodyHtml(b) {
  let s = String(b || ""), pre = "";
  const rep = s.match(/^\[\[메시지답글:([^\]]+)\]\]\n?/);
  if (rep) { const o = S.logs.find((l) => l.id === rep[1]); pre = `<span class="reply">${esc(o ? who(o.author) + ": " + plain(o.body).slice(0, 40) : "답글")}</span>`; s = s.slice(rep[0].length); }
  const files = [...s.matchAll(/\[\[파일:([^\]]+)\]\]/g)].map((m) => { try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))).name || "사진"; } catch (e) { return "사진"; } });
  s = s.replace(/\[\[파일:[^\]]+\]\]\n?/g, "").replace(/\[\[[^\]]+\]\]/g, "").trim();
  return pre + esc(s).replace(/\n/g, "<br>") + (s && files.length ? "<br>" : "") + files.map((n) => `<span class="att" title="사진은 다음 단계에서 열려요">${IC.clip}${esc(n)}</span>`).join("<br>");
}

/* ── 방 목록: 쓰레드 노트(1:1, 단체) ── */
function rooms() {
  return S.notes.filter((n) => n.kind === "쓰레드" && (!n.to_who || hasMe(n.to_who))).map((n) => {
    const mem = teamOf(n.to_who), dm = n.title === "1:1" && mem.length === 2, other = dm ? mem.find((p) => p.name !== S.me.name) || S.me : null;
    const msgs = S.logs.filter((l) => l.target_id === n.id && !PIN.test(l.body)), last = msgs[msgs.length - 1];
    return { id: n.id, dm, name: dm ? other.label : n.title, av: dm ? other.name[0] : (n.title || "방")[0], msgs, last, at: last ? last.at : n.created_at || "" };
  }).sort((a, b) => (a.at < b.at ? 1 : -1));
}
const seen = (id) => ls.get("nb-seen-" + S.me.name + "-" + id) || "";
const markSeen = (r) => { if (r.last) ls.set("nb-seen-" + S.me.name + "-" + r.id, r.last.at); };
const unreadOf = (r) => r.msgs.filter((l) => l.at > seen(r.id) && l.author !== S.me.name).length;

/* ── 그리기 ── */
function render() {
  if (!S.me) return renderLogin();
  const rs = rooms(), un = rs.reduce((a, r) => a + unreadOf(r), 0);
  const tabs = `<nav class="tabs" aria-label="메뉴">${[["today", "오늘"], ["chat", "메신저"], ["all", "전체"]].map(([k, n]) => `<button class="tab ${S.tab === k ? "on" : ""}" data-tab="${k}">${IC[k]}${n}${k === "chat" && un ? `<span class="badge">${un}</span>` : ""}</button>`).join("")}</nav>`;
  const main = S.tab === "today" ? todayHtml(rs) : S.tab === "chat" ? (S.room && !wide() ? roomHtml(S.room) : roomsHtml(rs)) : S.page === "todo" ? allTodoHtml() : S.page === "meet" ? meetHtml() : allHtml();
  const sideRoom = S.room || rs[0]?.id;
  const side = wide() && sideRoom ? `<aside class="side"><div class="group"><div class="side-head">${esc(rs.find((r) => r.id === sideRoom)?.name || "")} <small>실시간</small></div>${roomBody(sideRoom, true)}</div></aside>` : "";
  $("#app").innerHTML = `${pc() ? tabs : ""}<div class="pane">${main}</div>${side}${pc() ? "" : tabs}`;
  document.querySelectorAll(".chat.live").forEach((c) => (c.scrollTop = c.scrollHeight));
}
function rowItem(x, chip) {
  return `<button class="row" data-item="${x.id}"><div class="tx"><b>${esc(x.title)}</b><span>${esc([teamOf(x.owners).map((p) => p.name).join(", "), x.due_date ? "마감 " + md(x.due_date) + (x.due_time ? " " + x.due_time.replace(/^'/, "") : "") : ""].filter(Boolean).join(", "))}</span></div>${chip ? `<span class="chip ${chip[0]}">${esc(chip[1])}</span>` : ""}</button>`;
}
function dueChip(x) {
  const t = today();
  if (!x.due_date) return ["plan", x.status || "날짜 없음"];
  if (x.due_date < t) { const n = Math.round((new Date(t) - new Date(x.due_date)) / 864e5); return ["red", `${n}일 지남`]; }
  if (x.due_date === t) return ["today", "오늘 마감"];
  if (x.due_date === addDays(t, 1)) return ["today", "내일"];
  return ["plan", md(x.due_date)];
}
function sec(title, list, cls = "", mk = (x) => rowItem(x, dueChip(x))) {
  return list.length ? `<section class="sec ${cls}"><h2>${title}<em>${list.length}</em></h2><div class="group">${list.map(mk).join("")}</div></section>` : "";
}
function todayHtml(rs) {
  const t = today(), wk = addDays(t, 7), act = S.items.filter((x) => ACTIVE.includes(x.status));
  const mine = act.filter((x) => hasMe(x.owners)), others = act.filter((x) => !hasMe(x.owners) && teamOf(x.owners).length);
  const byDue = (a, b) => (a.due_date || "9") < (b.due_date || "9") ? -1 : 1;
  const now = mine.filter((x) => x.due_date && x.due_date <= t).sort(byDue);
  const week = mine.filter((x) => x.due_date && x.due_date > t && x.due_date <= wk).sort(byDue);
  const later = mine.filter((x) => !x.due_date || x.due_date > wk).sort(byDue);
  const wait = others.filter((x) => x.due_date && x.due_date <= addDays(t, 3)).sort(byDue);
  const calls = rs.filter((r) => unreadOf(r)).map((r) => ({ r, l: r.msgs.filter((l) => l.author !== S.me.name).pop() }));
  const doneWeek = S.items.filter((x) => x.status === "완료" && hasMe(x.owners) && (x.updated_at || "") >= addDays(t, -7)).length;
  const head = now.length + week.length;
  const d = new Date(), wd = "일월화수목금토"[d.getDay()];
  return `<div class="head"><div><h1>${head ? `오늘 볼 일 ${head}개예요` : "급한 일은 없어요"}</h1><p>${d.getMonth() + 1}월 ${d.getDate()}일 ${wd}요일, ${esc(S.me.label)}님</p></div><button class="link-btn" data-act="logout">나가기</button></div>
    ${sec("지금 할 것", now, "hot")}
    ${calls.length ? `<section class="sec"><h2>나를 기다리는 메시지<em>${calls.length}</em></h2><div class="group">${calls.map(({ r, l }) => `<button class="row" data-room="${r.id}"><div class="av">${esc(r.av)}</div><div class="tx"><b class="sm one">${esc(plain(l.body) || "사진")}</b><span>${esc(r.dm ? who(l.author) : who(l.author) + ", " + r.name)}, ${esc(l.at.slice(11))}</span></div><span class="badge">${unreadOf(r)}</span></button>`).join("")}</div></section>` : ""}
    ${sec("이번 주", week)}
    ${sec("다른 사람 마감 임박", wait)}
    ${sec("날짜 없거나 나중", later)}
    <section class="sec"><div class="group"><button class="row sm" data-go="todo"><div class="tx"><b>이번 주 끝낸 일</b></div><span class="chip done">${doneWeek}개</span>${IC.chev}</button></div></section>`;
}
function roomsHtml(rs) {
  return `<div class="head"><div><h1>메신저</h1></div></div><div class="group">${rs.map((r) => { const u = unreadOf(r); return `<button class="row" data-room="${r.id}"><div class="av">${esc(r.av)}</div><div class="tx"><b class="sm">${esc(r.name)}</b><span class="one">${r.last ? esc(who(r.last.author) + ": " + (plain(r.last.body) || "사진")) : "아직 메시지가 없어요"}</span></div>${u ? `<span class="badge">${u}</span>` : r.last ? `<span class="tm">${esc(r.last.at.slice(5, 10).replace("-", "/"))}</span>` : ""}</button>`; }).join("")}</div>`;
}
function roomBody(id, side) {
  const r = rooms().find((x) => x.id === id); if (!r) return '<p class="empty">방을 찾지 못했어요</p>';
  markSeen(r);
  /* 카톡처럼: 같은 사람이 5분 안에 이어 쓰면 이름은 첫 말풍선에만, 시간은 마지막 말풍선에만. 날짜가 바뀌면 날짜 줄 */
  const mins = (a) => Date.parse(a.replace(" ", "T")) / 6e4, list = r.msgs.slice(-80);
  const msgs = list.map((l, i) => {
    const p = list[i - 1], n = list[i + 1], mine = l.author === S.me.name;
    const first = !p || p.author !== l.author || mins(l.at) - mins(p.at) > 5 || p.at.slice(0, 10) !== l.at.slice(0, 10);
    const last = !n || n.author !== l.author || mins(n.at) - mins(l.at) > 5 || n.at.slice(0, 10) !== l.at.slice(0, 10);
    const day = !p || p.at.slice(0, 10) !== l.at.slice(0, 10) ? `<div class="day-line">${+l.at.slice(5, 7)}월 ${+l.at.slice(8, 10)}일</div>` : "";
    return `${day}<div class="msg ${mine ? "me" : /클로드/.test(l.author) ? "cl" : ""} ${first ? "" : "cont"}">${!mine && first ? `<small>${esc(who(l.author))}</small>` : ""}<div class="bub">${bodyHtml(l.body)}</div>${last ? `<small>${esc(l.at.slice(11))}</small>` : ""}</div>`;
  }).join("");
  return `<div class="chat ${side ? "live" : ""}">${msgs || '<p class="empty">첫 메시지를 보내 보세요</p>'}</div>
    <form class="compose" data-send="${id}"><input name="m" aria-label="메시지" placeholder="메시지" autocomplete="off"><button class="btn" aria-label="보내기">${IC.send}</button></form>`;
}
function roomHtml(id) {
  const r = rooms().find((x) => x.id === id);
  return `<div class="head"><div><button class="back" data-back="chat">${IC.back}메신저</button><h1>${esc(r ? r.name : "")}</h1></div></div>${roomBody(id, false)}`;
}
function allHtml() {
  const act = S.items.filter((x) => ACTIVE.includes(x.status)).length, wk = addDays(today(), -7);
  const rows = [["todo", "할 일", `진행 중 ${act}`], ["meet", "회의", `${S.meetings.length}개`], ["crm", "액상덕후 CRM", "다음 단계"], ["gal", "사진첩", "다음 단계"]];
  return `<div class="head"><div><h1>전체</h1></div></div><div class="group">${rows.map(([k, n, c]) => `<button class="row" data-go="${k}"><div class="tx"><b>${n}</b></div><span class="chip plan">${c}</span>${IC.chev}</button>`).join("")}</div>`;
}
function allTodoHtml() {
  const act = S.items.filter((x) => ACTIVE.includes(x.status));
  const byDue = (a, b) => (a.due_date || "9") < (b.due_date || "9") ? -1 : 1;
  return `<div class="head"><div><button class="back" data-back="all">${IC.back}전체</button><h1>할 일</h1></div></div>
    ${TEAM.map((p) => sec(p.label, act.filter((x) => teamOf(x.owners).some((q) => q.name === p.name)).sort(byDue))).join("")}
    ${sec("담당 없음", act.filter((x) => !teamOf(x.owners).length))}
    ${sec("끝낸 일", S.items.filter((x) => x.status === "완료").sort((a, b) => ((a.updated_at || "") < (b.updated_at || "") ? 1 : -1)).slice(0, 20), "", (x) => rowItem(x, ["done", "완료"]))}`;
}
function meetHtml() {
  return `<div class="head"><div><button class="back" data-back="all">${IC.back}전체</button><h1>회의</h1></div></div><div class="group">${S.meetings.map((m) => { const n = S.items.filter((x) => x.meeting_id === m.id).length; return `<button class="row" data-meet="${m.id}"><div class="tx"><b>${esc(m.title)}</b><span>${esc([md(m.date), m.brand, "안건 " + n + "개"].filter(Boolean).join(", "))}</span></div>${IC.chev}</button>`; }).join("") || '<p class="empty">회의가 없어요</p>'}</div>`;
}

/* ── 창, 알림 ── */
function openSheet(html) { $("#sheet").innerHTML = '<div class="grab"></div>' + html; $("#dim").classList.add("on"); $("#sheet").classList.add("on"); }
function closeSheet() { $("#dim").classList.remove("on"); $("#sheet").classList.remove("on"); }
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 2200); }
function itemSheet(x) {
  const logs = S.logs.filter((l) => l.target_id === x.id && !PIN.test(l.body));
  openSheet(`<h3>${esc(x.title)}</h3><p>${esc([teamOf(x.owners).map((p) => p.label).join(", ") || "담당 없음", x.due_date ? "마감 " + md(x.due_date) : "", x.status].filter(Boolean).join(", "))}</p>${x.memo ? `<p>${esc(x.memo)}</p>` : ""}
    ${logs.length ? `<div class="logs">${logs.map((l) => `<div class="msg ${l.author === S.me.name ? "me" : ""}"><small>${esc(who(l.author))}, ${esc(l.at.slice(5))}</small><div class="bub">${bodyHtml(l.body)}</div></div>`).join("")}</div>` : ""}
    <form data-comment="${x.id}"><textarea name="c" aria-label="댓글" placeholder="댓글 남기기"></textarea></form>
    <div class="btns"><button class="btn gray" data-comment-send="${x.id}">댓글 보내기</button>${x.status === "완료" ? `<button class="btn gray" data-x>닫기</button>` : `<button class="btn" data-done="${x.id}">완료</button>`}</div>`);
}

/* ── 누르기 ── */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-pick],[data-tab],[data-item],[data-room],[data-go],[data-back],[data-done],[data-x],[data-act],[data-meet],[data-comment-send],#dim"); if (!t) return;
  const d = t.dataset;
  if (d.pick) return pick(d.pick);
  if (t.id === "dim" || "x" in d) return closeSheet();
  if (d.act === "logout") { if (!confirm("이 기기에서 나갈까요?")) return; await sb.auth.signOut(); S.me = null; S.pick = ""; return renderLogin(); }
  if (d.tab) { S.tab = d.tab; S.page = ""; if (d.tab === "chat" && !wide()) S.room = ""; window.scrollTo(0, 0); return render(); }
  if (d.back) { if (d.back === "chat") S.room = ""; else S.page = ""; window.scrollTo(0, 0); return render(); }
  if (d.go) { if (["crm", "gal"].includes(d.go)) return toast("다음 단계에서 열려요"); S.tab = "all"; S.page = d.go; window.scrollTo(0, 0); return render(); }
  if (d.room) { closeSheet(); S.room = d.room; if (!wide()) S.tab = "chat"; window.scrollTo(0, 0); render(); if (!wide()) window.scrollTo(0, document.body.scrollHeight); return; }
  if (d.meet) { const m = S.meetings.find((x) => x.id === d.meet), its = S.items.filter((x) => x.meeting_id === m.id); return openSheet(`<h3>${esc(m.title)}</h3><p>${esc([md(m.date), m.attendees].filter(Boolean).join(", "))}</p><div class="group" style="margin-top:var(--s4);box-shadow:none;background:var(--bg)">${its.map((x) => `<div class="row"><div class="tx"><b class="sm">${esc(x.title)}</b><span>${esc(x.status)}</span></div></div>`).join("") || '<p class="empty">안건이 없어요</p>'}</div><div class="btns"><button class="btn gray" data-x>닫기</button><button class="btn" data-x>확인</button></div>`); }
  if (d.item) { const x = S.items.find((y) => y.id === d.item); if (x) itemSheet(x); return; }
  if (d.done) {
    const x = S.items.find((y) => y.id === d.done); closeSheet();
    const row = document.querySelector(`[data-item="${d.done}"]`); if (row) row.classList.add("leave");
    const { error } = await sb.from("items").update({ status: "완료", updated_at: stamp() }).eq("id", x.id);
    if (error) { toast("완료로 못 바꿨어요: " + error.message); row?.classList.remove("leave"); return; }
    x.status = "완료"; x.updated_at = stamp(); setTimeout(() => { render(); toast("완료했어요"); }, 280); return;
  }
  if (d.commentSend) {
    const ta = document.querySelector(`[data-comment="${d.commentSend}"] textarea`), v = ta.value.trim(); if (!v) return ta.focus();
    const row = { id: uid("l_"), target_id: d.commentSend, at: stamp(), author: S.me.name, body: v };
    const { error } = await sb.from("logs").insert(row); if (error) return toast("못 보냈어요: " + error.message);
    if (!S.logs.some((l) => l.id === row.id)) S.logs.push(row); itemSheet(S.items.find((y) => y.id === d.commentSend)); toast("댓글을 남겼어요");
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target;
  if ("login" in f.dataset) return login(f.pw.value);
  if ("setup" in f.dataset) return setup(f.pw.value, f.pw2.value);
  if (f.dataset.send) {
    const inp = f.querySelector("input"), v = inp.value.trim(); if (!v) return;
    const row = { id: uid("l_"), target_id: f.dataset.send, at: stamp(), author: S.me.name, body: v };
    inp.value = ""; S.logs.push(row); render(); document.querySelector(`[data-send="${row.target_id}"] input`)?.focus();
    const { error } = await sb.from("logs").insert(row);
    if (error) { S.logs = S.logs.filter((l) => l.id !== row.id); render(); toast("못 보냈어요: " + error.message); }
  }
});
addEventListener("resize", () => { clearTimeout(render._t); render._t = setTimeout(render, 150); });
boot();
