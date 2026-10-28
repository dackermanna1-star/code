// Emissive screens: TVs, monitors, laptops, phones and microwave displays. Each screen is a
// thin quad (or a caller-supplied mesh) with its own glossy PBR material whose emissive map is
// a DynamicTexture redrawn at ~15 fps with procedural content:
//   tv        "nature documentary" scenes (savanna / ocean / mountains) with captions,
//             channel changes through static and colour bars
//   monitor   desktop with wallpaper, windows (browser + editor), taskbar clock, moving cursor
//   laptop    dark code editor that types and scrolls
//   phone     lock screen with clock and notifications
//   microwave seven-segment clock with blinking colon
// States: "on" | "off" (glossy black panel, still reflects) | "cracked" (spiderweb cracks,
// glitch bands, colour bleed, dead columns, ink blot, flicker) | "dead" (black; cracks stay
// visible if it was cracked). Mains-powered screens go black while the power is out
// (setScreensPowered / Render.setPower); laptops and phones run on battery.
//
// HOW THE DESTRUCTION RUNTIME PLACES A SCREEN (for a `screen` feature):
//   const h = createScreen(scene, { parent: island.node, poly: part.poly }, feature.content,
//                          { state: feature.on === false ? "off" : "on", mains: feature.mains });
//   - `poly` is the screen part's ConvexPoly in the ISLAND frame (= node-local space); the quad
//     is built on its display face (a large face with an lcd/display surface, else the large
//     face looking +Z = builder front, else +Y for phones lying flat; or the face matching an
//     explicit `front`), inset by `inset` and lifted `offset` (0.8 mm) to avoid z-fighting.
//   - damaged → h.setState("cracked"); destroyed (part fractured / power board dead) →
//     h.setState("dead") and, once the part's geometry is gone, h.dispose();
//   - the part moved to another island after a split → h.setParent(newIsland.node)
//     (the quad keeps its island-frame placement, which is shared by all islands).
// Alternatively pass an existing Mesh (with 0..1 UVs) as `target` to just get the material.

import {
  Mesh,
  VertexData,
  DynamicTexture,
  PBRMaterial,
  Color3,
  Texture,
  type Scene,
  type TransformNode,
  type Observer,
  type AbstractMesh,
} from "@babylonjs/core";
import type { ConvexPoly } from "../geom/poly.ts";
import type { Vec3 } from "../geom/vec.ts";
import { drawSevenSeg, measureSevenSeg } from "./proctex/sevenseg.ts";
import { SURFACES } from "./surfaces.ts";

export type ScreenKind = "tv" | "monitor" | "laptop" | "phone" | "microwave";
export type ScreenState = "on" | "off" | "cracked" | "dead";

export interface ScreenPlacement {
  /** Island node the screen follows (quad is parented to it). */
  parent: TransformNode;
  /** Screen part polyhedron in the island frame. */
  poly: ConvexPoly;
  /**
   * Outward direction of the display face in the island frame. Default: the part's large face
   * carrying a display surface (lcd_off / display_*), else the large face looking +Z, else +Y.
   */
  front?: Vec3;
  /** Bezel inset from the face edges (m). */
  inset?: number;
  /** Lift along the face normal (m). */
  offset?: number;
}

export interface ScreenOptions {
  state?: ScreenState;
  /** Needs mains power (default: true except laptop/phone). */
  mains?: boolean;
  /** Content seed (varies scenes/windows between screens). */
  seed?: number;
  /** Emissive brightness multiplier (HDR; default per kind). */
  brightness?: number;
}

export interface ScreenHandle {
  readonly mesh: Mesh;
  readonly material: PBRMaterial;
  readonly kind: ScreenKind;
  readonly state: ScreenState;
  setState(s: ScreenState): void;
  setPowered(on: boolean): void;
  setParent(node: TransformNode): void;
  dispose(): void;
}

/** Hooks set by the RenderSystem so screens get the right lights. */
export const screenHooks: { registerReceiver?: (m: AbstractMesh) => void; unregisterReceiver?: (m: AbstractMesh) => void } = {};

const KIND_INFO: Record<ScreenKind, { w: number; h: number; bright: number; mains: boolean }> = {
  tv: { w: 256, h: 144, bright: 1.7, mains: true },
  monitor: { w: 256, h: 160, bright: 1.5, mains: true },
  laptop: { w: 256, h: 160, bright: 1.3, mains: false },
  phone: { w: 128, h: 256, bright: 1.3, mains: false },
  microwave: { w: 128, h: 48, bright: 2.2, mains: true },
};

