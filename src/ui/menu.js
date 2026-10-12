// Menus: a faithful m_menu.c front end (main, episode and skill menus,
// Read This!, quit, message boxes, skull cursor) plus a modern settings
// menu drawn with the original OPTIONS title, STCFN text and thermometers.

import { buildSaveLoadMenus, openLoadMenu, openSaveMenu, saveLoadResponder, drawSaveLoad } from './menu-saveload.js';
import { DoomFont } from './font.js';
import { drawText, eventToVirtual, keyName } from './menu-util.js';
import { buildOptionMenus } from './menu-options.js';
import { STRINGS, QUIT_MESSAGES } from '../game/data.js';
import { DEFAULTS, DEFAULT_BINDS } from '../settings.js';

const LINEHEIGHT = 16;
const SKULLXOFF = -32;
const SKULLS = ['M_SKULL1', 'M_SKULL2'];

// Settings list layout (virtual coordinates).
const LABEL_X = 30;
const VALUE_X = 184;
const THERMO_CELLS = 10;
const TEXT_H = 7;

const QUIT_SOUNDS = ['pldeth', 'dmpain', 'popain', 'slop', 'telept', 'posit1', 'posit3', 'sgtatk'];
const QUIT_SOUNDS2 = ['vilact', 'getpow', 'boscub', 'slop', 'skeswg', 'kntdth', 'bspact', 'sgtatk'];


const RED = 0;
const GRAY = 1;
const GOLD = 2;

export class Menu {
  constructor(app) {
    this.app = app;
    this.font = new DoomFont(app.res);
    this.active = false;
    this.cur = null;
    this.itemOn = 0;
    this.skullAnimCounter = 10;
    this.whichSkull = 0;
    this.msg = null; // {text, input, routine}
    this.capture = null; // action being rebound
    this.quitTics = 0;
    this.epi = 0;
    this.openTime = 0;
    this.clock = 0;
    this.mouseV = null; // last pointer position in virtual coords
    this.dragging = null;
    this.build();
    this.attachMouse();
  }

  get gamemode() { return this.app.gamemode || (this.app.game && this.app.game.gamemode) || 'shareware'; }
  get commercial() { return this.gamemode === 'commercial'; }
  get settings() { return this.app.settings; }

  sound(name) {
    const a = this.app.audio;
    if (a && a.ui) a.ui(name);
  }

  // --- Menu definitions (M_Init) ----------------------------------------

  build() {
    const mode = this.gamemode;
    const commercial = mode === 'commercial';
    const main = {
      kind: 'patch', x: 97, y: 64, lastOn: 0, prev: null,
      items: [
        { patch: 'M_NGAME', key: 'n', run: () => this.newGame() },
        { patch: 'M_OPTION', key: 'o', run: () => this.setup(this.options.root) },
        { patch: 'M_LOADG', key: 'l', run: () => openLoadMenu(this) },
        { patch: 'M_SAVEG', key: 's', run: () => openSaveMenu(this) },
        { patch: 'M_RDTHIS', key: 'r', run: () => this.setup(this.read1) },
        { patch: 'M_QUITG', key: 'q', run: () => this.quitDoom() },
      ],
      draw: (r) => r.drawPatch('M_DOOM', 94, 2),
    };
    if (commercial) {
      // DOOM II drops Read This! and moves the list down.
      main.items.splice(4, 1);
      main.y += 8;
    }
    const episodes = mode === 'retail' ? 4 : 3;
    const epi = {
      kind: 'patch', x: 48, y: 63, lastOn: 0, prev: main,
      items: [
        { patch: 'M_EPI1', key: 'k' }, { patch: 'M_EPI2', key: 't' },
        { patch: 'M_EPI3', key: 'i' }, { patch: 'M_EPI4', key: 't' },
      ].slice(0, episodes).map((it, i) => ({ ...it, run: () => this.chooseEpisode(i) })),
      draw: (r) => r.drawPatch('M_EPISOD', 54, 38),
    };
    const skill = this.settings.get('skill');
    const newg = {
      kind: 'patch', x: 48, y: 63, lastOn: Number.isInteger(skill) && skill >= 0 && skill <= 4 ? skill : 2,
      prev: commercial ? main : epi,
      items: [
        { patch: 'M_JKILL', key: 'i' }, { patch: 'M_ROUGH', key: 'h' }, { patch: 'M_HURT', key: 'h' },
        { patch: 'M_ULTRA', key: 'u' }, { patch: 'M_NMARE', key: 'n' },
      ].map((it, i) => ({ ...it, run: () => this.chooseSkill(i) })),
      draw: (r) => {
        r.drawPatch('M_NEWG', 96, 14);
        r.drawPatch('M_SKILL', 54, 38);
      },
    };
    // Read This! pages (linuxdoom rules): HELP1 then HELP2, or CREDIT for
    // Ultimate DOOM; DOOM II shows HELP only.
    const read2 = {
      kind: 'page', page: mode === 'retail' ? 'CREDIT' : 'HELP2', x: 330, y: 175, lastOn: 0,
      run: () => this.setup(main),
    };
    const read1 = {
      kind: 'page', page: commercial ? 'HELP' : 'HELP1', x: commercial ? 330 : 280, y: commercial ? 165 : 185,
      lastOn: 0, prev: main,
      run: () => (commercial ? this.setup(main) : this.setup(read2)),
    };
    read2.prev = read1;
    this.main = main;
    this.epiDef = epi;
    this.newDef = newg;
    this.read1 = read1;
    this.read2 = read2;
    this.options = buildOptionMenus(this);
    this.options.root.prev = main;
    this.saveload = buildSaveLoadMenus(this);
    this.saveload.load.prev = main;
    this.saveload.save.prev = main;
    this.cur = main;
  }

