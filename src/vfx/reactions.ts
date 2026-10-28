// Gameplay event → visual effect mapping (PURE MODULE — no Babylon imports, unit-tested).
//
// Destruction/player systems emit events (src/core/events.ts); this module decides which
// particle bursts, debris kicks and settled-dust patches they produce, by material:
//   fracture  → material dust sized by broken volume/energy, glass glitter, wood splinters,
//               electronics sparks + smoke, chips; kicks settled debris nearby; crumbly
//               materials leave a dust patch on the floor below
//   impact    → small dust puff of the softer material; sparks for metal on metal/stone at
//               speed; heavy impacts scatter settled debris
//   chip / crack / bondBreak / toolHit / strain → small material-specific bursts
//   feature   → sparks, bulb pops (glass + sparks), smoking electronics, water splashes
//   land / footstep → tiny dust on dusty floors, debris pushed around by feet
//   split     → a puff of dust where something tore loose
// Rate limits keep pathological event storms (hundreds of impacts per frame) cheap.

import type { VfxKind } from "../core/context.ts";
import type { GameEvents, ImpactEv, FractureEv } from "../core/events.ts";
import type { Vec3 } from "../geom/vec.ts";
import { MATERIALS, type MaterialId } from "../destruction/model/materials.ts";

export interface ReactionSink {
  burst(kind: VfxKind, pos: Vec3, normal: Vec3, intensity: number, opts?: { tint?: number; dir?: Vec3; radius?: number }): void;
  /** Scatter settled micro-debris around a point (radius m, peak speed m/s). */
  kick(pos: Vec3, radius: number, speed: number): void;
  /** A patch of settled dust on the floor below `pos` (diameter m). */
  dustPatch(pos: Vec3, size: number, tint: number): void;
  /** Re-check settled debris near a point (its support may have moved). */
  disturb(pos: Vec3, radius: number): void;
  /** Seconds (monotonic) for rate limiting. */
  now(): number;
  /** Random in [0, 1) (injectable for tests). */
  random(): number;
}

/** Visual identity of a material. */
export interface MatFx {
  /** Dust cloud kind (null = makes no dust). */
  dust: VfxKind | null;
  dustTint?: number;
  /** Flying chips/bits kind. */
  chips: VfxKind | null;
  chipTint?: number;
  splinters?: boolean;
  glass?: boolean;
  sparks?: boolean;
  metal?: boolean;
  /** Hard mineral surface (sparks when struck by steel at speed). */
  hard?: boolean;
  /** Settled-dust patch colour for crumbly materials. */
  patch?: number;
}

export const MAT_FX: Readonly<Record<MaterialId, MatFx>> = {
  glass: { dust: null, chips: "glassGlitter", glass: true },
  temperedGlass: { dust: null, chips: "glassGlitter", glass: true },
  ceramic: { dust: "dust", dustTint: 0xe8e6e1, chips: "ceramicChips", hard: true },
  tile: { dust: "dust", dustTint: 0xe2ddd4, chips: "ceramicChips", hard: true },
  stone: { dust: "concreteDust", dustTint: 0x9a948c, chips: "concreteDust", hard: true },
  concrete: { dust: "concreteDust", chips: "concreteDust", hard: true, patch: 0x9c9a96 },
  gypsum: { dust: "drywallDust", chips: "drywallDust", patch: 0xdedbd3 },
  plaster: { dust: "drywallDust", dustTint: 0xe9e3d6, chips: "drywallDust", patch: 0xe0d9cb },
  softwood: { dust: "woodChips", dustTint: 0xcfab72, chips: "woodChips", chipTint: 0xd8b47c, splinters: true },
  hardwood: { dust: "woodChips", dustTint: 0x8f6040, chips: "woodChips", chipTint: 0x9a6a44, splinters: true },
  plywood: { dust: "woodChips", dustTint: 0xc9a46e, chips: "woodChips", chipTint: 0xd0aa72, splinters: true },
  mdf: { dust: "dust", dustTint: 0xa88459, chips: "woodChips", chipTint: 0xa98457 },
  particleboard: { dust: "dust", dustTint: 0xb89663, chips: "woodChips", chipTint: 0xbf9b63 },
  steelSheet: { dust: null, chips: null, metal: true },
  steel: { dust: null, chips: null, metal: true },
  aluminum: { dust: null, chips: null, metal: true },
  castIron: { dust: "dust", dustTint: 0x55524f, chips: null, metal: true, hard: true },
  copper: { dust: null, chips: null, metal: true },
  plastic: { dust: null, chips: "plasticBits" },
  acrylic: { dust: null, chips: "plasticBits", chipTint: 0xf2f2ee },
  pcb: { dust: null, chips: "plasticBits", chipTint: 0x2f6b3a, sparks: true },
  lcd: { dust: null, chips: "glassGlitter", glass: true, sparks: true },
  rubber: { dust: null, chips: null },
  fabric: { dust: "dust", dustTint: 0x9a948a, chips: "foam" },
  foam: { dust: null, chips: "foam" },
  paper: { dust: null, chips: "paper" },
  cardboard: { dust: "dust", dustTint: 0xa88d66, chips: "paper", chipTint: 0xb5935f },
  insulation: { dust: "insulationFluff", chips: "insulationFluff" },
  soil: { dust: "soil", chips: "soil" },
  food: { dust: null, chips: "liquid", chipTint: 0xb5502c },
  flesh: { dust: null, chips: null },
};

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const STEEL_TOOLS = new Set(["hammer", "sledgehammer", "crowbar", "axe", "extinguisher"]);

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const neg = (v: Vec3): Vec3 => ({ x: -v.x, y: -v.y, z: -v.z });
const fin = (v: Vec3 | undefined | null): v is Vec3 => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function fxOf(mat: MaterialId | null | undefined): MatFx | null {
  return mat ? (MAT_FX[mat] ?? null) : null;
}

