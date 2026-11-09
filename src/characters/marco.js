// "Marco Mayhem" — a washed-up stuntman on a dirt bike. Fast, grippy, nitro boost.

import { Character, Vec2, Box, Polygon, clamp } from './character.js';
import { DEG } from '../core/math.js';
import { headBase, nose, eye, brow, mouth, circle, fillStroke, OUTLINE, shade, roundRectPath } from './looks.js';
import { drawWheel, polyPath, line, worldText } from '../render/draw.js';

const look = {
  skin: '#e2a77c',
  shirt: '#202226',
  sleeve: '#202226',
  armStripe: '#d6262b',
  pants: '#30343c',
  shoes: '#111',
  socks: '#d6262b',
  gloves: '#d6262b',
  belt: '#111',
  shoeLen: 1.15,
  drawHead(ctx, R, expr) {
    headBase(ctx, R, this.skin);
    nose(ctx, R, this.skin);
    eye(ctx, R, expr, { y: R * 0.1 });
    brow(ctx, R, expr, '#2a1b10', { y: R * 0.1 });
    // stubble
    ctx.fillStyle = 'rgba(60,40,30,0.35)';
    ctx.beginPath();
    ctx.ellipse(R * 0.45, -R * 0.55, R * 0.45, R * 0.28, 0.2, 0, Math.PI * 2);
    ctx.fill();
    mouth(ctx, R, expr, { y: -R * 0.5 });
    // helmet shell (open-face motocross)
    ctx.beginPath();
    ctx.moveTo(R * 0.55, R * 0.42);
    ctx.quadraticCurveTo(R * 0.2, R * 1.32, -R * 0.75, R * 0.9);
    ctx.quadraticCurveTo(-R * 1.3, R * 0.1, -R * 0.85, -R * 0.75);
    ctx.quadraticCurveTo(-R * 0.3, -R * 1.15, R * 0.05, -R * 0.85);
    ctx.lineTo(R * 0.05, -R * 0.25);
    ctx.quadraticCurveTo(-R * 0.15, R * 0.35, R * 0.55, R * 0.42);
    ctx.closePath();
    fillStroke(ctx, '#f2f2f2');
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#d6262b';
    ctx.fillRect(-R * 1.4, R * 0.3, R * 2.4, R * 0.28);
    ctx.fillRect(-R * 0.55, -R * 1.2, R * 0.22, R * 2.6);
    ctx.restore();
    // chin guard
    ctx.beginPath();
    ctx.moveTo(R * 0.05, -R * 0.55);
    ctx.quadraticCurveTo(R * 0.6, -R * 0.75, R * 1.12, -R * 0.62);
    ctx.lineTo(R * 1.15, -R * 0.85);
    ctx.quadraticCurveTo(R * 0.5, -R * 1.15, -R * 0.2, -R * 0.95);
    ctx.closePath();
    fillStroke(ctx, '#d6262b');
    // visor peak
    ctx.beginPath();
    ctx.moveTo(R * 0.3, R * 0.62);
    ctx.lineTo(R * 1.35, R * 0.55);
    ctx.lineTo(R * 1.2, R * 0.38);
    ctx.lineTo(R * 0.4, R * 0.42);
    ctx.closePath();
    fillStroke(ctx, '#202226');
    // goggles strap + lens
    roundRectPath(ctx, R * 0.25, R * 0.0, R * 0.62, R * 0.36, R * 0.12);
    fillStroke(ctx, expr === 'dead' ? 'rgba(80,60,40,0.35)' : 'rgba(255,190,60,0.35)', '#111', 0.025);
  },
  drawChest(ctx, w, h) {
    // racing jacket: red side panel + number
    ctx.fillStyle = '#d6262b';
    ctx.fillRect(-w * 0.15, -h / 2, w * 0.22, h);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-w * 0.15 + w * 0.22, -h / 2, w * 0.05, h);
  },
};

export class Marco extends Character {
  static id = 'marco';
  static displayName = 'Marco Mayhem';
  static vehicleName = 'Dirt Bike';
  static blurb = 'Ex-stuntman. Banned from three circuses and one country. Still thinks he can land it.';
  static ability = 'SPACE — Nitro boost';
  static ability2 = '';
  static stats = { speed: 5, accel: 5, handling: 4, toughness: 4 };
  static toughness = 1.12;
  static headArmor = 1.6;
  static voice = { pitch: 0.92, vowel: 'a', formantShift: 0.95 };
  static look = look;
  static portraitColor = '#d6262b';

