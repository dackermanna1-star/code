// Document reader (TECH §16). Each `kind` is its own material — typed sheet, mimeographed notice,
// notebook page, index note, chalkboard, brass plaque, newspaper clipping, official form, CRT
// screen, open book — and each `hand` its own handwriting. Pages are laid out once and cached as
// canvases; the reader only blits them.
//   body: '\n\n' paragraphs, '\n' line breaks, ~~strike~~, __underline__, *emphasis*
import { HW } from '../../engine/hw.js';
import { Screen } from '../screen.js';
import { C, F, W, H, handFont } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { canvas, ctx2d, rect, frame, dither, paperSheet, triangle, AP, clamp, ease, snap, vignette } from '../gfx.js';
import { rng, hashStr } from '../../art/util.js';
import { hints } from '../widgets.js';
import * as svc from '../services.js';

const TOP = 52, BOTTOM = 492; // vertical band available for the material

// ---- rich text ---------------------------------------------------------------------------------------
/** Parse a body into paragraphs of lines of words: { text, strike, under, em }. */
function parseBody(body) {
  const paras = String(body ?? '').replace(/\r/g, '').split(/\n{2,}/);
  return paras.map((p) => p.split('\n').map((line) => {
    const words = [];
    let st = { strike: false, under: false, em: false };
    // split keeping markers as tokens
    const parts = line.split(/(~~|__|\*)/);
    let buf = '';
    const flush = (sep) => {
      if (!buf && !sep) return;
      words.push({ text: buf, ...st, space: sep });
      buf = '';
    };
    for (const part of parts) {
      if (part === '~~') { flush(false); st = { ...st, strike: !st.strike }; continue; }
      if (part === '__') { flush(false); st = { ...st, under: !st.under }; continue; }
      if (part === '*') { flush(false); st = { ...st, em: !st.em }; continue; }
      for (let i = 0; i < part.length; i++) {
        const c = part[i];
        if (c === ' ') { flush(true); continue; }
        buf += c;
      }
    }
    flush(false);
    return words.filter((w) => w.text || w.space);
  }));
}

/**
 * Flow parsed text into lines that fit `maxW`. Returns [{ items: [{ text, x, strike, under, em }], gapAfter, w }]
 * Each word is measured as a run (kerning preserved).
 */
function flow(paras, f, maxW, fEm) {
  const out = [];
  const sp = f.width(' ') || f.size * 0.3;
  paras.forEach((lines, pi) => {
    lines.forEach((words) => {
      let cur = { items: [], w: 0 };
      let pendingSpace = false;
      for (const w of words) {
        if (!w.text) { pendingSpace = pendingSpace || w.space; continue; }
        const ff = w.em && fEm ? fEm : f;
        const ww = ff.width(w.text);
        const gap = cur.items.length && pendingSpace ? sp : 0;
        if (cur.items.length && cur.w + gap + ww > maxW) { out.push(cur); cur = { items: [], w: 0 }; }
        const x = cur.items.length ? cur.w + (pendingSpace ? sp : 0) : 0;
        cur.items.push({ ...w, x, w: ww, f: ff });
        cur.w = x + ww;
        pendingSpace = w.space;
      }
      out.push(cur);
    });
    if (pi < paras.length - 1) out[out.length - 1].gapAfter = true;
  });
  return out;
}

function drawFlowLine(ctx, line, x, y, color, o = {}) {
  const r = o.jitter ? rng(hashStr(line.items.map((i) => i.text).join(' ') + y)) : null;
  for (const it of line.items) {
    const dy = r ? Math.round((r() - 0.5) * o.jitter) : 0;
    it.f.draw(ctx, it.text, x + it.x, y + dy, it.em && o.emColor ? o.emColor : color);
    const lh = it.f.lineHeight;
    if (it.under) rect(ctx, x + it.x, y + dy + lh - 4, it.w, AP, color);
    if (it.strike) {
      // struck out by hand: a slightly wobbly double stroke
      const sy = y + dy + Math.round(lh * 0.52);
      rect(ctx, x + it.x - 2, sy, it.w + 4, AP, o.strikeColor || color);
      rect(ctx, x + it.x + 2, sy + AP, it.w - 2, AP, o.strikeColor || color);
    }
  }
}

