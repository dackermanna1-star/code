// Procedural low-poly first-person models: arms/fists, the seven tools and the kicking boot.
// Late-PS2 style: chunky convex shapes, flat-shaded hex/oct sections where it reads well,
// smooth-shaded round handles, small (128 px) procedural canvas textures with bilinear filtering.
//
// Tool-local frame (matches the hand frames of swing.ts): origin = the right hand's grip on the
// handle, +Y along the handle towards the head, +Z = striking face / direction of travel at
// contact (perpendicular to the handle), X = Y × Z. The physics head sphere sits on the +Y axis
// at the rig's grip→head distance; each model keeps its striking surface inside that sphere so
// what you see touching a wall is what the physics swept.
//
// Hand frame: origin = centre of the grip (where a handle passes through the fist), +Y = through
// axis (index finger end), +Z = knuckles. Built for the right hand; the left hand is mirrored.

import {
  Color3,
  DynamicTexture,
  Mesh,
  StandardMaterial,
  Texture,
  TransformNode,
  VertexData,
  type Scene,
} from "@babylonjs/core";
import type { ToolId } from "../../core/context.ts";
import { Rng } from "../../core/rng.ts";
import { TOOL_RIGS } from "./defs.ts";
import type { V3 } from "./swing.ts";

// ------------------------------------------------------------------------------------ geometry kit

interface Buf {
  pos: number[];
  nrm: number[];
  uv: number[];
  idx: number[];
}

