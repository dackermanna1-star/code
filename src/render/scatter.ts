/**
 * Ground-level scatter: rocks, boulders and plants placed deterministically
 * in cube-face cells around the camera when it is near a solid surface.
 *
 * Placement follows the same physical fields as the terrain (rock exposure,
 * moisture, temperature, liquid level, life), so forests grow where the
 * terrain shader paints vegetation and boulders sit on exposed bedrock.
 * Instances are stored relative to an anchor near the camera (float32-safe)
 * and lit by the planet's atmosphere LUTs, sharing the terrain's uniforms.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import { FACES, faceToDir } from '../terrain/cubesphere';
import type { SurfaceGenerator } from '../terrain/surface';
import { Rng, seedOf } from '../core/rng';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { LIGHTING_GLSL, ECLIPSE_GLSL } from './shaders/lighting.glsl';
import { ATMOSPHERE_UNIFORMS, ATMOSPHERE_FUNCS, ATMOSPHERE_LUT_FUNCS } from './shaders/atmosphere.glsl';
import { PRE_EXPOSURE_GLSL } from './exposure';
import { floraFor, rockGeometries, type Species } from './flora';

const QPI = Math.PI / 4;

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aPart;
uniform float uTime;
uniform float uWind;
uniform float uFade;      // instance hidden beyond size × uFade (m)
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vCol;
varying float vPart;
varying float vAO;
varying vec3 vLocal;
void main() {
  vec3 p = position;
  float size = length(instanceMatrix[1].xyz);
  vec3 ip = instanceMatrix[3].xyz;
  if (aPart > 0.5) {
    // wind: sway grows with height²; per-instance phase
    float h = max(p.y, 0.0);
    float ph = uTime * 1.3 + ip.x * 0.11 + ip.z * 0.07;
    p.x += sin(ph) * 0.035 * h * h * uWind;
    p.z += cos(ph * 0.8) * 0.025 * h * h * uWind;
  }
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  float d = length(wp.xyz);
  if (d > size * uFade) wp.xyz = vec3(0.0, 0.0, 1e9);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
#ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
#else
  vCol = vec3(0.5);
#endif
  vPart = aPart;
  vAO = clamp(0.35 + position.y * 1.3, 0.35, 1.0);
  vLocal = position * size + ip;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${LIGHTING_GLSL}
${ECLIPSE_GLSL}
#ifdef HAS_ATMOSPHERE
${ATMOSPHERE_UNIFORMS}
${ATMOSPHERE_FUNCS}
${ATMOSPHERE_LUT_FUNCS}
#endif
uniform vec3 uPlanetCenter;
uniform float uRadius;
uniform vec3 uSunDir[2];
uniform vec3 uSunIllum[2];
uniform float uAmbient;
uniform vec3 uPlanetShine;
uniform vec3 uStem;
uniform float uFoliage;   // 1 = translucent foliage shading for part 1
${PRE_EXPOSURE_GLSL}
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vCol;
varying float vPart;
varying float vAO;
varying vec3 vLocal;
void main() {
  #include <logdepthbuf_fragment>
  vec3 P = vWorld;
  vec3 V = -normalize(P);
  vec3 up = normalize(P - uPlanetCenter);
  float rPos = length(P - uPlanetCenter);
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;
  bool leaf = vPart > 0.5 && uFoliage > 0.5;
  vec3 albedo = vPart > 0.5 || uFoliage < 0.5 ? vCol : uStem;
  // surface variation (lichen-like mottling on rock, leaf clumps)
  float n = gnoise(vLocal * (leaf ? 3.0 : 1.7));
  albedo *= 0.8 + 0.35 * n;
  vec3 color = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec3 E = uSunIllum[k];
    if (dot(E, E) <= 0.0) continue;
    vec3 L = uSunDir[k];
    float muS = dot(up, L);
    vec3 sunT, sky;
#ifdef HAS_ATMOSPHERE
    sunT = sunTransmittance(rPos, muS);
    sky = skyIrradiance(rPos, muS);
#else
    sunT = vec3(smoothstep(-0.02, 0.02, muS));
    sky = vec3(0.0);
#endif
    float ecl = eclipseFactor(P, k);
    float NdotL = dot(N, L);
    float diff = leaf ? max((NdotL + 0.45) / 1.45, 0.0) : max(NdotL, 0.0);
    // light through thin leaves (forward scattering toward the viewer)
    float trans = leaf ? pow(max(dot(-V, L), 0.0), 4.0) * 0.35 : 0.0;
    vec3 Ein = E * sunT * ecl;
    color += albedo / PI * Ein * (diff + trans) * mix(0.6, 1.0, vAO);
    color += albedo / PI * E * sky * (0.55 + 0.45 * dot(N, up)) * vAO * ecl;
  }
  color += albedo * (uPlanetShine + vec3(uAmbient));
  gl_FragColor = vec4(min(color * uPreExposure, vec3(6e4)), 1.0);
}
`;

interface Item { species: number; x: number; y: number; z: number; ux: number; uy: number; uz: number; s: number; rot: number; tilt: number; col: [number, number, number] }

interface Layer {
  name: string;
  cell: number;       // m
  radius: number;     // m
  meshes: THREE.InstancedMesh[];
  kinds: number;      // geometry variants (rocks) or species count
  cells: Map<string, Item[]>;
  dirty: boolean;
  capacity: number;
}

/** Find the cube face and face coordinates of a direction. */
function dirToFace(d: THREE.Vector3): { face: number; a: number; b: number } {
  let face = 0, best = -Infinity;
  for (let f = 0; f < 6; f++) {
    const n = FACES[f].n;
    const v = d.x * n[0] + d.y * n[1] + d.z * n[2];
    if (v > best) { best = v; face = f; }
  }
  const F = FACES[face];
  const dn = best;
  const du = d.x * F.u[0] + d.y * F.u[1] + d.z * F.u[2];
  const dv = d.x * F.v[0] + d.y * F.v[1] + d.z * F.v[2];
  return { face, a: Math.atan(du / dn) / QPI, b: Math.atan(dv / dn) / QPI };
}

