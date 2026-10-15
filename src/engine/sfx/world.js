// Items, world objects, alarms, vehicles, footsteps and UI.
import { clack, tick, thud, whoosh, squelch, bubble, crackle, debris, glassSmash, creak, scrape, rustle, beep, bell, splat, monoLoop, curve } from './kit.js';

const ITEM = { v: 1, group: 'item', dist: 'item', prio: 0.5, peak: 0.5, maxInst: 3, burst: 2 };
const WORLD = { v: 1, group: 'world', dist: 'world', prio: 0.5, peak: 0.6, maxInst: 4, burst: 2 };
const LOOP = { loop: true, group: 'world', dist: 'world', prio: 0.45, maxInst: 4, burst: 1 };

function fireBed(S, d, { roar = 1, crack = 1, rate = 30 } = {}) {
  const o = S.buf(d);
  const r = S.brown(d); S.lp(r, 500);
  const w = S.wobble(d, 2.5);
  for (let i = 0; i < r.length; i++) r[i] *= 0.65 + 0.35 * w[i];
  S.mix(o, S.norm(r, 1), 0, 0.7 * roar);
  const h = S.noise(d); S.bp(h, 1400, 0.6); const w2 = S.wobble(d, 7);
  for (let i = 0; i < h.length; i++) h[i] *= 0.4 + 0.6 * Math.abs(w2[i]);
  S.mix(o, S.norm(h, 1), 0, 0.25 * roar);
  S.mix(o, crackle(S, d, Math.round(rate * d), { fLo: 900, fHi: 5000, tauLo: 0.001, tauHi: 0.006, q: 1.2, ampLo: 0.1 }), 0, 0.9 * crack);
  return S.norm(o, 1);
}

