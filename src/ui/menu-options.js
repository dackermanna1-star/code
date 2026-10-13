// Settings menu definitions: the modern options pages behind the original
// OPTIONS title. Each page is a list of rows; the Menu class draws them
// in DOOM's style and applies changes immediately through settings.set().

import { DEFAULT_BINDS, BIND_LABELS } from '../settings.js';
import { STRINGS } from '../game/data.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const fixed = (d) => (v) => Number(v).toFixed(d);

const toggle = (label, key, extra = {}) => ({ type: 'toggle', label, key, ...extra });
const slider = (label, key, min, max, step, fmt, extra = {}) => ({ type: 'slider', label, key, min, max, step, fmt, ...extra });
const choice = (label, key, values, names, extra = {}) => ({ type: 'choice', label, key, values, names: names || values.map(String), ...extra });
const sub = (label, target) => ({ type: 'sub', label, target });
const action = (label, run, extra = {}) => ({ type: 'action', label, run, ...extra });
const info = (label, value) => ({ type: 'info', label, value });
const note = (text) => ({ type: 'note', text });
const gap = () => ({ type: 'gap' });

const MODE_NAMES = {
  shareware: 'doom shareware', registered: 'doom registered', retail: 'the ultimate doom', commercial: 'doom ii',
};

export function buildOptionMenus(menu) {
  const app = menu.app;
  const page = (subtitle, items, extra = {}) => ({
    kind: 'list', subtitle, items, lastOn: 0, scroll: 0, top: 52, rowH: 12, bottom: 196, ...extra,
  });

  const root = page(null, [
    action('end game', () => menu.endGame()),
    sub('controls', 'controls'),
    sub('key bindings', 'bindings'),
    sub('gameplay', 'gameplay'),
    sub('video', 'video'),
    sub('effects', 'effects'),
    sub('audio', 'audio'),
    sub('game files', 'files'),
    gap(),
    action('reset all settings', () => menu.confirmReset()),
  ], { top: 44, rowH: 14 });

  const controls = page('controls', [
    slider('mouse sensitivity', 'mouseSensitivity', 0.1, 4, 0.1, fixed(1)),
    toggle('invert mouse y', 'invertY'),
    toggle('mouse look', 'mouseLook'),
    toggle('raw mouse input', 'rawInput'),
    toggle('always run', 'alwaysRun'),
    choice('aim down sights', 'adsToggle', [false, true], ['hold', 'toggle']),
    gap(),
    slider('gamepad sensitivity', 'gamepadSensitivity', 0.25, 3, 0.25, fixed(2)),
    slider('gamepad deadzone', 'gamepadDeadzone', 0, 0.4, 0.05, pct),
    toggle('gamepad invert y', 'gamepadInvertY'),
    slider('aim assist', 'aimAssist', 0, 1, 0.1, (v) => (v ? pct(v) : 'off')),
  ]);

  const bindItems = Object.keys(DEFAULT_BINDS).map((a) => ({ type: 'bind', label: BIND_LABELS[a] || a, action: a }));
  const bindings = page('key bindings', [
    ...bindItems,
    gap(),
    action('reset to defaults', () => menu.resetBinds()),
  ], { bottom: 184, hint: true });

  const gameplay = page('gameplay', [
    toggle('autoaim', 'autoaim'),
    toggle('modern monster ai', 'modernAI'),
    toggle('jumping', 'allowJump'),
    toggle('crouching', 'allowCrouch'),
    toggle('sprinting', 'allowSprint'),
    toggle('sliding', 'allowSlide'),
    toggle('auto reload', 'autoReload'),
    toggle('magazines (new game)', 'useMagazines'),
    toggle('fast weapon switch', 'fastSwitch'),
    toggle('quick melee', 'quickMelee'),
    toggle('locational damage', 'locationalDamage'),
    toggle('autoswitch on pickup', 'autoSwitch'),
    choice('crosshair', 'crosshair', [0, 1, 2], ['off', 'dot', 'cross']),
    toggle('hit markers', 'hitMarkers'),
    toggle('damage indicators', 'damageIndicators'),
    toggle('messages', 'messages', {
      onChange: (v) => app.hud && app.hud.message(v ? STRINGS.MSGON : STRINGS.MSGOFF),
    }),
    toggle('secret messages', 'secretMessages'),
  ]);

  const video = page('video', [
    slider('field of view', 'fov', 60, 130, 5, String),
    choice('render resolution', 'renderScale', ['1', '2', '3', '4', 'native'],
      ['320x200', '640x400', '960x600', '1280x800', 'native']),
    toggle('aspect correction', 'aspectCorrect'),
    toggle('smooth lighting', 'smoothLighting'),
    toggle('dynamic lights', 'dynamicLights'),
    slider('gamma', 'gamma', 0, 4, 1, (v) => (v ? String(v) : 'off')),
    toggle('crt scanlines', 'scanlines'),
    choice('hud style', 'hud', ['classic', 'fullscreen', 'minimal']),
    toggle('ads zoom', 'adsZoom'),
    slider('view bob', 'viewBob', 0, 1, 0.1, pct),
    slider('weapon bob', 'weaponBob', 0, 1, 0.1, pct),
    slider('weapon sway', 'weaponSway', 0, 2, 0.1, pct),
    slider('screen shake', 'screenShake', 0, 2, 0.1, pct),
    slider('recoil strength', 'recoil', 0, 2, 0.1, pct),
    toggle('reduce flashes', 'reduceFlashes'),
    toggle('show fps', 'showFps'),
  ]);

  const effects = page('effects', [
    choice('gore', 'gore', [0, 1, 2], ['off', 'reduced', 'full']),
    toggle('dismemberment', 'dismemberment'),
    toggle('3d monsters', 'voxelMonsters'),
    toggle('ragdoll physics', 'physics'),
    choice('active ragdolls', 'ragdollLimit', [4, 8, 16, 32], ['4', '8', '16', '32']),
    choice('particles', 'particles', [0, 1, 2], ['low', 'medium', 'high']),
    choice('decal limit', 'maxDecals', [0, 150, 300, 600, 1200], ['off', '150', '300', '600', '1200']),
    toggle('shell casings', 'shellCasings'),
    choice('corpse lifetime', 'corpseLifetime', [0, 30, 60, 120], ['forever', '30 sec', '60 sec', '120 sec']),
    slider('knockback', 'knockback', 1, 2.5, 0.1, (v) => `${Number(v).toFixed(1)}x`),
  ]);

  const vol = (v) => String(Math.round(v * 15));
  const audio = page('audio', [
    slider('sfx volume', 'sfxVolume', 0, 1, 1 / 15, vol),
    slider('music volume', 'musicVolume', 0, 1, 1 / 15, vol),
    gap(),
    toggle('reverb', 'reverb'),
    toggle('sound occlusion', 'occlusion'),
    toggle('pitch variation', 'pitchVariation'),
    toggle('mechanical sounds', 'extraSounds'),
    toggle('hrtf 3d audio', 'hrtf'),
  ]);

  const files = page('game files', [
    info('iwad', () => app.iwadName || '?'),
    info('game', () => MODE_NAMES[(app.game && app.game.gamemode) || app.gamemode] || app.gamemode || '?'),
    gap(),
    action('load your own iwad', () => menu.pickIwad()),
    note('doom.wad, doom2.wad, tnt or plutonia'),
    note('the file stays in this browser'),
    gap(),
    action('use shareware wad', () => menu.confirmShareware()),
  ]);

  const all = { root, controls, bindings, gameplay, video, effects, audio, files };
  for (const k of Object.keys(all)) {
    all[k].id = k;
    if (k !== 'root') all[k].prev = root;
  }
  return all;
}
