import { ClientGame } from './game';
import { loadSettings, saveSettings } from './settings';
import { SettingsUI, renderHelp, show } from './ui/menus';
import { MapUI } from './ui/map';
import { deleteWorld, listWorlds, newWorldId, putWorld, type WorldEntry } from './worlds';

/** Entry point: main menu, world selection, and game lifecycle. */
const $ = (id: string) => document.getElementById(id)!;
const settings = loadSettings();
const settingsUI = new SettingsUI(settings);
let game: ClientGame | null = null;
let current: WorldEntry | null = null;

const workerBase = new URL('./', import.meta.url).href;

function error(msg: string) {
  $('m-error').textContent = msg;
}

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function refreshWorlds() {
  const box = $('m-worlds');
  let worlds: WorldEntry[] = [];
  try {
    worlds = await listWorlds();
  } catch (e) {
    box.innerHTML = `<div class="error">Saves are unavailable in this browser mode (${String(e)}). Try a normal (non-private) window.</div>`;
    return;
  }
  if (!worlds.length) {
    box.innerHTML = '<div class="muted">No worlds yet — create one below.</div>';
    ($('m-new') as HTMLDetailsElement).open = true;
    return;
  }
  box.innerHTML = '';
  for (const w of worlds) {
    const row = document.createElement('div');
    row.className = 'world';
    row.innerHTML = `<div class="wi"><b></b><span></span></div>`;
    row.querySelector('b')!.textContent = w.name;
    row.querySelector('span')!.textContent = `seed ${w.seed}${w.cheats ? ' · cheats' : ''} · last played ${new Date(w.lastPlayed).toLocaleString()}`;
    const play = document.createElement('button');
    play.className = 'primary';
    play.textContent = 'Play';
    play.onclick = () => void startWorld(w);
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.onclick = async () => {
      if (!confirm(`Delete world "${w.name}" permanently?`)) return;
      await deleteWorld(w.id);
      void MapUI.forgetWorld(w.id);
      void refreshWorlds();
    };
    row.append(play, del);
    box.appendChild(row);
  }
}

async function startWorld(w: WorldEntry, isNew = false) {
  if (!webglOk()) return error('This game needs WebGL2, which your browser or GPU does not provide.');
  const name = ($('m-name') as HTMLInputElement).value.trim() || 'Survivor';
  settings.name = name;
  saveSettings(settings);
  error('');
  show('menu', false);
  current = w;
  w.lastPlayed = Date.now();
  await putWorld(w).catch(() => undefined);
  game = new ClientGame($('game') as HTMLCanvasElement, settings, workerBase);
  game.map.setWorldKey(w.id); // explored-map persistence per world
  (window as unknown as { __corrode?: unknown }).__corrode = game; // debugging & automated smoke tests
  game.onSpawned = () => $('load-text').textContent = 'Ready';
  try {
    $('load-text').textContent = isNew ? 'Generating world…' : 'Loading save…';
    await game.start(w.id, name, isNew ? { seed: w.seed, cheats: w.cheats } : undefined);
    $('load-text').textContent = 'Streaming terrain…';
  } catch (e) {
    await quitToMenu();
    error(`Could not open world: ${String((e as Error).message ?? e)}`);
  }
}

async function quitToMenu() {
  const g = game;
  game = null;
  if (g) {
    $('load-text').textContent = 'Saving…';
    show('pause', false);
    show('loading', true);
    await g.quit();
  }
  for (const id of ['loading', 'pause', 'death', 'inventory', 'map', 'keypad', 'help', 'settings']) show(id, false);
  show('menu', true);
  void refreshWorlds();
}

// ------------------------------------------------------------------ wiring
($('m-name') as HTMLInputElement).value = settings.name;
$('nw-create').onclick = () => {
  const name = ($('nw-name') as HTMLInputElement).value.trim() || 'New World';
  const seed = ($('nw-seed') as HTMLInputElement).value.trim() || String(Math.floor(Math.random() * 1e9));
  const cheats = ($('nw-cheats') as HTMLInputElement).checked;
  const w: WorldEntry = { id: newWorldId(), name, seed, cheats, created: Date.now(), lastPlayed: Date.now() };
  void startWorld(w, true);
};
$('m-settings').onclick = () => {
  settingsUI.onClose = () => undefined;
  settingsUI.open();
};
$('m-help').onclick = () => {
  renderHelp(settings);
  show('help', true);
};
$('h-close').onclick = () => {
  show('help', false);
  if (game) game.setMode('pause');
};
settingsUI.onChange = () => game?.applySettings();
$('p-resume').onclick = () => game?.setMode('play');
$('p-save').onclick = () => game?.sim.send({ t: 'save' });
$('p-settings').onclick = () => {
  if (!game) return;
  game.setMode('settings');
  settingsUI.onClose = () => game?.setMode('pause');
  settingsUI.open();
};
$('p-help').onclick = () => game?.setMode('help');
$('p-quit').onclick = () => void quitToMenu();
$('respawn-beach').onclick = () => game?.sim.send({ t: 'respawn' });
$('kp-ok').onclick = () => {
  const el = $('kp-code') as HTMLInputElement;
  game?.submitCode(el.value, el.dataset.mode ?? 'enter');
};
$('kp-cancel').onclick = () => game?.setMode('play');
$('kp-code').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') $('kp-ok').click();
  e.stopPropagation();
});
window.addEventListener('beforeunload', () => {
  // Best effort: ask the simulation to save. IndexedDB transactions already
  // committed are durable; an interrupted save leaves the previous one intact.
  game?.sim.send({ t: 'save' });
});

void refreshWorlds();
if (current) void current;
