#!/usr/bin/env node
/**
 * Automated audio verification in headless Chromium (we cannot listen, so we measure).
 *
 *   node tools/audiocheck.mjs [--filter <regex>] [--out screenshots/audio] [--png key,key,...]
 *                             [--no-mix] [--no-music] [--no-realtime] [--no-png] [--verbose] [--port 5198] [--root <dir>]
 *
 * Starts a Vite dev server, opens /debug/audio.html and uses its `window.__audioCheck` API to:
 *  1. synthesize every sound variation and loop, play it through an OfflineAudioContext and
 *     analyse the result: finite, non-silent, peak ≤ 0 dBFS, sensible duration, no DC, loop
 *     seams, and spectral centroid inside a plausible range per category (stone/glass bright,
 *     wool/sand dull, cow low ...);
 *  2. write spectrogram PNGs for a representative set (inspect them with an image viewer);
 *  3. run a full-engine mix test on an OfflineAudioContext (simulated gameplay incl. a burst of
 *     80 sounds, explosions, thunder, moving loops, ambience changes, music) — checks the
 *     limiter/clipper keeps the master below 0 dBFS and that voice limiting holds;
 *  4. render 30 s of generative music per mood through the engine (spectrogram PNGs + levels);
 *  5. run a realtime test (live AudioContext + synthesis worker): pre-render time, levels,
 *     lazy-render latency.
 * Writes <out>/report.json and exits non-zero on failures.
 */
import { createServer } from 'vite';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes('--' + name);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(opt('root', path.join(here, '..')));
const outDir = path.resolve(root, opt('out', 'screenshots/audio'));
const filter = opt('filter', null) ? new RegExp(opt('filter')) : null;
const port = +opt('port', 5198);
const verbose = flag('verbose');

const DEFAULT_PNGS = [
  'block.stone.break#0', 'block.grass.step#0', 'block.glass.break#0', 'block.wood.place#0', 'block.wool.step#0', 'block.gravel.break#0',
  'random.explode#0', 'random.pop#0', 'random.orb#0', 'random.levelup#0', 'random.fuse#0', 'random.door_open#0',
  'mob.zombie.say#0', 'mob.cow.say#0', 'mob.villager.idle#0', 'mob.ghast.moan#0', 'mob.enderman.portal#0', 'mob.sheep.say#0',
  'weather.thunder.near#0', 'ambient.cave#2', 'loop.rain', 'loop.fire', 'loop.portal', 'loop.nether',
];

/**
 * Expectations. `cent` = spectral centroid range (Hz), `dur` = active duration range (s),
 * `seam` = max loop seam discontinuity (× typical sample step). Every rule whose regex matches applies.
 */
const RULES = [
  { re: /^block\.[a-z_]+\.(step|hit)$/, dur: [0.02, 0.45] },
  { re: /^block\.[a-z_]+\.(place|land|fall)$/, dur: [0.04, 0.95] },
  { re: /^block\.(?!note_block)[a-z_]+\.break$/, dur: [0.15, 1.3] },
  { re: /^(ui|random)\.click$/, dur: [0.005, 0.15], cent: [800, 8000] },
  { re: /^random\.pop$/, dur: [0.03, 0.2], cent: [500, 3000] },
  { re: /^random\.orb$/, dur: [0.1, 1.0], cent: [1000, 6000] },
  { re: /^random\.levelup$/, dur: [0.6, 2.5] },
  { re: /^random\.explode$/, dur: [1.5, 5.0], cent: [40, 1500], why: 'explosion is boom-heavy with a debris tail' },
  { re: /^weather\.thunder\./, dur: [3, 10] },
  { re: /^weather\.thunder\.far$/, cent: [20, 450], why: 'distant thunder is a low rumble' },
  { re: /^ambient\.cave$/, dur: [2, 8] },
  { re: /^mob\.[a-z]+\.step$/, dur: [0.02, 0.6] },
  { re: /^block\.(stone|nether_bricks|glass|chain|lantern|gravel|plant|crop)\.(break|hit|step|place)$/, cent: [1500, 9500], why: 'hard / crisp materials should be bright' },
  { re: /^block\.glass\.break$/, cent: [3500, 10000], why: 'glass shatter is very bright' },
  { re: /^block\.wool\./, cent: [60, 900], why: 'wool is dull' },
  { re: /^block\.(sand|soul_sand)\.(break|hit|step|place|land)$/, cent: [300, 2000], why: 'sand is soft / dull' },
  { re: /^block\.(wood|ladder|stem)\.(hit|step|place|land)$/, cent: [250, 1600], why: 'wood knock sits in the low-mids' },
  { re: /^mob\.cow\./, cent: [80, 900], why: 'cow is low' },
  { re: /^mob\.(zombie|drowned)\.(say|hurt|death)$|^mob\.zombiepig\./, cent: [150, 1500], why: 'groans are low-mid' },
  { re: /^mob\.chicken\.(say|hurt)$|^mob\.wolf\.(hurt|whine)$|^mob\.pig\.(hurt|death)$|^mob\.spider\.(say|hurt|death)$/, cent: [600, 7000], why: 'small / shrill voices' },
  { re: /^mob\.ghast\.(moan|scream|charge|death)$/, cent: [400, 3000] },
  { re: /^mob\.villager\./, cent: [150, 2000] },
  { re: /^random\.(fuse|fizz)$|^entity\.generic\.(burn|extinguish)$|^item\.flintandsteel\.use$/, cent: [2500, 11000], why: 'hiss / sizzle is bright' },
  { re: /^block\.note_block\.(bell|chime)$/, cent: [1000, 7000] },
  { re: /^block\.note_block\.basedrum$/, cent: [20, 400] },
  { re: /^loop\./, dur: [3, 12], seam: 1.5, why: 'loops must be seamless' },
  { re: /^loop\.(underwater|rain_indoor|cave)$/, cent: [20, 900], why: 'muffled beds are dark' },
  { re: /^loop\.rain$/, cent: [1500, 9000], why: 'outdoor rain is a bright hiss' },
];

