// Lighting (TECH §8) — HW.lighting.
//
// Each frame a half-resolution LIGHTMAP is built and multiplied over the 480×270 world buffer:
//   ambient fill (map.data.dark / ambient, setAmbient) → moonlight shafts from face windows (with
//   rain running down the glass) → every visible light (cached sprites: gradient clipped to its
//   visibility polygon) → the flashlight cone + Tess's self-glow (rebuilt per frame) → lightning.
// After the multiply, additive passes add what multiply cannot: a faint haze in the beam, glow
// halos on visible fixtures and dust motes glinting in the cone.
//
// Shadows follow the 3/4 view (see lighting_shadow.js): wall faces receive light from the south,
// tops and void stay dark, nothing passes north through a wall. Static lights cache their polygon
// and sprite until map.opaqueVersion changes; only moving lights and the flashlight are rebuilt.
//
// The lightmap is aligned to even world coordinates so cached light sprites land on whole lightmap
// pixels whatever the camera does — no shimmer while scrolling.
import HW from '../engine/hw.js';
import { LIGHT_COLORS, hexToRgb } from '../art/palette.js';
import { classifyCells, buildSegments, nudgeOrigin, VisibilitySolver, pointInPoly, tracePoly } from './lighting_shadow.js';
import {
  presetOf, flickerAt, makeStutterOn, makeFluorOff, makeFade, makeBang, transitionLevel,
  falloff, falloffTube, CONE, hashStr, hash1, noise1,
} from './lighting_presets.js';
import { canvas, coneTexture, glowSprite, lightGradient, rainMask, rgbStr } from './lighting_tex.js';

const TILE = 16;
const W = 480;
const H = 270;
const K = 0.5;                       // lightmap scale (half resolution, smoothly upscaled)
const LW = W * K + 1;                // +1 lightmap px so even-aligned origins always cover the view
const LH = Math.ceil(H * K) + 1;
const BLEED = 2;                     // px light bleeds into occluder edges
const MAX_POLY = 4096;

const FL_RADIUS = 130;               // flashlight throw at full power (px)
const FL_HAZE = 0.075;               // additive in-air haze of the beam
const SELF_RADIUS = 25;              // Tess's self-glow (px)
const SELF_LEVEL = 0.36;
const SPILL_RADIUS = 44;             // flashlight back-spill circle (px)
const SHROUD_RANGE = 3.5 * TILE;     // period lights die within this of the shrouded Colonel
const SHROUD_RECOVER = 1;            // s after he has passed
const MOTES = 44;

const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
const mod2 = (v) => ((Math.round(v) % 2) + 2) % 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const reduceFlashing = () => !!HW.settings?.get?.('reduceFlashing');

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
/** A light's own switch when its def doesn't say: period lights start dark, everything else lit. */
const defaultOn = (d) => (d.on ?? d.group !== 'period');

/** Radius in px: def/preset tiles; flashlight-type cones shrink with power like Tess's. */
function radiusPx(L) {
  const base = (L.radius ?? L._P.radius) * TILE;
  const p = L.type === 'flashlight' && L.radius === undefined && L.power !== undefined ? 0.55 + 0.45 * clamp01(L.power) : 1;
  return Math.max(4, base * p);
}

/** Lightning envelope e seconds after a strike (0 when done). */
function lightningEnv(e, reduce) {
  if (e < 0) return 0;
  if (reduce) {
    if (e < 0.14) return 0.45 * (e / 0.14);
    return 0.45 * Math.exp(-(e - 0.14) / 0.45);
  }
  if (e < 0.06) return 1;
  if (e < 0.12) return 0.28;
  if (e < 0.2) return 0.9;
  return 0.9 * Math.exp(-(e - 0.2) / 0.3) + 0.12 * Math.exp(-(e - 0.2) / 1.4);
}

export class LightingSystem {
  constructor() {
    /** Set every frame by game/flashlight.js. Optional extras: cone (deg), color (hex). */
    this.flashlight = { on: false, x: 0, y: 0, angle: Math.PI / 2, power: 1, flicker: 0 };
    /** Small soft light that keeps Tess readable in total darkness (follows the flashlight x,y). */
    this.selfGlow = { on: true, x: 0, y: 0, radius: SELF_RADIUS, intensity: SELF_LEVEL };
    /** Current ambient: darkness level 0..1 (1 = black) and tint. */
    this.ambient = { color: '#0b1020', level: 0.9 };
    this.stats = { ms: 0, avg: 0, lights: 0, rebuilt: 0, segs: 0 };

    this.t = 0;
    this._map = null;
    this._grid = null;
    this._segs = new Float32Array(0);
    this._segVer = 0;
    this._opaqueVer = -1;
    this._lightsVer = -1;
    this._mapLights = [];
    this._dyn = [];
    this._all = [];
    this._groups = new Map();
    this._ambRGB = [0, 0, 0];
    this._ambFrom = null;
    this._ambTo = null;
    this._ambT = 0;
    this._ambDur = 0;
    this._override = null;
    this._ltStart = -1e9;
    this._ltStrength = 0;
    this._ltEnv = 0;
    this._sfxBudget = 0;
    this._flR = FL_RADIUS;
    this._flI = 1;
    this._flHalf = (55 * Math.PI) / 360;
    this._shafts = null;
    this._moonLevel = 0;

    this._solver = null;
    this._lm = null;
    this._flPoly = new Float32Array(MAX_POLY * 2);
    this._flN = 0;
    this._smallPoly = new Float32Array(MAX_POLY * 2);
    this._smallN = 0;
    this._tmpPoly = new Float32Array(MAX_POLY * 2);
    this._nudge = { x: 0, y: 0 };
    this._windows = [];
    this._moon = null;
    this._moonDirty = true;
    this._moonScratch = null;
    this._rainPat = null;
    this._motes = new Float32Array(MOTES * 4); // x, y, phase, speed
    this._motesInit = false;
    this._moteRand = 0x2545f491;
    this._moteStyles = [];
    this._frameMs = [];
  }

  // ============================================================================ lifecycle
  init() {
    if (this._lm) return;
    this._solver = new VisibilitySolver();
    this._lm = canvas(LW, LH);
    this._lmCtx = this._lm.getContext('2d');
    this._moonScratch = canvas(LW, LH);
    this._moonScratchCtx = this._moonScratch.getContext('2d');
    this._rainPat = this._moonScratchCtx.createPattern(rainMask(), 'repeat');
    for (let i = 0; i < 16; i++) this._moteStyles.push(`rgba(255,238,206,${((i + 1) / 16).toFixed(3)})`);
    this._flTex = null;
    this._flTexKey = '';
  }

