/**
 * TORNADO: a supercell vortex that touches down where the spawner was placed and wanders
 * roughly along the player's facing for 40-60 s.
 *
 *  - visuals: raymarched condensation funnel + churning debris cloud, a rotating wall cloud,
 *    orbiting dust/crumb particles (a vortex velocity field is applied to every particle near
 *    the funnel), torn-out blocks spiralling up the funnel then flung out as physics debris,
 *    lightning bolts and in-cloud flashes, a greenish-gray storm tint.
 *  - gameplay: rips soft blocks (plants, leaves, glass, wood, roofs, topsoil) from a damage path,
 *    lifts and flings mobs, items, physics bodies and the player; mobs take damage. Creative
 *    players are pushed around but stay unharmed.
 *  - life cycle: funnel lowers from the cloud, touchdown, mature stage, rope-out (thin,
 *    contorted, stretched) and fade; debris is released as it dies.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { registerDisaster, BulkEdit, type Disaster, type DisasterContext } from './kit';
import { BLOCKS } from '../../world/blocks/registry';
import { LivingEntity } from '../../entity/living';
import type { Entity } from '../../entity/entity';
import type { PhysicsWorld, PhysBody } from '../../physics/rapierWorld';
import { PT } from '../../render/particles/defs';
import { TornadoPath, tornadoLife, funnelRadius, axisOffset, vortexWind, influence, ripOffset, type FunnelShape, type LifeState, type Wind } from './wind/vortex';
import { Mat, matOf, windResistance } from './wind/materials';
import { NoiseVolume } from './wind/noiseTex';
import { StormVolume, Bolt, type VolumeRendererLike } from './wind/funnel';
import { FlyingDebris, type OrbitFrame } from './wind/flyingDebris';

const TICK = 0.05;
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Seeded xorshift random in [0,1). */
export function rng(seed: number) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export interface TornadoOptions {
  seed?: number;
  /** Seconds (default 44-58). */
  duration?: number;
  effects?: DisasterContext['effects'];
}

export class Tornado implements Disaster {
  readonly name = 'tornado';
  readonly path: TornadoPath;
  readonly duration: number;
  readonly shape: FunnelShape;
  readonly life: LifeState = { reach: 0, strength: 0, rope: 0, fade: 0, storm: 0 };
  /** Seconds since start (simulation clock, 20 TPS). */
  t = 0;
  private ticks = 0;
  private frameAcc = 0;
  private rnd: () => number;
  readonly seed: number;
  /** Funnel base (ground point under the axis). */
  readonly base = new THREE.Vector3();
  groundY: number;
  private heading = { x: 1, z: 0 };
  private spin = 0;
  // rendering
  private fwd = new THREE.Scene();
  private noise: NoiseVolume | null = null;
  private funnel: StormVolume | null = null;
  private cloud: StormVolume | null = null;
  private bolts: Bolt[] = [];
  readonly debris: FlyingDebris;
  private dust = new THREE.Vector3(0.18, 0.15, 0.12);
  private dustAcc = 0;
  // gameplay
  private ground = new Map<number, number>();
  private flung = new Map<number, number>();
  private caught = new Map<number, Caught>();
  private edit: BulkEdit;
  private wind: Wind = { vt: 0, vr: 0, vy: 0 };
  /** Counters (tests / debug). */
  readonly stats = { ripped: 0, debris: 0, lifted: 0, maxTickMs: 0 };
  // fx
  private loops: { roar: any; howl: any; pos: any } | null = null;
  private nextFlash = 3;
  private flashLevel = 0;
  private weatherWas: { raining: boolean; thundering: boolean; rainTime: number; thunderTime: number } | null = null;
  private axisX = new Float32Array(0);
  private axisZ = new Float32Array(0);
  private orbit: OrbitFrame;
  private fx: DisasterContext['effects'] | null;
  private disposed = false;
  /** r / core radius of the last `field` query. */
  private coreX = 0;

