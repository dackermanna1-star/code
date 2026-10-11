// First-person weapon view models (CS 1.6 "v_" models), built procedurally.
//
// Space: view-model camera space - eye at the origin, +X right, +Y up,
// -Z forward, GoldSrc units. The game renders `object3D` with its own camera
// (vfov 73.74 deg, near 1, far 400) after clearing depth.
//
//   const vm = createViewModel('ak47');
//   vmScene.add(vm.object3D);
//   vm.play('draw');
//   // every frame:
//   vm.setLight([r, g, b]);   // floor light under the player, 1 = normal
//   vm.update(dt, { bobX, bobY, swayYaw, swayPitch });
//   vm.getMuzzle(v3);         // for the muzzle flash sprite
//
// Animations are data (see vm/anim.js); every weapon has idle/draw/shoot
// (+ shoot1..3)/reload (shotguns: reload_start/reload_insert/reload_end),
// knife: idle/draw/slash1/slash2/stab/stab_miss, grenades: idle/draw/
// pinpull/throw, c4: idle/draw/plant. `play(name, {duration})` stretches the
// sequence to the duration the gameplay code wants.
//
// Hierarchy: object3D (bob / sway) > body (pivot at the chest, animated for
// whole-rig weight shifts) > rig (where the weapon is held) > gun > parts and
// hands. Forearms are aimed every frame by a two-bone solve from fixed
// shoulders in the body frame, so the sleeves always lead back to the body.

import * as THREE from 'three';
import { ModelBuilder, DEG } from './vm/builder.js';
import { makeSharedUniforms } from './vm/material.js';
import { applyAnim, animatedNodes, EASE } from './vm/anim.js';
import { BODY_PIVOT, SHOULDERS } from './vm/kit.js';
import { RIFLES } from './vm/w_rifles.js';
import { SNIPERS } from './vm/w_snipers.js';
import { SMGS } from './vm/w_smgs.js';
import { PISTOLS } from './vm/w_pistols.js';
import { HEAVY } from './vm/w_heavy.js';
import { MISC } from './vm/w_misc.js';
import { ZOMBIE_WEAPONS } from './vm/w_zombie.js';
import { applyLoadout, clearLoadout } from './vm/attach.js';

export const VIEWMODEL_WEAPONS = ['knife', 'glock', 'usp', 'p228', 'deagle', 'elite', 'fiveseven', 'm3', 'xm1014', 'mac10', 'tmp', 'mp5', 'ump45', 'p90', 'galil', 'famas', 'ak47', 'm4a1', 'sg552', 'aug', 'scout', 'awp', 'g3sg1', 'sg550', 'm249', 'hegrenade', 'flashbang', 'smokegrenade', 'c4', 'molotov', 'flamethrower', 'rpg', 'm32', 'medkit', 'minigun', 'aa12', 'barrett', 'chainsaw', 'tesla', 'claymore', 'remotec4'];

