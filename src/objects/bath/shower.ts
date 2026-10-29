// Bath-shower plumbing on the tiled wall and the hinged tempered-glass bath screen.
//
// showerSet: an exposed chrome bar mixer (hollow brass body on two S-union elbows threaded into
// the concealed supply pipes, with wall rosettes), temperature + flow handles, a diverter, a tub
// spout (use it to run the bath), a stainless spiral hose hanging in a loop up to a hand shower
// parked in a slide holder on a chrome riser rail screwed to the wall. Water features on the
// spout and the hand shower (toggle with use) and on both unions — rip the mixer off and the
// supply pipes behind it spray.
//
// showerScreen: an 6 mm toughened glass panel clamped in two chrome hinges on an aluminium wall
// channel, a rubber sweep seal along the bottom and a through-bolted knob. Swings out of the tub
// (and a little in). Toughened glass: when it goes, it dices into hundreds of cubes.
//
// Wall-mounted frame convention for both: origin on the wall plane at floor level (y = 0 is
// the finished floor for showerSet; for showerScreen y = 0 is the bottom of the sweep seal),
// +Z points out of the wall into the room, X runs along the wall.

import { hingeAxis } from "../lib/kit.ts";
import { boxR, finish, mk, tubeKgPerM, CHROME, type BaseOpts } from "../utility/helpers.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface ShowerSetOpts extends BaseOpts {
  /** Mixer centre height above the floor (default 0.80: ~24 cm above the tub rim). */
  mixerY?: number;
  /** Riser rail span (bottom/top heights). */
  railY?: [number, number];
  /** Rail position along the wall (local x, default +0.18). */
  railX?: number;
}

