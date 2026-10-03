/**
 * `game.particles`: the public particle API. Simple particle types spawn `count` particles;
 * composite effects (explosion, water_splash, firework, totem, block_break, ...) build
 * cinematic layered effects from the primitive types in defs.ts.
 *
 *   particles.emit(type, pos, opts?)          -> number of particles spawned
 *   particles.burst(type, pos, count, opts?)
 *   particles.spawnBlockBreak(x, y, z, state)
 *   particles.spawnBlockHit(x, y, z, state, face)
 *
 * `pos` is `{x,y,z}` or `[x,y,z]` (world coordinates).
 */
import { ParticleSystem } from './system';
import { PT, PARTICLE_DEFS, particleId } from './defs';
import { blockParticleInfo, blockTint, collisionShape } from './blockInfo';
import { BLOCKS, BLOCK_BY_NAME, T_SOLID } from '../../world/blocks/registry';

export type Vec3Like = { x: number; y: number; z: number } | readonly [number, number, number];

export interface EmitOptions {
  /** Number of particles (primitive types) — scaled by the quality density. */
  count?: number;
  /** Position jitter: half extent (number) or per-axis half extents. */
  spread?: number | readonly [number, number, number];
  /** Base velocity (b/s). */
  vel?: Vec3Like;
  /** Random extra speed (b/s) in a random direction. */
  speed?: number;
  /** Colour: 0xRRGGBB (sRGB) or linear [r,g,b]. */
  color?: number | readonly [number, number, number];
  /** Size multiplier. */
  size?: number;
  /** Lifetime multiplier. */
  life?: number;
  /** Block state (block_crumb / dust / block_break / block_dust). */
  state?: number;
  /** Attractor target (portal / enchant: particles fly toward it). */
  target?: Vec3Like;
  /** Explosion power (TNT = 4). */
  power?: number;
  /** Emissive / strength multiplier. */
  intensity?: number;
  /** Yaw (radians) for oriented effects (sweep_attack). */
  yaw?: number;
  /** Note block pitch 0..24 (note colour). */
  note?: number;
  /** Firework colours (0xRRGGBB). */
  colors?: number[];
  /** Direction for directional effects (blood spray, sparks). */
  dir?: Vec3Like;
  /** Ignore the density scaling of `count`. */
  exact?: boolean;
}

const rnd = Math.random;
const vx = (v: Vec3Like) => ('x' in v ? v.x : v[0]);
const vy = (v: Vec3Like) => ('x' in v ? v.y : v[1]);
const vz = (v: Vec3Like) => ('x' in v ? v.z : v[2]);
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** 0xRRGGBB (sRGB) -> linear triple. */
export function hexToLinear(hex: number, out: number[] = [0, 0, 0]): number[] {
  out[0] = s2l(((hex >> 16) & 255) / 255);
  out[1] = s2l(((hex >> 8) & 255) / 255);
  out[2] = s2l((hex & 255) / 255);
  return out;
}

function colorOf(c: EmitOptions['color'], out: number[]): number[] | null {
  if (c === undefined) return null;
  if (typeof c === 'number') return hexToLinear(c, out);
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return out;
}

/** Random unit vector. */
function randDir(out: number[]) {
  const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  out[0] = Math.cos(a) * r; out[1] = z; out[2] = Math.sin(a) * r;
  return out;
}

const tmpC = [0, 0, 0];
const tmpD = [0, 0, 0];

/** Minecraft entity effect colours (status effect id -> 0xRRGGBB). */
export const EFFECT_COLORS: Record<string, number> = {
  speed: 0x33ebff, slowness: 0x8bafe0, haste: 0xd9c043, mining_fatigue: 0x4a4217, strength: 0xffc700,
  instant_health: 0xf82423, instant_damage: 0xa9656a, jump_boost: 0xfdff84, nausea: 0x551d4a, regeneration: 0xcd5cab,
  resistance: 0x9146f0, fire_resistance: 0xff9900, water_breathing: 0x98dac0, invisibility: 0xf6f6f6, blindness: 0x1f1f23,
  night_vision: 0xc2ff66, hunger: 0x587653, weakness: 0x484d48, poison: 0x87a363, wither: 0x736156, health_boost: 0xf87d23,
  absorption: 0x2552a5, saturation: 0xf82423, glowing: 0x94a061, levitation: 0xceffff, luck: 0x59c106, unluck: 0xc0a44d,
  slow_falling: 0xf3cfb9, conduit_power: 0x1dc2d1, dolphins_grace: 0x88a3be, bad_omen: 0x0b6138, hero_of_the_village: 0x44ff44,
};

