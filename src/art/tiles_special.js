// Special tiles (tiles agent): pit, railing, stage front, door threshold, stairs, standing water.
// Masks are SAME-KEY neighbour masks from the engine (N1 E2 S4 W8 = neighbour is the same tile).
import { PB, rgb, mixc, dk, lt, bay, fbm, shadeField, speck, R } from './tiles_px.js';
import { CONC } from './tiles_floors.js';

// ---------------------------------------------------------------------------------------------
// pit: black, dropping to a faint red glow; floor edge drawn where the neighbour is not pit
export const PIT_S = 128;
export function pitTex(clean) {
  const pb = new PB(PIT_S, PIT_S, 'ink');
  const g = fbm(PIT_S, PIT_S, [[64, 64, 1], [24, 24, 0.6], [8, 8, 0.25]], 401);
  shadeField(pb, g, { lo: 0.42, hi: 0.78, color: 'fire_dd', steps: 3, step: 0.34 });
  shadeField(pb, g, { lo: 0.66, hi: 0.86, color: 'fire_d', steps: 2, step: 0.28 });
  const r = R('pit');
  for (let i = 0; i < 40; i++) { // embers far below
    const x = Math.floor(r() * PIT_S), y = Math.floor(r() * PIT_S);
    if (g[y * PIT_S + x] > 0.55) pb.set(x, y, r() < 0.3 ? 'fire' : 'fire_d');
  }
  // faint far-off timbers crossing the glow
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(r() * PIT_S), x = Math.floor(r() * PIT_S), l = 10 + Math.floor(r() * 30), a = (r() - 0.5) * 0.6;
    for (let k = 0; k < l; k++) pb.set(x + k, y + Math.round(k * a), mixc('ink', 'fire_dd', 0.25));
  }
  return pb;
}
/** Edge treatment of one pit cell (16×16 buffer already holding the glow). */
export function pitEdges(c, mask) {
  const N = !(mask & 1), E = !(mask & 2), S = !(mask & 4), W = !(mask & 8);
  const lip = mixc('g3', 'brown', 0.4), face = mixc('brown_dd', 'g1', 0.5), faceD = mixc('ink', 'brown_dd', 0.5);
  // falloff: the drop is darkest right under an edge, the glow lives in the middle
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let d = 99;
    if (N) d = Math.min(d, y); if (S) d = Math.min(d, 15 - y); if (W) d = Math.min(d, x); if (E) d = Math.min(d, 15 - x);
    if (d < 6 && bay(x, y) < (6 - d) / 6) c.set(x, y, 'ink');
  }
  if (N) { // the far edge: the floor's cut face, plank ends going down into the dark
    for (let x = 0; x < 16; x++) {
      c.set(x, 0, lip); c.set(x, 1, lt(face, 0.12));
      for (let y = 2; y < 6; y++) if (bay(x, y) < (6 - y) / 4.5) c.set(x, y, y < 4 ? face : faceD);
    }
    for (let x = 1; x < 16; x += 5) { c.set(x, 2, 'ink'); c.set(x, 3, 'ink'); } // gaps between plank ends
    for (let x = 2; x < 16; x += 7) c.tint(x, 4, 'fire_d', 0.4);               // the red catches the underside
  }
  if (S) { for (let x = 0; x < 16; x++) { c.set(x, 15, lt(lip, 0.08)); c.set(x, 14, 'ink'); } }
  if (W) { for (let y = 0; y < 16; y++) { c.set(0, y, lip); c.set(1, y, faceD); } }
  if (E) { for (let y = 0; y < 16; y++) { c.set(15, y, dk(lip, 0.25)); c.set(14, y, 'ink'); } }
  if (N && W) c.set(0, 0, lt(lip, 0.15));
}

