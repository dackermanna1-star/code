// "Rosa Gelato" — ice-cream vendor on a front-loading cargo trike with a heavy freezer.
// Slow and sturdy. Can jettison the freezer (and all the stock) to lighten the load.

import { Character, Vec2, Box, WeldJoint, clamp } from './character.js';
import { DEG, rand, pick } from '../core/math.js';
import { CAT, MASK } from '../config.js';
import { headBase, nose, eye, brow, mouth, cheek, circle, fillStroke, OUTLINE, shade, roundRectPath } from './looks.js';
import { line, drawWheel, worldText, polyPath } from '../render/draw.js';

const look = {
  skin: '#c98e62',
  shirt: '#2bb3a3',
  sleeve: '#2bb3a3',
  shortSleeve: true,
  pants: '#3a3550',
  shoes: '#f2f2f2',
  socks: '#ff8fb1',
  drawHead(ctx, R, expr) {
    // bun
    circle(ctx, -R * 0.85, R * 0.35, R * 0.38, '#2a1a12');
    headBase(ctx, R, this.skin);
    // hair cap
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.02, Math.PI * 0.18, Math.PI * 1.12);
    ctx.quadraticCurveTo(-R * 0.4, R * 0.25, R * 0.25, R * 0.55);
    ctx.closePath();
    fillStroke(ctx, '#2a1a12');
    nose(ctx, R, this.skin, 0.85);
    cheek(ctx, R);
    eye(ctx, R, expr);
    // lashes
    if (expr === 'normal' || expr === 'scream') {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(R * 0.62, R * 0.46);
      ctx.lineTo(R * 0.72, R * 0.55);
      ctx.moveTo(R * 0.52, R * 0.48);
      ctx.lineTo(R * 0.56, R * 0.58);
      ctx.stroke();
    }
    brow(ctx, R, expr, '#2a1a12', { w: 0.02 });
    mouth(ctx, R, expr, { color: '#b0243f' });
    // earring
    circle(ctx, -R * 0.1, -R * 0.32, R * 0.07, '#ffd23f', OUTLINE, 0.01);
    // paper vendor cap
    ctx.save();
    ctx.translate(-R * 0.05, R * 0.82);
    ctx.rotate(0.12);
    ctx.beginPath();
    ctx.moveTo(-R * 0.7, -R * 0.05);
    ctx.lineTo(R * 0.7, -R * 0.05);
    ctx.lineTo(R * 0.5, R * 0.32);
    ctx.lineTo(-R * 0.55, R * 0.32);
    ctx.closePath();
    fillStroke(ctx, '#ffffff');
    ctx.fillStyle = '#ff8fb1';
    ctx.fillRect(-R * 0.6, R * 0.05, R * 1.2, R * 0.08);
    ctx.restore();
  },
  drawChest(ctx, w, h) {
    // striped apron bib
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w * 0.0, -h / 2, w * 0.5, h * 0.75);
    ctx.fillStyle = '#ff8fb1';
    for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.06 + i * w * 0.12, -h / 2, w * 0.05, h * 0.75);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.25);
    ctx.lineTo(-w * 0.1, h * 0.48);
    ctx.stroke();
  },
  drawHips(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -h / 2, w / 2, h);
    ctx.fillStyle = '#ff8fb1';
    for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.06 + i * w * 0.14, -h / 2, w * 0.05, h);
  },
};

const RR = 0.33;
const FR = 0.24;
const CRANK = 0.16;
const POPSICLES = ['#ff5d8f', '#ffd23f', '#7cdff2', '#8ef08a', '#c792ff', '#ff9248'];

export class Rosa extends Character {
  static id = 'rosa';
  static displayName = 'Rosa Gelato';
  static vehicleName = 'Ice-Cream Trike';
  static blurb = 'Has sold ice cream on this route for 31 years. Today the route has landmines. The ice cream will be delivered.';
  static ability = 'SPACE — Jettison freezer';
  static ability2 = 'SHIFT — Ring bell';
  static stats = { speed: 2, accel: 3, handling: 4, toughness: 4 };
  static toughness = 1.08;
  static voice = { pitch: 1.55, vowel: 'a', formantShift: 1.15 };
  static look = look;
  static portraitColor = '#2bb3a3';

  buildVehicle(x, y) {
    const f = (this.frame = this.makeBody('frame', x, y + 0.55, { angularDamping: 0.3 }));
    this.addFixture(f, new Box(0.78, 0.04, new Vec2(-0.12, -0.12)), { density: 120 });
    this.addFixture(f, new Box(0.03, 0.3, new Vec2(-0.62, 0.18), -0.28), { density: 60 });
    this.addFixture(f, new Box(0.44, 0.03, new Vec2(0.6, 0.05)), { density: 60 });
    this.rear = this.makeWheel('rear', x - 0.86, y + RR, RR, { density: 14, friction: 1.5 });
    this.front = this.makeWheel('front', x + 0.62, y + FR, FR, { density: 18, friction: 1.4 });
    this.rearJ = this.springJoint(f, this.rear, [0, 1], 30000, 2600);
    this.frontJ = this.springJoint(f, this.front, [0, 1], 34000, 2800);

    // freezer box
    const box = (this.box = this.makeBody('freezer', x + 0.6, y + 0.95, { material: 'metal' }));
    this.boxFix = this.addFixture(box, new Box(0.42, 0.32), { density: 165, friction: 0.6 });
    this.boxWeld = this.phys.createJoint(new WeldJoint({}, f, box, new Vec2(x + 0.6, y + 0.65)));
    this.vjoints.push({ joint: this.boxWeld, brk: 22000, name: 'freezer' });
    this.boxAttached = true;
    this.lastCrank = 0;
    this.meter = { label: 'FREEZER', value: 1, color: '#ff8fb1' };
  }

