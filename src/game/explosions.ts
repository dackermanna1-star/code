/**
 * Explosions (`game.explosions`): Minecraft's algorithm (Java 1.20) plus physical realism.
 *
 *  * 16×16×16 ray grid (the 1352 rays on the cube surface), per-ray intensity
 *    (0.7..1.3)·power, stepping 0.3 blocks, attenuated by 0.225 per step plus
 *    (blastResistance + 0.3)·0.3 inside non-air blocks; the visited blocks while intensity > 0
 *    are destroyed.
 *  * Entities within 2·power: exposure (fraction of sample points of the entity box with a clear
 *    line to the centre), impact = (1 - dist/2power)·exposure, damage =
 *    floor((impact² + impact)/2 · 7 · 2power + 1), knockback = impact along centre→eye.
 *  * Drops: each destroyed block drops with probability 1/power; TNT in the blast is primed with
 *    a short random fuse (chain reactions); optional fire (1/3 of destroyed cells above solid ground).
 *  * Realism: debris chunks (physical sub-cubes of destroyed blocks), impulses on every rigid body
 *    in range (items, debris, primed TNT, ragdolls), camera shake and a white flash for the player.
 *
 * Emits `explosion {pos, power, source, blocks, fire}`, `blockExploded {x,y,z,state}`,
 * `entityBlasted {entity, impact, dir, velocity}`, `tntPrimed {entity, x, y, z, fuse, igniter}`.
 */
import * as THREE from 'three';
import type { Game } from './game';
import type { GameSystem } from './systems';
import type { World } from '../world/world';
import { SetFlags } from '../world/world';
import { BLOCKS, BLOCK_BY_NAME, T_LIQUID, T_SOLID, T_FULL_CUBE } from '../world/blocks/registry';
import { getCollisionBoxes } from '../world/blocks/models';
import { AABB } from '../physics/aabb';
import { Entity, type DamageSource } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { PrimedTntEntity, installTntBehavior, tntHooks } from '../entity/tnt';
import { DebrisManager } from '../physics/debris';
import type { PhysicsWorld } from '../physics/rapierWorld';

export type BlockGet = (x: number, y: number, z: number) => number;

// ------------------------------------------------------------------------------- pure core

/** Minecraft blast resistance of a state, or -1 for air (no attenuation besides the 0.225 step). */
export function blastResistance(state: number): number {
  if (state === 0) return -1;
  const def = BLOCKS[state >>> 4];
  if (!def || def.isAir) return -1;
  if (def.hardness < 0) return Math.max(def.resistance, 3600000);
  return Math.max(0, def.resistance);
}

/** The 1352 unit ray directions of Minecraft's 16³ explosion grid (cube surface). */
export const EXPLOSION_RAYS: Float64Array = (() => {
  const out: number[] = [];
  for (let j = 0; j < 16; j++)
    for (let k = 0; k < 16; k++)
      for (let l = 0; l < 16; l++) {
        if (j !== 0 && j !== 15 && k !== 0 && k !== 15 && l !== 0 && l !== 15) continue;
        let d = (j / 15) * 2 - 1, e = (k / 15) * 2 - 1, f = (l / 15) * 2 - 1;
        const g = Math.sqrt(d * d + e * e + f * f);
        d /= g; e /= g; f /= g;
        out.push(d, e, f);
      }
  return new Float64Array(out);
})();

/**
 * Blocks destroyed by an explosion (Minecraft ray algorithm). Returns flat [x,y,z,...] of
 * distinct positions in discovery order. `rand` must return floats in [0,1).
 */
export function explosionBlocks(get: BlockGet, cx: number, cy: number, cz: number, power: number, rand: () => number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const R = EXPLOSION_RAYS;
  for (let r = 0; r < R.length; r += 3) {
    const dx = R[r] * 0.3, dy = R[r + 1] * 0.3, dz = R[r + 2] * 0.3;
    let h = power * (0.7 + rand() * 0.6);
    let x = cx, y = cy, z = cz;
    while (h > 0) {
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      if (by < 0 || by > 255) break;
      const st = get(bx, by, bz);
      const res = blastResistance(st);
      if (res >= 0) h -= (res + 0.3) * 0.3;
      if (h > 0 && res >= 0 && !T_LIQUID[st >>> 4]) {
        const key = ((bx + 1048576) * 2097152 + (bz + 1048576)) * 256 + by;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(bx, by, bz);
        }
      }
      x += dx; y += dy; z += dz;
      h -= 0.22500001;
    }
  }
  return out;
}

