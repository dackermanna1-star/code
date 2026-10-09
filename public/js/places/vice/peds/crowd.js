// The crowd: every person in Vice City drawn as six instanced meshes - a
// round 2008 head (with every hat, hairdo and pair of sunglasses built in and
// switched on per person), the torso, two arms and two legs - plus one mesh
// for whatever they hold (guns, phones, briefcases, surfboards, drinks...).
// So 160+ people cost 6 draw calls, plus one per kind of thing being held. What they wear is a cell of the outfit
// atlas (outfits.js); blood soaks into their clothes, a hit flashes them red
// and despawning people dissolve, all per instance in the shader.
//
// Figures face +Z at heading 0 (ARCHITECTURE.md). A figure:
//   {x, y, z (feet), heading, scale, cell, hat (bitmask), item (ITEM id), blood 0..1, flash 0..1, fade 0..1,
//    mats: [6 Matrix4] head, torso, armR, armL, legR, legL (world, box centres), itemMat, hidden, owner}
// poseFigure(fig, P) fills fig.mats from a pose (see POSE below); a ragdoll can write them instead.
//
//   const crowd = new Crowd(scene, max)
//   crowd.add(fig) / remove(fig)            crowd.update(camera)  (upload; frustum culled)
//   crowd.extra = [{item, mat}]             items drawn on their own (guns lying on the ground)
//   crowd.ray(origin, dir, max, skip) -> {fig, part, d, point} | null   (per limb)
//   partCenter(fig, k, out)  handPoint(fig, out)
import * as THREE from 'three';
import { buildAtlas, CELL_W, CELL_H, COLS, ATLAS, REG, HAT } from './outfits.js';
import { buildGun } from '../../warzone/guns.js';

export const PART_NAMES = ['head', 'torso', 'armR', 'armL', 'legR', 'legL'];
export const PART_HALF = [[0.62, 0.62, 0.62], [1, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, 0.5]];
export const ITEM = { none: 0, pistol: 1, smg: 2, rifle: 3, shotgun: 4, sniper: 5, ak: 6, phone: 7, bat: 8, knife: 9, briefcase: 10, shopbag: 11, drink: 12, surfboard: 13, cigar: 14, newspaper: 15, camera: 16, cup: 17 };
export const GUN_ITEMS = new Set([1, 2, 3, 4, 5, 6]);

// ---- geometry --------------------------------------------------------------------------------------------------------
const cu = (x) => x / CELL_W, cv = (y) => 1 - y / CELL_H;   // cell pixels -> cell-local uv

/** A box with each face mapped to a region of the cell. */
function partBox(hx, hy, hz, reg) {
  const g = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
  const uv = g.attributes.uv;
  const set = (face, rg, flip = false) => {
    const [x, y, w, h] = rg;
    const u0 = cu(x + 0.5), u1 = cu(x + w - 0.5), v0 = cv(y + h - 0.5), v1 = cv(y + 0.5);
    const L = flip ? u1 : u0, R = flip ? u0 : u1, b = face * 4;
    uv.setXY(b, L, v1); uv.setXY(b + 1, R, v1); uv.setXY(b + 2, L, v0); uv.setXY(b + 3, R, v0);
  };
  // +x (the figure's left), -x (right), +y, -y, +z (front), -z (back)
  set(0, reg.side); set(1, reg.side, true); set(2, reg.top); set(3, reg.bottom || reg.top); set(4, reg.front); set(5, reg.back);
  return g;
}

