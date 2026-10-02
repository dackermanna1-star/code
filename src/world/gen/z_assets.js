// Shared textures, materials and props for the maintenance / lobby zone types.
// Everything registered here is prefixed z_ to stay clear of other modules.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise, pfbm } from '../../gfx/texgen.js';
import { defineMaterial, M } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as glow, propWithXf as withXf, PROP_FIT as FIT } from '../props.js';
import { xfRotY, xfTranslate, xfMul } from '../../core/math.js';

const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ================================================================== textures: tunnels
// Painted concrete wall. The image bottom sits on the floor (sv = 3 m == one tile): a dado band
// of faded green paint up to ~1.3 m, bare board-formed concrete above it.
defineTexture('z_wall_band', (p, r) => {
  const BAND = 36;
  p.fill([150, 146, 138]);
  p.noise(3, 0.07, 3);
  p.map((x, y, c) => {
    if (y < BAND) return c;
    const m = 1 + (pfbm(x, y, 4, 2, p.seed + 5) - 0.5) * 0.16;
    const base = [92, 112, 99];
    return [base[0] * m, base[1] * m, base[2] * m];
  });
  p.rect(0, 0, 1, BAND, [116, 112, 106], 0.55);
  p.rect(32, 0, 1, BAND, [116, 112, 106], 0.55);
  for (const x of [10, 26, 42, 58]) for (const y of [9, 24]) p.rect(x, y, 2, 2, [88, 84, 78], 0.8);
  p.rect(0, BAND - 1, 64, 1, [62, 72, 64]);
  p.rect(0, BAND, 64, 1, [118, 138, 124], 0.5);
  for (let k = 0; k < 7; k++) p.drip(r.int(0, 63), r.int(0, 14), r.int(10, 30), [84, 78, 70], r.range(0.16, 0.3), 1);
  for (let k = 0; k < 5; k++) p.drip(r.int(0, 63), BAND + 1, r.int(6, 22), [58, 52, 44], r.range(0.2, 0.34), 1);
  for (let k = 0; k < 70; k++) {
    const x = r.int(0, 63), y = r.int(BAND + 8, 63);
    p.rect(x, y, r.int(1, 2), 1, [60, 70, 62], r.range(0.2, 0.5));
  }
  p.grain(0.03);
}, 16);

// Board-formed concrete ceiling: plank marks, joints, a few dark water stains.
defineTexture('z_ceil_conc', (p, r) => {
  p.fill([122, 118, 110]);
  p.noise(3, 0.08, 3);
  for (let y = 0; y < 64; y += 8) {
    p.shade(0, y + 1, 64, 7, (y / 8) % 2 ? -0.05 : 0.04);
    p.rect(0, y, 64, 1, [86, 82, 76], 0.75);
    p.rect(r.int(0, 63), y + 1, 1, 7, [92, 88, 82], 0.6);
  }
  for (let k = 0; k < 3; k++) p.stain(r.int(0, 63), r.int(0, 63), r.range(5, 9), [78, 70, 60], 0.45);
  p.speckle(40, [70, 66, 60], 0.3, 0.6);
  p.grain(0.03);
}, 12);

