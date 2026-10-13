// Zombie survival economy (Milestone 1.2): money that matters and a real break phase.
//  - start money (the difficulty's econ.startMoney) and a pistol; the cap is econ.moneyCap
//  - pay: a common kill pays base + perWave x wave (up to max), +headBonus on a headshot;
//    a special pays specialPay on top; a boss pays bossPay split by the squad's share of the
//    damage it took (Sandbox: bossPay each, as before); the wave bonus goes to everyone
//    standing, half of it to those who fell in the wave; every payout goes out as an 'earn'
//  - the shop: in the break everything is for sale; mid-wave only ammo, armour and medkits,
//    at +combatPremium (Sandbox: anything, any time, no markup); someone just back from a
//    respawn has REARM seconds of the whole shop (not on hardcore: guns, upgrades and perks
//    in the breaks only, whoever you are). rounds.buyItem asks buyGate() first and
//    says why when it's no; the buy menu greys out what can't be bought now (menuState)
//  - ready-up: F1 ('autobuy') or a typed zm_ready; once every human in the squad is ready
//    the break drops to READY_BREAK seconds ('ready' event); the HUD shows who is ready
//  - bots shop on a budget in the breaks (Bot.buy hands them over: shop): a better pistol,
//    armour, then a primary, ammo, then medkits and a couple of attachments; they back the
//    squad up rather than carry it, so only MG_CAP of them carry a machine gun and the rest
//    stay on rifles (Sandbox, money to burn: as bots always bought); mid-wave only ammo when dry;
//    a bot back from the dead picks its own gun up again if it's still where it fell
// Scaffold: ZombieMode builds it and calls tick(t) first thing every tick (before a break
// ends); buildHudState calls hud(s) every frame. Run resets: the 'run' event.
import { TEAM_CT } from './player.js';
import * as WS from './weaponsys.js';
import * as ATT from './attachments.js';
import * as CR from './combatrules.js';
import { inSquad } from './runstats.js';
import { SECOND_WIND } from './zdowned.js';

const COMBAT_ITEMS = new Set(['primammo', 'secammo', 'vest', 'vesthelm', 'medkit']); // all a wave lets you buy
const READY_BREAK = 3; // s left of the break once everyone is ready
const REARM = 10; // s of the whole shop after coming back mid-wave
const DRY_CHECK = 1; // s between the bots' mid-wave "out of ammo?" checks
const STARTERS = new Set(['usp', 'glock']); // the pistols you spawn with
// what bots buy for a primary, by tier (smg 1, rifle 2, mg 3): the best tier they can afford
// that beats what they carry (no buying a gun a step up every break)
const BOT_GUNS = [['mp5', 1], ['ump45', 1], ['p90', 1], ['galil', 2], ['famas', 2], ['ak47', 2], ['m4a1', 2], ['m249', 3]];
const BOT_ATTS = ['extmag', 'foregrip', 'compensator', 'laser', 'reddot'];
const BOT_ATT_MAX = 2; // attachments a bot puts on a gun (Sandbox: all it can)
const MG_CAP = (bots) => (bots <= 4 ? 1 : 2); // bots in the squad that may carry a machine gun (tier 3)
const KEEP = 200; // $ a bot keeps back for ammo while it shops
const FALLEN_BONUS = 0.5; // share of a cleared wave's bonus for those who died in it
const HUD_GREEN = [90, 230, 90], HUD_AMBER = [255, 176, 0], HUD_DIM = [150, 130, 90], HUD_RED = [255, 70, 50];

const tierOf = (w) => {
  if (!w) return -1;
  const k = w.def.kind;
  return k === 'sniper' ? 0 : k === 'smg' || k === 'shotgun' ? 1 : k === 'mg' ? 3 : 2;
};
const loaded = (w) => !!w && (w.clip > 0 || w.ammo > 0);
const attCount = (w) => { let n = 0; for (const k in w.att || {}) if (w.att[k]) n++; return n; };

