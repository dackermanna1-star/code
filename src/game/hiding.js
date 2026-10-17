// Hiding (TECH §11, §6.2): sitting on seats, climbing into lockers, and "still" detection.
// DESIGN v2: in free play only seats protect; a locker is a hiding spot only when its instance
// says `hide: 'locker'` (the scripted gym locker).
//   HW.player.seated  — the seat prop while sitting (rule R2: seated + still = safe)
//   HW.player.hidden  — 'locker' while inside a hiding spot
//   HW.player.still   — no movement input for ≥ 0.5 s
//   HW.player.sitTime — HW.time of the last sit (sitting in his view counts as moving, DESIGN R2)
//   HW.player.eyesShut — holding Confirm while seated; during a period time runs ×4 (DESIGN §4.1)
//     unless HW.colonel.peeking is set (peeks play at normal speed)
// HW.hiding.isSafe() summarises it for the Colonel AI; seatNpc()/unseatNpc() seat followers.
import HW from '../engine/hw.js';

const TILE = 16;
const STILL_AFTER = 0.5;
const SIT_TIME = 0.18;
const STAND_TIME = 0.14;

/** Footprint cell of the seat nearest the player, as a sit point + sort bias. */
function seatSpot(prop, p) {
  const cx = Math.max(prop.x, Math.min(prop.x + prop.w - 1, Math.floor(p.x / TILE)));
  const cy = Math.max(prop.y, Math.min(prop.y + prop.h - 1, Math.floor(p.y / TILE)));
  const x = cx * TILE + 8;
  const y = cy * TILE + 12;
  // Sit "on" the seat: draw after the seat prop (whose sort key is its footprint bottom).
  return { x, y, bias: (prop.y + prop.h) * TILE - y + 0.25 };
}

