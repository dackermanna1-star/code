// =============================================================================
// HUD, menus and user experience (everything 2D inside #hud).
//
//  * start screen (boarding pass) · pause menu · flight progress panel + skips
//  * settings bound to app.settings · seat map · controls / help · credits
//  * in-game: centre dot, interaction prompt, announcement captions, toasts,
//    phase title cards, slim progress line, FPS counter, cinematic indicator
//
// API: { toast(text, ms), showCard(texture|url, title), openPanel(name),
//        closeAll(), isMenuOpen, showStart(), hideStart(), board(), setVisible(on) }
// Panel names: 'pause' | 'flight' | 'settings' | 'seatmap' | 'help' | 'credits'
// =============================================================================
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { AIRLINE, SEAT_LIST, FT } from '../core/constants.js';
import { PHASES, PHASE_IDS } from '../flight/state.js';
import { h, svg, ICONS, LOGO } from './dom.js';
import { buildSeatMap, seatInfo } from './seatmap.js';
import { markdown } from './markdown.js';
import { SETTINGS_GROUPS } from './settingsSchema.js';

const CREDIT_MODULES = ['environment', 'city', 'clouds', 'exterior', 'airport', 'cabin', 'seats', 'galley', 'flight', 'player', 'audio', 'ife', 'hud'];
const SPEAKER_LABEL = { captain: 'Captain', purser: 'Cabin crew', fo: 'First officer', crew: 'Cabin crew' };
const PHASE_TITLES = {
  gate: 'At the gate', pushback: 'Pushback', taxi_out: 'Taxi', lineup: 'Line up · Runway 09', takeoff: 'Takeoff',
  climb: 'Climb', cruise: 'Cruise', descent: 'Descent', approach: 'Final approach · Runway 09', landing: 'Landing',
  taxi_in: 'Taxi to the gate', arrived: 'Welcome to Port Solano',
};
const DEFAULT_SEAT = '16A';

