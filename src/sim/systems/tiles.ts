import { CHUNK_SIZE, REACH, WORLD_HEIGHT } from '../../shared/constants';
import type { DamageType } from '../../shared/data/damage';
import { itemDef, tryItemDef } from '../../shared/data/items';
import { rollLoot } from '../../shared/data/loot';
import { recipe, researchCost } from '../../shared/data/recipes';
import { dirFromAngles, mulberry32, hash4 } from '../../shared/math';
import type { LootView } from '../../shared/net/protocol';
import { addStack, Container, countItem, makeStack, removeItem, type ItemStack } from '../../shared/sim/inventory';
import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from '../../shared/sim/movement';
import { B, blockByKey, blockDef, SOLID } from '../../shared/world/blocks';
import type { Chunk } from '../../shared/world/chunk';
import { cidx, chunkKey } from '../../shared/world/chunk';
import { raycastVoxels } from '../../shared/world/raycast';
import type { Game } from '../game';
import { log } from '../log';
import type { Player } from '../player';
import type { Lock } from './building';
import { Corpse, ItemDrop } from './entities';

interface TileDef {
  hp: number;
  slots: number;
  bench?: number;
  mat: 'wood' | 'stone' | 'metal' | 'totem' | 'none';
  loot?: string;
  /** slot filter */
  filter?: (s: ItemStack, slot: number) => boolean;
  title: string;
}

const fuelOnly0 = (s: ItemStack, slot: number) => slot !== 0 || !!tryItemDef(s.id)?.fuel;
const scrapSlot1 = (s: ItemStack, slot: number) => slot !== 1 || s.id === 'scrap';

const TILE_DEFS: Record<string, TileDef> = {
  workbench1: { hp: 500, slots: 0, bench: 1, mat: 'wood', title: 'Workbench Level 1' },
  workbench2: { hp: 750, slots: 0, bench: 2, mat: 'metal', title: 'Workbench Level 2' },
  workbench3: { hp: 1000, slots: 0, bench: 3, mat: 'metal', title: 'Workbench Level 3' },
  furnace: { hp: 500, slots: 6, mat: 'stone', filter: fuelOnly0, title: 'Furnace' },
  campfire: { hp: 150, slots: 5, mat: 'wood', filter: fuelOnly0, title: 'Campfire' },
  small_box: { hp: 150, slots: 12, mat: 'wood', title: 'Small Box' },
  large_box: { hp: 300, slots: 30, mat: 'wood', title: 'Large Box' },
  claim_totem: { hp: 300, slots: 24, mat: 'totem', title: 'Claim Totem' },
  sleeping_bag: { hp: 50, slots: 0, mat: 'wood', title: 'Sleeping Bag' },
  research_table: { hp: 300, slots: 2, mat: 'metal', filter: scrapSlot1, title: 'Research Table' },
  loot_crate: { hp: Infinity, slots: 6, mat: 'none', loot: 'crate', title: 'Supply Crate' },
  military_crate: { hp: Infinity, slots: 6, mat: 'none', loot: 'military', title: 'Military Crate' },
  barrel: { hp: 30, slots: 0, mat: 'metal', loot: 'barrel', title: 'Rusty Barrel' },
};

const MAT_MULT: Record<TileDef['mat'], Partial<Record<DamageType, number>>> = {
  wood: { melee: 0.5, bullet: 0.1, arrow: 0.05, explosive: 1, animal: 0.2 },
  stone: { melee: 0.05, bullet: 0.02, explosive: 1 },
  metal: { melee: 0.4, bullet: 0.2, explosive: 1 },
  totem: { melee: 0.5, bullet: 0.1, arrow: 0.05, explosive: 2 },
  none: {},
};

export interface Tile {
  key: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  owner: string;
  hp: number;
  container: Container | null;
  lock?: Lock;
  // furnace / campfire
  lit?: boolean;
  fuelLeft?: number;
  progress?: number[];
  // totem
  auth?: string[];
  // sleeping bag
  id?: number;
  label?: string;
  readyAt?: number;
  // POI loot
  poi?: boolean;
  respawnAt?: number;
  broken?: boolean;
}

