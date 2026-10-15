// Per-clip stats on the target skeleton: hips/chest facing yaw (deg), weapon barrel yaw/pitch via socket.
// usage: node clip_stats.mjs anims.glb [sockets.json]
import fs from 'fs';
import * as THREE from 'three';
import { loadRig, sampleChannel, worldMats } from './gltf_anim_lib.mjs';
const [file, sockFile] = process.argv.slice(2);
const rig = await loadRig(file);
const sock = sockFile ? JSON.parse(fs.readFileSync(sockFile, 'utf8')).sockets.find((s) => s.name === 'socket_weapon_r') : null;
const yawOf = (q) => { const d = new THREE.Vector3(0, 0, 1).applyQuaternion(q); return Math.atan2(d.x, d.z) * 180 / Math.PI; };
for (const [name, a] of Object.entries(rig.anims)) {
  let hy = 0, cy = 0, by = 0, bp = 0, n = 0;
  for (let t = a.start; t <= a.duration + 1e-6; t += Math.max(1 / 30, a.duration / 10)) {
    const pose = rig.nodes.map((nd) => ({ t: nd.t.slice(), r: nd.r.slice(), s: nd.s.slice() }));
    for (const c of a.channels) { const v = sampleChannel(c, t); if (c.path === 'rotation') pose[c.node].r = v; else if (c.path === 'translation') pose[c.node].t = v; }
    const W = worldMats(rig, pose);
    const q = (nm) => { const p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3(); W[rig.byName.get(nm)].decompose(p, r, s); return r; };
    hy += yawOf(q('Hips')); cy += yawOf(q('Spine2'));
    if (sock) { const d = new THREE.Vector3(0, 0, 1).applyQuaternion(q('RightHand').multiply(new THREE.Quaternion().fromArray(sock.r))); by += Math.atan2(d.x, d.z) * 180 / Math.PI; bp += Math.asin(d.y) * 180 / Math.PI; }
    n++;
  }
  console.log(name.padEnd(24), 'hipsYaw', (hy / n).toFixed(0).padStart(5), 'chestYaw', (cy / n).toFixed(0).padStart(5), sock ? `barrelYaw ${(by / n).toFixed(0).padStart(5)} pitch ${(bp / n).toFixed(0).padStart(4)}` : '');
}