// ---------------------------------------------------------------------------------------------
// drop (Integration 2): a neutral open drop for galleries/landings — the pit's geometry without the
// mine fire: near-black falling to a faint cold gray-blue, a few far-off shapes of a floor below.
export const DROP_S = 128;
export function dropTex() {
  const pb = new PB(DROP_S, DROP_S, 'ink');
  const g = fbm(DROP_S, DROP_S, [[64, 64, 1], [32, 32, 0.5], [8, 8, 0.2]], 911);
  shadeField(pb, g, { lo: 0.5, hi: 0.82, color: mixc('night', 'blue_dd', 0.6), steps: 3, step: 0.3 });
  shadeField(pb, g, { lo: 0.7, hi: 0.9, color: mixc('blue_dd', 'g1', 0.4), steps: 2, step: 0.25 });
  const r = R('drop');
  // the floor far below: a faint checker of tiles here and there, and a fallen something
  for (let i = 0; i < 6; i++) {
    const x0 = Math.floor(r() * DROP_S), y0 = Math.floor(r() * DROP_S);
    for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) if (((j >> 2) + (k >> 2)) & 1 && g[((y0 + j) % DROP_S) * DROP_S + ((x0 + k) % DROP_S)] > 0.58) pb.tint(x0 + k, y0 + j, 'g2', 0.18);
  }
  return pb;
}
/** Edge treatment of one drop cell: the floor's cut edge in plain plaster/concrete grays. */
export function dropEdges(c, mask) {
  const N = !(mask & 1), E = !(mask & 2), S = !(mask & 4), W = !(mask & 8);
  const lip = mixc('g3', 'g4', 0.3), face = mixc('g1', 'g2', 0.5), faceD = mixc('ink', 'g1', 0.5);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let d = 99;
    if (N) d = Math.min(d, y); if (S) d = Math.min(d, 15 - y); if (W) d = Math.min(d, x); if (E) d = Math.min(d, 15 - x);
    if (d < 6 && bay(x, y) < (6 - d) / 6) c.set(x, y, 'ink');
  }
  if (N) { // the far edge: the slab's cut face going down into the dark
    for (let x = 0; x < 16; x++) {
      c.set(x, 0, lip); c.set(x, 1, lt(face, 0.1));
      for (let y = 2; y < 6; y++) if (bay(x, y) < (6 - y) / 4.5) c.set(x, y, y < 4 ? face : faceD);
    }
  }
  if (S) { for (let x = 0; x < 16; x++) { c.set(x, 15, lt(lip, 0.08)); c.set(x, 14, 'ink'); } }
  if (W) { for (let y = 0; y < 16; y++) { c.set(0, y, lip); c.set(1, y, faceD); } }
  if (E) { for (let y = 0; y < 16; y++) { c.set(15, y, dk(lip, 0.25)); c.set(14, y, 'ink'); } }
  if (N && W) c.set(0, 0, lt(lip, 0.15));
}

