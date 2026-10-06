// The Mega Obby's building kit. Each stage is built in its own frame
// (origin at its checkpoint, forward = local -z, up = +y from the
// checkpoint's top), and the frames are chained into a spiral that rises
// into the sky. Static bricks are merged into a few meshes per area; the
// moving ones (sliders, lifts, spinners, pendulums, crushers, lasers,
// fading and falling tiles...) are separate parts driven every frame from
// the clock, so they are deterministic and the bots can time them.
// While a stage is built, the kit also writes the bots' route through it:
// walk here, jump there, climb, wait for this, ride that.
import * as THREE from 'three';
import { makeLava } from '../common.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const GRAV = 196.2, JUMP = 50, WALK = 16;
const DEG = Math.PI / 180;

/** How far (horizontally) a jump can carry you to land dy higher, at a given run speed and gravity. */
export function reach(dy, speed = WALK, g = GRAV, v = JUMP) {
  const disc = v * v - 2 * g * dy;
  if (disc < 0) return 0;
  return speed * (v + Math.sqrt(disc)) / g;
}

/** A rectangle on the course (local coordinates): top at y, centre x/z, size sx/sz. */
export function rect(x, y, z, sx, sz) { return { x, y, z, sx, sz, x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 }; }

export class Kit {
  constructor(world, st) {
    this.world = world; this.st = st;
    this.obstacles = []; // {update(t, dt)}
    this.zones = []; // per-character effects: {contains(pos), apply(ch, dt, t)}
    this.warnings = [];
  }

  /** Start a stage at world origin O (Vector3, y = checkpoint top) facing yaw (radians). */
  begin(stage, O, yaw) {
    this.stage = stage; this.O = O.clone(); this.yaw = yaw;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
    stage.route = stage.route || [];
    stage.origin = this.O.clone(); stage.yaw = yaw;
    this.cur = rect(0, 0, 0, 10, 10);
    this.F = this.frame();
  }
  /** This stage's frame, frozen (for code that runs later, while the game plays). */
  frame() {
    const O = this.O.clone(), c = this.c, s = this.s;
    return {
      O, c, s,
      W: (x, y, z) => V(O.x + x * c + z * s, O.y + y, O.z - x * s + z * c),
      D: (x, y, z) => V(x * c + z * s, y, -x * s + z * c),
      L: (p) => { const dx = p.x - O.x, dz = p.z - O.z; return V(dx * c - dz * s, p.y - O.y, dx * s + dz * c); },
    };
  }
  // --- frames
  tx(x, z) { return [this.O.x + x * this.c + z * this.s, this.O.z - x * this.s + z * this.c]; }
  /** Local point -> world point. */
  W(x, y, z) { const [wx, wz] = this.tx(x, z); return V(wx, this.O.y + y, wz); }
  /** Local direction -> world direction. */
  D(x, y, z) { return V(x * this.c + z * this.s, y, -x * this.s + z * this.c); }
  Wr(r, dy = 0) { return this.W(r.x, r.y + dy, r.z); }
  _props(o) {
    const p = o.position || [0, 0, 0];
    const w = this.W(p[0], p[1], p[2]);
    const r = o.rotation || [0, 0, 0];
    return { ...o, position: [w.x, w.y, w.z], rotation: [r[0], r[1] + this.yaw / DEG, r[2]] };
  }
  /** A static brick (merged with its neighbours for drawing). */
  sp(o) { return this.st.add(this._props(o)); }
  /** A part of its own (anything that moves or changes). */
  dp(o) { return this.world.add(this._props(o)); }
  box(x, y, z, sx, sy, sz, color, o = {}) { return (o.dyn ? this.dp : this.sp).call(this, { size: [sx, sy, sz], position: [x, y, z], color, ...o }); }
  /** A platform with its top at y. Returns its rect (with .part). */
  plat(x, y, z, sx, sz, color, o = {}) {
    const t = o.t ?? 1.2;
    const part = this.box(x, y - t / 2, z, sx, t, sz, color, o);
    const r = rect(x, y, z, sx, sz); r.part = part;
    return r;
  }
  /** A deadly neon brick. */
  kill(x, y, z, sx, sy, sz, o = {}) {
    const { cause, ...props } = o;
    const p = this.box(x, y, z, sx, sy, sz, o.color ?? 21, { material: 'Neon', top: 'Smooth', bottom: 'Smooth', name: 'KillBrick', ...props });
    p.onTouched((ch) => { if (ch.alive) ch.lastCause = cause || 'killbrick'; });
    makeLava(p);
    p.tags.add('deadly');
    return p;
  }

