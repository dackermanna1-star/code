// LAST LOOKOUT — entry point. (Bootstrap stub: the core game loop replaces this.)
import * as THREE from 'three';
import { LAYOUT } from './level/layout.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6b5a6e);
scene.fog = new THREE.Fog(0x6b5a6e, 60, 320);
scene.add(new THREE.HemisphereLight(0xffd2a0, 0x2a2430, 1.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshLambertMaterial({ color: 0x4d5a32 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
for (const c of LAYOUT.colliders) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(c.h[0] * 2, c.h[1] * 2, c.h[2] * 2), new THREE.MeshLambertMaterial({ color: 0x8a7f74 }));
  m.position.set(c.c[0], c.c[1], c.c[2]);
  m.rotation.y = c.yaw || 0;
  scene.add(m);
}
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 900);
camera.position.fromArray(LAYOUT.tower.eye);
camera.rotation.order = 'YXZ';
camera.rotation.x = -0.15;
renderer.setAnimationLoop(() => {
  camera.rotation.y += 0.0015;
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