/** Collect triangles from several geometries into one non-indexed geometry with extra per-vertex attributes. */
class Merge {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.tag = []; this.idx = []; }
  add(geo, m, { uv = null, color = null, tag = 0 } = {}) {
    // (kept indexed: the vertex shader runs once per shared vertex)
    const g = geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const base = this.pos.length / 3;
    if (g.index) for (let k = 0; k < g.index.count; k++) this.idx.push(base + g.index.getX(k));
    else for (let k = 0; k < P.count; k++) this.idx.push(base + k);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z); } else this.nor.push(0, 1, 0);
      if (typeof uv === 'function') { const t = uv(i, g); this.uv.push(t[0], t[1]); } else if (uv) this.uv.push(uv[0], uv[1]); else if (U) this.uv.push(U.getX(i), U.getY(i)); else this.uv.push(0, 0);
      if (color) this.col.push(color.r, color.g, color.b); else this.col.push(1, 1, 1);
      this.tag.push(tag);
    }
  }
  build(tagName) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (tagName) g.setAttribute(tagName, new THREE.Float32BufferAttribute(this.tag, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const regUV = (rg) => [cu(rg[0] + rg[2] / 2), cv(rg[1] + rg[3] / 2)];

/** The 2008 head (a rounded cylinder) with the face strip around it, and every hat on top (tagged by HAT bit). */
function headGeometry() {
  const R = 0.62, H = 0.62, r = 0.2, SEG = 18;
  const M = new Merge();
  // the side: rounded edges included, mapped by height into the strip
  const prof = [];
  for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2); prof.push(new THREE.Vector2(R - r + Math.cos(a) * r, -H + r + Math.sin(a) * r)); }
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * (Math.PI / 2); prof.push(new THREE.Vector2(R - r + Math.cos(a) * r, H - r + Math.sin(a) * r)); }
  const side = new THREE.LatheGeometry(prof, SEG, -Math.PI, Math.PI * 2);
  side.computeVertexNormals();
  const S = REG.head.strip;
  {
    const P = side.attributes.position, U = side.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const u = U.getX(i), y = P.getY(i);
      U.setXY(i, cu(S[0] + 0.5 + u * (S[2] - 1)), cv(S[1] + 0.5 + (1 - (y + H) / (2 * H)) * (S[3] - 1)));
    }
  }
  M.add(side, new THREE.Matrix4());
  // the top and bottom: discs (the top maps to the hair patch, the bottom to the chin)
  const T = REG.head.top;
  const top = new THREE.CircleGeometry(R - r, SEG); top.rotateX(-Math.PI / 2); top.translate(0, H, 0);
  M.add(top, new THREE.Matrix4(), { uv: (i, g) => { const p = g.attributes.position; return [cu(T[0] + T[2] / 2 + p.getX(i) / (R - r) * (T[2] / 2 - 1)), cv(T[1] + T[3] / 2 + p.getZ(i) / (R - r) * (T[3] / 2 - 1))]; } });
  const bot = new THREE.CircleGeometry(R - r, SEG); bot.rotateX(Math.PI / 2); bot.translate(0, -H, 0);
  M.add(bot, new THREE.Matrix4(), { uv: [cu(S[0] + 96), cv(S[1] + 62)] });
  // hats, hair and glasses (each switched on by its bit)
  const crown = regUV(REG.hat.crown), brim = regUV(REG.hat.brim), hair = regUV(REG.hair), lens = regUV(REG.glass);
  const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, Math.max(0.01, h), Math.min(seg, 12), 1, open);
  const dome = (rad, seg = 12) => new THREE.SphereGeometry(rad, seg, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const hat = (bit, geo, m, uv) => M.add(geo, m, { uv, tag: bit });
  // cap (peak forward) and cap turned backwards
  for (const [bit, dir] of [[HAT.cap, 1], [HAT.capback, -1]]) {
    hat(bit, dome(0.68), M4(0, 0.2, 0, 0, 0, 0, 1, 0.78, 1), crown);
    hat(bit, cyl(0.69, 0.69, 0.12, 14, true), M4(0, 0.24, 0), brim);
    hat(bit, new THREE.BoxGeometry(0.95, 0.06, 0.6), M4(0, 0.27, dir * 0.82, dir * -0.12, 0, 0), brim);
  }
  // police peaked cap
  hat(HAT.police, cyl(0.76, 0.66, 0.38), M4(0, 0.55, -0.02, -0.08, 0, 0), crown);
  hat(HAT.police, cyl(0.665, 0.665, 0.12, 14, true), M4(0, 0.38, 0), brim);
  hat(HAT.police, new THREE.BoxGeometry(0.85, 0.05, 0.42), M4(0, 0.36, 0.76, 0.25, 0, 0), brim);
  hat(HAT.police, new THREE.BoxGeometry(0.22, 0.18, 0.04), M4(0, 0.6, 0.73), lens); // badge (lens colour reads as dark; fine)
  // straw fedora
  hat(HAT.fedora, cyl(0.52, 0.6, 0.48), M4(0, 0.78, 0), crown);
  hat(HAT.fedora, cyl(0.605, 0.605, 0.13, 14, true), M4(0, 0.62, 0), brim);
  hat(HAT.fedora, cyl(1.02, 1.02, 0.05, 18), M4(0, 0.55, 0), crown);
  // wide sun hat
  hat(HAT.sunhat, cyl(0.62, 0.6, 0.38), M4(0, 0.78, 0), crown);
  hat(HAT.sunhat, cyl(0.625, 0.625, 0.12, 14, true), M4(0, 0.64, 0), brim);
  hat(HAT.sunhat, cyl(0.66, 1.5, 0.22, 20), M4(0, 0.52, 0), crown);
  // hard hat
  hat(HAT.hardhat, dome(0.76), M4(0, 0.22, 0, 0, 0, 0, 1, 0.85, 1.05), crown);
  hat(HAT.hardhat, cyl(0.86, 0.9, 0.07, 16), M4(0, 0.24, 0.06), crown);
  hat(HAT.hardhat, new THREE.BoxGeometry(0.14, 0.12, 1.5), M4(0, 0.86, 0), brim);
  // SWAT helmet
  hat(HAT.helmet, dome(0.8), M4(0, 0.1, -0.03, 0, 0, 0, 1, 0.95, 1.05), crown);
  hat(HAT.helmet, cyl(0.8, 0.82, 0.3, 16, true), M4(0, -0.02, -0.03), brim);
  // bucket hat
  hat(HAT.bucket, cyl(0.56, 0.68, 0.42), M4(0, 0.6, 0), crown);
  hat(HAT.bucket, cyl(0.69, 0.98, 0.22, 16, true), M4(0, 0.33, 0), brim);
  // beanie
  hat(HAT.beanie, dome(0.69), M4(0, 0.22, 0, 0, 0, 0, 1, 1.05, 1), crown);
  hat(HAT.beanie, cyl(0.7, 0.7, 0.24, 14, true), M4(0, 0.26, 0), brim);
  // long hair: down the back and the sides
  hat(HAT.longhair, dome(0.67), M4(0, 0.04, -0.03, 0, 0, 0, 1, 1.0, 1.05), hair);
  hat(HAT.longhair, new THREE.BoxGeometry(1.3, 1.75, 0.34), M4(0, -0.48, -0.5), hair);
  hat(HAT.longhair, new THREE.BoxGeometry(0.2, 1.25, 0.95), M4(0.6, -0.3, -0.12), hair);
  hat(HAT.longhair, new THREE.BoxGeometry(0.2, 1.25, 0.95), M4(-0.6, -0.3, -0.12), hair);
  // a bun on top, an afro
  hat(HAT.bun, new THREE.SphereGeometry(0.33, 8, 5), M4(0, 0.62, -0.38), hair);
  hat(HAT.bun, dome(0.655), M4(0, 0.05, -0.02, 0, 0, 0, 1, 0.95, 1.02), hair);
  hat(HAT.afro, new THREE.SphereGeometry(0.9, 12, 7), M4(0, 0.35, -0.12, 0, 0, 0, 1, 0.9, 1), hair);
  // bandana (tied at the back) and headwrap
  hat(HAT.bandana, dome(0.665), M4(0, 0.1, 0, 0, 0, 0, 1, 0.92, 1), crown);
  hat(HAT.bandana, new THREE.BoxGeometry(0.3, 0.3, 0.18), M4(0, 0.22, -0.7), brim);
  hat(HAT.bandana, new THREE.BoxGeometry(0.12, 0.5, 0.06), M4(0.08, -0.08, -0.72, 0.25, 0, 0.2), crown);
  hat(HAT.headwrap, cyl(0.6, 0.68, 0.75, 16), M4(0, 0.62, -0.06, -0.15, 0, 0), crown);
  hat(HAT.headwrap, dome(0.6), M4(0, 0.98, -0.12, -0.15, 0, 0, 1, 0.5, 1), brim);
  // sunglasses
  hat(HAT.glasses, new THREE.BoxGeometry(1.06, 0.24, 0.08), M4(0, 0.13, 0.6), lens);
  hat(HAT.glasses, new THREE.BoxGeometry(0.06, 0.06, 0.62), M4(0.6, 0.18, 0.3), lens);
  hat(HAT.glasses, new THREE.BoxGeometry(0.06, 0.06, 0.62), M4(-0.6, 0.18, 0.3), lens);
  const g = M.build('hatBit');
  return g;
}

