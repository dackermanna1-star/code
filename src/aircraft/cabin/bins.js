// Boeing Sky Interior PIVOT overhead bins: the whole bucket rotates down about
// a pivot near its lower outboard edge (face top swings down & towards the
// aisle, opening the bin at the top). Instanced buckets (both sides via a
// 180° yaw), latch handles, row/seat placards, business accent strips and
// procedural luggage (roller bags, backpacks, duffels, coats, airline blanket
// packs & pillows) that moves with its bin.
import * as THREE from 'three';
import { ROWS, ZONES } from '../../core/constants.js';
import { rng, clamp } from '../../core/util.js';
import { GeoBuilder, extrudeProfile, roundedBoxGeometry } from './geom.js';
import { PROF, binOuterProfile, binFacePoint, BIN_BACK_R, CY, arcX } from './profile.js';
import { bakeAt } from './bake.js';
import { CABIN_Z0, CABIN_Z1 } from './shell.js';

const GAP = 0.008;
const WALL = 0.012;
const OPEN_ANGLE = (PROF.binOpenDeg * Math.PI) / 180;
const PIV = PROF.binPivot;

/** Bin segments along the cabin (same for both sides). */
export function binLayout() {
  const segs = [];
  const bz0 = CABIN_Z0 + 0.03, bz1 = ZONES.classDividerZ, ez1 = CABIN_Z1 - 0.02;
  const nb = 3, ne = 12;
  for (let i = 0; i < nb; i++) segs.push({ cls: 'business', z0: bz0 + (bz1 - bz0) * i / nb, z1: bz0 + (bz1 - bz0) * (i + 1) / nb });
  for (let i = 0; i < ne; i++) segs.push({ cls: 'economy', z0: bz1 + (ez1 - bz1) * i / ne, z1: bz1 + (ez1 - bz1) * (i + 1) / ne });
  return segs;
}

