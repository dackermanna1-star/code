import * as THREE from 'three';
import { asphaltTex, blockTex, brickTex, shutterTex } from '../alley';
import { canvas, makeNoise, normalFromHeight, tex } from '../mapKit';
import { concreteTexture, crateTexture, metalSidingTexture } from '../textures';
import type { BloodAtlas } from '../bloodAtlas';
import { RNG } from '../../core/math';

/**
 * The levels' materials, made once each: wet asphalt and paving slabs that take blood, brick and
 * painted block, concrete, corrugated container steel in its colours, iron, rust, planks, glass,
 * chain-link. Floors come blood-patched (their geometry carries the blood uv); the rest are plain.
 */
export class Materials {
  private cache = new Map<string, THREE.Material>();
  constructor(public blood: BloodAtlas, public wet = false) {}

  private get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) this.cache.set(key, (m = make()));
    return m;
  }
  /** A floor material that takes blood (its geometry must come from paintQuad). */
  private painted(m: THREE.MeshStandardMaterial, overlay: THREE.Texture | null = null) {
    this.blood.patchMaterial(m, { overlay });
    return m;
  }
  private rough(base: number) {
    return this.wet ? Math.max(0.12, base * 0.55) : base;
  }

  // ------------------------------------------------------------------ floors (blood)
  asphalt() {
    return this.get('asphalt', () => {
      const t = asphaltTex(77);
      return this.painted(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.45, 0.45), color: 0xb0aeac, roughness: this.rough(0.92), envMapIntensity: this.wet ? 1.2 : 0.7 }));
    });
  }
  /** Paving slabs (a sidewalk, a plaza). */
  slabs() {
    return this.get('slabs', () => {
      const t = slabTex(31);
      return this.painted(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xc8c4bc, roughness: this.rough(0.88), envMapIntensity: this.wet ? 1.1 : 0.6 }));
    });
  }
  concreteFloor() {
    return this.get('concreteFloor', () => {
      const m = concreteTexture(11);
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      return this.painted(new THREE.MeshStandardMaterial({ map: m, color: 0xa8a49e, roughness: this.rough(0.86), envMapIntensity: 0.6 }));
    });
  }
  /** Steel deck plate (a dock's edge, a catwalk, a ship). */
  deckPlate() {
    return this.get('deckPlate', () => {
      const t = treadTex(5);
      return this.painted(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: 0x8a8e90, metalness: 0.55, roughness: this.rough(0.55), envMapIntensity: 1 }));
    });
  }
  planksFloor() {
    return this.get('planksFloor', () => {
      const t = plankTex(9);
      return this.painted(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: 0x9a8a78, roughness: this.rough(0.8) }));
    });
  }
  /** A roof's tar and gravel. */
  roofFloor() {
    return this.get('roofFloor', () => {
      const t = tarTex(13);
      return this.painted(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: 0x9a9a9c, roughness: this.rough(0.95), envMapIntensity: this.wet ? 1.3 : 0.5 }));
    });
  }

  // ------------------------------------------------------------------ walls and solids
  brick(pal: 'red' | 'brown' | 'yellow' = 'red') {
    return this.get('brick-' + pal, () => {
      const t = brickTex(pal === 'red' ? 71 : pal === 'brown' ? 73 : 79, pal);
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: 0xc8b8ac, roughness: this.rough(0.9) });
    });
  }
  /** Brick that takes blood (a wall where a fight happens: paintQuad geometry only). */
  brickPainted(pal: 'red' | 'brown' | 'yellow' = 'red') {
    return this.get('brickP-' + pal, () => {
      const t = brickTex(pal === 'red' ? 71 : pal === 'brown' ? 73 : 79, pal);
      return this.painted(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: 0xc8b8ac, roughness: this.rough(0.9) }));
    });
  }
  block(upper = '#8a948a') {
    return this.get('block-' + upper, () => {
      const t = blockTex(75, upper, '#3a4a40');
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: 0xffffff, roughness: this.rough(0.85) });
    });
  }
  concrete(tint = 0x9c9a96) {
    return this.get('concrete-' + tint, () => {
      const m = concreteTexture(23);
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshStandardMaterial({ map: m, color: tint, roughness: this.rough(0.88) });
    });
  }
  siding(tint = 0x8c9296) {
    return this.get('siding-' + tint, () => {
      const m = metalSidingTexture(3);
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshStandardMaterial({ map: m, color: tint, metalness: 0.45, roughness: this.rough(0.6) });
    });
  }
  /** Corrugated container steel: 'red', 'blue', 'green', 'orange', 'grey', 'white'. */
  container(color: 'red' | 'blue' | 'green' | 'orange' | 'grey' | 'white') {
    return this.get('container-' + color, () => {
      const base = { red: '#8a2a1e', blue: '#1e4a7a', green: '#2a5a3a', orange: '#b86a1e', grey: '#6a6e72', white: '#c8c8c0' }[color];
      const t = containerTex(color.length * 17, base);
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(1, 1), color: 0xffffff, metalness: 0.35, roughness: this.rough(0.62) });
    });
  }
  crate() {
    return this.get('crate', () => {
      const m = crateTexture(4);
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshStandardMaterial({ map: m, roughness: 0.85 });
    });
  }
  iron() {
    return this.get('iron', () => new THREE.MeshStandardMaterial({ color: 0x1e2022, metalness: 0.65, roughness: this.rough(0.5) }));
  }
  steel() {
    return this.get('steel', () => new THREE.MeshStandardMaterial({ color: 0x6a6e72, metalness: 0.7, roughness: this.rough(0.4) }));
  }
  rust() {
    return this.get('rust', () => new THREE.MeshStandardMaterial({ color: 0x5a3020, metalness: 0.3, roughness: 0.8 }));
  }
  paint(color: number, rough = 0.6, metal = 0.1) {
    return this.get(`paint-${color}-${rough}-${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: this.rough(rough), metalness: metal }));
  }
  wood() {
    return this.get('wood', () => {
      const t = plankTex(19);
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: 0x8a7258, roughness: 0.85 });
    });
  }
  glass(tint = 0x0a0c10) {
    return this.get('glass-' + tint, () => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.6 }));
  }
  chainLink() {
    return this.get('chain', () => {
      // (blended, not alpha-tested: the thin wires average away to nothing in the distance otherwise)
      const t = chainTex();
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: 0xb8bcc0 });
    });
  }
  shutter(seed = 7) {
    return this.get('shutter-' + seed, () => new THREE.MeshStandardMaterial({ map: shutterTex(seed), roughness: 0.55, metalness: 0.4 }));
  }
  /** Something that glows (a lit window, a sign's box, a lamp's lens). */
  glow(color: number, k = 1) {
    return this.get(`glow-${color}-${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
  }
  dark() {
    return this.get('dark', () => new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 }));
  }
  tarp(color = 0x2a4a6a) {
    return this.get('tarp-' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }));
  }
}

