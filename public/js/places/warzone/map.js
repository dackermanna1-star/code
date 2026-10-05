// The "Desert Strike" map: a dusty town in the style of central Iraq. Built
// from parts (so bullets, people and physics collide with it) re-skinned with
// realistic textures, plus decorative meshes. Also returns a street graph the
// AI soldiers navigate, cover spots and the two bases.
import * as THREE from 'three';

let seed = 12345;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];

// --- textures ----------------------------------------------------------------------------------
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function noise(x, w, h, amount, scale = 1) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amount; d[i] = Math.max(0, Math.min(255, d[i] + n * scale)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.9)); }
  x.putImageData(img, 0, 0);
}
function blotches(x, w, h, n, color, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    const cx = Math.random() * w, cy = Math.random() * h, r = rmin + Math.random() * (rmax - rmin);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX = {};
function textures() {
  if (TEX.sand) return TEX;
  TEX.sand = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#c9ad7f'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, 40, 'rgba(160,128,88,0.35)', 20, 80);
    blotches(x, w, h, 40, 'rgba(225,205,165,0.35)', 20, 70);
    noise(x, w, h, 38);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},50,0.5)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }));
  TEX.road = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#5f5a52'; x.fillRect(0, 0, w, h);
    noise(x, w, h, 40);
    blotches(x, w, h, 30, 'rgba(190,160,115,0.45)', 30, 90); // sand drifting onto it
    blotches(x, w, h, 12, 'rgba(30,28,26,0.35)', 10, 40);
    x.strokeStyle = 'rgba(25,23,20,0.7)'; x.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) { x.beginPath(); let px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 60; py += (Math.random() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
  }));
  TEX.stucco = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#d9c7a6'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, 50, 'rgba(150,120,85,0.25)', 15, 70);
    blotches(x, w, h, 30, 'rgba(240,228,205,0.35)', 15, 60);
    noise(x, w, h, 26);
    // stains running down and patches of exposed brick
    for (let i = 0; i < 14; i++) { const sx = Math.random() * w; const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(110,90,60,0)'); g.addColorStop(1, 'rgba(110,90,60,0.25)'); x.fillStyle = g; x.fillRect(sx, Math.random() * h * 0.5, 6 + Math.random() * 14, h); }
    for (let i = 0; i < 4; i++) {
      const px = Math.random() * w, py = Math.random() * h;
      for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 5; c2++) { x.fillStyle = `rgb(${150 + Math.random() * 20},${105 + Math.random() * 15},${70 + Math.random() * 10})`; x.fillRect(px + c2 * 14 + (r % 2) * 7, py + r * 7, 13, 6); }
    }
  }));
  TEX.mudbrick = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#a88a64'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 32; r++) for (let c2 = 0; c2 < 16; c2++) {
      x.fillStyle = `rgb(${155 + Math.random() * 30},${120 + Math.random() * 25},${82 + Math.random() * 18})`;
      x.fillRect(c2 * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14);
    }
    noise(x, w, h, 30);
    blotches(x, w, h, 20, 'rgba(200,175,135,0.4)', 30, 90);
  }));
  TEX.concrete = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#b3aea3'; x.fillRect(0, 0, w, h); noise(x, w, h, 30); blotches(x, w, h, 16, 'rgba(90,85,78,0.25)', 10, 40);
  }));
  TEX.hesco = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#b89e74'; x.fillRect(0, 0, w, h); noise(x, w, h, 30);
    x.strokeStyle = 'rgba(60,62,58,0.85)'; x.lineWidth = 2;
    for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.strokeStyle = 'rgba(90,80,60,0.6)'; x.lineWidth = 6; x.strokeRect(0, 0, w, h);
  }));
  TEX.sandbag = toTex(canvas(256, 128, (x, w, h) => {
    x.fillStyle = '#bba57c'; x.fillRect(0, 0, w, h); noise(x, w, h, 26);
    for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 4; c2++) {
      const bx = c2 * 64 + (r % 2) * 32, by = r * 32;
      const g = x.createRadialGradient(bx + 32, by + 16, 4, bx + 32, by + 16, 34); g.addColorStop(0, 'rgba(255,240,210,0.25)'); g.addColorStop(1, 'rgba(60,45,25,0.5)');
      x.fillStyle = g; x.fillRect(bx, by, 64, 32);
    }
  }));
  TEX.wood = toTex(canvas(128, 256, (x, w, h) => {
    x.fillStyle = '#6a4a30'; x.fillRect(0, 0, w, h); noise(x, w, h, 30);
    for (let i = 0; i < w; i += 21) { x.fillStyle = 'rgba(20,12,6,0.6)'; x.fillRect(i, 0, 2, h); }
  }));
  TEX.metal = toTex(canvas(128, 128, (x, w, h) => {
    x.fillStyle = '#7d7f80'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 8) { x.fillStyle = i % 16 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 4, h); }
    noise(x, w, h, 24); blotches(x, w, h, 10, 'rgba(140,70,30,0.5)', 6, 24);
  }));
  TEX.burnt = toTex(canvas(128, 128, (x, w, h) => {
    x.fillStyle = '#2a2624'; x.fillRect(0, 0, w, h); noise(x, w, h, 30); blotches(x, w, h, 14, 'rgba(120,60,25,0.6)', 6, 30); blotches(x, w, h, 10, 'rgba(10,8,8,0.7)', 6, 30);
  }));
  TEX.window = toTex(canvas(64, 64, (x, w, h) => {
    x.fillStyle = '#1d1a17'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(80,90,100,0.35)'; x.fillRect(4, 4, w - 8, h - 8);
    x.strokeStyle = '#3a3128'; x.lineWidth = 3; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
  }));
  TEX.frond = toTex(canvas(128, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let i = 6; i < h - 4; i += 5) {
      const len = (w / 2 - 4) * Math.sin((i / h) * Math.PI) + 6;
      const g = 110 + Math.random() * 50;
      x.strokeStyle = `rgb(${Math.round(g * 0.62)},${Math.round(g)},${Math.round(g * 0.35)})`; x.lineWidth = 4.5; x.lineCap = 'round';
      x.beginPath(); x.moveTo(w / 2, i); x.quadraticCurveTo(w / 2 - len * 0.5, i + 2, w / 2 - len, i + 14); x.moveTo(w / 2, i); x.quadraticCurveTo(w / 2 + len * 0.5, i + 2, w / 2 + len, i + 14); x.stroke();
    }
    x.strokeStyle = '#7a7438'; x.lineWidth = 5; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
  }));
  TEX.bark = toTex(canvas(64, 128, (x, w, h) => {
    x.fillStyle = '#7a6448'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < h; i += 8) { x.fillStyle = 'rgba(40,28,15,0.55)'; x.fillRect(0, i, w, 2); x.fillStyle = 'rgba(160,135,100,0.4)'; x.fillRect(0, i + 3, w, 2); }
    noise(x, w, h, 26);
  }));
  TEX.fabric = ['#b03028', '#2c5d8a', '#3d7a3a', '#c8902a', '#7a3a6a'].map((c) => toTex(canvas(64, 64, (x, w, h) => {
    x.fillStyle = c; x.fillRect(0, 0, w, h); noise(x, w, h, 24);
    x.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < w; i += 16) x.fillRect(i, 0, 8, h);
  })));
  return TEX;
}

