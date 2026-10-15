// Weapon, melee, impact and explosion recipes.
import { clack, tick, thud, whoosh, squelch, crackle, debris, shards, scrape, rustle, beep, engine, splat, monoLoop } from './kit.js';

/**
 * Layered gunshot: crack (supersonic snap) + blast body (falling lowpass noise) + sub thump +
 * mechanical action + environment tail with slap-back echoes, all driven through saturation.
 */
export function gun(S, p) {
  const dur = p.dur, out = S.buf(dur);
  const j = (x, f = 0.06) => S.jit(x, f);
  if (p.crack) {
    const c = S.burst(0.03, j(p.crackTau ?? 0.0022));
    S.hp(c, p.crackF ?? 2000, 0.8);
    S.mix(out, S.norm(c, 1), 0, p.crack);
  }
  {
    const bd = Math.min(dur, 0.7);
    const b = S.noise(bd), f0 = j(p.bodyF0), f1 = j(p.bodyF1), tauF = p.bodyTauF ?? 0.035, tau = j(p.bodyTau);
    S.lp(b, (t) => f1 + (f0 - f1) * Math.exp(-t / tauF), 0.8);
    S.mul(b, (t) => (t < 0.0007 ? t / 0.0007 : Math.exp(-(t - 0.0007) / tau)));
    S.mix(out, S.norm(b, 1), 0, p.body ?? 1);
  }
  if (p.tube) { // grenade launcher style resonant pop
    const tb = S.burst(0.25, 0.03); S.bp(tb, j(p.tube), 5); S.mix(out, S.norm(tb, 1), 0, p.tubeAmp ?? 0.6);
  }
  if (p.mech) {
    for (const [t, f, a] of p.mechs || [[0.001, p.mechF ?? 2800, 1]]) S.mix(out, clack(S, j(f), { tau: 0.01, dur: 0.06 }), t, p.mech * a);
  }
  if (p.tail) {
    const tl = S.noise(dur), tau = j(p.tailTau), tf = p.tailF ?? 1600;
    S.lp(tl, (t) => tf * (0.3 + 0.7 * Math.exp(-t / (tau * 1.6))), 0.7);
    const fl = S.wobble(dur, p.flutter ?? 16);
    S.mul(tl, (t) => Math.min(1, t / 0.015) * Math.exp(-t / tau));
    for (let i = 0; i < tl.length; i++) tl[i] *= 0.55 + 0.45 * fl[i];
    S.mix(out, S.norm(tl, 1), 0.003, p.tail);
  }
  if (p.echo) {
    const src = out.slice(0, S.len(0.1));
    S.lp(src, p.echoF ?? 1500); S.hp(src, 120);
    for (const [dt, g] of p.echo) S.mix(out, src, j(dt, 0.12), g);
  }
  S.hp(out, 28);
  S.sat(out, p.drive ?? 2.5);
  // sub "weight" added after the grit stage so it stays a clean pitched punch, then glue
  if (p.thump) {
    const th = S.thump(Math.min(dur, 0.9), j(p.thumpF0), j(p.thumpF1), p.thumpTauF ?? 0.025, j(p.thumpTau), 0.0008);
    S.sat(th, 1.3);
    S.mix(out, th, 0, p.thump * 0.85);
  }
  S.sat(out, 1.4);
  return out;
}

