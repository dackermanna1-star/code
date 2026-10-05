/**
 * Animators for the tropical island creatures.
 *  - crab: tetrapod leg gait (scuttling), claws held up and snapping when threatened, eye stalks
 *    twitching, little body bob;
 *  - snake: lateral undulation travelling down the body (wave speed tied to ground speed), a
 *    raised S-coil with the head up when threatened, a strike lunge, tongue flicks;
 *  - parrot: perched (upright, head bobs and cocks, tail sway) / flying (body level, full wing
 *    beats, legs tucked, gliding on descents);
 *  - sea turtle: slow alternating flipper crawl on land, synchronized wing-like front strokes with
 *    rudder back flippers when swimming, head bobbing.
 */
import type { Rig } from '../rig';
import { clamp, follow, spring, type AnimState } from './common';
import { SNAKE_SEGS } from '../defs/island';

export function animateCrab(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) {
  const amt = clamp(st.limbAmount * 1.6, 0, 1);
  const ph = st.limbSwing * 5.5;
  for (let i = 0; i < 4; i++)
    for (const [side, sx] of [['R', 1], ['L', -1]] as const) {
      const n = `leg${i}${side}`;
      const grp = ((i + (side === 'R' ? 0 : 1)) & 1) ? 1 : -1;
      // crabs walk sideways: legs swing in the body's x direction (roll) more than fore/aft
      const swing = Math.sin(ph + grp * Math.PI / 2) * 0.35 * amt;
      const lift = Math.max(0, Math.cos(ph + grp * Math.PI / 2)) * 0.45 * amt;
      const idle = Math.sin(st.time * 3 + i * 1.7) * 0.03;
      rig.bone(n).rot(0, swing * 0.4 * -sx, (lift + swing * 0.6 + idle) * sx);
      rig.bone(n + 'b').rot(0, 0, -lift * 0.6 * sx);
    }
  const threat = follow(mem, 'threat', st.aggressive ? 1 : 0, dt, 6);
  const att = st.attack >= 0 ? Math.sin(st.attack * Math.PI) : 0;
  for (const [side, sx] of [['R', 1], ['L', -1]] as const) {
    // claws: tucked in front, raised and spread when threatened, thrust when pinching
    const raise = threat * 0.9 + att * 0.5;
    rig.bone('arm' + side).rot(raise * 0.6, -sx * (0.15 + threat * 0.3), sx * raise * 0.5);
    rig.bone('claw' + side).rot(-raise * 0.4 - att * 0.4, 0, 0);
    const snap = mem['snap' + side] ?? 0;
    let open = (Math.sin(st.time * 1.3 + sx) * 0.5 + 0.5) * 0.15;
    if (threat > 0.3) open = (Math.sin(st.time * (side === 'R' ? 9 : 7.5)) > 0.2 ? 0.55 : 0.05) * threat;
    open = Math.max(open, snap);
    mem['snap' + side] = Math.max(0, snap - dt * 3);
    if (Math.random() < dt * 0.15) mem['snap' + side] = 0.5;
    rig.bone('pinch' + side).rot(0, 0, sx * open);
  }
  const bob = Math.abs(Math.sin(ph)) * 0.012 * amt;
  const hx = spring(mem, 'hx', st.impactX * st.hurt, dt, 5, 0.35), hz = spring(mem, 'hz', st.impactZ * st.hurt, dt, 5, 0.35);
  rig.bone('body').rot(hz * 0.2 - threat * 0.12, 0, -hx * 0.2 + Math.sin(ph * 0.5) * 0.04 * amt);
  rig.bone('body').move(0, bob + threat * 0.03, 0);
  const tw = Math.sin(st.time * 2.3) * 0.08 + (Math.sin(st.time * 11) > 0.97 ? 0.3 : 0);
  rig.bone('eyes').rot(tw * 0.5, Math.sin(st.time * 0.9) * 0.2, 0);
}

export function animateSnake(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) {
  const moving = clamp(st.speed / 1.6, 0, 1);
  // wave travels from head to tail; phase advances with distance (no slip) plus a slow idle sway
  mem.ph = (mem.ph ?? 0) + dt * (st.speed * 7 + 0.6);
  const ph = mem.ph as number;
  const threat = follow(mem, 'threat', st.aggressive ? 1 : 0, dt, 4);
  const strike = st.attack >= 0 ? Math.sin(Math.min(1, st.attack * 1.3) * Math.PI) : 0;
  const amp = 0.32 * (0.35 + 0.65 * moving) * (1 - threat * 0.6);
  const turn = clamp(st.turnRate * 0.06, -0.25, 0.25);
  for (let i = 1; i < SNAKE_SEGS; i++) {
    const n = `s${i}`;
    const k = i / SNAKE_SEGS;
    let yaw = Math.sin(ph - i * 0.9) * amp * (0.6 + k * 0.6) - turn * (1 - k);
    let pitch = 0;
    // coiled strike pose: the front third forms a raised S, the rest coils
    if (threat > 0.01) {
      yaw += threat * (i < 4 ? (i % 2 ? 0.7 : -0.7) * 0.6 : (i < 8 ? 0.55 : 0.4));
      if (i <= 3) pitch = threat * (i === 1 ? -0.55 : i === 2 ? 0.35 : 0.25) * (1 - strike);
    }
    rig.bone(n).rot(pitch, yaw, 0);
  }
  // head: raised and swaying when threatened, lunges on a strike
  const sway = Math.sin(st.time * 2.2) * 0.12 * threat;
  const raise = threat * 0.65 * (1 - strike * 0.8);
  rig.bone('body').rot(-raise * 0.6, Math.sin(ph) * amp * 0.5 + sway, 0);
  rig.bone('body').move(0, raise * 0.11, -strike * 0.18);
  rig.bone('head').rot(clamp(st.headPitch, -0.4, 0.4) + raise * 0.4 - strike * 0.2, clamp(st.headYaw, -0.6, 0.6) * 0.5, 0);
  // tongue flicks
  mem.tf = Math.max(0, (mem.tf ?? 0) - dt);
  if ((mem.tf as number) <= 0 && Math.random() < dt * (0.5 + threat * 2.5)) mem.tf = 0.35;
  const tf = mem.tf as number;
  const out = tf > 0 ? Math.sin((0.35 - tf) / 0.35 * Math.PI) : 0;
  const tongue = rig.bone('tongue');
  tongue.move(0, 0, -out * 0.03);
  tongue.rot(Math.sin(st.time * 40) * 0.25 * out, 0, 0);
  tongue.joint.scale.setScalar(Math.max(0.01, out));
}

