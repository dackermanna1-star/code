// Zombie survival perks (Milestone 3.1, owner: perks). At every break you pick 1 of
// diff.perks.choices cards (Deadeye, Scavenger, Pyromaniac, Field Medic, Bulk Order,
// Overclock, Demolitions...), rarer cards every diff.perks.rareEvery waves; some are
// boon-and-curse gambles (curse: true: Blood Pact, Glass Cannon...); tag pairs unlock named
// synergies (Pyro + Tesla = Plasma Arc); bots draft by tags that match their guns. The draft
// is a non-pointer-locking overlay (ui/perkdraft.js: keys 1-n or a click, the next key
// rerolls once) that auto-picks at random when the wave starts; the perks you hold sit in a
// strip on the HUD, and the run report lists them.
//
// Contract (m3-contracts section 4) - the API the bosses (relics), drops (timed buffs) and
// squad builders use:
//   perks.grant(p, id, { source })    give p a perk (another stack if row.max allows); -> stacks, 0 if refused
//   perks.revoke(p, id)               take it away; -> true if p had it
//   perks.has(p, id)                  stacks p holds (0: none; a squad-wide buff counts for everyone in it)
//   perks.list(p)                     [{ id, n, source, until }] (a copy: menus, the run report)
//   perks.report(p)                   the run report's rows (name, rarity colour, glyph...; no timed buffs)
//   perks.buff(p | 'squad', id, secs) a timed one (a BUFFS row, powerups.js): runs out by itself
//                                     (secs default diff.drops.powerupSecs); taking it again restarts the clock
//   perks.roll(n, { rarity, tags, p, exclude, curses, weight, rnd })  n distinct ids, weighted by
//                                     RARITY weight (rarity: only that tier - 'relic' for trophies)
//   perks.offer(p, ids, { source, title, until })  a pick-1-of-n for p: bots pick at once (botPick),
//                                     a human gets it queued (offerFor) until choose() or the auto-pick;
//                                     one made mid-wave waits for the break (number keys stay weapons)
//   perks.offerFor(p) / perks.choose(p, k | id) / perks.reroll(p)   the open offer / pick / reroll it
//   perks.key(cmd)                    main.js: a number key while your card is open picks (n+1 rerolls)
// A perk's stats feed the modifier pipeline (zmods.js: within a stat bonuses add). What a stat
// can't say goes through hooks this module registers while anybody holds a perk (zmods 'out' /
// 'in' / 'money': weapon-family damage, Last Stand, Executioner, Live Wire, Bounty Hunter, Black
// Market) or the bus (kill: Scavenger, Butcher, Bloodthirst, Adrenaline, Hit and Run; hit: Plasma
// Arc, Napalm; revive: Guardian Angel). Stats added here (defineStat): pistolDamage, shotgunDamage,
// smgDamage, rifleDamage, sniperDamage, mgDamage, teslaDamage (read by the 'out' hook) and revive
// (a rate: zdowned.js times a revive with it).
// Events: 'perk' { phase: 'grant' | 'revoke' | 'expire', player (null: the squad), squad, id,
// rarity, n, source ('draft' | 'trophy' | 'synergy' | 'perk' (a perk's own buff) | ...), until },
// 'draft' { phase: 'offer' | 'pick', player, ids, id, source, reroll }, 'synergy' { player, id }.
// Difficulty: g.zombies.diff.perks { choices, rareEvery, rerolls, curse, from, rerollCost } (zdiff.js).
// Console: zm_perks (yours, and the open offer), zm_pick <n>, zm_reroll; with sv_cheats 1:
// zm_perk <id|list> [n], zm_buff <id> [secs] [squad], zm_offer [n] [rarity], zm_draft.
import { inSquad } from './runstats.js';
import { RELICS } from './relics.js';
import { BUFFS } from './powerups.js';
import { STATS, defineStat, damageKind } from './zmods.js';
import { HITGROUP } from './combatrules.js';
import { WEAPON_DEFS, clipSize } from './weaponsys.js';
import { rng } from './zrng.js';
import { TEAM_CT } from './player.js';
import { fontString } from '../ui/hud/font.js';
import { perkIcon, glyphFor } from '../ui/perkicons.js';
import { PerkDraftUI } from '../ui/perkdraft.js';

/** Rarity tiers: draft weight (0: never drafted), card colour. Relics come from boss trophies only; buffs are timed (power-ups); synergies unlock. */
export const RARITY = {
  common: { label: 'Common', weight: 60, rgb: [205, 205, 205] },
  uncommon: { label: 'Uncommon', weight: 28, rgb: [90, 220, 110] },
  rare: { label: 'Rare', weight: 12, rgb: [90, 160, 255] },
  relic: { label: 'Relic', weight: 0, rgb: [255, 185, 40] },
  buff: { label: 'Power-up', weight: 0, rgb: [255, 255, 255] },
  synergy: { label: 'Synergy', weight: 0, rgb: [255, 96, 210] },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'relic', 'buff', 'synergy'];
/** A boon-and-curse card's colour (its rarity still sets how often it's dealt). */
export const CURSE_RGB = [240, 64, 52];

// ---------------------------------------------------------------- stats of our own
/** Weapon-family damage stats (weaponsys kind -> stat), read by this module's 'out' hook. */
export const KIND_STATS = { pistol: 'pistolDamage', shotgun: 'shotgunDamage', smg: 'smgDamage', rifle: 'rifleDamage', sniper: 'sniperDamage', mg: 'mgDamage', tesla: 'teslaDamage' };
const KIND_LABEL = { pistol: 'Pistol', shotgun: 'Shotgun', smg: 'SMG', rifle: 'Rifle', sniper: 'Sniper rifle', mg: 'Machine gun', tesla: 'Tesla' };
for (const [k, st] of Object.entries(KIND_STATS)) defineStat(st, { kind: 'mul', min: 0.1, label: `${KIND_LABEL[k]} damage` });
defineStat('revive', { kind: 'rate', min: 0.4, max: 3, label: 'Revive speed' }); // (zdowned.js: the reviver's)
const WSTAT = Object.create(null), WKIND = Object.create(null); // weapon id -> its family's stat / its kind
for (const id in WEAPON_DEFS) { WKIND[id] = WEAPON_DEFS[id].kind; if (KIND_STATS[WEAPON_DEFS[id].kind]) WSTAT[id] = KIND_STATS[WEAPON_DEFS[id].kind]; }
const MELEE = new Set(['knife', 'chainsaw', 'shove', 'machete', 'fireaxe', 'katana']); // (the arsenal's blades too: zarsenal.js)
const LAST_STAND = 0.35; // Last Stand: below this share of max health
/** The HUD strip's icon size (px at the 640 sprite scale). */
export const STRIP_PX = 17;

/**
 * The perks. Row: { name, text (the card), bane (a curse's downside, shown in red), rarity,
 * tags ([] - synergies, bot drafting), stats ({ stat: bonus } while held, x stacks: zmods.js
 * STATS), max (stacks; 1), curse (a boon-and-curse gamble), squad (its stats go on the whole
 * squad: an aura), icon (a ui/perkicons.js glyph; default: the id's) }. Effects a stat can't
 * say are coded below by id (hooks, events).
 */
