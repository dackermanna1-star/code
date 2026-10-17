// HW.breaker — the breaker boys' cap-lamps (DESIGN §6 VIII.4, VIII.6; CONTENT §2.13, §5.8).
//
// On a map whose lights include groups 'lamp_1'..'lamp_N' (map lights `{ type: 'lamp_miner', group:
// 'lamp_N', on: false }`, or lamp props with such a light), the lamps light ONE BY ONE AHEAD of Tess
// as she climbs: lamp N lights when Tess's tile y ≤ its y + `lead` (default 6 tiles), in N order, at
// least 0.35 s apart — the dead lighting her way. Map data may instead give explicit thresholds:
// `breaker: { thresholds: [ty1, ty2, …], lead }` (lamp N lights when Tess's tile y ≤ thresholds[N-1]).
// In DISMISSED, extinguish() puts them out peacefully, one by one from the top.
// Persisted: flag breaker_lamps (how many are lit), flag breaker_out (extinguished).
//
// API
//   lamps → [{ n, group, x, y }] · lit (count) · out (bool)
//   lightNext() → bool            light the next lamp now
//   extinguish({ interval = 0.9, follow = false }) → Promise
//                                 out one by one from the highest; follow: each goes out once Tess is
//                                 two tiles below it (as she climbs down) instead of on a timer.
//   reset()                       all dark again (debug)
import HW from '../engine/hw.js';
import { inFreePlay } from './periods.js';

const TILE = 16;
const LEAD = 6;
const GAP = 0.35;
const RE = /^lamp_(\d+)$/;

export const breaker = {
  lamps: [],
  _gap: 0,
  _ext: null,           // { i, t, interval, follow, resolve }
  _cfg: null,
  _hooked: false,

  get lit() { return Number(HW.state?.flags?.breaker_lamps) || 0; },
  get out() { return !!HW.state?.flags?.breaker_out; },

  _scan(map) {
    const groups = new Map();
    for (const L of map?.lightDefs || []) {
      const m = RE.exec(L.group || '');
      if (!m) continue;
      const n = Number(m[1]);
      const g = groups.get(n);
      if (!g) groups.set(n, { n, group: L.group, x: L.x, y: L.y });
      else if (L.y < g.y) g.y = L.y;
    }
    this.lamps = [...groups.values()].sort((a, b) => a.n - b.n);
    this._cfg = map?.data?.breaker || null;
  },

  /** Re-assert every lamp's group state from the flags (group state is global across loads). */
  _apply() {
    const L = HW.lighting;
    if (!L?.setGroup) return;
    const lit = this.lit;
    const out = this.out;
    this.lamps.forEach((lp, i) => {
      if (out) L.setGroup(lp.group, false, { mode: 'instant' });
      else if (i < lit) L.setGroup(lp.group, true, { mode: 'instant' });
      else L.setGroup(lp.group, null, { mode: 'instant' });
    });
  },

  lightNext() {
    const i = this.lit;
    const lp = this.lamps[i];
    if (!lp || this.out) return false;
    HW.lighting?.setGroup?.(lp.group, true, { mode: 'fade', time: 0.9 });
    HW.audio?.sfx?.('husk_rustle', { x: lp.x * TILE + 8, y: lp.y * TILE + 8, vol: 0.5 });
    HW.state.flags.breaker_lamps = i + 1;
    HW.debug?.record?.('breaker', null, null, `lamp:${lp.n}`);
    this._gap = GAP;
    return true;
  },

  extinguish({ interval = 0.9, follow = false } = {}) {
    if (!HW.state) return Promise.resolve(false);
    return new Promise((resolve) => {
      this._ext = { i: Math.min(this.lit, this.lamps.length) - 1, t: 0.4, interval, follow, resolve };
      if (this._ext.i < 0) this._finishExt();
    });
  },

  _finishExt() {
    const ext = this._ext;
    this._ext = null;
    HW.state.flags.breaker_out = true;
    ext?.resolve?.(true);
  },

  reset() {
    if (HW.state?.flags) {
      delete HW.state.flags.breaker_lamps;
      delete HW.state.flags.breaker_out;
    }
    this._ext = null;
    this._apply();
  },

  _threshold(i) {
    const lp = this.lamps[i];
    const th = this._cfg?.thresholds;
    if (Array.isArray(th) && Number.isFinite(th[i])) return th[i];
    return lp.y + (this._cfg?.lead ?? LEAD);
  },

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    HW.game.on('load', () => { this._ext = null; this._apply(); });
  },

  onMapLoad(map) {
    this._hook();
    this._ext = null;
    this._scan(map);
    if (this.lamps.length) this._apply();
  },

  update(dt) {
    this._hook();
    if (!this.lamps.length) return;
    const p = HW.player;
    if (!p) return;
    const ext = this._ext;
    if (ext) {
      ext.t -= dt;
      const lp = this.lamps[ext.i];
      const ready = ext.follow ? p.y / TILE > lp.y + 2 : ext.t <= 0;
      if (ready) {
        HW.lighting?.setGroup?.(lp.group, false, { mode: 'fade', time: 1.8 });
        HW.debug?.record?.('breaker', null, null, `out:${lp.n}`);
        ext.i--;
        ext.t = ext.interval;
        if (ext.i < 0) this._finishExt();
      }
      return;
    }
    if (this.out || !inFreePlay()) return;
    if (this._gap > 0) { this._gap -= dt; return; }
    const i = this.lit;
    if (i >= this.lamps.length) return;
    if (Math.floor(p.y / TILE) <= this._threshold(i)) this.lightNext();
  },
};

export default breaker;