const GUNS = {
  pistol_fire: { dur: 0.75, crack: 0.9, crackF: 2200, body: 1, bodyF0: 6500, bodyF1: 650, bodyTau: 0.022, thump: 0.75, thumpF0: 150, thumpF1: 58, thumpTau: 0.045, mech: 0.18, mechF: 3300, tail: 0.22, tailTau: 0.13, tailF: 1900, echo: [[0.11, 0.12], [0.23, 0.07]], drive: 2.6 },
  dual_pistol_fire: { dur: 0.75, crack: 0.95, crackF: 2400, body: 1, bodyF0: 7000, bodyF1: 700, bodyTau: 0.02, thump: 0.7, thumpF0: 160, thumpF1: 62, thumpTau: 0.04, mech: 0.22, mechs: [[0.001, 3400, 1], [0.03, 2600, 0.5]], tail: 0.22, tailTau: 0.13, tailF: 2000, echo: [[0.1, 0.12], [0.21, 0.07]], drive: 2.6 },
  magnum_fire: { dur: 1.5, crack: 1, crackF: 1800, body: 1.1, bodyF0: 5200, bodyF1: 360, bodyTau: 0.045, bodyTauF: 0.05, thump: 1.1, thumpF0: 120, thumpF1: 38, thumpTau: 0.09, mech: 0.12, mechF: 2600, tail: 0.36, tailTau: 0.32, tailF: 1400, echo: [[0.14, 0.2], [0.29, 0.12], [0.47, 0.07]], drive: 3.4 },
  smg_fire: { dur: 0.45, crack: 0.7, crackF: 2600, body: 1, bodyF0: 7500, bodyF1: 900, bodyTau: 0.017, thump: 0.5, thumpF0: 170, thumpF1: 72, thumpTau: 0.032, mech: 0.3, mechs: [[0.001, 2700, 1], [0.035, 3600, 0.4]], tail: 0.18, tailTau: 0.075, tailF: 2200, echo: [[0.08, 0.08]], drive: 2.2 },
  smg_silenced_fire: { dur: 0.35, crack: 0.12, crackF: 3500, body: 0.8, bodyF0: 1900, bodyF1: 380, bodyTau: 0.02, thump: 0.45, thumpF0: 130, thumpF1: 60, thumpTau: 0.03, mech: 0.75, mechs: [[0.001, 2400, 1], [0.028, 3100, 0.7]], tail: 0.05, tailTau: 0.05, tailF: 1200, drive: 1.4 },
  pump_shotgun_fire: { dur: 1.35, crack: 0.85, crackF: 1300, body: 1.25, bodyF0: 4600, bodyF1: 300, bodyTau: 0.06, bodyTauF: 0.06, thump: 1.1, thumpF0: 100, thumpF1: 36, thumpTau: 0.1, mech: 0.1, mechF: 2000, tail: 0.4, tailTau: 0.26, tailF: 1250, echo: [[0.13, 0.22], [0.27, 0.13], [0.44, 0.07]], drive: 3.5 },
  chrome_shotgun_fire: { dur: 1.3, crack: 0.9, crackF: 1500, body: 1.2, bodyF0: 5600, bodyF1: 340, bodyTau: 0.055, bodyTauF: 0.055, thump: 1.05, thumpF0: 108, thumpF1: 40, thumpTau: 0.095, mech: 0.12, mechF: 2300, tail: 0.36, tailTau: 0.24, tailF: 1400, echo: [[0.12, 0.2], [0.25, 0.12], [0.41, 0.06]], drive: 3.4 },
  auto_shotgun_fire: { dur: 1.05, crack: 0.9, crackF: 1400, body: 1.2, bodyF0: 5000, bodyF1: 320, bodyTau: 0.05, thump: 1.05, thumpF0: 104, thumpF1: 40, thumpTau: 0.085, mech: 0.35, mechs: [[0.001, 2000, 0.6], [0.06, 1700, 1], [0.09, 2600, 0.6]], tail: 0.32, tailTau: 0.18, tailF: 1400, echo: [[0.12, 0.16], [0.24, 0.09]], drive: 3.3 },
  spas_fire: { dur: 1.05, crack: 0.95, crackF: 1500, body: 1.2, bodyF0: 5400, bodyF1: 300, bodyTau: 0.05, thump: 1.1, thumpF0: 96, thumpF1: 37, thumpTau: 0.09, mech: 0.35, mechs: [[0.001, 2200, 0.6], [0.07, 1500, 1], [0.1, 2900, 0.5]], tail: 0.33, tailTau: 0.19, tailF: 1300, echo: [[0.13, 0.17], [0.26, 0.09]], drive: 3.4 },
  m16_fire: { dur: 0.8, crack: 1, crackF: 3000, body: 1, bodyF0: 7200, bodyF1: 720, bodyTau: 0.021, thump: 0.65, thumpF0: 155, thumpF1: 60, thumpTau: 0.04, mech: 0.18, mechs: [[0.001, 3000, 1], [0.045, 2400, 0.5]], tail: 0.25, tailTau: 0.14, tailF: 2000, echo: [[0.11, 0.12], [0.22, 0.07]], drive: 2.8 },
  ak47_fire: { dur: 0.9, crack: 0.9, crackF: 2200, body: 1.1, bodyF0: 5600, bodyF1: 500, bodyTau: 0.03, thump: 0.9, thumpF0: 122, thumpF1: 48, thumpTau: 0.055, mech: 0.2, mechs: [[0.001, 2500, 1], [0.05, 1900, 0.6]], tail: 0.3, tailTau: 0.17, tailF: 1600, echo: [[0.12, 0.14], [0.25, 0.08]], drive: 3.1 },
  scar_fire: { dur: 0.85, crack: 1, crackF: 2600, body: 1.05, bodyF0: 6500, bodyF1: 600, bodyTau: 0.026, thump: 0.8, thumpF0: 138, thumpF1: 52, thumpTau: 0.05, mech: 0.2, mechs: [[0.001, 2800, 1], [0.04, 2100, 0.5]], tail: 0.28, tailTau: 0.15, tailF: 1800, echo: [[0.11, 0.13], [0.23, 0.07]], drive: 3 },
  hunting_rifle_fire: { dur: 1.7, crack: 1, crackF: 2600, body: 1.1, bodyF0: 6000, bodyF1: 420, bodyTau: 0.04, thump: 0.95, thumpF0: 125, thumpF1: 40, thumpTau: 0.075, mech: 0.12, mechF: 2400, tail: 0.42, tailTau: 0.42, tailF: 1500, flutter: 9, echo: [[0.16, 0.22], [0.34, 0.14], [0.58, 0.08]], drive: 3.2 },
  sniper_fire: { dur: 2.1, crack: 1.1, crackF: 3200, crackTau: 0.003, body: 1.15, bodyF0: 6200, bodyF1: 330, bodyTau: 0.05, bodyTauF: 0.05, thump: 1.1, thumpF0: 110, thumpF1: 32, thumpTau: 0.11, mech: 0.1, mechF: 2200, tail: 0.48, tailTau: 0.5, tailF: 1300, flutter: 7, echo: [[0.18, 0.25], [0.39, 0.16], [0.66, 0.1], [0.95, 0.05]], drive: 3.6 },
  grenade_launcher_fire: { dur: 0.95, crack: 0.15, crackF: 3000, body: 0.7, bodyF0: 1600, bodyF1: 260, bodyTau: 0.035, thump: 1.1, thumpF0: 240, thumpF1: 70, thumpTauF: 0.03, thumpTau: 0.07, tube: 330, tubeAmp: 0.55, mech: 0.35, mechs: [[0.001, 1500, 1], [0.05, 2300, 0.4]], tail: 0.16, tailTau: 0.16, tailF: 1000, echo: [[0.12, 0.1]], drive: 2.2 },
  m60_fire: { dur: 0.8, crack: 0.95, crackF: 2000, body: 1.15, bodyF0: 5100, bodyF1: 460, bodyTau: 0.032, thump: 1, thumpF0: 112, thumpF1: 44, thumpTau: 0.055, mech: 0.3, mechs: [[0.001, 2300, 1], [0.04, 3300, 0.5], [0.055, 1800, 0.4]], tail: 0.3, tailTau: 0.15, tailF: 1600, echo: [[0.11, 0.14], [0.22, 0.08]], drive: 3.3 },
};

