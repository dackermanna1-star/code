/**
 * Bolt-on visuals driven by the loadout: wheels/tires, armor, booster,
 * fuel cans/tanks and the weapon mount base. Everything is added to the
 * body Kit (merged per material) except the wheel, which is its own mesh.
 */
import { Mesh, MeshBuilder } from "@babylonjs/core";
import type { CarDef } from "../data/cars";
import { shade } from "../fx/Materials";
import type { WheelGeometry } from "./CarGeometry";
import { PAL, type CarFrame, type WindowQuad } from "./CarBodies";
import { Kit, ngon, type V3 } from "./ModelKit";

const SIDES = [-1, 1] as const;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Wheels

/**
 * One wheel mesh (tire + rim + hub [+ knobs]) with its axle along X and the
 * hub cap facing +X. Used as the source for instances on all four corners.
 */
export function buildWheel(k: Kit, wg: WheelGeometry, tier: number, def: CarDef): Mesh | null {
  const r = wg.radius;
  const w = wg.width;
  const knobs = tier >= 2;
  const tireR = knobs ? r - 0.035 : r;
  // tire: chamfered 12-gon
  k.prism(PAL.rubber, ngon(12, tireR, 0, 0, Math.PI / 12), w, Math.min(0.09, r * 0.24));
  // rim (slightly proud on both sides), hub cap and lug bolts
  const rimColor = tier >= 3 ? "#2d2c31" : tier === 2 ? "#8e8a7c" : def.colors.accent;
  const hubColor = tier >= 3 ? def.colors.accent : PAL.chrome;
  k.prism(rimColor, ngon(8, r * 0.6, 0, 0, Math.PI / 8), w + 0.03, 0.03);
  k.cyl(hubColor, { d: r * 0.5, h: 0.06, tess: 8 }, [w / 2 + 0.03, 0, 0], [0, 0, Math.PI / 2]);
  k.cyl(PAL.dark, { d: r * 0.16, h: 0.05, tess: 6 }, [w / 2 + 0.06, 0, 0], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box(PAL.dark, [0.03, r * 0.08, r * 0.08], [w / 2 + 0.02, Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42]);
  }
  if (tier >= 4) {
    // beadlock ring
    k.prism(def.colors.accent, ngon(12, r * 0.74, 0, 0, Math.PI / 12), w * 0.2, 0.01, w * 0.42);
  }
  if (knobs) {
    // chunky tread knobs, alternating sides
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const kw = w * (tier >= 3 ? 0.55 : 0.48);
      const off = (i % 2 ? 1 : -1) * (w - kw) * 0.5;
      const m = k.box(PAL.rubber, [kw, 0.07, r * 0.32], [off, Math.cos(a) * (tireR + 0.02), Math.sin(a) * (tireR + 0.02)]);
      m.rotation.x = a;
    }
  }
  return k.buildSingle(null, "wheel", true, 0.025);
}

// ---------------------------------------------------------------------------
// Armor

const WOOD = ["#c99a5b", "#b4854a", "#d6ad70"];
const SCRAP = ["#8b5a3a", "#7c8082", "#6c7457", "#94704a"];
const STEEL = "#6a757d";
const REACTIVE = "#7b7a4c";

/** A plank lying in a side-window plane (x constant) from (za,ya) to (zb,yb). */
function sidePlank(k: Kit, hex: string, x: number, za: number, ya: number, zb: number, yb: number, w = 0.14): void {
  const len = Math.hypot(zb - za, yb - ya);
  const m = k.box(hex, [0.035, len, w], [x, (ya + yb) / 2, (za + zb) / 2]);
  m.rotation.x = Math.atan2(zb - za, yb - ya);
}

function boardWindow(k: Kit, w: WindowQuad, i: number): void {
  for (const sx of SIDES) {
    const x = sx * (w.x + 0.04);
    sidePlank(k, WOOD[i % 3], x, w.zb0, w.y0, w.zt1, w.y1);
    sidePlank(k, WOOD[(i + 1) % 3], x * 1.01, w.zb1, w.y0, w.zt0, w.y1);
  }
}

