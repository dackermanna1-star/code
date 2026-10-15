// Shared helpers: read a glTF skeleton + animations into plain JS, sample poses, world transforms.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// Load: returns { nodes: [{name, parent, t, r, s}], byName, anims: {name: {duration, channels:[{node, path, times, values, interp}]}} }
export async function loadRig(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const list = root.listNodes();
  const idx = new Map(list.map((n, i) => [n, i]));
  const nodes = list.map((n) => ({ name: n.getName(), parent: n.getParentNode() ? idx.get(n.getParentNode()) : -1, t: n.getTranslation().slice(), r: n.getRotation().slice(), s: n.getScale().slice() }));
  const byName = new Map(nodes.map((n, i) => [n.name, i]));
  const anims = {};
  for (const a of root.listAnimations()) {
    let dur = 0;
    const channels = [];
    for (const c of a.listChannels()) {
      const s = c.getSampler();
      const times = Array.from(s.getInput().getArray());
      const out = s.getOutput();
      const vals = Array.from(out.getArray());
      // denormalize if normalized ints
      let values = vals;
      if (out.getNormalized()) { values = []; for (let i = 0; i < out.getCount(); i++) { const e = []; out.getElement(i, e); values.push(...e); } }
      dur = Math.max(dur, times[times.length - 1]);
      channels.push({ node: idx.get(c.getTargetNode()), path: c.getTargetPath(), times, values, interp: s.getInterpolation() });
    }
    anims[a.getName()] = { duration: dur, channels };
  }
  return { file, nodes, byName, anims };
}

function findKey(times, t) {
  let lo = 0, hi = times.length - 1;
  if (t <= times[0]) return [0, 0, 0];
  if (t >= times[hi]) return [hi, hi, 0];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
  return [lo, hi, (t - times[lo]) / (times[hi] - times[lo])];
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
export function sampleChannel(ch, t) {
  const n = ch.path === 'rotation' ? 4 : 3;
  const cubic = ch.interp === 'CUBICSPLINE';
  const stride = cubic ? n * 3 : n, off = cubic ? n : 0;
  const [a, b, f] = findKey(ch.times, t);
  const va = ch.values.slice(a * stride + off, a * stride + off + n);
  const vb = ch.values.slice(b * stride + off, b * stride + off + n);
  if (ch.interp === 'STEP' || a === b) return va;
  if (n === 4) { _qa.fromArray(va); _qb.fromArray(vb); _qa.slerp(_qb, f); return _qa.toArray(); }
  return va.map((v, i) => v + (vb[i] - v) * f);
}

// local TRS of all nodes for a pose (rest overridden by animation at time t)
export function poseAt(rig, animName, t) {
  const pose = rig.nodes.map((n) => ({ t: n.t.slice(), r: n.r.slice(), s: n.s.slice() }));
  if (animName) {
    const a = rig.anims[animName];
    if (!a) throw new Error('no anim ' + animName + ' in ' + rig.file);
    for (const ch of a.channels) {
      if (ch.node == null) continue;
      const v = sampleChannel(ch, t);
      if (ch.path === 'rotation') pose[ch.node].r = v; else if (ch.path === 'translation') pose[ch.node].t = v; else if (ch.path === 'scale') pose[ch.node].s = v;
    }
  }
  return pose;
}

// world matrices for a pose
export function worldMats(rig, pose) {
  const W = new Array(rig.nodes.length);
  const done = new Array(rig.nodes.length).fill(false);
  const calc = (i) => {
    if (done[i]) return W[i];
    const p = pose[i];
    const m = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.t), new THREE.Quaternion().fromArray(p.r), new THREE.Vector3().fromArray(p.s));
    const par = rig.nodes[i].parent;
    W[i] = par >= 0 ? calc(par).clone().multiply(m) : m;
    done[i] = true;
    return W[i];
  };
  for (let i = 0; i < rig.nodes.length; i++) calc(i);
  return W;
}

export function decompose(m) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(p, q, s);
  return { p, q, s };
}
