// How vehicles look: the Kenney bodies with their paint, glass and lamps
// found by colour, procedural bikes, helicopters and the plane, one shader
// for every body (paint colour, glass, head/tail/brake lights, light bars and
// the burnt-out look are uniforms, so one draw call per vehicle), and
// instanced wheels and contact shadows for the whole fleet.
//
//   vehicleMaterial()            -> a material for one vehicle (its own uniforms; the program is shared)
//   visualFor(def)               -> cached { body, extras:{rotor, tail, prop}, wheels:[...], box, ... } (studs)
//   new InstBank(scene, geo, mat, cap)   begin() / push(matrix, shade) / end()
//   wheelBank(key) -> InstBank   shadowBank() -> InstBank
//   debrisGeometry(name)         -> scaled Kenney debris (studs)
//
// Model space everywhere: +z forward, +y up, +x is the vehicle's LEFT, origin
// on the ground under the middle of the wheelbase.
import * as THREE from 'three';
import { modelParts, modelGeometry, hasModel } from '../assets/models.js';

/** Part ids in the aPart attribute. */
export const PART = { BASE: 0, PAINT: 1, GLASS: 2, HEAD: 3, TAIL: 4, SIREN_R: 5, SIREN_B: 6, CHROME: 7, GLOW: 8, DARK: 9 };

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

