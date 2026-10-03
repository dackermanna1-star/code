/**
 * Thick 3D sprites: the icon's alpha mask is traced with marching squares into smooth
 * contours (with holes), simplified, and extruded with a rounded bevel. Cap faces map
 * straight onto the painted icon; side walls sample the (dilated) colour at the contour.
 * Item space: the sprite spans x,y ∈ [-0.5, 0.5] (y up), thickness along z, centred.
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ctx2d, makeCanvas, type AnyCanvas } from './paint/kit';

type Loop = number[]; // flat x,y in grid units

/** Sample the alpha channel of a canvas into an N×N grid (0..1), padded with a zero border. */
function alphaGrid(c: AnyCanvas, n: number): { g: Float32Array; w: number } {
  const tmp = makeCanvas(n);
  const t = ctx2d(tmp);
  t.imageSmoothingEnabled = true;
  (t as any).imageSmoothingQuality = 'high';
  t.drawImage(c as any, 0, 0, n, n);
  const d = t.getImageData(0, 0, n, n).data;
  const w = n + 2;
  const g = new Float32Array(w * w);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g[(y + 1) * w + x + 1] = d[(y * n + x) * 4 + 3] / 255;
  return { g, w };
}

/** Marching squares at iso 0.5 → closed loops (grid units, sample centres at integer coords). */
function contours(g: Float32Array, w: number, iso = 0.5): Loop[] {
  const segs: [string, number, number, string, number, number][] = [];
  const v = (x: number, y: number) => g[y * w + x];
  const lerp = (a: number, b: number) => (iso - a) / (b - a);
  for (let y = 0; y < w - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
      const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      // edge points: T(top a-b), R(b-c), B(d-c), L(a-d)
      const T = (): [string, number, number] => [`h${x},${y}`, x + lerp(a, b), y];
      const R = (): [string, number, number] => [`v${x + 1},${y}`, x + 1, y + lerp(b, c)];
      const B = (): [string, number, number] => [`h${x},${y + 1}`, x + lerp(d, c), y + 1];
      const L = (): [string, number, number] => [`v${x},${y}`, x, y + lerp(a, d)];
      const add = (p: [string, number, number], q: [string, number, number]) => segs.push([p[0], p[1], p[2], q[0], q[1], q[2]]);
      const centre = (a + b + c + d) / 4 > iso;
      switch (idx) {
        case 1: add(L(), B()); break;
        case 2: add(B(), R()); break;
        case 3: add(L(), R()); break;
        case 4: add(T(), R()); break;
        case 5: if (centre) { add(L(), T()); add(B(), R()); } else { add(L(), B()); add(T(), R()); } break;
        case 6: add(T(), B()); break;
        case 7: add(L(), T()); break;
        case 8: add(L(), T()); break;
        case 9: add(T(), B()); break;
        case 10: if (centre) { add(T(), R()); add(L(), B()); } else { add(L(), T()); add(B(), R()); } break;
        case 11: add(T(), R()); break;
        case 12: add(L(), R()); break;
        case 13: add(B(), R()); break;
        case 14: add(L(), B()); break;
      }
    }
  }
  // chain segments by shared edge keys
  const adj = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [s[0], s[3]]) {
      let l = adj.get(k);
      if (!l) adj.set(k, (l = []));
      l.push(i);
    }
  });
  const used = new Uint8Array(segs.length);
  const loops: Loop[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const s = segs[i];
    const loop: number[] = [s[1], s[2]];
    const startKey = s[0];
    let key = s[3];
    loop.push(s[4], s[5]);
    for (let guard = 0; guard < 100000 && key !== startKey; guard++) {
      const cand = adj.get(key);
      let next = -1;
      if (cand) for (const j of cand) if (!used[j]) { next = j; break; }
      if (next < 0) break;
      used[next] = 1;
      const t = segs[next];
      if (t[0] === key) { key = t[3]; loop.push(t[4], t[5]); }
      else { key = t[0]; loop.push(t[1], t[2]); }
    }
    loop.length -= 2; // last point duplicates the first
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

function simplify(pts: Loop, eps: number): Loop {
  const n = pts.length / 2;
  if (n < 8) return pts;
  const keep = new Uint8Array(n);
  const dp = (i0: number, i1: number) => {
    const x0 = pts[i0 * 2], y0 = pts[i0 * 2 + 1], x1 = pts[(i1 % n) * 2], y1 = pts[(i1 % n) * 2 + 1];
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bd = 0;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((pts[i * 2] - x0) * dy - (pts[i * 2 + 1] - y0) * dx) / l;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd > eps) { keep[best] = 1; dp(i0, best); dp(best, i1); }
  };
  // split a closed loop at the point farthest from the first one
  let far = 0, fd = 0;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i * 2] - pts[0], pts[i * 2 + 1] - pts[1]); if (d > fd) { fd = d; far = i; } }
  keep[0] = 1; keep[far] = 1;
  dp(0, far);
  dp(far, n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out.length >= 6 ? out : pts;
}

