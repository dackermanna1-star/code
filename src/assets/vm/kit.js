// Shared colours, parts and animation generators for the weapon builders.

import { Z, EASE } from './anim.js';
import { DEG } from './builder.js';
import { arm, handPose } from './hands.js';
import { add, sub, mul, lerp, chain, rel, offset, rotAbout, dirIn, tidy, unwrapKeys } from './pose.js';

// ---------------------------------------------------------------- colours
// Tints multiply the (mostly grey ~0.8) detail textures.
export const C = {
  black: [0.2, 0.2, 0.21],
  dark: [0.27, 0.27, 0.28],
  grey: [0.4, 0.4, 0.41],
  steel: [0.62, 0.63, 0.65],
  silver: [0.68, 0.69, 0.72],
  olive: [0.26, 0.28, 0.22], // olive-black receiver (Galil)
  green: [0.35, 0.42, 0.27], // AWP / AUG furniture
  odGreen: [0.36, 0.4, 0.26],
  tan: [0.78, 0.66, 0.46],
  wood: [1, 1, 1],
  woodDark: [0.72, 0.66, 0.62],
  bore: [0.04, 0.04, 0.04],
  brass: [1.0, 0.8, 0.42],
  red: [0.75, 0.15, 0.1],
  white: [1, 1, 1],
  glass: [1, 1, 1],
};

// ---------------------------------------------------------------- parts

// Simple scope: tube with bells, turrets and a mount, centred on the bore line.
// f0/f1: forward extent, y: tube axis height.
export function scope(pen, f0, f1, y, o = {}) {
  const r = o.r || 0.6, rb = o.rb || 0.95, rf = o.rf || 1.05;
  const tint = o.tint || C.black;
  const len = f1 - f0;
  // ocular bell (rear) -> tube -> objective bell (front)
  pen.lathe('metal', tint, [
    [0.0, f0], [rb * 0.92, f0], [rb, f0 + 0.25], [rb, f0 + len * 0.16], [r, f0 + len * 0.28],
    [r, f0 + len * 0.62], [rf, f0 + len * 0.8], [rf, f1 - 0.2], [rf * 0.92, f1], [0, f1],
  ], { n: o.n || 10, p: [o.x || 0, y, 0] });
  // lenses
  pen.quad('lens', C.glass, rb * 1.5, rb * 1.5, { p: [o.x || 0, y, -f0 + 0.02], r: [90, 0, 0] });
  // turrets
  const fm = f0 + len * 0.45;
  pen.cyl('metal', tint, 0.38, 0.38, 0.55, { n: 8, p: [o.x || 0, y + r - 0.1, -fm], r: [-90, 0, 0] });
  pen.cyl('metal', tint, 0.38, 0.38, 0.55, { n: 8, p: [(o.x || 0) + r - 0.1, y, -fm], r: [0, -90, 0] });
  // mount rings
  if (o.mount !== false) {
    const yb = o.base ?? y - r - 0.6;
    for (const f of [f0 + len * 0.32, f0 + len * 0.6]) {
      pen.span('metal', C.dark, f - 0.35, f + 0.35, yb, y - r * 0.6, 0.55);
      pen.cyl('metal', C.dark, r + 0.12, r + 0.12, 0.6, { n: 10, p: [o.x || 0, y, -(f - 0.3)], cap0: false, cap1: false });
    }
  }
}

// ---------------------------------------------------------------- body / arms

// Pivot of whole-rig weight shifts (the chest, below and behind the eye) and the
// shoulders the arm solve hangs the elbows from (view space, GoldSrc units).
export const BODY_PIVOT = [0, -14, 4];
export const SHOULDERS = { R: [10.5, -12.5, 7], L: [-10.5, -12.5, 7] };

// Set the rig (gun pivot) rest pose: where the weapon sits in view space.
export function hold(mb, p, r = [0, 0, 0], s = 1) {
  const rig = mb.nodes.rig;
  const b = mb.nodes.body ? mb.nodes.body.position : { x: 0, y: 0, z: 0 };
  const lp = [p[0] - b.x, p[1] - b.y, p[2] - b.z];
  rig.scale.setScalar(s);
  rig.position.set(lp[0], lp[1], lp[2]);
  rig.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ');
  rig.userData.rest = { p: lp, r: [...r] };
}

// ---------------------------------------------------------------- anims

const bump = (u, a, b) => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI) ** 2);
const K = (u, pose, e) => [u, pose.p, pose.r, e];

// Idle: breathing (the chest rises, the weapon follows), a slow weight drift
// and - for two-handed weapons - the support hand re-settling its grip.
export function idle(o = {}) {
  const amp = o.amp ?? 1;
  return {
    dur: o.dur || 5,
    loop: true,
    blend: 0.3,
    tracks: {},
    fn(u, t, vm) {
      const a = u * Math.PI * 2;
      const body = vm.nodes.body, rig = vm.nodes.rig;
      body.position.y += 0.11 * Math.sin(a * 2) * amp;
      body.position.z -= 0.04 * Math.sin(a * 2) * amp;
      body.rotation.x += 0.2 * DEG * Math.sin(a * 2 - 0.8) * amp;
      rig.position.x += 0.05 * Math.sin(a + 0.4) * amp;
      rig.position.y += 0.03 * Math.sin(a * 3 + 1.0) * amp;
      rig.rotation.x += 0.16 * DEG * Math.sin(a * 3 + 2.1) * amp;
      rig.rotation.y += 0.3 * DEG * Math.sin(a + 1.9) * amp;
      rig.rotation.z += 0.35 * DEG * Math.sin(a + 0.8) * amp;
      const l = o.regrip && vm.nodes.lhand;
      if (l && vm._animated.indexOf(l) >= 0) {
        const w = bump(u, 0.6, 0.8);
        l.position.z += 0.25 * w;
        l.position.y -= 0.1 * w;
        l.rotation.z += 4 * DEG * w;
      }
      if (o.fn) o.fn(u, t, vm);
    },
  };
}

