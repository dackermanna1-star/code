// Chunked level-of-detail terrain mesh built from the simulation heightmap.
// Each 128 m chunk has four resolutions (2/4/8/16 m) with skirts to hide
// cracks; the LOD0 triangulation matches Terrain.heightAt exactly. Colours
// come from the surface material map plus noise; burn scars and craters are
// re-uploaded when the simulation marks chunks dirty.

import * as THREE from 'three';
import { MAT } from '../world/terrain.js';
import { Noise2D } from '../world/noise.js';

const LODS = [1, 2, 4, 8];

function hexLin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

const PALETTE = {
  [MAT.GRASS]: [hexLin(0x56632f), hexLin(0x6b7638), hexLin(0x4a5829)],
  [MAT.DRYGRASS]: [hexLin(0x8a8450), hexLin(0x9a8e58), hexLin(0x7c7845)],
  [MAT.DIRT]: [hexLin(0x6c5940), hexLin(0x7b6548), hexLin(0x5e4d38)],
  [MAT.ROCK]: [hexLin(0x76726a), hexLin(0x8a857b), hexLin(0x625e58)],
  [MAT.SAND]: [hexLin(0xb2a178), hexLin(0xbfae84), hexLin(0xa6956c)],
  [MAT.ROAD]: [hexLin(0x3b3b3c), hexLin(0x454546), hexLin(0x333334)],
  [MAT.FIELD]: [hexLin(0x86743f), hexLin(0x5c4b31), hexLin(0x7a6a3a)],
  [MAT.CONCRETE]: [hexLin(0x8c8a84), hexLin(0x97958e), hexLin(0x7f7d77)],
  [MAT.MUD]: [hexLin(0x4b3d2c), hexLin(0x41352a), hexLin(0x564532)],
  [MAT.FOREST]: [hexLin(0x3c4224), hexLin(0x47472a), hexLin(0x343b20)],
};
const GRASSY = { [MAT.GRASS]: 1, [MAT.DRYGRASS]: 0.8, [MAT.FIELD]: 0.5, [MAT.FOREST]: 0.35 };
const SCORCH = hexLin(0x1b1916);

