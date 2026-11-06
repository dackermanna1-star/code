// Zombie visuals: Minecraft-style humanoid with procedural skins, procedural animation, hit reactions,
// wounds, dismemberment, precise per-part ray tests and a Verlet ragdoll. One draw call per zombie
// (rigid skinning shader, see material.js).
import * as THREE from 'three';
import { makeRng, hash32 } from '../../core/rng.js';
import { setEntityLight, setEntityTint, createEntityMaterial } from '../../render/materials.js';
import { PX, BONE, GROUP, NUM_BONES, STUMP_MASK, ACCESSORY_MASK, VARIANT_DIMS } from './layout.js';
import { getZombieGeometry } from './geometry.js';
import { paintZombieSkin, paintWound } from './skins.js';
import { createSkinnedMaterial, createSkinTexture } from './material.js';
import { ZombieAnimator, CH } from './animation.js';
import { Ragdoll } from './Ragdoll.js';

export const ZOMBIE_OUTFITS = ['civilian', 'civilian_f', 'office', 'police', 'military', 'medic', 'patient', 'firefighter', 'worker', 'prisoner', 'farmer', 'hunter', 'survivor'];
export const ZOMBIE_VARIANTS = ['walker', 'runner', 'crawler', 'brute', 'screamer', 'bloater'];

const BONE_PART = ['torso', 'head', 'head', 'armR', 'armR', 'armL', 'armL', 'legR', 'legR', 'legL', 'legL'];
const BONE_SEG = [null, null, null, 'upper', 'lower', 'upper', 'lower', 'upper', 'lower', 'upper', 'lower'];

// scratch objects (no per-frame allocations)
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _rootInv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Shared body: skin texture, material, merged mesh, rig, bone matrices. */
class ZombieBody {
  constructor({ variant, outfit, seed, rot = 1, eyes = 'glow' }) {
    this.variant = VARIANT_DIMS[variant] ? variant : 'walker';
    this.outfit = outfit;
    this.seed = seed >>> 0;
    this.rng = makeRng(hash32(this.seed, 0x5eed, ZOMBIE_VARIANTS.indexOf(this.variant) + 1));
    const g = getZombieGeometry(this.variant);
    this.geo = g;
    this.dims = g.dims;
    this.joints = g.joints;
    const skin = paintZombieSkin(outfit, this.variant, this.rng.fork(11), { rot, eyes });
    this.pix = skin.pix;
    this.info = skin.info;
    this.texture = createSkinTexture(skin.data);
    this.material = createSkinnedMaterial(this.texture, { glow: eyes === 'glow' ? 0.85 : 0 });
    this.bones = this.material.uniforms.uBones.value;
    this.mesh = new THREE.Mesh(g.geometry, this.material);
    this.mesh.name = 'zombie';
    // visibility
    let hidden = STUMP_MASK | ACCESSORY_MASK;
    for (const a of this.info.accessories) if (GROUP[a] !== undefined) hidden &= ~(1 << GROUP[a]);
    if (this.variant === 'bloater') hidden &= ~(1 << GROUP.pustules);
    this.setHidden(hidden);
    this.missing = { head: false, armR: null, armL: null, legR: null, legL: null };
    this._buildRig();
  }

  setHidden(mask) {
    this.hidden = mask;
    this.material.uniforms.uHidden.value = mask;
  }
  hide(group) { this.setHidden(this.hidden | (1 << group)); }
  show(group) { this.setHidden(this.hidden & ~(1 << group)); }
  isHidden(group) { return (this.hidden & (1 << group)) !== 0; }