  onMapLoad(map) {
    this.init();
    this._map = map || null;
    this._override = null;
    this._ambFrom = this._ambTo = null;
    this._ltStart = -1e9;
    this._motesInit = false;
    if (!map) { this._mapLights = []; this._rebuildAll(); return; }
    this._applyAmbient(map.data?.ambient ?? '#0b1020', map.data?.dark ?? 0.9, 0);
    this._rebuildGeometry(map);
    this._lightsVer = map.lightsVersion ?? 0;
    this._syncMapLights(map, true);
  }

  /** Engine hook (map.js): prop light states changed (lamp switched off, sign died, ...). */
  onLightsChanged(map) {
    if (map && map === this._map) {
      this._lightsVer = map.lightsVersion ?? this._lightsVer;
      this._syncMapLights(map, false);
    }
  }

  // ============================================================================ public API
  /** Override the ambient: level = darkness 0..1 (like map.dark). color null keeps the tint. */
  setAmbient(color, level, time = 0.8) {
    const c = color || this._override?.color || this.ambient.color;
    const l = level ?? this._override?.level ?? this.ambient.level;
    this._override = { color: c, level: l };
    this._applyAmbient(c, l, time);
  }

  /**
   * Switch a light group on/off with a transition. on = null clears the explicit state (lights fall
   * back to their own defaults). opts: { mode: 'stutter'|'fade'|'bang'|'instant', stagger, delay }.
   */
  setGroup(group, on, opts = {}) {
    if (on === null || on === undefined) this._groups.delete(group);
    else this._groups.set(group, !!on);
    const stagger = opts.stagger ?? (opts.mode === 'bang' ? 0 : 0.35);
    let n = 0;
    for (const L of this._all) {
      if (L.group !== group) continue;
      const delay = (opts.delay || 0) + stagger * hash1(n++, L._seed);
      this._retarget(L, false, opts.mode, delay);
    }
  }

  /** Is a group currently switched on? */
  groupOn(group) {
    return this._groups.has(group) ? this._groups.get(group) : group !== 'period';
  }

  /**
   * Add a dynamic light (survives map loads until removed; def.map scopes it to one map id).
   * def: { type, x, y (tiles) | px, py (world px), radius (tiles), color, intensity, angle | dir,
   *        group, on, flicker, shadows, cone (deg), power (cones), entity }
   * Returns the live light object: mutate x/y or px/py, angle, on, intensity, power freely.
   */
  addLight(def) {
    this.init();
    const L = this._makeLight({ ...def }, true);
    this._dyn.push(L);
    this._rebuildAll();
    return L;
  }

  removeLight(light) {
    const i = this._dyn.indexOf(light);
    if (i >= 0) {
      this._dyn.splice(i, 1);
      this._rebuildAll();
    }
  }

  /** Lightning: flash through the windows + a global lift, then afterglow. */
  lightning(strength = 1) {
    this._ltStart = this.t;
    this._ltStrength = Math.max(0, strength);
  }

  /** How lit a world point is, 0..1 (consistent with what is drawn; excludes Tess's self-glow). */
  lightAt(x, y) {
    let v = lum(this._ambRGB);
    for (const L of this._all) {
      if (L._cur <= 0.003 || !this._activeOn(L)) continue;
      const k = L._P.kind;
      if (k === 'ambient') { v += L._cur * lum(L._rgb); continue; }
      if (k === 'shaft') continue;
      const r = L._r;
      const dx = x - L.px;
      const dy = y - L.py;
      if (dx * dx + dy * dy >= r * r) continue;
      let f;
      if (k === 'cone') f = this._coneTerm(L, dx, dy);
      else if (k === 'spot') f = this._spotTerm(L, dx, dy);
      else if (L._shape === 'tube') f = falloffTube(Math.hypot(dx, dy / 0.74) / r);
      else f = falloff(Math.hypot(dx, dy) / r);
      if (f <= 0) continue;
      if (L._shadows) {
        this._ensurePoly(L);
        if (L._nPoly >= 3 && !pointInPoly(L._poly, L._nPoly, x, y)) continue;
      }
      v += f * L._cur * lum(L._rgb);
    }
    const fl = this.flashlight;
    if (fl.on && this._flN >= 3) {
      const R = this._flR;
      const dx = x - fl.x;
      const dy = y - fl.y;
      const d = Math.hypot(dx, dy);
      if (d < R && pointInPoly(this._flPoly, this._flN, x, y)) {
        const th = Math.abs(wrapAngle(Math.atan2(dy, dx) - fl.angle));
        v += this._flI * CONE.rad(d / R) * CONE.ang(th, this._flHalf) * 0.95;
      }
    }
    v += this._moonAt(x, y);
    v += this._ltEnv * 0.3 * this._ltStrength;
    return clamp01(v);
  }

  /** All lights currently managed (map + dynamic), for debugging/tools. */
  get lights() { return this._all; }

  // ============================================================================ update
  update(dt) {
    this.init();
    this.t += dt;
    const map = HW.map;
    if (map !== this._map) this.onMapLoad(map);
    if (!map) return;
    if ((map.lightsVersion ?? 0) !== this._lightsVer) {
      this._lightsVer = map.lightsVersion ?? 0;
      this._syncMapLights(map, false);
    }
    if (map.opaqueVersion !== this._opaqueVer) this._rebuildGeometry(map);

    // Ambient tween.
    if (this._ambTo) {
      this._ambT += dt;
      const u = Math.min(1, this._ambT / this._ambDur);
      const s = u * u * (3 - 2 * u);
      for (let i = 0; i < 3; i++) this._ambRGB[i] = this._ambFrom[i] + (this._ambTo[i] - this._ambFrom[i]) * s;
      if (u >= 1) this._ambTo = null;
    }

    const reduce = reduceFlashing();
    this._sfxBudget = Math.min(3, this._sfxBudget + dt * 6);
    this._updateShroud(dt);
    for (const L of this._all) this._updateLight(L, reduce);

    const fl = this.flashlight;
    this.selfGlow.x = fl.x;
    this.selfGlow.y = fl.y;
    this._ltEnv = lightningEnv(this.t - this._ltStart, reduce);
    this._updateMotes(dt);
  }

