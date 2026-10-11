// Shared colours, parts and animation generators for the weapon builders.

import { Z } from './anim.js';
import { DEG } from './builder.js';
import { arm, handPose } from './hands.js';

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

// ---------------------------------------------------------------- anims

// Subtle idle breathing applied on top of the rig rest pose.
export function idle(o = {}) {
  const amp = o.amp ?? 1;
  return {
    dur: o.dur || 4,
    loop: true,
    tracks: {},
    fn(u, t, vm) {
      const rig = vm.nodes.rig;
      const s = Math.sin(u * Math.PI * 2), c = Math.sin(u * Math.PI * 2 + 1.3);
      rig.position.y += 0.06 * s * amp;
      rig.position.x += 0.03 * c * amp;
      rig.rotation.x += 0.25 * (Math.PI / 180) * c * amp;
      rig.rotation.z += 0.15 * (Math.PI / 180) * s * amp;
    },
  };
}

// Raise into view from below-right with a twist.
export function draw(o = {}) {
  const from = o.from || { p: [1.5, -11, 3], r: [-42, 6, -30] };
  const tracks = {
    rig: [
      [0, from.p, from.r],
      [o.up ?? 0.45, [0, 0.35, -0.2], [2.5, 0, 0.8], 'out2'],
      [o.settle ?? 0.65, Z, Z, 'io'],
      [1, Z, Z],
    ],
    ...(o.tracks || {}),
  };
  return { dur: o.dur || 1, tracks, attach: o.attach, vis: o.vis, end: o.end, fn: o.fn };
}

// Recoil kick: back and up, quick out, mechanical return. `v` picks a variant.
export function shoot(v, o = {}) {
  const k = o.kick ?? 1;
  const side = [0, 1, -1][v] ?? 0;
  const up = (o.up ?? 3.2) * k * (v === 2 ? 1.25 : 1);
  const back = (o.back ?? 1.8) * k;
  const tracks = {
    rig: [
      [0, Z, Z],
      [o.peak ?? 0.07, [0.08 * side * k, 0.22 * k, back], [up, -0.7 * side * k, 1.4 * side * k], 'out'],
      [o.rec ?? 0.42, [0, 0, 0.12 * k], [0.25 * k, 0, 0], 'io'],
      [1, Z, Z, 'io'],
    ],
  };
  if (o.bolt) {
    tracks[o.boltNode || 'bolt'] = [
      [0, Z, Z],
      [o.boltPeak ?? 0.05, [0, 0, o.bolt], Z, 'out'],
      [o.boltBack ?? 0.16, Z, Z, 'in2'],
    ];
  }
  Object.assign(tracks, o.tracks || {});
  return { dur: o.dur || 0.4, tracks, fn: o.fn, end: o.end, hold: o.hold };
}

export function shootSet(o = {}) {
  return { shoot1: shoot(0, o), shoot2: shoot(1, o), shoot3: shoot(2, o) };
}

// Dry fire: a tiny trigger twitch.
export function shootEmpty(o = {}) {
  return {
    dur: o.dur || 0.25,
    tracks: { rig: [[0, Z, Z], [0.2, [0, 0, 0.15], [0.4, 0, 0], 'out'], [1, Z, Z]] },
  };
}

/**
 * Magazine reload for rifles / SMGs.
 *  hand   : rest pose of the left hand (abs, gun frame) {p, r}
 *  magGrip: abs pose of the left hand gripping the inserted magazine
 *  away   : abs pose of the left hand off-screen (holding the old mag)
 *  drop   : offset of the hand (from magGrip) when the mag has just cleared the well
 *  tilt   : rig offset while reloading {p, r}
 *  charge : optional {pose, pull:[x,y,z], node:'bolt', boltPull:[x,y,z], at: 'end'|'start'}
 */