  // --- the bots' route (world coordinates) ---------------------------------------------------------------
  push(step) { this.stage.route.push(step); return step; }
  walk(x, y, z, o = {}) { return this.push({ type: 'walk', p: this.W(x, y, z), ...o }); }
  wait(cond, o = {}) { return this.push({ type: 'wait', cond, ...o }); }
  /** Jump from a takeoff point to a landing point (local), checking it can be done. */
  jumpTo(from, to, o = {}) {
    const T = this.W(from[0], from[1], from[2]), L = typeof to === 'function' ? to : this.W(to[0], to[1], to[2]);
    if (typeof to !== 'function') {
      const d = Math.hypot(L.x - T.x, L.z - T.z) + 0.5, dy = L.y - T.y;
      const max = reach(dy, o.speed ?? WALK, o.g ?? GRAV);
      if (d > max * 0.97) this.warnings.push(`stage ${this.stage.n}: jump ${d.toFixed(1)} > ${max.toFixed(1)} (dy ${dy.toFixed(1)})`);
      o.ratio = d / max;
    }
    return this.push({ type: 'jump', from: T, p: L, hard: o.hard ?? Math.min(1, Math.max(0.15, (o.ratio ?? 0.5) - 0.3)), ...o });
  }
  /**
   * Go from the current rect to rect r: walk if they touch, otherwise walk to
   * the edge and jump (the takeoff and landing are the nearest points of the two).
   */
  go(r, o = {}) {
    const a = this.cur, ia = 0.5, ib = Math.max(0, Math.min(o.inset ?? 1.0, r.sx / 2 - 0.4, r.sz / 2 - 0.4));
    const ax = (A0, A1, B0, B1) => {
      const a0 = A0 + ia, a1 = A1 - ia, b0 = B0 + ib, b1 = B1 - ib;
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (lo <= hi) { const m = o.at ?? (lo + hi) / 2; const mm = Math.max(lo, Math.min(hi, m)); return [mm, mm]; }
      return b0 > a1 ? [a1, b0] : [a0, b1];
    };
    const [tx, lx] = ax(a.x0, a.x1, r.x0, r.x1), [tz, lz] = ax(a.z0, a.z1, r.z0, r.z1);
    const gx = Math.max(0, r.x0 - a.x1, a.x0 - r.x1), gz = Math.max(0, r.z0 - a.z1, a.z0 - r.z1);
    const dy = r.y - a.y;
    if (Math.max(gx, gz) < 0.6 && Math.abs(dy) < 1.1 && !o.jump) this.walk(lx, r.y, lz, o);
    else { this.walk(tx, a.y, tz, { r: 0.5 }); this.jumpTo([tx, a.y, tz], [lx, r.y, lz], o); }
    this.cur = r;
    return r;
  }
  /** A chain of platforms, each placed relative to the last: [{x, dy, gap, w, d, color}]. */
  chain(items, base = {}) {
    const out = [];
    for (const it of items) {
      const o = { ...base, ...it };
      const prev = this.cur;
      const w = o.w ?? 5, d = o.d ?? w;
      const zNear = prev.z0 - o.gap, z = zNear - d / 2;
      const r = this.plat(o.x ?? 0, prev.y + (o.dy ?? 0), z, w, d, o.color ?? base.color ?? 194, o.part || {});
      this.go(r, { hard: o.hard });
      out.push(r);
    }
    return out;
  }
  /** The next checkpoint: `gap` beyond the current rect, dy higher, at x. Returns its centre (local). */
  end(gap = 4, dy = 0, x = 0, o = {}) {
    const prev = this.cur;
    const z = prev.z0 - gap - 5;
    const r = rect(x, prev.y + dy, z, 8, 8);
    if (!o.noRoute) this.go(r, o);
    this.cur = r;
    return { x, y: r.y, z };
  }

