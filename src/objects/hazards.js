// Lethal stuff: spikes, saw blades, pendulum blades, wrecking balls, crushers, mines,
// explosive barrels.

import { Entity, Vec2, Box, Circle, Polygon, CAT, partFrom, characterFrom } from './entity.js';
import { polyPath, fillStroke, circle, line, roundRectPath, OUTLINE, worldText } from '../render/draw.js';
import { rand, clamp } from '../core/math.js';

const STEEL = '#c7cdd4';
const STEEL_DARK = '#7d858f';

// ------------------------------------------------------------------ spikes

export class Spikes extends Entity {
  constructor(game, d) {
    super(game, d);
    this.w = d.w ?? 3;
    this.h = d.h ?? 0.4;
    this.angle = d.angle ?? 0;
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y), angle: this.angle }));
    this.fixture(b, new Box(this.w / 2, this.h * 0.45, new Vec2(0, this.h * 0.45)), { friction: 0.9 });
    this.bloody = 0;
  }

  onBeginContact(self, other, contact) {
    const pu = partFrom(other);
    if (!pu) return;
    const ci = this.phys.contactInfo(contact);
    if (!ci) return;
    const pb = other.getBody();
    const v = pb.getLinearVelocityFromWorldPoint(new Vec2(ci.x, ci.y));
    const up = this.body.getWorldVector(new Vec2(0, 1));
    const into = -(v.x * up.x + v.y * up.y);
    if (into < 1.4) return;
    this.phys.defer(() => {
      if (pu.part.gone) return;
      pu.ragdoll.impale(pu.part, this.body, ci.x, ci.y, { brk: 6500 + into * 300, cause: 'impaled' });
      this.bloody = Math.min(1, this.bloody + 0.35);
    });
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, this.w)) return;
    this.withBody(ctx, this.body, () => {
      const n = Math.max(2, Math.round(this.w / 0.16));
      const sw = this.w / n;
      roundRectPath(ctx, -this.w / 2 - 0.04, -0.02, this.w + 0.08, 0.1, 0.03);
      fillStroke(ctx, '#3b3f45');
      for (let i = 0; i < n; i++) {
        const x0 = -this.w / 2 + i * sw;
        ctx.beginPath();
        ctx.moveTo(x0 + 0.01, 0.06);
        ctx.lineTo(x0 + sw / 2, this.h);
        ctx.lineTo(x0 + sw - 0.01, 0.06);
        ctx.closePath();
        fillStroke(ctx, STEEL, OUTLINE, 0.02);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(x0 + sw / 2, this.h);
        ctx.lineTo(x0 + sw / 2 + 0.015, 0.08);
        ctx.lineTo(x0 + sw * 0.62, 0.08);
        ctx.closePath();
        ctx.fill();
        if (this.bloody > 0 && (i * 7) % 3 !== 0) {
          ctx.fillStyle = `rgba(150,0,0,${0.75 * this.bloody})`;
          ctx.beginPath();
          ctx.moveTo(x0 + sw * 0.3, this.h * 0.55);
          ctx.lineTo(x0 + sw / 2, this.h);
          ctx.lineTo(x0 + sw * 0.7, this.h * 0.55);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
  }
}

// ------------------------------------------------------------------ circular saw

export class Saw extends Entity {
  constructor(game, d) {
    super(game, d);
    this.isSaw = true;
    this.r = d.r ?? 0.7;
    this.spin = d.spin ?? -20;
    this.path = d.path ? [{ x: d.x, y: d.y }, ...d.path.map((p) => ({ x: p[0], y: p[1] }))] : null;
    this.moveSpeed = d.speed ?? 3;
    this.wait = d.wait ?? 0.4;
    this.target = 1;
    this.dirStep = 1;
    this.waitT = 0;
    const b = (this.body = this.makeBody({ type: 'kinematic', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Circle(this.r), { friction: 0.3 });
    b.setAngularVelocity(this.spin);
    this.mount = d.mount !== false;
  }

  preStep(dt) {
    const b = this.body;
    b.setAngularVelocity(this.spin);
    if (!this.path) return;
    if (this.waitT > 0) {
      this.waitT -= dt;
      b.setLinearVelocity(new Vec2(0, 0));
      return;
    }
    const p = b.getPosition();
    const t = this.path[this.target];
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < this.moveSpeed * dt * 1.5) {
      b.setTransform(new Vec2(t.x, t.y), b.getAngle());
      b.setLinearVelocity(new Vec2(0, 0));
      this.waitT = this.wait;
      if (this.target === this.path.length - 1) this.dirStep = -1;
      else if (this.target === 0) this.dirStep = 1;
      this.target += this.dirStep;
      return;
    }
    b.setLinearVelocity(new Vec2((dx / d) * this.moveSpeed, (dy / d) * this.moveSpeed));
  }

  onBeginContact(self, other, contact) {
    this.grind(other, contact);
  }

  onPreSolve(self, other, contact) {
    this.grind(other, contact);
  }

  grind(other, contact) {
    const pu = partFrom(other);
    const p = this.body.getPosition();
    if (!pu) {
      const u = other.getBody().getUserData();
      if (u && (u.kind === 'vehicle' || u.kind === 'object') && this.game.audio.throttle('sawsparks', 80)) {
        const ci = this.phys.contactInfo(contact);
        if (ci) {
          this.game.particles.sparks(ci.x, ci.y, 6, 7);
          this.game.audio.impact(0.5, 'metal', ci.x, ci.y);
        }
      }
      return;
    }
    const part = pu.part;
    if (part.cooldown > 0 || part.gone) return;
    part.cooldown = 0.12;
    const ci = this.phys.contactInfo(contact);
    this.phys.defer(() => {
      if (part.gone) return;
      const rag = pu.ragdoll;
      if (ci) {
        const tang = Math.atan2(ci.y - p.y, ci.x - p.x) + (this.spin < 0 ? -Math.PI / 2 : Math.PI / 2);
        this.game.particles.blood(ci.x, ci.y, 0, 0, 18, 7, 0.8, tang);
      }
      this.game.audio.slice(p.x, p.y);
      if (part.attached && part.kind !== 'hips') {
        rag.sever(part, 'cut');
      } else if (part.kind === 'hips') {
        if (rag.parts.chest.attached && !rag.parts.chest.gone) rag.sever(rag.parts.chest, 'cut');
        else rag.gib(part, 'gibbed');
      } else if (Math.random() < 0.6) {
        rag.gib(part, 'gibbed');
      }
    });
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, this.r + 2)) return;
    if (this.path && this.mount) {
      ctx.strokeStyle = 'rgba(30,30,30,0.6)';
      ctx.lineWidth = 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.path[0].x, this.path[0].y);
      for (const q of this.path) ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,90,90,0.8)';
      ctx.lineWidth = 0.05;
      ctx.stroke();
    } else if (this.mount) {
      line(ctx, p.x, p.y, p.x, p.y - this.r - 0.5, '#2e2e2e', 0.18);
    }
    this.withBody(ctx, this.body, () => {
      const r = this.r;
      const teeth = Math.max(12, Math.round(r * 30));
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = ((i + 0.55) / teeth) * Math.PI * 2;
        ctx.lineTo(Math.cos(a0) * r * 0.86, Math.sin(a0) * r * 0.86);
        ctx.lineTo(Math.cos(a1) * r * 1.03, Math.sin(a1) * r * 1.03);
      }
      ctx.closePath();
      fillStroke(ctx, STEEL, OUTLINE, 0.03);
      circle(ctx, 0, 0, r * 0.72, '#b8bec6', null);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0.3, 1.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 3.4, 4.5);
      ctx.stroke();
      circle(ctx, 0, 0, r * 0.18, '#3b3f45');
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        circle(ctx, Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, r * 0.05, '#666', null);
      }
    });
  }
}

