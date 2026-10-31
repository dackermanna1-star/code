import type { ActionDef, HitDef, RelCapsule, WeaponId } from './types';

/**
 * Weapons and their movesets (frame data at 60 ticks/s).
 *
 * Every weapon shares the same move vocabulary (light chain, overhead heavy, launcher, low sweep,
 * lunge thrust, air chain, air slam, throw) so the AI can reason about them uniformly, but the
 * numbers — speed, reach, damage, guard damage, armor, multi-hits, special properties — differ
 * enough that a spear duel plays nothing like a gauntlet brawl.
 */

export type ClipSet = 'blade' | 'heavy' | 'pole' | 'dual' | 'fist';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  /** Visual blade length in world units. */
  length: number;
  /** Bladed weapons can clash and enter blade locks. */
  blade: boolean;
  clipSet: ClipSet;
  /** Startup multiplier (lower = faster). */
  speed: number;
  /** Damage multiplier. */
  power: number;
  guardMult: number;
  /** Preferred engagement distance for the AI. */
  idealRange: number;
  moves: ActionDef[];
}

const ARM = 44;

interface WeaponSpec {
  id: WeaponId;
  name: string;
  description: string;
  length: number;
  blade: boolean;
  clipSet: ClipSet;
  speed: number;
  power: number;
  guardMult: number;
  /** Fraction of blade length that counts for reach. */
  reachFactor: number;
  /** Extra light hits in the chain (daggers/gauntlets get a 4th hit). */
  longChain: boolean;
  /** Hits per light attack (daggers strike twice). */
  lightHits: number;
  heavyArmor: number;
  /** Launcher pulls the target toward the attacker (scythe). */
  launcherPull: boolean;
  /** Sweep also covers behind (staff / scythe spin). */
  sweepBothSides: boolean;
  throwPower: number;
}

const SPECS: WeaponSpec[] = [
  {
    id: 'katana', name: 'Katana', description: 'Balanced and razor-quick; a lightning iai heavy.',
    length: 60, blade: true, clipSet: 'blade', speed: 1.0, power: 1.0, guardMult: 1.0, reachFactor: 0.82,
    longChain: false, lightHits: 1, heavyArmor: 0, launcherPull: false, sweepBothSides: false, throwPower: 1.0,
  },
  {
    id: 'greatsword', name: 'Greatsword', description: 'Slow, colossal cleaves that shatter guards; armored heavy.',
    length: 84, blade: true, clipSet: 'heavy', speed: 1.18, power: 1.42, guardMult: 1.5, reachFactor: 0.8,
    longChain: false, lightHits: 1, heavyArmor: 14, launcherPull: false, sweepBothSides: false, throwPower: 1.15,
  },
  {
    id: 'spear', name: 'Spear', description: 'Owns the mid-range with long, darting thrusts.',
    length: 106, blade: true, clipSet: 'pole', speed: 1.0, power: 1.0, guardMult: 1.0, reachFactor: 0.78,
    longChain: false, lightHits: 1, heavyArmor: 0, launcherPull: false, sweepBothSides: false, throwPower: 0.9,
  },
  {
    id: 'daggers', name: 'Twin Daggers', description: 'Blinding twin-blade flurries; every light strikes twice.',
    length: 28, blade: true, clipSet: 'dual', speed: 0.76, power: 0.66, guardMult: 0.8, reachFactor: 0.9,
    longChain: true, lightHits: 2, heavyArmor: 0, launcherPull: false, sweepBothSides: false, throwPower: 1.0,
  },
  {
    id: 'scythe', name: 'Scythe', description: 'Wide reaping arcs; its launcher drags foes inward.',
    length: 82, blade: true, clipSet: 'heavy', speed: 1.1, power: 1.22, guardMult: 1.2, reachFactor: 0.8,
    longChain: false, lightHits: 1, heavyArmor: 0, launcherPull: true, sweepBothSides: true, throwPower: 1.0,
  },
  {
    id: 'gauntlets', name: 'Divine Gauntlets', description: 'Shockwave fists: the fastest strikes and brutal throws.',
    length: 12, blade: false, clipSet: 'fist', speed: 0.78, power: 0.72, guardMult: 0.9, reachFactor: 1.0,
    longChain: true, lightHits: 1, heavyArmor: 8, launcherPull: false, sweepBothSides: false, throwPower: 1.2,
  },
  {
    id: 'staff', name: 'War Staff', description: 'Sweeping, vaulting staff work that controls both sides.',
    length: 96, blade: false, clipSet: 'pole', speed: 0.96, power: 0.9, guardMult: 1.0, reachFactor: 0.68,
    longChain: false, lightHits: 1, heavyArmor: 0, launcherPull: false, sweepBothSides: true, throwPower: 1.0,
  },
];

