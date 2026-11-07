// =============================================================================
// IFE UI system: an immediate-mode touch UI drawn on a Canvas 2D surface.
//
//   * pages are objects { id, draw(ui, ctx, x, y, w, h), fps?(ui), onEnter?(params), onLeave?(),
//     onWheel?(delta), title? }; ui.push(id, params) / ui.pop() / ui.home() navigate with an eased
//     slide + fade transition.
//   * ui.hit(id, x, y, w, h, opts) registers a touch target while drawing and returns
//     { hover, pressed } (opts: onClick, onDrag(px, py, phase), onScroll(dx, dy), ripple, radius).
//   * pointer events come in canvas pixels (pointerDown / Move / Up / wheel) from the screen raycast.
//   * draw() renders the frame; needsRedraw(now) tells the owner when a new frame is worth drawing
//     (transitions, ripples, playing media, live map...).
// =============================================================================
import { C, font, rr, fillRR, text, backdrop, ease, clamp01, clamp, fmtClock, logoMark, bar, withShadow } from './kit.js';
import { icon } from './icons.js';

export const TOP_H = 66;
const TRANS_T = 0.34;

export class UISystem {
  constructor(ctx, W, H, host) {
    this.ctx = ctx;
    this.W = W; this.H = H;
    this.host = host;               // IFE root (services, app, seat...)
    this.pages = new Map();
    this.stack = [];
    this.trans = null;
    this.regions = [];
    this._rec = [];
    this.recording = true;
    this.pointer = { x: -1, y: -1, inside: false, down: false, downX: 0, downY: 0, region: null, moved: 0, scrolling: false, lastMove: 0 };
    this.ripples = [];
    this.popover = null;             // { kind: 'volume'|'brightness', t0 }
    this.toastMsg = null;
    this.now = 0;
    this.dirty = true;
    this.lastDraw = -1;
    this.contentY = TOP_H;
    this.hideTopBar = false;
  }

  resize(W, H) { this.W = W; this.H = H; this.dirty = true; }
  register(page) { this.pages.set(page.id, page); page.ui = this; return page; }
  get current() { return this.stack[this.stack.length - 1] || null; }
  get page() { return this.current ? this.pages.get(this.current.id) : null; }

  // ---------------------------------------------------------------------------------- navigation
  push(id, params = {}, { replace = false, dir = 1, instant = false } = {}) {
    const page = this.pages.get(id);
    if (!page) return;
    const from = this.current;
    if (from && !replace) { const fp = this.pages.get(from.id); try { fp?.onLeave?.(false); } catch (e) { console.warn(e); } }
    if (replace && from) { const fp = this.pages.get(from.id); try { fp?.onLeave?.(true); } catch (e) { console.warn(e); } this.stack.pop(); }
    const entry = { id, params };
    this.stack.push(entry);
    try { page.onEnter?.(params, entry); } catch (e) { console.warn('[ife] onEnter', e); }
    this.trans = instant || !from ? null : { from, to: entry, t0: this.now, dir };
    this.popover = null;
    this.dirty = true;
  }
  pop() {
    if (this.stack.length <= 1) return;
    const from = this.stack.pop();
    try { this.pages.get(from.id)?.onLeave?.(true); } catch (e) { console.warn(e); }
    const to = this.current;
    try { this.pages.get(to.id)?.onEnter?.(to.params, to, true); } catch (e) { console.warn(e); }
    this.trans = { from, to, t0: this.now, dir: -1 };
    this.popover = null;
    this.dirty = true;
  }
  home({ instant = false } = {}) {
    if (this.current?.id === 'home' && this.stack.length === 1) return;
    const from = this.current;
    for (const e of this.stack) if (e !== from) { /* leave silently */ }
    if (from) try { this.pages.get(from.id)?.onLeave?.(true); } catch (e) { console.warn(e); }
    this.stack = [{ id: 'home', params: {} }];
    try { this.pages.get('home')?.onEnter?.({}, this.stack[0], true); } catch (e) { console.warn(e); }
    this.trans = instant || !from ? null : { from, to: this.stack[0], t0: this.now, dir: -1 };
    this.popover = null;
    this.dirty = true;
  }
  reset(id = 'splash') {
    this.stack = [];
    this.trans = null;
    this.push(id, {}, { instant: true });
  }

