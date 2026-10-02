// Level 55: The Infinite Library. Shelves fifteen metres tall run off into the dark in both
// directions, pools of lamplight lie on the carpet, ladders lean on spines nobody can reach.
// Some books stand out from the shelf: they describe places that do not exist yet.
// Endless: rows of shelves with cross passages, a wide nave with reading tables, courts.
import { defineTexture, signTex } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M, CF, noise } from './kit.js';
import { glowMat, mulc, TAU, lattice } from './g07_kit.js';

const N = 55;
const P = 64, RP = 8, RT = 2.4;          // zone, row pitch, shelf thickness
const NAVE = 3;                           // the row index left out: a wide nave
const GAPS = [14.5, 46.5];                // cross passages (offset in the zone), 4 m wide

// ------------------------------------------------------------------ textures
const SPINE = [[150, 40, 36], [38, 74, 52], [44, 60, 110], [168, 124, 44], [92, 52, 40], [120, 44, 80], [64, 64, 70], [186, 168, 120], [48, 90, 96], [100, 70, 36]];
defineTexture('lv55_books', (p, r) => {
  p.fill([34, 22, 14]);
  for (let row = 0; row < 8; row++) {
    const y = row * 8, top = y + 1;
    p.rect(0, y + 7, 64, 1, [70, 44, 24]);           // the board
    let x = 0;
    while (x < 64) {
      const w = r.int(2, 5), h = r.int(4, 6), c = r.pick(SPINE), k = r.range(0.75, 1.1);
      p.rect(x, y + 7 - h, w, h, mulc(c, k));
      if (r.chance(0.5)) p.rect(x, y + 7 - h + 1, w, 1, [214, 184, 90], 0.8);
      if (r.chance(0.2)) p.rect(x + 1, y + 7 - h + 2, Math.max(1, w - 2), 1, [236, 220, 170], 0.7);
      x += w;
    }
    void top;
  }
  p.rect(0, 0, 1, 64, [60, 38, 20]); p.rect(32, 0, 1, 64, [60, 38, 20]);
  p.noise(4, 0.08, 2);
}, 16);
defineTexture('lv55_wood', (p) => { p.fill([92, 56, 32]); p.noise(5, 0.14, 3); for (let x = 0; x < 64; x += 8) p.rect(x, 0, 1, 64, [56, 32, 18], 0.7); p.speckle(60, [130, 86, 50], 0.3, 0.6); p.rect(0, 0, 64, 2, [124, 80, 46]); }, 10);
defineTexture('lv55_parquet', (p) => {
  p.fill([104, 64, 36]);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const horiz = (tx + ty) % 2;
    for (let k = 0; k < 4; k++) { const sh = 0.85 + ((k * 37 + tx * 11 + ty * 17) % 7) * 0.04; if (horiz) p.rect(tx * 16, ty * 16 + k * 4, 16, 3, mulc([112, 70, 40], sh)); else p.rect(tx * 16 + k * 4, ty * 16, 3, 16, mulc([112, 70, 40], sh)); }
  }
  p.noise(4, 0.08, 2);
}, 12);
defineTexture('lv55_carpet', (p) => {
  p.fill([112, 30, 34]); p.noise(5, 0.1, 3); p.grain(0.08);
  p.rect(0, 4, 64, 3, [200, 160, 70]); p.rect(0, 57, 64, 3, [200, 160, 70]); p.rect(0, 9, 64, 1, [70, 18, 22]); p.rect(0, 54, 64, 1, [70, 18, 22]);
  for (let x = 4; x < 64; x += 16) { p.disc(x + 8, 32, 6, [150, 44, 40]); p.disc(x + 8, 32, 3, [200, 160, 70]); }
}, 12);
defineTexture('lv55_brass', (p) => { p.fill([188, 148, 62]); p.noise(4, 0.15, 2); p.rect(0, 0, 64, 4, [240, 210, 120]); p.rect(0, 58, 64, 6, [110, 80, 30]); }, 8);
defineTexture('lv55_shade', (p) => { p.fill([40, 120, 74]); p.noise(4, 0.08, 2); p.rect(0, 0, 64, 5, [90, 170, 110]); p.rect(0, 59, 64, 5, [20, 70, 44]); }, 8);
defineTexture('lv55_glow', (p) => { p.fill([255, 214, 140]); p.disc(32, 32, 26, [255, 244, 200]); }, 4);
defineTexture('lv55_paper', (p) => { p.fill([226, 214, 178]); p.noise(4, 0.06, 2); for (let y = 8; y < 60; y += 6) p.rect(6, y, 52, 1, [150, 134, 100], 0.6); }, 6);
defineTexture('lv55_cover', (p) => {
  p.fill([128, 40, 36]); p.noise(4, 0.1, 2);
  p.frame(4, 4, 56, 56, [214, 176, 80]); p.frame(7, 7, 50, 50, [160, 120, 50]);
  p.rect(14, 22, 36, 4, [226, 190, 96]); p.rect(20, 32, 24, 3, [226, 190, 96]); p.disc(32, 48, 4, [214, 176, 80]);
}, 10);
defineTexture('lv55_cat', (p) => {
  p.fill([86, 50, 28]); p.noise(4, 0.1, 2);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { p.rect(tx * 16 + 2, ty * 16 + 2, 12, 12, [108, 66, 38]); p.frame(tx * 16 + 2, ty * 16 + 2, 12, 12, [50, 28, 14]); p.rect(tx * 16 + 6, ty * 16 + 6, 4, 2, [214, 176, 80]); }
}, 12);
defineTexture('lv55_sign', signTex(['SILENCE'], [60, 36, 22], [230, 196, 110], 1), 8);
defineTexture('lv55_sign2', signTex(['PLEASE', 'RETURN', 'BOOKS'], [226, 214, 178], [90, 40, 30], 1), 8);

