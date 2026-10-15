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
  const hipK = TPOS.Hips.y / SP.Hips.y;
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

// pose of the source at time t: rest TRS overridden by the clip's channels (matched by node name)
function sourceWorld(rig, src, animName, t) {
  const pose = rig.rest.nodes.map((n) => ({ t: n.t.slice(), r: n.r.slice(), s: n.s.slice() }));
  // apply rest-anim baseline first (if the rest comes from a clip)
  if (rig.def.restAnim) rig.restPose.forEach((p, i) => { pose[i] = { t: p.t.slice(), r: p.r.slice(), s: p.s.slice() }; });
  const a = src.anims[animName];
  for (const ch of a.channels) {
    const nm = src.nodes[ch.node].name;
    const i = rig.rest.byName.get(nm);
    if (i == null) continue;
    const v = sampleCh(ch, t);
    if (ch.path === 'rotation') pose[i].r = v;
    else if (ch.path === 'translation') pose[i].t = v;
    else if (ch.path === 'scale') pose[i].s = v;
  }
  return worldMats(rig.rest, pose);
}
import { sampleChannel as sampleCh } from './gltf_anim_lib.mjs';

const MIRROR = (n) => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n;

// ---------------- retarget one clip ----------------
async function retargetClip(spec) {
  const rig = await getRig(spec.rig);
  const src = await srcFile(rig, spec.src);
  const anim = spec.anim || Object.keys(src.anims)[0];
  if (!src.anims[anim]) throw new Error(`clip ${anim} not in ${spec.src}: ${Object.keys(src.anims).join(',')}`);
  const dur0 = src.anims[anim].duration;
  const start = spec.start ?? 0, end = Math.min(spec.end ?? dur0, dur0);
  let n = Math.max(2, Math.round((end - start) * FPS) + 1);
  const times = [];
  for (let i = 0; i < n; i++) times.push(Math.min(end, start + i / FPS));
  // world rotations + hips pos for each frame (target space)
  const frames = [];
  for (const t of times) {
    const W = sourceWorld(rig, src, anim, t);
    const world = {};
    let hips = null;
    for (const nm of TN) {
      const sn = rig.map[nm];
      const i = sn != null ? rig.rest.byName.get(sn) : null;
      if (i == null || !rig.C[nm]) { world[nm] = null; continue; }
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      W[i].decompose(p, q, s);
      world[nm] = q.multiply(rig.C[nm]);
      if (nm === 'Hips') hips = p;
    }
    const hp = hips.clone().sub(rig.SP.Hips).multiplyScalar(rig.hipK).add(TPOS.Hips);
    frames.push({ world, hips: hp });
  }
  // mirror (swap L/R, reflect across X)
  if (spec.mirror) {
    for (const f of frames) {
      const w2 = {};
      for (const nm of TN) { const q = f.world[MIRROR(nm)]; w2[nm] = q ? new THREE.Quaternion(q.x, -q.y, -q.z, q.w) : null; }
      f.world = w2; f.hips.x = -f.hips.x;
    }
  }
  // world -> local (unmapped joints keep identity local)
  for (const f of frames) {
    const fullW = {}; f.local = {};
    for (const nm of TN) {
      const par = TPARENT[nm];
      const pw = par ? fullW[par] : new THREE.Quaternion();
      const w = f.world[nm] || pw.clone();
      fullW[nm] = w;
      f.local[nm] = pw.clone().invert().multiply(w).normalize();
    }
    f.fullW = fullW;
  }
  // continuity of quaternion sign
  for (const nm of TN) for (let i = 1; i < frames.length; i++) { const a = frames[i - 1].local[nm], b = frames[i].local[nm]; if (a.dot(b) < 0) b.set(-b.x, -b.y, -b.z, -b.w); }

  const meta = { name: spec.name, duration: +(times[times.length - 1] - times[0]).toFixed(4), loop: !!spec.loop, mode: spec.mode || 'keep', source: spec.source, license: spec.license, src_clip: anim, src_file: path.basename(spec.src) };
  // ---- root motion measure / strip (in target meters) ----
  const T = meta.duration;
  const p0 = frames[0].hips.clone(), p1 = frames[frames.length - 1].hips.clone();
  const D = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z);
  if (spec.mode === 'loco') {
    meta.speed_mps = +(D.length() / T).toFixed(3);
    meta.move_dir = [+(D.x / (D.length() || 1)).toFixed(3), +(D.z / (D.length() || 1)).toFixed(3)];
    const res = frames.map((f, i) => { const tt = i / FPS; return new THREE.Vector3(f.hips.x - p0.x - D.x * tt / T, 0, f.hips.z - p0.z - D.z * tt / T); });
    const mean = res.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / res.length);
    frames.forEach((f, i) => { f.hips.x = TPOS.Hips.x + res[i].x - mean.x; f.hips.z = TPOS.Hips.z + res[i].z - mean.z; });
  } else if (spec.mode === 'oneshot') {
    meta.root_displacement = [+D.x.toFixed(3), +D.z.toFixed(3)];
    frames.forEach((f) => { f.hips.x = TPOS.Hips.x + f.hips.x - p0.x; f.hips.z = TPOS.Hips.z + f.hips.z - p0.z; });
  } else if (spec.mode === 'inplace') {
    // remove all horizontal hips motion except the oscillation around the mean
    const mx = frames.reduce((a, f) => a + f.hips.x, 0) / frames.length, mz = frames.reduce((a, f) => a + f.hips.z, 0) / frames.length;
    frames.forEach((f) => { f.hips.x = TPOS.Hips.x + f.hips.x - mx; f.hips.z = TPOS.Hips.z + f.hips.z - mz; });
  }
  if (spec.hipsOffset) frames.forEach((f) => { f.hips.add(V(spec.hipsOffset)); });
  // ---- ground correction: keep the lowest foot at the rest foot height ----
  if (spec.ground) {
    const footY = (f) => {
      // compute joint world positions by FK from locals
      const pos = {}; const rot = {};
      for (const nm of TN) {
        const par = TPARENT[nm];
        if (!par) { pos[nm] = f.hips.clone(); rot[nm] = f.local[nm].clone(); continue; }
        rot[nm] = rot[par].clone().multiply(f.local[nm]);
        pos[nm] = V(TLOCAL[nm]).applyQuaternion(rot[par]).add(pos[par]);
      }
      return Math.min(pos.LeftToeBase.y, pos.RightToeBase.y, pos.LeftFoot.y - (TPOS.LeftFoot.y - TPOS.LeftToeBase.y), pos.RightFoot.y - (TPOS.RightFoot.y - TPOS.LeftToeBase.y));
    };
    const ys = frames.map(footY).sort((a, b) => a - b);
    const low = ys[Math.floor(ys.length * 0.1)];
    const off = TPOS.LeftToeBase.y - low;
    meta.ground_offset = +off.toFixed(3);
    if (Math.abs(off) > 0.003) frames.forEach((f) => { f.hips.y += off; });
  }
  // ---- static pose: hold a single frame ----
  if (spec.mode === 'static' || spec.hold) {
    const f = frames[spec.holdFrame ?? 0];
    const hold = spec.hold || 1;
    frames.length = 0; frames.push(f, f);
    times.length = 0; times.push(0, hold);
    meta.duration = hold;
  }
  // ---- loop fix: distribute end->start mismatch over the clip ----
  if (spec.loop && spec.fixLoop !== false && frames.length > 2) {
    const N = frames.length - 1;
    let maxAng = 0;
    for (const nm of TN) {
      const a = frames[0].local[nm], b = frames[N].local[nm];
      const diff = a.clone().multiply(b.clone().invert());
      const ang = 2 * Math.acos(Math.min(1, Math.abs(diff.w)));
      maxAng = Math.max(maxAng, ang);
      if (ang < 1e-4) continue;
      for (let i = 0; i <= N; i++) { const q = new THREE.Quaternion().slerp(diff, i / N); frames[i].local[nm] = q.multiply(frames[i].local[nm]).normalize(); }
    }
    const dh = frames[0].hips.clone().sub(frames[N].hips);
    for (let i = 0; i <= N; i++) frames[i].hips.addScaledVector(dh, i / N);
    meta.loop_fix_deg = +(maxAng * 180 / Math.PI).toFixed(2);
  }
  return { meta, times: times.map((t) => t - times[0]), frames };
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
    anim.setExtras({ loop: meta.loop, speed_mps: meta.speed_mps ?? null, mode: meta.mode });
    metas[spec.name] = meta;
    console.log(`  ${spec.name.padEnd(22)} dur=${meta.duration.toFixed(2)} ${meta.speed_mps != null ? 'v=' + meta.speed_mps + ' dir=' + meta.move_dir : ''} ${meta.loop_fix_deg != null ? 'loopfix=' + meta.loop_fix_deg : ''} ${meta.ground_offset != null ? 'ground=' + meta.ground_offset : ''}`);
  }
  await doc.transform(resample({ tolerance: job.tolerance ?? 1e-4 }), dedup(), prune({ keepLeaves: true }));
  if (!job.noMeshopt) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  Object.assign(allMeta, metas);
  console.log('WROTE', out, fs.statSync(out).size, 'bytes,', Object.keys(metas).length, 'clips');
}
if (job.meta) fs.writeFileSync(job.meta, JSON.stringify(allMeta, null, 1));