  _updateLight(L, reduce) {
    // Position: px/py (world) or x/y (tiles) — whichever the owner changed.
    if (L.px !== L._lpx || L.py !== L._lpy) {
      L.x = L.px / TILE - 0.5;
      L.y = L.py / TILE - 0.5;
    } else if (L.x !== L._lx || L.y !== L._ly) {
      L.px = L.x * TILE + 8;
      L.py = L.y * TILE + 8;
    }
    if (L.px !== L._lpx || L.py !== L._lpy) L._polyDirty = true;
    L._lpx = L.px; L._lpy = L.py; L._lx = L.x; L._ly = L.y;
    if (L.radius !== L._lradius || L.power !== L._lpower) {
      L._lradius = L.radius;
      L._lpower = L.power;
      const r = radiusPx(L);
      if (r !== L._r) { L._r = r; L._polyDirty = true; }
      L._spriteDirty = true;
    }
    if (L.color !== L._lcolor) { L._rgb = hexToRgb(L.color || L._P.color); L._lcolor = L.color; L._spriteDirty = true; }
    if (L.angle !== L._langle) { L._langle = L.angle; L._spriteDirty = true; }

    if (L.on !== L._lon) { L._lon = L.on; this._retarget(L, false); }
    let level;
    if (L._trans) {
      level = transitionLevel(L._trans, this.t);
      if (level < 0) { L._trans = null; level = L._target; }
    } else level = L._target;
    // Scheduled stutter sound.
    if (L._sfxAt >= 0 && this.t >= L._sfxAt) {
      L._sfxAt = -1;
      if (this._sfxBudget >= 1 && this._nearView(L)) {
        this._sfxBudget -= 1;
        HW.audio?.sfx?.(L._sfxId, { x: L.px, y: L.py, vol: L._sfxVol });
      }
    }
    const mode = L._flickerMode;
    const f = mode === 'steady' ? 1 : flickerAt(mode, this.t, L._seed, reduce);
    const inten = L.intensity ?? L._P.intensity;
    L._level = level;
    L._cur = Math.max(0, inten * level * f * (L._P.kind === 'cone' && L.power !== undefined ? 0.35 + 0.65 * L.power : 1));
  }

  /** Recompute a light's effective on/off and start a transition if it changed. */
  _retarget(L, instant, mode, delay = 0) {
    const want = this._effectiveOn(L) ? 1 : 0;
    if (want === L._target && !instant) return;
    const from = L._trans ? Math.max(0, transitionLevel(L._trans, this.t)) : L._target;
    L._target = want;
    if (instant || mode === 'instant') { L._trans = null; return; }
    const P = L._P;
    const reduce = reduceFlashing();
    if (want) {
      const m = mode || P.onMode || 'fade';
      if (m === 'stutter') {
        L._trans = makeStutterOn(this.t, L._seed + Math.floor(this.t * 7), reduce, delay);
        this._scheduleSfx(L, 'fluor_on', delay, 1);
      } else if (m === 'bang') L._trans = makeBang(this.t, reduce, delay);
      else L._trans = makeFade(this.t, from, 1, 0.4, delay);
    } else {
      const m = mode || P.offMode || 'fade';
      if (m === 'fluor' || m === 'stutter') L._trans = makeFluorOff(this.t + delay, from, L._seed, reduce);
      else if (m === 'bang') L._trans = null;
      else L._trans = makeFade(this.t, from, 0, 0.3, delay);
    }
  }

  _scheduleSfx(L, id, delay, vol) {
    L._sfxId = id;
    L._sfxVol = vol;
    L._sfxAt = this.t + delay;
  }

  _nearView(L) {
    const p = HW.player;
    const cx = p ? p.x : (HW.camera?.view?.x ?? 0) + W / 2;
    const cy = p ? p.y : (HW.camera?.view?.y ?? 0) + H / 2;
    return Math.abs(L.px - cx) < 400 && Math.abs(L.py - cy) < 300;
  }

  _effectiveOn(L) {
    if (L._killed) return false;
    if (!this._activeOn(L)) return false;
    const g = L.group;
    if (g && this._groups.has(g)) {
      // A prop whose own state is off (a dead lamp) stays off whatever its group does.
      if (L.propId && L.on === false) return false;
      return this._groups.get(g);
    }
    return L.on !== false;
  }

  /** Dynamic lights scoped to another map are inert. */
  _activeOn(L) {
    return !L.map || !this._map || L.map === this._map.id;
  }

  /** "The light dies where he is" — period lights near the shrouded Colonel stutter off. */
  _updateShroud(dt) {
    const c = HW.colonel;
    let cx = null;
    let cy = null;
    if (c?.shrouded) {
      const e = c.entity || HW.entities?.get?.('colonel');
      if (e) { cx = e.x; cy = e.y - 18; }
      else if (Number.isFinite(c.x)) { cx = c.x; cy = c.y - 18; }
    }
    for (const L of this._all) {
      if (L.group !== 'period') { if (L._killed) { L._killed = false; this._retarget(L, false); } continue; }
      const near = cx !== null && Math.hypot(L.px - cx, L.py - cy) <= SHROUD_RANGE;
      if (near) {
        L._killFar = 0;
        if (!L._killed) {
          const wasOn = L._target === 1;
          L._killed = true;
          this._retarget(L, false, 'fluor');
          if (wasOn && this._sfxBudget >= 1) { this._sfxBudget -= 1; HW.audio?.sfx?.('fluor_off', { x: L.px, y: L.py }); }
        }
      } else if (L._killed) {
        L._killFar += dt;
        if (L._killFar >= SHROUD_RECOVER) {
          L._killed = false;
          this._retarget(L, false, 'stutter');
          L._sfxVol = 0.6;
        }
      }
    }
  }