// ------------------------------------------------------------------ stencils / decals (alpha)
// painted lettering with chipped paint; lines are centred in the tile
function stencil(lines, col, scale = 1, chip = 0.1) {
  return (p, r) => {
    p.fill(col);
    p.clearAlpha(0);
    const lh = 9 * scale, y0 = Math.round(32 - (lines.length * lh) / 2) + 1;
    lines.forEach((ln, i) => {
      const w = ln.length * 6 * scale - scale;
      p.textA(ln, Math.round(32 - w / 2), y0 + i * lh, 235, scale);
    });
    for (let k = 0; k < 64 * 64; k++) {
      if (p.a[k] > 0 && r.chance(chip)) p.a[k] = 0;
    }
    p.noise(4, 0.1, 2);
  };
}
defineTexture('z_sten_b14', stencil(['B-14'], [222, 212, 150], 2), 4);
defineTexture('z_sten_steam', stencil(['STEAM'], [226, 224, 214], 1), 4);
defineTexture('z_sten_cond', stencil(['COND.', 'RETURN'], [226, 224, 214], 1), 4);
defineTexture('z_sten_h2o', stencil(['H2O', 'COLD'], [190, 214, 232], 1), 4);
defineTexture('z_sten_elec', stencil(['ELEC.', 'ONLY'], [226, 196, 60], 1), 4);
defineTexture('z_sten_noentry', stencil(['NO', 'ENTRY'], [214, 70, 56], 2), 4);
defineTexture('z_sten_p3', stencil(['P-3'], [226, 224, 214], 2), 4);
defineTexture('z_sten_v12', stencil(['VALVE', 'V-12'], [226, 196, 60], 1), 4);
defineTexture('z_sten_head', stencil(['MIND', 'YOUR', 'HEAD'], [226, 196, 60], 1), 4);
// painted arrows
function arrowTex(dir, col) {
  return (p, r) => {
    p.fill(col);
    p.clearAlpha(0);
    const put = (x, y) => p.alpha(dir > 0 ? x : 63 - x, y, 235);
    for (let x = 8; x <= 52; x++) for (let y = 30; y <= 33; y++) put(x, y);
    for (let k = 0; k < 15; k++) for (let t = 0; t < 3; t++) { put(54 - k - t, 32 - k); put(54 - k - t, 32 + k); }
    for (let k = 0; k < 64 * 64; k++) if (p.a[k] > 0 && r.chance(0.1)) p.a[k] = 0;
    p.noise(4, 0.1, 2);
  };
}
defineTexture('z_sten_arrow_r', arrowTex(1, [226, 196, 60]), 4);
defineTexture('z_sten_arrow_l', arrowTex(-1, [226, 196, 60]), 4);

