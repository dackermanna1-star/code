// A small DSL for hand-authoring levels. A Course is a pen that walks left-to-right
// drawing a ground polyline; gaps end the current piece of ground and start a new one.

export class Course {
  constructor(builder, x, y) {
    this.b = builder;
    this.pts = [[x, y]];
    builder.paths.push(this.pts);
  }

  get x() {
    return this.pts[this.pts.length - 1][0];
  }

  get y() {
    return this.pts[this.pts.length - 1][1];
  }

  here() {
    return { x: this.x, y: this.y };
  }

  to(x, y) {
    const [lx, ly] = this.pts[this.pts.length - 1];
    if (Math.hypot(x - lx, y - ly) > 0.02) this.pts.push([x, y]);
    return this;
  }

  line(dx, dy) {
    return this.to(this.x + dx, this.y + dy);
  }

  flat(len) {
    return this.line(len, 0);
  }

  slope(len, rise) {
    return this.line(len, rise);
  }

  /** Smooth S-curve change of height (flat at both ends). */
  ease(len, rise, n = 0) {
    n = n || Math.max(6, Math.round(len / 0.8));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.to(x0 + len * t, y0 + (rise * (1 - Math.cos(Math.PI * t))) / 2);
    }
    return this;
  }

  /** Bump that returns to the same height. Negative h makes a dip. */
  hill(len, h, n = 0) {
    n = n || Math.max(8, Math.round(len / 0.7));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.to(x0 + len * t, y0 + (h * (1 - Math.cos(2 * Math.PI * t))) / 2);
    }
    return this;
  }

  /** Concave kicker ramp: gentle at first, steep at the lip. */
  ramp(len, rise, pow = 2, n = 0) {
    n = n || Math.max(6, Math.round(len / 0.5));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.to(x0 + len * t, y0 + rise * Math.pow(t, pow));
    }
    return this;
  }

  /** Convex landing slope: steep first, flattening out (good for landing downhill). */
  landing(len, drop, pow = 2, n = 0) {
    n = n || Math.max(6, Math.round(len / 0.5));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.to(x0 + len * t, y0 - drop * (1 - Math.pow(1 - t, pow)));
    }
    return this;
  }

  /** Quarter-pipe style curve up to near-vertical. */
  quarter(r, n = 12) {
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2) * 0.92;
      this.to(x0 + Math.sin(a) * r, y0 + r - Math.cos(a) * r);
    }
    return this;
  }

  bumps(len, count, h) {
    const seg = len / count;
    for (let i = 0; i < count; i++) this.hill(seg, h);
    return this;
  }

  wave(len, amp, count) {
    const n = Math.max(12, Math.round(len / 0.6));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.to(x0 + len * t, y0 + Math.sin(t * Math.PI * 2 * count) * amp);
    }
    return this;
  }

  drop(depth) {
    return this.line(0.05, -depth);
  }

  wall(h) {
    return this.line(0.05, h);
  }

  stairs(n, w, h) {
    for (let i = 0; i < n; i++) {
      this.line(0.04, h);
      this.flat(w);
    }
    return this;
  }

  /** End this piece of ground and continue after a gap. */
  gap(len, dy = 0) {
    const nx = this.x + len;
    const ny = this.y + dy;
    this.pts = [[nx, ny]];
    this.b.paths.push(this.pts);
    return this;
  }
}

export class LevelBuilder {
  constructor(def) {
    this.def = def;
    this.paths = [];
    this.blocks = [];
    this.objects = [];
    this.decor = [];
    this.startPos = { x: 0, y: 0 };
    this.toothCount = 0;
    this.noDecor = [];
  }

  course(x, y) {
    return new Course(this, x, y);
  }

  /** Ground height at x (highest ground path covering x). */
  groundY(x) {
    let best = null;
    for (const p of this.paths) {
      for (let i = 0; i < p.length - 1; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[i + 1];
        if (x1 - x0 < 1e-6) continue;
        if (x >= x0 && x <= x1) {
          const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
          if (best === null || y > best) best = y;
        }
      }
    }
    return best ?? 0;
  }

  /** Ground slope (dy/dx) at x. */
  slopeAt(x) {
    const e = 0.05;
    return (this.groundY(x + e) - this.groundY(x - e)) / (2 * e);
  }

  /**
   * Dig a pit into the course: drop, floor, climb back out. Optional spikes on the floor.
   * Returns { x0, x1, y, floor }.
   */
  pit(c, width, depth, { spikes = true, rise = depth } = {}) {
    const x0 = c.x;
    const y0 = c.y;
    c.drop(depth).flat(width).wall(rise);
    if (spikes) this.add('spikes', { x: x0 + 0.05 + width / 2, y: y0 - depth, w: width - 0.3 });
    return { x0, x1: c.x, y: y0, floor: y0 - depth };
  }

  /** Static solid polygon (any shape, drawn with a material). */
  block(pts, style = 'ground') {
    this.blocks.push({ pts, style });
    return this;
  }

  rect(x0, y0, x1, y1, style = 'rock') {
    return this.block([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], style);
  }

  add(type, props = {}) {
    const o = { type, ...props };
    // ground-relative placement is resolved once the whole course exists (see result())
    if (o.y === undefined && o.x !== undefined) o._lazyY = true;
    this.objects.push(o);
    return o;
  }

  start(x) {
    this.startPos = { x, y: 0, lazy: true };
  }

  finish(x) {
    this.add('finish', { x });
    this.finishX = x;
  }

  checkpoint(x) {
    this.add('checkpoint', { x });
  }

  tooth(x, y) {
    if (y === undefined) y = this.groundY(x) + 1;
    this.add('tooth', { x, y, index: this.toothCount++ });
  }

  sign(x, text, opts = {}) {
    this.add('sign', { x, text, ...opts });
  }

  deco(type, x, opts = {}) {
    this.decor.push({ type, x, _lazyY: opts.y === undefined, ...opts });
  }

  /** Keep auto-scattered decoration away from this x-range. */
  clear(x0, x1) {
    this.noDecor.push([x0, x1]);
  }

  result() {
    for (const o of [...this.objects, ...this.decor]) {
      if (o._lazyY) o.y = this.groundY(o.x) + (o.dy || 0);
      if (o.align && o.angle === undefined) o.angle = Math.atan(this.slopeAt(o.x));
    }
    if (this.startPos.lazy) this.startPos.y = this.groundY(this.startPos.x);
    return {
      paths: this.paths.filter((p) => p.length > 1),
      blocks: this.blocks,
      objects: this.objects,
      decor: this.decor,
      start: this.startPos,
      finishX: this.finishX,
      teeth: this.toothCount,
      noDecor: this.noDecor,
    };
  }
}