const _box = new AABB();
const _out = { face: 0 };
const _tmp: number[] = [];
/** True if the segment a→b crosses any block collision box (Minecraft COLLIDER raycast). */
export function segmentBlocked(get: BlockGet, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return false;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ax), y = Math.floor(ay), z = Math.floor(az);
  const ex = Math.floor(bx), ey = Math.floor(by), ez = Math.floor(bz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
  let tmx = sx > 0 ? (x + 1 - ax) * tdx : sx < 0 ? (ax - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - ay) * tdy : sy < 0 ? (ay - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - az) * tdz : sz < 0 ? (az - z) * tdz : Infinity;
  for (let i = 0; i < 128; i++) {
    const st = get(x, y, z);
    if (st !== 0 && T_SOLID[st >>> 4]) {
      _tmp.length = 0;
      getCollisionBoxes(st, (ox, oy, oz) => get(x + ox, y + oy, z + oz), _tmp);
      for (let k = 0; k < _tmp.length; k += 6) {
        _box.set(x + _tmp[k], y + _tmp[k + 1], z + _tmp[k + 2], x + _tmp[k + 3], y + _tmp[k + 4], z + _tmp[k + 5]);
        const t = _box.rayIntersect(ax, ay, az, dx, dy, dz, len, _out);
        if (t >= 0 && t <= len) return true;
      }
    }
    if (x === ex && y === ey && z === ez) return false;
    if (tmx < tmy && tmx < tmz) { if (tmx > len) return false; x += sx; tmx += tdx; }
    else if (tmy < tmz) { if (tmy > len) return false; y += sy; tmy += tdy; }
    else { if (tmz > len) return false; z += sz; tmz += tdz; }
  }
  return false;
}

/** Minecraft `getExposure`: fraction of box sample points with a clear line to the source. */
export function explosionExposure(get: BlockGet, sx: number, sy: number, sz: number, box: AABB): number {
  const d = 1 / ((box.maxX - box.minX) * 2 + 1);
  const e = 1 / ((box.maxY - box.minY) * 2 + 1);
  const f = 1 / ((box.maxZ - box.minZ) * 2 + 1);
  const g = (1 - Math.floor(1 / d) * d) / 2;
  const h = (1 - Math.floor(1 / f) * f) / 2;
  if (d < 0 || e < 0 || f < 0) return 0;
  let i = 0, j = 0;
  for (let k = 0; k <= 1; k += d)
    for (let l = 0; l <= 1; l += e)
      for (let m = 0; m <= 1; m += f) {
        const n = box.minX + (box.maxX - box.minX) * k;
        const o = box.minY + (box.maxY - box.minY) * l;
        const p = box.minZ + (box.maxZ - box.minZ) * m;
        if (!segmentBlocked(get, n + g, o, p + h, sx, sy, sz)) i++;
        j++;
      }
  return j ? i / j : 0;
}

/** Impact factor (1 - dist/2power)·exposure, or 0 outside the radius. */
export function explosionImpact(dist: number, power: number, exposure: number): number {
  const w = dist / (power * 2);
  if (w > 1) return 0;
  return (1 - w) * exposure;
}

/** Minecraft explosion damage for an impact factor. */
export function explosionDamage(impact: number, power: number): number {
  if (impact <= 0) return 0;
  return Math.floor(((impact * impact + impact) / 2) * 7 * (power * 2) + 1);
}

/** Fisher–Yates shuffle of [x,y,z] triples. */
function shuffleTriples(a: number[], rand: () => number) {
  const n = a.length / 3;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    for (let c = 0; c < 3; c++) {
      const t = a[i * 3 + c];
      a[i * 3 + c] = a[j * 3 + c];
      a[j * 3 + c] = t;
    }
  }
}

