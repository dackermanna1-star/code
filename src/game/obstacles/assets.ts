// Shared materials and mesh helpers for obstacles and scenery.

import * as THREE from 'three';
import { concreteTexture, hazardStripeTexture, metalPlateTexture, rustTexture, checkerTexture, corrugatedTexture } from '../../render/textures.ts';

const mats = new Map<string, THREE.Material>();

function m<T extends THREE.Material>(key: string, make: () => T): T {
  let x = mats.get(key) as T | undefined;
  if (!x) {
    x = make();
    mats.set(key, x);
  }
  return x;
}

export const MAT = {
  concrete: () => m('concrete', () => new THREE.MeshStandardMaterial({ map: concreteTexture(), color: 0xd9d6cf, roughness: 0.85 })),
  concreteDark: () => m('concreteDark', () => new THREE.MeshStandardMaterial({ map: concreteTexture(), color: 0x9a9893, roughness: 0.9 })),
  hazard: () => m('hazard', () => new THREE.MeshStandardMaterial({ map: hazardStripeTexture(), roughness: 0.55, metalness: 0.2 })),
  yellowSteel: () => m('yellowSteel', () => new THREE.MeshStandardMaterial({ color: 0xe0a414, roughness: 0.45, metalness: 0.55 })),
  redSteel: () => m('redSteel', () => new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.45, metalness: 0.5 })),
  darkSteel: () => m('darkSteel', () => new THREE.MeshStandardMaterial({ color: 0x3a3d41, roughness: 0.4, metalness: 0.85 })),
  steel: () => m('steel', () => new THREE.MeshStandardMaterial({ color: 0xa8adb2, roughness: 0.3, metalness: 0.95 })),
  spike: () => m('spike', () => new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.18, metalness: 1.0 })),
  rust: () => m('rust', () => new THREE.MeshStandardMaterial({ map: rustTexture(), roughness: 0.75, metalness: 0.5 })),
  plate: () => m('plate', () => new THREE.MeshStandardMaterial({ map: metalPlateTexture(), roughness: 0.4, metalness: 0.8 })),
  rubber: () => m('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 })),
  wood: () => m('wood', () => new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.8 })),
  checker: () => m('checker', () => new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6 })),
  white: () => m('white', () => new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 })),
  red: () => m('red', () => new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.6 })),
  blue: () => m('blue', () => new THREE.MeshStandardMaterial({ color: 0x1e5aa8, roughness: 0.55, metalness: 0.3 })),
  orange: () => m('orange', () => new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.6 })),
  glow: (c: number) => m('glow' + c, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.5, roughness: 0.4 })),
  corrugated: (c = '#8c96a0') => m('corr' + c, () => new THREE.MeshStandardMaterial({ map: corrugatedTexture(c), roughness: 0.6, metalness: 0.5 })),
};

/** Box with UVs scaled to its size (meters per texture repeat). */
export function texBox(w: number, h: number, d: number, scale = 2): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u: number, v: number;
    if (nx > 0.5) {
      u = z / scale;
      v = y / scale;
    } else if (ny > 0.5) {
      u = x / scale;
      v = z / scale;
    } else {
      u = x / scale;
      v = y / scale;
    }
    uv.setXY(i, u, v);
  }
  return g;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadows = true): THREE.Mesh {
  const me = new THREE.Mesh(geo, mat);
  me.position.set(x, y, z);
  me.castShadow = shadows;
  me.receiveShadow = true;
  return me;
}

/** Wedge (ramp) geometry: width along X, rising along +Z from y=0 to y=h over length l. */
export function wedgeGeometry(w: number, l: number, h: number): THREE.BufferGeometry {
  const hw = w / 2;
  const v = [
    [-hw, 0, 0], [hw, 0, 0], [-hw, 0, l], [hw, 0, l], [-hw, h, l], [hw, h, l],
  ];
  const tris: number[][] = [
    [0, 5, 1], [0, 4, 5], // slope
    [2, 3, 5], [2, 5, 4], // back
    [0, 2, 4], // left
    [1, 5, 3], // right
    [0, 1, 3], [0, 3, 2], // bottom
  ];
  const pos: number[] = [], uv: number[] = [];
  for (const t of tris) {
    for (const i of t) {
      pos.push(...v[i]);
      uv.push(v[i][0] / 2, (v[i][2] + v[i][1]) / 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Simple text sign texture. */
export function signTexture(text: string, sub = '', bg = '#1d2733', fg = '#ffffff', accent = '#ffcc33'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = accent;
  x.fillRect(0, 0, 512, 18);
  x.fillRect(0, 238, 512, 18);
  x.fillStyle = fg;
  x.font = 'bold 54px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, sub ? 108 : 128);
  if (sub) {
    x.font = '30px system-ui, sans-serif';
    x.fillStyle = '#c9d3dd';
    x.fillText(sub, 256, 178);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A sign board on two posts. Faces local -Z (toward an approaching driver coming from -Z looking +Z). */
export function signBoard(text: string, sub = '', w = 6, h = 3, postH = 3, accent = '#ffcc33'): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTexture(text, sub, '#1d2733', '#ffffff', accent), roughness: 0.6, emissive: 0x111111 }));
  board.position.set(0, postH + h / 2, 0);
  board.rotation.y = Math.PI;
  g.add(board);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), MAT.darkSteel());
  back.position.set(0, postH + h / 2, 0.05);
  back.castShadow = true;
  g.add(back);
  for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, postH + h, 8), MAT.darkSteel());
    p.position.set(sx, (postH + h) / 2, 0.12);
    p.castShadow = true;
    g.add(p);
  }
  return g;
}