// ------------------------------------------------------------------ materials
defineMaterial('lv55_books', 'lv55_books', { su: 3.2, sv: 3.2, surf: 'wood', stain: 0.02 });
defineMaterial('lv55_wood', 'lv55_wood', { s: 2, surf: 'wood', stain: 0.04 });
defineMaterial('lv55_parquet', 'lv55_parquet', { s: 3, surf: 'wood', stain: 0.04 });
defineMaterial('lv55_carpet', 'lv55_carpet', { s: 4, surf: 'carpet' });
defineMaterial('lv55_brass', 'lv55_brass', { s: 1, surf: 'metal' });
defineMaterial('lv55_shade', 'lv55_shade', { s: 1, surf: 'metal' });
defineMaterial('lv55_cat', 'lv55_cat', { s: 2, surf: 'wood' });
glowMat('lv55_glow', 'lv55_glow', 1.0, { s: 1 });
glowMat('lv55_glowshade', 'lv55_shade', 0.55, { s: 1 });
defineMaterial('lv55_paper', 'lv55_paper', { s: 1, surf: 'carpet' });
defineMaterial('lv55_sign', 'lv55_sign', { s: 1, surf: 'wood' });

// ------------------------------------------------------------------ places that do not exist yet
const A = ['A HARBOUR', 'A CITY OF STAIRCASES', 'A SALT DESERT', 'A LIGHTHOUSE', 'A RAILWAY STATION', 'AN ORCHARD', 'A CANAL TOWN', 'AN OBSERVATORY', 'A SWIMMING BATH', 'A MARKET SQUARE', 'A ROOFTOP GARDEN', 'A VALLEY OF BRIDGES', 'AN ISLAND OF CLOCKS', 'A TELEGRAPH TOWER', 'A CINEMA', 'A GLASS FACTORY', 'A VILLAGE OF WINDMILLS', 'A TOWN ON STILTS', 'A MOUNTAIN PASS', 'A LAUNDRY'];
const B = ['THAT HAS NOT BEEN BUILT YET', 'THAT WILL BE FOUNDED IN A YEAR NOBODY HAS NAMED', 'THAT THE MAP MAKERS LEFT BLANK ON PURPOSE', 'THAT EXISTS ONLY ON THE LAST DAY OF AUTUMN', 'THAT WAS DRAWN BEFORE THE LAND WAS FOUND', 'WHOSE FOUNDATIONS ARE STILL IN THE POST', 'THAT IS ALWAYS ABOUT TO OPEN', 'THAT HAS BEEN RESERVED FOR YOU', 'THAT IS REMEMBERED ONLY IN ADVANCE'];
const C = ['WHERE THE TIDE COMES IN AS SAND', 'WHERE EVERY CLOCK RUNS BACKWARD AT NOON', 'WHERE RAIN FALLS UP AND IS COLLECTED BY ROOFS', 'WHERE ALL THE DOORS OPEN ONTO YESTERDAY', 'WHERE LIGHT IS SOLD BY THE METRE', 'WHERE THE STREETS ARE NAMED AFTER SOUNDS', 'WHERE THE WIND IS TAXED AND THE SNOW IS FREE', 'WHERE EVERY WINDOW LOOKS INTO A DIFFERENT SEASON', 'WHERE THE LAMPS ARE LIT BY THE BUILDINGS THEMSELVES', 'WHERE THE STAIRS GO DOWN TO THE SKY', 'WHERE NOTHING IS EVER FINISHED AND NOBODY MINDS', 'WHERE THE ECHO ARRIVES BEFORE THE SOUND'];
const D = ['THERE IS ONE DOOR, AND IT IS ALWAYS THE ONE YOU CAME IN BY.', 'THE LIBRARY IS OPEN ALL NIGHT, AND ALL OF THE NIGHT IS LONG.', 'IF YOU ARRIVE EARLY, THE PLACE WILL WAIT FOR YOU.', 'THE ONLY SOUND IS A KETTLE, FAR AWAY, JUST BEFORE IT BOILS.', 'EVERY VISITOR IS GIVEN A KEY. NONE OF THEM FIT, AND THAT IS THE POINT.', 'THE PLAN OF THE TOWN IS FOLDED INSIDE THE LAST BOOK ON THE LAST SHELF.', 'THE PAGE ENDS HERE. THE PLACE DOES NOT.', 'ON CLEAR DAYS YOU CAN SEE THE NEXT LEVEL FROM THE HIGHEST WINDOW.'];
const TITLES = ['THE QUIET COAST', 'ATLAS OF UNBUILT ROOMS', 'A GUIDE TO LATER', 'GAZETTEER OF THE NEARLY', 'THE SOUTHERN STAIRS', 'NOTES ON A TOWN TO COME', 'THE MAP IS NOT THE PLACE YET', 'VOLUME OF HARBOURS', 'THE TRAVELLER BEFORE DEPARTURE'];
const pick = (arr, h) => arr[Math.floor(h * arr.length) % arr.length];
export function placeText(seed) {
  const h = (k) => hr(seed, k * 7 + 3, 55);
  return pick(TITLES, h(1)) + '. VOLUME ' + (1 + Math.floor(h(2) * 899)) + '. ' + pick(A, h(3)) + ' ' + pick(B, h(4)) + ', ' + pick(C, h(5)) + '. ' + pick(D, h(6));
}

