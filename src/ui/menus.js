// Counter-Strike 1.6 menus as a DOM overlay.
//
//   const menus = new Menus(container, { onCommand: (cmd) => ... });
//
// In-game VGUI menus (team, class, buy, scoreboard) are translucent black
// panels with orange text laid out in 640×480 units and scaled with the screen;
// GameUI dialogs (console, options, create server, loading) use the 2004 Steam
// olive window style; the main menu is a text logo plus text buttons over the
// live game view. Number keys and Esc work like 1.6 while a menu is open.
//
// Callbacks receive what the 1.6 command would carry:
//   showTeamSelect(cb)      cb(n, 'jointeam n')   n = 1 T, 2 CT, 5 auto, 6 spectate
//   showClassSelect(t, cb)  cb(n, 'joinclass n', skin)   n = 1..4, 5 = auto (skin null)
//   showBuyMenu(p, {onBuy}) onBuy(item, 'buy …')  item = weapon id | vest | vesthelm |
//                           flashbang | hegrenade | smokegrenade | defuser | nvgs | primammo | secammo
//   showNewGame(d, onStart) onStart({ ...d, map, perTeam, difficulty, roundTime, freezeTime, c4Timer, startMoney, buyTime })
//     d.maps [[id, label]], d.mapInfo(id) -> Promise<{ ok, html, bundled }>, d.addFiles(FileList) -> Promise (custom maps)
//   showOptions(s, onChange) onChange(key, value) for every changed key on OK / Apply
//   showChatInput(team, cb) cb(text)
// Without a callback the equivalent onCommand string is sent instead
// ('jointeam 1', 'joinclass 3', 'buy ak47', 'buyequip vesthelm', 'buyammo1', 'say:…').
// Other commands: 'resume', 'newgame', 'options', 'quit', 'menu_close', 'console:<text>'.

import MENUS_CSS from './menus.css?inline';
import { CATEGORIES, SUBPAGES, ITEMS, ITEM_ICON, itemsFor } from './menu/buydata.js';
import { paintSkinSwatch } from '../assets/vm/attach.js';
import { MAP_BRIEFING, MODE_BRIEFING, TEAM_BUTTONS, CLASSES, AUTO_SELECT_TEXT } from './menu/text.js';
import { drawWeaponIcon, hudSprite, tinted, WEAPON_IDS, KILL_ICON_W } from './icons.js';
import { engineFontPx, engineLineHeight, spriteScale } from './hud/font.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const digitOf = (code) => {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code || '');
  return m ? +m[1] : null;
};

const RES_MODES = [['native', 'Native (window)'], ['640x480', '640 x 480'], ['800x600', '800 x 600'], ['1024x768', '1024 x 768'], ['1280x960', '1280 x 960']];
const XHAIR_COLORS = [['Green', [50, 250, 50]], ['Red', [250, 50, 50]], ['Blue', [50, 50, 250]], ['Yellow', [250, 250, 50]], ['Light Blue', [50, 250, 250]]];
const sameColor = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => +v === +b[i]);

export class Menus {
  constructor(container, { onCommand } = {}) {
    this.container = container;
    this.onCommand = onCommand || (() => {});
    if (!document.getElementById('cs-menus-css')) {
      const st = el('style');
      st.id = 'cs-menus-css';
      st.textContent = MENUS_CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'cs-menus');
    this.stage = el('div', 'vg-stage');
    this.root.appendChild(this.stage);
    container.appendChild(this.root);
    this.vp = null;
    this.stageScale = 1;
    this.main = null;          // { el, inGame }
    this.dlg = null;           // Steam dialog element (create server / options)
    this.vg = null;            // { kind, el, key(n) }
    this.con = null;           // console window
    this.conOpen = false;
    this.conHistory = [];
    this.conLines = [];
    this.loading = null;
    this.chat = null;
    this.score = null;
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('resize', () => this._layout());
    this._layout();
  }

  // ---------------------------------------------------------------- public

  /** Game viewport in CSS px (optional; defaults to the container). */
  resize(vp) {
    this.vp = vp ? { x: vp.x || 0, y: vp.y || 0, w: vp.w, h: vp.h } : null;
    this._layout();
  }

  /** Any modal menu open (main menu, dialog, VGUI menu, console, chat input). */
  isOpen() {
    return !!(this.main || this.dlg || this.vg || this.conOpen || this.chat);
  }

  hideAll() {
    this._hideMain();
    this._closeDlg();
    this._closeVg();
    this._closeChat();
    this.hideScoreboard();
    if (this.conOpen) this.toggleConsole();
  }

  // ---------------------------------------------------------------- main menu

  showMain({ inGame = false } = {}) {
    this._closeVg();
    this._closeChat();
    this.hideScoreboard();
    this._hideMain();
    const m = el('div', 'mm');
    const logo = el('div', 'mm-logo');
    logo.append('COUNTER', el('span', null, '-'), 'STRIKE');
    const items = el('div', 'mm-items');
    const add = (label, cmd, off = false) => {
      const a = el('div', 'mm-item' + (off ? ' off' : ''), label);
      if (!off) a.addEventListener('click', () => this._mainCmd(cmd));
      items.appendChild(a);
    };
    add('Resume Game', 'resume', !inGame);
    if (inGame) add('Disconnect', 'quit');
    items.appendChild(el('div', 'mm-sep'));
    add('New Game', 'newgame');
    add('Find Servers', null, true);
    add('Options', 'options');
    items.appendChild(el('div', 'mm-sep'));
    add('Quit', 'quit');
    m.append(logo, items);
    this.root.insertBefore(m, this.stage);
    this.main = { el: m, inGame };
  }

