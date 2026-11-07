// =============================================================================
// IFE MODULE — Halcyon "Skyline" seatback in-flight entertainment system.
//
// Entry: init(app) -> API (docs/ARCHITECTURE.md §6)
//   { open(seatId), close(), setPower(seatId, on), isOpen, activeSeat,
//     goto(pageId, params), playVideo(itemOrId), music, video, ui }
//
// * every seat's screenAnchor gets an LCD (instanced; idle screens share one
//   small attract-mode canvas updated ~1 fps; per-instance power);
// * the player's current seat gets the unique high-res touchscreen
//   (1280 px wide canvas, redrawn only while visible / changing, <= 30 fps);
// * using the screen focuses the camera on it (app.player.focusOn) and the mouse
//   drives the UI by raycasting onto the panel (uv -> canvas pixels);
// * PA announcements pause media with an overlay; the safety demonstration
//   takes over every powered screen with a synchronised safety briefing.
// Files: screens.js (3D), attract.js, ui/ (kit, icons, system), pages/, media/, map/.
// =============================================================================
import * as THREE from 'three';
import { createScreens } from './screens.js';
import { drawAttract } from './attract.js';
import { UISystem } from './ui/system.js';
import { C, text, fillRR, clamp01, ease, fmtClock, fmtHM, compass, withShadow } from './ui/kit.js';
import { icon } from './ui/icons.js';
import { MapView } from './map/mapview.js';
import { Catalog } from './media/catalog.js';
import { VideoService } from './media/video.js';
import { MusicEngine, albumArt } from './media/music.js';
import { homePage } from './pages/home.js';
import { moviesPage, tvPage, detailPage, seriesPage } from './pages/content.js';
import { playerPage } from './pages/player.js';
import { musicPage } from './pages/music.js';
import { mapPage, infoPage } from './pages/map.js';
import { gamesPage, settingsPage, splashPage } from './pages/misc.js';
import { drawSafety, slideFor } from './pages/safety.js';

const SHARED_W = 640, SHARED_H = 400;           // attract canvas (16:10)
const UI_W = 1280;
const FOCUS = { distance: 0.4, fovDeg: 34 };
const PHASE_LABEL = {
  gate: 'At the gate', pushback: 'Pushing back', taxi_out: 'Taxiing', lineup: 'Lining up', takeoff: 'Taking off',
  climb: 'Climbing', cruise: 'Cruising', descent: 'Descending', approach: 'On approach', landing: 'Landing',
  taxi_in: 'Taxiing to the gate', arrived: 'Arrived',
};

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _wp = new THREE.Vector3();
const _hits = [];

export async function init(app) {
  if (app.debug?.module === 'noife') return { open() { return false; }, close() {}, setPower() { return false; }, isOpen: false, activeSeat: null, disabled: true };
  const ife = new IFE(app);
  try { ife.build(); } catch (e) { console.error('[ife] build failed', e); }
  return ife.api;
}

class IFE {
  constructor(app) {
    this.app = app;
    this.seatId = null;
    this.focused = false;
    this.brightness = 0.85;
    this.readingLight = false;
    this.callOn = false;
    this.safety = { active: false, slide: 0, slideT0: 0, sentence: '', sentences: [], t0: 0 };
    this.paOverlay = { active: false, speaker: '', t0: 0 };
    this.available = false;     // full system after 'seatbelt_off'
    this._dataFrame = -1;
    this._data = null;
    this._sharedNext = 0;
    this._lastUpload = 0;
    this._glowNext = 0;
    this._glowCol = new THREE.Color(0.6, 0.7, 0.9);
    this._interact = [];
  }

