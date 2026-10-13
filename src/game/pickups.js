// Zombie survival drops, power-ups and airdrops (Milestone 3.5, owner: drops). Kills leave
// small loot (cash, ammo, a health vial) within a per-wave budget (diff.drops); rare power-ups
// (powerups.js: Max Ammo, Insta-Kill, Double Cash, Nuke, Fire Sale); a mid-wave flare marks an
// airdrop crate (a heavy gun or a rare weapon kit) worth a run across open ground (airdrop.js).
// Loot fades after diff.drops.life s, blinking faster and faster through its last BLINK s.
//
// Contract (m3-contracts section 6) - one list for everything on the floor: game.dropped.
// A weapon entry is { kind: 'weapon', weapon, pos, vel, obj, rest, time } as always; a pickup
// is { kind, id, amount, data, pos, vel, obj, rest, time, expire, reach, gravity, taken }.
// game.updateDropped moves them all (gravity, bounce, settle) and hands a touch to
// game.tryPickup, which sends every kind but 'weapon' here (take). Kinds are PICKUP_KINDS rows:
//   { label, rgb, reach (u; how close counts as a touch), life (true: diff.drops.life s, a
//     number: s, 0: never fades), who ('squad': anyone in it, up and not down; 'human': you),
//     model (a MODELS id), spin (rad/s) / bob (u) on the floor, gravity (u/s^2; 800),
//     sound (played when taken), canTake(Z, p, d) -> bool (optional), take(Z, p, d) -> true if
//     it was used up }
//   pickups.spawn(kind, pos, { id, amount, data, vel, life, reach, gravity }) -> the entry (or null)
//   pickups.register(kind, spec)   add / replace a kind (the trophy is relics.js TROPHY)
//   pickups.take(p, d)             game.tryPickup: p touched d; true if taken
//   pickups.count(kind) / list(kind)
//   pickups.botLoot(bot, it)       bots.js (zombie survival, nothing else to do): go and get loot
//                                  close by when it's safe; true when that's what it's doing
// Events: 'pickup' { phase: 'spawn' | 'take' | 'expire', kind, id, amount, player, pos },
// 'powerup' { phase: 'on' | 'off', id, player, until }, 'airdrop' { phase: 'call' | 'land' |
// 'open', id, pos } (runstats.js).
// Difficulty: g.zombies.diff.drops { budget, chance, powerup, pity, life, powerupSecs,
// airdropFrom, airdropChance, crateLife, vial, cash, nukePay, fireSale, floor } (zdiff.js).
// Console: zm_drops; with sv_cheats 1: zm_drop <kind> [id] [amount] (in front of you),
// zm_airdrop (a flare now).
//
// Loot rules (onKill): only kills by the squad, mid-wave, never a boss's; a kill drops loot
// with diff.drops.chance (x2.5 a special, x0.5 a summoned extra, x the killer's luck, up to
// x1.6 when the squad is hurting) while the wave's budget lasts (base + perWave x wave, more
// for a bigger squad and a rush wave); an elite always drops something. Each drop is a power-up
// with diff.drops.powerup, + pity for every drop since the last one; else cash, ammo or a vial,
// weighted toward what the squad is short of. At most diff.drops.floor bits of small loot lie
// about at once (the oldest fades first) and two power-ups.
import * as THREE from 'three';
import { inSquad } from './runstats.js';
import { TROPHY } from './relics.js';
import { POWERUPS, installHooks, removeHooks } from './powerups.js';
import { angleVectors } from '../engine/coords.js';
import { rng } from './zrng.js';
import { LOOT_MODELS, powerupModel, crateModel } from '../assets/dropmodels.js';
import { Airdrops } from './airdrop.js';
import { DropHud } from './drophud.js';

