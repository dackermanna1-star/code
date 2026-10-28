import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { World } from './physics/world.js';
import { Vec3 } from './physics/math.js';
import { Ragdoll } from './human/ragdoll.js';
import { DebugDraw } from './render/debugDraw.js';
import { HumanController } from './human/controller.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202428);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(2.2, 1.6, 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 4);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0x555a60 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(24, 24, 0x888888, 0x666666));

const world = new World();
const ragdoll = new Ragdoll(world, { position: new Vec3(0, 0.0, 0) });
ragdoll.addToWorld();
const ctl = new HumanController(ragdoll);
const dbg = new DebugDraw(scene);

let paused = false;
const sim = {
  world, ragdoll, scene, camera, controls, renderer,
  ctl,
  stepFrames(n) { for (let i = 0; i < n; i++) { ctl.update(1 / 60); for (const s of this._shoves || []) if (s.n-- > 0) { s.b.force.x += s.f.x; s.b.force.y += s.f.y; s.b.force.z += s.f.z; } world.step(1 / 60); } dbg.sync(world.bodies, 1); },
  shove(seg, x, y, z, dur = 0.15) { const b = ragdoll.segments[seg].body; this._shoves = this._shoves || []; const n = Math.round(dur * 60); this._shoves.push({ b, f: { x: x / (n / 60), y: y / (n / 60), z: z / (n / 60) }, n }); },
  push(seg, x, y, z) { const b = ragdoll.segments[seg].body; b.applyImpulse({ x, y, z, clone() { return this; } }, b.pos); },
  pause(v = true) { paused = v; },
  render() { dbg.sync(world.bodies, 1); controls.update(); renderer.render(scene, camera); },
};
window.__sim = sim;

function frame() {
  if (!paused) { ctl.update(1 / 60); world.step(1 / 60); }
  dbg.sync(world.bodies, 1);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