  buildVehicle(x, y) {
    const R = 0.36;
    const f = (this.frame = this.makeBody('frame', x, y + 0.8, { angularDamping: 0.3 }));
    this.addFixture(
      f,
      new Polygon([new Vec2(-0.62, -0.18), new Vec2(0.05, -0.34), new Vec2(0.48, -0.15), new Vec2(0.62, 0.22), new Vec2(0.3, 0.32), new Vec2(-0.55, 0.12)]),
      { density: 60, friction: 0.4 }
    );
    this.rear = this.makeWheel('rear', x - 0.64, y + R, R, { density: 16, friction: 1.6 });
    this.front = this.makeWheel('front', x + 0.7, y + R, R, { density: 16, friction: 1.4 });
    this.rearJ = this.springJoint(f, this.rear, [0, 1], 26000, 2100);
    this.frontJ = this.springJoint(f, this.front, [-0.32, 1], 22000, 1900);
    this.nitro = 1;
    this.boosting = false;
    this.meter = { label: 'NITRO', value: 1, color: '#33c4ff' };
  }

  riderSetup() {
    const f = this.frame;
    const W = (lx, ly) => f.getWorldPoint(new Vec2(lx, ly));
    const seat = W(-0.2, 0.25);
    return {
      seat,
      hipsDir: 82 * DEG,
      chestDir: 62 * DEG,
      headDir: 78 * DEG,
      hands: { N: { body: f, ...xy(W(0.47, 0.6)) }, F: { body: f, ...xy(W(0.45, 0.6)) } },
      feet: { N: xy(W(-0.08, -0.16)), F: xy(W(-0.05, -0.16)) },
      seatBreak: 22000,
      gripBreak: 9500,
      seatPlay: 0.25,
    };
  }

  riderCtrl() {
    const f = this.frame;
    const peg = f.getWorldPoint(new Vec2(-0.06, -0.17));
    return {
      waist: -0.25,
      neck: 0.25,
      hands: { N: this.gripWorld('N'), F: this.gripWorld('F') },
      feet: this.mounted ? { N: peg, F: peg } : null,
    };
  }

  control(dt, input) {
    const up = input.isDown('up');
    const down = input.isDown('down');
    const v = this.frame.getLinearVelocity();
    const fwd = this.frame.getWorldVector(new Vec2(1, 0));
    const along = v.x * fwd.x + v.y * fwd.y;
    if (up) {
      // traction control: back off the throttle when the front wheel climbs too high
      const ang = this.frameAngle();
      const tc = this.lean < 0 ? 1 : ang > 0.75 ? 0.25 : ang > 0.45 ? 0.6 : 1;
      Character.drive(this.rearJ, -72, 195 * tc);
      Character.freewheel(this.frontJ, 0.5);
    } else if (down) {
      if (along > 1.2) {
        Character.drive(this.rearJ, 0, 260);
        Character.drive(this.frontJ, 0, 200);
      } else {
        Character.drive(this.rearJ, 22, 150);
        Character.freewheel(this.frontJ, 0.5);
      }
    } else {
      Character.freewheel(this.rearJ, 2);
      Character.freewheel(this.frontJ, 0.5);
    }
    this.applyLean(dt, 420);
    this.throttle = up ? 1 : 0;
  }

  idle() {
    Character.freewheel(this.rearJ, 1.5);
    Character.freewheel(this.frontJ, 0.5);
    this.throttle = 0;
  }

  abilityTick(dt, input) {
    const want = this.canControl && input.isDown('primary') && this.nitro > 0.02;
    this.boosting = want;
    if (want) {
      this.nitro = Math.max(0, this.nitro - dt * 0.38);
      const fwd = this.frame.getWorldVector(new Vec2(1, 0));
      this.frame.applyForceToCenter(new Vec2(fwd.x * 1100, fwd.y * 1100), true);
      if (Math.random() < 0.7) {
        const ex = this.frame.getWorldPoint(new Vec2(-0.72, 0.05));
        const v = this.frame.getLinearVelocity();
        this.game.particles.fire(ex.x, ex.y, 2, 0.16, -fwd.x * 6 + v.x * 0.5, -fwd.y * 6 + v.y * 0.5);
      }
    } else {
      this.nitro = Math.min(1, this.nitro + dt * 0.11);
    }
    this.meter.value = this.nitro;
  }

