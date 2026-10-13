import { blockDef } from '../../shared/world/blocks';
import type { VoxelWorld } from '../../shared/world/chunk';
import { deleteSavedMap, MapTerrain } from './maptiles';

export interface MapMarker {
  x: number;
  z: number;
  label: string;
  kind: 'poi-low' | 'poi-mid' | 'poi-high' | 'bag' | 'death';
}

type Kind = MapMarker['kind'];

/** Marker styling. `prio`: lower = more important (labels placed first, drawn on top). */
const STYLE: Record<Kind, { color: string; legend: string; prio: number; r: number }> = {
  death: { color: '#ff4636', legend: 'Your body', prio: 0, r: 7.5 },
  bag: { color: '#4f9bff', legend: 'Sleeping bag', prio: 1, r: 7.5 },
  'poi-high': { color: '#e8493a', legend: 'Monument · high tier', prio: 2, r: 8.5 },
  'poi-mid': { color: '#f0a830', legend: 'Monument · mid tier', prio: 3, r: 8 },
  'poi-low': { color: '#a6d65e', legend: 'Monument · low tier', prio: 4, r: 7.5 },
};
const LEGEND_ORDER: Array<Kind | 'player'> = ['player', 'poi-low', 'poi-mid', 'poi-high', 'bag', 'death'];

/** Zoom levels in screen (CSS) pixels per block. */
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const GRID_STEPS = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];
const SCALE_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
const BG = '#12100d';
const PANEL = 'rgba(16, 14, 12, 0.82)';
const INK = '#16120e';
/** Minimap: screen pixels per block, and minimum time between redraws. */
const MINI_ZOOM = 1.5;
const MINI_INTERVAL = 100;
const ZOOM_KEY = 'corrode.map.zoom';

interface Rect { x: number; y: number; w: number; h: number }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fmt = (n: number) => String(Math.round(n)).replace('-', '−');
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** yaw: 0 = north (-Z), increasing counter-clockwise seen from above. */
const facing = (yaw: number) => COMPASS[((Math.round(-yaw / (Math.PI / 4)) % 8) + 8) % 8];

/** Draw a marker / player icon centred at (x, y); r = radius in canvas units. */
function drawIcon(g: CanvasRenderingContext2D, kind: Kind | 'player', x: number, y: number, r: number, yaw = 0) {
  g.save();
  g.lineJoin = 'miter';
  if (kind === 'player') {
    g.translate(x, y);
    g.rotate(-yaw);
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.75, r * 0.8);
    g.lineTo(0, r * 0.38);
    g.lineTo(-r * 0.75, r * 0.8);
    g.closePath();
    g.lineWidth = Math.max(1.5, r * 0.28);
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fill();
  } else if (kind === 'bag') {
    const w = r * 2, h = r * 1.4;
    g.fillStyle = INK;
    g.fillRect(x - w / 2 - 1.5, y - h / 2 - 1.5, w + 3, h + 3);
    g.fillStyle = STYLE.bag.color;
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle = '#e8f1ff';
    g.fillRect(x - w / 2 + 1.5, y - h / 2 + 1.5, w * 0.3, h - 3);
  } else if (kind === 'death') {
    g.lineCap = 'square';
    const k = r * 0.7;
    g.beginPath();
    g.moveTo(x - k, y - k); g.lineTo(x + k, y + k);
    g.moveTo(x + k, y - k); g.lineTo(x - k, y + k);
    g.strokeStyle = INK;
    g.lineWidth = r * 0.95;
    g.stroke();
    g.strokeStyle = STYLE.death.color;
    g.lineWidth = r * 0.5;
    g.stroke();
  } else {
    const st = STYLE[kind];
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
    g.closePath();
    g.fillStyle = st.color;
    g.fill();
    g.lineWidth = Math.max(1.25, r * 0.24);
    g.strokeStyle = INK;
    g.stroke();
    // tier pips: 1 / 2 / 3 dark squares so tiers differ by more than colour
    const n = kind === 'poi-low' ? 1 : kind === 'poi-mid' ? 2 : 3;
    const p = Math.max(1.5, r * 0.26);
    g.fillStyle = INK;
    if (n === 1) g.fillRect(x - p / 2, y - p / 2, p, p);
    else if (n === 2) { g.fillRect(x - p * 1.1, y - p / 2, p, p); g.fillRect(x + p * 0.1, y - p / 2, p, p); }
    else { g.fillRect(x - p / 2, y - p * 1.25, p, p); g.fillRect(x - p * 1.15, y + p * 0.05, p, p); g.fillRect(x + p * 0.15, y + p * 0.05, p, p); }
  }
  g.restore();
}