  constructor(readonly game: Game, x: number, y: number, z: number, fx: number, fz: number, o: TornadoOptions = {}) {
    this.seed = o.seed ?? ((Math.random() * 1e9) | 0);
    this.rnd = rng(this.seed);
    const rnd = this.rnd;
    this.duration = o.duration ?? 44 + rnd() * 14;
    this.fx = o.effects ?? null;
    this.path = new TornadoPath(this.seed, x + 0.5, z + 0.5, fx, fz, { duration: this.duration + 2, speed: 1.9 + rnd() * 0.9 });
    this.groundY = y;
    this.base.set(x + 0.5, y, z + 0.5);
    const H = Math.max(36, Math.min(64, 250 - y - 30));
    this.shape = { H, rBase: 2.3 + rnd() * 0.9, rTop: 11 + rnd() * 4, tiltX: 0, tiltZ: 0, wob: 1.5, s1: rnd() * 6.28, s2: rnd() * 6.28 };
    this.edit = new BulkEdit(game);
    this.debris = new FlyingDebris(game, rnd);
    this.orbit = {
      t: 0, strength: 0, rope: 0, groundY: y, H,
      axis: (h, out) => this.axisAt(h, out),
      radius: (h) => this.radiusAt(h),
      windT: (r, h) => vortexWind(r, h, this.radiusAt(h) * 1.1, this.life.strength, this.wind).vt,
    };
    this.path.heading(0, this.heading);
    this.initRender();
    this.initWeather();
  }

  // ------------------------------------------------------------------------- geometry
  /** Funnel radius at height h above the ground (current time). */
  radiusAt(h: number) {
    return funnelRadius(h / this.shape.H, this.shape.rBase, this.shape.rTop, this.life.rope);
  }
  /** World xz of the funnel axis at height h above the ground. */
  axisAt(h: number, out: { x: number; z: number }) {
    axisOffset(h / this.shape.H, this.t + this.frameAcc, this.shape, out);
    out.x += this.base.x;
    out.z += this.base.z;
    return out;
  }

  // ------------------------------------------------------------------------- setup
  private initRender() {
    const g = this.game;
    const r = g.renderer as unknown as VolumeRendererLike | undefined;
    const ex = g.renderExtras;
    if (!r || !r.atmosphere || !ex) return;
    try {
      this.noise = new NoiseVolume();
      this.cloud = new StormVolume(r, this.noise, true);
      this.funnel = new StormVolume(r, this.noise, false, this.cloud.u);
      this.cloud.mesh.visible = this.funnel.mesh.visible = false;
      this.fwd.add(this.cloud.mesh, this.funnel.mesh);
      // before the particle scene: billboards composite over the volumes
      (ex.forward ??= []).unshift(this.fwd);
      (ex.gbuffer ??= []).push(this.debris.scene);
    } catch (e) {
      console.warn('tornado: render init failed', e);
      this.funnel = this.cloud = null;
    }
  }

  private initWeather() {
    const w = this.game.weather;
    if (!w || this.game.dimension !== 'overworld') return;
    this.weatherWas = { raining: w.raining, thundering: w.thundering, rainTime: w.rainTime, thunderTime: w.thunderTime };
  }

  // ------------------------------------------------------------------------- tick (20 TPS)
  tick(game: Game): boolean {
    if (this.disposed) return false;
    const t0 = performance.now();
    this.ticks++;
    this.t = this.ticks * TICK;
    this.frameAcc = 0;
    const L = tornadoLife(this.t, this.duration, this.life);
    // move along the path, follow the terrain
    const p = this.path.at(this.t);
    this.base.x = p.x;
    this.base.z = p.z;
    const gy = this.sampleGround(p.x, p.z);
    if (gy !== null) this.groundY += (gy - this.groundY) * 0.15;
    this.base.y = this.groundY;
    // shape: the top lags behind the motion; stretched and contorted while roping out
    const hd = this.path.heading(this.t, this.heading);
    const lean = 7 + L.rope * 16;
    this.shape.tiltX += (-hd.x * lean - this.shape.tiltX) * 0.05;
    this.shape.tiltZ += (-hd.z * lean - this.shape.tiltZ) * 0.05;
    this.shape.wob = 1.6 + L.rope * 9;
    const o = this.orbit;
    o.t = this.t; o.strength = L.strength; o.rope = L.rope; o.groundY = this.groundY;
    if (L.strength > 0.15) this.rip(game, L.strength);
    if (L.strength > 0.02) {
      this.pushEntities(game, L.strength);
      this.pushBodies(game, L.strength);
    }
    if (this.ticks % 10 === 1) this.sampleDust(game);
    this.tickWeather(game, L);
    this.stats.maxTickMs = Math.max(this.stats.maxTickMs, performance.now() - t0);
    if (this.t >= this.duration) {
      this.debris.releaseAll();
      this.releaseEntities(game);
      return false;
    }
    return true;
  }

