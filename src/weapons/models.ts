import * as THREE from 'three';
import { C, Finish, ModelBuilder, V3 } from './ModelBuilder';

/**
 * Procedural weapon models. Weapon space: origin at the firing grip,
 * -Z forward, +Y up. In first person the gun sits right of the eye, so its
 * left (-X) side, top and back are what the player sees most.
 *
 * Each model exposes animatable parts and anchors:
 *   grip (right hand), support (left hand), muzzle, eject, sight (ADS eye
 *   point), magwell (reload target). Hand anchors use the hand frame: the
 *   handle runs along +Y, the wrist is toward +Z. `support` anchors tagged
 *   pose 'cup' are held from below a horizontal handguard instead.
 */
export interface WeaponModel {
  mb: ModelBuilder;
  /** Hip position of the model root in camera space. */
  hip: V3;
  /** Hip rotation (pitch, yaw, roll): angles the gun so its side profile shows. */
  hipRot: V3;
  /** Eye relief distance for ADS. */
  eye: number;
  /** Two-handed? (pistols use a cupped support hand). */
  twoHand: boolean;
}

type Builder = (mb: ModelBuilder, visual: string[]) => Partial<WeaponModel>;
type Parent = string | THREE.Object3D | undefined;

const R = Math.PI / 180;

function shade(color: number, k: number) {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const b = Math.min(255, Math.round((color & 255) * k));
  return (r << 16) | (g << 8) | b;
}
const isWood = (c: number) => c === C.WOOD || c === C.WOOD_L || c === C.WOOD_D || c === 0x5a3218;

// ---------------------------------------------------------------- components
interface GripOpts {
  /** Finger grooves on the front strap. */
  grooves?: number;
  /** Beavertail tang at the top rear. */
  beaver?: boolean;
  /** Side panel color (stippled rubber, or checkered wood on wooden grips). */
  panel?: number;
  /** Skip the grip anchor (the model places its own). */
  noAnchor?: boolean;
}
/**
 * Pistol grip whose top center sits at (0, 0.01, z); it hangs down and back
 * (`rake` degrees). The grip anchor lands inside it so the hand follows the rake.
 */
function pistolGrip(mb: ModelBuilder, z: number, color: number, rake = 18, len = 0.1, w = 0.03, d = 0.045, parent?: Parent, o: GripOpts = {}) {
  const f = mb.frame([0, 0.01, z], [-rake * R, 0, 0], parent);
  mb.box([w, len, d], [0, -len / 2, 0], color, f);
  const wood = isWood(color);
  const panel = o.panel ?? (wood ? shade(color, 0.86) : shade(color, 0.72));
  const pf: Finish = wood ? 'wood' : 'rubber';
  mb.fbox([w + 0.0024, len * 0.62, d * 0.7], [0, -len * 0.5, d * 0.06], panel, pf, f);
  if (wood) {
    // checkering lines and a grip screw
    for (let i = 0; i < 4; i++) mb.fbox([w + 0.003, 0.0012, d * 0.62], [0, -len * 0.28 - i * len * 0.1, d * 0.06], shade(color, 0.6), 'wood', f);
    mb.cyl(0.003, w + 0.0036, [0, -len * 0.5, d * 0.06], C.STEEL, f, 'x', 8);
  }
  if (o.grooves) for (let i = 0; i < o.grooves; i++) mb.box([w * 0.9, 0.0085, 0.005], [0, -0.03 - (i * (len - 0.035)) / o.grooves, -d / 2 - 0.0012], color, f);
  if (o.beaver) mb.box([w * 0.8, 0.007, 0.022], [0, -0.004, d / 2 + 0.008], color, f, [0.3, 0, 0]);
  mb.box([w + 0.004, 0.007, d + 0.003], [0, -len + 0.0025, 0.001], shade(color, 0.8), f);
  if (!o.noAnchor) mb.anchor('grip', [0, -Math.min(0.037, len * 0.4), 0.002], f);
  return f;
}
/** Trigger guard ending at the grip front (zRear); trigger part animates. */
function triggerGuard(mb: ModelBuilder, zRear: number, color: number, size = 0.05, y = -0.035) {
  const zf = zRear - size;
  mb.box([0.0075, 0.0055, size - 0.008], [0, y, zRear - size / 2 + 0.002], color);
  mb.box([0.0075, 0.024, 0.0055], [0, y + 0.014, zf + 0.004], color, undefined, [-0.12, 0, 0]);
  mb.box([0.0075, 0.0055, 0.011], [0, y + 0.002, zf + 0.006], color, undefined, [0.7, 0, 0]);
  mb.box([0.02, 0.014, size * 0.8], [0, y + 0.032, zRear - size * 0.45], color); // trigger housing up to the receiver
  const tr = mb.part('trigger', [0, y + 0.026, zRear - size * 0.44]);
  mb.box([0.0048, 0.011, 0.0052], [0, -0.005, 0], C.STEEL, tr, [-0.1, 0, 0]);
  mb.box([0.0048, 0.01, 0.0052], [0, -0.0135, 0.0022], C.STEEL, tr, [-0.45, 0, 0]);
  mb.box([0.0056, 0.0045, 0.006], [0, -0.019, 0.0052], C.STEEL, tr, [-0.8, 0, 0]);
}
function barrel(mb: ModelBuilder, r: number, len: number, z0: number, y: number, color: number, parent?: Parent, seg = 10) {
  mb.cyl(r, len, [0, y, z0 - len / 2], color, parent, 'z', seg);
  mb.cyl(r * 0.5, 0.002, [0, y, z0 - len - 0.0004], C.BORE, parent, 'z', seg);
}
function frontSight(mb: ModelBuilder, z: number, y: number, parent?: Parent, dot = true) {
  mb.box([0.0044, 0.0115, 0.007], [0, y + 0.006, z], C.BLACK, parent);
  mb.box([0.0065, 0.0035, 0.013], [0, y + 0.0012, z], C.BLACK, parent);
  if (dot) mb.box([0.0026, 0.0026, 0.0012], [0, y + 0.0085, z + 0.0035], C.DOT, parent, undefined, 0x3a5a30);
}
function rearSight(mb: ModelBuilder, z: number, y: number, parent?: Parent, dots = true) {
  mb.box([0.022, 0.004, 0.009], [0, y + 0.0012, z], C.BLACK, parent);
  mb.box([0.0072, 0.0105, 0.0075], [-0.0065, y + 0.0055, z], C.BLACK, parent);
  mb.box([0.0072, 0.0105, 0.0075], [0.0065, y + 0.0055, z], C.BLACK, parent);
  if (dots)
    for (const s of [-1, 1]) mb.box([0.0024, 0.0024, 0.0012], [s * 0.0065, y + 0.0072, z + 0.0039], C.DOT, parent, undefined, 0x3a5a30);
}
function rail(mb: ModelBuilder, len: number, z: number, y: number, color = C.BLACK, parent?: Parent) {
  mb.box([0.021, 0.006, len], [0, y, z], color, parent);
  const n = Math.floor(len / 0.01);
  for (let i = 0; i < n; i++) mb.box([0.0235, 0.0036, 0.0052], [0, y + 0.0045, z - len / 2 + (i + 0.5) * (len / n)], color, parent);
}
/** Cross pins through a receiver (visible on both sides). */
function pins(mb: ModelBuilder, halfW: number, pts: [number, number][], r = 0.0024, color = C.STEEL, parent?: Parent) {
  for (const [y, z] of pts) mb.cyl(r, halfW * 2 + 0.0016, [0, y, z], color, parent, 'x', 8);
}
/** Recessed ejection port on the right (+X) side. */
function ejectPort(mb: ModelBuilder, halfW: number, y: number, z: number, h: number, l: number, parent?: Parent) {
  mb.fbox([0.0012, h, l], [halfW + 0.0003, y, z], C.BORE, 'rubber', parent);
  mb.box([0.0014, h * 0.7, l * 0.85], [halfW + 0.0006, y, z], C.STEEL, parent);
}
/** Small lever / button on the left side. */
function lever(mb: ModelBuilder, x: number, y: number, z: number, len: number, angle = 0, color = C.BLACK, parent?: Parent) {
  mb.box([0.0036, 0.0055, len], [x, y, z], color, parent, [angle, 0, 0]);
}
function scope(mb: ModelBuilder, len: number, r: number, z: number, y: number, color = C.BLACK, lens = C.GLASS) {
  const p = mb.part('scope', [0, y, z]);
  const lo = len * 0.24;
  const le = len * 0.2;
  const lm = len - lo - le;
  mb.cyl(r, lm, [0, 0, -len / 2 + lo + lm / 2], color, p, 'z', 14);
  mb.cyl(r, lo, [0, 0, -len / 2 + lo / 2], color, p, 'z', 14, 0, undefined, r * 1.5); // objective bell
  mb.cyl(r * 1.52, 0.008, [0, 0, -len / 2 + 0.004], color, p, 'z', 14);
  mb.cyl(r * 1.28, le, [0, 0, len / 2 - le / 2], color, p, 'z', 14, 0, undefined, r * 1.05); // eyepiece
  mb.cyl(r * 1.16, 0.012, [0, 0, len / 2 - le - 0.006], C.RUBBER, p, 'z', 14, 0, 'rubber'); // power ring
  // turrets: elevation (top), windage (right), parallax (left)
  mb.cyl(0.0085, 0.012, [0, r + 0.006, -0.004], color, p, 'y', 12);
  mb.cyl(0.0098, 0.006, [0, r + 0.014, -0.004], C.DARK, p, 'y', 12);
  mb.cyl(0.0085, 0.012, [r + 0.006, 0, -0.004], color, p, 'x', 12);
  mb.cyl(0.0098, 0.006, [r + 0.014, 0, -0.004], C.DARK, p, 'x', 12);
  mb.cyl(0.011, 0.006, [-r - 0.004, 0, -0.004], C.DARK, p, 'x', 12);
  mb.box([r * 1.8, r * 1.1, 0.03], [0, 0, -0.004], color, p);
  // rings and bases
  for (const s of [-1, 1]) {
    const rz = s * len * 0.2 - 0.004;
    mb.cyl(r * 1.13, 0.012, [0, 0, rz], C.DARK, p, 'z', 14);
    mb.box([0.016, r * 0.95, 0.013], [0, -r * 0.95, rz], C.DARK, p);
    mb.cyl(0.0022, 0.004, [-r * 1.13, -r * 0.3, rz], C.STEEL, p, 'x', 6);
  }
  mb.cyl(r * 1.36, 0.003, [0, 0, -len / 2 - 0.0012], lens, p, 'z', 14, 0, 'glass');
  mb.box([r * 0.5, r * 0.22, 0.001], [-r * 0.4, r * 0.5, -len / 2 - 0.003], 0xcfe8ff, p, [0, 0, 0.5], 0x405868);
  mb.cyl(r * 1.1, 0.003, [0, 0, len / 2 + 0.001], lens, p, 'z', 14, 0, 'glass');
  mb.box([r * 0.4, r * 0.18, 0.001], [-r * 0.35, r * 0.45, len / 2 + 0.003], 0xcfe8ff, p, [0, 0, 0.5], 0x405868);
  mb.anchor('sight', [0, y, z + len / 2 - 0.02]);
}
function redDot(mb: ModelBuilder, z: number, y: number) {
  const p = mb.part('optic', [0, y, z]);
  mb.box([0.03, 0.007, 0.05], [0, 0.0035, 0], C.BLACK, p); // mount
  mb.box([0.022, 0.004, 0.012], [0, -0.0005, 0.012], C.BLACK, p); // clamp lug
  mb.cyl(0.0035, 0.034, [0, 0.001, 0.012], C.STEEL, p, 'x', 8); // cross bolt
  mb.box([0.03, 0.02, 0.013], [0, 0.017, 0.0185], C.BLACK, p); // rear housing
  mb.box([0.03, 0.026, 0.007], [0, 0.02, -0.0215], C.BLACK, p); // front hood
  mb.box([0.0035, 0.024, 0.034], [-0.0133, 0.02, -0.001], C.BLACK, p);
  mb.box([0.0035, 0.024, 0.034], [0.0133, 0.02, -0.001], C.BLACK, p);
  mb.box([0.03, 0.0035, 0.036], [0, 0.0315, -0.001], C.BLACK, p);
  mb.box([0.022, 0.019, 0.0015], [0, 0.019, -0.0175], C.GLASS, p, undefined, 0, 'glass');
  mb.box([0.0034, 0.0034, 0.001], [0, 0.019, -0.016], C.GLOW_R, p, undefined, 0xff2010);
  mb.cyl(0.0058, 0.006, [-0.0175, 0.017, 0.012], C.DARK, p, 'x', 10); // brightness knob
  mb.anchor('sight', [0, y + 0.018, z + 0.02]);
}
/** Straight box magazine hanging from `pos`, raked `angle` degrees (+ = bottom forward). */
function boxMag(mb: ModelBuilder, w: number, h: number, d: number, pos: V3, color: number, angle = 0, name = 'mag') {
  const p = mb.part(name, pos);
  const f = mb.frame([0, 0, 0], [angle * R, 0, 0], p);
  mb.box([w, h, d], [0, -h / 2, 0], color, f);
  // stiffening ribs, baseplate and the top round
  for (const s of [-1, 1]) mb.box([0.0016, h * 0.8, 0.005], [s * (w / 2 + 0.0004), -h * 0.52, -d * 0.18], shade(color, 0.85), f);
  mb.box([w + 0.004, 0.008, d + 0.005], [0, -h - 0.002, 0.0015], shade(color, 0.75), f);
  mb.fbox([w * 0.55, 0.006, d * 0.7], [0, 0.002, -d * 0.08], C.BRASS, 'polish', f);
  return p;
}
function curvedMag(mb: ModelBuilder, w: number, h: number, d: number, pos: V3, color: number, curve = 25, name = 'mag', finish?: Finish) {
  const p = mb.part(name, pos);
  const n = 5;
  const seg = h / n;
  let y = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    const a = (curve * (i + 0.5)) / n;
    const ar = a * R;
    const cy = y - Math.cos(ar) * seg * 0.5;
    const cz = z - Math.sin(ar) * seg * 0.5;
    mb.box([w, seg + 0.012, d], [0, cy, cz], color, p, [-ar, 0, 0], 0, finish);
    for (const s of [-1, 1]) mb.box([0.0016, seg * 0.9, 0.005], [s * (w / 2 + 0.0004), cy, cz - Math.cos(ar) * d * 0.2], shade(color, 0.82), p, [-ar, 0, 0], 0, finish);
    y -= Math.cos(ar) * seg;
    z -= Math.sin(ar) * seg;
    if (i === n - 1) mb.box([w + 0.004, 0.008, d + 0.005], [0, y - 0.002, z], shade(color, 0.72), p, [-ar, 0, 0], 0, finish);
  }
  mb.fbox([w * 0.55, 0.006, d * 0.7], [0, 0.002, -d * 0.1], C.BRASS, 'polish', p);
  return p;
}
function drumMag(mb: ModelBuilder, r: number, w: number, pos: V3, color: number, name = 'mag') {
  const p = mb.part(name, pos);
  mb.box([0.024, 0.036, 0.034], [0, -0.016, 0], color, p);
  mb.cyl(r, w, [0, -0.03 - r, 0], color, p, 'x', 16);
  for (const s of [-1, 1]) mb.cyl(r * 0.92, 0.004, [s * (w / 2 + 0.001), -0.03 - r, 0], shade(color, 0.8), p, 'x', 16);
  mb.cyl(r * 0.3, w + 0.012, [0, -0.03 - r, 0], C.STEEL, p, 'x', 10);
  mb.box([0.004, r * 0.5, 0.006], [-w / 2 - 0.007, -0.03 - r, 0], C.STEEL, p); // winding key
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    mb.box([w + 0.002, 0.004, 0.004], [0, -0.03 - r + Math.sin(a) * r, Math.cos(a) * r], shade(color, 0.85), p, [a, 0, 0]);
  }
  return p;
}
/** Fixed stock from z0 back `len`, dropping `drop` at the butt. */
function stockSolid(mb: ModelBuilder, z0: number, len: number, color: number, drop = 0.02, h = 0.06, w = 0.036) {
  const a = Math.atan2(drop, len);
  const f = mb.frame([0, 0.012, z0], [a, 0, 0]);
  const L = Math.hypot(len, drop);
  mb.box([w, h, L], [0, -h * 0.5 + 0.02, L / 2], color, f);
  mb.box([w * 0.8, h * 0.2, L * 0.55], [0, 0.02 + h * 0.04, L * 0.6], color, f); // comb
  mb.fbox([w + 0.004, h + 0.012, 0.014], [0, -h * 0.5 + 0.02, L + 0.006], C.RUBBER, 'rubber', f); // butt pad
  mb.cyl(0.004, 0.012, [0, -h + 0.014, L * 0.8], C.STEEL, f, 'y', 8); // sling stud
  mb.cyl(0.006, 0.0025, [-w / 2 - 0.0008, -h * 0.35, L * 0.2], C.STEEL, f, 'x', 8); // sling cup
  return f;
}
function stockSkeleton(mb: ModelBuilder, z0: number, len: number, color: number) {
  mb.box([0.011, 0.011, len], [0, 0.005, z0 + len / 2], color);
  mb.box([0.011, 0.011, len * 0.9], [0, -0.045, z0 + len * 0.45], color, undefined, [-0.06, 0, 0]);
  mb.box([0.028, 0.072, 0.012], [0, -0.022, z0 + len], color);
  mb.fbox([0.03, 0.078, 0.008], [0, -0.022, z0 + len + 0.009], C.RUBBER, 'rubber');
  mb.box([0.03, 0.012, 0.04], [0, 0.012, z0 + len * 0.62], shade(color, 0.9)); // cheek rest
  pins(mb, 0.006, [[0.005, z0 + 0.01], [-0.045, z0 + 0.01]], 0.003);
}
/** Stock with a collapsible buffer tube (AR style). */
function stockAR(mb: ModelBuilder, z0: number, color: number) {
  mb.cyl(0.015, 0.2, [0, 0.03, z0 + 0.1], C.BLACK, undefined, 'z', 12);
  mb.fbox([0.012, 0.012, 0.012], [-0.0165, 0.03, z0 + 0.01], C.BLACK, 'metal'); // end plate / sling loop
  const s = mb.frame([0, 0.02, z0 + 0.13]);
  mb.box([0.036, 0.05, 0.13], [0, 0.0, 0.03], color, s);
  mb.box([0.032, 0.035, 0.1], [0, -0.035, 0.05], color, s, [0.25, 0, 0]);
  mb.fbox([0.038, 0.1, 0.014], [0, -0.02, 0.1], C.RUBBER, 'rubber', s);
  mb.box([0.03, 0.012, 0.06], [0, 0.03, 0.02], color, s); // cheek weld
  lever(mb, -0.019, -0.03, 0.0, 0.03, 0, C.BLACK, s); // adjustment lever
}
/** Grip anchor at an explicit spot (vertical grips; hand frame). */
function grip(mb: ModelBuilder, pos: V3 = [0, -0.03, 0.012], rot: V3 = [-0.3, 0, 0]) {
  mb.anchor('grip', pos, undefined, rot);
}
/** Support-hand anchor. 'cup' = held from below a horizontal handguard. */
function support(mb: ModelBuilder, pos: V3, pose: 'grip' | 'cup' = 'cup', parent?: Parent, rot?: V3) {
  const a = mb.anchor('support', pos, parent, rot ?? (pose === 'cup' ? [0, 0, 0.35] : [-0.25, 0, 0]));
  a.userData.pose = pose;
  return a;
}
/** Muzzle devices. */
function flashHider(mb: ModelBuilder, r: number, z: number, y: number, parent?: Parent) {
  mb.cyl(r, 0.045, [0, y, z - 0.0225], C.BLACK, parent, 'z', 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    mb.fbox([0.003, 0.003, 0.03], [Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98, z - 0.028], C.BORE, 'rubber', parent);
  }
  mb.cyl(r * 0.55, 0.002, [0, y, z - 0.0455], C.BORE, parent, 'z', 10);
}
function muzzleBrake(mb: ModelBuilder, r: number, len: number, z: number, y: number, color = C.BLACK, ports = 3, parent?: Parent) {
  mb.box([r * 2.6, r * 2, len], [0, y, z - len / 2], color, parent);
  for (let i = 0; i < ports; i++) mb.fbox([r * 2.7, r * 1.1, len * 0.12], [0, y, z - len * (0.25 + (i * 0.55) / Math.max(1, ports - 1))], C.BORE, 'rubber', parent);
  mb.cyl(r * 0.6, 0.002, [0, y, z - len - 0.0004], C.BORE, parent, 'z', 10);
}
function bipod(mb: ModelBuilder, z: number, y: number, legLen = 0.14) {
  mb.box([0.03, 0.02, 0.03], [0, y, z], C.BLACK);
  for (const s of [-1, 1]) {
    const f = mb.frame([s * 0.012, y - 0.008, z], [0.35, 0, s * 0.28]);
    mb.box([0.0075, legLen, 0.0075], [0, -legLen / 2, 0], C.DARK, f);
    mb.box([0.006, legLen * 0.5, 0.006], [0, -legLen * 0.9, 0], C.STEEL, f);
    mb.fbox([0.012, 0.008, 0.016], [0, -legLen * 1.15, 0], C.RUBBER, 'rubber', f);
  }
}

