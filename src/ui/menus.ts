/**
 * Menu screens: title, world selection/creation, loading, pause, settings, death.
 */
import { h, type Screen, type UI } from './ui';
import { Game, type Difficulty, type WorldInfo } from '../game/game';
import type { GameSettings } from '../game/settings';

const SPLASHES = [
  'Now with real light!', 'Photons included!', 'Ray-traced... mostly!', '100% physical!', 'Also try the real thing!', 'Ragdolls!',
  'Fan-made!', 'Volumetric!', 'Physically based!', 'Now with weight!', 'Creeper? Aw man.', 'Punch trees responsibly!', 'Cubes, but smooth!',
];

function screen(cls: string, ...children: HTMLElement[]): HTMLElement {
  return h('div', { class: `screen ${cls}` }, ...children);
}

export interface MenuCallbacks {
  /** Start or load a world. */
  play(info: WorldInfo, saved?: any): Promise<void>;
  listWorlds(): Promise<WorldInfo[]>;
  loadWorld(id: string): Promise<{ info: WorldInfo; data: any } | null>;
  deleteWorld(id: string): Promise<void>;
  saveAndQuit(): Promise<void>;
}

export function titleScreen(ui: UI, cb: MenuCallbacks): Screen {
  const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
  const el = screen('menu-bg',
    h('div', { class: 'logo' },
      h('div', { class: 'name' }, 'VOXELCRAFT'),
      h('div', { class: 'edition' }, 'PHOTOREALISTIC PHYSICS EDITION'),
      h('div', { class: 'splash' }, splash)),
    h('div', { class: 'panel', style: { marginTop: '120px', minWidth: '420px', background: 'rgba(10,10,14,0.5)' } },
      h('button', { class: 'btn primary', onclick: () => ui.open(worldSelectScreen(ui, cb)) }, 'Singleplayer'),
      h('button', { class: 'btn', onclick: () => ui.open(createWorldScreen(ui, cb)) }, 'Create New World'),
      h('button', { class: 'btn', onclick: () => ui.open(settingsScreen(ui)) }, 'Options...'),
    ),
    h('div', { class: 'footer mc-text' }, h('span', {}, 'Fan recreation · not affiliated with Mojang/Microsoft'), h('span', {}, 'WebGL2 deferred renderer')),
  );
  return { el, pauses: false };
}

export function worldSelectScreen(ui: UI, cb: MenuCallbacks): Screen {
  const list = h('div', { class: 'world-list' }, h('div', { class: 'meta' }, 'Loading worlds...'));
  let selected: WorldInfo | null = null;
  const playBtn = h('button', { class: 'btn primary', disabled: true }, 'Play Selected World') as HTMLButtonElement;
  const delBtn = h('button', { class: 'btn', disabled: true }, 'Delete') as HTMLButtonElement;
  const refresh = async () => {
    const worlds = await cb.listWorlds().catch(() => []);
    list.innerHTML = '';
    if (!worlds.length) list.append(h('div', { class: 'meta', style: { padding: '8px', color: '#aaa' } }, 'No saved worlds yet.'));
    for (const w of worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)) {
      const item = h('div', { class: 'world-item' }, h('div', {}, w.name), h('div', { class: 'meta' }, `${w.gameMode} · ${w.difficulty} · seed ${w.seed} · ${new Date(w.lastPlayed).toLocaleString()}`));
      item.onclick = () => {
        selected = w;
        list.querySelectorAll('.world-item').forEach((n) => n.classList.remove('sel'));
        item.classList.add('sel');
        playBtn.disabled = false;
        delBtn.disabled = false;
      };
      item.ondblclick = () => playBtn.click();
      list.append(item);
    }
  };
  playBtn.onclick = async () => {
    if (!selected) return;
    const loaded = await cb.loadWorld(selected.id);
    ui.closeAll();
    await cb.play(loaded?.info ?? selected, loaded?.data);
  };
  delBtn.onclick = async () => {
    if (!selected || !confirm(`Delete world "${selected.name}"? This cannot be undone.`)) return;
    await cb.deleteWorld(selected.id);
    selected = null;
    playBtn.disabled = delBtn.disabled = true;
    refresh();
  };
  const el = screen('menu-bg', h('div', { class: 'panel', style: { minWidth: '520px' } },
    h('h2', {}, 'Select World'), list,
    h('div', { class: 'row' }, playBtn, h('button', { class: 'btn', onclick: () => { ui.close(); ui.open(createWorldScreen(ui, cb)); } }, 'Create New World')),
    h('div', { class: 'row' }, delBtn, h('button', { class: 'btn', onclick: () => ui.close() }, 'Cancel')),
  ));
  refresh();
  return { el };
}