function wedgePlow(k: Kit, f: CarFrame, color: string, rib: string, h: number, reach: number): { y0: number; y1: number; z: number } {
  const fz = f.front.z;
  const y0 = f.front.y0 + 0.02;
  const y1 = y0 + h;
  const width = 2 * f.front.halfW + 0.2;
  k.prism(color, [[fz - 0.06, y0], [fz + reach, y0], [fz + 0.08, y1], [fz - 0.06, y1]], width, 0.06);
  for (const t of [-0.66, 0, 0.66]) {
    k.slab(rib, [fz + reach, y0], [fz + 0.08, y1], 0.09, 0.035, t * f.front.halfW, 0.0);
  }
  return { y0, y1, z: fz };
}

function spikes(k: Kit, f: CarFrame, plow: { y0: number; y1: number }, reach: number, rows: number, len: number): void {
  const fz = f.front.z;
  const cols = Math.max(3, Math.round(f.front.halfW * 2.6));
  for (let r = 0; r < rows; r++) {
    const t = (r + 0.5) / rows;
    const y = lerp(plow.y0, plow.y1, t);
    const z = lerp(fz + reach, fz + 0.08, t);
    for (let c = 0; c < cols; c++) {
      const x = (c / (cols - 1) - 0.5) * 2 * f.front.halfW * 0.92 + (r % 2 ? 0.08 : 0);
      k.cyl("#d8dadc", { d: 0.1, dTop: 0, h: len, tess: 6 }, [x, y, z + len * 0.42], [Math.PI / 2, 0, 0]);
    }
  }
}

function windowCage(k: Kit, f: CarFrame): void {
  const ws = f.windshield;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * 2 * ws.halfW * 0.92;
    k.bar(PAL.dark, [x, ws.bottom[1] + 0.02, ws.bottom[0] + 0.06], [x, ws.top[1] + 0.02, ws.top[0] + 0.05], 0.05);
  }
  for (const w of f.sideWindows) {
    for (const sx of SIDES) {
      for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        const x = sx * (w.x + 0.05);
        k.bar(PAL.dark, [x, w.y0, lerp(w.zb0, w.zb1, t)], [x, w.y1, lerp(w.zt0, w.zt1, t)], 0.045);
      }
    }
  }
}

