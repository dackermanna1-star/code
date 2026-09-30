import {
  SR, ad, biquad, brown, buf, click, drive, echo, env, fadeIn, fadeOut, gain, mix, modal, normalize, onepole, osc, pink, rnd, rr, srand, sweep, voice, white,
} from './Synth';

interface GunParams {
  len: number;
  crack: number;
  crackHP: number;
  blast: number;
  blastDecay: number;
  blastLP: number;
  body: number;
  bodyF0: number;
  bodyF1: number;
  bodyDecay: number;
  boom: number;
  boomF: number;
  boomDecay: number;
  tail: number;
  tailDecay: number;
  tailLP: number;
  echo: number;
  drive: number;
  mech?: number;
  mechAt?: number;
  ring?: number;
  ringF?: number;
  peak?: number;
}

const GUN_BASE: GunParams = {
  len: 1.0, crack: 0.8, crackHP: 2500, blast: 1, blastDecay: 0.05, blastLP: 6000, body: 0.6, bodyF0: 220, bodyF1: 60, bodyDecay: 0.06,
  boom: 0.25, boomF: 52, boomDecay: 0.2, tail: 0.35, tailDecay: 0.5, tailLP: 900, echo: 0.35, drive: 2.2, peak: 0.95,
};

function gunshot(p: Partial<GunParams>, v: number) {
  const g = { ...GUN_BASE, ...p };
  const j = (x: number, amt = 0.08) => x * (1 + rnd() * amt);
  const len = g.len;
  const out = buf(len);
  // supersonic crack
  if (g.crack > 0) {
    const c = env(white(0.012), ad(0.0002, 0.0016));
    mix(out, biquad(c, 'hp', j(g.crackHP)), g.crack * 1.4);
  }
  // muzzle blast
  const b = env(white(Math.min(len, g.blastDecay * 8)), ad(0.0006, j(g.blastDecay)));
  mix(out, biquad(biquad(b, 'lp', j(g.blastLP)), 'hp', 90), g.blast);
  // pitched body thump
  const bd = env(osc(g.bodyDecay * 6, sweep(j(g.bodyF0), g.bodyF1, g.bodyDecay * 2)), ad(0.001, j(g.bodyDecay)));
  mix(out, bd, g.body);
  // sub boom
  if (g.boom > 0) {
    const bm = env(osc(g.boomDecay * 5, sweep(g.boomF * 1.6, g.boomF, 0.06)), ad(0.003, j(g.boomDecay)));
    mix(out, bm, g.boom);
    const bn = env(brown(g.boomDecay * 4), ad(0.002, g.boomDecay * 0.8));
    mix(out, biquad(bn, 'lp', 180), g.boom * 0.8);
  }
  // metallic ring (revolvers)
  if (g.ring) mix(out, modal(0.3, [[j(g.ringF ?? 3200, 0.05), 1, 0.06], [j((g.ringF ?? 3200) * 1.47, 0.05), 0.6, 0.04]]), g.ring * 0.3);
  // mechanical action noise
  if (g.mech) mix(out, click(0.03, 2600, 3, 0.004, 1), g.mech * 0.35, g.mechAt ?? 0.03);
  // rolling tail
  if (g.tail > 0) {
    const t = env(brown(len), ad(0.012, j(g.tailDecay)));
    mix(out, biquad(t, 'lp', g.tailLP), g.tail * 1.6);
  }
  let res: Float32Array = out;
  if (g.echo > 0) {
    const blastOnly = biquad(new Float32Array(out.subarray(0, Math.round(0.12 * SR))), 'lp', 1400);
    const e = buf(len);
    mix(e, blastOnly, g.echo * 0.45, 0.13 + rnd() * 0.02);
    mix(e, blastOnly, g.echo * 0.25, 0.27 + rnd() * 0.04);
    mix(e, blastOnly, g.echo * 0.12, 0.46 + rnd() * 0.05);
    for (let i = 0; i < res.length; i++) res[i] += e[i];
  }
  drive(res, g.drive);
  fadeOut(res, 0.05);
  return normalize(res, g.peak);
  void v;
}

