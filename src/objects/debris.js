// Short-lived physical debris: gibs, bone shards, glass, planks, popsicles.

import { Entity, Vec2, Box, Circle, Polygon, CAT, partFrom } from './entity.js';
import { polyPath, fillStroke, circle, OUTLINE } from '../render/draw.js';
import { rand } from '../core/math.js';

export class Debris extends Entity {
  /**
   * opts: { x, y, vx, vy, angle, av, w, h, r, verts, color, outline, life, density,
   *         bleed (seconds of blood trail), eye (draw eyeball), sharp, stick (popsicle) }
   */
  constructor(game, o) {
    super(game, o);
    this.kind = 'debris';
    this.o = o;
    this.life = o.life ?? 12;
    this.age = 0;
    this.material = o.material || 'flesh';
    const b = (this.body = this.makeBody({
      type: 'dynamic',
      position: new Vec2(o.x, o.y),
      angle: o.angle || 0,
      linearVelocity: new Vec2(o.vx || 0, o.vy || 0),
      angularVelocity: o.av || 0,
      angularDamping: 0.3,
    }));
    let shape;
    if (o.verts) shape = new Polygon(o.verts.map((v) => new Vec2(v[0], v[1])));
    else if (o.r) shape = new Circle(o.r);
    else shape = new Box((o.w || 0.1) / 2, (o.h || 0.1) / 2);
    this.fixture(b, shape, { density: o.density ?? 4, friction: 0.7, restitution: o.restitution ?? 0.15 }, CAT.DEBRIS);
  }

  onBeginContact(self, other) {
    if (!this.o.sharp) return;
    const pu = partFrom(other);
    if (!pu) return;
    const v = this.body.getLinearVelocity();
    if (Math.hypot(v.x, v.y) < 4) return;
    const p = this.body.getPosition();
    this.game.particles.blood(p.x, p.y, 0, 0, 6, 2);
    pu.ragdoll.damage(2, 'bled');
  }

  update(dt) {
    this.age += dt;
    if (this.dead) return;
    if (this.o.bleed && this.age < this.o.bleed && Math.random() < 0.5) {
      const p = this.body.getPosition();
      const v = this.body.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > 1.5) this.game.particles.blood(p.x, p.y, v.x * 0.3, v.y * 0.3, 1, 0.5);
    }
    if (this.age > this.life) this.remove();
  }

  draw(ctx, view) {
    if (this.dead) return;
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 1)) return;
    const o = this.o;
    const fade = Math.min(1, (this.life - this.age) / 1.0);
    ctx.globalAlpha = fade;
    this.withBody(ctx, this.body, () => {
      if (o.verts) {
        polyPath(ctx, o.verts);
        fillStroke(ctx, o.color, o.outline ?? OUTLINE, 0.02);
        if (o.inner) {
          ctx.fillStyle = o.inner;
          ctx.beginPath();
          ctx.arc(0, 0, 0.02, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.r) {
        circle(ctx, 0, 0, o.r, o.color, o.outline ?? OUTLINE, 0.02);
        if (o.eye) circle(ctx, o.r * 0.35, 0, o.r * 0.45, '#2a4f8a', null);
      } else if (o.stick) {
        // popsicle: coloured ice on a wooden stick
        ctx.fillStyle = '#d9b27a';
        ctx.fillRect(-0.012, -o.h / 2 - 0.05, 0.024, 0.07);
        ctx.beginPath();
        ctx.rect(-o.w / 2, -o.h / 2, o.w, o.h);
        fillStroke(ctx, o.color, OUTLINE, 0.015);
      } else {
        ctx.beginPath();
        ctx.rect(-(o.w || 0.1) / 2, -(o.h || 0.1) / 2, o.w || 0.1, o.h || 0.1);
        fillStroke(ctx, o.color, o.outline ?? OUTLINE, 0.02);
        if (o.grain) {
          ctx.strokeStyle = 'rgba(80,50,20,0.4)';
          ctx.lineWidth = 0.01;
          ctx.beginPath();
          ctx.moveTo(-o.w / 2 + 0.03, 0);
          ctx.lineTo(o.w / 2 - 0.03, 0);
          ctx.stroke();
        }
      }
    });
    ctx.globalAlpha = 1;
  }
}

/** Random convex-ish chunk polygon. */
export function chunkVerts(r) {
  const n = 5 + Math.floor(Math.random() * 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    const rr = r * rand(0.65, 1.0);
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

export function shardVerts(s) {
  return [
    [rand(-s, -s * 0.3), rand(-s, s)],
    [rand(s * 0.3, s), rand(-s, -s * 0.2)],
    [rand(-s * 0.3, s * 0.6), rand(s * 0.3, s * 1.4)],
  ];
}