  // ============================================================================ lights
  _makeLight(def, dynamic) {
    const P = presetOf(def.type);
    const L = def; // the def object itself becomes the live light (callers may keep mutating it)
    L.type = def.type || 'bulb';
    L.id = def.id || `light_${(this._nextId = (this._nextId || 0) + 1)}`;
    L._P = P;
    L._dynamic = dynamic;
    L._seed = hashStr(String(L.id));
    if (L.px === undefined) { L.px = (L.x ?? 0) * TILE + 8; L.py = (L.y ?? 0) * TILE + 8; }
    if (L.x === undefined) { L.x = L.px / TILE - 0.5; L.y = L.py / TILE - 0.5; }
    L._lpx = L.px; L._lpy = L.py; L._lx = L.x; L._ly = L.y;
    L._r = radiusPx(L);
    L._lradius = L.radius;
    L._rgb = hexToRgb(L.color || P.color);
    L._lcolor = L.color;
    if (L.angle === undefined) L.angle = DIR_ANGLE[L.dir] ?? (P.kind === 'cone' && L.type === 'headlights' ? -Math.PI / 2 : Math.PI / 2);
    L._langle = L.angle;
    L._lpower = L.power;
    L._shape = L.shape || P.shape || 'round';
    L._shadows = L.shadows ?? P.shadows ?? true;
    L._flickerMode = typeof L.flicker === 'string' ? L.flicker
      : L.flicker === true ? (P.flickerAlt || 'dying')
        : P.flicker || 'steady';
    if (L.on === undefined) L.on = defaultOn(L);
    L._lon = L.on;
    L._target = 0;
    L._trans = null;
    L._killed = false;
    L._killFar = 0;
    L._sfxAt = -1;
    L._cur = 0;
    L._level = 0;
    L._poly = null;
    L._nPoly = 0;
    L._polyVer = -1;
    L._polyDirty = true;
    L._spriteDirty = true;
    L._cv = null;
    L._target = this._effectiveOn(L) ? 1 : 0;
    L._level = L._target;
    return L;
  }

  _syncMapLights(map, initial) {
    const old = new Map(this._mapLights.map((l) => [l.id, l]));
    const next = [];
    this._windows = [];
    for (const d of map.lightDefs || []) {
      if (d.type === 'window') { this._windows.push({ tx: Math.round(d.x), ty: Math.round(d.y), explicit: d }); continue; }
      let L = old.get(d.id);
      if (L && L.type === d.type && !initial) {
        // Keep live state (level, transition, flicker phase); take the new data.
        L.on = defaultOn(d);
        if (d.x !== L._dx || d.y !== L._dy) { L.x = d.x; L.y = d.y; L._dx = d.x; L._dy = d.y; }
        L.intensity = d.intensity;
        L.color = d.color;
        L.radius = d.radius;
        L.group = d.group;
        const P = L._P;
        L._flickerMode = typeof d.flicker === 'string' ? d.flicker : d.flicker === true ? (P.flickerAlt || 'dying') : P.flicker || 'steady';
      } else {
        L = this._makeLight({ ...d }, false);
        L._dx = d.x;
        L._dy = d.y;
      }
      next.push(L);
    }
    for (const c of map.windowCells || []) this._windows.push({ tx: c.tx, ty: c.ty, explicit: null });
    this._mapLights = next;
    this._moonDirty = true;
    this._rebuildAll();
    if (initial) for (const L of this._all) { L._trans = null; L._target = this._effectiveOn(L) ? 1 : 0; L._lon = L.on; }
  }

  _rebuildAll() {
    this._all = this._mapLights.concat(this._dyn);
  }

  _rebuildGeometry(map) {
    this._grid = classifyCells(map);
    this._segs = buildSegments(this._grid);
    this._segVer++;
    this._opaqueVer = map.opaqueVersion;
    this._moonDirty = true;
    this.stats.segs = this._segs.length / 6;
  }

  _applyAmbient(color, level, time) {
    const rgb = this._ambientRGB(color, level);
    this.ambient = { color, level };
    if (!time) {
      this._ambRGB = rgb;
      this._ambTo = null;
    } else {
      this._ambFrom = this._ambRGB.slice();
      this._ambTo = rgb;
      this._ambT = 0;
      this._ambDur = time;
    }
  }

  /** Lightmap ground level: (1 - darkness), tinted toward the ambient color's hue. */
  _ambientRGB(color, level) {
    const c = hexToRgb(color || '#0b1020');
    const m = Math.max(1, c[0], c[1], c[2]);
    const base = (1 - clamp01(level)) * 1.75;
    return c.map((v) => 255 * base * (0.42 + 0.58 * (v / m)));
  }

  /** (Re)compute a light's visibility polygon if its origin, radius or the geometry changed. */
  _ensurePoly(L) {
    if (!L._shadows) return;
    if (!L._polyDirty && L._polyVer === this._segVer) return;
    const o = nudgeOrigin(this._grid, L.px, L.py, this._nudge);
    const n = this._solver.compute(this._segs, o.x, o.y, L._r + 2, this._tmpPoly, BLEED);
    if (!L._poly || L._poly.length < n * 2) L._poly = new Float32Array(Math.max(64, n * 2 + 32));
    L._poly.set(this._tmpPoly.subarray(0, n * 2));
    L._nPoly = n;
    L._polyVer = this._segVer;
    L._polyDirty = false;
    L._spriteDirty = true;
    this.stats.rebuilt++;
  }

  /** Render a light into its cached sprite (light at intensity 1, black = none). */
  _ensureSprite(L) {
    this._ensurePoly(L);
    if (!L._spriteDirty && L._cv) return;
    const r = L._r;
    const pad = BLEED + 4;
    const bx = Math.floor((L.px - r - pad) / 2) * 2;
    const by = Math.floor((L.py - r - pad) / 2) * 2;
    const bw = Math.ceil((L.px + r + pad - bx) / 2) * 2;
    const bh = Math.ceil((L.py + r + pad - by) / 2) * 2;
    const cw = bw * K;
    const ch = bh * K;
    if (!L._cv || L._cv.width < cw || L._cv.height < ch) L._cv = canvas(cw, ch);
    L._bx = bx;
    L._by = by;
    const c = L._cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#000';
    c.fillRect(0, 0, L._cv.width, L._cv.height);
    c.setTransform(K, 0, 0, K, -bx * K, -by * K);
    c.save();
    if (L._shadows && L._nPoly >= 3) {
      tracePoly(c, L._poly, L._nPoly);
      c.clip();
    }
    this._drawShape(c, L, bx, by, bw, bh);
    c.restore();
    L._spriteDirty = false;
  }

