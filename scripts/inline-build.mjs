// After `vite build`, inline the JS bundle and CSS into a single HTML file
// (dist/battlespace.html) that runs from anywhere, plus a variant without the
// document skeleton for embedding as a hosted page (dist/battlespace-embed.html).

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = join(dist, 'assets');
const files = readdirSync(assets);

// Escape a closing script tag inside the bundle.
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/g, (_, f) => `<script type="module">${safe(readFileSync(join(assets, f), 'utf8'))}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/g, (_, f) => `<style>${readFileSync(join(assets, f), 'utf8')}</style>`);
if (/src="\.\/assets\//.test(html)) throw new Error('unresolved asset reference left in index.html');
writeFileSync(join(dist, 'battlespace.html'), html);

// Embed variant: title, styles and body content without doctype/html/head/body tags.
const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/i)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/i)[0];
const keep = head
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<title>[\s\S]*?<\/title>/i, '');
const embed = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${keep}\n${body}`;
writeFileSync(join(dist, 'battlespace-embed.html'), embed);
console.log(`wrote dist/battlespace.html (${(html.length / 1024).toFixed(0)} KB) and dist/battlespace-embed.html; assets: ${files.join(', ')}`);
