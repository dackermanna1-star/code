// =============================================================================
// Video playback service for the active seat: one reusable HTMLVideoElement,
// routed into the audio module's IFE (headphone) bus when available.
// Remembers resume positions per title (like a real IFE).
// =============================================================================

export class VideoService {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.item = null;
    this.error = null;
    this.resume = new Map();
    this.wantPlay = false;       // user intent (survives PA pauses)
    this.held = new Set();       // reasons the system holds playback ('pa', 'safety', 'power')
    this._connected = false;
    this._onChange = null;
    this.frameSerial = 0;
  }

  _ensure() {
    if (this.el) return this.el;
    const v = document.createElement('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.setAttribute('playsinline', '');
    v.muted = !!this.app.debug?.mute;
    v.volume = 1;
    v.addEventListener('error', () => { this.error = 'This title is not available on this device.'; this._emit(); });
    v.addEventListener('ended', () => { this.wantPlay = false; if (this.item) this.resume.delete(this.item.id); this._emit('ended'); });
    v.addEventListener('playing', () => { this.error = null; this._emit(); });
    v.addEventListener('pause', () => this._emit());
    v.addEventListener('loadeddata', () => this._emit());
    if ('requestVideoFrameCallback' in v) {
      const tick = () => { this.frameSerial++; v.requestVideoFrameCallback(tick); };
      v.requestVideoFrameCallback(tick);
    }
    this.el = v;
    return v;
  }

  _connect() {
    if (this._connected || !this.el) return;
    const a = this.app.audio;
    if (a && typeof a.connectMedia === 'function' && a.context) {
      try { const n = a.connectMedia(this.el); if (n) this._connected = true; } catch (e) { console.warn('[ife] connectMedia failed', e); }
    }
  }

  onChange(fn) { this._onChange = fn; }
  _emit(kind) { try { this._onChange?.(kind); } catch (e) { console.warn(e); } }

  load(item, { autoplay = true, fromStart = false } = {}) {
    const v = this._ensure();
    if (this.item && this.item.id !== item.id && v.currentTime > 5 && !v.ended) this.resume.set(this.item.id, v.currentTime);
    if (!this.item || this.item.id !== item.id) {
      this.item = item;
      this.error = null;
      v.src = item.src;
      const start = fromStart ? 0 : (this.resume.get(item.id) || 0);
      if (start > 0) {
        const seek = () => { try { v.currentTime = start; } catch { /* */ } v.removeEventListener('loadedmetadata', seek); };
        v.addEventListener('loadedmetadata', seek);
      }
    } else if (fromStart) { try { v.currentTime = 0; } catch { /* */ } }
    this._connect();
    this.wantPlay = autoplay;
    this._apply();
  }

  /** Apply user intent + system holds. */
  _apply() {
    const v = this.el;
    if (!v || !this.item) return;
    const should = this.wantPlay && this.held.size === 0;
    if (should && v.paused) {
      this._connect();
      const p = v.play();
      if (p && p.catch) {
        p.catch(() => {
          // autoplay with sound blocked (no gesture yet): retry muted so the picture runs
          if (!v.muted) { v.muted = true; v.play().catch(() => {}); }
        });
      }
    } else if (!should && !v.paused) v.pause();
    this.app.audio?.setHeadphones?.(should || !!this.app.ife?.isOpen);
  }

  play() { this.wantPlay = true; this._apply(); }
  pause() { this.wantPlay = false; this._apply(); }
  toggle() { if (this.wantPlay) this.pause(); else this.play(); }
  hold(reason, on) { if (on) this.held.add(reason); else this.held.delete(reason); this._apply(); }
  stop() {
    const v = this.el;
    if (v && this.item) { if (v.currentTime > 5 && !v.ended) this.resume.set(this.item.id, v.currentTime); }
    this.wantPlay = false;
    if (v) { v.pause(); }
    this.item = null;
    this._emit();
  }
  seek(t) { const v = this.el; if (!v || !this.item) return; try { v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.5, t)); } catch { /* */ } }
  skip(dt) { if (this.el) this.seek(this.el.currentTime + dt); }

  get playing() { return !!this.el && !this.el.paused && !this.el.ended; }
  get position() { return this.el?.currentTime || 0; }
  get duration() { return (this.el && Number.isFinite(this.el.duration) ? this.el.duration : this.item?.duration) || 0; }
  get ready() { return !!this.el && this.el.readyState >= 2 && this.el.videoWidth > 0; }
  get buffered() {
    const v = this.el;
    if (!v || !v.buffered?.length || !this.duration) return 0;
    try { return v.buffered.end(v.buffered.length - 1) / this.duration; } catch { return 0; }
  }
  setVolume(v) { if (this.el) this.el.volume = Math.max(0, Math.min(1, v)); }
}