export function animateParrot(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) {
  const flying = follow(mem, 'fly', st.flying ? 1 : 0, dt, 7);
  const glide = st.flying && st.vy < -0.6 ? 1 : 0;
  const gl = follow(mem, 'glide', glide, dt, 4);
  mem.wph = (mem.wph ?? 0) + dt * (st.flying ? 17 - gl * 12 : 0);
  const beat = Math.sin(mem.wph as number);
  // perched: upright; flying: body level, pitched with the climb
  const climb = clamp(st.vy * 0.08, -0.35, 0.35);
  const bodyPitch = -0.35 * (1 - flying) + flying * (-1.15 - climb);
  const hop = st.onGround && st.speed > 0.2 ? Math.abs(Math.sin(st.limbSwing * 6)) * 0.02 : 0;
  rig.bone('body').rot(bodyPitch + Math.sin(st.time * 1.7) * 0.02 * (1 - flying), 0, 0);
  rig.bone('body').move(0, hop, 0);
  // wings: folded (slight shuffles) / full beats (spread out to the sides)
  const spread = flying * (1 - gl * 0.2);
  const w = spread * (1.2 + beat * 0.9 * (1 - gl)) + (1 - flying) * (Math.sin(st.time * 0.7) > 0.98 ? 0.4 : 0.02);
  rig.bone('wingR').rot(spread * 0.3, 0, -w);
  rig.bone('wingL').rot(spread * 0.3, 0, w);
  rig.bone('tail').rot(flying * 0.9 + Math.sin(st.time * 1.3) * 0.06, Math.sin(st.time * 2.1) * 0.08 * (1 - flying), 0);
  // legs tucked in flight
  const tuck = flying * 1.1;
  rig.bone('legR').rot(tuck, 0, 0);
  rig.bone('legL').rot(tuck, 0, 0);
  // head: counter the body pitch, curious bobs and cocks
  mem.cock = mem.cock ?? 0;
  if (Math.random() < dt * 0.6) mem.cockT = (Math.random() - 0.5) * 0.9;
  const cock = follow(mem, 'cock', (mem.cockT as number) ?? 0, dt, 10) * (1 - flying);
  const bob = (Math.sin(st.time * 3.1) > 0.9 ? 0.15 : 0) * (1 - flying);
  rig.bone('head').rot(-bodyPitch * 0.85 + clamp(st.headPitch, -0.6, 0.6) + bob, clamp(st.headYaw, -1.4, 1.4), cock);
}

export function animateTurtle(rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) {
  const swim = follow(mem, 'swim', st.inWater ? 1 : 0, dt, 3);
  const amt = clamp(st.limbAmount * 2, 0, 1);
  mem.ph = (mem.ph ?? 0) + dt * (st.inWater ? 1.6 + st.speed * 0.8 : st.speed * 3.2);
  const ph = mem.ph as number;
  // land: alternating heavy crawl (front flippers dig back, body lurches)
  const crawl = (1 - swim) * amt;
  const s = Math.sin(ph);
  rig.bone('finFR').rot(0, -s * 0.5 * crawl, Math.max(0, s) * 0.25 * crawl);
  rig.bone('finFL').rot(0, -s * 0.5 * crawl, -Math.max(0, -s) * 0.25 * crawl);
  // water: both front flippers beat together like wings, the back ones steer
  const beat = Math.sin(ph * 1.0);
  const fr = rig.bone('finFR'), fl = rig.bone('finFL');
  if (swim > 0.01) {
    fr.rot(beat * 0.25 * swim, 0.25 * swim, (-0.15 + beat * 0.65) * swim);
    fl.rot(beat * 0.25 * swim, -0.25 * swim, (0.15 - beat * 0.65) * swim);
  }
  rig.bone('finBR').rot(0, Math.sin(ph * 1.3) * 0.3 * (crawl + swim * 0.6), 0);
  rig.bone('finBL').rot(0, -Math.sin(ph * 1.3) * 0.3 * (crawl + swim * 0.6), 0);
  const lurch = Math.abs(s) * 0.02 * crawl;
  rig.bone('body').move(0, lurch + swim * Math.sin(ph) * 0.02, 0);
  rig.bone('body').rot(clamp(-st.vy * 0.08, -0.4, 0.4) * swim + Math.sin(ph) * 0.03 * crawl, 0, Math.sin(ph * 0.5) * 0.04 * swim);
  rig.bone('head').rot(clamp(st.headPitch, -0.4, 0.4) + Math.sin(st.time * 0.9) * 0.05, clamp(st.headYaw, -0.7, 0.7), 0);
}
