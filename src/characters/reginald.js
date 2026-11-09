// "Sir Reginald Pumphrey" — a Victorian gentleman on a penny-farthing. Fast on the
// flat, dreadfully top-heavy, and his top hat is only loosely attached.

import { Character, Vec2, Box, Polygon, WeldJoint, clamp } from './character.js';
import { DEG } from '../core/math.js';
import { CAT, MASK } from '../config.js';
import { headBase, nose, eye, brow, mouth, circle, fillStroke, OUTLINE, shade, roundRectPath } from './looks.js';
import { line, drawWheel } from '../render/draw.js';

const look = {
  skin: '#f1c9a5',
  shirt: '#7a5a3a',
  sleeve: '#7a5a3a',
  pants: '#cbb894',
  shoes: '#161616',
  socks: '#e8e2d0',
  belt: null,
  drawHead(ctx, R, expr, rag) {
    headBase(ctx, R, this.skin);
    // grey side hair and mutton chops
    ctx.fillStyle = '#c9c4bb';
    ctx.beginPath();
    ctx.ellipse(-R * 0.55, R * 0.25, R * 0.4, R * 0.45, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(R * 0.05, R * 0.15);
    ctx.quadraticCurveTo(-R * 0.15, -R * 0.4, R * 0.25, -R * 0.75);
    ctx.quadraticCurveTo(R * 0.25, -R * 0.2, R * 0.25, R * 0.1);
    ctx.closePath();
    ctx.fill();
    nose(ctx, R, this.skin, 1.25);
    // rosy nose tip
    circle(ctx, R * 1.0, -R * 0.05, R * 0.1, 'rgba(220,90,90,0.45)', null);
    eye(ctx, R, expr);
    brow(ctx, R, expr, '#e0dbd2', { w: 0.034 });
    mouth(ctx, R, expr, { y: -R * 0.58 });
    // magnificent moustache
    ctx.fillStyle = '#e8e3da';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(R * 0.7, -R * 0.22);
    ctx.quadraticCurveTo(R * 1.25, -R * 0.15, R * 1.35, R * 0.15);
    ctx.quadraticCurveTo(R * 1.15, -R * 0.05, R * 0.9, -R * 0.38);
    ctx.quadraticCurveTo(R * 0.6, -R * 0.45, R * 0.35, -R * 0.25);
    ctx.quadraticCurveTo(R * 0.2, -R * 0.05, R * 0.1, R * 0.1);
    ctx.quadraticCurveTo(R * 0.35, -R * 0.15, R * 0.7, -R * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // monocle
    if (expr !== 'dead' || Math.random() < 2) {
      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = 0.016;
      ctx.beginPath();
      ctx.arc(R * 0.55, R * 0.22, R * 0.27, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,240,255,0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(R * 0.4, R * 0.0);
      ctx.quadraticCurveTo(R * 0.2, -R * 0.8, -R * 0.2, -R * 1.0);
      ctx.lineWidth = 0.008;
      ctx.stroke();
    }
    // when the hat is gone, a lonely bald dome
    if (rag && rag.character && !rag.character.hatOn) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(R * 0.1, R * 0.75, R * 0.25, R * 0.08, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  drawChest(ctx, w, h) {
    // tweed checks
    ctx.strokeStyle = 'rgba(40,25,10,0.35)';
    ctx.lineWidth = 0.008;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 0.05, -h / 2);
      ctx.lineTo(i * 0.05, h / 2);
      ctx.moveTo(-w / 2, i * 0.06);
      ctx.lineTo(w / 2, i * 0.06);
      ctx.stroke();
    }
    // waistcoat & cravat
    ctx.fillStyle = '#5b1f2a';
    ctx.fillRect(w * 0.18, -h / 2, w * 0.32, h * 0.85);
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.48);
    ctx.lineTo(w * 0.5, h * 0.48);
    ctx.lineTo(w * 0.52, h * 0.2);
    ctx.lineTo(w * 0.35, h * 0.28);
    ctx.closePath();
    ctx.fill();
    // pocket watch chain
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    ctx.moveTo(w * 0.45, -h * 0.1);
    ctx.quadraticCurveTo(w * 0.2, -h * 0.25, w * 0.05, -h * 0.12);
    ctx.stroke();
  },
};

const FR = 0.62;
const RR = 0.17;
const CRANK = 0.13;

function drawTopHat(ctx) {
  // local frame: origin at hat centre, y up
  roundRectPath(ctx, -0.2, -0.06, 0.4, 0.05, 0.02);
  fillStroke(ctx, '#151515');
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.03);
  ctx.lineTo(-0.15, 0.25);
  ctx.lineTo(0.15, 0.25);
  ctx.lineTo(0.13, -0.03);
  ctx.closePath();
  fillStroke(ctx, '#1d1d1d');
  ctx.fillStyle = '#5b1f2a';
  ctx.fillRect(-0.135, 0.0, 0.27, 0.05);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0.05, 0.06, 0.04, 0.17);
}

