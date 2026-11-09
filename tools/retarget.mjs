// Retarget 100STYLE / EMM BVH motion capture (CC BY 4.0) onto the Microsoft Rocketbox skeleton and
// cut seamless, phase-aligned loops: in-place locomotion with measured speeds, an idle loop.
//
// Retargeting is done in world space. Every mapped target bone gets a constant alignment that
// turns its bind pose into the source's rest (T) pose, compared by bone direction plus a side
// axis, so the clip works whatever pose the target was bound in. Per frame:
//   targetWorld = sourceWorld * align * targetBind,   targetLocal = parentWorld^-1 * targetWorld
// The root follows the source hips (scaled by leg length), is grounded on the lower foot and made
// in-place by removing the cycle's average travel. Loops start at a left-foot contact so
// directional clips blend in step, and end with a crossfade into the frames before the start.
//
// usage: node tools/retarget.mjs <out.glb> <rocketbox-character.glb> <100STYLE dir> [style=Swat]
//        node tools/retarget.mjs <out.glb> <rocketbox-character.glb> <one-take.bvh>   (EMM: clips found in one take)
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { NodeIO, Document } from '@gltf-transform/core';

const [outFile, targetGlb, styleRoot, style = 'Swat', torqueDir = null] = process.argv.slice(2);
const OUT_FPS = 30;
const SRC_FPS = 60;

// ---- target skeleton (Rocketbox) ------------------------------------------------------------
const io = new NodeIO();
const tdoc = await io.read(targetGlb);
const tScene = tdoc.getRoot().listScenes()[0];
const T = new Map();
const tRoot = new THREE.Object3D();
function mirror(node, parent) {
  const name = node.getName();
  if (parent !== tRoot && !/^Bip01/.test(name)) return;
  const o = new THREE.Object3D();
  o.name = name;
  o.position.fromArray(node.getTranslation());
  o.quaternion.fromArray(node.getRotation());
  o.scale.fromArray(node.getScale());
  parent.add(o);
  T.set(name, o);
  for (const c of node.listChildren()) mirror(c, o);
}
for (const top of tScene.listChildren()) mirror(top, tRoot);
tRoot.updateMatrixWorld(true);
const charRoot = tRoot.children.find((o) => o.getObjectByName('Bip01'));
const bindWorldQ = new Map(), bindWorldP = new Map();
for (const [n, o] of T) { bindWorldQ.set(n, o.getWorldQuaternion(new THREE.Quaternion())); bindWorldP.set(n, o.getWorldPosition(new THREE.Vector3())); }