export function addArmor(k: Kit, f: CarFrame, tier: number): void {
  if (tier <= 0) return;
  const s = f.side;
  if (tier === 1) {
    // Plywood: boarded-up windows and grille, nailed on in a hurry.
    f.sideWindows.forEach((w, i) => boardWindow(k, w, i));
    const ws = f.windshield;
    for (const t of [0.08, 0.86]) k.slab(WOOD[0], ws.bottom, ws.top, 2 * ws.halfW * 0.96, 0.03, 0, 0.03, t, t + 0.12);
    const fy0 = f.front.y0 + 0.2;
    for (let i = 0; i < 2; i++) {
      const y = fy0 + i * 0.16;
      if (y > f.front.y1) break;
      k.box(WOOD[i + 1], [2 * f.front.halfW * 0.9, 0.13, 0.035], [0, y, f.front.z + 0.06], [0, 0, i ? 0.06 : -0.05]);
    }
    for (const sx of SIDES) k.box(WOOD[2], [0.035, 0.16, (s.z1 - s.z0) * 0.5], [sx * (s.x + 0.05), lerp(s.y0, s.y1, 0.35), lerp(s.z0, s.z1, 0.3)], [0.05, 0, 0]);
    return;
  }
  if (tier === 2) {
    // Scrap plates riveted over the flanks + a welded ram plow.
    const n = 3;
    for (const sx of SIDES) {
      for (let i = 0; i < n; i++) {
        const z0 = lerp(s.z0, s.z1, i / n);
        const z1 = lerp(s.z0, s.z1, (i + 1) / n);
        const h = (s.y1 - s.y0) * (0.62 + ((i * 7 + (sx > 0 ? 3 : 0)) % 4) * 0.08);
        const y = s.y0 + h / 2 + 0.02;
        const col = SCRAP[(i + (sx > 0 ? 1 : 0)) % SCRAP.length];
        k.box(col, [0.04, h, z1 - z0 + 0.06], [sx * (s.x + 0.06), y, (z0 + z1) / 2], [((i % 2) - 0.5) * 0.08, 0, 0]);
        for (const dz of [-1, 1]) for (const dy of [-1, 1]) {
          k.box(PAL.dark, [0.03, 0.05, 0.05], [sx * (s.x + 0.085), y + dy * (h / 2 - 0.06), (z0 + z1) / 2 + dz * ((z1 - z0) / 2 - 0.06)]);
        }
      }
    }
    wedgePlow(k, f, SCRAP[1], SCRAP[0], Math.min(0.7, (f.front.y1 - f.front.y0) * 0.9 + 0.1), 0.5);
    return;
  }
  // Tier 3+: welded steel skirts, window cage, spiked plow.
  for (const sx of SIDES) {
    k.box(tier >= 4 ? shade(STEEL, -0.15) : STEEL, [0.05, s.y1 - s.y0, s.z1 - s.z0], [sx * (s.x + 0.06), (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2]);
    for (let i = 1; i < 4; i++) {
      k.box(shade(STEEL, -0.35), [0.03, s.y1 - s.y0, 0.03], [sx * (s.x + 0.09), (s.y0 + s.y1) / 2, lerp(s.z0, s.z1, i / 4)]);
    }
  }
  windowCage(k, f);
  const plowH = Math.min(0.85, (f.front.y1 - f.front.y0) * 0.95 + 0.15);
  const reach = tier >= 4 ? 0.7 : 0.55;
  const plow = wedgePlow(k, f, STEEL, shade(STEEL, -0.35), plowH, reach);
  spikes(k, f, plow, reach, tier >= 4 ? 3 : 2, tier >= 4 ? 0.36 : 0.28);
  if (tier >= 4) {
    // Reactive armor blocks over the steel.
    for (const sx of SIDES) {
      const rows = Math.max(1, Math.floor((s.y1 - s.y0) / 0.28));
      const cols = Math.max(2, Math.floor((s.z1 - s.z0) / 0.36));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const y = s.y0 + (r + 0.5) * ((s.y1 - s.y0) / rows);
          const z = s.z0 + (c + 0.5) * ((s.z1 - s.z0) / cols);
          k.box(REACTIVE, [0.08, (s.y1 - s.y0) / rows - 0.05, (s.z1 - s.z0) / cols - 0.05], [sx * (s.x + 0.12), y, z]);
          k.box(PAL.dark, [0.02, 0.05, 0.05], [sx * (s.x + 0.17), y, z]);
        }
      }
    }
    const rf = f.roof;
    for (const sx of SIDES) {
      for (let z = rf.z0 + 0.2; z < rf.z1 - 0.1; z += 0.4) k.box(REACTIVE, [0.2, 0.1, 0.34], [sx * (rf.halfW - 0.08), rf.y + 0.05, z]);
    }
  }
}

// ---------------------------------------------------------------------------
// Booster (returns the nozzle exit point for the boost anchor)

