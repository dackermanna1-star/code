// Procedural sound bank: every sound the game plays is synthesised at startup (pure DSP, see
// src/audio/synth/*) and optionally layered with CC0 samples (src/audio/samples.ts).
//
// =============================================================================================
// SOUND IDS  (play(id, pos, { size }) also accepts a FAMILY id: "impact.wood" picks the size
// class nearest to opts.size and pitch-corrects; aliases like "fridgeHum" resolve too)
// ---------------------------------------------------------------------------------------------
// impact.<profile>.<s|m|l>  modal impacts; profile = glass ceramic stone concrete drywall wood
//                           metal metalThin plastic electronics soft paper flesh; size classes
//                           s=0.08 m, m=0.3 m, l=1.1 m (4 variations each)
// surface.<p>               damped local response of heavy bonded structure (floor, wall, slab,
//                           mounted pane): p = wood ceramic stone concrete drywall glass metal
//                           metalThin plastic
// tick.<p>                  tiny debris clicks (p = glass ceramic wood drywall concrete metal plastic)
// rattle.<p>                debris settling sequences (pieces bouncing, physically timed)
// shatter.glass.<s|l>       annealed glass shatter (glassware / window pane with floor cluster)
// shatter.tempered          tempered glass dicing shower
// shatter.ceramic.<s|l>     ceramic shatter (mug/plate / toilet/sink)
// break.wood.crack|snap|splinter, break.drywall.punch|crumble, break.concrete.chip|crumble,
// break.plastic.crack|snap  material/mode-specific fracture sounds
// metal.dent|tear|clang     sheet-metal crunch, tearing, heavy clang
// bond.screw|nail|glue|weld|mortar|bolt|clip|press|hinge|latch|slider   fastener failures
// crack.glass|ceramic|wood|plastic|dull                                  crack crackles
// tear.cloth|paper          rips (sharp tools on soft materials)
// creak.hinge|wood|metal    one-shot creaks / groans (prying, settling)
// strain.wood|metal|drywall|hinge   LOOPS: strain creak while prying/pulling (gain/pitch by stress)
// scrape.wood|metal|stone   LOOPS, loop()-only: dragging/sliding friction (gain by speed);
//                           no event carries sliding contacts yet, the integrator drives them
// swing.light|medium|heavy  tool/fist swing whooshes (heavier = lower, slower)
// punch.thud kick.thud ouch stomp jump land   body sounds
// step.wood|tile|carpet|concrete   footsteps per floor (laminate/hardwood, tile, carpet, concrete)
// step.debris               crunch layer when walking over broken glass / crumbs
// cloth.grab|throw|drop     cloth whooshes/rustles
// door.creak|latch|slam     play()-only: no gameplay event maps to them yet (doors emit
//                           impact / bondBreak / strain); kept for the integrator / interact code
// bulb.pop spark.crackle elec.clunk   electrical one-shots;  elec.buzz  LOOP (mains)
// water.spray LOOP, water.drip
// fridge.hum LOOP (mains), motor.hum LOOP (mains, ceiling fan), motor.stop
// amb.city LOOP (stereo), amb.wind LOOP (stereo), amb.horn
// alarm.chirp fall.distant settle tool.transient ui.click ui.tool
// =============================================================================================
//
// PURE MODULE (no Web Audio): renders Float32Array PCM. src/audio/audio.ts turns the PCM into
// AudioBuffers while the loading screen runs (time-sliced, see generateBank()).

import type { SoundProfile } from "../destruction/model/materials.ts";
import { Rng, hash32 } from "../core/rng.ts";
import { Noise, highpass1, normalize, sanitize, trimTail } from "./synth/dsp.ts";
import { MODAL, SIZE_CLASSES, synthImpact, synthRattle, synthTick, type ModalProfile } from "./synth/modal.ts";
import * as B from "./synth/breaks.ts";
import * as F from "./synth/foley.ts";
import * as E from "./synth/env.ts";
import { SURFACE_PROFILES } from "./mapping.ts";

