// Scarlet as a glTF binary (.glb), for use outside the game: Microsoft Rocketbox's Female_Adult_07
// (MIT, https://github.com/microsoft/Microsoft-Rocketbox) on its own full rig - all 81 bones: the
// fingers (open hands), the face's (jaw, lips, eyelids, brows, eyes) - dressed as she is in the
// game: her textures (tools/models/scarlet_textures.py), the jacket's skirts cut off at the high hip
// and the leather mini skirt built over the tights, as src/character/realBody.ts builds them.
//
// Metres, Y up, facing +Z, standing on the origin in the avatar's own rest pose (an A-pose); the
// bones keep their 3ds Max Biped names ("Bip01 L Thigh"...). Materials are glTF PBR: colour, normal
// and metallic-roughness maps (the game's finish maps baked by scarlet_export_textures.py), the hair
// cards alpha-masked and two-sided.
//
// Usage (from the project root):
//   python3 -I tools/models/scarlet_export_textures.py <tex dir>
//   node tools/models/export_scarlet.mjs <Female_Adult_07.fbx> <tex dir> <out.glb>
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// FBXLoader wants a DOM for its textures; the textures are handled separately, so stub it.
globalThis.self = globalThis;
globalThis.window = globalThis;
const fakeEl = () => ({ addEventListener() {}, removeEventListener() {}, style: {}, setAttribute() {}, getContext: () => null });
globalThis.document = { createElementNS: fakeEl, createElement: fakeEl };
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const THREE = await import(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href);
const { FBXLoader } = await import(pathToFileURL(path.join(root, 'node_modules/three/examples/jsm/loaders/FBXLoader.js')).href);

const [fbxPath, texDir, outPath] = process.argv.slice(2);
if (!outPath) throw new Error('usage: node tools/models/export_scarlet.mjs <Female_Adult_07.fbx> <tex dir> <out.glb>');
const buf = fs.readFileSync(fbxPath);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
obj.updateMatrixWorld(true);
let mesh = null;
obj.traverse((o) => {
  if (o.isSkinnedMesh && !mesh) mesh = o;
});
if (!mesh) throw new Error('no skinned mesh');
const bones = mesh.skeleton.bones;
const boneIdx = new Map(bones.map((b, i) => [b.name, i]));
const bone = (n) => {
  const i = boneIdx.get(n);
  if (i === undefined) throw new Error('missing bone ' + n);
  return i;
};
// (the loader turned the names' spaces into underscores: Biped names have none of their own)
const origName = (n) => n.replace(/_/g, ' ');
const CM = 0.01;

// ------------------------------------------------------------------ the rig, in metres
// Each bone's world transform as loaded (the rest pose), its position in metres: the new bind pose.
const world = bones.map((b) => {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  b.matrixWorld.decompose(p, q, s);
  if (Math.abs(s.x - 1) > 1e-3 || Math.abs(s.y - 1) > 1e-3 || Math.abs(s.z - 1) > 1e-3) throw new Error('scaled bone ' + b.name);
  return new THREE.Matrix4().compose(p.multiplyScalar(CM), q, new THREE.Vector3(1, 1, 1));
});
const parentOf = bones.map((b) => (b.parent && boneIdx.has(b.parent.name) ? boneIdx.get(b.parent.name) : -1));
const roots = parentOf.map((p, i) => (p < 0 ? i : -1)).filter((i) => i >= 0);
if (roots.length !== 1) throw new Error('expected one root bone, got ' + roots.map((i) => bones[i].name).join(','));
const local = bones.map((b, i) => {
  const m = parentOf[i] < 0 ? world[i].clone() : new THREE.Matrix4().copy(world[parentOf[i]]).invert().multiply(world[i]);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(p, q, s);
  return { t: p.toArray(), r: q.normalize().toArray() };
});
const wpos = (n) => new THREE.Vector3().setFromMatrixPosition(world[bone(n)]);

