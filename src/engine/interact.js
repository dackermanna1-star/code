// Interaction (TECH §6.2): find what the player faces, drive the UI prompt glyph, and resolve
// confirm presses and door bumps into behaviour.
//
// Resolution order for a prop: instance script → hiding spot → seat → door → pickup → transfer
// (`to`) → terminal/pa/safe/register system scripts → examine text / document.
import HW from './hw.js';
import { LOCKED_STATES, lockSatisfied, isDoorProp } from './map.js';
import { DIR_VEC } from './entities.js';

const TILE = 16;
const PROBE = 12;                 // px ahead of the feet
const EYES_HOLD = 0.3;            // s of held confirm (seated) before Tess shuts her eyes
const BUMP_REARM = 0.25;          // s without contact before the same door reacts to a bump again
const SYS_KINDS = new Set(['terminal', 'pa', 'safe', 'register']);
const METAL_DOORS = new Set(['door_metal', 'door_double', 'freezer_door']);
// Classroom/office doors swing shut behind you (CONTENT §7) unless a script opened them.
const AUTO_CLOSE = new Set(['door_class', 'door_glass', 'door_side']);
const AUTO_CLOSE_DELAY = 1.5;
const DEFAULT_LOCKED = {
  locked: '[n] Locked.',
  jammed: "[n] It won't budge. Something's wedged against it from the other side.",
  chained: '[n] Chained shut.',
};
// Higher wins when several props are in reach.
const PRIORITY = { pickup: 6, doc: 5, script: 5, npc: 5, door: 4, hide: 4, sys: 4, transfer: 4, seat: 2, examine: 1 };

