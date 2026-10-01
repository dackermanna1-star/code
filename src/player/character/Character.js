// The walker: skinned voxel meshes on one skeleton, posed every frame by
// procedural animation (see animate.js). In first person her head and hair
// are hidden (the camera sits in her eyes) and the right arm gives way to the
// spray-can viewmodel; in third person everything shows, and the can or
// whatever she picked up sits in her right hand.
import * as THREE from 'three';
import { createVoxelMaterial } from '../../render/voxelMaterial.js';
import { shared } from '../../render/shaderlib.js';
import { boneList, ARM_A } from './rig.js';
import { buildCharacterMeshes } from './model.js';
import { Animator } from './animate.js';
import { CAN } from '../../spray/viewmodelParts.js';
import { LAYER_REFLECT } from '../../world/units.js';

// the can in her right fist (hand-bone frame = the bind-pose character frame at
// the wrist): its axis runs out of the thumb side, the nozzle the way the
// knuckles point; it is gripped a little below the cap
const CA = Math.cos(ARM_A), SA = Math.sin(ARM_A);
const armToHand = (x, y, z) => new THREE.Vector3(CA * x - SA * y, SA * x + CA * y, z);
export const HAND_CAN = {
  pos: armToHand(-(0.0128 + CAN.R) + 0.005, -0.074, -0.004),
  quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(armToHand(1, 0, 0), new THREE.Vector3(0, 0, -1), armToHand(0, 1, 0))),
  gripY: 0.148, // height on the can (from its base) of the palm
  nozzle: armToHand(0, -1, 0), // hand-frame direction the nozzle points
  axis: new THREE.Vector3(0, 0, -1), // hand-frame direction of the can's top
};

export class Character {
  /** built: optional prebuilt { parts: [{ name, geo }] } (from the worker). */
  constructor(engine, built = null) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'character';
    // bones in the bind pose (identity rotations; local position = joint - parent joint)
    const list = boneList();
    this.bones = new Map();
    this.boneIndex = new Map();
    this.bind = new Map();
    const arr = [];
    for (const [name, parent, p] of list) {
      const b = new THREE.Bone();
      b.name = name;
      const pp = parent ? list.find((e) => e[0] === parent)[2] : [0, 0, 0];
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      if (parent) this.bones.get(parent).add(b);
      this.bones.set(name, b);
      this.boneIndex.set(name, arr.length);
      this.bind.set(name, new THREE.Vector3(...p));
      arr.push(b);
    }
    this.root = this.bones.get('root');
    this.group.add(this.root);
    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(arr);

