// Greedy voxel mesher with per-corner ambient occlusion.
//
// Input is a padded volume (dims + 2 in every axis, 1-voxel border) laid out x fastest, then z, then y.
// Output quads are packed into 4 x u32:
//   q0 = x | y << 16
//   q1 = z | (w-1) << 16 | (h-1) << 24
//   q2 = palette | face << 8 | ao8 << 11 | transparent << 19
//   q3 = body slot (0 = static world)
// Faces: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z. For each face, U/V tangent axes are chosen so that
// cross(U, V) = N (counter-clockwise when seen from outside).

export class QuadBuffer {
  data: Uint32Array;
  count = 0;
  constructor(initialQuads = 1024) { this.data = new Uint32Array(initialQuads * 4); }
  reset(): void { this.count = 0; }
  push(q0: number, q1: number, q2: number, q3: number): void {
    let o = this.count * 4;
    if (o + 4 > this.data.length) {
      const n = new Uint32Array(this.data.length * 2);
      n.set(this.data);
      this.data = n;
    }
    const d = this.data;
    d[o++] = q0; d[o++] = q1; d[o++] = q2; d[o] = q3;
    this.count++;
  }
  /** Copy of the used part. */
  slice(): Uint32Array { return this.data.slice(0, this.count * 4); }
}

// [normal axis, u axis, v axis, sign]
const FACES: number[][] = [
  [0, 1, 2, 1], [0, 2, 1, -1],
  [1, 2, 0, 1], [1, 0, 2, -1],
  [2, 0, 1, 1], [2, 1, 0, -1],
];

const MAX_MERGE = 256;
let maskBuf = new Uint32Array(64 * 64);

/**
 * Mesh a padded voxel volume.
 * @param vox padded volume ((sx+2)*(sy+2)*(sz+2))
 * @param transparent per-palette transparency table
 * @param ox,oy,oz offset added to emitted quad coordinates
 */