export class ZEconomy {
  constructor(game) {
    this.game = game;
    this.ps = new Map(); // player -> { ready, alive (last tick), spawnT (came back mid-wave), shopAt, shopped (break id), gun (a bot's primary) }
    this.bossDmg = new Map(); // squad member -> damage dealt to the current boss
    this.breakId = 0; // the wave a break follows (0: before wave 1)
    this.breakT0 = 0; // when the break began
    this.cutFrom = 0; // the break's end before everyone readied up (0: not cut short)
    this.dryAt = 0;
    this.bound = false;
    this.hs = { phase: '', open: false, combat: false, premium: 0, rearm: 0, ready: false, all: false, readyN: 0, humans: 0, bots: 0, left: 0, frac: 0 };
    // (game.zombies is set once ZombieMode's constructor returns)
    Promise.resolve().then(() => this.bind());
    game.hud?.addLayer((hud, s) => this.draw(hud, s), 0);
  }

  get Z() { return this.game.zombies; }

  bind() {
    const E = this.Z?.events;
    if (this.bound || !E) return;
    this.bound = true;
    E.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    E.on('wave', (e) => this.onWave(e));
    E.on('hit', (e) => {
      // a boss's bounty is shared out by who hurt it
      if (e.victim.isBoss && e.damage > 0 && inSquad(e.attacker)) this.bossDmg.set(e.attacker, (this.bossDmg.get(e.attacker) || 0) + e.damage);
    });
    E.on('boss', (e) => { if (e.phase === 'spawn') this.bossDmg.clear(); });
    E.on('respawn', (e) => { this.st(e.player).spawnT = this.game.time; this.reclaim(e.player); }); // (downed's respawns)
    this.reset();
  }

  /** A new run: nobody is ready, nothing is owed. */
  reset() {
    this.ps.clear();
    this.bossDmg.clear();
    this.breakStart(0);
  }

  st(p) {
    let s = this.ps.get(p);
    if (!s) this.ps.set(p, s = { ready: false, alive: p.alive, spawnT: 0, shopAt: 0, shopped: -1, gun: null });
    return s;
  }

  breakStart(id) {
    const g = this.game;
    this.breakId = id;
    this.breakT0 = g.time;
    this.cutFrom = 0;
    // bots go shopping a moment into the break, each in its own time
    for (const s of this.ps.values()) { s.ready = false; s.shopAt = g.time + 1 + Math.random() * 2.5; }
  }

  onWave(e) {
    const g = this.game;
    if (e.phase === 'cleared') {
      this.breakStart(e.wave);
      // (ZombieMode.waveCleared paid everyone standing, through pay; the fallen, back next wave, get half)
      for (const p of g.players) {
        if (p.team !== TEAM_CT || p.isZombie || p.alive) continue;
        this.pay(p, Math.round(e.bonus * FALLEN_BONUS), 'wave');
      }
      return;
    }
    // a wave starts: whoever just came back (bots that fell, a bled-out player) may re-arm
    for (const p of g.players) {
      if (p.team !== TEAM_CT || p.isZombie) continue;
      const s = this.st(p);
      s.ready = false;
      if (p.alive && !s.alive) { s.spawnT = g.time; this.reclaim(p); }
      s.alive = p.alive;
    }
    this.cutFrom = 0;
  }