// ------------------------------------------------------------------ pendulum (blade or wrecking ball)

export class Pendulum extends Entity {
  constructor(game, d) {
    super(game, d);
    this.len = d.len ?? 3.2;
    this.amp = d.amp ?? 1.1;
    this.period = d.period ?? 2.8;
    this.phase = d.phase ?? 0;
    this.ball = d.type === 'wrecking';
    this.r = d.r ?? 0.85;
    this.t = 0;
    const b = (this.body = this.makeBody({ type: 'kinematic', position: new Vec2(d.x, d.y), angle: this.angleAt(0) }));
    if (this.ball) {
      this.fixture(b, new Circle(new Vec2(0, -this.len), this.r), { friction: 0.4 });
    } else {
      this.fixture(b, new Box(0.05, (this.len - 0.35) / 2, new Vec2(0, -(this.len - 0.35) / 2)), { friction: 0.4 });
      // crescent blade (sharp)
      const L = this.len;
      this.fixture(
        b,
        new Polygon([new Vec2(-0.75, -L + 0.18), new Vec2(-0.4, -L - 0.12), new Vec2(0, -L - 0.25), new Vec2(0.4, -L - 0.12), new Vec2(0.75, -L + 0.18), new Vec2(0, -L + 0.35)]),
        { friction: 0.2, tag: 'sharp' }
      );
    }
    this.prevSide = 0;
  }

