/**
 * The five car bodies, built from chamfered prisms and chunky primitives.
 * Each builder adds static parts to `b.kit`, detachable panels via
 * `b.panel()`, and returns a CarFrame describing where upgrades bolt on.
 *
 * Chassis-local frame: origin = center of def.size, +Z forward, +Y up, +X right.
 */
import { MeshBuilder } from "@babylonjs/core";
import type { CarDef, CarId } from "../data/cars";
import { shade } from "../fx/Materials";
import type { WheelGeometry } from "./CarGeometry";
import { Kit, textMaterial, type P2, type V3 } from "./ModelKit";

export const PAL = {
  glass: "#25333f",
  dark: "#1b1a1f",
  chrome: "#c9ced2",
  head: "#fff1b0",
  tail: "#ff3a2c",
  amber: "#ffab2e",
  rubber: "#2a282d",
  plate: "#efe6cc",
};

export interface WindowQuad {
  zb0: number;
  zb1: number;
  zt0: number;
  zt1: number;
  y0: number;
  y1: number;
  x: number; // |x| of the glass side surface
}

export interface Box3 {
  center: V3;
  size: V3;
}

export interface CarFrame {
  /** Flat body side area (|x| of the surface + extents) for plates / dents. */
  side: { x: number; y0: number; y1: number; z0: number; z1: number };
  front: { z: number; y0: number; y1: number; halfW: number };
  rear: { z: number; y0: number; y1: number; halfW: number };
  /** Roof top surface (rack / weapon). */
  roof: { y: number; z0: number; z1: number; halfW: number };
  /** Main top surface in front of the windshield (hood) as a profile edge. */
  hood: { p0: P2; p1: P2; halfW: number };
  windshield: { bottom: P2; top: P2; halfW: number };
  sideWindows: WindowQuad[];
  /** Booster center (it extends along Z, nozzle toward -Z) and its max length. */
  boost: V3;
  boostLen: number;
  weapon: V3;
  exhaust: V3;
  smoke: V3;
  /** Jerry-can spots in fill order: position (can base) + yaw. */
  cans: { pos: V3; rotY: number }[];
  /** Collision boxes for the physics compound. */
  collision: Box3[];
}