// ---- held items (one mesh; geometry in the right hand's frame: -Y along the arm, +Z its front) ----------------------
let itemGeo = null;
function mapColor(mat) {
  const c = mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1);
  const img = mat.map?.image;
  if (img && img.getContext) {
    try {
      const d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 64) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      const t = new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
      c.multiply(t);
    } catch (e) { /* tainted canvas: keep the base colour */ }
  }
  return c;
}
/** One geometry per held item (vertex colours; in the right hand's frame). */
function itemGeometry() {
  if (itemGeo) return itemGeo;
  const byId = new Map();
  const M = { add(geo, m, o) { let mm = byId.get(o.tag); if (!mm) byId.set(o.tag, (mm = new Merge())); mm.add(geo, m, o); } };
  const C = (hex) => new THREE.Color(hex);
  // guns: the warzone models (metres, barrel -Z, grip at the origin) scaled to studs and turned into the hand frame
  const fix = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
  const guns = [[ITEM.pistol, 'glock'], [ITEM.smg, 'mp5'], [ITEM.rifle, 'm4'], [ITEM.shotgun, 'remington'], [ITEM.sniper, 'm24'], [ITEM.ak, 'ak47']];
  for (const [id, model] of guns) {
    let info = null;
    try { info = buildGun(model, []); } catch (e) { info = null; }
    if (!info) continue;
    const grp = info.group;
    grp.updateMatrixWorld(true);
    const k = 4.2 * (id === ITEM.pistol ? 1.35 : 1);   // (handguns would vanish inside a blocky fist at true scale)
    const base = new THREE.Matrix4().makeTranslation(0, -0.05, 0.08).multiply(fix).multiply(new THREE.Matrix4().makeScale(k, k, k));
    grp.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat?.transparent && mat.opacity < 0.6) return;
      M.add(o.geometry, new THREE.Matrix4().multiplyMatrices(base, o.matrixWorld), { color: mapColor(mat || {}), tag: id });
    });
  }
  const box = (id, w, h, d, x, y, z, col, rx = 0, ry = 0, rz = 0) => M.add(new THREE.BoxGeometry(w, h, d), M4(x, y, z, rx, ry, rz), { color: C(col), tag: id });
  const cyl = (id, rt, rb, h, x, y, z, col, rx = 0, ry = 0, rz = 0, seg = 10) => M.add(new THREE.CylinderGeometry(rt, rb, h, seg), M4(x, y, z, rx, ry, rz), { color: C(col), tag: id });
  // phone (screen towards the face when held up)
  box(ITEM.phone, 0.34, 0.62, 0.07, 0, -0.18, 0.2, '#16171c');
  box(ITEM.phone, 0.28, 0.5, 0.01, 0, -0.18, 0.16, '#6fa8e8');
  // bat
  cyl(ITEM.bat, 0.09, 0.19, 2.7, 0, -1.2, 0.05, '#b07a40');
  cyl(ITEM.bat, 0.1, 0.1, 0.12, 0, 0.18, 0.05, '#2a1a10');
  // knife
  box(ITEM.knife, 0.12, 0.42, 0.16, 0, -0.1, 0.05, '#18181a');
  box(ITEM.knife, 0.04, 0.8, 0.18, 0, -0.68, 0.06, '#c8ccd2');
  // briefcase (hanging from the hand)
  box(ITEM.briefcase, 0.36, 0.95, 1.3, 0, -0.75, 0, '#3a2414');
  box(ITEM.briefcase, 0.1, 0.18, 0.42, 0, -0.2, 0, '#1a120a');
  box(ITEM.briefcase, 0.38, 0.1, 0.1, 0, -0.5, 0.4, '#c8a848');
  // shopping bag
  box(ITEM.shopbag, 0.5, 1.0, 0.85, 0, -0.8, 0, '#f2b6c6');
  box(ITEM.shopbag, 0.06, 0.4, 0.4, 0, -0.18, 0, '#f4f4f4');
  // a cocktail and a coffee
  cyl(ITEM.drink, 0.2, 0.12, 0.5, 0, -0.05, 0.22, '#ff7aa8');
  cyl(ITEM.drink, 0.02, 0.02, 0.35, 0.06, 0.3, 0.22, '#f4f4f4');
  cyl(ITEM.cup, 0.19, 0.15, 0.5, 0, -0.05, 0.22, '#f0ece4');
  cyl(ITEM.cup, 0.2, 0.2, 0.08, 0, 0.22, 0.22, '#3a2414');
  // surfboard under the arm (board on the outside of the right arm)
  M.add(new THREE.SphereGeometry(1, 14, 8), M4(-0.42, 0.25, 0.1, 0, 0, 0, 0.12, 2.9, 0.62), { color: C('#f4f2ea'), tag: ITEM.surfboard });
  M.add(new THREE.SphereGeometry(1, 14, 8), M4(-0.42, 0.25, 0.1, 0, 0, 0, 0.125, 2.6, 0.18), { color: C('#ff5a3a'), tag: ITEM.surfboard });
  // cigar, newspaper, camera
  cyl(ITEM.cigar, 0.05, 0.05, 0.45, 0, -0.1, 0.25, '#6a3a1a', Math.PI / 2);
  cyl(ITEM.cigar, 0.052, 0.052, 0.06, 0, -0.1, 0.48, '#ff6a20', Math.PI / 2);
  box(ITEM.newspaper, 0.08, 0.95, 0.75, 0, -0.45, 0.15, '#e8e4d8');
  box(ITEM.camera, 0.55, 0.4, 0.32, 0, -0.2, 0.25, '#18181a');
  cyl(ITEM.camera, 0.14, 0.14, 0.3, 0, -0.2, 0.45, '#2a2a2e', Math.PI / 2);
  itemGeo = new Map();
  for (const [id, mm] of byId) itemGeo.set(id, mm.build());
  return itemGeo;
}

