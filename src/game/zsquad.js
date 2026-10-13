// Zombie survival squad roles and orders (Milestone 3.3, owner: squad). Bots spawn with roles:
// a Gunner (M249 or minigun), a Medic (revives first, a lower heal threshold), a Demo
// (claymores at your hold, molotovs into packs; never an RPG or M32: friendly fire) and a
// Marksman (Barrett on specials and weak points); the rest are Riflemen. "Hold here" sets the
// squad in an arc facing the incoming lanes, "Follow" and "Regroup" work, and "Focus target"
// (the radio menu's new item) puts every gun on what you point at. Bots shoot pinned
// teammates free and restock mid-wave. A squad panel shows each bot's HP and state (PINNED,
// DOWN 0:18, REVIVING).
//
// Contract (m3-contracts section 7):
//   p.role                      a bot's ROLES id (assigned by tick, kept for the run), else undefined
//   squad.assign(bot)           -> the role a new bot gets (the scaffold: every bot a rifleman)
//   squad.shop(bot, economy)    zeconomy.shop asks first: true = the role did its own shopping
//                               (ROLES[role].guns: preference order; economy.cost / R.buy)
//   squad.targetWeight(bot, e, d)  x a bot's score for target e (bots.js scan; lower = sooner)
//   squad.focus(p, mates)       the radio's "Focus target" (zorders.js): marks what p aims at
//                               (focusTarget) on every bot in mates (b.focus = { target, until });
//                               -> the target or null
// Events: 'role' { player, role }, 'order' { player (who gave it), order: 'follow' | 'cover' |
// 'hold' | 'fallback' | 'focus', target (focus), bots (how many took it) } (runstats.js).
// Difficulty: g.zombies.diff.roles { focus (s), medicHeal, holdArc } (zdiff.js).
// Gate every change to zombie mode only (bots.js is shared with classic CS).
//
// Scaffold (foundation): everyone is a rifleman (today's shopping), a Focus order works
// (focused bots rate that target 0.35 x), no panel.
import { TEAM_CT } from './player.js';
import { angleVectors } from '../engine/coords.js';

/**
 * Roles: label, short (the panel), guns (primary preference, best first: the economy's
 * default tiers when null), extras (equipment it keeps stocked), and whatever the role's
 * behaviour reads (the squad builder adds fields).
 */
export const ROLES = {
  rifleman: { label: 'Rifleman', short: 'RIF', guns: null, extras: [] },
  gunner: { label: 'Gunner', short: 'GUN', guns: ['minigun', 'm249'], extras: [] },
  medic: { label: 'Medic', short: 'MED', guns: ['p90', 'ump45', 'mp5'], extras: ['medkit', 'medkit'] },
  demo: { label: 'Demo', short: 'DEM', guns: ['aa12', 'xm1014', 'm3'], extras: ['claymore', 'molotov'] },
  marksman: { label: 'Marksman', short: 'MRK', guns: ['barrett', 'g3sg1', 'sg550'], extras: [] },
};
/** The order roles are handed out in (the squad builder: the first bots get these, the rest are riflemen). */
export const ROLE_ORDER = ['gunner', 'medic', 'demo', 'marksman'];

const FOCUS_K = 0.35; // a focused bot's score for its focus target (bots.js scan: lower is sooner)
const _f = [0, 0, 0], _e = [0, 0, 0];

export class ZSquad {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.assignAt = 0;
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
  }

  /** A new run: roles are handed out afresh. */
  reset() {
    for (const p of this.game.players) { p.role = undefined; if (p.bot) p.bot.focus = null; }
    this.assignAt = 0;
  }

  /** The role a bot joining the squad gets. */
  assign(bot) { void bot; return 'rifleman'; }

  /** zeconomy.shop: true when the bot's role did its own shopping (the economy's default otherwise). */
  shop(bot, economy) { void bot; void economy; return false; }

  /** bots.js scan: x the bot's score for zombie e at d units (lower is picked sooner). Hot path. */
  targetWeight(bot, e, d) {
    void d;
    const F = bot.focus;
    return F && F.target === e && bot.time < F.until ? FOCUS_K : 1;
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
    return z;
  }

  // ---------------------------------------------------------------- scaffold hooks
  /** Every tick (ZombieMode.tick): bots in the squad without a role get one (checked every 0.5 s). */
  tick(t) {
    if (t < this.assignAt) return;
    this.assignAt = t + 0.5;
    for (const p of this.game.players) {
      if (!p.isBot || p.team !== TEAM_CT || p.isZombie || p.role) continue;
      p.role = this.assign(p.bot) || 'rifleman';
      this.Z.events.mode('role', { player: p, role: p.role });
    }
  }

  /** HUD state (buildHudState, every frame): the squad panel's rows. */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** zm_squad: who has which role (no cheats needed). True when it was ours. */
  command(p, cmd) {
    if (cmd !== 'zm_squad') return false;
    const rows = this.game.players.filter((q) => q.isBot && q.team === TEAM_CT && !q.isZombie).map((q) => `${q.name}: ${ROLES[q.role]?.label || '-'}${q.bot?.focus && q.bot.time < q.bot.focus.until ? ' (focus)' : ''}`);
    this.game.console?.print?.(rows.join(', ') || 'no bots in the squad');
    return true;
  }
}
