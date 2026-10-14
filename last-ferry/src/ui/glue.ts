// Integration helpers: build what the UI renders straight from the logic's
// read-only WorldView (core/api.ts) and the config tables, so the app only
// has to call these once per frame.
//
//   hud.update(hudSnapshot(world))
//   overlay.render(overlayFrame(world, overlay.project.bind(overlay)), dt)
//   screens.showGameOver(cause, runStats(world, player.stats, seconds), …)
import { CHAPTERS, MOPUP_CRAWLER_X } from '../config/chapters';
import { WEAPON_ORDER, type WeaponId, type ZombieKind } from '../config/ids';
import { REANIMATION } from '../config/rules';
import { WEAPONS } from '../config/weapons';
import { CRANE, ESCAPE_X, HUNTER, TICK_RATE } from '../config/world';
import { laneFor } from '../config/view';
import { MUZZLE_Z } from '../config/weapons';
import { ZOMBIES } from '../config/zombies';
import type { PlayerView, WorldView } from '../core/api';
import type { RunStats } from './options';
import type { HudSlot, HudSnapshot } from './hudTypes';
import type { OverlayCrane, OverlayFrame, OverlayMark, OverlayTwitch } from './WorldOverlay';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** In-game clock for a time of day (0 = 18:40 … 1 = 22:00, the last sailing). */
export function clockAt(timeOfDay: number): string {
  const pts: Array<[number, number]> = [
    [0, 18 * 60 + 40],
    [0.33, 19 * 60 + 25],
    [0.66, 21 * 60 + 10],
    [1, 22 * 60],
  ];
  const t = clamp01(timeOfDay);
  let m = pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, m0] = pts[i - 1];
      const [t1, m1] = pts[i];
      m = m0 + ((m1 - m0) * (t - t0)) / (t1 - t0);
      break;
    }
  }
  const mm = Math.floor(m);
  return `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`;
}

/** 0..1: how close the leading zombie is to the gangway (0 below x = 12). */
export function gangwayDanger(w: WorldView): number {
  let d = 0;
  for (const z of w.zombies) {
    if (z.dead || z.removed) continue;
    d = Math.max(d, clamp01((z.x - 12) / (ESCAPE_X - 12)));
  }
  return d;
}

/**
 * HUD snapshot for player `playerId` (default 0). Pass `out` to reuse one
 * object per frame (no garbage).
 */
export function hudSnapshot(w: WorldView, opts: { playerId?: number; bossName?: string; out?: HudSnapshot } = {}): HudSnapshot {
  const p = w.players.find((q) => q.id === (opts.playerId ?? 0)) ?? w.players[0];
  const ch = CHAPTERS[w.chapter - 1] ?? CHAPTERS[0];
  const s: HudSnapshot =
    opts.out ??
    ({
      slots: WEAPON_ORDER.map((id, i) => ({ id, name: WEAPONS[id].name, price: WEAPONS[id].price, owned: false, selected: false, affordable: false, ammo: 0, key: i + 1 })),
      weapon: { id: 'revolver', name: '', bullets: 0, clip: 1, reload: null, heat: 0, spin: 0 },
    } as unknown as HudSnapshot);
  s.chapter = w.chapter;
  s.chapterName = w.chapterName || ch.name;
  s.mode = w.phase === 'boss' && w.bossLife !== null ? (w.mopUp ? 'mopup' : 'boss') : 'boarding';
  s.stragglers = w.stragglers ?? 0;
  s.stragglersMax = w.stragglersMax ?? 0;
  s.craneUnder = w.craneUnder ?? 0;
  s.boarded = w.boarded;
  s.passengers = w.passengers;
  s.bossLife = w.bossLife ?? 1;
  s.bossName = opts.bossName ?? w.bossName ?? ch.bossName;
  s.money = p?.money ?? 0;
  s.kills = p?.kills ?? 0;
  if (!s.slots || s.slots.length !== WEAPON_ORDER.length) s.slots = [];
  WEAPON_ORDER.forEach((id, i) => {
    const def = WEAPONS[id];
    const own = p?.owned.get(id);
    const slot: HudSlot = s.slots[i] ?? ({} as HudSlot);
    slot.id = id;
    slot.name = def.name;
    slot.price = def.price;
    slot.owned = !!own;
    slot.selected = p?.weapon.id === id;
    slot.affordable = (p?.money ?? 0) >= def.price;
    slot.ammo = p?.weapon.id === id ? p.weapon.bullets : (own?.bullets ?? 0);
    slot.key = i + 1;
    s.slots[i] = slot;
  });
  const wp = p?.weapon;
  const id: WeaponId = wp?.id ?? 'revolver';
  const def = WEAPONS[id];
  s.weapon = s.weapon ?? ({} as HudSnapshot['weapon']);
  s.weapon.id = id;
  s.weapon.name = def.short;
  s.weapon.bullets = wp?.bullets ?? 0;
  s.weapon.clip = def.clip;
  s.weapon.reload = wp && wp.state === 'reload' ? clamp01(wp.reloadProgress) : null;
  s.weapon.heat = wp?.heat ?? 0;
  s.weapon.spin = wp?.spin ?? 0;
  s.health = p ? clamp01(p.life / HUNTER.life) : 1;
  s.favour = clamp01(w.favour / 100);
  s.favourReady = w.favourReady ?? w.favour >= 100;
  s.hornReady = w.hornReady;
  s.craneReady = w.craneReady ?? w.crane.state === 'hanging';
  s.clock = clockAt(w.timeOfDay);
  s.danger = gangwayDanger(w);
  return s;
}