  _buildRig() {
    const J = this.joints;
    const mk = (parent, x, y, z) => {
      const o = new THREE.Object3D();
      o.position.set(x * PX, y * PX, z * PX);
      if (parent) parent.add(o);
      return o;
    };
    const root = mk(null, 0, 0, 0);
    root.scale.setScalar(this.dims.scale);
    const hips = mk(root, 0, J.hipY, 0);
    const chest = mk(hips, 0, 0, 0);
    const head = mk(chest, 0, J.neckY, 0);
    head.rotation.order = 'YXZ';
    const jaw = mk(head, J.jaw[0], J.jaw[1], J.jaw[2]);
    const armUR = mk(chest, -J.shoulderX, J.shoulderY, 0), armLR = mk(armUR, 0, J.elbowY, 0);
    const armUL = mk(chest, J.shoulderX, J.shoulderY, 0), armLL = mk(armUL, 0, J.elbowY, 0);
    const legUR = mk(hips, -J.legX, 0, 0), legLR = mk(legUR, 0, J.kneeY, 0);
    const legUL = mk(hips, J.legX, 0, 0), legLL = mk(legUL, 0, J.kneeY, 0);
    this.rig = { root, hips, chest, head, jaw, armUR, armLR, armUL, armLL, legUR, legLR, legUL, legLL };
    this.boneNodes = [chest, head, jaw, armUR, armLR, armUL, armLL, legUR, legLR, legUL, legLL];
  }

  applyPose(p) {
    const r = this.rig, J = this.joints;
    r.hips.position.set(p[CH.RX] * PX, (J.hipY + p[CH.RY]) * PX, p[CH.RZ] * PX);
    r.hips.rotation.set(p[CH.RRX], p[CH.RRY], p[CH.RRZ]);
    r.chest.rotation.set(p[CH.CX], p[CH.CY], p[CH.CZ]);
    r.head.rotation.set(p[CH.HX], p[CH.HY], p[CH.HZ]);
    r.jaw.rotation.x = p[CH.JAW];
    r.armUR.rotation.set(p[CH.ARX], p[CH.ARY], p[CH.ARZ]);
    r.armLR.rotation.x = p[CH.ER];
    r.armUL.rotation.set(p[CH.ALX], p[CH.ALY], p[CH.ALZ]);
    r.armLL.rotation.x = p[CH.EL];
    r.legUR.rotation.set(p[CH.LRX], 0, p[CH.LRZ]);
    r.legLR.rotation.x = p[CH.KR];
    r.legUL.rotation.set(p[CH.LLX], 0, p[CH.LLZ]);
    r.legLL.rotation.x = p[CH.KL];
  }

  updateBones() {
    this.rig.root.updateMatrixWorld(true);
    const b = this.bones;
    for (let i = 0; i < NUM_BONES; i++) b.set(this.boneNodes[i].matrixWorld.elements, i * 16);
  }

  /** part-local texture box (px) for wound mapping: {bone, box:[x0,y0,z0,x1,y1,z1], rows:[r0,r1], part} */
  texBox(bone) {
    const d = this.dims;
    const [tw, th, td] = d.torso;
    const [aw, ad] = d.arm, [lw, ld] = d.leg;
    switch (bone) {
      case BONE.torso: return { part: 'torso', box: [-tw / 2, 0, -td / 2, tw / 2, th, td / 2], rows: [0, 12] };
      case BONE.head: return { part: 'head', box: [-4, 0, -4, 4, 8, 4], rows: [0, 8] };
      case BONE.armUR: case BONE.armUL: return { part: bone === BONE.armUR ? 'armR' : 'armL', box: [-aw / 2, -4, -ad / 2, aw / 2, 2, ad / 2], rows: [0, 6] };
      case BONE.armLR: case BONE.armLL: return { part: bone === BONE.armLR ? 'armR' : 'armL', box: [-aw / 2, -6, -ad / 2, aw / 2, 0, ad / 2], rows: [6, 12] };
      case BONE.legUR: case BONE.legUL: return { part: bone === BONE.legUR ? 'legR' : 'legL', box: [-lw / 2, -6, -ld / 2, lw / 2, 0, ld / 2], rows: [0, 6] };
      default: return { part: bone === BONE.legLR ? 'legR' : 'legL', box: [-lw / 2, -6, -ld / 2, lw / 2, 0, ld / 2], rows: [6, 12] };
    }
  }

  dispose() {
    this.material.dispose();
    this.texture.dispose();
  }
}

