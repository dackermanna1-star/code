// Dead County — DOM user interface (HUD, inventory & panels, menus, overlays).
// See docs/UI_API.md for the contract with the game.
import '@fontsource/vt323';
import '@fontsource/silkscreen';
import '@fontsource/silkscreen/700.css';
import './ui.css';

import { h, setClass, clamp } from './dom.js';
import { Hud } from './hud.js';
import { Tooltip, ContextMenu } from './tooltip.js';
import { PanelHost } from './panels/PanelHost.js';
import { MainMenu } from './menus/MainMenu.js';
import { LoadingScreen, PauseMenu, DeathScreen, NoteReader, DialogLayer } from './menus/Overlays.js';

// Panel hotkeys (C is crouch — handled by the game; crafting is X)
const PANEL_KEYS = { tab: 'inventory', i: 'inventory', x: 'crafting', h: 'health', m: 'map', k: 'skills' };

export class UI {
  constructor(game, rootElement) {
    this.game = game;
    this.mount = rootElement || document.getElementById('ui') || document.body;
    this._sounds = new Map();

    this.root = h('div.dc-ui');
    this.mount.appendChild(this.root);

    this.hud = new Hud(this);
    this.tooltip = new Tooltip(this);
    this.ctx = new ContextMenu(this);
    this.panels = new PanelHost(this);
    this.pause = new PauseMenu(this);
    this.death = new DeathScreen(this);
    this.note = new NoteReader(this);
    this.menu = new MainMenu(this);
    this.loading = new LoadingScreen(this);
    this.dialogs = new DialogLayer(this);

    this.root.append(this.hud.el, this.panels.el, this.note.el, this.death.el, this.pause.el, this.menu.el,
      this.loading.el, this.dialogs.el, this.tooltip.el, this.ctx.el);

    this._resize = () => this.onResize();
    window.addEventListener('resize', this._resize);
    this.onResize();

    // Menus / pause / death are driven by the UI itself (the game may not forward keys in those states).
    this._keyCapture = (e) => this.captureKey(e);
    window.addEventListener('keydown', this._keyCapture, true);
    this.root.addEventListener('contextmenu', (e) => {
      if (e.target.closest('input, textarea')) return;
      e.preventDefault();
    });
  }

  // ------------------------------------------------------------------ helpers
  onResize() {
    const w = window.innerWidth, hgt = window.innerHeight;
    const u = Math.round(clamp(Math.min(w / 1280, hgt / 720), 0.75, 3) * 20) / 20;
    this.u = u;
    this.root.style.setProperty('--u', u + 'px');
    this.hud.onResize(u);
    this.panels.onResize();
  }

  /** Play a UI sound (throttled per name). */
  sound(name, volume = 1, pitch = 1) {
    const now = performance.now();
    const last = this._sounds.get(name) || 0;
    if (now - last < (name === 'ui_hover' ? 45 : 25)) return;
    this._sounds.set(name, now);
    try { this.game.audio?.play?.(name, { volume, pitch }); } catch { /* audio optional */ }
  }

  /** Standard pixel button. cls: space separated extra classes (btn-menu, btn-primary, btn-wide, btn-danger...) */
  button(label, fn, cls = '') {
    const extra = cls.split(/\s+/).filter(Boolean).map((c) => '.' + c).join('');
    const b = h('button.btn' + extra, { type: 'button' }, h('span.btn-label', label));
    b.addEventListener('pointerenter', () => { if (!b.disabled) this.sound('ui_hover', 0.35); });
    b.addEventListener('click', (e) => {
      if (b.disabled || b.classList.contains('disabled')) return;
      this.sound('ui_click');
      fn?.(e);
    });
    return b;
  }

  get hudAllowed() {
    return !this.menu.isOpen && !this.loading.isOpen && !this.death.isOpen && this.game.state !== 'menu' && this.game.state !== 'dead';
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    if (this.hudAllowed) {
      this.hud.show();
      this.hud.update(dt);
    } else this.hud.hide();
    this.panels.update(dt);
    setClass(this.root, 'panel-open', this.panels.isOpen);
  }