  // ---------------------------------------------------------------- tick
  /** Every tick while the mode runs (ZombieMode.tick, before the break / wave logic). */
  tick(t) {
    if (!this.bound) this.bind();
    const g = this.game, Z = this.Z;
    let humans = 0, ready = 0;
    for (const p of g.players) {
      if (p.team !== TEAM_CT || p.isZombie) continue;
      const s = this.st(p);
      if (p.alive && !s.alive && Z.state === 'wave') { s.spawnT = t; this.reclaim(p); } // (back some other way)
      s.alive = p.alive;
      if (p.alive && p.isBot) s.gun = p.weapons[1]; // (what it drops if it falls)
      if (!p.isBot) { humans++; if (s.ready) ready++; }
    }
    if (Z.state === 'break') {
      // everyone ready: the wave comes in a few seconds
      if (humans && ready === humans && !this.cutFrom && Z.nextWaveAt > t + READY_BREAK) {
        this.cutFrom = Z.nextWaveAt;
        Z.nextWaveAt = t + READY_BREAK;
        g.sound?.play('zm_allready', { volume: 0.8, attenuation: 'none' });
      }
      for (const b of g.bots.bots) {
        const p = b.p;
        if (p.team !== TEAM_CT || !p.alive) continue;
        const s = this.st(p);
        if (s.shopped !== this.breakId && t >= Math.min(s.shopAt, Z.nextWaveAt - 0.5)) this.botBuy(b);
      }
    } else if (Z.state === 'wave' && t >= this.dryAt) {
      // mid-wave a bot only buys ammo, and only once it has run dry
      this.dryAt = t + DRY_CHECK;
      for (const b of g.bots.bots) if (b.p.team === TEAM_CT && b.p.alive && !b.p.downed) this.topUp(b.p);
    }
  }

  // ---------------------------------------------------------------- pay
  /**
   * Pay p (rounds.addMoney, so the cap holds) and tell the bus how much actually came in. Every
   * income goes through here (reason 'kill' | 'special' | 'boss' | 'wave' | 'pickup'): perks
   * and power-ups scale it (zmods.js money).
   */
  pay(p, amount, reason) {
    const before = p.money;
    this.game.rounds.addMoney(p, this.Z.mods.money(p, amount, reason));
    this.earn(p, p.money - before, reason);
  }

  earn(p, amount, reason) {
    const E = this.Z.events;
    if (!amount || !inSquad(p) || !E.has('earn')) return;
    const e = E.obj('earn');
    e.player = p; e.amount = amount; e.reason = reason;
    e.wave = this.Z.wave; e.t = this.game.time;
    E.emit('earn', e);
  }

  /** What a common kill is worth in the current wave (econ.killPay). */
  killValue(head) {
    const K = this.Z.diff.econ.killPay;
    const v = Math.min(K.max, K.base + K.perWave * Math.max(1, this.Z.wave));
    return head ? Math.round(v * (1 + K.headBonus)) : v;
  }

  /** game.killPlayer: the squad's pay for a kill (zombies, specials and bosses alike). */
  killPay(attacker, victim, head) {
    if (!victim.isZombie || !inSquad(attacker)) return;
    this.pay(attacker, this.killValue(head), 'kill');
  }

  /** Specials.onDeath: the bounty on a special, on top of the kill. */
  specialPay(attacker, z) {
    if (!inSquad(attacker) || !z.isZombie) return;
    this.pay(attacker, this.Z.diff.econ.specialPay, 'special');
  }

  /**
   * BossDirector.onKilled: the boss's bounty, split by each squad member's share of the
   * damage it took (Sandbox: the whole bounty to everyone standing). Returns the start of
   * the "IS DEAD" line for you ('+$1200 (40% of the damage), ' or '').
   */
  bossPay() {
    const g = this.game, E = this.Z.diff.econ, me = g.local;
    let mine = 0, share = 0, total = 0;
    if (!E.bossSplit) {
      for (const p of g.players) if (p.team === TEAM_CT && !p.isZombie && p.alive) { this.pay(p, E.bossPay, 'boss'); if (p === me) mine = E.bossPay; }
      this.bossDmg.clear();
      return mine ? `+$${mine}, ` : '';
    }
    for (const d of this.bossDmg.values()) total += d;
    if (total <= 0) {
      // nobody in the squad hurt it (it can't happen in play): everyone standing shares evenly
      for (const p of g.players) if (p.team === TEAM_CT && !p.isZombie && p.alive) this.bossDmg.set(p, 1);
      for (const d of this.bossDmg.values()) total += d;
    }
    for (const [p, d] of this.bossDmg) {
      const amount = Math.round(E.bossPay * d / total / 10) * 10;
      if (amount > 0 && g.players.includes(p)) this.pay(p, amount, 'boss');
      if (p === me) { mine = amount; share = d / total; }
    }
    this.bossDmg.clear();
    return mine ? `+$${mine} (${Math.round(share * 100)}% of the damage), ` : '';
  }

