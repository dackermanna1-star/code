// Gojo pose library (facing space, pose units). See rig.js for field meanings.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const Poses = (JJK.Poses = JJK.Poses || {});
  const base = JJK.Kit.basePoses;
  const P = Object.assign({}, base);
  Poses.gojo = P;
  const X = (a, b) => Object.assign({}, P[a], b);

  // --- stance & movement ---------------------------------------------------
  P.idle = { hip: [0, 71], lean: 7, bend: 3, head: -2, nh: [15, -9], fh: [25, -12], nf: [-25, 0], ff: [18, 0], face: 'smirk' };
  P.idle2 = { hip: [0, 70], lean: 8.5, bend: 4.5, head: -1, nh: [15.5, -10.5], fh: [25, -13.8], nf: [-25, 0], ff: [18, 0], face: 'smirk' };
  P.tired = { hip: [0, 67], lean: 17, bend: 10, head: 8, nh: [12, -20], fh: [20, -19], nf: [-20, 0], ff: [18, 0], face: 'hurt' };
  P.walk0 = X('idle', { nf: [-19, 0], ff: [19, 0] });
  P.walk1 = X('idle', { hip: [2, 72], nf: [-22, 0], ff: [26, 6], lean: 9 });
  P.walk2 = X('idle2', { hip: [3, 72], nf: [-9, 5], ff: [20, 0] });
  P.walk3 = X('idle', { hip: [1, 71], nf: [-16, 0], ff: [17, 0] });
  P.walkB0 = X('idle', {});
  P.walkB1 = X('idle', { hip: [-3, 72], nf: [-27, 6], ff: [15, 0], lean: 4 });
  P.walkB2 = X('idle2', { hip: [-3, 72], nf: [-21, 0], ff: [8, 5], lean: 4 });
  P.walkB3 = X('idle', { nf: [-18, 0], ff: [17, 0] });
  P.crouchIn = { hip: [0, 56], lean: 12, bend: 5, head: -2, nh: [15, -8], fh: [24, -9], nf: [-20, 0], ff: [19, 0], face: 'smirk' };
  P.crouch = { hip: [-1, 43], lean: 20, bend: 6, head: -10, nh: [14, -6], fh: [22, -5], nf: [-22, 0], ff: [18, 0], face: 'smirk' };
  P.crouch2 = X('crouch', { hip: [-1, 42], lean: 21, nh: [14, -7], fh: [22, -6] });
  P.cblock = { hip: [-2, 42], lean: 12, bend: 2, head: 4, nh: [12, 6], fh: [14, 10], nf: [-22, 0], ff: [17, 0], face: 'calm' };
  P.blockIn = { hip: [-2, 70], lean: 2, bend: 0, head: 6, nh: [14, 2], fh: [16, 6], nf: [-20, 0], ff: [17, 0], face: 'calm' };
  P.block = { hip: [-3, 69], lean: -1, bend: -1, head: 10, nh: [12, 7], fh: [15, 11], nf: [-21, 0], ff: [16, 0], face: 'calm' };
  P.ablock = { hip: [0, 72], lean: 4, bend: 0, head: 10, nh: [12, 7], fh: [15, 11], nf: [-12, 14], ff: [10, 18], face: 'calm' };
  P.prejump = { hip: [0, 54], lean: 14, bend: 6, head: -4, nh: [12, -12], fh: [20, -10], nf: [-18, 0], ff: [17, 0], face: 'smirk' };
  P.jumpUp0 = { hip: [0, 78], lean: 2, bend: 0, head: -6, nh: [10, -22], fh: [18, -20], nf: [-8, 2], ff: [6, 0], face: 'smirk' };
  P.jumpUp = { hip: [0, 78], lean: 10, bend: 4, head: -4, nh: [14, -10], fh: [22, -6], nf: [-14, 22], ff: [14, 30], face: 'smirk' };
  P.jumpTop = { hip: [0, 78], lean: 8, bend: 4, head: 0, nh: [15, -10], fh: [23, -8], nf: [-16, 20], ff: [16, 24], face: 'smirk' };
  P.jumpDown = { hip: [0, 78], lean: 6, bend: 2, head: 2, nh: [15, -14], fh: [24, -12], nf: [-16, 6], ff: [16, 9], face: 'smirk' };
  P.land = { hip: [0, 56], lean: 16, bend: 6, head: 2, nh: [14, -12], fh: [22, -10], nf: [-21, 0], ff: [20, 0], face: 'smirk' };
  P.parryReady = { hip: [-2, 69], lean: 0, bend: 0, head: 2, nh: [20, 4], fh: [26, -2], nf: [-20, 0], ff: [18, 0], nhs: 'open', fhs: 'open', face: 'calm' };
  P.parryPose = { hip: [4, 70], lean: 12, bend: 4, head: -4, nh: [30, -2], fh: [14, -10], nf: [-18, 0], ff: [22, 0], nhs: 'open', face: 'grin' };
  P.throwReach = { hip: [6, 69], lean: 16, bend: 4, head: -2, nh: [38, -6], fh: [34, -2], nf: [-16, 0], ff: [24, 0], nhs: 'grip', fhs: 'grip', face: 'smirk' };
  // blink (teleport) poses
  P.blink0 = { hip: [2, 66], lean: 16, bend: 6, head: -6, nh: [8, -18], fh: [14, -20], nf: [-16, 0], ff: [20, 0], face: 'smirk' };
  P.blink1 = { hip: [0, 70], lean: 4, bend: 2, head: -2, nh: [12, -14], fh: [22, -10], nf: [-18, 0], ff: [18, 0], face: 'smirk' };
  P.airBlink = { hip: [0, 78], lean: 16, bend: 6, head: -6, nh: [6, -24], fh: [10, -24], nf: [-20, 14], ff: [10, 18], face: 'smirk' };

  // --- normals ---------------------------------------------------------------
  P.jab0 = X('idle', { fh: [18, -8], lean: 5, nh: [14, -8] });
  P.jab1 = { hip: [5, 70], lean: 14, bend: 4, head: -4, nh: [13, -9], fh: [45, 3], nf: [-17, 0], ff: [24, 0], face: 'smirk' };
  P.jab2 = { hip: [4, 70], lean: 12, bend: 4, head: -3, nh: [14, -9], fh: [36, -2], nf: [-17, 0], ff: [23, 0], face: 'smirk' };
  P.palm0 = { hip: [-3, 70], lean: 0, bend: -2, head: -2, nh: [-2, -18], fh: [22, -6], nf: [-20, 0], ff: [17, 0], nhs: 'open', face: 'smirk' };
  P.palm1 = { hip: [10, 68], lean: 20, bend: 6, head: -6, nh: [47, 4], fh: [6, -16], nf: [-14, 0], ff: [29, 0], nhs: 'open', nha: -70, face: 'grin' };
  P.palm2 = { hip: [9, 68], lean: 16, bend: 4, head: -4, nh: [38, 0], fh: [10, -14], nf: [-14, 0], ff: [28, 0], nhs: 'open', nha: -60, face: 'smirk' };
  P.kick0 = { hip: [-4, 73], lean: -6, bend: -4, head: -4, nh: [6, -26], fh: [22, -14], nf: [6, 30], ff: [6, 0], nk: 1, face: 'smirk' };
  P.kick1 = { hip: [-6, 75], lean: -26, bend: -8, head: -10, nh: [-14, -22], fh: [16, -12], nf: [62, 70], ff: [-4, 0], nfa: 70, face: 'grin' };
  P.kick2 = { hip: [-5, 74], lean: -18, bend: -6, head: -6, nh: [-8, -24], fh: [18, -12], nf: [46, 56], ff: [-3, 0], nfa: 50, face: 'smirk' };
  P.lowKick0 = X('crouch', { ff: [10, 6], fk: 1 });
  P.lowKick1 = { hip: [-4, 42], lean: 14, bend: 4, head: -8, nh: [12, -6], fh: [20, -8], nf: [-22, 0], ff: [44, 3], ffa: 0, face: 'smirk' };
  P.poke0 = { hip: [-4, 40], lean: 22, bend: 6, head: -10, nh: [10, -12], fh: [16, -14], nf: [-20, 0], ff: [10, 8], face: 'smirk' };
  P.poke1 = { hip: [-8, 34], lean: 34, bend: 6, head: -14, nh: [18, -26], fh: [6, -24], nf: [-26, 0], ff: [58, 4], ffa: 0, face: 'grin' };
  P.upper0 = { hip: [0, 46], lean: 24, bend: 10, head: -4, nh: [2, -24], fh: [18, -12], nf: [-20, 0], ff: [18, 0], face: 'smirk' };
  P.upper1 = { hip: [8, 82], lean: -8, bend: -6, head: -16, nh: [20, 42], fh: [8, -18], nf: [-8, 6], ff: [16, 0], nfa: -50, face: 'shout' };
  P.upper2 = { hip: [6, 78], lean: -2, bend: -2, head: -8, nh: [16, 30], fh: [10, -16], nf: [-12, 0], ff: [16, 0], face: 'grin' };
  P.ajab0 = X('jumpTop', { fh: [16, -14] });
  P.ajab1 = { hip: [0, 78], lean: 18, bend: 6, head: 4, nh: [12, -10], fh: [38, -22], nf: [-14, 18], ff: [12, 22], face: 'smirk' };
  P.aknee0 = { hip: [0, 78], lean: 0, bend: 0, head: -4, nh: [10, -16], fh: [16, -18], nf: [-14, 18], ff: [-2, 22], face: 'smirk' };
  P.aknee1 = { hip: [2, 78], lean: -10, bend: -4, head: -6, nh: [6, -20], fh: [20, -8], nf: [-14, 14], ff: [8, 40], fk: 1, ffa: -80, face: 'grin' };
  P.axe0 = { hip: [0, 80], lean: -16, bend: -6, head: -8, nh: [-6, -20], fh: [14, -14], nf: [26, 84], ff: [-10, 18], nfa: 60, face: 'smirk' };
  P.axe1 = { hip: [2, 78], lean: 18, bend: 8, head: 8, nh: [-4, -24], fh: [20, -16], nf: [42, 26], ff: [-12, 20], nfa: -20, face: 'shout' };
  P.tpunch0 = { hip: [-2, 68], lean: 10, bend: 4, head: -6, nh: [4, -16], fh: [18, -10], nf: [-18, 0], ff: [18, 0], nhs: 'fist', face: 'smirk' };
  P.tpunch1 = { hip: [8, 69], lean: 22, bend: 6, head: -6, nh: [48, 6], fh: [6, -16], nf: [-18, 0], ff: [28, 0], face: 'grin' };

  // --- techniques ------------------------------------------------------------
  // "point": index + middle fingers (technique hand)
  P.castBlue0 = { hip: [-2, 70], lean: 2, bend: 0, head: -4, fh: [10, -6], nh: [6, -20], nf: [-20, 0], ff: [18, 0], fhs: 'point', fha: 60, face: 'smirk' };
  P.castBlue1 = { hip: [6, 70], lean: 12, bend: 4, head: -6, fh: [44, 10], nh: [6, -18], nf: [-18, 0], ff: [24, 0], fhs: 'point', face: 'grin' };
  P.castRed0 = { hip: [-4, 70], lean: -4, bend: -2, head: -4, fh: [-4, 14], nh: [14, -14], nf: [-21, 0], ff: [16, 0], fhs: 'point', fha: 30, face: 'calm' };
  P.castRed1 = { hip: [8, 69], lean: 16, bend: 6, head: -8, fh: [46, 2], nh: [0, -18], nf: [-18, 0], ff: [26, 0], fhs: 'point', face: 'shout' };
  P.burst0 = { hip: [0, 44], lean: 26, bend: 10, head: -8, fh: [10, -16], nh: [14, -18], nf: [-20, 0], ff: [18, 0], fhs: 'open', face: 'calm' };
  P.burst1 = { hip: [6, 78], lean: -10, bend: -6, head: -14, fh: [26, 38], nh: [16, -16], nf: [-10, 4], ff: [16, 0], fhs: 'open', fha: -80, face: 'shout' };
  P.pull0 = { hip: [-2, 70], lean: 4, bend: 2, head: -4, fh: [42, 6], nh: [12, -14], nf: [-20, 0], ff: [18, 0], fhs: 'open', fha: -90, face: 'smirk' };
  P.pull1 = { hip: [-6, 69], lean: -8, bend: -4, head: -6, fh: [10, 6], nh: [14, -12], nf: [-22, 0], ff: [14, 0], fhs: 'grip', face: 'grin' };
  P.counter0 = { hip: [-4, 70], lean: -2, bend: -2, head: 0, fh: [24, 14], nh: [8, -16], nf: [-20, 0], ff: [16, 0], fhs: 'open', fha: -90, face: 'calm' };
  P.rush = { hip: [0, 72], lean: 30, bend: 10, head: -14, nh: [-4, -28], fh: [8, -26], nf: [-26, 10], ff: [10, 4], face: 'grin' };
  P.purpleCharge = { hip: [0, 70], lean: 2, bend: 0, head: -6, nh: [-6, 2], fh: [30, -2], nf: [-22, 0], ff: [20, 0], nhs: 'open', fhs: 'open', nha: -80, fha: 80, face: 'calm' };
  P.purpleCharge2 = { hip: [0, 69], lean: 4, bend: 2, head: -2, nh: [-12, 6], fh: [34, 2], nf: [-23, 0], ff: [21, 0], nhs: 'open', fhs: 'open', nha: -80, fha: 80, face: 'calm' };
  P.purpleMerge = { hip: [4, 70], lean: 8, bend: 2, head: -6, fh: [26, 4], nh: [30, 2], nf: [-20, 0], ff: [22, 0], fhs: 'point', nhs: 'open', face: 'smirk' };
  P.purpleFire = { hip: [10, 69], lean: 18, bend: 6, head: -8, fh: [48, 6], nh: [-4, -18], nf: [-18, 0], ff: [30, 0], fhs: 'point', face: 'grin' };
  P.domainSign = { hip: [0, 72], lean: 2, bend: 0, head: -2, fh: [8, 18], nh: [6, -26], nf: [-14, 0], ff: [14, 0], fhs: 'sign', fha: 70, face: 'calm' };
  P.domainSign2 = { hip: [0, 72], lean: 0, bend: -1, head: -4, fh: [10, 22], nh: [4, -28], nf: [-14, 0], ff: [14, 0], fhs: 'sign', fha: 70, face: 'smirk', eyes: 'open' };
  P.infinity = { hip: [0, 72], lean: 4, bend: 0, head: -2, fh: [20, 6], nh: [24, -12], nf: [-18, 0], ff: [18, 0], fhs: 'point', fha: 70, face: 'smirk' };

  // --- intro / win / lose -----------------------------------------------------
  P.intro0 = { hip: [0, 74], lean: -2, bend: -4, head: -12, fh: [-4, -8], nh: [4, -30], nf: [-12, 0], ff: [12, 0], fhs: 'point', fha: 60, face: 'grin' };
  P.intro1 = { hip: [0, 74], lean: -4, bend: -4, head: -6, fh: [14, 22], nh: [2, -32], nf: [-12, 0], ff: [12, 0], fhs: 'point', fha: 90, face: 'smirk' };
  P.intro2 = { hip: [0, 73], lean: 2, bend: 0, head: -2, nh: [10, -4], fh: [6, -34], nf: [-14, 0], ff: [14, 0], face: 'smirk' };
  P.win0 = { hip: [0, 74], lean: -4, bend: -6, head: -16, fh: [12, 26], nh: [-2, -34], nf: [-10, 0], ff: [10, 0], fhs: 'point', fha: 90, face: 'grin', eyes: 'open' };
  P.win1 = { hip: [0, 74], lean: -6, bend: -6, head: -18, fh: [14, 28], nh: [-2, -34], nf: [-10, 0], ff: [10, 0], fhs: 'point', fha: 90, face: 'grin', eyes: 'open' };
  P.win2 = { hip: [0, 74], lean: -2, bend: -4, head: -10, fh: [10, 24], nh: [0, -34], nf: [-10, 0], ff: [10, 0], fhs: 'point', fha: 100, face: 'smirk', eyes: 'open' };
  P.lose = { hip: [-4, 48], lean: 30, bend: 14, head: 26, nh: [8, -38], fh: [14, -36], nf: [-18, 0], ff: [16, 0], face: 'hurt', nhs: 'open', fhs: 'open' };
})();