const GUN_DEF = { v: 4, sr: 32000, peak: 0.97, dist: 'gun', prio: 0.8, maxInst: 8, burst: 3, group: 'weapon', fadeIn: 0.0004, fadeOut: 0.02 };

export const WEAPON_SOUNDS = {};
for (const [name, p] of Object.entries(GUNS)) {
  WEAPON_SOUNDS[name] = { ...GUN_DEF, gen: (S) => gun(S, p) };
}
WEAPON_SOUNDS.smg_silenced_fire.peak = 0.7;
WEAPON_SOUNDS.smg_silenced_fire.dist = 'impact';
WEAPON_SOUNDS.grenade_launcher_fire.peak = 0.85;

const MECH = { v: 3, peak: 0.45, dist: 'mech', prio: 0.55, group: 'weapon', maxInst: 4, burst: 2 };
Object.assign(WEAPON_SOUNDS, {
  dry_fire: { ...MECH, peak: 0.4, gen: (S) => {
    const o = S.buf(0.14);
    S.mix(o, clack(S, S.jit(3200, 0.05), { tau: 0.008, dur: 0.05 }), 0, 1);
    S.mix(o, clack(S, S.jit(1900, 0.05), { tau: 0.012, dur: 0.06 }), 0.013, 0.55);
    return o;
  } },
  reload_mag_out: { ...MECH, gen: (S) => {
    const o = S.buf(0.4);
    S.mix(o, clack(S, S.jit(3000), { tau: 0.007 }), 0, 0.8);
    S.mix(o, scrape(S, 0.07, 2600, 3), 0.01, 0.35);
    S.mix(o, clack(S, S.jit(1500), { tau: 0.02, dur: 0.12, ratios: [1, 1.37, 2.9] }), 0.075, 0.9);
    S.mix(o, clack(S, S.jit(2300), { tau: 0.01 }), 0.105, 0.35);
    return o;
  } },
  reload_mag_in: { ...MECH, gen: (S) => {
    const o = S.buf(0.4);
    S.mix(o, scrape(S, 0.08, 2000, 2.5), 0, 0.4);
    S.mix(o, thud(S, 210, 0.02, { noise: 0.4, nf: 1200 }), 0.075, 0.6);
    S.mix(o, clack(S, S.jit(1250), { tau: 0.018, dur: 0.1, ratios: [1, 2.13, 3.3] }), 0.075, 1);
    S.mix(o, clack(S, S.jit(2900), { tau: 0.008 }), 0.081, 0.5);
    return o;
  } },
  reload_bolt: { ...MECH, peak: 0.55, gen: (S) => {
    const o = S.buf(0.5);
    S.mix(o, clack(S, S.jit(2200), { tau: 0.01 }), 0, 0.7);
    S.mix(o, scrape(S, 0.06, 3000, 2), 0.01, 0.35);
    S.mix(o, clack(S, S.jit(1600), { tau: 0.016, dur: 0.1 }), 0.085, 0.8);
    const spring = S.noise(0.08); S.bp(spring, (t) => 2500 + t * 30000, 6); S.mul(spring, (t) => Math.sin(Math.PI * t / 0.08));
    S.mix(o, S.norm(spring, 1), 0.17, 0.25);
    S.mix(o, thud(S, 160, 0.025, { noise: 0.3 }), 0.23, 0.6);
    S.mix(o, clack(S, S.jit(1300), { tau: 0.022, dur: 0.12, ratios: [1, 2.05, 2.8] }), 0.23, 1);
    S.mix(o, clack(S, S.jit(2700), { tau: 0.01 }), 0.235, 0.5);
    return o;
  } },
  pistol_slide: { ...MECH, gen: (S) => {
    const o = S.buf(0.32);
    S.mix(o, clack(S, S.jit(2600), { tau: 0.009 }), 0, 0.7);
    S.mix(o, scrape(S, 0.06, 3400, 3), 0.008, 0.3);
    S.mix(o, clack(S, S.jit(2000), { tau: 0.014, dur: 0.09 }), 0.1, 1);
    S.mix(o, thud(S, 230, 0.015, { noise: 0.3 }), 0.1, 0.4);
    return o;
  } },
  shotgun_shell_insert: { ...MECH, peak: 0.4, gen: (S) => {
    const o = S.buf(0.22);
    S.mix(o, tick(S, S.jit(900), 2, 0.006), 0, 0.6);
    S.mix(o, scrape(S, 0.05, 1600, 2), 0.005, 0.4);
    S.mix(o, clack(S, S.jit(2100), { tau: 0.01 }), 0.05, 0.9);
    S.mix(o, thud(S, 260, 0.012, { noise: 0.2 }), 0.05, 0.4);
    return o;
  } },
  shotgun_pump: { ...MECH, peak: 0.6, gen: (S) => {
    const o = S.buf(0.45);
    S.mix(o, scrape(S, 0.08, 1800, 2.5, 0.8), 0, 0.45);
    S.mix(o, clack(S, S.jit(1100), { tau: 0.025, dur: 0.12, ratios: [1, 1.82, 3.1] }), 0.07, 1);
    S.mix(o, thud(S, 180, 0.02, { noise: 0.4 }), 0.07, 0.5);
    S.mix(o, scrape(S, 0.07, 2100, 2.5, 0.8), 0.15, 0.4);
    S.mix(o, clack(S, S.jit(1450), { tau: 0.022, dur: 0.12, ratios: [1, 1.9, 2.95] }), 0.21, 1);
    S.mix(o, thud(S, 200, 0.02, { noise: 0.4 }), 0.21, 0.55);
    return o;
  } },
  weapon_deploy: { ...MECH, gen: (S) => {
    const o = S.buf(0.5);
    S.mix(o, rustle(S, 0.3, 2000), 0, 0.5);
    S.mix(o, clack(S, S.jit(2400), { tau: 0.012 }), 0.1, 0.6);
    S.mix(o, clack(S, S.jit(1700), { tau: 0.016, dur: 0.1 }), 0.24, 0.8);
    S.mix(o, thud(S, 190, 0.02, { noise: 0.3 }), 0.24, 0.35);
    return o;
  } },
  shell_casing: { ...MECH, v: 5, peak: 0.22, dist: 'step', prio: 0.1, maxInst: 6, burst: 2, gen: (S) => {
    const o = S.buf(0.75), f = S.rand(3200, 4300);
    const ratios = [1, 2.31, 3.86, 5.4];
    let t = 0, a = 1, gap = S.rand(0.09, 0.13);
    for (let k = 0; k < 6; k++) {
      const m = S.modes(0.3, ratios.map((r, i) => [f * r * S.jit(1, 0.01), 0.12 / (i + 1) * a + 0.01, 1 / (i + 1)]), S.burst(0.002, 0.0003));
      S.mix(o, S.norm(m, 1), t, a);
      t += gap; gap *= S.rand(0.55, 0.75); a *= 0.55;
    }
    return o;
  } },
  shotgun_shell_drop: { ...MECH, v: 4, peak: 0.22, dist: 'step', prio: 0.1, maxInst: 4, burst: 2, gen: (S) => {
    const o = S.buf(0.6), f = S.rand(700, 950);
    let t = 0, a = 1, gap = S.rand(0.12, 0.16);
    for (let k = 0; k < 4; k++) {
      const m = S.modes(0.15, [[f, 0.02, 1], [f * 2.4, 0.012, 0.5], [2900, 0.02, 0.35 * a]], S.burst(0.003, 0.0006));
      S.mix(o, S.norm(m, 1), t, a);
      t += gap; gap *= 0.6; a *= 0.5;
    }
    return o;
  } },
});

