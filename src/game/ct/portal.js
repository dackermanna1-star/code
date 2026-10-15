// Seamless portals (line special 900, tools/ct/SPEC.md section 5): two lines
// with special 900 and the same tag are one seam. Crossing a line from its
// front to its back moves the thing to the same fraction along the partner,
// just past it on the partner's back side (back to front lands on the
// partner's front side). Angle and momentum turn by the difference between
// the two lines' directions and the height above the floor is kept, so the
// move can't be seen or felt. Players and monsters use them, missiles don't.
//
// The pairing is static map data (rebuilt from the lines on load). The modern
// AI's sector graph gets portal edges (ai.js), and noise floods through
// (enemy.js), so zombies follow the player across.

import { MF, normAngle } from '../defs.js';
import { pointOnLineSide, setThingPosition, unsetThingPosition } from '../maputl.js';
import { checkPosition, mapState, STEPHEIGHT } from '../map.js';

export const PORTAL = 900;

// Partner lines: Map line -> line, for every complete pair.
export function buildPortals(level) {
  const byTag = new Map();
  for (const line of level.lines) {
    if (line.special !== PORTAL) continue;
    if (!byTag.has(line.tag)) byTag.set(line.tag, []);
    byTag.get(line.tag).push(line);
  }
  const partner = new Map();
  for (const lines of byTag.values()) {
    if (lines.length !== 2) continue; // an unpaired or ambiguous seam stays a plain line
    partner.set(lines[0], lines[1]);
    partner.set(lines[1], lines[0]);
  }
  return partner;
}

// The rigid transform from line a's frame to line b's: a point keeps its
// fraction along the line and its signed distance from it (back side
// positive), so a point just past a lands just past b on the same side.
export function portalTransform(a, b) {
  const la = a.length || Math.hypot(a.dx, a.dy) || 1;
  const lb = b.length || Math.hypot(b.dx, b.dy) || 1;
  const ua = [a.dx / la, a.dy / la], ub = [b.dx / lb, b.dy / lb];
  const rot = Math.atan2(b.dy, b.dx) - Math.atan2(a.dy, a.dx);
  const point = (x, y) => {
    const rx = x - a.v1.x, ry = y - a.v1.y;
    const t = (rx * ua[0] + ry * ua[1]) / la;
    const n = -rx * ua[1] + ry * ua[0]; // distance to the left (back) of a
    return [b.v1.x + ub[0] * t * lb - ub[1] * n, b.v1.y + ub[1] * t * lb + ub[0] * n];
  };
  const c = Math.cos(rot), s = Math.sin(rot);
  const vector = (x, y) => [x * c - y * s, x * s + y * c];
  return { point, vector, rot };
}

// Does a move from (x0,y0) to (x1,y1) pass through the portal line itself
// (not just its extension)?
function crosses(line, x0, y0, x1, y1) {
  const s0 = pointOnLineSide(x0, y0, line), s1 = pointOnLineSide(x1, y1, line);
  if (s0 === s1) return false;
  const ax = line.v1.x, ay = line.v1.y, bx = line.v2.x, by = line.v2.y;
  const d1 = (x1 - x0) * (ay - y0) - (y1 - y0) * (ax - x0);
  const d2 = (x1 - x0) * (by - y0) - (y1 - y0) * (bx - x0);
  return (d1 <= 0 && d2 >= 0) || (d1 >= 0 && d2 <= 0);
}

// The portal line a move from the thing's position to (x, y) passes, if any.
export function portalCrossed(ct, thing, x, y) {
  if (thing.flags & (MF.MISSILE | MF.NOCLIP | MF.TELEPORT)) return null;
  if (!thing.player && !(thing.flags & MF.SHOOTABLE)) return null;
  for (const line of ct.portalLines) {
    if (crosses(line, thing.x, thing.y, x, y)) return line;
  }
  return null;
}

// Monster move directions (enemy.js DI) turned by a rotation in radians.
function turnDir(dir, rot) {
  if (dir === 8) return dir;
  return (dir + Math.round(rot / (Math.PI / 4)) + 64) & 7;
}