export function buildShowerSet(o: ShowerSetOpts = {}): AssemblyDef {
  const b = mk("showerSet", "Bath Shower Mixer", "fixture", 260, o);
  const my = o.mixerY ?? 0.8;
  const [ry0, ry1] = o.railY ?? [1.15, 1.95];
  const rx = o.railX ?? 0.18;
  const bodyZ = 0.075; // mixer bar axis distance from the wall

  // ------------------------------------------------------------------ bar mixer
  const roses: string[] = [];
  const unions: string[] = [];
  for (const [k, x] of [
    ["l", -0.075],
    ["r", 0.075],
  ] as Array<[string, number]>) {
    const rose = b.cyl(`rose_${k}`, CHROME.mat, CHROME.surf, 0.03, 0.008, [x, my, 0.004], { axis: "z", segments: 14, mass: 0.06 });
    const union = b.cyl(`union_${k}`, CHROME.mat, CHROME.surf, 0.0115, bodyZ - 0.008 - 0.026 + 0.002, [x, my, 0.008 + (bodyZ - 0.026 - 0.006) / 2], {
      axis: "z",
      segments: 10,
      mass: 0.12,
    });
    b.screw(union, rose, 1, 30);
    // threaded into the concealed supply elbow: the mixer's real anchor
    b.world(union, "bolt", 140, [x, my, 0.008]);
    b.world(rose, "screw", 12, [x, my, 0]);
    roses.push(rose);
    unions.push(union);
  }
  // hollow cast-brass body
  const body = b.cyl("mixer_body", CHROME.mat, CHROME.surf, 0.026, 0.26, [0, my, bodyZ], { axis: "x", segments: 16, mass: 1.5 });
  for (const u of unions) b.bolt(u, body, 120);
  const hTemp = b.cyl("mixer_temp", CHROME.mat, CHROME.surf, 0.024, 0.04, [-0.15, my, bodyZ], { axis: "x", segments: 14, mass: 0.14 });
  const hFlow = b.cyl("mixer_flow", CHROME.mat, CHROME.surf, 0.024, 0.04, [0.15, my, bodyZ], { axis: "x", segments: 14, mass: 0.14 });
  b.press(hTemp, body, 25);
  b.press(hFlow, body, 25);
  const diverter = b.cyl("mixer_diverter", CHROME.mat, CHROME.surf, 0.009, 0.022, [0, my + 0.026 + 0.011, bodyZ], { segments: 8, mass: 0.03 });
  b.press(diverter, body, 8);
  // tub spout (run the bath with the use key)
  const spout = b.tube(
    "spout",
    CHROME.mat,
    CHROME.surf,
    [
      [0, my - 0.004, bodyZ + 0.02],
      [0, my - 0.012, bodyZ + 0.15],
      [0, my - 0.03, bodyZ + 0.18],
    ],
    0.011,
    { sides: 10, kgPerM: tubeKgPerM(0.022, 0.002, 7850), jointStrength: 120 },
  );
  b.bolt(spout[0], body, 90);
  for (const s of spout) b.tag(s, "faucet");
  const outlet = [0, my - 0.036, bodyZ + 0.181] as [number, number, number];
  b.water(spout[spout.length - 1], outlet, [0, -1, 0], 0.7);
  // hidden supply behind the mixer: a ripped-out mixer sprays from the wall
  b.water(unions[0], [-0.075, my, 0.01], [0, 0.2, 1], 0.85);
  b.water(unions[1], [0.075, my, 0.01], [0, 0.2, 1], 0.85);

  // ------------------------------------------------------------------ riser rail + hand shower
  const railZ = 0.045;
  const brackets: string[] = [];
  for (const [k, y] of [
    ["lo", ry0 + 0.05],
    ["hi", ry1 - 0.05],
  ] as Array<[string, number]>) {
    const br = b.cyl(`rail_bracket_${k}`, CHROME.mat, CHROME.surf, 0.011, railZ - 0.0125, [rx, y, (railZ - 0.0125) / 2], { axis: "z", segments: 10, mass: 0.05 });
    b.world(br, "screw", 35, [rx, y, 0]);
    brackets.push(br);
  }
  const rail = b.cyl("rail", CHROME.mat, CHROME.surf, 0.0125, ry1 - ry0, [rx, (ry0 + ry1) / 2, railZ], { segments: 12, mass: tubeKgPerM(0.025, 0.001, 7850) * (ry1 - ry0) });
  for (const br of brackets) b.screw(br, rail, 1, 30);
  const holderY = ry1 - 0.2;
  const holder = boxR(b, "holder", "plastic", "chrome", [rx - 0.02, rx + 0.02], [holderY - 0.025, holderY + 0.025], [railZ + 0.0125, railZ + 0.05], { mass: 0.06 });
  b.press(holder, rail, 18);
  // hand shower parked in the holder, head tilted out over the tub
  const handle = b.cyl("handshower_grip", "plastic", "chrome", 0.0135, 0.17, [rx, holderY - 0.03, railZ + 0.064], { segments: 10, rot: [12, 0, 0], mass: 0.16 });
  const head = b.cyl("handshower_head", "plastic", "chrome", 0.048, 0.024, [rx, holderY + 0.075, railZ + 0.085], {
    segments: 14,
    rot: [80, 0, 0],
    capSurf: "vent_grille",
    mass: 0.14,
  });
  b.press(handle, holder, 8);
  b.glue(head, handle, 40);
  b.tag(head, "faucet");
  b.water(head, [rx, holderY + 0.075, railZ + 0.1], [0, -0.55, 0.85], 0.6);

  // stainless spiral hose: from the mixer outlet down in a loop and up to the grip
  const hoseTop = holderY - 0.03 - 0.085 * Math.cos((12 * Math.PI) / 180);
  const hose = b.tube(
    "hose",
    "steel",
    "chrome",
    [
      [0.06, my - 0.026, bodyZ],
      [0.07, my - 0.13, bodyZ + 0.004],
      [0.12, my - 0.18, bodyZ + 0.008],
      [rx - 0.005, my - 0.13, bodyZ + 0.008],
      [rx, my + 0.15, railZ + 0.05],
      [rx, hoseTop - 0.004, railZ + 0.064 - 0.085 * Math.sin((12 * Math.PI) / 180)],
    ],
    0.0065,
    { sides: 6, kgPerM: 0.24, jointStrength: 45 },
  );
  b.screw(hose[0], body, 1, 35);
  b.press(hose[hose.length - 1], handle, 30);

  return finish(b, o);
}

export interface ShowerScreenOpts extends BaseOpts {
  /** Panel width (along the tub) and glass height. */
  w?: number;
  h?: number;
  /** Glass thickness (6 or 8 mm). */
  t?: number;
  /**
   * How far (degrees) the panel may swing back INTO the tub. Keep it short of the shower mixer
   * and the back wall tiles so the joint limit, not tempered glass against chrome, stops it
   * (the placement computes it from the mixer's position). Default 20°, clamped to 0–60°.
   */
  inward?: number;
}

