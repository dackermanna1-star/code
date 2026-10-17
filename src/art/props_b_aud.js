// Props B — auditorium: aud_seat curtain lectern piano music_stand phonograph instrument_case
// stage_flat lever rope_rail. Red velvet worn to the weave, cast iron, oak gone gray with dust.
// aud_seat 'occupied' seats a husk (props_b_husk.js): opts.occupant = 'husk_a'..'husk_f' | 'a'..'f'
// | 'boy', optionally suffixed ':turned' / '_turned' / ':crumbled'.
import { K, PAL, mix, lt, dk, BRASS, IRON, seedOf, woodSet, SHADOW, SHADOW_SOFT } from './props_b_kit.js';
import { drawHusk, drawFlakes, huskVariant } from './props_b_husk.js';

const velvetSet = (clean) => clean
  ? { dd: PAL.blood_d, dk: PAL.velvet_d, md: PAL.velvet, lt: mix(PAL.velvet, PAL.crimson, 0.6), hi: PAL.crimson_l, worn: PAL.velvet }
  : { dd: dk(PAL.velvet_d, 0.2), dk: mix(PAL.velvet_d, PAL.g1, 0.2), md: mix(PAL.velvet, PAL.g2, 0.25), lt: mix(PAL.velvet, PAL.crimson, 0.35), hi: mix(PAL.crimson, PAL.tan, 0.3), worn: mix(PAL.velvet, PAL.tan, 0.45) };