  // =========================================================================================== build
  build() {
    const app = this.app;
    this.catalog = new Catalog(app);
    this.map = new MapView(app);
    this.video = new VideoService(app);
    this.music = new MusicEngine(app);
    this.music.onChange = () => { if (this.ui) this.ui.dirty = true; };
    this.video.onChange((kind) => {
      if (this.ui) this.ui.dirty = true;
      if (kind === 'ended' && this.ui?.current?.id === 'player') this.ui.pop();
    });

    // shared attract canvas
    this.sharedCanvas = document.createElement('canvas');
    this.sharedCanvas.width = SHARED_W; this.sharedCanvas.height = SHARED_H;
    this.sharedCtx = this.sharedCanvas.getContext('2d');
    this.sharedTex = new THREE.CanvasTexture(this.sharedCanvas);
    this.sharedTex.colorSpace = THREE.SRGBColorSpace;
    this.sharedTex.anisotropy = 4;

    // active (player) canvas
    this._makeActiveCanvas(UI_W, 800);
    const seats = app.seats?.list || [];
    this.screens = createScreens(app, seats, { sharedTexture: this.sharedTex, sharedAspect: SHARED_W / SHARED_H });
    for (const s of seats) if (s?.screenAnchor) this.screens.setPower(s.id, true);

    // UI
    this.ui = new UISystem(this.ctx, this.canvas.width, this.canvas.height, this);
    for (const p of [homePage(), moviesPage(), tvPage(), detailPage(), seriesPage(), playerPage(), musicPage(), mapPage(), infoPage(), gamesPage(), settingsPage(), splashPage()]) this.ui.register(p);
    this.ui.reset('splash');

    // active-screen bezel power button (a real mesh so it can be raycast cheaply)
    this.activeButton = new THREE.Mesh(this.screens.buttons.geometry, this.screens.buttons.material);
    this.activeButton.name = 'ife-active-power-button';
    this.activeButton.matrixAutoUpdate = false;

    this._bindEvents();
    this._buildApi();
    app.addUpdate((dt, t) => this.update(dt, t), 70, 'ife');
    this.volume = app.settings.get('ifeVolume') ?? 0.8;
    this._drawShared(0);
  }

  _makeActiveCanvas(w, h) {
    if (this.canvas && this.canvas.width === w && this.canvas.height === h) return;
    this.canvas = this.canvas || document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    if (this.tex) this.tex.dispose();
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = Math.min(8, this.app.assets?.maxAnisotropy || 8);
    if (this.ui) { this.ui.ctx = this.ctx; this.ui.resize(w, h); }
  }

  // =========================================================================================== seat
  setActiveSeat(seatId) {
    if (!seatId || seatId === this.seatId) return;
    const seat = this.app.seats?.byId?.(seatId) || this.app.seats?.list?.find((s) => s.id === seatId);
    if (!seat || !seat.screenAnchor) return;
    const aspect = seat.screenSize.w / seat.screenSize.h;
    this._makeActiveCanvas(UI_W, Math.round(UI_W / aspect));
    const prev = this.seatId;
    this.seatId = seatId;
    const mesh = this.screens.setActive(seatId, this.tex, aspect);
    if (!mesh) return;
    // power button proxy
    const e = this.screens.bySeat.get(seatId);
    this.activeButton.matrix.copy(e.btnLocal);
    this.activeButton.matrixWorldNeedsUpdate = true;
    seat.screenAnchor.add(this.activeButton);
    this.screenOn = this.screens.isOn(seatId);
    this._powerLevel = this.screenOn ? 1 : 0;
    // interactions
    for (const h of this._interact) h.remove();
    this._interact = [];
    const I = this.app.interactions;
    if (I) {
      this._interact.push(I.add({
        object: mesh, label: () => (this.screenOn ? 'Use entertainment screen' : 'Turn on entertainment screen'),
        onInteract: () => this.open(this.seatId), enabled: () => this._seatedHere() && !this.focused, maxDistance: 1.5, priority: 2,
      }));
      this._interact.push(I.add({
        object: this.activeButton, label: () => (this.screenOn ? 'Turn screen off' : 'Turn screen on'),
        onInteract: () => this.setPower(this.seatId, !this.screenOn), enabled: () => this._seatedHere(), maxDistance: 1.5, priority: 3,
      }));
    }
    // seat-specific state
    this.readingLight = false;
    this.callOn = false;
    if (!prev || this.ui.current?.id === 'splash') this.ui.reset('splash');
    this.ui.dirty = true;
  }

  _seatedHere() {
    const p = this.app.player;
    if (!p) return true;
    return p.seat === this.seatId;
  }

