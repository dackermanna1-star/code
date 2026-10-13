// Zombie survival bosses: one every 5 waves (5, 10, 15, 20, 25, then round again,
// stronger each time). Each has its own look (skins.js / body.js / extras.js) and
// powers, every power telegraphed so it can be dodged:
//  - THE BUTCHER: cleaver chops; roars and CHARGES in a straight line (dodge sideways);
//    hitting a wall stuns him and he takes extra damage. Enrages below 40%.
//  - THE SPITTER: keeps her distance and lobs volleys of acid that leave burning pools;
//    bursts a brood of fast crawlers at 75 / 50 / 25 %; dies in an acid explosion.
//  - THE BANSHEE: fast double claw; blinks around (often behind you); her SCREAM
//    hurts, slows and shakes everyone near and calls a pack of runners.
//  - THE INFERNO: immune to fire, burns what he touches, leaves burning footprints,
//    hurls fireballs and sets off a ring of fire; explodes when he dies.
//  - THE ABOMINATION: armoured (shoot the head, or the core when his chest opens);
//    GROUND SLAM shockwave (jump it); raises the dead around him.
//
// Milestone 3.4 (owner: bosses; m3-contracts section 10): readable fights with punish windows,
// never tankier.
//  - The order: a seeded shuffle of all five (zrng.js rng(seed, 'bosses')), reshuffled every
//    cycle (never the same boss twice in a row), so a 30-minute run can meet any of them.
//  - Health by the wave it shows up in (diff.boss.hpWave), not by its slot; a bot counts
//    diff.boss.botShare of a shooter (0.45 on Normal: role guns and perks). A later cycle still
//    hits harder (dmgK) and walks faster.
//  - POSTURE: a second bar filled by shotguns, explosives, melee and hits on its weak point
//    (WEAK below; bullets elsewhere barely count, bots' hits count POSTURE.bot as much), x
//    diff.boss.posture; it drains when left alone. Full: a break - it drops to its knees for
//    diff.boss.kneel s taking diff.boss.kneelK x damage (the Abomination's core opens instead),
//    with a hit-stop beat and a glowing weak point (x POSTURE.weakK more there). The bar then
//    grows by POSTURE.grow, so it can't be chain-broken.
//  - PHASES at diff.boss.phases (66% / 33%; Nightmare three): each adds one move (MOVES,
//    built from the helpers here: lob, the charge, blink, slam, the hunter's leap, the smoker's
//    pull); past a boss's two moves a phase is a FRENZY (everything comes faster). A new phase
//    takes GUARD_K damage until its move has gone off (GUARD_T s at most): each one gets seen.
//  - The staged arrival (arrive: ARRIVE s): the ground rumbles, the lights dip, a roar comes
//    from where it will come in and the commons back off; then a title card (bossstage.js).
//  - Trophies replace the full heal (reward): diff.boss.heal HP and diff.boss.armor armour, and
//    a trophy pops out of the body; whoever grabs it picks a relic (relics.js).
//  - Elites on odd waves: the Alpha Hunter and the Juggernaut Charger (zelites.js), on the
//    boss bar too (hudInfo().elites).
// Events: 'posture' { phase: 'break' | 'recover', boss, by }, 'bossphase' { boss, id, phase },
// 'trophy' { phase: 'drop' | 'take', player, boss }, 'elite' (zelites.js).
import { Player, TEAM_T, TEAM_CT } from './player.js';
import { createPlayerModel } from '../assets/playermodels.js';
import { setDynamicBox, CONTENTS_ZOMBIE, TraceResult, MASK_WORLD_PLAYER, MASK_SHOT } from '../engine/collision.js';
import * as CR from './combatrules.js';
import { COMMON_SKINS } from './zroster.js';
import { rng, shuffle } from './zrng.js';
import { inSquad } from './runstats.js';
import { damageKind } from './zmods.js';
import { WEAPON_DEFS } from './weaponsys.js';
import { MODELS } from './pickups.js';
import { buildTrophy } from '../assets/trophy.js';
import { BossStage } from './bossstage.js';
import { ZElites } from './zelites.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const _tr = new TraceResult();
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const H = CR.HITGROUP;
const ZERO = [0, 0, 0];
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _f0 = [0, 0, 0], _f1 = [0, 0, 0];

MODELS.bosstrophy = buildTrophy; // (the trophy's look: relics.js TROPHY)

/** Bosses' health and every hit they deal, against the numbers below (tuned down 35%; k: one boss's own extra factor). */
export const BOSS_NERF = 0.65;

/**
 * tier: the wave it was built for (its old slot: early); weak: the hitgroups of its weak point (hits there build posture, and hurt more while it
 * kneels); weakBone: where the glow sits; weakName: the title card's hint; moves: the move each
 * phase adds (MOVES).
 */
export const BOSSES = [
  { id: 'butcher', tier: 5, name: 'THE BUTCHER', title: 'He brought his cleaver. Dodge the charge.', skin: 'butcher', scale: 1.4, health: 3200, speed: 205, damage: 34, color: [230, 60, 40], weak: [H.HEAD], weakBone: 'head', weakName: 'his head', moves: ['hook', 'bloodlust'] },
  { id: 'spitter', tier: 10, name: 'THE SPITTER', title: 'Stay out of the acid.', skin: 'spitter', scale: 1.3, health: 2800, speed: 175, damage: 22, color: [140, 230, 40], k: 0.8, weak: [H.STOMACH], weakBone: 'spine', weakName: 'her swollen gut', moves: ['rain', 'wave'] },
  { id: 'banshee', tier: 15, name: 'THE BANSHEE', title: 'Watch your back. Hear her scream.', skin: 'banshee', scale: 1.2, stretch: 1.12, health: 2400, speed: 240, damage: 16, color: [180, 200, 255], weak: [H.HEAD], weakBone: 'head', weakName: 'her head', moves: ['ambush', 'pack'] },
  { id: 'inferno', tier: 20, name: 'THE INFERNO', title: 'Fire only makes him stronger.', skin: 'inferno', scale: 1.35, health: 3800, speed: 200, damage: 30, fireImmune: true, color: [255, 140, 30], weak: [H.CHEST], weakBone: 'chest', weakName: 'the molten core in his chest', moves: ['meteor', 'blaze'] },
  { id: 'abomination', tier: 25, name: 'THE ABOMINATION', title: 'Armoured. Aim for the head, or the core when it opens.', skin: 'abomination', scale: 1.65, health: 5600, speed: 185, damage: 42, color: [255, 50, 30], weak: [H.HEAD], weakBone: 'chest', weakName: 'his head - and the core once it opens', moves: ['aftershock', 'leap'] },
];

/** A boss's health and hits at wave 5 when its tier is later (early). */
const EARLY_MIN = 0.65;
/**
 * A new phase holds a moment: x GUARD_K damage until its move has gone off once, GUARD_T s at
 * most (a frenzy: 40% of that), so a squad with heavy guns still sees each phase. GUARD_BY: a
 * phase move that changes another move ends the guard when that one goes off.
 */
const GUARD_K = 0.35, GUARD_T = 3.5;
const GUARD_BY = { bloodlust: 'charge', aftershock: 'slam' };

/** The moves a phase adds: the banner's name and hint (bossstage.js). */
export const MOVES = {
  hook: { name: 'MEAT HOOK', hint: 'He throws a hook on a chain - strafe out of its line' },
  bloodlust: { name: 'BLOODLUST', hint: 'He charges twice - dodge, then dodge again' },
  rain: { name: 'ACID RAIN', hint: 'Get out of the circles' },
  wave: { name: 'ACID WAVE', hint: 'A river of acid runs at you - step aside' },
  ambush: { name: 'PHANTOM STRIKE', hint: 'She appears behind you - turn around' },
  pack: { name: 'WAIL OF THE PACK', hint: 'Sprinters answer her call' },
  meteor: { name: 'METEOR SHOWER', hint: 'Fire falls from the sky - out of the circles' },
  blaze: { name: 'BLAZING CHARGE', hint: 'Dodge sideways - and mind the trail of fire' },
  aftershock: { name: 'AFTERSHOCK', hint: 'Jump the slam - then jump the wider one' },
  leap: { name: 'EARTHSHAKER', hint: 'He leaps at you - out of the circle before he lands' },
  frenzy: { name: 'FRENZY', hint: 'Everything comes faster now' },
};

/**
 * Posture: of (the bar, x its health at spawn), grow (x the bar after each break), idle / drain
 * (s without a posture hit, then x the bar a second it loses), bot (a bot's hits build this
 * much of yours), per kind of hit (x its damage): shotgun, blast, melee, weak (its weak point,
 * any gun), energy, bullet (elsewhere), fire; weakK (x damage on the weak point while it kneels,
 * on top of diff.boss.kneelK; not a headshot - the head has its own x4).
 */
export const POSTURE = { of: 0.25, grow: 1.4, idle: 2.5, drain: 0.1, bot: 0.4, shotgun: 0.8, blast: 1.3, melee: 1, weak: 2, energy: 0.25, bullet: 0.15, fire: 0.03, weakK: 1.5 };
/** s from a boss wave's start to the boss (the staged arrival: bossstage.js). */
export const ARRIVE = 6;
/** States that wind up a move: the boss glows brighter (and zthreats-style readability). */
const TELEGRAPH = new Set(['charge_wind', 'spit_up', 'scream_up', 'fire_up', 'nova_up', 'slam_up', 'raise_up', 'hook_wind', 'rain_up', 'wave_up', 'ambush', 'pack_up', 'meteor_up', 'blaze_wind', 'after_up', 'leap_up']);

export class BossDirector {
  constructor(game) {
    this.game = game;
    this.boss = null;
    this.models = new Map(); // boss id -> PlayerModel (reused; the corpse is baked first)
    this.order = []; // BOSSES indices in the order they come (plan; grows a cycle at a time)
    this.stage = new BossStage(game, this); // the arrival, title card, banners, telegraph markers, glows
    this.elites = new ZElites(game, this);
    this.info = { name: null, hp: 0, hpMax: 1, status: '', color: null, posture: null, broken: false, brokenLeft: 0, phase: 0, phases: null, cycle: 0, id: null, elites: [] };
    this.weakSnd = 0;
    this.plan(0);
  }

