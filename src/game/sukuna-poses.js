// Sukuna pose library (facing space, pose units). Hunched, predatory, claws.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const Poses = (JJK.Poses = JJK.Poses || {});
  const P = Object.assign({}, JJK.Kit.basePoses);
  Poses.sukuna = P;
  const X = (a, b) => Object.assign({}, P[a], b);

  // --- stance & movement ---------------------------------------------------
  P.idle = { hip: [0, 66], lean: 13, bend: 6, head: 4, nh: [12, -16], fh: [26, -4], nf: [-24, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.idle2 = { hip: [0, 65], lean: 15, bend: 7, head: 6, nh: [12, -18], fh: [26, -6], nf: [-24, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.tired = { hip: [0, 61], lean: 22, bend: 12, head: 12, nh: [10, -24], fh: [22, -16], nf: [-24, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.walk0 = X('idle', {});
  P.walk1 = X('idle', { hip: [3, 67], nf: [-26, 0], ff: [28, 6], lean: 15 });
  P.walk2 = X('idle2', { hip: [4, 67], nf: [-12, 6], ff: [22, 0] });
  P.walk3 = X('idle', { hip: [1, 66], nf: [-20, 0], ff: [19, 0] });
  P.walkB0 = X('idle', {});
  P.walkB1 = X('idle', { hip: [-3, 67], nf: [-30, 6], ff: [17, 0], lean: 10 });
  P.walkB2 = X('idle2', { hip: [-3, 67], nf: [-24, 0], ff: [10, 6], lean: 10 });
  P.walkB3 = X('idle', { nf: [-22, 0], ff: [19, 0] });
  P.run0 = { hip: [4, 60], lean: 40, bend: 10, head: -16, nh: [-18, -26], fh: [-10, -30], nf: [-26, 6], ff: [22, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.run1 = { hip: [4, 62], lean: 42, bend: 10, head: -16, nh: [-14, -28], fh: [-16, -26], nf: [-6, 14], ff: [8, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.run2 = { hip: [4, 60], lean: 40, bend: 10, head: -16, nh: [-10, -30], fh: [-18, -26], nf: [22, 0], ff: [-26, 6], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.run3 = { hip: [4, 62], lean: 42, bend: 10, head: -16, nh: [-16, -26], fh: [-14, -28], nf: [8, 0], ff: [-6, 14], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.crouchIn = { hip: [0, 52], lean: 18, bend: 8, head: 4, nh: [12, -14], fh: [24, -6], nf: [-24, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.crouch = { hip: [-2, 40], lean: 26, bend: 8, head: -6, nh: [12, -10], fh: [24, -8], nf: [-26, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.crouch2 = X('crouch', { hip: [-2, 39], lean: 27 });
  P.cblock = { hip: [-3, 39], lean: 16, bend: 4, head: 6, nh: [12, 4], fh: [14, 8], nf: [-26, 0], ff: [18, 0], face: 'calm' };
  P.blockIn = { hip: [-2, 65], lean: 4, bend: 2, head: 6, nh: [14, 0], fh: [16, 4], nf: [-24, 0], ff: [18, 0], face: 'calm' };
  P.block = { hip: [-3, 64], lean: 2, bend: 0, head: 10, nh: [12, 6], fh: [15, 10], nf: [-25, 0], ff: [17, 0], face: 'calm' };
  P.ablock = { hip: [0, 66], lean: 4, bend: 0, head: 10, nh: [12, 6], fh: [15, 10], nf: [-12, 14], ff: [10, 18], face: 'calm' };
  P.prejump = { sx: 1.05, sy: 0.95, hip: [0, 50], lean: 18, bend: 8, head: 0, nh: [10, -16], fh: [20, -12], nf: [-22, 0], ff: [19, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.jumpUp0 = { sx: 0.94, sy: 1.07, hip: [0, 70], lean: 4, bend: 0, head: -6, nh: [6, -26], fh: [14, -24], nf: [-8, 2], ff: [6, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.jumpUp = { hip: [0, 70], lean: 14, bend: 6, head: 0, nh: [12, -14], fh: [24, -6], nf: [-14, 24], ff: [14, 30], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.jumpTop = { hip: [0, 70], lean: 10, bend: 6, head: 2, nh: [14, -12], fh: [24, -6], nf: [-16, 22], ff: [16, 24], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.jumpDown = { hip: [0, 70], lean: 8, bend: 4, head: 4, nh: [14, -16], fh: [24, -10], nf: [-16, 6], ff: [16, 9], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.land = { sx: 1.07, sy: 0.93, hip: [0, 50], lean: 20, bend: 8, head: 4, nh: [12, -16], fh: [24, -10], nf: [-24, 0], ff: [22, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.parryReady = { hip: [-2, 64], lean: 2, bend: 0, head: 2, nh: [20, 4], fh: [26, -2], nf: [-22, 0], ff: [18, 0], nhs: 'open', fhs: 'open', face: 'calm' };
  P.parryPose = { hip: [4, 64], lean: 14, bend: 4, head: -4, nh: [30, -4], fh: [14, -10], nf: [-20, 0], ff: [22, 0], nhs: 'claw', face: 'grin' };
  P.throwReach = { hip: [6, 63], lean: 18, bend: 4, head: -2, nh: [38, -4], fh: [34, 0], nf: [-18, 0], ff: [24, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.dash0 = { hip: [6, 58], lean: 44, bend: 12, head: -18, nh: [-20, -24], fh: [-12, -28], nf: [-30, 4], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.backdash = { hip: [-6, 64], lean: -6, bend: -4, head: 0, nh: [14, -10], fh: [22, -4], nf: [-16, 8], ff: [10, 4], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.airdash = { hip: [0, 70], lean: 40, bend: 10, head: -16, nh: [-16, -26], fh: [-10, -28], nf: [-26, 18], ff: [-6, 24], nhs: 'claw', fhs: 'claw', face: 'grin' };

  // --- normals ---------------------------------------------------------------
  P.bfist0 = X('idle', { fh: [16, -12], lean: 10 });
  P.bfist1 = { hip: [6, 65], lean: 18, bend: 6, head: -2, nh: [10, -16], fh: [46, 4], nf: [-20, 0], ff: [26, 0], nhs: 'claw', fhs: 'fist', face: 'grin' };
  P.claw0 = { hip: [-4, 65], lean: 4, bend: -2, head: 0, nh: [-6, 14], fh: [20, -10], nf: [-24, 0], ff: [18, 0], nhs: 'claw', fhs: 'claw', nha: 40, face: 'grin' };
  P.claw1 = { hip: [10, 62], lean: 26, bend: 8, head: -6, nh: [44, -18], fh: [8, -18], nf: [-18, 0], ff: [30, 0], nhs: 'claw', fhs: 'claw', nha: -30, face: 'shout' };
  P.claw2 = { hip: [9, 62], lean: 22, bend: 6, head: -4, nh: [30, -30], fh: [10, -16], nf: [-18, 0], ff: [29, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.heavy0 = { hip: [-6, 64], lean: -6, bend: -6, head: 0, nh: [-20, -6], fh: [22, -2], nf: [-26, 0], ff: [16, 0], nhs: 'fist', fhs: 'claw', face: 'shout' };
  P.heavy1 = { hip: [12, 61], lean: 28, bend: 8, head: -8, nh: [50, 2], fh: [-4, -22], nf: [-18, 0], ff: [34, 0], nhs: 'fist', fhs: 'claw', face: 'shout' };
  P.heavy2 = { hip: [10, 62], lean: 24, bend: 6, head: -4, nh: [40, -4], fh: [0, -22], nf: [-18, 0], ff: [32, 0], nhs: 'fist', fhs: 'claw', face: 'grin' };
  P.lowKick0 = X('crouch', { ff: [10, 6] });
  P.lowKick1 = { hip: [-4, 38], lean: 20, bend: 6, head: -6, nh: [10, -10], fh: [20, -12], nf: [-26, 0], ff: [46, 3], ffa: 0, nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.slide0 = { hip: [-4, 36], lean: 26, bend: 6, head: -8, nh: [6, -18], fh: [14, -16], nf: [-24, 0], ff: [12, 8], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.slide1 = { hip: [-10, 26], lean: 40, bend: 8, head: -16, nh: [-8, -30], fh: [6, -28], nf: [-30, 0], ff: [56, 3], ffa: 0, nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.rclaw0 = { hip: [0, 40], lean: 30, bend: 12, head: -4, nh: [-4, -28], fh: [20, -14], nf: [-24, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.rclaw1 = { hip: [8, 76], lean: -6, bend: -6, head: -16, nh: [18, 44], fh: [6, -20], nf: [-10, 6], ff: [18, 0], nfa: -50, nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.rclaw2 = { hip: [6, 72], lean: 0, bend: -2, head: -8, nh: [16, 30], fh: [8, -18], nf: [-14, 0], ff: [18, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.achop0 = X('jumpTop', { fh: [10, 10], fha: 40 });
  P.achop1 = { hip: [0, 70], lean: 22, bend: 8, head: 6, nh: [12, -14], fh: [36, -26], nf: [-14, 18], ff: [12, 22], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.aknee0 = { hip: [0, 70], lean: 2, bend: 0, head: -2, nh: [8, -18], fh: [16, -18], nf: [-14, 18], ff: [-2, 22], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.aknee1 = { hip: [2, 70], lean: -10, bend: -4, head: -6, nh: [4, -22], fh: [20, -10], nf: [-14, 14], ff: [8, 40], ffa: -80, nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.hammer0 = { hip: [0, 72], lean: -18, bend: -10, head: -10, nh: [-10, 30], fh: [-4, 32], nf: [-14, 20], ff: [12, 24], nhs: 'fist', fhs: 'fist', face: 'shout' };
  P.hammer1 = { hip: [0, 70], lean: 30, bend: 14, head: 10, nh: [30, -34], fh: [34, -32], nf: [-14, 22], ff: [12, 26], nhs: 'fist', fhs: 'fist', face: 'shout' };
  P.heel0 = { hip: [0, 74], lean: -14, bend: -6, head: -6, nh: [-6, -22], fh: [16, -14], nf: [-10, 14], ff: [24, 86], ffa: 70, nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.heel1 = { hip: [6, 66], lean: 22, bend: 10, head: 8, nh: [-6, -26], fh: [14, -20], nf: [-20, 0], ff: [44, 14], ffa: -10, nhs: 'claw', fhs: 'claw', face: 'shout' };

  // --- techniques ------------------------------------------------------------
  P.slash0 = { hip: [-4, 65], lean: 6, bend: 0, head: 0, nh: [8, -16], fh: [-6, 18], nf: [-24, 0], ff: [18, 0], nhs: 'claw', fhs: 'claw', fha: 60, face: 'grin' };
  P.slash1 = { hip: [8, 63], lean: 22, bend: 8, head: -6, nh: [6, -18], fh: [46, -10], nf: [-20, 0], ff: [28, 0], nhs: 'claw', fhs: 'chop', fha: -10, face: 'shout' };
  P.slash2 = { hip: [6, 63], lean: 18, bend: 6, head: -4, nh: [8, -18], fh: [34, -26], nf: [-20, 0], ff: [26, 0], nhs: 'claw', fhs: 'chop', face: 'grin' };
  P.slashB0 = { hip: [-2, 64], lean: 8, bend: 2, head: 0, nh: [-8, 16], fh: [24, -8], nf: [-22, 0], ff: [20, 0], nhs: 'chop', fhs: 'claw', nha: 60, face: 'grin' };
  P.slashB1 = { hip: [8, 63], lean: 22, bend: 8, head: -6, nh: [44, -14], fh: [6, -18], nf: [-20, 0], ff: [28, 0], nhs: 'chop', fhs: 'claw', face: 'shout' };
  P.cleave0 = { hip: [-6, 62], lean: 0, bend: -4, head: 0, nh: [-14, 10], fh: [-10, 16], nf: [-26, 0], ff: [16, 0], nhs: 'chop', fhs: 'chop', nha: 60, fha: 60, face: 'shout' };
  P.cleave1 = { hip: [10, 60], lean: 28, bend: 10, head: -6, nh: [40, -24], fh: [42, -8], nf: [-18, 0], ff: [32, 0], nhs: 'chop', fhs: 'chop', face: 'shout' };
  P.cleave2 = { hip: [12, 59], lean: 30, bend: 10, head: -2, nh: [30, 22], fh: [46, -30], nf: [-18, 0], ff: [33, 0], nhs: 'chop', fhs: 'chop', nha: -40, fha: 50, face: 'grin' };
  P.cross0 = { hip: [-2, 64], lean: 4, bend: 0, head: -2, nh: [-6, 22], fh: [4, 26], nf: [-22, 0], ff: [18, 0], nhs: 'chop', fhs: 'chop', face: 'grin' };
  P.cross1 = { hip: [8, 62], lean: 20, bend: 6, head: -6, nh: [40, -24], fh: [42, -26], nf: [-20, 0], ff: [26, 0], nhs: 'chop', fhs: 'chop', face: 'shout' };
  P.lunge0 = { hip: [-4, 58], lean: 20, bend: 6, head: -4, nh: [-10, -20], fh: [10, -18], nf: [-24, 0], ff: [16, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.lunge1 = { hip: [10, 58], lean: 42, bend: 10, head: -16, nh: [48, -10], fh: [-14, -26], nf: [-30, 6], ff: [24, 0], nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.counter0 = { hip: [-4, 62], lean: 4, bend: 0, head: 4, nh: [6, 10], fh: [22, -2], nf: [-24, 0], ff: [16, 0], nhs: 'chop', fhs: 'claw', face: 'calm' };
  P.grab0 = { hip: [8, 62], lean: 22, bend: 6, head: -4, nh: [44, 6], fh: [10, -16], nf: [-18, 0], ff: [28, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.grab1 = { hip: [6, 64], lean: 10, bend: 2, head: -4, nh: [38, 26], fh: [8, -14], nf: [-20, 0], ff: [24, 0], nhs: 'grip', fhs: 'chop', face: 'grin' };
  P.grab2 = { hip: [8, 60], lean: 26, bend: 10, head: 0, nh: [38, 20], fh: [40, -18], nf: [-20, 0], ff: [26, 0], nhs: 'grip', fhs: 'chop', face: 'shout' };
  // Fuga: drawing a bow of flame — lead arm extended, rear hand pulls the string
  P.fuga0 = { hip: [-2, 64], lean: 2, bend: -2, head: -2, nh: [16, 0], fh: [20, 4], nf: [-24, 0], ff: [20, 0], nhs: 'open', fhs: 'open', face: 'calm' };
  P.fugaDraw = { hip: [-4, 64], lean: -2, bend: -4, head: -2, nh: [-14, 2], fh: [44, 4], nf: [-26, 0], ff: [22, 0], nhs: 'grip', fhs: 'open', fha: 80, face: 'grin' };
  P.fugaDraw2 = { hip: [-5, 63], lean: -4, bend: -5, head: -3, nh: [-18, 3], fh: [45, 5], nf: [-27, 0], ff: [22, 0], nhs: 'grip', fhs: 'open', fha: 80, face: 'grin' };
  P.fugaRelease = { hip: [-6, 64], lean: -8, bend: -6, head: -6, nh: [-26, 10], fh: [44, 4], nf: [-28, 0], ff: [20, 0], nhs: 'open', fhs: 'open', fha: 80, face: 'shout' };
  // World Cutting Slash: stillness, hand sign, point
  P.wcsStance = { hip: [0, 68], lean: 2, bend: 0, head: 0, nh: [8, -30], fh: [6, -32], nf: [-14, 0], ff: [14, 0], nhs: 'open', fhs: 'open', face: 'calm' };
  P.wcsSign = { hip: [0, 68], lean: 2, bend: 0, head: 6, nh: [16, 4], fh: [18, 6], nf: [-14, 0], ff: [14, 0], nhs: 'sign', fhs: 'sign', nha: 80, fha: 80, face: 'calm' };
  P.wcsPoint = { hip: [4, 67], lean: 10, bend: 2, head: -4, nh: [6, -26], fh: [46, 2], nf: [-18, 0], ff: [22, 0], nhs: 'claw', fhs: 'point', face: 'grin' };
  P.wcsPointUp = X('wcsPoint', { fh: [34, 30], head: -14 });
  P.wcsPointDown = X('wcsPoint', { fh: [40, -26], head: 8 });
  P.domainSign = { hip: [0, 66], lean: 4, bend: 2, head: 6, nh: [14, 6], fh: [16, 8], nf: [-18, 0], ff: [16, 0], nhs: 'sign', fhs: 'sign', nha: 80, fha: 80, face: 'calm' };
  P.domainSign2 = { hip: [0, 66], lean: 2, bend: 0, head: 0, nh: [14, 8], fh: [16, 10], nf: [-18, 0], ff: [16, 0], nhs: 'sign', fhs: 'sign', nha: 80, fha: 80, face: 'grin' };
  P.da = { hip: [0, 64], lean: 10, bend: 4, head: 0, nh: [-4, -30], fh: [8, -30], nf: [-22, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };

  // --- intro / win / lose -----------------------------------------------------
  P.intro0 = { hip: [0, 68], lean: -4, bend: -6, head: -14, nh: [-6, -32], fh: [2, -34], nf: [-14, 0], ff: [14, 0], nhs: 'open', fhs: 'open', face: 'grin' };
  P.intro1 = { hip: [0, 68], lean: -6, bend: -6, head: -20, nh: [-16, 10], fh: [20, 14], nf: [-14, 0], ff: [14, 0], nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.intro2 = { hip: [0, 66], lean: 8, bend: 4, head: 2, nh: [12, -16], fh: [24, -6], nf: [-22, 0], ff: [20, 0], nhs: 'claw', fhs: 'claw', face: 'grin' };
  P.win0 = { hip: [0, 68], lean: -6, bend: -8, head: -20, nh: [-12, 18], fh: [18, 20], nf: [-14, 0], ff: [14, 0], nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.win1 = { hip: [0, 68], lean: -8, bend: -8, head: -24, nh: [-14, 22], fh: [20, 24], nf: [-14, 0], ff: [14, 0], nhs: 'claw', fhs: 'claw', face: 'shout' };
  P.win2 = { hip: [0, 68], lean: 0, bend: -2, head: -6, nh: [6, -32], fh: [2, -34], nf: [-14, 0], ff: [14, 0], nhs: 'open', fhs: 'open', face: 'grin' };
  P.lose = { hip: [-4, 42], lean: 34, bend: 14, head: 26, nh: [6, -38], fh: [14, -36], nf: [-20, 0], ff: [18, 0], face: 'hurt', nhs: 'claw', fhs: 'claw' };
})();
