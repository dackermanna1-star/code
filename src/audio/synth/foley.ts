// Procedural foley (pure): footsteps per floor material, body thuds, cloth, tool swings
// (aerodynamic model), doors, friction creaks/strain loops, scrapes, settling, UI.

import {
  Biquad,
  addMode,
  addModes,
  addNoiseBurst,
  addThump,
  buf,
  clamp,
  fadeOut,
  makeLoop,
  peakOf,
  poisson,
  resonate,
  stickSlip,
  type Resonance,
} from "./dsp.ts";
import { MODAL, addTickInto, addTink } from "./modal.ts";
import type { G } from "./breaks.ts";

// ======================================================================= footsteps

/** Laminate/hardwood on underlay: heel "tok" (hollow floating floor) then toe. */
export function stepWood(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.32);
  const hit = (t: number, a: number) => {
    addThump(out, t * sr, sr, rng.range(90, 135), a * 0.45, 0.025, 0.3, 0.008);
    const f0 = rng.range(900, 1500);
    addModes(out, t * sr, sr, [
      { f: f0, a: a * 0.6, alpha: rng.range(90, 160) },
      { f: f0 * rng.range(1.7, 1.95), a: a * 0.35, alpha: rng.range(150, 230) },
      { f: f0 * rng.range(2.7, 3.1), a: a * 0.15, alpha: 280 },
      { f: rng.range(320, 480), a: a * 0.35, alpha: rng.range(60, 90) },
    ]);
    addNoiseBurst(out, t * sr, sr, noise, a * 0.35, { attack: 0.0005, decay: 0.006, bp: rng.range(1200, 2600), q: 0.8 });
  };
  hit(0, 1);
  hit(rng.range(0.065, 0.12), rng.range(0.35, 0.55));
  if (rng.chance(0.12)) {
    const c = stickSlip(sr, noise, 0.05, () => rng.range(150, 260), (t) => Math.sin((Math.PI * t) / 0.05) * 0.4, 0.15);
    resonate(out, 0.02 * sr, sr, c, [{ f: rng.range(450, 700), q: 10, g: 1 }, { f: rng.range(1100, 1500), q: 12, g: 0.5 }], 0.5, 0.05);
  }
  fadeOut(out, sr, 0.03);
  return out;
}

/** Hard sole on ceramic tile: sharp click + gritty scuff. */
export function stepTile(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.28);
  const hit = (t: number, a: number) => {
    const f0 = rng.range(1900, 3200);
    addModes(out, t * sr, sr, [
      { f: f0, a: a * 0.5, alpha: rng.range(220, 380) },
      { f: f0 * rng.range(1.6, 1.8), a: a * 0.3, alpha: 420 },
      { f: f0 * rng.range(2.6, 2.9), a: a * 0.15, alpha: 520 },
    ]);
    addNoiseBurst(out, t * sr, sr, noise, a * 0.45, { attack: 0.0003, decay: 0.008, hp: 1800, grit: 0.8 });
    addThump(out, t * sr, sr, rng.range(110, 150), a * 0.35, 0.02, 0.3, 0.006);
  };
  hit(0, 1);
  hit(rng.range(0.055, 0.1), rng.range(0.3, 0.5));
  fadeOut(out, sr, 0.03);
  return out;
}

/** Carpet: muffled thump and a fabric swish. */
export function stepCarpet(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  addThump(out, 0, sr, rng.range(80, 110), 1, 0.05, 0.25, 0.012, 0.004);
  addNoiseBurst(out, 0, sr, noise, 0.25, { attack: 0.01, decay: 0.04, lp: 1500, hp: 200 });
  const t2 = rng.range(0.07, 0.12);
  addThump(out, t2 * sr, sr, rng.range(95, 125), 0.4, 0.04, 0.25, 0.01, 0.004);
  addNoiseBurst(out, t2 * sr, sr, noise, 0.12, { attack: 0.01, decay: 0.03, lp: 1800, hp: 300 });
  fadeOut(out, sr, 0.03);
  return out;
}

