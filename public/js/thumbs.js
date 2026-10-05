// Thumbnail renderer. Like 2008's thumbnail servers, avatars, items and
// places are rendered by the game engine. When a page references a thumbnail
// that hasn't been rendered yet, it is drawn here and uploaded so it is served
// as a plain PNG from then on.
import * as THREE from 'three';
import { CharacterModel } from './engine/CharacterModel.js';
import { buildHat } from './engine/hats.js';
import { drawClothing } from './engine/clothing.js';

let renderer = null;
function getRenderer() {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xeef2ff, 0x8a8478, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-0.6, 1.1, -1.0);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(1, 0.4, 0.5);
  scene.add(fill);
}

/** Frame an object: 3/4 view from the front-left, slightly above. */
function frame(object, w, h, opts = {}) {
  // Point the camera at the object from the classic 3/4 angle, then pull it back
  // until the projected bounding box just fits (fill = fraction of the image).
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const cam = new THREE.PerspectiveCamera(opts.fov || 30, w / h, 0.05, 1000);
  const dir = new THREE.Vector3(opts.side ?? -0.42, opts.up ?? 0.28, -1).normalize(); // in front (-Z), to the character's left
  const fill = 1 / (opts.pad || 1.18);
  const place = (d) => {
    cam.position.copy(center).addScaledVector(dir, d);
    cam.lookAt(center);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    let ext = 0;
    const v = new THREE.Vector3();
    for (const c of corners) { v.copy(c).project(cam); ext = Math.max(ext, Math.abs(v.x), Math.abs(v.y)); }
    return ext;
  };
  let lo = 0.1, hi = 2000;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (place(mid) > fill) lo = mid; else hi = mid; }
  place(hi);
  return cam;
}

function snapshot(scene, cam, w, h) {
  const r = getRenderer();
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}

function renderAvatar(app, w, h) {
  const scene = new THREE.Scene();
  lights(scene);
  const model = new CharacterModel(app);
  scene.add(model.root);
  const cam = frame(model.root, w, h, { pad: 1.06 });
  const url = snapshot(scene, cam, w, h);
  model.dispose();
  return url;
}

// T-shirt catalog thumbnails were flat: a white shirt outline with the image on the chest.
function renderTShirt(spec, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const s = w / 120;
  x.save(); x.scale(s, s);
  x.fillStyle = '#fff'; x.strokeStyle = '#9ec3e6'; x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(40, 12); x.lineTo(80, 12); x.lineTo(108, 30); x.lineTo(98, 48); x.lineTo(88, 42); x.lineTo(88, 110);
  x.lineTo(32, 110); x.lineTo(32, 42); x.lineTo(22, 48); x.lineTo(12, 30); x.closePath();
  x.fill(); x.stroke();
  x.beginPath(); x.moveTo(48, 12); x.quadraticCurveTo(60, 24, 72, 12); x.stroke();
  x.restore();
  const art = document.createElement('canvas');
  art.width = art.height = 128;
  drawClothing(art.getContext('2d'), spec, 'tshirt');
  x.drawImage(art, 38 * s, 32 * s, 44 * s, 44 * s);
  return c.toDataURL('image/png');
}

function renderDecal(spec, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const art = document.createElement('canvas');
  art.width = art.height = 128;
  drawClothing(art.getContext('2d'), spec, 'tshirt');
  x.drawImage(art, w * 0.1, h * 0.1, w * 0.8, h * 0.8);
  return c.toDataURL('image/png');
}

function renderHat(model, w, h) {
  const scene = new THREE.Scene();
  lights(scene);
  const hat = buildHat(model);
  if (!hat) return null;
  scene.add(hat);
  const cam = frame(hat, w, h, { up: 0.35, pad: 1.12 });
  return snapshot(scene, cam, w, h);
}

function renderClothing(type, spec, w, h) {
  const grey = { head: 194, torso: 194, leftArm: 194, rightArm: 194, leftLeg: 194, rightLeg: 194 };
  const app = { colors: grey, face: 'Smile', hats: [], shirt: type === 'Shirt' ? spec : null, pants: type === 'Pants' ? spec : null, tshirt: null };
  return renderAvatar(app, w, h);
}

async function renderModel(model, w, h) {
  const { buildModelPreview } = await import('./places/models.js');
  const scene = new THREE.Scene();
  lights(scene);
  const obj = buildModelPreview(model);
  scene.add(obj);
  const cam = frame(obj, w, h, { up: 0.45, pad: 1.08 });
  return snapshot(scene, cam, w, h);
}

async function renderPlace(data, w, h) {
  const { renderPlaceThumbnail } = await import('./places/index.js');
  return renderPlaceThumbnail(getRenderer(), data, w, h);
}

async function renderJob(job) {
  const { kind, data, w, h } = job;
  if (kind === 'avatar') return renderAvatar(data, w, h);
  if (kind === 'place') return renderPlace(data, w, h);
  if (kind === 'asset') {
    if (data.type === 'Hat') return renderHat(data.model, w, h);
    if (data.type === 'TShirt') return renderTShirt(data.spec, w, h);
    if (data.type === 'Decal') return renderDecal(data.spec, w, h);
    if (data.type === 'Shirt' || data.type === 'Pants') return renderClothing(data.type, data.spec, w, h);
    if (data.type === 'Model') return renderModel(data.model, w, h);
  }
  return null;
}

const done = new Map(); // file -> dataURL (dedupe within a page)
async function processAll() {
  const imgs = [...document.querySelectorAll('img.RenderThumb[data-thumb]')];
  for (const img of imgs) {
    let job;
    try { job = JSON.parse(img.getAttribute('data-thumb')); } catch { continue; }
    img.removeAttribute('data-thumb');
    try {
      let url = done.get(job.file);
      if (!url) {
        url = await renderJob(job);
        if (!url) continue;
        done.set(job.file, url);
        fetch('/Thumbs/Upload.ashx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: job.file, data: url }) }).catch(() => {});
      }
      img.src = url;
      img.classList.remove('RenderThumb');
    } catch (e) {
      console.warn('thumbnail failed', job.file, e);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
}

// "Click here to re-draw it!" on the character page
document.addEventListener('rbx-redraw', () => {}, true);
for (const img of document.querySelectorAll('.CharacterImage img')) {
  img.addEventListener('rbx-redraw', () => { location.href = location.pathname + '?redraw=' + Date.now(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', processAll);
else processAll();

export { renderAvatar, renderJob };
