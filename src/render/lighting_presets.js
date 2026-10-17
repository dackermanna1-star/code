// Light presets (TECH §8) and their behaviour over time: flicker curves and on/off transitions.
// Colors come from palette.js LIGHT_COLORS so art and lighting agree on hues.
//
// Everything here is a pure function of (time, seed) so a frame at time t always looks the same —
// stills and QA captures are reproducible, and nothing allocates per frame.
import { LIGHT_COLORS } from '../art/palette.js';

/**
 * Preset fields (all overridable per light def; radius in TILES like map data):
 *   kind      'point' | 'cone' | 'spot' | 'ambient' | 'shaft'
 *   radius    tiles      intensity 0..1      color hex
 *   shape     'round' | 'tube' (fluorescent: wide, flat-topped ellipse)
 *   flicker   steady curve; flickerAlt is used when the def says `flicker: true` (dying fixtures)
 *   onMode    transition when switched on: 'fade' | 'stutter' | 'bang'   fade  seconds (default 0.4)
 *   glow      additive halo style drawn over the lit world (null = none)
 *   shadows   cast shadows (default true)
 *   cone      full cone angle (kind cone): degrees here; defs may give radians (≤ 2π) like flashlight.js
 */
export const PRESETS = {
  flashlight: { kind: 'cone', color: LIGHT_COLORS.flashlight, radius: 130 / 16, intensity: 1, cone: 55, flicker: 'steady', glow: null },
  window: { kind: 'shaft', color: LIGHT_COLORS.moon, radius: 4, intensity: 0.5, flicker: 'steady', glow: null },
  fluor: {
    kind: 'point', shape: 'tube', color: LIGHT_COLORS.fluor, radius: 4.5, intensity: 0.92,
    flicker: 'fluor', flickerAlt: 'fluor_bad', onMode: 'stutter', offMode: 'fluor', glow: 'tube',
  },
  exit_sign: { kind: 'point', color: LIGHT_COLORS.exit_sign, radius: 2, intensity: 0.8, flicker: 'steady', flickerAlt: 'dying', glow: 'sign' },
  lamp_green: { kind: 'point', color: LIGHT_COLORS.lamp_green, radius: 3, intensity: 0.85, flicker: 'steady', flickerAlt: 'dying', glow: 'lamp' },
  bulb: { kind: 'point', color: LIGHT_COLORS.bulb, radius: 4, intensity: 0.88, cage: true, flicker: 'steady', flickerAlt: 'brownout', glow: 'bulb' },
  boiler: { kind: 'point', color: LIGHT_COLORS.boiler, radius: 7, intensity: 0.9, flicker: 'fire', glow: 'fire' },
  fire: { kind: 'point', color: LIGHT_COLORS.boiler, radius: 4, intensity: 0.9, flicker: 'fire', glow: 'fire' },
  candle: { kind: 'point', color: LIGHT_COLORS.candle, radius: 2.5, intensity: 0.85, flicker: 'candle', glow: 'flame', jitter: 1 },
  lamp_miner: { kind: 'point', color: LIGHT_COLORS.lamp_miner, radius: 3, intensity: 0.82, flicker: 'oil', glow: 'flame' },
  spot: { kind: 'spot', color: LIGHT_COLORS.spot, radius: 5, disc: 2.1, intensity: 1, flicker: 'steady', shadows: false, onMode: 'bang', glow: 'spot' },
  streetlamp: { kind: 'point', color: LIGHT_COLORS.streetlamp, radius: 5.5, intensity: 1, flicker: 'steady', flickerAlt: 'sodium', glow: 'lamp', glowDy: -26 },
  headlights: { kind: 'cone', color: LIGHT_COLORS.headlights, radius: 10, intensity: 0.9, cone: 40, twin: 11, flicker: 'idle', glow: 'headlights' },
  crt: { kind: 'point', color: LIGHT_COLORS.crt, radius: 2, intensity: 0.6, flicker: 'crt', glow: 'crt' },
  led_red: { kind: 'point', color: LIGHT_COLORS.led_red, radius: 1, intensity: 0.7, flicker: 'steady', glow: 'led' },
  mine_fire: { kind: 'point', color: LIGHT_COLORS.mine_fire, radius: 12, intensity: 0.95, flicker: 'mine', glow: null },
  dawn: { kind: 'ambient', color: LIGHT_COLORS.dawn, radius: 0, intensity: 0.42, flicker: 'steady', fade: 4, glow: null },
};

const DEFAULT_PRESET = { kind: 'point', color: '#ffffff', radius: 3, intensity: 0.8, flicker: 'steady', glow: null };

export function presetOf(type) {
  return PRESETS[type] || DEFAULT_PRESET;
}

