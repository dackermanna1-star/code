// Derive hand sockets from retargeted clips and report how well the support hand meets the weapon.
//
// usage: node compute_sockets.mjs <character.glb> <anims.glb> <out.json> --rifle clipA,clipB --pistol clipC [--pistolLevel] [--check clip1,clip2,...]
//
// socket_weapon_r : child of RightHand. Weapon GLBs (origin at firing-hand grip, barrel +Z, up +Y)
//                   attached here sit in the right hand. Derived from rifle aim poses:
//                   origin = centre of the closed right fist, +Z = towards the support (left) hand,
//                   +Y = world up (no cant) at aim time.
// socket_weapon_l : child of LeftHand, same convention (for left-hand items, e.g. grenade throw).
// socket_support_l: child of LeftHand at the left palm centre (IK target helper; the code should
//                   drive the left hand to the weapon's `grip_support` node).
import fs from 'fs';
import * as THREE from 'three';
import { loadRig, poseAt, worldMats } from './gltf_anim_lib.mjs';

const [charFile, animFile, outFile] = process.argv.slice(2);
const opt = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const rifleClips = (opt('--rifle') || '').split(',').filter(Boolean);
const checkClips = (opt('--check') || '').split(',').filter(Boolean);
const pistolClips = (opt('--pistol') || '').split(',').filter(Boolean);
const ch = await loadRig(charFile);
const an = await loadRig(animFile);

