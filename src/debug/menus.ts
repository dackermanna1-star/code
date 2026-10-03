/**
 * Menu screens debug page (no WebGL): /debug/menus.html?screen=title|worlds|create|options|pause|death|loading|hud
 * Renders the real menu screens over a static gradient so they can be screenshotted quickly.
 */
import '../world/blocks/blocks';
import { UI } from '../ui/ui';
import { Emitter } from '../core/events';
import { DEFAULT_SETTINGS } from '../game/settings';
import { Player } from '../entity/player';
import { registerDevItems } from './devItems';
import { deserializeStack } from '../game/items/registry';
import { titleScreen, worldSelectScreen, createWorldScreen, settingsScreen, pauseScreen, deathScreen, loadingScreen, type MenuCallbacks } from '../ui/menus';

registerDevItems();
const q = new URLSearchParams(location.search);
const player = new Player();
player.score = 1234;
const settings: any = { ...DEFAULT_SETTINGS };
const game: any = {
  player, events: new Emitter(), settings, realTime: 0, fps: 144,
  applySettings: (p: any) => Object.assign(settings, p),
  input: { bindings: {}, enabled: true, requestLock() {}, exitLock() {}, releaseAll() {} },
};
const ui = new UI(document.getElementById('ui')!);
ui.game = game;
const worlds = [
  { id: 'a', name: 'New World', seed: '1912', gameMode: 'survival', difficulty: 'normal', lastPlayed: Date.now() - 3600e3 },
  { id: 'b', name: 'Creative Sandbox', seed: '77', gameMode: 'creative', difficulty: 'peaceful', lastPlayed: Date.now() - 86400e3 * 3 },
  { id: 'c', name: 'Hardcore Run', seed: '424242', gameMode: 'survival', difficulty: 'hard', lastPlayed: Date.now() - 86400e3 * 9 },
];
const cb: MenuCallbacks = {
  async play() {}, async listWorlds() { return worlds as any; }, async loadWorld() { return null; }, async deleteWorld() {}, async saveAndQuit() {},
};
const which = q.get('screen') ?? 'title';
if (which === 'hud') {
  const S = (i: string, c = 1) => deserializeStack({ i, c });
  ['diamond_sword', 'iron_pickaxe', 'oak_log', 'cobblestone', 'bread', 'torch'].forEach((n, i) => player.inventory.set(i, S(n, i > 1 ? 20 + i * 7 : 1)));
  player.health = 13; player.food = 15; player.xpLevel = 27; (player as any).xpProgress = 0.55;
  player.inventory.selected = 2;
  ui.hud.attach(game);
  ui.hud.el.classList.remove('hidden');
  ui.hud.addChat('<Steve> hello world, how is the build going?');
  ui.hud.addChat('Set the time to 6000', '#ffff55');
  ui.hud.showTitle('Welcome', 'to Voxelcraft');
  const dbg = (ui.hud as any).debugL as HTMLElement;
  dbg.classList.remove('hidden');
  dbg.textContent = 'Voxelcraft: Photorealistic Physics Edition (fan recreation)\n144 fps  212 draws  1.24M tris  1280x720\nXYZ: 12.500 / 68.00000 / -204.310\nFacing: north (180.0 / 8.2)\nBiome: Plains';
  ui.update(0.3);
  ui.update(0.3);
} else if (which === 'title') ui.open(titleScreen(ui, cb));
else if (which === 'worlds') { ui.open(titleScreen(ui, cb)); ui.open(worldSelectScreen(ui, cb)); }
else if (which === 'create') { ui.open(titleScreen(ui, cb)); ui.open(createWorldScreen(ui, cb)); }
else if (which === 'options') ui.open(settingsScreen(ui));
else if (which === 'pause') ui.open(pauseScreen(ui, cb));
else if (which === 'death') ui.open(deathScreen(ui, () => {}, () => {}));
else if (which === 'loading') { const l = loadingScreen(); ui.open(l); l.set('Building terrain', 0.62); }
setTimeout(() => {
  (window as any).__shotReady = true;
}, 1200);
