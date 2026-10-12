// Zombie survival difficulty: one table every tuning knob of the mode reads.
// A preset = { id, label, blurb, sandbox, breakLen, firstBreak, econ, horde, specials, squad }.
// The groups are kept as separate tables below, one per owner, so each can be tuned on its
// own: econ (money and buying), horde (waveStats), specials (how often and how many),
// squad (downed / revive). NORMAL's horde and specials are the mode's tuned curve, sized
// to the squad (waveStats); the other presets scale from it. Sandbox plays
// Normal's horde, specials and squad rules (only its economy differs).
// The New Game options (zombieOptions) pick a preset and adjust it (resolveDiff): the result
// is g.zombies.diff, read-only for everyone (copy before changing anything).

export const ZDIFF_ORDER = ['casual', 'normal', 'hard', 'nightmare', 'sandbox'];
export const DEFAULT_ZDIFF = 'normal';

/** Name, card text, break between waves (s; the New Game "break length" overrides it), the first break. */
const META = {
  casual: { label: 'Casual', blurb: 'A smaller, slower, weaker horde, longer breaks and more cash. For learning the ropes.', breakLen: 20, firstBreak: 15 },
  normal: { label: 'Normal', blurb: 'The intended run: start with a pistol, earn every gun, keep each other alive.', breakLen: 15, firstBreak: 12 },
  hard: { label: 'Hard', blurb: 'More of them, tougher and quicker, and it keeps climbing after wave 10.', breakLen: 15, firstBreak: 12 },
  nightmare: { label: 'Nightmare', blurb: 'A relentless horde, little money and short breaks. Expect to lose.', breakLen: 12, firstBreak: 12 },
  sandbox: { label: 'Sandbox', blurb: 'The power fantasy: $16000, buy anything, anywhere, any time. The Normal horde.', breakLen: 15, firstBreak: 12, sandbox: true },
};

/**
 * Money and buying (zeconomy.js). startMoney / moneyCap ($); buyAnywhere (no buy zones);
 * buyAnytime (guns and upgrades mid-wave too, else only ammo, medkits and armour, at
 * +combatPremium); killPay: a common kill pays base + perWave x wave up to max, +headBonus
 * (fraction) on a headshot; specialPay ($ for a special, on top of the kill); bossPay ($ for
 * a boss: bossSplit = shared out by the squad's damage share, else to everyone standing);
 * waveBonus [base, perWave] for a cleared wave; waveHeal (HP back for a cleared wave: small,
 * so the damage you take carries over).
 * sandbox = how the mode played before the economy: $16000 cap, $300 a kill, buy anything.
 */
const ECON = {
  casual: { startMoney: 3000, moneyCap: 100000, buyAnywhere: true, buyAnytime: false, combatPremium: 0.25, killPay: { base: 70, perWave: 6, max: 130, headBonus: 0.5 }, specialPay: 350, bossPay: 3500, bossSplit: true, waveBonus: [600, 250], waveHeal: 30 },
  normal: { startMoney: 2000, moneyCap: 100000, buyAnywhere: true, buyAnytime: false, combatPremium: 0.5, killPay: { base: 50, perWave: 5, max: 100, headBonus: 0.5 }, specialPay: 300, bossPay: 3000, bossSplit: true, waveBonus: [500, 250], waveHeal: 15 },
  hard: { startMoney: 1500, moneyCap: 100000, buyAnywhere: true, buyAnytime: false, combatPremium: 0.5, killPay: { base: 50, perWave: 4, max: 90, headBonus: 0.5 }, specialPay: 300, bossPay: 3000, bossSplit: true, waveBonus: [400, 200], waveHeal: 10 },
  nightmare: { startMoney: 1000, moneyCap: 100000, buyAnywhere: true, buyAnytime: false, combatPremium: 0.75, killPay: { base: 40, perWave: 4, max: 80, headBonus: 0.5 }, specialPay: 250, bossPay: 2500, bossSplit: true, waveBonus: [300, 150], waveHeal: 5 },
  sandbox: { startMoney: 16000, moneyCap: 16000, buyAnywhere: true, buyAnytime: true, combatPremium: 0, killPay: { base: 300, perWave: 0, max: 300, headBonus: 0 }, specialPay: 300, bossPay: 5000, bossSplit: false, waveBonus: [500, 250], waveHeal: 25 },
};

