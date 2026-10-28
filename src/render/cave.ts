/**
 * Cave interiors: the tunnel traced by sim/caves.ts as a closed mesh seen
 * from inside, with speleothems (stalactites and stalagmites in solution
 * caves, icicles in ice caves, lavacicles in lava tubes). It is lit by:
 *  - sunlight, only along rays that pass through the skylight. The test is
 *    exact for the straight entrance passage (through the mouth, then out of
 *    the opening); there is no direct sun beyond the first bend;
 *  - skylight and light bounced off the skylight floor, fading with distance
 *    from the mouth;
 *  - the explorer's headlamp, which switches on inside;
 *  - glow-worm-like bioluminescence on the ceilings of living worlds.
 * The terrain shader cuts the mouth out of the skylight's far wall, using the
 * uniforms this class sets.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import type { SurfaceGenerator } from '../terrain/surface';
import { CaveIndex, floorAt, tunnelLocal, type Tunnel } from '../sim/caves';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { PRE_EXPOSURE_GLSL, PRE_EXPOSURE_TEX } from './exposure';
import { noise3 } from '../core/noise';
import { Rng } from '../core/rng';

const SEG = 36;
const KIND_CODE = { 'lava-tube': 0, ice: 1, karst: 2 } as const;

/** Section height above the floor at angle φ (lower half: an ellipse flattened into a floor). */
export function sectionPoint(rt: number, hc: number, phi: number, out: { x: number; y: number }) {
  const yc = 0.45 * hc, f = 0.12 * hc;
  const sn = Math.sin(phi);
  out.x = rt * Math.cos(phi);
  out.y = sn >= 0 ? yc + (hc - yc) * sn : yc * Math.max(0, (yc * (1 + sn) - f) / (yc - f));
  return out;
}

