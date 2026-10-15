// Print world positions of named joints. usage: node joints_world.mjs file.glb [anim] [t] [names...]
import { loadRig, poseAt, worldMats, decompose } from './gltf_anim_lib.mjs';
const [file, anim, t, ...names] = process.argv.slice(2);
const rig = await loadRig(file);
const pose = poseAt(rig, anim && anim !== '-' ? anim : null, Number(t || 0));
const W = worldMats(rig, pose);
const want = names.length ? names : rig.nodes.map((n) => n.name);
for (const n of want) { const i = rig.byName.get(n); if (i == null) { console.log(n, 'MISSING'); continue; } const d = decompose(W[i]); console.log(n.padEnd(28), d.p.toArray().map((v) => v.toFixed(3)).join(' '), ' scale', d.s.x.toFixed(3)); }
