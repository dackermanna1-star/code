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

import * as THREE from 'three';
import { ModelBuilder, DEG } from './vm/builder.js';
import { makeSharedUniforms } from './vm/material.js';
import { applyAnim, animatedNodes } from './vm/anim.js';
import { RIFLES } from './vm/w_rifles.js';
import { SNIPERS } from './vm/w_snipers.js';
import { SMGS } from './vm/w_smgs.js';
import { PISTOLS } from './vm/w_pistols.js';
import { HEAVY } from './vm/w_heavy.js';
import { MISC } from './vm/w_misc.js';

export const VIEWMODEL_WEAPONS = ['knife', 'glock', 'usp', 'p228', 'deagle', 'elite', 'fiveseven', 'm3', 'xm1014', 'mac10', 'tmp', 'mp5', 'ump45', 'p90', 'galil', 'famas', 'ak47', 'm4a1', 'sg552', 'aug', 'scout', 'awp', 'g3sg1', 'sg550', 'm249', 'hegrenade', 'flashbang', 'smokegrenade', 'c4'];

const BUILDERS = { ...RIFLES, ...SNIPERS, ...SMGS, ...PISTOLS, ...HEAVY, ...MISC };

const _v = new THREE.Vector3();
const _e = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);

export class ViewModel {
  constructor(weaponId, opts = {}) {
    const build = BUILDERS[weaponId];
    if (!build) throw new Error(`createViewModel: unknown weapon "${weaponId}"`);
    this.weaponId = weaponId;
    this.shared = makeSharedUniforms();
    const mb = new ModelBuilder();
    mb.node('rig', 'root');
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
    if (!this._animated.includes(this.nodes.rig)) this._animated.push(this.nodes.rig);
    for (const n of Object.values(this.nodes)) if (n.userData.defVisible === undefined) n.userData.defVisible = n.visible;

    // forearms aim at elbow points fixed in the rig frame
    this._arms = [];
    this.object3D.updateMatrixWorld(true);
    const rig = this.nodes.rig;
    for (const n of Object.values(this.nodes)) {
      const a = n.userData.arm;
      if (!a || !this.nodes[a.fore]) continue;
      const anchor = this.nodes[a.anchor || 'rig'] || rig;
      let elbow;
      if (a.elbow) elbow = new THREE.Vector3(...a.elbow);
      else {
        elbow = new THREE.Vector3(...a.dir).normalize().multiplyScalar(a.elbowDist).add(n.position);
        n.parent.localToWorld(elbow);
        anchor.worldToLocal(elbow);
      }
      // the elbow half follows the gun, half stays with the body (view frame)
      const elbowView = anchor.localToWorld(elbow.clone());
      this.object3D.worldToLocal(elbowView);
      this._arms.push({ hand: n, fore: this.nodes[a.fore], anchor, elbow, elbowView, k: a.follow ?? 0.5 });
    }

    this.silenced = false;
    if (spec.silencer) this.setSilencer(!!opts.silenced);

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

  /** Start an animation. `duration` (s) stretches it to the gameplay timing. */
  play(name, { duration } = {}) {
    const r = this._resolve(name);
    if (!r) return false;
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
  }

  /**
   * Advance the animation and apply bob / sway.
   * bobX, bobY: units; swayYaw, swayPitch: degrees (GoldSrc sense: pitch + = down).
   */
  update(dt = 0, { bobX = 0, bobY = 0, swayYaw = 0, swayPitch = 0 } = {}) {
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
    this.object3D.position.set(bobX, bobY, 0);
    this.object3D.rotation.set(-swayPitch * DEG, swayYaw * DEG, 0, 'YXZ');
    this._aimArms();
  }

  _aimArms() {
    if (!this._arms.length) return;
    this.object3D.updateMatrixWorld(true);
    for (const a of this._arms) {
      a.hand.getWorldPosition(_v);
      a.anchor.localToWorld(_e.copy(a.elbow));
      this.object3D.localToWorld(_e2.copy(a.elbowView));
      _e.lerp(_e2, 1 - a.k).sub(_v);
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