function evaluate(r) {
  const fails = [];
  if (r.error) return [`error: ${r.error}`];
  if (!r.finite) fails.push('non-finite samples');
  if (r.peak > 1.0) fails.push(`clipping: peak ${r.peakDb.toFixed(2)} dBFS > 0`);
  if (r.peakDb < -30) fails.push(`(near) silent: peak ${r.peakDb.toFixed(1)} dBFS`);
  if (r.activeDuration < 0.012) fails.push(`too short: ${(r.activeDuration * 1000).toFixed(1)} ms`);
  if (Math.abs(r.dc) > 0.01) fails.push(`DC offset ${r.dc.toFixed(4)}`);
  if (r.kind === 'sound' && r.endRel > 0.05) fails.push(`click at end (last sample ${(r.endRel * 100).toFixed(0)}% of peak)`);
  for (const rule of RULES) {
    if (!rule.re.test(r.name)) continue;
    const why = rule.why ? ` (${rule.why})` : '';
    if (rule.dur && (r.activeDuration < rule.dur[0] || r.activeDuration > rule.dur[1]))
      fails.push(`duration ${r.activeDuration.toFixed(2)} s outside [${rule.dur[0]}, ${rule.dur[1]}]`);
    if (rule.cent && (r.centroid < rule.cent[0] || r.centroid > rule.cent[1]))
      fails.push(`centroid ${r.centroid.toFixed(0)} Hz outside [${rule.cent[0]}, ${rule.cent[1]}]${why}`);
    if (rule.seam !== undefined && r.seam > rule.seam) fails.push(`loop seam discontinuity ${r.seam.toFixed(2)}${why}`);
  }
  return fails;
}

