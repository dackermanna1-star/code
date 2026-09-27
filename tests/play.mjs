// Scripted headless playtest: node tests/play.mjs <scenario.js>
// scenario exports default async ({page, shot, evalg, wait}) => {}
import { chromium } from 'playwright';
import path from 'path';
const scen = process.argv[2];
const url = process.argv[3] || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`));
await page.goto(url);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
const evalg = async (fn, arg) => { try { return await page.evaluate(fn, arg); } catch (e) { console.log('eval error', e.message); return null; } };
const mod = await import(path.resolve(scen));
try { await mod.default({ page, shot, evalg, wait, logs }); } catch (e) { console.log('scenario error', e); }
console.log('--- logs ---\n' + logs.slice(0, 80).join('\n'));
await browser.close();