const rand = (a, b) => a + Math.random() * (b - a);
const BLINK = 5; // s before fading out that it starts to blink
const PU_MAX = 2; // power-ups on the floor at once
const _f = [0, 0, 0];
// x the wave's loot budget by its type (director.js MODS): more bodies, more loot
const MOD_LOOT = { rush: 1.3, specials: 1.15, elites: 1.15, crawlers: 1.1 };

const refill = (w, packs) => {
  if (!w || !w.def.ammoBuy || w.ammo >= w.def.maxAmmo) return false;
  w.ammo = Math.min(w.def.maxAmmo, w.ammo + Math.round(w.def.ammoBuy.amount * packs));
  return true;
};

export const PICKUP_KINDS = {
  cash: {
    label: 'Cash', rgb: [90, 230, 90], reach: 32, life: true, who: 'squad', model: 'cash', spin: 0.9, bob: 1.5, sound: 'loot_cash',
    take(Z, p, d) {
      const m0 = p.money;
      Z.economy.pay(p, d.amount ?? 50, 'pickup');
      Z.pickups.toast(p, `+$${p.money - m0}`, this.rgb);
      return true;
    },
  },
  ammo: {
    label: 'Ammo', rgb: [220, 190, 90], reach: 32, life: true, who: 'squad', model: 'ammo', spin: 0.9, bob: 1.5, sound: 'loot_ammo',
    canTake(Z, p) { return [p.weapons[1], p.weapons[2]].some((w) => w && w.def.ammoBuy && w.ammo < w.def.maxAmmo); },
    take(Z, p, d) {
      const a = refill(p.weapons[1], d.amount ?? 1), b = refill(p.weapons[2], d.amount ?? 1);
      if (a || b) Z.pickups.toast(p, 'AMMO', this.rgb);
      return a || b;
    },
  },
  health: {
    label: 'Health', rgb: [240, 90, 80], reach: 32, life: true, who: 'squad', model: 'health', spin: 0.9, bob: 1.5, sound: 'loot_health',
    canTake(Z, p) { return p.health < p.maxHealth; },
    take(Z, p, d) {
      const h0 = p.health;
      p.health = Math.min(p.maxHealth, p.health + (d.amount ?? Z.diff.drops.vial ?? 25));
      if (p.isLocal) Z.game.hud?.healFlash?.();
      Z.pickups.toast(p, `+${Math.round(p.health - h0)} HEALTH`, this.rgb);
      return true;
    },
  },
  powerup: {
    label: 'Power-up', rgb: [255, 255, 255], reach: 36, life: true, who: 'squad', model: 'powerup', spin: 1.6, bob: 4, sound: 'powerup_grab',
    take(Z, p, d) { return Z.pickups.power(p, d); },
  },
  airdrop: {
    // opened by holding use beside it (airdrop.js), never by walking over it
    label: 'Airdrop', rgb: [255, 140, 40], reach: 40, life: 0, who: 'squad', model: 'airdrop', gravity: 320, sound: null,
    canTake() { return false; },
    take(Z, p, d) { return Z.pickups.air.open(p, d); },
  },
  trophy: TROPHY,
};

// ---------------------------------------------------------------- models
const GEO = new Map(), MAT = new Map();
const geo = (key, make) => GEO.get(key) || (GEO.set(key, make()), GEO.get(key));
const mat = (hex) => MAT.get(hex) || (MAT.set(hex, new THREE.MeshBasicMaterial({ color: hex })), MAT.get(hex));
const box = (x, y, z) => geo(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));
const part = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

/**
 * Models by id (GoldSrc axes: z up, the origin on the floor): (d: { id, data }) -> [Object3D];
 * parts with userData.fixed don't spin or bob (ground glows, beams). dropmodels.js builds them.
 */
export const MODELS = {
  cash: LOOT_MODELS.cash,
  ammo: LOOT_MODELS.ammo,
  health: LOOT_MODELS.health,
  powerup: (d) => powerupModel(d.id, POWERUPS[d.id]?.rgb || [255, 255, 255]),
  airdrop: () => crateModel().parts,
  trophy: () => [part(geo('ico', () => new THREE.IcosahedronGeometry(5, 0)), mat(0xffc040), 0, 0, 10), part(box(8, 8, 3), mat(0x2a2016), 0, 0, 1.5)],
};