/** Dust-cloud intensity for a fracture: grows with broken volume and (weakly) energy. */
export function fractureIntensity(ev: Pick<FractureEv, "volume" | "energy">): number {
  const v = Number.isFinite(ev.volume) ? Math.max(0, ev.volume) : 0;
  const e = Number.isFinite(ev.energy) ? Math.max(0, ev.energy) : 0;
  return clamp(Math.sqrt(v / 2e-4) + 0.2 * Math.log10(1 + e), 0.25, 8);
}

/** Simple token bucket per channel. */
class Limiter {
  private tokens: number;
  private last = -1;
  private readonly rate: number;
  private readonly burst: number;
  constructor(rate: number, burst: number) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
  }
  take(now: number): boolean {
    if (this.last >= 0) this.tokens = Math.min(this.burst, this.tokens + (now - this.last) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class Reactions {
  private readonly sink: ReactionSink;
  private readonly recentHits: Array<{ t: number; x: number; y: number; z: number }> = [];
  private readonly lim = {
    impact: new Limiter(40, 12),
    sparks: new Limiter(20, 8),
    chip: new Limiter(40, 12),
    bond: new Limiter(40, 16),
    strain: new Limiter(6, 3),
    step: new Limiter(8, 4),
    kick: new Limiter(30, 10),
    fracture: new Limiter(60, 30),
  };

  constructor(sink: ReactionSink) {
    this.sink = sink;
  }

  /** Subscribe to every relevant event. Returns an unsubscribe function. */
  attach(events: { on<K extends keyof GameEvents>(t: K, fn: (e: GameEvents[K]) => void): () => void }): () => void {
    const offs = [
      events.on("fracture", (e) => this.fracture(e)),
      events.on("impact", (e) => this.impact(e)),
      events.on("chip", (e) => this.chip(e)),
      events.on("crack", (e) => this.crack(e)),
      events.on("bondBreak", (e) => this.bondBreak(e)),
      events.on("toolHit", (e) => this.toolHit(e)),
      events.on("feature", (e) => this.feature(e)),
      events.on("land", (e) => this.land(e)),
      events.on("footstep", (e) => this.footstep(e)),
      events.on("split", (e) => this.split(e)),
      events.on("strain", (e) => this.strain(e)),
      // debris resting on something the player picks up / throws / drops must re-check its support
      events.on("grab", (e) => this.moved(e.pos)),
      events.on("throw", (e) => this.moved(e.pos)),
      events.on("drop", (e) => this.moved(e.pos)),
    ];
    return () => offs.forEach((f) => f());
  }

  private kick(pos: Vec3, radius: number, speed: number): void {
    if (this.lim.kick.take(this.sink.now())) this.sink.kick(pos, radius, speed);
  }

  fracture(ev: GameEvents["fracture"]): void {
    if (!fin(ev.pos)) return;
    if (!this.lim.fracture.take(this.sink.now())) return;
    const m = fxOf(ev.mat);
    if (!m) return;
    const I = fractureIntensity(ev);
    const n = fin(ev.dir) && (ev.dir.x || ev.dir.y || ev.dir.z) ? neg(ev.dir) : UP;
    const size = Number.isFinite(ev.size) ? Math.max(0, ev.size) : 0.1;
    const radius = ev.global ? clamp(size * 0.35, 0.05, 0.7) : undefined;
    const s = this.sink;
    if (m.dust) s.burst(m.dust, ev.pos, n, I, { tint: m.dustTint, radius });
    if (m.chips && m.chips !== m.dust && !m.glass) s.burst(m.chips, ev.pos, n, I * 0.8, { tint: m.chipTint, radius });
    if (m.glass) {
      const Ig = clamp(0.6 + Math.sqrt(size) * 2 + I * 0.15, 0.4, 6);
      s.burst("glassGlitter", ev.pos, n, Ig, { radius });
      // shards fly out of both faces of a shattered pane
      if (fin(ev.dir)) s.burst("glassGlitter", ev.pos, ev.dir, Ig * 0.6, { radius });
    }
    if (m.splinters && (ev.mode === "splinter" || ev.global)) s.burst("splinters", ev.pos, n, clamp(I * 0.9, 0.3, 5), { tint: m.chipTint, radius });
    if (m.sparks) {
      s.burst("sparks", ev.pos, n, clamp(0.6 + I * 0.3, 0.5, 3));
      s.burst("smoke", ev.pos, UP, clamp(0.3 + I * 0.15, 0.3, 1.5));
    }
    if (m.patch && ev.volume > 5e-5) s.dustPatch(ev.pos, clamp(Math.sqrt(ev.volume) * 9, 0.3, 1.8), m.patch);
    this.kick(ev.pos, clamp(0.3 + 0.25 * Math.sqrt(I), 0.3, 1.2), clamp(0.8 + I * 0.4, 0.8, 4));
    s.disturb(ev.pos, clamp(size, 0.3, 2));
  }

  impact(ev: ImpactEv): void {
    if (!fin(ev.pos) || !(ev.energy >= 4)) return;
    const s = this.sink;
    const now = s.now();
    if (!this.lim.impact.take(now)) return;
    const a = fxOf(ev.matA),
      b = fxOf(ev.matB);
    const kA = MATERIALS[ev.matA]?.stiffness ?? 5;
    const kB = ev.matB ? (MATERIALS[ev.matB]?.stiffness ?? 5) : 10;
    const softer = kA <= kB ? a : b;
    const harder = kA <= kB ? b : a;
    const n = fin(ev.normal) ? ev.normal : UP;
    const nearHit = this.nearRecentHit(ev.pos, now);
    const Ie = clamp(Math.sqrt(ev.energy / 30), 0.2, 3);
    // dust puff of the softer side (or the other side if the softer one makes none)
    const dustFx = softer?.dust ? softer : harder?.dust ? harder : null;
    if (dustFx && !nearHit) s.burst(dustFx.dust!, ev.pos, n, Ie * 0.45, { tint: dustFx.dustTint });
    // sparks: steel on steel / steel on stone at speed
    const metalA = !!a?.metal,
      metalB = !!b?.metal;
    const hardA = !!a?.hard,
      hardB = !!b?.hard || ev.matB === null;
    const sparky = (metalA && (metalB || hardB)) || (metalB && hardA);
    if (sparky && ev.speed > 5 && ev.energy > 15) {
      const p = clamp((ev.speed - 5) / 6, 0.15, 0.9);
      if (s.random() < p && this.lim.sparks.take(now)) s.burst("sparks", ev.pos, n, clamp(0.4 + ev.energy / 150, 0.4, 2.5));
    }
    if (ev.energy > 30) this.kick(ev.pos, clamp(0.25 + 0.15 * Math.sqrt(ev.energy / 30), 0.25, 1.2), clamp(0.6 + 0.25 * Math.sqrt(ev.energy / 30), 0.6, 3));
  }

  chip(ev: GameEvents["chip"]): void {
    if (!fin(ev.pos)) return;
    if (!this.lim.chip.take(this.sink.now())) return;
    const m = fxOf(ev.mat);
    if (!m) return;
    const n = fin(ev.normal) ? ev.normal : UP;
    const I = clamp(0.25 + Math.sqrt(Math.max(0, ev.energy) / 40) * 0.4, 0.2, 1.5);
    if (m.chips) this.sink.burst(m.chips, ev.pos, n, I, { tint: m.chipTint });
    if (m.dust && m.dust !== m.chips) this.sink.burst(m.dust, ev.pos, n, I * 0.5, { tint: m.dustTint });
  }

  crack(ev: GameEvents["crack"]): void {
    if (!fin(ev.pos)) return;
    if (!this.lim.chip.take(this.sink.now())) return;
    const m = fxOf(ev.mat);
    if (!m) return;
    const n = fin(ev.normal) ? ev.normal : UP;
    const sev = clamp(Number.isFinite(ev.severity) ? ev.severity : 0, 0, 1);
    if (m.glass) this.sink.burst("glassGlitter", ev.pos, n, 0.1 + sev * 0.2);
    else if (m.dust) this.sink.burst(m.dust, ev.pos, n, 0.15 + sev * 0.45, { tint: m.dustTint });
  }

  bondBreak(ev: GameEvents["bondBreak"]): void {
    if (!fin(ev.pos)) return;
    const s = this.sink;
    if (!this.lim.bond.take(s.now())) return;
    const a = fxOf(ev.matA),
      b = fxOf(ev.matB);
    const E = Math.max(0, Number.isFinite(ev.energy) ? ev.energy : 0);
    const wood = a?.splinters ? a : b?.splinters ? b : null;
    const dusty = a?.dust ? a : b?.dust ? b : null;
    const metal = !!(a?.metal && (b?.metal ?? true));
    switch (ev.kind) {
      case "weld":
        s.burst("sparks", ev.pos, UP, clamp(0.5 + E / 80, 0.4, 2));
        break;
      case "screw":
      case "nail":
      case "dowel":
      case "hinge":
      case "latch":
      case "slider":
      case "bolt":
        if (wood) {
          s.burst("splinters", ev.pos, UP, clamp(0.35 + E / 100, 0.3, 1.5), { tint: wood.chipTint });
          s.burst("woodChips", ev.pos, UP, 0.3, { tint: wood.chipTint });
        } else if (dusty) s.burst(dusty.dust!, ev.pos, UP, clamp(0.35 + E / 120, 0.3, 1.5), { tint: dusty.dustTint });
        else if (metal && s.random() < 0.35) s.burst("sparks", ev.pos, UP, 0.35);
        break;
      case "glue":
      case "fused":
        if (dusty) s.burst(dusty.dust!, ev.pos, UP, clamp(0.25 + E / 150, 0.2, 1.2), { tint: dusty.dustTint });
        if (a?.chips && a.chips !== a.dust) s.burst(a.chips, ev.pos, UP, 0.3, { tint: a.chipTint });
        break;
      case "mortar":
        s.burst(a?.dust === "dust" || b?.dust === "dust" ? "ceramicChips" : "concreteDust", ev.pos, UP, clamp(0.4 + E / 100, 0.3, 1.5));
        break;
      case "clip":
      case "press":
      case "friction":
        if (a?.chips === "plasticBits" || b?.chips === "plasticBits") s.burst("plasticBits", ev.pos, UP, 0.25);
        break;
    }
    s.disturb(ev.pos, 0.6);
  }

  toolHit(ev: GameEvents["toolHit"]): void {
    if (!fin(ev.pos)) return;
    const s = this.sink;
    const now = s.now();
    this.recentHits.push({ t: now, x: ev.pos.x, y: ev.pos.y, z: ev.pos.z });
    if (this.recentHits.length > 16) this.recentHits.shift();
    const m = fxOf(ev.mat);
    const n = fin(ev.normal) ? ev.normal : UP;
    const E = Math.max(0, Number.isFinite(ev.energy) ? ev.energy : 0);
    const I = clamp(0.3 + Math.sqrt(E / 50) * 0.5, 0.25, 2.5);
    if (!m) {
      s.burst("dust", ev.pos, n, I * 0.4);
      return;
    }
    const steel = STEEL_TOOLS.has(ev.tool);
    if (ev.hard && steel && (m.metal || m.hard) && E > 25) {
      const p = m.metal ? clamp(E / 160, 0.2, 0.85) : clamp(E / 120, 0.3, 0.95);
      if (s.random() < p && this.lim.sparks.take(now)) s.burst("sparks", ev.pos, n, clamp(0.3 + E / 140, 0.3, 2));
    }
    if (m.dust) s.burst(m.dust, ev.pos, n, I * 0.6, { tint: m.dustTint });
    if (m.chips && m.chips !== m.dust && E > 10) s.burst(m.chips, ev.pos, n, I * 0.45, { tint: m.chipTint });
    this.kick(ev.pos, clamp(0.2 + E / 600, 0.2, 0.8), clamp(0.5 + E / 150, 0.5, 2.5));
  }

  feature(ev: GameEvents["feature"]): void {
    if (!fin(ev.pos)) return;
    const s = this.sink;
    const k = clamp(Number.isFinite(ev.intensity ?? 1) ? (ev.intensity ?? 1) : 1, 0.1, 4);
    switch (ev.kind) {
      case "sparks":
        if (this.lim.sparks.take(s.now())) s.burst("sparks", ev.pos, UP, k);
        s.burst("smoke", ev.pos, UP, 0.3 * k);
        break;
      case "lightBroken":
        s.burst("glassGlitter", ev.pos, { x: 0, y: -1, z: 0 }, 0.7 * k);
        s.burst("sparks", ev.pos, { x: 0, y: -1, z: 0 }, 0.8 * k);
        s.burst("smoke", ev.pos, UP, 0.25 * k);
        break;
      case "screenBroken":
        s.burst("sparks", ev.pos, UP, 0.7 * k);
        s.burst("smoke", ev.pos, UP, 0.5 * k);
        s.burst("glassGlitter", ev.pos, UP, 0.4 * k);
        break;
      case "powerOut":
        s.burst("sparks", ev.pos, UP, 1.5 * k);
        s.burst("smoke", ev.pos, UP, 0.8 * k);
        break;
      case "motorStop":
        s.burst("smoke", ev.pos, UP, 0.3 * k);
        break;
      case "lightFlicker":
        if (s.random() < 0.3 && this.lim.sparks.take(s.now())) s.burst("sparks", ev.pos, { x: 0, y: -1, z: 0 }, 0.15);
        break;
      case "waterStart":
        s.burst("water", ev.pos, UP, 0.6 * k);
        break;
      default:
        break;
    }
  }

  land(ev: GameEvents["land"]): void {
    if (!fin(ev.pos) || !(ev.speed > 2.5)) return;
    const m = fxOf(ev.mat);
    const I = clamp((ev.speed - 2) / 4, 0.1, 0.8);
    if (m?.dust) this.sink.burst(m.dust, ev.pos, UP, I * 0.5, { tint: m.dustTint });
    else this.sink.burst("dust", ev.pos, UP, I * 0.25);
    this.kick(ev.pos, 0.45, 0.4 + ev.speed * 0.15);
  }

  footstep(ev: GameEvents["footstep"]): void {
    if (!fin(ev.pos)) return;
    if (!this.lim.step.take(this.sink.now())) return;
    // debris shuffled by the player's feet
    this.sink.kick(ev.pos, 0.2, 0.3 + Math.max(0, ev.speed) * 0.08);
  }

  split(ev: GameEvents["split"]): void {
    if (!fin(ev.pos)) return;
    const mass = Math.max(0, Number.isFinite(ev.mass) ? ev.mass : 0);
    this.sink.burst("dust", ev.pos, UP, clamp(Math.sqrt(mass) / 6, 0.15, 1));
    this.sink.disturb(ev.pos, 1.5);
  }

  strain(ev: GameEvents["strain"]): void {
    if (!fin(ev.pos) || !(ev.stress > 0.5)) return;
    if (!this.lim.strain.take(this.sink.now())) return;
    const m = fxOf(ev.mat);
    if (!m) return;
    if (m.splinters) this.sink.burst("woodChips", ev.pos, UP, 0.15 + ev.stress * 0.2, { tint: m.chipTint });
    else if (m.dust) this.sink.burst(m.dust, ev.pos, UP, 0.15 + ev.stress * 0.25, { tint: m.dustTint });
  }

  /** Something was moved by the player near `pos`: settled debris there may have lost its support. */
  moved(pos: Vec3): void {
    if (fin(pos)) this.sink.disturb(pos, 1.2);
  }

  private nearRecentHit(p: Vec3, now: number): boolean {
    for (let i = this.recentHits.length - 1; i >= 0; i--) {
      const h = this.recentHits[i];
      if (now - h.t > 0.12) break;
      if ((h.x - p.x) ** 2 + (h.y - p.y) ** 2 + (h.z - p.z) ** 2 < 0.01) return true;
    }
    return false;
  }
}
