// Props B — small things: pickup note_paper backpack decal_leaves decal_papers decal_glass
// decal_stain decal_tiles graffiti cicada_shells.
// pickup draws by item id when the engine passes one (opts.item / opts.params.item — see report);
// otherwise a neutral small object by variant. Every pickup carries a faint glint (frame-driven).
// Damage decals are empty in the clean (1979) view; graffiti too, except old carved initials.
import { K, PAL, mix, lt, dk, BRASS, CHROME, seedOf, Blob, SHADOW_SOFT, paper } from './props_b_kit.js';

const EMPTY = () => new K(1, 1, 0, 0).done({ outline: false });

/** Four-point sparkle; f = frame (0..3) → size/brightness. */
function glint(k, x, y, f) {
  const s = [1, 2, 1, 0][f % 4];
  k.P(x, y, s ? PAL.white : PAL.paper);
  if (s >= 1) { k.P(x - 1, y, 'rgba(255,248,230,0.6)'); k.P(x + 1, y, 'rgba(255,248,230,0.6)'); k.P(x, y - 1, 'rgba(255,248,230,0.6)'); k.P(x, y + 1, 'rgba(255,248,230,0.6)'); }
  if (s >= 2) { k.P(x - 2, y, 'rgba(255,248,230,0.3)'); k.P(x + 2, y, 'rgba(255,248,230,0.3)'); k.P(x, y - 2, 'rgba(255,248,230,0.3)'); k.P(x, y + 2, 'rgba(255,248,230,0.3)'); }
}

// ---------------------------------------------------------------------------- pickup
const ITEM_SHAPE = {
  battery: 'battery', keyring: 'keyring', hall_pass: 'block', red_pen: 'pen', case_key: 'key', aud_key: 'key', house_key: 'key',
  denise_photo: 'photo', diary_page: 'page', charter: 'scroll', withdrawn_stamp: 'stamp', bolt_cutters: 'cutters',
  danny_flashlight: 'flashlight', camcorder: 'camcorder', compact: 'compact', gum: 'gum', mixtape: 'tape', transfer_form: 'page',
};
function pickup(o) {
  const k = new K(20, 20, -2, -4, seedOf('pickup', o.item, o.variant, o.frame));
  const shape = ITEM_SHAPE[o.item] || ['battery', 'key', 'page', 'block'][o.variant % 4];
  k.shadowE(8, 11, 4, 1, SHADOW_SOFT);
  switch (shape) {
    case 'battery': // two D cells, copper-topped black
      for (const [x, y] of [[3, 7], [7, 8]]) { k.R(x, y, 6, 3, PAL.g1); k.H(x, y, 6, PAL.g3); k.R(x + 4, y, 2, 3, mix(PAL.orange_d, PAL.brass, 0.5)); k.P(x + 6, y + 1, PAL.g4); }
      break;
    case 'key': k.ring(5, 8, 2, 2, BRASS.md); k.H(7, 8, 6, BRASS.lt); k.P(11, 9, BRASS.md); k.P(12, 9, BRASS.dk); k.P(4, 7, BRASS.hi); break;
    case 'keyring':
      k.ring(7, 7, 3, 2, CHROME.lt); k.R(5, 9, 1, 4, BRASS.lt); k.P(5, 9, BRASS.hi); k.R(9, 9, 1, 4, CHROME.lt);
      k.R(10, 10, 4, 3, PAL.paper); k.P(11, 11, PAL.g3); break;
    case 'block': // the hall pass: a wooden brick, chewed corner
      k.R(3, 6, 10, 5, PAL.wood_l); k.H(3, 6, 10, PAL.maple); k.H(3, 10, 10, PAL.wood); k.H(4, 8, 7, PAL.wood_d); k.clear(12, 6); break;
    case 'pen': k.L(4, 10, 11, 6, PAL.red_l); k.L(4, 11, 11, 7, PAL.red); k.P(12, 6, PAL.ink); k.P(4, 10, PAL.g1); break;
    case 'photo': k.R(4, 5, 8, 7, PAL.white); k.R(5, 6, 6, 4, mix(PAL.green_d, PAL.mustard, 0.3)); k.P(7, 7, PAL.dskin); k.P(7, 8, PAL.green); break;
    case 'page': k.R(4, 5, 8, 7, PAL.paper); k.V(11, 5, 7, PAL.paper_d); for (let y = 6; y < 11; y += 2) k.H(5, y, 5, PAL.g4); break;
    case 'scroll': k.R(3, 7, 10, 4, PAL.paper); k.V(3, 6, 6, PAL.paper_d); k.V(12, 6, 6, PAL.paper_d); k.H(4, 8, 8, PAL.g4); k.P(8, 10, PAL.red); break;
    case 'stamp': k.R(5, 8, 6, 3, PAL.g2); k.R(6, 5, 4, 3, PAL.wood); k.P(6, 5, PAL.maple); k.R(11, 8, 4, 3, PAL.ink); k.H(11, 8, 4, PAL.g2); break;
    case 'cutters': k.L(2, 11, 12, 6, PAL.red_d); k.L(2, 9, 12, 7, PAL.red_d); k.R(12, 5, 3, 3, PAL.g4); break;
    case 'flashlight': k.R(3, 8, 9, 3, PAL.red); k.H(3, 8, 9, PAL.red_l); k.R(12, 7, 2, 5, PAL.g4); k.P(13, 9, PAL.yellow_l); k.R(5, 9, 4, 1, PAL.paper_d); break;
    case 'camcorder': k.R(3, 6, 10, 5, PAL.g1); k.H(3, 6, 10, PAL.g3); k.R(12, 7, 2, 3, PAL.g2); k.P(13, 8, PAL.moon); k.P(4, 7, PAL.red_l); break;
    case 'compact': k.E(8, 8, 3, 3, mix(PAL.gold, PAL.g4, 0.3)); k.E(8, 8, 2, 2, PAL.moon); k.P(7, 7, PAL.white); k.L(7, 9, 9, 7, PAL.g3); break;
    case 'gum': k.R(4, 7, 8, 3, PAL.red); k.H(4, 7, 8, PAL.red_l); k.P(6, 8, PAL.white); break;
    case 'tape': k.R(4, 6, 8, 5, PAL.g1); k.R(5, 7, 6, 2, PAL.paper); k.P(6, 8, PAL.g2); k.P(9, 8, PAL.g2); break;
    default: k.R(5, 6, 6, 5, PAL.g4);
  }
  glint(k, 12, 5, o.frame);
  return k.done();
}

