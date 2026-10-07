// Roads: ribbons laid over the land along each road's curve. Asphalt roads
// get painted lines (a dashed centre line, solid edges), patches and cracks;
// dirt tracks fade into the grass at their edges. Bridges get a deck,
// railings and piers.
import * as THREE from 'three';
import { SURF_LAYER } from '../textures.js';
import { noiseTex } from '../textures.js';

const ACROSS = 6; // vertices across a road

function ribbon(T, road, out) {
  const pts = road.pts, w = road.w, n = pts.length;
  const base = out.pos.length / 3;
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
    for (let q = 0; q < ACROSS; q++) {
      const u = q / (ACROSS - 1), off = (u - 0.5) * w;
      const x = pts[k].x + nx * off, z = pts[k].z + nz * off;
      let y = pts[k].y;
      if (!pts[k].bridge) y = Math.max(y, T.heightAt(x, z)) + 0.1 + (road.type === 'track' || road.type === 'dirt' ? 0.04 : 0.12);
      else y += 0.25;
      out.pos.push(x, y, z);
      out.info.push(u, pts[k].d, w);
    }
    if (k < n - 1) for (let q = 0; q < ACROSS - 1; q++) {
      // a dirt track doesn't get drawn over the asphalt where it joins a paved road
      if (road.style.tex !== 'asphalt') {
        const mx = (pts[k].x + pts[k + 1].x) / 2, mz = (pts[k].z + pts[k + 1].z) / 2;
        if (T.sample(T.pavedW, mx, mz) > 0.35) continue;
      }
      const i0 = base + k * ACROSS + q, i1 = i0 + 1, j0 = i0 + ACROSS, j1 = j0 + 1;
      out.idx.push(i0, i1, j0, i1, j1, j0);
    }
  }
}

function roadMaterial(photos, layer, lines, soft) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, transparent: soft, depthWrite: true });
  const uni = { sCol: photos.surfCol, sNor: photos.surfNor, noiseT: { value: noiseTex() }, wet: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 info; varying vec3 vInfo; varying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = info; vW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray sCol, sNor; uniform sampler2D noiseT; uniform float wet;
varying vec3 vInfo; varying vec3 vW;
vec3 rNrm;`)
      .replace('#include <map_fragment>', `{
  float u = vInfo.x, along = vInfo.y, w = vInfo.z;
  vec2 uv = vec2(u * w, along) / ${layer === SURF_LAYER.track ? '16.0' : '14.0'};
  vec4 s = texture(sCol, vec3(uv, ${layer.toFixed(1)}));
  rNrm = texture(sNor, vec3(uv, ${layer.toFixed(1)})).xyz * 2.0 - 1.0;
  float nz = texture(noiseT, vW.xz / 60.0).r, nz2 = texture(noiseT, vW.xz / 13.0 + 0.3).r;
  vec3 col = s.rgb * (0.85 + 0.3 * nz);
  ${lines ? `
  // patches of newer, darker tarmac, and the tyre tracks worn lighter
  col *= mix(1.0, 0.72, smoothstep(0.62, 0.66, nz2));
  float lane = abs(fract(u * 2.0) - 0.5);
  col *= 1.0 + 0.08 * smoothstep(0.3, 0.15, abs(lane - 0.27));
  // the paint: a dashed centre line and solid edge lines, worn in places
  float paint = 0.0;
  paint += step(abs(u - 0.5) * w, 0.22) * step(fract(along / 14.0), 0.55);
  paint += step(abs(u - 0.045) * w, 0.2) + step(abs(u - 0.955) * w, 0.2);
  paint *= smoothstep(0.25, 0.45, nz2);
  col = mix(col, vec3(0.78, 0.76, 0.7), clamp(paint, 0.0, 1.0) * 0.85);` : `
  // the ruts down a dirt track, and grass in the middle
  float rut = smoothstep(0.18, 0.05, abs(abs(u - 0.5) - 0.22));
  col *= 1.0 - rut * 0.18;
  col = mix(col, col * vec3(0.8, 1.05, 0.6), smoothstep(0.08, 0.0, abs(u - 0.5)) * 0.6);`}
  col *= 1.0 - wet * 0.4;
  diffuseColor.rgb *= col;
  ${soft ? 'diffuseColor.a *= smoothstep(0.0, 0.22, u) * smoothstep(1.0, 0.78, u) * (0.75 + 0.25 * nz2);' : ''}
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.9, 0.25, wet);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 n0 = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 t0 = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  vec3 b0 = cross(n0, t0);
  normal = normalize(t0 * rNrm.x * 0.6 + b0 * rNrm.y * 0.6 + normal * rNrm.z);
}`);
  };
  mat.customProgramCacheKey = () => 'ob-road-' + layer + lines + soft;
  mat.userData.uni = uni;
  return mat;
}

export class Roads {
  constructor(world, T, photos) {
    this.world = world;
    const groups = { paved: { pos: [], info: [], idx: [] }, dirt: { pos: [], info: [], idx: [] } };
    for (const r of T.roads) ribbon(T, r, r.style.tex === 'asphalt' ? groups.paved : groups.dirt);
    this.meshes = [];
    const mk = (g, mat, order) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('info', new THREE.Float32BufferAttribute(g.info, 3));
      geo.setIndex(g.idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true; m.renderOrder = order;
      world.scene.add(m);
      this.meshes.push(m);
      return m;
    };
    this.paved = mk(groups.paved, roadMaterial(photos, SURF_LAYER.asphalt, true, false), 0);
    this.dirt = mk(groups.dirt, roadMaterial(photos, SURF_LAYER.track, false, true), 1);
    this.bridges = T.bridges;
  }
  setWet(w) { for (const m of this.meshes) m.material.userData.uni.wet.value = w; }
}