export const SHOWER_SCREEN = { w: 0.78, h: 1.4, t: 0.006, seal: 0.008, profileD: 0.025 } as const;

export function buildShowerScreen(o: ShowerScreenOpts = {}): AssemblyDef {
  const b = mk("showerScreen", "Glass Bath Screen", "fixture", 320, o);
  const w = o.w ?? SHOWER_SCREEN.w;
  const h = o.h ?? SHOWER_SCREEN.h;
  const t = o.t ?? SHOWER_SCREEN.t;
  const seal = SHOWER_SCREEN.seal;
  const pd = SHOWER_SCREEN.profileD;
  const z0 = pd + 0.005; // glass edge, 5 mm in front of the wall channel
  const y0 = seal;
  const inward = Math.min(60, Math.max(0, o.inward ?? 20));

  // aluminium wall channel (screwed through the tiles into plugs)
  const profile = boxR(b, "profile", "aluminum", "aluminum", [-0.012, 0.012], [0, h + seal + 0.02], [0, pd], { tess: 0, mass: 0.55 });
  b.world(profile, "screw", 105, [0, (h + seal) / 2, 0]);
  // toughened glass panel
  const glass = boxR(b, "glass", "temperedGlass", "glass", [-t / 2, t / 2], [y0, y0 + h], [z0, z0 + w], {
    faces: { pz: { surf: "glass_edge" }, nz: { surf: "glass_edge" }, py: { surf: "glass_edge" }, ny: { surf: "glass_edge" } },
  });
  const sweep = boxR(b, "seal", "rubber", "rubber", [-0.004, 0.004], [0, y0], [z0, z0 + w], { tint: 0xd8dde0, mass: 0.05 });
  b.clip(sweep, glass, 10);

  // two clamp hinges: plates either side of the glass + a knuckle against the channel
  const axis = hingeAxis([0, 0, 1], [1, 0, 0]); // free edge along +Z, opens towards +X (out of the tub)
  let group: string | undefined;
  for (const [k, yh] of [
    ["lo", y0 + 0.25],
    ["hi", y0 + h - 0.25],
  ] as Array<[string, number]>) {
    const po = boxR(b, `hinge_${k}_out`, CHROME.mat, CHROME.surf, [t / 2, t / 2 + 0.008], [yh - 0.03, yh + 0.03], [z0, z0 + 0.045], { tess: 0, mass: 0.12 });
    const pi = boxR(b, `hinge_${k}_in`, CHROME.mat, CHROME.surf, [-t / 2 - 0.008, -t / 2], [yh - 0.03, yh + 0.03], [z0, z0 + 0.045], { tess: 0, mass: 0.12 });
    const knuckle = boxR(b, `hinge_${k}_knuckle`, CHROME.mat, CHROME.surf, [-t / 2 - 0.008, t / 2 + 0.008], [yh - 0.03, yh + 0.03], [pd, z0], { tess: 0, mass: 0.1 });
    b.bolt(po, glass, 100);
    b.bolt(pi, glass, 100);
    b.weld(knuckle, po, 150);
    b.weld(knuckle, pi, 150);
    group = b.hinge(knuckle, profile, { pivots: [[0, yh, pd]], axis: [axis.x, axis.y, axis.z], min: -inward, max: 90, strength: 60, friction: 0.08, group });
  }
  // through-bolted knob pair near the free edge
  const ky = y0 + 0.62 * h;
  const kz = z0 + w - 0.06;
  const kOut = b.cyl("knob_out", CHROME.mat, CHROME.surf, 0.012, 0.025, [t / 2 + 0.0125, ky, kz], { axis: "x", segments: 12, mass: 0.05 });
  const kIn = b.cyl("knob_in", CHROME.mat, CHROME.surf, 0.012, 0.025, [-t / 2 - 0.0125, ky, kz], { axis: "x", segments: 12, mass: 0.05 });
  b.bolt(kOut, glass, 40);
  b.bolt(kIn, glass, 40);

  return finish(b, o);
}