const GUNS: Record<string, Partial<GunParams>> = {
  revolver: { crack: 0.9, blastDecay: 0.055, blastLP: 6200, body: 0.75, bodyF0: 220, bodyF1: 60, bodyDecay: 0.07, boom: 0.35, boomDecay: 0.18, tail: 0.4, tailDecay: 0.6, ring: 1, ringF: 3300, drive: 2.3 },
  pistol9: { len: 0.7, crack: 0.75, blastDecay: 0.032, blastLP: 7200, body: 0.5, bodyF0: 280, bodyF1: 95, bodyDecay: 0.04, boom: 0.12, tail: 0.25, tailDecay: 0.4, mech: 0.8, mechAt: 0.028, drive: 1.9 },
  pistol45: { len: 0.8, crack: 0.7, blastDecay: 0.04, blastLP: 6200, body: 0.65, bodyF0: 210, bodyF1: 70, bodyDecay: 0.05, boom: 0.22, tail: 0.3, tailDecay: 0.45, mech: 0.8, mechAt: 0.03, drive: 2.1 },
  deagle: { len: 1.2, crack: 1, blastDecay: 0.07, blastLP: 5600, body: 0.9, bodyF0: 180, bodyF1: 45, bodyDecay: 0.09, boom: 0.55, boomF: 46, boomDecay: 0.26, tail: 0.5, tailDecay: 0.8, mech: 0.6, drive: 2.8 },
  m500: { len: 1.4, crack: 1, blastDecay: 0.08, blastLP: 5200, body: 1, bodyF0: 170, bodyF1: 40, bodyDecay: 0.1, boom: 0.7, boomF: 42, boomDecay: 0.3, tail: 0.6, tailDecay: 0.9, ring: 0.8, ringF: 2800, drive: 3 },
  thunder: { len: 1.8, crack: 1, blastDecay: 0.1, blastLP: 5000, body: 1, bodyF0: 150, bodyF1: 34, bodyDecay: 0.14, boom: 0.85, boomF: 38, boomDecay: 0.4, tail: 0.75, tailDecay: 1.2, drive: 3.2 },
  shotgun: { len: 1.4, crack: 0.55, blastDecay: 0.11, blastLP: 3800, body: 0.95, bodyF0: 150, bodyF1: 45, bodyDecay: 0.1, boom: 0.65, boomF: 45, boomDecay: 0.3, tail: 0.6, tailDecay: 0.95, tailLP: 750, drive: 2.7 },
  shotgunDB: { len: 1.4, crack: 0.7, blastDecay: 0.1, blastLP: 4400, body: 0.95, bodyF0: 160, bodyF1: 45, bodyDecay: 0.1, boom: 0.6, boomDecay: 0.28, tail: 0.6, tailDecay: 0.95, drive: 2.8 },
  shotgunBig: { len: 1.7, crack: 0.5, blastDecay: 0.14, blastLP: 3200, body: 1, bodyF0: 120, bodyF1: 36, bodyDecay: 0.13, boom: 0.85, boomF: 38, boomDecay: 0.38, tail: 0.7, tailDecay: 1.1, drive: 3 },
  smgLight: { len: 0.45, crack: 0.5, blastDecay: 0.026, blastLP: 8000, body: 0.35, bodyF0: 320, bodyF1: 130, bodyDecay: 0.03, boom: 0.08, tail: 0.18, tailDecay: 0.28, echo: 0.2, drive: 1.7, peak: 0.8 },
  smg: { len: 0.55, crack: 0.55, blastDecay: 0.03, blastLP: 7000, body: 0.45, bodyF0: 280, bodyF1: 100, bodyDecay: 0.035, boom: 0.12, tail: 0.22, tailDecay: 0.32, echo: 0.22, drive: 1.9, peak: 0.85 },
  smgHeavy: { len: 0.6, crack: 0.5, blastDecay: 0.034, blastLP: 6000, body: 0.6, bodyF0: 220, bodyF1: 80, bodyDecay: 0.04, boom: 0.2, tail: 0.25, tailDecay: 0.35, echo: 0.25, drive: 2.1, peak: 0.88 },
  ak: { len: 0.9, crack: 0.95, blastDecay: 0.05, blastLP: 6000, body: 0.7, bodyF0: 200, bodyF1: 60, bodyDecay: 0.06, boom: 0.3, tail: 0.42, tailDecay: 0.6, drive: 2.4, peak: 0.92 },
  m16: { len: 0.85, crack: 1, blastDecay: 0.04, blastLP: 7600, body: 0.5, bodyF0: 250, bodyF1: 80, bodyDecay: 0.045, boom: 0.2, tail: 0.38, tailDecay: 0.55, drive: 2.2, peak: 0.9 },
  battle: { len: 1.0, crack: 1, blastDecay: 0.055, blastLP: 6200, body: 0.8, bodyF0: 190, bodyF1: 55, bodyDecay: 0.07, boom: 0.4, tail: 0.48, tailDecay: 0.7, drive: 2.6, peak: 0.93 },
  lmg: { len: 0.7, crack: 0.9, blastDecay: 0.045, blastLP: 6800, body: 0.6, bodyF0: 230, bodyF1: 70, bodyDecay: 0.05, boom: 0.25, tail: 0.3, tailDecay: 0.45, echo: 0.25, drive: 2.3, peak: 0.9 },
  lmgHeavy: { len: 0.8, crack: 0.95, blastDecay: 0.05, blastLP: 6000, body: 0.75, bodyF0: 200, bodyF1: 58, bodyDecay: 0.06, boom: 0.35, tail: 0.34, tailDecay: 0.5, echo: 0.28, drive: 2.5, peak: 0.92 },
  minigun: { len: 0.2, crack: 0.6, blastDecay: 0.018, blastLP: 6500, body: 0.55, bodyF0: 240, bodyF1: 90, bodyDecay: 0.025, boom: 0.25, boomDecay: 0.06, tail: 0.05, tailDecay: 0.08, echo: 0, drive: 2.4, peak: 0.75 },
  mg42: { len: 0.35, crack: 0.9, blastDecay: 0.025, blastLP: 7000, body: 0.6, bodyF0: 230, bodyF1: 75, bodyDecay: 0.03, boom: 0.3, boomDecay: 0.08, tail: 0.12, tailDecay: 0.2, echo: 0.12, drive: 2.6, peak: 0.85 },
  hmg: { len: 1.6, crack: 1, blastDecay: 0.09, blastLP: 5000, body: 1, bodyF0: 130, bodyF1: 34, bodyDecay: 0.12, boom: 0.9, boomF: 38, boomDecay: 0.35, tail: 0.7, tailDecay: 1.1, drive: 3.1 },
  garand: { len: 1.2, crack: 1, blastDecay: 0.055, blastLP: 6200, body: 0.8, bodyF0: 190, bodyF1: 52, bodyDecay: 0.07, boom: 0.4, tail: 0.6, tailDecay: 0.95, drive: 2.6 },
  suppressed: { len: 0.4, crack: 0.12, crackHP: 3500, blastDecay: 0.03, blastLP: 2200, body: 0.6, bodyF0: 180, bodyF1: 80, bodyDecay: 0.04, boom: 0, tail: 0.04, tailDecay: 0.1, echo: 0.05, mech: 1.2, mechAt: 0.018, drive: 1.4, peak: 0.55 },
  sniper: { len: 2.0, crack: 1, blastDecay: 0.06, blastLP: 7000, body: 0.85, bodyF0: 170, bodyF1: 45, bodyDecay: 0.08, boom: 0.5, boomDecay: 0.3, tail: 0.85, tailDecay: 1.5, tailLP: 800, drive: 2.7 },
  sniperBig: { len: 2.2, crack: 1, blastDecay: 0.07, blastLP: 6500, body: 0.95, bodyF0: 150, bodyF1: 40, bodyDecay: 0.1, boom: 0.7, boomF: 42, boomDecay: 0.36, tail: 0.9, tailDecay: 1.7, drive: 3 },
  barrett: { len: 2.4, crack: 1, blastDecay: 0.1, blastLP: 5200, body: 1, bodyF0: 120, bodyF1: 32, bodyDecay: 0.13, boom: 1, boomF: 36, boomDecay: 0.45, tail: 1, tailDecay: 1.9, drive: 3.3 },
};

