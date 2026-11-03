const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
const state = { ok: true, at: '2026-11-03 14:00', meetings: [], items: [], recs: [], logs: [], notes: [
  { id: 'n_room1', 종류: '쓰레드', 제목: '디자인 시안', 작성자: '보혜', 내용: '', 만든시각: '2026-11-03 13:00' },
  { id: 'n_room2', 종류: '쓰레드', 제목: '다른 대화방', 작성자: '보혜', 내용: '', 만든시각: '2026-11-03 12:00' },
  ...['한섭', '보혜', '시원', '진'].map((p, i) => ({ id: 'n_profile' + i, 종류: '프로필', 작성자: p, 제목: p + '의 한 줄 상태', 내용: '{}' })),
] };
const files = new Map(); let failLog = false, uploadCount = 0;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1254, height: 884 } });
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('PAGE:', e.message); });
    await page.addInitScript(() => { localStorage.setItem('ot-key', 'test-key'); localStorage.setItem('ot-who', '보혜'); });
    await page.route('https://cdn.jsdelivr.net/**', r => r.abort());
    await page.route('https://script.google.com/**', async route => {
      const req = route.request(); let out = state;
      if (req.method() === 'POST') {
        const b = req.postDataJSON(); out = { ok: true };
        if (b.type === 'attachmentUpload') {
          uploadCount++;
          const bytes = Buffer.from(b.b64, 'base64'); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), b.sha256);
          const file = { id: 'test_file_' + b.uploadId, name: b.name, mime: b.mime, size: bytes.length, sha256: b.sha256 };
          files.set(file.id, { ...file, b64: b.b64 }); out = { ok: true, file };
        }
        if (b.type === 'attachmentRead') out = { ok: true, ...files.get(b.id) };
        if (b.type === 'save') {
          if (b.kind === 'log' && failLog) out = { ok: false, error: 'test_failure' };
          else { const list = state[b.kind === 'log' ? 'logs' : 'notes']; const i = list.findIndex(x => x.id === b.data.id); if (i < 0) list.push(b.data); else list[i] = b.data; }
        }
      } else if (req.url().includes('live=1')) out = { ok: true, logs: state.logs, seen: {}, typing: [] };
      await route.fulfill({ json: out });
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.getByRole('heading', { name: '나의 보드', exact: true }).waitFor();
    await page.locator('.side [data-tab="chat"]').click();
    assert.equal(await page.locator('.status-person').count(), 4);
    assert.match(await page.locator('.team-status').innerText(), /시원의 한 줄 상태/);
    await page.getByRole('button', { name: 'ⓘ 사용방법' }).click();
    assert.match(await page.locator('#sheet').innerText(), /원본 그대로/);
    await page.locator('#sheet [data-x]').click();
    await page.locator('[data-th="n_room1"]').click();
    await page.getByRole('button', { name: '첨부하기', exact: true }).click();
    assert.equal(await page.locator('#sheet button').first().innerText().then(t => t.includes('첨부파일 첨부하기')), true);
    await page.keyboard.press('Escape');
    // A high-resolution PNG is uploaded and downloaded byte-for-byte unchanged.
    const original = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#164e50'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#faf8f3'; ctx.fillRect(0, 0, 2400, 1600);
      ctx.fillStyle = '#153e40'; ctx.fillRect(0, 0, 780, 1600);
      ctx.fillStyle = '#f0eee6'; ctx.font = 'bold 72px sans-serif'; ctx.fillText('VAFRIEND', 70, 140);
      ctx.font = '34px sans-serif'; ctx.fillText('DESIGN REVIEW', 70, 220);
      ctx.fillStyle = '#d9edb1'; ctx.beginPath(); ctx.arc(390, 760, 260, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#153e40'; ctx.font = 'bold 100px sans-serif'; ctx.fillText('VF', 315, 790);
      ctx.fillStyle = '#253e3f'; ctx.font = 'bold 80px sans-serif'; ctx.fillText('Design details, clearly.', 900, 170);
      ctx.font = '32px sans-serif'; ctx.fillText('Original image · 2400 × 1600 px', 900, 240);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#153e40', '#c5dba8', '#e4bb82', '#e3d5c0', '#717f80'][i]; ctx.fillRect(900 + i * 255, 360, 220, 220); }
      ctx.fillStyle = '#253e3f'; ctx.font = 'bold 40px sans-serif'; ctx.fillText('Typography & fine print', 900, 720);
      for (let i = 0; i < 8; i++) { ctx.font = `${32 - i * 2}px sans-serif`; ctx.fillText('Original detail preserved — ABC abc 0123456789', 900, 800 + i * 65); }
      ctx.font = '20px sans-serif'; ctx.fillText('TEST IMAGE / no compression / inspect at 100% and 200%', 900, 1480);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const file = { name: '고화질 시안.png', mimeType: 'image/png', buffer: Buffer.from(original) };
    await page.locator('#chatPhotoInput').setInputFiles(file);
    await page.locator('#cText').fill('원본 시안 확인 부탁해요');
    failLog = true;
    await page.locator('[data-act="csend"]').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('보내지 못했어요'));
    assert.equal(await page.locator('#photoPreview img').count(), 1);
    assert.equal(await page.locator('#cText').inputValue(), '원본 시안 확인 부탁해요');
    failLog = false;
    await page.locator('[data-act="csend"]').click();
    await page.locator('.chat-photo img:not([hidden])').waitFor();
    assert.equal(uploadCount, 1, 'retry should reuse the uploaded original');
    assert.equal(state.logs.length, 1);
    assert.ok(state.logs[0].내용.length < 2000, 'messages must contain metadata only');
    assert.equal(await page.locator('.chat-photo img').evaluate(img => img.naturalWidth), 2400);
    await page.locator('.chat-photo').click();
    await page.locator('.iv-image').waitFor();
    await page.waitForFunction(() => document.querySelector('.iv-info').textContent.includes('2,400'));
    assert.ok((await page.locator('.chat-photo img').boundingBox()).width > 450, 'chat preview should be large enough for design review');
    await page.locator('[data-iv="actual"]').click();
    assert.equal(await page.locator('.iv-image').evaluate(img => img.getBoundingClientRect().width), 2400);
    await page.locator('[data-iv="double"]').click();
    assert.equal(await page.locator('.iv-image').evaluate(img => img.getBoundingClientRect().width), 4800);
    await page.locator('[data-iv="fit"]').click();
    await page.screenshot({ path: path.join(root, '../outputs/online-team-image-review.png') });
    await page.locator('.iv-stage').hover(); await page.mouse.wheel(0, -200);
    assert.equal(await page.locator('[data-iv="fit"]').getAttribute('aria-pressed'), 'false');
    await page.locator('[data-iv="actual"]').click();
    const beforePan = await page.locator('.iv-stage').evaluate(el => el.scrollLeft);
    const area = await page.locator('.iv-stage').boundingBox();
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2); await page.mouse.down();
    await page.mouse.move(area.x + area.width / 2 - 180, area.y + area.height / 2, { steps: 5 }); await page.mouse.up();
    assert.ok(await page.locator('.iv-stage').evaluate(el => el.scrollLeft) > beforePan + 100);
    await page.screenshot({ path: path.join(root, '../outputs/online-team-image-review-detail.png') });
    await page.locator('[data-iv="background"]').click();
    assert.equal(await page.locator('.iv-stage.iv-light').count(), 1);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('.iv-download').click();
    const download = await downloadEvent;
    assert.deepEqual(fs.readFileSync(await download.path()), Buffer.from(original));
    await page.locator('.iv-close').click(); await page.waitForFunction(() => !imageReview && navSkip === 0);
    // The saved photo can be read after a complete reload, without local draft state.
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator('.side [data-tab="chat"]').click();
    await page.locator('[data-th="n_room1"]').click();
    await page.locator('.chat-photo img:not([hidden])').waitFor();
    assert.equal(await page.locator('.chat-photo img').evaluate(img => img.naturalWidth), 2400);
    // Clipboard screenshots preserve their PNG bytes too.
    await page.locator('#cText').evaluate((el, bytes) => {
      const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], '캡처.png', { type: 'image/png' }));
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }));
    }, original);
    assert.match(await page.locator('#photoPreview').innerText(), /캡처.png/);
    await page.locator('[data-photo-remove]').click();
    // Generic documents use the same original-file storage without being rendered as HTML.
    await page.locator('#chatPhotoInput').setInputFiles({ name: '제안서.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
    await page.locator('[data-act="csend"]').click();
    await page.waitForFunction(() => document.querySelector('#photoPreview').childElementCount === 0);
    assert.equal(state.logs.length, 2);
    // Multiple selections append, removing one does not drop the rest, and a
    // failed group save retries existing uploads as one message.
    assert.equal(await page.locator('#chatPhotoInput').getAttribute('multiple'), '');
    await page.locator('#chatPhotoInput').setInputFiles([file, { ...file, name: '시안 2.png' }]);
    await page.locator('#chatPhotoInput').setInputFiles([{ ...file, name: '시안 3.png' }, { ...file, name: '시안 4.png' }]);
    assert.equal(await page.locator('[data-photo-remove]').count(), 4);
    await page.locator('[data-photo-remove]').nth(1).click();
    assert.equal(await page.locator('[data-photo-remove]').count(), 3);
    await page.screenshot({ path: path.join(root, '../outputs/online-team-multiple-attachments.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('[data-photo-remove]').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1254, height: 884 });
    const beforeBatchUpload = uploadCount;
    await page.locator('#cText').fill('시안 3장 한 번에 공유합니다');
    failLog = true;
    await page.locator('[data-act="csend"]').click();
    await page.waitForFunction(() => !photoSends.has(thSel));
    assert.equal(uploadCount, beforeBatchUpload + 3);
    assert.equal(await page.locator('[data-photo-remove]').count(), 3);
    failLog = false;
    await page.locator('[data-act="csend"]').click();
    await page.waitForFunction(() => document.querySelector('#photoPreview').childElementCount === 0);
    assert.equal(uploadCount, beforeBatchUpload + 3, 'batch retry must not upload again');
    assert.equal(state.logs.length, 3, 'multiple files should be sent as one message');
    assert.equal((state.logs[2].내용.match(/\[\[파일:/g) || []).length, 3);
    assert.ok(state.logs[2].내용.startsWith('시안 3장 한 번에 공유합니다'));
    assert.equal(await page.locator('.attachment-image').count(), 4);
    // Long chat headers remain reachable after scrolling to the latest message.
    await page.evaluate(() => { for (let i = 0; i < 80; i++) D.logs.push({ id: 'long_' + i, 안건id: 'n_room1', 작성자: '진', 시각: '2026-11-03 14:01', 내용: '긴 대화 확인 ' + i }); render(); scrollTo(0, document.body.scrollHeight); });
    const head = await page.locator('.chead').boundingBox(); assert.ok(head.y >= -1 && head.y < 20, JSON.stringify(head));
    await page.locator('[data-thback]').click();
    await page.locator('[data-board-prefs]').click();
    await page.locator('#boardStart').selectOption('chat');
    await page.locator('[name="boardFavorite"][value="idea"]').check();
    await page.locator('[data-board-prefs-save]').click(); await page.waitForFunction(() => !sheetPushed && navSkip === 0);
    assert.equal(await page.locator('.side [data-tab="idea"]').count(), 1);
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator('.team-status').waitFor();
    // Mobile layout, file composer width and sticky back button.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-th="n_room1"]').click();
    await page.locator('#chatPhotoInput').setInputFiles(file);
    await page.screenshot({ path: path.join(root, '../outputs/online-team-mobile.png') });
    await page.locator('[data-draft-view]').click();
    await page.waitForFunction(() => document.querySelector('.iv-info').textContent.includes('2,400'));
    assert.equal(await page.locator('.image-review').evaluate(el => el.getBoundingClientRect().width), 390);
    await page.screenshot({ path: path.join(root, '../outputs/online-team-image-review-mobile.png') });
    const pinchBefore = await page.locator('.iv-scale').innerText();
    await page.locator('.iv-stage').evaluate(el => {
      // Synthetic touch pointers exercise the same pinch state and image-space anchor.
      const r = el.getBoundingClientRect(), y = r.top + 160;
      const send = (type, id, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', button: 0, clientX: r.left + x, clientY: y }));
      const nativeCapture = el.setPointerCapture; el.setPointerCapture = () => {};
      send('pointerdown', 21, 130); send('pointerdown', 22, 230); send('pointermove', 22, 330);
      send('pointerup', 21, 130); send('pointerup', 22, 330); el.setPointerCapture = nativeCapture;
    });
    assert.notEqual(await page.locator('.iv-scale').innerText(), pinchBefore);
    await page.goBack(); await page.waitForFunction(() => !imageReview);
    assert.equal(await page.locator('#cText').count(), 1, 'browser back should close the viewer and keep the conversation');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const mobileHead = await page.locator('.chead').boundingBox(); assert.ok(mobileHead.y >= -1 && mobileHead.y < 20);
    await page.setViewportSize({ width: 1254, height: 884 });
    await page.screenshot({ path: path.join(root, '../outputs/online-team-desktop.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: multi-select, append, individual removal, grouped send, batch retry, original byte integrity, large preview, fullscreen, 100%/200%, wheel zoom, drag pan, mobile pinch, viewer back, retry, reload, clipboard, document, sticky header, favorites, desktop/mobile');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });


