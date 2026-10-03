/**
 * ContainerSystem: wires container menus/screens into the game.
 *  - `ui.inventoryFactory` (E): player inventory screen (2x2 crafting, armour, offhand)
 *  - block `onUse`: crafting_table, furnace/lit_furnace, smoker, blast_furnace, chest, trapped_chest
 *    (adjacent same-facing chests open as a 54-slot double chest), ender_chest (per-player
 *    `player.data.enderItems`), barrel, dispenser, dropper, hopper, enchanting_table, anvil, brewing_stand
 *  - block entities `{ type, items: [serializeStack...], ... }` via world.get/setBlockEntity;
 *    `loot` tables filled on first open / break; contents dropped when the block is removed
 *  - ticks loaded furnaces (furnace <-> lit_furnace keeps facing) and brewing stands
 *  - `game.containers` service: { open(screen), openMerchant(merchant), storageAt(x,y,z) }
 *
 * Events: containerOpen/containerClose {player, kind, pos, block}, craft {player, stack},
 * smelt {pos, kind, input, output}, furnaceTake {player, stack, xp}, enchant, anvilUse, brew {pos},
 * trade, tradeXp.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import type { World } from '../../world/world';
import { SetFlags } from '../../world/world';
import { addBehavior } from '../../world/blocks/behaviors';
import { BLOCKS, BLOCK_BY_NAME, T_FULL_CUBE, stateOf } from '../../world/blocks/registry';
import { deserializeStack, type ItemStack } from '../items/registry';
import type { MenuHost } from './menu';
import { SerializedStorage, CompoundStorage, comparatorSignal, type SlotStorage } from './storage';
import { InventoryMenu, CraftingMenu, ChestMenu, DispenserMenu, HopperMenu, FurnaceMenu, BrewingMenu, EnchantmentMenu, AnvilMenu, MerchantMenu } from './menus';
import type { Merchant } from './trading';
import { installCrafting } from '../crafting';
import { newFurnaceData, tickFurnace, rollFurnaceXp, type FurnaceData, type FurnaceKind } from '../crafting/smelting';
import { newBrewingData, tickBrewing, type BrewingData } from '../brewing/brewing';
import { fillWithLoot } from '../loot/lootTables';
import { countBookshelves } from '../enchant/table';
import { anvilDamageRoll } from '../enchant/anvil';
import { installEnchantmentEffects } from '../enchant/effects';
import { BasicContainerScreen, InventoryScreen, CraftingScreen, FurnaceScreen, BrewingScreen, EnchantmentScreen, AnvilScreen, MerchantScreen } from '../../ui/containers/screens';
import type { ContainerScreen } from '../../ui/containers/screen';

const FURNACES: Record<string, FurnaceKind> = { furnace: 'furnace', lit_furnace: 'furnace', smoker: 'smoker', blast_furnace: 'blast_furnace' };
const SIZES: Record<string, number> = { chest: 27, trapped_chest: 27, barrel: 27, dispenser: 9, dropper: 9, hopper: 5 };
const TITLES: Record<string, string> = { chest: 'Chest', trapped_chest: 'Chest', barrel: 'Barrel', dispenser: 'Dispenser', dropper: 'Dropper', hopper: 'Item Hopper', furnace: 'Furnace', smoker: 'Smoker', blast_furnace: 'Blast Furnace', brewing_stand: 'Brewing Stand', ender_chest: 'Ender Chest' };
const HDIR: [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // hfacing S,W,N,E -> dx,dz

const storages = new WeakMap<object, SerializedStorage>();

export class ContainerSystem implements GameSystem {
  readonly name = 'containers';
  private game!: Game;

  init(game: Game) {
    this.game = game;
    installCrafting();
    installEnchantmentEffects(game);
    (game as any).containers = {
      open: (s: ContainerScreen) => game.ui?.open(s),
      openMerchant: (m: Merchant, player?: any) => this.openMerchant(m, player),
      storageAt: (x: number, y: number, z: number) => this.storageAt(game.world, x, y, z),
    };
    if (game.ui) game.ui.inventoryFactory = (ui: any) => new InventoryScreen(ui, new InventoryMenu(this.host()));
    this.installBehaviors();
    this.testHarness();
  }

  // ------------------------------------------------------------------ helpers
  host(): MenuHost {
    const g = this.game;
    return {
      get player() {
        return g.player;
      },
      game: g,
      drop: (s: ItemStack) => {
        const p = g.player;
        const dir = p.lookDir();
        const pos = p.eyePos.addScaledVector(dir, 0.3).add(new THREE.Vector3(0, -0.3, 0));
        g.dropItem(s, pos, dir.multiplyScalar(6).add(new THREE.Vector3(0, 2, 0)), 40);
        g.events.emit('itemDropped', { player: p, stack: s });
      },
      emit: (n: string, p: any) => g.events.emit(n, p),
    };
  }

  private validAt(x: number, y: number, z: number, names: string[]) {
    return () => {
      const g = this.game;
      const st = g.world.getBlock(x, y, z);
      if (!names.includes(BLOCKS[st >>> 4]?.name)) return false;
      return g.player.pos.distanceToSquared(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)) <= 64;
    };
  }

  /** Get or create a block entity of a type. */
  private be<T = any>(w: World, x: number, y: number, z: number, type: string, make: () => any): T {
    let be = w.getBlockEntity(x, y, z);
    if (!be || (be.type && be.type !== type && !(FURNACES[be.type] && FURNACES[type]))) {
      be = { ...make(), ...(be?.loot ? { loot: be.loot } : {}) };
      w.setBlockEntity(x, y, z, be);
    }
    if (!be.type) be.type = type;
    return be as T;
  }

  private storageOf(w: World, x: number, y: number, z: number, be: any, size: number): SerializedStorage {
    let s = storages.get(be);
    if (!s) {
      s = new SerializedStorage(be, 'items', size);
      s.onFlush = () => w.setBlockEntity(x, y, z, be);
      storages.set(be, s);
    }
    if (be.loot) {
      const table = be.loot;
      delete be.loot;
      fillWithLoot(s, table, (be.lootSeed ?? (w.seed ^ (x * 73856093) ^ (y * 19349663) ^ (z * 83492791))) | 0);
    }
    return s;
  }

  /** Container storage at a position (hoppers / redstone workstreams). */
  storageAt(w: World, x: number, y: number, z: number): SlotStorage | null {
    const name = BLOCKS[w.getBlock(x, y, z) >>> 4]?.name;
    if (!name) return null;
    if (SIZES[name]) return this.storageOf(w, x, y, z, this.be(w, x, y, z, name, () => ({ type: name, items: new Array(SIZES[name]).fill(null) })), SIZES[name]);
    if (FURNACES[name]) return this.storageOf(w, x, y, z, this.be(w, x, y, z, FURNACES[name], () => newFurnaceData(FURNACES[name])), 3);
    if (name === 'brewing_stand') return this.storageOf(w, x, y, z, this.be(w, x, y, z, 'brewing_stand', newBrewingData), 5);
    return null;
  }

  private chestPartner(w: World, x: number, y: number, z: number, state: number): [number, number, number] | null {
    const id = state >>> 4, f = state & 3;
    for (const side of [(f + 1) & 3, (f + 3) & 3]) {
      const [dx, dz] = HDIR[side];
      const o = w.getBlock(x + dx, y, z + dz);
      if (o >>> 4 === id && (o & 3) === f) return [x + dx, y, z + dz];
    }
    return null;
  }

  private open(screen: ContainerScreen) {
    this.game.ui?.open(screen);
  }

  openMerchant(m: Merchant, _player?: any) {
    const menu = new MerchantMenu(this.host(), m, undefined, () => !m.pos || this.game.player.pos.distanceTo(m.pos as any) < 8);
    this.open(new MerchantScreen(this.game.ui, menu));
  }

  // ------------------------------------------------------------------ block behaviours
  private installBehaviors() {
    const g = this.game;
    const blocked = (w: World, x: number, y: number, z: number) => T_FULL_CUBE[w.getBlock(x, y + 1, z) >>> 4] === 1;
    const pos = (x: number, y: number, z: number) => ({ x, y, z });
    const has = (n: string) => BLOCK_BY_NAME.has(n);

    addBehavior('crafting_table', {
      onUse: (_w, x, y, z) => {
        this.open(new CraftingScreen(g.ui, new CraftingMenu(this.host(), this.validAt(x, y, z, ['crafting_table'])), { pos: pos(x, y, z), block: 'crafting_table' }));
        return true;
      },
    });
    for (const n of Object.keys(FURNACES).filter(has)) {
      const kind = FURNACES[n];
      addBehavior(n, {
        onUse: (w, x, y, z) => {
          const be = this.be<FurnaceData>(w, x, y, z, kind, () => newFurnaceData(kind));
          const st = this.storageOf(w, x, y, z, be, 3);
          const names = kind === 'furnace' ? ['furnace', 'lit_furnace'] : [n];
          const menu = new FurnaceMenu(this.host(), kind, st, be, TITLES[kind], this.validAt(x, y, z, names));
          menu.onXp = (xp) => xp > 0 && g.spawnXp(g.player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), xp);
          this.open(new FurnaceScreen(g.ui, menu, { pos: pos(x, y, z), block: n, kind }));
          return true;
        },
        getComparatorOutput: (w, x, y, z) => comparatorSignal(this.storageAt(w, x, y, z)),
      });
    }
    for (const n of ['chest', 'trapped_chest'].filter(has)) {
      addBehavior(n, {
        onUse: (w, x, y, z, state) => {
          const partner = this.chestPartner(w, x, y, z, state);
          if (blocked(w, x, y, z) || (partner && blocked(w, ...partner))) return true;
          const mk = () => ({ type: n, items: new Array(27).fill(null) });
          const a = this.storageOf(w, x, y, z, this.be(w, x, y, z, n, mk), 27);
          let st: SlotStorage = a, rows = 3, title = 'Chest';
          const valid = [this.validAt(x, y, z, [n])];
          if (partner) {
            const b = this.storageOf(w, ...partner, this.be(w, ...partner, n, mk), 27);
            // the half on the viewer's left comes first (west/north)
            const first = partner[0] < x || partner[2] < z;
            st = new CompoundStorage(first ? [b, a] : [a, b]);
            rows = 6;
            title = 'Large Chest';
            valid.push(this.validAt(...partner, [n]));
          }
          this.open(new BasicContainerScreen(g.ui, new ChestMenu(this.host(), n, st, rows, title, () => valid.every((v) => v())), { pos: pos(x, y, z), block: n, kind: n }));
          return true;
        },
        getComparatorOutput: (w, x, y, z) => comparatorSignal(this.storageAt(w, x, y, z)),
      });
    }
    if (has('ender_chest'))
      addBehavior('ender_chest', {
        onUse: (w, x, y, z) => {
          if (blocked(w, x, y, z)) return true;
          const st = new SerializedStorage(g.player.data, 'enderItems', 27);
          this.open(new BasicContainerScreen(g.ui, new ChestMenu(this.host(), 'ender_chest', st, 3, 'Ender Chest', this.validAt(x, y, z, ['ender_chest'])), { pos: pos(x, y, z), block: 'ender_chest' }));
          return true;
        },
      });
    for (const n of ['barrel', 'dispenser', 'dropper', 'hopper'].filter(has)) {
      addBehavior(n, {
        onUse: (w, x, y, z) => {
          const st = this.storageAt(w, x, y, z)!;
          const valid = this.validAt(x, y, z, [n]);
          const h = this.host();
          const menu = n === 'barrel' ? new ChestMenu(h, n, st, 3, TITLES[n], valid) : n === 'hopper' ? new HopperMenu(h, st, TITLES[n], valid) : new DispenserMenu(h, n as 'dispenser' | 'dropper', st, TITLES[n], valid);
          this.open(new BasicContainerScreen(g.ui, menu, { pos: pos(x, y, z), block: n, kind: n, titleCentered: n === 'dispenser' || n === 'dropper' }));
          return true;
        },
        getComparatorOutput: (w, x, y, z) => comparatorSignal(this.storageAt(w, x, y, z)),
      });
    }
    if (has('enchanting_table'))
      addBehavior('enchanting_table', {
        onUse: (w, x, y, z) => {
          const menu = new EnchantmentMenu(this.host(), () => countBookshelves(w, x, y, z), 'Enchant', this.validAt(x, y, z, ['enchanting_table']));
          this.open(new EnchantmentScreen(g.ui, menu, { pos: pos(x, y, z), block: 'enchanting_table' }));
          return true;
        },
      });
    if (has('anvil'))
      addBehavior('anvil', {
        onUse: (w, x, y, z) => {
          const menu = new AnvilMenu(this.host(), 'Repair & Name', this.validAt(x, y, z, ['anvil']));
          menu.onUsed = (player: any) => {
            if (player.creative) return;
            const st = w.getBlock(x, y, z);
            const r = anvilDamageRoll(st & 15);
            if (!r) return;
            if (r.destroyed) {
              w.setBlock(x, y, z, 0, SetFlags.ALL);
              g.events.emit('anvilDestroyed', { x, y, z });
            } else w.setBlock(x, y, z, stateOf(st >>> 4, r.meta), SetFlags.ALL);
          };
          this.open(new AnvilScreen(g.ui, menu, { pos: pos(x, y, z), block: 'anvil' }));
          return true;
        },
      });
    if (has('brewing_stand'))
      addBehavior('brewing_stand', {
        onUse: (w, x, y, z) => {
          const be = this.be<BrewingData>(w, x, y, z, 'brewing_stand', newBrewingData);
          const st = this.storageOf(w, x, y, z, be, 5);
          this.open(new BrewingScreen(g.ui, new BrewingMenu(this.host(), st, be, 'Brewing Stand', this.validAt(x, y, z, ['brewing_stand'])), { pos: pos(x, y, z), block: 'brewing_stand' }));
          return true;
        },
      });

    // contents drop when the block is removed (not when furnace <-> lit_furnace swaps)
    const family = (n: string) => (FURNACES[n] === 'furnace' ? 'furnace' : n);
    const containerBlocks = [...Object.keys(SIZES), ...Object.keys(FURNACES), 'brewing_stand'].filter(has);
    addBehavior(containerBlocks, {
      onRemove: (w, x, y, z, oldState, newState) => {
        if (newState && family(BLOCKS[newState >>> 4].name) === family(BLOCKS[oldState >>> 4].name)) return;
        const be = w.getBlockEntity(x, y, z);
        if (!be) return;
        const size = Array.isArray(be.items) ? be.items.length : 0;
        const st = this.storageOf(w, x, y, z, be, Math.max(size, SIZES[BLOCKS[oldState >>> 4].name] ?? size));
        if (w === g.world) {
          for (let i = 0; i < st.size; i++) {
            const s = st.get(i);
            if (s) g.dropItem(s, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), undefined, 10);
          }
          if (typeof be.xp === 'number' && be.xp > 0) {
            const xp = rollFurnaceXp(be.xp);
            if (xp > 0) g.spawnXp(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), xp);
          }
        }
        w.setBlockEntity(x, y, z, null);
      },
    });
  }

  // ------------------------------------------------------------------ ticking
  tick(game: Game) {
    const w = game.world;
    if (!w) return;
    for (const c of w.chunks.values()) {
      if (!c.blockEntities.size) continue;
      for (const [k, be] of c.blockEntities) {
        const t = be?.type;
        if (t !== 'furnace' && t !== 'smoker' && t !== 'blast_furnace' && t !== 'brewing_stand') continue;
        const x = c.cx * 16 + (k & 15), z = c.cz * 16 + ((k >> 4) & 15), y = k >> 8;
        try {
          if (t === 'brewing_stand') this.tickBrewingAt(game, w, x, y, z, be);
          else this.tickFurnaceAt(game, w, x, y, z, be);
        } catch (e) {
          console.warn('container tick failed', e);
        }
      }
    }
  }

  private tickFurnaceAt(game: Game, w: World, x: number, y: number, z: number, be: FurnaceData) {
    if (be.burn <= 0 && be.cook <= 0 && !(be.items?.[0] && be.items?.[1])) return;
    const st = this.storageOf(w, x, y, z, be, 3);
    const r = tickFurnace(be, st);
    if (r.smelted) game.events.emit('smelt', { pos: { x, y, z }, kind: be.type, input: r.smelted.input.name, output: r.smelted.output });
    if (r.litChanged && be.type === 'furnace') {
      const cur = w.getBlock(x, y, z);
      const name = r.lit ? 'lit_furnace' : 'furnace';
      const b = BLOCK_BY_NAME.get(name);
      if (b && BLOCKS[cur >>> 4].name !== name) w.setBlock(x, y, z, stateOf(b.id, cur & 15), SetFlags.ALL);
    }
    if (r.changed) w.setBlockEntity(x, y, z, be);
  }

  private tickBrewingAt(game: Game, w: World, x: number, y: number, z: number, be: BrewingData) {
    if (be.brewTime <= 0 && !be.items?.[3]) return;
    const st = this.storageOf(w, x, y, z, be, 5);
    const r = tickBrewing(be, st);
    if (r.brewed) game.events.emit('brew', { pos: { x, y, z } });
    if (r.dropRemainder) game.dropItem(r.dropRemainder, new THREE.Vector3(x + 0.5, y + 1, z + 0.5));
    if (r.changed) w.setBlockEntity(x, y, z, be);
  }

  // ------------------------------------------------------------------ test harness (?screen=)
  private testHarness() {
    if (typeof location === 'undefined') return;
    const which = new URLSearchParams(location.search).get('screen');
    if (!which) return;
    const g = this.game;
    const off = g.events.on('worldReady', async () => {
      off();
      const dev = await import('../../debug/devItems');
      dev.registerDevItems();
      const inv = g.player.inventory;
      const give = (i: number, n: string, c = 1, extra: any = {}) => {
        const s = deserializeStack({ i: n, c, ...extra });
        if (s) inv.set(i, s);
      };
      give(0, 'diamond_sword', 1, { e: { sharpness: 5, unbreaking: 3 } });
      give(1, 'iron_pickaxe', 1, { d: 120 });
      give(2, 'oak_log', 16);
      give(3, 'cobblestone', 64);
      give(4, 'coal', 23);
      give(5, 'raw_iron', 12);
      give(6, 'bread', 7);
      give(7, 'torch', 32);
      give(9, 'oak_planks', 40);
      give(10, 'stick', 12);
      give(11, 'iron_ingot', 9);
      give(12, 'diamond', 3);
      give(38, 'iron_chestplate');
      g.player.xpLevel = 30;
      // place a block in front of the player and use it
      const p = g.player;
      const bx = Math.floor(p.pos.x) + 2, by = Math.floor(p.pos.y), bz = Math.floor(p.pos.z);
      const place = (n: string) => {
        g.world.setBlock(bx, by, bz, stateOf(BLOCK_BY_NAME.get(n)!.id, 0), SetFlags.ALL);
        return BLOCK_BY_NAME.get(n)!;
      };
      const use = (n: string) => {
        const b = place(n);
        const beh = (g as any).behavior(stateOf(b.id, 0));
        beh?.onUse?.(g.world, bx, by, bz, g.world.getBlock(bx, by, bz), p, { x: bx, y: by, z: bz, face: 1, px: bx + 0.5, py: by + 1, pz: bz + 0.5 });
      };
      if (which === 'inventory') g.ui?.open(g.ui.inventoryFactory!(g.ui)!);
      else if (which === 'crafting') {
        use('crafting_table');
      } else if (which === 'furnace') {
        place('furnace');
        const st = this.storageAt(g.world, bx, by, bz)!;
        st.set(0, deserializeStack({ i: 'raw_iron', c: 8 }));
        st.set(1, deserializeStack({ i: 'coal', c: 3 }));
        st.set(2, deserializeStack({ i: 'iron_ingot', c: 2 }));
        use('furnace');
      } else if (which === 'chest') {
        place('chest');
        g.world.setBlockEntity(bx, by, bz, { type: 'chest', loot: 'dungeon' });
        use('chest');
      } else use(which);
      (window as any).__shotReady = true;
    });
  }
}