/** Visual for a live zombie. See docs/ARCHITECTURE.md "Entities & FX". */
class ZombieVisual {
  constructor({ variant = 'walker', outfit = 'civilian', seed = 1 } = {}) {
    if (!ZOMBIE_OUTFITS.includes(outfit)) outfit = 'civilian';
    this.body = new ZombieBody({ variant, outfit, seed });
    this.variant = this.body.variant;
    this.outfit = outfit;
    const s = this.body.dims.scale;
    this.root = new THREE.Group();
    this.root.name = 'zombie_' + this.variant;
    this.root.add(this.body.mesh);
    this.body.mesh.userData.zombieVisual = this;
    this.height = (this.variant === 'crawler' ? 0.75 : 1.8) * s;
    this.radius = (this.variant === 'bloater' ? 0.45 : this.variant === 'brute' ? 0.4 : 0.3) * s;
    this.anim = new ZombieAnimator(this.variant, this.body.rng.fork(22), this.body.dims);
    this.rng = this.body.rng.fork(33);
    this.flashColor = new THREE.Color(1, 1, 1);
    this.flashAmt = 0;
    this.vel = new THREE.Vector3();
    this._last = new THREE.Vector3();
    this._hasLast = false;
    this.ragdoll = null;
    this._ragdollDone = false;
    this._defaultAnim = { state: 'idle', speed: 0, attackT: 0, aggro: 0 };
    if (this.variant === 'crawler') this._setupCrawler();
    // initial pose so raycasts work before the first update
    this.update(0, this._defaultAnim);
  }

  _setupCrawler() {
    const r = this.rng.next();
    if (r < 0.4) { this.dismember('legR', 'lower'); this.dismember('legL', 'lower'); }
    else if (r < 0.6) { this.dismember(this.rng.chance(0.5) ? 'legR' : 'legL', 'upper'); this.anim.brokenLegs = true; }
    else if (r < 0.8) { this.dismember(this.rng.chance(0.5) ? 'legR' : 'legL', 'lower'); this.anim.brokenLegs = true; }
    else this.anim.brokenLegs = true;
    this.anim.crawlMode = true;
  }

  setLight(sky, block) { setEntityLight(this.body.material, sky, block); }

  flash(colorHex = 0xffffff, amount = 0.6) {
    this.flashColor.set(colorHex);
    this.flashAmt = Math.max(this.flashAmt, amount);
    setEntityTint(this.body.material, this.flashColor, this.flashAmt);
  }

  _decayFlash(dt) {
    if (this.flashAmt <= 0) return;
    this.flashAmt *= Math.exp(-dt * 14);
    if (this.flashAmt < 0.01) this.flashAmt = 0;
    setEntityTint(this.body.material, this.flashColor, this.flashAmt);
  }

  update(dt, anim) {
    this._decayFlash(dt);
    // velocity estimate (for ragdoll momentum)
    const p = this.root.position;
    if (this._hasLast && dt > 0) {
      const k = Math.min(1, dt * 10);
      this.vel.x += ((p.x - this._last.x) / dt - this.vel.x) * k;
      this.vel.y += ((p.y - this._last.y) / dt - this.vel.y) * k;
      this.vel.z += ((p.z - this._last.z) / dt - this.vel.z) * k;
      if (this.vel.lengthSq() > 100) this.vel.setLength(10);
    }
    this._last.copy(p); this._hasLast = true;
    if (this.ragdoll) return;
    const pose = this.anim.update(dt, anim || this._defaultAnim);
    this.body.applyPose(pose);
    this.body.updateBones();
  }

  hitReact(part, dirWorld, strength01 = 0.5) {
    if (this.ragdoll) return;
    this.root.updateWorldMatrix(true, false);
    _rootInv.copy(this.root.matrixWorld).invert();
    _d.copy(dirWorld).transformDirection(_rootInv);
    this.anim.hit(part, _d.x, _d.y, _d.z, strength01);
  }