// ------------------------------------------------------------------ specials
function launcherRPG() {
  const out = buf(1.6);
  const w = env(white(1.6), ad(0.02, 0.5));
  mix(out, biquad(w, 'bp', sweep(600, 2400, 0.4), 1.2), 1.2);
  mix(out, env(osc(0.5, sweep(120, 40, 0.3)), ad(0.002, 0.12)), 1);
  mix(out, biquad(env(brown(1.6), ad(0.01, 0.6)), 'lp', 500), 1.2);
  mix(out, gunshot({ len: 0.6, crack: 0.4, body: 0.6, boom: 0.4, tail: 0.1, echo: 0.2 }, 0), 0.6);
  return normalize(drive(out, 2), 0.95);
}
function launcherGL() {
  const out = buf(0.8);
  mix(out, env(osc(0.4, sweep(110, 40, 0.15)), ad(0.002, 0.07)), 1.2);
  mix(out, biquad(env(white(0.4), ad(0.001, 0.05)), 'lp', 900), 1);
  mix(out, click(0.05, 1800, 4, 0.006), 0.5, 0.0);
  mix(out, biquad(env(brown(0.8), ad(0.01, 0.25)), 'lp', 400), 0.6);
  return normalize(drive(out, 1.8), 0.9);
}
function bowShot(magic: boolean) {
  const out = buf(0.8);
  const tw = env(osc(0.5, sweep(160, 110, 0.05), 'tri'), ad(0.001, 0.08));
  mix(out, tw, 0.9);
  mix(out, env(osc(0.3, 330, 'sine'), ad(0.001, 0.05)), 0.3);
  mix(out, biquad(env(white(0.5), ad(0.02, 0.12)), 'bp', sweep(2800, 900, 0.3), 1.5), 0.7, 0.01);
  if (magic) {
    mix(out, modal(0.8, [[1760, 1, 0.3], [2637, 0.7, 0.25], [3520, 0.5, 0.2], [880, 0.6, 0.4]]), 0.35);
    mix(out, biquad(env(white(0.6), ad(0.01, 0.2)), 'hp', 5000), 0.3);
  }
  return normalize(out, 0.8);
}
function laserShot() {
  const out = buf(0.25);
  let ph = 0;
  let mph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 1600 * Math.pow(250 / 1600, Math.min(1, t / 0.18));
    mph += (f * 1.5) / SR;
    const mod = Math.sin(mph * Math.PI * 2) * 5 * Math.exp(-t / 0.08);
    ph += f / SR;
    out[i] = Math.sin(ph * Math.PI * 2 + mod) * Math.exp(-t / 0.07);
  }
  mix(out, biquad(env(white(0.2), ad(0.001, 0.03)), 'hp', 4000), 0.4);
  return normalize(drive(out, 1.5), 0.7);
}
function flameBurst(big: boolean) {
  const len = 0.45;
  const out = buf(len);
  const n = env(pink(len), (t) => Math.min(1, t / 0.05) * Math.min(1, (len - t) / 0.1));
  mix(out, biquad(n, 'lp', big ? 900 : 1300), 1.4);
  mix(out, biquad(env(brown(len), (t) => Math.min(1, t / 0.05) * Math.min(1, (len - t) / 0.1)), 'lp', 200), 1.2);
  // crackle
  for (let k = 0; k < 18; k++) mix(out, click(0.01, rr(1500, 5000), 2, 0.002), rr(0.1, 0.3), rr(0, len - 0.02));
  return normalize(drive(out, 1.5), 0.55);
}
function pirFire() {
  const out = buf(2.2);
  mix(out, laserShot(), 1);
  mix(out, gunshot({ len: 2.0, crack: 1, blast: 1.2, blastDecay: 0.09, blastLP: 4000, body: 1, bodyF0: 180, bodyF1: 30, bodyDecay: 0.15, boom: 1, boomF: 34, boomDecay: 0.5, tail: 0.9, tailDecay: 1.4, drive: 3 }, 0), 0.9);
  for (let k = 0; k < 40; k++) mix(out, click(0.02, rr(2000, 7000), 3, 0.004), rr(0.1, 0.5) * Math.exp(-k / 20), rr(0.02, 0.8));
  mix(out, modal(1.2, [[180, 1, 0.5], [270, 0.6, 0.4]]), 0.4);
  return normalize(out, 0.98);
}
function chargeBlip(f: number) {
  const out = osc(0.12, sweep(f, f * 1.5, 0.1), 'saw');
  env(out, ad(0.005, 0.04));
  return normalize(biquad(out, 'lp', 4000), 0.4);
}
function motorBlip() {
  const out = buf(0.16);
  mix(out, osc(0.16, 180, 'saw'), 0.5);
  mix(out, osc(0.16, 362, 'square'), 0.15);
  mix(out, biquad(white(0.16), 'bp', 1400, 2), 0.4);
  env(out, (t) => Math.min(1, t / 0.02) * Math.min(1, (0.16 - t) / 0.03));
  return normalize(biquad(out, 'lp', 3000), 0.5);
}