  get Z() { return this.game.zombies; }
  alive() { return !!(this.boss && this.boss.alive); }

  clear() {
    this.boss = null;
    this.pendingBoom = null;
    for (const m of this.models.values()) m.dispose(); // (guarded against double dispose)
    this.models.clear();
    this.stage.clear();
    this.elites.clear();
  }

  // ---------------------------------------------------------------- the order, health, arrival
  /** A run starts (ZombieMode.start): the order the bosses come in, from the run's seed (zrng.js rng(seed, 'bosses')). */
  plan(seed) {
    this.rnd = rng(seed >>> 0, 'bosses');
    this.order = [];
    this.extend(1);
  }

  /** Shuffle cycles onto the order until it holds k + 1 bosses (never the same one twice in a row across a seam). */
  extend(k) {
    if (!this.rnd) this.rnd = rng(0, 'bosses');
    const n = BOSSES.length;
    while (this.order.length <= k || this.order.length % n) {
      if (this.order.length % n) { this.order.push(...BOSSES.map((_, i) => i).filter((i) => !this.order.slice(-(this.order.length % n)).includes(i))); continue; } // (a hand-set partial order: finish its cycle)
      const c = shuffle(BOSSES.map((_, i) => i), this.rnd);
      if (this.order.length && c[0] === this.order[this.order.length - 1]) { const j = 1 + Math.floor(this.rnd() * (n - 1)); c[0] = c[j]; c[j] = this.order[this.order.length - 1]; }
      this.order.push(...c);
    }
  }

  /** The boss for wave n (a multiple of 5) and its cycle (0 for the first five): { def, cycle }. */
  pick(n) {
    const k = Math.max(0, Math.round(n / 5) - 1);
    if (k >= this.order.length) this.extend(k);
    return { def: BOSSES[this.order[k]], cycle: Math.floor(k / BOSSES.length) };
  }

  /** Its health for wave n (diff.boss.hpWave: by the wave it shows up in) with a squad worth crowd guns (a bot counts 0.3: keep it). */
  healthFor(def, n, cycle, crowd) {
    void cycle;
    const w = this.Z?.diff?.boss?.hpWave || [0.8, 0.1];
    const k = w[0] + w[1] * Math.max(0, n / 5 - 1);
    return Math.round(def.health * this.early(def, n) * BOSS_NERF * (def.k ?? 1) * k * (1 + 0.3 * (crowd - 1)));
  }

  /**
   * A boss that comes before its old slot (def.tier: the shuffle can bring the Abomination,
   * built for wave 25, at wave 5) comes in lighter and hits softer: EARLY_MIN x at wave 5,
   * all of it by its tier wave. Never above 1 (nobody gets tankier).
   */
  early(def, n) {
    const tier = def.tier || 5;
    if (n >= tier) return 1;
    return EARLY_MIN + (1 - EARLY_MIN) * Math.max(0, (n - 5) / (tier - 5));
  }

  /** startWave on a boss wave: s until the boss comes. The staged arrival plays in that time (bossstage.js). */
  arrive(n) {
    const { def } = this.pick(n);
    this.stage.arrival(n, def, ARRIVE);
    return ARRIVE;
  }

  /** Boss for wave n (n a multiple of 5). o: { def, cycle } to name it (zm_boss) instead of pick(n). */
  spawn(n, o = {}) {
    const g = this.game, Z = this.Z, t = g.time;
    const P = o.def ? { def: o.def, cycle: o.cycle ?? 0 } : this.pick(n);
    const def = P.def, cycle = P.cycle;
    const humans = Z.humans();
    const node = this.stage.arrivalNode(def, humans) || Z.pickSpawn(); // (where its roar came from, if nobody stands on it)
    if (!node) return false;
    // the previous boss's body (if this one was used before) is made permanent first
    const old = this.boss;
    if (old && !old.alive) g.gore?.bakePlayer(old);
    if (old) g.removePlayer(old, true, true);
    const p = new Player({ name: def.name.replace('THE ', 'The ').replace(/\B[A-Z]+/g, (s) => s.toLowerCase()), team: TEAM_T, skin: def.skin, isBot: true });
    p.isZombie = true;
    p.isBoss = true;
    p.noRagdoll = true;
    g.addPlayer(p);
    p.box.contents = CONTENTS_ZOMBIE;
    let m = this.models.get(def.id);
    if (!m || m._disposed) { m = createPlayerModel(def.skin); this.models.set(def.id, m); }
    m.reset();
    m.setWeapon(null);
    m.object3D.scale.set(def.scale, def.scale, def.scale * (def.stretch || 1));
    m.object3D.visible = true;
    g.renderer.world.add(m.object3D);
    p.model = m;
    // more shooters, more health (a bot counts diff.boss.botShare of one: they die, and it doesn't get weaker)
    const bw = this.Z.diff.boss.botShare ?? 0.3; // (a bot's share of a shooter: diff.boss.botShare)
    const crowd = Math.max(1, humans.reduce((m, q) => m + (q.downed ? 0 : q.isBot ? bw : 1), 0)); // (one who's down doesn't count)
    const hp = this.healthFor(def, n, cycle, crowd);
    const h = humans[0];
    const yaw = h ? Math.atan2(h.pm.origin[1] - node.y, h.pm.origin[0] - node.x) / DEG : 0;
    p.resetForSpawn([node.x, node.y, node.z + 37], yaw);
    p.health = p.maxHealth = hp;
    p.weapons = { 1: null, 2: null, 3: null, 4: [], 5: null };
    p.active = null;
    p.zSpeed = def.speed * (1 + 0.08 * cycle);
    p.boss = {
      def, cycle, wave: n, scale: def.scale, hpMax: hp, dmgK: (1 + 0.25 * cycle) * this.early(def, n),
      state: 'intro', until: t + 1.6, cd: {}, status: '', enraged: false, exposedUntil: 0, stunUntil: 0, guardUntil: 0, guardMove: null,
      lastHurt: 0, recent: 0, brood: 0, trailT: 0, auraT: 0, novaDone: false,
      posture: 0, postureMax: Math.round(hp * POSTURE.of), postureT: 0, brokenUntil: 0, breaks: 0, // (the posture bar; a break: brokenUntil)
      phase: 0, moves: new Set(), frenzy: false, // (the phases passed and the moves they added)
      chained: false, hook: null, acid: null, landAt: null, // (moves in flight: the Butcher's hook, the Spitter's acid wave, the Abomination's leap)
    };
    // the zombie chase fields
    Object.assign(p, { target: null, targetT: 0, node: null, nodeT: 0, goal: null, goalT: 0, windup: 0, nextAttack: t + 2, progPos: p.pm.origin.slice(), progT: t, stuckSince: 0, nextGrowl: t + 3 });
    p.box.active = true;
    setDynamicBox(p.box, p.pm.origin, p.hull().mins, p.hull().maxs);
    this.boss = p;
    g.sound?.play(def.id === 'banshee' ? 'banshee_scream' : 'boss_roar', { pos: p.eyePos(), volume: 1 });
    g.shakeAt?.(p.pm.origin, 6, 3000);
    g.announce?.(def.name);
    this.stage.spawned(p, n); // (the title card, the commons back off, the lights come back up)
    Z.events.mode('boss', { phase: 'spawn', id: def.id, name: def.name, boss: p });
    return true;
  }

  /** Off the map at once, no death and no body (zm_* cheats): the next spawn starts clean. */
  despawn() {
    const b = this.boss, g = this.game;
    this.pendingBoom = null;
    this.stage.reset();
    if (!b) return;
    if (b.alive) {
      b.alive = false;
      b.health = 0;
      b.deathTime = 0;
      b.cmd = null;
      b.box.active = false;
      b.model.object3D.visible = false;
    }
    if (!b.alive && b.deathTime) g.gore?.bakePlayer(b); // (a dead one's body stays)
    g.removePlayer(b, true, true);
    this.boss = null;
  }

  // ---------------------------------------------------------------- damage
  /** Damage taken by a boss, after its armour / weak spots / stun / a posture break. Returns the new amount. */
  adjust(b, attacker, damage, hitgroup, weaponId, opts) {
    const B = b.boss, def = B.def, t = this.game.time;
    if (opts.fire && def.fireImmune) return 0;
    let k = 1;
    if (def.id === 'abomination') {
      if (opts.blast) k = 0.6;
      else if (hitgroup === H.HEAD) k = 1.25;
      else if ((hitgroup === H.CHEST || hitgroup === H.STOMACH) && t < B.exposedUntil) k = 2.2;
      else k = 0.35;
      if (opts.fire) k *= 0.5;
    }
    if (t < B.stunUntil) k *= 1.6;
    if (t < B.guardUntil) k *= GUARD_K; // (a fresh phase: its move gets seen - phases)
    if (t < B.brokenUntil) {
      // on its knees: everything hurts more, the glowing weak point most (the Abomination: its core is open instead)
      if (def.id !== 'abomination') k *= this.Z.diff.boss.kneelK;
      if (!opts.blast && this.weakHit(B, hitgroup, t)) {
        if (hitgroup !== H.HEAD && def.id !== 'abomination') k *= POSTURE.weakK;
        if (attacker?.isLocal && t - this.weakSnd > 0.07) { this.weakSnd = t; this.game.sound?.play('boss_weak_hit', { volume: 0.8 }); }
      }
    }
    B.lastHurt = t;
    B.recent = (B.recent || 0) * Math.max(0, 1 - (t - (B.recentT || t))) + damage * k;
    B.recentT = t;
    this.posture(b, attacker, damage, hitgroup, weaponId, opts);
    return damage * k;
  }

  /** A hit on its weak point (the Abomination: its head, or its core while open). */
  weakHit(B, hitgroup, t) {
    if (B.def.weak.includes(hitgroup)) return true;
    return B.def.id === 'abomination' && t < B.exposedUntil && (hitgroup === H.CHEST || hitgroup === H.STOMACH);
  }

