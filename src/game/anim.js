// Procedural pose functions for the segmented rig. All functions write target
// angles into a PoseAnimator (anim.set / anim.add); the animator smooths them.
// Conventions (model faces +Z): limb swing forward = negative X; knee/elbow bend: shin +X, forearm -X;
// spine lean forward = +X; left arm outward = +Z, right arm outward = -Z.

const sin = Math.sin, cos = Math.cos;

export function poseIdle(a, t, opts = {}) {
  a.reset();
  const br = sin(t * 1.6) * 0.03;
  a.set('spine', 0.02 + br, 0, 0);
  a.set('chest', br, 0, 0);
  a.set('upperArmL', 0.05, 0, 0.12); a.set('upperArmR', 0.05, 0, -0.12);
  a.set('forearmL', -0.15, 0, 0); a.set('forearmR', -0.15, 0, 0);
  if (opts.crouch) poseCrouchLegs(a, opts.crouch);
}

export function poseCrouchLegs(a, c) {
  a.set('thighL', -1.1 * c, 0, 0.08 * c); a.set('thighR', -1.1 * c, 0, -0.08 * c);
  a.set('shinL', 1.6 * c, 0, 0); a.set('shinR', 1.6 * c, 0, 0);
  a.set('footL', -0.5 * c, 0, 0); a.set('footR', -0.5 * c, 0, 0);
  a.set('spine', 0.3 * c, 0, 0);
  a.rootOffT.y = -0.42 * c;
}

/** Legs cycle. phase in radians, amp 0..1 (walk ~0.5, run 1), side: lateral movement (-1..1). */
export function poseLegs(a, phase, amp, opts = {}) {
  const s = sin(phase), c = cos(phase);
  const sw = 0.55 * amp + 0.15;
  const back = opts.back ? -1 : 1;
  a.set('thighL', -s * sw * back, 0, 0.03); a.set('thighR', s * sw * back, 0, -0.03);
  // knee bends when leg swings forward/up
  a.set('shinL', Math.max(0, -c) * 1.3 * amp + 0.1, 0, 0); a.set('shinR', Math.max(0, c) * 1.3 * amp + 0.1, 0, 0);
  a.set('footL', s * 0.25 * amp, 0, 0); a.set('footR', -s * 0.25 * amp, 0, 0);
  a.rootOffT.y = -Math.abs(cos(phase)) * 0.05 * amp + (opts.crouch ? -0.42 * opts.crouch : 0);
  if (opts.crouch) {
    const k = opts.crouch;
    a.add('thighL', -0.9 * k, 0, 0); a.add('thighR', -0.9 * k, 0, 0);
    a.add('shinL', 1.3 * k, 0, 0); a.add('shinR', 1.3 * k, 0, 0);
  }
  if (opts.strafe) { a.add('hips', 0, opts.strafe * 0.5, 0); }
}

/** Survivor full-body: locomotion + weapon hold. */
export function poseSurvivor(a, st) {
  a.reset();
  const { phase = 0, speed = 0, crouch = 0, airborne = false, pitch = 0, kind = 'rifle', t = 0 } = st;
  const moving = Math.min(1, speed / 5.5);
  if (airborne) {
    a.set('thighL', -0.6, 0, 0.05); a.set('thighR', -0.2, 0, -0.05); a.set('shinL', 1.0, 0, 0); a.set('shinR', 0.6, 0, 0);
  } else if (speed > 0.3) poseLegs(a, phase, moving, { crouch, back: st.back, strafe: st.strafe });
  else if (crouch > 0) poseCrouchLegs(a, crouch);
  a.add('spine', 0.06 * moving + (crouch ? 0.15 : 0), 0, 0);
  // upper body follows aim pitch (positive pitch = looking up)
  a.add('spine', -pitch * 0.25, 0, 0);
  a.set('chest', -pitch * 0.35 + sin(t * 1.6) * 0.02, 0, 0);
  a.set('neck', -pitch * 0.2, 0, 0);
  a.set('head', -pitch * 0.2, 0, 0);
  poseHold(a, kind, st);
}