export const PERKS = {
  // common
  toughness: { name: 'Toughness', text: '+25 max health.', rarity: 'common', tags: ['body'], stats: { maxHealth: 25 }, max: 2 },
  quickhands: { name: 'Quick Hands', text: 'Reload 25% faster.', rarity: 'common', tags: ['guns'], stats: { reload: 0.25 } },
  fleetfoot: { name: 'Fleet Foot', text: 'Move 10% faster.', rarity: 'common', tags: ['speed'], stats: { speed: 0.1 } },
  thickskin: { name: 'Thick Skin', text: 'Claws hurt you 15% less.', rarity: 'common', tags: ['body'], stats: { takenClaw: -0.15 }, max: 2 },
  hollowpoints: { name: 'Hollow Points', text: 'Bullets deal 12% more damage.', rarity: 'common', tags: ['guns'], stats: { bulletDamage: 0.12 }, max: 2 },
  gunslinger: { name: 'Gunslinger', text: 'Pistols deal 35% more damage. Draw any gun 25% faster.', rarity: 'common', tags: ['pistol'], stats: { pistolDamage: 0.35, handling: 0.25 } },
  closequarters: { name: 'Close Quarters', text: 'Shotguns deal 25% more damage.', rarity: 'common', tags: ['shotgun'], stats: { shotgunDamage: 0.25 } },
  sprayandpray: { name: 'Spray and Pray', text: 'SMGs deal 25% more damage.', rarity: 'common', tags: ['smg'], stats: { smgDamage: 0.25 } },
  discipline: { name: 'Trigger Discipline', text: 'Rifles deal 20% more damage.', rarity: 'common', tags: ['rifle'], stats: { rifleDamage: 0.2 } },
  scavenger: { name: 'Scavenger', text: "Kills top up your gun's reserve (headshots twice as much). Better loot.", rarity: 'common', tags: ['loot'], stats: { luck: 0.25 } },
  fieldmedic: { name: 'Field Medic', text: 'Medkits heal 50% more. Revive teammates 40% faster.', rarity: 'common', tags: ['medic'], stats: { heal: 0.5, revive: 0.4 } },
  bountyhunter: { name: 'Bounty Hunter', text: 'Specials and bosses pay 50% more. Specials take 15% more damage.', rarity: 'common', tags: ['money'], stats: { specialDamage: 0.15 } },
  // uncommon
  deadeye: { name: 'Deadeye', text: 'Headshots deal 25% more damage.', rarity: 'uncommon', tags: ['aim'], stats: { headDamage: 0.25 } },
  bulkorder: { name: 'Bulk Order', text: 'Everything in the shop costs 10% less.', rarity: 'uncommon', tags: ['money'], stats: { price: -0.1 } },
  pyromaniac: { name: 'Pyromaniac', text: 'Fire deals 40% more damage. Fire hurts you 50% less.', rarity: 'uncommon', tags: ['fire'], stats: { fireDamage: 0.4, takenFire: -0.5 } },
  demolitions: { name: 'Demolitions', text: 'Explosives deal 35% more damage. Blasts hurt you 50% less.', rarity: 'uncommon', tags: ['blast'], stats: { blastDamage: 0.35, takenBlast: -0.5 } },
  livewire: { name: 'Live Wire', text: 'The tesla deals 35% more damage. Zombies that claw you get a jolt.', rarity: 'uncommon', tags: ['tesla'], stats: { teslaDamage: 0.35 } },
  overclock: { name: 'Overclock', text: 'Fire 15% faster.', rarity: 'uncommon', tags: ['guns'], stats: { fireRate: 0.15 } },
  deepmags: { name: 'Deep Mags', text: 'Magazines hold 30% more.', rarity: 'uncommon', tags: ['guns'], stats: { clip: 0.3 } },
  heavygunner: { name: 'Heavy Gunner', text: 'Machine guns deal 25% more damage. Claws hurt you 10% less.', rarity: 'uncommon', tags: ['mg'], stats: { mgDamage: 0.25, takenClaw: -0.1 } },
  butcher: { name: 'Butcher', text: 'Melee deals 60% more damage. Melee kills heal 5.', rarity: 'uncommon', tags: ['melee'], stats: { meleeDamage: 0.6 } },
  steadyaim: { name: 'Steady Aim', text: 'Sniper rifles deal 30% more damage. Specials take 15% more.', rarity: 'uncommon', tags: ['sniper', 'aim'], stats: { sniperDamage: 0.3, specialDamage: 0.15 } },
  laststand: { name: 'Last Stand', text: 'Below 35% health you deal 40% more damage and take 20% less.', rarity: 'uncommon', tags: ['body'] },
  luckycharm: { name: 'Lucky Charm', text: 'Much better loot. Earn 10% more money.', rarity: 'uncommon', tags: ['loot'], stats: { luck: 0.6, money: 0.1 } },
  // rare
  giantslayer: { name: 'Giant Slayer', text: 'Bosses take 25% more damage, specials 15% more.', rarity: 'rare', tags: ['aim'], stats: { bossDamage: 0.25, specialDamage: 0.15 } },
  bloodthirst: { name: 'Bloodthirst', text: 'Every kill heals 2 (headshot kills 5).', rarity: 'rare', tags: ['blood'] },
  rally: { name: 'Rally Cry', text: 'Aura: the whole squad deals 10% more damage and reloads 10% faster.', rarity: 'rare', tags: ['squad'], stats: { damage: 0.1, reload: 0.1 }, squad: true },
  adrenaline: { name: 'Adrenaline', text: 'Kills give you 3 s of +15% speed and fire rate.', rarity: 'rare', tags: ['speed'] },
  // boon-and-curse gambles (dealt in the curse slot only: diff.perks.curse)
  bloodpact: { name: 'Blood Pact', text: '+30% damage.', bane: '-25 max health.', rarity: 'uncommon', tags: ['blood'], stats: { damage: 0.3, maxHealth: -25 }, curse: true },
  glasscannon: { name: 'Glass Cannon', text: 'Headshots deal 60% more damage.', bane: 'You take 25% more damage.', rarity: 'rare', tags: ['aim'], stats: { headDamage: 0.6, taken: 0.25 }, curse: true },
  hairtrigger: { name: 'Hair Trigger', text: 'Fire 25% faster.', bane: 'Magazines hold 25% less.', rarity: 'common', tags: ['guns'], stats: { fireRate: 0.25, clip: -0.25 }, curse: true },
  juggernaut: { name: 'Juggernaut', text: 'Take 25% less damage.', bane: 'Move 12% slower.', rarity: 'uncommon', tags: ['body'], stats: { taken: -0.25, speed: -0.12 }, curse: true },
  greed: { name: 'Greed', text: 'Earn 40% more money.', bane: 'You take 15% more damage.', rarity: 'common', tags: ['money'], stats: { money: 0.4, taken: 0.15 }, curse: true },
};

/**
 * Synergies: hold one perk with tag a and another with tag b and the named bonus unlocks (a
 * perk of rarity 'synergy', granted and revoked by this module; never drafted).
 */