// ---------------------------------------------------------------- models
const MODELS: Record<string, Builder> = {
  // ---------------------------------------------------------- pistols
  m686(mb) {
    const S = C.CHROME;
    const SD = 0x8d9298;
    // frame: rear block, top strap, front post and bottom rail make a window around the cylinder
    mb.box([0.03, 0.058, 0.036], [0, 0.019, -0.006], S); // rear frame / recoil shield
    mb.box([0.022, 0.009, 0.058], [0, 0.0465, -0.052], S); // top strap
    mb.box([0.028, 0.05, 0.012], [0, 0.02, -0.08], S); // front of frame
    mb.box([0.026, 0.012, 0.08], [0, -0.006, -0.046], S); // bottom rail
    mb.box([0.03, 0.022, 0.02], [0, 0.002, 0.018], S); // grip frame hump
    // sideplate seam and screws (right), cylinder release latch (left)
    mb.fbox([0.0008, 0.03, 0.001], [0.0152, 0.014, -0.019], SD, 'metal');
    mb.fbox([0.0008, 0.001, 0.034], [0.0152, -0.001, -0.004], SD, 'metal');
    for (const [y, z] of [[0.03, -0.012], [0.004, 0.007], [0.008, -0.016]] as [number, number][]) mb.cyl(0.0024, 0.002, [0.0155, y, z], SD, undefined, 'x', 8);
    mb.box([0.0045, 0.009, 0.015], [-0.017, 0.027, 0.004], SD);
    for (let i = 0; i < 4; i++) mb.fbox([0.0012, 0.009, 0.0012], [-0.0198, 0.027, -0.002 + i * 0.004], C.DARK, 'metal');
    mb.cyl(0.0024, 0.002, [-0.0155, 0.004, 0.008], SD, undefined, 'x', 8);
    const bar = mb.part('barrel', [0, 0, -0.086]);
    mb.cyl(0.0095, 0.1, [0, 0.028, -0.05], S, bar, 'z', 14);
    mb.box([0.018, 0.022, 0.1], [0, 0.012, -0.05], S, bar); // full underlug
    mb.box([0.0085, 0.006, 0.1], [0, 0.039, -0.05], S, bar); // vent rib
    for (let i = 0; i < 5; i++) mb.fbox([0.0088, 0.0018, 0.004], [0, 0.0425, -0.012 - i * 0.017], SD, 'metal', bar);
    mb.box([0.006, 0.006, 0.016], [0, 0.043, -0.09], S, bar); // ramp base
    mb.box([0.004, 0.01, 0.012], [0, 0.046, -0.092], C.RED, bar, undefined, 0x300000); // red ramp insert
    mb.cyl(0.0045, 0.002, [0, 0.028, -0.1008], C.BORE, bar, 'z', 10);
    mb.cyl(0.0024, 0.002, [0, 0.012, -0.1005], SD, bar, 'z', 8); // ejector rod tip
    // crane pivots below-left of the cylinder axis and swings it out to the left
    const crane = mb.part('crane', [-0.012, 0.004, -0.052]);
    const cyl = mb.part('cylinder', [0.012, 0.016, 0], crane);
    mb.cyl(0.021, 0.044, [0, 0, 0], C.STEEL, cyl, 'z', 18);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.box([0.0065, 0.006, 0.03], [Math.cos(a) * 0.0192, Math.sin(a) * 0.0192, -0.002], C.DARK, cyl, [0, 0, a]); // flutes
      const b = a + Math.PI / 6;
      mb.cyl(0.0042, 0.002, [Math.cos(b) * 0.012, Math.sin(b) * 0.012, 0.022], C.BRASS, cyl, 'z', 8); // case heads
      mb.cyl(0.0022, 0.0022, [Math.cos(b) * 0.012, Math.sin(b) * 0.012, 0.0226], 0x8a8a8a, cyl, 'z', 6); // primers
      mb.cyl(0.0043, 0.0015, [Math.cos(b) * 0.012, Math.sin(b) * 0.012, -0.0222], C.BORE, cyl, 'z', 8); // chamber mouths
      mb.fbox([0.003, 0.002, 0.004], [Math.cos(b) * 0.021, Math.sin(b) * 0.021, 0.014], C.DARK, 'metal', cyl); // bolt notches
    }
    mb.cyl(0.0035, 0.052, [0.012, 0.003, -0.048], S, crane, 'z', 8); // ejector rod
    // hammer spur stays below the sight line (0.052)
    const hammer = mb.part('hammer', [0, 0.034, 0.008]);
    mb.box([0.008, 0.02, 0.01], [0, 0.004, 0.004], C.STEEL, hammer, [-0.45, 0, 0]);
    mb.box([0.011, 0.006, 0.013], [0, 0.01, 0.013], C.STEEL, hammer, [-0.3, 0, 0]); // spur
    for (let i = 0; i < 3; i++) mb.fbox([0.0115, 0.0012, 0.0015], [0, 0.0132, 0.009 + i * 0.004], C.BLACK, 'metal', hammer);
    // adjustable rear sight with a white outline notch
    mb.box([0.012, 0.004, 0.018], [0, 0.0525, -0.02], C.BLACK);
    rearSight(mb, -0.022, 0.044, undefined, false);
    mb.fbox([0.0015, 0.004, 0.001], [-0.0035, 0.051, -0.0181], 0xe8e8e8, 'poly');
    mb.fbox([0.0015, 0.004, 0.001], [0.0035, 0.051, -0.0181], 0xe8e8e8, 'poly');
    mb.cyl(0.0022, 0.004, [0.0075, 0.049, -0.02], C.STEEL, undefined, 'x', 8); // windage screw
    // trigger guard and trigger
    mb.box([0.008, 0.006, 0.04], [0, -0.034, -0.03], S);
    mb.box([0.008, 0.028, 0.006], [0, -0.021, -0.049], S);
    mb.box([0.008, 0.016, 0.006], [0, -0.026, -0.011], S, undefined, [-0.5, 0, 0]);
    const tr = mb.part('trigger', [0, -0.012, -0.032]);
    mb.box([0.0055, 0.012, 0.006], [0, -0.005, 0], C.STEEL, tr, [-0.1, 0, 0]);
    mb.box([0.0055, 0.01, 0.006], [0, -0.014, 0.0022], C.STEEL, tr, [-0.45, 0, 0]);
    // rubber grip with finger grooves, raked back
    const gp = mb.part('gripPanel', [0, -0.004, 0.02]);
    gp.rotation.x = -20 * R;
    mb.fbox([0.034, 0.082, 0.042], [0, -0.041, 0.006], C.RUBBER, 'rubber', gp);
    for (let i = 0; i < 3; i++) mb.fbox([0.031, 0.011, 0.008], [0, -0.019 - i * 0.021, -0.017], C.RUBBER, 'rubber', gp);
    mb.fbox([0.036, 0.012, 0.045], [0, -0.083, 0.007], C.RUBBER, 'rubber', gp);
    mb.fbox([0.0356, 0.05, 0.03], [0, -0.044, 0.008], 0x232323, 'rubber', gp);
    mb.fbox([0.03, 0.02, 0.012], [0, 0.0, 0.027], C.RUBBER, 'rubber', gp); // backstrap hump
    mb.anchor('grip', [0, -0.033, 0.006], gp);
    support(mb, [-0.024, -0.042, 0.03], 'grip', undefined, [-0.35, -0.3, 0]);
    mb.anchor('muzzle', [0, 0.028, -0.19]);
    mb.anchor('eject', [0, 0.016, -0.05]);
    mb.anchor('sight', [0, 0.052, 0.02]);
    mb.anchor('magwell', [-0.027, 0.02, -0.026]);
    return { hip: [0.136, -0.125, -0.303], hipRot: [0.03, 0.24, -0.08], eye: 0.2, twoHand: true };
  },
  m500(mb) {
    const r = MODELS.m686(mb, []);
    mb.root.scale.set(1.18, 1.18, 1.22);
    const bar = mb.parts.barrel;
    // compensator with ports
    mb.box([0.022, 0.024, 0.05], [0, 0.03, -0.12], C.CHROME, bar);
    for (let i = 0; i < 3; i++) mb.fbox([0.0236, 0.004, 0.006], [0, 0.043, -0.1 - i * 0.012], C.BORE, 'rubber', bar);
    for (let i = 0; i < 2; i++) mb.fbox([0.0236, 0.01, 0.005], [0, 0.03, -0.108 - i * 0.014], C.BORE, 'rubber', bar);
    mb.cyl(0.0048, 0.002, [0, 0.028, -0.1455], C.BORE, bar, 'z', 10);
    mb.anchors.muzzle.position.set(0, 0.028, -0.25);
    return r;
  },
  m1911(mb) {
    const B = C.BLUED;
    const slide = mb.part('slide', [0, 0.018, 0]);
    mb.box([0.027, 0.03, 0.19], [0, 0.0, -0.07], B, slide);
    mb.box([0.02, 0.006, 0.18], [0, 0.017, -0.072], B, slide); // rounded top
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) mb.fbox([0.0014, 0.022, 0.0026], [s * 0.0138, -0.002, 0.004 + i * 0.0055], C.BORE, 'rubber', slide);
    frontSight(mb, -0.158, 0.015, 'slide', false);
    rearSight(mb, 0.012, 0.015, 'slide', false);
    ejectPort(mb, 0.0135, 0.004, -0.045, 0.012, 0.04, slide);
    mb.cyl(0.0068, 0.004, [0, -0.006, -0.1652], B, slide, 'z', 12); // barrel bushing
    mb.cyl(0.0045, 0.002, [0, 0.0, -0.1652], C.BORE, slide, 'z', 10);
    mb.box([0.026, 0.02, 0.15], [0, -0.006, -0.06], B); // frame / dust cover
    mb.cyl(0.0048, 0.02, [0, -0.008, -0.14], B, undefined, 'z', 10); // recoil spring plug
    // left side controls: slide stop, thumb safety, mag release
    lever(mb, -0.0145, 0.0035, -0.04, 0.03, 0, B);
    mb.cyl(0.0035, 0.004, [-0.0148, 0.002, -0.024], B, undefined, 'x', 8);
    mb.box([0.004, 0.006, 0.02], [-0.0148, 0.012, 0.006], B, undefined, [-0.2, 0, 0]);
    mb.cyl(0.0042, 0.003, [-0.0142, -0.012, -0.004], C.STEEL, undefined, 'x', 10);
    pins(mb, 0.013, [[-0.004, -0.028], [0.004, 0.012]], 0.0018);
    triggerGuard(mb, -0.003, B, 0.045);
    pistolGrip(mb, 0.02, B, 14, 0.088, 0.03, 0.044, undefined, { panel: C.WOOD, beaver: true });
    const hammer = mb.part('hammer', [0, 0.025, 0.026]);
    mb.box([0.008, 0.014, 0.008], [0, 0.005, 0.003], C.DARK, hammer);
    mb.box([0.009, 0.005, 0.01], [0, 0.011, 0.007], C.DARK, hammer, [-0.3, 0, 0]);
    boxMag(mb, 0.022, 0.072, 0.035, [0, -0.006, 0.02], C.STEEL, -14);
    mb.fbox([0.012, 0.004, 0.012], [0, -0.081, 0.052], C.STEEL, 'metal'); // lanyard loop
    support(mb, [-0.023, -0.038, 0.036], 'grip', undefined, [-0.3, -0.3, 0]);
    mb.anchor('muzzle', [0, 0.02, -0.17]);
    mb.anchor('eject', [0.016, 0.028, -0.04]);
    mb.anchor('sight', [0, 0.042, 0.03]);
    mb.anchor('magwell', [0, -0.08, 0.045]);
    return { hip: [0.12, -0.11, -0.3], eye: 0.22, twoHand: true };
  },
  glock17(mb, v) {
    const SL = 0x2c2f34;
    const slide = mb.part('slide', [0, 0.02, 0]);
    mb.box([0.026, 0.028, 0.18], [0, 0, -0.065], SL, slide);
    mb.box([0.022, 0.004, 0.17], [0, 0.0145, -0.066], SL, slide);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) mb.fbox([0.0014, 0.02, 0.0024], [s * 0.0133, -0.001, 0.002 + i * 0.005], C.BORE, 'rubber', slide);
    frontSight(mb, -0.15, 0.014, 'slide');
    rearSight(mb, 0.012, 0.014, 'slide');
    ejectPort(mb, 0.013, 0.004, -0.04, 0.013, 0.042, slide);
    mb.fbox([0.0012, 0.013, 0.036], [0.0136, 0.004, -0.04], 0x6c7178, 'metal', slide); // barrel hood
    mb.fbox([0.0012, 0.005, 0.012], [-0.0136, -0.008, 0.008], 0x6c7178, 'metal', slide); // extractor
    mb.cyl(0.0058, 0.003, [0, -0.002, -0.1558], C.BORE, slide, 'z', 10);
    mb.box([0.025, 0.02, 0.15], [0, -0.004, -0.058], C.POLY); // frame
    rail(mb, 0.04, -0.1, -0.017, C.POLY);
    // slide stop, takedown tabs, mag release (left)
    lever(mb, -0.0138, 0.003, -0.03, 0.022, 0, C.BLACK);
    mb.box([0.0035, 0.006, 0.005], [-0.0135, -0.004, -0.056], C.BLACK);
    mb.box([0.004, 0.009, 0.006], [-0.0135, -0.014, -0.004], C.BLACK);
    pins(mb, 0.0125, [[-0.004, -0.04], [0.0, -0.012]], 0.0016);
    triggerGuard(mb, -0.004, C.POLY, 0.046);
    mb.fbox([0.0022, 0.008, 0.0024], [0, -0.01, -0.0012], C.STEEL, 'metal', 'trigger'); // trigger safety blade
    pistolGrip(mb, 0.021, C.POLY, 20, 0.092, 0.03, 0.045, undefined, { grooves: 3, beaver: true });
    if (v.includes('drum')) {
      drumMag(mb, 0.045, 0.05, [0, -0.07, 0.046], C.BLACK);
      // compensator
      mb.box([0.026, 0.028, 0.035], [0, 0.02, -0.172], SL);
      for (let i = 0; i < 2; i++) mb.fbox([0.012, 0.002, 0.006], [0, 0.0345, -0.164 - i * 0.012], C.BORE, 'rubber');
    } else if (v.includes('extmag')) boxMag(mb, 0.022, 0.15, 0.034, [0, -0.004, 0.022], C.BLACK, -20);
    else boxMag(mb, 0.022, 0.078, 0.034, [0, -0.004, 0.022], C.BLACK, -20);
    support(mb, [-0.023, -0.038, 0.036], 'grip', undefined, [-0.35, -0.3, 0]);
    mb.anchor('muzzle', [0, 0.02, -0.16]);
    mb.anchor('eject', [0.016, 0.03, -0.035]);
    mb.anchor('sight', [0, 0.042, 0.03]);
    mb.anchor('magwell', [0, -0.085, 0.05]);
    return { hip: [0.12, -0.11, -0.3], eye: 0.22, twoHand: true };
  },
  deagle(mb) {
    const S = 0x6b7077;
    const slide = mb.part('slide', [0, 0.025, 0]);
    mb.box([0.034, 0.036, 0.23], [0, 0, -0.08], S, slide);
    mb.box([0.022, 0.012, 0.21], [0, 0.022, -0.09], S, slide); // barrel top
    for (let i = 0; i < 12; i++) mb.fbox([0.018, 0.002, 0.004], [0, 0.029, -0.02 - i * 0.014], C.DARK, 'metal', slide); // scope rail cuts
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) mb.fbox([0.0014, 0.026, 0.0028], [s * 0.0172, -0.002, 0.008 + i * 0.0058], C.BORE, 'rubber', slide);
    mb.fbox([0.0012, 0.02, 0.12], [-0.0172, -0.004, -0.12], shade(S, 0.8), 'metal', slide); // barrel flat
    frontSight(mb, -0.19, 0.028, 'slide');
    rearSight(mb, 0.02, 0.028, 'slide');
    ejectPort(mb, 0.017, 0.006, -0.02, 0.016, 0.05, slide);
    mb.cyl(0.0075, 0.003, [0, 0.01, -0.1952], C.BORE, slide, 'z', 12);
    mb.box([0.03, 0.024, 0.18], [0, -0.006, -0.06], S);
    lever(mb, -0.0158, 0.004, -0.03, 0.03, 0, C.DARK);
    mb.box([0.005, 0.008, 0.016], [-0.0175, 0.028, 0.01], C.DARK, 'slide'); // ambi safety
    mb.cyl(0.0045, 0.003, [-0.0158, -0.014, -0.004], C.DARK, undefined, 'x', 10);
    pins(mb, 0.015, [[-0.008, -0.03], [0.002, 0.014]], 0.002);
    triggerGuard(mb, -0.004, S, 0.05);
    pistolGrip(mb, 0.024, C.RUBBER, 16, 0.098, 0.034, 0.05, undefined, { beaver: true, grooves: 0 });
    const hammer = mb.part('hammer', [0, 0.03, 0.04]);
    mb.box([0.009, 0.014, 0.008], [0, 0.004, 0.002], C.DARK, hammer);
    boxMag(mb, 0.026, 0.08, 0.04, [0, -0.008, 0.026], C.STEEL, -16);
    support(mb, [-0.025, -0.044, 0.042], 'grip', undefined, [-0.3, -0.3, 0]);
    mb.anchor('muzzle', [0, 0.025, -0.2]);
    mb.anchor('eject', [0.02, 0.034, -0.04]);
    mb.anchor('sight', [0, 0.058, 0.04]);
    mb.anchor('magwell', [0, -0.092, 0.055]);
    return { hip: [0.12, -0.115, -0.31], eye: 0.22, twoHand: true };
  },
  thunder50(mb) {
    const brk = mb.part('break', [0, 0.02, -0.03]);
    mb.box([0.042, 0.048, 0.26], [0, 0.012, -0.12], C.BLACK, brk);
    mb.box([0.034, 0.01, 0.24], [0, 0.04, -0.12], C.BLACK, brk); // top rib
    for (let i = 0; i < 6; i++) mb.fbox([0.044, 0.018, 0.012], [0, 0.012, -0.03 - i * 0.034], shade(C.BLACK, 0.8), 'metal', brk); // flutes
    mb.cyl(0.018, 0.08, [0, 0.012, -0.29], C.DARK, brk, 'z', 12);
    muzzleBrake(mb, 0.016, 0.06, -0.3, 0.012, C.DARK, 3, brk);
    frontSight(mb, -0.23, 0.036, 'break');
    mb.box([0.044, 0.05, 0.07], [0, 0.03, 0.01], C.DARK);
    mb.box([0.03, 0.018, 0.02], [0, 0.058, 0.03], C.DARK); // hinge lever
    pins(mb, 0.022, [[0.012, -0.018]], 0.005);
    triggerGuard(mb, -0.004, C.DARK, 0.05, -0.02);
    pistolGrip(mb, 0.03, C.WOOD_D, 16, 0.1, 0.036, 0.052, undefined, { beaver: true });
    rearSight(mb, 0.035, 0.056);
    support(mb, [-0.026, -0.046, 0.046], 'grip', undefined, [-0.3, -0.3, 0]);
    mb.anchor('muzzle', [0, 0.032, -0.33]);
    mb.anchor('eject', [0, 0.04, -0.02]);
    mb.anchor('sight', [0, 0.066, 0.05]);
    mb.anchor('magwell', [0, 0.05, -0.02]);
    return { hip: [0.13, -0.12, -0.32], eye: 0.24, twoHand: true };
  },
  // ---------------------------------------------------------- shotguns
  shorty(mb) {
    const RCV = 0x2c3036; // anodized receiver
    const FURN = 0x8f7a58; // FDE polymer furniture
    const FURN_D = 0x6e5d43;
    mb.box([0.042, 0.064, 0.17], [0, 0.026, -0.045], RCV); // receiver
    mb.box([0.036, 0.008, 0.15], [0, 0.061, -0.05], RCV); // top rib
    ejectPort(mb, 0.021, 0.034, -0.05, 0.02, 0.056);
    mb.box([0.03, 0.004, 0.07], [0, -0.0065, -0.062], C.BLACK); // loading port
    mb.fbox([0.024, 0.0016, 0.05], [0, -0.0088, -0.064], C.BORE, 'rubber'); // shell lifter gap
    mb.box([0.012, 0.006, 0.014], [0, 0.063, 0.024], C.STEEL); // tang safety
    pins(mb, 0.021, [[0.004, 0.02], [0.004, -0.004]], 0.0028);
    mb.box([0.004, 0.01, 0.02], [-0.022, 0.008, -0.012], C.BLACK); // action release
    // barrel + magazine tube, clamped at the muzzle
    barrel(mb, 0.0125, 0.18, -0.13, 0.044, C.GUNMETAL, undefined, 14);
    barrel(mb, 0.0115, 0.13, -0.13, 0.015, C.GUNMETAL, undefined, 14);
    mb.box([0.03, 0.046, 0.014], [0, 0.03, -0.268], C.BLACK); // barrel clamp
    mb.cyl(0.0022, 0.034, [0, 0.03, -0.268], C.STEEL, undefined, 'x', 8);
    mb.cyl(0.0085, 0.002, [0, 0.044, -0.3108], C.BORE, undefined, 'z', 12);
    mb.box([0.004, 0.008, 0.006], [0, 0.06, -0.302], C.BLACK); // raised bead post
    mb.box([0.006, 0.006, 0.006], [0, 0.066, -0.302], C.BRASS, undefined, undefined, 0x201400); // bead
    mb.cyl(0.009, 0.004, [0, 0.015, -0.2622], C.BLACK, undefined, 'z', 12); // mag cap
    // pump with vertical foregrip
    const pump = mb.part('pump', [0, 0.014, -0.195]);
    mb.box([0.044, 0.038, 0.09], [0, 0, 0], FURN, pump);
    for (let i = 0; i < 5; i++) mb.box([0.046, 0.04, 0.004], [0, 0, -0.034 + i * 0.017], FURN_D, pump);
    const fg = mb.frame([0, -0.018, 0.006], [0.14, 0, 0], pump);
    mb.box([0.028, 0.076, 0.032], [0, -0.034, 0], FURN, fg);
    for (let i = 0; i < 3; i++) mb.box([0.03, 0.006, 0.034], [0, -0.014 - i * 0.02, 0.003], FURN_D, fg);
    mb.fbox([0.03, 0.006, 0.034], [0, -0.072, 0.0], FURN_D, 'poly', fg);
    // trigger group + pistol grip
    mb.box([0.034, 0.02, 0.06], [0, -0.013, 0.012], RCV);
    triggerGuard(mb, 0.018, C.BLACK, 0.05);
    pistolGrip(mb, 0.04, FURN, 18, 0.1, 0.034, 0.048, undefined, { grooves: 3, panel: FURN_D });
    mb.fbox([0.028, 0.02, 0.008], [0, 0.0, 0.07], C.BLACK, 'metal'); // sling mount
    support(mb, [0, -0.052, 0.01], 'grip', 'pump', [-0.14, 0, 0]);
    mb.anchor('muzzle', [0, 0.044, -0.31]);
    mb.anchor('eject', [0.024, 0.035, -0.05]);
    mb.anchor('sight', [0, 0.067, 0.02]);
    mb.anchor('magwell', [0, -0.012, -0.07]);
    return { hip: [0.145, -0.125, -0.348], hipRot: [0.03, 0.24, -0.08], eye: 0.22, twoHand: true };
  },
  r870(mb) {
    const RCV = 0x2e3238;
    mb.box([0.042, 0.062, 0.2], [0, 0.025, -0.06], RCV);
    mb.box([0.034, 0.008, 0.19], [0, 0.058, -0.062], RCV);
    ejectPort(mb, 0.021, 0.032, -0.06, 0.02, 0.06);
    mb.box([0.03, 0.004, 0.08], [0, -0.0065, -0.075], C.BLACK);
    pins(mb, 0.021, [[0.004, 0.02], [0.004, -0.01]], 0.0028);
    mb.box([0.004, 0.01, 0.02], [-0.022, 0.006, -0.018], C.BLACK); // action release
    barrel(mb, 0.012, 0.44, -0.16, 0.046, RCV, undefined, 14);
    mb.box([0.006, 0.004, 0.44], [0, 0.059, -0.38], RCV); // vent rib
    for (let i = 0; i < 10; i++) mb.fbox([0.0064, 0.0016, 0.006], [0, 0.0605, -0.18 - i * 0.042], C.BORE, 'rubber');
    barrel(mb, 0.011, 0.34, -0.16, 0.016, RCV, undefined, 14);
    mb.cyl(0.012, 0.012, [0, 0.016, -0.506], C.BLACK, undefined, 'z', 12); // mag cap
    mb.box([0.02, 0.04, 0.01], [0, 0.03, -0.49], RCV); // barrel ring
    frontSight(mb, -0.59, 0.058, undefined, false);
    mb.box([0.005, 0.005, 0.005], [0, 0.066, -0.59], C.BRASS, undefined, undefined, 0x201400);
    const pump = mb.part('pump', [0, 0.014, -0.26]);
    mb.box([0.042, 0.036, 0.13], [0, 0, 0], C.WOOD, pump);
    mb.box([0.036, 0.012, 0.12], [0, -0.022, 0], C.WOOD, pump);
    for (let i = 0; i < 8; i++) mb.box([0.044, 0.038, 0.004], [0, 0, -0.055 + i * 0.016], C.WOOD_D, pump);
    mb.box([0.008, 0.008, 0.1], [-0.02, 0.012, 0.08], C.STEEL, pump); // action bar
    triggerGuard(mb, 0.024, C.BLACK, 0.05);
    mb.box([0.038, 0.02, 0.06], [0, -0.013, 0.014], RCV);
    lever(mb, -0.004, 0.008, 0.05, 0.012, 0, C.BLACK); // safety
    // straight-grip wood stock (the wrist is the grip)
    const st = stockSolid(mb, 0.04, 0.3, C.WOOD, 0.055, 0.07, 0.038);
    void st;
    grip(mb, [0, -0.01, 0.066], [-0.55, 0, 0]);
    support(mb, [0, -0.024, 0.0], 'cup', 'pump');
    mb.anchor('muzzle', [0, 0.046, -0.61]);
    mb.anchor('eject', [0.024, 0.035, -0.05]);
    mb.anchor('sight', [0, 0.066, 0.05]);
    mb.anchor('magwell', [0, -0.005, -0.08]);
    return { hip: [0.15, -0.14, -0.33], eye: 0.3, twoHand: true };
  },
  db(mb) {
    const brk = mb.part('break', [0, 0.03, -0.1]);
    brk.position.x = -0.013;
    mb.cyl(0.013, 0.5, [0, 0.012, -0.25], C.BLUED, brk, 'z', 14);
    mb.cyl(0.013, 0.5, [0.026, 0.012, -0.25], C.BLUED, brk, 'z', 14);
    mb.cyl(0.0078, 0.002, [0, 0.012, -0.5008], C.BORE, brk, 'z', 12);
    mb.cyl(0.0078, 0.002, [0.026, 0.012, -0.5008], C.BORE, brk, 'z', 12);
    mb.box([0.009, 0.008, 0.5], [0.013, 0.026, -0.25], C.BLUED, brk); // rib
    mb.box([0.01, 0.012, 0.5], [0.013, 0.0, -0.25], C.BLUED, brk); // lower rib
    mb.box([0.052, 0.03, 0.18], [0.013, -0.012, -0.12], C.WOOD, brk); // fore-end
    mb.box([0.04, 0.012, 0.16], [0.013, -0.029, -0.12], C.WOOD, brk);
    for (let i = 0; i < 4; i++) mb.fbox([0.053, 0.002, 0.1], [0.013, -0.002 - i * 0.006, -0.12], C.WOOD_D, 'wood', brk);
    mb.fbox([0.012, 0.01, 0.012], [0.013, -0.022, -0.035], C.STEEL, 'metal', brk); // fore-end latch
    mb.box([0.05, 0.022, 0.03], [0.013, 0.004, -0.004], 0x7d8188, brk); // monoblock
    mb.box([0.004, 0.006, 0.006], [0.013, 0.033, -0.49], C.BRASS, brk, undefined, 0x201400);
    // case-hardened receiver with mottling
    mb.box([0.05, 0.05, 0.1], [0, 0.02, -0.05], 0x7d8188);
    for (const [y, z, c] of [[0.03, -0.07, 0x5e6a7a], [0.012, -0.04, 0x8a7a64], [0.028, -0.025, 0x6a5a70], [0.008, -0.08, 0x8c8f94]] as [number, number, number][])
      mb.fbox([0.0506, 0.012, 0.018], [0, y, z], c, 'metal');
    mb.box([0.024, 0.01, 0.03], [0, 0.047, 0.012], C.BLUED); // top lever
    mb.box([0.012, 0.008, 0.012], [0, 0.049, 0.025], C.BLUED); // safety
    triggerGuard(mb, 0.012, C.BLUED, 0.05);
    mb.fbox([0.0048, 0.018, 0.005], [0, -0.022, -0.028], C.STEEL, 'metal'); // second trigger
    stockSolid(mb, 0.0, 0.34, C.WOOD, 0.07, 0.066, 0.04);
    grip(mb, [0, -0.012, 0.05], [-0.6, 0, 0]);
    support(mb, [0.013, -0.03, -0.17], 'cup', brk);
    mb.anchor('muzzle', [0, 0.045, -0.62]);
    mb.anchor('eject', [0, 0.05, -0.1]);
    mb.anchor('sight', [0, 0.06, 0.05]);
    mb.anchor('magwell', [0, 0.05, -0.1]);
    return { hip: [0.15, -0.14, -0.33], eye: 0.3, twoHand: true };
  },
  m590(mb) {
    MODELS.r870(mb, []);
    // synthetic heat shield with vents, ghost ring, box magazine
    mb.box([0.03, 0.02, 0.3], [0, 0.066, -0.34], C.BLACK);
    for (let i = 0; i < 6; i++) mb.fbox([0.0306, 0.008, 0.024], [0, 0.066, -0.23 - i * 0.045], C.BORE, 'rubber');
    mb.box([0.02, 0.018, 0.012], [0, 0.07, 0.04], C.BLACK); // ghost ring
    boxMag(mb, 0.036, 0.1, 0.06, [0, -0.005, -0.08], C.BLACK, 8);
    return { hip: [0.15, -0.14, -0.33], eye: 0.3, twoHand: true };
  },
  ks23(mb) {
    const RCV = C.DARK;
    mb.box([0.05, 0.07, 0.22], [0, 0.025, -0.06], RCV);
    mb.box([0.042, 0.01, 0.2], [0, 0.064, -0.064], RCV);
    ejectPort(mb, 0.025, 0.03, -0.06, 0.026, 0.07);
    pins(mb, 0.025, [[0.0, 0.02], [0.0, -0.12]], 0.003);
    barrel(mb, 0.02, 0.38, -0.17, 0.05, C.BLUED, undefined, 16);
    barrel(mb, 0.013, 0.26, -0.17, 0.012, RCV, undefined, 12);
    mb.box([0.026, 0.05, 0.014], [0, 0.03, -0.43], C.BLACK);
    frontSight(mb, -0.54, 0.07);
    rearSight(mb, 0.02, 0.07);
    const pump = mb.part('pump', [0, 0.012, -0.27]);
    mb.box([0.05, 0.04, 0.12], [0, 0, 0], C.WOOD_L, pump);
    mb.box([0.042, 0.012, 0.11], [0, -0.024, 0], C.WOOD_L, pump);
    for (let i = 0; i < 6; i++) mb.box([0.052, 0.042, 0.004], [0, 0, -0.045 + i * 0.018], C.WOOD, pump);
    triggerGuard(mb, 0.03, C.BLACK, 0.05);
    mb.box([0.04, 0.02, 0.07], [0, -0.013, 0.02], RCV);
    stockSolid(mb, 0.05, 0.28, C.WOOD_L, 0.06, 0.075, 0.042);
    grip(mb, [0, -0.011, 0.074], [-0.55, 0, 0]);
    support(mb, [0, -0.03, 0.0], 'cup', 'pump');
    mb.anchor('muzzle', [0, 0.05, -0.56]);
    mb.anchor('eject', [0.028, 0.035, -0.05]);
    mb.anchor('sight', [0, 0.078, 0.05]);
    mb.anchor('magwell', [0, -0.005, -0.08]);
    return { hip: [0.15, -0.145, -0.33], eye: 0.3, twoHand: true };
  },
  saiga(mb) {
    akBody(mb, C.BLACK, C.POLY, false);
    // shotgun barrel, gas block with regulator, big drum
    mb.cyl(0.013, 0.1, [0, 0.04, -0.52], C.BLACK, undefined, 'z', 12);
    mb.cyl(0.009, 0.002, [0, 0.04, -0.5708], C.BORE, undefined, 'z', 10);
    drumMag(mb, 0.062, 0.062, [0, -0.01, -0.06], C.BLACK);
    return { hip: [0.15, -0.14, -0.34], eye: 0.3, twoHand: true };
  },
  bp12(mb, v) {
    mb.box([0.05, 0.08, 0.42], [0, 0.03, -0.05], C.POLY);
    mb.box([0.046, 0.02, 0.3], [0, 0.08, -0.08], C.BLACK);
    rail(mb, 0.26, -0.09, 0.093);
    for (let i = 0; i < 4; i++) mb.fbox([0.0506, 0.03, 0.01], [0, 0.03, -0.18 - i * 0.02], shade(C.POLY, 0.75), 'poly'); // grip texture
    mb.fbox([0.052, 0.06, 0.018], [0, 0.02, 0.17], C.RUBBER, 'rubber'); // butt pad
    mb.box([0.03, 0.012, 0.1], [0, 0.074, 0.12], C.POLY); // cheek riser
    ejectPort(mb, 0.025, 0.05, 0.08, 0.022, 0.05);
    pins(mb, 0.025, [[0.01, 0.06], [0.01, 0.13]], 0.0028);
    barrel(mb, 0.013, 0.1, -0.26, 0.04, C.BLACK, undefined, 12);
    mb.box([0.03, 0.03, 0.03], [0, 0.04, -0.3], C.BLACK);
    triggerGuard(mb, -0.022, C.POLY, 0.05);
    pistolGrip(mb, -0.004, C.POLY, 16, 0.092, 0.032, 0.05, undefined, { grooves: 3 });
    if (v.includes('drum')) drumMag(mb, 0.06, 0.05, [0, -0.01, 0.1], C.BLACK);
    else boxMag(mb, 0.04, 0.09, 0.06, [0, -0.01, 0.1], C.BLACK);
    rearSight(mb, 0.05, 0.09);
    frontSight(mb, -0.2, 0.09);
    mb.box([0.03, 0.06, 0.03], [0, -0.035, -0.19], C.POLY, undefined, [0.1, 0, 0]); // hand stop
    support(mb, [0, -0.012, -0.21], 'cup');
    mb.anchor('muzzle', [0, 0.04, -0.37]);
    mb.anchor('eject', [0.028, 0.05, 0.08]);
    mb.anchor('sight', [0, 0.1, 0.06]);
    mb.anchor('magwell', [0, -0.02, 0.1]);
    return { hip: [0.15, -0.15, -0.32], eye: 0.24, twoHand: true };
  },
  aa12(mb) {
    mb.box([0.055, 0.085, 0.36], [0, 0.03, -0.1], C.OD);
    for (let i = 0; i < 8; i++) mb.fbox([0.0566, 0.016, 0.02], [0, 0.03, -0.2 - i * 0.028], shade(C.OD, 0.7), 'poly'); // vent slots
    mb.box([0.016, 0.03, 0.2], [0, 0.088, -0.08], C.BLACK); // carry handle
    mb.box([0.016, 0.028, 0.02], [0, 0.08, -0.17], C.BLACK);
    mb.box([0.016, 0.028, 0.02], [0, 0.08, 0.01], C.BLACK);
    rail(mb, 0.16, -0.08, 0.106);
    pins(mb, 0.0275, [[0.0, 0.0], [0.0, 0.04], [0.05, -0.02]], 0.003);
    barrel(mb, 0.014, 0.18, -0.28, 0.045, C.BLACK, undefined, 12);
    muzzleBrake(mb, 0.012, 0.05, -0.43, 0.045, C.BLACK, 2);
    drumMag(mb, 0.065, 0.06, [0, -0.01, -0.1], C.BLACK);
    triggerGuard(mb, 0.016, C.BLACK, 0.05);
    pistolGrip(mb, 0.042, C.BLACK, 18, 0.092, 0.034, 0.05, undefined, { grooves: 3 });
    stockSolid(mb, 0.08, 0.24, C.OD, 0.0, 0.075, 0.045);
    support(mb, [0, -0.012, -0.25], 'cup');
    mb.anchor('muzzle', [0, 0.045, -0.48]);
    mb.anchor('eject', [0.03, 0.05, -0.05]);
    mb.anchor('sight', [0, 0.125, 0.0]);
    mb.anchor('magwell', [0, -0.02, -0.1]);
    return { hip: [0.15, -0.16, -0.33], eye: 0.26, twoHand: true };
  },
  // ---------------------------------------------------------- SMGs
  mac11(mb) {
    mb.box([0.034, 0.05, 0.14], [0, 0.02, -0.04], C.BLACK);
    mb.box([0.03, 0.008, 0.13], [0, 0.048, -0.04], C.BLACK);
    ejectPort(mb, 0.017, 0.025, -0.05, 0.016, 0.04);
    pins(mb, 0.017, [[0.0, -0.09], [0.0, 0.02]], 0.0025);
    barrel(mb, 0.008, 0.04, -0.11, 0.028, C.DARK, undefined, 10);
    mb.cyl(0.0085, 0.01, [0, 0.028, -0.113], C.STEEL, undefined, 'z', 10); // thread protector
    const f = pistolGrip(mb, -0.006, C.BLACK, 2, 0.09, 0.03, 0.04, undefined, { noAnchor: true });
    mb.anchor('grip', [0, -0.036, 0.002], f);
    boxMag(mb, 0.024, 0.14, 0.035, [0, -0.005, -0.006], C.DARK, -2);
    triggerGuard(mb, -0.026, C.BLACK, 0.04);
    const bolt = mb.part('bolt', [0, 0.05, -0.02]);
    mb.box([0.01, 0.012, 0.02], [0, 0, 0], C.STEEL, bolt);
    mb.box([0.014, 0.006, 0.008], [0, 0.007, 0.004], C.STEEL, bolt);
    mb.box([0.012, 0.012, 0.012], [0, 0.056, 0.02], C.BLACK); // rear sight
    mb.box([0.006, 0.012, 0.008], [0, 0.056, -0.1], C.BLACK);
    mb.fbox([0.008, 0.012, 0.02], [0, -0.004, 0.034], C.STEEL, 'metal'); // sling loop
    support(mb, [0, -0.012, -0.09], 'cup');
    mb.anchor('muzzle', [0, 0.028, -0.16]);
    mb.anchor('eject', [0.02, 0.04, -0.04]);
    mb.anchor('sight', [0, 0.06, 0.02]);
    mb.anchor('magwell', [0, -0.13, -0.006]);
    return { hip: [0.13, -0.12, -0.3], eye: 0.22, twoHand: true };
  },
  sterling(mb) {
    mb.cyl(0.02, 0.3, [0, 0.03, -0.1], C.BLACK, undefined, 'z', 14);
    for (let i = 0; i < 6; i++) {
      mb.cyl(0.021, 0.008, [0, 0.03, -0.18 - i * 0.02], C.DARK, undefined, 'z', 14);
      mb.fbox([0.043, 0.006, 0.008], [0, 0.03, -0.17 - i * 0.02], C.BORE, 'rubber');
    }
    mb.cyl(0.022, 0.012, [0, 0.03, 0.05], C.DARK, undefined, 'z', 14); // end cap
    barrel(mb, 0.007, 0.04, -0.25, 0.03, C.DARK);
    const mag = mb.part('mag', [-0.02, 0.022, -0.1]);
    mb.box([0.12, 0.022, 0.035], [-0.06, 0, 0], C.DARK, mag, [0, 0, 0.05]);
    mb.box([0.006, 0.026, 0.039], [-0.12, 0.003, 0], C.BLACK, mag, [0, 0, 0.05]);
    for (let i = 0; i < 3; i++) mb.fbox([0.02, 0.0224, 0.0016], [-0.03 - i * 0.03, 0, -0.0178], shade(C.DARK, 0.8), 'metal', mag);
    mb.box([0.03, 0.02, 0.04], [-0.02, 0.022, -0.1], C.BLACK); // mag housing
    const bolt = mb.part('bolt', [0.022, 0.03, -0.02]);
    mb.box([0.01, 0.01, 0.01], [0, 0, 0], C.STEEL, bolt);
    triggerGuard(mb, -0.012, C.BLACK, 0.045);
    pistolGrip(mb, 0.018, C.BLACK, 12, 0.09, 0.03, 0.042, undefined, { panel: C.POLY });
    stockSkeleton(mb, 0.05, 0.22, C.DARK);
    rearSight(mb, 0.03, 0.05, undefined, false);
    frontSight(mb, -0.24, 0.05, undefined, false);
    support(mb, [0, 0.002, -0.19], 'cup');
    mb.anchor('muzzle', [0, 0.03, -0.29]);
    mb.anchor('eject', [0.022, 0.04, -0.06]);
    mb.anchor('sight', [0, 0.06, 0.02]);
    mb.anchor('magwell', [-0.12, 0.02, -0.1]);
    return { hip: [0.14, -0.13, -0.32], eye: 0.24, twoHand: true };
  },
  thompson(mb, v) {
    const B = C.BLUED;
    mb.box([0.04, 0.05, 0.22], [0, 0.03, -0.06], B);
    mb.box([0.034, 0.01, 0.2], [0, 0.06, -0.06], B);
    ejectPort(mb, 0.02, 0.04, -0.05, 0.016, 0.04);
    pins(mb, 0.02, [[0.012, 0.02], [0.012, -0.12]], 0.0028);
    lever(mb, -0.021, 0.018, -0.02, 0.02, 0.3, C.STEEL); // selector
    lever(mb, -0.021, 0.018, 0.012, 0.018, -0.3, C.STEEL); // safety
    barrel(mb, 0.012, 0.18, -0.17, 0.035, B);
    for (let i = 0; i < 9; i++) mb.cyl(0.016, 0.005, [0, 0.035, -0.19 - i * 0.012], C.DARK, undefined, 'z', 14); // cooling fins
    mb.cyl(0.014, 0.034, [0, 0.035, -0.365], B, undefined, 'z', 12); // Cutts compensator
    for (let i = 0; i < 3; i++) mb.fbox([0.012, 0.003, 0.005], [0, 0.049, -0.356 - i * 0.008], C.BORE, 'rubber');
    const fg = mb.frame([0, -0.012, -0.2], [0.25, 0, 0]);
    mb.box([0.028, 0.07, 0.036], [0, -0.03, 0], C.WOOD, fg);
    for (let i = 0; i < 3; i++) mb.box([0.03, 0.009, 0.038], [0, -0.015 - i * 0.02, 0.003], C.WOOD_D, fg);
    mb.box([0.034, 0.012, 0.042], [0, -0.066, 0], C.WOOD, fg);
    triggerGuard(mb, 0.002, B, 0.045);
    pistolGrip(mb, 0.03, C.WOOD, 16, 0.085, 0.03, 0.045, undefined, { grooves: 3, panel: C.WOOD });
    stockSolid(mb, 0.07, 0.24, C.WOOD, 0.04, 0.06);
    if (v.includes('drum')) drumMag(mb, 0.06, 0.05, [0, 0.005, -0.1], B);
    else boxMag(mb, 0.024, 0.14, 0.035, [0, 0.005, -0.1], B, 0);
    const bolt = mb.part('bolt', [0, 0.066, -0.02]);
    mb.box([0.012, 0.014, 0.018], [0, 0, 0], C.STEEL, bolt);
    mb.cyl(0.005, 0.01, [0, 0.01, 0], C.STEEL, bolt, 'y', 8);
    mb.box([0.016, 0.02, 0.016], [0, 0.068, 0.028], B); // Lyman sight block
    rearSight(mb, 0.028, 0.068, undefined, false);
    frontSight(mb, -0.35, 0.05, undefined, false);
    support(mb, [0, -0.07, -0.2], 'grip', undefined, [0.25, 0, 0]);
    mb.anchor('muzzle', [0, 0.035, -0.38]);
    mb.anchor('eject', [0.022, 0.045, -0.06]);
    mb.anchor('sight', [0, 0.068, 0.03]);
    mb.anchor('magwell', [0, -0.12, -0.1]);
    return { hip: [0.14, -0.14, -0.33], eye: 0.26, twoHand: true };
  },
  mp40(mb) {
    mb.cyl(0.019, 0.26, [0, 0.03, -0.08], C.BLACK, undefined, 'z', 14);
    for (let i = 0; i < 4; i++) mb.fbox([0.0395, 0.004, 0.03], [0, 0.03, -0.02 - i * 0.045], C.BORE, 'rubber'); // receiver grooves
    mb.box([0.03, 0.03, 0.2], [0, 0.005, -0.08], C.DARK); // lower
    barrel(mb, 0.009, 0.1, -0.21, 0.03, C.DARK);
    mb.box([0.012, 0.022, 0.02], [0, 0.012, -0.23], C.DARK); // resting bar
    boxMag(mb, 0.024, 0.2, 0.034, [0, 0.01, -0.12], C.BLACK, 0);
    mb.box([0.03, 0.03, 0.05], [0, 0.0, -0.12], C.DARK); // mag well
    triggerGuard(mb, 0.004, C.BLACK, 0.045);
    pistolGrip(mb, 0.034, C.POLY, 12, 0.088, 0.03, 0.045, undefined, { panel: 0x4a2a1a });
    stockSkeleton(mb, 0.06, 0.2, C.DARK);
    const bolt = mb.part('bolt', [-0.02, 0.035, -0.05]);
    mb.box([0.012, 0.012, 0.012], [0, 0, 0], C.STEEL, bolt);
    mb.cyl(0.005, 0.01, [-0.008, 0, 0], C.STEEL, bolt, 'x', 8);
    frontSight(mb, -0.3, 0.035, undefined, false);
    mb.box([0.02, 0.016, 0.008], [0, 0.056, -0.3], C.DARK); // sight hood
    rearSight(mb, 0.0, 0.05, undefined, false);
    support(mb, [0, -0.01, -0.16], 'cup');
    mb.anchor('muzzle', [0, 0.03, -0.32]);
    mb.anchor('eject', [0.022, 0.04, -0.06]);
    mb.anchor('sight', [0, 0.062, 0.03]);
    mb.anchor('magwell', [0, -0.18, -0.12]);
    return { hip: [0.14, -0.13, -0.33], eye: 0.26, twoHand: true };
  },
  mp5k(mb) {
    mb.box([0.036, 0.055, 0.2], [0, 0.03, -0.06], C.BLACK);
    mb.box([0.03, 0.008, 0.19], [0, 0.06, -0.06], C.BLACK);
    for (const s of [-1, 1]) mb.fbox([0.001, 0.006, 0.18], [s * 0.0184, 0.04, -0.06], shade(C.BLACK, 0.7), 'metal'); // side ribs
    ejectPort(mb, 0.018, 0.038, -0.02, 0.014, 0.04);
    mb.cyl(0.009, 0.1, [0, 0.063, -0.13], C.BLACK, undefined, 'z', 10); // cocking tube
    mb.box([0.006, 0.02, 0.008], [-0.012, 0.064, -0.16], C.BLACK, undefined, [0, 0, 0.5]); // cocking handle
    pins(mb, 0.018, [[0.01, 0.02], [0.01, -0.12]], 0.0025);
    lever(mb, -0.019, 0.01, 0.022, 0.02, 0.6, C.BLACK); // selector
    barrel(mb, 0.009, 0.05, -0.16, 0.035, C.DARK);
    for (let i = 0; i < 3; i++) mb.fbox([0.011, 0.002, 0.002], [0, 0.035, -0.176 - i * 0.008], C.STEEL, 'metal'); // lugs
    curvedMag(mb, 0.024, 0.14, 0.035, [0, 0.005, -0.07], C.DARK, 22);
    const fg = mb.frame([0, 0.004, -0.14], [0.1, 0, 0]);
    mb.box([0.026, 0.07, 0.03], [0, -0.035, 0], C.BLACK, fg);
    mb.box([0.03, 0.01, 0.038], [0, -0.072, 0.002], C.BLACK, fg);
    triggerGuard(mb, -0.006, C.BLACK, 0.04);
    pistolGrip(mb, 0.024, C.BLACK, 14, 0.088, 0.03, 0.045, undefined, { grooves: 3 });
    rearSight(mb, 0.025, 0.06, undefined, false);
    mb.cyl(0.008, 0.012, [0, 0.07, 0.025], C.BLACK, undefined, 'z', 12); // drum sight
    frontSight(mb, -0.14, 0.06, undefined, false);
    mb.box([0.022, 0.02, 0.01], [0, 0.068, -0.14], C.BLACK); // front hood
    mb.fbox([0.012, 0.012, 0.012], [0, 0.03, 0.046], C.STEEL, 'metal'); // sling point
    support(mb, [0, -0.06, -0.14], 'grip', undefined, [0.1, 0, 0]);
    mb.anchor('muzzle', [0, 0.035, -0.22]);
    mb.anchor('eject', [0.02, 0.045, -0.06]);
    mb.anchor('sight', [0, 0.072, 0.03]);
    mb.anchor('magwell', [0, -0.12, -0.08]);
    return { hip: [0.13, -0.13, -0.3], eye: 0.22, twoHand: true };
  },
  p90(mb) {
    const T = C.TAN;
    mb.box([0.05, 0.07, 0.3], [0, 0.03, -0.01], T);
    mb.box([0.05, 0.05, 0.1], [0, 0.0, -0.2], T, undefined, [-0.35, 0, 0]); // sloped nose
    mb.box([0.046, 0.03, 0.06], [0, 0.05, -0.19], T);
    mb.box([0.052, 0.03, 0.12], [0, -0.02, -0.02], C.BLACK);
    mb.fbox([0.0506, 0.032, 0.06], [0, -0.04, 0.07], C.BORE, 'rubber'); // thumbhole
    for (const s of [-1, 1]) mb.fbox([0.001, 0.05, 0.2], [s * 0.0254, 0.03, 0.0], shade(T, 0.85), 'poly'); // side panels
    mb.box([0.04, 0.06, 0.02], [0, -0.03, 0.12], T); // thumbhole rear
    mb.box([0.03, 0.02, 0.06], [0, -0.065, 0.095], T);
    mb.fbox([0.054, 0.1, 0.016], [0, 0.015, 0.14], C.RUBBER, 'rubber');
    for (let i = 0; i < 5; i++) mb.fbox([0.0516, 0.004, 0.06], [0, -0.012 - i * 0.008, -0.13], shade(T, 0.8), 'poly'); // front grip ridges
    const mag = mb.part('mag', [0, 0.07, -0.04]);
    mb.box([0.036, 0.014, 0.24], [0, 0, 0], 0x6a6050, mag);
    mb.fbox([0.03, 0.002, 0.2], [0, 0.0075, 0], 0x9c9278, 'glass', mag); // translucent top
    for (let i = 0; i < 10; i++) mb.fbox([0.006, 0.004, 0.012], [-0.008, 0.006, -0.09 + i * 0.02], C.BRASS, 'polish', mag);
    barrel(mb, 0.008, 0.04, -0.24, 0.03, C.BLACK);
    pins(mb, 0.025, [[0.0, 0.04], [0.0, -0.1]], 0.003);
    const tr = mb.part('trigger', [0, -0.03, -0.08]);
    mb.box([0.006, 0.02, 0.008], [0, -0.01, 0], C.BLACK, tr);
    redDot(mb, -0.02, 0.078);
    grip(mb, [0, -0.045, -0.03], [-0.15, 0, 0]);
    support(mb, [0, -0.04, -0.17], 'grip', undefined, [0.05, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.27]);
    mb.anchor('eject', [0, -0.03, 0.02]);
    mb.anchor('magwell', [0, 0.09, -0.04]);
    return { hip: [0.14, -0.14, -0.31], eye: 0.2, twoHand: true };
  },
  // ---------------------------------------------------------- rifles
  akm(mb) {
    akBody(mb, C.BLACK, C.WOOD, true);
    curvedMag(mb, 0.026, 0.19, 0.045, [0, 0.0, -0.06], 0x4a2a24, 28, 'mag', 'poly');
    return { hip: [0.15, -0.14, -0.34], eye: 0.3, twoHand: true };
  },
  m16(mb) {
    arBody(mb, C.BLACK, true, false);
    boxMag(mb, 0.026, 0.16, 0.05, [0, 0.0, -0.06], 0x55595f, 6);
    return { hip: [0.15, -0.15, -0.34], eye: 0.3, twoHand: true };
  },
  m4(mb) {
    arBody(mb, C.BLACK, false, true);
    boxMag(mb, 0.026, 0.15, 0.05, [0, 0.0, -0.06], C.DARK, 6);
    return { hip: [0.15, -0.15, -0.33], eye: 0.28, twoHand: true };
  },
  aug(mb) {
    const G = 0x5d6a4a;
    mb.box([0.05, 0.08, 0.44], [0, 0.03, -0.06], G);
    mb.box([0.052, 0.03, 0.14], [0, -0.02, 0.06], G);
    mb.fbox([0.054, 0.09, 0.016], [0, 0.024, 0.164], C.RUBBER, 'rubber');
    mb.box([0.04, 0.012, 0.3], [0, 0.074, -0.06], G);
    ejectPort(mb, 0.025, 0.04, 0.06, 0.02, 0.05);
    mb.box([0.006, 0.02, 0.05], [-0.026, 0.04, 0.06], G); // left port cover
    pins(mb, 0.025, [[0.0, 0.1], [0.04, -0.14]], 0.003);
    barrel(mb, 0.011, 0.16, -0.28, 0.04, C.BLACK);
    for (let i = 0; i < 4; i++) mb.cyl(0.0125, 0.004, [0, 0.04, -0.3 - i * 0.022], C.BLACK, undefined, 'z', 10);
    flashHider(mb, 0.011, -0.44, 0.04);
    const fg = mb.frame([0, -0.01, -0.2], [0.1, 0, 0]);
    mb.box([0.026, 0.07, 0.03], [0, -0.035, 0], G, fg);
    mb.box([0.03, 0.01, 0.036], [0, -0.072, 0], G, fg);
    // enclosed trigger guard spanning grip to foregrip
    mb.box([0.03, 0.012, 0.22], [0, -0.1, -0.1], G);
    mb.box([0.026, 0.06, 0.02], [0, -0.07, 0.0], G);
    const f = pistolGrip(mb, -0.02, G, 10, 0.09, 0.03, 0.045, undefined, { grooves: 3 });
    void f;
    const tr = mb.part('trigger', [0, -0.018, -0.06]);
    mb.box([0.006, 0.02, 0.008], [0, -0.012, 0], C.BLACK, tr);
    boxMag(mb, 0.026, 0.14, 0.05, [0, -0.01, 0.07], 0x8a9a8a, 8);
    mb.fbox([0.024, 0.1, 0.046], [0, -0.07, 0.074], 0x55635a, 'glass', 'mag');
    scope(mb, 0.14, 0.018, -0.04, 0.1, G);
    support(mb, [0, -0.05, -0.2], 'grip', undefined, [0.1, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.49]);
    mb.anchor('eject', [0.028, 0.04, 0.08]);
    mb.anchor('magwell', [0, -0.13, 0.08]);
    return { hip: [0.15, -0.15, -0.32], eye: 0.16, twoHand: true };
  },
  scarh(mb, v) {
    arBody(mb, C.TAN, false, true, C.TAN);
    boxMag(mb, 0.03, v.includes('optic') ? 0.17 : 0.13, 0.055, [0, 0.0, -0.06], C.BLACK, 6);
    if (v.includes('optic')) redDot(mb, 0.0, 0.085);
    return { hip: [0.15, -0.15, -0.34], eye: 0.28, twoHand: true };
  },
  // ---------------------------------------------------------- MGs
  bar(mb, v) {
    const B = C.BLUED;
    mb.box([0.04, 0.06, 0.34], [0, 0.03, -0.12], B);
    mb.box([0.034, 0.01, 0.32], [0, 0.064, -0.12], B);
    ejectPort(mb, 0.02, 0.04, -0.1, 0.018, 0.05);
    pins(mb, 0.02, [[0.004, 0.02], [0.01, -0.22], [0.02, -0.06]], 0.003);
    lever(mb, -0.021, 0.01, 0.0, 0.022, 0.5, C.STEEL);
    mb.box([0.012, 0.014, 0.02], [-0.024, 0.04, -0.12], C.STEEL); // charging handle
    barrel(mb, 0.012, 0.36, -0.29, 0.04, B);
    mb.cyl(0.008, 0.2, [0, 0.012, -0.4], B, undefined, 'z', 10); // gas cylinder
    mb.box([0.034, 0.03, 0.2], [0, 0.005, -0.34], C.WOOD);
    for (let i = 0; i < 6; i++) mb.box([0.036, 0.004, 0.02], [0, 0.021, -0.27 - i * 0.026], C.WOOD_D);
    mb.cyl(0.015, 0.03, [0, 0.04, -0.64], B, undefined, 'z', 12); // muzzle
    triggerGuard(mb, 0.016, B, 0.05);
    pistolGrip(mb, 0.046, C.WOOD, 28, 0.075, 0.03, 0.045);
    stockSolid(mb, 0.06, 0.3, C.WOOD, 0.05, 0.075);
    boxMag(mb, 0.03, v.includes('extmag') ? 0.2 : 0.12, 0.055, [0, 0.0, -0.08], B, 0);
    bipod(mb, -0.52, 0.02, 0.13);
    rearSight(mb, 0.0, 0.065, undefined, false);
    mb.box([0.022, 0.022, 0.012], [0, 0.074, 0.0], B);
    frontSight(mb, -0.63, 0.055, undefined, false);
    support(mb, [0, -0.012, -0.33], 'cup');
    mb.anchor('muzzle', [0, 0.04, -0.66]);
    mb.anchor('eject', [0.022, 0.045, -0.08]);
    mb.anchor('sight', [0, 0.074, 0.05]);
    mb.anchor('magwell', [0, -0.1, -0.08]);
    return { hip: [0.16, -0.16, -0.34], eye: 0.3, twoHand: true };
  },
  m1922(mb, v) {
    MODELS.bar(mb, v.filter((x) => x !== 'drum'));
    for (let i = 0; i < 9; i++) mb.cyl(0.02, 0.006, [0, 0.04, -0.34 - i * 0.02], C.DARK, undefined, 'z', 14);
    if (v.includes('drum')) {
      const old = mb.parts.mag;
      old.visible = false;
      old.name = 'oldmag';
      drumMag(mb, 0.07, 0.06, [0, 0.0, -0.08], C.BLUED);
    }
    return { hip: [0.16, -0.16, -0.34], eye: 0.3, twoHand: true };
  },
  m249(mb) {
    lmgBody(mb, C.BLACK, 0.5, false);
    return { hip: [0.16, -0.17, -0.34], eye: 0.3, twoHand: true };
  },
  pkm(mb) {
    lmgBody(mb, C.BLACK, 0.58, true, C.WOOD);
    // fluted barrel and big gas block
    for (let i = 0; i < 6; i++) mb.fbox([0.004, 0.004, 0.06], [-0.012, 0.035, -0.3 - i * 0.07], shade(C.DARK, 0.7), 'metal');
    return { hip: [0.16, -0.17, -0.35], eye: 0.3, twoHand: true };
  },
  m240(mb) {
    lmgBody(mb, C.GUNMETAL, 0.56, false);
    rail(mb, 0.2, -0.1, 0.09);
    return { hip: [0.16, -0.17, -0.35], eye: 0.3, twoHand: true };
  },
  mg42(mb) {
    mb.box([0.05, 0.07, 0.3], [0, 0.03, -0.08], C.BLACK);
    ejectPort(mb, 0.025, 0.0, -0.08, 0.02, 0.05);
    mb.cyl(0.024, 0.34, [0, 0.035, -0.4], C.DARK, undefined, 'z', 14);
    // barrel jacket with oval cooling slots
    for (let i = 0; i < 10; i++) {
      mb.fbox([0.05, 0.012, 0.018], [0, 0.035, -0.25 - i * 0.03], C.BORE, 'rubber');
      mb.fbox([0.012, 0.05, 0.014], [0, 0.035, -0.26 - i * 0.03], C.BORE, 'rubber');
    }
    barrel(mb, 0.01, 0.06, -0.56, 0.035, C.BLACK);
    mb.cyl(0.02, 0.03, [0, 0.035, -0.585], C.BLACK, undefined, 'z', 12); // recoil booster
    pins(mb, 0.025, [[0.01, 0.02], [0.03, -0.2]], 0.003);
    triggerGuard(mb, 0.012, C.BLACK, 0.05);
    pistolGrip(mb, 0.042, C.POLY, 25, 0.08, 0.03, 0.045, undefined, { grooves: 3 });
    stockSolid(mb, 0.07, 0.26, C.WOOD, 0.04, 0.07);
    const cover = mb.part('cover', [0, 0.07, -0.05]);
    mb.box([0.05, 0.012, 0.14], [0, 0, -0.07], C.DARK, cover);
    mb.box([0.03, 0.008, 0.06], [0, 0.008, -0.1], C.DARK, cover);
    mb.box([0.014, 0.014, 0.014], [0.018, 0.004, 0.0], C.STEEL, cover); // latch
    drumMag(mb, 0.05, 0.06, [-0.045, 0.02, -0.08], C.OD);
    bipod(mb, -0.52, 0.01, 0.13);
    rearSight(mb, 0.0, 0.07, undefined, false);
    frontSight(mb, -0.55, 0.06, undefined, false);
    support(mb, [0, -0.014, -0.25], 'cup');
    mb.anchor('muzzle', [0, 0.035, -0.63]);
    mb.anchor('eject', [0, -0.01, -0.08]);
    mb.anchor('sight', [0, 0.1, 0.03]);
    mb.anchor('magwell', [-0.04, 0.0, -0.08]);
    return { hip: [0.16, -0.17, -0.35], eye: 0.3, twoHand: true };
  },
  minigun(mb) {
    mb.box([0.09, 0.1, 0.22], [0, 0.0, 0.0], C.DARK);
    for (let i = 0; i < 4; i++) mb.fbox([0.092, 0.012, 0.02], [0, 0.028 - i * 0.02, 0.06], shade(C.DARK, 0.7), 'metal'); // cooling ribs
    mb.cyl(0.045, 0.1, [0, 0.0, 0.14], C.BLACK, undefined, 'z', 16); // motor
    mb.cyl(0.03, 0.02, [0, 0.0, 0.2], C.DARK, undefined, 'z', 14);
    for (let i = 0; i < 6; i++) mb.fbox([0.004, 0.09, 0.08], [0, 0, 0.14], shade(C.BLACK, 0.8), 'metal', undefined, [0, 0, (i / 6) * Math.PI]);
    pins(mb, 0.045, [[0.03, -0.08], [-0.03, -0.08], [0.03, 0.08]], 0.004);
    const spin = mb.part('spin', [0, 0.0, -0.12]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.cyl(0.009, 0.5, [Math.cos(a) * 0.028, Math.sin(a) * 0.028, -0.25], C.STEEL, spin, 'z', 8);
      mb.cyl(0.005, 0.002, [Math.cos(a) * 0.028, Math.sin(a) * 0.028, -0.501], C.BORE, spin, 'z', 8);
    }
    mb.cyl(0.042, 0.02, [0, 0, -0.05], C.BLACK, spin, 'z', 16);
    mb.cyl(0.042, 0.02, [0, 0, -0.44], C.BLACK, spin, 'z', 16);
    mb.cyl(0.042, 0.012, [0, 0, -0.25], C.DARK, spin, 'z', 16);
    mb.box([0.03, 0.12, 0.03], [0, 0.1, 0.02], C.BLACK); // top handle
    mb.box([0.12, 0.03, 0.03], [0, 0.15, 0.02], C.BLACK);
    mb.fbox([0.05, 0.034, 0.034], [-0.035, 0.15, 0.02], C.RUBBER, 'rubber');
    const gf = mb.frame([0, -0.05, 0.08], [0.2, 0, 0]);
    mb.fbox([0.03, 0.1, 0.03], [0, -0.04, 0], C.POLY, 'rubber', gf);
    mb.box([0.036, 0.012, 0.036], [0, -0.092, 0], C.BLACK, gf);
    const belt = mb.part('mag', [0.07, -0.04, 0.04]);
    mb.box([0.03, 0.1, 0.08], [0, -0.03, 0], C.OD, belt);
    mb.box([0.034, 0.014, 0.084], [0, 0.02, 0], shade(C.OD, 0.8), belt);
    for (let i = 0; i < 5; i++) mb.fbox([0.01, 0.012, 0.04], [0.02, 0.03 - i * 0.015, 0], C.BRASS, 'polish', belt);
    mb.anchor('grip', [0, -0.07, 0.08], undefined, [0.2, 0, 0]);
    support(mb, [-0.035, 0.15, 0.02], 'grip', undefined, [0, 0, Math.PI / 2]);
    mb.anchor('muzzle', [0, 0.0, -0.62]);
    mb.anchor('eject', [0.05, -0.04, 0.0]);
    mb.anchor('sight', [0, 0.18, 0.02]);
    mb.anchor('magwell', [0.07, -0.06, 0.04]);
    return { hip: [0.14, -0.22, -0.38], eye: 0.3, twoHand: true };
  },
  m2(mb) {
    const O = C.OD;
    mb.box([0.08, 0.1, 0.34], [0, 0.03, -0.05], O);
    for (let i = 0; i < 6; i++) mb.cyl(0.0035, 0.0018, [-0.0408, 0.06 - (i % 2) * 0.05, -0.18 + Math.floor(i / 2) * 0.13], C.STEEL, undefined, 'x', 8); // rivets
    mb.cyl(0.03, 0.2, [0, 0.03, -0.3], C.DARK, undefined, 'z', 14);
    for (let i = 0; i < 6; i++) mb.fbox([0.062, 0.014, 0.012], [0, 0.03, -0.22 - i * 0.03], C.BORE, 'rubber');
    barrel(mb, 0.016, 0.4, -0.4, 0.03, C.DARK, undefined, 12);
    for (let i = 0; i < 8; i++) mb.cyl(0.018, 0.006, [0, 0.03, -0.42 - i * 0.045], C.DARK, undefined, 'z', 12);
    mb.cyl(0.024, 0.05, [0, 0.03, -0.83], C.BLACK, undefined, 'z', 14);
    mb.box([0.02, 0.06, 0.02], [-0.04, -0.02, 0.14], C.BLACK); // spade grips
    mb.box([0.02, 0.06, 0.02], [0.04, -0.02, 0.14], C.BLACK);
    mb.fbox([0.024, 0.05, 0.024], [-0.04, -0.03, 0.14], C.WOOD_D, 'wood');
    mb.fbox([0.024, 0.05, 0.024], [0.04, -0.03, 0.14], C.WOOD_D, 'wood');
    mb.box([0.1, 0.02, 0.02], [0, 0.01, 0.14], C.BLACK);
    mb.box([0.03, 0.02, 0.012], [0, -0.004, 0.13], C.STEEL); // butterfly trigger
    mb.box([0.012, 0.03, 0.02], [0.045, 0.06, -0.02], C.STEEL); // charging handle
    const cover = mb.part('cover', [0, 0.08, 0.05]);
    mb.box([0.082, 0.014, 0.2], [0, 0, -0.1], O, cover);
    mb.box([0.02, 0.02, 0.02], [0, 0.014, 0.0], C.STEEL, cover);
    const box = mb.part('mag', [-0.08, -0.02, -0.03]);
    mb.box([0.06, 0.12, 0.15], [0, -0.03, 0], O, box);
    mb.box([0.064, 0.012, 0.154], [0, 0.03, 0], shade(O, 0.8), box);
    mb.fbox([0.04, 0.012, 0.02], [0, 0.04, 0], C.STEEL, 'metal', box); // handle
    for (let i = 0; i < 4; i++) mb.fbox([0.03, 0.014, 0.012], [0.04, 0.03, -0.04 + i * 0.025], C.BRASS, 'polish', box);
    mb.box([0.03, 0.05, 0.03], [0, 0.11, 0.1], C.BLACK); // leaf sight
    mb.anchor('grip', [0.04, -0.02, 0.14], undefined, [0, 0, 0]);
    support(mb, [-0.04, -0.02, 0.14], 'grip', undefined, [0, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.86]);
    mb.anchor('eject', [0, -0.02, -0.02]);
    mb.anchor('sight', [0, 0.1, 0.12]);
    mb.anchor('magwell', [-0.08, 0.0, -0.03]);
    return { hip: [0.1, -0.2, -0.45], eye: 0.3, twoHand: true };
  },
  // ---------------------------------------------------------- marksman / snipers
  garand(mb) {
    const B = C.BLUED;
    mb.box([0.04, 0.05, 0.22], [0, 0.03, -0.07], B);
    mb.box([0.034, 0.01, 0.12], [0, 0.058, 0.0], B);
    barrel(mb, 0.011, 0.5, -0.18, 0.04, B);
    mb.cyl(0.008, 0.36, [0, 0.022, -0.44], B, undefined, 'z', 10); // gas cylinder / op rod
    mb.box([0.016, 0.022, 0.02], [0, 0.026, -0.63], B); // gas lock
    mb.box([0.042, 0.038, 0.4], [0, 0.012, -0.34], C.WOOD);
    mb.box([0.03, 0.02, 0.22], [0, 0.05, -0.3], C.WOOD); // upper handguard
    mb.box([0.032, 0.012, 0.06], [0, 0.05, -0.43], C.WOOD);
    for (const z of [-0.2, -0.48]) mb.box([0.046, 0.05, 0.012], [0, 0.03, z], B); // bands
    mb.cyl(0.004, 0.012, [0, -0.012, -0.48], C.STEEL, undefined, 'y', 8); // sling swivel
    const clip = mb.part('clip', [0, 0.056, -0.06]);
    mb.box([0.03, 0.02, 0.04], [0, 0, 0], C.BRASS, clip);
    for (let i = 0; i < 4; i++) mb.fbox([0.008, 0.006, 0.036], [-0.011 + i * 0.0073, 0.011, 0.0], C.BRASS, 'polish', clip);
    const bolt = mb.part('bolt', [0.024, 0.04, -0.07]);
    mb.box([0.012, 0.012, 0.04], [0, 0, 0], C.STEEL, bolt);
    mb.box([0.012, 0.01, 0.2], [0.004, -0.012, -0.12], B, bolt); // op rod
    mb.box([0.016, 0.014, 0.01], [0.006, 0.0, 0.02], C.STEEL, bolt); // op rod handle
    triggerGuard(mb, 0.02, B, 0.05);
    stockSolid(mb, 0.03, 0.34, C.WOOD, 0.07, 0.07);
    mb.box([0.016, 0.02, 0.02], [0, 0.07, 0.022], B); // aperture sight
    mb.cyl(0.004, 0.004, [0, 0.074, 0.013], C.BORE, undefined, 'z', 8);
    mb.cyl(0.006, 0.006, [-0.011, 0.066, 0.022], B, undefined, 'x', 10);
    frontSight(mb, -0.66, 0.05, undefined, false);
    grip(mb, [0, -0.01, 0.062], [-0.58, 0, 0]);
    support(mb, [0, -0.008, -0.32], 'cup');
    mb.anchor('muzzle', [0, 0.04, -0.69]);
    mb.anchor('eject', [0.02, 0.07, -0.06]);
    mb.anchor('sight', [0, 0.072, 0.05]);
    mb.anchor('magwell', [0, 0.08, -0.06]);
    return { hip: [0.15, -0.14, -0.34], eye: 0.3, twoHand: true };
  },
  vss(mb) {
    mb.box([0.04, 0.055, 0.2], [0, 0.03, -0.05], C.BLACK);
    mb.box([0.034, 0.01, 0.18], [0, 0.062, -0.05], C.BLACK);
    ejectPort(mb, 0.02, 0.04, -0.04, 0.016, 0.04);
    lever(mb, 0.021, 0.02, -0.06, 0.05, 0.1, C.BLACK); // AK safety (right)
    mb.cyl(0.024, 0.3, [0, 0.035, -0.3], C.DARK, undefined, 'z', 14); // integral suppressor
    for (let i = 0; i < 5; i++) mb.cyl(0.0245, 0.004, [0, 0.035, -0.19 - i * 0.05], C.BLACK, undefined, 'z', 14);
    mb.cyl(0.02, 0.004, [0, 0.035, -0.4512], C.BLACK, undefined, 'z', 14);
    mb.cyl(0.006, 0.002, [0, 0.035, -0.4522], C.BORE, undefined, 'z', 10);
    mb.box([0.042, 0.035, 0.14], [0, 0.005, -0.2], C.WOOD);
    for (let i = 0; i < 4; i++) mb.box([0.044, 0.004, 0.02], [0, 0.02, -0.15 - i * 0.03], C.WOOD_D);
    triggerGuard(mb, 0.004, C.BLACK, 0.045);
    // skeleton thumbhole stock
    mb.box([0.03, 0.012, 0.25], [0, 0.0, 0.18], C.WOOD, undefined, [0.12, 0, 0]);
    mb.box([0.03, 0.08, 0.02], [0, -0.03, 0.3], C.WOOD);
    mb.box([0.03, 0.012, 0.24], [0, -0.066, 0.19], C.WOOD);
    mb.fbox([0.032, 0.09, 0.012], [0, -0.03, 0.316], C.RUBBER, 'rubber');
    const f = pistolGrip(mb, 0.036, C.WOOD, 16, 0.08, 0.03, 0.045, undefined, { noAnchor: true });
    mb.anchor('grip', [0, -0.034, 0.002], f);
    boxMag(mb, 0.026, 0.1, 0.045, [0, 0.0, -0.06], C.BLACK, 4);
    scope(mb, 0.16, 0.017, -0.04, 0.095, C.BLACK);
    support(mb, [0, -0.013, -0.2], 'cup');
    mb.anchor('muzzle', [0, 0.035, -0.46]);
    mb.anchor('eject', [0.022, 0.045, -0.05]);
    mb.anchor('magwell', [0, -0.1, -0.06]);
    return { hip: [0.15, -0.15, -0.33], eye: 0.12, twoHand: true };
  },
  k98(mb) {
    const B = C.BLUED;
    mb.box([0.036, 0.045, 0.22], [0, 0.03, -0.07], B);
    mb.cyl(0.016, 0.1, [0, 0.042, -0.02], B, undefined, 'z', 12); // receiver ring
    barrel(mb, 0.01, 0.56, -0.18, 0.04, B);
    mb.box([0.04, 0.036, 0.46], [0, 0.012, -0.36], C.WOOD);
    mb.box([0.028, 0.016, 0.2], [0, 0.046, -0.32], C.WOOD); // upper handguard
    for (const z of [-0.26, -0.52]) mb.box([0.044, 0.05, 0.01], [0, 0.024, z], B);
    mb.box([0.04, 0.04, 0.02], [0, 0.024, -0.6], B); // nose cap
    mb.cyl(0.0035, 0.04, [0, -0.008, -0.6], C.STEEL, undefined, 'z', 8); // cleaning rod
    const bolt = mb.part('bolt', [0.024, 0.04, 0.02]);
    mb.box([0.024, 0.008, 0.008], [0.012, 0, 0], C.STEEL, bolt);
    mb.cyl(0.007, 0.012, [0.028, -0.006, 0], C.STEEL, bolt, 'y', 10); // bolt knob
    mb.box([0.012, 0.012, 0.06], [-0.012, 0, -0.03], C.STEEL, bolt);
    mb.box([0.01, 0.01, 0.014], [-0.012, 0.0, 0.006], C.STEEL, bolt); // safety wing
    triggerGuard(mb, 0.024, B, 0.05);
    mb.box([0.012, 0.006, 0.05], [0, -0.01, -0.02], B); // floorplate
    stockSolid(mb, 0.04, 0.32, C.WOOD, 0.07, 0.07);
    mb.cyl(0.004, 0.036, [0, -0.02, 0.2], C.STEEL, undefined, 'x', 8); // stock disc
    scope(mb, 0.2, 0.017, -0.06, 0.085, C.BLACK);
    grip(mb, [0, -0.008, 0.064], [-0.58, 0, 0]);
    support(mb, [0, -0.008, -0.3], 'cup');
    mb.anchor('muzzle', [0, 0.04, -0.75]);
    mb.anchor('eject', [0.02, 0.05, -0.05]);
    mb.anchor('magwell', [0, 0.06, -0.05]);
    return { hip: [0.15, -0.14, -0.34], eye: 0.12, twoHand: true };
  },
  srs(mb) {
    mb.box([0.05, 0.08, 0.46], [0, 0.03, -0.02], C.BLACK);
    for (let i = 0; i < 6; i++) mb.fbox([0.0506, 0.01, 0.04], [0, 0.04, -0.2 + i * 0.07], shade(C.BLACK, 0.7), 'metal'); // lightening cuts
    mb.fbox([0.052, 0.07, 0.016], [0, 0.03, 0.216], C.RUBBER, 'rubber');
    mb.box([0.034, 0.02, 0.1], [0, 0.08, 0.15], C.POLY); // cheek piece
    mb.cyl(0.02, 0.2, [0, 0.04, -0.34], C.DARK, undefined, 'z', 14);
    muzzleBrake(mb, 0.012, 0.05, -0.44, 0.04, C.BLACK, 3);
    rail(mb, 0.28, -0.05, 0.075);
    const f = pistolGrip(mb, -0.02, C.POLY, 14, 0.088, 0.03, 0.045, undefined, { grooves: 3 });
    void f;
    triggerGuard(mb, -0.042, C.BLACK, 0.045);
    boxMag(mb, 0.03, 0.08, 0.05, [0, -0.01, 0.1], C.DARK);
    const bolt = mb.part('bolt', [0.03, 0.05, 0.14]);
    mb.box([0.03, 0.01, 0.01], [0.012, 0, 0], C.STEEL, bolt);
    mb.cyl(0.007, 0.012, [0.03, 0, 0], C.BLACK, bolt, 'y', 10);
    scope(mb, 0.22, 0.019, -0.04, 0.1, C.BLACK);
    bipod(mb, -0.2, -0.01, 0.12);
    support(mb, [0, -0.012, -0.22], 'cup');
    mb.anchor('muzzle', [0, 0.04, -0.5]);
    mb.anchor('eject', [0.03, 0.05, 0.12]);
    mb.anchor('magwell', [0, -0.08, 0.1]);
    return { hip: [0.15, -0.15, -0.3], eye: 0.12, twoHand: true };
  },
  awm(mb) {
    const G = 0x4f5a3a;
    mb.box([0.05, 0.06, 0.34], [0, 0.03, -0.06], G);
    mb.box([0.036, 0.022, 0.18], [0, 0.066, -0.05], C.BLACK); // action
    mb.box([0.03, 0.03, 0.1], [0, 0.06, -0.25], G); // forend top
    for (let i = 0; i < 4; i++) mb.fbox([0.0506, 0.012, 0.03], [0, 0.03, -0.14 - i * 0.045], shade(G, 0.75), 'poly');
    barrel(mb, 0.012, 0.5, -0.22, 0.04, C.BLACK, undefined, 14);
    muzzleBrake(mb, 0.016, 0.06, -0.71, 0.04, C.BLACK, 3);
    const bolt = mb.part('bolt', [0.028, 0.05, 0.04]);
    mb.box([0.03, 0.01, 0.01], [0.012, 0, 0], C.STEEL, bolt);
    mb.cyl(0.008, 0.014, [0.03, -0.004, 0], C.BLACK, bolt, 'y', 12);
    mb.box([0.012, 0.012, 0.06], [-0.01, 0.0, -0.03], C.STEEL, bolt);
    triggerGuard(mb, 0.02, C.BLACK, 0.05);
    // thumbhole stock with adjustable cheek and butt
    mb.box([0.046, 0.075, 0.28], [0, -0.02, 0.2], G);
    mb.box([0.046, 0.04, 0.1], [0, -0.035, 0.08], G);
    mb.box([0.03, 0.02, 0.1], [0, 0.03, 0.2], C.BLACK); // cheek piece
    mb.fbox([0.05, 0.1, 0.016], [0, -0.02, 0.35], C.RUBBER, 'rubber');
    mb.box([0.02, 0.05, 0.02], [0, -0.075, 0.3], C.BLACK); // monopod
    const f = pistolGrip(mb, 0.046, G, 12, 0.08, 0.032, 0.05, undefined, { noAnchor: true });
    mb.anchor('grip', [0, -0.034, 0.002], f);
    boxMag(mb, 0.03, 0.08, 0.05, [0, 0.0, -0.06], C.BLACK);
    scope(mb, 0.26, 0.022, -0.06, 0.1, C.BLACK);
    bipod(mb, -0.3, 0.0, 0.14);
    support(mb, [0, -0.005, -0.24], 'cup');
    mb.anchor('muzzle', [0, 0.04, -0.78]);
    mb.anchor('eject', [0.026, 0.05, -0.04]);
    mb.anchor('magwell', [0, -0.08, -0.06]);
    return { hip: [0.15, -0.15, -0.34], eye: 0.12, twoHand: true };
  },
  barrett(mb) {
    mb.box([0.06, 0.09, 0.42], [0, 0.03, -0.06], C.BLACK);
    mb.box([0.05, 0.02, 0.3], [0, 0.08, -0.08], C.BLACK);
    rail(mb, 0.3, -0.08, 0.093);
    for (let i = 0; i < 5; i++) mb.cyl(0.004, 0.0018, [-0.0305, 0.05, -0.2 + i * 0.07], C.STEEL, undefined, 'x', 8); // rivets
    ejectPort(mb, 0.03, 0.04, -0.02, 0.03, 0.08);
    pins(mb, 0.03, [[0.0, 0.1], [0.0, -0.2]], 0.004);
    barrel(mb, 0.016, 0.6, -0.27, 0.05, C.DARK, undefined, 14);
    for (let i = 0; i < 8; i++) mb.fbox([0.004, 0.004, 0.05], [-0.013, 0.05 + (i % 2 ? 0.006 : -0.006), -0.35 - Math.floor(i / 2) * 0.1], shade(C.DARK, 0.7), 'metal'); // flutes
    // big double-chamber muzzle brake
    mb.box([0.07, 0.04, 0.08], [0, 0.05, -0.9], C.BLACK);
    for (let i = 0; i < 2; i++) mb.fbox([0.072, 0.03, 0.016], [0, 0.05, -0.88 - i * 0.04], C.BORE, 'rubber');
    mb.cyl(0.011, 0.002, [0, 0.05, -0.9408], C.BORE, undefined, 'z', 12);
    triggerGuard(mb, 0.024, C.BLACK, 0.05);
    pistolGrip(mb, 0.058, C.POLY, 20, 0.092, 0.034, 0.05, undefined, { grooves: 3 });
    stockSolid(mb, 0.15, 0.24, C.BLACK, 0.0, 0.1, 0.05);
    boxMag(mb, 0.04, 0.12, 0.07, [0, -0.01, -0.02], C.DARK);
    bipod(mb, -0.6, 0.03, 0.16);
    scope(mb, 0.28, 0.024, -0.08, 0.125, C.BLACK);
    support(mb, [0, -0.02, -0.3], 'cup');
    mb.anchor('muzzle', [0, 0.05, -0.94]);
    mb.anchor('eject', [0.032, 0.05, -0.03]);
    mb.anchor('magwell', [0, -0.12, -0.02]);
    return { hip: [0.15, -0.17, -0.34], eye: 0.12, twoHand: true };
  },
  // ---------------------------------------------------------- launchers
  rpg(mb) {
    mb.cyl(0.025, 0.95, [0, 0.03, -0.1], C.OD, undefined, 'z', 14);
    mb.cyl(0.028, 0.03, [0, 0.03, -0.56], C.OD, undefined, 'z', 14);
    mb.box([0.056, 0.056, 0.26], [0, 0.03, -0.12], C.WOOD); // heat shield
    for (let i = 0; i < 3; i++) mb.box([0.058, 0.058, 0.006], [0, 0.03, -0.02 - i * 0.1], C.BLACK);
    mb.cyl(0.035, 0.1, [0, 0.03, 0.39], C.OD, undefined, 'z', 14, 0, undefined, 0.028); // rear cone
    mb.cyl(0.03, 0.002, [0, 0.03, 0.4408], C.BORE, undefined, 'z', 14);
    triggerGuard(mb, -0.006, C.DARK, 0.045);
    pistolGrip(mb, 0.02, C.WOOD, 12, 0.085, 0.03, 0.045);
    const fg = mb.frame([0, 0.0, -0.2], [0.05, 0, 0]);
    mb.box([0.026, 0.08, 0.03], [0, -0.04, 0], C.WOOD, fg);
    mb.box([0.03, 0.03, 0.05], [-0.04, 0.07, -0.06], C.BLACK); // optic
    mb.cyl(0.01, 0.02, [-0.04, 0.07, -0.035], C.BLACK, undefined, 'z', 10);
    mb.cyl(0.009, 0.002, [-0.04, 0.07, -0.0245], C.GLASS, undefined, 'z', 10, 0, 'glass');
    mb.box([0.02, 0.012, 0.03], [-0.025, 0.05, -0.06], C.BLACK);
    frontSight(mb, -0.52, 0.055, undefined, false);
    const rocket = mb.part('rocket', [0, 0.03, -0.57]);
    mb.cyl(0.02, 0.08, [0, 0, 0.02], C.OD, rocket, 'z', 12);
    mb.cyl(0.045, 0.12, [0, 0, -0.08], C.OD, rocket, 'z', 14);
    mb.cyl(0.046, 0.01, [0, 0, -0.03], 0x3a4424, rocket, 'z', 14);
    mb.cyl(0.045, 0.14, [0, 0, -0.21], C.OD, rocket, 'z', 14, 0, undefined, 0.006); // warhead cone
    mb.cyl(0.006, 0.02, [0, 0, -0.29], C.STEEL, rocket, 'z', 8); // fuze
    support(mb, [0, -0.074, -0.2], 'grip', undefined, [0.05, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.6]);
    mb.anchor('eject', [0, 0.03, 0.44]);
    mb.anchor('sight', [-0.04, 0.1, -0.03]);
    mb.anchor('magwell', [0, 0.03, -0.6]);
    return { hip: [0.12, -0.13, -0.32], eye: 0.24, twoHand: true };
  },
  m79(mb) {
    const brk = mb.part('break', [0, 0.03, -0.05]);
    mb.cyl(0.024, 0.32, [0, 0.01, -0.16], 0x3e4a2e, brk, 'z', 16);
    mb.cyl(0.018, 0.002, [0, 0.01, -0.3208], C.BORE, brk, 'z', 14);
    mb.box([0.05, 0.04, 0.16], [0, -0.02, -0.12], C.WOOD, brk);
    mb.box([0.02, 0.05, 0.004], [0, 0.07, -0.06], C.BLACK, brk); // leaf sight
    mb.box([0.024, 0.006, 0.02], [0, 0.044, -0.06], C.BLACK, brk);
    frontSight(mb, -0.3, 0.036, 'break', false);
    mb.box([0.04, 0.06, 0.08], [0, 0.02, 0.0], C.DARK);
    mb.box([0.014, 0.012, 0.024], [0, 0.056, 0.02], C.STEEL); // barrel latch
    pins(mb, 0.02, [[0.0, -0.03]], 0.004);
    triggerGuard(mb, 0.02, C.DARK, 0.05);
    stockSolid(mb, 0.04, 0.26, C.WOOD, 0.06, 0.07, 0.04);
    grip(mb, [0, -0.008, 0.06], [-0.55, 0, 0]);
    support(mb, [0, -0.04, -0.16], 'cup', brk);
    mb.anchor('muzzle', [0, 0.04, -0.38]);
    mb.anchor('eject', [0, 0.05, -0.05]);
    mb.anchor('sight', [0, 0.1, 0.03]);
    mb.anchor('magwell', [0, 0.05, -0.06]);
    return { hip: [0.15, -0.14, -0.33], eye: 0.28, twoHand: true };
  },
  m32(mb) {
    const cyl = mb.part('cylinder', [0, 0.02, -0.12]);
    mb.cyl(0.065, 0.13, [0, 0, 0], C.BLACK, cyl, 'z', 18);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.cyl(0.021, 0.132, [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0], C.DARK, cyl, 'z', 12);
      mb.cyl(0.015, 0.002, [Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.067], C.BORE, cyl, 'z', 10);
    }
    mb.cyl(0.024, 0.2, [0, 0.05, -0.3], C.BLACK, undefined, 'z', 14);
    mb.cyl(0.018, 0.002, [0, 0.05, -0.4008], C.BORE, undefined, 'z', 12);
    rail(mb, 0.25, -0.26, 0.08);
    mb.box([0.03, 0.03, 0.2], [0, 0.07, -0.08], C.BLACK);
    mb.box([0.03, 0.12, 0.02], [0, 0.02, -0.19], C.BLACK); // front frame
    mb.box([0.03, 0.12, 0.02], [0, 0.02, -0.05], C.BLACK); // rear frame
    mb.box([0.03, 0.08, 0.07], [0, 0.03, -0.005], C.BLACK); // receiver body
    mb.cyl(0.006, 0.034, [0, 0.05, -0.02], C.STEEL, undefined, 'x', 10); // cylinder pivot
    triggerGuard(mb, 0.004, C.BLACK, 0.05);
    pistolGrip(mb, 0.034, C.POLY, 18, 0.09, 0.034, 0.05, undefined, { grooves: 3 });
    const fg = mb.frame([0, -0.0, -0.3], [0.05, 0, 0]);
    mb.box([0.03, 0.08, 0.03], [0, -0.04, 0], C.POLY, fg);
    stockSkeleton(mb, 0.05, 0.22, C.BLACK);
    redDot(mb, -0.12, 0.085);
    support(mb, [0, -0.07, -0.3], 'grip', undefined, [0.05, 0, 0]);
    mb.anchor('muzzle', [0, 0.05, -0.41]);
    mb.anchor('eject', [0, 0.02, -0.12]);
    mb.anchor('magwell', [0.06, 0.02, -0.12]);
    return { hip: [0.15, -0.16, -0.34], eye: 0.22, twoHand: true };
  },
  // ---------------------------------------------------------- bows
  bow(mb) {
    return bowModel(mb, C.WOOD_D, C.WOOD, false, false);
  },
  rambo(mb) {
    return bowModel(mb, C.BLACK, 0x4b5a33, true, false);
  },
  sunstrike(mb) {
    return bowModel(mb, 0xd8b040, 0xfff0a0, false, true);
  },
  // ---------------------------------------------------------- energy / flame / particle
  laser(mb) {
    const W = 0xdcdcdc;
    mb.box([0.06, 0.09, 0.4], [0, 0.03, -0.1], W);
    mb.box([0.064, 0.03, 0.3], [0, 0.07, -0.12], C.BLACK);
    for (let i = 0; i < 6; i++) mb.fbox([0.062, 0.006, 0.02], [0, 0.0, -0.02 - i * 0.04], 0x9aa0a8, 'poly'); // panel seams
    for (const s of [-1, 1]) mb.box([0.002, 0.012, 0.18], [s * 0.031, 0.04, -0.12], C.GLOW_B, undefined, undefined, 0x1060c0); // light strips
    const coil = mb.part('coil', [0, 0.03, -0.32]);
    for (let i = 0; i < 4; i++) mb.cyl(0.03, 0.02, [0, 0, -i * 0.035], C.GLOW_B, coil, 'z', 14, 0x2090ff);
    mb.cyl(0.018, 0.2, [0, 0.03, -0.38], C.DARK, undefined, 'z', 12);
    mb.cyl(0.024, 0.03, [0, 0.03, -0.5], W, undefined, 'z', 14);
    mb.cyl(0.012, 0.002, [0, 0.03, -0.5158], C.GLOW_B, undefined, 'z', 12, 0x2090ff);
    triggerGuard(mb, 0.018, C.BLACK, 0.05);
    pistolGrip(mb, 0.044, C.BLACK, 18, 0.09, 0.034, 0.05, undefined, { grooves: 3 });
    const fg = mb.frame([0, -0.015, -0.24], [0, 0, 0]);
    mb.box([0.03, 0.09, 0.035], [0, -0.03, 0], C.BLACK, fg);
    boxMag(mb, 0.035, 0.07, 0.07, [0, -0.02, -0.06], C.GLOW_B, 0);
    stockSolid(mb, 0.09, 0.2, W, 0.0, 0.08, 0.05);
    redDot(mb, -0.04, 0.086);
    support(mb, [0, -0.08, -0.24], 'grip', undefined, [0.0, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.52]);
    mb.anchor('eject', [0.03, 0.03, -0.05]);
    mb.anchor('magwell', [0, -0.09, -0.06]);
    return { hip: [0.15, -0.16, -0.34], eye: 0.22, twoHand: true };
  },
  naf(mb) {
    mb.box([0.04, 0.06, 0.34], [0, 0.03, -0.1], C.BLACK);
    rail(mb, 0.2, -0.1, 0.063);
    mb.cyl(0.02, 0.2, [0, 0.03, -0.37], C.DARK, undefined, 'z', 12);
    for (let i = 0; i < 5; i++) mb.cyl(0.022, 0.006, [0, 0.03, -0.3 - i * 0.03], C.BLACK, undefined, 'z', 12); // heat fins
    mb.cyl(0.028, 0.06, [0, 0.03, -0.49], C.CHROME, undefined, 'z', 14);
    mb.cyl(0.016, 0.002, [0, 0.03, -0.5208], C.BORE, undefined, 'z', 12);
    const pilot = mb.part('pilot', [0, 0.012, -0.52]);
    mb.box([0.006, 0.006, 0.01], [0, 0, 0], C.ORANGE, pilot, undefined, 0xff6010);
    mb.box([0.07, 0.1, 0.05], [0, -0.06, -0.12], 0xe0e0e0);
    mb.fbox([0.072, 0.012, 0.052], [0, -0.03, -0.12], 0xb02020, 'poly');
    mb.cyl(0.006, 0.08, [0.03, -0.04, -0.2], C.BRASS, undefined, 'z', 8); // fuel line
    triggerGuard(mb, 0.018, C.BLACK, 0.05);
    pistolGrip(mb, 0.044, C.BLACK, 18, 0.09, 0.034, 0.05, undefined, { grooves: 3 });
    const fg = mb.frame([0, 0.0, -0.26], [0, 0, 0]);
    mb.box([0.03, 0.08, 0.03], [0, -0.04, 0], C.BLACK, fg);
    stockSolid(mb, 0.07, 0.22, C.BLACK, 0.0, 0.07, 0.04);
    const mag = mb.part('mag', [0, -0.03, -0.12]);
    mb.cyl(0.03, 0.14, [0, -0.06, 0], 0xe0e0e0, mag, 'y', 16);
    mb.cyl(0.031, 0.02, [0, -0.02, 0], 0xb02020, mag, 'y', 16);
    mb.cyl(0.02, 0.01, [0, -0.135, 0], C.DARK, mag, 'y', 14);
    support(mb, [0, -0.07, -0.26], 'grip', undefined, [0.0, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.53]);
    mb.anchor('eject', [0, 0.03, -0.1]);
    mb.anchor('sight', [0, 0.08, 0.03]);
    mb.anchor('magwell', [0, -0.1, -0.12]);
    return { hip: [0.15, -0.15, -0.33], eye: 0.3, twoHand: true };
  },
  reedham(mb) {
    mb.cyl(0.024, 0.55, [0, 0.03, -0.22], C.OD, undefined, 'z', 14);
    mb.cyl(0.032, 0.08, [0, 0.03, -0.52], C.DARK, undefined, 'z', 14);
    mb.cyl(0.02, 0.002, [0, 0.03, -0.5608], C.BORE, undefined, 'z', 12);
    const pilot = mb.part('pilot', [0, 0.005, -0.56]);
    mb.box([0.008, 0.008, 0.012], [0, 0, 0], C.GLOW_B, pilot, undefined, 0x3080ff);
    for (let i = 0; i < 4; i++) mb.cyl(0.028, 0.01, [0, 0.03, -0.1 - i * 0.08], C.BLACK, undefined, 'z', 14);
    mb.box([0.03, 0.02, 0.2], [0, 0.058, -0.2], C.BLACK); // top rail
    triggerGuard(mb, 0.004, C.BLACK, 0.05);
    pistolGrip(mb, 0.034, C.BLACK, 18, 0.09, 0.034, 0.05, undefined, { grooves: 3 });
    const fg = mb.frame([0, 0.005, -0.28], [0, 0, 0]);
    mb.box([0.03, 0.09, 0.03], [0, -0.045, 0], C.BLACK, fg);
    const mag = mb.part('mag', [0.05, -0.02, 0.02]);
    mb.cyl(0.04, 0.2, [0, -0.08, 0], C.OD, mag, 'y', 16);
    mb.cyl(0.041, 0.02, [0, -0.01, 0], C.DARK, mag, 'y', 16);
    mb.cyl(0.006, 0.12, [-0.03, 0.02, -0.05], C.BLACK, mag, 'z', 8);
    support(mb, [0, -0.08, -0.28], 'grip', undefined, [0.0, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.58]);
    mb.anchor('eject', [0, 0.03, -0.1]);
    mb.anchor('sight', [0, 0.08, 0.03]);
    mb.anchor('magwell', [0.05, -0.12, 0.02]);
    return { hip: [0.14, -0.15, -0.33], eye: 0.3, twoHand: true };
  },
  pir(mb, v) {
    const glow = v.includes('l3') ? 0xff40ff : v.includes('l2') ? 0x40ffd0 : 0xffa030;
    const H = 0x2a2d34;
    mb.box([0.07, 0.1, 0.46], [0, 0.03, -0.1], H);
    mb.box([0.074, 0.03, 0.34], [0, 0.085, -0.12], C.BLACK);
    for (let i = 0; i < 7; i++) mb.fbox([0.072, 0.008, 0.024], [0, 0.0, 0.08 - i * 0.05], 0x1c1e22, 'metal'); // panel seams
    for (const s of [-1, 1]) mb.box([0.002, 0.008, 0.26], [s * 0.036, 0.055, -0.1], glow, undefined, undefined, glow); // light strips
    const coil = mb.part('coil', [0, 0.03, -0.36]);
    for (let i = 0; i < 5; i++) mb.box([0.08, 0.08, 0.016], [0, 0, -i * 0.03], glow, coil, undefined, glow);
    mb.box([0.03, 0.03, 0.2], [0, 0.03, -0.44], C.DARK);
    mb.box([0.05, 0.05, 0.03], [0, 0.03, -0.55], H);
    mb.box([0.02, 0.02, 0.002], [0, 0.03, -0.5655], glow, undefined, undefined, glow);
    triggerGuard(mb, 0.018, C.BLACK, 0.05);
    pistolGrip(mb, 0.044, C.BLACK, 18, 0.09, 0.034, 0.05, undefined, { grooves: 3 });
    const fg = mb.frame([0, -0.02, -0.26], [0, 0, 0]);
    mb.box([0.03, 0.09, 0.035], [0, -0.025, 0], C.BLACK, fg);
    boxMag(mb, 0.04, 0.06, 0.08, [0, -0.02, -0.04], glow, 0);
    stockSolid(mb, 0.13, 0.2, H, 0.0, 0.09, 0.05);
    scope(mb, 0.14, 0.02, -0.08, 0.11, C.BLACK, glow);
    support(mb, [0, -0.085, -0.26], 'grip', undefined, [0.0, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.58]);
    mb.anchor('eject', [0.036, 0.03, -0.05]);
    mb.anchor('magwell', [0, -0.08, -0.04]);
    return { hip: [0.15, -0.17, -0.35], eye: 0.14, twoHand: true };
  },
};

