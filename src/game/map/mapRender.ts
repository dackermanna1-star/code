// Terrain, road and pad meshes for the map.

import * as THREE from 'three';
import type { Heightfield } from '../../sim/terrain.ts';
import { Surface } from '../../sim/surfaces.ts';
import { grassTexture, dirtTexture, rockTexture, sandTexture, asphaltTexture, concreteTexture, roadMarkingsTexture, asphaltRoughness } from '../../render/textures.ts';
import type { RoadPath } from './terrainGen.ts';
import { PADS } from './layout.ts';

/** Build a splat texture (R grass, G dirt/mud, B rock/gravel, A sand) from the surface map. */
function splatTexture(hf: Heightfield): THREE.DataTexture {
  const w = hf.matNx, h = hf.matNz;
  const raw = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const s = hf.materials[j * w + i];
      const k = (j * w + i) * 4;
      switch (s) {
        case Surface.GRASS: raw[k] = 1; break;
        case Surface.DIRT: case Surface.MUD: raw[k + 1] = 1; break;
        case Surface.ROCK: case Surface.GRAVEL: case Surface.CONCRETE: case Surface.ASPHALT: raw[k + 2] = 1; break;
        case Surface.SAND: raw[k + 3] = 1; break;
        default: raw[k] = 1;
      }
    }
  }
  // blur for soft transitions
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const acc = [0, 0, 0, 0];
      let c = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = Math.min(w - 1, Math.max(0, i + di)), jj = Math.min(h - 1, Math.max(0, j + dj));
          const k = (jj * w + ii) * 4;
          for (let q = 0; q < 4; q++) acc[q] += raw[k + q];
          c++;
        }
      }
      const k = (j * w + i) * 4;
      for (let q = 0; q < 4; q++) out[k + q] = Math.round((acc[q] / c) * 255);
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function buildTerrainMesh(hf: Heightfield): THREE.Group {
  const group = new THREE.Group();
  const splat = splatTexture(hf);
  const grass = grassTexture(), dirt = dirtTexture(), rock = rockTexture(), sand = sandTexture();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const uniforms = {
    tGrass: { value: grass },
    tDirt: { value: dirt },
    tRock: { value: rock },
    tSand: { value: sand },
    tSplat: { value: splat },
    splatOrigin: { value: new THREE.Vector2(hf.x0, hf.z0) },
    splatSize: { value: new THREE.Vector2(hf.matNx * hf.matCell, hf.matNz * hf.matCell) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWPos;
         varying vec3 vWNrm;
         uniform sampler2D tGrass, tDirt, tRock, tSand, tSplat;
         uniform vec2 splatOrigin, splatSize;
         float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
         float n21(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
           return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
         vec3 tri(sampler2D t, vec2 uv) {
           // two scales to hide tiling
           return mix(texture2D(t, uv).rgb, texture2D(t, uv * 0.27 + 0.13).rgb, 0.35);
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 suv = (vWPos.xz - splatOrigin) / splatSize;
         vec4 sp = texture2D(tSplat, suv);
         float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
         float rockW = sp.b + smoothstep(0.35, 0.6, slope) * 1.5;
         vec2 uv = vWPos.xz * 0.12;
         vec3 cg = tri(tGrass, uv);
         vec3 cd = tri(tDirt, uv * 0.8);
         vec3 cr = tri(tRock, uv * 0.5);
         vec3 cs = tri(tSand, uv);
         float wsum = sp.r + sp.g + rockW + sp.a + 1e-4;
         vec3 col = (cg * sp.r + cd * sp.g + cr * rockW + cs * sp.a) / wsum;
         float macro = n21(vWPos.xz * 0.015) * 0.5 + n21(vWPos.xz * 0.06) * 0.25 + 0.4;
         col *= mix(0.82, 1.12, macro);
         // snowy peaks
         float snow = smoothstep(150.0, 185.0, vWPos.y + n21(vWPos.xz * 0.05) * 20.0) * smoothstep(0.65, 0.4, slope);
         col = mix(col, vec3(0.92, 0.94, 0.97), snow);
         diffuseColor.rgb *= col;`,
      );
  };
  // chunked mesh
  const CH = 50; // cells per chunk
  const n = hf.nx;
  const cells = n - 1;
  for (let cj = 0; cj < cells; cj += CH) {
    for (let ci = 0; ci < cells; ci += CH) {
      const cw = Math.min(CH, cells - ci), chh = Math.min(CH, cells - cj);
      const vx = cw + 1, vz = chh + 1;
      const pos = new Float32Array(vx * vz * 3);
      const nrm = new Float32Array(vx * vz * 3);
      for (let j = 0; j < vz; j++) {
        for (let i = 0; i < vx; i++) {
          const gi = ci + i, gj = cj + j;
          const k = (j * vx + i) * 3;
          pos[k] = hf.x0 + gi * hf.cell;
          pos[k + 1] = hf.heights[gj * n + gi];
          pos[k + 2] = hf.z0 + gj * hf.cell;
          const hl = hf.getH(gi - 1, gj), hr = hf.getH(gi + 1, gj), hd = hf.getH(gi, gj - 1), hu = hf.getH(gi, gj + 1);
          let nx = hl - hr, ny = 2 * hf.cell, nz = hd - hu;
          const l = Math.hypot(nx, ny, nz);
          nx /= l; ny /= l; nz /= l;
          nrm[k] = nx; nrm[k + 1] = ny; nrm[k + 2] = nz;
        }
      }
      const idx: number[] = [];
      for (let j = 0; j < chh; j++) {
        for (let i = 0; i < cw; i++) {
          const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
          // diagonal a-d (matches physics split (i,j)-(i+1,j+1))
          idx.push(a, d, b, a, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = false;
      group.add(m);
    }
  }
  return group;
}

export function buildRoadMeshes(roads: RoadPath[], hf: Heightfield): THREE.Group {
  const group = new THREE.Group();
  for (const r of roads) {
    const s = r.samples;
    if (s.length < 2) continue;
    const half = r.def.width / 2;
    const gravel = r.def.surface === Surface.GRAVEL;
    const pos: number[] = [], uv: number[] = [], nrm: number[] = [];
    const idx: number[] = [];
    const across = 4;
    for (let k = 0; k < s.length; k++) {
      const p = s[k];
      const nx = -p.tz, nz = p.tx;
      for (let a = 0; a <= across; a++) {
        const t = a / across;
        const off = -half + t * 2 * half;
        const x = p.x + nx * off, z = p.z + nz * off;
        const y = hf.heightAt(x, z) + 0.035;
        pos.push(x, y, z);
        nrm.push(0, 1, 0);
        uv.push(t, p.s / 16);
      }
    }
    for (let k = 0; k < s.length - 1; k++) {
      for (let a = 0; a < across; a++) {
        const i0 = k * (across + 1) + a, i1 = i0 + 1, i2 = i0 + across + 1, i3 = i2 + 1;
        idx.push(i0, i1, i2, i1, i3, i2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tex = gravel ? null : roadMarkingsTexture(r.def.lanes).clone();
    if (tex) {
      tex.needsUpdate = true;
      tex.wrapT = THREE.RepeatWrapping;
    }
    const mat = new THREE.MeshStandardMaterial({
      color: gravel ? 0x8a8070 : 0xffffff,
      map: tex,
      roughness: 0.88,
      roughnessMap: gravel ? null : asphaltRoughness(),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    if (gravel) {
      const dt = dirtTexture().clone();
      dt.needsUpdate = true;
      dt.repeat.set(1, 1);
      mat.map = dt;
    }
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

export function buildPadMeshes(hf: Heightfield): THREE.Group {
  const group = new THREE.Group();
  for (const p of PADS) {
    if (p.slab === 'none' || p.slab === 'dirt') continue;
    const segX = Math.max(1, Math.ceil(p.w / 8)), segZ = Math.max(1, Math.ceil(p.d / 8));
    const g = new THREE.PlaneGeometry(p.w, p.d, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const pa = g.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i) + p.x, z = pa.getZ(i) + p.z;
      pa.setY(i, hf.heightAt(x, z) + 0.02);
    }
    g.computeVertexNormals();
    const base = p.slab === 'concrete' ? concreteTexture() : asphaltTexture();
    const t = base.clone();
    t.needsUpdate = true;
    t.repeat.set(p.w / (p.slab === 'concrete' ? 6 : 10), p.d / (p.slab === 'concrete' ? 6 : 10));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: t,
      roughness: p.slab === 'concrete' ? 0.8 : 0.9,
      color: p.slab === 'concrete' ? 0xd8d6d0 : 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    }));
    m.position.set(p.x, 0, p.z);
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