// ------------------------------------------------------------------ props
const leather = (c) => S('lv55_wood', { tint: c });
defineProp('lv55_book', {      // a book standing out of the shelf: read it
  build(mb, p, r) {
    const c = [[1.5, 0.5, 0.45], [0.5, 1.2, 0.7], [0.6, 0.7, 1.5], [1.6, 1.2, 0.5]][Math.floor(r.next() * 4)];
    mb.box(-0.1, -0.15, -0.02, 0.1, 0.14, 0.18, leather(c));
    mb.box(-0.1, -0.15, -0.025, 0.1, 0.14, -0.02, [null, null, null, null, null, T('lv55_cover', { lit: false, flags: VF.FULLBRIGHT, color: [0.1, 0.1, 0.1], flk: [0.35, 0.35, 0.35] })], { uv: 'fit' });
  },
  use: 'level',
});
defineProp('lv55_pendant', {
  build(mb) {
    const br = S('lv55_brass');
    mb.box(-0.02, 0.9, -0.02, 0.02, 4.2, 0.02, br);
    mb.cyl(0, 0.4, 0, 0.5, 0.5, 8, S('lv55_shade'), 3);
    mb.cyl(0, 0.3, 0, 0.3, 0.12, 8, S('lv55_glow'), 3);
  },
});
defineProp('lv55_table', {
  build(mb, p, r) {
    const wd = S('lv55_wood'), br = S('lv55_brass');
    const L = p.opts.len || 3.2;
    mb.box(-L / 2, 0.74, -0.6, L / 2, 0.8, 0.6, wd);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (L / 2 - 0.1) - 0.04, 0, sz * 0.5 - 0.04, sx * (L / 2 - 0.1) + 0.04, 0.74, sz * 0.5 + 0.04, wd);
    for (const x of [-L * 0.28, L * 0.28]) {          // a green banker's lamp
      mb.box(x - 0.15, 0.8, -0.06, x + 0.15, 0.84, 0.06, br); mb.box(x - 0.02, 0.84, -0.02, x + 0.02, 1.2, 0.02, br);
      mb.box(x - 0.15, 1.2, -0.1, x + 0.15, 1.3, 0.14, S('lv55_glowshade'));
    }
    for (const x of [-L * 0.1, L * 0.14]) { mb.box(x - 0.14, 0.8, 0.1, x + 0.14, 0.9, 0.34, leather([1.2, 0.5, 0.4])); mb.box(x - 0.12, 0.9, 0.1, x + 0.12, 0.98, 0.32, leather([0.5, 0.9, 0.6])); }
    for (const x of [-L * 0.3, 0, L * 0.3]) for (const z of [-0.95, 0.95]) { mb.box(x - 0.22, 0.42, z - 0.22, x + 0.22, 0.47, z + 0.22, wd); mb.box(x - 0.22, 0.47, z + Math.sign(z) * 0.18 - 0.03, x + 0.22, 0.95, z + Math.sign(z) * 0.18 + 0.03, wd); }
  },
  boxes: (p) => [[-(p.opts.len || 3.2) / 2, 0, -0.65, (p.opts.len || 3.2) / 2, 0.85, 0.65]],
});
defineProp('lv55_ladder', {
  build(mb, p) {
    const wd = S('lv55_wood'), br = S('lv55_brass'), h = p.opts.h || 5;
    for (const s of [-1, 1]) mb.box(s * 0.28 - 0.025, 0, 0, s * 0.28 + 0.025, h, 0.05, wd);
    for (let y = 0.4; y < h; y += 0.35) mb.box(-0.28, y - 0.02, -0.03, 0.28, y + 0.02, 0.07, wd);
    mb.box(-0.32, h - 0.1, -0.08, 0.32, h, 0.12, br);
    mb.box(-0.34, 0.0, -0.1, 0.34, 0.06, 0.2, br);
  },
  boxes: [[-0.34, 0, -0.1, 0.34, 4, 0.2]],
});
defineProp('lv55_globe', {
  build(mb) {
    const br = S('lv55_brass'), wd = S('lv55_wood');
    mb.cyl(0, 0, 0, 0.5, 0.08, 8, wd, 3); mb.cyl(0, 0.08, 0, 0.07, 1.0, 6, br, 0);
    mb.cyl(0, 1.0, 0, 0.55, 0.9, 10, S('lv55_cat'), 3); mb.cyl(0, 1.05, 0, 0.45, 0.8, 10, S('lv55_shade'), 3);
    mb.cyl(0, 0.95, 0, 0.58, 0.05, 10, br, 3); mb.cyl(0, 1.9, 0, 0.58, 0.05, 10, br, 3);
  },
  boxes: [[-0.6, 0, -0.6, 0.6, 2, 0.6]],
});
defineProp('lv55_catalog', {
  build(mb) {
    const m = S('lv55_cat'), wd = S('lv55_wood');
    mb.box(-0.9, 0, -0.4, 0.9, 1.3, 0.4, [wd, wd, wd, null, m, m], { uv: ['world', 'world', 'world', 'world', 'fit', 'fit'] });
    mb.box(-0.95, 1.3, -0.45, 0.95, 1.36, 0.45, wd);
  },
  boxes: [[-0.95, 0, -0.45, 0.95, 1.4, 0.45]],
});
defineProp('lv55_lectern', {      // an open book on a stand: read it
  build(mb) {
    const wd = S('lv55_wood'), br = S('lv55_brass');
    mb.box(-0.3, 0, -0.3, 0.3, 0.1, 0.3, wd); mb.box(-0.05, 0.1, -0.05, 0.05, 1.1, 0.05, br);
    mb.box(-0.3, 1.05, -0.2, 0.3, 1.12, 0.24, wd);
    mb.box(-0.26, 1.12, -0.12, 0.0, 1.14, 0.2, S('lv55_paper')); mb.box(0.0, 1.12, -0.12, 0.26, 1.14, 0.2, S('lv55_paper'));
  },
  boxes: [[-0.32, 0, -0.32, 0.32, 1.15, 0.32]],
  use: 'level',
});
defineProp('lv55_sign', {
  build(mb, p) {
    const st = T(p.opts.k === 2 ? 'lv55_sign2' : 'lv55_sign', { lit: false, flags: VF.FULLBRIGHT, color: [0.1, 0.1, 0.1], flk: [0.5, 0.5, 0.5] });
    mb.box(-0.35, 0, -0.03, 0.35, 0.7, 0.03, [S('lv55_wood'), S('lv55_wood'), S('lv55_wood'), S('lv55_wood'), st, st], { uv: 'fit' });
  },
});