  // =========================================================================================== focus
  open(seatId = this.seatId) {
    if (seatId && seatId !== this.seatId) this.setActiveSeat(seatId);
    if (!this.seatId) return false;
    if (!this.screenOn) this.setPower(this.seatId, true);
    if (this.ui.current?.id === 'splash') this.ui.reset('home');
    const p = this.app.player;
    let ok = false;
    if (p?.focusOn) { try { ok = p.focusOn(this.screens.active, { distance: FOCUS.distance, fovDeg: FOCUS.fovDeg, duration: 0.7 }) !== false; } catch (e) { console.warn('[ife] focusOn', e); } }
    if (!ok) { try { this.app.input.setMode('ife'); } catch { /* */ } }
    if (this.app.input.mode !== 'ife') { try { this.app.input.setMode('ife'); } catch { /* */ } }
    this.focused = true;
    this.ui.dirty = true;
    this.app.events.emit('ife:focus', { seatId: this.seatId, on: true });
    this.app.audio?.setHeadphones?.(true);
    return true;
  }

  close() {
    if (!this.focused) return;
    this.focused = false;
    this.ui.popover = null;
    this.ui.pointerMove(-1, -1, false);
    const p = this.app.player;
    if (p?.releaseFocus) { try { p.releaseFocus(); } catch (e) { console.warn(e); } }
    if (this.app.input.mode === 'ife') { try { this.app.input.setMode('play'); } catch { /* */ } }
    this._focusOff();
  }

  _focusOff() {
    this.focused = false;
    this.app.events.emit('ife:focus', { seatId: this.seatId, on: false });
    // keep the headphones on while something is playing
    if (this.video.wantPlay || this.music.wantPlay) this.app.audio?.setHeadphones?.(true);
    this.ui.dirty = true;
  }

  setPower(seatId, on) {
    if (!seatId) return false;
    const ok = this.screens.setPower(seatId, on);
    if (seatId === this.seatId) {
      this.screenOn = !!on;
      this.video.hold('power', !on);
      if (on) this.ui.dirty = true;
      this.app.audio?.play?.('button_press', { volume: 0.25, position: this.screens.active.getWorldPosition(_wp) });
    }
    return ok;
  }

  // =========================================================================================== services for pages
  data() {
    if (this._dataFrame === this.app.frame && this._data) return this._data;
    const st = this.app.flight?.state || {};
    const units = this.app.settings.get('units') || 'imperial';
    const imp = units !== 'metric';
    const gs = st.groundSpeed || 0, alt = st.altitude || 0;
    const fmtN = (v) => Math.round(v).toLocaleString('en-US');
    const toGoKm = st.distanceToGoKm ?? 1480, flownKm = st.distanceFlownKm ?? 0;
    const dist = (km) => (imp ? `${fmtN(km / 1.609344)} mi` : `${fmtN(km)} km`);
    const hdg = ((st.heading ?? 0) % 360 + 360) % 360;
    const lt0 = st.localTimeOrigin ?? 16.5, lt1 = st.localTimeDestination ?? 16.5;
    const ttg = st.timeToGoSec ?? 10800;
    this._data = {
      units,
      groundSpeed: imp ? `${fmtN(gs * 2.236936)} mph` : `${fmtN(gs * 3.6)} km/h`,
      altitude: imp ? `${fmtN(Math.round(alt / 0.3048 / 10) * 10)} ft` : `${fmtN(Math.round(alt / 5) * 5)} m`,
      outsideTemp: imp ? `${Math.round((st.outsideTempC ?? 15) * 9 / 5 + 32)} °F` : `${Math.round(st.outsideTempC ?? 15)} °C`,
      heading: `${compass(hdg)} ${String(Math.round(hdg) % 360).padStart(3, '0')}°`,
      distance: dist(toGoKm), flown: dist(flownKm),
      timeToGo: fmtHM(ttg),
      timeOrigin: fmtClock(lt0, imp), timeDest: fmtClock(lt1, imp),
      eta: fmtClock(lt1 + ttg / 3600, imp),
      progress: clamp01(st.routeProgress ?? 0),
      phaseLabel: PHASE_LABEL[st.phase] || 'Boarding',
      originCode: st.origin?.code || 'CBY', destCode: st.destination?.code || 'PSX',
      originCity: st.origin?.city || 'Cedar Bay', destCity: st.destination?.city || 'Port Solano',
      originName: st.origin?.name || 'Cedar Bay International', destName: st.destination?.name || 'Port Solano International',
      aircraft: 'Boeing 737-800',
    };
    this._dataFrame = this.app.frame;
    return this._data;
  }

  musicArt(i, size) { return albumArt(i, size); }

