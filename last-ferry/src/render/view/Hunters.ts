// The Bosun: his rig posed from the logic (state, weapon, recoil, reloads,
// pump, engine spin, heat, hurt), muzzle flashes and light at the real muzzle,
// tracers to every bullet path (nails as fast streaks, pellets fanning out),
// shells and casings, the outboard's exhaust and heat shimmer, a warm lantern
// glow at night, stomp rings and kick dust.
import * as THREE from 'three';
import { WEAPON_ORDER, type WeaponId } from '../../config/ids';
import { TICK } from '../../config/world';
import type { GameEvents } from '../../core/events';
import type { Player } from '../../core/Player';
import { createHunterRig, type BosunRig, type LFWeaponModel } from '../models/index';
import type { AnimInput } from '../models/types';
import { clamp, rand, type Ctx } from './ctx';
import { dust, F, smoke } from './fx';

interface HRec {
  p: Player;
  rig: BosunRig;
  px: number;
  py: number;
  pz: number;
  pd: number;
  hurt: number;
  /** Pending shotgun pump ejects (presentation time). */
  pumps: number[];
  exhaustT: number;
  deadT: number;
  pooled: boolean;
}

/** Muzzle flash look per weapon: [size, light intensity, light colour, star?]. */
const FLASH: Record<WeaponId, { size: number; light: number; color: number; star: boolean; smoke: number }> = {
  revolver: { size: 0.62, light: 14, color: 0xffc070, star: true, smoke: 1.4 },
  nailgun: { size: 0.3, light: 4, color: 0xd8e8ff, star: false, smoke: 0.8 },
  shotgun: { size: 0.95, light: 22, color: 0xffb860, star: true, smoke: 2.2 },
  flare: { size: 0.7, light: 20, color: 0xff5a3a, star: true, smoke: 2 },
  harpoon: { size: 0.4, light: 0, color: 0xffffff, star: false, smoke: 1.8 },
  outboard: { size: 0.66, light: 12, color: 0xffc070, star: true, smoke: 0.8 },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _anim: AnimInput = { state: 'stand', stateTime: 0, time: 0, distance: 0, speed: 0, dt: 0, params: {} };
const _params: Record<string, number | boolean> = {};
const EXHAUST = new THREE.Vector3(0.32, -0.21, -0.06);


export class Hunters {
  readonly recs = new Map<number, HRec>();
  private shots: Array<GameEvents['shot']> = [];

  constructor(private ctx: Ctx) {
    // Dropped nail strips / ammo cans: a copy of the gun's own magazine.
    ctx.debris.clipFactory = (kind) => {
      const h = this.recs.values().next().value as HRec | undefined;
      const m = h?.rig.getWeapon()?.magazine;
      if (!m) return new THREE.Group();
      const c = m.clone(true);
      c.visible = true;
      c.scale.multiplyScalar(kind === 'belt' ? 0.8 : 1);
      return c;
    };
  }

  add(p: Player): void {
    if (this.recs.has(p.id)) return;
    const rig = createHunterRig();
    rig.root.position.set(p.x, p.y, p.z);
    this.ctx.root.add(rig.root);
    this.recs.set(p.id, { p, rig, px: p.x, py: p.y, pz: p.z, pd: p.distance, hurt: 0, pumps: [], exhaustT: 0, deadT: -1, pooled: false });
  }

  clear(): void {
    for (const h of this.recs.values()) h.rig.root.removeFromParent();
    this.recs.clear();
    this.shots.length = 0;
  }

  beforeStep(): void {
    for (const h of this.recs.values()) {
      h.px = h.p.x;
      h.py = h.p.y;
      h.pz = h.p.z;
      h.pd = h.p.distance;
    }
  }

  /** Muzzle world position of a player's gun (as last posed). */
  muzzle(playerId: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const h = this.recs.get(playerId);
    const w = h?.rig.getWeapon();
    if (!h || !w) return null;
    return w.muzzle.getWorldPosition(out);
  }

  // ------------------------------------------------------------------ events

  onShot(e: GameEvents['shot']): void {
    this.shots.push(e);
  }

  onHurt(e: GameEvents['playerHurt']): void {
    const h = this.recs.get(e.playerId);
    if (!h) return;
    h.hurt = Math.min(1, h.hurt + 0.25 + e.damage / 30);
    if (e.source === 'grab' || e.source === 'blast') {
      const p = h.p;
      this.ctx.blood.spray({ x: p.x, y: 1.1, z: p.z }, 6 + e.damage, { dirX: 1, speed: [0.5, 3], up: [0.5, 2.5], spread: 1.2 });
    }
  }

  onReloadStart(e: GameEvents['reloadStart']): void {
    const h = this.recs.get(e.playerId);
    const w = h?.rig.getWeapon();
    if (!h || !w) return;
    const ctx = this.ctx;
    h.rig.root.updateMatrixWorld(true);
    const carrier = _v3.set(h.p.vx, 0, h.p.vz);
    const at = (w.ejector ?? w.magazine ?? w.muzzle).getWorldPosition(_v2);
    switch (e.weapon) {
      case 'revolver':
        // Six empties tipped out of the cylinder.
        for (let i = 0; i < 6; i++) ctx.debris.shell('small', at.clone().add(_v.set(rand(-0.03, 0.03), -0.05, rand(-0.03, 0.03))), carrier, 0.25, _v.set(rand(-0.3, 0.3), 0, 1).normalize());
        break;
      case 'flare':
        ctx.debris.shell('shotgun', at.clone(), carrier, 0.6);
        break;
      case 'nailgun':
        ctx.debris.clip('mp5', (w.magazine ?? w.muzzle).getWorldPosition(new THREE.Vector3()), carrier);
        break;
      case 'outboard':
        ctx.debris.clip('belt', (w.magazine ?? w.muzzle).getWorldPosition(new THREE.Vector3()), carrier);
        break;
      default:
        break;
    }
  }

  onStomp(e: GameEvents['stomp']): void {
    const ctx = this.ctx;
    ctx.effects.ring(e.x, 0.04, e.z, 0.2, 1.4, 0.4, 0xa89a88, 0.3, { blend: 'normal', frame: F.Shock });
    dust(ctx.effects, e.x, e.z, 7, 0.3, 1.3);
    if (e.killed) {
      ctx.blood.spray({ x: e.x - 0.2, y: 0.12, z: e.z }, 40, { dirX: -1, speed: [1, 5], up: [0.5, 3], spread: Math.PI });
      ctx.effects.bloodPuff({ x: e.x, y: 0.15, z: e.z }, -1, 1.5);
    }
    ctx.shake.add(e.killed ? 0.12 : 0.05);
    ctx.shake.punch(0, -0.6, 0);
  }

  onKick(e: GameEvents['kick']): void {
    const h = this.recs.get(e.playerId);
    if (!h) return;
    const p = h.p;
    dust(this.ctx.effects, p.x - 0.55, p.z, 3, 0.2, 0.8);
    this.ctx.blood.spray({ x: p.x - 0.7, y: 0.25, z: p.z }, 14, { dirX: -1, speed: [1, 4], up: [0.5, 2], spread: 0.8 });
  }

  onJump(e: GameEvents['jump']): void {
    const h = this.recs.get(e.playerId);
    if (h) dust(this.ctx.effects, h.p.x, h.p.z, 3, 0.22, 0.7);
  }

  onDeath(e: GameEvents['playerDeath']): void {
    const h = this.recs.get(e.playerId);
    if (!h) return;
    h.deadT = 0;
    const p = h.p;
    this.ctx.blood.spray({ x: p.x, y: 1.2, z: p.z }, 60, { dirX: 1, speed: [1, 5], up: [1, 4], spread: Math.PI });
    this.ctx.effects.bloodPuff({ x: p.x, y: 1.2, z: p.z }, 1, 2);
    this.ctx.shake.add(0.3);
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    const ctx = this.ctx;
    const w = ctx.world;
    if (!w) return;
    const a = ctx.alpha;
    for (const h of this.recs.values()) {
      const p = h.p;
      const x = h.px + (p.x - h.px) * a;
      const y = h.py + (p.y - h.py) * a;
      const z = h.pz + (p.z - h.pz) * a;
      h.rig.root.position.set(x, y, z);
      const wp = p.weapon;
      const prm = _params;
      const fireT = (w.tick - wp.lastShotTick + a) * TICK;
      prm.weapon = WEAPON_ORDER.indexOf(wp.id);
      prm.fireT = fireT;
      prm.reloadT = wp.reloading ? wp.reloadProgress : -1;
      prm.spin = wp.spin;
      prm.heat = wp.heat;
      prm.cock = wp.id === 'shotgun' && fireT < 0.75 ? clamp((fireT - 0.12) / 0.42, 0, 1) : 0;
      prm.loaded = wp.bullets > 0 && !wp.reloading;
      prm.hurt = h.hurt;
      prm.shells = wp.shellsLoading || 1;
      _anim.state = p.state;
      _anim.stateTime = (p.stateTicks + a) * TICK;
      _anim.time = ctx.time;
      _anim.distance = h.pd + (p.distance - h.pd) * a;
      _anim.speed = Math.hypot(p.vx, p.vz);
      _anim.dt = dt;
      _anim.params = prm;
      h.rig.animate(_anim);
      h.rig.root.updateMatrixWorld(true);
      h.hurt = Math.max(0, h.hurt - dt * 2.2);

      const gun = h.rig.getWeapon() as LFWeaponModel | null;
      // Shotgun pump: the spent shell flies out as the pump comes back.
      for (let i = h.pumps.length - 1; i >= 0; i--) {
        h.pumps[i] -= dt;
        if (h.pumps[i] <= 0) {
          h.pumps.splice(i, 1);
          if (gun?.ejector) ctx.debris.shell('shotgun', gun.ejector.getWorldPosition(new THREE.Vector3()), _v3.set(p.vx, 0, p.vz), 0.9);
        }
      }
      // The outboard: exhaust while the engine runs, shimmer and smoke when hot.
      if (gun && wp.id === 'outboard') this.outboardFx(h, gun, dt);
      // A weak warm glow around the Bosun at night (his lantern-lit oilskin).
      if (ctx.darkness > 0.05 && p.state !== 'dead') ctx.lights.add(x + 0.4, 2.3, z + 0.9, 0xffb46a, 3.2 * ctx.darkness, 6.5, 0.5);
      if (p.state === 'dead') {
        h.deadT += dt;
        if (!h.pooled && h.deadT > 1.1) {
          h.pooled = true;
          ctx.blood.pool(x + 0.6, z, 0.8);
        }
      }
    }
    // Shots: flashes and tracers from the freshly posed muzzle.
    for (const e of this.shots) this.shotFx(e);
    this.shots.length = 0;
  }

  private outboardFx(h: HRec, gun: LFWeaponModel, dt: number): void {
    const ctx = this.ctx;
    const wp = h.p.weapon;
    const eng = gun.extras.engine;
    if (!eng) return;
    const running = wp.spin > 0.02;
    h.exhaustT -= dt;
    if (running && h.exhaustT <= 0) {
      const firing = wp.state === 'fire' || wp.spin > 0.95;
      h.exhaustT = firing ? 0.035 : 0.12;
      const ex = eng.localToWorld(_v.copy(EXHAUST));
      ctx.effects.emit(false, ex.x, ex.y, ex.z, {
        vel: [rand(0.3, 0.9), rand(-0.3, 0.2), rand(-0.6, -0.1)],
        drag: 1.4,
        g: -0.6,
        size: [0.06, firing ? 0.5 : 0.3],
        life: rand(0.6, 1.1),
        color: firing ? 0x2c2a2a : 0x6a7080,
        color1: 0x9a9aa0,
        alpha: [firing ? 0.5 : 0.3, 0],
        frame: F.Smoke,
        vr: rand(-1, 1),
      });
    }
    if (wp.heat > 0.35) {
      // Heat haze over the barrels: faint warm wisps; hot sparks near the top.
      const m = gun.muzzle.getWorldPosition(_v);
      const k = (wp.heat - 0.35) / 0.65;
      if (Math.random() < dt * 30 * k) {
        ctx.effects.emit(true, m.x + rand(0, 0.5), m.y + 0.05, m.z + rand(-0.05, 0.05), {
          vel: [rand(-0.1, 0.1), rand(0.4, 0.9), 0],
          drag: 1,
          size: [0.08, 0.3],
          life: rand(0.4, 0.8),
          color: 0xff8a40,
          alpha: [0.08 + 0.1 * k, 0],
          frame: F.Mist,
          vr: rand(-2, 2),
        });
      }
      if (wp.overheated && Math.random() < dt * 14) smoke(ctx.effects, m.x + rand(0, 0.4), m.y + 0.1, m.z, 0.5, 0x8a8a8a, 0.35);
    }
  }

  private shotFx(e: GameEvents['shot']): void {
    const ctx = this.ctx;
    const h = this.recs.get(e.playerId);
    const gun = h?.rig.getWeapon();
    const fx = ctx.effects;
    const m = gun ? gun.muzzle.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(e.muzzle.x, e.muzzle.y, e.muzzle.z);
    const f = FLASH[e.weapon];
    const dark = ctx.darkness;
    // Flash.
    if (f.star) {
      const auto = e.weapon === 'outboard';
      const life = auto ? 0.045 : 0.08;
      fx.emit(true, m.x - f.size * 0.35, m.y, m.z, { size: [f.size, f.size * 1.3], life, color: 0xfff4c0, color1: f.color, alpha: [1, 0.2], frame: F.Star, rot: Math.random() * 6 });
      // A warm glow around the muzzle so the shot reads at game scale (the star alone is a speck).
      fx.emit(true, m.x - f.size * 0.45, m.y, m.z, { size: [f.size * 0.75, f.size * 0.9], life: life * 0.9, color: f.color, alpha: [auto ? 0.45 : 0.7, 0], frame: F.Dot });
      fx.emit(true, m.x - f.size * 0.9, m.y, m.z, { size: [f.size * 1.1, f.size * 0.45], life: life * 0.8, color: 0xffd890, alpha: [0.9, 0], frame: F.Spark, streak: 0.0001, vel: [-30, 0, 0] });
      if (!auto || Math.random() < 0.3) {
        // Side jets: the cylinder gap / ported barrel spits two short flames up and down.
        for (const sy of [1, -1]) fx.emit(true, m.x - f.size * 0.2, m.y, m.z, { size: [f.size * 0.45, f.size * 0.2], life: life * 0.7, color: 0xffe0a0, alpha: [0.8, 0], frame: F.Spark, streak: 0.0001, vel: [-6, sy * 22, rand(-3, 3)] });
      }
    } else if (e.weapon === 'nailgun' || e.weapon === 'harpoon') {
      // Compressed air / gas: a pale puff.
      fx.emit(false, m.x - 0.08, m.y, m.z, { vel: [-1.5, 0.2, 0], drag: 5, size: [0.06, f.size * 2.2], life: 0.25, color: 0xe8eef4, alpha: [0.45, 0], frame: F.Smoke });
    }
    if (f.light > 0) ctx.lights.flash(m.x - 0.25, m.y + 0.15, m.z + 0.45, f.color, f.light * (1 + 1.2 * dark), e.weapon === 'outboard' ? 0.05 : 0.07, e.weapon === 'shotgun' ? 9 : 7.5);
    // Muzzle smoke.
    const sm = f.smoke;
    if (sm > 0 && (e.weapon !== 'outboard' || Math.random() < 0.35)) {
      for (let i = 0; i < (e.weapon === 'shotgun' ? 3 : 1); i++) {
        fx.emit(false, m.x - 0.15, m.y + 0.02, m.z, {
          vel: [rand(-1.2, -0.3), rand(0.3, 0.7), rand(-0.15, 0.15)],
          drag: 2,
          size: [0.06 * sm, 0.4 * sm],
          life: rand(0.6, 1.1),
          color: 0xd0ccc8,
          alpha: [0.3, 0],
          frame: F.Smoke,
          vr: rand(-1.5, 1.5),
        });
      }
    }
    if (e.weapon === 'flare') {
      for (let i = 0; i < 8; i++) fx.emit(true, m.x - 0.1, m.y, m.z, { vel: [rand(-8, -3), rand(-1, 2), rand(-1.5, 1.5)], g: 10, size: [0.04, 0.02], life: rand(0.15, 0.35), color: 0xffb070, color1: 0xff3010, alpha: [1, 0], frame: F.Spark, streak: 1 });
    }
    // Tracers (widths are world metres: ~27 px per metre at the frame centre).
    for (const path of e.paths) {
      const to = _v2.set(path.to.x, path.to.y, path.to.z);
      const from = path.ric ? _v3.set(path.from.x, path.from.y, path.from.z) : m;
      const len = from.distanceTo(to);
      if (len < 0.05) continue;
      switch (path.kind) {
        case 'harpoon':
          break;
        case 'nail': {
          // A silver streak that actually travels, and a faint trail.
          const sp = 60;
          const dx = (to.x - from.x) / len;
          const dy = (to.y - from.y) / len;
          const dz = (to.z - from.z) / len;
          fx.emit(true, from.x, from.y, from.z, { vel: [dx * sp, dy * sp, dz * sp], size: [0.16, 0.16], life: Math.min(0.6, len / sp), color: 0xf0f6ff, alpha: [1, 0.9], frame: F.Spark, streak: 0.25 });
          fx.beam(from, to, 0.02, 0xc8d8ff, 0.18, 0.05);
          break;
        }
        case 'pellet': {
          fx.solidBeams.push(from, to, 0.028, 0xfff0c0, path.ric ? 0.5 : 0.75, 0.04, false);
          fx.beam(from, to, 0.07, 0xffb060, 0.3, 0.06);
          break;
        }
        default: {
          const big = e.weapon === 'revolver';
          const core = path.ric ? 0xcfe8ff : 0xfff3c8;
          fx.solidBeams.push(from, to, big ? 0.045 : 0.034, core, 0.85, big ? 0.06 : 0.04, false);
          fx.beam(from, to, big ? 0.16 : 0.11, 0xffa040, big ? 0.35 : 0.25, big ? 0.09 : 0.06);
          // A bright slug racing down the line.
          const t0 = rand(0.05, 0.4);
          fx.beam(_v.copy(from).lerp(to, t0), from.clone().lerp(to, Math.min(1, t0 + 4 / Math.max(1, len))), big ? 0.09 : 0.07, 0xfff8e0, 0.9, 0.04);
          break;
        }
      }
    }
    // Brass and shells.
    const p = h?.p;
    if (gun && p) {
      if (e.weapon === 'outboard' && gun.ejector) ctx.debris.shell('minigun', gun.ejector.getWorldPosition(new THREE.Vector3()), _v3.set(p.vx, 0, p.vz), 1.2);
      if (e.weapon === 'shotgun') h!.pumps.push(0.3);
    }
    ctx.env.scareGulls(m.x, m.z, e.weapon === 'shotgun' || e.weapon === 'harpoon' ? 1.5 : 1);
    if (e.weapon === 'harpoon') ctx.shake.punch(0.5, 0.1, 0);
    if (e.weapon === 'shotgun') ctx.shake.punch(0.35, 0.05, 0);
  }

  get count(): number {
    return this.recs.size;
  }
}
