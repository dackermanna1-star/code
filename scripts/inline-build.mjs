// After `vite build`, produce two distributable variants:
//   dist/battlespace.html  one self-contained file (JS and CSS inlined) that
//                          runs from anywhere, including file://
//   dist/site/             a page without the document skeleton (title, styles
//                          and app root) plus battlespace.js, for hosts that
//                          wrap pages in their own skeleton

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const dist = new URL('../dist/', import.meta.url).pathname;
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');

// Single file: inline the bundle (escaping any closing script tag) and styles.
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/[^"]+"><\/script>/, () => `<script type="module">${safe(js)}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/[^"]+">/, () => `<style>${css}</style>`);
if (/(src|href)="\.\/assets\//.test(html)) throw new Error('unresolved asset reference left in index.html');
writeFileSync(join(dist, 'battlespace.html'), html);

// Hosted variant: keep the title and head links, drop charset/viewport (the
// host supplies them), and load the bundle as a sibling file.
const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/i)[0];
const links = (head.match(/<meta name="description"[^>]*>|<link [^>]*>/gi) || []).join('\n');
const page = `${title}\n${links}\n<style>${css}</style>\n<div id="app"></div>\n<script type="module" src="battlespace.js"></script>\n`;
mkdirSync(join(dist, 'site'), { recursive: true });
writeFileSync(join(dist, 'site', 'index.html'), page);
writeFileSync(join(dist, 'site', 'battlespace.js'), js);

console.log(`wrote dist/battlespace.html (${(html.length / 1024).toFixed(0)} KB) and dist/site/ (index.html, battlespace.js)`);