/**
 * The horde (waveStats): multipliers on the tuned base curve (WAVE below) and caps.
 * count / health / damage / speed / maxAlive / interval: x the base; damageCap (a claw),
 * speedCap (units/s, the commons), runnerCap (share of runners) with runnersFrom (first
 * wave with runners) and runners (x their growth), maxAliveCap (up at once). Past lateFrom
 * the caps (damage, runners, maxAlive, specials) keep rising by lateGrowth (fraction) a
 * wave, and the commons' top speed by speedLate (units/s a wave, never past SPEED_MAX).
 * Squad scaling: crowd = humans + botCrowd x bots (1 with squad scaling off); every crowd
 * past the first brings crowdCount (fraction) more zombies a wave and crowdAlive more up at
 * once (the cap too, never past MAX_ALIVE), and they come faster: the spawn interval / (more
 * zombies)^crowdPace. count / maxAlive / caps
 * here are a solo player's: fewer commons than a squad faces, and more specials (SPECIALS).
 */
const HORDE = {
  casual: { count: 0.6, health: 0.75, damage: 0.7, damageCap: 16, speed: 0.96, speedCap: 212, speedLate: 0, runners: 0.75, runnerCap: 0.12, runnersFrom: 5, maxAlive: 0.9, maxAliveCap: 8, interval: 1.1, lateFrom: 10, lateGrowth: 0.004, botCrowd: 0.4, crowdCount: 0.05, crowdAlive: 0.08, crowdPace: 0.3 },
  normal: { count: 0.7, health: 1, damage: 1, damageCap: 22, speed: 1, speedCap: 222, speedLate: 0, runners: 1, runnerCap: 0.2, runnersFrom: 4, maxAlive: 1, maxAliveCap: 9, interval: 1, lateFrom: 10, lateGrowth: 0.008, botCrowd: 0.5, crowdCount: 0.08, crowdAlive: 0.15, crowdPace: 0.3 },
  hard: { count: 0.8, health: 1.2, damage: 1.25, damageCap: 26, speed: 1.03, speedCap: 228, speedLate: 0.4, runners: 1.25, runnerCap: 0.26, runnersFrom: 3, maxAlive: 1.1, maxAliveCap: 10, interval: 0.9, lateFrom: 10, lateGrowth: 0.015, botCrowd: 0.5, crowdCount: 0.09, crowdAlive: 0.2, crowdPace: 0.3 },
  nightmare: { count: 0.9, health: 1.45, damage: 1.5, damageCap: 30, speed: 1.06, speedCap: 236, speedLate: 0.6, runners: 1.5, runnerCap: 0.32, runnersFrom: 2, maxAlive: 1.2, maxAliveCap: 12, interval: 0.8, lateFrom: 10, lateGrowth: 0.022, botCrowd: 0.6, crowdCount: 0.1, crowdAlive: 0.25, crowdPace: 0.3 },
};

/**
 * Special infected (Specials.pick): the chance a spawn is a special is
 * min(cap, base + perWave x wave) x rate (the cap rises past lateFrom like the horde's),
 * x (1 + solo) for a solo player (fading out by a crowd of 2: fewer commons, a few more
 * specials); perKind: how many of one kind may be up at once (a sprinter pack counts as
 * one), +1 for every perKindCrowd of crowd past the first.
 */
