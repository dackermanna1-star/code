// Production build: bundles the game (including planck.js) and inlines JS + CSS into a
// single self-contained dist/index.html that runs by simply opening the file.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script>\n/* Brittle Bones — bundled build. Includes planck.js (MIT, (c) Erin Catto, Ali Shakiba). */\n${js}</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'index.html');
fs.writeFileSync(out, html);
console.log(`built ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);

// Optional: `--fragment <file>` writes the same page without the document skeleton
// (for hosts that wrap the page in their own <html>/<head>/<body>).
const fi = process.argv.indexOf('--fragment');
if (fi > 0) {
  const frag = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*$/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<meta charset="utf-8" \/>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/<\/body>\s*/i, '');
  fs.writeFileSync(process.argv[fi + 1], frag);
  console.log(`fragment -> ${process.argv[fi + 1]}`);
}
