// Sprite contact sheets. ?sheet=all|chars|lineup|walk|focus &id=tess,danny &scale=3 &anims=walk_down,idle_left
//   chars  — every anim of each character (all frames, labelled rows) at 3×
//   lineup — the four friends idle_down side by side on black and on a lit linoleum floor (1×, 2×, 4×)
//   walk   — Tess 4-frame walk (and run) strips per direction at 4×
//   focus  — chosen anims for chosen ids at a big scale (iteration)
import { initSprites, getSprite } from '../../src/art/sprites.js';
import { SPRITE_IDS } from '../../src/data/chars.js';
import { PAL, mix } from '../../src/art/palette.js';

const q = new URLSearchParams(location.search);
const sheet = q.get('sheet') || 'all';
const root = document.getElementById('root');
const BG = q.get('bg') || '#15151c';
const OURS = SPRITE_IDS.filter((id) => id !== 'colonel');
const ids = q.get('id') ? q.get('id').split(',') : OURS;

function h2(t) { const d = document.createElement('h2'); d.textContent = t; root.appendChild(d); }
function board(w, h, bg = BG) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; root.appendChild(c);
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = bg; x.fillRect(0, 0, w, h); return x;
}
function put(x, img, dx, dy, s) { x.imageSmoothingEnabled = false; x.drawImage(img, dx, dy, img.width * s, img.height * s); }
function label(x, t, dx, dy, col = '#9c9897') { x.fillStyle = col; x.font = '11px monospace'; x.fillText(t, dx, dy); }

/** Linoleum checker (classroom tan/green) lit by a soft warm pool, crisp + dithered. */
function lino(x, x0, y0, w, h, s, lit = true) {
  const A = mix(mix(PAL.cream_d, PAL.tan, 0.35), PAL.green_d, 0.25), B = mix(PAL.green_d, PAL.green, 0.55);
  for (let ty = 0; ty < h; ty += 8) for (let tx = 0; tx < w; tx += 8) {
    x.fillStyle = ((tx + ty) / 8) % 2 ? A : B;
    x.fillRect(x0 + tx * s, y0 + ty * s, 8 * s, 8 * s);
  }
  if (!lit) return;
  // dithered darkness falloff from the centre (the game multiplies darkness the same way)
  const BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  x.fillStyle = 'rgba(8,8,14,0.6)';
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const dx = (px - w / 2) / (w / 2), dy = (py - h / 2) / (h / 1.6);
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    if (BAY[py & 3][px & 3] < d * d * 16) x.fillRect(x0 + px * s, y0 + py * s, s, s);
  }
}

function charSheet(id, scale = 3) {
  const S = getSprite(id);
  const names = Object.keys(S.anims).filter((n) => !q.get('anims') || q.get('anims').split(',').includes(n));
  const fw = S.fw * scale, fh = S.fh * scale;
  // long idles reuse canvases: show each unique frame once, label with the full sequence length
  const uniq = (a) => [...new Set(a.frames)];
  const maxN = Math.max(...names.map((n) => uniq(S.anims[n]).length));
  const cols = Math.min(maxN, 16);
  const lw = 150;
  const rowH = fh + 6;
  let rows = 0;
  for (const n of names) rows += Math.ceil(uniq(S.anims[n]).length / cols);
  h2(`${id}  (${names.length} anims, ${S.fw}×${S.fh}, anchor ${S.ax},${S.ay}) @${scale}×`);
  const x = board(lw + cols * (fw + 4) + 8, rows * rowH + 8);
  let r = 0;
  for (const n of names) {
    const a = S.anims[n];
    const u = uniq(a);
    label(x, n, 4, 8 + r * rowH + 14);
    label(x, `${a.frames.length}f${u.length < a.frames.length ? ` (${u.length} uniq)` : ''} ${a.fps}fps${a.loop === false ? ' once' : ''}`, 4, 8 + r * rowH + 28, '#5e5c66');
    u.forEach((f, i) => {
      const cx = lw + (i % cols) * (fw + 4), cy = 4 + (r + Math.floor(i / cols)) * rowH;
      x.fillStyle = '#1d1d26'; x.fillRect(cx, cy, fw, fh);
      put(x, f, cx, cy, scale);
      // feet anchor tick
      x.fillStyle = '#c8423b'; x.fillRect(cx + S.ax * scale - 1, cy + S.ay * scale, 3, 1);
    });
    r += Math.ceil(u.length / cols);
  }
}

function lineup() {
  const friends = ['tess', 'danny', 'leah', 'marcus'].filter((id) => { try { return getSprite(id); } catch { return false; } });
  for (const s of [1, 2, 4]) {
    h2(`lineup idle_down @${s}× — black / lit linoleum`);
    const W = 160, H = 48;
    const x = board((W * 2 + 12) * s, H * s, '#000');
    lino(x, (W + 12) * s, 0, W, H, s);
    friends.forEach((id, i) => {
      const S = getSprite(id);
      const f = (S.anims.idle_down || Object.values(S.anims)[0]).frames[0];
      const fx = 20 + i * 36, fy = 40;
      put(x, f, (fx - S.ax) * s, (fy - S.ay) * s, s);
      put(x, f, (W + 12 + fx - S.ax) * s, (fy - S.ay) * s, s);
    });
  }
  // the whole cast standing (idle_down or first anim) on the lit floor at 2×
  h2('cast @2× on lit linoleum');
  const W = 30 * OURS.length + 20, H = 48, s = 2;
  const x = board(W * s, H * s, '#000');
  lino(x, 0, 0, W, H, s);
  OURS.forEach((id, i) => {
    let S; try { S = getSprite(id); } catch { return; }
    const a = S.anims.idle_down || S.anims.sit_up || Object.values(S.anims)[0];
    put(x, a.frames[0], (16 + i * 30 - S.ax) * s, (40 - S.ay) * s, s);
  });
}

function walkStrips(id = 'tess', s = 4) {
  const S = getSprite(id);
  for (const kind of ['walk', 'run', 'idle']) {
    h2(`${id} ${kind} strips @${s}×`);
    const x = board(4 * (4 * (S.fw * s + 6) + 10) + 10, S.fh * s + 8);
    ['down', 'left', 'up', 'right'].forEach((d, k) => {
      const a = S.anims[`${kind}_${d}`];
      if (!a) return;
      a.frames.slice(0, 4).forEach((f, i) => {
        const cx = 4 + k * (4 * (S.fw * s + 6) + 10) + i * (S.fw * s + 6);
        x.fillStyle = '#20202a'; x.fillRect(cx, 4, S.fw * s, S.fh * s);
        put(x, f, cx, 4, s);
      });
    });
  }
}

const t0 = performance.now();
await initSprites();
const t1 = performance.now();
console.log(`[sprites] init ${Math.round(t1 - t0)} ms`);
const scale = Number(q.get('scale') || 3);
if (sheet === 'all' || sheet === 'lineup') lineup();
if (sheet === 'all' || sheet === 'walk') walkStrips(q.get('id') || 'tess', Number(q.get('scale') || 4));
if (sheet === 'all' || sheet === 'chars') for (const id of ids) { try { charSheet(id, scale); } catch (e) { h2(`${id}: ${e.message}`); console.error(e); } }
if (sheet === 'focus') for (const id of ids) charSheet(id, Number(q.get('scale') || 6));
window.__ready = true;