function akBody(mb: ModelBuilder, metal: number, furniture: number, stock: boolean) {
  const wood = furniture === C.WOOD;
  mb.box([0.042, 0.06, 0.26], [0, 0.03, -0.08], metal);
  mb.box([0.036, 0.012, 0.22], [0, 0.066, -0.08], metal); // dust cover
  for (let i = 0; i < 3; i++) mb.fbox([0.037, 0.002, 0.03], [0, 0.0725, -0.04 - i * 0.05], shade(metal, 0.7), 'metal'); // cover ribs
  mb.box([0.03, 0.01, 0.012], [0, 0.066, 0.052], metal); // cover latch
  for (let i = 0; i < 4; i++) mb.cyl(0.0022, 0.0016, [-0.0214, 0.012 + (i % 2) * 0.03, -0.18 + Math.floor(i / 2) * 0.2], C.STEEL, undefined, 'x', 8); // rivets
  mb.box([0.004, 0.02, 0.07], [-0.0215, 0.022, -0.1], shade(metal, 0.85)); // left mount plate
  lever(mb, 0.0225, 0.04, -0.07, 0.08, 0.05, metal); // selector (right)
  barrel(mb, 0.01, 0.32, -0.21, 0.04, C.BLACK);
  mb.cyl(0.01, 0.2, [0, 0.07, -0.32], metal, undefined, 'z', 10); // gas tube
  mb.box([0.03, 0.04, 0.03], [0, 0.058, -0.43], metal); // gas block
  mb.box([0.044, 0.04, 0.17], [0, 0.028, -0.3], furniture); // handguard
  mb.box([0.038, 0.02, 0.12], [0, 0.07, -0.29], furniture);
  if (wood) for (let i = 0; i < 3; i++) mb.box([0.046, 0.004, 0.1], [0, 0.028 - i * 0.012, -0.3], C.WOOD_D); // finger grooves
  else for (let i = 0; i < 4; i++) mb.fbox([0.0456, 0.03, 0.012], [0, 0.028, -0.25 - i * 0.03], shade(furniture, 0.7), 'poly');
  mb.box([0.03, 0.03, 0.02], [0, 0.04, -0.215], metal); // retainer
  mb.box([0.006, 0.03, 0.008], [0, 0.06, -0.5], C.BLACK); // front sight post
  mb.box([0.02, 0.02, 0.012], [0, 0.05, -0.5], C.BLACK); // sight base
  for (const s of [-1, 1]) mb.box([0.003, 0.02, 0.012], [s * 0.008, 0.064, -0.5], C.BLACK); // post ears
  mb.cyl(0.013, 0.04, [0, 0.04, -0.55], C.BLACK, undefined, 'z', 12); // slant brake
  mb.fbox([0.014, 0.006, 0.024], [0, 0.052, -0.552], C.BORE, 'rubber');
  mb.box([0.03, 0.012, 0.04], [0, 0.068, -0.17], C.BLACK); // rear sight block
  mb.box([0.022, 0.004, 0.06], [0, 0.076, -0.15], C.BLACK); // sight leaf
  triggerGuard(mb, 0.0, metal, 0.05);
  pistolGrip(mb, 0.03, wood ? 0x5a3218 : C.POLY, 18, 0.085, 0.03, 0.045, undefined, { grooves: wood ? 0 : 3 });
  if (stock) stockSolid(mb, 0.05, 0.28, furniture, 0.06, 0.065);
  else stockSkeleton(mb, 0.05, 0.22, C.BLACK);
  const bolt = mb.part('bolt', [0.026, 0.045, -0.06]);
  mb.box([0.014, 0.012, 0.03], [0, 0, 0], C.STEEL, bolt);
  mb.cyl(0.006, 0.012, [0.006, 0, -0.012], C.STEEL, bolt, 'x', 10);
  support(mb, [0, 0.002, -0.3], 'cup');
  mb.anchor('muzzle', [0, 0.04, -0.58]);
  mb.anchor('eject', [0.024, 0.05, -0.08]);
  mb.anchor('sight', [0, 0.083, 0.02]);
  mb.anchor('magwell', [0, -0.12, -0.06]);
}