// ---------------------------------------------------------------- chainsaw
const SAW = { group: 'weapon', dist: 'gun', prio: 0.75, maxInst: 2, burst: 1 };
Object.assign(WEAPON_SOUNDS, {
  chainsaw_start: { ...SAW, peak: 0.85, gen: (S) => {
    const d = 2.8, o = S.buf(d);
    // two cord pulls: ratchet clicks accelerating + rope whir
    for (const [t0, len] of [[0, 0.42], [0.62, 0.38]]) {
      let t = t0, gap = 0.03;
      while (t < t0 + len) { S.mix(o, clack(S, S.jit(2200, 0.1), { tau: 0.004, dur: 0.03 }), t, 0.35); t += gap; gap = Math.max(0.014, gap * 0.88); }
      const wh = whoosh(S, len, 600, 2400, 2.5, 0.6); S.mix(o, wh, t0, 0.3);
      S.mix(o, engine(S, len, (t) => 300 + t * 1800, { misfire: 0.5 }), t0 + 0.05, 0.3);
    }
    // catches: sputter -> rev -> idle
    const st = 1.05;
    const rpm = (t) => t < 0.35 ? 1400 + 2000 * (t / 0.35) : t < 0.8 ? 3400 + 5200 * Math.sin(Math.PI * (t - 0.35) / 0.9) : 2700 + 5000 * Math.exp(-(t - 0.8) / 0.25);
    const e = engine(S, d - st, rpm, { misfire: 0.08, chain: 0.25 });
    const el = d - st;
    S.mul(e, (t) => Math.min(1, t / 0.05) * (t < 0.35 ? 0.6 : 1) * Math.min(1, (el - t) / 0.12));
    S.mix(o, e, st, 0.95);
    return o;
  } },
  chainsaw_idle: { ...SAW, loop: true, gain: 0.8, gen: (S) => monoLoop(S, 2, 0.25, (d) => engine(S, d, (t) => 2700 + 180 * Math.sin(t * 7.1) + 120 * Math.sin(t * 2.3), { misfire: 0.04 })) },
  chainsaw_rev: { ...SAW, loop: true, gen: (S) => monoLoop(S, 2, 0.25, (d) => engine(S, d, (t) => 9200 + 300 * Math.sin(t * 9.3), { chain: 0.5, bright: 1.2 })) },
  chainsaw_cut: { ...SAW, loop: true, gen: (S) => monoLoop(S, 2, 0.25, (d) => {
    const e = engine(S, d, (t) => 7400 + 700 * Math.sin(t * 13.1) + 500 * Math.sin(t * 5.3), { chain: 0.8, load: 1, bright: 1.1 });
    S.add(e, S.norm(crackle(S, d, 70, { fLo: 400, fHi: 1800, tauLo: 0.003, tauHi: 0.012, q: 1.5 }), 0.5));
    const grind = S.noise(d); S.bp(grind, 900, 0.8); const w = S.wobble(d, 20);
    for (let i = 0; i < grind.length; i++) grind[i] *= Math.abs(w[i]);
    S.add(e, S.norm(grind, 0.45));
    return S.norm(e, 1);
  }) },
});