// round steel access cover set in the floor
defineTexture('z_manhole', (p, r) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (d > 29) continue;
    p.alpha(x, y, 255);
    let c = d > 26 ? [52, 50, 46] : [78, 76, 72];
    if (d <= 26 && d > 24) c = [96, 94, 90];
    if (d <= 24 && (((x + y) & 7) < 2 || ((x - y + 64) & 7) < 2)) c = [62, 60, 56];
    p.set(x, y, c);
  }
  p.rect(26, 29, 12, 3, [40, 38, 36]);
  p.speckle(30, [110, 70, 40], 0.3, 0.6);
}, 8);
// small floor drain
defineTexture('z_drain', (p) => {
  p.clearAlpha(0);
  p.rect(14, 14, 36, 36, [92, 92, 94]); p.rectA(14, 14, 36, 36, 255);
  p.frame(14, 14, 36, 36, [100, 98, 94]);
  for (let x = 18; x < 48; x += 4) p.rect(x, 18, 2, 28, [30, 30, 34]);
}, 6);
// ceiling hatch (seen from below)
defineTexture('z_hatch', (p, r) => {
  p.fill([112, 116, 118]);
  p.noise(3, 0.06, 2);
  p.frame(0, 0, 64, 64, [60, 62, 64]);
  p.frame(3, 3, 58, 58, [84, 86, 88]);
  p.rect(10, 10, 44, 44, [102, 106, 108]);
  p.frame(10, 10, 44, 44, [74, 76, 78]);
  p.ring(32, 32, 6, 2, [50, 50, 52]);
  p.disc(32, 32, 3, [150, 120, 70]);
  for (const [x, y] of [[6, 6], [57, 6], [6, 57], [57, 57]]) p.disc(x, y, 2, [60, 60, 62]);
  for (let k = 0; k < 4; k++) p.drip(r.int(8, 56), 4, r.int(10, 30), [120, 70, 40], 0.3, 2);
  p.grain(0.03);
}, 12);
// wall streaks: wet dark water runs, and rust runs
defineTexture('z_streak', (p, r) => {
  p.clearAlpha(0);
  p.fill([54, 46, 38]);
  for (let k = 0; k < 6; k++) {
    let x = r.int(6, 58);
    const y0 = r.int(0, 18), len = r.int(24, 60), w = r.int(1, 3);
    for (let y = y0; y < y0 + len && y < 64; y++) {
      const f = 1 - (y - y0) / len;
      for (let xx = -1; xx <= w; xx++) {
        const q = p.i(x + xx, y);
        const core = xx >= 0 && xx < w;
        p.a[q] = Math.max(p.a[q], core ? 255 * (0.55 + 0.45 * f) : 150 * f);
      }
      if (r.chance(0.12)) x += r.sign();
    }
  }
}, 4);
defineTexture('z_rust', (p, r) => {
  p.clearAlpha(0);
  p.fill([142, 74, 38]);
  for (let k = 0; k < 6; k++) {
    let x = r.int(6, 58);
    const y0 = r.int(0, 14), len = r.int(20, 56), w = r.int(1, 3), a = r.range(130, 210);
    for (let y = y0; y < y0 + len && y < 64; y++) {
      const f = 1 - (y - y0) / len;
      for (let xx = 0; xx < w; xx++) { const q = p.i(x + xx, y); p.a[q] = Math.max(p.a[q], a * (0.3 + 0.7 * f)); }
      if (r.chance(0.15)) x += r.sign();
    }
  }
  p.noise(4, 0.2, 2);
}, 6);
// machine room control panel: dials, lamps, switches
defineTexture('z_controls', (p, r) => {
  p.fill([108, 116, 112]);
  p.noise(3, 0.05, 2);
  p.frame(0, 0, 64, 64, [70, 76, 72]);
  p.bevel(1, 1, 62, 62, 0.12, 0.2);
  for (let k = 0; k < 3; k++) {
    const cx = 13 + k * 19;
    p.disc(cx, 16, 8, [30, 30, 32]); p.disc(cx, 16, 6.5, [226, 224, 212]);
    const a = r.range(-1.2, 1.2);
    p.line(cx, 16, cx + Math.sin(a) * 5, 16 - Math.cos(a) * 5, [170, 30, 26]);
    p.rect(cx - 5, 27, 10, 1, [60, 60, 60]);
  }
  for (let k = 0; k < 8; k++) {
    const lit = r.chance(0.4);
    p.disc(8 + k * 7, 38, 2.2, lit ? (k % 3 === 0 ? [240, 70, 50] : [90, 220, 100]) : [48, 52, 50]);
  }
  for (let k = 0; k < 5; k++) { p.rect(8 + k * 11, 47, 4, 8, [34, 34, 36]); p.rect(9 + k * 11, r.chance(0.5) ? 48 : 52, 2, 3, [212, 210, 200]); }
  p.rect(4, 59, 28, 2, [226, 224, 214], 0.8);
}, 16);
// pipe schematic poster
defineTexture('z_schematic', (p, r) => {
  p.fill([206, 208, 200]);
  p.noise(4, 0.04, 2);
  p.frame(0, 0, 64, 64, [140, 142, 136]);
  const c = [48, 70, 130], d = [160, 50, 40];
  p.line(8, 14, 56, 14, c); p.line(8, 15, 56, 15, c);
  p.line(8, 30, 40, 30, d); p.line(40, 30, 40, 50, d);
  p.line(8, 46, 30, 46, c); p.line(30, 46, 30, 14, c);
  for (const [x, y] of [[20, 14], [40, 30], [30, 38], [48, 14]]) { p.rect(x - 2, y - 2, 5, 5, [220, 220, 210]); p.frame(x - 2, y - 2, 5, 5, [40, 40, 44]); }
  p.disc(52, 46, 6, [220, 220, 210]); p.ring(52, 46, 6, 1, [40, 40, 44]);
  p.rect(6, 56, 30, 1, [90, 90, 90]); p.rect(6, 58, 20, 1, [90, 90, 90]);
  p.speckle(18, [120, 118, 110], 0.3, 0.5);
}, 16);