export const hiding = {
  busy: false,
  stillTime: 0,
  _pre: null, // where the player stood before sitting / hiding

  reset() {
    this.busy = false;
    this.stillTime = 0;
    this._pre = null;
  },

  onMapLoad() {
    this.reset();
    HW.ui?.setOverlay?.('locker', null);
  },

  update(dt) {
    const p = HW.player;
    if (!p) return;
    const movingInput = HW.game.mode === 'play' && p.inputActive;
    this.stillTime = movingInput || (p.moving && !p.seated) ? 0 : this.stillTime + dt;
    p.still = this.stillTime >= STILL_AFTER;
    if (!p.seated) p.eyesShut = false;
    HW.game.timeWarp = p.eyesShut && p.still && HW.periods?.active && !HW.colonel?.peeking ? 4 : 1;
  },

  isSafe() {
    const p = HW.player;
    return !!p && (p.hidden === 'locker' || (!!p.seated && p.still));
  },

  /** Standing position to save/restore while seated or hidden (null when standing). */
  restorePoint() {
    const p = HW.player;
    if (!p || (!p.seated && !p.hidden) || !this._pre) return null;
    return { ...this._pre };
  },

  /** After an await: did a load/transfer replace the map or player? Then drop the move. */
  _stale(p, map) {
    if (HW.map === map && HW.player === p) return false;
    this.busy = false;
    return true;
  },

  async _move(p, x, y, sec) {
    const x0 = p.x;
    const y0 = p.y;
    await HW.game.tween(sec, (k) => {
      p.x = x0 + (x - x0) * k;
      p.y = y0 + (y - y0) * k;
    });
  },

  async sit(prop) {
    const p = HW.player;
    if (!p || this.busy || p.seated || p.hidden) return;
    this.busy = true;
    p.busy = true;
    this._pre = { x: p.x, y: p.y, dir: p.dir };
    const spot = seatSpot(prop, p);
    const desk = /desk|stool|chair|seat/.test(prop.type);
    HW.audio?.sfx?.(desk ? 'chair_scrape' : 'desk_creak', { x: spot.x, y: spot.y, vol: 0.7 });
    p.moving = false;
    const map = HW.map;
    await this._move(p, spot.x, spot.y, SIT_TIME);
    if (this._stale(p, map)) return;
    p.seated = prop;
    prop.seatedBy = p;
    p.sitTime = HW.time;
    p.sitDir = prop.inst.sitDir || prop.def.sitDir || 'up';
    p.face(p.sitDir);
    p.sortBias = spot.bias;
    p.busy = false;
    this.busy = false;
    this.stillTime = 0;
    HW.game.emit('sit', prop);
  },

  async stand() {
    const p = HW.player;
    if (!p || this.busy || !p.seated) return;
    this.busy = true;
    p.busy = true;
    const prop = p.seated;
    const pre = this._standPoint(p);
    prop.seatedBy = null;
    p.eyesShut = false;
    p.seated = null;
    p.sitDir = null;
    p.sortBias = 0;
    const map = HW.map;
    await this._move(p, pre.x, pre.y, STAND_TIME);
    if (this._stale(p, map)) return;
    this._pre = null;
    p.busy = false;
    this.busy = false;
    HW.game.emit('stand', prop);
  },

  /** Where to stand up: where we sat down from, else the nearest free spot around the seat. */
  _standPoint(p) {
    if (this._pre && p.free(this._pre.x, this._pre.y)) return this._pre;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [2, 0], [-2, 0]]) {
      const x = (tx + dx) * TILE + 8;
      const y = (ty + dy) * TILE + 12;
      if (p.free(x, y)) return { x, y };
    }
    return this._pre || { x: p.x, y: p.y };
  },

  /**
   * Seat an NPC/follower (followers sit on the period warning, DESIGN §4.1): walks to the seat
   * unless { walk: false }, then sits. Resolves false if the seat is taken or unreachable.
   */
  async seatNpc(e, prop, { walk = true, run = false } = {}) {
    if (!e || !prop || (prop.seatedBy && prop.seatedBy !== e)) return false;
    const map = HW.map;
    this.unseatNpc(e);
    prop.seatedBy = e; // reserve while walking
    const spot = seatSpot(prop, e);
    if (walk) {
      const path = map.findPath([e.x, e.y], [spot.x, spot.y], { doors: true });
      if (!path) { prop.seatedBy = null; return false; }
      const ok = await e.walkPath(path, { run });
      if (HW.map !== map || !ok) { if (prop.seatedBy === e) prop.seatedBy = null; return false; }
    }
    e.x = spot.x;
    e.y = spot.y;
    e.seat = prop;
    e.sitDir = prop.inst.sitDir || prop.def.sitDir || 'up';
    e.dir = e.sitDir;
    e.sortBias = spot.bias;
    return true;
  },

  /** Stand an NPC/follower up (they rejoin the caterpillar on their own). */
  unseatNpc(e) {
    if (!e || !e.seat) return;
    if (e.seat.seatedBy === e) e.seat.seatedBy = null;
    e.seat = null;
    e.sitDir = null;
    e.sortBias = 0;
  },

  /** Nearest free seat to a point (optionally inside a room id). */
  nearestSeat(x, y, { room = null, maxDist = 16 * 12 } = {}) {
    const map = HW.map;
    if (!map) return null;
    let best = null;
    let bestD = maxDist;
    for (const q of map.props) {
      if (!q.def.seat || q.seatedBy || q.state === 'occupied' || q.inst.noSit) continue;
      const cx = (q.x + q.w / 2) * TILE;
      const cy = (q.y + q.h / 2) * TILE;
      if (room && map.roomAt(cx, cy)?.id !== room) continue;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD) { bestD = d; best = q; }
    }
    return best;
  },

  async enterLocker(prop) {
    const p = HW.player;
    const map = HW.map;
    if (!p || !map || this.busy || p.hidden || p.seated) return;
    this.busy = true;
    p.busy = true;
    this._pre = { x: p.x, y: p.y, dir: p.dir };
    const cx = (prop.x + prop.w / 2) * TILE;
    const front = (prop.y + prop.h) * TILE + 4;
    HW.audio?.sfx?.('locker_open', { x: cx, y: front });
    map.setPropState(prop.id, 'open', null, { persist: false });
    await this._move(p, cx, front, 0.16);
    if (this._stale(p, map)) return;
    p.face('up');
    p.visible = false;
    p.hidden = 'locker';
    p.hideProp = prop;
    // Inside: feet at the locker's footprint (what the Colonel searches).
    p.x = cx;
    p.y = (prop.y + prop.h) * TILE - 4;
    await HW.game.tween(0.18, () => {});
    if (this._stale(p, map)) return;
    map.setPropState(prop.id, 'closed', null, { persist: false });
    HW.audio?.sfx?.('locker_close', { x: cx, y: front });
    HW.ui?.setOverlay?.('locker', { phase: 0, faceIn: 0 });
    p.busy = false;
    this.busy = false;
    HW.game.emit('hide', prop);
  },

  async exitLocker() {
    const p = HW.player;
    const map = HW.map;
    if (!p || !map || this.busy || !p.hidden) return;
    this.busy = true;
    p.busy = true;
    const prop = p.hideProp;
    const cx = prop ? (prop.x + prop.w / 2) * TILE : p.x;
    const front = prop ? (prop.y + prop.h) * TILE + 4 : p.y;
    HW.ui?.setOverlay?.('locker', null);
    if (prop) map.setPropState(prop.id, 'open', null, { persist: false });
    HW.audio?.sfx?.('locker_open', { x: cx, y: front });
    p.x = cx;
    p.y = front;
    p.visible = true;
    p.hidden = null;
    p.hideProp = null;
    p.face('down');
    const pre = this._pre && p.free(this._pre.x, this._pre.y) ? this._pre : null;
    if (pre) await this._move(p, pre.x, pre.y, 0.14);
    if (this._stale(p, map)) return;
    if (prop) map.setPropState(prop.id, 'closed', null, { persist: false });
    this._pre = null;
    p.busy = false;
    this.busy = false;
    HW.game.emit('unhide', prop);
  },
};

export default hiding;