/** Arms holding the current weapon/item. */
export function poseHold(a, kind, st = {}) {
  const recoil = st.recoil || 0, reload = st.reload || 0, swing = st.swing || 0, shove = st.shove || 0;
  switch (kind) {
    case 'rifle': case 'smg': case 'shotgun': case 'sniper': case 'launcher': case 'mg':
      a.set('upperArmR', -0.55 + recoil * 0.2, 0.15, -0.35);
      a.set('forearmR', -1.45, 0, 0);
      a.set('handR', 0, 0, 0);
      a.set('upperArmL', -0.95, -0.25, 0.25);
      a.set('forearmL', -0.75, 0.6, 0);
      if (reload > 0) { const k = sin(reload * Math.PI); a.add('upperArmL', 0.5 * k, 0, 0.1 * k); a.add('forearmL', 0.4 * k, 0, 0); a.add('chest', 0.1 * k, 0, 0); }
      break;
    case 'pistol':
      a.set('upperArmR', -1.3 + recoil * 0.3, 0.1, -0.15);
      a.set('forearmR', -0.25, 0, 0);
      a.set('upperArmL', -1.15, -0.4, 0.2);
      a.set('forearmL', -0.45, 0.3, 0);
      if (reload > 0) { const k = sin(reload * Math.PI); a.add('upperArmR', 0.5 * k, 0, 0); a.add('upperArmL', 0.4 * k, 0, 0); }
      break;
    case 'melee': case 'chainsaw': {
      // ready stance with weapon up on the right shoulder; swing goes right->left
      const sw = swing;
      a.set('upperArmR', -1.1 - (1 - sw) * 0.9 + sw * 0.6, 0.4 * (1 - sw) - 0.9 * sw, -0.3);
      a.set('forearmR', -1.0 + sw * 0.6, 0, 0);
      a.set('upperArmL', -0.9, -0.3, 0.2);
      a.set('forearmL', -0.9, 0.4, 0);
      a.add('chest', 0, 0.5 * (1 - sw) - 0.6 * sw, 0);
      if (kind === 'chainsaw') { a.set('upperArmR', -0.7, 0.2, -0.3); a.set('forearmR', -0.9, 0, 0); a.set('upperArmL', -0.9, -0.3, 0.1); a.set('forearmL', -0.8, 0.3, 0); }
      break;
    }
    case 'item': // medkit, pills, throwable in right hand
      a.set('upperArmR', -0.7, 0, -0.2);
      a.set('forearmR', -1.1, 0, 0);
      a.set('upperArmL', 0.05, 0, 0.12);
      a.set('forearmL', -0.3, 0, 0);
      break;
    case 'carry': // gas can / cola held low in front with both hands
      a.set('upperArmR', -0.35, 0, -0.1); a.set('forearmR', -0.8, 0, 0);
      a.set('upperArmL', -0.35, 0, 0.1); a.set('forearmL', -0.8, 0, 0);
      break;
    case 'throw': {
      const k = st.throwT || 0; // 0 windup -> 1 release
      a.set('upperArmR', -2.6 + k * 2.4, 0, -0.3);
      a.set('forearmR', -1.2 + k, 0, 0);
      a.set('upperArmL', -0.6, 0, 0.3);
      break;
    }
    default:
      a.set('upperArmL', 0.05, 0, 0.12); a.set('upperArmR', 0.05, 0, -0.12);
  }
  if (shove > 0) {
    const k = sin(shove * Math.PI);
    a.add('upperArmL', -0.6 * k, 0, -0.2 * k); a.add('upperArmR', -0.6 * k, 0, 0.2 * k);
    a.add('chest', 0.15 * k, -0.3 * k, 0);
  }
}

