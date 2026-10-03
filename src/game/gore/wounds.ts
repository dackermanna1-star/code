/**
 * Pure gore logic (no rendering, no physics): damage classification, per-entity wound sets
 * (capped at the shader limit with eviction), shader encoding and the dismemberment decision.
 */
import * as THREE from 'three';
import type { DamageSource } from '../../entity/entity';

export type WoundType = 'blunt' | 'cut' | 'pierce' | 'burn';
/** Shader wound code (`floor(w/100)` of the wound uniform; 0 = legacy generic wound). */
export const WOUND_CODE: Record<WoundType, number> = { blunt: 1, cut: 2, pierce: 3, burn: 4 };
/** The entity material holds at most this many wounds. */
export const MAX_WOUNDS = 8;

const SHARP_WEAPON = /_sword$|_axe$|^sword$|scythe|knife|^shears$/;
const PIERCE_WEAPON = /^arrow$|trident|spear|^bolt$/;
const BITERS = new Set(['wolf', 'spider', 'cave_spider', 'cat', 'ocelot', 'polar_bear', 'fox', 'bee', 'silverfish', 'endermite', 'vex', 'ravager']);
const NO_WOUND = new Set(['drown', 'starve', 'void', 'suffocate', 'magic', 'wither', 'poison', 'freeze']);

/** Which kind of wound a damage source leaves (null = none: drowning, poison, ...). */
export function classifyDamage(src: DamageSource): WoundType | null {
  if (NO_WOUND.has(src.type)) return null;
  if (src.type === 'fire' || src.type === 'lava' || src.type === 'lightning' || src.fire && src.type !== 'arrow' && src.type !== 'projectile') return 'burn';
  const w = src.weapon ?? '';
  if (src.type === 'arrow' || w === 'arrow' || PIERCE_WEAPON.test(w)) return 'pierce';
  if (src.type === 'projectile') return src.projectile && /fire|snow|egg|pearl/.test(w) ? 'blunt' : 'pierce';
  if (src.type === 'cactus' || src.type === 'sweet_berry' || src.type === 'thorns') return 'pierce';
  if (SHARP_WEAPON.test(w)) return 'cut';
  if (src.type === 'mob') {
    const t = src.attacker?.type ?? src.direct?.type ?? '';
    if (BITERS.has(t)) return 'pierce';
    if (t === 'ravager' || t === 'iron_golem') return 'blunt';
  }
  // fists, pickaxe, shovel, falls, explosions, anvils ... everything that is not sharp
  return 'blunt';
}

/** Does the source cut through flesh (dismemberment-capable)? */
export function isSharp(src: DamageSource): boolean {
  return classifyDamage(src) === 'cut';
}

export interface Wound {
  type: WoundType;
  /** Position in model rest space (metres). */
  x: number; y: number; z: number;
  /** Direction (rest space) the wound is elongated along (cuts), unit length. */
  dx: number; dy: number; dz: number;
  /** 0..1 */
  severity: number;
  /** 0..1 random size variation. */
  size: number;
  /** Seconds since the wound was made. */
  age: number;
  /** Seconds of bleeding left. */
  bleed: number;
  /** Optional anchor (the part mesh the wound lives on) for world-space effects. */
  anchor?: THREE.Object3D | null;
}

export interface WoundInit {
  type: WoundType;
  pos: { x: number; y: number; z: number };
  dir?: { x: number; y: number; z: number };
  severity: number;
  size?: number;
  anchor?: THREE.Object3D | null;
}

/** Bleeding time (s) for a fresh wound: cuts bleed most, bruises only when heavy, burns never. */
export function bleedDuration(type: WoundType, severity: number): number {
  switch (type) {
    case 'cut': return 3 + severity * 7;
    case 'pierce': return 2.5 + severity * 4;
    case 'blunt': return severity > 0.7 ? 1.5 + (severity - 0.7) * 10 : 0;
    default: return 0;
  }
}

/** Severity 0..1 from the damage amount (relative to a "big hit" of ~10 hp). */
export function severityOf(type: WoundType, amount: number, maxHealth = 20): number {
  const ref = Math.max(6, maxHealth * 0.5);
  const base = Math.min(1, amount / ref);
  return Math.max(type === 'burn' ? 0.2 : 0.1, base);
}

/** A bounded set of wounds (the shader holds 8). */
export class WoundSet {
  readonly list: Wound[] = [];
  constructor(readonly max = MAX_WOUNDS) {}

  /**
   * Add a wound. Bruises landing on an existing bruise (or burns on a burn) merge into it
   * (growing it); otherwise, when full, the least significant wound is evicted
   * (lowest severity, bleeding ones last; ties: oldest first).
   */
  add(w: WoundInit): Wound {
    const d = w.dir ?? { x: 0, y: 1, z: 0 };
    const dl = Math.hypot(d.x, d.y, d.z) || 1;
    if (w.type === 'blunt' || w.type === 'burn') {
      for (const o of this.list) {
        if (o.type !== w.type) continue;
        const dd = Math.hypot(o.x - w.pos.x, o.y - w.pos.y, o.z - w.pos.z);
        if (dd < 0.1) {
          o.severity = Math.min(1, Math.max(o.severity, w.severity) + Math.min(w.severity, o.severity) * 0.5);
          o.age = Math.min(o.age, 1);
          o.bleed = Math.max(o.bleed, bleedDuration(o.type, o.severity));
          return o;
        }
      }
    }
    const wound: Wound = {
      type: w.type, x: w.pos.x, y: w.pos.y, z: w.pos.z, dx: d.x / dl, dy: d.y / dl, dz: d.z / dl,
      severity: Math.max(0, Math.min(1, w.severity)), size: w.size ?? Math.random(), age: 0,
      bleed: bleedDuration(w.type, w.severity), anchor: w.anchor ?? null,
    };
    if (this.list.length >= this.max) this.evict();
    this.list.push(wound);
    return wound;
  }

