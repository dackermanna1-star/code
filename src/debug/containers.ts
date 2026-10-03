/**
 * Container UI debug page (no WebGL): /debug/containers.html?screen=inventory|crafting|furnace|chest|double|brewing|enchanting|anvil|trading
 * Mounts the real screens with a stub game so layouts can be screenshotted quickly.
 */
import '../world/blocks/blocks';
import { UI } from '../ui/ui';
import { Player } from '../entity/player';
import { Emitter } from '../core/events';
import { DEFAULT_SETTINGS } from '../game/settings';
import { registerDevItems } from './devItems';
import { installCrafting } from '../game/crafting';
import { deserializeStack } from '../game/items/registry';
import { SimpleContainer } from '../game/containers/storage';
import type { MenuHost } from '../game/containers/menu';
import { InventoryMenu, CraftingMenu, ChestMenu, FurnaceMenu, BrewingMenu, EnchantmentMenu, AnvilMenu, MerchantMenu } from '../game/containers/menus';
import { CreativeMenu } from '../game/containers/creative';
import { newFurnaceData } from '../game/crafting/smelting';
import { newBrewingData } from '../game/brewing/brewing';
import { InventoryScreen, CreativeScreen, CraftingScreen, FurnaceScreen, BasicContainerScreen, BrewingScreen, EnchantmentScreen, AnvilScreen, MerchantScreen } from '../ui/containers/screens';

registerDevItems();
installCrafting();
const q = new URLSearchParams(location.search);
const S = (i: string, c = 1, extra: any = {}) => deserializeStack({ i, c, ...extra });
const player = new Player();
player.xpLevel = 30;
const game: any = { player, events: new Emitter(), settings: { ...DEFAULT_SETTINGS, guiScale: Number(q.get('gui') ?? 2) }, input: { bindings: {}, enabled: true, requestLock() {}, exitLock() {}, releaseAll() {} } };
const ui = new UI(document.getElementById('ui')!);
ui.game = game;
const host: MenuHost = { player, drop: () => {}, emit: (n, p) => game.events.emit(n, p) };
const inv = player.inventory;
[['diamond_sword', 1, { e: { sharpness: 5, unbreaking: 3 } }], ['iron_pickaxe', 1, { d: 120 }], ['oak_log', 16], ['cobblestone', 64], ['coal', 23], ['raw_iron', 12], ['bread', 7], ['torch', 32], ['potion', 1, { x: { potion: 'swiftness' } }]].forEach(([n, c, e], i) => inv.set(i, S(n as string, c as number, e)));
inv.set(9, S('oak_planks', 40));
inv.set(10, S('stick', 12));
inv.set(13, S('iron_ingot', 9));
inv.set(20, S('diamond', 3));
inv.set(38, S('iron_chestplate'));
inv.set(39, S('golden_helmet'));
player.addEffect('speed', 1800, 1);
player.addEffect('regeneration', 600, 0);
const which = q.get('screen') ?? 'inventory';
let screen: any;
if (which === 'inventory') screen = new InventoryScreen(ui, new InventoryMenu(host));
else if (which === 'creative' || which === 'creative-inv') {
  screen = new CreativeScreen(ui, new CreativeMenu(host));
  if (which === 'creative-inv') screen.selectTab('inventory');
}
else if (which === 'crafting') {
  const m = new CraftingMenu(host);
  ['oak_planks', 'oak_planks', 'oak_planks', null, 'stick', null, null, 'stick', null].forEach((n, i) => n && m.grid.set(i, S(n)));
  screen = new CraftingScreen(ui, m);
} else if (which === 'furnace') {
  const st = new SimpleContainer(3);
  st.set(0, S('raw_iron', 8)); st.set(1, S('coal', 3)); st.set(2, S('iron_ingot', 2));
  const d = newFurnaceData('furnace');
  d.burn = 900; d.burnMax = 1600; d.cook = 120;
  screen = new FurnaceScreen(ui, new FurnaceMenu(host, 'furnace', st, d, 'Furnace'));
} else if (which === 'chest' || which === 'double') {
  const rows = which === 'double' ? 6 : 3;
  const st = new SimpleContainer(rows * 9);
  ['bone', 'gunpowder', 'iron_ingot', 'golden_apple', 'string', 'bread', 'redstone', 'saddle'].forEach((n, i) => st.set(i * 3 + 1, S(n, i % 3 === 0 ? 1 : 5 + i)));
  screen = new BasicContainerScreen(ui, new ChestMenu(host, 'chest', st, rows, rows === 6 ? 'Large Chest' : 'Chest'));
} else if (which === 'brewing') {
  const st = new SimpleContainer(5);
  st.set(0, S('potion', 1, { x: { potion: 'awkward' } })); st.set(1, S('potion', 1, { x: { potion: 'awkward' } })); st.set(3, S('sugar', 4)); st.set(4, S('blaze_powder', 6));
  const d = newBrewingData(); d.fuel = 14; d.brewTime = 180;
  screen = new BrewingScreen(ui, new BrewingMenu(host, st, d, 'Brewing Stand'));
} else if (which === 'enchanting') {
  const m = new EnchantmentMenu(host, () => 15);
  m.inputs.set(0, S('diamond_pickaxe')); m.inputs.set(1, S('lapis_lazuli', 12));
  screen = new EnchantmentScreen(ui, m);
} else if (which === 'anvil') {
  const m = new AnvilMenu(host);
  m.inputs.set(0, S('diamond_sword', 1, { e: { sharpness: 3 } })); m.inputs.set(1, S('enchanted_book', 1, { e: { sharpness: 3 } }));
  screen = new AnvilScreen(ui, m);
} else if (which === 'trading') {
  const offers = [
    { buy: { item: 'emerald', count: 1 }, sell: { item: 'bread', count: 6 }, uses: 0, maxUses: 16 },
    { buy: { item: 'wheat', count: 20 }, sell: { item: 'emerald', count: 1 }, uses: 16, maxUses: 16 },
    { buy: { item: 'emerald', count: 3 }, buyB: { item: 'book', count: 1 }, sell: { item: 'enchanted_book', count: 1, ench: { mending: 1 } }, uses: 2, maxUses: 12 },
  ];
  screen = new MerchantScreen(ui, new MerchantMenu(host, { getOffers: () => offers, onTrade: () => {}, merchantName: 'Farmer', merchantLevel: 2, merchantXp: 40 }));
}
ui.open(screen);
let last = performance.now();
const loop = (t: number) => { ui.update((t - last) / 1000); last = t; requestAnimationFrame(loop); };
requestAnimationFrame(loop);
const hover = q.get('hover');
setTimeout(() => {
  if (hover) screen.hoverSlot(Number(hover));
  (window as any).__shotReady = true;
}, 300);
(window as any).screen_ = screen;
