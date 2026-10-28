// Office chair that really rolls: five-star aluminium base (hub + 5 legs), five casters (plastic
// hood on a swivel hinge in the leg tip, rubber wheel on a two-pivot axle hinge with a little
// friction for rolling resistance), steel gas cylinder (outer tube press-fitted into the hub,
// chromed piston), tilt mechanism on a free seat-swivel hinge, ribbed plastic seat pan with a
// foam cushion, steel back bar, plastic back shell + cushion, two armrests (steel bracket,
// plastic post, polyurethane pad). Kick it across the room, spin it, rip the casters off.
// Local frame: origin on the floor at the centre, seat front at +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { boxR, finish, mk, softBlock, PAL, type BaseOpts } from "./common.ts";

export interface OfficeChairOpts extends BaseOpts {
  tint?: number;
  fabric?: number;
  /** "jointed" (default): rolling/swivelling casters; "fixed": wheels bonded rigidly (cheaper). */
  casters?: "jointed" | "fixed";
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
  const tipY = 0.068; // underside of the leg tips (caster sockets)
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
  // ---- casters: hood on a swivel (vertical) hinge, wheel on an axle hinge
  const wheelR = 0.024,
    wheelW = 0.034;
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
      // trail: wheel centre 18 mm inwards (towards the hub) from the swivel axis
      const tr = -0.018;
      hood = b.hull(
        "hood",
        "plastic",
        "plastic",
        [
          [-0.012, 2 * wheelR, tr - 0.028],
          [0.012, 2 * wheelR, tr - 0.028],
          [-0.012, 2 * wheelR, 0.014],
          [0.012, 2 * wheelR, 0.014],
          [-0.009, tipY - 0.001, tr - 0.016],
          [0.009, tipY - 0.001, tr - 0.016],
          [-0.009, tipY - 0.001, 0.01],
          [0.009, tipY - 0.001, 0.01],
        ],
        [0, 0, 0],
        { tint: PAL.black, mass: 0.07 },
      );
      wheel = b.cyl("wheel", "rubber", "rubber", wheelR, wheelW, [0, wheelR, tr], { axis: "x", segments: 12, tint: 0x2a2a2a, mass: 0.07 });
      if (jointed) {
        b.hinge(wheel, hood, { pivots: [[-wheelW / 2, wheelR, tr], [wheelW / 2, wheelR, tr]], axis: [1, 0, 0], min: -180, max: 180, friction: 0.03, strength: 40 });
      } else b.bond(wheel, hood, "press", { strength: 40 });
    });
    if (jointed) b.hinge(hood, legs[k], { pivots: [[sx, tipY, sz]], axis: [0, 1, 0], min: -180, max: 180, friction: 0.02, strength: 60 });
    else b.bond(hood, legs[k], "press", { strength: 60 });
    void wheel;
  }
  // ---- gas cylinder + seat swivel
  // the outer tube sits 15 mm deep in the hub's tapered bore
  const outer = b.cyl("gas_outer", "steel", "metal_black", 0.025, 0.2, [0, hubY1 - 0.015 + 0.1, 0], { segments: 12, tint, mass: 0.9 });
  b.press(outer, hub, 220);
  const pistonY0 = hubY1 - 0.015 + 0.2;
  const piston = b.cyl("gas_piston", "steel", "chrome", 0.014, 0.12, [0, pistonY0 + 0.06, 0], { segments: 10, mass: 0.35 });
  b.press(piston, outer, 160);
  const mechY0 = pistonY0 + 0.12;
  const mech = boxR(b, "mechanism", "steel", "metal_black", [-0.1, 0.1], [mechY0, mechY0 + 0.03], [-0.1, 0.1], { mass: 1.6, tess: 0 });
  if (jointed) b.hinge(mech, piston, { pivots: [[0, mechY0, 0]], axis: [0, 1, 0], min: -180, max: 180, friction: 0.25, strength: 120 });
  else b.press(mech, piston, 120);
  // ---- seat
  const panY0 = mechY0 + 0.03;
  const pan = boxR(b, "seat_pan", "plastic", "plastic", [-0.24, 0.24], [panY0, panY0 + 0.015], [-0.23, 0.23], { tint, mass: 1.2 });
  b.screw(pan, mech, 4, 35);
  const cushion = softBlock(b, "seat_cushion", "foam", "fabric_upholstery", [0.48, 0.07, 0.47], 0.3, [0, panY0 + 0.015 + 0.035, 0.005], { tint: fabric, mass: 0.7 }, 4);
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