// Raise into view from below-right, rolling up into the hold with a small
// overshoot; the support hand (lh: its rest pose) catches the handguard late.
export function draw(o = {}) {
  const from = o.from || { p: [2.0, -13, 5], r: [-52, 10, -36] };
  const tracks = {
    rig: [
      [0, from.p, from.r],
      [0.3, [0.7, -2.8, 1.1], [-13, 3, -11], 'cr'],
      [0.5, [0, 0.42, -0.2], [2.6, -0.5, 1.3], 'cr'],
      [0.68, [0, -0.08, 0.04], [-0.5, 0.1, -0.3], 'io'],
      [0.86, Z, Z, 'io'],
    ],
    body: [[0, [0, -0.6, 0.3], [-1.6, 1.0, 0]], [0.45, [0, 0.12, 0], [0.5, 0, 0], 'out2'], [0.85, Z, Z, 'io']],
  };
  if (o.lh) {
    const L = o.lh;
    const lag = { p: add(L.p, [-1.4, -4.2, 3.2]), r: add(L.r, [-18, 8, 12]) };
    tracks.lhand = { abs: true, k: [K(0, lag), K(o.lhAt ?? 0.2, lag), K((o.lhAt ?? 0.2) + 0.38, L, 'back'), K(1, L)] };
  }
  Object.assign(tracks, o.tracks || {});
  return { dur: o.dur || 1, blend: 0.05, tracks, attach: o.attach, vis: o.vis, end: o.end, fn: o.fn };
}

/**
 * Recoil: the gun slams back and flips up within ~30 ms, recovers with a small
 * undershoot; the chest takes a little of the kick (camera-relative weight).
 * `v` picks a variant (0 straight, 1 right, 2 left/high). Optional bolt /
 * charging handle reciprocation (o.bolt = travel).
 */
export function shoot(v, o = {}) {
  const D = o.dur || 0.4;
  const S = (s) => Math.min(0.97, s / D);
  const k = o.kick ?? 1;
  const side = [0, 1, -1][v] ?? 0;
  const up = (o.up ?? 2.8) * k * (v === 2 ? 1.15 : 1);
  const back = (o.back ?? 1.5) * k;
  const roll = (o.roll ?? 1.1) * k;
  const pk = o.peakT ?? 0.028;
  const rec = o.recT ?? 0.07;
  const tracks = {
    rig: tidy([
      [0, Z, Z],
      [S(pk), [0.07 * side * k, 0.16 * k, back], [up, -0.5 * side * k, roll * side + 0.25 * k], 'out'],
      [S(pk + rec), [0.02 * side * k, 0.05 * k, back * 0.22], [up * 0.3, -0.15 * side * k, roll * side * 0.3], 'io'],
      [S(pk + rec + 0.1), [0, -0.03 * k, -0.06 * k], [-0.18 * k, 0.04 * side, -0.1 * side], 'io'],
      [1, Z, Z, 'io'],
    ]),
    body: tidy([[0, Z, Z], [S(pk + 0.012), [0, 0.04 * k, 0.12 * k], [(o.bodyUp ?? 0.35) * k, 0.12 * side * k, 0], 'out'], [S(pk + 0.3), Z, Z, 'io']]),
  };
  if (o.bolt) {
    tracks[o.boltNode || 'bolt'] = tidy([[0, Z, Z], [S(o.boltPeak ?? 0.014), [0, 0, o.bolt], Z, 'out'], [S(o.boltBack ?? 0.05), Z, Z, 'in2']]);
  }
  Object.assign(tracks, o.tracks || {});
  return { dur: D, blend: 0.025, tracks, fn: o.fn, end: o.end, hold: o.hold };
}

export function shootSet(o = {}) {
  return { shoot1: shoot(0, o), shoot2: shoot(1, o), shoot3: shoot(2, o) };
}

// Dry fire: a trigger twitch.
export function shootEmpty(o = {}) {
  return {
    dur: o.dur || 0.25,
    tracks: { rig: [[0, Z, Z], [0.15, [0, -0.05, 0.12], [-0.5, 0, 0.3], 'out'], [0.4, [0, 0.03, 0], [0.25, 0, 0], 'io'], [1, Z, Z]] },
  };
}

/**
 * Magazine change. Authored in the gun frame (the hand's and the magazine's
 * parent); times are fractions of the default duration `dur`, aligned with the
 * reload sounds the game schedules (clip out ~0.18, clip in ~0.55, bolt ~0.82).
 *
 *  LH     : support-hand rest pose (abs)          G    : hand gripping the seated mag (abs)
 *  style  : 'pull' - the hand strips the mag and tosses it; 'drop' - the mag falls free
 *  out    : mag offset just unseated               toss : mag offset where the hand lets go
 *  ins    : mag offset lined up for insertion      away : off-screen hand pose (fetching)
 *  tilt   : rig offset while reloading             slap : palm slap on the base after seating
 *  charge : {pose, pull, node, travel, via, slap, tilt, catch} charging handle / bolt release
 *  t      : event times {tilt, reach, out, rel, fetch, align, seat, charge, back}
 *  tracks : extra tracks merged in (e.g. a slide)
 */
