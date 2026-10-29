// Office chair that really rolls: five-star aluminium base (hub + 5 legs), five twin-wheel casters
// (plastic hood + stem pressed into the leg tip, rubber wheels turning on a ball joint, so they
// roll in any direction), steel gas cylinder (outer tube press-fitted into the hub,
// chromed piston), tilt mechanism on a free seat-swivel hinge, ribbed plastic seat pan with a
// foam cushion, steel back bar, plastic back shell + cushion, two armrests (steel bracket,
// plastic post, polyurethane pad). Kick it across the room, spin it, rip the casters off.
// Local frame: origin on the floor at the centre, seat front at +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { boxR, finish, mk, softBlock, softSlab, PAL, type BaseOpts } from "./common.ts";

export interface OfficeChairOpts extends BaseOpts {
  tint?: number;
  fabric?: number;
  /** "jointed" (default): rolling casters (ball joints); "fixed": wheels bonded rigidly (cheaper). */
  casters?: "jointed" | "fixed";
  /** Mass override (kg) of each caster hood and each wheel (default: hood 0.05, wheels from rubber ≈ 0.07). */
  casterKg?: number;
}

export const OFFICE_CHAIR = { r: 0.33, seatY: 0.555, backTop: 1.13 } as const;

export function buildOfficeChair(o: OfficeChairOpts = {}): AssemblyDef {
  const b = mk("officeChair", "Office Chair", "furniture", 260, o);
  const tint = o.tint ?? 0x222326;
  const fabric = o.fabric ?? 0x30343c;
  const jointed = (o.casters ?? "jointed") === "jointed";
  // ---- five-star base
  const hubY0 = 0.075,
    hubY1 = 0.135;
  const hub = b.cyl("hub", "aluminum", "aluminum", 0.036, hubY1 - hubY0, [0, (hubY0 + hubY1) / 2, 0], { segments: 12, tint: 0x9a9da2, mass: 0.35 });
  const rTip = 0.3;
  // The jointed wheels ride up into their hoods by 7–15 mm under the chair's weight (positional give
  // of the ball joints, see below): hoods and leg tips are built that much higher so the settled
  // wheels do not pass visibly through them (jointed bodies do not collide with each other).
  const CASTER_SAG = 0.017;
  const tipY = 0.072 + CASTER_SAG; // underside of the leg tips (caster sockets)
  const legs: string[] = [];
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (2 * Math.PI * k) / 5;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const px = -sa,
      pz = ca; // perpendicular (horizontal)
    const pts: Array<[number, number, number]> = [];
    const r0 = 0.03,
      w0 = 0.022,
      w1 = 0.017;
    for (const s of [-1, 1]) {
      pts.push([r0 * ca + s * w0 * px, 0.085, r0 * sa + s * w0 * pz]);
      pts.push([r0 * ca + s * w0 * px, 0.128, r0 * sa + s * w0 * pz]);
      pts.push([rTip * ca + s * w1 * px, tipY, rTip * sa + s * w1 * pz]);
      pts.push([rTip * ca + s * w1 * px, tipY + 0.024, rTip * sa + s * w1 * pz]);
    }
    const leg = b.hull(`leg${k}`, "aluminum", "aluminum", pts, [0, 0, 0], { tint: 0x9a9da2, mass: 0.45, tess: 0 });
    b.weld(leg, hub, 220); // one-piece cast base
    legs.push(leg);
  }
  // ---- casters: twin-wheel "ball" casters. A plastic hood (with its steel stem) is pressed into
  // each leg tip; under it the rubber wheel pair, modelled as one ball, turns on a ball joint at its
  // centre, so it rolls in any direction like a self-aligning caster. (A separate light swivel body
  // between the leg and an axle-hinged wheel is too compliant for the physics solver at a ~1:200
  // mass ratio: the casters folded and the chair sagged 5 cm. With the joint at the ball's centre
  // the floor load passes straight through the pivot and the joint carries no moment; the
  // remaining positional give is 7–15 mm, see tests/probes/content-bedrooms-settle.probe.ts.)
  //
  // NOTE: the builder has no ball joint. A hinge with ONE pivot becomes a ball-and-socket in the
  // runtime (destruction/runtime/graph.ts planJointConstraints: "1 intact → ball", the rule for a
  // door hanging on its last hinge); the axis and ±180° limits below are then unused. If that rule
  // changes, every caster turns into a one-axis wheel: tests/unit/content-bedrooms-objects.test.ts
  // and the settle probe assert the planned constraint kind. (Contract request: a builder ball().)
  const wheelR = 0.03; // 60 mm twin wheels (≈ 0.12 kg of rubber per caster)
  // Rolling shape: exactly 16 points (the physics hull limit, so nothing is decimated arbitrarily),
  // spread evenly over the sphere on a Fibonacci spiral from pole to pole. It rests on a face about
  // 0.85 R below its centre in any orientation, so it rolls the same way in every direction.
  const wheelPts: Array<[number, number, number]> = [];
  {
    const N = 16,
      ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = -1 + (2 * i) / (N - 1);
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      wheelPts.push([wheelR * r * Math.cos(ga * i), wheelR * y, wheelR * r * Math.sin(ga * i)]);
    }
  }
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (2 * Math.PI * k) / 5;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const yawDeg = (Math.atan2(ca, sa) * 180) / Math.PI; // local +Z → radial outward
    const sx = rTip * ca,
      sz = rTip * sa;
    let hood = "",
      wheel = "";
    b.group([sx, 0, sz], [0, yawDeg, 0], `caster${k}_`, () => {
      const yH = 2 * wheelR + 0.0008 + CASTER_SAG; // hood underside clears the settled wheels
      hood = b.hull(
        "hood",
        "plastic",
        "plastic",
        [
          [-0.014, yH, -0.022],
          [0.014, yH, -0.022],
          [-0.014, yH, 0.018],
          [0.014, yH, 0.018],
          [-0.009, tipY, -0.014],
          [0.009, tipY, -0.014],
          [-0.009, tipY, 0.01],
          [0.009, tipY, 0.01],
        ],
        [0, 0, 0],
        { tint: PAL.black, mass: o.casterKg ?? 0.05 },
      );
      wheel = b.hull("wheel", "rubber", "rubber", wheelPts, [0, wheelR, 0], { smooth: 1, tint: 0x2a2a2a, ...(o.casterKg !== undefined ? { mass: o.casterKg } : {}) });
      if (jointed) b.hinge(wheel, hood, { pivots: [[0, wheelR, 0]], axis: [1, 0, 0], min: -180, max: 180, strength: 40 });
      else b.bond(wheel, hood, "press", { strength: 40 });
    });
    b.press(hood, legs[k], 60); // stem in the leg's socket
    void wheel;
  }
  // ---- gas cylinder + seat swivel
  // the outer tube sits 15 mm deep in the hub's tapered bore (the hub is one convex boss, so the
  // tube is tagged as an insert; both carry mass overrides, so nothing is double-counted)
  const outer = b.cyl("gas_outer", "steel", "metal_black", 0.025, 0.2, [0, hubY1 - 0.015 + 0.1, 0], { segments: 12, tint, mass: 0.9, tags: ["inset"] });
  b.press(outer, hub, 220);
  const pistonY0 = hubY1 - 0.015 + 0.2;
  const piston = b.cyl("gas_piston", "steel", "chrome", 0.014, 0.12, [0, pistonY0 + 0.06, 0], { segments: 10, mass: 0.35 });
  b.press(piston, outer, 160);
  const mechY0 = pistonY0 + 0.12;
  const mech = boxR(b, "mechanism", "steel", "metal_black", [-0.1, 0.1], [mechY0, mechY0 + 0.03], [-0.1, 0.1], { mass: 1.6, tess: 0 });
  // seat swivel: bearings at the top and bottom of the piston (11.5 cm apart) so the seat and its
  // backrest lever do not tilt the joint
  if (jointed) b.hinge(mech, piston, { pivots: [[0, mechY0, 0], [0, mechY0 - 0.115, 0]], axis: [0, 1, 0], min: -180, max: 180, friction: 0.25, strength: 120 });
  else b.press(mech, piston, 120);
  // ---- seat
  const panY0 = mechY0 + 0.03;
  const pan = boxR(b, "seat_pan", "plastic", "plastic", [-0.24, 0.24], [panY0, panY0 + 0.015], [-0.23, 0.23], { tint, mass: 1.2 });
  b.screw(pan, mech, 4, 35);
  const cushion = softSlab(b, "seat_cushion", "foam", "fabric_upholstery", [0.48, 0.07, 0.47], 0.035, [0, panY0 + 0.015 + 0.035, 0.005], { tint: fabric, mass: 0.7 });
  b.glue(cushion, pan, 40);
  b.stuffing(cushion, "foam");
  // ---- back: steel bar (horizontal under the seat + upright), shell, cushion
  const barY0 = mechY0 + 0.004;
  const barH = boxR(b, "back_bar_low", "steel", "metal_black", [-0.025, 0.025], [barY0, barY0 + 0.008], [-0.3, -0.1], { tess: 0 });
  b.bolt(barH, mech, 90);
  const upY1 = 0.86;
  const barV = boxR(b, "back_bar_up", "steel", "metal_black", [-0.025, 0.025], [barY0, upY1], [-0.308, -0.3], { tess: 0 });
  b.weld(barV, barH, 120);
  const shellY0 = 0.62;
  const shell = boxR(b, "back_shell", "plastic", "plastic", [-0.22, 0.22], [shellY0, OFFICE_CHAIR.backTop], [-0.3, -0.288], { tint, mass: 1.0 });
  b.screw(shell, barV, 4, 30);
  const bCush = softBlock(b, "back_cushion", "foam", "fabric_upholstery", [0.42, 0.48, 0.05], 0.3, [0, (shellY0 + OFFICE_CHAIR.backTop) / 2 + 0.005, -0.288 + 0.025], { tint: fabric, mass: 0.5 }, 4);
  b.glue(bCush, shell, 30);
  b.stuffing(bCush, "foam");
  // ---- armrests
  for (const s of [-1, 1]) {
    const nm = s < 0 ? "l" : "r";
    const br = boxR(b, `arm_bracket_${nm}`, "steel", "metal_black", s < 0 ? [-0.275, -0.1] : [0.1, 0.275], [mechY0 + 0.006, mechY0 + 0.024], [-0.025, 0.025], { tess: 0 });
    b.bolt(br, mech, 70);
    const post = boxR(b, `arm_post_${nm}`, "plastic", "plastic", s < 0 ? [-0.29, -0.255] : [0.255, 0.29], [mechY0 + 0.024, 0.69], [-0.03, 0.03], { tint });
    b.screw(post, br, 2, 40);
    const pad = boxR(b, `arm_pad_${nm}`, "rubber", "rubber", s < 0 ? [-0.3, -0.245] : [0.245, 0.3], [0.69, 0.715], [-0.13, 0.11], { tint: 0x1d1d1f });
    b.screw(pad, post, 2, 25);
  }
  return finish(b, o);
}
