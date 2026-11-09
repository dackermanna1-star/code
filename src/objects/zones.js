// Sensor-driven objects: speed boosts, launch pads, checkpoints, collectibles, finish line,
// and decorative signs.

import { Entity, Vec2, Box, Circle, Polygon, CAT, partFrom, characterFrom } from './entity.js';
import { fillStroke, circle, line, roundRectPath, polyPath, OUTLINE, worldText } from '../render/draw.js';
import { clamp, rand } from '../core/math.js';

// ------------------------------------------------------------------ speed boost

export class Boost extends Entity {
  constructor(game, d) {
    super(game, d);
    this.w = d.w ?? 4;
    this.h = d.h ?? 1.6;
    this.angle = d.angle ?? 0;
    this.power = d.power ?? 34;
    this.max = d.max ?? 26;
    this.layer = 'back';
    this.dir = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y + this.h / 2), angle: this.angle }));
    this.fixture(b, new Box(this.w / 2, this.h / 2), { sensor: true });
    this.inside = new Map();
    this.t = 0;
  }

  onBeginContact(self, other) {
    if (other.isSensor()) return;
    const b = other.getBody();
    if (!b.isDynamic()) return;
    this.inside.set(b, (this.inside.get(b) || 0) + 1);
    if (this.isPlayer(other)) {
      const p = b.getPosition();
      this.game.audio.boost(p.x, p.y);
    }
  }

  onEndContact(self, other) {
    const b = other.getBody();
    const n = (this.inside.get(b) || 0) - 1;
    if (n <= 0) this.inside.delete(b);
    else this.inside.set(b, n);
  }

  preStep(dt) {
    this.t += dt;
    for (const b of this.inside.keys()) {
      if (b._gone) {
        this.inside.delete(b);
        continue;
      }
      const v = b.getLinearVelocity();
      const along = v.x * this.dir.x + v.y * this.dir.y;
      if (along >= this.max) continue;
      const m = b.getMass();
      b.applyForceToCenter(new Vec2(this.dir.x * m * this.power, this.dir.y * m * this.power), true);
    }
  }

  update(dt) {
    this.t += 0;
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, this.w)) return;
    const t = this.game.time;
    this.withBody(ctx, this.body, () => {
      const w = this.w;
      const h = this.h;
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, 'rgba(255,200,40,0.0)');
      g.addColorStop(0.5, 'rgba(255,170,30,0.22)');
      g.addColorStop(1, 'rgba(255,200,40,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.clip();
      const sp = 0.9;
      const off = (t * 3) % sp;
      for (let x = -w / 2 - sp + off; x < w / 2 + sp; x += sp) {
        const a = clamp(1 - Math.abs(x) / (w / 2), 0, 1);
        ctx.fillStyle = `rgba(255,${150 + Math.round(a * 80)},40,${0.35 + a * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(x, -h * 0.28);
        ctx.lineTo(x + 0.3, 0);
        ctx.lineTo(x, h * 0.28);
        ctx.lineTo(x + 0.15, h * 0.28);
        ctx.lineTo(x + 0.45, 0);
        ctx.lineTo(x + 0.15, -h * 0.28);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }
}

// ------------------------------------------------------------------ launch pad (spring)

export class LaunchPad extends Entity {
  constructor(game, d) {
    super(game, d);
    this.angle = d.angle ?? 0;
    this.power = d.power ?? 17;
    this.w = d.w ?? 1.8;
    this.fixed = !!d.fixed;
    this.cool = new Map();
    this.squash = 0;
    // pads are sunk into the ground so the plate is flush with the surface
    const sink = d.flush === false ? 0 : 0.2;
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y - sink * Math.cos(this.angle)), angle: this.angle }));
    // trapezoid base so wheels roll on instead of wedging against a step
    const hw = this.w / 2;
    this.fixture(b, new Polygon([new Vec2(-hw - 0.5, 0), new Vec2(hw + 0.5, 0), new Vec2(hw, 0.2), new Vec2(-hw, 0.2)]), { friction: 0.8 });
    this.fixture(b, new Box(hw - 0.05, 0.2, new Vec2(0, 0.38)), { sensor: true });
    this.normal = this.body.getWorldVector(new Vec2(0, 1));
  }

  onBeginContact(self, other) {
    if (!self.isSensor() || other.isSensor()) return;
    const ob = other.getBody();
    if (!ob.isDynamic()) return;
    const ch = characterFrom(other);
    const key = ch || ob;
    if ((this.cool.get(key) || 0) > this.game.time) return;
    this.cool.set(key, this.game.time + 0.6);
    this.phys.defer(() => {
      if (ch) ch.noCrash = 0.3;
      const bodies = ch ? ch.allBodies() : [ob];
      const n = this.normal;
      for (const b of bodies) {
        if (b._gone) continue;
        const v = b.getLinearVelocity();
        if (this.fixed) {
          // catapult: deterministic launch, keeps only a little of the incoming speed
          b.setLinearVelocity(new Vec2(n.x * this.power + v.x * 0.15, n.y * this.power));
          const wheel = b.getUserData() && b.getUserData().material === 'rubber';
          if (!wheel) b.setAngularVelocity(0);
        } else {
          const vn = v.x * n.x + v.y * n.y;
          const add = Math.max(0, this.power - vn);
          b.setLinearVelocity(new Vec2(v.x + n.x * add, v.y + n.y * add));
        }
      }
      this.squash = 1;
      const p = this.body.getWorldPoint(new Vec2(0, 0.3));
      this.game.audio.boing(p.x, p.y);
      this.game.particles.dust(p.x, p.y, 0, 0, 6, '#ddd');
    });
  }

  update(dt) {
    this.squash = Math.max(0, this.squash - dt * 4);
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, 2)) return;
    this.withBody(ctx, this.body, () => {
      const w = this.w;
      polyPath(ctx, [[-w / 2 - 0.5, 0], [w / 2 + 0.5, 0], [w / 2, 0.2], [-w / 2, 0.2]]);
      fillStroke(ctx, '#3b3f45');
      const ext = 0.06 + (this.squash > 0.5 ? 0.35 : 0);
      // spring coils
      ctx.strokeStyle = '#c7cdd4';
      ctx.lineWidth = 0.04;
      for (const sx of [-w / 3, w / 3]) {
        ctx.beginPath();
        const top = 0.16 + ext;
        for (let i = 0; i <= 6; i++) {
          const y = 0.16 + ((top - 0.16) * i) / 6;
          ctx.lineTo(sx + (i % 2 ? 0.1 : -0.1), y);
        }
        ctx.stroke();
      }
      roundRectPath(ctx, -w / 2 + 0.05, 0.16 + ext, w - 0.1, 0.12, 0.04);
      fillStroke(ctx, '#ff3d6e');
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-0.15, 0.2 + ext);
      ctx.lineTo(0, 0.26 + ext);
      ctx.lineTo(0.15, 0.2 + ext);
      ctx.fill();
    });
  }
}

// ------------------------------------------------------------------ checkpoint

export class Checkpoint extends Entity {
  constructor(game, d) {
    super(game, d);
    this.active = false;
    this.layer = 'back';
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Box(0.6, 6, new Vec2(0, 5)), { sensor: true });
    this.wave = 0;
  }

  onBeginContact(self, other) {
    if (this.active) return;
    const ch = characterFrom(other);
    if (!ch || ch !== this.game.player || !ch.alive) return;
    this.active = true;
    this.game.reachCheckpoint(this);
  }

  update(dt) {
    this.wave += dt;
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, 3)) return;
    const x = this.x;
    const y = this.y;
    line(ctx, x, y, x, y + 3.2, OUTLINE, 0.12);
    line(ctx, x, y, x, y + 3.2, '#d9d9d9', 0.07);
    circle(ctx, x, y + 3.25, 0.1, this.active ? '#3ddc84' : '#999');
    const col = this.active ? '#3ddc84' : '#e4572e';
    ctx.beginPath();
    ctx.moveTo(x + 0.04, y + 3.1);
    for (let i = 0; i <= 8; i++) {
      const fx = x + 0.04 + i * 0.14;
      ctx.lineTo(fx, y + 3.1 + Math.sin(this.wave * 6 + i * 0.7) * 0.06);
    }
    for (let i = 8; i >= 0; i--) {
      const fx = x + 0.04 + i * 0.14;
      ctx.lineTo(fx, y + 2.4 + Math.sin(this.wave * 6 + i * 0.7) * 0.06);
    }
    ctx.closePath();
    fillStroke(ctx, col);
    roundRectPath(ctx, x - 0.35, y, 0.7, 0.15, 0.04);
    fillStroke(ctx, '#555');
  }
}

// ------------------------------------------------------------------ collectible: golden tooth

export class Tooth extends Entity {
  constructor(game, d) {
    super(game, d);
    this.isTooth = true;
    this.index = d.index ?? 0;
    this.taken = !!d.taken;
    this.layer = 'front';
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Circle(0.45), { sensor: true });
    this.t = Math.random() * 6;
  }

  onBeginContact(self, other) {
    if (this.taken) return;
    const ch = characterFrom(other);
    if (!ch || ch !== this.game.player || !ch.alive) return;
    this.taken = true;
    this.game.collectTooth(this);
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, 2)) return;
    const y = this.y + Math.sin(this.t * 2.5) * 0.12;
    const sx = Math.cos(this.t * 2.2);
    ctx.save();
    ctx.translate(this.x, y);
    if (this.taken) {
      ctx.globalAlpha = 0.2;
    }
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.7);
    glow.addColorStop(0, 'rgba(255,220,90,0.55)');
    glow.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(Math.max(0.2, Math.abs(sx)), 1);
    ctx.beginPath();
    ctx.moveTo(-0.22, 0.2);
    ctx.quadraticCurveTo(-0.26, 0.32, -0.12, 0.3);
    ctx.quadraticCurveTo(0, 0.24, 0.12, 0.3);
    ctx.quadraticCurveTo(0.26, 0.32, 0.22, 0.2);
    ctx.quadraticCurveTo(0.2, -0.05, 0.13, -0.28);
    ctx.quadraticCurveTo(0.08, -0.34, 0.04, -0.2);
    ctx.lineTo(0.0, -0.05);
    ctx.lineTo(-0.04, -0.2);
    ctx.quadraticCurveTo(-0.08, -0.34, -0.13, -0.28);
    ctx.quadraticCurveTo(-0.2, -0.05, -0.22, 0.2);
    ctx.closePath();
    fillStroke(ctx, '#ffd23f', '#7a5a00', 0.03);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(-0.08, 0.15, 0.04, 0.08, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ finish line

export class Finish extends Entity {
  constructor(game, d) {
    super(game, d);
    this.h = d.h ?? 6;
    this.layer = 'back';
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y) }));
    this.fixture(b, new Box(0.5, this.h / 2, new Vec2(0, this.h / 2)), { sensor: true });
    this.t = 0;
  }

  onBeginContact(self, other) {
    const u = other.getBody().getUserData();
    if (!u || u.kind !== 'part') return;
    const ch = u.character;
    if (!ch || ch !== this.game.player || !ch.alive) return;
    if (!u.ragdoll.connectedToCore(u.part)) return;
    this.game.finishLevel();
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, 6)) return;
    const x = this.x;
    const y = this.y;
    const h = this.h;
    const span = 1.6;
    for (const px of [x - span, x + span]) {
      line(ctx, px, y, px, y + h, OUTLINE, 0.18);
      line(ctx, px, y, px, y + h, '#e8e8e8', 0.12);
    }
    // checkered banner
    const bw = span * 2 + 0.4;
    const bh = 0.9;
    const bx = x - bw / 2;
    const by = y + h - bh;
    const cells = 12;
    const cw = bw / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#111' : '#fafafa';
        const wave = Math.sin(this.t * 3 + i * 0.5) * 0.05;
        ctx.fillRect(bx + i * cw, by + j * (bh / 2) + wave, cw + 0.01, bh / 2 + 0.01);
      }
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.04;
    ctx.strokeRect(bx, by, bw, bh);
    worldText(ctx, 'FINISH', x, y + h + 0.45, 0.7, '#ffd23f', 'center', 'Bangers, Impact, sans-serif', '#111');
    // line on the ground
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#111' : '#fafafa';
      ctx.fillRect(x - 0.25 + (i % 2) * 0.25, y + i * 0.25 - 0.2, 0.25, 0.25);
    }
  }
}

// ------------------------------------------------------------------ sign (decorative)

export class Sign extends Entity {
  constructor(game, d) {
    super(game, d);
    this.text = d.text || '';
    this.lines = this.text.split('\n');
    this.w = d.w ?? Math.max(2.2, Math.max(...this.lines.map((l) => l.length)) * 0.2 + 0.5);
    this.layer = 'back';
    this.style = d.style || 'wood';
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, this.w)) return;
    const x = this.x;
    const y = this.y;
    const h = this.lines.length * 0.42 + 0.35;
    const top = y + 1.4 + h;
    line(ctx, x - this.w * 0.3, y, x - this.w * 0.3, y + 1.5, OUTLINE, 0.14);
    line(ctx, x + this.w * 0.3, y, x + this.w * 0.3, y + 1.5, OUTLINE, 0.14);
    line(ctx, x - this.w * 0.3, y, x - this.w * 0.3, y + 1.5, '#6b4a2b', 0.09);
    line(ctx, x + this.w * 0.3, y, x + this.w * 0.3, y + 1.5, '#6b4a2b', 0.09);
    const warn = this.style === 'warning';
    roundRectPath(ctx, x - this.w / 2, y + 1.4, this.w, h, 0.08);
    fillStroke(ctx, warn ? '#ffd000' : '#c49260');
    if (!warn) {
      ctx.strokeStyle = 'rgba(80,50,20,0.3)';
      ctx.lineWidth = 0.015;
      for (let yy = y + 1.55; yy < top; yy += 0.18) {
        ctx.beginPath();
        ctx.moveTo(x - this.w / 2 + 0.05, yy);
        ctx.lineTo(x + this.w / 2 - 0.05, yy);
        ctx.stroke();
      }
    }
    this.lines.forEach((l, i) => {
      worldText(ctx, l, x, top - 0.38 - i * 0.42, 0.34, warn ? '#111' : '#2b1a0a', 'center', 'Bangers, Impact, sans-serif');
    });
  }
}
