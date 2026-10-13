// Zombie survival weapon forge (Milestone 3.2, owner: forge). Forge any gun up through Tiers
// I-V at the break for damage, magazine size and reload speed, with a tier paint; from Tier
// III (diff.forge.roundFrom) it takes one round type: Incendiary, Shock, Cryo, Explosive
// (small blasts that never gib a corpse) or Vampiric. A Tier V Deagle stays viable at wave 25.
//
// Contract (m3-contracts section 5):
//  - the weapon carries it: w.tier (0-5) and w.round (a ROUNDS id or null), folded by
//    attachments.js refresh() into the weapon layer w.mods: m.damage, m.clip, m.reload and
//    m.handling (time multipliers; weaponsys reads them next to its holder's ctx.zk). The tables
//    are in attachments.js (TIERS, tierStats); the player layer (perks: zmods.js) multiplies.
//  - buy items 'tier_<n>' / 'round_<id>' (buydata.js: the Weapon Forge page of Upgrades and its
//    Elemental Rounds page): rounds.buyItem routes /^(att|skin|tier|round)_/ to
//    attachments.buyUpgrade, which hands them here (buy); the economy asks price / menuState for
//    the menu (zeconomy.js base / owned). Break-only, like the attachments (the economy's gate).
//    Prices: TIER_BASE + the gun's price x TIER_GUN (rounds: the round's price + 10% of the
//    gun's), x diff.forge.priceK.
//  - the tesla, chainsaw, flamethrower and projectiles read w.mods.damage too (game.js sawFrom /
//    zapFrom, fire.js stream, projectiles.js launch).
//  - procs on the bus 'hit' (a squad member's bullet hit on a zombie, the gun in hand loaded):
//    a per-weapon chance (PROC: per pellet for the shotguns, low for the minigun and AA-12) x
//    diff.forge.procK, one proc a trigger pull at most (the shot id), and a per-victim cooldown
//    per round type (CD). A proc's own damage goes in while `busy` (it can't proc again) and is
//    blast / fire damage, never explode: true (no gibs, corpses stay whole).
// The rounds:
//  - Incendiary: sets it alight (fire.js burn: it burns, panics, may pass it on: zstagger.js)
//  - Shock: arcs on from it to the nearest zombies (2, +1 a tier past III), a jolt each; the
//    one hit is stunned a moment (the tesla's stun: zstagger.js)
//  - Cryo: chills (slower); the second chill freezes a common solid for CRYO.freeze s (no step,
//    no claw, the pose held: zombies.js modelDt, ice crystals on it, +25% damage taken: a zmods
//    'out' hook, registered on the first freeze); a special is stunned instead, a boss only
//    slowed; a frozen one that dies shatters (ice, not gore)
//  - Explosive: a small blast where the round lands (every zombie close by; never the squad)
//  - Vampiric: a little health back (at most diff.forge.leech HP a second; not while down)
// Bots forge their main gun at the end of a break, up to diff.forge.botTier (from roundFrom a
// round too): they support the squad, they don't carry it.
// Events: 'forge' { player, weapon (id), kind: 'tier' | 'round', tier, round, cost }, 'proc'
// { attacker, victim, round, weapon } (hot: obj / emit behind has()).
// Difficulty: g.zombies.diff.forge { priceK, tiers, roundFrom, procK, leech, botTier } (zdiff.js).
// Console: zm_forgeinfo (your guns, the procs so far), zm_forge <tier> [round|none] (sv_cheats).
import * as THREE from 'three';
import * as ATT from './attachments.js';
import * as WS from './weaponsys.js';
import { inSquad } from './runstats.js';
import { HITGROUP } from './combatrules.js';
import { fontString } from '../ui/hud/font.js';

export const ROUNDS = {
  incendiary: { name: 'Incendiary Rounds', short: 'INCENDIARY', word: 'IGNITE', price: 1500, rgb: [255, 128, 40], tag: 'Sets them alight: they burn, and panic.',
    text: 'Rounds that set what they hit alight: it burns for 3 seconds, panics and may set the ones it brushes past on fire. Bosses made of fire shrug it off.' },
  shock: { name: 'Shock Rounds', short: 'SHOCK', word: 'SHOCK', price: 2000, rgb: [120, 180, 255], tag: 'Arcs on to the zombies close by and stuns the one hit.',
    text: 'Lightning arcs from what you hit on to the 2 nearest zombies (one more for every tier past III), jolting each; the one you hit is stunned a moment.' },
  cryo: { name: 'Cryo Rounds', short: 'CRYO', word: 'CHILL', price: 1800, rgb: [150, 225, 255], tag: 'Chills them; chill one again and it freezes solid.',
    text: 'Chills what you hit (much slower); chill it again and a common freezes solid for 1.6 s: no step, no claw, and 25% more damage from everyone. Specials are stunned instead, bosses only slowed. The frozen shatter when they die.' },
  explosive: { name: 'Explosive Rounds', short: 'EXPLOSIVE', word: 'BLAST', price: 2200, rgb: [255, 196, 70], tag: 'A small blast where the round lands.',
    text: 'A small blast where the round lands, hurting every zombie close by. Never you, never the squad, and nobody comes apart.' },
  vampiric: { name: 'Vampiric Rounds', short: 'VAMPIRIC', word: 'DRAIN', price: 2500, rgb: [235, 45, 60], tag: 'Draws a little health back from what you hit.',
    text: 'Draws a little health back to you from what you hit (a few points at a time, up to 8 a second on Normal; not while you are down).' },
};
export const ROUND_IDS = Object.keys(ROUNDS);
/** Tier colours (0-5): the HUD badge, the menu, the paint (vm/attach.js has its own finishes). */
export const TIER_RGB = [[200, 200, 200], [140, 175, 215], [215, 140, 70], [225, 230, 240], [255, 205, 80], [255, 110, 40]];