    const res = built ?? buildCharacterMeshes(this.boneIndex);
    this.buildMs = res.timings?.total ?? 0;
    this.mat = createVoxelMaterial({ name: 'character', wetScale: 0.22, rim: 0.22 });
    this.propMat = createVoxelMaterial({ name: 'handheld', wetScale: 0.3 });
    for (const m of [this.mat, this.propMat]) {
      if (engine.envMap) {
        m.envMap = engine.envMap;
        m.envMapIntensity = 1;
      }
    }
    this.meshes = {};
    for (const { name, geo } of res.parts) {
      const m = new THREE.SkinnedMesh(geo, this.mat);
      m.name = 'character-' + name;
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      m.bind(this.skeleton, new THREE.Matrix4());
      this.meshes[name] = m;
    }
    engine.scene.add(this.group);
    // what she holds in the right hand (third person): the can, or a piece of litter
    this.grip = new THREE.Group();
    this.grip.position.copy(HAND_CAN.pos);
    this.grip.quaternion.copy(HAND_CAN.quat);
    this.bones.get('handR').add(this.grip);
    this.can = null;
    this.held = null;
    this.view = 'first';
    this._rightArmHidden = false;
    this.anim = new Animator(this);
    this.ctx = { view: 'first', spray: {}, carry: {}, lookDir: new THREE.Vector3(), lookAt: null, camPos: new THREE.Vector3() };
    this.fpYaw = null;
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    // compatibility with the old body: legs[side].ankle (litter kicks), group
    this.legs = { L: { ankle: this.bones.get('footL') }, R: { ankle: this.bones.get('footR') } };
    this.applyVisibility();
  }

  /** 'first' hides the head and hair; 'third' shows everything. */
  setView(v) {
    if (v === this.view) return;
    this.view = v;
    if (v === 'third') this._rightArmHidden = false;
    this.applyVisibility();
  }

  get rightArmHidden() {
    return this._rightArmHidden;
  }
  set rightArmHidden(v) {
    v = !!v && this.view === 'first';
    if (v === this._rightArmHidden) return;
    this._rightArmHidden = v;
    this.applyVisibility();
  }

  applyVisibility() {
    const fp = this.view === 'first';
    const M = this.meshes;
    if (M.head) M.head.visible = !fp;
    if (M.hair) M.hair.visible = !fp;
    if (M.armR) M.armR.visible = !this._rightArmHidden;
    this.grip.visible = !fp;
    // her reflection in the wet ground (third person only: in first person she has no head)
    const refl = !fp && this.engine.params?.quality !== 'low';
    this.group.traverse((o) => {
      if (o.isMesh) refl ? o.layers.enable(LAYER_REFLECT) : o.layers.disable(LAYER_REFLECT);
    });
  }

  /**
   * The spray can for her hand: the viewmodel's can and caps with a material of
   * its own that shares the paint colour.
   */
  attachCan(vm) {
    if (this.can || !vm) return;
    const mat = (this.canMat = createVoxelMaterial({ name: 'can-3p', wetScale: 0.2 }));
    mat.userData.uniforms.uTint = vm.material.userData.uniforms.uTint;
    mat.userData.uniforms.uTintFinish = vm.material.userData.uniforms.uTintFinish;
    if (this.engine.envMap) {
      mat.envMap = this.engine.envMap;
      mat.envMapIntensity = 1;
    }
    const mk = (geo, name) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.receiveShadow = true;
      m.frustumCulled = false;
      return m;
    };
    const can = new THREE.Group();
    can.name = 'can-3p';
    can.position.set(0, -HAND_CAN.gripY, 0);
    const body = vm.can.children.find((c) => c.isMesh);
    can.add(mk(body.geometry, 'can'));
    const act = new THREE.Group();
    act.position.set(0, CAN.seat, 0);
    can.add(act);
    this.caps = {};
    for (const [type, c] of Object.entries(vm.caps)) {
      const m = mk(c.mesh.geometry, 'cap-' + type);
      const tip = new THREE.Object3D();
      tip.position.copy(c.tip.position);
      act.add(m, tip);
      this.caps[type] = { mesh: m, tip };
    }
    this.grip.add(can);
    this.can = can;
    this.vm = vm;
    this.applyVisibility();
  }

  /** Litter in her hand (third person): geometry from heldItems, grip { flip, gy, r }. */
  setHeld(geo, grip = null, spin = 0) {
    if (this.held) {
      this.grip.remove(this.held);
      this.held = null;
    }
    if (!geo) return;
    const m = new THREE.Mesh(geo, this.propMat);
    m.name = 'held-3p';
    m.receiveShadow = true;
    m.frustumCulled = false;
    const flip = !!grip?.flip;
    m.rotation.set(flip ? Math.PI : 0, spin, 0);
    const gy = (grip?.gy ?? 0) * (flip ? -1 : 1);
    // thin things sit against the palm (toward +x in the grip frame)
    const push = Math.max(0, CAN.R - (grip?.r ?? CAN.R)) * 0.9;
    m.position.set(push, -0.01 - gy, 0);
    this.grip.add(m);
    this.held = m;
    this.applyVisibility();
  }

  /** World-space nozzle tip and spray direction of the can in her hand. */
  nozzle(outPos, outDir) {
    const c = this.caps?.[this.vm?.capType ?? 'standard'];
    if (!c) return null;
    c.tip.updateWorldMatrix(true, false);
    outPos.setFromMatrixPosition(c.tip.matrixWorld);
    if (outDir) outDir.set(0, 0, -1).transformDirection(c.tip.matrixWorld);
    return outPos;
  }

  /** What the animation needs to know this frame: view, facing, gaze, tools. */
  makeCtx(dt, pl) {
    const e = this.engine;
    const ctx = this.ctx;
    const cam = e.camera;
    // her head shows as soon as the camera leaves her eyes, and goes only once it is back
    const third = (pl.viewK ?? 0) > 0.12;
    this.setView(third ? 'third' : 'first');
    ctx.view = this.view;
    ctx.dt = dt;
    // facing: third person turns with her heading; first person follows the feet
    // smoothly and twists the chest toward the view
    if (this.fpYaw === null) this.fpYaw = pl.feetYaw;
    const df = Math.atan2(Math.sin(pl.feetYaw - this.fpYaw), Math.cos(pl.feetYaw - this.fpYaw));
    this.fpYaw += df * (1 - Math.exp(-dt * 7));
    if (third) {
      ctx.bodyYaw = pl.bodyYaw;
      this.fpYaw = pl.bodyYaw;
      ctx.twist = 0;
    } else {
      ctx.bodyYaw = this.fpYaw;
      const tw = Math.atan2(Math.sin(pl.yaw - this.fpYaw), Math.cos(pl.yaw - this.fpYaw));
      ctx.twist = Math.max(-0.6, Math.min(0.6, tw)) * 0.75;
    }
    ctx.chestPitch = 0;
    // gaze: where the camera looks; meet the camera's eye when it comes round in front of her
    cam.getWorldDirection(ctx.lookDir);
    ctx.lookAt = null;
    ctx.camPos.copy(cam.position);
    if (third) {
      const hx = pl.pos.x - cam.position.x, hz = pl.pos.z - cam.position.z;
      const fx = -Math.sin(ctx.bodyYaw), fz = -Math.cos(ctx.bodyYaw);
      const d = Math.hypot(hx, hz);
      if (d < 4.5 && d > 0.3 && (-hx * fx - hz * fz) / d > 0.55) ctx.lookAt = ctx.camPos;
    }
    // tools (third person: posed here; first person: the viewmodel shows them)
    const sp = e.spray, ca = e.carry;
    const S = ctx.spray;
    S.equipped = third && !!sp?.equipped && !(ca && ca.state !== 'idle');
    S.raised = S.equipped && (sp?.equipT ?? 0) > 0.12;
    S.spraying = S.raised && (sp?.pressure ?? 0) > 0.01;
    S.shaking = S.raised && !!sp?.shaking;
    S.aimPoint = sp?.aimPoint ?? null;
    S.hasHit = !!sp?.aimHit;
    const C = ctx.carry;
    C.state = third && ca ? ca.state : 'idle';
    C.t = ca?.t ?? 0;
    C.charge = ca?.charge ?? 0;
    C.throwK = ca?.throwK ?? 0;
    C.target = ca?.target?.p ?? null;
    C.hasItem = !!ca?.body;
    ctx.aim = S.equipped || C.state === 'charge' || C.state === 'throw';
    // eyes on the work
    if (S.raised && S.aimPoint && S.hasHit) ctx.lookAt = S.aimPoint;
    else if (third && (C.state === 'pick' || C.state === 'place') && C.target) ctx.lookAt = C.target;
    ctx.holding = C.state !== 'idle' || C.hasItem;
    return ctx;
  }

  update(dt, player) {
    const ctx = this.makeCtx(dt, player);
    this.anim.update(dt, player, ctx);
    // what is in the hand
    const third = this.view === 'third';
    if (this.can) {
      this.can.visible = third && ctx.spray.equipped && !this.held?.visible;
      for (const [type, c] of Object.entries(this.caps)) c.mesh.visible = type === (this.vm?.capType ?? 'standard');
    }
    if (this.held) this.held.visible = third && ctx.carry.hasItem;
    this.group.updateMatrixWorld(true);
    // her soft capsule shadow: chest and knees
    const a = this.anim.wp.get('spine2'), kL = this.anim.wp.get('shinL'), kR = this.anim.wp.get('shinR');
    shared.uCapsule.value[0].set(a.x, a.y + 0.1, a.z, 0.19);
    shared.uCapsule.value[1].set((kL.x + kR.x) / 2, (kL.y + kR.y) / 2 - 0.1, (kL.z + kR.z) / 2, 0.14);
  }
}
