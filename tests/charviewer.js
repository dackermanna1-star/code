// Stand-alone character viewer for visual checks (no level load):
//   /tests/charviewer.html?view=lineup|face|crowd|specials|special&id=bill&yaw=0&light=studio|dark&cam=x,y,z,tx,ty,tz
import * as THREE from 'three';
import { Body, Poser, animateHumanoid, PROPS, J } from '../src/entities/body.js';
import { buildHumanoid, RigModel } from '../src/entities/rig.js';
import { CrowdRenderer } from '../src/entities/crowd.js';
import { setCharacterDetail } from '../src/entities/charlooks.js';
import { CHARACTERS } from '../src/entities/characters.js';

const Q = new URLSearchParams(location.search);
const view = Q.get('view') || 'lineup';
const W = +(Q.get('w') || 960), H = +(Q.get('h') || 540);
setCharacterDetail(+(Q.get('tex') || 1024));
const t0 = performance.now();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = +(Q.get('exp') || 1.0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1e26);
scene.fog = new THREE.Fog(0x1a1e26, 12, 40);
const camera = new THREE.PerspectiveCamera(+(Q.get('fov') || 40), W / H, 0.03, 100);
scene.add(camera);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const light = Q.get('light') || 'studio';
if (light === 'studio') {
  scene.add(new THREE.HemisphereLight(0x8a9ab0, 0x2a2420, 0.9));
  const key = new THREE.DirectionalLight(0xfff0e0, 2.6);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 1.6);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
} else {
  scene.add(new THREE.HemisphereLight(0x3a4658, 0x151210, 0.35));
  const moon = new THREE.DirectionalLight(0x8aa0c8, 0.5);
  moon.position.set(-3, 6, -2);
  scene.add(moon);
  const fl = new THREE.SpotLight(0xfff1dc, 22, 45, 0.42, 0.55, 1.0);
  fl.castShadow = true;
  fl.shadow.mapSize.set(1024, 1024);
  fl.position.set(0.25, -0.2, 0.3);
  camera.add(fl);
  fl.target.position.set(0.1, -0.6, -10);
  camera.add(fl.target);
}

const poser = new Poser();
const rigs = [];
function pose(b, x, z, yaw, a = {}) {
  poser.frame(x, 0, z, yaw);
  animateHumanoid(b, PROPS, poser, Object.assign({ time: 1.3, speed: 0, phase: 0, crouch: 0, lean: 0.02, arms: 'hang', sway: 0, twitch: 0 }, a));
}
function survivor(id, x, z, yaw, a) {
  const ch = CHARACTERS[id];
  const b = new Body(ch.body.scale ?? 1, ch.body.build ?? 1);
  const rig = new RigModel(scene, buildHumanoid({ id }), { name: id });
  pose(b, x, z, yaw, a);
  rig.update(b);
  rigs.push({ rig, b });
  return b;
}
const SPECIAL = {
  hunter: { scale: 1, build: 1, a: { crouch: 0.6, lean: 0.55, hunch: 0.2, arms: 'reach' } },
  smoker: { scale: 1.13, build: 0.85, a: { lean: 0.15, hunch: 0.15, arms: 'hang' } },
  boomer: { scale: 1, build: 1.5, a: { lean: -0.12, legs: 'wide', arms: 'hang' } },
  tank: { scale: 1.3, build: 1.7, a: { lean: 0.3, hunch: 0.3, arms: 'hang', legs: 'wide' } },
  witch: { scale: 0.95, build: 0.78, a: { crouch: 0.3, lean: 0.4, arms: 'reach', hunch: 0.3 } },
  charger: { scale: 1.08, build: 1.3, a: { lean: 0.32, hunch: 0.3, arms: 'custom', handL: [-0.11, 1.21, 0.28], handR: [0.43, 0.45, 0.3], poleR: [1, -0.4, -1], poleL: [-1, -1, 0.3], footS: 0.05 } },
  jockey: { scale: 0.74, build: 0.85, a: { crouch: 0.32, lean: 0.5, hunch: 0.35, arms: 'reach', headPitch: -0.25 } },
  spitter: { scale: 1.1, build: 0.8, a: { lean: 0.18, hunch: 0.22, arms: 'hang', headPitch: 0.25 } },
};
function special(id, x, z, yaw) {
  const S = SPECIAL[id];
  const b = new Body(S.scale, S.build);
  const rig = new RigModel(scene, buildHumanoid({ id }), { name: id });
  pose(b, x, z, yaw, S.a);
  rig.update(b);
  rigs.push({ rig, b });
  return b;
}
const holdRifle = (s = 1) => ({ arms: 'custom', handR: [0.07, 1.26 * s, 0.25], handL: [-0.02, 1.29 * s, 0.55], poleL: null, poleR: null });

