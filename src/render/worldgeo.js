// Builds GPU geometry for a level. Vertices reference sectors by index and
// read live floor/ceiling heights from a data texture in the vertex shader,
// so doors, lifts and crushers move without rebuilding buffers. Texture
// changes (switches, animations, scrollers) only touch small tables.

import { WORLD_FLOATS } from './shaders.js';
import { ML } from '../game/mapdata.js';
import { FloatTable } from './gl.js';

const F_FLAT = 1;
const F_MASKED = 2;
const F_NOVWRAP = 4;

const PLANE_FLOOR = 0;
const PLANE_CEIL = 1;
const PLANE_ABS = 2;

export const SKY_HEIGHT = 8192;

export class WorldGeometry {
  constructor(gl, level, res) {
    this.gl = gl;
    this.level = level;
    this.res = res;
    const ns = level.sectors.length;
    this.sideBase = ns * 2;
    this.decalBase = this.sideBase + level.sides.length * 3;
    this.maxDecals = 4096;
    this.sectorTable = new FloatTable(gl, 256, Math.ceil(ns / 256) + 1);
    this.surfaceTable = new FloatTable(gl, 256, Math.ceil((this.decalBase + this.maxDecals) / 256) + 1);
    this.build();
    for (const sec of level.sectors) this.updateSectorFlats(sec);
    for (const side of level.sides) this.updateSide(side);
    this.updateSectors(1);
  }

  isSky(pic) {
    return this.res.skyFlat && pic === this.res.skyFlat.index;
  }

  flatImage(pic) {
    const f = this.res.flats[pic];
    return f ? f.id : 0;
  }

  textureImage(num) {
    const t = this.res.textures[num];
    return t ? t.id : -1;
  }

  updateSectorFlats(sec) {
    this.surfaceTable.set(sec.index * 2, this.flatImage(sec.floorpic), 0, 0, 0);
    this.surfaceTable.set(sec.index * 2 + 1, this.flatImage(sec.ceilingpic), 0, 0, 0);
  }

  updateSide(side) {
    const b = this.sideBase + side.index * 3;
    const xo = side.textureoffset;
    const yo = side.rowoffset;
    this.surfaceTable.set(b, side.toptexture ? this.textureImage(side.toptexture) : -1, xo, yo, 0);
    this.surfaceTable.set(b + 1, side.midtexture ? this.textureImage(side.midtexture) : -1, xo, yo, 0);
    this.surfaceTable.set(b + 2, side.bottomtexture ? this.textureImage(side.bottomtexture) : -1, xo, yo, 0);
  }

  // Interpolated heights/light for rendering.
  updateSectors(frac) {
    const t = this.sectorTable;
    for (const s of this.level.sectors) {
      const f = s.prevFloor + (s.floorheight - s.prevFloor) * frac;
      const c = s.prevCeil + (s.ceilingheight - s.prevCeil) * frac;
      t.set(s.index, f, c, s.lightlevel, 0);
    }
  }