  /** Paint blood + a wound on the skin around `part` (optionally at the world hit point). */
  addWound(part, worldPoint, size = 1) {
    const b = this.body;
    let bone;
    switch (part) {
      case 'head': bone = BONE.head; break;
      case 'armR': bone = BONE.armUR; break;
      case 'armL': bone = BONE.armUL; break;
      case 'legR': bone = BONE.legUR; break;
      case 'legL': bone = BONE.legUL; break;
      default: bone = BONE.torso;
    }
    let face, fx, fy, tb;
    if (worldPoint) {
      this.root.updateWorldMatrix(true, false);
      // pick the nearest bone segment of that limb
      const cands = bone === BONE.head ? [BONE.head] : bone === BONE.torso ? [BONE.torso] : [bone, bone + 1];
      let best = null, bestD = Infinity;
      for (const bi of cands) {
        if (b.isHidden(bi)) continue;
        _m.fromArray(b.bones, bi * 16).premultiply(this.root.matrixWorld);
        _mi.copy(_m).invert();
        _v.copy(worldPoint).applyMatrix4(_mi).multiplyScalar(1 / PX);
        const t = b.texBox(bi);
        const [x0, y0, z0, x1, y1, z1] = t.box;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
        const d = Math.abs(_v.x - cx) / (x1 - x0) + Math.abs(_v.y - cy) / (y1 - y0) + Math.abs(_v.z - cz) / (z1 - z0);
        if (d < bestD) { bestD = d; best = { bi, t, x: _v.x, y: _v.y, z: _v.z }; }
      }
      if (!best) return;
      tb = best.t;
      const [x0, y0, z0, x1, y1, z1] = tb.box;
      const nx = (best.x - (x0 + x1) / 2) / ((x1 - x0) / 2), ny = (best.y - (y0 + y1) / 2) / ((y1 - y0) / 2), nz = (best.z - (z0 + z1) / 2) / ((z1 - z0) / 2);
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      const ux = THREE.MathUtils.clamp((best.x - x0) / (x1 - x0), 0, 0.999);
      const uy = THREE.MathUtils.clamp((y1 - best.y) / (y1 - y0), 0, 0.999);
      const uz = THREE.MathUtils.clamp((best.z - z0) / (z1 - z0), 0, 0.999);
      const [W, , D] = { head: [8, 8, 8], torso: [8, 12, 4] }[tb.part] || [4, 12, 4];
      const rows = tb.rows[1] - tb.rows[0];
      if (az >= ax && az >= ay * 0.8) { face = nz > 0 ? 'front' : 'back'; fx = Math.floor((nz > 0 ? ux : 1 - ux) * W); fy = tb.rows[0] + Math.floor(uy * rows); }
      else if (ax >= ay * 0.8) { face = nx < 0 ? 'right' : 'left'; fx = Math.floor((nx < 0 ? uz : 1 - uz) * D); fy = tb.rows[0] + Math.floor(uy * rows); }
      else { face = ny > 0 ? 'top' : 'bottom'; fx = Math.floor(ux * W); fy = Math.floor((ny > 0 ? uz : 1 - uz) * D); }
    } else {
      tb = b.texBox(bone);
      face = this.rng.pick(['front', 'front', 'back', 'right', 'left']);
      const W = tb.part === 'head' ? 8 : tb.part === 'torso' ? (face === 'front' || face === 'back' ? 8 : 4) : 4;
      const H = tb.part === 'head' ? 8 : 12;
      fx = Math.floor(this.rng.next() * W);
      fy = Math.floor(this.rng.next() * (H - 2)) + 1;
      if (tb.part === 'head' && face === 'front') fy = this.rng.chance(0.5) ? 1 : 7;
    }
    paintWound(b.pix, this.rng, tb.part, face, fx, fy, size);
    b.texture.needsUpdate = true;
  }

