// Special tiles (tiles agent): pit, railing, stage front, door threshold, stairs, standing water.
// Masks are SAME-KEY neighbour masks from the engine (N1 E2 S4 W8 = neighbour is the same tile).
import { PB, rgb, mixc, dk, lt, bay, fbm, vnoise, shadeField, speck, crack, lump, R } from './tiles_px.js';

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
// railing: iron balusters + top rail, joined per mask, transparent behind (see-through)
const IRON = { hi: mixc('g3', 'g4', 0.4), mid: mixc('g1', 'g2', 0.5), dk: mixc('ink', 'g1', 0.4) };
export function railingCell(mask, clean) {
  const c = new PB(16, 18); // 2 extra rows: the cast shadow on the floor to the south
  for (let i = 0; i < c.d.length; i += 4) c.d[i + 3] = 0;
  const N = !!(mask & 1), E = !!(mask & 2), S = !!(mask & 4), W = !!(mask & 8);
  const horiz = E || W || !(N || S);
  const vert = N || S;
  const iron = clean ? { hi: lt(IRON.hi, 0.1), mid: IRON.mid, dk: IRON.dk } : IRON;
  const curb = mixc('g2', 'g3', 0.5);
  const shadow = mixc('ink', 'night', 0.3);
  const hx0 = vert ? (W ? 0 : 7) : 0, hx1 = vert ? (E ? 15 : 8) : 15;
  if (horiz) {
    // slab nosing the railing stands on
    for (let x = hx0; x <= hx1; x++) { c.set(x, 14, lt(curb, 0.15)); c.set(x, 15, dk(curb, 0.3)); }
    // balusters
    for (let x = hx0 + 1; x <= hx1; x += 3) {
      for (let y = 5; y <= 13; y++) c.set(x, y, iron.dk);
      c.set(x, 6, iron.mid);
      if (!clean && ((x * 7) % 5 === 0)) c.set(x, 9, mixc('rust', 'g1', 0.4));
      if (!S) { if (bay(x, 16) < 0.75) c.set(x, 16, shadow); c.set(x + 1, 17, shadow); } // shadows lean south-east
    }
    // top rail (lit top) and bottom rail
    for (let x = hx0; x <= hx1; x++) { c.set(x, 3, iron.hi); c.set(x, 4, iron.dk); c.set(x, 12, iron.mid); c.set(x, 13, iron.dk); }
    if (!S) for (let x = hx0; x <= hx1; x++) if (bay(x, 16) < 0.5) c.set(x, 16, shadow);
  }
  if (vert) {
    const y0 = N ? 0 : 3, y1 = S ? 15 : 13;
    for (let y = y0; y <= y1; y++) { c.set(6, y, lt(curb, 0.1)); c.set(9, y, dk(curb, 0.3)); }
    for (let y = y0; y <= y1; y += 3) { c.set(7, y + 1, iron.dk); c.set(8, y + 1, iron.dk); c.set(8, y + 2, shadow); }
    for (let y = y0; y <= y1; y++) { c.set(7, y, iron.hi); c.set(8, y, iron.mid); }
    if (!S && !horiz) { c.set(7, 16, shadow); c.set(8, 16, shadow); }
  }
  // newel posts: run ends and corners
  const post = (x) => {
    for (let y = 2; y <= 14; y++) { c.set(x, y, iron.mid); c.set(x + 1, y, iron.dk); }
    c.set(x, 1, iron.hi); c.set(x + 1, 1, iron.hi); c.set(x, 2, iron.hi);
    if (!S) { c.set(x + 1, 16, shadow); c.set(x + 2, 16, shadow); c.set(x + 2, 17, shadow); }
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
  for (let x = 0; x < 16; x++) for (let y = 16; y < 19; y++) if (bay(x, y) < [0.62, 0.36, 0.14][y - 16]) c.set(x, y, mixc('ink', 'night', 0.3));
  return c;
}

// ---------------------------------------------------------------------------------------------
// door threshold: dark worn oak running through the wall (64×64 world texture)
export const DOOR_S = 64;
export function doorTex(clean) {
  const r = R('door');
  const base = mixc('wood_d', 'g1', 0.5);
  const pb = new PB(DOOR_S, DOOR_S, base);
  for (let x = 0; x < DOOR_S; x += 4) {
    const c = mixc(base, 'wood', r() * 0.3);
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
// stairs (2 steps per tile; runs of cells tile seamlessly). up: lit treads + risers facing you,
// nosing at the riser top. down: treads falling away north into the dark, no risers.
export function stairsCell(dir, clean, v) {
  const r = R(`stairs_${dir}_${v}_${clean ? 1 : 0}`);
  const c = new PB(16, 16);
  const tread = mixc(mixc('g4', 'cream_d', 0.2), 'g3', 0.2);
  const riser = mixc('g2', 'g3', 0.4);
  const nose = mixc('g5', 'g6', 0.3);
  for (let s = 0; s < 2; s++) {
    const y0 = s * 8;
    if (dir === 'up') {
      for (let x = 0; x < 16; x++) {
        c.set(x, y0, dk(tread, 0.12)); // back of the tread, under the next riser's lip
        for (let y = 1; y < 4; y++) c.set(x, y0 + y, tread);
        c.set(x, y0 + 4, nose); c.set(x, y0 + 5, dk(nose, 0.25));
        c.set(x, y0 + 6, riser); c.set(x, y0 + 7, dk(riser, 0.3));
      }
      if (!clean) for (let x = 4; x < 12; x++) if (bay(x, y0 + 2) < 0.5) c.tint(x, y0 + 2, [255, 255, 255], 0.1); // worn centre
    } else {
      for (let x = 0; x < 16; x++) {
        c.set(x, y0, 'ink'); c.set(x, y0 + 1, mixc('ink', riser, 0.4)); // the drop beyond each nosing
        c.set(x, y0 + 2, dk(tread, 0.5));
        for (let y = 3; y < 7; y++) c.set(x, y0 + y, bay(x, y0 + y) < (7 - y) / 5 ? dk(tread, 0.35) : dk(tread, 0.12));
        c.set(x, y0 + 7, nose);
      }
    }
  }
  // metal nosing studs
  for (let s = 0; s < 2; s++) for (let x = 2; x < 16; x += 4) c.set(x, s * 8 + (dir === 'up' ? 4 : 7), lt(nose, 0.25));
  if (!clean) {
    for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16); c.tint(x, y, 'ink', 0.35); }
    if (v % 5 === 1) { const x = 2 + Math.floor(r() * 10), y = dir === 'up' ? 1 + (r() < 0.5 ? 0 : 8) : 4 + (r() < 0.5 ? 0 : 8); c.set(x, y, 'g6'); c.set(x + 1, y, 'g5'); } // paper scrap
    if (v % 5 === 3) { const x = 3 + Math.floor(r() * 10); c.set(x, dir === 'up' ? 4 : 7, 'g2'); c.set(x + 1, dir === 'up' ? 4 : 7, 'g2'); } // chipped nosing
    for (let x = 0; x < 16; x++) if (r() < 0.2) c.tint(x, 0, 'g4', 0.2);
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// standing water: dark, reflective; frames shimmer (cells are self-contained and seamless)
export const WATER_FRAMES = 4;
export function waterCell(v, frame) {
  const r = R(`water_${v}`);
  const base = mixc('blue_dd', 'ink', 0.3);
  const c = new PB(16, 16, base);
  // what lies under the water: a hint of concrete mottle, tile-periodic so cells join
  const n = vnoise(16, 16, 8, 8, 421 + v);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const f = n[y * 16 + x];
    if (f > 0.6 && bay(x, y) < (f - 0.6) * 3) c.tint(x, y, mixc('g2', 'blue_d', 0.5), 0.5);
    if (f < 0.3 && bay(x, y) < (0.3 - f) * 3) c.tint(x, y, 'ink', 0.4);
  }
  // reflected light: horizontal glints that drift with the frame
  const streaks = 2 + (v & 1);
  for (let i = 0; i < streaks; i++) {
    const y = 2 + Math.floor(r() * 12), x0 = 1 + Math.floor(r() * 8), len = 2 + Math.floor(r() * 4);
    const ph = (frame + i + v) % WATER_FRAMES;
    const dx = [0, 1, 1, 0][ph], dl = [0, 0, -1, 1][ph];
    for (let k = 0; k < len + dl; k++) {
      const x = x0 + dx + k;
      if (x < 1 || x > 14) continue;
      c.set(x, y, k === 0 || k === len + dl - 1 ? mixc('blue_l', 'blue_d', 0.5) : mixc('moon', 'blue_l', 0.45));
    }
  }
  // a slow ring where a drip landed
  if (v % 3 === 0) {
    const cx = 4 + Math.floor(r() * 8), cy = 4 + Math.floor(r() * 8), rad = 1 + (frame % WATER_FRAMES) * 0.7;
    for (let a = 0; a < 6.28; a += 0.4) {
      const x = Math.round(cx + Math.cos(a) * rad * 1.6), y = Math.round(cy + Math.sin(a) * rad * 0.8);
      if (x >= 1 && x <= 14 && y >= 1 && y <= 14) c.tint(x, y, 'blue_l', 0.3);
    }
  }
  // dark ripple troughs
  for (let i = 0; i < 2; i++) { const y = 1 + Math.floor(r() * 14), x = 1 + Math.floor(r() * 10); for (let k = 0; k < 4; k++) c.tint(x + k, y, 'ink', 0.4); }
  return c;
}
