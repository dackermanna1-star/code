// Lighting (TECH §8) — HW.lighting.
//
// Each frame a half-resolution LIGHTMAP is built and multiplied over the 480×270 world buffer:
//   ambient fill (map.data.dark / ambient, or setAmbient) → global ambient lights (dawn) →
//   moonlight shafts from face windows (lighting_moon.js) → every visible light (cached sprites: its
//   gradient clipped to its visibility polygon) → the flashlight cone and Tess's self-glow
//   (lighting_beam.js, rebuilt per frame) → the lightning lift.
// After the multiply, additive passes add what multiply cannot: haze in the beam, glow halos on
// visible fixtures, the window glass blazing in lightning, dust motes glinting in the cone.
//
// Shadows follow the 3/4 view (lighting_shadow.js): wall faces receive light from the south, tops
// and void stay dark, nothing passes north through a wall. Static lights keep their polygon and
// sprite until map.opaqueVersion changes; only moving lights and the flashlight are rebuilt.
// The lightmap is aligned to even world coordinates so cached sprites always land on whole
// lightmap pixels — no shimmer while the camera scrolls.
//
// Behaviour per preset (flicker curves, stutter-on tubes, groups) lives in lighting_presets.js.
import HW from '../engine/hw.js';
import { LIGHT_COLORS, hexToRgb } from '../art/palette.js';
import { classifyCells, buildSegments, nudgeOrigin, VisibilitySolver, pointInPoly, tracePoly } from './lighting_shadow.js';
import {
  presetOf, flickerAt, makeStutterOn, makeFluorOff, makeFade, makeBang, transitionLevel,
  falloff, falloffTube, CONE, hashStr, hash1, noise1,
} from './lighting_presets.js';
import { canvas, coneTexture, glowSprite, lightGradient, rgbStr } from './lighting_tex.js';
import { Beam, coneDeg } from './lighting_beam.js';
import { MoonLayer } from './lighting_moon.js';
import { ambientRGB, CatchLayer } from './lighting_ambient.js';

const TILE = 16;
const W = 480;
const H = 270;
const K = 0.5;                       // lightmap scale (half resolution, smoothly upscaled)
const LW = W * K + 1;                // +1 lightmap px so even-aligned origins always cover the view
const LH = Math.ceil(H * K) + 1;
const BLEED = 2;                     // px light bleeds into occluder edges
const MAX_POLY = 4096;
const TUBE_SX = 1.2;                 // fluorescent pools: wider than deep ("rect-ish")
const TUBE_SY = 0.8;
const SELF_RADIUS = 34;              // Tess's self-glow (px) — v2.2: larger and softer (readability)
const SELF_LEVEL = 0.4;
const CATCH_GAIN = 0.9;              // wall-face catch light, × ambient luminance (lighting_ambient.js)
const CATCH_MAX = 0.16;              // … capped (bright exteriors don't need it)
const SHROUD_RANGE = 3.5 * TILE;     // period lights die within this of the shrouded Colonel
const SHROUD_RECOVER = 1;            // s after he has passed
const LIGHTNING_RGB = hexToRgb(LIGHT_COLORS.lightning);

const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
const mod2 = (v) => ((Math.round(v) % 2) + 2) % 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const reduceFlashing = () => !!HW.settings?.get?.('reduceFlashing');
const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A light's own switch when its def doesn't say: period lights start dark, everything else lit. */
const defaultOn = (d) => d.on ?? d.group !== 'period';

/** Radius in px from def/preset tiles; flashlight-type cones shrink with power like Tess's. */
function radiusPx(L) {
  const base = (L.radius ?? L._P.radius) * TILE;
  const p = L.type === 'flashlight' && L.radius === undefined && L.power !== undefined ? 0.55 + 0.45 * clamp01(L.power) : 1;
  return Math.max(4, base * p);
}

/** Lightning envelope e seconds after a strike: flash, dip, second flash, afterglow. */
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