export type Bus = "sfx" | "ambience" | "ui";

export interface GenCtx {
  sr: number;
  rng: Rng;
  noise: Noise;
  /** Variant index. */
  v: number;
}

export interface SoundDef {
  id: string;
  variants: number;
  /** Nominal level (dB) for play(id) with gain 1. Event mappings compute their own levels. */
  level: number;
  bus: Bus;
  gen: (g: GenCtx) => Float32Array | Float32Array[];
  loop?: boolean;
  /** Render at half rate (content below ~10 kHz): halves memory and CPU. */
  lo?: boolean;
  /** Mains-powered loop: silenced on a power cut. */
  mains?: boolean;
  /** Characteristic size (m) the sound was rendered for, and the pitch exponent vs size. */
  size?: number;
  sizeExp?: number;
}

export const PROFILES: readonly SoundProfile[] = ["glass", "ceramic", "stone", "concrete", "drywall", "wood", "metal", "metalThin", "plastic", "electronics", "soft", "paper", "flesh"];
export const DEBRIS_PROFILES = ["glass", "ceramic", "wood", "drywall", "concrete", "metal", "plastic"] as const;
export type DebrisProfile = (typeof DEBRIS_PROFILES)[number];

const LO_PROFILES = new Set<SoundProfile>(["concrete", "drywall", "soft", "paper", "flesh"]);
/** Medium-size classes whose partials and noise stay below ~10 kHz (rendered at half rate). */
const LO_MEDIUM = new Set<SoundProfile>(["ceramic", "stone", "wood", "metalThin", "plastic", "electronics"]);
/** Render half-rate when the class content is band-limited (all large classes are). */
const isLo = (p: SoundProfile, sc: "s" | "m" | "l"): boolean => LO_PROFILES.has(p) || sc === "l" || (sc === "m" && LO_MEDIUM.has(p));
const RATTLE_PIECES: Record<DebrisProfile, [number, number]> = {
  glass: [6, 14],
  ceramic: [4, 10],
  wood: [3, 7],
  drywall: [6, 12],
  concrete: [5, 10],
  metal: [2, 5],
  plastic: [3, 6],
};

function d(id: string, variants: number, level: number, gen: SoundDef["gen"], extra: Partial<SoundDef> = {}): SoundDef {
  return { id, variants, level, bus: "sfx", gen, ...extra };
}

