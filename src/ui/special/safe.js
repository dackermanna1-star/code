// 'safe' — Haupt's wall safe behind the portrait.
// args { label, check: (a, b, c) => bool, onWrong: async (tries) => void } → true | false.
// Left/right turn the dial (hold to spin), confirm sets each of three numbers, cancel backs up.
import { Screen, Z_SPECIAL } from '../screen.js';
import { C, F, handFont } from '../theme.js';
import { canvas, ctx2d, rect, frame, triangle, paperSheet, AP, clamp, ease, snap } from '../gfx.js';
import { hints } from '../widgets.js';
import { tinyText, rng, hash2 } from '../../art/util.js';
import * as svc from '../services.js';

const DIAL_R = 64;          // art px
const CX = 330, CY = 270;   // dial centre, UI px

export class SafeScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.dimWorld = 0.82;
    this.num = 0;            // number under the index
    this.angle = 0;          // displayed (eased) dial position, in numbers
    this.nums = [];
    this.tries = 0;
    this.state = 'dial';     // 'dial' | 'checking' | 'open' | 'wrong'
    this.shake = 0; this.handle = 0; this.hold = 0;
    this.dialCanvas = dialArt();
    this.rot = canvas(DIAL_R * 2 + 8, DIAL_R * 2 + 8);
  }
  onOpen() { svc.sfx('ui_open'); }

  _turn(d) {
    this.num = (this.num + d + 100) % 100;
    svc.sfx('safe_click', { rate: 0.9 + ((this.num * 7) % 5) * 0.05, vol: 0.7 });
  }

  async _submit() {
    this.state = 'checking';
    let ok = false;
    try { ok = !!this.args.check?.(this.nums[0], this.nums[1], this.nums[2]); } catch (e) { console.error('[ui] safe.check', e); }
    if (ok) {
      this.state = 'open';
      svc.sfx('safe_open');
      this.after(1.3, () => this.close(true));
      return;
    }
    this.tries++;
    this.state = 'wrong'; this.shake = 0.45;
    svc.sfx('door_locked');
    await new Promise((r) => this.after(0.45, r));
    try { await this.args.onWrong?.(this.tries); } catch (e) { console.error('[ui] safe.onWrong', e); }
    this.nums = [];
    this.state = 'dial';
  }

  update(dt, input) {
    // ease the drawn dial toward the selected number along the shortest way round
    let d = this.num - this.angle;
    if (d > 50) d -= 100; if (d < -50) d += 100;
    this.angle = (this.angle + d * Math.min(1, dt * 18) + 100) % 100;
    this.shake = Math.max(0, this.shake - dt);
    if (this.state === 'open') this.handle = Math.min(1, this.handle + dt / 0.5);
    if (!input || this.state !== 'dial') return;
    const l = input.down('left'), r = input.down('right');
    if (input.pressed('left')) { this._turn(-1); this.hold = 0; }
    else if (input.pressed('right')) { this._turn(1); this.hold = 0; }
    else if (l || r) {
      // hold to spin, accelerating
      this.hold += dt;
      const rate = this.hold < 0.3 ? 0 : this.hold < 1.2 ? 10 : 26;
      this.acc = (this.acc || 0) + dt * rate;
      while (this.acc >= 1) { this.acc -= 1; this._turn(l ? -1 : 1); }
    } else { this.hold = 0; this.acc = 0; }
    if (input.pressed('confirm')) {
      this.nums.push(this.num);
      svc.sfx('ui_confirm');
      if (this.nums.length === 3) this._submit();
    } else if (input.pressed('cancel')) {
      if (this.nums.length) { this.nums.pop(); svc.sfx('ui_cancel'); }
      else { svc.sfx('ui_close'); this.close(false); }
    }
  }

  render(ctx) {
    const k = ease.out(clamp(this.t / 0.25));
    const sx = this.shake > 0 ? ((hash2(Math.floor(this.t * 50), 9) % 3) - 1) * AP * 2 : 0;
    ctx.save(); ctx.translate(sx, snap((1 - k) * 24));
    // the safe door (art ×2)
    ctx.drawImage(doorArt(), 100, 40, 460, 460);
    // rotating dial (nearest-neighbour rotation at art res, then ×2)
    const rc = ctx2d(this.rot);
    rc.setTransform(1, 0, 0, 1, 0, 0); rc.clearRect(0, 0, this.rot.width, this.rot.height);
    rc.translate(this.rot.width / 2, this.rot.height / 2);
    rc.rotate(-this.angle / 100 * Math.PI * 2);
    rc.drawImage(this.dialCanvas, -this.dialCanvas.width / 2, -this.dialCanvas.height / 2);
    ctx.drawImage(this.rot, CX - this.rot.width, CY - this.rot.height, this.rot.width * 2, this.rot.height * 2);
    // fixed index mark at 12 o'clock
    triangle(ctx, CX - 10, CY - DIAL_R * 2 - 26, 6, '#cfae55', 'down');
    rect(ctx, CX - 2, CY - DIAL_R * 2 - 14, 4, 10, '#cfae55');
    // handle
    const ha = this.handle * Math.PI / 2;
    ctx.save(); ctx.translate(CX + 4, CY + 196); ctx.rotate(ha);
    rect(ctx, -64, -8, 128, 16, '#2a2a2e'); rect(ctx, -62, -6, 124, 6, '#7d7b80'); rect(ctx, -10, -10, 20, 20, '#9c9a9e');
    ctx.restore();
    ctx.restore();

    // number readout + the taped label
    this._panel(ctx, 600, 120);
    if (this.state === 'open') F.typedL.draw(ctx, 'click.', CX, 470, '#e8e0c8', { align: 'center', alpha: this.handle });
    hints(ctx, [[this.nums.length ? 'UNDO' : 'STEP AWAY', this.ui.input.keyLabel('cancel')], ['SET', this.ui.input.keyLabel('confirm')], ['TURN', '← →']]);
  }

  _panel(ctx, x, y) {
    // label in Haupt's hand on a strip of yellowed masking tape
    const label = this.args.label || '';
    let hf = handFont('haupt');
    if (hf.font.width(label) > 300) hf = { font: F.handS, color: hf.color };
    const lw = Math.min(344, hf.font.width(label) + 40);
    ctx.drawImage(paperSheet(snap(lw), 56, { seed: 'safetape', tone: '#d8c99a', hi: '#e3d6aa', lo: '#bfae7e', stains: 0, torn: 'all' }), x, y);
    hf.font.draw(ctx, label, x + 20, y + 10, hf.color);
    // three number windows
    const by = y + 110;
    F.small.draw(ctx, 'COMBINATION', x, by - 28, '#a39c88');
    for (let i = 0; i < 3; i++) {
      const bx = x + i * 104;
      rect(ctx, bx, by, 88, 64, '#0d0d10');
      frame(ctx, bx, by, 88, 64, i === this.nums.length && this.state === 'dial' ? C.red : '#4b4c57');
      const v = i < this.nums.length ? this.nums[i] : i === this.nums.length && this.state === 'dial' ? this.num : null;
      const col = i < this.nums.length ? '#e8e0c8' : '#6c6a70';
      if (v !== null) F.monoL.draw(ctx, String(v).padStart(2, '0'), bx + 44, by + 12, this.state === 'wrong' ? C.red : col, { align: 'center' });
      if (i < 2) F.typedL.draw(ctx, '–', bx + 96, by + 14, '#6c6a70', { align: 'center' });
    }
    if (this.tries) F.small.draw(ctx, `Tried ${this.tries} time${this.tries > 1 ? 's' : ''}.`, x, by + 84, '#7a746a');
  }
}