  _mainCmd(cmd) {
    if (cmd === 'resume' || cmd === 'quit') this._closeDlg();
    this.onCommand(cmd);
  }

  _hideMain() {
    if (this.main) this.main.el.remove();
    this.main = null;
  }

  // ---------------------------------------------------------------- Steam dialogs

  _window(title, cls, onClose) {
    const w = el('div', 'st-win ' + (cls || ''));
    const tb = el('div', 'st-titlebar', title);
    const x = el('div', 'x', '×');
    x.addEventListener('click', () => onClose());
    tb.appendChild(x);
    const body = el('div', 'st-body');
    w.append(tb, body);
    this._draggable(w, tb);
    return { w, body };
  }

  _draggable(w, handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target !== handle) return;
      const r = w.getBoundingClientRect(), pr = this.root.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = (ev) => {
        w.style.left = Math.max(0, Math.min(pr.width - 40, ev.clientX - pr.left - ox)) + 'px';
        w.style.top = Math.max(0, Math.min(pr.height - 24, ev.clientY - pr.top - oy)) + 'px';
        w.style.transform = 'none';
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  _center(w, width) {
    if (width) w.style.width = width + 'px';
    w.style.left = '50%';
    w.style.top = '50%';
    w.style.transform = 'translate(-50%, -50%)';
  }

  _closeDlg() {
    if (this.dlg) this.dlg.remove();
    this.dlg = null;
  }

  _row(label, control, extra) {
    const r = el('div', 'st-row');
    const l = el('label', null, label);
    r.append(l, control);
    if (extra) r.appendChild(extra);
    return r;
  }

  _select(options, value) {
    const s = el('select');
    for (const [v, label] of options) {
      const o = el('option', null, label);
      o.value = String(v);
      if (String(v) === String(value)) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }

  _slider(min, max, step, value, fmt = (v) => String(v)) {
    const wrap = el('span');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    const r = el('input');
    r.type = 'range';
    r.min = min; r.max = max; r.step = step; r.value = value;
    const v = el('span', 'val', fmt(+value));
    r.addEventListener('input', () => { v.textContent = fmt(+r.value); });
    wrap.append(r, v);
    wrap.input = r;
    return wrap;
  }

  _check(label, checked) {
    const l = el('label', 'st-check');
    const c = el('input');
    c.type = 'checkbox';
    c.checked = !!checked;
    l.append(c, document.createTextNode(label));
    l.input = c;
    return l;
  }

  showNewGame(defaults = {}, onStart) {
    this._closeDlg();
    const d = { perTeam: 5, difficulty: 'normal', roundTime: 2.5, freezeTime: 6, c4Timer: 45, startMoney: 800, buyTime: 1.5, ...defaults };
    const { w, body } = this._window('Create Server', 'st-newgame', () => this._closeDlg());
    this._center(w, 470);
    const tabs = el('div', 'st-tabs');
    tabs.appendChild(el('div', 'st-tab on', 'Game'));
    const page = el('div', 'st-page');
    // maps: [[id, label]]; mapInfo(id) -> Promise<{ ok, html }>; addFiles(FileList) -> Promise
    const maps = d.maps || [['de_dust2', 'de_dust2']];
    const map = this._select(maps, d.map && maps.some(([id]) => id === d.map) ? d.map : maps[0][0]);
    const bots = this._select(Array.from({ length: 16 }, (_, i) => [i, String(i)]), d.perTeam ?? d.botsPerTeam ?? 5);
    const diff = this._select([['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['expert', 'Expert']], d.difficulty);
    const rt = this._slider(1, 9, 0.25, d.roundTime, (v) => v.toFixed(2));
    const ft = this._slider(0, 15, 1, d.freezeTime, (v) => String(v));
    const c4 = this._slider(10, 90, 5, d.c4Timer, (v) => String(v));
    const money = this._select([800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000, 10000, 16000].map((v) => [v, '$' + v]), d.startMoney);
    const bt = this._slider(0.25, 3, 0.25, d.buyTime, (v) => v.toFixed(2));
    const mode = this._select([['classic', 'Classic'], ['zombies', 'Zombie survival']], d.mode === 'zombies' ? 'zombies' : 'classic');
    const allies = this._select(Array.from({ length: 11 }, (_, i) => [i, String(i)]), Math.min(10, d.allies ?? 0));
    const classicRows = [
      this._row('Bots per team', bots),
      this._row('Round time (mp_roundtime)', rt),
      this._row('Freeze time (mp_freezetime)', ft),
      this._row('C4 timer (mp_c4timer)', c4),
      this._row('Start money (mp_startmoney)', money),
      this._row('Buy time (mp_buytime)', bt),
    ];
    const zombieRows = [this._row('Bot teammates', allies)];
    const zombieNote = el('div', 'st-note', 'Endless waves of zombies until you die. You start with $16000 and can buy anywhere, any time.');
    page.append(
      this._row('Mode', mode),
      this._row('Map', map),
      ...zombieRows,
      this._row('Bot difficulty', diff),
      ...classicRows,
      zombieNote,
    );
    const modeRefresh = () => {
      const z = mode.value === 'zombies';
      for (const r of classicRows) r.style.display = z ? 'none' : '';
      for (const r of zombieRows) r.style.display = z ? '' : 'none';
      zombieNote.style.display = z ? '' : 'none';
      teamNote.textContent = z ? 'You fight as a Counter-Terrorist.' : 'You choose your team when the game starts.';
    };
    mode.addEventListener('change', modeRefresh);
    // files for maps that aren't built in (the player's own copy of the .bsp / WADs)
    const files = el('div', 'st-mapfiles');
    files.style.cssText = 'margin:6px 0 2px;padding:6px 8px;border:1px solid rgba(255,255,255,0.15);font-size:11px;line-height:1.45;display:none';
    const info = el('div');
    const pickRow = el('div');
    pickRow.style.marginTop = '5px';
    const pick = el('input');
    pick.type = 'file';
    pick.multiple = true;
    pick.accept = '.bsp,.wad,.tga';
    pick.style.fontSize = '11px';
    pickRow.append(pick);
    files.append(info, pickRow);
    let mapOk = true;
    const refresh = async () => {
      const id = map.value;
      if (!d.mapInfo || id === 'de_dust2') { files.style.display = 'none'; mapOk = true; start.disabled = false; return; }
      files.style.display = '';
      const r = await d.mapInfo(id);
      if (map.value !== id) return;
      info.innerHTML = r.html;
      pickRow.style.display = r.bundled ? 'none' : '';
      mapOk = r.ok;
      start.disabled = !mapOk;
    };
    pick.addEventListener('change', async () => {
      if (!pick.files?.length || !d.addFiles) return;
      info.textContent = 'Storing files...';
      try { await d.addFiles(pick.files); } catch (e) { info.textContent = 'Could not store the files: ' + e.message; return; }
      pick.value = '';
      refresh();
    });
    map.addEventListener('change', refresh);
    page.appendChild(files);
    const teamNote = el('div', 'st-note', '');
    page.appendChild(teamNote);
    modeRefresh();
    const btns = el('div', 'st-btns');
    const start = el('button', 'st-btn', 'Start');
    const cancel = el('button', 'st-btn', 'Cancel');
    start.addEventListener('click', () => {
      const opts = {
        ...d,
        map: map.value,
        perTeam: +bots.value,
        difficulty: diff.value,
        roundTime: +rt.input.value,
        freezeTime: +ft.input.value,
        c4Timer: +c4.input.value,
        startMoney: +money.value,
        buyTime: +bt.input.value,
        mode: mode.value,
        allies: +allies.value,
      };
      this._closeDlg();
      if (onStart) onStart(opts);
      else this.onCommand('newgame');
    });
    cancel.addEventListener('click', () => this._closeDlg());
    btns.append(start, cancel);
    body.append(tabs, page, btns);
    this.root.appendChild(w);
    this.dlg = w;
    start.focus();
    refresh();
  }

  /** Zombie survival is over: the score and Play again / Main menu. */
  showZombieOver(r, onAgain, onMenu) {
    this._closeDlg();
    const { w, body } = this._window('Game Over', 'st-zombieover', () => { this._closeDlg(); onMenu?.(); });
    this._center(w, 360);
    const page = el('div', 'st-page');
    const big = el('div', null, `You survived ${r.waves} wave${r.waves === 1 ? '' : 's'}`);
    big.style.cssText = 'font-size:20px;font-weight:bold;color:#d22a1a;margin:6px 0 10px;text-align:center';
    page.append(big);
    page.append(this._row('Zombies killed', el('span', null, String(r.kills))));
    page.append(this._row('Best', el('span', null, `${r.best} wave${r.best === 1 ? '' : 's'}${r.newBest ? ' (new best!)' : ''}`)));
    const btns = el('div', 'st-btns');
    const again = el('button', 'st-btn', 'Play again');
    const menu = el('button', 'st-btn', 'Main menu');
    again.addEventListener('click', () => { this._closeDlg(); onAgain?.(); });
    menu.addEventListener('click', () => { this._closeDlg(); onMenu?.(); });
    btns.append(again, menu);
    body.append(page, btns);
    this.root.appendChild(w);
    this.dlg = w;
    again.focus();
  }

  showOptions(settings = {}, onChange) {
    this._closeDlg();
    const cur = { ...settings };
    const { w, body } = this._window('Options', '', () => this._closeDlg());
    this._center(w, 440);
    const tabs = el('div', 'st-tabs');
    const pages = {};
    const controls = []; // [key, getValue]
    const bool = (k, v) => (typeof cur[k] === 'number' ? (v ? 1 : 0) : !!v);
    const mkPage = (name) => {
      const t = el('div', 'st-tab', name);
      const p = el('div', 'st-page');
      p.hidden = true;
      t.addEventListener('click', () => {
        for (const n of Object.keys(pages)) { pages[n].p.hidden = n !== name; pages[n].t.classList.toggle('on', n === name); }
      });
      tabs.appendChild(t);
      pages[name] = { t, p };
      return p;
    };
    // Multiplayer: name + crosshair + HUD cvars
    const mp = mkPage('Multiplayer');
    if ('name' in cur) {
      const name = el('input');
      name.type = 'text';
      name.value = cur.name;
      name.maxLength = 31;
      this._isolateKeys(name);
      mp.appendChild(this._row('Player name', name));
      controls.push(['name', () => name.value.trim() || cur.name]);
    }
    const ccIdx = Math.max(0, XHAIR_COLORS.findIndex(([, c]) => sameColor(c, cur.crosshairColor || [50, 250, 50])));
    const cc = this._select(XHAIR_COLORS.map(([n], i) => [i, n]), ccIdx);
    const sw = el('span', 'st-swatch');
    const paint = () => { const c = XHAIR_COLORS[+cc.value][1]; sw.style.background = `rgb(${c})`; };
    cc.addEventListener('change', paint);
    paint();
    mp.appendChild(this._row('Crosshair color', cc, sw));
    controls.push(['crosshairColor', () => XHAIR_COLORS[+cc.value][1].slice()]);
    const cs = this._select([['auto', 'Auto-size'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], cur.crosshairSize || 'auto');
    mp.appendChild(this._row('Crosshair size', cs));
    controls.push(['crosshairSize', () => cs.value]);
    const dynKey = 'cl_dynamiccrosshair' in cur ? 'cl_dynamiccrosshair' : 'dynamicCrosshair';
    const dyn = this._check('Dynamic crosshair (cl_dynamiccrosshair)', cur[dynKey] ?? 1);
    mp.appendChild(dyn);
    controls.push([dynKey, () => bool(dynKey, dyn.input.checked)]);
    const fpsKey = 'cl_showfps' in cur ? 'cl_showfps' : 'showFps';
    const fps = this._check('Show frame rate (cl_showfps)', cur[fpsKey]);
    mp.appendChild(fps);
    controls.push([fpsKey, () => bool(fpsKey, fps.input.checked)]);
    const ngKey = 'net_graph' in cur ? 'net_graph' : 'netGraph';
    const ng = this._check('Show net graph (net_graph)', cur[ngKey]);
    mp.appendChild(ng);
    controls.push([ngKey, () => bool(ngKey, ng.input.checked)]);
    if ('cl_bulletcam' in cur) {
      const bc = this._check('Sniper headshot bullet cam (cl_bulletcam)', cur.cl_bulletcam);
      mp.appendChild(bc);
      controls.push(['cl_bulletcam', () => bool('cl_bulletcam', bc.input.checked)]);
    }
    if ('hud_fastswitch' in cur) {
      const fsw = this._check('Fast weapon switch (hud_fastswitch)', cur.hud_fastswitch);
      mp.appendChild(fsw);
      controls.push(['hud_fastswitch', () => bool('hud_fastswitch', fsw.input.checked)]);
    }
    // Mouse
    const mo = mkPage('Mouse');
    const sens = this._slider(0.5, 20, 0.1, cur.sensitivity ?? 2.5, (v) => v.toFixed(1));
    mo.appendChild(this._row('Mouse sensitivity', sens));
    controls.push(['sensitivity', () => +sens.input.value]);
    const inv = this._check('Reverse mouse', cur.invertY);
    mo.appendChild(inv);
    controls.push(['invertY', () => bool('invertY', inv.input.checked)]);
    // Audio
    const au = mkPage('Audio');
    const vol = this._slider(0, 1, 0.05, cur.volume ?? 0.8, (v) => Math.round(v * 100) + '%');
    au.appendChild(this._row('Game volume', vol));
    controls.push(['volume', () => +vol.input.value]);
    // Video
    const vi = mkPage('Video');
    const res = this._select(RES_MODES, cur.mode || 'native');
    vi.appendChild(this._row('Resolution', res));
    controls.push(['mode', () => res.value]);
    const asp = this._select([['fill', 'Fill window (widescreen)'], ['4:3', '4:3 (pillarboxed)']], cur.aspect || 'fill');
    vi.appendChild(this._row('Aspect ratio', asp));
    controls.push(['aspect', () => asp.value]);
    const fov = this._slider(75, 110, 1, cur.fov ?? 90, (v) => String(v));
    vi.appendChild(this._row('Field of view', fov));
    controls.push(['fov', () => +fov.input.value]);
    const gam = this._slider(1.8, 3.5, 0.05, cur.gamma ?? 2.5, (v) => v.toFixed(2));
    vi.appendChild(this._row('Gamma', gam));
    controls.push(['gamma', () => +gam.input.value]);
    const bri = this._slider(0, 2, 0.05, cur.brightness ?? 1, (v) => v.toFixed(2));
    vi.appendChild(this._row('Brightness', bri));
    controls.push(['brightness', () => +bri.input.value]);

    const apply = () => {
      for (const [k, get] of controls) {
        const v = get();
        const old = cur[k];
        const changed = Array.isArray(v) ? !sameColor(v, old) : v !== old;
        if (!changed) continue;
        cur[k] = v;
        if (onChange) onChange(k, v, { ...cur });
      }
    };
    const btns = el('div', 'st-btns');
    const ok = el('button', 'st-btn', 'OK');
    const cancel = el('button', 'st-btn', 'Cancel');
    const ap = el('button', 'st-btn', 'Apply');
    ok.addEventListener('click', () => { apply(); this._closeDlg(); });
    cancel.addEventListener('click', () => this._closeDlg());
    ap.addEventListener('click', apply);
    btns.append(ok, cancel, ap);
    body.append(tabs, ...Object.values(pages).map((x) => x.p), btns);
    pages.Multiplayer.t.click();
    this.root.appendChild(w);
    this.dlg = w;
  }

  // ---------------------------------------------------------------- VGUI panels

  _vgPanel(kind, title, keyFn) {
    this._closeVg();
    this.hideScoreboard();
    const p = el('div', 'vg-panel');
    Object.assign(p.style, { left: '30px', top: '36px', width: '580px', height: '408px' });
    p.appendChild(el('div', 'vg-title', title));
    this.stage.appendChild(p);
    this.vg = { kind, el: p, key: keyFn };
    return p;
  }

  _closeVg(sendClose = false) {
    if (!this.vg) return;
    this.vg.el.remove();
    this.vg = null;
    if (sendClose) this.onCommand('menu_close');
  }

  _vgButton(key, label, onClick, { price = null, off = false, cls = '' } = {}) {
    const b = el('div', 'vg-btn ' + cls + (off ? ' off' : ''));
    b.append(el('span', 'k', key == null ? '' : String(key)), el('span', 't', label));
    if (price != null) b.appendChild(el('span', 'p', '$' + price));
    if (!off && onClick) b.addEventListener('click', onClick);
    return b;
  }

  showTeamSelect(cb) {
    const choose = (n) => {
      this._closeVg();
      if (cb) cb(n, 'jointeam ' + n);
      else this.onCommand('jointeam ' + n);
    };
    const p = this._vgPanel('team', 'SELECT A TEAM', (n) => { if ([1, 2, 5, 6].includes(n)) choose(n); });
    const col = el('div', 'vg-buttons');
    const info = el('div', 'vg-info');
    for (const b of TEAM_BUTTONS) {
      if (!b) { col.appendChild(el('div', 'vg-btn gap')); continue; }
      col.appendChild(this._vgButton(b.key, b.label, () => choose(b.key)));
    }
    const m = this.mapInfo || { name: 'de_dust2' };
    const custom = m.name && m.name !== 'de_dust2';
    info.appendChild(el('h2', null, custom ? m.name : MAP_BRIEFING.title));
    const lines = custom ? [...(MODE_BRIEFING[m.mode] || MODE_BRIEFING.bomb), ...(m.credit ? ['', m.credit] : [])] : MAP_BRIEFING.text;
    info.appendChild(el('p', null, lines.join('\n')));
    p.append(col, info);
  }

  showClassSelect(team, cb) {
    const T = team === 'CT' ? 'CT' : 'T';
    const list = CLASSES[T];
    const choose = (n) => {
      this._closeVg();
      const skin = n >= 1 && n <= 4 ? list[n - 1].skin : null;
      if (cb) cb(n, 'joinclass ' + n, skin);
      else this.onCommand('joinclass ' + n);
    };
    const p = this._vgPanel('class', T === 'T' ? 'TERRORIST FORCES' : 'COUNTER-TERRORIST FORCES', (n) => { if (n >= 1 && n <= 5) choose(n); });
    const col = el('div', 'vg-buttons');
    const info = el('div', 'vg-info');
    const show = (c) => {
      info.textContent = '';
      const cv = document.createElement('canvas');
      this._paintCanvas(cv, 150, 170, (g) => drawSoldier(g, 150, 170, T, c ? c.key : 0));
      info.appendChild(cv);
      info.appendChild(el('h2', null, c ? c.name : 'Auto-Select'));
      info.appendChild(el('p', null, c ? c.text : AUTO_SELECT_TEXT));
    };
    list.forEach((c) => {
      const b = this._vgButton(c.key, c.name, () => choose(c.key));
      b.addEventListener('mouseenter', () => show(c));
      col.appendChild(b);
    });
    col.appendChild(el('div', 'vg-btn gap'));
    const auto = this._vgButton(5, 'Auto-Select', () => choose(5));
    auto.addEventListener('mouseenter', () => show(null));
    col.appendChild(auto);
    p.append(col, info);
    show(list[0]);
  }

  // itemState(id) -> { off, note, why, price, closed } for any item: zombie survival greys out
  // what can't be bought right now (the upgrades that don't fit the gun in hand, what you
  // already carry, what the phase doesn't sell: closed) with a short note on the button and
  // the reason (why) in the info panel, and gives today's price (the mid-wave markup);
  // upgradeTarget(skins) -> name of the weapon they go on; banner: a line along the bottom
  showBuyMenu(player = {}, { onBuy, allWeapons = false, itemState = null, upgradeTarget = null, banner = null } = {}) {
    const team = allWeapons ? 'ALL' : player.team === 'CT' ? 'CT' : 'T';
    const money = Math.max(0, Math.round(player.money ?? 0));
    const cats = CATEGORIES.filter((c) => !c.zombieOnly || team === 'ALL');
    const stateOf = (id) => (itemState ? itemState(id) : null) || {};
    const priceOf = (id) => stateOf(id).price ?? ITEMS[id]?.price;
    const canBuy = (id) => !!ITEMS[id] && !stateOf(id).off && (priceOf(id) ?? 0) <= money;
    // an entry that opens another page (Weapon Skins...) or buys
    const press = (id) => { const it = ITEMS[id]; if (it?.page) openCat(SUBPAGES[it.page]); else if (canBuy(id)) buy(id); };
    const buy = (item) => {
      this._closeVg();
      const cmd = item === 'primammo' ? 'buyammo1' : item === 'secammo' ? 'buyammo2' : (WEAPON_IDS.includes(item) && !/grenade|flashbang/.test(item) ? 'buy ' : 'buyequip ') + item;
      if (onBuy) onBuy(item, cmd);
      else this.onCommand(cmd);
      this.onCommand('menu_close');
    };
    const state = { page: 'main' };
    const p = this._vgPanel('buy', 'BUY ITEM', (n) => {
      if (n === 0) { this._closeVg(true); return; }
      if (state.page === 'main') {
        const c = cats.find((x) => x.key === n);
        if (!c) return;
        if (c.direct) buy(c.id);
        else openCat(c);
      } else {
        const id = itemsFor(state.page, team)[n - 1];
        if (id) press(id);
      }
    });
    const title = p.querySelector('.vg-title');
    const col = el('div', 'vg-buttons');
    const info = el('div', 'vg-info');
    const cash = el('div', 'vg-money', '$' + money);
    p.append(col, info, cash);
    if (banner) {
      const bn = el('div', 'vg-money', banner);
      Object.assign(bn.style, { left: '240px', right: '18px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', font: 'bold 11px Arial, "Liberation Sans", sans-serif' });
      p.appendChild(bn);
    }

    const showItem = (id) => {
      info.textContent = '';
      const it = ITEMS[id];
      if (!it) return;
      const cv = document.createElement('canvas');
      if (it.stats) {
        const w = this._iconWidth(id) * 5;
        this._paintCanvas(cv, w, 80, (g, s) => drawWeaponIcon(g, id, 0, 0, { scale: 5 * s, color: [205, 205, 205], ramp: [1, 0.62, 0.5] }));
      } else if (ITEM_ICON[id]) {
        const name = ITEM_ICON[id];
        const isHud = name.startsWith('suit') || name === 'defuser';
        const w = isHud ? (name === 'defuser' ? 128 : 96) : this._iconWidth(name) * 4;
        const h = isHud ? (name === 'defuser' ? 128 : 96) : 64;
        this._paintCanvas(cv, w, h, (g, s) => {
          if (isHud) {
            g.imageSmoothingEnabled = true;
            g.drawImage(tinted(hudSprite(name, 1), [205, 205, 205]), 0, 0, w * s, h * s);
          } else drawWeaponIcon(g, name, 0, 0, { scale: 4 * s, color: [205, 205, 205], ramp: [1, 0.62, 0.5] });
        });
      }
      if (it.skin && it.skin !== 'factory') this._paintCanvas(cv, 160, 72, (g, sc) => paintSkinSwatch(g, it.skin, 160 * sc, 72 * sc));
      if (cv.width) info.appendChild(cv);
      info.appendChild(el('h2', null, it.name));
      if (it.stats) {
        const s = it.stats;
        const lines = [
          ['Price', '$' + priceOf(id)], ['Country of origin', s.origin], ['Caliber', s.caliber], ['Clip capacity', s.clip],
          ['Rate of fire', s.rate], ['Weight (loaded)', s.weight], ['Projectile weight', s.proj], ['Muzzle velocity', s.vel], ['Muzzle energy', s.energy],
        ];
        const st = el('div', 'stats');
        for (const [k, v] of lines) {
          const line = el('div');
          line.append(el('b', null, k + ': '), document.createTextNode(v));
          st.appendChild(line);
        }
        info.appendChild(st);
        if (stateOf(id).why) info.appendChild(el('p', null, stateOf(id).why));
      } else {
        const { note, why } = stateOf(id), price = priceOf(id);
        info.appendChild(el('p', null, `${price != null ? `Price: $${price}\n\n` : ''}${it.text}${why || note ? `\n\n(${why || note})` : ''}`));
      }
    };

    const openMain = () => {
      state.page = 'main';
      title.textContent = 'BUY ITEM';
      col.textContent = '';
      info.textContent = '';
      for (const c of cats) {
        // ammo is bought from here: its state and price; a page whose every item the phase
        // keeps shut is dimmed (it still opens, to look)
        const st = c.direct ? stateOf(c.id) : {};
        const shut = !c.direct && itemState && itemsFor(c.id, team).every((id) => ITEMS[id]?.page || stateOf(id).closed);
        const label = st.note ? `${c.label} (${st.note})` : c.label;
        col.appendChild(this._vgButton(c.key, label, () => (c.direct ? buy(c.id) : openCat(c)), { price: st.price ?? null, cls: st.off || shut ? 'off' : '' }));
      }
      col.appendChild(this._vgButton(0, 'Exit', () => this._closeVg(true), { cls: 'cancel' }));
    };
    const openCat = (c) => {
      state.page = c.id;
      const on = c.id === 'upgrade' || c.id === 'skins' ? upgradeTarget?.(c.id === 'skins') : null;
      title.textContent = c.label.toUpperCase() + (on ? ` - ${on.toUpperCase()}` : '');
      col.textContent = '';
      const ids = itemsFor(c.id, team);
      ids.forEach((id, i) => {
        const it = ITEMS[id];
        const st = stateOf(id);
        const off = !it.page && (st.off || (priceOf(id) ?? 0) > money);
        const b = this._vgButton(i + 1, st.note ? `${it.name} (${st.note})` : it.name, () => press(id), { price: it.page ? null : priceOf(id), off });
        b.addEventListener('mouseenter', () => showItem(id));
        col.appendChild(b);
      });
      col.appendChild(this._vgButton(0, 'Cancel', () => this._closeVg(true), { cls: 'cancel' }));
      if (ids.length) showItem(ids[0]);
    };
    this.buyCategory = (n) => {
      const c = cats.find((x) => x.key === n);
      if (c && !c.direct && this.vg?.kind === 'buy') openCat(c);
    };
    openMain();
  }

  _iconWidth(id) {
    return KILL_ICON_W[id] || 48;
  }

  // canvas sized in stage units, rendered at stage scale × devicePixelRatio
  _paintCanvas(cv, w, h, draw) {
    const s = Math.max(1, Math.min(4, this.stageScale * (window.devicePixelRatio || 1)));
    cv.width = Math.round(w * s);
    cv.height = Math.round(h * s);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    draw(g, s);
  }

  // ---------------------------------------------------------------- scoreboard

  showScoreboard(data = {}) {
    const key = JSON.stringify(data);
    if (this.score && this.score.key === key) return;
    if (!this.score) {
      const p = el('div', 'vg-panel vg-score');
      Object.assign(p.style, { left: '40px', top: '40px', width: '560px', height: '400px', pointerEvents: 'none' });
      this.stage.appendChild(p);
      this.score = { el: p, key: '' };
    }
    this.score.key = key;
    const p = this.score.el;
    p.textContent = '';
    p.appendChild(el('div', 'vg-title', data.title || 'Counter-Strike 1.6 de_dust2'));
    const table = el('table');
    const cols = el('colgroup');
    for (const w of ['46%', '14%', '13%', '13%', '14%']) { const c = el('col'); c.style.width = w; cols.appendChild(c); }
    table.appendChild(cols);
    const head = el('tr');
    for (const h of ['Name', '', 'Score', 'Deaths', 'Latency']) head.appendChild(el('th', null, h));
    table.appendChild(head);
    const players = data.players || [];
    const teams = [['T', 'Terrorists', data.tScore ?? 0, 'rgb(255,63,63)'], ['CT', 'Counter-Terrorists', data.ctScore ?? 0, 'rgb(153,204,255)']];
    for (const [t, name, score, color] of teams) {
      const list = players.filter((q) => q.team === t).sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
      const ping = list.length ? Math.round(list.reduce((s, q) => s + (q.ping || 0), 0) / list.length) : 0;
      const tr = el('tr', 'team');
      const n = el('td', null, `${name}   -   ${list.length} player${list.length === 1 ? '' : 's'}`);
      tr.append(n, el('td'), el('td', null, String(score)), el('td'), el('td', null, String(ping)));
      tr.style.color = color;
      table.appendChild(tr);
      for (const q of list) {
        const r = el('tr', q.isLocal ? 'me' : '');
        r.style.color = color;
        const status = !q.alive ? 'Dead' : q.bomb ? 'Bomb' : q.vip ? 'VIP' : '';
        r.append(el('td', null, q.name), el('td', 'st', status), el('td', null, String(q.kills ?? 0)), el('td', null, String(q.deaths ?? 0)), el('td', null, String(q.ping ?? 0)));
        table.appendChild(r);
      }
    }
    p.appendChild(table);
    const specs = players.filter((q) => q.team !== 'T' && q.team !== 'CT');
    if (specs.length) p.appendChild(el('div', 'specs', 'Spectators:  ' + specs.map((q) => q.name).join(', ')));
  }

  hideScoreboard() {
    if (this.score) this.score.el.remove();
    this.score = null;
  }

  // ---------------------------------------------------------------- console

  toggleConsole() {
    if (this.conOpen) {
      this.con.w.hidden = true;
      this.conOpen = false;
      this.con.input.blur();
      return;
    }
    if (!this.con) this._buildConsole();
    this.con.w.hidden = false;
    this.conOpen = true;
    this.con.out.scrollTop = this.con.out.scrollHeight;
    setTimeout(() => this.con && this.conOpen && this.con.input.focus(), 0);
  }

  print(text, color) {
    if (!this.con) this._buildConsole(true);
    const css = Array.isArray(color) ? `rgb(${color[0]},${color[1]},${color[2]})` : color || null;
    for (const line of String(text).split('\n')) {
      const d = el('div', null, line);
      if (css) d.style.color = css;
      this.con.out.appendChild(d);
    }
    while (this.con.out.childNodes.length > 600) this.con.out.firstChild.remove();
    this.con.out.scrollTop = this.con.out.scrollHeight;
  }

  _buildConsole(hidden = false) {
    const { w, body } = this._window('Console', 'st-console', () => this.toggleConsole());
    Object.assign(w.style, { left: '6%', top: '8%' });
    const out = el('div', 'out st-sunken');
    const row = el('div', 'in');
    const input = el('input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    const submit = el('button', 'st-btn', 'Submit');
    row.append(input, submit);
    body.append(out, row);
    this.root.appendChild(w);
    let hpos = -1;
    const send = () => {
      const t = input.value.replace(/`/g, '').trim();
      input.value = '';
      hpos = -1;
      if (!t) return;
      this.print('] ' + t, [255, 255, 255]);
      if (this.conHistory[this.conHistory.length - 1] !== t) this.conHistory.push(t);
      this.onCommand('console:' + t);
    };
    submit.addEventListener('click', () => { send(); input.focus(); });
    input.addEventListener('input', () => { if (input.value.includes('`')) input.value = input.value.replace(/`/g, ''); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Backquote' || e.code === 'Escape') { e.preventDefault(); this.toggleConsole(); return; }
      if (e.key === 'Enter') { e.preventDefault(); send(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const h = this.conHistory;
        if (!h.length) return;
        if (e.key === 'ArrowUp') hpos = hpos < 0 ? h.length - 1 : Math.max(0, hpos - 1);
        else hpos = hpos < 0 ? -1 : hpos + 1 >= h.length ? -1 : hpos + 1;
        input.value = hpos < 0 ? '' : h[hpos];
      }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    w.hidden = hidden;
    this.con = { w, out, input };
  }

  // ---------------------------------------------------------------- loading

  showLoading(text = 'Loading...', progress = 0) {
    if (!this.loading) {
      const { w, body } = this._window('Loading...', 'st-loading', () => {});
      w.querySelector('.x').remove();
      this._center(w);
      const msg = el('div', 'msg');
      const bar = el('div', 'st-progress st-sunken');
      body.append(msg, bar);
      this.root.appendChild(w);
      this.loading = { w, msg, bar, n: -1 };
    }
    const L = this.loading;
    L.msg.textContent = text;
    const total = 37;
    const n = Math.max(0, Math.min(total, Math.round((progress || 0) * total)));
    if (n !== L.n) {
      L.bar.textContent = '';
      for (let i = 0; i < n; i++) L.bar.appendChild(el('i'));
      L.n = n;
    }
  }

  hideLoading() {
    if (this.loading) this.loading.w.remove();
    this.loading = null;
  }

  // ---------------------------------------------------------------- chat input

  showChatInput(teamOnly = false, cb) {
    this._closeChat();
    const box = el('div', 'cs-chat');
    box.appendChild(el('span', null, teamOnly ? 'say_team :' : 'say :'));
    const input = el('input');
    input.type = 'text';
    input.maxLength = 127;
    input.spellcheck = false;
    input.autocomplete = 'off';
    box.appendChild(input);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const t = input.value.trim();
        this._closeChat();
        if (t) {
          if (cb) cb(t);
          else this.onCommand((teamOnly ? 'say_team:' : 'say:') + t);
        }
        this.onCommand('menu_close');
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this._closeChat();
        this.onCommand('menu_close');
      }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.appendChild(box);
    this.chat = { el: box, input };
    this._layout();
    setTimeout(() => this.chat && this.chat.input.focus(), 0);
  }

  _closeChat() {
    if (this.chat) this.chat.el.remove();
    this.chat = null;
  }

  // ---------------------------------------------------------------- plumbing

  _isolateKeys(input) {
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  _layout() {
    const cw = this.container.clientWidth || window.innerWidth;
    const ch = this.container.clientHeight || window.innerHeight;
    const vp = this.vp || { x: 0, y: 0, w: cw, h: ch };
    const s = Math.min(vp.w / 640, vp.h / 480);
    this.stageScale = s;
    Object.assign(this.stage.style, {
      left: vp.x + vp.w / 2 + 'px',
      top: vp.y + vp.h / 2 + 'px',
      transform: `translate(-50%, -50%) scale(${s})`,
    });
    if (this.chat) {
      // the messagemode line sits under the five saytext lines (see hud.js drawChat)
      const k = spriteScale(vp.w, vp.h);
      const px = engineFontPx(vp.h), lh = engineLineHeight(vp.h);
      Object.assign(this.chat.el.style, {
        left: vp.x + 10 * k + 'px',
        top: vp.y + vp.h - 60 * k - lh * 2 + 'px',
        fontSize: px + 'px',
        lineHeight: lh + 'px',
      });
    }
  }

  _key(e) {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && this.root.contains(t);
    if (typing) return; // the field's own handlers deal with it
    const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (this.chat && e.code !== 'Escape') { consume(); this.chat.input.focus(); return; }
    if (this.vg) {
      const n = digitOf(e.code);
      if (n != null) { consume(); if (!e.repeat) this.vg.key(n); return; }
      if (e.code === 'Escape') { consume(); this._closeVg(true); }
      return;
    }
    if (e.code !== 'Escape') return;
    if (this.chat) { consume(); this._closeChat(); this.onCommand('menu_close'); return; }
    if (this.conOpen) { consume(); this.toggleConsole(); return; }
    if (this.dlg) { consume(); this._closeDlg(); return; }
    if (this.main) {
      consume();
      if (this.main.inGame) this.onCommand('resume');
    }
  }
}

// class menu picture: a simple model silhouette per faction
function drawSoldier(g, w, h, team, key) {
  const S = g.canvas.width / w;
  g.save();
  g.scale(S, S);
  const body = '#5d5d5d', edge = '#a9a9a9', dark = '#3a3a3a';
  const poly = (pts, fill) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = edge;
    g.lineWidth = 1;
    g.stroke();
  };
  const cx = w / 2;
  // legs, torso, arms
  poly([cx - 18, 95, cx - 2, 95, cx - 4, 160, cx - 20, 160], body);
  poly([cx + 2, 95, cx + 18, 95, cx + 20, 160, cx + 4, 160], body);
  poly([cx - 24, 46, cx + 24, 46, cx + 20, 100, cx - 20, 100], key === 0 ? dark : body);
  poly([cx - 24, 48, cx - 34, 92, cx - 26, 94, cx - 16, 58], body);
  poly([cx + 24, 48, cx + 30, 80, cx + 6, 86, cx + 4, 78, cx + 20, 72, cx + 16, 58], body);
  // rifle across the body
  poly([cx - 34, 84, cx + 40, 66, cx + 41, 71, cx - 33, 89], dark);
  // head + headgear
  g.beginPath();
  g.ellipse(cx, 30, 11, 13, 0, 0, Math.PI * 2);
  g.fillStyle = body;
  g.fill();
  g.strokeStyle = edge;
  g.stroke();
  if (team === 'CT') {
    if (key === 1 || key === 2 || key === 4) poly([cx - 13, 28, cx - 11, 15, cx, 11, cx + 11, 15, cx + 13, 28], dark); // helmet
    if (key === 3) poly([cx - 8, 30, cx + 8, 30, cx + 6, 40, cx - 6, 40], dark); // gas mask
    if (key === 4) poly([cx - 9, 24, cx + 9, 24, cx + 9, 30, cx - 9, 30], '#2a2a2a'); // visor
  } else {
    if (key === 1) poly([cx - 11, 26, cx + 11, 26, cx + 11, 31, cx - 11, 31], dark); // balaclava eye band
    if (key === 2) poly([cx - 12, 22, cx, 14, cx + 12, 22, cx + 12, 26, cx - 12, 26], dark); // head wrap
    if (key === 3) poly([cx - 13, 34, cx - 13, 20, cx, 13, cx + 13, 20, cx + 13, 34, cx + 9, 34, cx + 9, 24, cx - 9, 24, cx - 9, 34], dark); // hood
    if (key === 4) poly([cx - 12, 20, cx + 12, 18, cx + 15, 22, cx - 12, 24], dark); // bandana
  }
  if (key === 0) {
    g.fillStyle = '#ffb000';
    g.font = 'bold 28px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('?', cx, 82);
  }
  g.restore();
}
