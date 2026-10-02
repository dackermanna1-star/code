// The phone: a chunky late-90s handset you pull up with the up arrow. Its little green screen
// shows the level you are on, which way the nearest level door is, how far, and whether it is on
// another floor. It also lights the space around you a little.
import { drawText, drawTextCentered, textWidth } from '../gfx/font.js';
import { LEVELS, levelOfDim, levelNumbers } from '../world/levels.js';

const BODY = '#2b2d30', BODY_HI = '#45484c', BODY_LO = '#17181a';
const LCD = '#8fa868', LCD_DARK = '#2c3a1c', LCD_MID = '#5f7444';
const PW = 92, PH = 132;       // handset size in screen pixels (320x240 screen)

export class Phone {
  constructor(game) {
    this.game = game;
    this.up = false;
    this.k = 0;          // 0 = put away, 1 = held up
    this.t = 0;
    this.marquee = 0;
  }

  toggle() {
    this.up = !this.up;
    this.game.audioCall('ui', this.up ? 'phone_up' : 'phone_down');
  }

  update(dt) {
    this.t += dt;
    const target = this.up ? 1 : 0;
    this.k += (target - this.k) * Math.min(1, dt * 9);
    if (Math.abs(this.k - target) < 0.002) this.k = target;
  }

  // light the phone's screen throws on its surroundings (for the renderer)
  light() {
    if (this.k < 0.05) return null;
    const L = LEVELS[levelOfDim(this.game.player.dim)];
    const def = (L && L.light) || {};
    const rad = def.phoneRadius ?? 3.6, int = (def.phoneIntensity ?? 0.22) * this.k;
    return { rad, int, color: def.phoneColor || [0.75, 1.0, 0.7] };
  }

  draw(c, W, H, dt) {
    this.update(dt);
    if (this.k <= 0.001) return;
    const g = this.game;
    const x = Math.round(W - PW - 18 + (1 - this.k) * 8), y = Math.round(H - PH * this.k * 0.92 + 4);
    // a slight hand tremble
    const tx = Math.round(Math.sin(this.t * 1.7) * 0.6), ty = Math.round(Math.sin(this.t * 2.3 + 1) * 0.6);
    const X = x + tx, Y = y + ty;
    // body
    c.fillStyle = BODY_LO; c.fillRect(X - 1, Y - 1, PW + 2, PH + 2);
    c.fillStyle = BODY; c.fillRect(X, Y, PW, PH);
    c.fillStyle = BODY_HI; c.fillRect(X + 2, Y + 2, PW - 4, 1); c.fillRect(X + 2, Y + 2, 1, PH - 4);
    // antenna stub
    c.fillStyle = BODY_LO; c.fillRect(X + PW - 16, Y - 10, 7, 11);
    c.fillStyle = BODY_HI; c.fillRect(X + PW - 15, Y - 9, 1, 9);
    // earpiece slots
    c.fillStyle = BODY_LO; for (let i = 0; i < 4; i++) c.fillRect(X + PW / 2 - 9 + i * 5, Y + 6, 3, 2);
    // screen
    const sx = X + 8, sy = Y + 13, sw = PW - 16, sh = 66;
    c.fillStyle = BODY_LO; c.fillRect(sx - 2, sy - 2, sw + 4, sh + 4);
    c.fillStyle = LCD; c.fillRect(sx, sy, sw, sh);
    this.drawScreen(c, sx, sy, sw, sh);
    // keypad
    const ky = sy + sh + 8;
    for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) {
      const bx = X + 14 + q * 23, by = ky + r * 10;
      c.fillStyle = BODY_LO; c.fillRect(bx, by + 1, 18, 7);
      c.fillStyle = '#5b5e62'; c.fillRect(bx, by, 18, 6);
    }
  }

  drawScreen(c, x, y, w, h) {
    const g = this.game, p = g.player, nav = g.nav;
    const n = levelOfDim(p.dim);
    const L = LEVELS[n];
    // status line: level number and signal bars
    drawText(c, 'LV ' + n, x + 3, y + 3, LCD_DARK, 1);
    const near = nav && nav.nearest;
    const bars = !near ? 0 : near.dist < 15 ? 4 : near.dist < 40 ? 3 : near.dist < 80 ? 2 : 1;
    for (let i = 0; i < 4; i++) {
      const bh = 2 + i * 2;
      c.fillStyle = i < bars ? LCD_DARK : LCD_MID;
      c.fillRect(x + w - 18 + i * 4, y + 9 - bh, 3, bh);
    }
    c.fillStyle = LCD_MID; c.fillRect(x + 2, y + 12, w - 4, 1);
    const cx = x + w / 2, cy = y + 31;
    if (!near) {
      const msg = nav && nav.searching ? 'SEARCHING' : 'NO SIGNAL';
      if (Math.floor(this.t * 2) % 2 === 0) drawTextCentered(c, msg, cx, cy - 3, LCD_DARK, 1);
    } else {
      this.drawArrow(c, cx, cy, near.rel, near.dist < 2.5);
      const floors = Math.round(near.dy / 6);
      let label = near.dist < 2.5 ? 'HERE' : Math.round(near.dist) + ' M';
      if (floors) label += floors > 0 ? '  UP ' + floors : '  DN ' + -floors;
      drawTextCentered(c, label, cx, y + 45, LCD_DARK, 1);
    }
    // level name on a marquee
    c.fillStyle = LCD_MID; c.fillRect(x + 2, y + 54, w - 4, 1);
    const name = L ? L.name : '???';
    const tw = textWidth(name, 1);
    c.save();
    c.beginPath(); c.rect(x + 2, y + 56, w - 4, 9); c.clip();
    if (tw <= w - 6) drawTextCentered(c, name, cx, y + 57, LCD_DARK, 1);
    else {
      const span = tw + 24;
      const off = Math.floor((this.t * 18) % span);
      drawText(c, name, x + 3 - off, y + 57, LCD_DARK, 1);
      drawText(c, name, x + 3 - off + span, y + 57, LCD_DARK, 1);
    }
    c.restore();
    void levelNumbers;
  }

  // a chunky arrow pointing where the door is, relative to where you face
  drawArrow(c, cx, cy, rel, here) {
    c.fillStyle = LCD_DARK;
    if (here) {
      c.fillRect(cx - 6, cy - 6, 12, 12);
      c.fillStyle = LCD; c.fillRect(cx - 3, cy - 3, 6, 6);
      return;
    }
    const s = Math.sin(rel), co = Math.cos(rel);
    // arrow shape pointing up (screen -y), rotated by rel
    const pts = [[0, -12], [9, 1], [3, 1], [3, 11], [-3, 11], [-3, 1], [-9, 1]];
    c.beginPath();
    pts.forEach(([px, py], i) => {
      const rx = px * co - py * s, ry = px * s + py * co;
      if (i) c.lineTo(Math.round(cx + rx), Math.round(cy + ry)); else c.moveTo(Math.round(cx + rx), Math.round(cy + ry));
    });
    c.closePath();
    c.fill();
  }
}
