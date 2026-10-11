// Keyframe animation for the view models.
//
// An animation is plain data:
//   {
//     dur: 2.45,                // default length (s); play(..., {duration}) overrides
//     loop: false, hold: false, // loop (idle) / stay on the last frame when done
//     tracks: { node: keys | { abs: true, k: keys } },
//     attach: [{ node, to, u0, u1 }],   // node rides on `to` (same parent) between u0..u1
//     vis: { node: [[u0, u1, visible]] },
//     fn(u, t, vm) {}           // procedural extras (breathing, flags)
//     end(vm) {}                // called once when the animation completes
//   }
// keys: [[u, p, r, ease], ...] with u in 0..1 of the duration, p = [x,y,z]
// units, r = [pitch, yaw, roll] degrees (Euler YXZ). For offset tracks p/r are
// added to the node's rest pose (null = 0); for abs tracks they replace it
// (null = rest). `ease` shapes the segment that ends at that key; 'cr' makes it
// a smooth (Catmull-Rom / Hermite) segment that flows through neighbouring
// 'cr' keys instead of stopping at every key.

import * as THREE from 'three';
import { DEG } from './builder.js';

export const Z = [0, 0, 0];

export const EASE = {
  lin: (x) => x,
  io: (x) => x * x * (3 - 2 * x),
  out: (x) => 1 - (1 - x) * (1 - x) * (1 - x),
  out2: (x) => 1 - (1 - x) * (1 - x),
  in: (x) => x * x * x,
  in2: (x) => x * x,
  step: (x) => (x < 1 ? 0 : 1),
  // quick snap with a small overshoot (mechanical clack)
  snap: (x) => { const s = 1.70158; x -= 1; return x * x * ((s + 1) * x + s) + 1; },
  // softer overshoot (arrive, drift past, come back)
  back: (x) => { const s = 0.9; x -= 1; return x * x * ((s + 1) * x + s) + 1; },
  // damped spring: overshoots ~10 %, wobbles once, lands exactly on 1
  settle: (x) => 1 - Math.exp(-5 * x) * Math.cos(9 * x) * (1 - x),
  io3: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  cr: (x) => x, // handled in evalKeys
};

// Hermite segment between keys i-1 and i with Catmull-Rom tangents at the ends
// that continue into neighbouring 'cr' segments (zero tangent otherwise).
function hermite(keys, i, t, idx, restP, restR, abs, out) {
  const fill = (v, rest) => (v ? v : abs ? rest : Z);
  const rest = idx === 1 ? restP : restR;
  const k0 = keys[i - 1], k1 = keys[i];
  const kp = keys[i - 2], kn = keys[i + 1];
  const P1 = fill(k0[idx], rest), P2 = fill(k1[idx], rest);
  const h = k1[0] - k0[0];
  const smoothA = (k0[3] === 'cr') && kp;
  const smoothB = kn && kn[3] === 'cr';
  const P0 = smoothA ? fill(kp[idx], rest) : null, P3 = smoothB ? fill(kn[idx], rest) : null;
  const t2 = t * t, t3 = t2 * t;
  const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, d = t3 - t2;
  for (let j = 0; j < 3; j++) {
    const mA = smoothA ? ((P2[j] - P0[j]) / Math.max(1e-6, k1[0] - kp[0])) * h : 0;
    const mB = smoothB ? ((P3[j] - P1[j]) / Math.max(1e-6, kn[0] - k0[0])) * h : 0;
    out[j] = a * P1[j] + b * mA + c * P2[j] + d * mB;
  }
  return out;
}