export const WORLD_SOUNDS = {
  pickup_item: { ...ITEM, peak: 0.4, v: 3, gen: (S) => {
    const o = S.buf(0.3);
    S.mix(o, rustle(S, 0.2, 2400), 0, 0.6);
    S.mix(o, clack(S, S.rand(1400, 2000), { tau: 0.01, noise: 0.2 }), 0.12, 0.6);
    return o;
  } },
  pickup_weapon: { ...ITEM, v: 3, gen: (S) => {
    const o = S.buf(0.45);
    S.mix(o, rustle(S, 0.18, 1800), 0, 0.4);
    S.mix(o, clack(S, S.rand(1300, 1700), { tau: 0.02, dur: 0.12, ratios: [1, 1.8, 2.9] }), 0.08, 1);
    S.mix(o, thud(S, 170, 0.02, { noise: 0.3 }), 0.08, 0.5);
    S.mix(o, clack(S, S.rand(2400, 3000), { tau: 0.012 }), 0.2, 0.5);
    return o;
  } },
  ammo_pickup: { ...ITEM, v: 2, gen: (S) => {
    const o = S.buf(0.55);
    for (let k = 0; k < 14; k++) S.mix(o, clack(S, S.rand(2800, 4500), { tau: 0.012, dur: 0.05 }), 0.02 + S.rand(0, 0.32), S.rand(0.2, 0.6));
    S.mix(o, thud(S, 150, 0.03, { noise: 0.5 }), 0.05, 0.6);
    S.mix(o, clack(S, 900, { tau: 0.02, dur: 0.1, ratios: [1, 2.6] }), 0.3, 0.7);
    return o;
  } },
  medkit_use: { ...ITEM, loop: true, peak: undefined, gain: 0.55, maxInst: 2, burst: 1, gen: (S) => monoLoop(S, 4, 0.2, (d) => S.buf(d), (d) => {
    const o = S.buf(d);
    let t = 0.05;
    while (t < 3.9) {
      const kind = S.r();
      if (kind < 0.45) { const len = S.rand(0.15, 0.4); S.mix(o, rustle(S, len, S.rand(1500, 3000)), t, S.rand(0.3, 0.6)); t += len * 0.7; }
      else if (kind < 0.75) { // tape / fabric tearing: rapid crackle with upward band
        const len = S.rand(0.18, 0.35), tr = S.buf(len);
        let tt = 0; while (tt < len) { S.mix(tr, S.click(S.rand(1500, 4500), 2, 0.0015, 0.01), tt, S.rand(0.4, 1)); tt += S.rand(0.002, 0.008); }
        S.mul(tr, (x) => Math.sin(Math.PI * x / len));
        S.mix(o, S.norm(tr, 1), t, S.rand(0.5, 0.8)); t += len;
      } else { S.mix(o, tick(S, S.rand(1200, 2500), 3, 0.004), t, 0.4); t += 0.06; }
      t += S.rand(0.04, 0.2);
    }
    return o;
  }) },
  medkit_done: { ...ITEM, gen: (S) => {
    const o = S.buf(0.5);
    const tr = S.buf(0.18); let tt = 0; while (tt < 0.17) { S.mix(tr, S.click(S.rand(2000, 5000), 2, 0.0012, 0.01), tt, S.rand(0.4, 1)); tt += S.rand(0.002, 0.006); }
    S.mix(o, S.norm(tr, 1), 0, 0.6);
    S.mix(o, thud(S, 140, 0.03, { noise: 0.7, nf: 1500 }), 0.22, 0.7);
    S.mix(o, rustle(S, 0.2, 1800), 0.25, 0.3);
    return o;
  } },
  pills_shake: { ...ITEM, peak: 0.4, gen: (S) => {
    const o = S.buf(0.75);
    for (let s = 0; s < 3; s++) {
      const t0 = s * 0.2;
      for (let k = 0; k < 14; k++) S.mix(o, S.click(S.rand(2500, 5500), 5, 0.002, 0.012), t0 + S.rand(0, 0.08), S.rand(0.2, 1));
      S.mix(o, tick(S, 900, 2, 0.008), t0 + 0.04, 0.35);
    }
    return o;
  } },
  pills_swallow: { ...ITEM, peak: 0.45, gen: (S) => {
    const o = S.buf(0.45);
    const g = S.osc('sine', 0.12, (t) => 380 - t * 1600); S.mul(g, (t) => Math.sin(Math.PI * t / 0.12) ** 2);
    S.mix(o, g, 0.05, 0.6);
    S.mix(o, squelch(S, 0.08, 600, { chatter: 30 }), 0.08, 0.4);
    const ex = S.noise(0.25); S.bp(ex, 1100, 0.8); S.mul(ex, (t) => Math.sin(Math.PI * t / 0.25) ** 2);
    S.mix(o, S.norm(ex, 1), 0.2, 0.25);
    return o;
  } },
  adrenaline_inject: { ...ITEM, gen: (S) => {
    const o = S.buf(0.75);
    S.mix(o, clack(S, 2200, { tau: 0.01 }), 0, 0.7);
    const h = S.noise(0.2); S.hp(h, 4000); S.mul(h, (t) => Math.exp(-t / 0.06));
    S.mix(o, S.norm(h, 1), 0.04, 0.45);
    S.mix(o, thud(S, 160, 0.015, { noise: 0.3 }), 0.04, 0.4);
    const gasp = S.noise(0.35); S.bp(gasp, (t) => 900 + t * 2500, 1.5); S.mul(gasp, (t) => Math.sin(Math.PI * t / 0.35) ** 1.5);
    S.mix(o, S.norm(gasp, 1), 0.3, 0.4);
    return o;
  } },
  defib_charge: { ...ITEM, peak: 0.45, gen: (S) => {
    const d = 1.3, o = S.buf(d);
    const F = (t) => 500 * Math.pow(7, Math.min(1, t / 1.15));
    const w = S.osc('sine', d, F); S.add(w, S.norm(S.osc('sine', d, (t) => F(t) * 2), 0.25));
    const bz = S.osc('square', d, 120); S.lp(bz, 900); S.norm(bz, 0.12); S.add(w, bz);
    S.mul(w, (t) => Math.min(1, t / 0.05) * (0.5 + 0.5 * t / d) * Math.min(1, (d - t) / 0.05));
    S.mix(o, w, 0, 1);
    S.crush(o, 8);
    return o;
  } },
  defib_shock: { ...ITEM, peak: 0.85, dist: 'world', gen: (S) => {
    const o = S.buf(0.8);
    S.mix(o, thud(S, 70, 0.08, { noise: 0.6 }), 0, 1);
    S.mix(o, crackle(S, 0.35, 70, { fLo: 1500, fHi: 8000, tauLo: 0.0005, tauHi: 0.002, q: 0.8 }), 0, 0.8);
    const bz = S.osc('square', 0.3, 100); S.lp(bz, 2000); S.mul(bz, (t) => Math.exp(-t / 0.1));
    S.mix(o, S.norm(bz, 1), 0, 0.5);
    S.sat(o, 2);
    return o;
  } },
  pipebomb_beep: { ...ITEM, peak: 0.55, dist: 'world', maxInst: 4, burst: 2, gen: (S) => {
    const b = beep(S, 0.09, 1850, 'square', 4500);
    S.crush(b, 6);
    return b;
  } },
  molotov_ignite: { ...ITEM, gen: (S) => {
    const o = S.buf(0.9);
    S.mix(o, clack(S, 2600, { tau: 0.008 }), 0, 0.6);
    S.mix(o, scrape(S, 0.05, 4000, 2), 0.01, 0.4);
    const w = S.noise(0.8); S.lp(w, (t) => 300 + 2200 * Math.sin(Math.PI * Math.min(1, t / 0.5)), 0.9);
    S.mul(w, (t) => Math.min(1, (t) / 0.12) * Math.exp(-t / 0.35));
    S.mix(o, S.norm(w, 1), 0.07, 0.8);
    S.mix(o, crackle(S, 0.7, 20, { fLo: 1200, fHi: 5000 }), 0.15, 0.3);
    return o;
  } },
  molotov_shatter: { ...WORLD, peak: 0.85, gen: (S) => {
    const o = S.buf(1.6);
    S.mix(o, glassSmash(S, 1.2, 0.8), 0, 0.8);
    const w = S.noise(1.5); S.lp(w, (t) => 250 + 3000 * Math.exp(-Math.pow((t - 0.15) / 0.18, 2)), 0.8);
    S.mul(w, (t) => Math.min(1, t / 0.04) * Math.exp(-t / 0.45));
    S.mix(o, S.norm(w, 1), 0.03, 1);
    S.mix(o, thud(S, 60, 0.12, { noise: 0.4 }), 0.03, 0.6);
    S.mix(o, crackle(S, 1.4, 40, { t0: 0.1, fLo: 900, fHi: 4500, decay: 1 }), 0, 0.3);
    return o;
  } },
  bile_shatter: { ...WORLD, peak: 0.75, gen: (S) => {
    const o = S.buf(1.2);
    S.mix(o, glassSmash(S, 1.0, 0.8), 0, 0.8);
    S.mix(o, splat(S, 0.8, 1.3), 0.01, 0.9);
    for (let k = 0; k < 10; k++) S.mix(o, bubble(S, S.rand(250, 650), S.rand(0.03, 0.08)), S.rand(0.05, 0.9), S.rand(0.1, 0.3));
    return o;
  } },
  fire_loop: { ...LOOP, gain: 0.7, gen: (S) => monoLoop(S, 6, 0.6, (d) => fireBed(S, d)) },
  fire_burst: { ...WORLD, peak: 0.85, v: 2, gen: (S) => {
    const o = S.buf(1.4);
    const w = S.noise(1.4); S.lp(w, (t) => 200 + 3500 * Math.exp(-Math.pow((t - 0.12) / 0.16, 2)), 0.8);
    S.mul(w, (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.4));
    S.mix(o, S.norm(w, 1), 0, 1);
    S.mix(o, thud(S, 55, 0.12, { noise: 0.5 }), 0, 0.7);
    S.mix(o, crackle(S, 1.3, 35, { t0: 0.08, fLo: 900, fHi: 5000, decay: 1.2 }), 0, 0.35);
    return o;
  } },
  gascan_pour: { ...LOOP, dist: 'item', gain: 0.5, maxInst: 2, gen: (S) => monoLoop(S, 3, 0.2, (d) => {
    const s = S.noise(d); S.bp(s, 1300, 0.7); const w = S.wobble(d, 9);
    for (let i = 0; i < s.length; i++) s[i] *= 0.5 + 0.5 * Math.abs(w[i]);
    return S.norm(s, 0.3);
  }, (d) => {
    const o = S.buf(d);
    let t = 0;
    while (t < 3) { S.mix(o, bubble(S, S.rand(180, 420), S.rand(0.04, 0.09)), t, S.rand(0.5, 1)); t += S.rand(0.07, 0.16); }
    return o;
  }) },
  gascan_fill_done: { ...ITEM, gen: (S) => {
    const o = S.buf(0.5);
    S.mix(o, bubble(S, 300, 0.09), 0, 0.6);
    S.mix(o, clack(S, 1500, { tau: 0.03, dur: 0.15, ratios: [1, 2.2, 3.4] }), 0.1, 0.8);
    S.mix(o, thud(S, 130, 0.03, { noise: 0.4 }), 0.1, 0.5);
    return o;
  } },
  propane_hiss: { ...LOOP, gain: 0.45, gen: (S) => monoLoop(S, 3, 0.3, (d) => {
    const h = S.noise(d); S.hp(h, 2500); S.peq(h, 5200, 2, 6);
    const w = S.wobble(d, 11); for (let i = 0; i < h.length; i++) h[i] *= 0.8 + 0.2 * w[i];
    return S.norm(h, 1);
  }) },
  door_open: { ...WORLD, peak: 0.55, v: 3, gen: (S) => {
    const d = S.rand(0.9, 1.3), o = S.buf(d + 0.1);
    S.mix(o, clack(S, S.rand(1600, 2200), { tau: 0.012 }), 0, 0.6);
    const base = S.rand(110, 170);
    S.mix(o, creak(S, d, (t) => base * (1 + 0.8 * Math.sin(Math.PI * t / d)) * (1 + 0.15 * Math.sin(t * 23)), { body: [[S.rand(280, 360), 0.025, 1], [S.rand(700, 900), 0.015, 0.6], [1600, 0.008, 0.3]], amp: (t) => Math.sin(Math.PI * Math.min(1, t / d)) ** 0.7 }), 0.06, 0.8);
    return o;
  } },
  door_close: { ...WORLD, peak: 0.65, v: 2, gen: (S) => {
    const o = S.buf(0.7);
    S.mix(o, whoosh(S, 0.25, 150, 600, 1, 0.7), 0, 0.3);
    S.mix(o, thud(S, 85, 0.07, { noise: 0.7, nf: 800 }), 0.22, 1);
    S.mix(o, S.norm(S.modes(0.4, [[190, 0.08, 1], [430, 0.05, 0.6], [910, 0.03, 0.3]], S.burst(0.005, 0.001)), 1), 0.22, 0.6);
    S.mix(o, clack(S, 2000, { tau: 0.012 }), 0.235, 0.5);
    return o;
  } },
  door_metal_open: { ...WORLD, peak: 0.7, gen: (S) => {
    const d = 1.6, o = S.buf(d);
    S.mix(o, clack(S, 900, { tau: 0.05, dur: 0.3, ratios: [1, 1.63, 2.71, 3.9] }), 0, 0.9);
    S.mix(o, thud(S, 110, 0.04, { noise: 0.4 }), 0, 0.6);
    S.mix(o, creak(S, 1.2, (t) => 260 + 140 * Math.sin(Math.PI * t / 1.2), { body: [[620, 0.05, 1], [1340, 0.03, 0.7], [2450, 0.02, 0.4]], irregular: 0.2, amp: (t) => Math.sin(Math.PI * Math.min(1, t / 1.2)) }), 0.15, 0.55);
    const r = S.brown(d); S.lp(r, 250); S.mul(r, (t) => Math.sin(Math.PI * Math.min(1, t / d)));
    S.mix(o, S.norm(r, 1), 0, 0.25);
    return o;
  } },
  door_metal_close: { ...WORLD, peak: 0.95, prio: 0.8, dist: 'alarm', gen: (S) => {
    const d = 2.2, o = S.buf(d);
    S.mix(o, whoosh(S, 0.3, 120, 500, 1, 0.8), 0, 0.25);
    const ex = S.burst(0.01, 0.002);
    const m = S.modes(d - 0.3, [[118, 0.6, 1], [197, 0.45, 0.8], [311, 0.35, 0.6], [467, 0.25, 0.5], [692, 0.18, 0.35], [1043, 0.12, 0.25], [1610, 0.07, 0.2]], ex);
    S.mix(o, S.norm(m, 1), 0.28, 0.9);
    S.mix(o, thud(S, 60, 0.12, { noise: 0.8, nf: 500 }), 0.28, 1);
    S.mix(o, clack(S, 1800, { tau: 0.02 }), 0.3, 0.5);
    S.mix(o, scrape(S, 0.12, 2200, 3), 0.55, 0.3);
    S.mix(o, clack(S, 1300, { tau: 0.03, dur: 0.15 }), 0.68, 0.7);
    S.sat(o, 1.5);
    return o;
  } },
  door_break: { ...WORLD, peak: 0.95, prio: 0.75, dist: 'gun', gen: (S) => {
    const d = 1.6, o = S.buf(d);
    S.mix(o, thud(S, 70, 0.1, { noise: 0.9, nf: 900 }), 0, 1);
    const c = S.burst(0.05, 0.004); S.hp(c, 1200); S.mix(o, S.norm(c, 1), 0, 0.7);
    S.mix(o, crackle(S, 0.5, 60, { fLo: 800, fHi: 4000, tauLo: 0.002, tauHi: 0.01, q: 1.2, decay: 1.5 }), 0, 0.8);
    S.mix(o, S.norm(S.modes(0.5, [[160, 0.12, 1], [370, 0.08, 0.7], [820, 0.05, 0.4]], S.burst(0.01, 0.002)), 1), 0, 0.6);
    S.mix(o, debris(S, d, 26, { t0: 0.15, fLo: 500, fHi: 2500, chunky: 0.7, tau: 0.03 }), 0, 0.5);
    S.sat(o, 1.8);
    return o;
  } },
  door_bang: { ...WORLD, v: 4, peak: 0.8, maxInst: 4, gen: (S) => {
    const o = S.buf(0.6);
    S.mix(o, thud(S, S.rand(70, 95), 0.06, { noise: 0.8, nf: 700 }), 0, 1);
    S.mix(o, S.norm(S.modes(0.5, [[S.rand(150, 190), 0.1, 1], [S.rand(340, 420), 0.07, 0.6], [S.rand(780, 900), 0.04, 0.4]], S.burst(0.01, 0.002)), 1), 0, 0.7);
    for (let k = 0; k < 4; k++) S.mix(o, clack(S, S.rand(1500, 2600), { tau: 0.01, dur: 0.04 }), 0.01 + S.rand(0, 0.08), 0.12);
    S.sat(o, 1.5);
    return o;
  } },
  glass_break: { ...WORLD, v: 3, peak: 0.8, gen: (S) => glassSmash(S, 1.4, 1.2) },
  alarm_loop: { ...LOOP, dist: 'alarm', prio: 0.7, gain: 0.8, gen: (S) => monoLoop(S, 2, 0.05, (d) => {
    // electric bell: hammer striking ~20x per second
    const exc = S.buf(d), rate = 19, sr = S.sr;
    for (let i = 0; i < exc.length; i += Math.round(sr / rate)) exc[i] = 1;
    const m = S.modes(d, [[880, 0.15, 1], [2050, 0.08, 0.7], [3420, 0.05, 0.5], [4870, 0.03, 0.3]], exc);
    S.add(m, S.norm(S.osc('square', d, rate * 3), 0.05));
    return S.sat(S.norm(m, 1), 1.5);
  }) },
  mall_alarm_loop: { ...LOOP, dist: 'alarm', prio: 0.7, gain: 0.7, gen: (S) => {
    const L = 3.2, n = S.len(L), sr = S.sr, o = new Float32Array(n);
    // rising whoop repeated every 0.8s (integer cycles keep the loop seamless)
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = (t % 0.8) / 0.8;
      const f = 560 + 900 * Math.pow(u, 0.8);
      ph += f / sr; ph -= Math.floor(ph);
      const v = (ph < 0.5 ? 1 : -1) * 0.6 + Math.sin(6.2832 * ph) * 0.4;
      const a = Math.min(1, u / 0.03) * Math.min(1, (1 - u) / 0.04);
      o[i] = v * a;
    }
    S.lp(o, 3500); S.crush(o, 7);
    return o;
  } },
  car_alarm_loop: { ...LOOP, dist: 'alarm', prio: 0.7, gain: 0.75, gen: (S) => {
    const L = 6, n = S.len(L), sr = S.sr, o = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let f, a;
      if (t < 2) { f = 1100 + 450 * Math.sin(6.2832 * 7 * t); a = 1; } // warble
      else if (t < 4) { const u = ((t - 2) * 4) % 1; f = 520; a = u < 0.5 ? Math.min(1, u / 0.01) * Math.min(1, (0.5 - u) / 0.01) : 0; } // honk pulses
      else { const u = ((t - 4) * 2.5) % 1; f = 700 + 1000 * u; a = Math.min(1, u / 0.02) * Math.min(1, (1 - u) / 0.03); } // yelps
      ph += f / sr; ph -= Math.floor(ph);
      o[i] = (ph < 0.5 ? 1 : -1) * a;
      if (t < 0.01) o[i] *= t / 0.01; if (t > L - 0.01) o[i] *= (L - t) / 0.01;
    }
    S.lp(o, 2800); S.bp(o, 1100, 0.5);
    return S.norm(o, 1);
  } },
  elevator_hum: { ...LOOP, gain: 0.5, gen: (S) => monoLoop(S, 4, 0.4, (d) => {
    const o = S.buf(d);
    for (const [f, a] of [[60, 1], [120, 0.7], [180, 0.4], [240, 0.2], [412, 0.08]]) S.mix(o, S.osc('sine', d, f * S.jit(1, 0.003)), 0, a);
    const n = S.noise(d); S.lp(n, 900); S.mix(o, S.norm(n, 1), 0, 0.25);
    const r = S.noise(d); S.bp(r, 2500, 2); const w = S.wobble(d, 6);
    for (let i = 0; i < r.length; i++) r[i] *= Math.max(0, w[i]);
    S.mix(o, S.norm(r, 1), 0, 0.08);
    return o;
  }) },
  elevator_ding: { ...WORLD, peak: 0.5, dist: 'alarm', gen: (S) => {
    const o = S.buf(1.6);
    S.mix(o, bell(S, 1.5, 1318, { ratio: 3.5, index: 1.5, tau: 0.5 }), 0, 0.8);
    S.mix(o, bell(S, 1.5, 1318 * 2.01, { ratio: 1, index: 0.5, tau: 0.25 }), 0, 0.2);
    return o;
  } },
  elevator_stop: { ...WORLD, peak: 0.8, dist: 'alarm', gen: (S) => {
    const d = 2.2, o = S.buf(d);
    S.mix(o, thud(S, 55, 0.15, { noise: 0.8, nf: 400 }), 0, 1);
    S.mix(o, clack(S, 700, { tau: 0.08, dur: 0.4, ratios: [1, 1.6, 2.5, 3.7] }), 0, 0.6);
    S.mix(o, debris(S, 0.6, 8, { t0: 0.03, fLo: 1500, fHi: 3000 }), 0, 0.15);
    const hum = S.buf(d);
    for (const [f, a] of [[60, 1], [120, 0.6], [180, 0.3]]) S.add(hum, S.mul(S.osc('sine', d, (t) => f * (1 - 0.6 * Math.min(1, t / 1.6))), a));
    S.mul(hum, (t) => Math.exp(-t / 0.6));
    S.mix(o, S.norm(hum, 1), 0, 0.4);
    return o;
  } },
  button_press: { ...ITEM, peak: 0.4, gen: (S) => { const o = S.buf(0.1); S.mix(o, tick(S, 1800, 3, 0.003), 0, 1); S.mix(o, tick(S, 900, 2, 0.006), 0.035, 0.6); return o; } },
  intercom_buzz: { ...WORLD, peak: 0.5, gen: (S) => {
    const o = S.buf(0.7);
    S.mix(o, tick(S, 2000, 3, 0.003), 0, 0.5);
    const b = S.osc('square', 0.6, 120); S.add(b, S.norm(S.noise(0.6), 0.2)); S.bp(b, 1100, 1.2);
    S.mul(b, (t) => Math.min(1, t / 0.01) * Math.min(1, (0.6 - t) / 0.02));
    S.crush(b, 6);
    S.mix(o, S.norm(b, 1), 0.04, 0.9);
    return o;
  } },
  helicopter_loop: { ...LOOP, dist: 'heli', prio: 0.85, gain: 0.9, gen: (S) => {
    const L = 4, X = 0.5, d = L + X;
    const cont = (dd) => {
      const o = S.buf(dd);
      // blade slap: 22 passes in 4 s (5.5 Hz) via exact period -> seamless
      const per = L / 22, sr = S.sr;
      const exc = S.buf(dd);
      for (let t = 0; t < dd; t += per) exc[Math.round(t * sr)] = 1;
      const slaps = S.modes(dd, [[75, 0.04, 1], [140, 0.03, 0.6], [320, 0.012, 0.3]], exc);
      S.add(o, S.norm(slaps, 1));
      const ns = S.noise(dd); S.lp(ns, 700);
      S.mul(ns, (t) => 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.cos(6.2832 * t / per), 6));
      S.mix(o, S.norm(ns, 1), 0, 0.6);
      const tur = S.osc('sine', dd, 1760); S.add(tur, S.mul(S.osc('sine', dd, 2640), 0.4));
      S.mix(o, S.norm(tur, 1), 0, 0.05);
      const eng = S.brown(dd); S.lp(eng, 300); S.mix(o, S.norm(eng, 1), 0, 0.35);
      return o;
    };
    return S.loopXfade(cont(d), S.len(L), S.len(X));
  } },
  helicopter_flyby: { ...WORLD, dist: 'heli', peak: 0.9, prio: 0.8, gen: (S) => {
    const d = 7, o = S.buf(d), sr = S.sr;
    const tc = 3.2;
    const exc = S.buf(d);
    let ph = 0;
    for (let i = 0; i < exc.length; i++) {
      const t = i / sr, rel = (t - tc);
      const dop = 1 + 0.12 * Math.tanh(-rel * 1.2);
      ph += 5.6 * dop / sr;
      if (ph >= 1) { ph -= 1; exc[i] = 1; }
    }
    const slaps = S.modes(d, [[78, 0.04, 1], [150, 0.03, 0.6], [330, 0.012, 0.35]], exc);
    S.add(o, S.norm(slaps, 1));
    const ns = S.noise(d); S.lp(ns, 900); S.mix(o, S.norm(ns, 1), 0, 0.4);
    const tur = S.osc('sine', d, (t) => 1800 * (1 + 0.1 * Math.tanh(-(t - tc) * 1.2))); S.mix(o, tur, 0, 0.05);
    S.lp(o, (t) => 600 + 6000 * Math.exp(-Math.pow((t - tc) / 1.4, 2)), 0.7);
    S.mul(o, (t) => Math.exp(-Math.pow((t - tc) / 1.8, 2)) * 0.95 + 0.05 * Math.min(1, t / 0.5) * Math.min(1, (d - t) / 0.5));
    return o;
  } },
  rock_impact: { ...WORLD, v: 2, peak: 0.95, prio: 0.8, dist: 'gun', gen: (S) => {
    const d = 1.8, o = S.buf(d);
    S.mix(o, thud(S, 55, 0.12, { noise: 1, nf: 700 }), 0, 1);
    const c = S.burst(0.05, 0.004); S.hp(c, 900); S.mix(o, S.norm(c, 1), 0, 0.6);
    const cr = S.noise(d); S.lp(cr, (t) => 300 + 3000 * Math.exp(-t / 0.15)); S.mul(cr, (t) => Math.min(1, t / 0.005) * Math.exp(-t / 0.2));
    S.mix(o, S.norm(cr, 1), 0, 0.8);
    S.mix(o, debris(S, d, 40, { t0: 0.05, fLo: 700, fHi: 3500, chunky: 0.6, tau: 0.025 }), 0, 0.5);
    S.sat(o, 2);
    return o;
  } },
  wood_crack: { ...WORLD, v: 3, peak: 0.75, gen: (S) => {
    const o = S.buf(0.7);
    const c = S.burst(0.03, 0.003); S.bp(c, 1500, 0.8); S.mix(o, S.norm(c, 1), 0, 0.9);
    S.mix(o, crackle(S, 0.35, 30, { fLo: 700, fHi: 3500, tauLo: 0.002, tauHi: 0.01, decay: 2 }), 0.005, 0.7);
    S.mix(o, S.norm(S.modes(0.4, [[S.rand(200, 260), 0.06, 1], [S.rand(520, 600), 0.04, 0.6]], S.burst(0.006, 0.001)), 1), 0, 0.6);
    return o;
  } },
  metal_crash: { ...WORLD, v: 3, peak: 0.9, prio: 0.7, dist: 'gun', gen: (S) => {
    const d = 2, o = S.buf(d);
    const hits = S.randi(4, 7);
    for (let k = 0; k < hits; k++) {
      const t = k === 0 ? 0 : S.rand(0.02, 0.9) * Math.pow(k / hits, 0.7), f = S.rand(180, 600);
      const m = S.modes(1.2, [[f, 0.4, 1], [f * 1.59, 0.3, 0.8], [f * 2.33, 0.22, 0.6], [f * 3.41, 0.15, 0.5], [f * 5.1, 0.08, 0.35], [f * 7.3, 0.05, 0.2]], S.burst(0.006, 0.001));
      S.mix(o, S.norm(m, 1), t, (k === 0 ? 1 : S.rand(0.3, 0.7)));
    }
    S.mix(o, thud(S, 80, 0.07, { noise: 0.7 }), 0, 0.8);
    S.mix(o, debris(S, d, 20, { t0: 0.2, fLo: 1500, fHi: 5000, chunky: 0.3 }), 0, 0.3);
    S.sat(o, 1.6);
    return o;
  } },
  body_fall: { ...WORLD, v: 4, peak: 0.6, maxInst: 4, burst: 2, dist: 'impact', prio: 0.3, gen: (S) => {
    const o = S.buf(0.7);
    S.mix(o, thud(S, S.rand(60, 80), 0.07, { noise: 0.9, nf: 500 }), 0, 1);
    S.mix(o, rustle(S, 0.3, 1500), 0, 0.3);
    S.mix(o, thud(S, S.rand(80, 100), 0.04, { noise: 0.8, nf: 600 }), S.rand(0.12, 0.2), 0.45);
    S.mix(o, squelch(S, 0.12, 700), 0.01, 0.15);
    return o;
  } },
  gib_splat: { ...WORLD, v: 3, peak: 0.75, maxInst: 4, burst: 2, dist: 'impact', gen: (S) => {
    const o = S.buf(0.9);
    S.mix(o, splat(S, 0.8, 1.5), 0, 1);
    S.mix(o, crackle(S, 0.15, 15, { fLo: 1000, fHi: 3000 }), 0.005, 0.3);
    for (let k = 0; k < 5; k++) S.mix(o, splat(S, 0.25, 0.4), S.rand(0.1, 0.5), S.rand(0.1, 0.3));
    return o;
  } },
  blood_splash: { ...WORLD, v: 3, peak: 0.45, maxInst: 4, burst: 2, dist: 'impact', prio: 0.2, gen: (S) => splat(S, 0.45, 0.7) },
  heartbeat: { v: 1, group: 'ui', cat: 'ui', peak: 0.8, prio: 1, maxInst: 2, burst: 1, gen: (S) => {
    const o = S.buf(0.6);
    for (const [t, a, f] of [[0, 1, 55], [0.16, 0.65, 50]]) {
      const b = S.thump(0.35, f * 1.6, f, 0.02, 0.06, 0.006);
      const n = S.burst(0.3, 0.03, 0.005); S.lp(n, 160);
      S.add(b, S.norm(n, 0.5));
      S.mix(o, b, t, a);
    }
    S.lp(o, 400);
    return o;
  } },
  flashlight_click: { ...ITEM, peak: 0.35, gen: (S) => { const o = S.buf(0.1); S.mix(o, clack(S, 2700, { tau: 0.005, dur: 0.04 }), 0, 1); S.mix(o, tick(S, 1400, 2, 0.004), 0.025, 0.5); return o; } },
  ledge_grab: { ...ITEM, peak: 0.6, dist: 'vox', gen: (S) => {
    const o = S.buf(0.45);
    S.mix(o, thud(S, 140, 0.025, { noise: 0.9, nf: 2000 }), 0, 0.8);
    S.mix(o, thud(S, 150, 0.025, { noise: 0.9, nf: 2000 }), 0.03, 0.6);
    S.mix(o, scrape(S, 0.2, 1800, 1.5), 0.04, 0.4);
    S.mix(o, rustle(S, 0.3, 1600), 0, 0.3);
    return o;
  } },
  ledge_slip: { ...ITEM, peak: 0.6, dist: 'vox', gen: (S) => {
    const o = S.buf(0.7);
    S.mix(o, scrape(S, 0.5, 1500, 1.2, 0.8), 0, 0.8);
    S.mix(o, crackle(S, 0.5, 18, { fLo: 1500, fHi: 5000 }), 0, 0.3);
    S.mix(o, thud(S, 120, 0.02, { noise: 0.8, nf: 1500 }), 0.45, 0.5);
    return o;
  } },
  // ---------------------------------------------------------------- UI (2D)
  ui_click: { v: 1, group: 'ui', cat: 'ui', peak: 0.35, prio: 1, maxInst: 3, burst: 2, gen: (S) => {
    const o = S.buf(0.06);
    S.mix(o, beep(S, 0.025, 1900, 'square', 5000), 0, 0.6);
    S.mix(o, tick(S, 3500, 3, 0.002), 0, 0.5);
    return S.crush(o, 7);
  } },
  ui_hover: { v: 1, group: 'ui', cat: 'ui', peak: 0.18, prio: 1, maxInst: 3, burst: 2, gen: (S) => S.crush(beep(S, 0.035, 1250, 'tri', 4000), 7) },
  ui_back: { v: 1, group: 'ui', cat: 'ui', peak: 0.3, prio: 1, maxInst: 3, burst: 2, gen: (S) => {
    const o = S.buf(0.14);
    S.mix(o, beep(S, 0.05, 1100, 'square', 3500), 0, 0.7);
    S.mix(o, beep(S, 0.06, 740, 'square', 3000), 0.06, 0.7);
    return S.crush(o, 7);
  } },
  achievement_ding: { v: 1, group: 'ui', cat: 'ui', peak: 0.45, prio: 1, maxInst: 2, burst: 1, gen: (S) => {
    const o = S.buf(1.6);
    S.mix(o, bell(S, 1.2, 1046.5, { ratio: 2, index: 2, tau: 0.35 }), 0, 0.7);
    S.mix(o, bell(S, 1.4, 1568, { ratio: 2, index: 2, tau: 0.45 }), 0.12, 0.8);
    S.mix(o, bell(S, 1.4, 2093, { ratio: 3, index: 1, tau: 0.35 }), 0.12, 0.25);
    S.verb(o, { room: 0.6, damp: 0.3, wet: 0.2 });
    return o;
  } },
};