function buildDefs(): SoundDef[] {
  const defs: SoundDef[] = [];
  for (const p of PROFILES) {
    const prof: ModalProfile = MODAL[p];
    for (const sc of ["s", "m", "l"] as const) {
      const size = SIZE_CLASSES[sc];
      defs.push(d(`impact.${p}.${sc}`, 4, -8, (g) => synthImpact(g.sr, g.rng, g.noise, prof, size * g.rng.range(0.92, 1.08)), { lo: isLo(p, sc), size, sizeExp: prof.sizeExp }));
    }
  }
  for (const p of SURFACE_PROFILES) {
    // Damped "surface" response of heavy bonded structure (floors, walls, slabs, mounted panes).
    const b = MODAL[p];
    const prof: ModalProfile = {
      ...b,
      alphaG: b.alphaG * 4 + 25,
      alphaR: b.alphaR * 3,
      beat: 0,
      wobble: 0,
      rattle: 0,
      noiseAmp: b.noiseAmp * 1.4 + 0.15,
      thumpHz: b.thumpHz ?? 95,
      thumpAmp: Math.max(b.thumpAmp ?? 0, 0.55),
      thumpDecay: b.thumpDecay ?? 0.03,
      maxLen: Math.min(b.maxLen, 0.5),
    };
    defs.push(d(`surface.${p}`, 4, -12, (g) => synthImpact(g.sr, g.rng, g.noise, prof, 0.6 * g.rng.range(0.85, 1.15)), { lo: true }));
  }
  for (const p of DEBRIS_PROFILES) {
    const prof = MODAL[p];
    defs.push(d(`tick.${p}`, 6, -22, (g) => synthTick(g.sr, g.rng, g.noise, prof, g.rng.range(0.012, 0.035)), { size: 0.022, sizeExp: 0.6 }));
    const [a, b] = RATTLE_PIECES[p];
    defs.push(d(`rattle.${p}`, 3, -16, (g) => synthRattle(g.sr, g.rng, g.noise, prof, g.rng.int(a, b))));
  }
  defs.push(
    d("shatter.glass.s", 4, -6, (g) => B.shatterGlass(g, false), { size: 0.12, sizeExp: 0.35 }),
    d("shatter.glass.l", 4, -2, (g) => B.shatterGlass(g, true), { size: 0.9, sizeExp: 0.35 }),
    d("shatter.tempered", 3, -2, (g) => B.shatterTempered(g)),
    d("shatter.ceramic.s", 4, -6, (g) => B.shatterCeramic(g, false), { size: 0.12, sizeExp: 0.4 }),
    d("shatter.ceramic.l", 4, -3, (g) => B.shatterCeramic(g, true), { size: 0.5, sizeExp: 0.4 }),
    d("break.wood.crack", 4, -6, B.woodCrack, { size: 0.5, sizeExp: 0.3 }),
    d("break.wood.snap", 4, -4, B.woodSnap, { size: 0.5, sizeExp: 0.3 }),
    d("break.wood.splinter", 4, -5, B.woodSplinter, { size: 0.4, sizeExp: 0.25 }),
    d("break.drywall.punch", 4, -4, B.drywallPunch, { lo: true }),
    d("break.drywall.crumble", 3, -4, B.drywallCrumble, { lo: true }),
    d("break.concrete.chip", 4, -8, B.concreteChip),
    d("break.concrete.crumble", 3, -4, B.concreteCrumble),
    d("break.plastic.crack", 4, -8, B.plasticCrack, { size: 0.2, sizeExp: 0.3 }),
    d("break.plastic.snap", 3, -8, B.plasticSnap, { size: 0.3, sizeExp: 0.3 }),
    d("metal.dent", 4, -6, B.metalDent, { size: 0.4, sizeExp: 0.3 }),
    d("metal.tear", 3, -8, B.metalTear),
    d("metal.clang", 3, -4, B.metalClang, { size: 0.7, sizeExp: 0.5, lo: true }),
    d("bond.screw", 4, -12, B.bondScrew),
    d("bond.nail", 3, -12, B.bondNail),
    d("bond.glue", 3, -12, B.bondGlue),
    d("bond.weld", 3, -12, B.bondWeld),
    d("bond.mortar", 3, -12, B.bondMortar),
    d("bond.bolt", 3, -10, B.bondBolt),
    d("bond.clip", 3, -14, B.bondClip),
    d("bond.press", 3, -14, B.bondPress),
    d("bond.hinge", 3, -10, B.bondHinge),
    d("bond.latch", 3, -12, B.bondLatch),
    d("bond.slider", 3, -12, B.bondSlider),
    d("crack.glass", 4, -14, B.crackGlass),
    d("crack.ceramic", 3, -14, B.crackCeramic),
    d("crack.wood", 3, -14, B.crackWood),
    d("crack.plastic", 3, -16, B.crackPlastic),
    d("crack.dull", 3, -14, B.crackDull),
    d("tear.cloth", 3, -10, B.tearCloth),
    d("tear.paper", 3, -12, B.tearPaper),
    d("creak.hinge", 3, -12, (g) => F.creak(g, "hinge")),
    d("creak.wood", 3, -12, (g) => F.creak(g, "wood"), { lo: true }),
    d("creak.metal", 3, -12, (g) => F.creak(g, "metal"), { lo: true }),
    d("strain.wood", 1, -14, (g) => F.strainLoop(g, "wood"), { loop: true, lo: true }),
    d("strain.metal", 1, -14, (g) => F.strainLoop(g, "metal"), { loop: true, lo: true }),
    d("strain.drywall", 1, -14, (g) => F.strainLoop(g, "drywall"), { loop: true, lo: true }),
    d("strain.hinge", 1, -14, (g) => F.strainLoop(g, "hinge"), { loop: true }),
    d("scrape.wood", 1, -14, (g) => F.scrapeLoop(g, "wood"), { loop: true, lo: true }),
    d("scrape.metal", 1, -14, (g) => F.scrapeLoop(g, "metal"), { loop: true }),
    d("scrape.stone", 1, -14, (g) => F.scrapeLoop(g, "stone"), { loop: true, lo: true }),
    d("swing.light", 3, -14, (g) => F.swing(g, "light")),
    d("swing.medium", 3, -14, (g) => F.swing(g, "medium")),
    d("swing.heavy", 3, -14, (g) => F.swing(g, "heavy"), { lo: true }),
    d("punch.thud", 4, -8, F.punchThud, { lo: true }),
    d("kick.thud", 3, -6, F.kickThud, { lo: true }),
    d("ouch", 3, -8, F.ouch),
    d("stomp", 3, -6, F.stomp, { lo: true }),
    d("jump", 3, -22, F.jump),
    d("land", 3, -12, F.land, { lo: true }),
    d("step.wood", 6, -22, F.stepWood),
    d("step.tile", 6, -22, F.stepTile),
    d("step.carpet", 6, -24, F.stepCarpet, { lo: true }),
    d("step.concrete", 6, -22, F.stepConcrete),
    d("step.debris", 4, -20, F.stepDebris),
    d("cloth.grab", 3, -22, F.clothGrab),
    d("cloth.throw", 3, -20, F.clothThrow),
    d("cloth.drop", 3, -24, F.clothDrop),
    d("door.creak", 3, -12, F.doorCreak),
    d("door.latch", 3, -12, F.doorLatch),
    d("door.slam", 3, -4, F.doorSlam),
    d("bulb.pop", 3, -8, E.bulbPop),
    d("spark.crackle", 4, -10, E.sparkCrackle),
    d("elec.buzz", 1, -22, E.elecBuzz, { loop: true, mains: true, bus: "ambience", lo: true }),
    d("elec.clunk", 2, -10, E.elecClunk),
    d("water.spray", 1, -14, E.waterSpray, { loop: true, bus: "ambience", lo: true }),
    d("water.drip", 4, -20, E.waterDrip),
    d("fridge.hum", 1, -24, E.fridgeHum, { loop: true, mains: true, bus: "ambience", lo: true }),
    d("motor.hum", 1, -24, E.motorHum, { loop: true, mains: true, bus: "ambience", lo: true }),
    d("motor.stop", 2, -16, E.motorStop, { lo: true }),
    d("amb.city", 1, -20, E.cityAmbience, { loop: true, bus: "ambience", lo: true }),
    d("amb.wind", 1, -18, E.windLoop, { loop: true, bus: "ambience", lo: true }),
    d("amb.horn", 4, -26, E.horn, { bus: "ambience", lo: true }),
    d("alarm.chirp", 1, -10, E.alarmChirp),
    d("fall.distant", 3, -14, E.fallDistant, { lo: true }),
    d("settle", 3, -14, F.settle),
    d("tool.transient", 4, -10, F.toolTransient),
    d("ui.click", 2, -16, F.uiClick, { bus: "ui" }),
    d("ui.tool", 2, -14, F.uiTool, { bus: "ui" }),
  );
  return defs;
}

