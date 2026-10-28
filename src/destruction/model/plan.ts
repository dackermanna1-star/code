// Fracture planning: turns a failure decision (global / local breakout) into a FracturePlan
// with Voronoi cells (src/geom/fracture.ts), cell roles, kicks, internal bonds and bond
// transfers. PURE MODULE (no Babylon). See docs/ARCHITECTURE.md §4.3, §4.6.

import type { Vec3 } from "../../geom/vec.ts";
import {
  polyChord,
  polyClip,
  polyClosestPoint,
  polyFaceAreaOnPlane,
  polySignedDist,
  polyVolume,
  polyCentroid,
  polyExtents,
  zeroUV,
  type ConvexPoly,
  type FaceAttr,
} from "../../geom/poly.ts";
import { generateSeeds, voronoiFracture, type SeedPattern } from "../../geom/fracture.ts";
import type { Rng } from "../../core/rng.ts";
import { S } from "../../render/surfaces.ts";
import type { FailureMode } from "./materials.ts";
import type { CellRole, FracturePlan, PartState, PlannedCell } from "./damage.ts";
import { fusedStrength } from "./damage.ts";
import { K, KICK } from "./tuning.ts";
import { clamp01, effVolume, smooth } from "./util.ts";

export interface PlanRequest {
  part: PartState;
  global: boolean;
  /** Mode recorded in the plan (material mode, or "bend"/"soft" for tears). */
  mode: FailureMode;
  /** Seed pattern to use. */
  pattern: SeedPattern;
  center: Vec3;
  dir: Vec3;
  /** Outward normal and plane offset of the hit face (dot(faceN, p) = faceD on the face). */
  faceN: Vec3;
  faceD: number;
  /** Breakout radius (local) — for global plans a pattern radius. */
  radius: number;
  /** Local breakout depth (m) and whether it goes through the part. */
  depth: number;
  through: boolean;
  /** Local thickness at the impact (m). */
  t: number;
  /** Energy delivered (J) — kicks are a fraction of it. */
  energy: number;
  /** Severity of a global failure (effective energy / threshold, ≥ 1). */
  overload: number;
  /** Seed count override (tears). */
  count?: number;
  rng: Rng;
}

interface WorkCell {
  poly: ConvexPoly;
  volume: number;
  centroid: Vec3;
  maxExtent: number;
  role: CellRole;
  neighbors: Array<{ cell: number; area: number }>;
  /** Part of the fractured region (false for the untouched back of a crater). */
  frac: boolean;
}

const V = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => V(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z);
  return l > 1e-12 ? V(a.x / l, a.y / l, a.z / l) : V(0, 0, 0);
};

