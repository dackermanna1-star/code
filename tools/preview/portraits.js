// Portrait contact sheets. ?sheet=all|grid|detail|lights|grime|enrolled|dialogue &char=tess &ex=a,b,c &light= &scale=
//   grid     — every expression of a character at 2× (as in game), labelled
//   detail   — a few expressions at 4×
//   lights   — expressions × all six lights
//   grime    — grime 0/1/2 for each character
//   enrolled — enrolled (entranced) variants
//   dialogue — mock 960×540 dialogue box with portraits in context
import { initPortraits, getPortrait, PORTRAIT_LIGHTS } from '../../src/art/portraits.js';
import { CHARS } from '../../src/data/chars.js';

const q = new URLSearchParams(location.search);
const sheet = q.get('sheet') || 'all';
const root = document.getElementById('root');
const CAST = ['tess', 'danny', 'leah', 'marcus', 'adair', 'denise'];
const BG = q.get('bg') || '#15151c';

function h2(t) { const d = document.createElement('h2'); d.textContent = t; root.appendChild(d); }
function board(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; root.appendChild(c);
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = BG; x.fillRect(0, 0, w, h); return x;
}
function put(x, p, dx, dy, s) { x.imageSmoothingEnabled = false; x.drawImage(p, dx, dy, p.width * s, p.height * s); }
function label(x, t, dx, dy, col = '#c4bdb0') { x.fillStyle = col; x.font = '12px monospace'; x.fillText(t, dx, dy); }

function grid(char, { scale = 2, cols = 6, opts = {}, exprs = null, title = '' } = {}) {
  const list = exprs || CHARS[char].expr;
  const cw = 96 * scale + 8, ch = 120 * scale + 20;
  const rows = Math.ceil(list.length / cols);
  if (title) h2(title);
  const x = board(Math.min(list.length, cols) * cw + 8, rows * ch + 8);
  list.forEach((e, k) => {
    const cx = 8 + (k % cols) * cw, cy = 8 + Math.floor(k / cols) * ch;
    put(x, getPortrait(char, e, opts), cx, cy + 14, scale);
    label(x, e, cx, cy + 10);
  });
}

function lightsSheet(char, exprs, scale = 2) {
  h2(`${char} × lights (${scale}×)`);
  const cw = 96 * scale + 8, ch = 120 * scale + 20;
  const x = board(PORTRAIT_LIGHTS.length * cw + 8, exprs.length * ch + 8);
  exprs.forEach((e, r) => PORTRAIT_LIGHTS.forEach((l, k) => {
    const cx = 8 + k * cw, cy = 8 + r * ch;
    put(x, getPortrait(char, e, { light: l }), cx, cy + 14, scale);
    label(x, `${e} · ${l}`, cx, cy + 10);
  }));
}

function grimeSheet(chars, scale = 2) {
  h2(`grime 0 / 1 / 2 (${scale}×)`);
  const cw = 96 * scale + 8, ch = 120 * scale + 20;
  const x = board(3 * cw * 2 + 8, Math.ceil(chars.length / 2) * ch + 8);
  chars.forEach((c, r) => [0, 1, 2].forEach((g) => {
    const cx = 8 + ((r % 2) * 3 + g) * cw, cy = 8 + Math.floor(r / 2) * ch;
    put(x, getPortrait(c, CHARS[c].expr[0] === 'neutral' ? 'neutral' : CHARS[c].expr[0], { grime: g }), cx, cy + 14, scale);
    label(x, `${c} grime ${g}`, cx, cy + 10);
  }));
}

function enrolledSheet(scale = 2) {
  h2(`enrolled / entranced (${scale}×)`);
  const items = [
    ['danny', 'entranced', {}], ['danny', 'flicker', {}], ['danny', 'sad', { enrolled: true }],
    ['leah', 'entranced', {}], ['leah', 'false', {}], ['leah', 'talk', { enrolled: true }],
    ['marcus', 'entranced', {}], ['marcus', 'grief', { enrolled: true }],
    ['tess', 'neutral', { enrolled: true }], ['tess', 'scared', { enrolled: true, light: 'under' }],
  ];
  const cols = 5, cw = 96 * scale + 8, ch = 120 * scale + 20;
  const x = board(cols * cw + 8, Math.ceil(items.length / cols) * ch + 8);
  items.forEach(([c, e, o], k) => {
    const cx = 8 + (k % cols) * cw, cy = 8 + Math.floor(k / cols) * ch;
    put(x, getPortrait(c, e, o), cx, cy + 14, scale);
    label(x, `${c} ${e}${o.enrolled ? ' +enr' : ''}${o.light ? ' ' + o.light : ''}`, cx, cy + 10);
  });
}

