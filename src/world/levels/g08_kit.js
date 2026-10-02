// Helpers shared by the levels of group 08.
import { rasterText } from '../../gfx/font.js';
import { CF, cbox } from './kit.js';
import { FACE, only } from '../pocket/e_util.js';

export const pmod = (a, n) => ((a % n) + n) % n;

// Text painted into a texture with independent horizontal / vertical pixel size (the built-in
// font is 5x7 with a 6 px advance).
export function bigText(p, str, x, y, sx, sy, col, al = 1) {
  rasterText(str, 0, 0, 1, (px, py) => p.rect(x + px * sx, y + py * sy, sx, sy, col, al));
}
export const textW = (str, sx = 1) => (str.length * 6 - 1) * sx;
export function centerText(p, str, cx, y, sx, sy, col, al = 1) {
  bigText(p, str, Math.round(cx - textW(str, sx) / 2), y, sx, sy, col, al);
}

// Drive flicker channels from a level script. The game recomputes every channel each frame in
// render(), so a script that wants a channel to follow its own value wraps the update once and
// applies fn(flicker, time) after it. fn does nothing outside the level it belongs to.
export function driveFlicker(game, level, fn) {
  const f = game.flicker;
  if (!f) return;
  let hook = f.__g08;
  if (!hook) {
    hook = f.__g08 = { fns: new Map() };
    const orig = f.update.bind(f);
    f.update = (t) => {
      orig(t);
      for (const [lv, h] of hook.fns) if (game.levelN === lv) { try { h(f, t); } catch (e) { hook.fns.delete(lv); } }
    };
  }
  hook.fns.set(level, fn);
}

// Floors and ceilings as a few big subdivided slabs instead of one quad per 1 m cell (about a
// quarter of the triangles). The cells keep their floor / ceiling heights (walls and lighting
// read them) but are flagged VOID so the engine draws and collides nothing for them; the slabs
// do. Call voidCells(zb) first, then slab the areas. (Solid cells next to VOID cells draw no
// faces: use brushes for solid masses.)
export function voidCells(zb) { zb.flags.fill(CF.VOID); }
export function floorSlab(zb, x0, z0, x1, z1, mat, y = 0, sub = 2) {
  return cbox(zb, x0, y - 0.25, z0, x1, y, z1, mat, { skip: only(FACE.PY), sub });
}
export function ceilSlab(zb, x0, z0, x1, z1, mat, y, sub = 2) {
  return cbox(zb, x0, y, z0, x1, y + 0.25, z1, mat, { skip: only(FACE.NY), sub, collide: false });
}