// ------------------------------------------------------------------ the mesh, skinned to the rest pose
const g = mesh.geometry;
const P0 = g.attributes.position, N0 = g.attributes.normal, UV0 = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
const nv = P0.count;
const boneMats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[i]));
const toWorld = mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse);
const M = new THREE.Matrix4(), T = new THREE.Matrix4(), nm = new THREE.Matrix3();
const v = new THREE.Vector3(), n = new THREE.Vector3();
const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
for (let i = 0; i < nv; i++) {
  M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const w = SW.getComponent(i, k);
    if (w <= 0) continue;
    T.copy(boneMats[SI.getComponent(i, k)]);
    for (let e = 0; e < 16; e++) M.elements[e] += T.elements[e] * w;
  }
  M.multiply(mesh.bindMatrix).premultiply(toWorld);
  v.fromBufferAttribute(P0, i).applyMatrix4(M).multiplyScalar(CM);
  n.fromBufferAttribute(N0, i).applyMatrix3(nm.getNormalMatrix(M)).normalize();
  pos.set([v.x, v.y, v.z], i * 3);
  nrm.set([n.x, n.y, n.z], i * 3);
}

// material slots: Rocketbox's <id>_body, <id>_head, <id>_opacity (hair cards, lashes)
const matNames = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.name);
const slotName = (s) => s.replace(/^[a-z]*\d+_/i, '').toLowerCase();
const SLOTS = ['body', 'head', 'opacity'];
const matOf = new Uint8Array(nv);
for (const gr of g.groups) {
  const sl = SLOTS.indexOf(slotName(matNames[gr.materialIndex] ?? 'body'));
  if (sl < 0) throw new Error('unexpected material ' + matNames[gr.materialIndex]);
  for (let i = gr.start; i < gr.start + gr.count; i++) matOf[i] = sl;
}

// ------------------------------------------------------------------ welded into an indexed mesh
const r = (x, s) => Math.round(x * s);
let uvOut = 0;
const uvAt = (i) => {
  let u = UV0.getX(i), vv = UV0.getY(i);
  if (u < -0.002 || u > 1.002 || vv < -0.002 || vv > 1.002) uvOut++;
  return [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, vv))];
};
const remap = new Map();
const V = { pos: [], nrm: [], uv: [], ji: [], jw: [], slot: [] };
const tris = [[], [], []];
for (let t = 0; t < nv / 3; t++) {
  const ids = [];
  for (let c = 0; c < 3; c++) {
    const i = t * 3 + c;
    const [u, vv] = uvAt(i);
    const key = [matOf[i], r(pos[i * 3], 1e4), r(pos[i * 3 + 1], 1e4), r(pos[i * 3 + 2], 1e4), r(nrm[i * 3], 100), r(nrm[i * 3 + 1], 100), r(nrm[i * 3 + 2], 100), r(u, 1e5), r(vv, 1e5)].join(',');
    let id = remap.get(key);
    if (id === undefined) {
      id = V.slot.length;
      remap.set(key, id);
      V.pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      V.nrm.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      V.uv.push(u, vv);
      // the four strongest influences, summing to one
      const inf = [0, 1, 2, 3].map((k) => [SI.getComponent(i, k), SW.getComponent(i, k)]).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]);
      const sum = inf.reduce((s, e) => s + e[1], 0);
      if (!(sum > 0)) throw new Error('unweighted vertex ' + i);
      for (let k = 0; k < 4; k++) {
        V.ji.push(inf[k] ? inf[k][0] : 0);
        V.jw.push(inf[k] ? inf[k][1] / sum : 0);
      }
      V.slot.push(matOf[i]);
    }
    ids.push(id);
  }
  tris[matOf[t * 3]].push(...ids);
}
const nBase = V.slot.length;
if (uvOut) console.warn(`  ${uvOut} uvs outside 0..1 (clamped)`);

// ------------------------------------------------------------------ dressed as in the game
// the body's finish map, per vertex: the tights (sheer) and the jacket's leather
const fRaw = fs.readFileSync(path.join(texDir, 'body_f.rgb'));
const hdr = fRaw.indexOf(10);
const [FW, FH] = fRaw.subarray(0, hdr).toString().split(' ').map(Number);
const fpx = fRaw.subarray(hdr + 1);
const codeAt = (u, vv) => {
  const x = Math.min(FW - 1, Math.max(0, Math.floor(u * FW)));
  const y = Math.min(FH - 1, Math.max(0, Math.floor((1 - vv) * FH)));
  return fpx[(y * FW + x) * 3] / 255;
};
const sheer = new Uint8Array(nBase), jacket = new Uint8Array(nBase);
for (let i = 0; i < nBase; i++) {
  if (V.slot[i] !== 0) continue;
  const c = codeAt(V.uv[i * 2], V.uv[i * 2 + 1]);
  sheer[i] = c >= 0.25 && c < 0.5 ? 1 : 0;
  jacket[i] = c > 0.69 && c < 0.76 ? 1 : 0;
}
let stature = 0;
for (let i = 0; i < nBase; i++) if (V.slot[i] === 1) stature = Math.max(stature, V.pos[i * 3 + 1]);
// (the game's height unit for a skeleton: its head top over 1.83)
const s = stature / 1.83;
const yJ = wpos('Bip01_L_Thigh').y;
const kneeY = wpos('Bip01_L_Calf').y + 0.1;
const SK = { top: 0.075, hem: -0.2, jacketCut: 0.035, uv: [0.36, 0.77, 0.27, 0.15] };

