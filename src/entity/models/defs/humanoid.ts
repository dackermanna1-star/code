/**
 * Humanoid (Minecraft biped) model builder with two-segment "bendy" limbs (elbows, knees).
 * Bones: body (root, pivot at the hips), head, armR/foreR, armL/foreL, legR/shinR, legL/shinL.
 * The mob's right side is +X (it faces -Z).
 */
import { PX, type BoneDef, type BoxPrim, type ModelDef, type Painter, type PrimDef, type SlotDef, type V3 } from '../def';

export interface HumanoidOpts {
  key: string;
  paint: Painter;
  /** Sizes in Minecraft pixels. */
  head?: V3; // w, h, d
  body?: V3;
  arm?: [number, number, number]; // w, len, d
  leg?: [number, number, number];
  /** Arm attachment x (px from centre to the arm's centre). */
  armX?: number;
  /** Extra height of the body above the legs (px). */
  legLen?: number;
  /** Rounding radius (m). */
  r?: number;
  limbR?: number;
  headR?: number;
  /** Joint overlap of limb segments (m). */
  overlap?: number;
  /** Add a small nose bump (zombie/player). */
  nose?: false | { w: number; h: number; d: number; row: number };
  extra?: PrimDef[];
  slots?: Record<string, SlotDef>;
  density?: number;
  sss?: number;
  blood?: number;
  /** Mass (kg) for the ragdoll. */
  mass?: number;
  /** Skip the solid torso box (skeleton ribcage is built from extra prims). */
  noTorso?: boolean;
}

export interface HumanoidLayout {
  headBox: [V3, V3];
  bodyBox: [V3, V3];
  shoulderY: number;
  hipY: number;
  armX: number;
  legX: number;
  armLen: number;
  legLen: number;
}

export function humanoidLayout(o: HumanoidOpts): HumanoidLayout {
  const [hw, hh, hd] = o.head ?? [8, 8, 8];
  const [bw, bh, bd] = o.body ?? [8, 12, 4];
  const [aw, al] = o.arm ?? [4, 12, 4];
  const [lw, ll] = o.leg ?? [4, 12, 4];
  const legLen = o.legLen ?? ll;
  const hipY = legLen * PX;
  const neckY = hipY + bh * PX;
  const armX = (o.armX ?? bw / 2 + aw / 2) * PX;
  return {
    headBox: [[-hw / 2 * PX, neckY, -hd / 2 * PX], [hw / 2 * PX, neckY + hh * PX, hd / 2 * PX]],
    bodyBox: [[-bw / 2 * PX, hipY, -bd / 2 * PX], [bw / 2 * PX, neckY, bd / 2 * PX]],
    shoulderY: neckY - Math.min(2, aw / 2) * PX,
    hipY,
    armX,
    legX: (lw / 2) * PX,
    armLen: al * PX,
    legLen: legLen * PX,
  };
}

