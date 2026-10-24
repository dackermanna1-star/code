// Moving obstacles and machines. Their colliders are kinematic: poses and
// surface velocities are set every physics substep, so contact with them
// transfers momentum realistically to soft bodies (launches, crushing,
// shredding).

import * as THREE from 'three';
import { Obstacle, register, eulerMat, mul3 } from './base.ts';
import { Collider, CF_SPIKES, CF_SHARP, CF_CUTTER, CF_TRIGGER, CF_CONVEYOR } from '../../sim/colliders.ts';
import { Surface } from '../../sim/surfaces.ts';
import { MAT, texBox, mesh, wedgeGeometry, signBoard } from './assets.ts';
import { smoothstep } from '../../sim/math.ts';

const _lr = new Float64Array(9);
/** Grinder roller: local Y (cylinder axis) -> local X. */
const ROLLER_ROT = new Float64Array([0, -1, 0, 1, 0, 0, 0, 0, 1]);

/** Base for obstacles with kinematic parts. */
abstract class Machine extends Obstacle {
  private gateTimer = 0;
  private gateOpen = true;
  /** First collider of the set last posed; a rebuild makes new ones that need a pose. */
  private posedFor: Collider | null = null;

  protected override wantsSubsteps(): boolean {
    return true;
  }

  /**
   * True while no soft body is within `radius` (horizontally) of the machine,
   * so its per-substep collider updates can be skipped; rechecked every few
   * substeps. Idle colliders are held still. Only for machines whose motion
   * is a pure function of time, so they resume in the right pose.
   */
  protected idle(radius: number): boolean {
    if (this.posedFor !== this.kinematics[0]) {
      // freshly built colliders sit at the origin until posed once
      this.posedFor = this.kinematics[0] ?? null;
      this.gateTimer = 0;
      return false;
    }
    if (--this.gateTimer > 0) return !this.gateOpen;
    this.gateTimer = 8;
    const open = this.host.world.anyBodyNear(this.x, this.z, radius);
    if (!open && this.gateOpen) {
      for (const c of this.kinematics) {
        c.lin.fill(0);
        c.ang.fill(0);
      }
    }
    this.gateOpen = open;
    return !open;
  }

  /** Set kinematic collider pose from local transform and local velocities. */
  protected setKin(c: Collider, lx: number, ly: number, lz: number, localRot: ArrayLike<number> | null, lvx = 0, lvy = 0, lvz = 0, lwx = 0, lwy = 0, lwz = 0): void {
    const R = this.R;
    c.pos[0] = this.x + R[0] * lx + R[2] * lz;
    c.pos[1] = this.y + ly;
    c.pos[2] = this.z + R[6] * lx + R[8] * lz;
    if (localRot) mul3(R, localRot, c.rot);
    else c.rot.set(R);
    c.lin[0] = R[0] * lvx + R[2] * lvz;
    c.lin[1] = lvy;
    c.lin[2] = R[6] * lvx + R[8] * lvz;
    c.ang[0] = R[0] * lwx + R[2] * lwz;
    c.ang[1] = lwy;
    c.ang[2] = R[6] * lwx + R[8] * lwz;
  }
}

// ---------------------------------------------------------------------------
// Swinging mace

const SPIKE_DIRS: [number, number, number][] = (() => {
  const d: [number, number, number][] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399963;
    d.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return d;
})();

export class Mace extends Machine {
  readonly type = 'mace';
  private ball!: Collider;
  private arm!: Collider;
  private spikes: Collider[] = [];
  /** Rotation taking local Y to each spike's direction on the ball at rest. */
  private spikeRot: Float64Array[] = [];
  private spikeDir: [number, number, number][] = [];
  private swing = new THREE.Group();
  private pivotY = 0;
  private theta = 0;
  private lastWhoosh = 0;

