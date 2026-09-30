import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, damp, easeInOutCubic, easeOutCubic } from '../core/math';
import type { Viewmodel } from './Viewmodel';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _raised = new THREE.Vector3();
const _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/**
 * Hold T: the free hand leaves the gun and flips off the horde. The gun
 * stays up one-handed (it still fires); aiming, reloading and switching wait.
 */
export class Emote {
  /** Raise amount 0..1. */
  w = 0;
  private t = 0;
  private readonly anchor = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.anchor.userData.pose = 'bird';
    scene.add(this.anchor);
  }

  get active() {
    return this.w > 0.01;
  }

  /** Runs after the weapon animation so it can take over the free hand. */
  update(dt: number, vm: Viewmodel, want: boolean, rightHand: boolean) {
    this.w = want ? Math.min(1, this.w + dt / 0.2) : Math.max(0, this.w - dt / 0.16);
    this.t = want ? this.t + dt : 0;
    if (this.w <= 0 || !vm.model) return;
    const s = rightHand ? 1 : -1;
    const e = easeOutCubic(this.w);
    // the free hand's home is the support anchor (bows swap hands)
    vm.anchorPos('support', _v);
    vm.model.mb.anchors.support.getWorldQuaternion(_q);
    // a jab toward the horde once it's up, then a slight tremble while held
    const jab = this.t < 0.45 ? Math.sin((this.t / 0.45) * Math.PI) : 0;
    const tremble = Math.sin(this.t * 31) * 0.0012 + Math.sin(this.t * 17) * 0.0009;
    _raised.set(s * 0.1 + tremble, -0.08 + jab * 0.012, -0.34 - jab * 0.035);
    // back of the hand toward the horde, palm and curled fingers toward you
    _q2.setFromEuler(_e.set(-0.1 - jab * 0.12, s * 0.14, -s * 0.12)).multiply(_flip);
    this.anchor.position.copy(_v).lerp(_raised, e);
    this.anchor.quaternion.copy(_q).slerp(_q2, e);
    this.anchor.updateMatrixWorld();
    if (rightHand) {
      vm.rhObj = this.anchor;
      vm.rhTarget = null;
    } else {
      vm.lhObj = this.anchor;
      vm.lhTarget = null;
      vm.leftProp.clear();
    }
    // held one-handed, the gun sags and cants a little
    vm.animRot.z += e * 0.08 * -s;
    vm.animPos.y -= e * 0.015;
  }
}

type PeePhase = 'off' | 'unzip' | 'ready' | 'zip';

/**
 * K unzips (weapon away, hands down), hold the trigger to go, K again to zip
 * up. The stream arcs from the hips along the view, weakens as the bladder
 * empties and pools into puddles (see fx/Liquid).
 */
export class Pee {
  phase: PeePhase = 'off';
  private t = 0;
  /** Hands down / weapon away blend 0..1. */
  k = 0;
  pressure = 0;
  /** 0..1; drains while going, refills over about a minute. */
  bladder = 1;
  private acc = 0;
  private flowT = 0;

  get on() {
    return this.phase !== 'off';
  }

  toggle() {
    if (this.phase === 'off') {
      this.phase = 'unzip';
      this.t = 0;
      G.audio?.play('zipDown', { volume: 0.8 });
    } else if (this.phase !== 'zip') {
      this.phase = 'zip';
      this.t = 0;
      G.audio?.play('zipUp', { volume: 0.8 });
    }
  }

  reset() {
    this.phase = 'off';
    this.k = 0;
    this.pressure = 0;
    this.silence();
  }

  silence() {
    G.audio?.loop('peeGround', 0);
    G.audio?.loop('peeWater', 0);
  }