export function magReload(mb, o) {
  const D = o.dur;
  const S = (s) => s / D;
  const T = { tilt: 0.12, reach: 0.135, out: 0.18, fetch: 0.36, align: 0.48, seat: 0.55, charge: 0.82, back: 0.94, ...(o.t || {}) };
  T.grab = T.grab ?? Math.min(T.out - S(0.03), T.reach + S(0.04));
  T.rel = T.rel ?? T.out + S(0.12);
  T.low = T.low ?? Math.min(T.fetch - S(0.04), T.rel + S(0.2));
  const magName = o.mag || 'mag';
  const magNode = mb.nodes[magName];
  const M0 = { p: [...magNode.userData.rest.p], r: [...magNode.userData.rest.r] };
  const LH = o.LH, G = o.G, away = o.away;
  const tilt = o.tilt;
  const Rel = rel(M0, G);
  const H = (off) => chain(offset(M0, off), Rel, G.r);
  // fresh magazine riding in the hand (exactly the seated mag when the hand is at G)
  const inHand = rel(G, M0);
  const handName = o.hand || 'lhand';
  mb.clone(magName, magName + '_new', handName, inHand.p, inHand.r);
  // which way is "down" for a falling mag, in the gun frame, while tilted
  const g = dirIn(mb.nodes, magNode.parent.name, [0, -1, 0], { rig: tilt.r });
  const out = o.out || { p: [0, -2.2, 0], r: [0, 0, 0] };
  const toss = o.toss || { p: add(out.p, [-1.2, -3.5, 1.2]), r: add(out.r, [18, 0, 12]) };
  const ins = o.ins || { p: [0, -3.4, -0.4], r: [7, 0, 0] };
  const insLow = { p: add(ins.p, mul(g, 5)), r: add(ins.r, [10, 0, -6]) };
  const style = o.style || 'pull';
  const spin = o.spin || [40, 10, -30];
  const drift = o.drift || [-1.5, 0, 1.5];

  // ---- the old magazine
  const tracks = {};
  const mk = [[0, Z, Z]];
  let fallEnd;
  const attach = [];
  if (style === 'pull') {
    mk.push([T.grab, Z, Z], [T.rel, toss.p, toss.r]);
    fallEnd = T.rel + S(0.36);
    mk.push([fallEnd, add(add(toss.p, mul(g, 26)), drift), add(toss.r, spin), 'in2']);
    attach.push({ node: magName, to: handName, u0: T.grab, u1: T.rel });
  } else {
    const t0 = T.out - S(0.035);
    mk.push([t0, Z, Z], [T.out + S(0.03), out.p, out.r, 'in2']);
    fallEnd = T.out + S(0.4);
    mk.push([fallEnd, add(add(out.p, mul(g, 26)), drift), add(out.r, spin), 'in2']);
  }
  mk.push([Math.max(fallEnd + 0.001, T.fetch), Z, Z, 'step']);
  tracks[magName] = tidy(mk);

  // ---- the support hand
  const lk = [K(0, LH)];
  if (style === 'pull') {
    const pre = { p: add(G.p, o.preGrip || [-0.7, -1.4, 1.0]), r: add(G.r, [0, -6, 14]) };
    if (o.before) lk.push(...o.before);
    else lk.push(K(Math.max(0.02, T.reach - S(0.18)), { p: lerp(LH.p, pre.p, 0.4), r: lerp(LH.r, pre.r, 0.5) }, 'cr'));
    lk.push(K(T.reach - S(0.06), pre, 'cr'), K(T.reach, G, 'out2'), K(T.grab, G));
    lk.push(K(T.out, H(out), 'io3'), K(T.rel, H(toss), 'out2'));
    lk.push(K(T.low, away, 'in2'));
  } else if (o.handStartsAway) {
    lk.push(K(T.low, away));
  } else {
    // the hand lets go of the handguard and heads for a fresh mag as the old one drops
    lk.push(K(T.out - S(0.1), { p: add(LH.p, [-0.3, -0.6, 0.4]), r: add(LH.r, [-6, 0, 6]) }, 'io'));
    lk.push(K(T.out + S(0.06), H({ p: add(out.p, [0, -2, 0.6]), r: out.r }), 'cr'));
    lk.push(K(T.low, away, 'in2'));
  }
  const away2 = { p: add(away.p, [0.6, 0.8, -0.6]), r: add(away.r, [6, -4, 0]) };
  lk.push(K(T.fetch, away2, 'io'));
  lk.push(K(T.align - S(0.12), H(insLow), 'cr'));
  lk.push(K(T.align, H(ins), 'cr'));
  if (o.rock) lk.push(K(T.seat - S(0.05), H(o.rock), 'io'));
  lk.push(K(T.seat, G, 'in2'));
  let tAfter = T.seat + S(0.08);
  lk.push(K(tAfter, G));
  let slapT = null;
  if (o.slap) {
    const low = { p: add(G.p, mul(sub(H(ins).p, G.p), 0.45)), r: add(G.r, [-8, 0, -6]) };
    lk.push(K(T.seat + S(0.15), low, 'out2'));
    slapT = T.seat + S(0.21);
    lk.push(K(slapT, G, 'in2'));
    tAfter = slapT + S(0.06);
    lk.push(K(tAfter, { p: add(G.p, mul(sub(H(ins).p, G.p), 0.2)), r: G.r }, 'out2'));
  }
  if (o.afterSeat) { lk.push(...o.afterSeat); tAfter = o.afterSeat[o.afterSeat.length - 1][0]; }
  const ch = o.charge;
  const rk = [];
  const R = (dp, dr, tl = tilt) => [add(tl.p, dp), add(tl.r, dr)];
  if (ch) {
    const pulled = { p: add(ch.pose.p, ch.pull), r: add(ch.pose.r, ch.pullR || [0, 0, 0]) };
    const tGrab = T.charge - S(ch.pullT ?? 0.1);
    const tReach = tGrab - S(0.06);
    if (ch.via) lk.push(K(tReach - S(ch.viaT ?? 0.12), ch.via, 'cr'));
    lk.push(K(tReach, ch.pose, ch.via ? 'cr' : 'io'), K(tGrab, ch.pose));
    lk.push(K(T.charge, pulled, ch.catch ? 'in2' : 'io'));
    const tRel = T.charge + S(0.03);
    if (ch.slap) {
      // HK slap: the hand drives the handle out of its notch, palm forward
      lk.push(K(tRel, { p: add(pulled.p, [0.3, 0.5, -1.6]), r: add(pulled.r, [0, 0, -10]) }, 'in2'));
      lk.push(K(tRel + S(0.1), { p: add(ch.pose.p, [0.4, -0.6, -1.2]), r: add(ch.pose.r, [-6, 0, -8]) }, 'out2'));
    } else {
      lk.push(K(tRel, pulled));
      lk.push(K(tRel + S(0.1), { p: add(pulled.p, ch.letGo || [-0.6, 0.9, 0.5]), r: add(pulled.r, [-10, 0, 0]) }, 'out2'));
    }
    if (ch.node !== false) {
      const node = ch.node || 'bolt';
      const travel = ch.travel || [0, 0, Math.abs(ch.pull[2])];
      tracks[node] = ch.catch
        ? [[0, Z, Z]]
        : tidy([[0, Z, Z], [tGrab, Z, Z], [T.charge, travel, Z, 'io'], [T.charge + S(0.012), travel, Z], [T.charge + S(0.045), Z, Z, 'in2']]);
    }
  }
  lk.push(K(T.back, LH, ch ? 'io' : 'io'), K(1, LH));
  tracks[handName] = { abs: true, k: tidy(lk) };

  // ---- the weapon: tilt in, react to every impact, roll back out
  const tiltC = ch && ch.tilt ? ch.tilt : tilt;
  rk.push([0, Z, Z]);
  rk.push([T.tilt, ...R([0, 0, 0], [0, 0, 0]), 'back']);
  rk.push([T.out - S(0.03), ...R([0.05, 0.05, 0], [0.3, 0, -0.3])]);
  rk.push([T.out + S(0.05), ...R([0.05, -0.4, 0.15], [-2.4, 0.4, 1.3]), 'out2']);
  rk.push([T.out + S(0.24), ...R([0, 0, 0], [0, 0, 0]), 'io']);
  rk.push([T.fetch, ...R([0.25, -0.2, 0.1], [0.9, -0.7, -1.2]), 'io']);
  rk.push([T.seat - S(0.03), ...R([0.12, -0.15, 0.05], [0.5, -0.4, -0.6]), 'io']);
  rk.push([T.seat + S(0.035), ...R([0, 0.6, 0.3], [3.4, 0, -0.9]), 'out']);
  rk.push([T.seat + S(0.2), ...R([0.05, 0.05, 0], [0.3, 0, -0.2]), 'settle']);
  if (slapT) {
    rk.push([slapT - S(0.01), ...R([0.05, 0.05, 0], [0.3, 0, -0.2])]);
    rk.push([slapT + S(0.03), ...R([0, 0.5, 0.2], [2.6, 0, 0.6]), 'out']);
    rk.push([slapT + S(0.16), ...R([0, 0, 0], [0, 0, 0]), 'settle']);
  }
  let tEnd = Math.max(T.seat + S(0.25), slapT ? slapT + S(0.2) : 0);
  if (ch) {
    const tGrab = T.charge - S(ch.pullT ?? 0.1);
    rk.push([tGrab - S(0.04), ...R([0, 0, 0], [0, 0, 0], tiltC), 'io']);
    rk.push([T.charge, ...R([0, -0.1, 0.5], [-1.8, 0, 0.6], tiltC), 'io']);
    rk.push([T.charge + S(0.045), ...R([0, 0.2, -0.35], [2.0, 0.3, -0.5], tiltC), 'out']);
    rk.push([T.charge + S(0.2), ...R([0, 0, 0], [0, 0, 0], tiltC), 'settle']);
    tEnd = T.charge + S(0.2);
  }
  if (o.rigExtra) { rk.push(...o.rigExtra); tEnd = Math.max(tEnd, ...o.rigExtra.map((k) => k[0])); }
  const tRet = Math.max(tEnd + 0.005, T.back - S(0.3));
  rk.push([tRet, ...R([0, 0, 0], [0, 0, 0], tiltC)]);
  rk.push([1, Z, Z, 'back']);
  tracks.rig = tidy(rk);
  tracks.body = tidy([
    [0, Z, Z],
    [T.tilt, [0, -0.35, 0.25], [1.0, 1.2, 0.5], 'io'],
    [T.out + S(0.06), [0, -0.5, 0.35], [0.2, 1.4, 0.6], 'out2'],
    [T.fetch, [0, -0.25, 0.2], [0.8, 0.6, 0.3], 'io'],
    [T.seat + S(0.04), [0, -0.15, 0.1], [1.5, 0.8, 0.3], 'out'],
    [Math.min(0.95, tRet + 0.02), [0, -0.1, 0.1], [0.4, 0.3, 0.1], 'io'],
    [1, Z, Z, 'io'],
  ]);
  Object.assign(tracks, o.tracks || {});
  const vis = {
    [magName]: [[fallEnd, T.seat - 1e-4, false]],
    [magName + '_new']: [[T.fetch, T.seat, true]],
    ...(o.vis || {}),
  };
  return { dur: D, blend: 0.1, tracks, attach, vis, fn: o.fn, end: o.end, T };
}

