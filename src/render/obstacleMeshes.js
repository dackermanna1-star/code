/**
 * obstacleMeshes.js — visuals for the fixed walking obstacles (kerb, log, plank, step, crate). Built from the same part list as the physics shapes (OBSTACLES[type].parts, in the
 * prop's frame: y up from the floor), so feet visibly land on the surfaces they stand on.
 *
 *  - Concrete (kerb, step): worn grey concrete, arrises darkened a little (only edges of
 *    the solid's outline: faces that continue into a neighbouring part are left clean) and a
 *    contact darkening where the concrete meets the floor.
 *  - Wood: a bark log with lighter end-grain caps, a pair of pine boards, a large plank crate (the
 *    throwable crate's model scaled up to 70 cm).
 *  - Every prop sits on a soft contact shadow, so it stays grounded outside the sun's shadow area.
 *
 * Geometry, materials and textures are built once per type and shared (instances are clones).
 * The ghost is a translucent preview of a prop for the placement tool.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBSTACLES } from '../game/obstacles.js';
import { cached, genTextures, tfbm, pnoise2, tcell, hex3, mix3, mixInto, smooth, getMat, createThrowableMesh } from './objectMeshes.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fract = (x) => x - Math.floor(x);
const CONCRETE_TILE = 0.8; // m of surface per concrete texture tile

/** Local footprint of a prop on the floor (x/z extents) and its height. */
export function obstacleFootprint(type) {
  const r = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, height: 0 };
  for (const p of OBSTACLES[type].parts) {
    const hx = p.cyl ? p.len / 2 : p.box[0] / 2, hz = p.cyl ? p.cyl : p.box[2] / 2, top = p.at[1] + (p.cyl ? p.cyl : p.box[1] / 2);
    r.minX = Math.min(r.minX, p.at[0] - hx);
    r.maxX = Math.max(r.maxX, p.at[0] + hx);
    r.minZ = Math.min(r.minZ, p.at[2] - hz);
    r.maxZ = Math.max(r.maxZ, p.at[2] + hz);
    r.height = Math.max(r.height, top);
  }
  return r;
}

// ---------------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------------
/** Tileable concrete: mottled cement, fine aggregate, a few small bugholes; alpha = grime noise. */
function concreteTextures() {
  return cached('tex:obstacle:concrete', () => {
    const base = hex3(0x8c8882), light = hex3(0xa6a199), dark = hex3(0x5f5c57), tmp = [0, 0, 0], cell = [0, 0], hole = [0, 0];
    return genTextures(256, 256, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      const mott = tfbm(u, v, 3, 3, 4, 41);
      const fine = pnoise2(u * 64, v * 64, 64, 64, 43) * 0.6 + pnoise2(u * 160, v * 160, 160, 160, 47) * 0.4;
      // aggregate: small grains, some lighter and some darker than the cement
      tcell(u, v, 40, 40, 53, cell);
      const grain = smooth(0.3, 0.12, cell[0]) * Math.abs(cell[1] - 0.5) * 2;
      // bugholes: sparse, of varied size
      tcell(u, v, 14, 14, 67, hole);
      const hr = 0.05 + 0.1 * fract(hole[1] * 7.3);
      const pore = hole[1] > 0.82 ? smooth(hr, hr * 0.35, hole[0]) : 0;
      const stain = smooth(0.0, 0.5, tfbm(u, v, 2, 2, 3, 59));
      mix3(tmp, base, light, clamp(0.45 + 0.9 * mott, 0, 1));
      mixInto(tmp, cell[1] > 0.5 ? light : dark, grain * 0.22);
      mixInto(tmp, dark, clamp(stain * 0.28 + pore * 0.75, 0, 1));
      const k = 1 + 0.05 * fine;
      o[0][0] = clamp(tmp[0] * k, 0, 1);
      o[0][1] = clamp(tmp[1] * k, 0, 1);
      o[0][2] = clamp(tmp[2] * k, 0, 1);
      o[0][3] = clamp(0.5 + 0.7 * tfbm(u, v, 5, 5, 3, 61), 0, 1);
      o[1][0] = o[1][1] = o[1][2] = clamp(0.62 + 0.12 * fine + 0.06 * mott + 0.06 * grain - 0.5 * pore, 0, 1);
    });
  });
}

/**
 * Tileable bark (u around the log, v along it): meandering ridges along the trunk separated by
 * dark furrows, the ridges broken across here and there, with fibrous streaks.
 */
