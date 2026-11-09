// Physical props & structures: crates, glass, rope bridges, seesaws, falling objects,
// moving and collapsing platforms, loose balls/tyres.

import { Entity, Vec2, Box, Circle, Polygon, CAT, partFrom, characterFrom } from './entity.js';
import { RevoluteJoint } from 'planck';
import { fillStroke, circle, line, roundRectPath, polyPath, OUTLINE } from '../render/draw.js';
import { rand, pick, clamp } from '../core/math.js';
import { shardVerts } from './debris.js';

const WOOD = '#b9844f';
const WOOD_DARK = '#8a5c33';

function sumImpulse(contact, impulse) {
  const n = contact.getManifold().pointCount;
  let s = 0;
  for (let i = 0; i < n; i++) s += impulse.normalImpulses[i];
  return s;
}

// ------------------------------------------------------------------ crate

export class Crate extends Entity {
  constructor(game, d) {
    super(game, d);
    this.s = d.size ?? 0.8;
    this.material = 'wood';
    this.strength = d.strength ?? 30 * this.s;
    const b = (this.body = this.makeBody({ type: 'dynamic', position: new Vec2(d.x, d.y + this.s / 2), angle: d.angle || 0 }));
    this.fixture(b, new Box(this.s / 2, this.s / 2), { density: d.density ?? 9, friction: 0.7 });
    this.broken = false;
  }

  onPostSolve(self, other, contact, impulse) {
    if (this.broken) return;
    if (sumImpulse(contact, impulse) > this.strength) {
      this.broken = true;
      this.phys.defer(() => this.smash());
    }
  }

  onExplosion(f) {
    if (!this.broken && f > 0.25) {
      this.broken = true;
      this.phys.defer(() => this.smash());
    }
  }

  smash() {
    if (this.dead) return;
    const p = this.body.getPosition();
    const v = this.body.getLinearVelocity();
    const a = this.body.getAngle();
    this.remove();
    this.game.audio.woodBreak(p.x, p.y);
    this.game.particles.chips(p.x, p.y, 16, [WOOD, WOOD_DARK, '#d6a56c'], 4, 0.05);
    for (let i = 0; i < 4; i++) {
      this.game.spawnDebris({
        x: p.x + rand(-0.2, 0.2),
        y: p.y + rand(-0.2, 0.2),
        vx: v.x * 0.6 + rand(-3, 3),
        vy: v.y * 0.6 + rand(1, 4),
        w: this.s * rand(0.7, 1),
        h: 0.08,
        angle: a + rand(-0.5, 0.5),
        av: rand(-8, 8),
        color: WOOD,
        grain: true,
        material: 'wood',
        density: 5,
        life: 9,
      });
    }
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 1)) return;
    this.withBody(ctx, this.body, () => {
      const s = this.s / 2;
      ctx.beginPath();
      ctx.rect(-s, -s, s * 2, s * 2);
      fillStroke(ctx, WOOD);
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = 0.05;
      ctx.strokeRect(-s + 0.06, -s + 0.06, s * 2 - 0.12, s * 2 - 0.12);
      ctx.beginPath();
      ctx.moveTo(-s + 0.08, -s + 0.08);
      ctx.lineTo(s - 0.08, s - 0.08);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,35,15,0.35)';
      ctx.lineWidth = 0.012;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-s, -s + (i * s * 2) / 4);
        ctx.lineTo(s, -s + (i * s * 2) / 4);
        ctx.stroke();
      }
    });
  }
}

// ------------------------------------------------------------------ glass pane