// ------------------------------------------------------------------ mechanics
const mech = {
  dryFire: () => normalize(mix(click(0.04, 3200, 6, 0.004), modal(0.05, [[4200, 0.4, 0.01]]), 1), 0.6),
  magOut: () => {
    const o = buf(0.25);
    mix(o, click(0.03, 2400, 5, 0.004), 1);
    mix(o, biquad(env(white(0.15), ad(0.01, 0.05)), 'bp', sweep(2000, 900, 0.1), 2), 0.5, 0.03);
    return normalize(o, 0.6);
  },
  magIn: () => {
    const o = buf(0.25);
    mix(o, click(0.03, 1800, 4, 0.005), 1);
    mix(o, click(0.03, 2800, 6, 0.004), 0.9, 0.04);
    mix(o, env(osc(0.08, 120), ad(0.001, 0.02)), 0.4, 0.04);
    return normalize(o, 0.7);
  },
  boltRack: () => {
    const o = buf(0.35);
    mix(o, click(0.03, 2200, 5, 0.005), 1);
    mix(o, biquad(env(white(0.1), ad(0.01, 0.03)), 'bp', 1600, 2), 0.4, 0.02);
    mix(o, click(0.03, 3000, 6, 0.005), 1.1, 0.14);
    mix(o, modal(0.1, [[3600, 0.3, 0.02]]), 1, 0.14);
    return normalize(o, 0.7);
  },
  slideRelease: () => normalize(mix(click(0.04, 2600, 5, 0.006), modal(0.1, [[3800, 0.4, 0.02]]), 1), 0.7),
  boltBack: () => {
    const o = buf(0.2);
    mix(o, click(0.02, 2000, 5, 0.004), 1);
    mix(o, biquad(env(white(0.12), ad(0.005, 0.04)), 'bp', sweep(2500, 1200, 0.1), 3), 0.5, 0.01);
    return normalize(o, 0.65);
  },
  boltForward: () => {
    const o = buf(0.2);
    mix(o, biquad(env(white(0.08), ad(0.005, 0.03)), 'bp', sweep(1200, 2600, 0.06), 3), 0.5);
    mix(o, click(0.03, 3000, 5, 0.005), 1.1, 0.05);
    return normalize(o, 0.7);
  },
  pumpBack: () => {
    const o = buf(0.2);
    mix(o, biquad(env(white(0.1), ad(0.003, 0.03)), 'bp', 1400, 2.5), 0.8);
    mix(o, click(0.03, 1900, 5, 0.005), 1, 0.04);
    return normalize(o, 0.75);
  },
  pumpForward: () => {
    const o = buf(0.2);
    mix(o, biquad(env(white(0.08), ad(0.003, 0.025)), 'bp', 1700, 2.5), 0.7);
    mix(o, click(0.03, 2500, 6, 0.005), 1.2, 0.03);
    mix(o, env(osc(0.06, 140), ad(0.001, 0.015)), 0.4, 0.03);
    return normalize(o, 0.8);
  },
  shellIn: () => {
    const o = buf(0.18);
    mix(o, click(0.02, 1500, 3, 0.004), 1);
    mix(o, biquad(env(white(0.06), ad(0.004, 0.02)), 'bp', 900, 1.5), 0.5, 0.02);
    mix(o, click(0.02, 2400, 5, 0.003), 0.7, 0.06);
    return normalize(o, 0.6);
  },
  cylOpen: () => normalize(mix(click(0.05, 2000, 4, 0.008), modal(0.2, [[3100, 0.3, 0.04], [5200, 0.2, 0.03]]), 1), 0.6),
  cylClose: () => {
    const o = buf(0.25);
    mix(o, click(0.04, 2400, 5, 0.006), 1);
    mix(o, modal(0.2, [[2900, 0.4, 0.05]]), 1, 0.005);
    mix(o, osc(0.1, 1400, 'saw').map((v, i) => v * Math.exp(-i / SR / 0.01) * 0.1), 1, 0.06);
    return normalize(o, 0.65);
  },
  speedloader: () => {
    const o = buf(0.3);
    for (let k = 0; k < 6; k++) mix(o, click(0.02, rr(2000, 3500), 5, 0.003), rr(0.4, 0.7), 0.01 + k * 0.012);
    mix(o, click(0.03, 1600, 3, 0.006), 1, 0.1);
    return normalize(o, 0.6);
  },
  breakOpen: () => normalize(mix(click(0.05, 1200, 3, 0.01), click(0.04, 2400, 5, 0.006), 0.8, 0.03), 0.7),
  breakClose: () => normalize(mix(click(0.05, 1500, 3, 0.01), modal(0.15, [[2200, 0.4, 0.03]]), 1, 0.005), 0.75),
  clipIn: () => {
    const o = buf(0.35);
    mix(o, click(0.03, 2000, 4, 0.005), 1);
    mix(o, biquad(env(white(0.12), ad(0.01, 0.04)), 'bp', 1800, 2), 0.4, 0.02);
    mix(o, click(0.04, 2800, 6, 0.006), 1.2, 0.18);
    return normalize(o, 0.7);
  },
  garandPing: () => normalize(modal(0.9, [[2860, 1, 0.35], [4290, 0.6, 0.25], [6150, 0.35, 0.15], [1430, 0.25, 0.3]]), 0.75),
  coverOpen: () => normalize(mix(click(0.05, 1300, 3, 0.01), modal(0.2, [[1900, 0.3, 0.05]]), 1), 0.65),
  coverClose: () => normalize(mix(click(0.05, 1100, 3, 0.012), click(0.03, 2600, 5, 0.005), 0.7, 0.02), 0.75),
  beltIn: () => {
    const o = buf(0.4);
    for (let k = 0; k < 8; k++) mix(o, click(0.015, rr(2500, 4000), 6, 0.002), rr(0.3, 0.6), k * 0.03);
    mix(o, click(0.03, 1500, 3, 0.006), 1, 0.26);
    return normalize(o, 0.6);
  },
  rocketLoad: () => {
    const o = buf(0.5);
    mix(o, biquad(env(white(0.3), ad(0.02, 0.1)), 'bp', sweep(600, 1400, 0.25), 2), 0.6);
    mix(o, click(0.04, 1600, 4, 0.008), 1, 0.3);
    return normalize(o, 0.7);
  },
  equip: () => {
    const o = buf(0.3);
    mix(o, biquad(env(white(0.2), ad(0.02, 0.06)), 'bp', 900, 1.2), 0.4);
    mix(o, click(0.03, 2400, 5, 0.005), 0.8, 0.12);
    return normalize(o, 0.45);
  },
  reloadStart: () => normalize(biquad(env(white(0.2), ad(0.02, 0.05)), 'bp', 700, 1), 0.3),
  grenadePin: () => {
    const o = buf(0.5);
    mix(o, click(0.02, 3000, 5, 0.003), 1);
    mix(o, modal(0.45, [[3520, 0.6, 0.15], [5280, 0.4, 0.1], [2349, 0.3, 0.2]]), 0.6, 0.03);
    return normalize(o, 0.6);
  },
  grenadeThrow: () => normalize(biquad(env(white(0.35), ad(0.05, 0.08)), 'bp', sweep(600, 2200, 0.2), 1.3), 0.6),
  grenadeBounce: () => normalize(mix(click(0.03, 900, 3, 0.008), modal(0.12, [[1400, 0.4, 0.03], [2600, 0.2, 0.02]]), 1), 0.6),
  bowDraw: () => {
    const o = buf(0.5);
    const n = env(white(0.5), (t) => Math.min(1, t / 0.3) * Math.exp(-Math.max(0, t - 0.4) * 20));
    mix(o, biquad(n, 'bp', sweep(300, 700, 0.4), 4), 0.4);
    for (let k = 0; k < 10; k++) mix(o, click(0.01, rr(500, 900), 3, 0.004), 0.2, k * 0.04);
    return normalize(o, 0.4);
  },
  arrowThud: () => normalize(mix(env(osc(0.1, sweep(200, 90, 0.05)), ad(0.001, 0.02)), click(0.03, 900, 2, 0.006), 0.6), 0.6),
};