// ---------------------------------------------------------------- rifle rig

/**
 * Arms + standard animation set for a two-handed magazine weapon.
 * Hand placements are given relative to standard spots and can be shifted:
 *  lh: {at:[x,y,f] (support point under the handguard), ...overrides}
 *  rh: right hand overrides (default: on a pistol grip at the origin)
 *  mag: {at:[x,y,f]} point on the left side of the inserted magazine to grab,
 *       {pose} explicit grip, {out, toss, ins, rock, style, slap, pivot}
 *  charge: {at:[x,y,f], side:'over'|'R'|'L'|'top'|'catch'|'hk', pull} charging handle
 */
export function rifleRig(mb, cfg) {
  const lhAt = cfg.lh?.at || [0, 0.35, 10];
  const LH = {
    p: add([-1.3, -1.6, -9.0 + (10 - lhAt[2])], [lhAt[0], lhAt[1], 0]),
    fwd: [0.62, 0.15, -0.8], palm: [0.35, 1, 0.1],
    ...(cfg.lh || {}),
  };
  if (cfg.lh?.p) LH.p = cfg.lh.p;
  const RH = { p: [0.85, -1.5, 2.55], fwd: [0.05, -0.28, -1], palm: [-1, 0, -0.2], ...(cfg.rh || {}) };
  if (!cfg.noLeft) arm(mb, 'lhand', cfg.lhParent || 'gun', 'L', { ...LH, fore: cfg.lh?.fore || [-0.5, -0.55, 1], grip: cfg.lh?.grip || 'cup', len: 18 });
  if (!cfg.noRight) arm(mb, 'rhand', cfg.rhParent || 'gun', 'R', { ...RH, fore: cfg.rh?.fore || [0.35, -0.55, 1], grip: cfg.rh?.grip || 'trigger', len: 18 });
  const LHP = handPose(LH.p, LH.fwd, LH.palm);

  const kick = cfg.kick ?? 1;
  const anims = {
    idle: idle({ regrip: !cfg.noLeft, ...(cfg.idle || {}) }),
    draw: draw({ dur: cfg.draw ?? 1.0, lh: cfg.noLeft ? null : LHP, ...(cfg.drawOpts || {}) }),
    ...shootSet({ bolt: cfg.bolt ?? 0, dur: cfg.shootDur ?? 0.4, kick, ...(cfg.shootOpts || {}) }),
    shoot_empty: shootEmpty(),
  };
  if (cfg.reload !== false) {
    const mc = cfg.mag || {};
    const m = mc.at || [-0.6, -2.5, 5];
    const G = mc.pose || handPose([m[0] - 0.85, m[1] + 0.1, -m[2] + 1.5], mc.fwd || [0.14, -0.35, -0.93], mc.palm || [1, 0, 0]);
    const pivot = mc.pivot || [0, 0.3, -1.0];
    let charge = null;
    if (cfg.charge) {
      const c = cfg.charge.at;
      const side = cfg.charge.side || 'R';
      const pull = cfg.charge.pull ?? 3;
      let pose, via, pullV = [0, 0, pull], extra = {};
      if (side === 'over') {
        // reach over the receiver and hook a right-side handle with the fingers
        // palm on top of the receiver, fingers curled down the right side
        const fwd = [1, -0.2, -0.15], n = Math.hypot(...fwd);
        const kn = [c[0] - 0.6, c[1] + 1.2, -c[2] + 0.1];
        pose = handPose(add(kn, mul(fwd, -3.3 / n)), fwd, [0.1, -1, 0]);
        via = { p: add(pose.p, [-0.7, 0.8, 0.3]), r: add(pose.r, [8, 0, -10]) };
        // roll the rifle over so the top and right side face the eye
        extra = { letGo: [-0.9, 1.2, 0.3], tilt: { p: [-3, 3, 1], r: [10, 30, 40] } };
      } else if (side === 'R') {
        // up from under the gun, fingers hooking a right-side handle
        pose = handPose([c[0] + 0.75, c[1] - 4.0, -c[2] + 0.5], [-0.12, 1, -0.12], [-1, 0.05, 0]);
        via = { p: add(pose.p, [0.6, -2.4, 1.2]), r: add(pose.r, [-10, 0, 0]) };
        extra = { letGo: [0.6, -1.0, 0.3], tilt: { p: [-2.2, 3.6, 1.0], r: [14, 2, 16] } };
      }
      else if (side === 'L' || side === 'hk') {
        pose = handPose([c[0] - 1.9, c[1] - 1.6, -c[2] + 3.3], [0.25, 0.35, -0.9], [1, 0.2, 0]);
        extra = { letGo: [-0.9, -0.4, 0.4], slap: side === 'hk' };
      } else if (side === 'catch') {
        // heel of the hand slaps the bolt catch on the left of the receiver
        pose = handPose([c[0] - 1.15, c[1] - 2.6, -c[2] + 1.9], [0.25, 0.8, -0.55], [1, 0, 0.15]);
        pullV = [0.5, 0.1, 0];
        extra = { catch: true, node: false, pullT: 0.07, letGo: [-1.0, -0.6, 0.3] };
      } else if (side === 'hook') {
        // fingers hooked through from the left (FAMAS handle under the carry handle)
        pose = handPose([c[0] - 3.4, c[1] - 0.2, -c[2] - 0.7], [1, 0.05, -0.05], [0, -0.15, 1]);
        via = { p: add(pose.p, [-1.5, -1.2, 1.2]), r: add(pose.r, [0, 10, 0]) };
        extra = { letGo: [-1.0, -0.3, 0.4], tilt: { p: [-3.2, 3.2, 1.2], r: [16, 22, -8] } };
      } else {
        // over the top, fingers on a knob / T-handle
        pose = handPose([c[0] - 2.6, c[1] + 0.9, -c[2] + 1.6], [0.75, -0.3, -0.6], [0.3, -1, 0]);
        via = { p: add(pose.p, [-1.4, 0.6, 0.6]), r: add(pose.r, [6, 0, -6]) };
        // cant the gun so its top faces the reaching hand, push it out a little
        extra = { letGo: [-1.0, 0.8, 0.4], tilt: { p: [-4.0, 4.0, -1.2], r: [12, 24, 34] } };
      }
      if (cfg.charge.pose) pose = cfg.charge.pose;
      if (cfg.charge.viaOff) via = { p: add(pose.p, cfg.charge.viaOff), r: pose.r };
      charge = { pose, via: cfg.charge.via ?? via, pull: cfg.charge.pullV || pullV, travel: cfg.charge.boltPull, node: cfg.charge.node, ...extra, ...(cfg.charge.tilt ? { tilt: cfg.charge.tilt } : {}), ...(cfg.charge.opts || {}) };
    }
    const D = cfg.reload ?? 2.5;
    anims.reload = magReload(mb, {
      dur: D,
      LH: LHP,
      G,
      away: mc.away || handPose([-8, -24, 2], [0.3, -0.2, -0.93], [1, 0.4, 0]),
      style: mc.style || 'pull',
      out: mc.out || (mc.rockOut ? rotAbout([mc.rockOut, 0, 0], pivot, [0, -0.9, -0.3]) : { p: [0, -2.4, -0.15], r: [4, 0, 0] }),
      toss: mc.toss,
      ins: mc.ins || (mc.rockIn ? rotAbout([mc.rockIn, 0, 0], pivot, [0, -1.6, -0.2]) : { p: [0, -3.4, -0.5], r: [7, 0, 0] }),
      rock: mc.rockIn ? rotAbout([mc.rockIn * 0.45, 0, 0], pivot) : null,
      slap: mc.slap,
      preGrip: mc.preGrip,
      handStartsAway: cfg.noLeft,
      tilt: cfg.tilt || { p: [-3.5, 3.8, 1.5], r: [20, 20, -22] },
      charge,
      t: cfg.reloadTimes,
      tracks: cfg.reloadTracks,
      before: cfg.reloadBefore,
      afterSeat: cfg.reloadAfterSeat,
      rigExtra: cfg.reloadRig,
    });
  }
  return { anims, LH, RH, LHP };
}