  update(dt: number, vm: Viewmodel, trigger: boolean) {
    if (this.phase === 'off') {
      this.bladder = Math.min(1, this.bladder + dt / 55);
      this.pressure = 0;
      this.flowT = 0;
      this.k = 0;
      this.audio(0);
      return;
    }
    this.t += dt;
    const pl = G.player;
    if (this.phase === 'unzip') {
      this.k = easeInOutCubic(Math.min(1, this.t / 0.45));
      // glance down so the stream is in view
      if (pl.pitch > -0.42) pl.pitch = damp(pl.pitch, -0.42, 5, dt);
      if (this.t >= 0.45) this.phase = 'ready';
    } else if (this.phase === 'zip') {
      this.k = 1 - easeInOutCubic(Math.min(1, this.t / 0.4));
      if (this.t >= 0.4) {
        this.phase = 'off';
        this.k = 0;
      }
    } else this.k = 1;

    const flowing = this.phase === 'ready' && trigger && this.bladder > 0.01;
    this.pressure = damp(this.pressure, flowing ? 1 : 0, flowing ? 6 : 9, dt);
    if (flowing) this.flowT += dt;
    // pressure falls off as the bladder runs dry; a little natural pulsing
    const strength = this.pressure * Math.min(1, 0.25 + this.bladder * 1.6) * (1 + 0.05 * Math.sin(this.flowT * 9.3) + 0.035 * Math.sin(this.flowT * 23.7));
    if (strength > 0.03 && pl.alive) {
      this.bladder = Math.max(0, this.bladder - (dt * this.pressure) / 24);
      const cam = G.camera.position;
      const fx = -Math.sin(pl.yaw);
      const fz = -Math.cos(pl.yaw);
      const ox = cam.x + fx * 0.17;
      const oy = cam.y - 0.7;
      const oz = cam.z + fz * 0.17;
      const el = clamp(pl.pitch * 0.6 + 0.28 + Math.sin(this.flowT * 1.7) * 0.02, -1.1, 0.95);
      const yaw = pl.yaw + Math.sin(this.flowT * 1.3) * 0.015;
      const speed = 0.7 + 2.8 * strength;
      const rate = strength > 0.25 ? 95 : 45; // a weak flow breaks into drips
      const jit = 0.012 + (1 - strength) * 0.05;
      this.acc += rate * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        const e2 = el + (Math.random() - 0.5) * jit;
        const y2 = yaw + (Math.random() - 0.5) * jit;
        const sp = speed * (1 + (Math.random() - 0.5) * 0.04);
        const c = Math.cos(e2);
        const vx = -Math.sin(y2) * c * sp + pl.vel.x;
        const vy = Math.sin(e2) * sp;
        const vz = -Math.cos(y2) * c * sp + pl.vel.z;
        // spread this frame's drops along the jet instead of stacking them
        const lead = this.acc / rate;
        G.liquid.emit(ox + vx * lead, oy + vy * lead, oz + vz * lead, vx, vy, vz, 0.0085 * (0.7 + 0.3 * strength));
      }
    } else this.acc = 0;
    this.audio(strength);

    // viewmodel: weapon lowered away, both hands down at the belt
    if (this.k > 0) {
      vm.lower = Math.max(vm.lower, this.k);
      if (this.k > 0.7) vm.hideWeapon = true;
      const shake = strength > 0.05 ? Math.sin(G.time * 40) * 0.0008 : 0;
      const g = vm.anchorPos('grip', new THREE.Vector3()).lerp(_v.set(0.045, -0.19 + shake, -0.3), this.k);
      const s = vm.anchorPos('support', new THREE.Vector3()).lerp(_v.set(-0.042, -0.195 + shake, -0.29), this.k);
      vm.rhTarget = g;
      vm.lhTarget = s;
      vm.lhObj = null;
      vm.rhObj = null;
      vm.leftProp.clear();
      vm.rightProp.clear();
    }
  }

  private audio(strength: number) {
    const L = G.liquid;
    if (!L) return;
    const f = Math.min(1, L.landRate / 60);
    G.audio?.loop('peeWater', f * L.wetFrac * 0.75, 0.9 + strength * 0.2);
    G.audio?.loop('peeGround', f * (1 - L.wetFrac) * 0.6, 0.85 + strength * 0.3);
  }
}