  updateAudio() {
    const a = this.game.audio;
    const p = this.frame.getPosition();
    const s = a.spatial(p.x, p.y);
    const eng = a.loop('engine' + this.uid, 'engine');
    if (eng) {
      const w = this.rearJ._gone ? 0 : Math.abs(this.rear.getAngularVelocity());
      eng.set({ rpm: clamp(w / 70, 0, 1.2), throttle: this.canControl ? this.throttle || 0 : 0, gain: s * (this.dead ? 0.35 : 1) });
    }
    const roar = a.loop('nitro' + this.uid, 'roar');
    if (roar) roar.set({ gain: this.boosting ? s * 0.8 : 0 });
  }

  stopAudio() {
    this.game.audio.stopLoop('engine' + this.uid);
    this.game.audio.stopLoop('nitro' + this.uid);
  }

  drawVehicle(ctx) {
    const f = this.frame;
    const wheelStyle = { tire: '#1c1c1c', rim: '#d9d9d9', inner: '#2e2e2e', spokes: 12, tireW: 0.28, spokeColor: '#bdbdbd', hub: '#ff7a00', knobby: true };
    for (const w of [this.rear, this.front]) {
      this.withBody(ctx, w, () => drawWheel(ctx, w.wheelRadius, wheelStyle));
    }
    const rl = f.getLocalPoint(this.rear.getPosition());
    const fl = f.getLocalPoint(this.front.getPosition());
    this.withBody(ctx, f, () => {
      // swingarm
      ctx.lineCap = 'round';
      line(ctx, -0.08, -0.22, rl.x, rl.y, OUTLINE, 0.1);
      line(ctx, -0.08, -0.22, rl.x, rl.y, '#9a9a9a', 0.06);
      // shock
      line(ctx, -0.25, 0.1, rl.x * 0.55, rl.y * 0.6, '#ffcc00', 0.05);
      // fork
      if (!this.frontJ._gone) {
        line(ctx, 0.52, 0.42, fl.x, fl.y, OUTLINE, 0.09);
        line(ctx, 0.52, 0.42, fl.x, fl.y, '#d0d0d0', 0.055);
        line(ctx, 0.5, 0.36, (0.5 + fl.x) / 2, (0.36 + fl.y) / 2, '#ff7a00', 0.065);
      }
      // engine
      roundRectPath(ctx, -0.25, -0.38, 0.5, 0.36, 0.06);
      fillStroke(ctx, '#55585e');
      ctx.fillStyle = '#3e4146';
      for (let i = 0; i < 4; i++) ctx.fillRect(-0.2 + i * 0.11, -0.3, 0.06, 0.22);
      // exhaust
      ctx.beginPath();
      ctx.moveTo(0.15, -0.2);
      ctx.quadraticCurveTo(-0.1, 0.05, -0.55, 0.12);
      ctx.lineTo(-0.76, 0.14);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.09;
      ctx.stroke();
      ctx.strokeStyle = '#c8c8c8';
      ctx.lineWidth = 0.055;
      ctx.stroke();
      // rear fender + side panel
      polyPath(ctx, [[-0.95, 0.24], [-0.45, 0.16], [-0.05, 0.12], [-0.05, 0.25], [-0.5, 0.3]]);
      fillStroke(ctx, '#ff7a00');
      // tank / shroud
      polyPath(ctx, [[-0.08, 0.12], [0.35, 0.14], [0.6, 0.34], [0.42, 0.42], [0.05, 0.36]]);
      fillStroke(ctx, '#ff7a00');
      worldText(ctx, '27', 0.25, 0.26, 0.17, '#111', 'center', 'Bangers, Impact, sans-serif');
      // seat
      roundRectPath(ctx, -0.62, 0.24, 0.7, 0.09, 0.04);
      fillStroke(ctx, '#1a1a1a');
      // front fender & number plate
      polyPath(ctx, [[0.62, 0.38], [0.95, 0.3], [0.98, 0.24], [0.66, 0.3]]);
      fillStroke(ctx, '#f2f2f2');
      // handlebar
      line(ctx, 0.5, 0.42, 0.46, 0.6, OUTLINE, 0.05);
      line(ctx, 0.36, 0.58, 0.52, 0.62, '#222', 0.05);
    });
  }
}

function xy(v) {
  return { x: v.x, y: v.y };
}