const SPECIALS = {
  casual: { base: 0.02, perWave: 0.005, cap: 0.08, rate: 0.8, solo: 0.2, perKind: 1, perKindCrowd: 5 },
  normal: { base: 0.02, perWave: 0.007, cap: 0.1, rate: 1, solo: 0.3, perKind: 1, perKindCrowd: 5 },
  hard: { base: 0.025, perWave: 0.008, cap: 0.13, rate: 1, solo: 0.3, perKind: 1, perKindCrowd: 3.5 },
  nightmare: { base: 0.03, perWave: 0.009, cap: 0.16, rate: 1, solo: 0.35, perKind: 2, perKindCrowd: 3 },
};

/**
 * Downed and revive: bleedOut (s on the floor before you die), shorter by bleedOutStep for
 * every further down in the same wave (not below bleedOutMin); reviveTime (s of holding
 * use); reviveHealth (HP you get back up with).
 */
const SQUAD = {
  casual: { bleedOut: 45, bleedOutStep: 10, bleedOutMin: 15, reviveTime: 2.5, reviveHealth: 40 },
  normal: { bleedOut: 30, bleedOutStep: 10, bleedOutMin: 10, reviveTime: 3, reviveHealth: 30 },
  hard: { bleedOut: 25, bleedOutStep: 8, bleedOutMin: 8, reviveTime: 3.5, reviveHealth: 30 },
  nightmare: { bleedOut: 20, bleedOutStep: 7, bleedOutMin: 6, reviveTime: 4, reviveHealth: 25 },
};

/**
 * The tuned base curve (before multipliers), wave n: count = c0 + c1 (n - 1); maxAlive = a0 + n;
 * health h0 + h1 a wave to lateFrom, then + h2, x open[n - 1] in the opening waves (a
 * starting pistol); speed s0 + s1 n; runners r1 a wave from runnersFrom; damage d0 + d1 n;
 * spawn interval max(i2, i0 - i1 n).
 */
const WAVE = { c0: 6, c1: 3, a0: 4, h0: 100, h1: 10, h2: 4, open: [0.8, 0.9], s0: 186, s1: 4, r1: 0.04, d0: 10, d1: 1.6, i0: 1.6, i1: 0.08, i2: 0.5 };
/** Never more zombies up at once than this (zombies.js keeps 32 common bodies), nor commons faster, nor more specials. */
export const MAX_ALIVE = 28, SPEED_MAX = 245, SPECIAL_MAX = 0.3;

const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

/** Every preset, assembled: ZDIFF.normal etc. (frozen; a group a preset doesn't list is Normal's). */
export const ZDIFF = deepFreeze(Object.fromEntries(ZDIFF_ORDER.map((id) => [id, {
  id, sandbox: false, ...META[id],
  econ: ECON[id], horde: HORDE[id] || HORDE.normal, specials: SPECIALS[id] || SPECIALS.normal, squad: SQUAD[id] || SQUAD.normal,
}])));

/** A preset by id (unknown ids: Normal). */
export function getDiff(id) { return ZDIFF[id] || ZDIFF[DEFAULT_ZDIFF]; }

/**
 * The zombie part of the New Game options, normalised (missing / bad values: defaults).
 *  zdiff: preset id ('normal'); squadScaling: the horde grows with the squad (true);
 *  breakLen: seconds between waves, 0 / missing = the preset's; hardcore: no wave heal,
 *  guns only in the breaks (no re-arm window after a respawn), radar pings only (false).
 */
export function zombieOptions(opts = {}) {
  const b = +opts.breakLen;
  return {
    zdiff: ZDIFF[opts.zdiff] ? opts.zdiff : DEFAULT_ZDIFF,
    squadScaling: opts.squadScaling !== false && opts.squadScaling !== 0 && opts.squadScaling !== '0',
    breakLen: b > 0 ? Math.max(5, Math.min(120, Math.round(b))) : 0,
    hardcore: opts.hardcore === true || opts.hardcore === 1 || opts.hardcore === '1',
  };
}