function barkTextures() {
  return cached('tex:obstacle:bark', () => {
    const N = 17; // ridges around the log
    const ridge = hex3(0x54473a), ridgeLight = hex3(0x7b6c5a), furrow = hex3(0x1f1812), tmp = [0, 0, 0];
    return genTextures(256, 256, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      const x = u * N + 0.75 * tfbm(u, v, 2, 1, 3, 71) + 0.3 * tfbm(u, v, 6, 5, 2, 73);
      const f = fract(x), e = Math.min(f, 1 - f); // 0 on a furrow line, 0.5 on a ridge crest
      const wid = 0.13 + 0.12 * tfbm(u, v, 4, 6, 2, 75);
      const fur = smooth(wid, wid * 0.2, e);
      const id = ((Math.floor(x) % N) + N) % N, h = fract(id * 0.618 + 0.13);
      const fv = fract(v * 5 + h * 3.1);
      const cross = h > 0.45 ? smooth(0.02, 0.0, Math.min(fv, 1 - fv)) * smooth(0.08, 0.2, e) : 0;
      const streak = pnoise2(u * 96, v * 10, 96, 10, 79) * 0.5 + pnoise2(u * 200, v * 24, 200, 24, 83) * 0.3;
      const blot = tfbm(u, v, 3, 2, 3, 77);
      mix3(tmp, ridge, ridgeLight, clamp(0.35 + 0.8 * streak + 0.6 * (e - 0.25) + 0.5 * blot, 0, 1));
      mixInto(tmp, furrow, clamp(fur + cross, 0, 1) * 0.92);
      o[0][0] = tmp[0];
      o[0][1] = tmp[1];
      o[0][2] = tmp[2];
      o[1][0] = o[1][1] = o[1][2] = clamp(0.45 + 0.8 * e - 0.45 * fur - 0.4 * cross + 0.1 * streak, 0, 1);
    });
  });
}

/** Sawn end of the log (circle UV): growth rings around a dark pith, checking cracks, bark rim. */
function endGrainTexture() {
  return cached('tex:obstacle:endgrain', () => {
    const light = hex3(0xd4b27c), late = hex3(0xa47c4a), heart = hex3(0xb98b56), bark = hex3(0x3b2c1f), tmp = [0, 0, 0];
    const cracks = [0.6, 2.3, 4.4];
    return genTextures(128, 128, [{ srgb: true, wrap: false }], (u, v, o) => {
      const dx = u - 0.5, dy = v - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const a = Math.atan2(dy, dx);
      const warp = 0.025 * tfbm(u, v, 3, 3, 3, 89);
      const ring = fract((r + warp) * 13);
      mix3(tmp, light, late, smooth(0.6, 0.85, ring) * (1 - smooth(0.9, 1, ring)) * 0.75 + 0.1 * pnoise2(u * 32, v * 32, 32, 32, 97));
      mixInto(tmp, heart, (1 - smooth(0.45, 0.65, r)) * 0.4);
      // checking: thin radial cracks opening toward the rim
      for (const c of cracks) {
        let d = (((a - c) % TAU) + TAU) % TAU;
        d = Math.min(d, TAU - d);
        mixInto(tmp, bark, smooth(0.03, 0.0, d * r) * smooth(0.3, 0.65, r) * 0.75);
      }
      mixInto(tmp, late, smooth(0.06, 0.0, r) * 0.9);
      mixInto(tmp, bark, smooth(0.86, 0.9, r));
      o[0][0] = tmp[0];
      o[0][1] = tmp[1];
      o[0][2] = tmp[2];
    })[0];
  });
}

/** Soft contact shadow for a w x d footprint (alpha in G, as three's alphaMap reads it). */
function contactTexture(w, d, soft) {
  return cached(`tex:obstacle:contact:${w.toFixed(3)}:${d.toFixed(3)}:${soft.toFixed(3)}`, () => {
    const W = w + 2 * soft, D = d + 2 * soft;
    const nx = 64, nz = clamp(Math.round((64 * D) / W), 8, 64);
    return genTextures(nx, nz, [{ srgb: false, wrap: false }], (u, v, o) => {
      // signed distance to the footprint rectangle (m)
      const qx = Math.abs((u - 0.5) * W) - w / 2, qz = Math.abs((v - 0.5) * D) - d / 2;
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
      const a = 1 - smooth(-soft * 0.25, soft, sd);
      o[0][0] = o[0][1] = o[0][2] = Math.pow(a, 1.6);
    })[0];
  });
}

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------
/**
 * Concrete with edge darkening: every box carries its half size, the vertex position relative to
 * its centre, and per face which of its boundaries are real edges (masks for the - and + side of
 * each axis). The fragment shader darkens a thin, grime-modulated band along those edges, and
 * the bottom few centimetres where the concrete meets the floor.
 */