// ---------------------------------------------------------------------------------------------
// railing: iron balusters + top rail, joined per mask, transparent behind (see-through).
// wood = true (tile 'railing_wood', Integration 2): a timber rail — a broad lit handrail, square
// spindles, chunky posts, worn pale where hands went.
const IRON = { hi: mixc('g3', 'g4', 0.4), mid: mixc('g1', 'g2', 0.5), dk: mixc('ink', 'g1', 0.4) };
const TIMBER = { hi: mixc('maple', 'wood_l', 0.4), mid: mixc('wood', 'wood_d', 0.3), dk: mixc('wood_d', 'brown_dd', 0.5) };
export function railingCell(mask, clean, wood = false) {
  const c = new PB(16, 18); // 2 extra rows: the cast shadow on the floor to the south
  for (let i = 0; i < c.d.length; i += 4) c.d[i + 3] = 0;
  const N = !!(mask & 1), E = !!(mask & 2), S = !!(mask & 4), W = !!(mask & 8);
  const horiz = E || W || !(N || S);
  const vert = N || S;
  const base = wood ? TIMBER : IRON;
  const iron = clean ? { hi: lt(base.hi, 0.1), mid: base.mid, dk: base.dk } : wood ? { hi: mixc(base.hi, 'g3', 0.2), mid: mixc(base.mid, 'g2', 0.15), dk: base.dk } : base;
  const curb = mixc('g2', 'g3', 0.5);
  const shadow = mixc('ink', 'night', 0.3);
  const shade = (x, y, a) => { const i = c.idx(x, y); if (c.d[i + 3]) return; c.d[i] = 10; c.d[i + 1] = 10; c.d[i + 2] = 15; c.d[i + 3] = a; };
  const hx0 = vert ? (W ? 0 : 7) : 0, hx1 = vert ? (E ? 15 : 8) : 15;
  if (horiz) {
    // slab nosing the railing stands on
    for (let x = hx0; x <= hx1; x++) { c.set(x, 14, lt(curb, 0.15)); c.set(x, 15, dk(curb, 0.3)); }
    // balusters (wood: square spindles, wider apart, lit on their west face)
    for (let x = hx0 + 1; x <= hx1; x += wood ? 4 : 3) {
      for (let y = 5; y <= 13; y++) c.set(x, y, iron.dk);
      c.set(x, 6, iron.mid);
      if (wood) { for (let y = 6; y <= 12; y++) c.set(x, y, iron.mid); if (x + 1 <= hx1) for (let y = 5; y <= 13; y++) c.set(x + 1, y, iron.dk); }
      else if (!clean && ((x * 7) % 5 === 0)) c.set(x, 9, mixc(iron.dk, 'rust', 0.35));
      if (!S) { shade(x, 16, 140); shade(x + 1, 17, 90); } // baluster shadows lean south-east
    }
    // top rail (lit top) and bottom rail; the timber handrail is two rows deep, worn pale on top
    for (let x = hx0; x <= hx1; x++) { c.set(x, 3, iron.hi); c.set(x, 4, iron.dk); c.set(x, 12, iron.mid); c.set(x, 13, iron.dk); }
    if (wood) for (let x = hx0; x <= hx1; x++) { c.set(x, 2, (x * 5) % 7 === 0 && !clean ? mixc(iron.hi, 'g5', 0.35) : lt(iron.hi, 0.08)); c.set(x, 4, iron.mid); c.set(x, 5, iron.dk); }
    if (!S) for (let x = hx0; x <= hx1; x++) { shade(x, 16, 70); shade(x, 17, 30); }
  }
  if (vert) {
    const y0 = N ? 0 : 3, y1 = S ? 15 : 13;
    for (let y = y0; y <= y1; y++) { c.set(6, y, lt(curb, 0.1)); c.set(9, y, dk(curb, 0.3)); }
    for (let y = y0; y <= y1; y += 3) { c.set(7, y + 1, iron.dk); c.set(8, y + 1, iron.dk); c.set(8, y + 2, shadow); }
    for (let y = y0; y <= y1; y++) { c.set(7, y, iron.hi); c.set(8, y, iron.mid); }
    if (!S && !horiz) { shade(7, 16, 120); shade(8, 16, 120); shade(9, 17, 60); }
  }
  // newel posts: run ends and corners
  const post = (x) => {
    for (let y = 2; y <= 14; y++) { c.set(x, y, iron.mid); c.set(x + 1, y, iron.dk); }
    c.set(x, 1, iron.hi); c.set(x + 1, 1, iron.hi); c.set(x, 2, iron.hi);
    if (wood) { c.set(x, 0, lt(iron.hi, 0.1)); c.set(x + 1, 0, iron.hi); for (let y = 3; y <= 14; y += 4) c.set(x, y, iron.dk); }
    if (!S) { shade(x + 1, 16, 150); shade(x + 2, 16, 150); shade(x + 2, 17, 90); }
  };
  if (horiz && !vert) { if (!W) post(0); if (!E) post(14); }
  if (horiz && vert) post(7);
  if (!horiz && vert) { if (!N) post(7); if (!S) post(7); }
  return c;
}