export const interact = {
  target: null,
  verb: null,
  _lastBump: null,
  _lastBumpT: -10,
  _closing: [],     // [{ prop, map, t }] doors waiting to swing shut
  _seatPress: false,

  /** Called once per step after entities move. */
  update(dt) {
    this._tickDoors(dt);
    const p = HW.player;
    const input = HW.input;
    if (!p || !HW.map || !HW.game.controllable) {
      this._prompt(null, null);
      if (p) p.eyesShut = false; // a scene took over: eyes open, normal time
      this._seatPress = false;
      return;
    }
    // Inside a locker: confirm climbs out.
    if (p.hidden) {
      this._prompt(null, null);
      if (input.pressed('confirm')) {
        input.consume('confirm');
        HW.hiding?.exitLocker?.();
      }
      return;
    }
    // Seated: a tap of confirm shows the seat's examine text (if any), otherwise stands up;
    // holding it shuts Tess's eyes (time runs ×4 during periods, DESIGN §4.1).
    if (p.seated) {
      this._prompt(null, null);
      if (input.pressed('confirm')) { input.consume('confirm'); this._seatPress = true; }
      if (this._seatPress && input.down('confirm') && input.holdTime('confirm') >= EYES_HOLD) p.eyesShut = true;
      if (!input.down('confirm')) {
        const tap = this._seatPress && !p.eyesShut;
        this._seatPress = false;
        p.eyesShut = false;
        if (tap) this._seatAction(p.seated);
      }
      return;
    }
    this._seatPress = false;
    const t = this.findTarget(p);
    const verb = t ? this.verbFor(t) : null;
    this._prompt(t, verb);
    if (t && input.pressed('confirm')) {
      input.consume('confirm');
      this.activate(t);
    }
  },

  _seatAction(seat) {
    const text = seat.inst.examine ?? seat.def.examine;
    if (seat.inst.script) HW.scripts.run(seat.inst.script, { prop: seat, map: HW.map, seated: true });
    else if (text) HW.scripts.runFn((g) => g.examine(text), { prop: seat }, { id: `examine:${seat.id}` });
    else HW.hiding?.stand?.();
  },

  _prompt(t, verb) {
    this.target = t;
    this.verb = verb;
    try {
      HW.ui?.prompt?.(t, verb);
    } catch (e) {
      if (!this._promptErr) { this._promptErr = true; console.error('[interact] ui.prompt failed', e); }
    }
  },

  /** Is this prop something the player can act on right now? */
  interactable(p) {
    if (!p.present || p.pastOnly || p.inst.interact === false) return false;
    const def = p.def;
    if (p.inst.script) return true;
    if (isDoorProp(p)) return p.state !== 'open' || !!p.inst.to;
    if (isHideSpot(p)) return true;
    if (def.seat && p.state !== 'occupied' && !p.inst.noSit && !p.seatedBy) return true;
    if (def.interact === 'pickup' && p.inst.item) return true;
    if (p.inst.to) return true;
    if (SYS_KINDS.has(def.interact)) return true;
    return !!(p.inst.examine ?? def.examine) || !!p.inst.doc;
  },

  /** What kind of interaction this prop resolves to (for priority & verbs). */
  kindOf(p) {
    if (p.inst.script) return 'script';
    if (isDoorProp(p)) return 'door';
    if (isHideSpot(p)) return 'hide';
    if (p.def.seat && p.state !== 'occupied' && !p.inst.noSit && !p.seatedBy) return 'seat';
    if (p.def.interact === 'pickup' && p.inst.item) return 'pickup';
    if (p.inst.to) return 'transfer';
    if (SYS_KINDS.has(p.def.interact)) return 'sys';
    if (p.inst.doc) return 'doc';
    return 'examine';
  },

  verbFor(t) {
    if (t.kind === 'entity') return t.verb || 'Talk';
    if (t.inst.verb) return t.inst.verb;
    switch (this.kindOf(t)) {
      case 'door': return 'Open';
      case 'hide': return 'Hide';
      case 'seat': return 'Sit';
      case 'pickup': return 'Take';
      case 'doc': return 'Read';
      case 'examine': return 'Look';
      case 'script':
        if (isDoorProp(t)) return 'Open';
        if (t.def.interact === 'pickup') return 'Take';
        if (t.inst.doc) return 'Read';
        return t.def.interact === 'examine' ? 'Look' : 'Use';
      default: return 'Use';
    }
  },

  /** The prop/NPC in reach: probe point 12 px ahead of the feet (or underfoot for floor items). */
  findTarget(p) {
    const map = HW.map;
    const v = DIR_VEC[p.dir];
    const px = p.x + v[0] * PROBE;
    const py = p.y + v[1] * PROBE - 2;
    // NPCs with something to say.
    const ents = HW.entities.list;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e === p || !e.script || !e.visible) continue;
      if (Math.abs(e.x - px) <= 10 && py >= e.y - 18 && py <= e.y + 8) return e;
    }
    let best = null;
    let bestScore = -Infinity;
    const props = map.props;
    for (let i = 0; i < props.length; i++) {
      const q = props[i];
      if (!this.interactable(q)) continue;
      const x0 = q.x * TILE - 3;
      let y0 = q.y * TILE - 3;
      const x1 = (q.x + q.w) * TILE + 3;
      let y1 = (q.y + q.h) * TILE + 3;
      if (q.mount === 'wall') {
        if (p.dir !== 'up') continue;
        y1 += TILE; // reachable from the floor row below the wall face
      } else if (isDoorProp(q) && q.h >= 2) {
        y0 -= TILE; // doors are reachable from the threshold side too
      }
      const ahead = px >= x0 && px < x1 && py >= y0 && py < y1;
      const under = !ahead && !q.solid && q.mount !== 'wall'
        && p.x >= q.x * TILE && p.x < (q.x + q.w) * TILE && p.y >= q.y * TILE && p.y < (q.y + q.h) * TILE;
      if (!ahead && !under) continue;
      const score = (PRIORITY[this.kindOf(q)] || 0) * 10 + (ahead ? 5 : 0) - q.w * q.h * 0.1;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best;
  },

  /** Act on a target (confirm). */
  activate(t) {
    const ctxBase = { map: HW.map };
    if (t.kind === 'entity') return HW.scripts.run(t.script, { ...ctxBase, npc: t });
    const p = t;
    const ctx = { ...ctxBase, prop: p };
    switch (this.kindOf(p)) {
      case 'script': return HW.scripts.run(p.inst.script, ctx);
      case 'hide': return HW.hiding?.enterLocker?.(p);
      case 'seat': return HW.hiding?.sit?.(p);
      case 'door': return this.tryDoor(p);
      case 'pickup': return HW.scripts.runFn((g) => this.pickupFlow(g, p), ctx, { id: `pickup:${p.id}` });
      case 'transfer': return HW.scripts.runFn((g) => this.transferFlow(g, p), ctx, { id: `to:${p.id}` });
      case 'sys': {
        const id = `sys.${p.def.interact}`;
        if (HW.scripts.has(id)) return HW.scripts.run(id, ctx);
        return HW.scripts.runFn((g) => this.examineFlow(g, p), ctx, { id: `examine:${p.id}` });
      }
      default: return HW.scripts.runFn((g) => this.examineFlow(g, p), ctx, { id: `examine:${p.id}` });
    }
  },

  /** Walking into a solid prop. Doors react once per contact. */
  bump(p) {
    if (!isDoorProp(p) || !HW.game.controllable) return;
    const now = HW.time;
    const fresh = p !== this._lastBump || now - this._lastBumpT > BUMP_REARM;
    this._lastBump = p;
    this._lastBumpT = now;
    if (!fresh) return;
    if (p.inst.script) {
      HW.scripts.run(p.inst.script, { map: HW.map, prop: p, bump: true });
      return;
    }
    this.tryDoor(p);
  },

  /** Door behaviour (TECH §5.4), shared by bumps and confirm. */
  tryDoor(p) {
    const inst = p.inst;
    if (p.state === 'open') {
      if (inst.to) return HW.scripts.runFn((g) => this.transferFlow(g, p), { prop: p }, { id: `door:${p.id}` });
      return null;
    }
    const lockedState = LOCKED_STATES.has(p.state);
    const satisfied = inst.lock ? lockSatisfied(inst.lock, HW.state) : false;
    if ((lockedState && !satisfied) || (inst.lock && !satisfied)) {
      const sfx = p.state === 'chained' ? 'chain_rattle' : p.type === 'gate_accordion' ? 'gate_rattle' : 'door_locked';
      HW.audio?.sfx?.(sfx, this._center(p));
      const text = inst.lockedText || DEFAULT_LOCKED[p.state] || DEFAULT_LOCKED.locked;
      return HW.scripts.runFn((g) => g.examine(text), { prop: p }, { id: `locked:${p.id}` });
    }
    // A key turning: doors that were locked, or keyed (item) locks the first time. Condition gates
    // (flags, functions) just open.
    const keyed = typeof inst.lock === 'string' && inst.lock.startsWith('item:') && !p.pparams.unlocked;
    if (lockedState || keyed) {
      HW.audio?.sfx?.(inst.unlockSfx || 'key_unlock', this._center(p));
      HW.debug?.record?.('unlock', null, null, p.id);
      HW.map.setPropState(p.id, null, { unlocked: true });
    }
    this.openDoor(p);
    if (inst.to) return HW.scripts.runFn((g) => this.transferFlow(g, p), { prop: p }, { id: `door:${p.id}` });
    return null;
  },

  /**
   * Open a door now (persistent). Used by bumps, NPC walks and the AI. Classroom/office doors
   * opened this way swing shut 1.5 s after everyone has passed; `hold: true` (or a script's
   * g.setProp) keeps a door open.
   */
  openDoor(p, { by = 'player', silent = false, hold = false } = {}) {
    if (!p || p.state === 'open') return;
    const c = this._center(p);
    if (!silent) {
      const id = p.type === 'gate_accordion' ? 'gate_rattle' : METAL_DOORS.has(p.type) ? 'door_open_metal' : 'door_open_wood';
      HW.audio?.sfx?.(id, c);
      try { HW.noise?.emit?.(c.x, c.y, 5, 'door'); } catch (e) { console.error('[interact] noise failed', e); }
    }
    HW.map.setPropState(p.id, 'open');
    HW.debug?.record?.('door', null, null, `${p.id}:open`);
    HW.game.emit('doorOpen', p, by);
    const auto = p.inst.autoClose ?? AUTO_CLOSE.has(p.type);
    if (auto && !hold && !this._closing.some((d) => d.prop === p)) this._closing.push({ prop: p, map: HW.map, t: 0 });
  },

  /** Close a door (persistent), with its sound. */
  closeDoor(p, { silent = false } = {}) {
    if (!p || p.state !== 'open') return;
    if (!silent) HW.audio?.sfx?.(METAL_DOORS.has(p.type) ? 'door_close_metal' : 'door_close_wood', this._center(p));
    HW.map.setPropState(p.id, 'closed');
    HW.debug?.record?.('door', null, null, `${p.id}:close`);
    HW.game.emit('doorClose', p);
  },

  /** Auto-closing doors: count down once nobody stands in or right beside the doorway. */
  _tickDoors(dt) {
    const list = this._closing;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      const p = d.prop;
      if (d.map !== HW.map || p.state !== 'open') { list.splice(i, 1); continue; }
      if (this._doorwayBusy(p)) { d.t = 0; continue; }
      d.t += dt;
      if (d.t >= AUTO_CLOSE_DELAY) {
        list.splice(i, 1);
        this.closeDoor(p);
      }
    }
  },

  /** Is any visible entity within the door's swing zone (footprint ± one tile across the wall)? */
  _doorwayBusy(p) {
    const side = p.type === 'door_side';
    const x0 = (p.x - (side ? 1 : 0)) * TILE - 5;
    const x1 = (p.x + p.w + (side ? 1 : 0)) * TILE + 5;
    const y0 = (p.y - (side ? 0 : 2)) * TILE;
    const y1 = (p.y + p.h + (side ? 0 : 1)) * TILE + 2;
    const ents = HW.entities.list;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1) return true;
    }
    return false;
  },

  _center(p) {
    return { x: (p.x + p.w / 2) * TILE, y: (p.y + p.h / 2) * TILE };
  },

  async pickupFlow(g, p) {
    const n = p.inst.count || 1;
    g.removeProp(p.id);
    g.give(p.inst.item, n);
    HW.debug?.record?.('pickup', null, null, p.id);
    if (p.inst.examine) await g.examine(p.inst.examine);
  },

  async transferFlow(g, p) {
    const to = p.inst.to;
    if (!to || !to.map) return g.examine(p.inst.examine ?? p.def.examine);
    await HW.game.transfer(to.map, to.anchor, { fade: to.fade !== false, dir: to.dir, auto: true });
  },

  async examineFlow(g, p) {
    const text = p.inst.examine ?? p.def.examine;
    if (text) await g.examine(text);
    if (p.inst.doc) await g.doc(p.inst.doc);
    if (p.inst.banter) await g.banter(p.inst.banter);
  },
};

export function isHideSpot(p) {
  return (p.inst.hide ?? p.def.hide) === 'locker';
}

export default interact;
