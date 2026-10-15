// Sound registry: every playable SFX name -> recipe + playback metadata, and the renderer that
// turns a recipe into normalised, click-free sample data. Pure JS (Worker-safe).
import { Synth, hashStr, peakOf, rmsOf, softLimit } from './dsp.js';
import { WEAPON_SOUNDS } from './weapons.js';
import { WORLD_SOUNDS } from './world.js';
import { VOICE_SOUNDS, COMMON_SOUNDS, SPECIAL_SOUNDS } from './voices.js';
import { AMBIENCE_SOUNDS } from './ambience.js';

/** distance presets (metres) for the PannerNode inverse model + engine edge fade at `max` */
export const DISTANCES = {
  gun: { ref: 7, max: 110 },        // audible ~80 m
  boom: { ref: 12, max: 170 },
  step: { ref: 1.2, max: 16 },      // ~15 m
  stepBig: { ref: 6, max: 55 },
  mech: { ref: 1.2, max: 14 },
  impact: { ref: 2, max: 40 },
  item: { ref: 1.5, max: 18 },
  world: { ref: 3, max: 40 },
  vox: { ref: 2, max: 32 },
  zed: { ref: 2.2, max: 27 },       // moans ~25 m
  zedLoud: { ref: 4, max: 45 },
  horde: { ref: 14, max: 70 },      // ~60 m
  special: { ref: 3.5, max: 48 },
  tank: { ref: 9, max: 90 },
  alarm: { ref: 9, max: 95 },
  heli: { ref: 22, max: 230 },
  amb: { ref: 6, max: 60 },
};

export const SOUND_DEFS = {
  ...WEAPON_SOUNDS, ...WORLD_SOUNDS, ...VOICE_SOUNDS, ...COMMON_SOUNDS, ...SPECIAL_SOUNDS, ...AMBIENCE_SOUNDS,
};

// generation priority groups (lower = earlier). Group 0 is awaited by init().
const GROUP_PRIO = { weapon: 0, impact: 0, step: 0, ui: 0, common: 0, survivor: 1, item: 1, special: 1, world: 1, amb: 2 };

for (const [name, d] of Object.entries(SOUND_DEFS)) {
  d.name = name;
  d.v = d.v || 1;
  d.sr = d.sr || 22050;
  d.cat = d.cat || 'sfx';
  d.loop = !!d.loop;
  d.prio = d.prio ?? 0.5;
  d.gain = d.gain ?? 1;
  d.maxInst = d.maxInst ?? 6;
  d.burst = d.burst ?? 2;
  const dist = DISTANCES[d.dist || 'world'] || DISTANCES.world;
  d.ref = d.ref ?? dist.ref;
  d.max = d.max ?? dist.max;
  d.rolloff = d.rolloff ?? 1;
  d.genPrio = (GROUP_PRIO[d.group] ?? 1) + (d.loop ? 1 : 0);
}

export const SOUND_NAMES = Object.keys(SOUND_DEFS);

/** Render one variant -> { channels: Float32Array[], sampleRate, loop } */
export function renderSound(name, variant = 0) {
  const def = SOUND_DEFS[name];
  if (!def) throw new Error('unknown sound ' + name);
  const S = new Synth(def.sr, (hashStr(name) ^ Math.imul(variant + 1, 0x9E3779B1)) >>> 0);
  const out = def.gen(S, variant);
  let chs = Array.isArray(out) ? out : [out];
  for (const c of chs) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) c[i] = 0;
  let pk = 0, rs = 0;
  for (const c of chs) { pk = Math.max(pk, peakOf(c)); rs += rmsOf(c) ** 2; }
  rs = Math.sqrt(rs / chs.length);
  if (def.loop) {
    // loops: ~-12 dBFS RMS, gently limited
    const target = def.rms ?? 0.25;
    const g = Math.min(target / Math.max(rs, 1e-9), 1.6 / Math.max(pk, 1e-9));
    for (const c of chs) S.mul(c, g);
    softLimit(chs, 0.98, 0.75);
  } else {
    const g = (def.peak ?? 0.7) / Math.max(pk, 1e-9);
    for (const c of chs) S.mul(c, g);
    // trim inaudible tail (keeps voices short-lived), then click-free edges
    const thr = 0.0004;
    let end = chs[0].length;
    const loud = (i) => { for (const c of chs) if (Math.abs(c[i]) > thr) return true; return false; };
    while (end > 1 && !loud(end - 1)) end--;
    end = Math.min(chs[0].length, end + S.len(0.01));
    chs = chs.map((c) => (end < c.length ? c.slice(0, end) : c));
    for (const c of chs) S.fade(c, def.fadeIn ?? 0.001, Math.min(def.fadeOut ?? 0.015, c.length / def.sr / 3));
    // pad a few ms of true silence so the buffer always ends at rest
    const pad = S.len(0.005);
    chs = chs.map((c) => { const o = new Float32Array(c.length + pad); o.set(c); return o; });
  }
  return { channels: chs, sampleRate: def.sr, loop: def.loop };
}