  setVolume(v) {
    this.volume = clamp01(v);
    try { this.app.settings.set('ifeVolume', Math.round(this.volume * 100) / 100); } catch { /* */ }
    this._applyVolume();
  }
  _applyVolume() {
    const routed = !!this.video._connected;
    this.video.setVolume(routed ? 1 : this.volume * (this.app.settings.get('masterVolume') ?? 1));
    this.music.setOwnVolume(this.volume);
  }
  setBrightness(v) { this.brightness = clamp01(v); this.ui.dirty = true; }

  toggleReadingLight() {
    const want = !this.readingLight;
    const c = this.app.cabin;
    if (c?.setReadingLight) { try { c.setReadingLight(this.seatId, want); } catch (e) { console.warn(e); } }
    this.readingLight = want;
  }
  toggleCall() {
    const c = this.app.cabin;
    let r;
    if (c?.toggleCall) { try { r = c.toggleCall(this.seatId); } catch (e) { console.warn(e); } }
    this.callOn = typeof r === 'boolean' ? r : !this.callOn;
    this.ui.toast(this.callOn ? 'A crew member has been called' : 'Attendant call cancelled');
  }

  playVideo(itemOrId, { fromStart = false } = {}) {
    const it = typeof itemOrId === 'string' ? this.catalog.byId(itemOrId) : itemOrId;
    if (!it || !it.src) return false;
    this.music.pause();
    this.video.load(it, { autoplay: true, fromStart });
    this._applyVolume();
    if (this.ui.current?.id !== 'player') this.ui.push('player', { id: it.id });
    return true;
  }

  click() { this.app.audio?.play?.('button_press', { volume: 0.06, rate: 1.6, position: this.screens.active.getWorldPosition(_wp) }); }
  onActivity() { /* reserved: screen saver / dimming timers */ }