/**
 * Overlay frame: the crosshair `ahead` m in front of the hunter on his gun
 * line, twitch warnings over bodies about to rise, damage / gas / night tints
 * and the gangway danger glow. `project` maps world metres to view CSS px
 * (WorldOverlay.project, or Stage.project for shake-accurate positions).
 */
export function overlayFrame(
  w: WorldView,
  project: (x: number, y: number, z: number) => { x: number; y: number },
  opts: { playerId?: number; ahead?: number; recentDamage?: number; kick?: number; showCrosshair?: boolean; marks?: boolean; culpritId?: number } = {},
): OverlayFrame {
  const p: PlayerView | undefined = w.players.find((q) => q.id === (opts.playerId ?? 0)) ?? w.players[0];
  const f: OverlayFrame = {};
  if (p && p.state !== 'dead' && opts.showCrosshair !== false) {
    const c = project(p.x - (opts.ahead ?? 4.5), p.y + HUNTER.muzzleHeight, p.z);
    const wp = p.weapon;
    f.crosshair = {
      x: c.x,
      y: c.y,
      bullets: wp.bullets,
      clip: WEAPONS[wp.id].clip,
      reload: wp.state === 'reload' ? clamp01(wp.reloadProgress) : null,
      spin: wp.spin,
      heat: wp.heat,
      weapon: wp.id,
      kick: opts.kick,
    };
  }
  const tw: OverlayTwitch[] = [];
  const stir: OverlayTwitch[] = [];
  const twitchTicks = REANIMATION.twitchSeconds * TICK_RATE;
  const stirTicks = STIR_SECONDS * TICK_RATE;
  for (const c of w.corpses) {
    if (c.removed || c.ash || c.risesAt === null) continue;
    const left = c.risesAt - w.tick;
    if (c.twitching) {
      const s = project(c.x, 0.15, c.z);
      tw.push({ x: s.x, y: s.y, t: clamp01(1 - left / twitchTicks) });
    } else if (left - twitchTicks < stirTicks) {
      // Not dead yet: a quiet grey tell before the red '!'.
      const s = project(c.x, 0.15, c.z);
      stir.push({ x: s.x, y: s.y, t: clamp01(1 - (left - twitchTicks) / stirTicks) });
    }
  }
  f.twitches = tw;
  f.stirring = stir;
  if (opts.marks !== false) f.marks = zombieMarks(w, project, opts.culpritId);
  if (p && p.state !== 'dead' && opts.showCrosshair !== false) f.crane = craneHint(w, p, project);
  if (p) {
    const hurt = clamp01((0.55 - p.life / HUNTER.life) / 0.55);
    f.damage = Math.max(hurt * 0.8, clamp01(opts.recentDamage ?? 0));
    let gas = 0;
    for (const g of w.gas) {
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      gas = Math.max(gas, clamp01((g.radius + 0.6 - d) / 1.2) * clamp01(g.ttl / 0.6));
    }
    f.gas = gas;
  }
  f.night = clamp01((w.timeOfDay - 0.62) / 0.38) * 0.55;
  f.danger = gangwayDanger(w);
  return f;
}

/** Seconds before a downed body starts twitching that the grey "not dead yet" tell shows. */
const STIR_SECONDS = 4;
/** Zombies this close to the gangway get a red ring on the deck. */
const GANGWAY_RING_X = ESCAPE_X - 4;

