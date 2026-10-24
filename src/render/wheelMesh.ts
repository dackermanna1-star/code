// Procedural wheels: tire (lathe profile with tread texture), rim by style,
// brake disc and caliper. The wheel's axle is local +X; the rim's show face
// points to +X.

import * as THREE from 'three';
import { tireTreadTexture, brakeDiscTexture } from './textures.ts';

export type RimStyle = 'spoke5' | 'spoke6' | 'mesh' | 'steel' | 'offroad' | 'turbine';

export interface WheelParts {
  /** spins */
  spin: THREE.Group;
  /** steers but does not spin (caliper) */
  knuckle: THREE.Group;
  root: THREE.Group;
  tire: THREE.Mesh;
  rim: THREE.Mesh;
}

const matCache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function tireGeometry(R: number, W: number, rimR: number): THREE.BufferGeometry {
  const key = `tire:${R.toFixed(3)}:${W.toFixed(3)}:${rimR.toFixed(3)}`;
  let g = geoCache.get(key);
  if (g) return g;
  const hw = W / 2;
  const side = R - rimR;
  // profile in (radius, axial) -> lathe uses (x=radius, y=axial)
  const pts: THREE.Vector2[] = [];
  const add = (r: number, a: number) => pts.push(new THREE.Vector2(r, a));
  add(rimR + 0.004, -hw * 0.82);
  add(rimR + side * 0.25, -hw * 0.98);
  add(rimR + side * 0.6, -hw * 1.02);
  add(R - side * 0.18, -hw * 0.97);
  add(R - 0.012, -hw * 0.86);
  add(R, -hw * 0.7);
  // tread with grooves
  const grooves = 3;
  for (let k = 0; k <= grooves * 2; k++) {
    const a = -hw * 0.66 + (hw * 1.32 * k) / (grooves * 2);
    add(k % 2 ? R - 0.006 : R, a);
  }
  add(R, hw * 0.7);
  add(R - 0.012, hw * 0.86);
  add(R - side * 0.18, hw * 0.97);
  add(rimR + side * 0.6, hw * 1.02);
  add(rimR + side * 0.25, hw * 0.98);
  add(rimR + 0.004, hw * 0.82);
  g = new THREE.LatheGeometry(pts, 48);
  // lathe revolves around Y: rotate so the axle is X
  g.rotateZ(-Math.PI / 2);
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

function rimGeometry(style: RimStyle, rimR: number, W: number): THREE.BufferGeometry {
  const key = `rim:${style}:${rimR.toFixed(3)}:${W.toFixed(3)}`;
  let g = geoCache.get(key);
  if (g) return g;
  const parts: THREE.BufferGeometry[] = [];
  const faceR = rimR - 0.012;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, faceR, 0, Math.PI * 2, false);
  const holes: THREE.Path[] = [];
  const spokeWindow = (n: number, rIn: number, rOut: number, spokeW: number, twist = 0) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + spokeW / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - spokeW / 2;
      const p = new THREE.Path();
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const a = a0 + ((a1 - a0) * k) / steps + twist;
        const x = Math.cos(a) * rOut, y = Math.sin(a) * rOut;
        if (k === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      for (let k = steps; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / steps;
        p.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      }
      p.closePath();
      holes.push(p);
    }
  };
  switch (style) {
    case 'spoke5':
      spokeWindow(5, faceR * 0.36, faceR * 0.86, 0.42);
      break;
    case 'spoke6':
      spokeWindow(6, faceR * 0.34, faceR * 0.88, 0.34);
      break;
    case 'mesh':
      spokeWindow(10, faceR * 0.4, faceR * 0.86, 0.16);
      break;
    case 'turbine':
      spokeWindow(8, faceR * 0.42, faceR * 0.84, 0.2, 0.35);
      break;
    case 'offroad':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = new THREE.Path();
        p.absarc(Math.cos(a) * faceR * 0.62, Math.sin(a) * faceR * 0.62, faceR * 0.16, 0, Math.PI * 2, true);
        holes.push(p);
      }
      break;
    case 'steel':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = new THREE.Path();
        p.absarc(Math.cos(a) * faceR * 0.62, Math.sin(a) * faceR * 0.62, faceR * 0.09, 0, Math.PI * 2, true);
        holes.push(p);
      }
      break;
  }
  shape.holes = holes;
  const face = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 36 });
  // extrude goes along +Z; rotate so it faces +X
  face.rotateY(Math.PI / 2);
  face.translate(W * 0.36 - 0.03, 0, 0);
  parts.push(face.toNonIndexed());
  // barrel
  const barrel = new THREE.CylinderGeometry(rimR - 0.004, rimR - 0.004, W * 0.88, 40, 1, true);
  barrel.rotateZ(Math.PI / 2);
  parts.push(barrel.toNonIndexed());
  // lip
  const lip = new THREE.TorusGeometry(rimR, 0.008, 6, 40);
  lip.rotateY(Math.PI / 2);
  lip.translate(W * 0.43, 0, 0);
  parts.push(lip.toNonIndexed());
  // hub & center cap
  const hub = new THREE.CylinderGeometry(faceR * 0.36, faceR * 0.4, 0.05, 24);
  hub.rotateZ(-Math.PI / 2);
  hub.translate(W * 0.36, 0, 0);
  parts.push(hub.toNonIndexed());
  const cap = new THREE.SphereGeometry(faceR * 0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.rotateZ(-Math.PI / 2);
  cap.translate(W * 0.38 + 0.02, 0, 0);
  parts.push(cap.toNonIndexed());
  // lug nuts
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const nut = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6);
    nut.rotateZ(-Math.PI / 2);
    nut.translate(W * 0.38 + 0.01, Math.cos(a) * faceR * 0.26, Math.sin(a) * faceR * 0.26);
    parts.push(nut.toNonIndexed());
  }
  g = mergeGeos(parts);
  geoCache.set(key, g);
  return g;
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of geos) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of geos) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      nrm[(o + i) * 3] = n.getX(i);
      nrm[(o + i) * 3 + 1] = n.getY(i);
      nrm[(o + i) * 3 + 2] = n.getZ(i);
      if (u) {
        uv[(o + i) * 2] = u.getX(i);
        uv[(o + i) * 2 + 1] = u.getY(i);
      }
    }
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export function rimMaterial(style: RimStyle): THREE.Material {
  return mat('rim:' + style, () => {
    const color = style === 'steel' ? 0x2a2a2c : style === 'offroad' ? 0x3a3a3a : style === 'turbine' ? 0xb8b8b8 : style === 'mesh' ? 0xc9b37a : 0xd0d2d4;
    return new THREE.MeshStandardMaterial({ color, metalness: style === 'steel' ? 0.4 : 0.95, roughness: style === 'steel' ? 0.5 : 0.22 });
  });
}

