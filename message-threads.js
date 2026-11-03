// Keep replies and pin events in the room's existing log stream so all members
// receive them through the same live endpoint, without a second polling loop.
const MESSAGE_REPLY = /^\[\[메시지답글:([\w-]+)\]\]\n?/;
const MESSAGE_PIN = /^\[\[메시지고정:([\w-]+)\|(0|1)\|(\d{13})\]\]$/;
const messageDrafts = new Map(), messageBusy = new Set(), messagePendingReplies = new Map();
let messagePanel = null;
const replyParent = l => String(l.내용 || '').match(MESSAGE_REPLY)?.[1] || '';
const pinEvent = l => String(l.내용 || '').match(MESSAGE_PIN);
const replyText = l => String(l.내용 || '').replace(MESSAGE_REPLY, '');
function messageThreadState(t) {
  const counts = new Map(), pins = new Map();
  for (const l of t.rs) {
    const parent = replyParent(l); if (parent) counts.set(parent, (counts.get(parent) || 0) + 1);
    const p = pinEvent(l);
    if (p && (!pins.has(p[1]) || +p[3] >= pins.get(p[1]).at)) pins.set(p[1], { on: p[2] === '1', at: +p[3] });
  }
  return { counts, pins: new Set([...pins].filter(([, p]) => p.on).map(([id]) => id)) };
}
function visibleRoomMessages(t) {
  const list = (t.첫글 ? [{ id: t.id, 안건id: t.id, 작성자: t.작성자, 시각: t.시각, 내용: t.첫글, _first: true }] : []).concat(t.rs.filter(l => !replyParent(l) && !pinEvent(l)));
  const ids = new Set(list.map(l => l.id));
  for (const l of t.rs) { const parent = replyParent(l); if (parent && !ids.has(parent)) { ids.add(parent); list.push({ id: parent, 안건id: t.id, 내용: '원본 메시지가 삭제되었어요', 작성자: '', 시각: l.시각, _missing: true }); } }
  return list.sort((a, b) => String(a.시각).localeCompare(String(b.시각)));
}
function messageRoot(room, id) {
  const t = thList().find(t => t.id === room);
  return t && visibleRoomMessages(t).find(l => l.id === id);
}
function messageActions(l, room, state) {
  if (!l.id || !/^[\w-]+$/.test(l.id) || !/^[\w-]+$/.test(room)) return '';
  const n = state.counts.get(l.id) || 0, pinned = state.pins.has(l.id);
  return `<div class="message-actions">${!l._missing ? `<button data-message-pin="${l.id}" data-message-room="${room}" aria-pressed="${pinned}">${pinned ? '고정 해제' : '메시지 고정'}</button>` : ''}<button data-message-thread="${l.id}" data-message-room="${room}">${n ? `답글 ${n}개` : '쓰레드 답글'}</button></div>`;
}
function messagePinBar(t) {
  const state = messageThreadState(t), count = visibleRoomMessages(t).filter(l => state.pins.has(l.id)).length;
  return `<button class="message-pinbar" data-message-pins="${t.id}"><span>고정 메시지</span><b>${count}</b><span>모아보기 ›</span></button>`;
}
function messageExcerpt(l) { return thPlain(replyText(l)).replace(MESSAGE_PIN, '').replace(/\s+/g, ' ').slice(0, 150) || '첨부파일'; }
function openMessageThread(room, id) {
  const root = messageRoot(room, id); if (!root) return toast('메시지를 찾을 수 없어요');
  messagePanel = { kind: 'thread', room, id };
  openSheet(`<div class="thread-heading"><h3>메시지 쓰레드</h3><button class="ic" data-x aria-label="쓰레드 닫기">닫기</button></div><div class="thread-parent"><small>${esc(root.작성자 ? PNAME(logWho(root)) : '')} · ${esc(root.시각)}</small><div class="thread-parent-content">${thBody(root.내용)}</div><button class="ic" data-message-jump="${id}">대화에서 보기</button></div><div id="messageReplies" aria-live="polite"></div><div class="thread-compose"><label class="lbl" for="messageReplyText">이 메시지에 답글</label><textarea class="in" id="messageReplyText" maxlength="10000" placeholder="이 메시지에 대한 의견을 남겨 주세요">${esc(messageDrafts.get(id) || '')}</textarea><button class="btn" data-message-reply-send>답글 보내기</button></div>`);
  refreshMessagePanels();
}
function openPinnedMessages(room) {
  messagePanel = { kind: 'pins', room };
  openSheet('<div class="thread-heading"><h3>고정 메시지</h3><button class="ic" data-x aria-label="고정 메시지 닫기">닫기</button></div><p class="caption">이 대화방의 팀원 모두가 볼 수 있어요. 메시지를 누르면 답글을 이어갈 수 있어요.</p><div id="pinnedMessages"></div>');
  refreshMessagePanels();
}
function refreshMessagePanels() {
  if (!D || !messagePanel || !$('#dim')?.classList.contains('on')) return;
  const { room, id, kind } = messagePanel, t = thList().find(t => t.id === room); if (!t) return;
  if (kind === 'pins' && $('#pinnedMessages')) {
    const pins = messageThreadState(t).pins, roots = visibleRoomMessages(t).filter(l => pins.has(l.id));
    $('#pinnedMessages').innerHTML = roots.map(l => `<article class="pinned-message"><button data-message-thread="${l.id}" data-message-room="${room}"><small>${esc(l.작성자 ? PNAME(logWho(l)) : '')} · ${esc(l.시각)}</small><p>${esc(messageExcerpt(l))}</p><span>쓰레드 열기 ›</span></button><button class="ic" data-message-pin="${l.id}" data-message-room="${room}">고정 해제</button></article>`).join('') || '<div class="empty">메시지 아래 ‘메시지 고정’을 누르면 여기에 모여요.</div>';
  }
  if (kind === 'thread' && $('#messageReplies')) {
    const replies = t.rs.filter(l => replyParent(l) === id);
    const html = `<div class="lbl">답글 ${replies.length}개</div>` + (replies.map(l => `<article class="message-reply"><small>${esc(PNAME(logWho(l)))} · ${esc(l.시각)}</small><div>${thBody(replyText(l), l.id)}</div>${logWho(l) === who || isBoss() ? `<button class="thdel" data-thdel="${l.id}">지우기</button>` : ''}</article>`).join('') || '<div class="empty">첫 답글을 남겨 보세요.</div>');
    if ($('#messageReplies').innerHTML !== html) $('#messageReplies').innerHTML = html;
    const send = document.querySelector('[data-message-reply-send]'); if (send) send.disabled = messageBusy.has('reply_' + id);
  }
}
async function toggleMessagePin(room, id) {
  const t = thList().find(t => t.id === room), root = messageRoot(room, id), key = 'pin_' + id;
  if (!who || !t || !root || root._missing || messageBusy.has(key)) return;
  messageBusy.add(key);
  const on = !messageThreadState(t).pins.has(id), log = { id: uid('l_pin_'), 안건id: room, 작성자: who, 시각: stamp(), 내용: `[[메시지고정:${id}|${on ? 1 : 0}|${Date.now()}]]` };
  try { await post({ type: 'save', kind: 'log', data: log }); if (!D.logs.some(l => l.id === log.id)) D.logs.push(log); if (thSel === room) thMsgsUpdate([]); refreshMessagePanels(); toast(on ? '메시지를 고정했어요' : '고정을 해제했어요'); }
  catch { toast('고정 상태를 저장하지 못했어요. 다시 눌러 주세요'); }
  finally { messageBusy.delete(key); }
}
async function sendMessageReply() {
  if (messagePanel?.kind !== 'thread' || !who) return;
  const { room, id } = messagePanel, text = $('#messageReplyText')?.value.trim(), key = 'reply_' + id;
  if (!text || messageBusy.has(key) || !messageRoot(room, id)) return;
  messageBusy.add(key); refreshMessagePanels();
  const log = { id: messagePendingReplies.get(id) || uid('l_reply_'), 안건id: room, 작성자: who, 시각: stamp(), 내용: `[[메시지답글:${id}]]\n${text}` };
  // Keep the same ID across a lost response, without replacing the user's text.
  messagePendingReplies.set(id, log.id);
  try {
    await post({ type: 'save', kind: 'log', data: log }); if (!D.logs.some(l => l.id === log.id)) D.logs.push(log);
    if ($('#messageReplyText')?.value.trim() === text && messagePanel?.id === id) $('#messageReplyText').value = '';
    messagePendingReplies.delete(id); if ((messageDrafts.get(id) || '').trim() === text) messageDrafts.delete(id); if (thSel === room) thMsgsUpdate([]); refreshMessagePanels(); toast('쓰레드에 답글을 남겼어요');
  } catch { toast('답글을 보내지 못했어요. 쓴 내용은 유지했어요'); }
  finally { messageBusy.delete(key); refreshMessagePanels(); }
}
document.addEventListener('input', e => { if (e.target.id === 'messageReplyText' && messagePanel) messageDrafts.set(messagePanel.id, e.target.value); });
document.addEventListener('click', e => {
  const pin = e.target.closest('[data-message-pin]'); if (pin) return toggleMessagePin(pin.dataset.messageRoom, pin.dataset.messagePin);
  const thread = e.target.closest('[data-message-thread]'); if (thread) return openMessageThread(thread.dataset.messageRoom, thread.dataset.messageThread);
  const pins = e.target.closest('[data-message-pins]'); if (pins) return openPinnedMessages(pins.dataset.messagePins);
  if (e.target.closest('[data-message-reply-send]')) return sendMessageReply();
  const jump = e.target.closest('[data-message-jump]'); if (jump) { closeSheet(); const target = document.querySelector(`[data-message-id="${jump.dataset.messageJump}"]`); if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.add('message-highlight'); setTimeout(() => target.classList.remove('message-highlight'), 2500); } }
});
document.addEventListener('keydown', e => { if (e.target.id === 'messageReplyText' && e.key === 'Enter' && !e.isComposing && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessageReply(); } });