export function tunnelGeometry(t: Tunnel, R: number, origin: THREE.Vector3): THREE.BufferGeometry {
  const site = t.site;
  const rng = new Rng(site.seed ^ 0x2c1b3c6d);
  const kind = site.kind;
  const rough = kind === 'karst' ? 0.1 : kind === 'ice' ? 0.06 : 0.05;
  const pos: number[] = [], nor: number[] = [], sArr: number[] = [], part: number[] = [];
  const idx: number[] = [];
  const sp = { x: 0, y: 0 };
  const C = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), p = new THREE.Vector3();
  const frame = (i: number) => {
    up.fromArray(t.dir[i]);
    fwd.fromArray(t.fwd[i]);
    side.crossVectors(up, fwd);
    C.copy(up).multiplyScalar(R + t.floor[i]).sub(origin);
  };
  for (let i = 0; i < t.n; i++) {
    frame(i);
    const s = t.s[i], sc = t.scale[i];
    const rt = site.rt * sc, hc = site.hc * sc, yc = 0.45 * hc;
    const ramp = Math.min(1, Math.max(0, (s + 0.5) / 4)); // the mouth keeps the exact section (the terrain cut matches it)
    const bench = kind === 'lava-tube' ? Math.max(0, noise3(s / 15, 0.5, 0.5, site.seed) * 1.6) : 0;
    for (let k = 0; k < SEG; k++) {
      const phi = (2 * Math.PI * k) / SEG;
      sectionPoint(rt, hc, phi, sp);
      let x = sp.x, y = sp.y;
      const floorV = y < 0.02 * hc;
      // lava benches: a ledge along the lower walls where the flow level stood
      if (bench > 0 && y > 0.18 * hc && y < 0.42 * hc) x *= 1 - 0.1 * bench * Math.sin(((y / hc - 0.18) / 0.24) * Math.PI);
      let n = noise3(s * 0.35, Math.cos(phi) * 1.5, Math.sin(phi) * 1.5, site.seed) + 0.5 * noise3(s * 1.1, Math.cos(phi) * 4, Math.sin(phi) * 4, site.seed + 1);
      if (kind !== 'lava-tube') n = Math.abs(n) * 1.4 - 0.4; // scalloped by dissolution or melting
      const k2 = (floorV ? 0.2 : 1) * rough * ramp;
      x *= 1 + k2 * n;
      y = floorV ? y + k2 * n * 0.5 : yc + (y - yc) * (1 + k2 * n);
      p.copy(C).addScaledVector(side, x).addScaledVector(up, y);
      pos.push(p.x, p.y, p.z);
      nor.push(0, 0, 0);
      sArr.push(s);
      part.push(0);
    }
  }
  for (let i = 0; i + 1 < t.n; i++)
    for (let k = 0; k < SEG; k++) {
      const a = i * SEG + k, b = i * SEG + ((k + 1) % SEG), c = (i + 1) * SEG + k, d = (i + 1) * SEG + ((k + 1) % SEG);
      idx.push(a, c, b, b, c, d);
    }
  // end choke: close the last ring with a fan
  {
    const i = t.n - 1;
    frame(i);
    const hc = site.hc * t.scale[i];
    p.copy(C).addScaledVector(up, 0.45 * hc).addScaledVector(fwd, 0.5);
    const centre = pos.length / 3;
    pos.push(p.x, p.y, p.z); nor.push(0, 0, 0); sArr.push(t.s[i] + 0.5); part.push(0);
    for (let k = 0; k < SEG; k++) idx.push(i * SEG + k, centre, i * SEG + ((k + 1) % SEG));
  }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tube.setIndex(idx);
  tube.computeVertexNormals();
  // faces must look inward: the ceiling's normal points down
  {
    const i = Math.min(t.n - 2, 4), k = SEG / 4;
    frame(i);
    const nrm = new THREE.Vector3().fromArray(tube.attributes.normal.array as Float32Array, (i * SEG + k) * 3);
    if (nrm.dot(up) > 0) {
      for (let q = 0; q < idx.length; q += 3) { const tmp = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = tmp; }
      tube.setIndex(idx);
      tube.computeVertexNormals();
    }
  }
  const tubeNor = tube.attributes.normal.array as Float32Array;
  // speleothems
  const cones: { geo: THREE.BufferGeometry; s: number }[] = [];
  const chance = kind === 'karst' ? 0.6 : kind === 'ice' ? 0.45 : 0.3;
  const m = new THREE.Matrix4(), basis = new THREE.Matrix4();
  for (let i = 2; i < t.n - 6; i++) {
    if (t.s[i] < 3 || !rng.chance(chance)) continue;
    frame(i);
    basis.makeBasis(side, up, fwd);
    const rt = site.rt * t.scale[i], hc = site.hc * t.scale[i], yc = 0.45 * hc;
    const count = rng.int(1, 3);
    for (let c = 0; c < count; c++) {
      const v = rng.range(-0.6, 0.6) * rt;
      const ceil = yc + (hc - yc) * Math.sqrt(Math.max(0, 1 - (v / rt) ** 2));
      // power-law lengths: many small, a few large
      const L = (kind === 'karst' ? 2.4 : kind === 'ice' ? 1.3 : 0.3) * Math.pow(rng.next(), 2.2) + (kind === 'lava-tube' ? 0.04 : 0.15);
      const r0 = L * (kind === 'lava-tube' ? 0.25 : kind === 'ice' ? 0.12 : 0.16);
      const g = speleothem(r0, L, rng.next());
      g.rotateX(Math.PI); // tip down
      g.translate(v, ceil + 0.05 - L / 2, rng.range(-0.6, 0.6)); // base set into the ceiling
      m.copy(basis).setPosition(C);
      g.applyMatrix4(m);
      cones.push({ geo: g, s: t.s[i] });
      if (kind === 'karst' && Math.abs(v) > 0.35 * rt && rng.chance(0.5)) {
        const H = Math.min(L * rng.range(0.4, 0.9), hc * 0.3);
        const f = speleothem(H * 0.3, H, rng.next());
        f.translate(v, floorAt(rt, hc, v) + H / 2 - 0.05, 0);
        f.applyMatrix4(m);
        cones.push({ geo: f, s: t.s[i] });
      }
    }
  }
  // merge
  let nv = pos.length / 3;
  const allPos = Array.from(pos), allNor = Array.from(tubeNor), allS = sArr, allPart = part, allIdx = idx.slice();
  for (const { geo, s } of cones) {
    const gp = geo.attributes.position.array as Float32Array, gn = geo.attributes.normal.array as Float32Array;
    for (let q = 0; q < gp.length; q++) { allPos.push(gp[q]); allNor.push(gn[q]); }
    const cnt = gp.length / 3;
    for (let q = 0; q < cnt; q++) { allS.push(s); allPart.push(1); }
    const gi = geo.index!;
    for (let q = 0; q < gi.count; q++) allIdx.push(nv + gi.getX(q));
    nv += cnt;
    geo.dispose();
  }
  tube.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(allNor, 3));
  out.setAttribute('aS', new THREE.Float32BufferAttribute(allS, 1));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(allPart, 1));
  out.setIndex(allIdx);
  out.computeBoundingSphere();
  return out;
}

