// Which original sound plays for what, taken from the pygame port
// (py-sealhunter weapons.py / enemies.py / objects.py / player.py).
// Pure data: no Web Audio here, so unit tests can check every referenced
// file exists in public/audio.
import type { EnemyType } from '../config/enemies';
import { WEAPON_ORDER, type WeaponId } from '../config/weapons';
import type { EventName } from '../core/Events';

/**
 * A sound reference: a file name without extension ('weapons/0/fire1'), or a
 * random group written as prefix + '*' ('misc/gib*' = misc/gib1..gib7).
 */
export type SoundRef = string;

export const isGroup = (ref: SoundRef): boolean => ref.endsWith('*');
export const groupPrefix = (ref: SoundRef): string => (isGroup(ref) ? ref.slice(0, -1) : ref);
/** Voice-limiting group of a file: its name without trailing digits. */
export const groupOf = (name: string): string => name.replace(/\d+$/, '');

/** Members of random group `prefix` (prefix followed only by digits), sorted by number. */
export function groupMembers(prefix: string, names: Iterable<string>): string[] {
  const out: { n: number; name: string }[] = [];
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length);
    if (/^\d+$/.test(rest)) out.push({ n: Number(rest), name });
  }
  return out.sort((a, b) => a.n - b.n).map((e) => e.name);
}

/** Sound directory of a weapon: weapons/<index in the original WEAPON_NAMES order>. */
export const weaponDir = (id: WeaponId): string => `weapons/${WEAPON_ORDER.indexOf(id)}`;

// Shell landing sounds (objects.py Shell bounce_sounds).
export const SHELL_SMALL = 'weapons/sshell*';
export const SHELL_NORMAL = 'weapons/shell*';
export const SHELL_SHOTGUN = 'weapons/shshell*';

export interface WeaponSoundDef {
  /** Played on the 'shot' event (the real discharge). */
  fire: SoundRef;
  /**
   * Reload sounds in the original's order (sorted glob, so 'reloadfinished'
   * is last): [0] at reload start, the rest every reload_ticks/(n-1) ticks.
   */
  reload: string[];
  /** Repeating reload sound restarted every `every` reload ticks (shotgun shells, launcher rounds). */
  insert?: { name: string; every: number };
  /** Sounds at fixed ticks of the fire cycle (vintage hammers before the delayed shot). */
  fireSeq?: { tick: number; name: string }[];
  /** Shell landing group for 'shellEject'. */
  shell?: SoundRef;
  /** Minigun: looped layers that join as the fire interval shrinks, wind-down after max heat. */
  spin?: { loops: { name: string; atFireTicks: number }[]; winddown: string; winddownAtFireTicks: number };
}

const R = (dir: number, ...names: string[]) => names.map((n) => `weapons/${dir}/${n}`);

export const WEAPON_SOUNDS: Record<WeaponId, WeaponSoundDef> = {
  pistol: { fire: 'weapons/0/fire1', reload: R(0, 'reload1', 'reload2', 'reloadfinished'), shell: SHELL_SMALL },
  // The port only used fire1; fire2 is the same shot recorded twice, used for variety.
  // Magnum shells are dumped on reload (Magnum.reload drops clip_size Normal shells).
  magnum: { fire: 'weapons/1/fire*', reload: R(1, 'reload1', 'reload2', 'reload3', 'reloadfinished'), shell: SHELL_NORMAL },
  mp5: { fire: 'weapons/2/fire1', reload: R(2, 'reload1', 'reload2', 'reloadfinished'), shell: SHELL_SMALL },
  grenades: { fire: 'weapons/3/fire1', reload: R(3, 'reloadfinished') },
  shotgun: {
    fire: 'weapons/4/fire1',
    reload: R(4, 'reload1', 'reloadfinished'),
    insert: { name: 'weapons/4/reload1', every: 20 },
    shell: SHELL_SHOTGUN,
  },
  mac10: { fire: 'weapons/5/fire1', reload: R(5, 'reload1', 'reload2', 'reloadfinished'), shell: SHELL_SMALL },
  // Flunk pulls reload2 out of the list and plays it every 30 ticks instead.
  flunk: { fire: 'weapons/6/fire1', reload: R(6, 'reload1', 'reloadfinished'), insert: { name: 'weapons/6/reload2', every: 30 } },
  m4: { fire: 'weapons/7/fire1', reload: R(7, 'reload1', 'reload2', 'reloadfinished'), shell: SHELL_NORMAL },
  awp: { fire: 'weapons/8/fire1', reload: R(8, 'boltpull', 'reload1', 'reload2', 'reloadfinished'), shell: SHELL_NORMAL },
  vintage: {
    fire: 'weapons/9/fire1',
    reload: R(9, 'reloadfinished'),
    fireSeq: [
      { tick: 0, name: 'weapons/9/load1' },
      { tick: 15, name: 'weapons/9/load2' },
    ],
    shell: SHELL_SHOTGUN,
  },
  minigun: {
    fire: 'weapons/10/fire1',
    reload: R(10, 'reload1', 'reload2', 'reload3', 'reload4', 'reloadfinished'),
    shell: SHELL_NORMAL,
    spin: {
      loops: [
        { name: 'weapons/10/fire2', atFireTicks: 6 },
        { name: 'weapons/10/fire3', atFireTicks: 4 },
      ],
      winddown: 'weapons/10/winddown',
      // fire_ticks = 13 - heat/2, so max heat (20) is a 3-tick interval.
      winddownAtFireTicks: 3,
    },
  },
};