const tkey = (x: number, y: number, z: number) => `${x},${y},${z}`;

export class Tiles {
  readonly tiles = new Map<string, Tile>();
  private byChunk = new Map<number, Set<Tile>>();
  private procTimer = 0;
  private rnd = mulberry32(Date.now());

  constructor(private game: Game) {}

  // ------------------------------------------------------------- registry
  private index(t: Tile) {
    const k = chunkKey(Math.floor(t.x / CHUNK_SIZE), Math.floor(t.z / CHUNK_SIZE));
    let s = this.byChunk.get(k);
    if (!s) this.byChunk.set(k, (s = new Set()));
    s.add(t);
  }

  private unindex(t: Tile) {
    const k = chunkKey(Math.floor(t.x / CHUNK_SIZE), Math.floor(t.z / CHUNK_SIZE));
    this.byChunk.get(k)?.delete(t);
  }

  *near(x: number, z: number, r: number): Generator<Tile> {
    const c0x = Math.floor((x - r) / CHUNK_SIZE), c1x = Math.floor((x + r) / CHUNK_SIZE);
    const c0z = Math.floor((z - r) / CHUNK_SIZE), c1z = Math.floor((z + r) / CHUNK_SIZE);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const s = this.byChunk.get(chunkKey(cx, cz));
      if (s) for (const t of s) if (Math.abs(t.x + 0.5 - x) <= r && Math.abs(t.z + 0.5 - z) <= r) yield t;
    }
  }

  at(x: number, y: number, z: number) {
    return this.tiles.get(tkey(x, y, z));
  }

  create(kind: string, x: number, y: number, z: number, owner: string): Tile {
    const def = TILE_DEFS[kind];
    const t: Tile = {
      key: tkey(x, y, z), kind, x, y, z, owner, hp: def.hp,
      container: def.slots ? new Container(def.slots, def.filter) : null,
    };
    if (kind === 'furnace' || kind === 'campfire') {
      t.lit = false;
      t.fuelLeft = 0;
      t.progress = new Array(def.slots).fill(0);
    }
    if (kind === 'claim_totem') t.auth = [owner];
    if (kind === 'sleeping_bag') {
      t.id = this.game.allocId();
      t.label = 'Sleeping Bag';
      t.readyAt = 0;
    }
    this.tiles.set(t.key, t);
    this.index(t);
    return t;
  }

  remove(t: Tile) {
    this.tiles.delete(t.key);
    this.unindex(t);
    if (t.kind === 'claim_totem') this.game.building.detachTotem(t.key);
  }

  /** Register POI loot containers in freshly generated chunks. */
  onFreshChunk(c: Chunk) {
    for (let y = 1; y < WORLD_HEIGHT; y++) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      const id = c.blocks[cidx(x, y, z)];
      if (id !== B.loot_crate && id !== B.military_crate && id !== B.barrel) continue;
      const wx = c.cx * CHUNK_SIZE + x, wz = c.cz * CHUNK_SIZE + z;
      const key = tkey(wx, y, wz);
      if (this.tiles.has(key)) continue;
      const t = this.create(blockDef(id).deployable!, wx, y, wz, '');
      t.poi = true;
      this.fillLoot(t, hash4(wx, y, wz, this.game.seed));
    }
  }

  private fillLoot(t: Tile, seed?: number) {
    const def = TILE_DEFS[t.kind];
    if (!def.loot || !t.container) return;
    const rnd = seed !== undefined ? mulberry32(seed) : this.rnd;
    for (const [id, n] of rollLoot(def.loot, rnd)) addStack(t.container, makeStack(id, n));
  }

  // ------------------------------------------------------------- placement
  placeHeld(p: Player, yaw: number, pitch: number) {
    const held = p.held();
    if (!held) return;
    const def = itemDef(held.id);
    if (def.doorTier !== undefined) return this.game.building.placeDoor(p, def.doorTier, def.key, yaw, pitch);
    if (def.key === 'code_lock') return this.attachLock(p, yaw, pitch);
    if (!def.placeBlock) return;
    const now = this.game.now;
    if (now - p.lastSwing < 0.2) return;
    p.lastSwing = now;
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const hit = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, REACH);
    if (!hit) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    const err = this.canPlaceBlock(p, def.placeBlock, x, y, z);
    if (err) return this.game.msg(p, err, 'error');
    const block = blockByKey(def.placeBlock);
    if (block.deployable === 'claim_totem') {
      const piece = this.game.building.pieceAt(x, y - 1, z);
      if (!piece || (piece.type !== 'foundation' && piece.type !== 'floor')) return this.game.msg(p, 'A Claim Totem must stand on a foundation or floor', 'error');
      const b = this.game.building.buildings.get(piece.building)!;
      if (b.totem) return this.game.msg(p, 'This building already has a Claim Totem', 'error');
    }
    if (!removeItem([p.inv.belt, ...p.inv.all()], def.key, 1)) return;
    this.game.world.set(x, y, z, block.id);
    if (block.deployable) {
      const t = this.create(block.deployable, x, y, z, p.name);
      if (block.deployable === 'claim_totem') {
        const piece = this.game.building.pieceAt(x, y - 1, z)!;
        this.game.building.attachTotem(piece.building, t.key);
        this.game.msg(p, 'Claim Totem placed — you are authorized. Store upkeep resources inside.', 'info');
      }
      if (block.deployable === 'campfire') t.lit = false;
    }
    this.game.fx('place', x + 0.5, y + 0.5, z + 0.5, 25, { s: block.sound });
  }

  canPlaceBlock(p: Player, key: string, x: number, y: number, z: number): string | null {
    if (y < 1 || y >= WORLD_HEIGHT - 1) return 'Out of world bounds';
    const w = this.game.world;
    const cur = blockDef(w.getBlock(x, y, z));
    if (!cur.replaceable) return 'Something is already there';
    if (this.game.building.isFrame(x, y, z)) return 'Something is already there';
    const block = blockByKey(key);
    if (this.game.building.isBlocked(p, x + 0.5, y + 0.5, z + 0.5)) return 'Building blocked';
    if (block.needsSupport || block.deployable) {
      const below = w.getBlock(x, y - 1, z);
      if (!SOLID[below] || blockDef(below).deployable) return 'Needs solid ground below';
    }
    if (block.solid) {
      for (const e of this.game.entities.near(x + 0.5, z + 0.5, 3)) {
        if (e.kind !== 'p' && e.kind !== 'a') continue;
        if (x + 1 > e.x - PLAYER_HALF_WIDTH && x < e.x + PLAYER_HALF_WIDTH && z + 1 > e.z - PLAYER_HALF_WIDTH && z < e.z + PLAYER_HALF_WIDTH && y + 1 > e.y && y < e.y + PLAYER_HEIGHT) {
          return 'Something is in the way';
        }
      }
    }
    return null;
  }

  /** A deployable whose support vanished is destroyed. */
  checkSupport(x: number, y: number, z: number) {
    const t = this.at(x, y, z);
    if (!t) {
      const id = this.game.world.getBlock(x, y, z);
      const d = blockDef(id);
      if (d.needsSupport && !SOLID[this.game.world.getBlock(x, y - 1, z)]) this.game.world.set(x, y, z, B.air);
      return;
    }
    if (!SOLID[this.game.world.getBlock(x, y - 1, z)]) this.destroy(t, null);
  }

  // ------------------------------------------------------------- interaction
  interact(p: Player, yaw: number, pitch: number) {
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const hit = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, REACH);
    const ent = this.game.combat.rayEntity(p, ex, ey, ez, d.x, d.y, d.z, REACH, (e) => e.kind === 'i' || e.kind === 'c');
    if (ent && (!hit || ent.dist < hit.dist)) {
      if (ent.e instanceof ItemDrop) {
        const drop = ent.e;
        const left = this.giveStack(p, drop.stack);
        if (left <= 0) this.game.entities.remove(drop);
        else {
          drop.stack.n = left;
          drop.ver++;
          this.game.msg(p, 'Inventory full', 'error');
        }
        this.game.fx('pickup', drop.x, drop.y, drop.z, 15);
        return;
      }
      if (ent.e instanceof Corpse) {
        if (ent.e.species) return this.game.msg(p, 'Harvest it with a tool', 'info');
        p.loot = { kind: 'entity', id: ent.e.id };
        return;
      }
    }
    if (!hit) return;
    const piece = this.game.building.pieceAt(hit.x, hit.y, hit.z);
    if (piece?.type === 'door') return this.game.building.toggleDoor(p, piece);
    const t = this.at(hit.x, hit.y, hit.z);
    if (!t) return;
    const def = TILE_DEFS[t.kind];
    if (def.bench) return this.game.msg(p, `${def.title}: tier ${def.bench} recipes can be crafted within 4 blocks`, 'info');
    if (t.kind === 'barrel') return this.game.msg(p, 'Break barrels open with a tool or weapon', 'info');
    if (t.kind === 'sleeping_bag') return this.game.msg(p, t.owner === p.name ? 'Your sleeping bag — respawn here after death' : `${t.owner}'s sleeping bag`, 'info');
    if (t.lock && !t.lock.authorized.includes(p.name)) {
      p.lockTarget = { kind: 'tile', key: t.key };
      if (t.lock.code) p.link?.send({ t: 'lockui', mode: 'enter' });
      return this.game.msg(p, 'Locked', 'error');
    }
    if (t.kind === 'furnace' || t.kind === 'campfire') {
      // open UI; toggling happens from the UI
    }
    p.loot = { kind: 'block', key: t.key };
  }

  private giveStack(p: Player, s: ItemStack): number {
    let left = s.n;
    for (const c of p.inv.pickupOrder(s.id)) {
      if (left <= 0) break;
      left = addStack(c, { ...s, n: left });
    }
    return left;
  }

  /** Container + access check for the player's open loot target. */
  lootContainer(p: Player): Container | null {
    if (!p.loot) return null;
    if (p.loot.kind === 'entity') {
      const e = this.game.entities.get(p.loot.id);
      if (!(e instanceof Corpse) || e.removed || Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z) > REACH + 1.5) return null;
      return e.container;
    }
    const t = this.tiles.get(p.loot.key);
    if (!t || !t.container) return null;
    if (Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - p.y - 1, t.z + 0.5 - p.z) > REACH + 1.5) return null;
    if (t.lock && !t.lock.authorized.includes(p.name)) return null;
    if (t.kind === 'claim_totem' && !t.auth!.includes(p.name)) return null;
    return t.container;
  }

  lootView(p: Player): LootView | null {
    if (!p.loot) return null;
    if (p.loot.kind === 'entity') {
      const e = this.game.entities.get(p.loot.id);
      const c = this.lootContainer(p);
      if (!(e instanceof Corpse) || !c) {
        p.loot = null;
        return null;
      }
      return { id: e.id, kind: 'corpse', title: `${e.name}'s body`, slots: c.toJSON() };
    }
    const t = this.tiles.get(p.loot.key);
    if (!t) {
      p.loot = null;
      return null;
    }
    const near = Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - p.y - 1, t.z + 0.5 - p.z) <= REACH + 1.5;
    if (!near) {
      p.loot = null;
      return null;
    }
    const info: Record<string, unknown> = {};
    if (t.kind === 'furnace' || t.kind === 'campfire') info.lit = !!t.lit;
    if (t.kind === 'claim_totem') {
      const b = this.game.building.buildingOfTotem(t.key);
      info.authorized = t.auth!.includes(p.name);
      info.authList = t.auth;
      if (b) {
        info.pieces = b.pieces.size;
        info.upkeep = Object.entries(this.game.building.upkeepPerDay(b)).map(([k, v]) => [k, Math.ceil(v)]);
        info.hours = Math.floor(this.game.building.protectedHours(b) * 10) / 10;
      }
    }
    if (t.kind === 'research_table') {
      const s = t.container!.get(0);
      if (s) {
        const cost = researchCost(s.id);
        info.item = s.id;
        info.cost = cost;
        info.known = p.blueprints.has(s.id) || !!recipe(s.id)?.known;
      }
    }
    const authorizedForSlots = t.kind !== 'claim_totem' || t.auth!.includes(p.name);
    return { id: 0, kind: t.kind, title: TILE_DEFS[t.kind].title, slots: authorizedForSlots && t.container ? t.container.toJSON() : [], info };
  }

  toggle(p: Player) {
    if (p.loot?.kind !== 'block') return;
    const t = this.tiles.get(p.loot.key);
    if (!t || (t.kind !== 'furnace' && t.kind !== 'campfire')) return;
    if (!this.lootContainer(p)) return;
    t.lit = !t.lit;
    if (t.lit && !this.hasFuel(t)) {
      t.lit = false;
      this.game.msg(p, 'Needs fuel (wood) in the first slot', 'error');
    }
    this.game.fx(t.lit ? 'ignite' : 'extinguish', t.x + 0.5, t.y + 0.5, t.z + 0.5, 20);
  }

  private hasFuel(t: Tile) {
    return (t.fuelLeft ?? 0) > 0 || !!t.container?.get(0);
  }

  // ------------------------------------------------------------- research, locks, totem
  research(p: Player) {
    if (p.loot?.kind !== 'block') return;
    const t = this.tiles.get(p.loot.key);
    if (!t || t.kind !== 'research_table' || !this.lootContainer(p)) return;
    const item = t.container!.get(0);
    if (!item) return this.game.msg(p, 'Place an item to research in the first slot', 'error');
    const cost = researchCost(item.id);
    if (cost === null) return this.game.msg(p, 'That item has no blueprint to learn', 'error');
    if (p.blueprints.has(item.id)) return this.game.msg(p, 'You already know this blueprint', 'error');
    const scrap = countItem([t.container!], 'scrap');
    if (scrap < cost) return this.game.msg(p, `Research needs ${cost} scrap in the second slot`, 'error');
    removeItem([t.container!], 'scrap', cost);
    removeItem([t.container!], item.id, 1);
    p.blueprints.add(item.id);
    p.link?.send({ t: 'bps', list: [...p.blueprints] });
    this.game.msg(p, `Blueprint learned: ${itemDef(item.id).name}`, 'info');
    this.game.fx('research', t.x + 0.5, t.y + 1, t.z + 0.5, 20);
    log.audit('Blueprint researched', { player: p.name, item: item.id });
  }

  private attachLock(p: Player, yaw: number, pitch: number) {
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const hit = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, REACH);
    if (!hit) return;
    const piece = this.game.building.pieceAt(hit.x, hit.y, hit.z);
    const t = this.at(hit.x, hit.y, hit.z);
    const target = piece?.type === 'door' ? piece : t && (t.kind === 'small_box' || t.kind === 'large_box' || t.kind === 'claim_totem') ? t : null;
    if (!target) return this.game.msg(p, 'Code locks go on doors, boxes and claim totems', 'error');
    if (target.lock) return this.game.msg(p, 'Already locked', 'error');
    if (this.game.building.isBlocked(p, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)) return this.game.msg(p, 'Building blocked', 'error');
    if (!removeItem([p.inv.belt, ...p.inv.all()], 'code_lock', 1)) return;
    target.lock = { code: '', owner: p.name, authorized: [p.name] };
    p.lockTarget = piece?.type === 'door' ? { kind: 'piece', id: piece.id } : { kind: 'tile', key: t!.key };
    p.link?.send({ t: 'lockui', mode: 'set' });
    this.game.fx('lock', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 15);
  }

  private lockOf(p: Player): Lock | null {
    const lt = p.lockTarget;
    if (!lt) return null;
    if (lt.kind === 'piece') return this.game.building.pieces.get(lt.id)?.lock ?? null;
    return this.tiles.get(lt.key)?.lock ?? null;
  }

  lockOp(p: Player, op: 'set' | 'enter' | 'remove', code?: string) {
    const lock = this.lockOf(p);
    if (!lock) return;
    const c = String(code ?? '');
    if (op === 'set') {
      if (lock.owner !== p.name && !lock.authorized.includes(p.name)) return this.game.msg(p, 'Only authorized players can change the code', 'error');
      if (!/^\d{4}$/.test(c)) return this.game.msg(p, 'Code must be 4 digits', 'error');
      lock.code = c;
      lock.authorized = [p.name];
      this.game.msg(p, 'Code set. Others must enter it to gain access.', 'info');
    } else if (op === 'enter') {
      const now = this.game.now;
      if (now - (p.lastCodeTry ?? 0) < 1.5) return this.game.msg(p, 'Too fast', 'error');
      p.lastCodeTry = now;
      if (lock.code && c === lock.code) {
        if (!lock.authorized.includes(p.name)) lock.authorized.push(p.name);
        this.game.msg(p, 'Code accepted', 'info');
      } else {
        this.game.combat.damagePlayer(p, 5, 'melee', null); // shock on wrong code (deters brute force)
        this.game.msg(p, 'Wrong code', 'error');
      }
    } else if (op === 'remove') {
      if (lock.owner !== p.name) return;
      const lt = p.lockTarget!;
      if (lt.kind === 'piece') delete this.game.building.pieces.get(lt.id)!.lock;
      else delete this.tiles.get(lt.key)!.lock;
      this.game.entities.give(p, 'code_lock', 1);
    }
  }

  totemOp(p: Player, op: 'auth' | 'deauth' | 'clear') {
    if (p.loot?.kind !== 'block') return;
    const t = this.tiles.get(p.loot.key);
    if (!t || t.kind !== 'claim_totem') return;
    if (Math.hypot(t.x + 0.5 - p.x, t.z + 0.5 - p.z) > REACH + 1.5) return;
    if (t.lock && !t.lock.authorized.includes(p.name)) return this.game.msg(p, 'The totem is locked', 'error');
    if (op === 'auth') {
      if (!t.auth!.includes(p.name)) t.auth!.push(p.name);
      log.audit('Totem authorize', { player: p.name, totem: t.key, owner: t.owner });
    } else if (op === 'deauth') {
      t.auth = t.auth!.filter((n) => n !== p.name);
    } else if (op === 'clear') {
      if (!t.auth!.includes(p.name)) return this.game.msg(p, 'Not authorized', 'error');
      t.auth = [];
    }
  }

  totemAuthorized(key: string, name: string) {
    return !!this.tiles.get(key)?.auth?.includes(name);
  }

  totemAuthList(key: string) {
    return this.tiles.get(key)?.auth ?? [];
  }

  totemContainer(key: string) {
    return this.tiles.get(key)?.container ?? null;
  }

  totemBasePiece(key: string): number | null {
    const t = this.tiles.get(key);
    if (!t) return null;
    return this.game.building.pieceAt(t.x, t.y - 1, t.z)?.id ?? null;
  }

  onTotemOrphaned(key: string) {
    const t = this.tiles.get(key);
    if (t) this.destroy(t, null);
  }

  // ------------------------------------------------------------- bags
  bagsOf(name: string) {
    const out: Array<{ id: number; label: string; x: number; y: number; z: number; readyAt: number }> = [];
    for (const t of this.tiles.values()) {
      if (t.kind === 'sleeping_bag' && t.owner === name) out.push({ id: t.id!, label: t.label!, x: t.x, y: t.y, z: t.z, readyAt: t.readyAt ?? 0 });
    }
    return out;
  }

  useBag(p: Player, bag: { x: number; z: number }) {
    const range = this.game.config.bagResetRange;
    for (const t of this.tiles.values()) {
      if (t.kind === 'sleeping_bag' && t.owner === p.name && Math.hypot(t.x - bag.x, t.z - bag.z) <= range) {
        t.readyAt = this.game.now + this.game.config.bagCooldownSec;
      }
    }
  }

  // ------------------------------------------------------------- damage
  damage(t: Tile, amount: number, type: DamageType, attacker: Player | null): number {
    const def = TILE_DEFS[t.kind];
    if (!Number.isFinite(def.hp)) return 0;
    const mult = MAT_MULT[def.mat][type] ?? 0;
    const eff = amount * mult;
    if (eff <= 0) return 0;
    t.hp -= eff;
    if (t.hp <= 0) this.destroy(t, attacker);
    return eff;
  }

  destroy(t: Tile, attacker: Player | null) {
    const def = TILE_DEFS[t.kind];
    if (t.kind === 'barrel') {
      for (const [id, n] of rollLoot('barrel', this.rnd)) this.game.entities.dropItem(makeStack(id, n), t.x + 0.5, t.y + 0.5, t.z + 0.5);
      this.game.world.set(t.x, t.y, t.z, B.air);
      t.broken = true;
      t.respawnAt = this.game.now + this.game.config.lootRespawnMin * 60;
      this.game.fx('break', t.x + 0.5, t.y + 0.5, t.z + 0.5, 30, { s: 'metal' });
      return;
    }
    if (t.container && !t.container.isEmpty()) {
      // contents spill into a loot bag (corpse entity)
      const bag = new Corpse(this.game.allocId(), 'Loot', t.x + 0.5, t.y, t.z + 0.5, this.game.now + 600);
      bag.container.load(t.container.toJSON().concat(new Array(36).fill(null)).slice(0, 36));
      this.game.entities.add(bag);
    }
    this.remove(t);
    this.game.world.set(t.x, t.y, t.z, B.air);
    this.game.fx('break', t.x + 0.5, t.y + 0.5, t.z + 0.5, 40, { s: def.mat === 'stone' ? 'stone' : def.mat === 'metal' ? 'metal' : 'wood' });
    if (attacker) log.audit('Deployable destroyed', { by: attacker.name, kind: t.kind, owner: t.owner });
  }

  // ------------------------------------------------------------- queries for other systems
  benchTierNear(x: number, y: number, z: number): number {
    let best = 0;
    for (const t of this.near(x, z, 4)) {
      const b = TILE_DEFS[t.kind].bench;
      if (b && Math.abs(t.y - y) <= 4) best = Math.max(best, b);
    }
    return best;
  }

  /** Burning campfire/furnace within r blocks. */
  fireNear(x: number, y: number, z: number, r = 4): boolean {
    for (const t of this.near(x, z, r)) if (t.lit && Math.abs(t.y - y) <= 3) return true;
    return false;
  }

  // ------------------------------------------------------------- simulation
  tick(dt: number) {
    this.procTimer += dt;
    if (this.procTimer < 1) return;
    const step = this.procTimer;
    this.procTimer = 0;
    for (const t of this.tiles.values()) {
      if (t.kind === 'furnace' || t.kind === 'campfire') this.process(t, step);
      else if (t.poi && t.respawnAt !== undefined && this.game.now >= t.respawnAt) this.respawnLoot(t);
      else if (t.poi && t.container && t.container.isEmpty() && t.respawnAt === undefined && !this.anyoneLooting(t)) {
        t.respawnAt = this.game.now + this.game.config.lootRespawnMin * 60;
      }
    }
  }

  private anyoneLooting(t: Tile) {
    for (const p of this.game.players.values()) if (p.loot?.kind === 'block' && p.loot.key === t.key) return true;
    return false;
  }

  private respawnLoot(t: Tile) {
    t.respawnAt = undefined;
    if (t.kind === 'barrel') {
      const w = this.game.world;
      w.ensureSyncAt(t.x, t.z);
      if (w.getBlock(t.x, t.y, t.z) === B.air && SOLID[w.getBlock(t.x, t.y - 1, t.z)]) {
        w.set(t.x, t.y, t.z, B.barrel);
        t.hp = TILE_DEFS.barrel.hp;
        t.broken = false;
      } else t.respawnAt = this.game.now + 60;
      return;
    }
    if (t.container?.isEmpty()) this.fillLoot(t);
  }

  private process(t: Tile, dt: number) {
    const c = t.container!;
    if (!t.lit) return;
    const smelting = t.kind === 'furnace';
    // something to do?
    let work = false;
    for (let i = 1; i < c.size; i++) {
      const s = c.get(i);
      const d = s && tryItemDef(s.id);
      if (d && ((smelting && d.smeltsTo) || d.cooksTo)) work = true;
    }
    if (smelting && !work) {
      t.lit = false;
      return;
    }
    // fuel
    t.fuelLeft = (t.fuelLeft ?? 0) - dt;
    if (t.fuelLeft <= 0) {
      const f = c.get(0);
      const fd = f && tryItemDef(f.id);
      if (!f || !fd?.fuel) {
        t.lit = false;
        t.fuelLeft = 0;
        return;
      }
      removeItem([c], f.id, 1);
      t.fuelLeft += fd.fuel;
      if (f.id === 'wood' && this.rnd() < 0.75) addStack(c, makeStack('charcoal', 1), [5, 4, 3, 2, 1]);
    }
    // process items
    for (let i = 1; i < c.size; i++) {
      const s = c.get(i);
      if (!s) {
        t.progress![i] = 0;
        continue;
      }
      const d = tryItemDef(s.id);
      const out = smelting ? d?.smeltsTo ?? d?.cooksTo : d?.cooksTo;
      if (!out) continue;
      const time = smelting ? (d?.smeltsTo ? 1 : 4) : s.id === 'raw_meat' ? 10 : 30;
      t.progress![i] += dt;
      if (t.progress![i] < time) continue;
      t.progress![i] = 0;
      const produced = makeStack(out, 1);
      // output must fit somewhere other than the fuel slot
      const before = countItem([c], out);
      const left = addStack(c, produced, [i, 5, 4, 3, 2, 1].filter((x) => x !== 0));
      if (left === 0 && countItem([c], out) > before) removeItem([c], s.id, 1);
    }
  }

  // ------------------------------------------------------------- persistence
  saveObjects() {
    const out: Array<{ id: number; kind: string; data: string }> = [];
    let i = 0;
    for (const t of this.tiles.values()) {
      out.push({
        id: -1 - i++,
        kind: 'tile',
        data: JSON.stringify({
          kind: t.kind, x: t.x, y: t.y, z: t.z, owner: t.owner, hp: t.hp, slots: t.container?.toJSON(), lock: t.lock,
          lit: t.lit, fuelLeft: t.fuelLeft, auth: t.auth, id: t.id, label: t.label,
          ready: t.readyAt !== undefined ? Math.max(0, t.readyAt - this.game.now) : undefined,
          poi: t.poi, respawnIn: t.respawnAt !== undefined ? Math.max(0, t.respawnAt - this.game.now) : undefined, broken: t.broken,
        }),
      });
    }
    return out;
  }

  loadTile(d: {
    kind: string; x: number; y: number; z: number; owner: string; hp: number; slots?: (ItemStack | null)[]; lock?: Lock; lit?: boolean; fuelLeft?: number;
    auth?: string[]; id?: number; label?: string; ready?: number; poi?: boolean; respawnIn?: number; broken?: boolean;
  }) {
    if (!TILE_DEFS[d.kind]) return;
    const t = this.create(d.kind, d.x, d.y, d.z, d.owner);
    t.hp = d.hp;
    if (d.slots && t.container) t.container.load(d.slots);
    t.lock = d.lock;
    t.lit = d.lit;
    t.fuelLeft = d.fuelLeft;
    if (d.auth) t.auth = d.auth;
    if (d.id !== undefined) t.id = d.id;
    if (d.label) t.label = d.label;
    if (d.ready !== undefined) t.readyAt = this.game.now + d.ready;
    t.poi = d.poi;
    if (d.respawnIn !== undefined) t.respawnAt = this.game.now + d.respawnIn;
    t.broken = d.broken;
  }

  /** Re-link totems to buildings after everything is loaded. */
  relinkTotems() {
    for (const t of this.tiles.values()) {
      if (t.kind !== 'claim_totem') continue;
      const piece = this.game.building.pieceAt(t.x, t.y - 1, t.z);
      if (piece) this.game.building.attachTotem(piece.building, t.key);
    }
  }
}
