// Inventory pictures of every item, drawn once and kept as images: tins with
// their labels, bottles, boxes of rounds, magazines, folded clothes in their
// colour, backpacks, medicine, tools - and the guns, rendered from the same
// 3D models you hold.
import * as THREE from 'three';
import { ITEMS } from '../game/items.js';
import { buildGun } from '../../warzone/guns.js';

const CELL = 64;
const cache = new Map();

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

let gunR = null;
function gunImage(d, W, H) {
  if (!gunR) { gunR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); gunR.outputColorSpace = THREE.SRGBColorSpace; gunR.toneMapping = THREE.ACESFilmicToneMapping; gunR.toneMappingExposure = 1.25; }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(0.5, 2, 2); scene.add(sun);
  const info = buildGun(d.gun, []);
  const g = info.group;
  if (d.tint) g.traverse((o) => { if (o.isMesh && o.material?.metalness > 0.5) { o.material = o.material.clone(); o.material.color.setHex(d.tint); } });
  g.rotation.y = -Math.PI / 2;
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-s.x / 2 * 1.08, s.x / 2 * 1.08, s.x / 2 * 1.08 * H / W, -s.x / 2 * 1.08 * H / W, 0.01, 20);
  cam.position.set(c.x, c.y, c.z + 5); cam.lookAt(c);
  gunR.setSize(W, H, false);
  gunR.setClearColor(0x000000, 0);
  gunR.render(scene, cam);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  out.getContext('2d').drawImage(gunR.domElement, 0, 0);
  return out;
}

/** An image (data URL) of the item, sized to its cells (w x h) - or turned on its side. */
export function iconURL(it, rot = false) {
  const d = ITEMS[it.id];
  const key = it.id + ':' + (it.tint || '') + ':' + rot;
  if (cache.has(key)) return cache.get(key);
  const W = d.w * CELL, H = d.h * CELL;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  draw(g, d, W, H, it.tint || d.color);
  let src = c;
  if (rot) { const r = document.createElement('canvas'); r.width = H; r.height = W; const rg = r.getContext('2d'); rg.translate(H, 0); rg.rotate(Math.PI / 2); rg.drawImage(c, 0, 0); src = r; }
  const url = src.toDataURL();
  cache.set(key, url);
  return url;
}