// ---- mapping --------------------------------------------------------------------------------
const MAP = {
  Hips: 'Bip01 Pelvis', Chest: 'Bip01 Spine', Chest2: 'Bip01 Spine1', Chest4: 'Bip01 Spine2', Neck: 'Bip01 Neck', Head: 'Bip01 Head',
  RightCollar: 'Bip01 R Clavicle', RightShoulder: 'Bip01 R UpperArm', RightElbow: 'Bip01 R Forearm', RightWrist: 'Bip01 R Hand',
  LeftCollar: 'Bip01 L Clavicle', LeftShoulder: 'Bip01 L UpperArm', LeftElbow: 'Bip01 L Forearm', LeftWrist: 'Bip01 L Hand',
  RightHip: 'Bip01 R Thigh', RightKnee: 'Bip01 R Calf', RightAnkle: 'Bip01 R Foot', RightToe: 'Bip01 R Toe0',
  LeftHip: 'Bip01 L Thigh', LeftKnee: 'Bip01 L Calf', LeftAnkle: 'Bip01 L Foot', LeftToe: 'Bip01 L Toe0',
};
// direction targets (the joint each bone points at) on both skeletons; null = fixed world axis
const S_CHILD = { Hips: 'Chest', Chest: 'Chest2', Chest2: 'Chest3', Chest4: 'Neck', Neck: 'Head', Head: null, RightCollar: 'RightShoulder', RightShoulder: 'RightElbow', RightElbow: 'RightWrist', RightWrist: null, LeftCollar: 'LeftShoulder', LeftShoulder: 'LeftElbow', LeftElbow: 'LeftWrist', LeftWrist: null, RightHip: 'RightKnee', RightKnee: 'RightAnkle', RightAnkle: 'RightToe', RightToe: null, LeftHip: 'LeftKnee', LeftKnee: 'LeftAnkle', LeftAnkle: 'LeftToe', LeftToe: null };
const T_CHILD = { 'Bip01 Pelvis': 'Bip01 Spine', 'Bip01 Spine': 'Bip01 Spine1', 'Bip01 Spine1': 'Bip01 Spine2', 'Bip01 Spine2': 'Bip01 Neck', 'Bip01 Neck': 'Bip01 Head', 'Bip01 Head': null, 'Bip01 R Clavicle': 'Bip01 R UpperArm', 'Bip01 R UpperArm': 'Bip01 R Forearm', 'Bip01 R Forearm': 'Bip01 R Hand', 'Bip01 R Hand': null, 'Bip01 L Clavicle': 'Bip01 L UpperArm', 'Bip01 L UpperArm': 'Bip01 L Forearm', 'Bip01 L Forearm': 'Bip01 L Hand', 'Bip01 L Hand': null, 'Bip01 R Thigh': 'Bip01 R Calf', 'Bip01 R Calf': 'Bip01 R Foot', 'Bip01 R Foot': 'Bip01 R Toe0', 'Bip01 R Toe0': null, 'Bip01 L Thigh': 'Bip01 L Calf', 'Bip01 L Calf': 'Bip01 L Foot', 'Bip01 L Foot': 'Bip01 L Toe0', 'Bip01 L Toe0': null };
// end bones without a child: keep pointing the way their parent bone does (head up, toes forward)
const FIXED = { Head: [0, 1, 0], RightToe: [0, 0, 1], LeftToe: [0, 0, 1] };
const armLike = (s) => /Collar|Shoulder|Elbow|Wrist/.test(s);

// ---- load a BVH take, sampled per source frame ----------------------------------------------
function loadTake(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const { skeleton, clip } = new BVHLoader().parse(txt);
  const bones = new Map(skeleton.bones.map((b) => [b.name, b]));
  const root = skeleton.bones[0];
  const holder = new THREE.Object3D();
  holder.add(root);
  holder.updateMatrixWorld(true);
  // rest pose (all rotations zero): world positions
  const restP = new Map();
  for (const [n, b] of bones) restP.set(n, b.getWorldPosition(new THREE.Vector3()));
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  return { bones, root, holder, mixer, clip, restP, frames: Math.round(clip.duration * SRC_FPS) + 1 };
}