export const SYNERGIES = {
  plasmaarc: { name: 'Plasma Arc', pair: ['fire', 'tesla'], text: 'Tesla hits set zombies alight. Fire and the tesla deal 15% more damage.', stats: { fireDamage: 0.15, teslaDamage: 0.15 } },
  napalm: { name: 'Napalm', pair: ['fire', 'blast'], text: 'Your explosions set zombies alight. Explosives deal 15% more damage.', stats: { blastDamage: 0.15 } },
  executioner: { name: 'Executioner', pair: ['aim', 'pistol'], text: 'Pistol headshots deal 50% more damage.' },
  guardianangel: { name: 'Guardian Angel', pair: ['medic', 'body'], text: 'Teammates you revive get up with +40 health and 3 s of half damage. Revive 25% faster.', stats: { revive: 0.25 } },
  blackmarket: { name: 'Black Market', pair: ['money', 'loot'], text: 'Another 10% off everything. Kills pay $10 more.', stats: { price: -0.1 } },
  hitandrun: { name: 'Hit and Run', pair: ['melee', 'speed'], text: 'Melee kills give 3 s of +20% speed and 30% less damage taken.', stats: { meleeDamage: 0.2 } },
};

/** The timed buffs some perks give (perks.buff; rarity 'buff': never drafted). */
export const PERK_BUFFS = {
  adrenalinerush: { name: 'Adrenaline', text: '+15% speed and fire rate.', stats: { speed: 0.15, fireRate: 0.15 } },
  hitandrunrush: { name: 'Hit and Run', text: '+20% speed, 30% less damage taken.', stats: { speed: 0.2, taken: -0.3 } },
  guarded: { name: 'Guardian Angel', text: 'Half damage taken.', stats: { taken: -0.5 } },
};

/** Add rows to PERKS (relics.js, powerups.js; a builder's own table): defaults fill missing fields. */
export function registerPerks(rows, defaults = {}) {
  for (const [id, r] of Object.entries(rows)) {
    if (PERKS[id] && PERKS[id] !== r) console.warn(`[perks] "${id}" registered twice`);
    PERKS[id] = { tags: [], ...defaults, ...r };
    for (const k in PERKS[id].stats || {}) if (!STATS[k]) console.warn(`[perks] ${id}: unknown stat "${k}"`);
  }
}
registerPerks(Object.fromEntries(Object.entries(SYNERGIES).map(([id, s]) => [id, { ...s, tags: [], rarity: 'synergy', synergy: s.pair }])));
registerPerks(PERK_BUFFS, { rarity: 'buff' });
registerPerks(RELICS, { rarity: 'relic' });
registerPerks(BUFFS, { rarity: 'buff' });
for (const id in PERKS) PERKS[id].tags ||= [];

/** A rarer draft's odds (every diff.perks.rareEvery waves): x these on the rarity weight. */
const RARE_DRAFT = { common: 0.25, uncommon: 1.5, rare: 5 };
const rareWeight = (id, r, w) => w * (RARE_DRAFT[r.rarity] ?? 1);
const curseOnly = (id, r, w) => (r.curse ? w : 0);
/** What a bot's guns say it wants (weaponsys kind -> tags; equipment by id). */
const KIND_TAGS = { pistol: ['pistol'], shotgun: ['shotgun'], smg: ['smg'], rifle: ['rifle'], sniper: ['sniper', 'aim'], mg: ['mg'], flame: ['fire'], launcher: ['blast'], saw: ['melee'], tesla: ['tesla'], mine: ['blast'], medkit: ['medic'], knife: ['melee'] };
const ITEM_TAGS = { hegrenade: ['blast'], molotov: ['fire'], remotec4: ['blast'], pipebomb: ['blast'], cryogrenade: [] };
/** ...and its squad role (zsquad.js p.role). */
const ROLE_TAGS = { gunner: { mg: 3 }, medic: { medic: 3, body: 1 }, demo: { blast: 3, fire: 1 }, marksman: { sniper: 3, aim: 1.5 }, rifleman: { rifle: 2 } };

const statsOf = (row) => (row.stats && Object.keys(row.stats).length ? row.stats : null);
const WHITE = [255, 255, 255], STACKS = ['', '', '2', '3', '4', '5'];
const pick1 = (a, rnd = Math.random) => a[Math.floor(rnd() * a.length)];

export class ZPerks {
  constructor(game) {
    this.game = game;
    this.held = new Set(); // players with perks (p.perks: Map id -> { n, source, t, until })
    this.squadBuffs = new Map(); // id -> { until } (perks.buff('squad', ...))
    this.offers = new Map(); // player -> [offer...] (the first is the open one)
    this.ps = new Map(); // player -> { rerolls (spent this run) }
    this.rnd = Math.random; // the run's draft stream (rng(seed, 'perks'): reset on run start)
    this.unhook = null; // removes our zmods hooks (registered while anybody holds a perk)
    this.onOut = (a, v, dmg, hg, wid, opts) => this.out(a, v, dmg, hg, wid, opts);
    this.onIn = (v, a, dmg, hg, wid, opts) => this.in(v, a, dmg, hg, wid, opts);
    this.onMoney = (p, amount, reason) => this.money(p, amount, reason);
    this.jolts = Array.from({ length: 8 }, () => ({ v: null, a: null })); // Live Wire's jolts, done next tick
    this.jn = 0;
    this.shown = null; this.shownRev = -1; // the offer the overlay shows
    this.fonts = { px: 0, small: '' };
    this.strip = { hud: null, t: 0, i: 0, sz: 0, gap: 0, x0: 0, yb: 0, timed: false }; // (the strip's frame, for stripIcon)
    this.stripFn = (e, id) => this.stripIcon(e, id);
    this.rv = { key: 0, used: false, free: 0, cost: 0, afford: false }; // (the reroll button's state, refilled each frame)
    this.subscribed = false;
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
    game.hud?.addLayer?.((hud, s) => this.draw(hud, s), 3);
    this.ui = typeof document !== 'undefined' && game.hud?.root ? new PerkDraftUI(game.hud.root, {
      onPick: (k) => { const me = this.game.local; if (me) this.choose(me, k); },
      onReroll: () => { const me = this.game.local; if (me) this.reroll(me); },
      sound: (name) => this.game.sound?.play(name, { volume: 0.8, attenuation: 'none' }),
    }) : null;
  }