// ------------------------------------------------------------------ the zone
const runHeight = (k, r) => 11 + hr(k, r, 5) * 6;

function shelfRows(zb, bi, bj) {
  const { x0, z0, x1 } = zb;
  for (let r = 0; r < 8; r++) {
    if (r === NAVE) continue;
    const z = z0 + 4 + r * RP;
    // runs between the cross passages (world coordinates: a run starts 18.5 m after a passage)
    const kStart = Math.floor((x0 - 18.5) / 32), kEnd = Math.floor((x1 - 18.5) / 32);
    for (let k = kStart; k <= kEnd; k++) {
      const a = 18.5 + k * 32 - 0.0, b = a + 28;
      if (b <= x0 || a >= x1) continue;
      const h = runHeight(k + bi * 0, bj * 8 + r + Math.floor(x0 / 64) * 3);
      const m = [M.lv55_wood, M.lv55_wood, M.lv55_wood, null, M.lv55_books, M.lv55_books];
      cbox(zb, a, 0, z - RT / 2, b, h, z + RT / 2, m, { sub: 4 });
      // a cap of dark wood and a little moulding at the head of the run
      cbox(zb, a - 0.1, h, z - RT / 2 - 0.1, b + 0.1, h + 0.25, z + RT / 2 + 0.1, M.lv55_wood, { sub: 8 });
      // books standing out of the shelf, at eye level, on both faces
      for (let s = 0; s < 3; s++) {
        const bx = a + 3 + hr(k, r * 3 + s, 6) * 22, face = hr(k, r * 3 + s, 7) < 0.5 ? -1 : 1;
        if (!owns(zb, bx, z + face * (RT / 2))) continue;
        zb.prop('lv55_book', bx, 1.25 + hr(k, r + s, 8) * 0.6, z + face * (RT / 2 + 0.01), face < 0 ? Math.PI : 0, { use: 'level', label: 'READ', seed: Math.floor(bx * 13 + z * 7 + r), useR: 0.5, useY: 0 });
      }
      // a rolling ladder against the face, now and then
      if (hr(k, r, 9) < 0.5) {
        const lx = a + 6 + hr(k, r, 10) * 16, face = hr(k, r, 11) < 0.5 ? -1 : 1;
        if (owns(zb, lx, z + face * (RT / 2 + 0.05))) zb.prop('lv55_ladder', lx, 0, z + face * (RT / 2 + 0.05), face < 0 ? Math.PI : 0, { h: 4.5 + hr(k, r, 12) * 4 });
      }
      // a gallery: a railed balcony running along the face, high above
      for (const [gy, side] of [[6.5, -1], [6.5, 1]]) {
        if (r < 0 || h < 8) break;
        cbox(zb, a, gy, z + side * (RT / 2), b, gy + 0.18, z + side * (RT / 2 + 1.0), M.lv55_wood, { sub: 8, collide: false });
        cbox(zb, a, gy + 0.18, z + side * (RT / 2 + 0.95), b, gy + 1.2, z + side * (RT / 2 + 1.0), M.lv55_brass, { sub: 8, collide: false });
      }
    }
  }
}

