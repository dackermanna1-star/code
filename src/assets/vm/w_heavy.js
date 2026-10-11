// Shotguns (m3, xm1014) and the M249.
import { C, hold, rifleRig } from './kit.js';
import { pistolGrip, triggerGuard, muzzle, ring } from './parts.js';
import { handPose } from './hands.js';
import { Z } from './anim.js';
import { add, chain, rel, tidy } from './pose.js';

const SG_HOLD = { p: [7.2, -7.6, -15.0], r: [-1, -0.5, -10], s: 1.1 };

// Shotgun shell carried in the left hand while loading. Its rest pose is set
// so that, with the hand at `port`, the shell lies just under the loading port
// pointing up the magazine tube.
const SHELL_AT_PORT = { p: [-0.1, -0.65, -1.9], r: [-8, 0, 0] };
function shellInHand(mb, port) {
  const rp = rel(port, SHELL_AT_PORT);
  const n = mb.node('shell_in', 'lhand', rp.p, rp.r);
  n.visible = false;
  n.userData.defVisible = false;
  const s = mb.pen('shell_in');
  s.tube('polymer', [0.75, 0.12, 0.1], 0, 2.0, 0, 0.36, 0.36, { n: 8 });
  s.tube('metal', C.brass, -0.55, 0, 0, 0.38, 0.38, { n: 8 });
  return rp;
}

/**
 * Tube-fed shotgun reload set (reload_start / reload_insert / reload_end).
 *  port : abs left-hand pose holding a shell under the loading port
 *  pump : true for the M3 (reload_end and every shot rack the pump)
 * Sound cues the game schedules: insert at 0.4 of reload_insert, pump at 0.2
 * of reload_end, pump at 0.35 of the M3's shot.
 */