// ---------------------------------------------------------------------------- note_paper
function notePaper(o) {
  const k = new K(18, 18, -1, -1, seedOf('note', o.variant, o.clean));
  const v = o.variant % 4;
  k.shadow(4, 11, 10, 1, 'rgba(6,5,10,0.25)');
  if (v === 0) { paper(k, 3, 3, 10, 9, { col: PAL.white, lines: PAL.blue_l, curl: o.clean ? 0 : 1, clean: o.clean }); k.V(5, 3, 9, mix(PAL.red_l, PAL.white, 0.5)); for (const y of [5, 9]) k.P(3, y, PAL.g2); }
  else if (v === 1) { paper(k, 2, 4, 11, 8, { col: PAL.paper, lines: PAL.g2, curl: o.clean ? 0 : 2, clean: o.clean }); }
  else if (v === 2) { paper(k, 4, 2, 8, 11, { col: mix(PAL.yellow_l, PAL.paper, 0.3), lines: PAL.blue_l, clean: o.clean }); k.H(4, 2, 8, PAL.red_d); }
  else { paper(k, 4, 5, 9, 6, { col: PAL.paper, lines: PAL.g3, clean: o.clean, lineGap: 3 }); k.V(8, 5, 6, PAL.paper_d); k.P(7, 5, PAL.white); } // folded note
  if (!o.clean && v !== 3) k.P(10, 8, 'rgba(110,80,40,0.45)'); // a water spot
  return k.done();
}