  // ---------------------------------------------------------------- the shop
  /** The whole shop is open to p: the break, Sandbox's any time, or just back from a respawn. */
  open(p) {
    const Z = this.Z;
    return Z.state !== 'wave' || Z.diff.econ.buyAnytime || this.rearm(p) > 0;
  }

  /** Seconds left of p's re-arm window (back from a respawn mid-wave), else 0 (always on hardcore). */
  rearm(p) {
    if (this.Z.diff.hardcore) return 0; // (hardcore: guns in the breaks only, back from the dead or not)
    const s = this.ps.get(p);
    return s && s.spawnT ? Math.max(0, s.spawnT + REARM - this.game.time) : 0;
  }

  /** Why p can't buy item right now (a sentence for the centre print), or null. */
  refusal(p, item) {
    if (p.downed) return "You can't buy anything while you're down!";
    if (this.open(p) || COMBAT_ITEMS.has(item)) return null;
    const k = this.Z.diff.econ.combatPremium;
    return `The shop is shut until the wave is over.\nMid-wave: ammo, armour and medkits only${k ? ` (+${Math.round(k * 100)}%)` : ''}.`;
  }

  /** The price factor on item for p right now (the mid-wave premium on ammo, armour, medkits; perks: zmods.js price). */
  scale(p, item) {
    const k = this.open(p) || !COMBAT_ITEMS.has(item) ? 1 : 1 + this.Z.diff.econ.combatPremium;
    return k * this.Z.mods.price(p, item);
  }

  /** rounds.buyItem's gate: 0 (refused; the reason is said) or the factor on the price. */
  buyGate(p, item, say) {
    const why = this.refusal(p, item);
    if (why) { say(why); return 0; }
    return this.scale(p, item);
  }

  /** List price of item for p (as rounds.buyItem charges it), null if it has none. */
  base(p, id) {
    const E = CR.RULES?.equipment || {};
    if (id === 'primammo' || id === 'secammo') return p.weapons[id === 'primammo' ? 1 : 2]?.def.ammoBuy?.cost ?? null;
    if (id === 'vest') return E.kevlar ?? 650;
    if (id === 'vesthelm') return p.armor >= 100 && !p.helmet ? E.helmetUpgrade ?? 350 : E.assaultSuit ?? 1000;
    if (id === 'nvgs') return 1250;
    if (id === 'defuser') return 200;
    const [kind, k] = id.split('_');
    if (kind === 'att') return ATT.ATTACHMENTS[k]?.price ?? null;
    if (kind === 'skin') return ATT.SKINS[k]?.price ?? null;
    if (kind === 'perk') return id === SECOND_WIND.id ? SECOND_WIND.price : null; // (perks: zdowned.js)
    if (kind === 'tier' || kind === 'round') return this.Z.forge.price(p, id); // (the forge: zforge.js)
    return WS.WEAPON_DEFS[id]?.price ?? null;
  }

  /** What item costs p right now (premium included, rounded to $5 like buyItem). */
  cost(p, id) {
    const c = this.base(p, id), k = this.scale(p, id);
    return c == null ? null : k === 1 ? c : Math.round(c * k / 5) * 5;
  }