export class Glass extends Entity {
  constructor(game, d) {
    super(game, d);
    this.w = d.w ?? 0.14;
    this.h = d.h ?? 2.6;
    this.material = 'glass';
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y + this.h / 2), angle: d.angle || 0 }));
    this.fixture(b, new Box(this.w / 2, this.h / 2), { friction: 0.2, noBlood: true });
    this.broken = false;
    this.strength = d.strength ?? 7;
  }

  onPostSolve(self, other, contact, impulse) {
    if (this.broken) return;
    if (sumImpulse(contact, impulse) > this.strength) {
      this.broken = true;
      const ob = other.getBody();
      const v = ob.getLinearVelocity();
      this.phys.defer(() => this.shatter(v));
    }
  }

  onExplosion(f) {
    if (!this.broken && f > 0.05) {
      this.broken = true;
      this.phys.defer(() => this.shatter({ x: 0, y: 4 }));
    }
  }

  shatter(v) {
    if (this.dead) return;
    const p = this.body.getPosition();
    const a = this.body.getAngle();
    this.remove();
    this.game.audio.glass(p.x, p.y);
    const n = Math.round(this.h * 5);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      this.game.spawnDebris({
        x: p.x - Math.sin(a) * t * this.h,
        y: p.y + Math.cos(a) * t * this.h,
        vx: v.x * 0.5 + rand(-2, 4),
        vy: v.y * 0.3 + rand(-1, 3),
        verts: shardVerts(rand(0.08, 0.16)),
        color: 'rgba(190,230,255,0.55)',
        outline: 'rgba(240,250,255,0.9)',
        av: rand(-12, 12),
        density: 3,
        sharp: true,
        material: 'glass',
        life: 7,
      });
    }
    this.game.particles.sparks(p.x, p.y, 20, 5, 0, Math.PI * 2, '#e6f7ff');
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, this.h)) return;
    this.withBody(ctx, this.body, () => {
      ctx.beginPath();
      ctx.rect(-this.w / 2, -this.h / 2, this.w, this.h);
      ctx.fillStyle = 'rgba(170,220,255,0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,248,255,0.95)';
      ctx.lineWidth = 0.03;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.moveTo(-0.02, this.h / 2 - 0.3);
      ctx.lineTo(0.02, this.h / 2 - 0.9);
      ctx.moveTo(-0.02, -this.h / 2 + 0.6);
      ctx.lineTo(0.02, -this.h / 2 + 0.3);
      ctx.stroke();
    });
  }
}

// ------------------------------------------------------------------ rope bridge