// alignment rotations for a take's rest pose
function alignments(take) {
  const A = new Map();
  const basis = (dir, side) => {
    const x = dir.clone().normalize();
    const y = side.clone().addScaledVector(x, -side.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  for (const [s, t] of Object.entries(MAP)) {
    const sc = S_CHILD[s], tc = T_CHILD[t];
    const sDir = sc ? take.restP.get(sc).clone().sub(take.restP.get(s)) : null;
    let tDir = tc ? bindWorldP.get(tc).clone().sub(bindWorldP.get(t)) : null;
    let sD = sDir, tD = tDir;
    if (!sD || !tD) {
      if (FIXED[s]) { sD = new THREE.Vector3(...FIXED[s]); tD = sD.clone(); }
      else {
        // wrists: continue the forearm
        const sp = s.replace('Wrist', 'Elbow'), tp = t.replace('Hand', 'Forearm');
        sD = take.restP.get(s).clone().sub(take.restP.get(sp));
        tD = bindWorldP.get(t).clone().sub(bindWorldP.get(tp));
      }
    }
    const side = armLike(s) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const Bs = basis(sD, side), Bt = basis(tD, side);
    const m = Bs.clone().multiply(Bt.clone().transpose());
    A.set(s, new THREE.Quaternion().setFromRotationMatrix(m));
  }
  return A;
}

// per-frame source world rotations and a few positions
function sampleTake(take) {
  const n = take.frames, names = Object.keys(MAP);
  const rot = new Map(names.map((s) => [s, new Float32Array(n * 4)]));
  const hips = new Float32Array(n * 3), lAnk = new Float32Array(n * 3), rAnk = new Float32Array(n * 3), lHip = new Float32Array(n * 3), rHip = new Float32Array(n * 3);
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    take.mixer.setTime(f / SRC_FPS);
    take.holder.updateMatrixWorld(true);
    for (const s of names) { take.bones.get(s).getWorldQuaternion(q); rot.get(s).set([q.x, q.y, q.z, q.w], f * 4); }
    const put = (arr, name) => { take.bones.get(name).getWorldPosition(v); arr.set([v.x, v.y, v.z], f * 3); };
    put(hips, 'Hips'); put(lAnk, 'LeftAnkle'); put(rAnk, 'RightAnkle'); put(lHip, 'LeftHip'); put(rHip, 'RightHip');
  }
  return { n, rot, hips, lAnk, rAnk, lHip, rHip };
}

const V = (a, f) => new THREE.Vector3(a[f * 3], a[f * 3 + 1], a[f * 3 + 2]);
const Q = (a, f) => new THREE.Quaternion(a[f * 4], a[f * 4 + 1], a[f * 4 + 2], a[f * 4 + 3]);

// facing (yaw) of the pelvis: forward = left x up
function facing(S, f) {
  const left = V(S.lHip, f).sub(V(S.rHip, f));
  const fwd = new THREE.Vector3().crossVectors(left, new THREE.Vector3(0, 1, 0));
  return Math.atan2(fwd.x, fwd.z);
}

// left-foot contacts: the ankle at its lowest and nearly still
function contacts(S, a, b, unit) {
  const out = [];
  // the floor under the foot can drift over a long take: compare with the lowest nearby
  const localMin = (f) => { let m = Infinity; for (let g = Math.max(a, f - SRC_FPS); g < Math.min(b, f + SRC_FPS); g++) m = Math.min(m, S.lAnk[g * 3 + 1]); return m; };
  let was = false;
  for (let f = a + 1; f < b; f++) {
    const y = S.lAnk[f * 3 + 1], minY = localMin(f);
    const sp = V(S.lAnk, f).sub(V(S.lAnk, f - 1)).setY(0).length() * SRC_FPS / unit;
    const on = y < minY + 0.035 * unit && sp < 0.9;
    if (on && !was) out.push(f);
    was = on;
  }
  return out;
}

function poseDist(S, f, g) {
  let d = 0;
  for (const s of Object.keys(MAP)) { const a = Q(S.rot.get(s), f), b = Q(S.rot.get(s), g); d += 1 - Math.abs(a.dot(b)); }
  return d;
}

// pick the best loop in [a, b): kind 'cycle' uses gait cycles, 'idle' any span of the given length
function pickLoop(S, a, b, unit, kind, want) {
  if (kind === 'idle') {
    let best = null;
    const lmin = Math.round(4 * SRC_FPS), lmax = Math.round(6.5 * SRC_FPS), W = 24;
    for (let s = a + W; s < b - lmin; s += 3)
      for (let e = s + lmin; e < Math.min(b, s + lmax); e += 3) {
        const d = poseDist(S, s, e) + V(S.hips, s).distanceTo(V(S.hips, e)) / unit * 2;
        if (!best || d < best.d) best = { s, e, d };
      }
    return best;
  }
  const c = contacts(S, a, b, unit);
  let best = null;
  // one gait cycle, or two when that closes the loop better (fast, uneven runs)
  for (let span = 1; span <= 2; span++) for (let i = 0; i + span < c.length; i++) {
    const s = c[i], e = c[i + span];
    const len = e - s;
    if (len < 0.55 * SRC_FPS || len > 2.0 * span * SRC_FPS || s - 24 < a) continue;
    // travel relative to facing
    const h = facing(S, s);
    const d = V(S.hips, e).sub(V(S.hips, s));
    const fwd = (d.x * Math.sin(h) + d.z * Math.cos(h)) / unit / (len / SRC_FPS);
    const left = (d.x * Math.cos(h) - d.z * Math.sin(h)) / unit / (len / SRC_FPS);
    const turn = Math.abs(((facing(S, e) - h + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    let ok;
    if (want === 'f') ok = fwd > 0.5 && Math.abs(left) < 0.35 * fwd;
    else if (want === 'b') ok = fwd < -0.4 && Math.abs(left) < 0.35 * -fwd;
    else if (want === 'l') ok = left > 0.4 && Math.abs(fwd) < 0.45 * left;
    else if (want === 'r') ok = left < -0.4 && Math.abs(fwd) < 0.45 * -left;
    if (process.env.RT_DEBUG === want) console.log('  cand', want, s, e, (len / SRC_FPS).toFixed(2), 'fwd', fwd.toFixed(2), 'left', left.toFixed(2), 'turn', turn.toFixed(2), ok ? 'OK' : '');
    if (!ok) continue;
    // prefer clean loops, straight lines and a natural pace over shuffles
    const pace = want === 'f' ? Math.max(0, 1.15 - fwd) : want === 'b' ? Math.max(0, 0.8 + fwd) : Math.max(0, 0.7 - Math.abs(left));
    const cost = poseDist(S, s, e) + turn * 4 + pace * 0.8 + (span - 1) * 0.15;
    if (!best || cost < best.d) best = { s, e, d: cost, fwd, left };
  }
  return best;
}

// build one target clip from source frames [s, e) (a loop), sampled at OUT_FPS
function buildClip(take, S, A, loop, opts) {
  const { s, e } = loop, L = e - s, W = Math.min(24, Math.floor(L / 3));
  const unit = opts.unit, k = opts.legScale;
  const yaw0 = facing(S, s);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw0);
  const h0 = V(S.hips, s);
  const travel = V(S.hips, e).sub(h0).setY(0);
  const dur = L / SRC_FPS;
  // source frame -> blended (loop-closing) world rotations and hips position
  const srcPose = (f) => {
    const rots = new Map();
    let hp = V(S.hips, f).sub(h0);
    // remove the cycle's average travel (in-place loop)
    hp.addScaledVector(travel, -(f - s) / L);
    const w = f >= e - W ? (f - (e - W)) / W : 0;
    if (w > 0) {
      const g = f - L; // the frames just before the loop start continue into it
      const hg = V(S.hips, g).sub(h0).addScaledVector(travel, -(g - s) / L);
      hp.lerp(hg, w * w * (3 - 2 * w));
    }
    for (const sname of Object.keys(MAP)) {
      const q = Q(S.rot.get(sname), f);
      if (w > 0) q.slerp(Q(S.rot.get(sname), f - L), w * w * (3 - 2 * w));
      rots.set(sname, q);
    }
    return { rots, hp };
  };
  const n = Math.round(dur * OUT_FPS);
  const times = new Float32Array(n + 1);
  const tracks = new Map(); // target bone -> Float32Array quats
  for (const t of Object.values(MAP)) tracks.set(t, new Float32Array((n + 1) * 4));
  const rootPos = new Float32Array((n + 1) * 3);
  const footY = new Float32Array(n + 1);
  // a working copy of the target hierarchy
  const work = charRoot.clone(true);
  const W2 = new Map(); work.traverse((o) => W2.set(o.name, o));
  const bip = W2.get('Bip01');
  const bindBip = bip.position.clone();
  const tmpQ = new THREE.Quaternion(), pw = new THREE.Quaternion();
  for (let i = 0; i <= n; i++) {
    const tt = i / OUT_FPS;
    const sf = s + Math.min(L - 1, tt * SRC_FPS);
    const f0 = Math.floor(sf), fr = sf - f0, f1 = Math.min(f0 + 1, e - 1);
    const a0 = srcPose(f0), a1 = srcPose(f1);
    // root: hips position scaled to the target (height fixed below)
    const hp = a0.hp.clone().lerp(a1.hp, fr).applyQuaternion(qYaw).multiplyScalar(k);
    bip.position.set(bindBip.x + hp.x, bindBip.y + hp.y, bindBip.z + hp.z);
    bip.updateMatrixWorld(true);
    // world rotations, top-down through the hierarchy
    const order = [];
    work.traverse((o) => order.push(o));
    for (const o of order) {
      const sname = Object.keys(MAP).find((x) => MAP[x] === o.name);
      if (!sname) { o.updateMatrixWorld(true); continue; }
      const q = a0.rots.get(sname).clone().slerp(a1.rots.get(sname), fr);
      // world = yaw * source * align * bind
      tmpQ.copy(qYaw).multiply(q).multiply(A.get(sname)).multiply(bindWorldQ.get(o.name));
      o.parent.getWorldQuaternion(pw);
      o.quaternion.copy(pw.invert().multiply(tmpQ));
      o.updateMatrixWorld(true);
    }
    for (const [t, arr] of tracks) { const o = W2.get(t); arr.set([o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w], i * 4); }
    rootPos.set([bip.position.x, bip.position.y, bip.position.z], i * 3);
    // lowest foot point for grounding
    const fy = Math.min(W2.get('Bip01 L Foot').getWorldPosition(new THREE.Vector3()).y, W2.get('Bip01 R Foot').getWorldPosition(new THREE.Vector3()).y,
      W2.get('Bip01 L Toe0').getWorldPosition(new THREE.Vector3()).y, W2.get('Bip01 R Toe0').getWorldPosition(new THREE.Vector3()).y);
    footY[i] = fy;
    times[i] = tt;
  }
  // ground: feet at the bind foot height, using the lowest foot over a short window (keeps flight)
  const bindFoot = Math.min(bindWorldP.get('Bip01 L Foot').y, bindWorldP.get('Bip01 L Toe0').y);
  const win = Math.round(0.3 * OUT_FPS);
  for (let i = 0; i <= n; i++) {
    let m = Infinity;
    for (let j = -win; j <= win; j++) m = Math.min(m, footY[(i + j + (n + 1) * 4) % (n + 1)]);
    rootPos[i * 3 + 1] += bindFoot - m;
  }
  // exact loop closure
  for (const arr of tracks.values()) arr.set(arr.slice(0, 4), n * 4);
  rootPos.set(rootPos.slice(0, 3), n * 3);
  const speed = travel.length() / unit * (k * unit) / dur; // metres per second on the target
  return { name: opts.name, times, tracks, rootPos, dur: n / OUT_FPS, speed: +speed.toFixed(3), fwd: loop.fwd, left: loop.left };
}

// ---- takes: a 100STYLE style (one file per motion, with frame cuts) or one long take ----------
const single = styleRoot.endsWith('.bvh');
let cut = () => null, cutOf = () => null;
if (!single) {
  const cutsCsv = fs.readFileSync(path.join(styleRoot, 'Frame_Cuts.csv'), 'utf8').trim().split('\n');
  const head = cutsCsv[0].split(',');
  const row = cutsCsv.find((l) => l.startsWith(style + ',')).split(',');
  cut = (kind) => { const a = +row[head.indexOf(kind + '_START')], b = +row[head.indexOf(kind + '_STOP')]; return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null; };
  cutOf = (st, kind) => {
    const r = cutsCsv.find((l) => l.startsWith(st + ',')).split(',');
    const a = +r[head.indexOf(kind + '_START')], b = +r[head.indexOf(kind + '_STOP')];
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  };
}

const plan = [
  { name: 'idle', take: 'ID', kind: 'idle' },
  { name: 'walk_f', take: 'FW', kind: 'cycle', want: 'f' },
  { name: 'walk_b', take: 'BW', kind: 'cycle', want: 'b' },
  { name: 'walk_l', take: 'SW', kind: 'cycle', want: 'l' },
  { name: 'walk_r', take: 'SW', kind: 'cycle', want: 'r' },
  { name: 'run_f', take: 'FR', kind: 'cycle', want: 'f' },
  { name: 'run_b', take: 'BR', kind: 'cycle', want: 'b' },
  { name: 'run_l', take: 'SR', kind: 'cycle', want: 'l' },
  { name: 'run_r', take: 'SR', kind: 'cycle', want: 'r' },
];
const clips = [];
const takes = new Map();
for (const p of plan) {
  if (single && p.name.startsWith('run')) continue; // a one-take carry set has no run
  // RUN_STYLE: take the runs from another style (a hollow's shamble with a sprint); RUN_ONLY_F
  // keeps just the forward run
  const st = !single && p.name.startsWith('run') && process.env.RUN_STYLE ? process.env.RUN_STYLE : style;
  if (process.env.RUN_ONLY_F && p.name.startsWith('run') && p.name !== 'run_f') continue;
  const file = single ? styleRoot : path.join(styleRoot, st, `${st}_${p.take}.bvh`);
  if (!fs.existsSync(file)) { console.warn('missing', file); continue; }
  const key = single ? 'one' : st + '/' + p.take;
  let tk = takes.get(key);
  if (!tk) {
    const take = loadTake(file);
    const S = sampleTake(take);
    // units: the source thigh+shin against the target's
    const sl = take.restP.get('RightHip').distanceTo(take.restP.get('RightKnee')) + take.restP.get('RightKnee').distanceTo(take.restP.get('RightAnkle'));
    const tl = bindWorldP.get('Bip01 R Thigh').distanceTo(bindWorldP.get('Bip01 R Calf')) + bindWorldP.get('Bip01 R Calf').distanceTo(bindWorldP.get('Bip01 R Foot'));
    const unit = sl > 10 ? 100 : 1; // centimetres or metres
    tk = { take, S, A: alignments(take), unit, legScale: tl / sl };
    takes.set(key, tk);
  }
  const [a, b] = cutOf(st, p.take) || [0, tk.S.n];
  const loop = pickLoop(tk.S, Math.max(0, a), Math.min(b, tk.S.n - 1), tk.unit, p.kind, p.want);
  if (!loop || loop.d > 3) { console.warn('no clean loop for', p.name, loop ? loop.d.toFixed(2) : ''); continue; }
  const c = buildClip(tk.take, tk.S, tk.A, loop, { name: p.name, unit: tk.unit, legScale: tk.legScale });
  clips.push(c);
  console.log(`${p.name}: frames ${loop.s}-${loop.e} (${c.dur.toFixed(2)} s) speed ${c.speed} m/s cost ${loop.d.toFixed(3)}`);
}

// ---- upper-body overlays from Torque 3D's soldier (MIT; 3ds Max Biped, so local rotations carry
// straight across by bone name): shouldered rifle aim, reloads, a two-hand pistol stance ----------
const ARM = /Clavicle|UpperArm|Forearm|Hand|Finger/;
function daeOverlay(file, name) {
  const xml = fs.readFileSync(file, 'utf8');
  const nums = (t) => new Float32Array(t.trim().split(/\s+/).map(Number));
  const statics = new Map();
  for (const m of xml.matchAll(/<node id="node-([^"]+)"[^>]*>\s*<matrix[^>]*>([^<]+)<\/matrix>/g)) statics.set(m[1], nums(m[2]));
  const arrays = new Map();
  for (const m of xml.matchAll(/<float_array id="([^"]+)" count="\d+">([^<]*)<\/float_array>/g)) arrays.set(m[1], m[2]);
  const anim = new Map();
  for (const m of xml.matchAll(/<channel source="#([^"]+)" target="node-([^"\/]+)\/matrix"\s*\/>/g)) {
    const base = m[1].replace(/-sampler$/, '');
    const ti = arrays.get(base + '-input-array'), mo = arrays.get(base + '-output-array');
    if (ti && mo) anim.set(m[2], { times: nums(ti), mats: nums(mo) });
  }
  const targets = [...T.keys()].filter((n) => ARM.test(n) && (statics.has(n.replace(/ /g, '_')) || anim.has(n.replace(/ /g, '_'))));
  let times = null;
  for (const t of targets) { const a = anim.get(t.replace(/ /g, '_')); if (a && (!times || a.times.length > times.length)) times = a.times; }
  const keyT = times ? Array.from(times, (x) => x - times[0]) : [0, 1];
  const tracks = new Map();
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const t of targets) {
    const src = t.replace(/ /g, '_'), a = anim.get(src);
    const arr = new Float32Array(keyT.length * 4);
    for (let k = 0; k < keyT.length; k++) {
      const m = a && a.mats.length >= (k + 1) * 16 ? a.mats.subarray(k * 16, k * 16 + 16) : statics.get(src);
      M.set(...m).decompose(pp, q, sc);
      if (k > 0) { const pq = new THREE.Quaternion().fromArray(arr, (k - 1) * 4); if (pq.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); }
      arr.set([q.x, q.y, q.z, q.w], k * 4);
    }
    tracks.set(t, arr);
  }
  const dur = keyT[keyT.length - 1];
  console.log(`${name}: ${targets.length} arm bones, ${keyT.length} keys, ${dur.toFixed(2)} s from ${path.basename(file)}`);
  return { name, times: new Float32Array(keyT), tracks, rootPos: null, dur, overlay: true };
}
if (torqueDir) {
  const list = [['aim', 'lurker/PlayerAnim_Lurker_Root.dae'], ['reload', 'lurker/PlayerAnim_Lurker_Reload.dae'], ['aim_pistol', 'pistol/PlayerAnim_Pistol_Root.dae'], ['reload_pistol', 'pistol/PlayerAnim_Pistol_Reload.dae']];
  for (const [name, rel] of list) { const f = path.join(torqueDir, rel); if (fs.existsSync(f)) clips.push(daeOverlay(f, name)); }
}

// ---- write the animation GLB --------------------------------------------------------------------
const doc = new Document();
const buf = doc.createBuffer();
const scene = doc.createScene('skeleton');
const nodes = new Map();
const mk = (o, parent) => {
  const n = doc.createNode(o.name).setTranslation(o.position.toArray()).setRotation(o.quaternion.toArray()).setScale(o.scale.toArray());
  nodes.set(o.name, n);
  if (parent) parent.addChild(n); else scene.addChild(n);
  for (const c of o.children) mk(c, n);
};
mk(charRoot, null);
const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const meta = {};
for (const c of clips) {
  const anim = doc.createAnimation(c.name);
  const input = acc(c.times, 'SCALAR');
  const add = (node, pathName, arr, type) => {
    const smp = doc.createAnimationSampler().setInput(input).setOutput(acc(arr, type)).setInterpolation('LINEAR');
    const ch = doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(smp);
    anim.addSampler(smp).addChannel(ch);
  };
  for (const [t, arr] of c.tracks) add(nodes.get(t), 'rotation', arr, 'VEC4');
  if (c.rootPos) add(nodes.get('Bip01'), 'translation', c.rootPos, 'VEC3');
  meta[c.name] = c.overlay ? { overlay: true, duration: +c.dur.toFixed(3) } : { speed: c.speed, duration: +c.dur.toFixed(3) };
}
const asset = doc.getRoot().getAsset();
const credit = (single ? 'Environment-aware Motion Matching dataset (UPC ViRVIG, CC BY 4.0), retargeted to Microsoft Rocketbox' : 'The 100STYLE Dataset - Ian Mason (CC BY 4.0), retargeted to Microsoft Rocketbox') + (torqueDir ? '; upper-body overlays from Torque 3D (c) 2012-2016 GarageGames, LLC (MIT)' : '');
asset.generator = 'backrooms retarget (' + (single ? 'EMM' : '100STYLE') + ' dataset, CC BY 4.0)';
asset.extras = { clips: meta, credit };
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, doc);
console.log('wrote', outFile, (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB', JSON.stringify(meta));
