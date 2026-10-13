// Zombie survival perks (Milestone 3.1, owner: perks). At every break you pick 1 of
// diff.perks.choices cards (Deadeye, Scavenger, Pyromaniac, Field Medic, Bulk Order,
// Overclock, Demolitions...), rarer cards every diff.perks.rareEvery waves; some are
// boon-and-curse gambles (curse: true); tag pairs unlock named synergies (Pyro + Tesla =
// Plasma Arc); bots draft by tags that match their guns. The draft is a non-pointer-locking
// overlay like radiomenu.js (keys 1-3, icons.js glyphs) and auto-picks at random when the
// wave starts.
//
// Contract (m3-contracts section 4) - the API the bosses (relics), drops (timed buffs) and
// squad builders use, already working in the scaffold:
//   perks.grant(p, id, { source })    give p a perk (another stack if row.max allows); -> stacks, 0 if refused
//   perks.revoke(p, id)               take it away; -> true if p had it
//   perks.has(p, id)                  stacks p holds (0: none; a squad-wide buff counts for everyone in it)
//   perks.list(p)                     [{ id, n, source, until }] (a copy: menus, the run report)
//   perks.buff(p | 'squad', id, secs) a timed one (a BUFFS row, powerups.js): runs out by itself
//                                     (secs default diff.drops.powerupSecs); taking it again restarts the clock
//   perks.roll(n, { rarity, tags, p, exclude, curses, weight, rnd })  n distinct ids, weighted by
//                                     RARITY weight (rarity: only that tier - 'relic' for trophies)
//   perks.offer(p, ids, { source, title, until })  a pick-1-of-n for p: bots pick at once (botPick),
//                                     a human gets it queued (offerFor) until choose() or the auto-pick
//   perks.offerFor(p) / perks.choose(p, k | id)    the open offer (the overlay draws it) / pick from it
//   perks.key(cmd)                    main.js: a number key while your card is open picks (true: taken)
// A perk's stats feed the modifier pipeline (zmods.js: within a stat bonuses add); logic a
// stat can't say subscribes to the bus (kill, hit...) or adds a zmods hook, checking has().
// Events: 'perk' { phase: 'grant' | 'revoke' | 'expire', player (null: the squad), squad, id,
// rarity, n, source, until }, 'draft' { phase: 'offer' | 'pick', player, ids, id, source },
// 'synergy' { player, id } (runstats.js).
// Difficulty: g.zombies.diff.perks { choices, rareEvery, rerolls, curse, from } (zdiff.js).
// Console: zm_perks (yours, and the open offer), zm_pick <n>; with sv_cheats 1: zm_perk <id|list>
// [n], zm_buff <id> [secs] [squad], zm_offer [n] [rarity].
//
// Scaffold (foundation): the API above works; four sample perks; no draft yet (nothing offers
// a card), and a plain text list stands in for the overlay when something does.
import { inSquad } from './runstats.js';
import { RELICS } from './relics.js';
import { BUFFS } from './powerups.js';
import { STATS } from './zmods.js';

/** Rarity tiers: draft weight (0: never drafted), card colour. Relics come from boss trophies only; buffs are timed (power-ups). */
export const RARITY = {
  common: { label: 'Common', weight: 60, rgb: [205, 205, 205] },
  uncommon: { label: 'Uncommon', weight: 28, rgb: [90, 220, 110] },
  rare: { label: 'Rare', weight: 12, rgb: [90, 160, 255] },
  relic: { label: 'Relic', weight: 0, rgb: [255, 185, 40] },
  buff: { label: 'Power-up', weight: 0, rgb: [255, 255, 255] },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'relic', 'buff'];

/**
 * The perks. Row: { name, text (the card), rarity, tags ([] - synergies, bot drafting),
 * stats ({ stat: bonus } while held, x stacks: zmods.js STATS), max (stacks; 1), curse (a
 * boon-and-curse gamble), squad (its stats go on the whole squad: an aura), icon (icons.js) }.
 */
export const PERKS = {
  toughness: { name: 'Toughness', text: '+25 max health.', rarity: 'common', tags: ['body'], stats: { maxHealth: 25 }, max: 2 },
  quickhands: { name: 'Quick Hands', text: 'Reload 25% faster.', rarity: 'common', tags: ['guns'], stats: { reload: 0.25 } },
  deadeye: { name: 'Deadeye', text: 'Headshots deal 25% more damage.', rarity: 'uncommon', tags: ['aim'], stats: { headDamage: 0.25 } },
  bulkorder: { name: 'Bulk Order', text: 'Everything in the shop costs 10% less.', rarity: 'uncommon', tags: ['money'], stats: { price: -0.1 } },
};