  /** Remove (and return) the wound that matters least. */
  evict(): Wound | null {
    if (!this.list.length) return null;
    let bi = 0, bs = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      const score = o.severity + (o.bleed > 0 ? 0.35 : 0); // ties: the older wound goes
      if (score < bs - 1e-9 || Math.abs(score - bs) <= 1e-9 && o.age > this.list[bi].age) { bs = score; bi = i; }
    }
    return this.list.splice(bi, 1)[0];
  }

  tick(dt: number) {
    for (const o of this.list) {
      o.age += dt;
      if (o.bleed > 0) o.bleed = Math.max(0, o.bleed - dt);
    }
  }

  get bleeding(): boolean {
    for (const o of this.list) if (o.bleed > 0) return true;
    return false;
  }

  clear() {
    this.list.length = 0;
  }

  /**
   * Encode wound `i` for the entity shader: pos = (x,y,z, code*100 + severity*10 + size),
   * dir = (dx,dy,dz, growth 0..1).
   */
  encode(i: number, pos: THREE.Vector4, dir: THREE.Vector4) {
    const o = this.list[i];
    const sev = Math.max(0, Math.min(10, Math.floor(o.severity * 10)));
    pos.set(o.x, o.y, o.z, WOUND_CODE[o.type] * 100 + sev + Math.min(0.999, o.size));
    // bruises grow/darken for ~25 s, cuts dry; others just age
    const horizon = o.type === 'blunt' ? 25 : o.type === 'cut' || o.type === 'pierce' ? 40 : 10;
    dir.set(o.dx, o.dy, o.dz, 1 - Math.exp(-o.age / (horizon * 0.4)));
  }

  /** Copy all wounds into uniform arrays; returns the count. */
  writeUniforms(pos: THREE.Vector4[], dir: THREE.Vector4[]): number {
    const n = Math.min(this.list.length, pos.length, dir.length);
    for (let i = 0; i < n; i++) this.encode(i, pos[i], dir[i]);
    return n;
  }
}

// ---------------------------------------------------------------------------------- dismemberment

export type PartKind = 'head' | 'upperArm' | 'lowerArm' | 'upperLeg' | 'lowerLeg' | 'tail' | 'torso' | 'other';

export interface BoneInfo {
  name: string;
  parent: string | null;
  part: PartKind;
}

export interface DismemberInput {
  type: WoundType | null;
  explosion?: boolean;
  /** Damage of the killing blow (after armour). */
  amount: number;
  maxHealth: number;
  /** Damage beyond the remaining health (>= 0). */
  overkill?: number;
  crit?: boolean;
  weapon?: string;
  bones: BoneInfo[];
  /** Name of the bone that was hit, if known. */
  hitBone?: string | null;
  rand?: () => number;
}

/** Probability that a killing blow takes something off. */
export function dismemberChance(i: Pick<DismemberInput, 'type' | 'explosion' | 'amount' | 'maxHealth' | 'overkill' | 'crit' | 'weapon'>): number {
  if (i.explosion) return i.amount >= 5 ? Math.min(0.95, 0.35 + i.amount * 0.04) : 0;
  if (i.type !== 'cut' || i.amount < 4) return 0;
  const heavy = /_axe$/.test(i.weapon ?? '') ? 1.25 : 1;
  const rel = (i.amount + (i.overkill ?? 0) * 0.5) / Math.max(6, i.maxHealth * 0.4);
  const p = (0.12 + rel * 0.35) * heavy + (i.crit ? 0.15 : 0);
  return Math.max(0, Math.min(0.85, p));
}

const DETACHABLE: Partial<Record<PartKind, number>> = { head: 2, upperArm: 1, upperLeg: 1, lowerArm: 0.5, lowerLeg: 0.5 };

function isDescendant(bones: Map<string, BoneInfo>, name: string, ancestor: string): boolean {
  for (let b = bones.get(name)?.parent; b; b = bones.get(b)?.parent ?? null) if (b === ancestor) return true;
  return false;
}

/** Which bones (each with its whole subtree) a killing blow detaches. Empty = none. */
export function decideDismember(i: DismemberInput): string[] {
  const rand = i.rand ?? Math.random;
  if (rand() >= dismemberChance(i)) return [];
  const byName = new Map(i.bones.map((b) => [b.name, b]));
  const cand = i.bones.filter((b) => DETACHABLE[b.part] !== undefined);
  if (!cand.length) return [];
  const want = i.explosion ? Math.min(5, Math.max(2, Math.floor(i.amount / 4))) : 1;
  const picked: string[] = [];
  const weight = (b: BoneInfo) => {
    let w = DETACHABLE[b.part] ?? 0;
    if (i.hitBone && (b.name === i.hitBone || isDescendant(byName, i.hitBone, b.name))) w *= 3;
    return w;
  };
  while (picked.length < want) {
    const pool = cand.filter((b) => !picked.some((p) => p === b.name || isDescendant(byName, b.name, p) || isDescendant(byName, p, b.name)));
    if (!pool.length) break;
    let sum = 0;
    for (const b of pool) sum += weight(b);
    let r = rand() * sum;
    let choice = pool[pool.length - 1];
    for (const b of pool) {
      r -= weight(b);
      if (r <= 0) { choice = b; break; }
    }
    picked.push(choice.name);
  }
  return picked;
}
