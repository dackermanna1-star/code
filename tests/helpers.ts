/**
 * Shared test fixtures for the CORRODE simulation.
 *
 * - `flatStorage()` pre-seeds a MemoryStorage with a flat square of chunks
 *   (as if they had been edited and saved), so building/combat tests run on
 *   deterministic terrain without depending on world generation.
 * - `makeGame()` builds a Game with a quiet, fast, deterministic config and
 *   replaces the Date.now()-seeded RNGs with seeded ones.
 * - `spawnPlayer()` joins a player, moves them onto the test site and ticks
 *   until the simulation marks them ready.
 */
import { DEFAULT_CONFIG, mergeConfig, type WorldConfig } from '../src/shared/config';
import { CHUNK_SIZE } from '../src/shared/constants';
import { mulberry32 } from '../src/shared/math';
import { addToAny, countItem, makeStack, type Container } from '../src/shared/sim/inventory';
import { B } from '../src/shared/world/blocks';
import { CHUNK_VOLUME, cidx, chunkKey, rleEncode } from '../src/shared/world/chunk';
import { Game } from '../src/sim/game';
import { RecordingLink } from '../src/sim/link';
import { setLogLevel } from '../src/sim/log';
import type { Player } from '../src/sim/player';
import { MemoryStorage } from '../src/sim/storage';
import type { Socket } from '../src/shared/sim/buildgeom';
import type { MoveInput } from '../src/shared/sim/movement';
import type { Piece } from '../src/sim/systems/building';

export type { Piece };

setLogLevel('error');

/** y of the top solid block of the flat test terrain. */
export const GROUND = 60;
/** Flat chunks cover cx, cz in [-FLAT_R, FLAT_R). */
export const FLAT_R = 4;

export function flatChunkData(ground = GROUND): Uint8Array {
  const d = new Uint8Array(CHUNK_VOLUME);
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      d[cidx(x, 0, z)] = B.bedrock;
      for (let y = 1; y <= ground; y++) d[cidx(x, y, z)] = y === ground ? B.grass : y > ground - 3 ? B.dirt : B.stone;
    }
  }
  return d;
}

/** A storage whose chunks around the origin are flat ground at `GROUND`. */
export function flatStorage(ground = GROUND, r = FLAT_R): MemoryStorage {
  const st = new MemoryStorage();
  const data = rleEncode(flatChunkData(ground));
  for (let cz = -r; cz < r; cz++) for (let cx = -r; cx < r; cx++) st.chunks.set(chunkKey(cx, cz), { rev: 1, data });
  return st;
}

export const TEST_CONFIG: Partial<WorldConfig> = {
  seed: 'qa-seed',
  viewDistance: 1,
  animalDensity: 0,
  hostileNpcs: false,
  // Game.lastSave starts at 0, so any finite interval autosaves on the first tick (see persistence tests).
  saveIntervalSec: 1e12,
  genBudgetMs: 1000,
};

/** Replace every Date.now()-seeded RNG with a seeded one so outcomes are reproducible. */
export function seedRngs(game: Game, seed = 1) {
  (game as unknown as { rng: () => number }).rng = mulberry32(seed);
  (game.combat as unknown as { rnd: () => number }).rnd = mulberry32(seed + 1);
  (game.tiles as unknown as { rnd: () => number }).rnd = mulberry32(seed + 2);
  (game.wildlife as unknown as { rnd: () => number }).rnd = mulberry32(seed + 3);
}

export function makeGame(over: Partial<WorldConfig> = {}, storage: MemoryStorage = flatStorage()): Game {
  const cfg = mergeConfig(DEFAULT_CONFIG, { ...TEST_CONFIG, ...over });
  const game = new Game(cfg, storage);
  seedRngs(game);
  return game;
}

export function ticks(game: Game, n: number) {
  for (let i = 0; i < n; i++) game.tick();
}

export function seconds(game: Game, s: number) {
  ticks(game, Math.round(s * 20));
}

export function tickUntil(game: Game, cond: () => boolean, max = 400): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i;
    game.tick();
  }
  if (cond()) return max;
  throw new Error(`condition not reached after ${max} ticks`);
}

/**
 * Move a player instantly (like /tp). Also re-buckets them in the entity grid:
 * the simulation itself never does that for players (see the it.fails test in
 * combat.test.ts), and without it hit detection cannot find a moved player.
 */
export function teleport(game: Game, p: Player, x: number, y: number, z: number) {
  p.move.x = x;
  p.move.y = y;
  p.move.z = z;
  p.move.vx = p.move.vy = p.move.vz = 0;
  p.move.onGround = false;
  p.history = [];
  game.entities.updateCell(p);
}

/** Load the 3x3 chunks around the player and tick until the server marks them ready. */
export function settle(game: Game, p: Player) {
  const cx = Math.floor(p.x / CHUNK_SIZE), cz = Math.floor(p.z / CHUNK_SIZE);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) game.world.ensureSync(cx + dx, cz + dz);
  p.ready = false;
  tickUntil(game, () => p.ready, 100);
  // a few more ticks so the player lands and has a short position history
  ticks(game, 5);
}

