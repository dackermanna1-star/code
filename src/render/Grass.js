// Grass tufts on the ground around the camera: crossed blades swaying in
// the wind, placed per 12 m tile from a hash of the tile (so they stay put)
// with density and colour from the terrain material. Only drawn when the
// camera is near the ground; tufts thin out toward the edge of the radius.

import * as THREE from 'three';
import { MAT } from '../world/terrain.js';

const TILE = 12;
// Tufts per square metre and base colour per material.
const DENSITY = { [MAT.GRASS]: 1.5, [MAT.DRYGRASS]: 1.6, [MAT.FIELD]: 1.7, [MAT.FOREST]: 0.5, [MAT.DIRT]: 0.12, [MAT.MUD]: 0.08 };
const COLOR = {
  [MAT.GRASS]: [0x5d6b30, 0x748238, 0x4c5a28],
  [MAT.DRYGRASS]: [0x958c55, 0xa59a5e, 0x847d48],
  [MAT.FIELD]: [0xa48f4c, 0x8c7a40, 0xb39d58],
  [MAT.FOREST]: [0x4a5428, 0x3e4a24, 0x56602e],
  [MAT.DIRT]: [0x6f6a3a, 0x7c7442, 0x5e5a32],
  [MAT.MUD]: [0x5d5a32, 0x6a6638, 0x50502c],
};
const HEIGHT = { [MAT.GRASS]: 0.42, [MAT.DRYGRASS]: 0.55, [MAT.FIELD]: 0.75, [MAT.FOREST]: 0.38, [MAT.DIRT]: 0.3, [MAT.MUD]: 0.3 };

