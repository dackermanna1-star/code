// Third-person player models: the eight CS 1.6 skins as low-poly skinned humanoids
// (one SkinnedMesh per player, ~740-830 triangles, canvas-painted 512x512 skin, GoldSrc
// studio lighting), with a procedural animation layer (gait, crouch, jump, aim pitch,
// recoil, reload, planting, deaths) and raycastable hitboxes.
//
// Local frame: feet at the origin, facing +X, +Z up, +Y = the model's left (GoldSrc space).
//
//   const pm = createPlayerModel('gign');  world.add(pm.object3D);  pm.setWeapon('m4a1');
//   per frame: pm.object3D.position = feet; pm.object3D.rotation.z = yaw (rad); pm.update(dt, state);
//   state = { speed, crouch, onGround, pitch (deg, + down), firing, reloading, planting,
//             moveYaw? (optional, deg: travel direction relative to facing -> legs stride / back-pedal) }
//   pm.setLight(ambient[3], shade[3], dirGS[3]); pm.playDeath('back'|'forward'|'left'|'headshot'|'crouch');
//   pm.getHitboxes() -> invisible Meshes with userData.hitgroup (1 head .. 7 right leg), following the pose.
// Extras: pm.reset() (alive again), pm.setSilenced(on) (USP/M4A1), pm.getMuzzleWorld(out),
//   pm.setHitboxesVisible(on) (debug), preloadPlayerModels() (paint all skins up front).
import * as THREE from 'three';
import { Rig, BONE_DEFS, qZYX, handQuat } from './pm/rig.js';
import { buildBodyGeometry } from './pm/body.js';
import { getSkinTexture } from './pm/skins.js';
import { createLightUniforms, createGsMaterial, setLightUniforms, gsDirToWorld } from './pm/gslight.js';
import { createWorldWeapon, weaponHoldType } from './worldweapons.js';

export const PLAYER_SKINS = { t: ['terror', 'leet', 'arctic', 'guerilla'], ct: ['urban', 'gsg9', 'sas', 'gign'] };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerpV = (out, a, b, t) => out.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

const geomCache = new Map();
function bodyGeometry(skin) {
  if (!geomCache.has(skin)) geomCache.set(skin, buildBodyGeometry(skin));
  return geomCache.get(skin);
}

// ------------------------------------------------------------------ hand grips (weapon frame)
// C = fist centre, F = wrist->knuckles direction, P = palm normal. The wrist sits FIST behind C.
const FIST = 2.6;
const GRIP_R = {
  grip: { C: V(-0.95, -0.45, -0.9), F: V(0.94, 0, -0.34), P: V(0, 1, 0) },
  knife: { C: V(-0.1, -0.35, 0), F: V(0.5, 0, -0.866), P: V(0, 1, 0) },
  grenade: { C: V(-0.6, -1.0, -0.5), F: V(0.6, 0, -0.8), P: V(0, 1, 0) },
  c4: { C: V(0.2, -0.7, 0), F: V(1, 0, 0), P: V(0, 1, 0) },
};
const GRIP_L = {
  fore: { C: V(0, 0.3, -1.45), F: V(0.4, -0.92, 0), P: V(0, -0.15, 1) }, // relative to userData.leftHand
  pistol: { C: V(-0.7, 0.95, -1.3), F: V(0.8, -0.35, -0.5), P: V(0.1, -1, 0.15) },
  dual: { C: V(-0.95, 0.45, -0.9), F: V(0.94, 0, -0.34), P: V(0, -1, 0) },
  c4: { C: V(0.2, 0.7, 0), F: V(1, 0, 0), P: V(0, -1, 0) }, // relative to userData.leftHand
};

function gripFrame(g, left) {
  const F = g.F.clone().normalize();
  const q = handQuat(F, g.P, left, new THREE.Quaternion());
  const w = g.C.clone().addScaledVector(F, -FIST);
  return { w, q };
}

// ------------------------------------------------------------------ hold styles (aim frame)
// Aim frame: origin between the shoulders (chest bone + 7 up), rotated by the aim pitch only.
const HOLDS = {
  rifle: { pos: V(9.0, -4.4, -3.6), chest: -26, pelvis: -12, poleR: V(-0.25, -0.55, -1), poleL: V(0.2, 0.35, -1), headRoll: 6 },
  pistol: { pos: V(19.5, -1.4, -2.8), chest: -8, pelvis: -6, poleR: V(0, -0.25, -1), poleL: V(0, 0.25, -1), headRoll: 0 },
  dual: { pos: V(17.5, -5.0, -3.2), posL: V(17.5, 5.0, -3.2), chest: 0, pelvis: 0, poleR: V(0, -0.8, -1), poleL: V(0, 0.8, -1), headRoll: 0 },
  knife: { pos: V(12.5, -6.4, -9.5), rot: -22, chest: -12, pelvis: -6, poleR: V(-0.2, -0.8, -1), poleL: V(0, 0.8, -1), headRoll: 0 },
  grenade: { pos: V(9.5, -6.5, -5.5), chest: -14, pelvis: -6, poleR: V(-0.4, -0.8, -0.8), poleL: V(0, 0.8, -1), headRoll: 0 },
  c4: { pos: V(12.0, -5.2, -13.0), chest: 0, pelvis: 0, poleR: V(0, -0.8, -1), poleL: V(0, 0.8, -1), headRoll: 0 },
  none: { pos: V(4, -9, -24), chest: 0, pelvis: 0, poleR: V(-0.2, -0.3, -1), poleL: V(-0.2, 0.3, -1), headRoll: 0 },
};