// prices: TIER_BASE[n] + the gun's price x TIER_GUN[n] (x diff.forge.priceK, to $50)
const TIER_BASE = [0, 400, 800, 1400, 2200, 3200];
const TIER_GUN = [0, 0.15, 0.25, 0.4, 0.55, 0.75];
const ROUND_GUN = 0.1;
// the chance a hit procs, by weapon id, else by kind (the shotguns: per pellet; one proc a pull)
const PROC = {
  pistol: 0.3, deagle: 0.45, elite: 0.16, shotgun: 0.06, xm1014: 0.05, aa12: 0.025, smg: 0.1, rifle: 0.15,
  sniper: 0.35, scout: 0.8, awp: 1, barrett: 0.7, crossbow: 0.9, mg: 0.07, minigun: 0.025,
};
const PROC_TIER = 0.15; // x (1 + this) for every tier past roundFrom
const CD = { incendiary: 1.2, shock: 0.8, cryo: 0.3, explosive: 0.4, vampiric: 0.2 }; // s, per victim
const AFTER_KILL = { incendiary: false, shock: true, cryo: true, explosive: true, vampiric: true }; // procs on the killing hit
const FIRE = { secs: 3, dps0: 4, dpsK: 0.2 };
const SHOCK = { jumps: 2, range: 210, dmg0: 8, dmgK: 0.4, fall: 0.75 };
const CRYO = { stacks: 2, slow: 0.35, bossSlow: 0.2, secs: 2.5, freeze: 1.6, after: 1.2, shatter: 0.25, splash: 90 };
const BLAST = { r0: 72, rTier: 8, dmg0: 12, dmgK: 0.45, push: 90 };
const LEECH = { base: 1, k: 0.06, max: 6 };
const BOT_AT = 1.2, BOT_KEEP = 1500; // s before a break ends that bots forge; $ they keep back
const BOT_ROUNDS = ['incendiary', 'shock'];
const ICE_MAX = 10, POP_MAX = 10, POP_LIFE = 0.9;
const TN = ATT.TIER_NAMES;
const BADGE = TN.map((n) => (n ? `TIER ${n}` : ''));
const SHOCK_TXT = ['SHOCK', 'SHOCK', 'SHOCK x2', 'SHOCK x3', 'SHOCK x4', 'SHOCK x5', 'SHOCK x6'];
const LEECH_TXT = Array.from({ length: 11 }, (_, i) => `+${i}`);
const ICE_RGB = [150, 215, 255], CHILL_RGB = [110, 175, 255], BLACK = [0, 0, 0];
const rnd = (a, b) => a + Math.random() * (b - a);
const round50 = (x) => Math.round(x / 50) * 50;
const gunName = (w) => WS.WEAPON_DEFS[w.id]?.shortName || w.def.shortName || w.def.name;
const _c = [0, 0, 0], _c2 = [0, 0, 0], _v = [0, 0, 0], _p = [0, 0, 0];
const _vec = new THREE.Vector3();

// particle option objects, reused (firefx copies them as it spawns)
const O = {
  fire: { life: 0.4, size: 10, size1: 26, drag: 2, buoy: 110, frame: 1 },
  ember: { life: 0.8, size: 2.5, size1: 1, drag: 0.8, buoy: 60 },
  volt: { life: 0.3, size: 2.2, size1: 0.6, drag: 1.5, buoy: -300 },
  frost: { life: 0.6, size: 3, size1: 1, drag: 1.5, buoy: -250 },
  shard: { life: 0.9, size: 3.5, size1: 1.5, drag: 0.6, buoy: -700, frame: 3 },
  icemist: { life: 1.2, size: 14, size1: 40, drag: 1.2, buoy: 15 },
  siphon: { life: 0.3, size: 4, size1: 2, drag: 0, buoy: 0 },
  smoke: { life: 1.1, size: 12, size1: 40, drag: 1.5, buoy: 30 },
  spark: { life: 0.45, size: 2, size1: 0.5, drag: 1, buoy: -500 },
};

