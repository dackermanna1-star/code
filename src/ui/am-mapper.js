// Automap "seen line" tracking. DOOM sets ML_MAPPED on a linedef when the
// software renderer draws one of its segs; there is no such pass with the
// GPU renderer, so every tic a budget of nearby unmapped lines is tested
// for line of sight from the player's eye (inside the horizontal field of
// view, like rendered segs) and the visible ones get marked.

import { ML } from '../game/mapdata.js';
import { sightTrace } from '../game/sight.js';

const RANGE = 1600; // map units
const TRACE_BUDGET = 48; // sight traces per tic
const SCAN_BUDGET = 640; // lines examined per tic
const NEAR = 2; // sample points sit this far in front of the line

export class LineMapper {
  constructor() {
    this.w = null;
    this.cursor = 0;
  }

  reset(w) {
    this.w = w;
    this.cursor = 0;
    this.lastSector = null;
  }

  // halfTan: tangent of half the horizontal field of view.
  tick(player, halfTan) {
    const w = this.w;
    const mo = player && player.mo;
    if (!w || !mo || !mo.subsector) return;
    const lines = w.level.lines;
    const n = lines.length;
    if (!n) return;
    const ex = mo.x, ey = mo.y;
    const ez = player.viewz || mo.z + 41;

    // Lines around the player's own sector count as seen.
    const sec = mo.subsector.sector;
    if (sec !== this.lastSector) {
      this.lastSector = sec;
      for (const line of sec.lines) {
        if (!(line.flags & ML.MAPPED) && this.distTo(line, ex, ey) < RANGE) line.flags |= ML.MAPPED;
      }
    }

    const fx = Math.cos(mo.angle), fy = Math.sin(mo.angle);
    let traces = TRACE_BUDGET;
    const scan = Math.min(n, SCAN_BUDGET);
    for (let k = 0; k < scan && traces > 0; k++) {
      const line = lines[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      if (line.flags & (ML.MAPPED | ML.DONTDRAW)) continue;
      traces -= this.testLine(line, ex, ey, ez, fx, fy, halfTan, traces);
    }
  }

  // Distance from (x, y) to the closest point of the line.
  distTo(line, x, y) {
    const v1 = line.v1;
    const dx = line.dx, dy = line.dy;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - v1.x) * dx + (y - v1.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(v1.x + dx * t - x, v1.y + dy * t - y);
  }

  // Returns the number of traces spent.
  testLine(line, ex, ey, ez, fx, fy, halfTan, budget) {
    const v1 = line.v1;
    const dx = line.dx, dy = line.dy;
    const back = line.backsector;
    // Lines that would not be drawn anyway (two-sided, no height change,
    // not a teleporter or secret) are not worth a trace right now.
    if (back && line.frontsector && line.special !== 39 && !(line.flags & ML.SECRET)
      && back.floorheight === line.frontsector.floorheight
      && back.ceilingheight === line.frontsector.ceilingheight) return 0;
    if (this.distTo(line, ex, ey) > RANGE) return 0;
    // Which side the eye is on (P_PointOnLineSide: front when cross > 0).
    const cross = (ex - v1.x) * dy - (ey - v1.y) * dx;
    const front = cross > 0;
    if (!front && !back) return 0; // back of a one-sided wall
    const sec = front ? line.frontsector : back;
    if (!sec || sec.ceilingheight <= sec.floorheight) return 0;
    const len = Math.hypot(dx, dy) || 1;
    const s = front ? NEAR / len : -NEAR / len;
    const ox = dy * s, oy = -dx * s;
    // Midpoint first, then near the ends, then extra points on long lines.
    const extra = Math.min(4, Math.floor(len / 256));
    const ts = [0.5, 0.08, 0.92];
    for (let i = 1; i <= extra; i++) ts.push(i / (extra + 1));
    let spent = 0;
    for (const t of ts) {
      if (spent >= budget) break;
      const px = v1.x + dx * t + ox, py = v1.y + dy * t + oy;
      const rx = px - ex, ry = py - ey;
      const along = rx * fx + ry * fy;
      if (along <= 0 || Math.abs(ry * fx - rx * fy) > along * halfTan) continue;
      spent++;
      if (sightTrace(this.w, ex, ey, ez, px, py, sec.floorheight, sec.ceilingheight)) {
        line.flags |= ML.MAPPED;
        break;
      }
    }
    return spent;
  }
}