export class Reginald extends Character {
  static id = 'reginald';
  static displayName = 'Sir Reginald Pumphrey';
  static vehicleName = 'Penny-Farthing';
  static blurb = 'Third Baronet of Lower Snodsbury. Refuses to acknowledge any invention after 1885, including brakes that work.';
  static ability = 'SPACE — Gentleman’s vault';
  static ability2 = 'SHIFT — Stiff upper lip (brace)';
  static stats = { speed: 4, accel: 3, handling: 1, toughness: 2 };
  static toughness = 0.92;
  static voice = { pitch: 0.82, vowel: 'o', formantShift: 0.92 };
  static look = look;
  static portraitColor = '#5b1f2a';

  buildVehicle(x, y) {
    const f = (this.frame = this.makeBody('frame', x, y + 0.9, { angularDamping: 0.25 }));
    // backbone (chord of the curved tube) and fork
    const bx0 = 0.08;
    const by0 = 0.45;
    const bx1 = -0.85;
    const by1 = -0.73;
    const len = Math.hypot(bx1 - bx0, by1 - by0);
    const ang = Math.atan2(by1 - by0, bx1 - bx0);
    this.addFixture(f, new Box(len / 2, 0.03, new Vec2((bx0 + bx1) / 2, (by0 + by1) / 2), ang), { density: 90 });
    this.addFixture(f, new Box(0.03, 0.4, new Vec2(0.12, 0.08), 0.1), { density: 90 });
    this.front = this.makeWheel('front', x + 0.15, y + FR, FR, { density: 7, friction: 1.4 });
    this.rear = this.makeWheel('rear', x - 0.85, y + RR, RR, { density: 18, friction: 1.0 });
    this.frontJ = this.axle(f, this.front, { brk: 26000 });
    this.rearJ = this.axle(f, this.rear, { brk: 14000 });
    this.vaultCd = 0;
    this.braceCd = 0;
    this.hatOn = true;
    this.meter = { label: 'BRACE', value: 1, color: '#d4a017' };
    this.lastCrank = 0;
  }

  riderSetup() {
    const f = this.frame;
    const W = (lx, ly) => f.getWorldPoint(new Vec2(lx, ly));
    const hub = this.front.getPosition();
    return {
      seat: W(0.02, 0.41),
      hipsDir: 86 * DEG,
      chestDir: 80 * DEG,
      headDir: 88 * DEG,
      hands: { N: { body: f, ...xy(W(0.33, 0.52)) }, F: { body: f, ...xy(W(0.31, 0.52)) } },
      feet: { N: { x: hub.x + CRANK, y: hub.y }, F: { x: hub.x - CRANK, y: hub.y } },
      seatBreak: 21000,
      gripBreak: 8500,
      seatPlay: 0.2,
    };
  }

  attachRider(setup) {
    super.attachRider(setup);
    // top hat: separate body, loosely welded to the head
    const head = this.rider.parts.head.body;
    const hp = head.getWorldPoint(new Vec2(0.17, 0.0));
    const hat = (this.hat = this.phys.body({ type: 'dynamic', position: hp, angle: head.getAngle() - Math.PI / 2 }, { kind: 'vehicle', character: this, name: 'hat', material: 'cloth' }));
    hat.createFixture(new Box(0.15, 0.13, new Vec2(0, 0.1)), {
      density: 2,
      friction: 0.6,
      filterCategoryBits: CAT.VEHICLE,
      filterMaskBits: CAT.TERRAIN | CAT.OBJECT,
      filterGroupIndex: this.group,
    });
    this.hatJoint = this.phys.createJoint(new WeldJoint({}, head, hat, hp));
    this.bodies.push(hat);
  }

  crankPoints() {
    const hub = this.front.getPosition();
    const a = this.front.getAngle();
    return {
      N: { x: hub.x + Math.cos(a) * CRANK, y: hub.y + Math.sin(a) * CRANK },
      F: { x: hub.x - Math.cos(a) * CRANK, y: hub.y - Math.sin(a) * CRANK },
    };
  }

  riderCtrl() {
    return {
      waist: -0.12,
      neck: 0.12,
      hands: { N: this.gripWorld('N'), F: this.gripWorld('F') },
      feet: this.mounted && !this.frontJ._gone ? this.crankPoints() : null,
    };
  }

  control(dt, input) {
    const up = input.isDown('up');
    const down = input.isDown('down');
    if (up) Character.drive(this.frontJ, -22, 200);
    else if (down) {
      const w = this.front.getAngularVelocity();
      if (w < -2) Character.drive(this.frontJ, 0, 210);
      else Character.drive(this.frontJ, 7, 90);
    } else Character.freewheel(this.frontJ, 1.2);
    Character.freewheel(this.rearJ, 0.05);
    this.applyLean(dt, 330);
  }

