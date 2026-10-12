// Zombie survival run telemetry: a light event bus (g.zombies.events) and the per-run
// tallies built on it (g.zombies.runStats). Score, the run report, perks, contracts and
// achievements subscribe to the bus instead of patching the game code.
//
// The bus only carries the squad's side of the fight: events where the local player or a
// CT bot (never a zombie, a boss or a spectator) acts or is acted on. Each emitter fills a
// payload object kept for its event type and reused for every emit, so a subscriber must
// copy what it wants to keep (never store the payload) and must not change it. Emitting the
// same type again from inside a subscriber is fine (it gets its own object).
//
//   const off = g.zombies.events.on('kill', (e) => { if (e.attacker === g.local) ... });
//
// Events (fields; t = game time, wave = the wave number when it happened):
//  run       { phase: 'start' | 'over', wave, t, diff (preset id), survived, kills }
//            'start' when a run begins (wave 0, before the first break); 'over' when it
//            ends (survived = waves cleared, kills = the local player's kills)
//  wave      { phase: 'start' | 'cleared', wave, t, boss (a boss wave), count (zombies in
//            the wave), bonus ($ paid for clearing it), heal (HP given for clearing it) }
//  hit       { attacker, victim, damage (health taken off), armor (armour taken off),
//            raw (damage before armour), hitgroup, head, weapon, blast, fire, acid, explode,
//            lethal (took the victim to 0 HP), shot (the trigger pull's id for bullets and tesla
//            bolts, else 0), point, dir, t }
//            every damage dealt by or to the squad (not to god-mode players); lethal hits
//            are followed by a kill (or, with downed, a down)
//  kill      { attacker, victim, weapon, head, zombie (a zombie / boss died), special (its
//            kind or null), boss, extra (a summoned zombie outside the wave count), squad
//            (the attacker is in the squad), local (the attacker is you), wave, t }
//            every death in the mode: zombies (whoever killed them) and squad members
//  shot      { shooter, weapon, shot (id), pellets, t } a trigger pull by the squad: one per
//            bullet shot (a shotgun blast is one), tesla bolt or launched projectile
//  buy       { player, item, cost, money (left after), phase (Z.state), wave, t }
//  special   { phase: 'spawn' | 'death', kind, zombie (the first of a pack), count (spawn),
//            attacker (death), wave, t }
//  boss      { phase: 'spawn' | 'death', id, name, boss (the Player), attacker (death), wave, t }
// Reserved for the builders (defined and emitted by them; listed so subscriptions don't warn):
//  economy:  earn { player, amount, reason: 'kill' | 'special' | 'boss' | 'wave', t },
//            ready { player, ready (on / off), all (every human is ready), t }
//  downed:   down { player, attacker, bleedOut (s), downs (this wave), t },
//            revive { player, by (null: on his own), t }, bleedout { player, t },
//            respawn { player, wave, t }, wipe { wave, t }
//  feedback: streak { player, n, label, t }
import { TEAM_CT } from './player.js';

export const EVENT_TYPES = new Set([
  'run', 'wave', 'hit', 'kill', 'shot', 'buy', 'special', 'boss',
  // economy
  'earn', 'ready',
  // downed
  'down', 'revive', 'bleedout', 'respawn', 'wipe',
  // feedback
  'streak',
]);

/** In the squad: you or a bot teammate (the CT side; zombies and spectators aren't). */
export const inSquad = (p) => !!p && p.team === TEAM_CT && !p.isZombie;

export class RunEvents {
  constructor(game) {
    this.game = game;
    this.subs = Object.create(null); // type -> [fn]
    this.pool = Object.create(null); // type -> [payload per nesting depth]
    this.depth = Object.create(null);
  }