const UPDATE_HZ = 15;

// ------------------------------------------------------------------ manager (per scene)

interface ScreenImpl extends ScreenHandle {
  tick(t: number, dt: number): void;
  needsAnimation(): boolean;
}

class ScreenManager {
  readonly screens = new Set<ScreenImpl>();
  readonly scene: Scene;
  private obs: Observer<Scene> | null = null;
  private acc = 0;
  private t = 0;
  powered = true;
  constructor(scene: Scene) {
    this.scene = scene;
    this.obs = scene.onBeforeRenderObservable.add(() => this.frame());
  }
  private frame(): void {
    const dt = Math.min(0.25, this.scene.getEngine().getDeltaTime() / 1000);
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / UPDATE_HZ) return;
    const step = this.acc;
    this.acc = 0;
    for (const s of this.screens) if (s.needsAnimation()) s.tick(this.t, step);
  }
  dispose(): void {
    if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs);
    this.obs = null;
  }
}

const managers = new WeakMap<Scene, ScreenManager>();

function managerOf(scene: Scene): ScreenManager {
  let m = managers.get(scene);
  if (!m) {
    m = new ScreenManager(scene);
    managers.set(scene, m);
    scene.onDisposeObservable.addOnce(() => {
      m?.dispose();
      managers.delete(scene);
    });
  }
  return m;
}

/** Mains power for every screen of the scene (mains screens go black while off). */
export function setScreensPowered(scene: Scene, on: boolean): void {
  const m = managerOf(scene);
  m.powered = on;
  for (const s of m.screens) s.setPowered(on);
}

/** Number of live screens (debug). */
export function screenCount(scene: Scene): number {
  return managers.get(scene)?.screens.size ?? 0;
}

// ------------------------------------------------------------------ geometry

/** Surfaces that mark the display side of a screen part. */
const DISPLAY_SURFACES = new Set(["lcd_off", "display_green", "display_blue", "glass_dark"]);

function faceArea(poly: ConvexPoly, f: ConvexPoly["faces"][number]): number {
  const v = poly.verts;
  const p0 = v[f.idx[0]];
  let ax = 0,
    ay = 0,
    az = 0;
  for (let i = 1; i + 1 < f.idx.length; i++) {
    const a = v[f.idx[i]],
      b = v[f.idx[i + 1]];
    const ux = a.x - p0.x,
      uy = a.y - p0.y,
      uz = a.z - p0.z;
    const wx = b.x - p0.x,
      wy = b.y - p0.y,
      wz = b.z - p0.z;
    ax += uy * wz - uz * wy;
    ay += uz * wx - ux * wz;
    az += ux * wy - uy * wx;
  }
  return 0.5 * Math.hypot(ax, ay, az);
}

/**
 * The display face of a screen part: with an explicit `front`, the face whose normal matches it
 * best; otherwise among the part's large faces (≥ 50 % of the largest — the two sides of a
 * panel) prefer display surfaces (lcd/display), then faces looking +Z (builder front), then +Y
 * (phones lying flat).
 */
function pickDisplayFace(poly: ConvexPoly, front: Vec3 | undefined): ConvexPoly["faces"][number] | undefined {
  if (front) {
    const fl = Math.hypot(front.x, front.y, front.z) || 1;
    let best = -2,
      face = poly.faces[0];
    for (const fc of poly.faces) {
      const d = (fc.n.x * front.x + fc.n.y * front.y + fc.n.z * front.z) / fl;
      if (d > best) {
        best = d;
        face = fc;
      }
    }
    return face;
  }
  const areas = poly.faces.map((f) => faceArea(poly, f));
  const maxA = Math.max(...areas, 0);
  let best = -Infinity,
    face: ConvexPoly["faces"][number] | undefined;
  poly.faces.forEach((f, i) => {
    if (areas[i] < maxA * 0.5) return;
    const surfName = SURFACES[f.attr.surf]?.name ?? "";
    const score = areas[i] / maxA + (DISPLAY_SURFACES.has(surfName) ? 1 : 0) + 0.5 * Math.max(0, f.n.z) + 0.25 * Math.max(0, f.n.y);
    if (score > best) {
      best = score;
      face = f;
    }
  });
  return face;
}