// ================================================================== textures: public interiors
// large chequerboard of cream and dark green veined marble
defineTexture('z_marble_check', (p, r) => {
  const A = [218, 212, 196], B = [54, 70, 60];
  p.map((x, y) => {
    const t = ((x >> 5) + (y >> 5)) & 1;
    const n = Math.abs(pfbm(x, y, 3, 3, p.seed) - 0.5);
    const vein = n < 0.035 ? 1 - n / 0.035 : 0;
    const base = mix(t ? B : A, t ? [40, 52, 46] : [206, 198, 180], pnoise(x, y, 6, p.seed + 9));
    const c = mix(base, t ? [124, 140, 130] : [150, 142, 126], vein * 0.75);
    if ((x & 31) === 0 || (y & 31) === 0) return [158, 154, 142];
    if ((x & 31) === 1 || (y & 31) === 1) return mulc(c, 1.08);
    return c;
  });
  p.grain(0.03);
}, 16);
// ashlar limestone cladding: four courses, joints offset
defineTexture('z_stone', (p, r) => {
  const base = [200, 190, 168];
  for (let row = 0; row < 4; row++) {
    const y0 = row * 16, off = (row % 2) * 16;
    for (const bx of [0, 32]) {
      const tone = r.range(0.92, 1.05);
      p.rect(bx + off, y0, 32, 16, mulc(base, tone));
      p.rect(bx + off, y0, 1, 16, [128, 120, 104]);
      p.rect(bx + off, y0, 32, 1, [136, 128, 112]);
      p.rect(bx + off + 1, y0 + 1, 31, 1, mulc(base, tone * 1.07), 0.7);
    }
  }
  p.noise(5, 0.06, 3);
  p.speckle(120, [150, 140, 120], 0.25, 0.6);
  p.grain(0.025);
}, 16);
// corporate lobby carpet: navy with a pale diamond lattice
defineTexture('z_carpet_lobby', (p, r) => {
  p.fill([40, 48, 84]);
  p.noise(2, 0.06, 2);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if ((x + y) % 32 === 0 || (x - y + 64) % 32 === 0) p.set(x, y, [74, 76, 112]);
  }
  for (const cx of [16, 48]) for (const cy of [16, 48]) {
    p.set(cx, cy, [150, 126, 76]); p.set(cx + 1, cy, [150, 126, 76], 0.7); p.set(cx - 1, cy, [150, 126, 76], 0.7); p.set(cx, cy + 1, [150, 126, 76], 0.7); p.set(cx, cy - 1, [150, 126, 76], 0.7);
  }
  p.grain(0.07);
}, 16);
// conference carpet: grey-teal tweed
defineTexture('z_carpet_conf', (p, r) => {
  p.fill([84, 96, 98]);
  p.noise(2, 0.07, 3);
  p.speckle(260, [58, 68, 72], 0.35, 0.8);
  p.speckle(160, [124, 136, 136], 0.25, 0.6);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) p.set(x + 4, y + 4, [70, 82, 86], 0.6);
  p.grain(0.05);
}, 16);
// coffered plaster ceiling
defineTexture('z_ceil_coffer', (p, r) => {
  p.fill([208, 204, 192]);
  p.noise(3, 0.04, 2);
  p.rect(7, 7, 50, 50, [194, 190, 178]);
  p.shade(7, 7, 50, 1, -0.15); p.shade(7, 7, 1, 50, -0.15);
  p.shade(7, 56, 50, 1, 0.1); p.shade(56, 7, 1, 50, 0.1);
  p.frame(4, 4, 56, 56, [172, 168, 156], 0.8);
  p.stain(r.int(6, 58), r.int(6, 58), r.range(4, 8), [160, 140, 100], 0.3);
  p.grain(0.025);
}, 12);
// blank projection screen
defineTexture('z_screen', (p, r) => {
  p.fill([228, 230, 224]);
  p.map((x, y, c) => mulc(c, 0.9 + 0.1 * Math.sin((x / 64) * Math.PI) * Math.sin(((y + 8) / 80) * Math.PI)));
  for (let k = 0; k < 4; k++) p.rect(0, r.int(6, 58), 64, 1, [208, 210, 204], 0.5);
  p.rect(0, 0, 64, 3, [24, 24, 26]); p.rect(0, 61, 64, 3, [24, 24, 26]);
  p.rect(0, 0, 3, 64, [24, 24, 26]); p.rect(61, 0, 3, 64, [24, 24, 26]);
  p.grain(0.02);
}, 8);
// elevator floor indicator, dark
defineTexture('z_floor_ind', (p) => {
  p.fill([34, 20, 10]);
  p.text('--', 10, 22, [255, 170, 60], 4);
  p.frame(0, 0, 64, 64, [150, 150, 154]);
  p.frame(1, 1, 62, 62, [90, 90, 94]);
}, 8);
// building directory board
defineTexture('z_dir_board', (p, r) => {
  p.fill([32, 56, 46]);
  p.noise(2, 0.06, 2);
  p.grain(0.05);
  const w = [236, 232, 214];
  p.text('DIRECTORY', 5, 4, [226, 196, 110]);
  p.rect(4, 13, 56, 1, [226, 196, 110], 0.8);
  const rows = ['1 LOBBY', '2 ACCTS', '3 LEGAL', '4 FILES', 'B1 PLANT'];
  rows.forEach((s, i) => p.text(s, 6, 17 + i * 9, w));
  p.frame(0, 0, 64, 64, [186, 150, 70]);
  p.frame(1, 1, 62, 62, [110, 84, 40]);
}, 12);
// paper sign taped to a door
defineTexture('z_oos', (p, r) => {
  p.fill([236, 234, 226]);
  p.clearAlpha(0);
  p.rectA(12, 8, 40, 48, 255);
  p.rect(12, 8, 40, 48, [236, 234, 226]);
  p.frame(12, 8, 40, 48, [196, 194, 184]);
  p.text('OUT', 15, 14, [190, 36, 34], 2);
  p.text('OF', 21, 28, [190, 36, 34], 2);
  p.text('ORDER', 18, 44, [190, 36, 34]);
  p.rect(12, 6, 8, 3, [210, 190, 130], 0.8); p.rectA(12, 6, 8, 3, 255);
  p.rect(44, 6, 8, 3, [210, 190, 130], 0.8); p.rectA(44, 6, 8, 3, 255);
  p.speckle(30, [180, 176, 166], 0.2, 0.5);
}, 8);
// small paper notices
defineTexture('z_poster_forms', (p) => {
  p.fill([226, 222, 206]);
  p.rect(0, 0, 64, 16, [40, 70, 120]);
  p.text('FORMS', 17, 4, [236, 236, 230]);
  p.text('HAVE YOUR', 7, 22, [60, 60, 66]);
  p.text('DOCUMENTS', 7, 32, [60, 60, 66]);
  p.text('READY', 17, 42, [60, 60, 66]);
  p.rect(8, 54, 48, 1, [150, 148, 140]);
  p.frame(0, 0, 64, 64, [150, 146, 134]);
}, 12);
defineTexture('z_poster_quiet', (p) => {
  p.fill([236, 234, 226]);
  p.text('QUIET', 17, 12, [40, 40, 44], 1);
  p.text('PLEASE', 14, 24, [40, 40, 44], 1);
  p.disc(32, 46, 9, [200, 40, 40]);
  p.disc(32, 46, 6, [236, 234, 226]);
  p.line(26, 52, 38, 40, [200, 40, 40]); p.line(27, 52, 39, 40, [200, 40, 40]);
  p.frame(0, 0, 64, 64, [170, 168, 158]);
}, 8);
defineTexture('z_now_serving', (p) => {
  p.fill([10, 8, 8]);
  p.text('NOW', 4, 6, [210, 60, 40]);
  p.text('SERVING', 4, 15, [210, 60, 40]);
  p.text('0', 14, 30, [255, 70, 40], 4);
  p.text('4', 40, 30, [255, 70, 40], 4);
  p.frame(0, 0, 64, 64, [70, 70, 72]);
}, 8);
// seat cushion for rows of conference chairs: gap lines at both edges so a long strip reads as seats
defineTexture('z_seat', (p, r) => {
  p.fill([74, 90, 124]);
  p.noise(2, 0.06, 2);
  p.grain(0.07);
  p.shade(0, 0, 64, 4, 0.1);
  p.shade(0, 56, 64, 8, -0.12);
  p.rect(0, 0, 3, 64, [24, 28, 40]);
  p.rect(61, 0, 3, 64, [24, 28, 40]);
  p.shade(3, 0, 3, 64, 0.08); p.shade(58, 0, 3, 64, -0.1);
}, 12);