// ------------------------------------------------------------------ debris
function casing(v: number) {
  const f = rr(3200, 5200);
  const o = modal(0.2, [[f, 1, 0.05], [f * 1.51, 0.6, 0.035], [f * 2.3, 0.3, 0.02]]);
  mix(o, click(0.01, 6000, 2, 0.001), 0.3);
  return normalize(o, 0.35 + (v % 2) * 0.05);
}
function casingBig() {
  const f = rr(1800, 2600);
  return normalize(modal(0.3, [[f, 1, 0.08], [f * 1.63, 0.5, 0.05], [f * 2.7, 0.25, 0.03]]), 0.4);
}
function shellDrop() {
  return normalize(mix(env(osc(0.08, rr(500, 700), 'tri'), ad(0.001, 0.015)), click(0.02, 1800, 2, 0.003), 0.4), 0.35);
}

// ------------------------------------------------------------------ impacts
function fleshHit() {
  const o = buf(0.35);
  mix(o, env(osc(0.15, sweep(130, 60, 0.05)), ad(0.001, 0.035)), 1);
  mix(o, biquad(env(white(0.25), ad(0.002, 0.06)), 'bp', rr(700, 1100), 1.3), 1.4);
  mix(o, biquad(env(white(0.15), ad(0.02, 0.05)), 'bp', sweep(1200, 400, 0.12), 3), 0.6, 0.02);
  return normalize(drive(o, 1.5), 0.7);
}
function headHit() {
  const o = buf(0.35);
  mix(o, click(0.02, 3000, 2, 0.004), 1);
  mix(o, fleshHit(), 0.9);
  for (let k = 0; k < 5; k++) mix(o, click(0.01, rr(1500, 4000), 3, 0.002), 0.4, rr(0, 0.05));
  return normalize(o, 0.8);
}
function armorHit() {
  const o = buf(0.4);
  mix(o, click(0.02, 3500, 3, 0.003), 1);
  mix(o, modal(0.35, [[rr(1700, 2100), 1, 0.08], [rr(2700, 3100), 0.7, 0.06], [rr(4300, 4800), 0.4, 0.04]]), 0.8);
  return normalize(o, 0.7);
}
function headPop() {
  const o = buf(0.8);
  mix(o, env(osc(0.3, sweep(160, 50, 0.1)), ad(0.001, 0.06)), 1.2);
  mix(o, biquad(env(white(0.6), ad(0.002, 0.12)), 'bp', sweep(900, 250, 0.3), 1.5), 1.6);
  for (let k = 0; k < 14; k++) mix(o, click(0.015, rr(800, 3500), 3, 0.003), rr(0.3, 0.8), rr(0, 0.2));
  for (let k = 0; k < 6; k++) mix(o, biquad(env(white(0.1), ad(0.005, 0.03)), 'bp', rr(300, 700), 3), 0.4, rr(0.1, 0.5));
  return normalize(drive(o, 1.8), 0.9);
}
function sever() {
  const o = buf(0.5);
  const n = env(white(0.5), (t) => Math.exp(-t / 0.15) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 38)));
  mix(o, biquad(n, 'bp', 650, 1.4), 1.4);
  mix(o, click(0.02, 2200, 3, 0.004), 0.6);
  mix(o, env(osc(0.2, sweep(120, 60, 0.1)), ad(0.001, 0.04)), 0.6);
  return normalize(o, 0.75);
}
function bodyFall() {
  const o = buf(0.5);
  mix(o, env(osc(0.3, sweep(90, 40, 0.1)), ad(0.002, 0.08)), 1.2);
  mix(o, biquad(env(white(0.3), ad(0.002, 0.06)), 'lp', 500), 1);
  mix(o, biquad(env(white(0.2), ad(0.01, 0.04)), 'bp', 800, 2), 0.4, 0.05);
  return normalize(o, 0.7);
}
function gibSplat() {
  const o = buf(0.25);
  mix(o, biquad(env(white(0.2), ad(0.002, 0.04)), 'bp', rr(500, 900), 2), 1);
  mix(o, env(osc(0.1, 90), ad(0.001, 0.02)), 0.5);
  return normalize(o, 0.4);
}
function explosion(v: number) {
  const len = 3.2;
  const o = buf(len);
  mix(o, biquad(env(white(0.03), ad(0.0003, 0.004)), 'hp', 1500), 1.4);
  mix(o, env(osc(1.2, sweep(95 + v * 5, 26, 0.5)), ad(0.004, 0.35)), 1.6);
  mix(o, biquad(env(white(1.2), ad(0.003, 0.18)), 'lp', 2200), 1.4);
  const rum = env(brown(len), (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.9) * (0.75 + 0.25 * Math.sin(t * 9 + v)));
  mix(o, biquad(rum, 'lp', 260), 3.2);
  for (let k = 0; k < 30; k++) mix(o, click(0.02, rr(800, 4000), 3, 0.003), rr(0.05, 0.25) * Math.exp(-k / 18), rr(0.15, 1.8));
  let r: Float32Array = echo(o, 0.21, 0.35, 600, 3);
  r = drive(r, 2.6);
  fadeOut(r, 0.2);
  return normalize(r, 0.98);
}
function thunder(v: number) {
  const len = 4;
  const o = buf(len);
  mix(o, biquad(env(white(0.2), ad(0.001, 0.03)), 'hp', 1200), 0.8, 0.02);
  const rum = env(brown(len), (t) => Math.min(1, t / 0.08) * Math.exp(-t / 1.3) * (0.6 + 0.4 * Math.sin(t * 5 + v * 2)));
  mix(o, biquad(rum, 'lp', 220), 3.5);
  return normalize(drive(o, 1.6), 0.9);
}
function jet() {
  const len = 4.5;
  const o = buf(len);
  const n = white(len);
  const shape = (t: number) => Math.exp(-Math.pow((t - 1.8) / 0.9, 2));
  mix(o, env(biquad(n, 'bp', (t) => 3500 * Math.pow(0.25, Math.min(1, t / 3.5)), 0.9), shape), 1.3);
  mix(o, env(biquad(brown(len), 'lp', 200), shape), 2.5);
  return normalize(o, 0.95);
}

