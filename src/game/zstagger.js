// Zombie survival stagger and stopping power (Milestone 2.1, owner: stagger). A hit, a shove,
// a tesla jolt or a chainsaw bite can stop a zombie for a moment: no step forward, no swing
// (a swing already winding up is lost).
//
// The shared API (m2-contracts): every caller goes through
//   g.zombies.stagger(z, amount, dir, src, by)  ->  seconds it is held (0: shrugged off)
// amount: stopping power, 1 = a clean full stagger (a point-blank pump shotgun); under FLINCH
// only a flinch (no hold); KNOCKDOWN and up drops it to its knees. dir: [x,y,z] the push
// (unit, or null); src: what did it (a weapon id, 'shove', 'tesla', 'chainsaw', 'director');
// by: the Player responsible, or null.
// Per zombie (reset in ZombieMode.spawnZombie, read by anyone, written only here):
//   z.staggerUntil  game time the hold ends (0 / past: free); ZombieMode.think skips
//                   chase / special trick / attack while it lasts and calls hold() instead
//   z.staggerKind   'flinch' | 'stagger' | 'knockdown' | 'stun' (the last one), or null
//   z.staggerN      staggers this life (diminishing returns)
//   z.poise         0..1, built up by hits, drains with time; at 1 the zombie staggers
// (and, private: staggerFree - no new stagger before it (the cooldown); staggerDR - recent
// staggers, decaying (holds shrink); poiseT; panicUntil / panicYaw / panicNext - on fire.)
// Difficulty: g.zombies.diff.stagger { resist, decay, cooldown, knockdown } (zdiff.js).
// Event: 'stagger' when the one responsible is in the squad (runstats.js).
//
// How it plays:
//  - every squad hit on a zombie (the bus 'hit') builds poise from the weapon's row in STOP
//    (zombie mode only) x where it landed; once poise is full (and the cooldown is over) it
//    staggers: shotguns break it in a blast and hold a doorway, rifles and SMGs in a few
//    rounds, snipers never (they kill but don't stop), the minigun pins whoever is in front
//    (the first body each round meets; the rounds that go on through stop less: collateral,
//    by shot id), a leg hit may drop it to its knees (knockdown; the roster may turn it into
//    a crawler for good: roster.become)
//  - the tesla stuns every zombie of its chain a moment (game.zapFrom), the chainsaw holds
//    what it cuts (game.sawFrom), a shove staggers (shove.js)
//  - diminishing returns: each stagger shortens the next for a while; after a hold, no new
//    one for diff.stagger.cooldown s (no stun-lock; the chainsaw / minigun pins are exempt)
//  - bosses never stagger (M3 posture is separate); chargers are nearly immune; a special
//    winding up its trick loses it (hunter / smoker windup, boomer before the bile); one mid-
//    trick (leaping, charging, pinning, pulling) shrugs it off
//  - a zombie set on fire panics: it runs off flailing a moment, and can set the ones it
//    brushes past alight, one generation and at most SPREAD_MAX at a time (fire.js hook)
//  - the model shows all of it (playermodels.js PlayerModel.hit and the reel / kneel / stun /
//    flail weights): heads snap back, shoulders twist, gut shots fold it, legs buckle
import { inSquad } from './runstats.js';

export const FLINCH = 0.35, KNOCKDOWN = 1.5;
const HOLD = 0.6, HOLD_MAX = 1.2, PUSH = 120;
const KNEEL = 1.3, GETUP = 0.35; // a knockdown: s on its knees, then s getting up (inside the hold)
const STUN = 0.45; // the tesla's jolt
const SUSTAIN = 0.2; // the chainsaw's hold, renewed every cut
const DR_K = 0.45, DR_DECAY = 0.8; // hold x 1 / (1 + DR_K x recent staggers); recent drains DR_DECAY a second
const CHARGER = 0.22; // what a charger takes of it (nearly immune)
const LEG_KO = 0.5; // a leg hit's stagger is a knockdown this often (x the weapon's leg, diff knockdown)
const PANIC = [0.9, 1.5], PANIC_EVERY = 3.5; // s a burning zombie panics, and how often it can
const SPREAD_R = 40, SPREAD_EVERY = 0.3, SPREAD_MAX = 4, SPREAD_GEN = 1, SPREAD_BURN = 2; // fire passed on: reach, s, at once, generations, s
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;

/** Poise by where it lands (hitgroup 0 generic .. 7 right leg). */
const REGION = [1, 1.5, 1, 1.1, 0.6, 0.6, 0.85, 0.85];

