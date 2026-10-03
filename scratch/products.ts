// TEMPORARY scratch viewer for product states (tint / from). Deleted before hand-off.
import * as THREE from 'three';
import { createRenderer, setupLights, focusShadow } from '../src/render/setup';
import { emptyCook, type FoodState, type Form } from '../src/food/types';
import { FoodVisual } from '../src/food/visual';
import { demoStates } from '../src/models/products';
import { getDef } from '../src/food/catalog';

const q = new URLSearchParams(location.search);
const renderer = createRenderer({ preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') ?? '#f3ead9');
const lights = setupLights(scene, renderer);

let states: FoodState[] = [];
if (q.get('demo')) {
  states = demoStates();
  const only = q.get('only');
  if (only) states = states.filter((s) => only.split(',').includes(s.id));
  const pick = q.get('pick');
  if (pick) { const idx = pick.split(',').map(Number); states = states.filter((_, i) => idx.includes(i)); }
}
if (q.get('ids')) {
  const forms = (q.get('forms') ?? 'whole').split(',') as Form[];
  for (const id of q.get('ids')!.split(',')) for (const form of forms) states.push({ id, form, cook: emptyCook(), season: {}, seed: 1234 + states.length * 17 });
}
const presets = (q.get('states') ?? '').split(',').filter(Boolean);
if (presets.length) {
  const base = states;
  states = [];
  for (const s of base) for (const p of presets) {
    const c = JSON.parse(JSON.stringify(s)) as FoodState;
    (c as any).__preset = p;
    if (p === 'fried') { c.cook.fry = 1.1; c.cook.temp = 0.8; }
    if (p === 'baked') { c.cook.bake = 1.1; c.cook.temp = 0.8; }
    if (p === 'burnt') { c.cook.fry = 2.5; c.cook.burn = 0.9; c.cook.temp = 1; }
    if (p === 'frozen') { c.cook.freeze = 1; c.cook.temp = -1; }
    if (p === 'half') { c.amount = 0.45; }
    states.push(c);
  }
}
const cell = parseFloat(q.get('size') ?? '0.3');
const cols = Math.min(states.length, parseInt(q.get('cols') ?? '4', 10));
const rows = Math.ceil(states.length / cols);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#efe3cf', roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const totalW = cols * cell, totalD = rows * cell;
const visuals: FoodVisual[] = [];
const labels: { el: HTMLElement; pos: THREE.Vector3 }[] = [];
states.forEach((s, i) => {
  const col = i % cols, row = Math.floor(i / cols);
  let v: FoodVisual;
  try { v = new FoodVisual(s); } catch (e) { console.error('build failed', s.id, e); return; }
  const x = -totalW / 2 + cell * (col + 0.5), z = -totalD / 2 + cell * (row + 0.5);
  v.root.position.set(x, 0, z);
  if ((s as any).__preset === 'bitten') {
    const b = v.bounds;
    v.addBite(new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y * 0.8, b.max.z), Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.35);
  }
  scene.add(v.root);
  visuals.push(v);
  let tris = 0;
  v.content.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  const el = document.createElement('div');
  el.className = 'lbl';
  const from = (s.from ?? []).map((f) => f.id).join('+');
  el.textContent = `${getDef(s.id).name}${s.form !== 'whole' ? ' · ' + s.form : ''}${(s as any).__preset ? ' · ' + (s as any).__preset : ''}${from ? ' [' + from + ']' : ''} ${Math.round(tris)}t`;
  document.body.appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(x, 0, z + cell * 0.38) });
});
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.02, 100);
const elev = THREE.MathUtils.degToRad(parseFloat(q.get('angle') ?? '35'));
const aspect = window.innerWidth / window.innerHeight;
camera.aspect = aspect;
const vfov = THREE.MathUtils.degToRad(camera.fov);
const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
const dist = Math.max((totalW * 1.05) / 2 / Math.tan(hfov / 2), (totalD * Math.sin(elev) + 0.25) / 2 / Math.tan(vfov / 2)) + 0.15;
const lookY = parseFloat(q.get('look') ?? '0.06');
camera.position.set(0, Math.sin(elev) * dist + lookY, Math.cos(elev) * dist);
camera.lookAt(0, lookY, 0);
camera.updateProjectionMatrix();
focusShadow(lights.sun, new THREE.Vector3(0, 0, 0), Math.max(totalW, totalD) * 0.6 + 0.3);
let frames = 0;
function loop() {
  scene.updateMatrixWorld();
  for (const v of visuals) v.update();
  renderer.render(scene, camera);
  for (const l of labels) {
    const p = l.pos.clone().project(camera);
    l.el.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
    l.el.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
  if (++frames === 3) (window as unknown as { __ready: boolean }).__ready = true;
  if (frames < 4) requestAnimationFrame(loop);
}
loop();