export class Pickups {
  constructor(game) {
    this.game = game;
    this.kinds = { ...PICKUP_KINDS };
    this.subscribed = false;
    this.budget = 0; this.spent = 0; // this wave's loot
    this.sincePU = 0; this.lastPU = null; // drops since the last power-up (pity); the last one's id
    this.active = new Map(); // power-up id -> { until, secs, by } (the timed ones running)
    this.nukeQ = []; // [{ z, at }]: a Nuke's wave of deaths
    this.powerHooks = null; // the zmods hooks Insta-Kill / Fire Sale need while they run (powerups.js)
    this.hums = new Map(); // a power-up on the floor -> its hum (sound handle)
    this.rnd = Math.random;
    this.stats = { drops: 0, powerups: 0, taken: 0, expired: 0 }; // this run (tests, the run report)
    this.hs = { buffs: [], crate: null, prompt: null }; // pickups.hud's state (reused)
    this.air = new Airdrops(this);
    this.ui = new DropHud(this);
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }
  get D() { return this.game.zombies.diff.drops; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('wave', (e) => { if (e.phase === 'start') this.onWave(e.wave, e.boss); });
    ev.on('kill', (e) => this.onKill(e));
    ev.on('perk', (e) => { if (e.phase === 'expire') this.buffOver(e.id); });
  }

  /** A new run (ZombieMode.start already cleared the floor: game.clearDropped). */
  reset() {
    this.budget = 0; this.spent = 0; this.sincePU = 0; this.lastPU = null;
    this.active.clear();
    removeHooks(this.Z);
    this.nukeQ.length = 0;
    for (const h of this.hums.values()) h.stop(0.1);
    this.hums.clear();
    this.rnd = rng(this.Z.seed >>> 0, 'drops');
    this.stats.drops = this.stats.powerups = this.stats.taken = this.stats.expired = 0;
    this.air.reset();
    this.ui.reset();
  }

  /** Add or replace a kind (spec: the PICKUP_KINDS row shape). */
  register(kind, spec) { this.kinds[kind] = spec; }

  // ---------------------------------------------------------------- the loot rules
  /** Wave n starts: its loot budget, and maybe an airdrop later in it. */
  onWave(n, boss) {
    const D = this.D, Z = this.Z;
    const crowd = Z.waveOpts().crowd;
    const k = (MOD_LOOT[Z.stats?.mod] || 1) * Math.min(2, 1 + 0.25 * Math.max(0, crowd - 1));
    this.budget = Math.round((D.budget[0] + D.budget[1] * n) * k);
    this.spent = 0;
    this.air.plan(n, boss);
  }

  /** The squad's need (0..1) of health and of ammo for its guns, for the loot's odds. */
  need() {
    let hp = 0, ammo = 0, n = 0, guns = 0;
    for (const q of this.game.players) {
      if (!inSquad(q) || !q.alive) continue;
      n++;
      hp += q.downed ? 1 : 1 - Math.max(0, q.health) / (q.maxHealth || 100);
      const w = q.weapons[1] || q.weapons[2];
      if (w && w.def.maxAmmo > 0) { guns++; ammo += 1 - w.ammo / w.def.maxAmmo; }
    }
    return { hp: n ? hp / n : 0, ammo: guns ? ammo / guns : 0 };
  }