/** Additive halo styles for visible fixtures: [radius, glowSprite opts, alpha]. */
const GLOWS = {
  tube: [18, { sx: 2.4, sy: 0.55, power: 2.6 }, 0.16],
  sign: [9, { sx: 1.3, sy: 0.8, power: 2 }, 0.5],
  lamp: [9, { core: 2, power: 2.2 }, 0.5],
  bulb: [9, { core: 2.5, power: 2.2 }, 0.6],
  fire: [18, { sy: 0.8, power: 2 }, 0.32],
  flame: [6, { core: 1.6, power: 1.8 }, 0.7],
  crt: [8, { sx: 1.25, sy: 1, power: 2 }, 0.35],
  led: [3, { core: 1.2, power: 1.5 }, 0.9],
  headlights: [7, { core: 2, power: 2 }, 0.7],
};

export class LightingSystem {
  constructor() {
    /** Set every frame by game/flashlight.js. Optional: cone (full angle, rad), color (hex), radiusScale. */
    this.flashlight = { on: false, x: 0, y: 0, angle: Math.PI / 2, power: 1, flicker: 0 };
    /** Small soft light that keeps Tess readable in total darkness (tracks the flashlight x,y). */
    this.selfGlow = { on: true, x: 0, y: 0, radius: SELF_RADIUS, intensity: SELF_LEVEL };
    /** Current ambient: darkness level 0..1 (1 = black, like map.dark) and tint. */
    this.ambient = { color: '#0b1020', level: 0.9 };
    /** Timing: ms = last render, avg = smoothed; lights = sprites drawn; rebuilt = polygons rebuilt. */
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
    this._windows = [];
    this._groups = new Map();
    this._groupsState = undefined;   // the HW.state the explicit group states were read from
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
    this._nextId = 0;
    this._ready = false;
    this._moonDirty = true;
    this._tmpPoly = new Float32Array(MAX_POLY * 2);
    this._nudge = { x: 0, y: 0 };
    this.beam = new Beam();
    this.moon = new MoonLayer();
    this.catchLayer = new CatchLayer();
  }

  // ============================================================================ lifecycle
  init() {
    if (this._ready) return;
    this._ready = true;
    this._solver = new VisibilitySolver();
    this._lm = canvas(LW, LH);
    this._lmCtx = this._lm.getContext('2d');
    this.moon.init(LW, LH);
    // Shared with the beam helper (it shadows the cone against the same geometry).
    this._sys = { grid: null, segs: this._segs, solver: this._solver, bleed: BLEED };
  }