  /**
   * Hide a body part and show a bloody stump. part: 'head'|'armL'|'armR'|'legL'|'legR'.
   * segment 'upper' (default) removes the whole limb, 'lower' only the forearm / shin.
   * Returns the stump position (world) or null if already gone.
   */
  dismember(part, segment = 'upper') {
    const b = this.body, M = b.missing;
    let stumpBone, local;
    if (part === 'head') {
      if (M.head) return null;
      M.head = true;
      for (const g of [GROUP.head, GROUP.jaw, GROUP.hat, GROUP.visor, GROUP.brim]) b.hide(g);
      b.show(GROUP.stumpNeck);
      stumpBone = BONE.torso; local = [0, b.dims.torso[1] + 1, 0];
    } else if (part === 'armR' || part === 'armL' || part === 'legR' || part === 'legL') {
      const R = part.endsWith('R');
      const arm = part.startsWith('arm');
      if (M[part] === 'upper' || (M[part] === 'lower' && segment === 'lower')) return null;
      const gU = arm ? (R ? GROUP.armUR : GROUP.armUL) : (R ? GROUP.legUR : GROUP.legUL);
      const gL = gU + 1;
      const gStumpU = arm ? (R ? GROUP.stumpShR : GROUP.stumpShL) : (R ? GROUP.stumpHipR : GROUP.stumpHipL);
      const gStumpL = arm ? (R ? GROUP.stumpElR : GROUP.stumpElL) : (R ? GROUP.stumpKnR : GROUP.stumpKnL);
      const bU = arm ? (R ? BONE.armUR : BONE.armUL) : (R ? BONE.legUR : BONE.legUL);
      if (segment === 'lower') {
        M[part] = 'lower';
        b.hide(gL); b.show(gStumpL);
        stumpBone = bU; local = arm ? [0, -4.3, 0] : [0, -6.3, 0];
      } else {
        M[part] = 'upper';
        b.hide(gU); b.hide(gL); b.hide(gStumpL); b.show(gStumpU);
        stumpBone = bU; local = arm ? [0, -1.2, 0] : [0, -2.4, 0];
      }
      if (!arm && !this.ragdoll) this.anim.crawlMode = true;
    } else return null;
    this.root.updateWorldMatrix(true, false);
    _m.fromArray(b.bones, stumpBone * 16).premultiply(this.root.matrixWorld);
    return new THREE.Vector3(local[0] * PX, local[1] * PX, local[2] * PX).applyMatrix4(_m);
  }

  /** true if the part is fully intact */
  hasPart(part) {
    const M = this.body.missing;
    if (part === 'head') return !M.head;
    if (part in M) return !M[part];
    return true;
  }