function lamps(zb, bi, bj) {
  const { x0, z0, x1, z1 } = zb;
  // pendants in every aisle, and the nave
  for (let r = 0; r < 8; r++) {
    const za = z0 + 4 + r * RP + RP / 2;       // aisle between row r and r+1
    const nave = r === NAVE || r === NAVE - 1;
    const step = nave ? 10 : 14;
    for (let x = x0 + 5 + ((r * 3) % 7); x < x1; x += step) {
      if (hr(Math.floor(x), r + bj * 8, 20) < 0.12) continue;
      if (!owns(zb, x, za)) continue;
      zb.prop('lv55_pendant', x, 3.4, za, 0, {});
      zb.light(x, 3.4, za, { color: [1.0, 0.76, 0.42], rad: 8.5, int: nave ? 1.35 : 1.2, ch: hr(Math.floor(x), r, 21) < 0.07 ? 3 : 0 });
    }
  }
}

function furniture(zb, bi, bj) {
  const { x0, z0 } = zb;
  const nz = z0 + 4 + NAVE * RP - RP / 2 + 0;        // the nave centre line (between rows 2 and 4)
  const zc = z0 + 4 + NAVE * RP;
  // reading tables along the nave
  for (let x = x0 + 8; x < zb.x1; x += 16) {
    const jitter = (hr(Math.floor(x), bj, 30) - 0.5) * 3;
    for (const s of [-1, 1]) {
      const tx = x + jitter + (s > 0 ? 6 : 0), tz = zc + s * 4.2;
      if (!owns(zb, tx, tz)) continue;
      if (hr(Math.floor(tx), s + bj * 2, 31) < 0.8) zb.prop('lv55_table', tx, 0, tz, 0, { len: 3.4 });
      zb.light(tx, 1.7, tz, { color: [1.0, 0.82, 0.5], rad: 5.5, int: 0.9 });
    }
    if (owns(zb, x + 8, zc) && hr(Math.floor(x), bj, 32) < 0.5) zb.prop('lv55_lectern', x + 8, 0, zc, hr(Math.floor(x), 1, 33) * TAU, { use: 'level', label: 'READ', seed: Math.floor(x * 5 + bj), useY: 1.1, useR: 0.8 });
    if (owns(zb, x + 3, zc - 0.5) && hr(Math.floor(x), bj, 34) < 0.35) zb.prop('lv55_globe', x + 3, 0, zc, 0, {});
  }
  // card catalogues against the ends of shelf runs, signs
  for (let r = 0; r < 8; r++) {
    if (r === NAVE) continue;
    for (const g of GAPS) {
      const x = x0 + g - 0.1, z = z0 + 4 + r * RP;
      if (hr(Math.floor(x), r + bj * 8, 40) < 0.3 && owns(zb, x + 0.2, z)) zb.prop('lv55_catalog', x + 0.2, 0, z, Math.PI / 2, {});
    }
  }
  void nz;
}

