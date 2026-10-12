// Bundle the production build (dist/) into one self-contained HTML file: dist/noita3d.html.
// JS, CSS, fonts and the world-generation worker are inlined, so the file can be opened directly
// from disk or shared without a web server. Run after `vite build` (see `npm run build:html`).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const assets = join(dist, 'assets');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = readdirSync(assets);

// --- CSS with fonts as data URLs
const cssFile = files.find((f) => /^index-.*\.css$/.test(f));
let css = readFileSync(join(assets, cssFile), 'utf8');
const mime = { woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', svg: 'image/svg+xml' };
css = css.replace(/url\(\.\/([^)]+)\)/g, (m, name) => {
  const p = join(assets, name);
  if (!existsSync(p)) return m;
  const ext = name.split('.').pop();
  return `url(data:${mime[ext] ?? 'application/octet-stream'};base64,${readFileSync(p).toString('base64')})`;
});

// --- main JS with the worker turned into a blob URL
const jsFile = files.find((f) => /^index-.*\.js$/.test(f));
let js = readFileSync(join(assets, jsFile), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
const workerFile = files.find((f) => /^genWorker-.*\.js$/.test(f));
if (workerFile) {
  const workerJs = readFileSync(join(assets, workerFile), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  const re = new RegExp(`new URL\\(""\\+new URL\\("${workerFile.replace(/[.$]/g, '\\$&')}",import\\.meta\\.url\\)\\.href,import\\.meta\\.url\\)`, 'g');
  const hits = js.match(re)?.length ?? 0;
  if (!hits) throw new Error('worker URL expression not found in ' + jsFile);
  js = js.replace(re, '__noitaGenWorkerURL');
  js = `const __noitaGenWorkerURL=URL.createObjectURL(new Blob([${JSON.stringify(workerJs)}],{type:"text/javascript"}));\n` + js;
}
js = js.replace(/<\/script/gi, '<\\/script');

html = html
  .replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, () => `<script type="module">\n${js}\n</script>`)
  .replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => `<style>\n${css}\n</style>`);
if (html.includes('./assets/')) throw new Error('unresolved asset reference left in HTML');
const out = join(dist, 'noita3d.html');
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