// ---------------------------------------------------------------------------- backpack (Danny's JanSport)
function backpack(o) {
  const k = new K(20, 22, -2, -8, seedOf('pack', o.variant));
  k.shadowE(8, 12, 7, 2, SHADOW_SOFT);
  const b = new Blob(k.w, k.h, k.ox, k.oy);
  b.E(8, 4, 7, 6, 0, 1);          // main body, slumped
  b.R(3, 5, 10, 6, 0, 1);
  b.E(8, 7, 4, 3, 0, 2);          // front pocket
  const blk = [PAL.ink, PAL.night, PAL.shadow, PAL.g1, PAL.g2, PAL.g3];
  b.render(k, [blk], { reach: 4, vw: 0.7, edge: 0.5, rim: 0.4, dither: false });
  // suede bottom patch, zippers + pulls, a flopped strap, Krimpets wrapper poking out
  k.R(3, 9, 10, 2, mix(PAL.brown, PAL.tan, 0.3)); k.H(3, 9, 10, PAL.tan);
  k.H(4, 1, 8, PAL.g3); k.P(12, 1, CHROME.hi); k.P(12, 2, CHROME.md);
  k.H(6, 5, 5, PAL.g3); k.P(11, 6, CHROME.hi);
  k.L(1, 3, -1, 10, PAL.g2); k.L(2, 3, 0, 10, PAL.g1);
  k.R(9, -2, 3, 2, PAL.yellow); k.P(9, -2, PAL.yellow_l); k.P(11, -1, PAL.orange_d);
  return k.done();
}

