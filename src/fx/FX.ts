import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import { Particles } from './Particles';
import { Decals, DECAL } from './Decals';
import { randomInCone, rand, clamp, randomUnitVector } from '../core/math';
import { P } from '../characters/Rig';
import type { Character } from '../characters/Character';
import { QG } from '../physics/Physics';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _c = new THREE.Color();
const DOWN = new THREE.Vector3(0, -1, 0);

const BLOOD_COLORS = [0xb01014, 0x9a0c10, 0xc81418, 0x8a0a0c, 0xd01a1c];
function bloodHex(): number {
  return BLOOD_COLORS[(Math.random() * BLOOD_COLORS.length) | 0];
}

/** Grid that remembers how bloody the floor is (for footprints). */
export class BloodMap {
  private cell = 0.5;
  private map = new Map<string, number>();
  add(p: THREE.Vector3, amount: number): void {
    const k = this.key(p);
    this.map.set(k, Math.min(5, (this.map.get(k) ?? 0) + amount));
  }
  sample(p: THREE.Vector3): number {
    return this.map.get(this.key(p)) ?? 0;
  }
  private key(p: THREE.Vector3): string {
    return `${Math.floor(p.x / this.cell)},${Math.floor(p.y / 1.5)},${Math.floor(p.z / this.cell)}`;
  }
  clear(): void {
    this.map.clear();
  }
}

interface Fountain {
  char: Character;
  part: number;
  time: number;
  dur: number;
  rate: number;
  acc: number;
  /** local offset of stump in part box space */
  local: THREE.Vector3;
  dirLocal: THREE.Vector3;
}

interface PoolWatch {
  char: Character;
  t: number;
  done: boolean;
}

/** Spawns gore/impact effects in response to gameplay events. */
export class FX {
  readonly particles: Particles;
  readonly decals: Decals;
  readonly bloodMap = new BloodMap();
  private fountains: Fountain[] = [];
  private pools: PoolWatch[] = [];
  bloodSpilled = 0; // liters (for stats)
  goreScale = 1;