// ---------------------------------------------------------------- melee & shove
const MELEE = { v: 4, group: 'weapon', dist: 'impact', prio: 0.6, maxInst: 4, burst: 2 };
Object.assign(WEAPON_SOUNDS, {
  melee_swing: { ...MELEE, peak: 0.5, gen: (S) => whoosh(S, S.rand(0.24, 0.32), S.rand(250, 400), S.rand(1400, 2200), 1.3, S.rand(0.4, 0.55)) },
  melee_hit_flesh: { ...MELEE, peak: 0.85, gen: (S) => {
    const o = S.buf(0.38);
    S.mix(o, thud(S, S.rand(85, 105), 0.04, { noise: 0.8, nf: 600 }), 0, 1);
    S.mix(o, squelch(S, 0.16, S.rand(700, 1000)), 0.003, 0.7);
    S.mix(o, crackle(S, 0.06, 10, { fLo: 1500, fHi: 4000 }), 0.004, 0.3);
    S.sat(o, 1.6);
    return o;
  } },
  melee_hit_world: { ...MELEE, peak: 0.75, gen: (S) => {
    const o = S.buf(0.45), f = S.rand(380, 520);
    S.mix(o, S.norm(S.modes(0.4, [[f, 0.07, 1], [f * 2.45, 0.05, 0.6], [f * 4.9, 0.03, 0.4], [f * 7.3, 0.02, 0.2]], S.burst(0.004, 0.0008)), 1), 0, 0.8);
    S.mix(o, thud(S, 120, 0.03, { noise: 0.7, nf: 1200 }), 0, 0.8);
    S.mix(o, crackle(S, 0.1, 8, { fLo: 2000, fHi: 5000 }), 0.005, 0.2);
    return o;
  } },
  melee_blade_hit: { ...MELEE, peak: 0.8, gen: (S) => {
    const o = S.buf(0.55);
    const sw = S.noise(0.07); S.hp(sw, 3000); S.mul(sw, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.02));
    S.mix(o, S.norm(sw, 1), 0, 0.5);
    S.mix(o, squelch(S, 0.2, S.rand(1100, 1500), { chatter: 70 }), 0.008, 0.8);
    S.mix(o, crackle(S, 0.09, 14, { fLo: 1200, fHi: 3500, q: 1.5 }), 0.01, 0.4);
    S.mix(o, thud(S, 110, 0.03, { noise: 0.6 }), 0.005, 0.6);
    const f = S.rand(2600, 3300);
    S.mix(o, S.norm(S.modes(0.5, [[f, 0.18, 1], [f * 1.93, 0.12, 0.6], [f * 2.71, 0.08, 0.4]], S.burst(0.003, 0.0005)), 1), 0, 0.18);
    return o;
  } },
  shove: { ...MELEE, peak: 0.6, gen: (S) => {
    const o = S.buf(0.4);
    S.mix(o, whoosh(S, 0.22, 250, 1100, 1.2, 0.5), 0, 0.7);
    S.mix(o, rustle(S, 0.2, 1800), 0.02, 0.25);
    S.mix(o, thud(S, S.rand(75, 95), 0.05, { noise: 0.6, nf: 700 }), 0.12, 0.85);
    return o;
  } },
  shove_hit: { ...MELEE, peak: 0.75, gen: (S) => {
    const o = S.buf(0.32);
    S.mix(o, thud(S, S.rand(70, 90), 0.06, { noise: 0.8, nf: 600 }), 0, 1);
    S.mix(o, tick(S, 1500, 1.2, 0.006), 0, 0.35);
    S.mix(o, rustle(S, 0.15, 1500), 0.01, 0.25);
    S.sat(o, 1.4);
    return o;
  } },
});

