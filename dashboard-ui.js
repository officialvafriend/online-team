function initialBoardTab() {
  const allowed = ['me', 'chat', 'todo', 'meet', 'idea', 'ho', 'rec', 'fix', 'home'];
  const linked = new URLSearchParams(location.search).get('view');
  if (allowed.includes(linked)) return linked;
  try { const start = localStorage.getItem('ot-start-' + (localStorage.getItem('ot-who') || '')); return allowed.includes(start) ? start : 'me'; }
  catch { return 'me'; }
}
function boardFavorites() {
  const local = jp(ls.get('ot-favorites-' + who), null);
  return (Array.isArray(local) ? local : ['me', ...profOf(who).f]).filter((k, i, a) => a.indexOf(k) === i && TABS.some(([t]) => t === k)).slice(0, 6);
}
function favoriteLinks() {
  return `<div class="favorite-head"><span>즐겨찾기</span><button class="ic" data-board-prefs aria-label="즐겨찾기 설정">편집</button></div>${boardFavorites().map(k => `<button class="navb ${tab === k ? 'on' : ''}" data-tab="${k}"><span class="favorite-star">☆</span>${esc(tabName(k))}</button>`).join('')}`;
}
function boardHelpButton() { return `<button class="ic board-help" data-board-help>ⓘ 사용방법</button>`; }
function teamStatusHtml() {
  return `<div class="team-status-heading">팀원 한 줄 상태 <small>프로필에서 수정할 수 있어요</small></div><div class="dmrow team-status">${PEOPLE.map(p => `<button class="dmb status-person" ${p === who ? 'data-act="prof"' : `data-dm="${p}"`} aria-label="${esc(PNAME(p))}: ${esc(profOf(p).s || '한 줄 상태 없음')}">${avHtml(p, 'md')}<span>${esc(PNAME(p))}${p === who ? ' · 나' : ''}</span><small>${esc(profOf(p).s || '아직 한 줄 상태가 없어요')}</small></button>`).join('')}<button class="dmb status-new" data-act="thnew"><span class="dmplus">＋</span><span>새 방</span></button></div>`;
}
function boardPrefs() {
  const chosen = boardFavorites(), start = ls.get('ot-start-' + who) || 'me';
  openSheet(`<h3>즐겨찾기와 첫 화면</h3><p class="caption">이 기기에서 내 이름별로 기억해요.</p><div class="lbl">즐겨찾기 <small>최대 6개</small></div><div class="favorite-choices">${TABS.map(([k, n]) => `<label><input type="checkbox" name="boardFavorite" value="${k}" ${chosen.includes(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div><div class="lbl">처음 열리는 화면</div><select class="in" id="boardStart">${TABS.map(([k, n]) => `<option value="${k}" ${start === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><div class="btns"><button class="btn" data-board-prefs-save>저장</button></div><p class="caption">브라우저 즐겨찾기에 나의 보드를 바로 넣으려면 <a href="?view=me">나의 보드 바로가기</a>를 열고 즐겨찾기에 추가하세요.</p>`);
}
function boardHelp() {
  const g = groupOf(tab);
  const text = g === 'chat' ? [
    ['대화방', '팀원 프로필을 누르면 1:1 대화, ＋ 새 방을 누르면 여러 명이 대화할 방을 만들어요. 프로필 아래에는 각자의 한 줄 상태가 보여요.'],
    ['사진·파일 보내기', '입력칸 왼쪽 클립 → 첨부파일 첨부하기로 골라요. 캡처는 입력칸에서 Ctrl+V(맥은 ⌘V)로 붙여넣고 보내기를 눌러요. 파일당 20MB까지 원본 그대로 보관해요.'],
    ['사진 크게 보기', '대화 속 사진을 누르면 크게 볼 수 있어요. 한 번 더 누르면 100% 크기로 확인하고, 원본 다운로드로 저장해요.'],
    ['안건·클로드', '클립 메뉴에서 안건을 공유해요. 클로드 아이콘은 대화 내용을 물어볼 때 써요.'],
    ['돌아가기', '대화가 길어져도 상단 제목과 뒤로가기 버튼은 화면 위에 남아 있어요.'],
  ] : g === 'todo' ? [
    ['나의 보드', '내 일정과 할 일, 메모, 내가 올린 제안을 한곳에서 봐요.'],
    ['할 일 넣기', '한 줄 입력칸에 할 일을 적어요. 담당자와 날짜를 함께 적으면 자동으로 정리돼요.'],
    ['즐겨찾기', '메뉴의 즐겨찾기 편집에서 자주 쓰는 칸과 처음 열리는 화면을 골라요.'],
  ] : [
    ['회의', '회의를 만들고 안건과 담당자, 마감일을 함께 정해요.'],
    ['녹음·회의록', '회의 녹음을 정리하고, 회의록 대화방에서 이어서 이야기할 수 있어요.'],
  ];
  openSheet(`<h3>${g === 'chat' ? '메신저' : g === 'todo' ? '할 일' : '회의'} 사용방법</h3>${text.map(([title, body]) => `<div class="help-section"><h4>${title}</h4><p>${body}</p></div>`).join('')}<div class="btns"><button class="btn gray" data-x>닫기</button></div>`);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-board-prefs]')) return boardPrefs();
  if (e.target.closest('[data-board-help]')) return boardHelp();
  if (e.target.closest('[data-board-prefs-save]')) {
    const values = [...document.querySelectorAll('[name="boardFavorite"]:checked')].map(x => x.value);
    if (values.length > 6) return toast('즐겨찾기는 6개까지 골라 주세요');
    ls.set('ot-favorites-' + who, JSON.stringify(values)); ls.set('ot-start-' + who, $('#boardStart').value);
    closeSheet(); render(); return toast('즐겨찾기와 첫 화면을 저장했어요');
  }
});