  /** Why item would be refused whatever the phase (already have it, full...): { off, note }. */
  owned(p, id) {
    if (/^(att|skin|perk)_/.test(id)) return ATT.menuState(p, id); // (a perk: "owned" once bought)
    if (/^(tier|round)_/.test(id)) return this.Z.forge.menuState(p, id); // (zforge.js)
    if (id === 'primammo' || id === 'secammo') {
      const w = p.weapons[id === 'primammo' ? 1 : 2];
      if (!w || !w.def.ammoBuy) return { off: true, note: 'no gun' };
      return w.ammo >= w.def.maxAmmo ? { off: true, note: 'full' } : {};
    }
    if (id === 'vest') return p.armor >= 100 ? { off: true, note: 'full' } : {};
    if (id === 'vesthelm') return p.armor >= 100 && p.helmet ? { off: true, note: 'full' } : {};
    const def = WS.WEAPON_DEFS[id];
    if (!def) return {};
    if (def.slot === 4) {
      const have = p.weapons[4].find((x) => x.id === id);
      return have && (have.count || 1) >= WS.stackMax(id) ? { off: true, note: 'max' } : {};
    }
    return p.weapons[def.slot]?.id === id ? { off: true, note: 'have it' } : {};
  }

  /**
   * The buy menu (main.js itemState): { off, note (short, on the button), why (the info
   * panel), price (now), closed (shut by the phase, not by what you carry) } for item.
   */
  menuState(p, id) {
    const own = this.owned(p, id);
    const why = this.refusal(p, id);
    const price = this.cost(p, id);
    if (why) return { off: true, note: own.off ? own.note : null, why: why.replace('\n', ' '), price, closed: true };
    const prem = this.open(p) || !COMBAT_ITEMS.has(id) ? 0 : this.Z.diff.econ.combatPremium; // (the markup alone: perks' discounts are in the price)
    const brk = price != null ? Math.round(price / (1 + prem) / 5) * 5 : null;
    return { off: !!own.off, note: own.note || null, why: prem > 0 ? `Mid-wave price (+${Math.round(prem * 100)}%): $${brk} in the break.` : null, price };
  }

  /** The line along the bottom of the buy menu: what the shop sells right now. */
  menuBanner(p) {
    const Z = this.Z, E = Z.diff.econ;
    if (p.downed) return "You're down: no shopping";
    if (E.buyAnytime) return null;
    if (Z.state !== 'wave') return 'BREAK: everything is for sale (F1: ready)';
    const r = this.rearm(p);
    if (r > 0) return `RE-ARM: the whole shop for ${Math.ceil(r)} more seconds`;
    return `MID-WAVE: ammo, armour, medkits only${E.combatPremium ? ` (+${Math.round(E.combatPremium * 100)}%)` : ''}`;
  }

  // ---------------------------------------------------------------- bots
  /** Bot.buy (zombie survival): shop when the shop is open to it; nothing mid-wave. */
  botBuy(bot) {
    const p = bot.p;
    if (p.isZombie || !p.alive || p.downed || !this.open(p)) return;
    this.st(p).shopped = this.Z.state === 'wave' ? -1 : this.breakId;
    this.shop(bot);
  }