const MAT = {};
function mats() {
  if (MAT.sand) return MAT;
  const T = textures();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...o });
  MAT.sand = std({ map: T.sand });
  MAT.road = std({ map: T.road, roughness: 0.85 });
  MAT.stucco = ['#ffffff', '#f2e6d0', '#e8d6b6', '#fff6e4', '#e0cfb0', '#d8c2a0'].map((c) => std({ map: T.stucco, color: c }));
  MAT.mudbrick = std({ map: T.mudbrick });
  MAT.roof = std({ map: T.stucco, color: '#c8b593' });
  MAT.concrete = std({ map: T.concrete });
  MAT.hesco = std({ map: T.hesco });
  MAT.sandbag = std({ map: T.sandbag });
  MAT.wood = std({ map: T.wood, roughness: 0.8 });
  MAT.metal = std({ map: T.metal, roughness: 0.6, metalness: 0.5 });
  MAT.burnt = std({ map: T.burnt, roughness: 0.95, metalness: 0.2 });
  MAT.window = std({ map: T.window, roughness: 0.3 });
  MAT.dark = std({ color: 0x24201c });
  MAT.tank = std({ color: 0x1e1f22, roughness: 0.5 });
  MAT.bark = std({ map: T.bark });
  MAT.frond = std({ map: T.frond, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.75, emissive: 0x1a2408 });
  MAT.fabric = T.fabric.map((t) => std({ map: t, side: THREE.DoubleSide }));
  MAT.canvas = std({ color: 0x5e6648, roughness: 0.95, side: THREE.DoubleSide });
  MAT.carPaint = ['#e8e4dc', '#c8c2b8', '#d8a83a', '#8a2a24', '#3a4a5a'].map((c) => std({ color: c, roughness: 0.45, metalness: 0.4 }));
  MAT.glass = std({ color: 0x334048, roughness: 0.1, metalness: 0.3 });
  MAT.tyre = std({ color: 0x1a1a1a, roughness: 0.95 });
  MAT.rock = std({ color: 0xb09670, roughness: 1, flatShading: true });
  return MAT;
}

