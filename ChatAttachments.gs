// Called from doPost AFTER the existing KEY check:
// if (b.type === 'attachmentUpload') return attachmentUpload(b);
// if (b.type === 'attachmentRead') return attachmentRead(b);
// Files remain private in Drive; original bytes are never resized or recompressed.
function attachmentFolder() {
  const props = PropertiesService.getScriptProperties(), key = 'CHAT_ATTACHMENT_FOLDER_ID';
  const id = props.getProperty(key);
  if (id) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder('온라인팀_첨부파일');
  props.setProperty(key, folder.getId());
  return folder;
}
function attachmentHash(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function attachmentUpload(b) {
  const lock = LockService.getScriptLock();
  try {
    if (!/^l_file_[a-z0-9]+$/.test(String(b.uploadId || ''))) throw new Error('upload_id');
    if (!/^[a-f0-9]{64}$/.test(String(b.sha256 || ''))) throw new Error('checksum');
    if (typeof b.b64 !== 'string' || b.b64.length > 27962028 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.b64)) throw new Error('file_size');
    const bytes = Utilities.base64Decode(b.b64);
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('file_size');
    if (attachmentHash(bytes) !== b.sha256) throw new Error('checksum');
    const name = String(b.name || '첨부파일').slice(0, 240), mime = String(b.mime || 'application/octet-stream');
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime)) throw new Error('mime');
    lock.waitLock(30000);
    const folder = attachmentFolder(), internalName = b.uploadId + '_' + name, files = folder.getFilesByName(internalName);
    let file;
    if (files.hasNext()) {
      file = files.next();
      if (attachmentHash(file.getBlob().getBytes()) !== b.sha256) throw new Error('upload_conflict');
    } else {
      file = folder.createFile(Utilities.newBlob(bytes, mime, internalName));
      file.setDescription(JSON.stringify({ app: 'online-team', name: name, sha256: b.sha256 }));
    }
    return out({ ok: true, file: { id: file.getId(), name: name, mime: file.getMimeType(), size: bytes.length, sha256: b.sha256 } });
  } catch (e) { return out({ ok: false, error: String(e.message || e) }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function attachmentRead(b) {
  try {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(String(b.id || ''))) throw new Error('file_id');
    const folderId = PropertiesService.getScriptProperties().getProperty('CHAT_ATTACHMENT_FOLDER_ID');
    if (!folderId) throw new Error('folder');
    const file = DriveApp.getFileById(b.id), parents = file.getParents();
    let allowed = false;
    while (parents.hasNext()) if (parents.next().getId() === folderId) allowed = true;
    if (!allowed || file.isTrashed()) throw new Error('folder');
    const meta = JSON.parse(file.getDescription() || '{}');
    if (meta.app !== 'online-team') throw new Error('file');
    return out({ ok: true, name: meta.name, mime: file.getMimeType(), sha256: meta.sha256, b64: Utilities.base64Encode(file.getBlob().getBytes()) });
  } catch (e) { return out({ ok: false, error: String(e.message || e) }); }
}