// the jacket's skirts below the high hip: gone, the leather skirt shows from there
const cutY = yJ + SK.jacketCut * s;
const cut = (i) => jacket[i] && V.pos[i * 3 + 1] < cutY && V.pos[i * 3 + 1] > kneeY && Math.abs(V.pos[i * 3]) < 0.3;
const before = tris[0].length / 3;
{
  const kept = [];
  for (let t = 0; t < tris[0].length; t += 3) {
    const [a, b, c] = tris[0].slice(t, t + 3);
    if (cut(a) && cut(b) && cut(c)) continue;
    kept.push(a, b, c);
  }
  tris[0] = kept;
}
const cutCount = before - tris[0].length / 3;

// the torso's own weights at a height (the body under the skirt's waistband rides on these)
const TORSO = ['Bip01_Pelvis', 'Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2'].map(bone);
const torsoAt = (y) => {
  const acc = new Map();
  for (let band = 0.015; band < 0.1; band *= 1.5) {
    acc.clear();
    let any = 0;
    for (let i = 0; i < nBase; i++) {
      if (V.slot[i] !== 0 || Math.abs(V.pos[i * 3 + 1] - y) > band || Math.abs(V.pos[i * 3]) > 0.12) continue;
      for (let k = 0; k < 4; k++) {
        const j = V.ji[i * 4 + k], w = V.jw[i * 4 + k];
        if (w > 0 && TORSO.includes(j)) {
          acc.set(j, (acc.get(j) ?? 0) + w);
          any++;
        }
      }
    }
    if (any > 20) break;
  }
  const sum = [...acc.values()].reduce((a, b) => a + b, 0);
  return sum > 0 ? [...acc.entries()].map(([j, w]) => [j, w / sum]) : [[TORSO[0], 1]];
};