// ================================================================== materials
defineMaterial('z_wall_band', 'z_wall_band', { su: 2.0, sv: 3.0, surf: 'concrete', stain: 0.1 });
defineMaterial('z_ceil_conc', 'z_ceil_conc', { s: 2.5, surf: 'concrete', stain: 0.08 });
defineMaterial('z_marble_check', 'z_marble_check', { s: 2.0, surf: 'tile' });
defineMaterial('z_stone', 'z_stone', { su: 2.0, sv: 1.6, surf: 'tile', stain: 0.06 });
defineMaterial('z_carpet_lobby', 'z_carpet_lobby', { s: 1.6, surf: 'carpet', stain: 0.1 });
defineMaterial('z_carpet_conf', 'z_carpet_conf', { s: 1.4, surf: 'carpet', stain: 0.1 });
defineMaterial('z_ceil_coffer', 'z_ceil_coffer', { s: 2.0, surf: 'drywall', stain: 0.05 });

// ================================================================== props
// A ganged row of padded chairs (conference / auditorium): one strip of cushions, one of backs.
// opts: n (seats), tint, back (backrest height). Faces local -z; centred on x.
defineProp('z_audrow', {
  build(mb, p) {
    const n = p.opts.n || 6, Wd = 0.52, Hb = p.opts.back || 0.46;
    const tint = p.opts.tint || null;
    const seat = T('z_seat', tint ? { tint } : undefined), fr = S('metal_dark'), blk = S('plastic_black');
    const x0 = (-n * Wd) / 2, x1 = (n * Wd) / 2;
    const top = ['world', 'world', [0, 0, n, 1], 'world', 'world', [0, 0, n, 1]];
    // cushion, backrest
    mb.box(x0, 0.4, -0.25, x1, 0.47, 0.19, [fr, fr, seat, null, seat, seat], { uv: top });
    mb.box(x0, 0.5, 0.17, x1, 0.5 + Hb, 0.24, [blk, blk, blk, null, seat, seat], { uv: ['world', 'world', 'world', 'world', [0, 0, n, 1], [0, 0, n, 1]] });
    // linking beam + legs every three seats
    mb.box(x0, 0.3, -0.02, x1, 0.34, 0.04, fr, { skip: 8 });
    const legs = Math.max(2, Math.ceil(n / 3) + 1);
    for (let k = 0; k < legs; k++) {
      const lx = x0 + 0.04 + ((x1 - x0 - 0.08) * k) / (legs - 1);
      mb.box(lx - 0.02, 0, -0.2, lx + 0.02, 0.4, 0.2, fr, { skip: 8 });
      mb.box(lx - 0.02, 0.4, 0.17, lx + 0.02, 0.5, 0.2, fr, { skip: 8 });
    }
  },
  boxes: (p) => { const n = p.opts.n || 6; return [[(-n * 0.52) / 2, 0, -0.26, (n * 0.52) / 2, 0.95, 0.26]]; },
});