export class Bridge extends Entity {
  constructor(game, d) {
    super(game, d);
    this.material = 'wood';
    const x0 = d.x;
    const y0 = d.y;
    const x1 = d.x2;
    const y1 = d.y2;
    const n = d.planks ?? Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.8));
    this.brk = d.strength ?? 7000;
    this.planks = [];
    this.links = [];
    const anchorA = this.makeBody({ type: 'static', position: new Vec2(x0, y0) });
    const anchorB = this.makeBody({ type: 'static', position: new Vec2(x1, y1) });
    this.anchors = [anchorA, anchorB];
    const dx = (x1 - x0) / n;
    const dy = (y1 - y0) / n;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    let prev = anchorA;
    for (let i = 0; i < n; i++) {
      const cx = x0 + dx * (i + 0.5);
      const cy = y0 + dy * (i + 0.5);
      const b = this.makeBody({ type: 'dynamic', position: new Vec2(cx, cy), angle: ang, angularDamping: 0.6, linearDamping: 0.1 });
      this.fixture(b, new Box(len / 2 - 0.03, 0.07), { density: 18, friction: 0.9 });
      const j = this.phys.createJoint(new RevoluteJoint({}, prev, b, new Vec2(x0 + dx * i, y0 + dy * i)));
      this.links.push({ joint: j, x: x0 + dx * i, y: y0 + dy * i });
      this.planks.push({ body: b, len });
      prev = b;
    }
    const j = this.phys.createJoint(new RevoluteJoint({}, prev, anchorB, new Vec2(x1, y1)));
    this.links.push({ joint: j, x: x1, y: y1 });
  }

  postStep() {
    const inv = this.phys.invDt;
    for (const l of this.links) {
      if (l.joint._gone) continue;
      const f = l.joint.getReactionForce(inv);
      if (Math.hypot(f.x, f.y) > this.brk) {
        const a = l.joint.getAnchorA();
        this.phys.destroyJoint(l.joint);
        this.game.audio.woodBreak(a.x, a.y);
        this.game.particles.chips(a.x, a.y, 10, [WOOD, WOOD_DARK], 3);
      }
    }
  }

  draw(ctx, view) {
    const a = this.anchors[0].getPosition();
    const b = this.anchors[1].getPosition();
    if (!this.inView(view, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 + 3)) return;
    for (const p of [a, b]) {
      roundRectPath(ctx, p.x - 0.1, p.y - 1.2, 0.2, 2.2, 0.05);
      fillStroke(ctx, WOOD_DARK);
    }
    // ropes
    ctx.strokeStyle = '#6b5a3c';
    ctx.lineWidth = 0.04;
    const pts = [];
    for (const pl of this.planks) {
      if (pl.body._gone) continue;
      pts.push(pl.body.getWorldPoint(new Vec2(-pl.len / 2, 0.08)), pl.body.getWorldPoint(new Vec2(pl.len / 2, 0.08)));
    }
    for (const pl of this.planks) {
      this.withBody(ctx, pl.body, () => {
        roundRectPath(ctx, -pl.len / 2 + 0.03, -0.07, pl.len - 0.06, 0.14, 0.03);
        fillStroke(ctx, WOOD);
        ctx.strokeStyle = 'rgba(80,50,20,0.35)';
        ctx.lineWidth = 0.012;
        ctx.beginPath();
        ctx.moveTo(-pl.len / 2 + 0.08, 0);
        ctx.lineTo(pl.len / 2 - 0.08, 0);
        ctx.stroke();
      });
    }
    // rope handrail
    ctx.strokeStyle = '#7d6a48';
    ctx.lineWidth = 0.035;
    for (let i = 0; i < this.planks.length; i++) {
      const pl = this.planks[i];
      const p0 = pl.body.getWorldPoint(new Vec2(-pl.len / 2, 0));
      const p1 = pl.body.getWorldPoint(new Vec2(pl.len / 2, 0));
      line(ctx, p0.x, p0.y, p0.x, p0.y + 0.7, '#7d6a48', 0.025);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y + 0.7);
      ctx.lineTo(p1.x, p1.y + 0.7);
      const linked = i + 1 < this.links.length && !this.links[i + 1].joint._gone;
      if (linked) ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ seesaw

export class Seesaw extends Entity {
  constructor(game, d) {
    super(game, d);
    this.len = d.len ?? 6;
    this.material = 'wood';
    const base = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y) });
    this.fixture(base, new Polygon([new Vec2(-0.6, 0), new Vec2(0.6, 0), new Vec2(0, 0.9)]), {});
    const plank = (this.plank = this.makeBody({ type: 'dynamic', position: new Vec2(d.x, d.y + 1.0), angle: d.angle ?? 0.25 }));
    this.fixture(plank, new Box(this.len / 2, 0.1), { density: 20, friction: 0.9 });
    this.phys.createJoint(
      new RevoluteJoint({ enableLimit: true, lowerAngle: -0.42, upperAngle: 0.42, referenceAngle: 0 }, base, plank, new Vec2(d.x, d.y + 1.0))
    );
    this.base = base;
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, this.len)) return;
    polyPath(ctx, [[this.x - 0.6, this.y], [this.x + 0.6, this.y], [this.x, this.y + 1.0]]);
    fillStroke(ctx, '#596069');
    this.withBody(ctx, this.plank, () => {
      roundRectPath(ctx, -this.len / 2, -0.1, this.len, 0.2, 0.05);
      fillStroke(ctx, WOOD);
      ctx.fillStyle = '#ffd000';
      ctx.fillRect(-this.len / 2 + 0.1, -0.1, 0.3, 0.2);
      ctx.fillRect(this.len / 2 - 0.4, -0.1, 0.3, 0.2);
    });
    circle(ctx, this.x, this.y + 1.0, 0.1, '#333');
  }
}

// ------------------------------------------------------------------ falling objects