fs.mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, server: { port, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const addr = server.httpServer.address();
const realPort = typeof addr === 'object' && addr ? addr.port : port;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.stack || e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || (verbose && m.type() === 'warning')) pageErrors.push(`[console.${m.type()}] ${m.text()}`);
});
let exitCode = 0;
const report = { started: new Date().toISOString() };
try {
  const url = `http://127.0.0.1:${realPort}/debug/audio.html?check=1`;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__audioCheck !== undefined, null, { timeout: 120000 });
  const list = await page.evaluate(() => window.__audioCheck.list());
  const keys = [];
  for (const s of list.sounds) {
    if (filter && !filter.test(s)) continue;
    for (let v = 0; v < list.variations[s]; v++) keys.push(`${s}#${v}`);
  }
  for (const l of list.loops) if (!filter || filter.test(l)) keys.push(l);
  console.log(`audiocheck: ${list.sounds.length} sounds, ${list.loops.length} loops → checking ${keys.length} buffers`);

  // ---- 1. per-buffer checks --------------------------------------------------------------
  const t0 = Date.now();
  const results = [];
  const B = 24;
  for (let i = 0; i < keys.length; i += B) {
    const batch = keys.slice(i, i + B);
    const res = await page.evaluate((k) => window.__audioCheck.check(k), batch);
    results.push(...res);
    process.stdout.write(`\r  rendered ${Math.min(keys.length, i + B)}/${keys.length}`);
  }
  process.stdout.write('\n');
  let failures = 0;
  let synth = 0;
  let bytes = 0;
  const byCat = {};
  for (const r of results) {
    r.fails = evaluate(r);
    synth += r.synthMs;
    bytes += r.duration * r.renderSr * r.channels * 4;
    const c = (byCat[r.category] ??= { n: 0, cent: 0, fails: 0 });
    c.n++;
    c.cent += r.centroid;
    if (r.fails.length) {
      failures++;
      c.fails++;
    }
  }
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  if (verbose) {
    console.log(pad('key', 40), lpad('dur', 6), lpad('peak', 7), lpad('cent', 7), lpad('ms', 6));
    for (const r of results) console.log(pad(r.key, 40), lpad(r.activeDuration.toFixed(2), 6), lpad(r.peakDb.toFixed(1), 7), lpad(r.centroid.toFixed(0), 7), lpad(r.synthMs.toFixed(1), 6));
  }
  console.log('\nper category:');
  for (const [c, s] of Object.entries(byCat)) console.log(`  ${pad(c, 10)} ${lpad(s.n, 4)} buffers  mean centroid ${lpad((s.cent / s.n).toFixed(0), 5)} Hz  failures ${s.fails}`);
  const slow = [...results].sort((a, b) => b.synthMs - a.synthMs).slice(0, 6);
  console.log(`\nsynthesis: ${(synth / 1000).toFixed(2)} s CPU for ${results.length} buffers (mean ${(synth / Math.max(1, results.length)).toFixed(1)} ms); ` +
    `all buffers cached would take ${(bytes / 1048576).toFixed(1)} MB; checks took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('slowest: ' + slow.map((r) => `${r.key} ${r.synthMs.toFixed(0)} ms`).join(', '));
  if (failures) {
    exitCode = 1;
    console.log(`\nFAILED ${failures}/${results.length}:`);
    for (const r of results) if (r.fails.length) console.log(`  ✗ ${pad(r.key, 40)} ${r.fails.join('; ')}`);
  } else console.log(`\nall ${results.length} buffers passed`);
  report.buffers = results;

  // ---- 2. spectrograms ---------------------------------------------------------------------
  if (!flag('no-png')) {
    const pngs = opt('png', null) ? opt('png').split(',') : DEFAULT_PNGS;
    for (const k of pngs) {
      try {
        const url = await page.evaluate((key) => window.__audioCheck.spectrogramPNG(key), k);
        const file = path.join(outDir, `${k.replace(/[^a-z0-9._-]+/gi, '_')}.png`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      } catch (e) {
        console.log(`  spectrogram ${k} failed: ${e.message}`);
      }
    }
    console.log(`\nspectrograms → ${path.relative(process.cwd(), outDir)}/ (${pngs.length} PNGs)`);
  }

  // ---- 3. full-engine offline mix ----------------------------------------------------------
  if (!flag('no-mix')) {
    const mix = await page.evaluate(() => window.__audioCheck.mixTest(16));
    report.mix = mix;
    const ok = mix.finite && mix.peak < 1 && mix.maxVoices <= 48 && mix.rmsDb > -45;
    console.log(`\nengine mix test (OfflineAudioContext, ${mix.seconds} s simulated gameplay): peak ${mix.peakDb.toFixed(2)} dBFS, ` +
      `rms ${mix.rmsDb.toFixed(1)} dB, max voices ${mix.maxVoices}, pre-render ${mix.prerenderMs} ms, render ${mix.renderMs} ms → ${ok ? 'OK' : 'FAIL'}`);
    console.log('  per-second peak dB: ' + mix.profile.map((p) => p.peakDb).join(' '));
    if (!ok) exitCode = 1;
  }

  // ---- 4. generative music (offline engine render per mood) ------------------------------
  if (!flag('no-music')) {
    report.music = [];
    console.log('\ngenerative music (30 s offline render per mood):');
    for (const mode of ['menu', 'overworld', 'creative', 'underwater', 'nether', 'end']) {
      const res = await page.evaluate((m) => window.__audioCheck.musicRender(m, 30), mode);
      fs.writeFileSync(path.join(outDir, `music_${mode}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
      delete res.png;
      report.music.push(res);
      const ok = res.finite && res.peakDb < 0 && res.rmsDb > -50 && res.piece;
      console.log(`  ${mode.padEnd(10)} peak ${res.peakDb.toFixed(1)} dBFS, rms ${res.rmsDb.toFixed(1)} dB · ${res.piece} → ${ok ? 'OK' : 'FAIL'}`);
      if (!ok) exitCode = 1;
    }
  }

  // ---- 5. realtime -------------------------------------------------------------------------
  if (!flag('no-realtime')) {
    const rt = await page.evaluate(() => window.__audioCheck.realtimeTest());
    report.realtime = rt;
    const b = rt.stats1.bank;
    const ok = rt.maxPeak > 0.01 && rt.maxPeak < 1 && rt.lazyMs >= 0 && rt.stats1.state === 'running';
    console.log(`\nrealtime test: init ${rt.initMs} ms, prewarm done after ${rt.prewarmMs} ms (${rt.stats0.bank.rendered} buffers, ${(rt.stats0.bank.bytes / 1048576).toFixed(1)} MB, worker=${b.worker}), ` +
      `max output peak ${(20 * Math.log10(rt.maxPeak + 1e-9)).toFixed(1)} dBFS, max voices ${rt.maxVoices}, lazy render latency ${rt.lazyMs} ms, music ${JSON.stringify(rt.stats1.music)} → ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) exitCode = 1;
  }
} catch (e) {
  console.error('audiocheck crashed:', e);
  exitCode = 2;
}
if (pageErrors.length) {
  console.log(`\npage errors (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 30)) console.log('  ' + e);
  if (pageErrors.some((e) => !e.startsWith('[console.warning]'))) exitCode = exitCode || 1;
}
report.pageErrors = pageErrors;
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
await browser.close();
await server.close();
console.log(exitCode === 0 ? '\naudiocheck: PASS' : `\naudiocheck: FAIL (exit ${exitCode})`);
process.exit(exitCode);