export function magReload(o) {
  const hand = o.hand, grip = o.magGrip, away = o.away;
  const drop = o.drop || [0, -2.6, -0.4];
  const dropP = [grip.p[0] + drop[0], grip.p[1] + drop[1], grip.p[2] + drop[2]];
  const tilt = o.tilt || { p: [-1.5, 1.2, 0.5], r: [10, 6, -18] };
  const ch = o.charge;
  // timeline
  const T = {
    reach: 0.11, grab: 0.15, out: 0.24, gone: 0.34, back: 0.5, under: 0.58, ins: 0.64,
    ...(o.times || {}),
  };
  const lk = [
    [0, hand.p, hand.r],
    [T.reach, grip.p, grip.r, 'io'],
    [T.grab, grip.p, grip.r],
    [T.out, dropP, grip.r, 'in2'],
    [T.gone, away.p, away.r, 'io'],
    [T.back, away.p, away.r],
    [T.under, dropP, grip.r, 'out2'],
    [T.ins, grip.p, grip.r, 'in2'],
  ];
  const rigK = [
    [0, Z, Z],
    [0.12, tilt.p, tilt.r, 'io'],
    [T.ins - 0.005, tilt.p, tilt.r],
    [T.ins + 0.025, [tilt.p[0], tilt.p[1] + 0.35, tilt.p[2] + 0.2], [tilt.r[0] + 2.5, tilt.r[1], tilt.r[2]], 'out'],
    [T.ins + 0.07, tilt.p, tilt.r, 'io'],
  ];
  const tracks = { mag: [[0, Z, Z]] };
  let tEnd = T.ins + 0.05;
  if (ch) {
    const c0 = ch.t0 ?? T.ins + 0.08, c1 = c0 + (ch.dur ?? 0.08), c2 = c1 + 0.03;
    const pulled = [ch.pose.p[0] + ch.pull[0], ch.pose.p[1] + ch.pull[1], ch.pose.p[2] + ch.pull[2]];
    lk.push([c0, ch.pose.p, ch.pose.r, 'io']);
    lk.push([c0 + 0.02, ch.pose.p, ch.pose.r]);
    lk.push([c1, pulled, ch.pose.r, 'in2']);
    lk.push([c2, [pulled[0] - 0.4 * Math.sign(ch.pull[0] || 0), pulled[1] + 0.6, pulled[2] + 0.4], ch.pose.r, 'out']);
    tracks[ch.node || 'bolt'] = [
      [0, Z, Z], [c0 + 0.02, Z, Z], [c1, ch.boltPull || [0, 0, Math.abs(ch.pull[2])], Z, 'in2'], [c1 + 0.015, Z, Z, 'in'],
    ];
    rigK.push([c0, tilt.p, tilt.r]);
    rigK.push([c1, [tilt.p[0], tilt.p[1], tilt.p[2] + 0.3], [tilt.r[0] - 2, tilt.r[1], tilt.r[2]], 'io']);
    rigK.push([c1 + 0.04, tilt.p, tilt.r, 'out']);
    tEnd = c2;
  }
  lk.push([Math.min(0.93, tEnd + 0.13), hand.p, hand.r, 'io']);
  rigK.push([Math.min(0.9, tEnd + 0.1), tilt.p, tilt.r]);
  rigK.push([1, Z, Z, 'io']);
  tracks.lhand = { abs: true, k: lk };
  tracks.rig = rigK;
  Object.assign(tracks, o.tracks || {});
  return {
    dur: o.dur,
    tracks,
    attach: [{ node: 'mag', to: 'lhand', u0: T.grab, u1: T.ins }],
    fn: o.fn,
    end: o.end,
  };
}

// Set the rig (gun pivot) rest pose: where the weapon sits in view space.
export function hold(mb, p, r = [0, 0, 0], s = 1) {
  const rig = mb.nodes.rig;
  rig.scale.setScalar(s);
  rig.position.set(p[0], p[1], p[2]);
  rig.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ');
  rig.userData.rest = { p: [...p], r: [...r] };
}

// ---------------------------------------------------------------- rifle rig

