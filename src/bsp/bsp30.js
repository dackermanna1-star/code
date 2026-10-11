// GoldSrc BSP v30 + WAD3 reader, for players who own Counter-Strike 1.6 and want to
// load their own de_dust2.bsp / cs_dust.wad. Nothing from Valve ships with this repo.

const LUMP = { ENTITIES: 0, PLANES: 1, TEXTURES: 2, VERTICES: 3, VISIBILITY: 4, NODES: 5, TEXINFO: 6, FACES: 7, LIGHTING: 8, CLIPNODES: 9, LEAVES: 10, MARKSURFACES: 11, EDGES: 12, SURFEDGES: 13, MODELS: 14 };

export function parseBsp(buf) {
  const dv = new DataView(buf);
  const version = dv.getInt32(0, true);
  if (version !== 30) throw new Error(`Not a GoldSrc BSP (version ${version})`);
  const lump = (i) => ({ ofs: dv.getInt32(4 + i * 8, true), len: dv.getInt32(8 + i * 8, true) });
  const bsp = { version };

  // entities
  {
    const l = lump(LUMP.ENTITIES);
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf, l.ofs, l.len));
    bsp.entities = parseEntities(text);
  }
  // planes
  {
    const l = lump(LUMP.PLANES), n = l.len / 20;
    bsp.planes = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = l.ofs + i * 20;
      bsp.planes[i] = { n: [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)], d: dv.getFloat32(o + 12, true), type: dv.getInt32(o + 16, true) };
    }
  }
  // textures
  {
    const l = lump(LUMP.TEXTURES);
    const n = dv.getInt32(l.ofs, true);
    bsp.textures = [];
    for (let i = 0; i < n; i++) {
      const off = dv.getInt32(l.ofs + 4 + i * 4, true);
      if (off < 0) { bsp.textures.push({ name: '', width: 16, height: 16, data: null }); continue; }
      bsp.textures.push(readMiptex(buf, l.ofs + off));
    }
  }
  // vertices
  {
    const l = lump(LUMP.VERTICES);
    bsp.vertices = new Float32Array(buf.slice(l.ofs, l.ofs + l.len));
  }
  // nodes
  {
    const l = lump(LUMP.NODES), n = l.len / 24;
    bsp.nodes = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = l.ofs + i * 24;
      bsp.nodes[i] = {
        plane: dv.getInt32(o, true), children: [dv.getInt16(o + 4, true), dv.getInt16(o + 6, true)],
        firstface: dv.getUint16(o + 20, true), numfaces: dv.getUint16(o + 22, true),
      };
    }
  }
  // texinfo
  {
    const l = lump(LUMP.TEXINFO), n = l.len / 40;
    bsp.texinfo = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = l.ofs + i * 40;
      const v = [];
      for (let k = 0; k < 8; k++) v.push(dv.getFloat32(o + k * 4, true));
      bsp.texinfo[i] = { s: v.slice(0, 4), t: v.slice(4, 8), miptex: dv.getInt32(o + 32, true), flags: dv.getInt32(o + 36, true) };
    }
  }
  // faces
  {
    const l = lump(LUMP.FACES), n = l.len / 20;
    bsp.faces = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = l.ofs + i * 20;
      bsp.faces[i] = {
        plane: dv.getUint16(o, true), side: dv.getInt16(o + 2, true), firstedge: dv.getInt32(o + 4, true), numedges: dv.getInt16(o + 8, true),
        texinfo: dv.getInt16(o + 10, true), styles: [dv.getUint8(o + 12), dv.getUint8(o + 13), dv.getUint8(o + 14), dv.getUint8(o + 15)], lightofs: dv.getInt32(o + 16, true),
      };
    }
  }
  {
    const l = lump(LUMP.LIGHTING);
    bsp.lighting = new Uint8Array(buf, l.ofs, l.len);
  }
  // clipnodes
  {
    const l = lump(LUMP.CLIPNODES), n = l.len / 8;
    bsp.clipnodes = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = l.ofs + i * 8;
      bsp.clipnodes[i] = { plane: dv.getInt32(o, true), children: [dv.getInt16(o + 4, true), dv.getInt16(o + 6, true)] };
    }
  }
  // leaves
  {
    const l = lump(LUMP.LEAVES), n = l.len / 28;
    bsp.leaves = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = l.ofs + i * 28;
      bsp.leaves[i] = { contents: dv.getInt32(o, true) };
    }
  }
  // edges / surfedges
  {
    const l = lump(LUMP.EDGES);
    bsp.edges = new Uint16Array(buf.slice(l.ofs, l.ofs + l.len));
    const s = lump(LUMP.SURFEDGES);
    bsp.surfedges = new Int32Array(buf.slice(s.ofs, s.ofs + s.len));
  }
  // models
  {
    const l = lump(LUMP.MODELS), n = l.len / 64;
    bsp.models = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = l.ofs + i * 64;
      const f = (k) => dv.getFloat32(o + k * 4, true);
      bsp.models[i] = {
        mins: [f(0), f(1), f(2)], maxs: [f(3), f(4), f(5)], origin: [f(6), f(7), f(8)],
        headnode: [dv.getInt32(o + 36, true), dv.getInt32(o + 40, true), dv.getInt32(o + 44, true), dv.getInt32(o + 48, true)],
        firstface: dv.getInt32(o + 56, true), numfaces: dv.getInt32(o + 60, true),
      };
    }
  }
  return bsp;
}