  constructor(scene: THREE.Scene, maxParticles: number, maxDecals: number) {
    this.particles = new Particles(maxParticles);
    this.decals = new Decals(maxDecals);
    scene.add(this.particles.group);
    scene.add(this.decals.mesh);
    this.particles.onStain = (pos, normal, size, color, onFloor, cell) => this.stain(pos, normal, size, color, onFloor, cell);

    events.on('hit', ({ target, hit, result }) => {
      if (result.blocked) {
        this.sparkBurst(hit.point, hit.dir.clone().negate(), result.parried ? 14 : 6, result.parried ? 0xfff0a0 : 0xffd080);
        return;
      }
      const dmg = result.damage;
      if (dmg <= 0) return;
      const sharp = hit.type === 'sharp' || hit.type === 'pierce';
      let amount = clamp(dmg / 10, 0.3, 4) * (sharp ? 1.6 : 1) * this.goreScale;
      if (result.part === P.HEAD) amount *= 1.3;
      // bruise-only early punches still spit a little blood
      const ch = target as Character;
      const partDmg = ch.partDamage ? ch.partDamage[result.part] : 50;
      if (hit.type === 'blunt' && partDmg < 12) amount *= 0.35;
      this.bloodSpray(hit.point, hit.dir, amount, sharp);
      if (result.part === P.HEAD && hit.type === 'blunt' && dmg > 9 && Math.random() < 0.18) this.teeth(hit.point, hit.dir);
      if (dmg > 14) this.mist(hit.point, 2 + Math.floor(dmg / 15));
    });

    events.on('carve', ({ removed, target, part, hit, color }) => {
      const ch = target as Character;
      const m = ch.model;
      m.updateMatrices();
      const mat = m.boxMatrix[part];
      const n = Math.min(removed.length, 60);
      const step = removed.length / n;
      for (let k = 0; k < n; k++) {
        const r = removed[Math.floor(k * step)];
        _v.set(r.x, r.y, r.z).applyMatrix4(mat);
        _v2.copy(hit.dir).multiplyScalar(rand(1.5, 4.5));
        randomUnitVector(_v3).multiplyScalar(rand(0.5, 2.5));
        _v2.add(_v3);
        _v2.y += rand(0.5, 2.5);
        const surf = r.surface && Math.random() < 0.5;
        const col = surf ? color : bloodHex();
        this.particles.spawn('chunk', _v, _v2, {
          size: m.voxels[part] ? m.voxels[part]!.vs.x * rand(0.7, 1.0) : 0.03,
          color: col,
          life: rand(14, 26),
          bounce: 0.25,
          spin: 14,
          gravity: 15,
        });
      }
      this.bloodSpray(hit.point, hit.dir, Math.min(4, removed.length / 6) * this.goreScale, false);
    });

    events.on('headExplode', ({ point, dir }) => {
      for (let i = 0; i < 70 * this.goreScale; i++) {
        randomInCone(_v.copy(dir).add(new THREE.Vector3(0, 0.6, 0)).normalize(), 1.2, _v2).multiplyScalar(rand(2, 9));
        this.particles.spawn('blood', point, _v2, { size: rand(0.02, 0.05), color: bloodHex(), life: 3, stain: true, stretch: 0.08, gravity: 15, drag: 0.6 });
      }
      this.mist(point, 8);
      this.bloodSpilled += 0.8;
    });

    events.on('sever', ({ target, part, point, dir }) => {
      const ch = target as Character;
      this.bloodSpray(point, dir, 3 * this.goreScale, true);
      this.mist(point, 4);
      // stump fountain on the parent part (or the severed part's attachment point)
      const parent = part === P.HEAD ? P.TORSO : part === P.UARM_L || part === P.UARM_R ? P.TORSO : part === P.LARM_L ? P.UARM_L : part === P.LARM_R ? P.UARM_R : part === P.THIGH_L || part === P.THIGH_R ? P.PELVIS : part === P.SHIN_L ? P.THIGH_L : P.THIGH_R;
      const rig = ch.model.rig;
      const local = rig.joint[part].clone().sub(rig.center[parent]);
      const dirLocal = rig.joint[part].clone().normalize();
      if (part === P.HEAD) dirLocal.set(0, 1, 0);
      this.fountains.push({ char: ch, part: parent, time: 0, dur: part === P.HEAD ? 5 : 3.5, rate: part === P.HEAD ? 70 : 40, acc: 0, local, dirLocal });
    });

    events.on('headExplode', ({ target }) => {
      const ch = target as Character;
      const rig = ch.model.rig;
      const local = rig.joint[P.HEAD].clone().sub(rig.center[P.TORSO]);
      this.fountains.push({ char: ch, part: P.TORSO, time: 0, dur: 4.5, rate: 60, acc: 0, local, dirLocal: new THREE.Vector3(0, 1, 0) });
    });

    events.on('bleed', ({ pos, amount }) => {
      const n = 1 + Math.floor(amount * 3);
      for (let i = 0; i < n; i++) {
        _v2.set(rand(-0.4, 0.4), rand(-0.5, 0.3), rand(-0.4, 0.4));
        _v.copy(pos).add(_v3.set(rand(-0.1, 0.1), rand(-0.15, 0.1), rand(-0.1, 0.1)));
        this.particles.spawn('blood', _v, _v2, { size: rand(0.018, 0.03), color: bloodHex(), life: 3, stain: true, gravity: 15 });
      }
    });

    events.on('ragdollImpact', ({ pos, strength, target }) => {
      const ch = target as Character;
      if (strength > 10) this.dust(pos, Math.min(6, strength / 8), 0x6a5a4a);
      if (ch.model.atlas.bloodiness > 0.05 || !ch.alive) {
        const n = Math.min(10, Math.floor(strength / 6));
        for (let i = 0; i < n; i++) {
          randomInCone(new THREE.Vector3(0, 1, 0), 1.3, _v2).multiplyScalar(rand(1, 3.5));
          this.particles.spawn('blood', pos, _v2, { size: rand(0.02, 0.04), color: bloodHex(), life: 2, stain: true, gravity: 15 });
        }
        if (strength > 18) {
          const hit = ctx.physics.raycast(_v.copy(pos).add(_v3.set(0, 0.3, 0)), DOWN, 1.2, QG.WORLD);
          if (hit) this.stain(hit.point, hit.normal, rand(0.35, 0.6), _c.set(bloodHex()), hit.normal.y > 0.7, DECAL.SPLAT + ((Math.random() * DECAL.SPLAT_COUNT) | 0));
        }
      }
    });

    events.on('death', ({ victim }) => {
      if (!victim.isPlayer) this.pools.push({ char: victim as Character, t: 0, done: false });
    });
  }