  /**
   * Every hit on a boss (adjust; damage before its armour): builds B.posture toward
   * B.postureMax by the kind of hit (POSTURE), x diff.boss.posture; full, it breaks.
   */
  posture(b, attacker, damage, hitgroup, weaponId, opts) {
    const B = b.boss, t = this.game.time;
    if (!B.postureMax || t < B.brokenUntil || !b.alive || !inSquad(attacker)) return;
    const kind = damageKind(weaponId, opts, attacker);
    let k;
    if (kind === 'blast') k = POSTURE.blast;
    else if (kind === 'fire' || kind === 'acid') k = POSTURE.fire;
    else if (kind === 'melee') k = POSTURE.melee;
    else if (kind === 'energy') k = POSTURE.energy;
    else k = WEAPON_DEFS[weaponId]?.kind === 'shotgun' ? POSTURE.shotgun : POSTURE.bullet;
    if (kind !== 'blast' && kind !== 'fire' && kind !== 'acid' && this.weakHit(B, hitgroup, t)) k = Math.max(k, POSTURE.weak) + (k === POSTURE.shotgun ? 0.4 : 0);
    if (attacker.isBot) k *= POSTURE.bot;
    B.posture += damage * k * this.Z.diff.boss.posture;
    B.postureT = t;
    if (B.posture >= B.postureMax) this.breakPosture(b, attacker);
  }