function doors(zb, bi, bj) {
  const { x0, z0 } = zb;
  // a door stands in some cross passages, between the ends of the shelves
  for (let r = 0; r < 8; r++) {
    if (r === NAVE) continue;
    for (const [gi, g] of GAPS.entries()) {
      if (hr(bi * 2 + gi, bj * 8 + r, 60) > 0.2) continue;
      levelDoor(zb, x0 + g + 2, z0 + 4 + r * RP, gi ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  // and always one in the nave of the first zone, far down the carpet
  if (hr(bi, bj, 61) < 0.5) levelDoor(zb, x0 + 31, z0 + 4 + NAVE * RP - 5.2, 0);
}

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  const bi = Math.round(x0 / P), bj = Math.round(z0 / P);
  openGround(zb, M.lv55_parquet, 0);
  zb.noConnectivity = true;
  const zc = z0 + 4 + NAVE * RP;
  zb.fill(x0, z0, x1, z1, (x, z, i) => { if (Math.abs(z + 0.5 - zc) < 2.6) zb.fmat[i] = M.lv55_carpet; });
  shelfRows(zb, bi, bj);
  lamps(zb, bi, bj);
  furniture(zb, bi, bj);
  doors(zb, bi, bj);
  // a reading court at some cross passages of the nave: bigger lamps, a brass ring overhead
  for (const [gi, g] of GAPS.entries()) {
    if (hr(bi * 2 + gi, bj, 70) > 0.45 && !(bi === 0 && bj === 0 && gi === 1)) continue;
    const x = x0 + g + 2;
    cbox(zb, x - 5, 8.2, zc - 5, x + 5, 8.5, zc + 5, M.lv55_brass, { sub: 5, collide: false, skip: 4 });
    for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { cbox(zb, x + dx - 0.05, 3.2, zc + dz - 0.05, x + dx + 0.05, 8.2, zc + dz + 0.05, M.lv55_brass, { sub: 0, collide: false }); }
    if (owns(zb, x, zc)) { zb.prop('lv55_globe', x, 0, zc, 0, {}); zb.light(x, 7.5, zc, { color: [1.0, 0.8, 0.5], rad: 10, int: 1.2 }); }
    zb.light(x, 2.5, zc + 3, { color: [1.0, 0.8, 0.5], rad: 9, int: 0.8 });
  }
  if (hr(bi, bj, 80) < 0.5) {
    const x = x0 + 10 + hr(bi, bj, 81) * 40;
    if (owns(zb, x, zc - 6.7)) zb.prop('lv55_sign', x, 1.6, zc - 6.7, Math.PI, { k: hr(bi, bj, 82) < 0.5 ? 1 : 2 });
  }
}

defineZone('lv55_stacks', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.1, 0.075, 0.05],
    env: env({ fog: [0.04, 0.028, 0.02], fogNear: 6, fogFar: 62, hum: 0, hvac: 0.1, reverb: 'hall', tone: 'lv55_hush' }),
  }),
  gen,
});

