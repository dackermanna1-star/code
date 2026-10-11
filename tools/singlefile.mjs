// Pack the production build into one self-contained HTML file that runs straight from
// disk (double-click it; no server, no npm): the script, the stylesheet, the sound
// synthesis worker (as a Blob URL) and the baked de_dust2 lightmap (as data: URLs) all
// go inline. Maps bundled under gamedata/ are left out (your own game files stay
// local); without the lightmap the map bakes its lighting on load instead.
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

// the lightmap: data: URLs (fetch reads those from a file:// page too)
for (const [file, type] of [['de_dust2.lm.json', 'application/json'], ['de_dust2.lm.png', 'image/png']]) {
  const p = join(dist, 'maps', file);
  if (!existsSync(p)) continue;
  const url = `data:${type};base64,${(await readFile(p)).toString('base64')}`;
  js = js.replace(new RegExp(`\\$\\{\\w+\\}maps/${file.replace(/[.]/g, '\\.')}`, 'g'), () => url);
}

js = js.replace(/<\/script/gi, '<\\/script');
const html = (await readFile(join(dist, 'index.html'), 'utf8'))
  .replace(/\s*<script type="module"[^>]*src="[^"]*"><\/script>/, '')
  .replace(/\s*<link rel="stylesheet"[^>]*>/, '')
  // (function replacers: the code is full of $' and $& that a replacement string would expand)
  .replace('</head>', () => `<style>${css}</style>\n</head>`)
  .replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
await writeFile(out, html);
console.log(`wrote ${out} (${(html.length / 1048576).toFixed(1)} MB)`);
