// First-person hands preview: ?w=rifle&ads=0..1&sprint=0|1&reload=0..1
import * as THREE from 'three';
import * as OM from '../../src/render/objectMeshes.js';
import { FpsView } from '../../src/render/fpsView.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x6a6f78);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const v = new FpsView(OM, innerWidth / innerHeight);
v.setWeapon(q.get('w') || 'pistol');
const st = {
  ads: +(q.get('ads') || 0), sprint: q.get('sprint') === '1', speed: 0, step: 0, onGround: true, crouch: 0, look: { dx: 0, dy: 0 }, landed: 0,
  state: q.get('reload') ? 'reload' : 'idle', stateT: +(q.get('reload') || 0) * 1.5, reloadTime: 1.5, perShell: false,
};
for (let i = 0; i < 90; i++) v.update(1 / 60, st);
renderer.clear();
v.render(renderer);
window.__ready = true;
