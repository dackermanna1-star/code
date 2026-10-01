// Bakes the alley's ambient lighting into two 3D textures:
//   A: rgb = bounce irradiance from lamps / lit windows (virtual point lights),
//      a   = sky visibility for up-facing surfaces (cosine weighted)
//   B: sky visibility for surfaces facing +X, -X, +Z, -Z
// Sky occlusion uses a horizon scan over a 2D height map of the building
// masses. It is cheap to compute and gives the deep, dark canyon floor with
// brighter upper walls that defines the look of a narrow alley at dusk.
import * as THREE from 'three';
import { BLOCKS } from './layout.js';

export const IRR = {
  min: new THREE.Vector3(-24, -1, -86),
  max: new THREE.Vector3(24, 25, 38),
  res: new THREE.Vector3(96, 26, 248), // 0.5 m in x/z, 1 m in y
};

const HM_CELL = 0.25;
const HM_X0 = -40, HM_X1 = 40, HM_Z0 = -120, HM_Z1 = 50;

function buildHeightmap(extraBlocks = []) {
  const nx = Math.round((HM_X1 - HM_X0) / HM_CELL);
  const nz = Math.round((HM_Z1 - HM_Z0) / HM_CELL);
  const H = new Float32Array(nx * nz);
  for (const b of [...BLOCKS, ...extraBlocks]) {
    const [x0, z0, x1, z1, h] = b;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - HM_X0) / HM_CELL));
    const i1 = Math.min(nx, Math.ceil((Math.max(x0, x1) - HM_X0) / HM_CELL));
    const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - HM_Z0) / HM_CELL));
    const j1 = Math.min(nz, Math.ceil((Math.max(z0, z1) - HM_Z0) / HM_CELL));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) H[i + j * nx] = Math.max(H[i + j * nx], h);
  }
  return { H, nx, nz };
}

/**
 * @param {object} opts
 *  vpls: [{ pos:Vector3, color:Color (linear, already scaled = power), dir?:Vector3 (hemisphere normal), radius }]
 */