// ------------------------------------------------------------------ hitboxes
// bone, hitgroup, centre (bone local), size
const HITBOXES = [
  ['head', 1, [0.7, 0, 4.5], [9.0, 8.0, 10.4]],
  ['chest', 2, [0.4, 0, 4.6], [11.8, 17.4, 11.2]],
  ['spine', 3, [0.3, 0, 1.9], [11.2, 15.6, 7.2]],
  ['pelvis', 3, [0, 0, -0.4], [11.4, 16.2, 8.0]],
  ['upperarm_l', 4, [0, 0, -6.2], [5.8, 5.8, 13.6]],
  ['forearm_l', 4, [0.1, 0, -5.3], [5.2, 5.2, 11.6]],
  ['hand_l', 4, [0.3, -0.3, -3.2], [4.0, 3.2, 6.8]],
  ['upperarm_r', 5, [0, 0, -6.2], [5.8, 5.8, 13.6]],
  ['forearm_r', 5, [0.1, 0, -5.3], [5.2, 5.2, 11.6]],
  ['hand_r', 5, [0.3, 0.3, -3.2], [4.0, 3.2, 6.8]],
  ['thigh_l', 6, [0.1, 0, -8.5], [9.6, 9.4, 18.0]],
  ['shin_l', 6, [0.2, 0, -8.3], [7.2, 7.0, 17.0]],
  ['foot_l', 6, [2.9, 0.2, -1.6], [13.8, 5.4, 4.2]],
  ['thigh_r', 7, [0.1, 0, -8.5], [9.6, 9.4, 18.0]],
  ['shin_r', 7, [0.2, 0, -8.3], [7.2, 7.0, 17.0]],
  ['foot_r', 7, [2.9, -0.2, -1.6], [13.8, 5.4, 4.2]],
];
const HIT_COLORS = [0xffffff, 0xff3030, 0xffa020, 0xffff30, 0x30a0ff, 0x30ffff, 0x30ff60, 0xc060ff];
const unitBox = new THREE.BoxGeometry(1, 1, 1);