/** Build the display quad on the screen part's display face (see pickDisplayFace). */
function buildQuad(scene: Scene, p: ScreenPlacement, name: string): Mesh {
  const face = pickDisplayFace(p.poly, p.front);
  if (!face || face.idx.length < 3) throw new Error("createScreen: screen poly has no usable face");
  const n = face.n;
  // right/up axes (text upright, not mirrored, seen from outside): right = n × Y, up = right × n
  let rx: number, ry: number, rz: number;
  if (Math.abs(n.y) < 0.9) {
    rx = -n.z;
    ry = 0;
    rz = n.x;
  } else {
    rx = 1;
    ry = 0;
    rz = 0;
  }
  let rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // up = cross(right, n) for walls gives +Y; general formula keeps it orthogonal
  let ux = ry * n.z - rz * n.y,
    uy = rz * n.x - rx * n.z,
    uz = rx * n.y - ry * n.x;
  // ensure up points generally +Y (walls) or +Z (floors)
  if ((Math.abs(n.y) < 0.9 && uy < 0) || (Math.abs(n.y) >= 0.9 && uz * Math.sign(n.y) < 0)) {
    ux = -ux;
    uy = -uy;
    uz = -uz;
  }
  rl = Math.hypot(ux, uy, uz) || 1;
  ux /= rl;
  uy /= rl;
  uz /= rl;
  let u0 = Infinity,
    u1 = -Infinity,
    v0 = Infinity,
    v1 = -Infinity;
  for (const i of face.idx) {
    const v = p.poly.verts[i];
    const a = v.x * rx + v.y * ry + v.z * rz,
      b = v.x * ux + v.y * uy + v.z * uz;
    if (a < u0) u0 = a;
    if (a > u1) u1 = a;
    if (b < v0) v0 = b;
    if (b > v1) v1 = b;
  }
  const inset = Math.max(0, p.inset ?? 0);
  u0 += inset;
  u1 -= inset;
  v0 += inset;
  v1 -= inset;
  if (!(u1 > u0 && v1 > v0)) throw new Error("createScreen: screen face too small for the inset");
  const off = p.offset ?? 0.0008;
  const d = face.d + off; // plane: n·x = d
  const corner = (a: number, b: number): number[] => [rx * a + ux * b + n.x * d, ry * a + uy * b + n.y * d, rz * a + uz * b + n.z * d];
  const c0 = corner(u0, v0),
    c1 = corner(u1, v0),
    c2 = corner(u1, v1),
    c3 = corner(u0, v1);
  const vd = new VertexData();
  vd.positions = [...c0, ...c1, ...c2, ...c3];
  vd.normals = [n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z];
  vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  // counter-clockwise seen from outside = Babylon front face
  vd.indices = [0, 1, 2, 0, 2, 3];
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh, false);
  mesh.parent = p.parent;
  mesh.isPickable = false;
  return mesh;
}

// ------------------------------------------------------------------ content

type Ctx = CanvasRenderingContext2D;

interface Crack {
  pts: Array<[number, number]>;
  w: number;
}

class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/** Spiderweb crack pattern around an impact point (fractions of width/height). */
function makeCracks(seed: number, w: number, h: number): { cracks: Crack[]; cx: number; cy: number } {
  const r = new Rand(seed);
  const cx = r.range(0.3, 0.7) * w,
    cy = r.range(0.3, 0.7) * h;
  const cracks: Crack[] = [];
  const rays = 9 + Math.floor(r.next() * 6);
  const reach = Math.hypot(w, h);
  const angles: number[] = [];
  for (let k = 0; k < rays; k++) angles.push(((k + r.range(-0.3, 0.3)) / rays) * Math.PI * 2);
  for (const a0 of angles) {
    const pts: Array<[number, number]> = [[cx, cy]];
    let a = a0,
      x = cx,
      y = cy;
    const len = reach * r.range(0.35, 0.8);
    for (let s = 0; s < len; ) {
      const step = r.range(6, 16);
      a += r.range(-0.25, 0.25);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      s += step;
      pts.push([x, y]);
      if (r.next() < 0.12) {
        // side branch
        const bp: Array<[number, number]> = [[x, y]];
        let ba = a + (r.next() < 0.5 ? 1 : -1) * r.range(0.5, 1.1),
          bx = x,
          by = y;
        for (let k = 0; k < 4; k++) {
          bx += Math.cos(ba) * r.range(5, 12);
          by += Math.sin(ba) * r.range(5, 12);
          ba += r.range(-0.3, 0.3);
          bp.push([bx, by]);
        }
        cracks.push({ pts: bp, w: 0.8 });
      }
    }
    cracks.push({ pts, w: 1.3 });
  }
  // concentric rings
  for (const rr of [0.06, 0.13, 0.22]) {
    const R = reach * rr;
    for (let k = 0; k < angles.length; k++) {
      if (r.next() < 0.35) continue;
      const a1 = angles[k],
        a2 = angles[(k + 1) % angles.length] + (k + 1 === angles.length ? Math.PI * 2 : 0);
      const R1 = R * r.range(0.85, 1.15),
        R2 = R * r.range(0.85, 1.15);
      const mid = (a1 + a2) / 2;
      cracks.push({
        pts: [
          [cx + Math.cos(a1) * R1, cy + Math.sin(a1) * R1],
          [cx + Math.cos(mid) * (R1 + R2) * 0.47, cy + Math.sin(mid) * (R1 + R2) * 0.47],
          [cx + Math.cos(a2) * R2, cy + Math.sin(a2) * R2],
        ],
        w: 0.9,
      });
    }
  }
  return { cracks, cx, cy };
}