// ---- deterministic noise ------------------------------------------------------------------------
export function hash1(i, seed) {
  let h = Math.imul((i | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1]. */
export function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i, seed);
  return a + (hash1(i + 1, seed) - a) * u;
}
/** Centered smooth noise in [-1, 1]. */
const cn = (x, seed) => noise1(x, seed) * 2 - 1;

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---- flicker curves ------------------------------------------------------------------------------
/**
 * Event window helper: does window k (of length W) contain an event, and where.
 * Returns the local time inside the event (≥ 0) or -1.
 */
function eventIn(t, W, p, minD, maxD, seed) {
  const k = Math.floor(t / W);
  if (hash1(k, seed) >= p) return -1;
  const dur = minD + (maxD - minD) * hash1(k, seed + 7);
  const start = (W - dur) * hash1(k, seed + 13);
  const local = t - k * W - start;
  return local >= 0 && local < dur ? local : -1;
}

/**
 * Brightness multiplier of a flicker curve at time t (seconds). `reduce` = settings.reduceFlashing:
 * hard on/off strobing is replaced by soft dips.
 */
export function flickerAt(mode, t, seed, reduce) {
  switch (mode) {
    case 'steady': return 1;
    case 'fluor':
    case 'fluor_bad': {
      // Mains buzz is too fast to see; a faint shimmer reads as "electric".
      let v = 0.975 + 0.025 * cn(t * 31, seed);
      const bad = mode === 'fluor_bad';
      const e = eventIn(t, bad ? 3.5 : 11, bad ? 0.75 : 0.22, 0.08, bad ? 0.55 : 0.3, seed + 101);
      if (e >= 0) {
        if (reduce) v *= 0.78 + 0.12 * Math.cos(e * 9);
        else v *= hash1(Math.floor(e / 0.045), seed + 3) < 0.55 ? 0.12 + 0.2 * hash1(Math.floor(e / 0.045), seed + 5) : 1;
      }
      return v;
    }
    case 'dying': {
      // A failing sign/ballast: unsteady, with frequent short outages.
      let v = 0.86 + 0.1 * cn(t * 7, seed);
      const e = eventIn(t, 2.4, 0.7, 0.06, 0.6, seed + 211);
      if (e >= 0) {
        if (reduce) v *= 0.6 + 0.25 * Math.cos(e * 6);
        else v *= hash1(Math.floor(e / 0.05), seed + 9) < 0.6 ? 0.05 : 0.95;
      }
      return v;
    }
    case 'brownout': {
      let v = 0.88 + 0.08 * cn(t * 1.6, seed) + 0.03 * cn(t * 13, seed + 1);
      const e = eventIn(t, 4, 0.6, 0.15, 0.9, seed + 307);
      if (e >= 0) v *= reduce ? 0.7 : 0.35 + 0.4 * noise1(e * 30, seed + 2);
      return v;
    }
    case 'fire': return 0.86 + 0.08 * cn(t * 1.7, seed) + 0.05 * cn(t * 6.3, seed + 1) + 0.03 * cn(t * 15, seed + 2);
    case 'candle': {
      const gutter = Math.min(0, cn(t * 0.55, seed + 4)) * 0.18;
      return 0.86 + 0.08 * cn(t * 3.1, seed) + 0.05 * cn(t * 11, seed + 1) + gutter;
    }
    case 'oil': return 0.92 + 0.04 * cn(t * 2.3, seed) + 0.03 * cn(t * 9, seed + 1);
    case 'mine': return 0.8 + 0.13 * cn(t * 0.45, seed) + 0.06 * cn(t * 2.2, seed + 1) + 0.02 * cn(t * 8, seed + 2);
    case 'crt': return 0.94 + 0.025 * Math.sin(t * 47) + 0.025 * cn(t * 23, seed);
    case 'idle': return 0.985 + 0.015 * Math.sin(t * 25 + seed);
    case 'sodium': {
      // A dying sodium lamp: long stretches on, then it sags, buzzes and claws back.
      const e = eventIn(t, 9, 0.75, 1.2, 3.4, seed + 401);
      if (e < 0) return 0.95 + 0.04 * cn(t * 3, seed);
      if (reduce) return 0.45 + 0.3 * noise1(e * 1.5, seed);
      return hash1(Math.floor(e / 0.07), seed + 11) < 0.5 ? 0.1 + 0.15 * noise1(e * 8, seed) : 0.75;
    }
    default: return 1;
  }
}

// ---- on/off transitions ---------------------------------------------------------------------------
// A transition is a small plain object evaluated by transitionLevel(tr, now). Building one may use a
// seeded sequence; evaluation is pure.

/** Fluorescent start: the starter clicks a few times (blinks), the tube catches dim, then warms up. */
export function makeStutterOn(now, seed, reduce, delay = 0) {
  if (reduce) return { kind: 'fade', t0: now + delay, from: 0, to: 1, dur: 0.55 };
  const blinks = [];
  let t = 0;
  const n = 2 + Math.floor(hash1(1, seed) * 3);
  for (let i = 0; i < n; i++) {
    const on = 0.03 + 0.06 * hash1(10 + i, seed);
    blinks.push(t, t + on, 0.55 + 0.45 * hash1(20 + i, seed));
    t += on + 0.07 + 0.26 * hash1(30 + i, seed);
  }
  return { kind: 'stutter', t0: now + delay, blinks, catchAt: t, ramp: 0.7 + 0.5 * hash1(40, seed) };
}

