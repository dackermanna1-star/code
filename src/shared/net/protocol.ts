import type { ClientRules } from '../config';
import type { MoveInput } from '../sim/movement';
import type { ItemStack } from '../sim/inventory';
import type { Socket } from '../sim/buildgeom';

/**
 * Protocol between the client (rendering/UI thread) and the simulation
 * (integrated server in a Web Worker). Messages are plain objects; bulk
 * chunk data travels as binary frames with a 1-byte type tag (BIN_*).
 * Every C2S message is a *request* that the simulation validates against
 * its own state — the UI can never directly mutate game state, which
 * keeps the rules in one place and the door open for multiplayer later.
 */

export const BIN_CHUNK = 1;

export type ContainerRef = 'main' | 'belt' | 'wear' | 'loot';

// ---------------------------------------------------------------- client -> server
export type C2S =
  | { t: 'pause'; on: boolean }
  | { t: 'save' }
  | { t: 'in'; cmds: MoveInput[] }
  | { t: 'swing'; yaw: number; pitch: number }
  | { t: 'interact'; yaw: number; pitch: number }
  | { t: 'place'; yaw: number; pitch: number }
  | { t: 'build'; piece: string; yaw: number; pitch: number; rot: number; tier?: number }
  | { t: 'buildpreview'; piece: string; yaw: number; pitch: number; rot: number }
  | { t: 'hammer'; mode: 'upgrade' | 'repair' | 'demolish' | 'rotate'; yaw: number; pitch: number; tier?: number }
  | { t: 'inspect'; yaw: number; pitch: number }
  | { t: 'fire'; yaw: number; pitch: number; ct: number }
  | { t: 'reload' }
  | { t: 'throw'; yaw: number; pitch: number }
  | { t: 'consume' }
  | { t: 'select'; slot: number }
  | { t: 'inv'; op: 'move'; from: [ContainerRef, number]; to: [ContainerRef, number]; n?: number }
  | { t: 'inv'; op: 'quick'; from: [ContainerRef, number] }
  | { t: 'inv'; op: 'drop'; from: [ContainerRef, number]; n?: number }
  | { t: 'craft'; id: string; qty: number }
  | { t: 'cancelCraft'; idx: number }
  | { t: 'close' }
  | { t: 'research' }
  | { t: 'lock'; op: 'set' | 'enter' | 'remove'; code?: string }
  | { t: 'totem'; op: 'auth' | 'deauth' | 'clear' }
  | { t: 'respawn'; bag?: number }
  | { t: 'chat'; text: string }
  | { t: 'ping'; ct: number }
  | { t: 'drink'; yaw: number; pitch: number }
  | { t: 'toggle' }
  /** Cheat: set god mode (omit `on` to toggle). Needs the world's cheats flag. */
  | { t: 'god'; on?: boolean }
  /** Turn the world's cheats flag on or off (singleplayer: the player owns the world). */
  | { t: 'cheats'; on: boolean };

// ---------------------------------------------------------------- server -> client
export interface EntSnap {
  id: number;
  /** kind: p=player, a=animal, x=explosive, i=item drop, c=corpse */
  k: 'p' | 'a' | 'x' | 'i' | 'c';
  x: number;
  y: number;
  z: number;
  yaw?: number;
  pitch?: number;
  /** player/animal: anim flags (1=crouch, 2=moving, 4=attacking, 8=sleeping, 16=wounded) */
  f?: number;
  /** Display name / species / item id */
  n?: string;
  /** held item id */
  h?: string;
  /** health fraction 0..1 (animals) */
  hp?: number;
  /** wear items (players) */
  w?: string[];
}

export interface VitalsMsg {
  t: 'vitals';
  hp: number;
  cal: number;
  hyd: number;
  /** effective body temperature feel in °C (air temp + clothing + fire) */
  temp: number;
  /** current radiation exposure (rads) */
  rad: number;
  bleed: number;
  wet: number;
  /** status flags: cold, hot, starving, dehydrated, poisoned, radiation, bleeding, building privilege */
  fx: string[];
  /** Building privilege state at position: 0 none, 1 authorized, 2 blocked */
  bp: number;
}

export interface LootView {
  id: number;
  kind: string;
  title: string;
  slots: (ItemStack | null)[];
  /** extra UI info (furnace burning, upkeep time, research cost ...) */
  info?: Record<string, unknown>;
}

export interface InvMsg {
  t: 'inv';
  main: (ItemStack | null)[];
  belt: (ItemStack | null)[];
  wear: (ItemStack | null)[];
  sel: number;
  loot: LootView | null;
}

export interface PieceInfo {
  type: string;
  tier: number;
  hp: number;
  maxHp: number;
  stability: number;
  owner: string;
  canDemolish: boolean;
  upgradeCost?: Array<[string, number]>;
  repairCost?: Array<[string, number]>;
  blocked?: string;
}

export type S2C =
  | { t: 'welcome'; id: number; name: string; seed: number; time: number; rules: ClientRules; pos: [number, number, number] }
  | { t: 'rules'; rules: ClientRules }
  | { t: 'fatal'; reason: string }
  | { t: 'saved'; ms: number }
  | { t: 'unload'; keys: Array<[number, number]> }
  | { t: 'blocks'; list: Array<[number, number, number, number]> }
  | { t: 'snap'; st: number; ack: number; me: [number, number, number, number, number, number, number] ; ents: EntSnap[]; gone?: number[] }
  | VitalsMsg
  | InvMsg
  | { t: 'craftq'; q: Array<{ id: string; n: number; left: number; total: number }> }
  | { t: 'bps'; list: string[] }
  | { t: 'msg'; text: string; kind: 'info' | 'error' | 'chat' | 'kill' | 'system'; from?: string }
  | { t: 'fx'; k: string; x: number; y: number; z: number; a?: number; b?: number; s?: string }
  | { t: 'died'; by: string; pos: [number, number, number]; bags: Array<{ id: number; name: string; cooldown: number; pos: [number, number, number] }> }
  | { t: 'spawned'; pos: [number, number, number] }
  | { t: 'time'; time: number; weather: number }
  | { t: 'pong'; ct: number; st: number }
  | { t: 'piece'; info: PieceInfo | null }
  | { t: 'ghost'; socket: Socket | null; ok: boolean; reason?: string }
  | { t: 'map'; pois: Array<{ name: string; x: number; z: number; tier: string }> }
  | { t: 'hitmark'; head?: boolean; kill?: boolean; structure?: boolean }
  | { t: 'hurt'; from?: number; amount: number }
  | { t: 'correct'; pos: [number, number, number] }
  | { t: 'gather'; item: string; n: number }
  | { t: 'lockui'; mode: 'set' | 'enter' }
  | { t: 'stats'; text: string };

/** Encode a binary chunk frame: [type u8][cx i32][cz i32][rev u32][rle...]. */
export function encodeChunkFrame(cx: number, cz: number, rev: number, rle: Uint8Array): Uint8Array {
  const out = new Uint8Array(13 + rle.length);
  const dv = new DataView(out.buffer);
  out[0] = BIN_CHUNK;
  dv.setInt32(1, cx, true);
  dv.setInt32(5, cz, true);
  dv.setUint32(9, rev >>> 0, true);
  out.set(rle, 13);
  return out;
}

export function decodeChunkHeader(buf: Uint8Array): { cx: number; cz: number; rev: number; offset: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { cx: dv.getInt32(1, true), cz: dv.getInt32(5, true), rev: dv.getUint32(9, true), offset: 13 };
}