function drawCracks(g: Ctx, cracks: Crack[], cx: number, cy: number, alpha: number): void {
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const c of cracks) {
    // dark core + bright edge (light catching the broken glass)
    g.strokeStyle = `rgba(0,0,0,${0.85 * alpha})`;
    g.lineWidth = c.w + 1.2;
    g.beginPath();
    g.moveTo(c.pts[0][0], c.pts[0][1]);
    for (let i = 1; i < c.pts.length; i++) g.lineTo(c.pts[i][0], c.pts[i][1]);
    g.stroke();
    g.strokeStyle = `rgba(230,235,240,${0.55 * alpha})`;
    g.lineWidth = c.w * 0.6;
    g.stroke();
  }
  // crushed impact point
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 9);
  grd.addColorStop(0, `rgba(240,240,240,${0.8 * alpha})`);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, 9, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

const FONT = 'Inter, "Liberation Sans", Arial, sans-serif';
const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';

const staticCache = new Map<string, ImageData>();
/** Reused ImageData for TV static (no per-frame allocation). */
function staticImage(g: Ctx, w: number, h: number): ImageData {
  const k = `${w}x${h}`;
  let img = staticCache.get(k);
  if (!img) {
    img = g.createImageData(w, h);
    staticCache.set(k, img);
  }
  return img;
}

