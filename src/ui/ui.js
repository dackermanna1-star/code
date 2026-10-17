// HW.ui — the UI manager. API: docs/TECH.md §6.1 (dialogue), §6.2 (prompt), §15–§16 (screens).
//
// Layers, bottom → top (all on the 960×540 UI buffer):
//   CG backdrop → overlays → HUD/prompt → special screens (pa, safe, …) → dialogue/choices →
//   menus & documents → cards → title / game over → toasts.
// Input goes to exactly one owner per frame: the top menu-level screen, else the dialogue,
// else the top special screen. A screen never sees the key press that opened it.
import { HW } from '../engine/hw.js';
import { W, H } from './theme.js';
import { loadFonts } from './fonts.js';
import { UIInput } from './input.js';
import { Dialogue } from './dialogue.js';
import { Hud } from './hud.js';
import { Backdrop, Overlays, COMPACT_CIRCLE } from './overlays.js';
import { Z_SPECIAL, Z_MENU, Z_TOP } from './screen.js';
import { SCREENS } from './screens/index.js';
import { dimScreen } from './gfx.js';
import * as svc from './services.js';

const TRANSCRIPT_MAX = 400;

class UIManager {
  constructor() {
    this.input = new UIInput();
    this.dialogue = new Dialogue(this);
    this.hud = new Hud(this);
    this.backdrop = new Backdrop();
    this.overlays = new Overlays();
    this.screens = [];          // sorted by z (stable)
    this.frame = 0;
    this.time = 0;
    this.ready = false;
    /** Recent dialogue for tests/debugging: { kind, who, expr, text } | { kind: 'choice', options } */
    this.transcript = [];
    /** The compact's glass circle in world px — the renderer draws the 1979 view inside it. */
    this.compactCircle = COMPACT_CIRCLE;
    // bind the public API so callers can pass methods around
    for (const k of ['init', 'update', 'render', 'isBusy', 'menuOpen', 'say', 'think', 'narrate', 'choice', 'doc',
      'toast', 'objective', 'card', 'cg', 'open', 'close', 'get', 'setOverlay', 'overlay', 'prompt', 'title',
      'gameOver', 'reset']) this[k] = this[k].bind(this);
  }

  async init() {
    await loadFonts();
    this.input.attach();
    this.ready = true;
  }

