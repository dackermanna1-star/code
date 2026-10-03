/**
 * Animators: quadrupeds (diagonal gait with knee flex, body bob, head tracking, grazing),
 * creeper (4-leg shuffle, fuse swelling), spider (alternating tetrapod leg gait), chicken
 * (leg steps, head bob, wing flaps while falling).
 */
import type { Rig } from '../rig';
import { clamp, follow, spring, type AnimState } from './common';

export function animateQuadruped(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>, o: { amp?: number; cadence?: number; headDown?: number } = {}) {
  const amt = clamp(st.limbAmount, 0, 1);
  const ph = st.limbSwing * (o.cadence ?? 2.2);
  const a = (o.amp ?? 0.75) * amt;
  const s = Math.sin(ph), c = Math.cos(ph);
  // diagonal pairs: FR+BL / FL+BR
  const sets: [string, string, number][] = [['legFR', 'shinFR', 1], ['legBL', 'shinBL', 1], ['legFL', 'shinFL', -1], ['legBR', 'shinBR', -1]];
  for (const [leg, shin, sg] of sets) {
    if (!rig.has(leg)) continue;
    const front = leg.includes('F');
    rig.bone(leg).rot(s * a * sg);
    const lift = Math.max(0, c * sg) * amt;
    // front knees fold backward, hind hocks fold forward
    rig.bone(shin).rot((front ? -1 : 1) * lift * 0.9);
  }
  const body = rig.bone('body');
  const breath = Math.sin(st.time * 1.5) * 0.008;
  const hx = spring(mem, 'hx', st.impactX * st.hurt, dt, 4, 0.35), hz = spring(mem, 'hz', st.impactZ * st.hurt, dt, 4, 0.35);
  body.rot(breath + hz * 0.12, 0, Math.sin(ph) * 0.03 * amt - hx * 0.12);
  body.move(0, -Math.abs(c) * 0.025 * amt, 0);
  // head: tracking + grazing
  const eat = st.eating ? clamp(st.eating > 36 ? (40 - st.eating) / 4 : st.eating < 4 ? st.eating / 4 : 1, 0, 1) : 0;
  const chew = st.eating > 4 && st.eating < 36 ? Math.sin(st.eating * 0.7) * 0.15 : 0;
  const down = follow(mem, 'eat', eat, dt, 8);
  const pitch = clamp(st.headPitch, -0.6, 0.6) * (1 - down) - down * (o.headDown ?? 1.1) + chew;
  rig.bone('head').rot(pitch + Math.sin(st.time * 1.1) * 0.02, clamp(st.headYaw, -0.9, 0.9) * (1 - down), 0);
}

export function animateCreeper(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) {
  const amt = clamp(st.limbAmount, 0, 1);
  const ph = st.limbSwing * 2.4;
  const a = 0.8 * amt;
  const s = Math.sin(ph);
  rig.bone('legFR').rot(s * a);
  rig.bone('legBL').rot(s * a);
  rig.bone('legFL').rot(-s * a);
  rig.bone('legBR').rot(-s * a);
  const sway = Math.sin(st.time * 1.3) * 0.015;
  const hx = spring(mem, 'hx', st.impactX * st.hurt, dt, 4, 0.35), hz = spring(mem, 'hz', st.impactZ * st.hurt, dt, 4, 0.35);
  rig.bone('body').rot(sway + hz * 0.15, s * 0.04 * amt, Math.sin(ph * 0.5) * 0.02 * amt - hx * 0.15);
  rig.bone('head').rot(clamp(st.headPitch, -0.6, 0.6), clamp(st.headYaw, -1.2, 1.2), 0);
  // fuse swelling (Minecraft: 1 + f*0.4 horizontally, 1 + f*0.1 vertically, with a tremble)
  const f = st.swell ?? 0;
  const tremble = 1 + Math.sin(f * 100) * f * 0.01;
  const k = f * f * f * f;
  const xz = (1 + k * 0.4) * tremble, y = (1 + k * 0.1) / tremble;
  rig.body.scale.set(xz, y, xz);
}

export function animateSpider(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) {
  const amt = clamp(st.limbAmount * 1.2, 0, 1);
  const ph = st.limbSwing * 3.2;
  for (let i = 0; i < 4; i++)
    for (const [side, sx] of [['R', 1], ['L', -1]] as const) {
      const n = `leg${i}${side}`;
      // alternating tetrapod: legs 0,2 of one side with 1,3 of the other
      const grp = ((i + (side === 'R' ? 0 : 1)) & 1) ? 1 : -1;
      const swing = Math.sin(ph + grp * Math.PI / 2) * 0.45 * amt;
      const lift = Math.max(0, Math.cos(ph + grp * Math.PI / 2)) * 0.35 * amt;
      const idle = Math.sin(st.time * 2 + i) * 0.02;
      // femur: yaw (swing fore/aft) + roll (lift)
      rig.bone(n).rot(0, swing * -sx, (lift + idle) * sx);
      rig.bone(n + 'b').rot(0, 0, -lift * 0.5 * sx);
    }
  const hx = spring(mem, 'hx', st.impactX * st.hurt, dt, 4, 0.35), hz = spring(mem, 'hz', st.impactZ * st.hurt, dt, 4, 0.35);
  rig.bone('body').rot(hz * 0.15 + (st.climbing ? 0.9 : 0), 0, -hx * 0.15);
  rig.bone('body').move(0, Math.abs(Math.sin(ph)) * 0.02 * amt, 0);
  rig.bone('head').rot(clamp(st.headPitch, -0.5, 0.5), clamp(st.headYaw, -0.6, 0.6), 0);
  rig.bone('abdomen').rot(Math.sin(st.time * 1.6) * 0.03 + Math.sin(ph * 2) * 0.03 * amt, Math.sin(ph) * 0.05 * amt, 0);
}

export function animateChicken(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) {
  const amt = clamp(st.limbAmount, 0, 1);
  const ph = st.limbSwing * 3.5;
  const s = Math.sin(ph);
  rig.bone('legR').rot(s * 1.0 * amt);
  rig.bone('legL').rot(-s * 1.0 * amt);
  // wing flapping when airborne (Minecraft: flap speed when falling)
  const air = !st.onGround && !st.inWater;
  const flap = follow(mem, 'flap', air ? 1 : 0, dt, 10);
  const w = (Math.sin(st.time * 30) * 0.5 + 0.5) * flap * 1.2 + 0.02;
  rig.bone('wingR').rot(0, 0, -w);
  rig.bone('wingL').rot(0, 0, w);
  // head bob synchronized with steps
  const bob = Math.sin(ph * 2) * 0.03 * amt;
  rig.bone('head').move(0, 0, bob);
  rig.bone('head').rot(clamp(st.headPitch, -0.6, 0.6), clamp(st.headYaw, -1.2, 1.2), 0);
  rig.bone('body').rot(Math.sin(st.time * 2) * 0.01, 0, s * 0.05 * amt);
}