const cam = (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); };
const ids = ['bill', 'zoey', 'louis', 'francis'];
if (view === 'lineup') {
  ids.forEach((id, i) => survivor(id, -1.5 + i * 1.0, 0, Math.PI + 0.25 - i * 0.17, i % 2 ? holdRifle(CHARACTERS[id].body.scale ?? 1) : {}));
  cam(0, 1.3, 4.6, 0, 0.95, 0);
} else if (view === 'face' || view === 'body' || view === 'back') {
  const id = Q.get('id') || 'bill';
  const yaw = +(Q.get('yaw') || 0);
  const b = survivor(id, 0, 0, Math.PI + yaw, Q.get('hold') ? holdRifle(CHARACTERS[id].body.scale ?? 1) : {});
  const hy = b.jy(J.HEAD);
  if (view === 'face') cam(0.02, hy + 0.04, 0.72, 0, hy + 0.02, 0);
  else if (view === 'back') cam(0.3, 1.3, -2.6, 0, 0.95, 0);
  else cam(0.4, 1.25, 2.6, 0, 0.92, 0);
} else if (view === 'specials') {
  ['hunter', 'smoker', 'boomer', 'tank', 'witch'].forEach((id, i) => special(id, -3 + i * 1.5, 0, Math.PI + 0.3));
  cam(0, 1.6, 6.5, 0, 1.0, 0);
} else if (view === 'specials2') {
  ['charger', 'jockey', 'spitter'].forEach((id, i) => special(id, -1.6 + i * 1.6, 0, Math.PI + +(Q.get('yaw') || 0.3)));
  cam(0, 1.4, 5.2, 0, 0.95, 0);
} else if (view === 'special') {
  const id = Q.get('id') || 'hunter';
  const b = special(id, 0, 0, Math.PI + +(Q.get('yaw') || 0.3));
  const hy = b.jy(J.HEAD);
  if (Q.get('close')) cam(0.05, hy + 0.03, 0.85 * (id === 'tank' ? 1.6 : 1), 0, hy, 0);
  else cam(0.5, id === 'tank' ? 1.6 : 1.2, id === 'tank' ? 4.2 : 3.0, 0, id === 'tank' ? 1.2 : 0.9, 0);
} else if (view === 'crowd') {
  const n = +(Q.get('n') || 24);
  const outfits = (Q.get('outfit') || 'civilian,hospital,worker,police,subway,airport,office').split(',');
  const crowd = new CrowdRenderer(scene, n + 4);
  const rnd = (() => { let s = +(Q.get('seed') || 7); return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  for (let i = 0; i < n; i++) {
    const b = new Body(0.92 + rnd() * 0.14, 0.9 + rnd() * 0.22);
    const cols = Math.ceil(Math.sqrt(n * 2));
    const x = -((cols - 1) * 0.75) / 2 + (i % cols) * 0.75 + (Math.floor(i / cols) % 2) * 0.35;
    const z = -Math.floor(i / cols) * 1.1;
    const slot = crowd.alloc(b, outfits[i % outfits.length], rnd);
    const mode = i % 3;
    pose(b, x, z, Math.PI + (rnd() - 0.5) * 0.8, { arms: mode === 0 ? 'reach' : 'hang', lean: 0.1 + rnd() * 0.2, hunch: rnd() * 0.2, headTilt: (rnd() - 0.5) * 0.6, time: rnd() * 10, seed: i, sway: 0.02, twitch: 0.2 });
    if (Q.get('gore') && i % 4 === 1) b.severed |= 1 << (2 + (i % 8));
    crowd.writeBody(slot, b);
  }
  const close = Q.get('close');
  if (close) cam(-0.5, 1.55, 1.2, -0.8, 1.35, -0.3);
  else cam(0, 1.7, 5.5, 0, 1.0, -1.2);
}
if (Q.get('cam')) { const c = Q.get('cam').split(',').map(Number); cam(...c); }
renderer.render(scene, camera);
renderer.render(scene, camera);
const info = renderer.info.render;
document.getElementById('info').textContent = `${view} calls=${info.calls} tris=${info.triangles} build=${(performance.now() - t0).toFixed(0)}ms`;
window.__ready = true;
window.__stats = { calls: info.calls, tris: info.triangles, ms: performance.now() - t0 };
