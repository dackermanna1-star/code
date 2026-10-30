// X-ray kill-cam preview.
//   ?fx=skull,ribs,thigh,heart,lung,liver,arm,shin,pelvis   real sniper rounds fired through the sandbox person
//   &t=0.05         simulated seconds to advance after the hits (bullet time)
//   &ts=0.05        time scale (simulated seconds per real second)
//   &ghost=0        hide the flesh shell        &skin=1  show the normal skin instead of x-ray
//   &cam=head|chest|full|legs|back|side|top or cam=cx,cy,cz,tx,ty,tz[,fov]
//   &bg=arena       daylight sandbox lighting instead of the dark stage
//   &live=1         run an animation loop (orbit with the mouse); otherwise render on demand
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { World } from '../../src/physics/world.js';
import { Vec3 } from '../../src/physics/math.js';
import { Ragdoll } from '../../src/human/ragdoll.js';
import { BodyShape } from '../../src/human/bodyShape.js';
import { buildBodyMesh } from '../../src/human/bodyMesh.js';
import { HumanMesh } from '../../src/render/humanMesh.js';
import { Sandbox } from '../../src/game/sandbox.js';
import { XRayRig, xrayTemplate } from '../../src/render/xray.js';

const q = new URLSearchParams(location.search);
const FIXED = 1 / 60;
const info = document.getElementById('info');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070c);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.02, 60);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1410, 0.5));
const key = new THREE.DirectionalLight(0xfff1e0, 1.8);
key.position.set(1.5, 3, 2.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb8ff, 1.6);
rim.position.set(-2, 1.5, -2.5);
scene.add(rim);
// &bg=arena: the sandbox's daylight look (sky, sun, stronger image-based light) instead of the dark x-ray stage
if (q.get('bg') === 'arena') {
  scene.background = new THREE.Color(0xb9c2cb);
  scene.environmentIntensity = 0.45;
  key.intensity = 2.6;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: q.get('bg') === 'arena' ? 0x8a8d90 : 0x0c1016, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(12, 48, 0x1c2a38, 0x121b24);
grid.position.y = 0.001;
scene.add(grid);

// sandbox person + skinned body mesh
const segNames = new Ragdoll(new World()).segList.map((s) => s.name);
const shape = new BodyShape(segNames);
const sandbox = new Sandbox({ shape });
const person = sandbox.people[0] || sandbox.spawnPerson(new Vec3(0, 0, 0), 0);
for (let i = 0; i < 20; i++) sandbox.step(FIXED);
sandbox.drainFx();
let t0 = performance.now();
const data = buildBodyMesh(shape);
const tBody = performance.now() - t0;
const hm = new HumanMesh(data, person.rd, shape);
scene.add(hm.mesh);
t0 = performance.now();
const T = xrayTemplate();
const tXray = performance.now() - t0;
const xray = q.get('skin') !== '1';
const rig = new XRayRig(person, scene, { seed: +(q.get('seed') || 7) });
if (xray) {
  rig.setVisible(true, 0);
  if (q.get('ghost') !== '0') XRayRig.setGhost(hm, true);
  else hm.mesh.visible = false;
}

// shots: real sniper rounds through the sandbox (injury model + physics), visualised by the rig
const P = (seg) => person.rd.segments[seg].body.pos;
const SHOTS = {
  skull: () => ({ to: [P('head').x, P('head').y + 0.035, P('head').z - 0.01], from: [2.5, 1.75, 0.6] }),
  ribs: () => ({ to: [P('chest').x + 0.04, P('chest').y + 0.0, P('chest').z], from: [1.6, 1.4, 2.4] }),
  heart: () => ({ to: [0.02, 1.29, 0.0], from: [0.9, 1.36, 2.8] }),
  lung: () => ({ to: [-0.07, 1.33, -0.03], from: [-1.4, 1.38, 2.6] }),
  liver: () => ({ to: [-0.05, 1.14, 0.0], from: [-1.0, 1.16, 2.8] }),
  thigh: () => ({ to: [P('thighL').x, P('thighL').y - 0.03, P('thighL').z], from: [2.4, 0.78, 1.4] }),
  shin: () => ({ to: [P('shinR').x, P('shinR').y, P('shinR').z], from: [-2.4, 0.3, 1.2] }),
  arm: () => ({ to: [P('upperArmL').x, P('upperArmL').y, P('upperArmL').z], from: [2.6, 1.3, 1.0] }),
  pelvis: () => ({ to: [0.09, 0.98, -0.02], from: [2.5, 1.0, 1.2] }),
};
const ORGANS = [['heart', [0.016, 1.288, 0.004], 0.05], ['lung L', [0.07, 1.31, -0.03], 0.055], ['lung R', [-0.07, 1.31, -0.03], 0.055], ['liver', [-0.045, 1.145, 0.0], 0.06], ['stomach', [0.04, 1.15, 0.02], 0.04], ['spleen', [0.083, 1.16, -0.045], 0.035], ['intestines', [0, 1.05, 0.025], 0.07]];
const log = [];

function toBindChest(p) {
  const b = person.rd.segments.chest.body;
  const rel = new THREE.Vector3(p.x - b.pos.x, p.y - b.pos.y, p.z - b.pos.z).applyQuaternion(new THREE.Quaternion(b.rot.x, b.rot.y, b.rot.z, b.rot.w).invert());
  const bp = person.rd.segments.chest.bindPos;
  return [rel.x + bp.x, rel.y + bp.y, rel.z + bp.z];
}

function handleHit(e) {
  const exit = e.exit || new Vec3().copy(e.entry).addScaled(e.dir, 0.06);
  rig.bulletTrack(e.entry, exit);
  const s = e.seg.name;
  if (s === 'head') log.push('skull ' + JSON.stringify(rig.shatterSkull(e.entry, e.dir, Math.max(e.energy, 1500)).fragments));
  else if (s === 'chest' || s === 'abdomen') {
    if (s === 'chest') log.push('ribs ' + JSON.stringify(rig.breakBone('chest', e.entry, e.dir, e.energy, { exit }).map((r) => r.name)));
    // organs along the path (the host knows them from the injury model's wound structures)
    const a = toBindChest(e.entry), b = toBindChest(exit);
    for (const [name, c, rad] of ORGANS) {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / l2));
      const d = Math.hypot(a[0] + ab[0] * t - c[0], a[1] + ab[1] * t - c[1], a[2] + ab[2] * t - c[2]);
      if (d < rad) {
        const pw = new Vec3().copy(e.entry).addScaled(e.dir, t * Math.sqrt(l2));
        rig.damageOrgan(name, pw, e.dir, e.energy);
        log.push('organ ' + name);
      }
    }
  } else log.push('bone ' + JSON.stringify(rig.breakBone(s, e.entry, e.dir, e.energy)));
}