/** Interior (cut-face) attribute of a material. */
export function interiorAttr(part: PartState): FaceAttr {
  const surf = (S as Record<string, number>)[part.mat.interiorSurf] ?? 0;
  return { surf, tint: 0xffffff, uv: zeroUV(), interior: true, smooth: 0 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Build the fracture plan. Returns null if the geometry could not be split. */
export function planFracture(req: PlanRequest): FracturePlan | null {
  const { part, rng } = req;
  const mat = part.mat;
  const ext = part.ext;
  const iattr = interiorAttr(part);
  const cells: WorkCell[] = [];

  // ---------------------------------------------------------------- region (crater slab)
  let region = part.poly;
  let back: ConvexPoly | null = null;
  let cut: { n: Vec3; d: number } | null = null;
  if (!req.global && !req.through && req.depth > 0 && req.depth * 1.3 < 0.6 * req.t) {
    const n = req.faceN;
    const cutD = req.faceD - req.depth * 1.3;
    const b = polyClip(part.poly, n, cutD, iattr);
    const f = polyClip(part.poly, V(-n.x, -n.y, -n.z), -cutD, iattr);
    if (b && f && b !== part.poly && f !== part.poly && polyVolume(f) > 0 && polyVolume(b) > 0) {
      region = f;
      back = b;
      cut = { n: V(-n.x, -n.y, -n.z), d: -cutD };
    }
  }

  // ---------------------------------------------------------------- seeds
  const planeN = ext[2] < 0.3 * ext[1] ? req.faceN : undefined;
  let count: number;
  let far: number | undefined;
  let radius = req.radius;
  let cell: number | undefined;
  const minF = mat.minFragment;
  const diceCell = rng.range(0.02, 0.03);
  if (req.pattern === "dice") {
    const area = Math.max(1e-6, ext[0] * ext[1]);
    count = Math.max(2, Math.min(K.maxDiceCoarse, Math.round(area / (diceCell * diceCell))));
    cell = Math.sqrt(area / count);
  } else if (req.count) {
    count = req.count;
  } else if (req.global) {
    const ef = clamp01(Math.log2(Math.max(1, req.overload)) / 3);
    const nCap = Math.max(2, Math.round((ext[0] * ext[1]) / (2.5 * minF) ** 2));
    count = Math.round(lerp(mat.fragments[0], mat.fragments[1], ef) * rng.range(0.85, 1.15));
    count = Math.max(2, Math.min(count, nCap, K.maxSeeds));
    if (req.pattern === "radial") radius = 0.35 * ext[1] * (0.6 + 0.6 * ef);
    else if (req.pattern === "splinter") radius = 0.3 * ext[0];
    else radius = 0.5 * ext[0];
    far = req.pattern === "radial" ? 3 : 1;
  } else {
    const inner: Record<SeedPattern, [number, number]> = {
      radial: [6, 10],
      chunks: [5, 9],
      crumble: [10, 18],
      splinter: [4, 7],
      crack: [2, 4],
      dice: [0, 0],
    };
    const [a, b] = inner[req.pattern];
    // tiny breakouts cannot hold many pieces bigger than dust
    const sizeCap = Math.max(2, Math.round((Math.PI * radius * radius) / (minF * minF)));
    const nIn = Math.min(rng.int(a, b), sizeCap + 2);
    far = Math.max(3, Math.min(7, Math.round(2 + 1.5 * Math.log2(Math.max(1, ext[0] / Math.max(radius, 1e-3))))));
    count = Math.min(K.maxSeeds, nIn + far);
  }
  const pattern: SeedPattern = !req.global && req.pattern === "crack" ? "chunks" : req.pattern;
  const seeds = generateSeeds(region, {
    pattern,
    impact: req.center,
    dir: req.dir,
    radius: Math.max(radius, 1e-3),
    count,
    far,
    planeNormal: planeN,
    grain: part.grain,
    cell,
    rng,
  });
  // inner-cluster seeds come first (generateSeeds pushes them before the far seeds)
  const nInner = req.global ? seeds.length : Math.max(1, Math.min(seeds.length, count - Math.min(count - 1, Math.max(0, far ?? 0))));
  const innerKeys = new Set<string>();
  for (let i = 0; i < nInner && i < seeds.length; i++) innerKeys.add(key(seeds[i]));
  // a ring of seeds just outside the breakout bounds the inner cells, so the hole really is
  // ~1.1·r wide instead of being made of a few cells reaching out to the sparse far seeds
  if (!req.global && pattern !== "splinter") ringSeeds(region, seeds, req.center, req.faceN, radius, ext[2] < 0.3 * ext[1] || !!back);
  if (seeds.length < 2 && !back) return null;
  const aniso = mat.mode === "splinter" && part.grain && mat.anisotropy > 1 ? { axis: part.grain, factor: mat.anisotropy } : undefined;
  const vc = seeds.length >= 2 ? voronoiFracture(region, seeds, { interiorAttr: iattr, anisotropy: aniso, grain: part.grain }) : [];
  const inner: boolean[] = [];
  for (const c of vc) {
    cells.push({ poly: c.poly, volume: c.volume, centroid: c.centroid, maxExtent: c.maxExtent, role: "loose", neighbors: c.neighbors.slice(), frac: true });
    inner.push(innerKeys.has(key(c.seed)));
  }
  if (cells.length === 0) return null;
  if (back) {
    const bi = cells.length;
    const bc: WorkCell = { poly: back, volume: polyVolume(back), centroid: polyCentroid(back), maxExtent: polyExtents(back).ext[0], role: "remain", neighbors: [], frac: false };
    cells.push(bc);
    for (let i = 0; i < bi; i++) {
      const a = polyFaceAreaOnPlane(cells[i].poly, cut!.n, cut!.d);
      if (a > 1e-10) {
        cells[i].neighbors.push({ cell: bi, area: a });
        bc.neighbors.push({ cell: i, area: a });
      }
    }
  }
  if (cells.length < 2) return null;

  // ---------------------------------------------------------------- roles
  const center = req.center;
  const inBreakout = (c: Vec3): number => {
    // normalised distance from the breakout zone (≤ 1.1 → inside)
    const d = sub(c, center);
    const along = dot(d, req.faceN); // ≤ 0 inside the part
    const perp = Math.sqrt(Math.max(0, dot(d, d) - along * along));
    if (req.through) return perp / Math.max(radius, 1e-6);
    const h = Math.max(req.depth, 1e-4);
    return Math.hypot(perp / Math.max(radius, 1e-6), along / h);
  };
  const bonds = part.bonds;
  const holder = (anchor: Vec3): number => {
    let best = -1,
      bd = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.maxExtent < minF && c.frac) continue;
      const s = polySignedDist(c.poly, anchor);
      if (s < bd) {
        bd = s;
        best = i;
      }
    }
    return best;
  };
  let global = req.global;
  if (!global) {
    let nearest = -1,
      nd = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c.frac) continue;
      const q = inBreakout(c.centroid);
      if (q < nd) {
        nd = q;
        nearest = i;
      }
      // inner-cluster cells break out (unless they reach far beyond the zone); others remain
      c.role = (inner[i] && q <= 2.2) || q <= 1.1 ? "loose" : "remain";
    }
    if (nearest >= 0) cells[nearest].role = "loose";
    if (!cells.some((c) => c.role === "remain")) global = true;
  }
  const holders: number[] = bonds.map((b) => holder(b.anchor));
  if (global) for (const h of holders) if (h >= 0) cells[h].role = "remain";
  for (const c of cells) if (c.frac && c.role === "loose" && c.maxExtent < minF) c.role = "micro";
  // a "remain" cell that is pure dust and holds nothing crumbles too
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.role === "remain" && c.frac && c.maxExtent < minF && !holders.includes(i)) c.role = "micro";
  }

  // ---------------------------------------------------------------- dice: micro cube shower
  let extra: PlannedCell[] = [];
  let brokenVolume = 0;
  for (const c of cells) if (c.role !== "remain") brokenVolume += c.volume;
  if (req.pattern === "dice") extra = diceShower(part, cells, diceCell, req, rng);

  // ---------------------------------------------------------------- kicks
  const kicks = computeKicks(part, cells, extra, req, radius, rng);

  // ---------------------------------------------------------------- output cells
  const out: PlannedCell[] = [];
  const remap = new Int32Array(cells.length).fill(-1);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.role === "loose" && c.frac && (c as WorkCell & { expanded?: boolean }).expanded) continue;
    remap[i] = out.length;
    out.push({ poly: c.poly, volume: c.volume, centroid: c.centroid, maxExtent: c.maxExtent, role: c.role, kick: kicks[i] });
  }
  for (const e of extra) out.push(e);

  // ---------------------------------------------------------------- internal bonds
  const internalBonds: FracturePlan["internalBonds"] = [];
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    if (a.role !== "remain" || remap[i] < 0) continue;
    for (const nb of a.neighbors) {
      const j = nb.cell;
      if (j <= i || j >= cells.length) continue;
      const b = cells[j];
      if (b.role !== "remain" || remap[j] < 0 || !(nb.area > 0)) continue;
      const pa = polyClosestPoint(a.poly, b.centroid);
      const pb = polyClosestPoint(b.poly, pa);
      const anchor = V((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2);
      // cracked material: seams near the breakout (or after a global failure) are weaker
      const dist = Math.hypot(anchor.x - center.x, anchor.y - center.y, anchor.z - center.z);
      const f = global ? 0.25 : lerp(0.35, 1, smooth(radius, 3 * radius, dist));
      const s = fusedStrength(mat, nb.area, part.strength) * f;
      if (s > 0 && Number.isFinite(s)) internalBonds.push({ a: remap[i], b: remap[j], strength: s, anchor });
    }
  }

  // ---------------------------------------------------------------- bond transfer
  const bondTransfer = bonds.map((b, k) => {
    const h = holders[k];
    const ok = h >= 0 && cells[h].role === "remain" && remap[h] >= 0;
    return { bondId: b.id, cell: ok ? remap[h] : -1 };
  });

  return {
    global,
    mode: req.mode,
    center: V(center.x, center.y, center.z),
    radius,
    cells: out,
    internalBonds,
    bondTransfer,
    micro: mat.micro,
    brokenVolume,
  };
}

