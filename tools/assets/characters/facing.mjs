// Per-clip body facing on the shared skeleton, from joint positions (robust; no bone-axis assumptions).
// usage: node facing.mjs <anims.glb> [clipFilterRegex]
// prints pelvis / shoulder facing yaw in degrees (0 = +Z forward, +90 = facing +X = character's left) at 0/50/100%
import * as THREE from 'three';
import { loadRig, poseAt, worldMats } from './gltf_anim_lib.mjs';
const [file, filt] = process.argv.slice(2);
const r = await loadRig(file);
const yaw = (l, rr) => { const left = l.clone().sub(rr); left.y = 0; left.normalize(); const f = new THREE.Vector3().crossVectors(left, new THREE.Vector3(0, 1, 0)); return Math.round(Math.atan2(f.x, f.z) * 180 / Math.PI); };
for (const [name, a] of Object.entries(r.anims)) {
  if (filt && !new RegExp(filt).test(name)) continue;
  const out = [];
  for (const k of [0, 0.5, 1]) {
    const W = worldMats(r, poseAt(r, name, a.start + (a.duration - a.start) * k));
    const P = (n) => new THREE.Vector3().setFromMatrixPosition(W[r.byName.get(n)]);
    out.push(`${yaw(P('LeftUpLeg'), P('RightUpLeg'))}/${yaw(P('LeftArm'), P('RightArm'))}`);
  }
  console.log(name.padEnd(24), 'pelvis/shoulders yaw @0,50,100%:', out.join('  '));
}
