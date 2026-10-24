import * as THREE from 'three';
import { Rng } from '../core/math';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number, rng: Rng) => void;

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h},${s}%,${l}%)`;
}

function make(w: number, h: number, seed: number, draw: Draw): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g, w, h, new Rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function px(g: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function grime(g: CanvasRenderingContext2D, w: number, h: number, rng: Rng, n: number, alpha = 0.18): void {
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, w - 1),
      y = rng.int(0, h - 1);
    const r = rng.int(1, 4);
    g.fillStyle = `rgba(20,10,5,${alpha * rng.next()})`;
    g.fillRect(x, y, r, r);
  }
}

const cache = new Map<string, THREE.CanvasTexture>();

export function levelTexture(name: string): THREE.CanvasTexture {
  let t = cache.get(name);
  if (t) return t;
  t = build(name);
  cache.set(name, t);
  return t;
}

function build(name: string): THREE.CanvasTexture {
  switch (name) {
    case 'woodFloor':
      return make(128, 128, 11, (g, w, h, rng) => {
        const plankW = 16;
        for (let x = 0; x < w; x += plankW) {
          let y = -rng.int(0, 60);
          while (y < h) {
            const len = rng.int(48, 96);
            const l = rng.range(24, 34);
            const base = hsl(rng.range(20, 30), rng.range(35, 48), l);
            px(g, x, y, base, plankW, len);
            for (let k = 0; k < 40; k++) px(g, x + rng.int(1, plankW - 2), y + rng.int(0, len), hsl(24, 40, l - rng.range(3, 7)), 1, rng.int(2, 6));
            px(g, x, y, hsl(20, 35, l - 10), plankW, 1);
            px(g, x + 2, y + 3, '#1a0f08');
            px(g, x + plankW - 3, y + 3, '#1a0f08');
            y += len;
          }
          px(g, x, 0, '#1c120a', 1, h);
        }
        grime(g, w, h, rng, 220);
      });
    case 'woodFloorLight':
      return make(128, 128, 12, (g, w, h, rng) => {
        for (let x = 0; x < w; x += 16) {
          let y = -rng.int(0, 60);
          while (y < h) {
            const len = rng.int(48, 96);
            const l = rng.range(40, 50);
            px(g, x, y, hsl(rng.range(26, 34), 38, l), 16, len);
            for (let k = 0; k < 30; k++) px(g, x + rng.int(1, 14), y + rng.int(0, len), hsl(28, 36, l - 6), 1, rng.int(2, 5));
            px(g, x, y, hsl(25, 30, l - 14), 16, 1);
            y += len;
          }
          px(g, x, 0, '#3a2414', 1, h);
        }
        grime(g, w, h, rng, 120);
      });
    case 'tileChecker':
      return make(64, 64, 13, (g, w, h, rng) => {
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            const white = (x + y) % 2 === 0;
            px(g, x * 16, y * 16, white ? '#d8d2c4' : '#1e1c1c', 16, 16);
            for (let k = 0; k < 14; k++) px(g, x * 16 + rng.int(1, 14), y * 16 + rng.int(1, 14), white ? '#c8c2b4' : '#2a2828');
          }
        for (let i = 0; i <= 4; i++) {
          px(g, i * 16, 0, '#6a645a', 1, h);
          px(g, 0, i * 16, '#6a645a', w, 1);
        }
        grime(g, w, h, rng, 60, 0.25);
      });
    case 'concrete':
      return make(64, 64, 14, (g, w, h, rng) => {
        px(g, 0, 0, '#6a6a66', w, h);
        for (let k = 0; k < 900; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#626260', '#72726e', '#5a5a58', '#7a7a76']));
        for (let c = 0; c < 3; c++) {
          let x = rng.int(0, w),
            y = rng.int(0, h);
          for (let s = 0; s < 30; s++) {
            x += rng.int(-1, 1);
            y += 1;
            px(g, ((x % w) + w) % w, y % h, '#44443f');
          }
        }
        grime(g, w, h, rng, 80, 0.3);
      });
    case 'carpetRed':
      return make(64, 64, 15, (g, w, h, rng) => {
        px(g, 0, 0, '#5e0f14', w, h);
        for (let k = 0; k < 1200; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#56090e', '#6a1419', '#4e080c']));
        // gold diamond pattern
        for (let cy = 0; cy < 2; cy++)
          for (let cx = 0; cx < 2; cx++) {
            const ox = cx * 32 + 16,
              oy = cy * 32 + 16;
            for (let i = -8; i <= 8; i++) {
              const d = 8 - Math.abs(i);
              px(g, ox + i, oy - d, '#b8902a');
              px(g, ox + i, oy + d, '#b8902a');
            }
            px(g, ox - 1, oy - 1, '#d8b040', 3, 3);
          }
      });
    case 'plaster':
      return make(64, 64, 16, (g, w, h, rng) => {
        px(g, 0, 0, '#d9c8a2', w, h);
        for (let k = 0; k < 700; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#d2c09a', '#dfcfaa', '#cdbb94']));
        grime(g, w, h, rng, 40, 0.12);
      });
    case 'plasterDirty':
      return make(64, 64, 17, (g, w, h, rng) => {
        px(g, 0, 0, '#c8b48c', w, h);
        for (let k = 0; k < 900; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#bea882', '#d2be96', '#b8a27a']));
        for (let s = 0; s < 4; s++) {
          const x = rng.int(0, w - 4);
          for (let y = rng.int(0, 20); y < h; y++) if (rng.next() < 0.7) px(g, x + rng.int(0, 2), y, 'rgba(90,60,30,0.25)');
        }
        grime(g, w, h, rng, 90, 0.18);
      });
    case 'wainscot':
      return make(64, 64, 18, (g, w, h, rng) => {
        px(g, 0, 0, '#2c4a34', w, h);
        for (let p = 0; p < 2; p++) {
          const x0 = p * 32;
          px(g, x0 + 3, 6, '#24402c', 26, 52);
          px(g, x0 + 4, 7, '#335a3e', 24, 50);
          px(g, x0 + 3, 6, '#1a3020', 26, 1);
          px(g, x0 + 3, 57, '#40684a', 26, 1);
        }
        px(g, 0, 0, '#1a3020', w, 3);
        for (let k = 0; k < 160; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), 'rgba(0,0,0,0.12)');
        grime(g, w, h, rng, 50, 0.2);
      });
    case 'brick':
      return make(128, 64, 19, (g, w, h, rng) => {
        px(g, 0, 0, '#6a5a50', w, h);
        const bw = 32,
          bh = 8;
        for (let row = 0; row < h / bh; row++) {
          const off = row % 2 ? bw / 2 : 0;
          for (let x = -bw; x < w + bw; x += bw) {
            const l = rng.range(28, 40);
            const c = hsl(rng.range(6, 16), rng.range(40, 55), l);
            px(g, x + off + 1, row * bh + 1, c, bw - 2, bh - 2);
            for (let k = 0; k < 10; k++) px(g, x + off + rng.int(2, bw - 3), row * bh + rng.int(1, bh - 2), hsl(10, 45, l - 6));
          }
        }
        grime(g, w, h, rng, 120, 0.2);
      });
    case 'woodPanel':
      return make(64, 64, 20, (g, w, h, rng) => {
        for (let x = 0; x < w; x += 8) {
          const l = rng.range(18, 26);
          px(g, x, 0, hsl(20, 45, l), 8, h);
          for (let k = 0; k < 18; k++) px(g, x + rng.int(1, 6), rng.int(0, h - 1), hsl(20, 40, l - 5), 1, rng.int(2, 7));
          px(g, x, 0, '#140a05', 1, h);
        }
        grime(g, w, h, rng, 30, 0.15);
      });
    case 'wallTile':
      return make(64, 64, 21, (g, w, h, rng) => {
        px(g, 0, 0, '#9a968c', w, h);
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            px(g, x * 8 + 1, y * 8 + 1, rng.pick(['#e8e6de', '#e2e0d8', '#ece9e2']), 7, 7);
            px(g, x * 8 + 2, y * 8 + 2, '#f6f4ee', 2, 1);
          }
        grime(g, w, h, rng, 50, 0.22);
      });
    case 'ceilingWood':
      return make(64, 64, 22, (g, w, h, rng) => {
        for (let y = 0; y < h; y += 8) {
          const l = rng.range(14, 20);
          px(g, 0, y, hsl(22, 40, l), w, 8);
          for (let k = 0; k < 20; k++) px(g, rng.int(0, w - 1), y + rng.int(1, 6), hsl(22, 35, l - 4), rng.int(2, 6), 1);
          px(g, 0, y, '#0c0604', w, 1);
        }
      });
    case 'metal':
      return make(64, 64, 23, (g, w, h, rng) => {
        for (let y = 0; y < h; y++) px(g, 0, y, rng.pick(['#9aa0a4', '#a4aaae', '#90969a']), w, 1);
        for (let k = 0; k < 60; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), '#7a8084', rng.int(2, 8), 1);
        grime(g, w, h, rng, 30, 0.2);
      });
    case 'barWood':
      return make(64, 64, 24, (g, w, h, rng) => {
        px(g, 0, 0, '#3a1e10', w, h);
        for (let y = 0; y < h; y++) {
          const wv = Math.sin(y * 0.4) * 2;
          for (let x = 0; x < w; x++) {
            const v = Math.sin((x + wv) * 0.5 + y * 0.03);
            if (v > 0.85) px(g, x, y, '#2a140a');
            else if (v < -0.92) px(g, x, y, '#4a2a16');
          }
        }
        grime(g, w, h, rng, 20, 0.15);
      });
    case 'darkWood':
      return make(32, 32, 25, (g, w, h, rng) => {
        px(g, 0, 0, '#3a2414', w, h);
        for (let k = 0; k < 80; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#32200f', '#452c18']), 1, rng.int(1, 4));
      });
    case 'stage':
      return make(64, 64, 26, (g, w, h, rng) => {
        for (let x = 0; x < w; x += 16) {
          px(g, x, 0, rng.pick(['#1e1a18', '#221d1a', '#1a1614']), 16, h);
          px(g, x, 0, '#0a0808', 1, h);
        }
        for (let k = 0; k < 120; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), 'rgba(255,255,255,0.05)', rng.int(1, 4), 1);
      });
    case 'asphalt':
      return make(64, 64, 27, (g, w, h, rng) => {
        px(g, 0, 0, '#262628', w, h);
        for (let k = 0; k < 1500; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#2e2e30', '#1e1e20', '#343436']));
      });
    case 'sidewalk':
      return make(64, 64, 28, (g, w, h, rng) => {
        px(g, 0, 0, '#5a5a56', w, h);
        for (let k = 0; k < 800; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#545450', '#62625e']));
        px(g, 0, 0, '#3a3a38', w, 1);
        px(g, 0, 0, '#3a3a38', 1, h);
        grime(g, w, h, rng, 60, 0.3);
      });
    case 'exteriorWood':
      return make(64, 64, 29, (g, w, h, rng) => {
        for (let y = 0; y < h; y += 8) {
          const l = rng.range(16, 22);
          px(g, 0, y, hsl(18, 30, l), w, 8);
          px(g, 0, y + 7, '#0a0604', w, 1);
          for (let k = 0; k < 14; k++) px(g, rng.int(0, w - 1), y + rng.int(1, 6), hsl(18, 28, l - 4), rng.int(2, 6), 1);
        }
      });
    case 'vinylRed':
      return make(32, 32, 30, (g, w, h, rng) => {
        px(g, 0, 0, '#7a1416', w, h);
        for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
          px(g, x, y, '#4a0a0c', 2, 2);
          px(g, x - 3, y - 3, '#9a2426', 3, 1);
        }
        for (let k = 0; k < 40; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), '#6a1012');
      });
    case 'felt':
      return make(32, 32, 31, (g, w, h, rng) => {
        px(g, 0, 0, '#1f6e3a', w, h);
        for (let k = 0; k < 500; k++) px(g, rng.int(0, w - 1), rng.int(0, h - 1), rng.pick(['#1b6634', '#237640', '#1a5e30']));
      });
    case 'white':
      return make(4, 4, 32, (g) => px(g, 0, 0, '#ffffff', 4, 4));
  }
  throw new Error('unknown level texture ' + name);
}