function arBody(mb: ModelBuilder, color: number, carry: boolean, quadRail: boolean, furniture: number = C.POLY) {
  const lowerC = shade(color, 0.95);
  mb.box([0.04, 0.05, 0.2], [0, 0.03, -0.06], color); // upper
  mb.box([0.036, 0.035, 0.16], [0, -0.005, -0.05], lowerC); // lower
  mb.box([0.038, 0.03, 0.05], [0, -0.01, -0.06], lowerC); // mag well
  mb.fbox([0.0012, 0.012, 0.044], [0.0206, 0.035, -0.06], C.BORE, 'rubber'); // port
  mb.box([0.0016, 0.012, 0.04], [0.021, 0.035, -0.06], color); // dust cover
  mb.cyl(0.006, 0.01, [0.023, 0.04, -0.01], color, undefined, 'x', 10); // forward assist
  lever(mb, -0.019, 0.005, 0.012, 0.018, 0.4, C.BLACK); // selector
  mb.cyl(0.004, 0.003, [-0.019, -0.008, -0.036], C.BLACK, undefined, 'x', 8); // mag release
  mb.box([0.004, 0.024, 0.01], [-0.02, 0.0, -0.075], C.BLACK); // bolt catch
  pins(mb, 0.018, [[0.005, -0.12], [0.005, 0.02]], 0.002);
  barrel(mb, 0.009, 0.36, -0.16, 0.035, C.BLACK);
  flashHider(mb, 0.01, -0.51, 0.035);
  if (quadRail) {
    mb.box([0.046, 0.046, 0.2], [0, 0.035, -0.26], color);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) mb.fbox([0.0012, 0.008, 0.024], [s * 0.0236, 0.035, -0.19 - i * 0.035], C.BORE, 'rubber'); // vents
    rail(mb, 0.2, -0.26, 0.061, C.BLACK);
    rail(mb, 0.36, -0.12, 0.058, C.BLACK);
  } else {
    mb.box([0.05, 0.046, 0.22], [0, 0.034, -0.27], furniture);
    for (let i = 0; i < 6; i++) mb.fbox([0.052, 0.036, 0.004], [0, 0.034, -0.18 - i * 0.034], shade(furniture, 0.7), 'poly');
    mb.box([0.054, 0.052, 0.012], [0, 0.034, -0.16], color); // delta ring
  }
  if (carry) {
    mb.box([0.016, 0.03, 0.12], [0, 0.07, -0.04], color);
    for (const z of [-0.09, 0.01]) mb.box([0.024, 0.02, 0.016], [0, 0.064, z], color);
    rearSight(mb, 0.01, 0.085, undefined, false);
  } else {
    // folding rear sight
    mb.box([0.022, 0.012, 0.024], [0, 0.064, 0.01], C.BLACK);
    mb.box([0.02, 0.016, 0.006], [0, 0.076, 0.016], C.BLACK);
    mb.fbox([0.004, 0.004, 0.007], [0, 0.079, 0.016], C.BORE, 'rubber');
  }
  mb.box([0.006, 0.05, 0.008], [0, 0.062, -0.44], C.BLACK); // front sight post
  for (const s of [-1, 1]) mb.box([0.003, 0.03, 0.012], [s * 0.008, 0.07, -0.44], C.BLACK);
  mb.box([0.022, 0.03, 0.02], [0, 0.047, -0.44], C.BLACK);
  // charging handle
  mb.box([0.03, 0.008, 0.014], [0, 0.058, 0.044], C.BLACK);
  triggerGuard(mb, 0.004, color, 0.05);
  pistolGrip(mb, 0.036, C.POLY, 20, 0.08, 0.03, 0.045, undefined, { grooves: 3, beaver: true });
  if (furniture === C.TAN) stockAR(mb, 0.04, C.TAN);
  else if (carry) stockSolid(mb, 0.06, 0.24, C.POLY, 0.0, 0.07, 0.04);
  else stockAR(mb, 0.04, C.POLY);
  const bolt = mb.part('bolt', [0, 0.06, 0.06]);
  mb.box([0.03, 0.01, 0.012], [0, 0, 0], C.BLACK, bolt);
  support(mb, [0, 0.009, -0.28], 'cup');
  mb.anchor('muzzle', [0, 0.035, -0.56]);
  mb.anchor('eject', [0.022, 0.04, -0.06]);
  mb.anchor('sight', [0, carry ? 0.093 : 0.083, 0.02]);
  mb.anchor('magwell', [0, -0.12, -0.06]);
}

