#!/usr/bin/env node
/* Headless verification for src/audio.js.
 *   node tools/audio-test.js            run all checks
 *   node tools/audio-test.js --wav DIR  also write a few rendered WAVs to DIR
 *   node tools/audio-test.js --quick    shorter music renders (4s)
 * Exits non-zero if any check fails.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const wavDir = args.includes('--wav') ? args[args.indexOf('--wav') + 1] : null;
const QUICK = args.includes('--quick');
const MUSIC_SECS = QUICK ? 4 : 8;
const PAGE = 'file://' + path.resolve(__dirname, 'audio-test.html');

const SPEC_SFX = ('ui_hover ui_click ui_back ui_confirm ui_error ui_open shoot_neutrophil shoot_macrophage shoot_tcell ' +
  'shoot_tcell_charged charge_tcell shoot_bcell shoot_helper dash hurt death heal shield_gain shield_break ability_ready ' +
  'ability_net ability_engulf ability_mark ability_swarm revive low_hp hit hit_armor crit kill_small kill_big kill_elite ' +
  'shot_wall explosion burn poison chain stun enemy_shoot enemy_shoot_big windup charge spawn burrow emerge teleport spore ' +
  'split beam_charge beam_fire lightning acid roar boss_phase boss_death pickup_iron pickup_health pickup_mutation ' +
  'pickup_malignant buy door_open door_close room_clear floor_enter portal heartbeat breath_in breath_out reroll unlock select').split(/\s+/);
const SPEC_TRACKS = ['title', 'veins', 'heart', 'lungs', 'gut', 'cortex', 'wound', 'shop', 'boss', 'final', 'victory', 'death'];
const ADAPTIVE = ['veins', 'heart', 'lungs', 'gut', 'cortex', 'wound', 'boss', 'final'];
const REGIONS = ['veins', 'heart', 'lungs', 'gut', 'cortex', 'wound'];

let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));
const f2 = (x) => (isFinite(x) ? x.toFixed(2) : String(x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeWav(file, sr, nch, data) {
  const n = data.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * nch * 2, 28); buf.writeUInt16LE(nch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const consoleMsgs = [];
  const newPage = async (init) => {
    const page = await browser.newPage();
    page.on('console', (m) => consoleMsgs.push(m.type() + ': ' + m.text()));
    page.on('pageerror', (e) => { fail('page error: ' + e.message); });
    if (init) await page.addInitScript(init);
    await page.goto(PAGE);
    return page;
  };

  // -------------------------------------------------------------------------
  console.log('\n[1] No Web Audio at all (AudioContext removed)');
  {
    const page = await newPage(() => {
      window.AudioContext = undefined; window.webkitAudioContext = undefined;
      window.OfflineAudioContext = undefined; window.webkitOfflineAudioContext = undefined;
    });
    const errs = await page.evaluate(() => TEST.smoke());
    check(errs.length === 0, 'every API call is a safe no-op ' + (errs.length ? JSON.stringify(errs) : ''));
    const r = await page.evaluate(async () => {
      const ok = AUDIO.init();
      AUDIO.music.play('heart');
      const a = AUDIO.music.clock();
      await new Promise((res) => setTimeout(res, 400));
      const b = AUDIO.music.clock();
      const rs = await AUDIO._renderSfx('hit').then(() => 'resolved', () => 'rejected');
      return { ok, ready: AUDIO.ready, a, b, rs };
    });
    check(r.ok === false && r.ready === false, 'init() returns false, ready=false');
    const expect = 0.4 * 76 / 60;
    check(r.b.beat - r.a.beat > expect * 0.8 && r.b.beat - r.a.beat < expect * 1.5 && r.b.bpm === 76,
      `clock advances without audio: ${f2(r.a.beat)} -> ${f2(r.b.beat)} @${r.b.bpm}bpm (expected +${f2(expect)})`);
    check(r.rs === 'rejected', '_renderSfx rejects cleanly without OfflineAudioContext');
    await page.close();
  }

  // -------------------------------------------------------------------------
  console.log('\n[2] API surface + pre-init calls (no AudioContext created yet)');
  const page = await newPage();
  {
    const api = await page.evaluate(() => {
      const f = (x) => typeof x;
      return {
        init: f(AUDIO.init), ready: f(AUDIO.ready), setVolume: f(AUDIO.setVolume), getVolume: f(AUDIO.getVolume),
        setMuted: f(AUDIO.setMuted), muted: f(AUDIO.muted), sfx: f(AUDIO.sfx), play: f(AUDIO.music.play),
        stop: f(AUDIO.music.stop), setIntensity: f(AUDIO.music.setIntensity), clock: f(AUDIO.music.clock),
        current: AUDIO.music.current === null ? 'null' : f(AUDIO.music.current), duck: f(AUDIO.duck), setLowpass: f(AUDIO.setLowpass),
        names: AUDIO._sfxNames, tracks: AUDIO._trackIds, ctx: AUDIO._debug().ctx,
      };
    });
    const want = { init: 'function', ready: 'boolean', setVolume: 'function', getVolume: 'function', setMuted: 'function',
      muted: 'boolean', sfx: 'function', play: 'function', stop: 'function', setIntensity: 'function', clock: 'function',
      current: 'null', duck: 'function', setLowpass: 'function' };
    const bad = Object.keys(want).filter((k) => api[k] !== want[k]);
    check(bad.length === 0, 'API present with correct types ' + (bad.length ? JSON.stringify(bad.map((k) => k + '=' + api[k])) : ''));
    const missing = SPEC_SFX.filter((n) => !api.names.includes(n));
    check(missing.length === 0, `all ${SPEC_SFX.length} spec SFX defined (${api.names.length} total) ${missing.length ? 'missing: ' + missing : ''}`);
    const missingT = SPEC_TRACKS.filter((n) => !api.tracks.includes(n));
    check(missingT.length === 0, 'all spec music tracks defined ' + (missingT.length ? 'missing: ' + missingT : ''));
    const errs = await page.evaluate(() => TEST.smoke());
    check(errs.length === 0, 'every API call before init() is safe ' + (errs.length ? JSON.stringify(errs) : ''));
    const r = await page.evaluate(async () => {
      AUDIO.music.play('cortex');
      const a = AUDIO.music.clock();
      await new Promise((res) => setTimeout(res, 500));
      const b = AUDIO.music.clock();
      return { a, b, ctx: AUDIO._debug().ctx, cur: AUDIO.music.current, ready: AUDIO.ready };
    });
    check(r.ctx === null && r.ready === false, 'no AudioContext was created before init()');
    check(r.cur === 'cortex', 'music.play before init is remembered (current=' + r.cur + ')');
    const exp = 0.5 * 2;
    check(r.b.beat - r.a.beat > exp * 0.8 && r.b.beat - r.a.beat < exp * 1.4, `pre-init clock advances: +${f2(r.b.beat - r.a.beat)} beats in 0.5s @120 (expect ~${exp})`);
  }

  // -------------------------------------------------------------------------
  console.log('\n[3] SFX offline renders (44.1kHz, variant 0 + all variants for frequent sounds)');
  {
    const names = await page.evaluate(() => AUDIO._sfxNames);
    const rows = [];
    for (const n of names) {
      const s = await page.evaluate((nm) => TEST.sfxStats(nm), n);
      rows.push([n, s]);
      const good = s.peak > 0.02 && s.peak <= 1.0 && s.rms > 1e-4 && isFinite(s.peak);
      if (!good) fail(`${n}: peak=${f2(s.peak)} rms=${s.rms}`);
    }
    console.log('  ' + 'name'.padEnd(20) + 'dur(s)  peak   peakdB  stRMSdB  RMSdB | target  weighted(dB)');
    const limited = [];
    for (const [n, s] of rows) {
      console.log('  ' + n.padEnd(20) + f2(s.dur).padStart(6) + '  ' + s.peak.toFixed(3) + '  ' + f2(s.peakDb).padStart(6) + '  ' +
        f2(s.stRmsDb).padStart(7) + '  ' + f2(s.rmsDb).padStart(6) + ' | ' + String(s.lvl).padStart(6) + '  ' + f2(s.wDb).padStart(7));
      if (s.lvl != null && s.wDb < s.lvl - 3) limited.push(`${n} (${f2(s.wDb)} vs ${s.lvl})`);
    }
    check(limited.length === 0, 'every SFX reaches its perceptual loudness target within 3 dB ' + (limited.length ? '- peak-limited: ' + limited.join(', ') : ''));
    const allOk = rows.every(([, s]) => s.peak > 0.02 && s.peak <= 1.0 && s.rms > 1e-4);
    check(allOk, `all ${rows.length} SFX non-silent and peak <= 1.0`);
    // variants of frequent sounds differ and are all valid
    const vr = await page.evaluate(async () => {
      const out = {};
      for (const n of ['hit', 'shoot_neutrophil', 'pickup_iron', 'kill_small']) {
        const a = await AUDIO._renderSfx(n, 0, 44100), b = await AUDIO._renderSfx(n, 1, 44100);
        const x = a.getChannelData(0), y = b.getChannelData(0);
        let diff = 0; for (let i = 0; i < Math.min(x.length, y.length); i++) diff += Math.abs(x[i] - y[i]);
        out[n] = { diff, pa: TEST.stats(a).peak, pb: TEST.stats(b).peak };
      }
      return out;
    });
    check(Object.values(vr).every((v) => v.diff > 0.5 && v.pb <= 1 && v.pb > 0.02), 'variants of frequent SFX are distinct and valid');
  }

  // -------------------------------------------------------------------------
  console.log(`\n[4] Music offline renders (${MUSIC_SECS}s each, intensity 0 vs 1; raw mix and through master chain)`);
  {
    const jobs = [], adaptiveRows = [], failBefore = failures;
    for (const t of SPEC_TRACKS) {
      if (t === 'boss') REGIONS.forEach((r) => jobs.push({ id: 'boss', region: r, label: 'boss:' + r }));
      else jobs.push({ id: t, label: t });
    }
    console.log('  ' + 'track'.padEnd(14) + 'I  rawPeak rawRMSdB onsets nodes/s | mastered peak RMSdB');
    for (const j of jobs) {
      const res = {};
      for (const I of [0, 1]) {
        const raw = await page.evaluate((a) => TEST.musicStats(a.id, a.secs, a.I, { region: a.region, raw: true }), { ...j, secs: MUSIC_SECS, I });
        const mas = await page.evaluate((a) => TEST.musicStats(a.id, a.secs, a.I, { region: a.region }), { ...j, secs: MUSIC_SECS, I });
        res[I] = { raw, mas };
        console.log('  ' + j.label.padEnd(14) + I + '  ' + raw.peak.toFixed(3).padStart(7) + ' ' + f2(raw.rmsDb).padStart(8) + ' ' +
          String(raw.onsets).padStart(6) + ' ' + raw.nodesPerSec.toFixed(0).padStart(7) + ' | ' + mas.peak.toFixed(3).padStart(13) + ' ' + f2(mas.rmsDb).padStart(6));
        if (!(raw.rms > 1e-3)) fail(`${j.label} I=${I}: silent (rms ${raw.rms})`);
        if (!(raw.peak <= 1.0)) fail(`${j.label} I=${I}: raw mix clips (peak ${f2(raw.peak)})`);
        if (!(mas.peak <= 1.0)) fail(`${j.label} I=${I}: master output clips (peak ${f2(mas.peak)})`);
        if (raw.nodesPerSec > 400) fail(`${j.label} I=${I}: too many nodes/s (${raw.nodesPerSec.toFixed(0)})`);
      }
      if (ADAPTIVE.includes(j.id)) {
        // louder: >= 2 dB RMS; denser: more scheduled audio nodes per second (= more note events)
        const louder = res[1].raw.rms > res[0].raw.rms * 1.26;
        const denser = res[1].raw.nodesPerSec > res[0].raw.nodesPerSec * 1.15;
        if (!(louder && denser)) fail(`${j.label}: intensity 1 not louder/denser than 0 (rms ${f2(res[0].raw.rmsDb)} -> ${f2(res[1].raw.rmsDb)} dB, nodes/s ${res[0].raw.nodesPerSec.toFixed(0)} -> ${res[1].raw.nodesPerSec.toFixed(0)})`);
        else adaptiveRows.push(`${j.label}: +${f2(res[1].raw.rmsDb - res[0].raw.rmsDb)} dB, nodes/s ${res[0].raw.nodesPerSec.toFixed(0)} -> ${res[1].raw.nodesPerSec.toFixed(0)}`);
      }
    }
    console.log('  intensity 0 -> 1: ' + adaptiveRows.join(' | '));
    if (failures === failBefore) ok('all tracks non-silent, no clipping, adaptive tracks louder+denser at intensity 1');
  }

  // -------------------------------------------------------------------------
  console.log('\n[5] Live AudioContext: init, playback, clock alignment, voice limiting, suspend/resume');
  {
    const r = await page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const out = {};
      const tInit = performance.now();
      out.init = AUDIO.init();
      out.init2 = AUDIO.init();
      for (let i = 0; i < 40 && AUDIO._debug().ctx !== 'running'; i++) await wait(50);
      out.state = AUDIO._debug().ctx;
      // synth fallback: SFX triggered before its pre-rendered buffer exists
      const notCached = AUDIO._sfxNames.filter((n) => !AUDIO._debug().cachedNames.includes(n));
      out.fallbackTried = notCached.length;
      out.fallbackOk = notCached.slice(-5).every((n) => AUDIO.sfx(n, { force: true }) !== null);
      out.pendingStarted = AUDIO._debug().tracks;   // 'title' queued by smoke() before init
      AUDIO.music.play('heart');
      AUDIO.music.setIntensity(1);
      await wait(100);
      const c0 = AUDIO.music.clock(), p0 = performance.now();
      await wait(1500);
      const c1 = AUDIO.music.clock(), p1 = performance.now();
      out.rate = (c1.beat - c0.beat) / ((p1 - p0) / 1000) * 60; // measured bpm
      out.bpm = c1.bpm;
      // alignment: audible-time-based beat vs scheduler grid
      const ctx = AUDIO._ctx();
      out.clockAudio = AUDIO._debug().clockAudio;
      // spam SFX: voice caps
      for (let i = 0; i < 200; i++) { AUDIO.sfx('hit', { force: true }); AUDIO.sfx('shoot_neutrophil', { force: true }); AUDIO.sfx('pickup_iron', { force: true }); }
      out.voicesAfterSpam = AUDIO._debug().voices;
      for (const n of AUDIO._sfxNames) AUDIO.sfx(n, { force: true });
      out.voicesAll = AUDIO._debug().voices;
      // setIntensity is called every frame: must be cheap
      const tq = performance.now();
      for (let i = 0; i < 100000; i++) AUDIO.music.setIntensity((i % 100) / 100);
      out.setIntUs = (performance.now() - tq) * 1000 / 100000;
      const tc = performance.now();
      for (let i = 0; i < 10000; i++) AUDIO.music.clock();
      out.clockUs = (performance.now() - tc) * 1000 / 10000;
      AUDIO.music.setIntensity(1);
      let throttled = 0;
      for (let i = 0; i < 50; i++) if (AUDIO.sfx('kill_small') === null) throttled++;
      out.throttled = throttled;
      const h = AUDIO.sfx('charge_tcell', { force: true });
      out.handle = !!(h && typeof h.stop === 'function');
      if (h) h.stop(0.05);
      // suspend: clock must keep advancing; resume: continuous + monotonic
      const s0 = AUDIO.music.clock().beat;
      await ctx.suspend();
      await wait(600);
      const s1 = AUDIO.music.clock().beat;
      await ctx.resume();
      await wait(300);
      const s2 = AUDIO.music.clock().beat;
      out.suspendAdv = s1 - s0; out.resumeAdv = s2 - s1;
      out.clockAudioAfter = AUDIO._debug().clockAudio;
      // monotonic check over a crossfade + sfx while running
      let mono = true, last = -1;
      AUDIO.music.play('cortex');
      for (let i = 0; i < 40; i++) { const b = AUDIO.music.clock().beat; if (b < last) mono = false; last = b; await wait(20); }
      out.mono = mono;
      out.curAfter = AUDIO.music.current;
      AUDIO.music.play('boss', { region: 'gut' });
      out.bossCur = AUDIO.music.current + ':' + AUDIO.music.region;
      AUDIO.setLowpass(true); AUDIO.duck(0.8, 0.5); AUDIO.setVolume('music', 0.5); AUDIO.setMuted(true); AUDIO.setMuted(false);
      await wait(2500);
      out.tracksAfterFade = AUDIO._debug().tracks;
      for (let i = 0; i < 60 && AUDIO._debug().queue > 0; i++) await wait(100);
      out.cache = AUDIO._debug();
      out.cacheMs = performance.now() - tInit;
      out.errs = TEST.smoke();
      return out;
    });
    check(r.init === true && r.init2 === true && r.state === 'running', `init() idempotent, context running (${r.state})`);
    check(r.fallbackTried > 0 && r.fallbackOk, `live-synth fallback plays SFX before the cache is ready (${r.fallbackTried} not yet cached at init)`);
    check(r.pendingStarted >= 1, 'track requested before init started after init');
    check(Math.abs(r.rate - 76) < 4 && r.bpm === 76, `clock rate matches heart tempo: measured ${f2(r.rate)} bpm`);
    check(r.clockAudio === true, 'clock is driven by audible AudioContext time while running');
    check(r.voicesAfterSpam <= 32, `voice limiting: ${r.voicesAfterSpam} live voices after 600 rapid calls (cap 32)`);
    check(r.voicesAll <= 32, `global voice cap: ${r.voicesAll} live voices after triggering all ${SPEC_SFX.length} SFX at once (cap 32)`);
    check(r.setIntUs < 2, `setIntensity cost ${f2(r.setIntUs)} us/call; clock() cost ${f2(r.clockUs)} us/call`);
    check(r.throttled >= 45, `per-name throttle: ${r.throttled}/50 same-frame repeats ignored`);
    check(r.handle, 'sfx() returns a stoppable handle');
    const expS = 0.6 * 76 / 60;
    check(r.suspendAdv > expS * 0.7 && r.suspendAdv < expS * 1.6, `clock advances while suspended: +${f2(r.suspendAdv)} beats in 0.6s (expect ~${f2(expS)})`);
    check(r.resumeAdv > 0 && r.resumeAdv < 1.2 && r.clockAudioAfter, `clock continuous after resume (+${f2(r.resumeAdv)} in 0.3s), audio-driven again`);
    check(r.mono, 'clock monotonic across a crossfade');
    check(r.curAfter === 'cortex' && r.bossCur === 'boss:gut', `music.current tracks play() (${r.curAfter}, ${r.bossCur})`);
    check(r.tracksAfterFade === 1, `old tracks disposed after crossfade (${r.tracksAfterFade} active)`);
    check(r.cache.cached === r.cache.total, `SFX cache pre-rendered in background: ${r.cache.cached}/${r.cache.total} (all done within ${(r.cacheMs / 1000).toFixed(1)}s of init, incl. test waits)`);
    check(r.cache.avgTickMs < 2, `scheduler main-thread cost: ${r.cache.avgTickMs.toFixed(3)} ms avg per 25ms tick over ${r.cache.ticks} ticks`);
    check(r.errs.length === 0, 'smoke test while running: no exceptions ' + (r.errs.length ? JSON.stringify(r.errs) : ''));
  }

  // beat alignment: compare clock() against scheduled step times over time
  {
    const r = await page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      AUDIO.music.play('veins');
      await wait(300);
      const ctx = AUDIO._ctx();
      const samples = [];
      for (let i = 0; i < 20; i++) {
        const c = AUDIO.music.clock();
        const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
        samples.push({ beat: c.beat, ct: ctx.currentTime, out: ts ? ts.contextTime : null });
        await wait(37);
      }
      // slope of beat vs currentTime should equal bpm/60
      const a = samples[0], b = samples[samples.length - 1];
      const d = AUDIO._debug();
      // after a suspend/resume re-anchor the clock and the scheduler must share one origin
      await ctx.suspend(); await wait(250); await ctx.resume(); await wait(150);
      const d2 = AUDIO._debug();
      return { slope: (b.beat - a.beat) / (b.ct - a.ct) * 60, lagBeats: (a.ct - (samples[0].out || a.ct)) * 96 / 60,
        t0diff: Math.abs(d.clockT0 - d.trackT0), t0diff2: Math.abs(d2.clockT0 - d2.trackT0) };
    });
    check(r.t0diff < 1e-9 && r.t0diff2 < 1e-9, 'beat clock and step scheduler share the same time origin (beat n == step time t0 + n*60/bpm), also after re-anchoring');
    check(Math.abs(r.slope - 96) < 3, `clock locked to AudioContext time: ${f2(r.slope)} bpm vs 96 (output-latency lag ${f2(r.lagBeats)} beats compensated)`);
  }

  // the beat clock's latency compensation must match what the graph really does:
  // render heartbeats through the full chain and find each attack vs the grid
  {
    const r = await page.evaluate(async () => {
      const out = {};
      for (const [id, region, solo, bpm] of [['heart', null, 'beat', 76], ['boss', 'heart', 'drums', 92]]) {
        const b = await AUDIO._renderMusic(id, 8, 1, { solo, region });
        const x = b.getChannelData(0), sr = b.sampleRate, bd = 60 / bpm, errs = [];
        for (let n = 0; 0.05 + n * bd + 0.08 < 8; n++) {
          const t = 0.05 + n * bd, a = Math.floor((t - 0.01) * sr), z = Math.floor((t + 0.05) * sr);
          let base = 0; for (let i = a - Math.floor(0.02 * sr); i < a; i++) base = Math.max(base, Math.abs(x[i]));
          for (let i = a; i < z; i++) if (Math.abs(x[i]) > base + 0.02) { errs.push((i / sr - t) * 1000); break; }
        }
        out[id + (region ? ':' + region : '')] = errs;
      }
      out.lat = AUDIO._graphLatency * 1000;
      return out;
    });
    for (const k of ['heart', 'boss:heart']) {
      const e = r[k], mn = Math.min(...e), mx = Math.max(...e);
      check(e.length >= 9 && mn > r.lat - 0.5 && mx < r.lat + 1.5,
        `${k}: ${e.length} heartbeat attacks land ${f2(mn)}..${f2(mx)} ms after the grid = graph latency ${f2(r.lat)} ms the clock compensates`);
    }
  }

  const warnings = consoleMsgs.filter((m) => /^(warning|error)/.test(m) && !/unknown (sfx|music track)/.test(m) && !/Web Audio unavailable/.test(m));
  check(warnings.length === 0, 'no unexpected console warnings/errors ' + (warnings.length ? JSON.stringify(warnings.slice(0, 5)) : ''));
  const unknownWarns = consoleMsgs.filter((m) => /unknown sfx "nope_not_real"/.test(m));
  check(unknownWarns.length >= 1 && unknownWarns.length <= 2, `unknown sfx warns once per page (${unknownWarns.length})`);

  // -------------------------------------------------------------------------
  if (wavDir) {
    console.log('\n[6] Writing WAVs to ' + wavDir);
    fs.mkdirSync(wavDir, { recursive: true });
    const list = [['sfx', 'hurt'], ['sfx', 'explosion'], ['sfx', 'roar'], ['sfx', 'hit'], ['sfx', 'pickup_mutation'], ['sfx', 'unlock'],
      ['music', 'heart', 1], ['music', 'veins', 1], ['music', 'title', 1], ['music', 'final', 1], ['music', 'lungs', 0], ['music', 'gut', 1], ['music', 'cortex', 1], ['music', 'wound', 1]];
    for (const [kind, id, I] of list) {
      const d = await page.evaluate((a) => TEST.renderData(a.kind, a.id, 8, a.I), { kind, id, I });
      const file = path.join(wavDir, `${kind}_${id}${I != null ? '_I' + I : ''}.wav`);
      writeWav(file, d.sr, d.nch, d.data);
      console.log('  wrote ' + file);
    }
  }

  await browser.close();
  console.log('\n' + (failures ? `FAILED: ${failures} check(s)` : 'ALL CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