/** Add rows to PERKS (relics.js, powerups.js; a builder's own table): defaults fill missing fields. */
export function registerPerks(rows, defaults = {}) {
  for (const [id, r] of Object.entries(rows)) {
    if (PERKS[id]) console.warn(`[perks] "${id}" registered twice`);
    PERKS[id] = { tags: [], ...defaults, ...r };
    for (const k in PERKS[id].stats || {}) if (!STATS[k]) console.warn(`[perks] ${id}: unknown stat "${k}"`);
  }
}
registerPerks(RELICS, { rarity: 'relic' });
registerPerks(BUFFS, { rarity: 'buff' });

const HUD_AMBER = [255, 176, 0], HUD_DIM = [150, 130, 90];
const statsOf = (row) => (row.stats && Object.keys(row.stats).length ? row.stats : null);

export class ZPerks {
  constructor(game) {
    this.game = game;
    this.held = new Set(); // players with perks (p.perks: Map id -> { n, source, t, until })
    this.squadBuffs = new Map(); // id -> { until } (perks.buff('squad', ...))
    this.offers = new Map(); // player -> [offer...] (the first is the open one)
    this.subscribed = false;
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
    game.hud?.addLayer?.((hud, s) => this.draw(hud, s), 3);
  }

  get Z() { return this.game.zombies; }
  get mods() { return this.game.zombies.mods; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('wave', (e) => { if (e.phase === 'start') this.autoPick(0); }); // (a card still open when the wave starts: picked at random)
  }

  /** A new run: nobody holds anything (zmods.js clears its sources itself). */
  reset() {
    for (const p of this.held) p.perks = null;
    this.held.clear();
    this.squadBuffs.clear();
    this.offers.clear();
  }

  // ---------------------------------------------------------------- holding
  /** Give p perk id (o.source: 'draft' | 'trophy' | 'buy' | 'cheat' | ...). Returns its stacks, 0 if refused (unknown, at max). */
  grant(p, id, o = {}) {
    const row = PERKS[id];
    if (!row || !p || p === 'squad') return 0;
    const map = p.perks || (p.perks = new Map());
    const cur = map.get(id);
    if (cur && cur.n >= (row.max ?? 1)) return 0;
    const n = cur ? cur.n + 1 : 1, source = o.source || 'grant';
    map.set(id, { n, source, t: this.game.time, until: 0 });
    this.held.add(p);
    if (statsOf(row)) this.mods.set(row.squad ? 'squad' : p, row.squad ? `perk:${id}:${p.id}` : `perk:${id}`, row.stats, { n });
    this.emit('grant', p, id, n, source, 0);
    return n;
  }