  _drawShape(c, L, bx, by, bw, bh) {
    const P = L._P;
    const r = L._r;
    const rgb = L._rgb;
    if (P.kind === 'cone') {
      const tex = coneTexture(L.cone ?? P.cone ?? 55, L.color || P.color, L.color || P.color, L.type === 'flashlight' ? 0.3 : 0.12);
      const twin = L.twin ?? P.twin ?? 0;
      const a = L.angle;
      c.globalCompositeOperation = 'lighter';
      for (let s = twin ? -1 : 1; s <= 1; s += 2) {
        c.save();
        c.translate(L.px - Math.sin(a) * twin * s, L.py + Math.cos(a) * twin * s);
        c.rotate(a);
        c.globalAlpha = twin ? 0.62 : 1;
        c.drawImage(tex, -r, -r, r * 2, r * 2);
        c.restore();
      }
      return;
    }
    if (P.kind === 'spot') {
      // Theatre spot: hard-edged disc on the boards plus a faint spill.
      const disc = (L.disc ?? P.disc) * TILE;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = lightGradient(c, L.px, L.py, r, rgb.map((v) => v * 0.22), false);
      c.fillRect(bx, by, bw, bh);
      c.save();
      c.translate(L.px, L.py);
      c.scale(1, 0.72);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, disc);
      g.addColorStop(0, rgbStr(rgb, 1));
      g.addColorStop(0.78, rgbStr(rgb, 0.93));
      g.addColorStop(0.9, rgbStr(rgb, 0.55));
      g.addColorStop(0.97, rgbStr(rgb, 0.1));
      g.addColorStop(1, 'rgb(0,0,0)');
      c.fillStyle = g;
      c.fillRect(-disc, -disc, disc * 2, disc * 2);
      c.restore();
      return;
    }
    if (L._shape === 'tube') {
      // A long ceiling tube: wide, flat-topped ellipse.
      c.save();
      c.translate(L.px, L.py);
      c.scale(1, 0.74);
      c.fillStyle = lightGradient(c, 0, 0, r, rgb, true);
      c.fillRect(-r, -r, r * 2, r * 2);
      c.restore();
      return;
    }
    c.fillStyle = lightGradient(c, L.px, L.py, r, rgb, false);
    c.fillRect(bx, by, bw, bh);
    if (L.cage ?? P.cage) {
      // The wire cage throws faint spokes of shadow.
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = 'rgb(150,150,150)';
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.2;
        const w = 0.045;
        c.beginPath();
        c.moveTo(L.px + Math.cos(a) * 5, L.py + Math.sin(a) * 5);
        c.lineTo(L.px + Math.cos(a - w) * r, L.py + Math.sin(a - w) * r);
        c.lineTo(L.px + Math.cos(a + w) * r, L.py + Math.sin(a + w) * r);
        c.closePath();
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
  }

  _coneTerm(L, dx, dy) {
    const P = L._P;
    const h = ((L.cone ?? P.cone ?? 55) * Math.PI) / 360;
    const twin = L.twin ?? P.twin ?? 0;
    let best = 0;
    for (let s = twin ? -1 : 1; s <= 1; s += 2) {
      const ex = dx + Math.sin(L.angle) * twin * s;
      const ey = dy - Math.cos(L.angle) * twin * s;
      const d = Math.hypot(ex, ey) / L._r;
      const th = Math.abs(wrapAngle(Math.atan2(ey, ex) - L.angle));
      best = Math.max(best, CONE.rad(d) * CONE.ang(th, h));
    }
    return best;
  }

  _spotTerm(L, dx, dy) {
    const disc = (L.disc ?? L._P.disc) * TILE;
    const d = Math.hypot(dx, dy / 0.72) / disc;
    const inDisc = d < 0.85 ? 1 : d < 1 ? (1 - d) / 0.15 : 0;
    return Math.max(inDisc, 0.22 * falloff(Math.hypot(dx, dy) / L._r));
  }

  // ============================================================================ moonlight
  /** Build the static moonlight layer for the whole map (shafts + lit glass), at lightmap scale. */
  _buildMoon() {
    const map = this._map;
    this._moonDirty = false;
    this._shafts = [];
    const ext = map.data?.floor === 'EXT';
    const moonLevel = map.data?.moon ?? (ext ? 0 : 1);
    this._moonLevel = moonLevel;
    if (!this._windows.length) { this._moon = null; return; }
    const mw = Math.ceil(map.w * TILE * K);
    const mh = Math.ceil(map.h * TILE * K);
    if (!this._moon || this._moon.width !== mw || this._moon.height !== mh) this._moon = canvas(mw, mh);
    const c = this._moon.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000';
    c.fillRect(0, 0, mw, mh);
    c.setTransform(K, 0, 0, K, 0, 0);
    c.globalCompositeOperation = 'lighter';
    const rgb = hexToRgb(LIGHT_COLORS.moon);
    const glass = [];
    for (const w of this._windows) {
      const { tx, ty } = w;
      const len = (w.explicit?.radius ?? 4.2) * TILE;
      const x0 = tx * TILE;
      const y0 = (ty + 1) * TILE;
      const skew = 11;   // the moon is high and a little east: shafts lean south-east
      const spread = 5;
      const shaft = [x0 + 1, y0, x0 + 15, y0, x0 + 15 + skew + spread, y0 + len, x0 + 1 + skew - spread, y0 + len];
      this._shafts.push({ x0, y0, len, skew, spread, inten: w.explicit?.intensity ?? 1 });
      // Clip to what the window can actually see.
      const n = this._solver.compute(this._segs, x0 + 8, y0 + 0.5, len + 24, this._tmpPoly, BLEED);
      c.save();
      tracePoly(c, this._tmpPoly, n);
      c.clip();
      const g = c.createLinearGradient(0, y0, 0, y0 + len);
      const i0 = 0.62 * (w.explicit?.intensity ?? 1);
      g.addColorStop(0, rgbStr(rgb, i0));
      g.addColorStop(0.25, rgbStr(rgb, i0 * 0.72));
      g.addColorStop(0.65, rgbStr(rgb, i0 * 0.3));
      g.addColorStop(1, 'rgb(0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(shaft[0], shaft[1]);
      for (let i = 2; i < 8; i += 2) c.lineTo(shaft[i], shaft[i + 1]);
      c.closePath();
      c.fill();
      // Sash bars: a cross of shadow in the shaft.
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = 'rgb(105,105,105)';
      const mx = x0 + 8;
      c.beginPath();
      c.moveTo(mx - 1, y0);
      c.lineTo(mx + 1, y0);
      c.lineTo(mx + 1 + skew, y0 + len);
      c.lineTo(mx - 1 + skew, y0 + len);
      c.closePath();
      c.fill();
      const my = y0 + len * 0.42;
      const sx = (my - y0) / len;
      c.fillRect(x0 + 1 + skew * sx - spread * sx, my - 1, 14 + spread * 2 * sx, 2);
      c.restore();
      c.globalCompositeOperation = 'lighter';
      glass.push(tx, ty);
    }
    // The glass itself catches the moon (face_low and, when it is glass too, face_high above).
    for (let i = 0; i < glass.length; i += 2) {
      const tx = glass[i];
      const ty = glass[i + 1];
      const tall = map.wallKind(tx, ty - 1) === 'face_high' && /^window/.test(map.tileAt(tx, ty - 1));
      const gy = (tall ? ty - 1 : ty) * TILE + 1;
      const gh = (tall ? 31 : 15);
      const g = c.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, rgbStr(rgb, 0.42));
      g.addColorStop(1, rgbStr(rgb, 0.62));
      c.fillStyle = g;
      c.fillRect(tx * TILE + 1, gy, 14, gh);
    }
  }

