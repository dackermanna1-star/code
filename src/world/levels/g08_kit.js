// Helpers shared by the levels of group 08 (names defined here start with g08_).
import { rasterText } from '../../gfx/font.js';
import { W, CF, hr, levelDoor, cbox } from './kit.js';
import { FACE, only } from '../pocket/e_util.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
export const pmod = (a, n) => ((a % n) + n) % n;

// hash helpers: integer pairs -> 0..1 (same value in every zone)
export const h2 = (a, b, s = 0) => hr(Math.floor(a), Math.floor(b), s);

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

// Wall edge helpers in absolute coordinates (edges of cells outside the zone are ignored).
// The edge 'N' of cell (x, z) lies on the line z; 'W' on the line x.
export function wallN(zb, x, z, type, m1, m2) { zb.setWall(x, z, 'N', type, m1, m2); }
export function wallW(zb, x, z, type, m1, m2) { zb.setWall(x, z, 'W', type, m1, m2); }

// A level door standing in a wall: (x, z) is the cell the player stands in, dir ('N' | 'S' | 'E' |
// 'W') the direction of the wall from that cell. The wall edge becomes a doorway and the door
// stands in it facing the player. Returns the door record.
export function doorInWall(zb, x, z, dir, matPlayer, matBack, opts = {}) {
  let ex, ez, e, rot, dx, dz, mm, mp;
  if (dir === 'S') { ex = x; ez = z + 1; e = 'N'; rot = 0; dx = x + 0.5; dz = z + 1; mm = matPlayer; mp = matBack; }
  else if (dir === 'N') { ex = x; ez = z; e = 'N'; rot = Math.PI; dx = x + 0.5; dz = z; mm = matBack; mp = matPlayer; }
  else if (dir === 'E') { ex = x + 1; ez = z; e = 'W'; rot = -Math.PI / 2; dx = x + 1; dz = z + 0.5; mm = matPlayer; mp = matBack; }
  else { ex = x; ez = z; e = 'W'; rot = Math.PI / 2; dx = x; dz = z + 0.5; mm = matBack; mp = matPlayer; }
  zb.setWall(ex, ez, e, W.DOOR, mm, mp);
  return levelDoor(zb, dx, dz, rot, opts);
}

// Floors and ceilings as a few big subdivided slabs instead of one quad per 1 m cell (about a
// quarter of the triangles). The cells keep their floor / ceiling heights (walls and lighting
// read them) but are flagged VOID so the engine draws and collides nothing for them; the slabs
// do. Call voidCells(zb) first, then slab the areas.
export function voidCells(zb) { zb.flags.fill(CF.VOID); }
export function floorSlab(zb, x0, z0, x1, z1, mat, y = 0, sub = 2) {
  return cbox(zb, x0, y - 0.25, z0, x1, y, z1, mat, { skip: only(FACE.PY), sub });
}
export function ceilSlab(zb, x0, z0, x1, z1, mat, y, sub = 2) {
  return cbox(zb, x0, y, z0, x1, y + 0.25, z1, mat, { skip: only(FACE.NY), sub, collide: false });
}