export class ParticleAPI {
  constructor(readonly sys: ParticleSystem) {}

  /** All primitive type names. */
  get types(): string[] {
    return PARTICLE_DEFS.map((d) => d.name);
  }

  private n(count: number, exact?: boolean) {
    if (exact) return count;
    const f = count * this.sys.density;
    const k = Math.floor(f);
    return k + (rnd() < f - k ? 1 : 0);
  }

  /** Spawns a particle type or composite effect. Returns the number of particles created. */
  emit(type: string, pos: Vec3Like, opts: EmitOptions = {}): number {
    const x = vx(pos), y = vy(pos), z = vz(pos);
    switch (type) {
      case 'explosion': return this.explosion(x, y, z, opts.power ?? 4);
      case 'water_splash': case 'entity_splash': return this.waterSplash(x, y, z, opts.intensity ?? 1);
      case 'firework': return this.firework(x, y, z, opts.colors ?? [0xff3030, 0xffd040], opts.intensity ?? 1);
      case 'totem': return this.totem(x, y, z);
      case 'block_break': return opts.state ? this.spawnBlockBreak(Math.floor(x), Math.floor(y), Math.floor(z), opts.state) : 0;
      case 'block_dust': return opts.state ? this.blockDust(opts.state, x, y, z, opts.count ?? 4, opts.size ?? 1, opts.speed ?? 1) : 0;
      case 'sweep_attack': return this.sweep(x, y, z, opts.yaw ?? 0);
      case 'crit_hit': return this.critHit(x, y, z, false, opts.size ?? 1);
      case 'magic_crit_hit': return this.critHit(x, y, z, true, opts.size ?? 1);
      case 'blood_spray': return this.bloodSpray(x, y, z, opts);
      case 'poof_cloud': return this.poof(x, y, z, opts.size ?? 1);
      case 'lightning_impact': return this.lightningImpact(x, y, z, opts.state ?? 0);
      case 'teleport': return this.teleport(x, y, z, opts.target);
      case 'potion_splash': return this.potionSplash(x, y, z, opts.color ?? 0x385dc6);
    }
    const id = particleId(type);
    if (id < 0) return 0;
    return this.primitive(id, x, y, z, opts);
  }

  burst(type: string, pos: Vec3Like, count: number, opts: EmitOptions = {}): number {
    return this.emit(type, pos, { spread: 0.25, speed: 1, ...opts, count });
  }

