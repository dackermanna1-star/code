// Static world geometry: axis-aligned solids (floors, walls, steps, railings,
// glass) indexed in a uniform grid, plus particle collision and spatial queries.

import { clamp } from '../core/math.js';

const CELL = 128;

export class Level {
  constructor() {
    this.solids = [];
    this.grid = new Map();
    this.stamp = 1;
    this._tmp = [];
    this.onBreak = null; // (solid, particle, speed) => void

    // Filled in by the generator.
    this.theme = 'facility';
    this.condition = 'clear';
    this.width = 3000;
    this.bounds = { left: 0, right: 3000, top: -800, bottom: 200 };
    this.killY = 1400;
    this.floors = []; // [{ index, y, x0, x1, ceil }]
    this.surfaces = [];
    this.links = [];
    this.stairs = [];
    this.spawnPoints = [];
    this.hazards = [];
    this.propSpawns = [];
    this.decor = [];
    this.lights = [];
    this.windows = [];
    this.doorways = [];
    this.walls = [];
    this.ledges = [];
    this.friction = 1;
    this.wind = 0;
    this.outdoor = false;
  }

  addSolid(s) {
    const solid = {
      id: this.solids.length,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      oneWay: !!s.oneWay,
      kind: s.kind || 'block',
      material: s.material || 'concrete',
      surface: -1,
      breakable: !!s.breakable,
      breakSpeed: s.breakSpeed || 400,
      broken: false,
      step: !!s.step,
      stairs: s.stairs !== undefined ? s.stairs : -1,
      data: s.data || null,
      _st: 0,
    };
    this.solids.push(solid);
    return solid;
  }