// ---- kinds -------------------------------------------------------------------------------------------
// Each kind: { w, h, pad: [top, right, bottom, left], font(doc), color, paper(w, h, doc, page), deco(ctx, ...) }
const KINDS = {
  typed: {
    w: 600, h: 440, pad: [56, 56, 44, 64],
    font: () => F.typed, color: '#25232a',
    paper: (w, h, d, i) => paperSheet(w, h, { seed: d.id + i, stains: 1, fold: 0.34, tone: '#dcd0ac' }),
  },
  print: {
    w: 600, h: 440, pad: [56, 56, 44, 64],
    font: () => F.typed, color: C.mimeo,
    paper: (w, h, d, i) => paperSheet(w, h, { seed: d.id + i, stains: 1, tone: '#e1dac4', hi: '#ece6d4' }),
  },
  handwritten: {
    w: 600, h: 440, pad: [50, 48, 36, 90], ruled: true,
    paper: (w, h, d, i) => (d.hand === 'kid' ? crayonPaper(w, h, d.id)
      : paperSheet(w, h, { seed: d.id + i, holes: true, margin: 74, ruled: { top: 50, gap: hand(d).font.lineHeight }, stains: 1, tone: '#ddd3b4' })),
  },
  note: {
    w: 440, h: 300, pad: [40, 34, 30, 34], ruled: true,
    paper: (w, h, d, i) => paperSheet(w, h, { seed: d.id + i, ruled: { top: 40, gap: hand(d).font.lineHeight, color: '#a7b6c8' }, stains: 1, tone: '#e0d8bc', dogear: 24 }),
  },
  chalk: {
    w: 720, h: 400, pad: [40, 44, 56, 44],
    font: () => font({ family: FONT.hand, size: 30, lineHeight: 38, threshold: 0.5 }), color: '#e2e6da',
    paper: (w, h, d) => chalkboard(w, h, d.id),
  },
  plaque: {
    w: 640, h: 420, pad: [56, 60, 56, 60], center: true, upper: true,
    font: () => font({ family: FONT.typed, size: 24, lineHeight: 32, threshold: 0.5 }), color: '#3a2a0e',
    paper: (w, h, d) => brassPlaque(w, h, d.id),
  },
  clipping: {
    w: 460, h: 448, pad: [34, 34, 34, 34],
    font: () => F.typedS, color: '#2b2a2c',
    paper: (w, h, d, i) => paperSheet(w, h, { seed: d.id + i, torn: 'all', stains: 2, tone: '#cbc2a6', hi: '#d8d0b6', lo: '#a9a088', edge: '#8f8467' }),
  },
  form: {
    w: 600, h: 448, pad: [70, 44, 40, 44],
    font: () => font({ family: FONT.typed, size: 16, lineHeight: 36, threshold: 0.42 }), color: '#202024',
    paper: (w, h, d, i) => formSheet(w, h, d, i),
  },
  screen: {
    w: 680, h: 420, pad: [50, 56, 50, 56],
    font: () => F.monoS, color: C.crt,
    paper: (w, h) => crtScreen(w, h),
  },
  book: {
    w: 820, h: 440, pad: [48, 40, 44, 40], spread: true,
    font: () => font({ family: FONT.typed, size: 17, lineHeight: 24, threshold: 0.42 }), color: '#2f2318',
    paper: (w, h, d, i) => bookSpread(w, h, d.id + i),
  },
};
const hand = (d) => handFont(d.hand || (d.kind === 'note' ? 'tess' : 'walt'));

