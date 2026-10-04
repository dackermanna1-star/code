/**
 * ASTEROID: an extinction-level impact at the spawner block (about 15 s of warning, the impact,
 * a minute of devastation, then several minutes of impact winter).
 *
 *  1. Warning: "IMPACT IMMINENT" countdown. A bright point high in the sky grows into a huge
 *     cratered rock (procedural displaced icosphere, PBR rock shader) wrapped in a blazing
 *     plasma sheath with a turbulent entry trail and a lingering smoke trail. It becomes a
 *     second key light: the landscape glows, shadows swing toward it, the rumble builds.
 *  2. Impact: white-out flash and exposure blowout, an expanding fireball and mushroom column,
 *     a refracting hemispherical shock shell and a ground dust wall racing outward, an ejecta
 *     curtain of hundreds of block chunks, flaming ejecta bombs raining down for half a minute,
 *     violent shaking and a boom delayed by the speed of sound.
 *  3. Leveling: a 60-90 block radius, 30-50 deep crater with a raised rim, a lava lake with a
 *     cooling crust and a melt lining of magma, obsidian, blackstone and basalt. Behind the shock
 *     front the whole loaded map is leveled ring by ring (asteroid/column.ts) under a strict
 *     per-tick edit and time budget (asteroid/rings.ts). Mobs die (ragdolls), survival players
 *     die, creative players are flung.
 *  4. Aftermath: impact winter (dark red-brown sky, dimmed sun, falling ash and embers), fires
 *     and smoke columns, and the "EXTINCTION EVENT" title.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { registerDisaster, BulkEdit, type Disaster, type DisasterContext, type DisasterFx } from './kit';
import { planImpact, lavaLakeRadius, type ImpactPlan } from './asteroid/crater';
import { RingScheduler, shockFront } from './asteroid/rings';
import { processColumn, newColumnInfo, classify, Cls, type ColumnAccess, type ColumnInfo } from './asteroid/column';
import { RockBuilder, rockGeometry } from './asteroid/rock';
import {
  asteroidUniforms, rockMaterial, plasmaMaterial, sheathGeometry, sheathMaterial, trailGeometry, trailMaterial, smokeTrailMaterial,
  glowMaterial, fireballMaterial, shockMaterial, dustWallMaterial, wallGeometry, type AsteroidUniforms,
} from './asteroid/shaders';
import { installSkyHook, addSkySource, removeSkySource, baseLight, type SkySource } from './asteroid/sky';
import { BLOCKS, BLOCK_BY_NAME, T_SOLID } from '../../world/blocks/registry';
import { LivingEntity } from '../../entity/living';

/** Seconds from placement to impact. */
const T_IMPACT = 15;
/** Distance (blocks) the bolide starts from the impact point. */
const START_DIST = 9000;
/** Visual radius of the rock (blocks). */
const ROCK_R = 30;
const TRAIL_LEN = 46;
const SMOKE_LEN = 70;
/** Impact winter: dust builds over WINTER_RISE s, holds until WINTER_HOLD, gone at WINTER_END (s after impact). */
const WINTER_RISE = 20;
const WINTER_HOLD = 170;
const WINTER_END = 250;
/** Ejecta bombs rain from the sky until this time after impact. */
const BOMBS_UNTIL = 34;
const MAX_BOULDERS = 64;
/** Per-tick leveling budget. */
const BUDGET = { edits: 4500, ms: 5, columns: 9000 };
/** Particles this effect may spawn per rendered frame. */
const PARTICLES_PER_FRAME = 280;
const GRAVITY = 24;

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const stateOf = (name: string) => (BLOCK_BY_NAME.get(name)?.id ?? 0) << 4;

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Boulder {
  p: THREE.Vector3;
  v: THREE.Vector3;
  size: number;
  axis: THREE.Vector3;
  ang: number;
  spin: number;
  heat: number;
  age: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Asteroid implements Disaster {
  readonly name = 'asteroid';
  private game: Game;
  private fx: DisasterFx;
  private rand: () => number;
  readonly plan: ImpactPlan;
  /** Impact point (top of the ground block, centre of the column). */
  private I: THREE.Vector3;
  /** Unit vector from the impact toward where the bolide comes from. */
  private dirIn: THREE.Vector3;
  private ticks = 0;
  /** Smoothed visual clock (s since placement). */
  private vt = 0;
  private impacted = false;
  private finished = false;
  private lastCountdown = -1;
  private said = new Set<string>();

  // ---- rendering
  private scene = new THREE.Scene();
  private U: AsteroidUniforms;
  private bolide = new THREE.Group();
  private rockMesh: THREE.Mesh;
  private rockBuilder: RockBuilder;
  private glow: THREE.Mesh;
  private fireball!: THREE.Mesh;
  private shock!: THREE.Mesh;
  private dustWall!: THREE.Mesh;
  private boulderMesh: THREE.InstancedMesh;
  private boulderHeat: THREE.InstancedBufferAttribute;
  private disposables: { dispose(): void }[] = [];
  private prevBolide = new THREE.Vector3();
  private hasPrev = false;
  private sky: SkySource;
  private baseExposure = 1;
  private exposureTouched = false;

  // ---- leveling
  private sched: RingScheduler;
  private bulk: BulkEdit;
  private acc: ColumnAccess;
  private info: ColumnInfo = newColumnInfo();
  private visualCols = 0;
  private blasted = new WeakSet<object>();
  private fires: [number, number, number][] = [];
  private firesSeen = 0;
  private ejectaStates: number[] = [];
  private ejectaLeft = 0;

  // ---- ejecta bombs
  private boulders: Boulder[] = [];
  private bombAcc = 0;
  private explodeQuota = 0;

  // ---- audio and timing
  private rumble: any = null;
  private roar: any = null;
  private boomAt = -1;
  private boomDone = false;
  private shockHitPlayer = false;
  private flashT = 0;
  private particleBudget = 0;
  private lavaR = 0;

  constructor(ctx: DisasterContext) {
    const g = (this.game = ctx.game);
    this.fx = ctx.effects;
    this.rand = mulberry((ctx.x * 73856093) ^ (ctx.z * 19349663) ^ Math.floor(Math.random() * 1e9));
    const w = g.world;
    // ground under the spawner: the first natural ground at or below it
    let G = ctx.y - 1;
    for (let y = Math.min(255, ctx.y + 2); y > 1; y--) {
      const c = classify(w.getBlock(ctx.x, y, ctx.z));
      if (c === Cls.Terrain || c === Cls.Water || c === Cls.Lava || c === Cls.Fixed) { G = y; break; }
    }
    this.plan = planImpact(ctx.x, ctx.z, G, this.loadedRadius(ctx.x, ctx.z), this.rand);
    this.lavaR = lavaLakeRadius(this.plan);
    this.I = new THREE.Vector3(ctx.x + 0.5, G + 1, ctx.z + 0.5);
    // a steep diagonal approach from beyond the impact, off to one side of where the player looks
    // (so the trail is seen at an angle rather than head-on)
    const side = this.rand() < 0.5 ? -1 : 1;
    const az = Math.atan2(ctx.fz, ctx.fx) + side * THREE.MathUtils.degToRad(30 + this.rand() * 25);
    const el = THREE.MathUtils.degToRad(48 + this.rand() * 12);
    this.dirIn = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();

    this.sched = new RingScheduler(this.plan.maxR);
    this.bulk = new BulkEdit(g);
    this.acc = {
      get: (x, y, z) => w.getBlock(x, y, z),
      set: (x, y, z, s) => this.bulk.set(x, y, z, s),
      top: (x, z) => {
        const c = w.getChunk(x >> 4, z >> 4);
        return c ? c.topSection() * 16 - 1 : -1;
      },
      removing: (x, y, z) => {
        if (w.getBlockEntity(x, y, z)) w.setBlockEntity(x, y, z, null);
      },
    };

    // ---- meshes
    const sh = g.renderer.lightUniforms.u_sh;
    this.U = asteroidUniforms(sh);
    this.rockBuilder = new RockBuilder({ detail: 5, seed: Math.floor(this.rand() * 1000), craters: 38 });
    const rockMat = rockMaterial(this.U);
    // a coarse stand-in until the detailed rock is built (a few ms per frame)
    const coarse = rockGeometry({ detail: 2, seed: 3 });
    this.rockMesh = new THREE.Mesh(coarse, rockMat);
    const plasmaGeo = new THREE.IcosahedronGeometry(1, 24);
    const plasma = new THREE.Mesh(plasmaGeo, plasmaMaterial(this.U));
    plasma.scale.set(1.42, 1.18, 1.3);
    const sheathGeo = sheathGeometry(8);
    const sheath = new THREE.Mesh(sheathGeo, sheathMaterial(this.U, 8));
    const trailGeo = trailGeometry(TRAIL_LEN, 1.15, 5.2);
    const trail = new THREE.Mesh(trailGeo, trailMaterial(this.U, TRAIL_LEN));
    const smokeGeo = trailGeometry(SMOKE_LEN, 1.6, 11);
    const smoke = new THREE.Mesh(smokeGeo, smokeTrailMaterial(this.U, SMOKE_LEN));
    smoke.renderOrder = 1;
    this.rockMesh.renderOrder = 2;
    plasma.renderOrder = 3;
    sheath.renderOrder = 4;
    trail.renderOrder = 5;
    for (const m of [this.rockMesh, plasma, sheath, trail, smoke]) m.frustumCulled = false;
    this.bolide.add(smoke, this.rockMesh, plasma, sheath, trail);
    this.scene.add(this.bolide);
    const glowGeo = new THREE.PlaneGeometry(2, 2);
    this.glow = new THREE.Mesh(glowGeo, glowMaterial());
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 6;
    this.scene.add(this.glow);
    // ejecta boulders / flaming bombs
    const bGeo = rockGeometry({ detail: 2, seed: 11, craters: 6, lumps: 0.4, scale: [1.3, 0.85, 1] });
    this.boulderHeat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOULDERS), 1);
    bGeo.setAttribute('a_heat', this.boulderHeat);
    this.boulderMesh = new THREE.InstancedMesh(bGeo, rockMaterial(this.U, true), MAX_BOULDERS);
    this.boulderMesh.count = 0;
    this.boulderMesh.frustumCulled = false;
    this.scene.add(this.boulderMesh);
    this.disposables.push(coarse, rockMat, plasmaGeo, plasma.material as THREE.Material, sheathGeo, sheath.material as THREE.Material, trailGeo,
      trail.material as THREE.Material, smokeGeo, smoke.material as THREE.Material, glowGeo, this.glow.material as THREE.Material, bGeo,
      this.boulderMesh.material as THREE.Material, this.rockBuilder.geometry);
    this.createImpactMeshes();
    const ex = g.renderExtras as any;
    (ex.forward ??= []).push(this.scene);
    // compile every program now (in parallel where supported) so the impact frame does not stall
    try {
      const all: THREE.Object3D[] = [];
      this.scene.traverse((o) => { if (!o.visible) { all.push(o); o.visible = true; } });
      (g.renderer.gl as any).compileAsync?.(this.scene, g.cameraCtl.camera)?.catch?.(() => {});
      for (const o of all) o.visible = false;
    } catch {
      /* compiled lazily on first draw instead */
    }

    // ---- sky, audio
    installSkyHook(g.renderer.atmosphere);
    this.sky = addSkySource();
    this.baseExposure = g.renderer.settings.exposureBias;
    const a = g.audio;
    if (a?.loop) {
      this.rumble = a.loop('loop.wind', { volume: 0.0001, pitch: 0.4 });
      this.roar = a.loop('loop.fire', { volume: 0.0001, pitch: 0.55 });
    }
    // sample what the ejecta will be made of before the crater replaces it
    for (let k = 0; k < 48; k++) {
      const r = Math.sqrt(this.rand()) * this.plan.R * 0.7, ang = this.rand() * Math.PI * 2;
      const x = Math.floor(this.plan.cx + Math.cos(ang) * r), z = Math.floor(this.plan.cz + Math.sin(ang) * r);
      const y = k % 3 === 0 ? this.surface(x, z) : Math.floor(this.plan.G - this.rand() * this.plan.D * 0.8);
      const st = w.getBlock(x, y, z);
      if (st && T_SOLID[st >>> 4] && BLOCKS[st >>> 4].layer === 'opaque') this.ejectaStates.push(st);
    }
    if (!this.ejectaStates.length) this.ejectaStates.push(stateOf('stone'));
    this.say('detect', '[Observatory] Bolide detected on a collision course. Estimated diameter: 10 km.', '#ff9070');
  }

  /** Fireball, shock shell and ground dust wall (hidden until the impact). */
  private createImpactMeshes() {
    const g = this.game;
    const sh = g.renderer.lightUniforms.u_sh;
    const fbGeo = new THREE.IcosahedronGeometry(1, 20);
    this.fireball = new THREE.Mesh(fbGeo, fireballMaterial(sh));
    this.fireball.renderOrder = 8;
    const tu = (g.renderer as any).translucentUniforms ?? {};
    const res = (g.renderer as any).terrainUniforms?.u_resolution ?? { value: new THREE.Vector2(1, 1) };
    const shGeo = new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    this.shock = new THREE.Mesh(shGeo, shockMaterial(tu.u_sceneColor ?? { value: null }, res));
    this.shock.renderOrder = 9;
    const wallGeo = wallGeometry();
    this.dustWall = new THREE.Mesh(wallGeo, dustWallMaterial(sh));
    this.dustWall.renderOrder = 7;
    for (const m of [this.fireball, this.shock, this.dustWall]) {
      m.frustumCulled = false;
      m.visible = false;
      this.scene.add(m);
    }
    this.disposables.push(fbGeo, this.fireball.material as THREE.Material, shGeo, this.shock.material as THREE.Material, wallGeo, this.dustWall.material as THREE.Material);
  }

  // ------------------------------------------------------------------ helpers
  /** Distance from (x,z) to the farthest corner of the loaded chunks. */
  private loadedRadius(x: number, z: number): number {
    let r = 0;
    for (const c of this.game.world.chunks.values()) {
      const dx = Math.max(Math.abs(c.cx * 16 - x), Math.abs(c.cx * 16 + 16 - x));
      const dz = Math.max(Math.abs(c.cz * 16 - z), Math.abs(c.cz * 16 + 16 - z));
      r = Math.max(r, Math.hypot(dx, dz));
    }
    return Math.min(420, Math.ceil(r));
  }

  private surface(x: number, z: number) {
    const w = this.game.world;
    for (let y = Math.min(255, w.getHeight(x, z) + 1); y > 0; y--) if (w.getBlock(x, y, z)) return y;
    return 0;
  }

  private say(key: string, text: string, color = '#ffb080') {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.game.message?.(text, color);
  }

  private get particles(): any {
    return this.game.particles;
  }

  /** Budgeted particle emit (`count` is exact). */
  private emit(type: string, x: number, y: number, z: number, o: any): number {
    const P = this.particles;
    if (!P || this.particleBudget <= 0) return 0;
    const n = P.emit(type, { x, y, z }, { exact: true, ...o, count: Math.min(o.count ?? 1, this.particleBudget) });
    this.particleBudget -= n;
    return n;
  }

  /** One block chunk (instanced cube particle), `life` multiplies its lifetime. */
  private crumb(state: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number) {
    const P = this.particles;
    if (!P?.crumb || this.particleBudget <= 0) return;
    const i = P.crumb(state, x, y, z, vx, vy, vz, size);
    if (i >= 0) {
      this.particleBudget--;
      P.sys.lp.life[i] *= life;
    }
  }

  private cam(): THREE.Vector3 {
    return this.game.cameraCtl.camera.position;
  }

  /** Bolide position at visual time t (straight line at constant speed to the impact). */
  private bolidePos(t: number, out: THREE.Vector3) {
    const d = START_DIST * Math.max(0, 1 - t / T_IMPACT);
    return out.copy(this.I).addScaledVector(this.dirIn, d);
  }

  // ------------------------------------------------------------------ tick (20 TPS)
  tick(_game: Game): boolean {
    if (this.finished) return false;
    this.ticks++;
    const t = this.ticks / 20;
    if (!this.impacted) {
      this.warningTick(t);
      if (t >= T_IMPACT) this.impact();
      return true;
    }
    const tau = t - T_IMPACT;
    this.levelTick(tau);
    this.blastEntities(tau);
    this.timeline(tau);
    if (tau > WINTER_END && this.sched.done && !this.boulders.length) {
      this.say('settle', 'The dust is settling. Life will have to start over.', '#c0b0a0');
      this.finished = true;
      return false;
    }
    return true;
  }

  private warningTick(t: number) {
    const left = Math.max(0, Math.ceil(T_IMPACT - t));
    if (left !== this.lastCountdown && left > 0) {
      this.lastCountdown = left;
      this.game.events.emit('title', { title: 'IMPACT IMMINENT', subtitle: `Impact in ${left} s`, time: 1.4 });
    }
    if (t >= 4) this.say('entry', '[Observatory] Atmospheric entry confirmed. Velocity 20 km/s.', '#ff9070');
    if (t >= 8) this.say('lock', `[Observatory] Impact point ${this.plan.cx}, ${this.plan.G}, ${this.plan.cz}. Take cover.`, '#ff7050');
    if (t >= 12.5) this.say('brace', '[Observatory] Brace for impact.', '#ff5040');
  }

  private timeline(tau: number) {
    if (tau >= 2) this.say('quake', `[Seismograph] Impact event recorded: magnitude 11. Crater ${2 * this.plan.R} blocks wide.`, '#ffb080');
    if (tau >= 9 && !this.said.has('title')) {
      this.said.add('title');
      this.game.events.emit('title', { title: 'EXTINCTION EVENT', subtitle: 'The sky goes dark', time: 7 });
    }
    if (tau >= 22) this.say('winter', 'Firestorms rage. Dust and ash are blotting out the sun.', '#c09080');
  }

  // ------------------------------------------------------------------ impact
  private impact() {
    this.impacted = true;
    const g = this.game, I = this.I, P = this.particles;
    this.bolide.visible = false;
    this.glow.visible = false;
    this.sky.light = 0;
    this.fx.flash(1, 0xfff6ec);
    this.fx.addShake(1.6);
    P?.flash?.(I.x, I.y + 8, I.z, 0xfff0d8, 9e6, 7, 700);
    this.fireball!.visible = true;
    this.shock!.visible = true;
    this.dustWall!.visible = true;
    // ejecta: block chunks (particles, spawned over the next frames) and physical debris
    this.ejectaLeft = 900;
    const deb = (g as any).explosions?.debris;
    if (deb?.spawn) {
      // few physical fragments: every rigid body makes later block edits around it costlier
      for (let k = 0; k < 10; k++) {
        const st = this.ejectaStates[k % this.ejectaStates.length];
        const a = this.rand() * Math.PI * 2, r = 2 + this.rand() * 10;
        deb.spawn(st, Math.floor(I.x + Math.cos(a) * r), Math.floor(I.y - 1), Math.floor(I.z + Math.sin(a) * r), new THREE.Vector3(I.x, I.y - 6, I.z), 34 + this.rand() * 20, 2, this.rand);
      }
    }
    for (let k = 0; k < 26; k++) this.launchBoulder(true);
    // the boom arrives at the speed of sound
    const d = g.player ? g.player.eyePos.distanceTo(I) : 0;
    this.boomAt = d / 343;
    g.chunks?.markUrgent?.(Math.floor(I.x), Math.floor(I.y), Math.floor(I.z));
  }

  // ------------------------------------------------------------------ leveling
  private levelTick(tau: number) {
    if (this.sched.done) return;
    const P = this.plan;
    const front = shockFront(tau, P.R * 1.15);
    const cam = this.cam();
    this.visualCols = 0;
    this.bulk.begin();
    try {
      this.sched.run(front, BUDGET, (dx, dz) => {
        const x = P.cx + dx, z = P.cz + dz;
        const e = processColumn(this.acc, P, x, z, this.info);
        if (e > 0) this.columnFx(x, z, cam);
        return e;
      });
    } finally {
      this.bulk.end();
    }
  }

  /** Visual crumbs / steam / fire bookkeeping for a processed column (capped per tick). */
  private columnFx(x: number, z: number, cam: THREE.Vector3) {
    const inf = this.info;
    if (inf.fireY >= 0) {
      // reservoir sample of fires for the smoke columns
      this.firesSeen++;
      if (this.fires.length < 48) this.fires.push([x, inf.fireY, z]);
      else if (this.rand() < 48 / this.firesSeen) this.fires[Math.floor(this.rand() * 48)] = [x, inf.fireY, z];
    }
    if (this.visualCols >= 26) return;
    const dx = x + 0.5 - cam.x, dz = z + 0.5 - cam.z;
    if (dx * dx + dz * dz > 170 * 170) return;
    const ox = x - this.plan.cx, oz = z - this.plan.cz;
    const ol = Math.hypot(ox, oz) || 1;
    const ux = ox / ol, uz = oz / ol;
    if (inf.removed > 0 && inf.removedState && this.rand() < 0.5) {
      this.visualCols++;
      const y = inf.ground + 1 + this.rand() * Math.min(6, inf.removed);
      for (let k = 0; k < 2; k++) {
        const sp = 14 + this.rand() * 18;
        this.crumb(inf.removedState, x + this.rand(), y, z + this.rand(), ux * sp + (this.rand() - 0.5) * 6, 5 + this.rand() * 9, uz * sp + (this.rand() - 0.5) * 6, 3 + this.rand() * 5, 2.2);
      }
      this.emit('dust', x + 0.5, y, z + 0.5, { count: 1, size: 5, vel: [ux * 10, 1.5, uz * 10], spread: 0.6, state: inf.removedState });
    } else if (inf.evaporated > 0 && this.rand() < 0.35) {
      this.visualCols++;
      this.emit('steam', x + 0.5, inf.ground + 1, z + 0.5, { count: 1, size: 6, vel: [ux * 4, 4, uz * 4], spread: 0.5 });
    }
  }

  // ------------------------------------------------------------------ entities
  private blastEntities(tau: number) {
    const g = this.game, I = this.I;
    const front = shockFront(tau, this.plan.R * 1.15);
    const maxR = this.plan.maxR;
    for (const e of g.entities.list as any[]) {
      if (e.removed || this.blasted.has(e)) continue;
      const dx = e.pos.x - I.x, dz = e.pos.z - I.z;
      const d = Math.hypot(dx, dz);
      if (d > front) continue;
      this.blasted.add(e);
      const k = Math.max(0.15, 1 - d / maxR);
      const dir = new THREE.Vector3(dx, 0, dz);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      dir.normalize();
      dir.y = 0.55 + 0.3 * k;
      dir.normalize();
      const fling = 16 + 42 * k;
      if (e === g.player) {
        const p = g.player;
        if (p.spectator) continue;
        p.vel.addScaledVector(dir, fling);
        if (p.creative) {
          p.flying = false;
          this.fx.addShake(2.5);
        } else {
          p.hurt({ type: 'explosion', explosion: true, bypassArmor: true, dir, impulse: 40 * k, point: I.clone() }, 10000);
        }
        continue;
      }
      if (e instanceof LivingEntity) {
        e.vel.addScaledVector(dir, fling);
        e.hurt({ type: 'explosion', explosion: true, bypassArmor: true, dir, impulse: 40 * k, point: I.clone(), weapon: 'explosion' }, 10000);
      } else if (d < this.plan.R) {
        e.remove?.();
      } else if (e.vel) {
        e.vel.addScaledVector(dir, fling * 0.6);
      }
    }
  }

  // ------------------------------------------------------------------ ejecta bombs
  private launchBoulder(fromCrater: boolean) {
    if (this.boulders.length >= MAX_BOULDERS) return;
    const P = this.plan, r = this.rand;
    let tx: number, tz: number;
    const pl = this.game.player?.pos;
    if (!fromCrater && pl && r() < 0.55) {
      // keep the show where the player can see it
      const a = r() * Math.PI * 2, d = 12 + r() * 90;
      tx = pl.x + Math.cos(a) * d;
      tz = pl.z + Math.sin(a) * d;
    } else {
      const a = r() * Math.PI * 2, d = P.R * 1.2 + r() * Math.max(10, P.maxR * 0.95 - P.R * 1.2);
      tx = P.cx + Math.cos(a) * d;
      tz = P.cz + Math.sin(a) * d;
    }
    const ty = this.surface(Math.floor(tx), Math.floor(tz)) + 1;
    const size = 0.6 + Math.pow(r(), 2) * 2.2;
    let p: THREE.Vector3, T: number;
    if (fromCrater) {
      const a = r() * Math.PI * 2, rr = r() * P.R * 0.5;
      p = new THREE.Vector3(P.cx + Math.cos(a) * rr, P.G + 4, P.cz + Math.sin(a) * rr);
      T = 3.5 + Math.hypot(tx - p.x, tz - p.z) / 45 + r() * 1.5;
    } else {
      // re-entering ejecta: from high above, arriving at a slant
      const a = r() * Math.PI * 2;
      p = new THREE.Vector3(tx + Math.cos(a) * 140, Math.min(250, ty + 160 + r() * 60), tz + Math.sin(a) * 140);
      T = 2.8 + r() * 1.4;
    }
    const v = new THREE.Vector3((tx - p.x) / T, (ty - p.y + 0.5 * GRAVITY * T * T) / T, (tz - p.z) / T);
    const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    this.boulders.push({ p, v, size, axis, ang: 0, spin: 1 + r() * 4, heat: fromCrater && r() < 0.35 ? 0.2 : 1, age: 0 });
  }

  private updateBoulders(dt: number, cam: THREE.Vector3) {
    const w = this.game.world;
    const list = this.boulders;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.age += dt;
      b.v.y -= GRAVITY * dt;
      b.p.addScaledVector(b.v, dt);
      b.ang += b.spin * dt;
      const bx = Math.floor(b.p.x), by = Math.floor(b.p.y - b.size * 0.4), bz = Math.floor(b.p.z);
      if (!w.isLoaded(bx, bz) || b.p.y < 1 || b.age > 25) { list.splice(i, 1); continue; }
      const st = w.getBlock(bx, by, bz);
      if (st && (T_SOLID[st >>> 4] || BLOCKS[st >>> 4].liquid)) {
        this.landBoulder(b, bx, by, bz, cam);
        list.splice(i, 1);
        continue;
      }
      // trail
      if (b.p.distanceToSquared(cam) < 320 * 320) {
        if (b.heat > 0.5) {
          this.emit('explosion_fire', b.p.x, b.p.y, b.p.z, { count: 1, size: 0.55 * b.size, vel: [b.v.x * 0.1, 1, b.v.z * 0.1], spread: 0.3 * b.size, life: 0.7 });
          if ((this.ticks + i) % 2 === 0) this.emit('large_smoke', b.p.x, b.p.y, b.p.z, { count: 1, size: 1.6 * b.size, life: 1.8, spread: 0.4 });
          if (this.rand() < 0.3) this.emit('ember', b.p.x, b.p.y, b.p.z, { count: 2, speed: 4, spread: 0.5 });
        } else if ((this.ticks + i) % 3 === 0) this.emit('dust', b.p.x, b.p.y, b.p.z, { count: 1, size: 2 * b.size, color: 0x7a6a58 });
      }
    }
    let n = 0;
    for (const b of list) {
      if (n >= MAX_BOULDERS) break;
      _q.setFromAxisAngle(b.axis, b.ang);
      _m.compose(b.p, _q, _s.setScalar(b.size));
      this.boulderMesh.setMatrixAt(n, _m);
      this.boulderHeat.setX(n, b.heat);
      n++;
    }
    this.boulderMesh.count = n;
    this.boulderMesh.instanceMatrix.needsUpdate = true;
    this.boulderHeat.needsUpdate = true;
  }

  private landBoulder(b: Boulder, bx: number, by: number, bz: number, cam: THREE.Vector3) {
    const g = this.game;
    const near = b.p.distanceToSquared(cam) < 260 * 260;
    const ex = (g as any).explosions;
    if (b.heat > 0.5 && ex?.explode && this.explodeQuota > 0 && this.rand() < 0.6) {
      // a real (small) explosion: crater, fire, debris, damage, sound
      this.explodeQuota--;
      ex.explode(new THREE.Vector3(b.p.x, by + 1, b.p.z), 2.2 + b.size * 1.1, { fire: true, debris: near });
      return;
    }
    if (near) {
      this.emit('explosion', b.p.x, by + 1, b.p.z, { power: 1.5 + b.size });
      g.audio?.play?.('random.explode', { pos: { x: b.p.x, y: by + 1, z: b.p.z }, volume: 3, pitch: 0.6 + this.rand() * 0.3 });
    }
    // the bomb itself: a glowing magma lump (or plain rock) with fire around it
    const w = g.world;
    this.bulk.begin();
    if (w.getBlock(bx, by + 1, bz) === 0) this.bulk.set(bx, by + 1, bz, stateOf(b.heat > 0.5 ? 'magma_block' : 'blackstone'));
    if (b.heat > 0.5) {
      const fire = stateOf('fire');
      for (let k = 0; k < 3; k++) {
        const fx = bx + Math.floor(this.rand() * 5) - 2, fz = bz + Math.floor(this.rand() * 5) - 2;
        const fy = this.surface(fx, fz);
        if (fy > 0 && w.getBlock(fx, fy + 1, fz) === 0 && T_SOLID[w.getBlock(fx, fy, fz) >>> 4]) this.bulk.set(fx, fy + 1, fz, fire);
      }
    }
    this.bulk.end();
  }

  // ------------------------------------------------------------------ per frame
  update(game: Game, dt: number) {
    if (this.finished) return;
    // the visual clock follows the tick clock smoothly (and stops while the game is paused)
    const tickTime = this.ticks / 20;
    this.vt = Math.min(tickTime + 0.05, Math.max(tickTime - 0.1, this.vt + dt));
    this.particleBudget = PARTICLES_PER_FRAME;
    this.explodeQuota = 1;
    const cam = this.cam();
    const U = this.U;
    U.u_time.value = this.vt;
    U.u_sunDir.value.copy(baseLight.dir);
    U.u_sunCol.value.copy(baseLight.color);
    if (!this.rockBuilder.done && this.rockBuilder.step(3)) this.rockMesh.geometry = this.rockBuilder.geometry;
    if (!this.impacted) this.updateApproach(game, dt, cam);
    else this.updateAftermath(game, dt, cam, this.vt - T_IMPACT);
  }

  private updateApproach(game: Game, dt: number, cam: THREE.Vector3) {
    const t = Math.min(this.vt, T_IMPACT);
    const f = t / T_IMPACT;
    const pos = this.bolidePos(t, _v);
    const dist = pos.distanceTo(cam);
    // beyond the far plane: draw it closer and smaller (same angular size)
    const far = game.cameraCtl.camera.far * 0.8;
    const k = dist > far ? far / dist : 1;
    const g = this.bolide;
    g.position.copy(cam).lerp(pos, k);
    g.scale.setScalar(ROCK_R * k);
    g.quaternion.setFromUnitVectors(UP, this.dirIn);
    this.rockMesh.rotation.x += dt * 0.11;
    this.rockMesh.rotation.y += dt * 0.07;
    this.U.u_bump.value = ROCK_R * k * 0.03;
    this.U.u_travel.value.copy(this.dirIn).negate();
    this.U.u_heat.value = 0.35 + 0.65 * smooth(0, 1, f);
    this.U.u_plasma.value = 1 + 2.2 * f * f;
    // flare: a point of light while far away, fading to a soft halo as the rock resolves
    const gu = (this.glow.material as THREE.RawShaderMaterial).uniforms;
    const point = smooth(0.012, 0.0025, ROCK_R / dist);
    gu.u_center.value.copy(g.position);
    gu.u_size.value = Math.max(ROCK_R * k * 2.6, dist * k * 0.014);
    gu.u_intensity.value = 1.5 + 30 * point;
    // second key light, sky glow, rumble
    const near = smooth(4000, 250, dist);
    this.sky.pos.copy(pos);
    this.sky.light = Math.min(110, 3.2e7 / (dist * dist));
    this.sky.glow = near * 0.7;
    this.fx.requestTint(1, 0.42, 0.12, 0.1 * near);
    this.fx.addShake(0.04 + 0.9 * Math.pow(f, 5));
    this.rumble?.setVolume(0.15 + 0.85 * f * f);
    this.roar?.setVolume(0.6 * Math.pow(f, 3));
    if (f > 0.7 && !this.said.has('boom1')) { this.said.add('boom1'); game.audio?.play?.('weather.thunder.far', { volume: 0.8, pitch: 0.6 }); }
    if (f > 0.86 && !this.said.has('boom2')) { this.said.add('boom2'); game.audio?.play?.('weather.thunder.far', { volume: 1, pitch: 0.45 }); }
    // the ground lights up under it in the last seconds
    const L = pos.distanceTo(this.I);
    if (L < 1100) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 0.08;
        this.particles?.flash?.(pos.x, pos.y, pos.z, 0xffc890, 60 * L * L * (1.2 - L / 1100), 0.12, L * 1.7 + 60);
      }
    }
    // particle trail: plasma puffs and a lingering smoke trail across the sky
    if (this.hasPrev && dist < 950) {
      const seg = _v2.subVectors(pos, this.prevBolide);
      const len = seg.length();
      const n = Math.min(10, Math.ceil(len / 9));
      for (let i = 0; i < n; i++) {
        const q = _v3.copy(this.prevBolide).addScaledVector(seg, (i + this.rand()) / n).addScaledVector(this.dirIn, ROCK_R * 1.2);
        const sp = ROCK_R * 0.7;
        this.emit('campfire_smoke', q.x, q.y, q.z, { count: 1, size: 18 + this.rand() * 12, life: 2, spread: sp, color: 0x4a4038 });
        if (i % 2 === 0) this.emit('explosion_fire', q.x, q.y, q.z, { count: 1, size: 9 + this.rand() * 6, spread: sp * 0.6, life: 1.4 });
        if (this.rand() < 0.4) this.emit('ember', q.x, q.y, q.z, { count: 3, speed: 12, spread: sp });
      }
    }
    this.prevBolide.copy(pos);
    this.hasPrev = true;
  }

  private updateAftermath(game: Game, dt: number, cam: THREE.Vector3, tau: number) {
    const P = this.plan, I = this.I, gr = game.renderer;
    // ---- white-out and exposure blowout
    if (tau < 0.18) this.fx.requestTint(1, 0.98, 0.95, 1);
    else if (tau < 4) this.fx.requestTint(1, 0.9, 0.78, Math.exp(-(tau - 0.18) * 1.5));
    if (tau < 5) {
      gr.settings.exposureBias = this.baseExposure * (1 + 5 * Math.exp(-tau * 1.2));
      this.exposureTouched = true;
    } else if (this.exposureTouched) {
      gr.settings.exposureBias = this.baseExposure;
      this.exposureTouched = false;
    }
    // ---- boom at the speed of sound, shaking
    if (!this.boomDone && tau >= this.boomAt) {
      this.boomDone = true;
      const a = game.audio;
      a?.play?.('random.explode', { volume: 1, pitch: 0.32 });
      a?.play?.('random.explode', { volume: 1, pitch: 0.22 });
      a?.play?.('weather.thunder.near', { volume: 1, pitch: 0.5 });
      a?.thunder?.(40);
      this.fx.addShake(3);
    }
    const front = shockFront(tau, P.R * 1.15);
    const pd = game.player ? Math.hypot(game.player.pos.x - I.x, game.player.pos.z - I.z) : 1e9;
    if (!this.shockHitPlayer && front >= pd) {
      this.shockHitPlayer = true;
      this.fx.addShake(3);
      this.fx.flash(0.35, 0xffd8b0);
      game.audio?.play?.('random.explode', { volume: 1, pitch: 0.45 });
    }
    if (tau < 25) this.fx.addShake((tau < 3 ? 1.4 : 0.5) * Math.exp(-tau / 6) + 0.12);
    this.rumble?.setVolume(Math.max(0.25, Math.exp(-tau / 12)));
    this.roar?.setVolume(0.35 * Math.exp(-tau / 30) + 0.12);

    // ---- fireball and mushroom column
    const fb = this.fireball;
    if (fb.visible) {
      const fu = (fb.material as THREE.RawShaderMaterial).uniforms;
      const rf = P.R * 0.95 * (1 - Math.exp(-tau / 0.7)) + 4;
      const rise = 8 * Math.pow(tau, 1.1);
      fb.position.set(I.x, I.y - 2 + rise, I.z);
      fb.scale.set(rf, rf * (0.85 + 0.25 * smooth(2, 10, tau)), rf);
      fu.u_time.value = tau;
      fu.u_temp.value = 0.25 + 0.8 * Math.exp(-tau / 3);
      fu.u_glow.value = 6 + 110 * Math.exp(-tau / 2.2);
      fu.u_alpha.value = 1 - smooth(14, 26, tau);
      fu.u_flatten.value = -0.12 - smooth(1, 8, tau) * 0.8;
      fu.u_sunCol.value.copy(baseLight.color);
      if (tau > 26) fb.visible = false;
      // fireball light on the landscape
      this.flashT -= dt;
      if (tau < 14 && this.flashT <= 0) {
        this.flashT = 0.25;
        this.particles?.flash?.(I.x, I.y + rise + rf * 0.4, I.z, 0xff9a50, 4e6 * Math.exp(-tau / 3.2) + 2e5, 0.4, 520);
      }
      if (I.distanceToSquared(cam) < 600 * 600) {
        const top = I.y + rise;
        if (tau < 22) this.emit('campfire_smoke', I.x, (I.y + top) * 0.5, I.z, { count: 2, size: 14 + rf * 0.15, spread: [rf * 0.25, (top - I.y) * 0.5 + 1, rf * 0.25], vel: [0, 9, 0], life: 1.6, color: 0x3a302a });
        if (tau < 8) this.emit('explosion_fire', I.x, top, I.z, { count: 3, size: 6 + rf * 0.08, spread: rf * 0.5, vel: [0, 12, 0] });
      }
    }
    // ---- shock shell and ground dust wall
    const sk = this.shock;
    if (sk.visible) {
      const rs = 18 + 175 * Math.pow(tau, 0.72);
      sk.position.set(I.x, I.y - 3, I.z);
      sk.scale.set(rs, rs * 0.8, rs);
      const su = (sk.material as THREE.RawShaderMaterial).uniforms;
      su.u_time.value = tau;
      su.u_fade.value = Math.exp(-tau / 2.6) * (1 - smooth(P.maxR * 1.2, P.maxR * 1.8, rs));
      su.u_glowI.value = 2 + 30 * Math.exp(-tau / 0.8);
      if (su.u_fade.value < 0.01) sk.visible = false;
    }
    const wall = this.dustWall;
    if (wall.visible) {
      const wu = (wall.material as THREE.RawShaderMaterial).uniforms;
      const h = 16 + front * 0.1;
      wall.position.set(I.x, P.G - 5, I.z);
      wall.scale.set(front, h, front);
      wu.u_time.value = tau;
      wu.u_fade.value = (1 - smooth(P.maxR * 0.9, P.maxR * 1.25, front)) * smooth(0, 0.2, tau);
      wu.u_hot.value = 30 * Math.exp(-tau / 1.2);
      wu.u_sunCol.value.copy(baseLight.color);
      if (wu.u_fade.value < 0.005 && tau > 1) wall.visible = false;
      // dust boiling off the front where it meets the ground
      for (let i = 0; i < 10; i++) {
        const a = this.rand() * Math.PI * 2;
        const x = I.x + Math.cos(a) * front, z = I.z + Math.sin(a) * front;
        const ddx = x - cam.x, ddz = z - cam.z;
        if (ddx * ddx + ddz * ddz > 240 * 240) continue;
        const y = game.world.getHeight(Math.floor(x), Math.floor(z)) + 1;
        this.emit('large_smoke', x, y, z, { count: 1, size: 5 + this.rand() * 4, vel: [Math.cos(a) * 22, 3, Math.sin(a) * 22], spread: 2, color: 0x8a7a66, life: 0.9 });
        if (tau < 3) this.emit('explosion_fire', x, y + 1, z, { count: 1, size: 3, vel: [Math.cos(a) * 18, 4, Math.sin(a) * 18], spread: 1.5 });
      }
    }
    // ---- ejecta curtain: block chunks thrown out in an inverted cone
    if (this.ejectaLeft > 0 && this.particles?.crumb) {
      const n = Math.min(this.ejectaLeft, 110);
      this.ejectaLeft -= n;
      for (let k = 0; k < n; k++) {
        const a = this.rand() * Math.PI * 2;
        const cone = THREE.MathUtils.degToRad(25 + this.rand() * 30);
        const sp = 28 + this.rand() * 48;
        const r = this.rand() * P.R * 0.35;
        const st = this.ejectaStates[Math.floor(this.rand() * this.ejectaStates.length)];
        this.crumb(st, I.x + Math.cos(a) * r, I.y + 1 + this.rand() * 6, I.z + Math.sin(a) * r,
          Math.cos(a) * Math.sin(cone) * sp, Math.cos(cone) * sp, Math.sin(a) * Math.sin(cone) * sp, 4 + this.rand() * 10, 3.5 + this.rand() * 2);
      }
      for (let k = 0; k < 6; k++) {
        const a = this.rand() * Math.PI * 2;
        this.emit('explosion_smoke', I.x + Math.cos(a) * P.R * 0.3, I.y + 4, I.z + Math.sin(a) * P.R * 0.3, { count: 1, size: 9, vel: [Math.cos(a) * 30, 34, Math.sin(a) * 30], life: 1.5 });
      }
    }
    // ---- bombs raining down
    if (tau > 2.5 && tau < BOMBS_UNTIL) {
      this.bombAcc += dt * 3.2 * (1 - tau / (BOMBS_UNTIL + 4));
      while (this.bombAcc >= 1) { this.bombAcc--; this.launchBoulder(false); }
    }
    this.updateBoulders(dt, cam);

    // ---- impact winter
    const dust = smooth(0, WINTER_RISE, tau) * (1 - smooth(WINTER_HOLD, WINTER_END, tau));
    this.sky.dust = dust;
    this.sky.glow = 0.35 * Math.exp(-tau / 10);
    if (dust > 0.01) this.fx.requestTint(0.3, 0.13, 0.05, 0.3 * dust);
    if (dust > 0.05) {
      // falling ash and drifting embers around the camera
      this.emit('ash', cam.x, cam.y + 8, cam.z, { count: Math.ceil(5 * dust), spread: [22, 7, 22], vel: [0.6, -1.2, 0.3] });
      if (this.rand() < 0.6 * dust) this.emit('crimson_spore', cam.x, cam.y + 6, cam.z, { count: 1, spread: [18, 5, 18], color: 0xff7a20, vel: [0.5, -0.6, 0.2] });
      if (this.rand() < 0.3 * dust) this.emit('ember', cam.x, cam.y + 2, cam.z, { count: 1, spread: [14, 4, 14] });
    }
    // fires: smoke columns
    if (this.fires.length && this.ticks % 3 === 0 && tau < WINTER_END) {
      for (let k = 0; k < 3; k++) {
        const f = this.fires[Math.floor(this.rand() * this.fires.length)];
        const ddx = f[0] - cam.x, ddz = f[2] - cam.z;
        if (ddx * ddx + ddz * ddz > 200 * 200) continue;
        this.emit('campfire_smoke', f[0] + 0.5, f[1] + 0.6, f[2] + 0.5, { count: 1, size: 2.4, spread: 0.4, color: 0x2a2624 });
        if (this.rand() < 0.4) this.emit('flame', f[0] + 0.5, f[1] + 0.3, f[2] + 0.5, { count: 2, size: 2.5, spread: 0.4 });
      }
    }
    // the lava lake steams and spits
    if (this.sched.ring > P.R && this.lavaR > 2 && this.rand() < 0.5 && I.distanceToSquared(cam) < 400 * 400) {
      const a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * this.lavaR * 0.9;
      const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
      this.emit('large_smoke', x, P.lavaY + 1.5, z, { count: 1, size: 4, vel: [0, 3, 0], color: 0x5a4a40 });
      if (this.rand() < 0.5) this.emit('lava_pop', x, P.lavaY + 1.1, z, { count: 4, speed: 6, vel: [0, 7, 0] });
    }
  }

  dispose(game: Game) {
    const ex = game.renderExtras as any;
    if (ex.forward) {
      const i = ex.forward.indexOf(this.scene);
      if (i >= 0) ex.forward.splice(i, 1);
    }
    this.scene.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    removeSkySource(this.sky);
    if (this.exposureTouched) game.renderer.settings.exposureBias = this.baseExposure;
    this.exposureTouched = false;
    this.rumble?.stop?.(2);
    this.roar?.stop?.(2);
    this.rumble = this.roar = null;
    this.boulders.length = 0;
    this.finished = true;
  }

  /** Debug / test hook: jump ahead `seconds` (runs ticks and frames synchronously). */
  skip(seconds: number) {
    const g = this.game;
    for (let i = 0; i < seconds * 20 && !this.finished; i++) {
      this.tick(g);
      this.update(g, 0.05);
    }
  }
}

registerDisaster('asteroid', (ctx) => new Asteroid(ctx));