export function createWorldScreen(ui: UI, cb: MenuCallbacks): Screen {
  const name = h('input', { class: 'text', value: 'New World', maxlength: 40 }) as HTMLInputElement;
  const seed = h('input', { class: 'text', placeholder: 'Leave blank for a random seed' }) as HTMLInputElement;
  const mode = h('select', { class: 'select' }, h('option', { value: 'survival' }, 'Survival'), h('option', { value: 'creative' }, 'Creative'), h('option', { value: 'adventure' }, 'Adventure'), h('option', { value: 'spectator' }, 'Spectator')) as HTMLSelectElement;
  const diff = h('select', { class: 'select' }, h('option', { value: 'peaceful' }, 'Peaceful'), h('option', { value: 'easy' }, 'Easy'), h('option', { value: 'normal', selected: true }, 'Normal'), h('option', { value: 'hard' }, 'Hard')) as HTMLSelectElement;
  diff.value = 'normal';
  const create = async () => {
    const info = Game.createInfo(name.value, seed.value, mode.value as any, diff.value as Difficulty);
    ui.closeAll();
    await cb.play(info);
  };
  const el = screen('menu-bg', h('div', { class: 'panel', style: { minWidth: '460px' } },
    h('h2', {}, 'Create New World'),
    h('label', { class: 'field' }, 'World Name'), name,
    h('label', { class: 'field' }, 'Seed for the World Generator'), seed,
    h('div', { class: 'row' }, h('div', {}, h('label', { class: 'field' }, 'Game Mode'), mode), h('div', {}, h('label', { class: 'field' }, 'Difficulty'), diff)),
    h('div', { class: 'row', style: { marginTop: '14px' } }, h('button', { class: 'btn primary', onclick: create }, 'Create New World'), h('button', { class: 'btn', onclick: () => ui.close() }, 'Cancel')),
  ));
  return {
    el,
    onOpen: () => setTimeout(() => name.select(), 30),
    onKey: (code, down) => {
      if (down && code === 'Enter') { create(); return true; }
      return false;
    },
  };
}

export function loadingScreen(): Screen & { set(msg: string, f: number): void } {
  const msg = h('div', { class: 'mc-text', style: { fontSize: '18px' } }, 'Loading');
  const fill = h('div', { style: { width: '0%' } });
  const el = screen('loading', h('div', { class: 'logo', style: { position: 'static', transform: 'none' } }, h('div', { class: 'name', style: { fontSize: '54px' } }, 'MINECRAFT')), msg, h('div', { class: 'bar' }, fill));
  return {
    el,
    set(m: string, f: number) {
      msg.textContent = m;
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
    },
  };
}

export function pauseScreen(ui: UI, cb: MenuCallbacks): Screen {
  const el = screen('', h('div', { class: 'panel' },
    h('h2', {}, 'Game Menu'),
    h('button', { class: 'btn primary', onclick: () => ui.resume() }, 'Back to Game'),
    h('button', { class: 'btn', onclick: () => ui.open(settingsScreen(ui)) }, 'Options...'),
    h('button', { class: 'btn', onclick: async () => { ui.closeAll(); await cb.saveAndQuit(); } }, 'Save and Quit to Title'),
  ));
  return { el, pauses: true };
}

export function deathScreen(ui: UI, onRespawn: () => void, onTitle: () => void): Screen {
  const g = ui.game!;
  const score = g.player.score;
  const el = screen('death',
    h('h1', { class: 'mc-text' }, 'You Died!'),
    h('div', { class: 'mc-text', style: { marginBottom: '20px' } }, `Score: ${score}`),
    h('div', { style: { width: '380px' } },
      h('button', { class: 'btn', onclick: () => { ui.close(); onRespawn(); } }, 'Respawn'),
      h('button', { class: 'btn', onclick: () => { ui.closeAll(); onTitle(); } }, 'Title Screen')),
  );
  return { el, showHud: true };
}

