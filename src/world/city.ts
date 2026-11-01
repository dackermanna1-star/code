import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RNG } from '../core/math';
import { canvas, tex } from './mapKit';

/** A city block face at night: a grid of windows, some lit (warm, cold, television blue). */
export function facadeTexture(seed: number, tone: string) {
  const W = 256, H = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(W, H);
  x.fillStyle = tone;
  x.fillRect(0, 0, W, H);
  const cols = 6 + Math.floor(rng.next() * 4), rows = 16 + Math.floor(rng.next() * 8);
  const cw = W / cols, rh = H / rows;
  const lit = 0.1 + rng.next() * 0.2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const on = rng.next() < lit;
      const k = rng.next();
      x.fillStyle = on ? (k < 0.6 ? `rgba(255,${190 + rng.next() * 40},${110 + rng.next() * 50},${0.7 + rng.next() * 0.3})` : k < 0.85 ? 'rgba(200,225,255,0.85)' : 'rgba(110,150,255,0.9)') : `rgba(10,12,18,${0.85})`;
      x.fillRect(i * cw + cw * 0.18, j * rh + rh * 0.2, cw * 0.64, rh * 0.55);
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Glowing tube lettering on black (the bloom pass does the halo). */
export function neonTexture(lines: string[], color: string, w = 1024, h = 320) {
  const [c, x] = canvas(w, h);
  x.fillStyle = '#05040a';
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(80,70,90,0.6)';
  x.lineWidth = 6;
  x.strokeRect(10, 10, w - 20, h - 20);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const fs0 = Math.floor((h * 0.72) / lines.length);
  lines.forEach((l, i) => {
    // a smaller second line, every line fitted to the frame
    let fs = i === 0 ? fs0 * 1.15 : fs0 * 0.7;
    x.font = `800 ${fs}px "Arial Black", Impact, sans-serif`;
    const tw = x.measureText(l).width;
    if (tw > w * 0.88) fs *= (w * 0.88) / tw;
    x.font = `800 ${fs}px "Arial Black", Impact, sans-serif`;
    const y = h * (lines.length === 1 ? 0.5 : i === 0 ? 0.36 : 0.76);
    x.shadowColor = color;
    x.shadowBlur = 28;
    x.fillStyle = color;
    x.fillText(l, w / 2, y);
    x.shadowBlur = 6;
    x.fillStyle = '#ffffff';
    x.globalAlpha = 0.65;
    x.fillText(l, w / 2, y);
    x.globalAlpha = 1;
  });
  return tex(c, true, false);
}

/**
 * Night sky over a city in the rain: a low overcast lit from below - dull violet overhead, a hot
 * magenta-amber glow at the horizon - with torn cloud base drifting through it.
 */
export function skyTexture(seed: number) {
  const W = 1024, H = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0913');
  g.addColorStop(0.3, '#151022');
  g.addColorStop(0.44, '#2a1732');
  g.addColorStop(0.495, '#56283e');
  g.addColorStop(0.51, '#3e1e2c');
  g.addColorStop(0.56, '#150c12');
  g.addColorStop(1, '#060407');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // cloud base: soft lumps, brighter (city-lit) toward the horizon
  for (let i = 0; i < 260; i++) {
    const y = H * (0.08 + Math.pow(rng.next(), 0.6) * 0.4);
    const k = y / (H * 0.5);
    const cx = rng.next() * W, rw = 30 + rng.next() * 140, rh = 6 + rng.next() * 18 * k;
    const lum = 16 + k * k * 46;
    for (const ox of [0, W, -W]) {
      const cg = x.createRadialGradient(cx + ox, y, 0, cx + ox, y, rw);
      cg.addColorStop(0, `rgba(${lum * 1.15},${lum * 0.8},${lum * 1.25},${0.08 + rng.next() * 0.1})`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = cg;
      x.beginPath();
      x.ellipse(cx + ox, y, rw, rh, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  const t = tex(c, true, false);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}


export interface CityRing {
  n: number;
  r0: number;
  r1: number;
  top0: number;
  top1: number;
}

/**
 * A night city around the arena: rings of lit-window blocks (merged into four draw calls), the
 * tallest with red aircraft beacons. Returns the meshes (for reflection probes) and beacon spots.
 */
export function buildCity(g: THREE.Group, rng: RNG, rings: CityRing[], opts: { bottom?: number; tint?: number; aspect?: number } = {}) {
  const tones = ['#0e1016', '#12141a', '#16131a', '#0c0f14'];
  const mats = tones.map((tn, i) => new THREE.MeshBasicMaterial({ map: facadeTexture(500 + i * 7, tn), color: opts.tint ?? 0xb8b0c0, fog: true }));
  const geosBy: THREE.BufferGeometry[][] = mats.map(() => []);
  const beacons: THREE.Vector3[] = [];
  const bottom = opts.bottom ?? -60;
  const aspect = opts.aspect ?? 0.9;
  let k = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const ang = (i / ring.n) * Math.PI * 2 + rng.next() * (Math.PI / ring.n) * 0.8 + ring.r0 * 0.07;
      const r = ring.r0 + rng.next() * (ring.r1 - ring.r0);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r * aspect;
      const top = ring.top0 + rng.next() * (ring.top1 - ring.top0);
      const w = 7 + rng.next() * 11, d = 7 + rng.next() * 11;
      const h = top - bottom;
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv.array as Float32Array;
      for (let q = 0; q < uv.length; q += 2) {
        uv[q] *= w / 8;
        uv[q + 1] *= h / 16;
      }
      geo.translate(x, bottom + h / 2, z);
      geosBy[k++ % mats.length].push(geo);
      // aircraft-warning beacons on the tall ones
      if (top > 18 && rng.next() < 0.5) beacons.push(new THREE.Vector3(x, top + 0.6, z));
    }
  }
  const meshes: THREE.Mesh[] = [];
  mats.forEach((m, i) => {
    const merged = mergeGeometries(geosBy[i], false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, m);
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
      meshes.push(mesh);
    }
  });
  return { meshes, beacons };
}

/** The street far below: sodium lamps along the blocks, headlights and tail-lights. */
export function buildStreet(g: THREE.Group, rng: RNG, y: number, size = 240) {
    const S = 1024;
    const [c, x] = canvas(S, S);
    x.fillStyle = '#050406';
    x.fillRect(0, 0, S, S);
    const cell = S / 24;
    for (let i = 0; i <= 24; i++) {
      for (const horiz of [true, false]) {
        const p0 = i * cell + (rng.next() - 0.5) * cell * 0.3;
        // the road's own glow, then a lamp every few metres
        x.fillStyle = 'rgba(120,70,30,0.35)';
        if (horiz) x.fillRect(0, p0 - 3, S, 6);
        else x.fillRect(p0 - 3, 0, 6, S);
        for (let t = 0; t < S; t += 9 + rng.next() * 6) {
          x.fillStyle = `rgba(255,${150 + rng.next() * 40},70,${0.5 + rng.next() * 0.4})`;
          if (horiz) x.fillRect(t, p0 - 4, 2, 2);
          else x.fillRect(p0 - 4, t, 2, 2);
        }
        // traffic: white heading one way, red the other
        for (let k = 0; k < 6; k++) {
          const t = rng.next() * S, len = 4 + rng.next() * 10;
          x.fillStyle = rng.next() < 0.5 ? 'rgba(255,245,220,0.9)' : 'rgba(255,40,30,0.85)';
          if (horiz) x.fillRect(t, p0 + (rng.next() < 0.5 ? -1 : 1), len, 1.5);
          else x.fillRect(p0 + (rng.next() < 0.5 ? -1 : 1), t, 1.5, len);
        }
      }
    }
    const street = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex(c, true, false), fog: false, color: 0x9a8a8a }));
    street.position.y = y;
    street.matrixAutoUpdate = false;
    street.updateMatrix();
    g.add(street);
  return street;
}