  // --- moving things ---------------------------------------------------------------------------------------------
  /**
   * A part moved by script: pose(t) gives its local position {x, y, z} (and
   * optional yaw in radians, about its own centre). Its velocity is set
   * from the motion, so people standing on it ride along.
   */
  mover(props, pose) {
    const part = this.dp(props);
    part.setKinematic();
    const k = this.F, yaw0 = (props.rotation?.[1] || 0) * DEG, yawS = this.yaw;
    const q = new THREE.Quaternion(), Y = V(0, 1, 0);
    const m = {
      part, pose,
      world(t) { const p = pose(t); return k.W(p.x, p.y, p.z); },
      update(t) {
        const p = pose(t), p2 = pose(t + 0.02);
        const a = k.W(p.x, p.y, p.z), b = k.W(p2.x, p2.y, p2.z);
        const body = part.body;
        body.position.set(a.x, a.y, a.z);
        body.velocity.set((b.x - a.x) / 0.02, (b.y - a.y) / 0.02, (b.z - a.z) / 0.02);
        part.mesh.position.copy(a);
        if (p.yaw != null) {
          q.setFromAxisAngle(Y, yawS + yaw0 + p.yaw);
          body.quaternion.set(q.x, q.y, q.z, q.w); part.mesh.quaternion.copy(q);
          body.angularVelocity.set(0, ((p2.yaw ?? p.yaw) - p.yaw) / 0.02, 0);
        }
      },
    };
    m.update(0);
    this.obstacles.push(m);
    return m;
  }
  /** Something that turns about a horizontal or vertical axis through a pivot (spinners, pendulums, rollers). */
  rotor(props, pivot, axis, angle, offset = [0, 0, 0]) {
    const part = this.dp(props);
    part.setKinematic();
    const yawS = this.yaw;
    const P = this.W(pivot[0], pivot[1], pivot[2]), A = this.D(axis[0], axis[1], axis[2]).normalize(), off = this.D(offset[0], offset[1], offset[2]);
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(props.rotation || [0, 0, 0]).map((v, i) => (i === 1 ? v * DEG + yawS : v * DEG)), 'YXZ'));
    const qa = new THREE.Quaternion(), q = new THREE.Quaternion(), p = V();
    const r = {
      part, P, A, angle,
      update(t) {
        const th = angle(t), th2 = angle(t + 0.01);
        qa.setFromAxisAngle(A, th);
        q.copy(qa).multiply(q0);
        p.copy(off).applyQuaternion(qa).add(P);
        const b = part.body;
        b.position.set(p.x, p.y, p.z); b.quaternion.set(q.x, q.y, q.z, q.w);
        const w = (th2 - th) / 0.01;
        b.angularVelocity.set(A.x * w, A.y * w, A.z * w);
        // the velocity of the part's centre (it swings about the pivot)
        const v = A.clone().multiplyScalar(w).cross(p.clone().sub(P));
        b.velocity.set(v.x, v.y, v.z);
        part.mesh.position.copy(p); part.mesh.quaternion.copy(q);
      },
    };
    r.update(0);
    this.obstacles.push(r);
    return r;
  }
  every(fn) { this.obstacles.push({ update: fn }); }
  zone(contains, apply) { const z = { contains, apply }; this.zones.push(z); return z; }
  /** A local-space box test for zones: |x| <= hx around x, etc. */
  inBox(x0, x1, y0, y1, z0, z1) {
    const L = this.F.L;
    return (p) => { const q = L(p); q.y -= 3; return q.x >= x0 && q.x <= x1 && q.z >= z0 && q.z <= z1 && q.y >= y0 && q.y <= y1; };
  }
}

/** A periodic clock: phase in [0, period). */
export const phase = (t, period, off = 0) => (((t + off) % period) + period) % period;
