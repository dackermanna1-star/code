import { BUILD_PITCH, REACH, WORLD_HEIGHT } from '../../shared/constants';
import {
  BUILD_PIECES, DOORS, MIN_STABILITY, PIECES, PRIVILEGE_CELLS, PRIVILEGE_VERTICAL, TIERS, UPKEEP_BRACKETS,
  pieceCost, pieceMaxHp, type PieceType,
} from '../../shared/data/building';
import type { DamageType } from '../../shared/data/damage';
import { itemDef } from '../../shared/data/items';
import { dirFromAngles } from '../../shared/math';
import type { PieceInfo } from '../../shared/net/protocol';
import { FULL_WALL_TYPES, pieceGeometry, resolveSocket, slotKey, supportersOf, type PieceGeometry, type Socket } from '../../shared/sim/buildgeom';
import { countItem, removeAll, removeItem } from '../../shared/sim/inventory';
import { B, blockDef, DOOR_BLOCKS, SOLID, STRUCT_TIER_BLOCKS } from '../../shared/world/blocks';
import { raycastVoxels } from '../../shared/world/raycast';
import { PLAYER_HALF_WIDTH } from '../../shared/sim/movement';
import type { Game } from '../game';
import { log } from '../log';
import type { Player } from '../player';

export interface Lock {
  code: string;
  owner: string;
  authorized: string[];
}

export interface Piece {
  id: number;
  type: PieceType;
  socket: Socket;
  /** Structure tier 0..4, or door tier 0..2 for doors. */
  tier: number;
  hp: number;
  maxHp: number;
  owner: string;
  placedAt: number;
  lastDamaged: number;
  stability: number;
  building: number;
  open?: boolean;
  lock?: Lock;
  geom: PieceGeometry;
}

export interface BuildingRec {
  id: number;
  pieces: Set<number>;
  /** Tile key of the claim totem, if any. */
  totem: string | null;
  zone: { cells: Set<string>; yMin: number; yMax: number } | null;
  debt: Record<string, number>;
}

const ck = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * Modular building, stability, building privilege, upkeep & decay, doors.
 * See docs/DESIGN.md §Building for the rules this implements.
 */
export class Building {
  readonly pieces = new Map<number, Piece>();
  readonly buildings = new Map<number, BuildingRec>();
  private slots = new Map<string, number>();
  private cells = new Map<string, number>();
  private frames = new Map<string, Set<number>>();
  private zoneIndex = new Map<string, Set<number>>();
  private upkeepTimer = 0;
  private nextBuildingId = 1;

  constructor(private game: Game) {}

  // ---------------------------------------------------------------- queries
  pieceAt(x: number, y: number, z: number): Piece | null {
    const id = this.cells.get(ck(x, y, z));
    return id !== undefined ? this.pieces.get(id) ?? null : null;
  }

  /** Piece at a cell, or (for frame cells) one of the pieces claiming it. */
  pieceOrFrameAt(x: number, y: number, z: number): Piece | null {
    const p = this.pieceAt(x, y, z);
    if (p) return p;
    const f = this.frames.get(ck(x, y, z));
    if (f && f.size) return this.pieces.get([...f][0]) ?? null;
    return null;
  }

  isFrame(x: number, y: number, z: number) {
    return (this.frames.get(ck(x, y, z))?.size ?? 0) > 0;
  }

  /** Buildings whose privilege zone covers the position. */
  zonesAt(x: number, y: number, z: number): BuildingRec[] {
    const i = Math.floor(x / BUILD_PITCH), j = Math.floor(z / BUILD_PITCH);
    const ids = this.zoneIndex.get(`${i},${j}`);
    if (!ids) return [];
    const out: BuildingRec[] = [];
    for (const id of ids) {
      const b = this.buildings.get(id);
      if (b?.zone && y >= b.zone.yMin && y <= b.zone.yMax) out.push(b);
    }
    return out;
  }

  isAuthorizedOn(p: Player, b: BuildingRec): boolean {
    if (!b.totem) return true;
    return this.game.tiles.totemAuthorized(b.totem, p.name);
  }

  /** True if an unauthorized claim covers this position. */
  isBlocked(p: Player, x: number, y: number, z: number): boolean {
    return this.zonesAt(x, y, z).some((b) => !this.isAuthorizedOn(p, b));
  }

  /** 0 = no claim, 1 = authorized, 2 = blocked. */
  privilegeState(p: Player): number {
    const zs = this.zonesAt(p.x, p.y, p.z);
    if (!zs.length) return 0;
    return zs.some((b) => !this.isAuthorizedOn(p, b)) ? 2 : 1;
  }

