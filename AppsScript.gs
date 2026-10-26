// 온라인팀 회의 보드 ↔ 구글시트 연결 (공용 구글 계정에서 만들 것)
// 1) https://script.google.com → 새 프로젝트 → 이 내용 전체 붙여넣기 → KEY, SID 채우고 저장
// 2) 배포 → 새 배포 → 톱니바퀴 '웹 앱' → 실행: 나 / 액세스 권한: 모든 사용자 → 배포 → 권한 허용
// 3) 나온 웹 앱 URL(…/exec)을 index.html 의 APPS_URL 에 넣기
// 비밀번호(KEY)가 맞을 때만 읽고 쓴다. 시트 탭 3개: 회의, 안건, 기록 (없으면 자동 생성)

const KEY = '여기에_비밀번호';
const SID = '여기에_시트ID';
const HEAD = {
  '회의': ['id', '날짜', '제목', '브랜드', '참석', '메모', '만든시각'],
  '안건': ['id', '회의id', '순서', '제목', '상태', '브랜드', '분야', '담당자', '시작', '마감', '메모', '확인할것', '고친시각'],
  '기록': ['id', '안건id', '시각', '작성자', '내용'],
};

function tab(name) {
  const ss = SpreadsheetApp.openById(SID);
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(HEAD[name]); sh.setFrozenRows(1); }
  return sh;
}
function all(name) {
  const h = HEAD[name], v = tab(name).getDataRange().getDisplayValues().slice(1);
  return v.filter(r => r[0] !== '').map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i] == null ? '' : r[i]); return o; });
}
function findRow(name, id) {
  const v = tab(name).getRange(1, 1, Math.max(tab(name).getLastRow(), 1), 1).getDisplayValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === String(id)) return i + 1;
  return 0;
}
function now() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  if ((e.parameter.k || '') !== KEY) return out({ ok: false, error: 'key' });
  return out({ ok: true, at: now(), meetings: all('회의'), items: all('안건'), logs: all('기록') });
}

function doPost(e) {
  const b = JSON.parse(e.postData.contents);
  if (b.k !== KEY) return out({ ok: false, error: 'key' });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const t = b.type, name = { meeting: '회의', item: '안건', log: '기록' }[b.kind];
    if (!name) return out({ ok: false, error: 'kind' });
    const h = HEAD[name], sh = tab(name);
    if (t === 'save') {
      // 같은 id 줄이 있으면 그 줄을 고치고, 없으면 맨 아래 새 줄
      const d = b.data || {};
      if (name === '회의' && !d.만든시각) d.만든시각 = now();
      if (name === '안건') d.고친시각 = now();
      if (name === '기록' && !d.시각) d.시각 = now();
      const r = findRow(name, d.id);
      if (r) {
        const cur = sh.getRange(r, 1, 1, h.length).getDisplayValues()[0];
        sh.getRange(r, 1, 1, h.length).setValues([h.map((k, i) => (k in d ? String(d[k] == null ? '' : d[k]) : cur[i]))]);
      } else {
        sh.appendRow(h.map(k => String(d[k] == null ? '' : d[k])));
      }
      return out({ ok: true, id: d.id });
    }
    if (t === 'del') {
      const r = findRow(name, b.id);
      if (r) sh.deleteRow(r);
      if (name === '회의') {
        // 회의를 지우면 그 회의 안건과 기록도 같이
        const items = all('안건').filter(x => x.회의id === String(b.id));
        items.forEach(x => { const r2 = findRow('안건', x.id); if (r2) tab('안건').deleteRow(r2); all('기록').filter(l => l.안건id === x.id).forEach(l => { const r3 = findRow('기록', l.id); if (r3) tab('기록').deleteRow(r3); }); });
      }
      if (name === '안건') all('기록').filter(l => l.안건id === String(b.id)).forEach(l => { const r3 = findRow('기록', l.id); if (r3) tab('기록').deleteRow(r3); });
      return out({ ok: true });
    }
    return out({ ok: false, error: 'type' });
  } finally { lock.releaseLock(); }
}