// Dry decorative fountain: octagonal stone basin with a pedestal bowl; nothing in it but dust.
defineProp('z_fountain', {
  build(mb, p) {
    const R = p.opts.r || 1.5, st = S('z_stone'), dk = S('concrete_dark'), dust = S('concrete_floor');
    const t = 0.26, H = 0.56, N = 8;
    const side = 2 * R * Math.tan(Math.PI / N);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + Math.PI / N;
      withXf(mb, xfMul(xfRotY(a), xfTranslate(0, 0, -(R - t / 2))), () => mb.box(-side / 2 - 0.02, 0, -t / 2, side / 2 + 0.02, H, t / 2, st));
    }
    mb.cyl(0, 0.1, 0, R - t * 0.7, 0.04, N, dust, 1, null, Math.PI / N);
    // pedestal
    mb.cyl(0, 0.14, 0, 0.34, 0.5, 8, st, 0);
    mb.cyl(0, 0.64, 0, 0.18, 0.7, 8, st, 0);
    mb.cyl(0, 1.3, 0, 0.62, 0.16, 8, st, 2);
    mb.cyl(0, 1.44, 0, 0.5, 0.1, 8, dk, 1);
    mb.cyl(0, 1.54, 0, 0.1, 0.34, 6, st, 1);
  },
  boxes: (p) => { const R = (p.opts.r || 1.5) * 0.92; return [[-R, 0, -R * 0.42, R, 0.58, R * 0.42], [-R * 0.42, 0, -R, R * 0.42, 0.58, R], [-0.5, 0, -0.5, 0.5, 1.7, 0.5]]; },
});