export function humanoidDef(o: HumanoidOpts): ModelDef {
  const L = humanoidLayout(o);
  const [aw, al, ad] = o.arm ?? [4, 12, 4];
  const [lw, , ld] = o.leg ?? [4, 12, 4];
  const r = o.r ?? 0.03;
  const lr = o.limbR ?? Math.min(r, (Math.min(aw, ad) * PX) / 2 - 0.004);
  const ov = o.overlap ?? 0.045;
  const prims: PrimDef[] = [];
  const box = (id: string, bone: string, from: V3, to: V3, extra: Partial<BoxPrim> = {}): BoxPrim => ({ kind: 'box', id, bone, from, to, r, ...extra });
  // head + body
  prims.push(box('head', 'head', L.headBox[0], L.headBox[1], { r: o.headR ?? r * 1.15, seg: 3 }));
  if (!o.noTorso) prims.push(box('torso', 'body', L.bodyBox[0], L.bodyBox[1], { seg: 2 }));
  if (o.nose) {
    const n = o.nose;
    const top = L.headBox[1][1];
    const z = L.headBox[0][2];
    prims.push(box('nose', 'head', [-n.w / 2 * PX, top - (n.row + n.h) * PX, z - n.d * PX], [n.w / 2 * PX, top - n.row * PX, z + 0.02], { r: Math.min(n.w, n.d) * PX * 0.45, seg: 2 }));
  }
  // arms: upper + fore (elbow at mid length)
  const sy = L.shoulderY + Math.min(2, aw / 2) * PX; // top of arm
  const armTop = sy, armBot = sy - al * PX, elbowY = (armTop + armBot) / 2;
  for (const [side, sx] of [['R', 1], ['L', -1]] as const) {
    const x0 = sx * L.armX - (aw / 2) * PX, x1 = sx * L.armX + (aw / 2) * PX;
    prims.push(box('arm' + side, 'arm' + side, [x0, elbowY - ov * 0.25, -ad / 2 * PX], [x1, armTop, ad / 2 * PX], { r: lr }));
    prims.push(box('fore' + side, 'fore' + side, [x0 + 0.002, armBot, -ad / 2 * PX + 0.002], [x1 - 0.002, elbowY + ov, ad / 2 * PX - 0.002], { r: lr }));
    const lx0 = sx * L.legX - (lw / 2) * PX, lx1 = sx * L.legX + (lw / 2) * PX;
    const kneeY = L.hipY / 2;
    prims.push(box('leg' + side, 'leg' + side, [lx0, kneeY - ov * 0.25, -ld / 2 * PX], [lx1, L.hipY, ld / 2 * PX], { r: lr }));
    prims.push(box('shin' + side, 'shin' + side, [lx0 + 0.002, 0, -ld / 2 * PX + 0.002], [lx1 - 0.002, kneeY + ov, ld / 2 * PX - 0.002], { r: lr }));
  }
  if (o.extra) prims.push(...o.extra);
  const neckY = L.bodyBox[1][1];
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: [0, L.hipY, 0], box: L.bodyBox },
    { name: 'head', parent: 'body', pivot: [0, neckY, 0], box: L.headBox },
    { name: 'armR', parent: 'body', pivot: [L.armX, L.shoulderY, 0], box: [[L.armX - aw / 2 * PX, elbowY, -ad / 2 * PX], [L.armX + aw / 2 * PX, armTop, ad / 2 * PX]] },
    { name: 'foreR', parent: 'armR', pivot: [L.armX, elbowY, 0], box: [[L.armX - aw / 2 * PX, armBot, -ad / 2 * PX], [L.armX + aw / 2 * PX, elbowY, ad / 2 * PX]] },
    { name: 'armL', parent: 'body', pivot: [-L.armX, L.shoulderY, 0], box: [[-L.armX - aw / 2 * PX, elbowY, -ad / 2 * PX], [-L.armX + aw / 2 * PX, armTop, ad / 2 * PX]] },
    { name: 'foreL', parent: 'armL', pivot: [-L.armX, elbowY, 0], box: [[-L.armX - aw / 2 * PX, armBot, -ad / 2 * PX], [-L.armX + aw / 2 * PX, elbowY, ad / 2 * PX]] },
    { name: 'legR', parent: 'body', pivot: [L.legX, L.hipY, 0], box: [[L.legX - lw / 2 * PX, L.hipY / 2, -ld / 2 * PX], [L.legX + lw / 2 * PX, L.hipY, ld / 2 * PX]] },
    { name: 'shinR', parent: 'legR', pivot: [L.legX, L.hipY / 2, 0], box: [[L.legX - lw / 2 * PX, 0, -ld / 2 * PX], [L.legX + lw / 2 * PX, L.hipY / 2, ld / 2 * PX]] },
    { name: 'legL', parent: 'body', pivot: [-L.legX, L.hipY, 0], box: [[-L.legX - lw / 2 * PX, L.hipY / 2, -ld / 2 * PX], [-L.legX + lw / 2 * PX, L.hipY, ld / 2 * PX]] },
    { name: 'shinL', parent: 'legL', pivot: [-L.legX, L.hipY / 2, 0], box: [[-L.legX - lw / 2 * PX, 0, -ld / 2 * PX], [-L.legX + lw / 2 * PX, L.hipY / 2, ld / 2 * PX]] },
  ];
  return {
    key: o.key,
    bones,
    prims,
    density: o.density ?? 210,
    paint: o.paint,
    slots: o.slots,
    sss: o.sss ?? 0.6,
    blood: o.blood ?? 0,
    attach: {
      handR: { bone: 'foreR', pos: [L.armX, armBot + 0.06, 0] },
      handL: { bone: 'foreL', pos: [-L.armX, armBot + 0.06, 0] },
      headTop: { bone: 'head', pos: [0, L.headBox[1][1], 0] },
      back: { bone: 'body', pos: [0, (L.bodyBox[0][1] + L.bodyBox[1][1]) / 2, L.bodyBox[1][2]] },
    },
  };
}