  idle() {
    Character.freewheel(this.frontJ, 0.8);
    Character.freewheel(this.rearJ, 0.05);
  }

  abilityTick(dt, input) {
    if (this.vaultCd > 0) this.vaultCd -= dt;
    if (this.braceCd > 0) this.braceCd -= dt;
    this.meter.value = this.rider.braceTimer > 0 ? 1 : clamp(1 - this.braceCd / 8, 0, 1);
    this.meter.color = this.rider.braceTimer > 0 ? '#ffe680' : '#d4a017';
    if (!this.canControl) return;
    if (input.gamePressed('primary') && this.vaultCd <= 0 && !this.front._gone && (this.touching(this.front) || this.touching(this.rear))) {
      this.vaultCd = 0.8;
      this.noCrash = 0.3;
      for (const b of this.allBodies()) {
        const m = b.getMass();
        b.applyLinearImpulse(new Vec2(m * 1.6, m * 6.4), b.getWorldCenter(), true);
      }
      const p = this.front.getPosition();
      this.game.audio.whoosh(p.x, p.y, 1);
      this.game.particles.dust(p.x, p.y - FR, 0, 0, 6);
    }
    if (input.gamePressed('secondary') && this.braceCd <= 0) {
      this.braceCd = 8;
      this.rider.brace(2.6);
      const h = this.rider.parts.head;
      if (!h.gone) {
        const p = h.body.getPosition();
        this.game.particles.ring(p.x, p.y, '#ffe680', 0.9);
        this.game.audio.grunt(this.rider.voice, p.x, p.y);
      }
    }
  }

  vehiclePostStep() {
    // the hat flies off on any decent jolt
    if (this.hatOn) {
      if (this.hatJoint._gone || this.rider.parts.head.gone) {
        this.hatOn = false;
      } else {
        const fr = this.hatJoint.getReactionForce(this.phys.invDt);
        if (Math.hypot(fr.x, fr.y) > 260 || !this.rider.parts.head.attached) {
          this.phys.destroyJoint(this.hatJoint);
          this.hatOn = false;
          this.hat.applyAngularImpulse(0.02, true);
        }
      }
    }
    if (this.frontJ._gone) return;
    const a = this.front.getAngle();
    if (Math.abs(a - this.lastCrank) > 1.6) {
      this.lastCrank = a;
      const p = this.front.getPosition();
      this.game.audio.tick(p.x, p.y);
    }
  }

  drawVehicle(ctx) {
    const f = this.frame;
    const ws = { tire: '#1a1a1a', rim: '#2a2a2a', inner: 'rgba(0,0,0,0)', spokes: 28, tireW: 0.06, spokeColor: '#8b8b8b', hub: '#c9a227' };
    this.withBody(ctx, this.rear, () => drawWheel(ctx, RR, { ...ws, spokes: 10, tireW: 0.2 }));
    const rl = f.getLocalPoint(this.rear.getPosition());
    const fl = f.getLocalPoint(this.front.getPosition());
    this.withBody(ctx, f, () => {
      // curved backbone
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0.08, 0.5);
      ctx.quadraticCurveTo(-0.75, 0.45, rl.x, rl.y);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.08;
      ctx.stroke();
      ctx.strokeStyle = '#1e1e1e';
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.012;
      ctx.stroke();
      // saddle
      ctx.beginPath();
      ctx.moveTo(-0.14, 0.43);
      ctx.quadraticCurveTo(0.02, 0.5, 0.16, 0.44);
      ctx.lineTo(0.12, 0.39);
      ctx.lineTo(-0.1, 0.39);
      ctx.closePath();
      fillStroke(ctx, '#5a3518');
    });
    // big wheel drawn after the frame so the fork sits on top of it
    this.withBody(ctx, this.front, () => {
      drawWheel(ctx, FR, ws);
      line(ctx, -CRANK, 0, CRANK, 0, '#c9a227', 0.03);
    });
    this.withBody(ctx, f, () => {
      line(ctx, 0.08, 0.5, fl.x, fl.y, OUTLINE, 0.07);
      line(ctx, 0.08, 0.5, fl.x, fl.y, '#2a2a2a', 0.04);
      // moustache handlebar
      ctx.beginPath();
      ctx.moveTo(0.08, 0.52);
      ctx.quadraticCurveTo(0.25, 0.58, 0.34, 0.5);
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 0.035;
      ctx.stroke();
      circle(ctx, 0.34, 0.5, 0.03, '#e8dcc0');
    });
  }

  drawVehicleFront(ctx) {
    if (this.hat && !this.hat._gone) this.withBody(ctx, this.hat, () => drawTopHat(ctx));
  }
}

function xy(v) {
  return { x: v.x, y: v.y };
}