function key(p: Vec3): string {
  return `${p.x},${p.y},${p.z}`;
}

/** Append ring seeds at 1.45·r around the impact (in the plate's mid-plane when planar). */
function ringSeeds(region: ConvexPoly, seeds: Vec3[], center: Vec3, n: Vec3, r: number, planar: boolean): void {
  const R = 1.45 * r;
  const e1 = norm(Math.abs(n.x) < 0.9 ? V(0, -n.z, n.y) : V(n.z, 0, -n.x));
  const e2 = V(n.y * e1.z - n.z * e1.y, n.z * e1.x - n.x * e1.z, n.x * e1.y - n.y * e1.x);
  const eps = -1e-6 * Math.max(r, 1e-3);
  const push = (p: Vec3): void => {
    if (polySignedDist(region, p) < eps) seeds.push(p);
  };
  if (planar) {
    const ch = polyChord(region, center, n);
    const c = ch ? V(center.x + n.x * 0.5 * (ch.tMin + ch.tMax), center.y + n.y * 0.5 * (ch.tMin + ch.tMax), center.z + n.z * 0.5 * (ch.tMin + ch.tMax)) : center;
    const m = Math.max(6, Math.min(12, Math.round((2 * Math.PI * R) / (0.9 * r))));
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      push(V(c.x + (e1.x * Math.cos(a) + e2.x * Math.sin(a)) * R, c.y + (e1.y * Math.cos(a) + e2.y * Math.sin(a)) * R, c.z + (e1.z * Math.cos(a) + e2.z * Math.sin(a)) * R));
    }
  } else {
    const m = 14; // Fibonacci sphere
    for (let i = 0; i < m; i++) {
      const y = 1 - (2 * (i + 0.5)) / m;
      const rr = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      const dx = Math.cos(a) * rr,
        dz = Math.sin(a) * rr;
      push(V(center.x + (e1.x * dx + e2.x * dz + n.x * y) * R, center.y + (e1.y * dx + e2.y * dz + n.y * y) * R, center.z + (e1.z * dx + e2.z * dz + n.z * y) * R));
    }
  }
}

