import * as THREE from 'three';
import { RNG } from '../core/math';
import type { Arena } from './arena';
import { HALF_D, HALF_W } from './arena';

/**
 * Set dressing for the warehouse: pallet racking, lockers, a workbench, an overhead crane rail
 * with chains, bulkhead wall lamps with light pools, signage, moonlit windows with rain, faint
 * moon beams and painted floor markings. Everything opaque is merged by material afterwards
 * (Arena.mergeStatic); the light pools are one "2x modulate" decal mesh each for walls and floor.
 */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ textures
/** Night sky through dirty factory glass: mullion grid, grime, a couple of broken panes. */
function windowTexture(seed: number) {
  const W = 512, H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#9fb8dc');
  sky.addColorStop(0.55, '#6c88b4');
  sky.addColorStop(1, '#3d5276');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // moon glow off to one side and soft clouds
  const mx = W * (0.2 + rng.next() * 0.6), my = H * 0.25;
  const glow = ctx.createRadialGradient(mx, my, 0, mx, my, W * 0.45);
  glow.addColorStop(0, 'rgba(235,242,255,0.75)');
  glow.addColorStop(1, 'rgba(235,242,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(${40 + rng.int(0, 30)},${55 + rng.int(0, 30)},${85 + rng.int(0, 30)},${0.15 + rng.next() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(rng.next() * W, rng.next() * H * 0.8, 40 + rng.next() * 90, 8 + rng.next() * 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // grime: darker bottom and streaks
  const dirt = ctx.createLinearGradient(0, H * 0.45, 0, H);
  dirt.addColorStop(0, 'rgba(20,24,20,0)');
  dirt.addColorStop(1, 'rgba(20,24,20,0.55)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(25,28,25,${0.08 + rng.next() * 0.15})`;
    ctx.fillRect(rng.next() * W, rng.next() * H * 0.6, 2 + rng.next() * 3, 30 + rng.next() * 90);
  }
  // panes: 4 x 2, a couple broken (dark with jagged shards)
  const cols = 4, rows = 2, f = 10;
  const pw = W / cols, ph = H / rows;
  for (let k = 0; k < 2; k++) {
    const ci = rng.int(0, cols - 1), ri = rng.int(0, rows - 1);
    const x0 = ci * pw, y0 = ri * ph;
    ctx.fillStyle = 'rgba(8,10,16,0.88)';
    ctx.beginPath();
    ctx.moveTo(x0 + pw * rng.next(), y0);
    for (let j = 0; j < 7; j++) ctx.lineTo(x0 + pw * rng.next(), y0 + ph * rng.next());
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#121416';
  for (let i = 0; i <= cols; i++) ctx.fillRect(i * pw - f / 2, 0, f, H);
  for (let j = 0; j <= rows; j++) ctx.fillRect(0, j * ph - f / 2, W, f);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  return tex(c);
}

/** Rain running down the glass (scrolls vertically). */
export function rainTexture() {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(77);
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * W, y = rng.next() * H, len = 10 + rng.next() * 40;
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, 'rgba(210,225,255,0)');
    g.addColorStop(1, `rgba(210,225,255,${0.25 + rng.next() * 0.35})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 1 + rng.next();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng.next() - 0.5) * 2, y + len);
    ctx.stroke();
    // wrap so the texture tiles vertically
    if (y + len > H) {
      ctx.beginPath();
      ctx.moveTo(x, y - H);
      ctx.lineTo(x, y + len - H);
      ctx.stroke();
    }
  }
  return tex(c, true, true);
}

/** Soft vertical shaft for the moon beams. */
function beamTexture() {
  const W = 64, H = 256;
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = Math.pow(1 - y / H, 1.6);
    for (let x = 0; x < W; x++) {
      const u = Math.sin((x / (W - 1)) * Math.PI);
      const a = v * Math.pow(u, 1.5);
      const i = (y * W + x) * 4;
      img.data[i] = 190;
      img.data[i + 1] = 205;
      img.data[i + 2] = 235;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

/** Light pool for 2x-modulate decals: 0.5 = neutral, above brightens the surface under it. */
function poolTexture(r: number, g: number, b: number) {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
      const d = Math.min(1, Math.hypot(dx, dy));
      const k = Math.pow(1 - d, 1.8);
      const i = (y * S + x) * 4;
      img.data[i] = Math.round(Math.min(1, 0.5 + k * r) * 255);
      img.data[i + 1] = Math.round(Math.min(1, 0.5 + k * g) * 255);
      img.data[i + 2] = Math.round(Math.min(1, 0.5 + k * b) * 255);
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return tex(c, false);
}

/**
 * Light from a wall-mounted lamp washing down the wall: bright just under the fitting, widening as
 * it falls, soft gaussian edges. mode 'mod' encodes a 2x-modulate factor (0.5 = neutral), 'add'
 * an alpha mask for the additive scatter layer.
 */
function wallWashTexture(mode: 'mod' | 'add') {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = ((x + 0.5) / S) * 2 - 1;
      const v = (y + 0.5) / S; // 0 = top of the plane (the lamp sits at ~0.2)
      const below = Math.max(0, v - 0.2);
      const width = 0.22 + below * 0.85;
      let k = Math.exp(-Math.pow(u / width, 2) * 2.2);
      k *= v < 0.2 ? Math.exp(-Math.pow((0.2 - v) / 0.09, 2)) : Math.exp(-Math.pow(below / 0.62, 2) * 1.6);
      k *= 1 - Math.pow(Math.abs(u), 6);
      const i = (y * S + x) * 4;
      if (mode === 'mod') {
        img.data[i] = Math.round(Math.min(1, 0.5 + k * 0.62) * 255);
        img.data[i + 1] = Math.round(Math.min(1, 0.5 + k * 0.5) * 255);
        img.data[i + 2] = Math.round(Math.min(1, 0.5 + k * 0.34) * 255);
        img.data[i + 3] = 255;
      } else {
        img.data[i] = 255;
        img.data[i + 1] = 214;
        img.data[i + 2] = 160;
        img.data[i + 3] = Math.round(k * 255);
      }
    }
  ctx.putImageData(img, 0, 0);
  return tex(c, mode === 'add');
}

/** Worn yellow/black diagonal hazard stripes. */
function hazardTexture(seed: number) {
  const W = 256, H = 64;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  ctx.fillStyle = '#d8a818';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#16140f';
  for (let x = -H; x < W + H; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 24, H);
    ctx.lineTo(x + 24 + H, 0);
    ctx.lineTo(x + H, 0);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(70,64,56,${0.25 + rng.next() * 0.5})`;
    ctx.fillRect(rng.next() * W, rng.next() * H, 1 + rng.next() * 6, 1 + rng.next() * 3);
  }
  const t = tex(c, true, true);
  return t;
}

/** Worn painted floor line (alpha). */
function lineTexture(seed: number, color: string) {
  const W = 256, H = 32;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, 4, W, H - 8);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 320; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + rng.next() * 0.7})`;
    ctx.fillRect(rng.next() * W, rng.next() * H, 1 + rng.next() * 7, 1 + rng.next() * 4);
  }
  ctx.globalCompositeOperation = 'source-over';
  return tex(c, true, true);
}

function grateTexture() {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#26282a';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#060707';
  for (let i = 0; i < 9; i++) ctx.fillRect(14 + i * 12, 12, 6, S - 24);
  ctx.strokeStyle = '#3a3d40';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, S - 6, S - 6);
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,8,6,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c);
}

function cardboardTexture(seed: number) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = new RNG(seed);
  ctx.fillStyle = '#9a7448';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${60 + rng.int(0, 60)},${40 + rng.int(0, 40)},${20 + rng.int(0, 20)},${0.1 + rng.next() * 0.2})`;
    ctx.fillRect(rng.next() * S, rng.next() * S, 1 + rng.next() * 3, 6 + rng.next() * 20);
  }
  // tape and a printed label
  ctx.fillStyle = 'rgba(200,180,120,0.75)';
  ctx.fillRect(S * 0.44, 0, S * 0.12, S);
  ctx.fillStyle = 'rgba(240,236,224,0.9)';
  ctx.fillRect(S * 0.12, S * 0.62, S * 0.26, S * 0.18);
  ctx.fillStyle = 'rgba(30,30,30,0.85)';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('IY-' + rng.int(100, 999), S * 0.14, S * 0.7);
  for (let i = 0; i < 6; i++) ctx.fillRect(S * 0.14 + i * 9, S * 0.73, 4, 10);
  ctx.strokeStyle = 'rgba(40,26,12,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, S - 4, S - 4);
  return tex(c);
}