// ------------------------------------------------------------------------------- system

export interface ExplodeOptions {
  /** Entity causing it (primed TNT, creeper, fireball ...). Excluded from damage. */
  source?: Entity | null;
  /** The entity responsible (player who lit the TNT). */
  attacker?: Entity | null;
  /** Place fire (fireballs, beds in the Nether). */
  fire?: boolean;
  /** Destroy blocks (false for creepers without mobGriefing). Default true. */
  breakBlocks?: boolean;
  /** Damage/knock back entities. Default true. */
  damageEntities?: boolean;
  /** Spawn debris chunks. Default true. */
  debris?: boolean;
  rand?: () => number;
}

export interface ExplosionResult {
  blocks: number;
  entities: number;
  debris: number;
}

const _p = new THREE.Vector3();

export class ExplosionSystem implements GameSystem {
  readonly name = 'explosions';
  game!: Game;
  debris!: DebrisManager;
  private shake = { t: 0, dur: 0, amp: 0, seed: 0 };
  private flash = { t: 0, dur: 0.18, a: 0 };
  private flashVec = new THREE.Vector4(1, 0.96, 0.88, 0);
  private pendingPrimes: [number, number, number, Entity | null, number][] = [];
  private q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

  init(game: Game) {
    this.game = game;
    (game as any).explosions = this;
    installTntBehavior();
    tntHooks.prime = (w, x, y, z, igniter, fuse) => {
      if (w === game.world) this.pendingPrimes.push([x, y, z, igniter, fuse ?? 80]);
    };
    this.debris = new DebrisManager({
      get world() { return game.world; },
      get physics() { return game.physics as PhysicsWorld | null; },
      get renderer() { return game.renderer; },
    } as any);
    const ex = game.renderExtras;
    (ex.gbuffer ??= []).push(this.debris.scene);
    (ex.shadow ??= []).push(this.debris.scene);
    // fire placed next to TNT, `fireIgnite` events from items
    game.events.on('fireIgnite', (e: any) => this.igniteAround(e.x, e.y, e.z, e.player ?? e.entity ?? null));
    game.events.on('arrowStuck', ({ arrow, x, y, z }: any) => {
      if (arrow?.fireTicks > 0 || arrow?.fireTicksOnHit) this.igniteAt(x, y, z, arrow.owner ?? null);
    });
    game.events.on('worldReady', () => this.testHooks());
  }

  tick() {
    // primes requested from block hooks run outside of the world's setBlock call chain
    const list = this.pendingPrimes.splice(0);
    for (const [x, y, z, ig, fuse] of list) this.primeTnt(x, y, z, ig, fuse);
  }

  onWorldChange() {
    this.pendingPrimes.length = 0;
    this.debris?.clear();
    this.shake.t = this.shake.dur = 0;
    this.flash.t = this.flash.dur;
  }

  // ------------------------------------------------------------------ TNT
  /** Prime the TNT block at (x,y,z) (redstone, fire, flint and steel ...). */
  primeTnt(x: number, y: number, z: number, igniter: Entity | null = null, fuse = 80): PrimedTntEntity | null {
    const g = this.game;
    const st = g.world.getBlock(x, y, z);
    if (!st || BLOCKS[st >>> 4].name !== 'tnt') return null;
    g.world.setBlock(x, y, z, 0, SetFlags.ALL);
    return this.spawnPrimed(x + 0.5, y, z + 0.5, igniter, fuse);
  }

  spawnPrimed(x: number, y: number, z: number, igniter: Entity | null = null, fuse = 80): PrimedTntEntity {
    const g = this.game;
    const e = new PrimedTntEntity();
    e.fuse = fuse;
    e.igniter = igniter;
    const a = Math.random() * Math.PI * 2;
    e.vel.set(-Math.sin(a) * 0.02 * 20, 0.2 * 20, -Math.cos(a) * 0.02 * 20);
    g.spawn(e, x, y, z);
    g.events.emit('tntPrimed', { entity: e, x, y, z, fuse, igniter });
    g.audio?.play?.('random.fuse', { pos: { x, y: y + 0.5, z } });
    return e;
  }

