// Bundles the game into dist/ for hosting anywhere static files can be served.
//
//   dist/game.js           all game modules bundled and minified (Babylon stays a CDN global)
//   dist/game.css          stylesheet
//   dist/assets/audio/**   sound effects and their manifest (fetched with relative URLs)
//   dist/index.html        page body fragment for hosts that supply their own document shell
//   dist/standalone.html   complete HTML document (open via any static server)
//
// Usage: node tools/build.mjs [--no-minify]

import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const minify = !process.argv.includes('--no-minify');
const BABYLON_URL = 'https://cdn.jsdelivr.net/npm/babylonjs@7.54.3/babylon.js';
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Special+Elite&family=Inter:wght@400;500;600;700&display=swap';

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify,
  legalComments: 'none',
  outfile: path.join(dist, 'game.js'),
  metafile: true,
  logLevel: 'warning',
});

await cp(path.join(root, 'styles/game.css'), path.join(dist, 'game.css'));
await cp(path.join(root, 'assets/audio'), path.join(dist, 'assets/audio'), { recursive: true });

const body = `<canvas id="game" tabindex="0"></canvas>
<div id="ui"></div>
<div id="boot" class="boot"><div class="boot-title">GRAVELMOUTH</div><div class="boot-sub">Processing intake…</div></div>
<script src="${BABYLON_URL}"></script>
<script src="game.js"></script>`;

const fragment = `<title>Gravelmouth Prison Sandbox</title>
<meta name="description" content="A prison-life sandbox: serve your sentence, earn respect, make deals, fight, or find a way out.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="game.css">
${body}
`;

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${fragment.trim().split('\n').filter((l) => !l.startsWith('<canvas') && !l.startsWith('<div') && !l.startsWith('<script')).join('\n')}
</head>
<body>
${body}
</body>
</html>
`;

await writeFile(path.join(dist, 'index.html'), fragment);
await writeFile(path.join(dist, 'standalone.html'), standalone);

const bytes = (await readFile(path.join(dist, 'game.js'))).length;
const inputs = Object.keys(result.metafile.inputs).length;
console.log(`dist/game.js  ${(bytes / 1024).toFixed(0)} KB from ${inputs} modules${minify ? ' (minified)' : ''}`);
console.log('dist/index.html, dist/standalone.html, dist/game.css, dist/assets/audio/');