/** Bucket geometry (right side, unit length along z centred at 0) with groups: 0 = outer, 1 = interior. */
function bucketGeometry() {
  const outerP = binOuterProfile();
  const n = outerP.length;
  // inward offset polyline
  const innerP = outerP.map((p, i) => {
    const a = outerP[Math.max(0, i - 1)], c = outerP[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    // outer normal for a profile going face-top -> lip -> floor -> back (interior on the left of travel)
    const nx = ty, ny = -tx;
    return [p[0] - nx * WALL, p[1] - ny * WALL];
  });
  const zs = [-0.5, -0.25, 0, 0.25, 0.5];
  const outer = new GeoBuilder('binOuter');
  extrudeProfile(outer, outerP, zs, { flip: false, uScale: 2, vScale: 1, bake: (x, y, z, nx, ny, nz) => bakeAt(x, y, z, nx, ny, nz) });
  // fix normals orientation: outward
  const fixOut = (b) => {
    for (let i = 0; i < b.n; i++) {
      const x = b.pos[i * 3], y = b.pos[i * 3 + 1];
      // interior centre of the bucket section
      const cx = 1.0, cy = 1.82;
      const dx = x - cx, dy = y - cy;
      if (dx * b.nrm[i * 3] + dy * b.nrm[i * 3 + 1] < 0) { b.nrm[i * 3] *= -1; b.nrm[i * 3 + 1] *= -1; }
    }
  };
  fixOut(outer);
  orientTris(outer, 1.0, 1.82, true);
  const inner = new GeoBuilder('binInner');
  inner.defaultBake = [0.05, 0.01, 0.5, 0];
  extrudeProfile(inner, innerP, zs.map((z) => z * (1 - 2 * WALL)), { flip: true, uScale: 3, vScale: 3, bake: [0.3, 0.05, 0.8, 0] });
  for (let i = 0; i < inner.n; i++) {
    const x = inner.pos[i * 3], y = inner.pos[i * 3 + 1];
    if ((x - 1.0) * inner.nrm[i * 3] + (y - 1.82) * inner.nrm[i * 3 + 1] > 0) { inner.nrm[i * 3] *= -1; inner.nrm[i * 3 + 1] *= -1; }
  }
  orientTris(inner, 1.0, 1.82, false);
  // rims (top edges of face and back wall)
  const rim = (o, iP, zsA) => {
    outer.grid(1, zsA.length - 1, (i, j, oo) => {
      const p = i === 0 ? o : iP;
      oo.p = [p[0], p[1], zsA[j]]; oo.n = [0, 1, 0]; oo.uv = [i, j]; oo.bake = [0.3, 0, 0.8, 0];
    });
  };
  rim(outerP[0], innerP[0], zs);
  rim(outerP[n - 1], innerP[n - 1], zs);
  // end plates (outer at +-0.5, inner at +-(0.5 - WALL))
  const capPoly = (P) => P.map(([x, y]) => new THREE.Vector2(x, y));
  const trisO = THREE.ShapeUtils.triangulateShape(capPoly(outerP), []);
  const trisI = THREE.ShapeUtils.triangulateShape(capPoly(innerP), []);
  for (const zc of [-0.5, 0.5]) {
    const s = Math.sign(zc);
    const b0 = outer.n;
    for (const p of outerP) outer.vert(p[0], p[1], zc, 0, 0, s, p[0] * 2, p[1] * 2, [0.08, 0.02, 0.3, 0]);
    for (const t of trisO) s > 0 ? outer.tri(b0 + t[0], b0 + t[1], b0 + t[2]) : outer.tri(b0 + t[0], b0 + t[2], b0 + t[1]);
    const zi = zc - s * WALL;
    const b1 = inner.n;
    for (const p of innerP) inner.vert(p[0], p[1], zi, 0, 0, -s, p[0] * 3, p[1] * 3, [0.26, 0.04, 0.72, 0]);
    for (const t of trisI) s > 0 ? inner.tri(b1 + t[0], b1 + t[2], b1 + t[1]) : inner.tri(b1 + t[0], b1 + t[1], b1 + t[2]);
  }
  fixCapWinding(outer); fixCapWinding(inner);
  const all = new GeoBuilder('bucket').append(outer);
  const split = all.idx.length;
  all.append(inner);
  const g = all.build();
  g.clearGroups();
  g.addGroup(0, split, 0);
  g.addGroup(split, all.idx.length - split, 1);
  return g;
}

/** Make each triangle face away from (outward) or towards (inward) the section centre (cx, cy) in xy. */
function orientTris(b, cx, cy, outward) {
  for (let i = 0; i < b.idx.length; i += 3) {
    const ia = b.idx[i], ib = b.idx[i + 1], ic = b.idx[i + 2];
    const ax = b.pos[ia * 3], ay = b.pos[ia * 3 + 1], az = b.pos[ia * 3 + 2];
    const ux = b.pos[ib * 3] - ax, uy = b.pos[ib * 3 + 1] - ay, uz = b.pos[ib * 3 + 2] - az;
    const vx = b.pos[ic * 3] - ax, vy = b.pos[ic * 3 + 1] - ay, vz = b.pos[ic * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
    const d = nx * (ax - cx) + ny * (ay - cy);
    if ((d < 0) === outward && Math.abs(d) > 1e-12) { b.idx[i + 1] = ic; b.idx[i + 2] = ib; }
  }
}
function fixCapWinding(b) {
  // end-cap triangles: face along their vertex normal (z)
  for (let i = 0; i < b.idx.length; i += 3) {
    const ia = b.idx[i], ib = b.idx[i + 1], ic = b.idx[i + 2];
    const nz0 = b.nrm[ia * 3 + 2];
    if (Math.abs(nz0) < 0.9) continue;
    const ax = b.pos[ia * 3], ay = b.pos[ia * 3 + 1];
    const ux = b.pos[ib * 3] - ax, uy = b.pos[ib * 3 + 1] - ay, vx = b.pos[ic * 3] - ax, vy = b.pos[ic * 3 + 1] - ay;
    const cz = ux * vy - uy * vx;
    if (cz * nz0 < 0) { b.idx[i + 1] = ic; b.idx[i + 2] = ib; }
  }
}

// ----------------------------------------------------------------------------- luggage
function luggageGeometries() {
  const G = {};
  // hard-shell roller lying flat, wheels towards the back wall (local +x)
  {
    const b = new GeoBuilder('roller');
    b.defaultBake = [0.05, 0.02, 0.6, 0];
    b.addGeometry(roundedBoxGeometry(0.30, 0.17, 0.44, 0.035, 3), null, [0.06, 0.02, 0.6, 0]);
    // ribs
    for (const dz of [-0.12, 0, 0.12]) b.addGeometry(roundedBoxGeometry(0.29, 0.175, 0.02, 0.008, 1), new THREE.Matrix4().makeTranslation(0, 0, dz), [0.06, 0.02, 0.6, 0]);
    // wheels + handle housing
    const wheel = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12).rotateZ(Math.PI / 2);
    for (const dz of [-0.17, 0.17]) b.addGeometry(wheel, new THREE.Matrix4().makeTranslation(0.16, -0.06, dz), [0.03, 0.01, 0.5, 0]);
    b.addGeometry(roundedBoxGeometry(0.025, 0.03, 0.2, 0.008, 1), new THREE.Matrix4().makeTranslation(0.155, 0.04, 0), [0.03, 0.01, 0.5, 0]);
    G.roller = b.build();
  }
  // backpack lying on its back
  {
    const b = new GeoBuilder('backpack');
    b.addGeometry(roundedBoxGeometry(0.28, 0.15, 0.36, 0.06, 3), null, [0.06, 0.02, 0.6, 0]);
    b.addGeometry(roundedBoxGeometry(0.2, 0.07, 0.2, 0.03, 2), new THREE.Matrix4().makeTranslation(-0.01, 0.09, -0.05), [0.07, 0.02, 0.65, 0]);
    const strap = new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI).rotateY(Math.PI / 2);
    b.addGeometry(strap, new THREE.Matrix4().makeTranslation(0.08, 0.04, 0.12), [0.05, 0.02, 0.6, 0]);
    G.backpack = b.build();
  }
  // soft duffel
  {
    const b = new GeoBuilder('duffel');
    const cap = new THREE.CapsuleGeometry(0.1, 0.32, 6, 14).rotateX(Math.PI / 2);
    b.addGeometry(cap, new THREE.Matrix4().makeScale(1.25, 0.85, 1), [0.06, 0.02, 0.6, 0]);
    G.duffel = b.build();
  }
  // airline blanket pack (plastic-wrapped) and pillow
  G.blanket = roundedBoxGeometry(0.26, 0.07, 0.34, 0.02, 2);
  G.pillow = roundedBoxGeometry(0.24, 0.1, 0.34, 0.05, 3);
  // folded coat: a slab with gentle waves
  {
    const g = new THREE.BoxGeometry(0.3, 0.05, 0.46, 6, 1, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) + Math.sin(z * 17 + x * 9) * 0.008 + Math.cos(x * 23) * 0.005);
    }
    g.computeVertexNormals();
    G.coat = g;
  }
  for (const k of Object.keys(G)) if (!G[k].attributes.bake) {
    const n = G[k].attributes.position.count, arr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) arr.set([0.06, 0.02, 0.6, 0], i * 4);
    G[k].setAttribute('bake', new THREE.BufferAttribute(arr, 4));
  }
  return G;
}

