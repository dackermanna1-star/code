// GeoBatch: accumulates primitive geometry (boxes, cylinders, spheres, quads, tori) into
// merged meshes grouped by material and coarse spatial region. Supports world-space UVs
// (so tiling textures line up across merged walls) and per-primitive vertex colours.
import { BABYLON } from './babylon.js';

const REGION = 32;

function rot3(yaw = 0, pitch = 0, roll = 0) {
  // Column-vector R = Ry * Rx * Rz (matches Babylon's yaw-pitch-roll order).
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(Ry, mul3(Rx, Rz));
}
function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

export class GeoBatch {
  constructor(materials, opts = {}) {
    this.materials = materials;
    this.groups = new Map();
    this.split = opts.split !== false;
    this.frame = null; // optional local frame {x, z, yaw, y}
  }
  /** Set a local frame so subsequent primitives are positioned relative to (x,y,z,yaw). */
  setFrame(x, z, yaw = 0, y = 0) { this.frame = { x, z, y, yaw, R: rot3(yaw), c: Math.cos(yaw), s: Math.sin(yaw) }; }
  clearFrame() { this.frame = null; }

  _group(mat, wx, wz) {
    const key = this.split ? `${mat}|${Math.floor(wx / REGION)},${Math.floor(wz / REGION)}` : mat;
    let g = this.groups.get(key);
    if (!g) { g = { mat, pos: [], nrm: [], uv: [], col: [], idx: [] }; this.groups.set(key, g); }
    return g;
  }
  _toWorld(lx, ly, lz) {
    const f = this.frame;
    if (!f) return [lx, ly, lz];
    return [f.x + lx * f.c + lz * f.s, f.y + ly, f.z - lx * f.s + lz * f.c];
  }

  /**
   * Append raw local-space geometry with a transform.
   * pts: flat local positions, nrms: flat normals, uvs: flat (or null for world UVs).
   */
  _add(mat, pts, nrms, uvs, idx, o) {
    const R = rot3(o.yaw || 0, o.pitch || 0, o.roll || 0);
    const sx = o.sx || 1, sy = o.sy || 1, sz = o.sz || 1;
    const [cx, cy, cz] = this._toWorld(o.x || 0, o.y || 0, o.z || 0);
    const F = this.frame ? this.frame.R : null;
    const M = F ? mul3(F, R) : R;
    const g = this._group(mat, cx, cz);
    const base = g.pos.length / 3;
    const scale = this.materials.scale(mat);
    const col = o.color || [1, 1, 1];
    const uvMode = o.uv || (uvs ? 'unit' : 'world');
    for (let i = 0; i < pts.length; i += 3) {
      const lx = pts[i] * sx, ly = pts[i + 1] * sy, lz = pts[i + 2] * sz;
      const wx = cx + M[0] * lx + M[1] * ly + M[2] * lz;
      const wy = cy + M[3] * lx + M[4] * ly + M[5] * lz;
      const wz = cz + M[6] * lx + M[7] * ly + M[8] * lz;
      let nx = nrms[i] / sx, ny = nrms[i + 1] / sy, nz = nrms[i + 2] / sz;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const wnx = M[0] * nx + M[1] * ny + M[2] * nz, wny = M[3] * nx + M[4] * ny + M[5] * nz, wnz = M[6] * nx + M[7] * ny + M[8] * nz;
      g.pos.push(wx, wy, wz); g.nrm.push(wnx, wny, wnz);
      if (uvMode === 'world') {
        const ax = Math.abs(wnx), ay = Math.abs(wny), az = Math.abs(wnz);
        const ou = o.uvOffset ? o.uvOffset[0] : 0, ov = o.uvOffset ? o.uvOffset[1] : 0;
        if (ay >= ax && ay >= az) g.uv.push(wx / scale + ou, wz / scale + ov);
        else if (ax >= az) g.uv.push(wz / scale * Math.sign(wnx || 1) + ou, wy / scale + ov);
        else g.uv.push(-wx / scale * Math.sign(wnz || 1) + ou, wy / scale + ov);
      } else {
        const k = (i / 3) * 2;
        g.uv.push(uvs[k] * (o.uvRepeat ? o.uvRepeat[0] : 1), uvs[k + 1] * (o.uvRepeat ? o.uvRepeat[1] : 1));
      }
      const shade = o.shadeFn ? o.shadeFn(wx, wy, wz) : 1;
      g.col.push(col[0] * shade, col[1] * shade, col[2] * shade, 1);
    }
    // Primitives are authored clockwise; Babylon's front faces are counter-clockwise.
    for (let i = 0; i < idx.length; i += 3) g.idx.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
  }