/** Concrete (balcony): gritty scuff + thud. */
export function stepConcrete(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  addNoiseBurst(out, 0, sr, noise, 0.6, { attack: 0.0005, decay: 0.015, bp: rng.range(1500, 3500), q: 0.6, grit: 0.9 });
  addThump(out, 0, sr, rng.range(90, 120), 0.6, 0.025, 0.3, 0.006);
  const t2 = rng.range(0.07, 0.12);
  addNoiseBurst(out, t2 * sr, sr, noise, 0.35, { attack: 0.003, decay: 0.03, bp: rng.range(2000, 4000), q: 0.5, grit: 0.95 });
  fadeOut(out, sr, 0.03);
  return out;
}

/** Stepping on debris (glass shards, gypsum crumbs): granular crunch. Layered on footsteps. */
export function stepDebris(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  const d = rng.range(0.08, 0.16);
  poisson(noise, d, 500, () => 300, (t) => {
    if (rng.chance(0.55)) addTink(out, t * sr, sr, noise.logRange(2200, 8500), rng.range(0.05, 0.3), rng.range(5, 9));
    else {
      const f = noise.logRange(500, 2200);
      addMode(out, t * sr, sr, f, rng.range(0.05, 0.3), rng.range(150, 300), 0);
    }
  });
  addNoiseBurst(out, 0, sr, noise, 0.35, { attack: 0.005, hold: d * 0.5, decay: 0.03, bp: 3000, q: 0.5, grit: 0.95 });
  fadeOut(out, sr, 0.03);
  return out;
}

// ======================================================================= body

export function punchThud(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  addThump(out, 0, sr, rng.range(90, 140), 1, 0.05, 0.35, 0.01);
  addNoiseBurst(out, 0, sr, noise, 0.9, { attack: 0.0004, decay: 0.01, bp: rng.range(900, 2200), q: 0.7 });
  addNoiseBurst(out, 0.01 * sr, sr, noise, 0.08, { attack: 0.01, decay: 0.05, bp: 3500, q: 0.6 });
  fadeOut(out, sr, 0.03);
  return out;
}

export function kickThud(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.35);
  addThump(out, 0, sr, rng.range(70, 110), 1, 0.07, 0.4, 0.012);
  addNoiseBurst(out, 0, sr, noise, 0.6, { attack: 0.0005, decay: 0.01, bp: rng.range(500, 1500), q: 0.6, grit: 0.4 });
  fadeOut(out, sr, 0.03);
  return out;
}

/** Fist/foot on a hard surface: knuckle/bone knock + fleshy thud + skin slap. */
export function ouch(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  addMode(out, 0, sr, rng.range(1200, 2400), 0.7, rng.range(200, 320), 0);
  addMode(out, 0, sr, rng.range(3000, 4200), 0.25, 450, 0);
  addNoiseBurst(out, 0, sr, noise, 0.5, { attack: 0.0001, decay: 0.003, hp: 1000 });
  addThump(out, 0, sr, rng.range(105, 140), 0.9, 0.04, 0.3, 0.008);
  addNoiseBurst(out, 0.001 * sr, sr, noise, 0.35, { attack: 0.0003, decay: 0.006, bp: 1800, q: 0.8 });
  fadeOut(out, sr, 0.03);
  return out;
}

export function stomp(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.45);
  addThump(out, 0, sr, rng.range(55, 80), 1, 0.08, 0.45, 0.014);
  addNoiseBurst(out, 0, sr, noise, 0.55, { attack: 0.0005, decay: 0.012, bp: rng.range(400, 1200), q: 0.6, grit: 0.5 });
  addNoiseBurst(out, 0.004 * sr, sr, noise, 0.2, { attack: 0.002, decay: 0.03, hp: 1500, grit: 0.8 });
  fadeOut(out, sr, 0.04);
  return out;
}