function cap(ax: number, ay: number, bx: number, by: number, r: number): RelCapsule {
  return { ax, ay, bx, by, r };
}

function hit(p: Partial<HitDef> & { damage: number }): HitDef {
  return {
    guard: 10, hitstun: 18, blockstun: 12, kbx: 150, kby: 0, level: 1,
    ...p,
  };
}

function frames(base: number, speed: number): number {
  return Math.max(3, Math.round(base * speed));
}

function maxRange(c: RelCapsule): number {
  return Math.max(c.ax, c.bx) + c.r + 12;
}

function buildMoves(s: WeaponSpec): ActionDef[] {
  const L = s.length * s.reachFactor;
  const P = s.power;
  const sp = s.speed;
  const g = s.guardMult;
  const id = (m: string) => `${s.id}.${m}`;
  const clip = (m: string) => `${s.clipSet}.${m}`;
  const blade = s.blade;
  const swing = blade ? 'whoosh_blade' : 'whoosh_light';

  const lightCancels = [id('heavy'), id('launcher'), id('sweep'), id('thrust'), '*ability', 'kiblast', 'vanish'];
  const moves: ActionDef[] = [];

  const l1 = cap(10, -86, 10 + ARM + L, -72, 15);
  moves.push({
    id: id('light1'), name: 'Opening Cut', kind: 'light', startup: frames(7, sp), active: 3, recovery: frames(12, sp),
    height: 'mid', clip: clip('light1'), hitbox: l1, hits: s.lightHits,
    hit: hit({ damage: 36 * P / s.lightHits, guard: 9 * g, hitstun: 19, blockstun: 12, kbx: 120, level: 1 }),
    groundOK: true, cancels: [id('light2'), ...lightCancels], cancelOnBlock: true, range: [0, maxRange(l1)], yRange: [-60, 40],
    sfx: 'hit_light', whiffSfx: swing, lungeStartup: 180,
  });
  const l2 = cap(10, -66, 8 + ARM + L, -92, 15);
  moves.push({
    id: id('light2'), name: 'Returning Edge', kind: 'light', startup: frames(7, sp), active: 3, recovery: frames(13, sp),
    height: 'mid', clip: clip('light2'), hitbox: l2, hits: s.lightHits,
    hit: hit({ damage: 38 * P / s.lightHits, guard: 10 * g, hitstun: 20, blockstun: 12, kbx: 140, level: 1 }),
    groundOK: true, cancels: [s.longChain ? id('light3') : id('light3'), ...lightCancels], cancelOnBlock: true,
    range: [0, maxRange(l2)], yRange: [-60, 40], sfx: 'hit_light', whiffSfx: swing, lungeStartup: 200,
  });
  const l3 = cap(10, -36, 10 + ARM + L * 1.05, -112, 17);
  moves.push({
    id: id('light3'), name: s.longChain ? 'Tempest Flurry' : 'Rising Crescent', kind: 'light', startup: frames(9, sp), active: 4,
    recovery: frames(17, sp), height: 'mid', clip: clip('light3'), hitbox: l3, hits: s.lightHits,
    hit: hit({ damage: (s.longChain ? 40 : 54) * P / s.lightHits, guard: 14 * g, hitstun: s.longChain ? 21 : 24, blockstun: 14, kbx: s.longChain ? 160 : 420, kby: s.longChain ? 0 : -160, level: 2 }),
    groundOK: true, cancels: s.longChain ? [id('light4'), ...lightCancels] : ['*ability', 'kiblast', 'vanish', id('launcher')], cancelOnBlock: true,
    range: [0, maxRange(l3)], yRange: [-80, 40], sfx: 'hit_medium', whiffSfx: swing, lungeStartup: 240,
  });
  if (s.longChain) {
    const l4 = cap(10, -80, 14 + ARM + L * 1.1, -76, 18);
    moves.push({
      id: id('light4'), name: 'Hundred-Fist Finale', kind: 'light', startup: frames(10, sp), active: 5, recovery: frames(18, sp),
      height: 'mid', clip: clip('light4'), hitbox: l4, hits: 2,
      hit: hit({ damage: 64 * P / 2, guard: 16 * g, hitstun: 26, blockstun: 14, kbx: 520, kby: -180, level: 2 }),
      groundOK: true, cancels: ['*ability', 'kiblast', 'vanish'], cancelOnBlock: false, range: [0, maxRange(l4)], yRange: [-80, 40],
      sfx: 'hit_medium', whiffSfx: swing, lungeStartup: 260,
    });
  }
  const hv = cap(12, -128, 16 + ARM + L * 1.05, -36, 19);
  moves.push({
    id: id('heavy'), name: s.id === 'katana' ? 'Iai: Severing Dawn' : s.id === 'gauntlets' ? 'Shockwave Hammer' : 'Sundering Overhead',
    kind: 'heavy', startup: frames(s.id === 'katana' ? 14 : 17, sp), active: 4, recovery: frames(24, sp),
    height: 'overhead', clip: clip('heavy'), hitbox: hv, armor: s.heavyArmor, chargeable: 22, feintable: true,
    hit: hit({ damage: 98 * P, guard: 36 * g, hitstun: 30, blockstun: 20, kbx: 640, kby: -240, level: 3, wallBounce: true }),
    groundOK: true, cancels: ['*ability', 'vanish'], range: [0, maxRange(hv)], yRange: [-90, 40],
    sfx: 'hit_heavy', whiffSfx: 'whoosh_heavy', lungeStartup: 260,
  });
  const ln = cap(18, -16, 22 + ARM * 0.6 + L * 0.7, -158, 19);
  moves.push({
    id: id('launcher'), name: 'Skyward Reaver', kind: 'launcher', startup: frames(10, sp), active: 4, recovery: frames(22, sp),
    height: 'mid', clip: clip('launcher'), hitbox: ln,
    hit: hit({ damage: 58 * P, guard: 14 * g, hitstun: 44, blockstun: 14, kbx: s.launcherPull ? -40 : 50, kby: -1180, launch: true, level: 2 }),
    groundOK: true, jumpCancel: true, cancels: ['*ability', 'vanish', 'kiblast'], range: [0, maxRange(ln)], yRange: [-140, 30],
    sfx: 'hit_medium', whiffSfx: swing, lungeStartup: 160,
  });
  const sw = cap(s.sweepBothSides ? -ARM - L * 0.6 : 6, -12, 10 + ARM + L, -10, 16);
  moves.push({
    id: id('sweep'), name: 'Earthsplitter Sweep', kind: 'sweep', startup: frames(10, sp), active: 4, recovery: frames(20, sp),
    height: 'low', clip: clip('sweep'), hitbox: sw,
    hit: hit({ damage: 50 * P, guard: 14 * g, hitstun: 30, blockstun: 14, kbx: 140, kby: -460, knockdown: true, level: 2 }),
    groundOK: true, cancels: ['*ability', 'vanish'], range: [0, maxRange(sw)], yRange: [-30, 30],
    sfx: 'hit_medium', whiffSfx: swing, lungeStartup: 120,
  });
  const th = cap(10, -82, 18 + ARM + L * 1.12, -80, 14);
  moves.push({
    id: id('thrust'), name: s.id === 'spear' ? 'Heaven-Piercer' : 'Lunging Fang', kind: 'dashAttack',
    startup: frames(12, sp), active: 5, recovery: frames(20, sp), height: 'mid', clip: clip('thrust'), hitbox: th,
    lungeStartup: s.id === 'spear' ? 950 : 1050, feintable: true,
    hit: hit({ damage: 70 * P, guard: 20 * g, hitstun: 26, blockstun: 16, kbx: 540, kby: -120, level: 2, wallBounce: true }),
    groundOK: true, cancels: ['*ability', 'vanish', id('launcher')], range: [maxRange(th) - 40, maxRange(th) + 210], yRange: [-60, 30],
    sfx: 'hit_medium', whiffSfx: 'whoosh_heavy',
  });
  const a1 = cap(4, -92, 6 + ARM + L * 0.95, -58, 17);
  moves.push({
    id: id('air1'), name: 'Falling Petal', kind: 'air', startup: frames(6, sp), active: 4, recovery: frames(10, sp),
    height: 'mid', clip: clip('air1'), hitbox: a1, airOK: true, hits: s.lightHits,
    hit: hit({ damage: 34 * P / s.lightHits, guard: 9 * g, hitstun: 22, blockstun: 12, kbx: 140, kby: -260, level: 1 }),
    cancels: [id('air2'), id('airSlam'), '*ability', 'vanish', 'kiblast'], cancelOnBlock: true,
    range: [0, maxRange(a1)], yRange: [-110, 60], sfx: 'hit_light', whiffSfx: swing,
  });
  const a2 = cap(4, -36, 6 + ARM + L * 0.95, -104, 17);
  moves.push({
    id: id('air2'), name: 'Wheeling Talon', kind: 'air', startup: frames(7, sp), active: 4, recovery: frames(12, sp),
    height: 'mid', clip: clip('air2'), hitbox: a2, airOK: true, hits: s.lightHits,
    hit: hit({ damage: 40 * P / s.lightHits, guard: 10 * g, hitstun: 24, blockstun: 12, kbx: 200, kby: -300, level: 2 }),
    cancels: [id('airSlam'), '*ability', 'vanish', 'kiblast'], cancelOnBlock: true,
    range: [0, maxRange(a2)], yRange: [-110, 60], sfx: 'hit_medium', whiffSfx: swing,
  });
  const as = cap(8, -70, 14 + ARM * 0.5 + L * 0.7, 12, 21);
  moves.push({
    id: id('airSlam'), name: 'Meteor Spike', kind: 'airSlam', startup: frames(10, sp), active: 7, recovery: frames(16, sp),
    height: 'overhead', clip: clip('airSlam'), hitbox: as, airOK: true, riseActive: 900, slam: true,
    hit: hit({ damage: 74 * P, guard: 24 * g, hitstun: 34, blockstun: 18, kbx: 120, kby: 1500, groundBounce: true, level: 3 }),
    cancels: ['*ability', 'vanish'], range: [0, maxRange(as)], yRange: [-30, 260], sfx: 'hit_heavy', whiffSfx: 'whoosh_heavy',
  });
  const tw = cap(10, -82, 62, -62, 14);
  moves.push({
    id: id('throw'), name: s.id === 'gauntlets' ? 'Titan Suplex' : 'Godhand Seize', kind: 'throw',
    startup: 6, active: 3, recovery: 26, height: 'throw', clip: clip('throw'), hitbox: tw,
    hit: hit({ damage: 92 * s.throwPower, guard: 0, hitstun: 40, blockstun: 0, kbx: 520, kby: -620, knockdown: true, level: 3, unblockable: true }),
    groundOK: true, range: [0, 74], yRange: [-20, 20], sfx: 'throw_slam', whiffSfx: 'whoosh_light',
  });
  return moves;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = Object.fromEntries(
  SPECS.map((s) => {
    const moves = buildMoves(s);
    const light1 = moves[0];
    const idealRange = Math.max(70, (light1.range[1] - 14) * 0.85);
    const def: WeaponDef = {
      id: s.id, name: s.name, description: s.description, length: s.length, blade: s.blade, clipSet: s.clipSet,
      speed: s.speed, power: s.power, guardMult: s.guardMult, idealRange, moves,
    };
    return [s.id, def];
  }),
) as Record<WeaponId, WeaponDef>;

export const WEAPON_IDS: readonly WeaponId[] = SPECS.map((s) => s.id);

export function weaponMove(weapon: WeaponId, move: string): ActionDef | undefined {
  return WEAPONS[weapon].moves.find((m) => m.id === `${weapon}.${move}`);
}
