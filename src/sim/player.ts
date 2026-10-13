import { EYE_HEIGHT, CROUCH_EYE_HEIGHT, newMoveState, type MoveInput, type MoveState } from '../shared/sim/movement';
import { PlayerInventory, type ItemStack } from '../shared/sim/inventory';
import { newVitals, type Vitals } from '../shared/sim/vitals';
import { tryItemDef, WEAR_SLOTS } from '../shared/data/items';
import type { EntSnap } from '../shared/net/protocol';
import type { Link } from './link';

export interface CraftJob {
  id: string;
  /** Remaining number of crafts. */
  n: number;
  total: number;
  /** Seconds left on the current unit. */
  left: number;
  /** Ingredients consumed per unit (for refunds). */
  ing: Array<[string, number]>;
}

export interface HistSample {
  t: number;
  x: number;
  y: number;
  z: number;
  c: boolean;
}

/** What the player currently has open in the loot pane. */
export type LootTarget =
  | { kind: 'block'; key: string }
  | { kind: 'entity'; id: number };

export class Player {
  readonly kind = 'p' as const;
  readonly dynamic = true;
  removed = false;
  link: Link | null = null;
  move: MoveState;
  yaw = 0;
  pitch = 0;
  inputQueue: MoveInput[] = [];
  lastSeq = 0;
  moveBudget = 0;
  inv = new PlayerInventory();
  sel = 0;
  vitals: Vitals = newVitals();
  alive = true;
  deadAt = 0;
  killedBy = '';
  blueprints = new Set<string>();
  craftQueue: CraftJob[] = [];
  loot: LootTarget | null = null;
  lastSwing = 0;
  lastFire = 0;
  reloadUntil = 0;
  useUntil = 0;
  history: HistSample[] = [];
  rtt = 0.1;
  sentChunks = new Set<number>();
  /** Entities this client knows: id -> version */
  known = new Map<number, number>();
  flags: string[] = [];
  bp = 0;
  /** Change detection for replication. */
  invSig = '';
  vitalsSig = '';
  craftSig = '';
  /** Server time the player's chunk area became ready (spawn gating). */
  ready = false;
  lastPieceInspect = 0;
  /** Status: currently drinking/eating/healing until time */
  pendingUse: { item: string; slot: number; until: number } | null = null;
  lastDamagedBy = '';
  lastDamageTime = 0;
  lastHurtDir = 0;
  kills = 0;
  deaths = 0;
  /** Exploit guard: time of last chat message */
  lastChat = 0;
  ver = 0;
  lockTarget: { kind: 'piece'; id: number } | { kind: 'tile'; key: string } | null = null;
  lastCodeTry = 0;
  pendingReload: { slot: number; type: string } | null = null;
  underwater = 0;
  lastDrink = 0;
  lastPreview = 0;

  constructor(readonly id: number, readonly name: string, x: number, y: number, z: number) {
    this.move = newMoveState(x, y, z);
  }

  get x() { return this.move.x; }
  get y() { return this.move.y; }
  get z() { return this.move.z; }

  eye(): [number, number, number] {
    return [this.move.x, this.move.y + (this.move.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT), this.move.z];
  }

  held(): ItemStack | null {
    return this.inv.belt.get(this.sel);
  }


  wearIds(): string[] {
    return this.inv.wear.slots.map((s) => s?.id ?? '');
  }

  armor(type: string): number {
    let p = 0;
    for (const s of this.inv.wear.slots) {
      const d = s && tryItemDef(s.id);
      if (d?.clothing) p += d.clothing.protection[type as keyof typeof d.clothing.protection] ?? 0;
    }
    return Math.min(0.8, p);
  }

  warmth(): number {
    let w = 0;
    for (const s of this.inv.wear.slots) {
      const d = s && tryItemDef(s.id);
      if (d?.clothing) w += d.clothing.warmth;
    }
    return w;
  }

  radProtection(): number {
    let r = 0;
    for (const s of this.inv.wear.slots) {
      const d = s && tryItemDef(s.id);
      if (d?.clothing?.radiation) r = Math.max(r, d.clothing.radiation);
    }
    return r;
  }

  recordHistory(t: number) {
    this.history.push({ t, x: this.move.x, y: this.move.y, z: this.move.z, c: this.move.crouching });
    if (this.history.length > 30) this.history.shift();
  }

  /** Position at server time t (seconds) for lag compensation. */
  positionAt(t: number): HistSample {
    const h = this.history;
    if (!h.length || t >= h[h.length - 1].t) return { t, x: this.move.x, y: this.move.y, z: this.move.z, c: this.move.crouching };
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (t >= a.t) {
        const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: k < 0.5 ? a.c : b.c };
      }
    }
    return h[0];
  }

  snap(): EntSnap {
    let f = 0;
    if (this.move.crouching) f |= 1;
    if (Math.hypot(this.move.vx, this.move.vz) > 0.5) f |= 2;
    if (Date.now() / 1000 - this.lastSwing < 0.3 || Date.now() / 1000 - this.lastFire < 0.15) f |= 4;
    return {
      id: this.id,
      k: 'p',
      x: r2(this.move.x),
      y: r2(this.move.y),
      z: r2(this.move.z),
      yaw: r2(this.yaw),
      pitch: r2(this.pitch),
      f,
      n: this.name,
      h: this.held()?.id,
      w: this.wearIds(),
    };
  }

  toSave() {
    return {
      x: this.move.x, y: this.move.y, z: this.move.z, yaw: this.yaw,
      inv: this.inv.toJSON(), sel: this.sel, vitals: this.vitals, alive: this.alive,
      blueprints: [...this.blueprints], kills: this.kills, deaths: this.deaths,
      craftQueue: this.craftQueue,
    };
  }

  load(d: ReturnType<Player['toSave']>) {
    this.move.x = d.x; this.move.y = d.y; this.move.z = d.z; this.yaw = d.yaw ?? 0;
    this.inv.load(d.inv);
    this.sel = d.sel ?? 0;
    this.vitals = { ...newVitals(), ...d.vitals };
    this.alive = d.alive !== false;
    this.blueprints = new Set(d.blueprints ?? []);
    this.kills = d.kills ?? 0;
    this.deaths = d.deaths ?? 0;
    this.craftQueue = Array.isArray(d.craftQueue) ? d.craftQueue.filter((j) => tryItemDef(j.id)) : [];
  }
}

export const r2 = (v: number) => Math.round(v * 100) / 100;
export { WEAR_SLOTS };
