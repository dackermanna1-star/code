/**
 * Humanoid animation: walk/run cycle with knee & elbow flexion, weight shift (bob, roll,
 * shoulder twist), forward lean, idle breathing & arm sway, head tracking, attack swings,
 * zombie arms, hurt flinch, crouch, swimming, holding/using items.
 */
import type { Rig } from '../rig';
import { clamp, follow, spring, type AnimState } from './common';

export interface HumanoidAnimOpts {
  /** Zombie-style arms held forward. */
  zombieArms?: boolean;
  /** Arms crossed (villager): fore/arm bones rotated together. */
  crossedArms?: boolean;
  /** Overall swing scale (heavy mobs < 1). */
  swing?: number;
  /** Walk cycle length scale (radians per limbSwing unit). */
  cadence?: number;
  /** Stiff limbs (skeleton: less knee bend). */
  stiff?: number;
  /** Bow pose (skeleton/stray when aiming): st.bowDraw 0..1. */
  bow?: boolean;
}

export function animateHumanoid(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>, o: HumanoidAnimOpts = {}) {
  const t = st.time;
  const amt = clamp(st.limbAmount, 0, 1);
  const sw = o.swing ?? 1;
  const ph = st.limbSwing * (o.cadence ?? 2.6);
  const s = Math.sin(ph), c = Math.cos(ph);
  const run = clamp((st.speed - 3.5) / 2.5, 0, 1);
  const legA = (0.62 + run * 0.25) * amt * sw;
  const armA = (0.5 + run * 0.35) * amt * sw;
  const stiff = o.stiff ?? 0;
  const swimming = !!st.swimming;
  const sneaking = !!st.sneaking;

  // ---------------- body (weight shift)
  const breath = Math.sin(t * 1.7) * 0.012;
  let bodyX = -0.05 * amt - run * 0.12 + breath;
  let bodyY = s * 0.09 * amt * sw;
  let bodyZ = s * 0.035 * amt * sw;
  let bob = (Math.abs(c) - 0.6) * 0.045 * amt * sw;
  let bodyDZ = 0;
  if (sneaking) { bodyX -= 0.42; bob -= 0.12; bodyDZ = 0.12; }
  // hurt flinch (impulse direction in model space)
  const hx = spring(mem, 'hx', st.impactX * st.hurt, dt, 4, 0.35);
  const hz = spring(mem, 'hz', st.impactZ * st.hurt, dt, 4, 0.35);
  bodyX += hz * 0.22;
  bodyZ -= hx * 0.22;
  // turning lean
  const lean = follow(mem, 'lean', clamp(st.turnRate * 0.03, -0.12, 0.12) * amt, dt, 6);
  bodyZ -= lean;
  const body = rig.bone('body');
  body.rot(bodyX, bodyY, bodyZ);
  body.move(0, bob, bodyDZ);

  // ---------------- legs (counter-rotate the body's pitch/twist)
  let legR = s * legA - bodyX, legL = -s * legA - bodyX;
  const kneeBase = 0.06 + (sneaking ? 0.5 : 0);
  let kneeR = -(kneeBase + (1.0 + run * 0.5) * amt * sw * (1 - stiff) * Math.pow(Math.max(0, c), 1.4));
  let kneeL = -(kneeBase + (1.0 + run * 0.5) * amt * sw * (1 - stiff) * Math.pow(Math.max(0, -c), 1.4));
  if (!st.onGround && !st.inWater && !st.flying) {
    // airborne: tuck legs a bit
    const air = clamp(Math.abs(st.vy) / 8, 0, 1) * 0.5;
    legR += air * 0.4; legL += air * 0.2; kneeR -= air * 0.6; kneeL -= air * 0.8;
  }
  if (st.sitting) { legR = 1.45; legL = 1.45; kneeR = -1.45; kneeL = -1.45; }
  if (swimming) {
    const k = Math.sin(t * 7) * 0.35;
    legR = k; legL = -k; kneeR = -0.2 - Math.max(0, -k) * 0.6; kneeL = -0.2 - Math.max(0, k) * 0.6;
  }
  rig.bone('legR').rot(legR, -bodyY * 0.8, 0.02);
  rig.bone('legL').rot(legL, -bodyY * 0.8, -0.02);
  rig.bone('shinR').rot(kneeR);
  rig.bone('shinL').rot(kneeL);

  // ---------------- arms
  const [bobXR, bobZR] = [Math.sin(t * 1.34) * 0.04, Math.cos(t * 1.8) * 0.035 + 0.05];
  const [bobXL, bobZL] = [Math.sin(t * 1.34 + 1.3) * 0.04, Math.cos(t * 1.8 + 1.3) * 0.035 + 0.05];
  let aR = -s * armA, aL = s * armA;
  let aRy = 0, aLy = 0;
  let aRz = -bobZR * 0.6 - 0.03, aLz = bobZL * 0.6 + 0.03;
  let fR = 0.1 + amt * (0.2 + 0.35 * Math.max(0, -s)) + run * 0.6, fL = 0.1 + amt * (0.2 + 0.35 * Math.max(0, s)) + run * 0.6;
  aR += bobXR; aL += bobXL;
  if (o.zombieArms) {
    const raise = st.aggressive ? 2.0 : 1.45;
    const a = st.attack >= 0 ? st.attack : 0;
    const f = Math.sin(a * Math.PI), f1 = Math.sin((1 - (1 - a) * (1 - a)) * Math.PI);
    aR = raise - f * 1.1 + f1 * 0.35 + bobXR * 1.5 - s * armA * 0.25;
    aL = raise - f * 1.1 + f1 * 0.35 + bobXL * 1.5 + s * armA * 0.25;
    aRy = 0.1 - f * 0.5; aLy = -(0.1 - f * 0.5);
    aRz = -0.05 - bobZR * 0.4; aLz = 0.05 + bobZL * 0.4;
    fR = 0.15 + f * 0.25; fL = 0.15 + f * 0.25;
  } else if (o.crossedArms) {
    aR = 0.75; aL = 0.75; aRz = 0; aLz = 0;
    fR = 1.25; fL = 1.25; aRy = -0.35; aLy = 0.35;
  } else if (st.attack >= 0) {
    // overhead chop with the right arm, body twist
    const a = st.attack;
    const f = Math.sin(Math.sqrt(a) * Math.PI * 2) * 0.2;
    rig.bone('body').rot(bodyX, bodyY + f, bodyZ);
    const lift = Math.sin(a * Math.PI);
    aR = 0.4 + lift * 1.9 - a * 0.7;
    aRy = -f * 2;
    fR = 0.3 + lift * 0.4;
  }
  if (o.bow && (st.bowDraw ?? 0) > 0) {
    const d = st.bowDraw as number;
    const pitch = clamp(st.headPitch, -0.8, 0.8);
    aR = Math.PI / 2 + pitch; aL = Math.PI / 2 + pitch;
    aRy = -0.1 + st.headYaw; aLy = 0.5 + st.headYaw;
    aRz = 0; aLz = 0;
    fR = 0.05; fL = 0.05 + d * 0.15;
  }
  if (st.holdItem && st.attack < 0 && !o.zombieArms) { aR = Math.max(aR, 0.3 + bobXR); fR = Math.max(fR, 0.35); }
  if (st.using === 'eat' || st.using === 'drink') { aR = 1.3 + Math.sin(t * 22) * 0.06; aRy = 0.4; fR = 1.2; }
  if (st.using === 'block') { aL = 0.9; aLy = 0.5; fL = 0.6; }
  if (st.aimGun && st.attack < 0) {
    // two-handed carry of a held device, following the look pitch
    const pitch = clamp(st.headPitch, -0.9, 0.9);
    aR = 1.2 + pitch * 0.85; aL = 1.05 + pitch * 0.85;
    aRy = -0.05 + st.headYaw * 0.5; aLy = 0.6 + st.headYaw * 0.5;
    aRz = 0; aLz = 0;
    fR = 0.3; fL = 0.85;
  }
  if (swimming) {
    const k = t * 3.2;
    aR = Math.PI - Math.sin(k) * 1.4 - 0.6; aL = Math.PI - Math.sin(k + Math.PI) * 1.4 - 0.6;
    aRz = -0.3; aLz = 0.3; fR = 0.2; fL = 0.2;
  }
  if (st.sitting && !o.crossedArms) { aR = 0.6; aL = 0.6; }
  rig.bone('armR').rot(aR, aRy, aRz);
  rig.bone('armL').rot(aL, aLy, aLz);
  rig.bone('foreR').rot(clamp(fR, 0, 2.4));
  rig.bone('foreL').rot(clamp(fL, 0, 2.4));

  // ---------------- head
  const hy = st.headYaw - bodyY * 0.9;
  const hp = st.headPitch - bodyX * (sneaking ? 1 : 0.6) + hz * 0.25;
  rig.bone('head').rot(clamp(hp, -0.8, 0.85), clamp(hy, -1.3, 1.3), hx * 0.15);
}