  /** Subscribe (type '*': every event, fn(e, type)). Returns the unsubscribe function. */
  on(type, fn) {
    if (type !== '*' && !EVENT_TYPES.has(type)) console.warn(`[runstats] unknown event "${type}" (add it to EVENT_TYPES)`);
    (this.subs[type] || (this.subs[type] = [])).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const l = this.subs[type];
    const i = l ? l.indexOf(fn) : -1;
    if (i >= 0) l.splice(i, 1);
  }

  /** Anyone listening to type? (emitters skip filling the payload when not) */
  has(type) {
    const l = this.subs[type], a = this.subs['*'];
    return !!((l && l.length) || (a && a.length));
  }

  /** The payload object to fill for type (one per nesting depth, reused). */
  obj(type) {
    const st = this.pool[type] || (this.pool[type] = []);
    const d = this.depth[type] | 0;
    return st[d] || (st[d] = { type });
  }

  emit(type, e) {
    const l = this.subs[type], a = this.subs['*'];
    if (!(l && l.length) && !(a && a.length)) return;
    this.depth[type] = (this.depth[type] | 0) + 1;
    try {
      if (l) for (let i = 0; i < l.length; i++) this.call(l[i], e, type);
      if (a) for (let i = 0; i < a.length; i++) this.call(a[i], e, type);
    } finally { this.depth[type]--; }
  }

  call(fn, e, type) {
    try { fn(e, type); } catch (err) { console.error(`[runstats] "${type}" subscriber failed`, err); }
  }

  get wave() { return this.game.zombies.wave; }

  // ---------------------------------------------------------------- typed emitters
  // (one call each from the game code: they check who is involved and fill the payload)

  /** game.damagePlayer, after the damage went in (before a lethal hit's kill). */
  hit(victim, attacker, damage, armor, raw, hitgroup, head, weapon, dir, point, opts) {
    if (!(inSquad(attacker) || inSquad(victim)) || !this.has('hit')) return;
    const e = this.obj('hit');
    e.attacker = attacker || null; e.victim = victim;
    e.damage = damage; e.armor = armor; e.raw = raw;
    e.hitgroup = hitgroup; e.head = !!head; e.weapon = weapon || 'world';
    e.blast = !!opts.blast; e.fire = !!opts.fire; e.acid = !!opts.acid; e.explode = !!opts.explode;
    e.lethal = victim.health <= 0;
    e.shot = opts.shot || 0;
    e.point = point || null; e.dir = dir || null;
    e.t = this.game.time;
    this.emit('hit', e);
  }

  /** game.killPlayer (every death while the mode is on). */
  kill(victim, attacker, weapon, head) {
    if (!this.has('kill')) return;
    const e = this.obj('kill');
    e.attacker = attacker || null; e.victim = victim;
    e.weapon = weapon || 'world'; e.head = !!head;
    e.zombie = !!victim.isZombie; e.special = victim.special || null; e.boss = !!victim.isBoss;
    e.extra = !!victim.extra;
    e.squad = inSquad(attacker) && attacker !== victim;
    e.local = !!attacker && attacker === this.game.local && attacker !== victim;
    e.wave = this.wave; e.t = this.game.time;
    this.emit('kill', e);
  }

  /** game.fireBullets / zapFrom / launchFrom: a trigger pull. */
  shot(shooter, weapon, id, pellets) {
    if (!inSquad(shooter) || !this.has('shot')) return;
    const e = this.obj('shot');
    e.shooter = shooter; e.weapon = weapon || 'world'; e.shot = id; e.pellets = pellets;
    e.t = this.game.time;
    this.emit('shot', e);
  }

  /** rounds.buy: a purchase went through (cost paid). */
  buy(player, item, cost) {
    if (!inSquad(player) || !this.has('buy')) return;
    const e = this.obj('buy');
    e.player = player; e.item = item; e.cost = cost; e.money = player.money;
    e.phase = this.game.zombies.state; e.wave = this.wave; e.t = this.game.time;
    this.emit('buy', e);
  }

