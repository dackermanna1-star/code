// Mom's compact mirror (TECH §5.6, §11; DESIGN R8): shows the room as it was on Oct 19, 1979
// when Tess stands inside one of the map's `past` rects.
//   HW.compact.use()          toggle (or Tess remarks on her reflection)
//   HW.compact.active         past view showing
//   HW.compact.current        the active past entry (map.past[i]) | null
//   HW.compact.hasPastHere    player stands inside a past rect whose `cond` holds, and the compact is
//                             unlocked (flag compact_unlocked) — the HUD sparkle hint
// Past entries may carry `cond: (state) => bool` (Integration 2): a failing cond hides the view.
import HW from '../engine/hw.js';

const TILE = 16;

const LOCKED_LINES = [
  "[exhausted] Just my face. I look terrible.",
  "[skeptical] Mom's compact. The crack runs right through my face.",
  "[sad] It still smells like her powder.",
];
const NOTHING_LINES = [
  "[exhausted] Just my face. I look terrible.",
  '[neutral] Just the room. Just me.',
  "[worried] Nothing. Whatever she wants me to see, it isn't here.",
];

export const compact = {
  active: false,
  current: null,
  _lineIdx: 0,

  /** Past entry under the player whose `cond(state)` holds (if it has one), or null. */
  pastHere() {
    const p = HW.player;
    const map = HW.map;
    if (!p || !map || !map.past.length) return null;
    return map.pastAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE), HW.state);
  },

  /** HUD sparkle: only once the compact works (flag compact_unlocked) and a live past view is here. */
  get hasPastHere() {
    return this.unlocked && !!this.pastHere();
  },

  get unlocked() {
    return !!HW.state?.flags?.compact_unlocked;
  },

  /** Q / inventory "Use". Returns true if the past view is now showing. */
  use() {
    const s = HW.state;
    if (!s || !(s.inv.compact > 0)) return false;
    if (this.active) {
      this.close();
      return false;
    }
    const past = this.unlocked ? this.pastHere() : null;
    if (!past) {
      const lines = this.unlocked ? NOTHING_LINES : LOCKED_LINES;
      const line = lines[this._lineIdx++ % lines.length];
      HW.scripts.runFn((g) => g.examine(line), {}, { id: 'compact.reflection' });
      return false;
    }
    this.open(past);
    return true;
  },

  open(past) {
    this.active = true;
    this.current = past;
    HW.audio?.sfx?.('glass_tone');
    HW.ui?.setOverlay?.('compact', { on: true, hint: past.hint || null, id: past.id });
    HW.debug?.record?.('compact', null, null, past.id);
    if (past.setFlag) HW.state.flags[past.setFlag] = true;
    HW.game.emit('compact', true, past);
    if (past.script) HW.scripts.run(past.script, { past, map: HW.map });
  },

  /** Close the view. `silent` skips the sound (map loads, resets). */
  close(silent = false) {
    if (!this.active) return;
    const past = this.current;
    this.active = false;
    this.current = null;
    if (!silent) HW.audio?.sfx?.('glass_tone', { rate: 0.8, vol: 0.6 });
    HW.ui?.setOverlay?.('compact', { on: false });
    HW.game?.emit?.('compact', false, past);
  },

  onMapLoad() {
    this.close(true);
  },

  update() {
    if (!this.active) return;
    // Walking out of the remembered room ends the vision.
    if (this.pastHere() !== this.current) this.close();
  },
};

export default compact;