function lockerTexture() {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(5);
  ctx.fillStyle = '#4c5a62';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2a3236';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.fillStyle = '#26303a';
  for (let i = 0; i < 6; i++) ctx.fillRect(32, 22 + i * 9, 64, 4);
  for (let i = 0; i < 6; i++) ctx.fillRect(32, H - 70 + i * 9, 64, 4);
  ctx.fillStyle = '#9aa4a8';
  ctx.fillRect(W - 30, H / 2 - 18, 8, 36);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(${90 + rng.int(0, 60)},${50 + rng.int(0, 30)},20,${0.15 + rng.next() * 0.35})`;
    ctx.fillRect(rng.next() * W, rng.next() * H, 1 + rng.next() * 4, 1 + rng.next() * 9);
  }
  return tex(c);
}

function signTexture(lines: string[], bg: string, fg: string, w = 256, h = 96) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.floor((h - 24) / lines.length);
  ctx.font = `bold ${fs}px Arial, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 14 + fs * (i + 0.5)));
  return tex(c);
}

function pegboardTexture() {
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#7a6448';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a2e20';
  for (let y = 8; y < H; y += 12) for (let x = 8; x < W; x += 12) ctx.fillRect(x, y, 3, 3);
  // tool silhouettes
  ctx.fillStyle = '#25282a';
  const tools: [number, number, number, number][] = [[20, 20, 10, 70], [44, 18, 34, 12], [58, 30, 8, 60], [94, 22, 14, 80], [130, 26, 40, 10], [146, 36, 8, 56], [190, 20, 12, 74], [214, 28, 26, 26]];
  for (const [x, y, w, h] of tools) ctx.fillRect(x, y, w, h);
  return tex(c);
}