// ---------------------------------------------------------------------------- decals
function leaves(o) {
  if (o.clean) return EMPTY();
  const k = new K(20, 20, -2, -2, seedOf('leaves', o.variant));
  const r = k.r;
  const cols = [PAL.brown, PAL.rust, mix(PAL.mustard, PAL.brown, 0.4), PAL.brown_d, mix(PAL.tan, PAL.g3, 0.3)];
  const cx = 4 + (o.variant % 3) * 4, cy = 6 + (o.variant % 2) * 4;
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 9;
    const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 0.7);
    const c = cols[Math.floor(r() * cols.length)];
    // a leaf: 3×2 with a dark midrib pixel, some curled (lit edge)
    k.H(x, y, 3, c); k.P(x + 1, y + 1, c); k.P(x + 1, y, dk(c, 0.35));
    if (r() < 0.35) k.P(x, y - 1, lt(c, 0.25));
  }
  return k.done({ outline: false });
}
function papers(o) {
  if (o.clean) return EMPTY();
  const k = new K(24, 22, -4, -3, seedOf('papers', o.variant));
  const sheets = [[-2, 1, 9, 7, 0], [6, 4, 8, 10, 1], [2, 10, 10, 6, 2], [11, -1, 7, 8, 0]];
  for (let i = 0; i < 3 + (o.variant % 2); i++) {
    const [x, y, w, h, c] = sheets[(i + o.variant) % 4];
    paper(k, x, y, w, h, { col: [PAL.white, PAL.paper, mix(PAL.yellow_l, PAL.paper, 0.4)][c], lines: PAL.g3, curl: i % 3, clean: false });
    k.H(x, y + h, w, 'rgba(6,5,10,0.35)');
  }
  k.E(9, 9, 2, 3, 'rgba(30,25,20,0.35)'); // a scuffed bootprint
  return k.done({ outline: false });
}
function glass(o) {
  if (o.clean) return EMPTY();
  const k = new K(18, 18, -1, -1, seedOf('glass', o.variant));
  const r = k.r;
  for (let i = 0; i < 9; i++) {
    const x = 1 + Math.floor(r() * 13), y = 2 + Math.floor(r() * 11), s = 1 + Math.floor(r() * 3);
    k.poly([[x, y], [x + s + 1, y + 1], [x + 1, y + s]], 'rgba(151,175,203,0.35)');
    k.P(x, y, 'rgba(240,244,250,0.85)');
    if (r() < 0.4) k.P(x + 1, y + 1, 'rgba(196,212,230,0.6)');
  }
  return k.done({ outline: false });
}
function stain(o) {
  if (o.clean) return EMPTY();
  const k = new K(22, 20, -3, -2, seedOf('stain', o.variant));
  // tide-lined water stain with a mold bloom (low-frequency blob, dithered)
  const cx = 8, cy = 8;
  for (let y = -2; y < 18; y++) for (let x = -3; x < 19; x++) {
    const d = Math.sqrt(((x - cx) ** 2) / 70 + ((y - cy) ** 2) / 40) + Math.sin(x * 0.8 + o.variant) * 0.08 + Math.cos(y * 0.9) * 0.08;
    if (d < 0.6) k.P(x, y, 'rgba(18,14,10,0.3)');
    else if (d < 0.88) k.P(x, y, 'rgba(18,14,10,0.2)');
    else if (d < 1.0) k.P(x, y, 'rgba(60,45,25,0.4)'); // tide line
  }
  for (const [x, y] of [[5, 6], [6, 7], [10, 9], [11, 8], [7, 11], [12, 5]]) k.P(x, y, 'rgba(24,36,28,0.75)');
  k.P(6, 6, 'rgba(147,171,142,0.5)');
  return k.done({ outline: false });
}
function tiles(o) {
  if (o.clean) return EMPTY();
  const k = new K(24, 20, -4, -2, seedOf('ctiles', o.variant));
  const T = { lt: mix(PAL.cream_l, PAL.g5, 0.3), md: mix(PAL.cream, PAL.g4, 0.4), dk: mix(PAL.cream_d, PAL.g3, 0.4) };
  const piece = (pts, stained) => {
    k.poly(pts, T.md);
    const [x0, y0] = pts[0]; k.L(x0, y0, pts[1][0], pts[1][1], T.lt);
    for (let i = 0; i < 8; i++) { const p = pts[i % pts.length]; k.P(Math.round((p[0] + pts[2][0]) / 2) + (i % 3), Math.round((p[1] + pts[2][1]) / 2) + (i % 2), T.dk); }
    if (stained) k.P(pts[2][0] - 2, pts[2][1] - 2, 'rgba(110,80,40,0.6)');
  };
  piece([[-2, 2], [9, 0], [10, 9], [-1, 10]], true);
  piece([[8, 6], [17, 7], [15, 14], [7, 13]], false);
  if (o.variant % 2) piece([[12, -1], [18, 1], [16, 5]], false);
  // crumbs, the metal grid strip that came down with it, dust
  k.L(-3, 13, 12, 16, PAL.g4); k.P(12, 16, PAL.g5);
  k.S(-4, -2, 24, 20, 'rgba(196,183,140,0.45)', 0.05);
  return k.done({ outline: false });
}
function cicadaShells(o) {
  const k = new K(20, 18, -2, -2, seedOf('cicada', o.variant));
  const r = k.r;
  const n = 4 + (o.variant % 4);
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 9);
    const flip = r() < 0.5;
    // a shed nymph skin: head, split back, hooked forelegs
    k.R(x, y, 3, 2, PAL.amber); k.P(x + (flip ? 2 : 0), y, PAL.amber_l); k.P(x + 1, y, PAL.amber_d);
    k.P(x + (flip ? -1 : 3), y, PAL.amber_d);
    k.P(x, y + 2, 'rgba(107,74,28,0.85)'); k.P(x + 2, y + 2, 'rgba(107,74,28,0.85)');
    k.P(x + 1, y - 1, 'rgba(240,207,140,0.7)');
  }
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- graffiti (wall)
/** Hand-sprayed letters: 3×5 glyphs drawn 2× tall, light fill with a dark outline (reads on
 *  brick and on cream paint alike), jittered strokes, overspray and drips. */