  get Z() { return this.game.zombies; }
  get mods() { return this.game.zombies.mods; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); else if (e.phase === 'over') this.over(); });
    ev.on('wave', (e) => {
      if (e.phase === 'start') this.autoPick(0); // (a card still open when the wave starts: picked at random)
      else if (e.phase === 'cleared') { this.unwait(); this.draft(e.wave); }
    });
    ev.on('kill', (e) => this.onKill(e));
    ev.on('hit', (e) => this.onHit(e));
    ev.on('revive', (e) => this.onRevive(e));
  }

  /** A new run: nobody holds anything (zmods.js clears its sources itself). */
  reset() {
    for (const p of this.held) p.perks = null;
    this.held.clear();
    this.squadBuffs.clear();
    this.offers.clear();
    this.ps.clear();
    this.jn = 0;
    this.rnd = rng(this.Z?.seed ?? 0, 'perks');
    this.syncHooks();
    this.ui?.hide(true);
    this.shown = null;
  }

  /** The run is over: nothing left to pick. */
  over() {
    this.offers.clear();
    this.ui?.hide();
    this.shown = null;
  }

  st(p) {
    let s = this.ps.get(p);
    if (!s) this.ps.set(p, s = { rerolls: 0 });
    return s;
  }

  // ---------------------------------------------------------------- holding
  /** Give p perk id (o.source: 'draft' | 'trophy' | 'synergy' | 'buy' | 'cheat' | ...). Returns its stacks, 0 if refused (unknown, at max). */
  grant(p, id, o = {}) {
    const row = PERKS[id];
    if (!row || !p || p === 'squad') return 0;
    const map = p.perks || (p.perks = new Map());
    const cur = map.get(id);
    if (cur && !cur.until && cur.n >= (row.max ?? 1)) return 0;
    const n = cur && !cur.until ? cur.n + 1 : 1, source = o.source || 'grant';
    map.set(id, { n, source, t: this.game.time, until: 0 });
    this.held.add(p);
    if (row.squad) this.aura(id);
    else if (statsOf(row)) this.mods.set(p, `perk:${id}`, row.stats, { n });
    this.emit('grant', p, id, n, source, 0);
    this.changed(p, row);
    return n;
  }

  /** Take perk id (every stack) off p. */
  revoke(p, id) {
    const e = p?.perks?.get(id);
    if (!e) return false;
    p.perks.delete(id);
    if (!p.perks.size) this.held.delete(p);
    if (e.until) this.mods.remove(p, `buff:${id}`);
    else if (PERKS[id]?.squad) this.aura(id);
    else this.mods.remove(p, `perk:${id}`);
    this.emit('revoke', p, id, 0, e.source, 0);
    this.changed(p, PERKS[id]);
    return true;
  }

  /**
   * A squad aura (a row with squad: true, e.g. Rally Cry): one source on the whole squad while
   * anybody in it holds the perk - holders don't stack it past row.auraMax (1).
   */
  aura(id) {
    const row = PERKS[id];
    let n = 0;
    for (const q of this.held) if (inSquad(q) && !q.perks.get(id)?.until) n += q.perks.get(id)?.n || 0;
    n = Math.min(n, row.auraMax ?? 1);
    if (n > 0 && statsOf(row)) this.mods.set('squad', `perk:${id}`, row.stats, { n });
    else this.mods.remove('squad', `perk:${id}`);
  }

  /** After p's perks changed: our hooks on or off, and the synergies its tags make now. */
  changed(p, row) {
    this.syncHooks();
    if (row && row.rarity !== 'buff' && row.rarity !== 'synergy') this.synergies(p);
  }

  /** How many stacks of id p holds (a squad-wide buff counts for everyone in the squad). */
  has(p, id) {
    const e = p?.perks?.get(id);
    if (e) return e.n;
    return this.squadBuffs.has(id) && inSquad(p) ? 1 : 0;
  }

  /** p's perks (a copy). */
  list(p) {
    const out = [];
    if (p?.perks) for (const [id, e] of p.perks) out.push({ id, n: e.n, source: e.source, until: e.until });
    return out;
  }

  /** The run report's rows for p: what it held (no timed buffs), with what the UI shows. */
  report(p) {
    const out = [];
    if (p?.perks) {
      for (const [id, e] of p.perks) {
        const r = PERKS[id];
        if (!r || e.until) continue;
        out.push({ id, n: e.n, name: r.name, text: r.text, bane: r.bane || '', rarity: r.rarity, label: r.curse ? 'Boon & curse' : RARITY[r.rarity]?.label || '', rgb: this.rgbOf(r), curse: !!r.curse, synergy: r.rarity === 'synergy', icon: glyphFor(id, r), source: e.source });
      }
    }
    return out;
  }

  /** The scoreboard's icons for p: [{ icon, rgb, name, n }] (no timed buffs). */
  badges(p) {
    const out = [];
    if (p?.perks) p.perks.forEach((e, id) => { const r = PERKS[id]; if (r && !e.until) out.push({ icon: r.glyph || (r.glyph = glyphFor(id, r)), rgb: this.rgbOf(r), name: r.name, n: e.n }); });
    return out;
  }

  rgbOf(row) { return row?.curse ? CURSE_RGB : (RARITY[row?.rarity] || RARITY.common).rgb; }

  /**
   * A timed buff (a BUFFS row: powerups.js) on p, or on the whole squad ('squad'), for secs
   * (default diff.drops.powerupSecs). Again while it lasts: the clock restarts. Returns when it ends.
   */
  buff(p, id, secs = null, o = {}) {
    const row = PERKS[id];
    if (!row || !p) return 0;
    const until = this.game.time + (secs ?? this.Z.diff.drops.powerupSecs);
    const source = o.source || 'buff';
    if (p === 'squad') this.squadBuffs.set(id, { until, t: this.game.time });
    else {
      const map = p.perks || (p.perks = new Map());
      map.set(id, { n: 1, source, t: this.game.time, until });
      this.held.add(p);
    }
    // (stats or not, the pipeline keeps the clock: done() when it runs out)
    this.mods.set(p, `buff:${id}`, row.stats || {}, { until, done: () => this.expired(p, id) });
    this.emit('grant', p, id, 1, source, until);
    if (p !== 'squad') this.syncHooks();
    return until;
  }

  expired(p, id) {
    if (p === 'squad') this.squadBuffs.delete(id);
    else if (p.perks?.get(id)?.until) { p.perks.delete(id); if (!p.perks.size) this.held.delete(p); }
    this.emit('expire', p, id, 0, 'buff', 0);
    if (p !== 'squad') this.syncHooks();
  }

  emit(phase, p, id, n, source, until) {
    this.Z.events.mode('perk', { phase, player: p === 'squad' ? null : p, squad: p === 'squad', id, rarity: PERKS[id]?.rarity || null, n, source, until });
  }

  // ---------------------------------------------------------------- synergies
  /** The synergies p's perks make now: unlock the new ones (an event, a sting, a card), drop the broken ones. */
  synergies(p) {
    if (!p?.perks) return;
    const by = new Map(); // tag -> perk ids holding it (not buffs, not synergies)
    for (const [id, e] of p.perks) {
      const r = PERKS[id];
      if (!r || e.until || r.rarity === 'synergy' || r.rarity === 'buff') continue;
      for (const t of r.tags) (by.get(t) || by.set(t, []).get(t)).push(id);
    }
    for (const sid in SYNERGIES) {
      const [a, b] = SYNERGIES[sid].pair, A = by.get(a), B = by.get(b);
      const on = !!(A && B && (A.length > 1 || B.length > 1 || A[0] !== B[0])); // (two different perks)
      const had = !!p.perks.get(sid);
      if (on && !had) {
        this.grant(p, sid, { source: 'synergy' });
        this.Z.events.mode('synergy', { player: p, id: sid });
        if (p === this.game.local) this.announce(p, sid, A, B);
      } else if (!on && had) this.revoke(p, sid);
    }
  }

  /** Which synergies taking id would unlock for p: [{ id, name, with (the perk's name it pairs with) }]. */
  completes(p, id) {
    const r = PERKS[id], out = [];
    if (!r || r.rarity === 'synergy' || r.rarity === 'buff') return out;
    for (const sid in SYNERGIES) {
      if (p?.perks?.get(sid)) continue;
      const [a, b] = SYNERGIES[sid].pair;
      for (const [mine, other] of [[a, b], [b, a]]) {
        if (!r.tags.includes(mine)) continue;
        let mate = null;
        if (p?.perks) for (const [hid, e] of p.perks) { const h = PERKS[hid]; if (hid !== id && !e.until && h && h.rarity !== 'synergy' && h.rarity !== 'buff' && h.tags.includes(other)) { mate = h; break; } }
        if (mate) { out.push({ id: sid, name: SYNERGIES[sid].name, with: mate.name }); break; }
      }
    }
    return out;
  }

  /** You unlocked synergy sid (made from perks with A's and B's tags): the sting and the card. */
  announce(p, sid, A, B) {
    const S = SYNERGIES[sid], a = PERKS[A[0]], b = PERKS[B.find((x) => x !== A[0]) || B[0]];
    this.game.sound?.play('perk_synergy', { volume: 0.9, attenuation: 'none' });
    this.ui?.toast({ kicker: 'Synergy unlocked', name: S.name, from: `${a?.name} + ${b?.name}`, text: S.text, icon: glyphFor(sid, PERKS[sid]), rgb: RARITY.synergy.rgb });
    if (!this.ui) this.game.hud?.centerPrint?.(`SYNERGY: ${S.name.toUpperCase()}\n${S.text}`, 4, 'info');
  }

  // ---------------------------------------------------------------- hooks (zmods.js; registered while anybody holds a perk)
  syncHooks() {
    const want = this.held.size > 0;
    if (want && !this.unhook) {
      const M = this.mods, offs = [M.addHook('out', this.onOut), M.addHook('in', this.onIn), M.addHook('money', this.onMoney)];
      this.unhook = () => { for (const f of offs) f(); };
    } else if (!want && this.unhook) { const u = this.unhook; this.unhook = null; u(); }
  }

  /** 'out' (a squad member's hit on a zombie; hot): weapon-family damage, Last Stand, Executioner. */
  out(a, v, dmg, hg, wid) {
    const zm = a.zm;
    if (zm) { const st = WSTAT[wid]; if (st !== undefined) dmg *= zm[st]; }
    const P = a.perks;
    if (P && P.size) {
      if (P.has('laststand') && !a.downed && a.health < LAST_STAND * a.maxHealth) dmg *= 1.4;
      if (P.has('executioner') && hg === HITGROUP.HEAD && WKIND[wid] === 'pistol') dmg *= 1.5;
    }
    return dmg;
  }

  /** 'in' (a hit on a squad member; hot): Last Stand, Live Wire's jolt. */
  in(v, a, dmg, hg, wid, opts) {
    const P = v.perks;
    if (!P || !P.size) return dmg;
    if (P.has('laststand') && !v.downed && v.health < LAST_STAND * v.maxHealth) dmg *= 0.8;
    if (P.has('livewire') && a && a !== v && a.isZombie && a.alive && !a.isBoss && damageKind(wid, opts, a) === 'melee') this.jolt(v, a);
    return dmg;
  }

  /** 'money': Bounty Hunter (specials and bosses x1.5), Black Market (+$10 a kill). */
  money(p, amount, reason) {
    const P = p.perks;
    if (!P || !P.size) return amount;
    if ((reason === 'special' || reason === 'boss') && P.has('bountyhunter')) amount = Math.round(amount * 1.5);
    if (reason === 'kill' && P.has('blackmarket')) amount += 10;
    return amount;
  }

  /** Live Wire: a zombie that clawed v gets a jolt (next tick: not inside the damage that's running). */
  jolt(v, a) {
    const t = this.game.time;
    if (t < (v.zpJolt || 0) || this.jn >= this.jolts.length) return;
    v.zpJolt = t + 0.6;
    const j = this.jolts[this.jn++];
    j.v = v; j.a = a;
  }

  doJolts() {
    const g = this.game, Z = this.Z;
    for (let i = 0; i < this.jn; i++) {
      const j = this.jolts[i], v = j.v, a = j.a;
      j.v = j.a = null;
      if (!v.alive || !a.alive || !a.isZombie) continue;
      const from = v.eyePos(), o = a.pm.origin, to = [o[0], o[1], o[2] + 14];
      const l = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) || 1;
      const dir = [(to[0] - from[0]) / l, (to[1] - from[1]) / l, (to[2] - from[2]) / l];
      g.arcs?.bolt(from, to, g.camPos || from, 0.14);
      for (let k = 0; k < 5; k++) g.fire?.emit('spark', to, [(Math.random() - 0.5) * 240, (Math.random() - 0.5) * 240, Math.random() * 200], { life: 0.3, size: 2, size1: 0.5, drag: 1, buoy: -500 });
      g.sound?.play('tesla_hit', { pos: to, volume: 0.55 });
      g.damagePlayer(a, v, 15, HITGROUP.CHEST, 'tesla', dir, to, { blast: true, jolt: true });
      if (a.alive) Z.stagger(a, 0.8, dir, 'tesla', v);
    }
    this.jn = 0;
  }

  // ---------------------------------------------------------------- the bus
  /** A kill by a squad member: Scavenger, Butcher, Bloodthirst, Adrenaline, Hit and Run. */
  onKill(e) {
    const p = e.attacker;
    if (!e.zombie || !e.squad || !p?.perks || !p.perks.size || !p.alive) return;
    const P = p.perks, melee = MELEE.has(e.weapon);
    if (P.has('scavenger')) this.scavenge(p, e.weapon, e.head);
    let heal = 0;
    if (melee && P.has('butcher')) heal += 5;
    if (P.has('bloodthirst')) heal += e.head ? 5 : 2;
    if (heal && !p.downed) p.health = Math.min(p.maxHealth, p.health + heal);
    if (P.has('adrenaline')) this.rush(p, 'adrenalinerush');
    if (melee && P.has('hitandrun')) this.rush(p, 'hitandrunrush');
  }

  /** Scavenger: a tenth of a magazine (a headshot: a fifth) back into the reserve of the gun that made the kill. */
  scavenge(p, weapon, head) {
    const w = p.active?.id === weapon ? p.active : p.weapons[1]?.id === weapon ? p.weapons[1] : p.weapons[2]?.id === weapon ? p.weapons[2] : null;
    if (!w || !w.def.ammoBuy || !(w.def.maxAmmo > 0) || w.ammo >= w.def.maxAmmo) return;
    w.ammo = Math.min(w.def.maxAmmo, w.ammo + Math.max(1, Math.round(clipSize(w) * (head ? 0.2 : 0.1))));
  }

  /** A kill-triggered rush (3 s; another kill restarts it). */
  rush(p, id) {
    const fresh = !p.perks.get(id);
    this.buff(p, id, 3, { source: 'perk' });
    if (fresh && p === this.game.local) this.game.sound?.play('perk_rush', { volume: 0.55, attenuation: 'none' });
  }

  /** A hit by a squad member (hot): Plasma Arc (tesla hits burn), Napalm (explosions burn). */
  onHit(e) {
    const a = e.attacker;
    if (!a || !a.perks || !e.victim.isZombie || e.lethal || e.fire || e.acid || !e.victim.alive) return;
    const P = a.perks;
    if (e.weapon === 'tesla') { if (P.has('plasmaarc')) this.game.fire?.burn(e.victim, a, 2.5, 14, 'tesla'); }
    else if (e.blast && P.has('napalm')) this.game.fire?.burn(e.victim, a, 3, 16, e.weapon);
  }

  /** Guardian Angel: a teammate you pick up gets +40 health and 3 s of half damage. */
  onRevive(e) {
    const by = e.by, q = e.player;
    if (!by || by === q || !by.perks?.has('guardianangel') || !q?.alive) return;
    q.health = Math.min(q.maxHealth, q.health + 40);
    this.buff(q, 'guarded', 3, { source: 'perk' });
  }

  // ---------------------------------------------------------------- the draft
  /**
   * n distinct perk ids at random, weighted by RARITY weight. o: { rarity (only this tier:
   * 'relic' for a trophy; else every tier that drafts), tags (x2 the odds of ones with a tag
   * in it), p (skip what p holds at max), exclude (ids), curses (false: none), weight(id, row,
   * w) -> w (the draft's own odds: rarer every fifth wave...), rnd }.
   */
  roll(n, o = {}) {
    const rnd = o.rnd || Math.random, pool = [];
    let total = 0;
    for (const id in PERKS) {
      const r = PERKS[id], R = RARITY[r.rarity] || RARITY.common;
      if (o.rarity ? r.rarity !== o.rarity : !(R.weight > 0)) continue;
      if (o.exclude && (o.exclude.includes ? o.exclude.includes(id) : o.exclude.has(id))) continue;
      if (o.p && (o.p.perks?.get(id)?.n || 0) >= (r.max ?? 1) && !o.p.perks.get(id).until) continue;
      if (o.curses === false && r.curse) continue;
      let w = o.rarity ? 1 : R.weight;
      if (o.tags && r.tags?.some((t) => o.tags.includes(t))) w *= 2;
      if (o.weight) w = o.weight(id, r, w);
      if (w > 0) { pool.push(id, w); total += w; }
    }
    const out = [];
    while (out.length < n && pool.length) {
      let x = rnd() * total, i = 0;
      for (; i < pool.length - 2; i += 2) { x -= pool[i + 1]; if (x <= 0) break; }
      out.push(pool[i]);
      total -= pool[i + 1];
      pool.splice(i, 2);
    }
    return out;
  }

  /**
   * The cards for p's draft after wave n: diff.perks.choices of them (fewer if the pool runs
   * dry), rarer odds and at least one rare every rareEvery waves, and with diff.perks.curse odds
   * one boon-and-curse card. exclude: ids not to deal again (a reroll). -> { ids, rare }
   */
  deal(p, n, exclude = null) {
    const D = this.Z.diff.perks, rnd = this.rnd;
    const k = Math.max(1, D.choices), rare = D.rareEvery > 0 && n > 0 && n % D.rareEvery === 0;
    const weight = rare ? rareWeight : null;
    let ids = this.roll(k, { p, curses: false, weight, rnd, exclude });
    if (ids.length < k && exclude) ids = ids.concat(this.roll(k - ids.length, { p, curses: false, weight, rnd, exclude: ids }));
    if (rare && ids.length && !ids.some((id) => PERKS[id].rarity === 'rare')) {
      const r = this.roll(1, { p, rarity: 'rare', curses: false, rnd, exclude: exclude ? ids.concat(exclude) : ids });
      if (r.length) ids[ids.length - 1] = r[0];
    }
    if (ids.length > 1 && rnd() < D.curse) {
      const c = this.roll(1, { p, rnd, weight: curseOnly, exclude: exclude ? ids.concat(exclude) : ids });
      // (in place of a card that isn't the rare draft's rare one)
      const slot = ids.findIndex((id, i) => i > 0 && !(rare && PERKS[id].rarity === 'rare'));
      if (c.length) ids[slot >= 0 ? slot : 0] = c[0];
    }
    // (deal them in a random order: the curse or the rare one isn't always last)
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = ids[i]; ids[i] = ids[j]; ids[j] = x; }
    return { ids, rare };
  }

  /** Wave n is cleared: everyone in the squad drafts (from diff.perks.from on). Bots pick at once. */
  draft(n) {
    const D = this.Z.diff.perks;
    if (n < D.from || this.Z.state === 'over') return;
    const bots = (n - D.from) % Math.max(1, D.botEvery ?? 1) === 0; // (bots draft every botEvery breaks: they support, you carry the build)
    for (const p of this.game.players) {
      if (p.team !== TEAM_CT || p.isZombie || (p.isBot && !bots)) continue;
      const { ids, rare } = this.deal(p, n);
      if (ids.length) this.offer(p, ids, { source: 'draft', title: rare ? 'RARE DRAFT' : 'PERK DRAFT', rare, wave: n });
    }
  }

  /**
   * Offer p a pick of ids. o: { source ('draft' | 'trophy' | ...), title, until (game time
   * it auto-picks; 0: when the next wave starts), rare, wave }. A bot picks at once (botPick);
   * a human's offer queues behind any open one, and one made mid-wave waits for the break.
   * Returns the offer { p, ids, source, title, t, until, ... }.
   */
  offer(p, ids, o = {}) {
    if (!p || !ids?.length) return null;
    const Z = this.Z;
    const of = {
      p, ids: ids.slice(), source: o.source || 'draft', title: o.title || 'PICK A PERK', t: this.game.time, until: o.until || 0,
      rare: !!o.rare, wave: o.wave ?? Z.wave, rerolled: false, rev: 0, wait: !p.isBot && Z.state === 'wave' && !o.until,
    };
    Z.events.mode('draft', { phase: 'offer', player: p, ids: of.ids, id: null, source: of.source, reroll: false });
    if (p.isBot) { this.resolve(of, this.botPick(p, of.ids, of)); return of; }
    const q = this.offers.get(p);
    if (q) q.push(of); else this.offers.set(p, [of]);
    if (of.wait && p === this.game.local && !o.quiet) this.game.hud?.centerPrint?.(`${of.title}: pick in the break`, 3, 'info'); // (quiet: the caller says so itself - airdrop.js)
    return of;
  }

  /** The break: offers made mid-wave open now. */
  unwait() { for (const q of this.offers.values()) for (const of of q) of.wait = false; }

  /** The offer open for p (the overlay draws it), or null (none, or it waits for the break). */
  offerFor(p) {
    const of = this.offers.get(p)?.[0];
    return of && !of.wait ? of : null;
  }

  /** An offer of p's waiting for the break (the HUD strip says so), or null. */
  waiting(p) { return this.offers.get(p)?.find((of) => of.wait) || null; }

  /** p picks from its open offer: k (0-based) or an id. Returns the id granted, or null. */
  choose(p, k) {
    const of = this.offerFor(p);
    if (!of) return null;
    const id = typeof k === 'number' ? of.ids[k] : of.ids.includes(k) ? k : null;
    if (!id) return null;
    return this.resolve(of, id);
  }

  resolve(of, id) {
    const q = this.offers.get(of.p);
    if (q) { const i = q.indexOf(of); if (i >= 0) q.splice(i, 1); if (!q.length) this.offers.delete(of.p); }
    const n = this.grant(of.p, id, { source: of.source });
    this.Z.events.mode('draft', { phase: 'pick', player: of.p, ids: of.ids, id, source: of.source, reroll: of.rerolled });
    if (of.p === this.game.local) {
      const r = PERKS[id];
      this.game.sound?.play(r?.curse ? 'perk_curse' : r?.rarity === 'rare' || r?.rarity === 'relic' ? 'perk_rare' : 'perk_pick', { volume: 0.85, attenuation: 'none' });
      if (this.shown === of) { this.ui?.pick(of.ids.indexOf(id)); this.shown = null; }
      if (!n) this.game.hud?.centerPrint?.(`${r?.name}: you already have all of it`, 2, 'info');
    }
    return id;
  }

  /**
   * Reroll p's open draft: new cards (none of the ones it had, while there are others), once
   * a draft. The first diff.perks.rerolls of a run are free, then it costs rerollCost. True if it went.
   */
  reroll(p) {
    const of = this.offerFor(p), g = this.game;
    const say = (t) => { if (p === g.local) g.hud?.centerPrint?.(t, 2, 'info'); };
    if (!of || of.source !== 'draft') { say('Nothing to reroll.'); return false; }
    if (of.rerolled) { say('You can reroll a draft once.'); return false; }
    const st = this.st(p), cost = this.rerollPrice(p);
    if (cost > 0) {
      if (p.money < cost) { say(`A reroll costs $${cost}.`); if (p === g.local) g.hud?.moneyBlink?.(2); return false; }
      g.rounds.addMoney(p, -cost);
      this.Z.events.buy(p, 'perk_reroll', cost);
    }
    st.rerolls++;
    const { ids, rare } = this.deal(p, of.wave, of.ids);
    if (!ids.length) return false;
    of.ids = ids; of.rare = rare; of.rerolled = true; of.rev++;
    this.Z.events.mode('draft', { phase: 'offer', player: p, ids: of.ids, id: null, source: of.source, reroll: true });
    if (p === g.local) g.sound?.play('perk_reroll', { volume: 0.85, attenuation: 'none' });
    return true;
  }

  /** Free rerolls p has left this run. */
  freeRerolls(p) { return Math.max(0, this.Z.diff.perks.rerolls - (this.ps.get(p)?.rerolls || 0)); }

  /** What p's next reroll costs (0: a free one). */
  rerollPrice(p) {
    if (this.freeRerolls(p) > 0) return 0;
    const [b, k] = this.Z.diff.perks.rerollCost || [250, 25];
    return Math.round((b + k * Math.max(1, this.Z.wave)) * this.mods.price(p, 'perk_reroll') / 5) * 5;
  }

  /**
   * What a bot takes from ids: the card whose tags best match its guns, equipment and squad
   * role (zsquad.js), a synergy it completes, rarer is better; it shies away from curses.
   */
  botPick(p, ids) {
    const want = this.botTags(p), rnd = this.rnd;
    let best = ids[0], bs = -Infinity;
    for (const id of ids) {
      const r = PERKS[id];
      if (!r) continue;
      let s = rnd() * 0.6;
      for (const t of r.tags) s += want[t] || 0;
      if (r.curse) s -= 2.5;
      if (r.rarity === 'rare' || r.rarity === 'relic') s += 0.5;
      if (this.completes(p, id).length) s += 3;
      if ((p.perks?.get(id)?.n || 0) >= (r.max ?? 1)) s -= 10; // (nothing more to get from it)
      if (r.squad && this.mods.has('squad', `perk:${id}`)) s -= 3; // (the squad has that aura already: it doesn't stack)
      if (s > bs) { bs = s; best = id; }
    }
    return best;
  }

  /** Tag -> how much bot p wants it (its weapons, its role). */
  botTags(p) {
    const want = { guns: 1, body: 1, aim: 0.8, squad: 1.2, medic: 0.3, speed: 0.4, money: 0.3, loot: 0.4, blood: 0.5 };
    const add = (tags, k) => { for (const t of tags || []) want[t] = (want[t] || 0) + k; };
    if (p.weapons?.[1]) add(KIND_TAGS[p.weapons[1].def.kind], 2.5);
    if (p.weapons?.[2]) add(KIND_TAGS[p.weapons[2].def.kind], 1);
    if (p.weapons?.[3] && p.weapons[3].id !== 'knife') add(KIND_TAGS.knife, 1.5); // (a bought blade: zarsenal.js)
    for (const w of p.weapons?.[4] || []) add(ITEM_TAGS[w.id] || KIND_TAGS[w.def?.kind], 0.8);
    const R = ROLE_TAGS[p.role];
    if (R) for (const t in R) want[t] = (want[t] || 0) + R[t];
    return want;
  }

  /** Open offers past their time (t; 0: every one waiting for a wave start) are picked at random (not a curse, if there's another card). */
  autoPick(t) {
    for (const q of [...this.offers.values()]) {
      const of = q[0];
      if (!of || of.wait || !(t ? of.until && t >= of.until : !of.until)) continue;
      const safe = of.ids.filter((id) => !PERKS[id]?.curse);
      const id = this.resolve(of, pick1(safe.length ? safe : of.ids));
      if (of.p === this.game.local) this.game.hud?.centerPrint?.(`Picked for you: ${PERKS[id]?.name}`, 3, 'info');
    }
  }

  /** main.js, a key command before the game sees it: with a card open for you, 1..n pick from it, n+1 rerolls a draft. True when it took the key. */
  key(cmd) {
    const me = this.game.local, of = me && this.offerFor(me);
    const m = of && /^slot(\d+)$/.exec(cmd || '');
    if (!m) return false;
    const k = +m[1];
    if (k === of.ids.length + 1 && of.source === 'draft') { this.reroll(me); return true; }
    if (k < 1 || k > of.ids.length) return false;
    this.choose(me, k - 1);
    return true;
  }

  // ---------------------------------------------------------------- the module hooks
  /** Every tick (ZombieMode.tick). */
  tick(t) {
    if (this.offers.size) this.autoPick(t);
    if (this.jn) this.doJolts();
  }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only): the draft overlay follows your open offer. */
  frame(dt) {
    const ui = this.ui;
    if (!ui) return;
    const g = this.game, Z = this.Z, me = g.local, of = me && Z.state !== 'over' ? this.offerFor(me) : null;
    if (of !== this.shown || (of && of.rev !== this.shownRev)) {
      const fresh = of && of !== this.shown;
      if (of) ui.show(this.view(of), { reroll: !fresh });
      else if (this.shown) ui.hide();
      if (fresh) g.sound?.play(of.rare || of.source === 'trophy' ? 'perk_rare' : 'perk_open', { volume: 0.75, attenuation: 'none' });
      this.shown = of; this.shownRev = of ? of.rev : -1;
    }
    if (of) {
      const left = Z.state === 'break' && !of.until ? Math.max(0, Z.nextWaveAt - g.time) : of.until ? Math.max(0, of.until - g.time) : null;
      const total = Z.state === 'break' ? Math.max(1, Z.nextWaveAt - of.t) : of.until ? Math.max(1, of.until - of.t) : 1;
      ui.timer(left, total);
      if (of.source === 'draft') ui.rerollState(this.rerollView(me, of, this.rv));
    }
    ui.frame(dt);
  }

  /** The overlay's model of offer of. */
  view(of) {
    const p = of.p;
    return {
      title: of.title,
      kicker: of.source === 'draft' ? (of.rare ? `Wave ${of.wave} cleared - rarer cards` : `Wave ${of.wave} cleared`) : of.source === 'trophy' ? 'Boss trophy - a relic for the run' : 'Pick one',
      rare: of.rare, source: of.source,
      cards: of.ids.map((id, i) => {
        const r = PERKS[id] || { name: id, text: '', rarity: 'common', tags: [] };
        return {
          id, key: i + 1, name: r.name, text: r.text, bane: r.bane || '', curse: !!r.curse,
          rarity: r.rarity, label: r.curse ? 'Boon & curse' : RARITY[r.rarity]?.label || '', rgb: this.rgbOf(r),
          icon: glyphFor(id, r), tags: r.tags.slice(), have: p.perks?.get(id)?.n || 0, max: r.max ?? 1, squad: !!r.squad,
          syn: this.completes(p, id),
        };
      }),
      reroll: of.source === 'draft' ? this.rerollView(p, of) : null,
    };
  }

  /** The reroll button's state (into o: the frame's reused one; else a new object). */
  rerollView(p, of, o = {}) {
    o.key = of.ids.length + 1; o.used = of.rerolled; o.free = this.freeRerolls(p); o.cost = o.free ? 0 : this.rerollPrice(p); o.afford = o.cost <= (p.money || 0);
    return o;
  }

  /** HUD layer: the strip of perks you hold (bottom left, above health), and a relic waiting for the break. */
  draw(hud, s) {
    if (!s.zombie) { if (this.ui?.visible) this.ui.hide(true); this.shown = null; return; }
    if (this.ui?.top != null) hud.centerAvoid = Math.min(hud.centerAvoid, this.ui.top * hud.vh - hud.lineH * 0.4); // (the centre prints keep above the cards)
    const me = this.game.local;
    if (!me || !s.alive || me.team !== TEAM_CT) return;
    const P = me.perks, wait = this.offers.size ? this.waiting(me) : null;
    if ((!P || !P.size) && !wait && !this.squadBuffs.size) return;
    const S = this.strip, k = hud.k;
    S.hud = hud; S.t = this.game.time; S.i = 0;
    S.sz = Math.round(STRIP_PX * k); S.gap = Math.round(3 * k); S.x0 = Math.round(16 * k);
    S.yb = Math.round(hud.vh - 25 * k * 1.5 - 8 * k - S.sz); // (above the health row)
    if (me.secondWind) S.yb -= hud.lineH + Math.round(2 * k); // (zdowned.js "SECOND WIND" sits there)
    if (this.fonts.px !== hud.fontPx) { this.fonts.px = hud.fontPx; this.fonts.small = fontString(Math.max(8, Math.round(hud.fontPx * 0.72)), true); }
    if (wait) {
      const pulse = 0.6 + 0.4 * Math.sin(S.t * 6);
      hud.spr(perkIcon('trophy', S.sz), S.x0, S.yb, RARITY.relic.rgb, 255 * pulse);
      hud.text(`${wait.title}: pick in the break`, S.x0 + S.sz + S.gap * 2, S.yb + Math.round((S.sz - hud.lineH) / 2), RARITY.relic.rgb, { alpha: 0.9 });
      S.yb -= S.sz + S.gap + Math.round(3 * k);
    }
    if (P) { S.timed = false; P.forEach(this.stripFn); S.timed = true; P.forEach(this.stripFn); } // (the perks, then the timed ones)
    if (this.squadBuffs.size) { S.timed = true; this.squadBuffs.forEach(this.stripFn); }
  }

  /** One icon of the strip (Map.forEach over p.perks / squadBuffs: e { n, t, until }). */
  stripIcon(e, id) {
    const S = this.strip, r = PERKS[id];
    if (!r || !!e.until !== S.timed) return;
    const hud = S.hud, sz = S.sz, i = S.i++, per = 10;
    const x = S.x0 + (i % per) * (sz + S.gap), y = S.yb - Math.floor(i / per) * (sz + S.gap * 2);
    const age = S.t - e.t, fresh = age < 2 ? 0.5 + 0.5 * Math.cos(age * 9) : 0;
    hud.spr(perkIcon(r.glyph || (r.glyph = glyphFor(id, r)), sz), x, y, this.rgbOf(r), Math.min(255, 200 + 55 * fresh));
    if (e.n > 1) hud.text(STACKS[e.n] || String(e.n), x + sz + 1, y + sz - hud.fontPx * 0.6, WHITE, { align: 'right', font: this.fonts.small, alpha: 0.95 });
    if (e.until) {
      const f = Math.max(0, Math.min(1, (e.until - S.t) / Math.max(0.1, e.until - e.t)));
      hud.fillAdd(x, y + sz + 1, Math.max(1, Math.round(sz * f)), Math.max(1, Math.round(2 * hud.k)), WHITE, 200);
    }
  }

  /** zm_perks, zm_pick <n>, zm_reroll; with sv_cheats 1: zm_perk <id|list> [n], zm_buff <id> [secs] [squad], zm_offer [n] [rarity], zm_draft. */
  command(p, cmd, args = []) {
    const g = this.game, out = (t) => g.console?.print?.(t);
    if (cmd === 'zm_perks') {
      const l = this.list(p).map((x) => `${x.id}${x.n > 1 ? ` x${x.n}` : ''}${x.until ? ` (${Math.max(0, x.until - g.time).toFixed(0)}s)` : ''}`);
      const of = this.offerFor(p) || this.waiting(p);
      out(`perks: ${l.join(', ') || 'none'}${this.squadBuffs.size ? ` | squad: ${[...this.squadBuffs.keys()].join(', ')}` : ''}${of ? ` | ${of.wait ? 'waiting' : 'open'} offer: ${of.ids.join(' / ')}` : ''} | free rerolls ${this.freeRerolls(p)}`);
      return true;
    }
    if (cmd === 'zm_pick') {
      const id = this.choose(p, Math.floor(+args[0]) - 1);
      out(id ? `picked ${PERKS[id].name}` : 'zm_pick: nothing to pick (or no such card)');
      return true;
    }
    if (cmd === 'zm_reroll') { out(this.reroll(p) ? `rerolled: ${this.offerFor(p).ids.join(' / ')}` : 'zm_reroll: nothing rerolled'); return true; }
    if (cmd !== 'zm_perk' && cmd !== 'zm_buff' && cmd !== 'zm_offer' && cmd !== 'zm_draft') return false;
    if (!g.console?.cheats) { out(`${cmd} needs sv_cheats 1`); return true; }
    const id = String(args[0] || '').toLowerCase();
    if (cmd === 'zm_draft') {
      this.Z.taint();
      const { ids, rare } = this.deal(p, Math.max(1, this.Z.wave));
      out(this.offer(p, ids, { source: 'draft', title: rare ? 'RARE DRAFT' : 'PERK DRAFT', rare, wave: Math.max(1, this.Z.wave) }) ? `drafted ${ids.join(' / ')}` : 'zm_draft: nothing to deal');
      return true;
    }
    if (cmd === 'zm_offer') {
      const ids = this.roll(Math.max(1, +args[0] || this.Z.diff.perks.choices), { p, rarity: args[1] || undefined });
      this.Z.taint();
      out(this.offer(p, ids, { source: 'cheat' }) ? `offered ${ids.join(' / ')}` : 'zm_offer: nothing to offer');
      return true;
    }
    if (id === 'list' || !PERKS[id]) { out(`${cmd} <${Object.keys(PERKS).join('|')}>`); return true; }
    this.Z.taint();
    if (cmd === 'zm_buff') {
      const until = this.buff(args[2] === 'squad' ? 'squad' : p, id, args[1] ? +args[1] : null, { source: 'cheat' });
      out(`${PERKS[id].name} for ${(until - g.time).toFixed(0)} s`);
      return true;
    }
    let n = 0;
    for (let i = 0; i < Math.max(1, Math.floor(+args[1]) || 1); i++) n = this.grant(p, id, { source: 'cheat' }) || n;
    out(n ? `${PERKS[id].name}${n > 1 ? ` x${n}` : ''}` : `zm_perk: ${id} is at its max`);
    return true;
  }
}