/**
 * Stopping power (zombie mode only; the bus 'hit' events of the squad): gain = poise per point
 * of damage (before armour; full poise = 1 staggers it), amt = the stagger it gets (1 = a 0.6 s
 * hold), leg = x the chance a leg hit's stagger is a knockdown, push = shove along the shot
 * (u/s; guns CS already knocks back - its large-flinch list - get none), pellets = one blast
 * is many hits (no collateral rule), pin = s the front rank is held by every round (minigun).
 * Snipers: gain 0 (they kill, they don't stop). Not listed: DEFAULT. The tesla and chainsaw
 * come through apply() from game.js instead.
 */
const STOP = {
  // (to the body, at their rate of fire, on Normal: a pistol in 3-4 rounds, an SMG in 4-5, a rifle in 3)
  knife: { gain: 0.012, amt: 0.7, leg: 0.3 },
  glock: { gain: 0.0123, amt: 0.45, leg: 0.25 },
  usp: { gain: 0.0115, amt: 0.5, leg: 0.25 },
  p228: { gain: 0.0122, amt: 0.5, leg: 0.25 },
  deagle: { gain: 0.0106, amt: 0.8, leg: 0.5 },
  elite: { gain: 0.0065, amt: 0.45, leg: 0.25 },
  fiveseven: { gain: 0.0154, amt: 0.45, leg: 0.25 },
  m3: { gain: 0.0075, amt: 1, leg: 1, pellets: true },
  xm1014: { gain: 0.0088, amt: 0.8, leg: 0.8, push: 90, pellets: true },
  aa12: { gain: 0.008, amt: 0.85, leg: 0.9, push: 100, pellets: true },
  mac10: { gain: 0.0098, amt: 0.45, leg: 0.3 },
  tmp: { gain: 0.0116, amt: 0.4, leg: 0.3 },
  mp5: { gain: 0.011, amt: 0.45, leg: 0.3 },
  ump45: { gain: 0.0098, amt: 0.5, leg: 0.3 },
  p90: { gain: 0.011, amt: 0.45, leg: 0.3 },
  galil: { gain: 0.0124, amt: 0.6, leg: 0.4 },
  famas: { gain: 0.0124, amt: 0.6, leg: 0.4 },
  ak47: { gain: 0.0104, amt: 0.7, leg: 0.45 },
  m4a1: { gain: 0.0117, amt: 0.6, leg: 0.4 },
  sg552: { gain: 0.0113, amt: 0.6, leg: 0.4 },
  aug: { gain: 0.0117, amt: 0.6, leg: 0.4 },
  m249: { gain: 0.0118, amt: 0.6, leg: 0.4, push: 30 },
  minigun: { gain: 0.0092, amt: 0.6, leg: 0.4, push: 25, pin: 0.12 },
  scout: { gain: 0, amt: 0, leg: 0 },
  awp: { gain: 0, amt: 0, leg: 0 },
  g3sg1: { gain: 0, amt: 0, leg: 0 },
  sg550: { gain: 0, amt: 0, leg: 0 },
  barrett: { gain: 0, amt: 0, leg: 0 },
  // the arsenal (zarsenal.js): the machete and katana chop a zombie off balance in two or
  // three cuts; the fire axe staggers by itself (its own hold, every chop), the crossbow kills
  // but doesn't stop
  machete: { gain: 0.011, amt: 0.65, leg: 0.5 },
  katana: { gain: 0.009, amt: 0.6, leg: 0.5 },
  fireaxe: { gain: 0, amt: 0, leg: 0 },
  crossbow: { gain: 0, amt: 0, leg: 0 },
};
const DEFAULT = { gain: 0.007, amt: 0.6, leg: 0.3 };
const BLAST = { gain: 0.01, amt: 1, leg: 0, push: 0 }; // grenades, rockets, mines: by damage
const COLLATERAL = 0.35; // poise a round gives the bodies behind the first it went through
const NOSTOP = new Set(['tesla', 'chainsaw']); // (apply() from game.js)

