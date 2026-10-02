// Geometry accumulation for chunk / prop meshes. Vertices carry bake hints (normal, tint, sample
// nudge) used by the vertex-light baker, then get packed into the 32 byte GPU vertex format.
import { MATS, VF } from './materials.js';
import { VERTEX_BYTES } from '../gfx/renderer.js';

export class MeshBuilder {
  constructor(cap = 2048) {
    this.n = 0;
    this.cap = 0;
    this.grow(cap);
    this.idx = new Uint32Array(cap * 2);
    this.ni = 0;
    this.xf = null;
  }

  grow(cap) {
    const copy = (name, T, k) => {
      const a = new T(cap * k);
      if (this[name]) a.set(this[name].subarray(0, this.n * k));
      this[name] = a;
    };
    copy('pos', Float32Array, 3);
    copy('uv', Float32Array, 2);
    copy('layer', Uint16Array, 1);
    copy('flags', Uint8Array, 1);
    copy('chan', Uint8Array, 1);
    copy('nrm', Float32Array, 3);
    copy('tint', Float32Array, 3);
    copy('nudge', Float32Array, 3);
    copy('lit', Uint8Array, 1);
    copy('pre', Float32Array, 4);   // preset base colour (rgb, alpha)
    copy('preF', Float32Array, 3);  // preset flicker colour
    copy('ao', Float32Array, 1);
    copy('stain', Float32Array, 1);
    this.cap = cap;
  }

  // style: {layer, flags, tint, alpha, lit, chan, color, flk, ao, stain}
  v(x, y, z, u, w, nx, ny, nz, st) {
    if (this.n >= this.cap) this.grow(this.cap * 2);
    const i = this.n++;
    const m = this.xf;
    if (m) {
      const X = m[0] * x + m[1] * y + m[2] * z + m[3];
      const Y = m[4] * x + m[5] * y + m[6] * z + m[7];
      const Z = m[8] * x + m[9] * y + m[10] * z + m[11];
      const NX = m[0] * nx + m[1] * ny + m[2] * nz;
      const NY = m[4] * nx + m[5] * ny + m[6] * nz;
      const NZ = m[8] * nx + m[9] * ny + m[10] * nz;
      x = X; y = Y; z = Z; nx = NX; ny = NY; nz = NZ;
    }
    const p3 = i * 3;
    this.pos[p3] = x; this.pos[p3 + 1] = y; this.pos[p3 + 2] = z;
    this.nrm[p3] = nx; this.nrm[p3 + 1] = ny; this.nrm[p3 + 2] = nz;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = w;
    this.layer[i] = st.layer;
    this.flags[i] = st.flags || 0;
    this.chan[i] = st.chan || 0;
    const t = st.tint || ONE;
    this.tint[p3] = t[0]; this.tint[p3 + 1] = t[1]; this.tint[p3 + 2] = t[2];
    this.nudge[p3] = 0; this.nudge[p3 + 1] = 0; this.nudge[p3 + 2] = 0;
    this.lit[i] = st.lit === false ? 0 : 1;
    const c = st.color || ONE;
    this.pre[i * 4] = c[0]; this.pre[i * 4 + 1] = c[1]; this.pre[i * 4 + 2] = c[2]; this.pre[i * 4 + 3] = st.alpha ?? 1;
    const f = st.flk || ZERO;
    this.preF[p3] = f[0]; this.preF[p3 + 1] = f[1]; this.preF[p3 + 2] = f[2];
    this.ao[i] = st.ao ?? 1;
    this.stain[i] = st.stain || 0;
    return i;
  }

  setNudge(i, x, y, z) { this.nudge[i * 3] = x; this.nudge[i * 3 + 1] = y; this.nudge[i * 3 + 2] = z; }

  tri(a, b, c) {
    if (this.ni + 3 > this.idx.length) { const n = new Uint32Array(this.idx.length * 2); n.set(this.idx); this.idx = n; }
    this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c;
  }
  quadIdx(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }

  // Generic quad. Corners in CCW order seen from the front: BL, BR, TR, TL.
  quad(p, n, st, uv) {
    const a = this.v(p[0], p[1], p[2], uv[0], uv[1], n[0], n[1], n[2], st);
    const b = this.v(p[3], p[4], p[5], uv[2], uv[3], n[0], n[1], n[2], st);
    const c = this.v(p[6], p[7], p[8], uv[4], uv[5], n[0], n[1], n[2], st);
    const d = this.v(p[9], p[10], p[11], uv[6], uv[7], n[0], n[1], n[2], st);
    this.quadIdx(a, b, c, d);
    return a;
  }

  // Subdivided planar quad: origin = BL corner, R = right edge vector, U = up edge vector.
  // uvMode: 'world' (planar from untransformed coords with su/sv) or [u0,v0,u1,v1] rect (fit).
  grid(ox, oy, oz, rx, ry, rz, ux, uy, uz, nu, nv, n, st, uvMode, su = 1, sv = 1) {
    const base = this.n;
    const rl = Math.hypot(rx, ry, rz), ul = Math.hypot(ux, uy, uz);
    // world mapping axes: right dir R, down dir = -U
    const Rx = rx / rl, Ry = ry / rl, Rz = rz / rl, Ux = ux / ul, Uy = uy / ul, Uz = uz / ul;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const fu = i / nu, fv = j / nv;
        const x = ox + rx * fu + ux * fv, y = oy + ry * fu + uy * fv, z = oz + rz * fu + uz * fv;
        let u, w;
        if (uvMode === 'world') {
          u = (x * Rx + y * Ry + z * Rz) / su;
          w = -(x * Ux + y * Uy + z * Uz) / sv;
        } else {
          u = uvMode[0] + (uvMode[2] - uvMode[0]) * fu;
          w = uvMode[3] + (uvMode[1] - uvMode[3]) * fv;
        }
        this.v(x, y, z, u, w, n[0], n[1], n[2], st);
      }
    }
    const row = nu + 1;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * row + i;
      this.quadIdx(a, a + 1, a + row + 1, a + row);
    }
    return base;
  }

  // Axis aligned box. st: style or array of 6 styles [+x,-x,+y,-y,+z,-z] (null = skip face).
  // uv: 'world' | 'fit' | array of 6 rects. skip: bitmask of faces to omit (1:+x 2:-x 4:+y 8:-y 16:+z 32:-z)
  box(x0, y0, z0, x1, y1, z1, st, opts = {}) {
    const sts = Array.isArray(st) ? st : [st, st, st, st, st, st];
    const skip = opts.skip || 0;
    const su = opts.su || 1, sv = opts.sv || 1;
    const uvo = opts.uv || 'world';
    const sub = opts.sub || 1;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const F = [
      // origin, right, up, normal
      [x1, y0, z1, 0, 0, -dz, 0, dy, 0, [1, 0, 0]],
      [x0, y0, z0, 0, 0, dz, 0, dy, 0, [-1, 0, 0]],
      [x0, y1, z1, dx, 0, 0, 0, 0, -dz, [0, 1, 0]],
      [x1, y0, z1, -dx, 0, 0, 0, 0, -dz, [0, -1, 0]],
      [x0, y0, z1, dx, 0, 0, 0, dy, 0, [0, 0, 1]],
      [x1, y0, z0, -dx, 0, 0, 0, dy, 0, [0, 0, -1]],
    ];
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const s = sts[f];
      if (!s) continue;
      const q = F[f];
      let mode = uvo;
      if (uvo === 'fit') mode = [0, 0, 1, 1];
      else if (Array.isArray(uvo)) mode = uvo[f] || 'world';
      const nu = sub > 1 ? Math.max(1, Math.round(Math.hypot(q[3], q[4], q[5]) / sub)) : 1;
      const nv = sub > 1 ? Math.max(1, Math.round(Math.hypot(q[6], q[7], q[8]) / sub)) : 1;
      this.grid(q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], nu, nv, q[9], s, mode, s.su || su, s.sv || sv);
    }
  }

  // Vertical cylinder / prism (sides >= 3). caps: bit1 = top, bit2 = bottom.
  cyl(cx, y0, cz, r, h, sides, st, caps = 3, capSt = null, rot = 0) {
    const y1 = y0 + h;
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * Math.PI * 2, a1 = rot + ((i + 1) / sides) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      const am = (a0 + a1) / 2;
      const n = [Math.cos(am), 0, Math.sin(am)];
      const u0 = (i / sides) * circ, u1 = ((i + 1) / sides) * circ;
      // seen from outside: right goes clockwise when viewed from above -> from a1 to a0
      this.quad([x1, y0, z1, x0, y0, z0, x0, y1, z0, x1, y1, z1], n, st, [u1, h, u0, h, u0, 0, u1, 0].map((v, k) => (k % 2 ? v / (st.sv || 1) : v / (st.su || 1))));
    }
    const cs = capSt || st;
    if (caps & 1) {
      const c = this.v(cx, y1, cz, 0.5, 0.5, 0, 1, 0, cs);
      const first = this.n;
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        this.v(cx + Math.cos(a) * r, y1, cz + Math.sin(a) * r, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, 0, 1, 0, cs);
      }
      for (let i = 0; i < sides; i++) this.tri(c, first + ((i + 1) % sides), first + i);
    }
    if (caps & 2) {
      const c = this.v(cx, y0, cz, 0.5, 0.5, 0, -1, 0, cs);
      const first = this.n;
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        this.v(cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, 0, -1, 0, cs);
      }
      for (let i = 0; i < sides; i++) this.tri(c, first + i, first + ((i + 1) % sides));
    }
  }

  // Cylinder between two points (pipes, rods).
  rod(ax, ay, az, bx, by, bz, r, sides, st, caps = false) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return;
    const tx = dx / len, ty = dy / len, tz = dz / len;
    // perpendicular basis
    let px, py, pz;
    if (Math.abs(ty) < 0.9) { px = tz; py = 0; pz = -tx; } else { px = 0; py = -tz; pz = ty; }
    const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
    const qx = ty * pz - tz * py, qy = tz * px - tx * pz, qz = tx * py - ty * px;
    const ring = (i) => {
      const a = (i / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      return [px * c + qx * s, py * c + qy * s, pz * c + qz * s];
    };
    for (let i = 0; i < sides; i++) {
      const n0 = ring(i), n1 = ring(i + 1);
      const nm = ring(i + 0.5);
      const u0 = i / sides, u1 = (i + 1) / sides;
      const a = this.v(ax + n0[0] * r, ay + n0[1] * r, az + n0[2] * r, u0, 0, nm[0], nm[1], nm[2], st);
      const b = this.v(ax + n1[0] * r, ay + n1[1] * r, az + n1[2] * r, u1, 0, nm[0], nm[1], nm[2], st);
      const c = this.v(bx + n1[0] * r, by + n1[1] * r, bz + n1[2] * r, u1, len / (st.sv || 1), nm[0], nm[1], nm[2], st);
      const d = this.v(bx + n0[0] * r, by + n0[1] * r, bz + n0[2] * r, u0, len / (st.sv || 1), nm[0], nm[1], nm[2], st);
      this.quadIdx(a, b, c, d);
    }
    if (caps) {
      for (const [ex, ey, ez, sgn] of [[ax, ay, az, -1], [bx, by, bz, 1]]) {
        const c = this.v(ex, ey, ez, 0.5, 0.5, tx * sgn, ty * sgn, tz * sgn, st);
        const first = this.n;
        for (let i = 0; i < sides; i++) { const n0 = ring(i); this.v(ex + n0[0] * r, ey + n0[1] * r, ez + n0[2] * r, 0.5 + n0[0] * 0.5, 0.5 + n0[2] * 0.5, tx * sgn, ty * sgn, tz * sgn, st); }
        for (let i = 0; i < sides; i++) {
          if (sgn > 0) this.tri(c, first + i, first + ((i + 1) % sides));
          else this.tri(c, first + ((i + 1) % sides), first + i);
        }
      }
    }
  }

  // Double-sided flat card (plants, papers, cutouts) - emits two quads.
  card(p, n, st, uv) {
    this.quad(p, n, st, uv);
    const q = [p[3], p[4], p[5], p[0], p[1], p[2], p[9], p[10], p[11], p[6], p[7], p[8]];
    this.quad(q, [-n[0], -n[1], -n[2]], st, [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]]);
  }

  // Sloped quad from 4 arbitrary corners with computed normal (CCW).
  poly4(a, b, c, d, st, uv) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    // note: transform is applied in v(); compute normal in local space
    return this.quad([...a, ...b, ...c, ...d], [nx, ny, nz], st, uv);
  }

  tri3(a, b, c, st, uv) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i0 = this.v(a[0], a[1], a[2], uv[0], uv[1], nx, ny, nz, st);
    const i1 = this.v(b[0], b[1], b[2], uv[2], uv[3], nx, ny, nz, st);
    const i2 = this.v(c[0], c[1], c[2], uv[4], uv[5], nx, ny, nz, st);
    this.tri(i0, i1, i2);
  }

  bounds() {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    return [x0, y0, z0, x1, y1, z1];
  }

  // Pack into GPU layout. col/flk: Float32Array(n*3) baked light (0..2 range), alpha from pre[3].
  pack(col, flk) {
    const n = this.n;
    const buf = new ArrayBuffer(n * VERTEX_BYTES);
    const f32 = new Float32Array(buf), u16 = new Uint16Array(buf), u8 = new Uint8Array(buf);
    const S = VERTEX_BYTES;
    for (let i = 0; i < n; i++) {
      const o = i * S, of = o >> 2;
      f32[of] = this.pos[i * 3]; f32[of + 1] = this.pos[i * 3 + 1]; f32[of + 2] = this.pos[i * 3 + 2];
      f32[of + 3] = this.uv[i * 2]; f32[of + 4] = this.uv[i * 2 + 1];
      u16[(o + 20) >> 1] = this.layer[i];
      u8[o + 22] = this.flags[i];
      u8[o + 23] = this.chan[i];
      u8[o + 24] = q8(col[i * 3]); u8[o + 25] = q8(col[i * 3 + 1]); u8[o + 26] = q8(col[i * 3 + 2]);
      u8[o + 27] = Math.max(0, Math.min(255, Math.round(this.pre[i * 4 + 3] * 255)));
      u8[o + 28] = q8(flk[i * 3]); u8[o + 29] = q8(flk[i * 3 + 1]); u8[o + 30] = q8(flk[i * 3 + 2]);
      u8[o + 31] = 255;
    }
    return { data: buf, idx: this.idx.slice(0, this.ni) };
  }
}

const ONE = [1, 1, 1], ZERO = [0, 0, 0];
// light values are 0..2 (PS1: 0x80 == 1.0), stored as 0..255
function q8(v) { return Math.max(0, Math.min(255, Math.round(v * 127.5))); }

// Build a style object for a material id.
export function matStyle(id, extra) {
  const m = MATS[id];
  const st = {
    layer: m.layers[0], flags: m.flags, tint: m.tint, su: m.su, sv: m.sv, lit: true, stain: m.stain, mat: id,
  };
  if (m.flags & VF.FULLBRIGHT) { st.lit = false; st.color = [0.08, 0.08, 0.08]; st.flk = [m.glow, m.glow, m.glow]; st.chan = m.chan; }
  if (extra) Object.assign(st, extra);
  return st;
}

export function texStyle(layer, extra) {
  const st = { layer, flags: 0, tint: ONE, su: 1, sv: 1, lit: true };
  if (extra) Object.assign(st, extra);
  return st;
}