  /** Its posture breaks: down on its knees (diff.boss.kneel s), a hit-stop beat, the weak point glows. */
  breakPosture(b, by = null) {
    const g = this.game, B = b.boss, t = g.time, D = this.Z.diff.boss;
    B.posture = B.postureMax;
    B.brokenUntil = t + D.kneel;
    B.breaks++;
    this.cancelMoves(b);
    B.state = 'broken';
    b.windup = 0;
    b.pm.velocity[0] *= 0.2; b.pm.velocity[1] *= 0.2;
    if (B.def.id === 'abomination') B.exposedUntil = Math.max(B.exposedUntil, B.brokenUntil); // (its plates part: the core is open while it kneels)
    g.sound?.play('boss_posture_break', { pos: b.eyePos(), volume: 1 });
    this.Z.feedback?.stop?.(0.12, true);
    g.shakeAt?.(b.pm.origin, 9, 1600);
    const o = b.pm.origin;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      g.fire?.emit('dust', [o[0] + Math.cos(a) * 24, o[1] + Math.sin(a) * 24, o[2] - 30], [Math.cos(a) * 320, Math.sin(a) * 320, rnd(20, 90)], { life: 0.8, size: 18, size1: 50, drag: 2.4 });
    }
    this.stage.broken(b, by);
    this.Z.events.mode('posture', { phase: 'break', boss: b, by: by || null });
  }

  /** Back on its feet: the bar grows (no chain-breaking) and empties. */
  recover(b) {
    const g = this.game, B = b.boss, t = g.time;
    B.brokenUntil = 0;
    B.posture = 0;
    B.postureMax = Math.round(B.postureMax * POSTURE.grow);
    B.state = 'chase';
    b.nextAttack = Math.max(b.nextAttack, t + 0.5);
    if (b.model) b.model.kneelT = 0;
    g.sound?.play('boss_recover', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
    this.stage.recovered(b);
    this.Z.events.mode('posture', { phase: 'recover', boss: b, by: null });
  }

  /** Whatever it was doing stops (a break, its death): the hook lets go, the leap lands, the acid wave runs out. */
  cancelMoves(b) {
    const B = b.boss;
    if (B.hook) this.dropHook(b);
    B.acid = null;
    B.chained = false;
    if (B.state === 'leap_air') { B.state = 'chase'; B.landAt = null; }
    b.pm.speedCap = null;
    b.speedNow = null;
  }

  /**
   * What the squad gets for the kill (onKilled, after the bounty): diff.boss.heal HP (up to
   * max health) and diff.boss.armor armour for everyone standing, and a trophy out of the body
   * (relics.js). Returns the centre line's tail.
   */
  reward(b, attacker) {
    void attacker;
    const g = this.game, Z = this.Z, D = Z.diff.boss, def = b.boss.def;
    for (const p of g.players) {
      if (p.team !== TEAM_CT || !p.alive || p.downed) continue; // (one who's down is bleeding out, not hurt: a revive gets him up)
      p.health = Math.min(p.maxHealth, p.health + D.heal);
      if (D.armor > 0) { p.armor = Math.min(100, p.armor + D.armor); p.helmet = true; }
      if (p.isLocal) g.hud?.healFlash?.();
    }
    const o = b.pm.origin;
    const d = Z.pickups?.spawn('trophy', [o[0], o[1], o[2] + 10], { data: { boss: def.name, bossId: def.id, rgb: def.color }, vel: [rnd(-40, 40), rnd(-40, 40), 260] });
    if (d) {
      g.sound?.play('trophy_drop', { pos: d.pos, volume: 1 });
      Z.events.mode('trophy', { phase: 'drop', player: null, boss: def.name });
    }
    const hp = D.heal >= 100 ? 'full health' : `+${D.heal} health`;
    return `${hp}${D.armor > 0 ? ` and ${D.armor} armour` : ''}.${d ? ' Grab the trophy!' : ''}`;
  }

  onKilled(b, attacker) {
    const g = this.game, B = b.boss, def = B.def;
    const o = b.pm.origin;
    this.cancelMoves(b);
    this.stage.killed(b);
    g.sound?.play('boss_die', { pos: o, volume: 1, attenuation: 'none' });
    g.shakeAt?.(o, 8, 2500);
    g.effects.blood?.([o[0], o[1], o[2] + 30], [0, 0, 1], 150, { blast: true });
    const BF = g.effects.bloodFx;
    if (BF) for (let i = 0; i < 40; i++) BF.droplet([o[0] + rnd(-20, 20), o[1] + rnd(-20, 20), o[2] + rnd(0, 60)], [rnd(-400, 400), rnd(-400, 400), rnd(150, 600)], rnd(1.5, 3));
    BF?.puddle([o[0], o[1], o[2] - 36], { delay: 0.6, radius: 60 });
    if (def.id === 'spitter') {
      g.fire?.ignite(o, b, { kind: 'acid', radius: 170, duration: 8, dps: 25, weapon: 'acid', burn: 0 });
      for (const q of this.Z.humans()) if (dist2(q.pm.origin, o) < 200) g.fire?.hurt(q, b, 30, 'acid', 'acid', o);
    }
    if (def.id === 'inferno') {
      // he goes up a moment later
      B.boomAt = g.time + 1.4;
      this.pendingBoom = { pos: o.slice(), at: g.time + 1.4, owner: b };
    }
    const cut = this.Z.economy.bossPay(); // the bounty, shared out by damage dealt (zeconomy.js): your cut
    const got = this.reward(b, attacker); // (the heal, and the trophy)
    g.hud?.centerPrint?.(`${def.name} IS DEAD!\n${cut}${got}`, 5);
  }

  // ---------------------------------------------------------------- AI
  think() {
    const g = this.game, t = g.time;
    if (this.pendingBoom && t >= this.pendingBoom.at) {
      const pb = this.pendingBoom;
      this.pendingBoom = null;
      g.explode(pb.pos, { owner: pb.owner, damage: 90, radius: 330, weapon: 'fireball', sound: 'rocket_explode', scale: 1.8, shake: 12, noGore: false });
      g.fire?.ignite(pb.pos, pb.owner, { radius: 180, duration: 8, dps: 30, weapon: 'fireball' });
    }
    this.stage.tick(t);
    this.elites.tick(t);
    const b = this.boss;
    if (!b || !b.alive) return;
    const B = b.boss, def = B.def, Z = this.Z;
    const cmd = { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 };
    b.cmd = cmd;
    b.pm.speedCap = null;
    b.speedNow = null;
    // moves still in flight whatever it does now: the hook's chain, the acid wave
    if (B.hook) this.hookTick(b, t);
    if (B.acid) this.acidTick(b);
    // posture: on its knees, back up, or draining when left alone
    if (B.brokenUntil) {
      if (t < B.brokenUntil) {
        B.status = 'POSTURE BROKEN';
        b.model?.setGlow(0.5 + 0.3 * Math.sin(t * 9));
        if (b.model) b.model.kneelT = 1;
        this.phases(b, t);
        return;
      }
      this.recover(b);
    } else if (B.posture > 0 && t - B.postureT > POSTURE.idle) B.posture = Math.max(0, B.posture - POSTURE.drain * B.postureMax * 0.01);
    const humans = Z.humans();
    const target = Z.pickTarget(b, humans, t);
    // glow pulse / enrage
    const pulse = 0.8 + 0.25 * Math.sin(t * (def.id === 'inferno' ? 7 : 3));
    const telegraph = TELEGRAPH.has(B.state);
    b.model?.setGlow((telegraph ? 2.2 : 1) * pulse * (t < B.exposedUntil ? 1.8 : 1));
    if (!B.enraged && b.health < b.maxHealth * 0.4) {
      B.enraged = true;
      b.zSpeed *= 1.18;
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1 });
      g.hud?.centerPrint?.(`${def.name} IS ENRAGED!`, 2.5);
    }
    this.phases(b, t);
    if (!target) return;
    if (t < B.stunUntil) { B.status = 'STUNNED'; this.face(b, target.pm.origin, 2); return; }
    B.status = t < B.exposedUntil ? 'CORE EXPOSED' : B.enraged ? 'ENRAGED' : B.frenzy ? 'FRENZY' : '';
    if (B.state === 'intro') {
      this.face(b, target.pm.origin, 6);
      if (t >= B.until) B.state = 'chase';
      return;
    }
    switch (def.id) {
      case 'butcher': this.butcher(b, target, cmd, t); break;
      case 'spitter': this.spitter(b, target, cmd, t); break;
      case 'banshee': this.banshee(b, target, cmd, t); break;
      case 'inferno': this.inferno(b, target, cmd, t); break;
      case 'abomination': this.abomination(b, target, cmd, t); break;
      default: this.chaseAndHit(b, target, cmd, t);
    }
    if (t >= b.nextGrowl) {
      b.nextGrowl = t + rnd(4, 8);
      g.sound?.play(def.id === 'banshee' ? 'banshee_moan' : 'boss_growl', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
    }
  }

  /** Its phases (diff.boss.phases, by health): each passed adds its next move (or a frenzy). */
  phases(b, t) {
    const B = b.boss, P = this.Z.diff.boss.phases;
    while (B.phase < P.length && b.health < b.maxHealth * P[B.phase]) {
      B.phase++;
      const id = B.def.moves[B.phase - 1] || 'frenzy';
      if (id === 'frenzy') { if (!B.frenzy) { B.frenzy = true; b.zSpeed *= 1.08; } }
      else { B.moves.add(id); B.cd[id] = t + 1.5; } // (shown off soon after)
      // the new phase gets its moment: GUARD_K damage until its move has gone off once (GUARD_T at most)
      B.guardUntil = t + (id === 'frenzy' ? GUARD_T * 0.4 : GUARD_T); B.guardMove = GUARD_BY[id] || id;
      this.phaseShift(b, B.phase, id);
    }
  }

  /** A new phase: a roar over a shockwave (a shove, no damage), the banner (bossstage.js), the event. */
  phaseShift(b, phase, id) {
    const g = this.game, o = b.pm.origin;
    g.sound?.play('boss_phase', { volume: 0.95 });
    g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
    g.shakeAt?.(o, 8, 2200);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.fire?.emit(b.boss.def.id === 'inferno' ? 'fire' : 'dust', [o[0] + Math.cos(a) * 30, o[1] + Math.sin(a) * 30, o[2] - 28], [Math.cos(a) * 600, Math.sin(a) * 600, rnd(30, 120)], { life: 0.7, size: 20, size1: 54, drag: 2.6 });
    }
    for (const q of this.Z.humans()) {
      const dx = q.pm.origin[0] - o[0], dy = q.pm.origin[1] - o[1], d = Math.hypot(dx, dy);
      if (d > 280 || d < 1) continue;
      const k = 1 - d / 280;
      q.pm.velocity[0] += dx / d * 380 * k; q.pm.velocity[1] += dy / d * 380 * k; q.pm.velocity[2] += 160 * k;
    }
    this.stage.phase(b, phase, MOVES[id]);
    this.Z.events.mode('bossphase', { boss: b, id, phase });
  }

  has(B, move) { return B.moves.has(move); }
  ready(B, name, t) { return t >= (B.cd[name] || 0); }
  cool(B, name, t, s) {
    B.cd[name] = t + s * (B.enraged ? 0.7 : 1) * (B.frenzy ? 0.8 : 1);
    if (name === B.guardMove) B.guardUntil = 0; // (the phase's move has been seen: full damage again)
  }

  face(b, pos, maxTurn = 9) {
    const o = b.pm.origin;
    const yaw = Math.atan2(pos[1] - o[1], pos[0] - o[0]) / DEG;
    const d = angDiff(yaw, b.pm.angles[1]);
    b.pm.angles[1] += Math.max(-maxTurn, Math.min(maxTurn, d));
    b.pm.angles[0] = 0;
    return Math.abs(d);
  }

  sees(b, target) {
    const g = this.game, e = b.eyePos();
    e[2] += (b.boss.scale - 1) * 50;
    return g.visible(e, target.eyePos()) || g.visible(e, target.pm.origin);
  }

  /** Walk at the target along the flow field and claw / chop when in reach. */
  chaseAndHit(b, target, cmd, t, o = {}) {
    const B = b.boss, Z = this.Z;
    Z.chase(b, target, cmd, t);
    const d = dist2(b.pm.origin, target.pm.origin), dz = Math.abs(target.pm.origin[2] - b.pm.origin[2]);
    const reach = 34 + 40 * B.scale;
    const onHead = d < 44 && target.pm.origin[2] - b.pm.origin[2] > 40 && dz < 72 * B.scale + 30;
    if ((d < reach + 12 && dz < 70) || onHead) {
      this.face(b, target.pm.origin, 12);
      if (d < reach - 10) cmd.forwardmove = 0;
      if (!b.windup && t >= b.nextAttack) {
        b.windup = t + (o.windup ?? 0.38);
        b.lastShot = t;
        this.game.sound?.play(o.attackSound || 'boss_attack', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      }
    }
    if (b.windup && t >= b.windup) {
      b.windup = 0;
      b.nextAttack = t + (o.cooldown ?? 1.1) * (B.enraged ? 0.75 : 1);
      if (((d < reach + 30 && dz < 80) || onHead) && this.sees(b, target)) {
        this.hit(b, target, (o.damage ?? B.def.damage) * B.dmgK, o.knock ?? 220, o.weapon || 'zombie');
        o.onHit?.(target);
        if (o.combo && !b.comboed) { b.comboed = true; b.windup = t + 0.22; b.lastShot = t; return; }
      } else this.game.sound?.play('knife_slash', { pos: b.eyePos(), volume: 0.8 });
      b.comboed = false;
    }
  }

  hit(b, q, dmg, knock, weapon) {
    const g = this.game;
    const o = b.pm.origin, to = q.pm.origin;
    const l = dist2(o, to);
    const y = b.pm.angles[1] * Math.PI / 180; // right on top of him: thrown off forwards
    const dir = l > 4 ? [(to[0] - o[0]) / l, (to[1] - o[1]) / l, 0.2] : [Math.cos(y), Math.sin(y), 0.2];
    g.damagePlayer(q, b, dmg, CR.HITGROUP.CHEST, weapon, dir, [to[0] - dir[0] * 14, to[1] - dir[1] * 14, to[2] + 12]);
    q.pm.velocity[0] += dir[0] * knock; q.pm.velocity[1] += dir[1] * knock; q.pm.velocity[2] += knock * 0.45;
    q.pm.velocityModifier = Math.max(q.pm.velocityModifier ?? 1, 0.7);
    g.shakeAt?.(to, 4, 600);
  }

  /** Someone to aim a move at besides the target: the squad up and about (not down), nearest first, within r. */
  squadNear(o, r, out) {
    out.length = 0;
    for (const q of this.Z.humans()) if (!q.downed && dist2(q.pm.origin, o) < r) out.push(q);
    out.sort((a, c) => dist2(a.pm.origin, o) - dist2(c.pm.origin, o));
    return out;
  }

  /** The floor under pos (z), or pos[2] - 36 when there's none close. */
  floorZ(pos, up = 40) {
    const col = this.game.collision;
    _f0[0] = pos[0]; _f0[1] = pos[1]; _f0[2] = pos[2] + up;
    _f1[0] = pos[0]; _f1[1] = pos[1]; _f1[2] = pos[2] - 240;
    col.trace(_f0, _f1, ZERO, ZERO, MASK_WORLD_PLAYER, _tr);
    return _tr.fraction < 1 ? _tr.endpos[2] : pos[2] - 36;
  }

  // ---- THE BUTCHER: the charge; phase moves - MEAT HOOK (thrown on its chain, drags you in for a chop), BLOODLUST (charges twice)
  butcher(b, target, cmd, t) {
    const B = b.boss, g = this.game;
    const d = dist2(b.pm.origin, target.pm.origin);
    if (B.state === 'charge_wind') {
      this.face(b, target.pm.origin, 6);
      if (t >= B.until) {
        B.state = 'charging'; B.until = t + 1.7; B.chargeYaw = b.pm.angles[1]; B.chargeStart = t;
        b.progPos = b.pm.origin.slice(); b.progT = t;
        g.sound?.play('charge_go', { pos: b.eyePos(), volume: 1 });
      }
      return;
    }
    if (B.state === 'charging') {
      // a slight home-in, then straight on
      const want = Math.atan2(target.pm.origin[1] - b.pm.origin[1], target.pm.origin[0] - b.pm.origin[0]) / DEG;
      B.chargeYaw += Math.max(-0.35, Math.min(0.35, angDiff(want, B.chargeYaw)));
      b.pm.angles[1] = B.chargeYaw;
      b.pm.speedCap = 720;
      b.speedNow = 680;
      cmd.forwardmove = 1000;
      if (d < 46 * B.scale && Math.abs(target.pm.origin[2] - b.pm.origin[2]) < 70) {
        this.hit(b, target, 52 * B.dmgK, 650, 'zombie');
        g.sound?.play('charge_hit', { pos: target.pm.origin, volume: 1 });
        g.shakeAt?.(target.pm.origin, 12, 800);
        this.chargeOver(b, t);
        return;
      }
      const sp = Math.hypot(b.pm.velocity[0], b.pm.velocity[1]);
      if (t - B.chargeStart > 0.35 && sp < 200) {
        // into a wall: stunned
        g.sound?.play('charge_wall', { pos: b.pm.origin, volume: 1 });
        g.shakeAt?.(b.pm.origin, 10, 1000);
        B.stunUntil = t + 2.4;
        B.chained = false;
        B.state = 'chase'; this.cool(B, 'charge', t, 8);
        g.hud?.centerPrint?.('The Butcher is stunned - hit him now!', 2);
        return;
      }
      if (t >= B.until) this.chargeOver(b, t);
      return;
    }
    if (B.state === 'hook_wind') {
      this.face(b, target.pm.origin, 8);
      if (t >= B.until) this.throwHook(b, target, t);
      return;
    }
    if (B.state === 'hooking') { this.face(b, B.hook?.victim?.pm.origin || target.pm.origin, 6); return; } // (hookTick runs the chain)
    if (this.ready(B, 'charge', t) && d > 260 && d < 1150 && b.pm.onground && this.sees(b, target)) {
      B.state = 'charge_wind'; B.until = t + 0.9;
      this.lane(b, target, t, B.until, 1150);
      b.lastShot = t;
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (this.has(B, 'hook') && this.ready(B, 'hook', t) && d > 280 && d < 1000 && this.sees(b, target)) {
      B.state = 'hook_wind'; B.until = t + 0.75;
      b.lastShot = t;
      g.sound?.play('boss_hook_throw', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (!B.cd.charge) B.cd.charge = t + 3;
    this.chaseAndHit(b, target, cmd, t, { knock: 280, attackSound: 'cleaver_swing' });
  }

  /** A charge ran its course or landed: BLOODLUST winds up a second one at once. */
  chargeOver(b, t) {
    const B = b.boss;
    if (this.has(B, 'bloodlust') && !B.chained) {
      B.chained = true;
      B.state = 'charge_wind'; B.until = t + 0.55;
      const tg = this.Z.pickTarget(b, this.Z.humans(), t);
      if (tg) this.lane(b, tg, t, B.until, 1150);
      b.lastShot = t;
      this.game.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    B.chained = false;
    B.state = 'chase'; this.cool(B, 'charge', t, 8);
  }

  /** A charge's windup: the lane it will run down, on the floor (it homes in a little: step well aside). */
  lane(b, target, t, until, reach) {
    const o = b.pm.origin, to = target.pm.origin, dx = to[0] - o[0], dy = to[1] - o[1], l = Math.hypot(dx, dy) || 1;
    _c[0] = o[0]; _c[1] = o[1]; _c[2] = this.floorZ(o);
    _a[0] = dx / l; _a[1] = dy / l;
    this.stage.markLine(_c, _a, Math.min(reach, l + 260), 64 * b.boss.scale, t, until, b.boss.def.color);
  }

  /** The hook leaves his hand (from the side he throws with), straight at where you stand now. */
  hand(b, out) {
    const o = b.pm.origin, y = b.pm.angles[1] * DEG, s = b.boss.scale;
    out[0] = o[0] + Math.cos(y) * 16 * s + Math.sin(y) * 12 * s;
    out[1] = o[1] + Math.sin(y) * 16 * s - Math.cos(y) * 12 * s;
    out[2] = o[2] + 22 * s;
    return out;
  }

  throwHook(b, target, t) {
    const B = b.boss, o = this.hand(b, [0, 0, 0]), to = target.pm.origin;
    const aim = [to[0] + target.pm.velocity[0] * 0.15, to[1] + target.pm.velocity[1] * 0.15, to[2] + 8];
    const l = Math.hypot(aim[0] - o[0], aim[1] - o[1], aim[2] - o[2]) || 1;
    B.hook = { tip: o.slice(), dir: [(aim[0] - o[0]) / l, (aim[1] - o[1]) / l, (aim[2] - o[2]) / l], len: 0, max: 1100, victim: null, phase: 'fly', until: t + 1.2 };
    B.state = 'hooking';
    this.cool(B, 'hook', t, 9);
    this.game.sound?.play('boss_hook_throw', { pos: o, volume: 1 });
  }

  /** The hook in flight (it bites whoever it meets), pulling its catch in, or coming back. */
  hookTick(b, t) {
    const g = this.game, B = b.boss, k = B.hook, hand = this.hand(b, _c);
    if (k.phase === 'fly') {
      const step = 1500 * 0.01;
      _a[0] = k.tip[0]; _a[1] = k.tip[1]; _a[2] = k.tip[2];
      k.tip[0] += k.dir[0] * step; k.tip[1] += k.dir[1] * step; k.tip[2] += k.dir[2] * step;
      k.len += step;
      g.collision.trace(_a, k.tip, ZERO, ZERO, MASK_SHOT, _tr);
      if (_tr.fraction < 1 || k.len > k.max) { k.phase = 'back'; return; }
      for (const q of this.Z.humans()) {
        if (q.downed) continue;
        const qo = q.pm.origin;
        if (Math.hypot(qo[0] - k.tip[0], qo[1] - k.tip[1]) < 30 && k.tip[2] > qo[2] - 40 && k.tip[2] < qo[2] + 40) {
          k.victim = q; k.phase = 'pull'; k.until = t + 0.9;
          g.damagePlayer(q, b, 14 * B.dmgK, CR.HITGROUP.CHEST, 'zombie', k.dir, [qo[0], qo[1], qo[2] + 10]);
          g.sound?.play('boss_hook_hit', { pos: qo, volume: 1 });
          g.shakeAt?.(qo, 8, 500);
          if (q.isLocal) g.hud?.centerPrint?.('HOOKED! Brace for the cleaver!', 1.5, 'alert');
          return;
        }
      }
      return;
    }
    if (k.phase === 'pull') {
      const q = k.victim, qo = q.pm.origin;
      k.tip[0] = qo[0]; k.tip[1] = qo[1]; k.tip[2] = qo[2] + 8;
      const dx = b.pm.origin[0] - qo[0], dy = b.pm.origin[1] - qo[1], d = Math.hypot(dx, dy) || 1;
      if (!q.alive || q.downed || d < 70 + 20 * B.scale || t >= k.until) {
        this.dropHook(b);
        b.nextAttack = t; b.windup = 0; // (reeled in: the cleaver comes down at once)
        B.state = 'chase';
        return;
      }
      q.pm.velocity[0] = dx / d * 640; q.pm.velocity[1] = dy / d * 640;
      if (q.pm.onground) q.pm.velocity[2] = Math.max(q.pm.velocity[2], 90);
      return;
    }
    // back to his hand
    const dx = hand[0] - k.tip[0], dy = hand[1] - k.tip[1], dz = hand[2] - k.tip[2], d = Math.hypot(dx, dy, dz);
    if (d < 40) { this.dropHook(b); if (B.state === 'hooking') B.state = 'chase'; return; }
    const s = Math.min(1, 2400 * 0.01 / d);
    k.tip[0] += dx * s; k.tip[1] += dy * s; k.tip[2] += dz * s;
  }

  dropHook(b) { b.boss.hook = null; if (b.boss.state === 'hooking') b.boss.state = 'chase'; }

  // ---- THE SPITTER: acid volleys and broods; phase moves - ACID RAIN (circles of acid fall round you), ACID WAVE (a river of acid runs at you)
  spitter(b, target, cmd, t) {
    const B = b.boss, g = this.game, Z = this.Z;
    const o = b.pm.origin, d = dist2(o, target.pm.origin);
    // brood bursts at 75 / 50 / 25 %
    const frac = b.health / b.maxHealth;
    const marks = [0.75, 0.5, 0.25];
    if (B.brood < marks.length && frac < marks[B.brood]) {
      B.brood++;
      g.sound?.play('spitter_burst', { pos: b.eyePos(), volume: 1 });
      g.fire?.ignite(o, b, { kind: 'acid', radius: 95, duration: 5, dps: 18, weapon: 'acid', burn: 0 });
      for (let i = 0; i < 3 + B.cycle; i++) Z.spawnZombie({ near: o, health: 70, speed: rnd(262, 285), crawler: true });
    }
    if (B.state === 'spit_up') {
      this.face(b, target.pm.origin, 10);
      if (t >= B.until) {
        B.state = 'chase';
        const n = B.enraged ? 5 : 3;
        for (let i = 0; i < n; i++) this.lob(b, target, 'acid', 0.6, i === 0 ? 0 : rnd(40, 110), 22 * B.dmgK);
        g.sound?.play('spit', { pos: b.eyePos(), volume: 1 });
        this.cool(B, 'spit', t, 2.6);
      }
      return;
    }
    if (B.state === 'rain_up') {
      this.face(b, target.pm.origin, 10);
      if (t >= B.until) {
        B.state = 'chase';
        for (const p of B.rain) this.lobAt(b, p, 0.6, 20 * B.dmgK, 0.95);
        g.sound?.play('spit', { pos: b.eyePos(), volume: 1 });
        this.cool(B, 'rain', t, 11);
        this.cool(B, 'spit', t, 2);
      }
      return;
    }
    if (B.state === 'wave_up') {
      this.face(b, B.waveAim, 12);
      if (t >= B.until) {
        B.state = 'chase';
        const a = B.acid = B.waveSpec;
        a.next = 0; a.d = 40; a.hit = 0;
        g.sound?.play('spitter_burst', { pos: b.eyePos(), volume: 1 });
        this.cool(B, 'wave', t, 12);
        this.cool(B, 'spit', t, 2);
      }
      return;
    }
    const sees = this.sees(b, target);
    if (this.has(B, 'rain') && this.ready(B, 'rain', t) && sees && d > 200 && d < 1100) { this.rainUp(b, target, t); return; }
    if (this.has(B, 'wave') && this.ready(B, 'wave', t) && sees && d > 220 && d < 950 && b.pm.onground) { this.waveUp(b, target, t); return; }
    if (sees && this.ready(B, 'spit', t) && d > 160 && d < 1100) {
      B.state = 'spit_up'; B.until = t + 0.55; b.lastShot = t;
      g.sound?.play('spitter_hurl', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (sees && d < 380) {
      // too close: back off (and claw if cornered)
      const away = Math.atan2(o[1] - target.pm.origin[1], o[0] - target.pm.origin[0]) / DEG;
      b.pm.angles[1] = away;
      cmd.forwardmove = 400;
      if (Math.hypot(b.pm.velocity[0], b.pm.velocity[1]) < 40 && d < 120) this.chaseAndHit(b, target, cmd, t);
      return;
    }
    if (sees && d < 750) { this.face(b, target.pm.origin, 8); Z.separate(b, cmd); cmd.sidemove = Math.sin(t * 1.3) * 200; return; }
    this.chaseAndHit(b, target, cmd, t);
  }

  /** ACID RAIN's windup: six circles on the floor round you (and a teammate near you), where the globs will land. */
  rainUp(b, target, t) {
    const B = b.boss, g = this.game, rgb = B.def.color;
    B.state = 'rain_up'; B.until = t + 1.0; b.lastShot = t;
    const to = target.pm.origin, pts = B.rain || (B.rain = []);
    pts.length = 0;
    const c = [to[0] + target.pm.velocity[0] * 0.5, to[1] + target.pm.velocity[1] * 0.5, to[2]];
    pts.push(c);
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i / 5) * Math.PI * 2, r = rnd(150, 250);
      pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, to[2]]);
    }
    for (const p of pts) { p[2] = this.floorZ(p); this.stage.mark(p, 85, t, t + 1.0 + 0.95, rgb); }
    g.sound?.play('spitter_hurl', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
    g.sound?.play('boss_telegraph', { pos: c, volume: 0.8 });
  }

  /** ACID WAVE's windup: the line it will run along, marked on the floor. */
  waveUp(b, target, t) {
    const B = b.boss, g = this.game, o = b.pm.origin, to = target.pm.origin;
    const dx = to[0] - o[0], dy = to[1] - o[1], l = Math.hypot(dx, dy) || 1;
    const L = Math.min(1100, l + 260);
    B.state = 'wave_up'; B.until = t + 0.8; b.lastShot = t;
    B.waveAim = to.slice();
    B.waveSpec = { o: [o[0], o[1], o[2] - 36], dir: [dx / l, dy / l], L, d: 0, next: 0, hit: 0, z: o[2] - 36 };
    this.stage.markLine(B.waveSpec.o, B.waveSpec.dir, L, 70, t, t + 0.8 + L / 900, B.def.color);
    g.sound?.play('spitter_hurl', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
    g.sound?.play('boss_telegraph', { pos: o, volume: 0.8 });
  }

  /** The acid wave runs on: a pool every step, a splash on whoever it reaches (once each); a wall stops it. */
  acidTick(b) {
    const g = this.game, B = b.boss, a = B.acid;
    const d0 = a.d;
    a.d += 900 * 0.01;
    const x = a.o[0] + a.dir[0] * a.d, y = a.o[1] + a.dir[1] * a.d;
    _a[0] = a.o[0] + a.dir[0] * d0; _a[1] = a.o[1] + a.dir[1] * d0; _a[2] = a.z + 24;
    _b[0] = x; _b[1] = y; _b[2] = a.z + 24;
    g.collision.trace(_a, _b, ZERO, ZERO, MASK_WORLD_PLAYER, _tr);
    if (_tr.fraction < 1 || a.d > a.L) { B.acid = null; return; }
    _b[2] = a.z + 30;
    const fz = this.floorZ(_b, 0);
    if (Math.abs(fz - a.z) > 60) { B.acid = null; return; } // (off a ledge)
    a.z = fz;
    if (a.d >= a.next) {
      a.next = a.d + 55;
      g.fire?.ignite([x, y, fz + 2], b, { kind: 'acid', radius: 44, duration: 4, dps: 18, weapon: 'acid', burn: 0, quiet: a.next % 220 > 60 });
    }
    for (let i = 0; i < 3; i++) g.fire?.emit('acid', [x + rnd(-20, 20), y + rnd(-20, 20), fz + 4], [rnd(-60, 60), rnd(-60, 60), rnd(120, 260)], { life: rnd(0.4, 0.7), size: rnd(6, 10), size1: rnd(14, 22), drag: 1.2, buoy: -500 });
    let i = 0;
    for (const q of this.Z.humans()) {
      const bit = 1 << (i++ & 31);
      if (a.hit & bit || q.downed) continue;
      if (Math.hypot(q.pm.origin[0] - x, q.pm.origin[1] - y) < 56 && Math.abs(q.pm.origin[2] - 36 - fz) < 60) {
        a.hit |= bit;
        g.fire?.hurt(q, b, 16 * B.dmgK, 'acid', 'acid', [x, y, fz]);
        g.sound?.play('acid_splash', { pos: q.pm.origin, volume: 0.9 });
      }
    }
  }

  /** A lobbed projectile at the target (led, with some spread). */
  lob(b, target, type, gravity, spread, damage) {
    const to = target.pm.origin;
    const e = b.eyePos();
    const T = Math.max(0.55, Math.min(1.4, Math.hypot(to[0] - e[0], to[1] - e[1]) / 650));
    const a = Math.random() * Math.PI * 2;
    this.lobAt(b, [to[0] + target.pm.velocity[0] * T * 0.8 + Math.cos(a) * spread, to[1] + target.pm.velocity[1] * T * 0.8 + Math.sin(a) * spread, to[2] - 30], gravity, damage, T, type);
  }

  /** A lobbed projectile landing on a point in T s. */
  lobAt(b, aim, gravity, damage, T = 1, type = 'acid') {
    const e = b.eyePos();
    e[2] += (b.boss.scale - 1) * 45;
    const G = gravity * 800;
    const vel = [(aim[0] - e[0]) / T, (aim[1] - e[1]) / T, (aim[2] - e[2] + 0.5 * G * T * T) / T];
    this.game.projectiles.launch(type, b, e, vel, { damage });
  }

  // ---- THE BANSHEE: the claws, the blink, the scream; phase moves - PHANTOM STRIKE (blinks in behind you and strikes), WAIL OF THE PACK (sprinters answer)
  banshee(b, target, cmd, t) {
    const B = b.boss, g = this.game, Z = this.Z;
    const d = dist2(b.pm.origin, target.pm.origin);
    if (B.state === 'scream_up') {
      this.face(b, target.pm.origin, 10);
      if (t >= B.until) {
        B.state = 'chase';
        this.scream(b);
        this.cool(B, 'scream', t, 12);
      }
      return;
    }
    if (B.state === 'ambush') {
      // right behind you, a breath of a whisper, then the strike (turn and dodge, or shoot her off)
      this.face(b, target.pm.origin, 14);
      if (t >= B.until) {
        B.state = 'chase';
        const dd = dist2(b.pm.origin, target.pm.origin);
        if (dd < 34 + 40 * B.scale + 50 && Math.abs(target.pm.origin[2] - b.pm.origin[2]) < 80 && this.sees(b, target)) {
          this.hit(b, target, B.def.damage * 1.6 * B.dmgK, 300, 'zombie');
          g.sound?.play('banshee_attack', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
        } else g.sound?.play('knife_slash', { pos: b.eyePos(), volume: 0.8 });
        b.nextAttack = t + 0.6;
      }
      return;
    }
    if (B.state === 'pack_up') {
      this.face(b, target.pm.origin, 10);
      const o = b.pm.origin;
      if (Math.random() < 0.6) g.fire?.emit('mist', [o[0] + rnd(-40, 40), o[1] + rnd(-40, 40), o[2] + rnd(-20, 50)], [rnd(-40, 40), rnd(-40, 40), rnd(40, 120)], { life: 0.9, size: 18, size1: 50, drag: 1.5 });
      if (t >= B.until) {
        B.state = 'chase';
        g.sound?.play('banshee_scream', { pos: b.eyePos(), volume: 0.8 });
        Z.specials.spawn('sprinter', { near: o.slice(), extra: true, max: 2 + Math.min(2, B.cycle) });
        this.blink(b, target);
        this.cool(B, 'pack', t, 18);
        this.cool(B, 'blink', t, 4);
      }
      return;
    }
    const sees = this.sees(b, target);
    if (!sees) B.unseen = (B.unseen || 0) + 0.01; else B.unseen = 0;
    if (this.has(B, 'ambush') && this.ready(B, 'ambush', t) && d > 260) {
      if (!this.blink(b, target)) { B.cd.ambush = t + 2; return this.chaseAndHit(b, target, cmd, t); } // (nowhere to come out: later)
      B.state = 'ambush'; B.until = t + 0.5; b.lastShot = t;
      this.cool(B, 'ambush', t, 9); this.cool(B, 'blink', t, 4); B.recent = 0;
      g.sound?.play('banshee_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (this.has(B, 'pack') && this.ready(B, 'pack', t) && d < 900) {
      B.state = 'pack_up'; B.until = t + 0.9; b.lastShot = t;
      g.sound?.play('banshee_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    // blink: hurt badly, lost sight of you, or just because
    if (this.ready(B, 'blink', t) && (B.recent > 160 || B.unseen > 2.5 || (d > 500 && Math.random() < 0.004))) {
      if (this.blink(b, target)) { this.cool(B, 'blink', t, 5); B.recent = 0; return; }
    }
    if (this.ready(B, 'scream', t) && sees && d < 650) {
      B.state = 'scream_up'; B.until = t + 1.0; b.lastShot = t;
      this.stage.mark([b.pm.origin[0], b.pm.origin[1], this.floorZ(b.pm.origin)], 720, t, B.until, B.def.color); // (out of the ring, or it hurts)
      g.sound?.play('banshee_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (!B.cd.scream) B.cd.scream = t + 6;
    this.chaseAndHit(b, target, cmd, t, { windup: 0.22, cooldown: 0.9, combo: true, knock: 120, attackSound: 'banshee_attack' });
  }

  scream(b) {
    const g = this.game, Z = this.Z, B = b.boss;
    const o = b.pm.origin;
    g.sound?.play('banshee_scream', { pos: b.eyePos(), volume: 1, attenuation: 'none' });
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      g.fire?.emit('mist', [o[0] + Math.cos(a) * 30, o[1] + Math.sin(a) * 30, o[2] + 30], [Math.cos(a) * 500, Math.sin(a) * 500, 0], { life: 0.9, size: 30, size1: 120, drag: 2.5 });
    }
    for (const q of Z.humans()) {
      const dd = Math.hypot(q.pm.origin[0] - o[0], q.pm.origin[1] - o[1], q.pm.origin[2] - o[2]);
      if (dd > 720) continue;
      const k = 1 - dd / 720;
      g.damagePlayer(q, b, (10 + 22 * k) * B.dmgK, CR.HITGROUP.GENERIC, 'scream', null, null, { blast: true });
      q.pm.velocityModifier = 0.35;
      if (q.isLocal) {
        g.addShake?.(6 + 8 * k, 1.4);
        q.flashStart = g.time; q.flashFull = g.time + 0.1; q.flashUntil = g.time + 0.9; q.flashMax = 0.35 + 0.3 * k;
      }
    }
    // the pack answers
    for (let i = 0; i < 4 + B.cycle; i++) Z.spawnZombie({ near: o, health: Math.round(Z.stats.health * 0.8), speed: rnd(258, 280) });
  }

  /** Vanish in a puff and reappear near (preferably behind) the target. */
  blink(b, target) {
    const g = this.game, nav = g.nav;
    const to = target.pm.origin;
    const tf = target.feet();
    const start = nav.nearest(tf, 200) || nav.nearestXY(tf, 260, 120);
    if (!start) return false;
    const ring = nav.around(start, 520, 900).filter((x) => x.dist > 220 && x.dist < 520);
    if (!ring.length) return false;
    const fy = target.pm.angles[1] * DEG;
    let best = null, bs = -Infinity;
    for (let i = 0; i < 24; i++) {
      const c = ring[Math.floor(Math.random() * ring.length)].node;
      const behind = -((c.x - to[0]) * Math.cos(fy) + (c.y - to[1]) * Math.sin(fy)) / Math.max(1, Math.hypot(c.x - to[0], c.y - to[1]));
      const s = behind + Math.random() * 0.4;
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) return false;
    const o = b.pm.origin;
    const puff = (p) => { for (let i = 0; i < 18; i++) g.fire?.emit('mist', [p[0] + rnd(-20, 20), p[1] + rnd(-20, 20), p[2] + rnd(-30, 40)], [rnd(-90, 90), rnd(-90, 90), rnd(-20, 80)], { life: rnd(0.8, 1.4), size: 26, size1: 70, drag: 2 }); };
    puff(o);
    g.sound?.play('banshee_blink', { pos: o.slice(), volume: 1 });
    b.pm.origin = [best.x, best.y, best.z + 37];
    b.prevOrigin = b.pm.origin.slice();
    b.pm.velocity = [0, 0, 0];
    b.progPos = b.pm.origin.slice(); b.progT = g.time;
    b.node = null; b.goal = null;
    setDynamicBox(b.box, b.pm.origin, b.hull().mins, b.hull().maxs);
    puff(b.pm.origin);
    g.sound?.play('banshee_blink', { pos: b.pm.origin.slice(), volume: 1 });
    this.face(b, to, 180);
    return true;
  }

  // ---- THE INFERNO: the aura, fireballs, the nova; phase moves - METEOR SHOWER (fire from the sky on marked circles), BLAZING CHARGE (a charge that leaves fire behind)
  inferno(b, target, cmd, t) {
    const B = b.boss, g = this.game, F = g.fire;
    const o = b.pm.origin, d = dist2(o, target.pm.origin);
    // body on fire, burning footprints, a burning aura
    if (F) {
      for (let i = 0; i < 2; i++) F.emit('fire', [o[0] + rnd(-12, 12), o[1] + rnd(-12, 12), o[2] - 30 + rnd(0, 90)], [rnd(-15, 15), rnd(-15, 15), rnd(40, 90)], { life: rnd(0.3, 0.55), size: rnd(12, 20), size1: 5, buoy: 90, frame: 1 });
      if (Math.random() < 0.05) F.emit('smoke', [o[0], o[1], o[2] + 60], [0, 0, 40], { life: 2, size: 30, size1: 80, buoy: 20 });
      if (t >= B.trailT && Math.hypot(b.pm.velocity[0], b.pm.velocity[1]) > 60 && b.pm.onground) {
        B.trailT = t + (B.state === 'blazing' ? 0.1 : 0.55);
        F.ignite([o[0], o[1], o[2] - 30], b, { radius: B.state === 'blazing' ? 40 : 30, duration: B.state === 'blazing' ? 5 : 4, dps: 16 * B.dmgK, weapon: 'fireball', quiet: true, burn: 1.5 });
      }
      if (t >= B.auraT) {
        B.auraT = t + 0.25;
        for (const q of this.Z.humans()) if (Math.hypot(q.pm.origin[0] - o[0], q.pm.origin[1] - o[1], q.pm.origin[2] - o[2]) < 120) { F.hurt(q, b, 4 * B.dmgK, 'fireball', 'fire', o); F.burn(q, b, 1.5, 12 * B.dmgK, 'fireball'); }
      }
    }
    if (B.state === 'fire_up') {
      this.face(b, target.pm.origin, 10);
      if (t >= B.until) {
        B.state = 'chase';
        const e = b.eyePos(); e[2] += 20;
        const to = target.eyePos();
        const T = Math.max(0.3, Math.hypot(to[0] - e[0], to[1] - e[1]) / 900);
        const aim = [to[0] + target.pm.velocity[0] * T * 0.7, to[1] + target.pm.velocity[1] * T * 0.7, to[2] - 20];
        const l = Math.hypot(aim[0] - e[0], aim[1] - e[1], aim[2] - e[2]) || 1;
        const sp = 900;
        g.projectiles.launch('fireball', b, e, [(aim[0] - e[0]) / l * sp, (aim[1] - e[1]) / l * sp, (aim[2] - e[2]) / l * sp], { damage: 35 * B.dmgK });
        g.sound?.play('fireball_throw', { pos: e, volume: 1 });
        this.cool(B, 'fireball', t, 2.8);
      }
      return;
    }
    if (B.state === 'nova_up') {
      for (let i = 0; i < 3; i++) F?.emit('fire', [o[0] + rnd(-40, 40), o[1] + rnd(-40, 40), o[2] - 30], [rnd(-60, 60), rnd(-60, 60), rnd(100, 200)], { life: 0.5, size: 18, size1: 6, buoy: 100 });
      if (t >= B.until) {
        B.state = 'chase';
        g.explode(o, { owner: b, damage: 35 * B.dmgK, radius: 320, weapon: 'fireball', sound: 'rocket_explode', scale: 1.2, shake: 8, fire: true, noGore: true });
        for (const [r, n] of [[150, 8], [280, 14]]) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            g.fire?.ignite([o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r, o[2]], b, { radius: 45, duration: 5, dps: 22 * B.dmgK, weapon: 'fireball', quiet: i % 3 !== 0 });
          }
        }
        this.cool(B, 'nova', t, 14);
      }
      return;
    }
    if (B.state === 'meteor_up') {
      this.face(b, target.pm.origin, 8);
      for (let i = 0; i < 2; i++) F?.emit('fire', [o[0] + rnd(-20, 20), o[1] + rnd(-20, 20), o[2] + 40 + rnd(0, 40)], [rnd(-30, 30), rnd(-30, 30), rnd(300, 500)], { life: 0.5, size: 16, size1: 6, buoy: 200 });
      if (t >= B.until) {
        B.state = 'chase';
        for (const p of B.meteors) this.meteor(b, p, t);
        this.cool(B, 'meteor', t, 12);
        this.cool(B, 'fireball', t, 2.5);
      }
      return;
    }
    if (B.state === 'blaze_wind') {
      this.face(b, target.pm.origin, 6);
      if (t >= B.until) { B.state = 'blazing'; B.until = t + 1.4; B.chargeYaw = b.pm.angles[1]; B.chargeStart = t; g.sound?.play('fireball_throw', { pos: b.eyePos(), volume: 1 }); }
      return;
    }
    if (B.state === 'blazing') { this.blazing(b, target, cmd, t); return; }
    const sees = this.sees(b, target);
    if ((this.ready(B, 'nova', t) && (b.health < b.maxHealth * 0.5 || B.novaDone) && d < 500)) {
      B.novaDone = true;
      B.state = 'nova_up'; B.until = t + 1.2; b.lastShot = t;
      this.stage.mark([o[0], o[1], this.floorZ(o)], 320, t, B.until, B.def.color);
      g.sound?.play('inferno_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (this.has(B, 'meteor') && this.ready(B, 'meteor', t) && d < 1400) { this.meteorUp(b, target, t); return; }
    if (this.has(B, 'blaze') && this.ready(B, 'blaze', t) && sees && d > 300 && d < 1100 && b.pm.onground) {
      B.state = 'blaze_wind'; B.until = t + 0.8; b.lastShot = t;
      this.lane(b, target, t, B.until, 950);
      g.sound?.play('inferno_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 0.8 });
      return;
    }
    if (sees && this.ready(B, 'fireball', t) && d > 220 && d < 1500) {
      B.state = 'fire_up'; B.until = t + 0.6; b.lastShot = t;
      g.sound?.play('inferno_charge', { pos: b.eyePos(), volume: 0.8, channel: `${b.id}:voice` });
      return;
    }
    this.chaseAndHit(b, target, cmd, t, { knock: 200, weapon: 'fireball', attackSound: 'boss_attack', onHit: (q) => F?.burn(q, b, 3, 15 * B.dmgK, 'fireball') });
  }

  /** METEOR SHOWER's windup: circles where fire will fall - under the squad's feet (led) and next to the target. */
  meteorUp(b, target, t) {
    const B = b.boss, g = this.game, pts = B.meteors || (B.meteors = []), near = this.squadNear(b.pm.origin, 1500, this._near || (this._near = []));
    pts.length = 0;
    for (const q of near) {
      if (pts.length >= 3) break;
      const o = q.pm.origin;
      pts.push([o[0] + q.pm.velocity[0] * 0.9, o[1] + q.pm.velocity[1] * 0.9, o[2]]);
    }
    const to = target.pm.origin, a = Math.random() * Math.PI * 2;
    pts.push([to[0] + Math.cos(a) * 150, to[1] + Math.sin(a) * 150, to[2]]);
    B.state = 'meteor_up'; B.until = t + 1.1; b.lastShot = t;
    for (const p of pts) { p[2] = this.floorZ(p); this.stage.mark(p, 120, t, B.until + 0.7, B.def.color); }
    g.sound?.play('inferno_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
    g.sound?.play('boss_telegraph', { pos: pts[0], volume: 0.8 });
  }

  /** A fireball straight down onto p from the sky (or the ceiling). */
  meteor(b, p) {
    const g = this.game;
    _a[0] = p[0]; _a[1] = p[1]; _a[2] = p[2] + 20;
    _b[0] = p[0]; _b[1] = p[1]; _b[2] = p[2] + 640;
    g.collision.trace(_a, _b, ZERO, ZERO, MASK_SHOT, _tr);
    const top = Math.max(p[2] + 120, _tr.endpos[2] - 16);
    const T = 0.7;
    g.projectiles.launch('fireball', b, [p[0], p[1], top], [0, 0, -(top - p[2]) / T], { damage: 30 * b.boss.dmgK });
    g.sound?.play('boss_meteor', { pos: [p[0], p[1], p[2] + 60], volume: 0.9 });
  }

  /** BLAZING CHARGE: a dash that sets the floor alight behind him; into a wall, he's stunned. */
  blazing(b, target, cmd, t) {
    const B = b.boss, g = this.game, o = b.pm.origin;
    const want = Math.atan2(target.pm.origin[1] - o[1], target.pm.origin[0] - o[0]) / DEG;
    B.chargeYaw += Math.max(-0.3, Math.min(0.3, angDiff(want, B.chargeYaw)));
    b.pm.angles[1] = B.chargeYaw;
    b.pm.speedCap = 660;
    b.speedNow = 620;
    cmd.forwardmove = 1000;
    for (const q of this.Z.humans()) {
      if (q.downed) continue;
      if (dist2(o, q.pm.origin) < 46 * B.scale && Math.abs(q.pm.origin[2] - o[2]) < 70) {
        this.hit(b, q, 30 * B.dmgK, 560, 'fireball');
        g.fire?.burn(q, b, 3, 15 * B.dmgK, 'fireball');
        g.sound?.play('charge_hit', { pos: q.pm.origin, volume: 1 });
        B.state = 'chase'; this.cool(B, 'blaze', t, 10);
        return;
      }
    }
    if (t - B.chargeStart > 0.35 && Math.hypot(b.pm.velocity[0], b.pm.velocity[1]) < 200) {
      g.sound?.play('charge_wall', { pos: o, volume: 1 });
      g.shakeAt?.(o, 9, 1000);
      B.stunUntil = t + 1.8;
      B.state = 'chase'; this.cool(B, 'blaze', t, 10);
      return;
    }
    if (t >= B.until) { B.state = 'chase'; this.cool(B, 'blaze', t, 10); }
  }

  // ---- THE ABOMINATION: armour, the slam, raising the dead; phase moves - AFTERSHOCK (a second, wider slam), EARTHSHAKER (leaps at you and slams down)
  abomination(b, target, cmd, t) {
    const B = b.boss, g = this.game;
    const o = b.pm.origin, d = dist2(o, target.pm.origin);
    if (B.state === 'slam_up' || B.state === 'after_up') {
      this.face(b, target.pm.origin, 5);
      for (let i = 0; i < 2; i++) g.fire?.emit('dust', [o[0] + rnd(-30, 30), o[1] + rnd(-30, 30), o[2] - 34], [rnd(-40, 40), rnd(-40, 40), rnd(10, 40)], { life: 0.8, size: 16, size1: 40, drag: 2 });
      if (t >= B.until) {
        const after = B.state === 'after_up';
        B.state = 'chase';
        this.slam(b, after ? 560 : 430, after ? 0.8 : 1);
        B.exposedUntil = t + 2.8;
        this.cool(B, 'slam', t, B.enraged ? 4.5 : 7);
        if (!after && this.has(B, 'aftershock')) {
          // the ground keeps going: a second, wider ring - jump again
          B.state = 'after_up'; B.until = t + 0.95; b.lastShot = t;
          this.stage.mark([o[0], o[1], this.floorZ(o)], 560, t, B.until, B.def.color);
        }
      }
      return;
    }
    if (B.state === 'leap_up') {
      this.face(b, B.landAt, 8);
      if (Math.random() < 0.5) g.fire?.emit('dust', [o[0] + rnd(-30, 30), o[1] + rnd(-30, 30), o[2] - 34], [rnd(-60, 60), rnd(-60, 60), rnd(10, 60)], { life: 0.8, size: 16, size1: 40, drag: 2 });
      if (t >= B.until) this.leap(b, t);
      return;
    }
    if (B.state === 'leap_air') {
      cmd.forwardmove = 0;
      b.pm.speedCap = 1600;
      if ((b.pm.onground && t - B.leapT > 0.2) || t - B.leapT > 2.2) {
        B.state = 'chase'; B.landAt = null;
        this.slam(b, 330, 1.1);
        this.game.sound?.play('boss_quake', { pos: o, volume: 1 });
        B.exposedUntil = t + 2.5;
        this.cool(B, 'leap', t, 13);
      }
      return;
    }
    if (B.state === 'raise_up') {
      if (Math.random() < 0.5) g.fire?.emit('mist', [o[0] + rnd(-50, 50), o[1] + rnd(-50, 50), o[2] + rnd(0, 60)], [0, 0, rnd(30, 90)], { life: 1, size: 20, size1: 50, buoy: 20 });
      if (t >= B.until) {
        B.state = 'chase';
        this.raiseDead(b);
        B.exposedUntil = t + 2.5;
        this.cool(B, 'raise', t, 16);
      }
      return;
    }
    if (this.ready(B, 'slam', t) && d < 360 && Math.abs(target.pm.origin[2] - o[2]) < 80 && b.pm.onground) {
      B.state = 'slam_up'; B.until = t + 1.1; b.lastShot = t;
      this.stage.mark([o[0], o[1], this.floorZ(o)], 430, t, B.until, B.def.color);
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (this.has(B, 'leap') && this.ready(B, 'leap', t) && d > 380 && d < 1200 && b.pm.onground && Math.abs(target.pm.origin[2] - o[2]) < 150 && this.sees(b, target)) {
      const to = target.pm.origin;
      B.landAt = [to[0] + target.pm.velocity[0] * 0.4, to[1] + target.pm.velocity[1] * 0.4, to[2]];
      B.landAt[2] = this.floorZ(B.landAt);
      B.state = 'leap_up'; B.until = t + 0.8; b.lastShot = t;
      this.stage.mark(B.landAt, 330, t, t + 0.8 + 1.0, B.def.color);
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      g.sound?.play('boss_telegraph', { pos: B.landAt, volume: 0.8 });
      return;
    }
    if (this.ready(B, 'raise', t) && t > (B.cd.firstRaise ??= t + 6)) {
      B.state = 'raise_up'; B.until = t + 1.4;
      g.sound?.play('abom_raise', { pos: b.eyePos(), volume: 1 });
      return;
    }
    this.chaseAndHit(b, target, cmd, t, { knock: 420, windup: 0.5, cooldown: 1.4, attackSound: 'boss_attack' });
  }

  /** EARTHSHAKER: a ballistic leap onto the marked spot (the hunter's pounce, at his size). */
  leap(b, t) {
    const B = b.boss, o = b.pm.origin, to = B.landAt;
    const dx = to[0] - o[0], dy = to[1] - o[1], dz = to[2] + 37 - o[2];
    const T = Math.max(0.75, Math.min(1.1, Math.hypot(dx, dy) / 700));
    b.pm.velocity = [dx / T, dy / T, (dz + 0.5 * 800 * T * T) / T];
    b.pm.onground = false;
    b.pm.speedCap = 1600;
    B.state = 'leap_air'; B.leapT = t;
    this.game.sound?.play('charge_go', { pos: b.eyePos(), volume: 1 });
  }

  /** The ground slam: a shockwave out to R (jump it), k x its damage. */
  slam(b, R = 430, k = 1) {
    const g = this.game, B = b.boss, o = b.pm.origin;
    g.sound?.play('slam', { pos: o, volume: 1, attenuation: 'none' });
    g.shakeAt?.(o, 14, 1400);
    const n = Math.round(40 * R / 430);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.fire?.emit('dust', [o[0] + Math.cos(a) * 30, o[1] + Math.sin(a) * 30, o[2] - 30], [Math.cos(a) * 520 * R / 430, Math.sin(a) * 520 * R / 430, rnd(20, 80)], { life: 0.9, size: 22, size1: 60, drag: 2.2 });
    }
    g.effects.decal?.('decal_scorch', [o[0], o[1], o[2] - 35], [0, 0, 1], 160);
    for (const q of this.Z.humans()) {
      const dd = Math.hypot(q.pm.origin[0] - o[0], q.pm.origin[1] - o[1]);
      if (dd > R || Math.abs(q.pm.origin[2] - o[2]) > 90) continue;
      if (!q.pm.onground) continue; // jumped it
      const kk = 1 - dd / R;
      const dir = [(q.pm.origin[0] - o[0]) / (dd || 1), (q.pm.origin[1] - o[1]) / (dd || 1), 0.6];
      g.damagePlayer(q, b, (15 + 40 * kk) * B.dmgK * k, CR.HITGROUP.GENERIC, 'slam', dir, null, { blast: true });
      q.pm.velocity[0] += dir[0] * 320 * kk; q.pm.velocity[1] += dir[1] * 320 * kk; q.pm.velocity[2] += 300 + 120 * kk;
    }
  }

  raiseDead(b) {
    const g = this.game, Z = this.Z, o = b.pm.origin;
    const want = 6 + b.boss.cycle * 2;
    let n = 0;
    const recs = (g.gore?.records || []).filter((r) => COMMON_SKINS.has(r.skin) && dist2(r.center, o) < 900).sort((a, c) => dist2(a.center, o) - dist2(c.center, o));
    // they claw their way up out of the floor beside the bodies (which stay where they are)
    for (const r of recs) {
      if (n >= want) break;
      const at = this.standBeside(r.center);
      if (!at) continue;
      if (!Z.spawnZombie({ at, health: Math.round(Z.stats.health * 0.7), risen: true })) break;
      n++;
    }
    for (; n < want; n++) if (!Z.spawnZombie({ near: o, health: Math.round(Z.stats.health * 0.7), risen: true })) break;
    g.sound?.play('abom_raise', { pos: o, volume: 1 });
  }

  /** A free standing spot (player origin) right next to a body on the floor, or null. */
  standBeside(c) {
    const col = this.game.collision, mins = [-16, -16, -36], maxs = [16, 16, 36];
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      const a = a0 + k * Math.PI / 3;
      const p = [c[0] + Math.cos(a) * 30, c[1] + Math.sin(a) * 30, c[2] + 44];
      col.trace(p, p, mins, maxs, MASK_WORLD_PLAYER, _tr);
      if (_tr.startsolid || _tr.allsolid) continue;
      // settle onto the floor below
      col.trace(p, [p[0], p[1], p[2] - 64], mins, maxs, MASK_WORLD_PLAYER, _tr);
      if (_tr.fraction < 1 && _tr.normal[2] > 0.7) return [_tr.endpos[0], _tr.endpos[1], _tr.endpos[2] + 1];
    }
    return null;
  }

  /**
   * The HUD's boss block (ZombieMode.hudInfo().boss; a reused object): the boss's bars (name
   * null without one) and the elites' (zelites.js); null when there's neither.
   */
  hudInfo() {
    const b = this.boss, I = this.info, t = this.game.time;
    const ne = this.elites.info(I.elites);
    if (!(b && b.alive) && !ne) return null;
    if (b && b.alive) {
      const B = b.boss;
      I.name = B.def.name; I.id = B.def.id; I.hp = Math.max(0, b.health); I.hpMax = b.maxHealth; I.status = B.status; I.color = B.def.color;
      I.posture = B.postureMax ? Math.min(1, B.posture / B.postureMax) : null;
      I.broken = t < B.brokenUntil;
      I.brokenLeft = I.broken ? (B.brokenUntil - t) / this.Z.diff.boss.kneel : 0;
      I.phase = B.phase; I.phases = this.Z.diff.boss.phases; I.cycle = B.cycle;
    } else { I.name = null; I.id = null; I.posture = null; I.broken = false; I.status = ''; }
    return I;
  }
}
