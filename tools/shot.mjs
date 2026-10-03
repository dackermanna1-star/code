#!/usr/bin/env node
// Screenshot a page of the running dev server with headless Chromium (WebGL via SwiftShader).
// Usage: node tools/shot.mjs "<path?query>" <out.png> [width] [height] [extraWaitMs]
//   e.g. node tools/shot.mjs "/viewer.html?cat=fruit&forms=whole,sliced" shots/fruit.png 1400 900
// Env: SHOT_BASE (default http://localhost:5173)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , path = '/', out = 'shots/shot.png', w = '1400', h = '900', extra = '400'] = process.argv;
const base = process.env.SHOT_BASE ?? 'http://localhost:5173';
const VITE_CLIENT_STUB = `
const styles = new Map();
export function updateStyle(id, css) { let el = styles.get(id); if (!el) { el = document.createElement('style'); el.setAttribute('data-vite-dev-id', id); document.head.appendChild(el); styles.set(id, el); } el.textContent = css; }
export function removeStyle(id) { const el = styles.get(id); if (el) { el.remove(); styles.delete(id); } }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, decline() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(url) { return url; }
export const ErrorOverlay = class {};
`;

mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: VITE_CLIENT_STUB }));
await page.goto(base + path, { waitUntil: 'load', timeout: 120000 });
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
} catch {
  errors.push('timeout waiting for window.__ready');
}
await page.waitForTimeout(+extra);
await page.screenshot({ path: out, timeout: 120000 });
await browser.close();
if (errors.length) console.log(errors.slice(0, 30).join('\n'));
console.log('saved', out);