  angleAt(t) {
    return this.amp * Math.sin((t / this.period) * Math.PI * 2 + this.phase);
  }

  preStep(dt) {
    this.t += dt;
    const target = this.angleAt(this.t + dt);
    const cur = this.body.getAngle();
    this.body.setAngularVelocity((target - cur) / dt);
    const side = Math.sign(cur);
    if (side !== this.prevSide && side !== 0) {
      const tip = this.body.getWorldPoint(new Vec2(0, -this.len));
      this.game.audio.whoosh(tip.x, tip.y, this.ball ? 1.2 : 0.9);
    }
    this.prevSide = side;
  }

  onBeginContact(self, other, contact) {
    const pu = partFrom(other);
    const tag = self.getUserData() && self.getUserData().tag;
    if (!pu) {
      if (this.ball) {
        const u = other.getBody().getUserData();
        if (u && u.kind === 'vehicle') {
          const ci = this.phys.contactInfo(contact);
          if (ci) {
            this.game.audio.impact(1, 'metal', ci.x, ci.y);
            this.game.camera.shake(0.25);
          }
        }
      }
      return;
    }
    if (tag !== 'sharp') {
      const ci = this.phys.contactInfo(contact);
      if (ci && this.ball) {
        this.game.audio.impact(1, 'metal', ci.x, ci.y);
        this.game.camera.shake(0.3);
      }
      return;
    }
    const ci = this.phys.contactInfo(contact);
    if (!ci) return;
    const rv = this.phys.relVel(this.body, other.getBody(), ci.x, ci.y);
    if (Math.hypot(rv.x, rv.y) < 2) return;
    const part = pu.part;
    this.phys.defer(() => {
      if (part.gone) return;
      const rag = pu.ragdoll;
      this.game.audio.slice(ci.x, ci.y);
      if (part.kind === 'hips') {
        if (rag.parts.chest.attached) rag.sever(rag.parts.chest, 'cut');
      } else if (part.attached) rag.sever(part, 'cut');
      else rag.gib(part, 'gibbed');
    });
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y - this.len, this.len + 2)) return;
    // mount
    roundRectPath(ctx, p.x - 0.35, p.y - 0.12, 0.7, 0.4, 0.06);
    fillStroke(ctx, '#3b3f45');
    this.withBody(ctx, this.body, () => {
      const L = this.len;
      if (this.ball) {
        // chain
        const links = Math.floor((L - this.r) / 0.22);
        for (let i = 0; i < links; i++) {
          const y = -0.1 - i * 0.22;
          ctx.strokeStyle = i % 2 ? '#555' : '#777';
          ctx.lineWidth = 0.05;
          ctx.beginPath();
          ctx.ellipse(0, y - 0.11, i % 2 ? 0.035 : 0.07, 0.12, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        circle(ctx, 0, -L, this.r, '#2b2d31');
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(-this.r * 0.3, -L + this.r * 0.3, this.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        circle(ctx, 0, -L + this.r - 0.05, 0.1, '#555');
      } else {
        roundRectPath(ctx, -0.06, -L + 0.3, 0.12, L - 0.3, 0.04);
        fillStroke(ctx, '#5b4636');
        polyPath(ctx, [[-0.75, -L + 0.18], [-0.4, -L - 0.12], [0, -L - 0.25], [0.4, -L - 0.12], [0.75, -L + 0.18], [0, -L + 0.35]]);
        fillStroke(ctx, STEEL, OUTLINE, 0.03);
        ctx.strokeStyle = '#eef3f7';
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.moveTo(-0.72, -L + 0.14);
        ctx.quadraticCurveTo(0, -L - 0.42, 0.72, -L + 0.14);
        ctx.stroke();
        circle(ctx, 0, -L + 0.12, 0.08, '#3b3f45');
      }
      circle(ctx, 0, 0, 0.1, '#888');
    });
  }
}

// ------------------------------------------------------------------ crusher

export class Crusher extends Entity {
  constructor(game, d) {
    super(game, d);
    this.w = d.w ?? 2.4;
    this.h = d.h ?? 1.4;
    this.travel = d.travel ?? 3;
    this.top = d.y;
    this.state = 'up';
    this.timer = d.offset ?? 0.5;
    this.waitUp = d.waitUp ?? 1.6;
    this.waitDown = d.waitDown ?? 0.5;
    this.slam = d.slam ?? 15;
    this.rise = d.rise ?? 2.4;
    this.crusher = true;
    const b = (this.body = this.makeBody({ type: 'kinematic', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Box(this.w / 2, this.h / 2), { friction: 0.6 });
  }

  preStep(dt) {
    const b = this.body;
    const y = b.getPosition().y;
    const x = b.getPosition().x;
    if (this.state === 'up' || this.state === 'down') {
      b.setLinearVelocity(new Vec2(0, 0));
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = this.state === 'up' ? 'slam' : 'rise';
      }
    } else if (this.state === 'slam') {
      const bottom = this.top - this.travel;
      if (y - this.slam * dt <= bottom) {
        b.setTransform(new Vec2(x, bottom), 0);
        b.setLinearVelocity(new Vec2(0, 0));
        this.state = 'down';
        this.timer = this.waitDown;
        const by = bottom - this.h / 2;
        this.game.audio.impact(1, 'metal', x, by);
        this.game.audio.impact(1, 'ground', x, by);
        const f = this.playerFocus();
        if (f && Math.abs(f.x - x) < 18) this.game.camera.shake(0.35);
        this.game.particles.dust(x - this.w / 2, by, -3, 0, 6, '#8a8178');
        this.game.particles.dust(x + this.w / 2, by, 3, 0, 6, '#8a8178');
      } else b.setLinearVelocity(new Vec2(0, -this.slam));
    } else if (this.state === 'rise') {
      if (y + this.rise * dt >= this.top) {
        b.setTransform(new Vec2(x, this.top), 0);
        b.setLinearVelocity(new Vec2(0, 0));
        this.state = 'up';
        this.timer = this.waitUp;
      } else b.setLinearVelocity(new Vec2(0, this.rise));
    }
  }

  postStep() {
    if (this.state !== 'slam' && this.state !== 'down') return;
    // anything pinned between the crusher and something solid gets flattened
    for (let ce = this.body.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const other = ce.other;
      const u = other.getUserData();
      if (!u || u.kind !== 'part') continue;
      const part = u.part;
      if (part.gone) continue;
      const pos = other.getPosition();
      if (pos.y > this.body.getPosition().y - this.h / 2) continue; // only things beneath
      let pinned = false;
      for (let ce2 = other.getContactList(); ce2; ce2 = ce2.next) {
        if (!ce2.contact.isTouching()) continue;
        const o2 = ce2.other;
        if (o2 === this.body) continue;
        if (o2.isStatic() || (o2.getUserData() && o2.getUserData().kind === 'vehicle')) {
          pinned = true;
          break;
        }
      }
      if (pinned && this.state === 'slam') {
        this.phys.defer(() => u.ragdoll.gib(part, 'crushed'));
      }
    }
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, this.w + 4)) return;
    // piston rod up to the ceiling mount
    const rodTop = this.top + this.h / 2 + (this.def.rod ?? 3);
    line(ctx, p.x, p.y + this.h / 2, p.x, rodTop, OUTLINE, 0.36);
    line(ctx, p.x, p.y + this.h / 2, p.x, rodTop, '#9aa2ab', 0.28);
    roundRectPath(ctx, p.x - 0.6, rodTop - 0.2, 1.2, 0.5, 0.05);
    fillStroke(ctx, '#3b3f45');
    this.withBody(ctx, this.body, () => {
      const w = this.w;
      const h = this.h;
      roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.08);
      fillStroke(ctx, '#5d636b');
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, 0.3);
      ctx.clip();
      for (let i = -10; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#ffd000' : '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(i * 0.3, -h / 2);
        ctx.lineTo(i * 0.3 + 0.3, -h / 2);
        ctx.lineTo(i * 0.3 + 0.6, -h / 2 + 0.3);
        ctx.lineTo(i * 0.3 + 0.3, -h / 2 + 0.3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.035;
      ctx.strokeRect(-w / 2, -h / 2, w, 0.3);
      for (const bx of [-w / 2 + 0.15, w / 2 - 0.15]) {
        for (const by of [h / 2 - 0.15, -h / 2 + 0.45]) circle(ctx, bx, by, 0.05, '#aaa');
      }
    });
  }
}

