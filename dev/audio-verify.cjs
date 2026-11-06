#!/usr/bin/env node
// Dead County – headless verification of the procedural audio layer.
//
//   node dev/audio-verify.cjs [--out DIR] [--sheets] [--wav] [--only name,name] [--skip-api] [--port 5202]
//
// Starts Vite, opens dev/audio-test.html in headless Chromium, renders every sound variant through the
// real synthesis code into OfflineAudioContext buffers and checks duration / peak / RMS / NaN, then
// exercises every AudioEngine API method on a live AudioContext. --sheets writes spectrogram contact
// sheets (PNG) and --wav writes every variant as 16-bit WAV into --out (default: OS temp dir).
// Exit code 1 on any failure.

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const PORT = +opt('--port', 5202);
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'dead-county-audio')));
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

function waitForServer(url, timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on('error', retry);
    };
    const retry = () => (Date.now() - t0 > timeoutMs ? reject(new Error('vite did not start')) : setTimeout(tryOnce, 250));
    tryOnce();
  });
}

const db = (x) => (20 * Math.log10(x + 1e-12)).toFixed(1);

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let viteLog = '';
  vite.stdout.on('data', (d) => (viteLog += d));
  vite.stderr.on('data', (d) => (viteLog += d));
  const killVite = () => {
    try {
      process.kill(-vite.pid, 'SIGTERM');
    } catch (e) {
      /* already gone */
    }
  };
  process.on('exit', killVite);
  process.on('SIGINT', () => process.exit(130));

  let browser;
  let failed = 0;
  const fail = (msg) => {
    failed++;
    console.log('  FAIL ' + msg);
  };
  try {
    const url = `http://localhost:${PORT}/dev/audio-test.html`;
    await waitForServer(url, 30000);
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage();
    const consoleMsgs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleMsgs.push('[pageerror] ' + e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.audioTest, null, { timeout: 30000 });
    const defs = await page.evaluate(() => window.audioTest.defs);
    const publicNames = await page.evaluate(() => window.audioTest.publicNames);

    // ---------------------------------------------------------------- contract coverage
    console.log('\n== contract coverage');
    for (const n of publicNames) if (!defs[n]) fail('missing sound def: ' + n);
    console.log(`  ${publicNames.length} public names, ${Object.keys(defs).length} rendered names (incl. internal)`);

    // ---------------------------------------------------------------- offline render
    console.log('\n== offline render of every variant');
    const names = ONLY || Object.keys(defs);
    const { results, wallMs } = await page.evaluate((names) => window.audioTest.renderAll({ names }), names);
    const by = new Map();
    for (const r of results) {
      if (!by.has(r.name)) by.set(r.name, []);
      by.get(r.name).push(r);
    }
    let totalSamples = 0, totalMs = 0;
    const rows = [];
    const memRows = [];
    for (const n of names) {
      const rs = (by.get(n) || []).sort((a, b) => a.variant - b.variant);
      const d = defs[n];
      if (rs.length !== d.variants) fail(`${n}: expected ${d.variants} variants, got ${rs.length}`);
      for (const r of rs) {
        const id = `${n}#${r.variant}`;
        if (r.error) {
          fail(`${id}: render error ${r.error.split('\n')[0]}`);
          continue;
        }
        totalSamples += r.samples;
        totalMs += r.ms;
        if (r.nan || r.rawNan) fail(`${id}: NaN/Inf samples`);
        if (r.rawPeak < 1e-5) fail(`${id}: silent render (raw peak ${r.rawPeak})`);
        if (r.peak > 1.0001) fail(`${id}: clipped (peak ${r.peak.toFixed(3)})`);
        if (r.peak < 0.05) fail(`${id}: too quiet after normalise (peak ${r.peak})`);
        if (r.rms < 1e-4) fail(`${id}: near-silent (rms ${r.rms})`);
        if (r.duration < 0.02) fail(`${id}: too short (${r.duration}s)`);
        if (r.duration > d.dur + 0.05 || r.duration > 15) fail(`${id}: too long (${r.duration.toFixed(2)}s)`);
        if (d.loop && r.seam > 0.25) fail(`${id}: loop seam jump ${r.seam.toFixed(3)}`);
        if (!d.loop && r.rawPeak > 50) fail(`${id}: absurd raw peak ${r.rawPeak.toFixed(1)} (gain staging)`);
      }
      if (!rs.length) continue;
      const pk = Math.max(...rs.map((r) => r.peak || 0));
      const rms = Math.max(...rs.map((r) => r.rms || 0));
      const lw = Math.max(...rs.map((r) => r.rmsWin || 0));
      const dur = Math.max(...rs.map((r) => r.duration || 0));
      const ms = rs.reduce((a, r) => a + (r.ms || 0), 0);
      const raw = Math.max(...rs.map((r) => r.rawPeak || 0));
      const kb = rs.reduce((a, r) => a + (r.samples || 0) * 4, 0) / 1024;
      memRows.push([n, kb]);
      rows.push([n, rs.length, dur.toFixed(2), pk.toFixed(2), db(rms), db(lw), raw.toFixed(2), ms.toFixed(0), rs[0].sr, kb.toFixed(0)]);
    }
    const head = ['sound', 'var', 'dur', 'peak', 'rmsdB', 'loud', 'rawPk', 'ms', 'sr', 'KiB'];
    const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
    const fmt = (r) => r.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('  ');
    console.log('  ' + fmt(head));
    for (const r of rows) console.log('  ' + fmt(r));
    memRows.sort((a, b) => b[1] - a[1]);
    console.log('\n  biggest: ' + memRows.slice(0, 12).map(([n, kb]) => `${n} ${(kb / 1024).toFixed(1)}MB`).join(', '));
    console.log(`\n  ${results.length} variants, ${(totalSamples / 1e6).toFixed(2)} M samples (${((totalSamples * 4) / 1048576).toFixed(1)} MB as float32), render ${(totalMs / 1000).toFixed(1)} s summed / ${(wallMs / 1000).toFixed(1)} s wall`);

    // ---------------------------------------------------------------- music generator
    console.log('\n== music generator');
    const mc = await page.evaluate(() => window.audioTest.musicCheck());
    for (const l of mc.info) console.log('  ' + l);
    for (const i of mc.issues) fail('music: ' + i);

    // ---------------------------------------------------------------- outputs
    if (flag('--sheets') || flag('--wav')) fs.mkdirSync(OUT, { recursive: true });
    if (flag('--sheets')) {
      const items = [];
      for (const n of names) for (let v = 0; v < Math.min(2, defs[n].variants); v++) items.push([n, v]);
      const per = 18;
      for (let k = 0; k < items.length; k += per) {
        const png = await page.evaluate((it) => window.audioTest.contactSheet(it, 3), items.slice(k, k + per));
        const f = path.join(OUT, `sheet-${String(k / per).padStart(2, '0')}.png`);
        fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
      }
      console.log(`\n  spectrogram sheets written to ${OUT}`);
    }
    if (flag('--wav')) {
      for (const n of names)
        for (let v = 0; v < defs[n].variants; v++) {
          const b64 = await page.evaluate(([n, v]) => window.audioTest.wav(n, v), [n, v]);
          fs.writeFileSync(path.join(OUT, `${n}_${v}.wav`), Buffer.from(b64, 'base64'));
        }
      console.log(`  WAV files written to ${OUT}`);
    }

    // ---------------------------------------------------------------- live API smoke test
    if (!flag('--skip-api')) {
      console.log('\n== live AudioEngine API smoke test');
      const api = await page.evaluate(() => window.audioTest.apiSmoke());
      for (const l of api.log) console.log('  ' + l);
      console.log(`  master output peak ${api.outPeak?.toFixed(3)} nan=${api.outNan}`);
      for (const e of api.errors) fail('api: ' + e);
      if (api.outNan) fail('api: NaN in live output');
      if (!(api.outPeak > 0.001)) fail('api: live output silent');
      if (api.outPeak > 1.5) fail('api: live output way too hot ' + api.outPeak);
    }

    const unexpected = consoleMsgs.filter((m) => !/unknown sound "nope_/.test(m));
    const unknownWarn = consoleMsgs.filter((m) => /unknown sound "nope_sound"/.test(m)).length;
    if (!flag('--skip-api') && unknownWarn !== 1) fail(`expected exactly one warning for unknown sound, got ${unknownWarn}`);
    if (unexpected.length) {
      console.log('\n== console warnings/errors');
      for (const m of unexpected.slice(0, 40)) console.log('  ' + m);
      for (const m of unexpected) if (/pageerror|\[error\]/.test(m)) fail('console: ' + m.slice(0, 200));
    }
  } catch (e) {
    fail('harness: ' + (e && e.stack ? e.stack : e));
    if (viteLog) console.log(viteLog.slice(-2000));
  } finally {
    if (browser) await browser.close();
    killVite();
  }
  console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main();
