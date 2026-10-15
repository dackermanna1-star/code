// ClipSet: resolves animation roles (locomotion groups per stance/style, aim idles, special states and
// upper-body overlays) from the library — exact names from the delivered asset set first, then the
// generic classifier (fallback models such as the Soldier).
import type { ClipInfo, ClipStance, ClipStyle } from './Clips';
import type { CharacterLibrary } from './CharacterLibrary';

export interface LocoGroup {
  idle: ClipInfo | null;
  /** Idle used while aiming (rifle_aim, pistol_aim, crouch/prone aim). */
  aimIdle: ClipInfo | null;
  loco: ClipInfo[];
}

export type SpecialRole =
  | 'fall'
  | 'fallRifle'
  | 'jump'
  | 'land'
  | 'swimIdle'
  | 'swimF'
  | 'swimB'
  | 'swimL'
  | 'swimR'
  | 'freefall'
  | 'parachute'
  | 'driveSit'
  | 'passengerSit'
  | 'knockedIdle'
  | 'knockedCrawl';

export type OverlayRole = 'useItem' | 'drink' | 'throw' | 'melee' | 'revive' | 'pickup' | 'door' | 'punch' | 'hitF' | 'hitB' | 'hitL' | 'hitR';

const SPECIAL_NAMES: Record<SpecialRole, string[]> = {
  fall: ['fall_loop'],
  fallRifle: ['rifle_fall_loop'],
  jump: ['jump_start'],
  land: ['land'],
  swimIdle: ['swim_idle'],
  swimF: ['swim_f'],
  swimB: ['swim_b'],
  swimL: ['swim_l'],
  swimR: ['swim_r'],
  freefall: ['freefall'],
  parachute: ['parachute_hang', 'parachute_idle'],
  driveSit: ['drive_sit'],
  passengerSit: ['passenger_sit'],
  knockedIdle: ['knocked_idle'],
  knockedCrawl: ['knocked_crawl'],
};

const OVERLAY_NAMES: Record<OverlayRole, string[]> = {
  useItem: ['use_item'],
  drink: ['drink'],
  throw: ['throw_grenade'],
  melee: ['melee_swing'],
  revive: ['revive_teammate'],
  pickup: ['pickup'],
  door: ['interact_door', 'interact'],
  punch: ['punch_r'],
  hitF: ['hit_react_f'],
  hitB: ['hit_react_b'],
  hitL: ['hit_react_l'],
  hitR: ['hit_react_r'],
};

const GROUP_NAMES: Record<string, { idle: string[]; aim: string[]; loco: RegExp }> = {
  'stand/unarmed': { idle: ['idle'], aim: [], loco: /^(walk|jog|run|sprint)_(f|b|l|r|fl|fr|bl|br)$/ },
  'crouch/unarmed': { idle: ['crouch_idle'], aim: [], loco: /^crouch_walk_(f|b|l|r|fl|fr|bl|br)$/ },
  'prone/unarmed': { idle: ['prone_idle'], aim: [], loco: /^prone_crawl_(f|b)$/ },
  'stand/rifle': { idle: ['rifle_idle'], aim: ['rifle_aim'], loco: /^rifle_(walk|jog)_(f|b|l|r|fl|fr|bl|br)$|^rifle_run_f$|^rifle_sprint(_fl|_fr)?$/ },
  'crouch/rifle': { idle: ['rifle_crouch_idle'], aim: ['rifle_crouch_aim'], loco: /^rifle_crouch_walk_(f|b|l|r|fl|fr|bl|br)$/ },
  'prone/rifle': { idle: ['rifle_prone_idle'], aim: ['rifle_prone_aim'], loco: /^rifle_prone_crawl_(f|b)$/ },
  'stand/pistol': { idle: ['pistol_idle'], aim: ['pistol_aim'], loco: /^pistol_(walk_(f|b|l|r)|run_(f|b)|sprint)$/ },
  'crouch/pistol': { idle: [], aim: ['pistol_crouch_aim'], loco: /^pistol_crouch_walk_f$/ },
};

export class ClipSet {
  readonly groups = new Map<string, LocoGroup>();
  readonly specials = new Map<SpecialRole, ClipInfo>();
  readonly overlays = new Map<OverlayRole, ClipInfo>();
  /** Crouch idles rejected as too low (debug). */
  readonly lowCrouchIdle = new Set<string>();