// ---- materials ---------------------------------------------------------------------------------------------------------
const NOISE = /* glsl */`
float vcHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vcNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vcHash(i), vcHash(i + vec2(1, 0)), f.x), mix(vcHash(i + vec2(0, 1)), vcHash(i + vec2(1, 1)), f.x), f.y); }`;

function crowdMaterial(tex, head) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 });
  const sx = (CELL_W / ATLAS).toFixed(6), sy = (CELL_H / ATLAS).toFixed(6);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aCell; attribute vec3 aFx; varying vec3 vFx; varying vec2 vLoc;
${head ? 'attribute float aHat; attribute float hatBit;' : ''}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vLoc = uv; vFx = aFx;
#ifdef USE_MAP
vMapUv = uv * vec2(${sx}, ${sy}) + aCell;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${head ? 'if (hatBit > 0.5 && (int(aHat + 0.5) & int(hatBit + 0.5)) == 0) transformed = vec3(0.0);' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFx; varying vec2 vLoc;
${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vFx.z < 0.999 && vcHash(floor(gl_FragCoord.xy)) > vFx.z) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
if (vFx.x > 0.001) {
  float n = vcNoise(vLoc * vec2(22.0, 16.0)) * 0.65 + vcNoise(vLoc * vec2(61.0, 47.0)) * 0.35;
  float b = smoothstep(1.0 - vFx.x * 0.8, 1.0 - vFx.x * 0.8 + 0.08, 1.0 - n);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.015, 0.012) * (0.75 + 0.5 * n), b * 0.92);
}
diffuseColor.rgb *= vec3(1.0 + vFx.y * 1.6, 1.0 - vFx.y * 0.45, 1.0 - vFx.y * 0.45);`);
  };
  m.customProgramCacheKey = () => head ? 'vc-crowd-head' : 'vc-crowd';
  return m;
}
function itemMaterial() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }); }

// ---- poses -------------------------------------------------------------------------------------------------------------
// POSE fields (all optional): walk (phase), stride 0..1, gait 0 walk | 1 run | 2 sprint, t (time, for idling), seed,
//   hipY (2 standing), crouch 0..1, legs (both legs forward, radians: sit = PI/2), spread, legR/legL (extra forward),
//   lean (torso pitch, + forward), twist (torso yaw), tilt (roll), look (head pitch, + down), headYaw, headTilt,
//   arms: 'swing' | 'idle' | 'phone' | 'text' | 'film' | 'talk' | 'fold' | 'cower' | 'handsup' | 'flee' | 'pistol' | 'rifle'
//         | 'punch' | 'kick' | 'guard' | 'melee' | 'carry' | 'surf' | 'drink' | 'sit' | 'drive' | 'bike' | 'lie' | 'support' | 'getup' | 'wave'
//   act 0..1 (punch/kick/melee progress), side (+1 left / -1 right: the arm or leg that strikes), aimPitch,
//   fall 0..1 + fallDir (+1 back, -1 front): fall over at the feet (bodies too far for a ragdoll), lie 0..1 (on the back, about the feet), roll (dive)
const _root = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _tor = new THREE.Matrix4(), _tmp = new THREE.Matrix4();
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3();

/** out = parent x T(a) x R(euler rx, ry, rz) x T(b) */
function chain(out, parent, ax, ay, az, rx, ry, rz, bx, by, bz) {
  _loc.makeRotationFromEuler(_e.set(rx, ry, rz));
  const m = _loc.elements;
  m[12] = ax + m[0] * bx + m[4] * by + m[8] * bz;
  m[13] = ay + m[1] * bx + m[5] * by + m[9] * bz;
  m[14] = az + m[2] * bx + m[6] * by + m[10] * bz;
  return out.multiplyMatrices(parent, _loc);
}

const ARM = { fR: 0, oR: 0, yR: 0, fL: 0, oL: 0, yL: 0 };
export function poseFigure(f, P) {
  const s = f.scale || 1, t = P.t || 0, sd = P.seed || 0;
  const stride = P.stride || 0, ph = P.walk || 0, gait = P.gait || 0;
  const crouch = P.crouch || 0;
  // the root: feet, heading, scale (and falling over / lying down about the feet)
  if (f.rootMat) _root.copy(f.rootMat).scale(_s.set(s * (f.sx || 1), s, s * (f.sx || 1)));
  else { _q.setFromEuler(_e.set(0, f.heading, 0)); _root.compose(_p.set(f.x, f.y, f.z), _q, _s.set(s * (f.sx || 1), s, s * (f.sx || 1))); }
  if (P.fall) { _root.multiply(_tmp.makeTranslation(0, 0.5 * P.fall, 0)); _root.multiply(_tmp.makeRotationX(-P.fall * Math.PI / 2 * (P.fallDir || 1))); }
  if (P.lie) { _root.multiply(_tmp.makeTranslation(0, 0.5 * P.lie, 0)); _root.multiply(_tmp.makeRotationX(-P.lie * Math.PI / 2)); }
  if (P.roll) { _root.multiply(_tmp.makeTranslation(0, 2, 0)); _root.multiply(_tmp.makeRotationZ(P.roll)); _root.multiply(_tmp.makeTranslation(0, -2, 0)); }
  // idling: breathing, shifting weight, looking around
  const idle = stride < 0.05 && !P.fall ? 1 : 0;
  const breathe = Math.sin(t * 1.7 + sd) * 0.018 * idle;
  const shift = Math.sin(t * 0.45 + sd * 3) * idle;
  const hipY = (P.hipY ?? 2) - crouch * 1.15;
  const bob = Math.abs(Math.sin(ph)) * (gait ? 0.28 : 0.12) * stride;
  const lean = (P.lean || 0) + crouch * 0.4 + (gait === 1 ? 0.12 : gait === 2 ? 0.26 : 0) * stride;
  const twist = (P.twist || 0) + Math.sin(ph) * 0.07 * stride;
  const tilt = (P.tilt || 0) + shift * 0.035;
  // torso (pivots at the hips)
  chain(_tor, _root, shift * 0.06, hipY + bob + breathe, 0, lean, twist, tilt, 0, 1, 0);
  f.mats[1].copy(_tor);
  // head
  const look = (P.look || 0) - lean * 0.45 + breathe * 2;
  chain(f.mats[0], _tor, 0, 1, 0, look, (P.headYaw || 0), (P.headTilt || 0) - shift * 0.03, 0, 0.62, 0);
  // arms
  const sw = Math.sin(ph) * (gait === 2 ? 1.25 : gait === 1 ? 1.05 : 0.75) * stride;
  const A = ARM;
  A.fR = -sw; A.fL = sw; A.oR = 0.06 + breathe; A.oL = 0.06 + breathe; A.yR = 0; A.yL = 0;
  const act = P.act || 0, aim = P.aimPitch || 0;
  switch (P.arms) {
    case 'idle': A.fR = 0.04 + Math.sin(t * 0.7 + sd) * 0.04; A.fL = 0.04 + Math.sin(t * 0.8 + sd + 1) * 0.04; break;
    case 'phone': A.fR = 2.55; A.oR = -0.42; A.yR = 0.5; A.fL = 0.05 + sw * 0.5; break;
    case 'text': A.fR = 1.05; A.oR = -0.3; A.fL = 0.95; A.oL = -0.32; break;
    case 'film': A.fR = 1.62 + aim; A.oR = -0.18; A.fL = 1.5 + aim; A.oL = -0.38; break;
    case 'talk': { const g1 = Math.max(0, Math.sin(t * 2.6 + sd)), g2 = Math.max(0, Math.sin(t * 2.1 + sd + 2)); A.fR = 0.25 + g1 * 0.75; A.oR = 0.05 + g1 * 0.15; A.fL = 0.15 + g2 * 0.55; A.oL = 0.08; break; }
    case 'fold': A.fR = 0.62; A.oR = -0.62; A.fL = 0.55; A.oL = -0.66; break;
    case 'cower': A.fR = 2.75; A.oR = -0.6; A.fL = 2.75; A.oL = -0.6; break;
    case 'handsup': A.fR = Math.PI - 0.12; A.oR = 0.22; A.fL = Math.PI - 0.12; A.oL = 0.22; break;
    case 'flee': A.fR = 2.35 + Math.sin(ph + 0.4) * 0.55; A.oR = 0.35; A.fL = 2.35 + Math.sin(ph + 2.4) * 0.55; A.oL = 0.35; break;
    case 'wave': A.fR = 2.6 + Math.sin(t * 9) * 0.15; A.oR = 0.5 + Math.sin(t * 9) * 0.3; break;
    case 'pistol': A.fR = Math.PI / 2 + aim; A.yR = 0.12; A.oR = -0.05; A.fL = Math.PI / 2 + aim - 0.06; A.oL = -0.48; A.yL = -0.1; break;
    case 'pistolLow': A.fR = 0.55; A.oR = 0.02; A.fL = 0.1 + sw * 0.4; break;
    case 'rifle': A.fR = 1.3 + aim; A.oR = -0.12; A.fL = 1.58 + aim; A.oL = -0.62; break;
    case 'rifleLow': A.fR = 0.75; A.oR = -0.2; A.fL = 1.0; A.oL = -0.62; break;
    case 'guard': { const b = Math.sin(t * 6 + sd) * 0.06; A.fR = 1.35 + b; A.oR = -0.38; A.fL = 1.25 - b; A.oL = -0.36; break; }
    case 'punch': {
      const sdx = P.side || -1;
      const k = act < 0.22 ? -0.45 * (act / 0.22) : act < 0.45 ? -0.45 + 2.15 * ((act - 0.22) / 0.23) : act < 0.6 ? 1.7 : 1.7 * (1 - (act - 0.6) / 0.4) + 1.3 * ((act - 0.6) / 0.4);
      if (sdx < 0) { A.fR = k; A.oR = -0.12; A.fL = 1.3; A.oL = -0.38; } else { A.fL = k; A.oL = -0.12; A.fR = 1.3; A.oR = -0.38; }
      break;
    }
    case 'melee': { // a swing with whatever is in the right hand
      const k = act < 0.3 ? 1.4 + 1.3 * (act / 0.3) : act < 0.55 ? 2.7 - 2.4 * ((act - 0.3) / 0.25) : 0.3 + 0.9 * ((act - 0.55) / 0.45);
      A.fR = k; A.oR = act < 0.3 ? 0.3 : -0.35; A.yR = act < 0.55 ? 0.3 : -0.2; A.fL = 1.0; A.oL = -0.3; break;
    }
    case 'kick': A.fR = 0.6; A.oR = 0.45; A.fL = 0.6; A.oL = 0.45; break;
    case 'carry': A.fR = 0.04 + sw * 0.15; A.oR = 0.12; break;
    case 'surf': A.fR = 0.1; A.oR = 0.32; break;
    case 'drink': { const sip = Math.max(0, Math.sin(t * 0.6 + sd) - 0.7) * 3.3; A.fR = 0.95 + sip * 1.2; A.oR = -0.25 - sip * 0.1; break; }
    case 'sit': A.fR = 0.45; A.oR = 0.06; A.fL = 0.45; A.oL = 0.06; break;
    case 'drive': A.fR = 1.2; A.oR = -0.42; A.fL = 1.2; A.oL = -0.42; break;   // (hands in on the wheel)
    case 'bike': A.fR = 1.35; A.oR = 0.22; A.fL = 1.35; A.oL = 0.22; break;
    case 'lie': A.fR = Math.PI - 0.3; A.oR = -0.55; A.fL = Math.PI - 0.3; A.oL = -0.55; break;
    case 'support': A.fR = -0.55; A.oR = 0.25; A.fL = -0.55; A.oL = 0.25; break;
    case 'getup': A.fR = P.armF ?? 0.6; A.oR = 0.25; A.fL = P.armF ?? 0.6; A.oL = 0.25; break;
    default: break;
  }
  if (P.fall) { const d = P.fall; A.fR = A.fR * (1 - d) - 0.3 * d; A.fL = A.fL * (1 - d) + 0.3 * d; A.oR = A.oR * (1 - d) + 0.5 * d; A.oL = A.oL * (1 - d) + 0.5 * d; }
  // (side -1 = the figure's right, at x = -1.5; abduction Rz(side * out))
  chain(f.mats[2], _tor, -1.5, 0.8, 0, -A.fR, A.yR, -A.oR, 0, -0.8, 0);
  chain(f.mats[3], _tor, 1.5, 0.8, 0, -A.fL, A.yL, A.oL, 0, -0.8, 0);
  // legs (from the root, so leaning doesn't move them)
  const lsw = Math.sin(ph) * (gait === 2 ? 1.05 : gait === 1 ? 0.95 : 0.62) * stride;
  let fR = lsw + (P.legs || 0) + (P.legR || 0), fL = -lsw + (P.legs || 0) + (P.legL || 0);
  if (crouch) { fR = fR * (1 - crouch) + 1.2 * crouch; fL = fL * (1 - crouch) + 0.95 * crouch; }
  if (P.arms === 'kick') { const k = act < 0.25 ? -0.5 * (act / 0.25) : act < 0.45 ? -0.5 + 2.2 * ((act - 0.25) / 0.2) : 1.7 * (1 - (act - 0.45) / 0.55); if ((P.side || -1) < 0) fR = k; else fL = k; }
  const spread = (P.spread || 0) + 0.04 + idle * Math.max(0, shift) * 0.05;
  if (P.fall) { fR *= 1 - P.fall; fL *= 1 - P.fall; }
  chain(f.mats[4], _root, -0.5, hipY + bob * 0.5, 0, -fR, 0, -spread, 0, -1, 0);
  chain(f.mats[5], _root, 0.5, hipY + bob * 0.5, 0, -fL, 0, spread, 0, -1, 0);
  // what they hold: in the right hand, or pointed where they aim
  if (f.item) itemMatrix(f, P);
}

const _hand = new THREE.Vector3();
/** The held item: in the hand's frame, or (guns being aimed) along the aim. */
function itemMatrix(f, P) {
  const m = f.itemMat, A = f.mats[2];
  _hand.set(0, -0.95, 0.05).applyMatrix4(A);
  if (P.aimDir && (P.arms === 'pistol' || P.arms === 'rifle')) {
    // the barrel along the aim: hand frame with -Y = aim, +Z = up
    const d = P.aimDir;
    _ay.set(-d.x, -d.y, -d.z).normalize();
    _az.set(0, 1, 0).addScaledVector(_ay, -_ay.y).normalize();
    _ax.crossVectors(_ay, _az);
    const s = f.scale || 1;
    m.makeBasis(_ax.multiplyScalar(s), _ay.multiplyScalar(s), _az.multiplyScalar(s));
    m.setPosition(_hand);
  } else {
    m.copy(A);
    m.setPosition(_hand);
  }
}

/** The centre of part k (head 0, torso 1, ...) in the world. */
export function partCenter(f, k, out) { const e = f.mats[k].elements; return out.set(e[12], e[13], e[14]); }
/** The right hand (bottom of the right arm). */
export function handPoint(f, out) { return out.set(0, -0.95, 0.05).applyMatrix4(f.mats[2]); }

// ---- the crowd ---------------------------------------------------------------------------------------------------------
const _frus = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();

export class Crowd {
  constructor(scene, max = 220) {
    const A = buildAtlas();
    this.max = max; this.scene = scene;
    this.figs = [];
    this.cell = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.fx = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.hat = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    const bodyMat = crowdMaterial(A.tex, false), headMat = crowdMaterial(A.tex, true);
    const R = REG;
    const geos = [headGeometry(), partBox(1, 1, 0.5, R.torso), partBox(0.5, 1, 0.5, R.arm), partBox(0.5, 1, 0.5, R.arm), partBox(0.5, 1, 0.5, R.leg), partBox(0.5, 1, 0.5, R.leg)];
    this.meshes = geos.map((g, k) => {
      g.setAttribute('aCell', this.cell); g.setAttribute('aFx', this.fx);
      if (k === 0) g.setAttribute('aHat', this.hat);
      const m = new THREE.InstancedMesh(g, k === 0 ? headMat : bodyMat, max);
      m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.name = 'crowd-' + PART_NAMES[k];
      scene.add(m);
      return m;
    });
    // held items: one small instanced mesh per kind of thing (only the kinds in use are drawn)
    const imat = itemMaterial();
    this.items = new Map();
    for (const [id, g] of itemGeometry()) {
      const m = new THREE.InstancedMesh(g, imat, 64);
      m.count = 0; m.frustumCulled = false; m.castShadow = true; m.visible = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.name = 'crowd-item-' + id;
      scene.add(m);
      this.items.set(id, m);
    }
    this._ic = new Map();
    this.drawn = 0;
  }

  /** A figure object with its matrices (pass the fields you know). */
  static figure(o = {}) {
    return Object.assign({ x: 0, y: 0, z: 0, heading: 0, scale: 1, cell: 0, hat: 0, item: 0, blood: 0, flash: 0, fade: 1, hidden: false, culled: false, owner: null, mats: [0, 1, 2, 3, 4, 5].map(() => new THREE.Matrix4()), itemMat: new THREE.Matrix4() }, o);
  }
  add(f) { if (this.figs.length >= this.max) return false; if (!this.figs.includes(f)) this.figs.push(f); return true; }
  remove(f) { const i = this.figs.indexOf(f); if (i >= 0) { this.figs[i] = this.figs[this.figs.length - 1]; this.figs.pop(); } }

  /** Upload every visible figure's matrices and looks (only those in the view are drawn). */
  update(camera, range = 700) {
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frus.setFromProjectionMatrix(_pm);
    const cp = camera.position;
    let n = 0;
    const im = this._im || (this._im = this.meshes.map((m) => m.instanceMatrix.array)), cell = this.cell.array, fx = this.fx.array, hat = this.hat.array;
    for (const m of this.items.values()) m.count = 0;
    const cw = CELL_W / ATLAS, ch = CELL_H / ATLAS;
    for (const f of this.figs) {
      if (f.hidden) { f.culled = true; continue; }
      const t = f.mats[1].elements;
      const dx = t[12] - cp.x, dz = t[14] - cp.z;
      if (dx * dx + dz * dz > range * range) { f.culled = true; continue; }
      f.culled = false;
      // (this runs before the camera moves this frame: a margin that grows with distance covers a quick turn)
      _sph.center.set(t[12], t[13], t[14]); _sph.radius = 4.5 * (f.scale || 1) + Math.sqrt(dx * dx + dz * dz) * 0.12;
      if (!_frus.intersectsSphere(_sph)) continue;
      for (let k = 0; k < 6; k++) im[k].set(f.mats[k].elements, n * 16);
      const c = f.cell | 0;
      cell[n * 2] = (c % COLS) * cw; cell[n * 2 + 1] = 1 - (Math.floor(c / COLS) + 1) * ch;
      fx[n * 3] = f.blood || 0; fx[n * 3 + 1] = f.flash || 0; fx[n * 3 + 2] = f.fade ?? 1;
      hat[n] = f.hat || 0;
      n++;
      if (f.item) this._putItem(f.item, f.itemMat);
    }
    // extra items: guns lying on the ground (pickups)
    if (this.extra) for (const x of this.extra) this._putItem(x.item, x.mat);
    for (const m of this.meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; m.visible = n > 0; }
    this.cell.needsUpdate = true; this.fx.needsUpdate = true; this.hat.needsUpdate = true;
    for (const m of this.items.values()) { m.visible = m.count > 0; if (m.count) m.instanceMatrix.needsUpdate = true; }
    this.drawn = n;
  }

  _putItem(id, mat) {
    const m = this.items.get(id);
    if (!m || m.count >= 64) return;
    m.instanceMatrix.array.set(mat.elements, m.count * 16);
    m.count++;
  }

  /** Which figure and limb a ray hits first: {fig, part, d, point} or null. skip(fig) -> true to ignore. */
  ray(o, dir, max, skip) {
    let best = null, bd = max, bk = -1;
    for (const f of this.figs) {
      if (f.hidden || (skip && skip(f))) continue;
      const t = f.mats[1].elements;
      const cx = t[12] - o.x, cy = t[13] - o.y, cz = t[14] - o.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < -5 || along > bd + 5) continue;
      const qx = cx - dir.x * along, qy = cy - dir.y * along, qz = cz - dir.z * along;
      const rr = 4.6 * (f.scale || 1);
      if (qx * qx + qy * qy + qz * qz > rr * rr) continue;
      for (let k = 0; k < 6; k++) {
        const d = rayBox(f.mats[k], PART_HALF[k], o, dir, bd);
        if (d !== null && d < bd) { bd = d; best = f; bk = k; }
      }
    }
    if (!best) return null;
    return { fig: best, part: PART_NAMES[bk], d: bd, point: new THREE.Vector3().copy(o).addScaledVector(dir, bd) };
  }

  dispose() {
    for (const m of [...this.meshes, ...this.items.values()]) { this.scene.remove(m); m.geometry.dispose(); m.dispose?.(); }
  }
}

const _inv = new THREE.Matrix4(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
/** Ray against a box (half sizes h) placed by matrix M: the distance, or null. */
export function rayBox(M, h, o, dir, max) {
  _inv.copy(M).invert();
  _lo.copy(o).applyMatrix4(_inv);
  _ld.copy(dir).transformDirection(_inv);
  // (transformDirection normalises; figures are scaled ~1 so distances stay close enough)
  let t0 = 0, t1 = max;
  for (let a = 0; a < 3; a++) {
    const oo = a === 0 ? _lo.x : a === 1 ? _lo.y : _lo.z, dd = a === 0 ? _ld.x : a === 1 ? _ld.y : _ld.z, hh = h[a];
    if (Math.abs(dd) < 1e-8) { if (oo < -hh || oo > hh) return null; continue; }
    let ta = (-hh - oo) / dd, tb = (hh - oo) / dd;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return t0;
}
export { headGeometry as _headGeometry };