  /**
   * A bot's shopping trip, on a budget: a better pistol than the starter (while it has no
   * primary), armour, a primary a tier above what it has, ammo, then a medkit or two and
   * attachments when there's money to spare.
   */
  shop(bot) {
    if (this.Z.squad.shop(bot, this)) return; // (a role with its own loadout: zsquad.js)
    const g = this.game, p = bot.p, R = g.rounds;
    const b = (id) => R.buy(p, id);
    const cost = (id) => this.cost(p, id) ?? Infinity;
    // 1. a pistol worth having
    const pistol = p.weapons[2];
    if (!p.weapons[1] && (!pistol || STARTERS.has(pistol.id)) && p.money >= cost('deagle') + KEEP) b('deagle');
    // 2. armour: a helmet once, the vest topped up when it's worn through
    if (!p.helmet && p.money >= cost('vesthelm') + KEEP) b('vesthelm');
    else if (p.armor < 50 && p.money >= cost('vest') + KEEP) b('vest');
    // 3. a primary: the best tier it can afford, if that beats what it has (a machine gun
    // only while the squad's few MG slots aren't taken: the rest stay on rifles)
    const sandbox = !!this.Z.diff.sandbox;
    const have = tierOf(p.weapons[1]);
    const maxTier = sandbox || this.mgSlots(p) > 0 ? 3 : 2;
    let top = 0;
    for (const [id, tier] of BOT_GUNS) if (tier > have && tier > top && tier <= maxTier && p.money >= cost(id) + KEEP) top = tier;
    if (top) {
      // the dearest it can afford in that tier (now and then the next one down, for variety);
      // with money to burn (Sandbox) a mix of rifles and the M249, as bots always bought
      let a = null, b2 = null;
      for (const [id, tier] of BOT_GUNS) if (tier === top && p.money >= cost(id) + KEEP) { b2 = a; a = id; }
      if (sandbox && p.money >= 8000 && have < 2) { const r = Math.random(); a = r < 0.25 ? 'm249' : r < 0.62 ? 'ak47' : 'm4a1'; b2 = null; }
      if (p.weapons[1] && tierOf(p.weapons[1]) === 0) g.dropWeapon(p, p.weapons[1]); // (no bolt-actions against a horde)
      b(b2 && Math.random() < 0.35 ? b2 : a);
    }
    // 4. ammo for what it carries
    if (p.weapons[1]) for (let i = 0; i < 4; i++) if (!b('primammo')) break;
    for (let i = 0; i < 2; i++) if (!b('secammo')) break;
    // 5. spare money: medkits, then attachments for the main gun
    const kits = () => p.weapons[4].find((x) => x.id === 'medkit')?.count ?? 0;
    for (let i = 0; i < 2 && kits() < 2 && p.money >= cost('medkit') + 1000; i++) if (!b('medkit')) break;
    const gun = p.weapons[1] || p.weapons[2];
    if (gun && p.money >= 4000) {
      if (p.active !== gun) g.selectWeapon(p, gun, true); // (upgrades go on the gun in hand)
      const max = sandbox ? BOT_ATTS.length : BOT_ATT_MAX;
      for (const a of BOT_ATTS) {
        if (p.money < ATT.ATTACHMENTS[a].price + 3000 || attCount(gun) >= max) break;
        if (!ATT.whyNot(gun, a) && !gun.att?.[ATT.ATTACHMENTS[a].slot]) b('att_' + a);
      }
    }
    const best = p.weapons[1] || p.weapons[2];
    if (best && p.active !== best) g.selectWeapon(p, best);
  }

  /** How many more of the squad's bots may carry a machine gun, besides p (MG_CAP). */
  mgSlots(p) {
    let bots = 0, mgs = 0;
    for (const q of this.game.players) {
      if (!q.isBot || !inSquad(q)) continue;
      bots++;
      if (q !== p && tierOf(q.weapons[1]) === 3) mgs++;
    }
    return MG_CAP(bots) - mgs;
  }

  /**
   * A bot back from the dead picks its own primary up again if it's still lying where it
   * fell (nobody took it): with money this scarce it couldn't buy another for a while.
   */
  reclaim(p) {
    const g = this.game, s = this.ps.get(p), w = s?.gun;
    if (!p.isBot || !w || p.weapons[w.def.slot]) return;
    s.gun = null;
    const d = g.dropped.find((x) => x.weapon === w && !x.taken);
    if (d && g.tryPickup(p, d)) g.selectWeapon(p, w, true);
  }

  /** Mid-wave: a bot whose guns have run dry buys ammo (at the combat price). */
  topUp(p) {
    const R = this.game.rounds, w1 = p.weapons[1], w2 = p.weapons[2];
    if (w1 && !loaded(w1)) { for (let i = 0; i < 2; i++) if (!R.buy(p, 'primammo')) break; }
    else if (!loaded(w1) && w2 && !loaded(w2)) R.buy(p, 'secammo');
  }

