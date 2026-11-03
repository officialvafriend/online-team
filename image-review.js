// Image review uses the original Blob throughout, including the draft preview.
let imageReview = null;
// Register before the app navigation listener so Back closes only this viewer.
window.addEventListener('popstate', e => { if (imageReview?.open) { e.stopImmediatePropagation(); imageReview.close(); } }, true);
function openImageReview(meta, getSource, gallery = null, startIndex = 0) {
  const items = gallery?.length ? gallery : [{ meta, getSource }];
  let index = Math.max(0, Math.min(items.length - 1, startIndex)), loadVersion = 0;
  if (imageReview) imageReview.close();
  const dialog = document.createElement('dialog');
  dialog.className = 'image-review'; dialog.setAttribute('aria-label', '이미지 자세히 보기');
  const icon = (path) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">${path}</svg>`;
  dialog.innerHTML = `<header class="iv-header"><div class="iv-title"><strong>${esc(meta.name)}</strong><span class="iv-info" role="status">원본 이미지를 불러오고 있어요</span></div><button class="iv-download" aria-label="원본 이미지 다운로드">${icon('<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>')}<span>원본 다운로드</span></button><button class="iv-close" aria-label="이미지 보기 닫기">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button></header><div class="iv-toolbar" aria-label="이미지 확대 도구"><button data-iv="out" aria-label="이미지 축소">${icon('<path d="M5 12h14"/>')}</button><output class="iv-scale" aria-live="polite">—</output><button data-iv="in" aria-label="이미지 확대">${icon('<path d="M5 12h14M12 5v14"/>')}</button><span class="iv-divider"></span><button data-iv="fit">화면에 맞춤</button><button data-iv="actual">100%</button><button data-iv="double">200%</button><button data-iv="background" aria-label="이미지 배경색 바꾸기">배경</button></div><div class="iv-viewport"><div class="iv-stage" tabindex="0" aria-label="이미지. 휠이나 두 손가락으로 확대하고 드래그하여 이동"><div class="iv-loading" role="status">원본 불러오는 중…</div><div class="iv-canvas" hidden><img class="iv-image" alt="${esc(meta.name)}" draggable="false"></div></div><button class="iv-previous" aria-label="이전 이미지" ${items.length < 2 ? 'hidden' : ''}>${icon('<path d="m15 5-7 7 7 7"/>')}</button><button class="iv-next" aria-label="다음 이미지" ${items.length < 2 ? 'hidden' : ''}>${icon('<path d="m9 5 7 7-7 7"/>')}</button></div><footer class="iv-footer"><span>원본 그대로 표시 <b class="iv-gallery-count" aria-live="polite"></b></span><span class="iv-desktop-hint">휠로 확대 · 드래그로 이동 · 더블클릭 100%</span><span class="iv-touch-hint">두 손가락으로 확대 · 끌어서 이동</span></footer>`;
  document.body.append(dialog); dialog.showModal(); imageReview = dialog;
  const stage = dialog.querySelector('.iv-stage'), canvas = dialog.querySelector('.iv-canvas'), img = dialog.querySelector('.iv-image');
  const loading = dialog.querySelector('.iv-loading'), info = dialog.querySelector('.iv-info'), output = dialog.querySelector('.iv-scale');
  const historyId = 'image_' + Date.now();
  try { history.pushState({ ...history.state, imageReview: historyId }, ''); } catch {}
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  let source = '', zoom = 1, fit = 1, fitted = true, ready = false, resize;
  const pointers = new Map(); let pinch = null, swipe = null;
  const geometry = () => ({ width: Math.max(stage.clientWidth, img.naturalWidth * zoom + 48), height: Math.max(stage.clientHeight, img.naturalHeight * zoom + 48) });
  const imagePoint = (x, y) => { const g = geometry(); return { x: (stage.scrollLeft + x - (g.width - img.naturalWidth * zoom) / 2) / zoom, y: (stage.scrollTop + y - (g.height - img.naturalHeight * zoom) / 2) / zoom }; };
  function setZoom(value, x = stage.clientWidth / 2, y = stage.clientHeight / 2, anchor) {
    if (!ready) return;
    const point = anchor || imagePoint(x, y);
    zoom = Math.max(Math.min(.1, fit), Math.min(8, value));
    const g = geometry(), left = (g.width - img.naturalWidth * zoom) / 2, top = (g.height - img.naturalHeight * zoom) / 2;
    canvas.style.width = g.width + 'px'; canvas.style.height = g.height + 'px';
    Object.assign(img.style, { width: img.naturalWidth * zoom + 'px', height: img.naturalHeight * zoom + 'px', left: left + 'px', top: top + 'px' });
    stage.scrollLeft = left + point.x * zoom - x; stage.scrollTop = top + point.y * zoom - y;
    output.value = Math.round(zoom * 100) + '%';
    dialog.querySelector('[data-iv="out"]').disabled = zoom <= Math.min(.1, fit) + .001;
    dialog.querySelector('[data-iv="in"]').disabled = zoom >= 8;
    dialog.querySelector('[data-iv="fit"]').setAttribute('aria-pressed', String(fitted));
    dialog.querySelector('[data-iv="actual"]').setAttribute('aria-pressed', String(Math.abs(zoom - 1) < .001));
  }
  function fitImage() {
    fit = Math.min(1, (stage.clientWidth - 48) / img.naturalWidth, (stage.clientHeight - 48) / img.naturalHeight);
    fitted = true; setZoom(fit, stage.clientWidth / 2, stage.clientHeight / 2, { x: img.naturalWidth / 2, y: img.naturalHeight / 2 });
  }
  dialog.addEventListener('close', () => {
    loadVersion++; resize?.disconnect(); document.documentElement.style.overflow = previousOverflow;
    if (imageReview === dialog) imageReview = null;
    if (history.state?.imageReview === historyId) { navSkip++; history.back(); }
    dialog.remove();
  }, { once: true });
  function navigateImage(step) {
    const next = index + step; if (next < 0 || next >= items.length) return;
    index = next; stage.focus({ preventScroll: true }); pointers.clear(); pinch = null; swipe = null; stage.classList.remove('iv-dragging'); loadSource();
  }
  dialog.querySelector('.iv-previous').addEventListener('click', () => navigateImage(-1));
  dialog.querySelector('.iv-next').addEventListener('click', () => navigateImage(1));
  dialog.querySelector('.iv-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.iv-download').addEventListener('click', () => { if (source) { const a = document.createElement('a'); a.href = source; a.download = meta.name; a.click(); } });
  dialog.querySelector('.iv-toolbar').addEventListener('click', e => {
    const command = e.target.closest('[data-iv]')?.dataset.iv;
    if (command === 'background') return stage.classList.toggle('iv-light');
    if (!ready) return;
    if (command === 'fit') return fitImage();
    fitted = false;
    if (command === 'actual') setZoom(1);
    if (command === 'double') setZoom(2);
    if (command === 'in') setZoom(zoom * 1.5);
    if (command === 'out') setZoom(zoom / 1.5);
  });
  stage.addEventListener('wheel', e => { if (!ready) return; e.preventDefault(); fitted = false; const rect = stage.getBoundingClientRect(); setZoom(zoom * Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * .002), e.clientX - rect.left, e.clientY - rect.top); }, { passive: false });
  stage.addEventListener('dblclick', e => { if (!ready) return; const rect = stage.getBoundingClientRect(); if (Math.abs(zoom - 1) < .001) fitImage(); else { fitted = false; setZoom(1, e.clientX - rect.left, e.clientY - rect.top); } });
  stage.addEventListener('pointerdown', e => {
    if (!ready || e.button !== 0) return; stage.setPointerCapture(e.pointerId); stage.classList.add('iv-dragging');
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && e.pointerType === 'touch' && fitted && items.length > 1) swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, at: Date.now() };
    if (pointers.size > 1) swipe = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()], r = stage.getBoundingClientRect(); pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom, point: imagePoint((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top) }; }
  });
  stage.addEventListener('pointermove', e => {
    const previous = pointers.get(e.pointerId); if (!previous) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) { const [a, b] = [...pointers.values()], r = stage.getBoundingClientRect(); fitted = false; setZoom(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.distance), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pinch.point); }
    else if (pointers.size === 1) { stage.scrollLeft -= e.clientX - previous.x; stage.scrollTop -= e.clientY - previous.y; }
  });
  const release = e => {
    const move = e.type === 'pointerup' && swipe?.id === e.pointerId && fitted && Date.now() - swipe.at < 1000 && Math.abs(e.clientX - swipe.x) > 60 && Math.abs(e.clientX - swipe.x) > Math.abs(e.clientY - swipe.y) * 1.4 ? (e.clientX < swipe.x ? 1 : -1) : 0;
    pointers.delete(e.pointerId); pinch = null; swipe = null; if (!pointers.size) stage.classList.remove('iv-dragging');
    if (move) navigateImage(move);
  };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  dialog.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (items.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); navigateImage(e.key === 'ArrowRight' ? 1 : -1); return; }
    if (!ready) return;
    if (['+', '=', '-', '0', '1'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); if (e.key === '0') fitImage(); else { fitted = false; setZoom(e.key === '1' ? 1 : e.key === '-' ? zoom / 1.5 : zoom * 1.5); } }
  });
  dialog.querySelector('.iv-download').disabled = true;
  dialog.querySelectorAll('[data-iv]:not([data-iv="background"])').forEach(b => b.disabled = true);
  async function loadSource() {
    const version = ++loadVersion, current = items[index]; meta = current.meta; getSource = current.getSource;
    if (items.every(item => item.meta.id && item.meta.sha256)) dialog.dataset.restoreGallery = JSON.stringify({ tokens: items.map(item => encodeAttachment(item.meta)), index });
    ready = false; source = ''; canvas.hidden = true; loading.hidden = false; loading.textContent = '원본 불러오는 중…';
    dialog.querySelector('.iv-title strong').textContent = meta.name; img.alt = meta.name;
    dialog.querySelector('.iv-gallery-count').textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
    dialog.querySelector('.iv-previous').disabled = index === 0; dialog.querySelector('.iv-next').disabled = index === items.length - 1;
    dialog.querySelector('.iv-download').disabled = true;
    info.textContent = '원본 이미지를 불러오고 있어요'; output.value = '—';
    try {
      const pending = current.getSource(true);
      for (const nearby of [index + 1, index + 2, index - 1, index - 2]) if (items[nearby]) Promise.resolve(items[nearby].getSource(false)).catch(() => {});
      const url = await pending; if (!dialog.open || version !== loadVersion) return;
      source = url; img.src = source; await img.decode(); if (!dialog.open || version !== loadVersion) return;
      ready = true; canvas.hidden = false; loading.hidden = true;
      info.textContent = `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px · ${fileSize(meta.size)} · 원본`;
      dialog.querySelector('.iv-download').disabled = false;
      dialog.querySelectorAll('[data-iv]').forEach(b => b.disabled = false);
      fitImage(); resize?.disconnect(); resize = new ResizeObserver(() => { if (fitted) fitImage(); else setZoom(zoom); }); resize.observe(stage);
    } catch {
      if (!dialog.open || version !== loadVersion) return;
      info.textContent = '이미지를 열지 못했어요';
      loading.innerHTML = '<p>원본을 불러오지 못했어요.</p><button class="iv-retry">다시 불러오기</button>';
      loading.querySelector('button').addEventListener('click', () => { loading.textContent = '원본 다시 불러오는 중…'; loadSource(); });
    }
  }
  loadSource();
  return dialog;
}