type SettingDef =
  | { key: keyof GameSettings; label: string; type: 'range'; min: number; max: number; step: number; fmt?: (v: number) => string }
  | { key: keyof GameSettings; label: string; type: 'bool' }
  | { key: keyof GameSettings; label: string; type: 'select'; options: [string, string][] };

const SETTINGS: SettingDef[] = [
  { key: 'quality', label: 'Graphics Quality', type: 'select', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
  { key: 'renderDistance', label: 'Render Distance', type: 'range', min: 2, max: 24, step: 1, fmt: (v) => `${v} chunks` },
  { key: 'lodDistance', label: 'Distant Terrain (LOD)', type: 'range', min: 256, max: 2048, step: 64, fmt: (v) => `${v} blocks` },
  { key: 'renderScale', label: 'Render Scale', type: 'range', min: 0.5, max: 1.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'fov', label: 'FOV', type: 'range', min: 30, max: 110, step: 1 },
  { key: 'sensitivity', label: 'Mouse Sensitivity', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 200)}%` },
  { key: 'brightness', label: 'Brightness', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.05 ? 'Moody' : v > 0.95 ? 'Bright' : `${Math.round(v * 100)}%`) },
  { key: 'masterVolume', label: 'Master Volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'musicVolume', label: 'Music', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'textureSize', label: 'Texture Resolution (restart)', type: 'select', options: [['64', '64'], ['128', '128'], ['256', '256'], ['512', '512']] },
  { key: 'viewBobbing', label: 'View Bobbing', type: 'bool' },
  { key: 'lod', label: 'Distant Terrain', type: 'bool' },
  { key: 'bevels', label: 'Bevelled Block Edges', type: 'bool' },
  { key: 'decorations', label: 'Grass Tufts & Leaf Detail', type: 'bool' },
  { key: 'blood', label: 'Blood & Wounds', type: 'bool' },
  { key: 'ragdolls', label: 'Ragdoll Physics', type: 'bool' },
  { key: 'invertY', label: 'Invert Mouse', type: 'bool' },
  { key: 'showFps', label: 'Show FPS', type: 'bool' },
];

export function settingsScreen(ui: UI): Screen {
  const g = ui.game!;
  const grid = h('div', { class: 'settings-grid' });
  for (const d of SETTINGS) {
    const cur: any = (g.settings as any)[d.key];
    let input: HTMLElement;
    const label = h('span', {}, d.label);
    if (d.type === 'range') {
      const val = h('span', { style: { float: 'right', color: '#ccc' } }, d.fmt ? d.fmt(cur) : String(cur));
      const r = h('input', { type: 'range', min: d.min, max: d.max, step: d.step, value: cur }) as HTMLInputElement;
      r.oninput = () => {
        const v = Number(r.value);
        val.textContent = d.fmt ? d.fmt(v) : String(v);
        g.applySettings({ [d.key]: v } as any);
      };
      input = h('div', {}, h('div', {}, label, val), r);
    } else if (d.type === 'bool') {
      const b = h('button', { class: 'btn' }, `${d.label}: ${cur ? 'ON' : 'OFF'}`) as HTMLButtonElement;
      b.onclick = () => {
        const v = !(g.settings as any)[d.key];
        b.textContent = `${d.label}: ${v ? 'ON' : 'OFF'}`;
        g.applySettings({ [d.key]: v } as any);
      };
      input = b;
    } else {
      const s = h('select', { class: 'select' }, ...d.options.map(([v, l]) => h('option', { value: v, selected: String(cur) === v }, l))) as HTMLSelectElement;
      s.value = String(cur);
      s.onchange = () => g.applySettings({ [d.key]: d.key === 'textureSize' ? Number(s.value) : s.value } as any);
      input = h('div', {}, label, s);
    }
    grid.append(h('div', { class: 'setting' }, input));
  }
  const el = screen('', h('div', { class: 'panel', style: { minWidth: '640px' } },
    h('h2', {}, 'Options'), grid,
    h('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: () => ui.close() }, 'Done')));
  return { el, pauses: true };
}