  /** Generic primitive spawner honouring EmitOptions. */
  primitive(id: number, x: number, y: number, z: number, o: EmitOptions = {}): number {
    const sys = this.sys;
    const count = this.n(o.count ?? 1, o.exact);
    const sp = o.spread ?? 0;
    const sx = typeof sp === 'number' ? sp : sp[0], sy = typeof sp === 'number' ? sp : sp[1], sz = typeof sp === 'number' ? sp : sp[2];
    const col = colorOf(o.color, tmpC);
    const bvx = o.vel ? vx(o.vel) : 0, bvy = o.vel ? vy(o.vel) : 0, bvz = o.vel ? vz(o.vel) : 0;
    const speed = o.speed ?? 0;
    let made = 0;
    for (let k = 0; k < count; k++) {
      let ux = bvx, uy = bvy, uz = bvz;
      if (speed) {
        randDir(tmpD);
        const s = speed * (0.4 + rnd() * 0.6);
        ux += tmpD[0] * s; uy += tmpD[1] * s; uz += tmpD[2] * s;
      }
      const px = x + (rnd() * 2 - 1) * sx, py = y + (rnd() * 2 - 1) * sy, pz = z + (rnd() * 2 - 1) * sz;
      let i: number;
      if (id === PT.block_crumb) {
        i = this.crumb(o.state ?? 0, px, py, pz, ux, uy, uz, o.size ?? 1);
      } else {
        i = sys.spawn(id, px, py, pz, ux, uy, uz);
      }
      if (i < 0) break;
      const p = sys.lp;
      if (o.size) p.size[i] *= o.size;
      if (o.life) p.life[i] *= o.life;
      if (col && id !== PT.block_crumb) { p.r[i] = col[0]; p.g[i] = col[1]; p.b[i] = col[2]; }
      if (o.target && (id === PT.portal || id === PT.enchant)) {
        // fly from (px,py,pz) to the target: target is the convergence point, offset = start - target
        p.u0[i] = vx(o.target); p.u1[i] = vy(o.target); p.u2[i] = vz(o.target);
        p.vx[i] = px - p.u0[i]; p.vy[i] = py - p.u1[i]; p.vz[i] = pz - p.u2[i];
      }
      if (id === PT.note) {
        const nt = (o.note ?? Math.floor(rnd() * 25)) / 24;
        p.r[i] = s2l(Math.max(0, Math.sin(nt * Math.PI * 2) * 0.65 + 0.35));
        p.g[i] = s2l(Math.max(0, Math.sin((nt + 1 / 3) * Math.PI * 2) * 0.65 + 0.35));
        p.b[i] = s2l(Math.max(0, Math.sin((nt + 2 / 3) * Math.PI * 2) * 0.65 + 0.35));
      }
      if (id === PT.dust && o.state) this.colorDust(p, i, o.state, px, pz);
      if (o.intensity !== undefined && id !== PT.block_crumb) {
        // emissive types scale with intensity; others scale alpha
        p.a[i] *= Math.min(1, o.intensity);
      }
      made++;
    }
    return made;
  }

  // ------------------------------------------------------------------------- blocks
  /** One block crumb. Returns its index (crumb pool) or -1. */
  crumb(state: number, x: number, y: number, z: number, ux: number, uy: number, uz: number, sizeMul = 1): number {
    if (!state) return -1;
    const sys = this.sys;
    const i = sys.spawn(PT.block_crumb, x, y, z, ux, uy, uz);
    if (i < 0) return -1;
    const p = sys.lp;
    const info = blockParticleInfo(state);
    const top = info.topLayer >= 0 && rnd() < (info.topTinted ? 0.3 : 0.15);
    p.sprite[i] = top ? info.topLayer : info.layer;
    const tint = blockTint(sys.world, info, Math.floor(x), Math.floor(z), top);
    p.r[i] = ((tint >> 16) & 255) / 255; p.g[i] = ((tint >> 8) & 255) / 255; p.b[i] = (tint & 255) / 255;
    p.size[i] *= sizeMul;
    p.u0[i] = rnd() * (1 - p.size[i]);
    p.u1[i] = rnd() * (1 - p.size[i]);
    p.u2[i] = info.cutout ? 1 : 0;
    return i;
  }

  private colorDust(p: ParticleSystem['lp'], i: number, state: number, x: number, z: number) {
    const info = blockParticleInfo(state);
    p.u3[i] = info.layer;
    const tint = blockTint(this.sys.world, info, Math.floor(x), Math.floor(z), false);
    hexToLinear(tint, tmpC);
    p.r[i] = tmpC[0]; p.g[i] = tmpC[1]; p.b[i] = tmpC[2];
  }

