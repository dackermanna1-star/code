// Bathroom vanity (800 × 460 mm, counter 850 mm): a 16 mm laminated particleboard carcass with
// an open back (plumbing), a recessed toe kick, a back rail screwed to the wall, two 18 mm MDF
// doors on concealed hinges with magnetic catches and chrome knobs, and a one-piece vitreous
// china vanity top with an integrated basin (rounded-rectangle bowl of fused convex tiles, flat
// deck pieces around it) bedded on silicone.
//
// Plumbing: a chrome single-lever basin mixer (water feature on the spout — use it to run the
// tap), two braided supply hoses down to the angle valves in the wall (water features: rip the
// vanity out and they spray), a chrome drain flange, PVC tailpiece and P-trap into the wall drain.
//
// Frame: origin on the floor at the centre of the footprint, doors +Z, wall side −Z
// (back of the top at z = −0.23). ~37 kg.

import { cabinetCarcass, hingedDoorPanel } from "../lib/kit.ts";
import { basinShell, boxR, bondTouching, finish, mk, CHROME, tubeKgPerM, type BaseOpts } from "../utility/helpers.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface VanityOpts extends BaseOpts {
  /** Carcass laminate colour. */
  tint?: number;
  /** China colour. */
  topTint?: number;
  /** Angle-valve positions (local x of cold/hot), height, and protrusion from the wall plane. */
  valveX?: [number, number];
  valveY?: number;
  /** Drain stub height. */
  drainY?: number;
}

export const VANITY = {
  w: 0.8,
  d: 0.46,
  topY: 0.85,
  /** Distance from the back of the top to the wall plane the hoses/trap run to. */
  wallGap: 0.015,
} as const;