export const SOUND_DEFS: readonly SoundDef[] = buildDefs();
export const SOUND_BY_ID: ReadonlyMap<string, SoundDef> = new Map(SOUND_DEFS.map((s) => [s.id, s]));

/** Extra aliases (canonical form: lower-case alphanumerics) → sound id. */
const ALIASES: Record<string, string> = {
  hum: "fridge.hum",
  fridge: "fridge.hum",
  fridgehum: "fridge.hum",
  aquariumhum: "fridge.hum",
  compressor: "fridge.hum",
  fanhum: "motor.hum",
  fan: "motor.hum",
  motor: "motor.hum",
  buzz: "elec.buzz",
  electricbuzz: "elec.buzz",
  elecbuzz: "elec.buzz",
  spark: "spark.crackle",
  sparks: "spark.crackle",
  water: "water.spray",
  spray: "water.spray",
  leak: "water.spray",
  drip: "water.drip",
  alarm: "alarm.chirp",
  chirp: "alarm.chirp",
  smokealarm: "alarm.chirp",
  smokedetector: "alarm.chirp",
  city: "amb.city",
  traffic: "amb.city",
  wind: "amb.wind",
  horn: "amb.horn",
  click: "ui.click",
  latch: "door.latch",
  slam: "door.slam",
  creak: "door.creak",
  pop: "bulb.pop",
  whoosh: "swing.medium",
  footstep: "step.wood",
  scrape: "scrape.wood",
  drag: "scrape.wood",
};