  toast(msg, ms = 2600) { this.toastMsg = { msg, t0: this.now, dur: ms / 1000 }; this.dirty = true; }

  // ---------------------------------------------------------------------------------- hit regions
  hit(id, x, y, w, h, opts = {}) {
    const p = this.pointer;
    if (!this.recording) return { hover: false, pressed: false };
    const r = { id, x, y, w, h, ...opts };
    this._rec.push(r);
    const inside = p.inside && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
    const pressed = p.down && p.region && p.region.id === id && !p.scrolling;
    return { hover: inside && !p.scrolling, pressed };
  }
  /** Blocks everything below (modal overlays). */
  block(x = 0, y = 0, w = this.W, h = this.H) { this.hit('__block', x, y, w, h, {}); }

  _regionAt(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  pointerMove(x, y, inside = true) {
    const p = this.pointer;
    const changed = Math.abs(p.x - x) > 0.5 || Math.abs(p.y - y) > 0.5 || p.inside !== inside;
    if (p.down && inside) {
      const dx = x - p.x, dy = y - p.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      const r = p.region;
      if (r?.onDrag) r.onDrag(x, y, 'move');
      else if (r?.onScroll && (p.scrolling || p.moved > 12)) { p.scrolling = true; r.onScroll(-dx, -dy); }
    }
    p.x = x; p.y = y; p.inside = inside;
    if (changed) { p.lastMove = this.now; this.dirty = true; this.host?.onActivity?.(); }
  }
  pointerDown(x, y) {
    const p = this.pointer;
    p.x = x; p.y = y; p.inside = true; p.down = true; p.downX = x; p.downY = y; p.moved = 0; p.scrolling = false;
    p.lastMove = this.now;
    const r = this._regionAt(x, y);
    p.region = r;
    if (r && r.id !== '__block' && r.ripple !== false) {
      this.ripples.push({ x, y, t0: this.now, clip: { x: r.x, y: r.y, w: r.w, h: r.h, rad: r.radius ?? 12 } });
      if (this.ripples.length > 6) this.ripples.shift();
    }
    if (!r || r.id === '__block') {
      // tapping outside an open popover closes it
      if (this.popover && !r) this.popover = null;
    }
    r?.onDown?.(x, y);
    r?.onDrag?.(x, y, 'start');
    this.dirty = true;
    this.host?.onActivity?.();
  }
  pointerUp(x, y) {
    const p = this.pointer;
    if (!p.down) return;
    p.down = false;
    const r = p.region;
    p.region = null;
    if (r?.onDrag) r.onDrag(x, y, 'end');
    else if (r && !p.scrolling && p.moved < 18) {
      const r2 = this._regionAt(x, y);
      if (r2 && r2.id === r.id && r.onClick) {
        try { r.onClick(x, y); } catch (e) { console.warn('[ife] click handler', e); }
        this.host?.click?.();
      }
    }
    p.scrolling = false;
    this.dirty = true;
  }
  wheel(delta) {
    const r = this._regionAt(this.pointer.x, this.pointer.y);
    if (r?.onScroll) r.onScroll(delta * 60, delta * 60);
    else this.page?.onWheel?.(delta);
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------------- scheduling
  /** Desired frame rate right now (0 = only on change). */
  wantedFps() {
    let f = 0;
    if (this.trans || this.ripples.length || this.popover || this.toastMsg) f = 30;
    const pg = this.page;
    if (pg?.fps) f = Math.max(f, pg.fps(this) || 0);
    const h = this.host;
    if (h?.paOverlay?.active || h?.safety?.active) f = Math.max(f, 20);
    if (h?.music?.playing) f = Math.max(f, 4);
    return f;
  }
  needsRedraw(now) {
    if (this.dirty) return true;
    const f = this.wantedFps();
    if (f > 0 && now - this.lastDraw >= 1 / f - 0.004) return true;
    // clock in the top bar: once per (presented) minute is plenty
    return now - this.lastDraw > 2;
  }

  // ---------------------------------------------------------------------------------- drawing
  draw(now) {
    this.now = now;
    const ctx = this.ctx, W = this.W, H = this.H;
    this._rec = [];
    this.recording = true;
    this.dirty = false;
    this.lastDraw = now;
    const h = this.host;
    ctx.save();
    ctx.globalAlpha = 1;
    backdrop(ctx, W, H);

    const pg = this.page;
    const fullscreen = !!pg?.fullscreen?.(this);
    this.hideTopBar = fullscreen;
    const top = fullscreen ? 0 : TOP_H;
    this.contentY = top;
    const mini = !fullscreen && h?.music?.active && pg?.id !== 'music';
    const bottom = mini ? H - 84 : H;

    if (this.trans) {
      const t = clamp01((now - this.trans.t0) / TRANS_T);
      if (t >= 1) this.trans = null;
      else {
        const e = ease.inOutCubic(t);
        const dir = this.trans.dir;
        // outgoing page (no touch targets)
        this.recording = false;
        ctx.save();
        ctx.globalAlpha = 1 - e;
        ctx.translate(-dir * W * 0.06 * e, 0);
        this._drawPage(this.trans.from, top, bottom);
        ctx.restore();
        this.recording = true;
        ctx.save();
        ctx.globalAlpha = e;
        ctx.translate(dir * W * 0.06 * (1 - e), 0);
        this._drawPage(this.trans.to, top, bottom);
        ctx.restore();
      }
    }
    if (!this.trans) this._drawPage(this.current, top, bottom);

    if (mini) this._miniPlayer(bottom);
    if (!fullscreen) this._topBar();
    if (this.popover) this._popover();
    if (this.toastMsg) this._toast();
    // overlays from the host (PA announcement, safety demo)
    h?.drawOverlays?.(this, ctx);
    this._ripples();
    ctx.restore();
    this.regions = this._rec;
  }

  _drawPage(entry, top, bottom) {
    if (!entry) return;
    const pg = this.pages.get(entry.id);
    if (!pg) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, this.W, bottom - top);
    ctx.clip();
    try { pg.draw(this, ctx, 0, top, this.W, bottom - top, entry.params || {}); } catch (e) {
      if (!this._warned) { console.warn('[ife] page draw failed', entry.id, e); this._warned = true; }
    }
    ctx.restore();
  }

  _ripples() {
    const ctx = this.ctx;
    this.ripples = this.ripples.filter((r) => this.now - r.t0 < 0.55);
    for (const r of this.ripples) {
      const t = (this.now - r.t0) / 0.55;
      const c = r.clip;
      ctx.save();
      rr(ctx, c.x, c.y, c.w, c.h, c.rad);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(r.x, r.y, 20 + ease.outCubic(t) * Math.max(c.w, c.h) * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - t)})`;
      ctx.fill();
      ctx.restore();
    }
  }

  /** Standard button. kind: 'primary' | 'ghost' | 'chip' | 'icon' */
  button(id, x, y, w, h, label, { icon: ic = null, kind = 'ghost', onClick, active = false, size = 22, radius = null } = {}) {
    const ctx = this.ctx;
    const st = this.hit(id, x, y, w, h, { onClick, radius: radius ?? h / 2 });
    const rad = radius ?? h / 2;
    let bg = 'rgba(255,255,255,0.08)', fg = C.text;
    if (kind === 'primary') { bg = st.hover ? '#f0c063' : C.gold; fg = '#1a1407'; }
    else if (active) { bg = st.hover ? 'rgba(31,159,178,0.75)' : 'rgba(31,159,178,0.6)'; }
    else if (st.hover) bg = 'rgba(255,255,255,0.16)';
    if (st.pressed) bg = kind === 'primary' ? '#d39b36' : 'rgba(255,255,255,0.24)';
    fillRR(ctx, x, y, w, h, rad, bg);
    if (kind !== 'primary' && kind !== 'icon') { rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, rad); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke(); }
    const isz = Math.round(h * 0.48);
    if (ic && !label) { icon(ctx, ic, x + (w - isz) / 2, y + (h - isz) / 2, isz, fg); return st; }
    ctx.font = font(size, 600);
    const tw = label ? ctx.measureText(label).width : 0;
    const total = tw + (ic ? isz + 10 : 0);
    let cx = x + (w - total) / 2;
    if (ic) { icon(ctx, ic, cx, y + (h - isz) / 2, isz, fg); cx += isz + 10; }
    if (label) text(ctx, label, cx, y + h / 2 + size * 0.36, { size, weight: 600, color: fg });
    return st;
  }

  // ---------------------------------------------------------------------------------- chrome
  _topBar() {
    const ctx = this.ctx, W = this.W, h = this.host;
    const st = h?.app?.flight?.state;
    const g = ctx.createLinearGradient(0, 0, 0, TOP_H);
    g.addColorStop(0, 'rgba(4,12,22,0.92)');
    g.addColorStop(1, 'rgba(4,12,22,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, TOP_H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, TOP_H - 1, W, 1);
    let x = 18;
    const onHome = this.current?.id === 'home';
    if (!onHome) {
      const b = this.hit('top:home', x - 6, 8, 52, 50, { onClick: () => this.home(), radius: 12 });
      if (b.hover) fillRR(ctx, x - 6, 8, 52, 50, 12, 'rgba(255,255,255,0.12)');
      icon(ctx, 'home', x + 6, 19, 28, C.text);
      x += 58;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x - 6, 18, 1, 30);
      x += 10;
    }
    logoMark(ctx, x, 12, 42);
    x += 52;
    text(ctx, 'HN 482', x, 31, { size: 21, weight: 700, color: C.text });
    const o = st?.origin?.code || 'CBY', d = st?.destination?.code || 'PSX';
    text(ctx, `${o}  →  ${d}`, x, 54, { size: 16, weight: 500, color: C.muted, spacing: 1 });

    // local times (origin / destination)
    const h12 = (h?.app?.settings?.get?.('units') || 'imperial') === 'imperial';
    const cx = W * 0.5 - 20;
    const lt = (label, hours, xx) => {
      text(ctx, label, xx, 30, { size: 14, weight: 600, color: C.faint, spacing: 1.2 });
      text(ctx, fmtClock(hours ?? 16.5, h12), xx, 54, { size: 21, weight: 500, color: C.text });
    };
    icon(ctx, 'clock', cx - 150, 20, 26, C.faint);
    lt(`${st?.origin?.city?.toUpperCase?.() || 'CEDAR BAY'}`, st?.localTimeOrigin, cx - 112);
    lt(`${st?.destination?.city?.toUpperCase?.() || 'PORT SOLANO'}`, st?.localTimeDestination, cx + 32);

    // right side controls
    const items = [
      { id: 'light', ic: 'light', on: !!h?.readingLight, fn: () => h?.toggleReadingLight?.() },
      { id: 'call', ic: 'call', on: !!h?.callOn, fn: () => h?.toggleCall?.(), onColor: 'rgba(232,176,75,0.85)' },
      { id: 'bright', ic: 'brightness', on: this.popover?.kind === 'brightness', fn: () => this._togglePopover('brightness') },
      { id: 'vol', ic: (h?.volume ?? 0.8) < 0.02 ? 'mute' : 'volume', on: this.popover?.kind === 'volume', fn: () => this._togglePopover('volume') },
    ];
    if (h?.focused) items.push({ id: 'exit', ic: 'close', fn: () => h?.close?.(), exit: true });
    let rx = W - 14;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const bw = it.exit ? 96 : 54;
      rx -= bw;
      const b = this.hit(`top:${it.id}`, rx, 8, bw, 50, { onClick: it.fn, radius: 12 });
      let bg = null;
      if (it.on) bg = it.onColor || 'rgba(31,159,178,0.55)';
      else if (b.hover) bg = 'rgba(255,255,255,0.12)';
      if (it.exit) bg = b.hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
      if (bg) fillRR(ctx, rx, 8, bw, 50, 12, bg);
      if (it.exit) {
        icon(ctx, 'close', rx + 14, 22, 22, C.text);
        text(ctx, 'Exit', rx + 44, 40, { size: 19, weight: 600 });
      } else icon(ctx, it.ic, rx + 13, 19, 28, it.on && it.id === 'call' ? '#1a1407' : C.text);
      rx -= 6;
    }
  }

  _togglePopover(kind) {
    this.popover = this.popover?.kind === kind ? null : { kind, t0: this.now };
  }

  _popover() {
    const ctx = this.ctx, h = this.host, pop = this.popover;
    const e = ease.outCubic(clamp01((this.now - pop.t0) / 0.22));
    const w = 380, ht = 118;
    const x = this.W - w - 18, y = TOP_H + 8 - (1 - e) * 10;
    ctx.save();
    ctx.globalAlpha *= e;
    withShadow(ctx, 30, 'rgba(0,0,0,0.6)', () => fillRR(ctx, x, y, w, ht, 18, 'rgba(14,34,56,0.97)'));
    this.hit('pop:bg', x, y, w, ht, { ripple: false });
    const vol = pop.kind === 'volume';
    text(ctx, vol ? 'Headphone volume' : 'Screen brightness', x + 24, y + 38, { size: 19, weight: 600 });
    const val = vol ? (h?.volume ?? 0.8) : (h?.brightness ?? 0.85);
    text(ctx, `${Math.round(val * 100)}%`, x + w - 24, y + 38, { size: 19, weight: 500, color: C.muted, align: 'right' });
    icon(ctx, vol ? 'mute' : 'brightness', x + 20, y + 66, 26, C.muted);
    icon(ctx, vol ? 'volume' : 'brightness', x + w - 48, y + 64, 30, C.text);
    const sx = x + 60, sw = w - 124, sy = y + 76;
    const set = (px) => { const v = clamp((px - sx) / sw, 0, 1); if (vol) h?.setVolume?.(v); else h?.setBrightness?.(Math.max(0.15, v)); this.dirty = true; };
    this.hit('pop:slider', sx - 14, sy - 22, sw + 28, 44, { onDrag: (px) => set(px), ripple: false });
    bar(ctx, sx, sy - 4, sw, 8, val, { knob: true, fg: C.teal });
    ctx.restore();
  }

  _toast() {
    const t = this.now - this.toastMsg.t0;
    if (t > this.toastMsg.dur) { this.toastMsg = null; return; }
    const a = Math.min(1, t / 0.2, (this.toastMsg.dur - t) / 0.3);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.font = font(21, 500);
    const w = ctx.measureText(this.toastMsg.msg).width + 56;
    const x = (this.W - w) / 2, y = this.H - 120;
    fillRR(ctx, x, y, w, 52, 26, 'rgba(10,26,44,0.95)');
    text(ctx, this.toastMsg.msg, this.W / 2, y + 33, { size: 21, weight: 500, align: 'center' });
    ctx.restore();
  }

  _miniPlayer(y) {
    const ctx = this.ctx, W = this.W, m = this.host.music;
    const g = ctx.createLinearGradient(0, y, 0, this.H);
    g.addColorStop(0, 'rgba(10,30,50,0.97)');
    g.addColorStop(1, 'rgba(6,18,32,0.97)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, this.H - y);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, y, W, 1);
    const tr = m.current;
    const open = this.hit('mini:open', 0, y, W * 0.6, this.H - y, { onClick: () => this.push('music', { album: m.albumIndex, nowPlaying: true }), radius: 0 });
    if (open.hover) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, y, W * 0.6, this.H - y); }
    const art = this.host.musicArt?.(m.albumIndex, 64);
    if (art) ctx.drawImage(art, 22, y + 10, 64, 64);
    text(ctx, tr?.title || '', 104, y + 38, { size: 21, weight: 600, maxWidth: W * 0.4 });
    text(ctx, tr ? `${m.album?.artist} · ${m.album?.title}` : '', 104, y + 64, { size: 17, color: C.muted, maxWidth: W * 0.4 });
    const bx = W - 300;
    this.button('mini:prev', bx, y + 16, 52, 52, null, { icon: 'prev', kind: 'icon', onClick: () => m.prev() });
    this.button('mini:pp', bx + 62, y + 12, 60, 60, null, { icon: m.playing ? 'pause' : 'play', kind: 'primary', onClick: () => m.toggle() });
    this.button('mini:next', bx + 132, y + 16, 52, 52, null, { icon: 'next', kind: 'icon', onClick: () => m.next() });
    this.button('mini:stop', bx + 210, y + 16, 52, 52, null, { icon: 'close', kind: 'icon', onClick: () => m.stop() });
    bar(ctx, 0, y, W * clamp01(m.position / Math.max(1, m.duration)), 3, 1, { bg: 'transparent', fg: C.teal });
  }
}