  // ---------------------------------------------------------------- ready-up
  /** A key / console command nothing else took (ZombieMode.command): true if it was yours. */
  command(p, cmd, args = []) {
    if (cmd !== 'zm_ready' && cmd !== 'autobuy') return false; // (F1 is 'autobuy')
    this.setReady(p, args[0] === '1' ? true : args[0] === '0' ? false : null);
    return true;
  }

  /** Ready up (on true, off false, or toggle on null): in the break only. */
  setReady(p, on = null) {
    const g = this.game, Z = this.Z;
    if (!this.bound) this.bind();
    if (Z.state !== 'break' || p.isBot || p.team !== TEAM_CT) {
      if (p.isLocal && Z.state === 'wave') g.hud?.centerPrint?.('You can ready up in the break.', 2);
      return false;
    }
    const s = this.st(p);
    const was = s.ready;
    s.ready = on ?? !s.ready;
    if (s.ready === was) return s.ready;
    let all = true;
    for (const q of g.players) if (q.team === TEAM_CT && !q.isBot && !q.isZombie && !this.st(q).ready) all = false;
    if (!s.ready && this.cutFrom) {
      // changed your mind: the break gets its time back
      Z.nextWaveAt = Math.max(Z.nextWaveAt, this.cutFrom);
      this.cutFrom = 0;
    }
    const cuts = s.ready && all && !this.cutFrom && Z.nextWaveAt > g.time + READY_BREAK; // (then tick plays zm_allready)
    if (p.isLocal && !cuts) g.sound?.play(s.ready ? 'zm_ready' : 'menu_click', { volume: 0.7, attenuation: 'none' });
    this.Z.events.mode('ready', { player: p, ready: s.ready, all: s.ready && all });
    this.tick(g.time); // (the break is cut short right away when that was the last one)
    return s.ready;
  }

  // ---------------------------------------------------------------- HUD
  /** HUD state (buildHudState, zombie survival only): this feature's fields go in s.zmEcon. */
  hud(s) {
    const g = this.game, Z = this.Z, me = g.local, h = this.hs, t = g.time;
    if (!me || !this.bound) return;
    h.phase = Z.state;
    h.open = this.open(me) && !me.downed;
    h.combat = Z.state === 'wave' && !h.open && !Z.diff.econ.buyAnytime;
    h.premium = Z.diff.econ.combatPremium;
    h.rearm = Z.state === 'wave' ? this.rearm(me) : 0;
    h.readyN = 0; h.humans = 0; h.bots = 0;
    for (const p of g.players) {
      if (p.team !== TEAM_CT || p.isZombie) continue;
      if (p.isBot) { h.bots++; continue; }
      h.humans++;
      if (this.st(p).ready) h.readyN++;
    }
    h.ready = !!this.ps.get(me)?.ready;
    h.all = h.humans > 0 && h.readyN === h.humans;
    h.left = Z.state === 'break' ? Math.max(0, Z.nextWaveAt - t) : 0;
    const len = (this.cutFrom || Z.nextWaveAt) - this.breakT0;
    h.frac = Z.state === 'break' && len > 0 ? Math.min(1, h.left / len) : 0;
    s.zmEcon = h;
    s.inBuyZone = !!s.inBuyZone && h.open; // (the buy icon: the whole shop is open)
  }

