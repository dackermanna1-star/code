// Floor & wall finishes the player can choose (and buy) for each room.
import * as THREE from 'three';
import { woodFloor, tiles, canvas, toTexture, cached, plaster, fabric } from '../core/textures.js';
import { seeded } from '../core/utils.js';

function terrazzo(base = '#e8e2d8', seed = 3) {
  return cached(`terrazzo:${base}:${seed}`, () => {
    const S = 512; const c = canvas(S, S); const ctx = c.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
    const rnd = seeded(seed);
    const chips = ['#b9b1a5', '#8f8a84', '#d98f6d', '#6f8b80', '#f1ede6', '#5b5550', '#c7a07a'];
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = chips[Math.floor(rnd() * chips.length)];
      const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * (rnd() < 0.1 ? 9 : 4);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + rnd(); const rr = r * (0.6 + rnd() * 0.6); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.fill();
    }
    return { map: toTexture(c), roughnessMap: null };
  });
}

function concrete(base = '#9c9a96', seed = 8) {
  return cached(`concrete:${base}:${seed}`, () => {
    const S = 512; const c = canvas(S, S); const ctx = c.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
    const rnd = seeded(seed);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 80;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const k = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      g.addColorStop(0, k); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), roughnessMap: null };
  });
}

function checker(a = '#f1efe9', b = '#24262b') {
  return cached(`checker:${a}:${b}`, () => {
    const S = 512; const c = canvas(S, S); const ctx = c.getContext('2d');
    const n = 4; const s = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { ctx.fillStyle = (x + y) % 2 ? a : b; ctx.fillRect(x * s, y * s, s, s); }
    ctx.strokeStyle = 'rgba(120,120,120,0.6)'; ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(S, i * s); ctx.stroke(); }
    return { map: toTexture(c), roughnessMap: null };
  });
}

// size = world meters covered by one texture repeat
export const FLOORS = {
  oak: { label: 'Natural Oak', price: 0, size: 2.4, rough: 0.55, step: 'wood', make: () => woodFloor({ base: '#c09062', seed: 3 }) },
  whiteoak: { label: 'Scandi White Oak', price: 420, size: 2.4, rough: 0.6, step: 'wood', make: () => woodFloor({ base: '#ddc3a0', seed: 12 }) },
  walnut: { label: 'Dark Walnut', price: 520, size: 2.4, rough: 0.45, step: 'wood', make: () => woodFloor({ base: '#7a5136', seed: 21 }) },
  herringbone: { label: 'Herringbone Parquet', price: 780, size: 2.0, rough: 0.5, step: 'wood', make: () => woodFloor({ base: '#b58353', seed: 5, herringbone: true }) },
  ebony: { label: 'Smoked Ebony', price: 640, size: 2.4, rough: 0.4, step: 'wood', make: () => woodFloor({ base: '#3e2f27', seed: 31 }) },
  tile_white: { label: 'White Porcelain Tile', price: 0, size: 1.2, rough: 0.35, step: 'tile', make: () => tiles({ base: '#eceae6', grout: '#c9c4bc', cols: 4, rows: 4 }) },
  tile_marble: { label: 'Carrara Marble', price: 900, size: 1.6, rough: 0.18, step: 'tile', make: () => tiles({ base: '#f1efeb', grout: '#d0ccc4', cols: 2, rows: 2, marble: true, seed: 8 }) },
  tile_terrazzo: { label: 'Terrazzo', price: 0, size: 1.6, rough: 0.3, step: 'tile', make: () => terrazzo() },
  tile_sage: { label: 'Sage Zellige Tile', price: 480, size: 1.0, rough: 0.25, step: 'tile', make: () => tiles({ base: '#9fb59a', grout: '#e0ddd5', cols: 6, rows: 6, variation: 0.12, seed: 14 }) },
  checker: { label: 'Retro Checkerboard', price: 360, size: 1.4, rough: 0.3, step: 'tile', make: () => checker() },
  concrete: { label: 'Polished Concrete', price: 300, size: 3.0, rough: 0.4, step: 'tile', make: () => concrete() },
  carpet: { label: 'Plush Grey Carpet', price: 340, size: 1.0, rough: 1, step: 'carpet', make: () => ({ map: fabric({ base: '#8d8a86', seed: 6, scale: 2 }) }) },
  carpet_blush: { label: 'Blush Wool Carpet', price: 380, size: 1.0, rough: 1, step: 'carpet', make: () => ({ map: fabric({ base: '#d9b3a8', seed: 9, scale: 2 }) }) },
};

export const PAINTS = [
  { id: 'linen', label: 'Linen White', color: '#e9e4dc', price: 0 },
  { id: 'cloud', label: 'Cloud', color: '#eeeae4', price: 0 },
  { id: 'fog', label: 'Morning Fog', color: '#d9dfe3', price: 0 },
  { id: 'sage', label: 'Sage', color: '#b9c4ad', price: 80 },
  { id: 'terracotta', label: 'Terracotta', color: '#c98a6b', price: 80 },
  { id: 'navy', label: 'Midnight Navy', color: '#2f3a52', price: 80 },
  { id: 'blush', label: 'Blush', color: '#e8c5bd', price: 80 },
  { id: 'butter', label: 'Butter', color: '#efdfa6', price: 80 },
  { id: 'forest', label: 'Forest', color: '#3f5546', price: 80 },
  { id: 'lavender', label: 'Lavender', color: '#c7bfdc', price: 80 },
  { id: 'charcoal', label: 'Charcoal', color: '#3b3d41', price: 80 },
  { id: 'sky', label: 'Sky Blue', color: '#a9c7dc', price: 80 },
  { id: 'mint', label: 'Mint', color: '#bfe0cf', price: 80 },
  { id: 'mustard', label: 'Mustard', color: '#d1a443', price: 80 },
  { id: 'oat', label: 'Oat Milk', color: '#ddd0bb', price: 80 },
  { id: 'plum', label: 'Plum', color: '#6b4a5e', price: 80 },
];

const floorMatCache = new Map();
export function floorMaterial(id) {
  if (floorMatCache.has(id)) return floorMatCache.get(id);
  const f = FLOORS[id] || FLOORS.oak;
  const tex = f.make();
  // Floor geometry UVs are in meters, so scale the textures to the finish's tile size.
  const map = tex.map.clone(); map.needsUpdate = true; map.repeat.set(1 / f.size, 1 / f.size);
  let roughnessMap = null;
  if (tex.roughnessMap) { roughnessMap = tex.roughnessMap.clone(); roughnessMap.needsUpdate = true; roughnessMap.repeat.copy(map.repeat); }
  const m = new THREE.MeshStandardMaterial({ map, roughness: f.rough, roughnessMap, metalness: 0 });
  m.userData.size = f.size;
  floorMatCache.set(id, m);
  return m;
}

export function wallMaterial(color) {
  // wall UVs are in meters as well
  const map = plaster().clone(); map.needsUpdate = true; map.repeat.set(1 / 2.5, 1 / 2.5);
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map, roughness: 0.92 });
}