  /** Median surface height of 5 columns around (x,z), or null if unloaded. */
  private sampleGround(x: number, z: number): number | null {
    const w = this.game.world;
    if (!w) return null;
    const hs: number[] = [];
    for (const [dx, dz] of SAMPLES) {
      const bx = Math.floor(x + dx), bz = Math.floor(z + dz);
      if (!w.getChunk(bx >> 4, bz >> 4)) continue;
      const h = w.getHeight(bx, bz);
      if (h > 0) hs.push(h);
    }
    if (!hs.length) return null;
    hs.sort((a, b) => a - b);
    return hs[hs.length >> 1];
  }

  /** Topmost non-air block of a column (scans a little above the heightmap for glass/plants). */
  private top(x: number, z: number): number {
    const w = this.game.world;
    const h = w.getHeight(x, z);
    for (let y = Math.min(255, Math.max(h, Math.floor(this.groundY)) + 10); y >= Math.max(0, h - 2); y--) if (w.getBlock(x, y, z)) return y;
    return -1;
  }

  // ------------------------------------------------------------------------- ripping
  private rip(game: Game, strength: number) {
    const w = game.world;
    if (!w) return;
    const rnd = this.rnd;
    const rc = this.radiusAt(0) * 1.1;
    const radius = rc * 1.9 + 3;
    const attempts = Math.round(30 * strength);
    let removed = 0, sounds = 0;
    const maxRemove = 4 + Math.round(5 * strength);
    const off = { x: 0, z: 0 };
    const ps = game.particles;
    this.edit.begin();
    try {
      for (let a = 0; a < attempts && removed < maxRemove; a++) {
        ripOffset(rnd, radius, off);
        const x = Math.floor(this.base.x + off.x), z = Math.floor(this.base.z + off.z);
        if (!w.getChunk(x >> 4, z >> 4)) continue;
        const y = this.top(x, z);
        if (y < 1) continue;
        const st = w.getBlock(x, y, z);
        const def = BLOCKS[st >>> 4];
        if (!def) continue;
        const r = Math.hypot(x + 0.5 - this.base.x, z + 0.5 - this.base.z);
        if (def.liquid) {
          // water spout spray
          if (ps && rnd() < 0.5) ps.emit('splash', [x + 0.5, y + 1, z + 0.5], { count: 6, speed: 4, vel: [0, 8, 0], spread: 0.6 });
          continue;
        }
        const res = windResistance(st);
        if (!isFinite(res)) continue;
        // wind at this column relative to a full-strength core
        const k = strength * (r < rc ? 1 : Math.pow(rc / r, 0.8)) * (0.55 + rnd() * 0.75);
        if (k < res) continue;
        const m = matOf(st);
        // keep the scoured trench shallow: topsoil goes, the rock of the landscape stays
        const key = ((x & 0xffff) << 16) | (z & 0xffff);
        let g0 = this.ground.get(key);
        if (g0 === undefined) {
          g0 = y;
          this.ground.set(key, y);
        }
        if ((m === Mat.Ground || m === Mat.Rock) && g0 - y >= 2) continue;
        if (!this.edit.set(x, y, z, 0)) continue;
        // double plants / doors: take the other half too
        if (def.shape === 'double_plant' || def.shape === 'door') {
          if (w.getBlock(x, y - 1, z) >>> 4 === st >>> 4) this.edit.set(x, y - 1, z, 0);
        }
        removed++;
        this.stats.ripped++;
        const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
        const ang = Math.atan2(cz - this.base.z, cx - this.base.x);
        const h = cy - this.groundY;
        let flew = false;
        if (m !== Mat.Plant && m !== Mat.Glass && (m !== Mat.Leaves || rnd() < 0.55)) {
          flew = this.debris.add(st, x, y, z, ang, r, h);
          if (flew) this.stats.debris++;
        }
        if (ps) {
          if (m === Mat.Glass) ps.emit('block_break', [x, y, z], { state: st });
          else {
            // shredded bits thrown along the vortex
            const tx = -Math.sin(ang), tz = Math.cos(ang);
            const n = flew ? 3 : 7;
            for (let i = 0; i < n; i++) {
              const s = 6 + rnd() * 10;
              ps.crumb(st, cx + (rnd() - 0.5), cy + rnd() * 0.5, cz + (rnd() - 0.5), tx * s, 3 + rnd() * 6, tz * s, m === Mat.Leaves || m === Mat.Plant ? 1.4 : 1);
            }
            if (m === Mat.Ground) ps.emit('dust', [cx, cy + 0.5, cz], { state: st, count: 3, spread: 0.5, speed: 2, size: 2 });
          }
        }
        if (sounds < 3 && game.audio?.playBlock) {
          const pp = game.player?.pos;
          if (!pp || Math.hypot(pp.x - cx, pp.z - cz) < 48) {
            sounds++;
            game.audio.playBlock(def.sound, 'break', { pos: { x: cx, y: cy, z: cz }, volume: 0.7, pitch: 0.8 + rnd() * 0.3 });
          }
        }
      }
    } finally {
      this.edit.end();
    }
  }