function lerp3(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

// Evaluate keys at u -> {p, r} (arrays reused).
export function evalKeys(keys, u, restP, restR, abs, outP, outR) {
  const fill = (v, rest) => (v ? v : abs ? rest : Z);
  if (u <= keys[0][0] || keys.length === 1) {
    outP.splice(0, 3, ...fill(keys[0][1], restP));
    outR.splice(0, 3, ...fill(keys[0][2], restR));
    return;
  }
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (u <= k1[0] || i === keys.length - 1) {
      const k0 = keys[i - 1];
      const span = k1[0] - k0[0];
      let t = span > 0 ? Math.min(1, Math.max(0, (u - k0[0]) / span)) : 1;
      if (k1[3] === 'cr') {
        hermite(keys, i, t, 1, restP, restR, abs, outP);
        hermite(keys, i, t, 2, restP, restR, abs, outR);
        return;
      }
      t = (EASE[k1[3] || 'io'] || EASE.io)(t);
      lerp3(fill(k0[1], restP), fill(k1[1], restP), t, outP);
      lerp3(fill(k0[2], restR), fill(k1[2], restR), t, outR);
      return;
    }
  }
}

const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

function compose(p, r, out) {
  _e.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_v.set(p[0], p[1], p[2]), _q, _s);
}

// Local pose of a node at u under an animation (no attachments).
export function nodePoseAt(anim, node, u, outP, outR) {
  const rest = node.userData.rest;
  const tr = anim.tracks && anim.tracks[node.name];
  if (!tr) { outP.splice(0, 3, ...rest.p); outR.splice(0, 3, ...rest.r); return; }
  const abs = !Array.isArray(tr) && tr.abs;
  const keys = Array.isArray(tr) ? tr : tr.k;
  evalKeys(keys, u, rest.p, rest.r, abs, outP, outR);
  if (!abs) {
    for (let i = 0; i < 3; i++) { outP[i] += rest.p[i]; outR[i] += rest.r[i]; }
  }
}

const _p = [0, 0, 0], _r = [0, 0, 0], _p2 = [0, 0, 0], _r2 = [0, 0, 0];

// Pose every node touched by `anim` at normalised time u.
export function applyAnim(anim, u, nodes, animated) {
  for (const n of animated) {
    nodePoseAt(anim, n, u, _p, _r);
    n.position.set(_p[0], _p[1], _p[2]);
    n.rotation.set(_r[0] * DEG, _r[1] * DEG, _r[2] * DEG, 'YXZ');
    n.visible = n.userData.defVisible !== false;
  }
  if (anim.attach) {
    for (const a of anim.attach) {
      if (u < a.u0 || u > a.u1) continue;
      const node = nodes[a.node], to = nodes[a.to];
      if (!node || !to) continue;
      // node(u) = to(u) * inv(to(u0)) * node(u0)
      nodePoseAt(anim, to, a.u0, _p2, _r2);
      compose(_p2, _r2, _m0).invert();
      nodePoseAt(anim, node, a.u0, _p2, _r2);
      compose(_p2, _r2, _m1);
      nodePoseAt(anim, to, u, _p2, _r2);
      compose(_p2, _r2, _m2).multiply(_m0).multiply(_m1);
      _m2.decompose(node.position, node.quaternion, _v);
    }
  }
  if (anim.vis) {
    for (const name in anim.vis) {
      const node = nodes[name];
      if (!node) continue;
      for (const [u0, u1, v] of anim.vis[name]) if (u >= u0 && u <= u1) node.visible = v;
    }
  }
}

// Collect the nodes an animation set touches (so they get reset each frame).
export function animatedNodes(anims, nodes) {
  const set = new Set();
  for (const k in anims) {
    const a = anims[k];
    for (const n in a.tracks || {}) if (nodes[n]) set.add(nodes[n]);
    for (const at of a.attach || []) if (nodes[at.node]) set.add(nodes[at.node]);
    for (const n in a.vis || {}) if (nodes[n]) set.add(nodes[n]);
  }
  return [...set];
}

// ------------------------------------------------------------------ helpers

// Scale every key of a list of tracks by `s` (u -> u*s + o) - used to embed
// a sub-animation inside a longer one.
export function retime(keys, s, o = 0) {
  return keys.map(([u, p, r, e]) => [u * s + o, p, r, e]);
}

export function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
