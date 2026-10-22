// World renderer (TECH §3 order):
//   floor (prerendered) → decal props → wall faces (prerendered) → wall-mounted props + open doors
//   → y-sorted floor props & entities → wall tops (prerendered) → `over` props → systems
//   → HW.lighting.render → HW.fx.renderWorld → HW.fx.renderPost
// While the compact shows a past view, the scene is drawn from the clean (1979) layers with the
// view's extra objects/figures, warm light instead of darkness, and the rest of the screen dimmed.
//
// The Colonel's shroud (DESIGN §4.1 "the light dies where he is"): while HW.colonel.shrouded his
// sprite is drawn near-black, and after the lighting pass only single-pixel glints come back — the
// highlight of each brass button / epaulette / ring and the tips of the sash fringe, each winking on
// its own clock — so a moving hole in the light winks with brass (glints, never shapes: whole
// epaulettes and the sash band read as two eyes over a grin).
// An entity with `wallShadow` (0..1) is drawn as that silhouette alone at that alpha, no glints —
// a flat shadow thrown on a wall (ch5 False Leah); delete the field (or set null) to restore it.
//
// Hot path: no per-frame allocation — bucket arrays are reused and art canvases cached per prop.
import HW from '../engine/hw.js';
import { Entity } from '../engine/entities.js';
import { tinyText, hash2 } from '../art/util.js';

const TILE = 16;
const W = 480;
const H = 270;
const NONE = Object.freeze({ canvas: null, ox: 0, oy: 0 }); // cached "art failed" marker
const PAST_TEXT_COLORS = { chalk: '#e8e4d4', fog: '#c4d4e6', ink: '#2a2a33', red: '#c8423b', paper: '#3d342a' };

const bySortKey = (a, b) => a.sortKey - b.sortKey;

/** The Colonel's emissive pixels: 1 brass/gold (warm, saturated), 2 crimson (saturated red), 0 neither. */
function emissiveKind(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 70) return 0;
  const sat = (max - min) / max;
  if (sat < 0.38) return 0;
  let hue;
  if (max === r) hue = ((g - b) / (max - min) + 6) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue *= 60;
  if (hue >= 32 && hue <= 58) return 1;
  if ((hue >= 340 || hue <= 8) && sat > 0.55) return 2;
  return 0;
}

const GLINT_FLOOR = 0.5;    // a brass glint between winks (never fully gone: the hole keeps a few embers)
const FRINGE_FLOOR = 0.65;  // the sash fringe is cloth, not metal: it barely pulses
const GLINT_STAR = 0.75;    // above this a brass wink flares into a tiny 4-point star
const GLINT_HOT = [255, 244, 214]; // a brass highlight is pushed toward warm white (specular, not paint)
/**
 * Two glints too close to both stay: closer than 4 px, or a near-level pair (within an ellipse 24 px
 * across, 6 px up/down) — two level (or gently tilted) sparks in a dark mass read as a pair of eyes
 * (DESIGN §3). The epaulettes, ~40 px apart at the silhouette's corners, both keep theirs.
 */
function glintsClash(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return (Math.abs(dx) < 4 && Math.abs(dy) < 4) || dx * dx / 576 + dy * dy / 36 < 1;
}
/** A glint's brightness at time t: its own rate and phase; a wink (sin²) on half the cycle, its floor on the rest. */
function glintAlpha(t, gl) {
  const v = Math.sin(t * gl.rate + gl.phase);
  return v > 0 ? gl.floor + (1 - gl.floor) * v * v : gl.floor;
}

function blit(ctx, src, cam) {
  let sx = cam.x;
  let sy = cam.y;
  let dx = 0;
  let dy = 0;
  let w = W;
  let h = H;
  if (sx < 0) { dx = -sx; w += sx; sx = 0; }
  if (sy < 0) { dy = -sy; h += sy; sy = 0; }
  w = Math.min(w, src.width - sx);
  h = Math.min(h, src.height - sy);
  if (w > 0 && h > 0) ctx.drawImage(src, sx, sy, w, h, dx, dy, w, h);
}