async function dialogue(spec) {
  // spec: [char, expr, opts, name, text, side]
  const [char, expr, opts, name, text, side = 'left'] = spec;
  const W = 960, H = 540;
  const x = board(W, H);
  // fake world backdrop (dark hall), then the UI layer
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0e1018'); g.addColorStop(1, '#05060a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1b2219'; x.fillRect(0, 300, W, 120); x.fillStyle = '#12160f'; x.fillRect(0, 420, W, 120);
  for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#262a22' : '#20241c'; x.fillRect(i * 80, 300, 78, 110); }
  const bx = 24, by = 368, bw = W - 48, bh = 150;
  x.fillStyle = 'rgba(8,8,12,0.86)'; x.fillRect(bx, by, bw, bh);
  x.strokeStyle = '#3a3946'; x.lineWidth = 2; x.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  const p = getPortrait(char, expr, { ...opts, mirror: side === 'right' });
  const px = side === 'left' ? bx + 12 : bx + bw - 12 - 192, py = by + bh - 240;
  put(x, p, px, py, 2);
  const tx = side === 'left' ? px + 192 + 20 : bx + 28;
  x.fillStyle = '#1e1d27'; x.fillRect(tx - 8, by - 18, 150, 30);
  x.strokeStyle = CHARS[char]?.color || '#888'; x.strokeRect(tx - 7, by - 17, 148, 28);
  x.fillStyle = CHARS[char]?.color || '#ddd'; x.font = '600 20px "Pixelify Sans", monospace'; x.fillText(name, tx + 2, by + 3);
  x.fillStyle = '#e4dbc2'; x.font = '22px "DotGothic16", monospace';
  const words = text.split(' '); let line = '', ly = by + 48;
  for (const w of words) { if (x.measureText(line + w).width > 600) { x.fillText(line, tx, ly); line = ''; ly += 30; } line += w + ' '; }
  x.fillText(line, tx, ly);
}

async function main() {
  const t0 = performance.now();
  await initPortraits();
  const tInit = performance.now() - t0;
  try { await Promise.all(['600 20px "Pixelify Sans"', '22px "DotGothic16"'].map((f) => document.fonts.load(f))); } catch (e) { /* fonts optional */ }
  await document.fonts?.ready;
  const chars = (q.get('char') || '').split(',').filter(Boolean);
  const exs = (q.get('ex') || '').split(',').filter(Boolean);
  const scale = Number(q.get('scale') || 0);
  const light = q.get('light') || undefined;
  const t1 = performance.now();
  if (sheet === 'grid' || sheet === 'all') {
    for (const c of chars.length ? chars : CAST) grid(c, { scale: scale || 2, cols: Number(q.get('cols') || 6), opts: { light, grime: Number(q.get('grime') || 0), enrolled: q.get('enrolled') === '1' }, title: `${c} — all expressions (2× as in game)` });
  }
  if (sheet === 'detail' || sheet === 'all') {
    for (const c of chars.length ? chars : ['tess']) {
      const list = exs.length ? exs : ['neutral', 'smile', 'scared'];
      grid(c, { scale: scale || 4, cols: list.length, exprs: list, opts: { light }, title: `${c} detail (4×)` });
    }
  }
  if (sheet === 'lights' || sheet === 'all') lightsSheet(chars[0] || 'tess', exs.length ? exs : ['neutral', 'terrified'], scale || 2);
  if (sheet === 'grime' || sheet === 'all') grimeSheet(chars.length ? chars : ['tess', 'danny', 'leah', 'marcus'], scale || 2);
  if (sheet === 'enrolled' || sheet === 'all') enrolledSheet(scale || 2);
  if (sheet === 'dialogue' || sheet === 'all') {
    h2('dialogue box mock (960×540 UI layer)');
    const which = Number(q.get('n') || -1);
    const lines = [
      ['tess', 'skeptical', { grime: 0 }, 'Tess', 'Great. A haunted school. And I wore the good sneakers.'],
      ['danny', 'grin', {}, 'Danny', 'Dolan. Dolan. Look at this guy. He ate the Civil War.', 'right'],
      ['leah', 'deadpan', {}, 'Leah', 'Noted. For the tape.', 'right'],
      ['marcus', 'urgent', { light: 'fluor' }, 'Marcus', 'Get in a room. Sit down. Now.', 'right'],
      ['tess', 'terrified', { light: 'dark', grime: 1 }, 'Tess', 'Okay. Okay okay okay. Walk. Don\'t run.'],
      ['adair', 'urgent', {}, '???', '(She writes in the fog: DON\'T ANSWER HIM)', 'right'],
      ['denise', 'lure', { light: 'fluor' }, 'Denise', 'Marcus Webb. You came. You look just like Daddy.', 'right'],
      ['tess', 'devastated', { light: 'red', grime: 2 }, 'Tess', 'I\'m not leaving without them. — I\'m not.'],
    ];
    (which >= 0 ? [lines[which]] : lines).forEach((l) => dialogue(l));
  }
  const tDraw = performance.now() - t1;
  console.log(`[portraits] init ${tInit.toFixed(0)} ms, sheets ${tDraw.toFixed(0)} ms`);
  window.__ready = true;
}
main().catch((e) => { console.error(e.stack || e); window.__ready = true; });