  /**
   * Precise ray test against the oriented boxes of every visible body part in the current pose.
   * @returns {part, segment, point:Vector3, distance} | null
   */
  raycast(origin, dir, maxDist = 100) {
    const b = this.body;
    this.root.updateWorldMatrix(true, false);
    const rw = this.root.matrixWorld;
    // bounding sphere reject
    const s = b.dims.scale;
    _v.setFromMatrixPosition(rw);
    _v.y += 0.6 * s;
    const R = 1.7 * s;
    const ox = origin.x - _v.x, oy = origin.y - _v.y, oz = origin.z - _v.z;
    const bq = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - R * R;
    if (c > 0 && bq > 0) return null;
    if (bq * bq - c < 0) return null;
    let bestT = maxDist, bestBone = -1;
    for (let i = 0; i < NUM_BONES; i++) {
      if (b.isHidden(i)) continue;
      _m.fromArray(b.bones, i * 16).premultiply(rw);
      _mi.copy(_m).invert();
      _o.copy(origin).applyMatrix4(_mi);
      // direction transformed by the inverse (no normalisation, so t stays in world units)
      const e = _mi.elements;
      const dx = e[0] * dir.x + e[4] * dir.y + e[8] * dir.z;
      const dy = e[1] * dir.x + e[5] * dir.y + e[9] * dir.z;
      const dz = e[2] * dir.x + e[6] * dir.y + e[10] * dir.z;
      const box = b.geo.boxes[i];
      const t = slab(_o.x, _o.y, _o.z, dx, dy, dz, box.min, box.max);
      if (t >= 0 && t < bestT) { bestT = t; bestBone = i; }
    }
    if (bestBone < 0) return null;
    return {
      part: BONE_PART[bestBone],
      segment: BONE_SEG[bestBone],
      point: new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT),
      distance: bestT,
    };
  }

  /** World position of a part centre: 'head'|'torso'|'armL'|'armR'|'legL'|'legR'|'handL'|'handR'|'footL'|'footR' */
  getPartPosition(part, out = new THREE.Vector3()) {
    const b = this.body;
    let bone = BONE.torso, l = [0, b.dims.torso[1] * 0.55, 0];
    switch (part) {
      case 'head': bone = BONE.head; l = [0, 4.5, 0]; break;
      case 'armR': bone = BONE.armLR; l = [0, 0, 0]; break;
      case 'armL': bone = BONE.armLL; l = [0, 0, 0]; break;
      case 'handR': bone = BONE.armLR; l = [0, -5.5, 0]; break;
      case 'handL': bone = BONE.armLL; l = [0, -5.5, 0]; break;
      case 'legR': bone = BONE.legLR; l = [0, 0, 0]; break;
      case 'legL': bone = BONE.legLL; l = [0, 0, 0]; break;
      case 'footR': bone = BONE.legLR; l = [0, -5.5, 0]; break;
      case 'footL': bone = BONE.legLL; l = [0, -5.5, 0]; break;
      default: break;
    }
    if (part === 'head' && b.missing.head) { bone = BONE.torso; l = [0, b.dims.torso[1] + 1, 0]; }
    this.root.updateWorldMatrix(true, false);
    _m.fromArray(b.bones, bone * 16).premultiply(this.root.matrixWorld);
    return out.set(l[0] * PX, l[1] * PX, l[2] * PX).applyMatrix4(_m);
  }

  /**
   * Switch to a Verlet ragdoll. impulse: velocity change in m/s (world) applied around hitPart.
   * isSolid(x, y, z) is called with integer block coordinates.
   */
  startRagdoll(impulse, hitPart = 'torso', isSolid = null) {
    if (this.ragdoll) return;
    this.root.updateWorldMatrix(true, false);
    this.ragdoll = new Ragdoll(this.body, this.root.matrixWorld, {
      impulse: impulse || { x: 0, y: 0, z: 0 },
      hitPart,
      isSolid: isSolid || ((x, y, z) => y < Math.floor(this.root.position.y)),
      velocity: this.vel,
      rng: this.rng.fork(44),
    });
    this.body.mesh.frustumCulled = false;
  }

  /** Step the ragdoll; returns false once it has settled (then frozen, nothing to do). */
  updateRagdoll(dt) {
    this._decayFlash(dt);
    const r = this.ragdoll;
    if (!r || this._ragdollDone) return false;
    const alive = r.step(dt);
    this.root.updateWorldMatrix(true, false);
    r.writeBones(this.root.matrixWorld);
    if (!alive) this._ragdollDone = true;
    return alive;
  }

  /** world position of the ragdoll pelvis (or the root when not ragdolled) */
  getBodyPosition(out = new THREE.Vector3()) {
    if (this.ragdoll) return this.ragdoll.pelvis(out);
    return out.setFromMatrixPosition(this.root.matrixWorld);
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    this.body.dispose();
  }
}

function slab(ox, oy, oz, dx, dy, dz, mn, mx) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < mn[a] || o[a] > mx[a]) return -1;
      continue;
    }
    let t1 = (mn[a] - o[a]) / d[a], t2 = (mx[a] - o[a]) / d[a];
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin < 0 ? 0 : tmin;
}

export function createZombieVisual(opts = {}) {
  return new ZombieVisual(opts);
}

