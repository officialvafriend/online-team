// 사진첩: 구글 드라이브 공유 링크(파일·폴더)를 노트(종류 "사진첩")로 저장하고 애플 사진 앱처럼 보여 줌
let galSel = '', galMode = 'albums', galList = [], gv = null;
const galFolders = {}; // 폴더 id → { state: 'loading'|'ok'|'fail'|'old', files, name, error }
try { galSel = localStorage.getItem('ot-gal') || ''; galMode = localStorage.getItem('ot-gal-mode') === 'all' ? 'all' : 'albums'; } catch {}
const galStore = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const galAlbums = () => D.notes.filter(n => n.종류 === '사진첩').sort((a, b) => (b.만든시각 || '').localeCompare(a.만든시각 || ''));
const galInAlbum = () => !!(D && galSel && galAlbums().some(n => n.id === galSel));
// 링크 한 줄 → { kind: 'file'|'folder', id }
function galParse(line) {
  const s = String(line || '').trim(); if (!s) return null;
  let m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/embeddedfolderview\?(?:[^#]*&)?id=([\w-]{10,})/);
  if (m) return { kind: 'folder', id: m[1] };
  m = s.match(/\/file\/d\/([\w-]{10,})/) || s.match(/\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  if (m) return { kind: 'file', id: m[1] };
  return /^[\w-]{25,}$/.test(s) ? { kind: 'file', id: s } : null;
}
const galLinks = n => String(n.내용 || '').split(/\s+/).map(galParse).filter(Boolean);
const galThumb = (id, w = 640) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
const galBig = id => `https://lh3.googleusercontent.com/d/${id}=w2560`;
// 앨범의 사진 목록. 폴더는 서버에서 받아 와야 하므로 처음엔 비어 있을 수 있음
function galImages(n) {
  const out = [], seen = new Set(), add = f => { if (!seen.has(f.id)) { seen.add(f.id); out.push({ ...f, album: n.제목 || '이름 없는 앨범' }); } };
  for (const l of galLinks(n)) {
    if (l.kind === 'file') add({ id: l.id, name: '' });
    else { const f = galFolders[l.id]; if (f?.state === 'ok') f.files.forEach(add); else if (!f) galFetch(l.id); }
  }
  return out;
}
async function galFetch(id, force) {
  if (galFolders[id] && !force) return;
  galFolders[id] = { state: 'loading' };
  if (DEMO) { galFolders[id] = { state: 'ok', name: '예시 폴더', files: [] }; return; }
  try {
    const r = await post({ type: 'driveFolder', id });
    galFolders[id] = { state: 'ok', name: r.name || '', files: (r.files || []).map(f => ({ id: f.id, name: f.name || '', shared: f.shared })) };
  } catch (e) {
    const msg = String(e.message || e);
    // 서버에 사진첩 코드가 아직 없으면 type 오류가 남 → 드라이브 기본 폴더 보기로 대신 보여 줌
    galFolders[id] = { state: msg === 'type' || msg === 'kind' ? 'old' : 'fail', error: msg };
  }
  if (tab === 'gal' && !gv) render();
}
function galCount(n) {
  const links = galLinks(n), files = links.filter(l => l.kind === 'file').length;
  return links.every(l => l.kind === 'file' || galFolders[l.id]?.state === 'ok') ? `${galImages(n).length}` : files ? `${files}+` : '폴더';
}
// 사진 크기 단계: 0 크게 · 1 보통 · 2 작게 (기기마다 기억)
const GAL_COLS = { phone: [2, 3, 5], pc: [3, 5, 8] };
const galLevel = () => { let v = 1; try { v = +(localStorage.getItem('ot-gal-zoom') ?? 1); } catch {} return Math.max(0, Math.min(2, v || 0)); };
const galCols = () => GAL_COLS[isPC() ? 'pc' : 'phone'][galLevel()];
const ICON_G = {
  plus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  drive: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  photo: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 3.5 3.5L15 14l5 5"/></svg>',
};
// 사진 칸: galList(지금 화면 순서) 안의 번호로 뷰어를 엶
const galTile = (i, k) => `<button class="gal-tile" data-gi="${k}" aria-label="${esc(i.name || '사진 ' + (k + 1))} 크게 보기"><img src="${galThumb(i.id)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('gal-ok')" onerror="this.closest('.gal-tile').classList.add('broken')"></button>`;
function galHtml() {
  const albums = galAlbums(), sel = albums.find(n => n.id === galSel);
  if (sel) return galAlbumHtml(sel);
  galList = [];
  const bar = `<div class="gal-bar"><div class="seg gal-seg" role="tablist"><button role="tab" aria-selected="${galMode === 'albums'}" class="${galMode === 'albums' ? 'on' : ''}" data-gal-mode="albums">앨범</button><button role="tab" aria-selected="${galMode === 'all'}" class="${galMode === 'all' ? 'on' : ''}" data-gal-mode="all">모든 사진</button></div><button class="gal-plus" data-gal-new aria-label="드라이브 사진 넣기">${ICON_G.plus}</button></div>`;
  if (!albums.length) return `${bar}<div class="gal-empty">${ICON_G.photo}<b>사진첩이 비어 있어요</b><p>구글 드라이브 공유 링크를 넣으면 여기서 바로 사진을 넘겨 볼 수 있어요.</p><button class="btn" data-gal-new>드라이브 링크 넣기</button></div>`;
  if (galMode === 'all') {
    const secs = albums.map(n => [n, galImages(n)]).filter(([, l]) => l.length);
    return `${bar}${secs.map(([n, l]) => `<section class="gal-sec"><button class="gal-sec-h" data-gal="${n.id}"><b>${esc(n.제목 || '이름 없는 앨범')}</b><small>${esc([n.브랜드, (n.만든시각 || '').slice(0, 10).replace(/-/g, '. ')].filter(Boolean).join(' · '))}</small><span class="gal-sec-go">${ICON_G.next}</span></button><div class="gal-grid gal-bleed" style="--gal-cols:${galCols()}">${l.map(i => galTile(i, galList.push(i) - 1)).join('')}</div></section>`).join('') || '<div class="gal-empty"><b>아직 펼쳐 볼 사진이 없어요</b><p>폴더 사진을 불러오는 중이거나 공유가 꺼져 있어요.</p></div>'}`;
  }
  return `${bar}<div class="gal-albums">${albums.map(n => { const c = galImages(n)[0]; return `<button class="gal-album" data-gal="${n.id}"><span class="gal-cover">${c ? `<img src="${galThumb(c.id, 480)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('gal-ok')" onerror="this.remove()">` : ICON_G.photo}</span><b>${esc(n.제목 || '이름 없는 앨범')}</b><small>${esc(galCount(n))}</small></button>`; }).join('')}</div>`;
}
function galAlbumHtml(n) {
  const links = galLinks(n), imgs = galImages(n), folders = links.filter(l => l.kind === 'folder');
  galList = imgs;
  const notes = folders.map(l => {
    const f = galFolders[l.id];
    if (!f || f.state === 'loading') return '<div class="gal-note">폴더 사진을 불러오는 중…</div>';
    if (f.state === 'old') return `<div class="gal-note">폴더 안 사진을 바로 펼치려면 서버 업데이트가 필요해요. 그동안 드라이브 화면으로 보여 드려요.</div><iframe class="gal-frame" src="https://drive.google.com/embeddedfolderview?id=${l.id}#grid" title="드라이브 폴더" loading="lazy"></iframe>`;
    if (f.state === 'fail') return `<div class="gal-note warn">폴더를 열지 못했어요. 링크가 맞는지, 공유가 <b>링크가 있는 모든 사용자</b>인지 확인해 주세요. <button class="gal-retry" data-gal-retry="${l.id}">다시 불러오기</button></div>`;
    if (!f.files.length) return '<div class="gal-note">이 폴더에는 사진이 없어요.</div>';
    const closed = f.files.filter(x => x.shared === false).length;
    return closed ? `<div class="gal-note warn">사진 ${closed}장이 비공개라 다른 사람에게는 안 보일 수 있어요. 폴더 공유를 <b>링크가 있는 모든 사용자</b>로 바꿔 주세요.</div>` : '';
  }).join('');
  const lv = galLevel();
  return `<div class="gal-nav"><button class="gal-back" data-gal="">${ICON_G.back}사진첩</button><div class="gal-tools"><button class="gal-tool" data-gal-zoom="1" aria-label="사진 작게 보기" ${lv >= 2 ? 'disabled' : ''}>${ICON_G.minus}</button><button class="gal-tool" data-gal-zoom="-1" aria-label="사진 크게 보기" ${lv <= 0 ? 'disabled' : ''}>${ICON_G.plus}</button><button class="gal-tool" data-gal-edit="${n.id}" aria-label="앨범 메뉴">${ICON_G.more}</button></div></div>
    <h2 class="gal-title">${esc(n.제목 || '이름 없는 앨범')}</h2><div class="gal-sub">${esc([imgs.length ? `사진 ${imgs.length}장` : '', n.브랜드, PNAME(n.작성자)].filter(Boolean).join(' · '))}</div>
    ${notes}
    ${imgs.length ? `<div class="gal-grid gal-bleed" style="--gal-cols:${galCols()}">${imgs.map(galTile).join('')}</div>` : ''}`;
}
function galAddSheet() {
  openSheet(`<h3>드라이브 사진 넣기</h3><p class="caption">사진이나 폴더의 공유 링크를 붙여 넣어요. 여러 개는 줄을 바꿔 넣어요.</p>
    <div class="lbl">공유 링크</div><textarea class="in" id="galLink" rows="3" placeholder="https://drive.google.com/drive/folders/…"></textarea>
    <div class="row2"><div><div class="lbl">앨범 이름 <small>(비우면 폴더 이름)</small></div><input class="in" id="galTitle" maxlength="60" placeholder="예) VUFF 패키지 촬영"></div>
      <div><div class="lbl">브랜드 <small>(선택)</small></div><select class="in" id="galBrand">${['', ...BRANDS].map(b => `<option value="${b}">${b || '없음'}</option>`).join('')}</select></div></div>
    <details class="gal-how"><summary>공유 링크 만드는 법</summary><ol><li>구글 드라이브에 사진이나 폴더를 올려요.</li><li>마우스 오른쪽 버튼 → <b>공유</b> → 일반 액세스를 <b>링크가 있는 모든 사용자</b>로 바꿔요.</li><li><b>링크 복사</b>를 눌러 여기 붙여 넣어요.</li></ol></details>
    <div class="btns"><button class="btn gray" data-x style="flex:0 0 96px">닫기</button><button class="btn" data-gal-add>넣기</button></div>`);
  setTimeout(() => $('#galLink')?.focus(), 50);
}
function galEditSheet(n) {
  const first = galLinks(n)[0], open = first ? (first.kind === 'folder' ? `https://drive.google.com/drive/folders/${first.id}` : `https://drive.google.com/file/d/${first.id}/view`) : '';
  openSheet(`<h3>${esc(n.제목 || '이름 없는 앨범')}</h3>${open ? `<a class="btn sec2 gal-open" href="${open}" target="_blank" rel="noopener">드라이브에서 열기 ↗</a>` : ''}
    <div class="lbl">앨범 이름</div><input class="in" id="galETitle" maxlength="60" value="${esc(n.제목)}">
    <div class="lbl">브랜드</div><select class="in" id="galEBrand">${['', ...BRANDS].map(b => `<option value="${b}" ${n.브랜드 === b ? 'selected' : ''}>${b || '없음'}</option>`).join('')}</select>
    <div class="lbl">드라이브 링크 <small>(한 줄에 하나)</small></div><textarea class="in" id="galELink" style="min-height:120px">${esc(n.내용)}</textarea>
    <div class="btns"><button class="btn red" data-gal-del="${n.id}" style="flex:0 0 96px">지우기</button><button class="btn" data-gal-save="${n.id}">저장</button></div>`);
}
function galReadLinks(text) {
  const lines = String(text || '').split(/\s+/).filter(Boolean), seen = new Set();
  const ok = lines.filter(l => { const p = galParse(l); if (!p || seen.has(p.id)) return false; seen.add(p.id); return true; });
  return { ok, bad: lines.filter(l => !galParse(l)).length };
}
const galOpenAlbum = id => { galSel = id; galStore('ot-gal', id); render(); scrollTo(0, 0); };

// ── 뷰어: 누른 칸에서 사진이 커지며 열리고, 손가락을 따라 넘어가고, 아래로 끌면 칸으로 돌아감 ──
window.addEventListener('popstate', e => { if (gv) { e.stopImmediatePropagation(); gv.close(true); } }, true);
function galView(list, start, tile) {
  if (gv) gv.close(true);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, GAP = 24, EASE = 'cubic-bezier(.2,.85,.25,1)';
  const el = document.createElement('div');
  el.className = 'gv opening'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '사진 보기');
  el.innerHTML = `<div class="gv-bg"></div><div class="gv-stage"></div>
    <header class="gv-top"><button class="gv-btn" data-gv="close" aria-label="닫기">${isPC() ? ICON_G.close : ICON_G.back}</button><div class="gv-meta"><b></b><small aria-live="polite"></small></div><a class="gv-btn" data-gv="drive" target="_blank" rel="noopener" aria-label="드라이브에서 열기">${ICON_G.drive}</a><a class="gv-btn" data-gv="down" target="_blank" rel="noopener" aria-label="다운로드">${ICON_G.down}</a></header>
    ${list.length > 1 ? `<button class="gv-nav prev" data-gv="prev" aria-label="이전 사진">${ICON_G.back}</button><button class="gv-nav next" data-gv="next" aria-label="다음 사진">${ICON_G.next}</button>
    <div class="gv-strip">${list.map((i, k) => `<button class="gv-th" data-gv-to="${k}" aria-label="사진 ${k + 1}"><img src="${galThumb(i.id, 160)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div>` : ''}`;
  document.body.append(el);
  const stage = el.querySelector('.gv-stage'), bg = el.querySelector('.gv-bg'), slides = new Map();
  const prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
  const opener = document.activeElement;
  try { history.pushState({ ...history.state, gv: 1 }, ''); } catch {}
  let index = start, dx = 0, dy = 0, s = 1, tx = 0, ty = 0, closing = false, pending = null;

  function ensure(i) {
    if (slides.has(i) || !list[i]) return slides.get(i);
    const sl = document.createElement('div'); sl.className = 'gv-slide';
    sl.innerHTML = `<img class="gv-img" alt="${esc(list[i].name || '')}" draggable="false" referrerpolicy="no-referrer"><span class="gv-broken">공유가 꺼져 있어 볼 수 없어요</span>`;
    const img = sl.firstChild; img.src = galThumb(list[i].id); img.onerror = () => sl.classList.add('broken');
    // 작은 사진을 먼저 보여 주고 큰 사진이 준비되면 바꿔 끼움
    const hi = new Image(); hi.referrerPolicy = 'no-referrer'; hi.src = galBig(list[i].id);
    hi.decode().then(() => { img.src = hi.src; }).catch(() => {});
    stage.append(sl); slides.set(i, sl); return sl;
  }
  const W = () => innerWidth;
  const cur = () => slides.get(index)?.firstChild;
  // 화면에 맞춘 사진 크기(확대 전) — img 상자 안에서 object-fit: contain
  function fitted(img) {
    const bw = img.offsetWidth, bh = img.offsetHeight, nw = img.naturalWidth || 1, nh = img.naturalHeight || 1, k = Math.min(bw / nw, bh / nh);
    return { w: nw * k, h: nh * k, bw, bh, cx: img.offsetLeft + bw / 2, cy: img.offsetTop + bh / 2 };
  }
  function clamp(animate) {
    const img = cur(); if (!img) return;
    const f = fitted(img), mx = Math.max(0, (f.w * s - innerWidth) / 2), my = Math.max(0, (f.h * s - innerHeight) / 2);
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); zoomApply(animate);
  }
  function zoomApply(animate) {
    const img = cur(); if (!img) return;
    img.style.transition = animate && !reduce ? `transform .32s ${EASE}` : 'none';
    img.style.transform = s === 1 && !tx && !ty ? '' : `translate3d(${tx}px,${ty}px,0) scale(${s})`;
    el.classList.toggle('zoomed', s > 1.01);
  }
  function place(animate) {
    for (const [i, sl] of slides) {
      const off = i - index;
      if (Math.abs(off) > 1) { sl.remove(); slides.delete(i); continue; }
      const k = off === 0 && dy > 0 ? Math.max(.6, 1 - dy / innerHeight * .6) : 1;
      sl.style.transition = animate && !reduce ? `transform .34s ${EASE}` : 'none';
      sl.style.transform = `translate3d(${off * (W() + GAP) + dx}px,${off === 0 ? dy : 0}px,0) scale(${k})`;
    }
    bg.style.transition = animate && !reduce ? 'opacity .34s, background-color .25s' : 'background-color .25s';
    bg.style.opacity = dy > 0 ? Math.max(0, 1 - dy / (innerHeight * .45)) : 1;
  }
  function meta() {
    const it = list[index];
    el.querySelector('.gv-meta b').textContent = it.name || it.album || '사진';
    el.querySelector('.gv-meta small').textContent = list.length > 1 ? `${index + 1} / ${list.length}` : '';
    el.querySelector('[data-gv="drive"]').href = `https://drive.google.com/file/d/${it.id}/view`;
    el.querySelector('[data-gv="down"]').href = `https://drive.google.com/uc?export=download&id=${it.id}`;
    el.querySelector('.prev')?.toggleAttribute('disabled', index === 0);
    el.querySelector('.next')?.toggleAttribute('disabled', index === list.length - 1);
    const strip = el.querySelector('.gv-strip');
    if (strip) {
      strip.querySelector('.on')?.classList.remove('on');
      const th = strip.children[index]; th.classList.add('on');
      strip.scrollTo({ left: th.offsetLeft + th.offsetWidth / 2 - strip.clientWidth / 2, behavior: reduce || !el.isConnected ? 'auto' : 'smooth' });
    }
  }
  function show() { [index, index + 1, index - 1].forEach(ensure); dx = dy = 0; s = 1; tx = ty = 0; place(false); zoomApply(false); meta(); }
  function finish() { if (!pending) return; clearTimeout(pending.t); const step = pending.step; pending = null; index += step; dx = 0; show(); }
  function go(step) {
    finish();
    if (!list[index + step]) { dx = 0; place(true); return; }
    const img = cur(); s = 1; tx = ty = 0; if (img) { img.style.transition = 'none'; img.style.transform = ''; }
    ensure(index + step); dx = -step * (W() + GAP); place(true);
    pending = { step, t: setTimeout(finish, reduce ? 0 : 340) };
  }
  function jump(i) { finish(); if (i === index || !list[i]) return; index = i; [...slides.values()].forEach(sl => sl.remove()); slides.clear(); show(); }
  // 칸 ↔ 화면 사이를 날아가는 사진 (열기·닫기 공통)
  function fly(src, from, to, done) {
    if (reduce || !from || !to) { done(); return; }
    const g = document.createElement('div'); g.className = 'gv-ghost'; g.innerHTML = `<img src="${src}" alt="" referrerpolicy="no-referrer">`; document.body.append(g);
    const kf = r => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: (r.radius || 0) + 'px' });
    // 탭이 가려져 애니메이션이 멈춰도 열기·닫기가 끝나도록 시간으로도 마무리
    let over = false; const end = () => { if (over) return; over = true; done(); setTimeout(() => g.remove(), 16); };
    g.animate([kf(from), kf(to)], { duration: 380, easing: EASE, fill: 'forwards' }).onfinish = end; setTimeout(end, 520);
  }
  const tileOf = i => document.querySelector(`.gal-tile[data-gi="${i}"]`);
  function photoRect(img) {
    const f = fitted(img), k = dy > 0 ? Math.max(.6, 1 - dy / innerHeight * .6) : 1, w = f.w * s * k, h = f.h * s * k;
    return { left: f.cx + tx + dx - w / 2, top: f.cy + ty + dy - h / 2, width: w, height: h };
  }
  function close(fromPop) {
    if (closing) return; closing = true; finish();
    document.removeEventListener('keydown', keys); removeEventListener('resize', onResize);
    if (!fromPop && history.state?.gv) { navSkip++; history.back(); }
    const img = cur(), t = tileOf(index);
    if (t) t.scrollIntoView({ block: 'nearest' });
    const r = t?.getBoundingClientRect(), from = img && img.naturalWidth ? photoRect(img) : null;
    const end = () => { el.remove(); document.documentElement.style.overflow = prevOverflow; gv = null; (t || opener)?.focus?.({ preventScroll: true }); };
    el.classList.add('leaving');
    if (r && from && r.bottom > 0 && r.top < innerHeight && !slides.get(index)?.classList.contains('broken')) {
      el.classList.add('flying'); bg.style.transition = `opacity .3s`; bg.style.opacity = 0;
      fly(img.src, from, { left: r.left, top: r.top, width: r.width, height: r.height }, end);
    } else if (reduce) end();
    else { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).onfinish = end; setTimeout(() => el.isConnected && end(), 260); }
  }

  // 손가락·마우스: 한 손가락 = 넘기기/아래로 닫기/확대 중 이동, 두 손가락 = 확대, 두 번 탭 = 확대 전환, 한 번 탭 = 메뉴 숨기기
  const pts = new Map(); let g0 = null, pinch = null, lastTap = null, tapTimer = 0;
  stage.addEventListener('pointerdown', e => {
    if (closing || e.button > 0) return;
    try { stage.setPointerCapture(e.pointerId); } catch {} pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], f = fitted(cur());
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s, tx, ty, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: f.cx, cy: f.cy }; g0 = null;
      if (dx || dy) { dx = dy = 0; place(true); }
    } else if (pts.size === 1) { finish(); g0 = { x: e.clientX, y: e.clientY, t: performance.now(), tx, ty, mode: '', touch: e.pointerType !== 'mouse' }; }
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      s = Math.max(.7, Math.min(6, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d)));
      // 두 손가락 사이의 지점이 그대로 손가락 밑에 머물도록
      tx = mx - pinch.cx - s * (pinch.mx - pinch.cx - pinch.tx) / pinch.s; ty = my - pinch.cy - s * (pinch.my - pinch.cy - pinch.ty) / pinch.s;
      zoomApply(false); return;
    }
    if (!g0) return;
    const ddx = e.clientX - g0.x, ddy = e.clientY - g0.y;
    if (!g0.mode) {
      if (Math.hypot(ddx, ddy) < 8) return;
      g0.mode = s > 1.01 ? 'pan' : Math.abs(ddx) > Math.abs(ddy) ? 'swipe' : ddy > 0 ? 'dismiss' : 'none';
    }
    if (g0.mode === 'pan') { tx = g0.tx + ddx; ty = g0.ty + ddy; zoomApply(false); }
    else if (g0.mode === 'swipe') { dx = list[index - Math.sign(ddx)] ? ddx : ddx / 3; place(false); }
    else if (g0.mode === 'dismiss') { dy = ddy; dx = ddx * .4; place(false); }
  });
  const release = e => {
    if (!pts.delete(e.pointerId)) return;
    if (pinch) { if (pts.size < 2) { pinch = null; if (s < 1) { s = 1; tx = ty = 0; } clamp(true); g0 = null; } return; }
    if (!g0) return;
    const ddx = e.clientX - g0.x, ddy = e.clientY - g0.y, dt = Math.max(1, performance.now() - g0.t), mode = g0.mode, touch = g0.touch; g0 = null;
    if (e.type === 'pointercancel') { dx = dy = 0; place(true); clamp(true); return; }
    if (mode === 'pan') return clamp(true);
    if (mode === 'swipe') { const v = ddx / dt; if ((ddx < -W() / 4 || v < -.45) && list[index + 1]) go(1); else if ((ddx > W() / 4 || v > .45) && list[index - 1]) go(-1); else { dx = 0; place(true); } return; }
    if (mode === 'dismiss') { if (ddy > 110 || ddy / dt > .5) close(); else { dx = dy = 0; place(true); } return; }
    if (mode) return;
    // 탭
    if (!touch) return;
    const now = performance.now();
    if (lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { clearTimeout(tapTimer); lastTap = null; toggleZoom(e.clientX, e.clientY); return; }
    lastTap = { t: now, x: e.clientX, y: e.clientY }; tapTimer = setTimeout(() => el.classList.toggle('bare'), 300);
  };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  function toggleZoom(px, py) {
    const img = cur(); if (!img) return; const f = fitted(img);
    if (s > 1.01) { s = 1; tx = ty = 0; } else { s = 2.5; tx = (px - f.cx) * (1 - s); ty = (py - f.cy) * (1 - s); }
    clamp(true);
  }
  stage.addEventListener('dblclick', e => toggleZoom(e.clientX, e.clientY));
  let wheelAt = 0;
  stage.addEventListener('wheel', e => {
    e.preventDefault(); const img = cur(); if (!img) return;
    if (e.ctrlKey) { const f = fitted(img), ns = Math.max(1, Math.min(6, s * Math.exp(-e.deltaY * .01))); tx = e.clientX - f.cx - ns * (e.clientX - f.cx - tx) / s; ty = e.clientY - f.cy - ns * (e.clientY - f.cy - ty) / s; s = ns; if (s === 1) tx = ty = 0; return clamp(false); }
    if (s > 1.01) { tx -= e.deltaX; ty -= e.deltaY; return clamp(false); }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 24 && performance.now() - wheelAt > 450) { wheelAt = performance.now(); go(e.deltaX > 0 ? 1 : -1); }
  }, { passive: false });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-gv],[data-gv-to]'); if (!b) return;
    if (b.dataset.gvTo) return jump(+b.dataset.gvTo);
    const a = b.dataset.gv;
    if (a === 'close') close(); else if (a === 'prev') go(-1); else if (a === 'next') go(1);
  });
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  document.addEventListener('keydown', keys);
  const onResize = () => { s = 1; tx = ty = 0; place(false); zoomApply(false); };
  addEventListener('resize', onResize);
  gv = { close };

  show();
  el.querySelector('[data-gv="close"]').focus({ preventScroll: true });
  // 누른 칸에서 화면 크기로 날아오며 열림
  const timg = tile?.querySelector('img'), r = tile?.getBoundingClientRect(), first = cur();
  const reveal = () => el.classList.remove('opening');
  if (!reduce && r && timg?.naturalWidth) {
    bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
    el.querySelectorAll('.gv-top,.gv-strip,.gv-nav').forEach(x => x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120, fill: 'backwards' }));
    const go2 = () => { const f = fitted(first), sc = Math.min(f.bw / timg.naturalWidth, f.bh / timg.naturalHeight), w = timg.naturalWidth * sc, h = timg.naturalHeight * sc;
      fly(timg.currentSrc || timg.src, { left: r.left, top: r.top, width: r.width, height: r.height }, { left: f.cx - w / 2, top: f.cy - h / 2, width: w, height: h }, reveal); };
    go2();
  } else { reveal(); if (!reduce) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-gal],[data-gal-new],[data-gal-add],[data-gi],[data-gal-edit],[data-gal-save],[data-gal-del],[data-gal-retry],[data-gal-mode],[data-gal-zoom]'); if (!t) return;
  const d = t.dataset;
  if ('gal' in d) return galOpenAlbum(d.gal);
  if ('galMode' in d) { galMode = d.galMode; galStore('ot-gal-mode', galMode); render(); return; }
  if ('galZoom' in d) { galStore('ot-gal-zoom', Math.max(0, Math.min(2, galLevel() + +d.galZoom))); render(); return; }
  if ('galNew' in d) return galAddSheet();
  if ('galRetry' in d) { galFetch(d.galRetry, true); render(); return; }
  if ('gi' in d) { if (t.classList.contains('broken')) return toast('공유가 꺼져 있어 볼 수 없어요. 드라이브에서 공유를 켜 주세요'); return galView(galList, +d.gi, t); }
  if ('galAdd' in d) {
    const { ok, bad } = galReadLinks($('#galLink').value);
    if (!ok.length) return toast('구글 드라이브 공유 링크를 붙여 넣어 주세요');
    if (!who) return askWho();
    const now = new Date(), n = { id: uid('n_'), 종류: '사진첩', 작성자: who, 제목: val('#galTitle'), 브랜드: $('#galBrand').value, 내용: ok.join('\n'), 만든시각: `${today()} ${pad(now.getHours())}:${pad(now.getMinutes())}` };
    closeSheet(); galSel = n.id; galStore('ot-gal', galSel);
    save('note', n); scrollTo(0, 0);
    // 제목을 비워 두면 폴더 이름으로 채움
    if (!n.제목) { const f = galParse(ok[0]); if (f.kind === 'folder') { const fill = setInterval(() => { const st = galFolders[f.id]; if (!st || st.state === 'loading') return; clearInterval(fill); const c = D.notes.find(x => x.id === n.id); if (st.name && c && !c.제목) save('note', { ...c, 제목: st.name }); }, 400); setTimeout(() => clearInterval(fill), 30000); } }
    return toast(bad ? `링크가 아닌 ${bad}줄은 빼고 넣었어요` : '사진첩에 넣었어요');
  }
  if ('galEdit' in d) { const n = D.notes.find(x => x.id === d.galEdit); if (n) galEditSheet(n); return; }
  if ('galSave' in d) {
    const n = D.notes.find(x => x.id === d.galSave); if (!n) return;
    const { ok } = galReadLinks($('#galELink').value); if (!ok.length) return toast('링크를 하나 이상 넣어 주세요');
    closeSheet(); save('note', { ...n, 제목: val('#galETitle'), 브랜드: $('#galEBrand').value, 내용: ok.join('\n') }); return toast('저장했어요');
  }
  if ('galDel' in d) {
    if (!confirm('이 사진첩을 지울까요? 드라이브의 사진은 그대로 남아요.')) return;
    closeSheet(); galSel = ''; galStore('ot-gal', ''); del('note', d.galDel); return toast('사진첩을 지웠어요');
  }
});