  onMapLoad(map) {
    this.init();
    this._syncGroupsFromState();
    this._map = map || null;
    this._override = null;
    this._ambTo = null;
    this._ltStart = -1e9;
    this.beam.reset();
    if (!map) { this._mapLights = []; this._windows = []; this._rebuildAll(); return; }
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
  /**
   * Override the ambient until the next map load. level = darkness 0..1 (like map.dark; 0.98 ≈
   * black); color null keeps the tint; time = seconds to ease there.
   */
  setAmbient(color, level, time = 0.8) {
    const c = color || this._override?.color || this.ambient.color;
    const l = level ?? this._override?.level ?? this.ambient.level;
    this._override = { color: c, level: l };
    this._applyAmbient(c, l, time);
  }

  /**
   * Switch a light group on/off with a transition. on = null clears the explicit state (lights fall
   * back to their own defaults). opts: { mode: 'stutter'|'fade'|'bang'|'instant', stagger, delay,
   * time (fade seconds) }.
   * Group state is global (it survives map loads, so a period spans maps).
   */
  setGroup(group, on, opts = {}) {
    this._syncGroupsFromState();
    if (on === null || on === undefined) this._groups.delete(group);
    else this._groups.set(group, !!on);
    this._persistGroup(group);
    const stagger = opts.stagger ?? (opts.mode === 'bang' ? 0 : 0.35);
    let n = 0;
    for (const L of this._all) {
      if (L.group !== group) continue;
      const delay = (opts.delay || 0) + stagger * hash1(n++, L._seed);
      this._retarget(L, false, opts.mode, delay, opts.time);
    }
  }

  /** Is a group currently switched on? (Unset groups: on, except 'period'.) */
  groupOn(group) {
    this._syncGroupsFromState();
    return this._groups.has(group) ? this._groups.get(group) : group !== 'period';
  }

  /**
   * Explicit group states are saved with the game (HW.state.lightGroups: group → bool), so a
   * reload keeps the basement bulbs, gym banks and breaker lamps a script switched. 'period' is
   * owned by the periods system (it resets it on load) and is not persisted.
   */
  _persistGroup(group) {
    const s = HW.state;
    if (!s || group === 'period') return;
    const lg = s.lightGroups && typeof s.lightGroups === 'object' ? s.lightGroups : (s.lightGroups = {});
    if (this._groups.has(group)) lg[group] = this._groups.get(group);
    else delete lg[group];
  }

  /** A new game or a loaded save brings its own group states (checked by state identity). */
  _syncGroupsFromState() {
    const s = HW.state || null;
    if (s === this._groupsState) return;
    this._groupsState = s;
    const period = this._groups.get('period');
    this._groups.clear();
    if (period !== undefined) this._groups.set('period', period);
    const lg = s?.lightGroups;
    if (lg && typeof lg === 'object') {
      for (const [k, v] of Object.entries(lg)) if (k !== 'period' && typeof v === 'boolean') this._groups.set(k, v);
    }
  }

  /**
   * Add a dynamic light (survives map loads until removed; def.map scopes it to one map id).
   * def: { type, x, y (tiles) | px, py (world px), radius (tiles), color, intensity, angle | dir,
   *        group, on, flicker, shadows, cone, power (cones), glow, glowDx, glowDy, entity }
   * Returns the live light object: mutate x/y or px/py, angle, on, intensity, power, color freely.
   */
  addLight(def) {
    this.init();
    const L = this._makeLight({ ...def });
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

  /** Lightning: the windows blaze, everything lifts, then an afterglow (softened by reduceFlashing). */
  lightning(strength = 1) {
    this._ltStart = this.t;
    this._ltStrength = Math.max(0, strength);
  }

  /**
   * How lit a world point is, 0..1 — the same lights, falloffs and shadow polygons that are drawn
   * (Tess's self-glow is a readability aid and is not counted).
   */
  lightAt(x, y) {
    let v = lum(this._ambRGB);
    for (const L of this._all) {
      if (L._cur <= 0.003 || !this._activeOn(L)) continue;
      const kind = L._P.kind;
      if (kind === 'ambient') { v += L._cur * lum(L._rgb); continue; }
      if (kind === 'shaft') continue;
      const dx = x - L.px;
      const dy = y - L.py;
      if (dx * dx + dy * dy >= L._reach * L._reach) continue;
      let f;
      if (kind === 'cone') f = this._coneTerm(L, dx, dy);
      else if (kind === 'spot') f = this._spotTerm(L, dx, dy);
      else if (L._shape === 'tube') f = falloffTube(Math.hypot(dx / TUBE_SX, dy / TUBE_SY) / L._r);
      else f = falloff(Math.hypot(dx, dy) / L._r);
      if (f <= 0) continue;
      if (L._shadows) {
        this._ensurePoly(L);
        if (L._nPoly >= 3 && !pointInPoly(L._poly, L._nPoly, x, y)) continue;
      }
      v += f * L._cur * lum(L._rgb);
    }
    v += this.beam.at(x, y, this.flashlight);
    const lt = this.lightningLevel;
    v += this.moon.at(x, y, 1 + lt * 5);
    v += lt * 0.3;
    return clamp01(v);
  }

  /** All lights currently managed (map + dynamic), for debugging/tools. */
  get lights() { return this._all; }

  /** Current lightning brightness 0..1 (FX makes rain streaks catch the flash). */
  get lightningLevel() { return this._ltEnv * this._ltStrength; }

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
    this.beam.updateMotes(dt, fl, this.t);
  }

  _updateLight(L, reduce) {
    // Position: px/py (world) or x/y (tiles) — whichever the owner changed last.
    if (L.px !== L._lpx || L.py !== L._lpy) {
      L.x = L.px / TILE - 0.5;
      L.y = L.py / TILE - 0.5;
      L._polyDirty = true;
    } else if (L.x !== L._lx || L.y !== L._ly) {
      L.px = L.x * TILE + 8;
      L.py = L.y * TILE + 8;
      L._polyDirty = true;
    }
    L._lpx = L.px; L._lpy = L.py; L._lx = L.x; L._ly = L.y;
    if (L.radius !== L._lradius || L.power !== L._lpower) {
      L._lradius = L.radius;
      L._lpower = L.power;
      this._setRadius(L);
    }
    if (L.color !== L._lcolor) { L._rgb = hexToRgb(L.color || L._P.color); L._lcolor = L.color; L._spriteDirty = true; }
    if (L.angle !== L._langle) { L._langle = L.angle; L._spriteDirty = true; }
    if (L.cone !== L._lcone) { L._lcone = L.cone; L._spriteDirty = true; }
    if (L.on !== L._lon) { L._lon = L.on; this._retarget(L, false); }

    let level;
    if (L._trans) {
      level = transitionLevel(L._trans, this.t);
      if (level < 0) { L._trans = null; level = L._target; }
    } else level = L._target;

    if (L._sfxAt >= 0 && this.t >= L._sfxAt) {
      L._sfxAt = -1;
      if (this._sfxBudget >= 1 && this._nearView(L)) {
        this._sfxBudget -= 1;
        HW.audio?.sfx?.(L._sfxId, { x: L.px, y: L.py, vol: L._sfxVol });
      }
    }
    const f = L._flickerMode === 'steady' ? 1 : flickerAt(L._flickerMode, this.t, L._seed, reduce);
    const cone = L._P.kind === 'cone' && L.power !== undefined ? 0.35 + 0.65 * clamp01(L.power) : 1;
    L._level = level;
    L._cur = Math.max(0, (L.intensity ?? L._P.intensity) * level * f * cone);
  }

  _setRadius(L) {
    const r = radiusPx(L);
    const reach = L._shape === 'tube' ? r * TUBE_SX : r;
    if (r !== L._r || reach !== L._reach) { L._r = r; L._reach = reach; L._polyDirty = true; }
    L._spriteDirty = true;
  }

  /** Recompute a light's effective on/off and start a transition if it changed. */
  _retarget(L, instant, mode, delay = 0, time = null) {
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
      else L._trans = makeFade(this.t, from, 1, time ?? L.fade ?? P.fade ?? 0.4, delay);
    } else {
      const m = mode || P.offMode || 'fade';
      if (m === 'fluor' || m === 'stutter') L._trans = makeFluorOff(this.t + delay, from, L._seed, reduce);
      else if (m === 'bang') L._trans = null;
      else L._trans = makeFade(this.t, from, 0, time ?? L.fade ?? P.fade ?? 0.3, delay);
    }
  }

