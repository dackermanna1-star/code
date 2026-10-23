// Building damage visuals: the shell left when roofs and upper floors fall in,
// breach holes and bullet chips on walls where they were hit, and the
// masonry, slabs and beams scattered around ruins and collapsed buildings.

import * as THREE from 'three';
import { buildPropModel } from './models/index.js';

const rand = Math.random;
const rr = (a, b) => a + (b - a) * rand();

// Ruined shell in unit building space (x, z in -0.5..0.5, y 0..1): four thin
// walls broken off at uneven, stepped heights (roughly floor by floor) with a
// few gaps blown down to the ground, open to the sky. Facades keep their
// windows (the facade shader works on any faces of this unit box).
export function ruinGeometry(seed) {
  let h = Math.floor(seed * 2147483646) + 1;
  const r = () => {
    h = (h * 16807) % 2147483647;
    return h / 2147483647;
  };
  const pos = [];
  const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const quad = (a, b, c, d) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  const T = 0.03;
  const N = 14;
  // Each wall: start corner, direction, outward normal.
  const walls = [
    [[-0.5, 0.5], [1, 0], [0, 1]],
    [[0.5, -0.5], [-1, 0], [0, -1]],
    [[0.5, 0.5], [0, -1], [1, 0]],
    [[-0.5, -0.5], [0, 1], [-1, 0]],
  ];
  for (const [[sx, sz], [dx, dz], [nx, nz]] of walls) {
    // Segment heights: runs of the same level, corners standing tallest.
    const hs = [];
    for (let i = 0; i < N; i++) {
      let y;
      if (i > 0 && r() < 0.45) y = hs[i - 1];
      else y = Math.round((0.2 + r() * 0.8) / 0.17) * 0.17 + (r() - 0.5) * 0.05;
      if (r() < 0.12) y = 0.04 + r() * 0.1;
      if (i === 0 || i === N - 1) y = Math.max(y, 0.6 + r() * 0.35);
      hs.push(Math.min(1, Math.max(0.03, y)));
    }
    const P = (u, y, inner) => [sx + dx * u - (inner ? nx * T : 0), y, sz + dz * u - (inner ? nz * T : 0)];
    for (let i = 0; i < N; i++) {
      const u0 = i / N;
      const u1 = (i + 1) / N;
      const y = hs[i];
      quad(P(u0, 0, false), P(u1, 0, false), P(u1, y, false), P(u0, y, false));
      quad(P(u1, 0, true), P(u0, 0, true), P(u0, y, true), P(u1, y, true));
      quad(P(u0, y, false), P(u1, y, false), P(u1, y, true), P(u0, y, true));
      // Broken edge where the next segment stands at another height.
      if (i < N - 1 && Math.abs(hs[i + 1] - y) > 1e-3) {
        const lo = Math.min(y, hs[i + 1]);
        const hi = Math.max(y, hs[i + 1]);
        if (y > hs[i + 1]) quad(P(u1, lo, false), P(u1, lo, true), P(u1, hi, true), P(u1, hi, false));
        else quad(P(u1, lo, false), P(u1, hi, false), P(u1, hi, true), P(u1, lo, true));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Canvas textures for wall marks.
function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  // Blast-scoured rim.
  const g = ctx.createRadialGradient(64, 64, 18, 64, 64, 62);
  g.addColorStop(0, 'rgba(30,27,24,0.9)');
  g.addColorStop(0.55, 'rgba(70,64,56,0.55)');
  g.addColorStop(1, 'rgba(70,64,56,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Ragged hole.
  ctx.fillStyle = 'rgba(8,7,6,1)';
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rad = 26 + rr(-9, 9);
    const x = 64 + Math.cos(a) * rad;
    const y = 64 + Math.sin(a) * rad * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.fill();
  // Cracks.
  ctx.strokeStyle = 'rgba(20,18,16,0.8)';
  for (let i = 0; i < 9; i++) {
    let x = 64;
    let y = 64;
    let a = rand() * Math.PI * 2;
    ctx.lineWidth = rr(1, 2.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      a += rr(-0.5, 0.5);
      x += Math.cos(a) * rr(7, 12);
      y += Math.sin(a) * rr(7, 12);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function chipTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(25,23,21,0.95)');
  g.addColorStop(0.3, 'rgba(120,114,104,0.8)');
  g.addColorStop(0.7, 'rgba(160,154,144,0.35)');
  g.addColorStop(1, 'rgba(160,154,144,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Breaches and bullet chips on walls, remembered per structure so they go
// when the wall does.
export class WallMarks {
  constructor(scene) {
    const make = (tex, max) => {
      const g = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      const mesh = new THREE.InstancedMesh(g, mat, max);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 1;
      scene.add(mesh);
      return { mesh, max, next: 0, owner: new Array(max).fill(null) };
    };
    this.holes = make(holeTexture(), 700);
    this.chips = make(chipTexture(), 1800);
    this.byStruct = new Map();
    this.obj = new THREE.Object3D();
    this.n = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  add(s, x, y, z, nx, ny, nz, size, big) {
    const set = big ? this.holes : this.chips;
    const i = set.next;
    set.next = (set.next + 1) % set.max;
    const prev = set.owner[i];
    if (prev) {
      const l = this.byStruct.get(prev);
      if (l) {
        const k = l.findIndex((e) => e.set === set && e.i === i);
        if (k >= 0) l.splice(k, 1);
      }
    }
    set.owner[i] = s;
    const o = this.obj;
    this.n.set(nx, ny, nz).normalize();
    o.position.set(x + this.n.x * 0.04, y + this.n.y * 0.04, z + this.n.z * 0.04);
    o.lookAt(o.position.x + this.n.x, o.position.y + this.n.y, o.position.z + this.n.z);
    o.rotateZ(rand() * Math.PI * 2);
    o.scale.set(size, size * rr(0.8, 1.15), 1);
    o.updateMatrix();
    set.mesh.setMatrixAt(i, o.matrix);
    set.mesh.count = Math.max(set.mesh.count, i + 1);
    set.mesh.instanceMatrix.needsUpdate = true;
    let l = this.byStruct.get(s);
    if (!l) this.byStruct.set(s, (l = []));
    l.push({ set, i });
  }

  // Remove every mark on a structure (it fell in or collapsed).
  clear(s) {
    const l = this.byStruct.get(s);
    if (!l) return;
    for (const { set, i } of l) {
      set.mesh.setMatrixAt(i, this.zero);
      set.owner[i] = null;
      set.mesh.instanceMatrix.needsUpdate = true;
    }
    this.byStruct.delete(s);
  }
}

// Masonry chunks, slabs and beams left around ruins; they stay for the rest
// of the battle.
export class RubbleField {
  constructor(scene, terrain, shadows) {
    this.terrain = terrain;
    let chunk;
    try {
      chunk = buildPropModel('debris_concrete', 0).lod0;
    } catch (e) {
      chunk = new THREE.BoxGeometry(0.8, 0.5, 0.6);
    }
    const make = (geo, mat, max) => {
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.count = 0;
      scene.add(mesh);
      return { mesh, max, next: 0 };
    };
    const vc = !!chunk.getAttribute('color');
    this.chunks = make(chunk, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 1, flatShading: true }), 4000);
    const slab = new THREE.BoxGeometry(1, 0.22, 1);
    this.slabs = make(slab, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), 1200);
    const beam = new THREE.BoxGeometry(0.14, 0.14, 1);
    this.beams = make(beam, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.3 }), 1200);
    this.obj = new THREE.Object3D();
    this.col = new THREE.Color();
  }

  put(set, x, z, sx, sy, sz, color, tilt, sink) {
    const i = set.next;
    set.next = (set.next + 1) % set.max;
    const o = this.obj;
    o.position.set(x, this.terrain.heightAt(x, z) - sink, z);
    o.rotation.set(rr(-tilt, tilt), rand() * Math.PI * 2, rr(-tilt, tilt));
    o.scale.set(sx, sy, sz);
    o.updateMatrix();
    set.mesh.setMatrixAt(i, o.matrix);
    set.mesh.setColorAt(i, color);
    set.mesh.count = Math.max(set.mesh.count, i + 1);
    set.mesh.instanceMatrix.needsUpdate = true;
    set.mesh.instanceColor.needsUpdate = true;
  }

  // Scatter debris over and around a building's footprint. amount: 0..1.
  scatter(s, amount) {
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const at = (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    const base = this.col.set(s.color);
    const n = Math.round(Math.min(60, 8 + s.hx * s.hz * 0.25) * amount);
    for (let i = 0; i < n; i++) {
      const [x, z] = at(rr(-1.35, 1.35) * s.hx, rr(-1.35, 1.35) * s.hz);
      const k = rr(0.55, 0.95);
      const col = new THREE.Color(base.r * k, base.g * k, base.b * k);
      const sc = rr(0.8, 2.6);
      this.put(this.chunks, x, z, sc, sc * rr(0.6, 1.2), sc, col, 0.6, 0.15 * sc);
    }
    for (let i = 0; i < n * 0.25; i++) {
      const [x, z] = at(rr(-1.1, 1.1) * s.hx, rr(-1.1, 1.1) * s.hz);
      const col = new THREE.Color(0.5, 0.49, 0.46).multiplyScalar(rr(0.7, 1));
      this.put(this.slabs, x, z, rr(1.2, 3.5), 1, rr(1, 2.6), col, 0.45, 0.05);
    }
    for (let i = 0; i < n * 0.2; i++) {
      const [x, z] = at(rr(-1, 1) * s.hx, rr(-1, 1) * s.hz);
      const wood = s.material === 'wood';
      const col = wood ? new THREE.Color(0.3, 0.22, 0.14) : new THREE.Color(0.22, 0.2, 0.19);
      this.put(this.beams, x, z, 1, 1, rr(1.5, 4.5), col, 0.9, 0);
    }
  }
}