export function jump(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  addNoiseBurst(out, 0, sr, noise, 0.6, { attack: 0.002, decay: 0.02, bp: rng.range(1200, 3000), q: 0.7, grit: 0.6 });
  addNoiseBurst(out, 0.02 * sr, sr, noise, 0.4, { attack: 0.05, decay: 0.07, bp: rng.range(700, 1800), q: 0.8 });
  fadeOut(out, sr, 0.03);
  return out;
}

export function land(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.5);
  addThump(out, 0, sr, rng.range(60, 90), 1, 0.08, 0.45, 0.014);
  addNoiseBurst(out, 0, sr, noise, 0.5, { attack: 0.0004, decay: 0.01, bp: rng.range(600, 2000), q: 0.6 });
  addNoiseBurst(out, rng.range(0.012, 0.03) * sr, sr, noise, 0.35, { attack: 0.0004, decay: 0.01, bp: rng.range(700, 2400), q: 0.6 });
  addNoiseBurst(out, 0.02 * sr, sr, noise, 0.12, { attack: 0.01, decay: 0.1, bp: 2600, q: 0.6 });
  fadeOut(out, sr, 0.04);
  return out;
}

// ======================================================================= cloth

/** Fabric friction: jittery band-passed noise micro-bursts under an envelope. */
export function clothRustle(g: G, dur: number, intensity: number): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, dur);
  const bp = new Biquad().bandpass(sr, rng.range(1500, 3200), 0.6);
  const hp = new Biquad().highpass(sr, 500);
  let am = 0;
  const d = dur * 0.9;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    if (noise.u() < 0.004) am = rng.range(0.3, 1);
    am *= 0.9995;
    const env = t < d ? Math.sin((Math.PI * t) / d) ** 0.7 : 0;
    out[i] = hp.process(bp.process(noise.white())) * env * (0.35 + am) * intensity;
  }
  fadeOut(out, sr, 0.02);
  return out;
}

export function clothGrab(g: G): Float32Array {
  return clothRustle(g, g.rng.range(0.12, 0.2), 1);
}

export function clothThrow(g: G): Float32Array {
  const { rng } = g;
  const out = clothRustle(g, rng.range(0.28, 0.36), 0.7);
  const w = swingCore(g, rng.range(0.22, 0.3), 500, 1800, 0.8, false);
  for (let i = 0; i < out.length && i < w.length; i++) out[i] += w[i] * 0.8;
  return out;
}

export function clothDrop(g: G): Float32Array {
  return clothRustle(g, g.rng.range(0.1, 0.16), 0.6);
}

// ======================================================================= swings

/**
 * Aerodynamic swing whoosh. Head speed v(t) = sin²(π t/T) (warped so the peak is off-centre);
 * radiated dipole power ∝ v⁶ → amplitude ∝ v³; vortex-shedding frequency ∝ v.
 */
function swingCore(g: G, T: number, fLo: number, fHi: number, peakAt: number, whistle: boolean, heavy = false): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, T + 0.06);
  const bp = new Biquad();
  const bp2 = new Biquad();
  const wh = new Biquad();
  const q = rng.range(1.0, 1.5);
  const whQ = rng.range(6, 10);
  let v = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    if ((i & 31) === 0) {
      const u = clamp(t / T, 0, 1);
      // Warp u so that the maximum sits at peakAt.
      const w = u < peakAt ? (0.5 * u) / peakAt : 0.5 + (0.5 * (u - peakAt)) / (1 - peakAt);
      v = Math.sin(Math.PI * w) ** 2;
      const fc = fLo + (fHi - fLo) * v;
      bp.bandpass(sr, fc, q);
      if (heavy) bp2.bandpass(sr, fc * 0.45, 0.8);
      if (whistle) wh.bandpass(sr, fc * 1.35, whQ);
    }
    const n = noise.white();
    let y = bp.process(n) * v * v * v;
    if (heavy) y += bp2.process(n) * v * v * 0.6;
    if (whistle) y += wh.process(n) * v * v * v * v * 0.6;
    out[i] = y;
  }
  fadeOut(out, sr, 0.02);
  return out;
}

