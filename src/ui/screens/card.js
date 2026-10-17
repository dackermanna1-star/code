// Full-screen title cards: chapter cards ("II — First Period"), text cards ("Kettle Run,
// Pennsylvania." / "October 18, 1996.") and ending codes stamped like an attendance code.
import { Screen } from '../screen.js';
import { C, F, W, H } from '../theme.js';
import { rect, dither, AP, clamp, ease, snap, canvas, ctx2d } from '../gfx.js';
import { rng, hash2 } from '../../art/util.js';
import * as svc from '../services.js';

const ENDING_CODES = ['DISMISSED', 'WITHDRAWN', 'PRESENT', 'TRUANT'];
const TYPE_CPS = 16;

export class CardScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = 25;
    this.fadeIn = 0.7; this.fadeOut = 0.9;
    const title = String(args.title ?? '');
    const m = title.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    this.code = ENDING_CODES.find((c) => title.toUpperCase().startsWith(c)) || null;
    if (this.code) { this.big = this.code; this.small = (args.subtitle ?? title.slice(this.code.length).replace(/^\s*[—–-]\s*/, '')) || ''; }
    else if (m && !args.subtitle) { this.big = m[1]; this.small = m[2]; this.chapter = true; }
    else { this.big = title; this.small = args.subtitle || ''; this.chapter = /^(PROLOGUE|EPILOGUE|[IVX]+)$/.test(title); }
    const typeTime = (this.big.length + this.small.length) / TYPE_CPS;
    this.hold = args.hold ?? Math.max(2.2, 1.4 + typeTime * 0.5);
    this.start = 0.55;
    this.typed = 0;
    this.endAt = this.start + (this.code ? 1.2 + this.small.length / TYPE_CPS : typeTime + 0.3) + this.hold;
    this.stamped = false;
  }

  update(dt) {
    const shown = Math.floor(clamp((this.t - this.start) * TYPE_CPS, 0, this.big.length + this.small.length + 6));
    if (!this.code && shown > this.typed) {
      const ch = (this.big + '   ' + this.small)[shown - 1];
      if (ch && ch !== ' ' && shown % 2 === 0) svc.sfx('typewriter_key', { vol: 0.35 });
    }
    this.typed = shown;
    if (this.code && !this.stamped && this.t > this.start + 0.35) { this.stamped = true; svc.sfx('stamp'); }
    if (this.t >= this.endAt) this.close(null);
  }

  render(ctx) {
    rect(ctx, 0, 0, W, H, '#000');
    if (this.code) return this._renderCode(ctx);
    const el = (this.t - this.start) * TYPE_CPS;
    const big = this.big.slice(0, Math.max(0, Math.floor(el)));
    const small = this.small.slice(0, Math.max(0, Math.floor(el - this.big.length - 3)));
    const fb = this.chapter ? F.typedXL : F.typedL, fs = F.typedL;
    const by = this.small ? 206 : 240;
    // type in place: measure the whole line so letters don't shift while typing
    const bx = snap(W / 2 - fb.width(this.big) / 2);
    if (big) fb.draw(ctx, big, bx, by, '#d9d0b8');
    if (this.small) {
      const rule = clamp((el - this.big.length) / 3);
      if (rule > 0 && this.chapter) rect(ctx, snap(W / 2 - 40 * rule), by + fb.lineHeight + 10, snap(80 * rule), AP, C.red);
      const sx = snap(W / 2 - fs.width(this.small) / 2);
      if (small) fs.draw(ctx, small, sx, by + fb.lineHeight + 28, '#a29a86');
    }
    // typewriter carriage cursor
    if (Math.floor(this.t * 2.5) % 2 === 0 && el < this.big.length + this.small.length + 4) {
      const onBig = el < this.big.length;
      const f = onBig ? fb : fs;
      const x = onBig ? bx + fb.width(big) + 2 : snap(W / 2 - fs.width(this.small) / 2) + fs.width(small) + 2;
      const y = onBig ? by : by + fb.lineHeight + 28;
      rect(ctx, x, y + f.lineHeight - 8, 14, AP, '#6c665a');
    }
  }

  _renderCode(ctx) {
    // a rubber attendance stamp slams onto black, slightly crooked; subtitle typed below
    const k = clamp((this.t - this.start) / 0.35);
    if (k <= 0) return;
    const scale = 1 + (1 - ease.out(k)) * 0.7;
    const st = stampCanvas(this.code);
    const w = st.width * 4 * scale, h = st.height * 4 * scale;
    const shake = this.t - this.start - 0.35 < 0.25 && k >= 1 ? ((hash2(Math.floor(this.t * 40), 1) % 3) - 1) * AP * 2 : 0;
    ctx.save();
    ctx.globalAlpha *= ease.out(k);
    ctx.translate(Math.round(W / 2) + shake, 230);
    ctx.rotate(-0.045);
    ctx.drawImage(st, Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
    ctx.restore();
    const el = (this.t - this.start - 1.0) * TYPE_CPS;
    if (el > 0 && this.small) {
      const s = this.small.slice(0, Math.floor(el));
      const f = F.typed;
      f.draw(ctx, s, snap(W / 2 - f.width(this.small) / 2), 336, '#a29a86');
    }
  }
}

const stampCache = new Map();
/** Rubber-stamp lettering at art resolution: red ink, rough box, ink-starved speckles. */
export function stampCanvas(word, color = '#b3262c') {
  const key = word + color;
  if (stampCache.has(key)) return stampCache.get(key);
  const f = F.typedL;
  const tw = f.width(word);
  // draw large text at UI res into a temp, then downsample by 2 (nearest) for chunky art pixels
  const big = canvas(tw + 80, 90); const bx = ctx2d(big);
  f.draw(bx, word, 40, 26, color);
  bx.fillStyle = color;
  const bw = big.width, bh = big.height;
  for (const [x, y, w, h] of [[16, 8, bw - 32, 6], [16, bh - 14, bw - 32, 6], [16, 8, 6, bh - 16], [bw - 22, 8, 6, bh - 16]]) bx.fillRect(x, y, w, h);
  const small = canvas(Math.ceil(bw / 2), Math.ceil(bh / 2)); const sx = ctx2d(small);
  sx.drawImage(big, 0, 0, small.width, small.height);
  // ink starvation: knock out speckles, heavier toward the right edge
  const r = rng(word.length * 131 + 7);
  const img = sx.getImageData(0, 0, small.width, small.height); const d = img.data;
  for (let y = 0; y < small.height; y++) for (let x = 0; x < small.width; x++) {
    const i = (y * small.width + x) * 4;
    if (!d[i + 3]) continue;
    d[i + 3] = d[i + 3] > 100 ? 255 : 0;
    const p = 0.06 + (x / small.width) * 0.16;
    if (r() < p) d[i + 3] = 0;
  }
  sx.putImageData(img, 0, 0);
  stampCache.set(key, small);
  return small;
}