  build() {
    const level = this.level;
    const verts = [];
    const sky = [];
    const push = (arr, x, y, zs, zp, za, u, vs, vp, va, surf, ls, contrast, flags) => {
      arr.push(x, y, zs, zp, za, u, vs, vp, va, surf, ls, contrast, flags);
    };
    // Quad helper: a = (x1,y1), b = (x2,y2); bottom/top anchors.
    const quad = (arr, x1, y1, x2, y2, u1, u2, bot, top, vAnchor, surf, ls, contrast, flags) => {
      const v = (x, y, u, anchor) => push(arr, x, y, anchor[0], anchor[1], anchor[2], u,
        vAnchor[0], vAnchor[1], vAnchor[2], surf, ls, contrast, flags);
      v(x1, y1, u1, bot); v(x2, y2, u2, bot); v(x2, y2, u2, top);
      v(x1, y1, u1, bot); v(x2, y2, u2, top); v(x1, y1, u1, top);
    };

    for (const line of level.lines) {
      const contrast = line.dy === 0 ? -1 : (line.dx === 0 ? 1 : 0);
      const len = line.length;
      for (let sideNum = 0; sideNum < 2; sideNum++) {
        const side = sideNum === 0 ? line.front : line.back;
        if (!side) continue;
        const front = side.sector;
        const back = sideNum === 0 ? line.backsector : line.frontsector;
        const twoSided = !!(line.back && line.front && back);
        const [ax, ay, bx, by] = sideNum === 0
          ? [line.v1.x, line.v1.y, line.v2.x, line.v2.y]
          : [line.v2.x, line.v2.y, line.v1.x, line.v1.y];
        const u1 = 0;
        const u2 = len;
        const fs = front.index;
        const sb = this.sideBase + side.index * 3;
        const tex = (n) => this.res.textures[n];
        if (!twoSided) {
          if (sideNum === 1) continue;
          const t = tex(side.midtexture);
          const vA = (line.flags & ML.DONTPEGBOTTOM)
            ? [fs, PLANE_FLOOR, t ? t.height : 0]
            : [fs, PLANE_CEIL, 0];
          quad(verts, ax, ay, bx, by, u1, u2, [fs, PLANE_FLOOR, 0], [fs, PLANE_CEIL, 0], vA, sb + 1, fs, contrast, 0);
          if (this.isSky(front.ceilingpic)) {
            quad(sky, ax, ay, bx, by, 0, 0, [fs, PLANE_CEIL, 0], [fs, PLANE_CEIL, SKY_HEIGHT], [0, 0, 0], 0, fs, 0, 0);
          }
          continue;
        }
        const bs = back.index;
        const bothSky = this.isSky(front.ceilingpic) && this.isSky(back.ceilingpic);
        // Upper wall (visible when back ceiling is below front ceiling).
        if (bothSky) {
          quad(sky, ax, ay, bx, by, 0, 0, [bs, PLANE_CEIL, 0], [fs, PLANE_CEIL, 0], [0, 0, 0], 0, fs, 0, 0);
        } else if (side.toptexture) {
          const t = tex(side.toptexture);
          const vA = (line.flags & ML.DONTPEGTOP)
            ? [fs, PLANE_CEIL, 0]
            : [bs, PLANE_CEIL, t ? t.height : 0];
          quad(verts, ax, ay, bx, by, u1, u2, [bs, PLANE_CEIL, 0], [fs, PLANE_CEIL, 0], vA, sb, fs, contrast, 0);
        }
        // Lower wall (visible when back floor is above front floor).
        if (side.bottomtexture) {
          const vA = (line.flags & ML.DONTPEGBOTTOM)
            ? [fs, PLANE_CEIL, 0]
            : [bs, PLANE_FLOOR, 0];
          quad(verts, ax, ay, bx, by, u1, u2, [fs, PLANE_FLOOR, 0], [bs, PLANE_FLOOR, 0], vA, sb + 2, fs, contrast, 0);
        } else if (this.isSky(front.floorpic) && this.isSky(back.floorpic)) {
          quad(sky, ax, ay, bx, by, 0, 0, [fs, PLANE_FLOOR, 0], [bs, PLANE_FLOOR, 0], [0, 0, 0], 0, fs, 0, 0);
        }
        // Masked middle texture spans the opening and does not tile vertically.
        if (side.midtexture) {
          const t = tex(side.midtexture);
          const hiFloor = front.floorheight >= back.floorheight ? fs : bs;
          const loCeil = front.ceilingheight <= back.ceilingheight ? fs : bs;
          const vA = (line.flags & ML.DONTPEGBOTTOM)
            ? [hiFloor, PLANE_FLOOR, t ? t.height : 0]
            : [loCeil, PLANE_CEIL, 0];
          quad(verts, ax, ay, bx, by, u1, u2, [hiFloor, PLANE_FLOOR, 0], [loCeil, PLANE_CEIL, 0], vA,
            sb + 1, fs, contrast, F_MASKED | F_NOVWRAP);
        }
      }
    }

    // Flats from subsector polygons.
    for (const ss of level.subsectors) {
      const poly = ss.poly;
      if (!poly || poly.length < 3) continue;
      const sec = ss.sector;
      const s = sec.index;
      let area = 0;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        area += p.x * q.y - q.x * p.y;
      }
      const ccw = area > 0 ? poly : poly.slice().reverse();
      const floorArr = this.isSky(sec.floorpic) ? sky : verts;
      const ceilArr = this.isSky(sec.ceilingpic) ? sky : verts;
      for (let i = 1; i < ccw.length - 1; i++) {
        const tri = [ccw[0], ccw[i], ccw[i + 1]];
        for (const p of tri) push(floorArr, p.x, p.y, s, PLANE_FLOOR, 0, 0, 0, 0, 0, s * 2, s, 0, F_FLAT);
        for (let k = 2; k >= 0; k--) {
          const p = tri[k];
          push(ceilArr, p.x, p.y, s, PLANE_CEIL, 0, 0, 0, 0, 0, s * 2 + 1, s, 0, F_FLAT);
        }
      }
    }

    const gl = this.gl;
    this.worldData = new Float32Array(verts);
    this.skyData = new Float32Array(sky);
    this.worldCount = verts.length / WORLD_FLOATS;
    this.skyCount = sky.length / WORLD_FLOATS;
    this.worldBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.worldBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.worldData, gl.STATIC_DRAW);
    this.skyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.skyData, gl.STATIC_DRAW);
  }

  upload() {
    this.sectorTable.upload();
    this.surfaceTable.upload();
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.worldBuffer);
    gl.deleteBuffer(this.skyBuffer);
    gl.deleteTexture(this.sectorTable.texture);
    gl.deleteTexture(this.surfaceTable.texture);
  }
}

export { PLANE_FLOOR, PLANE_CEIL, PLANE_ABS, F_FLAT, F_MASKED, F_NOVWRAP };