export function swing(g: G, kind: "light" | "medium" | "heavy"): Float32Array {
  const { rng } = g;
  const pk = rng.range(0.4, 0.65);
  if (kind === "light") return swingCore(g, rng.range(0.16, 0.22), rng.range(800, 1000), rng.range(3000, 3800), pk, false);
  if (kind === "medium") return swingCore(g, rng.range(0.26, 0.32), rng.range(550, 700), rng.range(2300, 2900), pk, rng.chance(0.7));
  return swingCore(g, rng.range(0.38, 0.46), rng.range(280, 360), rng.range(1300, 1700), pk, false, true);
}

// ======================================================================= creaks & friction

function creakBank(g: G, kind: "hinge" | "wood" | "metal" | "door"): Resonance[] {
  const { rng } = g;
  switch (kind) {
    case "hinge":
      return [
        { f: rng.range(900, 1300), q: 18, g: 1 },
        { f: rng.range(1900, 2600), q: 22, g: 0.9 },
        { f: rng.range(3200, 4200), q: 25, g: 0.5 },
        { f: rng.range(350, 500), q: 10, g: 0.15 },
      ];
    case "door":
      return [
        { f: rng.range(180, 260), q: 6, g: 0.9 },
        { f: rng.range(420, 600), q: 9, g: 0.8 },
        { f: rng.range(950, 1300), q: 14, g: 0.6 },
        { f: rng.range(1900, 2700), q: 20, g: 0.5 },
      ];
    case "wood":
      return [
        { f: rng.range(300, 450), q: 9, g: 1 },
        { f: rng.range(700, 1000), q: 12, g: 0.7 },
        { f: rng.range(1400, 1900), q: 15, g: 0.35 },
      ];
    case "metal":
      return [
        { f: rng.range(180, 280), q: 30, g: 1 },
        { f: rng.range(450, 650), q: 40, g: 0.7 },
        { f: rng.range(1000, 1500), q: 50, g: 0.5 },
        { f: rng.range(2200, 3000), q: 60, g: 0.3 },
      ];
  }
}

const CREAK_F: Record<"hinge" | "wood" | "metal" | "door", [number, number, number]> = {
  // [min slip rate, max slip rate, jitter]
  hinge: [160, 520, 0.05],
  door: [110, 340, 0.05],
  wood: [55, 220, 0.14],
  metal: [45, 140, 0.08],
};

/** One creak (hinge strain, wood prying, metal groan, door swinging). */
export function creak(g: G, kind: "hinge" | "wood" | "metal" | "door"): Float32Array {
  const { sr, rng, noise } = g;
  const dur = kind === "door" ? rng.range(0.9, 1.5) : rng.range(0.45, 1.0);
  const [fa, fb, jit] = CREAK_F[kind];
  const f0 = rng.range(fa, (fa + fb) / 2);
  const f1 = rng.range((fa + fb) / 2, fb);
  const ph = rng.range(0, 6.28);
  const sl = stickSlip(
    sr,
    noise,
    dur,
    (t) => f0 + (f1 - f0) * Math.sin((Math.PI * t) / dur + ph * 0.1) ** 2 + (fb - fa) * 0.06 * Math.sin(t * 9 + ph),
    (t) => Math.sin((Math.PI * t) / dur) ** 0.8 * (0.7 + 0.3 * Math.sin(t * 13 + ph)),
    jit,
    kind === "wood" ? 0.8 : 0.5,
  );
  const out = buf(sr, dur + 0.15);
  resonate(out, 0, sr, sl, creakBank(g, kind), 1, 0.15);
  fadeOut(out, sr, 0.04);
  return out;
}