function area(l: Loop) {
  let a = 0;
  for (let i = 0, n = l.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += l[i * 2] * l[j * 2 + 1] - l[j * 2] * l[i * 2 + 1];
  }
  return a / 2;
}
function inside(px: number, py: number, l: Loop) {
  let c = false;
  for (let i = 0, n = l.length / 2, j = n - 1; i < n; j = i++) {
    const xi = l[i * 2], yi = l[i * 2 + 1], xj = l[j * 2], yj = l[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export interface ExtrudeOptions {
  /** Grid resolution of the traced mask. */
  grid?: number;
  /** Total thickness (item units; Minecraft = 1/16). */
  depth?: number;
  bevel?: number;
}

/** Build the extruded geometry for a sprite canvas. */
export function extrudeSprite(c: AnyCanvas, o: ExtrudeOptions = {}): THREE.BufferGeometry {
  const n = o.grid ?? 64;
  const depth = o.depth ?? 0.07;
  const bevel = o.bevel ?? 0.009;
  const { g, w } = alphaGrid(c, n);
  const raw = contours(g, w).map((l) => simplify(l, 0.35)).filter((l) => Math.abs(area(l)) > 1.2);
  // grid coords -> item coords (sample i at pixel centre i - 1 + 0.5)
  const toItem = (l: Loop) => {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < l.length; i += 2) out.push(new THREE.Vector2((l[i] - 0.5) / n - 0.5, 0.5 - (l[i + 1] - 0.5) / n));
    return out;
  };
  // nesting depth decides outer vs hole
  const depthOf = raw.map((l, i) => raw.reduce((k, m, j) => (j !== i && inside(l[0], l[1], m) ? k + 1 : k), 0));
  const shapes: THREE.Shape[] = [];
  const outers: { loop: Loop; shape: THREE.Shape }[] = [];
  raw.forEach((l, i) => {
    if (depthOf[i] % 2 === 0) {
      const s = new THREE.Shape(toItem(l));
      shapes.push(s);
      outers.push({ loop: l, shape: s });
    }
  });
  raw.forEach((l, i) => {
    if (depthOf[i] % 2 === 0) return;
    // attach to the innermost containing outer
    let best: { loop: Loop; shape: THREE.Shape } | null = null, bestA = Infinity;
    for (const o2 of outers) if (inside(l[0], l[1], o2.loop) && Math.abs(area(o2.loop)) < bestA) { best = o2; bestA = Math.abs(area(o2.loop)); }
    best?.shape.holes.push(new THREE.Path(toItem(l)));
  });
  if (!shapes.length) return new THREE.PlaneGeometry(1, 1);
  const uvGen = {
    generateTopUV(_g: any, v: number[], a: number, b: number, cc: number) {
      return [a, b, cc].map((i) => new THREE.Vector2(v[i * 3] + 0.5, v[i * 3 + 1] + 0.5));
    },
    generateSideWallUV(_g: any, v: number[], a: number, b: number, cc: number, d: number) {
      return [a, b, cc, d].map((i) => new THREE.Vector2(v[i * 3] + 0.5, v[i * 3 + 1] + 0.5));
    },
  };
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 1, steps: 1, UVGenerator: uvGen as any,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  // normals: flat caps, creased smooth side walls
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const groups = geo.groups;
  const cap = groups.find((gr) => gr.materialIndex === 0);
  const side = groups.find((gr) => gr.materialIndex === 1);
  if (cap) for (let i = cap.start; i < cap.start + cap.count; i++) nrm.setXYZ(i, 0, 0, pos.getZ(i) > 0 ? 1 : -1);
  if (side && side.count > 0) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute((pos.array as Float32Array).slice(side.start * 3, (side.start + side.count) * 3), 3));
    const cg = toCreasedNormals(sg, Math.PI / 3);
    const cn = cg.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < side.count; i++) nrm.setXYZ(side.start + i, cn.getX(i), cn.getY(i), cn.getZ(i));
  }
  geo.clearGroups();
  geo.computeBoundingSphere();
  return geo;
}

/** Opaque colour texture with RGB bled outward from the painted silhouette (no dark halos). */
export function dilatedTexture(c: AnyCanvas, passes = 6): THREE.Texture {
  const W = c.width, H = c.height;
  const tmp = makeCanvas(W, H);
  const t = ctx2d(tmp);
  t.drawImage(c as any, 0, 0);
  const img = t.getImageData(0, 0, W, H);
  const d = img.data;
  let known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 8) {
    known[i] = 1;
    const a = d[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.min(255, d[i * 4 + k]); // canvas data is straight alpha
    void a;
  }
  for (let p = 0; p < passes; p++) {
    const next = known.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (known[i]) continue;
      let r = 0, gg = 0, b = 0, k = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!known[j]) continue;
        r += d[j * 4]; gg += d[j * 4 + 1]; b += d[j * 4 + 2]; k++;
      }
      if (k) { d[i * 4] = r / k; d[i * 4 + 1] = gg / k; d[i * 4 + 2] = b / k; next[i] = 1; }
    }
    known = next;
  }
  for (let i = 0; i < W * H; i++) d[i * 4 + 3] = 255;
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), W, H, THREE.RGBAFormat);
  tex.flipY = false;
  // ImageData rows are top-down: flip V by mirroring the data rows
  const rows = tex.image.data as Uint8Array;
  const row = W * 4;
  const swap = new Uint8Array(row);
  for (let y = 0; y < H / 2; y++) {
    const a = y * row, b = (H - 1 - y) * row;
    swap.set(rows.subarray(a, a + row));
    rows.copyWithin(a, b, b + row);
    rows.set(swap, b);
  }
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Linear data texture from a canvas (material map). */
export function dataTexture(c: AnyCanvas): THREE.Texture {
  const W = c.width, H = c.height;
  const d = ctx2d(c).getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) out.set(d.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