// ---------------------------------------------------------------------------- aud_seat
function parseOccupant(occ) {
  if (!occ) return null;
  const s = String(occ).toLowerCase();
  const state = /crumbl/.test(s) ? 'crumbled' : /turn/.test(s) ? 'turned' : 'intact';
  const base = s.replace(/[:_-]?(turned|crumbled)$/, '');
  return { ...huskVariant(base), state };
}
function audSeat(o) {
  const k = new K(18, 40, -1, -24, seedOf('aud', o.dir, o.variant, o.clean));
  const V = velvetSet(o.clean), W = woodSet(o.clean, 'dark');
  const iron = o.clean ? { hi: PAL.g4, md: PAL.g2, dk: PAL.g1 } : { hi: mix(PAL.g3, PAL.brown, 0.2), md: PAL.g1, dk: PAL.shadow };
  const occ = o.state === 'occupied' && !o.clean ? parseOccupant(o.occupant || 'husk_b') : null;
  const wear = !o.clean ? (o.variant % 4) : -1;
  // layers: base (standards, seat) · husk · front (the back panel when seen from behind)
  const front = k.layer();
  const husk = k.layer();
  const standards = (t) => {
    for (const sx of [0, 14]) {
      t.R(sx, -2, 2, 15, iron.md); t.V(sx, -2, 15, iron.hi); t.P(sx + 1, 12, iron.dk);
      t.R(sx, 13, 2, 1, iron.dk);
      t.R(sx, -5, 2, 4, W.md); t.V(sx, -5, 4, W.hi); // armrest end grain
      if (wear === 2 && sx === 14) t.P(sx, -4, PAL.g4); // scuffed
    }
  };
  if (o.dir === 'up') {
    // far edge of the seat cushion, just showing over the back
    k.R(2, -4, 12, 2, V.dk); k.H(2, -4, 12, V.md);
    standards(k);
    if (occ) {
      if (occ.state === 'crumbled') drawFlakes(husk, 8, -3, occ.size, seedOf('fl', o.variant));
      else drawHusk(husk, { cx: 8, seatY: -1, floorY: 6, size: occ.size, view: 'up', head: occ.state === 'turned' ? 'down' : 'up', pose: occ.pose, boy: occ.boy, turned: occ.state === 'turned' });
    }
    // the back: velvet-upholstered rear in a dark wood frame, top roll
    const f = front;
    f.R(1, -2, 14, 11, W.dk);
    f.R(2, -1, 12, 8, V.md);
    f.R(2, 5, 12, 2, V.dk); f.D(2, 4, 12, 1, V.dk, 0.5);
    f.R(3, -1, 10, 2, V.lt);
    f.H(1, -2, 14, W.lt); f.H(2, -2, 12, W.hi); f.P(1, -2, W.md);
    f.V(2, -1, 8, V.lt);
    f.H(2, 7, 12, V.dd); f.H(1, 8, 14, W.dd);
    for (const bx of [4, 8, 12]) { f.P(bx, 2, V.dd); f.P(bx - 1, 1, V.lt); }
    f.R(6, 5, 4, 2, o.clean ? BRASS.lt : BRASS.dk); f.P(6, 5, BRASS.hi);
    if (wear >= 0) {
      // velvet worn to the weave where shoulders rubbed; a split seam; dust on the top rail
      for (let i = 0; i < 12; i++) f.P(4 + ((i * 5 + o.variant * 3) % 8), ((i * 3) % 4), V.worn);
      if (wear === 1) { f.L(11, 1, 12, 5, V.dd); f.P(12, 3, PAL.tan); }
      if (wear === 3) { f.R(3, 3, 2, 2, mix(PAL.tan, PAL.cream_d, 0.4)); f.P(4, 4, PAL.paper_d); } // stuffing
      f.S(1, -2, 14, 1, 'rgba(170,160,140,0.5)', 0.4);
    }
  } else {
    // facing the viewer: back behind, then the seat (folded up when empty) and arms
    k.R(1, -12, 14, 12, W.dk);
    k.R(2, -11, 12, 10, V.md);
    k.R(2, -11, 12, 3, V.lt); k.D(2, -8, 12, 1, V.lt, 0.5); k.R(2, -4, 12, 3, V.dk);
    k.H(1, -12, 14, W.hi);
    for (let x = 4; x < 13; x += 4) k.V(x, -10, 8, V.dk); // channel tufting
    if (wear >= 0) for (let i = 0; i < 14; i++) k.P(4 + ((i * 5 + o.variant * 3) % 8), -10 + ((i * 3) % 5), V.worn);
    standards(front);
    if (occ) {
      k.R(2, 1, 12, 4, V.md); k.H(2, 1, 12, V.hi); k.H(2, 4, 12, V.dd);
      if (occ.state === 'crumbled') drawFlakes(husk, 8, 3, occ.size, 3);
      else drawHusk(husk, { cx: 8, seatY: 2, floorY: 13, size: occ.size, view: 'down', head: 'down', pose: occ.pose, boy: occ.boy, turned: occ.state === 'turned' });
    } else {
      // folded: the seat's worn underside stands up against the back
      k.R(3, -4, 10, 7, W.md); k.H(3, -4, 10, V.lt); k.R(3, -3, 10, 2, V.md);
      k.H(3, 2, 10, W.dd); k.P(4, 0, IRON.lt); k.P(11, 0, IRON.lt);
      if (wear >= 0) k.S(3, -1, 10, 4, 'rgba(20,12,8,0.4)', 0.15);
    }
  }
  k.outline(); front.outline();
  k.blit(husk, husk.ox, husk.oy);
  k.blit(front, front.ox, front.oy);
  k.shadow(1, 11, 14, 3, SHADOW_SOFT);
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- curtain
function curtain(o) {
  const k = new K(16, 58, 0, -42, seedOf('curtain', o.variant, o.clean));
  const V = velvetSet(o.clean);
  const open = o.state === 'open';
  const top = -42, hem = open ? -30 : 15;
  // folds: a repeating fold profile, lit on the left of each ridge
  const prof = [V.dk, V.md, V.lt, V.hi, V.lt, V.md, V.dk, V.dd];
  for (let x = 0; x < 16; x++) {
    const ph = (x + o.variant * 3) % 8;
    let c = prof[ph];
    const bottom = hem + (open ? Math.round(Math.sin(x * 0.8) * 1.5) + (ph < 4 ? 1 : 0) : (ph === 3 ? 0 : ph === 7 ? -1 : 0));
    k.V(x, top, bottom - top, c);
    // light falls off toward the floor (stage lights from above)
    if (!open) k.DV(x, top + 30, 1, bottom - top - 30, V.dd, 0.0, ph === 3 ? 0.25 : 0.5);
    if (open) { k.P(x, bottom, V.dd); k.P(x, bottom - 1, ph === 3 ? V.hi : c); }
    else { k.P(x, bottom, V.dd); if (ph === 2 || ph === 3) k.P(x, bottom - 1, V.hi); }
  }
  // pelmet: gold braid at the top
  k.R(0, top, 16, 3, o.clean ? BRASS.md : BRASS.dk); k.H(0, top, 16, o.clean ? BRASS.hi : BRASS.md);
  for (let x = 0; x < 16; x += 2) k.P(x, top + 3, o.clean ? BRASS.lt : BRASS.md);
  if (!o.clean) {
    // moth holes, a ragged hem, dust bloom near the floor
    const holes = [[3, -20], [11, -6], [6, 4], [13, -28], [9, -14]];
    for (let i = 0; i < holes.length; i++) if (!open || holes[i][1] < -30) { const [hx, hy] = holes[(i + o.variant) % holes.length]; k.P(hx, hy, PAL.ink); if (i % 2) k.P(hx + 1, hy, V.dd); }
    if (!open) { for (let x = 0; x < 16; x += 3) k.clear(x + (o.variant % 3), 14); k.D(0, 10, 16, 5, mix(V.md, PAL.g3, 0.5), 0.3); }
    k.S(0, top + 3, 16, 10, 'rgba(150,140,120,0.3)', 0.05);
  }
  if (open) {
    // tied swag: the hem gathered into a scallop
    k.H(0, hem + 1, 16, V.dd);
  }
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- lectern
function lectern(o) {
  const k = new K(18, 36, -1, -22, seedOf('lectern', o.clean));
  const W = woodSet(o.clean, 'oak');
  k.shadow(2, 12, 12, 3, SHADOW);
  // plinth base, tapering column (wider at the top), slanted reading desk
  k.R(2, 11, 12, 3, W.dk); k.H(2, 11, 12, W.md);
  k.poly([[3, -5], [13, -5], [12, 11], [4, 11]], W.md);
  k.wood(4, -4, 8, 15, W.md, { dark: W.dk, light: W.lt, vertical: true, density: 0.4 });
  k.poly([[3, -5], [4, -5], [5, 11], [4, 11]], W.lt);
  k.poly([[12, -5], [13, -5], [12, 11], [11, 11]], W.dk);
  // carved front: the school seal (a ring with an H)
  k.ring(8, 2, 2, 2, W.dk); k.P(8, 2, o.clean ? BRASS.lt : BRASS.dk);
  // slanted top (lit), lip, the reading surface
  k.poly([[1, -9], [15, -9], [14, -4], [2, -4]], W.lt);
  k.H(1, -9, 14, W.hi); k.H(2, -4, 12, W.dd); k.H(2, -5, 12, W.md);
  // the roll, open on the desk (in the Assembly he reads from it)
  if (!o.clean) { k.R(4, -9, 8, 4, PAL.paper_d); k.H(4, -9, 8, PAL.paper); for (let y = -8; y < -5; y++) k.H(5, y, 6, mix(PAL.paper_d, PAL.g3, 0.5)); }
  // brass gooseneck lamp over the desk
  const b = BRASS;
  k.P(13, -9, b.dk); k.P(13, -10, b.md); k.P(13, -11, b.md); k.P(12, -12, b.md); k.P(11, -13, b.lt); k.P(10, -13, b.lt);
  k.R(7, -14, 4, 2, o.clean ? PAL.green_d : mix(PAL.green_dd, PAL.g1, 0.3)); k.H(7, -14, 4, o.clean ? PAL.green_l : PAL.green_d);
  k.H(8, -12, 2, o.clean ? PAL.yellow_l : PAL.cream_d);
  if (!o.clean) k.S(1, -9, 14, 3, 'rgba(160,150,130,0.4)', 0.08);
  return k.done();
}

// ---------------------------------------------------------------------------- piano (2×1)
function piano(o) {
  const k = new K(34, 34, -1, -20, seedOf('piano', o.clean));
  const W = o.clean ? woodSet(true, 'walnut') : woodSet(false, 'walnut');
  k.shadow(1, 12, 31, 4, SHADOW);
  // case: top (lit), upper panel with fretwork, keyboard shelf, lower panel, toe blocks
  k.R(0, -18, 32, 3, W.lt); k.H(0, -18, 32, W.hi);
  k.R(0, -15, 32, 13, W.md); k.wood(1, -14, 30, 11, W.md, { dark: W.dk, light: W.lt, density: 0.35 });
  k.V(0, -15, 13, W.lt); k.V(31, -15, 13, W.dd);
  k.frame(4, -13, 24, 8, W.dk);
  for (let x = 6; x < 26; x += 3) { k.V(x, -12, 6, W.dd); k.P(x + 1, -12, W.lt); } // fretwork
  // music desk with sheet music
  k.R(9, -6, 14, 2, W.dk); k.H(9, -6, 14, W.lt);
  if (!o.clean) { k.R(11, -11, 9, 5, PAL.paper_d); k.H(11, -11, 9, PAL.paper); for (let y = -10; y < -6; y += 2) k.H(12, y, 7, PAL.g4); }
  else { k.R(11, -11, 9, 5, PAL.paper); for (let y = -10; y < -6; y += 2) k.H(12, y, 7, PAL.g3); }
  // keyboard: key bed seen from above, white keys yellowed, black keys
  k.R(0, -2, 32, 5, W.dk);
  const keyW = o.clean ? PAL.white : mix(PAL.paper, PAL.yellow, 0.25), keyD = o.clean ? PAL.g6 : mix(PAL.paper_d, PAL.mustard_d, 0.25);
  k.R(2, -1, 28, 3, keyW); k.H(2, 1, 28, keyD);
  for (let x = 3; x < 30; x += 2) k.P(x, 1, keyD);
  const blk = [0, 1, 3, 4, 5];
  for (let i = 0, x = 3; x < 29; i++, x += 2) if (blk.includes(i % 7)) { k.V(x, -1, 2, PAL.ink); if (!o.clean && i % 9 === 4) k.V(x, -1, 2, keyD); } // a missing black key
  if (!o.clean) { k.P(9, 0, PAL.brown_d); k.P(17, 0, PAL.brown_d); k.P(22, -1, PAL.cream_d); } // chips
  k.H(0, 2, 32, W.dd);
  // lower panel
  k.R(1, 3, 30, 9, W.md); k.frame(4, 4, 24, 7, W.dk); k.V(1, 3, 9, W.lt);
  k.R(0, 11, 4, 3, W.dk); k.R(28, 11, 4, 3, W.dk);
  k.R(13, 11, 2, 2, BRASS.md); k.R(17, 11, 2, 2, BRASS.md); k.P(13, 11, BRASS.hi); k.P(17, 11, BRASS.hi); // pedals
  if (!o.clean) {
    k.S(0, -18, 32, 3, 'rgba(170,160,140,0.5)', 0.2); // dust on the lid
    k.R(22, -21, 6, 3, PAL.paper_d); k.H(22, -21, 6, PAL.paper); k.P(27, -19, PAL.g4); // a stack of music
    k.L(5, 5, 8, 9, W.hi);
  } else { k.H(1, -14, 30, lt(W.md, 0.15)); }
  return k.done();
}

// ---------------------------------------------------------------------------- music_stand
function musicStand(o) {
  const k = new K(16, 34, 0, -20, seedOf('mstand', o.variant, o.clean));
  const blk = o.clean ? { hi: PAL.g3, md: PAL.g1, dk: PAL.shadow } : { hi: mix(PAL.g3, PAL.rust, 0.25), md: PAL.g1, dk: PAL.night };
  k.shadowE(8, 13, 5, 2, SHADOW_SOFT);
  k.L(8, 7, 3, 13, blk.md); k.L(8, 7, 13, 13, blk.md); k.L(8, 7, 8, 12, blk.dk);
  k.V(8, -8, 16, blk.md); k.V(7, -8, 15, blk.hi);
  // desk, tilted back (top edge recedes)
  const tilt = !o.clean && o.variant % 2 ? 1 : 0;
  k.poly([[2, -17 + tilt], [14, -17], [14, -8], [2, -8 + tilt]], blk.md);
  k.H(2, -17 + tilt, 12, blk.hi);
  for (let x = 3; x < 14; x += 2) k.V(x, -16, 7, blk.dk); // slots
  k.H(2, -8, 12, blk.hi); k.H(2, -7, 12, blk.dk); // ledge
  // sheet music (alma mater), curled
  const pc = o.clean ? PAL.paper : PAL.paper_d;
  k.R(4, -15, 8, 7, pc); k.V(11, -15, 7, dk(pc, 0.12));
  for (let y = -14; y < -9; y += 2) { k.H(5, y, 6, PAL.g4); k.P(5 + (y & 3), y - 1, PAL.g2); }
  if (!o.clean) { k.clear(11, -15); k.P(10, -14, dk(pc, 0.25)); }
  return k.done();
}

// ---------------------------------------------------------------------------- phonograph (Califone)
function phonograph(o) {
  const k = new K(18, 34, -1, -20, seedOf('phono', o.clean));
  const W = woodSet(o.clean, 'oak');
  k.shadow(1, 12, 14, 3, SHADOW);
  // small wooden stand
  for (const lx of [2, 12]) { k.R(lx, 0, 2, 13, W.dk); k.V(lx, 0, 13, W.md); }
  k.R(2, 9, 12, 1, W.dk);
  k.box(0, -4, 16, 2, 3, { top: W.lt, front: W.md });
  // the case: blue-gray leatherette, lid propped up behind with the speaker grille
  const cs = o.clean ? { hi: mix(PAL.blue_l, PAL.g5, 0.4), md: mix(PAL.blue, PAL.g4, 0.45), dk: mix(PAL.blue_d, PAL.g2, 0.4) } : { hi: mix(PAL.blue_l, PAL.g4, 0.55), md: mix(PAL.blue, PAL.g3, 0.55), dk: mix(PAL.blue_d, PAL.g1, 0.5) };
  k.R(2, -16, 12, 7, cs.md); k.H(2, -16, 12, cs.hi); k.V(13, -16, 7, cs.dk);
  for (let y = -14; y < -10; y++) for (let x = 4; x < 12; x++) if ((x + y) % 2 === 0) k.P(x, y, cs.dk); // grille
  k.R(1, -9, 14, 5, cs.dk); k.H(1, -9, 14, cs.md);
  // platter + the 78 (black, red label), tone arm
  k.E(7, -7, 4, 1, PAL.g2); k.E(7, -7, 4, 1, PAL.ink); k.H(4, -8, 6, PAL.g2);
  k.P(7, -7, o.clean ? PAL.red : PAL.red_d); k.P(6, -7, o.clean ? PAL.red_l : PAL.red);
  k.L(13, -8, 10, -6, PAL.g5); k.P(13, -9, PAL.g6); k.P(10, -6, PAL.white);
  k.R(2, -5, 12, 1, cs.dk); k.P(12, -6, PAL.amber_l); // pilot light
  if (!o.clean) k.S(1, -16, 14, 10, 'rgba(160,150,130,0.35)', 0.05);
  return k.done();
}

// ---------------------------------------------------------------------------- instrument_case
function instrumentCase(o) {
  const open = o.state === 'open';
  const k = new K(20, 24, -2, -8, seedOf('icase', o.state, o.clean));
  const blk = { hi: PAL.g3, md: PAL.g1, dk: PAL.shadow };
  k.shadow(1, 11, 14, 3, SHADOW_SOFT);
  if (!open) {
    k.R(1, 4, 14, 6, blk.md); k.H(2, 3, 12, blk.hi); k.H(1, 4, 14, blk.hi); k.H(1, 9, 14, blk.dk);
    k.R(2, 4, 12, 1, PAL.g2);
    k.P(4, 6, BRASS.lt); k.P(11, 6, BRASS.lt); k.P(4, 7, BRASS.dk); k.P(11, 7, BRASS.dk); // latches
    k.R(7, 2, 3, 1, PAL.g2); // handle
    // name tag on a string: WEBB
    k.P(10, 2, PAL.g4); k.R(11, 0, 5, 3, o.clean ? PAL.paper : PAL.paper_d); k.H(12, 1, 3, PAL.ink);
  } else {
    // lid open behind: plush lining (crushed blue), a folded page tucked in its pocket
    const plush = o.clean ? PAL.blue : mix(PAL.blue_d, PAL.g2, 0.3), plushL = o.clean ? PAL.blue_l : mix(PAL.blue, PAL.g3, 0.3);
    k.R(1, -3, 14, 6, blk.md); k.R(2, -2, 12, 4, plush); k.H(2, -2, 12, plushL);
    if (!o.clean) { k.R(4, -1, 6, 3, PAL.paper); k.H(4, 1, 6, PAL.paper_d); k.P(5, 0, PAL.blue_d); k.P(7, 0, PAL.blue_d); }
    // body: lining with the clarinet in its sections
    k.R(1, 3, 14, 7, blk.md); k.R(2, 4, 12, 5, plush); k.H(2, 4, 12, plushL);
    k.H(3, 5, 7, PAL.ink); k.P(10, 5, PAL.g5); k.P(5, 5, PAL.g5); k.P(7, 5, PAL.g6);   // upper joint
    k.H(4, 7, 6, PAL.ink); k.P(6, 7, PAL.g5); k.P(8, 7, PAL.g6);                       // lower joint
    k.R(11, 6, 2, 2, PAL.ink); k.P(11, 6, PAL.g4);                                      // bell
    k.H(1, 9, 14, blk.dk);
    k.R(11, 0, 5, 3, o.clean ? PAL.paper : PAL.paper_d); k.H(12, 1, 3, PAL.ink);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- stage_flat (2×1)
function stageFlat(o) {
  const k = new K(34, 36, -1, -22, seedOf('flat', o.variant, o.label, o.clean));
  let year = (o.label.match(/19\d\d/) || [])[0] || ['1945', '1962', '1928'][o.variant % 3];
  const W = woodSet(o.clean, 'oak');
  k.shadow(1, 11, 30, 4, SHADOW_SOFT);
  // leaning: the top sits back against the wall (x shifts 0 → top tilted toward the wall = up)
  const x0 = 1, y0 = -20, w = 30, h = 31;
  // canvas painted scene: dusk sky, a hill with the colliery tipple, the year
  const sky = o.clean ? PAL.blue : mix(PAL.blue_d, PAL.g2, 0.35), sky2 = o.clean ? PAL.mustard : mix(PAL.mustard_d, PAL.g2, 0.4);
  k.R(x0, y0, w, h, sky);
  k.DV(x0, y0 + 8, w, 10, sky2, 0.0, 0.8);
  k.R(x0, y0 + 18, w, 13, o.clean ? PAL.green_d : mix(PAL.green_dd, PAL.g1, 0.3));
  k.poly([[x0, y0 + 20], [x0 + 10, y0 + 15], [x0 + 22, y0 + 17], [x0 + w, y0 + 14], [x0 + w, y0 + 31], [x0, y0 + 31]], o.clean ? PAL.green : mix(PAL.green_d, PAL.g2, 0.3));
  // tipple silhouette
  k.R(x0 + 20, y0 + 9, 5, 7, PAL.g1); k.L(x0 + 20, y0 + 9, x0 + 17, y0 + 16, PAL.g1); k.R(x0 + 22, y0 + 6, 1, 3, PAL.g1);
  // lettering, gold paint
  const gold = o.clean ? PAL.yellow_l : mix(PAL.yellow, PAL.g4, 0.4);
  k.text(x0 + 3, y0 + 2, 'HOME', gold); k.text(x0 + 3, y0 + 8, 'COMING', gold);
  // the year, doubled-up 3×5 for a bigger hand-painted look
  const tmp = new K(16, 5, 0, 0); tmp.text(0, 0, year, gold);
  k.x.save(); k.x.imageSmoothingEnabled = false; k.x.drawImage(tmp.c, 0, 0, 15, 5, x0 + 8 - k.ox, y0 + 19 - k.oy, 15, 10); k.x.restore();
  // frame (stiles + rails) showing at the edges
  k.frame(x0, y0, w, h, W.md); k.H(x0, y0, w, W.hi); k.V(x0 + w - 1, y0, h, W.dk);
  if (!o.clean) {
    // flaked paint, water tide-lines, a torn corner showing the batten behind
    k.S(x0 + 1, y0 + 1, w - 2, h - 2, mix(PAL.cream_d, PAL.g3, 0.4), 0.05);
    k.DV(x0 + 1, y0 + 22, w - 2, 8, 'rgba(40,30,20,0.6)', 0.0, 0.5);
    k.poly([[x0 + w - 7, y0 + 1], [x0 + w - 1, y0 + 1], [x0 + w - 1, y0 + 6]], mix(PAL.paper_d, PAL.brown, 0.4));
    k.L(x0 + w - 7, y0 + 1, x0 + w - 1, y0 + 6, W.dk);
  }
  // brace foot on the floor
  k.R(x0 + 4, 9, 3, 2, W.dk); k.R(x0 + w - 7, 9, 3, 2, W.dk);
  return k.done();
}

// ---------------------------------------------------------------------------- lever (wall)
function lever(o) {
  const down = o.state === 'down';
  const k = new K(16, 30, 0, -16, seedOf('lever', o.state, o.clean));
  const I = o.clean ? { hi: PAL.g4, md: PAL.g3, dk: PAL.g1 } : { hi: mix(PAL.g3, PAL.rust, 0.35), md: mix(PAL.g2, PAL.rust, 0.2), dk: PAL.g1 };
  // backplate + toothed quadrant
  k.R(4, -8, 8, 18, I.md); k.frame(4, -8, 8, 18, I.dk); k.H(4, -8, 8, I.hi);
  for (const [x, y] of [[5, -7], [10, -7], [5, 8], [10, 8]]) k.P(x, y, I.hi);
  k.ring(8, 6, 6, 6, I.dk); for (let a = 0; a < 9; a++) { const t = Math.PI * (1 + a / 8); k.P(Math.round(8 + Math.cos(t) * 6), Math.round(6 + Math.sin(t) * 6), I.hi); }
  // label plate
  k.R(5, -5, 6, 3, o.clean ? PAL.paper : PAL.paper_d); k.H(6, -4, 4, PAL.g2);
  // the handle from the pivot
  const px0 = 8, py0 = 6;
  const tip = down ? [13, 13] : [3, -12];
  k.LT(px0, py0, tip[0], tip[1], 2, I.md);
  k.L(px0 - 1, py0 - 1, tip[0] - 1, tip[1] - 1, I.hi);
  k.R(tip[0] - 1, tip[1] - 2, 3, 4, o.clean ? PAL.red : mix(PAL.red_d, PAL.g2, 0.3)); k.P(tip[0] - 1, tip[1] - 2, o.clean ? PAL.red_l : PAL.red); // grip
  k.E(px0, py0, 1, 1, I.dk); k.P(px0 - 1, py0 - 1, I.hi);
  if (!o.clean) { k.rust(4, -8, 8, 18, 3); k.drip(6, 10, 4); }
  return k.done();
}

// ---------------------------------------------------------------------------- rope_rail (2×1 wall)
function ropeRail(o) {
  const k = new K(32, 34, 0, -18, seedOf('rope', o.clean));
  const W = woodSet(o.clean, 'oak');
  const rope = o.clean ? PAL.tan_l : mix(PAL.tan, PAL.g3, 0.3), ropeD = o.clean ? PAL.tan : mix(PAL.brown, PAL.g2, 0.3);
  // ropes from the flies down to the pin rail
  const xs = [3, 7, 11, 16, 20, 25, 28];
  for (const x of xs) { for (let y = -18; y < 2; y++) k.P(x, y, (y & 1) ? rope : ropeD); }
  // pin rail (heavy timber) with belaying pins and figure-eight tie-offs
  k.R(0, 2, 32, 4, W.md); k.H(0, 2, 32, W.hi); k.H(0, 5, 32, W.dd);
  for (const x of xs) { k.R(x - 1, 0, 3, 2, rope); k.P(x, 1, ropeD); k.V(x, 6, 3, W.dk); k.P(x, 6, W.hi); }
  // hanging coils
  for (const x of [7, 20]) { k.E(x, 8, 2, 3, ropeD); k.E(x, 8, 1, 2, 'rgba(0,0,0,0)'); k.ring(x, 8, 2, 3, rope); }
  // sandbags on two lines
  for (const [x, y] of [[13, -6], [25, -12]]) {
    const sb = o.clean ? PAL.cream_d : mix(PAL.cream_d, PAL.brown, 0.3);
    k.R(x - 1, y, 4, 5, sb); k.H(x - 1, y, 4, lt(sb, 0.15)); k.V(x + 2, y, 5, dk(sb, 0.25)); k.P(x, y - 1, ropeD);
    if (!o.clean) k.P(x + 1, y + 4, PAL.brown_d);
  }
  if (!o.clean) k.S(0, -18, 32, 26, 'rgba(160,150,130,0.25)', 0.03);
  return k.done();
}

export const AUD = {
  aud_seat: { build: audSeat, facing: ['up', 'down'], defaultDir: 'up', variants: 4, occupant: true,
    showFacing: ['up', 'down'], showOccupants: ['husk_a', 'husk_c:turned', 'husk_f', 'husk_b:crumbled'] },
  curtain: { build: curtain, variants: 4 },
  lectern: { build: lectern },
  piano: { build: piano },
  music_stand: { build: musicStand, variants: 2 },
  phonograph: { build: phonograph },
  instrument_case: { build: instrumentCase },
  stage_flat: { build: stageFlat, variants: 3, label: true, showVariants: [0, 1] },
  lever: { build: lever },
  rope_rail: { build: ropeRail },
};
