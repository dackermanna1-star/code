// Zombie survival squad roles and orders (Milestone 3.3, owner: squad). Bots spawn with roles:
// a Gunner (M249, then the minigun), a Medic (revives first, patches teammates up sooner and
// from farther), a Demo (claymores where you hold, molotovs into packs; never an RPG or M32:
// friendly fire) and a Marksman (the Barrett, specials and bosses first); the rest are
// Riflemen. The New Game screen can pick them (roles: one per bot, 'auto' for the default).
//  - shopping: each role buys its own loadout in the breaks (best gun it can afford, a stand-in
//    until then), keeps its kit stocked, and restocks mid-wave before it runs dry (ammo, the
//    Medic's medkits: the shop sells those mid-wave at its markup)
//  - "Hold here" (zorders.js): an arc around the spot you called it from, facing the lanes the
//    horde comes in by (paths from the director's fronts to you, snapped to nav nodes): the
//    Gunner on the busiest lane, the Riflemen spread over the others, the Marksman a step behind
//    the line, the Medic in the middle; the Demo plants its claymores out along the lanes
//  - "Follow me" / "Regroup" / sticking with you: a loose ring of slots round you (your line of
//    fire kept clear, snapped to nav), not a blob on your heels; Regroup runs back to you first
//  - "Focus target" (radio Z -> 7, middle mouse or I): every gun on what you aim at (diff.roles.focus s)
//  - a teammate pinned or on a tongue: the one holding him goes to the top of every bot's list
//    and bots that can't see it move up until they can
//  - the squad panel (right): each bot's role, HP and state (PINNED, DOWN 0:18, REVIVING, ...);
//    role glyphs over the bots; the Focus target and the Hold spot marked
//
// Contract (m3-contracts section 7):
//   p.role                      a bot's ROLES id (assigned by tick, kept for the run), else undefined
//   squad.assign(bot)           -> the role a new bot gets (the New Game pick, else ROLE_ORDER, then riflemen)
//   squad.shop(bot, economy)    zeconomy.shop asks first: true = the role did its own shopping
//   squad.targetWeight(bot, e, d)  x a bot's score for target e (bots.js scan; lower = sooner)
//   squad.focus(p, mates)       the radio's "Focus target" (zorders.js): marks what p aims at
//                               (focusTarget) on every bot in mates (b.focus = { target, until, by });
//                               -> the target or null
//   squad.holdFormation(p, bots, until)  "Hold here": a slot each (b.holdHere { pos, watch, until, anchor, lane })
//   squad.objective(bot, it)    Bot.objective (zombie survival): formation, rescue, role jobs; true = handled
//   squad.runTask(bot, it, fighting)  Bot.update: a role's job in hand (the Demo's claymores); true = handled
//   squad.healAt(bot) / healRange(bot) / reviveRange(bot, fighting)  Bot.considerHeal / considerRevive
//   squad.inFight(bot, it, e, d)  zorders.js zombieOrderInFight: the roles' moves in a fight (the Marksman's scope)
// Events: 'role' { player, role }, 'order' { player (who gave it), order: 'follow' | 'cover' |
// 'hold' | 'fallback' | 'focus', target (focus), bots (how many took it) } (runstats.js).
// Difficulty: g.zombies.diff.roles { focus (s), medicHeal, holdArc, medicRange, restock } (zdiff.js).
// Console: zm_squad (roles and states), zm_role <bot> <role>, zm_focus (the Focus order; bound to Mouse 3 and I).
// Gate every change to zombie mode only (bots.js is shared with classic CS).
import { TEAM_CT } from './player.js';
import { angleVectors } from '../engine/coords.js';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import * as WS from './weaponsys.js';
import * as ATT from './attachments.js';
import { grenadeThrow } from './combatrules.js';
import { FOCUS } from './zorders.js';
import { fontString } from '../ui/hud/font.js';

/**
 * Roles: label, short (the panel), guns (primary preference, best first: the economy's default
 * tiers when null), interim (what it carries until it can afford one of those, best first),
 * extras (equipment it keeps stocked: an id per item), atts (attachments it fits when there's
 * money to spare), rgb (its colour: glyph, panel), text (the setup screen's line).
 */
export const ROLES = {
  rifleman: { label: 'Rifleman', short: 'RIF', guns: null, interim: null, extras: [], atts: null, rgb: [228, 218, 196], text: 'Whatever rifle the money buys. Holds the line.' },
  gunner: { label: 'Gunner', short: 'GUN', guns: ['minigun', 'm249'], interim: ['ak47', 'galil', 'ump45', 'mp5'], extras: [], atts: ['extmag', 'laser', 'foregrip'], rgb: [255, 152, 56], text: 'Saves up for the M249, then the minigun. Takes the busiest lane.' },
  medic: { label: 'Medic', short: 'MED', guns: ['p90', 'ump45', 'mp5'], interim: null, extras: ['medkit', 'medkit'], atts: ['reddot', 'extmag'], rgb: [96, 232, 118], text: 'Revives first, patches you up sooner and from farther away.' },
  demo: { label: 'Demo', short: 'DEM', guns: ['aa12', 'xm1014', 'm3'], interim: null, extras: ['molotov', 'claymore', 'pipebomb', 'molotov', 'claymore'], atts: ['extmag', 'laser'], rgb: [255, 86, 64], text: 'Shotguns, claymores where you hold, molotovs into packs, a pipe bomb to pull the horde off a downed teammate.' },
  marksman: { label: 'Marksman', short: 'MRK', guns: ['barrett', 'g3sg1', 'sg550'], interim: ['famas', 'galil', 'mp5'], extras: [], atts: ['laser', 'compensator'], rgb: [112, 192, 255], text: 'Works up to the Barrett. Specials and bosses first.' },
};
/** The order roles are handed out in (the first bots get these, the rest are riflemen). */
export const ROLE_ORDER = ['gunner', 'medic', 'demo', 'marksman'];
/** Every role id, in the order the setup screen cycles them. */
export const ROLE_IDS = ['gunner', 'medic', 'demo', 'marksman', 'rifleman'];

const FOCUS_K = 0.25; // a focused bot's score for its focus target (bots.js scan: lower is sooner)
const HOLDER_K = 0.3; // ... for a special holding a teammate down (shoot him free)
const MARK_K = 0.35, MARK_FAR = 1.7; // the Marksman: specials / bosses, and commons past arm's length
const GUN_K = 0.85; // the Gunner: commons
const KEEP = 200; // $ kept back while shopping (as zeconomy.js)
const ATT_MAX = 2, ATT_SPARE = 3000; // attachments a role bot fits; money it keeps after one
const STARTERS = new Set(['usp', 'glock']);
const RESTOCK_EVERY = 1.5; // s between mid-wave restock checks (each bot)
const FOLLOW_R = { rifleman: 165, gunner: 150, medic: 115, demo: 150, marksman: 215 }; // follow ring radius by role
const COVER_R = 80;
const SLOT_EVERY = 0.6; // s between follow-slot updates
const SLOT_TRY = [0, 25, -25, 50, -50]; // deg either side of a follow slot's angle to try when it's in a wall
const SLOT_ROUND = [30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]; // ...then round him (his back to a wall)
const MEDIC_FIRST = 1.5; // s the others leave somebody who just went down to a free Medic nearby
const RESCUE_R = 1500; // a pinned teammate this close: go and get a line on what holds him
const MOLO = { every: 0.5, cd: 7, min: 320, max: 1100, pack: 170, packN: 3, clear: 260, self: 260, err: 110 };
const CLAY = { out: 90, safe: 300, time: 9 }; // a claymore this far out past the slot, no zombie this close, give up after
const LANE_LOOK = 420; // u past the slot a holder watches
const MAX_LANES = 4;
const LINES = {
  heal: ['Hold still, patching you up.', 'Medic here, stay with me.', "Let's get you fixed up."],
  claymore: ['Claymore down!', 'Mine set, watch the laser.', 'Claymore out, lane covered.'],
  molotov: ['Molotov out!', 'Fire in the hole!', 'Burn, you bastards!'],
  special: ['Special down.', 'Got the big one.', 'Target down.'],
  belt: ['Reloading the belt, cover me!', 'Changing belts!'],
  rescue: ["Hang on, I've got you!", 'Get off him!', "I'm coming, hold on!"],
  restock: ['Restocking.', 'Grabbing more ammo.'],
  hold: ['In position.', 'Holding this lane.', 'Set.'],
};
const STATE = {
  dead: ['OUT', [140, 140, 140]], down: ['DOWN', [255, 60, 40]], pinned: ['PINNED', [255, 70, 200]], reviving: ['REVIVING', [96, 232, 118]],
  healing: ['HEALING', [96, 232, 118]], molotov: ['MOLOTOV', [255, 140, 60]], claymore: ['CLAYMORE', [255, 140, 60]], fallback: ['FALL BACK', [255, 200, 90]],
  rescue: ['RESCUE', [255, 120, 210]], focus: ['FOCUS', [255, 80, 60]], holding: ['HOLDING', [255, 196, 60]], moving: ['MOVING UP', [255, 196, 60]],
  loot: ['LOOTING', [255, 214, 90]], follow: ['FOLLOW', [190, 210, 255]], cover: ['COVERING', [190, 210, 255]], reload: ['RELOAD', [200, 200, 200]], fight: ['ENGAGED', [255, 225, 180]], idle: ['WITH YOU', [170, 170, 160]],
};

