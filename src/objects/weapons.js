// Turrets that shoot at the player: harpoon guns (impale + pin to walls) and cannons.

import { Entity, Vec2, Box, Circle, CAT, partFrom, characterFrom } from './entity.js';
import { WeldJoint } from 'planck';
import { fillStroke, circle, line, roundRectPath, polyPath, OUTLINE } from '../render/draw.js';
import { clamp, wrapAngle, rand } from '../core/math.js';

// ------------------------------------------------------------------ harpoon projectile

export class Harpoon extends Entity {
  constructor(game, d) {
    super(game, d);
    this.kind = 'object';
    this.material = 'metal';
    this.life = 18;
    this.age = 0;
    this.stuck = null; // 'part' | 'body' | 'wall'
    const b = (this.body = this.makeBody({
      type: 'dynamic',
      position: new Vec2(d.x, d.y),
      angle: d.angle,
      bullet: true,
      linearVelocity: new Vec2(Math.cos(d.angle) * d.speed, Math.sin(d.angle) * d.speed),
    }));
    this.fixture(b, new Box(0.55, 0.03), { density: 45, friction: 0.3 }, CAT.PROJECTILE);
    b.setGravityScale(0.35);
  }

  onBeginContact(self, other, contact) {
    if (this.stuck === 'wall') return;
    const ob = other.getBody();
    if (other.isSensor()) return;
    const ci = this.phys.contactInfo(contact);
    if (!ci) return;
    const v = this.body.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y);
    const tip = this.body.getWorldPoint(new Vec2(0.5, 0));
    const pu = partFrom(other);
    if (pu && !this.stuck && speed > 8) {
      this.stuck = 'part';
      this.phys.defer(() => {
        if (pu.part.gone || this.dead) return;
        pu.ragdoll.impale(pu.part, this.body, tip.x, tip.y, {
          weld: true,
          brk: 15000,
          cause: 'harpoon',
          damage: pu.part.kind === 'head' ? 999 : pu.part.kind === 'chest' ? 55 : 20,
          max: 3,
        });
        // keep flying a bit: the harpoon drags the victim with it
        this.life = 60;
      });
      return;
    }
    if (ob.isStatic() && speed > 6) {
      this.stuck = 'wall';
      this.phys.defer(() => {
        if (this.dead) return;
        const p = this.body.getPosition();
        const a = this.body.getAngle();
        this.body.setType('static');
        this.body.setTransform(new Vec2(p.x + Math.cos(a) * 0.12, p.y + Math.sin(a) * 0.12), a);
        this.game.audio.impact(0.8, 'metal', tip.x, tip.y);
        this.game.particles.chips(tip.x, tip.y, 6, ['#6b5a45', '#4a3d30'], 3);
        this.life = 40;
      });
      return;
    }
    const u = ob.getUserData();
    if (!this.stuck && u && (u.kind === 'vehicle' || u.kind === 'object') && ob.isDynamic() && speed > 8) {
      this.stuck = 'body';
      this.phys.defer(() => {
        if (this.dead || ob._gone) return;
        this.phys.createJoint(new WeldJoint({}, ob, this.body, new Vec2(tip.x, tip.y)));
        this.game.audio.impact(0.8, 'metal', tip.x, tip.y);
        this.game.particles.sparks(tip.x, tip.y, 8, 4);
      });
    }
  }

  update(dt) {
    this.age += dt;
    if (this.age > this.life && !this.dead) this.remove();
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 2)) return;
    this.withBody(ctx, this.body, () => {
      roundRectPath(ctx, -0.55, -0.03, 0.9, 0.06, 0.02);
      fillStroke(ctx, '#6b4a2b', OUTLINE, 0.02);
      polyPath(ctx, [[0.32, -0.06], [0.62, 0], [0.32, 0.06], [0.38, 0]]);
      fillStroke(ctx, '#cfd5dc', OUTLINE, 0.02);
      polyPath(ctx, [[0.36, 0.05], [0.28, 0.12], [0.3, 0.04]]);
      fillStroke(ctx, '#cfd5dc', OUTLINE, 0.012);
      polyPath(ctx, [[0.36, -0.05], [0.28, -0.12], [0.3, -0.04]]);
      fillStroke(ctx, '#cfd5dc', OUTLINE, 0.012);
      // fletching
      polyPath(ctx, [[-0.55, 0], [-0.62, 0.08], [-0.45, 0.02]]);
      fillStroke(ctx, '#d42020', null);
      polyPath(ctx, [[-0.55, 0], [-0.62, -0.08], [-0.45, -0.02]]);
      fillStroke(ctx, '#d42020', null);
    });
  }
}