export interface BodyBuild {
  kit: Kit;
  def: CarDef;
  wg: WheelGeometry;
  /** Start a detachable panel that falls off once damage >= threshold. */
  panel(name: string, threshold: number): Kit;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const SIDES = [-1, 1] as const;

// ---------------------------------------------------------------------------
// Shared helpers

interface CabinSpec {
  y0: number;
  y1: number;
  zb0: number; // rear bottom
  zb1: number; // front bottom (windshield base)
  zt0: number; // rear top
  zt1: number; // front top
  width: number;
  roof: number; // roof slab thickness
  pillars?: number[]; // B-pillar fractions (0 = rear .. 1 = front)
  color: string;
  pillarColor?: string;
  pillar?: number;
}

/** Greenhouse: dark glass block + roof slab + pillars + belt line. */
function cabin(b: BodyBuild, s: CabinSpec): { windows: WindowQuad[]; windshield: CarFrame["windshield"]; box: Box3; roofY: number } {
  const k = b.kit;
  const hw = s.width / 2;
  k.prism(PAL.glass, [[s.zb0, s.y0], [s.zb1, s.y0], [s.zt1, s.y1], [s.zt0, s.y1]], s.width, 0.05);
  const rt = s.roof;
  k.prism(
    s.color,
    [[s.zt0 - 0.04, s.y1 - 0.03], [s.zt1 + 0.05, s.y1 - 0.03], [s.zt1 - 0.03, s.y1 + rt], [s.zt0 + 0.04, s.y1 + rt]],
    s.width + 0.06,
    Math.min(0.07, rt * 0.7),
  );
  const t = s.pillar ?? 0.11;
  const pc = s.pillarColor ?? s.color;
  const fr = [0, ...(s.pillars ?? []), 1];
  const windows: WindowQuad[] = [];
  for (const sx of SIDES) {
    const px = sx * (hw - t * 0.3);
    for (const f of fr) {
      const zb = lerp(s.zb0, s.zb1, f);
      const zt = lerp(s.zt0, s.zt1, f);
      k.bar(pc, [px, s.y0, zb], [px, s.y1, zt], t);
    }
    // belt line
    k.bar(pc, [px, s.y0 + 0.025, s.zb0], [px, s.y0 + 0.025, s.zb1], 0.07);
  }
  for (let i = 0; i < fr.length - 1; i++) {
    const f0 = fr[i];
    const f1 = fr[i + 1];
    windows.push({
      zb0: lerp(s.zb0, s.zb1, f0) + t * 0.5,
      zb1: lerp(s.zb0, s.zb1, f1) - t * 0.5,
      zt0: lerp(s.zt0, s.zt1, f0) + t * 0.5,
      zt1: lerp(s.zt0, s.zt1, f1) - t * 0.5,
      y0: s.y0 + 0.05,
      y1: s.y1 - 0.02,
      x: hw,
    });
  }
  const zMin = Math.min(s.zb0, s.zt0);
  const zMax = Math.max(s.zb1, s.zt1);
  return {
    windows,
    windshield: { bottom: [s.zb1, s.y0], top: [s.zt1, s.y1], halfW: hw - t * 0.6 },
    box: {
      center: [0, (s.y0 + s.y1 + rt) / 2, (zMin + zMax) / 2],
      size: [s.width, s.y1 + rt - s.y0, zMax - zMin],
    },
    roofY: s.y1 + rt,
  };
}

/** Trapezoid fender flares above each wheel. */
function arches(b: BodyBuild, sideX: number, color: string, minY: number, thick = 0.12): void {
  const wg = b.wg;
  const cy = wg.mountY - wg.restLength;
  const top = cy + wg.radius + 0.07;
  const r = wg.radius;
  for (const z of [wg.zFront, wg.zRear]) {
    for (const sx of SIDES) {
      const x = sx * (sideX + 0.035);
      const lowY = Math.max(cy + 0.02, minY + thick * 0.5);
      const p: V3[] = [
        [x, lowY, z - r - 0.1],
        [x, top, z - r * 0.5],
        [x, top, z + r * 0.5],
        [x, lowY, z + r + 0.1],
      ];
      for (let i = 0; i < 3; i++) b.kit.bar(color, p[i], p[i + 1], thick);
    }
  }
}

function plate(k: Kit, text: string, pos: V3, front: boolean, w = 0.42, h = 0.14): void {
  const m = MeshBuilder.CreatePlane("plate", { width: w, height: h }, k.scene);
  m.position.set(pos[0], pos[1], pos[2]);
  if (front) m.rotation.y = Math.PI;
  k.addCustom(m, textMaterial(k.scene, text, PAL.plate, "#2a2a2a"), `plate|${text}`);
}

function roundLight(k: Kit, pos: V3, d: number, color = PAL.head, ring = PAL.chrome, facing = 1): void {
  k.cyl(color, { d, h: 0.06, tess: 10 }, [pos[0], pos[1], pos[2] + 0.02 * facing], [Math.PI / 2, 0, 0], { emissive: 1.1 });
  k.cyl(ring, { d: d + 0.07, h: 0.05, tess: 10 }, [pos[0], pos[1], pos[2]], [Math.PI / 2, 0, 0]);
}

function mirrors(k: Kit, x: number, y: number, z: number, color: string, size = 1): void {
  for (const sx of SIDES) {
    k.box(PAL.dark, [0.12 * size, 0.03, 0.04], [sx * (x + 0.04 * size), y - 0.02, z + 0.02]);
    k.box(color, [0.07 * size, 0.12 * size, 0.16 * size], [sx * (x + 0.11 * size), y + 0.02, z]);
  }
}

function door(b: BodyBuild, name: string, threshold: number, sx: number, x: number, y0: number, y1: number, z0: number, z1: number, color: string, handleZ?: number): void {
  const p = b.panel(name, threshold);
  p.box(color, [0.05, y1 - y0, z1 - z0], [sx * (x + 0.012), (y0 + y1) / 2, (z0 + z1) / 2]);
  p.box(PAL.dark, [0.04, 0.05, 0.15], [sx * (x + 0.06), y1 - 0.12, handleZ ?? z0 + 0.18]);
}

// ---------------------------------------------------------------------------
// Rustbucket: tired little hatchback with a mismatched door and rust spots.

function hatchback(b: BodyBuild): CarFrame {
  const { kit: k, def } = b;
  const C = def.colors;
  const W = def.size.width / 2;
  const H = def.size.height / 2;
  const L = def.size.length / 2;
  const rust = "#8a4a28";
  const hoodA: P2 = [L - 1.15, H];
  const hoodB: P2 = [L - 0.08, H - 0.25];
  k.prism(
    C.body,
    [[-L + 0.1, -H], [L - 0.18, -H], [L, -H + 0.2], [L, H - 0.43], hoodB, hoodA, [-L + 0.12, H], [-L, H - 0.13], [-L, -H + 0.15]],
    2 * W,
    0.13,
  );
  // dark rocker strip
  k.box(C.trim, [2 * W + 0.03, 0.1, 2 * L - 0.6], [0, -H + 0.06, 0]);
  const cab = cabin(b, {
    y0: H, y1: H + 0.56, zb0: -L + 0.15, zb1: hoodA[0] - 0.03, zt0: -L + 0.32, zt1: -0.05,
    width: 2 * W - 0.18, roof: 0.09, pillars: [0.45], color: C.body,
  });
  // hood (falls off)
  b.panel("hood", 0.48).slab(C.body, hoodA, hoodB, 2 * W - 0.22, 0.05, 0, 0.005);
  // doors: the left one is a junkyard replacement in a different color
  door(b, "doorL", 0.58, -1, W, -H + 0.16, H - 0.06, -0.45, 0.62, C.accent, -0.3);
  door(b, "doorR", 0.78, 1, W, -H + 0.16, H - 0.06, -0.45, 0.62, C.body, -0.3);
  // bumpers
  const bf = b.panel("bumperF", 0.3);
  bf.box(C.trim, [2 * W + 0.08, 0.2, 0.24], [0, -H + 0.12, L + 0.05]);
  for (const sx of SIDES) bf.box(PAL.amber, [0.16, 0.07, 0.04], [sx * (W - 0.12), -H + 0.13, L + 0.18], undefined, { emissive: 0.8 });
  b.panel("bumperR", 0.68).box(C.trim, [2 * W + 0.08, 0.2, 0.24], [0, -H + 0.12, -L - 0.05]);
  // face
  for (const sx of SIDES) roundLight(k, [sx * 0.55, -0.06, L + 0.01], 0.3);
  k.box(PAL.dark, [0.6, 0.16, 0.04], [0, -0.07, L + 0.01]);
  k.decals(() => {
    k.box(PAL.chrome, [0.62, 0.03, 0.05], [0, -0.03, L + 0.06]);
    k.box(PAL.chrome, [0.62, 0.03, 0.05], [0, -0.11, L + 0.06]);
  });
  // rear
  for (const sx of SIDES) k.box(PAL.tail, [0.2, 0.2, 0.05], [sx * 0.6, 0.06, -L - 0.01], undefined, { emissive: 1 });
  plate(k, "RUSTY", [0, -0.14, -L - 0.05], false);
  k.box(C.trim, [1.2, 0.05, 0.28], [0, cab.roofY - 0.02, -L + 0.22], [0.15, 0, 0]); // roof spoiler
  mirrors(k, W - 0.12, H + 0.12, hoodA[0] - 0.12, C.body);
  // rust & primer patches
  k.decals(() => {
    k.box(rust, [0.02, 0.16, 0.3], [-W - 0.04, -0.26, -1.3]);
    k.box(rust, [0.02, 0.12, 0.2], [W + 0.04, -0.3, 1.0]);
    k.box(shade(C.body, -0.35), [0.02, 0.2, 0.26], [W + 0.04, 0.12, -1.25]);
    k.box(rust, [0.3, 0.02, 0.22], [-0.45, H + 0.04, -1.0]);
  });
  // antenna
  k.bar(PAL.dark, [0.55, cab.roofY, -L + 0.55], [0.62, cab.roofY + 0.55, -L + 0.45], 0.025);
  k.sphere(C.accent, 0.09, [0.62, cab.roofY + 0.56, -L + 0.45]);
  // exhaust
  k.cyl(PAL.dark, { d: 0.11, h: 0.3, tess: 8 }, [0.45, -H + 0.02, -L - 0.03], [Math.PI / 2, 0, 0]);
  arches(b, W, C.trim, -H);

  const rY = cab.roofY;
  return {
    side: { x: W, y0: -H + 0.12, y1: H - 0.05, z0: -L + 0.25, z1: L - 0.35 },
    front: { z: L, y0: -H, y1: H - 0.25, halfW: W },
    rear: { z: -L, y0: -H, y1: H, halfW: W },
    roof: { y: rY, z0: -L + 0.36, z1: -0.08, halfW: W - 0.12 },
    hood: { p0: hoodA, p1: hoodB, halfW: W - 0.1 },
    windshield: cab.windshield,
    sideWindows: cab.windows,
    boost: [0, rY + 0.22, -L + 0.5],
    boostLen: 1.3,
    weapon: [0, rY, -0.45],
    exhaust: [0.45, -H + 0.02, -L - 0.2],
    smoke: [0, H, L - 0.5],
    cans: [
      { pos: [-(W - 0.22), rY + 0.06, -0.55], rotY: 0 },
      { pos: [W - 0.22, rY + 0.06, -0.55], rotY: 0 },
      { pos: [-(W - 0.22), rY + 0.06, -1.0], rotY: 0 },
      { pos: [W - 0.22, rY + 0.06, -1.0], rotY: 0 },
    ],
    collision: [{ center: [0, 0, 0], size: [2 * W, 2 * H, 2 * L] }, cab.box],
  };
}

// ---------------------------------------------------------------------------
// Workhorse: farm pickup with a bed, big grille and amber light bar.

function pickup(b: BodyBuild): CarFrame {
  const { kit: k, def } = b;
  const C = def.colors;
  const W = def.size.width / 2;
  const H = def.size.height / 2;
  const L = def.size.length / 2;
  const top = H - 0.2; // hood / bed-floor height
  const cabFront = 0.8;
  k.prism(
    C.body,
    [[-L + 0.06, -H], [L - 0.14, -H], [L, -H + 0.18], [L, top - 0.12], [L - 0.12, top], [-L + 0.06, top], [-L, top - 0.1], [-L, -H + 0.1]],
    2 * W,
    0.1,
  );
  const cab = cabin(b, {
    y0: top, y1: top + 0.66, zb0: -0.55, zb1: cabFront, zt0: -0.5, zt1: 0.2,
    width: 2 * W - 0.16, roof: 0.1, color: C.body,
  });
  // bed walls + tailgate
  const bedZ0 = -L;
  const bedZ1 = -0.62;
  const wallH = 0.42;
  for (const sx of SIDES) {
    k.box(C.body, [0.12, wallH, bedZ1 - bedZ0], [sx * (W - 0.06), top + wallH / 2, (bedZ0 + bedZ1) / 2]);
    k.box(C.trim, [0.15, 0.05, bedZ1 - bedZ0 + 0.02], [sx * (W - 0.06), top + wallH + 0.02, (bedZ0 + bedZ1) / 2]);
  }
  k.box(C.body, [2 * W - 0.24, wallH, 0.1], [0, top + wallH / 2, bedZ1 + 0.04]);
  k.box(shade(C.trim, -0.2), [2 * W - 0.24, 0.03, bedZ1 - bedZ0 - 0.2], [0, top + 0.015, (bedZ0 + bedZ1) / 2 - 0.05]);
  const tg = b.panel("tailgate", 0.7);
  tg.box(C.body, [2 * W - 0.02, wallH, 0.1], [0, top + wallH / 2, -L + 0.04]);
  tg.box(C.accent, [0.7, 0.08, 0.02], [0, top + wallH / 2, -L - 0.015]);
  // hood
  b.panel("hood", 0.48).slab(C.body, [cabFront + 0.02, top], [L - 0.14, top], 2 * W - 0.2, 0.05, 0, 0.005);
  door(b, "doorL", 0.58, -1, W, -H + 0.18, top - 0.04, -0.5, 0.74, C.body, -0.32);
  door(b, "doorR", 0.8, 1, W, -H + 0.18, top - 0.04, -0.5, 0.74, C.body, -0.32);
  // accent pin stripe along the flanks
  k.decals(() => {
    for (const sx of SIDES) k.box(C.accent, [0.02, 0.07, 2 * L - 0.5], [sx * (W + 0.04), -0.05, 0]);
  });
  // big grille + square lights
  k.box(PAL.dark, [1.2, 0.38, 0.05], [0, -0.04, L + 0.01]);
  k.decals(() => {
    for (let i = 0; i < 3; i++) k.box(PAL.chrome, [1.24, 0.04, 0.06], [0, -0.17 + i * 0.13, L + 0.06]);
    k.box(PAL.chrome, [0.06, 0.4, 0.06], [0, -0.04, L + 0.065]);
  });
  for (const sx of SIDES) {
    k.box(PAL.head, [0.3, 0.2, 0.05], [sx * 0.76, -0.02, L + 0.012], undefined, { emissive: 1.1 });
    k.box(PAL.chrome, [0.36, 0.26, 0.04], [sx * 0.76, -0.02, L - 0.005]);
    k.box(PAL.tail, [0.12, 0.3, 0.05], [sx * (W - 0.08), top + 0.2, -L - 0.01], undefined, { emissive: 1 });
  }
  const bf = b.panel("bumperF", 0.3);
  bf.box(PAL.chrome, [2 * W + 0.1, 0.24, 0.26], [0, -H + 0.12, L + 0.06]);
  bf.box(PAL.dark, [0.5, 0.1, 0.04], [0, -H + 0.12, L + 0.2]);
  b.panel("bumperR", 0.66).box(PAL.chrome, [2 * W + 0.06, 0.2, 0.24], [0, -H + 0.1, -L - 0.06]);
  plate(k, "FARM 4", [0, -H + 0.1, -L - 0.22], false);
  mirrors(k, W - 0.08, top + 0.14, cabFront - 0.1, PAL.chrome, 1.3);
  // amber light bar on the cab
  k.box(PAL.dark, [1.2, 0.08, 0.16], [0, cab.roofY + 0.05, 0.05]);
  for (const sx of [-0.4, 0, 0.4]) k.box(PAL.amber, [0.26, 0.1, 0.14], [sx, cab.roofY + 0.12, 0.05], undefined, { emissive: 1 });
  k.cyl(PAL.dark, { d: 0.12, h: 0.34, tess: 8 }, [0.6, -H + 0.04, -L + 0.1], [Math.PI / 2, 0, 0]);
  arches(b, W, C.trim, -H, 0.14);

  const bedMidZ = (bedZ0 + bedZ1) / 2;
  return {
    side: { x: W, y0: -H + 0.12, y1: top - 0.02, z0: -L + 0.2, z1: L - 0.3 },
    front: { z: L, y0: -H, y1: top, halfW: W },
    rear: { z: -L, y0: -H, y1: top + wallH, halfW: W },
    roof: { y: cab.roofY, z0: -0.48, z1: 0.16, halfW: W - 0.1 },
    hood: { p0: [cabFront, top], p1: [L - 0.12, top], halfW: W - 0.1 },
    windshield: cab.windshield,
    sideWindows: cab.windows,
    boost: [0, top + 0.42, bedMidZ - 0.15],
    boostLen: 1.75,
    weapon: [0, cab.roofY + 0.08, -0.17],
    exhaust: [0.6, -H + 0.04, -L - 0.1],
    smoke: [0, top, L - 0.6],
    cans: [
      { pos: [-(W - 0.3), top + 0.03, bedZ1 - 0.28], rotY: Math.PI / 2 },
      { pos: [W - 0.3, top + 0.03, bedZ1 - 0.28], rotY: Math.PI / 2 },
      { pos: [-(W - 0.3), top + 0.03, bedZ0 + 0.35], rotY: Math.PI / 2 },
      { pos: [W - 0.3, top + 0.03, bedZ0 + 0.35], rotY: Math.PI / 2 },
    ],
    collision: [{ center: [0, -0.1, 0], size: [2 * W, 2 * H - 0.2, 2 * L] }, cab.box, { center: [0, top + wallH / 2, bedMidZ], size: [2 * W, wallH, bedZ1 - bedZ0] }],
  };
}

// ---------------------------------------------------------------------------
// Big Yellow: a school bus with a nose hood, rub rails, stop arm and EVAC sign.

function bus(b: BodyBuild): CarFrame {
  const { kit: k, def } = b;
  const C = def.colors;
  const W = def.size.width / 2;
  const H = def.size.height / 2;
  const L = def.size.length / 2;
  const boxFront = L - 1.45;
  const winY0 = 0.3;
  // main box lower half
  k.prism(C.body, [[-L + 0.08, -H], [boxFront, -H], [boxFront, winY0], [-L + 0.04, winY0], [-L, winY0 - 0.08], [-L, -H + 0.12]], 2 * W, 0.12);
  // nose
  const noseW = 2 * W - 0.5;
  const hoodA: P2 = [boxFront - 0.05, -0.05];
  const hoodB: P2 = [L - 0.12, -0.28];
  k.prism(C.body, [[boxFront - 0.1, -H], [L - 0.15, -H], [L, -H + 0.2], [L, -0.42], hoodB, hoodA], noseW, 0.14);
  const cab = cabin(b, {
    y0: winY0, y1: H - 0.24, zb0: -L + 0.06, zb1: boxFront, zt0: -L + 0.06, zt1: boxFront - 0.12,
    width: 2 * W - 0.02, roof: 0.26, pillars: [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84], color: C.body, pillar: 0.14,
  });
  // rub rails
  k.decals(() => {
    for (const y of [-0.85, -0.35, winY0 - 0.06]) {
      for (const sx of SIDES) k.box(C.trim, [0.04, 0.08, boxFront + L - 0.25], [sx * (W + 0.04), y, (boxFront - L) / 2]);
    }
  });
  // EVAC sign above the windshield + warning lights on the corners
  const sign = MeshBuilder.CreatePlane("evac", { width: 1.3, height: 0.22 }, k.scene);
  sign.position.set(0, H - 0.11, boxFront + 0.035);
  sign.rotation.y = Math.PI;
  k.addCustom(sign, textMaterial(k.scene, "EVAC", "#1d1d1d", "#f4c430", 320, 64), "sign|evac");
  for (const sx of SIDES) {
    for (const z of [boxFront + 0.02, -L - 0.02]) {
      k.box(C.accent, [0.18, 0.13, 0.06], [sx * (W - 0.18), H - 0.11, z], undefined, { emissive: 1 });
      k.box(PAL.amber, [0.14, 0.11, 0.06], [sx * (W - 0.45), H - 0.11, z], undefined, { emissive: 1 });
    }
  }
  // stop arm on the driver's (left) side
  k.cyl("#ffffff", { d: 0.5, h: 0.03, tess: 8 }, [-W - 0.06, -0.15, boxFront - 1.0], [0, 0, Math.PI / 2]);
  k.cyl(C.accent, { d: 0.44, h: 0.05, tess: 8 }, [-W - 0.075, -0.15, boxFront - 1.0], [0, 0, Math.PI / 2]);
  // nose details
  k.box(PAL.dark, [0.9, 0.5, 0.05], [0, -0.75, L + 0.005]);
  k.decals(() => {
    for (let i = 0; i < 4; i++) k.box(PAL.chrome, [0.94, 0.035, 0.06], [0, -0.92 + i * 0.12, L + 0.06]);
  });
  for (const sx of SIDES) {
    roundLight(k, [sx * 0.75, -0.65, L + 0.005], 0.28);
    k.box(PAL.tail, [0.22, 0.32, 0.05], [sx * (W - 0.2), -0.55, -L - 0.01], undefined, { emissive: 1 });
  }
  // rear emergency door frame
  k.box(C.trim, [0.9, 1.5, 0.03], [0, -0.45, -L - 0.005]);
  k.box(PAL.glass, [0.7, 0.55, 0.04], [0, -0.05, -L - 0.01]);
  plate(k, "BUS 13", [0.7, -0.7, -L - 0.05], false);
  const bf = b.panel("bumperF", 0.3);
  bf.box(C.trim, [2 * W - 0.1, 0.3, 0.3], [0, -H + 0.12, L + 0.08]);
  b.panel("bumperR", 0.62).box(C.trim, [2 * W + 0.04, 0.3, 0.26], [0, -H + 0.12, -L - 0.08]);
  b.panel("hood", 0.45).slab(C.body, hoodA, hoodB, noseW - 0.16, 0.05, 0, 0.005);
  // folding passenger door (right front) and the left emergency panel
  const dp = b.panel("doorR", 0.52);
  dp.box(PAL.glass, [0.05, 1.6, 0.66], [W + 0.015, -0.3, boxFront - 0.45]);
  dp.box(C.trim, [0.06, 1.6, 0.06], [W + 0.02, -0.3, boxFront - 0.45]);
  dp.box(C.trim, [0.06, 0.06, 0.66], [W + 0.02, -0.3, boxFront - 0.45]);
  const ep = b.panel("doorL", 0.75);
  ep.box(C.body, [0.05, 0.9, 1.0], [-W - 0.015, -0.6, -L + 1.5]);
  ep.box(C.trim, [0.06, 0.06, 1.0], [-W - 0.03, -0.25, -L + 1.5]);
  mirrors(k, W - 0.05, 0.25, boxFront + 0.3, PAL.dark, 1.6);
  k.cyl(PAL.dark, { d: 0.14, h: 0.35, tess: 8 }, [-0.8, -H + 0.04, -L + 0.1], [Math.PI / 2, 0, 0]);
  arches(b, W, C.trim, -H, 0.16);

  const rY = cab.roofY;
  return {
    side: { x: W, y0: -H + 0.15, y1: winY0 - 0.12, z0: -L + 0.3, z1: boxFront - 0.2 },
    front: { z: L, y0: -H, y1: -0.3, halfW: W - 0.25 },
    rear: { z: -L, y0: -H, y1: H, halfW: W },
    roof: { y: rY, z0: -L + 0.3, z1: boxFront - 0.3, halfW: W - 0.12 },
    hood: { p0: hoodA, p1: hoodB, halfW: noseW / 2 - 0.1 },
    windshield: cab.windshield,
    sideWindows: cab.windows,
    boost: [0, rY + 0.3, -L + 1.0],
    boostLen: 2.2,
    weapon: [0, rY, boxFront - 1.6],
    exhaust: [-0.8, -H + 0.04, -L - 0.12],
    smoke: [0, hoodA[1], L - 0.6],
    cans: [
      { pos: [-(W - 0.3), rY + 0.06, 0.3], rotY: 0 },
      { pos: [W - 0.3, rY + 0.06, 0.3], rotY: 0 },
      { pos: [-(W - 0.3), rY + 0.06, -0.3], rotY: 0 },
      { pos: [W - 0.3, rY + 0.06, -0.3], rotY: 0 },
    ],
    collision: [
      { center: [0, 0, (boxFront - L) / 2], size: [2 * W, 2 * H, boxFront + L] },
      { center: [0, (-H - 0.05) / 2, (boxFront + L) / 2], size: [noseW, H - 0.05, L - boxFront] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Viper GT: low wedge coupe with a big wing, racing stripes and pop-up lights.

function coupe(b: BodyBuild): CarFrame {
  const { kit: k, def } = b;
  const C = def.colors;
  const W = def.size.width / 2;
  const H = def.size.height / 2;
  const L = def.size.length / 2;
  const hoodA: P2 = [0.45, H - 0.1];
  const hoodB: P2 = [L - 0.3, -H + 0.46];
  const deckA: P2 = [-L + 0.1, H];
  k.prism(
    C.body,
    [[-L + 0.15, -H], [L - 0.35, -H], [L, -H + 0.14], [L - 0.02, -H + 0.32], hoodB, hoodA, deckA, [-L, H - 0.1], [-L, -H + 0.12]],
    2 * W,
    0.14,
  );
  const cab = cabin(b, {
    y0: H - 0.07, y1: H + 0.36, zb0: -L + 0.85, zb1: hoodA[0] - 0.02, zt0: -0.85, zt1: -0.32,
    width: 2 * W - 0.34, roof: 0.07, color: C.body, pillar: 0.1,
  });
  // racing stripes: deck + roof are static, hood stripes ride on the hood panel
  const hood = b.panel("hood", 0.48);
  hood.slab(C.body, hoodA, hoodB, 2 * W - 0.3, 0.04, 0, 0.005);
  for (const sx of SIDES) {
    hood.decals(() => hood.slab(C.accent, hoodA, hoodB, 0.16, 0.02, sx * 0.15, 0.08));
    k.decals(() => {
      k.slab(C.accent, deckA, hoodA, 0.16, 0.02, sx * 0.15, 0.035, 0, 0.27);
      k.box(C.accent, [0.16, 0.02, -0.85 + 0.32 + 0.4], [sx * 0.15, cab.roofY + 0.045, (-0.85 - 0.32) / 2]);
    });
  }
  // wing
  k.box(C.trim, [2 * W - 0.1, 0.06, 0.38], [0, H + 0.36, -L + 0.28], [-0.08, 0, 0]);
  for (const sx of SIDES) {
    k.box(C.trim, [0.05, 0.36, 0.22], [sx * (W - 0.32), H + 0.16, -L + 0.28]);
    k.box(C.trim, [0.06, 0.24, 0.42], [sx * (W - 0.03), H + 0.3, -L + 0.28]);
  }
  // pop-up headlights, splitter, side intakes
  for (const sx of SIDES) {
    k.box(C.body, [0.38, 0.13, 0.28], [sx * 0.55, 0.0, L - 0.42], [-0.12, 0, 0]);
    k.box(PAL.head, [0.3, 0.09, 0.03], [sx * 0.55, 0.02, L - 0.27], [-0.12, 0, 0], { emissive: 1.2 });
    k.box(PAL.dark, [0.03, 0.16, 0.5], [sx * (W + 0.01), -0.02, -0.75]);
    k.box(PAL.amber, [0.2, 0.05, 0.03], [sx * 0.62, -H + 0.2, L + 0.005], undefined, { emissive: 0.9 });
  }
  k.box(PAL.dark, [1.0, 0.1, 0.04], [0, -H + 0.2, L + 0.004]);
  k.box(PAL.tail, [2 * W - 0.3, 0.1, 0.04], [0, 0.12, -L - 0.005], undefined, { emissive: 1 });
  k.box(PAL.dark, [0.5, 0.12, 0.04], [0, -0.06, -L - 0.006]);
  plate(k, "VIPER", [0, -0.06, -L - 0.05], false, 0.38, 0.12);
  const bf = b.panel("bumperF", 0.32);
  bf.box(C.trim, [2 * W - 0.1, 0.06, 0.32], [0, -H + 0.02, L - 0.1]);
  b.panel("bumperR", 0.66).box(C.trim, [2 * W - 0.2, 0.1, 0.18], [0, -H + 0.06, -L + 0.0]);
  door(b, "doorL", 0.6, -1, W, -H + 0.14, H - 0.12, -0.6, 0.5, C.body, -0.45);
  door(b, "doorR", 0.8, 1, W, -H + 0.14, H - 0.12, -0.6, 0.5, C.body, -0.45);
  mirrors(k, W - 0.2, H + 0.02, hoodA[0] - 0.1, C.body, 0.9);
  for (const sx of SIDES) k.cyl(PAL.chrome, { d: 0.1, h: 0.22, tess: 8 }, [sx * 0.35, -H + 0.06, -L - 0.02], [Math.PI / 2, 0, 0]);
  arches(b, W, C.trim, -H, 0.1);

  return {
    side: { x: W, y0: -H + 0.1, y1: H - 0.12, z0: -L + 0.3, z1: L - 0.4 },
    front: { z: L, y0: -H, y1: -H + 0.4, halfW: W },
    rear: { z: -L, y0: -H, y1: H, halfW: W },
    roof: { y: cab.roofY, z0: -0.82, z1: -0.34, halfW: W - 0.2 },
    hood: { p0: hoodA, p1: hoodB, halfW: W - 0.15 },
    windshield: cab.windshield,
    sideWindows: cab.windows,
    boost: [0, H + 0.14, -L + 0.55],
    boostLen: 1.2,
    weapon: [0, cab.roofY, -0.58],
    exhaust: [0.35, -H + 0.06, -L - 0.14],
    smoke: [0, H - 0.15, L - 0.8],
    cans: [
      { pos: [-(W - 0.3), H - 0.02, -L + 0.75], rotY: Math.PI / 2 },
      { pos: [W - 0.3, H - 0.02, -L + 0.75], rotY: Math.PI / 2 },
      { pos: [-(W - 0.32), cab.roofY + 0.06, -0.58], rotY: 0 },
      { pos: [W - 0.32, cab.roofY + 0.06, -0.58], rotY: 0 },
    ],
    collision: [{ center: [0, 0, 0], size: [2 * W, 2 * H, 2 * L] }, cab.box],
  };
}

// ---------------------------------------------------------------------------
// Bulwark: armored cash truck with slit windows, rivets and rear vault doors.

function armored(b: BodyBuild): CarFrame {
  const { kit: k, def } = b;
  const C = def.colors;
  const W = def.size.width / 2;
  const H = def.size.height / 2;
  const L = def.size.length / 2;
  const sillY = -H + 0.6;
  const boxFront = 1.0;
  const boxTop = H + 0.15;
  const dark = shade(C.body, -0.3);
  // lower chassis
  k.prism(dark, [[-L + 0.1, -H], [L - 0.1, -H], [L, -H + 0.12], [L, sillY], [-L, sillY], [-L, -H + 0.1]], 2 * W, 0.1);
  // vault box
  k.prism(C.body, [[-L + 0.04, sillY - 0.02], [boxFront, sillY - 0.02], [boxFront, boxTop], [-L + 0.04, boxTop]], 2 * W, 0.14);
  // cab nose
  const hoodA: P2 = [boxFront + 0.95, sillY + 0.62];
  const hoodB: P2 = [L - 0.1, sillY + 0.45];
  k.prism(C.body, [[boxFront - 0.05, sillY - 0.02], [L, sillY - 0.02], [L, hoodB[1] - 0.1], hoodB, hoodA, [boxFront - 0.05, hoodA[1]]], 2 * W - 0.16, 0.12);
  const cab = cabin(b, {
    y0: hoodA[1], y1: hoodA[1] + 0.6, zb0: boxFront - 0.05, zb1: hoodA[0], zt0: boxFront - 0.05, zt1: hoodA[0] - 0.4,
    width: 2 * W - 0.2, roof: 0.1, color: C.body, pillar: 0.14,
  });
  // armored slats over the windshield
  const ws = cab.windshield;
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const z = lerp(ws.bottom[0], ws.top[0], t) + 0.05;
    const y = lerp(ws.bottom[1], ws.top[1], t) + 0.03;
    k.box(dark, [2 * ws.halfW, 0.07, 0.06], [0, y, z]);
  }
  // gold stripe + rivets
  k.decals(() => {
    for (const sx of SIDES) {
      k.box(C.accent, [0.03, 0.14, L + boxFront - 0.3], [sx * (W + 0.045), 0.35, (boxFront - L) / 2]);
      for (let z = -L + 0.3; z < boxFront - 0.1; z += 0.42) {
        for (const y of [sillY + 0.12, boxTop - 0.12]) k.box(dark, [0.04, 0.06, 0.06], [sx * (W + 0.045), y, z]);
      }
    }
  });
  // vault doors at the back (they blow open)
  for (const sx of SIDES) {
    const p = b.panel(sx < 0 ? "vaultL" : "vaultR", sx < 0 ? 0.62 : 0.8);
    p.box(shade(C.body, 0.06), [W - 0.08, boxTop - sillY - 0.12, 0.06], [sx * (W / 2 - 0.02), (sillY + boxTop) / 2, -L - 0.005]);
    p.box(PAL.chrome, [0.06, 0.4, 0.05], [sx * 0.12, (sillY + boxTop) / 2, -L - 0.04]);
  }
  // roof hatch + gold light bar
  k.cyl(dark, { d: 0.6, h: 0.1, tess: 8 }, [0, boxTop + 0.04, -L + 1.0]);
  k.box(PAL.dark, [1.4, 0.08, 0.18], [0, cab.roofY + 0.04, (ws.top[0] + boxFront) / 2]);
  for (const x of [-0.5, 0, 0.5]) k.box(PAL.amber, [0.3, 0.1, 0.16], [x, cab.roofY + 0.11, (ws.top[0] + boxFront) / 2], undefined, { emissive: 1 });
  // face: grille, square lights, bull bar
  k.box(PAL.dark, [1.3, 0.34, 0.05], [0, sillY + 0.22, L + 0.005]);
  for (let i = 0; i < 4; i++) k.box(dark, [0.06, 0.36, 0.07], [-0.45 + i * 0.3, sillY + 0.22, L + 0.015]);
  for (const sx of SIDES) {
    k.box(PAL.head, [0.26, 0.18, 0.05], [sx * 0.85, sillY + 0.25, L + 0.006], undefined, { emissive: 1.1 });
    for (let i = 0; i < 2; i++) k.box(PAL.dark, [0.03, 0.2, 0.06], [sx * 0.85 + (i - 0.5) * 0.12, sillY + 0.25, L + 0.025]);
    k.box(PAL.tail, [0.18, 0.26, 0.05], [sx * (W - 0.15), sillY + 0.2, -L - 0.03], undefined, { emissive: 1 });
  }
  const bf = b.panel("bumperF", 0.35);
  bf.box(PAL.dark, [2 * W + 0.1, 0.3, 0.3], [0, -H + 0.2, L + 0.1]);
  for (const sx of SIDES) bf.bar(PAL.dark, [sx * 0.6, -H + 0.3, L + 0.22], [sx * 0.6, sillY + 0.45, L + 0.12], 0.1, undefined, true);
  bf.bar(PAL.dark, [-0.7, sillY + 0.45, L + 0.12], [0.7, sillY + 0.45, L + 0.12], 0.1, undefined, true);
  b.panel("bumperR", 0.7).box(PAL.dark, [2 * W + 0.06, 0.26, 0.26], [0, -H + 0.18, -L - 0.08]);
  b.panel("hood", 0.5).slab(C.body, hoodA, hoodB, 2 * W - 0.34, 0.05, 0, 0.005);
  door(b, "doorL", 0.55, -1, W - 0.08, sillY + 0.02, hoodA[1] + 0.25, boxFront + 0.05, hoodA[0] - 0.05, C.body, boxFront + 0.25);
  plate(k, "CASH-1", [0.65, -H + 0.18, -L - 0.25], false);
  mirrors(k, W - 0.1, hoodA[1] + 0.2, hoodA[0] - 0.12, PAL.dark, 1.5);
  k.cyl(PAL.dark, { d: 0.14, h: 0.3, tess: 8 }, [-0.7, -H + 0.06, -L], [Math.PI / 2, 0, 0]);
  arches(b, W, PAL.dark, -H, 0.16);

  return {
    side: { x: W, y0: sillY + 0.05, y1: boxTop - 0.1, z0: -L + 0.2, z1: boxFront - 0.1 },
    front: { z: L, y0: -H, y1: hoodB[1], halfW: W },
    rear: { z: -L, y0: -H, y1: boxTop, halfW: W },
    roof: { y: boxTop, z0: -L + 0.25, z1: boxFront - 0.15, halfW: W - 0.12 },
    hood: { p0: hoodA, p1: hoodB, halfW: W - 0.2 },
    windshield: cab.windshield,
    sideWindows: cab.windows,
    boost: [0, boxTop + 0.32, -L + 0.95],
    boostLen: 2.0,
    weapon: [0, boxTop, -0.4],
    exhaust: [-0.7, -H + 0.06, -L - 0.16],
    smoke: [0, hoodA[1], L - 0.6],
    cans: [
      { pos: [-(W - 0.25), boxTop + 0.06, 0.4], rotY: 0 },
      { pos: [W - 0.25, boxTop + 0.06, 0.4], rotY: 0 },
      { pos: [-(W - 0.25), boxTop + 0.06, -0.1], rotY: 0 },
      { pos: [W - 0.25, boxTop + 0.06, -0.1], rotY: 0 },
    ],
    collision: [
      { center: [0, (-H + boxTop) / 2, (boxFront - L) / 2], size: [2 * W, boxTop + H, boxFront + L] },
      { center: [0, (-H + hoodA[1]) / 2, (boxFront + L) / 2], size: [2 * W, hoodA[1] + H, L - boxFront] },
      cab.box,
    ],
  };
}

export const BODIES: Record<CarId, (b: BodyBuild) => CarFrame> = { hatchback, pickup, bus, coupe, armored };