  // ------------------------------------------------------------------ keys
  isTyping() {
    const ae = document.activeElement;
    return !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable) && this.root.contains(ae));
  }

  captureKey(e) {
    if (e.__dcHandled) return;
    const k = e.key;
    if (this.dialogs.isOpen && (this.menu.isOpen || this.death.isOpen || this.pause.isOpen)) {
      if (k === 'Escape') { this.dialogs.close(); e.__dcHandled = true; e.preventDefault(); }
      return;
    }
    if (this.menu.isOpen) {
      if (k === 'Escape') {
        if (this.isTyping()) document.activeElement.blur();
        this.menu.back();
        e.__dcHandled = true;
      }
      return;
    }
    if (this.pause.isOpen && this.game.state !== 'playing') {
      if (k === 'Escape') {
        this.pause.back();
        e.__dcHandled = true;
        e.preventDefault();
      }
    }
  }

  handleKey(e) {
    if (e.__dcHandled) return true;
    const k = e.key;
    const lower = k && k.length === 1 ? k.toLowerCase() : (k || '').toLowerCase();

    if (this.isTyping()) {
      if (k === 'Escape') { document.activeElement.blur(); return true; }
      if (k === 'Tab') e.preventDefault();
      return true;
    }

    if (k === 'Escape') {
      if (this.ctx.open) { this.ctx.hide(); return true; }
      if (this.dialogs.isOpen) { this.dialogs.close(); return true; }
      if (this.note.isOpen) { this.closeNote(); return true; }
      if (this.panels.isOpen) { this.closeAll(); return true; }
      if (this.pause.isOpen) return this.pause.back();
      if (this.menu.isOpen) return this.menu.back();
      if (this.death.isOpen || this.loading.isOpen) return true;
      return false;
    }
    if (this.dialogs.isOpen) {
      if (k === 'Enter') this.dialogs.confirm();
      return true;
    }
    if (this.note.isOpen) {
      if (lower === 'e' || k === 'Enter' || lower === ' ') this.closeNote();
      return true;
    }
    if (this.pause.isOpen || this.menu.isOpen || this.loading.isOpen || this.death.isOpen) return true;

    const target = PANEL_KEYS[lower];
    if (target && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault?.();
      if (this.panels.current === target) this.closeAll();
      else this.openPanel(target);
      return true;
    }
    if (this.panels.isOpen) {
      if (this.panels.handleKey(e)) return true;
      if (lower === 'e' && this.panels.current === 'inventory') { this.closeAll(); return true; }
    }
    return false;
  }

  isBlocking() {
    return this.panels.isOpen || this.menu.isOpen || this.loading.isOpen || this.pause.isOpen || this.death.isOpen
      || this.note.isOpen || this.dialogs.isOpen;
  }

  // ------------------------------------------------------------------ panels
  openInventory(lootSources) {
    const wasOpen = this.panels.current === 'inventory';
    if (!wasOpen) this.sound('zipper', 0.7);
    this.panels.open('inventory', lootSources);
  }

  openPanel(name) {
    if (name === 'inventory') return this.openInventory();
    if (!this.panels.panels[name]) return;
    if (this.panels.current !== name) this.sound(this.panels.isOpen ? 'ui_click' : 'ui_open', 0.7);
    this.panels.open(name);
  }

  closeAll() {
    const any = this.panels.isOpen;
    this.ctx.hide();
    this.tooltip.hide();
    this.panels.close();
    if (any) this.sound('ui_close', 0.6);
    setClass(this.root, 'panel-open', false);
  }

  refresh() {
    this.panels.refresh();
  }

  // ------------------------------------------------------------------ screens
  showMainMenu(screen = 'main') {
    this.closeAll();
    this.pause.hide();
    this.death.hide();
    this.note.hide();
    this.loading.hide();
    this.hud.hide();
    this.hud.hintsShown = false;
    this.menu.open(screen);
  }
  hideMainMenu() { this.menu.close(); }

  showLoading(label, frac) {
    this.hud.hide();
    this.loading.show(label, frac);
  }
  hideLoading() { this.loading.hide(); }

  showPause() {
    this.ctx.hide();
    this.tooltip.hide();
    this.pause.show();
  }
  hidePause() { this.pause.hide(); }

  showDeath(info) {
    this.closeAll();
    this.note.hide();
    this.pause.hide();
    this.dialogs.closeAll();
    this.hud.hide();
    this.death.show(info || {});
  }

  showNote(note) {
    this.ctx.hide();
    this.tooltip.hide();
    this.note.show(note || {});
    this.sound('ui_open', 0.5);
  }
  closeNote() {
    if (!this.note.isOpen) return;
    this.note.hide();
    this.sound('ui_close', 0.5);
  }

  showDialog(d) { return this.dialogs.show(d || {}); }

  // ------------------------------------------------------------------ HUD events
  toast(text, type = 'info') { this.hud.toast(text, type); }
  locationBanner(name, subtitle) { this.hud.locationBanner(name, subtitle); }
  subtitle(text, seconds = 5) { this.hud.subtitle(text, seconds); }
  hitMarker(kind = 'hit') { this.hud.hitMarker(kind); }
  damageIndicator(angleRad) { this.hud.damageIndicator(angleRad || 0); }
  setCrosshair(spread01) { this.hud.setCrosshair(spread01); }
  showHints(seconds) { this.hud.showHints(seconds); }

  dispose() {
    window.removeEventListener('resize', this._resize);
    window.removeEventListener('keydown', this._keyCapture, true);
    this.menu.backdrop.stop();
    this.root.remove();
  }
}

export default UI;