let doorCanvas = null;
/** Safe door at art res (230×230): dark green enamel, gold pinstripe, maker's plate, rivets. */
function doorArt() {
  if (doorCanvas) return doorCanvas;
  const c = canvas(230, 230); const x = ctx2d(c);
  const r = rng(1923);
  rect(x, 0, 0, 230, 230, '#0b0c0b');                 // the wall cavity
  rect(x, 6, 6, 218, 218, '#1a2420');
  rect(x, 10, 10, 210, 210, '#22302a');
  for (let j = 10; j < 220; j++) if (r() < 0.3) { x.fillStyle = '#26352e'; x.fillRect(10, j, 210, 1); }
  rect(x, 10, 10, 210, 1, '#3e5248'); rect(x, 10, 10, 1, 210, '#34463d'); rect(x, 10, 219, 210, 1, '#0f1512'); rect(x, 219, 10, 1, 210, '#0f1512');
  // gold pinstripe border
  rect(x, 18, 18, 194, 1, '#9a7d34'); rect(x, 18, 211, 194, 1, '#9a7d34'); rect(x, 18, 18, 1, 194, '#9a7d34'); rect(x, 211, 18, 1, 194, '#9a7d34');
  // maker's plate
  rect(x, 70, 24, 90, 12, '#9a7d34'); rect(x, 71, 25, 88, 10, '#b89a4a');
  tinyText(x, 78, 27, 'HALL SAFE CO.', '#3a2c10');
  tinyText(x, 92, 200, 'CINCINNATI', '#8a7a4a');
  // dial seat
  for (let j = -76; j <= 76; j++) for (let i = -76; i <= 76; i++) {
    const d = Math.hypot(i, j);
    if (d > 76 || d < 70) continue;
    x.fillStyle = (i + j) < 0 ? '#5d5b56' : '#2a2925'; x.fillRect(115 + i, 115 + j, 1, 1);
  }
  // rivets
  for (const p of [[16, 16], [210, 16], [16, 210], [210, 210], [113, 14], [113, 212]]) { rect(x, p[0], p[1], 3, 3, '#4a5a50'); rect(x, p[0], p[1], 1, 1, '#7d8f84'); }
  // scratches near the dial (decades of nervous hands)
  for (let k = 0; k < 14; k++) { const a = r() * 6.28, d = 78 + r() * 10; rect(x, Math.round(115 + Math.cos(a) * d), Math.round(115 + Math.sin(a) * d), 2 + Math.floor(r() * 4), 1, '#3a4a42'); }
  return (doorCanvas = c);
}