function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Seven thin blades fanning out from the root, 1 m tall (scaled per instance).
function tuftGeometry() {
  const pos = [];
  const col = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const lean = 0.12 + (k % 3) * 0.08;
    const w = 0.055;
    const bx = c * w;
    const bz = s * w;
    const tx = -s * lean;
    const tz = c * lean;
    const h = 0.75 + (k % 4) * 0.09;
    pos.push(-bx + tx * 0.1, 0, -bz + tz * 0.1, bx + tx * 0.1, 0, bz + tz * 0.1, tx, h, tz);
    col.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.12, 1.12, 1.12);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Lit as if facing up so both sides shade alike.
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function grassMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: new THREE.Vector2(0.4, 0.2) };
    mat.userData.shader = shader;
    // Both faces lit as if facing up (no flipped back-face normals).
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;');
    shader.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 ip = instanceMatrix[3].xyz;
        float k = position.y * position.y;
        float sway = sin(uTime * 2.1 + ip.x * 0.31 + ip.z * 0.23) * 0.6 + sin(uTime * 3.7 + ip.z * 0.5) * 0.3;
        transformed.xz += (uWind * 1.2 + vec2(sway * 0.12)) * k;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'grass';
  return mat;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export class GrassField {
  constructor(scene, terrain, quality) {
    this.terrain = terrain;
    this.radius = quality.particles >= 1 ? 55 : quality.particles >= 0.8 ? 42 : 30;
    this.cap = Math.round(this.radius * this.radius * 5);
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), grassMaterial(), this.cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.tiles = new Map();
    this.center = new THREE.Vector3(1e9, 0, 0);
    this.enabled = true;
  }

  // Tuft matrices and colours for one tile (cached).
  tile(ix, iz) {
    const key = ix * 100003 + iz;
    let t = this.tiles.get(key);
    if (t) return t;
    const terrain = this.terrain;
    const mats = [];
    const cols = [];
    const x0 = ix * TILE;
    const z0 = iz * TILE;
    // Sample the material on a 3 m lattice inside the tile.
    for (let gx = 0; gx < 4; gx++) {
      for (let gz = 0; gz < 4; gz++) {
        const cx = x0 + (gx + 0.5) * 3;
        const cz = z0 + (gz + 0.5) * 3;
        const m = terrain.materialAt(cx, cz);
        const dens = DENSITY[m] || 0;
        if (!dens) continue;
        const n = Math.floor(dens * 9 * (0.6 + 0.8 * hash(ix * 4 + gx, iz * 4 + gz, 11)) + hash(ix * 4 + gx, iz * 4 + gz, 7));
        const pal = COLOR[m];
        for (let k = 0; k < n; k++) {
          const hx = hash(ix * 4 + gx, iz * 4 + gz, k * 3 + 1);
          const hz = hash(ix * 4 + gx, iz * 4 + gz, k * 3 + 2);
          const hs = hash(ix * 4 + gx, iz * 4 + gz, k * 3 + 3);
          const x = cx + (hx - 0.5) * 3;
          const z = cz + (hz - 0.5) * 3;
          const y = terrain.heightAt(x, z);
          if (y < terrain.waterLevel) continue;
          mats.push(x, y, z, hs * 6.283, (0.55 + hs * 0.8) * HEIGHT[m], 0.7 + hx * 0.6);
          _c.setHex(pal[k % 3]).multiplyScalar(0.85 + hz * 0.3);
          cols.push(_c.r, _c.g, _c.b);
        }
      }
    }
    t = { data: new Float32Array(mats), cols: new Float32Array(cols), stamp: 0 };
    this.tiles.set(key, t);
    if (this.tiles.size > 900) {
      // Drop the oldest tiles.
      for (const [k, v] of this.tiles) if (v.stamp < this.frame - 60) this.tiles.delete(k);
    }
    return t;
  }

  update(camera, dt, time, wind) {
    const sh = this.mesh.material.userData.shader;
    if (sh) {
      sh.uniforms.uTime.value = time;
      sh.uniforms.uWind.value.set(wind.x * 0.02, wind.z * 0.02);
    }
    const p = camera.position;
    const ground = this.terrain.heightAt(p.x, p.z);
    const on = this.enabled && p.y - ground < 70;
    this.mesh.visible = on;
    if (!on) return;
    this.frame = (this.frame || 0) + 1;
    this.wait = (this.wait || 0) - dt;
    const moved = Math.hypot(p.x - this.center.x, p.z - this.center.z);
    // Rebuild after moving 5 m, at most five times a second.
    if (moved < 5 || (this.wait > 0 && moved < this.radius * 0.5)) return;
    this.wait = 0.2;
    this.center.copy(p);
    this.rebuild(p);
  }

  rebuild(p) {
    const R = this.radius;
    const arr = this.mesh.instanceMatrix.array;
    const colArr = this.mesh.instanceColor.array;
    let n = 0;
    const ix0 = Math.floor((p.x - R) / TILE);
    const ix1 = Math.floor((p.x + R) / TILE);
    const iz0 = Math.floor((p.z - R) / TILE);
    const iz1 = Math.floor((p.z + R) / TILE);
    for (let ix = ix0; ix <= ix1 && n < this.cap; ix++) {
      for (let iz = iz0; iz <= iz1 && n < this.cap; iz++) {
        const tx = (ix + 0.5) * TILE - p.x;
        const tz = (iz + 0.5) * TILE - p.z;
        if (tx * tx + tz * tz > (R + TILE) * (R + TILE)) continue;
        const t = this.tile(ix, iz);
        t.stamp = this.frame;
        const d = t.data;
        for (let i = 0; i < d.length && n < this.cap; i += 6) {
          const dx = d[i] - p.x;
          const dz = d[i + 2] - p.z;
          const r = Math.sqrt(dx * dx + dz * dz);
          if (r > R) continue;
          // Thin out toward the edge.
          const fade = Math.min(1, (R - r) / (R * 0.3));
          const h = d[i + 4] * fade;
          if (h < 0.05) continue;
          _q.setFromAxisAngle(_up, d[i + 3]);
          _p.set(d[i], d[i + 1], d[i + 2]);
          _s.set(d[i + 5], h, d[i + 5]);
          _m.compose(_p, _q, _s);
          _m.toArray(arr, n * 16);
          const j = (i / 6) * 3;
          colArr[n * 3] = t.cols[j];
          colArr[n * 3 + 1] = t.cols[j + 1];
          colArr[n * 3 + 2] = t.cols[j + 2];
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
