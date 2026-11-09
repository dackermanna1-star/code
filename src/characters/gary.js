// "Gary from Accounting" — rolls out of the office on a swivel chair with a fire
// extinguisher strapped to the back. Slow scoot, but the extinguisher is a rocket.

import { Character, Vec2, Box, clamp } from './character.js';
import { DEG } from '../core/math.js';
import { headBase, nose, eye, brow, mouth, circle, fillStroke, OUTLINE, shade, roundRectPath, buttons } from './looks.js';
import { polyPath, line, drawWheel, worldText } from '../render/draw.js';

const look = {
  skin: '#f0c4a0',
  shirt: '#f4f6f8',
  sleeve: '#f4f6f8',
  pants: '#5d6470',
  shoes: '#5a3a22',
  belt: '#2b2016',
  socks: '#2f3b55',
  drawHead(ctx, R, expr) {
    headBase(ctx, R, this.skin);
    // fringe of hair around the back
    ctx.beginPath();
    ctx.arc(-R * 0.05, R * 0.02, R * 1.02, Math.PI * 0.62, Math.PI * 1.22);
    ctx.strokeStyle = '#6b4a2e';
    ctx.lineWidth = R * 0.32;
    ctx.stroke();
    // heroic comb-over
    ctx.strokeStyle = '#6b4a2e';
    ctx.lineWidth = 0.014;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.7, R * 0.55 + i * R * 0.08);
      ctx.quadraticCurveTo(0, R * (1.05 + i * 0.02), R * 0.55, R * 0.72 - i * R * 0.05);
      ctx.stroke();
    }
    nose(ctx, R, this.skin, 1.15);
    eye(ctx, R, expr, { size: 0.9 });
    brow(ctx, R, expr, '#6b4a2e');
    // glasses
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.018;
    roundRectPath(ctx, R * 0.22, R * 0.02, R * 0.56, R * 0.42, R * 0.1);
    ctx.fillStyle = 'rgba(200,230,255,0.25)';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.22, R * 0.25);
    ctx.lineTo(-R * 0.25, R * 0.2);
    ctx.stroke();
    // moustache
    ctx.beginPath();
    ctx.ellipse(R * 0.72, -R * 0.3, R * 0.24, R * 0.1, -0.2, 0, Math.PI * 2);
    fillStroke(ctx, '#6b4a2e', OUTLINE, 0.012);
    mouth(ctx, R, expr, { y: -R * 0.52 });
  },
  drawChest(ctx, w, h) {
    // tie
    ctx.fillStyle = '#c0262d';
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.42);
    ctx.lineTo(w * 0.46, h * 0.42);
    ctx.lineTo(w * 0.5, -h * 0.18);
    ctx.lineTo(w * 0.41, -h * 0.28);
    ctx.lineTo(w * 0.33, -h * 0.18);
    ctx.closePath();
    ctx.fill();
    // pocket with pens
    ctx.strokeStyle = '#b8c0c8';
    ctx.lineWidth = 0.012;
    ctx.strokeRect(-w * 0.05, h * 0.02, w * 0.28, h * 0.18);
    ctx.fillStyle = '#2255cc';
    ctx.fillRect(0, h * 0.18, 0.012, 0.06);
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(0.025, h * 0.18, 0.012, 0.05);
    // sweat patch
    ctx.fillStyle = 'rgba(160,190,210,0.35)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.1, h * 0.32, w * 0.2, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  },
};

const THRUST = 1500;

export class Gary extends Character {
  static id = 'gary';
  static displayName = 'Gary from Accounting';
  static vehicleName = 'Turbo Office Chair';
  static blurb = 'Twenty-two years without a sick day. Today he takes the scenic route home, at Mach 0.04.';
  static ability = 'SPACE (hold) — Extinguisher rocket';
  static ability2 = '';
  static stats = { speed: 3, accel: 2, handling: 2, toughness: 2 };
  static toughness = 0.95;
  static voice = { pitch: 1.05, vowel: 'aw', formantShift: 1.0 };
  static look = look;
  static portraitColor = '#5d6470';