/**
 * Tempered glass dicing: coarse Voronoi cells that are not holding bonds break into a shower of
 * 2–3 cm cubes (micro cells), except a few that stay as small loose clumps.
 */
function diceShower(part: PartState, cells: WorkCell[], diceCell: number, req: PlanRequest, rng: Rng): PlannedCell[] {
  const out: PlannedCell[] = [];
  const t = Math.max(1e-3, Math.min(part.ext[2], req.t));
  const n = req.faceN;
  const e1 = norm(Math.abs(n.x) < 0.9 ? V(0, -n.z, n.y) : V(n.z, 0, -n.x));
  const e2 = V(n.y * e1.z - n.z * e1.y, n.z * e1.x - n.x * e1.z, n.x * e1.y - n.y * e1.x);
  const cand: Array<{ c: WorkCell; k: number }> = [];
  let total = 0;
  for (const c of cells) {
    if (c.role !== "loose" || !c.frac) continue;
    if (rng.chance(0.12)) continue; // stays a small clump of cubes (one loose body)
    const k = Math.max(1, Math.round(c.volume / (diceCell * diceCell * t)));
    cand.push({ c, k });
    total += k;
  }
  const scale = total > K.maxDiceMicro ? K.maxDiceMicro / total : 1;
  for (const { c, k } of cand) {
    (c as WorkCell & { expanded?: boolean }).expanded = true;
    const m = Math.max(1, Math.round(k * scale));
    const size = Math.min(c.maxExtent, diceCell / Math.sqrt(scale));
    const sp = 0.35 * c.maxExtent;
    for (let i = 0; i < m; i++) {
      const u = rng.range(-sp, sp),
        v = rng.range(-sp, sp);
      const p = V(c.centroid.x + e1.x * u + e2.x * v, c.centroid.y + e1.y * u + e2.y * v, c.centroid.z + e1.z * u + e2.z * v);
      const s = size * rng.range(0.75, 1.15);
      // Micro cells become particles (position = centroid, size = maxExtent, look = largest
      // face of the poly): the cubes share their coarse cell's poly read-only instead of
      // allocating hundreds of tiny polyhedra.
      out.push({ poly: c.poly, volume: c.volume / m, centroid: p, maxExtent: s, role: "micro", kick: V(0, 0, 0) });
    }
  }
  return out;
}