// ------------------------------------------------------------------ builder
export interface Dressing {
  rain: THREE.Texture;
  beacon: THREE.Sprite;
  beams: THREE.Mesh;
  sparkLamp: THREE.Vector3 | null;
}

export function dressArena(a: Arena): Dressing {
  const g = a.group;
  const rng = new RNG(4242);
  const add = (m: THREE.Mesh, cast = true, recv = true) => {
    m.castShadow = cast;
    m.receiveShadow = recv;
    g.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    return add(m, cast);
  };

  // shared materials
  const orange = new THREE.MeshStandardMaterial({ color: 0xc8571c, roughness: 0.55, metalness: 0.35 });
  const blueSteel = new THREE.MeshStandardMaterial({ color: 0x2e5476, roughness: 0.5, metalness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.85 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.5, metalness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0x4e3c12, roughness: 0.9, metalness: 0.2 });
  const cardboard = [cardboardTexture(1), cardboardTexture(2)].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  const film = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.05 });
  const lockerMat = new THREE.MeshStandardMaterial({ map: lockerTexture(), roughness: 0.55, metalness: 0.35 });

  // ---------------------------------------------------------------- pallet racking
  // rack along a wall: x/z of the run start, direction along the wall, length, depth (towards the room)
  const rack = (x0: number, z0: number, ux: number, uz: number, len: number, nx: number, nz: number, levels = 3) => {
    const depth = 1.05, H = 4.3;
    const bays = Math.max(1, Math.round(len / 2.6));
    const bay = len / bays;
    const ry = Math.atan2(ux, uz) + Math.PI / 2;
    const at = (u: number, n: number) => [x0 + ux * u + nx * n, z0 + uz * u + nz * n] as const;
    const levelY = [0.12, 1.55, 2.95, 4.2].slice(0, levels + 1);
    for (let b = 0; b <= bays; b++) {
      for (const n of [0.08, depth - 0.08]) {
        const [x, z] = at(b * bay, n);
        box(0.09, H, 0.09, blueSteel, x, H / 2, z);
      }
      // frame bracing
      const [cx, cz] = at(b * bay, depth / 2);
      for (const y of [0.6, 2.1, 3.5]) box(0.04, 0.04, depth - 0.15, blueSteel, cx, y, cz, ry + Math.PI / 2, false);
    }
    for (let b = 0; b < bays; b++) {
      const [mx, mz] = at((b + 0.5) * bay, depth / 2);
      for (const y of levelY) {
        for (const n of [0.08, depth - 0.08]) {
          const [x, z] = at((b + 0.5) * bay, n);
          box(bay - 0.08, 0.11, 0.06, orange, x, y, z, ry, false);
        }
        box(bay - 0.12, 0.03, depth - 0.12, wood, mx, y + 0.07, mz, ry, false);
      }
      // goods: cardboard stacks, wrapped pallets, the odd empty slot
      for (const y of levelY.slice(0, -1)) {
        const r = rng.next();
        if (r < 0.15) continue;
        if (r < 0.45) {
          const h = 0.75 + rng.next() * 0.45;
          box(bay * 0.8, h, depth * 0.8, film, mx, y + 0.09 + h / 2, mz, ry);
        } else {
          let u = -bay / 2 + 0.12;
          while (u < bay / 2 - 0.4) {
            const w = 0.38 + rng.next() * 0.3, h = 0.3 + rng.next() * 0.35;
            const stack = 1 + (rng.next() < 0.5 ? 1 : 0);
            for (let s = 0; s < stack; s++) {
              const [bx, bz] = at((b + 0.5) * bay + u + w / 2, depth / 2 + (rng.next() - 0.5) * 0.15);
              box(w, h, depth * 0.7, cardboard[rng.int(0, 1)], bx, y + 0.09 + h / 2 + s * h, bz, ry + (rng.next() - 0.5) * 0.08);
            }
            u += w + 0.05;
          }
        }
      }
    }
    // collision + end-of-run hazard caps
    const [ax, az] = at(0, 0), [bx2, bz2] = at(len, depth);
    a.obstacles.push({ minX: Math.min(ax, bx2), maxX: Math.max(ax, bx2), minZ: Math.min(az, bz2), maxZ: Math.max(az, bz2), h: H, kind: 'prop', name: 'rack' });
  };
  rack(HALF_W - 0.02, -7.6, 0, 1, 5.2, -1, 0); // east wall, between corner crates and the door
  rack(-HALF_W + 0.02, -5.3, 0, -1, 2.7, 1, 0); // west wall

  // ---------------------------------------------------------------- lockers (south wall)
  for (let i = 0; i < 4; i++) {
    const m = box(0.58, 1.9, 0.5, lockerMat, 3.1 + i * 0.6, 0.95, HALF_D - 0.27, Math.PI);
    m.rotation.y = Math.PI;
  }
  a.obstacles.push({ minX: 2.8, maxX: 5.4, minZ: HALF_D - 0.52, maxZ: HALF_D, h: 1.9, kind: 'prop', name: 'lockers' });
  box(1.2, 0.07, 0.05, darkMetal, 4.0, 1.98, HALF_D - 0.5, 0, false);

  // ---------------------------------------------------------------- workbench + pegboard (north wall)
  const bx = 7.7, bz = -HALF_D + 0.38;
  box(1.7, 0.08, 0.7, wood, bx, 0.92, bz);
  for (const sx of [-0.78, 0.78]) for (const sz of [-0.3, 0.3]) box(0.06, 0.9, 0.06, darkMetal, bx + sx, 0.45, bz + sz, 0, false);
  box(1.6, 0.04, 0.6, darkMetal, bx, 0.25, bz, 0, false);
  box(0.18, 0.14, 0.22, blueSteel, bx - 0.55, 1.03, bz + 0.18); // vise
  box(0.35, 0.12, 0.2, orange, bx + 0.35, 1.02, bz - 0.05); // toolbox
  box(0.25, 0.08, 0.16, darkMetal, bx + 0.05, 1.0, bz + 0.12);
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.85 }));
  peg.position.set(bx, 1.75, -HALF_D + 0.03);
  add(peg, false, true);
  a.obstacles.push({ minX: bx - 0.85, maxX: bx + 0.85, minZ: -HALF_D, maxZ: bz + 0.36, h: 1.0, kind: 'prop', name: 'bench' });

  // ---------------------------------------------------------------- overhead crane rail, trolley, chains
  const railZ = -2.6, railY = 6.25;
  box(HALF_W * 2, 0.06, 0.32, yellow, 0, railY + 0.22, railZ, 0, false);
  box(HALF_W * 2, 0.36, 0.06, yellow, 0, railY, railZ, 0, false);
  box(HALF_W * 2, 0.06, 0.32, yellow, 0, railY - 0.2, railZ, 0, false);
  const tx = -3.6;
  box(0.6, 0.3, 0.5, darkMetal, tx, railY - 0.38, railZ, 0, false);
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x3c3a36, roughness: 0.45, metalness: 0.8 });
  const chain = (x: number, z: number, top: number, bottom: number, hook = true) => {
    const len = top - bottom;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 6), chainMat);
    c.position.set(x, bottom + len / 2, z);
    add(c, false, false);
    const c2 = c.clone();
    c2.position.x += 0.035;
    add(c2, false, false);
    if (hook) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12, Math.PI * 1.4), darkMetal);
      h.position.set(x + 0.02, bottom - 0.08, z);
      h.rotation.z = Math.PI * 0.85;
      add(h, false, false);
      box(0.12, 0.16, 0.1, yellow, x + 0.02, bottom + 0.06, z, 0, false);
    }
  };
  chain(tx, railZ, railY - 0.5, 3.4);
  chain(-10, 6.0, 6.5, 4.2);
  chain(10, -6.0, 6.5, 4.6);
  chain(5, 6.0, 6.5, 5.1, false);

  // ---------------------------------------------------------------- signage
  const exitMat = new THREE.MeshBasicMaterial({ map: signTexture(['EXIT'], '#0d5c2a', '#e8ffe8', 256, 96) });
  const exitSign = (x: number, z: number, ry: number) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 0.08), exitMat);
    s.position.set(x, 3.35, z);
    s.rotation.y = ry;
    add(s, false, false);
  };
  exitSign(HALF_W - 0.06, 0, -Math.PI / 2);
  exitSign(-HALF_W + 0.06, 0, Math.PI / 2);
  const plate = (lines: string[], bg: string, fg: string, x: number, y: number, z: number, ry: number, w = 1.1, h = 0.42) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTexture(lines, bg, fg, 256, Math.round(256 * h / w)), roughness: 0.6 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    add(m, false, true);
  };
  plate(['AUTHORIZED', 'PERSONNEL ONLY'], '#e6e0d2', '#8a1a12', -3.9, 2.4, -HALF_D + 0.03, 0);
  plate(['NO SMOKING'], '#a8221a', '#f2ece0', 9.6, 2.6, HALF_D - 0.03, Math.PI, 0.9, 0.3);
  plate(['FORKLIFT', 'ROUTE'], '#d8a818', '#16140f', -HALF_W + 0.03, 2.3, 4.6, Math.PI / 2, 0.8, 0.42);
  // fire extinguisher by the west door
  const red = new THREE.MeshStandardMaterial({ color: 0xb01c14, roughness: 0.4, metalness: 0.2 });
  const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12), red);
  ext.position.set(-HALF_W + 0.16, 1.05, 2.05);
  add(ext, true, true);
  box(0.06, 0.1, 0.06, darkMetal, -HALF_W + 0.16, 1.38, 2.05, 0, false);
  plate(['FIRE'], '#b01c14', '#ffffff', -HALF_W + 0.03, 1.65, 2.05, Math.PI / 2, 0.36, 0.2);

  // ---------------------------------------------------------------- bulkhead wall lamps + light pools
  const poolWarm = poolTexture(0.75, 0.6, 0.38);
  const modulate = (map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.SrcColorFactor,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
  const wallPools: THREE.BufferGeometry[] = [];
  const floorPools: THREE.BufferGeometry[] = [];
  const lens = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const glowTex = (() => {
    const [c, ctx] = canvas(64, 64);
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,225,170,1)');
    gr.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    return tex(c);
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 });
  // all bulkhead glows share one Points draw call
  const glowPts: number[] = [];
  const wallLamp = (x: number, z: number, nx: number, nz: number) => {
    const y = 3.15;
    const ry = Math.atan2(nx, nz);
    box(0.34, 0.24, 0.16, darkMetal, x + nx * 0.08, y, z + nz * 0.08, ry, false);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.04), lens);
    l.position.set(x + nx * 0.17, y, z + nz * 0.17);
    l.rotation.y = ry;
    add(l, false, false);
    for (const dy of [-0.05, 0.05]) box(0.3, 0.015, 0.02, darkMetal, x + nx * 0.2, y + dy, z + nz * 0.2, ry, false);
    glowPts.push(x + nx * 0.25, y, z + nz * 0.25);
    // pool on the wall (centred a little below the lamp) and on the floor in front of it
    const wp = new THREE.PlaneGeometry(4.4, 4.0);
    wp.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
    // lamp sits 20% down from the top edge of the wash
    wp.translate(x + nx * 0.025, y - 2.0 + 0.8, z + nz * 0.025);
    wallPools.push(wp);
    const fp = new THREE.PlaneGeometry(4.2, 3.0);
    fp.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    fp.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
    fp.translate(x + nx * 1.3, 0.015, z + nz * 1.3);
    floorPools.push(fp);
  };
  wallLamp(-7.5, -HALF_D, 0, 1);
  wallLamp(7.7, -HALF_D, 0, 1);
  wallLamp(-7.5, HALF_D, 0, -1);
  wallLamp(4.2, HALF_D, 0, -1);
  wallLamp(HALF_W, -5.0, -1, 0);
  wallLamp(HALF_W, 6.5, -1, 0);
  wallLamp(-HALF_W, -6.6, 1, 0);
  wallLamp(-HALF_W, 6.2, 1, 0);
  {
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, size: 0.62, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: glowMat.opacity, color: 0xffffff }));
    pts.renderOrder = 3;
    g.add(pts);
  }
  const merge = (geos: THREE.BufferGeometry[]) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let base = 0;
    for (const ge of geos) {
      const p = ge.attributes.position.array as Float32Array, u = ge.attributes.uv.array as Float32Array, ix = ge.index!.array;
      pos.push(...p);
      uv.push(...u);
      for (const i of ix) idx.push(i + base);
      base += p.length / 3;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx);
    return out;
  };
  // the pools brighten what is under them (2x modulate) plus a little scattered warm light (additive)
  const wallGeo = merge(wallPools), floorGeo = merge(floorPools);
  const wpm = new THREE.Mesh(wallGeo, modulate(wallWashTexture('mod')));
  wpm.renderOrder = 2;
  g.add(wpm);
  const fpm = new THREE.Mesh(floorGeo, modulate(poolWarm));
  fpm.renderOrder = 2;
  g.add(fpm);
  const glowPool = (opacity: number) =>
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb070, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity, polygonOffset: true, polygonOffsetFactor: -3 });
  const washAdd = glowPool(0.13);
  washAdd.map = wallWashTexture('add');
  washAdd.color.set(0xffd2a0);
  const wpa = new THREE.Mesh(wallGeo, washAdd);
  wpa.renderOrder = 3;
  g.add(wpa);
  const fpa = new THREE.Mesh(floorGeo, glowPool(0.09));
  fpa.renderOrder = 3;
  g.add(fpa);

  // ---------------------------------------------------------------- red beacon over the north door
  box(0.22, 0.08, 0.12, darkMetal, 0, 4.55, -HALF_D + 0.08, 0, false);
  const bulbR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  bulbR.position.set(0, 4.6, -HALF_D + 0.1);
  add(bulbR, false, false);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  beacon.position.set(0, 4.65, -HALF_D + 0.25);
  beacon.scale.set(0.75, 0.75, 1);
  g.add(beacon);

  // ---------------------------------------------------------------- floor markings (decals)
  const hazard = hazardTexture(9);
  const hazMat = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.7, transparent: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const floorStrip = (x: number, z: number, w: number, d: number, mat: THREE.Material, rot = 0, rep = 1) => {
    const ge = new THREE.PlaneGeometry(w, d);
    const uvs = ge.attributes.uv.array as Float32Array;
    for (let i = 0; i < uvs.length; i += 2) uvs[i] *= rep;
    const m = new THREE.Mesh(ge, mat);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.012, z);
    add(m, false, true);
  };
  // door thresholds
  floorStrip(0, -HALF_D + 0.35, 5.0, 0.5, hazMat, 0, 4);
  floorStrip(0, HALF_D - 0.35, 5.0, 0.5, hazMat, 0, 4);
  floorStrip(HALF_W - 0.35, 0, 2.2, 0.5, hazMat, Math.PI / 2, 2);
  floorStrip(-HALF_W + 0.35, 0, 2.2, 0.5, hazMat, Math.PI / 2, 2);
  // yellow keep-clear lines in front of the racking
  const yLine = new THREE.MeshStandardMaterial({ map: lineTexture(3, '#d8b020'), transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  floorStrip(HALF_W - 1.45, -5.0, 5.6, 0.12, yLine, Math.PI / 2, 6);
  floorStrip(-HALF_W + 1.45, -6.65, 3.1, 0.12, yLine, Math.PI / 2, 3);
  // drains
  const grate = new THREE.MeshStandardMaterial({ map: grateTexture(), roughness: 0.5, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [x, z] of [[-9.5, 4.5], [8.5, -3.0], [3.0, 8.6]] as [number, number][]) floorStrip(x, z, 0.55, 0.55, grate);

  // ---------------------------------------------------------------- faint moon beams from the north windows
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.05, side: THREE.DoubleSide, fog: false });
  const beamGeos: THREE.BufferGeometry[] = [];
  const dir = new THREE.Vector3(0.45, -0.75, 0.62).normalize(); // from the moon through the glass
  for (const x of [-6, 2, 6]) {
    const top = new THREE.Vector3(x, 5.6, -HALF_D + 0.1);
    const len = 7.5;
    for (const tw of [0, Math.PI / 2]) {
      const pg = new THREE.PlaneGeometry(2.2, len);
      pg.translate(0, -len / 2, 0);
      // orient the plane's -Y axis along the beam direction, twisted about it
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, -1, 0), tw + 0.35);
      pg.applyQuaternion(twist);
      pg.applyQuaternion(q);
      pg.translate(top.x, top.y, top.z);
      beamGeos.push(pg);
    }
  }
  const beams = new THREE.Mesh(merge(beamGeos), beamMat);
  beams.renderOrder = 3;
  g.add(beams);

  return { rain: rainTexture(), beacon, beams, sparkLamp: null };
}

export { windowTexture };