const DEG = Math.PI / 180;
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // (the Focus marker's brackets)
const _f = [0, 0, 0], _e = [0, 0, 0], _a = [0, 0, 0], _scr = [0, 0, 0], _c = [0, 0, 0];
const _tr = new TraceResult();
const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const inSquad = (p) => p.team === TEAM_CT && !p.isZombie;
/** A New Game `roles` option normalised: an array of role ids / 'auto' (a list or "gunner,auto,medic"), or null. */
export function normRoles(r) {
  const l = Array.isArray(r) ? r : typeof r === 'string' && r ? r.split(',') : null;
  if (!l) return null;
  const out = l.slice(0, 10).map((x) => (ROLES[String(x).trim()] ? String(x).trim() : 'auto'));
  return out.some((x) => x !== 'auto') ? out : null;
}

export class ZSquad {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.assignAt = 0;
    this.picks = null; // the New Game's role picks (configure)
    this.restockAt = 0; this.moloAt = 0;
    this.downAt = -99; // the last time somebody in the squad went down
    this.hold = null; // the last "Hold here": { anchor, until, lanes }
    this.mark = null; // the local player's Focus target: { target, until }
    this.fonts = { px: 0, small: '', tiny: '' };
    this.hs = { rows: [], n: 0, order: '', orderRgb: STATE.idle[1] }; // HUD state (reused)
    for (let i = 0; i < 12; i++) this.hs.rows.push({ name: '', role: 'rifleman', hp: 0, down: false, state: '', rgb: STATE.idle[1], blink: false, secs: -1, str: '' });
    game.hud?.addLayer?.((hud, s) => this.draw(hud, s), 2);
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('kill', (e) => this.onKill(e));
    ev.on('wave', (e) => { if (e.phase === 'start') this.restore(); });
    ev.on('down', () => { this.downAt = this.game.time; });
  }

  /** Remember b's orders (a new wave's Bot.roundStart clears them: restore puts them back). */
  keep(b) {
    const K = b.zmKeep || (b.zmKeep = { follow: null, holdHere: null, fallback: null });
    K.follow = b.follow; K.holdHere = b.holdHere; K.fallback = b.fallback;
  }

  /** A wave starts (after Bot.roundStart): the orders still running carry on. */
  restore() {
    const t = this.game.time;
    for (const b of this.game.bots?.bots || []) {
      const K = b.zmKeep;
      if (!K || !inSquad(b.p)) continue;
      if (!b.follow && K.follow && t < K.follow.until) b.follow = K.follow;
      if (!b.holdHere && K.holdHere && t < K.holdHere.until) b.holdHere = K.holdHere;
      if (!b.fallback && K.fallback && t < K.fallback.until) b.fallback = K.fallback;
    }
  }

  /** Orders that take the squad off a Hold (zorders.js): the Hold spot's marker goes. */
  released() { this.hold = null; }

  /** The New Game options (ZombieMode.configure): the setup screen's role picks. */
  configure(opts = {}) { this.picks = normRoles(opts.roles); }

  /** A new run: roles are handed out afresh. */
  reset() {
    for (const p of this.game.players) {
      p.role = undefined;
      const b = p.bot;
      if (b) { b.focus = null; b.zmTask = null; b.zmSlot = null; b.zmSaid = null; b.zmKeep = null; }
    }
    this.assignAt = 0; this.restockAt = 0; this.moloAt = 0; this.downAt = -99; this.hold = null; this.mark = null; // (game time starts over with a new game)
  }

  // ---------------------------------------------------------------- roles
  /** The squad's bots, in the order they joined. */
  bots() { return this.game.players.filter((q) => q.isBot && inSquad(q)); }

  /** The role a bot joining the squad gets: its New Game pick, else the next of ROLE_ORDER nobody has, else Rifleman. */
  assign(bot) {
    const p = bot.p || bot, list = this.bots(), k = list.indexOf(p), P = this.picks;
    if (P && k >= 0 && P[k] && P[k] !== 'auto') return P[k];
    const taken = new Set();
    list.forEach((q, i) => { if (q !== p) { if (q.role) taken.add(q.role); else if (P && P[i] && P[i] !== 'auto') taken.add(P[i]); } });
    for (const r of ROLE_ORDER) if (!taken.has(r)) return r;
    return 'rifleman';
  }

  /** p's role (handed out now if it has none yet: a bot can go shopping before the first tick). */
  roleOf(p) {
    if (!p.role && p.isBot && inSquad(p)) { p.role = this.assign(p.bot) || 'rifleman'; this.Z.events.mode('role', { player: p, role: p.role }); }
    return p.role || 'rifleman';
  }

  // ---------------------------------------------------------------- shopping
  /** zeconomy.shop: the role's loadout (true), or the economy's default trip for a Rifleman (false). */
  shop(bot, E) {
    const p = bot.p, R = ROLES[this.roleOf(p)];
    if (!R || !R.guns) return false;
    const g = this.game, b = (id) => g.rounds.buy(p, id), cost = (id) => E.cost(p, id) ?? Infinity;
    const ammo = (id) => (WS.WEAPON_DEFS[id]?.ammoBuy?.cost ?? 0) * E.scale(p, 'primammo'); // (a pack for it)
    const sandbox = !!this.Z.diff.sandbox;
    // 1. the role's gun: the best it can afford (with a pack of ammo) that beats what it has;
    // until then an interim gun if it has no primary at all (it saves for the real thing)
    const cur = p.weapons[1], have = cur ? R.guns.indexOf(cur.id) : -1;
    let want = null;
    for (let i = 0; i < (have < 0 ? R.guns.length : have) && !want; i++) {
      const id = R.guns[i];
      if (p.money >= cost(id) + KEEP + ammo(id)) want = id;
    }
    if (!want && !cur && R.interim) for (const id of R.interim) if (p.money >= cost(id) + KEEP) { want = id; break; }
    if (!want && !cur) {
      const pistol = p.weapons[2]; // (nothing yet: a pistol worth having, as the economy would)
      if ((!pistol || STARTERS.has(pistol.id)) && p.money >= cost('deagle') + KEEP) b('deagle');
    }
    if (want) b(want); // (what it had goes on the floor: game.giveWeapon)
    // 2. ammo, armour, the role's kit, more ammo
    if (p.weapons[1]) for (let i = 0; i < 2; i++) if (!b('primammo')) break;
    if (!p.helmet && p.money >= cost('vesthelm') + KEEP) b('vesthelm');
    else if (p.armor < 50 && p.money >= cost('vest') + KEEP) b('vest');
    this.stockExtras(p, R, cost, b, sandbox ? 0 : KEEP);
    if (p.weapons[1]) for (let i = 0; i < 3; i++) if (!b('primammo')) break;
    for (let i = 0; i < 2; i++) if (!b('secammo')) break;
    // 3. money to spare: the role's attachments on its gun
    const gun = p.weapons[1];
    if (gun && R.atts && p.money >= ATT_SPARE + 300) {
      if (p.active !== gun) g.selectWeapon(p, gun, true); // (upgrades go on the gun in hand)
      let n = 0;
      for (const k in gun.att || {}) if (gun.att[k]) n++;
      for (const a of R.atts) {
        if (n >= (sandbox ? 4 : ATT_MAX) || p.money < ATT.ATTACHMENTS[a].price + ATT_SPARE) break;
        if (!ATT.whyNot(gun, a) && !gun.att?.[ATT.ATTACHMENTS[a].slot] && b('att_' + a)) n++;
      }
    }
    const best = p.weapons[1] || p.weapons[2];
    if (best && p.active !== best) g.selectWeapon(p, best);
    return true;
  }

  /** The role's equipment up to its count (keeping keep $ back). */
  stockExtras(p, R, cost, b, keep) {
    for (const id of R.extras) {
      const want = R.extras.filter((x) => x === id).length;
      const have = p.weapons[4].find((x) => x.id === id)?.count ?? 0;
      if (have < want && p.money >= cost(id) + keep) b(id);
    }
  }

  /**
   * Mid-wave (every RESTOCK_EVERY s): a bot tops up before it runs dry, not after - a pack
   * when its reserve is under a magazine; the Medic a medkit when it's out. At the shop's
   * mid-wave price, never below diff.roles.restock $ (the economy's topUp still covers a bot
   * that has run dry).
   */
  restock() {
    const g = this.game, E = this.Z.economy, keep = this.Z.diff.roles.restock;
    for (const p of g.players) {
      if (!p.isBot || !inSquad(p) || !p.alive || p.downed) continue;
      const w = p.weapons[1], cost = (id) => E.cost(p, id) ?? Infinity;
      let did = false;
      if (w && w.def.ammoBuy && w.ammo < WS.clipSize(w) && w.ammo < w.def.maxAmmo && p.money >= cost('primammo') + keep) did = g.rounds.buy(p, 'primammo');
      if (!w && p.weapons[2] && p.weapons[2].ammo < WS.clipSize(p.weapons[2]) && p.money >= cost('secammo') + keep) did = g.rounds.buy(p, 'secammo') || did;
      if (p.role === 'medic' && !p.weapons[4].some((x) => x.id === 'medkit') && p.money >= cost('medkit') + keep) did = g.rounds.buy(p, 'medkit') || did;
      if (did && Math.random() < 0.2) this.say(p.bot, 'restock');
    }
  }

  // ---------------------------------------------------------------- targets
  /** bots.js scan: x the bot's score for zombie e at d units (lower is picked sooner). Hot path. */
  targetWeight(bot, e, d) {
    let k = 1;
    const F = bot.focus;
    if (F && F.target === e && bot.time < F.until) k = FOCUS_K;
    const S = e.sp;
    if (S && S.victim && (S.state === 'pin' || S.state === 'pull')) k *= HOLDER_K; // (a teammate in its grip: shoot him free)
    const r = bot.p.role;
    if (r === 'marksman') k *= e.special || e.isBoss || e.elite ? MARK_K : d > 260 ? MARK_FAR : 1;
    else if (r === 'gunner' && !e.special && !e.isBoss) k *= GUN_K;
    return k;
  }

  /** The zombie (or boss) p aims at: the closest to the crosshair within ~8 degrees, in sight; or null. */
  focusTarget(p) {
    const g = this.game, Z = this.Z;
    const eye = p.eyePos(_e);
    angleVectors(p.pm.angles[0], p.pm.angles[1], _f, null, null);
    let best = null, bc = 0.99;
    const look = (z) => {
      if (!z || !z.alive) return;
      const c = z.eyePos();
      const dx = c[0] - eye[0], dy = c[1] - eye[1], dz = c[2] - 10 - eye[2], d = Math.hypot(dx, dy, dz) || 1;
      const cos = (dx * _f[0] + dy * _f[1] + dz * _f[2]) / d;
      if (cos > bc && d < 4000 && g.visible(eye, c)) { bc = cos; best = z; }
    };
    for (const z of Z.pool) look(z);
    look(g.bosses?.boss);
    return best;
  }

  /** "Focus target" from p to the bots in mates: every one of them on it. Returns the target, or null (nothing aimed at). */
  focus(p, mates) {
    const z = this.focusTarget(p);
    const until = this.game.time + this.Z.diff.roles.focus;
    for (const b of mates) b.focus = z ? { target: z, until, by: p } : null;
    if (p === this.game.local) this.mark = z ? { target: z, until } : null;
    this.game.sound?.play(z ? 'squad_focus' : 'squad_order', { volume: 0.7, attenuation: 'none' });
    return z;
  }

  /** A kill: the Focus target is down (a confirm tone), a Marksman's special (a callout now and then). */
  onKill(e) {
    const v = e.victim, M = this.mark;
    if (M && M.target === v) { this.mark = null; if (this.game.time < M.until) this.game.sound?.play('squad_mark', { volume: 0.6, attenuation: 'none' }); }
    const a = e.attacker;
    if (a?.bot && a.role === 'marksman' && (v?.special || v?.isBoss) && Math.random() < 0.4) this.say(a.bot, 'special');
  }

  // ---------------------------------------------------------------- formations
  /**
   * The lanes into a spot: for every front of the map (director.js), the walk from it to
   * the spot; where that walk crosses the arc (holdArc from the spot) is the lane's slot,
   * LANE_LOOK past it what the holder watches. Lanes into the same opening merge; the
   * fronts open this wave count double. Without fronts: the arc's open directions. Sorted
   * busiest first: [{ slot: [x,y,z], look: [x,y,z], dir: [x,y], w, path }].
   */
  lanes(anchor) {
    const g = this.game, nav = g.nav, R = this.Z.diff.roles.holdArc;
    const start = nav?.nearest(anchor, 200) || nav?.nearestXY(anchor, 260, 120);
    if (!start) return [];
    const D = this.Z.director, open = D?.open || [];
    let fronts = [];
    try { fronts = D?.fronts?.() || []; } catch { fronts = []; }
    const out = [];
    const add = (path, w) => {
      // walk back from the spot along the path
      let acc = 0, slot = null, look = null;
      for (let i = path.length - 1; i > 0; i--) {
        const a = path[i], b = path[i - 1];
        acc += Math.hypot(a.x - b.x, a.y - b.y);
        if (!slot && acc >= R) slot = b;
        if (acc >= R + LANE_LOOK) { look = b; break; }
      }
      if (!slot) return;
      look = look || path[0];
      const dx = slot.x - anchor[0], dy = slot.y - anchor[1], l = Math.hypot(dx, dy) || 1;
      for (const L of out) if (Math.hypot(L.slot[0] - slot.x, L.slot[1] - slot.y) < 150) { L.w += w; return; }
      out.push({ slot: [slot.x, slot.y, slot.z], look: [look.x, look.y, look.z + 50], dir: [dx / l, dy / l], w, path });
    };
    for (const f of fronts) {
      let src = null, bd = Infinity;
      for (const n of f.nodes || []) { const d = Math.hypot(n.x - f.pos[0], n.y - f.pos[1]); if (d < bd) { bd = d; src = n; } }
      if (!src) continue;
      const path = nav.findPath(src, start);
      if (path && path.length > 1) add(path, open.includes(f) ? 2 : 1);
    }
    if (!out.length) {
      // no fronts: the arc's open directions (12 sectors, the nodes about R out by path)
      const best = new Array(12).fill(null);
      for (const { node, dist } of nav.around(start, R + LANE_LOOK, 2500)) {
        if (dist < R) continue;
        const s = ((Math.round(Math.atan2(node.y - anchor[1], node.x - anchor[0]) / (Math.PI / 6)) % 12) + 12) % 12;
        if (!best[s] || dist > best[s].dist) best[s] = { node, dist };
      }
      for (const b of best) {
        if (!b) continue;
        const path = nav.findPath(b.node, start);
        if (path && path.length > 1) add(path, 1);
      }
    }
    out.sort((a, b) => b.w - a.w);
    return out.slice(0, MAX_LANES);
  }

  /** A standable spot near pt, about level with it (no crate tops), that can be walked to from `from` in a line (snapped to a nav node), or null. */
  snap(pt, from, r = 56) {
    const nav = this.game.nav;
    const n = nav.nearestXY(pt, r, 40);
    if (!n) return null;
    _a[0] = n.x; _a[1] = n.y; _a[2] = n.z;
    if (from && !nav.canWalk(from, _a)) return null;
    return [n.x, n.y, n.z];
  }

  /**
   * "Hold here" from p for `bots` until `until`: an arc round where p stands, facing the
   * lanes. Returns the formation ({ anchor, until, lanes }) and gives each bot holdHere.
   */
  holdFormation(p, bots, until) {
    const anchor = p.feet(), R = this.Z.diff.roles.holdArc;
    const lanes = this.lanes(anchor);
    const F = { anchor, until, lanes, by: p };
    this.hold = F;
    // the line first (gunner, riflemen, demo), then the Marksman behind it, the Medic in the middle
    const rank = { gunner: 0, rifleman: 1, demo: 2, marksman: 3, medic: 4 };
    const list = bots.slice().sort((a, b) => (rank[a.p.role] ?? 1) - (rank[b.p.role] ?? 1));
    const L = lanes.length, used = lanes.map(() => 0);
    let k = 0;
    for (const b of list) {
      const role = b.p.role;
      let pos = null, watch = null, lane = -1;
      if (!L || (role === 'medic' && list.length > 1)) {
        // the middle (a couple of steps back from the busiest lane, clear of you)
        const d = L ? lanes[0].dir : [0, 0];
        pos = this.snap([anchor[0] - d[0] * 90, anchor[1] - d[1] * 90, anchor[2]], anchor, 64) || this.snap([anchor[0] - d[0] * 50, anchor[1] - d[1] * 50, anchor[2]], anchor, 64) || anchor.slice();
        watch = L ? lanes[0].look : null;
      } else {
        lane = role === 'marksman' || role === 'gunner' ? 0 : k++ % L;
        const ln = lanes[lane], dx = ln.dir[0], dy = ln.dir[1];
        if (role === 'marksman') {
          // beside you, off the lane's path (nobody walks through him), looking down it
          for (const sd of [80, -80, 50, -50]) if (!pos) pos = this.snap([anchor[0] - dy * sd - dx * 20, anchor[1] + dx * sd - dy * 20, anchor[2]], anchor, 40);
        } else {
          const n = used[lane]++;
          // a second / third on the same lane: either side of the first; no room there (a
          // corridor), the arc a little in from it, turned off the lane (not in its path)
          const side = n ? (n % 2 ? 1 : -1) * 60 * Math.ceil(n / 2) : 0;
          pos = this.snap([ln.slot[0] - dy * side, ln.slot[1] + dx * side, ln.slot[2]], ln.slot, 48);
          for (let tries = 0; tries < 4 && !pos; tries++) {
            const a = (tries % 2 ? -1 : 1) * (0.6 + 0.3 * (tries >> 1)), c = Math.cos(a), sn = Math.sin(a);
            pos = this.snap([anchor[0] + (dx * c - dy * sn) * R * 0.6, anchor[1] + (dx * sn + dy * c) * R * 0.6, anchor[2]], anchor, 48);
          }
        }
        pos = pos || ln.slot.slice();
        watch = ln.look;
      }
      b.follow = null; b.fallback = null;
      b.holdHere = { pos, until, watch: watch ? [watch] : [], anchor, lane, n: 'here' };
      b.zmSlot = null;
      // the Demo: claymores out along the lanes on the way
      if (role === 'demo' && L) this.planClaymores(b, F);
    }
    this.game.sound?.play('squad_hold', { volume: 0.6, attenuation: 'none' });
    return F;
  }

  /** The Demo's claymores for a hold: one at the mouth of each of the two busiest lanes (as many as it carries). */
  planClaymores(bot, F) {
    const p = bot.p, have = p.weapons[4].find((x) => x.id === 'claymore')?.count ?? 0;
    if (!have) return;
    const R = this.Z.diff.roles.holdArc, spots = [];
    for (let i = 0; i < F.lanes.length && spots.length < have && spots.length < 2; i++) {
      const ln = F.lanes[i];
      // along the lane's path, CLAY.out past the slot
      let acc = 0, at = null;
      for (let j = ln.path.length - 1; j > 0; j--) {
        const a = ln.path[j], b = ln.path[j - 1];
        acc += Math.hypot(a.x - b.x, a.y - b.y);
        if (acc >= R + CLAY.out) { at = b; break; }
      }
      at = at || ln.path[0];
      spots.push({ pos: [at.x, at.y, at.z], look: ln.look });
    }
    if (spots.length) bot.zmTask = { kind: 'claymore', spots, i: 0, phase: 'walk', t: this.game.time, until: this.game.time + CLAY.time * spots.length };
  }

  /**
   * Bot.objective (zombie survival), after a fall-back: a pinned teammate to get a line on,
   * the held slot (watching its lane), or a follow slot round the human. True when handled.
   */
  objective(bot, it) {
    const g = this.game, p = bot.p, t = bot.time;
    if (p.downed) return false;
    this.unscope(bot, it);
    // a teammate pinned / on a tongue nearby: get to where the thing holding him can be shot
    const q = this.pinnedMate(p);
    if (q) {
      it.move = q.feet(); it.tol = 64; it.walk = false;
      it.look = q.pinnedBy?.eyePos?.() || q.tonguedBy?.eyePos?.() || q.eyePos();
      if (bot.zmSaid !== q) { bot.zmSaid = q; this.say(bot, 'rescue'); }
      bot.zmState = 'rescue';
      return true;
    }
    if (this.patient(bot, it, true)) { bot.zmState = 'idle'; return true; }
    const H = bot.holdHere;
    if (H && t < H.until && H.anchor) {
      bot.hold(it, H);
      bot.zmState = bot.inPosition ? 'holding' : 'moving';
      if (bot.inPosition && !H.said) { H.said = true; if (Math.random() < 0.35) this.say(bot, 'hold'); }
      return true;
    }
    // loot close by when it's safe (pickups.js: it only says yes when it's closer to the bot than to you)
    if (g.zombies.pickups.botLoot(bot, it)) { bot.watchDanger(it); bot.zmState = 'loot'; return true; }
    // follow: an order, or (orders run out) sticking with the human
    const L = bot.follow && t < bot.follow.until && bot.follow.p?.alive ? bot.follow : null;
    const lead = L ? L.p : g.local?.alive && inSquad(g.local) && g.local !== p ? g.local : null;
    if (!lead) return false;
    const slot = this.followSlot(bot, lead, !!L?.cover);
    const o = p.pm.origin;
    if (slot) {
      const d = flat(o, slot);
      if (d > 48 || Math.abs(o[2] - 36 - slot[2]) > 60) { it.move = slot; it.tol = 24; it.walk = d < 140; }
      else it.stop = true;
    } else if (flat(o, lead.pm.origin) > 180) it.move = lead.feet();
    if (!it.move) {
      // in the slot: watch outward from him
      const lo = lead.pm.origin, dx = o[0] - lo[0], dy = o[1] - lo[1], l = Math.hypot(dx, dy) || 1;
      const yaw = lead.pm.angles[1] * DEG;
      const fx = l > 40 ? dx / l : Math.cos(yaw), fy = l > 40 ? dy / l : Math.sin(yaw);
      const look = bot.zmLook || (bot.zmLook = [0, 0, 0]);
      look[0] = o[0] + fx * 500 + Math.cos(yaw) * 250; look[1] = o[1] + fy * 500 + Math.sin(yaw) * 250; look[2] = o[2] + 10;
      it.look = look;
    } else bot.watchDanger(it);
    bot.zmState = L ? (L.cover ? 'cover' : 'follow') : 'idle';
    return true;
  }

  /**
   * A medic (bot) on its way over to patch bot up: hold still for it (in a fight too, still
   * shooting; facing it when there's nothing to shoot). True when it holds still.
   */
  patient(bot, it, face = false) {
    const p = bot.p;
    for (const m of this.game.bots?.bots || []) {
      const h = m.heal;
      if (!h || m === bot || h.target !== p || !m.p.alive || flat(m.p.pm.origin, p.pm.origin) > 260) continue;
      it.stop = true; it.move = null; it.strafe = 0;
      if (face) it.look = m.p.eyePos(_e);
      return true;
    }
    return false;
  }

  /** A squadmate within RESCUE_R that a hunter or smoker holds, that p can't shoot from here (shove.js takes the close ones). */
  pinnedMate(p) {
    const o = p.pm.origin;
    let best = null, bd = RESCUE_R;
    for (const q of this.game.players) {
      if (q === p || !q.alive || !inSquad(q) || !(q.pinnedBy || q.tonguedBy)) continue;
      const d = flat(q.pm.origin, o);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  /**
   * The follow slot of `bot` round `lead`: a ring round him with his line of fire kept clear
   * (the Gunner and the Riflemen on his flanks, the Medic behind him, the Marksman farther
   * out), snapped to nav and walkable from him in a line; cached for SLOT_EVERY s while he
   * stays put. Null: just come close.
   */
  followSlot(bot, lead, cover) {
    const t = bot.time, S = bot.zmSlot || (bot.zmSlot = { pos: null, at: -1, x: 0, y: 0, yaw: 0, lead: null });
    const lo = lead.pm.origin, yaw = lead.pm.angles[1];
    if (S.lead === lead && t < S.at && Math.hypot(lo[0] - S.x, lo[1] - S.y) < 64 && Math.abs(((yaw - S.yaw) % 360 + 540) % 360 - 180) < 50) return S.pos;
    S.lead = lead; S.at = t + SLOT_EVERY; S.x = lo[0]; S.y = lo[1]; S.yaw = yaw;
    const n = Math.max(1, bot.zmN || 1), i = Math.min(n - 1, bot.zmIdx || 0);
    const a0 = cover ? 150 : 40 + 280 * (i + 0.5) / n; // (from his right flank round the back to his left)
    const R = cover ? COVER_R : FOLLOW_R[bot.p.role] || FOLLOW_R.rifleman;
    const from = lead.feet(_c), fx = Math.cos(yaw * DEG), fy = Math.sin(yaw * DEG);
    S.pos = null;
    // the slot's own angle first, then either side of it, then closer in (a corridor squeezes
    // the ring); his back to a wall: anywhere round him but straight in front (his line of fire)
    for (let pass = 0; pass < 2; pass++) {
      const front = pass ? 0.85 : 0.77, tries = pass ? SLOT_ROUND : SLOT_TRY; // (cos of the clear cone in front of him)
      for (const k of pass ? [1, 0.6] : [1, 0.7, 0.45]) {
        for (const da of tries) {
          const ang = (yaw + a0 + da) * DEG;
          const q = this.snap([from[0] + Math.cos(ang) * R * k, from[1] + Math.sin(ang) * R * k, from[2]], from, 48);
          if (!q) continue;
          const dx = q[0] - from[0], dy = q[1] - from[1], l = Math.hypot(dx, dy);
          if (l < 40 || (dx * fx + dy * fy) / l > front || this.slotTaken(bot, q)) continue; // (not in front of him, on top of him, or of another)
          S.pos = q;
          return q;
        }
      }
    }
    return null;
  }

  /** Another bot's follow slot within 40 u of q? */
  slotTaken(bot, q) {
    for (const b of this.game.bots?.bots || []) if (b !== bot && b.zmSlot?.pos && b.zmSlot.lead && flat(b.zmSlot.pos, q) < 40) return true;
    return false;
  }

  /** The Marksman's Barrett: scoped only while it fights at range (zoomed back out after). */
  unscope(bot, it) {
    const p = bot.p, w = p.active;
    if (p.fov >= 90 || !w || w.id !== 'barrett' || w.inReload || bot.time < (bot.zmZoomT || 0) || w.nextSecondary > bot.time) return;
    it.attack2 = true;
    bot.zmZoomT = bot.time + 0.35;
  }

  /**
   * zorders.js zombieOrderInFight (a fight with zombie e at d): the Marksman goes for the head
   * (the weak point) past arm's length, and with the Barrett scopes in at range and holds
   * still to shoot.
   */
  inFight(bot, it, e, d) {
    const p = bot.p, w = p.active;
    if (p.role !== 'marksman') return;
    if (d > 300 && bot.targetVisible && bot.visHead) bot.aimHead = true; // (Bot.combat aims from the next tick)
    if (!w || w.id !== 'barrett') return;
    if (d > 520 && !it.move && bot.targetVisible) it.stop = true;
    if (w.inReload || bot.time < (bot.zmZoomT || 0) || w.nextSecondary > bot.time) return;
    const zoomed = p.fov < 90;
    // in at range (the first zoom level), out up close or from the second level
    if ((!zoomed && d > 650) || (zoomed && (d < 380 || p.fov < 20))) { it.attack2 = true; bot.zmZoomT = bot.time + (zoomed ? 0.35 : 0.6); }
  }

  // ---------------------------------------------------------------- medics
  /** Bot.considerHeal: a teammate under this much health gets patched up (the Medic sooner: diff.roles.medicHeal). */
  healAt(bot) { return bot.p.role === 'medic' ? this.Z.diff.roles.medicHeal : 55; }
  /** ... from this far off (the Medic walks over from farther). */
  healRange(bot) { return bot.p.role === 'medic' ? this.Z.diff.roles.medicRange : 450; }
  /**
   * Bot.considerRevive: how far a bot goes for somebody down. The Medic goes first and
   * farther: for MEDIC_FIRST s after somebody goes down, with a Medic up and free close by,
   * the others leave it to him (he claims the downed one: zdowned.js reviveTarget skips a
   * claimed one); after that anyone close goes.
   */
  reviveRange(bot, fighting) {
    const base = fighting ? 900 : 1800, p = bot.p;
    if (p.role === 'medic') return base * 1.5;
    if (this.game.time - this.downAt < MEDIC_FIRST) {
      for (const q of this.game.players) {
        if (q.role !== 'medic' || q === p || !q.alive || q.downed || q.reviving || !inSquad(q) || q.bot?.revive) continue;
        if (flat(q.pm.origin, p.pm.origin) < 1500) return 0;
      }
    }
    return base;
  }

  // ---------------------------------------------------------------- the Demo
  /** Bot.update: a role's job in hand (the Demo's claymores). True while it's at it. */
  runTask(bot, it, fighting) {
    const T = bot.zmTask, p = bot.p, g = this.game, t = bot.time;
    if (!T || T.kind !== 'claymore') { bot.zmTask = null; return false; }
    const kit = p.weapons[4].find((x) => x.id === 'claymore' && (x.count ?? 1) > 0);
    const done = () => {
      bot.zmTask = null;
      const best = bot.bestGun();
      if (best && p.active !== best && !(p.active?.placeEnd)) g.selectWeapon(p, best);
      return false;
    };
    if (p.downed || t > T.until || (!kit && T.phase !== 'place') || T.i >= T.spots.length) return done();
    const S = T.spots[T.i];
    // zombies on top of us: guns first (the job waits for a quiet moment)
    if (T.phase !== 'place' && fighting && bot.zombieNear(CLAY.safe, 400)) { if (p.active === kit) done(); return false; }
    bot.mode = 'claymore';
    if (T.phase === 'walk') {
      const d = flat(p.pm.origin, S.pos);
      if (d > 30) { it.move = S.pos; it.tol = 16; it.walk = false; bot.watchDanger(it); return true; }
      T.phase = 'aim';
    }
    it.stop = true;
    // face down the lane (the mine goes down in front, facing the way we look)
    const look = S.look, e = p.eyePos(_e);
    it.lookAngles = it.lookAngles || [0, 0];
    it.lookAngles[0] = 20; it.lookAngles[1] = Math.atan2(look[1] - e[1], look[0] - e[0]) / DEG;
    if (T.phase === 'aim') {
      if (!kit) return done();
      if (p.active !== kit) { g.selectWeapon(p, kit); return true; }
      const err = Math.abs(((it.lookAngles[1] - p.pm.angles[1]) % 360 + 540) % 360 - 180);
      if (err < 6 && kit.nextPrimary <= t && kit.nextAttack <= t) { it.attack = true; T.phase = 'place'; T.n0 = kit.count ?? 1; T.pt = t; }
      return true;
    }
    // placing: done once the mine is out (the stack went down) or the hand came back up
    if (!kit || (kit.count ?? 1) < T.n0 || (!kit.placeEnd && t - T.pt > 0.3)) {
      if (!kit || (kit.count ?? 1) < T.n0) this.say(bot, 'claymore');
      T.i++; T.phase = 'walk';
      if (T.i >= T.spots.length) return done();
    }
    return true;
  }

  /** A pack of commons worth a molotov from where the Demo stands (and its throw), or null. */
  packFor(bot) {
    const g = this.game, p = bot.p, o = p.pm.origin, Z = this.Z;
    let best = null, bn = MOLO.packN - 1;
    for (const z of Z.pool) {
      if (!z.alive || z.special) continue;
      const d = flat(z.pm.origin, o);
      if (d < MOLO.min || d > MOLO.max) continue;
      let n = 0;
      for (const y of Z.pool) if (y.alive && flat(y.pm.origin, z.pm.origin) < MOLO.pack) n++;
      if (n > bn) { bn = n; best = z; }
    }
    if (!best) return null;
    const c = best.pm.origin, at = [c[0], c[1], c[2] - 30];
    // never near one of us (the fire spreads)
    for (const q of g.players) if (q.alive && inSquad(q) && flat(q.pm.origin, at) < (q === p ? MOLO.self : MOLO.clear)) return null;
    const eye = p.eyePos(_e);
    if (!g.visible(eye, [c[0], c[1], c[2]])) return null;
    const sol = this.moloThrow(eye, at);
    return sol && sol.err < MOLO.err ? { at, sol } : null;
  }

  /**
   * Throw angles that land a molotov (a projectile at 0.5 gravity that breaks where it
   * comes down: projectiles.js) closest to target, by the real throw (grenadeThrow).
   */
  moloThrow(eye, target) {
    const g = this.game, yaw = Math.atan2(target[1] - eye[1], target[0] - eye[0]) / DEG;
    let best = null;
    const a = [0, yaw, 0], pos = [0, 0, 0], nx = [0, 0, 0];
    for (let pitch = -45; pitch <= 25; pitch += 2.5) {
      a[0] = pitch;
      const th = grenadeThrow(a, [0, 0, 0], eye, [0, 0, 0]);
      pos[0] = th.origin[0]; pos[1] = th.origin[1]; pos[2] = th.origin[2];
      const v = th.velocity;
      let hit = null;
      for (let i = 0; i < 150 && !hit; i++) {
        v[2] -= 400 * 0.02;
        nx[0] = pos[0] + v[0] * 0.02; nx[1] = pos[1] + v[1] * 0.02; nx[2] = pos[2] + v[2] * 0.02;
        g.collision.trace(pos, nx, [0, 0, 0], [0, 0, 0], MASK_SHOT, _tr);
        if (_tr.fraction < 1 || _tr.startsolid) hit = _tr.endpos.slice();
        else { pos[0] = nx[0]; pos[1] = nx[1]; pos[2] = nx[2]; }
      }
      if (!hit) continue;
      const err = Math.hypot(hit[0] - target[0], hit[1] - target[1], (hit[2] - target[2]) * 0.5);
      if (!best || err < best.err) best = { pitch, yaw, err, end: hit };
    }
    return best;
  }

  /** The Demo (every MOLO.every s): a molotov into a pack when nothing's in its face. */
  demo(bot) {
    const p = bot.p, t = bot.time;
    if (bot.nade || bot.heal || bot.revive || bot.zmTask || p.downed || p.reviving || t < (bot.moloAt || 0)) return;
    const w = p.weapons[4].find((x) => x.id === 'molotov' && (x.count ?? 1) > 0);
    if (!w || bot.zombieNear(250, 380)) return;
    bot.moloAt = t + 1.2;
    const P = this.packFor(bot);
    if (!P) return;
    bot.moloAt = t + MOLO.cd;
    bot.nade = { w, type: 'molotov', target: P.at, sol: P.sol, phase: 'select', t, after: null, fight: true };
    this.say(bot, 'molotov');
  }

  // ---------------------------------------------------------------- radio
  /** A role line on the radio (rate limited like any bot chatter). */
  say(bot, kind) {
    if (!bot?.mgr || !LINES[kind]) return;
    bot.mgr.radio(bot, pick(LINES[kind]), { gap: 1.5 });
  }

  // ---------------------------------------------------------------- scaffold hooks
  /** Every tick (ZombieMode.tick): roles for new bots, the follow order, mid-wave restocks, the Demo, callouts. */
  tick(t) {
    const Z = this.Z;
    if (!this.subscribed) this.subscribe();
    if (t >= this.assignAt) {
      this.assignAt = t + 0.5;
      for (const p of this.game.players) {
        if (!p.isBot || p.team !== TEAM_CT || p.isZombie || p.role) continue;
        p.role = this.assign(p.bot) || 'rifleman';
        Z.events.mode('role', { player: p, role: p.role });
      }
      this.order();
    }
    if (Z.state === 'wave' && t >= this.restockAt) { this.restockAt = t + RESTOCK_EVERY; this.restock(); }
    if (Z.state === 'wave' && t >= this.moloAt) {
      this.moloAt = t + MOLO.every;
      for (const b of this.game.bots?.bots || []) if (b.p.role === 'demo' && b.p.alive && inSquad(b.p)) this.demo(b);
    }
    if (this.mark && (t >= this.mark.until || !this.mark.target.alive)) this.mark = null;
    if (this.hold && t >= this.hold.until) this.hold = null;
  }

  /** Every 0.5 s: who follows whom in which slot (stable: by role, then join order), callouts, a mine left in hand. */
  order() {
    const list = (this.game.bots?.bots || []).filter((b) => b.p.alive && inSquad(b.p) && !b.p.downed);
    const rank = { gunner: 0, rifleman: 1, medic: 2, marksman: 3, demo: 4 }; // (the ring's order: the flanks first, the Medic behind)
    list.sort((a, b) => (rank[a.p.role] ?? 2) - (rank[b.p.role] ?? 2) || a.p.id - b.p.id);
    list.forEach((b, i) => { b.zmIdx = i; b.zmN = list.length; });
    for (const b of list) {
      const p = b.p, w = p.active;
      this.keep(b);
      // a claymore in hand with no job to finish: back to a gun
      if (w && w.def.kind === 'mine' && !b.zmTask && !w.placeEnd) { const best = b.bestGun(); if (best && best !== w) this.game.selectWeapon(p, best); }
      // the Medic going to patch somebody up
      if (p.role === 'medic' && b.heal && b.heal.target !== p && b.heal.said !== true) { b.heal.said = true; this.say(b, 'heal'); }
      // the Gunner changing belts
      if (p.role === 'gunner' && w && w.def.kind === 'mg' && w.inReload) { if (!b.zmBelt) { b.zmBelt = true; if (Math.random() < 0.5) this.say(b, 'belt'); } } else b.zmBelt = false;
    }
  }

  /** HUD state (buildHudState, every frame): the squad panel's rows (s.squad). */
  hud(s) {
    const g = this.game, H = this.hs, t = g.time, Z = this.Z;
    s.squad = null;
    if (!Z.enabled || (Z.state !== 'wave' && Z.state !== 'break')) return;
    let n = 0;
    for (const p of g.players) {
      if (!p.isBot || !inSquad(p) || n >= H.rows.length) continue;
      const r = H.rows[n++], b = p.bot;
      r.name = p.name; r.role = p.role || 'rifleman';
      const D = p.alive ? p.downed : null;
      r.down = !!D;
      r.hp = !p.alive ? 0 : D ? Math.max(0, p.health) / 100 : Math.max(0, Math.min(1, p.health / (p.maxHealth || 100)));
      let st = STATE.idle;
      if (!p.alive) st = STATE.dead;
      else if (D) st = STATE.down;
      else if (p.pinnedBy || p.tonguedBy) st = STATE.pinned;
      else if (p.reviving) st = STATE.reviving;
      else if (b?.revive && b.revive.target !== p) st = STATE.reviving;
      else if (b?.heal) st = STATE.healing;
      else if (b?.nade?.type === 'molotov') st = STATE.molotov;
      else if (b?.zmTask) st = STATE.claymore;
      else if (b?.fallback && t < b.fallback.until) st = STATE.fallback;
      else if (b?.zmState === 'rescue' && b.mode === 'task') st = STATE.rescue;
      else if (b?.zmState === 'loot' && b.mode === 'task') st = STATE.loot;
      else if (b?.focus && t < b.focus.until && b.focus.target?.alive && b.target === b.focus.target) st = STATE.focus;
      else if (b?.holdHere && t < b.holdHere.until) st = b.inPosition || b.mode !== 'task' ? STATE.holding : STATE.moving;
      else if (p.active?.inReload && p.active.def.clip > 0) st = STATE.reload;
      else if (b?.mode === 'combat') st = STATE.fight;
      else if (b?.follow && t < b.follow.until) st = b.follow.cover ? STATE.cover : STATE.follow;
      r.rgb = st[1];
      r.blink = st === STATE.down || st === STATE.pinned;
      if (st === STATE.down) {
        const left = Math.ceil(Z.downed.left(p));
        if (left !== r.secs) { r.secs = left; r.str = `DOWN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; }
        r.state = r.str;
        if (D.by) r.rgb = STATE.reviving[1];
      } else r.state = st[0];
    }
    H.n = n;
    // the order the squad is under (the header)
    const hold = this.hold && t < this.hold.until ? this.hold : null;
    if (this.mark) { H.order = 'FOCUS'; H.orderRgb = STATE.focus[1]; } else if (hold) { H.order = 'HOLD'; H.orderRgb = STATE.holding[1]; } else { H.order = ''; H.orderRgb = STATE.idle[1]; }
    H.left = this.mark ? this.mark.until - t : hold ? hold.until - t : 0;
    if (n) s.squad = H;
  }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  // ---------------------------------------------------------------- drawing
  font(hud) {
    const F = this.fonts;
    if (F.px !== hud.fontPx) { F.px = hud.fontPx; F.small = fontString(Math.max(9, Math.round(hud.fontPx * 0.85)), true); F.tiny = fontString(Math.max(8, Math.round(hud.fontPx * 0.72)), true); }
    return F;
  }

  /** A role's glyph centred on (x, y), r its half size: Gunner a belt of rounds, Medic a cross, Demo a mine with its fuse, Marksman a reticle, Rifleman a chevron. */
  glyph(T, role, x, y, r, alpha = 1) {
    const c = (ROLES[role] || ROLES.rifleman).rgb;
    T.globalAlpha = alpha;
    T.fillStyle = 'rgba(0,0,0,0.6)';
    T.beginPath(); T.arc(x, y, r * 1.25, 0, Math.PI * 2); T.fill();
    T.fillStyle = css(c); T.strokeStyle = css(c); T.lineWidth = Math.max(1, r * 0.28);
    T.beginPath();
    switch (role) {
      case 'gunner': {
        const w = r * 0.42;
        for (let i = -1; i <= 1; i++) { const cx = x + i * r * 0.62; T.rect(cx - w / 2, y - r * 0.35, w, r * 1.05); T.moveTo(cx - w / 2, y - r * 0.35); T.lineTo(cx, y - r * 0.85); T.lineTo(cx + w / 2, y - r * 0.35); }
        T.fill();
        break;
      }
      case 'medic': {
        const w = r * 0.5;
        T.rect(x - w / 2, y - r * 0.85, w, r * 1.7); T.rect(x - r * 0.85, y - w / 2, r * 1.7, w);
        T.fill();
        break;
      }
      case 'demo':
        T.arc(x - r * 0.12, y + r * 0.15, r * 0.6, 0, Math.PI * 2); T.fill();
        T.beginPath(); T.moveTo(x + r * 0.25, y - r * 0.3); T.quadraticCurveTo(x + r * 0.5, y - r * 0.9, x + r * 0.8, y - r * 0.7); T.stroke();
        T.fillStyle = 'rgb(255,230,120)'; T.beginPath(); T.arc(x + r * 0.82, y - r * 0.72, r * 0.2, 0, Math.PI * 2); T.fill();
        break;
      case 'marksman':
        T.arc(x, y, r * 0.65, 0, Math.PI * 2);
        T.moveTo(x - r, y); T.lineTo(x - r * 0.3, y); T.moveTo(x + r * 0.3, y); T.lineTo(x + r, y);
        T.moveTo(x, y - r); T.lineTo(x, y - r * 0.3); T.moveTo(x, y + r * 0.3); T.lineTo(x, y + r);
        T.stroke();
        break;
      default:
        T.moveTo(x - r * 0.8, y - r * 0.05); T.lineTo(x, y - r * 0.75); T.lineTo(x + r * 0.8, y - r * 0.05);
        T.moveTo(x - r * 0.8, y + r * 0.6); T.lineTo(x, y - r * 0.1); T.lineTo(x + r * 0.8, y + r * 0.6);
        T.stroke();
    }
    T.globalAlpha = 1;
  }

  /** The squad panel (right edge), role glyphs over the bots, the Focus target and the Hold spot. */
  draw(hud, s) {
    const g = this.game, Z = this.Z;
    if (!Z?.enabled || !s.zombie || !s.squad) return;
    const T = hud.gTop, k = hud.k, W = hud.vw, Hh = hud.vh, F = this.font(hud), t = hud.time;
    const me = g.local, vt = g.viewTarget, D = Z.downed;
    // over the bots: their role glyph and a sliver of health (not the one down: zdowned marks him)
    if (!s.scope) {
      const eye = vt?.eyePos?.(_e);
      for (const p of g.players) {
        if (!p.isBot || !inSquad(p) || !p.alive || p.downed || p === vt) continue;
        const o = p.pm.origin;
        _scr[0] = o[0]; _scr[1] = o[1]; _scr[2] = o[2] + 48;
        const d = eye ? Math.hypot(o[0] - eye[0], o[1] - eye[1], o[2] - eye[2]) : 0;
        if (d > 3000 || !D.toScreen(hud, _scr, _scr) || _scr[2] !== 1) continue;
        const a = d < 700 ? 0.95 : Math.max(0.3, 0.95 - (d - 700) / 3300);
        const r = Math.max(4, Math.round(6 * k * (d < 1200 ? 1 : 0.8)));
        this.glyph(T, p.role, _scr[0], _scr[1], r, a);
        const bw = Math.round(r * 3), bh = Math.max(2, Math.round(2 * k)), by = _scr[1] + r * 1.6;
        const f = Math.max(0, Math.min(1, p.health / (p.maxHealth || 100)));
        T.globalAlpha = a;
        T.fillStyle = 'rgba(0,0,0,0.6)'; T.fillRect(_scr[0] - bw / 2 - 1, by - 1, bw + 2, bh + 2);
        T.fillStyle = f > 0.5 ? 'rgb(110,230,110)' : f > 0.25 ? 'rgb(255,190,60)' : 'rgb(255,70,50)';
        T.fillRect(_scr[0] - bw / 2, by, Math.round(bw * f), bh);
        T.globalAlpha = 1;
      }
    }
    // your Focus target: red brackets (pinned to the edge when off screen)
    const M = this.mark;
    if (M && M.target.alive) {
      const z = M.target, o = z.pm.origin, sc = z.boss ? z.boss.scale : 1;
      _scr[0] = o[0]; _scr[1] = o[1]; _scr[2] = o[2] + 20 * sc;
      if (D.toScreen(hud, _scr, _scr)) {
        const x = _scr[0], y = _scr[1], on = _scr[2] === 1, pulse = 0.5 + 0.5 * Math.sin(t * 9);
        const r = Math.round((on ? 16 + 4 * pulse : 10) * k * (on ? Math.min(1.6, sc) : 1)), L = Math.round(r * 0.45);
        T.strokeStyle = `rgba(255,${60 + 60 * pulse | 0},50,0.95)`; T.lineWidth = Math.max(2, Math.round(2 * k));
        T.beginPath();
        for (const [sx, sy] of CORNERS) { T.moveTo(x + sx * r, y + sy * (r - L)); T.lineTo(x + sx * r, y + sy * r); T.lineTo(x + sx * (r - L), y + sy * r); }
        T.stroke();
        hud.text(`FOCUS ${Math.ceil(M.until - g.time)}`, x, y + r + 2 * k, [255, 90, 60], { align: 'center', font: F.tiny });
      }
    }
    // the Hold spot: an amber diamond while somebody holds it
    const HO = this.hold;
    if (HO && g.time < HO.until && !s.scope) {
      _scr[0] = HO.anchor[0]; _scr[1] = HO.anchor[1]; _scr[2] = HO.anchor[2] + 8;
      if (D.toScreen(hud, _scr, _scr) && _scr[2] === 1) {
        const x = _scr[0], y = _scr[1], r = Math.round(7 * k);
        T.fillStyle = 'rgba(255,196,60,0.85)'; T.strokeStyle = 'rgba(0,0,0,0.6)'; T.lineWidth = 1;
        T.beginPath(); T.moveTo(x, y - r); T.lineTo(x + r, y); T.lineTo(x, y + r); T.lineTo(x - r, y); T.closePath(); T.fill(); T.stroke();
        hud.text('HOLD', x, y + r + 2 * k, [255, 196, 60], { align: 'center', font: F.tiny });
      }
    }
    // the panel: right edge, under the kill feed
    const H = s.squad, n = H.n;
    if (!n || (me && !me.alive && s.spectator)) return;
    const rh = Math.round(hud.lineH * 1.32), pad = Math.round(5 * k), gw = Math.round(14 * k);
    T.font = F.small;
    let nameW = 0, stW = 0;
    for (let i = 0; i < n; i++) { nameW = Math.max(nameW, T.measureText(H.rows[i].name).width); stW = Math.max(stW, T.measureText(H.rows[i].state).width); }
    nameW = Math.min(nameW, 90 * k); stW = Math.max(stW, 46 * k);
    const w = Math.round(pad * 3 + gw + nameW + stW + 6 * k), x0 = W - w - Math.round(8 * k);
    const y0 = Math.round(Math.max(Hh * 0.33, 150 * k)), head = Math.round(hud.lineH * 1.15);
    const h = head + rh * n + pad;
    if (y0 + h > Hh - 90 * k) return; // (no room: a tiny screen with a big squad)
    T.fillStyle = 'rgba(8,8,8,0.42)'; T.fillRect(x0, y0, w, h);
    T.fillStyle = 'rgba(255,176,0,0.55)'; T.fillRect(x0, y0, w, Math.max(1, Math.round(k)));
    hud.text('SQUAD', x0 + pad, y0 + Math.round(3 * k), [255, 176, 0], { font: F.tiny });
    if (H.order) hud.text(`${H.order} ${Math.max(0, Math.ceil(H.left))}s`, x0 + w - pad, y0 + Math.round(3 * k), H.orderRgb, { align: 'right', font: F.tiny });
    for (let i = 0; i < n; i++) {
      const r = H.rows[i], y = y0 + head + i * rh;
      const dim = r.state === STATE.dead[0];
      const a = dim ? 0.55 : 1;
      this.glyph(T, r.role, x0 + pad + gw / 2, y + rh * 0.42, Math.round(gw * 0.36), a);
      const nx = x0 + pad * 2 + gw;
      let nm = r.name;
      T.font = F.small;
      if (T.measureText(nm).width > nameW) { while (nm.length > 2 && T.measureText(nm + '.').width > nameW) nm = nm.slice(0, -1); nm += '.'; }
      hud.text(nm, nx, y + Math.round(1 * k), dim ? [150, 150, 150] : [235, 228, 210], { font: F.small });
      // health under the name (the bleed pool in red while down)
      const bw = Math.round(nameW), bh = Math.max(2, Math.round(2.5 * k)), by = y + rh - bh - Math.round(3 * k);
      T.fillStyle = 'rgba(0,0,0,0.55)'; T.fillRect(nx - 1, by - 1, bw + 2, bh + 2);
      T.fillStyle = r.down ? 'rgb(230,40,30)' : r.hp > 0.5 ? 'rgb(110,230,110)' : r.hp > 0.25 ? 'rgb(255,190,60)' : 'rgb(255,70,50)';
      T.fillRect(nx, by, Math.round(bw * r.hp), bh);
      const ba = r.blink ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 10)) : 1;
      hud.text(r.state, x0 + w - pad, y + Math.round(rh * 0.18), r.rgb, { align: 'right', font: F.tiny, alpha: ba * a });
    }
  }

  // ---------------------------------------------------------------- console
  /** zm_squad (roles and states), zm_role <bot> <role>, zm_focus (the Focus order: radio Z -> 7, bound to Mouse 3 and I). True when it was ours. */
  command(p, cmd, args = []) {
    const g = this.game;
    if (cmd === 'zm_focus') {
      if (p?.alive && !p.downed && inSquad(p)) { g.rounds.radio(p, FOCUS); g.bots.onRadio?.(p, FOCUS); }
      return true;
    }
    if (cmd === 'zm_role') {
      const who = String(args[0] ?? '').toLowerCase(), role = String(args[1] ?? '').toLowerCase();
      const list = this.bots();
      const q = list[+who - 1] || list.find((x) => x.name.toLowerCase() === who);
      if (!q || !ROLES[role]) { g.console?.print?.(`usage: zm_role <bot name | 1..${list.length}> <${ROLE_IDS.join('|')}>`); return true; }
      q.role = role;
      this.Z.events.mode('role', { player: q, role });
      g.console?.print?.(`${q.name} is the ${ROLES[role].label} now (its shopping follows from the next break)`);
      return true;
    }
    if (cmd !== 'zm_squad') return false;
    this.hud(this.hs.rows.length ? { zombie: true } : {});
    const rows = this.game.players.filter((q) => q.isBot && inSquad(q)).map((q) => {
      const i = this.hs.rows.findIndex((r) => r.name === q.name);
      return `${q.name}: ${ROLES[q.role]?.label || '-'} [${q.weapons[1]?.id || q.weapons[2]?.id || '-'}]${i >= 0 && i < this.hs.n ? ' ' + this.hs.rows[i].state : ''}${q.bot?.focus && q.bot.time < q.bot.focus.until ? ' (focus)' : ''}`;
    });
    g.console?.print?.(rows.join(', ') || 'no bots in the squad');
    return true;
  }
}