const BUILDERS = { ...RIFLES, ...SNIPERS, ...SMGS, ...PISTOLS, ...HEAVY, ...MISC, ...ZOMBIE_WEAPONS };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pl = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _bodyInv = new THREE.Matrix4();
const _q3 = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class ViewModel {
  constructor(weaponId, opts = {}) {
    const build = BUILDERS[weaponId];
    if (!build) throw new Error(`createViewModel: unknown weapon "${weaponId}"`);
    this.weaponId = weaponId;
    this.shared = makeSharedUniforms();
    const mb = new ModelBuilder();
    mb.node('body', 'root', BODY_PIVOT);
    mb.node('rig', 'body', BODY_PIVOT.map((v) => -v));
    const spec = build(mb, opts) || {};
    const built = mb.build(this.shared);
    this.object3D = built.root;
    this.object3D.name = `viewmodel_${weaponId}`;
    this.nodes = built.nodes;
    this._materials = built.materials;
    this._geometries = built.geometries;
    this.triangles = built.tris;
    this.anims = spec.anims || {};
    this.spec = spec;
    this.state = {}; // per-weapon flags (slide lock, silencer...)
    this._animated = animatedNodes(this.anims, this.nodes);
    for (const k of ['rig', 'body']) if (!this._animated.includes(this.nodes[k])) this._animated.push(this.nodes[k]);
    for (const n of Object.values(this.nodes)) if (n.userData.defVisible === undefined) n.userData.defVisible = n.visible;
    this._snapP = this._animated.map(() => new THREE.Vector3());
    this._snapQ = this._animated.map(() => new THREE.Quaternion());
    this._blendT = 0;
    this._lastUpdate = -1e9;

    // Arms: two-bone chains from a shoulder fixed in the body frame to the
    // wrist. Upper-arm length and the elbow's bend direction come from the rest
    // pose, so the rest pose is reproduced exactly; the forearm length is the
    // sleeve length, so the sleeve always reaches the elbow (no gaps, no stretch).
    this._arms = [];
    this.object3D.updateMatrixWorld(true);
    const rig = this.nodes.rig, body = this.nodes.body;
    for (const n of Object.values(this.nodes)) {
      const a = n.userData.arm;
      if (!a || !this.nodes[a.fore]) continue;
      const anchor = this.nodes[a.anchor || 'rig'] || rig;
      const W0 = body.worldToLocal(n.getWorldPosition(new THREE.Vector3()));
      let E0;
      if (a.elbow) E0 = anchor.localToWorld(new THREE.Vector3(...a.elbow));
      else {
        E0 = new THREE.Vector3(...a.dir).normalize().multiplyScalar(a.elbowDist).add(n.position);
        n.parent.localToWorld(E0);
      }
      body.worldToLocal(E0);
      const b = (a.len || 16) + 0.4;
      E0.sub(W0).normalize().multiplyScalar(b).add(W0);
      const S = new THREE.Vector3(...SHOULDERS[a.side === 'L' ? 'L' : 'R']).sub(new THREE.Vector3(...BODY_PIVOT));
      const len = E0.distanceTo(S);
      const axis = W0.clone().sub(S).normalize();
      const pole = E0.clone().sub(S);
      pole.addScaledVector(axis, -pole.dot(axis));
      if (a.pole) pole.set(...a.pole);
      if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0);
      pole.normalize();
      // when the hand rises high (reaching over the gun) the elbow swings out
      // to the side instead of hanging straight down
      const out = new THREE.Vector3(a.side === 'L' ? -1 : 1, 0, 0);
      this._arms.push({ hand: n, fore: this.nodes[a.fore], up: this.nodes[a.upper] || null, S, a: len, b, pole, out, y0: W0.y });
    }

    this.silenced = false;
    if (spec.silencer) this.setSilencer(!!opts.silenced);
    // zombie survival upgrades (vm/attach.js): aiming down a red dot (0..1), the laser
    this.ads = 0;
    this.adsPose = null;
    this.laserBeam = null;
    this.laserEmitter = null;

    this._cur = null;
    this._curName = '';
    this._t = 0;
    this._dur = 1;
    this._ended = false;
    this.play('idle');
  }

  /** Names of the animations this weapon supports. */
  get animations() {
    const names = Object.keys(this.anims);
    if (this.anims.shoot1 && !names.includes('shoot')) names.push('shoot');
    return names;
  }

  /** Default length (s) of an animation. */
  duration(name) {
    const a = this._resolve(name);
    return a ? a.anim.dur : 0;
  }

  get currentAnimation() { return this._curName; }
  get time() { return this._t; }
  get finished() { return this._ended; }

  _resolve(name) {
    let n = name;
    if (n === 'shoot' && !this.anims.shoot) {
      if (this.spec.alternate) {
        this._alt = ((this._alt ?? -1) + 1) % this.spec.alternate.length;
        n = this.spec.alternate[this._alt];
      } else {
        const vs = ['shoot1', 'shoot2', 'shoot3'].filter((k) => this.anims[k]);
        if (vs.length) n = vs[(Math.random() * vs.length) | 0];
      }
    }
    if (n === 'reload' && !this.anims.reload && this.anims.reload_start) n = 'reload_start';
    if (n === 'shoot_empty' && !this.anims.shoot_empty && this.anims.shoot1) n = 'shoot1';
    const anim = this.anims[n];
    return anim ? { name: n, anim } : null;
  }

  /**
   * Start an animation. `duration` (s) stretches it to the gameplay timing.
   * The first few hundredths of a second blend from the current pose (pass
   * blend: false to snap, as the GoldSrc renderer does).
   */
  play(name, { duration, blend } = {}) {
    const r = this._resolve(name);
    if (!r) return false;
    const bt = blend === false ? 0 : (r.anim.blend ?? 0.08);
    if (this._cur && bt > 0 && nowMs() - this._lastUpdate < 250) {
      this._animated.forEach((n, i) => { this._snapP[i].copy(n.position); this._snapQ[i].copy(n.quaternion); });
      this._blendT = bt;
    } else this._blendT = 0;
    this._cur = r.anim;
    this._curName = r.name;
    this._t = 0;
    this._dur = Math.max(0.001, duration ?? r.anim.dur ?? 1);
    this._ended = false;
    if (r.anim.start) r.anim.start(this);
    this._pose();
    this._aimArms();
    return true;
  }

  _pose() {
    const a = this._cur;
    let u;
    if (a.loop) u = (this._t % this._dur) / this._dur;
    else u = Math.min(1, this._t / this._dur);
    applyAnim(a, u, this.nodes, this._animated);
    if (a.fn) a.fn(u, this._t, this);
    if (this.spec.post) this.spec.post(this, u);
    if (this._blendT > 0) {
      if (this._t >= this._blendT) this._blendT = 0;
      else {
        const w = EASE.io(this._t / this._blendT);
        this._animated.forEach((n, i) => {
          n.position.lerpVectors(this._snapP[i], n.position, w);
          _q2.copy(n.quaternion);
          n.quaternion.copy(this._snapQ[i]).slerp(_q2, w);
        });
      }
    }
  }

  /**
   * Advance the animation and apply bob / sway.
   * bobX, bobY: units; swayYaw, swayPitch: degrees (GoldSrc sense: pitch + = down).
   */
  update(dt = 0, { bobX = 0, bobY = 0, swayYaw = 0, swayPitch = 0 } = {}) {
    this._lastUpdate = nowMs();
    this._t += dt;
    const a = this._cur;
    if (!a.loop && this._t >= this._dur) {
      if (!this._ended) {
        this._ended = true;
        if (a.end) a.end(this);
      }
      if (!a.hold) {
        const over = this._t - this._dur;
        this.play('idle');
        this._t = over;
      }
    }
    this._pose();
    if (this.ads > 0 && this.adsPose) this._applyAds();
    const sk = 1 - 0.8 * this.ads; // steadier aiming down the sight
    this.object3D.position.set(bobX * sk, bobY * sk, 0);
    this.object3D.rotation.set(-swayPitch * DEG * sk, swayYaw * DEG * sk, 0, 'YXZ');
    this._aimArms();
  }

  // Blend the rig toward the aim-down-the-sight pose (lens on the line of sight, gun
  // level); whatever the animation adds on top of the rest pose carries over.
  _applyAds() {
    const A = this.adsPose, rig = this.nodes.rig, k = this.ads;
    _a.copy(rig.position).sub(A.restP).add(A.p);
    rig.position.lerp(_a, k);
    _q3.copy(A.restQ).invert().premultiply(rig.quaternion).multiply(A.q);
    rig.quaternion.slerp(_q3, k);
  }

  /** Attachments ({ slot: id }) and skin id on this view model (vm/attach.js). */
  setLoadout(att, skin) {
    const key = JSON.stringify([att || {}, skin || null]);
    if (key === (this._loadoutKey || '[{},null]')) return;
    this._loadoutKey = key;
    applyLoadout(this, att || {}, skin || null);
  }

  /**
   * Point the laser beam (if the gun has one) at the spot `dist` units down the line of
   * sight. Call after update().
   */
  updateLaser(dist, on = true) {
    const beam = this.laserBeam;
    if (!beam) return;
    beam.visible = on && this.object3D.visible;
    if (!beam.visible) return;
    const E = this.laserEmitter;
    this.nodes.gun.localToWorld(_a.set(E[0], E[1], E[2]));
    this.object3D.worldToLocal(_a);
    this.object3D.worldToLocal(_b.set(0, 0, -Math.max(20, Math.min(380, dist))));
    _b.sub(_a);
    const len = _b.length();
    beam.position.copy(_a);
    beam.quaternion.setFromUnitVectors(_zAxis, _b.divideScalar(len || 1));
    beam.scale.set(1, 1, len);
  }

  _aimArms() {
    if (!this._arms.length) return;
    this.object3D.updateMatrixWorld(true);
    const body = this.nodes.body;
    _bodyInv.copy(body.matrixWorld).invert();
    for (const a of this._arms) {
      a.hand.getWorldPosition(_v);
      _w.copy(_v).applyMatrix4(_bodyInv); // wrist, body frame
      _d.subVectors(_w, a.S);
      const d = _d.length() || 1e-6;
      _d.divideScalar(d);
      if (d >= a.a + a.b) {
        // out of reach: arm straight toward the shoulder, forearm intact
        _e.copy(_w).addScaledVector(_d, -a.b);
      } else {
        const dd = Math.max(d, Math.abs(a.a - a.b) + 1e-3);
        const x = (a.a * a.a + dd * dd - a.b * a.b) / (2 * dd);
        const h = Math.sqrt(Math.max(0, a.a * a.a - x * x));
        // (body-frame y; the body pivot sits 14 below the eye: starts ~3 below eye level)
        const lift = Math.min(1, Math.max(0, (_w.y - Math.max(a.y0, 11)) / 5));
        _pl.copy(a.pole).addScaledVector(a.out, lift);
        _pl.addScaledVector(_d, -_pl.dot(_d));
        if (_pl.lengthSq() < 1e-8) _pl.set(0, -1, 0);
        _pl.normalize();
        _e.copy(a.S).addScaledVector(_d, x).addScaledVector(_pl, h);
      }
      if (a.up) {
        a.up.position.copy(_e);
        _pl.subVectors(a.S, _e).normalize();
        a.up.quaternion.setFromUnitVectors(_z, _pl);
      }
      // forearm (+Z of the fore node) from the wrist to the elbow
      _e.applyMatrix4(body.matrixWorld).sub(_v);
      a.hand.getWorldQuaternion(_q).invert();
      _e.applyQuaternion(_q).normalize();
      a.fore.quaternion.setFromUnitVectors(_z, _e);
    }
  }

  /** World-light tint (0..2 per channel). */
  setLight(rgb) {
    const [r, g, b] = rgb;
    this.shared.uLight.value.set(r, g, b);
  }

  /** Show or hide the silencer (m4a1 / usp). */
  setSilencer(on) {
    const n = this.spec.silencer && this.nodes[this.spec.silencer];
    if (!n) return;
    this.silenced = !!on;
    n.userData.defVisible = this.silenced;
    n.visible = this.silenced;
  }

  _markerPos(name, out) {
    const m = this.nodes[name];
    out = out || new THREE.Vector3();
    if (!m) return out.set(0, 0, 0);
    this.object3D.updateMatrixWorld(true);
    m.getWorldPosition(out);
    if (this.object3D.parent) this.object3D.parent.worldToLocal(out);
    return out;
  }

  /** Muzzle position in view space (after the latest update). */
  getMuzzle(out) {
    const per = this.spec.markers && this.spec.markers[this._curName];
    let name = per ? per[0] : this.spec.muzzle || 'muzzle';
    if (this.silenced && this.spec.muzzleSil) name = this.spec.muzzleSil;
    return this._markerPos(name, out);
  }

  /** Ejection port position in view space. */
  getShellEject(out) {
    const per = this.spec.markers && this.spec.markers[this._curName];
    return this._markerPos(per ? per[1] : this.spec.shell || 'shell', out);
  }

  dispose() {
    clearLoadout(this);
    for (const g of this._geometries) g.dispose();
    for (const m of this._materials) m.dispose();
    if (this.object3D.parent) this.object3D.parent.remove(this.object3D);
    this._geometries = [];
    this._materials = [];
  }
}

export function createViewModel(weaponId, { silenced = false } = {}) {
  return new ViewModel(weaponId, { silenced });
}
