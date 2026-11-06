// Headless ragdoll stability check: node dev/entities-ragdoll-debug.mjs [impulse] [part] [disable,list]
import * as THREE from 'three';
import { createZombieVisual } from '../src/entities/zombie/ZombieModel.js';
const imp = (process.argv[2] || '0,0.5,-3').split(',').map(Number);
const off = (process.argv[4] || '').split(',');
const z = createZombieVisual({ variant: process.argv[5] || 'walker', outfit: 'police', seed: 77 });
z.root.position.set(0.5, 1, 0.5);
for (let i = 0; i < 20; i++) z.update(1 / 60, { state: 'walk', speed: 1, aggro: 1 });
z.startRagdoll(new THREE.Vector3(...imp), process.argv[3] || 'torso', (x, y, z) => y < 1);
const r = z.ragdoll;
for (const k of off) if (k) r[k] = function () {};
const names = ['head', 'neck', 'chest', 'back', 'shR', 'shL', 'elR', 'elL', 'haR', 'haL', 'hipR', 'hipL', 'knR', 'knL', 'ftR', 'ftL'];
let line = '';
for (let f = 0; f <= 300; f++) {
  const alive = z.updateRagdoll(1 / 60);
  if (f % 20 === 0 || !alive) {
    const p = r.pos, q = r.prev;
    let maxV = 0, mi = 0;
    for (let i = 0; i < 16; i++) { const v = Math.hypot(p[i * 3] - q[i * 3], p[i * 3 + 1] - q[i * 3 + 1], p[i * 3 + 2] - q[i * 3 + 2]) * 120; if (v > maxV) { maxV = v; mi = i; } }
    const pel = r.pelvis(new THREE.Vector3());
    line += `t${r.time.toFixed(1)} pel(${pel.x.toFixed(1)},${pel.y.toFixed(2)},${pel.z.toFixed(1)}) v${maxV.toFixed(1)}${names[mi]} | `;
  }
  if (!alive) { line += `SETTLED ${r.time.toFixed(2)}`; break; }
}
console.log(line);