/** Common infected locomotion / behaviour poses. style: 0 pump, 1 reach, 2 flail */
export function poseZombie(a, st) {
  a.reset();
  const { phase = 0, speed = 0, t = 0, style = 0, attack = 0, attackSide = 1, stagger = 0, burning = false, idle = 'stand', lean = 0 } = st;
  const run = Math.min(1, speed / 6);
  if (speed > 0.25) {
    poseLegs(a, phase, Math.max(0.35, run));
    a.add('spine', 0.25 * run + 0.05, 0, 0);
    a.set('chest', 0.15 * run, sin(phase) * 0.15 * run, 0);
    a.set('head', -0.25 * run, 0, sin(t * 3 + style) * 0.1);
    const s = sin(phase);
    if (style === 0) {
      a.set('upperArmL', s * 0.9 * run - 0.2, 0, 0.25); a.set('upperArmR', -s * 0.9 * run - 0.2, 0, -0.25);
      a.set('forearmL', -0.9, 0, 0); a.set('forearmR', -0.9, 0, 0);
    } else if (style === 1) {
      a.set('upperArmL', -1.3 + s * 0.2, 0, 0.2); a.set('upperArmR', -1.3 - s * 0.2, 0, -0.2);
      a.set('forearmL', -0.3, 0, 0); a.set('forearmR', -0.3, 0, 0);
    } else {
      a.set('upperArmL', -0.6 + sin(phase * 1.3) * 0.8, 0, 0.6 + cos(phase) * 0.3); a.set('upperArmR', -0.6 - sin(phase * 1.1) * 0.8, 0, -0.6 - cos(phase) * 0.3);
      a.set('forearmL', -0.6, 0, 0); a.set('forearmR', -0.6, 0, 0);
    }
  } else {
    // idle variants
    if (idle === 'sit') {
      a.set('thighL', -1.5, 0, 0.15); a.set('thighR', -1.5, 0, -0.15); a.set('shinL', 1.5, 0, 0); a.set('shinR', 1.5, 0, 0);
      a.rootOffT.y = -0.5; a.set('spine', 0.4 + sin(t * 0.7) * 0.05, 0, 0); a.set('chest', 0.2, 0, 0); a.set('head', 0.5, 0, sin(t * 0.4) * 0.2);
      a.set('upperArmL', -0.4, 0, 0.1); a.set('upperArmR', -0.4, 0, -0.1); a.set('forearmL', -0.6, 0, 0); a.set('forearmR', -0.6, 0, 0);
    } else if (idle === 'lie') {
      a.rootRotT.x = -1.5; a.rootOffT.y = 0.13; a.rootOffT.z = 0;
      a.set('head', 0.2, sin(t * 0.3) * 0.3, 0); a.set('upperArmL', -0.3, 0, 0.6); a.set('upperArmR', 0.2, 0, -0.4);
      a.set('thighL', -0.2, 0, 0.1); a.set('shinL', 0.4, 0, 0);
    } else if (idle === 'lean') {
      a.set('spine', -0.1, 0, 0.1); a.set('head', 0.35, 0.3, 0.2); a.set('upperArmL', 0.1, 0, 0.1); a.set('upperArmR', 0.1, 0, -0.1);
      a.set('thighL', -0.1, 0, 0.1); a.set('shinL', 0.2, 0, 0);
    } else if (idle === 'vomit') {
      a.set('spine', 0.6 + sin(t * 4) * 0.08, 0, 0); a.set('chest', 0.3, 0, 0); a.set('head', 0.3, 0, 0);
      a.set('upperArmL', -0.5, 0, 0.2); a.set('upperArmR', -0.5, 0, -0.2); a.set('forearmL', -0.4, 0, 0); a.set('forearmR', -0.4, 0, 0);
      a.set('thighL', -0.3, 0, 0.1); a.set('thighR', -0.3, 0, -0.1); a.set('shinL', 0.6, 0, 0); a.set('shinR', 0.6, 0, 0); a.rootOffT.y = -0.08;
    } else {
      const sway = sin(t * 0.9 + style);
      a.set('spine', 0.12 + lean, sway * 0.08, sway * 0.05); a.set('chest', 0.1, 0, 0);
      a.set('head', 0.3 + sin(t * 0.5) * 0.15, sin(t * 0.33) * 0.4, sway * 0.2);
      a.set('upperArmL', 0.05 + sway * 0.05, 0, 0.12); a.set('upperArmR', 0.05 - sway * 0.05, 0, -0.12);
      a.set('forearmL', -0.3, 0, 0); a.set('forearmR', -0.2, 0, 0);
      a.set('thighL', 0, 0, 0.06); a.set('thighR', 0, 0, -0.06);
    }
  }
  if (attack > 0) {
    // overhead swipe with one arm (attack 0..1)
    const k = attack < 0.35 ? attack / 0.35 : 1 - (attack - 0.35) / 0.65;
    const arm = attackSide > 0 ? 'R' : 'L';
    const side = attackSide > 0 ? -1 : 1;
    const ang = attack < 0.35 ? -2.6 * k : -2.6 + (attack - 0.35) / 0.65 * 2.4;
    a.set('upperArm' + arm, ang, 0, 0.25 * side);
    a.set('forearm' + arm, -0.6 * k, 0, 0);
    a.add('chest', 0.25 * k, -0.4 * side * k, 0);
    a.add('spine', 0.1, 0, 0);
  }
  if (stagger > 0) {
    const k = sin(Math.min(1, stagger) * Math.PI);
    a.add('spine', -0.5 * k, 0, 0.2 * k); a.add('chest', -0.3 * k, 0, 0); a.add('head', -0.4 * k, 0, 0);
    a.set('upperArmL', -1.2 * k, 0, 0.9 * k); a.set('upperArmR', -1.0 * k, 0, -1.0 * k);
    a.add('thighL', 0.3 * k, 0, 0); a.add('shinL', 0.4 * k, 0, 0);
  }
  if (burning) {
    a.set('upperArmL', -2.2 + sin(t * 9) * 0.6, 0, 0.5); a.set('upperArmR', -2.0 + cos(t * 8) * 0.6, 0, -0.5);
    a.set('forearmL', -1.0, 0, 0); a.set('forearmR', -1.0, 0, 0);
    a.add('head', sin(t * 7) * 0.3, cos(t * 6) * 0.4, 0);
  }
}