const DROP_SHAPES = {
  anvil: { verts: [[-0.55, -0.3], [0.55, -0.3], [0.4, -0.05], [0.75, 0.15], [0.75, 0.3], [-0.6, 0.3], [-0.4, -0.05]], density: 90, color: '#3a3d42' },
  rock: { verts: [[-0.8, -0.5], [0.3, -0.7], [0.9, -0.1], [0.6, 0.6], [-0.3, 0.75], [-0.9, 0.2]], density: 40, color: '#7c7468' },
  beam: { box: [1.8, 0.18], density: 60, color: '#c2541c' },
  log: { box: [1.7, 0.3], density: 30, color: '#7a5230' },
  spikeball: { r: 0.5, density: 40, color: '#2e3136' },
  safe: { box: [0.6, 0.6], density: 50, color: '#556070' },
};

export class Dropper extends Entity {
  constructor(game, d) {
    super(game, d);
    this.type = d.kind || 'anvil';
    this.spec = DROP_SHAPES[this.type];
    this.trigger = d.trigger ?? d.x - 6;
    this.delay = d.delay ?? 0;
    this.released = false;
    this.ropeTop = d.ropeTop ?? d.y + 6;
    this.material = this.type === 'rock' ? 'ground' : 'metal';
    this.spiky = this.type === 'spikeball';
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y), angle: d.angle || 0 }));
    const s = this.spec;
    let shape;
    if (s.verts) {
      // convex hull handled by planck; anvil is concave, so split into two boxes
      if (this.type === 'anvil') {
        this.fixture(b, new Box(0.55, 0.13, new Vec2(0, -0.17)), { density: s.density });
        this.fixture(b, new Box(0.68, 0.15, new Vec2(0.05, 0.15)), { density: s.density });
        this.fixture(b, new Box(0.2, 0.15, new Vec2(0, 0)), { density: s.density });
      } else {
        shape = new Polygon(s.verts.map((v) => new Vec2(v[0], v[1])));
        this.fixture(b, shape, { density: s.density });
      }
    } else if (s.box) this.fixture(b, new Box(s.box[0], s.box[1]), { density: s.density });
    else this.fixture(b, new Circle(s.r), { density: s.density });
  }

  preStep(dt) {
    if (this.released) return;
    const f = this.playerFocus();
    if (f && f.x > this.trigger) {
      this.delay -= dt;
      if (this.delay <= 0) {
        this.released = true;
        this.body.setType('dynamic');
        this.body.setAwake(true);
        this.body.setAngularVelocity(rand(-0.5, 0.5));
        if (this.def.push) this.body.setLinearVelocity(new Vec2(this.def.push[0], this.def.push[1]));
        this.game.audio.impact(0.3, 'metal', this.x, this.y);
      }
    }
  }

  onBeginContact(self, other, contact) {
    if (!this.released) return;
    const v = this.body.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    const ci = this.phys.contactInfo(contact);
    if (sp > 4 && ci) {
      this.game.audio.impact(clamp(sp / 14, 0, 1), this.material, ci.x, ci.y);
      if (other.getBody().isStatic()) {
        const f = this.playerFocus();
        if (f && Math.abs(f.x - ci.x) < 15) this.game.camera.shake(0.2);
        this.game.particles.dust(ci.x, ci.y, 0, 1, 8);
      }
    }
    if (this.spiky) {
      const pu = partFrom(other);
      if (pu && ci && sp > 2) {
        this.phys.defer(() => {
          if (!pu.part.gone) pu.ragdoll.impale(pu.part, this.body, ci.x, ci.y, { brk: 9000 });
        });
      }
    }
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 3)) return;
    if (!this.released) {
      line(ctx, p.x, p.y + 0.3, p.x, this.ropeTop, '#6b5a3c', 0.05);
    }
    const s = this.spec;
    this.withBody(ctx, this.body, () => {
      if (this.type === 'anvil') {
        polyPath(ctx, s.verts);
        fillStroke(ctx, s.color);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(-0.55, 0.22, 1.25, 0.05);
      } else if (s.verts) {
        polyPath(ctx, s.verts);
        fillStroke(ctx, s.color);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.arc(0.2, -0.2, 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.box) {
        const [hx, hy] = s.box;
        roundRectPath(ctx, -hx, -hy, hx * 2, hy * 2, 0.03);
        fillStroke(ctx, s.color);
        if (this.type === 'log') {
          ctx.fillStyle = '#5c3d22';
          ctx.fillRect(-hx, -0.02, hx * 2, 0.04);
          ctx.beginPath();
          ctx.ellipse(hx, 0, 0.08, hy, 0, 0, Math.PI * 2);
          fillStroke(ctx, '#d9b27a');
          ctx.strokeStyle = '#8a5c33';
          ctx.lineWidth = 0.015;
          ctx.beginPath();
          ctx.ellipse(hx, 0, 0.04, hy * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (this.type === 'beam') {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          for (let x = -hx + 0.3; x < hx; x += 0.6) {
            ctx.beginPath();
            ctx.arc(x, 0, 0.06, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          circle(ctx, 0.15, 0, 0.18, '#3a4250');
          circle(ctx, 0.15, 0, 0.05, '#c9a227');
        }
      } else {
        const r = s.r;
        ctx.fillStyle = '#c7cdd4';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.2) * r * 0.9, Math.sin(a - 0.2) * r * 0.9);
          ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
          ctx.lineTo(Math.cos(a + 0.2) * r * 0.9, Math.sin(a + 0.2) * r * 0.9);
          ctx.closePath();
          fillStroke(ctx, '#c7cdd4', OUTLINE, 0.02);
        }
        circle(ctx, 0, 0, r, s.color);
      }
    });
  }
}

