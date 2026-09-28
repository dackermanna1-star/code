// Build the whole game into one self-contained HTML file: the-last-four.html
// (all JS, CSS and assets inlined; open it straight from disk, no server).
// Usage: npm run build:single  [-- optional/output/path.html]
import { build } from 'vite';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lastfour-single-'));
await build({
  root, base: './', configFile: false, logLevel: 'warn',
  build: {
    outDir, emptyOutDir: true, target: 'es2022', assetsInlineLimit: 1e9, cssCodeSplit: false,
    modulePreload: false, chunkSizeWarningLimit: 1e5,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const assets = path.join(outDir, 'assets');
const files = fs.readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
html = html.replace(/<link rel="stylesheet"[^>]*>/g, '').replace(/<script type="module"[^>]*><\/script>/g, '');
html = html.replace('</head>', () => `<style>${css}</style>\n</head>`);
html = html.replace('</body>', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`);
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'the-last-four.html');
fs.writeFileSync(out, html);
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`wrote ${out} (${(html.length / 1e6).toFixed(1)} MB)`);
