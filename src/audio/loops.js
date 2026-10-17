// Loop recipes for HW.audio.loop(id, { x, y, vol }). Any sfx id can also be looped (it is
// re-triggered back to back with fresh variants); entries here either build a continuous
// graph or tune that re-triggering (gap / period).
import { noiseLayer, humLayer, ballastLayer, fireLayer, engineLayer, rainLayer, windLayer, modulate } from './layers.js';
import { crowd } from './voices.js';
import { dbToGain } from './dsp.js';

export const LOOPS = {
  // ---- continuous graphs ---------------------------------------------------------------------
  boiler: { graph(V, o, eng) {
    fireLayer(V, eng, { level: -12, lp: 280 });
    humLayer(V, { f: 48, level: -24, h: [1, 0.6, 0.3] });
    noiseLayer(V, eng, { color: 'white', filters: [['bandpass', 3800, 3]], level: -34, mod: { period: 5, depth: 0.8, seed: 40 } });
    pops(V, eng, 'amb_fire_pop', [0.4, 2.5], -8);
  } },
  mine_fire: { graph(V, o, eng) { fireLayer(V, eng, { level: -10, lp: 200 }); pops(V, eng, 'amb_fire_pop', [0.2, 1.2], -6); } },
  fluor_buzz: { graph(V, o, eng) { ballastLayer(V, eng, { level: -20 }); } },
  intercom_hum: { graph(V, o, eng) {
    humLayer(V, { f: 60, level: -26, h: [1, 0.8, 0.5, 0.35, 0.2, 0.12] });
    noiseLayer(V, eng, { color: 'white', filters: [['bandpass', 3000, 0.5]], level: -38 });
    pops(V, eng, 'intercom_crackle', [4, 9], -12);
  } },
  steam: { graph(V, o, eng) { noiseLayer(V, eng, { color: 'white', filters: [['highpass', 1800, 0.7], ['peaking', 4500, 1, 6]], level: -16, mod: { period: 0.6, points: 10, depth: 0.15, seed: 41 } }); } },
  rain_window: { graph(V, o, eng) { rainLayer(V, eng, { kind: 'window', level: -6 }); } },
  rain_roof: { graph(V, o, eng) { rainLayer(V, eng, { kind: 'roof', level: -12 }); } },
  wind: { graph(V, o, eng) { windLayer(V, eng, { level: -4 }); } },
  engine_idle: { graph(V, o, eng) { engineLayer(V, eng, { level: -19 }); } },
  crowd: { graph(V, o, eng) { crowd(V, eng, { n: 10, dur: null, level: 0.4 }); } },
  vhs_noise: { graph(V, o, eng) {
    // static with the 59.94 Hz field buzz (square-wave AM) and mains hum
    const n = V.noise('white'), hp = V.filter('highpass', 400, 0.7), pk = V.filter('peaking', 5000, 0.7, 4);
    const am = V.gain(0.8), lfo = V.osc('square', 59.94), lg = V.gain(0.25);
    V.chain(n, hp, pk, am); lfo.connect(lg); lg.connect(am.gain);
    const g = V.gain(dbToGain(-12)); am.connect(g); g.connect(V.out);
    humLayer(V, { f: 60, level: -34, h: [1, 0.4] });
    V.play(n, 0, null); V.play(lfo, 0, null);
    modulate(V, eng, g.gain, { period: 3, points: 16, depth: dbToGain(-12) * 0.3, seed: 43 });
  } },
  // ---- re-triggered one-shots ----------------------------------------------------------------
  heartbeat: { retrigger: 'heartbeat', gap: [0, 0.02], period: (R, o) => 60 / Math.max(30, Math.min(200, o.bpm || 72)) },
  colonel_breath: { retrigger: 'colonel_breath', gap: [0.2, 1.4] },
  colonel_breath_fast: { retrigger: 'colonel_breath_fast', gap: [0, 0.15] },
  drip: { retrigger: 'drip', gap: [0.6, 3.5] },
  faucet: { retrigger: 'amb_faucet', gap: [0.7, 1.2], period: () => 0 },
  clock_tick: { retrigger: 'amb_clock', gap: [0, 0], period: () => 1 },
  typewriter: { retrigger: 'typewriter_key', gap: [0.06, 0.28] },
  pen_scratch: { retrigger: 'pen_scratch', gap: [0.1, 0.6] },
  chalk: { retrigger: 'chalk', gap: [0.2, 0.9] },
  husk_rustle: { retrigger: 'husk_rustle', gap: [2, 7] },
  cicada_click: { retrigger: 'cicada_click', gap: [3, 10] },
  record_crackle: { retrigger: 'record_crackle', gap: [0, 0], period: (R) => 3.35 },
  locker_tap: { retrigger: 'locker_tap', gap: [0.45, 0.9] },
};

/** Sporadic one-shots inside a continuous loop voice (fire pops, PA crackles). */
function pops(V, eng, id, [g0, g1], volDb) {
  eng.addTask(V.t0 + eng.R.range(g0, g1), (t) => {
    if (V.disposed || V.stopping) return null;
    const v = eng.play(id, { t, dest: V.out, send: null, vol: dbToGain(volDb + eng.R.bi() * 3) });
    if (v) (V.children || (V.children = [])).push(v);
    if (V.children && V.children.length > 8) V.children = V.children.filter((c) => { if (eng.now > c.end + 0.1) { c.dispose(); return false; } return true; });
    return t + eng.R.range(g0, g1);
  }, V);
}