  buildVehicle(x, y) {
    const f = (this.frame = this.makeBody('chair', x, y + 0.5, { angularDamping: 0.4 }));
    const fx = (hx, hy, cx, cy, a = 0, d = 18) => this.addFixture(f, new Box(hx, hy, new Vec2(cx, cy), a), { density: d, friction: 0.5 });
    fx(0.38, 0.025, 0, -0.33, 0, 34); // star base
    fx(0.03, 0.16, 0, -0.15, 0, 30); // gas lift
    fx(0.27, 0.06, 0.0, 0.07, 0, 14); // seat
    fx(0.05, 0.3, -0.3, 0.43, 0.12, 10); // backrest
    fx(0.07, 0.2, -0.42, 0.28, 0, 22); // extinguisher
    this.casters = [];
    this.axles = [];
    for (const dx of [-0.36, 0.36]) {
      const c = this.makeWheel('caster', x + dx, y + 0.08, 0.08, { density: 40, friction: 0.9, angularDamping: 0.02 });
      this.casters.push(c);
      this.axles.push(this.axle(f, c, { brk: 9000 }));
    }
    this.fuel = 1;
    this.firing = false;
    this.meter = { label: 'FOAM', value: 1, color: '#ff4e4e' };
    this.kick = 0;
  }

  riderSetup() {
    const f = this.frame;
    const W = (lx, ly) => f.getWorldPoint(new Vec2(lx, ly));
    return {
      seat: W(0.0, 0.16),
      hipsDir: 92 * DEG,
      chestDir: 86 * DEG,
      headDir: 88 * DEG,
      hands: { N: { body: f, ...xy(W(0.2, 0.34)) }, F: { body: f, ...xy(W(0.18, 0.34)) } },
      feet: { N: xy(W(0.44, -0.2)), F: xy(W(0.4, -0.2)) },
      seatBreak: 16000,
      gripBreak: 6500,
      seatPlay: 0.3,
    };
  }

  riderCtrl() {
    const f = this.frame;
    let fN;
    let fF;
    if (this.scooting) {
      const t = this.time * 9;
      fN = f.getWorldPoint(new Vec2(0.36 + Math.cos(t) * 0.16, -0.22 + Math.max(0, Math.sin(t)) * 0.1));
      fF = f.getWorldPoint(new Vec2(0.36 + Math.cos(t + Math.PI) * 0.16, -0.22 + Math.max(0, Math.sin(t + Math.PI)) * 0.1));
    } else {
      fN = f.getWorldPoint(new Vec2(0.44, -0.2));
      fF = f.getWorldPoint(new Vec2(0.4, -0.2));
    }
    return {
      waist: this.firing ? 0.15 : -0.05,
      neck: -0.1,
      hands: { N: this.gripWorld('N'), F: this.gripWorld('F') },
      feet: this.mounted ? { N: fN, F: fF } : null,
    };
  }

  control(dt, input) {
    const up = input.isDown('up');
    const down = input.isDown('down');
    this.scooting = up;
    for (const a of this.axles) {
      if (up) Character.drive(a, -50, 11);
      else if (down) Character.drive(a, 0, 30);
      else Character.freewheel(a, 0.25);
    }
    this.applyLean(dt, 190);
  }

  idle() {
    this.scooting = false;
    for (const a of this.axles) Character.freewheel(a, 0.2);
  }

  abilityTick(dt, input) {
    const want = this.canControl && input.isDown('primary') && this.fuel > 0.01;
    this.firing = want;
    if (want) {
      this.fuel = Math.max(0, this.fuel - dt * 0.42);
      const fwd = this.frame.getWorldVector(new Vec2(1, 0));
      const at = this.frame.getWorldPoint(new Vec2(0, 0.42));
      this.frame.applyForce(new Vec2(fwd.x * THRUST, fwd.y * THRUST), at, true);
      const nz = this.frame.getWorldPoint(new Vec2(-0.52, 0.1));
      const dir = Math.atan2(-fwd.y, -fwd.x) - 0.25;
      const v = this.frame.getLinearVelocity();
      this.game.particles.spray(nz.x, nz.y, dir, 3, 9, '#f4f7fa', 0.07, 0.4);
      if (Math.random() < 0.3) this.game.particles.spray(nz.x + v.x * 0.02, nz.y, dir, 1, 6, '#dfe8ef', 0.12, 0.6);
    } else {
      this.fuel = Math.min(1, this.fuel + dt * 0.13);
    }
    this.meter.value = this.fuel;
  }

