import { describe, it, expect, beforeAll } from 'vitest';
import '../src/world/blocks/blocks';
import { itemByName, type ItemStack } from '../src/game/items/registry';
import { registerDevItems } from '../src/debug/devItems';
import { installCrafting } from '../src/game/crafting';
import { Player } from '../src/entity/player';
import { getQuickcraftMask, OUTSIDE, type MenuHost } from '../src/game/containers/menu';
import { SimpleContainer } from '../src/game/containers/storage';
import { InventoryMenu, CraftingMenu, ChestMenu, FurnaceMenu, BrewingMenu, EnchantmentMenu, AnvilMenu, MerchantMenu, HopperMenu } from '../src/game/containers/menus';
import { newFurnaceData } from '../src/game/crafting/smelting';
import { newBrewingData } from '../src/game/brewing/brewing';
import type { Merchant, TradeOffer } from '../src/game/containers/trading';

const S = (n: string, count = 1, extra: Partial<ItemStack> = {}): ItemStack => ({ item: itemByName(n), count, damage: 0, ...extra });

function host(creative = false) {
  const player = new Player();
  if (creative) player.setGameMode('creative');
  const dropped: ItemStack[] = [];
  const events: [string, any][] = [];
  const h: MenuHost & { dropped: ItemStack[]; events: [string, any][] } = { player, drop: (s) => dropped.push(s), emit: (n, p) => events.push([n, p]), dropped, events };
  return h;
}
const names = (st: { get(i: number): ItemStack | null; size: number }) => Array.from({ length: st.size }, (_, i) => (st.get(i) ? `${st.get(i)!.item.name}x${st.get(i)!.count}` : '-'));

beforeAll(() => {
  registerDevItems();
  installCrafting();
});

function chest(h = host()) {
  const st = new SimpleContainer(27);
  const m = new ChestMenu(h, 'chest', st, 3, 'Chest');
  return { h, st, m, inv: h.player.inventory };
}

describe('pickup / place / swap / merge', () => {
  it('left click picks up whole stack, places it back', () => {
    const { st, m } = chest();
    st.set(0, S('stone', 40));
    m.clicked(0, 0, 'pickup');
    expect(m.carried?.count).toBe(40);
    expect(st.get(0)).toBeNull();
    m.clicked(5, 0, 'pickup');
    expect(st.get(5)?.count).toBe(40);
    expect(m.carried).toBeNull();
  });
  it('right click picks up half (rounded up) and places one', () => {
    const { st, m } = chest();
    st.set(0, S('stone', 41));
    m.clicked(0, 1, 'pickup');
    expect(m.carried?.count).toBe(21);
    expect(st.get(0)?.count).toBe(20);
    m.clicked(1, 1, 'pickup');
    m.clicked(2, 1, 'pickup');
    expect(st.get(1)?.count).toBe(1);
    expect(st.get(2)?.count).toBe(1);
    expect(m.carried?.count).toBe(19);
    m.clicked(0, 1, 'pickup'); // place one onto same item
    expect(st.get(0)?.count).toBe(21);
  });
  it('merges into same stacks up to 64, swaps different items', () => {
    const { st, m } = chest();
    st.set(0, S('stone', 50));
    m.setCarried(S('stone', 30));
    m.clicked(0, 0, 'pickup');
    expect(st.get(0)?.count).toBe(64);
    expect(m.carried?.count).toBe(16);
    m.clicked(1, 0, 'pickup');
    st.set(2, S('dirt', 5));
    m.setCarried(S('diamond', 3));
    m.clicked(2, 0, 'pickup');
    expect(st.get(2)?.item.name).toBe('diamond');
    expect(m.carried?.item.name).toBe('dirt');
  });
  it('unstackable items do not merge', () => {
    const { st, m } = chest();
    st.set(0, S('iron_sword'));
    m.setCarried(S('iron_sword'));
    m.clicked(0, 0, 'pickup');
    expect(st.get(0)?.item.name).toBe('iron_sword');
    expect(m.carried?.item.name).toBe('iron_sword');
  });
  it('click outside drops all (left) or one (right)', () => {
    const { h, m } = chest();
    m.setCarried(S('stone', 10));
    m.clicked(OUTSIDE, 1, 'pickup');
    expect(h.dropped[0].count).toBe(1);
    expect(m.carried?.count).toBe(9);
    m.clicked(OUTSIDE, 0, 'pickup');
    expect(h.dropped[1].count).toBe(9);
    expect(m.carried).toBeNull();
  });
});