/** Markers over zombies: mop-up stragglers, the ones nearly at the gangway, the one that boarded. */
function zombieMarks(w: WorldView, project: (x: number, y: number, z: number) => { x: number; y: number }, culpritId?: number): OverlayMark[] {
  const out: OverlayMark[] = [];
  const end = w.phase === 'gameover' || w.phase === 'victory';
  for (const z of w.zombies) {
    if (z.dead || z.removed) continue;
    const def = ZOMBIES[z.kind];
    const top = z.risen ? REANIMATION.crawlerHeight : def.height;
    const culprit = z.id === culpritId;
    const kind = culprit ? 'culprit' : end ? null : w.mopUp && !(z.risen && z.x <= MOPUP_CRAWLER_X) ? 'straggler' : z.x > GANGWAY_RING_X ? 'gangway' : null;
    if (!kind) continue;
    // (project may reuse its result object: read each point before the next call.)
    let q = project(z.x, top + 0.35, z.z);
    const x = q.x;
    const y = q.y;
    q = project(z.x, 0.02, z.z);
    const fx = q.x;
    const fy = q.y;
    q = project(z.x + def.halfLength, 0.02, z.z);
    const r = Math.max(6, Math.abs(q.x - fx));
    out.push({ kind, x, y, fx, fy, r });
  }
  return out;
}

/**
 * The crane affordance: the hook block and the drop square, how close the
 * Bosun's gun line is to the hook's lane (and which way to move), lined up or
 * not, and how many zombies stand under the pallet. Null when the crane is
 * used or out of reach (the Bosun must be right of it).
 */
function craneHint(w: WorldView, p: PlayerView, project: (x: number, y: number, z: number) => { x: number; y: number }): OverlayCrane | null {
  if (w.crane.state !== 'hanging' || w.phase === 'gameover' || w.phase === 'victory') return null;
  const mz = p.z + MUZZLE_Z[p.weapon.id];
  const y0 = p.y + HUNTER.muzzleHeight;
  if (p.x - 0.6 < CRANE.hookX + CRANE.hookHalfX + 0.5) return null;
  const off = mz - laneFor(y0, CRANE.hookCY, CRANE.hookZ);
  const lined = Math.abs(off) <= CRANE.laneBand;
  const near = lined ? 1 : clamp01(1 - (Math.abs(off) - CRANE.laneBand) / (CRANE.hintBand - CRANE.laneBand));
  const r = CRANE.radius;
  let under = 0;
  for (const z of w.zombies) {
    if (!z.dead && !z.removed && Math.abs(z.x - CRANE.hookX) <= r && Math.abs(z.z - CRANE.hookZ) <= r) under++;
  }
  // (project may reuse its result object: copy each point.)
  const h = project(CRANE.hookX, CRANE.hookCY, CRANE.hookZ);
  const hook = { x: h.x, y: h.y };
  const c = project(p.x - 4.5, y0, p.z);
  const ch = { x: c.x, y: c.y };
  return { hook, near, lined, under, crowd: CRANE.crowd, dir: lined ? 0 : off > 0 ? -1 : 1, ch };
}

/** The stats object the logic keeps per player (core/Player.ts PlayerStats); every field optional here. */
export interface PlayerStatsLike {
  shots?: number;
  hits?: number;
  headshots?: number;
  kills?: number;
  killsByKind?: Partial<Record<ZombieKind, number>>;
  killsByWeapon?: Partial<Record<string, number>>;
  earned?: number;
  niceShots?: number;
  bestNiceShot?: number;
  stomps?: number;
  horns?: number;
  craneDrops?: number;
  cannonStrikes?: number;
  bought?: WeaponId[];
  risenKills?: number;
  nailed?: number;
}

/** RunStats for the game-over / victory screens. */
export function runStats(w: WorldView, st: PlayerStatsLike, timeSec: number, opts: { playerId?: number; passengersSaved?: number } = {}): RunStats {
  const p = w.players.find((q) => q.id === (opts.playerId ?? 0)) ?? w.players[0];
  let fav: WeaponId | null = null;
  let best = 0;
  for (const [k, v] of Object.entries(st.killsByWeapon ?? {})) {
    if ((v ?? 0) > best && (WEAPON_ORDER as string[]).includes(k)) {
      best = v ?? 0;
      fav = k as WeaponId;
    }
  }
  const ch = CHAPTERS[w.chapter - 1] ?? CHAPTERS[0];
  return {
    chapter: w.chapter,
    chapterName: w.chapterName || ch.name,
    timeSec,
    kills: st.kills ?? p?.kills ?? 0,
    headshots: st.headshots ?? 0,
    shots: st.shots ?? 0,
    hits: st.hits ?? 0,
    moneyEarned: st.earned ?? 0,
    moneyLeft: p?.money,
    niceShots: st.niceShots ?? 0,
    bestNiceShot: st.bestNiceShot ?? 0,
    favouriteWeapon: fav,
    corpsesStomped: st.stomps ?? 0,
    risenKilled: st.risenKills,
    bodiesNailed: st.nailed,
    passengersSaved: opts.passengersSaved,
    // Copies: the logic keeps counting (the departure, the next run).
    killsByKind: { ...(st.killsByKind ?? {}) },
    weaponsBought: [...(st.bought ?? [])],
    hornsUsed: st.horns,
    cannonStrikes: st.cannonStrikes,
    craneDrops: st.craneDrops,
  };
}