// ------------------------------------------------------------------ the leather mini skirt
// As realBody.ts builds it: rings from the waistband (under the jacket's hem) to the hem, each the
// convex outline of the tights at its height plus an easing that grows toward the hem; weighted to
// the torso above the hip joints and onto each thigh below them, so it rides up on a raised knee. A
// lining faces in and the hem folds between them. Its uvs take the jacket's leather off the body
// texture.
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function rayHull(hull, c, dx, dz) {
  let best = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - c[0]) * ez - (a[1] - c[1]) * ex) / den;
    const u = ((a[0] - c[0]) * dz - (a[1] - c[1]) * dx) / den;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, t);
  }
  return best || 0.1;
}
const skirtTris = [];
let skirtVerts = 0;
{
  const yTop = yJ + SK.top * s, yHem = yJ + SK.hem * s;
  const RINGS = 13, SEG = 56;
  // The tights' outline at a height: where their triangles cross it. (The game finds it from the
  // tights' vertices near that height, on a body fitted to its skeleton, legs straightened; on the
  // avatar's own A-pose the rows over the hips are too far apart for that - a ring between two rows
  // misses the front of the hips, and the tights show through it.)
  const tightsTris = [];
  for (let t = 0; t < tris[0].length; t += 3) {
    const vs = tris[0].slice(t, t + 3);
    if (vs.filter((i) => sheer[i]).length >= 2 && vs.every((i) => Math.abs(V.pos[i * 3]) < 0.3)) tightsTris.push(...vs);
  }
  const section = (y) => {
    const pts = [];
    for (let t = 0; t < tightsTris.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const a = tightsTris[t + e], b = tightsTris[t + ((e + 1) % 3)];
        const ya = V.pos[a * 3 + 1] - y, yb = V.pos[b * 3 + 1] - y;
        if (ya * yb > 0 || ya === yb) continue;
        const k = ya / (ya - yb);
        pts.push([V.pos[a * 3] + (V.pos[b * 3] - V.pos[a * 3]) * k, V.pos[a * 3 + 2] + (V.pos[b * 3 + 2] - V.pos[a * 3 + 2]) * k]);
      }
    return pts;
  };
  const rings = [];
  for (let ri = 0; ri < RINGS; ri++) {
    const d = ri / (RINGS - 1);
    const y = yTop + (yHem - yTop) * d;
    let pts = section(y);
    // (no tights crossing this height, as on a waistband above them: their nearest vertices)
    for (let band = 0.012; pts.length < 24 && band < 0.06; band *= 1.6) {
      pts = [];
      for (let i = 0; i < nBase; i++) if (sheer[i] && Math.abs(V.pos[i * 3 + 1] - y) < band) pts.push([V.pos[i * 3], V.pos[i * 3 + 2]]);
    }
    const hull = convexHull(pts);
    const c = [0, 0];
    for (const p of hull) {
      c[0] += p[0];
      c[1] += p[1];
    }
    c[1] /= Math.max(1, hull.length);
    c[0] = 0;
    const rr = [];
    for (let k = 0; k < SEG; k++) {
      const th = (k / SEG) * Math.PI * 2;
      rr.push(rayHull(hull, c, Math.sin(th), Math.cos(th)));
    }
    rings.push({ c, r: rr, y, torso: torsoAt(y) });
  }
  // smooth the outlines around and down (no kinks; never narrower above than below the hip line)
  for (let pass = 0; pass < 2; pass++)
    for (const gr of rings) {
      const rr = gr.r.slice();
      for (let k = 0; k < SEG; k++) gr.r[k] = (rr[(k + SEG - 1) % SEG] + 2 * rr[k] + rr[(k + 1) % SEG]) / 4;
    }
  for (let ri = 1; ri < RINGS; ri++) {
    const a = rings[ri - 1], b = rings[ri];
    for (let k = 0; k < SEG; k++) b.r[k] = Math.max(b.r[k], a.r[k] * (b.y > yJ - 0.03 ? 0.985 : 0.94));
  }
  const [u0, v0, du, dv] = SK.uv;
  const thL = bone('Bip01_L_Thigh'), thR = bone('Bip01_R_Thigh');
  const emitRing = (inset, vRow, flip) => {
    const first = V.slot.length;
    rings.forEach((gr, ri) => {
      const d = ri / (RINGS - 1);
      const ease = (0.0045 + 0.0055 * d) * s - inset;
      const f = 0.97 * smooth(yJ + 0.1 * s, yJ - 0.08 * s, gr.y);
      for (let k = 0; k <= SEG; k++) {
        const th = (k / SEG) * Math.PI * 2;
        const rad = gr.r[k % SEG] + ease;
        const x = gr.c[0] + Math.sin(th) * rad, z = gr.c[1] + Math.cos(th) * rad;
        V.pos.push(x, gr.y, z);
        V.nrm.push(Math.sin(th) * (flip ? -1 : 1), 0, Math.cos(th) * (flip ? -1 : 1));
        // round the leather panel and back (mirrored: no seam), down it from the waistband
        const uu = 1 - Math.abs((2 * k) / SEG - 1);
        V.uv.push(u0 + uu * du, vRow(d));
        // the torso's weights at the top, onto the near thigh (+x is her left) below the hip joints
        const b = smooth(-0.045 * s, 0.045 * s, x);
        const ws = [...gr.torso.map(([j, w]) => [j, w * (1 - f)]), [thL, f * b], [thR, f * (1 - b)]];
        const top = ws.filter((e) => e[1] > 0.002).sort((a2, b2) => b2[1] - a2[1]).slice(0, 4);
        const sum = top.reduce((a2, e) => a2 + e[1], 0);
        for (let c2 = 0; c2 < 4; c2++) {
          V.ji.push(top[c2] ? top[c2][0] : 0);
          V.jw.push(top[c2] ? top[c2][1] / sum : 0);
        }
        V.slot.push(0);
      }
    });
    for (let ri = 0; ri < RINGS - 1; ri++)
      for (let k = 0; k < SEG; k++) {
        const a = first + ri * (SEG + 1) + k, b = a + 1, c = a + SEG + 1, e = c + 1;
        if (flip) skirtTris.push(a, b, c, b, e, c);
        else skirtTris.push(a, c, b, b, c, e);
      }
    return first;
  };
  const outer = emitRing(0, (d) => v0 + dv * (1 - d), false);
  const inner = emitRing(0.0035 * s, (d) => v0 + dv * (1 - d) * 0.5, true);
  const hemO = outer + (RINGS - 1) * (SEG + 1), hemI = inner + (RINGS - 1) * (SEG + 1);
  for (let k = 0; k < SEG; k++) {
    const a = hemO + k, b = hemO + k + 1, c = hemI + k, e = hemI + k + 1;
    skirtTris.push(a, c, b, b, c, e);
  }
  // shade each face's normals from its own shape (the rings' outlines are not round)
  const smoothNormals = (from, to) => {
    const acc = new Float64Array((to - from) * 3);
    for (let t = 0; t < skirtTris.length; t += 3) {
      const a = skirtTris[t], b = skirtTris[t + 1], c = skirtTris[t + 2];
      if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
      const p = V.pos;
      const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
      const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a, b, c]) {
        acc[(i - from) * 3] += nx;
        acc[(i - from) * 3 + 1] += ny;
        acc[(i - from) * 3 + 2] += nz;
      }
    }
    for (let i = 0; i < to - from; i++) {
      const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1;
      for (let c = 0; c < 3; c++) V.nrm[(from + i) * 3 + c] = acc[i * 3 + c] / l;
    }
  };
  smoothNormals(outer, inner);
  smoothNormals(inner, V.slot.length);
  skirtVerts = V.slot.length - outer;
}
tris[0].push(...skirtTris);

