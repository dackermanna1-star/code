// First-person weapon presentation: procedural poses driven by the same swing arcs used for hit
// detection, arms that follow the grip, a kicking boot, off-hand actions and slash trails.
import * as THREE from 'three';
import { makeWeaponModel, fxColor } from '../items/models.js';
import { makePotion, makeBomb } from '../world/prop-meshes.js';
import { sharedAssets } from '../render/materials.js';
import { clamp, easeInOutCubic, easeOutCubic, lerp, noise1 } from '../core/math.js';

const DEG = Math.PI / 180;
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

// Direction in camera space for arc angle theta (deg) in a plane rolled by roll (deg).
export function arcDir(theta, roll, out = new THREE.Vector3()) {
  const t = theta * DEG, r = roll * DEG;
  const x = Math.sin(t), z = -Math.cos(t);
  return out.set(x * Math.cos(r), x * Math.sin(r), z);
}

export function arcTangent(theta, roll, sign, out = new THREE.Vector3()) {
  const t = theta * DEG, r = roll * DEG;
  const x = Math.cos(t), z = Math.sin(t);
  return out.set(x * Math.cos(r) * sign, x * Math.sin(r) * sign, z * sign);
}

function basisYX(y, xh, out) {
  _y.copy(y).normalize();
  _x.copy(xh).addScaledVector(_y, -xh.dot(_y));
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

function basisYZ(y, zh, out) {
  _y.copy(y).normalize();
  _z.copy(zh).addScaledVector(_y, -zh.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

const VM_SCALE = 0.62;
const SHOULDER = new THREE.Vector3(0.2, -0.4, 0.02);
const IDLE_POS = new THREE.Vector3(0.3, -0.36, -0.5);
const IDLE_DIR = new THREE.Vector3(-0.32, 0.6, -0.74).normalize();
const IDLE_X = new THREE.Vector3(1, 0.35, 0.1);
const BLOCK_POS = new THREE.Vector3(0.06, -0.2, -0.44);
const BLOCK_DIR = new THREE.Vector3(-1, 0.16, -0.12).normalize();
const BLOCK_Z = new THREE.Vector3(0, -0.15, 1);

const PROFILES = {
  sword: { radius: 0.46, idleShift: 0 },
  dagger: { radius: 0.4, idleShift: 0.02 },
  axe: { radius: 0.44, idleShift: 0 },
  mace: { radius: 0.44, idleShift: 0 },
  spear: { radius: 0.36, idleShift: 0, spear: true },
  greatsword: { radius: 0.42, idleShift: -0.02, twoHand: true },
  hammer: { radius: 0.42, idleShift: -0.02, twoHand: true },
};

export class ViewModel {
  constructor(renderer) {
    this.root = renderer.viewRoot;
    const A = sharedAssets();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.weapon = null;

    const leather = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.85 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x2e2420, roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.95 });
    this.mats = { leather, glove, cloth };
    const armGeo = new THREE.BoxGeometry(1, 1, 1);
    armGeo.translate(0, 0.5, 0);
    this.armR = new THREE.Mesh(armGeo, leather);
    this.armL = new THREE.Mesh(armGeo, leather);
    this.sleeveR = new THREE.Mesh(armGeo, cloth);
    this.sleeveL = new THREE.Mesh(armGeo, cloth);
    this.handR = this._makeHand(glove);
    this.handL = this._makeHand(glove);
    this.root.add(this.armR, this.armL, this.sleeveR, this.sleeveL, this.handR, this.handL);

    // boot for kicks
    this.boot = new THREE.Group();
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), leather);
    shin.position.y = 0.3;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.3), glove);
    foot.position.set(0, 0.03, -0.1);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.1), A.darkMetal);
    cap.position.set(0, 0.05, -0.24);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.04, 0.17), A.darkMetal);
    strap.position.y = 0.35;
    this.boot.add(shin, foot, cap, strap);
    this.boot.visible = false;
    this.root.add(this.boot);

    this.potion = makePotion(0xff3344);
    this.potion.scale.setScalar(1.1);
    this.bomb = makeBomb();
    this.handL.add(this.potion, this.bomb);
    this.potion.position.set(0, 0.06, -0.02);
    this.bomb.position.set(0, 0.08, -0.03);
    this.potion.visible = this.bomb.visible = false;

    // slash trail
    this.trailN = 14;
    const tg = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(this.trailN * 2 * 3);
    this.trailCol = new Float32Array(this.trailN * 2 * 4);
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.trailN - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    tg.setIndex(idx);
    this.trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.trail = new THREE.Mesh(tg, this.trailMat);
    this.trail.frustumCulled = false;
    this.root.add(this.trail);
    this.trailSamples = [];
    this.trailColor = new THREE.Color(1, 1, 1);

    this.cur = { pos: IDLE_POS.clone(), quat: new THREE.Quaternion(), dir: IDLE_DIR.clone() };
    basisYX(IDLE_DIR, IDLE_X, this.cur.quat);
    this.tgt = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), dir: new THREE.Vector3() };
    this.sway = new THREE.Vector2();
    this.swayVel = new THREE.Vector2();
    this.jolt = new THREE.Vector3();
    this.joltVel = new THREE.Vector3();
    this.rollJolt = 0;
    this.kickT = -1;
    this.left = null; // {type, t, dur}
    this.swapT = -1;
    this.pendingWeapon = null;
    this.bloodiness = 0;
    this.time = 0;
    this.lowered = 0;
    this.chargeGlow = 0;
  }

  _makeHand(mat) {
    const g = new THREE.Group();
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.09), mat);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.035), mat);
    thumb.position.set(-0.045, 0.02, -0.03);
    const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.07), sharedAssets().darkMetal);
    knuckles.position.set(0, 0.0, -0.045);
    g.add(fist, thumb, knuckles);
    return g;
  }

  setWeapon(item) {
    if (this.weapon) {
      this.pivot.remove(this.weapon.group);
    }
    if (!item) { this.weapon = null; return; }
    this.weapon = makeWeaponModel(item);
    this.profile = PROFILES[item.base] || PROFILES.sword;
    this.weapon.group.scale.setScalar(VM_SCALE);
    this.weapon.length *= VM_SCALE;
    this.weapon.bladeFrom *= VM_SCALE;
    this.pivot.add(this.weapon.group);
    this.weapon.group.traverse((o) => { if (o.isMesh) o.renderOrder = 2; });
    this.trailColor.set(item.fx ? fxColor(item.fx) : 0xd8e4ff);
    this.fxColor = item.fx ? new THREE.Color(fxColor(item.fx)) : null;
    this.bloodiness = 0;
  }

  // ---- triggered secondary animations
  kick() { this.kickT = 0; }
  drink(dur) { this.left = { type: 'potion', t: 0, dur }; }
  throwItem() { this.left = { type: 'throw', t: 0, dur: 0.4 }; }
  reach() { if (!this.left) this.left = { type: 'reach', t: 0, dur: 0.35 }; }
  hurt(power = 1) { this.joltVel.add(_v.set((Math.random() - 0.5) * 0.4, -0.9, 0.5).multiplyScalar(power)); this.rollJolt += (Math.random() - 0.5) * 0.4 * power; }
  impact(dirX, power = 1) { this.joltVel.add(_v.set(-dirX * 0.6, 0.2, 0.4).multiplyScalar(power)); }
  blockHit(power = 1) { this.joltVel.add(_v.set(0.1, -0.3, 1.0).multiplyScalar(power)); }
  parry() { this.joltVel.add(_v.set(0.6, 0.6, -1.2)); this.rollJolt -= 0.5; }
  swap(item) { this.swapT = 0; this.pendingWeapon = item; }
  addBlood(a) { this.bloodiness = Math.min(1, this.bloodiness + a); }

  // ctx: { state, move, progress, theta, charge, speed, bob, lookDX, lookDY, dodge, onGround, blocking }
  update(dt, ctx) {
    this.time += dt;
    const P = this.profile || PROFILES.sword;
    const t = this.tgt;
    let snap = 14;
    const move = ctx.move;
    if (ctx.state === 'windup' || ctx.state === 'charge') {
      const sign = move.kind === 'thrust' ? 1 : Math.sign(move.from - move.to) || 1;
      if (move.kind === 'thrust') {
        t.pos.set(0.24, -0.27, -0.2);
        t.dir.set(0.05, 0.08, -1).normalize();
        basisYX(t.dir, _v.set(1, 0, 0), t.quat);
        if (ctx.state === 'charge') t.pos.z += 0.08;
      } else {
        const extra = ctx.state === 'charge' ? 45 : 22;
        const th = move.from + sign * extra;
        arcDir(th, move.roll, t.dir);
        t.pos.copy(SHOULDER).addScaledVector(t.dir, P.radius * 0.78);
        const tan = arcTangent(th, move.roll, -sign, _v);
        basisYX(t.dir, tan, t.quat);
      }
      if (ctx.state === 'charge') {
        const c = ctx.charge;
        t.pos.x += noise1(this.time * 30) * 0.006 * c;
        t.pos.y += noise1(this.time * 31 + 5) * 0.006 * c;
        snap = 10;
      } else snap = 30;
    } else if (ctx.state === 'swing') {
      if (move.kind === 'thrust') {
        const k = Math.sin(ctx.progress * Math.PI * 0.5);
        t.pos.set(lerp(0.24, 0.1, k), lerp(-0.27, -0.2, k), lerp(-0.2, -0.78, k));
        t.dir.set(0.04, 0.05, -1).normalize();
        basisYX(t.dir, _v.set(1, 0, 0), t.quat);
      } else {
        const sign = Math.sign(move.from - move.to) || 1;
        arcDir(ctx.theta, move.roll, t.dir);
        const reachOut = 1 + Math.sin(ctx.progress * Math.PI) * 0.18;
        t.pos.copy(SHOULDER).addScaledVector(t.dir, P.radius * reachOut);
        const tan = arcTangent(ctx.theta, move.roll, -sign, _v);
        basisYX(t.dir, tan, t.quat);
        this._trailSample(t.pos, t.dir);
      }
      snap = 45;
    } else if (ctx.state === 'recover') {
      if (move.kind === 'thrust') {
        t.pos.set(0.12, -0.22, -0.65);
        t.dir.set(0.04, 0.05, -1).normalize();
        basisYX(t.dir, _v.set(1, 0, 0), t.quat);
        if (ctx.progress > 0.35) this._idlePose(t, ctx, P);
      } else if (ctx.progress < 0.3) {
        const sign = Math.sign(move.from - move.to) || 1;
        const th = move.to - sign * 18 * easeOutCubic(ctx.progress / 0.3);
        arcDir(th, move.roll, t.dir);
        t.pos.copy(SHOULDER).addScaledVector(t.dir, P.radius);
        basisYX(t.dir, arcTangent(th, move.roll, -sign, _v), t.quat);
        snap = 25;
      } else {
        this._idlePose(t, ctx, P);
        snap = 10;
      }
    } else if (ctx.state === 'block') {
      t.pos.copy(BLOCK_POS);
      t.dir.copy(BLOCK_DIR);
      basisYZ(t.dir, BLOCK_Z, t.quat);
      snap = 22;
    } else if (ctx.state === 'bounce') {
      // recoil off a wall
      t.pos.copy(this.cur.pos).add(_v.set(0.05, 0.02, 0.1));
      t.dir.copy(this.cur.dir);
      t.quat.copy(this.cur.quat);
      snap = 6;
    } else {
      this._idlePose(t, ctx, P);
      snap = 12;
    }

    // weapon swap: lower & raise
    let lower = 0;
    if (this.swapT >= 0) {
      this.swapT += dt;
      const f = this.swapT / 0.36;
      lower = f < 0.5 ? easeInOutCubic(f * 2) : 1 - easeInOutCubic((f - 0.5) * 2);
      if (f >= 0.5 && this.pendingWeapon) { this.setWeapon(this.pendingWeapon); this.pendingWeapon = null; }
      if (f >= 1) this.swapT = -1;
    }
    if (this.left && this.left.type === 'potion') lower = Math.max(lower, 0.55);
    this.lowered = lower;
    t.pos.y -= lower * 0.55;
    t.pos.x += lower * 0.1;

    // smooth toward target
    const k = 1 - Math.exp(-snap * dt);
    this.cur.pos.lerp(t.pos, k);
    this.cur.quat.slerp(t.quat, k);
    this.cur.dir.lerp(t.dir, k).normalize();

    // mouse sway (spring)
    const sx = clamp(-ctx.lookDX * 0.0009, -0.06, 0.06), sy = clamp(ctx.lookDY * 0.0009, -0.06, 0.06);
    this.swayVel.x += (sx - this.sway.x) * 120 * dt - this.swayVel.x * 14 * dt;
    this.swayVel.y += (sy - this.sway.y) * 120 * dt - this.swayVel.y * 14 * dt;
    this.sway.addScaledVector(this.swayVel, dt);
    // jolt spring
    this.joltVel.addScaledVector(this.jolt, -180 * dt);
    this.joltVel.multiplyScalar(Math.exp(-12 * dt));
    this.jolt.addScaledVector(this.joltVel, dt);
    this.rollJolt *= Math.exp(-8 * dt);

    // bob
    const bobAmt = ctx.speed * (ctx.onGround ? 1 : 0.2);
    const bx = Math.sin(ctx.bob) * 0.014 * bobAmt;
    const by = -Math.abs(Math.cos(ctx.bob)) * 0.016 * bobAmt + Math.sin(this.time * 1.6) * 0.003;
    // dodge dip
    const dodgeDip = ctx.dodge ? Math.sin(ctx.dodge * Math.PI) : 0;

    this.pivot.position.copy(this.cur.pos);
    this.pivot.position.x += bx + this.sway.x + this.jolt.x * 0.08 + (ctx.dodgeSide || 0) * dodgeDip * 0.05;
    this.pivot.position.y += by + this.sway.y + this.jolt.y * 0.08 - dodgeDip * 0.08;
    this.pivot.position.z += this.jolt.z * 0.08;
    this.pivot.quaternion.copy(this.cur.quat);
    _q.setFromAxisAngle(_v.set(0, 0, 1), this.rollJolt + (ctx.dodgeSide || 0) * dodgeDip * 0.3 + this.sway.x * 2);
    this.pivot.quaternion.premultiply(_q);

    // charge glow / fx glow
    if (this.weapon) {
      const M = this.weapon.mats;
      this.chargeGlow = lerp(this.chargeGlow, ctx.state === 'charge' ? ctx.charge : 0, 1 - Math.exp(-10 * dt));
      const baseE = this.fxColor ? 0.35 + Math.sin(this.time * 6) * 0.1 : 0;
      M.blade.emissiveIntensity = baseE + this.chargeGlow * 1.5;
      if (!this.fxColor && this.chargeGlow > 0.01) M.blade.emissive.setRGB(1, 0.85, 0.6);
      else if (this.fxColor) M.blade.emissive.copy(this.fxColor);
      else M.blade.emissive.setRGB(0, 0, 0);
      this.bloodiness = Math.max(0, this.bloodiness - dt * 0.015);
      M.blood.opacity = this.bloodiness * 0.9;
    }

    this._updateArms(dt, ctx, P);
    this._updateKick(dt);
    this._updateTrail(dt, ctx.state === 'swing');
  }

  _idlePose(t, ctx, P) {
    t.pos.copy(IDLE_POS);
    t.pos.x += P.idleShift;
    t.dir.copy(IDLE_DIR);
    if (P.spear) {
      t.pos.set(0.24, -0.3, -0.35);
      t.dir.set(-0.05, 0.25, -1).normalize();
      basisYX(t.dir, _v.set(1, 0, 0), t.quat);
      return;
    }
    if (P.twoHand) {
      t.pos.set(0.22, -0.36, -0.42);
      t.dir.set(-0.35, 0.8, -0.35).normalize();
    }
    basisYX(t.dir, IDLE_X, t.quat);
  }

  _placeArm(arm, sleeve, hand, handPos, elbow, quat) {
    _v.subVectors(handPos, elbow);
    const len = _v.length();
    arm.position.copy(elbow);
    arm.quaternion.setFromUnitVectors(_y.set(0, 1, 0), _v.normalize());
    arm.scale.set(0.075, len, 0.075);
    sleeve.position.copy(elbow).addScaledVector(_v, -0.25);
    sleeve.quaternion.copy(arm.quaternion);
    sleeve.scale.set(0.11, 0.35, 0.11);
    hand.position.copy(handPos);
    hand.quaternion.copy(quat);
  }

  _updateArms(dt, ctx, P) {
    const H = this.pivot.position;
    const elbowR = _z.set(0.36 + (H.x - 0.25) * 0.4, -0.72 + (H.y + 0.3) * 0.25, 0.12 + (H.z + 0.45) * 0.3);
    this._placeArm(this.armR, this.sleeveR, this.handR, H, elbowR.clone(), this.pivot.quaternion);

    // left hand: two-handed grip, block support, or off-hand actions
    let showL = false;
    const lp = new THREE.Vector3();
    const lq = new THREE.Quaternion();
    if (this.left) {
      this.left.t += dt;
      const f = clamp(this.left.t / this.left.dur, 0, 1);
      showL = true;
      if (this.left.type === 'potion') {
        const up = f < 0.25 ? easeOutCubic(f / 0.25) : f > 0.85 ? 1 - (f - 0.85) / 0.15 : 1;
        lp.set(lerp(-0.25, -0.04, up), lerp(-0.6, -0.12, up), lerp(-0.35, -0.2, up));
        lq.setFromEuler(new THREE.Euler(lerp(0, 1.6, up) + Math.sin(this.time * 9) * 0.05 * up, 0, lerp(0.3, -0.2, up)));
        this.potion.visible = true;
      } else if (this.left.type === 'throw') {
        const back = f < 0.4 ? easeOutCubic(f / 0.4) : 1 - easeInOutCubic((f - 0.4) / 0.6);
        const fwd = f < 0.4 ? 0 : easeOutCubic((f - 0.4) / 0.6);
        lp.set(-0.28 + fwd * 0.15, -0.3 + back * 0.15 + fwd * 0.08, -0.35 + back * 0.25 - fwd * 0.45);
        lq.setFromEuler(new THREE.Euler(-0.4 * back + fwd * 0.8, 0, 0.2));
        this.bomb.visible = f < 0.55;
      } else {
        const k = Math.sin(f * Math.PI);
        lp.set(-0.18, -0.35 + k * 0.12, -0.3 - k * 0.3);
        lq.setFromEuler(new THREE.Euler(1.2 * k, 0, 0.3));
      }
      if (f >= 1) { this.left = null; this.potion.visible = false; this.bomb.visible = false; }
    } else if (ctx.state === 'block') {
      showL = true;
      lp.copy(H).addScaledVector(this.cur.dir, 0.38).add(_v.set(0, -0.03, 0.02));
      lq.copy(this.pivot.quaternion);
    } else if (P.twoHand || P.spear) {
      showL = true;
      lp.copy(H).addScaledVector(this.cur.dir, P.spear ? -0.32 : -0.17);
      lq.copy(this.pivot.quaternion);
    }
    this.handL.visible = this.armL.visible = this.sleeveL.visible = showL;
    if (showL) {
      const elbowL = new THREE.Vector3(-0.38 + (lp.x + 0.2) * 0.3, -0.75 + (lp.y + 0.3) * 0.3, 0.1 + (lp.z + 0.4) * 0.3);
      this._placeArm(this.armL, this.sleeveL, this.handL, lp, elbowL, lq);
    }
  }

  _updateKick(dt) {
    if (this.kickT < 0) { this.boot.visible = false; return; }
    this.kickT += dt;
    const f = this.kickT / 0.42;
    if (f >= 1) { this.kickT = -1; this.boot.visible = false; return; }
    this.boot.visible = true;
    const out = f < 0.35 ? easeOutCubic(f / 0.35) : 1 - easeInOutCubic((f - 0.35) / 0.65);
    this.boot.position.set(0.02, lerp(-1.25, -0.62, out), lerp(-0.15, -0.62, out));
    this.boot.rotation.set(lerp(0.3, -1.25, out), 0, 0.05);
  }

  _trailSample(pos, dir) {
    if (!this.weapon) return;
    const tip = pos.clone().addScaledVector(dir, this.weapon.length);
    const base = pos.clone().addScaledVector(dir, Math.max(this.weapon.bladeFrom, this.weapon.length * 0.45));
    this.trailSamples.push({ tip, base, age: 0 });
    if (this.trailSamples.length > this.trailN) this.trailSamples.shift();
  }

  _updateTrail(dt, active) {
    const S = this.trailSamples;
    for (const s of S) s.age += dt;
    while (S.length && S[0].age > 0.11) S.shift();
    if (!active && S.length && S[S.length - 1].age > 0.11) S.length = 0;
    const n = S.length;
    const c = this.trailColor;
    for (let i = 0; i < this.trailN; i++) {
      const s = S[Math.min(n - 1, i)];
      const o = i * 6, oc = i * 8;
      if (!s || i >= n) {
        this.trailCol[oc + 3] = this.trailCol[oc + 7] = 0;
        if (s) {
          this.trailPos.set([s.tip.x, s.tip.y, s.tip.z, s.base.x, s.base.y, s.base.z], o);
        }
        continue;
      }
      this.trailPos.set([s.tip.x, s.tip.y, s.tip.z, s.base.x, s.base.y, s.base.z], o);
      const a = Math.max(0, 1 - s.age / 0.11) * (i / Math.max(1, n - 1));
      this.trailCol.set([c.r, c.g, c.b, a * 0.55, c.r, c.g, c.b, 0], oc);
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
    this.trail.visible = n > 1;
  }
}