export interface ScheduledSound {
  tick: number;
  name: string;
  /** Stop the previous instance first (pygame play_sound(snd, True)). */
  restart?: boolean;
}

/** Reload sounds by reload tick, exactly as weapons.py spreads them. */
export function reloadSchedule(id: WeaponId, reloadTicks: number): ScheduledSound[] {
  const def = WEAPON_SOUNDS[id];
  const list = def.reload;
  const out: ScheduledSound[] = [];
  if (list.length) out.push({ tick: 0, name: list[0] });
  if (list.length > 1) {
    const step = Math.floor(reloadTicks / (list.length - 1));
    if (step > 0) {
      for (let k = 1; k < list.length && k * step <= reloadTicks; k++) out.push({ tick: k * step, name: list[k] });
    }
  }
  if (def.insert && def.insert.every > 0) {
    for (let t = def.insert.every; t < reloadTicks; t += def.insert.every) {
      out.push({ tick: t, name: def.insert.name, restart: true });
    }
  }
  return out.sort((a, b) => a.tick - b.tick);
}

/** Fire-cycle sounds by fire tick (vintage only). */
export function fireSchedule(id: WeaponId): ScheduledSound[] {
  return (WEAPON_SOUNDS[id].fireSeq ?? []).map((s) => ({ tick: s.tick, name: s.name }));
}

export interface EnemySoundDef {
  spawn?: SoundRef;
  /** Spawn sound repeats at these tick ranges after spawning (penguin quacks twice). */
  spawnTicks?: [number, number][];
  death?: SoundRef;
  /** Pain cry ('enemyPain', or derived from hits, see AudioSystem). */
  pain?: SoundRef;
  /** Replaces misc/genhit for body hits (the activist's own hit cries). */
  bodyHit?: SoundRef;
  /** Pain cry straight from any single hit above this damage (walrus). */
  painOnHitAbove?: number;
}

export const ENEMY_SOUNDS: Record<EnemyType, EnemySoundDef> = {
  seal: { death: 'brunsal/death*', pain: 'brunsal/hit*' },
  fatseal: { death: 'vitsal/death*' },
  activist: { death: 'aktivist/death*', pain: 'aktivist/hit*', bodyHit: 'aktivist/hit*' },
  // The port left the cub silent; the original shipped salunge ("seal pup") death cries.
  cub: { death: 'salunge/death*' },
  penguin: { spawn: 'pingvin/quack*', spawnTicks: [[1, 3], [15, 25]] },
  bear: { spawn: 'isbjorn/spawn*', death: 'isbjorn/death*', pain: 'isbjorn/hit*' },
  turtle: {},
  walrus: { spawn: 'valross/morr*', death: 'valross/death1', pain: 'valross/hit*', painOnHitAbove: 50 },
};

export const SFX = {
  headshot: 'misc/headshot*',
  genhit: 'misc/genhit*',
  gib: 'misc/gib*',
  meat: 'misc/meat*',
  ricochet: 'padda/ric*',
  explosion: 'weapons/3/explosion',
  grenadeBounce: 'weapons/3/bounce*',
  weaponSwitch: 'weapons/reload',
  buy: 'ui/buygun',
  awpBuyLaugh: 'player/laugh1',
  jump: 'player/jump*',
  kick: 'player/kick',
  screamHit: 'player/scream-hit',
  screamDeath: 'player/scream-death',
  spout: 'aktivist/spout',
  panic: 'aktivist/panic',
  walrusCharge: 'valross/charge',
  walrusRush: 'valross/morr*',
  walrusDevour: 'valross/devour',
  /** Not in the original: a soft, pitched-down thud as the head retracts. */
  turtleHide: 'misc/meat*',
  saying: 'ui/saying',
  buttonMove: 'ui/buttonmove',
  change: 'ui/change',
} as const;