// ------------------------------------------------------------------ voices
function groan(kind: string, v: number) {
  srand(9000 + v * 77 + kind.length * 13);
  if (kind === 'dog') {
    if (v % 2 === 0) {
      // snarl
      const o = voice(1.0, (t) => 140 + Math.sin(t * 17) * 20, [[500, 3, 1], [1400, 4, 0.6], [2800, 5, 0.3]], 0.5, 0.1, 0.7);
      env(o, (t) => Math.min(1, t / 0.08) * Math.min(1, (1 - t) / 0.2));
      return normalize(drive(o, 2), 0.6);
    }
    const o = buf(0.8);
    for (let k = 0; k < 2; k++) {
      const bark = voice(0.18, sweep(520, 380, 0.15), [[700, 3, 1], [1800, 4, 0.7]], 0.4, 0.05);
      env(bark, ad(0.005, 0.05));
      mix(o, bark, 1, k * 0.28);
    }
    return normalize(drive(o, 2.4), 0.6);
  }
  const cfg: Record<string, { f0: [number, number]; len: [number, number]; drive: number; fry: number; breath: number; form: number }> = {
    normal: { f0: [70, 120], len: [1.0, 1.9], drive: 1.8, fry: 0.5, breath: 0.25, form: 1 },
    runner: { f0: [180, 320], len: [0.5, 0.9], drive: 2.8, fry: 0.3, breath: 0.6, form: 1.35 },
    brute: { f0: [45, 65], len: [1.4, 2.2], drive: 3, fry: 0.7, breath: 0.2, form: 0.75 },
    bloat: { f0: [60, 90], len: [1.2, 1.8], drive: 1.5, fry: 0.8, breath: 0.4, form: 0.9 },
    boss: { f0: [35, 50], len: [2.0, 2.8], drive: 3.4, fry: 0.8, breath: 0.2, form: 0.65 },
  };
  const c = cfg[kind] ?? cfg.normal;
  const len = rr(c.len[0], c.len[1]);
  const f0 = rr(c.f0[0], c.f0[1]);
  const vow1 = [rr(450, 700), rr(900, 1300)];
  const vow2 = [rr(350, 600), rr(700, 1100)];
  const f = c.form;
  const o = voice(
    len,
    (t) => f0 * (1 + 0.15 * Math.sin(t * 2.3 + v) - 0.1 * (t / len)),
    [
      [(t) => (vow1[0] + (vow2[0] - vow1[0]) * (t / len)) * f, 4, 1],
      [(t) => (vow1[1] + (vow2[1] - vow1[1]) * (t / len)) * f, 5, 0.6],
      [2500 * f, 6, 0.25],
    ],
    c.breath,
    0.06,
    c.fry,
  );
  env(o, (t) => Math.min(1, t / 0.12) * Math.min(1, (len - t) / 0.25) * (0.8 + 0.2 * Math.sin(t * 13 + v)));
  if (kind === 'bloat') {
    for (let k = 0; k < 12; k++) mix(o, env(osc(0.06, rr(90, 260)), ad(0.005, 0.02)), 0.25, rr(0, len - 0.1));
  }
  return normalize(drive(o, c.drive), kind === 'boss' || kind === 'brute' ? 0.85 : 0.6);
}
function zombieAttack(v: number) {
  srand(500 + v);
  const o = voice(0.45, sweep(rr(140, 200), rr(90, 120), 0.3), [[rr(600, 800), 3, 1], [rr(1200, 1600), 4, 0.6]], 0.5, 0.08, 0.4);
  env(o, ad(0.02, 0.15));
  mix(o, click(0.03, 1500, 2, 0.005), 0.5, 0.25);
  return normalize(drive(o, 2.5), 0.6);
}
function playerHurt(v: number) {
  srand(700 + v);
  const o = voice(0.35, sweep(rr(150, 180), rr(110, 130), 0.3), [[rr(550, 700), 5, 1], [rr(1000, 1200), 6, 0.5], [2400, 8, 0.2]], 0.3, 0.03, 0.1);
  env(o, ad(0.01, 0.12));
  mix(o, fleshHit(), 0.5);
  return normalize(drive(o, 1.6), 0.7);
}
function playerDeath() {
  const o = voice(1.6, sweep(150, 80, 1.4), [[600, 5, 1], [1000, 6, 0.5]], 0.3, 0.03, 0.4);
  env(o, ad(0.02, 0.5));
  for (let k = 0; k < 3; k++) mix(o, env(osc(0.15, 55), ad(0.005, 0.05)), 0.8 - k * 0.2, 0.8 + k * 0.6);
  return normalize(o, 0.7);
}
function footstep(v: number) {
  srand(300 + v);
  const o = buf(0.18);
  mix(o, env(osc(0.1, sweep(80, 50, 0.05)), ad(0.002, 0.025)), 0.8);
  mix(o, biquad(env(white(0.15), ad(0.004, 0.04)), 'bp', rr(900, 1500), 1), 0.7);
  for (let k = 0; k < 4; k++) mix(o, click(0.01, rr(2000, 5000), 2, 0.002), 0.15, rr(0, 0.05));
  return normalize(o, 0.4);
}