function injectCss() {
  if (document.querySelector('link[data-hn-hud]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'styles/hud.css';
  l.dataset.hnHud = '1';
  document.head.appendChild(l);
}

const safe = (fn, fb) => { try { return fn(); } catch (e) { console.warn('[hud]', e); return fb; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Hud {
  constructor(app) {
    this.app = app;
    this.s = app.settings;
    this.stack = [];            // open panels (top = last)
    this.panels = {};
    this.startVisible = false;
    this.assignedSeat = DEFAULT_SEAT;
    this.seatChosen = false;
    this.prevMode = 'play';
    this.hover = null;
    this.caption = null;
    this.toasts = [];
    this._pauseOpenedAt = -1;
    this._fps = { frames: 0, t: 0 };
    this._acc = 0;
    // in automated screenshots of other modules keep the view clean unless asked
    this.tempHidden = !!(app.debug.shot && app.debug.module !== 'hud');

    const host = document.getElementById('hud') || document.body;
    this.root = h('div.hn-root', { 'aria-live': 'off' });
    host.appendChild(this.root);
    this._buildInGame();
    this.scrim = h('div.hn-scrim', { onclick: () => { if (this.stack.length && this.stack[this.stack.length - 1] !== 'pause' && !this.startVisible) this.back(); } });
    this.root.appendChild(this.scrim);
    this.panelLayer = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.root.appendChild(this.panelLayer);

    this._bindEvents();
    app.addUpdate((dt) => this.update(dt), 80, 'hud');
    this._applyVisibility();
  }

  // ===========================================================================
  // in-game layer
  // ===========================================================================
  _buildInGame() {
    const L = h('div.hn-ingame', { style: { position: 'absolute', inset: '0', pointerEvents: 'none', transition: 'opacity 0.35s' } });
    this.ingame = L;
    this.letterbox = h('div.hn-letterbox');
    this.crosshair = h('div.hn-crosshair');
    this.promptKeys = h('span.hn-keys');
    this.promptText = h('span');
    this.prompt = h('div.hn-prompt', { role: 'status' }, this.promptKeys, this.promptText);
    this.capSpeaker = h('div.hn-cap-speaker');
    this.capText = h('div.hn-cap-text');
    this.captions = h('div.hn-captions', { role: 'status', 'aria-live': 'polite' }, this.capSpeaker, h('div', this.capText));
    this.toastBox = h('div.hn-toasts', { 'aria-live': 'polite' });
    this.phaseSmall = h('small');
    this.phaseBig = h('b');
    this.phase = h('div.hn-phase', this.phaseSmall, this.phaseBig, h('i'));
    this.progFill = h('div.fill');
    this.progTrack = h('div.track', this.progFill);
    this.progLabel = h('div.label');
    this.progline = h('div.hn-progline', this.progTrack, this.progLabel);
    this.cineName = h('b');
    this.cineSub = h('span');
    this.cine = h('div.hn-cine', h('div.rec'), h('div', this.cineName, h('br'), this.cineSub),
      h('div.hint', h('span.hn-kbd', '1'), '–', h('span.hn-kbd', '6'), ' shots ', h('span.hn-kbd', '0'), ' auto ', h('span.hn-kbd', 'V'), ' cabin'));
    this.lockHint = h('div.hn-lockhint', 'Click to look around');
    L.append(this.letterbox, this.progline, this.crosshair, this.prompt, this.captions, this.phase, this.cine, this.lockHint, this.toastBox);
    this.fps = h('div.hn-fps');
    this.root.append(L, this.fps);
  }

  _applyVisibility() {
    const show = this.s.get('showHud') !== false && !this.tempHidden;
    this.ingame.style.opacity = show ? '1' : '0';
    this.ingame.style.visibility = show ? 'visible' : 'hidden';
    this.fps.classList.toggle('show', !!(this.s.get('showFps') || this.app.debug.fps));
  }

  // ===========================================================================
  // events
  // ===========================================================================
  _bindEvents() {
    const app = this.app, ev = app.events;
    ev.on('interact:hover', (p) => this._setPrompt(p));
    ev.on('cabin:announcement', (p) => this._startCaption(p));
    ev.on('cabin:announcementEnd', (p) => { if (this.caption && (!p || !p.id || p.id === this.caption.id)) this.caption.end = Math.min(this.caption.end, app.time + 0.9); });
    ev.on('flight:phase', (p) => this._phaseCard(p && p.phase));
    ev.on('flight:restart', () => { this._lastPhaseCard = null; });
    ev.on('view:mode', (p) => this._viewMode(p || {}));
    ev.on('input:lostlock', () => {
      if (!app.started || this.startVisible || this.stack.length) return;
      this._pauseOpenedAt = performance.now();
      this.openPanel('pause');
    });
    ev.on('player:sit', () => { if (this.panels.seatmap && this._isOpen('seatmap')) this._refreshSeatMap(); });
    ev.on('player:stand', () => { if (this.panels.seatmap && this._isOpen('seatmap')) this._refreshSeatMap(); });
    this.s.onChange((key) => {
      if (key === 'showHud' || key === 'showFps') this._applyVisibility();
      if (this.panels.settings) this._syncSettings();
    });
    ev.on('quality:changed', () => { if (this.panels.settings) this._syncSettings(); });
    window.addEventListener('keydown', (e) => this._onKey(e), true);
    document.addEventListener('fullscreenchange', () => { if (this.panels.help) this._syncHelp?.(); });
  }

  _isOpen(name) { return this.stack.includes(name); }
  get topPanel() { return this.stack[this.stack.length - 1] || null; }

  _onKey(e) {
    const app = this.app;
    if (app.debug.noui) return;
    const mode = app.input?.mode;
    const code = e.code;
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'TEXTAREA' || (tgt.tagName === 'INPUT' && tgt.type === 'text'))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const inGame = app.started && !this.startVisible;

    if (code === 'Escape') {
      if (mode === 'ife') return;                     // the IFE / focus mode owns Esc
      if (this.stack.length) {
        if (this.topPanel === 'pause' && performance.now() - this._pauseOpenedAt < 450) return;
        e.preventDefault();
        this.back();
        return;
      }
      if (inGame) { e.preventDefault(); this.openPanel('pause'); }
      return;
    }
    if (code === 'F1' || (e.key === '?' && !e.repeat)) {
      e.preventDefault();
      if (mode === 'ife' && !this.stack.length) return;
      if (this.topPanel === 'help') this.back(); else this.openPanel('help');
      return;
    }
    if (e.repeat) return;
    if (code === 'Tab') {
      if (!inGame) return;
      if (this.stack.length === 1 && this.topPanel === 'flight') { e.preventDefault(); this.back(); return; }
      if (!this.stack.length && (mode === 'play' || mode === 'cinematic' || mode === 'menu')) { e.preventDefault(); this.openPanel('flight'); }
      return;
    }
    if (code === 'KeyM') {
      if (!inGame) return;
      if (this.stack.length === 1 && this.topPanel === 'seatmap') { this.back(); return; }
      if (!this.stack.length && (mode === 'play' || mode === 'menu') && app.view?.mode !== 'cinematic') this.openPanel('seatmap');
      return;
    }
    if (code === 'KeyH') {
      if (!inGame || this.stack.length || mode === 'ife') return;
      this.tempHidden = false;
      this.s.set('showHud', !(this.s.get('showHud') !== false));
      return;
    }
    if (code === 'KeyF') {
      if (mode === 'ife') return;
      this.toggleFullscreen();
    }
  }

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else {
        const p = document.documentElement.requestFullscreen?.();
        if (p && p.then) p.then(() => { if (this.app.input?.mode === 'play') this.app.input.requestLock?.(); }).catch(() => {});
      }
    } catch { /* not allowed */ }
  }

  // ===========================================================================
  // prompt / captions / toasts / phase / cinematic
  // ===========================================================================
  _setPrompt(p) {
    this.hover = p && p.label ? p : null;
    if (!this.hover) { this.prompt.classList.remove('show'); this.crosshair.classList.remove('active'); return; }
    const key = p.key || 'E';
    this.promptKeys.replaceChildren(h('span.hn-kbd', key), h('span.hn-or', '/ click'));
    this.promptText.textContent = p.label;
    this.prompt.classList.add('show');
    this.crosshair.classList.add('active');
  }

  _startCaption(p) {
    if (!p || !p.text) return;
    let sentences = Array.isArray(p.sentences) && p.sentences.length ? p.sentences.map((s) => ({ t: +s.t || 0, text: String(s.text) })) : null;
    const duration = Math.max(1.5, +p.duration || p.text.length / 14);
    if (!sentences) {
      const parts = p.text.split(/(?<=[.!?])\s+/).filter(Boolean);
      const tot = parts.reduce((a, b) => a + b.length, 0) || 1;
      let t = 0;
      sentences = parts.map((s) => { const r = { t, text: s }; t += duration * s.length / tot; return r; });
    }
    const who = SPEAKER_LABEL[p.speaker] || (p.speaker ? String(p.speaker) : 'Announcement');
    this.caption = { id: p.id, sentences, t0: this.app.time, end: this.app.time + duration + 1.2, idx: -1 };
    this.capSpeaker.replaceChildren(svg(ICONS.speaker), who);
  }

  _updateCaption() {
    const c = this.caption;
    const on = this.s.get('subtitles') !== false;
    if (!c) { this.captions.classList.remove('show'); return; }
    const t = this.app.time - c.t0;
    if (this.app.time > c.end) { this.caption = null; this.captions.classList.remove('show'); return; }
    let idx = 0;
    for (let i = 0; i < c.sentences.length; i++) if (c.sentences[i].t <= t + 0.05) idx = i;
    if (idx !== c.idx) {
      const first = c.idx < 0;
      c.idx = idx;
      const txt = c.sentences[idx].text;
      if (first) this.capText.textContent = txt;
      else {
        this.capText.classList.add('swap');
        clearTimeout(this._capSwap);
        this._capSwap = setTimeout(() => { this.capText.textContent = txt; this.capText.classList.remove('swap'); }, 220);
      }
    }
    this.captions.classList.toggle('show', on && !this.startVisible);
  }

  toast(text, ms = 3000) {
    if (!text || this.app.debug.noui) return;
    // de-duplicate identical toasts that are still visible
    const dup = this.toasts.find((t) => t.text === text && !t.leaving);
    if (dup) { dup.until = this.app.time + ms / 1000; return; }
    const el = h('div.hn-toast', String(text));
    this.toastBox.appendChild(el);
    const t = { text, el, until: this.app.time + ms / 1000, leaving: false };
    this.toasts.push(t);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    while (this.toasts.filter((x) => !x.leaving).length > 3) this._dropToast(this.toasts.find((x) => !x.leaving));
  }
  _dropToast(t) {
    if (!t || t.leaving) return;
    t.leaving = true;
    t.el.classList.remove('show');
    setTimeout(() => { t.el.remove(); this.toasts = this.toasts.filter((x) => x !== t); }, 420);
  }

  _phaseCard(phase) {
    if (!phase || !this.app.started || this.startVisible) return;
    if (phase === this._lastPhaseCard) return;
    this._lastPhaseCard = phase;
    let title = PHASE_TITLES[phase] || safe(() => this.app.flight.phaseLabel?.(phase), phase) || phase;
    if (phase === 'cruise') {
      const ft = (this.app.flight.state?.altitude || 0) / FT;
      const fl = ft > 25000 ? Math.round(ft / 1000) * 10 : 360;
      title = `Cruise · FL${fl}`;
    }
    this.phaseSmall.textContent = `${AIRLINE.flightNumber} · Cedar Bay → Port Solano`;
    this.phaseBig.textContent = title;
    this.phase.classList.add('show');
    clearTimeout(this._phaseT);
    this._phaseT = setTimeout(() => this.phase.classList.remove('show'), 4200);
  }

  _viewMode(p) {
    const cine = p.mode === 'cinematic';
    this.letterbox.classList.toggle('show', cine);
    if (!cine) { this.cine.classList.remove('show'); return; }
    this.cineName.textContent = p.shot || 'Exterior view';
    this.cineSub.textContent = `Cinematic camera${p.index ? ` · ${p.index}/6` : ''}${p.auto ? ' · auto' : ''}`;
    this.cine.classList.add('show');
    clearTimeout(this._cineT);
    this._cineT = setTimeout(() => this.cine.classList.remove('show'), 5000);
  }

  // ===========================================================================
  // per-frame (cheap; DOM writes only on change / at low rate)
  // ===========================================================================
  update(dt) {
    const app = this.app;
    // FPS
    const f = this._fps;
    f.frames++; f.t += dt;
    if (f.t >= 0.5) {
      if (this.fps.classList.contains('show')) this.fps.textContent = `${Math.round(f.frames / f.t)} fps · ${(1000 * f.t / f.frames).toFixed(1)} ms`;
      f.frames = 0; f.t = 0;
    }
    // toasts
    for (const t of this.toasts) if (!t.leaving && app.time > t.until) this._dropToast(t);
    this._updateCaption();

    const menu = this.isMenuOpen;
    const mode = app.input?.mode;
    const fp = (app.view?.mode || 'first-person') !== 'cinematic';
    const playing = app.started && !menu;
    const ch = playing && fp && mode !== 'ife' && this.s.get('showCrosshair') !== false;
    if (ch !== this._ch) { this._ch = ch; this.crosshair.classList.toggle('show', ch); }
    const pr = !!this.hover && playing && fp && mode !== 'ife';
    if (pr !== this._pr) { this._pr = pr; this.prompt.style.visibility = pr ? 'visible' : 'hidden'; }
    // "click to look" when play mode lost pointer lock (e.g. the browser refused it)
    const lh = playing && fp && mode === 'play' && !app.input?.locked && !app.debug.shot;
    this._lhT = lh ? (this._lhT || 0) + dt : 0;
    const lhs = this._lhT > 0.8;
    if (lhs !== this._lhs) { this._lhs = lhs; this.lockHint.classList.toggle('show', lhs); }

    this._acc += dt;
    if (this._acc >= 0.25) {
      this._acc = 0;
      this._updateProgLine();
      if (this._isOpen('flight') || this._isOpen('pause')) this._updateFlight();
    }
  }

  _updateProgLine() {
    const app = this.app;
    const show = app.started && !this.startVisible && this.s.get('showProgress') !== false;
    this.progline.classList.toggle('show', show);
    if (!show) return;
    const st = app.flight?.state;
    if (!st) return;
    if (!this._ticksBuilt) {
      this._ticksBuilt = true;
      const tl = this._timeline();
      for (let i = 1; i < tl.length; i++) this.progTrack.appendChild(h('div.tick', { style: { left: `${tl[i].start * 100}%` } }));
    }
    const p = clamp(+st.missionProgress || 0, 0, 1);
    this.progFill.style.width = `${(p * 100).toFixed(2)}%`;
    const lbl = this._phaseLabel();
    const ttg = st.phase === 'arrived' ? '' : (st.phase === 'gate' ? ' · Boarding' : ` · ${fmtDuration(st.timeToGoSec)} to Port Solano`);
    const txt = `${lbl}${ttg}`;
    if (txt !== this._progTxt) { this._progTxt = txt; this.progLabel.innerHTML = ''; this.progLabel.append(h('b', lbl), ttg); }
  }

  _timeline() {
    const tl = safe(() => this.app.flight.timeline?.(), null);
    if (Array.isArray(tl) && tl.length) return tl;
    const tot = PHASES.reduce((s, p) => s + p.weight, 0);
    let acc = 0;
    return PHASES.map((p) => { const w = p.weight / tot; const r = { id: p.id, label: p.label, start: acc, end: acc + w }; acc += w; return r; });
  }
  _phaseLabel(id) {
    const st = this.app.flight?.state;
    const ph = id || st?.phase || 'gate';
    return safe(() => this.app.flight.phaseLabel?.(ph), null) || PHASES.find((p) => p.id === ph)?.label || ph;
  }

  // ===========================================================================
  // menus: stack management
  // ===========================================================================
  get isMenuOpen() { return this.startVisible || this.stack.length > 0; }

  openPanel(name) {
    if (this.app.debug.noui) return false;
    const p = this._panel(name);
    if (!p) return false;
    if (this.topPanel === name) return true;
    if (this.stack.includes(name)) { while (this.topPanel !== name) this._pop(); this._showTop(); return true; }
    const wasEmpty = this.stack.length === 0;
    if (wasEmpty && !this.startVisible) this._enterMenu();
    const top = this.topPanel;
    if (top) this.panels[top].el.classList.add('under');
    this.stack.push(name);
    if (this.startVisible) this.startEl?.setAttribute('aria-hidden', 'true');
    p.onOpen?.();
    p.el.classList.remove('under');
    p.el.classList.add('show');
    p.el.setAttribute('aria-hidden', 'false');
    this._syncScrim();
    this._syncPause();
    this._focusFirst(p.el);
    return true;
  }

  back() {
    if (!this.stack.length) return;
    this._pop();
    if (this.stack.length) this._showTop();
    else this._afterClose();
  }

  closeAll() {
    while (this.stack.length) this._pop();
    this._afterClose();
  }

  _pop() {
    const name = this.stack.pop();
    const p = this.panels[name];
    if (!p) return;
    p.el.classList.remove('show', 'under');
    p.el.setAttribute('aria-hidden', 'true');
    p.onClose?.();
  }
  _showTop() {
    const p = this.panels[this.topPanel];
    p.el.classList.remove('under');
    p.el.classList.add('show');
    p.onOpen?.();
    this._syncScrim();
    this._syncPause();
    this._focusFirst(p.el);
  }
  _afterClose() {
    this._syncScrim();
    this._syncPause();
    if (this.startVisible) { this.startEl?.removeAttribute('aria-hidden'); this._focusFirst(this.startEl); return; }
    this._exitMenu();
  }
  _syncScrim() {
    const any = this.stack.length > 0;
    this.scrim.classList.toggle('show', any);
    this.scrim.classList.toggle('light', any && this.stack[0] !== 'pause' && !this.startVisible);
  }
  _syncPause() {
    const paused = this.stack[0] === 'pause';
    if (!!this.app.paused !== paused) {
      this.app.paused = paused;
      this.app.events.emit('app:pause', { paused });
    }
  }
  _enterMenu() {
    const input = this.app.input;
    const m = input?.mode;
    this.prevMode = m === 'cinematic' ? 'cinematic' : 'play';
    if (m !== 'menu') safe(() => input.setMode('menu'));
    this._setPrompt(null);
  }
  _exitMenu() {
    if (!this.app.started) return;
    try { if (this.root.contains(document.activeElement)) document.activeElement.blur(); } catch { /* ignore */ }
    const want = this.prevMode === 'cinematic' && this.app.view?.mode === 'cinematic' ? 'cinematic' : 'play';
    safe(() => this.app.input.setMode(want));
  }
  _focusFirst(el) {
    if (!el) return;
    requestAnimationFrame(() => {
      const sel = 'button:not([disabled]), [tabindex="0"], input';
      const f = el.querySelector('[data-autofocus]') || el.querySelector(`.hn-panel-body ${sel.split(', ').join(', .hn-panel-body ')}`) || el.querySelector(sel);
      try { f?.focus({ preventScroll: true }); } catch { /* ignore */ }
    });
  }

  _panel(name) {
    if (this.panels[name]) return this.panels[name];
    const b = {
      pause: () => this._buildPause(), flight: () => this._buildFlight(), settings: () => this._buildSettings(),
      seatmap: () => this._buildSeatMapPanel(), help: () => this._buildHelp(), credits: () => this._buildCredits(),
      card: () => this._buildCard(),
    }[name];
    if (!b) return null;
    const p = b();
    p.el.setAttribute('aria-hidden', 'true');
    p.el.setAttribute('role', 'dialog');
    this.panelLayer.appendChild(p.el);
    this.panels[name] = p;
    // force style flush so the first open animates
    void p.el.offsetWidth;
    return p;
  }

  _shell(cls, kicker, title, { backable = true } = {}) {
    const closeBtn = h('button.hn-btn.ghost', { 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => this.back() }, svg(ICONS.close));
    const head = h('div.hn-panel-head', h('h2', h('small', kicker), title), closeBtn);
    const body = h('div.hn-panel-body');
    const el = h(`div.hn-panel.${cls}`, { 'aria-label': title }, head, body);
    void backable;
    return { el, head, body, closeBtn };
  }

  // ===========================================================================
  // start screen
  // ===========================================================================
  showStart() {
    if (this.app.debug.noui) return;
    if (!this.startEl) this._buildStart();
    this.startVisible = true;
    this.startEl.style.display = '';
    this.startEl.classList.remove('leaving');
    this._renderPassSeat();
    requestAnimationFrame(() => requestAnimationFrame(() => this.startEl.classList.add('show')));
    safe(() => { if (this.app.input.mode !== 'menu') this.app.input.setMode('menu'); });
    this._focusFirst(this.startEl);
  }
  hideStart() {
    if (!this.startEl || !this.startVisible) return;
    this.startVisible = false;
    this.startEl.classList.add('leaving');
    this.startEl.classList.remove('show');
    setTimeout(() => { if (!this.startVisible) this.startEl.style.display = 'none'; }, 950);
  }

  board() {
    const app = this.app;
    if (app.started && !this.startVisible) return;
    this.closeAll();
    this.hideStart();
    try { document.activeElement?.blur?.(); } catch { /* ignore */ }
    app.started = true;
    app.events.emit('app:start', {});
    safe(() => app.input.setMode('play'));
    const seat = this.seatChosen ? this.assignedSeat : null;
    if (seat) setTimeout(() => safe(() => app.player?.sit?.(seat)), 350);
    setTimeout(() => {
      this.toast(seat ? `Seat ${seat} · Space to stand up · F1 for controls` : `Welcome aboard. Your seat is ${this.assignedSeat} — or sit anywhere, the cabin is yours.`, 5200);
      if (!seat) setTimeout(() => this.toast('WASD to walk · Mouse to look · E or click to interact · F1 for controls', 5200), 1400);
    }, 900);
  }

  _buildStart() {
    const app = this.app;
    const date = new Date();
    const dd = `${String(date.getDate()).padStart(2, '0')} ${date.toLocaleString('en', { month: 'short' }).toUpperCase()}`;
    const field = (label, value, cls = '') => { const v = h('div.hn-num', value); return { el: h(`div.hn-field${cls ? '.' + cls : ''}`, h('label', label), v), v }; };
    const seatF = field('Seat', this.assignedSeat, 'big.accent');
    const seatChip = h('button.hn-chip-btn', { type: 'button', 'aria-label': 'Choose seat', onclick: () => this.openPanel('seatmap') }, 'Change');
    const seatRow = h('div.hn-seat-row'); seatF.el.replaceChild(seatRow, seatF.v); seatRow.append(seatF.v, seatChip);
    const classF = field('Class', 'Economy');
    const zoneF = field('Zone', '3');
    this._pass = { seat: seatF.v, cls: classF.v, zone: zoneF.v };
    const head = h('div.hn-pass-head', h('div.hn-logo', svg(LOGO), h('div.hn-logo-text', h('b', 'HALCYON'), h('span', 'AIRWAYS'))),
      h('div.hn-pass-type', h('b', 'Boarding pass'), 'Electronic ticket'));
    const route = h('div.hn-route',
      h('div', h('div.hn-iata', 'CBY'), h('div.hn-city', 'Cedar Bay')),
      h('div.hn-route-line', svg(ICONS.plane), h('div.hn-route-meta', `${AIRLINE.flightNumber}  ·  2 h 50 min  ·  1,480 km`)),
      h('div.hn-to', h('div.hn-iata', 'PSX'), h('div.hn-city', 'Port Solano')));
    const fields = h('div.hn-fields',
      field('Passenger', 'GUEST').el, field('Flight', AIRLINE.flightNumber).el, field('Date', dd).el, field('Aircraft', '737-800').el,
      field('Gate', 'B7', 'big').el, field('Boarding', '16:20', 'big').el, seatF.el, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, classF.el, zoneF.el));
    const foot = h('div.hn-pass-foot', h('div', 'Departs ', h('b', '16:50'), ' · Gate closes 15 minutes before departure'), h('div', 'SEQ 041 · ', h('b', 'N738HY')));
    const main = h('div.hn-pass-main', head, h('div.hn-pass-body', route, fields, foot));
    const stubSeat = h('div.hn-num', this.assignedSeat);
    this._pass.stubSeat = stubSeat;
    const sf = (l, v) => h('div.hn-field', h('label', l), v instanceof Node ? v : h('div.hn-num', v));
    const stub = h('div.hn-pass-stub',
      h('div.hn-pass-head', h('div.hn-logo', svg(LOGO), h('div.hn-logo-text', h('b', 'HN 482'), h('span', 'CBY → PSX')))),
      h('div.hn-stub-body', h('div.hn-stub-grid', sf('Passenger', 'GUEST'), sf('Date', dd), sf('From', 'CBY'), sf('To', 'PSX'), sf('Gate', 'B7'), sf('Seat', stubSeat), sf('Boarding', '16:20'), sf('Zone', '3'))),
      barcode(482160));
    const pass = h('div.hn-pass', { role: 'img', 'aria-label': `Boarding pass: Halcyon Airways flight HN 482, Cedar Bay to Port Solano, gate B7, boarding 16:20` }, main, stub);
    const boardBtn = h('button.hn-btn.primary', { type: 'button', 'data-autofocus': '', onclick: () => this.board() }, svg(ICONS.play), 'Board the aircraft');
    const actions = h('div.hn-start-actions', boardBtn,
      h('button.hn-btn', { type: 'button', onclick: () => this.openPanel('seatmap') }, svg(ICONS.seat), 'Choose seat'),
      h('button.hn-btn', { type: 'button', onclick: () => this.openPanel('settings') }, svg(ICONS.gear), 'Settings'),
      h('button.hn-btn', { type: 'button', onclick: () => this.openPanel('help') }, svg(ICONS.keyboard), 'Controls'));
    const q = app.qualityName || app.quality?.name || 'medium';
    const auto = this.s.get('quality') === 'auto';
    this._qualityNote = h('span');
    const notes = h('div.hn-start-notes',
      h('span', svg(ICONS.chip), this._qualityNote),
      h('span', svg(ICONS.headphones), 'Headphones recommended'),
      h('span', svg(ICONS.credits), h('button.hn-linkbtn', { type: 'button', onclick: () => this.openPanel('credits') }, 'Credits')));
    this._setQualityNote(q, auto);
    this.startEl = h('div.hn-start', h('div.hn-brandline', 'Halcyon Airways · Flight HN 482'), pass, actions, notes);
    this.root.insertBefore(this.startEl, this.scrim);
  }
  _setQualityNote(q, auto) {
    if (!this._qualityNote) return;
    const name = q.charAt(0).toUpperCase() + q.slice(1);
    this._qualityNote.textContent = auto ? `Graphics: ${name} (detected for your device) — adjustable in Settings` : `Graphics: ${name}`;
  }
  _renderPassSeat() {
    if (!this._pass) return;
    const s = SEAT_LIST.find((x) => x.id === this.assignedSeat);
    this._pass.seat.textContent = this.assignedSeat;
    this._pass.stubSeat.textContent = this.assignedSeat;
    this._pass.cls.textContent = s && s.cls === 'business' ? 'Business' : 'Economy';
    this._pass.zone.textContent = s ? (s.cls === 'business' ? '1' : s.row >= 20 ? '4' : '3') : '3';
  }

  // ===========================================================================
  // pause menu
  // ===========================================================================
  _buildPause() {
    const s = this._shell('hn-pause', 'Paused', 'Halcyon Airways · HN 482');
    const status = h('span');
    const item = (icon, label, fn, cls = '', key = null) => h(`button.hn-menu-item${cls ? '.' + cls : ''}`, { type: 'button', onclick: fn }, svg(ICONS[icon]), label, key ? h('span.k', h('span.hn-kbd', key)) : null);
    s.body.append(
      h('div.hn-pause-status', h('span.dot'), status),
      item('play', 'Resume', () => this.closeAll(), 'primary', 'Esc'),
      item('route', 'Flight progress & skips', () => this.openPanel('flight'), '', 'Tab'),
      item('seat', 'Seat map', () => this.openPanel('seatmap'), '', 'M'),
      item('gear', 'Settings', () => this.openPanel('settings')),
      item('keyboard', 'Controls & help', () => this.openPanel('help'), '', 'F1'),
      item('credits', 'Credits', () => this.openPanel('credits')),
      h('div.hn-menu-sep'),
      item('restart', 'Restart flight', () => { this.openPanel('flight'); requestAnimationFrame(() => requestAnimationFrame(() => this._askRestart?.())); }),
    );
    return { el: s.el, onOpen: () => { status.textContent = safe(() => this.app.flight.getStatusText?.(), null) || this._phaseLabel(); } };
  }

  // ===========================================================================
  // flight progress panel
  // ===========================================================================
  _buildFlight() {
    const s = this._shell('hn-flight', 'Flight progress', `${AIRLINE.flightNumber} · Cedar Bay to Port Solano`);
    const nowB = h('b'), nowS = h('span');
    const route = h('div.hn-flight-route',
      h('div', h('div.code', 'CBY'), h('div.city', 'Cedar Bay Intl')),
      h('div.now', nowB, nowS),
      h('div.to', h('div.code', 'PSX'), h('div.city', 'Port Solano Intl')));
    const bar = h('div.hn-tl-bar');
    const plane = svg(ICONS.plane); plane.setAttribute('class', 'hn-tl-plane');
    const tlEl = h('div.hn-timeline', bar, plane);
    const segs = [];
    const tl = this._timeline();
    for (const p of tl) {
      const f = h('div.f');
      const seg = h('div.hn-tl-seg', { title: p.label, style: { flex: `${Math.max(0.0001, p.end - p.start)} 1 0` } }, f);
      bar.appendChild(seg);
      const major = (p.end - p.start) >= 0.06 || p.id === 'takeoff';
      const lab = major ? h('div.hn-tl-label', { style: { left: `${((p.start + p.end) / 2) * 100}%` } }, shortLabel(p)) : null;
      if (lab) tlEl.appendChild(lab);
      segs.push({ p, seg, f, lab });
    }
    const stat = (label) => { const v = h('div'); return { el: h('div.hn-stat', h('label', label), v), v }; };
    const sAlt = stat('Altitude'), sGs = stat('Ground speed'), sTtg = stat('Time to go'), sDist = stat('Distance to go');
    const stats = h('div.hn-stats', sAlt.el, sGs.el, sTtg.el, sDist.el);
    const act = (icon, label, fn, cls = '') => h(`button.hn-btn${cls ? '.' + cls : ''}`, { type: 'button', onclick: fn }, svg(ICONS[icon]), label);
    const F = () => this.app.flight || {};
    const bDepart = act('depart', 'Begin departure now', () => this._flightAction(() => F().beginDeparture?.(), 'Departure requested — the crew is closing the doors'), 'teal');
    const bCruise = act('skip', 'Skip to cruise', () => this._flightAction(() => F().skipTo?.('cruise'), 'Skipping ahead to cruise…'));
    const bDescent = act('down', 'Begin descent now', () => this._flightAction(() => F().beginDescent?.(), 'The captain will begin our descent shortly'), 'teal');
    const bApproach = act('land', 'Skip to landing approach', () => this._flightAction(() => F().skipTo?.('approach'), 'Skipping ahead to the approach…'));
    const bRestart = act('restart', 'Restart flight', () => this._askRestart(), 'danger');
    const confirm = h('div.hn-confirm', h('span', 'Restart the flight from the gate at Cedar Bay?'),
      h('button.hn-btn.small.ghost', { type: 'button', onclick: () => confirm.classList.remove('show') }, 'Cancel'),
      h('button.hn-btn.small.danger', { type: 'button', onclick: () => { confirm.classList.remove('show'); this._flightAction(() => F().restart?.(), 'Restarting the flight…'); } }, 'Restart'));
    this._askRestart = () => { confirm.classList.add('show'); confirm.querySelector('.danger')?.focus(); };
    const hint = h('div.hn-note');
    s.body.append(route, tlEl, stats, h('div.hn-actions', bDepart, bCruise, bDescent, bApproach, bRestart), confirm, hint);
    this._flightUI = { nowB, nowS, plane, segs, sAlt, sGs, sTtg, sDist, bDepart, bCruise, bDescent, bApproach, hint, confirm };
    return { el: s.el, onOpen: () => this._updateFlight(), onClose: () => confirm.classList.remove('show') };
  }

  _flightAction(fn, msg) {
    const ok = safe(() => { fn(); return true; }, false);
    this.closeAll();
    if (ok && msg) this.toast(msg, 3200);
  }

  _updateFlight() {
    const u = this._flightUI;
    if (!u || !this._isOpen('flight')) return;
    const app = this.app, st = app.flight?.state || {};
    const metric = this.s.get('units') === 'metric';
    const p = clamp(+st.missionProgress || 0, 0, 1);
    const idx = Math.max(0, PHASE_IDS.indexOf(st.phase));
    for (const sgm of u.segs) {
      const k = clamp((p - sgm.p.start) / Math.max(1e-6, sgm.p.end - sgm.p.start), 0, 1);
      sgm.f.style.width = `${(k * 100).toFixed(1)}%`;
      const cur = sgm.p.id === st.phase;
      sgm.seg.classList.toggle('cur', cur);
      sgm.lab?.classList.toggle('cur', cur);
    }
    u.plane.style.left = `${(p * 100).toFixed(2)}%`;
    u.nowB.textContent = this._phaseLabel();
    u.nowS.textContent = safe(() => app.flight.getStatusText?.(), '') || '';
    const alt = +st.altitude || 0, gs = +st.groundSpeed || 0;
    u.sAlt.v.replaceChildren(metric ? fmtInt(Math.round(alt / 5) * 5) : fmtInt(Math.round(alt / FT / 10) * 10), h('small', metric ? 'm' : 'ft'));
    u.sGs.v.replaceChildren(metric ? fmtInt(gs * 3.6) : fmtInt(gs * 2.23694), h('small', metric ? 'km/h' : 'mph'));
    u.sTtg.v.replaceChildren(st.phase === 'arrived' ? 'Arrived' : fmtDuration(st.timeToGoSec));
    const dk = +st.distanceToGoKm || 0;
    u.sDist.v.replaceChildren(metric ? fmtInt(dk) : fmtInt(dk * 0.621371), h('small', metric ? 'km' : 'mi'));
    const ci = PHASE_IDS.indexOf('cruise'), ai = PHASE_IDS.indexOf('approach');
    const waiting = safe(() => app.flight.isWaitingForDeparture?.(), null);
    u.bDepart.disabled = !(st.phase === 'gate' && waiting !== false);
    u.bCruise.disabled = !(idx < ci);
    const canDesc = safe(() => app.flight.canBeginDescent?.(), null);
    u.bDescent.disabled = !(st.phase === 'cruise' && canDesc !== false);
    u.bApproach.disabled = !(idx < ai);
    const busy = !!app.flight?.skipping;
    if (busy) for (const b of [u.bDepart, u.bCruise, u.bDescent, u.bApproach]) b.disabled = true;
    const cm = +this.s.get('cruiseMinutes');
    u.hint.textContent = st.phase === 'cruise' && cm <= 0
      ? 'Cruise continues until you choose “Begin descent now”. Change this under Settings → Experience.'
      : 'Skipping fades out briefly and continues the flight from that point. Tab closes this panel.';
  }

  // ===========================================================================
  // settings
  // ===========================================================================
  _buildSettings() {
    const s = this._shell('hn-settings', 'Settings', 'Preferences');
    const tabs = h('div.hn-tabs', { role: 'tablist' });
    s.el.insertBefore(tabs, s.body);
    const ctl = {};
    const groups = [];
    for (const g of SETTINGS_GROUPS) {
      const tab = h('button.hn-tab', { type: 'button', role: 'tab', onclick: () => sel(g.id) }, g.label);
      tabs.appendChild(tab);
      const pane = h('div.hn-group', { role: 'tabpanel' });
      for (const it of g.items) {
        if (!(it.key in DEFAULT_SETTINGS)) continue;
        const row = h('div.hn-row', h('div.lbl', h('b', it.label), it.hint ? h('span', it.hint) : null));
        const c = h('div.ctl');
        row.appendChild(c);
        if (it.type === 'toggle') {
          const sw = h('button.hn-switch', { type: 'button', role: 'switch', 'aria-label': it.label, onclick: () => this.s.set(it.key, !this.s.get(it.key)) });
          c.appendChild(sw);
          ctl[it.key] = { it, set: (v) => sw.setAttribute('aria-checked', String(!!v)) };
        } else if (it.type === 'range') {
          const input = h('input', { type: 'range', min: it.min, max: it.max, step: it.step, 'aria-label': it.label });
          const out = h('output');
          input.addEventListener('input', () => { const v = +input.value; out.textContent = it.fmt(v); paint(); this.s.set(it.key, v); });
          const paint = () => input.style.setProperty('--p', `${((+input.value - it.min) / (it.max - it.min)) * 100}%`);
          c.appendChild(h('div.hn-range', input, out));
          ctl[it.key] = { it, set: (v) => { input.value = v; out.textContent = it.fmt(+v); paint(); } };
        } else {
          const seg = h('div.hn-seg', { role: 'radiogroup', 'aria-label': it.label });
          const btns = it.options.map(([val, lab]) => {
            const b = h('button', { type: 'button', role: 'radio', onclick: () => this.s.set(it.key, val) }, lab);
            seg.appendChild(b);
            return [val, b];
          });
          c.appendChild(seg);
          ctl[it.key] = { it, set: (v) => { for (const [val, b] of btns) b.setAttribute('aria-checked', String(val === v)); }, btns };
        }
        pane.appendChild(row);
      }
      if (g.id === 'experience') pane.appendChild(h('div.hn-note', 'Time of day, weather and pacing are picked up by the flight as it progresses; some take full effect after a restart.'));
      s.body.appendChild(pane);
      groups.push({ id: g.id, tab, pane });
    }
    this._qualityLabel = h('span.hn-muted');
    const reset = h('button.hn-btn.small', { type: 'button', onclick: () => { safe(() => this.s.reset()); this._syncSettings(); this.toast('Settings restored to defaults', 2200); } }, svg(ICONS.restart), 'Reset to defaults');
    const done = h('button.hn-btn.small.teal', { type: 'button', onclick: () => this.back() }, 'Done');
    s.el.appendChild(h('div.hn-panel-foot', this._qualityLabel, h('span.spacer'), reset, done));
    const sel = (id) => {
      this._settingsTab = id;
      for (const g of groups) { const on = g.id === id; g.tab.classList.toggle('on', on); g.tab.setAttribute('aria-selected', String(on)); g.pane.classList.toggle('on', on); }
    };
    sel('graphics');
    tabs.addEventListener('keydown', (e) => {
      if (e.code !== 'ArrowRight' && e.code !== 'ArrowLeft') return;
      const i = groups.findIndex((g) => g.id === this._settingsTab);
      const n = groups[(i + (e.code === 'ArrowRight' ? 1 : groups.length - 1)) % groups.length];
      sel(n.id); n.tab.focus();
    });
    this._settingsCtl = ctl;
    this._syncSettings();
    return { el: s.el, onOpen: () => this._syncSettings() };
  }
  _syncSettings() {
    if (!this._settingsCtl) return;
    for (const [k, c] of Object.entries(this._settingsCtl)) c.set(this.s.get(k));
    const q = this.app.qualityName || '';
    if (this._qualityLabel) this._qualityLabel.textContent = q ? `Active preset: ${q.charAt(0).toUpperCase() + q.slice(1)}` : '';
    this._setQualityNote(q || 'medium', this.s.get('quality') === 'auto');
  }

  // ===========================================================================
  // seat map
  // ===========================================================================
  _buildSeatMapPanel() {
    const s = this._shell('hn-seatmap', 'Seat map', 'Boeing 737-800 · 154 seats');
    const holder = h('div');
    const tip = h('div.tip', h('span', 'Select any seat — the cabin is all yours on this flight.'));
    const legend = h('div.legend',
      h('span', h('i', { style: { background: '#6b5a8a' } }), 'Business (rows 1–4)'),
      h('span', h('i', { style: { background: '#2c5b86' } }), 'Economy (rows 6–29)'),
      h('span', h('i', { style: { background: '#22808f' } }), 'Exit rows 16–17 · extra legroom'),
      h('span', h('i', { style: { background: '#e8b04b' } }), 'Your current seat'),
      h('span', h('i', { style: { background: 'transparent', boxShadow: 'inset 0 0 0 2px #f3f1ea' } }), 'Boarding pass seat'),
      h('span', { style: { opacity: 0.75 } }, 'No row 13'));
    const stand = h('button.hn-btn.small', { type: 'button', onclick: () => this._standInAisle() }, svg(ICONS.stand), 'Stand in the aisle');
    s.body.append(holder, h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', flexWrap: 'wrap' } }, tip, legend));
    s.el.appendChild(h('div.hn-panel-foot', h('span.hn-muted', 'Click a seat or use Tab and Enter. Esc to close.'), h('span.spacer'), stand));
    holder.addEventListener('click', (e) => { const g = e.target.closest?.('[data-seat]'); if (g) this._pickSeat(g.dataset.seat); });
    holder.addEventListener('keydown', (e) => { if (e.code !== 'Enter' && e.code !== 'Space') return; const g = e.target.closest?.('[data-seat]'); if (g) { e.preventDefault(); this._pickSeat(g.dataset.seat); } });
    const showTip = (e) => {
      const g = e.target.closest?.('[data-seat]');
      if (!g) return;
      const seat = SEAT_LIST.find((x) => x.id === g.dataset.seat);
      if (seat) tip.replaceChildren(h('b', seat.id), h('span', seatInfo(seat)));
    };
    holder.addEventListener('mouseover', showTip);
    holder.addEventListener('focusin', showTip);
    this._seatHolder = holder;
    this._seatStand = stand;
    return { el: s.el, onOpen: () => this._refreshSeatMap() };
  }
  _refreshSeatMap() {
    if (!this._seatHolder) return;
    const cur = this.app.player?.seat?.id || null;
    this._seatHolder.replaceChildren(buildSeatMap({ current: this.app.started ? cur : null, assigned: this.assignedSeat }));
    this._seatStand.textContent = '';
    this._seatStand.append(svg(ICONS.stand), this.startVisible ? 'Start standing at the door' : 'Stand in the aisle');
    this._seatStand.disabled = !this.startVisible && !cur;
  }
  _pickSeat(id) {
    if (this.startVisible) {
      this.assignedSeat = id;
      this.seatChosen = true;
      this._renderPassSeat();
      this.back();
      return;
    }
    this.closeAll();
    const ok = safe(() => this.app.player?.sit?.(id), false);
    if (ok === false && !this.app.player?.sit) this.toast('Seat selection is not available right now', 2500);
  }
  _standInAisle() {
    if (this.startVisible) { this.seatChosen = false; this.back(); return; }
    this.closeAll();
    safe(() => this.app.player?.stand?.());
  }

  // ===========================================================================
  // help
  // ===========================================================================
  _buildHelp() {
    const s = this._shell('hn-help', 'Controls', 'How to get around');
    const K = (...keys) => h('span.keys', keys.map((k) => (k === '/' ? h('span', 'or') : k === '–' ? h('span', '–') : h('span.hn-kbd', k))));
    const row = (label, keys) => h('div.hn-help-item', h('span', label), keys);
    s.body.append(h('div.hn-help-grid',
      h('h3', 'Moving around'),
      row('Walk', K('W', 'A', 'S', 'D', '/', '↑', '←', '↓', '→')),
      row('Look around', K('Mouse')),
      row('Crouch (look under seats)', K('C')),
      row('Stand up from a seat', K('Space', '/', 'X')),
      row('Lean to the window (seated)', K('Scroll')),
      h('h3', 'Interacting'),
      row('Use / open / sit down', K('E', '/', 'Click')),
      row('Leave the seatback screen', K('Esc', '/', 'Right click')),
      row('Seat map — sit anywhere', K('M')),
      row('Flight progress & skips', K('Tab')),
      h('h3', 'View & interface'),
      row('Cinematic exterior camera', K('V')),
      row('Choose camera shot (cinematic)', K('1', '–', '6')),
      row('Hide / show HUD', K('H')),
      row('Fullscreen', K('F')),
      row('Pause menu', K('Esc')),
      row('This help', K('F1', '/', '?')),
    ), h('div.hn-help-tip', 'Tip: the cabin is empty — pick any window seat, open the window shade and watch the wing during takeoff and landing. ' +
      'The seatback screen has movies, music and a live flight map. Headphones bring out the engines and the cabin ambience.'));
    return { el: s.el };
  }

  // ===========================================================================
  // credits
  // ===========================================================================
  _buildCredits() {
    const s = this._shell('hn-credits', 'Credits', 'Assets & licences');
    const md = h('div.hn-md');
    s.body.appendChild(md);
    const builtin = `# Software & media
- **Three.js** r187 — MIT License, © three.js authors — https://threejs.org
- **Inter** typeface by Rasmus Andersson — SIL Open Font License 1.1 — https://rsms.me/inter
- **Blender open movies** (Big Buck Bunny, Sintel, Caminandes) — © Blender Foundation, CC BY 3.0 / 4.0 — https://studio.blender.org/films
- Textures from **ambientCG** and **Poly Haven** — CC0 1.0
- Halcyon Airways, flight HN 482, Cedar Bay and Port Solano are fictional.`;
    let loaded = false;
    const load = async () => {
      if (loaded) return;
      loaded = true;
      md.innerHTML = `<section>${markdown(builtin)}</section><p class="hn-muted">Loading module credits…</p>`;
      const parts = await Promise.all(CREDIT_MODULES.map(async (m) => {
        try {
          const r = await fetch(`assets/credits/${m}.md`, { cache: 'no-cache' });
          if (!r.ok) return null;
          const t = await r.text();
          if (/^\s*</.test(t)) return null;
          return `<section>${markdown(t)}</section>`;
        } catch { return null; }
      }));
      md.innerHTML = `<section>${markdown(builtin)}</section>${parts.filter(Boolean).join('')}`;
    };
    return { el: s.el, onOpen: () => { load(); } };
  }

  // ===========================================================================
  // card viewer (safety card etc.)
  // ===========================================================================
  _buildCard() {
    const s = this._shell('hn-card', 'Seat pocket', 'Safety information');
    this._cardBody = s.body;
    this._cardTitle = s.head.querySelector('h2');
    return { el: s.el };
  }
  showCard(src, title = 'Safety information') {
    if (this.app.debug.noui) return false;
    const p = this._panel('card');
    if (!p) return false;
    let node = null;
    const img = src && (src.isTexture ? src.image : src);
    if (typeof img === 'string') node = h('img', { src: img, alt: title });
    else if (img && (img instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) || img instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap))) {
      const c = document.createElement('canvas');
      c.width = img.width || img.naturalWidth || 1024; c.height = img.height || img.naturalHeight || 1024;
      safe(() => c.getContext('2d').drawImage(img, 0, 0));
      node = c;
    }
    if (!node) return false;
    this._cardBody.replaceChildren(node);
    this._cardTitle.replaceChildren(h('small', 'Seat pocket'), title);
    if (this.topPanel === 'card') return true;
    return this.openPanel('card');
  }

  api() {
    const self = this;
    return {
      toast: (t, ms) => self.toast(t, ms),
      showCard: (src, title) => self.showCard(src, title),
      openPanel: (name) => self.openPanel(name),
      closeAll: () => self.closeAll(),
      back: () => self.back(),
      get isMenuOpen() { return self.isMenuOpen; },
      get openPanels() { return [...self.stack]; },
      showStart: () => self.showStart(),
      hideStart: () => self.hideStart(),
      board: () => self.board(),
      setVisible: (on) => { self.tempHidden = !on; self._applyVisibility(); },
      get assignedSeat() { return self.assignedSeat; },
      _hud: self,
    };
  }
}

