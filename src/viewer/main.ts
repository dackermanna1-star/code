// Model viewer: renders a grid of foods (ids x forms x cooking states) for visual review.
//   /viewer.html?cat=fruit&forms=whole,halved,sliced,diced&states=raw,fried
//   /viewer.html?ids=apple,tomato&states=raw,grilled,burnt,frozen,bitten
//   /viewer.html?all=1
// Cooking state presets: raw fried grilled baked deepfried boiled toasted burnt frozen peeled bitten melted hot

import * as THREE from 'three';
import { createRenderer, setupLights, focusShadow } from '../render/setup';
import { INGREDIENTS, getDef } from '../food/catalog';
import { makeFood, type FoodState, type Form } from '../food/types';
import { FoodVisual } from '../food/visual';
import { hasModel } from '../models/registry';
import { buildKitchen } from '../world/kitchen';
import { buildGallery } from '../world/props/gallery';
import { VIEWS } from '../world/layout';
import { sampleDishes } from './samples';

const q = new URLSearchParams(location.search);
const renderer = createRenderer({ preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') ?? '#f3ead9');
const lights = setupLights(scene, renderer);

// --- Kitchen mode: /viewer.html?kitchen=1&view=overview|board|pan|...   Props gallery: ?props=1 ---
if (q.get('kitchen')) {
  const refs = buildKitchen();
  scene.add(refs.root);
  scene.background = new THREE.Color('#cfe9f7');
  const view = VIEWS[(q.get('view') ?? 'overview') as keyof typeof VIEWS] ?? VIEWS.overview;
  const cam = new THREE.PerspectiveCamera(view.fov, window.innerWidth / window.innerHeight, 0.05, 60);
  cam.position.copy(view.pos);
  cam.lookAt(view.target);
  focusShadow(lights.sun, new THREE.Vector3(0.2, 0.9, -0.5), 3.6);
  let t = 0;
  const tick = () => {
    t += 1 / 60;
    refs.ambient.update(1 / 60, t);
    renderer.render(scene, cam);
    if (++t > 3) (window as unknown as { __ready: boolean }).__ready = true;
    requestAnimationFrame(tick);
  };
  tick();
} else if (q.get('props')) {
  const g = buildGallery();
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 60);
  const dist = Math.max(size.x / (2 * Math.tan(THREE.MathUtils.degToRad(16)) * cam.aspect), size.y * 2) * 1.15 + 0.5;
  const elev = THREE.MathUtils.degToRad(parseFloat(q.get('angle') ?? '22'));
  cam.position.set(c.x, c.y + Math.sin(elev) * dist, c.z + Math.cos(elev) * dist);
  cam.lookAt(c);
  const ground2 = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#efe3cf', roughness: 0.9 }));
  ground2.rotation.x = -Math.PI / 2;
  ground2.position.y = box.min.y - 0.001;
  ground2.receiveShadow = true;
  scene.add(ground2);
  focusShadow(lights.sun, c, Math.max(size.x, size.z) * 0.6 + 0.3);
  let n = 0;
  const tick = () => {
    renderer.render(scene, cam);
    if (++n > 3) (window as unknown as { __ready: boolean }).__ready = true;
    requestAnimationFrame(tick);
  };
  tick();
} else {
  gridMode();
}

function gridMode() {
let ids: string[];
if (q.get('ids')) ids = q.get('ids')!.split(',').map((s) => s.trim()).filter(Boolean);
else if (q.get('cat')) ids = INGREDIENTS.filter((d) => d.category === q.get('cat')).map((d) => d.id);
else if (q.get('all')) ids = INGREDIENTS.map((d) => d.id);
else ids = ['apple', 'tomato', 'banana'];
if (q.get('modeled')) ids = ids.filter((id) => hasModel(id));

const forms = (q.get('forms') ?? 'whole').split(',') as Form[];
const states = (q.get('states') ?? 'raw').split(',');
const cell = parseFloat(q.get('size') ?? '0.42');
const maxCols = parseInt(q.get('cols') ?? '0', 10);

function applyPreset(s: FoodState, preset: string) {
  const c = s.cook;
  switch (preset) {
    case 'fried': c.fry = 1.1; c.temp = 0.8; break;
    case 'grilled': c.grill = 1.1; c.temp = 0.8; break;
    case 'baked': c.bake = 1.1; c.temp = 0.8; break;
    case 'deepfried': c.deepfry = 1.1; c.temp = 0.8; break;
    case 'boiled': c.boil = 1.1; c.temp = 0.8; break;
    case 'toasted': c.toast = 1.1; c.temp = 0.8; break;
    case 'burnt': c.fry = 2.5; c.burn = 0.9; c.temp = 1; break;
    case 'frozen': c.freeze = 1; c.temp = -1; break;
    case 'melted': c.melt = 1; c.temp = 0.8; break;
    case 'peeled': s.peeled = true; break;
    case 'ketchup': s.season = { ketchup: 1 }; break;
    case 'spread': s.season = { 'tomato-sauce': 1 }; break;
    default: break;
  }
}

const dishes = q.get('dishes') ? sampleDishes() : null;
if (dishes) {
  ids = dishes.map((d) => d.label);
}
const combos: { form: Form; preset: string }[] = [];
for (const form of forms) for (const preset of states) combos.push({ form, preset });

// Layout: one row per id, one column per combo (wrap ids into multiple column groups if many)
const visuals: FoodVisual[] = [];
const labels: { el: HTMLElement; pos: THREE.Vector3 }[] = [];
let cols = combos.length;
let rowsPerBlock = ids.length;
if (maxCols > 0 && combos.length === 1) {
  cols = maxCols;
  rowsPerBlock = Math.ceil(ids.length / maxCols);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#efe3cf', roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const totalW = cols * cell;
const totalD = rowsPerBlock * cell;
ids.forEach((id, i) => {
  combos.forEach((combo, j) => {
    let col = j, row = i;
    if (maxCols > 0 && combos.length === 1) {
      col = i % maxCols;
      row = Math.floor(i / maxCols);
    }
    const s = dishes ? dishes[i].state : makeFood(id, combo.form);
    if (!dishes) s.seed = 1234 + i * 17 + j * 5;
    applyPreset(s, combo.preset);
    let v: FoodVisual;
    try {
      v = new FoodVisual(s);
    } catch (e) {
      console.error('build failed', id, combo, e);
      return;
    }
    const x = -totalW / 2 + cell * (col + 0.5);
    const z = -totalD / 2 + cell * (row + 0.5);
    v.root.position.set(x, 0, z);
    if (combo.preset === 'bitten') {
      const b = v.bounds;
      const c = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y * 0.8, b.max.z);
      v.addBite(c, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.35);
    }
    scene.add(v.root);
    visuals.push(v);
    const el = document.createElement('div');
    el.className = 'lbl';
    el.textContent = dishes ? id : `${getDef(id).name}${combo.form !== 'whole' ? ' · ' + combo.form : ''}${combo.preset !== 'raw' ? ' · ' + combo.preset : ''}${hasModel(id) ? '' : ' (fallback)'}`;
    document.body.appendChild(el);
    labels.push({ el, pos: new THREE.Vector3(x, 0, z + cell * 0.36) });
  });
});

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 100);
const elev = THREE.MathUtils.degToRad(parseFloat(q.get('angle') ?? '38'));
function fit() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const needW = totalW * 1.08;
  const needD = totalD * Math.sin(elev) + 0.3;
  const dist = Math.max(needW / 2 / Math.tan(hfov / 2), needD / 2 / Math.tan(vfov / 2)) + 0.3;
  camera.position.set(0, Math.sin(elev) * dist + 0.05, Math.cos(elev) * dist + 0.05);
  camera.lookAt(0, 0.05, 0.05);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
fit();
window.addEventListener('resize', fit);
focusShadow(lights.sun, new THREE.Vector3(0, 0, 0), Math.max(totalW, totalD) * 0.6 + 0.3);
(document.getElementById('info') as HTMLElement).textContent = `${ids.length} items · ${combos.length} variants`;

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
  frames++;
  if (frames === 3) (window as unknown as { __ready: boolean }).__ready = true;
  requestAnimationFrame(loop);
}
loop();
}