export class ZForge {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.busy = 0; // a proc's own damage is going in (no procs off it)
    this.cold = new Set(); // zombies chilled or frozen (tick: the slow, the freeze)
    this.fxs = new Set(); // zombies with a rim to show (frame)
    this.chain = [];
    this.ice = []; // crystal clusters (lazily built; a frozen common wears one)
    this.pops = [];
    for (let i = 0; i < POP_MAX; i++) this.pops.push({ t: -9, x: 0, y: 0, z: 0, text: '', rgb: BLACK, dx: 0 });
    this.hudOut = { tier: 0, round: null };
    this.fonts = { px: 0, small: '', big: '' };
    this.hooked = false;
    this.healT = -9; this.healN = 0;
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
    game.hud?.addLayer?.((hud, s) => this.draw(hud, s), 1);
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('hit', (e) => this.onHit(e));
    ev.on('kill', (e) => this.onKill(e));
  }

  reset() {
    for (const z of this.fxs) this.clearZ(z);
    for (const z of this.cold) this.clearZ(z);
    this.fxs.clear(); this.cold.clear();
    for (const s of this.ice) { s.z = null; s.group.visible = false; }
    for (const p of this.pops) p.t = -9;
    this.botBreak = -1; this.botAt = 0;
    this.sndT = Object.create(null);
    // tallies (tests, tuning): procs by round, freezes, shatters, arcs, HP drained
    this.counts = { incendiary: 0, shock: 0, cryo: 0, explosive: 0, vampiric: 0, freeze: 0, shatter: 0, chain: 0, leech: 0, buys: 0 };
  }

  // ---------------------------------------------------------------- the shop
  /** zeconomy.base: the list price of a forge item for p (on the gun it goes on), or null (none: no gun, done, unknown). */
  price(p, item) {
    const w = ATT.forgeTarget(p);
    if (!w) return null;
    const D = this.Z.diff.forge, gp = w.def.price || 0;
    const [kind, id] = item.split('_');
    if (kind === 'tier') {
      const n = +id;
      if (!(n >= 1 && n <= D.tiers) || n <= (w.tier | 0)) return null;
      return round50((TIER_BASE[n] + gp * TIER_GUN[n]) * D.priceK);
    }
    if (kind === 'round') return ROUNDS[id] ? round50((ROUNDS[id].price + gp * ROUND_GUN) * D.priceK) : null;
    return null;
  }

  /** zeconomy.owned: { off, note, why } for the buy menu (why: the info panel). */
  menuState(p, item) {
    const w = ATT.forgeTarget(p), D = this.Z.diff.forge;
    if (!w) return { off: true, note: 'no gun', why: 'Hold the gun you want forged.' };
    const [kind, id] = item.split('_'), cur = w.tier | 0, name = gunName(w);
    if (kind === 'tier') {
      const n = +id;
      if (!(n >= 1 && n <= D.tiers)) return { off: true, note: 'n/a', why: `The forge goes up to Tier ${TN[D.tiers]} on this difficulty.` };
      if (n <= cur) return { off: true, note: 'forged', why: `Your ${name} is Tier ${TN[cur]}.` };
      const what = this.describe(w, n);
      if (n > cur + 1) return { off: true, note: `after ${TN[n - 1]}`, why: `Tier ${TN[n]}: ${what}` };
      return { off: false, note: null, why: `Tier ${TN[n]} on your ${name}: ${what}${n === D.roundFrom ? ' From this tier it takes a round type.' : ''}` };
    }
    if (kind === 'round') {
      if (!ROUNDS[id]) return { off: true, note: 'n/a' };
      if (!ATT.canRound(w)) return { off: true, note: 'n/a', why: `No rounds for the ${name}: only guns take them.` };
      if (cur < D.roundFrom) return { off: true, note: `tier ${TN[D.roundFrom]}`, why: `Forge your ${name} to Tier ${TN[D.roundFrom]} first (it is ${cur ? `Tier ${TN[cur]}` : 'as made'}).` };
      if (w.round === id) return { off: true, note: 'loaded', why: `Your ${name} fires ${ROUNDS[id].name}.` };
      return { off: false, note: null, why: `For your ${name} (Tier ${TN[cur]})${w.round ? `, instead of ${ROUNDS[w.round].name}` : ''}: procs on ${this.rateWord(w)} of its hits.` };
    }
    return { off: true, note: 'n/a' };
  }

  /** What tier n does to w, as a line: damage, magazine, reload. */
  describe(w, n) {
    const T = ATT.tierStats(w, n), base = this.baseClip(w), mag = Math.round(base * T.clip);
    const unit = w.def.kind === 'flame' || w.def.kind === 'saw' ? ' fuel' : w.def.kind === 'tesla' ? ' charges' : '-round magazine';
    const parts = [`+${Math.round((T.damage - 1) * 100)}% damage`];
    if (w.def.clip > 1 && mag > base) parts.push(`${mag}${unit}`);
    parts.push(`reloads ${Math.round((1 - T.reload) * 100)}% faster`);
    return parts.join(', ') + '.';
  }

  baseClip(w) { return w.att?.mag === 'extmag' && w.def.clip > 0 ? Math.round(w.def.clip * 1.5) : w.def.clip; }

  rateWord(w) {
    const r = this.rate(w);
    return r >= 0.6 ? 'most' : r >= 0.25 ? 'many' : r >= 0.1 ? 'some' : 'a few';
  }

  /** attachments.buyUpgrade for 'tier_<n>' / 'round_<id>': pay(cost) -> bool, say(text). True if bought. */
  buy(p, item, pay, say) {
    const g = this.game, D = this.Z.diff.forge;
    const w = ATT.forgeTarget(p);
    if (!w) { say('Get a gun first!'); return false; }
    const [kind, id] = item.split('_'), cur = w.tier | 0, name = gunName(w);
    const before = p.money;
    if (kind === 'tier') {
      const n = +id;
      if (!(n >= 1 && n <= D.tiers)) { say(`The forge goes up to Tier ${TN[D.tiers]}.`); return false; }
      if (n <= cur) { say(`Your ${name} is already Tier ${TN[cur]}.`); return false; }
      if (n > cur + 1) { say(`Forge your ${name} to Tier ${TN[cur + 1]} first.`); return false; }
      if (!pay(this.price(p, item))) return false;
      w.tier = n;
      this.refit(p, w);
      this.bought(p, w, 'tier', before - p.money);
      if (p.isLocal) {
        this.present(p, w, n >= 5);
        g.sound?.play(n >= 5 ? 'forge_tier5' : 'forge_hammer', { volume: 0.9 });
        g.hud?.centerPrint?.(`FORGED: ${name.toUpperCase()} - TIER ${TN[n]}\n${this.describe(w, n)}${n === D.roundFrom && ATT.canRound(w) ? '\nIt takes a round type now (Elemental Rounds).' : ''}`, 3.5);
      } else g.sound?.play('forge_hammer', { pos: p.eyePos(), volume: 0.5 });
      return true;
    }
    if (kind === 'round') {
      const R = ROUNDS[id];
      if (!R) return false;
      if (!ATT.canRound(w)) { say(`No rounds for the ${name}: only guns take them.`); return false; }
      if (cur < D.roundFrom) { say(`Forge your ${name} to Tier ${TN[D.roundFrom]} first:\nthen it takes a round type.`); return false; }
      if (w.round === id) { say(`Your ${name} already fires ${R.name}.`); return false; }
      if (!pay(this.price(p, item))) return false;
      w.round = id;
      this.refit(p, w);
      this.bought(p, w, 'round', before - p.money);
      if (p.isLocal) {
        this.present(p, w, false);
        g.sound?.play('forge_round', { volume: 0.9 });
        g.hud?.centerPrint?.(`${R.name.toUpperCase()}: ${name}\n${R.tag}`, 3.5);
      } else g.sound?.play('forge_round', { pos: p.eyePos(), volume: 0.5 });
      return true;
    }
    return false;
  }

  /** After a change: the weapon layer again, the magazine topped up to its new size, the view model repainted. */
  refit(p, w) {
    ATT.refresh(w);
    if (w.def.clip > 0) w.clip = Math.max(w.clip, w.clipMax);
    this.game.onLoadoutChanged?.(p, w);
  }

  /** Your gun comes back from the anvil: drawn again (the new finish on show) in a shower of sparks. */
  present(p, w, hot) {
    const g = this.game;
    if (p.active === w && !w.inReload) g.selectWeapon(p, w, true);
    const e = p.eyePos(_c2), f = this.fwd(p), y = p.pm.angles[1] * Math.PI / 180;
    _c[0] = e[0] + f[0] * 24 + Math.sin(y) * 7; _c[1] = e[1] + f[1] * 24 - Math.cos(y) * 7; _c[2] = e[2] + f[2] * 24 - 8;
    this.puff('spark', _c, hot ? 22 : 12, 160, O.spark);
    this.puff('ember', _c, hot ? 10 : 4, 90, O.ember);
  }

  bought(p, w, kind, cost) {
    this.counts.buys++;
    this.Z.events.mode('forge', { player: p, weapon: w.id, kind, tier: w.tier | 0, round: w.round || null, cost });
  }

  // ---------------------------------------------------------------- procs
  /** The chance a hit from w procs (x procK, more past roundFrom). */
  rate(w) {
    const D = this.Z.diff.forge;
    const r = PROC[w.id] ?? PROC[w.def.kind] ?? 0.15;
    return Math.min(1, r * D.procK * (1 + PROC_TIER * Math.max(0, (w.tier | 0) - D.roundFrom)));
  }

  /** The bus 'hit' (every hit by or on the squad): a loaded gun's bullet on a zombie may proc. Hot: no allocation. */
  onHit(e) {
    if (this.busy) return;
    const a = e.attacker, v = e.victim;
    if (!a || !v || a === v || !v.isZombie || e.blast || e.fire || e.acid || !inSquad(a)) return;
    const w = a.active, R = w?.round;
    if (!R || w.id !== e.weapon || (w.tier | 0) < this.Z.diff.forge.roundFrom) return;
    if (e.lethal && !AFTER_KILL[R]) return;
    if (e.shot && a.fgShot === e.shot) return; // (one proc a trigger pull: pellets, a round through two)
    const t = this.game.time;
    const cd = v.fgCd || (v.fgCd = { incendiary: 0, shock: 0, cryo: 0, explosive: 0, vampiric: 0 });
    if (t < cd[R] || Math.random() >= this.rate(w)) return;
    cd[R] = t + CD[R];
    if (e.shot) a.fgShot = e.shot;
    this.proc(R, a, v, w, e, t);
  }

  proc(R, a, v, w, e, t) {
    const raw = e.raw || 0, lethal = e.lethal;
    const P = e.point ? (_p[0] = e.point[0], _p[1] = e.point[1], _p[2] = e.point[2], _p) : this.center(v, _p);
    this.counts[R]++;
    this.busy++;
    try {
      if (R === 'incendiary') this.ignite(a, v, w, raw, P);
      else if (R === 'shock') this.shock(a, v, w, raw, P, lethal);
      else if (R === 'cryo') this.cryo(a, v, P, lethal, t);
      else if (R === 'explosive') this.blast(P, a, w, BLAST.dmg0 + BLAST.dmgK * raw, BLAST.r0 + BLAST.rTier * Math.max(0, (w.tier | 0) - this.Z.diff.forge.roundFrom), lethal ? v : null);
      else if (R === 'vampiric') this.leech(a, v, raw, P, t);
    } finally { this.busy--; }
    const E = this.Z.events;
    if (E.has('proc')) {
      const o = E.obj('proc');
      o.attacker = a; o.victim = v; o.round = R; o.weapon = w.id;
      o.wave = this.Z.wave; o.t = t;
      E.emit('proc', o);
    }
  }

  // ---- Incendiary
  ignite(a, v, w, raw, P) {
    const g = this.game;
    if (g.fire.immune(v, 'fire')) { this.puff('smoke', P, 2, 40, O.smoke); return; }
    g.fire.burn(v, a, FIRE.secs, FIRE.dps0 + FIRE.dpsK * raw, w.id);
    this.puff('fire', P, 7, 160, O.fire);
    this.puff('ember', P, 6, 220, O.ember);
    this.sound('forge_ignite', P, 0.75);
    this.flash(v, ROUNDS.incendiary.rgb, 0.35);
    this.popup(a, v, ROUNDS.incendiary.word, ROUNDS.incendiary.rgb);
  }

  // ---- Shock: an arc chain from the one hit to the nearest zombies
  shock(a, v, w, raw, P, lethal) {
    const g = this.game, Z = this.Z, D = Z.diff.forge;
    const cam = g.camPos || a.eyePos();
    const jumps = SHOCK.jumps + Math.max(0, (w.tier | 0) - D.roundFrom);
    // the one hit crackles; it is stunned a moment (zstagger.js: the tesla's jolt)
    for (let i = 0; i < 2; i++) g.arcs?.bolt(P, [P[0] + rnd(-20, 20), P[1] + rnd(-20, 20), P[2] + rnd(-14, 22)], cam, 0.12);
    this.puff('volt', P, 8, 260, O.volt);
    if (!lethal && v.alive) { Z.stagger(v, 1, null, 'tesla', a); this.flash(v, ROUNDS.shock.rgb, 0.3); }
    const L = this.chain;
    L.length = 0; L.push(v);
    let from = this.center(v, [0, 0, 0]), dmg = SHOCK.dmg0 + SHOCK.dmgK * raw;
    for (let i = 0; i < jumps; i++) {
      let next = null, nd = SHOCK.range;
      for (const q of g.players) {
        if (!q.alive || !q.isZombie || L.includes(q)) continue;
        const c = this.center(q, _c2), d = Math.hypot(c[0] - from[0], c[1] - from[1], c[2] - from[2]);
        if (d < nd && g.visible(from, c)) { nd = d; next = q; }
      }
      if (!next) break;
      const c = this.center(next, [0, 0, 0]), l = nd || 1;
      g.arcs?.bolt(from, c, cam, 0.2);
      L.push(next);
      g.damagePlayer(next, a, dmg, HITGROUP.CHEST, w.id, [(c[0] - from[0]) / l, (c[1] - from[1]) / l, (c[2] - from[2]) / l], c, { blast: true });
      if (next.alive) { next.pm.velocityModifier = Math.min(next.pm.velocityModifier ?? 1, 0.45); this.flash(next, ROUNDS.shock.rgb, 0.3); }
      this.puff('volt', c, 6, 240, O.volt);
      from = c;
      dmg *= SHOCK.fall;
    }
    this.counts.chain += L.length - 1;
    this.sound('forge_shock', P, 0.8);
    this.popup(a, v, SHOCK_TXT[Math.min(SHOCK_TXT.length - 1, L.length)], ROUNDS.shock.rgb);
  }

  // ---- Cryo: chill, the second chill freezes (commons), a stun (specials), a slow (bosses)
  cryo(a, v, P, lethal, t) {
    this.puff('frost', P, 8, 150, O.frost);
    if (lethal) {
      // the killing round: a cold snap on the ones around it (a frozen one shatters: onKill)
      const g = this.game;
      for (const q of g.players) {
        if (q === v || !q.alive || !q.isZombie) continue;
        const o = q.pm.origin;
        if (Math.abs(o[0] - P[0]) > CRYO.splash || Math.abs(o[1] - P[1]) > CRYO.splash || Math.hypot(o[0] - P[0], o[1] - P[1]) > CRYO.splash) continue;
        this.chill(q, a, t, 1, false);
      }
      this.sound('forge_chill', P, 0.7);
      return;
    }
    this.chill(v, a, t, 1, true);
  }

  /** n chill stacks on z (refreshed); the last one freezes a common (stuns a special). */
  chill(z, a, t, n, loud) {
    if (!z.alive || z.fgFrozen > t) return;
    const max = z.isBoss ? 1 : CRYO.stacks;
    z.fgChill = Math.min(max, (z.fgChillT > t ? z.fgChill | 0 : 0) + n);
    z.fgChillT = t + CRYO.secs;
    this.cold.add(z); this.fxs.add(z);
    const P = this.center(z, _c);
    if (z.fgChill >= CRYO.stacks && !z.isBoss) {
      if (z.special) {
        z.fgChill = 1;
        this.Z.stagger(z, 1, null, 'tesla', a); // (a special is stunned, not frozen: its tricks go on)
        this.puff('frost', P, 14, 220, O.frost);
        this.puff('icemist', P, 2, 30, O.icemist);
        this.sound('forge_freeze', P, 0.6);
        this.popup(a, z, 'STUNNED', ROUNDS.cryo.rgb);
      } else this.freeze(z, a, t);
      return;
    }
    if (loud) { this.sound('forge_chill', P, 0.6); this.popup(a, z, ROUNDS.cryo.word, ROUNDS.cryo.rgb); }
  }

  freeze(z, a, t) {
    z.fgFrozen = t + CRYO.freeze;
    z.fgChill = 1; z.fgChillT = z.fgFrozen + CRYO.after; // (thawed, it's still chilled a while)
    z.fgYaw = z.pm.angles[1];
    z.windup = 0;
    z.nextAttack = Math.max(z.nextAttack || 0, z.fgFrozen + 0.3);
    if (z.model) z.model.swipeT = -1;
    this.cold.add(z); this.fxs.add(z);
    this.attachIce(z, t);
    this.counts.freeze++;
    const P = this.center(z, _c);
    this.puff('frost', P, 18, 230, O.frost);
    this.puff('icemist', P, 3, 40, O.icemist);
    this.sound('forge_freeze', P, 0.85);
    this.popup(a, z, 'FROZEN', ICE_RGB);
    if (!this.hooked) {
      // frozen solid: +CRYO.shatter damage from the squad (registered on the first freeze: hooks outlive runs)
      this.hooked = true;
      this.Z.mods.addHook('out', (att, vic, dmg) => (vic.fgFrozen > this.game.time ? dmg * (1 + CRYO.shatter) : dmg));
    }
  }

  /** The freeze is over (alive): the crystals fall away. */
  unfreeze(z) {
    z.fgFrozen = 0;
    this.detachIce(z);
    const P = this.center(z, _c);
    this.puff('frost', P, 10, 120, O.shard);
    this.sound('forge_chill', P, 0.45);
  }

  // ---- Explosive: a small blast (zombies only; blast damage, never explode: no gibs)
  blast(P, a, w, dmg, R, skip) {
    const g = this.game;
    g.effects?.sprite?.({ tex: 'spr_explosion', pos: [P[0], P[1], P[2] + 4], size: 34 + R * 0.35, life: 0.36, additive: true, frames: [4, 4, 16], fps: 44, fade: false }); // (small: a round's blast, not a grenade's)
    this.puff('fire', P, 6, 220, O.fire);
    this.puff('spark', P, 8, 340, O.spark);
    this.puff('smoke', P, 2, 60, O.smoke);
    this.sound('forge_blast', P, 0.8);
    for (const q of g.players) {
      if (!q.alive || !q.isZombie || q === skip) continue;
      const c = this.center(q, _c2), sc = q.boss ? q.boss.scale : 1;
      const d = Math.hypot(c[0] - P[0], c[1] - P[1], c[2] - P[2]), reach = R + (sc - 1) * 30;
      if (d > reach || !g.visible(P, c)) continue;
      const k = 1 - 0.5 * d / reach, l = d || 1;
      const dir = [(c[0] - P[0]) / l, (c[1] - P[1]) / l, Math.max(0.2, (c[2] - P[2]) / l)];
      if (!q.boss) { q.pm.velocity[0] += dir[0] * BLAST.push * k; q.pm.velocity[1] += dir[1] * BLAST.push * k; }
      g.damagePlayer(q, a, dmg * k, 0, w.id, dir, null, { blast: true });
    }
    g.shakeAt?.(P, 1.2, 500);
    this.popup(a, skip || null, ROUNDS.explosive.word, ROUNDS.explosive.rgb, P);
  }

  // ---- Vampiric: health back (a budget of diff.forge.leech HP a second)
  leech(a, v, raw, P, t) {
    const g = this.game, cap = this.Z.diff.forge.leech;
    a.fgLeech = Math.min(cap, (a.fgLeech ?? cap) + (t - (a.fgLeechT ?? t)) * cap);
    a.fgLeechT = t;
    const room = (a.maxHealth || 100) - a.health;
    const amt = Math.floor(Math.min(LEECH.max, LEECH.base + LEECH.k * raw, a.fgLeech, room));
    // the siphon: red motes drawn from the wound to the shooter (to just under your eyes)
    const e = a.eyePos(_c2);
    if (a === g.viewTarget) { const f = this.fwd(a); e[0] += f[0] * 34; e[1] += f[1] * 34; e[2] += f[2] * 34 - 14; } else e[2] -= 18;
    const dx = e[0] - P[0], dy = e[1] - P[1], dz = e[2] - P[2], d = Math.hypot(dx, dy, dz) || 1;
    const sp = Math.min(900, Math.max(300, d * 2.2));
    O.siphon.life = d / sp;
    for (let i = 0; i < 7; i++) {
      const j = 0.06;
      _v[0] = (dx / d + rnd(-j, j)) * sp; _v[1] = (dy / d + rnd(-j, j)) * sp; _v[2] = (dz / d + rnd(-j, j)) * sp;
      _c[0] = P[0] + rnd(-4, 4); _c[1] = P[1] + rnd(-4, 4); _c[2] = P[2] + rnd(-4, 4);
      g.fire.emit('siphon', _c, _v, O.siphon);
    }
    this.flash(v, ROUNDS.vampiric.rgb, 0.3);
    if (amt < 1 || a.downed || !a.alive) return;
    a.health += amt; a.fgLeech -= amt;
    this.counts.leech += amt;
    if (a === g.local) { this.sound('forge_siphon', null, 0.4); this.healT = t; this.healN = amt; } else this.sound('forge_siphon', P, 0.5);
    this.popup(a, v, LEECH_TXT[Math.min(10, amt)], ROUNDS.vampiric.rgb);
  }

  // ---------------------------------------------------------------- the bus
  onKill(e) {
    const z = e.victim;
    if (!z || !z.isZombie || !(this.fxs.has(z) || this.cold.has(z))) return;
    if (z.fgFrozen > this.game.time) {
      // a frozen one shatters as it dies: ice, not gore (the body stays whole)
      const P = this.center(z, _c);
      this.puff('frost', P, 22, 300, O.shard);
      this.puff('frost', P, 12, 160, O.frost);
      this.puff('icemist', P, 4, 60, O.icemist);
      this.sound('forge_shatter', P, 0.9);
      this.counts.shatter++;
    }
    this.clearZ(z);
    this.fxs.delete(z); this.cold.delete(z);
  }

  clearZ(z) {
    z.fgChill = 0; z.fgChillT = 0; z.fgFrozen = 0; z.fgFlashT = -9; z.fgRimK = 0;
    if (z.model?.setRim && !z.special && !z.isBoss) z.model.setRim(BLACK, 0);
    this.detachIce(z);
  }

  // ---------------------------------------------------------------- per tick
  /** Every tick (ZombieMode.tick, after everyone moved): the chill and the freeze hold; bots forge. */
  tick(t) {
    if (this.cold.size) {
      for (const z of this.cold) {
        if (!z.alive) { this.clearZ(z); this.cold.delete(z); continue; }
        if (z.fgFrozen) {
          if (z.fgFrozen > t) {
            // frozen solid: no step (velocityModifier), no turn, no swing
            const pm = z.pm;
            pm.velocityModifier = 0;
            pm.velocity[0] *= 0.5; pm.velocity[1] *= 0.5;
            pm.angles[1] = z.fgYaw;
            z.windup = 0;
            if (z.nextAttack < z.fgFrozen + 0.3) z.nextAttack = z.fgFrozen + 0.3;
            continue;
          }
          this.unfreeze(z);
        }
        if (z.fgChillT > t) {
          const k = z.isBoss ? 1 - CRYO.bossSlow : 1 - CRYO.slow * (z.fgChill | 0);
          if ((z.pm.velocityModifier ?? 1) > k) z.pm.velocityModifier = k;
          continue;
        }
        z.fgChill = 0;
        this.cold.delete(z);
      }
    }
    if (t >= this.botAt) { this.botAt = t + 0.5; this.botForge(t); }
  }

  /** Bots forge their main gun near the end of a break (one step a break, up to diff.forge.botTier). */
  botForge(t) {
    const g = this.game, Z = this.Z, D = Z.diff.forge;
    if (Z.state !== 'break' || this.botBreak === Z.wave || t < Z.nextWaveAt - BOT_AT || !g.bots?.bots) return;
    this.botBreak = Z.wave;
    const top = Math.min(D.botTier | 0, D.tiers);
    if (top <= 0) return;
    for (const b of g.bots.bots) {
      const p = b.p;
      if (!inSquad(p) || !p.alive || p.downed) continue;
      const w = p.weapons[1] || p.weapons[2];
      if (!ATT.canForge(w) || w.def.kind === 'launcher') continue;
      const cur = w.tier | 0;
      const item = cur < top ? `tier_${cur + 1}` : cur >= D.roundFrom && !w.round && ATT.canRound(w) ? `round_${BOT_ROUNDS[(p.name?.length || 0) % BOT_ROUNDS.length]}` : null;
      if (!item) continue;
      const c = Z.economy.cost(p, item);
      if (c == null || p.money < c + BOT_KEEP) continue;
      if (p.active !== w) g.selectWeapon(p, w, true); // (the forge works on the gun in hand)
      g.rounds.buy(p, item);
    }
  }

  // ---------------------------------------------------------------- fx helpers
  center(q, out) {
    const o = q.pm.origin, sc = q.boss ? q.boss.scale : 1;
    out[0] = o[0]; out[1] = o[1]; out[2] = o[2] + 14 * sc;
    return out;
  }

  fwd(p) {
    const a = p.pm.angles, cp = Math.cos(a[0] * Math.PI / 180);
    _v[0] = Math.cos(a[1] * Math.PI / 180) * cp; _v[1] = Math.sin(a[1] * Math.PI / 180) * cp; _v[2] = -Math.sin(a[0] * Math.PI / 180);
    return _v;
  }

  /** n particles of kind out of P in every direction (speed sp). */
  puff(kind, P, n, sp, o) {
    const F = this.game.fire;
    if (!F) return;
    for (let i = 0; i < n; i++) {
      _v[0] = rnd(-1, 1) * sp; _v[1] = rnd(-1, 1) * sp; _v[2] = rnd(-0.3, 1) * sp;
      F.emit(kind, P, _v, o);
    }
  }

  /** A proc sound at P (null: yours, not positional), at most one of a name every 60 ms. */
  sound(name, P, volume) {
    const t = this.game.time;
    if (t - (this.sndT[name] ?? -9) < 0.06) return;
    this.sndT[name] = t;
    this.game.sound?.play(name, { pos: P ? [P[0], P[1], P[2]] : null, volume });
  }

  /** A rim flash on a common (specials' rims are zthreats.js', bosses glow their own). */
  flash(z, rgb, dur) {
    if (z.special || z.isBoss || !z.model?.setRim) return;
    z.fgFlashT = this.game.time; z.fgFlashRgb = rgb; z.fgFlashDur = dur;
    this.fxs.add(z);
  }

  /** A word over the zombie (yours only): IGNITE, SHOCK x3, FROZEN, +4... */
  popup(a, z, text, rgb, at = null) {
    if (a !== this.game.local) return;
    let n = this.pops[0];
    for (const q of this.pops) if (q.t < n.t) n = q;
    const o = at || (z ? this.center(z, _c) : null);
    if (!o) return;
    n.t = this.game.time; n.text = text; n.rgb = rgb;
    n.x = o[0]; n.y = o[1]; n.z = o[2] + (at ? 10 : 34);
    n.dx = rnd(-14, 14);
  }

  // ---------------------------------------------------------------- ice crystals (a frozen common wears a cluster)
  iceSlot() {
    for (const s of this.ice) if (!s.z) return s;
    const world = this.game.renderer?.world;
    if (!world || this.ice.length >= ICE_MAX) return null;
    if (!this.iceGeo) {
      this.iceGeo = new THREE.OctahedronGeometry(1, 0);
      this.iceMat = new THREE.MeshBasicMaterial({ color: 0xb8e4ff, transparent: true, opacity: 0.62, depthWrite: false });
      this.iceGlow = new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    }
    const group = new THREE.Group();
    group.name = 'forge_ice';
    let seed = this.ice.length * 7919 + 13;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // [height, radius, count, length, tilt]: round the feet, the hips, the shoulders, one on the head
    for (const [h, rad, count, len, tilt] of [[-30, 13, 5, 15, 0.75], [-4, 10, 3, 11, 1.05], [18, 9, 3, 9, 0.95], [33, 2, 1, 8, 0.2]]) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + r() * 0.9, L = len * (0.7 + r() * 0.6), wd = 1.6 + r() * 1.6;
        for (const [mat, k] of [[this.iceMat, 1], [this.iceGlow, 1.25]]) {
          const m = new THREE.Mesh(this.iceGeo, mat);
          m.position.set(Math.cos(a) * rad, Math.sin(a) * rad, h + L * 0.35);
          m.rotation.order = 'ZXY';
          m.rotation.set(0, 0, 0);
          m.rotateZ(a); m.rotateY(tilt * (0.8 + r() * 0.4)); // (lean out from the body)
          m.scale.set(wd * k, wd * k, L * 0.55 * k);
          m.frustumCulled = false;
          m.renderOrder = 2;
          group.add(m);
        }
      }
    }
    group.visible = false;
    world.add(group);
    const s = { group, z: null, t0: 0 };
    this.ice.push(s);
    return s;
  }

  attachIce(z, t) {
    if (z.special || z.isBoss) return;
    const s = this.iceSlot();
    if (!s) return;
    s.z = z; s.t0 = t;
    s.group.visible = true;
    s.group.scale.setScalar(0.01);
    this.placeIce(s);
  }

  detachIce(z) {
    for (const s of this.ice) if (s.z === z) { s.z = null; s.group.visible = false; }
  }

  placeIce(s) {
    const z = s.z, o = z.pm.origin, h = z.hull?.();
    const tall = h ? (h.maxs[2] - h.mins[2]) / 72 : 1;
    s.group.position.set(o[0], o[1], o[2] + (h ? h.mins[2] + 36 * tall : 0));
    s.group.rotation.set(0, 0, (z.fgYaw ?? z.pm.angles[1]) * Math.PI / 180);
    const k = Math.min(1, (this.game.time - s.t0) / 0.18);
    s.group.scale.set(k, k, k * tall);
  }

  // ---------------------------------------------------------------- HUD / frame
  /** HUD state (buildHudState, every frame): s.forge = { tier, round } for the gun in your hands (or null). */
  hud(s) {
    const p = this.game.local, w = p?.alive ? p.active : null;
    if (!w || !w.tier) { s.forge = null; return; }
    this.hudOut.tier = w.tier; this.hudOut.round = w.round || null;
    s.forge = this.hudOut;
  }

  /** Per frame (game.frame, zombie mode only): the rims, the cold mist, the crystals, the view model's glow. */
  frame(dt) {
    const g = this.game, t = g.time;
    for (const z of this.fxs) {
      if (!z.alive) { this.clearZ(z); this.fxs.delete(z); continue; }
      let rgb = BLACK, k = 0;
      const frozen = z.fgFrozen > t, chilled = z.fgChillT > t;
      if (frozen) { rgb = ICE_RGB; k = 0.62 + 0.12 * Math.sin(t * 9 + (z.id | 0)); } else if (chilled) { rgb = CHILL_RGB; k = 0.2 * (z.fgChill | 0); }
      const age = t - (z.fgFlashT ?? -9);
      if (age < (z.fgFlashDur || 0)) { const fk = 0.95 * (1 - age / z.fgFlashDur); if (fk > k) { k = fk; rgb = z.fgFlashRgb; } }
      if ((frozen || chilled) && dt > 0 && Math.random() < dt * (frozen ? 9 : 3)) {
        const o = z.pm.origin;
        _c[0] = o[0] + rnd(-12, 12); _c[1] = o[1] + rnd(-12, 12); _c[2] = o[2] + rnd(-30, 30);
        _v[0] = rnd(-10, 10); _v[1] = rnd(-10, 10); _v[2] = rnd(-30, 5);
        g.fire?.emit(frozen && Math.random() < 0.5 ? 'frost' : 'icemist', _c, _v, frozen ? O.frost : O.icemist);
      }
      if (!z.special && !z.isBoss && z.model?.setRim && (k !== z.fgRimK || k)) { z.fgRimK = k; z.model.setRim(rgb, k); }
      if (!frozen && !chilled && k <= 0) { this.fxs.delete(z); z.fgRimK = 0; }
    }
    for (const s of this.ice) if (s.z) { if (!s.z.alive || !(s.z.fgFrozen > t)) this.detachIce(s.z); else this.placeIce(s); }
    if (this.iceMat) this.iceMat.opacity = 0.55 + 0.1 * Math.sin(t * 5);
    // the forged gun in your hands: Tier V's seams and a round's canister glow (vm/attach.js)
    const glow = g.vm?.forgeGlow;
    if (glow) for (const m of glow) m.opacity = m.userData.base * (0.7 + 0.3 * Math.sin(t * (m.userData.rate || 3) + (m.userData.ph || 0)));
  }

  font(hud) {
    const F = this.fonts;
    if (F.px !== hud.fontPx) { F.px = hud.fontPx; F.small = fontString(Math.max(9, Math.round(hud.fontPx * 0.85)), true); F.big = fontString(Math.round(hud.fontPx * 1.05), true); }
    return F;
  }

  /** The HUD layer: words over the zombies your rounds touched, the tier badge over the ammo, a drained "+N". */
  draw(hud, s) {
    if (!s?.zombie || !this.game.zombies?.enabled) return;
    const g = this.game, t = g.time, F = this.font(hud), cam = g.renderer?.camera;
    if (cam) {
      for (const n of this.pops) {
        const age = t - n.t;
        if (age < 0 || age >= POP_LIFE) continue;
        _vec.set(n.x, n.z + age * 36, -n.y).project(cam);
        if (_vec.z > 1 || _vec.z < -1) continue;
        const x = (_vec.x + 1) / 2 * hud.vw + n.dx * hud.k, y = (1 - _vec.y) / 2 * hud.vh;
        hud.text(n.text, x, y, n.rgb, { align: 'center', alpha: age < 0.45 ? 1 : 1 - (age - 0.45) / (POP_LIFE - 0.45), font: F.small });
      }
    }
    if (!s.alive) return;
    const fh = 25 * hud.k, yAmmo = hud.vh - fh * 1.5;
    if (t - this.healT < 0.9) {
      const a = 1 - (t - this.healT) / 0.9;
      hud.text(LEECH_TXT[Math.min(10, this.healN)] + ' HP', 12 * hud.k, yAmmo - hud.fontPx * 1.6 - (1 - a) * 14 * hud.k, ROUNDS.vampiric.rgb, { alpha: a, font: F.big });
    }
    const f = s.forge;
    if (!f || !f.tier) return;
    // between the money and the ammo, right-aligned: "TIER III · CRYO" in the tier's and the round's colours
    const G = hud.gTop, y = hud.vh - 2 * fh + Math.max(1, (fh * 0.5 - hud.fontPx * 0.85) / 2);
    let x = hud.vw - 10 * hud.k;
    G.font = F.small;
    if (f.round) {
      const R = ROUNDS[f.round];
      hud.text(R.short, x, y, R.rgb, { align: 'right', font: F.small });
      x -= G.measureText(R.short).width;
      hud.text(' · ', x, y, TIER_RGB[0], { align: 'right', font: F.small, alpha: 0.6 });
      x -= G.measureText(' · ').width;
    }
    hud.text(BADGE[f.tier], x, y, TIER_RGB[f.tier], { align: 'right', font: F.small });
  }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args = []) {
    const g = this.game, out = (s) => g.console?.print?.(s);
    if (cmd === 'zm_forgeinfo') {
      const guns = [p.weapons[1], p.weapons[2]].filter(Boolean).map((w) => `${gunName(w)}: Tier ${TN[w.tier | 0] || '0'}${w.round ? ` (${ROUNDS[w.round].name})` : ''} x${(w.mods?.damage ?? 1).toFixed(2)} damage, ${w.clipMax || w.def.clip} rounds`);
      const C = this.counts;
      out(`${guns.join(' | ') || 'no guns'} | procs: ${ROUND_IDS.map((r) => `${r} ${C[r]}`).join(', ')}; ${C.freeze} frozen, ${C.shatter} shattered, ${C.chain} arcs, ${C.leech} HP drained`);
      return true;
    }
    if (cmd !== 'zm_forge') return false;
    if (!g.console?.cheats) { out('zm_forge needs sv_cheats 1'); return true; }
    const w = ATT.forgeTarget(p);
    const n = Math.max(0, Math.min(5, args[0] != null ? +args[0] | 0 : 5));
    const r = args[1] != null ? String(args[1]) : null;
    if (!w) { out('zm_forge: no gun'); return true; }
    if (r && r !== 'none' && !ROUNDS[r]) { out(`zm_forge <0-5> [${ROUND_IDS.join('|')}|none]`); return true; }
    this.Z.taint();
    w.tier = n;
    if (r) w.round = r === 'none' || !ATT.canRound(w) ? null : r;
    if (n < this.Z.diff.forge.roundFrom) w.round = null;
    this.refit(p, w);
    out(`${gunName(w)}: Tier ${TN[n] || '0'}${w.round ? `, ${ROUNDS[w.round].name}` : ''}`);
    return true;
  }
}
