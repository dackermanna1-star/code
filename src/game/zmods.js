// Zombie survival modifier pipeline (Milestone 3 foundation; m3-contracts section 3). Every
// source that changes a build feeds it - perks and relics (perks.js), timed buffs such as the
// power-ups (powerups.js, through perks.buff), squad-wide auras - and the game asks it, one
// hook each: damage dealt and taken (game.damagePlayer, before computeDamage), reload / draw /
// fire-rate times (weaponsys, through ctx.zk), the magazine (w.clipMax), max health
// (p.maxHealth), move speed (simulatePlayer), shop prices (zeconomy.scale) and money earned
// (zeconomy.pay), healing (game.heal). Kills and hits reach perks through the event bus.
//
// Sources and stacking:
//  - a source is { stats: { <stat>: bonus, ... }, n (stacks: every bonus x n), until (the
//    game time it runs out; 0 = until the run ends), done (called when it runs out) }, kept
//    under a key ('perk:deadeye', 'buff:doublecash', ...) on one player, or on the whole
//    squad (set('squad', ...): everyone in it)
//  - within a stat, bonuses ADD: two +0.2 damage perks make +40%, not 1.2 x 1.2
//  - different stats MULTIPLY: damage x headDamage x bossDamage for a head hit on a boss
//  - layers multiply: the weapon's own (w.mods: attachments and the forge's tiers) x the
//    player's (this) - a Tier III gun's +30% damage and a +20% perk give 1.3 x 1.2; the
//    difficulty (zdiff) is a third layer of its own
//  - STATS[stat].kind: 'mul' -> x clamp(1 + sum, min, max); 'rate' -> a speed: whatever it
//    times takes / clamp(1 + sum, min, max) (+0.25 reload: a reload takes 1 / 1.25 as long);
//    'add' -> + sum (flat: max health over 100, luck)
// Nobody has anything (the usual case, and always in classic CS): every hook returns at once.
import { inSquad } from './runstats.js';
import { HITGROUP } from './combatrules.js';
import { TEAM_CT } from './player.js';

export const BASE_HEALTH = 100; // max health with nothing (p.maxHealth; Player sets it)

/**
 * The stats. kind 'mul' (x the factor), 'rate' (a speed: time / the factor) or 'add' (flat);
 * min / max clamp the factor ('mul', 'rate') or the sum ('add'). Add one with defineStat.
 */
export const STATS = {
  // what you deal (to zombies, specials and bosses; game.damagePlayer)
  damage: { kind: 'mul', min: 0.1, label: 'Damage' },
  headDamage: { kind: 'mul', min: 0.1, label: 'Headshot damage' },
  bulletDamage: { kind: 'mul', min: 0.1, label: 'Bullet damage' }, // (damageKind 'bullet')
  blastDamage: { kind: 'mul', min: 0.1, label: 'Explosive damage' }, // ('blast')
  fireDamage: { kind: 'mul', min: 0.1, label: 'Fire damage' }, // ('fire')
  meleeDamage: { kind: 'mul', min: 0.1, label: 'Melee damage' }, // ('melee': knife, chainsaw, shove)
  specialDamage: { kind: 'mul', min: 0.1, label: 'Damage to specials' }, // (elites too)
  bossDamage: { kind: 'mul', min: 0.1, label: 'Damage to bosses' },
  // what you take (game.damagePlayer)
  taken: { kind: 'mul', min: 0, label: 'Damage taken' },
  takenClaw: { kind: 'mul', min: 0, label: 'Claw damage taken' }, // (a zombie's or a boss's melee)
  takenBlast: { kind: 'mul', min: 0, label: 'Blast damage taken' }, // (explosions, a scream, a slam: your own too)
  takenFire: { kind: 'mul', min: 0, label: 'Fire damage taken' },
  takenAcid: { kind: 'mul', min: 0, label: 'Acid damage taken' },
  // you
  maxHealth: { kind: 'add', min: -75, max: 400, label: 'Max health' }, // (+ BASE_HEALTH)
  speed: { kind: 'mul', min: 0.6, max: 1.4, label: 'Move speed' },
  reload: { kind: 'rate', min: 0.4, max: 3, label: 'Reload speed' },
  handling: { kind: 'rate', min: 0.4, max: 3, label: 'Draw speed' },
  fireRate: { kind: 'rate', min: 0.5, max: 2, label: 'Fire rate' },
  clip: { kind: 'mul', min: 0.25, max: 4, label: 'Magazine size' },
  heal: { kind: 'mul', min: 0, label: 'Healing given' }, // (medkits you use: game.heal)
  // money (zeconomy.js)
  price: { kind: 'mul', min: 0.3, label: 'Shop prices' },
  money: { kind: 'mul', min: 0, label: 'Money earned' },
  // read by their owners
  luck: { kind: 'add', min: -1, max: 4, label: 'Luck' }, // (drops: loot chance x (1 + luck))
};
const OUT = ['damage', 'headDamage', 'bulletDamage', 'blastDamage', 'fireDamage', 'meleeDamage', 'specialDamage', 'bossDamage'];
const INC = ['taken', 'takenClaw', 'takenBlast', 'takenFire', 'takenAcid'];
const RESERVED = new Set(['rev', 'any', 'out', 'inc', 'wk', 'sum']); // (fields of a totals object: no stat may be called this)