  /** Ignite TNT at a position (if any). */
  igniteAt(x: number, y: number, z: number, igniter: Entity | null) {
    return this.primeTnt(x, y, z, igniter);
  }
  /** Ignite TNT at and next to a position (fire placed / fire ignite event). */
  igniteAround(x: number, y: number, z: number, igniter: Entity | null) {
    this.primeTnt(x, y, z, igniter);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) this.primeTnt(x + dx, y + dy, z + dz, igniter);
  }

  // ------------------------------------------------------------------ explode
  explode(pos: THREE.Vector3 | { x: number; y: number; z: number }, power: number, opts: ExplodeOptions = {}): ExplosionResult {
    const g = this.game;
    const w = g.world;
    const rand = opts.rand ?? Math.random;
    const cx = pos.x, cy = pos.y, cz = pos.z;
    const center = new THREE.Vector3(cx, cy, cz);
    const get: BlockGet = (x, y, z) => w.getBlock(x, y, z);
    const blocks = opts.breakBlocks === false ? [] : explosionBlocks(get, cx, cy, cz, power, rand);
    const q = power * 2;
    const attacker = opts.attacker ?? (opts.source as any)?.igniter ?? (opts.source as any)?.owner ?? null;
    // ---- entities (before the world changes, like Minecraft)
    let hitEntities = 0;
    if (opts.damageEntities !== false) {
      const range = new AABB(Math.floor(cx - q - 1), Math.floor(cy - q - 1), Math.floor(cz - q - 1), Math.floor(cx + q + 1), Math.floor(cy + q + 1), Math.floor(cz + q + 1));
      for (const e of g.entities.query(range)) {
        if (e === opts.source || e.removed) continue;
        if ((e as any).spectator) continue;
        const dist = e.pos.distanceTo(center);
        if (dist / q > 1) continue;
        const ey = e instanceof PrimedTntEntity ? e.pos.y : e.pos.y + e.eyeHeight;
        const dir = new THREE.Vector3(e.pos.x - cx, ey - cy, e.pos.z - cz);
        const dl = dir.length();
        if (dl === 0) continue;
        dir.divideScalar(dl);
        const exposure = explosionExposure(get, cx, cy, cz, e.box);
        const impact = explosionImpact(dist, power, exposure);
        if (impact <= 0) continue;
        hitEntities++;
        const body = (e as any).body;
        if (e.type === 'item') {
          // close items are destroyed (Minecraft), the rest are flung by the body impulse pass
          if (impact > 0.85 && (e as any).stack?.item?.name !== 'nether_star') e.remove();
          continue;
        }
        if (body) continue; // rigid bodies get their impulse below
        const living = e instanceof LivingEntity;
        if (living) {
          const src: DamageSource = { type: 'explosion', explosion: true, attacker, direct: opts.source ?? null, point: center.clone(), dir: dir.clone(), impulse: impact * power * 1.5, weapon: 'explosion' };
          e.hurt(src, explosionDamage(impact, power));
        }
        let kb = impact;
        if (living) kb *= 1 - (e as LivingEntity).knockbackResistance;
        if ((e as any).creative && (e as any).flying) kb = 0;
        if (kb > 0) {
          const dv = dir.clone().multiplyScalar(kb * 20);
          e.vel.add(dv);
          g.events.emit('entityBlasted', { entity: e, impact: kb, dir, velocity: dv, center, power });
        }
      }
    }
    // ---- blocks
    shuffleTriples(blocks, rand);
    const debrisOn = opts.debris !== false && !!g.physics;
    const nBlocks = blocks.length / 3;
    const debrisChance = Math.min(1, 46 / Math.max(1, nBlocks));
    const destroyed: [number, number, number, number][] = [];
    for (let i = 0; i < blocks.length; i += 3) {
      const x = blocks[i], y = blocks[i + 1], z = blocks[i + 2];
      const st = w.getBlock(x, y, z);
      if (!st) continue;
      const def = BLOCKS[st >>> 4];
      if (def.name === 'tnt') {
        // chain reaction: short random fuse (Minecraft: 10..29 ticks)
        this.primeTnt(x, y, z, attacker, 10 + Math.floor(rand() * 20));
        continue;
      }
      if (def.drops !== 'none' && rand() < 1 / power) {
        for (const s of g.resolveDrops(def.drops, st, null, false)) {
          const dv = new THREE.Vector3(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz).normalize().multiplyScalar(2 + rand() * 3);
          dv.y += 2;
          g.dropItem(s, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), dv, 10);
        }
      }
      const be = w.getBlockEntity(x, y, z);
      if (be) {
        if (Array.isArray(be.items)) for (const s of be.items) if (s && s.item) g.dropItem(s, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), undefined, 10);
        w.setBlockEntity(x, y, z, null);
      }
      w.setBlock(x, y, z, 0, SetFlags.ALL);
      destroyed.push([x, y, z, st]);
      g.events.emit('blockExploded', { x, y, z, state: st });
    }
    if (destroyed.length) g.chunks?.markUrgent(Math.floor(cx), Math.floor(cy), Math.floor(cz));
    // ---- fire
    if (opts.fire) {
      const fire = BLOCK_BY_NAME.get('fire');
      if (fire) for (let i = 0; i < blocks.length; i += 3) {
        const x = blocks[i], y = blocks[i + 1], z = blocks[i + 2];
        if (Math.floor(rand() * 3) !== 0) continue;
        if (w.getBlock(x, y, z) === 0 && T_FULL_CUBE[w.getBlock(x, y - 1, z) >>> 4]) w.setBlock(x, y, z, fire.id << 4, SetFlags.ALL);
      }
    }
    // ---- rigid bodies (items, debris, primed TNT, ragdolls)
    const pw = g.physics as PhysicsWorld | null;
    if (pw) {
      for (const b of pw.querySphere(center, q)) {
        if (b.removed || !b.dynamic || b.owner === opts.source) continue;
        const d = b.pos.distanceTo(center);
        const exposure = segmentBlocked(get, b.pos.x, b.pos.y, b.pos.z, cx, cy, cz) ? 0.15 : 1;
        const impact = explosionImpact(d, power, exposure);
        if (impact <= 0) continue;
        const dir = _p.copy(b.pos).sub(center);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        dir.normalize();
        dir.y += 0.3;
        dir.normalize();
        const dv = Math.min(24, impact * 20 * (b.kind === 'ragdoll' ? 0.8 : 1));
        const off = new THREE.Vector3((rand() - 0.5) * 2 * b.half.x, (rand() - 0.5) * 2 * b.half.y, (rand() - 0.5) * 2 * b.half.z);
        pw.applyImpulse(b, { x: dir.x * dv * b.mass, y: dir.y * dv * b.mass, z: dir.z * dv * b.mass }, { x: b.pos.x + off.x, y: b.pos.y + off.y, z: b.pos.z + off.z });
      }
    }
    // ---- debris
    let debrisCount = 0;
    if (debrisOn) {
      for (const [x, y, z, st] of destroyed) {
        if (rand() > debrisChance) continue;
        const def = BLOCKS[st >>> 4];
        if (!def.solid && def.shape !== 'leaves') continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
        const strength = (4 + power * 3.2) * Math.max(0.25, 1 - d / q);
        const n = 1 + (rand() < 0.5 ? 1 : 0) + (d < power * 0.6 && rand() < 0.4 ? 1 : 0);
        this.debris.spawn(st, x, y, z, center, strength, n, rand);
        debrisCount += n;
      }
    }
    g.events.emit('explosion', { pos: center, power, source: opts.source ?? null, blocks: destroyed.length, fire: !!opts.fire });
    this.playerFeedback(center, power);
    return { blocks: destroyed.length, entities: hitEntities, debris: debrisCount };
  }

  /** Camera shake and white flash for the local player. */
  private playerFeedback(center: THREE.Vector3, power: number) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const eye = p.eyePos;
    const d = eye.distanceTo(center);
    const shake = Math.min(1.6, (power / 4) * 2.2 / (1 + (d * d) / (power * power * 5)));
    if (shake > 0.03) {
      this.shake.amp = Math.max(this.shake.amp * Math.max(0, 1 - this.shake.t / Math.max(0.01, this.shake.dur)), shake);
      this.shake.t = 0;
      this.shake.dur = 0.5 + Math.min(0.8, power * 0.12);
      this.shake.seed = Math.random() * 100;
    }
    const get: BlockGet = (x, y, z) => g.world.getBlock(x, y, z);
    const los = segmentBlocked(get, eye.x, eye.y, eye.z, center.x, center.y, center.z) ? 0.3 : 1;
    const look = p.lookDir();
    const toward = Math.max(0.35, look.dot(center.clone().sub(eye).normalize()));
    const a = Math.min(0.85, (power / 4) * 0.9 * los * toward / (1 + (d * d) / 160));
    if (a > 0.02) {
      this.flash.a = Math.max(this.flash.a * (1 - this.flash.t / this.flash.dur), a);
      this.flash.t = 0;
      this.flash.dur = 0.12 + 0.1 * Math.min(1, power / 4);
    }
  }

  update(game: Game, dt: number, alpha: number) {
    this.debris.update(dt, alpha);
    const p = game.player;
    // shake: decaying multi-frequency noise on roll/pitch (camera reads player.cameraShake)
    if (this.shake.t < this.shake.dur && p) {
      this.shake.t += dt;
      const k = 1 - this.shake.t / this.shake.dur;
      const env = this.shake.amp * k * k;
      const t = this.shake.t * 38 + this.shake.seed;
      const sx = (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4) * env;
      const sy = (Math.sin(t * 1.3 + 4.1) * 0.6 + Math.sin(t * 3.1) * 0.4) * env;
      if (Math.abs(sx) > Math.abs(p.cameraShake.x)) p.cameraShake.x = sx;
      if (Math.abs(sy) > Math.abs(p.cameraShake.y)) p.cameraShake.y = sy;
    }
    // flash
    const ex = game.renderExtras;
    if (this.flash.t < this.flash.dur) {
      this.flash.t += dt;
      const k = Math.max(0, 1 - this.flash.t / this.flash.dur);
      this.flashVec.w = this.flash.a * k * k;
      ex.overlay = this.flashVec;
    } else if (ex.overlay === this.flashVec) {
      ex.overlay = undefined;
      this.flash.a = 0;
    }
  }

  // ------------------------------------------------------------------ test hooks
  /** `?tnt=1` (single TNT + a small wall), `?tnt=chain` (row of TNT) in front of the player. */
  private testHooks() {
    const v = this.q.get('tnt');
    if (!v || !this.q.has('autostart')) return;
    const g = this.game;
    const p = g.player;
    const f = p.lookDir().setY(0).normalize();
    const bx = Math.floor(p.pos.x + f.x * 7), bz = Math.floor(p.pos.z + f.z * 7);
    let by = Math.floor(p.pos.y) + 4;
    while (by > 1 && !T_SOLID[g.world.getBlock(bx, by - 1, bz) >>> 4]) by--;
    const tnt = BLOCK_BY_NAME.get('tnt')!.id << 4;
    const stone = BLOCK_BY_NAME.get('cobblestone')!.id << 4;
    const planks = BLOCK_BY_NAME.get('oak_planks')!.id << 4;
    if (v === 'chain') {
      for (let i = 0; i < 5; i++) g.world.setBlock(bx + Math.round(-f.z * (i - 2) * 2), by, bz + Math.round(f.x * (i - 2) * 2), tnt);
    } else {
      // small hut of planks and cobblestone around the TNT
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 3; dy++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2 && dy < 2) continue;
        g.world.setBlock(bx + dx, by + dy, bz + dz, dy === 2 ? planks : stone);
      }
      g.world.setBlock(bx, by, bz, tnt);
    }
    const fuse = Number(this.q.get('fuse') ?? 30);
    setTimeout(() => {
      if (v === 'chain') this.primeTnt(bx + Math.round(-f.z * -4), by, bz + Math.round(f.x * -4), p, fuse);
      else this.primeTnt(bx, by, bz, p, fuse);
    }, 0);
  }
}

/** Typed accessor for other modules. */
export function explosionsOf(game: any): ExplosionSystem | null {
  return game?.explosions ?? null;
}
export type { World };
