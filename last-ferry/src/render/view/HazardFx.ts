// Fire, gas, flares, the ferry's deck gun, explosions, the crane and the horn.
import * as THREE from 'three';
import { CANNON } from '../../config/rules';
import { CRANE, GRAVITY, TICK } from '../../config/world';
import type { GameEvents } from '../../core/events';
import type { World } from '../../core/World';
import { createFlareCartridge } from '../models/index';
import { REFLECT_LAYER } from '../Stage';
import { clamp, rand, type Ctx } from './ctx';
import { dust, ember, F, fireball, flame, gasPuff, metalHit, smoke, splinters } from './fx';

interface FireRec {
  id: number;
  x: number;
  z: number;
  r: number;
  stick: THREE.Group;
  tip: THREE.Vector3;
  /** Seconds since it went out (-1 = burning). */
  out: number;
  acc: number;
}

interface GasRec {
  id: number;
  x: number;
  z: number;
  r: number;
  acc: number;
  /** Seconds since it vanished (-1 = present). */
  gone: number;
}

interface ProjRec {
  id: number;
  kind: 'flare' | 'shell';
  obj: THREE.Object3D;
  px: number;
  py: number;
  pz: number;
  /** Visual offset (deck-gun muzzle vs logic gun), fades to 0 by impact. */
  ox: number;
  oy: number;
  oz: number;
  age: number;
  acc: number;
}

interface Marker {
  x: number;
  z: number;
  t: number;
  until: number;
  pulse: number;
}

interface Wave {
  t: number;
  delay: number;
  done: boolean;
}

const _v = new THREE.Vector3();

let flareGeo: THREE.SphereGeometry | null = null;
let shellGeo: THREE.CapsuleGeometry | null = null;