/** Manila construction paper with a crayon sun and a crayon school (kindergarten drawings). */
function crayonPaper(w, h, seed) {
  const c = canvas(w, h); const x = ctx2d(c);
  x.drawImage(paperSheet(w, h, { seed: seed + 'manila', tone: '#d8c48e', hi: '#e2d19e', lo: '#bfa972', stains: 0 }), 0, 0);
  const r = rng(hashStr(seed));
  const stroke = (pts, col) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / AP;
      for (let k = 0; k <= n; k++) {
        const px = snap(ax + (bx - ax) * k / n + (r() - 0.5) * 3), py = snap(ay + (by - ay) * k / n + (r() - 0.5) * 3);
        if (r() > 0.12) rect(x, px, py, 4, 4, col);
      }
    }
  };
  // sun with rays (top-right)
  const sx = w - 80, sy = 70;
  for (let a = 0; a < Math.PI * 2; a += 0.35) stroke([[sx + Math.cos(a) * 20, sy + Math.sin(a) * 20], [sx + Math.cos(a + 0.35) * 20, sy + Math.sin(a + 0.35) * 20]], '#d9a321');
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) stroke([[sx + Math.cos(a) * 28, sy + Math.sin(a) * 28], [sx + Math.cos(a) * 44, sy + Math.sin(a) * 44]], '#d9a321');
  // the school: a box, a door, a flag; and two stick children holding hands
  const bx = w - 230, by = h - 150;
  stroke([[bx, by], [bx + 150, by], [bx + 150, by + 110], [bx, by + 110], [bx, by]], '#7a3b2a');
  stroke([[bx + 64, by + 110], [bx + 64, by + 70], [bx + 88, by + 70], [bx + 88, by + 110]], '#2f2f7a');
  stroke([[bx + 20, by], [bx + 20, by - 50], [bx + 50, by - 42], [bx + 20, by - 34]], '#a8382f');
  for (const k of [0, 1]) {
    const cx = 120 + k * 44, cy = h - 100;
    stroke([[cx, cy], [cx, cy + 36]], '#2f2f7a'); stroke([[cx - 12, cy + 60], [cx, cy + 36], [cx + 12, cy + 60]], '#2f2f7a');
    stroke([[cx - 16, cy + 14], [cx + 16, cy + 14]], '#2f2f7a');
    stroke([[cx - 8, cy - 10], [cx + 8, cy - 10], [cx + 8, cy - 24], [cx - 8, cy - 24], [cx - 8, cy - 10]], '#a8382f');
  }
  return c;
}

function chalkboard(w, h, seed) {
  const c = canvas(w, h); const x = ctx2d(c);
  rect(x, 0, 0, w, h, '#4a3524');                         // wooden frame
  rect(x, 0, 0, w, AP * 2, '#6b4d33'); rect(x, 0, h - AP * 2, w, AP * 2, '#2d2016');
  rect(x, 12, 12, w - 24, h - 40, '#26332d');              // slate
  const r = rng(hashStr(seed + 'chalk'));
  for (let i = 0; i < 9; i++) {                            // eraser swirls
    const sx = 12 + Math.floor(r() * (w - 140)), sy = 12 + Math.floor(r() * (h - 120));
    dither(x, sx, sy, 80 + r() * 120, 30 + r() * 50, 'rgba(160,175,160,0.5)', 0.08 + r() * 0.08);
  }
  dither(x, 12, 12, w - 24, h - 40, 'rgba(200,210,200,0.35)', 0.05);
  rect(x, 6, h - 30, w - 12, 12, '#5e432c'); rect(x, 6, h - 30, w - 12, AP, '#7d5d40'); // chalk tray
  rect(x, 60, h - 34, 26, 6, '#e8e8e0'); rect(x, 98, h - 34, 14, 6, '#d6c9a0');           // chalk stubs
  rect(x, w - 120, h - 36, 50, 10, '#3b3b44'); rect(x, w - 120, h - 36, 50, 4, '#8d8676');  // eraser
  return c;
}