  /** Soft dust puffs coloured by a block. */
  blockDust(state: number, x: number, y: number, z: number, count: number, size = 1, speed = 1): number {
    const sys = this.sys;
    const n = this.n(count);
    let made = 0;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, s = (0.4 + rnd() * 0.8) * speed;
      const i = sys.spawn(PT.dust, x + (rnd() - 0.5) * 0.4 * size, y + rnd() * 0.15, z + (rnd() - 0.5) * 0.4 * size, Math.cos(a) * s, 0.2 + rnd() * 0.5 * speed, Math.sin(a) * s);
      if (i < 0) break;
      sys.lp.size[i] *= size;
      this.colorDust(sys.lp, i, state, x, z);
      made++;
    }
    return made;
  }

  /** Minecraft block-break particles: 4x4x4 crumbs over the block's shape + dust. */
  spawnBlockBreak(x: number, y: number, z: number, state: number): number {
    if (!state) return 0;
    const def = BLOCKS[state >>> 4];
    if (!def || def.shape === 'air' || def.liquid) return 0;
    // shape bounds (collision shape, else full block; plants: their outline)
    const sh = collisionShape(state);
    let x0 = 0, y0 = 0, z0 = 0, x1 = 1, y1 = 1, z1 = 1;
    if (sh.length) {
      x0 = y0 = z0 = 1; x1 = y1 = z1 = 0;
      for (let k = 0; k < sh.length; k += 6) {
        x0 = Math.min(x0, sh[k]); y0 = Math.min(y0, sh[k + 1]); z0 = Math.min(z0, sh[k + 2]);
        x1 = Math.max(x1, sh[k + 3]); y1 = Math.max(y1, Math.min(1, sh[k + 4])); z1 = Math.max(z1, sh[k + 5]);
      }
    } else if (def.shape === 'torch' || def.shape === 'cross' || def.shape === 'fire') {
      x0 = z0 = 0.3; x1 = z1 = 0.7; y1 = 0.7;
    }
    const sys = this.sys;
    const small = (x1 - x0) * (y1 - y0) * (z1 - z0) < 0.3;
    const N = small ? 2 : 4;
    const keep = this.sys.density; // fraction of the 64 cells
    let made = 0;
    for (let gx = 0; gx < N; gx++)
      for (let gy = 0; gy < N; gy++)
        for (let gz = 0; gz < N; gz++) {
          if (rnd() > keep) continue;
          const fx = (gx + 0.5) / N, fy = (gy + 0.5) / N, fz = (gz + 0.5) / N;
          const px = x + x0 + (x1 - x0) * fx, py = y + y0 + (y1 - y0) * fy, pz = z + z0 + (z1 - z0) * fz;
          const ox = fx - 0.5, oy = fy - 0.5, oz = fz - 0.5;
          const sp = 2.2 + rnd() * 2.2;
          if (this.crumb(state, px, py, pz, ox * sp + (rnd() - 0.5) * 1.2, oy * sp + 1.8 + rnd() * 1.8, oz * sp + (rnd() - 0.5) * 1.2, small ? 0.8 : 1) >= 0) made++;
        }
    // a puff of fine dust (not for plants / glass)
    if (def.layer === 'opaque' || def.shape === 'grass_block' || def.shape === 'leaves') made += this.blockDust(state, x + 0.5, y + y0 + (y1 - y0) * 0.3, z + 0.5, def.shape === 'leaves' ? 2 : 4, 1.1, 1.2);
    if (blockParticleInfo(state).metal) made += this.primitive(PT.sparks, x + 0.5, y + 0.5, z + 0.5, { count: 8, speed: 5, spread: 0.3 });
    void sys;
    return made;
  }

  /** Crumbs chipped off the face being mined. `face` = Dir (0 down, 1 up, 2 N, 3 S, 4 W, 5 E). */
  spawnBlockHit(x: number, y: number, z: number, state: number, face: number): number {
    if (!state) return 0;
    const N = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][face] ?? [0, 1, 0];
    let made = 0;
    const count = this.n(2.5);
    for (let k = 0; k < count; k++) {
      // random point on the face, slightly outside
      let px = x + 0.1 + rnd() * 0.8, py = y + 0.1 + rnd() * 0.8, pz = z + 0.1 + rnd() * 0.8;
      if (N[0]) px = x + (N[0] > 0 ? 1.06 : -0.06);
      if (N[1]) py = y + (N[1] > 0 ? 1.06 : -0.06);
      if (N[2]) pz = z + (N[2] > 0 ? 1.06 : -0.06);
      const s = 1 + rnd() * 1.6;
      if (this.crumb(state, px, py, pz, N[0] * s + (rnd() - 0.5), N[1] * s + 0.8 + rnd(), N[2] * s + (rnd() - 0.5), 0.7) >= 0) made++;
    }
    const cx = x + 0.5 + N[0] * 0.55, cy = y + 0.5 + N[1] * 0.55, cz = z + 0.5 + N[2] * 0.55;
    if (rnd() < 0.5) made += this.blockDust(state, cx, cy - 0.2, cz, 1, 0.6, 0.6);
    if (blockParticleInfo(state).metal) made += this.primitive(PT.sparks, cx, cy, cz, { count: 6, speed: 4, vel: [N[0] * 3, N[1] * 3 + 1, N[2] * 3], spread: 0.15 });
    return made;
  }

  // ------------------------------------------------------------------------- composites
  explosion(x: number, y: number, z: number, power: number): number {
    const sys = this.sys;
    const P = Math.max(0.5, power);
    const s = Math.sqrt(P / 4); // TNT = 1
    let made = 0;
    // light
    sys.flash?.add(x, y + 0.5, z, 1, 0.62, 0.3, 900 * P, 0.45 + 0.1 * s, 18 * s + 6);
    // fireball core
    const nf = this.n(10 + 6 * P);
    for (let k = 0; k < nf; k++) {
      randDir(tmpD);
      const r = rnd() * 0.9 * s;
      const sp = (3 + rnd() * 5) * s;
      const i = sys.spawn(PT.explosion_fire, x + tmpD[0] * r, y + Math.abs(tmpD[1]) * r * 0.6 + 0.3, z + tmpD[2] * r, tmpD[0] * sp, Math.abs(tmpD[1]) * sp + 1.5, tmpD[2] * sp);
      if (i < 0) break;
      sys.lp.size[i] *= 1.3 * s * (0.7 + rnd() * 0.6);
      sys.lp.life[i] *= 0.8 + 0.4 * s;
      made++;
    }
    // smoke column
    const ns = this.n(8 + 4 * P);
    for (let k = 0; k < ns; k++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 1.4 * s;
      const i = sys.spawn(PT.explosion_smoke, x + Math.cos(a) * r, y + 0.4 + rnd() * 1.5 * s, z + Math.sin(a) * r, Math.cos(a) * 2 * s, 2.5 + rnd() * 3.5 * s, Math.sin(a) * 2 * s);
      if (i < 0) break;
      sys.lp.size[i] *= 1.25 * s;
      made++;
    }
    // ground: dust ring, shockwave, debris
    const w = sys.world;
    let gy = NaN, groundState = 0;
    if (w) {
      for (let dy = 0; dy <= Math.ceil(P) + 2; dy++) {
        const st = w.getBlock(Math.floor(x), Math.floor(y) - dy, Math.floor(z));
        if (st && T_SOLID[st >>> 4]) { gy = Math.floor(y) - dy + 1; groundState = st; break; }
      }
    }
    const ringY = Number.isNaN(gy) ? y : gy + 0.05;
    let i = sys.spawn(PT.shockwave, x, ringY + 0.1, z);
    if (i >= 0) { sys.lp.size[i] *= s; made++; }
    if (!Number.isNaN(gy)) {
      i = sys.spawn(PT.dust_ring, x, ringY, z);
      if (i >= 0) {
        sys.lp.size[i] *= s;
        made++;
      }
      const nd = this.n(14 + 5 * P);
      for (let k = 0; k < nd; k++) {
        const a = rnd() * Math.PI * 2, sp = (5 + rnd() * 7) * s;
        const j = sys.spawn(PT.dust, x + Math.cos(a) * 0.8, ringY + 0.2, z + Math.sin(a) * 0.8, Math.cos(a) * sp, 0.6 + rnd() * 1.5, Math.sin(a) * sp);
        if (j < 0) break;
        sys.lp.size[j] *= 2.2 * s;
        sys.lp.life[j] *= 1.6;
        this.colorDust(sys.lp, j, groundState, x, z);
        made++;
      }
      const nc = this.n(18 + 8 * P);
      for (let k = 0; k < nc; k++) {
        randDir(tmpD);
        const sp = (5 + rnd() * 9) * s;
        if (this.crumb(groundState, x + tmpD[0] * 0.5, ringY + 0.3, z + tmpD[2] * 0.5, tmpD[0] * sp, Math.abs(tmpD[1]) * sp + 4, tmpD[2] * sp, 1.3) >= 0) made++;
      }
    }
    // sparks / embers
    made += this.primitive(PT.sparks, x, y + 0.5, z, { count: 18 + 6 * P, speed: 14 * s, spread: 0.4 * s });
    made += this.primitive(PT.ember, x, y + 0.8, z, { count: 10 + 3 * P, speed: 4 * s, spread: 0.8 * s, vel: [0, 2, 0] });
    return made;
  }

  waterSplash(x: number, y: number, z: number, strength = 1): number {
    const sys = this.sys;
    const st = Math.min(2.5, Math.max(0.3, strength));
    let made = 0;
    const n = this.n(10 + 22 * st);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, r = 0.2 + rnd() * 0.35 * st;
      const sp = (0.8 + rnd() * 1.8) * st;
      if (sys.spawn(PT.splash, x + Math.cos(a) * r, y + 0.05, z + Math.sin(a) * r, Math.cos(a) * sp, (2.5 + rnd() * 3.5) * Math.sqrt(st), Math.sin(a) * sp) >= 0) made++;
    }
    for (let k = 0; k < 2; k++) {
      const i = sys.spawn(PT.ripple, x, y + 0.02, z);
      if (i >= 0) { sys.lp.size[i] *= st * (1 + k * 0.6); sys.lp.life[i] *= 1 + k * 0.5; made++; }
    }
    made += this.primitive(PT.bubble, x, y - 0.4, z, { count: 4 + 6 * st, spread: [0.4, 0.3, 0.4], speed: 0.6 });
    made += this.primitive(PT.poof, x, y + 0.15, z, { count: 2, spread: 0.3, color: [0.6, 0.65, 0.7], size: 0.8 * st, life: 0.6 });
    return made;
  }

  firework(x: number, y: number, z: number, colors: number[], intensity = 1): number {
    const sys = this.sys;
    hexToLinear(colors[0] ?? 0xffffff, tmpC);
    sys.flash?.add(x, y, z, tmpC[0] + 0.2, tmpC[1] + 0.2, tmpC[2] + 0.2, 500 * intensity, 0.5, 40);
    let made = 0;
    const n = this.n(110 * intensity);
    for (let k = 0; k < n; k++) {
      randDir(tmpD);
      const sp = 9 + rnd() * 2;
      const i = sys.spawn(PT.firework_spark, x, y, z, tmpD[0] * sp, tmpD[1] * sp, tmpD[2] * sp);
      if (i < 0) break;
      hexToLinear(colors[k % colors.length] ?? 0xffffff, tmpC);
      sys.tint(i, tmpC[0], tmpC[1], tmpC[2]);
      made++;
    }
    return made;
  }

  totem(x: number, y: number, z: number): number {
    const sys = this.sys;
    let made = 0;
    const n = this.n(90);
    for (let k = 0; k < n; k++) {
      randDir(tmpD);
      const sp = 3 + rnd() * 6;
      const i = sys.spawn(PT.totem, x + tmpD[0] * 0.3, y + 1 + tmpD[1] * 0.5, z + tmpD[2] * 0.3, tmpD[0] * sp, Math.abs(tmpD[1]) * sp + 4, tmpD[2] * sp);
      if (i < 0) break;
      // Minecraft totem palette: greens and yellows
      if (rnd() < 0.25) sys.tint(i, 0.9, 0.85, 0.25); else sys.tint(i, 0.25 + rnd() * 0.3, 0.75 + rnd() * 0.25, 0.1);
      made++;
    }
    sys.flash?.add(x, y + 1, z, 0.6, 1, 0.4, 60, 0.6, 10);
    return made;
  }

  sweep(x: number, y: number, z: number, yaw: number): number {
    const i = this.sys.spawn(PT.sweep_attack, x, y, z);
    if (i < 0) return 0;
    this.sys.lp.rot[i] = yaw + Math.PI;
    return 1;
  }

  critHit(x: number, y: number, z: number, magic: boolean, size = 1): number {
    return this.primitive(magic ? PT.magic_crit : PT.crit, x, y, z, { count: 16 * size, speed: 4.5, spread: [0.3 * size, 0.5 * size, 0.3 * size], vel: [0, 1, 0] });
  }

  bloodSpray(x: number, y: number, z: number, o: EmitOptions): number {
    const sys = this.sys;
    const col = colorOf(o.color, tmpC) ?? [0.22, 0.004, 0.004];
    const dx = o.dir ? vx(o.dir) : 0, dy = o.dir ? vy(o.dir) : 0, dz = o.dir ? vz(o.dir) : 0;
    const n = this.n(o.count ?? 10);
    let made = 0;
    for (let k = 0; k < n; k++) {
      randDir(tmpD);
      const sp = 1 + rnd() * 3;
      const i = sys.spawn(PT.blood, x + tmpD[0] * 0.08, y + tmpD[1] * 0.08, z + tmpD[2] * 0.08, dx * 3 + tmpD[0] * sp, dy * 3 + tmpD[1] * sp + 1.8, dz * 3 + tmpD[2] * sp);
      if (i < 0) break;
      sys.tint(i, col[0] * (0.8 + rnd() * 0.4), col[1], col[2]);
      if (o.size) sys.lp.size[i] *= o.size;
      made++;
    }
    return made;
  }

  poof(x: number, y: number, z: number, size = 1): number {
    return this.primitive(PT.poof, x, y, z, { count: 14 * size, spread: [0.35 * size, 0.5 * size, 0.35 * size], speed: 1.2, size });
  }

  lightningImpact(x: number, y: number, z: number, state: number): number {
    let made = this.primitive(PT.sparks, x, y + 0.2, z, { count: 40, speed: 12, spread: 0.3 });
    made += this.primitive(PT.ember, x, y + 0.3, z, { count: 14, speed: 3, spread: 0.6, vel: [0, 2, 0] });
    made += this.primitive(PT.large_smoke, x, y + 0.3, z, { count: 6, spread: 0.6, vel: [0, 1.2, 0], color: [0.05, 0.05, 0.05] });
    if (state) {
      for (let k = 0; k < this.n(16); k++) {
        randDir(tmpD);
        const sp = 4 + rnd() * 5;
        if (this.crumb(state, x + tmpD[0] * 0.3, y + 0.1, z + tmpD[2] * 0.3, tmpD[0] * sp, Math.abs(tmpD[1]) * sp + 3, tmpD[2] * sp) >= 0) made++;
      }
    }
    return made;
  }

  teleport(x: number, y: number, z: number, target?: Vec3Like): number {
    // Minecraft enderman/pearl teleport: portal particles along the path
    let made = 0;
    const tx = target ? vx(target) : x, ty = target ? vy(target) : y, tz = target ? vz(target) : z;
    const n = this.n(64);
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const px = x + (tx - x) * f + (rnd() - 0.5), py = y + (ty - y) * f + rnd() * 2, pz = z + (tz - z) * f + (rnd() - 0.5);
      if (this.sys.spawn(PT.portal, px, py, pz, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4) >= 0) made++;
    }
    return made;
  }

  potionSplash(x: number, y: number, z: number, color: number | readonly [number, number, number]): number {
    let made = this.primitive(PT.potion_swirl, x, y + 0.2, z, { count: 40, speed: 3, spread: 0.3, color });
    made += this.primitive(PT.splash, x, y + 0.1, z, { count: 12, speed: 3, vel: [0, 2, 0], color: [0.75, 0.85, 0.95] });
    return made;
  }

  /** Effect colour particles for an entity with status effects (Minecraft potion swirls). */
  effectSwirl(x: number, y: number, z: number, color: number, ambient = false): number {
    const i = this.sys.spawn(PT.potion_swirl, x, y, z, (rnd() - 0.5) * 0.3, 0.3, (rnd() - 0.5) * 0.3);
    if (i < 0) return 0;
    hexToLinear(color, tmpC);
    this.sys.tint(i, tmpC[0], tmpC[1], tmpC[2], ambient ? 0.35 : 0.9);
    return 1;
  }

  /** Dynamic light flash (explosions, muzzle flashes ...). */
  flash(x: number, y: number, z: number, color: number, intensity: number, duration = 0.3, radius = 16) {
    hexToLinear(color, tmpC);
    this.sys.flash?.add(x, y, z, tmpC[0], tmpC[1], tmpC[2], intensity, duration, radius);
  }

  clear() {
    this.sys.clear();
  }

  get count() {
    return this.sys.count;
  }
}

/** Resolve a block state by name (convenience for effects needing specific blocks). */
export function blockStateByName(name: string): number {
  const b = BLOCK_BY_NAME.get(name);
  return b ? b.id << 4 : 0;
}
