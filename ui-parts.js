// 화면 부품: 진행 막대, 날짜 고르기(달력). 접었다 펴는 칸(아코디언)은 chat-photos.js의 회의 자료에서 씀

// 진행 막대: done / total
const progressHtml = (done, total, label) => {
  if (!total) return '';
  const pct = Math.round((done / total) * 100);
  return `<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="${esc(label || '진행')}"><i style="width:${pct}%"></i></div>`;
};

// 날짜 고르기: 눌러서 달력이 펴지고 날짜를 누르면 값이 들어감. 값은 숨은 input(id)에 YYYY-MM-DD로 저장
const DP_DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dpDay = (s, n) => ymd(new Date(new Date(s + 'T00:00:00').getTime() + n * 86400000));
const dpLabel = v => { const d = new Date(v + 'T00:00:00'); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(d) ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DP_DOW[d.getDay()]})` : '날짜 고르기'; };
function dpGrid(ym, value) {
  const [y, m] = ym.split('-').map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), t = today();
  let cells = ''; for (let i = 0; i < first.getDay(); i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const wk = new Date(y, m - 1, d).getDay();
    cells += `<button type="button" class="dp-d ${s === value ? 'on' : ''} ${s === t ? 'today' : ''} ${wk === 0 ? 'sun' : wk === 6 ? 'sat' : ''}" data-dp-day="${s}" aria-label="${m}월 ${d}일" aria-pressed="${s === value}">${d}</button>`;
  }
  return `<div class="dp-head"><button type="button" data-dp-nav="-1" aria-label="이전 달">‹</button><b>${y}년 ${m}월</b><button type="button" data-dp-nav="1" aria-label="다음 달">›</button></div><div class="dp-dow">${DP_DOW.map((d, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('')}</div><div class="dp-grid">${cells}</div><div class="dp-quick"><button type="button" data-dp-day="${t}">오늘</button><button type="button" data-dp-day="${dpDay(t, 1)}">내일</button><button type="button" data-dp-day="${dpDay(t, 7)}">다음 주</button></div>`;
}
function datePickerHtml(id, value) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(value || ''), base = ok ? value : today();
  return `<div class="dp" data-dp data-month="${base.slice(0, 7)}"><input type="hidden" id="${id}" value="${esc(ok ? value : '')}"><button type="button" class="in dp-btn" data-dp-toggle aria-expanded="false">${dpLabel(ok ? value : '')}</button><div class="dp-pop" hidden>${dpGrid(base.slice(0, 7), ok ? value : '')}</div></div>`;
}
document.addEventListener('click', e => {
  const toggle = e.target.closest('[data-dp-toggle]');
  if (toggle) { const pop = toggle.parentElement.querySelector('.dp-pop'); pop.hidden = !pop.hidden; toggle.setAttribute('aria-expanded', String(!pop.hidden)); return; }
  const nav = e.target.closest('[data-dp-nav]');
  if (nav) {
    const dp = nav.closest('[data-dp]'), [y, m] = dp.dataset.month.split('-').map(Number), n = new Date(y, m - 1 + Number(nav.dataset.dpNav), 1);
    dp.dataset.month = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    dp.querySelector('.dp-pop').innerHTML = dpGrid(dp.dataset.month, dp.querySelector('input').value); return;
  }
  const day = e.target.closest('[data-dp-day]');
  if (day) {
    const dp = day.closest('[data-dp]'), v = day.dataset.dpDay, input = dp.querySelector('input'), pop = dp.querySelector('.dp-pop'), btn = dp.querySelector('[data-dp-toggle]');
    input.value = v; btn.textContent = dpLabel(v); btn.setAttribute('aria-expanded', 'false');
    dp.dataset.month = v.slice(0, 7); pop.innerHTML = dpGrid(dp.dataset.month, v); pop.hidden = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
