// ProjectileSystem: runtime for every projectile (player spells and enemy attacks share it).
// Behaviour is entirely driven by ProjectileDef data + the ShotState modifiers from the casting engine.
import * as THREE from 'three';
import { GRAVITY } from '../config';
import { FastRng } from '../core/rng';
import { VoxelWorld, RAY_SOLID, RayHit } from '../world/world';
import { AIR, KIND, Kind, matId, FIRE, UNLOADED, MATERIALS } from '../world/materials';
import { MaterialSimulation } from '../sim/simulation';
import { TerrainDestructionSystem } from '../sim/destruction';
import { ParticleSystem } from '../render/particles';
import { hexToRgb } from '../render/materialTextures';
import { DamageSystem } from './damage';
import { Creature, DamageType } from './creature';
import type { ProjectileDef, Shot, ShotState, DamageSpec } from '../magic/types';
import { formationAngles } from '../magic/shotState';

export const PROJECTILE_DEFS: Record<string, ProjectileDef> = {};
export function registerProjectiles(defs: Record<string, ProjectileDef>): void {
  Object.assign(PROJECTILES_INTERNAL, defs);
}
const PROJECTILES_INTERNAL = PROJECTILE_DEFS;

/** Projectile defs carry Noita gravity (px/s^2 x0.5 = 175 for the player); rescale to our world gravity. */
const PROJ_GRAVITY_SCALE = GRAVITY / 175;
const SPEED_CAP = 520; // ~Noita's 1000 px/s terminal velocity (x0.5) with headroom
const MAX_PROJECTILES = 700;

export interface Projectile {
  def: ProjectileDef;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number;
  life: number;
  bounces: number;
  owner: Creature | null;
  grace: number;
  dmg: DamageSpec;
  crit: number;
  explosion: { radius: number; durability: number; rayEnergy: number; fire: boolean; powderEdge: boolean; damage: number } | null;
  extra: Set<string>;
  trailMat: number;
  trailChance: number;
  homing: number;
  pierceCreatures: boolean;
  pierceTerrain: boolean;
  gravity: number;
  knockback: number;
  trigger: { kind: 'hit' | 'timer' | 'death'; timerFrames: number; payload: Shot } | null;
  triggerFired: boolean;
  hitSet: Set<number>;
  alive: boolean;
  color: [number, number, number];
  size: number;
  glow: boolean;
  lightColor: [number, number, number] | null;
  lightRadius: number;
  /** spawn point for circle/sea projectiles */
  ox: number; oy: number; oz: number;
  lastHitX: number; lastHitY: number; lastHitZ: number;
  lastFreeX: number; lastFreeY: number; lastFreeZ: number;
  hostileTo: (c: Creature) => boolean;
}

export interface ProjectileEvents {
  sound?: (name: string, x: number, y: number, z: number, vol?: number) => void;
  explosionFx?: (x: number, y: number, z: number, radius: number, fire: boolean) => void;
  teleport?: (c: Creature, x: number, y: number, z: number) => void;
  lightning?: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => void;
  electrocute?: (cells: number[], source: Creature | null, damage: number) => void;
}

const tmpHit: RayHit = { hit: false, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, px: 0, py: 0, pz: 0 };
const UP = new THREE.Vector3(0, 1, 0);

export class ProjectileSystem {
  readonly list: Projectile[] = [];
  rng = new FastRng(0x9e3779b9);
  events: ProjectileEvents = {};
  /** Extra modifiers for projectiles cast by a given owner (player perks). */
  ownerMods: (owner: Creature | null) => { crit: number; dmgMult: number; homing: number } | null = () => null;
  // rendering of projectile cores
  readonly glowPoints: THREE.Points;
  readonly solidPoints: THREE.Points;
  private gPos = new Float32Array(MAX_PROJECTILES * 3);
  private gCol = new Float32Array(MAX_PROJECTILES * 4);
  private gSize = new Float32Array(MAX_PROJECTILES);
  private sPos = new Float32Array(MAX_PROJECTILES * 3);
  private sCol = new Float32Array(MAX_PROJECTILES * 4);
  private sSize = new Float32Array(MAX_PROJECTILES);