// ---------------------------------------------------------------------------------------------
// stage front: the wood apron face below the stage nosing, paneled, trimmed
export function stageCell(mask, clean, v) {
  const r = R(`stage_${v & 7}_${clean ? 1 : 0}`);
  const c = new PB(16, 20); // + contact shadow rows
  for (let i = 0; i < c.d.length; i += 4) c.d[i + 3] = 0;
  const E = !!(mask & 2), W = !!(mask & 8);
  const nose = mixc('maple', 'wood_l', 0.5), face = clean ? mixc('wood_d', 'ink', 0.35) : mixc('wood_d', 'ink', 0.45);
  const trim = mixc('wood', 'wood_d', 0.4);
  for (let x = 0; x < 16; x++) {
    c.set(x, 0, lt(nose, 0.12)); c.set(x, 1, nose); c.set(x, 2, 'ink');
    c.set(x, 3, lt(trim, 0.15)); c.set(x, 4, dk(trim, 0.3));
    for (let y = 5; y < 14; y++) c.set(x, y, face);
    c.set(x, 14, lt(face, 0.12)); c.set(x, 15, mixc('ink', face, 0.3));
  }
  // one raised panel per cell
  for (let x = 2; x <= 13; x++) { c.set(x, 6, dk(face, 0.4)); c.set(x, 12, lt(face, 0.15)); }
  for (let y = 6; y <= 12; y++) { c.set(2, y, dk(face, 0.4)); c.set(13, y, lt(face, 0.12)); }
  for (let y = 7; y <= 11; y++) for (let x = 3; x <= 12; x++) if (bay(x, y) < 0.15) c.tint(x, y, [255, 255, 255], 0.06);
  if (!W) { for (let y = 0; y < 16; y++) { c.set(0, y, y < 2 ? lt(nose, 0.2) : lt(trim, 0.1)); c.set(1, y, y < 2 ? nose : trim); } }
  if (!E) { for (let y = 0; y < 16; y++) { c.set(15, y, 'ink'); c.set(14, y, y < 2 ? dk(nose, 0.2) : dk(trim, 0.35)); } }
  if (!clean) {
    for (let i = 0; i < 6; i++) c.tint(Math.floor(r() * 16), 13 + Math.floor(r() * 2), 'g4', 0.3); // shoe kicks
    for (let i = 0; i < 3; i++) { const x = 3 + Math.floor(r() * 10), y = 7 + Math.floor(r() * 5); c.set(x, y, mixc('wood', 'g3', 0.5)); }
    for (let x = 0; x < 16; x++) if (r() < 0.4) c.tint(x, 0, 'g4', 0.3); // dust on the nosing
  }
  const sh = rgb('ink'), al = [150, 84, 34];
  for (let x = 0; x < 16; x++) for (let y = 16; y < 19; y++) { const i = c.idx(x, y); c.d[i] = sh[0]; c.d[i + 1] = sh[1]; c.d[i + 2] = sh[2]; c.d[i + 3] = al[y - 16]; }
  return c;
}

// ---------------------------------------------------------------------------------------------
// door threshold: dark worn oak running through the wall (64×64 world texture)
export const DOOR_S = 64;
export function doorTex(clean) {
  const r = R('door');
  const base = mixc(mixc('wood_d', 'g1', 0.5), 'ink', 0.3);
  const pb = new PB(DOOR_S, DOOR_S, base);
  for (let x = 0; x < DOOR_S; x += 4) {
    const c = mixc(base, 'wood_d', r() * 0.35);
    pb.rect(x, 0, 3, DOOR_S, c);
    pb.vline(x + 3, 0, DOOR_S, mixc('ink', base, 0.3));
    pb.vline(x, 0, DOOR_S, lt(c, 0.06));
    let y = Math.floor(r() * 30); while (y < DOOR_S) { pb.hline(x, y, 3, dk(c, 0.3)); y += 20 + Math.floor(r() * 30); }
  }
  if (!clean) {
    shadeField(pb, fbm(DOOR_S, DOOR_S, [[16, 32, 1], [4, 8, 0.5]], 411), { lo: 0.5, hi: 0.8, color: 'ink', steps: 2, step: 0.2 });
    for (let i = 0; i < 25; i++) { // scuffs worn along the direction of travel
      const x = Math.floor(r() * DOOR_S), y = Math.floor(r() * DOOR_S), l = 3 + Math.floor(r() * 6);
      for (let k = 0; k < l; k++) pb.tint(x, y + k, 'g4', 0.18);
    }
    speck(pb, r, 'g4', 0.01, 0, 0, DOOR_S, DOOR_S, 0.3);
  } else speck(pb, r, [255, 230, 190], 0.01, 0, 0, DOOR_S, DOOR_S, 0.14);
  return pb;
}
/** Lintel cell (threshold through the wall top): jamb shadows where the side is wall. */
export function doorJambs(c, mask) {
  if (mask & 8) for (let y = 0; y < 16; y++) { c.set(0, y, 'ink'); c.tint(1, y, 'ink', 0.5); c.tint(2, y, 'ink', 0.25); }
  if (mask & 2) for (let y = 0; y < 16; y++) { c.set(15, y, 'ink'); c.tint(14, y, 'ink', 0.4); }
}

