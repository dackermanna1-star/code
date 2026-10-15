// Retarget animation clips from several source rigs onto the shared game skeleton.
//
// usage: node retarget.mjs job.json
//
// job = {
//   target: "<finalized character glb (identity-rest skeleton)>",
//   fps: 30,
//   rigs: { <rigId>: { type: "mixamo"|"rpm"|"ual"|"rocketbox"|"kevdev", rest: "<glb whose node TRS is a T/A pose>",
//                      restAnim?: "<clip name to take the rest pose from>", restTime?: 0 } },
//   outputs: { "<out.glb>": [ { name, rig, src: "<glb>", anim: "<clip name in src>", start?, end?, loop?: bool,
//                               mode: "loco"|"oneshot"|"keep"|"static", mirror?: bool, ground?: bool,
//                               hold?: seconds (for static poses), speed?: number (playback rate),
//                               fixLoop?: bool, notes?, source?, license? } ] },
//   meta: "<out json with per clip metadata>"
// }
//
// Method (per bone, per frame):
//   T_world(t) = S_world(t) * inverse(S_rest_world) * F_s * inverse(F_t)
// where F_s / F_t are "anatomical frames" built from joint positions of each rig's rest pose
// (limbs: aim along the bone + a fixed secondary axis; torso/head/feet: identity => pure
// world-space delta from the rest pose). The target rest has identity world rotations,
// so local = inverse(parentWorld) * world. Hips translation is scaled by hip height ratio.
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import { resample, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { io, loadRig, poseAt, worldMats } from './gltf_anim_lib.mjs';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const FPS = job.fps || 30;
const V = (a) => new THREE.Vector3().fromArray(a);

// ---------------- target skeleton ----------------
const FING = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const SIDES = ['Left', 'Right'];
const tgtRig = await loadRig(job.target);
const JOINTS = []; // ordered parent-before-child
{
  const isJoint = (n) => n.name !== 'Armature' && n.name !== 'Body' && !tgtRig.nodes.some(() => false);
  // walk from Hips
  const hipsIdx = tgtRig.byName.get('Hips');
  const kids = (i) => tgtRig.nodes.map((n, j) => [n, j]).filter(([n]) => n.parent === i).map(([, j]) => j);
  const walk = (i) => { JOINTS.push(i); for (const k of kids(i)) if (isJoint(tgtRig.nodes[k]) && !tgtRig.nodes[k].name.startsWith('socket_')) walk(k); };
  walk(hipsIdx);
}
const TN = JOINTS.map((i) => tgtRig.nodes[i].name);
const TPARENT = Object.fromEntries(JOINTS.map((i) => { const p = tgtRig.nodes[i].parent; return [tgtRig.nodes[i].name, TN.includes(tgtRig.nodes[p]?.name) ? tgtRig.nodes[p].name : null]; }));
const tgtW = worldMats(tgtRig, poseAt(tgtRig, null, 0));
const TPOS = Object.fromEntries(TN.map((n) => [n, new THREE.Vector3().setFromMatrixPosition(tgtW[tgtRig.byName.get(n)])]));
const TLOCAL = Object.fromEntries(TN.map((n) => [n, tgtRig.nodes[tgtRig.byName.get(n)].t.slice()]));

// ---------------- name maps (target -> source) ----------------
function nameMap(type) {
  const m = {};
  const core = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
  if (type === 'mixamo' || type === 'rpm') {
    const p = type === 'mixamo' ? 'mixamorig:' : '';
    for (const n of TN) if (!n.endsWith('_End')) m[n] = p + n;
    return m;
  }
  if (type === 'ual' || type === 'ue4') {
    Object.assign(m, { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: type === 'ue4' ? 'head' : 'Head' });
    for (const [S, s] of [['Left', 'l'], ['Right', 'r']]) {
      Object.assign(m, { [`${S}Shoulder`]: `clavicle_${s}`, [`${S}Arm`]: `upperarm_${s}`, [`${S}ForeArm`]: `lowerarm_${s}`, [`${S}Hand`]: `hand_${s}`,
        [`${S}UpLeg`]: `thigh_${s}`, [`${S}Leg`]: `calf_${s}`, [`${S}Foot`]: `foot_${s}`, [`${S}ToeBase`]: `ball_${s}` });
      for (const F of FING) for (let k = 1; k <= 3; k++) m[`${S}Hand${F}${k}`] = `${F.toLowerCase()}_0${k}_${s}`;
    }
    return m;
  }
  if (type === 'rocketbox') {
    Object.assign(m, { Hips: 'Bip01 Pelvis', Spine: 'Bip01 Spine', Spine1: 'Bip01 Spine1', Spine2: 'Bip01 Spine2', Neck: 'Bip01 Neck', Head: 'Bip01 Head' });
    for (const [S, s] of [['Left', 'L'], ['Right', 'R']]) {
      Object.assign(m, { [`${S}Shoulder`]: `Bip01 ${s} Clavicle`, [`${S}Arm`]: `Bip01 ${s} UpperArm`, [`${S}ForeArm`]: `Bip01 ${s} Forearm`, [`${S}Hand`]: `Bip01 ${s} Hand`,
        [`${S}UpLeg`]: `Bip01 ${s} Thigh`, [`${S}Leg`]: `Bip01 ${s} Calf`, [`${S}Foot`]: `Bip01 ${s} Foot`, [`${S}ToeBase`]: `Bip01 ${s} Toe0` });
      FING.forEach((F, i) => { m[`${S}Hand${F}1`] = `Bip01 ${s} Finger${i}`; m[`${S}Hand${F}2`] = `Bip01 ${s} Finger${i}1`; m[`${S}Hand${F}3`] = `Bip01 ${s} Finger${i}2`; });
    }
    return m;
  }
  if (type === 'kevdev') {
    // Kevin Iglesias "Human" rig (B-*)
    Object.assign(m, { Hips: 'B-hips', Spine: 'B-spine', Spine2: 'B-chest', Neck: 'B-neck', Head: 'B-head' });
    for (const [S, s] of [['Left', 'L'], ['Right', 'R']]) {
      Object.assign(m, { [`${S}Shoulder`]: `B-shoulder.${s}`, [`${S}Arm`]: `B-upperArm.${s}`, [`${S}ForeArm`]: `B-forearm.${s}`, [`${S}Hand`]: `B-hand.${s}`,
        [`${S}UpLeg`]: `B-thigh.${s}`, [`${S}Leg`]: `B-shin.${s}`, [`${S}Foot`]: `B-foot.${s}`, [`${S}ToeBase`]: `B-toe.${s}` });
      const kf = { Thumb: 'thumb', Index: 'indexFinger', Middle: 'middleFinger', Ring: 'ringFinger', Pinky: 'pinky' };
      for (const F of FING) for (let k = 1; k <= 3; k++) m[`${S}Hand${F}${k}`] = `B-${kf[F]}0${k}.${s}`;
    }
    return m;
  }
  if (type === 'poser') {
    Object.assign(m, { Hips: 'hip', Spine: 'abdomen', Spine2: 'chest', Neck: 'neck', Head: 'head' });
    for (const [S, s] of [['Left', 'l'], ['Right', 'r']]) Object.assign(m, { [`${S}Shoulder`]: `${s}Collar`, [`${S}Arm`]: `${s}Shldr`, [`${S}ForeArm`]: `${s}ForeArm`, [`${S}Hand`]: `${s}Hand`, [`${S}UpLeg`]: `${s}Thigh`, [`${S}Leg`]: `${s}Shin`, [`${S}Foot`]: `${s}Foot` });
    return m;
  }
  throw new Error('unknown rig type ' + type);
}

// ---------------- anatomical frames ----------------
// returns Matrix4 (rotation only) basis [x=side', y=aim, z=x×y] or identity for delta-mode bones
const DELTA = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']);
function frameDefs(name) {
  const S = name.startsWith('Left') ? 'Left' : 'Right';
  if (DELTA.has(name) || name.endsWith('_End')) return null;
  if (name.endsWith('Shoulder')) return { aim: [name, `${S}Arm`], side: 'Y' };
  if (name.endsWith('ForeArm')) return { aim: [name, `${S}Hand`], side: 'Z' };
  if (name.endsWith('Arm')) return { aim: [name, `${S}ForeArm`], side: 'Z' };
  if (name.endsWith('Hand')) return { aim: [name, `${S}HandMiddle1`], side: [`${S}HandIndex1`, `${S}HandPinky1`] };
  if (name.endsWith('UpLeg')) return { aim: [name, `${S}Leg`], side: 'Z' };
  if (name.endsWith('Leg')) return { aim: [name, `${S}Foot`], side: 'Z' };
  const fm = name.match(/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$/);
  if (fm) {
    const k = Number(fm[3]);
    const aim = k < 3 ? [name, `${S}Hand${fm[2]}${k + 1}`] : [`${S}Hand${fm[2]}2`, name];
    return { aim, side: fm[2] === 'Thumb' ? 'palm' : [`${S}HandIndex1`, `${S}HandPinky1`], S };
  }
  return null;
}
function buildFrame(def, P) {
  if (!def) return new THREE.Matrix4();
  const a = P(def.aim[1]), b = P(def.aim[0]);
  if (!a || !b) return null;
  const y = a.clone().sub(b).normalize();
  let side;
  if (def.side === 'X') side = new THREE.Vector3(1, 0, 0);
  else if (def.side === 'Y') side = new THREE.Vector3(0, 1, 0);
  else if (def.side === 'Z') side = new THREE.Vector3(0, 0, 1);
  else if (def.side === 'palm') {
    const S = def.S; const h = P(`${S}Hand`), m1 = P(`${S}HandMiddle1`), i1 = P(`${S}HandIndex1`), p1 = P(`${S}HandPinky1`);
    if (!h || !m1 || !i1 || !p1) return null;
    side = m1.clone().sub(h).cross(i1.clone().sub(p1)).normalize();
  } else { const s0 = P(def.side[0]), s1 = P(def.side[1]); if (!s0 || !s1) return null; side = s1.clone().sub(s0); }
  const x = side.clone().sub(y.clone().multiplyScalar(side.dot(y))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}
const FT = Object.fromEntries(TN.map((n) => [n, buildFrame(frameDefs(n), (k) => TPOS[k])]));

// ---------------- source rigs ----------------
const rigCache = new Map();
async function getRig(id) {
  if (rigCache.has(id)) return rigCache.get(id);
  const def = job.rigs[id];
  const rest = await loadRig(def.rest);
  const map = nameMap(def.type);
  if (def.type === 'mixamo' && !rest.byName.has(map.Hips)) {
    // Mixamo exports sometimes use numbered prefixes (mixamorig7:Hips) or none at all
    const h = rest.nodes.find((n) => /(^|:)Hips$/.test(n.name));
    if (h) { const pre = h.name.slice(0, -4); for (const k of Object.keys(map)) map[k] = pre + map[k].replace(/^mixamorig:/, ''); }
  }
  if (def.mapOverride) Object.assign(map, def.mapOverride);
  const lower = new Map(rest.nodes.map((n) => [n.name.toLowerCase(), n.name]));
  for (const [t, sname] of Object.entries(map)) if (!rest.byName.has(sname) && lower.has(sname.toLowerCase())) map[t] = lower.get(sname.toLowerCase());
  const restPose = poseAt(rest, def.restAnim || null, def.restTime || 0);
  const W = worldMats(rest, restPose);
  const SP = {}, SR = {};
  for (const [t, s] of Object.entries(map)) {
    const i = rest.byName.get(s);
    if (i == null) continue;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    W[i].decompose(p, q, sc);
    SP[t] = p; SR[t] = q;
  }
  // per bone correction C = inverse(S_rest_world) * F_s * inverse(F_t)
  const C = {};
  for (const n of TN) {
    if (!SR[n]) continue;
    const fs_ = buildFrame(frameDefs(n), (k) => SP[k]);
    const ft = FT[n];
    if (!fs_ || !ft) { C[n] = SR[n].clone().invert(); continue; }
    const qfs = new THREE.Quaternion().setFromRotationMatrix(fs_);
    const qft = new THREE.Quaternion().setFromRotationMatrix(ft);
    C[n] = SR[n].clone().invert().multiply(qfs).multiply(qft.invert());
  }
  // scale = ratio of hip-to-ankle heights (robust to rests whose root is not on the ground)
  let hipK = (TPOS.Hips.y - TPOS.LeftFoot.y) / (SP.Hips.y - SP.LeftFoot.y);
  if (def.groundRest) {
    // rest skeleton floats (e.g. BVH with root at 0): put its ground at y=0 like its animation data
    const dy = -(SP.LeftFoot.y - TPOS.LeftFoot.y / hipK);
    for (const k of Object.keys(SP)) SP[k].y += dy;
  }
  const r = { def, rest, map, restPose, SP, SR, C, hipK, srcCache: new Map() };
  rigCache.set(id, r);
  console.log(`rig ${id}: mapped ${Object.keys(SR).length}/${TN.length - 3} hipsY src=${SP.Hips.y.toFixed(3)} k=${hipK.toFixed(3)}`);
  return r;
}

async function srcFile(rig, file) {
  if (rig.srcCache.has(file)) return rig.srcCache.get(file);
  const s = await loadRig(file);
  rig.srcCache.set(file, s);
  return s;
}

// pose of the source at time t, evaluated in the SOURCE FILE's own hierarchy (its node TRS
// overridden by its channels). The rig's rest file only supplies the T/A-pose reference.
function sourceWorld(rig, src, animName, t) {
  const pose = src.nodes.map((n) => ({ t: n.t.slice(), r: n.r.slice(), s: n.s.slice() }));
  const a = src.anims[animName];
  for (const ch of a.channels) {
    const v = sampleCh(ch, t);
    if (ch.path === 'rotation') pose[ch.node].r = v;
    else if (ch.path === 'translation') pose[ch.node].t = v;
    else if (ch.path === 'scale') pose[ch.node].s = v;
  }
  return worldMats(src, pose);
}
import { sampleChannel as sampleCh } from './gltf_anim_lib.mjs';

const SOCKETS = job.sockets ? Object.fromEntries(JSON.parse(fs.readFileSync(job.sockets, 'utf8')).sockets.map((sk) => [sk.name, { p: V(sk.t), q: new THREE.Quaternion().fromArray(sk.r) }])) : {};
const SOCKET = SOCKETS.socket_weapon_r || null;
const MIRROR = (n) => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n;

// ---------------- retarget one clip ----------------
const TDIR = Object.fromEntries(TN.map((n) => {
  // rest direction of each bone (towards its main child), used by pose overrides
  const kid = { Hips: 'Spine', Spine2: 'Neck', LeftHand: 'LeftHandMiddle1', RightHand: 'RightHandMiddle1', Head: 'HeadTop_End' }[n] || TN.find((c) => TPARENT[c] === n);
  const d = kid ? TPOS[kid].clone().sub(TPOS[n]).normalize() : new THREE.Vector3(0, 1, 0);
  return [n, d];
}));
const UPPER = new Set(); // Spine1 and everything below it except legs
function fk(f) {
  const pos = {}, rot = {};
  for (const nm of TN) {
    const par = TPARENT[nm];
    if (!par) { pos[nm] = f.hips.clone(); rot[nm] = f.local[nm].clone(); continue; }
    rot[nm] = rot[par].clone().multiply(f.local[nm]);
    pos[nm] = V(TLOCAL[nm]).applyQuaternion(rot[par]).add(pos[par]);
  }
  return { pos, rot };
}
function toLocal(frames) {
  for (const f of frames) {
    const fullW = {}; f.local = {};
    for (const nm of TN) {
      const par = TPARENT[nm];
      const pw = par ? fullW[par] : new THREE.Quaternion();
      const w = f.world[nm] || pw.clone();
      fullW[nm] = w;
      f.local[nm] = pw.clone().invert().multiply(w).normalize();
    }
    f.world = fullW;
  }
  for (const nm of TN) for (let i = 1; i < frames.length; i++) { const a = frames[i - 1].local[nm], b = frames[i].local[nm]; if (a.dot(b) < 0) b.set(-b.x, -b.y, -b.z, -b.w); }
}
function toWorld(frames) {
  for (const f of frames) { const { rot } = fk(f); f.world = rot; }
}
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
const MAJOR = ['Hips', 'Spine1', 'Spine2', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

// sample the source and return target-space frames {world:{bone:quat}, hips:Vector3}
async function sampleFrames(spec) {
  const rig = await getRig(spec.rig);
  const src = await srcFile(rig, spec.src);
  const anim = spec.anim || Object.keys(src.anims)[0];
  if (!src.anims[anim]) throw new Error(`clip ${anim} not in ${spec.src}: ${Object.keys(src.anims).join(',')}`);
  const dur0 = src.anims[anim].duration;
  const ts = spec.timeScale || 1;
  const start = spec.start ?? src.anims[anim].start, end = Math.min(spec.end ?? dur0, dur0);
  const n = Math.max(2, Math.round((end - start) / ts * FPS) + 1);
  const times = [];
  for (let i = 0; i < n; i++) times.push(i / FPS);
  const frames = [];
  for (const t of times) {
    const W = sourceWorld(rig, src, anim, Math.min(end, start + t * ts));
    const world = {};
    let hips = null;
    for (const nm of TN) {
      const sn = rig.map[nm];
      const i = sn != null ? src.byName.get(sn) : null;
      if (i == null || !rig.C[nm]) { world[nm] = null; continue; }
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      W[i].decompose(p, q, s);
      world[nm] = q.multiply(rig.C[nm]);
      if (nm === 'Hips') hips = p.multiplyScalar(rig.def.posScale || 1);
    }
    const hp = hips.clone().sub(rig.SP.Hips).multiplyScalar(rig.hipK).add(TPOS.Hips);
    frames.push({ world, hips: hp });
  }
  if (spec.mirror) {
    for (const f of frames) {
      const w2 = {};
      for (const nm of TN) { const q = f.world[MIRROR(nm)]; w2[nm] = q ? new THREE.Quaternion(q.x, -q.y, -q.z, q.w) : null; }
      f.world = w2; f.hips.x = -f.hips.x;
    }
  }
  if (spec.alignYaw) {
    // rotate the whole clip about Y so the hips face +Z (at frame `alignYaw.frame`, default 0)
    const f0 = frames[spec.alignYaw.frame ?? 0];
    let yaw;
    if (spec.alignYaw.mode === 'motion') { const d = frames[frames.length - 1].hips.clone().sub(f0.hips); yaw = Math.atan2(d.x, d.z); }
    else { const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(f0.world.Hips); yaw = Math.atan2(fwd.x, fwd.z); }
    yaw += (spec.alignYaw.offset || 0) * Math.PI / 180;
    const R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    const c = f0.hips.clone();
    for (const f of frames) {
      for (const nm of TN) if (f.world[nm]) f.world[nm] = R.clone().multiply(f.world[nm]);
      const d = f.hips.clone().sub(c); d.y = 0; d.applyQuaternion(R);
      f.hips.x = c.x + d.x; f.hips.z = c.z + d.z;
    }
  }
  toLocal(frames);
  return { frames, times, anim, rig };
}

// estimate ground speed from the planted foot (works for in-place sources)
function footSpeed(frames) {
  const P = frames.map((f) => fk(f).pos);
  const feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
  let minY = Infinity; for (const p of P) for (const k of feet) minY = Math.min(minY, p[k].y);
  const vx = [], vz = [];
  for (let i = 1; i < P.length; i++) {
    // planted joint = lowest of the 4 in this frame (and the previous)
    let best = null, by = Infinity;
    for (const k of feet) { const y = Math.max(P[i][k].y, P[i - 1][k].y); if (y < by) { by = y; best = k; } }
    if (by - minY > 0.035) continue;
    const dy = Math.abs(P[i][best].y - P[i - 1][best].y);
    if (dy > 0.01) continue;
    vx.push((P[i][best].x - P[i - 1][best].x) * FPS); vz.push((P[i][best].z - P[i - 1][best].z) * FPS);
  }
  if (vx.length < 3) return null;
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const x = -med(vx), z = -med(vz);
  return { speed: Math.hypot(x, z), dir: [x, z], samples: vx.length };
}

async function retargetClip(spec) {
  const { frames, times, anim } = await sampleFrames(spec);
  // ---- layering: upper body (from `upper.root` down, excluding legs) from another clip ----
  if (spec.upper && spec.upper.roots) {
    // local override: descendants of each root (inclusive) take LOCAL rotations from the other clip
    const up = await sampleFrames({ ...spec.upper });
    const under = (nm) => { for (let n = nm; n; n = TPARENT[n]) if (spec.upper.roots.includes(n)) return true; return false; };
    const w = spec.upper.weight ?? 1;
    for (let i = 0; i < frames.length; i++) {
      const u = up.frames[Math.min(up.frames.length - 1, spec.upper.frame != null ? spec.upper.frame : i % up.frames.length)];
      for (const nm of TN) if (under(nm)) frames[i].local[nm] = w >= 1 ? u.local[nm].clone() : frames[i].local[nm].clone().slerp(u.local[nm], w);
    }
    toWorld(frames); toLocal(frames);
  } else if (spec.upper) {
    const up = await sampleFrames({ ...spec.upper, mirror: spec.upper.mirror });
    const root = spec.upper.root || 'Spine1';
    const isUpper = (nm) => { for (let n = nm; n; n = TPARENT[n]) if (n === root) return true; return false; };
    const blendSpine = spec.upper.spineBlend ?? true;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i], u = up.frames[Math.min(up.frames.length - 1, spec.upper.loop === false ? i : i % up.frames.length)];
      // world-stabilised: the upper root keeps the upper clip's WORLD rotation (aim stays level);
      // the correction is spread over the spine chain below it
      const wantRoot = u.world[root].clone();
      if (spec.upper.yawFromBase) {
        // keep base pelvis yaw
      }
      const curRoot = f.world[root].clone();
      const corr = wantRoot.clone().multiply(curRoot.clone().invert());
      const chain = []; for (let n = TPARENT[root]; n && n !== 'Hips'; n = TPARENT[n]) chain.unshift(n);
      chain.push(root);
      // apply fractions of corr cumulatively along the chain (in world space)
      const k = chain.length;
      for (let c = 0; c < k; c++) {
        const frac = blendSpine ? (c + 1) / k : (c === k - 1 ? 1 : 0);
        const q = new THREE.Quaternion().slerp(corr, frac);
        f.world[chain[c]] = q.multiply(f.world[chain[c]]);
      }
      // descendants of root: take upper-clip local rotations
      const nw = { ...f.world };
      for (const nm of TN) {
        if (nm === root || !isUpper(nm)) continue;
        nw[nm] = nw[TPARENT[nm]].clone().multiply(u.local[nm]);
      }
      // re-derive world for non-upper bones below modified spine (none: legs hang off Hips)
      f.world = nw;
    }
    toLocal(frames);
  }
  // ---- pose overrides (character-space) ----
  if (spec.pose) {
    for (const f of frames) {
      for (const [bone, o] of Object.entries(spec.pose)) {
        let q;
        if (o.aim) {
          q = new THREE.Quaternion().setFromUnitVectors(TDIR[bone], V(o.aim).normalize());
          if (o.twist) q = new THREE.Quaternion().setFromAxisAngle(V(o.aim).normalize(), o.twist * Math.PI / 180).multiply(q);
        } else if (o.euler) q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.euler.map((d) => d * Math.PI / 180), 'XYZ'));
        else if (o.relEuler) { q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.relEuler.map((d) => d * Math.PI / 180), 'XYZ')).multiply(f.world[bone]); }
        if (o.weight != null && o.weight < 1) q = f.world[bone].clone().slerp(q, o.weight);
        f.world[bone] = q;
        if (o.keepChildren) { /* children keep their world rotation: handled by toLocal */ }
      }
    }
    // pose overrides are world rotations for listed bones; unlisted children keep their LOCAL rotation
    for (const f of frames) {
      const listed = new Set(Object.keys(spec.pose));
      const nw = {};
      for (const nm of TN) {
        const par = TPARENT[nm];
        if (listed.has(nm) || !par) nw[nm] = f.world[nm];
        else nw[nm] = nw[par].clone().multiply(f.local[nm]);
      }
      f.world = nw;
    }
    toLocal(frames);
  }
  if (spec.rootRot) {
    const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rootRot.map((d) => d * Math.PI / 180), 'XYZ'));
    for (const f of frames) f.local.Hips = R.clone().multiply(f.local.Hips);
  }

  const meta = { name: spec.name, loop: !!spec.loop, mode: spec.mode || 'keep', source: spec.source, license: spec.license, src_clip: anim, src_file: path.basename(spec.src) };
  if (spec.notes) meta.notes = spec.notes;
  // ---- auto loop: find the [start,end] window whose end pose best matches its start pose ----
  if (spec.autoLoop && frames.length > 10) {
    const N = frames.length;
    const minLen = Math.floor(N * (spec.autoLoop.min ?? 0.4));
    const maxStart = Math.floor(N * (spec.autoLoop.maxStart ?? 0.35));
    const err = (a, b) => {
      let e = 0;
      for (const nm of MAJOR) e += angle(frames[a].local[nm], frames[b].local[nm]);
      e += Math.abs(frames[a].hips.y - frames[b].hips.y) * 10;
      // velocity match (next-frame deltas)
      if (a + 1 < N && b + 1 < N) for (const nm of ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']) e += 0.5 * Math.abs(angle(frames[a].local[nm], frames[a + 1].local[nm]) - angle(frames[b].local[nm], frames[b + 1].local[nm])) * 10;
      return e;
    };
    let best = [0, N - 1], bestErr = err(0, N - 1);
    for (let a = 0; a <= maxStart; a++) for (let b = a + minLen; b < N; b++) {
      const e = err(a, b) - (b - a) / N * 0.02; // tiny preference for longer windows
      if (e < bestErr) { bestErr = e; best = [a, b]; }
    }
    const [a, b] = best;
    frames.splice(b + 1); frames.splice(0, a);
    times.length = frames.length; for (let i = 0; i < times.length; i++) times[i] = i / FPS;
    meta.auto_loop = { start_frame: a, end_frame: b, err: +bestErr.toFixed(3) };
  }
  // ---- loop closure: sources that omit the closing frame (end pose == pose one frame before start) ----
  if (spec.loop && frames.length > 4 && spec.mode !== 'static') {
    const N = frames.length - 1;
    const d = (a, b) => MAJOR.reduce((acc, nm) => acc + angle(frames[a].local[nm], frames[b].local[nm]), 0);
    let step = 0; for (let i = 0; i < N; i++) step += d(i, i + 1); step /= N;
    const gap = d(N, 0);
    if (gap > 0.35 * step && gap < 2.0 * step) {
      // append a copy of frame 0 one frame later (hips continue at the clip's mean velocity)
      const v = frames[N].hips.clone().sub(frames[0].hips).multiplyScalar(1 / N);
      const f0 = frames[0];
      const nf = { hips: f0.hips.clone(), local: Object.fromEntries(TN.map((n) => [n, f0.local[n].clone()])) };
      nf.hips.copy(frames[N].hips.clone().add(v)).setY(f0.hips.y);
      frames.push(nf); times.push(times[N] + 1 / FPS);
      meta.loop_closed = true;
    }
  }
  // ---- aim fix: rotate the spine so the weapon (socket_weapon_r +Z) points exactly forward & level ----
  // ---- static pose: pick the frame now (before aim fix / ground) ----
  const SOCK = SOCKETS[spec.socket || 'socket_weapon_r'];
  if (spec.mode === 'static') {
    let hf = spec.holdFrame ?? 0;
    if (typeof hf === 'string' && hf.endsWith('%')) hf = Math.round(parseFloat(hf) / 100 * (frames.length - 1));
    if (spec.pickFrame && SOCK) {
      let best = -Infinity;
      frames.forEach((f, i) => { const { rot } = fk(f); const d = new THREE.Vector3(0, 0, 1).applyQuaternion(rot.RightHand.clone().multiply(SOCK.q)); const v = spec.pickFrame === 'maxPitch' ? d.y : -d.y; if (v > best) { best = v; hf = i; } });
      meta.picked_frame = hf;
    }
    if (spec.aimFix && spec.aimFix.yawFromLevel && SOCK) {
      // yaw correction measured on the most level frame of the source (barrel yaw is ill-defined near vertical)
      let bi = 0, bp = Infinity;
      frames.forEach((f, i) => { const { rot } = fk(f); const d = new THREE.Vector3(0, 0, 1).applyQuaternion(rot.RightHand.clone().multiply(SOCK.q)); if (Math.abs(d.y) < bp) { bp = Math.abs(d.y); bi = i; } });
      const { rot } = fk(frames[bi]); const d = new THREE.Vector3(0, 0, 1).applyQuaternion(rot.RightHand.clone().multiply(SOCK.q));
      spec = { ...spec, aimFix: { ...spec.aimFix, fixedYaw: Math.atan2(d.x, d.z) } };
    }
    const keep = frames[Math.min(frames.length - 1, hf)];
    frames.length = 0; frames.push(keep); times.length = 0; times.push(0);
  }
  if (spec.aimFix && SOCK) {
    const target = spec.aimFix.dir ? V(spec.aimFix.dir).normalize() : new THREE.Vector3(0, 0, 1);
    for (let iter = 0; iter < 3; iter++) {
      let yaw = 0, pitch = 0;
      for (const f of frames) {
        const { rot } = fk(f);
        const d = new THREE.Vector3(0, 0, 1).applyQuaternion(rot.RightHand.clone().multiply(SOCK.q));
        yaw += Math.atan2(d.x, d.z) - Math.atan2(target.x, target.z);
        pitch += Math.asin(Math.max(-1, Math.min(1, d.y))) - Math.asin(target.y);
      }
      yaw /= frames.length; pitch /= frames.length;
      if (spec.aimFix.pitch === false) pitch = 0;
      if (spec.aimFix.fixedYaw != null) yaw = iter === 0 ? spec.aimFix.fixedYaw : 0;
      if (iter === 0) meta.aim_fix_deg = { yaw: +(-yaw * 180 / Math.PI).toFixed(1), pitch: +(-pitch * 180 / Math.PI).toFixed(1) };
      const yawChain = spec.aimFix.yawChain || ['Hips'];
      const pitchChain = spec.aimFix.pitchChain || ['Spine', 'Spine1', 'Spine2'];
      for (const f of frames) {
        toWorld([f]);
        const ry = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw / yawChain.length);
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(f.world.Spine2); fwd.y = 0; fwd.normalize();
        const lat = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
        const rp = new THREE.Quaternion().setFromAxisAngle(lat, pitch / pitchChain.length);
        const nw = {};
        for (const nm of TN) {
          const par = TPARENT[nm];
          nw[nm] = par ? nw[par].clone().multiply(f.local[nm]) : f.world[nm].clone();
          if (yawChain.includes(nm)) nw[nm] = ry.clone().multiply(nw[nm]);
          if (pitchChain.includes(nm)) nw[nm] = rp.clone().multiply(nw[nm]);
        }
        f.world = nw; toLocal([f]);
      }
    }
    for (const nm of TN) for (let i = 1; i < frames.length; i++) { const a = frames[i - 1].local[nm], b = frames[i].local[nm]; if (a.dot(b) < 0) b.set(-b.x, -b.y, -b.z, -b.w); }
  }
  const T = times[times.length - 1];
  meta.duration = +T.toFixed(4);
  // ---- root motion measure / strip ----
  const p0 = frames[0].hips.clone(), p1 = frames[frames.length - 1].hips.clone();
  const D = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z);
  if (spec.mode === 'loco') {
    const fsd = footSpeed(frames);
    const rootSpeed = D.length() / T;
    if (rootSpeed > 0.05) {
      meta.speed_mps = +rootSpeed.toFixed(3);
      meta.move_dir = [+(-D.x / D.length()).toFixed(3) || 0, +(D.z / D.length()).toFixed(3) || 0]; // [right, forward]
      meta.speed_source = 'root_motion';
      if (fsd) meta.foot_speed_mps = +fsd.speed.toFixed(3);
    } else if (fsd) {
      meta.speed_mps = +fsd.speed.toFixed(3);
      meta.move_dir = [+(-fsd.dir[0] / fsd.speed).toFixed(3) || 0, +(fsd.dir[1] / fsd.speed).toFixed(3) || 0]; // [right, forward]
      meta.speed_source = 'planted_foot';
    }
    if (spec.speedOverride) { meta.speed_mps = spec.speedOverride; meta.speed_source = 'manual'; }
    const res = frames.map((f, i) => { const tt = times[i]; return new THREE.Vector3(f.hips.x - p0.x - D.x * tt / T, 0, f.hips.z - p0.z - D.z * tt / T); });
    const mean = res.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / res.length);
    frames.forEach((f, i) => { f.hips.x = TPOS.Hips.x + res[i].x - mean.x; f.hips.z = TPOS.Hips.z + res[i].z - mean.z; });
  } else if (spec.mode === 'oneshot') {
    frames.forEach((f) => { f.hips.x = TPOS.Hips.x + f.hips.x - p0.x; f.hips.z = TPOS.Hips.z + f.hips.z - p0.z; });
  } else if (spec.mode === 'inplace' || spec.mode === 'static') {
    const mx = frames.reduce((a, f) => a + f.hips.x, 0) / frames.length, mz = frames.reduce((a, f) => a + f.hips.z, 0) / frames.length;
    frames.forEach((f) => { f.hips.x = TPOS.Hips.x + f.hips.x - mx; f.hips.z = TPOS.Hips.z + f.hips.z - mz; });
  }
  if (spec.hipsOffset) frames.forEach((f) => { f.hips.add(V(spec.hipsOffset)); });
  // ---- ground correction: put the lowest foot contact at the rest toe height ----
  if (spec.ground) {
    const footY = (f) => {
      const { pos } = fk(f);
      const toeH = TPOS.LeftToeBase.y, heel = TPOS.LeftFoot.y;
      return Math.min(pos.LeftToeBase.y - toeH, pos.RightToeBase.y - toeH, pos.LeftFoot.y - heel, pos.RightFoot.y - heel);
    };
    const ys = frames.map(footY).sort((a, b) => a - b);
    const low = ys[Math.floor(ys.length * (spec.groundPct ?? 0.1))];
    const off = -low;
    meta.ground_offset = +off.toFixed(3);
    if (Math.abs(off) > 0.003) frames.forEach((f) => { f.hips.y += off; });
  }
  // ---- static pose ----
  if (spec.mode === 'static') {
    const f = frames[0];
    const hold = spec.hold || 1;
    frames.length = 0; times.length = 0;
    const nf = spec.osc ? Math.round(hold * FPS) + 1 : 2;
    for (let i = 0; i < nf; i++) { frames.push({ hips: f.hips.clone(), local: Object.fromEntries(TN.map((n) => [n, f.local[n].clone()])) }); times.push(i * hold / (nf - 1)); }
    meta.duration = hold;
  }
  // ---- procedural oscillation (breathing / sway / flutter) ----
  if (spec.osc) {
    const T0 = times[times.length - 1];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]; toWorld([f]);
      const listed = {};
      for (const o of spec.osc) {
        const per = o.period || T0;
        const ang = (o.deg * Math.PI / 180) * Math.sin(2 * Math.PI * (times[i] / per + (o.phase || 0)));
        const q = new THREE.Quaternion().setFromAxisAngle(V(o.axis).normalize(), ang);
        for (const b of o.bones) listed[b] = listed[b] ? q.clone().multiply(listed[b]) : q.clone();
      }
      const nw = {};
      for (const nm of TN) {
        const par = TPARENT[nm];
        nw[nm] = par ? nw[par].clone().multiply(f.local[nm]) : f.world[nm].clone();
        if (listed[nm]) nw[nm] = listed[nm].clone().multiply(nw[nm]);
      }
      if (spec.oscHips) f.hips.y += spec.oscHips * Math.sin(2 * Math.PI * times[i] / (spec.osc[0].period || T0));
      f.world = nw; toLocal([f]);
    }
    for (const nm of TN) for (let i = 1; i < frames.length; i++) { const a = frames[i - 1].local[nm], b = frames[i].local[nm]; if (a.dot(b) < 0) b.set(-b.x, -b.y, -b.z, -b.w); }
  }
  // ---- loop fix ----
  if (spec.loop && spec.fixLoop !== false && frames.length > 2) {
    const N = frames.length - 1;
    let maxAng = 0;
    for (const nm of TN) {
      const a = frames[0].local[nm], b = frames[N].local[nm];
      const diff = a.clone().multiply(b.clone().invert());
      const ang = angle(a, b);
      if (ang > maxAng) { maxAng = ang; meta.loop_fix_bone = nm; }
      if (ang < 1e-4) continue;
      for (let i = 0; i <= N; i++) { const q = new THREE.Quaternion().slerp(diff, times[i] / times[N]); frames[i].local[nm] = q.multiply(frames[i].local[nm]).normalize(); }
    }
    const dh = frames[0].hips.clone().sub(frames[N].hips);
    for (let i = 0; i <= N; i++) frames[i].hips.addScaledVector(dh, times[i] / times[N]);
    meta.loop_fix_deg = +(maxAng * 180 / Math.PI).toFixed(2);
  }
  // ---- summary heights (useful for seats / water line) ----
  {
    let hy = 0, hd = 0;
    for (const f of frames) { const { pos } = fk(f); hy += pos.Hips.y; hd += pos.Head.y; }
    meta.hips_y_mean = +(hy / frames.length).toFixed(3); meta.head_y_mean = +(hd / frames.length).toFixed(3);
    if (spec.mode === 'oneshot') { const a = frames[0].hips, b = frames[frames.length - 1].hips; meta.root_displacement = { right: +(a.x - b.x).toFixed(3) || 0, up: +(b.y - a.y).toFixed(3) || 0, forward: +(b.z - a.z).toFixed(3) || 0 }; }
  }
  return { meta, times, frames };
}