export function addBooster(k: Kit, f: CarFrame, tier: number, def: CarDef): V3 {
  if (tier <= 0) return [0, f.rear.y0 + 0.35, f.rear.z - 0.15];
  const s = Math.min(1.45, Math.max(0.9, def.size.width / 1.8));
  const [cx, cy, cz] = f.boost;
  const rot: V3 = [Math.PI / 2, 0, 0]; // cylinder axis +Y -> +Z
  const saddle = (len: number, w: number) => {
    k.box(PAL.dark, [w, Math.max(0.06, cy - f.roof.y - 0.1), len * 0.5], [cx, (cy + f.roof.y) / 2 - 0.05, cz]);
  };

  if (tier === 1) {
    // Bottle rocket: striped body, nose cone, fins, two straps.
    const len = Math.min(f.boostLen, 1.0 * s);
    const r = 0.12 * s;
    const z0 = cz - len / 2;
    k.cyl("#c0392b", { d: 2 * r, h: len * 0.3, tess: 10 }, [cx, cy, z0 + len * 0.15], rot);
    k.cyl("#f3efe6", { d: 2 * r, h: len * 0.4, tess: 10 }, [cx, cy, z0 + len * 0.5], rot);
    k.cyl("#c0392b", { d: 2 * r, dTop: 0, h: len * 0.3, tess: 10 }, [cx, cy, z0 + len * 0.85], rot);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = k.box("#c0392b", [0.025, 0.16 * s, 0.22 * s], [cx + Math.cos(a) * (r + 0.07 * s), cy + Math.sin(a) * (r + 0.07 * s), z0 + 0.1 * s]);
      m.rotation.z = a - Math.PI / 2;
    }
    for (const t of [0.3, 0.65]) k.cyl(PAL.dark, { d: 2 * r + 0.04, h: 0.05, tess: 10 }, [cx, cy, z0 + len * t], rot);
    k.cyl("#3a3a40", { d: r * 1.1, dTop: r * 1.5, h: 0.12 * s, tess: 8 }, [cx, cy, z0 - 0.05 * s], [-Math.PI / 2, 0, 0]);
    saddle(len, 0.2);
    return [cx, cy, z0 - 0.12 * s];
  }

  if (tier === 2) {
    // Nitro: twin blue bottles feeding a chrome nozzle.
    const len = Math.min(f.boostLen, 1.0 * s);
    const r = 0.13 * s;
    const z0 = cz - len / 2;
    for (const sx of SIDES) {
      const x = cx + sx * (r + 0.03);
      k.cyl("#2f7fd6", { d: 2 * r, h: len * 0.75, tess: 10 }, [x, cy, cz + len * 0.08], rot);
      k.sphere("#2f7fd6", 2 * r, [x, cy, cz + len * 0.45], [1, 1, 0.8], undefined, 4);
      k.cyl("#f3efe6", { d: 2 * r + 0.015, h: 0.1 * s, tess: 10 }, [x, cy, cz + len * 0.15], rot);
      k.cyl(PAL.chrome, { d: 0.05, h: 0.14, tess: 6 }, [x, cy, cz + len * 0.45 + r * 0.8], rot);
      for (const t of [-0.15, 0.3]) k.cyl(PAL.dark, { d: 2 * r + 0.03, h: 0.04, tess: 10 }, [x, cy, cz + len * t], rot);
    }
    k.bar(PAL.chrome, [cx - r, cy, z0 + len * 0.18], [cx + r, cy, z0 + len * 0.18], 0.06, undefined, true);
    k.cyl(PAL.chrome, { d: 0.12 * s, h: len * 0.2, tess: 8 }, [cx, cy, z0 + len * 0.08], rot);
    k.cyl("#2b2b31", { d: 0.14 * s, dTop: 0.26 * s, h: 0.18 * s, tess: 8 }, [cx, cy, z0 - 0.06 * s], [-Math.PI / 2, 0, 0]);
    saddle(len, 0.5 * s);
    return [cx, cy, z0 - 0.16 * s];
  }

  // Jet engine (tier 3) / afterburner (tier 4).
  const big = tier >= 4 ? 1.15 : 1;
  const len = Math.min(f.boostLen, 1.25 * s * big);
  const r = 0.27 * s * big;
  const z0 = cz - len / 2;
  const nacelle = "#9ba4a9";
  k.cyl(nacelle, { d: 2 * r, h: len * 0.7, tess: 12 }, [cx, cy, cz + len * 0.1], rot);
  k.cyl(PAL.dark, { d: 2 * r + 0.06, h: 0.08, tess: 12 }, [cx, cy, cz + len * 0.45], rot);
  k.cyl("#3a3f44", { d: 2 * r - 0.04, h: 0.05, tess: 12 }, [cx, cy, cz + len * 0.44], rot);
  k.cyl(PAL.chrome, { d: r * 0.6, dTop: 0, h: r * 0.6, tess: 8 }, [cx, cy, cz + len * 0.46 + r * 0.3], rot);
  k.cyl("#ff7a1a", { d: 2 * r + 0.012, h: 0.08, tess: 12 }, [cx, cy, cz + len * 0.25], rot);
  // tapered nozzle
  k.cyl("#2e2e34", { d: 2 * r * 0.95, dTop: 2 * r * 0.7, h: len * 0.3, tess: 12 }, [cx, cy, z0 + len * 0.1], [-Math.PI / 2, 0, 0]);
  // hot core visible inside the nozzle
  k.cyl(tier >= 4 ? "#ff8a2a" : "#e0502a", { d: 2 * r * 0.6, h: 0.03, tess: 12 }, [cx, cy, z0 - len * 0.05 + 0.03], rot, {
    emissive: tier >= 4 ? 1.5 : 0.7,
  });
  if (tier >= 4) {
    // afterburner petals around the exit
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = k.box("#4a4a52", [0.07, 0.03, 0.2], [cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, z0 - len * 0.05 - 0.06]);
      m.rotation.z = a + Math.PI / 2;
    }
    for (const sx of SIDES) {
      k.cyl("#c0392b", { d: 0.16 * s, h: len * 0.5, tess: 8 }, [cx + sx * (r + 0.1 * s), cy - r * 0.3, cz], rot);
      k.cyl("#c0392b", { d: 0.16 * s, dTop: 0, h: 0.12 * s, tess: 8 }, [cx + sx * (r + 0.1 * s), cy - r * 0.3, cz + len * 0.25 + 0.06 * s], rot);
    }
  }
  // pylon to the roof
  k.box(PAL.dark, [0.14 * s, Math.max(0.1, cy - r - f.roof.y + 0.05), len * 0.45], [cx, (cy - r + f.roof.y) / 2, cz + len * 0.05]);
  k.box(PAL.dark, [r * 1.6, 0.05, len * 0.55], [cx, f.roof.y + 0.03, cz + len * 0.05]);
  return [cx, cy, z0 - 0.04];
}