  // ---------------------------------------------------------------- placement
  /** Validate a piece placement; returns an error string or null. */
  validate(p: Player | null, s: Socket, geom: PieceGeometry): string | null {
    const w = this.game.world;
    for (const slot of geom.slots) if (this.slots.has(slot)) return 'Something is already built there';
    const all = [...geom.cells, ...geom.holes];
    for (const [x, y, z] of all) {
      if (y < 1 || y >= WORLD_HEIGHT - 1) return 'Out of world bounds';
      w.ensureSyncAt(x, z);
    }
    for (const [x, y, z] of geom.cells) {
      const d = blockDef(w.getBlock(x, y, z));
      if (!d.replaceable) return 'Blocked by terrain or another object';
    }
    for (const [x, y, z] of geom.holes) {
      const d = blockDef(w.getBlock(x, y, z));
      if (d.solid) return 'Blocked by terrain or another object';
    }
    // nothing may be trapped inside new solid cells
    for (const e of this.game.entities.near(geom.center[0], geom.center[2], 6)) {
      if ((e.kind === 'p' || e.kind === 'a') && !e.removed) {
        for (const [x, y, z] of geom.cells) {
          if (x + 1 > e.x - PLAYER_HALF_WIDTH && x < e.x + PLAYER_HALF_WIDTH && z + 1 > e.z - PLAYER_HALF_WIDTH && z < e.z + PLAYER_HALF_WIDTH && y + 1 > e.y && y < e.y + 1.8) {
            return 'Something is in the way';
          }
        }
      }
    }
    if (s.type === 'foundation') {
      let grounded = 0;
      for (const [x, y, z] of geom.cells) {
        const below = w.getBlock(x, y - 1, z);
        if (SOLID[below] && blockDef(below).structureTier === undefined && !blockDef(below).deployable) grounded++;
      }
      if (grounded < 2) return 'Foundations must be placed on the ground';
    } else {
      const st = this.predictStability(s);
      if (st < MIN_STABILITY) return 'Not enough support';
    }
    if (p) {
      const [cx, cy, cz] = geom.center;
      if (this.isBlocked(p, cx, cy, cz)) return 'Building blocked';
      const connected = this.connectedBuildings(s, geom);
      const claimed = [...connected].map((id) => this.buildings.get(id)!).filter((b) => b.totem);
      if (claimed.length > 1) return 'Cannot join two claimed buildings';
      for (const b of claimed) if (!this.isAuthorizedOn(p, b)) return 'Building blocked';
    }
    return null;
  }