// ------------------------------------------------------------------ corpses
let poolTextures = null;
function getPoolTextures() {
  if (poolTextures) return poolTextures;
  poolTextures = [];
  for (let k = 0; k < 3; k++) {
    const S = 48;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const rng = makeRng(hash32(911, k));
    const img = ctx.createImageData(S, S);
    // blob = union of circles, darker at the rim, glossy highlights
    const blobs = [];
    for (let i = 0; i < 7; i++) blobs.push([S / 2 + (rng.next() - 0.5) * S * 0.36, S / 2 + (rng.next() - 0.5) * S * 0.36, S * (0.13 + rng.next() * 0.14)]);
    for (let i = 0; i < 6; i++) blobs.push([S / 2 + (rng.next() - 0.5) * S * 0.75, S / 2 + (rng.next() - 0.5) * S * 0.75, S * (0.03 + rng.next() * 0.04)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let f = 0;
      for (const [bx, by, br] of blobs) { const d = Math.hypot(x - bx, y - by) / br; f = Math.max(f, 1 - d); }
      const i = (y * S + x) * 4;
      if (f <= 0) { img.data[i + 3] = 0; continue; }
      const rim = f < 0.12;
      const n = rng.next() * 14;
      const r = rim ? 70 : 96 + n, g = rim ? 8 : 10 + n * 0.3, b = rim ? 8 : 9;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = rim ? 200 : 240;
      if (f > 0.5 && rng.next() < 0.03) { img.data[i] = 150; img.data[i + 1] = 40; img.data[i + 2] = 40; }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    poolTextures.push(t);
  }
  return poolTextures;
}
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * Static dead body lying in a natural pose (pose from an offline ragdoll drop on flat ground) with a blood pool.
 * @returns {root, setLight(sky, block), dispose()}
 */
export function createCorpseVisual({ outfit = 'civilian', seed = 1, variant = 'walker', zombie = false, pool = true } = {}) {
  if (!ZOMBIE_OUTFITS.includes(outfit)) outfit = 'civilian';
  const body = new ZombieBody({ variant, outfit, seed, rot: zombie ? 1 : 0.28, eyes: zombie ? 'dead' : (makeRng(seed).chance(0.5) ? 'closed' : 'dead') });
  const rng = body.rng.fork(55);
  // standing pose → ragdoll drop
  const anim = new ZombieAnimator(body.variant, rng.fork(1), body.dims);
  anim.update(0.016, { state: 'idle', speed: 0, aggro: rng.next() * 0.5 });
  body.applyPose(anim.out);
  body.updateBones();
  const ident = new THREE.Matrix4();
  const ang = rng.next() * Math.PI * 2;
  const mag = 1.2 + rng.next() * 2.5;
  const part = rng.pick(['torso', 'torso', 'head', 'legR', 'legL']);
  const rd = new Ragdoll(body, ident, {
    impulse: { x: Math.sin(ang) * mag, y: rng.next() * 0.5, z: Math.cos(ang) * mag },
    hitPart: part, isSolid: (x, y) => y < 0, velocity: { x: 0, y: 0, z: 0 }, rng: rng.fork(2),
  });
  for (let i = 0; i < 400 && rd.step(1 / 60); i++);
  rd.writeBones(ident);
  const root = new THREE.Group();
  root.name = 'corpse';
  root.add(body.mesh);
  body.mesh.frustumCulled = true;
  // centre the body (torso centre) around the root origin
  const pel = rd.pelvis(new THREE.Vector3());
  const nk = new THREE.Vector3(rd.pos[3], rd.pos[4], rd.pos[5]);
  const cx = (pel.x + nk.x) / 2, cz = (pel.z + nk.z) / 2;
  body.mesh.position.set(-cx, 0, -cz);
  let poolMat = null;
  if (pool) {
    poolMat = createEntityMaterial({ map: rng.pick(getPoolTextures()), transparent: true, depthWrite: false });
    poolMat.polygonOffset = true; poolMat.polygonOffsetFactor = -1; poolMat.polygonOffsetUnits = -4;
    const pm = new THREE.Mesh(poolGeo, poolMat);
    const sz = 1.3 + rng.next() * 0.8;
    pm.scale.set(sz, 1, sz * (0.8 + rng.next() * 0.4));
    pm.rotation.y = rng.next() * Math.PI * 2;
    pm.position.set((rng.next() - 0.5) * 0.25, 0.012, (rng.next() - 0.5) * 0.25);
    pm.renderOrder = 1;
    root.add(pm);
  }
  return {
    root,
    body,
    setLight(sky, block) {
      setEntityLight(body.material, sky, block);
      if (poolMat) setEntityLight(poolMat, sky, block);
    },
    dispose() {
      if (root.parent) root.parent.remove(root);
      body.dispose();
      if (poolMat) poolMat.dispose();
    },
  };
}
