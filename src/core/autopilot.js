// Simple driving AI. Used for the animated main-menu background and by automated tests
// (it is deliberately naive: hold throttle, keep the vehicle level with the ground).

import { wrapAngle } from './math.js';

export class Autopilot {
  constructor(input, opts = {}) {
    this.input = input;
    this.opts = opts;
    this.state = { up: true, _edges: new Set() };
    this.stuck = 0;
    this.lastX = 0;
    input.auto = this.state;
  }

  /** Test-bot mode: wait for timed hazards and platforms instead of charging in. */
  shouldWait(game, x, vx) {
    for (const e of game.entities) {
      if (e.dead || !e.body) continue;
      const ex = e.body.getPosition().x;
      const ey = e.body.getPosition().y;
      if (e.crusher) {
        const left = ex - e.w / 2;
        if (x > left - 7 && x < left - 0.6) {
          const safe = (e.state === 'up' && e.timer > 0.9) || e.state === 'rise';
          if (!safe) return true;
        }
      } else if (e.onFor !== undefined) {
        if (x > ex - 6 && x < ex - 1.5) {
          const ph = e.t % e.period;
          if (ph < e.onFor || e.period - ph < 0.9) return true;
        }
      } else if (e.isSaw && e.path && Math.abs(e.path[e.path.length - 1].x - e.path[0].x) < 0.5) {
        if (x > ex - 6 && x < ex - 1.5) {
          const g = game.level.groundAt(ex);
          const vy = e.body.getLinearVelocity().y;
          if (!(g && ey > g.y + 3 && vy >= 0)) return true;
        }
      } else if (e.path && e.body.isKinematic() && e.w) {
        const first = e.path[0];
        const last = e.path[e.path.length - 1];
        const vertical = Math.abs(last.x - first.x) < 0.5;
        const atFirst = Math.hypot(ex - first.x, ey - first.y) < 0.2;
        const atLast = Math.hypot(ex - last.x, ey - last.y) < 0.2;
        const on = Math.abs(x - ex) < e.w / 2 - 0.2;
        if (on) {
          if (!atLast) return true; // ride it to the end
        } else if (x > first.x - e.w / 2 - 6 && x < first.x - e.w / 2 + 0.2) {
          if (!atFirst || e.waitT < 0.4) return true;
        }
      }
    }
    return false;
  }

  detach() {
    if (this.input.auto === this.state) this.input.auto = null;
  }

  update(game, dt) {
    const ch = game.player;
    const s = this.state;
    if (!ch || !ch.frame || ch.frame._gone) return;
    const f = ch.frame;
    const p = f.getPosition();
    const a = wrapAngle(f.getAngle());
    const w = f.getAngularVelocity();
    const g = game.level && game.level.groundAt(p.x + 0.5);
    const slopeA = g ? Math.atan(g.slope) : 0;
    const near = g ? p.y - g.y < 2.2 : false;
    const target = near ? slopeA : slopeA * 0.4;
    const err = a - target + w * 0.22;
    s.right = err > 0.1;
    s.left = err < -0.1;
    s.up = true;
    s.down = false;
    s.primary = !!this.opts.boost && Math.random() < 0.02;
    const v = f.getLinearVelocity();
    if (this.opts.smart && this.shouldWait(game, p.x, v.x)) {
      s.up = false;
      s.down = Math.abs(v.x) > 0.4;
      this.stuck = 0;
      return;
    }
    if (Math.abs(v.x) < 0.6) this.stuck += dt;
    else this.stuck = 0;
    if (this.stuck > 1.2) {
      s._edges.add('primary');
      this.stuck = 0;
    }
  }
}