  /** A death (the 'kill' event): loot from the squad's kills, within the wave's budget. */
  onKill(e) {
    const Z = this.Z;
    if (!Z.enabled || Z.state !== 'wave' || !e.zombie || e.boss || !e.squad) return;
    const v = e.victim, D = this.D;
    const elite = !!v.elite;
    if (!elite && this.spent >= this.budget) return;
    const need = this.need();
    const luck = 1 + Z.mods.factor(e.attacker, 'luck');
    const chance = D.chance * (e.special ? 2.5 : 1) * (e.extra ? 0.5 : 1) * Math.max(0, luck) * (1 + 0.6 * need.hp);
    if (!elite && this.rnd() >= chance) return;
    if (!elite) this.spent++;
    const o = v.pm.origin;
    this.drop([o[0], o[1], o[2] + 8], need, elite);
  }

  /** One drop at pos: a power-up (rare; pity raises the odds) or cash / ammo / a vial by need. */
  drop(pos, need = this.need(), forcePU = false) {
    const D = this.D, Z = this.Z, t = this.game.time;
    this.stats.drops++;
    let pu = null;
    if (this.count('powerup') < PU_MAX && (forcePU || this.rnd() < Math.min(0.6, D.powerup + D.pity * this.sincePU))) pu = this.rollPowerup();
    const vel = [rand(-70, 70), rand(-70, 70), rand(160, 230)];
    let d;
    if (pu) {
      this.sincePU = 0; this.lastPU = pu;
      this.stats.powerups++;
      d = this.spawn('powerup', pos, { id: pu, vel });
      if (d) this.game.sound?.play('powerup_spawn', { pos, volume: 1 });
    } else {
      this.sincePU++;
      const w = { cash: 1, ammo: 0.45 + 1.4 * need.ammo, health: 0.35 + 1.8 * need.hp };
      let x = this.rnd() * (w.cash + w.ammo + w.health);
      const kind = (x -= w.cash) < 0 ? 'cash' : (x -= w.ammo) < 0 ? 'ammo' : 'health';
      const amount = kind === 'cash' ? Math.max(10, Math.round(Z.economy.killValue(false) * D.cash * rand(0.8, 1.25) / 5) * 5) : kind === 'health' ? D.vial : 1;
      this.trim(t);
      d = this.spawn(kind, pos, { amount, vel });
      if (d) this.game.sound?.play('loot_drop', { pos, volume: 0.8 });
    }
    return d;
  }

  /** Which power-up: by weight, from its first wave on, never the same twice in a row; mid-wave ones only in a wave. */
  rollPowerup() {
    const Z = this.Z, n = Math.max(1, Z.wave), need = this.need();
    let total = 0;
    const pool = [];
    for (const id in POWERUPS) {
      const P = POWERUPS[id];
      if (n < (P.from || 1) || id === this.lastPU || (P.wave && Z.state !== 'wave')) continue;
      const w = P.weight * (id === 'maxammo' ? 0.6 + 1.5 * need.ammo : 1);
      pool.push(id, w); total += w;
    }
    if (!pool.length) return 'maxammo';
    let x = this.rnd() * total;
    for (let i = 0; i < pool.length; i += 2) { x -= pool[i + 1]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 2];
  }

  /** Too much small loot on the floor: the oldest starts to fade now. */
  trim(t) {
    let n = 0, old = null;
    for (const d of this.game.dropped) {
      if (d.taken || (d.kind !== 'cash' && d.kind !== 'ammo' && d.kind !== 'health')) continue;
      n++;
      if (d.expire > t + 1.5 && (!old || d.time < old.time)) old = d;
    }
    if (n >= this.D.floor && old) old.expire = t + 1.5;
  }

  // ---------------------------------------------------------------- spawn / take
  /** Put a kind of pickup down at pos (it falls and settles). o: { id, amount, data, vel, life (s), reach, gravity }. */
  spawn(kind, pos, o = {}) {
    const g = this.game, K = this.kinds[kind];
    if (!K || kind === 'weapon') return null;
    const d = {
      kind, id: o.id ?? null, amount: o.amount ?? null, data: o.data || null, weapon: null,
      pos: pos.slice(), vel: o.vel ? o.vel.slice() : [rand(-50, 50), rand(-50, 50), 140],
      obj: null, rest: false, time: g.time, expire: 0,
      reach: o.reach ?? K.reach ?? 28, gravity: o.gravity ?? K.gravity ?? 800, taken: false,
    };
    d.obj = this.model(K, d);
    d.obj.userData.pickup = d;
    const life = o.life ?? (K.life === true ? this.D.life : K.life || 0);
    d.expire = life > 0 ? g.time + life : 0;
    d.obj.position.set(pos[0], pos[1], pos[2]);
    g.renderer?.world?.add(d.obj);
    g.dropped.push(d);
    this.emit('spawn', d, null);
    return d;
  }

