// World sounds: water & basement, weather, the body (heartbeat, breath), old media (applause,
// record), stingers, structural (collapse, dust, footsteps overhead) — plus the small `amb_*`
// event sounds that ambience beds scatter around the listener.
import { ring, burst, grains, tone, voiced, stickSlip, envPts, envHump, xlerp, smooth, BQ, filt, mixInto, saturate, TAU } from './dsp.js';
import { RATIOS, thump, knock, metal, clink, creak, scrape, whoosh, drop, rumble, grit, paper, breath, oldRecording, surfaceNoise } from './synth.js';

const expo = (R, rate) => -Math.log(1 - R.r() * 0.999) / rate;

export const WORLD_SFX = {
  // ------------------------------------------------------------------ water & basement
  drip: { peak: -12, var: 8, wet: 1.4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.16);
    drop(o, sr, 0.002, { f: R.range(850, 1600), rise: R.range(1.5, 2.3), len: R.range(0.035, 0.07), amp: 1, R });
    if (R.chance(0.3)) drop(o, sr, R.range(0.03, 0.06), { f: R.range(1500, 2500), rise: 1.6, len: 0.025, amp: 0.25, R });
    return o;
  } },
  splash: { peak: -8, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.65);
    burst(o, sr, 0, { dur: 0.12, t60: 0.1, gain: 0.8, R, filters: [['bp', 1500, 0.7]] });
    burst(o, sr, 0.01, { dur: 0.3, t60: 0.25, gain: 0.3, R, filters: [['bp', 800, 0.8]] });
    for (let k = 0; k < R.int(5, 8); k++) drop(o, sr, R.range(0.02, 0.4), { f: R.range(700, 2000), amp: R.range(0.2, 0.6), rise: R.range(1.4, 2), len: 0.04, R });
    return o;
  } },
  pipe_knock: { peak: -8, var: 4, wet: 1.3, gen(S) {
    // water hammer: a dull knock and the ring of the pipe run, repeated once or twice
    const { sr, R } = S, o = S.alloc(1.3);
    let t = 0.005, a = 1;
    for (let k = 0; k < R.int(2, 3); k++) {
      thump(o, sr, t, { f: 90, to: 70, t60: 0.12, amp: 0.8 * a, noise: 0.4, R });
      metal(o, sr, t, { f: R.range(210, 250), amp: 0.7 * a, t60: 0.5, ratios: RATIOS.bar, click: 0.4, tilt: 0.7, R });
      t += R.range(0.18, 0.4); a *= R.range(0.5, 0.75);
    }
    return o;
  } },
  steam_hiss: { peak: -10, var: 3, gen(S) {
    const { sr, R } = S, d = R.range(1.8, 2.4), o = S.alloc(d + 0.1);
    const fl = R.range(9, 13);
    knock(o, sr, 0, { f: 600, amp: 0.3, t60: 0.03, R });
    burst(o, sr, 0.01, { dur: d, R, gain: 1, env: (t) => envPts([[0, 0], [0.05, 1], [0.25, 0.8], [d - 0.5, 0.7], [d, 0]])(t) * (1 + 0.12 * Math.sin(TAU * fl * t)),
      filters: [['hp', 1800, 0.7], ['peak', 4500, 1, 6], ['lp', 11000, 0.7]] });
    return o;
  } },
  coal_slide: { peak: -7, var: 3, gen(S) {
    // anthracite: hard, glassy little stones sliding, a heavier chunk or two, a low settle
    const { sr, R } = S, d = R.range(1.6, 2.2), o = S.alloc(d + 0.3);
    const env = (u) => envPts([[0, 0.1], [0.15, 0.5], [0.4, 1], [0.7, 0.4], [1, 0]])(u);
    grains(o, sr, 0, { dur: d, R, rate: (u) => 20 + 320 * env(u), amp: env, f: [1400, 5500], t60: [0.008, 0.03], modes: 2, click: 0.4 });
    for (let k = 0; k < 12; k++) { const u = R.r(); metal(o, sr, u * d, { f: R.range(500, 1400), amp: 0.5 * env(u), t60: R.range(0.05, 0.12), ratios: RATIOS.medal, R }); }
    rumble(o, sr, 0, { dur: d, lp: 250, amp: 0.5, env, R });
    return o;
  } },
  boiler_door: { peak: -6, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(2.3);
    metal(o, sr, 0, { f: 380, amp: 0.9, t60: 0.4, R });
    clink(o, sr, 0.01, { f: 1500, amp: 0.4, t60: 0.05, R });
    creak(o, sr, 0.2, { dur: 1.0, R, gain: 0.5, res: [[200, 6, 1], [520, 9, 0.6], [1200, 12, 0.25]], rate: (u) => 20 + 20 * Math.sin(Math.PI * u), amp: envHump(0.4, 1) });
    rumble(o, sr, 0.3, { dur: 1.8, lp: 420, amp: 0.7, env: (u) => envHump(0.4, 1)(u), R, color: 'pink' });
    grains(o, sr, 0.3, { dur: 1.6, R, rate: 30, amp: envHump(0.4, 1), f: [800, 3000], t60: [0.003, 0.01], gain: 0.3 });
    thump(o, sr, 1.25, { f: 100, to: 80, t60: 0.2, amp: 0.4, R });
    return o;
  } },

  // ------------------------------------------------------------------ weather
  lightning: { peak: -3, var: 3, max: 2, wet: 0.6, gen(S) {
    // a close strike: the tearing crack, then the boom
    const { sr, R } = S, d = 3.3, o = S.stereo(d);
    for (const c of o) {
      const cr = R.fork();
      burst(c, sr, 0, { dur: 0.025, t60: 0.02, gain: 2, R: cr, filters: [['hp', 600, 0.7]] });
      grains(c, sr, 0.005, { dur: 0.45, R: cr, rate: (u) => 600 * Math.exp(-u * 4), amp: (u) => Math.exp(-u * 3), f: [500, 5000], t60: [0.002, 0.012], click: 0.6 });
      burst(c, sr, 0, { dur: 0.6, t60: 0.4, gain: 0.6, R: cr, filters: [['bp', 1800, 0.5]] });
      thump(c, sr, 0.03, { f: 55, to: 30, tau: 0.1, t60: 1.4, amp: 1.6, noise: 1, lp: 400, R: cr });
      rumble(c, sr, 0.05, { dur: 3.1, lp: 140, amp: 1, env: (u) => Math.min(1, u * 20) * Math.exp(-u * 2.5), R: cr });
      burst(c, sr, 0.04, { dur: 2.6, R: cr, color: 'pink', gain: 0.35, env: (tt) => Math.min(1, tt * 30) * Math.exp(-tt * 1.6), filters: [['bp', 500, 0.7]] });
    }
    return o;
  } },
  thunder: { peak: -4, var: 3, max: 2, wet: 0.5, gen(S) {
    // distant, rolling: a muffled crack and a train of rumbling swells, decorrelated L/R
    const { sr, R } = S, d = 7.5, o = S.stereo(d);
    const rolls = [];
    let t = R.range(0.05, 0.2);
    for (let k = 0; k < R.int(5, 8); k++) { rolls.push([t, R.range(0.8, 2.2), R.range(0.5, 1) * Math.pow(0.82, k), R.range(130, 260)]); t += R.range(0.25, 1.0); }
    for (const c of o) {
      const cr = R.fork();
      burst(c, sr, 0, { dur: 0.25, t60: 0.2, gain: 0.35, R: cr, filters: [['lp', 2200, 0.7]] });
      for (const [t0, dd, a, lp] of rolls) {
        const tt = Math.max(0, t0 + cr.range(-0.05, 0.05));
        rumble(c, sr, tt, { dur: dd, lp, amp: a * cr.range(0.8, 1.2), env: envHump(0.25, 1), R: cr });
        burst(c, sr, tt, { dur: dd, R: cr, color: 'pink', gain: a * 0.22, env: envHump(dd * 0.2, dd), filters: [['bp', cr.range(300, 600), 0.8]] });
      }
      rumble(c, sr, 0.05, { dur: d - 0.1, lp: 110, amp: 0.7, env: (u) => Math.min(1, u * 30) * Math.exp(-u * 3.2), R: cr });
    }
    return o;
  } },
  wind_gust: { peak: -8, var: 3, max: 2, wet: 0.4, gen(S) {
    const { sr, R } = S, d = R.range(3, 3.8), o = S.stereo(d), dir = R.chance(0.5) ? 1 : -1;
    o.forEach((c, k) => {
      const cr = R.fork(), side = k === 0 ? -dir : dir;
      const env = (t) => envHump(d * 0.45, d)(t) * (1 + 0.6 * side * (t / d - 0.5));
      burst(c, sr, 0, { dur: d, R: cr, color: 'pink', gain: 1, env, filters: [['bp', (u) => 260 + 520 * Math.pow(Math.sin(Math.PI * u), 1.5), 0.7]] });
      burst(c, sr, 0, { dur: d, R: cr, gain: 0.3, env, filters: [['bp', (u) => 900 + 400 * Math.sin(Math.PI * u * 1.3), 18]] });
    });
    return o;
  } },

  // ------------------------------------------------------------------ body
  heartbeat: { peak: -7, var: 4, jit: 0.02, gen(S) {
    const { sr, R } = S, o = S.alloc(0.75);
    thump(o, sr, 0.01, { f: 58, to: 38, tau: 0.04, t60: 0.18, amp: 1, noise: 0.35, lp: 300, R });
    ring(o, sr, 0.01, 116, 0.18, 0.07);
    thump(o, sr, 0.2 * R.jit(1, 0.05), { f: 66, to: 44, tau: 0.03, t60: 0.14, amp: 0.7, noise: 0.3, lp: 300, R });
    return saturate(o, 1.6);
  } },
  breath_hold: { peak: -14, var: 3, gen(S) {
    // Tess: a sharp intake through the mouth, cut off at the glottis
    const { sr, R } = S, d = R.range(0.36, 0.46), o = S.alloc(d + 0.12);
    breath(o, sr, 0, { dur: d, R, lp: 6000, amp: (u) => Math.pow(u, 0.6) * (1 - smooth((u - 0.88) / 0.12)),
      formants: (u) => [[700 + 700 * u, 3, 1], [1700 + 600 * u, 5, 0.5], [2800, 4, 0.3]] });
    knock(o, sr, d, { f: 900, amp: 0.08, t60: 0.01, click: 0.2, R });
    return o;
  } },
  breath_release: { peak: -14, var: 3, gen(S) {
    // a shaky exhale after holding it too long
    const { sr, R } = S, d = R.range(1.3, 1.7), o = S.alloc(d + 0.1), tr = R.range(5.5, 7.5);
    breath(o, sr, 0, { dur: d, R, lp: 3800,
      amp: (u) => envPts([[0, 0], [0.06, 1], [0.4, 0.7], [1, 0]])(u) * (0.72 + 0.28 * Math.sin(TAU * tr * u * d + 2 * Math.sin(TAU * 1.3 * u))),
      formants: (u) => [[600 - 150 * u, 3, 1], [1300 - 200 * u, 5, 0.6], [2600, 6, 0.25]] });
    return o;
  } },

  // ------------------------------------------------------------------ old media & crowds
  applause_old: { peak: -8, var: 2, gen(S) {
    // 1979 assembly applause as if from an old recording: mono, narrow-band, crackly
    const { sr, R } = S, d = 4.2, o = S.alloc(d + 0.2);
    const rate = (u) => 110 * Math.min(1, u / 0.08) * (u < 0.55 ? 1 : Math.exp(-(u - 0.55) * 5));
    let t = 0;
    for (;;) {
      t += expo(R, 115);
      if (t >= d) break;
      if (R.r() * 115 > rate(t / d)) continue;
      burst(o, sr, t, { dur: 0.02, attack: 0.0008, t60: R.range(0.008, 0.02), gain: R.range(0.3, 1), R, filters: [['bp', R.range(700, 2200), R.range(1.2, 2.5)]] });
    }
    surfaceNoise(o, sr, 0, d, { amp: 0.12, pops: 2, crackle: 150, hiss: 0.2, R });
    return oldRecording(o, sr);
  } },
  record_crackle: { peak: -12, var: 2, gen(S) {
    const { sr, R } = S, d = 3.6, o = S.alloc(d);
    surfaceNoise(o, sr, 0, d, { amp: 1, pops: 4, crackle: 300, hiss: 0.12, R });
    return filt(o, new BQ(sr, 'hp', 150, 0.7), new BQ(sr, 'lp', 7000, 0.7));
  } },

  // ------------------------------------------------------------------ stingers (budgeted: DESIGN §14)
  stinger_soft: { peak: -9, var: 2, max: 1, wet: 1.3, gen(S) {
    const { sr, R } = S, d = 3.6, rise = R.range(2.2, 2.6), o = S.stereo(d);
    const env = envPts([[0, 0], [rise * 0.7, 0.35], [rise, 1], [rise + 0.25, 0.6], [d, 0]]);
    const cl = [1760, 1864.66, 2093].map((f) => f * R.jit(1, 0.01));
    o.forEach((c, k) => {
      const cr = R.fork();
      tone(c, sr, 0, d, { f: 55 * (k ? 1.003 : 1), a: (t) => env(t) * 0.5 });
      tone(c, sr, 0, d, { f: 58.27, a: (t) => env(t) * 0.35 });
      cl.forEach((f, i) => tone(c, sr, 0, d, { f: (t) => f * (1 + 0.002 * Math.sin(TAU * 0.3 * t + k + i)), a: (t) => Math.pow(env(t), 1.5) * 0.08 }));
      burst(c, sr, 0, { dur: rise + 0.4, R: cr, gain: 0.4, env: (t) => Math.pow(Math.min(1, t / rise), 3) * (t > rise ? Math.exp(-(t - rise) * 12) : 1), filters: [['bp', (u) => xlerp(300, 4000, Math.min(1, u * 1.15)), 1]] });
    });
    return o;
  } },
  stinger_hard: { peak: -2, var: 2, max: 1, wet: 1.3, gen(S) {
    const { sr, R } = S, d = 4.6, o = S.stereo(d);
    o.forEach((c, k) => {
      const cr = R.fork(), cl = new Float32Array(c.length);
      thump(c, sr, 0, { f: 75, to: 28, tau: 0.12, t60: 2.2, amp: 2, noise: 1.2, lp: 2500, R: cr });
      burst(c, sr, 0, { dur: 0.05, t60: 0.04, gain: 1.5, R: cr, filters: [['hp', 300]] });
      [440, 466.16, 493.88, 554.37, 587.33].forEach((f, i) => tone(cl, sr, 0, d, {
        f: (t) => f * 2 * (1 + 0.006 * Math.sin(TAU * (6.5 + i * 0.7) * t + k)), a: (t) => Math.exp(-t / 1.1) * Math.min(1, t / 0.01), wave: 'saw', harm: 12 }));
      filt(cl, new BQ(sr, 'bp', 1800, 0.8), new BQ(sr, 'hp', 400, 0.7));
      mixInto(c, cl, sr, 0, 0.5);
      metal(c, sr, 0, { f: 310 * cr.jit(1, 0.02), amp: 0.6, t60: 2.5, ratios: RATIOS.gong, tilt: 0.85, decayTilt: 0.85, R: cr });
      ring(c, sr, 0, 34, 1, 2.5);
    });
    return saturate(o, 1.2);
  } },

  // ------------------------------------------------------------------ structure
  collapse_rumble: { peak: -3, var: 2, max: 1, gen(S) {
    const { sr, R } = S, d = 5.6, o = S.stereo(d);
    for (const c of o) {
      const cr = R.fork();
      rumble(c, sr, 0, { dur: d - 0.2, lp: 120, amp: 1.2, env: (u) => Math.min(1, u * 8) * Math.exp(-u * 1.6), R: cr });
      for (let k = 0; k < cr.int(4, 6); k++) { const t = cr.range(0, 1.5); burst(c, sr, t, { dur: 0.03, t60: 0.02, gain: 0.8, R: cr, filters: [['hp', 800]] }); knock(c, sr, t, { f: cr.range(300, 600), amp: 0.6, t60: 0.1, R: cr }); }
      let t = 0.1;
      while (t < 4.2) {
        t += expo(cr, 20 * Math.exp(-t * 0.7) + 2);
        if (cr.chance(0.5)) { const f = cr.range(80, 200); thump(c, sr, t, { f, to: f * 0.7, t60: cr.range(0.1, 0.3), amp: cr.range(0.2, 0.8) * Math.exp(-t * 0.4), R: cr }); }
        else knock(c, sr, t, { f: cr.range(300, 900), amp: cr.range(0.2, 0.6) * Math.exp(-t * 0.4), t60: 0.08, R: cr });
      }
      grit(c, sr, 3.0, { dur: 2.2, rate: 300, amp: 0.25, R: cr, env: (u) => 1 - u });
    }
    return o;
  } },
  dust_fall: { peak: -20, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(2.3);
    grit(o, sr, 0, { dur: 2.1, rate: 500, amp: 1, f: [3000, 9000], R, env: envHump(0.3, 1) });
    for (let k = 0; k < R.int(3, 6); k++) knock(o, sr, R.range(0.1, 1.8), { f: R.range(1500, 3000), amp: 0.4, t60: 0.02, R });
    return o;
  } },
  footstep_heavy_above: { peak: -9, var: 3, max: 1, wet: 0.8, gen(S) {
    // something enormous crossing the floor above: thumps through the ceiling, a drag, grit
    const { sr, R } = S, o = S.alloc(4.8), raw = S.alloc(4.8);
    let t = 0.1;
    for (let k = 0; k < R.int(3, 5) && t < 4; k++) {
      thump(raw, sr, t, { f: R.range(45, 60), to: 32, t60: 0.5, amp: R.range(0.8, 1), noise: 1, lp: 400, R });
      scrape(raw, sr, t + 0.05, { dur: 0.4, f: 300, q: 0.8, grain: 10, amp: envHump(0.3, 1), gain: 0.35, color: 'pink', R });
      if (R.chance(0.5)) creak(raw, sr, t + 0.1, { dur: 0.6, body: 'timber', R, gain: 0.5, rate: (u) => 15 + 10 * Math.sin(Math.PI * u) });
      t += R.range(0.7, 1.1);
    }
    filt(raw, new BQ(sr, 'lp', 260, 0.7), new BQ(sr, 'lp', 300, 0.6));
    mixInto(o, raw, sr, 0, 1);
    grit(o, sr, 0.3, { dur: 3.8, rate: 60, amp: 0.25, f: [3000, 8000], R });
    return o;
  } },

  // ================================================================== ambience events (amb_*)
  amb_creak: { peak: -10, var: 6, gen(S) {
    const { sr, R } = S, d = R.range(0.5, 1.2), o = S.alloc(d + 0.1), base = R.range(8, 30);
    creak(o, sr, 0, { dur: d, body: R.pick(['floor', 'timber', 'door']), R, gain: 1, jitter: 0.3, rate: (u) => base + base * 0.8 * Math.sin(Math.PI * u), amp: envHump(R.range(0.3, 0.6), 1) });
    return o;
  } },
  amb_tick: { peak: -14, var: 6, gen(S) {
    const { sr, R } = S, o = S.alloc(0.3);
    knock(o, sr, 0, { f: R.range(800, 2500), amp: 1, t60: 0.03, R });
    if (R.chance(0.5)) metal(o, sr, 0, { f: R.range(1800, 3000), amp: 0.3, t60: 0.15, ratios: RATIOS.bar, R });
    return o;
  } },
  amb_rattle: { peak: -14, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.5);
    thump(o, sr, 0, { f: 140, to: 120, t60: 0.08, amp: 0.4, R });
    let t = 0.005;
    for (let k = 0; k < R.int(3, 6); k++) { clink(o, sr, t, { f: R.range(2500, 4000), amp: R.range(0.3, 0.8), t60: 0.04, R }); t += R.range(0.03, 0.08); }
    return o;
  } },
  amb_thunder_far: { peak: -10, var: 3, wet: 0.4, gen(S) {
    const { sr, R } = S, d = 6, o = S.stereo(d);
    for (const c of o) {
      const cr = R.fork();
      let t = 0.05;
      for (let k = 0; k < cr.int(3, 5); k++) {
        const dd = cr.range(1, 2.4), a = cr.range(0.5, 1) * Math.pow(0.8, k);
        rumble(c, sr, t, { dur: dd, lp: cr.range(100, 170), amp: a, env: envHump(0.3, 1), R: cr });
        burst(c, sr, t, { dur: dd, R: cr, color: 'pink', gain: a * 0.12, env: envHump(dd * 0.3, dd), filters: [['bp', cr.range(250, 450), 0.8]] });
        t += cr.range(0.4, 1.1);
      }
    }
    return o;
  } },
  amb_page: { peak: -16, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.5);
    paper(o, sr, 0, { dur: 0.4, amp: 0.7, density: 200, R });
    whoosh(o, sr, 0, { dur: 0.35, f0: 800, fm: 2500, f1: 1200, amp: 0.25, R });
    return o;
  } },
  amb_clock: { peak: -20, var: 2, jit: 0.01, vjit: 0.5, gen(S) {
    const { sr, R } = S, o = S.alloc(0.06);
    clink(o, sr, 0, { f: R.range(2800, 3300), amp: 0.5, t60: 0.012, R });
    knock(o, sr, 0, { f: 1200, amp: 0.4, t60: 0.012, R });
    return o;
  } },
  amb_faucet: { peak: -12, var: 6, gen(S) {
    const { sr, R } = S, o = S.alloc(0.3);
    drop(o, sr, 0.002, { f: R.range(1400, 2200), rise: 1.4, len: 0.03, amp: 1, R });
    metal(o, sr, 0.002, { f: 900, amp: 0.1, t60: 0.2, ratios: RATIOS.bar, R });
    return o;
  } },
  amb_rope: { peak: -12, var: 4, gen(S) {
    const { sr, R } = S, d = R.range(0.8, 1.4), o = S.alloc(d + 0.1);
    creak(o, sr, 0, { dur: d, body: 'rope', R, gain: 1, rate: (u) => 20 + 25 * Math.sin(Math.PI * u), amp: envHump(0.5, 1) });
    return o;
  } },
  amb_seat: { peak: -12, var: 4, gen(S) {
    const { sr, R } = S, d = R.range(0.3, 0.6), o = S.alloc(d + 0.25);
    creak(o, sr, 0, { dur: d, body: 'chair', R, gain: 1, rate: (u) => 30 + 40 * Math.sin(Math.PI * u), amp: envHump(0.4, 1) });
    metal(o, sr, d * 0.5, { f: R.range(450, 550), amp: 0.2, t60: 0.15, ratios: RATIOS.bar, R });
    return o;
  } },
  amb_whisper: { peak: -16, var: 6, gen(S) {
    // a husk's dry whisper of "present" — two breathy syllables, unvoiced
    const { sr, R } = S, o = S.alloc(0.8), s = R.range(0.85, 1.15);
    burst(o, sr, 0, { dur: 0.03, t60: 0.02, gain: 0.4, R, filters: [['bp', 1500, 1]] });
    breath(o, sr, 0.02, { dur: 0.22, R, lp: 7000, amp: envHump(0.4, 1), formants: () => [[550 * s, 4, 1], [1800 * s, 6, 0.7], [2600 * s, 6, 0.4]] });
    burst(o, sr, 0.25, { dur: 0.14, R, gain: 0.5, env: envHump(0.07, 0.14), filters: [['bp', 6500, 2]] });
    breath(o, sr, 0.36, { dur: 0.22, R, lp: 7000, amp: envHump(0.3, 1), formants: () => [[520 * s, 4, 1], [1900 * s, 6, 0.6], [2700 * s, 6, 0.4]] });
    burst(o, sr, 0.6, { dur: 0.02, t60: 0.015, gain: 0.3, R, filters: [['bp', 3500, 1.5]] });
    return o;
  } },
  amb_machine: { peak: -8, var: 4, gen(S) {
    // far below, the breaker still working: heavy clanks and a chain, smeared by distance
    const { sr, R } = S, o = S.alloc(2.2);
    let t = 0.01;
    for (let k = 0; k < R.int(2, 3); k++) {
      metal(o, sr, t, { f: R.range(120, 200), amp: 1, t60: 0.6, click: 0.4, R });
      thump(o, sr, t, { f: 60, to: 45, t60: 0.3, amp: 0.8, R });
      t += R.range(0.25, 0.5);
    }
    for (let k = 0; k < 8; k++) clink(o, sr, R.range(0.1, 1.2), { f: R.range(1200, 2500), amp: 0.2, t60: 0.08, R });
    return filt(o, new BQ(sr, 'lp', 900, 0.7));
  } },
  amb_timber: { peak: -9, var: 4, gen(S) {
    const { sr, R } = S, d = R.range(1.5, 2.5), o = S.alloc(d + 0.1);
    creak(o, sr, 0, { dur: d, body: 'timber', R, gain: 1, jitter: 0.35, rate: (u) => 6 + 9 * Math.sin(Math.PI * u) + 3 * Math.sin(TAU * 2.3 * u), amp: envHump(0.4, 1) });
    return o;
  } },
  amb_coal_trickle: { peak: -12, var: 4, gen(S) {
    const { sr, R } = S, d = R.range(0.8, 1.6), o = S.alloc(d + 0.2);
    grains(o, sr, 0, { dur: d, R, rate: (u) => 10 + 140 * envHump(0.3, 1)(u), amp: envHump(0.3, 1), f: [1500, 5000], t60: [0.01, 0.04], modes: 2, click: 0.3 });
    rumble(o, sr, 0, { dur: d, lp: 300, amp: 0.25, R });
    return o;
  } },
  amb_crow: { peak: -12, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.4);
    let t = 0.01;
    for (let k = 0; k < R.int(2, 3); k++) {
      const f0 = R.range(540, 620), d = R.range(0.22, 0.3);
      voiced(o, sr, t, { dur: d, R, breath: 0.45, jitter: 0.06, lp: 4000,
        f0: (tt) => f0 * (1 - 0.18 * tt / d), amp: envPts([[0, 0], [0.03, 1], [d * 0.7, 0.8], [d, 0]]),
        formants: () => [[1400, 4, 1], [2400, 6, 0.5], [800, 3, 0.4]] });
      t += d + R.range(0.12, 0.25);
    }
    return o;
  } },
  amb_bird: { peak: -16, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.9);
    let t = 0.01;
    for (let k = 0; k < R.int(3, 6) && t < 0.8; k++) {
      const d = R.range(0.03, 0.06), a = R.range(3500, 4500), b = a * R.range(1.15, 1.4);
      tone(o, sr, t, d, { f: (tt) => xlerp(a, b, tt / d), a: envHump(d * 0.3, d) });
      t += d + R.range(0.04, 0.12);
    }
    return o;
  } },
  amb_flag: { peak: -10, var: 4, gen(S) {
    // the halyard clip knocking the hollow flagpole
    const { sr, R } = S, o = S.alloc(1.6);
    let t = 0.005;
    for (let k = 0; k < R.int(1, 2); k++) {
      metal(o, sr, t, { f: R.range(650, 800), amp: 1, t60: 1.2, ratios: RATIOS.bar, click: 0.5, R });
      burst(o, sr, t, { dur: 0.03, t60: 0.02, gain: 0.3, R, filters: [['lp', 1500]] });
      t += R.range(0.25, 0.5);
    }
    return o;
  } },
  amb_wiper: { peak: -12, var: 3, gen(S) {
    const { sr, R } = S, d = R.range(0.6, 0.75), o = S.alloc(d + 0.25);
    scrape(o, sr, 0, { dur: d, f: 1200, q: 1.2, grain: 60, depth: 0.5, amp: envHump(0.5, 1), gain: 0.7, R });
    stickSlip(o, sr, d * 0.2, { dur: d * 0.5, R, rate: (u) => 500 + 200 * Math.sin(Math.PI * u), tone: 0.4, jitter: 0.1, amp: envHump(0.5, 1), gain: 0.15, res: [[1500, 8, 1], [3000, 10, 0.4]] });
    tone(o, sr, 0, d, { f: 180, a: (t) => 0.03 * envHump(d * 0.5, d)(t), wave: 'saw' });
    knock(o, sr, d, { f: 200, amp: 0.35, t60: 0.06, R });
    return o;
  } },
  amb_tray: { peak: -12, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.8);
    metal(o, sr, 0, { f: R.range(550, 650), amp: 1, t60: 0.3, R });
    for (let k = 0; k < 3; k++) clink(o, sr, R.range(0.02, 0.2), { f: R.range(2000, 3500), amp: 0.3, t60: 0.05, R });
    return o;
  } },
  amb_rat: { peak: -16, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.8);
    let t = 0;
    for (let k = 0; k < R.int(4, 8); k++) { grains(o, sr, t, { dur: 0.04, R, rate: 800, amp: 1, f: [2000, 6000], t60: [0.001, 0.003] }); t += R.range(0.05, 0.12); }
    return o;
  } },
  amb_gust_window: { peak: -12, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.6);
    thump(o, sr, 0, { f: 90, to: 75, t60: 0.15, amp: 0.5, R });
    for (let k = 0; k < R.int(2, 4); k++) clink(o, sr, R.range(0.01, 0.2), { f: R.range(2500, 3800), amp: 0.4, t60: 0.04, R });
    return o;
  } },
  amb_fire_pop: { peak: -10, var: 6, gen(S) {
    const { sr, R } = S, o = S.alloc(0.2);
    burst(o, sr, 0, { dur: 0.006, t60: 0.004, gain: 1, R, filters: [['hp', 500]] });
    grains(o, sr, 0.002, { dur: 0.12, R, rate: 200, amp: (u) => 1 - u, f: [1000, 4000], t60: [0.001, 0.004], click: 0.8, gain: 0.5 });
    return o;
  } },
  amb_steam: { peak: -12, var: 3, gen(S) {
    const { sr, R } = S, d = R.range(0.6, 1.2), o = S.alloc(d + 0.05);
    burst(o, sr, 0, { dur: d, R, gain: 1, env: envPts([[0, 0], [0.04, 1], [d * 0.6, 0.6], [d, 0]]), filters: [['hp', 2000, 0.7], ['peak', 5000, 1, 5]] });
    return o;
  } },
  amb_settle: { peak: -10, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.6);
    thump(o, sr, 0, { f: R.range(55, 80), to: 45, t60: 0.35, amp: 1, noise: 0.6, lp: 500, R });
    knock(o, sr, 0, { f: R.range(150, 250), amp: 0.3, t60: 0.08, R });
    return o;
  } },
};
