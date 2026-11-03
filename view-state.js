// Restore this tab on reload, while fresh visits still use the selected start page.
let boardRestoreAttempted = false, boardRestoring = false, boardPersistTimer;
function boardViewKey() {
  let user = ''; try { user = localStorage.getItem('ot-who') || ''; } catch {}
  user = ({ 정한섭: '한섭', 안보혜: '보혜', 김시원: '시원', 김진: '진' })[user] || user;
  return 'ot-last-view-v1-' + (/[?&]demo=1/.test(location.search) || window.PREVIEW_DATA ? 'demo-' : 'live-') + user;
}
function reloadBoardView() {
  try {
    const kind = performance.getEntriesByType('navigation')[0]?.type;
    if (!['reload', 'back_forward'].includes(kind)) return null;
    const saved = JSON.parse(sessionStorage.getItem(boardViewKey()) || 'null');
    return saved?.version === 1 && ['me', 'chat', 'todo', 'meet', 'idea', 'ho', 'rec', 'fix', 'home'].includes(saved.tab) ? saved : null;
  } catch { return null; }
}
function persistBoardView() {
  if (boardRestoring || !D || !PEOPLE.includes(who)) return;
  try {
    const panel = $('#dim')?.classList.contains('on') && messagePanel && ($('#messageReplies') || $('#pinnedMessages')) ? { ...messagePanel, scroll: $('#sheet').scrollTop, draft: $('#messageReplyText')?.value || '' } : null;
    const header = document.querySelector('.chead')?.getBoundingClientRect().bottom || 0;
    const file = [...document.querySelectorAll('.msgs [data-file-image]')].find(img => { const r = img.closest('.attachment').getBoundingClientRect(); return r.bottom > header && r.top < innerHeight; });
    const message = [...document.querySelectorAll('.msgs [data-message-id]')].find(el => { const r = el.getBoundingClientRect(); return r.bottom > header && r.top < innerHeight; });
    const anchor = file?.closest('.attachment') || message;
    sessionStorage.setItem(boardViewKey(), JSON.stringify({ version: 1, tab, th: tab === 'chat' ? thSel : '', rec: tab === 'rec' ? recSel : '', meet: meetSel, panel, gallery: imageReview?.open && imageReview.dataset.restoreGallery ? JSON.parse(imageReview.dataset.restoreGallery) : null,
      draft: tab === 'chat' && thSel ? ($('#cText')?.value || cDraft || '').slice(0, 10000) : '',
      scroll: { y: scrollY, file: file?.dataset.fileImage || '', message: message?.dataset.messageId || '', offset: anchor?.getBoundingClientRect().top || 0 } }));
  } catch {}
}
function scheduleBoardViewSave() { clearTimeout(boardPersistTimer); boardPersistTimer = setTimeout(persistBoardView, 80); }
function resumeBoardScreen() {
  if (boardRestoreAttempted) { render(); return needWho(); }
  boardRestoreAttempted = true;
  if (FULL[who]) { who = FULL[who]; ls.set('ot-who', who); }
  const saved = reloadBoardView(); boardRestoring = !!saved;
  if (saved && PEOPLE.includes(who)) {
    tab = saved.tab;
    if (tab === 'chat') { thSel = thList().some(t => t.id === saved.th) ? saved.th : ''; cDraft = thSel && typeof saved.draft === 'string' ? saved.draft : ''; }
    if (tab === 'rec') recSel = D.recs.some(r => r.id === saved.rec) ? saved.rec : '';
    if (D.meetings.some(m => m.id === saved.meet)) meetSel = saved.meet;
  }
  render(); needWho();
  requestAnimationFrame(() => {
    if (saved && thSel && saved.panel?.room === thSel) {
      if (saved.panel.kind === 'pins') openPinnedMessages(thSel);
      else if (saved.panel.kind === 'thread' && messageRoot(thSel, saved.panel.id)) {
        if (typeof saved.panel.draft === 'string') messageDrafts.set(saved.panel.id, saved.panel.draft.slice(0, 10000));
        openMessageThread(thSel, saved.panel.id);
      }
      if ($('#dim').classList.contains('on')) $('#sheet').scrollTop = Math.max(0, saved.panel.scroll || 0);
    }
    if (thSel && Array.isArray(saved?.gallery?.tokens) && saved.gallery.tokens.length <= 30) {
      const t = thList().find(t => t.id === thSel), content = t && [t.첫글, ...t.rs.map(l => l.내용)].join('\n');
      const tokens = saved.gallery.tokens;
      if (content && tokens.every(token => typeof token === 'string' && decodeAttachment(token) && content.includes('[[파일:' + token + ']]'))) {
        const items = tokens.map(token => { const meta = decodeAttachment(token); return { meta, getSource: (priority = true) => loadAttachment(meta, { priority }) }; });
        const index = Math.max(0, Math.min(items.length - 1, +saved.gallery.index || 0));
        if (items.length) openImageReview(items[index].meta, items[index].getSource, items, index);
      }
    }
    boardRestoring = false;
    if (saved?.scroll) restoreBoardScroll(saved.scroll);
    persistBoardView();
  });
}
function restoreBoardScroll(position) {
  const valid = id => typeof id === 'string' && /^[\w-]{1,200}$/.test(id);
  const target = () => valid(position.file) && document.querySelector(`[data-file-image="${position.file}"]`)?.closest('.attachment') || valid(position.message) && document.querySelector(`[data-message-id="${position.message}"]`);
  const restore = () => { const el = target(); scrollTo(0, el ? scrollY + el.getBoundingClientRect().top - (position.offset || 0) : Math.max(0, position.y || 0)); };
  // Image heights can change after the room appears; keep the saved anchor until
  // the user acts, rather than jumping to the newest message on every load.
  const events = new AbortController(), stop = () => events.abort();
  for (const name of ['wheel', 'pointerdown', 'keydown']) window.addEventListener(name, stop, { once: true, passive: true, signal: events.signal });
  $('#app').addEventListener('load', restore, { capture: true, signal: events.signal });
  setTimeout(stop, 15000); restore();
}
document.addEventListener('click', () => queueMicrotask(scheduleBoardViewSave));
document.addEventListener('input', scheduleBoardViewSave);
window.addEventListener('scroll', scheduleBoardViewSave, { passive: true });
window.addEventListener('pagehide', persistBoardView);
window.addEventListener('beforeunload', persistBoardView);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistBoardView(); });