// ---------------------------------------------------------------------------------------------
// stairs (2 steps per tile; runs of cells tile seamlessly; flights read north = away from camera)
//   up:   tread (lit) → bright nosing → riser facing you (darker toward its foot)
//   down: a black drop line → bright nosing → tread falling away; the whole flight a value darker
export function stairsCell(dir, clean, v, sides = 0) {
  const r = R(`stairs_${dir}_${v}_${clean ? 1 : 0}`);
  const c = new PB(16, 16);
  const tread = mixc(mixc('g4', 'cream_d', 0.25), 'g3', 0.15);
  const riser = mixc('g2', 'g3', 0.35);
  const nose = mixc('g5', 'g6', 0.4);
  const n = (x, y, col) => c.set(x, y, col);
  for (let s = 0; s < 2; s++) {
    const y0 = s * 8;
    for (let x = 0; x < 16; x++) {
      if (dir === 'up') {
        n(x, y0, dk(riser, 0.25));                       // crease where the tread meets the next riser
        n(x, y0 + 1, dk(tread, 0.06)); n(x, y0 + 2, tread); n(x, y0 + 3, lt(tread, 0.08));
        n(x, y0 + 4, nose);                              // nosing catches the light
        n(x, y0 + 5, lt(riser, 0.18)); n(x, y0 + 6, riser); n(x, y0 + 7, dk(riser, 0.35)); // riser faces you
      } else {
        const tr = dk(tread, 0.45);
        n(x, y0, 'ink'); n(x, y0 + 1, mixc('ink', 'night', 0.5)); // the drop beyond the nosing
        n(x, y0 + 2, dk(nose, 0.25));
        n(x, y0 + 3, lt(tr, 0.1)); n(x, y0 + 4, tr);
        n(x, y0 + 5, bay(x, y0 + 5) < 0.5 ? dk(tr, 0.2) : tr);
        n(x, y0 + 6, dk(tr, 0.25)); n(x, y0 + 7, bay(x, y0 + 7) < 0.5 ? dk(tr, 0.5) : dk(tr, 0.35));
      }
    }
    for (let x = 2; x < 16; x += 4) n(x, y0 + (dir === 'up' ? 4 : 2), lt(nose, dir === 'up' ? 0.3 : 0.05)); // steel studs
    if (!clean) {
      // feet wore the middle of every tread pale; grit collects at the ends; kick marks on risers
      const ty = y0 + (dir === 'up' ? 2 : 4);
      for (let x = 4; x < 12; x++) if (bay(x, ty) < 0.55) c.tint(x, ty, [255, 255, 255], dir === 'up' ? 0.1 : 0.06);
      for (const x of [0, 1, 14, 15]) c.tint(x, y0 + (dir === 'up' ? 3 : 6), 'ink', 0.3);
      if (dir === 'up') for (let k = 0; k < 3; k++) c.tint(2 + Math.floor(r() * 12), y0 + 6 + (r() < 0.5 ? 1 : 0), 'ink', 0.35);
    }
  }
  if (!clean) {
    for (let i = 0; i < 3; i++) c.tint(Math.floor(r() * 16), Math.floor(r() * 16), 'ink', 0.3);
    if (v % 5 === 1) { const x = 2 + Math.floor(r() * 10), y = (dir === 'up' ? 2 : 4) + (r() < 0.5 ? 0 : 8); n(x, y, 'g6'); n(x + 1, y, 'g5'); n(x + 1, y + 1, dk(tread, 0.3)); } // paper scrap
    if (v % 5 === 3) { const x = 3 + Math.floor(r() * 10), y = dir === 'up' ? 4 : 2; n(x, y, 'g2'); n(x + 1, y, 'g2'); } // chipped nosing
  }
  // optional stringers (engine-supplied same-key mask | 16): dark side walls where the run ends
  if (sides & 8) for (let y = 0; y < 16; y++) { n(0, y, 'ink'); c.tint(1, y, 'ink', 0.45); }
  if (sides & 2) for (let y = 0; y < 16; y++) { n(15, y, 'ink'); c.tint(14, y, 'ink', 0.55); }
  return c;
}