/** Climb (0..1 progress). */
export function poseClimb(a, k, t) {
  a.reset();
  const up = k < 0.6;
  a.set('upperArmL', -2.8 + (up ? 0 : (k - 0.6) * 4), 0, 0.2); a.set('upperArmR', -2.8 + (up ? 0 : (k - 0.6) * 4), 0, -0.2);
  a.set('forearmL', -0.3, 0, 0); a.set('forearmR', -0.3, 0, 0);
  const s = sin(t * 12);
  a.set('thighL', -0.8 - s * 0.5, 0, 0.1); a.set('thighR', -0.8 + s * 0.5, 0, -0.1);
  a.set('shinL', 1.2, 0, 0); a.set('shinR', 1.2, 0, 0);
  a.set('spine', 0.3, 0, 0); a.set('head', -0.4, 0, 0);
}

/** Death: dir = +1 fall backward, -1 forward; k: 0..1 progress; variant for limb sprawl. */
export function poseDeath(a, dir, k, variant = 0) {
  a.reset();
  const e = Math.min(1, k * k * 1.6 + k * 0.2);
  a.rootRotT.x = -dir * 1.52 * e;
  a.rootOffT.y = 0.13 * e;
  a.rootRotT.z = (variant - 1) * 0.15 * e;
  const w = 1 - e;
  // knees buckle first
  a.set('thighL', -0.6 * w - 0.2 * e, 0, 0.1 + 0.2 * e); a.set('thighR', -0.4 * w + 0.1 * e, 0, -0.1 - 0.25 * e * variant);
  a.set('shinL', 1.1 * w + 0.4 * e, 0, 0); a.set('shinR', 0.8 * w + 0.15 * e * variant, 0, 0);
  const armOut = 0.6 + variant * 0.3;
  a.set('upperArmL', dir > 0 ? -2.2 * e : 0.2 * e, 0, armOut * e); a.set('upperArmR', dir > 0 ? -1.4 * e * (variant % 2 ? 1 : 0.4) : -0.3 * e, 0, -armOut * e);
  a.set('forearmL', -0.4 * e, 0, 0); a.set('forearmR', -0.7 * e, 0, 0);
  a.set('head', dir * 0.4 * e, (variant - 1) * 0.6 * e, 0);
  a.set('spine', -dir * 0.15 * e, 0, 0);
}

/** Incapacitated survivor sitting on the ground propped on one arm, pistol in the other. */
export function poseIncap(a, t, pitch = 0) {
  a.reset();
  a.rootOffT.y = -0.72;
  a.set('hips', -0.35, 0, 0);
  a.set('thighL', -1.3, 0, 0.25); a.set('thighR', -1.1, 0, -0.3); a.set('shinL', 0.4, 0, 0); a.set('shinR', 1.0, 0, 0);
  a.set('spine', -0.3 + sin(t * 2) * 0.03, 0, 0); a.set('chest', -0.1 - pitch * 0.3, 0, 0); a.set('head', 0.2 - pitch * 0.3, 0, 0);
  a.set('upperArmL', 0.5, 0, 0.45); a.set('forearmL', 0.1, 0, 0);
  a.set('upperArmR', -1.2, 0.1, -0.15); a.set('forearmR', -0.3, 0, 0);
}