const vv = (x: number, y: number, z: number): V3 => ({ x, y, z });
const vsub = (a: V3, b: V3): V3 => vv(a.x - b.x, a.y - b.y, a.z - b.z);
const vadd = (a: V3, b: V3): V3 => vv(a.x + b.x, a.y + b.y, a.z + b.z);
const vscl = (a: V3, s: number): V3 => vv(a.x * s, a.y * s, a.z * s);
const vdot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const vcross = (a: V3, b: V3): V3 => vv(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = (a: V3) => Math.hypot(a.x, a.y, a.z);
const vnorm = (a: V3): V3 => {
  const l = vlen(a);
  return l > 1e-12 ? vscl(a, 1 / l) : vv(0, 1, 0);
};
const vperp = (w: V3): V3 => vnorm(vcross(w, Math.abs(w.x) < 0.85 ? vv(1, 0, 0) : vv(0, 1, 0)));

/**
 * Accumulates triangles per material key and builds one Mesh per material. Every face is given
 * explicitly with an outward normal; triangles are emitted in Babylon's front-face winding for
 * the default left-handed scene (cross(b−a, c−a) = −n, see src/geom/meshgen.ts).
 */
export class MeshKit {
  private readonly bufs = new Map<string, Buf>();
  /** Mirror X (left-hand parts). */
  mirrorX = false;

  private buf(mat: string): Buf {
    let b = this.bufs.get(mat);
    if (!b) {
      b = { pos: [], nrm: [], uv: [], idx: [] };
      this.bufs.set(mat, b);
    }
    return b;
  }

  private vert(b: Buf, p: V3, n: V3, u: number, v: number): number {
    const s = this.mirrorX ? -1 : 1;
    b.pos.push(p.x * s, p.y, p.z);
    b.nrm.push(n.x * s, n.y, n.z);
    b.uv.push(u, v);
    return b.pos.length / 3 - 1;
  }

  /** Emit triangle (i, j, k) of buffer b so that it faces along its vertices' normals. */
  private tri(b: Buf, i: number, j: number, k: number): void {
    const P = b.pos,
      N = b.nrm;
    const ax = P[3 * i],
      ay = P[3 * i + 1],
      az = P[3 * i + 2];
    const ux = P[3 * j] - ax,
      uy = P[3 * j + 1] - ay,
      uz = P[3 * j + 2] - az;
    const wx = P[3 * k] - ax,
      wy = P[3 * k + 1] - ay,
      wz = P[3 * k + 2] - az;
    const cx = uy * wz - uz * wy,
      cy = uz * wx - ux * wz,
      cz = ux * wy - uy * wx;
    const nx = N[3 * i] + N[3 * j] + N[3 * k],
      ny = N[3 * i + 1] + N[3 * j + 1] + N[3 * k + 1],
      nz = N[3 * i + 2] + N[3 * j + 2] + N[3 * k + 2];
    // Babylon front face: geometric cross product opposite to the outward normal
    if (cx * nx + cy * ny + cz * nz > 0) b.idx.push(i, k, j);
    else b.idx.push(i, j, k);
  }

  /** Planar UVs for a face: project on the two axes most perpendicular to its normal. */
  private faceUV(p: V3, n: V3, scale: number): [number, number] {
    const ax = Math.abs(n.x),
      ay = Math.abs(n.y),
      az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return [p.z / scale, p.y / scale];
    if (ay >= ax && ay >= az) return [p.x / scale, p.z / scale];
    return [p.x / scale, p.y / scale];
  }

  /** Flat-shaded convex polygon (points in any winding; `outward` picks the side). */
  face(mat: string, pts: V3[], outward: V3, uvScale = 0.1): void {
    if (pts.length < 3) return;
    const b = this.buf(mat);
    // Newell normal oriented outwards
    let nx = 0,
      ny = 0,
      nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        c = pts[(i + 1) % pts.length];
      nx += (a.y - c.y) * (a.z + c.z);
      ny += (a.z - c.z) * (a.x + c.x);
      nz += (a.x - c.x) * (a.y + c.y);
    }
    let n = vnorm(vv(nx, ny, nz));
    if (vdot(n, outward) < 0) n = vscl(n, -1);
    const base = b.pos.length / 3;
    for (const p of pts) {
      const [u, v] = this.faceUV(p, n, uvScale);
      this.vert(b, p, n, u, v);
    }
    for (let i = 1; i + 1 < pts.length; i++) this.tri(b, base, base + i, base + i + 1);
  }

  /** Convex solid from points + face loops (indices); faces are oriented away from the centroid. */
  convex(mat: string, pts: V3[], faces: number[][], uvScale = 0.1): void {
    let c = vv(0, 0, 0);
    for (const p of pts) c = vadd(c, p);
    c = vscl(c, 1 / pts.length);
    for (const f of faces) {
      const fp = f.map((i) => pts[i]);
      let fc = vv(0, 0, 0);
      for (const p of fp) fc = vadd(fc, p);
      fc = vscl(fc, 1 / fp.length);
      this.face(mat, fp, vsub(fc, c), uvScale);
    }
  }

  /** Box with centre c, size s and optional basis (unit axes X, Y, Z). */
  box(mat: string, c: V3, s: V3, basis?: [V3, V3, V3], uvScale = 0.1): void {
    const [X, Y, Z] = basis ?? [vv(1, 0, 0), vv(0, 1, 0), vv(0, 0, 1)];
    const pts: V3[] = [];
    for (let i = 0; i < 8; i++) {
      const sx = i & 1 ? 0.5 : -0.5,
        sy = i & 2 ? 0.5 : -0.5,
        sz = i & 4 ? 0.5 : -0.5;
      pts.push(vadd(c, vadd(vscl(X, sx * s.x), vadd(vscl(Y, sy * s.y), vscl(Z, sz * s.z)))));
    }
    this.convex(mat, pts, [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]], uvScale);
  }

  /** Frustum/cylinder from a (radius ra) to b (radius rb). Smooth sides unless `flat`. */
  cyl(mat: string, a: V3, b: V3, ra: number, rb: number, sides: number, opts: { flat?: boolean; capA?: boolean; capB?: boolean; uvScale?: number; phase?: number; capMat?: string } = {}): void {
    const w = vnorm(vsub(b, a));
    const u = vperp(w),
      v = vcross(w, u);
    const L = vlen(vsub(b, a));
    const uvs = opts.uvScale ?? 0.1;
    const ph = opts.phase ?? 0;
    const ring = (o: V3, r: number, k: number): V3 => {
      const t = ph + (2 * Math.PI * k) / sides;
      return vadd(o, vadd(vscl(u, Math.cos(t) * r), vscl(v, Math.sin(t) * r)));
    };
    const bf = this.buf(mat);
    const slope = (ra - rb) / Math.max(L, 1e-6);
    if (opts.flat) {
      for (let k = 0; k < sides; k++) {
        const p0 = ring(a, ra, k),
          p1 = ring(a, ra, k + 1),
          p2 = ring(b, rb, k + 1),
          p3 = ring(b, rb, k);
        const mid = vnorm(vsub(vscl(vadd(p0, p1), 0.5), a));
        const n = vnorm(vadd(mid, vscl(w, slope)));
        const base = bf.pos.length / 3;
        const circ = (2 * Math.PI * Math.max(ra, rb)) / sides;
        this.vert(bf, p0, n, (k * circ) / uvs, 0);
        this.vert(bf, p1, n, ((k + 1) * circ) / uvs, 0);
        this.vert(bf, p2, n, ((k + 1) * circ) / uvs, L / uvs);
        this.vert(bf, p3, n, (k * circ) / uvs, L / uvs);
        this.tri(bf, base, base + 1, base + 2);
        this.tri(bf, base, base + 2, base + 3);
      }
    } else {
      const base = bf.pos.length / 3;
      for (let k = 0; k <= sides; k++) {
        const t = ph + (2 * Math.PI * k) / sides;
        const radial = vadd(vscl(u, Math.cos(t)), vscl(v, Math.sin(t)));
        const n = vnorm(vadd(radial, vscl(w, slope)));
        const uu = (k / sides) * ((2 * Math.PI * Math.max(ra, rb)) / uvs);
        this.vert(bf, vadd(a, vscl(radial, ra)), n, uu, 0);
        this.vert(bf, vadd(b, vscl(radial, rb)), n, uu, L / uvs);
      }
      for (let k = 0; k < sides; k++) {
        const i0 = base + 2 * k;
        this.tri(bf, i0, i0 + 2, i0 + 3);
        this.tri(bf, i0, i0 + 3, i0 + 1);
      }
    }
    const capMat = opts.capMat ?? mat;
    if (opts.capA !== false && ra > 1e-5) {
      const pts: V3[] = [];
      for (let k = 0; k < sides; k++) pts.push(ring(a, ra, k));
      this.face(capMat, pts, vscl(w, -1), uvs);
    }
    if (opts.capB !== false && rb > 1e-5) {
      const pts: V3[] = [];
      for (let k = 0; k < sides; k++) pts.push(ring(b, rb, k));
      this.face(capMat, pts, w, uvs);
    }
  }

  /**
   * Tapered convex slab: a convex polygon given in the (U, V) plane at origin o, extruded ±half
   * thickness along W per vertex (thick[i]); wedges/blades/chisels.
   */
  slab(mat: string, o: V3, U: V3, V: V3, W: V3, poly: Array<[number, number]>, thick: number[], uvScale = 0.1): void {
    const top: V3[] = [],
      bot: V3[] = [];
    poly.forEach(([pu, pv], i) => {
      const base = vadd(o, vadd(vscl(U, pu), vscl(V, pv)));
      const h = Math.max(thick[i] ?? thick[0], 1e-4) / 2;
      top.push(vadd(base, vscl(W, h)));
      bot.push(vadd(base, vscl(W, -h)));
    });
    const pts = [...top, ...bot];
    const n = poly.length;
    const faces: number[][] = [top.map((_, i) => i), bot.map((_, i) => n + i)];
    for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
    this.convex(mat, pts, faces, uvScale);
  }

  /** Build one mesh per material under `parent`. Missing materials fall back to the first one. */
  build(scene: Scene, name: string, mats: Record<string, StandardMaterial>, parent: TransformNode): Mesh[] {
    const out: Mesh[] = [];
    for (const [key, b] of this.bufs) {
      if (!b.idx.length) continue;
      const m = new Mesh(`${name}_${key}`, scene);
      const vd = new VertexData();
      vd.positions = b.pos;
      vd.normals = b.nrm;
      vd.uvs = b.uv;
      vd.indices = b.idx;
      vd.applyToMesh(m, false);
      m.material = mats[key] ?? Object.values(mats)[0];
      m.parent = parent;
      m.isPickable = false;
      m.receiveShadows = false;
      out.push(m);
    }
    this.bufs.clear();
    return out;
  }
}