// ---------------------------------------------------------------------------------------------
// standing water: dark, reflective; frames shimmer (cells are self-contained and seamless)
export const WATER_FRAMES = 4;
export function waterCell(v, frame, shore = 0) {
  const r = R(`water_${v}`);
  // a film of black water over the concrete: dark, cold, the floor still faintly there
  const base = mixc(dk(CONC, 0.55), 'blue_dd', 0.45);
  const c = new PB(16, 16, base);
  // the drowned floor shows through as sparse, organic speckle (no ordered dither: it would grid)
  for (let i = 0; i < 26; i++) c.tint(Math.floor(r() * 16), Math.floor(r() * 16), mixc(dk(CONC, 0.3), 'blue_d', 0.35), 0.45);
  for (let i = 0; i < 18; i++) c.tint(Math.floor(r() * 16), Math.floor(r() * 16), 'ink', 0.35);
  // faint cold sheen: a short darker/lighter ripple pair
  { const y = 2 + Math.floor(r() * 12), x = Math.floor(r() * 10); for (let k = 0; k < 5; k++) { c.tint(x + k, y, 'ink', 0.25); c.tint(x + k + 1, y + 1, 'blue_d', 0.3); } }
  // reflected light: at most one or two long horizontal glints, drifting a pixel with the frame
  const streaks = v % 3 === 0 ? 0 : v % 5 === 1 ? 2 : 1;
  for (let i = 0; i < streaks; i++) {
    const y = 3 + Math.floor(r() * 10), x0 = 2 + Math.floor(r() * 6), len = 3 + Math.floor(r() * 4);
    const ph = (frame + i * 2 + v) % WATER_FRAMES;
    const dx = [0, 1, 1, 0][ph], dl = [0, 0, -1, 1][ph];
    for (let k = 0; k < len + dl; k++) {
      const x = x0 + dx + k;
      if (x < 1 || x > 14) continue;
      const mid = k > 0 && k < len + dl - 1;
      c.set(x, y, mid && i === 0 ? mixc('blue_l', 'moon', 0.3) : mixc('blue_l', 'blue_d', 0.5));
    }
  }
  // a slow ripple where a drip lands (some cells)
  if (v % 4 === 1) {
    const cx = 5 + Math.floor(r() * 6), cy = 5 + Math.floor(r() * 6), rad = 1.5 + (frame % WATER_FRAMES) * 0.8;
    for (let a = 0.3; a < 3.0; a += 0.45) {
      const x = Math.round(cx + Math.cos(a + 3.3) * rad * 1.6), y = Math.round(cy + Math.sin(a + 3.3) * rad * 0.7);
      if (x >= 1 && x <= 14 && y >= 1 && y <= 14) c.tint(x, y, 'blue_l', 0.22);
    }
  }
  // shorelines (only when the engine supplies a valid mask): a damp margin and a dark meniscus
  if (shore) {
    const damp = dk(CONC, 0.3);
    for (let k = 0; k < 16; k++) {
      if (shore & 1) { if (bay(k, 0) < 0.6) c.set(k, 0, damp); c.tint(k, 1, 'ink', 0.3); }
      if (shore & 4) { c.set(k, 15, damp); if (bay(k, 14) < 0.5) c.set(k, 14, damp); c.tint(k, 13, mixc('blue_l', 'blue_d', 0.6), 0.25); }
      if (shore & 8) { if (bay(0, k) < 0.6) c.set(0, k, damp); c.tint(1, k, 'ink', 0.25); }
      if (shore & 2) { if (bay(15, k) < 0.6) c.set(15, k, damp); c.tint(14, k, 'ink', 0.25); }
    }
  }
  return c;
}