function brassPlaque(w, h, seed) {
  const c = canvas(w, h); const x = ctx2d(c);
  const r = rng(hashStr(seed + 'brass'));
  rect(x, 0, 0, w, h, '#2b2312');
  rect(x, AP * 2, AP * 2, w - AP * 4, h - AP * 4, '#9a7d34');
  // bevel
  rect(x, AP * 2, AP * 2, w - AP * 4, AP * 3, '#e0c477'); rect(x, AP * 2, AP * 2, AP * 3, h - AP * 4, '#cfae55');
  rect(x, AP * 2, h - AP * 5, w - AP * 4, AP * 3, '#5e4a1c'); rect(x, w - AP * 5, AP * 2, AP * 3, h - AP * 4, '#6f5a24');
  rect(x, 18, 18, w - 36, h - 36, '#b08f3e');
  frame(x, 24, 24, w - 48, h - 48, '#7a6127');
  frame(x, 26, 26, w - 52, h - 52, '#d9bf72');
  // tarnish & verdigris
  // tarnish: soft dithered patches, verdigris in the lower corners where rain got in
  for (let i = 0; i < 14; i++) {
    const cx = 30 + r() * (w - 60), cy = 30 + r() * (h - 60), rr = 10 + r() * 26;
    const green = cy > h * 0.6 && r() < 0.6;
    for (let yy = -rr; yy < rr; yy += AP) {
      const hw = Math.sqrt(Math.max(0, 1 - (yy / rr) ** 2)) * rr * 1.6;
      dither(x, snap(cx - hw), snap(cy + yy * 0.6), snap(hw * 2), AP, green ? 'rgba(70,120,95,0.8)' : 'rgba(95,72,28,0.75)', 0.12);
    }
  }
  for (const [sx, sy] of [[14, 14], [w - 26, 14], [14, h - 26], [w - 26, h - 26]]) {
    rect(x, sx, sy, 12, 12, '#4a3a16'); rect(x, sx + 2, sy + 2, 8, 8, '#c9b06a'); rect(x, sx + 2, sy + 5, 8, 2, '#4a3a16');
  }
  return c;
}

function formSheet(w, h, d, i) {
  const c = canvas(w, h); const x = ctx2d(c);
  x.drawImage(paperSheet(w, h, { seed: d.id + i, stains: 1, tone: '#e2dcc8', hi: '#ece8da' }), 0, 0);
  frame(x, 22, 22, w - 44, h - 44, '#3c3c48');
  rect(x, 22, 22, w - 44, 30, '#3c3c48');
  F.small.draw(x, (d.formHeader || d.title || 'FORM').toUpperCase(), w / 2, 28, '#e2dcc8', { align: 'center' });
  return c;
}

function crtScreen(w, h) {
  const c = canvas(w, h); const x = ctx2d(c);
  rect(x, 0, 0, w, h, '#2b2a27'); rect(x, AP * 2, AP * 2, w - AP * 4, h - AP * 4, '#45433d');
  rect(x, 18, 18, w - 36, h - 36, '#101211');
  rect(x, 24, 24, w - 48, h - 48, C.crtBg);
  for (let y = 24; y < h - 24; y += 4) rect(x, 24, y + 2, w - 48, AP, 'rgba(0,0,0,0.35)');
  return c;
}

function bookSpread(w, h, seed) {
  const c = canvas(w, h); const x = ctx2d(c);
  rect(x, 0, 6, w, h - 6, '#3a1f17');                                  // cover board
  const pw = w / 2 - 10;
  x.drawImage(paperSheet(pw, h - 16, { seed: seed + 'L', stains: 1, tone: '#d6c7a0' }), 8, 4);
  x.drawImage(paperSheet(pw, h - 16, { seed: seed + 'R', stains: 1, tone: '#d6c7a0' }), w / 2 + 2, 4);
  for (let i = 0; i < 6; i++) rect(x, w / 2 - 10 + i * 2, 4, AP, h - 16, `rgba(40,25,10,${0.35 - i * 0.05})`);
  for (let i = 0; i < 6; i++) rect(x, w / 2 + 2 + i * 2, 4, AP, h - 16, `rgba(40,25,10,${0.05 + i * 0.0})`);
  rect(x, w / 2 - 1, 4, AP, h - 16, '#5a4630');
  return c;
}