export const canonical = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]/g, "");
const CANON = new Map<string, string>();
for (const s of SOUND_DEFS) CANON.set(canonical(s.id), s.id);
for (const [k, v] of Object.entries(ALIASES)) if (!CANON.has(k)) CANON.set(k, v);

export interface Resolved {
  def: SoundDef;
  /** Playback-rate correction for the requested size (1 when not size-driven). */
  rate: number;
}

const SIZED = new Map<string, SoundDef[]>();
for (const s of SOUND_DEFS) {
  const m = /^(.*)\.(s|m|l)$/.exec(s.id);
  if (m && s.size) {
    const list = SIZED.get(m[1]) ?? [];
    list.push(s);
    SIZED.set(m[1], list);
  }
}

/** Playback rate that moves a sound rendered at size `ref` to size `size`. */
export function sizeRate(def: SoundDef, size: number | undefined): number {
  if (!def.size || !def.sizeExp || !(size !== undefined && size > 0 && Number.isFinite(size))) return 1;
  const r = Math.pow(def.size / size, def.sizeExp);
  return r < 0.5 ? 0.5 : r > 2 ? 2 : r;
}

/**
 * Resolve an id (exact, family + size, or alias) to a definition and size-rate correction.
 * Returns null for unknown ids.
 */
export function resolveSound(id: string, size?: number): Resolved | null {
  let def = SOUND_BY_ID.get(id);
  let family = SIZED.get(id);
  if (!def && !family) {
    const c = CANON.get(canonical(id));
    if (c) {
      def = SOUND_BY_ID.get(c);
      family = def ? undefined : SIZED.get(c);
    }
  }
  if (!def && family && family.length) {
    // Choose the class nearest in log-size (default: medium).
    const want = size !== undefined && size > 0 && Number.isFinite(size) ? size : 0.3;
    let best = family[0];
    let bd = Infinity;
    for (const f of family) {
      const dd = Math.abs(Math.log((f.size ?? 0.3) / want));
      if (dd < bd) {
        bd = dd;
        best = f;
      }
    }
    def = best;
  }
  if (!def) return null;
  return { def, rate: sizeRate(def, size) };
}

/** Names of the size-class families (e.g. "impact.wood"). */
export const SIZE_FAMILIES: readonly string[] = [...SIZED.keys()];

// ------------------------------------------------------------------------------ rendering

/** FNV-1a string hash. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Loudness targets: one-shots by max-50 ms RMS, loops by whole-file RMS. */
export const NORM_ONESHOT_DB = -16;
export const NORM_LOOP_DB = -20;
export const NORM_PEAK_DB = -1;

export interface RenderedSound {
  sr: number;
  chans: Float32Array[];
}

/** Sample rate used for a definition given the bank's base rate. */
export function defRate(def: SoundDef, baseSr: number): number {
  return def.lo ? Math.max(22050, Math.round(baseSr / 2)) : baseSr;
}

