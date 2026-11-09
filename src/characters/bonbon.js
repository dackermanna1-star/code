// "Bonbon the Clown" — balances on a unicycle (with a little gyroscopic help). Can hop
// remarkably high and honk a horn, which helps nobody.

import { Character, Vec2, Box, clamp } from './character.js';
import { DEG, wrapAngle } from '../core/math.js';
import { headBase, eye, brow, mouth, circle, fillStroke, OUTLINE, shade, roundRectPath } from './looks.js';
import { line, drawWheel } from '../render/draw.js';

const HAIR = ['#ff3d6e', '#ffb800', '#2ec4ff', '#7cfc5a', '#b05cff'];

const look = {
  skin: '#fbf7f2',
  shirt: '#ffd23f',
  sleeve: '#ffd23f',
  pants: '#ffd23f',
  shoes: '#e01e37',
  gloves: '#ffffff',
  shoeLen: 1.7,
  drawHead(ctx, R, expr, rag) {
    // afro puffs behind
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.45 + i * 0.22);
      circle(ctx, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95 - R * 0.05, R * 0.42, HAIR[i], OUTLINE, 0.015);
    }
    headBase(ctx, R, this.skin);
    // diamond eye paint
    ctx.fillStyle = '#2e6bff';
    ctx.beginPath();
    ctx.moveTo(R * 0.5, R * 0.62);
    ctx.lineTo(R * 0.68, R * 0.22);
    ctx.lineTo(R * 0.5, -R * 0.12);
    ctx.lineTo(R * 0.32, R * 0.22);
    ctx.closePath();
    ctx.fill();
    eye(ctx, R, expr);
    brow(ctx, R, expr, '#222');
    // painted grin
    ctx.fillStyle = '#e01e37';
    ctx.beginPath();
    ctx.moveTo(R * 0.15, -R * 0.3);
    ctx.quadraticCurveTo(R * 0.6, -R * 0.95, R * 1.0, -R * 0.25);
    ctx.quadraticCurveTo(R * 0.6, -R * 0.55, R * 0.15, -R * 0.3);
    ctx.fill();
    mouth(ctx, R, expr, { y: -R * 0.5, x: R * 0.62 });
    // big red nose (squishes when honking)
    const squish = rag && rag.character && rag.character.honkT > 0 ? 0.75 : 1;
    ctx.beginPath();
    ctx.ellipse(R * 1.02, -R * 0.02, R * 0.3 / squish, R * 0.3 * squish, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#ff1e2d');
    circle(ctx, R * 1.1, R * 0.08, R * 0.08, 'rgba(255,255,255,0.7)', null);
    // tiny hat
    ctx.save();
    ctx.translate(R * 0.05, R * 0.9);
    ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.moveTo(-R * 0.3, 0);
    ctx.lineTo(R * 0.3, 0);
    ctx.lineTo(0, R * 0.75);
    ctx.closePath();
    fillStroke(ctx, '#7b2cbf');
    circle(ctx, 0, R * 0.78, R * 0.12, '#ffd23f');
    ctx.restore();
  },
  drawChest(ctx, w, h) {
    // polka dots
    ctx.fillStyle = '#e01e37';
    for (const [px, py] of [[-0.06, 0.1], [0.08, -0.08], [-0.05, -0.16], [0.1, 0.14], [0.0, 0.0]]) {
      ctx.beginPath();
      ctx.arc(px, py, 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    // ruff collar
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const x = -w / 2 + (i / 6) * w;
      ctx.lineTo(x, h / 2 - 0.02);
      ctx.lineTo(x + w / 12, h / 2 - 0.09);
    }
    ctx.lineTo(w / 2, h / 2 + 0.05);
    ctx.lineTo(-w / 2, h / 2 + 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // pompom buttons
    circle(ctx, w * 0.36, h * 0.05, 0.035, '#2ec4ff', OUTLINE, 0.012);
    circle(ctx, w * 0.38, -h * 0.18, 0.035, '#7cfc5a', OUTLINE, 0.012);
  },
  drawHips(ctx, w, h) {
    ctx.fillStyle = '#e01e37';
    ctx.beginPath();
    ctx.arc(0.02, 0, 0.03, 0, Math.PI * 2);
    ctx.fill();
  },
};

const WHEEL_R = 0.33;
const CRANK = 0.12;

export class Bonbon extends Character {
  static id = 'bonbon';
  static displayName = 'Bonbon the Clown';
  static vehicleName = 'Unicycle';
  static blurb = 'Fired from the circus for "excessive whimsy". Has never once fallen off a unicycle. Today might be the day.';
  static ability = 'SPACE — Spring hop';
  static ability2 = 'SHIFT — Honk';
  static stats = { speed: 2, accel: 3, handling: 3, toughness: 3 };
  static toughness = 1.1;
  static voice = { pitch: 1.45, vowel: 'e', formantShift: 1.12 };
  static look = look;
  static portraitColor = '#7b2cbf';

  buildVehicle(x, y) {
    const f = (this.frame = this.makeBody('unicycle', x, y + WHEEL_R, { angularDamping: 0.5 }));
    this.addFixture(f, new Box(0.025, 0.33, new Vec2(0, 0.36)), { density: 60 });
    this.addFixture(f, new Box(0.14, 0.035, new Vec2(0, 0.69)), { density: 40 });
    this.wheel = this.makeWheel('wheel', x, y + WHEEL_R, WHEEL_R, { density: 12, friction: 1.6 });
    this.axleJ = this.axle(f, this.wheel, { brk: 20000 });
    this.hopCd = 0;
    this.honkT = 0;
    this.meter = null;
    this.lastCrank = 0;
  }

  riderSetup() {
    const f = this.frame;
    const W = (lx, ly) => f.getWorldPoint(new Vec2(lx, ly));
    const hub = f.getPosition();
    return {
      seat: W(0, 0.73),
      hipsDir: 92 * DEG,
      chestDir: 92 * DEG,
      headDir: 90 * DEG,
      hands: null,
      armDirs: { N: [-10 * DEG, 20 * DEG], F: [-160 * DEG, -140 * DEG] },
      feet: { N: { x: hub.x + CRANK, y: hub.y }, F: { x: hub.x - CRANK, y: hub.y } },
      seatBreak: 24000,
      seatPlay: 0.06,
    };
  }

  crankPoints() {
    const hub = this.wheel.getPosition();
    const a = this.wheel.getAngle();
    return {
      N: { x: hub.x + Math.cos(a) * CRANK, y: hub.y + Math.sin(a) * CRANK },
      F: { x: hub.x - Math.cos(a) * CRANK, y: hub.y - Math.sin(a) * CRANK },
    };
  }

  riderCtrl() {
    const t = this.time;
    const flail = this.mounted ? 0.5 : 1;
    return {
      waist: 0.0,
      neck: 0.05,
      hands: null,
      armRel: {
        N: [-1.2 + Math.sin(t * 4.2) * 0.45 * flail - this.lean * 0.4, 0.5 + Math.sin(t * 5) * 0.3],
        F: [-3.3 + Math.sin(t * 3.7 + 1) * 0.45 * flail - this.lean * 0.4, 0.6],
      },
      feet: this.mounted && !this.axleJ._gone ? this.crankPoints() : null,
    };
  }

  control(dt, input) {
    const up = input.isDown('up');
    const down = input.isDown('down');
    if (up) Character.drive(this.axleJ, -23, 150);
    else if (down) Character.drive(this.axleJ, 8, 70);
    else Character.drive(this.axleJ, 0, 18);
    this.balance(dt, 1);
  }

  /** Gyroscopic self-balancing — keeps the clown upright unless something big happens. */
  balance(dt, strength) {
    if (this.axleJ._gone) return;
    const f = this.frame;
    const target = -this.lean * 0.42 - (this.forwardTilt || 0);
    const ang = wrapAngle(f.getAngle());
    const err = ang - target;
    if (Math.abs(ang) > 1.25) return; // already toppled: no miracles
    const w = f.getAngularVelocity();
    const tq = clamp(-(2600 * err + 520 * w), -1100, 1100) * strength;
    f.applyTorque(tq * 0.2, true);
    const P = this.rider.parts;
    if (!P.hips.gone) P.hips.body.applyTorque(tq * 0.45, true);
    if (!P.chest.gone && P.chest.attached) P.chest.body.applyTorque(tq * 0.35, true);
  }

  idle(dt) {
    Character.freewheel(this.axleJ, 0.4);
  }

  abilityTick(dt, input) {
    if (this.hopCd > 0) this.hopCd -= dt;
    if (this.honkT > 0) this.honkT -= dt;
    if (!this.canControl) return;
    if (input.gamePressed('primary') && this.hopCd <= 0 && !this.wheel._gone && this.touching(this.wheel)) {
      this.hopCd = 0.55;
      this.noCrash = 0.3;
      for (const b of this.allBodies()) {
        const m = b.getMass();
        b.applyLinearImpulse(new Vec2(0, m * 7.4), b.getWorldCenter(), true);
      }
      this.game.audio.boing(this.wheel.getPosition().x, this.wheel.getPosition().y);
      const p = this.wheel.getPosition();
      this.game.particles.dust(p.x, p.y - WHEEL_R, 0, 0, 6);
    }
    if (input.gamePressed('secondary')) {
      this.honkT = 0.35;
      const h = this.rider.parts.head;
      if (!h.gone) {
        const p = h.body.getPosition();
        this.game.audio.honk(p.x, p.y);
        this.game.particles.ring(p.x + 0.15, p.y, '#ff1e2d', 0.6);
      }
    }
  }

  vehiclePostStep() {
    // pedal clicks
    if (this.axleJ._gone) return;
    const a = this.wheel.getAngle();
    if (Math.abs(a - this.lastCrank) > Math.PI) {
      this.lastCrank = a;
      const p = this.wheel.getPosition();
      this.game.audio.tick(p.x, p.y);
    }
  }

  updateAudio() {}

  drawVehicle(ctx) {
    const f = this.frame;
    this.withBody(ctx, this.wheel, () => {
      drawWheel(ctx, WHEEL_R, { tire: '#202020', rim: '#ffd23f', inner: '#7b2cbf', spokes: 16, tireW: 0.16, spokeColor: '#e8e8e8', hub: '#ff1e2d' });
      // crank arms
      line(ctx, -CRANK, 0, CRANK, 0, OUTLINE, 0.045);
      line(ctx, -CRANK, 0, CRANK, 0, '#ccc', 0.025);
      ctx.fillStyle = '#333';
      ctx.fillRect(CRANK - 0.04, -0.015, 0.08, 0.03);
      ctx.fillRect(-CRANK - 0.04, -0.015, 0.08, 0.03);
    });
    this.withBody(ctx, f, () => {
      // fork
      line(ctx, -0.06, 0.0, -0.035, 0.42, OUTLINE, 0.05);
      line(ctx, 0.06, 0.0, 0.035, 0.42, OUTLINE, 0.05);
      line(ctx, -0.06, 0.0, -0.035, 0.42, '#7b2cbf', 0.03);
      line(ctx, 0.06, 0.0, 0.035, 0.42, '#7b2cbf', 0.03);
      // post
      roundRectPath(ctx, -0.03, 0.4, 0.06, 0.3, 0.02);
      fillStroke(ctx, '#d8d8d8');
      // stars
      ctx.fillStyle = '#ffd23f';
      for (const yy of [0.15, 0.3]) {
        star(ctx, 0, yy, 0.035);
      }
      // seat
      ctx.beginPath();
      ctx.moveTo(-0.17, 0.7);
      ctx.quadraticCurveTo(-0.17, 0.78, -0.05, 0.76);
      ctx.lineTo(0.15, 0.74);
      ctx.quadraticCurveTo(0.2, 0.7, 0.12, 0.66);
      ctx.lineTo(-0.12, 0.66);
      ctx.closePath();
      fillStroke(ctx, '#e01e37');
    });
  }
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
