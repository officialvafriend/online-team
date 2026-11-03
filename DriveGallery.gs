// 사진첩: 드라이브 폴더 안 사진 목록. Called from doPost AFTER the existing KEY check:
// if (b.type === 'driveFolder') return driveFolder(b);
// 공용 계정이 볼 수 있는 폴더만 열림. 사진 바이트는 보내지 않고 id만 돌려줌(화면은 드라이브 이미지 주소로 표시)
function driveFolder(b) {
  try {
    const id = String(b.id || '');
    if (!/^[\w-]{10,200}$/.test(id)) throw new Error('folder_id');
    const cache = CacheService.getScriptCache(), hit = cache.get('gal_' + id);
    if (hit) return out(JSON.parse(hit));
    const folder = DriveApp.getFolderById(id), files = [];
    const it = folder.getFiles();
    while (it.hasNext() && files.length < 500) {
      const f = it.next();
      if (f.isTrashed() || !/^image\//.test(f.getMimeType())) continue;
      let shared = true;
      try { shared = f.getSharingAccess() === DriveApp.Access.ANYONE || f.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK; } catch (e) {}
      files.push({ id: f.getId(), name: f.getName(), shared: shared });
    }
    files.sort(function (a, c) { return a.name.localeCompare(c.name, 'ko', { numeric: true }); });
    const res = { ok: true, name: folder.getName(), files: files };
    try { cache.put('gal_' + id, JSON.stringify(res), 120); } catch (e) {}
    return out(res);
  } catch (e) { return out({ ok: false, error: String(e.message || e) }); }
}