/**
 * Render one variation of a sound deterministically (seeded by id + variant), sanitised,
 * DC-blocked, tail-trimmed and loudness-normalised.
 */
export function renderVariant(def: SoundDef, v: number, baseSr: number): RenderedSound {
  const sr = defRate(def, baseSr);
  const rng = new Rng(hash32(hashStr(def.id) ^ Math.imul(v + 1, 0x9e3779b1)));
  const noise = new Noise(rng.int(1, 0x7fffffff));
  let res: Float32Array | Float32Array[];
  try {
    res = def.gen({ sr, rng, noise, v });
  } catch (e) {
    console.error(`audio: generator for '${def.id}' failed`, e);
    res = new Float32Array(Math.ceil(sr * 0.05));
  }
  let chans = Array.isArray(res) ? res : [res];
  for (const c of chans) sanitize(c);
  if (!def.loop) {
    chans = chans.map((c) => trimTail(highpass1(c, sr, 18), sr));
    // Equalise channel lengths after trimming.
    const len = Math.max(...chans.map((c) => c.length));
    chans = chans.map((c) => (c.length === len ? c : (() => { const o = new Float32Array(len); o.set(c); return o; })()));
  }
  normalize(chans, sr, def.loop ? NORM_LOOP_DB : NORM_ONESHOT_DB, NORM_PEAK_DB, !!def.loop);
  return { sr, chans };
}

/** Yield to the event loop (lets the loading bar repaint between slices). */
export function yieldMacrotask(): Promise<void> {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sch && typeof sch.yield === "function") return sch.yield();
  if (typeof MessageChannel !== "undefined") {
    return new Promise((res) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        res();
      };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((res) => setTimeout(res, 0));
}

export interface GenerateOpts {
  /** Base sample rate (Hz). */
  sr: number;
  /** Total CPU budget (ms) for optional extra variations; the first variation of every sound is always made. */
  budgetMs?: number;
  /** Max time per slice before yielding (ms). */
  sliceMs?: number;
  onProgress?: (fraction: number) => void;
  /** Receives every rendered variation. */
  sink: (def: SoundDef, variant: number, r: RenderedSound) => void;
  /** Restrict to these ids (tests). */
  only?: (def: SoundDef) => boolean;
  /** Synchronous (no yielding) — Node tests. */
  sync?: boolean;
}

export interface GenerateStats {
  ms: number;
  cpuMs: number;
  buffers: number;
  samples: number;
  bytes: number;
  skippedVariants: number;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Generate the bank. Order: variation 0 of every sound first, then variation 1, … so that a
 * blown budget only reduces variety, never coverage.
 */
export async function generateBank(o: GenerateOpts): Promise<GenerateStats> {
  const defs = SOUND_DEFS.filter((s) => (o.only ? o.only(s) : true));
  const budget = o.budgetMs ?? 1500;
  const slice = o.sliceMs ?? 10;
  const maxV = Math.max(...defs.map((s) => s.variants));
  const total = defs.reduce((a, s) => a + s.variants, 0);
  const t0 = now();
  let cpu = 0;
  let done = 0;
  let buffers = 0;
  let samples = 0;
  let skipped = 0;
  let sliceStart = now();
  for (let v = 0; v < maxV; v++) {
    for (const def of defs) {
      if (v >= def.variants) continue;
      if (v > 0 && cpu > budget) {
        skipped++;
        done++;
        continue;
      }
      const ts = now();
      const r = renderVariant(def, v, o.sr);
      o.sink(def, v, r);
      cpu += now() - ts;
      buffers++;
      for (const c of r.chans) samples += c.length;
      done++;
      if (!o.sync && now() - sliceStart > slice) {
        o.onProgress?.(done / total);
        await yieldMacrotask();
        sliceStart = now();
      }
    }
  }
  o.onProgress?.(1);
  return { ms: now() - t0, cpuMs: cpu, buffers, samples, bytes: samples * 4, skippedVariants: skipped };
}