export const renderer = {
  _decals: [],
  _wall: [],
  _ysort: [],
  _over: [],
  _tall: [],
  _errors: new Set(),
  _shroud: null,                 // the shrouded Colonel entity this frame
  _shroudCache: new WeakMap(),   // sprite frame → { dark, glow }
  // This frame's glints, on a sprite-sized canvas: drawn when he is drawn, then erased wherever a later
  // layer (a desk, Tess, a wall top) covers him, and laid over the world after the lighting pass.
  _glintCv: null,
  _glintCtx: null,
  _glintR: { x: 0, y: 0, w: 0, h: 0, clip: 0 },
  _glintCam: { x: 0, y: 0 },

  render() {
    const ctx = HW.display.worldCtx;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const map = HW.map;
    const mode = HW.game.mode;
    if (!map || mode === 'title' || mode === 'boot') {
      this._post(ctx);
      return;
    }
    const cam = HW.camera.view;
    const past = HW.compact?.active ? HW.compact.current : null;
    const clean = !!past;
    const L = map.getLayers(clean);

    this._bucket(map, cam, past);

    blit(ctx, L.floor, cam);
    try {
      map.drawAnimatedTiles(ctx, cam, clean, HW.time);
    } catch (e) {
      this._once('animated tiles', e);
    }
    const decals = this._decals;
    for (let i = 0; i < decals.length; i++) this._drawProp(ctx, decals[i], cam, clean);
    blit(ctx, L.faces, cam);
    const wall = this._wall;
    for (let i = 0; i < wall.length; i++) this._drawProp(ctx, wall[i], cam, clean);
    if (past) this._drawPastText(ctx, past, cam);

    const ys = this._ysort;
    ys.sort(bySortKey);
    const ghost = past ? 0.55 : 1;
    const shroud = this._shroud;
    const glints = !past && !!shroud && shroud.wallShadow == null && this._glintBegin(shroud, cam);
    let behind = false; // past the shroud in draw order: what follows stands in front of him
    for (let i = 0; i < ys.length; i++) {
      const it = ys[i];
      if (it === shroud || it.wallShadow != null) this._drawShroud(ctx, it, cam, 'dark', null);
      else if (it.kind === 'entity') it.draw(ctx, cam.x, cam.y, it === HW.player ? ghost : 1);
      else this._drawProp(ctx, it, cam, clean);
      if (it === shroud) behind = true;
      else if (behind && glints) this._glintCover(it, clean);
    }

    blit(ctx, L.tops, cam);
    if (glints) this._glintCoverTops(L.tops);
    // Tall sprites (the Colonel) stand in front of north walls: redraw what rises above them.
    // (Not a wall shadow: it lies on the wall face, under the wall tops.)
    const tall = this._tall;
    for (let i = 0; i < tall.length; i++) {
      const e = tall[i];
      if (e.wallShadow != null) continue;
      const clipY = (Math.floor(e.y / TILE) - 2) * TILE - cam.y;
      if (e === shroud) this._drawShroud(ctx, e, cam, 'dark', clipY);
      else e.draw(ctx, cam.x, cam.y, 1, clipY);
    }
    const over = this._over;
    for (let i = 0; i < over.length; i++) {
      this._drawProp(ctx, over[i], cam, clean);
      if (glints) this._glintCover(over[i], clean);
    }

    const systems = HW.game.systems;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (!s.render) continue;
      try {
        s.render(ctx, cam);
      } catch (e) {
        this._once('system.render', e);
      }
    }

    if (past) {
      this._pastLight(ctx, past, cam);
    } else {
      try {
        if (!HW.debug?.fullbright) HW.lighting?.render?.(ctx, cam);
      } catch (e) {
        this._once('lighting.render', e);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (glints) {
        const R = this._glintR;
        ctx.drawImage(this._glintCv, 0, 0, R.w, R.h, R.x, R.y, R.w, R.h);
      }
      try {
        HW.fx?.renderWorld?.(ctx, cam);
      } catch (e) {
        this._once('fx.renderWorld', e);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (HW.debug?.showGrid) this._debugOverlay(ctx, map, cam);
    this._post(ctx);
  },

  _post(ctx) {
    try {
      HW.fx?.renderPost?.(ctx);
    } catch (e) {
      this._once('fx.renderPost', e);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  /** Sort visible props/entities into the per-layer buckets. */
  _bucket(map, cam, past) {
    const decals = this._decals;
    const wall = this._wall;
    const ys = this._ysort;
    const over = this._over;
    const tall = this._tall;
    decals.length = 0;
    wall.length = 0;
    ys.length = 0;
    over.length = 0;
    tall.length = 0;
    const vx0 = cam.x - 32;
    const vx1 = cam.x + W + 32;
    const vy0 = cam.y - 16;
    const vy1 = cam.y + H + 80; // tall art extends upward from its footprint
    // The past view also shows the map's own `pastOnly` objects (hidden from the present).
    const props = past ? map.allProps : map.props;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (past && (!p.present || p.hideInPast || past.hideSet.has(p.id))) continue;
      this._add(p, cam);
    }
    if (past) {
      for (const p of map.pastObjects(past)) this._add(p, cam);
      for (const f of this._figures(past)) { f.animTime = HW.time; ys.push(f); }
      const pl = HW.player;
      if (pl && pl.visible) ys.push(pl);
      return;
    }
    const col = HW.colonel;
    this._shroud = col && col.shrouded ? (col.entity || HW.entities.get('colonel')) : null;
    const ents = HW.entities.list;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.visible) continue;
      if (e.x < vx0 - 32 || e.x > vx1 + 32 || e.y < vy0 || e.y > vy1 + 64) continue;
      ys.push(e);
      if (e.tall) tall.push(e);
    }
  },

  _add(p, cam) {
    const x0 = p.x * TILE;
    const y0 = p.y * TILE;
    if (x0 + p.w * TILE < cam.x - 32 || x0 > cam.x + W + 32 || y0 + p.h * TILE < cam.y - 16 || y0 > cam.y + H + 80) return;
    const m = p.mount;
    if (m === 'decal') this._decals.push(p);
    else if (m === 'wall') this._wall.push(p);
    else if (m === 'over') this._over.push(p);
    else if (p.state === 'open' && p.def.interact === 'door') this._wall.push(p); // walk "through" open doors
    else this._ysort.push(p);
  },

  /** Art for a static prop (cached on the prop; animated props cache each frame). */
  _propImage(p, clean) {
    const frames = p.def.frames || 1;
    if (frames > 1) {
      const f = Math.floor(HW.time * (p.def.fps || 4)) % frames;
      const key = clean ? '_framesClean' : '_frames';
      const arr = p[key] || (p[key] = new Array(frames).fill(null));
      return arr[f] || (arr[f] = this._art(p, clean, f));
    }
    const key = clean ? '_imgClean' : '_img';
    return p[key] || (p[key] = this._art(p, clean, 0));
  },

  _art(p, clean, frame) {
    try {
      const r = HW.art.prop(p.type, {
        state: p.state, dir: p.dir, variant: p.variant, clean, frame, occupant: p.params.occupant, params: p.params,
        sitDir: p.inst?.sitDir || p.params.sitDir || p.def.sitDir, label: p.params.label,
      });
      if (r && r.canvas) {
        p.promptY = p.y * TILE + Math.min(0, r.oy || 0) - 2;
        return r;
      }
    } catch (e) {
      this._once(`art.prop ${p.type}`, e);
    }
    return NONE;
  },

  _drawProp(ctx, p, cam, clean) {
    if (p.def.dynamic) {
      const params = clean ? (p._dparamsClean && p._dparamsClean.base === p.dparams ? p._dparamsClean : this._cleanParams(p)) : p.dparams;
      try {
        HW.art.drawPropDynamic(ctx, p.type, p.x * TILE - cam.x, p.y * TILE - cam.y, params, HW.time);
      } catch (e) {
        this._once(`art.drawPropDynamic ${p.type}`, e);
      }
      return;
    }
    const img = this._propImage(p, clean);
    if (!img.canvas) return;
    ctx.drawImage(img.canvas, p.x * TILE + img.ox - cam.x, p.y * TILE + img.oy - cam.y);
  },

  _cleanParams(p) {
    p._dparamsClean = { ...p.dparams, clean: true, base: p.dparams };
    return p._dparamsClean;
  },

  // ---------------------------------------------------------------------------------- shroud
  /**
   * Draw an entity's current frame as its shroud silhouette ('dark') or its glints ('glow').
   * The silhouette is drawn at the entity's `wallShadow` alpha when it has one.
   */
  _drawShroud(ctx, e, cam, layer, clipY) {
    const sheet = e.sheet;
    const img = sheet && e.visible ? e.frameImage() : null;
    if (!img) return;
    const s = this._shroudOf(img);
    const dx = Math.round(e.x) - cam.x - sheet.ax;
    const dy = Math.round(e.y) - cam.y - sheet.ay;
    if (layer === 'glow') {
      if (s.glow) this._drawGlints(ctx, s.glow, dx, dy);
      return;
    }
    const alpha = e.wallShadow != null ? Math.max(0, Math.min(1, +e.wallShadow || 0)) : 1;
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    if (clipY !== null) {
      const h = Math.min(img.height, clipY - dy);
      if (h > 0) ctx.drawImage(s.dark, 0, 0, img.width, h, dx, dy, img.width, h);
    } else {
      ctx.drawImage(s.dark, dx, dy);
    }
    ctx.globalAlpha = 1;
  },

  /** Draw a frame's glints at (dx, dy), each at its own wink brightness for HW.time. */
  _drawGlints(ctx, gl, dx, dy) {
    const t = HW.time;
    for (let i = 0; i < gl.length; i++) {
      const g = gl[i];
      const a = glintAlpha(t, g);
      const x = dx + g.x;
      const y = dy + g.y;
      ctx.fillStyle = g.css;
      ctx.globalAlpha = g.a * a;
      ctx.fillRect(x, y, 1, 1);
      if (g.star && a > GLINT_STAR) {
        ctx.globalAlpha = g.a * (a - GLINT_STAR) * 1.3;
        ctx.fillRect(x - 1, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  },

  /** Start this frame's glint layer for the shrouded entity (false: nothing to glint). */
  _glintBegin(e, cam) {
    const sheet = e.sheet;
    const img = sheet && e.visible ? e.frameImage() : null;
    if (!img) return false;
    const s = this._shroudOf(img);
    if (!s.glow) return false;
    const w = img.width;
    const h = img.height;
    let cv = this._glintCv;
    if (!cv || cv.width < w || cv.height < h) {
      cv = this._glintCv = document.createElement('canvas');
      cv.width = Math.max(w, 64);
      cv.height = Math.max(h, 64);
      this._glintCtx = cv.getContext('2d');
    }
    const g = this._glintCtx;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, cv.width, cv.height);
    const R = this._glintR;
    R.x = Math.round(e.x) - cam.x - sheet.ax;
    R.y = Math.round(e.y) - cam.y - sheet.ay;
    R.w = w;
    R.h = h;
    // The tall pass redraws him over the wall tops above this row; below it the tops cover him.
    R.clip = e.tall ? Math.max(0, (Math.floor(e.y / TILE) - 2) * TILE - cam.y - R.y) : 0;
    this._glintCam.x = cam.x + R.x;
    this._glintCam.y = cam.y + R.y;
    this._drawGlints(g, s.glow, 0, 0);
    g.globalCompositeOperation = 'destination-out'; // from here on, draws erase glints
    return true;
  },

  /** Erase the glints a prop or entity drawn in front of him covers. */
  _glintCover(it, clean) {
    const g = this._glintCtx;
    const c = this._glintCam;
    const R = this._glintR;
    if (it.kind === 'entity') {
      it.draw(g, c.x, c.y, 1);
    } else {
      const px = it.x * TILE - c.x;
      const py = it.y * TILE - c.y;
      if (px > R.w + 16 || px + it.w * TILE < -16 || py - 96 > R.h || py + it.h * TILE < -16) return;
      this._drawProp(g, it, c, clean);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out'; // whatever the art did to the state
  },

  /** Erase the glints the wall tops cover (below the row the tall pass redraws him from). */
  _glintCoverTops(tops) {
    const R = this._glintR;
    const c = this._glintCam;
    let sx = c.x;
    let sy = c.y + R.clip;
    let dx = 0;
    let dy = R.clip;
    let w = R.w;
    let h = R.h - R.clip;
    if (sx < 0) { dx = -sx; w += sx; sx = 0; }
    if (sy < 0) { dy -= sy; h += sy; sy = 0; }
    w = Math.min(w, tops.width - sx);
    h = Math.min(h, tops.height - sy);
    if (w > 0 && h > 0) this._glintCtx.drawImage(tops, sx, sy, w, h, dx, dy, w, h);
  },

  /**
   * Build (once per sprite frame) the near-black silhouette and its glints (DESIGN §4.1: brass buttons,
   * epaulette and ring glints, sash fringe — never whole shapes, which read as eyes over a grin):
   *  - brass: each 8-connected cluster keeps its brightest pixel (its specular highlight), plus a second
   *    one ≥ 4 px away on clusters of 12+ px;
   *  - crimson: the sash band (rows with ≥ 5 crimson px) stays dark; only the tip of each strand that
   *    hangs below it (the tassel fringe) glints;
   *  - brightest first, a glint that clashes with a kept one (glintsClash: too close, or a level pair
   *    that would read as eyes) is dropped.
   * Returns { dark: canvas, glow: [{ x, y, css, a, star, floor, rate, phase }] | null }.
   */
  _shroudOf(img) {
    let s = this._shroudCache.get(img);
    if (s) return s;
    const w = img.width;
    const h = img.height;
    const n = w * h;
    const dark = document.createElement('canvas');
    dark.width = w;
    dark.height = h;
    const dctx = dark.getContext('2d');
    dctx.drawImage(img, 0, 0);
    const src = dctx.getImageData(0, 0, w, h); // once per frame image (cached), never per tick
    const d = src.data;
    const kind = new Uint8Array(n);
    const lum = new Float32Array(n);
    const rowC = new Uint16Array(h);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      if (!d[i + 3]) continue;
      const k = emissiveKind(d[i], d[i + 1], d[i + 2]);
      if (!k) continue;
      kind[p] = k;
      lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (k === 2) rowC[(p / w) | 0]++;
    }
    // Brass: the highlight of each cluster (8-connected flood fill).
    const cand = [];
    const seen = new Uint8Array(n);
    const stack = [];
    const comp = [];
    for (let p0 = 0; p0 < n; p0++) {
      if (kind[p0] !== 1 || seen[p0]) continue;
      comp.length = 0;
      stack.push(p0);
      seen[p0] = 1;
      while (stack.length) {
        const p = stack.pop();
        comp.push(p);
        const x = p % w;
        const y = (p / w) | 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
            const q = yy * w + xx;
            if (kind[q] === 1 && !seen[q]) { seen[q] = 1; stack.push(q); }
          }
        }
      }
      comp.sort((a, b) => lum[b] - lum[a] || a - b);
      const a0 = comp[0];
      cand.push(a0);
      if (comp.length >= 12) {
        const ax = a0 % w;
        const ay = (a0 / w) | 0;
        const b0 = comp.find((q) => Math.abs((q % w) - ax) + Math.abs(((q / w) | 0) - ay) >= 4);
        if (b0 !== undefined) cand.push(b0);
      }
    }
    // Crimson: only the strand tips hanging below the sash band.
    let bandBot = -1;
    for (let y = 0; y < h; y++) if (rowC[y] >= 5) bandBot = y;
    if (bandBot >= 0) {
      for (let p = (bandBot + 1) * w; p < n; p++) {
        if (kind[p] === 2 && !(p + w < n && kind[p + w] === 2)) cand.push(p);
      }
    }
    // Brightest first; a glint that clashes with a kept one is dropped.
    cand.sort((a, b) => lum[b] - lum[a] || a - b);
    const keep = [];
    for (const p of cand) {
      const x = p % w;
      const y = (p / w) | 0;
      let ok = true;
      // (Fringe tips too: two red points side by side in the narrow mass of a peek read as red eyes.)
      for (const q of keep) if (glintsClash(q % w, (q / w) | 0, x, y)) { ok = false; break; }
      if (ok) keep.push(p);
    }
    const glow = [];
    for (const p of keep) {
      const i = p * 4;
      const x = p % w;
      const y = (p / w) | 0;
      // Rate and phase hash a coarse cell, so a glint keeps its clock while the pose breathes by a pixel.
      const hc = hash2(x >> 3, y >> 3, 0x51ab);
      const brass = kind[p] === 1;
      const m = brass ? 0.4 : 0;
      const c = (j, k) => Math.min(255, Math.round(Math.min(255, d[i + j] * k) * (1 - m) + GLINT_HOT[j] * m));
      glow.push({
        x, y, a: d[i + 3] / 255, star: brass, floor: brass ? GLINT_FLOOR : FRINGE_FLOOR,
        css: `rgb(${c(0, 1.15)},${c(1, 1.15)},${c(2, 1.1)})`,
        rate: 2.2 + 1.6 * ((hc & 1023) / 1023),
        phase: ((hc >>> 10) & 1023) / 1023 * Math.PI * 2,
      });
    }
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (!a) continue;
      d[i] = 7;
      d[i + 1] = 7;
      d[i + 2] = 11;
      d[i + 3] = Math.round(a * 0.96);
    }
    dctx.putImageData(src, 0, 0);
    s = { dark, glow: glow.length ? glow : null };
    this._shroudCache.set(img, s);
    return s;
  },

  // ---------------------------------------------------------------------------------- past view
  /** Figures (and Miss Adair) of a past view as lightweight entities, built once per view. */
  _figures(past) {
    if (!past._figures) {
      const list = (past.figures || []).map((f, i) => new Entity({
        id: `${past.id}_fig${i}`, sprite: f.sprite || 'figure79', x: f.x * TILE + 8, y: f.y * TILE + 12, dir: f.dir || 'down', anim: f.anim,
      }));
      if (past.adair) {
        const a = past.adair;
        list.push(new Entity({ id: `${past.id}_adair`, sprite: 'adair', x: a.x * TILE + 8, y: a.y * TILE + 12, dir: a.dir || 'down', anim: a.anim }));
      }
      for (const e of list) {
        e.updateAnim(0);
        // Seated figures sit "in" their desk: draw them after it.
        if (/^sit/.test(e.animName || '')) e.sortBias = 5;
        e.sortKey = e.y + e.sortBias;
      }
      past._figures = list;
    }
    return past._figures;
  },

  _drawPastText(ctx, past, cam) {
    if (!past.text) return;
    for (const t of past.text) {
      tinyText(ctx, t.x * TILE - cam.x + (t.dx || 0), t.y * TILE - cam.y + (t.dy || 4), t.text, t.color || PAST_TEXT_COLORS[t.style] || PAST_TEXT_COLORS.chalk);
    }
  },

  /** Warm daylight inside the past rect; everything else sinks into shadow. */
  _pastLight(ctx, past, cam) {
    const [rx, ry, rw, rh] = past.rect;
    // The room's own north wall faces (chalkboards, clocks, mirrors) belong to the memory too.
    if (past._faceRows === undefined) {
      const map = HW.map;
      past._faceRows = 0;
      for (let x = rx; x < rx + rw; x++) {
        if (map.wallKind(x, ry - 1) === 'face_low') { past._faceRows = map.wallKind(x, ry - 2) === 'face_high' ? 2 : 1; break; }
      }
    }
    const x0 = rx * TILE - cam.x;
    const y0 = (ry - past._faceRows) * TILE - cam.y;
    const x1 = x0 + rw * TILE;
    const y1 = (ry + rh) * TILE - cam.y;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255, 196, 120, 0.55)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255, 214, 160, 0.08)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = 'rgba(4, 4, 8, 0.8)';
    if (y0 > 0) ctx.fillRect(0, 0, W, y0);
    if (y1 < H) ctx.fillRect(0, y1, W, H - y1);
    ctx.fillRect(0, Math.max(0, y0), Math.max(0, x0), Math.min(H, y1) - Math.max(0, y0));
    ctx.fillRect(x1, Math.max(0, y0), W - x1, Math.min(H, y1) - Math.max(0, y0));
  },

  // ---------------------------------------------------------------------------------- misc
  /** Portrait lighting for dialogue (TECH §6.1 say opts.light default). */
  portraitLight() {
    if (HW.periods?.active) return 'fluor';
    const id = HW.map?.id;
    if (id === 'breaker') return 'red';
    if (id === 'exterior' && HW.state?.flags?.dawn) return 'dawn';
    return 'dark';
  },

  /** F3: collision/opacity grid, exits, triggers, rooms and the autopilot path. */
  _debugOverlay(ctx, map, cam) {
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(map.w - 1, Math.ceil((cam.x + W) / TILE));
    const y1 = Math.min(map.h - 1, Math.ceil((cam.y + H) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const sx = x * TILE - cam.x;
        const sy = y * TILE - cam.y;
        if (map.isSolid(x, y)) { ctx.fillStyle = 'rgba(255,40,40,0.18)'; ctx.fillRect(sx, sy, TILE, TILE); }
        if (map.isOpaque(x, y)) { ctx.fillStyle = 'rgba(60,120,255,0.35)'; ctx.fillRect(sx, sy, TILE, 2); }
      }
    }
    const rect = (r, color) => {
      ctx.strokeStyle = color;
      ctx.strokeRect(r[0] * TILE - cam.x + 0.5, r[1] * TILE - cam.y + 0.5, r[2] * TILE - 1, r[3] * TILE - 1);
    };
    for (const e of map.exits) rect(e.rect, '#3f3');
    for (const t of map.triggers) rect(t.rect, '#ff3');
    for (const pe of map.past) rect(pe.rect, '#f9f');
    for (const r of map.rooms) {
      rect(r.rect, 'rgba(255,255,255,0.25)');
      tinyText(ctx, r.rect[0] * TILE - cam.x + 2, r.rect[1] * TILE - cam.y + 2, r.id.slice(0, 16), '#fff');
    }
    const p = HW.player;
    if (p) {
      ctx.fillStyle = 'rgba(0,255,255,0.6)';
      ctx.fillRect(Math.round(p.x) - 5 - cam.x, Math.round(p.y) - 4 - cam.y, 10, 6);
    }
    const ap = HW.debug?.autopilotPath;
    if (ap) {
      ctx.fillStyle = '#0ff';
      for (const [x, y] of ap) ctx.fillRect(Math.round(x) - 1 - cam.x, Math.round(y) - 1 - cam.y, 3, 3);
    }
    tinyText(ctx, 2, 2, `${map.id} ${HW.game.mode} ${HW.game.fps}FPS`, '#0f0');
  },

  _once(where, e) {
    const key = `${where}: ${e?.message || e}`;
    if (this._errors.has(key)) return;
    this._errors.add(key);
    console.error(`[renderer] ${where} failed:`, e);
  },
};

export default renderer;