  /** HUD layer: the break bar with who is ready, and the shop's state next to your money. */
  draw(hud, s) {
    const h = s.zmEcon, z = s.zombie;
    if (!h || !z) return;
    const k = hud.k, vw = hud.vw, lh = hud.lineH;
    if (h.phase === 'break') {
      // under the "Next wave in" line (hud.drawZombie's layout)
      const top = s.alive ? 6 * k : Math.round(hud.vh * 0.11) + 6 * k;
      const px = Math.round(hud.fontPx * 1.7);
      const y = top + Math.round(px * 1.2) + lh + Math.round(3 * k);
      const w = Math.round(Math.min(vw * 0.42, 300 * k)), bh = Math.max(2, Math.round(3 * k));
      const x = Math.round(vw / 2 - w / 2), G = hud.gTop;
      const col = h.all ? HUD_RED : HUD_AMBER;
      G.fillStyle = 'rgba(0,0,0,0.55)';
      G.fillRect(x - 1, y - 1, w + 2, bh + 2);
      G.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.85)`;
      G.fillRect(x, y, Math.round(w * h.frac), bh);
      const y2 = y + bh + Math.round(4 * k);
      if (h.all) hud.text(h.humans > 1 ? 'EVERYONE IS READY - HERE THEY COME' : 'READY - HERE THEY COME', vw / 2, y2, HUD_RED, { align: 'center' });
      else if (h.ready) hud.text(`READY (${h.readyN}/${h.humans}) - WAITING FOR THE SQUAD`, vw / 2, y2, HUD_GREEN, { align: 'center' });
      else if (s.alive) hud.text('Shop open (B)   -   F1 when you are ready', vw / 2, y2, HUD_AMBER, { align: 'center' });
      else hud.text('F1 when you are ready', vw / 2, y2, HUD_AMBER, { align: 'center' });
      // who's ready: every human in the squad (bots always are)
      if (h.humans > 1 || h.bots) this.drawRoster(hud, vw / 2, y2 + lh, h);
    }
    if (!s.alive || s.money == null) return;
    // next to the money: what the shop sells right now
    let label = null, rgb = HUD_DIM;
    if (h.rearm > 0) { label = `RE-ARM ${Math.ceil(h.rearm)}`; rgb = HUD_GREEN; }
    else if (h.combat) label = h.premium ? `COMBAT PRICES +${Math.round(h.premium * 100)}%` : 'AMMO / ARMOUR / MEDKITS';
    else if (h.phase === 'break' && h.open) { label = 'SHOP OPEN'; rgb = HUD_GREEN; }
    if (!label) return;
    const xd = vw - (s.money > 99999 ? 154 : 134) * k; // (hud.drawMoney: the dollar sign)
    const ym = Math.round(hud.vh - 3 * 25 * k) + Math.round((25 * k - lh) / 2);
    hud.text(label, xd - 6 * k, ym, rgb, { align: 'right', alpha: 0.85 });
  }

  /** "You  Bob  +3 bots": green if ready, grey if not. */
  drawRoster(hud, cx, y, h) {
    const g = this.game, me = g.local;
    const sep = '   ';
    let w = 0;
    for (const p of g.players) if (p.team === TEAM_CT && !p.isBot && !p.isZombie) w += hud.textWidth((p === me ? 'You' : p.name) + sep);
    const botTxt = h.bots ? `+${h.bots} bot${h.bots === 1 ? '' : 's'}` : '';
    w += botTxt ? hud.textWidth(botTxt) : -hud.textWidth(sep);
    let x = cx - w / 2;
    for (const p of g.players) {
      if (p.team !== TEAM_CT || p.isBot || p.isZombie) continue;
      const r = !!this.ps.get(p)?.ready;
      x = hud.text((p === me ? 'You' : p.name) + (botTxt || p !== me ? sep : ''), x, y, r ? HUD_GREEN : HUD_DIM);
    }
    if (botTxt) hud.text(botTxt, x, y, HUD_GREEN);
  }

  /** ZombieMode.start's greeting: the preset's money and rules. */
  greeting() {
    const d = this.Z.diff, n = d.firstBreak;
    if (d.econ.buyAnytime) return `Zombie survival (${d.label})\nBuy anything, anywhere, any time. The first wave comes in ${n} seconds.`;
    return `Zombie survival (${d.label}): $${d.econ.startMoney} and a pistol.\nShop now (B). Mid-wave it's ammo, armour and medkits only.\nThe first wave comes in ${n} seconds (F1 when you're ready).`;
  }
}