// ------------------------------------------------------------------ death animations
// Keys: t (s), pelvis {p:[x,y,z] model space, r:[yaw,pitch,roll]}, b: {bone: [yaw,pitch,roll] local}.
const DEATHS = {
  back: [
    { t: 0.32, ease: 'out', pelvis: { p: [-3, 0, 27], r: [4, -18, 0] },
      b: { spine: [0, -8, 0], chest: [0, -10, 0], neck: [0, -10, 0], head: [0, -14, 0],
        upperarm_r: [0, -40, -35], forearm_r: [0, -50, 0], upperarm_l: [0, -40, 35], forearm_l: [0, -55, 0],
        thigh_r: [0, -45, 0], shin_r: [0, 80, 0], foot_r: [0, -20, 0], thigh_l: [0, -30, 0], shin_l: [0, 60, 0], foot_l: [0, -10, 0] } },
    { t: 0.85, ease: 'in', pelvis: { p: [-17, 0, 6.2], r: [6, -86, 0] },
      b: { spine: [0, -4, 0], chest: [0, -4, 3], neck: [0, -6, 0], head: [22, 8, 0],
        upperarm_r: [0, -10, -75], forearm_r: [0, -25, 0], hand_r: [0, 20, 0],
        upperarm_l: [0, -10, 55], forearm_l: [0, -35, 0], hand_l: [0, 20, 0],
        thigh_r: [-4, -16, 0], shin_r: [0, 22, 0], foot_r: [0, 35, 0], thigh_l: [6, -38, 4], shin_l: [0, 58, 0], foot_l: [0, 25, 0] } },
    { t: 1.05, ease: 'out', pelvis: { p: [-18, 0, 5.8], r: [6, -89, 0] },
      b: { spine: [0, -2, 0], chest: [0, -2, 3], neck: [0, -4, 0], head: [26, 10, 0],
        upperarm_r: [0, 8, -78], forearm_r: [0, -10, 0], hand_r: [0, 20, 0],
        upperarm_l: [0, 8, 55], forearm_l: [0, -12, 0], hand_l: [0, 20, 0],
        thigh_r: [-4, -12, 0], shin_r: [0, 16, 0], foot_r: [0, 40, 0], thigh_l: [6, -32, 4], shin_l: [0, 50, 0], foot_l: [0, 30, 0] } },
  ],
  forward: [
    { t: 0.4, ease: 'out', pelvis: { p: [2, 0, 21], r: [0, 18, 0] },
      b: { spine: [0, 12, 0], chest: [0, 12, 0], neck: [0, 0, 0], head: [0, -15, 0],
        upperarm_r: [0, -50, -20], forearm_r: [0, -40, 0], upperarm_l: [0, -55, 20], forearm_l: [0, -40, 0],
        thigh_r: [0, -10, 0], shin_r: [0, 95, 0], foot_r: [0, 40, 0], thigh_l: [0, -15, 0], shin_l: [0, 100, 0], foot_l: [0, 40, 0] } },
    { t: 0.9, ease: 'in', pelvis: { p: [14, 0, 6.8], r: [-4, 86, 0] },
      b: { spine: [0, 4, 0], chest: [0, 0, 0], neck: [0, -10, 0], head: [-35, -10, 0],
        upperarm_r: [0, -150, -20], forearm_r: [0, -40, 0], upperarm_l: [0, -100, 50], forearm_l: [0, -70, 0],
        thigh_r: [0, 5, 0], shin_r: [0, 20, 0], foot_r: [0, 60, 0], thigh_l: [-6, -20, 0], shin_l: [0, 45, 0], foot_l: [0, 60, 0] } },
    { t: 1.08, ease: 'out', pelvis: { p: [15, 0, 6.2], r: [-4, 89, 0] },
      b: { spine: [0, 2, 0], chest: [0, -2, 0], neck: [0, -10, 0], head: [-38, -12, 0],
        upperarm_r: [0, -155, -20], forearm_r: [0, -35, 0], upperarm_l: [0, -100, 50], forearm_l: [0, -65, 0],
        thigh_r: [0, 4, 0], shin_r: [0, 15, 0], foot_r: [0, 65, 0], thigh_l: [-6, -18, 0], shin_l: [0, 40, 0], foot_l: [0, 65, 0] } },
  ],
  left: [
    { t: 0.35, ease: 'out', pelvis: { p: [0, 3, 28], r: [30, 0, -14] },
      b: { spine: [10, 0, -8], chest: [10, 0, -8], head: [0, 0, -20],
        upperarm_r: [0, -30, -60], forearm_r: [0, -60, 0], upperarm_l: [0, -20, 40], forearm_l: [0, -30, 0],
        thigh_r: [0, -25, 0], shin_r: [0, 50, 0], thigh_l: [0, -35, 0], shin_l: [0, 70, 0] } },
    { t: 0.9, ease: 'in', pelvis: { p: [0, 16, 7.6], r: [40, 10, -84] },
      b: { spine: [6, 6, 0], chest: [6, 6, 0], neck: [0, 0, -10], head: [0, 10, -10],
        upperarm_r: [0, -40, 10], forearm_r: [0, -60, 0], upperarm_l: [0, -75, 10], forearm_l: [0, -30, 0],
        thigh_r: [0, -55, 0], shin_r: [0, 85, 0], foot_r: [0, 30, 0], thigh_l: [0, -35, 5], shin_l: [0, 70, 0], foot_l: [0, 30, 0] } },
    { t: 1.05, ease: 'out', pelvis: { p: [0, 17, 7.2], r: [40, 10, -88] },
      b: { spine: [6, 6, 0], chest: [6, 6, 0], neck: [0, 0, -12], head: [0, 10, -12],
        upperarm_r: [0, -35, 12], forearm_r: [0, -55, 0], upperarm_l: [0, -80, 10], forearm_l: [0, -25, 0],
        thigh_r: [0, -55, 0], shin_r: [0, 80, 0], foot_r: [0, 30, 0], thigh_l: [0, -35, 5], shin_l: [0, 65, 0], foot_l: [0, 30, 0] } },
  ],
  headshot: [
    { t: 0.16, ease: 'out', pelvis: { p: [-1, 0, 36], r: [8, -10, 0] },
      b: { spine: [0, -10, 0], chest: [0, -14, 0], neck: [0, -20, 0], head: [10, -40, 10],
        upperarm_r: [0, -60, -50], forearm_r: [0, -30, 0], upperarm_l: [0, -50, 50], forearm_l: [0, -30, 0],
        thigh_r: [0, -10, 0], shin_r: [0, 20, 0], thigh_l: [0, -10, 0], shin_l: [0, 20, 0] } },
    { t: 0.45, ease: 'inout', pelvis: { p: [-4, 2, 20], r: [20, -25, 8] },
      b: { spine: [5, -6, 0], chest: [5, -8, 0], neck: [0, -10, 0], head: [20, -20, 15],
        upperarm_r: [0, -30, -40], forearm_r: [0, -60, 0], upperarm_l: [0, -40, 40], forearm_l: [0, -50, 0],
        thigh_r: [0, -60, 0], shin_r: [0, 110, 0], foot_r: [0, 10, 0], thigh_l: [0, -40, 0], shin_l: [0, 90, 0], foot_l: [0, 10, 0] } },
    { t: 0.95, ease: 'in', pelvis: { p: [-14, 4, 6.4], r: [30, -84, 6] },
      b: { spine: [6, -2, 0], chest: [8, -2, 6], neck: [0, -4, 0], head: [35, 4, 0],
        upperarm_r: [0, -10, -100], forearm_r: [0, -25, 0], upperarm_l: [0, -10, 40], forearm_l: [0, -40, 0],
        thigh_r: [-10, -45, -6], shin_r: [0, 80, 0], foot_r: [0, 30, 0], thigh_l: [10, -10, 8], shin_l: [0, 18, 0], foot_l: [0, 40, 0] } },
    { t: 1.12, ease: 'out', pelvis: { p: [-15, 4, 5.9], r: [30, -89, 6] },
      b: { spine: [6, -1, 0], chest: [8, -1, 6], neck: [0, -3, 0], head: [38, 6, 0],
        upperarm_r: [0, 5, -105], forearm_r: [0, -18, 0], upperarm_l: [0, 5, 38], forearm_l: [0, -30, 0],
        thigh_r: [-10, -40, -6], shin_r: [0, 74, 0], foot_r: [0, 30, 0], thigh_l: [10, -8, 8], shin_l: [0, 14, 0], foot_l: [0, 40, 0] } },
  ],
  crouch: [
    { t: 0.3, ease: 'out', pelvis: { p: [-2, -1, 16], r: [-10, 28, 8] },
      b: { spine: [0, 14, 0], chest: [0, 14, 0], neck: [0, 10, 0], head: [0, 10, 0],
        upperarm_r: [0, -10, -20], forearm_r: [0, -40, 0], upperarm_l: [0, -15, 25], forearm_l: [0, -40, 0],
        thigh_r: [0, -90, 0], shin_r: [0, 140, 0], foot_r: [0, 10, 0], thigh_l: [0, -95, 0], shin_l: [0, 140, 0], foot_l: [0, 10, 0] } },
    { t: 0.85, ease: 'in', pelvis: { p: [6, -10, 6.8], r: [-30, 20, 86] },
      b: { spine: [0, 14, 0], chest: [0, 10, 0], neck: [0, 10, 0], head: [-15, 10, 0],
        upperarm_r: [0, -80, -20], forearm_r: [0, -60, 0], upperarm_l: [0, -40, 30], forearm_l: [0, -70, 0],
        thigh_r: [0, -80, 0], shin_r: [0, 110, 0], foot_r: [0, 20, 0], thigh_l: [0, -70, -8], shin_l: [0, 100, 0], foot_l: [0, 20, 0] } },
    { t: 1.0, ease: 'out', pelvis: { p: [6, -11, 6.4], r: [-30, 20, 89] },
      b: { spine: [0, 14, 0], chest: [0, 10, 0], neck: [0, 10, 0], head: [-18, 12, 0],
        upperarm_r: [0, -80, -20], forearm_r: [0, -55, 0], upperarm_l: [0, -40, 30], forearm_l: [0, -65, 0],
        thigh_r: [0, -80, 0], shin_r: [0, 105, 0], foot_r: [0, 20, 0], thigh_l: [0, -70, -8], shin_l: [0, 95, 0], foot_l: [0, 20, 0] } },
  ],
};
const EASE = {
  in: (s) => s * s,
  out: (s) => 1 - (1 - s) * (1 - s),
  inout: (s) => s * s * (3 - 2 * s),
};
// precompute quaternions
for (const keys of Object.values(DEATHS)) {
  for (const k of keys) {
    k.q = {};
    for (const [name] of BONE_DEFS) {
      if (name === 'root') continue;
      const e = name === 'pelvis' ? k.pelvis.r : (k.b[name] || [0, 0, 0]);
      k.q[name] = qZYX(e[0], e[1], e[2]);
    }
    k.pp = new THREE.Vector3(...k.pelvis.p);
  }
}