  // ------------------------------------------------------------------------- forces
  /** Target velocity of the vortex at a world point into `out`; returns its influence 0..1. */
  field(x: number, y: number, z: number, strength: number, out: THREE.Vector3, tangential = 1, inflow = 1): number {
    const h = y - this.groundY;
    const H = this.shape.H;
    if (h < -4 || h > H * 0.9) return 0;
    const ax = this.axisAt(Math.max(0, h), _ax);
    const dx = x - ax.x, dz = z - ax.z;
    const r = Math.hypot(dx, dz);
    const rc = this.radiusAt(Math.max(0, h)) * 1.1;
    const inf = influence(r, rc);
    this.coreX = r / rc;
    if (inf <= 0) return 0;
    const wd = vortexWind(r, h, rc, strength, this.wind);
    const ux = r > 1e-3 ? dx / r : 1, uz = r > 1e-3 ? dz / r : 0;
    // counter-clockwise seen from above (cyclonic): tangent = (-uz, ux)
    const vt = wd.vt * tangential, vr = wd.vr * inflow;
    out.set(-uz * vt + ux * vr, wd.vy, ux * vt + uz * vr);
    return inf;
  }

  private pushEntities(game: Game, strength: number) {
    const list = game.entities?.list;
    if (!list) return;
    const v = _v;
    const reach = this.shape.rTop + 30;
    const rnd = this.rnd;
    for (const e of list) {
      if (e.removed) {
        this.caught.delete(e.id);
        continue;
      }
      const dx = e.pos.x - this.base.x, dz = e.pos.z - this.base.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      const pl = e === (game.player as unknown as Entity) ? (game.player as any) : null;
      if (pl && (pl.spectator || pl.dead)) continue;
      const until = this.flung.get(e.id);
      if (until !== undefined && until > this.ticks) continue;
      const cy = e.pos.y + e.height * 0.5;
      const h = e.pos.y - this.groundY;
      const living = e instanceof LivingEntity || !!pl || e.type !== 'item' && e.type !== 'falling_block' && 'health' in e;
      // ---- carried: orbit the funnel while rising, then thrown out
      const cap = this.caught.get(e.id);
      if (cap) {
        if (strength < 0.1 || cap.h > cap.release || e.pos.distanceTo(cap.last) > 6) {
          this.fling(e, cap, !!pl);
          continue;
        }
        cap.h += cap.rise * TICK * strength;
        const rT = this.radiusAt(cap.h) * (pl ? 1.6 : 1.25) + 0.6;
        cap.r += (rT - cap.r) * 0.15;
        cap.ang += (vortexWind(cap.r, cap.h, this.radiusAt(cap.h) * 1.1, strength, this.wind).vt * 0.45 / Math.max(1, cap.r)) * TICK;
        this.axisAt(cap.h, _ax);
        const tx = _ax.x + Math.cos(cap.ang) * cap.r, ty = this.groundY + cap.h, tz = _ax.z + Math.sin(cap.ang) * cap.r;
        // velocity that reaches the target over the next tick (+ gravity compensation)
        e.vel.set((tx - e.pos.x) / TICK * 0.85, (ty - e.pos.y) / TICK * 0.85 + 0.8, (tz - e.pos.z) / TICK * 0.85);
        if (e.vel.length() > 40) e.vel.setLength(40);
        e.onGround = false;
        e.fallDistance = 0;
        cap.last.set(tx, ty, tz);
        if (living && !pl && this.ticks % 10 === e.id % 10) {
          e.hurt({ type: 'generic', point: e.pos.clone().setY(cy), dir: _v.set(-Math.sin(cap.ang), 0.3, Math.cos(cap.ang)).clone(), impulse: 2 }, 1 + rnd() * 2);
        }
        if (pl && !pl.creative && this.ticks % 20 === 0) pl.hurt({ type: 'generic', point: e.pos.clone().setY(cy) }, 1);
        continue;
      }
      const inf = this.field(e.pos.x, cy, e.pos.z, strength, v, 0.5, 1.8);
      if (inf <= 0) continue;
      if (e.type === 'item') {
        const body = (e as any).body as PhysBody | null;
        const pw = game.physics as PhysicsWorld | null;
        if (body && pw && !body.removed) {
          const bv = body.linvel(_bv);
          bv.lerp(v, 0.35 * inf);
          pw.setVelocity(body, bv);
          continue;
        }
      }
      // ---- pushed by the wind field; dragged into the core by the inflow
      const mass = e.type === 'falling_block' ? 3 : Math.max(0.5, Math.min(2, (e.mass || 70) / 70));
      let k = Math.min(0.6, (0.4 * inf) / Math.sqrt(mass));
      if (pl) k *= pl.creative ? 0.55 : 0.42;
      e.vel.lerp(v, k);
      const x = this.coreX;
      e.vel.y += 32 * TICK * 0.9 * Math.exp(-0.5 * x * x) * strength / Math.sqrt(mass);
      if (inf > 0.5 && e.vel.y > 0) e.onGround = false;
      // caught when close to the core near the ground
      if (x < 2.2 && h < 8 && strength > 0.3 && this.caught.size < 24) {
        const ax = this.axisAt(Math.max(0, h), _ax);
        this.caught.set(e.id, {
          ang: Math.atan2(e.pos.z - ax.z, e.pos.x - ax.x),
          r: Math.hypot(e.pos.x - ax.x, e.pos.z - ax.z),
          h: Math.max(0, h),
          rise: pl ? 3.5 : 4 + rnd() * 5,
          // mobs go high, the player much less (survivable)
          release: pl ? 7 + rnd() * 3 : 12 + rnd() * 22,
          last: e.pos.clone(),
        });
        this.stats.lifted++;
      }
      if (pl && !pl.creative && e.vel.y > -2) e.fallDistance = 0;
    }
  }