// ============================================================================ textures
/** Chain-link: diamond wire, a little rust (0.5 m tile). */
function chainTex() {
  const S = 128;
  const [c, x] = canvas(S, S);
  x.clearRect(0, 0, S, S);
  x.lineCap = 'round';
  for (const [col, w] of [['rgba(40,40,40,0.5)', 9], ['rgba(190,195,200,1)', 5]] as [string, number][]) {
    x.strokeStyle = col;
    x.lineWidth = w;
    x.beginPath();
    for (const o of [-S, 0, S]) {
      x.moveTo(o, 0);
      x.lineTo(o + S, S);
      x.moveTo(o + S, 0);
      x.lineTo(o, S);
    }
    x.stroke();
  }
  const t = tex(c);
  t.anisotropy = 8;
  return t;
}
/** Paving slabs: 0.6 m squares, joints, wear and gum (2.4 m tile). */
function slabTex(seed: number) {
  const S = 512, n = 4, cell = S / n;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  const noise = makeNoise(seed, 8);
  hx.fillStyle = '#202020';
  hx.fillRect(0, 0, S, S);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = 150 + rng.next() * 40;
      x.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      x.fillRect(i * cell, j * cell, cell, cell);
      hx.fillStyle = `rgb(${190 + rng.next() * 30},0,0)`;
      hx.fillRect(i * cell + 3, j * cell + 3, cell - 6, cell - 6);
    }
  const img = x.getImageData(0, 0, S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const o = (j * S + i) * 4;
      const k = 0.82 + noise((i / S) * 8, (j / S) * 8) * 0.3 + (rng.next() - 0.5) * 0.08;
      img.data[o] *= k;
      img.data[o + 1] *= k;
      img.data[o + 2] *= k;
    }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(20,18,16,0.7)';
  x.lineWidth = 4;
  for (let k = 0; k <= n; k++) {
    x.beginPath();
    x.moveTo(k * cell, 0);
    x.lineTo(k * cell, S);
    x.moveTo(0, k * cell);
    x.lineTo(S, k * cell);
    x.stroke();
  }
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(40,40,40,${0.2 + rng.next() * 0.3})`;
    x.beginPath();
    x.arc(rng.next() * S, rng.next() * S, 2 + rng.next() * 4, 0, Math.PI * 2);
    x.fill();
  }
  return { map: tex(c), normal: normalFromHeight(hc, 1.6) };
}

/** Steel tread plate (diamond pattern). */
function treadTex(seed: number) {
  const S = 256;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  x.fillStyle = '#7a7e80';
  x.fillRect(0, 0, S, S);
  hx.fillStyle = '#404040';
  hx.fillRect(0, 0, S, S);
  for (let j = 0; j < 16; j++)
    for (let i = 0; i < 16; i++) {
      const cx = i * 16 + (j % 2 ? 8 : 0), cy = j * 16;
      hx.save();
      hx.translate(cx, cy);
      hx.rotate(j % 2 ? 0.8 : -0.8);
      hx.fillStyle = '#d0d0d0';
      hx.fillRect(-6, -1.5, 12, 3);
      hx.restore();
    }
  for (let i = 0; i < 300; i++) {
    x.fillStyle = `rgba(${rng.next() < 0.4 ? '90,50,20' : '20,20,20'},${0.08 + rng.next() * 0.15})`;
    x.fillRect(rng.next() * S, rng.next() * S, 3 + rng.next() * 20, 2 + rng.next() * 8);
  }
  return { map: tex(c), normal: normalFromHeight(hc, 2) };
}

/** Planks (a deck, a floor, a pallet): 0.15 m boards, grain, gaps. */
function plankTex(seed: number) {
  const S = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  const bh = S / 12;
  hx.fillStyle = '#202020';
  hx.fillRect(0, 0, S, S);
  for (let j = 0; j < 12; j++) {
    const v = 120 + rng.next() * 50;
    x.fillStyle = `rgb(${v},${v * 0.78},${v * 0.55})`;
    x.fillRect(0, j * bh, S, bh);
    for (let k = 0; k < 40; k++) {
      x.strokeStyle = `rgba(60,40,20,${0.1 + rng.next() * 0.2})`;
      x.lineWidth = 1;
      const y = j * bh + rng.next() * bh;
      x.beginPath();
      x.moveTo(0, y);
      x.bezierCurveTo(S * 0.3, y + rng.next() * 6 - 3, S * 0.7, y + rng.next() * 6 - 3, S, y);
      x.stroke();
    }
    hx.fillStyle = `rgb(${180 + rng.next() * 40},0,0)`;
    hx.fillRect(0, j * bh + 2, S, bh - 4);
    const cut = rng.next() * S;
    x.fillStyle = 'rgba(30,20,10,0.8)';
    x.fillRect(cut, j * bh, 3, bh);
  }
  return { map: tex(c), normal: normalFromHeight(hc, 1.5) };
}

/** Tar and gravel (a flat roof). */
function tarTex(seed: number) {
  const S = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  x.fillStyle = '#2e2e30';
  x.fillRect(0, 0, S, S);
  hx.fillStyle = '#606060';
  hx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    const v = 50 + rng.next() * 90;
    const px = rng.next() * S, py = rng.next() * S, s = 1 + rng.next() * 2.4;
    x.fillStyle = `rgba(${v},${v},${v},${0.4 + rng.next() * 0.5})`;
    x.fillRect(px, py, s, s);
    hx.fillStyle = `rgba(255,255,255,${0.3 + rng.next() * 0.5})`;
    hx.fillRect(px, py, s, s);
  }
  for (let i = 0; i < 14; i++) {
    x.strokeStyle = 'rgba(10,10,10,0.6)';
    x.lineWidth = 3 + rng.next() * 4;
    x.beginPath();
    const y = rng.next() * S;
    x.moveTo(0, y);
    x.lineTo(S, y + (rng.next() - 0.5) * 40);
    x.stroke();
  }
  return { map: tex(c), normal: normalFromHeight(hc, 1.2) };
}

/** Corrugated container steel: vertical ribs, rust bleeding from the seams, scuffs (2.4 m tile). */
function containerTex(seed: number, base: string) {
  const W = 512, H = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(W, H);
  const [hc, hx] = canvas(W, H);
  const rib = W / 16;
  for (let i = 0; i < 16; i++) {
    const g = hx.createLinearGradient(i * rib, 0, (i + 1) * rib, 0);
    g.addColorStop(0, '#202020');
    g.addColorStop(0.3, '#e0e0e0');
    g.addColorStop(0.7, '#e0e0e0');
    g.addColorStop(1, '#202020');
    hx.fillStyle = g;
    hx.fillRect(i * rib, 0, rib, H);
  }
  x.fillStyle = base;
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {
    const g = x.createLinearGradient(i * rib, 0, (i + 1) * rib, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    x.fillStyle = g;
    x.fillRect(i * rib, 0, rib, H);
  }
  for (let i = 0; i < 45; i++) {
    const px = rng.next() * W, py = rng.next() * H * 0.3;
    const rg = x.createLinearGradient(0, py, 0, py + 60 + rng.next() * 160);
    rg.addColorStop(0, 'rgba(110,50,20,0.55)');
    rg.addColorStop(1, 'rgba(110,50,20,0)');
    x.fillStyle = rg;
    x.fillRect(px, py, 2 + rng.next() * 6, 220);
  }
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(${rng.next() < 0.5 ? '120,60,25' : '20,20,20'},${0.08 + rng.next() * 0.2})`;
    x.fillRect(rng.next() * W, rng.next() * H, 2 + rng.next() * 14, 1 + rng.next() * 6);
  }
  const bottom = x.createLinearGradient(0, H, 0, H * 0.75);
  bottom.addColorStop(0, 'rgba(70,35,15,0.6)');
  bottom.addColorStop(1, 'rgba(70,35,15,0)');
  x.fillStyle = bottom;
  x.fillRect(0, 0, W, H);
  return { map: tex(c), normal: normalFromHeight(hc, 3) };
}