  /** Paint a blood decal and record floor blood. */
  stain(pos: THREE.Vector3, normal: THREE.Vector3, size: number, color: THREE.Color, onFloor: boolean, cell = -1): void {
    let c = cell;
    if (c < 0) c = size > 0.12 ? DECAL.SPLAT + ((Math.random() * DECAL.SPLAT_COUNT) | 0) : DECAL.DROP + ((Math.random() * DECAL.DROP_COUNT) | 0);
    this.decals.add(pos, normal, clamp(size, 0.05, 1.6), c, color);
    if (onFloor) this.bloodMap.add(pos, size * 2);
    this.bloodSpilled += size * size * 0.15;
  }

  bloodSpray(point: THREE.Vector3, dir: THREE.Vector3, amount: number, sharp: boolean): void {
    const n = Math.round(amount * (sharp ? 9 : 6.5));
    const d = _v3.copy(dir).normalize();
    for (let i = 0; i < n; i++) {
      // most go forward with the blow; a few spatter back
      const back = Math.random() < 0.18;
      randomInCone(back ? d.clone().negate() : d, sharp ? 0.55 : 0.9, _v2);
      _v2.multiplyScalar(rand(1.5, sharp ? 7 : 5.5));
      _v2.y += rand(0.5, 2.5);
      this.particles.spawn('blood', point, _v2, {
        size: rand(0.018, 0.046),
        color: bloodHex(),
        life: 2.5,
        stain: Math.random() < 0.7,
        stainScale: 1.35,
        stretch: 0.06,
        drag: 0.5,
        gravity: 15,
      });
    }
  }

  mist(point: THREE.Vector3, n: number): void {
    for (let i = 0; i < n; i++) {
      randomUnitVector(_v2).multiplyScalar(rand(0.2, 0.9));
      this.particles.spawn('mist', point, _v2, { size: rand(0.15, 0.3), sizeEnd: rand(0.5, 0.9), color: 0x8a0a0c, life: rand(0.35, 0.6), gravity: -0.2, drag: 3 });
    }
  }