// ---------------------------------------------------------------- footsteps
function strike(S, surf, amp) {
  const o = S.buf(0.4);
  switch (surf) {
    case 'concrete': {
      S.mix(o, thud(S, S.rand(80, 100), 0.014, { noise: 0.9, nf: 1800 }), 0, 0.8);
      const sc = S.burst(0.06, 0.012, 0.003); S.hp(sc, 2800); S.mix(o, S.norm(sc, 1), 0.004, 0.35);
      break;
    }
    case 'metal': {
      S.mix(o, thud(S, S.rand(90, 110), 0.015, { noise: 0.6, nf: 1500 }), 0, 0.6);
      const f = S.rand(320, 480);
      S.mix(o, S.norm(S.modes(0.35, [[f, 0.12, 1], [f * 2.71, 0.08, 0.7], [f * 5.13, 0.05, 0.5], [f * 7.9, 0.03, 0.3]], S.burst(0.004, 0.0008)), 1), 0, 0.55);
      S.mix(o, clack(S, S.rand(2200, 2800), { tau: 0.008, dur: 0.04 }), 0, 0.25);
      break;
    }
    case 'wood': {
      S.mix(o, thud(S, S.rand(95, 120), 0.02, { noise: 0.5, nf: 1200 }), 0, 0.6);
      S.mix(o, S.norm(S.modes(0.25, [[S.rand(170, 220), 0.05, 1], [S.rand(400, 460), 0.035, 0.7], [S.rand(800, 900), 0.02, 0.35]], S.burst(0.006, 0.001)), 1), 0, 0.7);
      break;
    }
    case 'carpet': {
      const n = S.burst(0.12, 0.02, 0.004); S.lp(n, 650); S.mix(o, S.norm(n, 1), 0, 0.8);
      S.mix(o, S.thump(0.1, 120, 75, 0.01, 0.02, 0.003), 0, 0.5);
      S.mix(o, rustle(S, 0.08, 2500), 0.01, 0.12);
      break;
    }
    case 'tile': {
      S.mix(o, thud(S, S.rand(90, 110), 0.012, { noise: 0.6, nf: 1500 }), 0, 0.6);
      S.mix(o, S.norm(S.click(S.rand(3000, 4000), 3, 0.003, 0.03), 1), 0, 0.55);
      S.mix(o, S.norm(S.modes(0.15, [[S.rand(1700, 2000), 0.02, 1], [S.rand(3000, 3300), 0.012, 0.5]], S.burst(0.002, 0.0004)), 1), 0, 0.25);
      break;
    }
    case 'gravel': {
      S.mix(o, thud(S, 90, 0.015, { noise: 0.7, nf: 1000 }), 0, 0.5);
      const len = S.rand(0.08, 0.13);
      for (let k = 0; k < 34; k++) S.mix(o, S.click(S.rand(1500, 6000), 2.5, S.rand(0.0008, 0.003), 0.015), S.rand(0, len), S.rand(0.1, 0.5));
      break;
    }
    case 'grass': {
      const n = S.noise(0.15); S.bp(n, S.rand(2200, 3200), 0.8); S.mul(n, (t) => Math.sin(Math.PI * t / 0.15) ** 2);
      S.mix(o, S.norm(n, 1), 0, 0.6);
      for (let k = 0; k < 8; k++) S.mix(o, S.click(S.rand(2000, 6000), 2, 0.001, 0.01), S.rand(0, 0.1), S.rand(0.1, 0.3));
      S.mix(o, thud(S, 80, 0.015, { noise: 0.5, nf: 400 }), 0, 0.35);
      break;
    }
    case 'water': {
      const n = S.noise(0.25); S.bp(n, S.rand(1200, 1800), 0.7); S.mul(n, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.06));
      S.mix(o, S.norm(n, 1), 0, 0.7);
      for (let k = 0; k < 6; k++) S.mix(o, bubble(S, S.rand(400, 1200), S.rand(0.02, 0.05)), S.rand(0.01, 0.15), S.rand(0.2, 0.5));
      S.mix(o, thud(S, 70, 0.03, { noise: 0.6, nf: 500 }), 0, 0.4);
      break;
    }
  }
  return S.mul(o, amp);
}