// ------------------------------------------------------------------ structures
function structHit(mat: string, v: number) {
  srand(1100 + v + mat.length);
  const o = buf(0.5);
  if (mat === 'wood') {
    mix(o, modal(0.3, [[rr(180, 260), 1, 0.06], [rr(420, 520), 0.6, 0.04]]), 1);
    mix(o, biquad(env(white(0.2), ad(0.002, 0.03)), 'bp', 1200, 1), 0.8);
    for (let k = 0; k < 5; k++) mix(o, click(0.01, rr(1500, 3500), 3, 0.002), 0.3, rr(0.01, 0.08));
  } else if (mat === 'metal') {
    mix(o, modal(0.5, [[rr(400, 500), 1, 0.15], [rr(900, 1100), 0.7, 0.1], [rr(1700, 2000), 0.4, 0.07]]), 1);
    mix(o, click(0.02, 1500, 2, 0.004), 0.8);
  } else if (mat === 'concrete') {
    mix(o, env(osc(0.2, sweep(120, 70, 0.1)), ad(0.001, 0.04)), 1);
    mix(o, biquad(env(white(0.3), ad(0.002, 0.05)), 'lp', 1500), 0.9);
  } else {
    mix(o, env(osc(0.2, sweep(100, 60, 0.1)), ad(0.001, 0.05)), 1);
    mix(o, biquad(env(white(0.3), ad(0.004, 0.08)), 'lp', 900), 1.2);
  }
  return normalize(drive(o, 1.4), 0.75);
}
function structBreak(mat: string) {
  const o = buf(1.0);
  mix(o, structHit(mat, 1), 1);
  if (mat === 'wood') for (let k = 0; k < 16; k++) mix(o, click(0.02, rr(800, 3000), 2, 0.004), rr(0.3, 0.7), rr(0, 0.25));
  else if (mat === 'metal') mix(o, modal(0.9, [[310, 1, 0.3], [740, 0.6, 0.2], [1290, 0.4, 0.15]]), 0.8, 0.02);
  else mix(o, biquad(env(brown(1), ad(0.01, 0.3)), 'lp', 700), 1.5);
  return normalize(o, 0.85);
}

// ------------------------------------------------------------------ UI / music stingers
function tone(f: number, len: number, type: 'sine' | 'saw' | 'square' | 'tri' = 'square', tau = 0.1) {
  return env(osc(len, f, type), ad(0.003, tau));
}
const ui = {
  uiClick: () => normalize(biquad(tone(1200, 0.05, 'square', 0.015), 'lp', 5000), 0.3),
  countTick: () => normalize(biquad(mix(tone(988, 0.12, 'square', 0.05), tone(494, 0.12, 'tri', 0.05), 0.5), 'lp', 3500), 0.32),
  uiError: () => normalize(biquad(mix(tone(160, 0.25, 'square', 0.08), tone(154, 0.25, 'square', 0.08), 1), 'lp', 2000), 0.35),
  buy: () => {
    const o = buf(0.7);
    mix(o, tone(1319, 0.2, 'square', 0.06), 0.5);
    mix(o, tone(1760, 0.4, 'square', 0.12), 0.5, 0.08);
    for (let k = 0; k < 8; k++) mix(o, modal(0.2, [[rr(4000, 6000), 0.5, 0.05]]), 0.3, 0.1 + k * 0.03);
    return normalize(biquad(o, 'lp', 7000), 0.45);
  },
  shopOpen: () => normalize(mix(click(0.05, 700, 2, 0.02), tone(440, 0.2, 'tri', 0.05), 0.3), 0.4),
  pickup: () => normalize(mix(biquad(env(white(0.2), ad(0.01, 0.05)), 'bp', sweep(500, 1500, 0.15), 2), tone(880, 0.1, 'square', 0.03), 0.2, 0.08), 0.4),
  placeStructure: () => {
    const o = buf(0.5);
    mix(o, env(osc(0.3, sweep(110, 60, 0.1)), ad(0.002, 0.08)), 1);
    mix(o, biquad(env(white(0.3), ad(0.004, 0.06)), 'lp', 1200), 0.8);
    mix(o, click(0.03, 2000, 4, 0.005), 0.5, 0.05);
    return normalize(o, 0.6);
  },
  waveStart: () => {
    const len = 2.4;
    const o = buf(len);
    for (const [f, g] of [[110, 1], [165, 0.6], [220, 0.4], [55, 0.8]] as [number, number][]) {
      const s = osc(len, (t) => f * (1 + 0.01 * Math.sin(t * 5)), 'saw');
      env(s, (t) => Math.min(1, t / 0.4) * Math.min(1, (len - t) / 0.8));
      mix(o, biquad(s, 'lp', (t) => 400 + 1200 * Math.min(1, t / 0.8)), g);
    }
    mix(o, biquad(env(brown(len), ad(0.3, 1)), 'lp', 200), 1.5);
    return normalize(drive(o, 1.6), 0.6);
  },
  waveClear: () => {
    const o = buf(1.2);
    [523, 659, 784, 1047].forEach((f, i) => mix(o, tone(f, 0.5, 'square', 0.12), 0.5, i * 0.09));
    return normalize(biquad(o, 'lp', 4000), 0.4);
  },
  dayStart: () => {
    const o = buf(2.5);
    mix(o, explosion(2), 0.4);
    const s = osc(2.5, sweep(55, 110, 2), 'saw');
    env(s, (t) => Math.min(1, t / 0.5) * Math.exp(-Math.max(0, t - 1.2) * 2));
    mix(o, biquad(s, 'lp', 900), 0.6);
    return normalize(o, 0.6);
  },
  dayComplete: () => {
    const o = buf(2.0);
    [392, 523, 659, 784, 1047].forEach((f, i) => mix(o, tone(f, 0.9, 'square', 0.25), 0.4, i * 0.12));
    mix(o, tone(261, 1.5, 'tri', 0.6), 0.5, 0.5);
    return normalize(biquad(o, 'lp', 4500), 0.5);
  },
  kill: () => normalize(biquad(env(white(0.06), ad(0.001, 0.015)), 'bp', 1200, 2), 0.2),
  laserReady: () => normalize(mix(tone(1760, 0.12, 'sine', 0.04), tone(2640, 0.12, 'sine', 0.04), 0.6, 0.05), 0.35),
  bearTrap: () => normalize(mix(click(0.05, 1800, 3, 0.01), modal(0.4, [[900, 1, 0.12], [1700, 0.6, 0.08]]), 1), 0.8),
};