  constructor(lib: CharacterLibrary) {
    const byName = lib.clipByName;
    const pick = (names: string[]) => {
      for (const n of names) {
        const c = byName.get(n);
        if (c) return c;
      }
      return null;
    };
    const stances: ClipStance[] = ['stand', 'crouch', 'prone'];
    const styles: ClipStyle[] = ['unarmed', 'rifle', 'pistol'];
    for (const stance of stances)
      for (const style of styles) {
        const key = `${stance}/${style}`;
        const spec = GROUP_NAMES[key];
        let idle: ClipInfo | null = null;
        let aimIdle: ClipInfo | null = null;
        let loco: ClipInfo[] = [];
        if (spec) {
          idle = pick(spec.idle);
          aimIdle = pick(spec.aim);
          loco = lib.clips.filter((c) => spec.loco.test(c.name) && c.speed > 0.05);
        }
        // Generic fallback (other naming schemes / fallback model).
        if (!idle) idle = lib.clips.find((c) => c.kind === 'idle' && c.stance === stance && c.style === style && !/ladder/.test(c.name)) ?? null;
        if (loco.length === 0) loco = lib.clips.filter((c) => c.kind === 'loco' && c.stance === stance && c.style === style && c.speed > 0.05);
        if (idle || aimIdle || loco.length) this.groups.set(key, { idle, aimIdle, loco });
      }
    // A crouch idle much lower than its crouch walk (e.g. a deep squat with a hand on the ground) pops when
    // starting/stopping and does not match the crouch collider: drop it so the procedural crouch
    // (stand idle + bent legs) is used for idling instead.
    for (const style of styles) {
      const g = this.groups.get(`crouch/${style}`);
      if (!g?.idle || g.loco.length === 0) continue;
      const idleY = hipsHeight(g.idle);
      const walkY = g.loco.reduce((a, c) => a + hipsHeight(c), 0) / g.loco.length;
      if (idleY > 0 && walkY > 0 && idleY < walkY * 0.75) {
        this.lowCrouchIdle.add(g.idle.name);
        g.idle = null;
      }
    }
    // Weapon groups borrow unarmed clips for speeds/directions they don't cover (arms are IK-driven).
    for (const stance of stances) {
      const un = this.groups.get(`${stance}/unarmed`);
      if (!un) continue;
      for (const style of ['rifle', 'pistol'] as const) {
        const g = this.groups.get(`${stance}/${style}`);
        if (!g) continue;
        if (!g.idle) g.idle = un.idle;
        for (const c of un.loco) {
          const same = g.loco.filter((x) => Math.abs(angDiff(x.angle, c.angle)) < 0.2);
          if (same.length === 0) {
            g.loco.push(c);
            continue;
          }
          const min = Math.min(...same.map((x) => x.speed));
          const max = Math.max(...same.map((x) => x.speed));
          if (c.speed < min * 0.8 || c.speed > max * 1.2) g.loco.push(c);
        }
      }
    }
    for (const [role, names] of Object.entries(SPECIAL_NAMES) as [SpecialRole, string[]][]) {
      const c = pick(names);
      if (c) this.specials.set(role, c);
    }
    // Generic specials for other clip sets.
    const gen: [SpecialRole, (c: ClipInfo) => boolean][] = [
      ['fall', (c) => c.kind === 'fall'],
      ['swimF', (c) => c.kind === 'swim'],
      ['swimIdle', (c) => c.kind === 'swimIdle'],
      ['freefall', (c) => c.kind === 'freefall'],
      ['parachute', (c) => c.kind === 'parachute'],
      ['driveSit', (c) => c.kind === 'seated'],
      ['knockedIdle', (c) => c.kind === 'knocked' && /idle/.test(c.name)],
      ['knockedCrawl', (c) => c.kind === 'knocked' && /crawl/.test(c.name)],
    ];
    for (const [role, pred] of gen) if (!this.specials.has(role)) {
      const c = lib.clips.find(pred);
      if (c) this.specials.set(role, c);
    }
    if (!this.specials.has('passengerSit') && this.specials.has('driveSit')) this.specials.set('passengerSit', this.specials.get('driveSit')!);
    for (const [role, names] of Object.entries(OVERLAY_NAMES) as [OverlayRole, string[]][]) {
      const c = pick(names);
      if (c) this.overlays.set(role, c);
    }
  }

  /** Best group for a stance/style plus the stance it really represents (for synthesis decisions). */
  group(stance: ClipStance, style: ClipStyle): { g: LocoGroup | null; stance: ClipStance } {
    const exact = this.groups.get(`${stance}/${style}`);
    if (exact && (exact.loco.length || exact.idle)) return { g: exact, stance };
    const un = this.groups.get(`${stance}/unarmed`);
    if (un && (un.loco.length || un.idle)) return { g: un, stance };
    const st = this.groups.get(`stand/${style}`) ?? this.groups.get('stand/unarmed') ?? null;
    return { g: st, stance: 'stand' };
  }
}

/** Mean hips height of a clip (from its Hips position track), 0 if unknown. */
function hipsHeight(c: ClipInfo): number {
  const t = c.clip.tracks.find((tr) => /(^|[:_.])Hips\.position$/.test(tr.name) || tr.name === 'Hips.position');
  if (!t || t.values.length < 3) return 0;
  let sum = 0;
  const n = t.values.length / 3;
  for (let i = 0; i < n; i++) sum += t.values[i * 3 + 1];
  return sum / n;
}

function angDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