function draw(g, d, W, H, col) {
  const cx = W / 2, cy = H / 2, m = Math.min(W, H);
  g.lineJoin = 'round';
  const label = (txt, y, size = 11, color = '#ffffff') => { if (!txt) return; g.fillStyle = color; g.font = `700 ${size}px Arial Narrow, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, cx, y, W * 0.8); };
  const body = (x, y, w, h, r, c) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, shadeHex(c, 0.65)); gr.addColorStop(0.35, shadeHex(c, 1.15)); gr.addColorStop(1, shadeHex(c, 0.6)); g.fillStyle = gr; rr(g, x, y, w, h, r); g.fill(); };
  if (d.gun) { const img = gunImage(d, W, H); g.drawImage(img, 0, 0); return; }
  switch (d.shape) {
    case 'can': case 'soda': {
      const w = m * 0.62, h = H * (d.shape === 'soda' ? 0.62 : 0.78), x = cx - w / 2, y = cy - h / 2;
      body(x, y, w, h, 5, '#b8bcc0');
      body(x, y + h * 0.18, w, h * 0.62, 2, col);
      label(d.label || '', cy, 10);
      g.fillStyle = '#d8dcdf'; g.fillRect(x, y, w, 4); g.fillRect(x, y + h - 4, w, 4);
      break;
    }
    case 'tin': body(W * 0.1, H * 0.25, W * 0.8, H * 0.5, 8, col); label(d.label, cy, 10); break;
    case 'bottle': case 'spray': {
      const w = m * 0.42, h = H * 0.6, x = cx - w / 2, y = H * 0.3;
      body(x, y, w, h, 6, col);
      g.fillStyle = shadeHex(col, 0.8); g.fillRect(cx - w * 0.18, H * 0.12, w * 0.36, H * 0.2);
      g.fillStyle = d.shape === 'spray' ? '#2a2a2a' : '#3a6aa8'; g.fillRect(cx - w * 0.2, H * 0.08, w * 0.4, H * 0.07);
      if (d.label) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x, y + h * 0.35, w, h * 0.3); label(d.label, y + h * 0.5, 9, '#2a2a2a'); }
      break;
    }
    case 'jar': body(cx - m * 0.32, H * 0.22, m * 0.64, H * 0.66, 8, col); g.fillStyle = '#c8a040'; g.fillRect(cx - m * 0.3, H * 0.14, m * 0.6, H * 0.1); break;
    case 'canteen': g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy + 4, m * 0.36, m * 0.4, 0, 0, 7); g.fill(); g.fillStyle = '#2a2a2a'; g.fillRect(cx - 6, cy - m * 0.44, 12, 10); break;
    case 'fruit': { const gr = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, m * 0.35); gr.addColorStop(0, shadeHex(col, 1.5)); gr.addColorStop(1, shadeHex(col, 0.7)); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy + 3, m * 0.32, 0, 7); g.fill(); g.strokeStyle = '#4a3020'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy - m * 0.25); g.lineTo(cx + 3, cy - m * 0.4); g.stroke(); break; }
    case 'box': case 'bag': case 'pouch': case 'loaf': case 'bar': {
      const w = W * 0.78, h = H * 0.8;
      body(cx - w / 2, cy - h / 2, w, h, d.shape === 'bag' || d.shape === 'pouch' ? 10 : 4, col);
      if (d.label) label(d.label, cy, Math.min(14, W / 6), d.color === '#e8e0c8' || d.color === '#e8eef4' ? '#3a3a3a' : '#ffffff');
      break;
    }
    case 'roll': g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, m * 0.36, m * 0.3, 0, 0, 7); g.fill(); g.fillStyle = shadeHex(col, 0.8); g.beginPath(); g.ellipse(cx, cy, m * 0.12, m * 0.1, 0, 0, 7); g.fill(); break;
    case 'rag': g.fillStyle = col; g.beginPath(); g.moveTo(W * 0.15, H * 0.3); g.lineTo(W * 0.8, H * 0.18); g.lineTo(W * 0.85, H * 0.75); g.lineTo(W * 0.2, H * 0.82); g.fill(); break;
    case 'pills': body(cx - m * 0.2, H * 0.25, m * 0.4, H * 0.6, 4, col); g.fillStyle = '#ffffff'; g.fillRect(cx - m * 0.22, H * 0.18, m * 0.44, H * 0.12); break;
    case 'medkit': body(W * 0.08, H * 0.18, W * 0.84, H * 0.66, 8, '#c8302a'); g.fillStyle = '#fff'; g.fillRect(cx - 6, cy - 18, 12, 36); g.fillRect(cx - 18, cy - 6, 36, 12); break;
    case 'injector': body(cx - 7, H * 0.12, 14, H * 0.76, 4, '#d8d8d0'); g.fillStyle = '#e8b030'; g.fillRect(cx - 7, H * 0.12, 14, 10); break;
    case 'splint': g.fillStyle = col; g.fillRect(cx - 8, H * 0.08, 16, H * 0.84); g.fillStyle = '#e8e4d8'; for (let i = 0; i < 3; i++) g.fillRect(cx - 12, H * (0.2 + i * 0.25), 24, 8); break;
    case 'ivbag': body(cx - m * 0.3, H * 0.1, m * 0.6, H * 0.6, 10, col); g.strokeStyle = '#d8d8d8'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, H * 0.7); g.lineTo(cx, H * 0.95); g.stroke(); break;
    case 'ammobox': body(W * 0.1, H * 0.2, W * 0.8, H * 0.6, 3, col); label(d.ammo, cy, 11, '#1a1a1a'); break;
    case 'ammocan': body(W * 0.1, H * 0.15, W * 0.8, H * 0.7, 4, col); label('5.56', cy, 12); break;
    case 'mag': case 'magCurved': {
      g.save(); g.translate(cx, cy); if (d.shape === 'magCurved') g.rotate(-0.25);
      body(-m * 0.18, -H * 0.42, m * 0.36, H * 0.84, 3, col); g.restore(); break;
    }
    case 'optic': case 'scope': case 'tube': body(W * 0.08, cy - H * 0.2, W * 0.84, H * 0.4, 8, col); g.fillStyle = '#6fb0ff'; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(W * 0.12, cy, 4, H * 0.16, 0, 0, 7); g.fill(); g.globalAlpha = 1; break;
    case 'grip': body(cx - 10, H * 0.1, 20, H * 0.8, 6, col); break;
    case 'knife': case 'machete': case 'screwdriver': {
      g.fillStyle = d.shape === 'screwdriver' ? '#d8a828' : '#3a2a1a'; rr(g, cx - 7, H * 0.62, 14, H * 0.32, 4); g.fill();
      const gr = g.createLinearGradient(cx - 8, 0, cx + 8, 0); gr.addColorStop(0, '#8a9094'); gr.addColorStop(0.5, '#e8ecef'); gr.addColorStop(1, '#8a9094'); g.fillStyle = gr;
      g.beginPath(); g.moveTo(cx - 7, H * 0.62); g.lineTo(cx + 7, H * 0.62); g.lineTo(cx + (d.shape === 'screwdriver' ? 2 : 6), H * 0.06); g.lineTo(cx - 2, H * 0.02); g.closePath(); g.fill();
      break;
    }
    case 'pipe': case 'bat': case 'crowbar': {
      const gr = g.createLinearGradient(cx - 9, 0, cx + 9, 0); gr.addColorStop(0, shadeHex(col, 0.6)); gr.addColorStop(0.5, shadeHex(col, 1.3)); gr.addColorStop(1, shadeHex(col, 0.6)); g.fillStyle = gr;
      if (d.shape === 'bat') { g.beginPath(); g.moveTo(cx - 4, H * 0.95); g.lineTo(cx + 4, H * 0.95); g.lineTo(cx + 10, H * 0.08); g.lineTo(cx - 10, H * 0.08); g.fill(); }
      else { g.fillRect(cx - 6, H * 0.05, 12, H * 0.9); if (d.shape === 'crowbar') { g.beginPath(); g.arc(cx + 10, H * 0.1, 12, Math.PI, Math.PI * 1.9); g.lineWidth = 10; g.strokeStyle = col; g.stroke(); } }
      break;
    }
    case 'hatchet': case 'axe': case 'sledge': case 'shovel': {
      g.fillStyle = '#8a6a4a'; g.fillRect(cx - 5, H * 0.1, 10, H * 0.86);
      g.fillStyle = d.shape === 'axe' ? '#c8302a' : '#7a7e82';
      if (d.shape === 'shovel') { rr(g, cx - W * 0.3, H * 0.62, W * 0.6, H * 0.34, 10); g.fill(); }
      else if (d.shape === 'sledge') g.fillRect(cx - W * 0.4, H * 0.04, W * 0.8, H * 0.14);
      else { g.beginPath(); g.moveTo(cx, H * 0.06); g.lineTo(cx + W * 0.42, H * 0.02); g.lineTo(cx + W * 0.42, H * 0.24); g.lineTo(cx, H * 0.18); g.fill(); }
      break;
    }
    case 'shirt': case 'coat': {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(W * 0.3, H * 0.12); g.lineTo(W * 0.7, H * 0.12); g.lineTo(W * 0.95, H * 0.3); g.lineTo(W * 0.85, H * 0.45); g.lineTo(W * 0.75, H * 0.38); g.lineTo(W * 0.75, H * 0.92); g.lineTo(W * 0.25, H * 0.92); g.lineTo(W * 0.25, H * 0.38); g.lineTo(W * 0.15, H * 0.45); g.lineTo(W * 0.05, H * 0.3); g.closePath(); g.fill();
      if (d.camo) camo(g, W, H);
      g.strokeStyle = shadeHex(col, 0.6); g.lineWidth = 2; g.stroke();
      if (d.shape === 'coat') { g.beginPath(); g.moveTo(cx, H * 0.15); g.lineTo(cx, H * 0.9); g.stroke(); }
      break;
    }
    case 'pants': g.fillStyle = col; g.beginPath(); g.moveTo(W * 0.2, H * 0.06); g.lineTo(W * 0.8, H * 0.06); g.lineTo(W * 0.85, H * 0.95); g.lineTo(W * 0.56, H * 0.95); g.lineTo(cx, H * 0.35); g.lineTo(W * 0.44, H * 0.95); g.lineTo(W * 0.15, H * 0.95); g.closePath(); g.fill(); if (d.camo) camo(g, W, H); g.strokeStyle = shadeHex(col, 0.6); g.lineWidth = 2; g.stroke(); break;
    case 'vest': body(W * 0.14, H * 0.08, W * 0.72, H * 0.84, 10, col); g.fillStyle = shadeHex(col, 0.75); for (let i = 0; i < 3; i++) g.fillRect(W * (0.2 + i * 0.21), H * 0.52, W * 0.17, H * 0.3); break;
    case 'beanie': case 'cap': case 'ushanka': case 'helmet': case 'headtorch': {
      g.fillStyle = col; g.beginPath(); g.arc(cx, cy + m * 0.12, m * 0.36, Math.PI, 0); g.fill();
      if (d.shape === 'cap') { g.fillRect(cx - m * 0.1, cy + m * 0.1, m * 0.5, m * 0.08); }
      if (d.shape === 'ushanka') { g.fillRect(cx - m * 0.4, cy + m * 0.05, m * 0.14, m * 0.3); g.fillRect(cx + m * 0.26, cy + m * 0.05, m * 0.14, m * 0.3); }
      if (d.shape === 'headtorch') { g.fillStyle = '#e8e8c0'; g.beginPath(); g.arc(cx, cy, m * 0.1, 0, 7); g.fill(); }
      break;
    }
    case 'pack': body(W * 0.12, H * 0.14, W * 0.76, H * 0.8, 14, col); g.fillStyle = shadeHex(col, 0.75); rr(g, W * 0.22, H * 0.5, W * 0.56, H * 0.34, 8); g.fill(); if (d.camo) camo(g, W, H); break;
    case 'torch': case 'flare': body(W * 0.32, H * 0.1, W * 0.36, H * 0.8, 6, col); g.fillStyle = d.shape === 'flare' ? '#e8e8e8' : '#e8e8c0'; g.fillRect(W * 0.3, H * 0.06, W * 0.4, H * 0.08); break;
    case 'battery': body(cx - m * 0.22, H * 0.2, m * 0.44, H * 0.6, 4, col); g.fillStyle = '#2a2a2a'; g.fillRect(cx - 4, H * 0.12, 8, 8); break;
    case 'mapitem': body(W * 0.12, H * 0.08, W * 0.76, H * 0.84, 2, col); g.strokeStyle = '#7a9a6a'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(W * 0.15, H * (0.2 + i * 0.2)); g.bezierCurveTo(W * 0.4, H * (0.1 + i * 0.2), W * 0.6, H * (0.3 + i * 0.2), W * 0.85, H * (0.2 + i * 0.2)); g.stroke(); } break;
    case 'compass': g.fillStyle = '#3a5a3a'; g.beginPath(); g.arc(cx, cy, m * 0.38, 0, 7); g.fill(); g.fillStyle = '#e8e4d8'; g.beginPath(); g.arc(cx, cy, m * 0.3, 0, 7); g.fill(); g.fillStyle = '#c82a20'; g.beginPath(); g.moveTo(cx, cy - m * 0.26); g.lineTo(cx + 5, cy); g.lineTo(cx - 5, cy); g.fill(); break;
    case 'binoculars': body(W * 0.06, cy - H * 0.3, W * 0.4, H * 0.6, 8, col); body(W * 0.54, cy - H * 0.3, W * 0.4, H * 0.6, 8, col); break;
    case 'book': body(W * 0.12, H * 0.1, W * 0.76, H * 0.8, 3, col); g.fillStyle = '#e8e0c8'; g.fillRect(W * 0.8, H * 0.12, W * 0.06, H * 0.76); break;
    case 'radio': body(W * 0.2, H * 0.18, W * 0.6, H * 0.78, 5, col); g.fillStyle = '#2a2a2a'; g.fillRect(W * 0.62, H * 0.02, 5, H * 0.2); break;
    case 'tape': g.fillStyle = col; g.beginPath(); g.arc(cx, cy, m * 0.36, 0, 7); g.fill(); g.fillStyle = '#4a4a4a'; g.beginPath(); g.arc(cx, cy, m * 0.16, 0, 7); g.fill(); break;
    case 'opener': g.fillStyle = col; g.fillRect(cx - 5, H * 0.15, 10, H * 0.7); g.fillStyle = '#4a4a4a'; g.fillRect(cx - 10, H * 0.15, 20, 14); break;
    default: body(W * 0.15, H * 0.15, W * 0.7, H * 0.7, 6, col || '#888');
  }
}
function camo(g, W, H) { g.save(); g.globalCompositeOperation = 'source-atop'; const cols = ['#3a4a2a', '#6a6a42', '#2a2a1e']; for (let i = 0; i < 14; i++) { g.fillStyle = cols[i % 3]; g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 4 + Math.random() * 9, 3 + Math.random() * 6, Math.random() * 3, 0, 7); g.fill(); } g.restore(); }

export const ICON_CELL = CELL;