// ---- the shader --------------------------------------------------------------------------------------------------------
/** A body material with its own uniforms: paint, lights (head, tail/brake, siren red, siren blue), glow, burnt, dirt. */
export function vehicleMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 });
  const u = {
    uPaint: { value: new THREE.Color(1, 1, 1) },
    uLights: { value: new THREE.Vector4(0, 0.35, 0, 0) },
    uGlow: { value: 1 },
    uBurnt: { value: 0 },
    uDirt: { value: 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vPart;
uniform vec3 uPaint; uniform vec4 uLights; uniform float uGlow; uniform float uBurnt; uniform float uDirt;
float isP(float p, float id) { return 1.0 - step(0.5, abs(p - id)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float vp = vPart;
float pPaint = isP(vp, 1.0), pGlass = isP(vp, 2.0), pChrome = isP(vp, 7.0), pDark = isP(vp, 9.0);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uPaint, pPaint);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.026, 0.034) + diffuseColor.rgb * 0.05, pGlass);
diffuseColor.rgb *= 1.0 - uDirt * 0.35;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.032, 0.029, 0.027) * (0.7 + 0.6 * fract(sin(dot(floor(vViewPosition.xy * 3.0), vec2(12.9898, 78.233))) * 43758.5453)), uBurnt);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.26 + uDirt * 0.4, pPaint);
roughnessFactor = mix(roughnessFactor, 0.04, pGlass);
roughnessFactor = mix(roughnessFactor, 0.18, pChrome);
roughnessFactor = mix(roughnessFactor, 0.85, pDark);
roughnessFactor = mix(roughnessFactor, 0.97, uBurnt);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.5, pPaint);
metalnessFactor = mix(metalnessFactor, 0.0, pGlass);
metalnessFactor = mix(metalnessFactor, 1.0, pChrome);
metalnessFactor *= 1.0 - uBurnt;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float lit = 1.0 - uBurnt;
totalEmissiveRadiance += vec3(1.0, 0.9, 0.72) * uLights.x * isP(vp, 3.0) * lit;
totalEmissiveRadiance += vec3(1.0, 0.05, 0.03) * uLights.y * isP(vp, 4.0) * lit;
totalEmissiveRadiance += vec3(1.0, 0.04, 0.04) * uLights.z * isP(vp, 5.0) * lit;
totalEmissiveRadiance += vec3(0.08, 0.22, 1.0) * uLights.w * isP(vp, 6.0) * lit;
totalEmissiveRadiance += vColor.rgb * uGlow * isP(vp, 8.0) * lit;`);
  };
  m.customProgramCacheKey = () => 'vc-vehicle-1';
  return m;
}

let wheelMat = null, debrisMat = null;
export function wheelMaterial() {
  if (!wheelMat) wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.15 });
  return wheelMat;
}
export function debrisMaterial() {
  if (!debrisMat) debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2725, roughness: 0.95, metalness: 0.1 });
  return debrisMat;
}

// ---- colour helpers -----------------------------------------------------------------------------------------------------
function srgb(r, g, b) { _c.setRGB(r, g, b); _c.convertLinearToSRGB(); return [_c.r * 255, _c.g * 255, _c.b * 255]; }
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ---- Kenney bodies --------------------------------------------------------------------------------------------------------
/**
 * Split a Kenney body into parts by colour: lamps at the very front and back,
 * glass (pale blue), the light bar (inside the type's siren boxes) and the
 * paint (the biggest family of saturated colour, or white), stored as a
 * brightness ratio so the shader can paint it any colour.
 */
function kenneyBody(def) {
  const S = def.scale;
  const parts = modelParts(def.model);
  const body = parts.find((p) => p.name === 'body');
  const extra = [];
  const wheels = [];
  for (const p of parts) {
    if (p.name === 'body') continue;
    const bb = p.geometry.boundingBox;
    if (Math.abs(p.pivot.x) < 0.05) { extra.push(p); continue; } // the spare wheel on the SUV's tailgate
    wheels.push({
      key: def.model + ':' + p.name, geo: p.geometry, x: p.pivot.x * S, y: p.pivot.y * S, z: p.pivot.z * S,
      r: ((bb.max.y - bb.min.y) / 2) * S, w: (bb.max.x - bb.min.x) * S, left: p.pivot.x > 0, front: p.pivot.z > 0, scale: S,
    });
  }
  const src = body.geometry.toNonIndexed();
  const merged = [src];
  for (const p of extra) { const g = p.geometry.toNonIndexed(); g.translate(p.pivot.x, p.pivot.y, p.pivot.z); merged.push(g); }
  // concatenate
  let n = 0; for (const g of merged) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), part = new Float32Array(n);
  let o = 0;
  for (const g of merged) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  // bounds (model units)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const L = z1 - z0;
  // per triangle: colour, centroid, normal, area
  const T = n / 3, tri = [];
  for (let t = 0; t < T; t++) {
    const a = t * 9;
    const r = (col[a] + col[a + 3] + col[a + 6]) / 3, g = (col[a + 1] + col[a + 4] + col[a + 7]) / 3, b = (col[a + 2] + col[a + 5] + col[a + 8]) / 3;
    const [R, G, B] = srgb(r, g, b);
    const cx = (pos[a] + pos[a + 3] + pos[a + 6]) / 3, cy = (pos[a + 1] + pos[a + 4] + pos[a + 7]) / 3, cz = (pos[a + 2] + pos[a + 5] + pos[a + 8]) / 3;
    const ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2];
    const vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    tri.push({ R, G, B, hsv: hsv(R, G, B), cx, cy, cz, nx: nx / l, ny: ny / l, nz: nz / l, area: l / 2, part: 0 });
  }
  const inBox = (t, bx) => t.cx >= bx[0] && t.cx <= bx[3] && t.cy >= bx[1] && t.cy <= bx[4] && t.cz >= bx[2] && t.cz <= bx[5];
  const isGlass = (t) => (t.B >= 225 && t.G - t.R >= 8 && t.R >= 150) || (t.B >= 244 && t.G - t.R >= 3 && t.B - t.R >= 5);
  // 1. lamps, light bars and glass
  for (const t of tri) {
    if (def.sirenBoxes && def.sirenBoxes.some((bx) => inBox(t, bx))) {
      if (t.R > 170 && t.G < 130 && t.R > t.B * 1.5) { t.part = PART.SIREN_R; continue; }
      if (t.B > 170 && t.R < 140 && t.B > t.R * 1.4) { t.part = PART.SIREN_B; continue; }
    }
    if (t.cz > z1 - L * 0.07 && t.nz > 0.3 && t.R > 235 && t.G > 170 && t.B < 170) { t.part = PART.HEAD; continue; }
    if (t.cz < z0 + L * 0.07 && t.nz < -0.3 && t.R > 175 && t.G < 125 && t.B < 115) { t.tailish = true; }
    if (isGlass(t)) { t.part = PART.GLASS; continue; }
  }
  // 2. the paint: the biggest saturated colour family (or white)
  let paintHue = null, paintV = 1, paintWhite = false;
  if (def.paints) {
    const bins = new Float32Array(36);
    let total = 0;
    for (const t of tri) { total += t.area; if (t.part || t.tailish) continue; const [h, s, v] = t.hsv; if (s > 0.3 && v > 0.3) bins[Math.floor(h / 10) % 36] += t.area; }
    let bi = 0; for (let i = 1; i < 36; i++) if (bins[i] + bins[(i + 35) % 36] * 0.5 + bins[(i + 1) % 36] * 0.5 > bins[bi] + bins[(bi + 35) % 36] * 0.5 + bins[(bi + 1) % 36] * 0.5) bi = i;
    const fam = bins[bi] + bins[(bi + 35) % 36] + bins[(bi + 1) % 36];
    if (fam > total * 0.08) {
      // refine: area-weighted mean hue of the family
      let sw = 0, sh = 0, sv = 0;
      for (const t of tri) { if (t.part || t.tailish) continue; const [h, s, v] = t.hsv; if (s > 0.3 && hueDist(h, bi * 10 + 5) < 16) { sw += t.area; sh += t.area * (hueDist(h, bi * 10 + 5) * Math.sign(((h - (bi * 10 + 5) + 540) % 360) - 180)); sv += t.area * v; } }
      paintHue = (bi * 10 + 5 + sh / sw + 360) % 360; paintV = sv / sw;
    } else { paintWhite = true; paintV = 0.88; }
    for (const t of tri) {
      if (t.part) continue;
      const [h, s, v] = t.hsv;
      const isPaint = paintWhite ? (s < 0.12 && v > 0.78) : (s > 0.28 && hueDist(h, paintHue) < 18);
      if (t.tailish && !(isPaint && t.G > 80)) { t.part = PART.TAIL; continue; }
      if (isPaint) { t.part = PART.PAINT; t.ratio = Math.min(1.25, Math.max(0.55, v / paintV)); }
    }
  } else {
    for (const t of tri) if (!t.part && t.tailish) t.part = PART.TAIL;
  }
  // 3. write back: part ids; paint keeps only its shading; scale to studs
  for (let t = 0; t < T; t++) {
    const p = tri[t].part;
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      part[i] = p;
      if (p === PART.PAINT) { const r = tri[t].ratio; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = r; }
      pos[i * 3] *= S; pos[i * 3 + 1] *= S; pos[i * 3 + 2] *= S;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  const out = { body: geo, wheels, bounds: { x0: x0 * S, x1: x1 * S, y0: y0 * S, y1: y1 * S, z0: z0 * S, z1: z1 * S } };
  // a procedural light bar (ambulance, fire engine)
  if (def.lightBar) {
    const [bx, by, bz, bw] = def.lightBar;
    const b = new Builder();
    b.box(bx * S, by * S + 0.35, bz * S, bw * S, 0.7, 1.1, 0x2a2c30, PART.DARK);
    b.box(bx * S + bw * S * 0.25, by * S + 0.75, bz * S, bw * S * 0.46, 0.5, 0.95, 0xff3030, PART.SIREN_R);
    b.box(bx * S - bw * S * 0.25, by * S + 0.75, bz * S, bw * S * 0.46, 0.5, 0.95, 0x3060ff, PART.SIREN_B);
    out.body = mergeGeos([out.body, b.geometry()]);
    out.bounds.y1 = Math.max(out.bounds.y1, by * S + 1.0);
  }
  return out;
}

// ---- a tiny builder for the procedural models -----------------------------------------------------------------------------
/** Merges primitives into one non-indexed, flat-shaded geometry with colour and part attributes. */
export class Builder {
  constructor() { this.geos = []; }
  /** Add a geometry with a transform (position, Euler rotation, scale), an sRGB colour and a part id. */
  add(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff, part = 0, shade = 1) {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    ng.applyMatrix4(_m);
    ng.deleteAttribute('uv');
    ng.computeVertexNormals();
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3), prt = new Float32Array(n);
    if (part === PART.PAINT) { col.fill(shade); } else { _c.set(color); for (let i = 0; i < n; i++) { col[i * 3] = _c.r * shade; col[i * 3 + 1] = _c.g * shade; col[i * 3 + 2] = _c.b * shade; } }
    prt.fill(part);
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ng.setAttribute('aPart', new THREE.BufferAttribute(prt, 1));
    this.geos.push(ng);
    g.dispose?.();
    return this;
  }
  box(x, y, z, w, h, l, color, part = 0, rx = 0, ry = 0, rz = 0, shade = 1) { return this.add(new THREE.BoxGeometry(w, h, l), x, y, z, rx, ry, rz, 1, 1, 1, color, part, shade); }
  /** A cylinder between two points. */
  rod(ax, ay, az, bx, by, bz, r0, r1, color, part = 0, seg = 8) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
    const g = new THREE.CylinderGeometry(r1, r0, L, seg);
    const ng = g.toNonIndexed();
    _q.setFromUnitVectors(_v.set(0, 1, 0), _s.set(dx / L, dy / L, dz / L));
    _m.compose(_v.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, 1, 1));
    ng.applyMatrix4(_m);
    return this.add(ng, 0, 0, 0, 0, 0, 0, 1, 1, 1, color, part);
  }
  geometry() { return mergeGeos(this.geos); }
}

function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), part = new Float32Array(n);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3); part.set(g.attributes.aPart.array, o);
    o += c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

function boundsOf(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
}

/** A wheel: tyre, rim and hub, axle along x, centred on its pivot. */
function wheelGeo(r, w, rimColor = 0xb8bcc4, tyreColor = 0x26272b, seg = 16) {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(r, r, w, seg), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1, tyreColor, PART.DARK);
  b.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 1.04, seg), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1, rimColor, PART.CHROME);
  b.add(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 1.12, 8), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1, 0x55585e, PART.BASE);
  return b.geometry();
}

// ---- procedural models -----------------------------------------------------------------------------------------------------
const DARK = 0x222327, GREY = 0x5c6068, METAL = 0x9aa0a8, BLACK = 0x111214, WHITE = 0xf2f2f0;

function sportbike() {
  const b = new Builder(), P = PART.PAINT;
  const R = 1.2;
  // engine, frame, swingarm
  b.box(0, 1.55, -0.1, 1.1, 1.3, 2.0, GREY, PART.BASE);
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 8), 0, 1.25, 0.55, 0, 0, Math.PI / 2, 1, 1, 1, METAL, PART.CHROME);
  b.rod(0, 2.6, 1.55, 0, 1.6, -0.9, 0.18, 0.18, GREY, PART.BASE, 6);
  b.rod(0.35, 1.3, -0.6, 0.35, R, -2.4, 0.13, 0.11, GREY, PART.BASE, 6);
  b.rod(-0.35, 1.3, -0.6, -0.35, R, -2.4, 0.13, 0.11, GREY, PART.BASE, 6);
  // forks and bars
  b.rod(0.33, R, 2.35, 0.3, 3.15, 1.75, 0.12, 0.14, METAL, PART.CHROME, 6);
  b.rod(-0.33, R, 2.35, -0.3, 3.15, 1.75, 0.12, 0.14, METAL, PART.CHROME, 6);
  b.rod(0.85, 3.05, 1.55, -0.85, 3.05, 1.55, 0.09, 0.09, BLACK, PART.DARK, 6);
  // the fairing, tank, seat and tail
  b.add(new THREE.CylinderGeometry(0.45, 0.85, 1.7, 4, 1), 0, 2.55, 1.95, Math.PI / 2 + 0.55, Math.PI / 4, 0, 1, 1, 0.9, 0, P, 1);
  b.add(new THREE.CylinderGeometry(0.6, 0.7, 1.7, 6), 0, 2.55, 0.55, Math.PI / 2 - 0.12, 0, 0, 1.15, 1, 0.75, 0, P, 1.08);
  b.box(0, 2.5, -0.85, 0.8, 0.28, 1.5, BLACK, PART.DARK);
  b.add(new THREE.CylinderGeometry(0.2, 0.55, 1.5, 4, 1), 0, 2.72, -1.95, -Math.PI / 2 - 0.18, Math.PI / 4, 0, 1, 1, 0.9, 0, P, 0.95);
  b.box(0, 1.55, 1.2, 1.0, 0.8, 1.1, 0, P, 0.2, 0, 0, 0.85); // belly pan
  // screen, lamps, exhaust, mudguard
  b.box(0, 3.15, 1.95, 0.8, 0.7, 0.08, 0xd4ecff, PART.GLASS, -0.75);
  b.box(0, 2.45, 2.62, 0.55, 0.28, 0.12, 0xfff2c0, PART.HEAD, -0.4);
  b.box(0, 2.8, -2.7, 0.45, 0.16, 0.1, 0xff2020, PART.TAIL);
  b.rod(-0.55, 1.0, -0.2, -0.55, 1.75, -2.2, 0.2, 0.26, METAL, PART.CHROME, 8);
  b.box(0, R + 0.95, 2.3, 0.55, 0.12, 1.3, 0, P, 0.15, 0, 0, 0.9);
  const body = b.geometry();
  const wg = wheelGeo(R, 0.62, 0x2d2f33, 0x1c1c1f, 18);
  return { body, bounds: boundsOf(body), wheels: [
    { key: 'proc:bikewheel', geo: wg, x: 0, y: R, z: 2.35, r: R, w: 0.62, front: true, left: false, scale: 1 },
    { key: 'proc:bikewheel', geo: wg, x: 0, y: R, z: -2.4, r: R, w: 0.7, front: false, left: false, scale: 1 },
  ] };
}

function scooter() {
  const b = new Builder(), P = PART.PAINT;
  const R = 0.85;
  b.box(0, 1.05, 0.15, 1.05, 0.25, 1.9, 0, P, 0, 0, 0, 0.82);                                  // floorboard
  b.add(new THREE.SphereGeometry(1, 10, 7), 0, 1.75, -1.35, 0, 0, 0, 0.72, 0.68, 1.15, 0, P, 1);  // rear body
  b.box(0, 2.0, 1.25, 1.1, 2.0, 0.28, 0, P, -0.22, 0, 0, 1.02);                                 // leg shield
  b.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, R + 0.35, 1.75, 0, 0, 0, 0.45, 0.5, 0.75, 0, P, 0.95); // front mudguard
  b.rod(0, R, 1.75, 0, 3.15, 1.35, 0.11, 0.13, METAL, PART.CHROME, 6);                          // steering column
  b.rod(0.75, 3.2, 1.3, -0.75, 3.2, 1.3, 0.08, 0.08, DARK, PART.DARK, 6);                        // bars
  b.box(0, 3.25, 1.42, 0.62, 0.42, 0.4, 0, P, 0, 0, 0, 1);                                      // headset
  b.box(0, 3.25, 1.64, 0.32, 0.24, 0.06, 0xfff2c0, PART.HEAD);
  b.box(0, 2.32, -1.05, 0.78, 0.26, 1.6, 0x3a2a22, PART.DARK);                                   // seat
  b.box(0, 1.85, -2.55, 0.4, 0.18, 0.08, 0xff2020, PART.TAIL);
  b.box(0, 2.0, -2.35, 0.9, 0.12, 0.6, METAL, PART.CHROME);                                     // rack
  b.rod(-0.4, 0.75, -0.5, -0.45, 0.85, -2.2, 0.14, 0.16, METAL, PART.CHROME, 6);                 // exhaust
  const body = b.geometry();
  const wg = wheelGeo(R, 0.5, 0xd0d4da, 0x1c1c1f, 14);
  return { body, bounds: boundsOf(body), wheels: [
    { key: 'proc:scooterwheel', geo: wg, x: 0, y: R, z: 1.75, r: R, w: 0.5, front: true, left: false, scale: 1 },
    { key: 'proc:scooterwheel', geo: wg, x: 0, y: R, z: -1.75, r: R, w: 0.5, front: false, left: false, scale: 1 },
  ] };
}

function heli(def) {
  const b = new Builder();
  const police = def.livery === 'police';
  const MAIN = police ? 0x1d2742 : 0, P = police ? PART.BASE : PART.PAINT;
  const STRIPE = police ? WHITE : 0x1d2742;
  // cabin
  b.add(new THREE.SphereGeometry(1, 12, 9), 0, 4.6, 1.6, 0, 0, 0, 3.5, 3.3, 5.6, MAIN, P, 1);
  b.add(new THREE.SphereGeometry(1, 12, 9, Math.PI / 2 - 1.05, 2.1, 0.32, 1.25), 0, 4.62, 1.62, 0, 0, 0, 3.56, 3.36, 5.66, 0xd4ecff, PART.GLASS);
  b.add(new THREE.SphereGeometry(1, 12, 9, -Math.PI / 2 - 0.6, 1.2, 0.5, 0.75), 0, 4.62, 1.62, 0, 0, 0, 3.56, 3.36, 5.66, 0xd4ecff, PART.GLASS); // side windows
  b.add(new THREE.SphereGeometry(1, 12, 9, Math.PI / 2 + 1.4, 1.2, 0.5, 0.75), 0, 4.62, 1.62, 0, 0, 0, 3.56, 3.36, 5.66, 0xd4ecff, PART.GLASS);
  b.box(0, 3.1, 1.2, 6.4, 0.6, 7.0, STRIPE, PART.BASE, 0, 0, 0, 1);                             // belly stripe
  // engine deck and mast
  b.box(0, 7.4, -1.0, 2.8, 1.5, 5.2, MAIN, P, 0, 0, 0, 0.92);
  b.box(0, 7.0, -3.6, 2.2, 1.0, 1.6, GREY, PART.BASE);
  b.rod(0, 7.9, -0.6, 0, 9.0, -0.6, 0.32, 0.25, GREY, PART.CHROME, 8);
  // tail boom, fin, stabiliser
  b.rod(0, 5.4, -3.2, 0, 6.4, -16.5, 1.05, 0.42, MAIN, P, 8);
  b.add(new THREE.BoxGeometry(0.35, 4.0, 2.4), 0, 7.6, -16.6, 0.45, 0, 0, 1, 1, 1, MAIN, P, 0.95);
  b.box(0, 6.25, -13.6, 5.2, 0.22, 1.4, MAIN, P, 0, 0, 0, 0.95);
  b.box(2.65, 6.6, -13.6, 0.2, 1.0, 1.3, STRIPE, PART.BASE);
  b.box(-2.65, 6.6, -13.6, 0.2, 1.0, 1.3, STRIPE, PART.BASE);
  // skids
  for (const s of [1, -1]) {
    b.rod(s * 2.7, 0.25, -4.2, s * 2.7, 0.25, 5.2, 0.22, 0.22, GREY, PART.CHROME, 6);
    b.rod(s * 2.7, 0.25, 5.2, s * 2.7, 0.9, 6.3, 0.22, 0.22, GREY, PART.CHROME, 6);
    b.rod(s * 2.7, 0.25, 3.3, s * 1.9, 2.4, 3.0, 0.16, 0.16, GREY, PART.CHROME, 6);
    b.rod(s * 2.7, 0.25, -2.4, s * 1.9, 2.4, -2.2, 0.16, 0.16, GREY, PART.CHROME, 6);
  }
  // lamps: landing light, nav lights, beacons (the police get red/blue strobes)
  b.box(0, 1.6, 5.6, 0.7, 0.45, 0.5, 0xfff2c0, PART.HEAD);
  b.box(2.75, 6.25, -13.6, 0.28, 0.28, 0.28, 0xff2020, PART.TAIL);
  b.box(-2.75, 6.25, -13.6, 0.28, 0.28, 0.28, 0x20ff60, PART.GLOW);
  b.box(0, 9.5, -16.9, 0.3, 0.3, 0.3, 0xff3030, PART.TAIL);
  if (police) {
    b.box(1.3, 1.4, 0.0, 0.5, 0.3, 0.9, 0xff2020, PART.SIREN_R);
    b.box(-1.3, 1.4, 0.0, 0.5, 0.3, 0.9, 0x2050ff, PART.SIREN_B);
    b.box(0, 8.25, -3.4, 0.9, 0.35, 0.5, 0xff2020, PART.SIREN_R);
    b.add(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 8), -2.2, 2.2, 4.2, Math.PI / 2, 0, 0, 1, 1, 1, DARK, PART.DARK); // searchlight housing
    b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8), -2.2, 2.2, 4.7, Math.PI / 2, 0, 0, 1, 1, 1, 0xfff6d0, PART.HEAD);
  } else {
    b.add(new THREE.SphereGeometry(0.75, 8, 6), 0, 2.0, 6.2, 0, 0, 0, 1, 1, 1, DARK, PART.DARK); // camera ball
  }
  const body = b.geometry();
  // the main rotor (hub + 4 blades) and the tail rotor, drawn spinning
  const r = new Builder();
  r.add(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 8), 0, 0, 0, 0, 0, 0, 1, 1, 1, GREY, PART.CHROME);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; r.add(new THREE.BoxGeometry(0.95, 0.1, 15), Math.sin(a) * 7.7, 0.1, Math.cos(a) * 7.7, 0, a, 0.05, 1, 1, 1, 0x1e1f22, PART.DARK); }
  const t = new Builder();
  for (let i = 0; i < 2; i++) t.add(new THREE.BoxGeometry(0.1, 3.4, 0.45), 0, 0, 0, i * Math.PI / 2, 0, 0, 1, 1, 1, 0x1e1f22, PART.DARK);
  return {
    body, bounds: boundsOf(body), wheels: [],
    rotor: { geo: r.geometry(), x: 0, y: 9.1, z: -0.6, r: 15.5 },
    tail: { geo: t.geometry(), x: 0.55, y: 7.4, z: -17.1 },
    disc: 15.5,
  };
}

function plane() {
  const b = new Builder(), P = PART.PAINT;
  const W = WHITE;
  // fuselage: cowl, cabin, tail cone
  b.add(new THREE.CylinderGeometry(1.7, 2.1, 3.6, 8), 0, 4.0, 9.6, Math.PI / 2, 0, 0, 1, 1.05, 1, W, PART.BASE);
  b.add(new THREE.CylinderGeometry(2.1, 2.35, 7.2, 8), 0, 4.2, 4.2, Math.PI / 2, 0, 0, 1, 1.22, 1, W, PART.BASE);
  b.rod(0, 4.3, 0.6, 0, 5.4, -12.5, 2.3, 0.55, W, PART.BASE, 8);
  // windows band and windscreen
  b.box(0, 5.25, 4.3, 4.78, 1.4, 5.2, 0xd4ecff, PART.GLASS);
  b.box(0, 5.35, 7.25, 3.4, 1.3, 0.8, 0xd4ecff, PART.GLASS, -0.7);
  // stripe and tail
  b.rod(0, 3.4, 0.6, 0, 4.9, -12.0, 2.38, 0.6, 0, P, 8);
  b.add(new THREE.BoxGeometry(0.35, 5.2, 3.6), 0, 7.9, -11.6, -0.4, 0, 0, 1, 1, 1, 0, P, 1);
  b.box(0, 5.6, -11.4, 12.5, 0.25, 2.8, W, PART.BASE);
  // wings, tips, struts
  b.box(0, 7.15, 4.6, 37, 0.5, 4.4, W, PART.BASE);
  b.box(18.2, 7.15, 4.6, 1.2, 0.56, 4.5, 0, P, 0, 0, 0, 1);
  b.box(-18.2, 7.15, 4.6, 1.2, 0.56, 4.5, 0, P, 0, 0, 0, 1);
  for (const s of [1, -1]) b.rod(s * 2.0, 2.9, 4.8, s * 9.5, 6.9, 4.8, 0.16, 0.16, GREY, PART.CHROME, 6);
  // gear legs and wheel spats
  for (const s of [1, -1]) { b.rod(s * 1.7, 2.5, -0.4, s * 3.6, 1.0, -0.4, 0.17, 0.17, GREY, PART.CHROME, 6); b.add(new THREE.SphereGeometry(1, 8, 6), s * 3.6, 1.05, -0.4, 0, 0, 0, 0.55, 0.9, 1.4, 0, P, 0.95); }
  b.rod(0, 2.6, 9.0, 0, 1.0, 9.1, 0.17, 0.17, GREY, PART.CHROME, 6);
  // spinner, exhaust, lamps
  b.add(new THREE.ConeGeometry(0.75, 1.3, 8), 0, 4.0, 11.9, Math.PI / 2, 0, 0, 1, 1, 1, 0, P, 1);
  b.box(18.85, 7.15, 4.6, 0.12, 0.3, 0.6, 0xff2020, PART.TAIL);
  b.box(-18.85, 7.15, 4.6, 0.12, 0.3, 0.6, 0x20ff60, PART.GLOW);
  b.box(0, 10.4, -13.0, 0.25, 0.25, 0.25, 0xffffff, PART.GLOW);
  b.box(6.0, 6.85, 6.8, 0.8, 0.22, 0.12, 0xfff2c0, PART.HEAD);
  const body = b.geometry();
  const pr = new Builder();
  pr.add(new THREE.BoxGeometry(0.55, 7.2, 0.18), 0, 0, 0, 0, 0, 0, 1, 1, 1, 0x1e1f22, PART.DARK);
  const wg = wheelGeo(1.0, 0.6, 0xd0d4da, 0x1c1c1f, 14);
  return {
    body, bounds: boundsOf(body),
    wheels: [
      { key: 'proc:planewheel', geo: wg, x: 0, y: 1.0, z: 9.1, r: 1.0, w: 0.6, front: true, left: false, scale: 1 },
      { key: 'proc:planewheel', geo: wg, x: 3.6, y: 1.0, z: -0.4, r: 1.0, w: 0.6, front: false, left: true, scale: 1 },
      { key: 'proc:planewheel', geo: wg, x: -3.6, y: 1.0, z: -0.4, r: 1.0, w: 0.6, front: false, left: false, scale: 1 },
    ],
    prop: { geo: pr.geometry(), x: 0, y: 4.0, z: 12.0 },
  };
}

// ---- the cache ----------------------------------------------------------------------------------------------------------------
const VIS = new Map();
/** Everything needed to draw a type (cached; shared between vehicles of the type). */
export function visualFor(def) {
  if (VIS.has(def.id)) return VIS.get(def.id);
  let v;
  if (def.model.startsWith('proc:')) {
    const k = def.model.slice(5);
    v = k === 'sportbike' ? sportbike() : k === 'scooter' ? scooter() : k === 'heli' ? heli(def) : plane();
  } else if (hasModel(def.model)) v = kenneyBody(def);
  else throw new Error('no model ' + def.model);
  v.body.computeBoundingSphere();
  VIS.set(def.id, v);
  return v;
}

// ---- instanced wheels and shadows -------------------------------------------------------------------------------------------
/** An InstancedMesh refilled every frame with the instances in view. */
export class InstBank {
  constructor(scene, geo, mat, cap = 256, shaded = true) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    if (shaded) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.n = 0;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(m, shade = 1) {
    if (this.n >= this.cap) return;
    m.toArray(this.mesh.instanceMatrix.array, this.n * 16);
    if (this.mesh.instanceColor) { const a = this.mesh.instanceColor.array, i = this.n * 3; a[i] = a[i + 1] = a[i + 2] = shade; }
    this.n++;
  }
  end() {
    const m = this.mesh;
    m.count = this.n;
    m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, this.n * 16); m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, this.n * 3); m.instanceColor.needsUpdate = true; }
    m.visible = this.n > 0;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.dispose(); }
}

const BANKS = new Map();
let bankScene = null;
export function setBankScene(scene) { bankScene = scene; }
/** The instanced bank for a wheel geometry (deduplicated by shape). */
export function wheelBank(w) {
  let key = w.key + '@' + w.scale;
  // identical Kenney wheels share a bank: key by vertex count and extents
  if (!w.key.startsWith('proc:')) {
    const bb = w.geo.boundingBox || (w.geo.computeBoundingBox(), w.geo.boundingBox);
    key = `k${w.geo.attributes.position.count}:${bb.min.x.toFixed(3)}:${bb.max.x.toFixed(3)}:${bb.max.y.toFixed(3)}@${w.scale}`;
  }
  let b = BANKS.get(key);
  if (!b) {
    let g = w.geo;
    if (w.scale !== 1) { g = w.geo.clone(); g.scale(w.scale, w.scale, w.scale); }
    b = new InstBank(bankScene, g, wheelMaterial(), 320);
    b.mesh.name = 'wheels:' + key;
    BANKS.set(key, b);
  }
  return b;
}
export function allBanks() { return BANKS; }

let shadowB = null;
/** Soft dark contact shadows under the vehicles (one quad each). */
export function shadowBank() {
  if (shadowB) return shadowB;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mat.onBeforeCompile = (sh) => {
    // per-instance opacity rides in instanceColor.r
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n#ifdef USE_INSTANCING_COLOR\ndiffuseColor.a *= vColor.r; diffuseColor.rgb = vec3(0.0);\n#endif');
  };
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  shadowB = new InstBank(bankScene, geo, mat, 400);
  shadowB.mesh.renderOrder = 1;
  shadowB.mesh.name = 'vehicleShadows';
  return shadowB;
}

const DEB = new Map();
/** A Kenney crash-debris model in studs. */
export function debrisGeometry(name, scale = 5.4) {
  if (DEB.has(name)) return DEB.get(name);
  const g = modelGeometry(name).clone();
  g.scale(scale, scale, scale);
  g.computeBoundingSphere();
  DEB.set(name, g);
  return g;
}