describe('shift click', () => {
  it('chest <-> player inventory (chest to inventory fills from hotbar end)', () => {
    const { st, m, inv } = chest();
    st.set(0, S('stone', 64));
    m.clicked(0, 0, 'quick_move');
    expect(st.get(0)).toBeNull();
    expect(inv.get(8)?.count).toBe(64); // reverse order: last hotbar slot first
    m.clicked(27 + 27 + 8, 0, 'quick_move'); // hotbar slot 8 back into chest
    expect(st.get(0)?.count).toBe(64);
  });
  it('player inventory: main <-> hotbar, armour to armour slot', () => {
    const h = host();
    const m = new InventoryMenu(h);
    const inv = h.player.inventory;
    inv.set(9, S('dirt', 10));
    m.clicked(9, 0, 'quick_move');
    expect(inv.get(0)?.item.name).toBe('dirt');
    m.clicked(36, 0, 'quick_move');
    expect(inv.get(9)?.item.name).toBe('dirt');
    inv.set(10, S('iron_helmet'));
    m.clicked(10, 0, 'quick_move');
    expect(inv.get(39)?.item.name).toBe('iron_helmet');
    inv.set(11, S('diamond_boots'));
    m.clicked(11, 0, 'quick_move');
    expect(inv.get(36)?.item.name).toBe('diamond_boots');
  });
  it('crafting table: inventory goes into the grid first; result crafts repeatedly', () => {
    const h = host();
    const m = new CraftingMenu(h);
    const inv = h.player.inventory;
    inv.set(0, S('oak_log', 3));
    m.clicked(37, 0, 'quick_move'); // hotbar 0 -> grid
    expect(m.grid.get(0)?.count).toBe(3);
    expect(m.slots[0].item?.item.name).toBe('oak_planks');
    m.clicked(0, 0, 'quick_move');
    expect(m.grid.get(0)).toBeNull();
    expect(inv.count(itemByName('oak_planks'))).toBe(12);
    expect(h.events.filter((e) => e[0] === 'craft').length).toBeGreaterThan(0);
  });
  it('furnace: smeltable -> input, fuel -> fuel slot, result -> inventory', () => {
    const h = host();
    const st = new SimpleContainer(3);
    const m = new FurnaceMenu(h, 'furnace', st, newFurnaceData('furnace'), 'Furnace');
    const inv = h.player.inventory;
    inv.set(9, S('raw_iron', 5));
    inv.set(10, S('coal', 3));
    inv.set(11, S('stone_bricks', 3)); // smeltable (cracked)
    inv.set(12, S('stick', 3)); // fuel only
    m.clicked(3, 0, 'quick_move');
    m.clicked(4, 0, 'quick_move');
    expect(st.get(0)?.item.name).toBe('raw_iron');
    expect(st.get(1)?.item.name).toBe('coal');
    m.clicked(5, 0, 'quick_move'); // smeltable but the input is occupied: stays put (vanilla)
    expect(inv.get(11)?.item.name).toBe('stone_bricks');
    m.clicked(6, 0, 'quick_move'); // fuel slot holds coal: sticks stay put too
    expect(inv.get(12)?.item.name).toBe('stick');
    st.set(2, S('iron_ingot', 4));
    m.clicked(2, 0, 'quick_move');
    expect(inv.count(itemByName('iron_ingot'))).toBe(4);
  });
  it('brewing stand routing', () => {
    const h = host();
    const st = new SimpleContainer(5);
    const m = new BrewingMenu(h, st, newBrewingData(), 'Brewing Stand');
    const inv = h.player.inventory;
    inv.set(9, S('blaze_powder', 4));
    inv.set(10, S('nether_wart', 2));
    inv.set(11, S('potion', 1, { data: { potion: 'water' } }));
    m.clicked(5, 0, 'quick_move');
    m.clicked(6, 0, 'quick_move');
    m.clicked(7, 0, 'quick_move');
    expect(names(st)).toEqual(['potionx1', '-', '-', 'nether_wartx2', 'blaze_powderx4']);
  });
  it('enchanting table takes one item and lapis', () => {
    const h = host();
    const m = new EnchantmentMenu(h, () => 15);
    const inv = h.player.inventory;
    inv.set(9, S('lapis_lazuli', 10));
    inv.set(10, S('diamond_sword'));
    m.clicked(2, 0, 'quick_move');
    m.clicked(3, 0, 'quick_move');
    expect(m.inputs.get(0)?.item.name).toBe('diamond_sword');
    expect(m.inputs.get(1)?.count).toBe(10);
    expect(m.offers.costs[2]).toBeGreaterThanOrEqual(30);
  });
  it('hopper routing', () => {
    const h = host();
    const st = new SimpleContainer(5);
    const m = new HopperMenu(h, st, 'Hopper');
    h.player.inventory.set(0, S('dirt', 64));
    m.clicked(5 + 27, 0, 'quick_move');
    expect(st.get(0)?.count).toBe(64);
  });
});

