// Renders 3D item models into little studio-lit thumbnails for shops & inventory.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { defBounds, getDef } from '../items/registry.js';
import { CATEGORIES } from '../items/registry.js';

let renderer = null, scene = null, camera = null, holder = null;
const cache = new Map();
const queue = [];
const listeners = new Map(); // key -> Set<img>

function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(256, 256);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight('#fff4e6', 2.2); key.position.set(2, 3, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe0ff', 1.2); rim.position.set(-2.5, 1.5, -2); scene.add(rim);
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  holder = new THREE.Group(); scene.add(holder);
}

function placeholder(def) {
  const icon = def.emoji || CATEGORIES[def.category]?.icon || '📦';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="62" font-size="46" text-anchor="middle">${icon}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function render(def, size) {
  init();
  renderer.setSize(size, size, false);
  while (holder.children.length) holder.remove(holder.children[0]);
  const st = def.thumbState ? def.thumbState() : {};
  const obj = def.build(def, st);
  const b = defBounds(def);
  holder.add(obj);
  obj.position.set(-b.center.x, -b.center.y, -b.center.z);
  const wall = def.place === 'wall';
  holder.rotation.set(wall ? 0 : 0.0, wall ? 0 : -0.6, 0);
  const r = Math.max(b.size.x, b.size.y, b.size.z) * 0.62 + 0.001;
  const dist = r / Math.tan((camera.fov * Math.PI) / 360) * 1.08;
  const dir = wall ? new THREE.Vector3(0, 0.05, 1) : new THREE.Vector3(0.0, 0.42, 1).normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);
  camera.near = dist / 50; camera.far = dist * 4; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.9);
  holder.remove(obj);
  obj.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
  return url;
}

function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 12) {
    const { def, size, key } = queue.shift();
    if (cache.has(key)) continue;
    let url;
    try { url = render(def, size); } catch (e) { console.warn('thumb failed', def.id, e); url = placeholder(def); }
    cache.set(key, url);
    const set = listeners.get(key);
    if (set) { for (const img of set) img.src = url; listeners.delete(key); }
  }
  if (queue.length) requestAnimationFrame(pump);
}

export function thumb(defOrId, size = 192) {
  const def = typeof defOrId === 'string' ? getDef(defOrId) : defOrId;
  if (!def) return '';
  const key = def.id + ':' + size;
  if (cache.has(key)) return cache.get(key);
  if (!queue.some((q) => q.key === key)) { queue.push({ def, size, key }); if (queue.length === 1) requestAnimationFrame(pump); }
  return placeholder(def);
}

// <img> that swaps in the rendered thumbnail when ready
export function thumbImg(defOrId, size = 192, cls = '') {
  const def = typeof defOrId === 'string' ? getDef(defOrId) : defOrId;
  const img = document.createElement('img');
  img.className = cls; img.alt = def?.name || ''; img.draggable = false;
  if (!def) return img;
  const key = def.id + ':' + size;
  img.src = thumb(def, size);
  if (!cache.has(key)) { if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(img); }
  return img;
}

// Render a custom texture-based item (like player paintings) – uses state
export function thumbFor(inst, size = 192) {
  if (!inst.def.dynamic) return thumb(inst.def, size);
  return placeholder(inst.def);
}
