// Build: engine library + game sources -> dist/index.html (one ES module), and every GLB under
// assets/ -> dist/assets/<path>.js (a script that registers the file as base64). Script tags work
// from file:// as well as http(s), so the game runs by opening dist/index.html directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });

// ---- code --------------------------------------------------------------------------------
let engine = fs.readFileSync(path.join(root, 'engine/ragdoll-engine.js'), 'utf8');
// the lab's embedded models are not used by the game (characters and arms come from assets/)
engine = engine.replace('"__SCARLET_GLB__"', '""').replace('"__HR_BLOB__"', '""');

const srcDir = path.join(root, 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
let game = '';
for (const f of files) game += `\n// ===== src/${f} =====\n` + fs.readFileSync(path.join(srcDir, f), 'utf8') + '\n';

// guard against a game top-level name shadowing an engine one (both share one module scope)
const topLevel = (code) => {
  const names = new Set();
  for (const m of code.matchAll(/^(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^ {2}([A-Za-z_$][\w$]*) = /gm)) names.add(m[1]);
  return names;
};
const engineNames = topLevel(engine);
const clashes = [...topLevel(game)].filter((n) => engineNames.has(n));
if (clashes.length) {
  console.error('Top-level name clash with engine:', clashes.join(', '));
  process.exit(1);
}

const css = fs.readFileSync(path.join(srcDir, 'style.css'), 'utf8');
const credits = fs.readFileSync(path.join(root, 'CREDITS.md'), 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>The Backrooms — Endless Descent</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>window.__BR_ASSET_BASE = "assets/"; window.__BR_ASSETS = window.__BR_ASSETS || {};</script>
<script type="text/plain" id="credits">${credits.replace(/</g, '&lt;')}</script>
<script type="module">
${engine}
${game}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log('dist/index.html', (html.length / 1048576).toFixed(2), 'MB,', files.length, 'source files');

// ---- assets ------------------------------------------------------------------------------
if (!args.has('--no-assets')) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  let total = 0;
  for (const f of walk(path.join(root, 'assets')).filter((f) => f.endsWith('.glb') || f.endsWith('.mp3'))) {
    const rel = path.relative(path.join(root, 'assets'), f).replace(/\\/g, '/').replace(/\.(glb|mp3)$/, '');
    const out = path.join(dist, 'assets', rel + '.js');
    const st = fs.statSync(f);
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= st.mtimeMs) { total += fs.statSync(out).size; continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const js = `(window.__BR_ASSETS=window.__BR_ASSETS||{})[${JSON.stringify(rel)}]="${fs.readFileSync(f).toString('base64')}";\n`;
    fs.writeFileSync(out, js);
    total += js.length;
  }
  console.log('dist/assets', (total / 1048576).toFixed(1), 'MB');
}