/**
 * A speleothem centred on the origin, apex at +L/2 (as ConeGeometry): a broad
 * base tapering with growth ripples to a thin "soda straw" tip.
 */
function speleothem(r0: number, L: number, ph: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = r0 * (Math.pow(1 - t, 1.5) * (1 + 0.2 * Math.sin(t * 11 + ph * 6.28)) + 0.07);
    pts.push(new THREE.Vector2(r, -L / 2 + t * L));
  }
  const g = new THREE.LatheGeometry(pts, 8);
  g.deleteAttribute('uv');
  return g;
}

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aS;
attribute float aPart;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying float vS;
varying float vPart;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vLocal = position;
  vS = aS;
  vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${PRE_EXPOSURE_GLSL}
uniform vec3 uAlbedo;
uniform float uKind;     // 0 lava tube, 1 ice, 2 karst
uniform vec3 uSunDir;    // world
uniform vec3 uSunE;      // sun illuminance at the surface
uniform vec3 uSkyE;      // skylight + skylight-floor bounce entering the mouth
uniform vec3 uO, uU, uV, uUp; // site frame (camera-relative world)
uniform vec4 uPit;       // ramp length, floor length to the mouth, half-width, depth
uniform vec2 uSec;       // tunnel half-width, ceiling height
uniform vec4 uLamp;      // headlamp direction (world) and illuminance at 1 m
uniform float uGlow;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying float vS;
varying float vPart;

bool inSec(float v, float y, float rt, float hc) {
  float yc = 0.45 * hc;
  if (y < -0.3 || abs(v) > rt) return false;
  if (y <= yc) return true;
  float a = v / rt, b = (y - yc) / (hc - yc);
  return a * a + b * b < 1.0;
}

