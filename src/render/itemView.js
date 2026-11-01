// Item visuals: one vertex-coloured template mesh per item type (grip at the origin, main
// axis +y), instanced per item. Held items follow the holder's hand/chest bone each frame.
import { BABYLON } from './babylon.js';
import { GeoBatch } from './geometry.js';

const C = { wood: [0.62, 0.45, 0.28], metal: [0.72, 0.74, 0.76], dark: [0.15, 0.15, 0.16], white: [0.93, 0.93, 0.9], red: [0.75, 0.16, 0.12],
  orange: [0.92, 0.48, 0.14], blue: [0.22, 0.4, 0.7], green: [0.25, 0.55, 0.3], yellow: [0.92, 0.78, 0.25], brown: [0.45, 0.3, 0.18], gray: [0.5, 0.5, 0.5] };

// build(b) draws in item space; hold: where it sits in the hand (bone, pos, Euler rot);
// rest: orientation when lying on the floor ([x,y,z] Euler) and height offset.
const VIEWS = {
  mop: { build: (b) => { b.cyl('paint', 0, -0.25, 0, 0.015, 1.35, { segs: 6, color: C.wood }); for (let i = 0; i < 10; i++) { const a = i * 0.63; b.cyl('paint', Math.cos(a) * 0.05, 1.1, Math.sin(a) * 0.05, 0.012, 0.28, { segs: 4, color: C.white, roll: Math.cos(a) * 0.3, pitch: Math.sin(a) * 0.3 }); } }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.04 },
  broom: { build: (b) => { b.cyl('paint', 0, -0.25, 0, 0.014, 1.3, { segs: 6, color: C.yellow }); b.box('paint', 0, 1.1, 0, 0.3, 0.08, 0.06, { color: C.brown }); b.box('paint', 0, 1.2, 0, 0.32, 0.14, 0.05, { color: [0.75, 0.6, 0.3] }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.04 },
  bucket: { build: (b) => { b.cyl('paint', 0, -0.42, 0, 0.14, 0.3, { segs: 10, rTop: 0.17, color: C.yellow }); b.torus('paint', 0, -0.06, 0, 0.16, 0.008, { color: C.metal, pitch: Math.PI / 2 }); }, hold: 'hang', rest: [0, 0, 0], ry: 0.42 },
  plasticChair: { build: (b) => { b.box('paint', 0, 0, 0, 0.44, 0.05, 0.44, { color: C.orange }); b.box('paint', 0, 0.25, -0.2, 0.44, 0.48, 0.05, { color: C.orange }); for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) b.cyl('paint', x, -0.44, z, 0.016, 0.44, { segs: 4, color: C.gray }); }, hold: 'chest', holdPos: [0, -0.02, 0.42], holdRot: [-1.2, 0, 0], rest: [0, 0, 0], ry: 0.46 },
  chairLeg: { build: (b) => { b.cyl('paint', 0, -0.1, 0, 0.018, 0.48, { segs: 5, color: C.gray }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.03 },
  tray: { build: (b, it) => { b.box('paint', 0, 0, 0, 0.42, 0.02, 0.3, { color: C.metal }); }, hold: 'chest', holdPos: [0, -0.12, 0.33], holdRot: [0, 0, 0], rest: [0, 0, 0], ry: 0.012, food: true },
  book: { build: (b) => { b.box('paint', 0, 0, 0, 0.16, 0.035, 0.22, { color: C.red }); b.box('paint', 0.005, 0, 0, 0.15, 0.03, 0.215, { color: C.white }); }, hold: 'flat', rest: [0, 0, 0], ry: 0.02 },
  newspaper: { build: (b) => { b.box('paint', 0, 0, 0, 0.22, 0.012, 0.3, { color: [0.85, 0.84, 0.78] }); }, hold: 'flat', rest: [0, 0, 0], ry: 0.006 },
  dumbbell: { build: (b) => { b.cyl('paint', 0, -0.13, 0, 0.016, 0.26, { segs: 6, color: C.metal }); for (const y of [-0.13, 0.09]) b.cyl('paint', 0, y, 0, 0.055, 0.045, { segs: 10, color: C.dark }); }, hold: 'grip', rest: [Math.PI / 2, 0, 0], ry: 0.055 },
  basketball: { build: (b) => { b.sphere('paint', 0, 0, 0, 0.12, { segs: 12, rings: 8, color: [0.85, 0.4, 0.12] }); }, hold: 'chest', holdPos: [0, -0.02, 0.33], holdRot: [0, 0, 0], rest: [0, 0, 0], ry: 0.12 },
  fryingPan: { build: (b) => { b.cyl('paint', 0, 0.22, 0, 0.13, 0.04, { segs: 12, color: C.dark }); b.box('paint', 0, 0.06, 0, 0.03, 0.22, 0.02, { color: C.dark }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.03 },
  ladle: { build: (b) => { b.cyl('paint', 0, -0.05, 0, 0.008, 0.33, { segs: 5, color: C.metal }); b.sphere('paint', 0, 0.3, 0.03, 0.045, { segs: 8, rings: 5, color: C.metal }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.02 },
  apple: { build: (b) => { b.sphere('paint', 0, 0, 0, 0.04, { segs: 8, rings: 6, color: [0.8, 0.12, 0.1] }); b.cyl('paint', 0, 0.035, 0, 0.004, 0.02, { segs: 3, color: C.brown }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.04 },
  snack: { build: (b) => { b.box('paint', 0, 0, 0, 0.1, 0.035, 0.06, { color: [0.9, 0.85, 0.3] }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.018 },
  soda: { build: (b) => { b.cyl('paint', 0, -0.06, 0, 0.033, 0.12, { segs: 10, color: [0.75, 0.1, 0.1] }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.06 },
  coffee: { build: (b) => { b.cyl('paint', 0, -0.05, 0, 0.04, 0.1, { segs: 10, color: C.white }); b.torus('paint', 0.05, 0, 0, 0.025, 0.007, { color: C.white, roll: Math.PI / 2 }); b.cyl('paint', 0, 0.045, 0, 0.034, 0.004, { segs: 10, color: [0.3, 0.18, 0.08] }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.05 },
  mug: { build: (b) => { b.cyl('paint', 0, -0.05, 0, 0.04, 0.1, { segs: 10, color: [0.3, 0.45, 0.65] }); b.torus('paint', 0.05, 0, 0, 0.025, 0.007, { color: [0.3, 0.45, 0.65], roll: Math.PI / 2 }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.05 },
  wrench: { build: (b) => { b.box('paint', 0, 0.08, 0, 0.03, 0.3, 0.012, { color: C.metal }); b.box('paint', 0, 0.25, 0, 0.07, 0.05, 0.015, { color: C.metal }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.01 },
  screwdriver: { build: (b) => { b.cyl('paint', 0, -0.05, 0, 0.016, 0.1, { segs: 6, color: C.yellow }); b.cyl('paint', 0, 0.05, 0, 0.004, 0.13, { segs: 4, color: C.metal }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.016 },
  boltCutters: { build: (b) => { for (const x of [-0.025, 0.025]) b.box('paint', x, 0.1, 0, 0.02, 0.5, 0.02, { color: C.red, roll: x * 3 }); b.box('paint', 0, 0.42, 0, 0.05, 0.14, 0.025, { color: C.metal }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.02 },
  keycard: { build: (b) => { b.box('paint', 0, 0, 0, 0.055, 0.004, 0.085, { color: [0.85, 0.85, 0.9] }); b.box('paint', 0, 0.003, -0.02, 0.05, 0.002, 0.02, { color: C.blue }); }, hold: 'flat', rest: [0, 0, 0], ry: 0.003 },
  baton: { build: (b) => { b.cyl('paint', 0, -0.12, 0, 0.018, 0.6, { segs: 8, color: C.dark }); b.cyl('paint', 0, 0.02, 0, 0.022, 0.12, { segs: 8, color: [0.25, 0.25, 0.25], pitch: Math.PI / 2 }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.02 },
  cards: { build: (b) => { b.box('paint', 0, 0, 0, 0.065, 0.02, 0.09, { color: C.red }); }, hold: 'flat', rest: [0, 0, 0], ry: 0.01 },
  poolCue: { build: (b) => { b.cyl('paint', 0, -0.35, 0, 0.016, 1.45, { segs: 6, rTop: 0.007, color: C.wood }); b.cyl('paint', 0, -0.35, 0, 0.0165, 0.4, { segs: 6, color: C.dark }); }, hold: 'stick', rest: [Math.PI / 2, 0, 0], ry: 0.02 },
  soap: { build: (b) => { b.box('paint', 0, 0, 0, 0.08, 0.03, 0.05, { color: [0.92, 0.92, 0.75] }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.015 },
  toiletRoll: { build: (b) => { b.cyl('paint', 0, -0.05, 0, 0.055, 0.1, { segs: 10, color: C.white }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.05 },
  pillow: { build: (b) => { b.box('paint', 0, 0, 0, 0.5, 0.12, 0.32, { color: C.white }); }, hold: 'chest', holdPos: [0, -0.02, 0.3], holdRot: [1.3, 0, 0], rest: [0, 0, 0], ry: 0.06 },
  hooch: { build: (b) => { b.cyl('paint', 0, -0.08, 0, 0.05, 0.16, { segs: 10, color: [0.75, 0.7, 0.45] }); b.cyl('paint', 0, 0.08, 0, 0.04, 0.02, { segs: 10, color: C.metal }); }, hold: 'grip', rest: [0, 0, 0], ry: 0.08 },
  phone: { build: (b) => { b.box('paint', 0, 0, 0, 0.06, 0.012, 0.12, { color: C.dark }); b.box('paint', 0, 0.007, 0, 0.05, 0.002, 0.1, { color: [0.2, 0.3, 0.4] }); }, hold: 'flat', rest: [0, 0, 0], ry: 0.006 },
};
const HOLD = {
  stick: { bone: 'handR', pos: [0, -0.07, 0.01], rot: [Math.PI / 2, 0, 0] },
  grip: { bone: 'handR', pos: [0, -0.08, 0.02], rot: [0, 0, 0] },
  hang: { bone: 'handR', pos: [0, -0.05, 0.0], rot: [0, 0, 0] },
  flat: { bone: 'handR', pos: [-0.015, -0.09, 0.02], rot: [0, 0, Math.PI / 2] },
};

export class ItemView {
  constructor(scene, materials, lighting) {
    this.scene = scene; this.materials = materials; this.lighting = lighting;
    this.templates = new Map();
    this._m = new BABYLON.Matrix(); this._m2 = new BABYLON.Matrix(); this._s = new BABYLON.Vector3(); this._q = new BABYLON.Quaternion(); this._p = new BABYLON.Vector3();
    this.highlighted = null;
  }
  template(type) {
    if (this.templates.has(type)) return this.templates.get(type);
    const v = VIEWS[type] || VIEWS.book;
    const b = new GeoBatch(this.materials, { split: false });
    v.build(b);
    const [mesh] = b.build(this.scene, `item_${type}`, { freeze: false });
    mesh.position.y = -1000;
    mesh.isPickable = false;
    this.templates.set(type, mesh);
    return mesh;
  }
  ensure(item) {
    if (item.view) return item.view;
    const inst = this.template(item.type).createInstance(`it_${item.id}`);
    inst.rotationQuaternion = new BABYLON.Quaternion();
    inst.isPickable = false;
    this.lighting?.addShadowCaster(inst);
    item.view = inst;
    item.viewDef = VIEWS[item.type] || VIEWS.book;
    return inst;
  }
  update(items, game) {
    for (const it of items.values()) {
      const v = this.ensure(it);
      const vd = it.viewDef;
      if (it.pocketOf) { v.setEnabled(false); continue; }
      v.setEnabled(true);
      if (it.holder) {
        const c = it.holder;
        if (!c.rig) continue;
        const hold = vd.hold === 'chest' ? { bone: 'chest', pos: vd.holdPos, rot: vd.holdRot } : HOLD[vd.hold] || HOLD.grip;
        c.rig.boneMatrix(hold.bone, this._m);
        BABYLON.Matrix.ComposeToRef(BABYLON.Vector3.OneReadOnly, BABYLON.Quaternion.RotationYawPitchRoll(hold.rot[1], hold.rot[0], hold.rot[2]), new BABYLON.Vector3(...hold.pos), this._m2);
        this._m2.multiplyToRef(this._m, this._m2);
        this._m2.decompose(this._s, v.rotationQuaternion, v.position);
      } else {
        const r = vd.rest;
        const tumble = it.resting ? 0 : it.yaw * 1.7;
        BABYLON.Quaternion.RotationYawPitchRollToRef(it.yaw, r[0] + tumble, r[2], v.rotationQuaternion);
        v.position.set(it.x, it.y - (it.resting ? Math.min(0.15, it.def.size * 0.15) - vd.ry : 0), it.z);
      }
      v.renderOutline = this.highlighted === it;
      if (v.renderOutline) { v.outlineColor = new BABYLON.Color3(1, 0.85, 0.35); v.outlineWidth = 0.015; }
    }
  }
}