  model(K, d) {
    const grp = new THREE.Group();
    grp.name = `pickup_${K.model}`;
    const inner = new THREE.Group(); // (spun and bobbed by frame)
    for (const m of (MODELS[K.model] || MODELS.ammo)(d)) (m.userData.fixed ? grp : inner).add(m);
    grp.add(inner);
    grp.userData.inner = inner;
    grp.userData.dispose = () => {}; // (shared geometry and materials)
    return grp;
  }

  /** May p have it at all (K.who)? */
  may(p, K) {
    if (!p.alive || p.downed || !inSquad(p)) return false;
    return K.who !== 'human' || !p.isBot;
  }

  /** game.tryPickup: p touched d. True if it was taken. */
  take(p, d) {
    const K = this.kinds[d.kind];
    if (!K || d.taken || !this.may(p, K)) return false;
    if (K.canTake && !K.canTake(this.Z, p, d)) return false;
    if (!K.take(this.Z, p, d)) return false;
    this.remove(d);
    const snd = K.sound === undefined ? 'ammo_pickup' : K.sound;
    if (snd) this.game.sound?.play(snd, { pos: p === this.game.viewTarget ? null : p.eyePos(), volume: 0.9 });
    this.stats.taken++;
    this.emit('take', d, p);
    return true;
  }

  remove(d) {
    d.taken = true;
    d.obj.removeFromParent();
    d.obj.userData.dispose?.();
    const h = this.hums.get(d);
    if (h) { h.stop(0.15); this.hums.delete(d); }
  }

  emit(phase, d, p) {
    this.Z.events.mode('pickup', { phase, kind: d.kind, id: d.id, amount: d.amount, player: p, pos: d.pos });
  }

  list(kind = null) { return this.game.dropped.filter((d) => d.kind !== 'weapon' && !d.taken && (!kind || d.kind === kind)); }
  count(kind = null) { let n = 0; for (const d of this.game.dropped) if (d.kind !== 'weapon' && !d.taken && (!kind || d.kind === kind)) n++; return n; }

  /** A short line under the crosshair for what you picked up (yours only). */
  toast(p, text, rgb) { if (p === this.game.local) this.ui.toast(text, rgb); }

  // ---------------------------------------------------------------- power-ups
  /** p took power-up d: its buff on the squad (or p), its effect, the banner, the announcer. */
  power(p, d) {
    const P = POWERUPS[d.id], Z = this.Z, g = this.game;
    if (!P) return false;
    if (P.buff === 'instakill' || P.buff === 'firesale') installHooks(Z);
    let until = 0;
    if (P.buff) {
      const secs = d.data?.secs ?? null;
      until = Z.perks.buff(P.squad ? 'squad' : p, P.buff, secs, { source: 'powerup' });
      this.active.set(d.id, { until, secs: until - g.time, by: p });
    }
    if (P.apply) P.apply(Z, p, d);
    if (P.sound) g.sound?.play(P.sound, { volume: 1, attenuation: 'none' });
    g.announce?.(P.say || P.name);
    this.ui.banner(d.id, p);
    Z.events.mode('powerup', { phase: 'on', id: d.id, player: p, until });
    return true;
  }