describe('number keys, throw, clone, double click, drag', () => {
  it('number key swaps hovered slot with hotbar', () => {
    const { st, m, inv } = chest();
    st.set(3, S('diamond', 2));
    inv.set(4, S('dirt', 7));
    m.clicked(3, 4, 'swap');
    expect(st.get(3)?.item.name).toBe('dirt');
    expect(inv.get(4)?.item.name).toBe('diamond');
    m.clicked(3, 40, 'swap'); // F: offhand
    expect(inv.get(40)?.item.name).toBe('dirt');
    expect(st.get(3)).toBeNull();
  });
  it('Q drops one, Ctrl+Q drops stack', () => {
    const { h, st, m } = chest();
    st.set(0, S('stone', 10));
    m.clicked(0, 0, 'throw');
    expect(h.dropped[0].count).toBe(1);
    m.clicked(0, 1, 'throw');
    expect(h.dropped[1].count).toBe(9);
    expect(st.get(0)).toBeNull();
  });
  it('middle click clones a full stack only in creative', () => {
    const s = chest();
    s.st.set(0, S('stone', 1));
    s.m.clicked(0, 2, 'clone');
    expect(s.m.carried).toBeNull();
    const c = chest(host(true));
    c.st.set(0, S('stone', 1));
    c.m.clicked(0, 2, 'clone');
    expect(c.m.carried?.count).toBe(64);
    expect(c.st.get(0)?.count).toBe(1);
  });
  it('double click collects matching items (partial stacks first)', () => {
    const { st, m, inv } = chest();
    st.set(0, S('stone', 10));
    st.set(1, S('stone', 64));
    st.set(2, S('stone', 5));
    inv.set(0, S('stone', 20));
    m.setCarried(S('stone', 1));
    m.clicked(10, 0, 'pickup_all');
    // pass 1 takes partial stacks (10+5+20), pass 2 tops up from the full stack
    expect(m.carried?.count).toBe(64);
    expect(st.get(0)).toBeNull();
    expect(st.get(1)?.count).toBe(36);
  });
  it('left drag splits evenly, right drag places one each', () => {
    const { st, m } = chest();
    m.setCarried(S('stone', 10));
    m.clicked(OUTSIDE, getQuickcraftMask(0, 0), 'quick_craft');
    for (const i of [0, 1, 2]) m.clicked(i, getQuickcraftMask(1, 0), 'quick_craft');
    m.clicked(OUTSIDE, getQuickcraftMask(2, 0), 'quick_craft');
    expect([st.get(0)?.count, st.get(1)?.count, st.get(2)?.count]).toEqual([3, 3, 3]);
    expect(m.carried?.count).toBe(1);
    m.setCarried(S('dirt', 5));
    m.clicked(OUTSIDE, getQuickcraftMask(0, 1), 'quick_craft');
    for (const i of [5, 6, 7]) m.clicked(i, getQuickcraftMask(1, 1), 'quick_craft');
    m.clicked(OUTSIDE, getQuickcraftMask(2, 1), 'quick_craft');
    expect([st.get(5)?.count, st.get(6)?.count, st.get(7)?.count]).toEqual([1, 1, 1]);
    expect(m.carried?.count).toBe(2);
  });
  it('drag cannot add more slots than items', () => {
    const { st, m } = chest();
    m.setCarried(S('stone', 2));
    m.clicked(OUTSIDE, getQuickcraftMask(0, 0), 'quick_craft');
    for (const i of [0, 1, 2, 3]) m.clicked(i, getQuickcraftMask(1, 0), 'quick_craft');
    m.clicked(OUTSIDE, getQuickcraftMask(2, 0), 'quick_craft');
    expect(names(st).slice(0, 4)).toEqual(['stonex1', 'stonex1', '-', '-']);
  });
  it('closing returns cursor and crafting grid to the inventory', () => {
    const h = host();
    const m = new InventoryMenu(h);
    m.grid.set(0, S('oak_log', 2));
    m.setCarried(S('stone', 5));
    m.removed();
    expect(h.player.inventory.count(itemByName('oak_log'))).toBe(2);
    expect(h.player.inventory.count(itemByName('stone'))).toBe(5);
  });
  it('binding curse armour cannot be removed in survival', () => {
    const h = host();
    const m = new InventoryMenu(h);
    h.player.inventory.set(39, S('iron_helmet', 1, { ench: { binding_curse: 1 } }));
    m.clicked(5, 0, 'pickup');
    expect(m.carried).toBeNull();
  });
});