  // --- Open / close -------------------------------------------------------

  open() {
    if (this.active) return;
    const app = this.app;
    this.active = true;
    this.openTime = performance.now();
    this.msg = null;
    this.setup(this.main);
    this.sound('swtchn');
    // Free the pointer so the menu can be used with the mouse.
    app.input.wantLock = false;
    app.input.releaseLock();
  }

  // Opens straight onto a page (F1-F3 shortcuts).
  openTo(page) {
    this.open();
    if (page === 'help') this.setup(this.read1);
    else if (page === 'save') openSaveMenu(this);
    else if (page === 'load') openLoadMenu(this);
    else if (page === 'options') this.setup(this.options.root);
  }

  close() {
    if (!this.active) return;
    const app = this.app;
    this.active = false;
    this.msg = null;
    this.dragging = null;
    this.cancelCapture();
    if (app.game.state === 'level') {
      app.input.wantLock = true;
      app.input.requestLock();
    }
  }

  setup(menu) {
    this.cur = menu;
    this.itemOn = menu.lastOn || 0;
    if (menu.kind === 'list') this.itemOn = this.nearestSelectable(menu, this.itemOn, 1);
  }

  back() {
    const m = this.cur;
    m.lastOn = this.itemOn;
    if (m.prev) {
      this.setup(m.prev);
      this.sound('swtchn');
    }
  }

  // --- Message boxes (M_StartMessage) -------------------------------------

  startMessage(text, input = false, routine = null) {
    this.msg = { text, input, routine };
  }

  messageResponder(code, e) {
    const m = this.msg;
    let ch = null;
    if (code === 'KeyY') ch = 'y';
    else if (code === 'KeyN') ch = 'n';
    else if (e && e.pad && code === 'Enter') ch = 'y'; // gamepad A / B answer y/n
    else if (e && e.pad && code === 'Backspace') ch = 'n';
    else if (code === 'Space') ch = ' ';
    else if (code === 'Escape') ch = 'escape';
    if (m.input && !ch) return true;
    if (code === 'WheelUp' || code === 'WheelDown') return true;
    this.msg = null;
    this.sound('swtchx');
    if (m.routine) m.routine(ch || code);
    return true;
  }

  // --- Main menu actions ----------------------------------------------------

  newGame() {
    this.setup(this.commercial ? this.newDef : this.epiDef);
  }

  chooseEpisode(choice) {
    if (this.gamemode === 'shareware' && choice) {
      this.startMessage(STRINGS.SWSTRING);
      return;
    }
    if (this.gamemode === 'registered' && choice > 2) choice = 0;
    this.epi = choice;
    this.setup(this.newDef);
  }

  chooseSkill(choice) {
    if (choice === 4) {
      this.startMessage(STRINGS.NIGHTMARE, true, (ch) => { if (ch === 'y') this.startGame(4); });
      return;
    }
    this.startGame(choice);
  }

  startGame(skill) {
    this.newDef.lastOn = skill;
    this.settings.set('skill', skill);
    this.app.startNewGame(this.commercial ? 1 : this.epi + 1, skill);
  }

  quitDoom() {
    const list = this.commercial ? QUIT_MESSAGES.doom2 : QUIT_MESSAGES.doom;
    const text = list[Math.floor(Math.random() * list.length)];
    this.startMessage(`${text}\n\n(press y to quit)`, true, (ch) => {
      if (ch !== 'y') return;
      const sounds = this.commercial ? QUIT_SOUNDS2 : QUIT_SOUNDS;
      this.sound(sounds[Math.floor(Math.random() * sounds.length)]);
      // I_WaitVBL(105): hold the screen for 1.5 s, then back to the title
      // since a browser tab cannot quit to DOS.
      this.quitTics = 53;
      this.quitText = `${text}\n\n(press y to quit)`;
      this.main.lastOn = 0;
    });
  }

  endGame() {
    if (this.app.game.state !== 'level') {
      this.sound('oof');
      return;
    }
    this.startMessage(STRINGS.ENDGAME, true, (ch) => { if (ch === 'y') this.toTitle(); });
  }

  // D_StartTitle
  toTitle() {
    const app = this.app;
    this.active = false;
    this.msg = null;
    this.quitTics = 0;
    this.cancelCapture();
    app.input.wantLock = false;
    app.input.releaseLock();
    if (app.audio.stopAll) app.audio.stopAll();
    if (app.audio.setWorld) app.audio.setWorld(null);
    app.game.state = 'title';
    app.game.emit('title');
  }

  // --- Settings actions -----------------------------------------------------

  confirmReset() {
    this.startMessage('reset all settings to defaults?\n\npress y or n.', true, (ch) => {
      if (ch !== 'y') return;
      // Reset key by key so objects holding settings.values (the world)
      // keep seeing live values; equivalent to settings.reset().
      for (const k of Object.keys(DEFAULTS)) this.settings.set(k, structuredClone(DEFAULTS[k]));
      if (this.app.hud) this.app.hud.message('settings reset to defaults');
    });
  }

  resetBinds() {
    this.settings.set('binds', structuredClone(DEFAULT_BINDS));
    this.startMessage('key bindings reset to defaults.\n\npress a key.');
  }

  confirmShareware() {
    this.startMessage('switch back to the shareware wad?\nthe page will reload.\n\npress y or n.', true, (ch) => {
      if (ch === 'y') this.app.resetIwad();
    });
  }

  pickIwad() {
    const el = document.getElementById('wadinput');
    if (!el) {
      this.startMessage('file loading is unavailable.\n\npress a key.');
      return;
    }
    el.value = '';
    el.onchange = async () => {
      const file = el.files && el.files[0];
      if (!file) return;
      try {
        const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        const ident = String.fromCharCode(...head);
        if (ident !== 'IWAD') {
          this.startMessage(`${file.name.toLowerCase()} is not an iwad.\n\npress a key.`);
          return;
        }
        this.startMessage(`loading ${file.name.toLowerCase()}...`);
        await this.app.loadIwadFile(file);
      } catch (err) {
        this.startMessage(`could not load the file.\n${String(err && err.message || err).toLowerCase()}\n\npress a key.`);
      }
    };
    el.click();
  }

  // --- Key binding capture ----------------------------------------------------

  startCapture(action) {
    this.capture = action;
    this.app.input.captureKey((code) => this.finishCapture(code));
  }

  cancelCapture() {
    if (!this.capture) return;
    this.capture = null;
    if (this.app.input.captureNext) this.app.input.captureNext = null;
  }