  /** Modal overlays drawn on top of every page (PA announcement, safety briefing). */
  drawOverlays(ui, ctx) {
    const W = ui.W, H = ui.H;
    if (this.safety.active) {
      drawSafety(ctx, 0, 0, W, H, ui.now, this.safety);
      ui.block();
      return;
    }
    if (this.paOverlay.active) {
      const a = ease.outCubic(clamp01((ui.now - this.paOverlay.t0) / 0.35));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(2,8,16,0.78)';
      ctx.fillRect(0, 0, W, H);
      const cw = 620, ch = 250, cx = (W - cw) / 2, cy = (H - ch) / 2;
      withShadow(ctx, 40, 'rgba(0,0,0,0.6)', () => fillRR(ctx, cx, cy, cw, ch, 22, 'rgba(14,36,60,0.98)'));
      const pulse = 0.5 + 0.5 * Math.sin(ui.now * 4);
      ctx.beginPath(); ctx.arc(cx + 80, cy + 92, 40 + pulse * 8, 0, 7); ctx.fillStyle = `rgba(232,176,75,${0.18 + 0.12 * pulse})`; ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 80, cy + 92, 36, 0, 7); ctx.fillStyle = C.gold; ctx.fill();
      icon(ctx, 'volume', cx + 60, cy + 72, 40, '#1a1407');
      text(ctx, 'Announcement in progress', cx + 140, cy + 88, { size: 30, weight: 800 });
      text(ctx, this.paOverlay.speaker || 'Cabin crew', cx + 140, cy + 122, { size: 19, color: C.gold, weight: 600 });
      text(ctx, 'Playback is paused and will resume', cx + 50, cy + 184, { size: 20, color: C.muted });
      text(ctx, 'automatically after the announcement.', cx + 50, cy + 212, { size: 20, color: C.muted });
      ctx.restore();
      ui.block();
    }
  }

  // =========================================================================================== events
  _bindEvents() {
    const ev = this.app.events;
    ev.on('app:ready', () => {
      const s = this.app.player?.seat;
      if (s) this.setActiveSeat(s);
      this.catalog.ready.then(() => { if (this.ui) this.ui.dirty = true; this._sharedNext = 0; });
      this.map.ready.then(() => { if (this.ui) this.ui.dirty = true; this._sharedNext = 0; });
    });
    ev.on('player:sit', ({ seatId }) => this.setActiveSeat(seatId));
    ev.on('player:focus', ({ on }) => { if (!on && this.focused) this._focusOff(); });
    ev.on('input:mode', ({ mode }) => { if (mode === 'play' && this.focused) { this.focused = false; this._focusOff(); } });
    ev.on('input:mousedown', ({ button, ndcX, ndcY }) => {
      if (!this.focused || this.app.input.mode !== 'ife') return;
      if (button !== 0) return;
      const uv = this._pickUV(ndcX, ndcY);
      if (!uv) return;
      if (!this.screenOn) { this.setPower(this.seatId, true); return; }
      this.ui.pointerDown(uv.x * this.ui.W, (1 - uv.y) * this.ui.H);
    });
    ev.on('input:mouseup', ({ button }) => {
      if (!this.focused || button !== 0) return;
      const p = this.ui.pointer;
      this.ui.pointerUp(p.x, p.y);
    });
    ev.on('input:wheel', ({ delta }) => { if (this.focused && this.app.input.mode === 'ife') this.ui.wheel(delta); });
    ev.on('settings:changed', ({ key, value }) => {
      if (key === 'ifeVolume') { this.volume = value; this._applyVolume(); }
      if (key === 'units') this.ui.dirty = true;
    });
    ev.on('cabin:readingLight', ({ seatId, on }) => { if (seatId === this.seatId) { this.readingLight = !!on; this.ui.dirty = true; } });
    ev.on('cabin:call', ({ row, side, on }) => {
      const s = this.app.seats?.byId?.(this.seatId);
      if (s && s.row === row && (!side || s.side === side)) { this.callOn = !!on; this.ui.dirty = true; }
    });
    ev.on('cabin:announcement', (p) => this._onAnnouncement(p));
    ev.on('cabin:announcementEnd', (p) => this._onAnnouncementEnd(p));
    ev.on('flight:restart', () => { this.safety.active = false; this.paOverlay.active = false; this.video.hold('pa', false); this.music.hold('pa', false); });
  }

  _onAnnouncement(p) {
    if (!p) return;
    this.video.hold('pa', true);
    this.music.hold('pa', true);
    if (p.id === 'safety_demo') {
      const s = this.safety;
      s.active = true;
      s.t0 = this.app.time;
      s.sentences = Array.isArray(p.sentences) && p.sentences.length ? p.sentences : [{ t: 0, text: p.text || '' }];
      s.slide = 0; s.slideT0 = this.app.time; s.sentence = '';
      s.duration = p.duration || 60;
      this._sharedNext = 0;
    } else {
      this.paOverlay.active = true;
      this.paOverlay.t0 = this.app.time;
      this.paOverlay.id = p.id;
      this.paOverlay.speaker = p.speakerName || (p.speaker === 'captain' ? 'Captain Daniel Reyes' : 'Cabin manager');
    }
    if (p.id === 'seatbelt_off') this.available = true;
    this.ui.dirty = true;
  }

  _onAnnouncementEnd(p) {
    if (this.safety.active && (!p || p.id === 'safety_demo')) { this.safety.active = false; this._sharedNext = 0; }
    if (!p || this.paOverlay.id === p.id || !this.paOverlay.active) this.paOverlay.active = false;
    if (!this.safety.active && !this.paOverlay.active) { this.video.hold('pa', false); this.music.hold('pa', false); }
    if (p?.id === 'seatbelt_off') this.ui.toast('Entertainment is now available — enjoy your flight', 4000);
    this.ui.dirty = true;
  }

  _pickUV(ndcX, ndcY) {
    const m = this.screens.active;
    if (!m.visible || !m.parent) return null;
    _ndc.set(ndcX, ndcY);
    _ray.setFromCamera(_ndc, this.app.camera);
    _hits.length = 0;
    m.raycast(_ray, _hits);
    const h = _hits[0];
    if (!h || !h.uv) return null;
    return h.uv;
  }

  // =========================================================================================== per frame
  update(dt, t) {
    const app = this.app;
    const now = app.time;
    this.screens.update(dt);
    this.music.update();

    // safety slideshow sync
    if (this.safety.active) {
      const s = this.safety;
      const el = now - s.t0;
      let cur = null;
      for (const se of s.sentences) if (se.t <= el + 0.05) cur = se;
      const text0 = cur?.text || '';
      if (text0 !== s.sentence) {
        s.sentence = text0;
        const ns = slideFor(text0, s.slide);
        if (ns !== s.slide) { s.slide = ns; s.slideT0 = now; }
        this._sharedNext = 0;
        this.ui.dirty = true;
      }
      if (el > (s.duration || 60) + 8) { s.active = false; this._onAnnouncementEnd({ id: 'safety_demo' }); }
    }

    // shared attract canvas (~1 fps, 4 fps during safety)
    if (now >= this._sharedNext) {
      this._drawShared(now);
      this._sharedNext = now + (this.safety.active ? 0.25 : 1.0);
    }

    // pointer from the mouse while focused
    if (this.focused && app.input.mode === 'ife') {
      const uv = this._pickUV(app.input.mouse.ndcX, app.input.mouse.ndcY);
      if (uv) this.ui.pointerMove(uv.x * this.ui.W, (1 - uv.y) * this.ui.H, true);
      else if (!this.ui.pointer.down) this.ui.pointerMove(this.ui.pointer.x, this.ui.pointer.y, false);
    }

    // active screen
    const m = this.screens.active;
    if (!this.seatId || !m.parent) return;
    const target = this.screenOn ? 1 : 0;
    this._powerLevel = this._powerLevel ?? target;
    this._powerLevel += Math.sign(target - this._powerLevel) * Math.min(Math.abs(target - this._powerLevel), dt * (target ? 2.2 : 6));
    const mat = this.screens.activeMat;
    mat.emissiveIntensity = 0.9 * (0.2 + 0.8 * this.brightness) * this._powerLevel;
    // only redraw while visible / focused (and something changed)
    let visible = this.focused;
    if (!visible) {
      m.getWorldPosition(_wp);
      const cam = app.camera;
      if (_wp.distanceToSquared(cam.position) < 25) {
        _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_pm);
        visible = _frustum.containsPoint(_wp);
      }
    }
    if (this.screenOn && visible && this.ui.needsRedraw(now) && now - this._lastUpload >= 1 / 30 - 0.002) {
      this.ui.draw(now);
      this.tex.needsUpdate = true;
      this._lastUpload = now;
    }
    // screen glow light follows the average screen colour
    const glow = this.screens.glow;
    if (glow) {
      if (now >= this._glowNext && this.screenOn) { this._sampleGlow(); this._glowNext = now + 0.3; }
      const tgt = this._powerLevel * (0.2 + 0.8 * this.brightness) * 0.05;
      glow.intensity += (tgt - glow.intensity) * Math.min(1, dt * 4);
      glow.color.lerp(this._glowCol, Math.min(1, dt * 3));
    }
  }

  _sampleGlow() {
    if (!this._sample) { this._sample = document.createElement('canvas'); this._sample.width = this._sample.height = 2; this._sampleCtx = this._sample.getContext('2d', { willReadFrequently: true }); }
    try {
      this._sampleCtx.drawImage(this.canvas, 0, 0, 2, 2);
      const d = this._sampleCtx.getImageData(0, 0, 2, 2).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 16; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const k = 1 / (4 * 255);
      this._glowCol.setRGB(r * k, g * k, b * k, THREE.SRGBColorSpace);
      const l = Math.max(0.05, this._glowCol.r * 0.3 + this._glowCol.g * 0.6 + this._glowCol.b * 0.1);
      this._glowCol.multiplyScalar(Math.min(3, 0.5 / l) * l * 2);
    } catch { /* */ }
  }

  _drawShared(now) {
    try {
      drawAttract(this.sharedCtx, SHARED_W, SHARED_H, now, this);
      this.sharedTex.needsUpdate = true;
    } catch (e) {
      if (!this._sharedWarned) { console.warn('[ife] attract draw failed', e); this._sharedWarned = true; }
    }
  }

  // =========================================================================================== API
  _buildApi() {
    const self = this;
    this.api = {
      open: (seatId) => self.open(seatId),
      close: () => self.close(),
      setPower: (seatId, on) => self.setPower(seatId, on),
      get isOpen() { return self.focused; },
      get activeSeat() { return self.seatId; },
      get screenOn() { return self.screenOn; },
      goto: (page, params) => { if (page === 'home') self.ui.home({ instant: true }); else self.ui.push(page, params || {}, { instant: true }); self.ui.dirty = true; },
      playVideo: (it, o) => self.playVideo(it, o),
      setActiveSeat: (id) => self.setActiveSeat(id),
      get video() { return self.video; },
      get music() { return self.music; },
      get ui() { return self.ui; },
      get catalog() { return self.catalog; },
      get map() { return self.map; },
      _internal: self,
    };
  }
}