/** Dial face at art res: black dial, silver ring with 100 ticks, numbers every 10, knurled knob. */
function dialArt() {
  const s = DIAL_R * 2 + 4;
  const c = canvas(s, s); const x = ctx2d(c);
  const cx = s / 2, cy = s / 2;
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
    if (d > DIAL_R) continue;
    let col = d > DIAL_R - 2 ? '#2a2a2e' : d > DIAL_R - 22 ? '#bdbcc0' : d > 26 ? '#18181b' : '#2e2e33';
    if (d > DIAL_R - 22 && d <= DIAL_R - 2 && (i - j) > 10) col = '#a5a4a9';
    if (d <= 26 && d > 22) col = (Math.floor(Math.atan2(j - cy, i - cx) * 20) % 2) ? '#4a4a50' : '#25252a';
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  for (let n = 0; n < 100; n++) {
    const a = n / 100 * Math.PI * 2;
    const long = n % 10 === 0, mid = n % 5 === 0;
    const r0 = DIAL_R - (long ? 9 : mid ? 7 : 5), r1 = DIAL_R - 3;
    for (let r = r0; r <= r1; r++) { x.fillStyle = '#121214'; x.fillRect(Math.round(cx + Math.sin(a) * r), Math.round(cy - Math.cos(a) * r), 1, 1); }
    if (long) {
      const t = String(n);
      const tw = t.length * 4 - 1;
      const rr = DIAL_R - 16;
      tinyText(x, Math.round(cx + Math.sin(a) * rr - tw / 2), Math.round(cy - Math.cos(a) * rr - 2), t, '#121214');
    }
  }
  return c;
}
