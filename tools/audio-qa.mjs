// Audio QA: renders EVERY sfx / footstep / voice / ambience / music id offline in headless
// Chromium through HW.audio.renderOffline (the same synthesis code the game runs), reports
// duration, peak, RMS, DC offset, NaN and spectral centroid, checks loudness targets, and
// writes waveform + spectrogram contact sheets.
//
//   node tools/audio-qa.mjs [--out=dir] [--only=regex] [--group=sfx,music] [--sr=44100] [--no-sheets]
//
// Fails (exit 1) on: peak > 0.99, silent output (peak < -80 dBFS), NaN, render errors.
// Warns on loudness outside targets: sfx peak -30..-1 dBFS (UI/blips quieter allowed),
// ambience beds -30..-19 dBFS RMS (≈ -24), music -27..-15 dBFS RMS (≈ -20; 'register' and
// 'ending_bad' are meant to be near-silent), |DC| > 0.01.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { startServer } from './serve.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true]; }));
const OUT = path.resolve(args.out || path.join(os.tmpdir(), 'hallowell-audio-qa'));
const SR = Number(args.sr) || 44100;
const ONLY = args.only ? new RegExp(args.only) : null;
const GROUPS = args.group ? new Set(String(args.group).split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });

const NEAR_SILENT = new Set(['register', 'ending_bad', 'silence']);
function warnings(s) {
  const w = [];
  if (Math.abs(Number(s.dc)) > 0.01) w.push(`dc ${s.dc}`);
  if (s.kind === 'ambience' || s.kind === 'layer') {
    if (!NEAR_SILENT.has(s.id) && s.id !== 'period_buzz' && (s.rmsDb < -30 || s.rmsDb > -19)) w.push(`bed rms ${s.rmsDb} (target ≈ -24)`);
  } else if (s.kind === 'music') {
    if (!NEAR_SILENT.has(s.id) && (s.rmsDb < -27 || s.rmsDb > -15)) w.push(`music rms ${s.rmsDb} (target ≈ -20)`);
  } else if (s.group === 'sfx' || s.group === 'events') {
    if (s.peakDb > -1 || s.peakDb < -30) w.push(`sfx peak ${s.peakDb} (target ≈ -6)`);
  }
  return w;
}

const t0 = Date.now();
const srv = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.port}/tools/preview/audio.html?qa&sr=${SR}`);
  await page.waitForFunction(() => window.__qaReady === true, null, { timeout: 30000 });
  let list = await page.evaluate(() => window.__qa.list());
  if (GROUPS) list = list.filter((x) => GROUPS.has(x.group));
  if (ONLY) list = list.filter((x) => ONLY.test(x.id) || ONLY.test(x.label || ''));
  console.log(`[audio-qa] rendering ${list.length} sounds at ${SR} Hz…`);

  const results = [];
  const CHUNK = 6;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const r = await page.evaluate((c) => window.__qa.run(c), chunk);
    results.push(...r);
    process.stdout.write(`\r[audio-qa] ${Math.min(i + CHUNK, list.length)}/${list.length}`);
  }
  process.stdout.write('\n');

  // ---- table ----------------------------------------------------------------------------------
  const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
  console.log(`${pad('group', 10)}${pad('id', 26)}${lpad('len', 7)}${lpad('peak', 8)}${lpad('rms', 8)}${lpad('act', 8)}${lpad('cent', 7)}${lpad('dc', 10)}  status`);
  let warnCount = 0;
  for (const s of results) {
    const w = s.status === 'ok' ? warnings(s) : [];
    if (s.status !== 'ok') failed++;
    if (w.length) warnCount++;
    console.log(`${pad(s.group, 10)}${pad(s.label || s.id, 26)}${lpad(s.dur ?? '-', 7)}${lpad(s.peakDb ?? '-', 8)}${lpad(s.rmsDb ?? '-', 8)}${lpad(s.activeRmsDb ?? '-', 8)}${lpad(s.centroid ?? '-', 7)}${lpad(s.dc ?? '-', 10)}  ${s.status}${w.length ? `  ⚠ ${w.join('; ')}` : ''}`);
  }
  // group summaries
  const groups = [...new Set(results.map((s) => s.group))];
  console.log('\n[audio-qa] summary');
  for (const g of groups) {
    const rs = results.filter((s) => s.group === g && s.status === 'ok');
    if (!rs.length) continue;
    const med = (k) => { const v = rs.map((s) => s[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    console.log(`  ${pad(g, 10)} n=${lpad(rs.length, 3)}  peak median ${lpad(med('peakDb'), 6)} dBFS (max ${Math.max(...rs.map((s) => s.peakDb))})   rms median ${lpad(med('rmsDb'), 6)} dBFS`);
  }
  fs.writeFileSync(path.join(OUT, 'audio-qa.json'), JSON.stringify(results, null, 1));

  // ---- contact sheets -------------------------------------------------------------------------
  if (!args['no-sheets']) {
    const n = await page.evaluate(() => window.__qa.sheetCount());
    for (let i = 0; i < n; i++) {
      const info = await page.evaluate((k) => window.__qa.drawSheet(k), i);
      await page.setViewportSize({ width: 1500, height: info.height });
      const file = path.join(OUT, `audio-qa-${String(i + 1).padStart(2, '0')}-${info.group}.png`);
      await page.locator('#sheet').screenshot({ path: file });
      console.log(`[audio-qa] sheet ${file}`);
    }
  }
  if (errors.length) { console.log(`[audio-qa] page errors:\n  ${errors.slice(0, 10).join('\n  ')}`); failed += errors.length; }
  console.log(`[audio-qa] ${results.length} sounds, ${failed} failures, ${warnCount} warnings — ${((Date.now() - t0) / 1000).toFixed(1)} s → ${OUT}`);
} finally {
  await browser.close();
  srv.close();
}
process.exit(failed ? 1 : 0);