  private releaseEntities(game: Game) {
    for (const [id, cap] of this.caught) {
      const e = game.entities?.list.find((o) => o.id === id);
      if (e && !e.removed) this.fling(e, cap, e === (game.player as unknown as Entity));
    }
    this.caught.clear();
  }

  /** Throw an entity out of the vortex. */
  private fling(e: Entity, cap: Caught, player: boolean) {
    this.caught.delete(e.id);
    const ax = this.axisAt(Math.max(0, cap.h), _ax);
    const ox = e.pos.x - ax.x, oz = e.pos.z - ax.z, ol = Math.hypot(ox, oz) || 1;
    const s = player ? 8 : 12 + this.rnd() * 7;
    e.vel.set((ox / ol) * s - (oz / ol) * s * 0.8, 2 + this.rnd() * 4, (oz / ol) * s + (ox / ol) * s * 0.8);
    this.flung.set(e.id, this.ticks + (player ? 60 : 40));
  }

  private pushBodies(game: Game, strength: number) {
    const pw = game.physics as PhysicsWorld | null;
    if (!pw?.querySphere) return;
    const c = _c.set(this.base.x, this.groundY + 6, this.base.z);
    let n = 0;
    const bodies = pw.querySphere(c, this.shape.rBase * 2 + 22, (b) => b.dynamic && !FlyingDebris.ignored(b) && b.kind !== 'item');
    for (const b of bodies) {
      if (n++ > 60) break;
      const inf = this.field(b.pos.x, b.pos.y, b.pos.z, strength, _v);
      if (inf <= 0) continue;
      const bv = b.linvel(_bv);
      const k = Math.min(0.5, (0.4 * inf) / Math.max(1, Math.sqrt(b.mass / 40)));
      bv.lerp(_v, k);
      pw.setVelocity(b, bv);
    }
  }

  // ------------------------------------------------------------------------- weather
  private tickWeather(game: Game, L: LifeState) {
    const w = game.weather;
    if (!w || !this.weatherWas || game.dimension !== 'overworld') return;
    if (L.storm > 0.2) {
      w.raining = true;
      w.thundering = true;
      // keep the vanilla cycle from ending it mid-storm
      w.rainTime = Math.max(w.rainTime, 200);
      w.thunderTime = Math.max(w.thunderTime, 200);
      w.rain += (1 - w.rain) * 0.02;
      w.thunder += (1 - w.thunder) * 0.02;
    }
  }

  private restoreWeather() {
    const w = this.game.weather;
    const was = this.weatherWas;
    if (!w || !was) return;
    w.raining = was.raining;
    w.thundering = was.thundering;
    w.rainTime = Math.max(1, was.rainTime - this.ticks);
    w.thunderTime = Math.max(1, was.thunderTime - this.ticks);
    this.weatherWas = null;
  }

