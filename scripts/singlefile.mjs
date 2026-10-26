// Bundle the production build into one self-contained HTML file that opens
// straight from disk (double-click, file://): scripts, styles and fonts inline.
//   npm run build:single   →   dist/homebody.html
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
if (!process.argv.includes('--no-build')) execSync('npx vite build', { cwd: root, stdio: 'inherit' });

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const asset = (ref) => path.join(dist, ref.replace(/^\.\//, ''));

// styles, with fonts as data URIs
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const dir = path.dirname(asset(href));
  const css = fs.readFileSync(asset(href), 'utf8').replace(/url\((\.\/[^)]+\.woff2)\)/g, (m, f) => {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    return `url(data:font/woff2;base64,${b64})`;
  });
  return `<style>\n${css}\n</style>`;
});

// scripts (module scripts run deferred even when inline, so the DOM is ready)
html = html.replace(/<script type="module"[^>]*src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(asset(src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

if (/(src|href)="\.\/assets\//.test(html)) throw new Error('an asset reference was left un-inlined');
const out = path.join(dist, 'homebody.html');
fs.writeFileSync(out, html);
console.log(`${path.relative(root, out)}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