  teeth(point: THREE.Vector3, dir: THREE.Vector3): void {
    const n = 1 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      randomInCone(dir, 0.8, _v2).multiplyScalar(rand(2, 4));
      _v2.y += 2;
      this.particles.spawn('tooth', point, _v2, { size: 0.018, color: 0xf2eee0, life: 20, bounce: 0.45, spin: 20 });
    }
  }

  sparkBurst(point: THREE.Vector3, dir: THREE.Vector3, n: number, color: number): void {
    for (let i = 0; i < n; i++) {
      randomInCone(dir, 1.0, _v2).multiplyScalar(rand(2, 6));
      this.particles.spawn('spark', point, _v2, { size: 0.012, color, life: rand(0.15, 0.35), gravity: 9, stretch: 0.25, drag: 1 });
    }
  }

  dust(point: THREE.Vector3, n: number, color: THREE.ColorRepresentation = 0x9a8a7a): void {
    for (let i = 0; i < n; i++) {
      randomUnitVector(_v2).multiplyScalar(rand(0.2, 0.9));
      _v2.y = Math.abs(_v2.y) * 0.6;
      this.particles.spawn('dust', point, _v2, { size: rand(0.12, 0.25), sizeEnd: rand(0.5, 0.9), color, life: rand(0.5, 1.1), gravity: -0.3, drag: 2.5 });
    }
  }

  debris(point: THREE.Vector3, dir: THREE.Vector3, n: number, color: THREE.ColorRepresentation, kind: 'splinter' | 'glass' | 'debris', size = 0.03, speed = 3): void {
    for (let i = 0; i < n; i++) {
      randomInCone(dir, 1.1, _v2).multiplyScalar(rand(0.5, speed));
      _v2.y += rand(0.5, 2);
      this.particles.spawn(kind === 'glass' ? 'glass' : kind, point, _v2, {
        size: size * rand(0.6, 1.3),
        color,
        life: rand(8, 16),
        bounce: kind === 'glass' ? 0.3 : 0.35,
        spin: 18,
        stretch: kind === 'splinter' ? 1.5 : 0,
      });
    }
  }

  liquidSplash(point: THREE.Vector3, n: number, color: number): void {
    for (let i = 0; i < n; i++) {
      randomInCone(new THREE.Vector3(0, 1, 0), 1.2, _v2).multiplyScalar(rand(0.8, 3.2));
      this.particles.spawn('liquid', point, _v2, {
        size: rand(0.015, 0.03),
        color,
        life: 2,
        stain: true,
        stainColor: color,
        stainScale: 1.6,
        stainCell: DECAL.SPILL + ((Math.random() * DECAL.SPILL_COUNT) | 0),
        stretch: 0.05,
      });
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    // fountains from stumps
    for (let k = this.fountains.length - 1; k >= 0; k--) {
      const f = this.fountains[k];
      f.time += dt;
      if (f.time > f.dur || f.char.removed) {
        this.fountains.splice(k, 1);
        continue;
      }
      const m = f.char.model;
      m.updateMatrices();
      const mat = m.boxMatrix[f.part];
      f.acc += dt * f.rate * (1 - f.time / f.dur) * (0.6 + 0.4 * Math.abs(Math.sin(f.time * 9)));
      while (f.acc >= 1) {
        f.acc -= 1;
        _v.copy(f.local).applyMatrix4(mat);
        _v2.copy(f.dirLocal).transformDirection(mat);
        randomInCone(_v2, 0.35, _v3).multiplyScalar(rand(2.5, 5.5) * (1 - f.time / f.dur * 0.6));
        this.particles.spawn('blood', _v, _v3, { size: rand(0.02, 0.035), color: bloodHex(), life: 2.5, stain: true, stretch: 0.08, gravity: 15, drag: 0.4 });
      }
    }
    // growing blood pools under settled corpses
    for (let k = this.pools.length - 1; k >= 0; k--) {
      const pw = this.pools[k];
      pw.t += dt;
      const ch = pw.char;
      if (ch.removed) {
        this.pools.splice(k, 1);
        continue;
      }
      const r = ch.ragdoll;
      if (pw.t > 1.2 && r && r.restTime > 0.5) {
        ch.model.partCenter(P.TORSO, _v);
        const hit = ctx.physics.raycast(_v.add(_v3.set(0, 0.2, 0)), DOWN, 1.5, QG.WORLD);
        if (hit && hit.normal.y > 0.7) {
          const size = rand(1.1, 1.7) * this.goreScale;
          this.decals.add(hit.point, hit.normal, size, DECAL.POOL + ((Math.random() * DECAL.POOL_COUNT) | 0), _c.setRGB(0.42, 0.0, 0.01), Math.random() * 6.28, rand(5, 9));
          this.bloodMap.add(hit.point, 4);
          _v2.copy(hit.point).add(_v3.set(0.5, 0, 0));
          this.bloodMap.add(_v2, 3);
          _v2.copy(hit.point).add(_v3.set(-0.5, 0, 0));
          this.bloodMap.add(_v2, 3);
          _v2.copy(hit.point).add(_v3.set(0, 0, 0.5));
          this.bloodMap.add(_v2, 3);
          _v2.copy(hit.point).add(_v3.set(0, 0, -0.5));
          this.bloodMap.add(_v2, 3);
          this.bloodSpilled += 1.2;
        }
        this.pools.splice(k, 1);
      } else if (pw.t > 12) this.pools.splice(k, 1);
    }
    this.particles.update(dt, camera);
    this.decals.update(dt);
  }

  footprint(pos: THREE.Vector3, yaw: number, left: boolean, intensity: number): void {
    _c.setRGB(0.35 * intensity + 0.12, 0, 0.01);
    this.decals.add(_v.set(pos.x + Math.cos(yaw) * (left ? 0.09 : -0.09), pos.y + 0.003, pos.z - Math.sin(yaw) * (left ? 0.09 : -0.09)), new THREE.Vector3(0, 1, 0), 0.32, left ? DECAL.FOOT_L : DECAL.FOOT_R, _c, -yaw + Math.PI);
  }

  clear(): void {
    this.particles.clear();
    this.decals.clear();
    this.bloodMap.clear();
    this.fountains.length = 0;
    this.pools.length = 0;
    this.bloodSpilled = 0;
  }
}
