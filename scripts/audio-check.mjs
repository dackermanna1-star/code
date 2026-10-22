#!/usr/bin/env node
// Headless verification of the procedural audio system (src/audio).
//
//   node scripts/audio-check.mjs            # starts Vite on :5198 if it is not running
//
// Loads scripts/audio-lab.html in headless Chromium and checks:
//   1. startup synthesis time (worker pool and main-thread fallback)
//   2. every synthesised buffer: finite, peak <= 1, not silent, decays / loops seamlessly,
//      and spectral character (explosions far darker than rifle cracks, far layers darker
//      than near ones, pitch sweeps of whistles and dives, rotor/engine periodicities)
//   3. a real-time 300 events/s battle stress run: no exceptions, voice cap holds
//   4. offline renders of whole scenes through the real runtime: speed-of-sound delays,
//      distance attenuation and filtering, limiter, ducking + ear ringing, doppler,
//      retarded jet position, rotary cannon bursts, weather, radio rate limiting.
// Exits non-zero if any check fails.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5198;
const LAB = `http://localhost:${PORT}/scripts/audio-lab.html`;
const SYNTH_BUDGET_MS = 1500;

const results = [];
function check(group, name, ok, detail = '') {
  results.push({ group, name, ok: !!ok, detail });
}

async function serverUp() {
  try {
    const res = await fetch(LAB);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return () => {};
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (await serverUp()) return () => child.kill();
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('Vite dev server did not start on port ' + PORT);
}

async function openLab(browser, query = '') {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(LAB + query);
  await page.waitForFunction(() => window.audioLab);
  return { page, errors };
}

const fmt = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : String(v));