const v3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Arms + standard animation set for a two-handed magazine weapon.
 * Hand placements are given relative to standard spots and can be shifted:
 *  lh: {at:[x,y,f] (support point under the handguard), ...overrides}
 *  rh: right hand overrides (default: on a pistol grip at the origin)
 *  mag: {at:[x,y,f]} point on the left side of the inserted magazine to grab
 *  charge: {at:[x,y,f], side:'R'|'L'|'top', pull} charging handle position
 */
export function rifleRig(mb, cfg) {
  const lhAt = cfg.lh?.at || [0, 0.35, 10];
  const LH = {
    p: v3add([-1.3, -1.6, -9.0 + (10 - lhAt[2])], [lhAt[0], lhAt[1], 0]),
    fwd: [0.62, 0.15, -0.8], palm: [0.35, 1, 0.1],
    ...(cfg.lh || {}),
  };
  if (cfg.lh?.p) LH.p = cfg.lh.p;
  const RH = { p: [0.85, -1.5, 2.55], fwd: [0.05, -0.28, -1], palm: [-1, 0, -0.2], ...(cfg.rh || {}) };
  if (!cfg.noLeft) arm(mb, 'lhand', cfg.lhParent || 'gun', 'L', { ...LH, fore: cfg.lh?.fore || [-0.5, -0.55, 1], grip: cfg.lh?.grip || 'cup', len: 18 });
  if (!cfg.noRight) arm(mb, 'rhand', cfg.rhParent || 'gun', 'R', { ...RH, fore: cfg.rh?.fore || [0.35, -0.55, 1], grip: cfg.rh?.grip || 'trigger', len: 18 });
  const LHP = handPose(LH.p, LH.fwd, LH.palm);

  const anims = {
    idle: idle(cfg.idle),
    draw: draw({ dur: cfg.draw ?? 1.0, ...(cfg.drawOpts || {}) }),
    ...shootSet({ bolt: cfg.bolt ?? 0, dur: cfg.shootDur ?? 0.4, kick: cfg.kick ?? 1, ...(cfg.shootOpts || {}) }),
    shoot_empty: shootEmpty(),
  };
  if (cfg.reload !== false) {
    const m = cfg.mag?.at || [-0.6, -2.5, 5];
    const magFwd = cfg.mag?.fwd || [0.14, -0.35, -0.93];
    const magPalm = cfg.mag?.palm || [1, 0, 0];
    let charge = null;
    if (cfg.charge) {
      const c = cfg.charge.at;
      const side = cfg.charge.side || 'R';
      let pose;
      if (side === 'R') pose = handPose([c[0] + 0.6, c[1] - 4.3, -c[2] + 0.4], [-0.1, 1, -0.15], [-1, 0, 0]);
      else if (side === 'L') pose = handPose([c[0] - 1.9, c[1] - 1.6, -c[2] + 3.3], [0.25, 0.35, -0.9], [1, 0.2, 0]);
      else pose = handPose([c[0] - 1.6, c[1] + 2.2, -c[2] + 3.0], [0.3, -0.45, -0.85], [0.3, -1, 0]);
      if (cfg.charge.pose) pose = cfg.charge.pose;
      const pull = cfg.charge.pull ?? 3;
      charge = { pose, pull: [0, 0, pull], boltPull: cfg.charge.boltPull || [0, 0, pull], node: cfg.charge.node || 'bolt', t0: cfg.charge.t0, dur: cfg.charge.dur };
    }
    anims.reload = magReload({
      dur: cfg.reload ?? 2.5,
      hand: LHP,
      magGrip: cfg.mag?.pose || handPose([m[0] - 0.85, m[1] + 0.1, -m[2] + 1.5], magFwd, magPalm),
      away: handPose([-8, -24, 2], [0.3, -0.2, -0.93], [1, 0.4, 0]),
      drop: cfg.mag?.drop || [0.4, -3.8, -1.2],
      tilt: cfg.tilt || { p: [-4.5, 4.2, 2.5], r: [14, 14, -34] },
      charge,
      times: cfg.reloadTimes,
      tracks: cfg.reloadTracks,
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
 *  slide: travel of the slide (units), magDrop: whether the mag falls free
 */
export function pistolRig(mb, cfg) {
  const RH = { p: [0.95, -1.9, 2.6], fwd: [0.05, -0.3, -1], palm: [-1, 0, -0.15], ...(cfg.rh || {}) };
  arm(mb, 'rhand', cfg.rhParent || 'gun', 'R', { ...RH, fore: cfg.rh?.fore || [0.25, -0.6, 1], grip: cfg.rh?.grip || 'trigger', len: 18 });
  // left arm parked out of view; comes in for reloads
  const away = handPose([-9, -22, 6], [0.4, 0.5, -0.75], [0.6, 0.7, 0]);
  if (!cfg.noLeft) arm(mb, 'lhand', 'gun', 'L', { p: away.p, fwd: [0.4, 0.5, -0.75], palm: [0.6, 0.7, 0], fore: [-0.4, -0.6, 0.7], grip: 'pinch', len: 18 });
  const travel = cfg.slide ?? 1.5;
  const sn = cfg.slideNode || 'slide';
  const kick = cfg.kick ?? 1;
  const shootTracks = (v) => ({
    rig: [
      [0, Z, Z],
      [0.09, [0.05 * v, 0.35 * kick, 1.4 * kick], [6.5 * kick, -0.8 * v, 2.0 * v], 'out'],
      [0.45, [0, 0, 0.1], [0.4, 0, 0], 'io'],
      [1, Z, Z, 'io'],
    ],
    [sn]: [[0, Z, Z], [0.05, [0, 0, travel], Z, 'out'], [0.16, Z, Z, 'in2']],
  });
  const lockSlide = { [sn]: [[0, Z, Z], [0.05, [0, 0, travel], Z, 'out'], [1, [0, 0, travel], Z]] };
  const sdur = cfg.shootDur ?? 0.45;
  const anims = {
    idle: idle({ amp: 0.8 }),
    draw: draw({ dur: cfg.draw ?? 1.0, from: { p: [1, -10, 2], r: [-50, 4, -25] }, ...(cfg.drawOpts || {}) }),
    shoot1: { dur: sdur, tracks: shootTracks(0) },
    shoot2: { dur: sdur, tracks: shootTracks(1) },
    shoot3: { dur: sdur, tracks: shootTracks(-1) },
    shoot_empty: { dur: sdur, tracks: { ...shootTracks(0), ...lockSlide }, end: (vm) => { vm.state.slideLocked = true; } },
  };
  // reload: tilt, mag drops, left hand inserts a fresh one, slide release
  const magGrip = handPose(cfg.magGripP || [-0.9, -7.2, 2.4], [0.35, 0.15, -0.92], [0.15, 1, 0.25]);
  const tilt = cfg.tilt || { p: [-3.0, 4.6, 1.5], r: [24, 8, -22] };
  const T = { tilt: 0.14, drop: 0.2, gone: 0.32, come: 0.42, under: 0.58, ins: 0.66, leave: 0.8, rel: 0.84 };
  const lk = [
    [0, away.p, away.r],
    [T.come, away.p, away.r],
    [T.under, [magGrip.p[0], magGrip.p[1] - 3.2, magGrip.p[2]], magGrip.r, 'out2'],
    [T.ins, magGrip.p, magGrip.r, 'in2'],
    [T.ins + 0.04, magGrip.p, magGrip.r],
    [T.leave + 0.08, away.p, away.r, 'in2'],
  ];
  anims.reload = {
    dur: cfg.reload ?? 2.2,
    tracks: {
      rig: [[0, Z, Z], [T.tilt, tilt.p, tilt.r, 'io'], [T.ins, tilt.p, tilt.r], [T.ins + 0.03, [tilt.p[0], tilt.p[1] + 0.4, tilt.p[2]], [tilt.r[0] + 3, tilt.r[1], tilt.r[2]], 'out'],
        [T.ins + 0.08, tilt.p, tilt.r, 'io'], [T.rel, tilt.p, tilt.r], [T.rel + 0.03, [tilt.p[0], tilt.p[1], tilt.p[2] + 0.4], [tilt.r[0] + 2, tilt.r[1], tilt.r[2]], 'out'], [1, Z, Z, 'io']],
      mag: [[0, Z, Z], [T.drop, Z, Z], [T.drop + 0.04, [0, -1.2, 0], Z, 'in2'], [T.gone, [0, -18, 1], [10, 0, 0], 'in2'],
        [T.come, [0, -18, 1], Z], [T.under, [0, -3.2, 0], Z, 'out2'], [T.ins, Z, Z, 'in2']],
      lhand: { abs: true, k: lk },
    },
    vis: { mag: [[T.gone - 0.01, T.come + 0.01, false]] },
    fn(u, t, vm) {
      if (vm.state.slideLocked && u < T.rel) vm.nodes[sn].position.z += travel;
    },
    end(vm) { vm.state.slideLocked = false; },
  };
  const post = (vm) => {
    const c = vm.currentAnimation;
    if (vm.state.slideLocked && c !== 'reload' && c !== 'shoot_empty' && !c.startsWith('shoot')) vm.nodes[sn].position.z += travel;
  };
  return { anims, post, RH, away };
}

// Bolt-action cycle (AWP / Scout): the right hand leaves the grip, lifts the
// bolt handle, pulls it back, pushes it home and returns. Times a..b (0..1).
//  knob: knob position (gun frame) at rest; pivot: bolt axis [y, f]; lift deg; travel units
export function boltCycle(a, b, cfg) {
  const { knob, pivot, lift = 60, travel = 3.4, rh } = cfg;
  const at = (t) => a + (b - a) * t;
  const ang = (lift * Math.PI) / 180;
  const dy = knob[1] - pivot[0], dx = knob[0];
  const rad = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx);
  const knobAt = (rot, back) => [Math.cos(a0 + rot) * rad, pivot[0] + Math.sin(a0 + rot) * rad, -knob[2] + back];
  const hp = (k) => {
    const h = handPose([k[0] + 2.0, k[1] + 1.1, k[2] + 2.4], [-0.55, -0.25, -0.8], [-0.3, -0.92, 0.2]);
    return [h.p, h.r];
  };
  const R = (u, k, e) => { const [p, r] = hp(k); return [u, p, r, e]; };
  const k0 = knobAt(0, 0), k1 = knobAt(ang, 0), k2 = knobAt(ang, travel);
  const rest = handPose(rh.p, rh.fwd, rh.palm);
  // tilt the rifle so the bolt comes into view while it is worked
  const tp = cfg.tilt?.p || [-2.6, 1.6, 0.6], tr = cfg.tilt?.r || [5, 9, 20];
  const rigTilt = [[at(0.08), Z, Z, 'io'], [at(0.2), tp, tr, 'io'], [at(0.7), tp, tr], [at(0.92), Z, Z, 'io']];
  return {
    rigTilt,
    rhand: { abs: true, k: [
      [0, rest.p, rest.r], [at(0), rest.p, rest.r],
      R(at(0.16), k0, 'io'), R(at(0.26), k1, 'out2'), R(at(0.42), k2, 'io'),
      R(at(0.58), k1, 'io'), R(at(0.66), k0, 'in2'), [at(0.86), rest.p, rest.r, 'io'], [1, rest.p, rest.r],
    ] },
    bolt: [
      [0, Z, Z], [at(0.16), Z, Z], [at(0.26), Z, [0, 0, lift], 'out2'], [at(0.42), [0, 0, travel], [0, 0, lift], 'io'],
      [at(0.58), Z, [0, 0, lift], 'io'], [at(0.66), Z, Z, 'in2'], [1, Z, Z],
    ],
  };
}