  constructor(
    private world: VoxelWorld,
    private sim: MaterialSimulation,
    private destruction: TerrainDestructionSystem,
    private damage: DamageSystem,
    private particles: ParticleSystem,
    pointScale: { value: number },
  ) {
    const mk = (pos: Float32Array, col: Float32Array, size: Float32Array, additive: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      const m = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { uPointScale: pointScale },
        vertexShader: `in vec4 pcolor; in float psize; uniform float uPointScale; out vec4 vCol;
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPointScale * psize / max(-mv.z, 0.3), 2.0, 40.0); vCol = pcolor; }`,
        fragmentShader: `precision highp float; in vec4 vCol; out vec4 outColor;
          void main(){ vec2 d = gl_PointCoord - 0.5; float r = max(abs(d.x), abs(d.y)); if (r > 0.5) discard;
          float core = r < 0.25 ? 1.0 : 0.55; outColor = vec4(vCol.rgb * ${additive ? 'core' : '1.0'}, vCol.a); }`,
        transparent: true,
        depthWrite: !additive,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = additive ? 8 : 4;
      return p;
    };
    this.glowPoints = mk(this.gPos, this.gCol, this.gSize, true);
    this.solidPoints = mk(this.sPos, this.sCol, this.sSize, false);
  }

  clear(): void {
    this.list.length = 0;
  }

