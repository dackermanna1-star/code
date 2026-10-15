// Print rest-pose stats (hips/foot/head height, upper-arm direction, clip length) for every GLB in a folder.
// usage: node probe_rest.mjs <dir>
import fs from 'fs';
import * as THREE from 'three';
import { loadRig, poseAt, worldMats } from './gltf_anim_lib.mjs';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
  const r = await loadRig(dir + '/' + f);
  const W = worldMats(r, poseAt(r, null, 0));
  const P = (n) => { const i = r.byName.get('mixamorig:' + n) ?? r.byName.get(n); return i == null ? null : new THREE.Vector3().setFromMatrixPosition(W[i]); };
  const h = P('Hips'), a = P('LeftArm'), fa = P('LeftForeArm'), ft = P('LeftFoot'), hd = P('Head');
  if (!h) { console.log(f, 'NO HIPS', r.nodes.slice(0, 5).map((n) => n.name)); continue; }
  const d = fa.clone().sub(a).normalize();
  const an = Object.values(r.anims)[0];
  console.log(f.padEnd(52), 'hipsY', h.y.toFixed(3), 'footY', ft.y.toFixed(3), 'headY', hd.y.toFixed(3), 'armDir', d.toArray().map((v) => v.toFixed(2)).join(','), 'dur', an.duration.toFixed(2), 'ch', an.channels.length, 'scale', r.nodes[0].s.map((v)=>v.toFixed(2)).join(','));
}