// ------------------------------------------------------------------ moving platform

export class MovingPlatform extends Entity {
  constructor(game, d) {
    super(game, d);
    this.w = d.w ?? 3;
    this.h = d.h ?? 0.35;
    this.speed = d.speed ?? 2.5;
    this.wait = d.wait ?? 0.8;
    this.loop = !!d.loop;
    this.path = [{ x: d.x, y: d.y }, ...(d.path || []).map((p) => ({ x: p[0], y: p[1] }))];
    this.i = 1;
    this.step = 1;
    this.waitT = d.offset ?? 0;
    const b = (this.body = this.makeBody({ type: 'kinematic', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Box(this.w / 2, this.h / 2), { friction: 1.2 });
    this.style = d.style || 'metal';
  }

  preStep(dt) {
    const b = this.body;
    if (this.path.length < 2) return;
    if (this.waitT > 0) {
      this.waitT -= dt;
      b.setLinearVelocity(new Vec2(0, 0));
      return;
    }
    const p = b.getPosition();
    const t = this.path[this.i];
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.speed * dt) {
      b.setTransform(new Vec2(t.x, t.y), 0);
      b.setLinearVelocity(new Vec2(0, 0));
      this.waitT = this.wait;
      if (this.loop) this.i = (this.i + 1) % this.path.length;
      else {
        if (this.i === this.path.length - 1) this.step = -1;
        else if (this.i === 0) this.step = 1;
        this.i += this.step;
      }
      return;
    }
    b.setLinearVelocity(new Vec2((dx / d) * this.speed, (dy / d) * this.speed));
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, this.w)) return;
    this.withBody(ctx, this.body, () => {
      const w = this.w;
      const h = this.h;
      if (this.style === 'wood') {
        roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.05);
        fillStroke(ctx, WOOD);
      } else {
        roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.05);
        fillStroke(ctx, '#6c747d');
        ctx.save();
        ctx.beginPath();
        ctx.rect(-w / 2, -h / 2, w, h * 0.45);
        ctx.clip();
        for (let i = -20; i < 20; i++) {
          ctx.fillStyle = i % 2 ? '#ffd000' : '#1a1a1a';
          ctx.fillRect(i * 0.25, -h / 2, 0.25, h);
        }
        ctx.restore();
        circle(ctx, -w / 2 + 0.15, h / 4, 0.04, '#aaa', null);
        circle(ctx, w / 2 - 0.15, h / 4, 0.04, '#aaa', null);
      }
    });
  }
}