function tvContent(g: Ctx, w: number, h: number, t: number, seed: number): void {
  const period = 14;
  const cycle = t + seed * 7.3;
  const sceneIdx = Math.floor(cycle / period) % 3;
  const local = cycle % period;
  // channel change: static then colour bars at scene boundaries
  if (local < 0.35) {
    const img = staticImage(g, w, h);
    let s = (Math.floor(t * 60) * 2654435761) >>> 0;
    for (let i = 0; i < img.data.length; i += 4) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const v = s & 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return;
  }
  if (local < 0.9 && sceneIdx === 0) {
    const bars = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
    bars.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect((i * w) / 7, 0, w / 7 + 1, h * 0.72);
    });
    g.fillStyle = "#101010";
    g.fillRect(0, h * 0.72, w, h);
    g.fillStyle = "#ffffff";
    g.fillRect(w * 0.15, h * 0.78, w * 0.12, h * 0.16);
    return;
  }
  const pan = local * 6;
  if (sceneIdx === 0) {
    // savanna at sunset: elephants walking, acacias, birds
    const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, "#3d2c5a");
    sky.addColorStop(0.55, "#d9653a");
    sky.addColorStop(1, "#f7b65a");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffe0a0";
    g.beginPath();
    g.arc(w * 0.66, h * 0.62, h * 0.16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2a1a16";
    g.fillRect(0, h * 0.7, w, h * 0.3);
    for (let k = 0; k < 3; k++) {
      const x = ((k * 110 - pan * 0.6) % (w + 80)) + w + 40 - (w + 80);
      g.fillRect(x, h * 0.48, 3, h * 0.24);
      g.beginPath();
      g.ellipse(x + 1, h * 0.47, 26, 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // elephant family
    const ex = w * 0.95 - ((local * 9) % (w * 1.3));
    for (const [dx, s] of [
      [0, 1],
      [30, 0.75],
      [52, 0.55],
    ] as const) {
      const x = ex + dx,
        y = h * 0.7,
        sc = s * 0.9;
      g.beginPath();
      g.ellipse(x, y - 14 * sc, 16 * sc, 10 * sc, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x - 15 * sc, y - 18 * sc, 6 * sc, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - 21 * sc, y - 18 * sc, 3 * sc, 14 * sc);
      for (const lx of [-10, -4, 6, 11]) g.fillRect(x + lx * sc, y - 6 * sc, 3.5 * sc, 7 * sc);
    }
    g.strokeStyle = "#2a1a16";
    g.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      const bx = (k * 37 + local * 14) % w,
        by = h * 0.25 + Math.sin(local * 2 + k) * 6;
      g.beginPath();
      g.moveTo(bx - 4, by - 2);
      g.lineTo(bx, by);
      g.lineTo(bx + 4, by - 2);
      g.stroke();
    }
  } else if (sceneIdx === 1) {
    // open ocean: swell, a whale fluke, distant boat
    const sky = g.createLinearGradient(0, 0, 0, h * 0.45);
    sky.addColorStop(0, "#5a8fc8");
    sky.addColorStop(1, "#cfe4f2");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) {
      const y = h * 0.45 + row * row * 1.6 + row * 2;
      g.fillStyle = row % 2 ? "#1e5a8a" : "#2a6c9c";
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, y + Math.sin(x * 0.06 + local * 1.5 + row) * (1 + row * 0.5));
      g.lineTo(w, h);
      g.fill();
    }
    const ph = (local % 7) / 7;
    if (ph > 0.2 && ph < 0.75) {
      const rise = Math.sin(((ph - 0.2) / 0.55) * Math.PI);
      const x = w * 0.45,
        y = h * 0.66 - rise * 22;
      g.fillStyle = "#1a2a36";
      g.beginPath();
      g.moveTo(x, y + 26);
      g.lineTo(x - 3, y + 6);
      g.quadraticCurveTo(x - 22, y - 4, x - 30, y + 2);
      g.quadraticCurveTo(x - 16, y + 8, x, y + 4);
      g.quadraticCurveTo(x + 16, y + 8, x + 30, y + 2);
      g.quadraticCurveTo(x + 22, y - 4, x + 3, y + 6);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#f4f4f4";
    g.fillRect(w * 0.8 - pan * 0.2, h * 0.43, 10, 3);
  } else {
    // mountains with drifting fog and a gliding eagle
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#8fb4d8");
    sky.addColorStop(1, "#e8eef2");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const layers: Array<[string, number, number, number]> = [
      ["#9aa8bc", 0.55, 0.012, 0.15],
      ["#6f7f94", 0.68, 0.02, 0.35],
      ["#3f4a3a", 0.82, 0.03, 0.7],
    ];
    for (const [c, base, f, sp] of layers) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) {
        const X = x + pan * sp * 4;
        g.lineTo(x, h * base - Math.abs(Math.sin(X * f) * 22 + Math.sin(X * f * 2.7) * 9));
      }
      g.lineTo(w, h);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fillRect(0, h * base - 6, w, 8);
    }
    const ex = (local * 22) % (w + 40) - 20,
      ey = h * 0.3 + Math.sin(local) * 8;
    g.strokeStyle = "#1a1a1a";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ex - 12, ey - 3 + Math.sin(local * 3) * 2);
    g.quadraticCurveTo(ex - 5, ey - 6, ex, ey);
    g.quadraticCurveTo(ex + 5, ey - 6, ex + 12, ey - 3 + Math.sin(local * 3) * 2);
    g.stroke();
  }
  // broadcast overlays
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = `bold 10px ${FONT}`;
  g.textAlign = "right";
  g.textBaseline = "top";
  g.fillText("WILD 4", w - 6, 5);
  if (local > 2 && local < 8) {
    const caption = ["The Great Migration", "Giants of the Deep", "Kingdom of the Peaks"][sceneIdx];
    const a = Math.min(1, (local - 2) * 2, (8 - local) * 2);
    g.fillStyle = `rgba(10,10,10,${0.55 * a})`;
    g.fillRect(8, h - 26, 150, 17);
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.textAlign = "left";
    g.font = `bold 10px ${FONT}`;
    g.fillText(caption, 13, h - 23);
  }
}