export function tireMaterial(): THREE.Material {
  return mat('tire', () => {
    const t = tireTreadTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(1, 6);
    return new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.92, metalness: 0, map: t });
  });
}

export function buildWheel(radius: number, width: number, profile: number, style: RimStyle, caliperColor = 0xb01818): WheelParts {
  const rimR = radius * (1 - profile * 0.52);
  const root = new THREE.Group();
  const knuckle = new THREE.Group();
  const spin = new THREE.Group();
  root.add(knuckle);
  knuckle.add(spin);
  const tire = new THREE.Mesh(tireGeometry(radius, width, rimR), tireMaterial());
  tire.castShadow = true;
  spin.add(tire);
  const rim = new THREE.Mesh(rimGeometry(style, rimR, width), rimMaterial(style));
  rim.castShadow = true;
  spin.add(rim);
  // brake disc
  const discR = rimR * 0.78;
  const dg = geoCache.get('disc:' + discR.toFixed(3)) ?? (() => {
    const g = new THREE.CylinderGeometry(discR, discR, 0.026, 32);
    g.rotateZ(Math.PI / 2);
    geoCache.set('disc:' + discR.toFixed(3), g);
    return g;
  })();
  const disc = new THREE.Mesh(dg, mat('disc', () => new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.9, roughness: 0.45, map: brakeDiscTexture() })));
  disc.position.x = width * 0.12;
  spin.add(disc);
  // caliper (no spin)
  const cg = geoCache.get('caliper') ?? (() => {
    const g = new THREE.BoxGeometry(0.06, 0.12, 0.16);
    geoCache.set('caliper', g);
    return g;
  })();
  const caliper = new THREE.Mesh(cg, mat('caliper:' + caliperColor, () => new THREE.MeshStandardMaterial({ color: caliperColor, metalness: 0.3, roughness: 0.4 })));
  caliper.position.set(width * 0.12, discR * 0.62, -discR * 0.45);
  knuckle.add(caliper);
  return { root, knuckle, spin, tire, rim };
}