  _cells(s, fn) {
    const x0 = Math.floor(s.x / CELL);
    const x1 = Math.floor((s.x + s.w) / CELL);
    const y0 = Math.floor(s.y / CELL);
    const y1 = Math.floor((s.y + s.h) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) fn((cx + 4096) * 8192 + (cy + 4096));
    }
  }

  buildGrid() {
    this.grid.clear();
    for (const s of this.solids) {
      if (s.broken) continue;
      this._cells(s, (k) => {
        let b = this.grid.get(k);
        if (!b) {
          b = [];
          this.grid.set(k, b);
        }
        b.push(s);
      });
    }
  }

  breakSolid(s) {
    if (s.broken) return;
    s.broken = true;
    this._cells(s, (k) => {
      const b = this.grid.get(k);
      if (!b) return;
      const i = b.indexOf(s);
      if (i >= 0) b.splice(i, 1);
    });
  }

  queryRect(x0, y0, x1, y1, out) {
    out.length = 0;
    const stamp = ++this.stamp;
    const cx0 = Math.floor(x0 / CELL);
    const cx1 = Math.floor(x1 / CELL);
    const cy0 = Math.floor(y0 / CELL);
    const cy1 = Math.floor(y1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const b = this.grid.get((cx + 4096) * 8192 + (cy + 4096));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const s = b[i];
          if (s._st === stamp) continue;
          s._st = stamp;
          if (s.x > x1 || s.x + s.w < x0 || s.y > y1 || s.y + s.h < y0) continue;
          out.push(s);
        }
      }
    }
    return out;
  }

  // Highest walkable top at or below y (within maxDown) under the span [x0, x1].
  groundUnder(x0, x1, y, maxDown, includeOneWay = true, skipSteps = false) {
    const list = this.queryRect(x0, y - 2, x1, y + maxDown, this._tmp);
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.oneWay && !includeOneWay) continue;
      if (skipSteps && s.step) continue;
      if (s.y < y - 1.5 || s.y > y + maxDown) continue;
      if (s.x > x1 || s.x + s.w < x0) continue;
      if (!s.oneWay) {
        // a solid whose top is above us is a wall, not ground
        if (s.y < y - 1.5) continue;
      }
      if (!best || s.y < best.y) best = s;
    }
    return best;
  }

  groundAt(x, y, maxDown, includeOneWay = true) {
    return this.groundUnder(x, x, y, maxDown, includeOneWay, false);
  }

  // Ground height below point (any distance), or null.
  floorBelow(x, y) {
    return this.groundUnder(x, x, y, 4000, true, false);
  }

  isSolidAt(x, y) {
    const list = this.queryRect(x, y, x, y, this._tmp);
    for (const s of list) {
      if (!s.oneWay && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    }
    return null;
  }

  // Ray vs non-one-way solids. Returns { t, x, y, solid } or null.
  raycast(x0, y0, x1, y1) {
    const list = this.queryRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), this._tmp);
    const dx = x1 - x0;
    const dy = y1 - y0;
    let best = null;
    let bestT = 1;
    for (const s of list) {
      if (s.oneWay) continue;
      let tmin = 0;
      let tmax = 1;
      if (Math.abs(dx) < 1e-9) {
        if (x0 < s.x || x0 > s.x + s.w) continue;
      } else {
        let t1 = (s.x - x0) / dx;
        let t2 = (s.x + s.w - x0) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dy) < 1e-9) {
        if (y0 < s.y || y0 > s.y + s.h) continue;
      } else {
        let t1 = (s.y - y0) / dy;
        let t2 = (s.y + s.h - y0) / dy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (tmin < bestT) {
        bestT = tmin;
        best = s;
      }
    }
    if (!best) return null;
    return { t: bestT, x: x0 + dx * bestT, y: y0 + dy * bestT, solid: best };
  }

  // Circle-vs-AABB collision for a Verlet particle. Coulomb friction: the
  // tangential change is bounded by mu x the normal impulse, so resting
  // contact decelerates at mu*g and impacts bleed speed proportionally.
  collideParticle(p, bounce, mu, h) {
    const r = p.r;
    const list = this.queryRect(p.x - r, p.y - r, p.x + r, p.y + r, this._tmp);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.oneWay) {
        if (p.drop) continue;
        if (p.y + r <= s.y) continue;
        if (p.py + r > s.y + 4) continue;
        if (p.x < s.x - 2 || p.x > s.x + s.w + 2) continue;
        const vx = p.x - p.px;
        const vy = p.y - p.py;
        if (vy < 0) continue;
        p.y = s.y - r;
        const e = vy / h > 140 ? bounce : 0;
        const jn = vy * (1 + e);
        const ax = Math.abs(vx) - mu * jn;
        p.px = p.x - (ax > 0 ? (vx > 0 ? ax : -ax) : 0);
        p.py = p.y + vy * e;
        p.ground = true;
        const sp = vy / h;
        if (sp > p.impact) {
          p.impact = sp;
          p.impactNx = 0;
          p.impactNy = -1;
        }
        continue;
      }
      const cx = clamp(p.x, s.x, s.x + s.w);
      const cy = clamp(p.y, s.y, s.y + s.h);
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      let nx;
      let ny;
      let pen;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        ny = dy / d;
        pen = r - d;
      } else {
        // Centre is inside the box: resolve towards the side we came from.
        if (p.py <= s.y) {
          nx = 0; ny = -1; pen = p.y - s.y + r;
        } else if (p.py >= s.y + s.h) {
          nx = 0; ny = 1; pen = s.y + s.h - p.y + r;
        } else if (p.px <= s.x) {
          nx = -1; ny = 0; pen = p.x - s.x + r;
        } else if (p.px >= s.x + s.w) {
          nx = 1; ny = 0; pen = s.x + s.w - p.x + r;
        } else {
          const l = p.x - s.x;
          const rr = s.x + s.w - p.x;
          const t = p.y - s.y;
          const b = s.y + s.h - p.y;
          let m = t;
          nx = 0; ny = -1;
          if (l < m) { m = l; nx = -1; ny = 0; }
          if (rr < m) { m = rr; nx = 1; ny = 0; }
          if (b < m) { m = b; nx = 0; ny = 1; }
          pen = m + r;
        }
      }
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      const vn = vx * nx + vy * ny;
      if (s.breakable && -vn / h > s.breakSpeed && this.onBreak) {
        this.onBreak(s, p, -vn / h);
        continue;
      }
      p.x += nx * pen;
      p.y += ny * pen;
      if (vn < 0) {
        const e = -vn / h > 140 ? bounce : 0;
        const tx = vx - vn * nx;
        const ty = vy - vn * ny;
        const tl = Math.sqrt(tx * tx + ty * ty);
        const jn = -vn * (1 + e);
        const k = tl > 1e-9 ? Math.max(0, tl - mu * jn) / tl : 0;
        p.px = p.x - (tx * k - vn * e * nx);
        p.py = p.y - (ty * k - vn * e * ny);
        const sp = -vn / h;
        if (sp > p.impact) {
          p.impact = sp;
          p.impactNx = nx;
          p.impactNy = ny;
        }
      } else {
        p.px += nx * pen;
        p.py += ny * pen;
      }
      if (ny < -0.5) p.ground = true;
    }
  }

  surfaceById(id) {
    return this.surfaces[id] || null;
  }
}