function lmgBody(mb: ModelBuilder, color: number, len: number, woodStock: boolean, stockColor: number = C.POLY) {
  mb.box([0.05, 0.075, 0.3], [0, 0.03, -0.08], color);
  mb.box([0.044, 0.01, 0.26], [0, 0.07, -0.08], color);
  for (let i = 0; i < 6; i++) mb.cyl(0.0024, 0.0016, [-0.0258, 0.012 + (i % 2) * 0.04, -0.2 + Math.floor(i / 2) * 0.1], C.STEEL, undefined, 'x', 8); // rivets
  ejectPort(mb, 0.025, 0.0, -0.08, 0.02, 0.06);
  mb.box([0.014, 0.018, 0.024], [-0.028, 0.024, -0.16], C.STEEL); // charging handle
  barrel(mb, 0.012, len, -0.23, 0.035, C.DARK, undefined, 12);
  mb.box([0.03, 0.02, len * 0.5], [0, 0.065, -0.23 - len * 0.25], C.BLACK); // heat shield
  for (let i = 0; i < 6; i++) mb.fbox([0.0306, 0.01, len * 0.04], [0, 0.065, -0.25 - (i * len * 0.45) / 6], C.BORE, 'rubber');
  mb.cyl(0.009, len * 0.6, [0, 0.012, -0.23 - len * 0.3], C.DARK, undefined, 'z', 10); // gas tube
  flashHider(mb, 0.014, -0.23 - len, 0.035);
  mb.box([0.014, 0.06, 0.1], [0, 0.1, -0.1], C.BLACK); // carry handle
  mb.fbox([0.018, 0.02, 0.1], [0, 0.13, -0.1], C.RUBBER, 'rubber');
  const cover = mb.part('cover', [0, 0.075, -0.03]);
  mb.box([0.052, 0.012, 0.14], [0, 0, -0.07], color, cover);
  mb.box([0.03, 0.006, 0.1], [0, 0.009, -0.08], color, cover);
  rearSight(mb, -0.02, 0.011, cover, false);
  mb.box([0.03, 0.014, 0.012], [0, 0.0, 0.0], C.STEEL, cover); // latch
  triggerGuard(mb, 0.016, color, 0.05);
  pistolGrip(mb, 0.046, C.POLY, 20, 0.085, 0.03, 0.045, undefined, { grooves: 3 });
  if (woodStock) stockSolid(mb, 0.07, 0.26, stockColor, 0.03, 0.075);
  else stockSolid(mb, 0.07, 0.24, C.POLY, 0.0, 0.08, 0.045);
  bipod(mb, -0.23 - len * 0.8, 0.02, 0.14);
  const box = mb.part('mag', [-0.05, -0.02, -0.08]);
  mb.box([0.05, 0.1, 0.12], [0, -0.04, 0], C.OD, box);
  mb.box([0.054, 0.012, 0.124], [0, 0.012, 0], shade(C.OD, 0.8), box);
  mb.fbox([0.004, 0.06, 0.08], [-0.027, -0.04, 0], shade(C.OD, 0.75), 'fabric', box); // pouch flap
  mb.fbox([0.02, 0.012, 0.012], [-0.03, -0.01, 0], C.BLACK, 'poly', box); // buckle
  for (let i = 0; i < 4; i++) mb.fbox([0.012, 0.03, 0.01], [0.03, 0.03 - i * 0.012, -0.03 + i * 0.02], C.BRASS, 'polish', box);
  frontSight(mb, -0.23 - len * 0.9, 0.05, undefined, false);
  support(mb, [0, -0.01, -0.28], 'cup');
  mb.anchor('muzzle', [0, 0.035, -0.29 - len]);
  mb.anchor('eject', [0, -0.01, -0.06]);
  mb.anchor('sight', [0, 0.09, 0.03]);
  mb.anchor('magwell', [-0.05, 0.0, -0.08]);
}

