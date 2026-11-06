// Blocky Minecraft-style first person arms (4 x 12 x 4 "arm pixels", hand at one end), with sleeve / glove layers.
// Each arm is placed every frame by a cheap IK: hand at the target, forearm pointing back toward a shoulder
// anchor (off-screen), rolled so its faces follow an "up" hint (usually the weapon's up axis).
import * as THREE from 'three';
import { ModelBuilder, shade, disposeObject } from './builder.js';
import { M } from './material.js';
import { buildProp } from './misc.js';

export const ARM_PX = 1.55; // cm per arm pixel

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

function buildArmGeometry(side, ap, material) {
  const P = ARM_PX;
  const b = new ModelBuilder({ texel: P });
  const inner = side === 'R' ? -1 : 1; // thumb side (toward the body centre)
  const skin = ap.skin ?? 0xc69c7b;
  const hand = ap.glove ?? skin;
  const handMat = ap.glove != null ? M.CLOTH : M.SKIN;
  // core arm (skin), hand end at z = -2P, extends far toward the shoulder
  b.box(0, 0, 11 * P, 4 * P, 4 * P, 26 * P, skin, M.SKIN);
  // hand: slightly different tone + finger line at the end
  b.box(0, 0, -0.35 * P, 4.08 * P, 4.08 * P, 3.3 * P, hand, handMat);
  b.box(0, 0.6 * P, -2.0 * P, 3.7 * P, 2.4 * P, 0.08 * P, shade(hand, 0.82), handMat);
  // thumb (slightly raised strip on the inner side)
  b.box(inner * 1.9 * P, 0.9 * P, -0.7 * P, 0.5 * P, 1.0 * P, 2.4 * P, shade(hand, 0.93), handMat);
  if (ap.glove != null) {
    b.box(0, 2.08 * P, -1.25 * P, 4.0 * P, 0.25 * P, 1.1 * P, shade(hand, 1.15), M.CLOTH); // knuckle pad
    b.box(0, 0, 1.45 * P, 4.3 * P, 4.3 * P, 0.7 * P, shade(hand, 0.8), M.CLOTH); // cuff
  }
  if (ap.sleeve != null) {
    b.box(0, 0, 12.0 * P, 4.5 * P, 4.5 * P, 20 * P, ap.sleeve, M.CLOTH);
    b.box(0, 0, 2.3 * P, 4.62 * P, 4.62 * P, 0.9 * P, shade(ap.sleeve, 0.78), M.CLOTH);
    b.box(0, 2.27 * P, 8 * P, 0.5 * P, 0.06 * P, 12 * P, shade(ap.sleeve, 0.85), M.CLOTH); // seam
  }
  const built = b.build(material, 1);
  // trigger finger (shown for guns)
  const fb = new ModelBuilder({ texel: P });
  fb.box(inner * 1.25 * P, 1.05 * P, -2.75 * P, 1.0 * P, 1.0 * P, 1.7 * P, hand, handMat);
  const finger = fb.build(material, 1);
  return { arm: built.group, finger: finger.group };
}

export class Arms {
  constructor(material, scene) {
    this.material = material;
    this.R = this._makeArm('R');
    this.L = this._makeArm('L');
    scene.add(this.R.root, this.L.root);
    this.appearance = { skin: 0xc69c7b, sleeve: 0x4a5a3a, glove: null };
    this.rebuild();
  }

  _makeArm(side) {
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.name = 'arm' + side;
    const holder = new THREE.Group();
    root.add(holder);
    const prop = new THREE.Group(); // props held at the fingertips
    prop.position.set(0, 0.01, -0.045);
    root.add(prop);
    return { side, root, holder, prop, mesh: null, finger: null, props: {}, visible: true };
  }

  setAppearance(ap) {
    this.appearance = { ...this.appearance, ...ap };
    this.rebuild();
  }

  rebuild() {
    for (const a of [this.R, this.L]) {
      if (a.mesh) { a.holder.remove(a.mesh); disposeObject(a.mesh); }
      if (a.finger) { a.holder.remove(a.finger); disposeObject(a.finger); }
      const g = buildArmGeometry(a.side, this.appearance, this.material);
      a.mesh = g.arm;
      a.finger = g.finger;
      a.finger.visible = false;
      a.holder.add(a.mesh, a.finger);
    }
  }

  /** Show a prop ('shell'|'big'|'round'|'revolver'|null) at an arm's fingertips. */
  setProp(arm, kind) {
    for (const k in arm.props) arm.props[k].visible = false;
    if (!kind) return;
    if (!arm.props[kind]) {
      const b = buildProp(kind);
      const g = b.build(this.material, 1).group;
      if (kind === 'shell' || kind === 'big' || kind === 'round' || kind === 'revolver') g.rotation.set(-0.5, 0.3, 0.4);
      arm.props[kind] = g;
      arm.prop.add(g);
    }
    arm.props[kind].visible = true;
  }

  /** Place an arm: hand centre at `hand`, forearm toward `shoulder`, rolled by `up` (all scene space). */
  place(arm, hand, shoulder, up) {
    _z.subVectors(shoulder, hand);
    if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
    _z.normalize();
    _y.copy(up).addScaledVector(_z, -up.dot(_z));
    if (_y.lengthSq() < 1e-6) {
      _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
      if (_y.lengthSq() < 1e-6) _y.set(1, 0, 0);
    }
    _y.normalize();
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    _m.setPosition(hand);
    arm.root.matrix.copy(_m);
    arm.root.matrixWorldNeedsUpdate = true;
  }
}