export interface SpawnOpts {
  /** Keep the configured start items (rock, torch, bandage). Default: empty inventory. */
  keepStartItems?: boolean;
}

/** Join a player and place them standing on the flat ground at (x, z). */
export function spawnPlayer(game: Game, name: string, x: number, z: number, opts: SpawnOpts = {}): { p: Player; link: RecordingLink } {
  const link = new RecordingLink();
  const p = game.join(link, name);
  if (!opts.keepStartItems) p.inv.clear();
  teleport(game, p, x, GROUND + 1, z);
  settle(game, p);
  p.vitals.hp = 100;
  p.vitals.cal = 400;
  p.vitals.hyd = 200;
  return { p, link };
}

/** Yaw/pitch that point the player's eye at a world point. */
export function aimAt(p: Player, tx: number, ty: number, tz: number): { yaw: number; pitch: number } {
  const [ex, ey, ez] = p.eye();
  const dx = tx - ex, dy = ty - ey, dz = tz - ez;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Put an item stack in belt slot `slot` and select it. */
export function hold(p: Player, id: string, n = 1, slot = 0) {
  p.inv.belt.slots[slot] = makeStack(id, n);
  p.inv.belt.touch();
  p.sel = slot;
}

/** Add items to the main inventory (spilling over stacks as needed). */
export function give(p: Player, id: string, n: number) {
  const left = addToAny([p.inv.main, p.inv.belt], makeStack(id, n));
  if (left > 0) throw new Error(`no room for ${left} ${id}`);
}

export function count(p: Player, id: string): number {
  return countItem([p.inv.main, p.inv.belt, p.inv.wear], id);
}

/** Total count per item id across containers. */
export function totals(containers: Container[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of containers) for (const s of c.slots) if (s) m.set(s.id, (m.get(s.id) ?? 0) + s.n);
  return m;
}

/** Messages of kind 'error' a link received. */
export function errors(link: RecordingLink): string[] {
  return link.of('msg').filter((m) => m.kind === 'error').map((m) => m.text);
}

/** Allow the next melee/build/hammer action immediately (skip the swing cooldown). */
export function resetCooldowns(p: Player) {
  p.lastSwing = -1e9;
  p.lastFire = -1e9;
  p.lastPreview = -1e9;
  p.lastPieceInspect = -1e9;
  p.lastCodeTry = -1e9;
  p.lastDrink = -1e9;
}

/** Index of the first differing byte, or -1 (fast replacement for deep-equality on big typed arrays). */
export function firstDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

/**
 * Feed movement commands for `secs` seconds, like a client sending input every frame
 * (3 fixed 1/60 s steps per 1/20 s tick). The server only simulates a player's
 * physics for commands it receives, so an idle player must still send idle inputs.
 */
export function drive(game: Game, p: Player, secs: number, inp: Partial<MoveInput> = {}) {
  const n = Math.round(secs * 20);
  for (let t = 0; t < n; t++) {
    const cmds: MoveInput[] = [];
    for (let k = 0; k < 3; k++) {
      const seq = Math.max(p.lastSeq, sentSeq.get(p) ?? 0) + 1;
      sentSeq.set(p, seq);
      cmds.push({ seq, f: 0, s: 0, jump: false, sprint: false, crouch: false, yaw: p.yaw, pitch: p.pitch, ...inp });
    }
    game.handle(p, { t: 'in', cmds });
    game.tick();
  }
}
const sentSeq = new WeakMap<Player, number>();

// ------------------------------------------------------------------ building helpers

/** Floor-layer y for pieces built directly on the flat test ground. */
export const OY = GROUND + 1;

/** Place a piece by socket, throwing on a validation error. */
export function build(game: Game, owner: Player | null, s: Socket, tier = 0): Piece {
  const r = game.building.buildAt(owner, s, tier);
  if (typeof r === 'string') throw new Error(`buildAt(${JSON.stringify(s)}) failed: ${r}`);
  return r;
}

/** Swing the held item at the centre of a block. */
export function swingAt(game: Game, p: Player, x: number, y: number, z: number) {
  resetCooldowns(p);
  game.handle(p, { t: 'swing', ...aimAt(p, x + 0.5, y + 0.5, z + 0.5) });
}

/**
 * Place a Claim Totem through the real request path: the player holds it and
 * aims at the top face of the floor cell (x, oy, z). Returns the tile.
 */
export function placeTotem(game: Game, p: Player, x: number, oy: number, z: number) {
  hold(p, 'claim_totem', 1, 5);
  resetCooldowns(p);
  game.handle(p, { t: 'place', ...aimAt(p, x + 0.5, oy + 1 - 0.01, z + 0.5) });
  const t = game.tiles.at(x, oy + 1, z);
  if (!t || t.kind !== 'claim_totem') throw new Error('totem was not placed');
  return t;
}
