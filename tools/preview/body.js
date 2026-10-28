import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { World } from '../../src/physics/world.js';
import { Vec3 } from '../../src/physics/math.js';
import { Ragdoll } from '../../src/human/ragdoll.js';
import { BodyShape } from '../../src/human/bodyShape.js';
import { buildBodyMesh } from '../../src/human/bodyMesh.js';
import { HumanMesh } from '../../src/render/humanMesh.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3f45);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
camera.position.set(1.6, 1.3, 3.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.update();
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -2; sun.shadow.camera.right = 2; sun.shadow.camera.top = 2.5; sun.shadow.camera.bottom = -0.5;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x404040, 0.6));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const world = new World();
const rd = new Ragdoll(world, { position: new Vec3(0, 0, 0) });
rd.addToWorld();
const shape = new BodyShape(rd.segList.map((s) => s.name));
const t0 = performance.now();
const data = buildBodyMesh(shape);
console.log('mesh ms', (performance.now() - t0).toFixed(0), 'verts', data.positions.length / 3);
const hm = new HumanMesh(data, rd, shape);
scene.add(hm.mesh);
hm.update(1);
window.__sim = { scene, camera, controls, renderer, rd, hm, world, shape, data, THREE,
  render() { hm.update(1); controls.update(); renderer.render(scene, camera); },
  view(px, py, pz, tx, ty, tz, fov = 30) { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); camera.fov = fov; camera.updateProjectionMatrix(); this.render(); },
  sculpt(on = true) { // show the mesh in its sculpt pose (identity bones)
    for (let i = 0; i < hm.bones.length; i++) hm.bones[i].matrixWorld.copy(hm.skeleton.boneInverses[i]).invert();
    controls.update(); renderer.render(scene, camera);
  },
};
function frame() { window.__sim.render(); requestAnimationFrame(frame); }
frame();