  /** A timed buff ran out (the 'perk' expire event). */
  buffOver(buffId) {
    for (const [id, A] of this.active) {
      if (POWERUPS[id].buff !== buffId) continue;
      this.active.delete(id);
      if (this.Z.state !== 'idle' && this.Z.state !== 'over') {
        this.game.sound?.play('powerup_fade', { volume: 0.8, attenuation: 'none' });
        this.ui.toast(`${POWERUPS[id].name} IS OVER`, POWERUPS[id].rgb, 2);
      }
      this.Z.events.mode('powerup', { phase: 'off', id, player: A.by, until: 0 });
    }
    if (!this.active.has('instakill') && !this.active.has('firesale')) removeHooks(this.Z);
  }

  /** Fire Sale (powerups.js): the bots go shopping too, at the sale price. */
  fireSale() {
    const Z = this.Z;
    for (const b of this.game.bots.bots) {
      const q = b.p;
      if (inSquad(q) && q.alive && !q.downed) Z.economy.botBuy(b);
    }
  }

  /**
   * Nuke (powerups.js): every zombie on the map dies in a wave rolling out from where it was
   * taken (bosses untouched; an elite loses 40% of its health), charred; the squad gets a flat
   * diff.drops.nukePay instead of kill money, and the dead drop nothing.
   */
  nuke(p, pos) {
    const g = this.game, Z = this.Z, t = g.time;
    const o = pos || p.pm.origin;
    for (const z of Z.pool) {
      if (!z.alive || z.isBoss) continue;
      const d = Math.hypot(z.pm.origin[0] - o[0], z.pm.origin[1] - o[1]);
      this.nukeQ.push({ z, at: t + 0.12 + Math.min(1.1, d / 2400) });
    }
    this.ui.flash();
    g.addShake?.(9, 1.4);
    for (const q of g.players) if (inSquad(q) && q.alive) Z.economy.pay(q, this.D.nukePay, 'pickup');
  }

  nukeTick(t) {
    const g = this.game, Z = this.Z, Q = this.nukeQ;
    for (let i = 0; i < Q.length; i++) {
      const e = Q[i];
      if (t < e.at) continue;
      Q.splice(i--, 1);
      const z = e.z;
      if (!z.alive) continue;
      const c = z.pm.origin;
      for (let k = 0; k < 6; k++) g.fire?.emit(k % 2 ? 'ember' : 'fire', [c[0] + rand(-10, 10), c[1] + rand(-10, 10), c[2] + rand(-20, 30)], [rand(-60, 60), rand(-60, 60), rand(60, 200)], { life: rand(0.4, 0.9), size: rand(8, 14), size1: rand(18, 30), drag: 2, buoy: 120 });
      if (z.elite) { g.damagePlayer(z, null, z.maxHealth * 0.4, 0, 'nuke', null, null, { blast: true, fire: true }); continue; }
      // a boomer or a bloater bursting on top of somebody would turn the Nuke on the squad: those just go up in ash
      const near = (z.special === 'boomer' || z.gassy) && g.players.some((q) => inSquad(q) && q.alive && Math.hypot(q.pm.origin[0] - c[0], q.pm.origin[1] - c[1]) < 300);
      if (near) {
        for (let k = 0; k < 14; k++) g.fire?.emit('smoke', [c[0] + rand(-16, 16), c[1] + rand(-16, 16), c[2] + rand(-30, 30)], [rand(-40, 40), rand(-40, 40), rand(20, 90)], { life: rand(1.2, 2), size: rand(14, 24), size1: rand(40, 70), drag: 1.2, buoy: 20 });
        if (!z.extra) Z.killed++;
        Z.despawn(z);
        continue;
      }
      z.char = 0.85;
      z.model?.setChar?.(0.85);
      g.killPlayer(z, null, 'nuke', false);
    }
  }