// ------------------------------------------------------------------------------------ procedural textures

type TexKind = "skin" | "sleeve" | "cuff" | "wood" | "darkwood" | "steel" | "steelBright" | "paintRed" | "rubber" | "chrome" | "label" | "gauge" | "denim" | "leather" | "sole" | "tape";

interface MatDef {
  color: [number, number, number];
  spec: number;
  power: number;
  tex: TexKind;
  /** Colour is baked into the texture (diffuse multiplier stays white). */
  baked?: boolean;
}

const MATS: Record<TexKind, MatDef> = {
  skin: { color: [0.86, 0.66, 0.53], spec: 0.08, power: 16, tex: "skin" },
  sleeve: { color: [0.25, 0.28, 0.33], spec: 0.03, power: 8, tex: "sleeve" },
  cuff: { color: [0.19, 0.21, 0.25], spec: 0.03, power: 8, tex: "sleeve" },
  wood: { color: [0.8, 0.6, 0.38], spec: 0.12, power: 24, tex: "wood" },
  darkwood: { color: [0.58, 0.4, 0.24], spec: 0.15, power: 24, tex: "wood" },
  steel: { color: [0.44, 0.45, 0.47], spec: 0.55, power: 48, tex: "steel" },
  steelBright: { color: [0.74, 0.75, 0.77], spec: 0.9, power: 96, tex: "steel" },
  paintRed: { color: [0.75, 0.1, 0.07], spec: 0.35, power: 40, tex: "paintRed", baked: true },
  rubber: { color: [0.11, 0.11, 0.12], spec: 0.08, power: 12, tex: "rubber" },
  chrome: { color: [0.82, 0.82, 0.84], spec: 1.0, power: 128, tex: "steel" },
  label: { color: [1, 1, 1], spec: 0.2, power: 32, tex: "label" },
  gauge: { color: [1, 1, 1], spec: 0.6, power: 64, tex: "gauge" },
  denim: { color: [0.3, 0.36, 0.5], spec: 0.03, power: 8, tex: "denim" },
  leather: { color: [0.36, 0.24, 0.15], spec: 0.15, power: 20, tex: "leather" },
  sole: { color: [0.13, 0.12, 0.11], spec: 0.05, power: 8, tex: "rubber" },
  tape: { color: [0.16, 0.16, 0.18], spec: 0.1, power: 16, tex: "tape" },
};