export class TerrainRenderer {
  constructor(terrain, scene, detailTex, quality) {
    this.terrain = terrain;
    this.scene = scene;
    this.quality = quality;
    this.noise = new Noise2D(4242);
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.cs = terrain.chunkSize;
    this.cps = terrain.chunksPerSide;
    this.samplesPerChunk = Math.round(this.cs / terrain.res);
    this.indexCache = new Map();
    this.material = this.createMaterial(detailTex);
    this.chunks = [];
    for (let cz = 0; cz < this.cps; cz++) {
      for (let cx = 0; cx < this.cps; cx++) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        this.group.add(mesh);
        const x0 = cx * this.cs - terrain.half;
        const z0 = cz * this.cs - terrain.half;
        this.chunks.push({ cx, cz, x0, z0, mesh, lod: -1, geos: new Array(LODS.length).fill(null), stale: new Array(LODS.length).fill(false), center: new THREE.Vector3(x0 + this.cs / 2, 0, z0 + this.cs / 2), sphere: new THREE.Sphere() });
      }
    }
    // Per-sample colour noise is cached; dirty chunks only re-mix colours.
    const n = terrain.n;
    this.nv = new Float32Array(n * n * 2);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = terrain.worldX(ix);
        const z = terrain.worldZ(iz);
        const i = (iz * n + ix) * 2;
        this.nv[i] = this.noise.noise(x * 0.012, z * 0.012) * 0.5 + 0.5;
        this.nv[i + 1] = this.noise.noise(x * 0.07 + 31, z * 0.07 - 17) * 0.5 + 0.5;
      }
    }
    this.colors = new Float32Array(n * n * 3);
    this.extra = new Float32Array(n * n * 2);
    this.computeColors(0, 0, n - 1, n - 1);
    for (const c of this.chunks) this.updateBounds(c);
    this.lodDist = [220, 520, 1050].map((d) => d * (quality.terrainLod ?? 1));
    this.buildOuter();
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
  }

  createMaterial(detailTex) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail = { value: detailTex };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aExtra;\nvarying vec2 vExtra;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvExtra = aExtra;\nvWPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nvarying vec2 vExtra;\nvarying vec3 vWPos;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec4 dA = texture2D(uDetail, vWPos.xz / 3.1);
          vec4 dB = texture2D(uDetail, vWPos.xz / 23.0);
          vec4 dC = texture2D(uDetail, vWPos.xz / 170.0);
          float grass = vExtra.y;
          float detail = mix(dA.r, dA.b, grass * 0.7) * 0.55 + dB.g * 0.45;
          diffuseColor.rgb *= 0.72 + detail * 0.55;
          diffuseColor.rgb *= 0.86 + dC.a * 0.28;
          // Grass tufts: lighter and greener streaks.
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 1.12, 0.82), grass * smoothstep(0.55, 0.8, dA.b));
          // Burn marks with a mottled edge.
          float sc = clamp(vExtra.x * (0.75 + dB.r * 0.5), 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.016, 0.014) * (0.6 + dA.r), sc * 0.85);`
        );
    };
    return mat;
  }

  computeColors(ix0, iz0, ix1, iz1) {
    const t = this.terrain;
    const n = t.n;
    const nv = this.nv;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const i = iz * n + ix;
        const x = t.worldX(ix);
        const z = t.worldZ(iz);
        const m = t.mat[i];
        const pal = PALETTE[m] || PALETTE[MAT.GRASS];
        const v1 = nv[i * 2];
        const v2 = nv[i * 2 + 1];
        let r = pal[0][0] + (pal[1][0] - pal[0][0]) * v1;
        let g = pal[0][1] + (pal[1][1] - pal[0][1]) * v1;
        let b = pal[0][2] + (pal[1][2] - pal[0][2]) * v1;
        r += (pal[2][0] - r) * v2 * 0.6;
        g += (pal[2][1] - g) * v2 * 0.6;
        b += (pal[2][2] - b) * v2 * 0.6;
        if (m === MAT.FIELD) {
          // Crop rows.
          const rows = Math.sin((x * 0.7 + z * 0.15) * 2.4) * 0.5 + 0.5;
          r *= 0.85 + rows * 0.25;
          g *= 0.85 + rows * 0.25;
          b *= 0.85 + rows * 0.2;
        }
        const sc = t.scorch[i] / 255;
        const o = i * 3;
        this.colors[o] = r + (SCORCH[0] - r) * sc * 0.4;
        this.colors[o + 1] = g + (SCORCH[1] - g) * sc * 0.4;
        this.colors[o + 2] = b + (SCORCH[2] - b) * sc * 0.4;
        this.extra[i * 2] = sc;
        this.extra[i * 2 + 1] = (GRASSY[m] || 0) * (1 - sc);
      }
    }
  }

  indexFor(lod) {
    if (this.indexCache.has(lod)) return this.indexCache.get(lod);
    const step = LODS[lod];
    const m = this.samplesPerChunk / step + 1;
    const idx = [];
    for (let j = 0; j < m - 1; j++) {
      for (let i = 0; i < m - 1; i++) {
        const a = j * m + i;
        const b = a + 1;
        const c = a + m;
        const d = c + 1;
        idx.push(a, d, b, a, c, d);
      }
    }
    // Skirts: extra ring of lowered vertices appended after the grid.
    const base = m * m;
    const edge = [];
    for (let i = 0; i < m; i++) edge.push(i); // z = 0 row
    for (let j = 1; j < m; j++) edge.push(j * m + m - 1); // x = max column
    for (let i = m - 2; i >= 0; i--) edge.push((m - 1) * m + i); // z = max row
    for (let j = m - 2; j >= 1; j--) edge.push(j * m); // x = 0 column
    for (let k = 0; k < edge.length; k++) {
      const e0 = edge[k];
      const e1 = edge[(k + 1) % edge.length];
      const s0 = base + k;
      const s1 = base + ((k + 1) % edge.length);
      idx.push(e0, s0, e1, e1, s0, s1, e0, e1, s0, e1, s1, s0);
    }
    const res = { index: new THREE.BufferAttribute(new Uint32Array(idx), 1), edge, m };
    this.indexCache.set(lod, res);
    return res;
  }

  buildGeometry(chunk, lod, geo = null) {
    const t = this.terrain;
    const n = t.n;
    const step = LODS[lod];
    const { index, edge, m } = this.indexFor(lod);
    const count = m * m + edge.length;
    let pos;
    let nor;
    let col;
    let ext;
    if (geo && geo.getAttribute('position')) {
      pos = geo.getAttribute('position').array;
      nor = geo.getAttribute('normal').array;
      col = geo.getAttribute('color').array;
      ext = geo.getAttribute('aExtra').array;
    } else {
      geo = new THREE.BufferGeometry();
      pos = new Float32Array(count * 3);
      nor = new Float32Array(count * 3);
      col = new Float32Array(count * 3);
      ext = new Float32Array(count * 2);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aExtra', new THREE.BufferAttribute(ext, 2));
      geo.setIndex(index);
    }
    const ix0 = chunk.cx * this.samplesPerChunk;
    const iz0 = chunk.cz * this.samplesPerChunk;
    const h = t.h;
    const res = t.res;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const ix = Math.min(n - 1, ix0 + i * step);
        const iz = Math.min(n - 1, iz0 + j * step);
        const si = iz * n + ix;
        const v = j * m + i;
        pos[v * 3] = t.worldX(ix);
        pos[v * 3 + 1] = h[si];
        pos[v * 3 + 2] = t.worldZ(iz);
        // Central-difference normal at this LOD's spacing.
        const e = Math.max(1, step);
        const hl = h[iz * n + Math.max(0, ix - e)];
        const hr = h[iz * n + Math.min(n - 1, ix + e)];
        const hd = h[Math.max(0, iz - e) * n + ix];
        const hu = h[Math.min(n - 1, iz + e) * n + ix];
        let nx = hl - hr;
        let ny = 2 * e * res;
        let nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        nor[v * 3] = nx / l;
        nor[v * 3 + 1] = ny / l;
        nor[v * 3 + 2] = nz / l;
        col[v * 3] = this.colors[si * 3];
        col[v * 3 + 1] = this.colors[si * 3 + 1];
        col[v * 3 + 2] = this.colors[si * 3 + 2];
        ext[v * 2] = this.extra[si * 2];
        ext[v * 2 + 1] = this.extra[si * 2 + 1];
      }
    }
    const drop = 1.5 + step * res * 0.6;
    for (let k = 0; k < edge.length; k++) {
      const s = m * m + k;
      const e = edge[k];
      pos[s * 3] = pos[e * 3];
      pos[s * 3 + 1] = pos[e * 3 + 1] - drop;
      pos[s * 3 + 2] = pos[e * 3 + 2];
      nor[s * 3] = nor[e * 3];
      nor[s * 3 + 1] = nor[e * 3 + 1];
      nor[s * 3 + 2] = nor[e * 3 + 2];
      col[s * 3] = col[e * 3];
      col[s * 3 + 1] = col[e * 3 + 1];
      col[s * 3 + 2] = col[e * 3 + 2];
      ext[s * 2] = ext[e * 2];
      ext[s * 2 + 1] = ext[e * 2 + 1];
    }
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('normal').needsUpdate = true;
    geo.getAttribute('color').needsUpdate = true;
    geo.getAttribute('aExtra').needsUpdate = true;
    return geo;
  }

  updateBounds(c) {
    const t = this.terrain;
    let lo = Infinity;
    let hi = -Infinity;
    const n = t.n;
    const ix0 = c.cx * this.samplesPerChunk;
    const iz0 = c.cz * this.samplesPerChunk;
    for (let j = 0; j <= this.samplesPerChunk; j += 4) {
      for (let i = 0; i <= this.samplesPerChunk; i += 4) {
        const v = t.h[Math.min(n - 1, iz0 + j) * n + Math.min(n - 1, ix0 + i)];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    c.center.y = (lo + hi) / 2;
    c.sphere.center.copy(c.center);
    c.sphere.radius = Math.hypot(this.cs / 2, this.cs / 2, (hi - lo) / 2 + 5);
  }

  // Rebuild chunks the simulation deformed (craters, burns). Budgeted.
  processDirty(maxPerFrame = 3) {
    const t = this.terrain;
    if (!t.dirtyChunks.size) return;
    let done = 0;
    for (const id of t.dirtyChunks) {
      if (done >= maxPerFrame) break;
      t.dirtyChunks.delete(id);
      const c = this.chunks[id];
      const s = this.samplesPerChunk;
      const ix0 = Math.max(0, c.cx * s - 1);
      const iz0 = Math.max(0, c.cz * s - 1);
      this.computeColors(ix0, iz0, Math.min(t.n - 1, c.cx * s + s + 1), Math.min(t.n - 1, c.cz * s + s + 1));
      for (let l = 0; l < LODS.length; l++) if (c.geos[l]) c.stale[l] = true;
      if (c.lod >= 0 && c.geos[c.lod]) {
        this.buildGeometry(c, c.lod, c.geos[c.lod]);
        c.stale[c.lod] = false;
      }
      this.updateBounds(c);
      done++;
    }
  }

  update(camera) {
    this.processDirty();
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const cp = camera.position;
    const [d0, d1, d2] = this.lodDist;
    let builds = 0;
    for (const c of this.chunks) {
      const visible = this.frustum.intersectsSphere(c.sphere);
      const dist = Math.max(0, c.center.distanceTo(cp) - this.cs * 0.6);
      let lod = dist < d0 ? 0 : dist < d1 ? 1 : dist < d2 ? 2 : 3;
      if (!visible) {
        c.mesh.visible = false;
        continue;
      }
      if (!c.geos[lod] || c.stale[lod]) {
        // Limit geometry builds per frame; fall back to an existing LOD.
        if (builds < 6 || !c.geos.some(Boolean)) {
          c.geos[lod] = this.buildGeometry(c, lod, c.geos[lod]);
          c.geos[lod].boundingSphere = c.sphere.clone();
          c.stale[lod] = false;
          builds++;
        } else {
          const alt = c.geos.findIndex((g, i) => g && !c.stale[i]);
          if (alt >= 0) lod = alt;
        }
      }
      if (c.lod !== lod) {
        c.mesh.geometry = c.geos[lod];
        c.lod = lod;
      }
      c.mesh.visible = true;
    }
  }

  // Surrounding landscape beyond the playable map: a square annulus whose
  // inner edge sits on the map boundary (low detail, fades into fog).
  buildOuter() {
    const t = this.terrain;
    const half = t.half;
    const cell = 64; // divides the map half-size, so grid lines hit the boundary
    const ext = 6144;
    const m = (ext * 2) / cell + 1;
    const pos = new Float32Array(m * m * 3);
    const colors = new Float32Array(m * m * 3);
    const noise = this.noise;
    const greens = [hexLin(0x3f4a25), hexLin(0x5a6232), hexLin(0x6e6740)];
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const x = -ext + i * cell;
        const z = -ext + j * cell;
        const d = Math.max(Math.abs(x) - half, Math.abs(z) - half);
        let y;
        if (d <= 0) {
          y = t.heightAt(x, z) - 0.6;
        } else {
          const ex = Math.max(-half, Math.min(half, x));
          const ez = Math.max(-half, Math.min(half, z));
          const edgeH = t.heightAt(ex, ez) - 0.6;
          const hills = noise.fbm(x / 1400, z / 1400, 4) * 140 + noise.fbm(x / 400 + 9, z / 400, 3) * 30;
          const k = Math.min(1, d / 1500);
          const s = k * k * (3 - 2 * k);
          y = edgeH * (1 - s) + (60 + hills) * s;
        }
        const v = j * m + i;
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        const nn = noise.noise(x / 600, z / 600) * 0.5 + 0.5;
        const g = greens[nn < 0.33 ? 0 : nn < 0.66 ? 1 : 2];
        colors[v * 3] = g[0];
        colors[v * 3 + 1] = g[1];
        colors[v * 3 + 2] = g[2];
      }
    }
    const idx = [];
    for (let j = 0; j < m - 1; j++) {
      for (let i = 0; i < m - 1; i++) {
        const x0 = -ext + i * cell;
        const z0 = -ext + j * cell;
        // Skip quads inside the playable map.
        if (x0 >= -half && x0 + cell <= half && z0 >= -half && z0 + cell <= half) continue;
        const a = j * m + i;
        const b = a + 1;
        const c = a + m;
        const dd = c + 1;
        idx.push(a, dd, b, a, c, dd);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    mesh.name = 'outer-terrain';
    this.scene.add(mesh);
    this.outer = mesh;
  }
}