// ---------------------------------------------------------------------------
// Fuel: jerry cans on a rack / in the bed, saddle tanks, rear bladder tank.

function jerryCan(k: Kit, pos: V3, rotY: number, color: string): void {
  const [x, y, z] = pos;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const body = k.box(color, [0.17, 0.36, 0.3], at(0, 0.18, 0));
  body.rotation.y = rotY;
  for (const lx of [-1, 1]) {
    const m = k.box(shade(color, -0.2), [0.02, 0.26, 0.04], at(lx * 0.09, 0.18, 0));
    m.rotation.set(0.6, rotY, 0);
    const m2 = k.box(shade(color, -0.2), [0.02, 0.26, 0.04], at(lx * 0.09, 0.18, 0));
    m2.rotation.set(-0.6, rotY, 0);
  }
  const h = k.box(PAL.dark, [0.05, 0.05, 0.16], at(0, 0.39, 0.03));
  h.rotation.y = rotY;
  k.cyl(PAL.dark, { d: 0.06, h: 0.06, tess: 6 }, at(0, 0.39, -0.11));
}

export function addFuel(k: Kit, f: CarFrame, tier: number, wg: WheelGeometry): void {
  if (tier <= 0) return;
  const count = tier === 1 ? 1 : tier === 2 ? 2 : 4;
  const spots = f.cans.slice(0, count);
  const onRoof = spots.some((sp) => Math.abs(sp.pos[1] - f.roof.y) < 0.2);
  if (onRoof) {
    // roof rack
    const rf = f.roof;
    const y = rf.y + 0.06;
    for (const sx of SIDES) {
      k.bar(PAL.dark, [sx * rf.halfW, y, rf.z0], [sx * rf.halfW, y, rf.z1], 0.05);
      for (const z of [rf.z0 + 0.05, rf.z1 - 0.05]) k.box(PAL.dark, [0.06, 0.08, 0.06], [sx * rf.halfW, rf.y + 0.02, z]);
    }
    const n = Math.max(2, Math.round((rf.z1 - rf.z0) / 0.45));
    for (let i = 0; i <= n; i++) {
      const z = lerp(rf.z0, rf.z1, i / n);
      k.bar(PAL.dark, [-rf.halfW, y, z], [rf.halfW, y, z], 0.04);
    }
  }
  spots.forEach((sp, i) => jerryCan(k, [sp.pos[0], sp.pos[1] + (onRoof ? 0.03 : 0), sp.pos[2]], sp.rotY, i % 2 ? "#4f6b3a" : "#c0392b"));

  if (tier >= 3) {
    // saddle tanks between the wheels
    const z0 = wg.zRear + wg.radius + 0.18;
    const z1 = wg.zFront - wg.radius - 0.18;
    if (z1 - z0 > 0.4) {
      const d = tier >= 4 ? 0.34 : 0.28;
      const y = Math.max(f.side.y0 - 0.05, wg.mountY - wg.restLength + 0.02);
      for (const sx of SIDES) {
        const x = sx * (f.side.x + d * 0.5 + (tier >= 3 ? 0.08 : 0.02));
        k.cyl("#b8bfc3", { d, h: z1 - z0, tess: 10 }, [x, y, (z0 + z1) / 2], [Math.PI / 2, 0, 0]);
        for (const t of [0.2, 0.8]) k.cyl(PAL.dark, { d: d + 0.03, h: 0.05, tess: 10 }, [x, y, lerp(z0, z1, t)], [Math.PI / 2, 0, 0]);
        k.cyl(PAL.dark, { d: 0.08, h: 0.06, tess: 6 }, [x, y + d / 2, lerp(z0, z1, 0.5)]);
      }
    }
  }
  if (tier >= 4) {
    // bladder tank strapped across the rear
    const r = f.rear;
    const w = 2 * r.halfW * 0.75;
    const y = r.y0 + 0.5;
    const z = r.z - 0.26;
    const m = MeshBuilder.CreateCapsule("bladder", { radius: 0.2, height: w, tessellation: 8, subdivisions: 1 }, k.scene);
    m.position.set(0, y, z);
    m.rotation.z = Math.PI / 2;
    m.scaling.set(1, 1, 0.8);
    m.convertToFlatShadedMesh();
    k.add(m, "#3e4a2b");
    for (const t of [-0.3, 0, 0.3]) k.cyl(PAL.dark, { d: 0.42, h: 0.05, tess: 8 }, [t * w, y, z], [0, 0, Math.PI / 2]);
    for (const sx of SIDES) k.box(PAL.dark, [0.06, 0.06, 0.3], [sx * w * 0.4, y - 0.2, z + 0.12]);
  }
}

// ---------------------------------------------------------------------------
// Weapon mount base (the weapons module builds the gun on the anchor)

/** Returns the anchor position (top of the turret ring). */
export function addWeaponMount(k: Kit, f: CarFrame, tier: number): V3 {
  const [x, y, z] = f.weapon;
  if (tier <= 0) return [x, y, z];
  k.box(PAL.dark, [0.7, 0.05, 0.7], [x, y + 0.025, z]);
  k.cyl("#3d3f45", { d: 0.5, h: 0.1, tess: 10 }, [x, y + 0.1, z]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.box(PAL.chrome, [0.05, 0.05, 0.05], [x + Math.cos(a) * 0.3, y + 0.07, z + Math.sin(a) * 0.3]);
  }
  return [x, y + 0.15, z];
}