export function meshVolume(vox: Uint8Array, sx: number, sy: number, sz: number, transparent: Uint8Array,
  ox: number, oy: number, oz: number, slot: number, opaque: QuadBuffer, trans: QuadBuffer): void {
  const PX = sx + 2, PZ = sz + 2;
  const dims = [sx, sy, sz];
  const strides = [1, PX * PZ, PX];
  const base = 1 + PX + PX * PZ;
  const c = [0, 0, 0];

  for (let f = 0; f < 6; f++) {
    const fa = FACES[f];
    const d = fa[0], ua = fa[1], va = fa[2], s = fa[3];
    const nd = dims[d], nu = dims[ua], nv = dims[va];
    const sd = strides[d], su = strides[ua], sv = strides[va];
    const off = s * sd;
    if (maskBuf.length < nu * nv) maskBuf = new Uint32Array(nu * nv);
    const mask = maskBuf;
    const fbits = f << 8;
    for (let t = 0; t < nd; t++) {
      // ---- build the face mask for this slice
      let n = 0;
      let any = false;
      const tBase = base + t * sd;
      for (let v = 0; v < nv; v++) {
        let idx = tBase + v * sv;
        for (let u = 0; u < nu; u++, idx += su) {
          const a = vox[idx];
          if (a === 0) { mask[n++] = 0; continue; }
          const ni = idx + off;
          const b = vox[ni];
          const ta = transparent[a];
          if (b !== 0 && (ta || !transparent[b])) { mask[n++] = 0; continue; }
          let key = a | (ta << 16);
          if (!ta) {
            // ambient occlusion from the 8 voxels around the neighbour cell in the face plane
            const um = vox[ni - su], up = vox[ni + su], vm = vox[ni - sv], vp = vox[ni + sv];
            const s_um = um !== 0 && !transparent[um] ? 1 : 0;
            const s_up = up !== 0 && !transparent[up] ? 1 : 0;
            const s_vm = vm !== 0 && !transparent[vm] ? 1 : 0;
            const s_vp = vp !== 0 && !transparent[vp] ? 1 : 0;
            if (s_um | s_up | s_vm | s_vp) {
              const cmm = vox[ni - su - sv], cpm = vox[ni + su - sv], cmp = vox[ni - su + sv], cpp = vox[ni + su + sv];
              const k_mm = cmm !== 0 && !transparent[cmm] ? 1 : 0;
              const k_pm = cpm !== 0 && !transparent[cpm] ? 1 : 0;
              const k_mp = cmp !== 0 && !transparent[cmp] ? 1 : 0;
              const k_pp = cpp !== 0 && !transparent[cpp] ? 1 : 0;
              const a00 = s_um && s_vm ? 0 : 3 - (s_um + s_vm + k_mm);
              const a10 = s_up && s_vm ? 0 : 3 - (s_up + s_vm + k_pm);
              const a01 = s_um && s_vp ? 0 : 3 - (s_um + s_vp + k_mp);
              const a11 = s_up && s_vp ? 0 : 3 - (s_up + s_vp + k_pp);
              key |= (a00 << 8) | (a10 << 10) | (a01 << 12) | (a11 << 14);
            } else {
              const cmm = vox[ni - su - sv], cpm = vox[ni + su - sv], cmp = vox[ni - su + sv], cpp = vox[ni + su + sv];
              const a00 = 3 - (cmm !== 0 && !transparent[cmm] ? 1 : 0);
              const a10 = 3 - (cpm !== 0 && !transparent[cpm] ? 1 : 0);
              const a01 = 3 - (cmp !== 0 && !transparent[cmp] ? 1 : 0);
              const a11 = 3 - (cpp !== 0 && !transparent[cpp] ? 1 : 0);
              key |= (a00 << 8) | (a10 << 10) | (a01 << 12) | (a11 << 14);
            }
          } else {
            key |= 0xff00; // no AO on glass
          }
          mask[n++] = key;
          any = true;
        }
      }
      if (!any) continue;
      // ---- greedy merge
      c[d] = t + (s > 0 ? 1 : 0);
      for (let v = 0; v < nv; v++) {
        const row = v * nu;
        for (let u = 0; u < nu; u++) {
          const key = mask[row + u];
          if (key === 0) continue;
          let w = 1;
          while (u + w < nu && w < MAX_MERGE && mask[row + u + w] === key) w++;
          let h = 1;
          outer: while (v + h < nv && h < MAX_MERGE) {
            const r2 = (v + h) * nu + u;
            for (let k = 0; k < w; k++) if (mask[r2 + k] !== key) break outer;
            h++;
          }
          for (let hh = 0; hh < h; hh++) {
            const r2 = (v + hh) * nu + u;
            for (let k = 0; k < w; k++) mask[r2 + k] = 0;
          }
          c[ua] = u; c[va] = v;
          const q0 = (c[0] + ox) | ((c[1] + oy) << 16);
          const q1 = ((c[2] + oz) | ((w - 1) << 16) | ((h - 1) << 24)) >>> 0;
          const q2 = (key & 0xff) | fbits | (((key >>> 8) & 0xff) << 11) | ((key >>> 16) << 19);
          if (key >>> 16) trans.push(q0, q1, q2, slot);
          else opaque.push(q0, q1, q2, slot);
          u += w - 1;
        }
      }
    }
  }
}

/** Build a padded copy of an unpadded grid (x fastest, then z, then y). */
export function padGrid(src: Uint8Array, sx: number, sy: number, sz: number, out?: Uint8Array): Uint8Array {
  const PX = sx + 2, PZ = sz + 2, PY = sy + 2;
  const dst = out && out.length >= PX * PY * PZ ? out : new Uint8Array(PX * PY * PZ);
  dst.fill(0, 0, PX * PY * PZ);
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      const si = sx * (z + sz * y);
      const di = 1 + PX * (z + 1 + PZ * (y + 1));
      dst.set(src.subarray(si, si + sx), di);
    }
  }
  return dst;
}