function bowModel(mb: ModelBuilder, limbColor: number, gripColor: number, compound: boolean, magic: boolean): Partial<WeaponModel> {
  const bow = mb.part('bow', [0, 0, 0]);
  const segs = 9;
  const H = 0.62;
  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs - 0.5;
    const y = t * H;
    const z = -Math.cos(t * Math.PI) * 0.1 + 0.02;
    pts.push([y, z]);
  }
  const em = magic ? 0x6a5010 : 0;
  for (let i = 0; i < segs; i++) {
    const [y0, z0] = pts[i];
    const [y1, z1] = pts[i + 1];
    const len = Math.hypot(y1 - y0, z1 - z0);
    const a = Math.atan2(z1 - z0, y1 - y0);
    const mid = i === 4;
    const taper = 1 - Math.abs(i - 4) * 0.08;
    mb.box([(mid ? 0.03 : 0.024) * taper, len + 0.006, (mid ? 0.04 : 0.018) * taper], [0, (y0 + y1) / 2, (z0 + z1) / 2], mid ? gripColor : limbColor, bow, [a, 0, 0], em);
    if (mid) {
      mb.fbox([0.032, len * 0.8, 0.042], [0, (y0 + y1) / 2, (z0 + z1) / 2], magic ? 0xfff0a0 : 0x3a2a1a, magic ? 'polish' : 'leather', bow); // grip wrap
      mb.box([0.012, 0.03, 0.02], [0.012, (y0 + y1) / 2 + 0.03, (z0 + z1) / 2 - 0.01], limbColor, bow); // arrow shelf
    }
  }
  if (compound) {
    for (const k of [0, segs]) {
      mb.cyl(0.022, 0.012, [0, pts[k][0], pts[k][1]], C.BLACK, bow, 'x', 14);
      mb.cyl(0.006, 0.016, [0, pts[k][0], pts[k][1]], C.STEEL, bow, 'x', 8);
    }
    mb.box([0.008, 0.2, 0.008], [0.004, 0.0, 0.08], C.BLACK, bow); // stabilizer rod
    mb.cyl(0.012, 0.04, [0, 0.0, -0.12], C.BLACK, bow, 'z', 10); // front stabilizer
    mb.box([0.02, 0.04, 0.012], [-0.02, 0.06, -0.03], C.BLACK, bow); // sight pins
    for (let i = 0; i < 3; i++) mb.box([0.012, 0.003, 0.003], [-0.02, 0.05 + i * 0.01, -0.035], [0xff4030, 0x70ff60, 0xffd040][i], bow, undefined, [0x802010, 0x308020, 0x806010][i]);
  }
  if (magic) mb.box([0.036, 0.06, 0.02], [0, 0, -0.1], 0xfff080, bow, undefined, 0xffc030);
  // string: two segments to a nock point (animated)
  const string = mb.part('string', [0, 0, 0.035]);
  mb.box([0.003, 1, 0.003], [0, 0, 0], magic ? 0xfff8c0 : 0xe8e0d0, string, undefined, magic ? 0xffe070 : 0, 'fabric');
  mb.box([0.003, 1, 0.003], [0, 0, 0], magic ? 0xfff8c0 : 0xe8e0d0, string, undefined, magic ? 0xffe070 : 0, 'fabric');
  const arrow = mb.part('arrow', [0, 0.0, 0.035]);
  const shaftColor = magic ? 0xfff4b0 : compound ? C.BLACK : 0xb08050;
  mb.box([0.006, 0.006, 0.6], [0, 0, -0.3], shaftColor, arrow, undefined, magic ? 0xffd040 : 0);
  mb.box([0.014, 0.014, 0.04], [0, 0, -0.61], magic ? 0xffffff : compound ? C.RED : C.STEEL, arrow, undefined, magic ? 0xffffa0 : compound ? 0x400000 : 0);
  mb.box([0.002, 0.024, 0.06], [0, 0.009, -0.02], C.RED, arrow);
  mb.box([0.022, 0.002, 0.06], [0.009, -0.004, -0.02], compound ? 0xe8e8e8 : C.RED, arrow);
  mb.box([0.022, 0.002, 0.06], [-0.009, -0.004, -0.02], compound ? 0xe8e8e8 : C.RED, arrow);
  mb.box([0.008, 0.008, 0.012], [0, 0, 0.004], compound ? 0x40c040 : 0xe8e0d0, arrow); // nock
  mb.anchor('grip', [0, -0.01, -0.1], bow, [0, 0, 0]);
  mb.anchor('support', [0, 0, 0.04], arrow);
  mb.anchor('muzzle', [0, 0.0, -0.65], arrow);
  mb.anchor('sight', [0, 0.02, 0.1]);
  mb.anchor('eject', [0, 0, 0]);
  mb.anchor('magwell', [0, 0, 0.1]);
  // the bow is held by the left hand; swap roles: grip anchor used by left hand
  return { hip: [0.02, -0.08, -0.42], eye: 0.35, twoHand: true };
}

