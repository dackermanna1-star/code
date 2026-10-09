// A plain stand-in for the city while the real renderers are being built:
// the ground coloured by kind, a flat sea, roads as grey ribbons and every
// block as a box. Used only when V.cfg.debugWorld is on.
import * as THREE from 'three';
import { GROUND } from './layout.js';

export function debugWorld(world, plan, ground, phys = null) {
  const group = new THREE.Group();
  group.name = 'debugWorld';
  // ground: 16-stud grid
  const S = 16, n = Math.floor(ground.SIZE / S) + 1, H = ground.HALF;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const C = [[0.42, 0.58, 0.32], [0.86, 0.79, 0.62], [0.7, 0.62, 0.48], [0.55, 0.5, 0.4], [0.33, 0.3, 0.2], [0.36, 0.62, 0.3], [0, 0, 0], [0.5, 0.5, 0.48]];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -H + i * S, z = -H + j * S, k = j * n + i;
    pos[k * 3] = x; pos[k * 3 + 1] = ground.heightAt(x, z); pos[k * 3 + 2] = z;
    const c = C[ground.kindAt(x, z)] || C[0];
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx[o++] = a; idx[o++] = a + n; idx[o++] = a + 1; idx[o++] = a + 1; idx[o++] = a + n; idx[o++] = a + n + 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const gm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  gm.receiveShadow = true;
  group.add(gm);
  // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1f8fb0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82 }));
  sea.position.y = 0; sea.renderOrder = 2;
  group.add(sea);
  // roads
  const rp = [], ri = [];
  for (const e of plan.edges) {
    const hw = e.width / 2;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * hw, nz = dx / L * hw, v = rp.length / 3;
      rp.push(a.x + nx, a.y + 0.06, a.z + nz, a.x - nx, a.y + 0.06, a.z - nz, b.x + nx, b.y + 0.06, b.z + nz, b.x - nx, b.y + 0.06, b.z - nz);
      ri.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      if (e.walk) {
        for (const s of [1, -1]) {
          const w0 = hw, w1 = hw + e.walk, v2 = rp.length / 3;
          const ux = -dz / L * s, uz = dx / L * s;
          rp.push(a.x + ux * w0, a.y + 0.4, a.z + uz * w0, a.x + ux * w1, a.y + 0.4, a.z + uz * w1, b.x + ux * w0, b.y + 0.4, b.z + uz * w0, b.x + ux * w1, b.y + 0.4, b.z + uz * w1);
          if (s > 0) ri.push(v2, v2 + 2, v2 + 1, v2 + 1, v2 + 2, v2 + 3); else ri.push(v2, v2 + 1, v2 + 2, v2 + 1, v2 + 3, v2 + 2);
        }
      }
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setIndex(ri);
  rg.computeVertexNormals();
  const roads = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  roads.receiveShadow = true;
  group.add(roads);
  // blocks as boxes
  const D = Object.fromEntries(plan.districts.map((d) => [d.id, d]));
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.7 }), plan.blocks.length * 4);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  let k = 0;
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const b of plan.blocks) {
    const d = D[b.district];
    const w = b.x1 - b.x0, dd = b.z1 - b.z0;
    const parts = w > 120 && dd > 120 ? 4 : 1;
    for (let q = 0; q < parts; q++) {
      const qx = parts === 4 ? (q & 1) : 0, qz = parts === 4 ? (q >> 1) : 0;
      const sx = parts === 4 ? w / 2 : w, sz = parts === 4 ? dd / 2 : dd;
      const cx = b.x0 + sx * (qx + 0.5), cz = b.z0 + sz * (qz + 0.5);
      if (!plan.isLand(cx, cz)) continue;
      const h = d.h[0] + (d.h[1] - d.h[0]) * Math.pow(r(), 2.2);
      m.makeScale(sx * 0.82, h, sz * 0.82).setPosition(cx, GROUND, cz);
      phys?.add(cx, GROUND + h / 2, cz, sx * 0.41, h / 2, sz * 0.41, 0, 'concrete', { building: true, debug: true });
      inst.setMatrixAt(k, m);
      c.set(d.color).lerp(new THREE.Color(0xf2efe8), 0.55);
      inst.setColorAt(k, c);
      k++;
    }
  }
  inst.count = k;
  inst.castShadow = true; inst.receiveShadow = true;
  group.add(inst);
  world.scene.add(group);
  return group;
}