function spray(k, x, y, text, col, { tall = 2, drip = 0.35, seed = 1, outline = 'rgba(14,12,16,0.85)' } = {}) {
  const tmp = new K(text.length * 4 + 2, 6, 0, 0);
  tmp.text(0, 0, text, '#ffffff');
  const d = tmp.x.getImageData(0, 0, tmp.w, tmp.h).data;
  const L = new K(k.w, k.h, k.ox, k.oy);
  let h = seed;
  for (let j = 0; j < 5; j++) for (let i = 0; i < tmp.w; i++) {
    if (!d[(j * tmp.w + i) * 4 + 3]) continue;
    h = (h * 1103515245 + 12345) >>> 0;
    const jit = (h >>> 16) % 7 === 0 ? 1 : 0;
    for (let t = 0; t < tall; t++) L.P(x + i + (j > 2 ? jit : 0), y + j * tall + t, '#ffffff');
    if (j === 4 && ((h >>> 8) % 100) / 100 < drip) for (let t = 0; t < 2 + ((h >>> 4) % 4); t++) L.P(x + i, y + 10 + t, '#ffffff');
  }
  // colourise + outline on a scratch layer, then lay it on the wall
  L.pixels(() => rgbaArr(col));
  if (outline) L.outline(outline, outline);
  k.blit(L, L.ox, L.oy);
}
const rgbaArr = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], Math.round((p[3] ?? 1) * 255)]; };
function graffiti(o) {
  const st = o.state;
  if (o.clean && st !== 'names') return EMPTY();
  const k = new K(52, 30, 0, -14, seedOf('graffiti', st, o.variant, o.clean));
  const black = 'rgba(14,12,16,0.82)', red = 'rgba(122,30,32,0.8)', white = 'rgba(214,208,192,0.7)';
  if (st === 'hollowhell') {
    spray(k, 1, -12, 'HOLLOW', white, { seed: 3 });
    spray(k, 9, 0, 'HELL', 'rgba(150,40,38,0.9)', { seed: 7, drip: 0.5 });
    k.L(1, 13, 30, 12, black); // underline swoosh
  } else if (st === 'kr91') {
    spray(k, 2, -6, "KR '91", 'rgba(196,183,140,0.85)', { seed: 5 });
    k.ring(13, 0, 13, 8, 'rgba(214,208,192,0.35)');
  } else if (st === 'pentagram') {
    const cx = 14, cy = 0, R = 11;
    const pts = [0, 1, 2, 3, 4].map((i) => [Math.round(cx + Math.sin((i * 4 * Math.PI) / 5) * R), Math.round(cy - Math.cos((i * 4 * Math.PI) / 5) * R * 0.95)]);
    for (let i = 0; i < 5; i++) { const [a, b] = [pts[i], pts[(i + 1) % 5]]; k.L(a[0], a[1], b[0] + (i === 2 ? 2 : 0), b[1], red); }
    k.ring(cx, cy, R + 1, R, red);  // badly drawn: the star misses the circle on one side
    k.drip(cx - 6, cy + 8, 4, red); k.drip(cx + 9, cy + 4, 3, red);
  } else if (st === 'names') {
    // marker names and carved initials, layered over decades (1979 shows only the old carving)
    if (!o.clean) {
      k.text(1, -12, 'DK+LB', 'rgba(40,40,70,0.75)');
      k.text(24, -9, "MIKE C '88", black);
      k.text(4, -2, 'STACY', 'rgba(122,30,32,0.7)');
      k.L(4, 4, 22, 3, 'rgba(122,30,32,0.5)');
      k.text(28, 2, 'TJ', 'rgba(20,20,24,0.8)');
    }
    // carved into the paint (pale where the knife went through)
    k.text(8, 7, 'RO 79', o.clean ? 'rgba(220,214,196,0.5)' : 'rgba(220,214,196,0.7)');
  } else if (st === 'present') {
    // scratched into the paint, rows of it, as if by a fingernail — the school writing
    const scr = 'rgba(205,196,170,0.75)', scr2 = 'rgba(30,22,18,0.6)';
    for (let r = 0; r < 4; r++) {
      const y = -12 + r * 6, x0 = 1 + (r % 2) * 3;
      k.text(x0, y, 'PRESENT', scr);
      k.text(x0 + 1, y + 1, 'PRESENT', scr2);
      k.text(x0, y, 'PRESENT', scr);
    }
  }
  return k.done({ outline: false });
}

export const MISC = {
  pickup: { build: pickup, variants: 4, item: true, frames: 4, fps: 3, noClean: true, showVariants: [0, 1, 2, 3] },
  note_paper: { build: notePaper, variants: 4, showVariants: [0, 1, 2, 3] },
  backpack: { build: backpack, noClean: true },
  decal_leaves: { build: leaves, variants: 6, showVariants: [0, 1] },
  decal_papers: { build: papers, variants: 4, showVariants: [0, 1] },
  decal_glass: { build: glass, variants: 4 },
  decal_stain: { build: stain, variants: 3, showVariants: [0, 1] },
  decal_tiles: { build: tiles, variants: 2, showVariants: [0, 1] },
  graffiti: { build: graffiti },
  cicada_shells: { build: cicadaShells, variants: 4, showVariants: [0, 3] },
};