// ---- layout ---------------------------------------------------------------------------------------------
function layoutDoc(id) {
  const d0 = svc.docs()[id];
  const d = d0 ? { ...d0, id } : { id, title: 'Missing document', kind: 'typed', body: `(no document "${id}")` };
  const K = KINDS[d.kind] || KINDS.typed;
  const isHand = d.kind === 'handwritten' || d.kind === 'note';
  const hf = isHand ? hand(d) : null;
  const f = isHand ? hf.font : K.font(d);
  const fEm = isHand ? f : (f.family === FONT.typed ? f : f);
  const color = isHand ? hf.color : K.color;
  const [pt, pr, pb, pl] = K.pad;
  const pageW = K.spread ? K.w / 2 - 10 : K.w;
  const innerW = pageW - pl - pr;
  let body = d.body ?? '';
  if (K.upper) body = body.toUpperCase();
  const lines = flow(parseBody(body), f, innerW, fEm);
  const lineH = f.lineHeight;
  // ruled paper: paragraphs skip a whole rule so writing stays on the lines
  const gap = K.ruled ? lineH : Math.round(lineH * 0.5);
  const avail = K.h - pt - pb - (d.footer ? lineH + 8 : 0);
  // the clipping's masthead + headline eat space on the first page only
  const headline = d.kind === 'clipping' ? F.typed.wrap(d.title || '', K.w - 70).slice(0, 3) : [];
  const head = d.kind === 'clipping' ? 56 + headline.length * 26 + 34 - pt + 8 : 0;
  // paginate
  const pages = [[]];
  let y = head;
  for (const ln of lines) {
    if (y + lineH > avail && pages[pages.length - 1].length) { pages.push([]); y = 0; }
    pages[pages.length - 1].push({ ...ln, y });
    y += lineH + (ln.gapAfter ? gap : 0);
  }
  // a spread holds two pages
  const spreads = [];
  if (K.spread) for (let i = 0; i < pages.length; i += 2) spreads.push([pages[i], pages[i + 1] || []]);
  else for (const p of pages) spreads.push([p]);

  return spreads.map((sp, si) => {
    const c = canvas(K.w, K.h); const x = ctx2d(c);
    x.drawImage(K.paper(K.w, K.h, d, si), 0, 0);
    sp.forEach((page, half) => {
      const ox = K.spread ? (half ? K.w / 2 + 2 : 8) + pl : pl;
      let oy = pt;
      // vertically centre plaques; header furniture on page 1
      if (K.center) {
        const total = page.length ? page[page.length - 1].y + lineH : 0;
        oy = Math.round((K.h - total) / 2 / AP) * AP;
      }
      for (const ln of page) {
        const lx = K.center ? Math.round((K.w - ln.w) / 2 / AP) * AP : ox;
        if (d.kind === 'plaque') drawFlowLine(x, ln, lx + AP, oy + ln.y + AP, '#e8d290');
        if (d.kind === 'form') drawFormLine(x, ln, lx, oy + ln.y, f, d);
        else drawFlowLine(x, ln, lx, oy + ln.y, color, {
          jitter: isHand ? (d.hand === 'kid' ? 6 : 2) : d.kind === 'chalk' ? 3 : 0,
          strikeColor: isHand ? color : color,
        });
      }
      if (K.spread) F.small.draw(x, String(si * 2 + half + 1), K.spread && half ? K.w - 40 : 30, K.h - 30, '#6b5a40');
    });
    if (d.kind === 'chalk') dither(x, 12, 12, K.w - 24, K.h - 40, 'rgba(38,51,45,0.9)', 0.12);
    // header furniture
    if (si === 0) {
      if (d.kind === 'clipping') {
        F.small.draw(x, 'T H E   S C H U Y L K I L L   L E D G E R', K.w / 2, 22, '#3a3838', { align: 'center' });
        rect(x, 30, 44, K.w - 60, AP, '#3a3838'); rect(x, 30, 48, K.w - 60, AP / 2 + 1, '#3a3838');
        headline.forEach((l, i) => F.typed.draw(x, l, K.w / 2, 54 + i * 26, '#151416', { align: 'center' }));
        rect(x, 30, 58 + headline.length * 26, K.w - 60, AP, '#3a3838');
      }
      if (d.date && d.kind !== 'plaque') {
        const df = d.kind === 'chalk' ? f : (isHand ? hf.font : F.typedS);
        const dc = d.kind === 'chalk' ? '#cfd6c9' : color;
        if (d.kind === 'form') F.small.draw(x, d.date, K.w - 50, 28, '#e2dcc8', { align: 'right' });
        else if (d.kind === 'clipping') F.small.draw(x, d.date.toUpperCase(), K.w / 2, 64 + headline.length * 26, '#4a4848', { align: 'center' });
        else df.draw(x, d.date, K.w - pr, 18, dc, { align: 'right' });
      }
    }
    if (si === spreads.length - 1 && d.footer) {
      const ff = isHand ? hf.font : F.typedS;
      const fy = K.h - pb - ff.lineHeight + 4;
      ff.draw(x, d.footer, K.w - pr, fy, isHand ? color : (d.kind === 'chalk' ? '#e2e6da' : color), { align: 'right' });
    }
    return c;
  });
}