/** Draw a 128 px procedural texture (deterministic). */
function drawTexture(ctx: CanvasRenderingContext2D, kind: TexKind, S: number): void {
  const rng = new Rng(0x51ab0 ^ kind.length * 7919 ^ kind.charCodeAt(0) * 131);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  // value noise lattice
  const G = 16;
  const lat = new Float32Array((G + 1) * (G + 1));
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  for (let j = 0; j <= G; j++) lat[j * (G + 1) + G] = lat[j * (G + 1)];
  for (let i = 0; i <= G; i++) lat[G * (G + 1) + i] = lat[i];
  const noise = (x: number, y: number): number => {
    const fx = ((x % 1) + 1) % 1,
      fy = ((y % 1) + 1) % 1;
    const gx = fx * G,
      gy = fy * G;
    const ix = Math.floor(gx),
      iy = Math.floor(gy);
    const tx = gx - ix,
      ty = gy - iy;
    const sx = tx * tx * (3 - 2 * tx),
      sy = ty * ty * (3 - 2 * ty);
    const a = lat[iy * (G + 1) + ix],
      b = lat[iy * (G + 1) + ix + 1],
      c = lat[(iy + 1) * (G + 1) + ix],
      e = lat[(iy + 1) * (G + 1) + ix + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S,
        v = y / S;
      let r = 1,
        g = 1,
        b = 1;
      const n1 = noise(u * 1, v * 1),
        n2 = noise(u * 4 + 0.3, v * 4 + 0.7),
        fine = rng.next();
      switch (kind) {
        case "skin": {
          const k = 0.9 + 0.08 * n1 + 0.04 * n2 + 0.03 * (fine - 0.5);
          r = k * 1.02;
          g = k * 0.98;
          b = k * 0.97;
          break;
        }
        case "sleeve":
        case "cuff": {
          // knit: fine vertical ribs + noise
          const rib = 0.88 + 0.12 * Math.abs(Math.sin(u * Math.PI * 24));
          const k = rib * (0.9 + 0.1 * n2) + 0.05 * (fine - 0.5);
          r = g = b = k;
          break;
        }
        case "wood": {
          // grain runs along v (the handle axis): stretched noise stripes
          const stripe = Math.sin((u * 9 + noise(u * 2, v * 0.25) * 3.5) * Math.PI * 2);
          const k = 0.86 + 0.1 * stripe + 0.08 * n2 + 0.04 * (fine - 0.5);
          r = k;
          g = k * 0.97;
          b = k * 0.93;
          break;
        }
        case "steel":
        case "steelBright": {
          // brushed: horizontal streaks + forge scale noise
          const streak = noise(u * 0.5, v * 8) * 0.12 + (fine - 0.5) * 0.05;
          const k = 0.88 + streak + 0.07 * n1;
          r = g = b = k;
          break;
        }
        case "paintRed": {
          // red powder coat (colour baked in) with a few chips showing bare grey steel
          const chip = noise(u * 3 + 5.1, v * 3 + 2.3) > 0.8;
          const k = 0.92 + 0.06 * n2 + 0.03 * (fine - 0.5);
          if (chip) {
            const m = 0.5 + 0.08 * n1;
            r = m;
            g = m;
            b = m * 1.03;
          } else {
            r = 0.75 * k;
            g = 0.1 * k;
            b = 0.07 * k;
          }
          break;
        }
        case "rubber": {
          const k = 0.85 + 0.15 * n2 + 0.08 * (fine - 0.5);
          r = g = b = k;
          break;
        }
        case "tape": {
          // spiral grip tape bands
          const band = ((u * 3 + v * 6) % 1 + 1) % 1 < 0.08 ? 0.6 : 1;
          const k = band * (0.9 + 0.1 * n2);
          r = g = b = k;
          break;
        }
        case "denim": {
          const tw = 0.85 + 0.15 * Math.abs(Math.sin((u + v) * Math.PI * 40));
          const k = tw * (0.88 + 0.12 * n1);
          r = g = b = k;
          break;
        }
        case "leather": {
          const k = 0.82 + 0.14 * n2 + 0.06 * n1 + 0.05 * (fine - 0.5);
          r = g = b = k;
          break;
        }
        default: {
          r = g = b = 1;
        }
      }
      const o = 4 * (y * S + x);
      d[o] = Math.max(0, Math.min(255, r * 255));
      d[o + 1] = Math.max(0, Math.min(255, g * 255));
      d[o + 2] = Math.max(0, Math.min(255, b * 255));
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (kind === "label") {
    // fire extinguisher label: red bands + bold text, the rest plain white
    ctx.fillStyle = "#f4f1ea";
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#b8150f";
    ctx.fillRect(0, 0, S, S * 0.14);
    ctx.fillRect(0, S * 0.86, S, S * 0.14);
    ctx.fillStyle = "#161616";
    ctx.font = `bold ${Math.round(S * 0.16)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("FIRE", S * 0.5, S * 0.38);
    ctx.font = `bold ${Math.round(S * 0.085)}px sans-serif`;
    ctx.fillText("EXTINGUISHER", S * 0.5, S * 0.52);
    ctx.font = `${Math.round(S * 0.06)}px sans-serif`;
    ctx.fillText("ABC  DRY POWDER  6kg", S * 0.5, S * 0.64);
    ctx.fillStyle = "#555";
    for (let i = 0; i < 3; i++) ctx.fillRect(S * 0.2, S * (0.7 + i * 0.045), S * 0.6, S * 0.012);
  } else if (kind === "gauge") {
    ctx.fillStyle = "#f2f2f0";
    ctx.fillRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.42, Math.PI * 0.8, Math.PI * 2.2);
    ctx.lineWidth = S * 0.12;
    ctx.strokeStyle = "#3aa64a";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2);
    ctx.lineTo(S * 0.78, S * 0.3);
    ctx.lineWidth = S * 0.05;
    ctx.strokeStyle = "#111";
    ctx.stroke();
  }
}

/** Shared viewmodel materials (StandardMaterial + 128 px procedural texture each). */
export function createViewmodelMaterials(scene: Scene): Record<TexKind, StandardMaterial> {
  const texCache = new Map<TexKind, DynamicTexture>();
  const out = {} as Record<TexKind, StandardMaterial>;
  for (const [key, def] of Object.entries(MATS) as Array<[TexKind, MatDef]>) {
    const mat = new StandardMaterial(`vm_${key}`, scene);
    mat.diffuseColor = def.baked ? new Color3(1, 1, 1) : new Color3(def.color[0], def.color[1], def.color[2]);
    mat.specularColor = new Color3(def.spec, def.spec, def.spec);
    mat.specularPower = def.power;
    // never fully black in an unlit room (the viewmodel is the player's own body)
    mat.emissiveColor = new Color3(def.color[0] * 0.05, def.color[1] * 0.05, def.color[2] * 0.05);
    mat.maxSimultaneousLights = 6;
    let tex = texCache.get(def.tex);
    if (!tex) {
      const S = 128;
      tex = new DynamicTexture(`vm_tex_${def.tex}`, { width: S, height: S }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
      const c2d = tex.getContext() as unknown as CanvasRenderingContext2D;
      drawTexture(c2d, def.tex, S);
      tex.update(true);
      tex.wrapU = Texture.WRAP_ADDRESSMODE;
      tex.wrapV = Texture.WRAP_ADDRESSMODE;
      tex.anisotropicFilteringLevel = 4;
      texCache.set(def.tex, tex);
    }
    mat.diffuseTexture = tex;
    out[key] = mat;
  }
  return out;
}

// ------------------------------------------------------------------------------------ models

/** Grip → head distance of a tool (from its rig), i.e. where the physics head sphere sits on +Y. */
export function toolLength(id: ToolId): number {
  const r = TOOL_RIGS[id];
  if (r.kind !== "arc") return 0;
  return Math.hypot(r.head.x - r.grip.x, r.head.y - r.grip.y, r.head.z - r.grip.z);
}

/** Nozzle tip relative to the left hand frame (+Z forward along the hand, +Y up). */
export const NOZZLE_TIP: Readonly<V3> = { x: 0, y: 0.015, z: 0.14 };
/** Extinguisher valve outlet (hose start) in the tool frame. */
export const HOSE_START: Readonly<V3> = { x: 0.0, y: 0.035, z: -0.06 };
/** Resting nozzle position (clipped to the cylinder) in the tool frame. */
export const HOSE_REST: Readonly<V3> = { x: 0.0, y: 0.34, z: -0.085 };

function buildHammer(k: MeshKit): void {
  const L = toolLength("hammer"); // ≈ 0.26
  // fibreglass-and-rubber style handle: rubber grip at the butt, wood-coloured shaft
  k.cyl("rubber", vv(0, -0.085, 0), vv(0, 0.04, 0), 0.0185, 0.0165, 10, { uvScale: 0.05 });
  k.cyl("darkwood", vv(0, 0.04, 0), vv(0, L + 0.01, -0.01), 0.0145, 0.012, 9, { uvScale: 0.3 });
  // head (steel): body block, round striking face (+Z, inside the head sphere), claw (−Z)
  const hy = L;
  k.box("steel", vv(0, hy, -0.012), vv(0.026, 0.036, 0.034), undefined, 0.05);
  k.cyl("steel", vv(0, hy, 0.004), vv(0, hy, 0.016), 0.0135, 0.0155, 10, { uvScale: 0.05, capB: false });
  k.cyl("steelBright", vv(0, hy, 0.016), vv(0, hy, 0.021), 0.0155, 0.0145, 10, { uvScale: 0.05, capA: false });
  // claw prongs curving back and down
  for (const sx of [-1, 1]) {
    const x0 = sx * 0.0065;
    k.convex(
      "steel",
      [
        vv(x0 - 0.005, hy + 0.016, -0.028),
        vv(x0 + 0.005, hy + 0.016, -0.028),
        vv(x0 - 0.005, hy - 0.014, -0.028),
        vv(x0 + 0.005, hy - 0.014, -0.028),
        vv(x0 + sx * 0.002 - 0.003, hy - 0.012, -0.095),
        vv(x0 + sx * 0.002 + 0.003, hy - 0.012, -0.095),
        vv(x0 + sx * 0.002 - 0.003, hy - 0.02, -0.088),
        vv(x0 + sx * 0.002 + 0.003, hy - 0.02, -0.088),
      ],
      [
        [0, 1, 3, 2],
        [4, 5, 7, 6],
        [0, 1, 5, 4],
        [2, 3, 7, 6],
        [0, 2, 6, 4],
        [1, 3, 7, 5],
      ],
      0.05,
    );
  }
}

function buildSledge(k: MeshKit): void {
  const L = toolLength("sledgehammer"); // ≈ 0.55
  const hz = -0.045; // head block centre behind the head point so the face sits inside the head sphere
  k.cyl("wood", vv(0, -0.3, 0.004), vv(0, -0.24, 0.003), 0.021, 0.019, 10, { uvScale: 0.5 });
  k.cyl("wood", vv(0, -0.24, 0.003), vv(0, L + 0.045, hz), 0.0175, 0.016, 10, { uvScale: 0.5, capA: false });
  // octagonal head, long axis along Z (faces at z = hz ± 0.1)
  k.cyl("steel", vv(0, L, hz - 0.1), vv(0, L, hz + 0.088), 0.038, 0.038, 8, { flat: true, phase: Math.PI / 8, uvScale: 0.08, capA: true, capB: false });
  k.cyl("steel", vv(0, L, hz + 0.088), vv(0, L, hz + 0.1), 0.038, 0.032, 8, { flat: true, phase: Math.PI / 8, uvScale: 0.08, capA: false, capMat: "steelBright" });
  k.cyl("steel", vv(0, L, hz - 0.1), vv(0, L, hz - 0.112), 0.038, 0.032, 8, { flat: true, phase: Math.PI / 8, uvScale: 0.08, capA: false, capMat: "steelBright" });
}

function buildAxe(k: MeshKit): void {
  const L = toolLength("axe"); // ≈ 0.50
  const ez = -0.042; // eye (handle) position behind the head point; the edge reaches z ≈ +0.035
  // slightly curved handle: two segments
  k.cyl("wood", vv(0, -0.24, 0.006), vv(0, -0.12, 0.0), 0.0175, 0.0165, 9, { uvScale: 0.5 });
  k.cyl("wood", vv(0, -0.12, 0.0), vv(0, L * 0.6, -0.012), 0.0165, 0.0155, 9, { uvScale: 0.5, capA: false });
  k.cyl("wood", vv(0, L * 0.6, -0.012), vv(0, L + 0.04, ez), 0.0155, 0.017, 9, { uvScale: 0.5, capA: false });
  // poll + eye block
  k.box("steel", vv(0, L, ez - 0.012), vv(0.034, 0.05, 0.056), undefined, 0.05);
  // bit: convex trapezoid in the (Y, Z) plane, wedge-thin towards the edge
  k.slab(
    "steel",
    vv(0, L, 0),
    vv(0, 1, 0),
    vv(0, 0, 1),
    vv(1, 0, 0),
    [
      [-0.025, ez + 0.016],
      [-0.064, 0.03],
      [0.058, 0.03],
      [0.025, ez + 0.016],
    ],
    [0.032, 0.006, 0.006, 0.032],
    0.06,
  );
  // bright honed edge strip
  k.slab(
    "steelBright",
    vv(0, L, 0),
    vv(0, 1, 0),
    vv(0, 0, 1),
    vv(1, 0, 0),
    [
      [-0.064, 0.03],
      [-0.066, 0.036],
      [0.06, 0.036],
      [0.058, 0.03],
    ],
    [0.006, 0.0015, 0.0015, 0.006],
    0.06,
  );
}

function buildCrowbar(k: MeshKit): void {
  const L = toolLength("crowbar"); // ≈ 0.50
  const r = 0.0115;
  // straight hex shaft with the flat chisel end below the hand
  k.cyl("steel", vv(0, -0.29, 0.004), vv(0, -0.25, 0), r * 0.55, r, 6, { flat: true, uvScale: 0.2 });
  k.cyl("paintRed", vv(0, -0.25, 0), vv(0, L - 0.04, 0), r, r, 6, { flat: true, uvScale: 0.3, capA: false, capB: false });
  // gooseneck: bends back (−Z) over the top so the striking side (+Z) is the bar at the bend
  const cy = L - 0.04,
    R = 0.045;
  const segs = 6;
  let prev = vv(0, cy, 0);
  for (let i = 1; i <= segs; i++) {
    const a = (Math.PI * i) / segs;
    const p = vv(0, cy + Math.sin(a) * R, -R + Math.cos(a) * R);
    k.cyl("paintRed", prev, p, r, r, 6, { flat: true, uvScale: 0.3, capA: false, capB: false });
    prev = p;
  }
  // hook end coming down, split claw tip (raw steel)
  const hookEnd = vv(0, cy - 0.045, -2 * R - 0.004);
  k.cyl("paintRed", prev, hookEnd, r, r * 0.9, 6, { flat: true, uvScale: 0.3, capA: false });
  for (const sx of [-1, 1]) {
    k.box("steel", vadd(hookEnd, vv(sx * 0.0045, -0.016, 0.006)), vv(0.006, 0.03, 0.01), [vv(1, 0, 0), vnorm(vv(0, 1, -0.35)), vnorm(vv(0, 0.35, 1))], 0.05);
  }
}

function buildBat(k: MeshKit): void {
  // natural ash: knob, taped handle, taper, barrel, rounded end (≈ 0.84 m)
  k.cyl("darkwood", vv(0, -0.13, 0), vv(0, -0.115, 0), 0.02, 0.021, 12, { uvScale: 0.4 });
  k.cyl("tape", vv(0, -0.115, 0), vv(0, 0.09, 0), 0.0145, 0.014, 10, { uvScale: 0.08, capA: false, capB: false });
  k.cyl("wood", vv(0, 0.09, 0), vv(0, 0.2, 0), 0.014, 0.017, 10, { uvScale: 0.6, capA: false, capB: false });
  k.cyl("wood", vv(0, 0.2, 0), vv(0, 0.42, 0), 0.017, 0.032, 12, { uvScale: 0.6, capA: false, capB: false });
  k.cyl("wood", vv(0, 0.42, 0), vv(0, 0.69, 0), 0.032, 0.033, 12, { uvScale: 0.6, capA: false, capB: false });
  k.cyl("wood", vv(0, 0.69, 0), vv(0, 0.71, 0), 0.033, 0.026, 12, { uvScale: 0.6, capA: false, capMat: "darkwood" });
}

function buildExtinguisher(k: MeshKit): void {
  // tool +Y points from the carrying handle (grip) down the cylinder to the bottom; +Z = front/label
  const R = 0.065;
  k.cyl("paintRed", vv(0, 0.07, 0), vv(0, 0.1, 0), R * 0.72, R, 14, { uvScale: 0.3, capMat: "paintRed" });
  k.cyl("paintRed", vv(0, 0.1, 0), vv(0, 0.43, 0), R, R, 14, { uvScale: 0.3, capA: false, capB: false });
  k.cyl("label", vv(0, 0.17, 0), vv(0, 0.33, 0), R + 0.0012, R + 0.0012, 14, { uvScale: 0.42, capA: false, capB: false, phase: Math.PI / 2 });
  k.cyl("rubber", vv(0, 0.43, 0), vv(0, 0.445, 0), R + 0.002, R - 0.004, 14, { uvScale: 0.1, capA: false });
  // neck + valve (chrome) + lever and carrying handle (black)
  k.cyl("chrome", vv(0, 0.035, 0), vv(0, 0.075, 0), 0.016, 0.019, 10, { uvScale: 0.05 });
  k.box("chrome", vv(0, 0.022, 0), vv(0.03, 0.034, 0.05), undefined, 0.04);
  k.box("rubber", vv(0, 0.004, 0.06), vv(0.024, 0.012, 0.11), [vv(1, 0, 0), vnorm(vv(0, 1, 0.12)), vnorm(vv(0, -0.12, 1))], 0.05);
  k.box("rubber", vv(0, -0.022, 0.05), vv(0.026, 0.012, 0.115), [vv(1, 0, 0), vnorm(vv(0, 1, -0.2)), vnorm(vv(0, 0.2, 1))], 0.05);
  // pressure gauge on the side (+X)
  k.cyl("chrome", vv(0.017, 0.03, 0.0), vv(0.03, 0.03, 0.0), 0.014, 0.014, 10, { uvScale: 0.05, capMat: "gauge" });
  // hose outlet stub
  k.cyl("rubber", vv(0, 0.03, -0.02), vv(HOSE_START.x, HOSE_START.y, HOSE_START.z), 0.008, 0.009, 8, { uvScale: 0.05 });
}

/** Nozzle (held in the left hand when spraying, clipped to the cylinder otherwise). Hand-frame local. */
function buildNozzle(k: MeshKit): void {
  k.cyl("rubber", vv(0, 0, -0.03), vv(0, 0, 0.09), 0.011, 0.01, 8, { uvScale: 0.05 });
  k.cyl("rubber", vv(0, 0, 0.09), vv(0, NOZZLE_TIP.y - 0.015, NOZZLE_TIP.z), 0.011, 0.02, 8, { uvScale: 0.05 });
}

/** Right fist around a handle through the origin along +Y; knuckles towards +Z, back of the hand +X. */
function buildFist(k: MeshKit): void {
  // chamfered fist block (octagonal profile in X/Z, extruded along Y)
  const prof: Array<[number, number]> = [
    [-0.03, -0.025],
    [-0.02, -0.04],
    [0.026, -0.04],
    [0.042, -0.022],
    [0.042, 0.024],
    [0.028, 0.04],
    [-0.018, 0.04],
    [-0.03, 0.022],
  ];
  k.slab("skin", vv(0.006, 0, 0), vv(1, 0, 0), vv(0, 0, 1), vv(0, 1, 0), prof, prof.map(() => 0.094), 0.06);
  // knuckle ridge
  k.box("skin", vv(0.03, 0.0, 0.038), vv(0.022, 0.086, 0.012), undefined, 0.05);
  // thumb wrapped over the top of the grip (index side, +Y), curling to the front
  k.box("skin", vv(-0.006, 0.052, 0.012), vv(0.026, 0.02, 0.05), [vv(1, 0, 0), vv(0, 1, 0), vv(0, 0, 1)], 0.05);
  k.box("skin", vv(-0.022, 0.044, 0.03), vv(0.022, 0.018, 0.024), undefined, 0.05);
  // wrist stub towards the forearm
  k.cyl("skin", vv(0.016, 0, -0.035), vv(0.02, 0, -0.07), 0.027, 0.025, 8, { uvScale: 0.06, capA: false });
}

/** Forearm along +Z from the wrist (origin) to the elbow (length 1 → scaled at runtime). */
function buildForearm(k: MeshKit): void {
  k.cyl("cuff", vv(0, 0, 0.0), vv(0, 0, 0.035), 0.036, 0.038, 10, { uvScale: 0.06, capMat: "cuff" });
  k.cyl("sleeve", vv(0, 0, 0.035), vv(0, 0, 0.3), 0.041, 0.052, 10, { uvScale: 0.12, capA: false });
}

/** Boot + lower leg: origin = sole centre, +Y up the leg, +Z = toes. */
function buildLeg(k: MeshKit): void {
  k.box("sole", vv(0, 0.012, 0.025), vv(0.105, 0.024, 0.285), undefined, 0.08);
  k.box("leather", vv(0, 0.06, 0.005), vv(0.098, 0.075, 0.2), undefined, 0.08);
  k.convex(
    "leather",
    [vv(-0.047, 0.024, 0.105), vv(0.047, 0.024, 0.105), vv(-0.047, 0.08, 0.105), vv(0.047, 0.08, 0.105), vv(-0.04, 0.024, 0.165), vv(0.04, 0.024, 0.165), vv(-0.035, 0.05, 0.16), vv(0.035, 0.05, 0.16)],
    [
      [0, 1, 3, 2],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 3, 7, 5],
    ],
    0.08,
  );
  k.cyl("leather", vv(0, 0.09, -0.03), vv(0, 0.16, -0.03), 0.05, 0.048, 10, { uvScale: 0.1 });
  k.cyl("denim", vv(0, 0.15, -0.03), vv(0, 0.6, -0.02), 0.058, 0.068, 10, { uvScale: 0.2 });
}

export interface ToolModelParts {
  root: TransformNode;
  meshes: Mesh[];
  /** Extinguisher: nozzle + hose pieces (repositioned every frame). */
  nozzle?: TransformNode;
  hoseA?: TransformNode;
  hoseB?: TransformNode;
}

/** Build the model of one tool under a new root node (tool frame). Fists return an empty root. */
export function buildToolModel(id: ToolId, scene: Scene, mats: Record<string, StandardMaterial>, parent: TransformNode): ToolModelParts {
  const root = new TransformNode(`vm_tool_${id}`, scene);
  root.parent = parent;
  const k = new MeshKit();
  const parts: ToolModelParts = { root, meshes: [] };
  switch (id) {
    case "hands":
      break;
    case "hammer":
      buildHammer(k);
      break;
    case "sledgehammer":
      buildSledge(k);
      break;
    case "crowbar":
      buildCrowbar(k);
      break;
    case "bat":
      buildBat(k);
      break;
    case "axe":
      buildAxe(k);
      break;
    case "extinguisher": {
      buildExtinguisher(k);
      // nozzle + 2-segment hose are separate nodes (the hose follows the left hand when spraying)
      const nozzle = new TransformNode("vm_nozzle", scene);
      nozzle.parent = parent;
      const nk = new MeshKit();
      buildNozzle(nk);
      parts.meshes.push(...nk.build(scene, "vm_nozzle", mats, nozzle));
      parts.nozzle = nozzle;
      for (const key of ["hoseA", "hoseB"] as const) {
        const seg = new TransformNode(`vm_${key}`, scene);
        seg.parent = parent;
        const hk = new MeshKit();
        hk.cyl("rubber", vv(0, 0, 0), vv(0, 0, 1), 0.0085, 0.0085, 8, { uvScale: 0.05, capA: false, capB: false });
        parts.meshes.push(...hk.build(scene, `vm_${key}`, mats, seg));
        parts[key] = seg;
      }
      break;
    }
  }
  parts.meshes.push(...k.build(scene, `vm_${id}`, mats, root));
  return parts;
}

export function buildFistModel(scene: Scene, mats: Record<string, StandardMaterial>, parent: TransformNode, left: boolean): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode(left ? "vm_fistL" : "vm_fistR", scene);
  root.parent = parent;
  const k = new MeshKit();
  k.mirrorX = left;
  buildFist(k);
  return { root, meshes: k.build(scene, root.name, mats, root) };
}

export function buildForearmModel(scene: Scene, mats: Record<string, StandardMaterial>, parent: TransformNode, left: boolean): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode(left ? "vm_armL" : "vm_armR", scene);
  root.parent = parent;
  const k = new MeshKit();
  buildForearm(k);
  return { root, meshes: k.build(scene, root.name, mats, root) };
}

export function buildLegModel(scene: Scene, mats: Record<string, StandardMaterial>, parent: TransformNode): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode("vm_leg", scene);
  root.parent = parent;
  const k = new MeshKit();
  buildLeg(k);
  return { root, meshes: k.build(scene, root.name, mats, root) };
}