export function createBins(app, M, tex, root) {
  const group = new THREE.Group();
  group.name = 'cabin-bins';
  root.add(group);
  const segs = binLayout();
  const bins = [];
  for (const side of ['left', 'right']) for (const s of segs) bins.push({ ...s, side });

  const geo = bucketGeometry();
  const buckets = new THREE.InstancedMesh(geo, [M.bin, M.binInterior], bins.length);
  buckets.name = 'cabin-bin-buckets';
  buckets.castShadow = true; buckets.receiveShadow = true;
  buckets.frustumCulled = false;
  group.add(buckets);

  // --- latch handles (recess + bar) -------------------------------------------------------
  const fp = binFacePoint(0.16);
  const latchFrame = new THREE.Matrix4().makeTranslation(fp.x, fp.y, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(fp.ny, fp.nx)));
  const latchB = new GeoBuilder('latch');
  latchB.addGeometry(roundedBoxGeometry(0.012, 0.045, 0.26, 0.006, 1), new THREE.Matrix4().makeTranslation(-0.002, 0, 0), [0.1, 0.02, 0.5, 0]);
  const latchBar = new GeoBuilder('latchBar');
  latchBar.addGeometry(roundedBoxGeometry(0.014, 0.022, 0.23, 0.007, 1), new THREE.Matrix4().makeTranslation(0.004, -0.006, 0), [0.25, 0.02, 0.85, 0]);
  const latchRecess = new THREE.InstancedMesh(latchB.build().applyMatrix4(latchFrame), M.darkPlastic, bins.length);
  const latchHandle = new THREE.InstancedMesh(latchBar.build().applyMatrix4(latchFrame), M.greyPlastic, bins.length);
  latchRecess.name = 'cabin-bin-latch-recess'; latchHandle.name = 'cabin-bin-latch';
  for (const m of [latchRecess, latchHandle]) { m.frustumCulled = false; m.receiveShadow = true; group.add(m); }

  // --- business accent strips along the lip -----------------------------------------------
  const nBus = bins.filter((b) => b.cls === 'business').length;
  const lipP = binFacePoint(0.97);
  const accentGeo = new THREE.BoxGeometry(0.004, 0.012, 1).translate(lipP.x - 0.002, lipP.y - 0.01, 0);
  accentGeo.setAttribute('bake', new THREE.BufferAttribute(new Float32Array(accentGeo.attributes.position.count * 4).fill(0.3), 4));
  const accents = new THREE.InstancedMesh(accentGeo, M.chrome, Math.max(1, nBus));
  accents.name = 'cabin-bin-accents'; accents.frustumCulled = false;
  group.add(accents);

  // --- placards (instanced quads with per-instance atlas rect) -------------------------------
  const placards = [];
  const pfp = binFacePoint(0.9);
  for (const r of ROWS) {
    for (const side of ['left', 'right']) {
      const bi = bins.findIndex((b) => b.side === side && r.z >= b.z0 && r.z < b.z1);
      if (bi < 0) continue;
      placards.push({ bin: bi, z: r.z, rect: tex.placardRect(`row-${r.row}-${side === 'left' ? 'L' : 'R'}`), w: 0.12, h: 0.03, t: 0.9 });
    }
  }
  // EXIT placards on the bins above the over-wing exits, fire extinguisher label in the first left bin
  for (const side of ['left', 'right']) {
    for (const zz of [-0.566, 0.45]) {
      const bi = bins.findIndex((b) => b.side === side && zz >= b.z0 && zz < b.z1);
      if (bi >= 0) placards.push({ bin: bi, z: zz, rect: tex.placardRect('exit-bin'), w: 0.17, h: 0.053, t: 0.42 });
    }
  }
  const fb = bins.findIndex((b) => b.side === 'left');
  placards.push({ bin: fb, z: (bins[fb].z0 + bins[fb].z1) / 2 + 0.3, rect: tex.placardRect('nosmoking-lav'), w: 0.15, h: 0.037, t: 0.62 });
  const plGeo = new THREE.PlaneGeometry(1, 1).rotateY(-Math.PI / 2);   // normal -x (towards the aisle on the right side)
  plGeo.setAttribute('bake', new THREE.BufferAttribute(new Float32Array(plGeo.attributes.position.count * 4).fill(0).map((v, i) => [0.3, 0.02, 1, 0][i % 4]), 4));
  const plMat = M.placard.clone();
  const prevOBC = M.placard.onBeforeCompile;
  plMat.onBeforeCompile = (shader, r) => {
    prevOBC(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = mix(uvRect.xy, uvRect.zw, uv);\n#endif');
  };
  plMat.customProgramCacheKey = () => 'cabinBakeplacardInst';
  const plMesh = new THREE.InstancedMesh(plGeo, plMat, placards.length);
  plMesh.name = 'cabin-bin-placards'; plMesh.frustumCulled = false;
  const rects = new Float32Array(placards.length * 4);
  placards.forEach((p, i) => rects.set(p.rect, i * 4));
  plGeo.setAttribute('uvRect', new THREE.InstancedBufferAttribute(rects, 4));
  group.add(plMesh);

  // --- luggage ----------------------------------------------------------------------------------
  const LG = luggageGeometries();
  const R = rng(73713);
  const lug = { roller: [], backpack: [], duffel: [], blanket: [], pillow: [], coat: [] };
  const palettes = {
    roller: ['#1d1f24', '#23324d', '#4a4e55', '#5b1f27', '#9aa0a6', '#2f4a3c'],
    backpack: ['#222428', '#3a3f45', '#4d5a3a', '#8a2b2b', '#24406b'],
    duffel: ['#2a2c30', '#5a4632', '#1f3550'],
    blanket: ['#1f4f7a'], pillow: ['#eeeeea'], coat: ['#2b2b2e', '#5e4b3a', '#3d4a5c', '#7a6f62'],
  };
  bins.forEach((b, bi) => {
    const len = b.z1 - b.z0 - GAP;
    const roll = R();
    const items = [];
    if (b.cls === 'business' && roll < 0.55) {
      items.push(['pillow', -len * 0.25], ['blanket', len * 0.15]);
    } else if (roll < 0.22) {
      items.push(['blanket', -len * 0.3], ['blanket', -len * 0.3, 0.075], ['pillow', len * 0.05], ['blanket', len * 0.32]);
    } else if (roll < 0.36) {
      items.push(['roller', -len * 0.2], [R() < 0.5 ? 'backpack' : 'coat', len * 0.26]);
    } else if (roll < 0.44) {
      items.push([R() < 0.5 ? 'duffel' : 'backpack', 0]);
    } else if (roll < 0.5) {
      items.push(['coat', -len * 0.1]);
    }
    for (const [type, dz, stack = 0] of items) {
      const pal = palettes[type];
      const col = new THREE.Color(pal[Math.floor(R() * pal.length)]).convertSRGBToLinear();
      col.multiplyScalar(0.85 + R() * 0.3);
      // local placement in the closed right-side bucket (floor at ~1.634)
      const h = { roller: 0.085, backpack: 0.08, duffel: 0.085, blanket: 0.036, pillow: 0.05, coat: 0.026 }[type];
      const x = { roller: 0.98, backpack: 0.97, duffel: 0.99, blanket: 0.96, pillow: 1.0, coat: 0.98 }[type] + (R() - 0.5) * 0.04;
      const yaw = (R() - 0.5) * 0.25;
      const local = new THREE.Matrix4().compose(new THREE.Vector3(x, 1.634 + h + stack, dz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, (R() - 0.5) * 0.06)), new THREE.Vector3(1, 1, 1));
      lug[type].push({ bin: bi, local, color: col });
    }
  });
  const lugMeshes = {};
  for (const type of Object.keys(lug)) {
    if (!lug[type].length) continue;
    const mat = type === 'roller' || type === 'blanket' ? M.luggage : M.luggageSoft;
    const im = new THREE.InstancedMesh(LG[type], mat, lug[type].length);
    im.name = 'cabin-luggage-' + type; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
    lug[type].forEach((it, i) => im.setColorAt(i, it.color));
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
    lugMeshes[type] = im;
  }
  const lugGroup = Object.values(lugMeshes);

  // --- pick proxies ------------------------------------------------------------------------------
  const proxyGeo = new THREE.BoxGeometry(0.12, 0.42, 1).translate(0.82, 1.84, 0);
  const proxies = new THREE.InstancedMesh(proxyGeo, new THREE.MeshBasicMaterial({ visible: false }), bins.length);
  proxies.name = 'cabin-bin-proxies';
  group.add(proxies);

  // --- matrices ----------------------------------------------------------------------------------
  const Bm = new THREE.Matrix4(), Tm = new THREE.Matrix4(), Sm = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  const rotY = new THREE.Matrix4().makeRotationY(Math.PI);
  function baseMatrix(b, angle, target) {
    const zc = (b.z0 + b.z1) / 2;
    // pivot rotation in the right-side frame
    target.makeTranslation(PIV[0], PIV[1], 0).multiply(Tm.makeRotationZ(angle)).multiply(Sm.makeTranslation(-PIV[0], -PIV[1], 0));
    if (b.side === 'left') target.premultiply(rotY);
    target.premultiply(Tm.makeTranslation(0, 0, zc));
    return target;
  }
  const accentIdx = new Map();
  let ai = 0;
  bins.forEach((b, i) => { if (b.cls === 'business') accentIdx.set(i, ai++); });
  const placardsByBin = bins.map(() => []);
  placards.forEach((p, i) => placardsByBin[p.bin].push(i));
  const lugByBin = bins.map(() => []);
  for (const type of Object.keys(lug)) lug[type].forEach((it, i) => lugByBin[it.bin].push([lugMeshes[type], i, it.local]));
  const plLocal = placards.map((p) => {
    const f = binFacePoint(p.t);
    const zc = (bins[p.bin].z0 + bins[p.bin].z1) / 2;
    const side = bins[p.bin].side;
    const dzLocal = side === 'left' ? -(p.z - zc) : (p.z - zc);
    const rot = Math.atan2(f.ny, f.nx) - Math.PI;   // plane faces -x by default
    return new THREE.Matrix4().makeTranslation(f.x + f.nx * 0.0015, f.y + f.ny * 0.0015, dzLocal)
      .multiply(new THREE.Matrix4().makeRotationZ(rot))
      .multiply(new THREE.Matrix4().makeScale(1, p.h, side === 'left' ? -p.w : p.w));
  });

  function writeBin(i) {
    const b = bins[i];
    baseMatrix(b, b.angle, Bm);
    const len = b.z1 - b.z0 - GAP;
    tmp.copy(Bm).multiply(Sm.makeScale(1, 1, len));
    buckets.setMatrixAt(i, tmp);
    proxies.setMatrixAt(i, tmp);
    latchRecess.setMatrixAt(i, Bm); latchHandle.setMatrixAt(i, Bm);
    if (accentIdx.has(i)) accents.setMatrixAt(accentIdx.get(i), tmp.copy(Bm).multiply(Sm.makeScale(1, 1, len - 0.04)));
    for (const pi of placardsByBin[i]) plMesh.setMatrixAt(pi, tmp.copy(Bm).multiply(plLocal[pi]));
    for (const [im, li, local] of lugByBin[i]) { im.setMatrixAt(li, tmp.copy(Bm).multiply(local)); im.instanceMatrix.needsUpdate = true; }
    buckets.instanceMatrix.needsUpdate = true; proxies.instanceMatrix.needsUpdate = true;
    latchRecess.instanceMatrix.needsUpdate = true; latchHandle.instanceMatrix.needsUpdate = true;
    accents.instanceMatrix.needsUpdate = true; plMesh.instanceMatrix.needsUpdate = true;
  }

  // --- API entries --------------------------------------------------------------------------------
  const active = new Set();
  const list = bins.map((b, i) => {
    b.angle = 0;
    const pos = new THREE.Vector3((b.side === 'left' ? -1 : 1) * 0.85, 1.85, (b.z0 + b.z1) / 2);
    const e = {
      id: `${b.side === 'left' ? 'L' : 'R'}${String(i % segs.length + 1).padStart(2, '0')}`,
      index: i, side: b.side, cls: b.cls, zMin: b.z0, zMax: b.z1, open: false, position: pos,
      get amount() { return b.angle / OPEN_ANGLE; },
      _t: 1, _from: 0, _to: 0, _dur: 1,
      setOpen(v, { sound = true, instant = false } = {}) {
        v = !!v;
        if (instant) { this.open = v; b.angle = v ? OPEN_ANGLE : 0; this._t = 1; writeBin(i); refreshLuggage(); return; }
        if (v === this.open && this._t >= 1) return;
        this.open = v;
        this._from = b.angle; this._to = v ? OPEN_ANGLE : 0; this._t = 0; this._dur = v ? 1.05 : 0.7;
        if (sound) app.audio?.play?.(v ? 'bin_open' : 'bin_close', { position: pos });
        active.add(this);
        refreshLuggage();
      },
      toggle() { this.setOpen(!this.open); },
    };
    return e;
  });
  bins.forEach((b, i) => writeBin(i));
  proxies.computeBoundingSphere();

  function refreshLuggage() {
    const any = list.some((e) => e.open || e._t < 1 || bins[e.index].angle > 1e-4);
    for (const m of lugGroup) m.visible = any;
  }
  refreshLuggage();

  if (app.interactions?.add) {
    list.forEach((e, i) => app.interactions.add({
      object: proxies, instanceId: i, maxDistance: 2.4, priority: 0,
      label: () => (e.open ? 'Close overhead bin' : 'Open overhead bin'),
      onInteract: () => e.toggle(),
    }));
  }

  // opening: quick release then a damped settle (the bucket drops on its damper); closing: push + latch
  const easeOpen = (t) => { const k = 1 - Math.pow(1 - t, 3); return k + Math.sin(t * Math.PI * 2.2) * 0.045 * (1 - t) * t * 4; };
  const easeClose = (t) => (t < 0.85 ? 1 - Math.pow(1 - t / 0.85, 2) : 1);
  function update(dt) {
    if (!active.size) return;
    for (const e of active) {
      e._t = Math.min(1, e._t + dt / e._dur);
      const b = bins[e.index];
      const k = e._to > e._from ? easeOpen(e._t) : easeClose(e._t);
      b.angle = clamp(e._from + (e._to - e._from) * k, -0.02, OPEN_ANGLE * 1.04);
      writeBin(e.index);
      if (e._t >= 1) { b.angle = e._to; writeBin(e.index); active.delete(e); refreshLuggage(); }
    }
  }

  return { list, update, buckets, group };
}