/**
 * The difficulty a run plays at (g.zombies.diff): the preset with the options folded in, so
 * readers never look at the options themselves. Adds hardcore, squadScaling, and the
 * effective breakLen. Hardcore: no wave heal; guns, upgrades and perks in the breaks only
 * (even on Sandbox; no re-arm window: zeconomy.js rearm), mid-wave still ammo, armour and
 * medkits at the combat premium.
 */
export function resolveDiff(o = zombieOptions()) {
  const d = getDiff(o.zdiff);
  const r = {
    ...d,
    econ: { ...d.econ }, horde: { ...d.horde }, specials: { ...d.specials }, squad: { ...d.squad },
    hardcore: !!o.hardcore, squadScaling: o.squadScaling !== false,
    breakLen: o.breakLen > 0 ? o.breakLen : d.breakLen,
  };
  if (r.hardcore) { r.econ.waveHeal = 0; r.econ.buyAnytime = false; }
  return deepFreeze(r);
}

/**
 * What wave n brings at difficulty diff (default Normal) for a squad worth crowd guns
 * (humans + botCrowd x bots, ZombieMode.waveOpts; 1 = solo or squad scaling off). It keeps
 * getting harder for good: on Normal health +10 a wave to wave 10, then +4; past wave 10 the
 * claw, runner, specials and up-at-once caps keep rising by 0.8% a wave. Solo on Normal the
 * commons top out at 222 units/s, slower than you with any rifle (only the runners, up to
 * 20% of a wave, outpace you), a claw does at most 22, up to 9 are up at once; you and 8
 * bots face a third more zombies, 14 to 18 up at once. special / perKind: Specials.pick.
 */
export function waveStats(n, { diff = ZDIFF[DEFAULT_ZDIFF], crowd = 1 } = {}) {
  const H = diff.horde, E = diff.econ, B = WAVE;
  const early = Math.min(n, H.lateFrom) - 1, late = Math.max(0, n - H.lateFrom);
  const L = 1 + H.lateGrowth * late; // the caps, past lateFrom
  const c = Math.max(0, crowd - 1); // the squad past the first gun
  const many = 1 + H.crowdCount * c, up = 1 + H.crowdAlive * c;
  return {
    count: Math.max(1, Math.round((B.c0 + B.c1 * (n - 1)) * H.count * many)),
    maxAlive: Math.min(MAX_ALIVE, Math.round(H.maxAliveCap * L * up), Math.round((B.a0 + n) * H.maxAlive * up)),
    health: Math.round((B.h0 + B.h1 * early + B.h2 * late) * H.health * (B.open[n - 1] ?? 1)),
    speed: Math.min(SPEED_MAX, H.speedCap + H.speedLate * late, (B.s0 + B.s1 * n) * H.speed),
    runners: n < H.runnersFrom ? 0 : Math.min(0.45, H.runnerCap * L, B.r1 * H.runners * (n - H.runnersFrom + 1)),
    damage: Math.round(Math.min(H.damageCap * L, (B.d0 + B.d1 * n) * H.damage)),
    interval: Math.max(B.i2, B.i0 - B.i1 * n) * H.interval / many ** H.crowdPace, // (more of them: they come faster)
    bonus: E.waveBonus[0] + E.waveBonus[1] * n,
    special: specialChance(n, diff, crowd),
    perKind: diff.specials.perKind + Math.floor(c / diff.specials.perKindCrowd + 1e-9),
  };
}

/** The chance a spawn in wave n is a special (Specials.pick), for a squad worth crowd guns. */
export function specialChance(n, diff = ZDIFF[DEFAULT_ZDIFF], crowd = 1) {
  const S = diff.specials, late = Math.max(0, n - diff.horde.lateFrom);
  const solo = 1 + S.solo * Math.max(0, Math.min(1, 2 - crowd)); // fewer commons solo: a few more specials
  return Math.min(SPECIAL_MAX, Math.min(S.cap * (1 + diff.horde.lateGrowth * late), S.base + S.perWave * n) * S.rate * solo);
}