/**
 * Kicks: 10–25 % of the delivered energy becomes kinetic energy of the detached pieces, shared
 * ∝ √m (heavier pieces get more energy but less speed), directed along the impact (through
 * breakouts, global failures) or out of the surface (crater spall), with radial spread.
 */
function computeKicks(part: PartState, cells: WorkCell[], extra: PlannedCell[], req: PlanRequest, radius: number, rng: Rng): Vec3[] {
  const kicks: Vec3[] = cells.map(() => V(0, 0, 0));
  const mode = part.mat.mode;
  const { spread, vmax } = KICK[req.mode] ?? KICK[mode];
  const rho = effVolume(part) > 0 && part.mass > 0 ? part.mass / Math.max(part.volume, 1e-12) : part.mat.density;
  const Ek = Math.max(0, req.energy) * rng.range(0.1, 0.25);
  const crater = !req.global && !req.through;
  const base = crater ? req.faceN : norm(req.dir);
  const movers: Array<{ i: number; c: Vec3; m: number; out: Vec3 }> = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.role === "remain" || (c as WorkCell & { expanded?: boolean }).expanded) continue;
    movers.push({ i, c: c.centroid, m: Math.max(1e-6, c.volume * rho), out: kicks[i] });
  }
  for (const e of extra) movers.push({ i: -1, c: e.centroid, m: Math.max(1e-6, e.volume * rho), out: e.kick });
  if (!movers.length || !(Ek > 0)) return kicks;
  let wsum = 0;
  for (const mv of movers) wsum += Math.sqrt(mv.m);
  for (const mv of movers) {
    const KE = (Ek * Math.sqrt(mv.m)) / wsum;
    const v = Math.min(vmax, Math.max(0.2, Math.sqrt((2 * KE) / mv.m)));
    const d = sub(mv.c, req.center);
    const a = dot(d, base);
    let r = V(d.x - base.x * a, d.y - base.y * a, d.z - base.z * a);
    const rl = Math.hypot(r.x, r.y, r.z);
    r = rl > 1e-9 ? V(r.x / rl, r.y / rl, r.z / rl) : V(0, 0, 0);
    const near = clamp01(1 - rl / Math.max(4 * radius, 1e-3)) * 0.5 + 0.5;
    const j = rng.onSphere();
    const dir = norm(V(base.x + spread * r.x + 0.25 * j.x, base.y + spread * r.y + 0.25 * j.y, base.z + spread * r.z + 0.25 * j.z));
    const s = v * near;
    mv.out.x = dir.x * s;
    mv.out.y = dir.y * s;
    mv.out.z = dir.z * s;
  }
  return kicks;
}