// ------------------------------------------------------------------ collapsing platform

export class CollapsePlatform extends Entity {
  constructor(game, d) {
    super(game, d);
    this.w = d.w ?? 3;
    this.h = d.h ?? 0.4;
    this.delay = d.delay ?? 0.45;
    this.timer = -1;
    this.fallen = false;
    this.age = 0;
    this.material = 'wood';
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Box(this.w / 2, this.h / 2), { density: 8, friction: 0.9 });
  }

  onBeginContact(self, other) {
    if (this.timer >= 0 || this.fallen) return;
    if (characterFrom(other)) this.timer = this.delay;
  }

  preStep(dt) {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && !this.fallen) {
        this.fallen = true;
        this.body.setType('dynamic');
        this.body.setAwake(true);
        const p = this.body.getPosition();
        this.game.audio.woodBreak(p.x, p.y);
        this.game.particles.chips(p.x, p.y, 12, [WOOD, WOOD_DARK, '#7a6a55'], 3);
      }
    }
    if (this.fallen) {
      this.age += dt;
      if (this.age > 10 && !this.dead) this.remove();
    }
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, this.w)) return;
    const shake = this.timer > 0 ? rand(-0.03, 0.03) : 0;
    ctx.save();
    ctx.translate(shake, 0);
    this.withBody(ctx, this.body, () => {
      const w = this.w;
      const h = this.h;
      roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.04);
      fillStroke(ctx, '#a07a52');
      ctx.strokeStyle = '#5c4026';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      for (let x = -w / 2 + 0.5; x < w / 2; x += 0.5) {
        ctx.moveTo(x, -h / 2);
        ctx.lineTo(x + rand(-0.02, 0.02), h / 2);
      }
      ctx.stroke();
      // cracks
      ctx.strokeStyle = 'rgba(40,25,10,0.6)';
      ctx.beginPath();
      ctx.moveTo(-w * 0.2, h / 2);
      ctx.lineTo(-w * 0.15, 0);
      ctx.lineTo(-w * 0.22, -h / 2);
      ctx.moveTo(w * 0.25, h / 2);
      ctx.lineTo(w * 0.3, -h * 0.1);
      ctx.stroke();
    });
    ctx.restore();
  }
}

// ------------------------------------------------------------------ loose props

export class Ball extends Entity {
  constructor(game, d) {
    super(game, d);
    this.r = d.r ?? 0.45;
    this.color = d.color || pick(['#e63946', '#2a9d8f', '#e9c46a', '#457b9d']);
    this.tire = d.type === 'tire';
    this.material = this.tire ? 'ground' : 'ground';
    const b = (this.body = this.makeBody({ type: 'dynamic', position: new Vec2(d.x, d.y + this.r) }));
    this.fixture(b, new Circle(this.r), { density: this.tire ? 4 : 1.5, friction: 0.9, restitution: this.tire ? 0.35 : 0.6 });
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 1)) return;
    this.withBody(ctx, this.body, () => {
      if (this.tire) {
        circle(ctx, 0, 0, this.r, '#232323');
        circle(ctx, 0, 0, this.r * 0.55, '#3a3a3a', OUTLINE, 0.02);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 0.03;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * this.r * 0.75, Math.sin(a) * this.r * 0.75);
          ctx.lineTo(Math.cos(a) * this.r * 0.98, Math.sin(a) * this.r * 0.98);
          ctx.stroke();
        }
      } else {
        circle(ctx, 0, 0, this.r, this.color);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, this.r, -0.4, 0.4);
        ctx.lineTo(0, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, this.r, Math.PI - 0.4, Math.PI + 0.4);
        ctx.lineTo(0, 0);
        ctx.fill();
        circle(ctx, 0, 0, this.r, null);
      }
    });
  }
}
