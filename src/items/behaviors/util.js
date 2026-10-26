// Helpers shared by behavior handlers (kept separate to avoid import cycles).
import { G } from '../../game.js';

// find an owned item matching a predicate that is reachable (hand, storage, containers, world)
export function findOwned(pred) {
  return G.items.all().find((i) => !['package', 'gone', 'placing'].includes(i.data.loc) && pred(i));
}

export function usesLeft(inst) { const m = inst.def.use?.uses; return m ? (inst.st.uses ?? m) : null; }

// decrement a "uses" counter; destroys the item (and optionally leaves something behind) when empty
export function consumeUse(inst, n = 1) {
  const max = inst.def.use?.uses;
  if (!max) return;
  inst.st.uses = (inst.st.uses ?? max) - n;
  if (inst.st.uses <= 0) {
    const name = inst.def.name;
    const left = inst.def.use.leftover;
    const wasHeld = G.hand.held === inst;
    G.items.destroy(inst);
    if (left) {
      const l = G.items.spawn(left, { loc: 'storage' });
      if (wasHeld && l) G.hand.take(l);
    }
    G.ui.toast(`${name} is all used up`, { icon: '🫙' });
  }
}

export const behaviors = { consumeUse, usesLeft };

export function itemWorldPos(inst, offset = null) {
  const o = inst.object;
  const p = offset ? offset.clone() : o.position.clone().set(0, 0, 0);
  return o.localToWorld(p);
}