// can the sun be seen from P? (through the mouth, then out of the skylight)
float sunVisible(vec3 P) {
  vec3 d = P - uO;
  float pu = dot(d, uU), pv = dot(d, uV), py = dot(d, uUp);
  float Lu = dot(uSunDir, uU), Lv = dot(uSunDir, uV), Ly = dot(uSunDir, uUp);
  if (Ly <= 0.01) return 0.0;
  float lf = uPit.y;
  if (pu > lf - 0.5) {
    if (pu > lf + 4.0 * uSec.x || Lu >= -1e-3) return 0.0;
    float t1 = (lf - pu) / Lu;
    if (!inSec(pv + t1 * Lv, py + t1 * Ly, uSec.x * 0.97, uSec.y * 0.97)) return 0.0;
  }
  float t2 = (uPit.w - py) / Ly;
  float u2 = pu + t2 * Lu, v2 = pv + t2 * Lv;
  return step(-uPit.x, u2) * step(u2, lf) * step(abs(v2), uPit.z);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 P = vWorld;
  float dist = length(P);
  vec3 V = -P / max(dist, 1e-4);
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;
  float n1 = gnoise(vLocal * 0.9), n2 = gnoise(vLocal * 4.0);
  vec3 alb = uAlbedo * (0.8 + 0.25 * n1 + 0.1 * n2);
  float upN = dot(N, uUp);
  float spec = 0.0;
  if (uKind < 0.5) {
    // basalt glaze on the walls, ropy pahoehoe on the floor
    spec = 0.3 * smoothstep(0.1, 0.8, n2 * 0.5 + 0.5);
    if (upN > 0.6) alb *= 0.85 + 0.3 * smoothstep(-0.2, 0.6, sin(dot(vLocal, uU) * 3.0 + n1 * 4.0));
  } else if (uKind < 1.5) {
    alb = mix(alb, vec3(0.42, 0.68, 0.92), 0.45 + 0.25 * n1);
    spec = 0.6;
  } else {
    // flowstone banding, damp sheen
    alb *= 0.85 + 0.2 * sin(dot(vLocal, uUp) * 6.0 + n1 * 3.0);
    spec = 0.25 + 0.2 * vPart;
  }
  vec3 color = vec3(0.0);
  float vis = sunVisible(P);
  float NdotL = max(dot(N, uSunDir), 0.0);
  vec3 H = normalize(uSunDir + V);
  color += uSunE * vis * NdotL * (alb / PI + spec * 0.5 * pow(max(dot(N, H), 0.0), 60.0));
  float fade = exp(-max(vS, 0.0) / (1.6 * uSec.x));
  color += alb / PI * uSkyE * fade * (0.65 - 0.25 * upN);
  // headlamp at the eye
  float cosA = dot(-V, uLamp.xyz);
  float spot = smoothstep(0.78, 0.96, cosA) + 0.05;
  float E = uLamp.w * spot / (dist * dist + 0.25);
  float NdotV = max(dot(N, V), 0.0);
  color += vec3(1.0, 0.95, 0.86) * E * (alb / PI * NdotV + spec * 0.3 * pow(NdotV, 40.0));
  // glow-worm lights on the ceilings of living worlds
  if (uGlow > 0.0 && upN < -0.3) {
    vec3 c = floor(vLocal * 2.5), f = fract(vLocal * 2.5) - 0.5;
    float h = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float d = smoothstep(0.12, 0.0, length(f)) * step(0.8, h);
    color += vec3(0.25, 0.85, 0.75) * uGlow * d * (0.7 + 0.3 * sin(uTime * (0.5 + h) + h * 30.0)) * 3e-6;
  }
  gl_FragColor = vec4(min(color * uPreExposure, vec3(6e4)), 1.0);
}
`;

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class CaveRenderer {
  readonly group = new THREE.Group();
  readonly index: CaveIndex;
  private mesh: THREE.Mesh | null = null;
  private tunnel: Tunnel | null = null;
  readonly material: THREE.ShaderMaterial;
  private origin = new THREE.Vector3();
  /** the camera is inside the tunnel (precipitation and wind stop; the headlamp is on) */
  cameraInside = false;
  /** distance of the camera from the active skylight (m), or Infinity */
  distance = Infinity;

  constructor(readonly body: Body, gen: SurfaceGenerator) {
    this.index = new CaveIndex(gen);
    const pl = body.planet!;
    const pal = pl.surface!.palette;
    const kind = pl.surface!.caveKind ?? 'lava-tube';
    const rock = new THREE.Color(pal.rockA[0], pal.rockA[1], pal.rockA[2]);
    const albedo = kind === 'karst' ? new THREE.Color(0.55, 0.5, 0.42).lerp(rock, 0.2)
      : kind === 'ice' ? new THREE.Color(0.7, 0.8, 0.88)
      : rock.multiplyScalar(0.7);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uAlbedo: { value: albedo }, uKind: { value: KIND_CODE[kind] },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunE: { value: new THREE.Vector3() }, uSkyE: { value: new THREE.Vector3() },
        uO: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uV: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() },
        uPit: { value: new THREE.Vector4() }, uSec: { value: new THREE.Vector2() }, uLamp: { value: new THREE.Vector4() },
        uGlow: { value: pl.life.kind !== 'none' && pl.life.bioluminescence > 0.2 ? pl.life.bioluminescence : 0 }, uTime: { value: 0 },
        tPreExposure: PRE_EXPOSURE_TEX,
      },
    });
  }

  /**
   * camBody: camera (planet-fixed); rel/rot: planet centre and orientation in
   * the camera-relative world; sunW/sunE: sun direction (world) and its
   * illuminance; camFwd: camera forward (world); terrain: the terrain
   * material's uniforms (for the mouth cut).
   */
  update(camBody: THREE.Vector3, rel: THREE.Vector3, rot: THREE.Quaternion, sunW: THREE.Vector3 | null, sunE: THREE.Vector3, hasAir: boolean,
    camFwd: THREE.Vector3, time: number, terrain: Record<string, THREE.IUniform>) {
    const R = this.index.gen.R;
    let best: Tunnel | null = null, bd = Infinity;
    if (camBody.length() - R < 3000) {
      for (const t of this.index.near(camBody.x, camBody.y, camBody.z, 400)) {
        const d = _v.fromArray(t.site.dir).multiplyScalar(R + t.floor0).distanceTo(camBody);
        if (d < bd) { bd = d; best = t; }
      }
    }
    this.distance = bd;
    if (!best || bd > 350) {
      this.group.visible = false;
      this.cameraInside = false;
      if (terrain.uCaveOn) terrain.uCaveOn.value = 0;
      return;
    }
    if (best !== this.tunnel) {
      this.tunnel = best;
      this.origin.fromArray(best.site.dir).multiplyScalar(R + best.floor0);
      if (this.mesh) { this.mesh.geometry.dispose(); this.group.remove(this.mesh); }
      this.mesh = new THREE.Mesh(tunnelGeometry(best, R, this.origin), this.material);
      this.mesh.frustumCulled = false;
      this.mesh.userData.noShadow = true;
      this.mesh.position.copy(this.origin);
      this.group.add(this.mesh);
    }
    this.group.visible = true;
    const t = this.tunnel!, site = t.site;
    const u = this.material.uniforms;
    const toW = (a: [number, number, number], out: THREE.Vector3) => out.fromArray(a).applyQuaternion(rot);
    (u.uO.value as THREE.Vector3).copy(this.origin).applyQuaternion(rot).add(rel);
    toW(site.U, u.uU.value); toW(site.V, u.uV.value); toW(site.dir, u.uUp.value);
    (u.uPit.value as THREE.Vector4).set(site.lr, site.lf, site.w, site.depth);
    (u.uSec.value as THREE.Vector2).set(site.rt, site.hc);
    const upW = u.uUp.value as THREE.Vector3;
    const muS = sunW ? sunW.dot(upW) : -1;
    if (sunW) u.uSunDir.value.copy(sunW);
    const day = Math.min(1, Math.max(0, (muS + 0.02) / 0.07));
    (u.uSunE.value as THREE.Vector3).copy(sunE).multiplyScalar(day);
    // skylight through the opening and sunlight bounced off the skylight floor
    (u.uSkyE.value as THREE.Vector3).copy(sunE).multiplyScalar((hasAir ? 0.1 : 0.004) * Math.max(muS + 0.1, 0) + 0.06 * Math.max(muS, 0));
    const loc = tunnelLocal(t, R, camBody.x, camBody.y, camBody.z);
    this.cameraInside = loc.inside && loc.s > 0.5;
    // headlamp: ~1000 cd (illuminance in units of the solar constant at 1 m)
    (u.uLamp.value as THREE.Vector4).set(camFwd.x, camFwd.y, camFwd.z, loc.inside || (loc.s < 1 && loc.y < site.depth - 2 && Math.abs(loc.v) < site.w) ? 8e-3 : 0);
    u.uTime.value = time % 1000;
    // the mouth cut in the terrain (only up close, where the terrain mesh is fine enough)
    if (terrain.uCaveOn) {
      terrain.uCaveOn.value = bd < 200 ? 1 : 0;
      (terrain.uCaveO.value as THREE.Vector3).copy(u.uO.value);
      (terrain.uCaveU.value as THREE.Vector3).copy(u.uU.value);
      (terrain.uCaveV.value as THREE.Vector3).copy(u.uV.value);
      (terrain.uCaveUp.value as THREE.Vector3).copy(upW);
      (terrain.uCaveDim.value as THREE.Vector4).set(site.lf, site.wall, site.rt, site.hc);
    }
    void _q;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.material.dispose();
  }
}
