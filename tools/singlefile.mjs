// Pack the production build into one self-contained HTML file that runs straight from
// disk (double-click it; no server, no npm): the script, the stylesheet, the sound
// synthesis worker (as a Blob URL) and every file under maps/ (each built-in map's baked
// lightmap and thumbnail) go inline. The files are data: URLs in window.__cs16Assets,
// keyed by path ('maps/de_dust2.lm.png'), which src/engine/assetpath.js assetUrl() reads.
// Maps bundled under gamedata/ are left out (your own game files stay local); a map
// without its lightmap bakes its lighting on load instead.
//
// usage: npx vite build && node tools/singlefile.mjs [out.html]   (default dist/cs16.html)
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const dist = new URL('../dist/', import.meta.url).pathname;
const out = process.argv[2] || join(dist, 'cs16.html');
const assets = await readdir(join(dist, 'assets'));
const pick = (re) => {
  const f = assets.find((a) => re.test(a));
  if (!f) throw new Error(`singlefile: no ${re} in dist/assets (run npx vite build first)`);
  return f;
};
const jsName = pick(/^index-.*\.js$/), cssName = assets.find((a) => /^index-.*\.css$/.test(a));
const workerName = assets.find((a) => /^worker-.*\.js$/.test(a));
let js = await readFile(join(dist, 'assets', jsName), 'utf8');
const css = cssName ? await readFile(join(dist, 'assets', cssName), 'utf8') : '';

// the worker: a Blob URL made once at startup instead of a file next to the page
if (workerName) {
  const code = await readFile(join(dist, 'assets', workerName), 'utf8');
  const ref = new RegExp(`new URL\\(""\\+new URL\\("${workerName.replace(/[.]/g, '\\.')}",import\\.meta\\.url\\)\\.href,import\\.meta\\.url\\)`, 'g');
  const n = (js.match(ref) || []).length;
  if (!n) throw new Error('singlefile: worker reference not found in the bundle');
  js = `const __cs16Worker=URL.createObjectURL(new Blob([${JSON.stringify(code)}],{type:"text/javascript"}));\n` + js.replace(ref, () => '__cs16Worker');
}

// maps/*: data: URLs (fetch reads those from a file:// page too), set before the bundle runs
const TYPES = { json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const inline = {};
const mapsDir = join(dist, 'maps');
if (existsSync(mapsDir)) {
  for (const file of (await readdir(mapsDir)).sort()) {
    const type = TYPES[file.split('.').pop().toLowerCase()];
    if (!type) continue;
    inline[`maps/${file}`] = `data:${type};base64,${(await readFile(join(mapsDir, file))).toString('base64')}`;
  }
}
const table = `<script>window.__cs16Assets=${JSON.stringify(inline)};</script>`;

js = js.replace(/<\/script/gi, '<\\/script');
const html = (await readFile(join(dist, 'index.html'), 'utf8'))
  .replace(/\s*<script type="module"[^>]*src="[^"]*"><\/script>/, '')
  .replace(/\s*<link rel="stylesheet"[^>]*>/, '')
  // (function replacers: the code is full of $' and $& that a replacement string would expand)
  .replace('</head>', () => `<style>${css}</style>\n${table}\n</head>`)
  .replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
await writeFile(out, html);
console.log(`wrote ${out} (${(html.length / 1048576).toFixed(1)} MB; ${Object.keys(inline).length} map files inline: ${Object.keys(inline).join(', ')})`);