  build(): void {
    const { L, r, amp } = this.params;
    this.pivotY = L + r + 0.25;
    const reach = L * Math.sin((amp * Math.PI) / 180) + r + 2.2;
    // gantry pillars (static)
    for (const s of [-1, 1]) {
      this.staticBox(s * reach, (this.pivotY + 1) / 2, 0, 0.45, (this.pivotY + 1) / 2, 0.45, { surface: Surface.METAL, tag: 'metal' });
      this.group.add(mesh(new THREE.BoxGeometry(0.9, this.pivotY + 1, 0.9), MAT.yellowSteel(), s * reach, (this.pivotY + 1) / 2, 0));
      this.group.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), MAT.concreteDark(), s * reach, 0.2, 0));
    }
    this.group.add(mesh(new THREE.BoxGeometry(reach * 2 + 0.9, 0.9, 0.9), MAT.yellowSteel(), 0, this.pivotY + 0.6, 0));
    this.group.add(mesh(new THREE.BoxGeometry(reach * 2, 0.2, 0.92), MAT.hazard(), 0, this.pivotY + 0.15, 0, false));
    // swinging parts
    this.ball = this.kinematicCollider(Collider.sphere(r), { surface: Surface.METAL, tag: 'mace', harshness: 2, friction: 0.5 });
    this.arm = this.kinematicCollider(Collider.capsule(0.18, L / 2 - r / 2), { surface: Surface.METAL, tag: 'mace' });
    this.spikes = [];
    this.spikeRot = [];
    this.spikeDir = [];
    const sl = r * 0.55;
    for (let i = 0; i < SPIKE_DIRS.length; i++) {
      const d = SPIKE_DIRS[i];
      if (d[1] > 0.75) continue; // no spikes where the arm joins
      this.spikes.push(this.kinematicCollider(Collider.capsule(0.07, sl / 2), { surface: Surface.METAL, flags: CF_SHARP, harshness: 3, tag: 'mace' }));
      const q = new THREE.Quaternion().setFromUnitVectors(_up, _dir.set(d[0], d[1], d[2]));
      const m = _m4.makeRotationFromQuaternion(q).elements;
      this.spikeRot.push(new Float64Array([m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]));
      this.spikeDir.push(d);
    }
    // visuals
    this.swing = new THREE.Group();
    this.swing.position.set(0, this.pivotY, 0);
    this.group.add(this.swing);
    const hub = mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 16), MAT.darkSteel());
    hub.rotation.x = Math.PI / 2;
    this.swing.add(hub);
    const chain = mesh(new THREE.CylinderGeometry(0.14, 0.14, L - r * 0.6, 10), MAT.darkSteel(), 0, -(L - r * 0.6) / 2, 0);
    this.swing.add(chain);
    for (let k = 0; k < Math.floor(L / 0.6); k++) {
      const link = mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), MAT.steel(), 0, -0.3 - k * 0.6, 0);
      link.rotation.y = k % 2 ? Math.PI / 2 : 0;
      this.swing.add(link);
    }
    const ballM = mesh(new THREE.IcosahedronGeometry(r, 3), MAT.rust(), 0, -L, 0);
    this.swing.add(ballM);
    const cone = new THREE.ConeGeometry(0.14, sl * 1.4, 8);
    for (const d of SPIKE_DIRS) {
      if (d[1] > 0.75) continue;
      const sp = mesh(cone, MAT.spike(), d[0] * (r + sl * 0.55), -L + d[1] * (r + sl * 0.55), d[2] * (r + sl * 0.55));
      sp.userData.sharedGeo = true;
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]));
      this.swing.add(sp);
    }
    this.updatePose(this.host.world.time);
  }

  private angle(t: number): { th: number; om: number } {
    const { amp, period, phase } = this.params;
    const A = (amp * Math.PI) / 180;
    const w = (2 * Math.PI) / period;
    const ph = w * t + phase * 2 * Math.PI;
    return { th: A * Math.sin(ph), om: A * w * Math.cos(ph) };
  }

  private updatePose(t: number): void {
    const { L, r } = this.params;
    const { th, om } = this.angle(t);
    this.theta = th;
    const s = Math.sin(th), c = Math.cos(th);
    // rotation about local Z by th: maps -Y to (sin, -cos)
    const rz = _lr;
    rz[0] = c; rz[1] = -s; rz[2] = 0;
    rz[3] = s; rz[4] = c; rz[5] = 0;
    rz[6] = 0; rz[7] = 0; rz[8] = 1;
    const bx = L * s, by = this.pivotY - L * c;
    const vx = L * om * c, vy = L * om * s;
    this.setKin(this.ball, bx, by, 0, rz, vx, vy, 0, 0, 0, om);
    const am = (L - r) / 2;
    this.setKin(this.arm, am * s, this.pivotY - am * c, 0, rz, am * om * c, am * om * s, 0, 0, 0, om);
    const sl = r * 0.55;
    const dist = r + sl / 2;
    for (let k = 0; k < this.spikes.length; k++) {
      const d = this.spikeDir[k];
      // spike direction rotated with the swing
      const dx = c * d[0] - s * d[1], dy = s * d[0] + c * d[1], dz = d[2];
      const px = bx + dx * dist, py = by + dy * dist, pz = dz * dist;
      mul3(rz, this.spikeRot[k], _lr2);
      const rvx = -om * (py - this.pivotY), rvy = om * px;
      this.setKin(this.spikes[k], px, py, pz, _lr2, rvx, rvy, 0, 0, 0, om);
    }
  }

  override preSubstep(t: number): void {
    const { L, r } = this.params;
    if (this.enabled && !this.idle(L + r + 4)) this.updatePose(t);
  }

  override update(_dt: number, time: number): void {
    this.theta = this.angle(time).th;
    this.swing.rotation.z = this.theta;
    // whoosh at the bottom of the swing
    const { th, om } = this.angle(time);
    if (Math.abs(th) < 0.08 && Math.abs(om) > 0.5 && time - this.lastWhoosh > 0.5) {
      this.lastWhoosh = time;
      const p = this.toWorld(0, this.pivotY - this.params.L, 0);
      this.host.sound('whoosh', p.x, p.y, p.z, 0.8);
    }
    if (this.ball.lastContactFrame >= 0 && this.ball.contactSpeed > 3) {
      const p = this.ball.pos;
      this.host.sound('metalHit', p[0], p[1], p[2], Math.min(1, this.ball.contactSpeed / 15));
      this.ball.contactSpeed = 0;
      this.ball.lastContactFrame = -1;
    }
  }
}
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _lr2 = new Float64Array(9);
register({
  id: 'mace',
  name: 'Swinging Mace',
  category: 'Hazards',
  description: 'Giant spiked wrecking mace on a gantry. Swings across the road.',
  params: [
    { key: 'L', label: 'Arm length', min: 4, max: 20, step: 0.5, def: 10, unit: 'm' },
    { key: 'r', label: 'Ball radius', min: 0.5, max: 2.5, step: 0.1, def: 1.2, unit: 'm' },
    { key: 'amp', label: 'Swing angle', min: 10, max: 85, step: 1, def: 62, unit: '°' },
    { key: 'period', label: 'Period', min: 2, max: 12, step: 0.1, def: 5.5, unit: 's' },
    { key: 'phase', label: 'Phase', min: 0, max: 1, step: 0.05, def: 0 },
  ],
  create: (h, x, z, yaw, p) => new Mace(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Industrial shredder

export class Grinder extends Machine {
  readonly type = 'grinder';
  private rollers: Collider[] = [];
  private teeth: { c: Collider; roller: number; a: number; x: number }[] = [];
  private rollerMeshes: THREE.Group[] = [];
  private angleA = 0;
  private loop: ReturnType<typeof this.host.loopSound> = null;
  private H = 4.6;

  build(): void {
    const { w, speed, R } = this.params;
    const H = this.H;
    const gap = 0.32;
    const halfZ = R * 2 + gap / 2 + 0.25;
    const wall = 0.5;
    const rampL = 18;
    // hopper walls
    for (const s of [-1, 1]) {
      this.staticBox(s * (w / 2 + wall / 2), H / 2, 0, wall / 2, H / 2, halfZ + wall, { tag: 'concrete', surface: Surface.CONCRETE });
      this.group.add(mesh(texBox(wall, H, halfZ * 2 + wall * 2, 2), MAT.concrete(), s * (w / 2 + wall / 2), H / 2, 0));
    }
    // back wall (+Z) taller as a backstop
    this.staticBox(0, (H + 2) / 2, halfZ + wall / 2, w / 2 + wall, (H + 2) / 2, wall / 2, { tag: 'concrete', surface: Surface.CONCRETE });
    this.group.add(mesh(texBox(w + wall * 2, H + 2, wall, 2), MAT.concrete(), 0, (H + 2) / 2, halfZ + wall / 2));
    // front wall with deck on top (-Z)
    this.staticBox(0, H / 2, -halfZ - wall / 2, w / 2 + wall, H / 2, wall / 2, { tag: 'concrete', surface: Surface.CONCRETE });
    this.group.add(mesh(texBox(w + wall * 2, H, wall, 2), MAT.concrete(), 0, H / 2, -halfZ - wall / 2));
    // approach ramp
    const deckL = 4;
    this.staticBox(0, H / 2, -halfZ - wall - deckL / 2, w / 2, H / 2, deckL / 2, { tag: 'concrete', surface: Surface.CONCRETE });
    this.group.add(mesh(texBox(w, H, deckL, 2), MAT.concreteDark(), 0, H / 2, -halfZ - wall - deckL / 2));
    const ramp = Collider.wedge(w, rampL, H);
    this.staticCollider(ramp, 0, 0, -halfZ - wall - deckL - rampL, { tag: 'concrete', surface: Surface.CONCRETE });
    this.group.add(mesh(wedgeGeometry(w, rampL, H), MAT.concrete(), 0, 0, -halfZ - wall - deckL - rampL));
    // hazard rim
    this.group.add(mesh(new THREE.BoxGeometry(w + 1, 0.1, 0.5), MAT.hazard(), 0, H + 0.05, -halfZ - wall / 2, false));
    // rollers along X
    const rot = new Float64Array([0, -1, 0, 1, 0, 0, 0, 0, 1]); // local Y -> X
    const yR = H - R - 0.45;
    this.rollers = [];
    this.teeth = [];
    this.rollerMeshes = [];
    const nRows = Math.max(3, Math.round(w / 0.8));
    for (let k = 0; k < 2; k++) {
      const zc = (k === 0 ? -1 : 1) * (R + gap / 2);
      const c = this.kinematicCollider(Collider.cylinder(R, w / 2), { surface: Surface.METAL, tag: 'grinder', friction: 1.2, harshness: 2 });
      c.rot.set(rot);
      this.rollers.push(c);
      for (let row = 0; row < nRows; row++) {
        for (let a = 0; a < 6; a++) {
          const tc = this.kinematicCollider(Collider.capsule(0.09, 0.14), { surface: Surface.METAL, flags: CF_SHARP | CF_CUTTER, tag: 'grinder', harshness: 4, friction: 1.0 });
          this.teeth.push({ c: tc, roller: k, a: (a / 6) * Math.PI * 2 + (row % 2) * 0.5, x: -w / 2 + (row + 0.5) * (w / nRows) });
        }
      }
      const g = new THREE.Group();
      g.position.set(0, yR, zc);
      const cyl = mesh(new THREE.CylinderGeometry(R, R, w, 28), MAT.darkSteel());
      cyl.rotation.z = Math.PI / 2;
      g.add(cyl);
      const toothGeo = new THREE.ConeGeometry(0.13, 0.42, 6);
      for (const t of this.teeth.filter((tt) => tt.roller === k)) {
        const tm = mesh(toothGeo, MAT.spike(), t.x, Math.cos(t.a) * (R + 0.15), Math.sin(t.a) * (R + 0.15));
        tm.userData.sharedGeo = true;
        tm.rotation.x = t.a;
        g.add(tm);
      }
      this.group.add(g);
      this.rollerMeshes.push(g);
      // bearings
      for (const s of [-1, 1]) {
        this.group.add(mesh(new THREE.BoxGeometry(0.6, 1.0, 1.0), MAT.yellowSteel(), s * (w / 2 + 0.1), yR, zc));
      }
    }
    (this as unknown as { yR: number }).yR = yR;
    (this as unknown as { zC: number }).zC = R + gap / 2;
    // motor housing + sign
    this.group.add(mesh(new THREE.BoxGeometry(1.4, 1.4, 2.2), MAT.yellowSteel(), w / 2 + 1.3, yR, 0));
    const sign = signBoard('SHREDDER', 'Do not enter', 5, 2, 0.5, '#ff5a5a');
    sign.position.set(-w / 2 - 3.5, 0, -halfZ - wall - deckL - rampL * 0.6);
    this.group.add(sign);
    void speed;
    this.loop?.stop();
    this.loop = this.host.loopSound('grinder');
  }

  override preSubstep(t: number): void {
    if (!this.enabled) return;
    const { speed, R, w: width } = this.params;
    this.angleA = speed * t;
    if (this.idle(Math.hypot(width / 2 + 1, R * 2 + 1) + 4)) return;
    const yR = (this as unknown as { yR: number }).yR;
    const zC = (this as unknown as { zC: number }).zC;
    for (let k = 0; k < 2; k++) {
      const dir = k === 0 ? 1 : -1; // left roller top moves +Z
      const z = (k === 0 ? -1 : 1) * zC;
      this.setKin(this.rollers[k], 0, yR, z, ROLLER_ROT, 0, 0, 0, dir * speed, 0, 0);
    }
    const d = R + 0.12;
    for (const tooth of this.teeth) {
      const dir = tooth.roller === 0 ? 1 : -1;
      const a = tooth.a + dir * this.angleA;
      const z0 = (tooth.roller === 0 ? -1 : 1) * zC;
      const cy = Math.cos(a), sz = Math.sin(a);
      const px = tooth.x, py = yR + cy * d, pz = z0 + sz * d;
      // tooth axis radial in YZ: local Y -> (0, cos a, sin a), a rotation about X by a
      _lr[0] = 1; _lr[1] = 0; _lr[2] = 0;
      _lr[3] = 0; _lr[4] = cy; _lr[5] = -sz;
      _lr[6] = 0; _lr[7] = sz; _lr[8] = cy;
      // velocity of tooth center: omega x r, omega = (dir*speed,0,0)
      const w = dir * speed;
      this.setKin(tooth.c, px, py, pz, _lr, 0, -w * sz * d, w * cy * d, w, 0, 0);
    }
  }

  override update(_dt: number, time: number): void {
    const { speed } = this.params;
    this.angleA = speed * time;
    if (this.rollerMeshes.length === 2) {
      this.rollerMeshes[0].rotation.x = this.angleA;
      this.rollerMeshes[1].rotation.x = -this.angleA;
    }
    const p = this.toWorld(0, (this as unknown as { yR: number }).yR, 0);
    let contact = 0;
    for (const r of this.rollers) if (r.lastContactFrame >= 0) {
      contact = Math.max(contact, r.contactSpeed + 2);
      r.lastContactFrame = -1;
    }
    for (const t of this.teeth) if (t.c.lastContactFrame >= 0) {
      contact = Math.max(contact, 4);
      t.c.lastContactFrame = -1;
    }
    this.loop?.set(p.x, p.y, p.z, 0.35 + Math.min(0.65, contact * 0.12), 0.8 + speed * 0.08 + (contact > 0 ? -0.15 : 0));
    if (contact > 0 && Math.random() < 0.5) {
      this.host.emitSparks(p.x + (Math.random() - 0.5) * this.params.w, p.y + 0.3, p.z, 0, 1, 0, 6, 6);
      if (Math.random() < 0.15) this.host.sound('crunch', p.x, p.y, p.z, 0.8);
    }
  }

  override dispose(): void {
    this.loop?.stop();
    super.dispose();
  }
}
register({
  id: 'grinder',
  name: 'Shredder',
  category: 'Machines',
  description: 'Raised hopper with counter-rotating toothed rollers. Drive in, come out in pieces.',
  params: [
    { key: 'w', label: 'Width', min: 3, max: 10, step: 0.5, def: 5.5, unit: 'm' },
    { key: 'speed', label: 'Roller speed', min: 0.5, max: 8, step: 0.1, def: 2.6, unit: 'rad/s' },
    { key: 'R', label: 'Roller radius', min: 0.5, max: 1.4, step: 0.05, def: 0.85, unit: 'm' },
  ],
  create: (h, x, z, yaw, p) => new Grinder(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Hydraulic press

function pressProfile(s: number): number {
  // returns 0 (up) .. 1 (down) over a cycle s in [0,1)
  if (s < 0.3) return 0;
  if (s < 0.5) return smoothstep(0.3, 0.5, s);
  if (s < 0.7) return 1;
  return 1 - smoothstep(0.7, 1.0, s);
}

export class Crusher extends Machine {
  readonly type = 'crusher';
  private plate!: Collider;
  private plateMesh!: THREE.Group;
  private rod!: THREE.Mesh;
  private yTop = 0;
  private yBot = 0;
  private cur = 0;
  private lastDown = false;
  private offset = 0;

  build(): void {
    const { w, d, h, period, phase } = this.params;
    const t = 0.7;
    this.yTop = h;
    this.yBot = 0.22 + t / 2;
    this.offset = phase * period;
    const colH = h + t + 1.5;
    // columns
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.staticBox(sx * (w / 2 + 0.5), colH / 2, sz * (d / 2 - 0.4), 0.4, colH / 2, 0.4, { surface: Surface.METAL, tag: 'metal' });
        this.group.add(mesh(new THREE.BoxGeometry(0.8, colH, 0.8), MAT.yellowSteel(), sx * (w / 2 + 0.5), colH / 2, sz * (d / 2 - 0.4)));
      }
    }
    // top beam
    this.group.add(mesh(new THREE.BoxGeometry(w + 2, 1.0, d), MAT.yellowSteel(), 0, colH + 0.5, 0));
    // hydraulic cylinder
    this.group.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 18), MAT.darkSteel(), 0, colH + 0.1, 0));
    this.rod = mesh(new THREE.CylinderGeometry(0.28, 0.28, 1, 14), MAT.steel());
    this.group.add(this.rod);
    // floor plate
    this.staticBox(0, 0.06, 0, w / 2 + 0.3, 0.06, d / 2 + 0.3, { surface: Surface.METAL, tag: 'metal' });
    this.group.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.12, d + 0.6), MAT.plate(), 0, 0.06, 0));
    // press plate (kinematic)
    this.plate = this.kinematicCollider(Collider.box(w / 2, t / 2, d / 2 - 0.9), { surface: Surface.METAL, tag: 'press', friction: 0.8 });
    this.plateMesh = new THREE.Group();
    this.plateMesh.add(mesh(new THREE.BoxGeometry(w, t, d - 1.8), MAT.darkSteel()));
    const stripe = mesh(new THREE.BoxGeometry(w + 0.02, 0.22, d - 1.78), MAT.hazard(), 0, 0, 0, false);
    this.plateMesh.add(stripe);
    this.group.add(this.plateMesh);
    // warning lights
    for (const sx of [-1, 1]) this.group.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), MAT.glow(0xff3a1a), sx * (w / 2 + 0.5), colH + 0.15, -d / 2 + 0.4, false));
    this.preSubstep(this.host.world.time, 0);
  }

  private plateY(t: number): number {
    const { period } = this.params;
    const s = (((t + this.offset) % period) + period) % period / period;
    const p = pressProfile(s);
    return this.yTop + (this.yBot - this.yTop) * p;
  }

  override preSubstep(t: number, _dt: number): void {
    if (!this.enabled) return;
    const y = this.plateY(t);
    const vy = (this.plateY(t + 0.001) - this.plateY(t - 0.001)) / 0.002;
    this.cur = y;
    this.setKin(this.plate, 0, y, 0, null, 0, vy, 0);
  }

  override update(_dt: number, time: number): void {
    this.plateMesh.position.set(0, this.cur, 0);
    const colTop = this.params.h + 0.7 + 1.5;
    const len = Math.max(0.1, colTop - this.cur - 0.35);
    this.rod.scale.set(1, len, 1);
    this.rod.position.set(0, this.cur + 0.35 + len / 2, 0);
    const down = this.cur < this.yTop - 0.3;
    if (down !== this.lastDown) {
      const p = this.toWorld(0, this.cur, 0);
      this.host.sound(down ? 'hydraulic' : 'hiss', p.x, p.y, p.z, 0.8);
      this.lastDown = down;
    }
    if (this.plate.lastContactFrame >= 0) {
      if (Math.random() < 0.2) {
        const p = this.toWorld(0, this.cur, 0);
        this.host.sound('crunch', p.x, p.y, p.z, 0.6);
      }
      this.plate.lastContactFrame = -1;
    }
    void time;
  }
}
register({
  id: 'crusher',
  name: 'Hydraulic Press',
  category: 'Machines',
  description: 'Industrial press that slams down to 22 cm above the floor.',
  params: [
    { key: 'w', label: 'Width', min: 2, max: 10, step: 0.5, def: 5, unit: 'm' },
    { key: 'd', label: 'Depth', min: 3, max: 12, step: 0.5, def: 7, unit: 'm' },
    { key: 'h', label: 'Raised height', min: 2, max: 8, step: 0.1, def: 3.6, unit: 'm' },
    { key: 'period', label: 'Cycle time', min: 3, max: 20, step: 0.5, def: 7, unit: 's' },
    { key: 'phase', label: 'Phase', min: 0, max: 1, step: 0.05, def: 0 },
  ],
  create: (h, x, z, yaw, p) => new Crusher(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Side crusher: two walls closing across the lane (along local X)

export class SideCrusher extends Machine {
  readonly type = 'sideCrusher';
  private walls: Collider[] = [];
  private meshes: THREE.Object3D[] = [];
  private open = 0;
  private minGap = 0.5;

  build(): void {
    const { len, h, open } = this.params;
    this.open = open;
    this.walls = [];
    this.meshes = [];
    for (const s of [-1, 1]) {
      const c = this.kinematicCollider(Collider.box(0.4, h / 2, len / 2), { surface: Surface.METAL, tag: 'press', friction: 0.7 });
      this.walls.push(c);
      const g = new THREE.Group();
      g.add(mesh(texBox(0.8, h, len, 2), MAT.plate()));
      g.add(mesh(new THREE.BoxGeometry(0.82, 0.3, len + 0.02), MAT.hazard(), 0, h / 2 - 0.3, 0, false));
      this.group.add(g);
      this.meshes.push(g);
      // housings
      this.staticBox(s * (open / 2 + 2.2), h / 2, 0, 1.0, h / 2 + 0.2, len / 2 + 0.3, { surface: Surface.CONCRETE, tag: 'concrete' });
      this.group.add(mesh(texBox(2.0, h + 0.4, len + 0.6, 2), MAT.concreteDark(), s * (open / 2 + 2.2), (h + 0.4) / 2, 0));
    }
    this.preSubstep(this.host.world.time, 0);
  }

  private gap(t: number): number {
    const { period, open } = this.params;
    const s = ((t % period) + period) % period / period;
    return open - (open - this.minGap) * pressProfile(s);
  }

  override preSubstep(t: number, _dt: number): void {
    if (!this.enabled) return;
    const { h } = this.params;
    const g = this.gap(t);
    const v = (this.gap(t + 0.001) - this.gap(t - 0.001)) / 0.002;
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? -1 : 1;
      this.setKin(this.walls[k], s * (g / 2 + 0.4), h / 2, 0, null, s * v / 2, 0, 0);
    }
    this.open = g;
  }

  override update(): void {
    const { h } = this.params;
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? -1 : 1;
      this.meshes[k].position.set(s * (this.open / 2 + 0.4), h / 2, 0);
    }
    for (const w of this.walls) {
      if (w.lastContactFrame >= 0 && Math.random() < 0.15) {
        this.host.sound('crunch', w.pos[0], w.pos[1], w.pos[2], 0.6);
      }
      w.lastContactFrame = -1;
    }
  }
}
register({
  id: 'sideCrusher',
  name: 'Side Crusher',
  category: 'Machines',
  description: 'Two steel walls that close in from the sides.',
  params: [
    { key: 'len', label: 'Length', min: 2, max: 12, step: 0.5, def: 6, unit: 'm' },
    { key: 'h', label: 'Height', min: 1, max: 4, step: 0.1, def: 2.2, unit: 'm' },
    { key: 'open', label: 'Open gap', min: 3, max: 10, step: 0.1, def: 6, unit: 'm' },
    { key: 'period', label: 'Cycle time', min: 3, max: 20, step: 0.5, def: 8, unit: 's' },
  ],
  create: (h, x, z, yaw, p) => new SideCrusher(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Sliding wall (oscillates across the lane)

export class SlidingWall extends Machine {
  readonly type = 'slider';
  private wall!: Collider;
  private m!: THREE.Object3D;
  private pos = 0;
  build(): void {
    const { w, h, travel } = this.params;
    this.wall = this.kinematicCollider(Collider.box(w / 2, h / 2, 0.4), { surface: Surface.CONCRETE, tag: 'concrete' });
    const g = new THREE.Group();
    g.add(mesh(texBox(w, h, 0.8, 2), MAT.concrete()));
    g.add(mesh(new THREE.BoxGeometry(w + 0.02, 0.3, 0.82), MAT.hazard(), 0, h / 2 - 0.2, 0, false));
    this.m = g;
    this.group.add(g);
    // rail
    this.group.add(mesh(new THREE.BoxGeometry(travel * 2 + w, 0.08, 0.6), MAT.darkSteel(), 0, 0.04, 0, false));
    this.preSubstep(this.host.world.time);
  }
  private slideX(t: number): number {
    const { travel, period, phase } = this.params;
    return travel * Math.sin((2 * Math.PI * t) / period + phase * Math.PI * 2);
  }
  override preSubstep(t: number): void {
    if (!this.enabled) return;
    const { h } = this.params;
    const x = this.slideX(t);
    const v = (this.slideX(t + 0.001) - this.slideX(t - 0.001)) / 0.002;
    this.pos = x;
    this.setKin(this.wall, x, h / 2, 0, null, v, 0, 0);
  }
  override update(): void {
    this.m.position.set(this.pos, this.params.h / 2, 0);
  }
}
register({
  id: 'slider',
  name: 'Sliding Wall',
  category: 'Machines',
  description: 'Concrete wall gliding back and forth across the road.',
  params: [
    { key: 'w', label: 'Width', min: 2, max: 16, step: 0.5, def: 6, unit: 'm' },
    { key: 'h', label: 'Height', min: 0.5, max: 5, step: 0.1, def: 1.6, unit: 'm' },
    { key: 'travel', label: 'Travel', min: 1, max: 15, step: 0.5, def: 6, unit: 'm' },
    { key: 'period', label: 'Period', min: 1, max: 15, step: 0.1, def: 4, unit: 's' },
    { key: 'phase', label: 'Phase', min: 0, max: 1, step: 0.05, def: 0 },
  ],
  create: (h, x, z, yaw, p) => new SlidingWall(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Rotating sweeper arm

export class Sweeper extends Machine {
  readonly type = 'sweeper';
  private arm!: Collider;
  private armMesh!: THREE.Group;
  private a = 0;
  build(): void {
    const { L, speed } = this.params;
    this.staticCollider(Collider.cylinder(0.6, 0.9), 0, 0.9, 0, { surface: Surface.METAL, tag: 'metal' });
    this.group.add(mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.8, 18), MAT.yellowSteel(), 0, 0.9, 0));
    this.arm = this.kinematicCollider(Collider.box(L / 2, 0.35, 0.3), { surface: Surface.METAL, tag: 'metal', friction: 0.6 });
    this.armMesh = new THREE.Group();
    this.armMesh.position.y = 1.0;
    this.armMesh.add(mesh(new THREE.BoxGeometry(L, 0.7, 0.6), MAT.redSteel()));
    this.armMesh.add(mesh(new THREE.BoxGeometry(L, 0.2, 0.62), MAT.hazard(), 0, 0.1, 0, false));
    this.group.add(this.armMesh);
    void speed;
  }
  override preSubstep(t: number): void {
    if (!this.enabled) return;
    const { speed, L } = this.params;
    this.a = speed * t;
    if (this.idle(L / 2 + 4)) return;
    const c = Math.cos(this.a), s = Math.sin(this.a);
    const rot = _lr;
    rot[0] = c; rot[1] = 0; rot[2] = s;
    rot[3] = 0; rot[4] = 1; rot[5] = 0;
    rot[6] = -s; rot[7] = 0; rot[8] = c;
    // arm centered at the hub, extends both sides
    this.setKin(this.arm, 0, 1.0, 0, rot, 0, 0, 0, 0, speed, 0);
  }
  override update(_dt: number, time: number): void {
    this.a = this.params.speed * time;
    this.armMesh.rotation.y = this.a;
    if (this.arm.lastContactFrame >= 0 && this.arm.contactSpeed > 2) {
      this.host.sound('metalHit', this.arm.pos[0], this.arm.pos[1], this.arm.pos[2], 0.7);
      this.arm.lastContactFrame = -1;
      this.arm.contactSpeed = 0;
    }
  }
}
register({
  id: 'sweeper',
  name: 'Sweeper Arm',
  category: 'Machines',
  description: 'Rotating steel beam that bats cars aside.',
  params: [
    { key: 'L', label: 'Arm length', min: 4, max: 24, step: 0.5, def: 12, unit: 'm' },
    { key: 'speed', label: 'Speed', min: 0.2, max: 4, step: 0.1, def: 1.2, unit: 'rad/s' },
  ],
  create: (h, x, z, yaw, p) => new Sweeper(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Pneumatic ram from the side

export class Piston extends Machine {
  readonly type = 'piston';
  private head!: Collider;
  private headMesh!: THREE.Group;
  private ext = 0;
  private prevFire = false;
  build(): void {
    const { stroke } = this.params;
    // housing at local -X, ram extends toward +X
    this.staticBox(-1.4, 0.8, 0, 1.2, 0.8, 1.0, { surface: Surface.METAL, tag: 'metal' });
    this.group.add(mesh(new THREE.BoxGeometry(2.4, 1.6, 2.0), MAT.yellowSteel(), -1.4, 0.8, 0));
    this.head = this.kinematicCollider(Collider.box(0.3, 0.6, 0.9), { surface: Surface.METAL, tag: 'piston', friction: 0.6 });
    this.headMesh = new THREE.Group();
    this.headMesh.add(mesh(new THREE.BoxGeometry(0.6, 1.2, 1.8), MAT.darkSteel()));
    this.headMesh.add(mesh(new THREE.BoxGeometry(0.62, 0.25, 1.82), MAT.hazard(), 0, 0.3, 0, false));
    const rod = mesh(new THREE.CylinderGeometry(0.16, 0.16, stroke + 1, 12), MAT.steel(), -(stroke + 1) / 2, 0, 0);
    rod.rotation.z = Math.PI / 2;
    this.headMesh.add(rod);
    this.group.add(this.headMesh);
  }
  private e(t: number): number {
    const { period, phase } = this.params;
    const s = (((t / period + phase) % 1) + 1) % 1;
    if (s < 0.6) return 0;
    if (s < 0.65) return smoothstep(0.6, 0.65, s);
    if (s < 0.75) return 1;
    return 1 - smoothstep(0.75, 1, s);
  }
  override preSubstep(t: number): void {
    if (!this.enabled) return;
    const { stroke } = this.params;
    const e = this.e(t);
    const v = ((this.e(t + 0.0005) - this.e(t - 0.0005)) / 0.001) * stroke;
    this.ext = e;
    this.setKin(this.head, 0.3 + e * stroke, 0.8, 0, null, v, 0, 0);
  }
  override update(): void {
    const { stroke } = this.params;
    this.headMesh.position.set(0.3 + this.ext * stroke, 0.8, 0);
    const firing = this.ext > 0.05;
    if (firing && !this.prevFire) {
      const p = this.toWorld(0, 0.8, 0);
      this.host.sound('piston', p.x, p.y, p.z, 1);
    }
    this.prevFire = firing;
  }
}
register({
  id: 'piston',
  name: 'Side Ram',
  category: 'Machines',
  description: 'Pneumatic ram that punches out from the roadside.',
  params: [
    { key: 'stroke', label: 'Stroke', min: 1, max: 8, step: 0.5, def: 4, unit: 'm' },
    { key: 'period', label: 'Cycle time', min: 1.5, max: 12, step: 0.5, def: 4, unit: 's' },
    { key: 'phase', label: 'Phase', min: 0, max: 1, step: 0.05, def: 0 },
  ],
  create: (h, x, z, yaw, p) => new Piston(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Rising bollards

export class Bollards extends Machine {
  readonly type = 'bollards';
  private posts: Collider[] = [];
  private meshes: THREE.Object3D[] = [];
  private h = 0;
  build(): void {
    const { n, spacing } = this.params;
    this.posts = [];
    this.meshes = [];
    const geo = new THREE.CylinderGeometry(0.16, 0.16, 1.0, 14);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * spacing;
      this.posts.push(this.kinematicCollider(Collider.capsule(0.16, 0.42), { surface: Surface.METAL, tag: 'metal' }));
      const g = new THREE.Group();
      const m = mesh(geo, MAT.steel());
      m.userData.sharedGeo = i > 0;
      g.add(m);
      g.add(mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.15, 14), MAT.red(), 0, 0.35, 0, false));
      g.position.x = x;
      this.group.add(g);
      this.meshes.push(g);
      this.group.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 14), MAT.darkSteel(), x, 0.015, 0, false));
    }
  }
  private height(t: number): number {
    const { period, phase } = this.params;
    const s = (((t / period + phase) % 1) + 1) % 1;
    if (s < 0.4) return 0;
    if (s < 0.5) return smoothstep(0.4, 0.5, s);
    if (s < 0.85) return 1;
    return 1 - smoothstep(0.85, 1.0, s);
  }
  override preSubstep(t: number): void {
    if (!this.enabled) return;
    const { n, spacing } = this.params;
    const e = this.height(t);
    const v = (this.height(t + 0.001) - this.height(t - 0.001)) / 0.002;
    this.h = e;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * spacing;
      this.setKin(this.posts[i], x, -0.55 + e * 1.0, 0, null, 0, v, 0);
    }
  }
  override update(): void {
    for (const m of this.meshes) m.position.y = -0.5 + this.h * 1.0;
  }
}
register({
  id: 'bollards',
  name: 'Rising Bollards',
  category: 'Machines',
  description: 'Steel posts that shoot up out of the road.',
  params: [
    { key: 'n', label: 'Count', min: 1, max: 20, step: 1, def: 7 },
    { key: 'spacing', label: 'Spacing', min: 0.8, max: 4, step: 0.1, def: 1.6, unit: 'm' },
    { key: 'period', label: 'Cycle time', min: 2, max: 15, step: 0.5, def: 5, unit: 's' },
    { key: 'phase', label: 'Phase', min: 0, max: 1, step: 0.05, def: 0 },
  ],
  create: (h, x, z, yaw, p) => new Bollards(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// See-saw: plank on a pivot, tips under the car's weight (1-DOF dynamics)

export class SeeSaw extends Machine {
  readonly type = 'seesaw';
  private plank!: Collider;
  private plankMesh!: THREE.Group;
  private th = 0;
  private om = 0;
  build(): void {
    const { L, w } = this.params;
    const ph = 1.4;
    this.staticBox(0, ph / 2 - 0.1, 0, w / 2 - 0.3, ph / 2 - 0.1, 0.4, { surface: Surface.METAL, tag: 'metal' });
    this.group.add(mesh(new THREE.BoxGeometry(w - 0.6, ph - 0.2, 0.8), MAT.yellowSteel(), 0, ph / 2 - 0.1, 0));
    this.plank = this.kinematicCollider(Collider.box(w / 2, 0.15, L / 2), { surface: Surface.WOOD, tag: 'wood', friction: 0.9 });
    this.plank.receivesImpulse = true;
    this.plankMesh = new THREE.Group();
    this.plankMesh.position.set(0, ph, 0);
    this.plankMesh.add(mesh(texBox(w, 0.3, L, 2), MAT.plate()));
    this.group.add(this.plankMesh);
    this.th = -this.maxA();
    this.om = 0;
  }
  private maxA(): number {
    const { L } = this.params;
    return Math.asin(Math.min(0.95, (1.4 - 0.15) / (L / 2)));
  }
  override preSubstep(_t: number, dt: number): void {
    if (!this.enabled) return;
    const { L, mass } = this.params;
    const I = (mass * L * L) / 12;
    // contact impulses → angular velocity about local X
    const ai = this.plank.angImpulse;
    const ax = this.R[0], az = this.R[6];
    const lx = ai[0] * ax + ai[2] * az;
    this.om += lx / I;
    ai[0] = ai[1] = ai[2] = 0;
    this.plank.impulse.fill(0);
    this.om *= 1 - 0.4 * dt;
    this.th += this.om * dt;
    const m = this.maxA();
    if (this.th > m) {
      this.th = m;
      if (this.om > 0) this.om = -this.om * 0.2;
    } else if (this.th < -m) {
      this.th = -m;
      if (this.om < 0) this.om = -this.om * 0.2;
    }
    const ph = 1.4;
    const rot = new Float64Array(9);
    eulerMat(this.th, 0, 0, rot);
    // pivot in world
    const p = this.toWorld(0, ph, 0);
    this.plank.pivot[0] = p.x;
    this.plank.pivot[1] = p.y;
    this.plank.pivot[2] = p.z;
    this.setKin(this.plank, 0, ph, 0, rot, 0, 0, 0, this.om, 0, 0);
    void L;
  }
  override update(): void {
    this.plankMesh.rotation.x = this.th;
  }
}
register({
  id: 'seesaw',
  name: 'See-Saw',
  category: 'Ramps & Stunts',
  description: 'Steel plank on a pivot. Tips over as you drive across.',
  params: [
    { key: 'L', label: 'Length', min: 6, max: 24, step: 0.5, def: 14, unit: 'm' },
    { key: 'w', label: 'Width', min: 2, max: 8, step: 0.5, def: 4, unit: 'm' },
    { key: 'mass', label: 'Plank mass', min: 100, max: 5000, step: 50, def: 900, unit: 'kg' },
  ],
  create: (h, x, z, yaw, p) => new SeeSaw(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Conveyor belt (static box with moving surface)

export class Conveyor extends Obstacle {
  readonly type = 'conveyor';
  private belt!: THREE.Mesh;
  build(): void {
    const { L, w, speed } = this.params;
    const c = this.staticBox(0, 0.25, 0, w / 2, 0.25, L / 2, { surface: Surface.RUBBER, friction: 1.0, flags: CF_CONVEYOR, tag: 'rubber' });
    c.surfVel[2] = speed;
    const t = (MAT.rubber() as THREE.MeshStandardMaterial).clone();
    this.belt = mesh(new THREE.BoxGeometry(w, 0.5, L), t, 0, 0.25, 0);
    this.group.add(this.belt);
    for (const s of [-1, 1]) this.group.add(mesh(new THREE.BoxGeometry(0.2, 0.7, L), MAT.yellowSteel(), s * (w / 2 + 0.1), 0.35, 0));
    // rollers visual stripes
    const n = Math.floor(L / 1.0);
    for (let i = 0; i < n; i++) {
      this.group.add(mesh(new THREE.BoxGeometry(w, 0.02, 0.08), MAT.steel(), 0, 0.51, -L / 2 + (i + 0.5) * (L / n), false));
    }
  }
}
register({
  id: 'conveyor',
  name: 'Conveyor Belt',
  category: 'Machines',
  description: 'Moving belt that carries anything on it forward.',
  params: [
    { key: 'L', label: 'Length', min: 4, max: 40, step: 1, def: 16, unit: 'm' },
    { key: 'w', label: 'Width', min: 2, max: 8, step: 0.5, def: 4, unit: 'm' },
    { key: 'speed', label: 'Speed', min: -10, max: 10, step: 0.5, def: 3, unit: 'm/s' },
  ],
  create: (h, x, z, yaw, p) => new Conveyor(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Launch pad: fires upward when a car sits on it

export class Launcher extends Machine {
  readonly type = 'launcher';
  private plate!: Collider;
  private trigger!: Collider;
  private plateMesh!: THREE.Object3D;
  private state: 'idle' | 'armed' | 'fire' | 'return' = 'idle';
  private timer = 0;
  private lift = 0;
  private vel = 0;
  build(): void {
    const { w } = this.params;
    this.plate = this.kinematicCollider(Collider.box(w / 2, 0.15, w / 2), { surface: Surface.METAL, tag: 'metal' });
    this.trigger = Collider.box(w / 2 - 0.2, 0.5, w / 2 - 0.2);
    this.trigger.flags |= CF_TRIGGER;
    this.trigger.kinematic = true;
    this.host.world.addKinematic(this.trigger);
    this.kinematics.push(this.trigger);
    this.poseCollider(this.trigger, 0, 0.6, 0);
    this.plateMesh = mesh(new THREE.BoxGeometry(w, 0.3, w), MAT.hazard());
    this.group.add(this.plateMesh);
    this.group.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.1, w + 0.6), MAT.darkSteel(), 0, 0.02, 0, false));
  }
  override preSubstep(_t: number, dt: number): void {
    if (!this.enabled) return;
    const { power } = this.params;
    if (this.state === 'fire') {
      this.vel = power;
      this.lift += this.vel * dt;
      if (this.lift >= 1.2) {
        this.lift = 1.2;
        this.state = 'return';
        this.vel = 0;
      }
    } else if (this.state === 'return') {
      this.vel = -1.0;
      this.lift += this.vel * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.vel = 0;
        this.state = 'idle';
      }
    }
    this.setKin(this.plate, 0, 0.0 + this.lift, 0, null, 0, this.vel, 0);
  }
  override update(dt: number, _time: number): void {
    this.plateMesh.position.y = this.lift;
    const frame = this.trigger.lastContactFrame;
    if (this.state === 'idle' && frame >= 0) {
      this.state = 'armed';
      this.timer = 0.8;
      const p = this.toWorld(0, 0.5, 0);
      this.host.sound('beep', p.x, p.y, p.z, 0.8);
    }
    this.trigger.lastContactFrame = -1;
    if (this.state === 'armed') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'fire';
        const p = this.toWorld(0, 0.5, 0);
        this.host.sound('piston', p.x, p.y, p.z, 1.2);
        this.host.emitDust(p.x, p.y, p.z, 30);
      }
    }
  }
}
register({
  id: 'launcher',
  name: 'Launch Pad',
  category: 'Ramps & Stunts',
  description: 'Park on it. It fires you into the sky.',
  params: [
    { key: 'w', label: 'Size', min: 3, max: 10, step: 0.5, def: 5.5, unit: 'm' },
    { key: 'power', label: 'Launch speed', min: 4, max: 40, step: 1, def: 18, unit: 'm/s' },
  ],
  create: (h, x, z, yaw, p) => new Launcher(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Drop gantry: releases a heavy object when a vehicle crosses the trigger

const DROP_KINDS = ['block', 'beam', 'container', 'car', 'barrels'];

export class DropGantry extends Machine {
  readonly type = 'dropper';
  private trigger!: Collider;
  private hang!: THREE.Group;
  private dropped: unknown[] = [];
  private cooldown = 0;
  private armed = true;
  build(): void {
    const { span, h, kind } = this.params;
    const colH = h + 1.2;
    for (const s of [-1, 1]) {
      this.staticBox(s * span / 2, colH / 2, 0, 0.4, colH / 2, 0.4, { surface: Surface.METAL, tag: 'metal' });
      this.group.add(mesh(new THREE.BoxGeometry(0.8, colH, 0.8), MAT.redSteel(), s * span / 2, colH / 2, 0));
    }
    this.group.add(mesh(new THREE.BoxGeometry(span + 0.8, 0.8, 0.8), MAT.redSteel(), 0, colH + 0.4, 0));
    this.group.add(mesh(new THREE.BoxGeometry(span, 0.2, 0.82), MAT.hazard(), 0, colH, 0, false));
    // trigger zone across the road, 14 m before the gantry (cars approach from -Z)
    this.trigger = Collider.box(span / 2 - 0.5, 1.0, 1.5);
    this.trigger.flags |= CF_TRIGGER;
    this.trigger.kinematic = true;
    this.host.world.addKinematic(this.trigger);
    this.kinematics.push(this.trigger);
    this.poseCollider(this.trigger, 0, 0.9, -this.params.lead);
    // trigger line on the road
    this.group.add(mesh(new THREE.BoxGeometry(span - 1, 0.02, 0.4), MAT.glow(0xff2a2a), 0, 0.03, -this.params.lead, false));
    // hanging object visual
    this.hang = new THREE.Group();
    const k = DROP_KINDS[Math.round(kind)] ?? 'block';
    let ho: THREE.Object3D;
    switch (k) {
      case 'beam': ho = mesh(new THREE.BoxGeometry(0.4, 0.5, 7), MAT.darkSteel()); break;
      case 'container': ho = mesh(texBox(2.44, 2.6, 6.1, 1.2), MAT.corrugated('#1e5aa8')); break;
      case 'car': ho = mesh(new THREE.BoxGeometry(1.8, 1.4, 4.4), MAT.rust()); break;
      case 'barrels': ho = mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 12), MAT.blue()); break;
      default: ho = mesh(texBox(2.2, 1.4, 1.4, 1), MAT.concrete());
    }
    this.hang.add(ho);
    for (const s of [-0.5, 0.5]) {
      const cable = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), MAT.darkSteel(), s, 1.3, 0, false);
      this.hang.add(cable);
    }
    this.hang.position.set(0, h, 0);
    this.group.add(this.hang);
  }
  override preSubstep(): void {}
  override update(dt: number): void {
    const { cooldown, h, kind } = this.params;
    if (this.trigger.lastContactFrame >= 0 && this.armed) {
      this.armed = false;
      this.cooldown = cooldown;
      this.hang.visible = false;
      const p = this.toWorld(0, h, 0);
      const k = DROP_KINDS[Math.round(kind)] ?? 'block';
      this.host.sound('release', p.x, p.y, p.z, 1);
      if (k === 'barrels') {
        for (let i = 0; i < 6; i++) this.dropped.push(this.host.spawnProp('barrel', p.x + (Math.random() - 0.5) * 2.5, p.y + i * 0.4, p.z + (Math.random() - 0.5) * 1.5, Math.random() * 3));
      } else {
        this.dropped.push(this.host.spawnProp(k === 'block' ? 'block' : k, p.x, p.y, p.z, this.yaw + (k === 'beam' ? Math.PI / 2 : 0)));
      }
    }
    this.trigger.lastContactFrame = -1;
    if (!this.armed) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        for (const d of this.dropped) this.host.removeProp(d);
        this.dropped = [];
        this.armed = true;
        this.hang.visible = true;
      }
    }
  }
  override reset(): void {
    for (const d of this.dropped) this.host.removeProp(d);
    this.dropped = [];
    this.armed = true;
    this.hang.visible = true;
  }
  override dispose(): void {
    this.reset();
    super.dispose();
  }
}
register({
  id: 'dropper',
  name: 'Drop Gantry',
  category: 'Hazards',
  description: 'Drops a heavy object onto the road when you cross the red line.',
  params: [
    { key: 'span', label: 'Span', min: 6, max: 20, step: 0.5, def: 10, unit: 'm' },
    { key: 'h', label: 'Drop height', min: 4, max: 30, step: 0.5, def: 10, unit: 'm' },
    { key: 'kind', label: 'Object (0 block, 1 beam, 2 container, 3 car, 4 barrels)', min: 0, max: 4, step: 1, def: 0 },
    { key: 'lead', label: 'Trigger distance', min: 2, max: 40, step: 1, def: 14, unit: 'm' },
    { key: 'cooldown', label: 'Reload time', min: 3, max: 60, step: 1, def: 12, unit: 's' },
  ],
  create: (h, x, z, yaw, p) => new DropGantry(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Spiked rotating drum (vertical, roadside)

export class SpikeDrum extends Machine {
  readonly type = 'spikeDrum';
  private drum!: Collider;
  private spikes: { c: Collider; a: number; y: number }[] = [];
  private g!: THREE.Group;
  private a = 0;
  build(): void {
    const { r, h } = this.params;
    this.drum = this.kinematicCollider(Collider.cylinder(r, h / 2), { surface: Surface.METAL, tag: 'grinder', friction: 0.9 });
    this.spikes = [];
    this.g = new THREE.Group();
    this.g.add(mesh(new THREE.CylinderGeometry(r, r, h, 24), MAT.rust(), 0, h / 2, 0));
    const cone = new THREE.ConeGeometry(0.09, 0.5, 6);
    const rows = Math.max(2, Math.floor(h / 0.45));
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + (j % 2) * 0.4;
        const y = 0.3 + j * ((h - 0.6) / Math.max(1, rows - 1));
        this.spikes.push({ c: this.kinematicCollider(Collider.capsule(0.06, 0.18), { surface: Surface.METAL, flags: CF_SHARP | CF_SPIKES, harshness: 3, tag: 'spikes' }), a, y });
        const sm = mesh(cone, MAT.spike(), Math.cos(a) * (r + 0.22), y, Math.sin(a) * (r + 0.22));
        sm.userData.sharedGeo = true;
        sm.rotation.z = -Math.PI / 2;
        sm.rotation.y = -a;
        this.g.add(sm);
      }
    }
    this.group.add(this.g);
  }
  override preSubstep(t: number): void {
    if (!this.enabled) return;
    const { r, h, speed } = this.params;
    this.a = speed * t;
    if (this.idle(r + 0.6 + 4)) return;
    this.setKin(this.drum, 0, h / 2, 0, null, 0, 0, 0, 0, speed, 0);
    for (const s of this.spikes) {
      const a = s.a + this.a;
      const d = r + 0.22;
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      // capsule axis radial: rotate local Y to (cos a, 0, sin a)
      const c = Math.cos(a), si = Math.sin(a);
      // orthonormal basis with local Y radial: X'=(0,1,0), Y'=(c,0,si), Z'=X'xY'=(si,0,-c)
      const rot = _lr;
      rot[0] = 0; rot[1] = c; rot[2] = si;
      rot[3] = 1; rot[4] = 0; rot[5] = 0;
      rot[6] = 0; rot[7] = si; rot[8] = -c;
      this.setKin(s.c, px, s.y, pz, rot, -speed * pz, 0, speed * px, 0, speed, 0);
    }
  }
  override update(_dt: number, time: number): void {
    this.a = this.params.speed * time;
    this.g.rotation.y = -this.a;
  }
}
register({
  id: 'spikeDrum',
  name: 'Spike Drum',
  category: 'Hazards',
  description: 'Spinning vertical drum covered in spikes.',
  params: [
    { key: 'r', label: 'Radius', min: 0.4, max: 2, step: 0.1, def: 0.9, unit: 'm' },
    { key: 'h', label: 'Height', min: 1, max: 4, step: 0.1, def: 2.2, unit: 'm' },
    { key: 'speed', label: 'Spin', min: -6, max: 6, step: 0.1, def: 2.5, unit: 'rad/s' },
  ],
  create: (h, x, z, yaw, p) => new SpikeDrum(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Wrecking ball: free pendulum that a winch pulls back and releases

export class WreckingBall extends Machine {
  readonly type = 'wreckingBall';
  private ball!: Collider;
  private g!: THREE.Group;
  private th = 0;
  private om = 0;
  private state: 'winch' | 'free' = 'winch';
  private timer = 0;
  private pivotY = 0;
  build(): void {
    const { L, r } = this.params;
    this.pivotY = L + r + 0.4;
    // crane tower and jib (static)
    this.staticBox(-L - 3, (this.pivotY + 2) / 2, 0, 0.8, (this.pivotY + 2) / 2, 0.8, { surface: Surface.METAL, tag: 'metal' });
    this.group.add(mesh(new THREE.BoxGeometry(1.6, this.pivotY + 2, 1.6), MAT.yellowSteel(), -L - 3, (this.pivotY + 2) / 2, 0));
    this.group.add(mesh(new THREE.BoxGeometry(L + 4, 0.8, 0.8), MAT.yellowSteel(), -(L + 3) / 2 + 0.5, this.pivotY + 0.4, 0));
    this.ball = this.kinematicCollider(Collider.sphere(r), { surface: Surface.METAL, tag: 'mace', friction: 0.4 });
    this.ball.receivesImpulse = true;
    this.g = new THREE.Group();
    this.g.position.set(0, this.pivotY, 0);
    this.g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, L, 6), MAT.darkSteel(), 0, -L / 2, 0));
    this.g.add(mesh(new THREE.SphereGeometry(r, 24, 16), MAT.darkSteel(), 0, -L, 0));
    this.group.add(this.g);
    this.th = -1.0;
    this.om = 0;
    this.state = 'winch';
    this.timer = 2;
  }
  override preSubstep(_t: number, dt: number): void {
    if (!this.enabled) return;
    const { L, mass } = this.params;
    const g = 9.81;
    // contact impulses (swing plane: local X-Y, axis local Z)
    const ai = this.ball.angImpulse;
    const azx = this.R[2], azz = this.R[8];
    const lz = ai[0] * azx + ai[2] * azz;
    ai[0] = ai[1] = ai[2] = 0;
    this.ball.impulse.fill(0);
    const I = mass * L * L;
    if (this.state === 'free') {
      this.om += lz / I;
      this.om += (-g / L) * Math.sin(this.th) * dt;
      this.om *= 1 - 0.02 * dt;
    } else {
      // winch pulls back toward -1.1 rad slowly
      this.om = (-1.15 - this.th) * 0.6;
    }
    this.th += this.om * dt;
    const s = Math.sin(this.th), c = Math.cos(this.th);
    const p = this.toWorld(0, this.pivotY, 0);
    this.ball.pivot[0] = p.x;
    this.ball.pivot[1] = p.y;
    this.ball.pivot[2] = p.z;
    this.setKin(this.ball, L * s, this.pivotY - L * c, 0, null, L * this.om * c, L * this.om * s, 0, 0, 0, this.om);
  }
  override update(dt: number): void {
    this.g.rotation.z = this.th;
    this.timer -= dt;
    if (this.state === 'winch' && this.timer <= 0 && Math.abs(this.th + 1.15) < 0.05) {
      this.state = 'free';
      this.timer = this.params.period;
      const p = this.toWorld(0, this.pivotY, 0);
      this.host.sound('release', p.x, p.y, p.z, 0.8);
    } else if (this.state === 'free' && this.timer <= 0) {
      this.state = 'winch';
      this.timer = 3;
    }
    if (this.ball.lastContactFrame >= 0 && this.ball.contactSpeed > 2) {
      this.host.sound('metalHit', this.ball.pos[0], this.ball.pos[1], this.ball.pos[2], 1);
      this.ball.contactSpeed = 0;
    }
    this.ball.lastContactFrame = -1;
  }
}
register({
  id: 'wreckingBall',
  name: 'Wrecking Ball',
  category: 'Hazards',
  description: 'Crane-hung wrecking ball released on a timer. Physically pushed by what it hits.',
  params: [
    { key: 'L', label: 'Cable length', min: 4, max: 20, step: 0.5, def: 11, unit: 'm' },
    { key: 'r', label: 'Ball radius', min: 0.5, max: 2, step: 0.1, def: 1.1, unit: 'm' },
    { key: 'mass', label: 'Mass', min: 500, max: 20000, step: 100, def: 6000, unit: 'kg' },
    { key: 'period', label: 'Swing time', min: 4, max: 30, step: 1, def: 12, unit: 's' },
  ],
  create: (h, x, z, yaw, p) => new WreckingBall(h, x, z, yaw, p),
});

void CF_SPIKES;
