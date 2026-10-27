/**
 * Resolved stars of the current galaxy: one point buffer per loaded sector
 * (positions in metres relative to the sector centre; the sector is placed
 * camera-relative each frame). Brightness: visual luminosity / 4πd² in
 * solar-constant units, so exposure/bloom make bright stars glare and faint
 * ones fade like the night sky. Sectors fade in/out at their level's range so
 * nothing pops. Dust extinction toward the galactic plane is approximated
 * analytically for the host galaxy.
 */
import * as THREE from 'three';
import { SPRITE_PROFILE_GLSL } from './points';
import { LEVELS, LEVEL_RANGE, NEIGHBOUR_RADIUS, SECTOR_SIZE, type SectorStars, type Exclusion } from '../astro/starsectors';
import type { GalaxyParams } from '../astro/galaxy';
import { ensureDensity } from '../astro/galaxy';
import { blackbodyRGB } from '../astro/stellar';
import { LY, SOLAR_CONSTANT, SOLAR_LUMINOSITY } from '../core/constants';
import type { UPos } from '../core/upos';
import { PRE_EXPOSURE, PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';


const K = SOLAR_LUMINOSITY / (4 * Math.PI) / SOLAR_CONSTANT / (LY * LY);

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float lumV;
attribute vec3 color;
uniform float uPixelAngle;
${PRE_EXPOSURE_GLSL}
uniform float uBoost;
uniform float uRange;      // ly: this level's load range (fade at edge)
uniform float uK;
uniform float uLy;
uniform vec3 uHide;        // camera-relative position (ly) of the active system's star
uniform float uHideR;      // ly
uniform vec3 uCamG;        // camera in galaxy-local ly (for dust extinction)
uniform mat3 uWorldToG;
uniform float uDustTau;    // midplane optical depth per ly (host galaxy)
uniform float uDustH;      // dust scale height (ly)
uniform float uMinSize;
varying vec3 vColor;
varying float vPeak;
varying float vSize;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 rel = wp.xyz / uLy;           // ly
  float d = length(rel);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float fade = 1.0 - smoothstep(uRange * 0.82, uRange, d);
  if (length(rel - uHide) < uHideR) fade = 0.0;
  // analytic extinction through an exponential dust slab
  vec3 rg = uWorldToG * rel;
  float y0 = uCamG.y, y1 = uCamG.y + rg.y;
  float vy = rg.y / max(d, 1e-6);
  float tauD;
  if (abs(vy) * d < uDustH * 1e-3) tauD = d * exp(-abs(y0) / uDustH);
  else if (y0 * y1 >= 0.0) tauD = uDustH / abs(vy) * abs(exp(-abs(y0) / uDustH) - exp(-abs(y1) / uDustH));
  else tauD = uDustH / abs(vy) * (2.0 - exp(-abs(y0) / uDustH) - exp(-abs(y1) / uDustH));
  tauD *= uDustTau;
  vec3 ext = exp(-tauD * vec3(0.75, 1.0, 1.32));
  float flux = lumV * uK / max(d * d, 1e-12) * uBoost * fade;
  float e = uPreExposure;
  float omega = uPixelAngle * uPixelAngle;
  float peak = flux / (omega * 2.26);
  float disp = peak * e;
  float size = clamp(uMinSize * (1.0 + 0.6 * log2(max(disp, 1.0))), uMinSize, 48.0);
  vPeak = disp;
  vSize = size;
  vColor = color * ext;
  gl_PointSize = size;
  if (flux <= 0.0 || disp < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vPeak;
varying float vSize;
${SPRITE_PROFILE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  float g = spriteProfile(gl_PointCoord, vSize);
  gl_FragColor = vec4(min(vColor * vPeak * g, vec3(6e4)), 1.0);
}
`;

interface Loaded {
  sector: SectorStars;
  points: THREE.Points | null;
}

export interface StarRef {
  galaxy: GalaxyParams;
  level: number; ix: number; iy: number; iz: number; index: number;
  /** galaxy-local position (ly) */
  x: number; y: number; z: number;
  lum: number; lumV: number; temp: number; mass: number; age: number; remnant: number;
}

export class StarField {
  readonly group = new THREE.Group();
  private galaxy: GalaxyParams | null = null;
  private loaded = new Map<string, Loaded>();
  private pending = new Map<string, number>();
  private materials: THREE.ShaderMaterial[] = [];
  private worker: Worker;
  private nextId = 1;
  private reqs = new Map<number, string>();
  boost = 1;
  exclude: Exclusion[] = [];
  private generation = 0;

  constructor(adapt: () => THREE.Texture) {
    for (let L = 0; L < LEVELS; L++) {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uPixelAngle: { value: 0.001 }, tPreExposure: PRE_EXPOSURE_TEX, uBoost: { value: 1 }, uRange: { value: LEVEL_RANGE[L] },
          uK: { value: K }, uLy: { value: LY }, uHide: { value: new THREE.Vector3(1e9, 0, 0) }, uHideR: { value: 0 },
          uCamG: { value: new THREE.Vector3() }, uWorldToG: { value: new THREE.Matrix3() }, uDustTau: { value: 0 }, uDustH: { value: 300 },
          uMinSize: { value: 2.4 },
        },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      void adapt;
      this.materials.push(m);
    }
    this.worker = new Worker(new URL('../astro/sectorworker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => this.onSector(ev.data.id, ev.data.sector);
  }

  setGalaxy(g: GalaxyParams | null, exclude: Exclusion[] = []) {
    if (g === this.galaxy) return;
    this.clear();
    this.galaxy = g;
    this.exclude = exclude;
    this.generation++;
    if (g) ensureDensity(g);
  }

  get currentGalaxy() {
    return this.galaxy;
  }

  private clear() {
    for (const l of this.loaded.values()) {
      if (l.points) {
        this.group.remove(l.points);
        l.points.geometry.dispose();
      }
    }
    this.loaded.clear();
    this.pending.clear();
    this.reqs.clear();
  }

  private onSector(id: number, s: SectorStars) {
    const key = this.reqs.get(id);
    this.reqs.delete(id);
    if (!key || !this.pending.has(key)) return;
    this.pending.delete(key);
    const n = s.count;
    let points: THREE.Points | null = null;
    if (n > 0) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) pos[i] = s.pos[i] * LY;
      const col = new Float32Array(n * 3);
      const lumV = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const c = blackbodyRGB(s.temp[i] || 3000);
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        lumV[i] = s.remnant[i] >= 2 && s.remnant[i] <= 3 ? 0 : s.lumV[i];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('lumV', new THREE.BufferAttribute(lumV, 1));
      points = new THREE.Points(g, this.materials[s.level]);
      points.frustumCulled = false;
      points.renderOrder = 1;
      points.matrixAutoUpdate = false;
      this.group.add(points);
    }
    this.loaded.set(key, { sector: s, points });
  }

  /** camG: camera position in galaxy-local ly. */
  update(cam: UPos, camG: THREE.Vector3, pixelAngle: number, hideRel: THREE.Vector3 | null) {
    const g = this.galaxy;
    if (!g) return;
    const wanted = new Set<string>();
    const qi = g.q.clone().invert();
    const m3 = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(qi));
    for (let L = 0; L < LEVELS; L++) {
      const S = SECTOR_SIZE[L];
      // skip levels whose sectors would be empty: far outside the galaxy body
      const bx = Math.floor(camG.x / S), by = Math.floor(camG.y / S), bz = Math.floor(camG.z / S);
      const R = NEIGHBOUR_RADIUS;
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
        const key = `${L}:${bx + i}:${by + j}:${bz + k}`;
        wanted.add(key);
        if (!this.loaded.has(key) && !this.pending.has(key) && this.pending.size < 48) {
          const id = this.nextId++;
          this.pending.set(key, id);
          this.reqs.set(id, key);
          const plain = { ...g, upos: null, q: null } as unknown as GalaxyParams;
          this.worker.postMessage({ id, galaxy: plain, level: L, ix: bx + i, iy: by + j, iz: bz + k, exclude: this.exclude });
        }
      }
      const mat = this.materials[L];
      mat.uniforms.uPixelAngle.value = pixelAngle;
      mat.uniforms.uBoost.value = this.boost;
      mat.uniforms.uCamG.value.copy(camG);
      mat.uniforms.uWorldToG.value.copy(m3);
      mat.uniforms.uDustTau.value = g.dust * 5e-4;
      mat.uniforms.uDustH.value = g.diskHeight * 0.35;
      if (hideRel) {
        mat.uniforms.uHide.value.copy(hideRel).multiplyScalar(1 / LY);
        mat.uniforms.uHideR.value = 0.02;
      } else mat.uniforms.uHideR.value = 0;
    }
    // drop sectors that left the neighbourhood
    for (const [key, l] of this.loaded) {
      if (!wanted.has(key)) {
        if (l.points) {
          this.group.remove(l.points);
          l.points.geometry.dispose();
        }
        this.loaded.delete(key);
      }
    }
    for (const key of [...this.pending.keys()]) if (!wanted.has(key)) this.pending.delete(key);
    // place sectors camera-relative (float64 → float32 only after subtraction)
    const camRelG = new THREE.Vector3();
    for (const l of this.loaded.values()) {
      if (!l.points) continue;
      const s = l.sector;
      camRelG.set(s.cx - camG.x, s.cy - camG.y, s.cz - camG.z).multiplyScalar(LY).applyQuaternion(g.q);
      l.points.position.copy(camRelG);
      l.points.quaternion.copy(g.q);
      l.points.updateMatrix();
    }
  }

  get stats() {
    let n = 0;
    for (const l of this.loaded.values()) n += l.sector.count;
    return { sectors: this.loaded.size, pending: this.pending.size, stars: n };
  }

  /** Iterate over loaded stars (for picking / nearest-star queries). */
  *stars(): Generator<StarRef> {
    const g = this.galaxy;
    if (!g) return;
    for (const l of this.loaded.values()) {
      const s = l.sector;
      for (let i = 0; i < s.count; i++) {
        yield {
          galaxy: g, level: s.level, ix: s.ix, iy: s.iy, iz: s.iz, index: i,
          x: s.cx + s.pos[i * 3], y: s.cy + s.pos[i * 3 + 1], z: s.cz + s.pos[i * 3 + 2],
          lum: s.lum[i], lumV: s.lumV[i], temp: s.temp[i], mass: s.mass[i], age: s.age[i], remnant: s.remnant[i],
        };
      }
    }
  }

  /** Nearest loaded star to a galaxy-local point (ly). */
  nearest(p: THREE.Vector3, maxDist = Infinity): { star: StarRef; dist: number } | null {
    let best: StarRef | null = null;
    let bd = maxDist * maxDist;
    for (const st of this.stars()) {
      const d = (st.x - p.x) ** 2 + (st.y - p.y) ** 2 + (st.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best ? { star: best, dist: Math.sqrt(bd) } : null;
  }
}