function footstep(S, surf) {
  const o = S.buf(0.45);
  S.mix(o, strike(S, surf, 1), 0, 1);
  S.mix(o, strike(S, surf, 1), S.rand(0.03, 0.055), S.rand(0.35, 0.55));
  return o;
}

const STEP = { v: 6, group: 'step', dist: 'step', prio: 0.25, peak: 0.22, maxInst: 8, burst: 3, fadeIn: 0.0015 };
for (const surf of ['concrete', 'metal', 'wood', 'carpet', 'tile', 'gravel', 'grass', 'water']) {
  WORLD_SOUNDS['step_' + surf] = { ...STEP, gen: (S) => footstep(S, surf) };
}
WORLD_SOUNDS.step_carpet.peak = 0.15;
WORLD_SOUNDS.step_metal.peak = 0.25;
WORLD_SOUNDS.land_concrete = { ...STEP, v: 4, peak: 0.38, gen: (S) => {
  const o = S.buf(0.5);
  S.mix(o, thud(S, S.rand(60, 75), 0.04, { noise: 0.9, nf: 900 }), 0, 1);
  S.mix(o, strike(S, 'concrete', 1), 0, 0.7);
  S.mix(o, strike(S, 'concrete', 1), S.rand(0.015, 0.03), 0.6);
  for (let k = 0; k < 4; k++) S.mix(o, clack(S, S.rand(2000, 3500), { tau: 0.006, dur: 0.03 }), S.rand(0.01, 0.06), 0.08);
  S.mix(o, rustle(S, 0.15, 1800), 0, 0.15);
  return o;
} };
WORLD_SOUNDS.step_tank = { ...STEP, v: 4, peak: 0.9, dist: 'stepBig', prio: 0.7, maxInst: 4, burst: 2, gen: (S) => {
  const d = 1.1, o = S.buf(d);
  S.mix(o, S.thump(d, 90, S.rand(30, 36), 0.05, 0.16, 0.004), 0, 1);
  const n = S.burst(d, 0.07, 0.003); S.lp(n, 420); S.mix(o, S.norm(n, 1), 0, 0.7);
  const r = S.brown(d); S.lp(r, 180); S.mul(r, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.3)); S.mix(o, S.norm(r, 1), 0, 0.5);
  S.mix(o, debris(S, d, 10, { t0: 0.04, fLo: 900, fHi: 3000, chunky: 0.5 }), 0, 0.12);
  S.sat(o, 1.8);
  return o;
} };
export { curve };