export function buildGrenade(): ModelBuilder {
  const mb = new ModelBuilder('gun');
  const g = mb.part('grenade', [0, 0, 0]);
  const O = 0x4a5630;
  mb.cyl(0.026, 0.062, [0, 0, 0], O, g, 'y', 14);
  for (let i = 0; i < 3; i++) mb.cyl(0.028, 0.008, [0, -0.02 + i * 0.02, 0], shade(O, 0.8), g, 'y', 14);
  mb.cyl(0.012, 0.018, [0, 0.04, 0], C.STEEL, g, 'y', 12); // fuze body
  const spoon = mb.part('spoon', [0.012, 0.045, 0], g);
  mb.box([0.008, 0.05, 0.016], [0.004, -0.022, 0], C.STEEL, spoon, [0, 0, -0.12]);
  mb.box([0.012, 0.008, 0.016], [-0.002, 0.004, 0], C.STEEL, spoon);
  const pin = mb.part('pin', [-0.016, 0.042, 0], g);
  mb.box([0.022, 0.004, 0.004], [-0.008, 0, 0], C.CHROME, pin);
  mb.cyl(0.011, 0.003, [-0.024, 0, 0], C.CHROME, pin, 'z', 12);
  mb.fbox([0.02, 0.003, 0.003], [0, 0.0, 0.0271], 0xd8c040, 'poly', g); // marking band
  mb.anchor('grip', [0, -0.02, 0.01], g);
  mb.finalize();
  return mb;
}