describe('crafting result slot', () => {
  it('taking the result consumes one of each ingredient and returns buckets', () => {
    const h = host();
    const m = new CraftingMenu(h);
    const mb = 'milk_bucket';
    [mb, mb, mb, 'sugar', 'egg', 'sugar', 'wheat', 'wheat', 'wheat'].forEach((n, i) => m.grid.set(i, S(n, n === mb ? 1 : 2)));
    expect(m.slots[0].item?.item.name).toBe('cake');
    m.clicked(0, 0, 'pickup');
    expect(m.carried?.item.name).toBe('cake');
    expect(names(m.grid)).toEqual(['bucketx1', 'bucketx1', 'bucketx1', 'sugarx1', 'eggx1', 'sugarx1', 'wheatx1', 'wheatx1', 'wheatx1']);
    expect(m.slots[0].item).toBeNull();
  });
  it('clicking result while holding the same item adds when it fits', () => {
    const h = host();
    const m = new CraftingMenu(h);
    m.grid.set(0, S('oak_log', 2));
    m.clicked(0, 0, 'pickup');
    m.clicked(0, 0, 'pickup');
    expect(m.carried?.count).toBe(8);
    expect(m.grid.get(0)).toBeNull();
  });
});

describe('anvil and enchanting via menu', () => {
  it('anvil rename costs 1 level and takes levels on output', () => {
    const h = host();
    h.player.xpLevel = 5;
    const m = new AnvilMenu(h);
    m.inputs.set(0, S('diamond_sword'));
    m.setItemName('Excalibur');
    expect(m.state.cost).toBe(1);
    m.clicked(2, 0, 'pickup');
    expect(m.carried?.data?.name).toBe('Excalibur');
    expect(h.player.xpLevel).toBe(4);
    expect(m.inputs.get(0)).toBeNull();
  });
  it('anvil output cannot be taken without enough levels', () => {
    const h = host();
    h.player.xpLevel = 0;
    const m = new AnvilMenu(h);
    m.inputs.set(0, S('diamond_sword'));
    m.setItemName('X');
    m.clicked(2, 0, 'pickup');
    expect(m.carried).toBeNull();
  });
  it('enchanting consumes lapis and levels', () => {
    const h = host();
    h.player.xpLevel = 40;
    const m = new EnchantmentMenu(h, () => 15);
    m.inputs.set(0, S('diamond_pickaxe'));
    m.inputs.set(1, S('lapis_lazuli', 5));
    const seed = h.player.xpSeed;
    expect(m.canEnchant(2)).toBe(true);
    expect(m.clickMenuButton(2)).toBe(true);
    expect(Object.keys(m.inputs.get(0)!.ench ?? {}).length).toBeGreaterThan(0);
    expect(m.lapis).toBe(2);
    expect(h.player.xpLevel).toBe(37);
    expect(h.player.xpSeed).not.toBe(seed);
  });
});

describe('merchant', () => {
  it('select offer fills payment from inventory and trades', () => {
    const h = host();
    const offer: TradeOffer = { buy: { item: 'emerald', count: 3 }, sell: { item: 'diamond', count: 1 }, uses: 0, maxUses: 2, xp: 5 };
    const traded: TradeOffer[] = [];
    const merchant: Merchant = { getOffers: () => [offer], onTrade: (o) => traded.push(o), merchantName: 'Toolsmith' };
    h.player.inventory.set(9, S('emerald', 10));
    const m = new MerchantMenu(h, merchant);
    m.clickMenuButton(0);
    expect(m.payment.get(0)?.count).toBe(10);
    expect(m.slots[2].item?.item.name).toBe('diamond');
    m.clicked(2, 0, 'quick_move');
    expect(offer.uses).toBe(2);
    expect(traded.length).toBe(2);
    expect(h.player.inventory.count(itemByName('diamond'))).toBe(2);
    expect(m.payment.get(0)?.count).toBe(4);
    expect(m.slots[2].item).toBeNull(); // out of stock
  });
});
