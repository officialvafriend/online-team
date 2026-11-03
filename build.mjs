// Keep the deployed page self-contained for embedded browsers and cached links.
import fs from 'node:fs';
const file = new URL('index.html', import.meta.url);
let html = fs.readFileSync(file, 'utf8');
for (const [source, tag] of [['chat-photos.css', 'style'], ['chat-photos.js', 'script'], ['image-review.js', 'script'], ['message-threads.js', 'script'], ['dashboard-ui.js', 'script']]) {
  const text = fs.readFileSync(new URL(source, import.meta.url), 'utf8');
  const block = `<!-- bundled:${source} -->\n<${tag}>\n${text}\n</${tag}>\n<!-- /bundled:${source} -->`;
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<!-- bundled:${escaped} -->[\\s\\S]*?<!-- /bundled:${escaped} -->`);
  if (pattern.test(html)) html = html.replace(pattern, () => block);
  else {
    const old = tag === 'style' ? `<link rel="stylesheet" href="${source}">` : `<script src="${source}"></script>`;
    if (!html.includes(old)) throw new Error(`Missing entry point: ${source}`);
    html = html.replace(old, () => block);
  }
}
fs.writeFileSync(file, html);
console.log('Built self-contained index.html');