// ---------------------------------------------------------------- impacts
const IMP = { v: 4, group: 'impact', dist: 'impact', prio: 0.35, maxInst: 6, burst: 3, peak: 0.55 };
Object.assign(WEAPON_SOUNDS, {
  bullet_impact_concrete: { ...IMP, gen: (S) => {
    const o = S.buf(0.45);
    const c = S.burst(0.04, 0.002); S.hp(c, 1500); S.mix(o, S.norm(c, 1), 0, 0.9);
    const th = S.burst(0.08, 0.012); S.bp(th, S.rand(700, 1000), 1.2); S.mix(o, S.norm(th, 1), 0, 0.6);
    S.mix(o, crackle(S, 0.4, 22, { t0: 0.01, t1: 0.35, fLo: 2000, fHi: 7000, decay: 2 }), 0, 0.35);
    const dust = S.noise(0.4); S.hp(dust, 3000); S.mul(dust, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.08));
    S.mix(o, S.norm(dust, 1), 0, 0.15);
    return o;
  } },
  bullet_impact_metal: { ...IMP, peak: 0.55, gen: (S) => {
    const o = S.buf(0.7), f = S.rand(1500, 2600);
    S.mix(o, S.norm(S.modes(0.7, [[f, 0.35, 1], [f * 2.41, 0.2, 0.7], [f * 3.93, 0.12, 0.5], [f * 5.6, 0.07, 0.3]], S.burst(0.002, 0.0003)), 1), 0, 0.7);
    const c = S.burst(0.03, 0.0015); S.hp(c, 2500); S.mix(o, S.norm(c, 1), 0, 0.8);
    S.mix(o, thud(S, 300, 0.012, { noise: 0.3 }), 0, 0.3);
    return o;
  } },
  bullet_impact_wood: { ...IMP, gen: (S) => {
    const o = S.buf(0.35), f = S.rand(350, 480);
    S.mix(o, S.norm(S.modes(0.3, [[f, 0.05, 1], [f * 2.3, 0.035, 0.6], [f * 4.4, 0.02, 0.4]], S.burst(0.004, 0.0008)), 1), 0, 0.9);
    const c = S.burst(0.03, 0.002); S.hp(c, 1800); S.mix(o, S.norm(c, 1), 0, 0.6);
    S.mix(o, crackle(S, 0.15, 12, { fLo: 1200, fHi: 4000, decay: 1.5 }), 0.004, 0.35);
    return o;
  } },
  bullet_impact_flesh: { ...IMP, peak: 0.5, gen: (S) => {
    const o = S.buf(0.28);
    S.mix(o, thud(S, S.rand(110, 140), 0.025, { noise: 0.9, nf: 1100 }), 0, 1);
    S.mix(o, squelch(S, 0.12, S.rand(650, 900), { chatter: 60 }), 0.002, 0.6);
    return o;
  } },
  bullet_impact_glass: { ...IMP, peak: 0.5, gen: (S) => {
    const o = S.buf(0.8);
    const c = S.burst(0.03, 0.0015); S.hp(c, 3000); S.mix(o, S.norm(c, 1), 0, 0.8);
    S.mix(o, shards(S, 0.75, 14, 0.005), 0, 0.8);
    return o;
  } },
  headshot: { ...IMP, peak: 0.8, prio: 0.6, gen: (S) => {
    const o = S.buf(0.42);
    const c = S.burst(0.02, 0.0012); S.hp(c, 2500); S.mix(o, S.norm(c, 1), 0, 0.8);
    S.mix(o, S.thump(0.12, 380, 120, 0.01, 0.025), 0, 0.7);
    S.mix(o, squelch(S, 0.3, S.rand(1200, 1600), { chatter: 70, q: 1 }), 0.002, 0.9);
    S.mix(o, crackle(S, 0.08, 14, { fLo: 1500, fHi: 5000 }), 0.003, 0.35);
    S.mix(o, thud(S, 90, 0.04, { noise: 0.6 }), 0, 0.5);
    S.sat(o, 1.5);
    return o;
  } },
  ricochet: { ...IMP, peak: 0.45, gen: (S) => {
    const d = S.rand(0.45, 0.65), o = S.buf(d);
    const f0 = S.rand(3600, 4600), f1 = S.rand(900, 1300);
    const F = (t) => f1 + (f0 - f1) * Math.exp(-t / (d * 0.35));
    const w = S.osc('sine', d, (t) => F(t) * (1 + 0.012 * Math.sin(t * 190)));
    const nb = S.noise(d); S.bp(nb, F, 12);
    S.add(w, S.norm(nb, 0.6));
    S.mul(w, (t) => Math.min(1, t / 0.02) * Math.exp(-t / (d * 0.4)));
    S.mix(o, S.norm(w, 1), 0.01, 0.7);
    S.mix(o, clack(S, S.rand(2500, 3500), { tau: 0.03 }), 0, 0.6);
    return o;
  } },
});

