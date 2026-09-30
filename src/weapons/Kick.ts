import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, easeInOutCubic, easeOutCubic, lerp } from '../core/math';
import { P } from '../zombies/skeleton';
import type { Zombie } from '../zombies/Zombie';
import { C, chamferBox, gunMat } from './ModelBuilder';
import { solveIK } from './Viewmodel';
import type { Viewmodel } from './Viewmodel';

const DUR = 0.56;
const HIT_T = 0.24;
const COOLDOWN = 0.72;
const REACH = 2.05;
const CONE = Math.cos((55 * Math.PI) / 180);
const THIGH = 0.5;
const SHIN = 0.5;

const PANTS = 0x5d5c4e;
const PANTS_D = 0x46463a;
const BOOT = 0x4a3526;
const SOLE = 0x262220;

// foot path in camera space (the camera dips during the kick so the boot shows)
const HIP = new THREE.Vector3(0.12, -0.78, 0.2);
const K_REST = new THREE.Vector3(0.16, -1.15, 0.05);
const K_CHAMBER = new THREE.Vector3(0.1, -0.62, -0.24);
const K_STRIKE = new THREE.Vector3(0.02, -0.26, -0.62);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();

function segment(len: number, w: number, color: number, cuff?: number) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(chamferBox(w, w, len, 0.012), gunMat(color, 0, 'fabric'));
  m.position.z = -len / 2;
  g.add(m);
  if (cuff) {
    const c = new THREE.Mesh(chamferBox(w * 1.08, w * 1.08, 0.05, 0.008), gunMat(cuff, 0, 'fabric'));
    c.position.z = -len + 0.03;
    g.add(c);
  }
  return g;
}

/**
 * Front kick on V: a trouser leg and boot thrust up into the lower screen.
 * Healthy zombies get shoved back and staggered; hurt ones tend to go down.
 */
export class Kick {
  private t = -1;
  private cd = 0;
  private hitDone = false;
  private readonly thigh = segment(THIGH, 0.15, PANTS);
  private readonly shin = segment(SHIN, 0.13, PANTS, PANTS_D);
  private readonly boot = new THREE.Group();

  constructor(scene: THREE.Scene) {
    // boot: origin at the ankle, toes along -Z, sole on -Y
    const add = (size: [number, number, number], pos: [number, number, number], color: number) => {
      const m = new THREE.Mesh(chamferBox(...size), gunMat(color, 0, color === SOLE || color === 0x4a403a ? 'rubber' : 'leather'));
      m.position.set(...pos);
      this.boot.add(m);
    };
    add([0.13, 0.16, 0.14], [0, -0.02, 0.0], BOOT); // ankle/heel
    add([0.125, 0.09, 0.2], [0, -0.07, -0.13], BOOT); // vamp
    add([0.12, 0.05, 0.07], [0, -0.055, -0.245], BOOT); // toe cap
    add([0.14, 0.035, 0.36], [0, -0.125, -0.09], SOLE); // sole
    add([0.03, 0.02, 0.12], [0, -0.02, -0.09], C.TAN); // laces
    for (let i = 0; i < 4; i++) add([0.145, 0.012, 0.03], [0, -0.148, -0.22 + i * 0.09], 0x4a403a); // tread lugs
    for (const o of [this.thigh, this.shin, this.boot]) {
      o.visible = false;
      o.traverse((c) => ((c as THREE.Mesh).isMesh ? (c.renderOrder = 1) : null));
      scene.add(o);
    }
  }

  get active() {
    return this.t >= 0;
  }

  tryStart() {
    if (this.t >= 0 || this.cd > 0 || !G.player.alive) return false;
    this.t = 0;
    this.cd = COOLDOWN;
    this.hitDone = false;
    G.audio?.play('kickSwing', { volume: 0.7, pitchVar: 0.08 });
    G.player.addRecoil(-0.07, 0.01, 6); // dip the view toward the boot
    return true;
  }

