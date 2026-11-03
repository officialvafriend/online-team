// Original bytes live privately in Drive. Messages contain only validated metadata.
const chatPhotos = new Map(), photoJobs = new Set(), photoSends = new Set();
const PHOTO_PATTERN = /\[\[파일:([A-Za-z0-9+/=]+)\]\]/g;
const attachmentCache = new Map();
const previewableImage = mime => /^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(mime);
const fileSize = n => n < 1048576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
function encodeAttachment(meta) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(meta)))); }
function decodeAttachment(token) {
  try {
    if (token.length > 4000) return null;
    const m = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token), c => c.charCodeAt(0))));
    return /^[A-Za-z0-9_-]{10,200}$/.test(m.id) && typeof m.name === 'string' && m.name.length <= 240 && /^[\w.+-]+\/[\w.+-]+$/.test(m.mime) && Number.isInteger(m.size) && m.size > 0 && m.size <= 20 * 1024 * 1024 && /^[a-f0-9]{64}$/.test(m.sha256) ? m : null;
  } catch { return null; }
}
function attachmentHtml(token) {
  const m = decodeAttachment(token); if (!m) return esc('첨부파일 정보를 읽을 수 없어요');
  return `<div class="attachment" data-file-token="${token}">${previewableImage(m.mime) ? `<button class="chat-photo" data-photo-view="${token}" aria-label="사진 크게 보기"><span class="photo-loading">사진 불러오는 중…</span><img data-file-image="${m.id}" alt="${esc(m.name)}" hidden></button>` : '<span class="file-icon" aria-hidden="true">📄</span>'}<span class="file-name">${esc(m.name)}</span><small>${fileSize(m.size)} · 원본</small><button class="file-download" data-file-download="${token}">원본 다운로드</button></div>`;
}
function photoPreview() {
  const p = chatPhotos.get(thSel), busy = photoJobs.has(thSel) || photoSends.has(thSel);
  return p || busy ? `<div class="photo-preview">${p ? `${previewableImage(p.file.type) ? `<img src="${p.url}" alt="보낼 사진">` : '<span class="file-icon">📄</span>'}<span>${esc(p.file.name)}<small>${fileSize(p.file.size)} · 원본 그대로</small></span>` : '<span>파일을 준비하고 있어요…</span>'}<button type="button" data-photo-remove ${busy ? 'disabled' : ''} aria-label="첨부 파일 빼기">✕</button></div>` : '';
}
function updatePhotoPreview() {
  const el = $('#photoPreview'); if (el) el.innerHTML = photoPreview();
  const send = document.querySelector('[data-act="csend"]');
  if (send) { send.disabled = photoJobs.has(thSel) || photoSends.has(thSel); send.textContent = photoSends.has(thSel) ? '보내는 중…' : '보내기'; }
}
function selectChatFile(file) {
  const room = thSel;
  if (!file || !room || photoSends.has(room)) return;
  if (!file.size) return toast('빈 파일은 첨부할 수 없어요');
  if (file.size > 20 * 1024 * 1024) return toast('파일당 20MB까지 원본으로 첨부할 수 있어요');
  const old = chatPhotos.get(room); if (old) URL.revokeObjectURL(old.url);
  chatPhotos.set(room, { file, url: URL.createObjectURL(file), id: uid('l_file_') });
  cDraft = $('#cText')?.value || ''; updatePhotoPreview();
}
async function digestFile(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function loadAttachment(m) {
  if (attachmentCache.has(m.id)) return attachmentCache.get(m.id);
  const job = (async () => {
    const r = await post({ type: 'attachmentRead', id: m.id });
    if (typeof r.b64 !== 'string' || r.b64.length > 27962028) throw new Error('file');
    const bytes = Uint8Array.from(atob(r.b64), c => c.charCodeAt(0));
    if (bytes.length !== m.size || await digestFile(bytes) !== m.sha256) throw new Error('checksum');
    return URL.createObjectURL(new Blob([bytes], { type: m.mime }));
  })();
  attachmentCache.set(m.id, job);
  try { return await job; } catch (e) { attachmentCache.delete(m.id); throw e; }
}
async function sendChatPhoto(text) {
  const room = thSel, photo = chatPhotos.get(room);
  if (!photo || photoSends.has(room)) return;
  if (text.length > 4000) return toast('파일과 함께 보내는 글은 4,000자까지 적어 주세요');
  const author = who;
  photoSends.add(room); updatePhotoPreview();
  try {
    if (!photo.meta) {
      const bytes = await photo.file.arrayBuffer(), sha256 = await digestFile(bytes);
      if (DEMO) {
        photo.meta = { id: 'demo_' + photo.id, name: photo.file.name.slice(0, 240), mime: photo.file.type || 'application/octet-stream', size: photo.file.size, sha256 };
        attachmentCache.set(photo.meta.id, Promise.resolve(photo.url));
      } else {
        const result = await post({ type: 'attachmentUpload', uploadId: photo.id, name: photo.file.name, mime: photo.file.type || 'application/octet-stream', b64: await b64(photo.file), sha256 });
        if (!result.file || result.file.sha256 !== sha256 || result.file.size !== photo.file.size) throw new Error('checksum');
        photo.meta = result.file;
      }
    }
    const token = encodeAttachment(photo.meta);
    if (!decodeAttachment(token)) throw new Error('file');
    const log = { id: photo.id, 안건id: room, 시각: stamp(), 작성자: author, 내용: (text ? text + '\n' : '') + '[[파일:' + token + ']]' };
    await post({ type: 'save', kind: 'log', data: log });
    if (!D.logs.some(l => l.id === log.id)) D.logs.push(log);
    chatPhotos.delete(room); if (!DEMO) URL.revokeObjectURL(photo.url);
    if (thSel === room) { const current = $('#cText')?.value || ''; cDraft = current.trim() === text ? '' : current; render(); scrollEnd(); }
    toast(DEMO ? '예시 화면에 첨부했어요' : '원본 파일을 보냈어요');
  } catch (e) { toast('보내지 못했어요. 첨부한 파일은 그대로 있으니 다시 보내 주세요'); }
  finally { photoSends.delete(room); updatePhotoPreview(); }
}
async function showAttachment(token) {
  const m = decodeAttachment(token); if (!m) return;
  openSheet(`<h3>${esc(m.name)}</h3><p class="caption">원본 화질 · ${fileSize(m.size)}</p><div id="originalPhoto"><p class="caption">원본을 불러오고 있어요…</p></div><div class="btns"><button class="btn sec2" data-file-download="${token}">원본 다운로드</button><button class="btn gray" data-photo-close>닫기</button></div>`);
  const holder = $('#originalPhoto');
  try { const url = await loadAttachment(m); if (holder.isConnected) holder.innerHTML = `<button class="photo-zoom" aria-label="사진 100% 크기로 보기"><img class="photo-full" src="${url}" alt="${esc(m.name)}"></button><p class="caption">사진을 누르면 100% 크기로 볼 수 있어요</p>`; }
  catch { if (holder.isConnected) holder.innerHTML = '<p class="warn">원본을 불러오지 못했어요. 닫고 다시 열어 주세요</p>'; }
}
document.addEventListener('change', e => { if (e.target.id === 'chatPhotoInput') { selectChatFile(e.target.files[0]); e.target.value = ''; } });
document.addEventListener('paste', e => {
  if (!e.target.closest('.cbox')) return;
  const image = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
  if (image) { e.preventDefault(); selectChatFile(image.getAsFile()); }
});
document.addEventListener('dragover', e => { if (e.target.closest('.cbox') && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.target.closest('.cbox') && e.dataTransfer?.files.length) { e.preventDefault(); selectChatFile(e.dataTransfer.files[0]); } });
document.addEventListener('click', async e => {
  if (e.target.closest('[data-photo-remove]') && !photoSends.has(thSel)) { const p = chatPhotos.get(thSel); if (p) URL.revokeObjectURL(p.url); chatPhotos.delete(thSel); updatePhotoPreview(); }
  const pick = e.target.closest('[data-pick-file]'); if (pick) { closeSheet(); $('#chatPhotoInput')?.click(); }
  const view = e.target.closest('[data-photo-view]'); if (view) return showAttachment(view.dataset.photoView);
  const zoom = e.target.closest('.photo-zoom'); if (zoom) { const big = zoom.classList.toggle('original-size'); zoom.setAttribute('aria-label', big ? '사진을 화면에 맞추기' : '사진 100% 크기로 보기'); }
  const download = e.target.closest('[data-file-download]');
  if (download && !download.disabled) {
    const m = decodeAttachment(download.dataset.fileDownload); if (!m) return;
    download.disabled = true;
    try { const a = document.createElement('a'); a.href = await loadAttachment(m); a.download = m.name; a.click(); }
    catch { toast('다운로드하지 못했어요. 다시 눌러 주세요'); }
    finally { download.disabled = false; }
  }
  if (e.target.closest('[data-photo-close]')) closeSheet();
});
// Load only visible images, without putting image bytes into the board or its logs.
let originalLoads = 0; const originalQueue = [];
async function loadVisibleOriginal(img) {
  const card = img.closest('[data-file-token]'), m = card && decodeAttachment(card.dataset.fileToken); if (!m) return;
  originalQueue.push(async () => {
    try { const url = await loadAttachment(m); if (img.isConnected) { img.src = url; img.hidden = false; card.querySelector('.photo-loading')?.remove(); } }
    catch { if (card.isConnected) card.querySelector('.photo-loading').textContent = '눌러서 원본 보기'; }
  });
  pumpOriginals();
}
function pumpOriginals() {
  while (originalLoads < 2 && originalQueue.length) { originalLoads++; originalQueue.shift()().finally(() => { originalLoads--; pumpOriginals(); }); }
}
const originalObserver = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) { originalObserver.unobserve(e.target); loadVisibleOriginal(e.target.querySelector("img")); } }, { rootMargin: '100px' });
new MutationObserver(() => {
  document.querySelectorAll('[data-file-image]:not([data-observed])').forEach(img => { img.dataset.observed = '1'; originalObserver.observe(img.closest('.chat-photo')); });
}).observe(document.querySelector('#app'), { childList: true, subtree: true });
