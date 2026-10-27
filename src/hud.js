// HUD drawn at the internal 240p resolution and upscaled with the game canvas.
// Text is rasterised then alpha-thresholded against a Bayer matrix, so it is
// pixel-crisp and fades with an ordered-dither dissolve instead of blending.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.prompt = '';
    this.message = '';
    this.messageT = 0;
    this.area = '';
    this.areaT = 0;
    this.hint = '';
    this.counter = '';
    this.counterT = 0;
    this.crosshair = 0.5;
    this.spray = null;
    this.dirty = true;
    this.lastKey = '';
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.dirty = true;
  }

  showMessage(m, t = 3.2) {
    this.message = m;
    this.messageT = t;
  }
  showArea(a) {
    this.area = a;
    this.areaT = 4.5;
  }
  showCounter(c) {
    this.counter = c;
    this.counterT = 3.5;
  }

  update(dt) {
    this.messageT = Math.max(0, this.messageT - dt);
    this.areaT = Math.max(0, this.areaT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    const a = this.areaT > 0 ? Math.min(1, this.areaT / 1.2, (4.5 - this.areaT) / 0.6) : 0;
    const m = this.messageT > 0 ? Math.min(1, this.messageT / 0.6) : 0;
    const c = this.counterT > 0 ? Math.min(1, this.counterT / 0.6) : 0;
    const key = `${this.prompt}|${this.hint}|${this.message}|${(m * 8) | 0}|${this.area}|${(a * 8) | 0}|${this.counter}|${(c * 8) | 0}|${this.crosshair}|${this.spray ? this.spray.name : ''}`;
    if (key === this.lastKey && !this.dirty) return;
    this.lastKey = key;
    this.dirty = false;
    this.draw(a, m, c);
  }

  text(str, x, y, color, align = 'center', alpha = 1, size = 8) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px "Courier New", Courier, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  draw(areaA, msgA, cntA) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    // crosshair: a single faint pixel cross
    if (this.crosshair > 0) {
      ctx.globalAlpha = this.prompt ? 0.95 : 0.55;
      ctx.fillStyle = this.prompt ? '#e8e0c8' : '#a8a090';
      const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
      ctx.fillRect(cx, cy, 1, 1);
      if (this.prompt) {
        ctx.fillRect(cx - 2, cy, 1, 1);
        ctx.fillRect(cx + 2, cy, 1, 1);
        ctx.fillRect(cx, cy - 2, 1, 1);
        ctx.fillRect(cx, cy + 2, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (this.prompt) this.text(this.prompt, W / 2, H / 2 + 12, '#d8d0b8');
    if (this.hint) this.text(this.hint, W / 2, H - 36, '#b8b0a0');
    if (msgA > 0) this.text(this.message, W / 2, H - 52, '#e0d8c0', 'center', msgA);
    if (areaA > 0) this.text(this.area, 10, H - 20, '#c8c0a8', 'left', areaA);
    if (cntA > 0) this.text(this.counter, W - 10, 10, '#c8c0a8', 'right', cntA);
    if (this.spray) {
      // spray can colour swatch, bottom right
      const [r, g, b] = this.spray.rgb.map((v) => Math.round(v * 255));
      ctx.fillStyle = '#000';
      ctx.fillRect(W - 21, H - 23, 12, 14);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(W - 20, H - 22, 10, 12);
      ctx.fillStyle = '#9a9488';
      ctx.fillRect(W - 17, H - 25, 4, 3);
      this.text(this.spray.name, W - 25, H - 20, '#c8c0a8', 'right');
    }
    // binarise alpha with an ordered dither: crisp pixels, dissolve fades
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4 + 3;
        const a = d[i];
        if (a === 0) continue;
        const t = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) * 16;
        if (a > t) {
          d[i] = 255;
          // quantise colour to 15-bit as well
          d[i - 3] &= 0xf8;
          d[i - 2] &= 0xf8;
          d[i - 1] &= 0xf8;
        } else d[i] = 0;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