// ------------------------------------------------------------------ harpoon gun

export class HarpoonGun extends Entity {
  constructor(game, d) {
    super(game, d);
    this.range = d.range ?? 24;
    this.cooldown = d.cooldown ?? 2.4;
    this.speed = d.speed ?? 40;
    this.facing = d.facing ?? -1;
    this.aim = this.facing < 0 ? Math.PI : 0;
    this.cone = d.cone ?? 1.4;
    this.timer = d.delay ?? 0.8;
    this.recoil = 0;
    this.mountAngle = d.mount ?? 0; // 0 = floor, PI = ceiling
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y), angle: this.mountAngle }));
    // turrets live in the background plane unless explicitly solid
    if (d.solid) this.fixture(b, new Box(0.4, 0.3, new Vec2(0, 0.3)), {});
    else this.layer = 'back';
    this.pivot = b.getWorldPoint(new Vec2(0, 0.75));
  }

  target() {
    const pl = this.game.player;
    if (!pl || !pl.alive) return null;
    const fb = pl.rider.parts.chest.gone ? pl.frame : pl.rider.parts.chest.body;
    const p = fb.getPosition();
    const v = fb.getLinearVelocity();
    return { p, v, body: fb, character: pl };
  }

  preStep(dt) {
    this.timer -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 3);
    const t = this.target();
    if (!t) return;
    const dx0 = t.p.x - this.pivot.x;
    const dy0 = t.p.y - this.pivot.y;
    const dist = Math.hypot(dx0, dy0);
    if (dist > this.range) return;
    const lead = (dist / this.speed) * 0.9;
    const tx = t.p.x + t.v.x * lead;
    const ty = t.p.y + t.v.y * lead + 0.5 * 11 * 0.35 * lead * lead;
    let want = Math.atan2(ty - this.pivot.y, tx - this.pivot.x);
    const base = this.facing < 0 ? Math.PI : 0;
    const off = clamp(wrapAngle(want - base), -this.cone, this.cone);
    want = base + off;
    const diff = wrapAngle(want - this.aim);
    this.aim += clamp(diff, -3 * dt, 3 * dt);
    if (this.timer <= 0 && Math.abs(diff) < 0.06) {
      // line of sight
      const mx = this.pivot.x + Math.cos(this.aim) * 0.9;
      const my = this.pivot.y + Math.sin(this.aim) * 0.9;
      const hit = this.phys.rayCast(mx, my, t.p.x, t.p.y, (f) => !f.isSensor() && (f.getFilterCategoryBits() & (CAT.TERRAIN | CAT.OBJECT)) !== 0);
      if (hit && hit.body.isStatic()) return;
      this.fire(mx, my);
    }
  }

  fire(x, y) {
    this.timer = this.cooldown;
    this.recoil = 1;
    this.game.addEntity(new Harpoon(this.game, { x, y, angle: this.aim, speed: this.speed }));
    this.game.audio.harpoonFire(x, y);
    this.game.particles.smoke(x, y, 4, 0.25, '#bbb', 0.5);
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, 3)) return;
    this.withBody(ctx, this.body, () => {
      polyPath(ctx, [[-0.45, 0], [0.45, 0], [0.32, 0.55], [-0.32, 0.55]]);
      fillStroke(ctx, '#3b4a3a');
      circle(ctx, 0, 0.75, 0.24, '#55634f');
    });
    const px = this.pivot.x;
    const py = this.pivot.y;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.aim);
    ctx.translate(-this.recoil * 0.25, 0);
    roundRectPath(ctx, -0.45, -0.16, 1.35, 0.32, 0.08);
    fillStroke(ctx, '#4b5a48');
    roundRectPath(ctx, 0.7, -0.12, 0.3, 0.24, 0.04);
    fillStroke(ctx, '#2b2f2a');
    ctx.fillStyle = '#ffd000';
    ctx.fillRect(-0.3, -0.16, 0.12, 0.32);
    if (this.timer > 0.35) {
      // reloading: harpoon tip peeks out
    } else {
      polyPath(ctx, [[0.95, -0.05], [1.12, 0], [0.95, 0.05]]);
      fillStroke(ctx, '#cfd5dc', OUTLINE, 0.015);
    }
    ctx.restore();
    circle(ctx, px, py, 0.1, '#222');
  }
}