/** Point where the ray from (cx, cy) towards (tx, ty) leaves the rectangle. */
function edgePoint(cx: number, cy: number, tx: number, ty: number, x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = tx - cx, dy = ty - cy;
  let t = 1;
  if (dx > 0) t = Math.min(t, (x1 - cx) / dx); else if (dx < 0) t = Math.min(t, (x0 - cx) / dx);
  if (dy > 0) t = Math.min(t, (y1 - cy) / dy); else if (dy < 0) t = Math.min(t, (y0 - cy) / dy);
  return [cx + dx * t, cy + dy * t];
}

/** Small triangle at (x, y) pointing along angle `a` (radians, screen space). */
function drawPointer(g: CanvasRenderingContext2D, x: number, y: number, a: number, color: string, size: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.moveTo(size, 0);
  g.lineTo(-size * 0.7, size * 0.75);
  g.lineTo(-size * 0.7, -size * 0.75);
  g.closePath();
  g.fillStyle = color;
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.stroke();
  g.fill();
  g.restore();
}

function setText(el: HTMLElement | null, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}

/**
 * World map overlay and HUD minimap.
 *
 * Explored terrain lives in {@link MapTerrain} (region canvases updated
 * incrementally as chunks arrive or change), so drawing either view is a
 * handful of drawImage calls plus vector overlays. The full map supports
 * drag-to-pan, wheel zoom around the cursor, keyboard pan/zoom and
 * recentring; the minimap is north-up and redrawn at most ~10 times a second.
 */
export class MapUI {
  private static active: MapUI | null = null;
  /** Screen pixels per block. */
  zoom = 2;
  private terrain = new MapTerrain();
  private world: VoxelWorld | null = null;
  private markers: MapMarker[] = [];
  private markerSig = 0;
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private frame: HTMLElement | null;
  private legend: HTMLElement | null;
  private tools: HTMLElement | null;
  private status = {
    me: document.getElementById('map-me'),
    cursor: document.getElementById('map-cursor'),
    zoom: document.getElementById('map-zoom'),
  };
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private sizeDirty = true;
  private resizeObs: ResizeObserver | null = null;
  private abort = new AbortController();
  private hatch: CanvasPattern | null = null;
  private textW = new Map<string, number>();
  // view state
  private follow = true;
  private vx = 0;
  private vz = 0;
  private px = 0;
  private pz = 0;
  private yaw = 0;
  private hover: { x: number; y: number } | null = null;
  private drag: { id: number; x: number; y: number; vx: number; vz: number; moved: boolean } | null = null;
  private wheelAcc = 0;
  private lastWheel = 0;
  private lastSig = '';
  private lastRender = 0;
  // minimap
  private mini: HTMLCanvasElement | null;
  private miniG: CanvasRenderingContext2D | null = null;
  private miniBox: HTMLElement | null;
  private miniInfo: HTMLElement | null;
  private miniVisible = false;
  private lastMini = -1e9;
  private miniSig = '';