// Moves `thing` (about to step to (x, y) across portal line `line`) to the
// matching spot past the partner. Returns false if it doesn't fit there, in
// which case the thing stays put, like hitting a wall. Fills mapState.portal
// with the rotation so a caller splitting a long move can turn the rest.
export function portalMove(w, thing, line, x, y) {
  const partner = w.ct.portals.get(line);
  if (!partner) return null;
  const T = portalTransform(line, partner);
  let [nx, ny] = T.point(x, y);
  // Keep a hair's distance from the partner on the side the thing arrives.
  const side = pointOnLineSide(x, y, line);
  if (pointOnLineSide(nx, ny, partner) !== side) {
    const len = partner.length || 1;
    const k = side ? 0.5 : -0.5; // back side is left of v1->v2
    nx += (-partner.dy / len) * k;
    ny += (partner.dx / len) * k;
  }
  const srcFloor = w.pointInSubsector(x, y).sector.floorheight;
  const dstFloor = w.pointInSubsector(nx, ny).sector.floorheight;
  const dz = dstFloor - srcFloor;
  const nz = thing.z + dz;
  if (!checkPosition(w, thing, nx, ny)) return false;
  const tm = mapState;
  if (tm.ceilingz - tm.floorz < thing.height) return false;
  if (tm.ceilingz - nz < thing.height) return false;
  const step = thing.stepHeight != null ? thing.stepHeight : STEPHEIGHT;
  if (tm.floorz - nz > step) return false;
  const floorz = tm.floorz, ceilingz = tm.ceilingz;
  // Interpolation continues in the new frame.
  const [px, py] = T.point(thing.px, thing.py);
  unsetThingPosition(w, thing);
  thing.x = nx;
  thing.y = ny;
  thing.z = nz;
  thing.floorz = floorz;
  thing.ceilingz = ceilingz;
  setThingPosition(w, thing);
  [thing.momx, thing.momy] = T.vector(thing.momx, thing.momy);
  thing.angle = normAngle(thing.angle + T.rot);
  thing.px = px;
  thing.py = py;
  thing.pz += dz;
  thing.pangle += T.rot;
  thing.movedir = turnDir(thing.movedir, T.rot);
  if (thing.player) {
    thing.player.viewz += dz;
    if (thing.player.prevViewz != null) thing.player.prevViewz += dz;
    if (thing.player.jumpFloor != null) thing.player.jumpFloor += dz;
  }
  tm.portal = { rot: T.rot };
  if (w.fx && w.fx.portaled) w.fx.portaled(thing, T.rot);
  return true;
}

// The sector a thing reaches by stepping through `line` out of `sec`
// (for sound and the AI graph): front -> partner's back, back -> front.
export function portalExitSector(w, line, sec) {
  const partner = w.ct && w.ct.portals.get(line);
  if (!partner) return null;
  return sec === line.frontsector ? partner.backsector : partner.frontsector;
}

// Directed AI graph edges through every portal: stepping through `line`
// from its front reaches the partner's back sector, and vice versa. `mid`
// is where the step is taken, `exit` where the thing comes out, `sgn` the
// side of `line` to aim for (1 = back, -1 = front; see ai.js chaseGoal).
export function portalEdges(w) {
  const out = [];
  for (const [line, partner] of w.ct.portals) {
    if (!line.frontsector || !line.backsector || !partner.frontsector || !partner.backsector) continue;
    const mid = { x: (line.v1.x + line.v2.x) / 2, y: (line.v1.y + line.v2.y) / 2 };
    const exit = { x: (partner.v1.x + partner.v2.x) / 2, y: (partner.v1.y + partner.v2.y) / 2 };
    out.push({ from: line.frontsector, edge: { line, to: partner.backsector, mid, exit, sgn: 1, portal: true } });
    out.push({ from: line.backsector, edge: { line, to: partner.frontsector, mid, exit, sgn: -1, portal: true } });
  }
  return out;
}
