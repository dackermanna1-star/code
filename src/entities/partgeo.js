// Procedural body-part geometry (lathe profiles with elliptical cross sections).
// Part convention: local +Y along the segment (0..1 normalised for limbs/torso,
// metres for the head), local -Z faces forward, X to the right.
import * as THREE from 'three';

function lathe(profile, segs = 10, sx = 1, sz = 1, extra) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const kx = typeof sx === 'function' ? sx(y) : sx;
    const kz = typeof sz === 'function' ? sz(y) : sz;
    x *= kx; z *= kz;
    if (extra) [x, y, z] = extra(x, y, z);
    pos.setXYZ(i, x, y, z);
  }
  // Remap uv.v to the actual normalised y range so shaders can mask by "along".
  const uv = g.attributes.uv;
  const y0 = profile[0][0], y1 = profile[profile.length - 1][0];
  for (let i = 0; i < uv.count; i++) {
    const y = profile[Math.min(profile.length - 1, Math.round(uv.getY(i) * (profile.length - 1)))][0];
    uv.setY(i, THREE.MathUtils.clamp((y - Math.max(0, y0)) / Math.max(1e-3, Math.min(1, y1) - Math.max(0, y0)), 0, 1));
  }
  g.computeVertexNormals();
  return g;
}

function merge(geos) {
  // simple merge (all have position/normal/uv, indexed)
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; }
    else { for (let i = 0; i < g.attributes.position.count; i++) idx[io++] = i + vo; }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function boxAt(w, h, d, x, y, z, uvY = 0.95) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uvY);
  return g;
}

// Build a complete set of humanoid part geometries. opts tweak the silhouette.
export function buildPartGeometries(opts = {}) {
  const fat = opts.fat ?? 1; // belly scale
  const bulk = opts.bulk ?? 1; // muscle scale for limbs
  const segs = opts.segs ?? 10;
  const torso = lathe([
    [-0.3, 0.02], [-0.26, 0.12], [-0.12, 0.155], [0.05, 0.15 * (0.9 + 0.1 * fat)], [0.3, 0.14 * fat], [0.5, 0.15 * fat], [0.7, 0.165], [0.88, 0.17], [1.0, 0.155], [1.08, 0.1], [1.16, 0.055], [1.24, 0.05],
  ], segs + 2,
  (y) => (y > 0.75 && y < 1.08 ? 1.35 : y < 0 ? 1.2 : 1.18),
  (y) => (y > 0.1 && y < 0.6 ? 0.78 * fat : 0.7));
  const head = (() => {
    const g = new THREE.SphereGeometry(0.108, 14, 12);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      x *= 0.86; y *= 1.12; z *= 1.02;
      // jaw forward/down
      if (y < -0.02 && z < 0) { z *= 1.08; x *= 0.92; }
      // back of skull
      if (z > 0.05) z *= 1.05;
      pos.setXYZ(i, x, y + 0.05, z);
    }
    g.computeVertexNormals();
    // nose
    const nose = new THREE.BoxGeometry(0.03, 0.05, 0.04);
    nose.translate(0, 0.05, -0.11);
    const uvn = nose.attributes.uv;
    for (let i = 0; i < uvn.count; i++) { uvn.setX(i, 0.75); uvn.setY(i, 0.5); }
    return merge([g, nose]);
  })();
  const uarm = lathe([[-0.12, 0.03], [-0.08, 0.06 * bulk], [0.15, 0.063 * bulk], [0.55, 0.052 * bulk], [0.95, 0.045 * bulk], [1.06, 0.035]], segs);
  const farm = lathe([
    [-0.06, 0.03], [-0.02, 0.048 * bulk], [0.35, 0.045 * bulk], [0.82, 0.033], [0.88, 0.036], [0.98, 0.045], [1.1, 0.04], [1.2, 0.022], [1.26, 0.008],
  ], segs, 1, (y) => (y > 0.86 ? 0.5 : 1));
  const thigh = lathe([[-0.12, 0.05], [-0.05, 0.09 * bulk], [0.3, 0.085 * bulk], [0.75, 0.066 * bulk], [1.02, 0.056], [1.08, 0.04]], segs);
  const shinL = lathe([[-0.06, 0.04], [-0.02, 0.058 * bulk], [0.3, 0.06 * bulk], [0.8, 0.042], [0.95, 0.04], [1.0, 0.035]], segs);
  // shoe
  const foot = boxAt(0.095, 0.08, 0.24, 0, 0, 0, 0.97);
  // foot box: attached near ankle; shin geometry y=1 is the ankle joint. In part space Y is scaled by length,
  // so we add the foot through a separate small matrix in the renderer instead of here.
  return { torso, head, uarm, farm, thigh, shin: shinL, foot };
}

// Tall thin variant for smoker, huge for tank etc. are built with opts.
export { lathe, merge, boxAt };
