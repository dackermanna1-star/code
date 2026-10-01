// Shared character kit: move normalization, universal moves, reaction poses,
// state animations and command tables.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN;
  JJK.Chars = JJK.Chars || {};
  const Kit = (JJK.Kit = {});

  const TIER_STR = { 1: 'l', 2: 'm', 3: 'h', 4: 's', 5: 's', 6: 'x', 7: 'x', 8: 'x' };
  const TIER_STUN = { 1: [13, 10], 2: [17, 13], 3: [21, 16], 4: [22, 16], 5: [24, 18], 6: [30, 20], 7: [34, 22], 8: [40, 24] };

  // Normalize a move definition.
  Kit.move = function (id, o) {
    const m = Object.assign({ id, tier: 1, s: 5, a: 3, r: 10 }, o);
    if (m.total == null) m.total = m.s + m.a - 1 + m.r;
    if (m.hits) {
      m.hits = m.hits.map((h) => {
        const hh = Object.assign({}, h);
        if (!hh.f) hh.f = [m.s, m.s + m.a - 1];
        if (hh.tier == null) hh.tier = m.tier;
        if (!hh.str) hh.str = TIER_STR[hh.tier] || 'm';
        const st = TIER_STUN[hh.tier] || [16, 12];
        if (hh.hs == null) hh.hs = st[0];
        if (hh.bs == null) hh.bs = st[1];
        if (!hh.guard) hh.guard = 'mid';
        return hh;
      });
    }
    if (typeof m.anim === 'function') m.anim = m.anim(m);
    if (Array.isArray(m.anim)) m.anim = { keys: m.anim };
    if (!m.anim) m.anim = { keys: [[0, 'idle']] };
    return m;
  };

  Kit.build = function (defs) {
    const out = {};
    for (const id in defs) out[id] = Kit.move(id, defs[id]);
    return out;
  };

  // ------------------------------------------------------------ shared poses
  Kit.basePoses = {
    hitHigh: { hip: [-5, 64], lean: -14, bend: -10, head: -22, nh: [0, -30], fh: [8, -28], nf: [-18, 0], ff: [14, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    hitHigh2: { hip: [-3, 65], lean: -4, bend: -4, head: -8, nh: [6, -26], fh: [12, -22], nf: [-17, 0], ff: [15, 0], face: 'hurt' },
    hitMid: { hip: [-7, 60], lean: 26, bend: 18, head: 20, nh: [6, -26], fh: [12, -30], nf: [-20, 0], ff: [11, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    hitMid2: { hip: [-4, 63], lean: 14, bend: 8, head: 8, nh: [10, -22], fh: [14, -24], nf: [-18, 0], ff: [13, 0], face: 'hurt' },
    hitLow: { hip: [-3, 56], lean: 16, bend: 6, head: 4, nh: [10, -30], fh: [16, -28], nf: [-14, 0], ff: [18, 6], fk: 1, face: 'hurt', nhs: 'open', fhs: 'open' },
    juggleUp: { hip: [0, 66], lean: -26, bend: -16, head: -26, nh: [-12, 8], fh: [8, 12], nf: [-22, 18], ff: [12, 26], rot: -22, face: 'hurt', nhs: 'open', fhs: 'open' },
    juggleDown: { hip: [0, 62], lean: -46, bend: -10, head: -20, nh: [-18, -6], fh: [4, 6], nf: [-6, 26], ff: [22, 30], rot: -58, face: 'hurt', nhs: 'open', fhs: 'open' },
    down: { hip: [-6, 9], lean: -82, bend: -4, head: -16, nh: [-4, -10], fh: [6, -8], nf: [34, 0], ff: [44, 3], nk: 1, fk: 1, face: 'hurt', nhs: 'open', fhs: 'open' },
    downHard: { hip: [-6, 9], lean: -86, bend: -2, head: -24, nh: [-14, 4], fh: [10, -10], nf: [38, 0], ff: [30, 6], face: 'hurt', nhs: 'open', fhs: 'open' },
    wake1: { hip: [-4, 26], lean: 30, bend: 10, head: 10, nh: [10, -20], fh: [26, -38], nf: [-6, 0], ff: [20, 0], nk: 1, fk: 1, face: 'calm' },
    wake2: { hip: [-2, 50], lean: 22, bend: 8, head: 4, nh: [14, -22], fh: [20, -16], nf: [-14, 0], ff: [16, 0], face: 'calm' },
    roll1: { hip: [0, 30], lean: 60, bend: 30, head: 40, nh: [20, -20], fh: [24, -16], nf: [10, 8], ff: [18, 14], rot: -90, face: 'calm' },
    roll2: { hip: [0, 30], lean: 60, bend: 30, head: 40, nh: [20, -20], fh: [24, -16], nf: [10, 8], ff: [18, 14], rot: -270, face: 'calm' },
    stagger: { hip: [-8, 62], lean: -18, bend: -6, head: -10, nh: [-8, -34], fh: [16, -36], nf: [-20, 0], ff: [10, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    stagger2: { hip: [-4, 60], lean: 10, bend: 6, head: 12, nh: [4, -36], fh: [14, -38], nf: [-18, 0], ff: [12, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    guardbreak: { hip: [-8, 62], lean: -22, bend: -10, head: -18, nh: [-26, 4], fh: [28, 6], nf: [-20, 0], ff: [12, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    grabbed: { hip: [-2, 62], lean: 8, bend: 6, head: -6, nh: [10, -6], fh: [14, -2], nf: [-12, 0], ff: [10, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    thrown: { hip: [0, 60], lean: -40, bend: -20, head: -30, nh: [-16, 12], fh: [10, 16], nf: [-10, 24], ff: [14, 30], rot: -40, face: 'hurt', nhs: 'open', fhs: 'open' },
    techPush: { hip: [-6, 62], lean: -8, bend: -4, head: -4, nh: [20, -10], fh: [24, -6], nf: [-20, 0], ff: [12, 0], face: 'shout', nhs: 'open', fhs: 'open' },
    dizzy: { hip: [0, 60], lean: 12, bend: 14, head: 30, nh: [2, -40], fh: [8, -40], nf: [-12, 0], ff: [10, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    dizzy2: { hip: [2, 61], lean: 6, bend: 12, head: 22, nh: [6, -40], fh: [4, -41], nf: [-12, 0], ff: [10, 0], face: 'hurt', nhs: 'open', fhs: 'open' },
    ko: { hip: [-6, 9], lean: -84, bend: -2, head: -30, nh: [-18, 12], fh: [12, -14], nf: [36, 0], ff: [44, 6], face: 'hurt', nhs: 'open', fhs: 'open' },
  };

  // ------------------------------------------------------------ anims
  const A = (keys, loop, len) => ({ keys, loop: !!loop, len });
  Kit.A = A;
  Kit.baseAnims = function (extra) {
    const a = {
      idle: A([[0, 'idle'], [34, 'idle2'], [68, 'idle']], true, 68),
      idleTired: A([[0, 'idle'], [20, 'tired'], [40, 'idle']], true, 40),
      walkF: A([[0, 'walk0'], [8, 'walk1'], [16, 'walk2'], [24, 'walk3'], [32, 'walk0']], true, 32),
      walkB: A([[0, 'walkB0'], [9, 'walkB1'], [18, 'walkB2'], [27, 'walkB3'], [36, 'walkB0']], true, 36),
      run: A([[0, 'run0'], [5, 'run1'], [10, 'run2'], [15, 'run3'], [20, 'run0']], true, 20),
      crouch: A([[0, 'crouchIn'], [4, 'crouch', 'out'], [40, 'crouch2'], [80, 'crouch']], false),
      cblock: A([[0, 'cblock']]),
      block: A([[0, 'blockIn'], [3, 'block', 'out']]),
      ablock: A([[0, 'ablock']]),
      prejump: A([[0, 'idle'], [3, 'prejump', 'out']]),
      jumpUp: A([[0, 'jumpUp0'], [8, 'jumpUp', 'out']]),
      jumpTop: A([[0, 'jumpUp'], [10, 'jumpTop', 'inOut']]),
      jumpDown: A([[0, 'jumpTop'], [10, 'jumpDown', 'inOut']]),
      land: A([[0, 'land'], [5, 'idle', 'out']]),
      hitHigh: A([[0, 'hitHigh', 'snap'], [8, 'hitHigh2', 'out'], [22, 'idle', 'inOut']]),
      hitMid: A([[0, 'hitMid', 'snap'], [9, 'hitMid2', 'out'], [24, 'idle', 'inOut']]),
      hitLow: A([[0, 'hitLow', 'snap'], [10, 'hitMid2', 'out'], [24, 'idle', 'inOut']]),
      juggleUp: A([[0, 'juggleUp', 'snap'], [14, 'juggleDown', 'inOut']]),
      juggleDown: A([[0, 'juggleDown']]),
      down: A([[0, 'juggleDown'], [5, 'down', 'out'], [40, 'down']]),
      wakeup: A([[0, 'down'], [6, 'wake1', 'out'], [11, 'wake2', 'out'], [15, 'idle', 'inOut']]),
      roll: A([[0, 'down'], [4, 'roll1', 'out'], [12, 'roll2', 'linear'], [18, 'wake2', 'out'], [21, 'idle']]),
      stagger: A([[0, 'stagger', 'snap'], [12, 'stagger2', 'inOut'], [26, 'idle', 'inOut']]),
      guardbreak: A([[0, 'guardbreak', 'snap'], [20, 'stagger2', 'inOut'], [36, 'stagger', 'inOut'], [48, 'idle', 'inOut']]),
      grabbed: A([[0, 'grabbed']]),
      thrown: A([[0, 'thrown']]),
      techPush: A([[0, 'techPush', 'snap'], [14, 'idle', 'inOut']]),
      parry: A([[0, 'parryPose', 'snap'], [14, 'idle', 'inOut']]),
      dizzy: A([[0, 'dizzy'], [40, 'dizzy2'], [80, 'dizzy']], true, 80),
      intro: A([[0, 'intro0'], [60, 'intro1', 'inOut'], [100, 'intro2', 'inOut'], [140, 'idle', 'inOut']]),
      win: A([[0, 'idle'], [10, 'win0', 'out'], [40, 'win1', 'inOut'], [90, 'win2', 'inOut']]),
      lose: A([[0, 'hitMid2'], [30, 'lose', 'inOut']]),
      ko: A([[0, 'ko']]),
      cinematic: A([[0, 'idle']]),
    };
    return Object.assign(a, extra || {});
  };

  // ------------------------------------------------------------ universal moves
  // Run-type dash (Sukuna) or blink teleport (Gojo) are provided per character;
  // here: parry, throws, air dashes.
  Kit.commonMoves = function (o) {
    return {
      parry: {
        name: 'Cursed Parry', tier: 3, s: 1, a: 8, r: 18, parry: [1, 8], noCH: false, smear: false,
        anim: [[0, 'idle'], [2, 'parryReady', 'snap'], [10, 'parryReady'], [26, 'idle', 'inOut']],
        sfxStart: 'whiff_l',
      },
      throw: {
        name: 'Throw', tier: 1, s: 5, a: 2, r: 20, isThrow: true, noCH: false, smear: false,
        hits: [{ box: [8, 30, 52, 120], throw: true, dmg: 0 }],
        anim: [[0, 'idle'], [3, 'throwReach', 'out'], [6, 'throwReach'], [26, 'idle', 'inOut']],
        sfxStart: 'whiff_m',
      },
    };
  };

  // Standard command table: chords and normals. Specials are prepended by each character.
  Kit.normalsCommands = function () {
    return [
      { id: 'throw', b: B.L | B.M, chord: true },
      { id: 'parry', b: B.M | B.H, chord: true },
      { id: '6H', b: B.H, dir: [6] },
      { id: '2L', b: B.L, crouch: true },
      { id: '2M', b: B.M, crouch: true },
      { id: '2H', b: B.H, crouch: true },
      { id: '5L', b: B.L, crouch: false },
      { id: '5M', b: B.M, crouch: false },
      { id: '5H', b: B.H, crouch: false },
      { id: 'jL', b: B.L, air: true },
      { id: 'jM', b: B.M, air: true },
      { id: 'jH', b: B.H, air: true },
      { id: 'j2H', b: B.H, air: true, dir: [1, 2, 3] },
    ];
  };

  // Gauge helpers for HUD & AI
  Kit.level = (meter) => Math.floor(meter / 100);
})();