  /** Approximate moonlight at a point (lightAt). */
  _moonAt(x, y) {
    if (!this._shafts || !this._moonLevel) return 0;
    const lift = 1 + this._ltEnv * 5 * this._ltStrength;
    let v = 0;
    for (const s of this._shafts) {
      const u = (y - s.y0) / s.len;
      if (u < 0 || u > 1) continue;
      const a = s.x0 + 1 + s.skew * u - s.spread * u;
      const b = s.x0 + 15 + s.skew * u + s.spread * u;
      if (x < a || x > b) continue;
      v = Math.max(v, 0.62 * s.inten * (1 - u) * (1 - u * 0.4));
    }
    return v * lum(hexToRgb(LIGHT_COLORS.moon)) * 0.55 * this._moonLevel * lift;
  }

  // ============================================================================ render
  render(ctx, cam) {
    const t0 = performance.now();
    this.init();
    const map = HW.map;
    if (map !== this._map) this.onMapLoad(map);
    if (!map) return;
    if (map.opaqueVersion !== this._opaqueVer) this._rebuildGeometry(map);
    this.stats.rebuilt = 0;

    // Lit (non-emissive) particles go in before the multiply so the light reveals them.
    HW.fx?.renderLit?.(ctx, cam);

    const lmx = cam.x - mod2(cam.x);
    const lmy = cam.y - mod2(cam.y);
    const lc = this._lmCtx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'source-over';
    const a = this._ambRGB;
    lc.fillStyle = `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
    lc.fillRect(0, 0, LW, LH);
    lc.globalCompositeOperation = 'lighter';

    // Global ambient lights (dawn) and lightning lift.
    const reduce = reduceFlashing();
    const ext = map.data?.floor === 'EXT';
    for (const L of this._all) {
      if (L._P.kind === 'ambient' && L._cur > 0.003 && this._activeOn(L)) {
        lc.fillStyle = rgbStr(L._rgb, L._cur);
        lc.fillRect(0, 0, LW, LH);
      }
    }

    this._drawMoon(lc, lmx, lmy);

    // Lights.
    let drawn = 0;
    const vx0 = cam.x;
    const vy0 = cam.y;
    for (const L of this._all) {
      const k = L._P.kind;
      if (k === 'ambient' || k === 'shaft' || L._cur <= 0.003 || !this._activeOn(L)) continue;
      const r = L._r;
      if (L.px + r < vx0 || L.px - r > vx0 + W || L.py + r < vy0 || L.py - r > vy0 + H) continue;
      this._ensureSprite(L);
      let jx = 0;
      let jy = 0;
      const jit = L.jitter ?? L._P.jitter;
      if (jit) {
        jx = Math.round((noise1(this.t * 9, L._seed) - 0.5) * 2 * jit) * 2;
        jy = Math.round((noise1(this.t * 7, L._seed + 3) - 0.5) * 2 * jit) * 2;
      }
      lc.globalAlpha = Math.min(1, L._cur);
      lc.drawImage(L._cv, (L._bx - lmx + jx) * K, (L._by - lmy + jy) * K);
      if (L._cur > 1) { lc.globalAlpha = L._cur - 1; lc.drawImage(L._cv, (L._bx - lmx + jx) * K, (L._by - lmy + jy) * K); }
      drawn++;
    }
    lc.globalAlpha = 1;

    // Flashlight + self-glow (dynamic, every frame).
    this._drawFlashlight(lc, lmx, lmy);
    this._drawSelfGlow(lc, lmx, lmy);

    if (this._ltEnv > 0.001) {
      const lift = this._ltEnv * this._ltStrength * (ext ? 0.55 : 0.2);
      lc.fillStyle = rgbStr(hexToRgb(LIGHT_COLORS.lightning), lift);
      lc.fillRect(0, 0, LW, LH);
    }

    // Multiply the lightmap over the world (smooth upscale: lighting is the one soft thing).
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(this._lm, 0, 0, LW, LH, lmx - cam.x, lmy - cam.y, LW / K, LH / K);
    ctx.restore();

    // Additive passes.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this._drawHaze(ctx, cam);
    this._drawGlows(ctx, cam);
    this._drawWindowFlash(ctx, cam, reduce);
    this._drawMotes(ctx, cam);
    ctx.restore();

    const ms = performance.now() - t0;
    this.stats.ms = ms;
    this.stats.avg = this.stats.avg ? this.stats.avg * 0.95 + ms * 0.05 : ms;
    this.stats.lights = drawn;
  }

  _drawMoon(lc, lmx, lmy) {
    if (this._moonDirty) this._buildMoon();
    if (!this._moon || !this._moonLevel) return;
    const lift = 1 + this._ltEnv * 5 * this._ltStrength;
    const alpha = 0.55 * this._moonLevel * lift;
    const sc = this._moonScratchCtx;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalAlpha = 1;
    sc.globalCompositeOperation = 'copy';
    const sx = lmx * K;
    const sy = lmy * K;
    sc.fillStyle = '#000';
    sc.fillRect(0, 0, LW, LH);
    sc.globalCompositeOperation = 'source-over';
    sc.drawImage(this._moon, -sx, -sy);
    // Rain running down the glass: streak shadows sliding south through the shafts.
    sc.globalCompositeOperation = 'destination-out';
    sc.globalAlpha = 0.55;
    const scroll = (this.t * 9) % 96;
    const wob = Math.round(Math.sin(this.t * 0.7) * 1.5);
    const px = ((sx % 48) + 48) % 48;
    const py = (((sy - scroll) % 96) + 96) % 96;
    sc.translate(-px - 48 + wob, -py - 96);
    sc.fillStyle = this._rainPat;
    sc.fillRect(0, 0, LW + 100, LH + 200);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalAlpha = 1;
    sc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = Math.min(1, alpha);
    lc.drawImage(this._moonScratch, 0, 0);
    if (alpha > 1) {
      lc.globalAlpha = Math.min(1, alpha - 1);
      lc.drawImage(this._moonScratch, 0, 0);
      if (alpha > 2) { lc.globalAlpha = Math.min(1, alpha - 2); lc.drawImage(this._moonScratch, 0, 0); }
    }
    lc.globalAlpha = 1;
  }

  _drawFlashlight(lc, lmx, lmy) {
    const fl = this.flashlight;
    this._flN = 0;
    if (!fl.on || !(fl.power > 0.001)) return;
    const reduce = reduceFlashing();
    const power = Math.min(1, fl.power);
    const R = FL_RADIUS * (0.55 + 0.45 * power) * (fl.radiusScale ?? 1);
    let inten = 0.32 + 0.68 * power;
    const fk = (fl.flicker || 0) * (reduce ? 0.3 : 1);
    if (fk > 0) inten *= 1 - fk * 0.32 * noise1(this.t * 37, 11) - fk * 0.12 * noise1(this.t * 11, 5);
    if (power < 0.25) inten *= 0.82 + 0.18 * noise1(this.t * 13, 7);
    const coneDeg = fl.cone ?? 55;
    const half = (coneDeg * Math.PI) / 360;
    this._flR = R;
    this._flI = inten;
    this._flHalf = half;
    const key = `${coneDeg}|${fl.color || ''}`;
    if (key !== this._flTexKey) {
      this._flTex = coneTexture(coneDeg, fl.color || LIGHT_COLORS.flashlight, LIGHT_COLORS.flashlight_dim, 0.3);
      this._flTexKey = key;
    }
    const o = nudgeOrigin(this._grid, fl.x, fl.y, this._nudge);
    const span = half * 1.3 + 0.06;
    this._flN = this._solver.compute(this._segs, o.x, o.y, R + 2, this._flPoly, BLEED, fl.angle - span, fl.angle + span);
    lc.save();
    lc.setTransform(K, 0, 0, K, -lmx * K, -lmy * K);
    tracePoly(lc, this._flPoly, this._flN);
    lc.clip();
    lc.globalAlpha = clamp01(inten);
    lc.translate(fl.x, fl.y);
    lc.rotate(fl.angle);
    lc.drawImage(this._flTex, -R, -R, R * 2, R * 2);
    lc.restore();
  }

  _drawSelfGlow(lc, lmx, lmy) {
    const sg = this.selfGlow;
    const fl = this.flashlight;
    const hidden = !!HW.player?.hidden;
    const glowOn = sg.on && !hidden;
    const spill = fl.on && fl.power > 0.001;
    if (!glowOn && !spill) return;
    const x = fl.x;
    const y = fl.y;
    const o = nudgeOrigin(this._grid, x, y, this._nudge);
    this._smallN = this._solver.compute(this._segs, o.x, o.y, SPILL_RADIUS + 2, this._smallPoly, BLEED);
    lc.save();
    lc.setTransform(K, 0, 0, K, -lmx * K, -lmy * K);
    tracePoly(lc, this._smallPoly, this._smallN);
    lc.clip();
    if (glowOn) {
      const g = lc.createRadialGradient(x, y + 4, 0, x, y + 4, sg.radius);
      const v = sg.intensity;
      g.addColorStop(0, `rgb(${Math.round(222 * v)},${Math.round(212 * v)},${Math.round(204 * v)})`);
      g.addColorStop(0.45, `rgb(${Math.round(222 * v * 0.55)},${Math.round(212 * v * 0.55)},${Math.round(206 * v * 0.55)})`);
      g.addColorStop(1, 'rgb(0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - sg.radius, y + 4 - sg.radius, sg.radius * 2, sg.radius * 2);
    }
    if (spill) {
      const v = 0.13 * (0.4 + 0.6 * Math.min(1, fl.power)) * (this._flI ?? 1);
      const g = lc.createRadialGradient(x, y, 0, x, y, SPILL_RADIUS);
      g.addColorStop(0, `rgb(${Math.round(255 * v)},${Math.round(241 * v)},${Math.round(214 * v)})`);
      g.addColorStop(1, 'rgb(0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - SPILL_RADIUS, y - SPILL_RADIUS, SPILL_RADIUS * 2, SPILL_RADIUS * 2);
    }
    lc.restore();
  }

  /** A faint additive haze inside the beam: the light hanging in dusty air. */
  _drawHaze(ctx, cam) {
    const fl = this.flashlight;
    if (!fl.on || this._flN < 3) return;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    tracePoly(ctx, this._flPoly, this._flN);
    ctx.clip();
    ctx.globalAlpha = FL_HAZE * clamp01(this._flI);
    ctx.imageSmoothingEnabled = true;
    ctx.translate(fl.x, fl.y);
    ctx.rotate(fl.angle);
    const R = this._flR;
    ctx.drawImage(this._flTex, -R, -R, R * 2, R * 2);
    ctx.restore();
  }

  _drawGlows(ctx, cam) {
    for (const L of this._all) {
      const style = L.glow === undefined ? L._P.glow : L.glow;
      if (!style || L._cur <= 0.01 || !this._activeOn(L)) continue;
      const gx = L.px + (L.glowDx ?? L._P.glowDx ?? 0) - cam.x;
      const gy = L.py + (L.glowDy ?? L._P.glowDy ?? 0) - cam.y;
      if (gx < -40 || gx > W + 40 || gy < -150 || gy > H + 40) continue;
      const color = L.color || L._P.color;
      const v = Math.min(1.2, L._cur);
      let s;
      switch (style) {
        case 'tube': s = glowSprite(color, 18, { sx: 2.4, sy: 0.55, power: 2.6 }); ctx.globalAlpha = 0.16 * v; break;
        case 'sign': s = glowSprite(color, 10, { sx: 1.3, sy: 0.8, power: 2 }); ctx.globalAlpha = 0.55 * v; break;
        case 'lamp': s = glowSprite(color, 9, { core: 2, power: 2.2 }); ctx.globalAlpha = 0.5 * v; break;
        case 'bulb': s = glowSprite(color, 9, { core: 2.5, power: 2.2 }); ctx.globalAlpha = 0.6 * v; break;
        case 'fire': s = glowSprite(color, 18, { sy: 0.8, power: 2 }); ctx.globalAlpha = 0.32 * v; break;
        case 'flame': s = glowSprite(color, 6, { core: 1.6, power: 1.8 }); ctx.globalAlpha = 0.7 * v; break;
        case 'crt': s = glowSprite(color, 8, { sx: 1.25, sy: 1, power: 2 }); ctx.globalAlpha = 0.35 * v; break;
        case 'led': s = glowSprite(color, 3, { core: 1.2, power: 1.5 }); ctx.globalAlpha = 0.9 * v; break;
        case 'spot': this._drawSpotColumn(ctx, L, gx, gy, v); continue;
        case 'headlights': {
          s = glowSprite(color, 7, { core: 2, power: 2 });
          ctx.globalAlpha = 0.7 * v;
          const a = L.angle;
          const twin = L.twin ?? L._P.twin ?? 0;
          for (let k = -1; k <= 1; k += 2) {
            const hx = gx - Math.sin(a) * twin * k + Math.cos(a) * 4;
            const hy = gy + Math.cos(a) * twin * k + Math.sin(a) * 4;
            ctx.drawImage(s.canvas, Math.round(hx + s.ox), Math.round(hy + s.oy));
          }
          continue;
        }
        default: continue;
      }
      ctx.drawImage(s.canvas, Math.round(gx + s.ox), Math.round(gy + s.oy));
    }
    ctx.globalAlpha = 1;
  }

  /** Theatre spot: a faint column of light falling from the flies onto the disc. */
  _drawSpotColumn(ctx, L, gx, gy, v) {
    const disc = (L.disc ?? L._P.disc) * TILE;
    const top = gy - 150;
    const g = ctx.createLinearGradient(0, top, 0, gy);
    const rgb = L._rgb;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.07 * v).toFixed(3)})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(gx - disc * 0.35, top);
    ctx.lineTo(gx + disc * 0.35, top);
    ctx.lineTo(gx + disc * 0.95, gy);
    ctx.lineTo(gx - disc * 0.95, gy);
    ctx.closePath();
    ctx.fill();
  }

  /** Lightning: the window glass blazes for a moment. */
  _drawWindowFlash(ctx, cam, reduce) {
    const e = this._ltEnv * this._ltStrength;
    if (e < 0.01 || !this._windows.length) return;
    const map = this._map;
    ctx.globalAlpha = Math.min(1, e * (reduce ? 0.5 : 0.9));
    ctx.fillStyle = LIGHT_COLORS.lightning;
    for (const w of this._windows) {
      const x = w.tx * TILE - cam.x;
      if (x < -16 || x > W) continue;
      const tall = map.wallKind(w.tx, w.ty - 1) === 'face_high' && /^window/.test(map.tileAt(w.tx, w.ty - 1));
      const y = (tall ? w.ty - 1 : w.ty) * TILE - cam.y;
      ctx.fillRect(x + 2, y + 2, 12, tall ? 28 : 12);
    }
    ctx.globalAlpha = 1;
  }

  // ============================================================================ beam motes
  _rand() {
    let a = (this._moteRand = (this._moteRand + 0x6d2b79f5) >>> 0);
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  }

  _spawnMote(i, anywhere) {
    const fl = this.flashlight;
    const R = this._flR || FL_RADIUS;
    const half = this._flHalf || 0.48;
    const d = R * (anywhere ? 0.08 + 0.85 * Math.sqrt(this._rand()) : 0.15 + 0.8 * this._rand());
    const a = fl.angle + (this._rand() * 2 - 1) * half * 1.1;
    const m = this._motes;
    m[i * 4] = fl.x + Math.cos(a) * d;
    m[i * 4 + 1] = fl.y + Math.sin(a) * d;
    m[i * 4 + 2] = this._rand() * Math.PI * 2;
    m[i * 4 + 3] = 0.5 + this._rand();
  }

  _updateMotes(dt) {
    const fl = this.flashlight;
    if (!fl.on) return;
    if (!this._motesInit) {
      for (let i = 0; i < MOTES; i++) this._spawnMote(i, true);
      this._motesInit = true;
    }
    const m = this._motes;
    const R = this._flR || FL_RADIUS;
    const half = this._flHalf || 0.48;
    const t = this.t;
    for (let i = 0; i < MOTES; i++) {
      const o = i * 4;
      const sp = m[o + 3];
      // Lazy Brownian drift with a slow settle.
      m[o] += (noise1(t * 0.35 * sp, i * 17) - 0.5) * 9 * dt;
      m[o + 1] += ((noise1(t * 0.3 * sp, i * 29 + 5) - 0.5) * 8 + 1.1) * dt;
      const dx = m[o] - fl.x;
      const dy = m[o + 1] - fl.y;
      const d = Math.hypot(dx, dy);
      const th = Math.abs(wrapAngle(Math.atan2(dy, dx) - fl.angle));
      if (d > R * 0.98 || th > half * 1.35 || d < 4) this._spawnMote(i, false);
    }
  }

  _drawMotes(ctx, cam) {
    const fl = this.flashlight;
    if (!fl.on || this._flN < 3) return;
    const m = this._motes;
    const R = this._flR;
    const half = this._flHalf;
    const inten = clamp01(this._flI);
    ctx.globalAlpha = 1;
    for (let i = 0; i < MOTES; i++) {
      const o = i * 4;
      const x = m[o];
      const y = m[o + 1];
      const dx = x - fl.x;
      const dy = y - fl.y;
      const d = Math.hypot(dx, dy) / R;
      const th = Math.abs(wrapAngle(Math.atan2(dy, dx) - fl.angle));
      let b = CONE.rad(d) * CONE.ang(th, half) * inten;
      b *= 0.55 + 0.45 * Math.sin(this.t * 2.2 * m[o + 3] + m[o + 2]);
      if (b < 0.06) continue;
      if (!pointInPoly(this._flPoly, this._flN, x, y)) continue;
      const lvl = Math.min(15, Math.floor(b * 0.75 * 16));
      ctx.fillStyle = this._moteStyles[lvl];
      ctx.fillRect(Math.round(x - cam.x), Math.round(y - cam.y), 1, 1);
    }
  }
}

export const lighting = new LightingSystem();
export default lighting;