  constructor() {
    MapUI.active?.dispose();
    MapUI.active = this;
    this.root = document.getElementById('map')!;
    this.canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.frame = document.getElementById('map-frame');
    this.legend = document.getElementById('map-legend');
    this.tools = document.getElementById('map-tools');
    this.mini = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
    this.miniG = this.mini?.getContext('2d') ?? null;
    this.miniBox = document.getElementById('minimap');
    this.miniInfo = document.getElementById('minimap-info');
    this.miniBox?.classList.add('hidden');
    try {
      const z = Number(localStorage.getItem(ZOOM_KEY));
      if (ZOOMS.includes(z)) this.zoom = z;
    } catch {
      /* storage unavailable */
    }
    this.bindInput();
    this.buildLegend();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => (this.sizeDirty = true));
      this.resizeObs.observe(this.canvas);
    }
  }

  /** Whether the full map screen is showing. */
  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  set open(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  /**
   * Persist the explored map for this world (IndexedDB, best effort) and
   * restore what was explored in earlier sessions. Optional: without it the
   * map works for the current session only.
   */
  setWorldKey(key: string) {
    void this.terrain.setWorldKey(key);
  }

  /** Remove a world's saved map (e.g. when the world is deleted). */
  static forgetWorld(key: string): Promise<void> {
    return deleteSavedMap(key);
  }

  setMarkers(m: MapMarker[]) {
    this.markers = m;
    let h = m.length;
    for (const k of m) h = (Math.imul(h, 31) + Math.round(k.x) * 7 + Math.round(k.z) * 13 + k.kind.length + k.label.length) | 0;
    this.markerSig = h;
  }

  /** Capture a chunk's top-down image (call when a chunk arrives or changes). */
  capture(world: VoxelWorld, key: number) {
    this.world = world;
    const c = world.chunks.get(key);
    if (c) this.terrain.capture(c);
  }

  dispose() {
    this.abort.abort();
    this.resizeObs?.disconnect();
    this.terrain.dispose();
    this.miniBox?.classList.add('hidden');
    if (MapUI.active === this) MapUI.active = null;
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const opt = { signal: this.abort.signal };
    const cv = this.canvas;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - this.lastWheel > 250) this.wheelAcc = 0;
      this.lastWheel = now;
      this.wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if (Math.abs(this.wheelAcc) < 40) return; // trackpads: accumulate small deltas
      const dir = this.wheelAcc > 0 ? -1 : 1;
      this.wheelAcc = 0;
      this.zoomBy(dir, e.offsetX, e.offsetY);
    }, { passive: false, signal: this.abort.signal });
    cv.addEventListener('pointerdown', (e) => {
      if (e.button > 2) return;
      cv.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: this.vx, vz: this.vz, moved: false };
      e.preventDefault();
    }, opt);
    cv.addEventListener('pointermove', (e) => {
      this.hover = { x: e.offsetX, y: e.offsetY };
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      if (!d.moved) {
        d.moved = true;
        d.vx = this.vx;
        d.vz = this.vz;
        d.x = e.clientX;
        d.y = e.clientY;
        cv.classList.add('dragging');
        this.follow = false;
        return;
      }
      this.vx = d.vx - dx / this.zoom;
      this.vz = d.vz - dy / this.zoom;
    }, opt);
    const end = (e: PointerEvent) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      cv.classList.remove('dragging');
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    };
    cv.addEventListener('pointerup', end, opt);
    cv.addEventListener('pointercancel', end, opt);
    cv.addEventListener('pointerleave', () => {
      if (!this.drag) this.hover = null;
    }, opt);
    cv.addEventListener('dblclick', (e) => this.zoomBy(1, e.offsetX, e.offsetY), opt);
    cv.addEventListener('contextmenu', (e) => e.preventDefault(), opt);
    const btn = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', (e) => {
      fn();
      (e.currentTarget as HTMLElement).blur();
    }, opt);
    btn('map-zoom-in', () => this.zoomBy(1));
    btn('map-zoom-out', () => this.zoomBy(-1));
    btn('map-recentre', () => this.recentre());
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      const step = 0.2;
      switch (e.code) {
        case 'Space': case 'KeyC': case 'Home': this.recentre(); break;
        case 'Equal': case 'NumpadAdd': case 'PageUp': this.zoomBy(1); break;
        case 'Minus': case 'NumpadSubtract': case 'PageDown': this.zoomBy(-1); break;
        case 'ArrowUp': case 'KeyW': this.pan(0, -step); break;
        case 'ArrowDown': case 'KeyS': this.pan(0, step); break;
        case 'ArrowLeft': case 'KeyA': this.pan(-step, 0); break;
        case 'ArrowRight': case 'KeyD': this.pan(step, 0); break;
        default: return;
      }
      e.preventDefault();
    }, opt);
  }

  private zoomIndex() {
    let best = 0;
    for (let i = 0; i < ZOOMS.length; i++) if (Math.abs(ZOOMS[i] - this.zoom) < Math.abs(ZOOMS[best] - this.zoom)) best = i;
    return best;
  }

  /** Step the zoom level; with a focus point (CSS px on the canvas) that point stays put. */
  private zoomBy(dir: number, fx?: number, fy?: number) {
    const i = this.zoomIndex();
    const ni = Math.max(0, Math.min(ZOOMS.length - 1, i + dir));
    const nz = ZOOMS[ni];
    if (nz === this.zoom) return;
    if (fx !== undefined && fy !== undefined && this.cssW) {
      const ox = fx - this.cssW / 2, oy = fy - this.cssH / 2;
      if (Math.hypot(ox, oy) > 12) {
        const wx = this.vx + ox / this.zoom, wz = this.vz + oy / this.zoom;
        this.vx = wx - ox / nz;
        this.vz = wz - oy / nz;
        this.follow = false;
      }
    }
    this.zoom = nz;
    try {
      localStorage.setItem(ZOOM_KEY, String(nz));
    } catch {
      /* ignore */
    }
  }

  private pan(fx: number, fz: number) {
    this.follow = false;
    this.vx += (fx * this.cssW) / this.zoom;
    this.vz += (fz * this.cssH) / this.zoom;
  }

  private recentre() {
    this.follow = true;
    this.vx = this.px;
    this.vz = this.pz;
  }

  // ------------------------------------------------------------------ legend
  private buildLegend() {
    const box = this.legend;
    if (!box) return;
    box.textContent = '';
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    for (const k of LEGEND_ORDER) {
      const row = document.createElement('div');
      row.className = 'lg';
      const c = document.createElement('canvas');
      c.width = c.height = Math.round(20 * dpr);
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      drawIcon(g, k, 10, 10, k === 'player' ? 8 : Math.min(8, STYLE[k].r));
      const label = document.createElement('span');
      label.textContent = k === 'player' ? 'You' : STYLE[k].legend;
      row.append(c, label);
      box.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ full map
  render(px: number, pz: number, yaw: number) {
    this.px = px;
    this.pz = pz;
    this.yaw = yaw;
    const now = performance.now();
    if (now - this.lastRender > 250) {
      // (re)opened: forget pointer state from last time
      this.hover = null;
      this.drag = null;
      this.canvas.classList.remove('dragging');
    }
    this.lastRender = now;
    if (this.world) this.terrain.pollEdits(this.world, now);
    if (this.follow) {
      this.vx = px;
      this.vz = pz;
    }
    if (!this.fitCanvas()) return;
    const h = this.hover;
    const sig = `${this.vx.toFixed(2)},${this.vz.toFixed(2)},${this.zoom},${px.toFixed(2)},${pz.toFixed(2)},${yaw.toFixed(3)},${this.terrain.version},${this.markerSig},${h ? `${h.x},${h.y}` : '-'},${this.cssW}x${this.cssH}@${this.dpr},${this.follow}`;
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.drawMap();
  }

  /** Match the canvas backing store to its on-screen size. Returns false while hidden. */
  private fitCanvas(): boolean {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (this.sizeDirty || dpr !== this.dpr || !this.resizeObs) {
      this.sizeDirty = false;
      this.cssW = this.canvas.clientWidth;
      this.cssH = this.canvas.clientHeight;
      this.dpr = dpr;
      const bw = Math.round(this.cssW * dpr), bh = Math.round(this.cssH * dpr);
      if (bw && bh && (this.canvas.width !== bw || this.canvas.height !== bh)) {
        this.canvas.width = bw;
        this.canvas.height = bh;
      }
    }
    return this.cssW > 0 && this.cssH > 0;
  }

  private getHatch(g: CanvasRenderingContext2D) {
    if (!this.hatch) {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const p = c.getContext('2d')!;
      p.fillStyle = 'rgba(255,255,255,0.025)';
      for (let i = 0; i < 8; i++) p.fillRect(i, 7 - i, 1, 1);
      this.hatch = g.createPattern(c, 'repeat');
    }
    return this.hatch;
  }

  private measure(g: CanvasRenderingContext2D, text: string) {
    let w = this.textW.get(text);
    if (w === undefined) {
      w = g.measureText(text).width;
      if (this.textW.size > 500) this.textW.clear();
      this.textW.set(text, w);
    }
    return w;
  }

  /** Rectangle (CSS px, canvas-relative) covered by a DOM overlay, for label avoidance. */
  private overlayRect(el: HTMLElement | null): Rect | null {
    if (!el || !this.frame) return null;
    return { x: el.offsetLeft - 4, y: el.offsetTop - 4, w: el.offsetWidth + 8, h: el.offsetHeight + 8 };
  }

  private drawMap() {
    const g = this.g, dpr = this.dpr, W = this.cssW, H = this.cssH, zoom = this.zoom;
    const s = zoom * dpr;
    const devW = this.canvas.width, devH = this.canvas.height;
    // view origin snapped to whole device pixels so blocks don't shimmer while panning
    const ox = Math.round(this.vx * s - devW / 2), oz = Math.round(this.vz * s - devH / 2);
    const toX = (x: number) => (x * s - ox) / dpr;
    const toY = (z: number) => (z * s - oz) / dpr;
    const wx0 = ox / s, wz0 = oz / s, wx1 = (ox + devW) / s, wz1 = (oz + devH) / s;

    // ---- terrain
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, devW, devH);
    const hatch = this.getHatch(g);
    if (hatch) {
      g.fillStyle = hatch;
      g.fillRect(0, 0, devW, devH);
    }
    g.imageSmoothingEnabled = s < 1;
    g.imageSmoothingQuality = 'high';
    this.terrain.draw(g, wx0, wz0, s, devW, devH);
    g.imageSmoothingEnabled = true;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ---- screen areas covered by chrome (compass, scale bar, DOM legend / buttons)
    const scale = this.scaleBar(W, H);
    const reserved: Rect[] = [{ x: 0, y: 0, w: 80, h: 80 }, scale.rect];
    for (const el of [this.legend, this.tools]) {
      const r = this.overlayRect(el);
      if (r) reserved.push(r);
    }
    const free = (r: Rect, others: Rect[]) => !others.some((o) => overlaps(o, r));

    // ---- grid with coordinate labels
    const step = GRID_STEPS.find((st) => st * zoom >= 96) ?? GRID_STEPS[GRID_STEPS.length - 1];
    const crisp = (v: number) => (Math.round(v * dpr) + 0.5) / dpr;
    g.lineWidth = 1 / dpr;
    g.beginPath();
    for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) if (x !== 0) { const sx = crisp(toX(x)); g.moveTo(sx, 0); g.lineTo(sx, H); }
    for (let z = Math.ceil(wz0 / step) * step; z <= wz1; z += step) if (z !== 0) { const sy = crisp(toY(z)); g.moveTo(0, sy); g.lineTo(W, sy); }
    g.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    g.stroke();
    g.beginPath(); // the axes through the origin
    if (wx0 <= 0 && wx1 >= 0) { const sx = crisp(toX(0)); g.moveTo(sx, 0); g.lineTo(sx, H); }
    if (wz0 <= 0 && wz1 >= 0) { const sy = crisp(toY(0)); g.moveTo(0, sy); g.lineTo(W, sy); }
    g.strokeStyle = 'rgba(255, 214, 150, 0.3)';
    g.stroke();
    g.font = `11px ${MONO}`;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    const gridLabel = (text: string, x: number, y: number) => {
      const w = this.measure(g, text);
      const r = { x: x - 2, y: y - 1, w: w + 4, h: 13 };
      if (!free(r, reserved)) return;
      g.fillStyle = 'rgba(16, 14, 12, 0.62)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = 'rgba(240, 232, 216, 0.82)';
      g.fillText(text, x, y);
    };
    for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) gridLabel(`X ${fmt(x)}`, toX(x) + 4, 4);
    for (let z = Math.ceil(wz0 / step) * step; z <= wz1; z += step) gridLabel(`Z ${fmt(z)}`, 4, toY(z) + 3);

    // ---- block under the cursor (when zoomed in)
    const hv = this.hover && !this.drag?.moved ? this.hover : null;
    if (hv && zoom >= 4) {
      const bx = Math.floor(wx0 + (hv.x * dpr) / s), bz = Math.floor(wz0 + (hv.y * dpr) / s);
      g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      g.lineWidth = 1;
      g.strokeRect(toX(bx) + 0.5, toY(bz) + 0.5, zoom - 1, zoom - 1);
    }

    this.drawCompass(g, 40, 42, 26);
    this.drawScale(g, scale);

    // ---- markers: on-screen icons, off-screen pointers for the player / bags / body
    type Vis = { m: MapMarker; sx: number; sy: number; r: number; d: number };
    const vis: Vis[] = [];
    const away: Array<{ sx: number; sy: number; text: string; color: string }> = [];
    const ppx = toX(this.px), ppy = toY(this.pz);
    const iconScale = zoom < 1 ? 0.85 : 1;
    for (const m of this.markers) {
      const sx = toX(m.x), sy = toY(m.z);
      const r = STYLE[m.kind].r * iconScale;
      if (sx >= -r && sy >= -r && sx <= W + r && sy <= H + r) vis.push({ m, sx, sy, r, d: Math.hypot(sx - W / 2, sy - H / 2) });
      else if (m.kind === 'death' || m.kind === 'bag') {
        away.push({ sx, sy, text: `${m.label} · ${fmt(Math.hypot(m.x - this.px, m.z - this.pz))} m`, color: STYLE[m.kind].color });
      }
    }
    const meVisible = ppx >= 0 && ppy >= 0 && ppx <= W && ppy <= H;
    if (!meVisible) away.unshift({ sx: ppx, sy: ppy, text: 'You', color: '#ffffff' });
    // important first; POIs nearest the view centre first
    vis.sort((a, b) => {
      const pa = a.m.kind.startsWith('poi') ? 9 : STYLE[a.m.kind].prio, pb = b.m.kind.startsWith('poi') ? 9 : STYLE[b.m.kind].prio;
      return pa - pb || a.d - b.d;
    });
    let hot: Vis | null = null;
    if (hv) {
      let best = 12;
      for (const v of vis) {
        const d = Math.hypot(v.sx - hv.x, v.sy - hv.y);
        if (d < best) { best = d; hot = v; }
      }
    }
    const occupied: Rect[] = [...reserved, { x: ppx - 11, y: ppy - 11, w: 22, h: 22 }];
    for (const v of vis) occupied.push({ x: v.sx - v.r - 1, y: v.sy - v.r - 1, w: v.r * 2 + 2, h: v.r * 2 + 2 });

    // off-screen pointer labels: inward from the pointer, slid along the edge to dodge chrome
    g.font = `bold 12px ${FONT}`;
    const awayDraw: Array<{ ex: number; ey: number; a: number; color: string; text: string; rect: Rect }> = [];
    for (const o of away) {
      const [ex, ey] = edgePoint(W / 2, H / 2, o.sx, o.sy, 14, 14, W - 14, H - 14);
      const a = Math.atan2(o.sy - H / 2, o.sx - W / 2);
      const w = this.measure(g, o.text) + 10, h = 17;
      const base: Rect = {
        x: Math.max(4, Math.min(W - w - 4, ex - Math.cos(a) * (w / 2 + 14) - w / 2)),
        y: Math.max(4, Math.min(H - h - 4, ey - Math.sin(a) * (h / 2 + 14) - h / 2)),
        w, h,
      };
      const horizontalEdge = Math.abs(ey - 14) < 0.5 || Math.abs(ey - (H - 14)) < 0.5;
      let rect = base;
      for (const d of [0, -22, 22, -44, 44, -66, 66, -88, 88, -110, 110]) {
        const r = horizontalEdge
          ? { ...base, x: Math.max(4, Math.min(W - w - 4, base.x + d * 2)) }
          : { ...base, y: Math.max(4, Math.min(H - h - 4, base.y + d)) };
        if (free(r, occupied)) { rect = r; break; }
      }
      occupied.push(rect);
      awayDraw.push({ ex, ey, a, color: o.color, text: o.text, rect });
    }

    // marker labels: greedy placement (right, left, above, below); skipped when no room
    const labelFont = zoom < 0.75 ? 11 : 12;
    g.font = `bold ${labelFont}px ${FONT}`;
    const poiBudget = zoom >= 1 ? Infinity : zoom >= 0.5 ? 18 : 10;
    let poiLabels = 0;
    const labels: Array<{ v: Vis; rect: Rect }> = [];
    for (const v of vis) {
      if (v === hot) continue;
      const isPoi = v.m.kind.startsWith('poi');
      if (isPoi && poiLabels >= poiBudget) continue;
      const w = this.measure(g, v.m.label) + 10, h = labelFont + 5, gap = v.r + 3;
      const cands: Rect[] = [
        { x: v.sx + gap, y: v.sy - h / 2, w, h },
        { x: v.sx - gap - w, y: v.sy - h / 2, w, h },
        { x: v.sx - w / 2, y: v.sy - gap - h, w, h },
        { x: v.sx - w / 2, y: v.sy + gap, w, h },
      ];
      for (const c of cands) {
        if (c.x < 2 || c.y < 2 || c.x + c.w > W - 2 || c.y + c.h > H - 2 || !free(c, occupied)) continue;
        occupied.push(c);
        labels.push({ v, rect: c });
        if (isPoi) poiLabels++;
        break;
      }
    }
    const drawLabel = (text: string, color: string, rc: Rect) => {
      g.fillStyle = PANEL;
      g.fillRect(rc.x, rc.y, rc.w, rc.h);
      g.fillStyle = color;
      g.fillRect(rc.x, rc.y, 2, rc.h);
      g.fillStyle = '#f2ece0';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(text, rc.x + 6, rc.y + rc.h / 2 + 0.5);
    };
    for (const l of labels) drawLabel(l.v.m.label, STYLE[l.v.m.kind].color, l.rect);
    for (let i = vis.length - 1; i >= 0; i--) if (vis[i] !== hot) drawIcon(g, vis[i].m.kind, vis[i].sx, vis[i].sy, vis[i].r);

    // ---- player: soft view cone + arrow
    if (meVisible) {
      const a = -this.yaw - Math.PI / 2;
      const grad = g.createRadialGradient(ppx, ppy, 4, ppx, ppy, 48);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(ppx, ppy);
      g.arc(ppx, ppy, 48, a - 0.55, a + 0.55);
      g.closePath();
      g.fill();
      drawIcon(g, 'player', ppx, ppy, 10, this.yaw);
    }
    g.font = `bold 12px ${FONT}`;
    for (const o of awayDraw) {
      drawPointer(g, o.ex, o.ey, o.a, o.color, 7);
      drawLabel(o.text, o.color, o.rect);
    }

    // ---- hovered marker: enlarged icon + tooltip, always on top
    if (hot) {
      drawIcon(g, hot.m.kind, hot.sx, hot.sy, hot.r * 1.3);
      const dist = Math.hypot(hot.m.x - this.px, hot.m.z - this.pz);
      const line2 = `${STYLE[hot.m.kind].legend} · X ${fmt(hot.m.x)} Z ${fmt(hot.m.z)} · ${fmt(dist)} m`;
      g.font = `bold 13px ${FONT}`;
      const w1 = this.measure(g, hot.m.label);
      g.font = `11px ${FONT}`;
      const w2 = this.measure(g, line2);
      const w = Math.max(w1, w2) + 16, h = 38;
      let tx = hot.sx + hot.r + 10;
      if (tx + w > W - 4) tx = hot.sx - hot.r - 10 - w;
      const ty = Math.max(4, Math.min(H - h - 4, hot.sy - h / 2));
      g.fillStyle = 'rgba(14, 12, 10, 0.95)';
      g.fillRect(tx, ty, w, h);
      g.strokeStyle = STYLE[hot.m.kind].color;
      g.lineWidth = 1;
      g.strokeRect(tx + 0.5, ty + 0.5, w - 1, h - 1);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.font = `bold 13px ${FONT}`;
      g.fillText(hot.m.label, tx + 8, ty + 12);
      g.fillStyle = '#b8af9e';
      g.font = `11px ${FONT}`;
      g.fillText(line2, tx + 8, ty + 27);
    }

    this.updateStatus(step, hv, wx0, wz0, s);
  }

  private drawCompass(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = PANEL;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#4a4237';
    g.stroke();
    g.strokeStyle = 'rgba(232, 226, 214, 0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      if (i % 4 === 0) continue; // cardinal points get letters instead
      const a = (i * Math.PI) / 8;
      const r0 = i % 2 ? r - 4 : r - 7;
      g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
      g.lineTo(cx + Math.sin(a) * (r - 2), cy - Math.cos(a) * (r - 2));
    }
    g.stroke();
    const n = r - 11;
    g.beginPath();
    g.moveTo(cx, cy - n); g.lineTo(cx + 4, cy); g.lineTo(cx - 4, cy); g.closePath();
    g.fillStyle = '#e0533c';
    g.fill();
    g.beginPath();
    g.moveTo(cx, cy + n); g.lineTo(cx + 4, cy); g.lineTo(cx - 4, cy); g.closePath();
    g.fillStyle = '#d8d0c0';
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 10px ${FONT}`;
    g.fillStyle = '#ff7a5c';
    g.fillText('N', cx, cy - r + 6);
    g.fillStyle = '#b8af9e';
    g.font = `bold 9px ${FONT}`;
    g.fillText('S', cx, cy + r - 5);
    g.fillText('E', cx + r - 5, cy + 0.5);
    g.fillText('W', cx - r + 5.5, cy + 0.5);
    g.restore();
  }

  /** Scale bar geometry (bottom right): a round length close to 70-170 screen px. */
  private scaleBar(W: number, H: number) {
    const len = SCALE_STEPS.find((m) => m * this.zoom >= 70) ?? SCALE_STEPS[SCALE_STEPS.length - 1];
    const px = len * this.zoom;
    const x1 = W - 14, x0 = x1 - px, y = H - 16;
    return { len, px, x0, y, rect: { x: x0 - 8, y: y - 20, w: px + 16, h: 30 } };
  }

  private drawScale(g: CanvasRenderingContext2D, sb: ReturnType<MapUI['scaleBar']>) {
    const { len, px, x0, y, rect } = sb;
    g.save();
    g.fillStyle = PANEL;
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.fillStyle = INK;
    g.fillRect(x0 - 1, y - 1, px + 2, 6);
    g.fillStyle = '#e8e2d6';
    g.fillRect(x0, y, px / 2, 4);
    g.fillStyle = '#7d7568';
    g.fillRect(x0 + px / 2, y, px / 2, 4);
    g.font = `11px ${MONO}`;
    g.fillStyle = '#e8e2d6';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText(len >= 1000 ? `${len / 1000} km` : `${len} m`, x0 + px / 2, y - 3);
    g.restore();
  }

  private updateStatus(step: number, hv: { x: number; y: number } | null, wx0: number, wz0: number, s: number) {
    setText(this.status.me, `You  X ${fmt(this.px)}  Z ${fmt(this.pz)}  · facing ${facing(this.yaw)}`);
    let cur = 'Cursor  —';
    if (hv) {
      const bx = Math.floor(wx0 + (hv.x * this.dpr) / s), bz = Math.floor(wz0 + (hv.y * this.dpr) / s);
      const col = this.terrain.columnAt(bx, bz);
      const dist = Math.hypot(bx + 0.5 - this.px, bz + 0.5 - this.pz);
      let what = 'unexplored';
      if (col) {
        what = col.depth > 0
          ? `water, ${col.depth >= 255 ? 'very deep' : `${col.depth} deep`}`
          : `Y ${col.y} ${blockDef(col.plant || col.id).name}`;
      }
      cur = `Cursor  X ${fmt(bx)}  Z ${fmt(bz)}  · ${what} · ${fmt(dist)} m`;
    }
    setText(this.status.cursor, cur);
    const km2 = (this.terrain.exploredChunks * 256) / 1e6;
    setText(this.status.zoom, `${this.zoom}×  · grid ${step} m  · explored ${km2 < 10 ? km2.toFixed(2) : km2.toFixed(1)} km²${this.follow ? '' : '  · Space: centre on me'}`);
  }

  // ------------------------------------------------------------------ minimap
  /** Show or hide the HUD minimap (call every frame; cheap). */
  showMinimap(on: boolean) {
    if (!this.miniBox || on === this.miniVisible) return;
    this.miniVisible = on;
    this.miniBox.classList.toggle('hidden', !on);
    if (on) {
      this.lastMini = -1e9;
      this.miniSig = '';
    }
  }

  /** True when the minimap is visible and due for a redraw (throttled to ~10 Hz). */
  minimapDue(now = performance.now()): boolean {
    return this.miniVisible && !!this.miniG && now - this.lastMini >= MINI_INTERVAL;
  }

  /** Redraw the minimap around the player (north-up). Cheap; skips if nothing changed. */
  minimap(px: number, pz: number, yaw: number) {
    const cv = this.mini, g = this.miniG;
    if (!cv || !g || !this.miniVisible) return;
    const now = performance.now();
    this.lastMini = now;
    this.px = px;
    this.pz = pz;
    this.yaw = yaw;
    if (this.world) this.terrain.pollEdits(this.world, now);
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    const sig = `${Math.round(px * 4)},${Math.round(pz * 4)},${Math.round(yaw * 40)},${this.terrain.version},${this.markerSig},${W}x${H}@${dpr}`;
    if (sig === this.miniSig) return;
    this.miniSig = sig;
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw;
      cv.height = bh;
    }
    const s = MINI_ZOOM * dpr;
    const ox = Math.round(px * s - bw / 2), oz = Math.round(pz * s - bh / 2);
    const toX = (x: number) => (x * s - ox) / dpr;
    const toY = (z: number) => (z * s - oz) / dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, bw, bh);
    g.imageSmoothingEnabled = false;
    this.terrain.draw(g, ox / s, oz / s, s, bw, bh);
    g.imageSmoothingEnabled = true;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // chunk grid, very faint, gives a sense of motion/scale
    g.beginPath();
    const wx0 = ox / s, wz0 = oz / s, wx1 = wx0 + bw / s, wz1 = wz0 + bh / s;
    for (let x = Math.ceil(wx0 / 64) * 64; x <= wx1; x += 64) { const sx = (Math.round(toX(x) * dpr) + 0.5) / dpr; g.moveTo(sx, 0); g.lineTo(sx, H); }
    for (let z = Math.ceil(wz0 / 64) * 64; z <= wz1; z += 64) { const sy = (Math.round(toY(z) * dpr) + 0.5) / dpr; g.moveTo(0, sy); g.lineTo(W, sy); }
    g.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    g.lineWidth = 1 / dpr;
    g.stroke();
    // markers: in range as icons, bags / body out of range as edge pointers
    const sorted = [...this.markers].sort((a, b) => STYLE[b.kind].prio - STYLE[a.kind].prio);
    for (const m of sorted) {
      const sx = toX(m.x), sy = toY(m.z);
      const inside = sx >= 6 && sy >= 6 && sx <= W - 6 && sy <= H - 6;
      if (inside) drawIcon(g, m.kind, sx, sy, STYLE[m.kind].r * 0.8);
      else if (m.kind === 'death' || m.kind === 'bag') {
        const [ex, ey] = edgePoint(W / 2, H / 2, sx, sy, 7, 7, W - 7, H - 7);
        drawPointer(g, ex, ey, Math.atan2(sy - H / 2, sx - W / 2), STYLE[m.kind].color, 5);
      }
    }
    // north marker
    g.font = `bold 11px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = PANEL;
    g.fillRect(W / 2 - 8, 1, 16, 15);
    g.fillStyle = '#e0533c';
    g.fillText('N', W / 2, 9);
    // player
    drawIcon(g, 'player', toX(px), toY(pz), 7, yaw);
    setText(this.miniInfo, `${fmt(px)}, ${fmt(pz)}  ${facing(yaw)}`);
  }
}