export class ZStagger {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('hit', (e) => this.onHit(e));
  }

  reset() {
    this.shot = 0; this.shotFirst = null; // collateral: the shot id last seen and the first body it met
    // tallies (tests, tuning): staggers by kind, panics, fires passed on
    this.counts = { flinch: 0, stagger: 0, knockdown: 0, stun: 0, panic: 0, spread: 0, cancel: 0, pin: 0 };
  }

  /** Every tick (ZombieMode.tick). */
  tick(t) { void t; }

  // ---------------------------------------------------------------- the API
  /** See the header. Returns the seconds z is held (0: no hold). */
  apply(z, amount, dir = null, src = null, by = null) {
    if (!z || !z.alive || !z.isZombie || z.isBoss || !(amount > 0)) return 0;
    const t = this.game.time, D = this.Z.diff.stagger, resist = D?.resist || 1;
    if (z.special === 'charger') amount *= CHARGER;
    if (src === 'chainsaw') return amount >= FLINCH && this.trickable(z, t) ? this.sustain(z, SUSTAIN, src, by) : this.flinch(z, by, src, amount);
    const stun = src === 'tesla';
    const kind = stun && amount >= FLINCH ? 'stun' : amount >= KNOCKDOWN ? 'knockdown' : amount >= FLINCH ? 'stagger' : 'flinch';
    if (kind === 'flinch' || !this.ready(z, t) || !this.trickable(z, t)) return this.flinch(z, by, src, amount);
    const base = kind === 'stun' ? STUN : kind === 'knockdown' ? KNEEL + GETUP : Math.min(HOLD_MAX, HOLD * amount);
    return this.start(z, kind, base / resist, dir, dir ? PUSH * Math.min(1.5, amount) : 0, src, by, amount);
  }

  /** A flinch: no hold (the model still shows the hit). */
  flinch(z, by, src, amount) {
    if (z.staggerUntil > this.game.time) { this.emit(z, by, 'flinch', src, amount); return 0; } // (held: the hold stays what it is)
    z.staggerKind = 'flinch';
    this.counts.flinch++;
    this.emit(z, by, 'flinch', src, amount);
    return 0;
  }

  /** Free to stagger: not held, and past the cooldown since the last hold (this life: staggerN). */
  ready(z, t) { return !(z.staggerUntil > t) && (!z.staggerN || !(z.staggerFree > t)); }

  /**
   * A special: only while it chases. One winding up its trick loses it (the hunter's crouch,
   * the smoker's cough, the boomer's heave); one mid-trick shrugs it off. True: it can stagger.
   */
  trickable(z, t) {
    const S = z.sp;
    if (!S || S.state === 'chase') return true;
    if (S.state === 'wind' && (z.special === 'hunter' || z.special === 'smoker')) {
      S.state = 'recover'; S.until = t + 0.6; // (Specials.think: stands there until then)
      if (S.cd.pounce < t + 1.5) S.cd.pounce = t + 1.5;
      if (S.cd.tongue < t + 2) S.cd.tongue = t + 2;
      this.counts.cancel++;
      return true;
    }
    if (S.state === 'vomit' && z.special === 'boomer' && t < S.from) {
      S.state = 'chase'; S.cd.vomit = t + 3;
      this.counts.cancel++;
      return true;
    }
    return false;
  }

  /** Hold z for secs (diminishing returns), lose its swing, push it; the event. */
  start(z, kind, secs, dir, push, src, by, amount) {
    const t = this.game.time, D = this.Z.diff.stagger;
    const dr = this.recent(z, t);
    const hold = secs / (1 + DR_K * dr);
    z.staggerDR = dr + 1;
    z.staggerKind = kind;
    z.staggerUntil = t + hold;
    z.staggerFree = z.staggerUntil + (D?.cooldown ?? 0.3);
    z.staggerN = (z.staggerN || 0) + 1;
    z.poise = 0; z.poiseT = t;
    this.loseSwing(z);
    if (dir && push > 0) { z.pm.velocity[0] += dir[0] * push; z.pm.velocity[1] += dir[1] * push; }
    if (kind === 'knockdown' && this.Z.roster.become(z, 'crawler')) z.staggerUntil = Math.min(z.staggerUntil, t + 0.6); // (a crawler for good: down it goes and on it crawls)
    this.counts[kind]++;
    this.emit(z, by, kind, src, amount);
    return hold;
  }

  /** The chainsaw / minigun: held while it lasts (renewed; no cooldown, no diminishing returns). */
  sustain(z, secs, src, by) {
    const t = this.game.time, fresh = !(z.staggerUntil > t);
    z.staggerUntil = Math.max(z.staggerUntil || 0, t + secs);
    if (fresh) {
      z.staggerKind = 'stagger';
      z.staggerN = (z.staggerN || 0) + 1;
      this.counts.pin++;
      this.emit(z, by, 'stagger', src, 1);
    }
    if (!(z.staggerFree > z.staggerUntil)) z.staggerFree = z.staggerUntil;
    this.loseSwing(z);
    return z.staggerUntil - t;
  }

  loseSwing(z) {
    z.windup = 0; // the swing is lost
    z.nextAttack = Math.max(z.nextAttack || 0, z.staggerUntil + 0.15);
    if (z.model) z.model.swipeT = -1;
  }

  /** Recent staggers (drains with time). */
  recent(z, t) {
    if (!z.staggerN) { z.staggerDR = 0; z.drT = t; } // (a fresh life)
    const dr = Math.max(0, (z.staggerDR || 0) - DR_DECAY * (t - (z.drT ?? t)));
    z.drT = t;
    return dr;
  }

  /** ZombieMode.think while z.staggerUntil is ahead: what it does instead. True: nothing else this tick. */
  hold(z, target, cmd, t) {
    void target;
    cmd.forwardmove = 0; cmd.sidemove = 0;
    z.windup = 0;
    z.pm.angles[0] = 0;
    if (z.panicUntil > t) {
      // on fire: off it runs, this way and that
      const want = z.panicYaw + Math.sin(t * 7 + z.id) * 35;
      const turn = angDiff(want, z.pm.angles[1]), max = 12 * (z.lodK || 1);
      z.pm.angles[1] += Math.max(-max, Math.min(max, turn));
      cmd.forwardmove = 400;
    }
    return true;
  }

  // ---------------------------------------------------------------- hits (the bus)
  /** Every squad hit (and hit on the squad): the model's flinch, and poise for the zombies hit. */
  onHit(e) {
    const v = e.victim, a = e.attacker;
    if (!v?.alive || !v.model) return;
    const w = e.weapon;
    if (!v.isZombie) { if (a?.isZombie && !e.blast) v.model.hit(e.hitgroup || 2, e.dir, e.point, 0.7); return; } // (a teammate clawed: a twist)
    if (!inSquad(a) || e.fire || e.acid || NOSTOP.has(w)) return;
    const raw = e.raw || 0;
    if (!e.blast) v.model.hit(e.hitgroup, e.dir, e.point, Math.min(1.6, raw * (e.head ? 1.6 : 1) / 30) * (v.isBoss ? 0.3 : v.special === 'charger' ? 0.5 : 1));
    const S = e.blast ? BLAST : STOP[w] || DEFAULT;
    // collateral: a round that went on through the first body (dead or not) stops the next ones less
    let k = 1;
    if (e.shot && !S.pellets && !e.blast) {
      if (e.shot !== this.shot) { this.shot = e.shot; this.shotFirst = v; } else if (v !== this.shotFirst) k = COLLATERAL;
    }
    if (e.lethal || v.isBoss) return; // (the kill follows / bosses don't stagger)
    if (S.pin && k === 1 && v.special !== 'charger' && this.trickable(v, this.game.time)) {
      // the minigun: the front rank stays put, and is driven back
      this.sustain(v, S.pin, w, a);
      if (e.dir) { v.pm.velocity[0] += e.dir[0] * S.push; v.pm.velocity[1] += e.dir[1] * S.push; }
    }
    if (!(S.gain > 0)) return; // (snipers)
    this.build(v, raw * S.gain * REGION[e.hitgroup | 0] * k, S, e, w, a);
  }

  /** Poise from a hit; full and ready: the stagger (a leg hit: maybe a knockdown). */
  build(z, gain, S, e, src, by) {
    const t = this.game.time, D = this.Z.diff.stagger, resist = D?.resist || 1;
    const p0 = Math.max(0, (z.poise || 0) - (D?.decay ?? 0.4) * (t - (z.poiseT ?? t)));
    z.poiseT = t;
    if (z.staggerUntil > t) { z.poise = 0; return; } // (reeling already: it builds again from the end of the hold)
    z.poise = Math.min(1, p0 + gain / resist * (z.special === 'charger' ? CHARGER : 1));
    if (z.poise < 1 || !this.ready(z, t) || !this.trickable(z, t)) return;
    let amt = e.blast ? Math.min(1.2, (e.raw || 0) / 80) : S.amt;
    if (amt < FLINCH) return;
    const leg = e.hitgroup === 6 || e.hitgroup === 7;
    const ko = leg && S.leg > 0 && Math.random() < S.leg * LEG_KO * (D?.knockdown ?? 1) / (1 + DR_K * this.recent(z, t)) && z.variant !== 'crawler';
    if (ko) amt = KNOCKDOWN;
    const kind = ko ? 'knockdown' : 'stagger';
    const secs = ko ? KNEEL + GETUP : Math.min(HOLD_MAX, HOLD * amt);
    this.start(z, kind, secs, e.dir, S.push || 0, src, by, amt);
  }

  // ---------------------------------------------------------------- fire (fire.js)
  /**
   * fire.update, every tick for a burning zombie (not a boss): it panics now and then (runs off
   * flailing, no swing), and passes the fire on to the ones it brushes past (capped).
   */
  burning(z, b, t) {
    if (!this.Z.enabled || !z.alive || z.variant === 'burning' || z.isBoss) return; // (the roster's burning ones are made of fire)
    if ((!z.staggerN || !(z.panicNext > t)) && z.special !== 'charger' && !(z.staggerUntil > t) && this.trickable(z, t)) {
      const secs = rand(PANIC[0], PANIC[1]) / (this.Z.diff.stagger?.resist || 1);
      z.panicUntil = t + secs; z.panicNext = t + PANIC_EVERY;
      z.panicYaw = z.pm.angles[1] + (Math.random() < 0.5 ? -1 : 1) * rand(70, 160);
      z.staggerKind = 'stagger';
      z.staggerUntil = z.panicUntil;
      z.staggerFree = z.panicUntil;
      z.staggerN = (z.staggerN || 0) + 1;
      this.loseSwing(z);
      this.counts.panic++;
      this.emit(z, b.by, 'stagger', 'fire', 1);
      this.game.sound?.play('zombie_pain', { pos: z.eyePos(), volume: 0.9, channel: `${z.id}:voice` });
    }
    if ((b.gen | 0) >= SPREAD_GEN || t < (z.spreadT || 0)) return;
    z.spreadT = t + SPREAD_EVERY;
    const fire = this.game.fire;
    let caught = 0;
    for (const q of fire.burning) if (q.burn && q.burn.gen > 0 && q.alive) caught++;
    if (caught >= SPREAD_MAX) return;
    const o = z.pm.origin;
    for (const q of this.Z.pool) {
      if (q === z || !q.alive || q.burn || q.variant === 'burning') continue;
      const dx = q.pm.origin[0] - o[0], dy = q.pm.origin[1] - o[1];
      if (dx > SPREAD_R || dx < -SPREAD_R || dy > SPREAD_R || dy < -SPREAD_R || dx * dx + dy * dy > SPREAD_R * SPREAD_R || Math.abs(q.pm.origin[2] - o[2]) > 50) continue;
      fire.burn(q, b.by, SPREAD_BURN, b.dps * 0.6, b.weapon);
      if (q.burn) q.burn.gen = (b.gen | 0) + 1;
      this.counts.spread++;
      if (++caught >= SPREAD_MAX) return;
    }
  }

  emit(z, by, kind, src, amount) {
    const ev = this.Z.events;
    if (!inSquad(by) || !ev.has('stagger')) return;
    const e = ev.obj('stagger');
    e.zombie = z; e.by = by; e.kind = kind; e.src = src || 'world'; e.amount = amount;
    e.until = z.staggerUntil || 0; e.wave = this.Z.wave; e.t = this.game.time;
    ev.emit('stagger', e);
  }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /**
   * Per frame (game.frame, zombie mode only): what the models show next frame - reeling while
   * staggered, on its knees (a knockdown; a crawler for good: model.crawl), the tesla's
   * shakes, arms flailing while it panics.
   */
  frame(dt) {
    void dt;
    const t = this.game.time;
    for (const z of this.Z.pool) {
      const m = z.model;
      if (!z.alive || !m) continue;
      const held = z.staggerUntil > t, kind = z.staggerKind;
      const panic = z.panicUntil > t;
      m.reelT = held && kind === 'stagger' && !panic ? 1 : 0;
      m.kneelT = (held && kind === 'knockdown' && t < z.staggerUntil - GETUP) || z.variant === 'crawler' ? 1 : 0; // (the roster's crawlers crawl in it too; or model.crawl)
      m.stunT = held && kind === 'stun' ? 1 : 0;
      m.flailT = panic ? 1 : 0;
      if (z.variant === 'crawler' && !m.crawl && (!held || m.kneelW > 0.9)) m.crawl = true; // (roster.become: down on its knees, then flat on its belly)
    }
  }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