function readMiptex(buf, ofs) {
  const dv = new DataView(buf);
  const name = cstr(new Uint8Array(buf, ofs, 16));
  const width = dv.getUint32(ofs + 16, true), height = dv.getUint32(ofs + 20, true);
  const off0 = dv.getUint32(ofs + 24, true);
  let data = null;
  if (off0 > 0) data = decodeMiptex(buf, ofs, width, height, name);
  return { name, width, height, data };
}

// 8-bit mip level 0 + palette -> RGBA
function decodeMiptex(buf, ofs, width, height, name) {
  const dv = new DataView(buf);
  const off = [0, 1, 2, 3].map((k) => dv.getUint32(ofs + 24 + k * 4, true));
  const pix = new Uint8Array(buf, ofs + off[0], width * height);
  const palOfs = ofs + off[3] + (width >> 3) * (height >> 3) + 2;
  const pal = new Uint8Array(buf, palOfs, 768);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const transparent = name[0] === '{';
  for (let i = 0; i < width * height; i++) {
    const c = pix[i];
    rgba[i * 4] = pal[c * 3]; rgba[i * 4 + 1] = pal[c * 3 + 1]; rgba[i * 4 + 2] = pal[c * 3 + 2];
    rgba[i * 4 + 3] = transparent && c === 255 ? 0 : 255;
  }
  return rgba;
}

export function parseWad(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'WAD3' && magic !== 'WAD2') throw new Error('Not a WAD file');
  const num = dv.getInt32(4, true), tab = dv.getInt32(8, true);
  const out = new Map();
  for (let i = 0; i < num; i++) {
    const o = tab + i * 32;
    const filepos = dv.getInt32(o, true);
    const type = dv.getUint8(o + 12);
    const name = cstr(new Uint8Array(buf, o + 16, 16)).toLowerCase();
    if (type !== 0x43) continue;
    try { out.set(name, readMiptex(buf, filepos)); } catch { /* skip broken */ }
  }
  return out;
}

function cstr(bytes) {
  let s = '';
  for (const b of bytes) { if (!b) break; s += String.fromCharCode(b); }
  return s;
}

export function parseEntities(text) {
  const ents = [];
  const re = /\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const e = {};
    const kv = /"([^"]*)"\s*"([^"]*)"/g;
    let k;
    while ((k = kv.exec(m[1]))) e[k[1]] = k[2];
    ents.push(e);
  }
  return ents;
}

// ---------------------------------------------------------------------------
// Hull collision (SV_RecursiveHullCheck)