  /** A mode event with a few fields (run / wave / special / boss): fills the payload from f. */
  mode(type, f) {
    if (!this.has(type)) return;
    const e = this.obj(type);
    for (const k in e) if (k !== 'type') e[k] = undefined; // (no stale fields from another phase)
    Object.assign(e, f);
    e.wave = f.wave ?? this.wave; e.t = this.game.time;
    this.emit(type, e);
  }
}

/**
 * What happened in the current run, from the bus: the local player's shooting and kills,
 * the squad's, and one row per wave. Reset when a run starts. Read it, don't write it.
 */
export class RunStats {
  constructor(game, events) {
    this.game = game;
    this.reset();
    events.on('run', (e) => { if (e.phase === 'start') this.reset(); else this.endT = e.t; });
    events.on('wave', (e) => this.onWave(e));
    events.on('shot', (e) => this.onShot(e));
    events.on('hit', (e) => this.onHit(e));
    events.on('kill', (e) => this.onKill(e));
    events.on('buy', (e) => { if (e.player === this.game.local) { this.me.spent += e.cost; this.me.buys++; } });
  }

  reset() {
    this.startT = this.game.time;
    this.endT = 0;
    // you: trigger pulls, pulls that hit something, hits (pellets count), head hits, damage
    // dealt / taken, kills (and by weapon), headshot kills, specials, bosses, $ spent, buys
    this.me = { shots: 0, shotsHit: 0, hits: 0, headHits: 0, dealt: 0, taken: 0, kills: 0, headKills: 0, specials: 0, bosses: 0, spent: 0, buys: 0, byWeapon: {} };
    this.squad = { kills: 0, dealt: 0, taken: 0, deaths: 0 };
    this.waves = []; // { wave, start, end, kills (yours), squadKills, taken (yours), hp / money at the end }
    this.lastShot = 0;
  }

  /** The current wave's row. */
  row() { return this.waves[this.waves.length - 1] || null; }

  onWave(e) {
    if (e.phase === 'start') this.waves.push({ wave: e.wave, start: e.t, end: 0, kills: 0, squadKills: 0, taken: 0, hp: 0, money: 0 });
    else if (e.phase === 'cleared') {
      const r = this.row(), me = this.game.local;
      if (r && r.wave === e.wave) { r.end = e.t; r.hp = me ? Math.max(0, Math.round(me.health)) : 0; r.money = me ? me.money : 0; }
    }
  }

  onShot(e) { if (e.shooter === this.game.local) this.me.shots++; }

  onHit(e) {
    const me = this.game.local, M = this.me;
    if (e.attacker === me && e.victim !== me && e.victim.isZombie) {
      M.hits++;
      if (e.head) M.headHits++;
      M.dealt += e.damage;
      // a pull counts as on target once, however many pellets landed
      if (e.shot && e.shot !== this.lastShot) { this.lastShot = e.shot; M.shotsHit++; }
    }
    if (inSquad(e.attacker) && e.victim.isZombie) this.squad.dealt += e.damage;
    if (inSquad(e.victim) && e.attacker !== e.victim) {
      this.squad.taken += e.damage;
      if (e.victim === me) { M.taken += e.damage; const r = this.row(); if (r) r.taken += e.damage; }
    }
  }

  onKill(e) {
    const M = this.me, r = this.row();
    if (e.zombie) {
      if (e.squad) { this.squad.kills++; if (r) r.squadKills++; }
      if (e.local) {
        M.kills++;
        if (e.head) M.headKills++;
        if (e.special) M.specials++;
        if (e.boss) M.bosses++;
        M.byWeapon[e.weapon] = (M.byWeapon[e.weapon] || 0) + 1;
        if (r) r.kills++;
      }
    } else if (inSquad(e.victim)) this.squad.deaths++;
  }

  /** Accuracy (0..1) of your trigger pulls (pellets: a pull counts as a hit if any landed). */
  accuracy() { return this.me.shots ? Math.min(1, this.me.shotsHit / this.me.shots) : 0; }
}
