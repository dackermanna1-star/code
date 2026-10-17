// Bundle the game into a single self-contained file: dist/hallowell.html
// node tools/build.mjs [--minify]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fontsCss } from './serve.mjs';

const minify = process.argv.includes('--minify');
const result = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, format: 'iife', write: false,
  target: 'es2020', minify, legalComments: 'none', logLevel: 'warning',
  define: { 'globalThis.__HW_BUILD__': 'true' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>HALLOWELL</title>
<style>
${fontsCss({ inline: true })}
html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none}
canvas#screen{display:block;width:100vw;height:100vh;image-rendering:pixelated;outline:none}
</style></head>
<body><canvas id="screen" tabindex="0"></canvas>
<script>${js}</script>
</body></html>`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist/hallowell.html');
fs.writeFileSync(out, html);
console.log(`built ${path.relative(ROOT, out)} (${(html.length / 1024).toFixed(0)} KB)`);