function shotgunAnims(mb, r, cfg) {
  const tilt = cfg.tilt || { p: [-3, 4, 1], r: [22, 18, -58] };
  const LH = r.LHP;
  const port = cfg.port;
  const shellRel = shellInHand(mb, port);
  const R = (dp = [0, 0, 0], dr = [0, 0, 0]) => [add(tilt.p, dp), add(tilt.r, dr)];
  const K = (u, h, e) => [u, h.p, h.r, e];
  const off = (h, dp, dr = [0, 0, 0]) => ({ p: add(h.p, dp), r: add(h.r, dr) });
  // empty hand waiting under the port / thumb pushing the shell home
  const portIn = off(port, [-0.3, -0.9, 0.9], [-6, 0, 4]);
  const pushed = off(port, [0, 0.75, -1.5], [4, 0, 0]);
  const pouch = off(port, [-2.6, -8.5, 3.0], [-25, 10, 20]);
  const pouchUp = off(port, [-1.4, -4.0, 1.6], [-14, 6, 12]);
  // shell slides on into the tube relative to the hand while the thumb pushes
  const shellPushed = chain(port, { p: add(SHELL_AT_PORT.p, [0, 0.35, -2.4]), r: SHELL_AT_PORT.r });
  const shellPushedRel = rel(pushed, shellPushed);
  const pumpT = cfg.pumpTravel ?? 3.2;
  const anims = r.anims;
  anims.reload_start = {
    dur: cfg.startDur ?? 0.55, hold: true, blend: 0.06,
    tracks: {
      rig: [[0, Z, Z], [0.75, ...R([0, 0.2, 0], [1.5, 0, -2]), 'io'], [1, ...R(), 'io']],
      body: [[0, Z, Z], [1, [0, -0.3, 0.2], [1, 1.2, 0.5], 'io']],
      lhand: { abs: true, k: [K(0, LH), K(0.2, off(LH, [-0.3, -0.6, 0.8], [-8, 0, 6]), 'io'), K(0.62, off(portIn, [-0.6, -1.2, 1.0]), 'cr'), K(1, portIn, 'cr')] },
    },
  };
  anims.reload_insert = {
    dur: cfg.insertDur ?? 0.45, hold: true, blend: 0.04,
    tracks: {
      rig: [[0, ...R()], [0.42, ...R([0, -0.1, 0], [-0.6, 0, 0.5]), 'io'], [0.5, ...R([0.05, 0.35, -0.15], [2.6, 0.3, -0.8]), 'out'], [0.8, ...R(), 'settle'], [1, ...R()]],
      body: [[0, [0, -0.3, 0.2], [1, 1.2, 0.5]], [0.5, [0, -0.2, 0.1], [1.6, 1.2, 0.5], 'out'], [1, [0, -0.3, 0.2], [1, 1.2, 0.5], 'io']],
      lhand: { abs: true, k: [K(0, portIn), K(0.1, pouchUp, 'cr'), K(0.22, pouch, 'cr'), K(0.3, pouch), K(0.36, pouchUp, 'cr'), K(0.42, port, 'cr'), K(0.53, pushed, 'in2'), K(0.6, pushed), K(1, portIn, 'io')] },
      shell_in: [[0, shellRel.p, shellRel.r], [0.42, shellRel.p, shellRel.r], [0.53, shellPushedRel.p, shellPushedRel.r, 'in2'], [1, shellPushedRel.p, shellPushedRel.r]],
    },
    vis: { shell_in: [[0.27, 0.535, true]] },
  };
  const endTracks = {
    rig: [[0, ...R()], [0.12, ...R([0.3, -0.2, 0.2], [-1, 2, 6]), 'io'], [0.62, Z, Z, 'io'], [1, Z, Z, 'io']],
    body: [[0, [0, -0.3, 0.2], [1, 1.2, 0.5]], [0.6, Z, Z, 'io']],
    lhand: { abs: true, k: [K(0, portIn), K(0.16, LH, 'io3'), K(1, LH)] },
  };
  if (cfg.pump) {
    endTracks.pump = [[0, Z, Z], [0.17, Z, Z], [0.29, [0, 0, pumpT], Z, 'io'], [0.31, [0, 0, pumpT], Z], [0.42, Z, Z, 'in2']];
    endTracks.lhand.k = [K(0, portIn), K(0.16, LH, 'io3'), K(0.17, LH), K(0.29, off(LH, [0, 0, pumpT]), 'io'), K(0.31, off(LH, [0, 0, pumpT])), K(0.42, LH, 'in2'), K(1, LH)];
    endTracks.rig = [[0, ...R()], [0.16, ...R([0.3, -0.2, 0.2], [-1, 2, 6]), 'io'], [0.29, ...R([0.2, -0.5, 0.6], [-3, 3, 8]), 'io'], [0.43, ...R([0.3, 0.3, -0.4], [2, 3, 10]), 'out'], [0.75, Z, Z, 'io'], [1, Z, Z, 'io']];
  } else if (cfg.boltRack) {
    // semi-auto: run the bolt handle to chamber the first shell
    endTracks.bolt = [[0, Z, Z], [0.16, Z, Z], [0.24, [0, 0, cfg.boltRack], Z, 'out2'], [0.3, Z, Z, 'in2']];
    endTracks.rig = [[0, ...R()], [0.18, ...R([0.3, -0.2, 0.2], [-1, 2, 6]), 'io'], [0.24, ...R([0, -0.2, 0.4], [-2, 0, 6]), 'io'], [0.31, ...R([0, 0.25, -0.3], [2, 0, 6]), 'out'], [0.7, Z, Z, 'io'], [1, Z, Z, 'io']];
  }
  anims.reload_end = { dur: cfg.endDur ?? 0.7, blend: 0.05, tracks: endTracks };
  if (cfg.pump) {
    // pump-action: every shot racks the slide (sound at 0.35)
    for (const k of ['shoot1', 'shoot2', 'shoot3']) {
      const t = anims[k].tracks;
      t.pump = [[0, Z, Z], [0.34, Z, Z], [0.47, [0, 0, pumpT], Z, 'io'], [0.49, [0, 0, pumpT], Z], [0.6, Z, Z, 'in2']];
      t.lhand = { abs: true, k: [K(0, LH), K(0.34, LH), K(0.47, off(LH, [0, 0, pumpT]), 'io'), K(0.49, off(LH, [0, 0, pumpT])), K(0.6, LH, 'in2'), K(1, LH)] };
      // the gun cants and dips while the pump is worked, clacks home
      t.rig = tidy([...t.rig.filter((x) => x[0] < 0.3), [0.34, [0, 0, 0], [0, 0, 0], 'io'], [0.47, [-0.2, -0.45, 0.4], [-2.5, 1, 4], 'io'], [0.6, [0, 0.25, -0.3], [1.8, 0, 1], 'out'], [0.85, Z, Z, 'io'], [1, Z, Z]]);
    }
  }
  return anims;
}