  /** Buildings a new piece would connect to. */
  private connectedBuildings(s: Socket, geom: PieceGeometry): Set<number> {
    const out = new Set<number>();
    for (const sup of supportersOf(s)) {
      const id = this.slots.get(sup.slot);
      if (id !== undefined) out.add(this.pieces.get(id)!.building);
    }
    if (s.type === 'foundation') {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = this.slots.get(slotKey(s.i + di, s.j + dj, s.oy, 'floor'));
        if (id !== undefined) out.add(this.pieces.get(id)!.building);
      }
    }
    // pieces that would be supported by this one (e.g. placing a floor under an existing wall)
    for (const slot of geom.slots) {
      for (const p of this.pieces.values()) {
        if (supportersOf(p.socket).some((x) => x.slot === slot)) out.add(p.building);
      }
      if (out.size > 4) break;
    }
    return out;
  }

  predictStability(s: Socket): number {
    let best = 0;
    for (const sup of supportersOf(s)) {
      const id = this.slots.get(sup.slot);
      if (id === undefined) continue;
      const q = this.pieces.get(id)!;
      if (sup.fullWallOnly && !FULL_WALL_TYPES.has(q.type)) continue;
      if (q.type === 'door') continue;
      best = Math.max(best, q.stability * sup.factor);
    }
    return best;
  }

  /**
   * Resolve the socket a player is aiming at for a piece type. Levels snap
   * to the nearest building's vertical grid so walls/floors line up.
   */
  resolveAim(p: Player, type: PieceType, yaw: number, pitch: number, rot: number): Socket | null {
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const hit = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, 8);
    if (!hit) return null;
    const hx = ex + d.x * hit.dist + hit.nx * 0.5;
    const hy = ey + d.y * hit.dist + hit.ny * 0.5;
    const hz = ez + d.z * hit.dist + hit.nz * 0.5;
    const base = this.nearestBase(hx, hy, hz);
    const levelOf = (_x: number, y: number) => {
      if (base === null) return null;
      return base + BUILD_PITCH * Math.floor((y - base) / BUILD_PITCH);
    };
    if (type === 'foundation') {
      const s = resolveSocket(type, hx, hy, hz, () => null, rot);
      if (!s) return null;
      if (base !== null && Math.abs(s.oy - base) <= 2) s.oy = base;
      return s;
    }
    return resolveSocket(type, hx, hy, hz, levelOf, rot);
  }

  /** Vertical grid base (foundation level mod pitch) of the nearest building piece within 10 blocks. */
  private nearestBase(x: number, y: number, z: number): number | null {
    let best: Piece | null = null, bd = 10;
    const i0 = Math.floor(x / BUILD_PITCH), j0 = Math.floor(z / BUILD_PITCH);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      for (const slot of ['floor', 'w', 'n', 'stair']) {
        for (let k = -3; k <= 3; k++) {
          const oy = Math.floor(y / BUILD_PITCH) * BUILD_PITCH + k * BUILD_PITCH;
          // sockets are keyed by exact oy; probe all residues
          for (let r = 0; r < BUILD_PITCH; r++) {
            const id = this.slots.get(slotKey(i0 + di, j0 + dj, oy + r, slot));
            if (id === undefined) continue;
            const q = this.pieces.get(id)!;
            const dist = Math.hypot(q.geom.center[0] - x, q.geom.center[1] - y, q.geom.center[2] - z);
            if (dist < bd) { bd = dist; best = q; }
          }
        }
      }
    }
    return best ? best.socket.oy : null;
  }

  preview(p: Player, typeRaw: string, yaw: number, pitch: number, rot: number) {
    const now = this.game.now;
    if (now - (p.lastPreview ?? 0) < 0.1) return;
    p.lastPreview = now;
    const type = typeRaw as PieceType;
    if (!BUILD_PIECES.includes(type)) return;
    const s = this.resolveAim(p, type, yaw, pitch, rot);
    if (!s) return p.link?.send({ t: 'ghost', socket: null, ok: false });
    const err = this.validate(p, s, pieceGeometry(s));
    p.link?.send({ t: 'ghost', socket: s, ok: !err, reason: err ?? undefined });
  }

  requestBuild(p: Player, typeRaw: string, yaw: number, pitch: number, rot: number, tierReq?: number) {
    const held = p.held();
    if (!held || held.id !== 'building_plan') return;
    const now = this.game.now;
    if (now - p.lastSwing < 0.25) return;
    p.lastSwing = now;
    const type = typeRaw as PieceType;
    if (!BUILD_PIECES.includes(type)) return;
    const raw = this.resolveAim(p, type, yaw, pitch, rot);
    const s = raw && sanitizeSocket(raw);
    if (!s) return this.game.msg(p, 'Nothing to build on there', 'error');
    const tier = Math.max(0, Math.min(4, Math.floor(Number(tierReq) || 0)));
    const geom = pieceGeometry(s);
    const [ex, ey, ez] = p.eye();
    if (Math.hypot(geom.center[0] - ex, geom.center[1] - ey, geom.center[2] - ez) > 9) return this.game.msg(p, 'Too far away', 'error');
    const err = this.validate(p, s, geom);
    if (err) return this.game.msg(p, err, 'error');
    const cost = pieceCost(s.type, tier);
    if (!removeAll(p.inv.all(), cost)) return this.game.msg(p, `Need ${cost.map(([k, n]) => `${n} ${itemDef(k).name}`).join(', ')}`, 'error');
    const piece = this.addPiece(s, tier, p.name);
    this.recomputeStability(piece.building);
    this.game.fx('build', geom.center[0], geom.center[1], geom.center[2], 40, { a: tier });
  }

  /** Place a piece by socket (tests, admin tools). Returns error or the piece. */
  buildAt(p: Player | null, s: Socket, tier = 0): Piece | string {
    const geom = pieceGeometry(s);
    const err = this.validate(p, s, geom);
    if (err) return err;
    const piece = this.addPiece(s, tier, p?.name ?? 'server');
    this.recomputeStability(piece.building);
    return piece;
  }

  /** Create a piece (no validation). Returns it. */
  addPiece(s: Socket, tier: number, owner: string, id = this.game.allocId()): Piece {
    const geom = pieceGeometry(s);
    const type = s.type;
    const maxHp = type === 'door' ? DOORS[tier].hp : pieceMaxHp(type, tier);
    const piece: Piece = {
      id, type, socket: s, tier, hp: maxHp, maxHp, owner, placedAt: Date.now(), lastDamaged: 0,
      stability: type === 'foundation' ? 1 : this.predictStability(s), building: 0, geom, open: type === 'door' ? false : undefined,
    };
    this.pieces.set(id, piece);
    for (const slot of geom.slots) this.slots.set(slot, id);
    for (const [x, y, z] of geom.cells) this.cells.set(ck(x, y, z), id);
    for (const [x, y, z] of geom.frames) {
      const k = ck(x, y, z);
      let set = this.frames.get(k);
      if (!set) this.frames.set(k, (set = new Set()));
      set.add(id);
    }
    // building membership
    const conn = [...this.connectedBuildings(s, geom)];
    let bid: number;
    if (!conn.length) {
      bid = this.nextBuildingId++;
      this.buildings.set(bid, { id: bid, pieces: new Set(), totem: null, zone: null, debt: {} });
    } else {
      bid = conn.find((b) => this.buildings.get(b)?.totem) ?? conn[0];
      for (const other of conn) if (other !== bid) this.mergeBuildings(bid, other);
    }
    piece.building = bid;
    this.buildings.get(bid)!.pieces.add(id);
    this.writePieceBlocks(piece);
    this.recomputeZone(bid);
    return piece;
  }

  private mergeBuildings(into: number, from: number) {
    const a = this.buildings.get(into)!, b = this.buildings.get(from);
    if (!b) return;
    for (const id of b.pieces) {
      a.pieces.add(id);
      this.pieces.get(id)!.building = into;
    }
    if (!a.totem && b.totem) a.totem = b.totem;
    this.dropZone(from);
    this.buildings.delete(from);
  }

  private blockForPiece(p: Piece): number {
    if (p.type === 'door') return p.open ? DOOR_BLOCKS[p.tier].open : DOOR_BLOCKS[p.tier].closed;
    return STRUCT_TIER_BLOCKS[p.tier];
  }

  private writePieceBlocks(p: Piece) {
    const w = this.game.world;
    const id = this.blockForPiece(p);
    for (const [x, y, z] of p.geom.cells) w.set(x, y, z, id);
    for (const [x, y, z] of p.geom.frames) this.refreshFrame(x, y, z);
  }

  /** Frame cell shows the highest tier among its claimers; vanishes when unclaimed. */
  private refreshFrame(x: number, y: number, z: number) {
    const w = this.game.world;
    const k = ck(x, y, z);
    const set = this.frames.get(k);
    const cur = w.getBlock(x, y, z);
    const curDef = blockDef(cur);
    const ours = curDef.structureTier !== undefined && !this.cells.has(k);
    if (!set || !set.size) {
      this.frames.delete(k);
      if (ours) w.set(x, y, z, B.air);
      return;
    }
    if (!ours && !curDef.replaceable) return; // terrain already fills it
    let tier = 0;
    for (const id of set) {
      const q = this.pieces.get(id);
      if (q && q.type !== 'door') tier = Math.max(tier, q.tier);
    }
    w.set(x, y, z, STRUCT_TIER_BLOCKS[tier]);
  }

  // ---------------------------------------------------------------- damage & destruction
  /** Apply typed damage to a piece. Returns effective damage dealt. */
  damagePiece(piece: Piece, amount: number, type: DamageType, attacker: Player | null): number {
    const mults = piece.type === 'door' ? DOORS[piece.tier].damageMult : TIERS[piece.tier].damageMult;
    const mult = mults[type] ?? 0;
    const eff = amount * mult;
    if (eff <= 0) return 0;
    piece.hp -= eff;
    if (type !== 'decay') piece.lastDamaged = Date.now();
    if (piece.hp <= 0) {
      if (attacker) log.audit('Building piece destroyed', { by: attacker.name, owner: piece.owner, type: piece.type, tier: piece.tier, cause: type });
      this.destroyPiece(piece);
    }
    return eff;
  }

  /** Remove a piece and let unsupported pieces collapse. */
  destroyPiece(piece: Piece) {
    const bid = piece.building;
    this.removePieceRaw(piece);
    this.recomputeStability(bid);
  }

  private removePieceRaw(piece: Piece) {
    if (!this.pieces.has(piece.id)) return;
    const w = this.game.world;
    this.pieces.delete(piece.id);
    for (const slot of piece.geom.slots) if (this.slots.get(slot) === piece.id) this.slots.delete(slot);
    for (const [x, y, z] of piece.geom.cells) {
      this.cells.delete(ck(x, y, z));
      w.set(x, y, z, B.air);
    }
    for (const [x, y, z] of piece.geom.frames) {
      this.frames.get(ck(x, y, z))?.delete(piece.id);
      this.refreshFrame(x, y, z);
    }
    const b = this.buildings.get(piece.building);
    b?.pieces.delete(piece.id);
    this.game.fx('collapse', piece.geom.center[0], piece.geom.center[1], piece.geom.center[2], 60, { a: piece.tier });
    // deployables resting on removed cells fall
    for (const [x, y, z] of piece.geom.cells) this.game.tiles.checkSupport(x, y + 1, z);
  }

  /**
   * Stability: foundations = 1. Others take the best supporter's stability
   * times a factor (see buildgeom.supportersOf). Iterate to a fixed point,
   * collapse anything below MIN_STABILITY, repeat. Then split disconnected
   * parts into separate buildings.
   */
  recomputeStability(bid: number) {
    const b = this.buildings.get(bid);
    if (!b) return;
    for (let round = 0; round < 64; round++) {
      const list = [...b.pieces].map((id) => this.pieces.get(id)!).filter(Boolean);
      for (const p of list) p.stability = p.type === 'foundation' ? 1 : 0;
      let changed = true;
      for (let pass = 0; changed && pass < list.length + 2; pass++) {
        changed = false;
        for (const p of list) {
          if (p.type === 'foundation') continue;
          const s = this.predictStability(p.socket);
          if (Math.abs(s - p.stability) > 1e-9) {
            p.stability = s;
            changed = true;
          }
        }
      }
      const falling = list.filter((p) => p.type !== 'foundation' && p.stability < MIN_STABILITY);
      if (!falling.length) break;
      for (const p of falling) this.removePieceRaw(p);
    }
    this.splitBuilding(bid);
  }

  private splitBuilding(bid: number) {
    const b = this.buildings.get(bid);
    if (!b) return;
    if (!b.pieces.size) {
      this.dropZone(bid);
      this.buildings.delete(bid);
      if (b.totem) this.game.tiles.onTotemOrphaned(b.totem);
      return;
    }
    const remaining = new Set(b.pieces);
    const comps: Set<number>[] = [];
    while (remaining.size) {
      const start = remaining.values().next().value as number;
      const comp = new Set<number>([start]);
      remaining.delete(start);
      const stack = [start];
      while (stack.length) {
        const id = stack.pop()!;
        const p = this.pieces.get(id)!;
        for (const n of this.neighbours(p)) {
          if (remaining.has(n)) {
            remaining.delete(n);
            comp.add(n);
            stack.push(n);
          }
        }
      }
      comps.push(comp);
    }
    if (comps.length > 1) {
      const totemPiece = b.totem ? this.game.tiles.totemBasePiece(b.totem) : null;
      comps.sort((x, y) => y.size - x.size);
      const keepIdx = totemPiece ? Math.max(0, comps.findIndex((c) => c.has(totemPiece))) : 0;
      comps.forEach((comp, idx) => {
        if (idx === keepIdx) {
          b.pieces = comp;
          return;
        }
        const nb = this.nextBuildingId++;
        this.buildings.set(nb, { id: nb, pieces: comp, totem: null, zone: null, debt: {} });
        for (const id of comp) this.pieces.get(id)!.building = nb;
        this.recomputeZone(nb);
      });
      if (b.totem && totemPiece && !b.pieces.has(totemPiece)) b.totem = null;
    }
    this.recomputeZone(bid);
  }

  private neighbours(p: Piece): number[] {
    const out: number[] = [];
    for (const sup of supportersOf(p.socket)) {
      const id = this.slots.get(sup.slot);
      if (id !== undefined) out.push(id);
    }
    // reverse edges: pieces supported by any of p's slots
    for (const q of this.pieces.values()) {
      if (q.building !== p.building || q === p) continue;
      if (supportersOf(q.socket).some((s) => p.geom.slots.includes(s.slot))) out.push(q.id);
    }
    if (p.type === 'foundation') {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = this.slots.get(slotKey(p.socket.i + di, p.socket.j + dj, p.socket.oy, 'floor'));
        if (id !== undefined) out.push(id);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- privilege zones
  attachTotem(bid: number, tileKey: string) {
    const b = this.buildings.get(bid);
    if (!b) return;
    b.totem = tileKey;
    this.recomputeZone(bid);
  }

  detachTotem(tileKey: string) {
    for (const b of this.buildings.values()) {
      if (b.totem === tileKey) {
        b.totem = null;
        this.recomputeZone(b.id);
      }
    }
  }

  buildingOfTotem(tileKey: string): BuildingRec | null {
    for (const b of this.buildings.values()) if (b.totem === tileKey) return b;
    return null;
  }

  private dropZone(bid: number) {
    const b = this.buildings.get(bid);
    if (!b?.zone) return;
    for (const c of b.zone.cells) this.zoneIndex.get(c)?.delete(bid);
    b.zone = null;
  }

  private recomputeZone(bid: number) {
    this.dropZone(bid);
    const b = this.buildings.get(bid);
    if (!b || !b.totem || !b.pieces.size) return;
    const base = new Set<string>();
    let yMin = Infinity, yMax = -Infinity;
    for (const id of b.pieces) {
      const p = this.pieces.get(id)!;
      const { i, j } = p.socket;
      base.add(`${i},${j}`);
      if (p.socket.side === 'w') base.add(`${i - 1},${j}`);
      if (p.socket.side === 'n') base.add(`${i},${j - 1}`);
      yMin = Math.min(yMin, p.socket.oy);
      yMax = Math.max(yMax, p.socket.oy + BUILD_PITCH);
    }
    const cells = new Set<string>();
    const R = PRIVILEGE_CELLS;
    for (const c of base) {
      const [i, j] = c.split(',').map(Number);
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) cells.add(`${i + di},${j + dj}`);
    }
    b.zone = { cells, yMin: yMin - PRIVILEGE_VERTICAL, yMax: yMax + PRIVILEGE_VERTICAL };
    for (const c of cells) {
      let s = this.zoneIndex.get(c);
      if (!s) this.zoneIndex.set(c, (s = new Set()));
      s.add(bid);
    }
  }

  // ---------------------------------------------------------------- hammer
  private aimPiece(p: Player, yaw: number, pitch: number, range = REACH): Piece | null {
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const hit = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, range);
    if (!hit) return null;
    return this.pieceOrFrameAt(hit.x, hit.y, hit.z);
  }

  hammer(p: Player, mode: 'upgrade' | 'repair' | 'demolish' | 'rotate', yaw: number, pitch: number, tierReq?: number) {
    const held = p.held();
    if (!held || held.id !== 'hammer') return;
    const now = this.game.now;
    if (now - p.lastSwing < 0.45) return;
    p.lastSwing = now;
    const piece = this.aimPiece(p, yaw, pitch);
    if (!piece) return;
    const b = this.buildings.get(piece.building)!;
    const blocked = b.totem ? !this.isAuthorizedOn(p, b) : false;
    if (mode === 'upgrade') {
      if (piece.type === 'door') return this.game.msg(p, 'Doors cannot be upgraded', 'error');
      if (blocked) return this.game.msg(p, 'Building blocked', 'error');
      const tier = tierReq !== undefined ? Math.floor(tierReq) : piece.tier + 1;
      if (!(tier > piece.tier && tier <= 4)) return this.game.msg(p, 'Already at that tier or higher', 'error');
      const cost = pieceCost(piece.type, tier);
      if (!removeAll([...p.inv.all()], cost)) return this.game.msg(p, `Need ${cost.map(([k, n]) => `${n} ${itemDef(k).name}`).join(', ')}`, 'error');
      piece.tier = tier;
      piece.maxHp = pieceMaxHp(piece.type, tier);
      piece.hp = piece.maxHp;
      piece.placedAt = Date.now();
      this.writePieceBlocks(piece);
      this.game.fx('upgrade', piece.geom.center[0], piece.geom.center[1], piece.geom.center[2], 40, { a: tier });
    } else if (mode === 'repair') {
      if (blocked) return this.game.msg(p, 'Building blocked', 'error');
      if (piece.hp >= piece.maxHp - 0.01) return;
      const since = (Date.now() - piece.lastDamaged) / 1000;
      if (since < this.game.config.repairBlockSec) return this.game.msg(p, `Recently damaged — repair in ${Math.ceil(this.game.config.repairBlockSec - since)}s`, 'error');
      const amount = Math.min(piece.maxHp - piece.hp, piece.maxHp * 0.2);
      const cost = this.repairCost(piece, amount);
      if (!removeAll(p.inv.all(), cost)) return this.game.msg(p, `Repair needs ${cost.map(([k, n]) => `${n} ${itemDef(k).name}`).join(', ')}`, 'error');
      piece.hp += amount;
      this.game.fx('repair', piece.geom.center[0], piece.geom.center[1], piece.geom.center[2], 30);
    } else if (mode === 'demolish') {
      const authorized = b.totem ? !blocked : piece.owner === p.name;
      if (!authorized) return this.game.msg(p, 'You are not authorized to demolish this', 'error');
      const mins = (Date.now() - piece.placedAt) / 60000;
      if (mins > this.game.config.demolishWindowMin && !this.game.config.cheats) return this.game.msg(p, `Can only demolish within ${this.game.config.demolishWindowMin} min of placing or upgrading`, 'error');
      if (piece.type === 'door') this.game.entities.give(p, DOORS[piece.tier].item, 1);
      this.destroyPiece(piece);
    }
  }

  private repairCost(piece: Piece, amount: number): Array<[string, number]> {
    const base = piece.type === 'door' ? [[DOORS[piece.tier].item === 'wooden_door' ? 'wood' : 'metal_frag', 150]] as Array<[string, number]> : pieceCost(piece.type, piece.tier);
    return base.map(([k, n]) => [k, Math.max(1, Math.ceil(n * (amount / piece.maxHp) * 0.5))] as [string, number]);
  }

  inspect(p: Player, yaw: number, pitch: number) {
    const now = this.game.now;
    if (now - p.lastPieceInspect < 0.2) return;
    p.lastPieceInspect = now;
    const piece = this.aimPiece(p, yaw, pitch, 7);
    if (!piece) return p.link?.send({ t: 'piece', info: null });
    const b = this.buildings.get(piece.building)!;
    const blocked = b.totem ? !this.isAuthorizedOn(p, b) : false;
    const info: PieceInfo = {
      type: piece.type === 'door' ? DOORS[piece.tier].name : PIECES[piece.type].name,
      tier: piece.tier,
      hp: Math.round(piece.hp),
      maxHp: piece.maxHp,
      stability: Math.round(piece.stability * 100) / 100,
      owner: piece.owner,
      canDemolish: (b.totem ? !blocked : piece.owner === p.name) && (Date.now() - piece.placedAt) / 60000 <= this.game.config.demolishWindowMin,
      upgradeCost: piece.type !== 'door' && piece.tier < 4 ? pieceCost(piece.type, piece.tier + 1) : undefined,
      repairCost: piece.hp < piece.maxHp ? this.repairCost(piece, Math.min(piece.maxHp - piece.hp, piece.maxHp * 0.2)) : undefined,
      blocked: blocked ? 'Building blocked' : undefined,
    };
    p.link?.send({ t: 'piece', info });
  }

  // ---------------------------------------------------------------- doors & locks
  /** Place the held door item into the doorway the player aims at. */
  placeDoor(p: Player, doorTier: number, itemKey: string, yaw: number, pitch: number) {
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const hit = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, REACH);
    let doorway: Piece | null = null;
    if (hit) {
      // aimed at the doorway frame itself, or at the block beside/below the hole
      const candidates: Array<[number, number, number]> = [[hit.x, hit.y, hit.z], [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz]];
      for (const [x, y, z] of candidates) {
        const q = this.pieceAt(x, y, z);
        if (q?.type === 'doorway') { doorway = q; break; }
        for (const piece of this.pieces.values()) {
          if (piece.type === 'doorway' && piece.geom.holes.some(([hx, hy, hz]) => hx === x && hy === y && hz === z)) { doorway = piece; break; }
        }
        if (doorway) break;
      }
    }
    if (!doorway) return this.game.msg(p, 'Aim at a doorway to place a door', 'error');
    const s: Socket = { ...doorway.socket, type: 'door' };
    const geom = pieceGeometry(s);
    const err = this.validate(p, s, geom);
    if (err) return this.game.msg(p, err, 'error');
    if (!removeItem([p.inv.belt, ...p.inv.all()], itemKey, 1)) return;
    const door = this.addPiece(s, doorTier, p.name);
    door.stability = doorway.stability;
    this.game.fx('door', geom.center[0], geom.center[1], geom.center[2], 30, { a: 1 });
  }

  toggleDoor(p: Player, door: Piece) {
    if (door.lock && !door.lock.authorized.includes(p.name)) {
      this.game.fx('locked', door.geom.center[0], door.geom.center[1], door.geom.center[2], 20);
      if (door.lock.code) p.link?.send({ t: 'lockui', mode: 'enter' });
      p.lockTarget = { kind: 'piece', id: door.id };
      return this.game.msg(p, 'Locked', 'error');
    }
    if (door.open) {
      for (const e of this.game.entities.near(door.geom.center[0], door.geom.center[2], 3)) {
        if (e.kind !== 'p' && e.kind !== 'a') continue;
        for (const [x, y, z] of door.geom.cells) {
          if (x + 1 > e.x - PLAYER_HALF_WIDTH && x < e.x + PLAYER_HALF_WIDTH && z + 1 > e.z - PLAYER_HALF_WIDTH && z < e.z + PLAYER_HALF_WIDTH && y + 1 > e.y && y < e.y + 1.8) {
            return this.game.msg(p, 'Something is blocking the door', 'error');
          }
        }
      }
    }
    door.open = !door.open;
    this.writePieceBlocks(door);
    this.game.fx('door', door.geom.center[0], door.geom.center[1], door.geom.center[2], 30, { a: door.open ? 1 : 0 });
  }

  // ---------------------------------------------------------------- upkeep & decay
  /** Resources consumed per 24h by a building. */
  upkeepPerDay(b: BuildingRec): Record<string, number> {
    const n = b.pieces.size;
    const frac = UPKEEP_BRACKETS.find((x) => n <= x.upTo)!.fraction;
    const out: Record<string, number> = {};
    for (const id of b.pieces) {
      const p = this.pieces.get(id)!;
      const cost = p.type === 'door' ? [[p.tier === 0 ? 'wood' : p.tier === 1 ? 'metal_frag' : 'hq_metal', p.tier === 0 ? 300 : p.tier === 1 ? 150 : 20]] as Array<[string, number]> : pieceCost(p.type, p.tier);
      for (const [k, v] of cost) out[k] = (out[k] ?? 0) + v * frac;
    }
    return out;
  }

  tick(dt: number) {
    this.upkeepTimer += dt;
    const period = this.game.config.upkeep.periodSec;
    if (this.upkeepTimer < period) return;
    this.upkeepTimer -= period;
    this.runUpkeep(period);
  }

  /** One upkeep/decay period. Exposed for tests. */
  runUpkeep(periodSec: number) {
    const cfg = this.game.config;
    for (const b of [...this.buildings.values()]) {
      let paidResources: Set<string> | null = null;
      if (b.totem && cfg.upkeep.enabled) {
        paidResources = new Set();
        const perDay = this.upkeepPerDay(b);
        const cont = this.game.tiles.totemContainer(b.totem);
        for (const [k, v] of Object.entries(perDay)) {
          b.debt[k] = (b.debt[k] ?? 0) + (v * periodSec) / 86400;
          const whole = Math.floor(b.debt[k]);
          if (whole <= 0) {
            if (cont && countItem([cont], k) > 0) paidResources.add(k);
            continue;
          }
          if (cont && removeItem([cont], k, whole)) {
            b.debt[k] -= whole;
            paidResources.add(k);
          }
        }
      }
      if (!cfg.decay.enabled) continue;
      for (const id of [...b.pieces]) {
        const p = this.pieces.get(id);
        if (!p) continue;
        if (paidResources) {
          const res = p.type === 'door' ? (p.tier === 0 ? 'wood' : p.tier === 1 ? 'metal_frag' : 'hq_metal') : TIERS[p.tier].cost[0][0];
          if (paidResources.has(res)) continue;
        }
        const hours = p.type === 'door' ? TIERS[Math.min(4, p.tier + 1)].decayHours : TIERS[p.tier].decayHours;
        const dmg = (p.maxHp * periodSec) / (hours * 3600) * cfg.decay.scale;
        this.damagePiece(p, dmg, 'decay', null);
      }
    }
  }

  /** Hours of upkeep stored in a totem (for the UI). */
  protectedHours(b: BuildingRec): number {
    const perDay = this.upkeepPerDay(b);
    const cont = b.totem ? this.game.tiles.totemContainer(b.totem) : null;
    if (!cont) return 0;
    let hours = Infinity;
    for (const [k, v] of Object.entries(perDay)) {
      if (v <= 0) continue;
      hours = Math.min(hours, (countItem([cont], k) / v) * 24);
    }
    return hours === Infinity ? 0 : hours;
  }

  // ---------------------------------------------------------------- persistence
  saveObjects() {
    return [...this.pieces.values()].map((p) => ({
      id: p.id,
      kind: 'piece',
      data: JSON.stringify({ s: p.socket, tier: p.tier, hp: p.hp, owner: p.owner, placedAt: p.placedAt, lastDamaged: p.lastDamaged, open: p.open, lock: p.lock, building: p.building }),
    }));
  }

  private loaded: Array<{ id: number; d: { s: Socket; tier: number; hp: number; owner: string; placedAt: number; lastDamaged: number; open?: boolean; lock?: Lock } }> = [];

  loadPiece(id: number, d: { s: Socket; tier: number; hp: number; owner: string; placedAt: number; lastDamaged: number; open?: boolean; lock?: Lock }) {
    this.loaded.push({ id, d });
  }

  /** Rebuild indices after loading pieces (foundations first so support exists). */
  rebuildAll() {
    const order = (t: PieceType) => (t === 'foundation' ? 0 : t === 'door' ? 3 : t === 'floor' || t === 'stairs' ? 2 : 1);
    this.loaded.sort((a, b) => a.d.s.oy - b.d.s.oy || order(a.d.s.type) - order(b.d.s.type));
    for (const { id, d } of this.loaded) {
      const s = sanitizeSocket(d.s) ?? (d.s.type === 'door' ? d.s : null);
      if (!s) continue;
      const geom = pieceGeometry(s);
      if (geom.slots.some((x) => this.slots.has(x))) continue;
      const piece = this.addPieceSilently(s, d, id);
      piece.hp = Math.min(piece.maxHp, d.hp);
    }
    this.loaded = [];
    for (const bid of [...this.buildings.keys()]) this.recomputeStability(bid);
  }

  private addPieceSilently(s: Socket, d: { tier: number; owner: string; placedAt: number; lastDamaged: number; open?: boolean; lock?: Lock }, id: number): Piece {
    // Block writes during load are not replicated (no clients yet) but must not mark chunks dirty unnecessarily.
    const piece = this.addPiece(s, d.tier, d.owner, id);
    piece.placedAt = d.placedAt;
    piece.lastDamaged = d.lastDamaged;
    piece.open = s.type === 'door' ? !!d.open : undefined;
    piece.lock = d.lock;
    if (s.type === 'door') this.writePieceBlocks(piece);
    return piece;
  }

  /** Pieces whose cells fall in a sphere (for explosions). */
  piecesInRadius(x: number, y: number, z: number, r: number): Array<{ piece: Piece; dist: number }> {
    const out = new Map<number, number>();
    const r2 = r * r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
      const ddx = bx + 0.5 - x, ddy = by + 0.5 - y, ddz = bz + 0.5 - z;
      const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
      if (d2 > r2) continue;
      const id = this.cells.get(ck(bx, by, bz));
      if (id === undefined) continue;
      const d = Math.sqrt(d2);
      if (!out.has(id) || out.get(id)! > d) out.set(id, d);
    }
    return [...out].map(([id, dist]) => ({ piece: this.pieces.get(id)!, dist })).filter((x) => x.piece);
  }
}

function sanitizeSocket(raw: unknown): Socket | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const type = s.type as PieceType;
  if (!BUILD_PIECES.includes(type) && type !== 'door') return null;
  const i = Number(s.i), j = Number(s.j), oy = Number(s.oy);
  if (![i, j, oy].every(Number.isInteger) || Math.abs(i) > 100000 || Math.abs(j) > 100000 || oy < 1 || oy > WORLD_HEIGHT - 6) return null;
  const out: Socket = { type, i, j, oy };
  if (type === 'wall' || type === 'doorway' || type === 'window' || type === 'half_wall' || type === 'door') {
    if (s.side !== 'w' && s.side !== 'n') return null;
    out.side = s.side;
  }
  if (type === 'stairs') out.rot = Math.abs(Math.floor(Number(s.rot) || 0)) % 4;
  return out;
}