  /** Debris-cloud colour from the ground under the funnel. */
  private sampleDust(game: Game) {
    const w = game.world;
    if (!w) return;
    const x = Math.floor(this.base.x), z = Math.floor(this.base.z);
    const y = this.top(x, z);
    if (y < 0) return;
    const st = w.getBlock(x, y, z);
    let c = BLOCKS[st >>> 4]?.mapColor ?? 0x806a50;
    const m = matOf(st);
    if (c === 0x808080 || m === Mat.Leaves || m === Mat.Plant || m === Mat.None) c = 0x7a6450;
    const r = s2l(((c >> 16) & 255) / 255), g = s2l(((c >> 8) & 255) / 255), b = s2l((c & 255) / 255);
    // dirty brown-gray: soil colour mixed with dark debris
    this.dust.x += (r * 0.35 + 0.09 - this.dust.x) * 0.3;
    this.dust.y += (g * 0.35 + 0.075 - this.dust.y) * 0.3;
    this.dust.z += (b * 0.35 + 0.06 - this.dust.z) * 0.3;
  }

  // ------------------------------------------------------------------------- frame update
  update(game: Game, dt: number) {
    if (this.disposed) return;
    this.frameAcc = Math.min(TICK, this.frameAcc + dt);
    const t = this.t + this.frameAcc;
    const L = this.life;
    // interpolate the base between ticks for smooth motion
    const p = this.path.at(t);
    this.base.x = p.x;
    this.base.z = p.z;
    this.spin += dt * (0.7 + 2.2 * L.strength + 0.6 * L.reach);
    this.buildAxisLut();
    this.debris.update(dt, L.strength > 0.04 ? this.orbit : null);
    this.updateVolumes(game, t, dt);
    this.updateParticles(game, dt);
    this.updateFx(game, dt);
  }

  /** Axis centre per block of height (fast lookups for thousands of particles). */
  private buildAxisLut() {
    const n = Math.ceil(this.shape.H) + 2;
    if (this.axisX.length !== n) {
      this.axisX = new Float32Array(n);
      this.axisZ = new Float32Array(n);
    }
    for (let i = 0; i < n; i++) {
      this.axisAt(i, _o);
      this.axisX[i] = _o.x;
      this.axisZ[i] = _o.z;
    }
  }