// ------------------------------------------------------------------ landmine

export class Mine extends Entity {
  constructor(game, d) {
    super(game, d);
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y), angle: d.angle || 0 }));
    this.fixture(b, new Box(0.24, 0.06, new Vec2(0, 0.06)), {});
    this.fixture(b, new Box(0.28, 0.14, new Vec2(0, 0.2)), { sensor: true });
    this.fuse = -1;
    this.blink = Math.random();
    this.power = d.power ?? 1;
  }

  onBeginContact(self, other) {
    if (!self.isSensor() || other.isSensor() || this.fuse >= 0) return;
    const ob = other.getBody();
    if (!ob.isDynamic()) return;
    const u = ob.getUserData();
    if (u && u.kind === 'debris') return;
    this.fuse = 0.05;
  }

  preStep(dt) {
    this.blink += dt;
    if (this.fuse < 0) return;
    this.fuse -= dt;
    if (this.fuse <= 0 && !this.dead) {
      const p = this.body.getPosition();
      this.remove();
      this.game.explode(p.x, p.y + 0.15, { radius: 4.6, power: this.power });
    }
  }

  onExplosion(f) {
    if (this.fuse < 0 && f > 0.3) this.fuse = rand(0.05, 0.2);
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 1)) return;
    this.withBody(ctx, this.body, () => {
      ctx.beginPath();
      ctx.moveTo(-0.26, 0);
      ctx.quadraticCurveTo(-0.24, 0.16, 0, 0.17);
      ctx.quadraticCurveTo(0.24, 0.16, 0.26, 0);
      ctx.closePath();
      fillStroke(ctx, '#4d5a3a');
      roundRectPath(ctx, -0.07, 0.13, 0.14, 0.07, 0.02);
      fillStroke(ctx, '#2c3322');
      const on = Math.sin(this.blink * 8) > 0.3 || this.fuse >= 0;
      circle(ctx, 0.15, 0.1, 0.03, on ? '#ff2a2a' : '#5a1010', null);
      if (on) {
        ctx.fillStyle = 'rgba(255,40,40,0.25)';
        ctx.beginPath();
        ctx.arc(0.15, 0.1, 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

// ------------------------------------------------------------------ explosive barrel

export class Barrel extends Entity {
  constructor(game, d) {
    super(game, d);
    const b = (this.body = this.makeBody({ type: 'dynamic', position: new Vec2(d.x, d.y + 0.42), angle: d.angle || 0 }));
    this.fixture(b, new Box(0.29, 0.42), { density: 14, friction: 0.6, restitution: 0.1 });
    this.fuse = -1;
    this.material = 'metal';
  }

  onPostSolve(self, other, contact, impulse) {
    if (this.fuse >= 0) return;
    const n = contact.getManifold().pointCount;
    let s = 0;
    for (let i = 0; i < n; i++) s += impulse.normalImpulses[i];
    if (s > 48) this.fuse = 0.02;
  }

  onExplosion(f) {
    if (this.fuse < 0 && f > 0.1) this.fuse = rand(0.1, 0.28);
  }

  preStep(dt) {
    if (this.fuse < 0) return;
    this.fuse -= dt;
    if (this.fuse <= 0 && !this.dead) {
      const p = this.body.getPosition();
      const v = this.body.getLinearVelocity();
      this.remove();
      this.game.explode(p.x, p.y, { radius: 5.6, power: 1.25 });
      for (let i = 0; i < 3; i++) {
        this.game.spawnDebris({
          x: p.x + rand(-0.2, 0.2),
          y: p.y + rand(-0.3, 0.3),
          vx: v.x + rand(-8, 8),
          vy: v.y + rand(4, 12),
          w: rand(0.25, 0.45),
          h: 0.06,
          color: '#c4231b',
          angle: rand(0, 6),
          av: rand(-20, 20),
          density: 6,
          material: 'metal',
          life: 10,
        });
      }
    }
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 1)) return;
    this.withBody(ctx, this.body, () => {
      roundRectPath(ctx, -0.29, -0.42, 0.58, 0.84, 0.06);
      fillStroke(ctx, '#c4231b');
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-0.29, 0.18, 0.58, 0.04);
      ctx.fillRect(-0.29, -0.22, 0.58, 0.04);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-0.2, -0.4, 0.07, 0.8);
      // hazard diamond
      ctx.save();
      ctx.translate(0.03, 0);
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.rect(-0.11, -0.11, 0.22, 0.22);
      fillStroke(ctx, '#ffd000', OUTLINE, 0.015);
      ctx.restore();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(0.03, -0.09);
      ctx.quadraticCurveTo(-0.07, 0.0, 0.0, 0.09);
      ctx.quadraticCurveTo(0.02, 0.02, 0.06, 0.04);
      ctx.quadraticCurveTo(0.1, -0.04, 0.03, -0.09);
      ctx.fill();
    });
  }
}