export function bakeIrradiance(opts = {}) {
  const t0 = performance.now();
  const { H, nx: hnx, nz: hnz } = buildHeightmap(opts.extraBlocks);
  const hAt = (x, z) => {
    const i = Math.floor((x - HM_X0) / HM_CELL);
    const j = Math.floor((z - HM_Z0) / HM_CELL);
    if (i < 0 || j < 0 || i >= hnx || j >= hnz) return 0;
    return H[i + j * hnx];
  };

  const { min, max, res } = IRR;
  const NX = res.x, NY = res.y, NZ = res.z;
  const sx = (max.x - min.x) / NX, sy = (max.y - min.y) / NY, sz = (max.z - min.z) / NZ;
  const A = new Float32Array(NX * NY * NZ * 4);
  const Bv = new Float32Array(NX * NY * NZ * 4);

  const K = 16;
  const az = [];
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2;
    az.push([Math.cos(a), Math.sin(a), a]); // dx, dz, angle
  }
  // side weights for the four horizontal normals (+X, -X, +Z, -Z)
  const normals = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const sideW = normals.map(([nxn, nzn]) => az.map(([dx, dz]) => Math.max(0, dx * nxn + dz * nzn)));
  const sideNorm = sideW.map((w) => w.reduce((a, b) => a + b, 0) * (Math.PI / 4));

  const STEP = 0.35, MAXD = 45;
  const cand = new Float32Array(64 * 2); // (H, d) candidates per ray
  const alphaY = new Float32Array(NY * K);

  for (let iz = 0; iz < NZ; iz++) {
    const z = min.z + (iz + 0.5) * sz;
    for (let ix = 0; ix < NX; ix++) {
      const x = min.x + (ix + 0.5) * sx;
      const h0 = hAt(x, z);
      // gather horizon candidates per azimuth: start of every height run
      for (let k = 0; k < K; k++) {
        const [dx, dz] = az[k];
        let nc = 0;
        let lastH = -1;
        for (let d = STEP; d < MAXD && nc < 64; d += STEP) {
          const hh = hAt(x + dx * d, z + dz * d);
          if (hh !== lastH) {
            if (hh > 0) {
              cand[nc * 2] = hh;
              cand[nc * 2 + 1] = d;
              nc++;
            }
            lastH = hh;
          }
        }
        for (let iy = 0; iy < NY; iy++) {
          const y = min.y + (iy + 0.5) * sy;
          let best = 0;
          for (let c = 0; c < nc; c++) {
            const t = (cand[c * 2] - y) / cand[c * 2 + 1];
            if (t > best) best = t;
          }
          alphaY[iy * K + k] = Math.atan(best);
        }
      }
      for (let iy = 0; iy < NY; iy++) {
        const y = min.y + (iy + 0.5) * sy;
        const o = ((iz * NY + iy) * NX + ix) * 4;
        if (h0 > y + 0.05) {
          // inside a building mass
          A[o + 3] = 0;
          Bv[o] = Bv[o + 1] = Bv[o + 2] = Bv[o + 3] = 0;
          continue;
        }
        let up = 0;
        const side = [0, 0, 0, 0];
        for (let k = 0; k < K; k++) {
          const a = alphaY[iy * K + k];
          const c = Math.cos(a);
          up += c * c;
          const sv = Math.PI / 4 - a / 2 - Math.sin(2 * a) / 4;
          for (let n = 0; n < 4; n++) side[n] += sideW[n][k] * sv;
        }
        A[o + 3] = up / K;
        for (let n = 0; n < 4; n++) Bv[o + n] = side[n] / sideNorm[n];
      }
    }
  }

  // bounce lighting from virtual point lights
  const vpls = opts.vpls ?? [];
  for (const L of vpls) {
    const r2 = (L.radius ?? 0.6) ** 2;
    const reach = L.reach ?? 14;
    const ix0 = Math.max(0, Math.floor((L.pos.x - reach - min.x) / sx));
    const ix1 = Math.min(NX - 1, Math.ceil((L.pos.x + reach - min.x) / sx));
    const iy0 = Math.max(0, Math.floor((L.pos.y - reach - min.y) / sy));
    const iy1 = Math.min(NY - 1, Math.ceil((L.pos.y + reach - min.y) / sy));
    const iz0 = Math.max(0, Math.floor((L.pos.z - reach - min.z) / sz));
    const iz1 = Math.min(NZ - 1, Math.ceil((L.pos.z + reach - min.z) / sz));
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = min.z + (iz + 0.5) * sz;
      for (let iy = iy0; iy <= iy1; iy++) {
        const y = min.y + (iy + 0.5) * sy;
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = min.x + (ix + 0.5) * sx;
          if (hAt(x, z) > y + 0.05) continue;
          const dx = x - L.pos.x, dy = y - L.pos.y, dz = z - L.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > reach * reach) continue;
          let cos = 1;
          if (L.dir) {
            const d = Math.sqrt(d2) || 1;
            cos = Math.max(0, (dx * L.dir.x + dy * L.dir.y + dz * L.dir.z) / d);
            cos = 0.15 + 0.85 * cos;
          }
          // smooth window at the reach limit
          const fall = 1 - Math.min(1, d2 / (reach * reach));
          const w = (cos * fall * fall) / (d2 + r2);
          const o = ((iz * NY + iy) * NX + ix) * 4;
          A[o] += L.color.r * w;
          A[o + 1] += L.color.g * w;
          A[o + 2] += L.color.b * w;
        }
      }
    }
  }

  const toTex = (data) => {
    const half = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
    const tex = new THREE.Data3DTexture(half, NX, NY, NZ);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.HalfFloatType;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return tex;
  };
  const texA = toTex(A);
  const texB = toTex(Bv);
  const ms = performance.now() - t0;
  return { texA, texB, ms, heightAt: hAt };
}
