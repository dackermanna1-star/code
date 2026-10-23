// Packs the production build into one self-contained HTML page (the bundle is inlined
// as a module script) for hosts that serve a single file, such as a Claude artifact.
// Run after `vite build`: `npm run build:artifact`.
import fs from 'fs';
import path from 'path';

const dist = path.resolve('dist');
const outDir = path.resolve('dist-artifact');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const scriptTag = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!scriptTag) throw new Error('No module script found in dist/index.html');
let js = fs.readFileSync(path.join(dist, scriptTag[1]), 'utf8');
// A literal "</script" inside the bundle would end the inline tag early.
js = js.replace(/<\/script/gi, '<\\/script');
html = html.replace(scriptTag[0], () => `<script type="module">\n${js}\n</script>`);

// The host wraps the page in its own document, charset and viewport.
html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>/gi, '')
  .replace(/<meta charset="[^"]*"\s*\/?>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .trim();

fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'sahara-wanderer.html');
fs.writeFileSync(out, `${html}\n`);
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