  // ---- frame ----------------------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    this.time += dt;
    this.input.update(dt);
    const owner = this._focus();
    this.backdrop.update(dt);
    this.overlays.update(dt);
    this.dialogue.update(dt, owner === this.dialogue ? this.input : null);
    for (const s of this.screens.slice()) {
      s.t += dt;
      s._tick();
      try { s.update(dt, owner === s && this.frame > s.frame0 ? this.input : null); }
      catch (e) { console.error('[ui] screen update', s.name, e); s.close(null); }
      if (s.closing) {
        s.alpha = Math.max(0, s.alpha - dt / Math.max(0.01, s.fadeOut));
        if (s.alpha <= 0) this._remove(s);
      } else s.alpha = Math.min(1, s.alpha + dt / Math.max(0.01, s.fadeIn));
    }
    // toasts and notices wait behind full-screen cards / title / game over
    this.hud.update(dt, this._hudVisible(), !this._fullscreenUp());
    this.frame++;
    this.input.endFrame();
  }

  render(ctx) {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    this.backdrop.render(ctx);
    this.overlays.render(ctx);
    this.hud.render(ctx);
    let dialogueDrawn = false;
    for (const s of this.screens) {
      if (!dialogueDrawn && s.z >= Z_MENU) { this.dialogue.render(ctx); dialogueDrawn = true; }
      this._renderScreen(ctx, s);
    }
    if (!dialogueDrawn) this.dialogue.render(ctx);
    if (!this._fullscreenUp()) this.hud.renderTop(ctx);
    ctx.globalAlpha = 1;
  }

  _fullscreenUp() { return this.screens.some((s) => s.z >= 25 && !s.closing); }

  _renderScreen(ctx, s) {
    if (s.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    try {
      if (s.dimWorld) dimScreen(ctx, s.dimWorld);
      s.render(ctx);
    } catch (e) { console.error('[ui] screen render', s.name, e); s.close(null); }
    ctx.restore();
  }

  _focus() {
    let top = null;
    for (const s of this.screens) if (!s.closing) top = s;
    if (top && top.z >= Z_MENU) return top;
    if (this.dialogue.active) return this.dialogue;
    return top;
  }

  _hudVisible() {
    if (this.dialogue.visible || this.screens.length || this.backdrop.active) return false;
    if (this.overlays.has('locker') || this.overlays.has('vhs') || this.overlays.has('heads_down') || this.overlays.has('black')) return false;
    const mode = HW.game?.mode;
    return mode === undefined || mode === null || mode === 'play';
  }

  _remove(s) {
    const i = this.screens.indexOf(s);
    if (i >= 0) this.screens.splice(i, 1);
    try { s.onRemoved?.(); } catch (e) { console.error(e); }
    s._resolve?.(s.result);
  }

  _log(entry) {
    this.transcript.push(entry);
    if (this.transcript.length > TRANSCRIPT_MAX) this.transcript.splice(0, this.transcript.length - TRANSCRIPT_MAX);
  }

  // ---- state queries -------------------------------------------------------------------------------
  /** True while any dialogue, choice or modal screen is up (scripts/engine wait on this). */
  isBusy() { return this.dialogue.active || this.screens.some((s) => !s.closing); }
  /** True while a menu that should pause the world is open (pause, inventory, sketchbook, …). */
  menuOpen() { return this.screens.some((s) => !s.closing && s.pausesGame); }

  // ---- dialogue --------------------------------------------------------------------------------------
  say(who, expr, text, opts) { return this.dialogue.say(who, expr, text, opts || {}); }
  think(expr, text, opts) { return this.dialogue.think(expr, text, opts || {}); }
  narrate(text, opts) { return this.dialogue.narrate(text, opts || {}); }
  choice(options, opts) { return this.dialogue.choice(options, opts || {}); }

  // ---- notifications ----------------------------------------------------------------------------------
  toast(text) { this._log({ kind: 'toast', text }); this.hud.toast(text); }
  objective(text) {
    if (HW.state) HW.state.objective = text;
    this._log({ kind: 'objective', text });
    if (!text) return;
    this.hud.notice(text);
    svc.sfx('objective');
  }
  prompt(target, verb) { this.hud.setPrompt(this.isBusy() ? null : target, verb); }

  // ---- backdrops & overlays ---------------------------------------------------------------------------
  cg(id, opts) { return this.backdrop.set(id || null, opts || {}); }
  setOverlay(name, params) { this.overlays.set(name, params); }
  overlay(name, params) { this.overlays.set(name, params); }

  // ---- screens ----------------------------------------------------------------------------------------
  doc(id) { return this.open('doc', { id }); }
  card(title, subtitle, opts) { return this.open('card', { title, subtitle, ...(opts || {}) }); }
  title() { return this.open('title', {}); }
  gameOver(reason) { return this.open('gameover', { reason }); }

  /**
   * Open a modal screen by name (§16): 'pa' | 'safe' | 'terminal' | 'register' | 'breath' |
   * 'pause' | 'inventory' | 'sketchbook' | 'settings' | 'saveload' | 'credits' | 'doc' | 'card' |
   * 'title' | 'gameover' | 'confirm'. Resolves with the screen's result when it closes.
   */
  open(name, args, parent) {
    const Ctor = SCREENS[name];
    if (!Ctor) { svc.warnOnce('open:' + name, 'unknown screen'); return Promise.resolve(null); }
    const quick = this._autoResult(name, args || {});
    if (quick !== undefined) return Promise.resolve(quick);
    // a persistent menu that is already open just comes back to the front
    const existing = this.screens.find((s) => s.name === name && !s.closing && s.singleton);
    if (existing) return existing._promise;
    const s = new Ctor(this, args || {});
    s.name = name;
    s.frame0 = this.frame;
    if (parent && parent.z > s.z) s.z = parent.z;
    else { const top = this._topOpen(); if (top && top.z === Z_TOP && s.z < Z_TOP) s.z = Z_TOP; }
    let at = this.screens.length;
    while (at > 0 && this.screens[at - 1].z > s.z) at--;
    this.screens.splice(at, 0, s);
    s._promise = new Promise((res) => { s._resolve = res; });
    try { s.onOpen(); } catch (e) { console.error('[ui] onOpen', name, e); s.close(null); }
    return s._promise;
  }
  _topOpen() { for (let i = this.screens.length - 1; i >= 0; i--) if (!this.screens[i].closing) return this.screens[i]; return null; }

  /** Close the top-most open screen called `name` (or the top screen if omitted). */
  close(name, result) {
    for (let i = this.screens.length - 1; i >= 0; i--) {
      const s = this.screens[i];
      if (!s.closing && (!name || s.name === name)) { s.close(result); return true; }
    }
    return false;
  }
  /** The live instance of an open screen (e.g. HW.ui.get('pa').setMode('allcall')). */
  get(name) { for (let i = this.screens.length - 1; i >= 0; i--) if (this.screens[i].name === name && !this.screens[i].closing) return this.screens[i]; return null; }

  /** Clear everything (new game, load, quit to title). Pending promises resolve. */
  reset() {
    this.dialogue.reset();
    const old = this.screens;
    this.screens = [];
    for (const s of old) {
      try { s.onRemoved?.(); } catch (e) { console.error(e); }
      s._resolve?.(s.result ?? null);
    }
    if (this.input._textMode) this.input.endText();
    this.backdrop.clear();
    this.overlays.clear();
    this.hud.prompt = null;
    this.hud.toasts = [];
    this.hud.notices = [];
  }

  /** Automated tests (HW.debug.autoAdvance): resolve modal screens without waiting for a player. */
  _autoResult(name, args) {
    if (!svc.auto()) return undefined;
    try {
      const forced = HW.debug?.screenAnswer?.(name, args);
      if (forced !== undefined) return forced;
    } catch (e) { svc.warnOnce('screenAnswer', e); }
    switch (name) {
      case 'doc': if (HW.state && args.id) { HW.state.docs = HW.state.docs || {}; HW.state.docs[args.id] = true; } this._log({ kind: 'doc', id: args.id }); return null;
      case 'card': this._log({ kind: 'card', title: args.title, subtitle: args.subtitle }); return null;
      case 'gameover': return 'retry';
      case 'breath': return 'held';
      case 'title': return { action: 'new' };
      case 'pa': case 'terminal': case 'register': return null;
      case 'safe': {
        if (typeof args.check !== 'function') return false;
        for (let a = 0; a < 100; a++) for (let b = 0; b < 100; b++) for (let c = 0; c < 100; c++) if (args.check(a, b, c)) return true;
        return false;
      }
      default: return undefined;
    }
  }
}

export const ui = new UIManager();
export default ui;
export { Z_SPECIAL, Z_MENU, Z_TOP };