// UVs in studs, so textures tile at a fixed real size on any box
const uvCache = new Map();
function uvBox(sx, sy, sz, tile) {
  const key = `${sx},${sy},${sz},${tile}`;
  if (uvCache.has(key)) return uvCache.get(key);
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uvCache.set(key, g);
  return g;
}

// --- builder -------------------------------------------------------------------------------------
export function buildMap(world, opts = {}) {
  seed = 12345;
  const M = mats();
  const deco = new THREE.Group();
  world.scene.add(deco);
  const cover = [];
  const solids = [];
  const solid = (size, pos, mat, o = {}) => {
    const p = world.add({ size, position: pos, color: 194, top: 'Smooth', bottom: 'Smooth', rotation: o.rotation, name: o.name || 'Wall' });
    p.mesh.geometry = uvBox(size[0], size[1], size[2], o.tile || 8);
    p.mesh.material = mat;
    p.mesh.castShadow = o.shadow !== false; p.mesh.receiveShadow = true;
    if (o.metal) p.userData.metal = true;
    solids.push(p);
    return p;
  };
  const box = (size, pos, mat, o = {}) => {
    const m = new THREE.Mesh(uvBox(size[0], size[1], size[2], o.tile || 8), mat);
    m.position.set(...pos);
    if (o.rotation) m.rotation.set(...o.rotation.map((d) => d * Math.PI / 180));
    m.castShadow = o.shadow !== false; m.receiveShadow = true;
    deco.add(m);
    return m;
  };

  // ground, roads and the edge of the world
  solid([800, 2, 600], [0, -1, 0], M.sand, { tile: 24, shadow: false, name: 'Ground' });
  const roads = [[0, 0, 300, 14], [0, -46, 240, 10], [0, 46, 240, 10]];
  for (const [x, z, len, w] of roads) box([len, 0.06, w], [x, 0.03, z], M.road, { tile: 20, shadow: false });
  for (const x of [-64, 0, 64]) box([10, 0.07, 180], [x, 0.035, 0], M.road, { tile: 20, shadow: false });
  for (const [x, z, sx, sz] of [[0, 120, 400, 2], [0, -120, 400, 2], [180, 0, 2, 240], [-180, 0, 2, 240]]) {
    const wall = world.add({ size: [sx, 60, sz], position: [x, 30, z], transparency: 1, name: 'Boundary' }); void wall;
  }
  // distant hills
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, d = rr(420, 620);
    const h = rr(25, 70), r = rr(60, 140);
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), M.rock);
    hill.position.set(Math.cos(a) * d, h / 2 - 4, Math.sin(a) * d); hill.rotation.y = rand() * 3;
    deco.add(hill);
  }
  // dunes outside the town
  for (let i = 0; i < 22; i++) {
    const x = rr(-170, 170), z = pick([-1, 1]) * rr(96, 115);
    const d = new THREE.Mesh(new THREE.SphereGeometry(rr(10, 22), 16, 8), M.sand);
    d.scale.set(1.6, 0.18, 1); d.position.set(x, -1, z); d.receiveShadow = true; deco.add(d);
  }

  // --- buildings
  const houses = [];
  const windowsOn = (x0, z0, w, d, h, floors) => {
    // dark windows with sills and the odd shutter on each face
    const faces = [[0, -d / 2, w, 0], [0, d / 2, w, Math.PI], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, -Math.PI / 2]];
    for (const [fx, fz, len, rot] of faces) {
      const n = Math.max(1, Math.floor(len / 7));
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < n; i++) {
          if (rand() < 0.25) continue;
          const off = -len / 2 + (i + 0.5) * (len / n);
          const y = 3.5 + f * 9.5 + 1.8;
          const nx = Math.sin(rot) * -1, nz = Math.cos(rot) * -1;
          const px = x0 + fx + Math.cos(rot) * off + nx * 0.06, pz = z0 + fz - Math.sin(rot) * off + nz * 0.06;
          const win = box([2.4, 3.2, 0.12], [px, y, pz], M.window, { shadow: false, rotation: [0, rot * 180 / Math.PI, 0], tile: 3.2 });
          void win;
          box([3, 0.3, 0.5], [px + nx * 0.2, y - 1.75, pz + nz * 0.2], M.stucco[1], { rotation: [0, rot * 180 / Math.PI, 0] });
          if (rand() < 0.3) box([1.2, 3.2, 0.12], [px + Math.cos(rot) * 1.9 + nx * 0.15, y, pz - Math.sin(rot) * 1.9 + nz * 0.15], M.wood, { rotation: [0, rot * 180 / Math.PI + rr(-20, 20), 0], tile: 3 });
        }
      }
    }
  };
  const house = (x, z, w, d, floors, opts2 = {}) => {
    const h = floors * 9.5 + 1;
    const mat = opts2.mud ? M.mudbrick : pick(M.stucco);
    solid([w, h, d], [x, h / 2, z], mat, { tile: 10, name: 'Building' });
    // flat roof with a parapet you can take cover behind
    box([w + 0.2, 0.3, d + 0.2], [x, h + 0.15, z], M.roof, { tile: 10 });
    for (const [px, pz, sx, sz] of [[0, -d / 2 + 0.3, w, 0.6], [0, d / 2 - 0.3, w, 0.6], [-w / 2 + 0.3, 0, 0.6, d], [w / 2 - 0.3, 0, 0.6, d]]) solid([sx, 1.6, sz], [x + px, h + 0.8, z + pz], mat, { tile: 10 });
    windowsOn(x, z, w, d, h, floors);
    // a door on a street-facing side
    const side = opts2.door ?? (Math.abs(z) > Math.abs(x) * 0.3 ? (z > 0 ? -1 : 1) : 0);
    box([3.6, 7, 0.3], [x + (side === 0 ? 0 : rr(-w / 4, w / 4)), 3.5, z + (side || 1) * (d / 2 + 0.1)], M.wood, { tile: 4 });
    // rooftop clutter: black water tanks, satellite dishes
    if (rand() < 0.75) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 16), M.tank);
      t.position.set(x + rr(-w / 3, w / 3), h + 1.6, z + rr(-d / 3, d / 3)); t.castShadow = true; deco.add(t);
    }
    if (rand() < 0.4) {
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 6, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, side: THREE.DoubleSide }));
      dish.position.set(x + rr(-w / 3, w / 3), h + 1.6, z + rr(-d / 3, d / 3)); dish.rotation.x = -1.1; dish.castShadow = true; deco.add(dish);
    }
    if (rand() < 0.35) box([2.4, 1.6, 1.2], [x + w / 2 + 0.6, 6, z + rr(-d / 4, d / 4)], M.metal, { tile: 2 }); // AC unit
    houses.push({ x, z, w, d, h });
  };
  // an enterable house: walls with a doorway and window holes, a roof, and stairs up the side
  const openHouse = (x, z, w, d, stairsSide = 1) => {
    const H = 10, T = 1, mat = pick(M.stucco);
    // floor
    box([w, 0.2, d], [x, 0.1, z], M.concrete, { tile: 6, shadow: false });
    // back and side walls with a window hole each
    const wallWithHoles = (cx, cz, len, along, holes) => {
      // along: 'x' or 'z'; holes: [{at, width, y0, y1}]
      let cur = -len / 2;
      const pieces = [];
      for (const hle of [...holes].sort((a, b) => a.at - b.at)) {
        const a = hle.at - hle.width / 2, b = hle.at + hle.width / 2;
        if (a > cur) pieces.push([cur, a, 0, H]);
        if (hle.y0 > 0) pieces.push([a, b, 0, hle.y0]);
        pieces.push([a, b, hle.y1, H]);
        cur = b;
      }
      if (cur < len / 2) pieces.push([cur, len / 2, 0, H]);
      for (const [a, b, y0, y1] of pieces) {
        const l = b - a, mid = (a + b) / 2;
        const size = along === 'x' ? [l, y1 - y0, T] : [T, y1 - y0, l];
        const pos = along === 'x' ? [cx + mid, (y0 + y1) / 2, cz] : [cx, (y0 + y1) / 2, cz + mid];
        solid(size, pos, mat, { tile: 10 });
      }
    };
    wallWithHoles(x, z - d / 2 + T / 2, w, 'x', [{ at: 0, width: 4, y0: 0, y1: 7 }, { at: w / 3, width: 3, y0: 3.5, y1: 6.5 }]);
    wallWithHoles(x, z + d / 2 - T / 2, w, 'x', [{ at: -w / 4, width: 3, y0: 3.5, y1: 6.5 }, { at: w / 4, width: 4, y0: 0, y1: 7 }]);
    wallWithHoles(x - w / 2 + T / 2, z, d - 2 * T, 'z', [{ at: 0, width: 3, y0: 3.5, y1: 6.5 }]);
    wallWithHoles(x + w / 2 - T / 2, z, d - 2 * T, 'z', [{ at: 0, width: 3, y0: 3.5, y1: 6.5 }]);
    solid([w, 0.8, d], [x, H + 0.4, z], M.roof, { tile: 10 });
    for (const [px, pz, sx, sz] of [[0, -d / 2 + 0.3, w, 0.6], [0, d / 2 - 0.3, w, 0.6], [-w / 2 + 0.3, 0, 0.6, d], [w / 2 - 0.3, 0, 0.6, d]]) solid([sx, 1.6, sz], [x + px, H + 1.6, z + pz], mat, { tile: 10 });
    // stairs up the outside to the roof
    const sx = x + stairsSide * (w / 2 + 1.6);
    for (let i = 0; i < 10; i++) solid([3, 1.05, 2.2], [sx, 0.52 + i * 1.05, z - d / 2 + 2 + i * 1.6], mat, { tile: 6 });
    solid([3, 1, 4], [sx, 10.3, z - d / 2 + 2 + 10 * 1.6], mat, { tile: 6 });
    // inside: a table and a mattress
    box([4, 2.6, 2.4], [x - w / 4, 1.3, z], M.wood, { tile: 3 });
    houses.push({ x, z, w, d, h: H, open: true });
  };

  // fill each block between the streets with buildings and alleys
  const xBlocks = [[-112, -70], [-58, -6], [6, 58], [70, 112]];
  const zBlocks = [[-92, -52], [-40, -8], [8, 40], [52, 92]];
  const openSpots = new Set(['1,1', '2,2', '0,2', '3,1']);
  for (let bi = 0; bi < xBlocks.length; bi++) for (let bj = 0; bj < zBlocks.length; bj++) {
    const [x0, x1] = xBlocks[bi], [z0, z1] = zBlocks[bj];
    // the market square at the centre stays open
    if ((bi === 1 || bi === 2) && (bj === 1 || bj === 2)) {
      const cx = bi === 1 ? x1 - 14 : x0 + 14, cz = bj === 1 ? z1 - 12 : z0 + 12;
      const ox = bi === 1 ? x0 + 14 : x1 - 14, oz = bj === 1 ? z0 + 12 : z1 - 12;
      if (openSpots.has(`${bi},${bj}`)) openHouse(ox, oz, 22, 18, bi === 1 ? -1 : 1);
      else house(ox, oz, 22, 18, 2);
      void cx; void cz;
      continue;
    }
    // two to four buildings per block
    let x = x0;
    while (x < x1 - 8) {
      const w = Math.min(x1 - x, rr(14, 24));
      if (w < 10) break;
      let z = z0;
      while (z < z1 - 8) {
        const d = Math.min(z1 - z, rr(14, 22));
        if (d < 10) break;
        if (rand() < 0.88) house(x + w / 2, z + d / 2, w - 1, d - 1, rand() < 0.45 ? 2 : 1, { mud: rand() < 0.2 });
        z += d + rr(3.5, 6);
      }
      x += w + rr(4, 7);
    }
  }

  // --- the market square: stalls with awnings, crates, a dry fountain
  const stall = (x, z, rot) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; deco.add(g);
    for (const [px, pz] of [[-2.8, -1.8], [2.8, -1.8], [-2.8, 1.8], [2.8, 1.8]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.5, 6), M.wood); p.position.set(px, 3.25, pz); p.castShadow = true; g.add(p); }
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.6), pick(M.fabric)); aw.position.set(0, 6.4, 0); aw.rotation.x = -Math.PI / 2 + 0.25; aw.castShadow = true; g.add(aw);
    const table = new THREE.Mesh(uvBox(5.4, 2.6, 2.4, 3), M.wood); table.position.set(0, 1.3, -0.6); table.castShadow = true; g.add(table);
    for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshStandardMaterial({ color: pick([0xd8a020, 0xb83020, 0x5a8a30, 0xe07a20]) })); f.position.set(-2 + i * 0.8, 2.9, -0.6 + rr(-0.5, 0.5)); g.add(f); }
    world.add({ size: [5.4, 2.6, 2.4], position: [x + Math.sin(rot) * 0.6 * -1 + 0, 1.3, z - Math.cos(rot) * 0.6], transparency: 1, rotation: [0, rot * 180 / Math.PI, 0] });
  };
  for (const [x, z, r] of [[-20, -16, 0], [20, -16, 0], [-20, 16, Math.PI], [20, 16, Math.PI], [-30, 0, Math.PI / 2], [30, 0, -Math.PI / 2]]) { stall(x, z, r); cover.push([x, z]); }
  solid([10, 2.4, 10], [0, 1.2, 0], M.concrete, { tile: 4, name: 'Fountain' });
  solid([4, 5, 4], [0, 4.9, 0], M.concrete, { tile: 4 });
  cover.push([0, 7], [0, -7], [7, 0], [-7, 0]);

  // --- cover on the streets: wrecked cars, sandbags, concrete blocks, rubble
  const car = (x, z, rot, burnt) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; deco.add(g);
    const body = burnt ? M.burnt : pick(M.carPaint);
    const b1 = new THREE.Mesh(uvBox(4.4, 1.6, 9.6, 3), body); b1.position.y = 1.5; g.add(b1);
    const b2 = new THREE.Mesh(uvBox(4.0, 1.5, 5, 3), body); b2.position.set(0, 3.0, 0.4); g.add(b2);
    if (!burnt) { const gl = new THREE.Mesh(uvBox(4.05, 1.1, 4.6, 3), M.glass); gl.position.set(0, 3.05, 0.4); g.add(gl); }
    for (const [wx, wz] of [[-2.1, -3], [2.1, -3], [-2.1, 3], [2.1, 3]]) {
      if (burnt && rand() < 0.5) continue;
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 14), burnt ? M.burnt : M.tyre); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.9, wz); g.add(w);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const p = world.add({ size: [4.4, 3.8, 9.6], position: [x, 1.9, z], transparency: 1, rotation: [0, rot * 180 / Math.PI, 0], name: 'Car' });
    p.userData.metal = true;
    cover.push([x, z]);
  };
  const sandbags = (x, z, len, rot) => {
    const p = solid([len, 3.4, 2.2], [x, 1.7, z], M.sandbag, { tile: 4, rotation: [0, rot, 0], name: 'Sandbags' });
    void p; cover.push([x, z]);
  };
  const barrier = (x, z, rot) => { solid([6, 3.2, 1.4], [x, 1.6, z], M.concrete, { tile: 4, rotation: [0, rot, 0] }); cover.push([x, z]); };
  const rubble = (x, z) => {
    for (let i = 0; i < 9; i++) box([rr(0.8, 2.4), rr(0.5, 1.6), rr(0.8, 2.2)], [x + rr(-3, 3), rr(0.2, 0.9), z + rr(-3, 3)], pick([M.stucco[2], M.concrete, M.mudbrick]), { rotation: [rr(-20, 20), rr(0, 180), rr(-20, 20)], tile: 3 });
    solid([5, 1.4, 5], [x, 0.7, z], M.mudbrick, { tile: 4, shadow: false });
    cover.push([x, z]);
  };
  car(-36, 4.5, 0.1, true); car(40, -4.8, 3.0, false); car(-92, -4, 1.6, true); car(92, 4.6, -1.5, false);
  car(-64, -24, 0.05, false); car(64, 26, 3.1, true); car(5, 30, 0.2, false); car(-4, -62, 0.1, true);
  car(-30, 46.5, 1.5, false); car(28, -46, -1.6, true); car(100, -46, 1.57, true); car(-100, 46, 1.57, false);
  sandbags(-50, -3.5, 6, 0); sandbags(52, 3.5, 6, 0); sandbags(-4, 22, 6, 90); sandbags(4, -24, 6, 90);
  sandbags(-64, 40, 6, 90); sandbags(64, -38, 6, 90); sandbags(-80, -46, 6, 0); sandbags(80, 46, 6, 0);
  barrier(-112, 6, 90); barrier(112, -6, 90); barrier(-70, 48, 0); barrier(70, -48, 0); barrier(-18, -46, 0); barrier(18, 46, 0);
  rubble(-64, 6); rubble(64, -8); rubble(0, -40); rubble(0, 38); rubble(-108, -44); rubble(108, 44);

  // palm trees and power lines
  const palm = (x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); deco.add(g);
    const H = rr(14, 20), lean = rr(-0.12, 0.12), dir = rand() * 6.28;
    let top = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      const t0 = i / 8;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.42 - t0 * 0.12, 0.5 - t0 * 0.12, H / 8 + 0.05, 9), M.bark);
      const off = Math.pow(t0, 1.6) * H * lean;
      seg.position.set(Math.cos(dir) * off, (i + 0.5) * H / 8, Math.sin(dir) * off);
      seg.castShadow = true; g.add(seg);
      top.set(Math.cos(dir) * off, (i + 1) * H / 8, Math.sin(dir) * off);
    }
    for (let i = 0; i < 11; i++) {
      const geo = new THREE.PlaneGeometry(3, 7.5, 1, 6);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const yy = (p.getY(k) + 3.5) / 7; p.setZ(k, -yy * yy * 2.6); }
      geo.translate(0, 3.5, 0); geo.computeVertexNormals();
      const f = new THREE.Mesh(geo, M.frond);
      f.position.copy(top);
      f.rotation.set(-Math.PI / 2 + rr(0.3, 0.8), (i / 11) * Math.PI * 2, 0, 'YXZ');
      f.castShadow = true; g.add(f);
    }
    world.add({ size: [1, H, 1], position: [x, H / 2, z], transparency: 1, name: 'Palm' });
  };
  for (const [x, z] of [[-12, -10], [12, 10], [-46, 8], [46, -9], [-88, 9], [88, -9], [-64, 60], [64, -62], [-125, 30], [125, -30], [-140, -40], [140, 40], [0, 70], [0, -75], [-30, -60], [30, 62]]) palm(x, z);
  const poles = [];
  for (let x = -110; x <= 110; x += 22) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 16, 8), M.wood); p.position.set(x, 8, 8.5); p.castShadow = true; deco.add(p);
    const arm = new THREE.Mesh(uvBox(3, 0.25, 0.25, 2), M.wood); arm.position.set(x, 15, 8.5); deco.add(arm);
    poles.push(new THREE.Vector3(x, 15.2, 8.5));
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  for (let i = 0; i < poles.length - 1; i++) for (const dz of [-1.3, 0, 1.3]) {
    const a = poles[i].clone().setZ(poles[i].z + dz), b = poles[i + 1].clone().setZ(poles[i + 1].z + dz);
    const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 1.6, 0))); }
    deco.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // --- the coalition base (east): HESCO walls, T-walls, tents, a watch tower
  const hesco = (x, z) => { solid([4, 6, 4], [x, 3, z], M.hesco, { tile: 4, name: 'HESCO' }); };
  for (let z = -40; z <= 40; z += 4) if (Math.abs(z) > 10) hesco(126, z);
  for (let x = 130; x <= 166; x += 4) { hesco(x, -42); hesco(x, 42); }
  for (const z of [-24, -12, 12, 24]) { solid([1.4, 9, 6], [168, 4.5, z], M.concrete, { tile: 4 }); }
  const tent = (x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); deco.add(g);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 12, 3, 1, false), M.canvas);
    roof.rotation.set(0, 0, Math.PI / 2); roof.rotateY(Math.PI / 6 + Math.PI / 2); roof.position.y = 2; roof.castShadow = true; g.add(roof);
    world.add({ size: [12, 5.5, 7], position: [x, 2.75, z], transparency: 1 });
  };
  tent(150, -26); tent(150, 26);
  const tower = (x, z, mat) => {
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) solid([0.6, 14, 0.6], [x + dx, 7, z + dz], mat, { tile: 3 });
    solid([6, 0.6, 6], [x, 14, z], mat, { tile: 3 });
    for (const [px, pz, sx, sz] of [[0, -2.8, 6, 0.4], [0, 2.8, 6, 0.4], [-2.8, 0, 0.4, 6], [2.8, 0, 0.4, 6]]) solid([sx, 2.4, sz], [x + px, 15.5, z + pz], M.sandbag, { tile: 3 });
    for (let i = 0; i < 13; i++) solid([2, 0.2, 0.4], [x + 3.4, 0.6 + i * 1.05, z], mat, { tile: 2, name: 'Ladder' }).tags.add('climbable');
  };
  tower(132, 36, M.wood);
  sandbags(140, -8, 8, 90); sandbags(140, 8, 8, 90);

  // --- the militia compound (west): mud-brick walls, a pickup truck, barrels
  for (let z = -40; z <= 40; z += 8) if (Math.abs(z) > 8) solid([2, 7, 8.2], [-126, 3.5, z], M.mudbrick, { tile: 8 });
  solid([44, 7, 2], [-148, 3.5, -40], M.mudbrick, { tile: 8 }); solid([44, 7, 2], [-148, 3.5, 40], M.mudbrick, { tile: 8 });
  house(-160, -22, 16, 16, 1, { mud: true, door: 1 }); house(-160, 24, 14, 14, 1, { mud: true, door: -1 });
  car(-142, -14, 1.2, false); car(-140, 16, 2.0, true);
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 12), M.metal); b.position.set(-136 + rr(-3, 3), 1.3, rr(-30, 30)); b.castShadow = true; deco.add(b); }
  tower(-132, -36, M.wood);

  // --- street graph for the AI: intersections and junctions
  const nodes = [];
  const node = (x, z) => { nodes.push({ x, z, n: [] }); return nodes.length - 1; };
  const at = {};
  const X = [-118, -64, 0, 64, 118], Z = [-46, 0, 46];
  for (const x of X) for (const z of Z) at[`${x},${z}`] = node(x, z);
  const link = (a, b) => { nodes[a].n.push(b); nodes[b].n.push(a); };
  for (const z of Z) for (let i = 0; i < X.length - 1; i++) link(at[`${X[i]},${z}`], at[`${X[i + 1]},${z}`]);
  for (const x of X) for (let j = 0; j < Z.length - 1; j++) link(at[`${x},${Z[j]}`], at[`${x},${Z[j + 1]}`]);
  const eastBase = node(150, 0), westBase = node(-150, 0);
  link(eastBase, at['118,0']); link(eastBase, at['118,-46']); link(eastBase, at['118,46']);
  link(westBase, at['-118,0']); link(westBase, at['-118,-46']); link(westBase, at['-118,46']);
  // the market square is open: diagonals across it
  for (const [a, b] of [['-64,0', '0,46'], ['0,-46', '64,0']]) void a, void b;

  // the walls keep their physics bodies; only their drawing is merged
  for (const p of solids) deco.attach(p.mesh);
  mergeStatic(deco);
  return {
    deco, cover, nodes, houses,
    bases: { east: { x: 150, z: 0, node: eastBase }, west: { x: -150, z: 0, node: westBase } },
    thumbnail: { cam: [60, 40, 60], look: [0, 4, 0] },
  };
}