/** The tube dies: a last flare and a quick phosphor fade. Also used for the Colonel's shroud. */
export function makeFluorOff(now, from, seed, reduce) {
  if (reduce) return { kind: 'fade', t0: now, from, to: 0, dur: 0.35 };
  return { kind: 'fluorOff', t0: now, from, flare: 0.04 + 0.05 * hash1(3, seed) };
}

export function makeFade(now, from, to, dur, delay = 0) {
  return { kind: 'fade', t0: now + delay, from, to, dur: Math.max(0.001, dur) };
}

/** Big banks slamming on (gym, spotlight): instant, with a brief overshoot. */
export function makeBang(now, reduce, delay = 0) {
  return { kind: 'bang', t0: now + delay, over: reduce ? 0 : 0.35 };
}

/**
 * Evaluate a transition. Returns the level (≈ 0..1.35) or -1 when finished (caller then drops it
 * and uses its steady target level).
 */
export function transitionLevel(tr, now) {
  const e = now - tr.t0;
  switch (tr.kind) {
    case 'fade': {
      if (e < 0) return tr.from;
      if (e >= tr.dur) return -1;
      const u = e / tr.dur;
      return tr.from + (tr.to - tr.from) * (u * u * (3 - 2 * u));
    }
    case 'stutter': {
      if (e < 0) return 0;
      const b = tr.blinks;
      if (e < tr.catchAt) {
        for (let i = 0; i < b.length; i += 3) if (e >= b[i] && e < b[i + 1]) return b[i + 2];
        return 0;
      }
      const u = (e - tr.catchAt) / tr.ramp;
      if (u >= 1) return -1;
      return 0.62 + 0.38 * (1 - (1 - u) * (1 - u));
    }
    case 'fluorOff': {
      if (e < 0) return tr.from;
      if (e < tr.flare) return Math.min(1.15, tr.from * 1.15);
      const u = (e - tr.flare) / 0.22;
      if (u >= 1) return -1;
      return tr.from * 0.3 * (1 - u) * (1 - u); // phosphor afterglow
    }
    case 'bang': {
      if (e < 0) return 0;
      if (e >= 0.3) return -1;
      return 1 + tr.over * (1 - e / 0.3) * (1 - e / 0.3);
    }
    default: return -1;
  }
}

// ---- falloff --------------------------------------------------------------------------------------
/**
 * Radial falloff used for every point light, its gradient stops and lightAt(): a soft plateau in
 * the middle (half smoothstep, half cubic) so pools read as pools rather than hot pinpoints.
 */
export function falloff(t) {
  if (t >= 1) return 0;
  if (t <= 0) return 1;
  const s = 1 - t;
  return 0.55 * s * s * (1 + 2 * t) + 0.45 * s * s * s;
}

/** Fluorescent pool: broader and flatter (a long tube, not a point). */
export function falloffTube(t) {
  if (t >= 1) return 0;
  if (t <= 0) return 1;
  const s = 1 - t;
  return s * s * (1 + 2 * t) * (0.82 + 0.18 * s);
}

/** Flashlight cone profile (shared by the texture, lightAt and the beam motes). */
export const CONE = {
  /** Angular term: θ = |angle off axis|, h = half-angle (rad). Wide, soft shoulders. */
  ang(theta, h) {
    const inner = h * 0.28;
    const outer = h * 1.32;
    if (theta <= inner) return 1;
    if (theta >= outer) return 0;
    const u = 1 - (theta - inner) / (outer - inner);
    return u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
  },
  /** Radial term, d = distance / radius. Dimmer at the hand, strongest at the throw, then dies away. */
  rad(d) {
    if (d >= 1) return 0;
    const rise = 0.5 + 0.5 * Math.min(1, d / 0.3);
    const s = 1 - d;
    return rise * (0.3 * s + 0.7 * s * s);
  },
  /** Hot spot along the axis around a third of the throw (where the beam meets the floor). */
  hot(d, theta, h) {
    const a = theta / (h * 0.5);
    const r = (d - 0.36) / 0.19;
    return Math.exp(-(a * a + r * r));
  },
  /**
   * The whole cone (texture, lightAt and beam motes all use this): body + optional hotspot weight
   * + a small lobe right at the lens so the beam visibly starts at the hand.
   */
  value(d, theta, h, hot = 0) {
    if (d >= 1) return 0;
    let v = CONE.rad(d) * CONE.ang(theta, h);
    if (hot) v += hot * CONE.hot(d, theta, h) * (1 - d);
    if (d < 0.07) v += 0.25 * (1 - d / 0.07) * (theta < Math.PI / 2 ? 1 : 0.3);
    return v;
  },
};