// Low stone planter with a bare shrub. opts: len (m)
defineProp('z_planter', {
  build(mb, p, r) {
    const L = p.opts.len || 1.4, D = 0.6, st = S('z_stone'), soil = S('dark');
    mb.box(-L / 2, 0, -D / 2, L / 2, 0.44, D / 2, st);
    mb.box(-L / 2 - 0.03, 0.44, -D / 2 - 0.03, L / 2 + 0.03, 0.5, D / 2 + 0.03, st);
    mb.box(-L / 2 + 0.05, 0.5, -D / 2 + 0.05, L / 2 - 0.05, 0.505, D / 2 - 0.05, soil, { skip: 8 });
    const wood = S('wood_dark'), lv = T('leaves_dead', { lit: true });
    const nB = Math.max(2, Math.round(L / 0.5));
    for (let k = 0; k < nB; k++) {
      const bx = -L / 2 + 0.25 + ((L - 0.5) * (k + r.range(0.2, 0.8))) / nB;
      const h = r.range(0.7, 1.4);
      mb.rod(bx, 0.5, r.range(-0.1, 0.1), bx + r.range(-0.2, 0.2), 0.5 + h, r.range(-0.15, 0.15), 0.014, 4, wood);
      const c = 0.28, ang = r.range(0, 3.14), cx = Math.cos(ang) * c, sx = Math.sin(ang) * c, y0 = 0.5 + h * 0.55;
      mb.card([bx - cx, y0, -sx, bx + cx, y0, sx, bx + cx, y0 + h * 0.45, sx, bx - cx, y0 + h * 0.45, -sx], [sx, 0, -cx], lv, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: (p) => [[-(p.opts.len || 1.4) / 2, 0, -0.33, (p.opts.len || 1.4) / 2, 0.52, 0.33]],
});

// A dead shrub in a bed of soil (no pot): bare branches and a few dry leaves. opts: h
defineProp('z_shrub', {
  build(mb, p, r) {
    const wood = S('wood_dark'), lv = T('leaves_dead', { lit: true });
    const n = r.int(4, 6), h = p.opts.h || r.range(0.8, 1.3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r.range(0, 1), len = h * r.range(0.6, 1.0), sp = r.range(0.08, 0.3);
      mb.rod(0, 0, 0, Math.cos(a) * sp, len, Math.sin(a) * sp, 0.014, 4, wood);
    }
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + r.range(0, 0.6), c = Math.cos(a) * 0.3, s = Math.sin(a) * 0.3;
      mb.card([-c, h * 0.35, -s, c, h * 0.35, s, c, h * 0.35 + h * 0.6, s, -c, h * 0.35 + h * 0.6, -s], [s, 0, -c], lv, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});

// Queue stanchion: post with a velvet rope running along +x for opts.len metres (0 = no rope).
defineProp('z_stanchion', {
  build(mb, p) {
    const len = p.opts.len || 0, post = S('chrome', { tint: [1.2, 1.0, 0.5] }), rope = S('velvet_red');
    mb.cyl(0, 0, 0, 0.17, 0.03, 6, post, 1);
    mb.cyl(0, 0.03, 0, 0.022, 0.9, 4, post, 0);
    mb.cyl(0, 0.93, 0, 0.045, 0.06, 6, post, 3);
    if (len > 0.3) {
      mb.rod(0.04, 0.86, 0, len / 2, 0.76, 0, 0.018, 4, rope);
      mb.rod(len / 2, 0.76, 0, len - 0.04, 0.86, 0, 0.018, 4, rope);
    }
  },
  boxes: [[-0.07, 0, -0.07, 0.07, 0.95, 0.07]],
});

// Hanging two-sided queue display ("NOW SERVING"), anchored at the ceiling.
defineProp('z_display', {
  build(mb, p) {
    const drop = p.opts.drop || 0.6, dk = S('plastic_black');
    const face = glow('z_now_serving', 0.9);
    mb.rod(-0.35, 0, 0, -0.35, -drop, 0, 0.012, 4, dk);
    mb.rod(0.35, 0, 0, 0.35, -drop, 0, 0.012, 4, dk);
    mb.box(-0.5, -drop - 0.3, -0.07, 0.5, -drop, 0.07, [dk, dk, dk, dk, face, face], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
  },
});

// Stacked dryers (two drums high). Faces -z.
defineProp('z_dryer', {
  build(mb, p) {
    const w = S('plastic_white'), face = T('washer');
    mb.box(-0.32, 0, -0.3, 0.32, 0.9, 0.3, [w, w, w, w, w, face], { uv: ['world', 'world', 'world', 'world', 'world', FIT] });
    mb.box(-0.32, 0.9, -0.3, 0.32, 1.8, 0.3, [w, w, w, w, w, face], { uv: ['world', 'world', 'world', 'world', 'world', FIT] });
    mb.box(-0.34, 0.88, -0.32, 0.34, 0.92, 0.32, S('metal'), { skip: 0 });
  },
  boxes: [[-0.34, 0, -0.32, 0.34, 1.82, 0.32]],
  emitter: { snd: 'washer', vol: 0.4, rad: 6, y: 0.9, cond: (p) => !!p.opts.running },
});

// Laundry basket / cart. opts: tint
defineProp('z_basket', {
  build(mb, p, r) {
    const c = S('plastic_blue', { tint: p.opts.tint || r.pick([[1.2, 0.5, 0.5], [0.6, 1.0, 0.7], [1, 1, 1], [1.2, 1.0, 0.4]]) });
    const x = 0.32, z = 0.24, h = 0.42, t = 0.025;
    mb.box(-x, 0.04, -z, x, 0.07, z, c);
    mb.box(-x, 0.04, -z, x, h, -z + t, c);
    mb.box(-x, 0.04, z - t, x, h, z, c);
    mb.box(-x, 0.04, -z, -x + t, h, z, c);
    mb.box(x - t, 0.04, -z, x, h, z, c);
    if (p.opts.full !== false) mb.box(-x + 0.04, 0.07, -z + 0.04, x - 0.04, h - 0.03 + r.range(-0.04, 0.08), z - 0.04, S('plastic_white', { tint: r.pick([[0.9, 0.9, 0.86], [0.7, 0.78, 0.95], [0.95, 0.8, 0.8]]) }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (x - 0.05) - 0.02, 0, sz * (z - 0.05) - 0.02, sx * (x - 0.05) + 0.02, 0.05, sz * (z - 0.05) + 0.02, S('rubber'), { skip: 8 });
  },
  boxes: [[-0.32, 0, -0.24, 0.32, 0.44, 0.24]],
});

export { M };