export function buildVanity(o: VanityOpts = {}): AssemblyDef {
  const b = mk("bathVanity", "Bathroom Vanity", "furniture", 390, o);
  const tint = o.tint ?? 0xf2f0ea;
  const china = o.topTint ?? 0xf8f8f5;
  const W = VANITY.w,
    D = VANITY.d;
  const yTop = VANITY.topY;
  const deckT = 0.02;
  const yDeck = yTop - deckT; // 0.83: carcass height, underside of the deck
  const zBack = -D / 2;
  const wallZ = zBack - VANITY.wallGap;

  // ------------------------------------------------------------------ carcass (open back)
  const cw = W - 0.02,
    cd = 0.44;
  const carc = cabinetCarcass(
    b,
    "carcass",
    { w: cw, h: yDeck, d: cd, t: 0.016, tint, back: false, toeKick: { h: 0.08, setback: 0.05 }, top: "none", joinery: "screw" },
    [0, 0, zBack + cd / 2],
  );
  const innerX = cw / 2 - 0.016;
  const rail = boxR(b, "rail_back", "particleboard", "laminate_white", [-innerX, innerX], [yDeck - 0.03, yDeck], [zBack, zBack + 0.03], { tint });
  b.screw(rail, carc.left, 2, 30);
  b.screw(rail, carc.right, 2, 30);
  // screwed through the rail into the wall studs: the vanity's anchor
  b.world(rail, "screw", 80, [0, yDeck - 0.01, zBack]);

  // ------------------------------------------------------------------ doors
  const doorW = (cw - 0.006) / 2;
  const doorH = yDeck - 0.08 - 0.012;
  const zDoor = zBack + cd + 0.009;
  const knobSpec = { kind: "knob" as const, mat: CHROME.mat, surf: CHROME.surf, tint: CHROME.tint };
  // kit: hinge "right" = hinges at -X (left door's outer edge), "left" = +X
  hingedDoorPanel(b, "door_l", { w: doorW, h: doorH, t: 0.018, kind: "solid", mat: "mdf", surf: "laminate_white", tint, hinge: "right", fixed: carc.left, handle: knobSpec, openDeg: 105 }, [
    -(doorW / 2 + 0.0015),
    0.084,
    zDoor,
  ]);
  hingedDoorPanel(b, "door_r", { w: doorW, h: doorH, t: 0.018, kind: "solid", mat: "mdf", surf: "laminate_white", tint, hinge: "left", fixed: carc.right, handle: knobSpec, openDeg: 105 }, [
    doorW / 2 + 0.0015,
    0.084,
    zDoor,
  ]);

  // ------------------------------------------------------------------ china top with integrated basin
  const bzc = 0.03; // basin set towards the front, leaving a deck strip for the mixer
  const top = basinShell(b, "top", {
    top: { hx: 0.235, hz: 0.165, r: 0.1, y: yDeck, cz: bzc },
    bottom: { hx: 0.155, hz: 0.1, r: 0.07, y: yDeck - 0.14, cz: bzc },
    t: 0.011,
    tb: 0.011,
    corner: 2,
    deck: { hx: W / 2, hz: D / 2, t: deckT },
    mat: "ceramic",
    surf: "ceramic_glaze",
    tint: china,
  });
  // bedded on silicone on the side panels and the back rail
  for (const p of top.deck) bondTouching(b, p, [carc.left, carc.right, rail], "glue", 40, 0.0015, 0);

  // ------------------------------------------------------------------ mixer tap on the back deck strip
  const fz = zBack + 0.045;
  const deckUnder = top.deck.find((p) => pointIn(b, p, 0, fz)) ?? top.deck[0];
  const base = b.cyl("faucet_base", CHROME.mat, CHROME.surf, 0.026, 0.008, [0, yTop + 0.004, fz], { segments: 14, mass: 0.12 });
  const body = b.cyl("faucet_body", CHROME.mat, CHROME.surf, 0.02, 0.13, [0, yTop + 0.008 + 0.065, fz], { segments: 14, mass: 0.75 });
  const lever = boxR(b, "faucet_lever", CHROME.mat, CHROME.surf, [-0.007, 0.007], [yTop + 0.138, yTop + 0.15], [fz - 0.03, fz + 0.045], { mass: 0.07 });
  b.screw(base, deckUnder, 2, 30);
  b.screw(body, base, 1, 60);
  b.press(lever, body, 15);
  const spout = b.tube(
    "faucet_spout",
    CHROME.mat,
    CHROME.surf,
    [
      [0, yTop + 0.115, fz + 0.018],
      [0, yTop + 0.115, fz + 0.105],
      [0, yTop + 0.095, fz + 0.128],
    ],
    0.0095,
    { sides: 10, kgPerM: tubeKgPerM(0.019, 0.002, 7850), jointStrength: 100 },
  );
  b.bolt(spout[0], body, 80);
  for (const s of spout) b.tag(s, "faucet");
  b.water(spout[spout.length - 1], [0, yTop + 0.088, fz + 0.13], [0, -1, 0], 0.7);

  // ------------------------------------------------------------------ supply hoses to the wall valves
  const [vxC, vxH] = o.valveX ?? [-0.1, 0.1];
  const vy = o.valveY ?? 0.55;
  const vz = wallZ + 0.05; // valve outlets ~5 cm proud of the wall
  for (const [k, xv, xs] of [
    ["c", vxC, -0.012],
    ["h", vxH, 0.012],
  ] as Array<[string, number, number]>) {
    const hose = b.tube(
      `hose_${k}`,
      "steel",
      "chrome",
      [
        [xs, yDeck - 0.0005, fz],
        [xs, yDeck - 0.06, fz],
        [xs + (xv - xs) * 0.3, yDeck - 0.14, fz - 0.002],
        [xv, vy + 0.05, vz],
        [xv, vy + 0.032, vz],
      ],
      0.0045,
      { sides: 6, kgPerM: 0.12, jointStrength: 40 },
    );
    bondTouching(b, hose[0], [deckUnder], "screw", 30, 0.002);
    b.world(hose[hose.length - 1], "screw", 30, [xv, vy + 0.032, vz]);
    b.water(hose[hose.length - 1], [xv, vy + 0.035, vz], [0, 0.4, 1], 0.7);
  }

  // ------------------------------------------------------------------ drain + P-trap
  const yBotIn = yDeck - 0.14;
  const drain = b.cyl("drain", CHROME.mat, CHROME.surf, 0.028, 0.004, [0, yBotIn + 0.002, 0], { segments: 12, mass: 0.08 });
  b.screw(drain, top.bottom, 1, 30);
  const dy = o.drainY ?? 0.45;
  const trap = b.tube(
    "trap",
    "plastic",
    "plastic",
    [
      [0, yBotIn - 0.0115, 0],
      [0, dy + 0.08, 0],
      [0, dy + 0.01, -0.035],
      [0, dy + 0.04, -0.075],
      [0, dy + 0.006, -0.13],
      [0, dy, wallZ + 0.005],
    ],
    0.016,
    { sides: 8, tint: 0xeeeeea, kgPerM: 0.3, jointStrength: 35 },
  );
  bondTouching(b, trap[0], [top.bottom], "screw", 40, 0.002);
  b.world(trap[trap.length - 1], "press", 25, [0, dy, wallZ + 0.005]);

  return finish(b, o);
}

/** True when the plan point (x, z) lies within the part's AABB footprint. */
function pointIn(b: ReturnType<typeof mk>, part: string, x: number, z: number): boolean {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const v of b.get(part).poly.verts) {
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    z0 = Math.min(z0, v.z);
    z1 = Math.max(z1, v.z);
  }
  return x >= x0 && x <= x1 && z >= z0 && z <= z1;
}
