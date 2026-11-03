// Cache verified original Blobs, never resized previews. IndexedDB is optional.
let originalDatabase, originalCacheIdentity = '', originalCacheScope;
const originalReadQueue = []; let originalReadActive = 0;
function originalDatabaseOpen() {
  if (!originalDatabase) originalDatabase = new Promise(resolve => {
    try {
      const request = indexedDB.open('online-team-originals', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return originalDatabase;
}
async function originalScopedKey(id) {
  const identity = KEY + '|' + who;
  if (identity !== originalCacheIdentity) { originalCacheIdentity = identity; originalCacheScope = digestFile(new TextEncoder().encode(identity)); }
  return (await originalCacheScope) + '|' + id;
}
async function cachedOriginalFile(meta) {
  try {
    const db = await originalDatabaseOpen(); if (!db) return null;
    const key = await originalScopedKey(meta.id);
    const entry = await new Promise(resolve => { const r = db.transaction('files').objectStore('files').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); });
    if (!entry || entry.sha256 !== meta.sha256 || entry.blob.size !== meta.size || Date.now() - entry.at > 30 * 864e5) return null;
    if (await digestFile(await entry.blob.arrayBuffer()) !== meta.sha256) return null;
    return entry.blob;
  } catch { return null; }
}
async function cacheOriginalFile(meta, blob) {
  try {
    const db = await originalDatabaseOpen(); if (!db) return;
    const key = await originalScopedKey(meta.id);
    await new Promise(resolve => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ key, blob, sha256: meta.sha256, at: Date.now() });
      tx.oncomplete = tx.onerror = tx.onabort = resolve;
    });
    const tx = db.transaction('files', 'readwrite'), store = tx.objectStore('files'), list = store.getAll();
    list.onsuccess = () => {
      let size = 0, count = 0;
      for (const entry of list.result.sort((a, b) => b.at - a.at)) {
        size += entry.blob.size; count++;
        if (count > 80 || size > 200 * 1024 * 1024 || Date.now() - entry.at > 30 * 864e5) store.delete(entry.key);
      }
    };
  } catch {} // Private browsing or a full disk must not block viewing/sending.
}
function originalNetworkRead(id, read, priority = true) {
  return new Promise((resolve, reject) => {
    const job = { id, read, resolve, reject };
    priority ? originalReadQueue.unshift(job) : originalReadQueue.push(job);
    pumpOriginalReads();
  });
}
function prioritizeOriginal(id) {
  const at = originalReadQueue.findIndex(job => job.id === id);
  if (at > 0) originalReadQueue.unshift(originalReadQueue.splice(at, 1)[0]);
}
function pumpOriginalReads() {
  while (originalReadActive < 3 && originalReadQueue.length) {
    const job = originalReadQueue.shift(); originalReadActive++;
    Promise.resolve().then(job.read).then(job.resolve, job.reject).finally(() => { originalReadActive--; pumpOriginalReads(); });
  }
}
function prefetchAttachmentNeighbors(card) {
  const container = card?.closest('.bub,.thread-parent-content,.message-reply'); if (!container) return;
  const cards = [...container.querySelectorAll('.attachment-image[data-file-token]')], at = cards.indexOf(card);
  for (const index of [at + 1, at + 2, at - 1, at - 2]) {
    const meta = cards[index] && decodeAttachment(cards[index].dataset.fileToken);
    if (meta) loadAttachment(meta, { priority: false }).catch(() => {});
  }
}
