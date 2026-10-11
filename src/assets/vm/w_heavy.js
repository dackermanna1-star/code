// Shotguns (m3, xm1014) and the M249.
import { C, hold, rifleRig } from './kit.js';
import { pistolGrip, triggerGuard, muzzle, ring } from './parts.js';
import { handPose } from './hands.js';
import { Z } from './anim.js';

const SG_HOLD = { p: [7.2, -7.6, -15.0], r: [-1, -0.5, -10], s: 1.1 };

// Shotgun shell held between the left thumb and fingers during loading.
function shellInHand(mb) {
  const n = mb.node('shell_in', 'lhand', [-0.6, -1.4, -4.6], [0, 70, 0]);
  n.visible = false;
  n.userData.defVisible = false;
  const s = mb.pen('shell_in');
  s.tube('polymer', [0.75, 0.12, 0.1], 0, 2.0, 0, 0.36, 0.36, { n: 8 });
  s.tube('metal', C.brass, -0.55, 0, 0, 0.38, 0.38, { n: 8 });
}

/**
 * Tube-fed shotgun reload set.
 *  port: abs left-hand pose pushing a shell into the loading port
 *  pump: true for the M3 (reload_end and shoot rack the pump)
 */
function shotgunAnims(r, cfg) {
  const tilt = cfg.tilt || { p: [-3.0, 3.0, 1.0], r: [12, 8, -30] };
  const LH = r.LHP;
  const port = cfg.port;
  const away = { p: [port.p[0] - 1.5, port.p[1] - 9, port.p[2] + 2], r: port.r };
  const portIn = { p: [port.p[0], port.p[1] - 1.2, port.p[2] + 0.4], r: port.r };
  const pumpT = cfg.pumpTravel ?? 3.2;
  const anims = r.anims;
  const rigTilt = (k) => k.map(([u, p, rr, e]) => [u, p, rr, e]);
  anims.reload_start = {
    dur: cfg.startDur ?? 0.55, hold: true,
    tracks: {
      rig: [[0, Z, Z], [1, tilt.p, tilt.r, 'io']],
      lhand: { abs: true, k: [[0, LH.p, LH.r], [1, portIn.p, portIn.r, 'io']] },
    },
  };
  anims.reload_insert = {
    dur: cfg.insertDur ?? 0.45, hold: true,
    tracks: {
      rig: rigTilt([[0, tilt.p, tilt.r], [0.62, tilt.p, tilt.r], [0.72, [tilt.p[0], tilt.p[1] + 0.3, tilt.p[2]], [tilt.r[0] + 2.5, tilt.r[1], tilt.r[2]], 'out'], [1, tilt.p, tilt.r, 'io']]),
      lhand: { abs: true, k: [[0, portIn.p, portIn.r], [0.22, away.p, away.r, 'in2'], [0.3, away.p, away.r], [0.52, portIn.p, portIn.r, 'out2'], [0.66, port.p, port.r, 'in2'], [1, portIn.p, portIn.r, 'io']] },
    },
    vis: { shell_in: [[0.3, 0.64, true]] },
  };
  const endTracks = {
    rig: [[0, tilt.p, tilt.r], [0.45, Z, Z, 'io'], [1, Z, Z]],
    lhand: { abs: true, k: [[0, portIn.p, portIn.r], [0.4, LH.p, LH.r, 'io'], [1, LH.p, LH.r]] },
  };
  if (cfg.pump) {
    endTracks.pump = [[0, Z, Z], [0.5, Z, Z], [0.66, [0, 0, pumpT], Z, 'io'], [0.82, Z, Z, 'io']];
    endTracks.lhand.k = [[0, portIn.p, portIn.r], [0.4, LH.p, LH.r, 'io'], [0.5, LH.p, LH.r], [0.66, [LH.p[0], LH.p[1], LH.p[2] + pumpT], LH.r, 'io'], [0.82, LH.p, LH.r, 'io'], [1, LH.p, LH.r]];
  }
  anims.reload_end = { dur: cfg.endDur ?? 0.7, tracks: endTracks };
  anims.reload = anims.reload_start;
  if (cfg.pump) {
    // pump-action: every shot racks the slide
    for (const k of ['shoot1', 'shoot2', 'shoot3']) {
      const t = anims[k].tracks;
      t.pump = [[0, Z, Z], [0.36, Z, Z], [0.5, [0, 0, pumpT], Z, 'io'], [0.64, Z, Z, 'io']];
      t.lhand = { abs: true, k: [[0, LH.p, LH.r], [0.36, LH.p, LH.r], [0.5, [LH.p[0], LH.p[1], LH.p[2] + pumpT], LH.r, 'io'], [0.64, LH.p, LH.r, 'io']] };
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
    kick: 2.0,
    shootDur: 0.875,
    shootOpts: { peak: 0.04, rec: 0.3 },
    draw: 1.0,
  });
  shellInHand(mb);
  const port = handPose([-0.9, -2.4, -0.4], [0.25, 0.75, -0.6], [0.5, 0.5, 0.7]);
  shotgunAnims(r, { port, pump: true, insertDur: 0.45, startDur: 0.55, endDur: 0.95 });
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
    kick: 1.8,
    shootDur: 0.25,
    shootOpts: { peak: 0.12, rec: 0.6 },
  });
  shellInHand(mb);
  const port = handPose([-0.9, -2.4, -0.4], [0.25, 0.75, -0.6], [0.5, 0.5, 0.7]);
  shotgunAnims(r, { port, pump: false, insertDur: 0.3, startDur: 0.55, endDur: 0.6 });
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
  const r = rifleRig(mb, {
    lh: { at: [0, -0.2, 7.2] },
    mag: { at: [-1.7, -2.6, 4.2], drop: [0.2, -4.5, -0.6] },
    bolt: 0,
    reload: 4.7,
    draw: 1.0,
    kick: 1.1,
    shootDur: 0.3,
    tilt: { p: [-3.5, 3.6, 1.5], r: [10, 12, -22] },
    reloadTimes: { reach: 0.28, grab: 0.32, out: 0.4, gone: 0.46, back: 0.56, under: 0.63, ins: 0.68 },
  });
  // open the feed cover before swapping the box, close it after
  const L = r.LHP;
  const coverHand = handPose([-1.3, 4.6, 4.2], [0.35, -0.55, -0.75], [0.3, -1, 0.1]);
  const lk = r.anims.reload.tracks.lhand.k;
  lk.splice(1, 0, [0.1, coverHand.p, coverHand.r, 'io'], [0.14, coverHand.p, coverHand.r], [0.2, [coverHand.p[0], coverHand.p[1] + 2.4, coverHand.p[2] - 2], coverHand.r, 'out2']);
  // after the box is in: close the cover
  const iIns = lk.findIndex((k) => k[0] >= 0.68);
  lk.splice(iIns + 1, 0, [0.76, [coverHand.p[0], coverHand.p[1] + 2.4, coverHand.p[2] - 2], coverHand.r, 'io'], [0.82, coverHand.p, coverHand.r, 'in2']);
  // drop later keys that overlap
  r.anims.reload.tracks.lhand.k = lk.filter((k, i, a) => i === 0 || k[0] > a[i - 1][0]).sort((a, b) => a[0] - b[0]);
  r.anims.reload.tracks.lhand.k = r.anims.reload.tracks.lhand.k.filter((k) => !(k[0] > 0.82 && k[0] < 0.9));
  r.anims.reload.tracks.lhand.k.push([0.95, L.p, L.r, 'io']);
  r.anims.reload.tracks.cover = [[0, Z, Z], [0.14, Z, Z], [0.2, Z, [-70, 0, 0], 'out2'], [0.76, Z, [-70, 0, 0]], [0.82, Z, Z, 'in2']];
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

export const HEAVY = { m3, xm1014, m249 };