// ---------------- write output ----------------
const allMeta = fs.existsSync(job.meta || '') ? JSON.parse(fs.readFileSync(job.meta, 'utf8')) : {};
for (const [out, specs] of Object.entries(job.outputs)) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const arm = doc.createNode('Armature');
  scene.addChild(arm);
  const nodes = {};
  for (const nm of TN) {
    const nd = doc.createNode(nm).setTranslation(TLOCAL[nm]);
    nodes[nm] = nd;
    (TPARENT[nm] ? nodes[TPARENT[nm]] : arm).addChild(nd);
  }
  const metas = {};
  for (const spec of specs) {
    let r;
    try { r = await retargetClip(spec); } catch (e) { console.error('FAILED', spec.name, e.message); continue; }
    const { meta, times, frames } = r;
    const anim = doc.createAnimation(spec.name);
    const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buf);
    for (const nm of TN) {
      if (nm.endsWith('_End')) continue;
      const arr = new Float32Array(frames.length * 4);
      frames.forEach((f, i) => f.local[nm].toArray(arr, i * 4));
      // skip channels that never move away from identity
      let moving = false; for (let i = 0; i < frames.length && !moving; i++) if (Math.abs(arr[i * 4 + 3]) < 0.99999) moving = true;
      if (!moving && nm !== 'Hips') continue;
      const out_ = doc.createAccessor().setType('VEC4').setArray(arr).setBuffer(buf);
      const smp = doc.createAnimationSampler().setInput(input).setOutput(out_).setInterpolation('LINEAR');
      anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(nodes[nm]).setTargetPath('rotation').setSampler(smp));
    }
    const harr = new Float32Array(frames.length * 3);
    frames.forEach((f, i) => f.hips.toArray(harr, i * 3));
    const hout = doc.createAccessor().setType('VEC3').setArray(harr).setBuffer(buf);
    const hs = doc.createAnimationSampler().setInput(input).setOutput(hout).setInterpolation('LINEAR');
    anim.addSampler(hs).addChannel(doc.createAnimationChannel().setTargetNode(nodes.Hips).setTargetPath('translation').setSampler(hs));
    meta.file = path.basename(out);
    const ex = { loop: meta.loop, mode: meta.mode, duration: meta.duration };
    for (const k of ['speed_mps', 'move_dir', 'root_displacement', 'hips_y_mean', 'head_y_mean', 'aim_fix_deg', 'notes']) if (meta[k] != null) ex[k] = meta[k];
    anim.setExtras(ex);
    metas[spec.name] = meta;
    console.log(`  ${spec.name.padEnd(22)} dur=${meta.duration.toFixed(2)} ${meta.speed_mps != null ? 'v=' + meta.speed_mps + ' dir=' + meta.move_dir : ''} ${meta.loop_fix_deg != null ? 'loopfix=' + meta.loop_fix_deg + '(' + meta.loop_fix_bone + ')' : ''} ${meta.ground_offset != null ? 'ground=' + meta.ground_offset : ''}`);
  }
  await doc.transform(resample({ tolerance: job.tolerance ?? 1e-4 }), dedup(), prune({ keepLeaves: true }));
  if (!job.noMeshopt) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  Object.assign(allMeta, metas);
  console.log('WROTE', out, fs.statSync(out).size, 'bytes,', Object.keys(metas).length, 'clips');
}
if (job.meta) fs.writeFileSync(job.meta, JSON.stringify(allMeta, null, 1));