  /** Take perk id (every stack) off p. */
  revoke(p, id) {
    const e = p?.perks?.get(id);
    if (!e) return false;
    p.perks.delete(id);
    if (!p.perks.size) this.held.delete(p);
    if (e.until) this.mods.remove(p, `buff:${id}`);
    else if (PERKS[id]?.squad) this.mods.remove('squad', `perk:${id}:${p.id}`);
    else this.mods.remove(p, `perk:${id}`);
    this.emit('revoke', p, id, 0, e.source, 0);
    return true;
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

  /**
   * A timed buff (a BUFFS row: powerups.js) on p, or on the whole squad ('squad'), for secs
   * (default diff.drops.powerupSecs). Again while it lasts: the clock restarts. Returns when it ends.
   */
  buff(p, id, secs = null, o = {}) {
    const row = PERKS[id];
    if (!row || !p) return 0;
    const until = this.game.time + (secs ?? this.Z.diff.drops.powerupSecs);
    const source = o.source || 'buff';
    if (p === 'squad') this.squadBuffs.set(id, { until });
    else {
      const map = p.perks || (p.perks = new Map());
      map.set(id, { n: 1, source, t: this.game.time, until });
      this.held.add(p);
    }
    // (stats or not, the pipeline keeps the clock: done() when it runs out)
    this.mods.set(p, `buff:${id}`, row.stats || {}, { until, done: () => this.expired(p, id) });
    this.emit('grant', p, id, 1, source, until);
    return until;
  }

  expired(p, id) {
    if (p === 'squad') this.squadBuffs.delete(id);
    else if (p.perks?.get(id)?.until) { p.perks.delete(id); if (!p.perks.size) this.held.delete(p); }
    this.emit('expire', p, id, 0, 'buff', 0);
  }

  emit(phase, p, id, n, source, until) {
    this.Z.events.mode('perk', { phase, player: p === 'squad' ? null : p, squad: p === 'squad', id, rarity: PERKS[id]?.rarity || null, n, source, until });
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
      if (o.p && (o.p.perks?.get(id)?.n || 0) >= (r.max ?? 1)) continue;
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
   * Offer p a pick of ids. o: { source ('draft' | 'trophy' | ...), title, until (game time
   * it auto-picks; 0: when the next wave starts) }. A bot picks at once (botPick); a human's
   * offer queues behind any open one. Returns the offer { p, ids, source, title, t, until }.
   */
  offer(p, ids, o = {}) {
    if (!p || !ids?.length) return null;
    const of = { p, ids: ids.slice(), source: o.source || 'draft', title: o.title || 'PICK A PERK', t: this.game.time, until: o.until || 0 };
    this.Z.events.mode('draft', { phase: 'offer', player: p, ids: of.ids, id: null, source: of.source });
    if (p.isBot) { this.resolve(of, this.botPick(p, of.ids, of)); return of; }
    const q = this.offers.get(p);
    if (q) q.push(of); else this.offers.set(p, [of]);
    return of;
  }

  /** The offer open for p (the overlay draws it), or null. */
  offerFor(p) { return this.offers.get(p)?.[0] || null; }

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
    this.grant(of.p, id, { source: of.source });
    this.Z.events.mode('draft', { phase: 'pick', player: of.p, ids: of.ids, id, source: of.source });
    return id;
  }

  /** What a bot takes from ids (the perks builder: by tags that match its guns). */
  botPick(p, ids) { return ids[Math.floor(Math.random() * ids.length)]; }

  /** Open offers past their time (t; 0: every one waiting for a wave start) are picked at random. */
  autoPick(t) {
    for (const q of [...this.offers.values()]) {
      const of = q[0];
      if (of && (t ? of.until && t >= of.until : !of.until)) this.resolve(of, of.ids[Math.floor(Math.random() * of.ids.length)]);
    }
  }

  /** main.js, a key command before the game sees it: with a card open for you, 1..n pick from it. True when it took the key. */
  key(cmd) {
    const me = this.game.local, of = me && this.offerFor(me);
    const m = of && /^slot(\d+)$/.exec(cmd || '');
    if (!m || +m[1] < 1 || +m[1] > of.ids.length) return false;
    this.choose(me, +m[1] - 1);
    return true;
  }

  // ---------------------------------------------------------------- scaffold hooks
  /** Every tick (ZombieMode.tick). */
  tick(t) { if (this.offers.size) this.autoPick(t); }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** Stand-in for the draft overlay: the open offer as a list (zm_pick <n>). */
  draw(hud, s) {
    const me = this.game.local, of = me && this.offerFor(me);
    if (!of || !s.zombie) return;
    const k = hud.k, lh = hud.lineH;
    let y = Math.round(hud.vh * 0.56); // (below the centre prints)
    hud.text(`${of.title} (keys 1-${of.ids.length})`, hud.vw / 2, y, HUD_AMBER, { align: 'center' });
    of.ids.forEach((id, i) => {
      const r = PERKS[id];
      y += lh + Math.round(2 * k);
      hud.text(`${i + 1}. ${r.name} - ${r.text}`, hud.vw / 2, y, RARITY[r.rarity]?.rgb || HUD_DIM, { align: 'center' });
    });
  }

  /** zm_perks, zm_pick <n>; with sv_cheats 1: zm_perk <id|list> [n], zm_buff <id> [secs] [squad], zm_offer [n] [rarity]. */
  command(p, cmd, args = []) {
    const g = this.game, out = (t) => g.console?.print?.(t);
    if (cmd === 'zm_perks') {
      const l = this.list(p).map((x) => `${x.id}${x.n > 1 ? ` x${x.n}` : ''}${x.until ? ` (${Math.max(0, x.until - g.time).toFixed(0)}s)` : ''}`);
      const of = this.offerFor(p);
      out(`perks: ${l.join(', ') || 'none'}${this.squadBuffs.size ? ` | squad: ${[...this.squadBuffs.keys()].join(', ')}` : ''}${of ? ` | open offer: ${of.ids.join(' / ')}` : ''}`);
      return true;
    }
    if (cmd === 'zm_pick') {
      const id = this.choose(p, Math.floor(+args[0]) - 1);
      out(id ? `picked ${PERKS[id].name}` : 'zm_pick: nothing to pick (or no such card)');
      return true;
    }
    if (cmd !== 'zm_perk' && cmd !== 'zm_buff' && cmd !== 'zm_offer') return false;
    if (!g.console?.cheats) { out(`${cmd} needs sv_cheats 1`); return true; }
    const id = String(args[0] || '').toLowerCase();
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