/** Nice-shot laughs: player/laugh<min(n, 8)>. */
export const LAUGHS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `player/laugh${n}`);
export const laughFor = (n: number): string => LAUGHS[Math.min(8, Math.max(1, Math.floor(n))) - 1];

/** Thresholds (original rules). */
export const RULES = {
  /** player.py: scream-hit when more than 100 damage lands in one tick. */
  screamHitDamage: 100,
  /** Aktivist RunningNoSeal frame 6 at ticks_step 2. */
  panicDelayTicks: 12,
  /** Bruns: pain cry when one tick's damage exceeds half the starting life. */
  sealPainFraction: 0.5,
};

const values = <T>(r: Record<string, T>) => Object.values(r);
const enemyRefs = (k: keyof EnemySoundDef) =>
  values(ENEMY_SOUNDS)
    .map((d) => d[k])
    .filter((v): v is string => typeof v === 'string');

/** Event → every sound the binding may play for it (documentation + tests). */
export const EVENT_SOUNDS: Partial<Record<EventName, SoundRef[]>> = {
  shot: WEAPON_ORDER.map((w) => WEAPON_SOUNDS[w].fire),
  hit: [SFX.headshot, SFX.genhit, ...enemyRefs('bodyHit'), ...enemyRefs('pain')],
  ricochet: [SFX.ricochet],
  enemyDeath: [SFX.gib, SFX.meat, SFX.kick, ...enemyRefs('death')],
  enemySpawn: enemyRefs('spawn'),
  enemyPain: enemyRefs('pain'),
  cubShotOut: [SFX.spout, SFX.panic],
  explosion: [SFX.explosion],
  grenadeBounce: [SFX.grenadeBounce],
  shellEject: [SHELL_SMALL, SHELL_NORMAL, SHELL_SHOTGUN],
  buy: [SFX.buy, SFX.awpBuyLaugh],
  weaponSwitch: [SFX.weaponSwitch],
  niceShot: LAUGHS,
  playerHurt: [SFX.screamHit],
  playerJump: [SFX.jump],
  playerKick: [SFX.kick],
  playerDeath: [SFX.screamDeath],
  walrusCharge: [SFX.walrusCharge],
  walrusRush: [SFX.walrusRush],
  walrusDevour: [SFX.walrusDevour],
  turtleHide: [SFX.turtleHide],
  levelSplash: [SFX.saying],
  gameOver: [SFX.screamDeath],
};

/** Events deliberately left silent, with the reason. */
export const SILENT_EVENTS: Partial<Record<EventName, string>> = {
  reloadStart: 'reload sounds follow weaponTick',
  reloadEnd: 'reload sounds follow weaponTick',
  reloadStep: 'reload sounds follow weaponTick',
  weaponCock: 'vintage hammers follow weaponTick',
  clipDrop: 'clips had no bounce sound',
  crawlStart: 'silent in the original (pain comes from the hit)',
  cubDropped: 'silent in the original',
  cubSniff: 'silent in the original',
  enemyEscaped: 'silent in the original',
  money: 'silent in the original',
  playerKnocked: 'hurt scream comes from playerHurt',
  playerLaunched: 'hurt scream comes from playerHurt',
  playerLand: 'silent in the original',
  bearRage: 'pain comes from enemyPain',
  levelStart: 'tracks the level number only',
  bossSpawn: 'boss growls come from enemySpawn',
  levelComplete: 'silent in the original',
  victory: 'silent in the original',
};

/** Sounds driven by AudioSystem.weaponTick (reloads, inserts, hammers, minigun spin). */
export const WEAPON_TICK_SOUNDS: string[] = WEAPON_ORDER.flatMap((w) => {
  const d = WEAPON_SOUNDS[w];
  return [
    ...d.reload,
    ...(d.insert ? [d.insert.name] : []),
    ...(d.fireSeq ?? []).map((s) => s.name),
    ...(d.spin ? [...d.spin.loops.map((l) => l.name), d.spin.winddown] : []),
  ];
});

/** Every reference used anywhere by the audio system. */
export function allSoundRefs(): SoundRef[] {
  const refs = new Set<SoundRef>([
    ...Object.values(EVENT_SOUNDS).flat(),
    ...WEAPON_TICK_SOUNDS,
    ...Object.values(SFX),
    ...LAUGHS,
  ]);
  return [...refs];
}