// ------------------------------------------------------------------ electric fence (zapper)

export class Zapper extends Entity {
  constructor(game, d) {
    super(game, d);
    this.h = d.h ?? 2.5;
    this.period = d.period ?? 2.4;
    this.onFor = d.onFor ?? 1.2;
    this.t = d.offset ?? 0;
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Box(0.12, 0.1, new Vec2(0, 0.1)), {});
    this.fixture(b, new Box(0.12, 0.1, new Vec2(0, this.h - 0.1)), {});
    this.fixture(b, new Box(0.08, this.h / 2 - 0.2, new Vec2(0, this.h / 2)), { sensor: true });
    this.touching = new Map();
  }

  get on() {
    return this.t % this.period < this.onFor;
  }

  onBeginContact(self, other) {
    if (!self.isSensor()) return;
    const pu = partFrom(other);
    if (!pu) return;
    this.touching.set(pu.part, pu);
  }

  onEndContact(self, other) {
    if (!self.isSensor()) return;
    const pu = partFrom(other);
    if (pu) this.touching.delete(pu.part);
  }

  preStep(dt) {
    this.t += dt;
    if (!this.on) return;
    for (const [part, pu] of this.touching) {
      if (part.gone) {
        this.touching.delete(part);
        continue;
      }
      const b = part.body;
      const p = b.getPosition();
      b.applyLinearImpulse(new Vec2(rand(-1, 1) * b.getMass() * 0.8, rand(0, 1) * b.getMass() * 0.8), p, true);
      pu.ragdoll.damage(dt * 30, 'zapped');
      if (Math.random() < 0.3) this.game.particles.sparks(p.x, p.y, 3, 4, 0, Math.PI * 2, '#9ff3ff');
      this.game.audio.zap(p.x, p.y);
      pu.ragdoll.hurtTimer = 0.3;
    }
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y + this.h / 2, this.h)) return;
    const x = this.x;
    const y = this.y;
    roundRectPath(ctx, x - 0.14, y, 0.28, 0.22, 0.04);
    fillStroke(ctx, '#3b3f45');
    roundRectPath(ctx, x - 0.14, y + this.h - 0.22, 0.28, 0.22, 0.04);
    fillStroke(ctx, '#3b3f45');
    if (this.on) {
      ctx.strokeStyle = '#bff7ff';
      ctx.lineWidth = 0.04;
      ctx.shadowColor = '#4fe3ff';
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.moveTo(x, y + 0.2);
        const n = 10;
        for (let i = 1; i <= n; i++) ctx.lineTo(x + rand(-0.12, 0.12), y + 0.2 + ((this.h - 0.4) * i) / n);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.strokeStyle = 'rgba(120,200,220,0.25)';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.moveTo(x, y + 0.2);
      ctx.lineTo(x, y + this.h - 0.2);
      ctx.stroke();
    }
  }
}