  // ---------------------------------------------------------------- bots
  /**
   * bots.js objective (zombie survival, nothing better to do): a bot goes for loot it can use
   * close by when no zombie is near it or the loot, and the loot is nearer to it than to any
   * human (yours first) - power-ups only when no human is about to get them in time. True
   * while it's on its way (it.move set).
   */
  botLoot(bot, it) {
    const g = this.game, Z = this.Z, p = bot.p, t = g.time;
    if (!Z.enabled || (Z.state !== 'wave' && Z.state !== 'break') || p.downed || !inSquad(p)) return false;
    if (bot.lootT && t < bot.lootT) {
      const d = bot.loot;
      if (!d || d.taken || !d.rest) { bot.loot = null; return false; }
      if (d.claim && d.claim !== bot) return false;
      d.claim = bot; d.claimT = t;
      if (d.kind === 'airdrop' && Math.hypot(d.pos[0] - p.pm.origin[0], d.pos[1] - p.pm.origin[1]) < 44) { it.use = true; it.stop = true; it.look = [d.pos[0], d.pos[1], d.pos[2] + 10]; bot.lootT = t + 0.3; return true; } // (holding use on the crate: airdrop.js)
      it.move = [d.pos[0], d.pos[1], d.pos[2]]; it.tol = 6;
      return true;
    }
    bot.lootT = t + 0.5;
    bot.loot = null;
    if (bot.zombieNear(450, 700)) return false;
    const o = p.pm.origin;
    let best = null, bd = Infinity;
    for (const d of g.dropped) {
      if (d.taken || !d.rest || d.kind === 'weapon' || d.kind === 'trophy') continue;
      if (d.claim && d.claim !== bot && t - d.claimT < 1) continue;
      const K = this.kinds[d.kind];
      if (!K || (K.canTake && d.kind !== 'airdrop' && !K.canTake(Z, p, d))) continue;
      const dx = d.pos[0] - o[0], dy = d.pos[1] - o[1], dist = Math.hypot(dx, dy);
      if (dist > 700 || Math.abs(d.pos[2] - (o[2] - 36)) > 120) continue;
      const left = d.expire ? d.expire - t : 99;
      // a human closer to it (or on the way): theirs, unless it's about to fade
      let human = Infinity;
      for (const q of g.players) if (inSquad(q) && !q.isBot && q.alive && !q.downed) human = Math.min(human, Math.hypot(d.pos[0] - q.pm.origin[0], d.pos[1] - q.pm.origin[1]));
      if (d.kind === 'powerup' || d.kind === 'airdrop') { if (human < 1500 && left > 8) continue; }
      else if (human < dist && left > 10) continue;
      if (d.kind === 'airdrop' && (d.opened || this.air.state !== 'landed' || (this.air.opener && this.air.opener !== p))) continue;
      // nothing waiting for it by the loot
      if (Z.pool.some((z) => z.alive && Math.hypot(z.pm.origin[0] - d.pos[0], z.pm.origin[1] - d.pos[1]) < 350)) continue;
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return false;
    bot.loot = best; bot.lootT = t + 3;
    best.claim = bot; best.claimT = t;
    it.move = [best.pos[0], best.pos[1], best.pos[2]]; it.tol = 6;
    return true;
  }

  // ---------------------------------------------------------------- hooks
  /** Every tick (ZombieMode.tick): loot blinks out over its last BLINK s and fades; the Nuke; airdrops. */
  tick(t) {
    for (const d of this.game.dropped) {
      if (d.taken || d.kind === 'weapon') continue;
      if (d.kind === 'powerup' && d.rest && !this.hums.has(d)) this.hums.set(d, this.game.sound?.loop('powerup_loop', { pos: d.pos, volume: 0.55 }) || { stop() {} });
      if (!d.expire) continue;
      if (t >= d.expire) {
        if (d.kind === 'powerup') this.game.sound?.play('powerup_vanish', { pos: d.pos, volume: 0.8 });
        this.remove(d); this.stats.expired++; this.emit('expire', d, null);
        continue;
      }
      const left = d.expire - t;
      // faster as it runs out: 2 blinks a second to 8
      d.obj.visible = left > BLINK || ((t * (2 + 6 * (1 - left / BLINK))) % 1) < 0.62;
    }
    if (this.nukeQ.length) this.nukeTick(t);
    this.air.tick(t);
  }

  /** HUD state (buildHudState, every frame): s.drops { buffs: [{ id, left, frac }], crate, prompt }. */
  hud(s) {
    const H = this.hs, t = this.game.time;
    H.buffs.length = 0;
    for (const [id, A] of this.active) {
      const left = A.until - t;
      if (left <= 0) continue;
      const b = this.ui.buffRow(H.buffs.length);
      b.id = id; b.left = left; b.frac = A.secs > 0 ? left / A.secs : 0;
      H.buffs.push(b);
    }
    this.air.hud(H);
    s.drops = H;
  }

  /** Per frame (game.frame, zombie mode only): loot spins and bobs, glows pulse; the flare and the crate. */
  frame(dt) {
    const t = this.game.time;
    for (const d of this.game.dropped) {
      if (d.kind === 'weapon' || d.taken) continue;
      const K = this.kinds[d.kind], inner = d.obj.userData.inner;
      if (!K || !inner) continue;
      if (K.spin) inner.rotation.z += K.spin * dt;
      if (K.bob) inner.position.z = K.bob * (0.5 + 0.5 * Math.sin(t * 2.4 + d.time));
      const pulse = 0.85 + 0.15 * Math.sin(t * 5 + d.time * 3);
      for (const c of inner.children) if (c.userData.halo) c.scale.setScalar(c.userData.halo * pulse);
    }
    this.air.frame(dt);
  }

  /** zm_drops; with sv_cheats 1: zm_drop <kind> [id] [amount], zm_airdrop. */
  command(p, cmd, args = []) {
    const g = this.game, out = (t) => g.console?.print?.(t);
    if (cmd === 'zm_drops') {
      const l = this.list().map((d) => `${d.kind}${d.id ? ':' + d.id : ''}${d.expire ? ` ${Math.max(0, d.expire - g.time).toFixed(0)}s` : ''}`).join(', ') || 'nothing on the floor';
      out(`${l} | loot this wave ${this.spent}/${this.budget}${this.active.size ? ` | on: ${[...this.active.keys()].join(', ')}` : ''}${this.air.state ? ` | airdrop: ${this.air.state}` : ''}`);
      return true;
    }
    if (cmd !== 'zm_drop' && cmd !== 'zm_airdrop') return false;
    if (!g.console?.cheats) { out(`${cmd} needs sv_cheats 1`); return true; }
    if (cmd === 'zm_airdrop') {
      this.Z.taint();
      out(this.air.call(true) ? 'airdrop: a flare is up' : 'zm_airdrop: no spot for it (or one is already coming)');
      return true;
    }
    const kind = String(args[0] || '');
    if (!this.kinds[kind] || kind === 'weapon') { out(`zm_drop <${Object.keys(this.kinds).join('|')}> [id] [amount]`); return true; }
    if (kind === 'powerup' && args[1] && !POWERUPS[args[1]]) { out(`zm_drop powerup <${Object.keys(POWERUPS).join('|')}>`); return true; }
    if (!p.alive) { out('zm_drop: you are dead'); return true; }
    angleVectors(0, p.pm.angles[1], _f, null, null);
    const o = p.pm.origin, pos = [o[0] + _f[0] * 80, o[1] + _f[1] * 80, o[2] + 10];
    this.Z.taint();
    const id = args[1] || (kind === 'powerup' ? this.rollPowerup() : kind === 'airdrop' ? 'minigun' : null);
    const d = this.spawn(kind, pos, { id, amount: args[2] != null ? +args[2] : kind === 'health' ? this.D.vial : null, vel: [0, 0, 60] });
    if (d && kind === 'airdrop') this.air.adopt(d);
    out(d ? `${kind}${d.id ? ' ' + d.id : ''} dropped` : 'zm_drop: no');
    return true;
  }
}