  finishCapture(code) {
    const action = this.capture;
    this.capture = null;
    if (!action) return;
    if (code === 'Escape') {
      this.sound('swtchx');
      return;
    }
    const binds = structuredClone(this.settings.get('binds'));
    if (code === 'Backspace' || code === 'Delete') {
      binds[action] = [];
    } else {
      for (const k of Object.keys(binds)) {
        if (k !== action) binds[k] = (binds[k] || []).filter((c) => c !== code);
      }
      binds[action] = [code, ...(binds[action] || []).filter((c) => c !== code)].slice(0, 2);
    }
    this.settings.set('binds', binds);
    this.sound('pistol');
  }

  clearBind(action) {
    const binds = structuredClone(this.settings.get('binds'));
    binds[action] = [];
    this.settings.set('binds', binds);
    this.sound('stnmov');
  }

  // --- Settings list helpers ------------------------------------------------

  selectable(item) {
    return item && item.type !== 'gap' && item.type !== 'info' && item.type !== 'note';
  }

  nearestSelectable(menu, i, dir) {
    const n = menu.items.length;
    for (let k = 0; k < n; k++) {
      const j = ((i + k * dir) % n + n) % n;
      if (this.selectable(menu.items[j])) return j;
    }
    return 0;
  }

  moveList(dir) {
    const m = this.cur;
    const n = m.items.length;
    let i = this.itemOn;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (this.selectable(m.items[i])) break;
    }
    this.itemOn = i;
    this.sound('pstop');
  }

  visibleRows(m) {
    return Math.max(1, Math.floor((m.bottom - m.top) / m.rowH));
  }

  // Keep the selected row on screen.
  scrollTo(m) {
    const vis = this.visibleRows(m);
    const maxScroll = Math.max(0, m.items.length - vis);
    if (this.itemOn < m.scroll) m.scroll = this.itemOn;
    if (this.itemOn >= m.scroll + vis) m.scroll = this.itemOn - vis + 1;
    m.scroll = Math.max(0, Math.min(maxScroll, m.scroll));
  }

  sliderIndex(item, v) {
    const n = Math.round((item.max - item.min) / item.step);
    return Math.max(0, Math.min(n, Math.round((Number(v) - item.min) / item.step)));
  }

  sliderValue(item, idx) {
    return Number((item.min + idx * item.step).toFixed(4));
  }

  setValue(item, v) {
    this.settings.set(item.key, v);
    if (item.onChange) item.onChange(v);
  }

  // Left/right (dir -1/+1) on a settings row.
  adjust(item, dir) {
    const s = this.settings;
    if (!item) return;
    if (item.type === 'toggle') {
      this.setValue(item, !s.get(item.key));
    } else if (item.type === 'choice') {
      const vals = item.values;
      let i = vals.indexOf(s.get(item.key));
      i = i < 0 ? 0 : (i + dir + vals.length) % vals.length;
      this.setValue(item, vals[i]);
    } else if (item.type === 'slider') {
      const n = Math.round((item.max - item.min) / item.step);
      const i = Math.max(0, Math.min(n, this.sliderIndex(item, s.get(item.key)) + dir));
      this.setValue(item, this.sliderValue(item, i));
    } else return;
    this.sound('stnmov');
  }

  activate(item) {
    if (!item) return;
    switch (item.type) {
      case 'sub': {
        const target = this.options[item.target];
        this.cur.lastOn = this.itemOn;
        target.prev = this.cur;
        this.setup(target);
        this.sound('pistol');
        break;
      }
      case 'toggle':
      case 'choice':
      case 'slider':
        this.adjust(item, 1);
        break;
      case 'bind':
        this.sound('pistol');
        this.startCapture(item.action);
        break;
      case 'action':
        this.sound('pistol');
        item.run();
        break;
      default: break;
    }
  }

  // --- Input --------------------------------------------------------------------

  responder(code, e) {
    if (!this.active) return false;
    if (this.quitTics > 0) return true;
    if (code === 'Escape' && performance.now() - this.openTime < 250) return true;
    if (this.msg) return this.messageResponder(code, e);
    if (this.capture) return true;
    const m = this.cur;
    if (m.kind === 'saveload' && this.saveEdit) return saveLoadResponder(this, m, code, e);

    if (code === 'Escape') {
      m.lastOn = this.itemOn;
      this.close();
      this.sound('swtchx');
      return true;
    }
    if (code === 'Backspace' || code === 'Mouse2') {
      // A right click on the top menu closes it (mouse-only players).
      if (code === 'Mouse2' && !m.prev) {
        m.lastOn = this.itemOn;
        this.close();
        this.sound('swtchx');
      } else this.back();
      return true;
    }
    if (m.kind === 'saveload') return saveLoadResponder(this, m, code, e);
    if (m.kind === 'page') return this.pageResponder(m, code);
    if (m.kind === 'patch') return this.patchResponder(m, code);
    return this.listResponder(m, code);
  }

  pageResponder(m, code) {
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'Mouse0') {
      m.lastOn = 0;
      this.sound('pistol');
      m.run();
    } else if (code === 'ArrowUp' || code === 'ArrowDown') {
      this.sound('pstop');
    }
    return true;
  }

  patchResponder(m, code) {
    const n = m.items.length;
    switch (code) {
      case 'ArrowDown':
        this.itemOn = (this.itemOn + 1) % n;
        this.sound('pstop');
        return true;
      case 'ArrowUp':
        this.itemOn = (this.itemOn + n - 1) % n;
        this.sound('pstop');
        return true;
      case 'Enter':
      case 'NumpadEnter':
        this.runPatchItem(m);
        return true;
      case 'Mouse0': {
        const hit = this.hitTest();
        if (hit != null) {
          this.itemOn = hit;
          this.runPatchItem(m);
        }
        return true;
      }
      default: break;
    }
    // Hotkeys: first letter of the item, searching after the cursor first.
    if (code.startsWith('Key')) {
      const ch = code.slice(3).toLowerCase();
      for (let k = 1; k <= n; k++) {
        const i = (this.itemOn + k) % n;
        if (m.items[i].key === ch) {
          this.itemOn = i;
          this.sound('pstop');
          break;
        }
      }
    }
    return true;
  }

  runPatchItem(m) {
    const item = m.items[this.itemOn];
    if (!item || !item.run) return;
    m.lastOn = this.itemOn;
    this.sound('pistol');
    item.run();
  }

  listResponder(m, code) {
    const item = m.items[this.itemOn];
    switch (code) {
      case 'ArrowDown': this.moveList(1); break;
      case 'ArrowUp': this.moveList(-1); break;
      case 'PageDown':
      case 'PageUp': {
        const dir = code === 'PageDown' ? 1 : -1;
        const target = Math.max(0, Math.min(m.items.length - 1, this.itemOn + dir * this.visibleRows(m)));
        this.itemOn = this.nearestSelectable(m, target, -dir);
        this.sound('pstop');
        break;
      }
      case 'Home':
        this.itemOn = this.nearestSelectable(m, 0, 1);
        this.sound('pstop');
        break;
      case 'End':
        this.itemOn = this.nearestSelectable(m, m.items.length - 1, -1);
        this.sound('pstop');
        break;
      case 'ArrowLeft': this.adjust(item, -1); break;
      case 'ArrowRight': this.adjust(item, 1); break;
      case 'Enter':
      case 'NumpadEnter':
        this.activate(item);
        break;
      case 'Delete':
        if (item && item.type === 'bind') this.clearBind(item.action);
        break;
      case 'Mouse0': {
        const hit = this.hitTest();
        if (hit == null) break;
        this.itemOn = hit;
        const it = m.items[hit];
        if (it.type === 'slider' && this.thermoHit(it)) {
          this.dragging = it;
        } else this.activate(it);
        break;
      }
      default: break;
    }
    return true;
  }

  // --- Mouse ------------------------------------------------------------------

  attachMouse() {
    const canvas = this.app.canvas;
    if (!canvas) return;
    canvas.addEventListener('mousemove', (e) => {
      if (!this.active || this.app.input.locked) return;
      this.mouseV = eventToVirtual(this.app, e);
      if (this.msg || this.capture || this.quitTics) return;
      if (this.dragging && (e.buttons & 1)) {
        this.thermoHit(this.dragging);
        return;
      }
      const hit = this.hitTest();
      if (hit != null && hit !== this.itemOn) {
        this.itemOn = hit;
        this.sound('pstop');
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active || this.app.input.locked) return;
      this.mouseV = eventToVirtual(this.app, e);
    }, true);
    window.addEventListener('mouseup', () => { this.dragging = null; });
    canvas.addEventListener('wheel', (e) => {
      if (!this.active || this.app.input.locked || this.msg || this.capture) return;
      const m = this.cur;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (m.kind === 'list') this.moveList(dir);
      else if (m.kind === 'patch') this.patchResponder(m, dir > 0 ? 'ArrowDown' : 'ArrowUp');
    }, { passive: true });
  }

  // Index of the item under the pointer in the current menu, or null.
  hitTest() {
    const v = this.mouseV;
    const m = this.cur;
    if (!v || !m) return null;
    if (m.kind === 'patch') {
      for (let i = 0; i < m.items.length; i++) {
        const y = m.y + i * LINEHEIGHT;
        const p = this.app.res.patch(m.items[i].patch);
        const w = p ? p.width : 160;
        if (v.y >= y - 1 && v.y < y + LINEHEIGHT - 1 && v.x >= m.x + SKULLXOFF && v.x <= m.x + w + 8) return i;
      }
      return null;
    }
    if (m.kind === 'list') {
      const pad = (m.rowH - TEXT_H) / 2;
      const row = Math.floor((v.y - m.top + pad) / m.rowH);
      const vis = this.visibleRows(m);
      if (row < 0 || row >= vis || v.x < LABEL_X - 20 || v.x > 318) return null;
      const i = m.scroll + row;
      return this.selectable(m.items[i]) ? i : null;
    }
    return null;
  }

  // Sets a slider from the pointer if it is over the thermometer.
  thermoHit(item) {
    const v = this.mouseV;
    if (!v) return false;
    const x0 = VALUE_X + 8;
    const span = (THERMO_CELLS - 1) * 8;
    if (v.x < VALUE_X - 4 || v.x > x0 + THERMO_CELLS * 8 + 12) return false;
    const f = Math.max(0, Math.min(1, (v.x - x0 - 2) / span));
    const n = Math.round((item.max - item.min) / item.step);
    const value = this.sliderValue(item, Math.round(f * n));
    if (value !== this.settings.get(item.key)) {
      this.setValue(item, value);
      this.sound('stnmov');
    }
    return true;
  }

  // --- Ticker -----------------------------------------------------------------

  tick() {
    this.clock++;
    if (--this.skullAnimCounter <= 0) {
      this.whichSkull ^= 1;
      this.skullAnimCounter = 8;
    }
    if (this.quitTics > 0 && --this.quitTics === 0) this.toTitle();
  }

  // --- Drawing ------------------------------------------------------------------

  draw(r) {
    if (!this.active) return;
    if (this.quitTics > 0) {
      this.drawMessage(r, this.quitText || '');
      return;
    }
    // M_Drawer shows only the message while one is up.
    if (this.msg) {
      this.drawMessage(r, this.msg.text);
      return;
    }
    const m = this.cur;
    if (m.kind === 'page') this.drawPage(r, m);
    else if (m.kind === 'saveload') drawSaveLoad(this, r, m);
    else if (m.kind === 'patch') this.drawPatchMenu(r, m);
    else this.drawList(r, m);
  }

  drawMessage(r, text) {
    const lines = String(text).split('\n');
    const lh = 8;
    let y = Math.round(100 - (lines.length * lh) / 2);
    // Darken a band behind the text so it reads over busy screens.
    const w = Math.max(...lines.map((l) => this.font.width(l))) + 16;
    const h = lines.length * lh + 10;
    r.shadeRect(r.vLeft + (160 - w / 2) * r.vScaleX, (y - 5) * r.vScaleY, w * r.vScaleX, h * r.vScaleY, 22);
    for (const line of lines) {
      drawText(r, this.font, line, 160, y, { align: 'center' });
      y += lh;
    }
  }

  drawPage(r, m) {
    r.fillRect(0, 0, r.W, r.H, 0);
    r.drawPatch(m.page, 0, 0);
    r.drawPatch(SKULLS[this.whichSkull], m.x + SKULLXOFF, m.y - 5);
  }

  drawPatchMenu(r, m) {
    if (m.draw) m.draw(r);
    for (let i = 0; i < m.items.length; i++) {
      r.drawPatch(m.items[i].patch, m.x, m.y + i * LINEHEIGHT);
    }
    r.drawPatch(SKULLS[this.whichSkull], m.x + SKULLXOFF, m.y - 5 + this.itemOn * LINEHEIGHT);
  }

  drawList(r, m) {
    r.shadeRect(0, 0, r.W, r.H, 27);
    r.drawPatch('M_OPTTTL', 108, 15);
    if (m.subtitle) drawText(r, this.font, m.subtitle, 160, 36, { align: 'center', trans: GOLD });
    this.scrollTo(m);
    const vis = this.visibleRows(m);
    const end = Math.min(m.items.length, m.scroll + vis);
    for (let i = m.scroll; i < end; i++) {
      const y = m.top + (i - m.scroll) * m.rowH;
      this.drawRow(r, m.items[i], y, i === this.itemOn);
    }
    if (m.scroll > 0) this.drawArrow(r, 306, m.top - 9, true);
    if (end < m.items.length) this.drawArrow(r, 306, m.top + vis * m.rowH - 3, false);
    if (m.hint) {
      const text = this.capture
        ? 'press a key - esc cancels - del clears'
        : 'enter to change - del to clear';
      drawText(r, this.font, text, 160, 189, { align: 'center', trans: GRAY });
    }
  }

  drawArrow(r, vx, vy, up) {
    const sx = r.vScaleX, sy = r.vScaleY;
    for (let i = 0; i < 4; i++) {
      const row = up ? i : 3 - i;
      r.fillRect(r.vLeft + (vx - i) * sx, (vy + row) * sy, (i * 2 + 1) * sx, sy, 176);
    }
  }

  drawRow(r, item, y, sel) {
    const s = this.settings;
    const font = this.font;
    const labelTrans = sel ? GOLD : RED;
    const valueTrans = sel ? GOLD : GRAY;
    if (item.type === 'gap') return;
    if (item.type === 'note') {
      drawText(r, font, item.text, 160, y, { align: 'center', trans: GRAY });
      return;
    }
    if (sel) {
      r.drawPatch(SKULLS[this.whichSkull], LABEL_X - 14, y - 1, { noOffset: true, scale: 0.5 });
    }
    drawText(r, font, item.label, LABEL_X, y, { trans: item.type === 'info' ? RED : labelTrans });
    switch (item.type) {
      case 'info':
        drawText(r, font, String(item.value()), VALUE_X, y, { trans: GRAY });
        break;
      case 'toggle':
        drawText(r, font, s.get(item.key) ? 'on' : 'off', VALUE_X, y, { trans: valueTrans });
        break;
      case 'choice': {
        const v = s.get(item.key);
        const i = item.values.indexOf(v);
        drawText(r, font, i >= 0 ? item.names[i] : String(v), VALUE_X, y, { trans: valueTrans });
        break;
      }
      case 'slider': {
        const v = s.get(item.key);
        const n = Math.round((item.max - item.min) / item.step);
        const f = n ? this.sliderIndex(item, v) / n : 0;
        this.drawThermo(r, VALUE_X, y - 3, THERMO_CELLS, f);
        const text = item.fmt ? item.fmt(Number(v)) : String(v);
        drawText(r, font, text, VALUE_X + 8 + THERMO_CELLS * 8 + 12, y, { trans: valueTrans });
        break;
      }
      case 'bind': {
        let text;
        let trans = valueTrans;
        if (this.capture === item.action) {
          text = (this.clock & 16) ? 'press a key...' : '';
          trans = GOLD;
        } else {
          const list = s.get('binds')[item.action] || [];
          text = list.length ? list.map(keyName).join(', ') : '---';
        }
        drawText(r, font, text, VALUE_X - 24, y, { trans });
        break;
      }
      default: break;
    }
  }

  // M_DrawThermo with a continuous dot position (f = 0..1).
  drawThermo(r, x, y, cells, f) {
    let xx = x;
    r.drawPatch('M_THERML', xx, y);
    xx += 8;
    for (let i = 0; i < cells; i++) {
      r.drawPatch('M_THERMM', xx, y);
      xx += 8;
    }
    r.drawPatch('M_THERMR', xx, y);
    r.drawPatch('M_THERMO', x + 8 + Math.round(f * (cells - 1) * 8), y);
  }
}