/** name -> (variant) => samples */
export const RECIPES: Record<string, { variants: number; fn: (v: number) => Float32Array }> = {};
function reg(name: string, variants: number, fn: (v: number) => Float32Array) {
  RECIPES[name] = { variants, fn };
}
for (const k of Object.keys(GUNS)) reg(k, k === 'minigun' || k === 'mg42' || k.startsWith('smg') ? 4 : 3, (v) => gunshot(GUNS[k], v));
reg('rpg', 2, () => launcherRPG());
reg('gl', 2, () => launcherGL());
reg('bow', 2, () => bowShot(false));
reg('bowMagic', 2, () => bowShot(true));
reg('laser', 3, () => laserShot());
reg('flame', 3, () => flameBurst(false));
reg('flameBig', 3, () => flameBurst(true));
reg('pir', 1, () => pirFire());
reg('pirFire', 2, () => pirFire());
reg('pirCharge', 1, () => chargeBlip(300));
reg('laserCharge', 1, () => chargeBlip(500));
reg('minigunSpin', 1, () => motorBlip());
for (const [k, f] of Object.entries(mech)) reg(k, k === 'pumpBack' || k === 'pumpForward' || k === 'shellIn' ? 2 : 1, () => f());
reg('casing', 4, (v) => casing(v));
reg('casingBig', 3, () => casingBig());
reg('shell', 3, () => shellDrop());
reg('gib', 3, () => gibSplat());
reg('wood', 2, () => structHit('wood', 3));
reg('hitFlesh', 4, () => fleshHit());
reg('hitHead', 3, () => headHit());
reg('hitArmor', 3, () => armorHit());
reg('headPop', 3, () => headPop());
reg('sever', 2, () => sever());
reg('bodyFall', 4, () => bodyFall());
reg('explosion', 3, (v) => explosion(v));
reg('thunder', 2, (v) => thunder(v));
reg('jet', 1, () => jet());
for (const k of ['normal', 'runner', 'brute', 'dog', 'bloat', 'boss']) reg('groan_' + k, k === 'normal' ? 7 : k === 'boss' ? 2 : 4, (v) => groan(k, v));
reg('zombieAttack', 4, (v) => zombieAttack(v));
reg('zombieHitStruct', 3, (v) => structHit('wood', v));
reg('playerHurt', 4, (v) => playerHurt(v));
reg('playerDeath', 1, () => playerDeath());
// kick: cloth/leg whoosh, then a heavy boot-to-body thud
reg('kickSwing', 2, () => normalize(biquad(env(pink(0.3), ad(0.06, 0.07)), 'bp', sweep(350, 1400, 0.16), 1.1), 0.5));
reg('kickHit', 3, () => {
  const o = buf(0.4);
  mix(o, env(osc(0.25, sweep(95, 42, 0.09)), ad(0.001, 0.07)), 1.3);
  mix(o, biquad(env(white(0.2), ad(0.001, 0.035)), 'lp', 900), 1.0);
  mix(o, fleshHit(), 0.55, 0.004);
  return normalize(drive(o, 2.2), 0.85);
});
/** Crossfade the tail into the head so a buffer loops without a seam. */
function seamless(x: Float32Array, fade = 0.3) {
  const n = Math.round(fade * SR);
  const out = new Float32Array(x.length - n);
  out.set(x.subarray(0, out.length));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    out[i] = out[i] * k + x[out.length + i] * (1 - k);
  }
  return out;
}
// liquid stream on dry ground: a fluctuating hiss with splatter ticks
reg('peeGround', 1, () => {
  const L = 3.3;
  const hiss = biquad(pink(L), 'bp', 2600, 0.7);
  let a = 0.7;
  let tgt = 0.7;
  env(hiss, () => {
    if (rnd() < 0.004) tgt = 0.45 + rnd() * 0.55;
    a += (tgt - a) * 0.004;
    return a;
  });
  const body = biquad(brown(L), 'lp', 520);
  env(body, (t) => 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 7.3) * Math.sin(t * Math.PI * 2 * 3.1));
  const o = buf(L);
  mix(o, hiss, 1);
  mix(o, body, 0.5);
  for (let k = 0; k < 160; k++) mix(o, click(0.01, rr(1800, 4500), 3, 0.002), rr(0.1, 0.3), rr(0, L - 0.02));
  return normalize(seamless(o), 0.5);
});
// stream into standing liquid: bubble chirps over a soft trickle
reg('peeWater', 1, () => {
  const L = 3.3;
  const o = buf(L);
  for (let k = 0; k < 520; k++) {
    const f0 = rr(450, 1500);
    const d = rr(0.012, 0.04);
    const b = osc(d, (t) => f0 * (1 + (t / d) * 1.3), 'sine');
    env(b, (t) => Math.exp(-t / (d * 0.35)) * Math.min(1, t / 0.0015));
    mix(o, b, rr(0.08, 0.35), rr(0, L - d));
  }
  mix(o, biquad(pink(L), 'bp', 1300, 1.2), 0.25);
  return normalize(seamless(o), 0.5);
});
function zipper(up: boolean) {
  const o = buf(0.42);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const t = 0.02 + k * 0.3 + rr(-0.004, 0.004);
    mix(o, click(0.012, (up ? 2600 + k * 2200 : 4600 - k * 2200) * rr(0.9, 1.1), 4, 0.0015), rr(0.5, 1), t);
    mix(o, biquad(env(white(0.008), ad(0.0005, 0.003)), 'hp', 3000), 0.3, t);
  }
  return normalize(o, 0.6);
}
reg('zipDown', 2, () => zipper(false));
reg('zipUp', 2, () => zipper(true));
reg('footstep', 5, (v) => footstep(v));
reg('land', 1, () => bodyFall());
for (const m of ['wood', 'metal', 'concrete', 'sand']) {
  reg('structHit_' + m, 3, (v) => structHit(m, v));
  reg('structBreak_' + m, 2, () => structBreak(m));
}
for (const [k, f] of Object.entries(ui)) reg(k, 1, () => f());

export { fadeIn, gain, onepole, pink };
