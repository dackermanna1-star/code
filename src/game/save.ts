// SaveAndSeedSystem: "Save & Quit" / "Continue" for a run in progress, stored in IndexedDB.
// A world is a pure function of its seed, so a save only needs the seed plus everything that has
// diverged from generation: modified chunks, which chunks already handed out their spawns, the
// creatures and pickups that exist now, and the player's inventory, perks and progression.
// Like Noita, a run is single-life: the save is deleted when the player dies or starts a new game.
import { Chunk } from '../world/chunk';
import { chunkKey } from '../world/world';
import { MATERIALS } from '../world/materials';
import { Wand } from '../magic/casting';
import type { SpellInstance, WandStats } from '../magic/types';
import type { DamageType, StatusState } from '../entities/creature';
import type { PickupKind } from '../entities/pickups';
import { Rng } from '../core/rng';
import { makePotion, Potion } from './inventory';
import type { ProgressionSave } from './progression';
import type { Run } from './run';

export const SAVE_VERSION = 1;

interface WandSave {
  stats: WandStats;
  spells: (SpellInstance | null)[];
  alwaysCast: string[];
  mana: number;
}
/** Potions store material names so saves survive changes to the material table order. */
type PotionSave = { contents: [string, number][]; capacity: number };

interface PickupSave {
  kind: PickupKind;
  x: number; y: number; z: number;
  gold?: number; tier?: number; perk?: string; price: number; life: number; floating: boolean;
  baseY: number; layer: number; label: string;
  spell?: { id: string; uses: number };
  wand?: WandSave;
  potion?: PotionSave;
}

interface EnemySave {
  type: string;
  x: number; y: number; z: number; yaw: number;
  hp: number; maxHp: number;
  morphFrom: { type: string; hpFrac: number; remaining: number } | null;
}

export interface SaveData {
  version: number;
  /** names of the material table the chunk data was written with */
  materials: string;
  savedAt: number;
  seed: number;
  time: number;
  elapsed: number;
  kills: number;
  orbs: number;
  goldDust: number;
  player: {
    x: number; y: number; z: number; yaw: number; pitch: number;
    hp: number; maxHp: number; gold: number; levitation: number; levitationMax: number;
    speedMult: number; levSpeedMult: number; mult: Partial<Record<DamageType, number>>; bloodMat: string;
    stainless: boolean; status: StatusState;
  };
  inventory: { selected: number; wands: (WandSave | null)[]; items: (PotionSave | null)[]; spells: (SpellInstance | null)[] };
  progression: ProgressionSave;
  spawned: number[];
  chunks: { cx: number; cy: number; cz: number; mat: Uint8Array; aux: Uint8Array | null; temp: Int16Array | null }[];
  enemies: EnemySave[];
  pickups: PickupSave[];
}

/** Short summary shown on the main menu. */
export interface SaveSummary {
  seed: number;
  depth: number;
  elapsed: number;
  savedAt: number;
}

const materialFingerprint = () => MATERIALS.map((m) => m.name).join(',');

const wandToSave = (w: Wand): WandSave => ({
  stats: { ...w.stats },
  spells: w.spells.map((s) => (s ? { ...s } : null)),
  alwaysCast: [...w.alwaysCast],
  mana: w.mana,
});
const wandFromSave = (d: WandSave): Wand => {
  const w = new Wand({ ...d.stats }, d.spells.map((s) => (s ? { ...s } : null)), [...d.alwaysCast]);
  w.mana = d.mana;
  return w;
};
const potionToSave = (p: Potion): PotionSave => ({
  contents: [...p.contents].map(([m, n]) => [MATERIALS[m].name, n]),
  capacity: p.capacity,
});
const potionFromSave = (d: PotionSave): Potion => {
  const p = makePotion(null);
  p.capacity = d.capacity;
  for (const [name, n] of d.contents) {
    const id = MATERIALS.findIndex((m) => m.name === name);
    if (id >= 0) p.contents.set(id, n);
  }
  return p;
};

/** Snapshot a run. */
export function serializeRun(run: Run): SaveData {
  const g = run.game;
  const p = g.player;
  const chunks = g.streamer.modifiedChunks().map((c) => ({
    cx: c.cx, cy: c.cy, cz: c.cz,
    mat: c.mat.slice(),
    aux: c.aux ? c.aux.slice() : null,
    temp: c.temp ? c.temp.slice() : null,
  }));
  const enemies: EnemySave[] = run.enemies.list.filter((e) => e.alive).map((e) => ({
    type: e.def.id, x: e.body.x, y: e.body.y, z: e.body.z, yaw: e.yaw, hp: e.hp, maxHp: e.maxHp,
    morphFrom: e.morphFrom ? { type: e.morphFrom.type, hpFrac: e.morphFrom.hpFrac, remaining: e.morphFrom.until - g.time } : null,
  }));
  const pickups: PickupSave[] = run.pickups.list.filter((k) => !k.dead).map((k) => ({
    kind: k.kind, x: k.body.x, y: k.body.y, z: k.body.z,
    gold: k.gold, tier: k.tier, perk: k.perk, price: k.price, life: k.life, floating: k.floating,
    baseY: k.baseY, layer: k.layer, label: k.label,
    spell: k.spell ? { ...k.spell } : undefined,
    wand: k.wand ? wandToSave(k.wand) : undefined,
    potion: k.potion ? potionToSave(k.potion) : undefined,
  }));
  return {
    version: SAVE_VERSION,
    materials: materialFingerprint(),
    savedAt: Date.now(),
    seed: g.opts.seed,
    time: g.time,
    elapsed: (performance.now() - run.startTime) / 1000,
    kills: run.kills,
    orbs: run.orbs,
    goldDust: run.goldDust,
    player: {
      x: p.body.x, y: p.body.y, z: p.body.z, yaw: p.yaw, pitch: p.pitch,
      hp: p.hp, maxHp: p.maxHp, gold: p.gold, levitation: p.levitation, levitationMax: p.levitationMax,
      speedMult: p.speedMult, levSpeedMult: p.levSpeedMult, mult: { ...p.mult }, bloodMat: p.bloodMat,
      stainless: !!(p as unknown as { stainless?: boolean }).stainless, status: { ...p.status },
    },
    inventory: {
      selected: run.inv.selected,
      wands: run.inv.wands.map((w) => (w ? wandToSave(w) : null)),
      items: run.inv.items.map((it) => (it ? potionToSave(it) : null)),
      spells: run.inv.spells.map((s) => (s ? { ...s } : null)),
    },
    progression: run.progression.toSave(),
    spawned: g.streamer.spawnedKeys(),
    chunks,
    enemies,
    pickups,
  };
}