/**
 * Screw a silencer on / off with the left hand (m4a1, usp).
 *  f: forward position of the silencer centre (gun frame), y: bore height,
 *  hand: left-hand rest pose (abs), node: silencer node name.
 */
export function silencerAnim(cfg, attach) {
  const f = cfg.f, y = cfg.y, node = cfg.node || 'sil';
  const off = (o) => [o[0], o[1], o[2]];
  const silK = [
    [0, [0, -24, 8], Z],
    [0.22, [0, -24, 8], Z],
    [0.38, [0, -2.2, -4.5], Z, 'out2'],
    [0.46, [0, 0, -3.2], Z, 'io'],
    [0.53, Z, Z, 'io'],
    [0.82, Z, [0, 0, -720], 'lin'],
    [1, Z, [0, 0, -720]],
  ];
  // hand rides along the silencer: grip pose relative to the silencer centre
  const gp = (o) => handPose([o[0] - 1.25, y + o[1] - 1.45, -f + o[2] + 3.6], [0.55, 0.42, -0.72], [0.45, 1, 0.05]);
  const hk = (u, o, e = 'io') => { const h = gp(o); return [u, h.p, h.r, e]; };
  const hand = cfg.hand;
  const away = handPose([-8, -24, 2], [0.3, -0.2, -0.93], [1, 0.4, 0]);
  let lk = [
    [0, hand.p, hand.r],
    [0.12, away.p, away.r, 'in2'],
    [0.22, away.p, away.r],
    hk(0.38, [0, -2.2, -4.5], 'out2'),
    hk(0.46, [0, 0, -3.2]),
    hk(0.53, [0, 0, 0]),
  ];
  // twisting wrist while screwing
  for (let i = 0; i < 4; i++) {
    const u = 0.53 + (i + 0.5) * 0.07;
    const h = gp([0, 0, 0]);
    lk.push([u, h.p, [h.r[0], h.r[1], h.r[2] + (i % 2 ? 25 : -25)], 'io']);
  }
  lk.push(hk(0.82, [0, 0, 0]));
  lk.push([0.95, hand.p, hand.r, 'io']);
  lk.push([1, hand.p, hand.r]);
  let sk = silK;
  if (!attach) {
    // reverse time
    const rev = (keys) => keys.map(([u, p, r]) => [1 - u, p, r]).reverse().map((k, i, a) => [k[0], k[1], k[2], i ? 'io' : undefined]);
    sk = rev(silK);
    lk = rev(lk);
  }
  const tilt = cfg.tilt || { p: [-7, 2.5, 4], r: [4, 42, 10] };
  return {
    dur: cfg.dur || 2,
    tracks: {
      [node]: sk,
      lhand: { abs: true, k: lk },
      rig: [[0, Z, Z], [0.2, tilt.p, tilt.r, 'io'], [0.85, tilt.p, tilt.r], [1, Z, Z, 'io']],
    },
    vis: { [node]: [[0, 1, true]] },
    end: (vm) => vm.setSilencer(attach),
  };
}

