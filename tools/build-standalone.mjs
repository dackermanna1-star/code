#!/usr/bin/env node
// Builds dist/doom.html: one self-contained file with all code, the music
// worklet, the voxel model worker and the WADs embedded, playable by
// opening it from disk.
// Usage: npm run build:html

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const path = (p) => new URL(p, root).pathname;

const bundle = async (entry, format = 'esm') => (await build({
  entryPoints: [path(entry)], bundle: true, format, write: false, minify: true, target: 'es2022', logLevel: 'warning',
})).outputFiles[0].text;

const worklet = await bundle('src/audio/music-worklet.js');
// A classic (non-module) worker script, which every browser accepts from a data: URL.
const voxWorker = await bundle('src/vox/worker.js', 'iife');
const app = await bundle('src/main.js');
const wad = (p) => readFileSync(path(p)).toString('base64');
const wads = {
  'assets/wads/doom1.wad': wad('assets/wads/doom1.wad'),
  'assets/wads/doomx-extras.wad': wad('assets/wads/doomx-extras.wad'),
};

let html = readFileSync(path('index.html'), 'utf8');
const prelude = `<script>
globalThis.__DOOM_WADS = ${JSON.stringify(wads)};
globalThis.__DOOM_WORKLET_URL = 'data:text/javascript;base64,${Buffer.from(worklet).toString('base64')}';
globalThis.__DOOM_VOX_WORKER_URL = 'data:text/javascript;base64,${Buffer.from(voxWorker).toString('base64')}';
</script>
<script type="module">${app.replace(/<\/script/gi, '<\\/script')}</script>`;
html = html.replace(/<script type="module" src="src\/main.js"><\/script>/, () => prelude);
mkdirSync(path('dist'), { recursive: true });
writeFileSync(path('dist/doom.html'), html);
console.log(`wrote dist/doom.html (${(html.length / 1048576).toFixed(1)} MB)`);