// ------------------------------------------------------------------ cannon

export class Cannonball extends Entity {
  constructor(game, d) {
    super(game, d);
    this.material = 'metal';
    this.life = 9;
    this.age = 0;
    const b = (this.body = this.makeBody({
      type: 'dynamic',
      position: new Vec2(d.x, d.y),
      bullet: true,
      linearVelocity: new Vec2(d.vx, d.vy),
    }));
    this.fixture(b, new Circle(0.22), { density: 110, friction: 0.5, restitution: 0.25 }, CAT.PROJECTILE);
  }

  update(dt) {
    this.age += dt;
    if (this.age > this.life && !this.dead) this.remove();
  }

  draw(ctx, view) {
    const p = this.body.getPosition();
    if (!this.inView(view, p.x, p.y, 1)) return;
    const fade = Math.min(1, (this.life - this.age) * 2);
    ctx.globalAlpha = fade;
    circle(ctx, p.x, p.y, 0.22, '#1e1f22');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(p.x - 0.07, p.y + 0.07, 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export class Cannon extends Entity {
  constructor(game, d) {
    super(game, d);
    this.angle = d.angle ?? Math.PI * 0.85;
    this.interval = d.interval ?? 3;
    this.speed = d.speed ?? 18;
    this.timer = d.delay ?? 1;
    this.range = d.range ?? 40;
    this.flash = 0;
    const b = (this.body = this.makeBody({ type: 'static', position: new Vec2(d.x, d.y) }));
    if (d.solid) this.fixture(b, new Box(0.6, 0.35, new Vec2(0, 0.35)), {});
    else this.layer = 'back';
  }

  preStep(dt) {
    this.flash = Math.max(0, this.flash - dt * 6);
    const f = this.playerFocus();
    if (!f || Math.abs(f.x - this.x) > this.range) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      const mx = this.x + Math.cos(this.angle) * 1.2;
      const my = this.y + 0.75 + Math.sin(this.angle) * 1.2;
      this.game.addEntity(new Cannonball(this.game, { x: mx, y: my, vx: Math.cos(this.angle) * this.speed, vy: Math.sin(this.angle) * this.speed }));
      this.game.audio.cannon(mx, my);
      this.game.particles.smoke(mx, my, 10, 0.5, '#9a9a9a', 1);
      this.game.particles.fire(mx, my, 6, 0.3, Math.cos(this.angle) * 4, Math.sin(this.angle) * 4);
      this.flash = 1;
    }
  }

  draw(ctx, view) {
    if (!this.inView(view, this.x, this.y, 3)) return;
    const x = this.x;
    const y = this.y;
    ctx.save();
    ctx.translate(x, y + 0.75);
    ctx.rotate(this.angle);
    roundRectPath(ctx, -0.5, -0.24, 1.75, 0.48, 0.14);
    fillStroke(ctx, '#26282c');
    roundRectPath(ctx, 1.05, -0.28, 0.25, 0.56, 0.06);
    fillStroke(ctx, '#1a1b1e');
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(-0.3, 0.06, 1.3, 0.08);
    ctx.restore();
    // wooden carriage
    polyPath(ctx, [[x - 0.7, y], [x + 0.7, y], [x + 0.45, y + 0.8], [x - 0.5, y + 0.8]]);
    fillStroke(ctx, '#7a5230');
    circle(ctx, x - 0.4, y + 0.22, 0.25, '#5a3a20');
    circle(ctx, x + 0.4, y + 0.22, 0.25, '#5a3a20');
    circle(ctx, x, y + 0.75, 0.12, '#888');
  }
}