// ---------------------------------------------------------------- pistols
/**
 * One-handed pistol: right hand on the grip, left hand only appears to load a
 * magazine (and to fit a silencer). Slide locks back after 'shoot_empty'.
 *  slide: travel of the slide (units), kick: recoil scale
 */
export function pistolRig(mb, cfg) {
  const RH = { p: [0.95, -1.9, 2.6], fwd: [0.05, -0.3, -1], palm: [-1, 0, -0.15], ...(cfg.rh || {}) };
  arm(mb, 'rhand', cfg.rhParent || 'gun', 'R', { ...RH, fore: cfg.rh?.fore || [0.25, -0.6, 1], grip: cfg.rh?.grip || 'trigger', len: 18 });
  // left arm parked out of view; comes in for reloads
  const away = handPose([-9, -22, 6], [0.4, 0.5, -0.75], [0.6, 0.7, 0]);
  if (!cfg.noLeft) arm(mb, 'lhand', 'gun', 'L', { p: away.p, fwd: [0.4, 0.5, -0.75], palm: [0.6, 0.7, 0], fore: [-0.4, -0.6, 0.7], pole: [-0.4, -1, 0.2], grip: 'pinch', len: 18 });
  const travel = cfg.slide ?? 1.5;
  const sn = cfg.slideNode || 'slide';
  const kick = cfg.kick ?? 1;
  const sdur = cfg.shootDur ?? 0.45;
  const S = (s) => Math.min(0.97, s / sdur);
  const slideK = [[0, Z, Z], [S(0.012), [0, 0, travel], Z, 'out'], [S(0.055), Z, Z, 'in2']];
  const lockK = [[0, Z, Z], [S(0.012), [0, 0, travel], Z, 'out'], [S(0.03), [0, 0, travel * 0.92], Z, 'io'], [1, [0, 0, travel * 0.92], Z]];
  // pistols flip at the wrist: more pitch, less push-back than rifles
  const so = { dur: sdur, kick, up: 6.2, back: 1.3, roll: 1.6, bodyUp: 0.25, recT: 0.09, ...(cfg.shootOpts || {}) };
  const anims = {
    idle: idle({ amp: 0.8 }),
    draw: draw({ dur: cfg.draw ?? 1.0, from: { p: [1, -10, 2], r: [-55, 6, -28] }, ...(cfg.drawOpts || {}) }),
    shoot1: shoot(0, { ...so, tracks: { [sn]: slideK } }),
    shoot2: shoot(1, { ...so, tracks: { [sn]: slideK } }),
    shoot3: shoot(2, { ...so, tracks: { [sn]: slideK } }),
    shoot_empty: { ...shoot(0, { ...so, tracks: { [sn]: lockK } }), end: (vm) => { vm.state.slideLocked = true; } },
  };
  if (cfg.reload !== false && !cfg.noLeft) {
    const D = cfg.reload ?? 2.2;
    const T = { tilt: 0.12, out: 0.15, fetch: 0.3, align: 0.47, seat: 0.55, back: 0.78, charge: 0.85, ...(cfg.reloadTimes || {}) };
    const G = handPose(cfg.magGripP || [-0.9, -7.2, 2.4], [0.35, 0.15, -0.92], [0.15, 1, 0.25]);
    const tilt = cfg.tilt || { p: [-3.0, 4.6, 1.5], r: [24, 8, -22] };
    const R = (u, dp, dr, e) => [u, add(tilt.p, dp), add(tilt.r, dr), e];
    const rl = magReload(mb, {
      dur: D,
      LH: away,
      G,
      away: handPose([-6, -17, 3], [0.3, 0.6, -0.75], [0.3, 0.9, 0.3]),
      style: 'drop',
      handStartsAway: true,
      out: { p: [0, -1.5, 0.1], r: [-4, 0, 0] },
      ins: { p: [0, -3.6, 0.3], r: [-8, 0, 4] },
      slap: true,
      spin: [-30, 20, 40],
      drift: [-0.8, 0, 1.2],
      tilt,
      t: T,
    });
    const Sr = (s) => s / D;
    // rig stays tilted for the slide release, kicks when it slams home
    const rk = rl.tracks.rig.filter((k) => k[0] < T.seat + Sr(0.42) || k[0] === 1);
    rk.splice(rk.length - 1, 0,
      R(T.charge - Sr(0.06), [0, 0, 0], [0, 0, 0], 'io'),
      R(T.charge, [0.1, -0.1, 0.3], [-1.5, 0, 1.0], 'io'),
      R(T.charge + Sr(0.04), [0, 0.3, -0.3], [3.0, 0.5, -1.0], 'out'),
      R(T.charge + Sr(0.16), [0, 0, 0], [0, 0, 0], 'settle'));
    rl.tracks.rig = tidy(rk);
    rl.fn = (u, t, vm) => {
      if (!vm.state.slideLocked) return;
      // locked open since the last shot: stays back until the slide stop is pressed
      const k = u < T.charge ? 1 : Math.max(0, 1 - EASE.in2((u - T.charge) / Sr(0.035)));
      vm.nodes[sn].position.z += travel * 0.92 * k;
    };
    rl.end = (vm) => { vm.state.slideLocked = false; };
    anims.reload = rl;
  }
  const post = (vm) => {
    const c = vm.currentAnimation;
    if (vm.state.slideLocked && c !== 'reload' && !c.startsWith('shoot')) vm.nodes[sn].position.z += travel * 0.92;
  };
  return { anims, post, RH, away };
}