export class HazardFx {
  private fires = new Map<number, FireRec>();
  private gas = new Map<number, GasRec>();
  private projs = new Map<number, ProjRec>();
  private markers: Marker[] = [];
  private waves: Wave[] = [];
  private flareMat = new THREE.MeshBasicMaterial({ color: 0xffd0c0, toneMapped: false });
  private hornWave: HornWave | null = null;
  private shellMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.4, metalness: 0.7, emissive: 0x180800 });

  constructor(private ctx: Ctx) {}

  /** One of each mesh this draws (shader warm-up); the horn wave is shown until endPrewarm(). */
  prewarmObjects(): THREE.Object3D[] {
    flareGeo ??= new THREE.SphereGeometry(0.07, 10, 8);
    shellGeo ??= new THREE.CapsuleGeometry(0.11, 0.32, 4, 8);
    const f = new THREE.Mesh(flareGeo, this.flareMat);
    f.position.set(3, 1, 2);
    const s = new THREE.Mesh(shellGeo, this.shellMat);
    s.position.set(5, 1, 2);
    s.castShadow = true;
    this.hornWave ??= new HornWave(this.ctx.scene);
    this.hornWave.start();
    return [f, s];
  }

  endPrewarm(): void {
    this.hornWave?.update(99);
    this.hornWave?.update(0);
  }

  clear(): void {
    for (const f of this.fires.values()) f.stick.removeFromParent();
    this.fires.clear();
    this.gas.clear();
    for (const p of this.projs.values()) p.obj.removeFromParent();
    this.projs.clear();
    this.markers.length = 0;
    this.waves.length = 0;
  }

  beforeStep(w: World): void {
    for (const p of w.projectiles) {
      const r = this.projs.get(p.id);
      if (r) {
        r.px = p.x;
        r.py = p.y;
        r.pz = p.z;
      }
    }
  }

  // ------------------------------------------------------------------ events

  onFireZone(e: GameEvents['fireZone']): void {
    const ctx = this.ctx;
    const stick = createFlareCartridge();
    stick.position.set(e.x, 0, e.z);
    stick.rotation.y = Math.random() * Math.PI * 2;
    stick.scale.setScalar(1.6);
    stick.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.layers.enable(REFLECT_LAYER);
      }
    });
    ctx.root.add(stick);
    stick.updateMatrixWorld(true);
    const tipObj = stick.userData.tip as THREE.Object3D | undefined;
    const tip = tipObj ? tipObj.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(e.x, 0.05, e.z);
    this.fires.set(e.id, { id: e.id, x: e.x, z: e.z, r: e.radius, stick, tip, out: -1, acc: 0 });
    ctx.blood.splat('scorch', e.x, e.z, e.radius * 0.7);
    ctx.blood.splat('soot', e.x, e.z, e.radius * 1.1);
    for (let i = 0; i < 12; i++) flame(ctx.effects, e.x + rand(-0.3, 0.3), 0.05, e.z + rand(-0.3, 0.3), 1.4, true);
    ctx.lights.flash(e.x, 0.8, e.z + 0.3, 0xff6a3a, 25, 0.35, 10);
  }

  onGas(e: GameEvents['gas']): void {
    this.gas.set(e.id, { id: e.id, x: e.x, z: e.z, r: e.radius, acc: 0, gone: -1 });
    // A first thick belch of it.
    for (let i = 0; i < 10; i++) gasPuff(this.ctx.effects, e.x, e.z, e.radius * 0.6, 1.3, this.ctx.darkness);
  }

  onProjectile(e: GameEvents['projectile']): void {
    const ctx = this.ctx;
    let obj: THREE.Object3D;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (e.kind === 'flare') {
      flareGeo ??= new THREE.SphereGeometry(0.07, 10, 8);
      obj = new THREE.Mesh(flareGeo, this.flareMat);
    } else {
      shellGeo ??= new THREE.CapsuleGeometry(0.11, 0.32, 4, 8);
      const m = new THREE.Mesh(shellGeo, this.shellMat);
      m.castShadow = true;
      obj = m;
      // The deck gun fires: muzzle blast at the real muzzle, recoil, the gun trained on the target.
      const T = CANNON.flight;
      const target = { x: e.x + e.vx * T, y: 0, z: e.z + e.vz * T };
      const mz = ctx.env.ferryGunMuzzle(new THREE.Vector3());
      ctx.env.ferryGunRecoil(target);
      ox = mz.x - e.x;
      oy = mz.y - e.y;
      oz = mz.z - e.z;
      this.gunBlast(mz, target);
    }
    obj.layers.enable(REFLECT_LAYER);
    obj.position.set(e.x + ox, e.y + oy, e.z + oz);
    ctx.root.add(obj);
    this.projs.set(e.id, { id: e.id, kind: e.kind, obj, px: e.x, py: e.y, pz: e.z, ox, oy, oz, age: 0, acc: 0 });
  }

  onProjectileEnd(e: GameEvents['projectileEnd']): void {
    const ctx = this.ctx;
    const r = this.projs.get(e.id);
    if (!r) return;
    r.obj.removeFromParent();
    this.projs.delete(e.id);
    if (r.kind === 'flare') {
      for (let i = 0; i < 14; i++) ctx.effects.emit(true, e.x, Math.max(0.05, e.y), e.z, { vel: [rand(-3, 4), rand(0.5, 4), rand(-2, 2)], g: 12, size: [0.05, 0.02], life: rand(0.2, 0.5), color: 0xffc090, color1: 0xff3010, alpha: [1, 0], frame: F.Spark, streak: 1, ground: true });
      ctx.lights.flash(e.x, Math.max(0.4, e.y + 0.3), e.z + 0.3, 0xff5030, 22, 0.25, 8);
    }
  }

  onCannonStrike(e: GameEvents['cannonStrike']): void {
    const now = this.ctx.time;
    e.targets.forEach((t, i) => {
      this.markers.push({ x: t.x, z: t.z, t: 0, until: now + CANNON.flight + i * CANNON.interval + 0.05, pulse: 0 });
    });
    if (e.targets[0]) this.ctx.env.ferryGunAim(e.targets[0].x, 0, e.targets[0].z);
  }

  onExplosion(e: GameEvents['explosion']): void {
    const ctx = this.ctx;
    const p = { x: e.x, y: Math.max(0, e.y), z: e.z };
    const onDeck = ctx.env.isOnDeck(e.x, e.z);
    const hunter = ctx.world?.players[0];
    const dist = hunter ? Math.hypot(hunter.x - e.x, hunter.z - e.z) : 20;
    const near = clamp(1 - dist / 30, 0.2, 1);
    switch (e.kind) {
      case 'cannon': {
        fireball(ctx.effects, p, e.radius, 'fire');
        ctx.effects.ring(e.x, 0.04, e.z, 0.3, e.radius * 2.4, 0.32, 0xffd0a0, 0.75);
        ctx.effects.ring(e.x, 0.06, e.z, 0.2, e.radius * 1.2, 0.5, 0xff8040, 0.5);
        splinters(ctx.effects, { x: e.x, y: 0.2, z: e.z }, 26, 8);
        dust(ctx.effects, e.x, e.z, 10, 0.6, 2.4, 0x7a6e62);
        ctx.lights.flash(e.x, 1.6, e.z + 0.6, 0xffa050, 140, 0.45, 24);
        ctx.env.flashScreen(0.22 * near + 0.08, 0xffe0b0);
        ctx.shake.punch(0, -1.6 * near, 0);
        if (onDeck) {
          ctx.blood.splat('scorch', e.x, e.z, e.radius * 0.55);
          ctx.blood.splat('soot', e.x, e.z, e.radius * 0.95);
        } else ctx.effects.splash({ x: e.x, y: -2.4, z: e.z }, 2.4);
        break;
      }
      case 'gas': {
        fireball(ctx.effects, p, e.radius, 'gas');
        fireball(ctx.effects, p, e.radius * 0.7, 'fire');
        ctx.effects.ring(e.x, 0.05, e.z, 0.3, e.radius * 2.2, 0.35, 0xd8ff90, 0.6);
        ctx.lights.flash(e.x, 1.4, e.z + 0.5, 0xc8ff70, 110, 0.5, 20);
        ctx.env.flashScreen(0.16 * near + 0.05, 0xe8ffb0);
        ctx.shake.punch(0, -1.0 * near, 0);
        if (onDeck) {
          ctx.blood.splat('scorch', e.x, e.z, e.radius * 0.45);
          ctx.blood.splat('soot', e.x, e.z, e.radius * 0.9);
        }
        for (const g of this.gas.values()) if (Math.hypot(g.x - e.x, g.z - e.z) < g.r + 0.5) g.gone = Math.max(g.gone, 0);
        break;
      }
      case 'crates': {
        dust(ctx.effects, e.x, e.z, 22, 0.7, 3.2, 0x8a7c6c);
        splinters(ctx.effects, { x: e.x, y: 0.4, z: e.z }, 30, 7);
        ctx.effects.ring(e.x, 0.04, e.z, 0.4, e.radius * 2, 0.4, 0xd8c8b0, 0.55);
        // Fish and ice spilling out of the smashed crates.
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = rand(2, 6);
          ctx.effects.emit(false, e.x, 0.5, e.z, { vel: [Math.cos(a) * s, rand(3, 7), Math.sin(a) * s * 0.7], g: 20, size: [0.07, 0.06], life: rand(0.6, 1.1), color: i % 3 ? 0xb8c4cc : 0xe8f2ff, alpha: [1, 0.8], frame: F.Flake, vr: rand(-12, 12), ground: true });
        }
        ctx.lights.flash(e.x, 1, e.z, 0xffe0c0, 6, 0.2, 8);
        ctx.shake.punch(0, -1.1 * near, 0);
        break;
      }
    }
    ctx.physics.blast(e.x, e.y, e.z, e.radius * 1.4, e.kind === 'crates' ? 12 : 24);
    ctx.env.scareGulls(e.x, e.z, 3);
  }

  onCrane(e: GameEvents['crane']): void {
    const ctx = this.ctx;
    if (e.state === 'falling') {
      // The rope snaps at the hook block.
      const hp = ctx.env.craneHookPosition(new THREE.Vector3());
      metalHit(ctx.effects, { x: hp.x, y: hp.y + 0.5, z: hp.z }, 1, 14);
      ctx.lights.flash(hp.x, hp.y + 0.6, hp.z + 0.4, 0xfff0c0, 10, 0.12, 7);
      // Dust shaken off the pallet as it drops.
      for (let i = 0; i < 6; i++) ctx.effects.emit(false, CRANE.hookX + rand(-1, 1), CRANE.palletY + rand(0, 1), CRANE.hookZ + rand(-0.7, 0.7), { vel: [rand(-0.3, 0.3), rand(-1, 0), 0], drag: 1.5, size: [0.15, 0.5], life: 0.8, color: 0x9a8c7a, alpha: [0.35, 0], frame: F.Smoke });
    }
  }

  onHorn(): void {
    const ctx = this.ctx;
    ctx.env.ferryHorn();
    this.hornWave ??= new HornWave(ctx.scene);
    this.hornWave.start();
    this.waves.push({ t: 0, delay: 0, done: false });
    ctx.env.flashScreen(0.06, 0xfff0d8);
    ctx.env.scareGulls(0, 0, 6);
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, w: World): void {
    const ctx = this.ctx;
    const fx = ctx.effects;
    // Deck fires (flares burning on the planks).
    for (const [id, f] of this.fires) {
      const live = w.fires.find((q) => q.id === id);
      if (!live && f.out < 0) f.out = 0;
      if (f.out >= 0) {
        f.out += dt;
        if (Math.random() < dt * 6 && f.out < 1.5) smoke(fx, f.tip.x, 0.15, f.tip.z, 0.6, 0x5a5654, 0.3);
        if (f.out > 1.5) {
          // The burnt-out stick stays on the planks.
          ctx.corpses.bake(f.stick);
          this.fires.delete(id);
        }
        continue;
      }
      const life = live ? clamp(live.ttl / live.max, 0, 1) : 0;
      const k = 0.5 + 0.5 * Math.sqrt(life);
      f.acc += dt * 40 * fx.density * k;
      while (f.acc >= 1) {
        f.acc -= 1;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * f.r * 0.75;
        flame(fx, f.x + Math.cos(a) * d, 0.04, f.z + Math.sin(a) * d * 0.8, rand(0.8, 1.6) * k);
      }
      // The flare itself: a fierce red-pink sputter.
      if (Math.random() < dt * 30) fx.emit(true, f.tip.x, f.tip.y + 0.04, f.tip.z, { vel: [rand(-0.5, 0.5), rand(1, 2.5), rand(-0.4, 0.4)], drag: 1, size: [0.22, 0.05], life: rand(0.2, 0.35), color: 0xffe0e0, color1: 0xff2a20, alpha: [1, 0], frame: F.Fire });
      if (Math.random() < dt * 5) smoke(fx, f.x + rand(-0.3, 0.3), 0.6, f.z + rand(-0.3, 0.3), 1, 0x3a3230, 0.4);
      if (Math.random() < dt * 8) ember(fx, f.x + rand(-0.4, 0.4), 0.1, f.z + rand(-0.3, 0.3));
      const fl = 0.8 + 0.2 * Math.sin(ctx.time * 21 + id) + 0.12 * Math.sin(ctx.time * 47.1 + id * 3);
      ctx.lights.add(f.x, 0.9, f.z + 0.35, 0xff6a2a, 16 * fl * k, 8.5, 1.4);
    }
    // Gas clouds.
    for (const [id, g] of this.gas) {
      const live = w.gas.find((q) => q.id === id);
      if (!live && g.gone < 0) g.gone = 0;
      if (g.gone >= 0) {
        g.gone += dt;
        if (g.gone > 0.1) this.gas.delete(id);
        continue;
      }
      g.x = live!.x;
      g.z = live!.z;
      g.r = live!.radius;
      const life = clamp(live!.ttl / live!.max, 0, 1);
      g.acc += dt * 13 * fx.density * (0.4 + 0.6 * life) * (g.r / 2.5);
      while (g.acc >= 1) {
        g.acc -= 1;
        gasPuff(fx, g.x, g.z, g.r, 0.7 + 0.5 * life, ctx.darkness);
      }
      ctx.lights.add(g.x, 1.0, g.z + 0.3, 0x9ad040, 3 * (0.4 + 0.6 * life) * (0.25 + ctx.darkness), g.r * 2.4, 0.6);
    }
    // Projectiles.
    const a = ctx.alpha;
    for (const p of w.projectiles) {
      const r = this.projs.get(p.id);
      if (!r) continue;
      r.age += dt;
      const x = r.px + (p.x - r.px) * a;
      const y = r.py + (p.y - r.py) * a;
      const z = r.pz + (p.z - r.pz) * a;
      if (r.kind === 'flare') {
        r.obj.position.set(x, y, z);
        r.acc += dt * 90 * fx.density;
        while (r.acc >= 1) {
          r.acc -= 1;
          fx.emit(true, x + rand(0, 0.15), y + rand(-0.03, 0.03), z, { vel: [rand(-0.5, 1.5), rand(-0.5, 0.8), rand(-0.4, 0.4)], g: 2, drag: 2, size: [rand(0.08, 0.16), 0.02], life: rand(0.15, 0.4), color: 0xffd0b0, color1: 0xff2a10, alpha: [1, 0], frame: F.Fire });
          if (Math.random() < 0.3) fx.emit(false, x + 0.1, y, z, { vel: [rand(0, 0.6), rand(0.2, 0.6), 0], drag: 1.5, size: [0.08, 0.45], life: rand(0.8, 1.4), color: 0xb8a8a8, alpha: [0.3, 0], frame: F.Smoke, vr: rand(-1, 1) });
        }
        fx.emit(true, x, y, z, { size: [0.55, 0.55], life: 0.02, color: 0xff6040, alpha: [0.9, 0.9], frame: F.Dot });
        ctx.lights.add(x, y + 0.2, z + 0.3, 0xff3a24, 34, 12, 3);
      } else {
        // Deck-gun shell: the visual offset melts away over the flight.
        const T = CANNON.flight;
        const u = clamp(r.age / T, 0, 1);
        const k = 1 - u;
        const sx = x + r.ox * k;
        const sy = y + r.oy * k;
        const sz = z + r.oz * k;
        const vy = p.vy - GRAVITY * a * TICK;
        r.obj.position.set(sx, sy, sz);
        _v.set(p.vx, vy, p.vz).normalize();
        r.obj.quaternion.setFromUnitVectors(UP, _v);
        r.acc += dt * 70 * fx.density;
        while (r.acc >= 1) {
          r.acc -= 1;
          fx.emit(false, sx, sy, sz, { vel: [rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3)], drag: 1.5, size: [0.1, 0.55], life: rand(0.5, 0.9), color: 0x8a8480, alpha: [0.4, 0], frame: F.Smoke, vr: rand(-1, 1) });
        }
        // A hot streak with a glowing head (it has to read against the sky).
        fx.emit(true, sx, sy, sz, { size: [1.1, 1.1], life: 0.02, color: 0xffc070, alpha: [0.9, 0.9], frame: F.Dot });
        fx.emit(true, sx, sy, sz, { size: [0.4, 0.4], life: 0.02, color: 0xfff4d0, alpha: [1, 1], frame: F.Dot });
        fx.beamFrame(r.obj.position, _v.set(sx - p.vx * 0.09, sy - vy * 0.09, sz - p.vz * 0.09), 0.14, 0xffb050, 0.75);
        if (Math.random() < 0.6) fx.emit(true, sx, sy, sz, { vel: [rand(-1, 1), rand(-0.5, 1), rand(-1, 1)], g: 6, size: [0.06, 0.03], life: rand(0.2, 0.4), color: 0xffd080, color1: 0xff5010, alpha: [1, 0], frame: F.Spark, streak: 1 });
        ctx.lights.add(sx, sy, sz, 0xffa050, 18, 10, 1.5);
      }
    }
    // Target markers for an incoming cannon strike: red rings pulsing on the deck.
    let mw = 0;
    for (const m of this.markers) {
      if (ctx.time > m.until) continue;
      m.pulse -= dt;
      if (m.pulse <= 0) {
        m.pulse = 0.16;
        fx.ring(m.x, 0.05, m.z, CANNON.radius * 0.9, 0.3, 0.3, 0xff3020, 0.7);
      }
      if (Math.random() < dt * 20) fx.emit(true, m.x + rand(-0.2, 0.2), 0.1, m.z + rand(-0.2, 0.2), { vel: [0, rand(1, 2.5), 0], size: [0.12, 0.05], life: 0.4, color: 0xff4030, alpha: [0.8, 0], frame: F.Spark, streak: 0.5 });
      ctx.lights.add(m.x, 0.6, m.z, 0xff2a1a, 4, 5, 0.8);
      this.markers[mw++] = m;
    }
    this.markers.length = mw;
    // Horn shockwaves rolling down the pier from the ferry.
    let ww = 0;
    for (const wv of this.waves) {
      wv.t += dt;
      if (wv.t >= wv.delay && !wv.done) wv.done = true;
      // Dust kicked up as the wave passes along the deck.
      const front = (wv.t - wv.delay) * 42;
      if (wv.delay === 0 && front > 0 && front < 50 && Math.random() < dt * 40) {
        const x = FERRY_X - front;
        dust(fx, x, rand(-5, 5), 1, 0.35, 0.6, 0xb0a494);
      }
      if (wv.t < 1.6) this.waves[ww++] = wv;
    }
    this.waves.length = ww;
    this.hornWave?.update(dt);
  }

  /** The deck gun's muzzle blast. */
  private gunBlast(mz: THREE.Vector3, target: { x: number; z: number }): void {
    const ctx = this.ctx;
    const fx = ctx.effects;
    const dx = target.x - mz.x;
    const dz = target.z - mz.z;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    fx.emit(true, mz.x + ux * 0.6, mz.y + 0.2, mz.z + uz * 0.6, { size: [1.4, 2.4], life: 0.09, color: 0xfff4c8, color1: 0xff8a30, alpha: [1, 0], frame: F.Star });
    for (let i = 0; i < 14; i++) {
      fx.emit(false, mz.x + ux * rand(0.3, 1.6), mz.y + rand(-0.1, 0.4), mz.z + uz * rand(0.3, 1.6), { vel: [ux * rand(2, 6) + rand(-0.6, 0.6), rand(0.3, 1.6), uz * rand(2, 6) + rand(-0.6, 0.6)], drag: 1.8, size: [0.4, rand(1.4, 2.4)], life: rand(1.2, 2.2), color: 0xa8a4a0, color1: 0x6a6866, alpha: [0.55, 0], frame: F.Smoke, vr: rand(-1, 1) });
    }
    ctx.lights.flash(mz.x + ux, mz.y + 0.5, mz.z + 1, 0xffb060, 90, 0.18, 22);
    ctx.env.flashScreen(0.05, 0xfff0d0);
    ctx.shake.add(0.06);
    ctx.env.scareGulls(mz.x, mz.z, 2);
  }

  get counts(): { fires: number; gas: number; projectiles: number } {
    return { fires: this.fires.size, gas: this.gas.size, projectiles: this.projs.size };
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The horn's shockwave: thin bright bands racing down the pier from the
 * ferry (a flat additive disc drawn on the deck, three rings in one shader).
 */
class HornWave {
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t = 99;
  private static readonly R = 56;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uR: { value: HornWave.R } },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uT, uR;
        varying vec2 vP;
        void main() {
          float d = length(vP) * uR;
          float a = 0.0;
          for (int i = 0; i < 3; i++) {
            float t = uT - float(i) * 0.13;
            if (t < 0.0) continue;
            float r = t * 44.0;
            float w = 0.35 + t * 0.9;
            float k = exp(-pow((d - r) / w, 2.0)) * (1.0 - smoothstep(0.6, 1.25, t)) * (i == 0 ? 0.55 : 0.28);
            // a faint bright wake just behind the front
            k += smoothstep(r - 4.0 * w, r, d) * step(d, r) * 0.06 * (1.0 - smoothstep(0.3, 1.0, t)) * (i == 0 ? 1.0 : 0.0);
            a += k;
          }
          if (a < 0.002) discard;
          gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(FERRY_X, 0.07, 0);
    this.mesh.scale.setScalar(HornWave.R);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  start(): void {
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.t > 1.6) {
      this.mesh.visible = false;
      return;
    }
    this.t += dt;
    this.mat.uniforms.uT.value = this.t;
  }
}
const FERRY_X = 23.5;