function monitorContent(g: Ctx, w: number, h: number, t: number, seed: number): void {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#1f4f7a");
  bg.addColorStop(1, "#3a8a9a");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // desktop icons
  for (let k = 0; k < 4; k++) {
    g.fillStyle = ["#f2c94c", "#56ccf2", "#eb5757", "#6fcf97"][k];
    g.fillRect(8, 8 + k * 22, 12, 12);
  }
  // browser window
  const bx = 34,
    by = 10,
    bw = 150,
    bh = 104;
  g.fillStyle = "#f4f4f4";
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = "#d9d9de";
  g.fillRect(bx, by, bw, 12);
  g.fillStyle = "#eb5757";
  g.fillRect(bx + 4, by + 4, 4, 4);
  g.fillStyle = "#ffffff";
  g.fillRect(bx + 20, by + 2, 90, 8);
  const scroll = (t * 6 + seed * 13) % 60;
  g.save();
  g.beginPath();
  g.rect(bx, by + 12, bw, bh - 12);
  g.clip();
  for (let k = 0; k < 6; k++) {
    const y = by + 16 + k * 26 - scroll;
    g.fillStyle = k % 3 === 0 ? "#7aa5d8" : "#c8c8cc";
    g.fillRect(bx + 6, y, 40, 20);
    g.fillStyle = "#8a8a90";
    for (let l = 0; l < 3; l++) g.fillRect(bx + 52, y + 2 + l * 6, 80 - l * 14, 2);
  }
  g.restore();
  // editor window
  const ex = 120,
    ey = 52,
    ew = 128,
    eh = 86;
  g.fillStyle = "#26282e";
  g.fillRect(ex, ey, ew, eh);
  g.fillStyle = "#3a3d45";
  g.fillRect(ex, ey, ew, 10);
  const lines = Math.floor(t * 2) % 12;
  for (let l = 0; l <= lines; l++) {
    g.fillStyle = ["#c678dd", "#61afef", "#98c379", "#e5c07b"][l % 4];
    g.fillRect(ex + 6 + (l % 3) * 6, ey + 14 + l * 6, 20 + ((l * 37 + seed * 11) % 60), 2);
  }
  if (Math.floor(t * 2) % 2) {
    g.fillStyle = "#ffffff";
    g.fillRect(ex + 30 + ((lines * 37 + seed * 11) % 60), ey + 13 + lines * 6, 2, 5);
  }
  // taskbar + clock
  g.fillStyle = "rgba(20,22,28,0.92)";
  g.fillRect(0, h - 14, w, 14);
  g.fillStyle = "#56ccf2";
  g.fillRect(4, h - 11, 8, 8);
  const mins = 42 + Math.floor(t / 60);
  g.fillStyle = "#e8e8e8";
  g.font = `9px ${FONT}`;
  g.textAlign = "right";
  g.textBaseline = "middle";
  g.fillText(`18:${String(mins % 60).padStart(2, "0")}`, w - 5, h - 7);
  // cursor
  const cx = w * 0.5 + Math.sin(t * 0.7 + seed) * w * 0.35,
    cy = h * 0.5 + Math.sin(t * 1.1) * h * 0.3;
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#000000";
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx, cy + 10);
  g.lineTo(cx + 3, cy + 7);
  g.lineTo(cx + 7, cy + 7);
  g.closePath();
  g.fill();
  g.stroke();
}

function laptopContent(g: Ctx, w: number, h: number, t: number, seed: number): void {
  g.fillStyle = "#1e1f24";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#2a2c33";
  g.fillRect(0, 0, 26, h);
  g.fillStyle = "#33363e";
  g.fillRect(0, 0, w, 11);
  g.fillStyle = "#9da5b4";
  g.font = `8px ${MONO}`;
  g.textBaseline = "top";
  g.textAlign = "left";
  g.fillText("destruction.ts", 30, 1);
  const total = 40;
  const typed = (t * 1.6 + seed * 5) % total;
  const first = Math.max(0, Math.floor(typed) - 17);
  const colors = ["#c678dd", "#61afef", "#98c379", "#e5c07b", "#56b6c2", "#abb2bf", "#d19a66"];
  for (let l = first; l <= Math.floor(typed); l++) {
    const y = 14 + (l - first) * 8;
    g.fillStyle = "#5c6370";
    g.fillText(String(l + 1).padStart(3, " "), 2, y);
    const r = new Rand(l * 977 + seed);
    let x = 30 + Math.floor(r.next() * 3) * 8;
    const toks = 2 + Math.floor(r.next() * 4);
    const frac = l === Math.floor(typed) ? typed - l : 1;
    for (let k = 0; k < toks * frac; k++) {
      const tw = 10 + Math.floor(r.next() * 30);
      g.fillStyle = colors[Math.floor(r.next() * colors.length)];
      g.fillRect(x, y + 2, tw, 3);
      x += tw + 4;
    }
    if (l === Math.floor(typed) && Math.floor(t * 3) % 2) {
      g.fillStyle = "#e6e6e6";
      g.fillRect(x, y, 2, 7);
    }
  }
  g.fillStyle = "#3f72af";
  g.fillRect(0, h - 9, w, 9);
  g.fillStyle = "#ffffff";
  g.fillText("main  ✓ 0 errors   Ln " + (Math.floor(typed) + 1), 4, h - 9);
}