  /** Box centred at (x, y, z) in the current frame with size (w, h, d). */
  box(mat, x, y, z, w, h, d, o = {}) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const P = [], N = [], UV = [], I = [];
    const face = (n, corners, skip) => {
      if (skip) return;
      const b = P.length / 3;
      for (const c of corners) { P.push(c[0], c[1], c[2]); N.push(n[0], n[1], n[2]); }
      UV.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(b, b + 2, b + 1, b, b + 3, b + 2);
    };
    const s = o.skip || {};
    face([0, 0, 1], [[hw, -hh, hd], [-hw, -hh, hd], [-hw, hh, hd], [hw, hh, hd]], s.pz);   // +z
    face([0, 0, -1], [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd]], s.nz); // -z
    face([1, 0, 0], [[hw, -hh, -hd], [hw, -hh, hd], [hw, hh, hd], [hw, hh, -hd]], s.px);    // +x
    face([-1, 0, 0], [[-hw, -hh, hd], [-hw, -hh, -hd], [-hw, hh, -hd], [-hw, hh, hd]], s.nx); // -x
    face([0, 1, 0], [[-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd]], s.py);    // top
    face([0, -1, 0], [[-hw, -hh, hd], [hw, -hh, hd], [hw, -hh, -hd], [-hw, -hh, -hd]], s.ny); // bottom
    this._add(mat, P, N, o.uv === 'unit' ? UV : null, I, { ...o, x, y, z, uv: o.uv || 'world' });
  }
  /** Box from min/max corners (axis aligned in the current frame). */
  boxMinMax(mat, x0, y0, z0, x1, y1, z1, o = {}) {
    this.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);
  }
  /** Cylinder along local Y with its base at y. Use pitch/roll to lay it down. */
  cyl(mat, x, y, z, r, h, o = {}) {
    const segs = o.segs || 10, rt = o.rTop != null ? o.rTop : r;
    const P = [], N = [], UV = [], I = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      P.push(c * r, 0, s * r, c * rt, h, s * rt);
      const slope = (r - rt) / h;
      const nl = Math.hypot(1, slope);
      N.push(c / nl, slope / nl, s / nl, c / nl, slope / nl, s / nl);
      UV.push(i / segs, 0, i / segs, 1);
      if (i < segs) { const b = i * 2; I.push(b, b + 1, b + 3, b, b + 3, b + 2); }
    }
    if (o.caps !== false) {
      for (const [yy, ny, rr] of [[h, 1, rt], [0, -1, r]]) {
        const b = P.length / 3;
        P.push(0, yy, 0); N.push(0, ny, 0); UV.push(0.5, 0.5);
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          P.push(Math.cos(a) * rr, yy, Math.sin(a) * rr); N.push(0, ny, 0); UV.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
          if (i < segs) ny > 0 ? I.push(b, b + i + 2, b + i + 1) : I.push(b, b + i + 1, b + i + 2);
        }
      }
    }
    this._add(mat, P, N, UV, I, { ...o, x, y, z, uv: o.uv || 'unit' });
  }
  /** Horizontal cylinder between two points (in frame space), e.g. bars and rails. */
  rod(mat, x0, y0, z0, x1, y1, z1, r, o = {}) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return;
    // Orient local +Y along the segment: yaw around Y, then pitch.
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(Math.hypot(dx, dz), dy);
    this.cyl(mat, x0, y0, z0, r, len, { ...o, yaw, pitch, segs: o.segs || 6 });
  }
  sphere(mat, x, y, z, r, o = {}) {
    const seg = o.segs || 10, rings = o.rings || 7;
    const P = [], N = [], UV = [], I = [];
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, phi = v * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, th = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        P.push(nx * r, ny * r, nz * r); N.push(nx, ny, nz); UV.push(u, 1 - v);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      I.push(a, a + 1, b, b, a + 1, b + 1);
    }
    this._add(mat, P, N, UV, I, { ...o, x, y, z, uv: o.uv || 'unit' });
  }
  torus(mat, x, y, z, R, r, o = {}) {
    const seg = o.segs || 16, tseg = o.tsegs || 6;
    const P = [], N = [], UV = [], I = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= tseg; j++) {
        const b = (j / tseg) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
        P.push((R + r * cb) * ca, r * sb, (R + r * cb) * sa); N.push(cb * ca, sb, cb * sa); UV.push(i / seg, j / tseg);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) {
      const a = i * (tseg + 1) + j, b = a + tseg + 1;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this._add(mat, P, N, UV, I, { ...o, x, y, z, uv: 'unit' });
  }
  /** Vertical quad facing local +z (after yaw) with unit UVs. */
  quad(mat, x, y, z, w, h, o = {}) {
    const hw = w / 2, hh = h / 2;
    const P = [hw, -hh, 0, -hw, -hh, 0, -hw, hh, 0, hw, hh, 0];
    const N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const UV = [1, 0, 0, 0, 0, 1, 1, 1];
    const I = o.doubleSided ? [0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    this._add(mat, P, N, UV, I, { ...o, x, y, z, uv: o.uv || 'unit' });
  }
  /** Horizontal quad (floor decal) facing up. */
  floorQuad(mat, x, y, z, w, d, o = {}) {
    const hw = w / 2, hd = d / 2;
    const P = [-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd];
    const N = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    const UV = [0, 0, 1, 0, 1, 1, 0, 1];
    this._add(mat, P, N, o.uv === 'world' ? null : UV, [0, 2, 1, 0, 3, 2], { ...o, x, y, z, uv: o.uv || 'unit' });
  }

  /** Build Babylon meshes. Returns the list. */
  build(scene, name = 'batch', opts = {}) {
    const meshes = [];
    for (const [key, g] of this.groups) {
      if (!g.idx.length) continue;
      const mesh = new BABYLON.Mesh(`${name}:${key}`, scene);
      const vd = new BABYLON.VertexData();
      vd.positions = new Float32Array(g.pos);
      vd.normals = new Float32Array(g.nrm);
      vd.uvs = new Float32Array(g.uv);
      vd.colors = new Float32Array(g.col);
      vd.indices = g.pos.length / 3 > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
      vd.applyToMesh(mesh, false);
      mesh.material = this.materials.get(g.mat);
      mesh.isPickable = false;
      mesh.receiveShadows = opts.receiveShadows !== false;
      mesh.metadata = { batch: name, mat: g.mat };
      if (opts.freeze !== false) { mesh.freezeWorldMatrix(); mesh.doNotSyncBoundingInfo = true; }
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}