/** First-aid kit (shop icon). */
export function buildMedkit(): ModelBuilder {
  const mb = new ModelBuilder('gun');
  mb.fbox([0.16, 0.1, 0.06], [0, 0, 0], 0xc8201c, 'poly');
  mb.fbox([0.165, 0.012, 0.064], [0, 0.03, 0], 0x8e1210, 'poly');
  mb.fbox([0.05, 0.02, 0.03], [0, 0.058, 0], 0x2a2a2a, 'rubber'); // handle
  mb.box([0.05, 0.016, 0.004], [0, -0.01, 0.031], 0xf2f2f2, undefined, undefined, 0x222222);
  mb.box([0.016, 0.05, 0.004], [0, -0.01, 0.031], 0xf2f2f2, undefined, undefined, 0x222222);
  for (const s of [-1, 1]) mb.fbox([0.012, 0.03, 0.066], [s * 0.06, 0.012, 0], C.STEEL, 'metal'); // latches
  mb.finalize();
  return mb;
}

/** Trigger position in the grip anchor frame, so the index finger can rest on it. */
function triggerReach(mb: ModelBuilder) {
  const g = mb.anchors.grip;
  const t = mb.parts.trigger;
  if (!g || !t) return;
  mb.root.updateMatrixWorld(true);
  const p = t.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.01, 0.002));
  g.worldToLocal(p);
  if (p.length() < 0.12) g.userData.trigger = p;
}

export function buildWeaponModel(id: string, visual: string[] = []): WeaponModel {
  const mb = new ModelBuilder('gun');
  const b = MODELS[id] ?? MODELS.glock17;
  const r = b(mb, visual);
  // required anchors fallback
  for (const a of ['grip', 'support', 'muzzle', 'eject', 'sight', 'magwell']) {
    if (!mb.anchors[a]) mb.anchor(a, [0, 0.05, 0]);
  }
  mb.finalize(['string']);
  triggerReach(mb);
  mb.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  const h = r.hip ?? [0.14, -0.14, -0.33];
  // push the weapon further from the eye for a less claustrophobic viewmodel
  const hip: V3 = [h[0] * 1.1, h[1] * 1.12, h[2] * 1.32];
  // default hip angle turns the gun so its right side shows (bows stay upright)
  const hipRot: V3 = r.hipRot ?? (id === 'bow' || id === 'rambo' || id === 'sunstrike' ? [0, 0.06, -0.02] : [0.03, 0.2, -0.07]);
  return { mb, hip, hipRot, eye: (r.eye ?? 0.26) * 1.55, twoHand: r.twoHand ?? true };
}

export const MODEL_IDS = Object.keys(MODELS);