/**
 * Merge the static decoration meshes that share a material into one mesh each
 * (thousands of windows, sills and rubble become a handful of draw calls).
 */
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isLine || !o.geometry.attributes.uv || !o.geometry.attributes.normal || Array.isArray(o.material) || o.material.transparent) return;
    const k = o.material.uuid + (o.castShadow ? 's' : '');
    if (!groups.has(k)) groups.set(k, { mat: o.material, shadow: o.castShadow, list: [] });
    groups.get(k).list.push(o);
    victims.push(o);
  });
  for (const { mat, shadow, list } of groups.values()) {
    if (list.length < 2) continue;
    let total = 0;
    const geos = list.map((m) => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(m.matrixWorld); total += g.attributes.position.count; return g; });
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count; g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    for (const v of list) v.parent.remove(v);
    root.add(m);
  }
}

/** The desert sky: deep blue overhead, hazy and warm at the horizon, with the sun. */
export function desertSky() {
  const c = canvas(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3f78c2'); g.addColorStop(0.32, '#7fa7d6'); g.addColorStop(0.47, '#d7d4c6'); g.addColorStop(0.5, '#e6d7b8'); g.addColorStop(1, '#cdb48c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const sx = w * 0.62, sy = h * 0.18;
    const sg = x.createRadialGradient(sx, sy, 0, sx, sy, 90); sg.addColorStop(0, 'rgba(255,255,245,1)'); sg.addColorStop(0.1, 'rgba(255,250,225,0.9)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.ellipse(Math.random() * w, h * (0.3 + Math.random() * 0.12), 120 + Math.random() * 120, 8 + Math.random() * 8, 0, 0, 7); x.fill(); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