function phoneContent(g: Ctx, w: number, h: number, t: number, seed: number): void {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#3a2a6a");
  bg.addColorStop(0.6, "#c0567a");
  bg.addColorStop(1, "#f2a65a");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const mins = 42 + Math.floor(t / 60);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `200 46px ${FONT}`;
  g.fillText(`18:${String(mins % 60).padStart(2, "0")}`, w / 2, h * 0.24);
  g.font = `11px ${FONT}`;
  g.fillText("Saturday, 14 October", w / 2, h * 0.36);
  const n = Math.min(3, Math.floor((t + seed * 3) / 5) % 5);
  for (let k = 0; k < n; k++) {
    const y = h * 0.48 + k * 38;
    g.fillStyle = "rgba(255,255,255,0.78)";
    g.fillRect(8, y, w - 16, 32);
    g.fillStyle = ["#4caf50", "#2196f3", "#ff9800"][k];
    g.fillRect(14, y + 8, 14, 14);
    g.fillStyle = "#222222";
    g.textAlign = "left";
    g.font = `bold 9px ${FONT}`;
    g.fillText(["Messages", "Mail", "Weather"][k], 34, y + 11);
    g.font = `8px ${FONT}`;
    g.fillStyle = "#555555";
    g.fillText(["see you at 8?", "Your order has shipped", "Clear, 21°"][k], 34, y + 22);
  }
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(w / 2 - 20, h - 10, 40, 3);
}

function microwaveContent(g: Ctx, w: number, h: number, t: number): void {
  g.fillStyle = "#020402";
  g.fillRect(0, 0, w, h);
  const colon = Math.floor(t * 2) % 2 === 0;
  const text = colon ? "12:00" : "12 00";
  const dw = 18,
    dh = 32,
    gap = 6;
  const tw = measureSevenSeg("12:00", dw, dh, gap);
  const x = (w - tw) / 2,
    y = (h - dh) / 2;
  drawSevenSeg(g, "88:88", x, y, dw, dh, gap, { on: "#0c1a0e", off: null });
  drawSevenSeg(g, text, x, y, dw, dh, gap, { on: "#5dff8a", off: null });
}

// ------------------------------------------------------------------ screen implementation

let screenId = 0;

/**
 * Create a screen on a part face (ScreenPlacement) or on an existing mesh (its UVs must map
 * the display 0..1, image upright with v up).
 */