export const CONTENTS_EMPTY = -1, CONTENTS_SOLID = -2, CONTENTS_SKY = -6;
const DIST_EPSILON = 0.03125;

export class BspHulls {
  constructor(bsp) {
    this.bsp = bsp;
  }

  // hull 0 uses nodes/leaves, hulls 1-3 use clipnodes
  pointContents(hull, num, p) {
    const b = this.bsp;
    while (num >= 0) {
      let plane, children;
      if (hull === 0) { const n = b.nodes[num]; plane = b.planes[n.plane]; children = n.children; }
      else { const n = b.clipnodes[num]; plane = b.planes[n.plane]; children = n.children; }
      const d = plane.type < 3 ? p[plane.type] - plane.d : plane.n[0] * p[0] + plane.n[1] * p[1] + plane.n[2] * p[2] - plane.d;
      num = d < 0 ? children[1] : children[0];
    }
    if (hull === 0) return b.leaves[-1 - num].contents;
    return num;
  }

  // returns true if the trace hit something; fills t {fraction, endpos, plane, startsolid, allsolid, inopen}
  recursive(hull, num, p1f, p2f, p1, p2, t) {
    const b = this.bsp;
    if (num < 0) {
      const contents = hull === 0 ? b.leaves[-1 - num].contents : num;
      if (contents !== CONTENTS_SOLID) {
        t.allsolid = false;
        if (contents === CONTENTS_EMPTY) t.inopen = true;
      } else {
        t.startsolid = true;
      }
      return true;
    }
    let plane, children;
    if (hull === 0) { const n = b.nodes[num]; plane = b.planes[n.plane]; children = n.children; }
    else { const n = b.clipnodes[num]; plane = b.planes[n.plane]; children = n.children; }
    let t1, t2;
    if (plane.type < 3) { t1 = p1[plane.type] - plane.d; t2 = p2[plane.type] - plane.d; }
    else {
      t1 = plane.n[0] * p1[0] + plane.n[1] * p1[1] + plane.n[2] * p1[2] - plane.d;
      t2 = plane.n[0] * p2[0] + plane.n[1] * p2[1] + plane.n[2] * p2[2] - plane.d;
    }
    if (t1 >= 0 && t2 >= 0) return this.recursive(hull, children[0], p1f, p2f, p1, p2, t);
    if (t1 < 0 && t2 < 0) return this.recursive(hull, children[1], p1f, p2f, p1, p2, t);
    let frac = t1 < 0 ? (t1 + DIST_EPSILON) / (t1 - t2) : (t1 - DIST_EPSILON) / (t1 - t2);
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    let midf = p1f + (p2f - p1f) * frac;
    const mid = [p1[0] + frac * (p2[0] - p1[0]), p1[1] + frac * (p2[1] - p1[1]), p1[2] + frac * (p2[2] - p1[2])];
    const side = t1 < 0 ? 1 : 0;
    if (!this.recursive(hull, children[side], p1f, midf, p1, mid, t)) return false;
    if (this.pointContents(hull, children[side ^ 1], mid) !== CONTENTS_SOLID) {
      return this.recursive(hull, children[side ^ 1], midf, p2f, mid, p2, t);
    }
    if (t.allsolid) return false;
    if (!side) { t.normal = plane.n.slice(); t.dist = plane.d; }
    else { t.normal = [-plane.n[0], -plane.n[1], -plane.n[2]]; t.dist = -plane.d; }
    while (this.pointContents(hull, b.models[0].headnode[hull], mid) === CONTENTS_SOLID) {
      frac -= 0.1;
      if (frac < 0) {
        t.fraction = midf;
        t.endpos = mid;
        return false;
      }
      midf = p1f + (p2f - p1f) * frac;
      mid[0] = p1[0] + frac * (p2[0] - p1[0]);
      mid[1] = p1[1] + frac * (p2[1] - p1[1]);
      mid[2] = p1[2] + frac * (p2[2] - p1[2]);
    }
    t.fraction = midf;
    t.endpos = mid;
    return false;
  }
}
