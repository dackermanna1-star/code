// Automap (port of am_map.c): vector map of the lines the player has seen,
// drawn fullscreen on black or as an overlay on the 3D view ('O'). Keys
// while open: F follow, G grid, M mark, C clear marks, 0 max zoom,
// =/- or the mouse wheel to zoom, arrows to pan when not following.

import { ML } from '../game/mapdata.js';
import { PW, MF } from '../game/defs.js';
import { STRINGS } from '../game/data.js';
import { DoomFont } from './font.js';
import { LineMapper } from './am-mapper.js';
import { huText, huWidth } from './f-text.js';
import {
  REDS, REDRANGE, GRAYS, BROWNS, YELLOWS, GREENS, WHITE,
  GRIDCOLORS, XHAIRCOLORS, PLAYER_ARROW, CHEAT_PLAYER_ARROW, THINTRIANGLE_GUY, KEY_COLORS,
} from './am-data.js';

const PLAYERRADIUS = 16;
const MAPBLOCKUNITS = 128;
const AM_NUMMARKPOINTS = 10;
const F_PANINC = 4; // virtual pixels per tic
const M_ZOOMIN = 1.02; // per tic while held
const WHEEL_ZOOM = 1.25;
const INITSCALE = 0.7;

const ZOOM_IN_KEYS = new Set(['Equal', 'NumpadAdd']);
const ZOOM_OUT_KEYS = new Set(['Minus', 'NumpadSubtract']);
const PAN_KEYS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

const lerp = (a, b, t) => a + (b - a) * t;

