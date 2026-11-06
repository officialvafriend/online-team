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
  return `<div class="attachment ${previewableImage(m.mime) ? "attachment-image" : ""}" data-file-token="${token}">${previewableImage(m.mime) ? `<button class="chat-photo" data-photo-view="${token}" aria-label="사진 크게 보기"><span class="photo-loading">사진 불러오는 중…</span><img data-file-image="${m.id}" alt="${esc(m.name)}" hidden></button>` : '<span class="file-icon" aria-hidden="true">📄</span>'}<span class="file-name">${esc(m.name)}</span><small class="attachment-resolution">${fileSize(m.size)} · ${m.q === 's' ? '작게 보냄' : '원본'}</small>${previewableImage(m.mime) ? `<button class="image-open" data-photo-view="${token}">확대해서 자세히 보기</button>` : ""}${m.mime === 'application/pdf' ? `<button class="image-open" data-pdf-view="${token}">PDF 바로 보기</button>` : ""}<button class="file-download" data-file-download="${token}">${m.q === 's' ? '사진 저장' : '원본 다운로드'}</button></div>`;
}
function photoPreview() {
  const batch = chatPhotos.get(thSel), busy = photoSends.has(thSel);
  if (!batch?.files.length) return '';
  const items = batch.files.map(p => `<div class="photo-preview">${previewableImage(p.file.type) ? `<button class="draft-image-open" data-draft-view="${p.id}" aria-label="첨부할 이미지 확대해서 확인"><img src="${p.url}" alt="보낼 사진"><span>확대해서 확인</span></button>` : '<span class="file-icon">📄</span>'}<span>${esc(p.file.name)}<small>${fileSize(p.file.size)} · ${batch.orig || !shrinkable(p.file) ? '원본 그대로' : '줄여서 보냄'}</small></span><button type="button" data-photo-remove="${p.id}" ${busy ? 'disabled' : ''} aria-label="${esc(p.file.name)} 첨부 빼기">✕</button></div>`).join('');
  return `<div class="attachment-batch-head"><strong>${batch.files.length}개 첨부</strong><span role="status">${busy ? (batch.progress || '보내는 중…') : batch.orig || !batch.files.some(p => shrinkable(p.file)) ? '원본 그대로 · 파일당 20MB' : '빠르게 보내려고 사진을 줄여요'}</span><label class="orig-toggle"><input type="checkbox" data-photo-orig ${batch.orig ? 'checked' : ''} ${busy ? 'disabled' : ''}> 원본으로 보내기</label><button data-add-files ${busy ? 'disabled' : ''}>＋ 더 추가</button></div><div class="attachment-drafts ${batch.files.length > 1 ? 'multiple' : ''}">${items}</div>`;
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
const SHRINK_EDGE = 1600, SHRINK_MIN = 400 * 1024;
const shrinkable = file => /^image\/(jpeg|png|webp|avif|bmp)$/.test(file.type) && file.size > SHRINK_MIN;
async function isAnimatedWebp(file) { if (file.type !== 'image/webp') return false; try { return new TextDecoder('latin1').decode(await file.slice(0, 64 * 1024).arrayBuffer()).includes('ANMF'); } catch { return false; } }
async function shrinkPhoto(file) {
  if (!shrinkable(file) || await isAnimatedWebp(file)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, SHRINK_EDGE / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}
async function digestFile(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function loadAttachment(m, { priority = true } = {}) {
  if (priority) prioritizeOriginal(m.id);
  if (attachmentCache.has(m.id)) return attachmentCache.get(m.id);
  const job = (async () => {
    const cached = await cachedOriginalFile(m); if (cached) return URL.createObjectURL(cached);
    const r = await originalNetworkRead(m.id, () => post({ type: 'attachmentRead', id: m.id }), priority);
    if (typeof r.b64 !== 'string' || r.b64.length > 27962028) throw new Error('file');
    const bytes = Uint8Array.from(atob(r.b64), c => c.charCodeAt(0));
    if (bytes.length !== m.size || await digestFile(bytes) !== m.sha256) throw new Error('checksum');
    const blob = new Blob([bytes], { type: m.mime }); await cacheOriginalFile(m, blob);
    return URL.createObjectURL(blob);
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
    let next = 0, completed = batch.files.filter(p => p.meta).length, uploadError = null;
    const progress = () => {
      batch.progress = `${completed} / ${batch.files.length}개 보냄${batch.orig ? ' · 원본 전송 중' : ''}`;
      if (thSel === room) { const label = document.querySelector('.attachment-batch-head [role="status"]'); if (label) label.textContent = batch.progress; }
    };
    progress();
    async function worker() {
      while (next < batch.files.length && !uploadError) {
        const photo = batch.files[next++];
        if (photo.meta) { attachmentCache.set(photo.meta.id, Promise.resolve(photo.meta.q ? photo.smallUrl || photo.url : photo.url)); continue; }
        try {
          if (!batch.orig && !photo.small) photo.small = await shrinkPhoto(photo.file);
          const f = batch.orig ? photo.file : photo.small, small = f !== photo.file ? { q: 's' } : {};
          const bytes = await f.arrayBuffer(), sha256 = await digestFile(bytes);
          if (DEMO) photo.meta = { id: 'demo_' + photo.id, name: f.name.slice(0, 240), mime: f.type || 'application/octet-stream', size: f.size, sha256, ...small };
          else {
            const result = await post({ type: 'attachmentUpload', uploadId: photo.id + (small.q ? 's' : ''), name: f.name, mime: f.type || 'application/octet-stream', b64: await b64(f), sha256 });
            if (!result.file || result.file.sha256 !== sha256 || result.file.size !== f.size) throw new Error('checksum');
            photo.meta = { ...result.file, ...small };
          }
          // The sender already holds the file it sent. Never download it again.
          if (small.q && !photo.smallUrl) photo.smallUrl = URL.createObjectURL(f);
          attachmentCache.set(photo.meta.id, Promise.resolve(small.q ? photo.smallUrl : photo.url)); await cacheOriginalFile(photo.meta, f); completed++; progress();
        } catch (e) { uploadError = e; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, batch.files.length) }, () => worker()));
    if (uploadError) throw uploadError;
    const tokens = batch.files.map(photo => { const token = encodeAttachment(photo.meta); if (!decodeAttachment(token)) throw new Error('file'); return '[[파일:' + token + ']]'; });
    const log = { id: batch.id, 안건id: room, 시각: stamp(), 작성자: author, 내용: (text ? text + '\n' : '') + tokens.join('\n') };
    if (log.내용.length > 48000) throw new Error('message_size');
    batch.progress = '대화방에 올리는 중…'; if (thSel === room) updatePhotoPreview();
    await post({ type: 'save', kind: 'log', data: log });
    if (!D.logs.some(l => l.id === log.id)) D.logs.push(log);
    chatPhotos.delete(room);
    if (thSel === room) { const current = $('#cText')?.value || ''; cDraft = current.trim() === text ? '' : current; render(); scrollEnd(); }
    toast(DEMO ? '예시 화면에 첨부했어요' : `${batch.files.length}개 ${batch.orig ? '원본 파일' : '사진'}을 보냈어요`);
  } catch (e) { toast('보내지 못했어요. 첨부한 파일은 그대로 있으니 다시 보내 주세요'); }
  finally { photoSends.delete(room); updatePhotoPreview(); }
}
function showAttachment(token, origin) {
  const m = decodeAttachment(token); if (!m) return;
  const container = origin?.closest('.bub,.thread-parent-content,.message-reply');
  const metas = container ? [...container.querySelectorAll('[data-file-token]')].map(el => decodeAttachment(el.dataset.fileToken)).filter(meta => meta && previewableImage(meta.mime)) : [m];
  const unique = metas.filter((meta, i) => metas.findIndex(other => other.id === meta.id) === i);
  const items = unique.length ? unique.map(meta => ({ meta, getSource: (priority = true) => loadAttachment(meta, { priority }) })) : [{ meta: m, getSource: () => loadAttachment(m) }];
  return openImageReview(m, () => loadAttachment(m), items, Math.max(0, items.findIndex(item => item.meta.id === m.id)));
}
document.addEventListener('change', e => { if (e.target.matches?.('[data-photo-orig]')) { const batch = chatPhotos.get(thSel); if (batch && !photoSends.has(thSel)) { batch.orig = e.target.checked; batch.files.forEach(p => { p.meta = null; }); updatePhotoPreview(); } return; } if (e.target.id === 'chatPhotoInput') { selectChatFiles([...e.target.files]); e.target.value = ''; } });
document.addEventListener('paste', e => {
  if (!e.target.closest('.cbox')) return;
  const images = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if (images.length) { e.preventDefault(); selectChatFiles(images); }
});
document.addEventListener('dragover', e => { if (e.target.closest('.cbox') && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.target.closest('.cbox') && e.dataTransfer?.files.length) { e.preventDefault(); selectChatFiles([...e.dataTransfer.files]); } });
document.addEventListener('click', async e => {
  const remove = e.target.closest('[data-photo-remove]');
  if (remove && !photoSends.has(thSel)) { const batch = chatPhotos.get(thSel), p = batch?.files.find(p => p.id === remove.dataset.photoRemove); if (p) { if (p.meta) attachmentCache.delete(p.meta.id); URL.revokeObjectURL(p.url); if (p.smallUrl) URL.revokeObjectURL(p.smallUrl); batch.files = batch.files.filter(f => f !== p); if (!batch.files.length) chatPhotos.delete(thSel); } updatePhotoPreview(); }
  if (e.target.closest('[data-add-files]') && !photoSends.has(thSel)) $('#chatPhotoInput')?.click();
  const pick = e.target.closest('[data-pick-file]'); if (pick) { closeSheet(); $('#chatPhotoInput')?.click(); }
  const view = e.target.closest('[data-photo-view]'); if (view) return showAttachment(view.dataset.photoView, view);
  const pdfBtn = e.target.closest('[data-pdf-view]'); if (pdfBtn) { const pm = decodeAttachment(pdfBtn.dataset.pdfView); if (pm) openPdfViewer(pm); return; }
  const draftView = e.target.closest('[data-draft-view]');
  if (draftView) {
    const files = chatPhotos.get(thSel)?.files.filter(p => previewableImage(p.file.type)) || [];
    const index = files.findIndex(p => p.id === draftView.dataset.draftView);
    if (index >= 0) { const items = files.map(p => ({ meta: { name: p.file.name, size: p.file.size }, getSource: () => Promise.resolve(p.url) })); return openImageReview(items[index].meta, items[index].getSource, items, index); }
  }
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
    try { const pending = loadAttachment(m); prefetchAttachmentNeighbors(card); const url = await pending; if (img.isConnected) { img.onload = () => { const label = card.querySelector('.attachment-resolution'); if (label) label.textContent = `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px · ${fileSize(m.size)} · ${m.q === 's' ? '작게 보냄' : '원본'}`; }; img.src = url; img.hidden = false; card.querySelector('.photo-loading')?.remove(); } }
    catch { if (card.isConnected) card.querySelector('.photo-loading').textContent = '눌러서 원본 보기'; }
  });
  pumpOriginals();
}
function pumpOriginals() {
  while (originalLoads < 2 && originalQueue.length) { originalLoads++; originalQueue.shift()().finally(() => { originalLoads--; pumpOriginals(); }); }
}
const originalObserver = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) { originalObserver.unobserve(e.target); loadVisibleOriginal(e.target.querySelector("img")); } }, { rootMargin: '100px' });
const attachmentObserver = new MutationObserver(() => {
  document.querySelectorAll('[data-file-image]:not([data-observed])').forEach(img => { img.dataset.observed = '1'; originalObserver.observe(img.closest('.chat-photo')); });
});
attachmentObserver.observe(document.querySelector('#app'), { childList: true, subtree: true });
attachmentObserver.observe(document.querySelector('#sheet'), { childList: true, subtree: true });