// Bolt-action cycle (AWP / Scout): the right hand leaves the grip, lifts the
// bolt handle, rips it back, drives it home, locks it down and returns.
// Times a..b (0..1). knob: knob position (gun frame) at rest; pivot: bolt axis
// [y, f]; lift deg; travel units.
export function boltCycle(a, b, cfg) {
  const { knob, pivot, lift = 60, travel = 3.4, rh } = cfg;
  const at = (t) => a + (b - a) * t;
  const ang = (lift * Math.PI) / 180;
  const dy = knob[1] - pivot[0], dx = knob[0];
  const rad = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx);
  const knobAt = (rot, back) => [Math.cos(a0 + rot) * rad, pivot[0] + Math.sin(a0 + rot) * rad, -knob[2] + back];
  const hp = (k, roll = 0) => {
    const h = handPose([k[0] + 2.0, k[1] + 1.1, k[2] + 2.4], [-0.55, -0.25, -0.8], [-0.3, -0.92, 0.2]);
    return [h.p, add(h.r, [0, 0, roll])];
  };
  const Rk = (u, k, e, roll) => { const [p, r] = hp(k, roll); return [u, p, r, e]; };
  const k0 = knobAt(0, 0), k1 = knobAt(ang, 0), k2 = knobAt(ang, travel);
  const rest = handPose(rh.p, rh.fwd, rh.palm);
  const pre = { p: add(rest.p, [0.8, 1.6, -0.4]), r: add(rest.r, [12, 0, 8]) };
  // tilt the rifle so the bolt comes into view while it is worked
  const tp = cfg.tilt?.p || [-2.6, 1.6, 0.6], tr = cfg.tilt?.r || [5, 9, 20];
  const T = (dp, dr) => [add(tp, dp), add(tr, dr)];
  const rigTilt = [
    [at(0.06), Z, Z, 'io'],
    [at(0.2), ...T([0, 0, 0], [0, 0, 0]), 'io'],
    [at(0.27), ...T([0, 0.15, 0], [1.2, 0, -1.5]), 'out2'],
    [at(0.42), ...T([0, -0.1, 0.45], [-1.4, 0, 1]), 'io'],
    [at(0.47), ...T([0, 0, 0.1], [0, 0, 0]), 'io'],
    [at(0.58), ...T([0, 0.05, -0.35], [1.2, 0, 0]), 'io'],
    [at(0.64), ...T([0, -0.2, -0.1], [-1.5, 0, 2]), 'out'],
    [at(0.72), ...T([0, 0, 0], [0, 0, 0]), 'io'],
    [at(0.93), Z, Z, 'back'],
  ];
  return {
    rigTilt,
    rhand: { abs: true, k: unwrapKeys([
      [0, rest.p, rest.r], [at(0), rest.p, rest.r],
      [at(0.08), pre.p, pre.r, 'cr'],
      Rk(at(0.17), k0, 'io'), Rk(at(0.27), k1, 'out2', -6), Rk(at(0.42), k2, 'io', -4),
      Rk(at(0.47), k2, 'io', -4), Rk(at(0.58), k1, 'io', -6), Rk(at(0.65), k0, 'in2'),
      [at(0.76), pre.p, pre.r, 'cr'], [at(0.88), rest.p, rest.r, 'cr'], [1, rest.p, rest.r],
    ]) },
    bolt: [
      [0, Z, Z], [at(0.17), Z, Z], [at(0.27), Z, [0, 0, lift], 'out2'], [at(0.42), [0, 0, travel], [0, 0, lift], 'io'],
      [at(0.47), [0, 0, travel], [0, 0, lift]], [at(0.58), Z, [0, 0, lift], 'io'], [at(0.65), Z, Z, 'in2'], [1, Z, Z],
    ],
  };
}