/** Why a save cannot be loaded, or null if it can. */
export function saveIncompatibility(d: SaveData): string | null {
  if (d.version !== SAVE_VERSION) return 'The saved run is from an older version of the game.';
  if (d.materials !== materialFingerprint()) return 'The saved run was made with a different material set.';
  return null;
}

/**
 * Apply a save to a freshly constructed Run of the same seed, before the world preloads.
 * Replaces the starting inventory, restores terrain, creatures, pickups and progression.
 */
export function applySave(run: Run, d: SaveData): void {
  const g = run.game;
  const p = g.player;
  g.time = d.time;
  run.kills = d.kills;
  run.orbs = d.orbs;
  run.goldDust = d.goldDust;
  run.startTime = performance.now() - d.elapsed * 1000;
  // player
  const s = d.player;
  p.body.x = s.x; p.body.y = s.y; p.body.z = s.z;
  p.body.vx = p.body.vy = p.body.vz = 0;
  p.yaw = s.yaw; p.pitch = s.pitch;
  p.eyeY = s.y + p.eyeHeight();
  p.hp = s.hp; p.maxHp = s.maxHp; p.gold = s.gold;
  p.levitation = s.levitation; p.levitationMax = s.levitationMax;
  p.speedMult = s.speedMult; p.levSpeedMult = s.levSpeedMult;
  p.mult = { ...s.mult };
  p.bloodMat = s.bloodMat;
  if (s.stainless) (p as unknown as { stainless: boolean }).stainless = true;
  Object.assign(p.status, s.status);
  // inventory
  run.inv.wands = d.inventory.wands.map((w) => (w ? wandFromSave(w) : null));
  run.inv.items = d.inventory.items.map((it) => (it ? potionFromSave(it) : null));
  run.inv.spells = d.inventory.spells.map((x) => (x ? { ...x } : null));
  run.inv.select(d.inventory.selected);
  run.progression.fromSave(d.progression);
  // terrain and spawn bookkeeping
  g.streamer.restore(
    d.chunks.map((c) => {
      const ch = new Chunk(c.cx, c.cy, c.cz, chunkKey(c.cx, c.cy, c.cz), c.mat);
      ch.aux = c.aux;
      ch.temp = c.temp;
      return ch;
    }),
    d.spawned,
  );
  // creatures and pickups (they sleep until their chunks load)
  for (const e of d.enemies) {
    const n = run.enemies.spawn(e.type, e.x, e.y, e.z, 0, new Rng(((e.x * 73856093) ^ (e.z * 19349663) ^ (e.y * 83492791)) >>> 0));
    if (!n) continue;
    n.maxHp = e.maxHp;
    n.hp = e.hp;
    n.yaw = e.yaw;
    if (e.morphFrom) n.morphFrom = { type: e.morphFrom.type, hpFrac: e.morphFrom.hpFrac, until: g.time + e.morphFrom.remaining };
  }
  for (const k of d.pickups) {
    run.pickups.add(k.kind, k.x, k.y, k.z, {
      gold: k.gold, tier: k.tier, perk: k.perk, price: k.price, life: k.life, floating: k.floating,
      baseY: k.baseY, layer: k.layer, label: k.label,
      spell: k.spell ? { ...k.spell } : undefined,
      wand: k.wand ? wandFromSave(k.wand) : undefined,
      potion: k.potion ? potionFromSave(k.potion) : undefined,
    });
  }
}

// ------------------------------------------------------------------ IndexedDB storage
const DB = 'noita3d';
const STORE = 'saves';
const KEY = 'current';
const SUMMARY_KEY = 'noita3d.saveSummary';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function writeSave(d: SaveData): Promise<void> {
  await tx('readwrite', (s) => s.put(d, KEY));
  const sum: SaveSummary = { seed: d.seed, depth: Math.max(0, Math.round(1920 - d.player.y)), elapsed: d.elapsed, savedAt: d.savedAt };
  try {
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(sum));
  } catch {
    /* summary is only cosmetic */
  }
}

export async function readSave(): Promise<SaveData | null> {
  try {
    return ((await tx('readonly', (s) => s.get(KEY))) as SaveData | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearSave(): Promise<void> {
  try {
    localStorage.removeItem(SUMMARY_KEY);
  } catch {
    /* ignore */
  }
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    /* storage unavailable */
  }
}

/** Synchronous check for the main menu (the full save lives in IndexedDB). */
export function saveSummary(): SaveSummary | null {
  try {
    const raw = localStorage.getItem(SUMMARY_KEY);
    return raw ? (JSON.parse(raw) as SaveSummary) : null;
  } catch {
    return null;
  }
}