// ---------------------------------------------------------------- M3 Super 90
function m3(mb) {
  hold(mb, SG_HOLD.p, SG_HOLD.r, SG_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = [0.22, 0.22, 0.23];
  g.prism('metal', D, [[-3.8, 0.1], [5.0, 0.1], [5.0, 2.3], [4.6, 2.6], [-3.4, 2.6], [-3.8, 2.2]], 1.3, { bev: 0.3 });
  g.span('metal', C.bore, 0.8, 4.4, 0.05, 0.12, 0.75); // loading port
  g.span('metal', C.bore, 0.6, 2.8, 1.5, 2.2, 0.04, { x: 0.66 }); // ejection port
  // ghost ring rear sight
  g.span('metal', B, -3.0, -2.2, 2.6, 3.1, 0.9);
  ring(g, -2.6, 3.45, 0.32, 0.1, B, 8);
  // barrel, mag tube, clamp, front sight
  g.tube('metal', B, 5.0, 25.4, 1.95, 0.48, 0.44, { n: 8 });
  muzzle(g, 25.4, 0.2, 1.95, 0.46, B);
  g.tube('metal', D, 5.0, 21.4, 0.8, 0.44, 0.44, { n: 8 });
  g.tube('metal', B, 21.4, 22.0, 0.8, 0.5, 0.5, { n: 8 });
  g.span('metal', B, 20.2, 20.8, 0.6, 2.3, 0.75);
  g.span('metal', B, 24.6, 24.9, 2.35, 2.8, 0.2);
  triggerGuard(g, -0.3, 2.4, 0.1, 1.1);
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', B, [[-3.8, 2.3], [-15.2, 1.6], [-15.8, 1.2], [-15.8, -3.6], [-15.0, -4.0], [-8.0, -1.2], [-3.8, 0.3]], 1.4, { bev: 0.3 });
  // pump forend (moves)
  mb.node('pump', 'gun');
  mb.pen('pump').prism('ribbedH', [0.25, 0.25, 0.26], [[8.8, -0.05], [16.2, -0.05], [16.6, 0.4], [16.6, 1.55], [8.8, 1.55], [8.5, 0.7]], 1.75, { bev: 0.3 });
  mb.marker('muzzle', 'gun', [0, 1.95, -25.9]);
  mb.marker('shell', 'gun', [0.7, 1.8, -1.7]);
  const r = rifleRig(mb, {
    lh: { at: [0, -0.05, 12.6] },
    reload: false,
    kick: 1.9,
    shootDur: 0.875,
    shootOpts: { bodyUp: 0.55, recT: 0.09 },
    draw: 1.0,
  });
  const port = handPose([-1.5, -2.3, 1.4], [0.35, 0.35, -0.87], [0.55, 0.85, 0.1]);
  shotgunAnims(mb, r, { port, pump: true, insertDur: 0.45, startDur: 0.55, endDur: 0.95 });
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- XM1014
function xm1014(mb) {
  hold(mb, SG_HOLD.p, SG_HOLD.r, SG_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = [0.24, 0.24, 0.25];
  g.prism('metal', D, [[-3.6, 0.1], [5.2, 0.1], [5.2, 2.2], [4.8, 2.5], [-3.2, 2.5], [-3.6, 2.1]], 1.25, { bev: 0.28 });
  g.span('metal', C.bore, 0.8, 4.4, 0.05, 0.12, 0.75);
  g.span('metal', C.bore, 0.4, 2.8, 1.4, 2.1, 0.04, { x: 0.64 });
  // top rail with ghost ring
  g.span('metal', B, -3.0, 4.6, 2.5, 2.75, 0.7);
  g.span('metal', B, -2.8, -2.0, 2.75, 3.2, 0.9);
  ring(g, -2.4, 3.55, 0.32, 0.1, B, 8);
  g.tube('metal', B, 5.2, 23.4, 1.85, 0.46, 0.42, { n: 8 });
  muzzle(g, 23.4, 0.2, 1.85, 0.44, B);
  g.tube('metal', D, 5.2, 19.4, 0.75, 0.44, 0.44, { n: 8 });
  g.tube('metal', B, 19.4, 20.0, 0.75, 0.5, 0.5, { n: 8 });
  g.span('metal', B, 22.6, 23.0, 2.25, 2.85, 0.4);
  // fixed forend
  g.prism('polymer', B, [[5.4, -0.1], [13.8, -0.1], [14.2, 0.4], [14.2, 1.5], [5.4, 1.5]], 1.75, { bev: 0.3 });
  triggerGuard(g, -0.3, 2.4, 0.1, 1.1);
  pistolGrip(g, 'polymer', B);
  // telescoping stock
  g.tube('metal', D, -3.6, -10.5, 1.2, 0.55, 0.55, { n: 8 });
  g.prism('polymer', B, [[-8.0, 2.0], [-14.2, 1.6], [-14.6, 1.2], [-14.6, -3.2], [-14.0, -3.6], [-9.0, -0.8], [-8.0, 0.4]], 1.3, { bev: 0.25 });
  // bolt handle (right side, cycles on firing)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', B, 2.2, 2.6, 1.55, 1.9, 1.4, { x: 0.95 });
  mb.marker('muzzle', 'gun', [0, 1.85, -23.9]);
  mb.marker('shell', 'gun', [0.7, 1.8, -1.6]);
  const r = rifleRig(mb, {
    lh: { at: [0, -0.1, 10.6] },
    reload: false,
    bolt: 2.4,
    kick: 1.7,
    shootDur: 0.25,
    shootOpts: { bodyUp: 0.5 },
  });
  const port = handPose([-1.5, -2.3, 1.4], [0.35, 0.35, -0.87], [0.55, 0.85, 0.1]);
  shotgunAnims(mb, r, { port, pump: false, boltRack: 2.4, insertDur: 0.3, startDur: 0.55, endDur: 0.6 });
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- M249
function m249(mb) {
  hold(mb, [7.2, -7.8, -15.4], [-1, -0.5, -10], 1.1);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = [0.22, 0.22, 0.23], OD = C.odGreen;
  // receiver
  g.prism('metal', D, [[-5.0, 0.0], [7.0, 0.0], [7.0, 2.2], [-4.6, 2.2], [-5.0, 1.8]], 1.5, { bev: 0.2 });
  g.span('metal', C.bore, -1.4, 1.6, 0.6, 1.4, 0.04, { x: 0.76 });
  // feed tray opening on the left
  g.span('metal', [0.15, 0.15, 0.15], 0.4, 3.2, 1.3, 1.9, 0.04, { x: -0.76 });
  // barrel, heat shield, gas tube, carry handle, front sight
  g.tube('metal', D, 7.0, 21.6, 1.35, 0.52, 0.46, { n: 8 });
  muzzle(g, 21.6, 1.0, 1.35, 0.5, B);
  g.prism('ribbed', [0.3, 0.3, 0.31], [[7.6, 1.6], [15.4, 1.6], [15.4, 2.1], [7.6, 2.1]], 1.1);
  g.tube('metal', B, 7.0, 15.0, 0.45, 0.32, 0.32, { n: 6 });
  g.span('metal', B, 8.4, 9.2, 1.9, 2.9, 0.4);
  g.span('metal', B, 7.4, 10.2, 2.9, 3.25, 0.5);
  g.span('metal', B, 20.6, 21.0, 1.8, 2.9, 0.2);
  // folded bipod
  for (const x of [-0.35, 0.35]) g.tube('metal', B, 13.0, 20.2, -0.1, 0.16, 0.16, { n: 5, x });
  g.span('metal', B, 19.8, 20.6, -0.2, 0.6, 1.0);
  // polymer forearm under the receiver front
  g.prism('polymer', B, [[3.8, -0.2], [9.6, -0.2], [10.0, 0.3], [10.0, 0.9], [3.8, 0.9]], 1.9, { bev: 0.3 });
  triggerGuard(g, -0.3, 2.4, 0.0, 1.1);
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', B, [[-5.0, 1.9], [-15.4, 1.6], [-16.0, 1.2], [-16.0, -3.4], [-15.2, -3.8], [-8.0, -1.0], [-5.0, 0.2]], 1.5, { bev: 0.3 });
  // feed cover (hinged at its front)
  mb.node('cover', 'gun', [0, 2.2, -6.6]);
  mb.pen('cover').prism('metal', D, [[-11.4, 0.0], [0.0, 0.0], [0.0, 0.55], [-0.6, 0.85], [-10.9, 0.85], [-11.4, 0.6]], 1.4, { bev: 0.2 });
  mb.pen('cover').span('metal', B, -10.8, -9.4, 0.85, 1.5, 0.9); // rear sight
  // ammo box + belt
  mb.node('mag', 'gun', [-0.3, -0.2, -3.6]);
  const m = mb.pen('mag');
  m.prism('polymer', OD, [[-2.6, 0.0], [2.6, 0.0], [2.8, -4.6], [-2.8, -4.6]], 2.6, { bev: 0.25, p: [-0.4, 0, 0] });
  m.span('flat', [0.55, 0.5, 0.3], -2.2, 2.2, -3.4, -2.6, 2.66, { x: -0.4 }); // strap
  for (let i = 0; i < 5; i++) {
    const x = -1.4 - i * 0.02, y = 0.3 + i * 0.32;
    m.cyl('metal', C.brass, 0.18, 0.12, 1.6, { n: 6, p: [x - 0.1 * i, y + 0.1, 0.8], r: [0, 0, 0] });
  }
  mb.marker('muzzle', 'gun', [0, 1.35, -22.8]);
  mb.marker('shell', 'gun', [0.8, 1.0, -0.1]);
  // charging handle (right side, worked once the cover is shut)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', B, 4.6, 5.3, 0.9, 1.3, 0.5, { x: 0.95 });
  // cover: lifted at the latch, flips open on its spring; belt laid in; slammed
  // shut; then the charging handle. Times are fractions of the 4.7 s reload
  // (clip out 0.15, clip in 0.45, bolt 0.8).
  const OPEN = -30;
  // the hand lifts the cover a third of the way back from the hinge
  const latch = (deg) => {
    const a = (deg * Math.PI) / 180, y = 0.85, z = 4.8;
    return [0, 2.2 + y * Math.cos(a) - z * Math.sin(a), -6.6 + y * Math.sin(a) + z * Math.cos(a)];
  };
  const coverHand = (deg) => {
    const l = latch(deg);
    return handPose([l[0] - 1.8, l[1] + 1.3, l[2] + 1.2], [0.45, -0.5, -0.74], [0.35, -1, 0.1 - deg / 120]);
  };
  const K = (u, h, e) => [u, h.p, h.r, e];
  const belt = handPose([-2.6, 1.6, -0.6], [0.55, 0.25, -0.8], [0.6, -0.75, 0.1]);
  const beltIn = { p: [belt.p[0] + 0.5, belt.p[1] + 0.5, belt.p[2] - 0.6], r: belt.r };
  const r = rifleRig(mb, {
    lh: { at: [0, -0.2, 7.2] },
    mag: {
      at: [-1.7, -2.6, 4.2],
      out: { p: [-0.6, -2.2, 0.2], r: [0, 0, -12] },
      toss: { p: [-2.0, -5.0, 1.4], r: [10, 0, -30] },
      ins: { p: [-0.7, -3.2, 0.2], r: [0, 0, -10] },
    },
    charge: { at: [0.95, 1.1, 4.95], side: 'over', pull: 2.6 },
    bolt: 0,
    reload: 4.7,
    draw: 1.0,
    kick: 1.1,
    shootDur: 0.3,
    tilt: { p: [-3.5, 3.6, 1.5], r: [12, 14, -20] },
    reloadTimes: { tilt: 0.06, reach: 0.125, out: 0.15, fetch: 0.3, align: 0.4, seat: 0.45, charge: 0.82, back: 0.95 },
    reloadBefore: [K(0.025, { p: [-2.6, 2.4, -0.5], r: coverHand(0).r }, 'cr'), K(0.05, coverHand(0), 'cr'), K(0.06, coverHand(0)), K(0.08, coverHand(OPEN * 0.55), 'out2'), K(0.1, { p: [-3.2, 1.0, 1.5], r: coverHand(0).r }, 'cr')],
    reloadAfterSeat: [K(0.5, belt, 'cr'), K(0.53, beltIn, 'io'), K(0.56, belt, 'io'), K(0.62, coverHand(OPEN), 'cr'), K(0.64, coverHand(OPEN)), K(0.68, coverHand(0), 'in2'), K(0.7, coverHand(0))],
    reloadRig: [[0.68, [-3.5, 3.6, 1.5], [12, 14, -20], 'io'], [0.695, [-3.5, 3.1, 1.6], [9.5, 14, -19], 'out'], [0.74, [-3.5, 3.6, 1.5], [12, 14, -20], 'settle']],
    reloadTracks: {
      cover: [[0, Z, Z], [0.06, Z, Z], [0.08, Z, [OPEN * 0.55, 0, 0], 'out2'], [0.1, Z, [OPEN * 1.08, 0, 0], 'out'], [0.12, Z, [OPEN, 0, 0], 'io'],
        [0.64, Z, [OPEN, 0, 0]], [0.68, Z, Z, 'in2'], [0.69, Z, [-1.5, 0, 0], 'out'], [0.7, Z, Z, 'io']],
    },
  });
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

export const HEAVY = { m3, xm1014, m249 };