  updateAudio() {
    const a = this.game.audio;
    const p = this.frame.getPosition();
    const s = a.spatial(p.x, p.y);
    const h = a.loop('hiss' + this.uid, 'hiss');
    if (h) h.set({ gain: this.firing ? s : 0 });
    const r = a.loop('rumble' + this.uid, 'rumble');
    if (r) {
      const w = this.casters[0]._gone ? 0 : Math.abs(this.casters[0].getAngularVelocity());
      const touching = !this.casters[0]._gone && this.touching(this.casters[0]);
      r.set({ gain: touching ? clamp(w / 120, 0, 0.6) * s : 0, f: 200 + w * 4 });
    }
  }

  stopAudio() {
    this.game.audio.stopLoop('hiss' + this.uid);
    this.game.audio.stopLoop('rumble' + this.uid);
  }

  drawVehicle(ctx) {
    const f = this.frame;
    for (const c of this.casters) {
      this.withBody(ctx, c, () => drawWheel(ctx, 0.08, { tire: '#222', rim: '#555', inner: '#444', spokes: 3, tireW: 0.35, hub: '#999' }));
    }
    this.withBody(ctx, f, () => {
      // star base legs
      ctx.lineCap = 'round';
      line(ctx, -0.32, -0.36, 0.32, -0.36, OUTLINE, 0.075);
      line(ctx, -0.32, -0.36, 0.32, -0.36, '#c9cdd2', 0.045);
      line(ctx, -0.12, -0.33, 0.12, -0.33, '#9aa0a6', 0.06);
      // caster forks
      line(ctx, -0.3, -0.36, -0.3, -0.42, '#666', 0.04);
      line(ctx, 0.3, -0.36, 0.3, -0.42, '#666', 0.04);
      // gas lift
      roundRectPath(ctx, -0.035, -0.33, 0.07, 0.36, 0.02);
      fillStroke(ctx, '#2a2a2a');
      roundRectPath(ctx, -0.05, -0.33, 0.1, 0.12, 0.02);
      fillStroke(ctx, '#3a3a3a');
      // extinguisher
      roundRectPath(ctx, -0.5, 0.06, 0.15, 0.44, 0.07);
      fillStroke(ctx, '#d42020');
      ctx.fillStyle = '#fff';
      ctx.fillRect(-0.48, 0.2, 0.11, 0.12);
      worldText(ctx, 'CO2', -0.425, 0.26, 0.06, '#d42020');
      roundRectPath(ctx, -0.46, 0.48, 0.07, 0.07, 0.01);
      fillStroke(ctx, '#222');
      ctx.beginPath();
      ctx.moveTo(-0.43, 0.54);
      ctx.quadraticCurveTo(-0.6, 0.5, -0.56, 0.1);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 0.03;
      ctx.stroke();
      polyPath(ctx, [[-0.6, 0.12], [-0.52, 0.12], [-0.54, 0.04], [-0.62, 0.05]]);
      fillStroke(ctx, '#111');
      // straps
      ctx.fillStyle = '#333';
      ctx.fillRect(-0.52, 0.14, 0.24, 0.03);
      ctx.fillRect(-0.52, 0.38, 0.24, 0.03);
      // backrest
      ctx.save();
      ctx.translate(-0.3, 0.43);
      ctx.rotate(0.12);
      roundRectPath(ctx, -0.07, -0.33, 0.13, 0.68, 0.06);
      fillStroke(ctx, '#2b2f36');
      ctx.restore();
      // seat cushion
      roundRectPath(ctx, -0.3, 0.0, 0.6, 0.14, 0.06);
      fillStroke(ctx, '#2b2f36');
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(-0.25, 0.08, 0.5, 0.03);
      // armrest
      line(ctx, 0.0, 0.12, 0.05, 0.3, '#222', 0.04);
      roundRectPath(ctx, -0.1, 0.28, 0.32, 0.05, 0.02);
      fillStroke(ctx, '#222');
    });
  }
}

function xy(v) {
  return { x: v.x, y: v.y };
}
