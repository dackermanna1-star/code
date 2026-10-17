// Map weather (v2.2) — HW.weather. Applies `map.data.weather` while a map is loaded:
//   weather: { rain: 0..1.5 | true,    // HW.fx.rain(on, intensity) — eases in/out; no `weather` = no rain
//              steam: true,             // steam wisps from `steam_vent` props near the camera
//              steamGap: [0.3, 0.75] }  // seconds between wisps (optional)
//
// The prologue script (src/data/scripts/pro.js, installWeather) registers its own small system that
// does the same for the exterior. Two systems would double the steam, so this one DEFERS while a
// foreign weather system is installed (detected by its handling `steam_vent` props): pro.js keeps
// driving the exterior exactly as before, and this takes over for any map/build where it is absent.
// API: active (this system is driving weather), deferred (a foreign system is), apply(map).
import HW from '../engine/hw.js';

const TILE = 16;

export const weather = {
  _t: 0,
  _foreignN: -1,
  _foreign: false,

  /** Is another (script-installed) weather system registered? Re-checked when the system list changes. */
  get deferred() {
    const list = HW.game?.systems || [];
    if (list.length !== this._foreignN) {
      this._foreignN = list.length;
      this._foreign = list.some((s) => s && s !== this && typeof s.update === 'function'
        && /steam_vent/.test(String(s.update)) && /weather/.test(String(s.onMapLoad || '')));
    }
    return this._foreign;
  },

  get active() { return !this.deferred && !!HW.map?.data?.weather; },

  /** Apply a map's weather now (rain on/off). Called on every map load. */
  apply(map) {
    const w = map?.data?.weather;
    const rain = w ? (w.rain === true ? 1 : Number(w.rain) || 0) : 0;
    try { HW.fx?.rain?.(rain > 0, rain || 1); } catch (e) { console.error('[weather] rain', e); }
  },

  onMapLoad(map) {
    this._t = 0;
    if (this.deferred) return;
    this.apply(map);
  },

  update(dt) {
    const map = HW.map;
    const w = map?.data?.weather;
    if (!w?.steam || this.deferred) return;
    this._t -= dt;
    if (this._t > 0) return;
    const [g0, g1] = Array.isArray(w.steamGap) ? w.steamGap : [0.3, 0.75];
    this._t = g0 + Math.random() * Math.max(0, g1 - g0);
    const cam = HW.camera?.view;
    const near = (p) => !cam || (p.x * TILE > cam.x - 32 && p.x * TILE < cam.x + (cam.w || 480) + 32
      && p.y * TILE > cam.y - 32 && p.y * TILE < cam.y + (cam.h || 270) + 48);
    let pick = null;
    let n = 0;
    for (const p of map.props) {
      if (p.type !== 'steam_vent' || !near(p)) continue;
      n++;
      if (Math.random() * n < 1) pick = p; // reservoir pick, no allocation
    }
    if (!pick) return;
    try { HW.fx?.emit?.('steam', pick.x * TILE + 8, pick.y * TILE + 10, 1 + Math.floor(Math.random() * 2)); } catch (e) { /* fx not ready */ }
  },
};

export default weather;