// ---------------------------------------------------------------- explosions
function explosion(S, size) {
  const d = 1.4 + 2.2 * size, o = S.buf(d);
  const c = S.burst(0.05, 0.004); S.hp(c, 1000); S.mix(o, S.norm(c, 1), 0, 0.8);
  const body = S.noise(d);
  S.lp(body, (t) => 180 + 6500 * Math.exp(-t / (0.12 + 0.12 * size)), 0.7);
  S.mul(body, (t) => Math.min(1, t / 0.003) * Math.exp(-t / (0.25 + 0.35 * size)));
  S.mix(o, S.norm(body, 1), 0, 1);
  const br = S.brown(d); S.lp(br, 400);
  const fl = S.wobble(d, 6);
  S.mul(br, (t) => Math.min(1, t / 0.02) * Math.exp(-t / (0.5 + 0.8 * size)));
  for (let i = 0; i < br.length; i++) br[i] *= 0.6 + 0.4 * fl[i];
  S.mix(o, S.norm(br, 1), 0, 0.9);
  S.mix(o, debris(S, d, Math.round(18 + 34 * size), { t0: 0.15, chunky: 0.45 }), 0, 0.28);
  S.hp(o, 22);
  S.sat(o, 2.2);
  // sub-bass push (kept out of the saturator so it doesn't turn into a buzzing square wave)
  const sub = S.thump(d, 75, 30 + 8 * (1 - size), 0.12, 0.25 + 0.25 * size, 0.004);
  const subN = S.brown(d); S.lp(subN, 90); S.mul(subN, (t) => Math.min(1, t / 0.01) * Math.exp(-t / (0.4 + 0.5 * size)));
  S.add(sub, S.norm(subN, 0.6));
  S.mix(o, S.sat(sub, 1.2), 0, 0.75);
  S.sat(o, 1.3);
  return o;
}
Object.assign(WEAPON_SOUNDS, {
  explosion: { v: 3, group: 'weapon', dist: 'boom', prio: 0.95, peak: 0.98, maxInst: 4, burst: 2, fadeOut: 0.05, gen: (S) => explosion(S, 1) },
  explosion_small: { v: 3, group: 'weapon', dist: 'gun', prio: 0.85, peak: 0.9, maxInst: 4, burst: 2, fadeOut: 0.04, gen: (S) => explosion(S, 0.35) },
  laser_sight_on: { v: 1, group: 'weapon', dist: 'mech', peak: 0.3, prio: 0.5, gen: (S) => {
    const o = S.buf(0.16);
    S.mix(o, tick(S, 2600, 4, 0.003), 0, 0.6);
    const b = beep(S, 0.07, (t) => 2400 - t * 8000, 'square', 5000);
    S.crush(b, 5);
    S.mix(o, b, 0.03, 0.6);
    return o;
  } },
});

export { splat };