/** Forms: "LABEL: value" lines get a typed label, a ruled field and the value in handwriting. */
function drawFormLine(x, ln, lx, ly, f, d) {
  const text = ln.items.map((i) => i.text).join(' ');
  const m = text.match(/^([A-Z0-9 .'/()#-]{2,}):\s*(.*)$/);
  if (!m) { drawFlowLine(x, ln, lx, ly + 8, '#202024'); return; }
  const lw = F.typedS.draw(x, m[1] + ':', lx, ly + 10, '#202024');
  const fx = lx + lw + 12;
  rect(x, fx, ly + 30, 600 - 44 - 20 - fx, AP / 2 + 1, '#6a6a74');
  if (m[2]) {
    const h = HANDS_FORM(d.hand);
    h.font.draw(x, m[2], fx + 8, ly + 2, h.color);
  }
}
const HANDS_FORM = (hand) => {
  const hf = handFont(hand || 'tess');
  return { font: font({ family: hf.font.family, size: Math.min(26, hf.font.size), lineHeight: 30, skew: hf.font.skew, weight: hf.font.weight, threshold: 0.45 }), color: hf.color };
};

// ---- screen ---------------------------------------------------------------------------------------------
export class DocReader extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.dimWorld = 0.72;
    this.id = args.id;
    this.doc = svc.docs()[this.id];
    this.kind = this.doc?.kind || 'typed';
    this.pages = layoutDoc(this.id);
    this.page = 0;
    this.turn = 1;       // page-turn animation 0..1
    this.dir = 1;
  }
  onOpen() {
    if (HW.state) { HW.state.docs = HW.state.docs || {}; HW.state.docs[this.id] = true; }
    this.ui._log({ kind: 'doc', id: this.id });
    svc.sfx(this.kind === 'screen' ? 'trs80_beep' : 'paper_rustle');
  }
  update(dt, input) {
    this.turn = Math.min(1, this.turn + dt / 0.18);
    if (!input) return;
    const n = this.pages.length;
    if (input.repeat('right') || input.repeat('down') || input.pressed('confirm')) {
      if (this.page < n - 1) { this.page++; this.turn = 0; this.dir = 1; svc.sfx('page_turn'); }
      else if (input.pressed('confirm')) { svc.sfx('ui_close'); this.close(null); }
    } else if (input.repeat('left') || input.repeat('up')) {
      if (this.page > 0) { this.page--; this.turn = 0; this.dir = -1; svc.sfx('page_turn'); }
    }
    if (input.pressed('cancel') || input.pressed('pause')) { svc.sfx('ui_close'); this.close(null); }
  }
  render(ctx) {
    const c = this.pages[this.page];
    const k = ease.out(clamp(this.t / 0.22));
    const x = snap(W / 2 - c.width / 2 + (1 - ease.out(this.turn)) * 18 * this.dir);
    const y = snap(TOP + (BOTTOM - TOP) / 2 - c.height / 2 + (1 - k) * 30);
    // shadow + page
    dither(ctx, x + 10, y + 10, c.width, c.height, 'rgba(0,0,0,0.95)', 0.5);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * (0.5 + 0.5 * this.turn);
    ctx.drawImage(c, x, y);
    ctx.globalAlpha = a0;
    if (this.kind === 'screen') vignette(ctx, 0.3, 0.8);
    // chrome: title, page count, controls
    const fs = F.small;
    const title = (this.doc?.title || this.id || '').toUpperCase();
    fs.draw(ctx, title, 24, 16, C.textDim);
    rect(ctx, 24, 38, Math.min(400, fs.width(title)), AP, C.red);
    const n = this.pages.length;
    if (n > 1) {
      const s = `${this.page + 1} / ${n}`;
      fs.draw(ctx, s, W / 2, H - 30, C.textDim, { align: 'center' });
      if (this.page > 0) triangle(ctx, W / 2 - 60, H - 28, 5, C.textDim, 'left');
      if (this.page < n - 1) triangle(ctx, W / 2 + 50, H - 28, 5, C.text, 'right');
    }
    hints(ctx, n > 1 ? [['CLOSE', this.ui.input.keyLabel('cancel')], ['TURN', '← →']] : [['CLOSE', this.ui.input.keyLabel('cancel')]]);
  }
}