export class SurfaceScatter {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private anchor = new THREE.Vector3();
  private hasAnchor = false;
  readonly rockMat: THREE.ShaderMaterial;
  private plantMat: THREE.ShaderMaterial;
  private species: Species[];
  private rockPalette: [number, number, number][];
  density = 1;
  active = false;
  /** debugging / stats */
  stats = { rocks: 0, plants: 0, cells: 0 };

  constructor(readonly body: Body, terrainUniforms: Record<string, THREE.IUniform>, hasAtmosphere: boolean) {
    const sp = body.planet!.surface!;
    const shared: Record<string, THREE.IUniform> = {};
    for (const [k, v] of Object.entries(terrainUniforms)) shared[k] = v; // same objects → stay in sync
    const mk = (foliage: boolean) => new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...shared,
        uWind: { value: hasAtmosphere ? Math.min(1.5, (body.planet!.atmosphere?.pressure ?? 0) * 0.8 + 0.2) : 0 },
        uFade: { value: foliage ? 140 : 260 },
        uStem: { value: new THREE.Vector3(...sp.palette.rockB).multiplyScalar(0.6) },
        uFoliage: { value: foliage ? 1 : 0 },
      },
      defines: hasAtmosphere ? { HAS_ATMOSPHERE: '' } : {},
      side: foliage ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.rockMat = mk(false);
    this.plantMat = mk(true);
    const life = body.planet!.life;
    this.species = floraFor({ seed: sp.seed, terrestrial: body.known && body.name === 'Earth', life: life.kind, gravity: body.planet!.gravity, veg1: sp.palette.veg1, veg2: sp.palette.veg2, rock: sp.palette.rockB });
    if (this.species[0]) (this.plantMat.uniforms.uStem.value as THREE.Vector3).set(...this.species[0].stem);
    this.rockPalette = [sp.palette.rockA, sp.palette.rockB, sp.palette.highland, sp.palette.regolith];
    const rocks = rockGeometries(sp.seed);
    const smallSp = this.species.filter((s) => !s.large), largeSp = this.species.filter((s) => s.large);
    const mkLayer = (name: string, cell: number, radius: number, geos: THREE.BufferGeometry[], mat: THREE.ShaderMaterial, cap: number): Layer => {
      const meshes = geos.map((g) => {
        const m = new THREE.InstancedMesh(g, mat, cap);
        m.count = 0;
        m.frustumCulled = false;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        this.group.add(m);
        return m;
      });
      return { name, cell, radius, meshes, kinds: geos.length, cells: new Map(), dirty: true, capacity: cap };
    };
    this.layers.push(mkLayer('rocks', 24, 170, rocks, this.rockMat, 6000));
    this.layers.push(mkLayer('boulders', 96, 700, rocks, this.rockMat, 3000));
    if (smallSp.length) this.layers.push(mkLayer('plants', 24, 150, smallSp.map((s) => s.geometry), this.plantMat, 6000));
    if (largeSp.length) this.layers.push(mkLayer('trees', 64, 650, largeSp.map((s) => s.geometry), this.plantMat, 8000));
    this.group.visible = false;
  }

  /** Place the cell's items (deterministic). dist: cell distance from the camera (m). */
  private generate(layer: Layer, gen: SurfaceGenerator, face: number, i: number, j: number, dist: number): Item[] {
    const sp = this.body.planet!.surface!;
    const R = this.body.radius;
    const rng = new Rng(seedOf(sp.seed, layer.name, face, i, j));
    const da = layer.cell / (R * QPI);
    const sea = gen.liquidLevel();
    const area = layer.cell * layer.cell;
    const out: Item[] = [];
    const dir = [0, 0, 0];
    const life = this.body.planet!.life;
    const airless = !this.body.planet!.atmosphere || this.body.planet!.atmosphere.pressure < 0.001;
    let expected = 0;
    if (layer.name === 'rocks') expected = area * 0.012 * (airless ? 2.2 : 1);
    else if (layer.name === 'boulders') expected = area * 0.0006 * (airless ? 1.6 : 1);
    // same coverage the terrain shader paints (clamp(vegetation·1.5))
    const cover = Math.min(1, sp.vegetation * 1.5);
    if (layer.name === 'plants') expected = area * 0.05 * cover;
    else if (layer.name === 'trees') expected = area * 0.004 * cover;
    void life;
    const n = Math.min(rng.poisson(expected * this.density), 200);
    const plantsLayer = layer.name === 'plants' || layer.name === 'trees';
    const sp2 = plantsLayer ? this.species.filter((s) => s.large === (layer.name === 'trees')) : [];
    const wsum = sp2.reduce((a, s) => a + s.weight, 0);
    for (let k = 0; k < n; k++) {
      const a = (i + rng.next()) * da, b = (j + rng.next()) * da;
      if (a < -1 || a > 1 || b < -1 || b > 1) continue;
      faceToDir(face, a, b, dir);
      // sample at the wavelength the terrain mesh resolves at this distance
      // (vertex spacing ≈ d / (16·lodK)), never finer than the mesh actually
      // drawn right now, so items sit on the visible surface
      const s = gen.sample(dir[0], dir[1], dir[2], Math.min(80, Math.max(0.25, dist / 55, this.meshLambda)));
      if (sea > -Infinity && s.height < sea + 0.05) continue;
      if (s.temp > 650) continue; // molten / vent
      const roll = rng.next();
      let species = 0, size = 1, col: [number, number, number];
      if (!plantsLayer) {
        // more and bigger rocks on exposed bedrock and steep ground
        const keep = 0.25 + 0.75 * s.rock;
        if (roll > keep) continue;
        const u = rng.next();
        size = layer.name === 'rocks' ? 0.12 * Math.pow(1 - u * 0.97, -0.6) : 0.9 * Math.pow(1 - u * 0.95, -0.7);
        size = Math.min(size, layer.name === 'rocks' ? 1.2 : 9);
        species = rng.int(0, layer.kinds - 1);
        const c = this.rockPalette[rng.int(0, this.rockPalette.length - 1)];
        const f = rng.range(0.75, 1.2);
        col = [c[0] * f, c[1] * f, c[2] * f];
        if (s.temp < 250 && rng.chance(0.4)) col = [col[0] * 0.5 + 0.4, col[1] * 0.5 + 0.42, col[2] * 0.5 + 0.45]; // frosted
      } else {
        // same suitability as the terrain shader's vegetation
        const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        const veg = ss(0.1, 0.42, s.moisture) * ss(252, 280, s.temp) * ss(335, 306, s.temp) * (1 - ss(0.5, 0.9, s.rock));
        if (roll > veg) continue;
        let w = rng.next() * wsum;
        species = 0;
        while (species < sp2.length - 1 && w > sp2[species].weight) { w -= sp2[species].weight; species++; }
        const S = sp2[species];
        size = S.height * rng.range(0.4, 1.3) * (S.large ? Math.pow(rng.next(), 0.6) * 0.7 + 0.3 : 1);
        const t = rng.range(-0.12, 0.12);
        col = [S.color[0] * (1 + t), S.color[1] * (1 + t * 0.5), S.color[2] * (1 + t)];
      }
      const r = R + s.height - size * (plantsLayer ? 0.02 : 0.18);
      out.push({ species, x: dir[0] * r, y: dir[1] * r, z: dir[2] * r, ux: dir[0], uy: dir[1], uz: dir[2], s: size, rot: rng.range(0, Math.PI * 2), tilt: plantsLayer ? rng.range(0, 0.06) : rng.range(0, 0.35), col });
    }
    return out;
  }

  /** wavelength (m) of the finest terrain mesh drawn near the camera */
  private meshLambda = 0;

  /**
   * camBody: camera position in planet-fixed coordinates.
   * terrainSpacing: vertex spacing (m) of the finest terrain drawn near the
   * camera. While terrain is still streaming in, items are placed on the
   * coarser surface and re-placed as it refines.
   */
  update(gen: SurfaceGenerator | null, camBody: THREE.Vector3, time: number, density: number, terrainSpacing = 0) {
    const R = this.body.radius;
    const alt = camBody.length() - R;
    const sp = this.body.planet!.surface!;
    const want = !!gen && alt < Math.max(2500, sp.reliefScale * 0.4) && density > 0;
    if (want !== this.active) {
      this.active = want;
      this.group.visible = want;
      if (!want) for (const l of this.layers) { l.cells.clear(); l.dirty = true; }
    }
    if (!want || !gen) return;
    const lam = terrainSpacing > 3 ? Math.pow(2, Math.round(Math.log2(terrainSpacing * 2))) : 0;
    if (lam !== this.meshLambda) {
      this.meshLambda = lam;
      for (const l of this.layers) l.cells.clear();
    }
    if (density !== this.density) {
      this.density = density;
      for (const l of this.layers) { l.cells.clear(); l.dirty = true; }
    }
    this.rockMat.uniforms.uTime.value = time % 1000;
    this.rockMat.uniforms.uFade.value = 260;
    this.plantMat.uniforms.uTime.value = time % 1000;
    const dir = camBody.clone().normalize();
    const f = dirToFace(dir);
    // re-anchor when the camera has moved far from the anchor (keeps instance offsets small)
    if (!this.hasAnchor || this.anchor.distanceTo(camBody) > 1500) {
      this.anchor.copy(dir).multiplyScalar(R);
      this.hasAnchor = true;
      for (const l of this.layers) l.dirty = true;
    }
    let budget = 24;
    for (const layer of this.layers) {
      const da = layer.cell / (R * QPI);
      const ci = Math.floor(f.a / da), cj = Math.floor(f.b / da);
      const rc = Math.ceil(layer.radius / layer.cell);
      const needed = new Set<string>();
      for (let dj = -rc; dj <= rc; dj++)
        for (let di = -rc; di <= rc; di++) {
          if ((di * di + dj * dj) * layer.cell * layer.cell > (layer.radius + layer.cell) ** 2) continue;
          const key = `${f.face}:${ci + di}:${cj + dj}`;
          needed.add(key);
          if (!layer.cells.has(key) && budget > 0) {
            const dist = Math.sqrt(di * di + dj * dj) * layer.cell;
            layer.cells.set(key, this.generate(layer, gen, f.face, ci + di, cj + dj, dist));
            layer.dirty = true;
            budget--;
          }
        }
      for (const k of layer.cells.keys()) if (!needed.has(k)) { layer.cells.delete(k); layer.dirty = true; }
      if (layer.dirty) this.rebuild(layer);
    }
    this.stats.cells = this.layers.reduce((a, l) => a + l.cells.size, 0);
  }

  private rebuild(layer: Layer) {
    layer.dirty = false;
    const counts = new Array(layer.kinds).fill(0);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const up = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), tiltAxis = new THREE.Vector3();
    const color = new THREE.Color();
    let total = 0;
    for (const items of layer.cells.values()) {
      for (const it of items) {
        const k = it.species;
        if (counts[k] >= layer.capacity) continue;
        const mesh = layer.meshes[k];
        up.set(it.ux, it.uy, it.uz);
        q.setFromUnitVectors(Y, up);
        q2.setFromAxisAngle(Y, it.rot);
        q.multiply(q2);
        if (it.tilt > 0) { tiltAxis.set(Math.cos(it.rot * 1.7), 0, Math.sin(it.rot * 1.7)); q.multiply(q2.setFromAxisAngle(tiltAxis, it.tilt)); }
        pos.set(it.x - this.anchor.x, it.y - this.anchor.y, it.z - this.anchor.z);
        scl.setScalar(it.s);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(counts[k], m4);
        color.setRGB(it.col[0], it.col[1], it.col[2]);
        mesh.setColorAt(counts[k], color);
        counts[k]++;
        total++;
      }
    }
    for (let k = 0; k < layer.kinds; k++) {
      const mesh = layer.meshes[k];
      mesh.count = counts[k];
      mesh.position.copy(this.anchor);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (layer.name === 'rocks' || layer.name === 'boulders') this.stats.rocks = total;
    else this.stats.plants = total;
  }

  dispose() {
    for (const l of this.layers) for (const m of l.meshes) m.dispose();
    this.rockMat.dispose();
    this.plantMat.dispose();
  }
}