function worldAt(clip, t) {
  // apply anim channels (by node name) onto the character's skeleton
  const pose = ch.nodes.map((n) => ({ t: n.t.slice(), r: n.r.slice(), s: n.s.slice() }));
  const a = an.anims[clip];
  if (!a) throw new Error('no clip ' + clip);
  for (const c of a.channels) {
    const nm = an.nodes[c.node].name; const i = ch.byName.get(nm); if (i == null) continue;
    const L = c.times.length;
    // sample
    let k = 0; while (k < L - 1 && c.times[k + 1] <= t) k++;
    const k2 = Math.min(L - 1, k + 1); const f = k2 === k ? 0 : Math.max(0, Math.min(1, (t - c.times[k]) / (c.times[k2] - c.times[k])));
    const n = c.path === 'rotation' ? 4 : 3;
    const va = c.values.slice(k * n, k * n + n), vb = c.values.slice(k2 * n, k2 * n + n);
    if (n === 4) pose[i].r = new THREE.Quaternion().fromArray(va).slerp(new THREE.Quaternion().fromArray(vb), f).toArray();
    else if (c.path === 'translation') pose[i].t = va.map((v, j) => v + (vb[j] - v) * f);
  }
  const W = worldMats(ch, pose);
  const get = (nm) => { const m = W[ch.byName.get(nm)]; const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q, m }; };
  return get;
}
function handFrame(get, S) {
  const h = get(`${S}Hand`), m1 = get(`${S}HandMiddle1`), m3 = get(`${S}HandMiddle3`);
  const d = m1.p.clone().sub(h.p);
  const len = d.length(); d.normalize();
  const curl = m3.p.clone().sub(m1.p); const palm = curl.sub(d.clone().multiplyScalar(curl.dot(d))).normalize();
  const grip = h.p.clone().addScaledVector(d, len * 0.55).addScaledVector(palm, 0.028);
  return { h, d, palm, grip };
}
const res = { rifle: [], check: {} };
const samples = [];
for (const clip of rifleClips) {
  const a = an.anims[clip];
  for (let t = a.start; t <= a.duration + 1e-6; t += Math.max(1 / 30, (a.duration - a.start) / 12)) {
    const get = worldAt(clip, t);
    const R = handFrame(get, 'Right'), L = handFrame(get, 'Left');
    const fwd = L.grip.clone().sub(R.grip);
    const dist = fwd.length(); fwd.normalize();
    const up = new THREE.Vector3(0, 1, 0); up.sub(fwd.clone().multiplyScalar(up.dot(fwd))).normalize();
    const x = new THREE.Vector3().crossVectors(up, fwd);
    const wq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fwd));
    const inv = R.h.q.clone().invert();
    const lp = R.grip.clone().sub(R.h.p).applyQuaternion(inv);
    const lq = inv.clone().multiply(wq);
    samples.push({ lp, lq, dist });
  }
}
// average
const P = new THREE.Vector3(); let Q = null; let dist = 0;
for (const s of samples) { P.add(s.lp); dist += s.dist; if (!Q) Q = s.lq.clone(); else { const q = s.lq.clone(); if (q.dot(Q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); Q.x += q.x; Q.y += q.y; Q.z += q.z; Q.w += q.w; } }
P.multiplyScalar(1 / samples.length); Q.normalize(); dist /= samples.length;
const sockets = [{ name: 'socket_weapon_r', parent: 'RightHand', t: P.toArray().map((v) => +v.toFixed(4)), r: Q.toArray().map((v) => +v.toFixed(5)) }];
// left: mirror of the right socket
sockets.push({ name: 'socket_weapon_l', parent: 'LeftHand', t: [-P.x, P.y, P.z].map((v) => +v.toFixed(4)), r: [Q.x, -Q.y, -Q.z, Q.w].map((v) => +v.toFixed(5)) });
// left palm helper (local, identity orientation): average left grip in LeftHand space
{
  let lp = new THREE.Vector3(), n = 0;
  for (const clip of rifleClips) { const a = an.anims[clip]; const get = worldAt(clip, a.start); const L = handFrame(get, 'Left'); lp.add(L.grip.clone().sub(L.h.p).applyQuaternion(L.h.q.clone().invert())); n++; }
  lp.multiplyScalar(1 / n);
  sockets.push({ name: 'socket_support_l', parent: 'LeftHand', t: lp.toArray().map((v) => +v.toFixed(4)), r: [0, 0, 0, 1] });
}
console.log('socket_weapon_r', JSON.stringify(sockets[0]), 'grip->support dist', dist.toFixed(3));
// ---- pistol socket: barrel along the eye -> sights line in two-handed pistol aim poses ----
if (pistolClips.length) {
  const ps = [];
  for (const clip of pistolClips) {
    const a = an.anims[clip];
    for (let t = a.start; t <= a.duration + 1e-6; t += Math.max(1 / 30, (a.duration - a.start) / 8)) {
      const get = worldAt(clip, t);
      const R = handFrame(get, 'Right'); const H = get('Head');
      const eye = new THREE.Vector3(0, 0.10, 0.10).applyQuaternion(H.q).add(H.p);
      const sights = R.grip.clone().add(new THREE.Vector3(0, 0.055, 0));
      const fwd = sights.sub(eye).normalize();
      // --pistolLevel: assume the source pose aims level (keep only the heading of the eye->sights line);
      // use it with a pistol_aim retargeted WITHOUT aimFix
      if (process.argv.includes('--pistolLevel')) { fwd.y = 0; fwd.normalize(); }
      const up = new THREE.Vector3(0, 1, 0); up.sub(fwd.clone().multiplyScalar(up.dot(fwd))).normalize();
      const x = new THREE.Vector3().crossVectors(up, fwd);
      const wq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fwd));
      const inv = R.h.q.clone().invert();
      ps.push({ lp: R.grip.clone().sub(R.h.p).applyQuaternion(inv), lq: inv.clone().multiply(wq) });
    }
  }
  const P2 = new THREE.Vector3(); let Q2 = null;
  for (const s of ps) { P2.add(s.lp); if (!Q2) Q2 = s.lq.clone(); else { const q = s.lq.clone(); if (q.dot(Q2) < 0) q.set(-q.x, -q.y, -q.z, -q.w); Q2.x += q.x; Q2.y += q.y; Q2.z += q.z; Q2.w += q.w; } }
  P2.multiplyScalar(1 / ps.length); Q2.normalize();
  sockets.push({ name: 'socket_pistol_r', parent: 'RightHand', t: P2.toArray().map((v) => +v.toFixed(4)), r: Q2.toArray().map((v) => +v.toFixed(5)) });
  console.log('socket_pistol_r', JSON.stringify(sockets[sockets.length - 1]), 'angle vs rifle socket deg', (2 * Math.acos(Math.min(1, Math.abs(Q2.dot(Q)))) * 180 / Math.PI).toFixed(1));
}
// ---- check: support hand relative to the weapon axis for each clip ----
const sock = sockets[0];
const SQ = new THREE.Quaternion().fromArray(sock.r), SP = new THREE.Vector3().fromArray(sock.t);
for (const clip of checkClips) {
  const a = an.anims[clip]; if (!a) continue;
  const devs = [];
  for (let t = a.start; t <= a.duration + 1e-6; t += Math.max(1 / 30, (a.duration - a.start) / 20)) {
    const get = worldAt(clip, t);
    const R = get('RightHand'); const L = handFrame(get, 'Left');
    const wp = SP.clone().applyQuaternion(R.q).add(R.p), wq = R.q.clone().multiply(SQ);
    const local = L.grip.clone().sub(wp).applyQuaternion(wq.clone().invert()); // in weapon space
    const barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(wq);
    devs.push({ along: local.z, off: Math.hypot(local.x, local.y), pitch: Math.asin(barrel.y) * 180 / Math.PI, yaw: Math.atan2(barrel.x, barrel.z) * 180 / Math.PI });
  }
  const avg = (k) => devs.reduce((s, d) => s + d[k], 0) / devs.length;
  const mx = (k) => Math.max(...devs.map((d) => d[k]));
  res.check[clip] = { support_along_m: +avg('along').toFixed(3), support_offaxis_avg_m: +avg('off').toFixed(3), support_offaxis_max_m: +mx('off').toFixed(3), barrel_pitch_deg: +avg('pitch').toFixed(1), barrel_yaw_deg: +avg('yaw').toFixed(1) };
  console.log(clip.padEnd(26), JSON.stringify(res.check[clip]));
}
fs.writeFileSync(outFile, JSON.stringify({ sockets, check: res.check }, null, 1));