async function checkSynthesis(browser) {
  for (const [label, query] of [['worker pool', ''], ['main-thread fallback', '?workers=0']]) {
    const { page, errors } = await openLab(browser, query);
    const res = await page.evaluate(async () => {
      let maxGap = 0;
      let last = performance.now();
      const iv = setInterval(() => {
        const now = performance.now();
        maxGap = Math.max(maxGap, now - last);
        last = now;
      }, 5);
      const t0 = performance.now();
      const s = await window.audioLab.start();
      clearInterval(iv);
      return { ms: performance.now() - t0, maxGap, ...s.synthesis };
    });
    const detail = `${fmt(res.ms, 0)} ms wall (${res.workers} workers, ${fmt(res.busyMs, 0)} ms cpu), ${fmt(res.seconds, 0)} s of audio, ${fmt(res.megabytes)} MB, longest main-thread stall ${fmt(res.maxGap, 0)} ms`;
    check('synthesis', `${label} under ${SYNTH_BUDGET_MS} ms`, res.ms < SYNTH_BUDGET_MS, detail);
    check('synthesis', `${label}: page stays responsive (stall < 100 ms)`, res.maxGap < 100, `${fmt(res.maxGap, 0)} ms`);
    check('synthesis', `${label}: no errors`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
}

// Per-buffer sanity and spectral expectations.
async function checkBuffers(page) {
  const rows = await page.evaluate(() => window.audioLab.analyzeBank());
  const rising = new Set(['incoming_shell', 'bomb_whistle', 'drone_dive', 'jet_gun']);
  // Not decaying one-shots by nature: speech-like chatter and a pass-by that swells and fades.
  const sustained = (key) => key.startsWith('radio:') || key === 'jet_flyby';
  let bad = 0;
  let loud = 0;
  const silent = [];
  const decayFail = [];
  const seamFail = [];
  const fadeFail = [];
  for (const r of rows) {
    if (r.bad) bad++;
    if (r.peak > 1) loud++;
    if (r.key !== 'impulse' && (r.peak < 0.05 || r.rmsDb < -60)) silent.push(`${r.key}/${r.layer} peak ${fmt(r.peak, 3)} rms ${fmt(r.rmsDb)}`);
    if (r.loop) {
      if (r.seam > 1.1) seamFail.push(`${r.key} ${fmt(r.seam, 2)}`);
    } else if (r.key !== 'impulse' && !sustained(r.key)) {
      const base = r.key.replace(/^flyby:/, '');
      if (!rising.has(base) && r.tailToHeadDb > -3) decayFail.push(`${r.key}/${r.layer} ${fmt(r.tailToHeadDb)}`);
      if (rising.has(base) && base !== 'jet_gun' && r.tailToHeadDb < 6) decayFail.push(`${r.key} (should rise) ${fmt(r.tailToHeadDb)}`);
      if (r.endAbs > 0.02 && base !== 'jet_gun') fadeFail.push(`${r.key}/${r.layer}`);
    }
  }
  check('buffers', `${rows.length} buffers: all samples finite`, bad === 0, `${bad} with NaN/Inf`);
  check('buffers', 'peak <= 1 everywhere', loud === 0, `${loud} over`);
  check('buffers', 'no silent buffers (peak > 0.05, RMS > -60 dB)', silent.length === 0, silent.join(', '));
  check('buffers', 'one-shots decay (tail 3 dB+ below head; whistles/dives rise)', decayFail.length === 0, decayFail.join(', '));
  check('buffers', 'one-shots end faded (no click at the end)', fadeFail.length === 0, fadeFail.join(', '));
  const loops = rows.filter((r) => r.loop);
  check('buffers', `${loops.length} loops are seamless (wrap step no larger than any step inside)`, seamFail.length === 0,
    seamFail.join(', ') || `worst ${fmt(Math.max(...loops.map((r) => r.seam)), 2)}`);
  const flyby = rows.find((r) => r.key === 'jet_flyby');
  check('buffers', 'jet flyby swells to its pass and fades', flyby.peakAt > 1 && flyby.peakAt < 3, `loudest at ${fmt(flyby.peakAt, 2)} s of ${fmt(flyby.seconds, 1)} s`);

  const avg = (key, layer = 'near', field = 'centroid') => {
    const sel = rows.filter((r) => r.key === key && r.layer === layer);
    return sel.reduce((s, r) => s + r[field], 0) / sel.length;
  };
  const c = (key, layer) => avg(key, layer, 'centroid');
  const low = (key) => avg(key, 'near', 'low');
  const rifle = c('rifle');
  check('spectra', 'rifle crack is bright (centroid > 1.2 kHz)', rifle > 1200, `${fmt(rifle, 0)} Hz`);
  check('spectra', 'supersonic flyby snap is the brightest gun sound (> 2.5 kHz)', c('flyby:bullet_crack') > 2500, `${fmt(c('flyby:bullet_crack'), 0)} Hz`);
  check('spectra', 'explosions far darker than rifle (huge < small < rifle/2)',
    c('explosion_huge') < c('explosion_small') && c('explosion_small') < rifle / 2,
    `huge ${fmt(c('explosion_huge'), 0)} / medium ${fmt(c('explosion_medium'), 0)} / small ${fmt(c('explosion_small'), 0)} / rifle ${fmt(rifle, 0)} Hz`);
  check('spectra', 'heavier guns are lower (rifle > rifle_ak > hmg > autocannon-ish)',
    rifle > c('rifle_ak') && c('rifle_ak') > c('hmg') && c('hmg') > 0.8 * c('autocannon'),
    `rifle ${fmt(rifle, 0)}, ak ${fmt(c('rifle_ak'), 0)}, gpmg ${fmt(c('gpmg'), 0)}, hmg ${fmt(c('hmg'), 0)}, autocannon ${fmt(c('autocannon'), 0)} Hz`);
  check('spectra', 'big booms are sub-heavy (>60% energy < 150 Hz)', low('explosion_huge') > 0.6 && low('tank_cannon') > 0.6 && low('howitzer') > 0.6,
    `huge ${fmt(100 * low('explosion_huge'), 0)}%, tank ${fmt(100 * low('tank_cannon'), 0)}%, howitzer ${fmt(100 * low('howitzer'), 0)}%`);
  check('spectra', 'rifle is not boomy (<30% energy < 150 Hz)', low('rifle') < 0.3, `${fmt(100 * low('rifle'), 0)}%`);
  const farKeys = [...new Set(rows.filter((r) => r.layer === 'far').map((r) => r.key))];
  const farFail = farKeys.filter((k) => !(c(k, 'far') < c(k, 'near') * 1.05));
  check('spectra', `far layers darker than near (${farKeys.length} sounds)`, farFail.length === 0, farFail.join(', '));
  const ir = rows.find((r) => r.key === 'impulse');
  check('reverb', 'outdoor IR: 40 dB decay in 0.8-2.6 s, darker than 2.5 kHz centroid', ir.t40 > 0.8 && ir.t40 < 2.6 && ir.centroid < 2500,
    `t40 ${fmt(ir.t40, 2)} s, centroid ${fmt(ir.centroid, 0)} Hz`);

  // Targeted probes on raw buffers.
  const probe = await page.evaluate(async () => {
    const A = await import('/scripts/audio-analysis.js');
    const bank = window.audioLab.audio.bank;
    const buf = (key, i = 0) => bank.get(key).near[i].buffer;
    const pitchTrack = (b, lo, hi, t0, t1) => A.peakFreq(A.spectrum(A.mono(b), b.sampleRate, { from: Math.round(t0 * b.sampleRate), len: Math.round((t1 - t0) * b.sampleRate), size: 4096 }), lo, hi);
    const mono = (b) => A.mono(b);
    const heli = buf('loop:heli');
    const plane = buf('loop:plane');
    const drone = buf('loop:drone');
    const jg = [0, 1].map((i) => buf('jet_gun', i));
    const shell = buf('incoming_shell');
    const bomb = buf('bomb_whistle');
    const dive = buf('drone_dive');
    const ric = buf('ricochet');
    const irb = bank.impulse;
    const irEnv = A.envelope(mono(irb), irb.sampleRate, 0.01);
    const slap = Math.max(...irEnv.slice(12, 26)) / Math.max(...irEnv.slice(28, 34));
    return {
      heli: A.envelopePeriodicity(mono(heli), heli.sampleRate, 12, 40),
      planeMod: A.modulationDepth(mono(plane), plane.sampleRate, 0.05),
      drone: A.peakFreq(A.spectrum(mono(drone), drone.sampleRate, { size: 8192 }), 150, 400),
      jetGun: jg.map((b) => A.envelopePeriodicity(mono(b).subarray(Math.round(0.3 * b.sampleRate)), b.sampleRate, 40, 140).hz),
      shell: [pitchTrack(shell, 300, 3000, 0.2, 0.7), pitchTrack(shell, 300, 3000, 1.7, 2.2)],
      bomb: [pitchTrack(bomb, 300, 3000, 0.3, 0.9), pitchTrack(bomb, 300, 3000, 2.9, 3.5)],
      dive: [pitchTrack(dive, 150, 600, 0.05, 0.45), pitchTrack(dive, 150, 600, 1.8, 2.3)],
      ricochet: [pitchTrack(ric, 1000, 5000, 0.01, 0.08), pitchTrack(ric, 1000, 5000, 0.3, 0.45)],
      slap,
    };
  });
  check('character', 'helicopter blade slap periodicity 15-25 Hz', probe.heli.hz >= 15 && probe.heli.hz <= 25, `${fmt(probe.heli.hz)} Hz (r=${fmt(probe.heli.strength, 2)})`);
  check('character', 'turboprop engines beat (envelope modulation > 0.15)', probe.planeMod > 0.15, fmt(probe.planeMod, 2));
  check('character', 'FPV drone fundamental 150-400 Hz', probe.drone >= 150 && probe.drone <= 400, `${fmt(probe.drone, 0)} Hz`);
  check('character', 'jet gun buzzes at its firing rate (55-110 Hz)', probe.jetGun.every((hz) => hz >= 55 && hz <= 110), probe.jetGun.map((v) => fmt(v, 0)).join(', ') + ' Hz');
  check('character', 'incoming shell whistle falls in pitch', probe.shell[1] < probe.shell[0] * 0.9, `${fmt(probe.shell[0], 0)} -> ${fmt(probe.shell[1], 0)} Hz`);
  check('character', 'bomb whistle falls in pitch', probe.bomb[1] < probe.bomb[0] * 0.9, `${fmt(probe.bomb[0], 0)} -> ${fmt(probe.bomb[1], 0)} Hz`);
  check('character', 'drone dive buzz rises in pitch', probe.dive[1] > probe.dive[0] * 1.15, `${fmt(probe.dive[0], 0)} -> ${fmt(probe.dive[1], 0)} Hz`);
  check('character', 'ricochet whine drops', probe.ricochet[1] < probe.ricochet[0], `${fmt(probe.ricochet[0], 0)} -> ${fmt(probe.ricochet[1], 0)} Hz`);
  check('reverb', 'IR has a terrain slapback (envelope bump at 120-250 ms)', probe.slap > 1.2, `bump ratio ${fmt(probe.slap, 2)}`);
  return rows.length;
}

async function checkRealtimeStress(page) {
  const max = await page.evaluate(() => window.audioLab.audio.options.maxVoices);
  await page.evaluate(() => window.audioLab.setStress(true, 300));
  let peakVoices = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    await page.waitForTimeout(100);
    const s = await page.evaluate(() => window.audioLab.labStats());
    peakVoices = Math.max(peakVoices, s.voices, s.labMaxVoices);
  }
  const s = await page.evaluate(() => window.audioLab.labStats());
  await page.evaluate(() => window.audioLab.setStress(false));
  const v = s.voiceStats;
  check('stress (real-time)', `voice cap holds at ${max}`, peakVoices <= max && peakVoices >= max * 0.8,
    `peak ${peakVoices}/${max} voices, ${v.events} events -> ${v.played} played, ${v.stolen} stolen, ${v.toBed} to bed, ${s.bed.aggregated} aggregated`);
  check('stress (real-time)', 'main-thread cost of update() < 1 ms/frame', s.updateMsPerFrame < 1, `${fmt(s.updateMsPerFrame, 3)} ms over ${s.frames} frames`);
  check('stress (real-time)', 'loops capped at 8 with many sources', s.loops <= 8 && s.loops > 0, `${s.loops} loops`);
  check('stress (real-time)', 'radio rate limiting', s.radio.accepted < s.radio.requested || s.radio.requested === 0, `${s.radio.accepted}/${s.radio.requested} accepted`);
}

async function checkScenes(page) {
  const run = (name) => page.evaluate((n) => window.audioLab.renderScene(n), name);
  const distance = await run('distance');
  const d = distance.result;
  const delayOk = d.every((e) => Math.abs(e.delay - e.expectedDelay) < Math.max(0.02, 0.03 * e.expectedDelay));
  check('scene: distance', 'sound arrives distance/343 s late', delayOk, d.map((e) => `${e.distance} m: ${fmt(e.delay, 3)} s (exp ${fmt(e.expectedDelay, 3)})`).join(', '));
  check('scene: distance', 'quieter with distance', d[0].peakDb > d[1].peakDb + 6 && d[1].peakDb > d[2].peakDb + 4, d.map((e) => `${fmt(e.peakDb)} dB`).join(' > '));
  check('scene: distance', 'duller with distance (air absorption, far layer)', d[0].centroid > d[1].centroid && d[1].centroid > d[2].centroid, d.map((e) => `${fmt(e.centroid, 0)} Hz`).join(' > '));
  check('scene: distance', 'rifle still audible at ~1 km (> -60 dBFS)', d[2].peakDb > -60, `${fmt(d[2].peakDb)} dBFS`);

  const blast = (await run('blast')).result;
  check('scene: blast', 'huge blast at 25 m does not clip (limiter + soft clip)', blast.peak <= 1 && blast.bad === 0, `peak ${fmt(blast.peak, 3)}`);
  check('scene: blast', 'blast dominates the mix', blast.blastPeakDb > blast.rifleDb + 8, `blast ${fmt(blast.blastPeakDb)} dB vs rifles ${fmt(blast.rifleDb)} dB`);
  check('scene: blast', 'close blast ducks and muffles everything, then recovers', blast.duckMinDb < -4 && blast.muffleMinHz < 3000 && blast.duckEndDb > -0.5,
    `duck ${fmt(blast.duckMinDb)} dB, muffle ${fmt(blast.muffleMinHz, 0)} Hz, after 4.4 s ${fmt(blast.duckEndDb, 2)} dB`);
  const ringing = (await run('ringing')).result;
  check('scene: blast', 'ear ringing tone after a close blast', ringing.prominenceDb > 4, `${fmt(ringing.toneHz, 0)} Hz, ${fmt(ringing.prominenceDb)} dB above neighbours`);

  const jet = (await run('jetpass')).result;
  check('scene: jet pass', 'jet heard from its retarded position (loudest after the visual pass)', jet.loudestAt > jet.visualPassAt + 0.2 && jet.loudestAt < jet.visualPassAt + 1.5,
    `loudest at ${fmt(jet.loudestAt, 2)} s, overhead at ${jet.visualPassAt} s`);
  const doppler = (await run('doppler')).result;
  check('scene: doppler', 'drone pitch drops as it passes (doppler)', doppler.ratio > 1.1 && doppler.ratio < 1.5,
    `${fmt(doppler.approachHz, 0)} -> ${fmt(doppler.recedeHz, 0)} Hz, ratio ${fmt(doppler.ratio, 2)} (expected ~${fmt(doppler.expected, 2)})`);
  const jg = (await run('jetgun')).result;
  check('scene: jet gun', 'BRRRT lasts opts.duration (1.5 s) plus spin-down', jg.burstSeconds > 1.4 && jg.burstSeconds < 2.4, `${fmt(jg.burstSeconds, 2)} s`);
  check('scene: jet gun', 'firing-rate buzz present in the output', jg.rate.hz >= 55 && jg.rate.hz <= 110, `${fmt(jg.rate.hz, 0)} Hz (r=${fmt(jg.rate.strength, 2)})`);

  const stress = await run('stress');
  check('scene: stress', '300 events/s for 6 s: no clipping, no NaN', stress.result.peak <= 1 && stress.result.bad === 0, `peak ${fmt(stress.result.peak, 3)}, RMS ${fmt(stress.result.rmsDb)} dBFS`);
  check('scene: stress', 'voice cap holds offline too', stress.maxVoices <= 48, `${stress.maxVoices} voices, ${stress.maxLoops} loops`);
  check('scene: stress', 'renders faster than real time (> 2x incl. JS)', stress.realtimeFactor > 2, `${fmt(stress.realtimeFactor)}x real time, update ${fmt(stress.updateMsPerFrame, 3)} ms/frame`);

  const weather = (await run('weather')).result;
  check('scene: weather', 'wind + rain + storm render cleanly; close thunder is loud', weather.peak <= 1 && weather.bad === 0 && weather.thunderRmsDb > weather.bedRmsDb + 3,
    `bed ${fmt(weather.bedRmsDb)} dB RMS, thunder ${fmt(weather.thunderRmsDb)} dB RMS, peak ${fmt(weather.peak, 2)}`);
  const radio = await run('radio');
  check('scene: radio', 'chatter is band-limited (>90% energy in 250-3500 Hz)', radio.result.band > 0.9, `${fmt(100 * radio.result.band)}%`);
  check('scene: radio', 'flood of radio() calls is rate limited', radio.stats.radio.accepted <= 6 && radio.stats.radio.requested === 20,
    `${radio.stats.radio.accepted}/${radio.stats.radio.requested} accepted, ${radio.stats.radio.babbled} transmissions`);
}

async function main() {
  const stop = await ensureServer();
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  try {
    await checkSynthesis(browser);
    const { page, errors } = await openLab(browser);
    await page.evaluate(() => window.audioLab.start());
    await checkBuffers(page);
    await checkRealtimeStress(page);
    await checkScenes(page);
    check('runtime', 'no page errors or exceptions', errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    stop();
  }
  let group = '';
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n${group}`);
    }
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
