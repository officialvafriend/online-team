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
  return `<div class="attachment ${previewableImage(m.mime) ? "attachment-image" : ""}" data-file-token="${token}">${previewableImage(m.mime) ? `<button class="chat-photo" data-photo-view="${token}" aria-label="사진 크게 보기"><span class="photo-loading">사진 불러오는 중…</span><img data-file-image="${m.id}" alt="${esc(m.name)}" hidden></button>` : '<span class="file-icon" aria-hidden="true">📄</span>'}<span class="file-name">${esc(m.name)}</span><small class="attachment-resolution">${fileSize(m.size)} · 원본</small>${previewableImage(m.mime) ? `<button class="image-open" data-photo-view="${token}">확대해서 자세히 보기</button>` : ""}<button class="file-download" data-file-download="${token}">원본 다운로드</button></div>`;
}
function photoPreview() {
  const batch = chatPhotos.get(thSel), busy = photoSends.has(thSel);
  if (!batch?.files.length) return '';
  const items = batch.files.map(p => `<div class="photo-preview">${previewableImage(p.file.type) ? `<button class="draft-image-open" data-draft-view="${p.id}" aria-label="첨부할 이미지 확대해서 확인"><img src="${p.url}" alt="보낼 사진"><span>확대해서 확인</span></button>` : '<span class="file-icon">📄</span>'}<span>${esc(p.file.name)}<small>${fileSize(p.file.size)} · 원본 그대로</small></span><button type="button" data-photo-remove="${p.id}" ${busy ? 'disabled' : ''} aria-label="${esc(p.file.name)} 첨부 빼기">✕</button></div>`).join('');
  return `<div class="attachment-batch-head"><strong>${batch.files.length}개 첨부</strong><span role="status">${busy ? (batch.progress || '보내는 중…') : '원본 그대로 · 파일당 20MB'}</span><button data-add-files ${busy ? 'disabled' : ''}>＋ 더 추가</button></div><div class="attachment-drafts ${batch.files.length > 1 ? 'multiple' : ''}">${items}</div>`;
}
function updatePhotoPreview() {
  const el = $('#photoPreview'); if (el) el.innerHTML = photoPreview();
  const send = document.querySelector('[data-act="csend"]');
  if (send) { send.disabled = photoJobs.has(thSel) || photoSends.has(thSel); send.textContent = photoSends.has(thSel) ? '보내는 중…' : '보내기'; }
}
function selectChatFiles(files) {
  const room = thSel;
  if (!files?.length || !room || photoSends.has(room)) return;
  const batch = chatPhotos.get(room) || { id: uid('l_batch_'), files: [] };
  let rejected = 0;
  for (const file of files) {
    if (!file.size || file.size > 20 * 1024 * 1024 || batch.files.length >= 30) { rejected++; continue; }
    batch.files.push({ file, url: URL.createObjectURL(file), id: uid('l_file_') });
  }
  if (batch.files.length) chatPhotos.set(room, batch);
  cDraft = $('#cText')?.value || ''; updatePhotoPreview();
  if (rejected) toast('파일당 20MB, 한 번에 30개까지 첨부할 수 있어요. 나머지 파일은 선택 목록에 유지했어요');
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
  const room = thSel, batch = chatPhotos.get(room);
  if (!batch?.files.length || photoSends.has(room)) return;
  if (text.length > 4000) return toast('파일과 함께 보내는 글은 4,000자까지 적어 주세요');
  const author = who;
  photoSends.add(room); updatePhotoPreview();
  try {
    for (let i = 0; i < batch.files.length; i++) {
      const photo = batch.files[i]; batch.progress = `${i + 1} / ${batch.files.length}개 원본 업로드 중…`; if (thSel === room) updatePhotoPreview();
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
    }
    const tokens = batch.files.map(photo => { const token = encodeAttachment(photo.meta); if (!decodeAttachment(token)) throw new Error('file'); return '[[파일:' + token + ']]'; });
    const log = { id: batch.id, 안건id: room, 시각: stamp(), 작성자: author, 내용: (text ? text + '\n' : '') + tokens.join('\n') };
    if (log.내용.length > 48000) throw new Error('message_size');
    batch.progress = '대화방에 올리는 중…'; if (thSel === room) updatePhotoPreview();
    await post({ type: 'save', kind: 'log', data: log });
    if (!D.logs.some(l => l.id === log.id)) D.logs.push(log);
    chatPhotos.delete(room); if (!DEMO) batch.files.forEach(photo => URL.revokeObjectURL(photo.url));
    if (thSel === room) { const current = $('#cText')?.value || ''; cDraft = current.trim() === text ? '' : current; render(); scrollEnd(); }
    toast(DEMO ? '예시 화면에 첨부했어요' : `${batch.files.length}개 원본 파일을 보냈어요`);
  } catch (e) { toast('보내지 못했어요. 첨부한 파일은 그대로 있으니 다시 보내 주세요'); }
  finally { photoSends.delete(room); updatePhotoPreview(); }
}
function showAttachment(token) {
  const m = decodeAttachment(token); if (!m) return;
  return openImageReview(m, () => loadAttachment(m));
}
document.addEventListener('change', e => { if (e.target.id === 'chatPhotoInput') { selectChatFiles([...e.target.files]); e.target.value = ''; } });
document.addEventListener('paste', e => {
  if (!e.target.closest('.cbox')) return;
  const images = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if (images.length) { e.preventDefault(); selectChatFiles(images); }
});
document.addEventListener('dragover', e => { if (e.target.closest('.cbox') && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.target.closest('.cbox') && e.dataTransfer?.files.length) { e.preventDefault(); selectChatFiles([...e.dataTransfer.files]); } });
document.addEventListener('click', async e => {
  const remove = e.target.closest('[data-photo-remove]');
  if (remove && !photoSends.has(thSel)) { const batch = chatPhotos.get(thSel), p = batch?.files.find(p => p.id === remove.dataset.photoRemove); if (p) { URL.revokeObjectURL(p.url); batch.files = batch.files.filter(f => f !== p); if (!batch.files.length) chatPhotos.delete(thSel); } updatePhotoPreview(); }
  if (e.target.closest('[data-add-files]') && !photoSends.has(thSel)) $('#chatPhotoInput')?.click();
  const pick = e.target.closest('[data-pick-file]'); if (pick) { closeSheet(); $('#chatPhotoInput')?.click(); }
  const view = e.target.closest('[data-photo-view]'); if (view) return showAttachment(view.dataset.photoView);
  if (e.target.closest('[data-draft-view]')) { const p = chatPhotos.get(thSel)?.files.find(p => p.id === e.target.closest('[data-draft-view]').dataset.draftView); if (p) return openImageReview({ name: p.file.name, size: p.file.size }, () => Promise.resolve(p.url)); }
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
    try { const url = await loadAttachment(m); if (img.isConnected) { img.onload = () => { const label = card.querySelector('.attachment-resolution'); if (label) label.textContent = `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px · ${fileSize(m.size)} · 원본`; }; img.src = url; img.hidden = false; card.querySelector('.photo-loading')?.remove(); } }
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