  /**
   * Fire a shot (a cast's projectile list sharing one ShotState).
   * spreadDeg: wand spread + shot spread. Formation patterns distribute projectiles evenly.
   */
  fireShot(shot: Shot, x: number, y: number, z: number, dir: THREE.Vector3, owner: Creature | null, wandSpread = 0, wandSpeed = 1, hostileTo?: (c: Creature) => boolean): number {
    const st = shot.state;
    const n = shot.projectiles.length;
    if (n === 0) return 0;
    const spread = Math.max(0, wandSpread + st.spread);
    const pattern = st.patternDegrees;
    const right = new THREE.Vector3().crossVectors(dir, UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    let spawned = 0;
    const angles = formationAngles(pattern, n);
    for (let i = 0; i < n; i++) {
      const ps = shot.projectiles[i];
      const def = PROJECTILES_INTERNAL[ps.projectile];
      if (!def) continue;
      const d = dir.clone();
      if (pattern > 0 && n > 1) d.applyAxisAngle(up, THREE.MathUtils.degToRad(angles[i]));
      if (spread > 0) {
        const a = THREE.MathUtils.degToRad(spread) * Math.sqrt(this.rng.f());
        const phi = this.rng.f() * Math.PI * 2;
        const r = right.clone().multiplyScalar(Math.cos(phi)).addScaledVector(up, Math.sin(phi));
        d.applyAxisAngle(r, a);
      }
      d.normalize();
      this.spawn(def, st, x, y, z, d, owner, wandSpeed, ps.trigger ?? null, hostileTo);
      spawned++;
    }
    return spawned;
  }

  spawn(def: ProjectileDef, st: ShotState, x: number, y: number, z: number, dir: THREE.Vector3, owner: Creature | null, wandSpeed: number, trigger: Projectile['trigger'] | { kind: 'hit' | 'timer' | 'death'; timerFrames?: number; payload: Shot } | null, hostileTo?: (c: Creature) => boolean): Projectile | null {
    if (this.list.length >= MAX_PROJECTILES) return null;
    const rng = this.rng;
    let speed = def.speed[0] + (def.speed[1] - def.speed[0]) * rng.f();
    speed *= st.speedMult * wandSpeed;
    if (def.special !== 'lightning') speed = Math.min(speed, SPEED_CAP);
    if (def.stationary) speed = 0;
    let life = def.lifetime[0] < 0 ? 100000 : Math.round(def.lifetime[0] + (def.lifetime[1] - def.lifetime[0]) * rng.f());
    life = Math.max(1, life + st.lifetimeAdd);
    const extra = new Set<string>(st.extra);
    const dmg: DamageSpec = {
      projectile: (def.damage.projectile ?? 0) + st.damageProjectile,
      explosion: (def.damage.explosion ?? 0) + st.damageExplosion,
      fire: (def.damage.fire ?? 0) + st.damageFire,
      electric: (def.damage.electric ?? 0) + st.damageElectric,
      ice: (def.damage.ice ?? 0) + st.damageIce,
      slice: (def.damage.slice ?? 0) + st.damageSlice,
      drill: def.damage.drill ?? 0,
      healing: (def.damage.healing ?? 0) + st.damageHealing,
    };
    const om = this.ownerMods(owner);
    if (om && om.dmgMult !== 1) {
      for (const k of ['projectile', 'explosion', 'fire', 'electric', 'ice', 'slice', 'drill'] as const) dmg[k] = (dmg[k] ?? 0) * om.dmgMult;
    }
    let explosion: Projectile['explosion'] = null;
    if (def.explosion) {
      explosion = {
        radius: def.explosion.radius + st.explosionRadius,
        durability: def.explosion.durability,
        rayEnergy: def.explosion.rayEnergy * (1 + st.explosionRadius / Math.max(1, def.explosion.radius)),
        fire: !!def.explosion.fire || extra.has('burn'),
        powderEdge: !!def.explosion.powderEdge,
        damage: dmg.explosion ?? 0,
      };
    } else if (st.explosionRadius > 0 || extra.has('explosive')) {
      const r = Math.max(2, st.explosionRadius);
      explosion = { radius: r, durability: 9, rayEnergy: 90 * r, fire: extra.has('burn'), powderEdge: false, damage: Math.max(5, dmg.explosion ?? 0) };
    }
    const col = hexToRgb(def.visual.color);
    const lc = def.visual.light ? hexToRgb(def.visual.light) : null;
    const trailName = st.trailMaterial ?? def.material?.trail?.mat ?? null;
    const p: Projectile = {
      def, x, y, z,
      vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed,
      age: 0, life,
      bounces: def.bounces + st.bounces + (extra.has('bounce_explode') && explosion ? 10 : 0),
      owner, grace: def.ownerGraceFrames ?? (st.friendlyFire ? 12 : Infinity),
      dmg, crit: st.critChance + (om?.crit ?? 0),
      explosion,
      extra,
      trailMat: trailName ? safeMat(trailName) : -1,
      trailChance: st.trailMaterial ? st.trailChance : def.material?.trail?.chance ?? 0,
      homing: st.homing + (def.homingBase ?? 0) + (extra.has('homing') ? 1 : 0) + (om?.homing ?? 0),
      pierceCreatures: !!def.passCreatures || st.piercing || extra.has('piercing'),
      pierceTerrain: !!def.passTerrain || st.piercing || extra.has('piercing'),
      gravity: (def.gravity + st.gravityAdd) * PROJ_GRAVITY_SCALE,
      knockback: st.knockback,
      trigger: trigger ? { kind: trigger.kind, timerFrames: trigger.timerFrames ?? 10, payload: trigger.payload } : null,
      triggerFired: false,
      hitSet: new Set(),
      alive: true,
      color: [col[0] / 255, col[1] / 255, col[2] / 255],
      size: def.visual.size,
      glow: def.visual.style !== 'bomb' && def.visual.style !== 'dynamite' && def.visual.style !== 'arrow' && def.visual.style !== 'none',
      lightColor: lc ? [lc[0] / 255, lc[1] / 255, lc[2] / 255] : null,
      lightRadius: (def.visual.lightRadius ?? (lc ? 10 : 0)) + st.lightRadiusAdd + (extra.has('light') ? 30 : 0),
      ox: x, oy: y, oz: z,
      lastHitX: x, lastHitY: y, lastHitZ: z,
      lastFreeX: x, lastFreeY: y, lastFreeZ: z,
      hostileTo: hostileTo ?? ((c) => c !== owner),
    };
    if (!p.lightColor && p.lightRadius > 0) p.lightColor = [1, 0.95, 0.8];
    // recoil
    if (owner && st.recoil > 0) {
      owner.body.vx -= dir.x * st.recoil * 0.08;
      owner.body.vy -= dir.y * st.recoil * 0.08;
      owner.body.vz -= dir.z * st.recoil * 0.08;
    }
    this.list.push(p);
    // instant behaviours
    if (def.special === 'lightning') this.lightning(p);
    else if (def.material?.sea) this.sea(p);
    return p;
  }

  update(dt: number): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.alive) this.step(p, dt);
    }
    let w = 0;
    for (let i = 0; i < list.length; i++) if (list[i].alive) list[w++] = list[i];
    list.length = w;
  }

  private step(p: Projectile, dt: number): void {
    const def = p.def;
    p.age++;
    if (p.grace > 0) p.grace--;
    // timer trigger
    if (p.trigger && p.trigger.kind === 'timer' && !p.triggerFired && p.age >= p.trigger.timerFrames) this.firePayload(p, false);
    if (p.age > p.life) {
      this.die(p, true);
      return;
    }
    // homing: steer towards nearest hostile creature in front
    if (p.homing > 0) this.steer(p, dt);
    // gravity
    if (!def.stationary) p.vy -= p.gravity * dt;
    // continuous material behaviours
    if (def.material?.spray) this.spray(p);
    if (def.material?.circle) this.circle(p);
    if (def.special === 'black_hole') this.blackHole(p);
    if (def.special === 'death_cross' && p.age % 15 === 0) this.detonate(p, p.x, p.y, p.z, false);
    if (def.dig && def.stationary) this.destruction.dig(p.x, p.y, p.z, def.dig.radius, def.dig.durability);
    // move with swept collision
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
    const segLen = Math.hypot(nx - p.x, ny - p.y, nz - p.z);
    let travelled = segLen;
    let hitTerrain = false;
    if (segLen > 1e-5) {
      if (def.dig && !def.stationary) {
        // drilling projectile: carve along the path
        const n = Math.max(1, Math.ceil(segLen / 1.2));
        for (let s = 1; s <= n; s++) {
          const t = s / n;
          this.destruction.dig(p.x + (nx - p.x) * t, p.y + (ny - p.y) * t, p.z + (nz - p.z) * t, def.dig.radius, def.dig.durability);
        }
      }
      if (!p.pierceTerrain) {
        const h = this.world.raycast(p.x, p.y, p.z, nx - p.x, ny - p.y, nz - p.z, segLen, RAY_SOLID, tmpHit);
        if (h.hit) {
          hitTerrain = true;
          travelled = h.dist;
        }
      }
      // creature collisions before the terrain hit
      const target = this.findCreatureHit(p, nx, ny, nz, travelled / segLen);
      if (target) {
        const [c, t] = target;
        const hx = p.x + (nx - p.x) * t, hy = p.y + (ny - p.y) * t, hz = p.z + (nz - p.z) * t;
        this.hitCreature(p, c, hx, hy, hz);
        if (!p.alive) return;
      }
      // liquids: splash on entry, fire-based projectiles fizzle in water
      const curM = this.world.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      const nextM = this.world.get(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (KIND[nextM] === Kind.LIQUID && KIND[curM] !== Kind.LIQUID) {
        const c = this.particles.matColor(nextM);
        for (let k = 0; k < 6; k++) this.particles.spawn(nx, ny + 0.5, nz, (this.rng.f() - 0.5) * 12, 8 + this.rng.f() * 10, (this.rng.f() - 0.5) * 12, c, 0.6, 0.35, 1);
        if (k2fire(def) && MATERIALS[nextM].extinguishes) {
          this.events.sound?.('steam_hiss', nx, ny, nz, 0.5);
          this.die(p, true);
          return;
        }
      }
      if (hitTerrain) {
        const hx = tmpHit.px, hy = tmpHit.py, hz = tmpHit.pz;
        p.lastHitX = hx; p.lastHitY = hy; p.lastHitZ = hz;
        if (p.bounces > 0 && def.special !== 'teleport_caster') {
          p.bounces--;
          const e = def.bounceEnergy || 0.8;
          if (tmpHit.nx) p.vx = -p.vx * e;
          if (tmpHit.ny) p.vy = -p.vy * e;
          if (tmpHit.nz) p.vz = -p.vz * e;
          p.x = hx + tmpHit.nx * 0.05;
          p.y = hy + tmpHit.ny * 0.05;
          p.z = hz + tmpHit.nz * 0.05;
          if (p.trigger && p.trigger.kind === 'hit' && !p.triggerFired) this.firePayload(p, true);
          this.impactFx(p, hx, hy, hz, false);
          return;
        }
        this.impactTerrain(p, hx, hy, hz, tmpHit.x, tmpHit.y, tmpHit.z, tmpHit.mat);
        return;
      }
      p.x = nx; p.y = ny; p.z = nz;
    }
    const cm = this.world.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (cm === AIR || KIND[cm] === Kind.GAS || KIND[cm] === Kind.FIRE) {
      p.lastFreeX = p.x; p.lastFreeY = p.y; p.lastFreeZ = p.z;
    }
    if (cm === UNLOADED) {
      this.die(p, false);
      return;
    }
    // trails
    if (p.trailMat >= 0 && this.rng.f() < Math.max(0.15, p.trailChance)) this.placeAt(p.x, p.y, p.z, p.trailMat);
    if (p.extra.has('fire_trail') && this.rng.f() < 0.5) this.placeAt(p.x, p.y, p.z, FIRE);
    if (p.extra.has('freeze_charge') || def.special === 'freeze_area') this.chill(p.x, p.y, p.z, 1.8);
    // visual trail
    if (p.glow && !def.stationary && this.rng.f() < 0.9) {
      const tc = def.visual.trail ? hexToRgb(def.visual.trail) : null;
      const col: [number, number, number] = tc ? [tc[0] / 255, tc[1] / 255, tc[2] / 255] : p.color;
      this.particles.spawn(p.x, p.y, p.z, (this.rng.f() - 0.5) * 2, (this.rng.f() - 0.5) * 2, (this.rng.f() - 0.5) * 2, col, 0.25 + this.rng.f() * 0.2, p.size * 0.5, 0, true, 2);
    }
  }

  private steer(p: Projectile, dt: number): void {
    let best: Creature | null = null;
    let bd = 70;
    for (const c of this.damage.creatures) {
      if (!c.alive || !p.hostileTo(c) || c === p.owner) continue;
      const d = Math.hypot(c.cx - p.x, c.cy - p.y, c.cz - p.z);
      if (d < bd && this.world.lineOfSight(p.x, p.y, p.z, c.cx, c.cy, c.cz)) {
        bd = d;
        best = c;
      }
    }
    if (!best) return;
    const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const tx = best.cx - p.x, ty = best.cy - p.y, tz = best.cz - p.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    const k = Math.min(1, 6 * p.homing * dt);
    p.vx += (tx / tl * sp - p.vx) * k;
    p.vy += (ty / tl * sp - p.vy) * k;
    p.vz += (tz / tl * sp - p.vz) * k;
  }

  /** Nearest creature intersected by the segment [p, n] up to fraction maxT. */
  private findCreatureHit(p: Projectile, nx: number, ny: number, nz: number, maxT: number): [Creature, number] | null {
    let best: Creature | null = null;
    let bt = maxT;
    const dx = nx - p.x, dy = ny - p.y, dz = nz - p.z;
    const r = p.def.radius;
    for (const c of this.damage.creatures) {
      if (!c.alive) continue;
      if (c === p.owner && p.grace > 0) continue;
      if (p.hitSet.has(c.id)) continue;
      const b = c.body;
      const t = segAabb(p.x, p.y, p.z, dx, dy, dz, b.x - b.hw - r, b.y - r, b.z - b.hw - r, b.x + b.hw + r, b.y + b.h + r, b.z + b.hw + r);
      if (t >= 0 && t <= bt) {
        bt = t;
        best = c;
      }
    }
    return best ? [best, bt] : null;
  }

  private hitCreature(p: Projectile, c: Creature, x: number, y: number, z: number): void {
    const d = p.dmg;
    const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const kx = (p.vx / sp) * (6 + p.knockback * 0.2), ky = 2 + (p.vy / sp) * 4, kz = (p.vz / sp) * (6 + p.knockback * 0.2);
    let crit = false;
    if (p.crit > 0 && this.rng.f() * 100 < p.crit) crit = true;
    const src = p.owner;
    const types: [DamageType, number][] = [
      ['projectile', (d.projectile ?? 0) * (crit ? 5 : 1)], ['fire', d.fire ?? 0], ['electric', d.electric ?? 0], ['ice', d.ice ?? 0],
      ['slice', d.slice ?? 0], ['drill', d.drill ?? 0],
    ];
    let first = true;
    for (const [type, amt] of types) {
      if (amt <= 0) continue;
      this.damage.apply({ target: c, amount: amt, type, source: src, x, y, z, crit, kx: first ? kx : undefined, ky: first ? ky : undefined, kz: first ? kz : undefined });
      first = false;
    }
    if ((d.healing ?? 0) > 0) this.damage.apply({ target: c, amount: d.healing!, type: 'healing', source: src, x, y, z });
    if ((d.fire ?? 0) > 0 || p.extra.has('burn')) this.damage.setOnFire(c, 4);
    if (p.def.status?.onFire) this.damage.setOnFire(c, p.def.status.onFire);
    if (p.def.status?.frozen || p.extra.has('freeze_charge')) c.status.frozen = Math.max(c.status.frozen, (p.def.status?.frozen ?? 50) / 60);
    if (p.def.status?.oily) c.status.oily = Math.min(1, c.status.oily + 0.5);
    if (p.def.status?.wet) c.status.wet = Math.min(1, c.status.wet + 0.5);
    if (p.def.status?.stunned || p.extra.has('electric_charge')) c.status.stunned = Math.max(c.status.stunned, 0.4);
    this.events.sound?.(p.def.hitSound ?? 'impact_small', x, y, z, 0.6);
    this.impactFx(p, x, y, z, true);
    p.lastHitX = x; p.lastHitY = y; p.lastHitZ = z;
    if (p.pierceCreatures) {
      p.hitSet.add(c.id);
      if (p.trigger && p.trigger.kind === 'hit') this.firePayload(p, true, true);
      return;
    }
    p.x = x; p.y = y; p.z = z;
    if (p.trigger && p.trigger.kind === 'hit' && !p.triggerFired) this.firePayload(p, true);
    if (p.explosion) this.detonate(p, x, y, z, true);
    if (p.def.special === 'teleport_caster' && p.owner) this.events.teleport?.(p.owner, p.lastFreeX, p.lastFreeY, p.lastFreeZ);
    this.releaseMaterial(p, 'onHit');
    this.die(p, false);
  }

  private impactTerrain(p: Projectile, x: number, y: number, z: number, vx: number, vy: number, vz: number, mat: number): void {
    const def = p.def;
    p.x = x - Math.sign(p.vx) * 0.05;
    p.y = y - Math.sign(p.vy) * 0.05;
    p.z = z - Math.sign(p.vz) * 0.05;
    if (p.trigger && p.trigger.kind === 'hit' && !p.triggerFired) this.firePayload(p, true);
    // small terrain damage from the projectile itself (spark bolts chip soft materials)
    if (!def.dig && !p.explosion && (p.dmg.projectile ?? 0) > 0 && def.explosion === undefined) {
      // nothing: non-explosive projectiles without dig do not alter terrain
    }
    if (p.explosion) this.detonate(p, x, y, z, true);
    if ((p.dmg.fire ?? 0) > 0 || p.extra.has('burn')) {
      this.sim.ignite(vx, vy, vz);
      this.placeAt(p.lastFreeX, p.lastFreeY, p.lastFreeZ, FIRE);
    }
    if (p.extra.has('electric_charge') || (p.dmg.electric ?? 0) > 0) {
      const cells = this.sim.electrify(vx, vy, vz);
      if (cells.length) this.events.electrocute?.(cells, p.owner, Math.max(2.5, p.dmg.electric ?? 0));
    }
    if (def.special === 'teleport_caster' && p.owner) this.events.teleport?.(p.owner, p.lastFreeX, p.lastFreeY, p.lastFreeZ);
    this.releaseMaterial(p, 'onHit');
    this.impactFx(p, x, y, z, false, mat);
    this.events.sound?.(def.hitSound ?? (p.explosion ? 'explosion_small' : 'impact_dirt'), x, y, z, 0.5);
    this.die(p, false);
  }

  /** Projectile death: expiry triggers, explode-on-death, material release. */
  private die(p: Projectile, expired: boolean): void {
    if (!p.alive) return;
    p.alive = false;
    if (p.trigger && !p.triggerFired && (p.trigger.kind === 'death' || p.trigger.kind === 'timer')) this.firePayload(p, false);
    if (expired) {
      const eo = p.def.explodeOn ?? 'hit';
      if (p.explosion && (eo === 'death' || eo === 'both')) this.detonate(p, p.x, p.y, p.z, true);
      if (p.def.special === 'teleport_caster' && p.owner) this.events.teleport?.(p.owner, p.lastFreeX, p.lastFreeY, p.lastFreeZ);
      this.releaseMaterial(p, 'onDeath');
    }
  }

  private firePayload(p: Projectile, onHit: boolean, keep = false): void {
    if (!p.trigger) return;
    if (!keep) p.triggerFired = true;
    const sp = Math.hypot(p.vx, p.vy, p.vz);
    let dir: THREE.Vector3;
    if (sp > 0.5) dir = new THREE.Vector3(p.vx / sp, p.vy / sp, p.vz / sp);
    else {
      dir = new THREE.Vector3(this.rng.f() - 0.5, this.rng.f() - 0.2, this.rng.f() - 0.5).normalize();
    }
    // spawn slightly back from the impact so the payload starts in open space
    const bx = onHit ? p.lastFreeX : p.x, by = onHit ? p.lastFreeY : p.y, bz = onHit ? p.lastFreeZ : p.z;
    this.fireShot(p.trigger.payload, bx, by, bz, dir, p.owner, 0, 1, p.hostileTo);
  }

  private detonate(p: Projectile, x: number, y: number, z: number, consume: boolean): void {
    const e = p.explosion;
    if (!e) return;
    const berserk = p.owner && p.owner.status.berserk > 0 ? 2 : 1;
    const radius = e.radius * berserk;
    this.destruction.explode(x, y, z, { radius, durability: e.durability, rayEnergy: e.rayEnergy, fire: e.fire, powderEdge: e.powderEdge });
    this.damage.explosion(x, y, z, radius, e.damage, p.owner, { fire: e.fire });
    this.events.explosionFx?.(x, y, z, radius, e.fire);
    this.events.sound?.(radius > 10 ? 'explosion_big' : 'explosion_small', x, y, z, Math.min(1, 0.4 + radius / 20));
    if (consume && p.def.special !== 'death_cross') p.explosion = consume ? e : null;
  }

  private impactFx(p: Projectile, x: number, y: number, z: number, creature: boolean, mat = 0): void {
    const n = creature ? 6 : 8;
    const col = mat && !p.glow ? this.particles.matColor(mat) : p.color;
    for (let i = 0; i < n; i++) {
      this.particles.spawn(x, y, z, (this.rng.f() - 0.5) * 22, (this.rng.f() - 0.2) * 18, (this.rng.f() - 0.5) * 22, col, 0.2 + this.rng.f() * 0.3, 0.3, 0.6, p.glow, 3);
    }
  }

  private placeAt(x: number, y: number, z: number, m: number): void {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const cur = this.world.get(ix, iy, iz);
    if (cur === AIR || (KIND[cur] === Kind.GAS && m !== FIRE)) this.world.set(ix, iy, iz, m);
  }

  private chill(x: number, y: number, z: number, r: number): void {
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(x + (this.rng.f() - 0.5) * 2 * r), cy = Math.floor(y + (this.rng.f() - 0.5) * 2 * r), cz = Math.floor(z + (this.rng.f() - 0.5) * 2 * r);
      const m = this.world.get(cx, cy, cz);
      if (KIND[m] === Kind.LIQUID) this.sim.heat(cx, cy, cz, -400);
      if (m === FIRE) this.world.set(cx, cy, cz, AIR);
    }
  }

  private releaseMaterial(p: Projectile, when: 'onHit' | 'onDeath'): void {
    const spec = p.def.material?.[when];
    if (!spec) return;
    const m = safeMat(spec.mat);
    if (m < 0) return;
    for (let i = 0; i < spec.amount; i++) {
      this.particles.launch(m, 0, p.lastFreeX, p.lastFreeY, p.lastFreeZ, (this.rng.f() - 0.5) * 16, this.rng.f() * 10, (this.rng.f() - 0.5) * 16);
    }
  }

  private spray(p: Projectile): void {
    const s = p.def.material!.spray!;
    const m = safeMat(s.mat);
    if (m < 0) return;
    const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
    for (let i = 0; i < s.perFrame; i++) {
      this.particles.launch(m, 0, p.x, p.y, p.z, p.vx * 0.6 + (this.rng.f() - 0.5) * sp * 0.15, p.vy * 0.6 + (this.rng.f() - 0.3) * sp * 0.15, p.vz * 0.6 + (this.rng.f() - 0.5) * sp * 0.15);
    }
  }

  private circle(p: Projectile): void {
    const c = p.def.material!.circle!;
    const m = safeMat(c.mat);
    if (m < 0) return;
    const t = p.age / Math.max(1, p.life);
    const r = Math.max(1, c.radius * t);
    // stop moving: circles expand where they are
    p.vx *= 0.8; p.vy *= 0.8; p.vz *= 0.8;
    const n = Math.min(60, Math.ceil(r * r * 0.5));
    for (let i = 0; i < n; i++) {
      const u = this.rng.f() * 2 - 1, a = this.rng.f() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      this.placeAt(p.x + s * Math.cos(a) * r, p.y + u * r * 0.6, p.z + s * Math.sin(a) * r, m);
    }
  }

  private sea(p: Projectile): void {
    const s = p.def.material!.sea!;
    const m = safeMat(s.mat);
    if (m < 0) return;
    const cx = Math.floor(p.x), cz = Math.floor(p.z);
    // find the open space below the caster
    let top = Math.floor(p.y) - 6;
    for (let k = 0; k < 20 && this.world.isSolid(cx, top, cz); k++) top++;
    const hw = Math.floor(s.width / 2);
    let placed = 0;
    for (let y = top; y > top - s.depth; y--)
      for (let z = cz - hw; z <= cz + hw; z++)
        for (let x = cx - hw; x <= cx + hw; x++) {
          const cur = this.world.get(x, y, z);
          if (cur === AIR || KIND[cur] === Kind.GAS) {
            this.world.set(x, y, z, m);
            placed++;
          }
        }
    this.events.sound?.('liquid_pour', p.x, top, p.z, 1);
    p.alive = false;
    void placed;
  }

  private blackHole(p: Projectile): void {
    this.destruction.eat(p.x, p.y, p.z, 3.2);
    for (const c of this.damage.creatures) {
      if (!c.alive) continue;
      const dx = p.x - c.cx, dy = p.y - c.cy, dz = p.z - c.cz;
      const d = Math.hypot(dx, dy, dz);
      if (d < 24 && d > 0.5) {
        const f = (1 - d / 24) * 60 * (1 / 60);
        c.body.vx += (dx / d) * f * 6;
        c.body.vy += (dy / d) * f * 6;
        c.body.vz += (dz / d) * f * 6;
      }
    }
    if (this.rng.f() < 0.6) {
      const a = this.rng.f() * Math.PI * 2, r = 4 + this.rng.f() * 3;
      this.particles.spawn(p.x + Math.cos(a) * r, p.y + (this.rng.f() - 0.5) * r, p.z + Math.sin(a) * r, -Math.cos(a) * 10, 0, -Math.sin(a) * 10, [0.5, 0.2, 0.8], 0.4, 0.3, 0, true, 0);
    }
  }

  private lightning(p: Projectile): void {
    const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
    const range = 260;
    const h = this.world.raycast(p.x, p.y, p.z, dx, dy, dz, range, RAY_SOLID, tmpHit);
    const ex = h.hit ? h.px : p.x + dx * range, ey = h.hit ? h.py : p.y + dy * range, ez = h.hit ? h.pz : p.z + dz * range;
    // creatures along the bolt
    let bt = 1;
    let hitC: Creature | null = null;
    for (const c of this.damage.creatures) {
      if (!c.alive || (c === p.owner)) continue;
      const b = c.body;
      const t = segAabb(p.x, p.y, p.z, ex - p.x, ey - p.y, ez - p.z, b.x - b.hw - 0.5, b.y - 0.5, b.z - b.hw - 0.5, b.x + b.hw + 0.5, b.y + b.h + 0.5, b.z + b.hw + 0.5);
      if (t >= 0 && t < bt) {
        bt = t;
        hitC = c;
      }
    }
    const fx = p.x + (ex - p.x) * bt, fy = p.y + (ey - p.y) * bt, fz = p.z + (ez - p.z) * bt;
    this.events.lightning?.(p.x, p.y, p.z, fx, fy, fz);
    if (hitC) {
      this.damage.apply({ target: hitC, amount: p.dmg.electric ?? 25, type: 'electric', source: p.owner, x: fx, y: fy, z: fz });
      hitC.status.stunned = Math.max(hitC.status.stunned, 0.6);
    }
    p.x = fx - dx * 0.5; p.y = fy - dy * 0.5; p.z = fz - dz * 0.5;
    p.lastFreeX = p.x; p.lastFreeY = p.y; p.lastFreeZ = p.z;
    if (p.explosion) this.detonate(p, fx, fy, fz, true);
    const cells = this.sim.electrify(Math.floor(fx + dx * 0.5), Math.floor(fy + dy * 0.5), Math.floor(fz + dz * 0.5));
    if (cells.length) this.events.electrocute?.(cells, p.owner, p.dmg.electric ?? 25);
    if (p.trigger && !p.triggerFired) this.firePayload(p, true);
    this.events.sound?.('electric_zap', fx, fy, fz, 1);
    p.alive = false;
  }

  /** Upload core sprites and register lights. */
  sync(addLight: (x: number, y: number, z: number, c: [number, number, number], r: number, i: number) => void): void {
    let g = 0, s = 0;
    for (const p of this.list) {
      if (!p.alive) continue;
      if (p.def.visual.style === 'none' || (p.def.stationary && p.def.dig)) {
        if (p.lightColor && p.lightRadius > 0) addLight(p.x, p.y, p.z, p.lightColor, p.lightRadius, 0.8);
        continue;
      }
      if (p.glow) {
        this.gPos[g * 3] = p.x; this.gPos[g * 3 + 1] = p.y; this.gPos[g * 3 + 2] = p.z;
        this.gCol[g * 4] = p.color[0]; this.gCol[g * 4 + 1] = p.color[1]; this.gCol[g * 4 + 2] = p.color[2]; this.gCol[g * 4 + 3] = 1;
        this.gSize[g] = p.size;
        g++;
      } else {
        this.sPos[s * 3] = p.x; this.sPos[s * 3 + 1] = p.y; this.sPos[s * 3 + 2] = p.z;
        this.sCol[s * 4] = p.color[0]; this.sCol[s * 4 + 1] = p.color[1]; this.sCol[s * 4 + 2] = p.color[2]; this.sCol[s * 4 + 3] = 1;
        this.sSize[s] = p.size;
        s++;
      }
      if (p.lightColor && p.lightRadius > 0) addLight(p.x, p.y, p.z, p.lightColor, p.lightRadius, 1);
    }
    for (const [pts, n] of [[this.glowPoints, g], [this.solidPoints, s]] as [THREE.Points, number][]) {
      const geo = pts.geometry;
      geo.setDrawRange(0, n);
      for (const name of ['position', 'pcolor', 'psize']) (geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

function safeMat(name: string): number {
  try {
    return matId(name);
  } catch {
    return -1;
  }
}

function k2fire(def: ProjectileDef): boolean {
  return (def.damage.fire ?? 0) > 0 && !def.explosion;
}

/** Segment (origin + t*d, t in [0,1]) vs AABB slab test. Returns entry t or -1. */
export function segAabb(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
): number {
  let tmin = 0, tmax = 1;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo[a] || o[a] > hi[a]) return -1;
    } else {
      let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export { GRAVITY };