  riderSetup() {
    const f = this.frame;
    const W = (lx, ly) => f.getWorldPoint(new Vec2(lx, ly));
    const bb = W(-0.45, -0.08);
    return {
      seat: W(-0.72, 0.55),
      hipsDir: 85 * DEG,
      chestDir: 72 * DEG,
      headDir: 85 * DEG,
      hands: { N: { body: f, ...xy(W(-0.18, 0.76)) }, F: { body: f, ...xy(W(-0.2, 0.76)) } },
      feet: { N: { x: bb.x + CRANK, y: bb.y }, F: { x: bb.x - CRANK, y: bb.y } },
      seatBreak: 24000,
      gripBreak: 9000,
      seatPlay: 0.25,
    };
  }

  crank() {
    const bb = this.frame.getWorldPoint(new Vec2(-0.45, -0.08));
    const a = (this.rearJ._gone ? 0 : this.rear.getAngle()) * 0.5;
    return {
      bb,
      a,
      N: { x: bb.x + Math.cos(a) * CRANK, y: bb.y + Math.sin(a) * CRANK },
      F: { x: bb.x - Math.cos(a) * CRANK, y: bb.y - Math.sin(a) * CRANK },
    };
  }

  riderCtrl() {
    const c = this.crank();
    return {
      waist: -0.2,
      neck: 0.2,
      hands: { N: this.gripWorld('N'), F: this.gripWorld('F') },
      feet: this.mounted ? { N: c.N, F: c.F } : null,
    };
  }

  control(dt, input) {
    const up = input.isDown('up');
    const down = input.isDown('down');
    const v = this.frame.getLinearVelocity();
    const fwd = this.frame.getWorldVector(new Vec2(1, 0));
    const along = v.x * fwd.x + v.y * fwd.y;
    const top = this.boxAttached ? -29 : -34;
    if (up) {
      Character.drive(this.rearJ, top, this.boxAttached ? 300 : 240);
      Character.freewheel(this.frontJ, 0.4);
    } else if (down) {
      if (along > 1) {
        Character.drive(this.rearJ, 0, 260);
        Character.drive(this.frontJ, 0, 200);
      } else {
        Character.drive(this.rearJ, 10, 140);
        Character.freewheel(this.frontJ, 0.4);
      }
    } else {
      Character.freewheel(this.rearJ, 1.2);
      Character.freewheel(this.frontJ, 0.4);
    }
    this.applyLean(dt, this.boxAttached ? 330 : 260);
  }

  idle() {
    Character.freewheel(this.rearJ, 1);
    Character.freewheel(this.frontJ, 0.4);
  }

  abilityTick(dt, input) {
    if (!this.canControl) return;
    if (input.gamePressed('primary') && this.boxAttached) this.jettison(true);
    if (input.gamePressed('secondary')) {
      const p = this.frame.getPosition();
      this.game.audio.bell(p.x, p.y);
    }
  }

  onVehicleJointBroken(vj) {
    if (vj.name === 'freezer') this.jettison(false);
  }

  jettison(voluntary) {
    if (!this.boxAttached) return;
    this.boxAttached = false;
    this.meter.value = 0;
    if (!this.boxWeld._gone) this.phys.destroyJoint(this.boxWeld);
    const box = this.box;
    const p = box.getPosition();
    const v = box.getLinearVelocity();
    if (voluntary) {
      const m = box.getMass();
      box.applyLinearImpulse(new Vec2(m * 3.5, m * 4), box.getWorldCenter(), true);
      box.applyAngularImpulse(-m * 0.5, true);
      // reaction pushes the trike back a little
      this.frame.applyLinearImpulse(new Vec2(-this.frame.getMass() * 1, 0), this.frame.getWorldCenter(), true);
    }
    this.game.audio.impact(0.8, 'metal', p.x, p.y);
    this.game.audio.bell(p.x, p.y);
    for (let i = 0; i < 7; i++) {
      this.game.spawnDebris({
        x: p.x + rand(-0.3, 0.3),
        y: p.y + 0.3,
        vx: v.x + rand(-2, 4),
        vy: v.y + rand(3, 7),
        w: 0.05,
        h: 0.11,
        color: pick(POPSICLES),
        stick: true,
        angle: rand(0, 6),
        av: rand(-10, 10),
        life: 25,
      });
    }
    this.game.particles.chips(p.x, p.y + 0.3, 14, ['#ffffff', '#e8f6ff', '#c9ecff'], 4, 0.05);
    // after a moment the freezer becomes a regular prop that collides with everything
    setTimeout(() => {
      if (box._gone) return;
      this.boxFix.setFilterData({ groupIndex: 0, categoryBits: CAT.OBJECT, maskBits: MASK.OBJECT });
    }, 700);
  }