// PDF 그리기 (pdf.js 4.2.67 이상만 씀: 그 아래는 악성 PDF가 글꼴로 코드를 실행하는 보안 구멍 CVE-2024-4367이 있음)
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/';
let pdfjsPromise = null, pdfViewer = null;
function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return pdfjsPromise ||= import(PDFJS_BASE + 'pdf.min.mjs').then(lib => {
    lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.mjs'; window.pdfjsLib = lib; return lib;
  }).catch(err => { pdfjsPromise = null; throw err; });
}
const pdfDocs = new Map();
function pdfDocFor(m) {
  if (!pdfDocs.has(m.id)) pdfDocs.set(m.id, (async () => {
    const url = await loadAttachment(m), lib = await loadPdfjs();
    return lib.getDocument({ url, isEvalSupported: false }).promise;
  })().catch(err => { pdfDocs.delete(m.id); throw err; }));
  return pdfDocs.get(m.id);
}
// 쪽마다 캔버스에 그림. 화면이 다시 그려지면 stale()이 true가 되어 멈춤
async function drawPdfPages(doc, pagesEl, stageEl, zoom, stale) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), width = Math.max(240, stageEl.clientWidth - 24) * zoom, last = Math.min(doc.numPages, 40);
  pagesEl.innerHTML = '';
  for (let n = 1; n <= last; n++) {
    if (stale()) return false;
    const page = await doc.getPage(n), base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: (width / base.width) * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    canvas.style.width = width + 'px'; canvas.style.height = (vp.height / dpr) + 'px'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${n}쪽`);
    pagesEl.append(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }
  return !stale();
}
const pdfPagesNote = doc => doc.numPages > 40 ? `처음 40쪽만 보여요 (전체 ${doc.numPages}쪽, 저장해서 보세요)` : `${doc.numPages}쪽`;
// 폰 뒤로 가기는 전체 화면 뷰어만 닫음 (이미지 뷰어와 같은 방식)
window.addEventListener('popstate', e => { if (pdfViewer) { e.stopImmediatePropagation(); pdfViewer.closeViewer(true); } }, true);
// 메신저 PDF: 전체 화면 뷰어
async function openPdfViewer(m) {
  if (pdfViewer) pdfViewer.closeViewer(false);
  const dialog = document.createElement('dialog');
  dialog.className = 'pdf-viewer'; dialog.setAttribute('aria-label', 'PDF 보기');
  dialog.innerHTML = `<header class="pv-header"><strong class="pv-title">${esc(m.name)}</strong><span class="pv-info" role="status">불러오는 중…</span><button class="pv-out" aria-label="작게">−</button><button class="pv-in" aria-label="크게">＋</button><button class="pv-down" aria-label="PDF 저장">저장</button><button class="pv-close" aria-label="닫기">✕</button></header><div class="pv-stage"><div class="pv-pages"></div></div>`;
  document.body.append(dialog); dialog.showModal(); pdfViewer = dialog;
  const stage = dialog.querySelector('.pv-stage'), pages = dialog.querySelector('.pv-pages'), info = dialog.querySelector('.pv-info');
  const historyId = 'pdf_' + Date.now(), previousOverflow = document.documentElement.style.overflow;
  try { history.pushState({ ...history.state, pdfViewer: historyId }, ''); } catch {}
  document.documentElement.style.overflow = 'hidden';
  let zoom = 1, doc = null, token = 0, url = '';
  dialog.closeViewer = (fromPop) => {
    token++; if (pdfViewer === dialog) pdfViewer = null;
    document.documentElement.style.overflow = previousOverflow; try { dialog.close(); } catch {} dialog.remove();
    if (!fromPop && history.state?.pdfViewer === historyId) { try { history.back(); } catch {} }
  };
  dialog.addEventListener('cancel', e => { e.preventDefault(); dialog.closeViewer(false); });
  const render = async () => { const mine = ++token; if (await drawPdfPages(doc, pages, stage, zoom, () => mine !== token) && mine === token) info.textContent = pdfPagesNote(doc); };
  dialog.addEventListener('click', e => {
    if (e.target.closest('.pv-close')) return dialog.closeViewer(false);
    if (e.target.closest('.pv-down') && url) { const a = document.createElement('a'); a.href = url; a.download = m.name; a.click(); return; }
    const step = e.target.closest('.pv-in') ? 1 : e.target.closest('.pv-out') ? -1 : 0;
    if (step && doc) { const next = Math.max(0.6, Math.min(3, +(zoom + step * 0.4).toFixed(2))); if (next !== zoom) { zoom = next; render(); } }
  });
  try {
    url = await loadAttachment(m); doc = await pdfDocFor(m);
    if (pdfViewer !== dialog) return;
    await render();
  } catch (err) { if (pdfViewer === dialog) info.textContent = 'PDF를 열지 못했어요. 저장해서 봐 주세요'; }
}

// 회의 자료: 회의(예정 포함)에 PDF, 사진, 파일을 올려 두고, 회의 화면에서 눌러 그 자리에서 보고 메모함
// 시트 구조는 그대로: 자료는 기록(logs)에 안건id=회의id, 내용=[[파일:...]] 로 저장, 파일 자체는 드라이브.
// 자료에 단 메모는 기록(logs)에 안건id=자료 기록 id, 내용=메모 글 로 저장
const isFileLog = l => /\[\[파일:[A-Za-z0-9+/=]+\]\]/.test(l.내용 || '');
const meetingMaterials = meetingId => D.logs.filter(l => l.안건id === meetingId && isFileLog(l)).sort((a, b) => (a.시각 < b.시각 ? 1 : -1));
const materialMeta = l => { const t = String(l.내용 || '').match(/\[\[파일:([A-Za-z0-9+/=]+)\]\]/); return t ? decodeAttachment(t[1]) : null; };
const isMaterialLog = l => D.meetings.some(m => m.id === l.안건id) || D.logs.some(x => x.id === l.안건id && D.meetings.some(m => m.id === x.안건id));
const canEditLog = l => l.작성자 === who || isBoss();
let matSel = '', matZoom = 1, matDraft = '', matScroll = 0, matToken = 0, materialBusy = false, matFold = null; // matFold: null이면 자료가 있거나 예정 회의일 때만 펴 둠
const matIcon = mime => mime === 'application/pdf' ? '📄' : previewableImage(mime) ? '🖼' : '📎';
function meetingMaterialsHtml(m) {
  const logs = meetingMaterials(m.id);
  if (matSel && !logs.some(l => l.id === matSel)) matSel = '';
  const rows = logs.map(l => {
    const meta = materialMeta(l); if (!meta) return '';
    const n = D.logs.filter(x => x.안건id === l.id).length;
    return `<button type="button" class="matrow ${l.id === matSel ? 'on' : ''}" data-matopen="${esc(l.id)}" aria-pressed="${l.id === matSel}"><span class="mat-ic" aria-hidden="true">${matIcon(meta.mime)}</span><span class="mat-tx"><b>${esc(meta.name)}</b><small>${esc(logWho(l))}, ${esc(String(l.시각 || '').slice(5))}${n ? `, 메모 ${n}개` : ''}</small></span><span class="chev">›</span></button>`;
  }).join('');
  const sel = logs.find(l => l.id === matSel), meta = sel && materialMeta(sel);
  let viewer = '';
  if (sel && meta) {
    const memos = D.logs.filter(x => x.안건id === sel.id).sort((a, b) => (a.시각 < b.시각 ? -1 : 1));
    const zoomable = meta.mime === 'application/pdf' || previewableImage(meta.mime);
    viewer = `<div class="matview"><div class="matdoc"><div class="matbar"><b class="matname">${esc(meta.name)}</b><span id="matInfo" class="pv-info" role="status"></span>${zoomable ? '<button type="button" data-matzoom="-1" aria-label="작게">−</button><button type="button" data-matzoom="1" aria-label="크게">＋</button>' : ''}<button type="button" data-matsave="${esc(sel.id)}">저장</button>${canEditLog(sel) ? `<button type="button" data-matdel="${esc(sel.id)}">지우기</button>` : ''}<button type="button" data-matclose aria-label="닫기">✕</button></div><div class="matstage" id="matStage"></div></div>
      <div class="matmemo"><div class="eyebrow">메모 <small>${memos.length}개</small></div>${memos.map(x => `<div class="memo"><small>${esc(logWho(x))}, ${esc(String(x.시각 || '').slice(5))}${canEditLog(x) ? `<button type="button" class="memo-del" data-memodel="${esc(x.id)}">지우기</button>` : ''}</small><p>${esc(x.내용)}</p></div>`).join('') || '<div class="caption">보면서 적을 말을 남겨요</div>'}
      <textarea id="matMemo" rows="3" maxlength="4000" placeholder="이 자료에 대한 메모">${esc(matDraft)}</textarea><button type="button" class="btn sec2" data-matmemo="${esc(sel.id)}" style="height:44px;font-size:15px">메모 저장</button></div></div>`;
  }
  const open = matFold === null ? (logs.length > 0 || m.날짜 > today()) : matFold;
  return `<div class="card matcard"><div class="mathead"><button type="button" class="acc-head" data-acc="mat" aria-expanded="${open}"><span class="eyebrow">회의 자료 <small>${logs.length}개</small></span><span class="acc-chev" aria-hidden="true">⌄</span></button><label class="matadd"><input type="file" id="meetFileInput" multiple class="mat-input">＋ 올리기</label></div>${open ? `${rows || `<div class="caption">${m.날짜 > today() ? '예정된 회의예요. 미리 자료를 올려 두면 회의 때 눌러서 바로 봐요' : '아직 자료가 없어요'}</div>`}${viewer}` : ''}</div>`;
}
// 화면이 다시 그려진 뒤 열려 있는 자료를 그 자리에 그림 (render가 queueMicrotask로 부름)
function mountMaterialViewer() {
  const host = document.getElementById('matStage'); if (!host) return;
  const l = D.logs.find(x => x.id === matSel), m = l && materialMeta(l); if (!m) return;
  const mine = ++matToken, stale = () => mine !== matToken || !host.isConnected, info = document.getElementById('matInfo');
  if (m.mime === 'application/pdf') {
    host.innerHTML = '<div class="pv-pages"></div>'; info.textContent = '불러오는 중…';
    pdfDocFor(m).then(async doc => { if (stale()) return; if (await drawPdfPages(doc, host.firstChild, host, matZoom, stale)) { info.textContent = pdfPagesNote(doc); host.scrollTop = matScroll; } })
      .catch(() => { if (!stale()) info.textContent = 'PDF를 열지 못했어요. 저장해서 봐 주세요'; });
  } else if (previewableImage(m.mime)) {
    host.innerHTML = '<img class="mat-img" alt="">'; info.textContent = '불러오는 중…';
    loadAttachment(m).then(src => { if (stale()) return; const img = host.querySelector('img'); img.alt = m.name; img.style.width = (100 * matZoom) + '%'; img.onload = () => { host.scrollTop = matScroll; }; img.src = src; info.textContent = ''; })
      .catch(() => { if (!stale()) info.textContent = '사진을 열지 못했어요. 저장해서 봐 주세요'; });
  } else host.innerHTML = '<div class="caption" style="padding:16px">이 파일은 여기서 미리 볼 수 없어요. 위의 저장을 눌러 받아 주세요</div>';
}
async function uploadMeetingMaterials(files) {
  const mid = meetSel; if (!mid || !files.length || materialBusy) return;
  if (!who) return askWho();
  materialBusy = true; let ok = 0, rejected = 0, lastId = '';
  try {
    for (const file of files) {
      if (!file.size || file.size > 20 * 1024 * 1024) { rejected++; continue; }
      try {
        const f = await shrinkPhoto(file), small = f !== file ? { q: 's' } : {}, bytes = await f.arrayBuffer(), sha256 = await digestFile(bytes), uploadId = uid('l_mfile_') + (small.q ? 's' : '');
        toast(`올리는 중… ${ok + 1} / ${files.length}`);
        let meta;
        if (DEMO) meta = { id: 'demo_' + uploadId, name: f.name.slice(0, 240), mime: f.type || 'application/octet-stream', size: f.size, sha256, ...small };
        else {
          const result = await post({ type: 'attachmentUpload', uploadId, name: f.name, mime: f.type || 'application/octet-stream', b64: await b64(f), sha256 });
          if (!result.file || result.file.sha256 !== sha256 || result.file.size !== f.size) throw new Error('checksum');
          meta = { ...result.file, ...small };
        }
        attachmentCache.set(meta.id, Promise.resolve(URL.createObjectURL(f))); await cacheOriginalFile(meta, f);
        const token = encodeAttachment(meta); if (!decodeAttachment(token)) throw new Error('file');
        const log = { id: uid('l_mat_'), 안건id: mid, 시각: stamp(), 작성자: who, 내용: '[[파일:' + token + ']]' };
        if (!DEMO) await post({ type: 'save', kind: 'log', data: log });
        D.logs.push(log); ok++; lastId = log.id;
      } catch (e) { rejected++; }
    }
  } finally { materialBusy = false; }
  if (ok && meetSel === mid) { matSel = lastId; matZoom = 1; matScroll = 0; matDraft = ''; render(); }
  toast(ok ? `회의 자료 ${ok}개를 올렸어요${rejected ? `, ${rejected}개는 못 올렸어요 (20MB까지)` : ''}` : '자료를 올리지 못했어요. 파일은 20MB까지, 다시 눌러 주세요');
}
document.addEventListener('change', e => { if (e.target.id === 'meetFileInput') { const files = [...e.target.files]; e.target.value = ''; uploadMeetingMaterials(files); } });
document.addEventListener('input', e => { if (e.target.id === 'matMemo') matDraft = e.target.value; });
document.addEventListener('scroll', e => { if (e.target.id === 'matStage') matScroll = e.target.scrollTop; }, true);
document.addEventListener('click', async e => {
  const acc = e.target.closest('[data-acc="mat"]');
  if (acc) { matFold = acc.getAttribute('aria-expanded') !== 'true'; render(); return; }
  const open = e.target.closest('[data-matopen]');
  if (open) { const id = open.dataset.matopen; matSel = matSel === id ? '' : id; matZoom = 1; matScroll = 0; matDraft = ''; render(); return; }
  if (e.target.closest('[data-matclose]')) { matSel = ''; matDraft = ''; render(); return; }
  const zoom = e.target.closest('[data-matzoom]');
  if (zoom) { matZoom = Math.max(0.6, Math.min(3, +(matZoom + (+zoom.dataset.matzoom) * 0.4).toFixed(2))); mountMaterialViewer(); return; }
  const save = e.target.closest('[data-matsave]');
  if (save) { const l = D.logs.find(x => x.id === save.dataset.matsave), m = l && materialMeta(l); if (!m) return; try { const a = document.createElement('a'); a.href = await loadAttachment(m); a.download = m.name; a.click(); } catch { toast('저장하지 못했어요. 다시 눌러 주세요'); } return; }
  const memo = e.target.closest('[data-matmemo]');
  if (memo) {
    const text = (document.getElementById('matMemo')?.value || '').trim(); if (!text) return toast('메모를 적어 주세요');
    if (!who) return askWho();
    const log = { id: uid('l_memo_'), 안건id: memo.dataset.matmemo, 시각: stamp(), 작성자: who, 내용: text };
    try { if (!DEMO) await post({ type: 'save', kind: 'log', data: log }); D.logs.push(log); matDraft = ''; render(); toast('메모를 남겼어요'); } catch { toast('메모를 남기지 못했어요. 다시 눌러 주세요'); }
    return;
  }
  const memoDel = e.target.closest('[data-memodel]');
  if (memoDel) { const l = D.logs.find(x => x.id === memoDel.dataset.memodel); if (!l || !canEditLog(l) || !confirm('이 메모를 지울까요?')) return; try { await del('log', l.id); render(); } catch { toast('지우지 못했어요. 다시 눌러 주세요'); } return; }
  const del1 = e.target.closest('[data-matdel]');
  if (del1) {
    const id = del1.dataset.matdel, l = D.logs.find(x => x.id === id); if (!l || !canEditLog(l)) return;
    if (!confirm('이 회의 자료와 달린 메모를 지울까요?')) return;
    const gone = materialMeta(l);
    try { for (const x of D.logs.filter(x => x.안건id === id)) await del('log', x.id); await del('log', id); if (gone) { attachmentCache.delete(gone.id); pdfDocs.delete(gone.id); } matSel = ''; matDraft = ''; render(); toast('지웠어요'); } catch { toast('지우지 못했어요. 다시 눌러 주세요'); }
  }
});