/** Seamless strain loop (continuous stick-slip with slow random pitch wander). */
export function strainLoop(g: G, kind: "wood" | "metal" | "drywall" | "hinge"): Float32Array {
  const { sr, rng, noise } = g;
  const L = 2.6;
  const X = 0.3;
  const dur = L + X;
  const out = buf(sr, dur + 0.05);
  if (kind === "drywall") {
    // Gypsum under load: crunchy micro-cracking (sparse gritty crackles) over a faint groan.
    poisson(noise, dur, 120, (t) => 60 + 40 * Math.sin(t * 2.4), (t) => {
      addNoiseBurst(out, t * sr, sr, noise, rng.range(0.1, 0.6), { attack: 0.0003, decay: rng.range(0.002, 0.008), bp: noise.logRange(500, 2500), q: 0.8, grit: 0.9 });
    });
    const s = stickSlip(sr, noise, dur, (t) => 70 + 20 * Math.sin(t * 1.3), () => 0.25, 0.2);
    resonate(out, 0, sr, s, [{ f: 260, q: 6, g: 1 }, { f: 620, q: 8, g: 0.5 }], 0.6, 0);
  } else {
    const k = kind === "hinge" ? "hinge" : kind;
    const [fa, fb, jit] = CREAK_F[k];
    const ph = rng.range(0, 6.28);
    // LFO rates are multiples of 1/L so the loop's modulation is periodic.
    const s = stickSlip(
      sr,
      noise,
      dur,
      (t) => fa + (fb - fa) * (0.5 + 0.3 * Math.sin((2 * Math.PI * 2 * t) / L + ph) + 0.15 * Math.sin((2 * Math.PI * 5 * t) / L)),
      (t) => 0.75 + 0.25 * Math.sin((2 * Math.PI * 3 * t) / L + ph),
      jit,
      kind === "wood" ? 0.8 : 0.5,
    );
    resonate(out, 0, sr, s, creakBank(g, k), 1, 0);
  }
  return makeLoop(out.subarray(0, Math.round(dur * sr)), Math.round(X * sr));
}

/** Seamless scrape/drag loop for sliding objects (gain by speed at runtime). */
export function scrapeLoop(g: G, kind: "wood" | "metal" | "stone"): Float32Array {
  const { sr, rng, noise } = g;
  const L = 2.2;
  const X = 0.25;
  const dur = L + X;
  const out = buf(sr, dur);
  if (kind === "stone") {
    const hp = new Biquad().highpass(sr, 700);
    const lp = new Biquad().lowpass(sr, 7000);
    let gr = 1;
    let m = 1;
    for (let i = 0; i < out.length; i++) {
      if ((i & 63) === 0) m = 0.8 + 0.2 * Math.sin((2 * Math.PI * 3 * i) / sr / L);
      if (noise.u() < 0.03) gr = rng.range(0.2, 2);
      out[i] = lp.process(hp.process(noise.white() * gr)) * m;
    }
  } else {
    const [fa, fb, jit] = kind === "wood" ? [110, 260, 0.25] : [500, 1500, 0.1];
    const s = stickSlip(sr, noise, dur, (t) => fa + (fb - fa) * (0.5 + 0.4 * Math.sin((2 * Math.PI * 2 * t) / L)), () => 0.7, jit, 0.5);
    resonate(out, 0, sr, s, kind === "wood" ? creakBank(g, "wood") : creakBank(g, "metal").map((r) => ({ ...r, f: r.f * 3 })), 1, 0);
    const n = new Biquad().lowpass(sr, kind === "wood" ? 3000 : 6000);
    const h = new Biquad().highpass(sr, kind === "wood" ? 200 : 1200);
    const pk = Math.max(peakOf(out), 1e-3);
    for (let i = 0; i < out.length; i++) out[i] += h.process(n.process(noise.white())) * pk * 0.25;
  }
  return makeLoop(out, Math.round(X * sr));
}

// ======================================================================= doors

export function doorCreak(g: G): Float32Array {
  return creak(g, "door");
}

export function doorLatch(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  for (let i = 0; i < rng.int(2, 3); i++) {
    const t = i * rng.range(0.012, 0.03);
    addMode(out, t * sr, sr, rng.range(2200, 4800), 0.5, rng.range(250, 450), 0);
    addNoiseBurst(out, t * sr, sr, noise, 0.35, { attack: 0.0001, decay: 0.0008, hp: 2000 });
  }
  const t2 = rng.range(0.05, 0.09);
  addModes(out, t2 * sr, sr, [
    { f: rng.range(1100, 2000), a: 0.7, alpha: 60 },
    { f: rng.range(3000, 4500), a: 0.35, alpha: 120 },
  ]);
  addThump(out, t2 * sr, sr, rng.range(250, 450), 0.5, 0.015, 0.2, 0.005);
  fadeOut(out, sr, 0.03);
  return out;
}