export function createScreen(scene: Scene, target: Mesh | ScreenPlacement, kind: ScreenKind, opts: ScreenOptions = {}): ScreenHandle {
  const info = KIND_INFO[kind] ?? KIND_INFO.tv;
  const id = ++screenId;
  const name = `screen_${kind}_${id}`;
  const ownsMesh = !(target instanceof Mesh);
  const mesh = target instanceof Mesh ? target : buildQuad(scene, target, name);
  const dt = new DynamicTexture(name + "_tex", { width: info.w, height: info.h }, scene, false, Texture.BILINEAR_SAMPLINGMODE);
  dt.wrapU = Texture.CLAMP_ADDRESSMODE;
  dt.wrapV = Texture.CLAMP_ADDRESSMODE;
  const g = dt.getContext() as unknown as Ctx;
  const mat = new PBRMaterial(name + "_mat", scene);
  mat.albedoColor = new Color3(0.012, 0.013, 0.015);
  mat.metallic = 0;
  mat.roughness = 0.14;
  mat.emissiveTexture = dt;
  mat.emissiveColor = Color3.White();
  mat.maxSimultaneousLights = 8;
  mesh.material = mat;
  mesh.receiveShadows = false;
  if (ownsMesh) screenHooks.registerReceiver?.(mesh);
  const seed = opts.seed ?? id * 7919;
  const mains = opts.mains ?? info.mains;
  const brightness = opts.brightness ?? info.bright;
  const crack = makeCracks(seed, info.w, info.h);
  const mgr = managerOf(scene);
  let state: ScreenState = opts.state ?? "on";
  let powered = mgr.powered;
  let wasCracked = state === "cracked";
  let flicker = 1;
  let disposed = false;

  const lit = (): boolean => (state === "on" || state === "cracked") && (powered || !mains);

  const draw = (t: number): void => {
    const W = info.w,
      H = info.h;
    if (!lit()) {
      g.fillStyle = "#000000";
      g.fillRect(0, 0, W, H);
      if (wasCracked) drawCracks(g, crack.cracks, crack.cx, crack.cy, 0.35);
      dt.update(true);
      return;
    }
    switch (kind) {
      case "tv":
        tvContent(g, W, H, t, seed);
        break;
      case "monitor":
        monitorContent(g, W, H, t, seed);
        break;
      case "laptop":
        laptopContent(g, W, H, t, seed);
        break;
      case "phone":
        phoneContent(g, W, H, t, seed);
        break;
      case "microwave":
        microwaveContent(g, W, H, t);
        break;
    }
    if (state === "cracked") {
      const r = new Rand(Math.floor(t * 15) + seed);
      // glitch bands: shift horizontal slices, tint some
      for (let k = 0; k < 3; k++) {
        if (r.next() < 0.45) continue;
        const y = Math.floor(r.next() * H),
          bh = 2 + Math.floor(r.next() * 10);
        const dx = Math.floor(r.range(-18, 18));
        g.drawImage(g.canvas, 0, y, W, bh, dx, y, W, bh);
        g.fillStyle = r.next() < 0.5 ? "rgba(255,0,180,0.25)" : "rgba(0,255,200,0.2)";
        g.fillRect(0, y, W, bh);
      }
      // colour bleed / dead columns
      const col = (seed % 5) / 5;
      g.fillStyle = "rgba(255,40,200,0.85)";
      g.fillRect(Math.floor(col * W), 0, 2, H);
      g.fillStyle = "rgba(40,255,120,0.7)";
      g.fillRect(Math.floor(((col + 0.37) % 1) * W), 0, 1, H);
      // ink blot of leaking liquid crystal around the impact
      const ink = g.createRadialGradient(crack.cx, crack.cy, 2, crack.cx, crack.cy, Math.min(W, H) * 0.32);
      ink.addColorStop(0, "rgba(0,0,0,0.95)");
      ink.addColorStop(0.6, "rgba(10,0,20,0.75)");
      ink.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = ink;
      g.fillRect(0, 0, W, H);
      drawCracks(g, crack.cracks, crack.cx, crack.cy, 1);
      flicker = r.next() < 0.08 ? r.range(0.3, 0.7) : 1;
    } else flicker = 1;
    dt.update(true);
    mat.emissiveIntensity = brightness * flicker;
  };

  const applyLook = (): void => {
    // unlit but cracked: a faint glow keeps the crack edges visible (room light catching the
    // broken glass); otherwise a switched-off panel is pure glossy black
    mat.emissiveIntensity = lit() ? brightness * flicker : wasCracked ? 0.08 : 0;
    // a cracked panel scatters light: rougher reflections
    mat.roughness = wasCracked ? 0.3 : 0.14;
  };

  const handle: ScreenImpl = {
    get mesh() {
      return mesh;
    },
    get material() {
      return mat;
    },
    get kind() {
      return kind;
    },
    get state() {
      return state;
    },
    setState(s: ScreenState): void {
      if (disposed) return;
      state = s;
      if (s === "cracked") wasCracked = true;
      applyLook();
      draw(performance.now() / 1000);
    },
    setPowered(on: boolean): void {
      if (disposed) return;
      powered = on;
      applyLook();
      draw(performance.now() / 1000);
    },
    setParent(node: TransformNode): void {
      if (!disposed && ownsMesh) mesh.parent = node;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mgr.screens.delete(handle);
      if (ownsMesh) {
        screenHooks.unregisterReceiver?.(mesh);
        mesh.dispose(false, false);
      } else if (mesh.material === mat) mesh.material = null;
      mat.dispose(false, false);
      dt.dispose();
    },
    tick(t: number): void {
      draw(t);
    },
    needsAnimation(): boolean {
      return !disposed && lit();
    },
  };
  mgr.screens.add(handle);
  applyLook();
  draw(0);
  return handle;
}