// ------------------------------------------------------------------ the glTF
const nVert = V.slot.length;
const chunks = [];
let binLen = 0;
const views = [];
const addView = (bytes, target) => {
  const pad = (4 - (binLen % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    binLen += pad;
  }
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  views.push({ buffer: 0, byteOffset: binLen, byteLength: b.length, ...(target ? { target } : {}) });
  chunks.push(b);
  binLen += b.length;
  return views.length - 1;
};
const accessors = [];
const addAccessor = (arr, type, componentType, target, extra = {}) => {
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
  accessors.push({ bufferView: addView(arr, target), componentType, count: arr.length / comps, type, ...extra });
  return accessors.length - 1;
};
const F32 = 5126, U16 = 5123, U32 = 5125, U8 = 5121;
const ARRAY = 34962, ELEMENTS = 34963;
const posA = new Float32Array(V.pos);
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < nVert; i++)
  for (let c = 0; c < 3; c++) {
    mn[c] = Math.min(mn[c], posA[i * 3 + c]);
    mx[c] = Math.max(mx[c], posA[i * 3 + c]);
  }
const aPos = addAccessor(posA, 'VEC3', F32, ARRAY, { min: mn, max: mx });
const aNrm = addAccessor(new Float32Array(V.nrm), 'VEC3', F32, ARRAY);
// (glTF's uvs run down the image from its top: the mesh's run up from the bottom)
const uvA = new Float32Array(V.uv);
for (let i = 1; i < uvA.length; i += 2) uvA[i] = 1 - uvA[i];
const aUv = addAccessor(uvA, 'VEC2', F32, ARRAY);
const aJ = addAccessor(new Uint8Array(V.ji), 'VEC4', U8, ARRAY);
const aW = addAccessor(new Float32Array(V.jw), 'VEC4', F32, ARRAY);
const idxType = nVert > 65535 ? U32 : U16;
const idxArr = (t) => (idxType === U32 ? new Uint32Array(t) : new Uint16Array(t));
const aIdx = tris.map((t) => addAccessor(idxArr(t), 'SCALAR', idxType, ELEMENTS));
// the bind: each joint's inverse world transform (column-major, as three's elements)
const ibm = new Float32Array(bones.length * 16);
bones.forEach((b, i) => ibm.set(new THREE.Matrix4().copy(world[i]).invert().elements, i * 16));
const aIbm = addAccessor(ibm, 'MAT4', F32, undefined);