export function doorSlam(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, rng.range(0.8, 1.1));
  addThump(out, 0, sr, rng.range(70, 100), 1, 0.07, 0.4, 0.012);
  addModes(out, 0, sr, [
    { f: rng.range(95, 140), a: 0.7, alpha: 14 },
    { f: rng.range(240, 330), a: 0.5, alpha: 22 },
    { f: rng.range(520, 720), a: 0.35, alpha: 35 },
    { f: rng.range(1100, 1500), a: 0.2, alpha: 60 },
  ]);
  addNoiseBurst(out, 0, sr, noise, 0.6, { attack: 0.0003, decay: 0.006, hp: 300, lp: 6000 });
  addModes(out, 0.004 * sr, sr, [{ f: rng.range(2000, 3500), a: 0.25, alpha: 50 }, { f: rng.range(4200, 5600), a: 0.12, alpha: 90 }]);
  for (let i = 0; i < rng.int(3, 6); i++) addTickInto(out, rng.range(0.02, 0.25) * sr, sr, rng, noise, rng.chance(0.5) ? MODAL.glass : MODAL.metalThin, rng.range(0.03, 0.08), rng.range(0.03, 0.08));
  fadeOut(out, sr, 0.1);
  return out;
}

// ======================================================================= misc

/** Island breaking loose / settling: short creak, soft thud, a few ticks. */
export function settle(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, rng.range(0.55, 0.8));
  const d = rng.range(0.12, 0.25);
  const s = stickSlip(sr, noise, d, () => rng.range(70, 160), (t) => Math.sin((Math.PI * t) / d) * 0.5, 0.15);
  resonate(out, 0, sr, s, creakBank(g, "wood"), 0.8, 0.1);
  addThump(out, d * sr, sr, rng.range(80, 120), 0.6, 0.04, 0.3, 0.01);
  for (let i = 0; i < rng.int(1, 3); i++) addTickInto(out, (d + rng.range(0.03, 0.3)) * sr, sr, rng, noise, MODAL.wood, rng.range(0.015, 0.04), rng.range(0.08, 0.2));
  fadeOut(out, sr, 0.05);
  return out;
}

/** Sharp steel-tool contact transient (layered on tool strikes). */
export function toolTransient(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.12);
  addNoiseBurst(out, 0, sr, noise, 1, { attack: 0.00005, decay: rng.range(0.0008, 0.0016), hp: 1500 });
  const f0 = rng.range(4800, 8000);
  addModes(out, 0, sr, [
    { f: f0, a: 0.4, alpha: rng.range(60, 120) },
    { f: f0 * 1.47, a: 0.2, alpha: 150 },
  ]);
  fadeOut(out, sr, 0.01);
  return out;
}

export function uiClick(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.06);
  addMode(out, 0, sr, rng.range(1600, 2600), 0.6, 600, 0);
  addMode(out, 0, sr, rng.range(280, 360), 0.3, 200, 0);
  addNoiseBurst(out, 0, sr, noise, 0.2, { attack: 0.0001, decay: 0.0006, hp: 3000 });
  fadeOut(out, sr, 0.005);
  return out;
}

export function uiTool(g: G): Float32Array {
  const { sr, rng } = g;
  const out = clothRustle(g, 0.14, 0.5);
  const o2 = buf(sr, 0.4);
  o2.set(out);
  const t = rng.range(0.07, 0.11);
  const f0 = rng.range(2000, 3600);
  for (let k = 0; k < 3; k++) addMode(o2, t * sr, sr, f0 * [1, 2.756, 5.404][k], [0.3, 0.15, 0.06][k], 25 + k * 15, 0);
  fadeOut(o2, sr, 0.03);
  return o2;
}