/** Survivor hanging from a ledge (facing the wall). */
export function poseLedge(a, t, slip = 0) {
  a.reset();
  a.rootOffT.y = -1.75;
  a.set('upperArmL', -3.0 + slip * 0.3, 0, 0.15); a.set('upperArmR', -3.0, 0, -0.15 - slip * 0.3);
  a.set('forearmL', -0.2, 0, 0); a.set('forearmR', -0.2, 0, 0);
  const k = sin(t * 3) * (0.2 + slip * 0.3);
  a.set('thighL', -0.3 + k, 0, 0.05); a.set('thighR', -0.1 - k, 0, -0.05); a.set('shinL', 0.6, 0, 0); a.set('shinR', 0.3, 0, 0);
  a.set('head', -0.3, 0, 0);
}

/** Pinned on the back (hunter pounce / charger pummel): flailing arms. */
export function posePinnedBack(a, t, intensity = 1) {
  a.reset();
  a.rootRotT.x = -1.52; a.rootOffT.y = 0.13;
  const s = sin(t * 14) * intensity;
  a.set('upperArmL', -1.6 + s * 0.6, 0, 0.6); a.set('upperArmR', -1.6 - s * 0.6, 0, -0.6);
  a.set('forearmL', -1.2, 0, 0); a.set('forearmR', -1.2, 0, 0);
  a.set('thighL', -0.5 + s * 0.3, 0, 0.15); a.set('thighR', -0.3 - s * 0.3, 0, -0.15);
  a.set('shinL', 0.8, 0, 0); a.set('shinR', 0.6, 0, 0);
  a.set('head', 0.3, sin(t * 7) * 0.4, 0);
}

/** Being choked / dragged by a tongue: hands at throat, feet dragging. */
export function poseChoked(a, t, dragging) {
  a.reset();
  a.set('upperArmL', -1.6, 0, -0.4); a.set('upperArmR', -1.6, 0, 0.4);
  a.set('forearmL', -1.9, 0, 0); a.set('forearmR', -1.9, 0, 0);
  a.set('head', -0.4 + sin(t * 10) * 0.1, 0, 0);
  if (dragging) { a.rootRotT.x = 0.5; a.set('thighL', 0.2, 0, 0); a.set('thighR', 0.4, 0, 0); a.rootOffT.y = -0.25; }
  else { const s = sin(t * 9); a.set('thighL', -0.3 + s * 0.2, 0, 0); a.set('thighR', -0.3 - s * 0.2, 0, 0); a.set('shinL', 0.5, 0, 0); a.set('shinR', 0.5, 0, 0); }
}

/** Ridden by a jockey: stumbling with hands up to the head. */
export function poseRidden(a, t, phase, speed) {
  a.reset();
  poseLegs(a, phase, Math.min(1, speed / 4) * 0.8 + 0.2);
  a.set('upperArmL', -2.5 + sin(t * 9) * 0.4, 0, 0.4); a.set('upperArmR', -2.5 + cos(t * 8) * 0.4, 0, -0.4);
  a.set('forearmL', -1.3, 0, 0); a.set('forearmR', -1.3, 0, 0);
  a.set('spine', 0.2 + sin(t * 5) * 0.15, 0, sin(t * 4) * 0.15);
}

/** Being revived / reviving / healing (kneel with hands forward). */
export function poseKneel(a, t) {
  a.reset();
  a.rootOffT.y = -0.45;
  a.set('thighL', -1.4, 0, 0.1); a.set('shinL', 1.5, 0, 0);
  a.set('thighR', 0.1, 0, -0.1); a.set('shinR', 1.6, 0, 0); a.set('footR', 0.6, 0, 0);
  a.set('spine', 0.4, 0, 0); a.set('chest', 0.2, 0, 0); a.set('head', 0.3, 0, 0);
  const s = sin(t * 6) * 0.15;
  a.set('upperArmL', -0.9 + s, 0, 0.1); a.set('upperArmR', -0.9 - s, 0, -0.1);
  a.set('forearmL', -0.5, 0, 0); a.set('forearmR', -0.5, 0, 0);
}