// ------------------------------------------------------------------ the model
let modelCounter = 0;

class PlayerModel {
  constructor(skin) {
    if (![...PLAYER_SKINS.t, ...PLAYER_SKINS.ct].includes(skin)) throw new Error('unknown player skin ' + skin);
    this.skin = skin;
    this.object3D = new THREE.Group();
    this.object3D.name = 'player_' + skin + '_' + (++modelCounter);
    this.object3D.userData.playerModel = this;

    this.rig = new Rig();
    this.bones = this.rig.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.copy(b.off);
      return bone;
    });
    this.rig.bones.forEach((b, i) => {
      if (b.parent >= 0) this.bones[b.parent].add(this.bones[i]);
    });
    this.object3D.add(this.bones[0]);
    const inverses = this.rig.bones.map((b) => new THREE.Matrix4().makeTranslation(-b.bind.x, -b.bind.y, -b.bind.z));
    this.skeleton = new THREE.Skeleton(this.bones, inverses);

    this.light = createLightUniforms();
    this.material = createGsMaterial(getSkinTexture(skin), this.light);
    // second (alpha-blended) material only used by the GIGN face shield
    this.materialT = createGsMaterial(getSkinTexture(skin), this.light, true);
    this.mesh = new THREE.SkinnedMesh(bodyGeometry(skin), [this.material, this.materialT]);
    this.mesh.name = 'body';
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 30), 64);
    this.object3D.add(this.mesh);
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.onBeforeRender = () => gsDirToWorld(this.light.dirGS, this.object3D.parent, this.light.uLightDir.value);

    // hitboxes
    this.hitMats = HIT_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, wireframe: true, visible: false, depthTest: false }));
    this.hitboxes = HITBOXES.map(([bone, group, c, s]) => {
      const m = new THREE.Mesh(unitBox, this.hitMats[group]);
      m.name = 'hitbox_' + bone;
      m.position.set(c[0], c[1], c[2]);
      m.scale.set(s[0], s[1], s[2]);
      m.userData.hitgroup = group;
      m.userData.playerModel = this;
      m.renderOrder = 10;
      this.bones[this.rig.b[bone].i].add(m);
      return m;
    });

    // animation state
    this.time = 0;
    this.phase = 0;
    this.spd = 0;
    this.crouchW = 0;
    this.airW = 0;
    this.plantW = 0;
    this.reloadW = 0;
    this.reloadT = 0;
    this.recoil = 0;
    this.pitch = 0;
    this.dead = null;
    this.weaponId = null;
    this.weapon = null;
    this.weaponL = null;
    this.hold = HOLDS.none;
    this.holdType = 'none';
    this.gripR = gripFrame(GRIP_R.grip, false);
    this.gripL = null;
    this.leftPoint = null;
    this._tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion() };

    this.update(0, { speed: 0, crouch: false, onGround: true, pitch: 0 });
    this._started = false; // the game's first update snaps to its state
  }

  // ---------------------------------------------------------------- weapons
  setWeapon(weaponId) {
    this._clearWeapon();
    this.weaponId = weaponId || null;
    if (!weaponId) { this.hold = HOLDS.none; this.holdType = 'none'; this.gripL = null; return; }
    const w = createWorldWeapon(weaponId, this.light);
    const holdType = w.userData.hold || weaponHoldType(weaponId);
    this.holdType = holdType;
    this.hold = HOLDS[holdType] || HOLDS.rifle;
    const gr = GRIP_R[holdType === 'knife' ? 'knife' : holdType === 'grenade' ? 'grenade' : holdType === 'c4' ? 'c4' : 'grip'];
    this.gripR = gripFrame(gr, false);
    this.gripL = null;
    this.leftPoint = w.userData.leftHand ? w.userData.leftHand.clone() : null;
    if (holdType === 'rifle') this.gripL = gripFrame(GRIP_L.fore, true);
    else if (holdType === 'pistol') this.gripL = gripFrame(GRIP_L.pistol, true);
    else if (holdType === 'dual') this.gripL = gripFrame(GRIP_L.dual, true);
    else if (holdType === 'c4') this.gripL = gripFrame(GRIP_L.c4, true);

    // weapon parented to the right hand: weaponInHand = inverse(handInWeapon)
    const attach = (weapon, grip, handBone) => {
      const holder = new THREE.Group();
      holder.name = 'weapon_holder';
      const m = new THREE.Matrix4().compose(grip.w, grip.q, V(1, 1, 1)).invert();
      m.decompose(holder.position, holder.quaternion, holder.scale);
      holder.add(weapon);
      handBone.add(holder);
      return holder;
    };
    if (holdType === 'dual') {
      // the pair comes as one group: move the second Beretta into the left hand
      const left = w.getObjectByName('left');
      left.removeFromParent(); left.position.set(0, 0, 0); left.rotation.set(0, 0, 0);
      const wl = new THREE.Group(); wl.add(left);
      this.weaponHolderL = attach(wl, this.gripL, this.bones[this.rig.b.hand_l.i]);
      this.weaponL = wl;
    }
    this.weaponHolder = attach(w, this.gripR, this.bones[this.rig.b.hand_r.i]);
    this.weapon = w;
    if (this.silenced && w.userData.setSilenced) w.userData.setSilenced(true);
    if (this.dead) for (const h of [this.weaponHolder, this.weaponHolderL]) if (h) h.visible = false;
  }

  /** USP / M4A1 silencer on the held weapon. */
  setSilenced(on) {
    this.silenced = !!on;
    if (this.weapon && this.weapon.userData.setSilenced) this.weapon.userData.setSilenced(this.silenced);
  }

  /** World-space muzzle point of the held weapon (for muzzle flashes / tracers), or null. */
  getMuzzleWorld(out = new THREE.Vector3()) {
    if (!this.weapon || !this.weapon.userData.muzzle) return null;
    this.weapon.updateWorldMatrix(true, false);
    return this.weapon.localToWorld(out.copy(this.weapon.userData.muzzle));
  }

  _clearWeapon() {
    for (const h of [this.weaponHolder, this.weaponHolderL]) if (h) h.removeFromParent();
    if (this.weapon && this.weapon.userData.material) this.weapon.userData.material.dispose();
    this.weapon = this.weaponL = this.weaponHolder = this.weaponHolderL = null;
  }

  // ---------------------------------------------------------------- lighting
  setLight(ambient, shade, dirGS) {
    setLightUniforms(this.light, ambient, shade, dirGS, this.object3D.parent);
  }

  getHitboxes() { return this.hitboxes; }

  getEyeHeight() {
    const h = this.rig.b.head;
    return this.rig.point(h, this._tmp.a.set(0.6, 0, 4.3), this._tmp.b).z;
  }

  playDeath(kind = 'back') {
    if (this.dead) return;
    const keys = DEATHS[kind] || DEATHS.back;
    this.dead = {
      kind, t: 0, keys,
      fromQ: this.rig.bones.map((b) => b.q.clone()),
      fromP: this.rig.b.pelvis.p.clone(),
    };
    if (this.weaponHolder) this.weaponHolder.visible = false;
    if (this.weaponHolderL) this.weaponHolderL.visible = false;
  }

  /** Back to life (e.g. new round). */
  reset() {
    this.dead = null;
    if (this.weaponHolder) this.weaponHolder.visible = true;
    if (this.weaponHolderL) this.weaponHolderL.visible = true;
    this.spd = 0; this.crouchW = 0; this.airW = 0; this.plantW = 0; this.reloadW = 0; this.recoil = 0;
    this._started = false;
  }

  setHitboxesVisible(on) { for (const m of this.hitMats) m.visible = !!on; }

  // ---------------------------------------------------------------- per frame
  update(dt, state = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    gsDirToWorld(this.light.dirGS, this.object3D.parent, this.light.uLightDir.value);
    if (this.dead) this._updateDeath(dt);
    else this._updateAlive(dt, state);
    this._apply();
  }

  _updateDeath(dt) {
    const d = this.dead;
    d.t += dt;
    const rig = this.rig;
    const keys = d.keys;
    let k = 0;
    while (k < keys.length - 1 && d.t > keys[k].t) k++;
    const t0 = k === 0 ? 0 : keys[k - 1].t, t1 = keys[k].t;
    const s = EASE[keys[k].ease || 'inout'](clamp((d.t - t0) / (t1 - t0), 0, 1));
    for (const b of rig.bones) {
      if (b.name === 'root') { b.q.identity(); b.p.copy(b.off); continue; }
      const qa = k === 0 ? d.fromQ[b.i] : keys[k - 1].q[b.name];
      b.q.slerpQuaternions(qa, keys[k].q[b.name], s);
      if (b.name === 'pelvis') {
        const pa = k === 0 ? d.fromP : keys[k - 1].pp;
        b.p.lerpVectors(pa, keys[k].pp, s);
      } else b.p.copy(b.off);
    }
    rig.fkAll();
  }

  _updateAlive(dt, st) {
    const rig = this.rig, B = rig.b;
    // exponential smoothing; the very first update snaps straight to the requested state
    const snap = !this._started;
    this._started = true;
    const k = (rate) => (snap ? 1 : 1 - Math.exp(-rate * dt));
    const speed = Math.max(0, st.speed || 0);
    this.spd += (speed - this.spd) * k(12);
    this.crouchW += ((st.crouch ? 1 : 0) - this.crouchW) * k(11);
    this.airW += ((st.onGround === false ? 1 : 0) - this.airW) * k(12);
    this.plantW += ((st.planting ? 1 : 0) - this.plantW) * k(7);
    this.reloadW += ((st.reloading ? 1 : 0) - this.reloadW) * k(8);
    if (st.reloading) this.reloadT += dt; else this.reloadT = 0;
    if (st.firing) this.recoil = 1;
    this.recoil *= Math.exp(-dt * 13);
    const pitch = clamp(st.pitch || 0, -89, 89);
    this.pitch = pitch;

    const spd = this.spd;
    const cw = this.crouchW, aw = this.airW, pw = this.plantW;
    const move = smooth(4, 60, spd) * (1 - aw);
    const run = smooth(140, 235, spd) * (1 - cw);
    const stepLen = lerp(lerp(25, 40, run), 21, cw);
    const cycle = 2 * stepLen;
    this.phase = (this.phase + (spd * dt) / cycle) % 1;
    const ph = this.phase;
    const TAU = Math.PI * 2;
    const H = this.hold;
    // optional state.moveYaw (deg, direction of travel relative to facing, CCW+): like GoldSrc's
    // gait yaw, the legs stride toward the movement direction and back-pedal when moving backwards
    let my = ((((st.moveYaw || 0) + 180) % 360) + 360) % 360 - 180;
    let gaitSign = 1;
    if (Math.abs(my) > 100) { my = ((my + 360) % 360) - 180; gaitSign = -1; }
    my = clamp(my, -75, 75) * move;
    this.gaitDir = this.gaitDir === undefined || snap ? my : this.gaitDir + (my - this.gaitDir) * k(8);
    const gd = this.gaitDir, gdr = (gd * Math.PI) / 180, gc = Math.cos(gdr), gs = Math.sin(gdr);

    // ---------------------------------------------------------- pelvis
    const beta = lerp(lerp(0.6, 0.36, run), 0.62, cw);
    const bobAmp = move * lerp(lerp(0.9, -1.8, run), 0.5, cw);
    const bob = bobAmp * Math.cos(2 * TAU * (ph - beta / 2));
    const breathe = Math.sin(this.time * 1.7);
    let pz = lerp(38.4 - 1.6 * run, 17.6 + 2.8 * move, cw) + bob;
    let px = lerp(0.8 * run * move, -3.2 + 1.2 * move, cw);
    pz = lerp(pz, 20.5, pw); px = lerp(px, -3.0, pw);
    pz = lerp(pz, lerp(37.6, 26.0, cw), aw);
    const gaitYaw = move * lerp(7, 10, run) * Math.cos(TAU * ph);
    const pelvisYaw = H.pelvis * (1 - 0.7 * move) * (1 - pw) + gaitYaw + gd * 0.8;
    const pelvisPitch = lerp(6 * run * move, 10, cw) + 10 * pw + 4 * aw;
    const pelvisRoll = move * 2.5 * Math.sin(TAU * ph) * (1 - cw);
    rig.setPos(B.pelvis, this._tmp.a.set(px, 0, pz));
    rig.setRot(B.pelvis, qZYX(pelvisYaw, pelvisPitch, pelvisRoll, this._tmp.q));

    // ---------------------------------------------------------- spine / head
    const lean = lerp(10 * run * move, 23, cw) + 18 * pw - 4 * aw;
    const chestYaw = H.chest * (1 - 0.25 * move) * (1 - pw) - gaitYaw * 0.55;
    const aimP = pitch * (1 - pw) + 35 * pw;
    const down = Math.max(0, aimP), up = Math.min(0, aimP);
    const chestP = lean + up * 0.3 + down * 0.42;
    rig.setRot(B.spine, qZYX(lerp(pelvisYaw, chestYaw, 0.5), pelvisPitch * 0.5 + lean * 0.5 + up * 0.12 + down * 0.2, 0, this._tmp.q));
    rig.setRot(B.chest, qZYX(chestYaw, chestP - breathe * 0.6 - this.recoil * 1.5, 0, this._tmp.q));
    const headRoll = H.headRoll * (1 - 0.5 * move);
    const headP = up * 0.9 + down * 0.72;
    rig.setRot(B.neck, qZYX(chestYaw * 0.4, lerp(chestP, headP, 0.5), headRoll * 0.4, this._tmp.q));
    rig.setRot(B.head, qZYX(0, headP, headRoll, this._tmp.q));

    // ---------------------------------------------------------- legs
    const legs = [['r', 0, -1], ['l', 0.5, 1]];
    for (const [side, off, s] of legs) {
      const thigh = B['thigh_' + side], shin = B['shin_' + side], foot = B['foot_' + side];
      const p = (ph + off) % 1;
      // gait (relative to the hip's neutral x)
      const sweep = beta * cycle;
      let gx, gz, gp;
      if (p < beta) {
        const t = p / beta;
        gx = sweep * (0.5 - t);
        gz = 0;
        gp = t > 0.7 ? ((t - 0.7) / 0.3) * lerp(25, 35, run) : 0;
        gz += Math.sin((gp * Math.PI) / 180) * 5.5;
      } else {
        const t = (p - beta) / (1 - beta);
        const e = t * t * (3 - 2 * t);
        gx = sweep * (-0.5 + e) - run * 7 * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t);
        gz = lerp(lerp(2.6, 9.5, run), 4.5, cw) * Math.sin(Math.PI * Math.pow(t, lerp(1, 0.7, run)));
        gp = lerp(lerp(25, 60, run), 10, cw) * (1 - t) - 12 * smooth(0.6, 1, t);
      }
      // idle stances
      const st = side === 'r' ? { x: -2.4, y: -5.0, yaw: -14 } : { x: 2.4, y: 5.0, yaw: 6 };
      const holdK = this.holdType === 'rifle' || this.holdType === 'knife' ? 1 : 0.4;
      const idle = V(lerp(side === 'r' ? -0.6 : 0.6, st.x, holdK), st.y, 3.5);
      const gxs = gx * gaitSign, gy = s * lerp(4.6, 4.0, run);
      const gait = V(gxs * gc - gy * gs + 0.5, gxs * gs + gy * gc, 3.5 + gz);
      const stand = lerpV(V(), idle, gait, move);
      // crouch: kneel on the right knee, left foot planted forward
      const cIdle = side === 'r' ? V(-13.6, -4.9, 7.6) : V(8.6, 5.4, 3.5);
      const cGait = V(gx * gaitSign * gc - s * 5.0 * gs - 0.5, gx * gaitSign * gs + s * 5.0 * gc, 3.5 + gz);
      const crouch = lerpV(V(), cIdle, cGait, move);
      const ground = lerpV(V(), stand, crouch, cw);
      if (pw > 0) {
        const plant = side === 'r' ? V(-13.0, -4.9, 9.2) : V(8.6, 5.6, 3.5);
        lerpV(ground, ground, plant, pw);
      }
      const air = side === 'r' ? V(-5.5, -4.4, lerp(10, 15, cw)) : V(4.5, 4.4, lerp(13, 17, cw));
      const target = lerpV(V(), ground, air, aw);
      // foot pitch / yaw
      let fp = lerp(0, gp, move);
      const kneelP = side === 'r' ? 68 : 0;
      fp = lerp(fp, lerp(kneelP, gp, move), cw);
      fp = lerp(fp, kneelP, pw);
      fp = lerp(fp, side === 'r' ? 35 : -5, aw);
      const fyaw = lerp(lerp(st.yaw * holdK, s * 5 + gd, move), s * 8, cw * (1 - move)) + pelvisYaw * 0.3;
      // knee pole: forward, a little outward
      const kp = ((pelvisYaw * 0.5 + gd * 0.5) * Math.PI) / 180;
      const pole = V(Math.cos(kp), Math.sin(kp) + s * 0.12, 0);
      rig.ik(thigh, shin, foot, target, pole, 'leg');
      rig.setRot(foot, qZYX(fyaw, fp, 0, this._tmp.q));
    }

    // ---------------------------------------------------------- arms / weapon
    const aimPivot = rig.point(B.chest, this._tmp.a.set(0, 0, 7), V());
    const kick = this.recoil;
    const qAim = qZYX(0, aimP - kick * 7, 0, new THREE.Quaternion());
    const hp = H.pos.clone();
    // idle sway + walk bob on the weapon
    hp.z += breathe * 0.25 + move * 0.5 * Math.sin(2 * TAU * ph);
    hp.y += move * 0.4 * Math.sin(TAU * ph);
    hp.x -= kick * 1.6;
    const qW = qAim.clone();
    if (H.rot) qW.multiply(qZYX(0, H.rot, 0, this._tmp.q));
    // reload: tip the weapon toward the support hand
    const rw = this.reloadW * (this.holdType === 'rifle' || this.holdType === 'pistol' ? 1 : 0);
    if (rw > 0) {
      qW.multiply(qZYX(0, 14 * rw, 22 * rw, this._tmp.q));
      hp.z -= 1.5 * rw; hp.x -= 1.5 * rw;
    }
    const wPos = hp.applyQuaternion(qAim).add(aimPivot);
    // planting: brick on the floor in front of the knees
    if (pw > 0 && this.holdType === 'c4') {
      const ground = V(15.5, -5.2, 2.0 + 0.4 * Math.max(0, Math.sin(this.time * 9)) * pw);
      wPos.lerp(ground, pw);
      qW.slerp(this._tmp.q.identity(), pw);
    } else if (pw > 0) {
      wPos.lerp(V(13, -7, 12), pw);
    }
    // right hand
    const handR = this._handTarget(wPos, qW, this.gripR);
    if (this.holdType === 'none') {
      handR.p = rig.point(B.chest, V(-1 - move * 4 * Math.cos(TAU * ph), -9.6, -17.5));
      handR.q = handQuat(V(0.1, 0, -1), V(0, 1, 0), false, new THREE.Quaternion());
    }
    rig.ik(B.upperarm_r, B.forearm_r, B.hand_r, handR.p, H.poleR, 'arm');
    rig.setRot(B.hand_r, handR.q);

    // left hand
    let lp, lq;
    if (this.holdType === 'dual') {
      const posL = H.posL.clone();
      posL.z += breathe * 0.25 + move * 0.5 * Math.sin(2 * TAU * ph + 1);
      posL.x -= kick * 1.6;
      const wl = posL.applyQuaternion(qAim).add(aimPivot);
      const t = this._handTarget(wl, qAim, this.gripL);
      lp = t.p; lq = t.q;
    } else if (this.gripL) {
      const lpW = this.leftPoint ? this.leftPoint.clone() : V(0, 0, 0);
      const t = this._handTarget(wPos, qW, this.gripL, lpW);
      lp = t.p; lq = t.q;
      // keep the support hand within reach (long rifles): slide it back along the barrel
      const sh = rig.point(B.chest, V(0, 8, 7));
      for (let i = 0; i < 10 && lp.distanceTo(sh) > 22.6; i++) {
        lpW.x -= 1.0;
        const t2 = this._handTarget(wPos, qW, this.gripL, lpW);
        lp = t2.p; lq = t2.q;
      }
    } else {
      // free support hand (knife / grenade / nothing)
      const free = this.holdType === 'knife' ? V(9.5, 6.5, -12.0)
        : this.holdType === 'grenade' ? V(12, 5.5, -8) : V(-1, 9.5, -24);
      free.x += move * (this.holdType === 'none' ? 6 : 2.5) * Math.cos(TAU * ph);
      free.z += breathe * 0.3;
      lp = free.applyQuaternion(qAim).add(aimPivot);
      const F = V(0.75, -0.15, -0.65).applyQuaternion(qAim);
      lq = handQuat(F, V(0.2, -0.8, -0.5).applyQuaternion(qAim), true, new THREE.Quaternion());
      if (this.holdType === 'none') {
        lp = rig.point(B.chest, V(-1 + move * 4 * Math.cos(TAU * ph), 9.6, -17.5));
        lq = handQuat(V(0.1, 0, -1), V(0, -1, 0), true, new THREE.Quaternion());
      }
    }
    // reload gesture: support hand to the magazine, down to the vest pouch and back
    if (rw > 0.01 && this.gripL && this.holdType !== 'dual') {
      const cyc = (this.reloadT / 1.1) % 1;
      const mag = this.weapon.userData.mag ? this.weapon.userData.mag.clone() : V(4, 0, -2);
      const magP = mag.applyQuaternion(qW).add(wPos).add(V(0, 1.5, -2.5).applyQuaternion(qW));
      const pouch = rig.point(B.spine, V(7.5, 5, 1.5));
      const seg = cyc * 4;
      let target;
      if (seg < 1) target = lp.clone().lerp(magP, smooth(0, 1, seg));
      else if (seg < 2) target = magP.clone().lerp(pouch, smooth(0, 1, seg - 1));
      else if (seg < 3) target = pouch.clone().lerp(magP, smooth(0, 1, seg - 2));
      else target = magP.clone().lerp(lp, smooth(0, 1, seg - 3));
      lp = lp.clone().lerp(target, rw);
      const qr = handQuat(V(0.3, -0.5, 0.8), V(0, -0.3, 1), true, new THREE.Quaternion());
      lq = lq.clone().slerp(qr, rw * 0.7);
    }
    // planting: left hand types on the keypad
    if (pw > 0) {
      const typ = Math.max(0, Math.sin(this.time * 11 + 1.3));
      const pad = V(15.5, 1.5, 4.5 + typ * 1.4);
      lp = lp.clone().lerp(pad, pw);
      lq = lq.clone().slerp(handQuat(V(0.6, -0.3, -0.75), V(0, -0.2, -1), true, new THREE.Quaternion()), pw);
    }
    rig.ik(B.upperarm_l, B.forearm_l, B.hand_l, lp, H.poleL, 'arm');
    rig.setRot(B.hand_l, lq);
  }

  _handTarget(wPos, wQ, grip, offset = null) {
    const p = grip.w.clone();
    if (offset) p.add(offset);
    p.applyQuaternion(wQ).add(wPos);
    const q = wQ.clone().multiply(grip.q);
    return { p, q };
  }

  _apply() {
    const rb = this.rig.bones;
    for (let i = 0; i < rb.length; i++) {
      this.bones[i].position.copy(rb[i].p);
      this.bones[i].quaternion.copy(rb[i].q);
    }
    this.object3D.updateMatrixWorld(true);
  }

  dispose() {
    this._clearWeapon();
    this.object3D.removeFromParent();
    this.material.dispose();
    this.materialT.dispose();
    for (const m of this.hitMats) m.dispose();
    this.skeleton.dispose();
  }
}

export function createPlayerModel(skin) {
  return new PlayerModel(skin);
}

/** Optional warm-up: paints all eight skins and builds their meshes (~0.5 s total) ahead of time. */
export function preloadPlayerModels() {
  for (const skin of [...PLAYER_SKINS.t, ...PLAYER_SKINS.ct]) { getSkinTexture(skin); bodyGeometry(skin); }
}

export { PlayerModel };