  _scheduleSfx(L, id, delay, vol) {
    L._sfxId = id;
    L._sfxVol = vol;
    L._sfxAt = this.t + delay;
  }

  /** Only lights near the listener make their switch-on sound (and never a dozen at once). */
  _nearView(L) {
    const p = HW.player;
    const cx = p ? p.x : (HW.camera?.view?.x ?? 0) + W / 2;
    const cy = p ? p.y : (HW.camera?.view?.y ?? 0) + H / 2;
    return Math.abs(L.px - cx) < 400 && Math.abs(L.py - cy) < 300;
  }

  _effectiveOn(L) {
    if (L._killed || !this._activeOn(L)) return false;
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

  /** "The light dies where he is" (DESIGN §4.1): period lights near the shrouded Colonel stutter off. */
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
      if (L.group !== 'period') continue;
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
  /** Turn a def into a live light (the def object itself; callers may keep mutating it). */
  _makeLight(L) {
    const P = presetOf(L.type);
    L.type = L.type || 'bulb';
    L.id = L.id || `light_${++this._nextId}`;
    L._P = P;
    L._seed = hashStr(String(L.id));
    if (L.px === undefined) { L.px = (L.x ?? 0) * TILE + 8; L.py = (L.y ?? 0) * TILE + 8; }
    if (L.x === undefined) { L.x = L.px / TILE - 0.5; L.y = L.py / TILE - 0.5; }
    L._lpx = L.px; L._lpy = L.py; L._lx = L.x; L._ly = L.y;
    L._shape = L.shape || P.shape || 'round';
    L._shadows = L.shadows ?? P.shadows ?? true;
    L._rgb = hexToRgb(L.color || P.color);
    L._lcolor = L.color;
    if (L.angle === undefined) L.angle = DIR_ANGLE[L.dir] ?? (L.type === 'headlights' ? -Math.PI / 2 : Math.PI / 2);
    L._langle = L.angle;
    L._lcone = L.cone;
    L._lradius = L.radius;
    L._lpower = L.power;
    L._flickerMode = this._flickerModeOf(L, P);
    if (L.on === undefined) L.on = defaultOn(L);
    L._lon = L.on;
    L._trans = null;
    L._killed = false;
    L._killFar = 0;
    L._sfxAt = -1;
    L._cur = 0;
    L._poly = null;
    L._nPoly = 0;
    L._polyVer = -1;
    L._polyDirty = true;
    L._spriteDirty = true;
    L._cv = null;
    this._setRadius(L);
    L._target = this._effectiveOn(L) ? 1 : 0;
    L._level = L._target;
    return L;
  }

  _flickerModeOf(L, P) {
    if (typeof L.flicker === 'string') return L.flicker;
    if (L.flicker === true) return P.flickerAlt || 'dying';
    // Every hall has one: about one tube in seven is going bad (unless the map says flicker: false).
    if (L.flicker === undefined && P.flicker === 'fluor' && hash1(7, L._seed) < 0.15) return 'fluor_bad';
    return P.flicker || 'steady';
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
        L.flicker = d.flicker;
        L._flickerMode = this._flickerModeOf(L, L._P);
      } else {
        L = this._makeLight({ ...d });
        L._dx = d.x;
        L._dy = d.y;
      }
      next.push(L);
    }
    for (const c of map.windowCells || []) this._windows.push({ tx: c.tx, ty: c.ty, explicit: null });
    this._mapLights = next;
    this._moonDirty = true;
    this._rebuildAll();
    if (initial) {
      for (const L of this._all) {
        L._trans = null;
        L._killed = false;
        L._target = this._effectiveOn(L) ? 1 : 0;
        L._lon = L.on;
      }
    }
  }

  _rebuildAll() {
    this._all = this._mapLights.concat(this._dyn);
  }

  _rebuildGeometry(map) {
    this._grid = classifyCells(map);
    this._segs = buildSegments(this._grid);
    this._sys.grid = this._grid;
    this._sys.segs = this._segs;
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
    // (1 - level) · 1.75 in the map's tint + a softly tinted interior lift (lighting_ambient.js, v2.2)
    return ambientRGB(hexToRgb(color || '#0b1020'), clamp01(level));
  }

  /** (Re)compute a light's visibility polygon if its origin, reach or the geometry changed. */
  _ensurePoly(L) {
    if (!L._shadows) {
      // No polygon to rebuild, but the cached sprite is positioned at the light: a moved
      // shadowless light (a carried lamp, a drifting glow) must still redraw it.
      if (L._polyDirty) { L._polyDirty = false; L._spriteDirty = true; }
      return;
    }
    if (!L._polyDirty && L._polyVer === this._segVer) return;
    const o = nudgeOrigin(this._grid, L.px, L.py, this._nudge);
    const n = this._solver.compute(this._segs, o.x, o.y, L._reach + 2, this._tmpPoly, BLEED);
    if (!L._poly || L._poly.length < n * 2) L._poly = new Float32Array(Math.max(64, n * 2 + 32));
    L._poly.set(this._tmpPoly.subarray(0, n * 2));
    L._nPoly = n;
    L._polyVer = this._segVer;
    L._polyDirty = false;
    L._spriteDirty = true;
    this.stats.rebuilt++;
  }

  /** Render a light into its cached sprite (at intensity 1; black = no light). */
  _ensureSprite(L) {
    this._ensurePoly(L);
    if (!L._spriteDirty && L._cv) return;
    const r = L._reach;
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
      const tex = coneTexture(coneDeg(L.cone ?? P.cone), L.color || P.color, L.color || P.color, L.type === 'flashlight' ? 0.3 : 0.12);
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
      // Theatre spot: a hard-edged disc on the boards plus a faint spill.
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
      // A long ceiling tube: a wide, flat-topped pool.
      c.save();
      c.translate(L.px, L.py);
      c.scale(TUBE_SX, TUBE_SY);
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
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        c.beginPath();
        c.moveTo(L.px + Math.cos(a) * 5, L.py + Math.sin(a) * 5);
        c.lineTo(L.px + Math.cos(a - 0.045) * r, L.py + Math.sin(a - 0.045) * r);
        c.lineTo(L.px + Math.cos(a + 0.045) * r, L.py + Math.sin(a + 0.045) * r);
        c.closePath();
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
  }

  _coneTerm(L, dx, dy) {
    const P = L._P;
    const h = (coneDeg(L.cone ?? P.cone) * Math.PI) / 360;
    const twin = L.twin ?? P.twin ?? 0;
    let best = 0;
    for (let s = twin ? -1 : 1; s <= 1; s += 2) {
      const ex = dx + Math.sin(L.angle) * twin * s;
      const ey = dy - Math.cos(L.angle) * twin * s;
      const d = Math.hypot(ex, ey) / L._r;
      const th = Math.abs(wrapAngle(Math.atan2(ey, ex) - L.angle));
      best = Math.max(best, CONE.value(d, th, h, L.type === 'flashlight' ? 0.3 : 0.12) * (twin ? 0.62 : 1));
    }
    return best;
  }

  _spotTerm(L, dx, dy) {
    const disc = (L.disc ?? L._P.disc) * TILE;
    const d = Math.hypot(dx, dy / 0.72) / disc;
    const inDisc = d < 0.85 ? 1 : d < 1 ? (1 - d) / 0.15 : 0;
    return Math.max(inDisc, 0.22 * falloff(Math.hypot(dx, dy) / L._r));
  }

  // ============================================================================ render
  render(ctx, cam) {
    const t0 = performance.now();
    this.init();
    const map = HW.map;
    if (map !== this._map) this.onMapLoad(map);
    if (!map) return;
    if (map.opaqueVersion !== this._opaqueVer) this._rebuildGeometry(map);
    if (this._moonDirty) {
      this._moonDirty = false;
      this.moon.build(map, this._windows, this._solver, this._segs, K);
      this.catchLayer.build(map, this._grid, K);
    }
    this.stats.rebuilt = 0;

    // Lit (non-emissive) particles and dust go in before the multiply so the light reveals them.
    HW.fx?.renderLit?.(ctx, cam);

    const reduce = reduceFlashing();
    const fl = this.flashlight;
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

    for (const L of this._all) {
      if (L._P.kind === 'ambient' && L._cur > 0.003 && this._activeOn(L)) {
        lc.fillStyle = rgbStr(L._rgb, L._cur);
        lc.fillRect(0, 0, LW, LH);
      }
    }

    // Wall faces catch a little more of the ambient than the floor (room outlines stay legible).
    this.catchLayer.draw(lc, lmx, lmy, K, Math.min(CATCH_MAX, CATCH_GAIN * lum(this._ambRGB)));

    const lt = this.lightningLevel;
    this.moon.draw(lc, lmx, lmy, this.t, 1 + lt * 5, K, LW, LH);

    let drawn = 0;
    for (const L of this._all) {
      const kind = L._P.kind;
      if (kind === 'ambient' || kind === 'shaft' || L._cur <= 0.003 || !this._activeOn(L)) continue;
      const r = L._reach;
      if (L.px + r < cam.x || L.px - r > cam.x + W || L.py + r < cam.y || L.py - r > cam.y + H) continue;
      this._ensureSprite(L);
      let jx = 0;
      let jy = 0;
      const jit = L.jitter ?? L._P.jitter;
      if (jit) {
        // Flames lean and shiver: move the whole pool by whole lightmap pixels.
        jx = Math.round((noise1(this.t * 9, L._seed) - 0.5) * 2 * jit) * 2;
        jy = Math.round((noise1(this.t * 7, L._seed + 3) - 0.5) * 2 * jit) * 2;
      }
      const dx = (L._bx - lmx + jx) * K;
      const dy = (L._by - lmy + jy) * K;
      for (let v = L._cur; v > 0.003; v -= 1) {
        lc.globalAlpha = Math.min(1, v); // a bang-on overshoot can exceed 1: add it in passes
        lc.drawImage(L._cv, dx, dy);
      }
      drawn++;
    }
    lc.globalAlpha = 1;

    this.beam.draw(lc, fl, this._sys, lmx, lmy, K, this.t, reduce);
    this.beam.drawBounce(lc, fl, this._sys, lmx, lmy, K);
    this.beam.drawSelf(lc, fl, this.selfGlow, !!HW.player?.hidden, this._sys, lmx, lmy, K);

    if (lt > 0.001) {
      lc.fillStyle = rgbStr(LIGHTNING_RGB, lt * (map.data?.floor === 'EXT' ? 0.55 : 0.2));
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
    this.beam.haze(ctx, fl, cam);
    this._drawGlows(ctx, cam);
    this.moon.flash(ctx, cam, map, this._windows, lt, reduce, LIGHT_COLORS.lightning);
    this.beam.drawMotes(ctx, fl, cam, this.t);
    ctx.restore();

    const ms = performance.now() - t0;
    this.stats.ms = ms;
    this.stats.avg = this.stats.avg ? this.stats.avg * 0.95 + ms * 0.05 : ms;
    this.stats.lights = drawn;
  }

  /** Additive halos on visible fixtures (a lit sign, a bulb's hot core, a flame). */
  _drawGlows(ctx, cam) {
    for (const L of this._all) {
      const style = L.glow === undefined ? L._P.glow : L.glow;
      if (!style || L._cur <= 0.01 || !this._activeOn(L)) continue;
      const gx = L.px + (L.glowDx ?? L._P.glowDx ?? 0) - cam.x;
      const gy = L.py + (L.glowDy ?? L._P.glowDy ?? 0) - cam.y;
      if (gx < -40 || gx > W + 40 || gy < -150 || gy > H + 40) continue;
      const v = Math.min(1.2, L._cur);
      if (style === 'spot') { this._drawSpotColumn(ctx, L, gx, gy, v); continue; }
      const spec = GLOWS[style];
      if (!spec) continue;
      const s = glowSprite(L.color || L._P.color, spec[0], spec[1]);
      ctx.globalAlpha = spec[2] * v;
      if (style === 'headlights') {
        // One hot lamp each side of the bonnet.
        const ang = L.angle;
        const twin = L.twin ?? L._P.twin ?? 0;
        for (let k = -1; k <= 1; k += 2) {
          const hx = gx - Math.sin(ang) * twin * k + Math.cos(ang) * 4;
          const hy = gy + Math.cos(ang) * twin * k + Math.sin(ang) * 4;
          ctx.drawImage(s.canvas, Math.round(hx + s.ox), Math.round(hy + s.oy));
        }
        continue;
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
}

export const lighting = new LightingSystem();
export default lighting;