// reading: the book describes a place that does not exist yet
function onUse(ctx, item) {
  const o = (item.prop && item.prop.opts) || {};
  const seed = o.seed ?? Math.floor(item.x * 3 + item.z * 5);
  ctx.game.audioCall('play', 'lv55_page', item.x, item.y, item.z, {});
  ctx.game.ui.showNote(placeText(seed));
  const st = ctx.state;
  st.read = (st.read || 0) + 1;
}

// the library keeps its own time: a clock striking far away, a ladder rolling on its rail
function script(ctx, dt) {
  const s = ctx.state, p = ctx.player;
  s.t = (s.t ?? 35) - dt;
  if (s.t > 0) return;
  s.t = 40 + Math.random() * 70;
  const a = Math.random() * TAU, d = 20 + Math.random() * 25;
  const x = p.x + Math.sin(a) * d, z = p.z - Math.cos(a) * d;
  const u = Math.random();
  ctx.game.audioCall('play', u < 0.4 ? 'lv55_clock' : u < 0.75 ? 'lv55_ladder' : 'lv55_creak', x, p.y + 3, z, { distant: true, vol: 0.9 });
}

defineLevel(N, {
  name: 'THE INFINITE LIBRARY',
  zoneType: 'lv55_stacks',
  zoneSize: P,
  entry: { x: 4.5, y: 0, z: 4 + NAVE * RP + 0.5, yaw: Math.PI / 2 },
  doorDensity: 0.3,
  viewRadius: 4,
  weather: { kind: 'dust', amount: 0.7, color: [1.0, 0.86, 0.6, 0.7], fall: 0.05, wind: [0.04, 0.02], size: 0.022, indoor: true },
  light: { phoneRadius: 4, phoneIntensity: 0.25 },
  script,
  onUse,
});
void pnoise; void noise; void CF; void lattice;