export class Automap {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.fullscreen = true;
    this.followplayer = true;
    this.grid = false;
    this.cheating = 0;
    this.bigstate = false;
    this.world = null;
    this.mapper = new LineMapper();
    this.font = new DoomFont(app.res);
    this.marks = new Array(AM_NUMMARKPOINTS).fill(null);
    this.markpointnum = 0;
    this.scale = 0.2; // virtual pixels per map unit
    this.cx = 0;
    this.cy = 0;
    this.held = new Set();
    this.lastMapKey = null;
    this.attachListeners();
  }

  attachListeners() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => this.held.add(e.code));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    const canvas = this.app.canvas;
    if (canvas) {
      // Registered after Input's handler: zoom instead of switching weapons.
      canvas.addEventListener('wheel', (e) => {
        if (!this.isOpen()) return;
        const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
        if (this.app.input) this.app.input.pressedQueue.delete(code);
        this.zoomBy(e.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM);
      }, { passive: true });
    }
  }

  isOpen() {
    return this.active && this.app.game.state === 'level' && !(this.app.menu && this.app.menu.active);
  }

  player() { return this.app.game.player; }

  // --- Level setup -----------------------------------------------------------

  reset(w) {
    this.world = w;
    this.active = false;
    this.bigstate = false;
    this.mapper.reset(w);
    const key = w ? `${w.episode}:${w.map}:${w.mapName}` : null;
    if (key !== this.lastMapKey) {
      this.lastMapKey = key;
      this.levelInit();
    }
  }

  // AM_LevelInit: bounds and the starting zoom.
  levelInit() {
    this.clearMarks();
    const w = this.world;
    if (!w) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const v of w.level.vertices) {
      if (v.x < minx) minx = v.x;
      if (v.x > maxx) maxx = v.x;
      if (v.y < miny) miny = v.y;
      if (v.y > maxy) maxy = v.y;
    }
    this.bounds = { minx, miny, maxx, maxy, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
    this.scale = this.minScale() / INITSCALE;
    if (this.scale > this.maxScale()) this.scale = this.minScale();
  }

  // Map window size in virtual pixels.
  windowSize() {
    const r = this.app.renderer;
    let rect = this.lastRect;
    if (!rect && this.app.view) rect = this.app.view.viewRect(this.app.settings.get('hud'));
    if (!rect) return { fw: 320, fh: 168 };
    return { fw: rect.w / r.vScaleX, fh: rect.h / r.vScaleY };
  }

  minScale() {
    const b = this.bounds;
    if (!b) return 0.2;
    const { fw, fh } = this.windowSize();
    return Math.min(fw / b.w, fh / b.h);
  }

  maxScale() { return this.windowSize().fh / (2 * PLAYERRADIUS); }

  clampScale() {
    const lo = this.minScale(), hi = this.maxScale();
    if (this.scale < lo) this.scale = lo;
    else if (this.scale > hi) this.scale = hi;
  }

  // --- Open / close ------------------------------------------------------------

  toggle() {
    if (this.active) {
      this.active = false;
      this.bigstate = false;
      return;
    }
    if (!this.world) return;
    this.active = true;
    const mo = this.player() && this.player().mo;
    if (mo) {
      this.cx = mo.x;
      this.cy = mo.y;
    }
  }

  // iddt: 0 -> all lines -> all lines and things -> off.
  cycleCheat() {
    this.cheating = (this.cheating + 1) % 3;
    return this.cheating;
  }

  // --- Marks -------------------------------------------------------------------

  clearMarks() {
    this.marks.fill(null);
    this.markpointnum = 0;
  }

  addMark() {
    this.marks[this.markpointnum] = { x: this.cx, y: this.cy };
    this.markpointnum = (this.markpointnum + 1) % AM_NUMMARKPOINTS;
  }

  // --- Input ---------------------------------------------------------------------

  message(text) {
    const p = this.player();
    if (p) p.message = text;
  }

  // Keeps a consumed key from also driving the player.
  swallow(code) {
    const inp = this.app.input;
    if (!inp) return;
    inp.down.delete(code);
    inp.pressedQueue.delete(code);
  }

  responder(code, e) {
    if (!this.active) return false;
    if (PAN_KEYS[code]) {
      if (this.followplayer) return false;
      this.swallow(code);
      return true;
    }
    if (ZOOM_IN_KEYS.has(code) || ZOOM_OUT_KEYS.has(code)) return true;
    if (e && e.repeat) return ['KeyF', 'KeyG', 'KeyM', 'KeyC', 'KeyO', 'Digit0'].includes(code);
    switch (code) {
      case 'KeyF':
        this.followplayer = !this.followplayer;
        this.message(this.followplayer ? STRINGS.AMSTR_FOLLOWON : STRINGS.AMSTR_FOLLOWOFF);
        return true;
      case 'KeyG':
        this.grid = !this.grid;
        this.message(this.grid ? STRINGS.AMSTR_GRIDON : STRINGS.AMSTR_GRIDOFF);
        return true;
      case 'KeyM':
        this.message(`${STRINGS.AMSTR_MARKEDSPOT} ${this.markpointnum}`);
        this.addMark();
        return true;
      case 'KeyC':
        this.swallow(code);
        this.clearMarks();
        this.message(STRINGS.AMSTR_MARKSCLEARED);
        return true;
      case 'KeyO':
        this.fullscreen = !this.fullscreen;
        this.message(this.fullscreen ? 'Overlay Mode OFF' : 'Overlay Mode ON');
        return true;
      case 'Digit0':
        this.bigstate = !this.bigstate;
        if (this.bigstate) {
          this.saved = { scale: this.scale, cx: this.cx, cy: this.cy };
          this.scale = this.minScale();
          const b = this.bounds;
          if (b && !this.followplayer) { this.cx = b.minx + b.w / 2; this.cy = b.miny + b.h / 2; }
        } else if (this.saved) {
          this.scale = this.saved.scale;
          if (!this.followplayer) { this.cx = this.saved.cx; this.cy = this.saved.cy; }
        }
        return true;
      default:
        return false;
    }
  }

  zoomBy(f) {
    this.scale *= f;
    this.clampScale();
  }

  // --- Per tic / per frame ---------------------------------------------------------

  // Horizontal half-FOV tangent of the 3D view, for line mapping.
  viewHalfTan() {
    const r = this.app.renderer;
    const fov = (this.app.settings.get('fov') || 90) * Math.PI / 180;
    const width43 = r.H * (4 / 3) * (r.stretch || 1);
    return Math.tan(fov / 2) * Math.max(1, r.W / width43) * 1.05;
  }

  tick() {
    const p = this.player();
    if (this.world && p && p.mo) this.mapper.tick(p, this.viewHalfTan());
    if (!this.active) return;
    let zoom = 0;
    for (const k of ZOOM_IN_KEYS) if (this.held.has(k)) zoom = 1;
    for (const k of ZOOM_OUT_KEYS) if (this.held.has(k)) zoom = -1;
    if (zoom) this.zoomBy(zoom > 0 ? M_ZOOMIN : 1 / M_ZOOMIN);
    if (!this.followplayer) {
      let px = 0, py = 0;
      for (const [k, d] of Object.entries(PAN_KEYS)) {
        if (this.held.has(k)) { px += d[0]; py += d[1]; }
      }
      if (px || py) {
        this.cx += (px * F_PANINC) / this.scale;
        this.cy += (py * F_PANINC) / this.scale;
        const b = this.bounds;
        if (b) {
          this.cx = Math.max(b.minx, Math.min(b.maxx, this.cx));
          this.cy = Math.max(b.miny, Math.min(b.maxy, this.cy));
        }
      }
    }
    this.follow();
  }

  follow() {
    if (!this.active || !this.followplayer) return;
    const mo = this.player() && this.player().mo;
    if (!mo) return;
    this.cx = mo.x;
    this.cy = mo.y;
  }

  // --- Drawing ----------------------------------------------------------------------

  draw(r, rect, frac = 1) {
    const w = this.world;
    const p = this.player();
    if (!w || !p) return;
    const firstRect = !this.lastRect;
    this.lastRect = rect;
    if (firstRect) this.clampScale();
    const mo = p.mo;
    let cx = this.cx, cy = this.cy;
    if (this.followplayer && mo) {
      cx = lerp(mo.px, mo.x, frac);
      cy = lerp(mo.py, mo.y, frac);
    }
    const sx = this.scale * r.vScaleX, sy = this.scale * r.vScaleY;
    const ox = rect.x + rect.w / 2, oy = rect.y + rect.h / 2;
    const v = this.view = {
      r, sx, sy, cx, cy, ox, oy,
      x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h,
      // Visible map area, for culling.
      mx0: cx - rect.w / 2 / sx, mx1: cx + rect.w / 2 / sx,
      my0: cy - rect.h / 2 / sy, my1: cy + rect.h / 2 / sy,
      thick: Math.max(1, Math.round(r.pixelScale * 0.75)),
    };
    if (this.fullscreen) r.fillRect(rect.x, rect.y, rect.w, rect.h, 0);
    if (this.grid) this.drawGrid(v);
    this.drawWalls(v, p);
    if (mo) {
      const arrow = this.cheating ? CHEAT_PLAYER_ARROW : PLAYER_ARROW;
      this.drawLineCharacter(v, arrow, 1, mo.angle, WHITE, lerp(mo.px, mo.x, frac), lerp(mo.py, mo.y, frac));
    }
    if (this.cheating === 2) this.drawThings(v, frac);
    // AM_drawCrosshair: a single point in the middle of the window.
    r.fillRect(Math.floor(ox), Math.floor(oy), Math.max(1, Math.round(r.vScaleX)), Math.max(1, Math.round(r.vScaleY)), XHAIRCOLORS);
    this.drawObjective(v);
    r.flushUI();
    this.drawMarks(v);
    this.drawInfo(r, rect, p);
    r.flushUI();
    this.view = null;
  }

  // Line in map coordinates, clipped to the window.
  mline(v, ax, ay, bx, by, color) {
    if ((ax < v.mx0 && bx < v.mx0) || (ax > v.mx1 && bx > v.mx1)
      || (ay < v.my0 && by < v.my0) || (ay > v.my1 && by > v.my1)) return;
    const x0 = v.ox + (ax - v.cx) * v.sx, y0 = v.oy - (ay - v.cy) * v.sy;
    const x1 = v.ox + (bx - v.cx) * v.sx, y1 = v.oy - (by - v.cy) * v.sy;
    this.fline(v, x0, y0, x1, y1, color);
  }

  // Thick line in buffer pixels: parallel 1px lines across the minor axis.
  fline(v, x0, y0, x1, y1, color) {
    const t = v.thick;
    if (t === 1) {
      this.clipLine(v, x0, y0, x1, y1, color);
      return;
    }
    const xMajor = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    for (let k = 0; k < t; k++) {
      const o = k - (t - 1) / 2;
      if (xMajor) this.clipLine(v, x0, y0 + o, x1, y1 + o, color);
      else this.clipLine(v, x0 + o, y0, x1 + o, y1, color);
    }
  }

  // Cohen-Sutherland against the window (AM_clipMline).
  clipLine(v, x0, y0, x1, y1, color) {
    const code = (x, y) => (x < v.x0 ? 1 : x > v.x1 ? 2 : 0) | (y < v.y0 ? 4 : y > v.y1 ? 8 : 0);
    let c0 = code(x0, y0), c1 = code(x1, y1);
    for (let i = 0; i < 4 && (c0 | c1); i++) {
      if (c0 & c1) return;
      const c = c0 || c1;
      let x, y;
      if (c & 8) { x = x0 + (x1 - x0) * (v.y1 - y0) / (y1 - y0); y = v.y1; }
      else if (c & 4) { x = x0 + (x1 - x0) * (v.y0 - y0) / (y1 - y0); y = v.y0; }
      else if (c & 2) { y = y0 + (y1 - y0) * (v.x1 - x0) / (x1 - x0); x = v.x1; }
      else { y = y0 + (y1 - y0) * (v.x0 - x0) / (x1 - x0); x = v.x0; }
      if (c === c0) { x0 = x; y0 = y; c0 = code(x0, y0); } else { x1 = x; y1 = y; c1 = code(x1, y1); }
    }
    if (c0 | c1) return;
    v.r.line(x0, y0, x1, y1, color);
  }

  // Flat-aligned grid on the blockmap origin.
  drawGrid(v) {
    const bm = this.world.level.blockmap;
    const orgx = bm ? bm.originx : 0, orgy = bm ? bm.originy : 0;
    let start = v.mx0 - ((((v.mx0 - orgx) % MAPBLOCKUNITS) + MAPBLOCKUNITS) % MAPBLOCKUNITS);
    for (let x = start; x < v.mx1; x += MAPBLOCKUNITS) this.mline(v, x, v.my0, x, v.my1, GRIDCOLORS);
    start = v.my0 - ((((v.my0 - orgy) % MAPBLOCKUNITS) + MAPBLOCKUNITS) % MAPBLOCKUNITS);
    for (let y = start; y < v.my1; y += MAPBLOCKUNITS) this.mline(v, v.mx0, y, v.mx1, y, GRIDCOLORS);
  }

  // AM_drawWalls: linedef based, coloured by what the line separates.
  drawWalls(v, p) {
    const cheating = this.cheating;
    const allmap = p.powers[PW.ALLMAP];
    for (const line of this.world.level.lines) {
      const a = line.v1, b = line.v2;
      const flags = line.flags;
      if (cheating || (flags & ML.MAPPED)) {
        if ((flags & ML.DONTDRAW) && !cheating) continue;
        const back = line.backsector, front = line.frontsector;
        if (!back || !front) {
          this.mline(v, a.x, a.y, b.x, b.y, REDS);
        } else if (line.special === 39) {
          this.mline(v, a.x, a.y, b.x, b.y, REDS + REDRANGE / 2); // teleporters
        } else if (flags & ML.SECRET) {
          this.mline(v, a.x, a.y, b.x, b.y, REDS); // secret door
        } else if (back.floorheight !== front.floorheight) {
          this.mline(v, a.x, a.y, b.x, b.y, BROWNS); // floor level change
        } else if (back.ceilingheight !== front.ceilingheight) {
          this.mline(v, a.x, a.y, b.x, b.y, YELLOWS); // ceiling level change
        } else if (cheating) {
          this.mline(v, a.x, a.y, b.x, b.y, GRAYS);
        }
      } else if (allmap && !(flags & ML.DONTDRAW)) {
        this.mline(v, a.x, a.y, b.x, b.y, GRAYS + 3);
      }
    }
  }

  // AM_drawLineCharacter: shape in map units, rotated and translated.
  drawLineCharacter(v, shape, scale, angle, color, x, y) {
    const c = Math.cos(angle), s = Math.sin(angle);
    for (const [ax0, ay0, bx0, by0] of shape) {
      const ax = ax0 * scale, ay = ay0 * scale, bx = bx0 * scale, by = by0 * scale;
      this.mline(v, x + ax * c - ay * s, y + ax * s + ay * c, x + bx * c - by * s, y + bx * s + by * c, color);
    }
  }

  drawThings(v, frac) {
    for (const t of this.world.mobjs) {
      if (t.removed || (t.flags & MF.NOSECTOR)) continue;
      const x = lerp(t.px, t.x, frac), y = lerp(t.py, t.y, frac);
      if (x < v.mx0 - 16 || x > v.mx1 + 16 || y < v.my0 - 16 || y > v.my1 + 16) continue;
      const color = KEY_COLORS.get(t.info && t.info.doomednum) ?? GREENS;
      this.drawLineCharacter(v, THINTRIANGLE_GUY, 16, t.angle, color, x, y);
    }
  }

  // Chinatown: the current objective's spot, a blinking diamond (fixed
  // screen size at any zoom).
  drawObjective(v) {
    const w = this.world;
    const info = w && w.ct ? w.ct.hud() : null;
    const m = info && info.marker;
    if (!m) return;
    const clock = this.app.hud ? this.app.hud.clock : 0;
    if (clock & 16) return;
    const k = 7 / this.scale; // 7 virtual pixels in map units
    const pts = [[m.x + k, m.y], [m.x, m.y + k], [m.x - k, m.y], [m.x, m.y - k]];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4];
      this.mline(v, ax, ay, bx, by, YELLOWS);
    }
    this.mline(v, m.x - k / 2, m.y, m.x + k / 2, m.y, YELLOWS);
    this.mline(v, m.x, m.y - k / 2, m.x, m.y + k / 2, YELLOWS);
  }

  // AMMNUM digits where marks were placed, only when fully inside.
  drawMarks(v) {
    const r = v.r;
    for (let i = 0; i < AM_NUMMARKPOINTS; i++) {
      const m = this.marks[i];
      if (!m) continue;
      const fx = v.ox + (m.x - v.cx) * v.sx, fy = v.oy - (m.y - v.cy) * v.sy;
      const w = 5 * r.vScaleX, h = 6 * r.vScaleY;
      if (fx < v.x0 || fx > v.x1 - w || fy < v.y0 || fy > v.y1 - h) continue;
      r.drawPatch(`AMMNUM${i}`, (fx - r.vLeft) / r.vScaleX, fy / r.vScaleY);
    }
  }

  // Level stats in the top right corner (the HUD draws the level title, as
  // hu_stuff.c does in vanilla).
  drawInfo(r, rect, p) {
    const w = this.world;
    const secs = Math.floor(w.leveltime / 35);
    const hours = Math.floor(secs / 3600);
    const mm = String(Math.floor(secs / 60) % 60).padStart(hours ? 2 : 1, '0');
    const time = `${hours ? `${hours}:` : ''}${mm}:${String(secs % 60).padStart(2, '0')}`;
    const rows = [
      ['KILLS', `${p.killcount}/${w.totalkills}`],
      ['ITEMS', `${p.itemcount}/${w.totalitems}`],
      ['SECRETS', `${p.secretcount}/${w.totalsecret}`],
      ['TIME', time],
    ];
    const right = 320 + r.vLeft / r.vScaleX - 2;
    const top = rect.y / r.vScaleY + 1;
    rows.forEach(([label, value], i) => {
      const y = top + i * 9;
      const vx = right - huWidth(this.font, value);
      huText(r, this.font, value, vx, y);
      huText(r, this.font, label, vx - 4 - huWidth(this.font, label), y, { trans: 1 });
    });
  }
}