  /** Advances the kick and layers its pose onto the viewmodel. */
  update(dt: number, vm: Viewmodel) {
    this.cd = Math.max(0, this.cd - dt);
    if (this.t < 0) {
      this.thigh.visible = this.shin.visible = this.boot.visible = false;
      return;
    }
    this.t += dt;
    const t = this.t;
    if (t >= DUR) {
      this.t = -1;
      this.thigh.visible = this.shin.visible = this.boot.visible = false;
      return;
    }
    // foot path: chamber, snap out, hold, retract
    let ext: number;
    if (t < 0.13) _foot.copy(K_REST).lerp(K_CHAMBER, easeOutCubic(t / 0.13)), (ext = 0);
    else if (t < HIT_T) _foot.copy(K_CHAMBER).lerp(K_STRIKE, easeOutCubic((t - 0.13) / (HIT_T - 0.13))), (ext = (t - 0.13) / (HIT_T - 0.13));
    else if (t < 0.32) _foot.copy(K_STRIKE), (ext = 1);
    else _foot.copy(K_STRIKE).lerp(K_REST, easeInOutCubic((t - 0.32) / (DUR - 0.32))), (ext = 1 - (t - 0.32) / (DUR - 0.32));
    _pole.set(0.1, 0.6, -1).normalize(); // knee points up and forward
    solveIK(HIP, _foot, THIGH, SHIN, _pole, _knee);
    this.place(this.thigh, HIP, _knee);
    this.place(this.shin, _knee, _foot);
    // boot turns from toes-forward (chamber) to sole-forward (strike)
    const shinDir = _a.subVectors(_foot, _knee).normalize();
    const toe = _b.set(0, 0.25, -1).normalize().lerp(_fwd.set(0, 1, -0.15).normalize(), clamp(ext, 0, 1)).normalize();
    toe.addScaledVector(shinDir, -toe.dot(shinDir)).normalize();
    this.boot.position.copy(_foot);
    _m.lookAt(_fwd.copy(_foot).addScaledVector(toe, 1), _foot, shinDir.clone().negate());
    this.boot.quaternion.setFromRotationMatrix(_m);
    this.thigh.visible = this.shin.visible = this.boot.visible = true;

    // body leans back into the kick: the gun rides up and away
    const lean = Math.sin(clamp(t / DUR, 0, 1) * Math.PI);
    vm.animPos.y += lean * 0.035;
    vm.animPos.x += lean * 0.03;
    vm.animRot.x += lean * 0.12;
    vm.animRot.z -= lean * 0.18;

    if (!this.hitDone && t >= HIT_T) {
      this.hitDone = true;
      this.impact();
    }
  }

  private place(o: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
    o.position.copy(from);
    _m.lookAt(from, to, _up);
    o.quaternion.setFromRotationMatrix(_m);
    const len = from.distanceTo(to);
    o.scale.set(1, 1, len / (o === this.thigh ? THIGH : SHIN));
  }

  private impact() {
    const pl = G.player;
    const aim = pl.getAim(new THREE.Vector3());
    const fx = aim.x, fz = aim.z;
    const fl = Math.hypot(fx, fz) || 1;
    const dirX = fx / fl, dirZ = fz / fl;
    const near: Zombie[] = [];
    G.zombies.queryRadius(pl.pos.x + dirX * 1.1, pl.pos.z + dirZ * 1.1, REACH, near);
    const hits: { z: Zombie; d: number }[] = [];
    for (const z of near) {
      if (!z.alive || z.state === 'down') continue;
      const dx = z.x - pl.pos.x, dz = z.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > REACH + z.type.body.radius * z.scale) continue;
      if (d > 0.3 && (dx * dirX + dz * dirZ) / d < CONE) continue;
      hits.push({ z, d });
    }
    hits.sort((a, b) => a.d - b.d);
    if (hits.length === 0) return;
    G.audio?.play('kickHit', { volume: 1, pitchVar: 0.06 });
    pl.addTrauma(0.22);
    for (const { z } of hits.slice(0, 2)) this.kickZombie(z, dirX, dirZ);
  }

  private kickZombie(z: Zombie, dirX: number, dirZ: number) {
    const t = z.type;
    const heavy = t.id === 'brute' || t.id === 'boss';
    const cx = z.x - dirX * 0.2, cy = z.y + (z.crawling ? 0.35 : 0.95) * z.scale, cz = z.z - dirZ * 0.2;
    const h = {
      damage: 2, part: z.crawling ? P.Head : P.Torso, x: cx, y: cy, z: cz, dx: dirX, dy: 0.15, dz: dirZ,
      stopping: heavy ? 40 : 150, pen: 0, kind: 'melee' as const, weapon: 'kick', noBlood: true, noWound: true, premult: true,
    };
    const killed = G.zombies.damage(z, h);
    G.fx?.dust?.emit?.(cx, cy, cz, dirX, 0.4, dirZ, 0.5, 0.18, 0.5, 0.45, 0.42, 0.38, 0.35, 0.45, 0.42, 0.38, 0, 1.2, -0.02);
    if (killed || !z.alive) return;
    // stop the swing that was coming
    if (z.state === 'attack') {
      z.state = 'walk';
    }
    z.attackCd = Math.max(z.attackCd, heavy ? 0.3 : 0.9);
    const push = (heavy ? 1.2 : 5.5) * (1 - t.knockResist * 0.6);
    z.knockX += dirX * push;
    z.knockZ += dirZ * push;
    // hurt zombies go down much more easily
    const hurt = 1 - clamp(z.hp / z.maxHp, 0, 1);
    const p = heavy ? 0 : clamp((0.18 + hurt * 0.75) * (1 - t.knockResist), 0, 0.92);
    if (Math.random() < p) G.zombies.knockdown(z, { ...h, stopping: 260 }, 1);
  }
}

void lerp;