  vehiclePostStep() {
    if (this.rearJ._gone) return;
    const a = this.rear.getAngle();
    if (Math.abs(a - this.lastCrank) > 1.2) {
      this.lastCrank = a;
      const p = this.rear.getPosition();
      this.game.audio.tick(p.x, p.y);
    }
  }

  drawVehicle(ctx) {
    const f = this.frame;
    const ws = { tire: '#2a2a2a', rim: '#e6e6e6', inner: '#f6f6f6', spokes: 14, tireW: 0.18, spokeColor: '#9a9a9a', hub: '#2bb3a3' };
    this.withBody(ctx, this.rear, () => drawWheel(ctx, RR, ws));
    this.withBody(ctx, this.front, () => drawWheel(ctx, FR, ws));
    const rl = f.getLocalPoint(this.rear.getPosition());
    const fl = f.getLocalPoint(this.front.getPosition());
    const c = this.crank();
    const bbl = f.getLocalPoint(c.bb);
    this.withBody(ctx, f, () => {
      ctx.lineCap = 'round';
      const tube = (x0, y0, x1, y1) => {
        line(ctx, x0, y0, x1, y1, OUTLINE, 0.075);
        line(ctx, x0, y0, x1, y1, '#3fd1bf', 0.045);
      };
      tube(rl.x, rl.y, -0.62, 0.45);
      tube(rl.x, rl.y, bbl.x, bbl.y);
      tube(-0.62, 0.45, bbl.x, bbl.y);
      tube(bbl.x, bbl.y, 0.25, -0.1);
      tube(0.25, -0.1, fl.x, fl.y);
      tube(-0.62, 0.45, -0.18, 0.12);
      // tray under the freezer
      line(ctx, 0.15, 0.05, 1.05, 0.05, OUTLINE, 0.07);
      line(ctx, 0.15, 0.05, 1.05, 0.05, '#2bb3a3', 0.04);
      // handlebar stem
      tube(-0.12, 0.12, -0.18, 0.76);
      line(ctx, -0.3, 0.78, -0.12, 0.75, '#222', 0.045);
      // seat
      ctx.beginPath();
      ctx.ellipse(-0.73, 0.52, 0.15, 0.05, -0.1, 0, Math.PI * 2);
      fillStroke(ctx, '#3a2a20');
      // chain
      line(ctx, bbl.x, bbl.y, rl.x, rl.y, '#555', 0.02);
      // crank
      const ca = c.a - f.getAngle();
      line(ctx, bbl.x + Math.cos(ca) * CRANK, bbl.y + Math.sin(ca) * CRANK, bbl.x - Math.cos(ca) * CRANK, bbl.y - Math.sin(ca) * CRANK, '#bbb', 0.03);
      circle(ctx, bbl.x, bbl.y, 0.05, '#ddd');
      // bell
      circle(ctx, -0.26, 0.82, 0.035, '#ffd23f', OUTLINE, 0.012);
    });
    const box = this.box;
    if (!box._gone) {
      this.withBody(ctx, box, () => {
        roundRectPath(ctx, -0.42, -0.32, 0.84, 0.64, 0.06);
        fillStroke(ctx, '#fdfdfd');
        ctx.fillStyle = '#ff8fb1';
        ctx.fillRect(-0.42, -0.32, 0.84, 0.12);
        ctx.fillRect(-0.42, 0.2, 0.84, 0.05);
        worldText(ctx, 'GELATO', 0, 0.03, 0.17, '#ff4f87', 'center', 'Bangers, Impact, sans-serif');
        // cone illustration
        polyPath(ctx, [[-0.3, -0.12], [-0.22, -0.12], [-0.26, -0.26]]);
        fillStroke(ctx, '#e0a85c', OUTLINE, 0.012);
        circle(ctx, -0.26, -0.09, 0.05, '#ff8fb1', OUTLINE, 0.012);
        // lid + hinge
        roundRectPath(ctx, -0.44, 0.3, 0.88, 0.06, 0.03);
        fillStroke(ctx, '#e8e8e8');
        // umbrella pole & umbrella
        if (this.boxAttached) {
          line(ctx, 0.3, 0.32, 0.3, 1.0, '#666', 0.025);
          ctx.beginPath();
          ctx.moveTo(-0.15, 0.95);
          ctx.quadraticCurveTo(0.3, 1.25, 0.75, 0.95);
          ctx.closePath();
          fillStroke(ctx, '#ff8fb1');
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(0.15, 0.97);
          ctx.quadraticCurveTo(0.3, 1.13, 0.45, 0.97);
          ctx.closePath();
          ctx.fill();
        }
      });
    }
  }
}

function xy(v) {
  return { x: v.x, y: v.y };
}
