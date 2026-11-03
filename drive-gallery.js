// 사진첩: 구글 드라이브 공유 링크(파일·폴더)를 노트(종류 "사진첩")로 저장하고 사진을 격자로 보여 줌
let galSel = '', galOpenAdd = false;
const galFolders = {}; // 폴더 id → { state: 'loading'|'ok'|'fail'|'old', files, name, error }
try { galSel = localStorage.getItem('ot-gal') || ''; } catch {}
const galAlbums = () => D.notes.filter(n => n.종류 === '사진첩').sort((a, b) => (b.만든시각 || '').localeCompare(a.만든시각 || ''));
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
  const out = [];
  for (const l of galLinks(n)) {
    if (l.kind === 'file') out.push({ id: l.id, name: '' });
    else { const f = galFolders[l.id]; if (f?.state === 'ok') out.push(...f.files); else if (!f) galFetch(l.id); }
  }
  return out;
}
async function galFetch(id, force) {
  if (galFolders[id] && !force) return;
  galFolders[id] = { state: 'loading' };
  if (DEMO) { galFolders[id] = { state: 'ok', name: '예시 폴더', files: [] }; return; }
  try {
    const r = await post({ type: 'driveFolder', id });
    galFolders[id] = { state: 'ok', name: r.name || '', files: (r.files || []).map(f => ({ id: f.id, name: f.name || '', w: f.w, h: f.h, shared: f.shared })) };
  } catch (e) {
    const msg = String(e.message || e);
    // 서버에 사진첩 코드가 아직 없으면 type 오류가 남 → 드라이브 기본 폴더 보기로 대신 보여 줌
    galFolders[id] = { state: msg === 'type' || msg === 'kind' ? 'old' : 'fail', error: msg };
  }
  if (tab === 'gal') render();
}
function galCover(n) {
  const imgs = galImages(n).slice(0, 4), folder = galLinks(n).find(l => l.kind === 'folder'), f = folder && galFolders[folder.id];
  if (!imgs.length) return `<div class="gal-cover gal-cover-empty">${f?.state === 'loading' ? '불러오는 중…' : '📁 드라이브 폴더'}</div>`;
  return `<div class="gal-cover n${imgs.length}">${imgs.map(i => `<img src="${galThumb(i.id, 480)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`).join('')}</div>`;
}
function galCount(n) {
  const links = galLinks(n), files = links.filter(l => l.kind === 'file').length, folders = links.filter(l => l.kind === 'folder');
  const known = folders.every(l => galFolders[l.id]?.state === 'ok');
  return known ? `${galImages(n).length}장` : files ? `${files}장 + 폴더` : '폴더';
}
function galAddBox() {
  return `<div class="gal-add card">
    <div class="gal-add-head"><b>드라이브 사진 넣기</b><small>파일이나 폴더의 공유 링크를 붙여 넣어요. 여러 개는 줄을 바꿔서 넣어요.</small></div>
    <textarea class="in" id="galLink" rows="2" placeholder="https://drive.google.com/drive/folders/…"></textarea>
    <div class="gal-add-row"><input class="in" id="galTitle" maxlength="60" placeholder="앨범 이름 (선택)"><select class="in" id="galBrand">${['', ...BRANDS].map(b => `<option value="${b}">${b || '브랜드 없음'}</option>`).join('')}</select><button class="btn" data-gal-add>넣기</button></div>
    <details class="gal-how"><summary>공유 링크 만드는 법</summary><ol><li>구글 드라이브에 사진이나 폴더를 올려요.</li><li>마우스 오른쪽 버튼 → <b>공유</b> → 일반 액세스를 <b>링크가 있는 모든 사용자</b>로 바꿔요.</li><li><b>링크 복사</b>를 눌러 여기 붙여 넣어요.</li></ol></details>
  </div>`;
}
function galHtml() {
  const albums = galAlbums(), sel = albums.find(n => n.id === galSel);
  if (sel) return galAlbumHtml(sel);
  return `${albums.length && !galOpenAdd ? `<div class="btns" style="margin:0 0 14px"><button class="btn" data-gal-new style="height:50px;font-size:16px">＋ 드라이브 사진 넣기</button></div>` : galAddBox()}
    ${albums.length ? `<div class="gal-albums">${albums.map(n => `<button class="gal-album" data-gal="${n.id}">${galCover(n)}<span class="gal-album-t"><b>${esc(n.제목 || '이름 없는 앨범')}</b><small>${esc([n.브랜드, galCount(n), PNAME(n.작성자), (n.만든시각 || '').slice(5, 10).replace('-', '/')].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`
      : '<div class="list"><div class="empty">아직 사진첩이 없어요. 드라이브 링크를 넣으면 바로 사진이 보여요</div></div>'}`;
}
function galAlbumHtml(n) {
  const links = galLinks(n), imgs = galImages(n), folders = links.filter(l => l.kind === 'folder');
  const notes = folders.map(l => {
    const f = galFolders[l.id];
    if (!f || f.state === 'loading') return '<div class="gal-note">폴더 사진을 불러오는 중이에요…</div>';
    if (f.state === 'old') return `<div class="gal-note">폴더를 바로 펼치려면 서버 업데이트가 필요해요. 그동안 드라이브 화면으로 보여 드려요.</div><iframe class="gal-frame" src="https://drive.google.com/embeddedfolderview?id=${l.id}#grid" title="드라이브 폴더" loading="lazy"></iframe>`;
    if (f.state === 'fail') return `<div class="gal-note warn">폴더를 열지 못했어요. 링크가 맞는지, 공유가 <b>링크가 있는 모든 사용자</b>인지 확인해 주세요. <button class="ic" data-gal-retry="${l.id}">다시 불러오기</button></div>`;
    if (!f.files.length) return '<div class="gal-note">이 폴더에는 사진이 없어요.</div>';
    const closed = f.files.filter(x => x.shared === false).length;
    return closed ? `<div class="gal-note warn">사진 ${closed}장이 비공개라 다른 사람에게는 안 보일 수 있어요. 폴더 공유를 <b>링크가 있는 모든 사용자</b>로 바꿔 주세요.</div>` : '';
  }).join('');
  const first = links[0], open = first ? (first.kind === 'folder' ? `https://drive.google.com/drive/folders/${first.id}` : `https://drive.google.com/file/d/${first.id}/view`) : '';
  return `<div class="gal-head"><button class="ic" data-gal="">‹ 사진첩</button><div class="gal-head-t"><h2>${esc(n.제목 || '이름 없는 앨범')}</h2><small>${esc([n.브랜드, imgs.length ? imgs.length + '장' : '', PNAME(n.작성자) + ' 올림'].filter(Boolean).join(' · '))}</small></div>
      <div class="gal-head-r">${open ? `<a class="ic" href="${open}" target="_blank" rel="noopener">드라이브에서 열기 ↗</a>` : ''}<button class="ic" data-gal-edit="${n.id}">고치기</button></div></div>
    ${notes}
    ${imgs.length ? `<div class="gal-grid">${imgs.map((i, k) => `<button class="gal-tile" data-gal-img="${k}" aria-label="${esc(i.name || '사진 ' + (k + 1))} 크게 보기"><img src="${galThumb(i.id)}" alt="${esc(i.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.gal-tile').classList.add('broken')"><span class="gal-broken">공유가 꺼져 있어 볼 수 없어요</span>${i.name ? `<span class="gal-name">${esc(i.name)}</span>` : ''}</button>`).join('')}</div>` : ''}`;
}
function galEditSheet(n) {
  openSheet(`<h3>사진첩 고치기</h3>
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
document.addEventListener('click', e => {
  const t = e.target.closest('[data-gal],[data-gal-new],[data-gal-add],[data-gal-img],[data-gal-edit],[data-gal-save],[data-gal-del],[data-gal-retry]'); if (!t) return;
  const d = t.dataset;
  if ('gal' in d) { galSel = d.gal; galOpenAdd = false; try { localStorage.setItem('ot-gal', galSel); } catch {} render(); scrollTo(0, 0); return; }
  if ('galNew' in d) { galOpenAdd = true; render(); $('#galLink')?.focus(); return; }
  if ('galRetry' in d) { galFetch(d.galRetry, true); render(); return; }
  if ('galAdd' in d) {
    const { ok, bad } = galReadLinks($('#galLink').value);
    if (!ok.length) return toast('구글 드라이브 공유 링크를 붙여 넣어 주세요');
    if (!who) return askWho();
    const n = { id: uid('n_'), 종류: '사진첩', 작성자: who, 제목: val('#galTitle'), 브랜드: $('#galBrand').value, 내용: ok.join('\n'), 만든시각: `${today()} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}` };
    galSel = n.id; galOpenAdd = false; try { localStorage.setItem('ot-gal', galSel); } catch {}
    save('note', n);
    // 제목을 비워 두면 폴더 이름으로 채움
    if (!n.제목) { const f = galParse(ok[0]); if (f.kind === 'folder') { const fill = setInterval(() => { const st = galFolders[f.id]; if (!st || st.state === 'loading') return; clearInterval(fill); const cur = D.notes.find(x => x.id === n.id); if (st.name && cur && !cur.제목) save('note', { ...cur, 제목: st.name }); }, 400); setTimeout(() => clearInterval(fill), 30000); } }
    return toast(bad ? `링크가 아닌 ${bad}줄은 빼고 넣었어요` : '사진첩에 넣었어요');
  }
  if ('galImg' in d) {
    const n = galAlbums().find(x => x.id === galSel); if (!n) return;
    const items = galImages(n).map((i, k) => ({ meta: { name: i.name || `사진 ${k + 1}`, size: 0, download: `https://drive.google.com/uc?export=download&id=${i.id}` },getSource: () => galBig(i.id) }));
    const k = +d.galImg; return openImageReview(items[k].meta, items[k].getSource, items, k);
  }
  if ('galEdit' in d) { const n = D.notes.find(x => x.id === d.galEdit); if (n) galEditSheet(n); return; }
  if ('galSave' in d) {
    const n = D.notes.find(x => x.id === d.galSave); if (!n) return;
    const { ok } = galReadLinks($('#galELink').value); if (!ok.length) return toast('링크를 하나 이상 넣어 주세요');
    closeSheet(); save('note', { ...n, 제목: val('#galETitle'), 브랜드: $('#galEBrand').value, 내용: ok.join('\n') }); return toast('저장했어요');
  }
  if ('galDel' in d) {
    if (!confirm('이 사진첩을 지울까요? 드라이브의 사진은 그대로 남아요.')) return;
    closeSheet(); galSel = ''; try { localStorage.setItem('ot-gal', ''); } catch {} del('note', d.galDel); return toast('사진첩을 지웠어요');
  }
});