/** Add a stat (perks.js and friends, at load time): defineStat('pistolDamage', { kind: 'mul', min: 0.1, label }). Its readers use mods.factor / mods.stat. */
export function defineStat(name, spec) {
  if (RESERVED.has(name)) throw new Error(`zmods: "${name}" is reserved`);
  STATS[name] = { kind: 'mul', ...spec };
  return STATS[name];
}

const MELEE = new Set(['knife', 'chainsaw', 'shove', 'machete', 'fireaxe', 'katana']); // (the arsenal's blades: weaponsys.js)
/**
 * What kind of damage a hit is: 'fire' | 'acid' | 'melee' (knife, chainsaw, shove, and a
 * zombie's or a boss's claws) | 'energy' (the tesla) | 'blast' (explosions, screams, slams) |
 * 'bullet'. The forge's procs and the perks use it too.
 */
export function damageKind(weaponId, opts, attacker = null) {
  if (opts.fire) return 'fire';
  if (opts.acid) return 'acid';
  if (MELEE.has(weaponId)) return 'melee';
  if (weaponId === 'tesla') return 'energy';
  if (opts.blast) return 'blast';
  if (attacker?.isZombie) return 'melee'; // (claws: 'zombie', a boss's 'cleaver', ...)
  return 'bullet';
}
const KIND_OUT = { bullet: 'bulletDamage', blast: 'blastDamage', fire: 'fireDamage', melee: 'meleeDamage' };
const KIND_IN = { melee: 'takenClaw', blast: 'takenBlast', fire: 'takenFire', acid: 'takenAcid' };

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class ZMods {
  constructor(game) {
    this.game = game;
    this.who = new Set(); // players with sources of their own (p.zmSrc: key -> source; p.zm: the totals)
    this.global = new Map(); // key -> source on the whole squad
    this.hooks = { out: [], in: [], price: [], money: [] }; // addHook: conditional effects
    this.live = false; // anybody has anything (else every hook returns at once)
    this.rev = 0; // totals revision (a weapon folds its magazine again when its owner's changed)
    this.nextExpire = Infinity;
    this.subscribed = false;
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
  }

  /** A new run: nobody has anything, max health back to 100 (hooks stay: they're code). */
  reset() {
    const ps = [...this.who];
    this.who.clear();
    this.global.clear();
    for (const p of ps) { p.zmSrc = null; this.recompute(p); }
    for (const p of this.game.players) if (p.zm) this.recompute(p);
    this.nextExpire = Infinity;
    this.updateLive();
  }

  // ---------------------------------------------------------------- sources
  /**
   * Put a source on p (a Player, or 'squad': everyone in it): stats { stat: bonus }, o: { n
   * (stacks), until (game time; 0 = for good), done(p, src) (called when it runs out) }.
   * Replaces whatever was under key. Returns the source.
   */
  set(p, key, stats, o = {}) {
    const src = { key, stats: stats || {}, n: o.n ?? 1, until: o.until || 0, done: o.done || null };
    for (const k in src.stats) if (!STATS[k]) console.warn(`[zmods] unknown stat "${k}" (${key}): defineStat it first`);
    if (p === 'squad') this.global.set(key, src);
    else { (p.zmSrc || (p.zmSrc = new Map())).set(key, src); this.who.add(p); }
    if (src.until) this.nextExpire = Math.min(this.nextExpire, src.until);
    this.changed(p);
    return src;
  }

  /** Take the source under key off p (or 'squad'). True if there was one. */
  remove(p, key) {
    const m = p === 'squad' ? this.global : p.zmSrc;
    if (!m || !m.delete(key)) return false;
    if (p !== 'squad' && !m.size) this.who.delete(p);
    this.changed(p);
    return true;
  }

  /** The source under key on p (or 'squad'), or null. */
  get(p, key) { return (p === 'squad' ? this.global : p.zmSrc)?.get(key) || null; }
  has(p, key) { return !!this.get(p, key); }

  /** Every key on p (its own; 'squad': the squad's). */
  keys(p) { return [...((p === 'squad' ? this.global : p.zmSrc)?.keys() || [])]; }

  /**
   * A conditional effect the stats can't say (Insta-Kill, "+50% under 30 HP"...): kind 'out'
   * fn(attacker, victim, damage, hitgroup, weaponId, opts) -> damage (squad on a zombie);
   * 'in' fn(victim, attacker, damage, hitgroup, weaponId, opts) -> damage (on the squad);
   * 'price' fn(p, item, k) -> k; 'money' fn(p, amount, reason) -> amount. Returns the remover.
   * Hooks outlive runs: register once (constructor) and check your own state inside.
   */
  addHook(kind, fn) {
    const l = this.hooks[kind];
    if (!l) throw new Error(`zmods: no hook "${kind}"`);
    l.push(fn);
    this.updateLive();
    return () => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); this.updateLive(); };
  }

  changed(p) {
    if (p === 'squad') { for (const q of this.game.players) if (inSquad(q)) this.recompute(q); }
    else this.recompute(p);
    this.updateLive();
  }

  updateLive() {
    const H = this.hooks;
    this.live = this.who.size > 0 || this.global.size > 0 || H.out.length + H.in.length + H.price.length + H.money.length > 0;
  }

  /** p's totals from its sources and the squad's (p.zm; null when there are none). */
  recompute(p) {
    const own = p.zmSrc, glob = inSquad(p) ? this.global : null;
    if ((!own || !own.size) && (!glob || !glob.size)) {
      if (p.zm) { p.zm = null; this.rev++; }
      this.setMaxHealth(p, BASE_HEALTH);
      return;
    }
    const m = p.zmTot || (p.zmTot = { sum: {}, wk: null, wkObj: { reload: 1, draw: 1, cycle: 1 } });
    const sum = m.sum;
    for (const k in STATS) sum[k] = 0;
    const add = (src) => { for (const k in src.stats) if (k in sum) sum[k] += src.stats[k] * src.n; };
    if (own) for (const src of own.values()) add(src);
    if (glob) for (const src of glob.values()) add(src);
    for (const k in STATS) {
      const S = STATS[k], s = sum[k];
      if (S.kind === 'add') m[k] = clamp(s, S.min ?? -Infinity, S.max ?? Infinity);
      else if (S.kind === 'rate') m[k] = 1 / clamp(1 + s, S.min ?? 0.1, S.max ?? 10); // (a time multiplier)
      else m[k] = clamp(1 + s, S.min ?? 0, S.max ?? Infinity);
    }
    m.out = OUT.some((k) => m[k] !== 1);
    m.inc = INC.some((k) => m[k] !== 1);
    const w = m.wkObj;
    w.reload = m.reload; w.draw = m.handling; w.cycle = m.fireRate;
    m.wk = w.reload !== 1 || w.draw !== 1 || w.cycle !== 1 ? w : null;
    m.any = true;
    m.rev = ++this.rev;
    p.zm = m;
    this.setMaxHealth(p, BASE_HEALTH + m.maxHealth);
  }

  /** New max health: gaining some heals by as much; losing some takes health down to it (not while down: the bleed pool). */
  setMaxHealth(p, max) {
    max = Math.max(1, Math.round(max));
    const old = p.maxHealth || BASE_HEALTH;
    if (max === old) return;
    p.maxHealth = max;
    if (!p.alive || p.downed || p.isZombie) return;
    if (max > old) p.health += max - old;
    else p.health = Math.min(p.health, max);
  }

  /** Timed sources run out (ZombieMode.tick). */
  tick(t) {
    if (t < this.nextExpire) return;
    let next = Infinity;
    const sweep = (map, p) => {
      let hit = false;
      for (const [k, src] of map) {
        if (!src.until) continue;
        if (src.until <= t) { map.delete(k); hit = true; src.done?.(p, src); } else next = Math.min(next, src.until);
      }
      return hit;
    };
    if (sweep(this.global, 'squad')) this.changed('squad');
    for (const p of [...this.who]) {
      if (sweep(p.zmSrc, p)) { if (!p.zmSrc.size) this.who.delete(p); this.recompute(p); }
    }
    this.nextExpire = next;
    this.updateLive();
  }

  // ---------------------------------------------------------------- reading
  /** The summed bonus on stat for p (0: nothing). */
  stat(p, name) { return p?.zm ? p.zm.sum[name] ?? 0 : 0; }

  /** The stat's effective value for p: the factor ('mul'), time multiplier ('rate') or flat sum ('add'). */
  factor(p, name) {
    if (p?.zm) return p.zm[name] ?? 1;
    return STATS[name]?.kind === 'add' ? 0 : 1;
  }

  // ---------------------------------------------------------------- the game's hooks (hot paths: no allocation)
  /** game.damagePlayer, after the boss / roster / downed adjustments and before computeDamage. */
  damage(victim, attacker, dmg, hitgroup, weaponId, opts) {
    if (!this.live) return dmg;
    const a = attacker && attacker !== victim && victim.isZombie ? attacker.zm : null;
    if (a && a.out) {
      let k = a.damage;
      if (hitgroup === HITGROUP.HEAD) k *= a.headDamage;
      const st = KIND_OUT[damageKind(weaponId, opts, attacker)];
      if (st) k *= a[st];
      if (victim.isBoss) k *= a.bossDamage;
      else if (victim.special) k *= a.specialDamage;
      dmg *= k;
    }
    const v = victim.zm;
    if (v && v.inc) {
      let k = v.taken;
      const st = KIND_IN[damageKind(weaponId, opts, attacker)];
      if (st) k *= v[st];
      dmg *= k;
    }
    const H = this.hooks;
    if (H.out.length && victim.isZombie && inSquad(attacker)) for (let i = 0; i < H.out.length; i++) dmg = H.out[i](attacker, victim, dmg, hitgroup, weaponId, opts);
    if (H.in.length && inSquad(victim)) for (let i = 0; i < H.in.length; i++) dmg = H.in[i](victim, attacker, dmg, hitgroup, weaponId, opts);
    return dmg;
  }

  /** zeconomy.scale: the factor on what p pays for item. */
  price(p, item) {
    if (!this.live) return 1;
    let k = p.zm ? p.zm.price : 1;
    const H = this.hooks.price;
    for (let i = 0; i < H.length; i++) k = H[i](p, item, k);
    return k;
  }

  /** zeconomy.pay: what p actually gets of amount (only income is scaled). */
  money(p, amount, reason) {
    if (!this.live || amount <= 0) return amount;
    if (p.zm && p.zm.money !== 1) amount = Math.round(amount * p.zm.money);
    const H = this.hooks.money;
    for (let i = 0; i < H.length; i++) amount = H[i](p, amount, reason);
    return amount;
  }

  /** simulatePlayer: x p's move speed. */
  speed(p) { return p.zm ? p.zm.speed : 1; }

  /** game.weaponCtx: { reload, draw, cycle } time multipliers for p's weapons, or null (all 1). */
  wk(p) { return p.zm ? p.zm.wk : null; }

  /** game.heal: what p's medkit heals. */
  heal(p, amount) { return p.zm ? amount * p.zm.heal : amount; }

  /**
   * simulatePlayer, the weapon in hand: fold p's magazine bonus into w.clipMax (the weapon
   * layer's size, attachments.js m.clip, x the clip factor). Only when either changed.
   */
  weapon(p, w) {
    const rev = p.zm ? p.zm.rev : 0;
    if (w.zmRev === rev) return;
    w.zmRev = rev;
    if (!(w.def.clip > 0)) return;
    const base = w.mods ? w.mods.clip : w.def.clip, k = p.zm ? p.zm.clip : 1;
    w.clipMax = k !== 1 ? Math.max(1, Math.round(base * k)) : w.mods ? base : 0; // (0: the def's size, weaponsys clipSize)
  }

  // ---------------------------------------------------------------- the scaffold hooks
  hud(s) { void s; }
  frame(dt) { void dt; }

  /** zm_mods [stat]: your totals (no cheats needed). True when it was ours. */
  command(p, cmd, args = []) {
    if (cmd !== 'zm_mods') return false;
    const out = (s) => this.game.console?.print?.(s);
    const q = args[0] ? this.game.players.find((x) => x.name.toLowerCase() === String(args[0]).toLowerCase() && x.team === TEAM_CT) || p : p;
    if (!q.zm) { out(`${q.name}: no modifiers (max health ${q.maxHealth})`); return true; }
    const parts = [];
    for (const k in STATS) if (q.zm.sum[k]) parts.push(`${k} ${q.zm.sum[k] > 0 ? '+' : ''}${+q.zm.sum[k].toFixed(3)}`);
    out(`${q.name}: ${parts.join(', ') || 'nothing'} | sources ${[...(q.zmSrc?.keys() || []), ...this.global.keys()].join(', ')} | max health ${q.maxHealth}`);
    return true;
  }
}