// ---------------------------------------------------------------------------
function shortLabel(p) {
  return { taxi_out: 'Taxi', taxi_in: 'Taxi in', gate: 'Gate', arrived: 'Gate' }[p.id] || p.label;
}
function fmtInt(v) { return Math.round(v).toLocaleString('en-US'); }
function fmtDuration(sec) {
  sec = Math.max(0, +sec || 0);
  const m = Math.round(sec / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
/** PDF417-like 2D barcode (decorative), deterministic. */
function barcode(seed) {
  let x = seed >>> 0;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1000) / 1000; };
  const W = 200, rows = 9, rh = 6;
  let rects = '';
  for (let r = 0; r < rows; r++) {
    let px = 0;
    // start / stop patterns
    rects += `<rect x="0" y="${r * rh}" width="6" height="${rh}"/><rect x="8" y="${r * rh}" width="2" height="${rh}"/><rect x="${W - 10}" y="${r * rh}" width="2" height="${rh}"/><rect x="${W - 6}" y="${r * rh}" width="6" height="${rh}"/>`;
    px = 14;
    while (px < W - 16) {
      const w = 1 + Math.floor(rnd() * 4);
      if (rnd() > 0.45) rects += `<rect x="${px}" y="${r * rh}" width="${w}" height="${rh}"/>`;
      px += w + (rnd() > 0.5 ? 1 : 0);
    }
  }
  return svg(`<svg class="hn-barcode" viewBox="0 0 ${W} ${rows * rh}" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`);
}

// =============================================================================
export async function init(app) {
  if (app.debug.noui) {
    const noop = () => false;
    return { toast: noop, showCard: noop, openPanel: noop, closeAll: noop, isMenuOpen: false, noui: true };
  }
  injectCss();
  const hud = new Hud(app);
  if (!app.debug.autostart) {
    // show the boarding pass once everything is loaded
    app.events.on('app:ready', () => { if (!app.started) hud.showStart(); });
    if (app.ready && !app.started) hud.showStart();
  }
  return hud.api();
}