function concreteMaterial() {
  return cached('mat:obstacle:concrete', () => {
    const [map, bump] = concreteTextures();
    const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.9, roughness: 0.92, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 aRel;
          attribute vec3 aHalf;
          attribute vec3 aMaskN;
          attribute vec3 aMaskP;
          varying vec3 vRel;
          varying vec3 vHalf;
          varying vec3 vMaskN;
          varying vec3 vMaskP;
          varying float vWorldY;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vRel = aRel;
          vHalf = aHalf;
          vMaskN = aMaskN;
          vMaskP = aMaskP;
          vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vRel;
          varying vec3 vHalf;
          varying vec3 vMaskN;
          varying vec3 vMaskP;
          varying float vWorldY;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec3 eDist = vHalf - abs(vRel);
          eDist = mix(vec3(1.0), eDist, mix(vMaskN, vMaskP, step(0.0, vRel)));
          float eD = min(min(eDist.x, eDist.y), eDist.z);
          float grime = texture2D(map, vMapUv * 1.73 + 0.31).a;
          diffuseColor.rgb *= 1.0 - 0.38 * (1.0 - smoothstep(0.0, 0.012 + 0.04 * grime, eD));
          diffuseColor.rgb *= mix(0.64, 1.0, smoothstep(0.0, 0.07, vWorldY));`,
        );
    };
    m.customProgramCacheKey = () => 'obstacle-concrete-v1';
    m.name = 'obstacleConcrete';
    return m;
  });
}

function barkMaterial() {
  return cached('mat:obstacle:bark', () => {
    const [map, bump] = barkTextures();
    return new THREE.MeshStandardMaterial({ name: 'obstacleBark', map, bumpMap: bump, bumpScale: 2.2, roughness: 0.95, metalness: 0 });
  });
}

function endGrainMaterial() {
  return cached('mat:obstacle:endgrain', () => new THREE.MeshStandardMaterial({ name: 'obstacleEndGrain', map: endGrainTexture(), roughness: 0.88, metalness: 0 }));
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
/** Does point p (array) lie inside one of the boxes (or below the floor)? */
function insideAny(p, boxes, skip) {
  if (p[1] < 0) return true;
  for (const b of boxes) {
    if (b === skip) continue;
    if (Math.abs(p[0] - b.c[0]) < b.h[0] && Math.abs(p[1] - b.c[1]) < b.h[1] && Math.abs(p[2] - b.c[2]) < b.h[2]) return true;
  }
  return false;
}

const snap = (x) => Math.round(x * 1e5) / 1e5;

/**
 * Box parts as one watertight surface: the parts of a face inside a neighbouring box
 * are left out (no hidden faces flickering along the joints), every face is split on the grid of
 * all part boundaries (adjoining faces share their vertices: no T-junction cracks), the bottoms on
 * the floor are dropped. UVs are in metres, continuous
 * across the parts; the edge attributes are read by concreteMaterial(): a boundary of a face is an
 * edge unless the face continues into another part (or the floor) just beyond it.
 */
function boxesGeometry(parts) {
  const boxes = parts.map((p) => {
    const h = p.box.map((s) => s / 2);
    return { c: p.at, h, min: p.at.map((c, k) => snap(c - h[k])), max: p.at.map((c, k) => snap(c + h[k])) };
  });
  const grid = [0, 1, 2].map((k) => [...new Set(boxes.flatMap((b) => [b.min[k], b.max[k]]))].sort((p, q) => p - q));
  const pos = [], nor = [], uv = [], rel = [], half = [], mN = [], mP = [], idx = [];
  for (const b of boxes) {
    for (let n = 0; n < 3; n++) {
      const u = (n + 1) % 3, v = (n + 2) % 3; // e_u x e_v = e_n
      for (const sn of [-1, 1]) {
        const pc = sn > 0 ? b.max[n] : b.min[n];
        if (n === 1 && sn < 0 && pc < 1e-6) continue;
        // the parts of this face that a neighbour covers (it continues just beyond the face)
        const covers = [];
        for (const o of boxes) {
          if (o === b || !(o.min[n] < pc + sn * 1e-4 && o.max[n] > pc + sn * 1e-4)) continue;
          const u0 = Math.max(o.min[u], b.min[u]), u1 = Math.min(o.max[u], b.max[u]);
          const v0 = Math.max(o.min[v], b.min[v]), v1 = Math.min(o.max[v], b.max[v]);
          if (u0 < u1 && v0 < v1) covers.push([u0, u1, v0, v1]);
        }
        // which boundaries of this face are edges: probe just past each one, 2 mm under the face
        const mask = [[0, 0, 0], [0, 0, 0]];
        for (const k of [u, v]) {
          const j = 3 - n - k;
          for (const sk of [-1, 1]) {
            let internal = false;
            for (const f of [-0.5, 0, 0.5]) {
              const q = [0, 0, 0];
              q[n] = b.c[n] + sn * (b.h[n] - 0.002);
              q[k] = b.c[k] + sk * (b.h[k] + 0.01);
              q[j] = b.c[j] + f * b.h[j];
              if (insideAny(q, boxes, b)) internal = true;
            }
            mask[sk < 0 ? 0 : 1][k] = internal ? 0 : 1;
          }
        }
        const U = grid[u].filter((x) => x >= b.min[u] && x <= b.max[u]), V = grid[v].filter((x) => x >= b.min[v] && x <= b.max[v]);
        const ua = n === 0 ? 2 : 0, va = n === 1 ? 2 : 1;
        for (let i = 0; i + 1 < U.length; i++) {
          for (let jj = 0; jj + 1 < V.length; jj++) {
            const cu = (U[i] + U[i + 1]) / 2, cv = (V[jj] + V[jj + 1]) / 2;
            if (covers.some((r) => cu > r[0] && cu < r[1] && cv > r[2] && cv < r[3])) continue;
            const base = pos.length / 3;
            for (const [a, c] of [[U[i], V[jj]], [U[i + 1], V[jj]], [U[i + 1], V[jj + 1]], [U[i], V[jj + 1]]]) {
              const P = [0, 0, 0];
              P[n] = pc;
              P[u] = a;
              P[v] = c;
              const N = [0, 0, 0];
              N[n] = sn;
              pos.push(...P);
              nor.push(...N);
              uv.push(P[ua] / CONCRETE_TILE, P[va] / CONCRETE_TILE);
              rel.push(P[0] - b.c[0], P[1] - b.c[1], P[2] - b.c[2]);
              half.push(...b.h);
              mN.push(...mask[0]);
              mP.push(...mask[1]);
            }
            if (sn > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
          }
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aRel', new THREE.Float32BufferAttribute(rel, 3));
  g.setAttribute('aHalf', new THREE.Float32BufferAttribute(half, 3));
  g.setAttribute('aMaskN', new THREE.Float32BufferAttribute(mN, 3));
  g.setAttribute('aMaskP', new THREE.Float32BufferAttribute(mP, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Log lying along local x: open bark cylinder (UV v in circumferences) and two end-grain caps. */
function logGeometry(p) {
  const r = p.cyl, len = p.len;
  const side = new THREE.CylinderGeometry(r, r, len, 28, 1, true);
  const uv = side.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / (TAU * r));
  side.rotateZ(-Math.PI / 2);
  side.translate(p.at[0], p.at[1], p.at[2]);
  const caps = [1, -1].map((s) => {
    const c = new THREE.CircleGeometry(r, 28);
    c.rotateY((s * Math.PI) / 2);
    c.translate(p.at[0] + (s * len) / 2, p.at[1], p.at[2]);
    return c;
  });
  return { side, caps: mergeGeometries(caps, false) };
}

/** Two pine boards side by side filling the part's box (grain along x), tinted per board. */
function plankGeometry(p) {
  const [sx, sy, sz] = p.box, gap = 0.004, n = 2, w = (sz - gap * (n - 1)) / n;
  const tints = [[0.86, 0.84, 0.8], [0.78, 0.75, 0.7]];
  const geos = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.BoxGeometry(sx, sy, w);
    const z = -sz / 2 + w / 2 + k * (w + gap);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, cnt = pos.count;
    const col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      const x = pos.getX(i), y = pos.getY(i), zz = pos.getZ(i) + z;
      const across = Math.abs(nor.getY(i)) > 0.5 ? zz : y;
      // end grain faces get the cross-section of the board
      if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, zz / 0.25 + k * 0.37, y / 0.25);
      else uv.setXY(i, x / 0.5 + k * 0.53, across / 0.25 + k * 0.29);
      col.set(tints[k], i * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.translate(p.at[0], p.at[1], p.at[2] + z);
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}

/** Flat, soft contact shadow under the whole footprint (render only: no shadows of its own). */
function contactShadow(type) {
  const fp = obstacleFootprint(type);
  const w = fp.maxX - fp.minX, d = fp.maxZ - fp.minZ;
  const log = OBSTACLES[type].parts.some((p) => p.cyl);
  // a lying log touches the floor along a line; boxes along their whole base
  const cw = w, cd = log ? 0.1 : d;
  const soft = log ? 0.12 : clamp(0.1 + 0.4 * fp.height, 0.12, 0.32);
  const geo = new THREE.PlaneGeometry(cw + 2 * soft, cd + 2 * soft);
  geo.rotateX(-Math.PI / 2);
  const mat = cached(`mat:obstacle:contact:${type}`, () =>
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: contactTexture(cw, cd, soft),
      transparent: true,
      opacity: log ? 0.6 : 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    }),
  );
  const m = new THREE.Mesh(geo, mat);
  m.position.set((fp.minX + fp.maxX) / 2, 0.0015, (fp.minZ + fp.maxZ) / 2);
  m.name = 'contactShadow';
  m.renderOrder = 1;
  return m;
}

function buildObstacle(type) {
  const def = OBSTACLES[type];
  const g = new THREE.Group();
  if (type === 'crate') {
    // the throwable crate's planks, frames and braces at 70 cm (thicker boards for a bigger crate)
    const p = def.parts[0];
    const c = createThrowableMesh('crate');
    c.scale.setScalar(p.box[0] / 0.45);
    c.position.set(p.at[0], p.at[1], p.at[2]);
    g.add(c);
  } else if (def.material === 'concrete') {
    g.add(new THREE.Mesh(boxesGeometry(def.parts.filter((p) => p.box)), concreteMaterial()));
  } else {
    for (const p of def.parts) {
      if (p.cyl) {
        const lg = logGeometry(p);
        g.add(new THREE.Mesh(lg.side, barkMaterial()));
        g.add(new THREE.Mesh(lg.caps, endGrainMaterial()));
      } else g.add(new THREE.Mesh(plankGeometry(p), getMat('crateWood')));
    }
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  g.add(contactShadow(type));
  g.name = 'obstacle:' + type;
  g.userData.obstacleType = type;
  return g;
}

/**
 * Visual for an obstacle body: the returned Group's frame is the prop's frame (origin on the
 * floor), so copy the body pose onto it. Clones share geometry and materials.
 */
export function createObstacleMesh(type) {
  if (!OBSTACLES[type]) throw new Error(`createObstacleMesh: unknown type '${type}'`);
  return cached('tpl:obstacle:' + type, () => buildObstacle(type)).clone(true);
}

/** Take an obstacle mesh out of the scene (its geometry, materials and textures are shared and cached, so they stay). */
export function disposeObstacleMesh(obj) {
  obj.removeFromParent();
}

// ---------------------------------------------------------------------------------------------
// Placement ghost
// ---------------------------------------------------------------------------------------------
const GHOST = {
  // drawn over coincident surfaces (the removal preview sits exactly on the prop it marks)
  fill: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  edge: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }),
};

function ghostGeometries(type) {
  return cached('geo:obstacle:ghost:' + type, () => {
    const parts = OBSTACLES[type].parts, geos = [];
    // boxes as one surface, so a stair's ghost shows its outline and no joints between the steps
    if (parts.some((p) => p.box)) geos.push(boxesGeometry(parts.filter((p) => p.box)));
    for (const p of parts.filter((q) => q.cyl)) {
      const g = new THREE.CylinderGeometry(p.cyl, p.cyl, p.len, 24);
      g.rotateZ(Math.PI / 2);
      g.translate(p.at[0], p.at[1], p.at[2]);
      geos.push(g);
    }
    return geos.map((g) => ({ fill: g, edge: new THREE.EdgesGeometry(g, 30) }));
  });
}

/** Translucent preview of an obstacle (render only). Recolour all ghosts with setObstacleGhostColor. */
export function createObstacleGhost(type) {
  const g = new THREE.Group();
  for (const p of ghostGeometries(type)) {
    const f = new THREE.Mesh(p.fill, GHOST.fill);
    const e = new THREE.LineSegments(p.edge, GHOST.edge);
    f.renderOrder = e.renderOrder = 8;
    g.add(f, e);
  }
  g.name = 'ghost:' + type;
  return g;
}

export function setObstacleGhostColor(hex) {
  GHOST.fill.color.setHex(hex);
  GHOST.edge.color.setHex(hex);
}