const images = [];
const addImage = (file, mimeType, name) => {
  images.push({ name, mimeType, bufferView: addView(fs.readFileSync(path.join(texDir, file))) });
  return images.length - 1;
};
const img = {
  body: addImage('body.jpg', 'image/jpeg', 'Scarlet_Body_Color'),
  bodyN: addImage('body_n.jpg', 'image/jpeg', 'Scarlet_Body_Normal'),
  bodyMR: addImage('body_orm.png', 'image/png', 'Scarlet_Body_MetalRough'),
  head: addImage('head.jpg', 'image/jpeg', 'Scarlet_Head_Color'),
  headN: addImage('head_n.jpg', 'image/jpeg', 'Scarlet_Head_Normal'),
  headMR: addImage('head_orm.png', 'image/png', 'Scarlet_Head_MetalRough'),
  hair: addImage('hair.png', 'image/png', 'Scarlet_Hair_Color'),
};
// one texture per image, all with the one sampler (linear, mipmapped, repeating)
const textures = images.map((_, i) => ({ sampler: 0, source: i }));
const materials = [
  {
    name: 'Scarlet_Body',
    pbrMetallicRoughness: { baseColorTexture: { index: img.body }, metallicRoughnessTexture: { index: img.bodyMR }, metallicFactor: 1, roughnessFactor: 1 },
    normalTexture: { index: img.bodyN },
  },
  {
    name: 'Scarlet_Head',
    pbrMetallicRoughness: { baseColorTexture: { index: img.head }, metallicRoughnessTexture: { index: img.headMR }, metallicFactor: 1, roughnessFactor: 1 },
    normalTexture: { index: img.headN },
  },
  {
    // (the game's hair finish: a little gloss)
    name: 'Scarlet_Hair',
    pbrMetallicRoughness: { baseColorTexture: { index: img.hair }, metallicFactor: 0, roughnessFactor: 0.65 },
    alphaMode: 'MASK',
    alphaCutoff: 0.42,
    doubleSided: true,
  },
];
const attributes = { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv, JOINTS_0: aJ, WEIGHTS_0: aW };
// nodes: 0 the mesh, then the joints in the skeleton's order; the mesh and the skeleton's root both
// at the scene's root (a skinned mesh's own parents' transforms would be ignored)
const J0 = 1;
const nodes = [
  { name: 'Scarlet', mesh: 0, skin: 0 },
  ...bones.map((b, i) => {
    const kids = parentOf.map((p, k) => (p === i ? J0 + k : -1)).filter((k) => k >= 0);
    const node = { name: origName(b.name), translation: local[i].t, rotation: local[i].r };
    if (kids.length) node.children = kids;
    return node;
  }),
];
const gltf = {
  asset: {
    version: '2.0',
    generator: 'SCARLET: BEFORE DAWN - tools/models/export_scarlet.mjs',
    copyright: 'Female_Adult_07 from the Microsoft Rocketbox Avatar Library (c) Microsoft Corporation, MIT licence; re-dressed as Scarlet',
  },
  scene: 0,
  scenes: [{ name: 'Scarlet', nodes: [0, J0 + roots[0]] }],
  nodes,
  meshes: [
    {
      name: 'Scarlet',
      primitives: [0, 1, 2].map((m) => ({ attributes, indices: aIdx[m], material: m, mode: 4 })),
    },
  ],
  skins: [{ name: 'Scarlet_Rig', inverseBindMatrices: aIbm, joints: bones.map((_, i) => J0 + i), skeleton: J0 + roots[0] }],
  materials,
  textures,
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images,
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: 0 }],
};
const tail = (4 - (binLen % 4)) % 4;
if (tail) {
  chunks.push(Buffer.alloc(tail));
  binLen += tail;
}
gltf.buffers[0].byteLength = binLen;
let json = Buffer.from(JSON.stringify(gltf));
const jpad = (4 - (json.length % 4)) % 4;
json = Buffer.concat([json, Buffer.alloc(jpad, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binLen, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(json.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(binLen, 0);
bh.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, jh, json, bh, ...chunks]));
console.log(
  `${outPath}: ${(fs.statSync(outPath).size / 1048576).toFixed(2)} MB - ${nVert} vertices (${skirtVerts} of them the skirt), ` +
    `${tris.map((t) => t.length / 3).join(' + ')} triangles (body, head, hair), ${bones.length} joints, ` +
    `${cutCount} jacket triangles cut, height ${stature.toFixed(3)} m`,
);
