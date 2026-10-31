// Minimal glTF 2.0 binary (.glb) reader: JSON + BIN chunks, typed accessor views, node hierarchy and
// animation samplers. Data only - nothing in the file is ever executed. No dependencies; works in
// Node (readGlb) and the browser (parseGlb on fetched bytes).

const COMP = {
  5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2],
  5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4],
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** Parse .glb bytes (Uint8Array / Buffer). */
export function parseGlb(u8, label = 'glb') {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`${label}: not a glb`);
  if (dv.getUint32(4, true) !== 2) throw new Error(`${label}: glTF version ${dv.getUint32(4, true)}`);
  const total = Math.min(dv.getUint32(8, true), u8.byteLength);
  let off = 12, json = null, bin = null;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const data = u8.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error(`${label}: missing chunks`);
  return new Gltf(json, bin);
}

/** Node: read and parse a .glb file. */
export async function readGlbFile(path) {
  const { readFileSync } = await import('node:fs');
  return parseGlb(readFileSync(path), path);
}

export class Gltf {
  constructor(json, bin) {
    this.json = json;
    this.bin = bin;
    this.nodes = json.nodes || [];
    this.parentOf = new Int32Array(this.nodes.length).fill(-1);
    this.nodes.forEach((n, i) => (n.children || []).forEach((c) => (this.parentOf[c] = i)));
  }

  /** Accessor as a Float64Array of count * ncomp values (de-normalised). */
  accessor(i) {
    const a = this.json.accessors[i];
    const [Arr, size] = COMP[a.componentType];
    const n = NCOMP[a.type];
    const out = new Float64Array(a.count * n);
    if (a.bufferView === undefined) return out;
    const bv = this.json.bufferViews[a.bufferView];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || size * n;
    const dv = new DataView(this.bin.buffer, this.bin.byteOffset, this.bin.byteLength);
    const read = {
      5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true),
      5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
    }[a.componentType];
    const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0;
    for (let k = 0; k < a.count; k++) {
      for (let c = 0; c < n; c++) {
        let v = read(base + k * stride + c * size);
        if (norm) v = Math.max(v / norm, -1);
        out[k * n + c] = v;
      }
    }
    void Arr;
    return out;
  }

  nodeIndex(name) {
    return this.nodes.findIndex((n) => n.name === name);
  }

  /** Rest (bind) local transform of a node: { t:[3], r:[4] (x,y,z,w), s:[3] }. */
  restLocal(i) {
    const n = this.nodes[i];
    if (n.matrix) throw new Error('matrix nodes not supported');
    return { t: n.translation ? [...n.translation] : [0, 0, 0], r: n.rotation ? [...n.rotation] : [0, 0, 0, 1], s: n.scale ? [...n.scale] : [1, 1, 1] };
  }

  animations() {
    return (this.json.animations || []).map((a, i) => ({ index: i, name: a.name }));
  }

  /**
   * Decode one animation: per node, the tracks it animates. Returns
   * { name, duration, tracks: Map(node -> { translation?, rotation?, scale? }) } where each track is
   * { times: Float64Array, values: Float64Array, n: components, interp }.
   */
  animation(nameOrIndex) {
    const all = this.json.animations || [];
    const a = typeof nameOrIndex === 'number' ? all[nameOrIndex] : all.find((x) => x.name === nameOrIndex);
    if (!a) throw new Error(`no animation ${nameOrIndex}`);
    const tracks = new Map();
    let duration = 0;
    for (const ch of a.channels) {
      const s = a.samplers[ch.sampler];
      const times = this.accessor(s.input);
      const values = this.accessor(s.output);
      const node = ch.target.node;
      if (node === undefined) continue;
      const n = ch.target.path === 'rotation' ? 4 : ch.target.path === 'weights' ? 0 : 3;
      if (!n) continue;
      const interp = s.interpolation || 'LINEAR';
      if (!tracks.has(node)) tracks.set(node, {});
      tracks.get(node)[ch.target.path] = { times, values, n, interp };
      duration = Math.max(duration, times[times.length - 1]);
    }
    return { name: a.name, duration, tracks };
  }
}

/** Sample a track at time t (LINEAR / STEP; CUBICSPLINE uses the spline's values). out: array of n. */
export function sampleTrack(tr, t, out) {
  const { times, values, n, interp } = tr;
  const cubic = interp === 'CUBICSPLINE';
  const stride = cubic ? n * 3 : n;
  const voff = cubic ? n : 0;
  const last = times.length - 1;
  if (t <= times[0] || last === 0) {
    for (let c = 0; c < n; c++) out[c] = values[voff + c];
    return out;
  }
  if (t >= times[last]) {
    for (let c = 0; c < n; c++) out[c] = values[last * stride + voff + c];
    return out;
  }
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (times[m] <= t) lo = m;
    else hi = m;
  }
  const t0 = times[lo], t1 = times[hi];
  const u = (t - t0) / (t1 - t0);
  if (interp === 'STEP') {
    for (let c = 0; c < n; c++) out[c] = values[lo * stride + voff + c];
    return out;
  }
  if (cubic) {
    // Hermite: p0 = v[lo], m0 = outTangent[lo]*dt, p1 = v[hi], m1 = inTangent[hi]*dt
    const dt = t1 - t0, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (let c = 0; c < n; c++) {
      const p0 = values[lo * stride + n + c], m0 = values[lo * stride + 2 * n + c] * dt;
      const p1 = values[hi * stride + n + c], m1 = values[hi * stride + c] * dt;
      out[c] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
    }
    if (n === 4) normalize4(out);
    return out;
  }
  if (n === 4) {
    // slerp (shortest arc)
    const a = lo * stride, b = hi * stride;
    let ax = values[a], ay = values[a + 1], az = values[a + 2], aw = values[a + 3];
    let bx = values[b], by = values[b + 1], bz = values[b + 2], bw = values[b + 3];
    let d = ax * bx + ay * by + az * bz + aw * bw;
    if (d < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d;
    }
    let ka, kb;
    if (d > 0.9995) {
      ka = 1 - u;
      kb = u;
    } else {
      const th = Math.acos(d), s = Math.sin(th);
      ka = Math.sin((1 - u) * th) / s;
      kb = Math.sin(u * th) / s;
    }
    out[0] = ax * ka + bx * kb;
    out[1] = ay * ka + by * kb;
    out[2] = az * ka + bz * kb;
    out[3] = aw * ka + bw * kb;
    return normalize4(out);
  }
  for (let c = 0; c < n; c++) out[c] = values[lo * stride + c] * (1 - u) + values[hi * stride + c] * u;
  return out;
}

function normalize4(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
}