  private updateVolumes(game: Game, t: number, dt: number) {
    const f = this.funnel, c = this.cloud;
    if (!f || !c || !this.noise) return;
    if (!this.noise.ready) this.noise.step(6);
    const L = this.life, S = this.shape;
    const show = this.noise.ready;
    f.mesh.visible = show && L.fade > 0.003;
    c.mesh.visible = show && L.storm > 0.003;
    const gy = this.groundY;
    f.u.u_base.value.set(this.base.x, gy, this.base.z);
    f.u.u_shape.value.set(S.H, S.rBase, S.rTop, L.rope);
    f.u.u_bend.value.set(S.tiltX, S.tiltZ, S.wob, t);
    f.u.u_misc.value.set(S.s1, S.s2, L.reach, L.fade);
    // the debris cloud exists only while the vortex is on the ground
    f.u.u_dust.value.set(this.dust.x, this.dust.y, this.dust.z, Math.min(1, L.strength * 1.3) * L.fade);
    f.u.u_cond.value.set(0.19, 0.2, 0.21, this.spin);
    const Rw = 82;
    this.flashLevel *= Math.exp(-dt * 9);
    f.u.u_cloud.value.set(Rw, L.storm, this.flashLevel, 0);
    const ext = Math.max(S.rTop + Math.hypot(S.tiltX, S.tiltZ) + S.wob + 4, S.rBase * 2.4 + 16);
    f.setBox(this.base.x - ext, gy - 2, this.base.z - ext, this.base.x + ext, gy + S.H + 3, this.base.z + ext);
    const top = axisOffset(1, t, S, _o);
    const cx = this.base.x + top.x, cz = this.base.z + top.z;
    c.u.u_base.value.set(cx, gy + S.H, cz);
    c.u.u_misc.value.set(S.s1, S.s2, 1, L.storm);
    c.setBox(cx - Rw, gy + S.H - 16, cz - Rw, cx + Rw, gy + S.H + 26, cz + Rw);
    // lightning bolts
    const cam = game.cameraCtl?.camera?.position ?? _c;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (!b.update(dt, cam)) {
        b.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  private updateParticles(game: Game, dt: number) {
    const sys = game.particles?.sys;
    if (!sys?.pools || dt <= 0) return;
    const L = this.life, S = this.shape, rnd = this.rnd;
    const gy = this.groundY;
    // ---- emit: churning dust skirt at the ground
    if (L.strength > 0.05) {
      this.dustAcc += dt * 90 * L.strength * (sys.density ?? 1);
      let n = Math.min(24, Math.floor(this.dustAcc));
      this.dustAcc -= n;
      const rc = this.radiusAt(0) * 1.1;
      const dr = this.dust.x * 1.3, dg = this.dust.y * 1.3, db = this.dust.z * 1.3;
      while (n-- > 0) {
        const a = rnd() * Math.PI * 2, r = rc * (0.6 + rnd() * 2.2);
        const x = this.base.x + Math.cos(a) * r, z = this.base.z + Math.sin(a) * r;
        const h = game.world?.getHeight(Math.floor(x), Math.floor(z)) ?? gy;
        const y = (Math.abs(h - gy) < 6 ? h : gy) + 0.3 + rnd() * 1.5;
        const big = rnd() < 0.35;
        const i = sys.spawn(big ? PT.campfire_smoke : PT.dust, x, y, z, 0, 0, 0);
        if (i < 0) break;
        const pl = sys.lp;
        pl.r[i] = dr; pl.g[i] = dg; pl.b[i] = db;
        pl.size[i] *= big ? 2.6 + rnd() * 2 : 3 + rnd() * 2;
        pl.life[i] *= big ? 0.4 : 1.6;
        pl.a[i] *= 0.8;
      }
    }
    // ---- vortex velocity field on every particle near the funnel
    if (L.strength < 0.02) return;
    const ax = this.axisX, az = this.axisZ;
    const nH = ax.length - 1;
    const reach = S.rTop + 14;
    const bx = this.base.x, bz = this.base.z;
    const w = this.wind;
    const H = S.H;
    for (let pi = 0; pi < 2; pi++) {
      const p = sys.pools[pi];
      const crumbs = pi === 0;
      const kk = 1 - Math.exp(-dt * (crumbs ? 3.2 : 4.5));
      for (let i = 0; i < p.count; i++) {
        const dx0 = p.px[i] - bx, dz0 = p.pz[i] - bz;
        if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
        const h = p.py[i] - gy;
        if (h < -3 || h > H) continue;
        const hi = h < 0 ? 0 : h > nH ? nH : h | 0;
        const dx = p.px[i] - ax[hi], dz = p.pz[i] - az[hi];
        const r = Math.sqrt(dx * dx + dz * dz);
        const rc = funnelRadius(h / H, S.rBase, S.rTop, L.rope) * 1.1;
        const inf = influence(r, rc);
        if (inf <= 0) continue;
        vortexWind(r, h, rc, L.strength, w);
        const ux = r > 1e-3 ? dx / r : 1, uz = r > 1e-3 ? dz / r : 0;
        // particles orbit a bit slower than the wind and keep a gentle inward spiral
        const vt = w.vt * 0.75, vr = w.vr - 1.5 * inf;
        const tx = -uz * vt + ux * vr, ty = w.vy * 0.8, tz = ux * vt + uz * vr;
        const k = kk * inf;
        p.vx[i] += (tx - p.vx[i]) * k;
        p.vy[i] += (ty - p.vy[i]) * k + (crumbs ? 22 * dt * inf * 0.85 : 0);
        p.vz[i] += (tz - p.vz[i]) * k;
        p.flags[i] &= ~2; // PFlag.Resting: lift resting crumbs again
      }
    }
  }

  private updateFx(game: Game, dt: number) {
    const fx = this.fx ?? (game as any).disasters?.effects;
    const L = this.life;
    const cam = game.cameraCtl?.camera?.position ?? game.player?.pos;
    if (!cam) return;
    const d = Math.hypot(cam.x - this.base.x, cam.z - this.base.z);
    const close = Math.max(0, Math.min(1, 1 - (d - 8) / 110));
    if (fx) {
      fx.addShake(L.strength * (0.06 + 0.95 * Math.pow(close, 3)));
      // sickly green-gray supercell light, strongest under the storm
      fx.requestTint(0.16, 0.22, 0.17, L.storm * (0.1 + 0.22 * close));
    }
    // ---- audio: a roar that swells with proximity, a howl close in, a positional rumble
    const au = game.audio;
    if (au?.loop) {
      if (!this.loops && L.storm > 0.05) {
        this.loops = {
          roar: au.loop('loop.wind', { volume: 0, pitch: 0.55 }),
          howl: au.loop('loop.wind', { volume: 0, pitch: 1.3 }),
          pos: au.loop('loop.wind', { pos: this.base, volume: 0, pitch: 0.75 }),
        };
      }
      if (this.loops) {
        const s = Math.max(L.strength, L.storm * 0.25);
        this.loops.roar.setVolume(s * (0.12 + 0.95 * Math.pow(close, 1.5)));
        this.loops.howl.setVolume(L.strength * Math.pow(close, 4) * 0.8);
        this.loops.pos.setPos(this.base);
        this.loops.pos.setVolume(L.strength * 4);
      }
    }
    // ---- lightning
    if (L.storm > 0.3 && this.t > this.nextFlash) {
      this.nextFlash = this.t + 1.5 + this.rnd() * 4;
      this.lightning(game, cam, this.rnd() < 0.4);
    }
    const sf = game.particles?.sys?.flash?.skyFlash as THREE.Vector4 | undefined;
    if (sf && sf.w > 0) {
      const k = Math.exp(-dt * 7);
      sf.multiplyScalar(k);
      if (sf.x + sf.y + sf.z < 1e-3) sf.set(0, 0, 0, 0);
    }
  }

  private lightning(game: Game, cam: { x: number; y: number; z: number }, strike: boolean) {
    const rnd = this.rnd;
    const a = rnd() * Math.PI * 2, r = strike ? 14 + rnd() * 40 : rnd() * 60;
    const x = this.base.x + Math.cos(a) * r, z = this.base.z + Math.sin(a) * r;
    const yTop = this.groundY + this.shape.H + 2;
    const w = game.world;
    const gy = w ? Math.max(1, w.getHeight(Math.floor(x), Math.floor(z))) : this.groundY;
    const dist = Math.hypot(cam.x - x, cam.y - (strike ? gy : yTop), cam.z - z);
    const bright = strike ? 1 : 0.5 + rnd() * 0.4;
    this.flashLevel = Math.max(this.flashLevel, bright * 1.6);
    const flash = game.particles?.sys?.flash;
    if (flash) {
      flash.skyFlash.set(6 * bright, 6.6 * bright, 8 * bright, 0.35 * bright);
      flash.skyFlashDir.set(x - cam.x, yTop - cam.y, z - cam.z).normalize();
    }
    if (strike) {
      if (game.renderer) {
        const b = new Bolt(x, yTop, z, gy, rnd);
        this.fwd.add(b.mesh);
        this.bolts.push(b);
      }
      game.particles?.flash?.(x, gy + 2, z, 0xc8d4ff, 6000, 0.4, 70);
      game.particles?.emit?.('lightning_impact', [x, gy, z], { state: w?.getBlock(Math.floor(x), gy - 1, Math.floor(z)) ?? 0 });
      game.events?.emit('lightningStrike', { pos: new THREE.Vector3(x, gy, z) });
      if (this.fx && dist < 60) this.fx.flash(0.25 * (1 - dist / 60), 0xdfe6ff);
    }
    const au = game.audio;
    if (au?.thunder) au.thunder(dist);
    else au?.play?.(dist < 60 ? 'weather.thunder.near' : 'weather.thunder.far', { volume: 1 });
  }

  // ------------------------------------------------------------------------- cleanup
  dispose(game: Game = this.game) {
    if (this.disposed) return;
    this.disposed = true;
    this.edit.end();
    this.debris.dispose();
    for (const b of this.bolts) b.dispose();
    this.bolts.length = 0;
    const ex = game.renderExtras;
    if (ex) {
      if (ex.forward) ex.forward = ex.forward.filter((s) => s !== this.fwd);
      if (ex.gbuffer) ex.gbuffer = ex.gbuffer.filter((s) => s !== this.debris.scene);
    }
    this.funnel?.dispose();
    this.cloud?.dispose();
    this.noise?.dispose();
    this.funnel = this.cloud = null;
    this.noise = null;
    this.fwd.clear();
    if (this.loops) {
      this.loops.roar.stop(3);
      this.loops.howl.stop(2);
      this.loops.pos.stop(3);
      this.loops = null;
    }
    (game.particles?.sys?.flash?.skyFlash as THREE.Vector4 | undefined)?.set(0, 0, 0, 0);
    this.restoreWeather();
    this.ground.clear();
    this.flung.clear();
    this.caught.clear();
  }
}

interface Caught {
  ang: number;
  r: number;
  h: number;
  rise: number;
  release: number;
  last: THREE.Vector3;
}

const SAMPLES: [number, number][] = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]];
const _ax = { x: 0, z: 0 };
const _o = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _bv = new THREE.Vector3();
const _c = new THREE.Vector3();

registerDisaster('tornado', (ctx) => new Tornado(ctx.game, ctx.x, ctx.y, ctx.z, ctx.fx, ctx.fz, { effects: ctx.effects }));
