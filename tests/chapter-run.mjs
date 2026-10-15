// Autopilot run through a chapter. usage: node tests/chapter-run.mjs <chapterIndex> [maxSeconds] [shotEvery] [extra query]
import { launch, shot } from './harness.mjs';
const ch = process.argv[2] || '0';
const maxS = +(process.argv[3] || 240);
const every = +(process.argv[4] || 20);
const extra = process.argv[5] || '';
const { browser, page, errors } = await launch({ url: `http://localhost:5173/?chapter=${ch}&auto=1&autopilot=1&god=1${extra}` });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('Failed to load')) console.log('[' + m.type() + ']', t.slice(0, 300)); });
const t0 = Date.now();
await page.waitForFunction(() => window.__game && (window.__game.state === 'playing' || window.__game.loadError), null, { timeout: 240000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.evaluate(() => { window.__game.timeScale = 2; });
let last = -1, i = 0;
const start = Date.now();
while ((Date.now() - start) / 1000 < maxS) {
  await page.waitForTimeout(every * 1000);
  const info = await page.evaluate(() => { const i = window.__game.debug.info(); i.state = window.__game.state; return i; });
  console.log(JSON.stringify({ t: info.t, fps: info.fps, phase: info.phase, panic: info.panic, inf: info.infected, prog: info.progress + '/' + info.total, surv: info.surv.map((s) => `${s.n}:${s.st}:${s.hp}@${s.pos.join(',')}:${s.mode}`).join(' '), msgs: info.msgs.slice(-2), ended: info.ended, state: info.state }));
  await shot(page, `ch${ch}_${String(i++).padStart(2, '0')}`);
  if (info.ended || info.state === 'stats') break;
  if (info.progress === last && info.progress < info.total - 2) console.log('  (no progress)');
  last = info.progress;
}
console.log('errors:', errors.filter((e) => !e.includes('Failed to load')).slice(0, 8).join('\n') || 'none');
await browser.close();