function fire(kind) {
  const s = SHOTS[kind]();
  const from = new Vec3(...s.from);
  const dir = new Vec3(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]).normalize();
  sandbox.fire(q.get('weapon') || 'sniper', from, dir);
  for (const e of sandbox.drainFx()) {
    if (e.type === 'fleshHit') handleHit(e);
    if (e.type === 'injury' && e.event.type === 'bonebreak') {
      const i = e.event.info;
      hm.addFracture(i.seg, i.fragment, i.pointBind, i.axisBind);
    }
  }
}

let acc = 0;
function advance(simSeconds, ts) {
  const dt = FIXED * ts;
  const frames = Math.round(simSeconds / dt);
  for (let f = 0; f < frames; f++) {
    acc += dt;
    while (acc >= FIXED) {
      sandbox.step(FIXED);
      acc -= FIXED;
      for (const e of sandbox.drainFx()) {
        if (e.type === 'injury' && e.event.type === 'bonebreak') {
          const i = e.event.info;
          hm.addFracture(i.seg, i.fragment, i.pointBind, i.axisBind);
        }
      }
    }
    rig.update(dt, acc / FIXED);
  }
  hm.update(acc / FIXED);
}

const CAMS = {
  head: [0.5, 1.74, 0.55, 0.0, 1.67, 0.0, 28],
  face: [0.0, 1.68, 0.62, 0.0, 1.66, 0.02, 28],
  chest: [0.62, 1.36, 0.95, 0.0, 1.27, 0.0, 34],
  full: [1.7, 1.15, 2.9, 0.0, 0.92, 0.0, 34],
  legs: [0.9, 0.62, 1.35, 0.05, 0.55, 0.0, 34],
  back: [-0.9, 1.4, -1.6, 0.0, 1.2, 0.0, 34],
  side: [2.2, 1.2, 0.0, 0.0, 1.0, 0.0, 34],
  top: [0.3, 2.4, 0.5, 0.0, 1.5, 0.0, 34],
  abdomen: [0.55, 1.15, 1.0, 0.0, 1.12, 0.02, 34],
};
function view(c) {
  const v = Array.isArray(c) ? c : CAMS[c] || c.split(',').map(Number);
  camera.position.set(v[0], v[1], v[2]);
  controls.target.set(v[3], v[4], v[5]);
  camera.fov = v[6] || 30;
  camera.updateProjectionMatrix();
  controls.update();
}
function render() {
  renderer.render(scene, camera);
}

// scenario from the URL
const fxList = (q.get('fx') || '').split(',').filter(Boolean);
const ts = +(q.get('ts') || 0.05);
advance(0.002, ts);
for (const k of fxList) if (SHOTS[k]) fire(k);
advance(+(q.get('t') || 0), ts);
view(q.get('cam') || 'full');
info.textContent = `body mesh ${tBody.toFixed(0)} ms | x-ray build ${tXray.toFixed(0)} ms ${JSON.stringify(T.timings)} | ${JSON.stringify(T.stats)} | ${log.join(' | ')}`;
render();

window.__sim = { ready: true, scene, camera, controls, renderer, rig, hm, person, sandbox, T, THREE, view, render, advance: (s, t = ts) => advance(s, t), fire, log, info: () => info.textContent };
if (q.get('live') === '1') {
  let last = performance.now();
  const loop = () => {
    const nowT = performance.now();
    const dt = Math.min(0.05, (nowT - last) / 1000);
    last = nowT;
    advance(dt * ts, ts);
    controls.update();
    render();
    requestAnimationFrame(loop);
  };
  loop();
}
