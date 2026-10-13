// Zombie survival difficulty: one table every tuning knob of the mode reads.
// A preset = { id, label, blurb, sandbox, breakLen, firstBreak, econ, horde, specials, squad,
// from Milestone 2 stagger, shove, ai, director, roster, combo, and from Milestone 3 perks,
// forge, roles, boss, drops }.
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
 * Up at once (Milestone 2, zhorde.js): solo it stays as it was on Normal; a squad gets more
 * up (crowdAlive), up to MAX_ALIVE late with a full one; Hard and Nightmare more again.
 */
const HORDE = {
  casual: { count: 0.6, health: 0.75, damage: 0.7, damageCap: 16, speed: 0.96, speedCap: 212, speedLate: 0, runners: 0.75, runnerCap: 0.12, runnersFrom: 5, maxAlive: 0.9, maxAliveCap: 8, interval: 1.1, lateFrom: 10, lateGrowth: 0.004, botCrowd: 0.4, crowdCount: 0.05, crowdAlive: 0.08, crowdPace: 0.3 },
  normal: { count: 0.7, health: 1, damage: 1, damageCap: 22, speed: 1, speedCap: 222, speedLate: 0, runners: 1, runnerCap: 0.2, runnersFrom: 4, maxAlive: 1, maxAliveCap: 9, interval: 1, lateFrom: 10, lateGrowth: 0.008, botCrowd: 0.5, crowdCount: 0.08, crowdAlive: 0.3, crowdPace: 0.3 },
  hard: { count: 0.8, health: 1.2, damage: 1.25, damageCap: 26, speed: 1.03, speedCap: 228, speedLate: 0.4, runners: 1.25, runnerCap: 0.26, runnersFrom: 3, maxAlive: 1.1, maxAliveCap: 11, interval: 0.9, lateFrom: 10, lateGrowth: 0.015, botCrowd: 0.5, crowdCount: 0.09, crowdAlive: 0.35, crowdPace: 0.3 },
  nightmare: { count: 0.9, health: 1.45, damage: 1.5, damageCap: 30, speed: 1.06, speedCap: 236, speedLate: 0.6, runners: 1.5, runnerCap: 0.32, runnersFrom: 2, maxAlive: 1.3, maxAliveCap: 14, interval: 0.8, lateFrom: 10, lateGrowth: 0.022, botCrowd: 0.6, crowdCount: 0.1, crowdAlive: 0.4, crowdPace: 0.3 },
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

// ---------------------------------------------------------------- Milestone 2 ("a horde worth fighting")
// One table per builder (m2-contracts): only the owner edits it, one preset per line. The new
// pressure lives mostly in Hard and Nightmare; Normal stays challenging, not overkill. Sandbox
// plays Normal's rows.

/**
 * Stagger and stopping power (zstagger.js): resist (x the poise a hit must build before a
 * common staggers: higher = harder to stop), decay (poise lost a second, fraction of full),
 * cooldown (s after a stagger ends before the next can start: no stun-lock), knockdown (x the
 * chance a leg hit drops it to its knees). Hard and Nightmare resist more (M2 integration: with
 * the squad's stagger and shove in, those presets had got easier than they were before M2).
 */
const STAGGER = {
  casual: { resist: 0.8, decay: 0.3, cooldown: 0.25, knockdown: 1.2 },
  normal: { resist: 1, decay: 0.4, cooldown: 0.3, knockdown: 1 },
  hard: { resist: 1.4, decay: 0.5, cooldown: 0.45, knockdown: 0.7 },
  nightmare: { resist: 1.7, decay: 0.6, cooldown: 0.6, knockdown: 0.55 },
};

/** Melee shove (shove.js): pips (shoves before you're tired), regen (s to get one back), tired (s of a weak shove once out). */
const SHOVE = {
  casual: { pips: 5, regen: 1.1, tired: 0.8 },
  normal: { pips: 4, regen: 1.4, tired: 1 },
  hard: { pips: 4, regen: 1.7, tired: 1.2 },
  nightmare: { pips: 3, regen: 2, tired: 1.4 },
};

/**
 * Horde AI (zhorde.js): flank (share of commons that keep a side flow field for life), fields
 * (side fields built besides the main one), surround (u: within this a zombie takes a ring slot
 * around its target instead of queueing; 0 = off), slots (ring slots per target).
 */
const AI = {
  casual: { flank: 0.15, fields: 1, surround: 260, slots: 6 },
  normal: { flank: 0.3, fields: 2, surround: 260, slots: 8 },
  hard: { flank: 0.3, fields: 2, surround: 260, slots: 8 },
  nightmare: { flank: 0.35, fields: 2, surround: 280, slots: 10 },
};

/**
 * Wave director (director.js): fronts [min, max] open a wave; modsFrom (first wave with a wave
 * type) and modChance (a non-boss wave from there gets one); surge (share of a wave that comes
 * in surges), surgeAlive (x maxAlive while one is on), calm (s of quiet after one); radar
 * ('full': every zombie a blip; 'pings': only seen, heard or within pingRange u). trickle (x
 * maxAlive between surges: the quiet stretches pay for the bursts), push (x maxAlive in the
 * final push, the last pushAt of the wave), power (how hard a wave type bites: x its extra
 * zombies, its share of crawlers / riot / risen, an elite's health), spread (share of the
 * trickle that still comes from anywhere: one long stream from a single front is harder).
 */
const DIRECTOR = {
  casual: { fronts: [1, 1], modsFrom: 4, modChance: 0.3, surge: 0.2, surgeAlive: 1.1, calm: 6, radar: 'full', pingRange: 400, trickle: 0.8, push: 1, pushAt: 0.15, power: 0.75, spread: 0.45 },
  normal: { fronts: [1, 2], modsFrom: 3, modChance: 0.4, surge: 0.25, surgeAlive: 1.15, calm: 6, radar: 'pings', pingRange: 400, trickle: 0.8, push: 1, pushAt: 0.2, power: 0.9, spread: 0.35 },
  hard: { fronts: [1, 2], modsFrom: 3, modChance: 0.5, surge: 0.35, surgeAlive: 1.35, calm: 4, radar: 'pings', pingRange: 400, trickle: 0.9, push: 1.2, pushAt: 0.2, power: 1.15, spread: 0.2 },
  nightmare: { fronts: [2, 2], modsFrom: 2, modChance: 0.6, surge: 0.4, surgeAlive: 1.5, calm: 3, radar: 'pings', pingRange: 400, trickle: 0.95, push: 1.3, pushAt: 0.25, power: 1.3, spread: 0.1 },
};

/**
 * Common roster (zroster.js, COMMONS): mix (x the weights of the commons other than walkers and
 * runners), shift (waves added to each variant's first wave: + later, - earlier), riotCap
 * (share of a wave's commons that may be riot zombies); the screamer calls every screamEvery
 * [min, max] s, screamMax times (then it comes for you; when the director takes no surge, a
 * call brings screamCall extra commons itself);
 * a bloater's gas cloud hurts the squad gasHurt a second and zombies gasZombie of their health
 * a second.
 */
const ROSTER = {
  casual: { mix: 0.7, shift: 2, riotCap: 0.06, screamEvery: [16, 20], screamMax: 2, screamCall: 2, gasHurt: 4, gasZombie: 0.2 },
  normal: { mix: 1, shift: 0, riotCap: 0.08, screamEvery: [13, 17], screamMax: 3, screamCall: 3, gasHurt: 6, gasZombie: 0.18 },
  hard: { mix: 1.2, shift: -1, riotCap: 0.12, screamEvery: [11, 14], screamMax: 4, screamCall: 4, gasHurt: 8, gasZombie: 0.16 },
  nightmare: { mix: 1.4, shift: -2, riotCap: 0.16, screamEvery: [9, 12], screamMax: 5, screamCall: 5, gasHurt: 10, gasZombie: 0.15 },
};

/**
 * Readable specials and combos (zthreats.js, Specials.pick): from (first wave with planned
 * pairs, and with the scheduler instead of the flat chance), chance (a special pick becomes a
 * pair), gap [min, max] (s between the two), arcs (telegraph arcs on the crosshair ring:
 * casual shows them earlier, x the warning lead), cost (specials' worth of the scheduler's
 * budget a pair takes: 2 = no more specials than without pairs, only bunched; less: extra).
 */
const COMBO = {
  casual: { from: 8, chance: 0.15, gap: [4, 6], arcs: 1.3, cost: 2 },
  normal: { from: 6, chance: 0.25, gap: [3, 5], arcs: 1, cost: 2 },
  hard: { from: 5, chance: 0.35, gap: [2.5, 4], arcs: 1, cost: 1.6 },
  nightmare: { from: 4, chance: 0.45, gap: [2, 3.5], arcs: 0.9, cost: 1.35 },
};

// ---------------------------------------------------------------- Milestone 3 ("every run is different")
// One table per builder again (m3-contracts section 9): only the owner edits it, one preset per
// line; Sandbox plays Normal's rows. The values are scaffold defaults nothing reads yet (bar
// drops.life / powerupSecs, roles.focus and boss.relics, read by the foundation's working
// scaffolds): tune them. Help (choices, drops, heals, posture) shrinks Casual -> Nightmare.

/**
 * Perk draft (perks.js): choices (cards offered at a break), rareEvery (every nth wave's draft
 * rolls rarer cards), rerolls (free rerolls a run), curse (chance a draft holds a boon-and-curse
 * card), from (the first break with a draft: after wave n).
 */
const PERKS = {
  casual: { choices: 4, rareEvery: 5, rerolls: 2, curse: 0.1, from: 1 },
  normal: { choices: 3, rareEvery: 5, rerolls: 1, curse: 0.15, from: 1 },
  hard: { choices: 3, rareEvery: 5, rerolls: 1, curse: 0.2, from: 1 },
  nightmare: { choices: 2, rareEvery: 5, rerolls: 0, curse: 0.25, from: 1 },
};

/**
 * Weapon forge (zforge.js): priceK (x every forge price), tiers (the top tier), roundFrom (the
 * tier a round type fits from), procK (x the elemental rounds' proc rates), leech (HP a second
 * Vampiric rounds can give back at most), botTier (the tier bots forge their main gun up to;
 * from roundFrom they load a round too).
 */
const FORGE = {
  casual: { priceK: 0.8, tiers: 5, roundFrom: 3, procK: 1.2, leech: 10, botTier: 3 },
  normal: { priceK: 1, tiers: 5, roundFrom: 3, procK: 1, leech: 8, botTier: 2 },
  hard: { priceK: 1.15, tiers: 5, roundFrom: 3, procK: 0.9, leech: 6, botTier: 2 },
  nightmare: { priceK: 1.3, tiers: 5, roundFrom: 3, procK: 0.8, leech: 5, botTier: 1 },
};

/**
 * Squad roles and orders (zsquad.js; downed / revive is the M1 `squad` group): focus (s a
 * Focus order lasts), medicHeal (a Medic patches a teammate up below this HP; the others 55),
 * holdArc (u: the radius of the arc "Hold here" sets the squad in).
 */
const ROLES = {
  casual: { focus: 15, medicHeal: 70, holdArc: 240 },
  normal: { focus: 12, medicHeal: 65, holdArc: 240 },
  hard: { focus: 12, medicHeal: 60, holdArc: 260 },
  nightmare: { focus: 10, medicHeal: 55, holdArc: 260 },
};

/**
 * Bosses (bosses.js; they were nerfed on purpose: readable, never tankier): hpWave [first,
 * per] (a boss's HP x first + per x (n/5 - 1) by the wave it shows up in, instead of the fixed
 * cycle; Normal averages today's 1.0 over waves 5-25), heal / armor (HP and armour back for
 * everyone standing after a boss kill, instead of a full heal), relics (relics a trophy offers),
 * posture (x posture a hit builds), kneel (s a posture break holds it down), kneelK (x damage
 * while it kneels), phases (health fractions that add a move), elitesFrom (first wave with an
 * elite: odd waves only), eliteChance (an odd wave brings one), eliteHp (x an elite's health).
 */
const BOSS = {
  casual: { hpWave: [0.7, 0.1], heal: 100, armor: 100, relics: 3, posture: 1.3, kneel: 3.5, kneelK: 2, phases: [0.66, 0.33], elitesFrom: 9, eliteChance: 0.25, eliteHp: 1.6 },
  normal: { hpWave: [0.8, 0.1], heal: 50, armor: 50, relics: 2, posture: 1, kneel: 3, kneelK: 2, phases: [0.66, 0.33], elitesFrom: 7, eliteChance: 0.35, eliteHp: 2 },
  hard: { hpWave: [0.9, 0.11], heal: 40, armor: 25, relics: 2, posture: 0.85, kneel: 2.5, kneelK: 2, phases: [0.66, 0.33], elitesFrom: 5, eliteChance: 0.5, eliteHp: 2.3 },
  nightmare: { hpWave: [1, 0.12], heal: 30, armor: 0, relics: 2, posture: 0.7, kneel: 2.2, kneelK: 2, phases: [0.75, 0.5, 0.25], elitesFrom: 3, eliteChance: 0.65, eliteHp: 2.6 },
};

/**
 * Drops and power-ups (pickups.js, powerups.js): budget [base, perWave] (loot drops a wave
 * may hold: base + perWave x wave), chance (a kill drops loot while there's budget), powerup
 * (share of drops that are power-ups), life (s before loot on the floor fades), powerupSecs (s
 * a timed power-up lasts), airdropFrom (first wave with an airdrop flare), airdropChance (a
 * wave from there gets one).
 */
const DROPS = {
  casual: { budget: [6, 0.6], chance: 0.1, powerup: 0.12, life: 30, powerupSecs: 15, airdropFrom: 4, airdropChance: 0.5 },
  normal: { budget: [5, 0.5], chance: 0.08, powerup: 0.1, life: 30, powerupSecs: 15, airdropFrom: 4, airdropChance: 0.4 },
  hard: { budget: [4, 0.4], chance: 0.07, powerup: 0.08, life: 25, powerupSecs: 15, airdropFrom: 5, airdropChance: 0.35 },
  nightmare: { budget: [3, 0.3], chance: 0.06, powerup: 0.06, life: 20, powerupSecs: 12, airdropFrom: 6, airdropChance: 0.3 },
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

/** The Milestone 2 groups by field name (diff.stagger, diff.shove, ...), then Milestone 3's (diff.perks, diff.forge, ...). */
const M2 = { stagger: STAGGER, shove: SHOVE, ai: AI, director: DIRECTOR, roster: ROSTER, combo: COMBO };
const M3 = { perks: PERKS, forge: FORGE, roles: ROLES, boss: BOSS, drops: DROPS };
const GROUPS = { ...M2, ...M3 };
/** The per-builder group names (diff[name]) from Milestone 2 on. */
export const ZDIFF_GROUPS = Object.freeze(Object.keys(GROUPS));

const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

/** Every preset, assembled: ZDIFF.normal etc. (frozen; a group a preset doesn't list is Normal's). */
export const ZDIFF = deepFreeze(Object.fromEntries(ZDIFF_ORDER.map((id) => [id, {
  id, sandbox: false, ...META[id],
  econ: ECON[id], horde: HORDE[id] || HORDE.normal, specials: SPECIALS[id] || SPECIALS.normal, squad: SQUAD[id] || SQUAD.normal,
  ...Object.fromEntries(Object.entries(GROUPS).map(([k, T]) => [k, T[id] || T.normal])),
}])));

/** A preset by id (unknown ids: Normal). */
export function getDiff(id) { return ZDIFF[id] || ZDIFF[DEFAULT_ZDIFF]; }

/**
 * The zombie part of the New Game options, normalised (missing / bad values: defaults).
 *  zdiff: preset id ('normal'); squadScaling: the horde grows with the squad (true);
 *  breakLen: seconds between waves, 0 / missing = the preset's; hardcore: no wave heal,
 *  guns only in the breaks (no re-arm window after a respawn), radar pings only (false);
 *  seed: the run's random seed (zrng.js: the boss order...; null = a fresh one every run).
 */
export function zombieOptions(opts = {}) {
  const b = +opts.breakLen;
  return {
    zdiff: ZDIFF[opts.zdiff] ? opts.zdiff : DEFAULT_ZDIFF,
    squadScaling: opts.squadScaling !== false && opts.squadScaling !== 0 && opts.squadScaling !== '0',
    breakLen: b > 0 ? Math.max(5, Math.min(120, Math.round(b))) : 0,
    hardcore: opts.hardcore === true || opts.hardcore === 1 || opts.hardcore === '1',
    seed: opts.seed != null && opts.seed !== '' && Number.isFinite(+opts.seed) ? +opts.seed >>> 0 : null,
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
    ...Object.fromEntries(Object.keys(GROUPS).map((k) => [k, { ...d[k] }])),
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
 * bots face a third more zombies, about 20 up at once, and with 10 bots up to 28 late (the
 * horde AI spreads them round you: zhorde.js). special / perKind: Specials.pick.
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
    mod: null, // the wave type (director.js MODS id; WaveDirector.plan sets it)
  };
}

/** The chance a spawn in wave n is a special (Specials.pick), for a squad worth crowd guns. */
export function specialChance(n, diff = ZDIFF[DEFAULT_ZDIFF], crowd = 1) {
  const S = diff.specials, late = Math.max(0, n - diff.horde.lateFrom);
  const solo = 1 + S.solo * Math.max(0, Math.min(1, 2 - crowd)); // fewer commons solo: a few more specials
  return Math.min(SPECIAL_MAX, Math.min(S.cap * (1 + diff.horde.lateGrowth * late), S.base + S.perWave * n) * S.rate * solo);
}
