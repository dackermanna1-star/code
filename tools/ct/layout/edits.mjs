// Hand-authored design data for CHINATWN, applied by tools/ct/build-map.mjs on
// top of the measured raster (raster.json) and points (ref.json).
// Coordinates are real NMRiH (Source) units of the named layer; the builder
// applies the layer offsets (subway x-5000, sewer x+6000) and snaps to 8.
//
// Tags and specials follow tools/ct/SPEC.md sections 5-9. Extra tag used by
// this map (builder's call, SPEC section 8 leaves it free):
//   sector tag 3  = welder-garage doorway (garage_door1), a door sector that
//                   starts OPEN; the script may close it on its 50% roll.

// ---------------------------------------------------------------------------
// Zones: first match wins (box = [x0,y0,x1,y1] real coords; no box = layer default).
export const ZONES = [
  { name: 'subway', layer: 'subway', sky: 512, light: 104, lightIn: 104, style: 'subway' },
  { name: 'sewer', layer: 'sewer', sky: 512, light: 88, lightIn: 88, style: 'sewer' },
  { name: 'docks', layer: 'street', box: [-3800, 880, 2600, 4400], sky: 640, light: 120, lightIn: 128, style: 'docks' },
  { name: 'west', layer: 'street', box: [-3800, -1800, -1180, 880], sky: 576, light: 120, lightIn: 136, style: 'west' },
  { name: 'north', layer: 'street', box: [-1700, -2720, 640, -1180], sky: 576, light: 120, lightIn: 136, style: 'chinatown' },
  { name: 'east', layer: 'street', box: [-1000, -4320, 2600, -1180], sky: 576, light: 128, lightIn: 144, style: 'chinatown' },
  { name: 'passage', layer: 'street', box: [-2700, -5000, -2048, -4760], sky: 512, light: 96, lightIn: 96, style: 'subway' },
  { name: 'start', layer: 'street', sky: 512, light: 120, lightIn: 136, style: 'downtown' },
];
export const LETHAL_WATER = true;
// Facade strips on street faces of building blocks (see build-map.mjs).
export const FACADE = { band: 128, maxTop: 832, zones: ['start', 'east', 'north', 'west', 'docks'] };
const SHOPBAND = { downtown: ['CTSHOP4', 'CTSHUT1', 'CTSHOP6', 'CTBRK1', 'CTSHUT2', 'CTSHOP5'], chinatown: ['CTSHOP1', 'CTSHOP2', 'CTSHOP3', 'CTSHUT2', 'CTSHOP5', 'CTSHUT1'],
  west: ['CTSHOP3', 'CTSHUT1', 'CTSHOP1', 'CTBRK2', 'CTSHUT2'], docks: ['CTSHUT1', 'CTMETL2', 'CTSHUT2', 'CTCONC2'] };
const UPPER = { downtown: ['CTAPT1', 'CTBRK1', 'CTAPT2', 'CTSTUC1', 'CTBRK2'], chinatown: ['CTAPT2', 'CTAPT1', 'CTSTUC2', 'CTBRK1', 'CTSTUC1'],
  west: ['CTSTUC1', 'CTAPT2', 'CTBRK1', 'CTSTUC2'], docks: ['CTMETL1', 'CTCONC2', 'CTBRK2', 'CTMETL2'] };
// shop band texture (ground floor): stays the same along ~128 units of a facade
export function facadeLower(cls, zone, k) {
  if (cls === 'glass') return SHOPS[hash(k >> 4) % SHOPS.length];
  if (cls === 'shutter') return 'CTSHUT1';
  const list = SHOPBAND[zone.style] || SHOPBAND.downtown;
  const cellsW = 1736; // grid width: group cells in 16x16-cell tiles so neighbours share a texture
  const i = k % cellsW, j = Math.floor(k / cellsW);
  return list[hash((i >> 4) * 977 + (j >> 4) * 131) % list.length];
}
export function facadeUpper(cls, zone, block) {
  if (cls === 'container') return 'CTCONT' + (1 + (hash(block) % 3));
  const list = UPPER[zone.style] || UPPER.downtown;
  return list[hash(block + 3) % list.length];
}

// Solid blocks at most this tall become raised sectors (see build-map.mjs).
export const LOWBLOCK = { maxHeight: 192, maxCells: 4000 };
export const lowBlockFlat = (tex) => (tex.startsWith('CTCONT') || tex.startsWith('CTMETL') ? 'CFMETL1' : tex === 'CTWOOD1' ? 'CFWOOD1' : 'CFROOF1');

// ---------------------------------------------------------------------------
// Texture sizes (SPEC section 3.1).
const SIZES = {
  CTDOOR1: [64, 128], CTDOOR2: [64, 128], CTBORD1: [64, 128], CTBORD3: [64, 128], CTGLAS1: [64, 128], CTGLAS2: [64, 128],
  CTPILR1: [64, 128], CTLADR1: [64, 128], CTLADR2: [64, 128], CTLADR3: [64, 128], CTNSG7: [64, 128],
  CTSTEP1: [64, 32], CTRAIL1: [64, 32], CTTRIM1: [128, 32], CTROOF1: [128, 64], CTNPAI1: [128, 64],
  CTBUT1: [64, 64], CTBUT2: [64, 64], CTGEN1: [64, 64], CTSOCK1: [64, 64], CTSOCK2: [64, 64], CTRADI1: [64, 64], CTRADI2: [64, 64],
  CTPADL1: [64, 64], CTPADL2: [64, 64], CTCRNK1: [64, 64], CTNSG9: [64, 64], CTDARK1: [64, 64], CTSEWR3: [64, 64],
  CTNSG1: [32, 128], CTNSG2: [128, 32], CTNSG3: [128, 32], CTNSG4: [128, 32], CTNSG5: [128, 32], CTNSG6: [128, 32], CTNSG8: [128, 32],
  CTSKY1: [1024, 128],
};
export const texWidth = (n) => (SIZES[n] ? SIZES[n][0] : 128);
export const texHeight = (n) => (SIZES[n] ? SIZES[n][1] : 128);

// ---------------------------------------------------------------------------
// Surface styles.
const FACADES = {
  downtown: ['CTBRK1', 'CTAPT1', 'CTSTUC1', 'CTBRK2', 'CTAPT2', 'CTBRK1'],
  chinatown: ['CTAPT2', 'CTSTUC2', 'CTBRK1', 'CTAPT1', 'CTSTUC1', 'CTBRK2'],
  west: ['CTSTUC1', 'CTBRK1', 'CTAPT2', 'CTSTUC2', 'CTBRK2'],
  docks: ['CTMETL1', 'CTCONC2', 'CTBRK2', 'CTMETL2', 'CTCONC1'],
};
const SHOPS = ['CTSHOP1', 'CTSHOP2', 'CTSHOP3', 'CTSHOP4', 'CTSHOP5', 'CTSHOP6'];
const INTERIOR = {
  brick: 'CTBRK2', brick2: 'CTBRK2', facade: 'CTPLAS1', facade2: 'CTCONC1', tile: 'CTTILE3', concrete: 'CTCONC1', plaster: 'CTPLAS1',
  wood: 'CTWOOD1', metal: 'CTMETL2', stone: 'CTCONC2', sewer: 'CTSEWR1', glass: 'CTPLAS1', fence: 'CTFENC1', shutter: 'CTSHUT1',
  trim: 'CTCONC2', step: 'CTCONC1', container: 'CTCONT1',
};
const SUBWAY = {
  brick: 'CTTILE2', brick2: 'CTTILE2', facade: 'CTTILE2', facade2: 'CTTILE1', tile: 'CTTILE1', concrete: 'CTCONC1', plaster: 'CTTILE1',
  wood: 'CTWOOD1', metal: 'CTMETL2', stone: 'CTCONC2', sewer: 'CTSEWR1', glass: 'CTTILE2', fence: 'CTFENC1', shutter: 'CTSHUT1',
  trim: 'CTCONC2', step: 'CTCONC1', container: 'CTMETL1',
};
const SEWER = {
  brick: 'CTSEWR1', brick2: 'CTSEWR1', facade: 'CTSEWR2', facade2: 'CTSEWR2', tile: 'CTSEWR1', concrete: 'CTSEWR2', plaster: 'CTSEWR2',
  wood: 'CTWOOD1', metal: 'CTMETL2', stone: 'CTSEWR1', sewer: 'CTSEWR1', glass: 'CTSEWR2', fence: 'CTFENC1', shutter: 'CTMETL2',
  trim: 'CTSEWR2', step: 'CTCONC2', container: 'CTMETL2',
};
const hash = (n) => { let x = (n | 0) * 2654435761; x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13; return x >>> 0; };

export function wallTex(cls, zone, outdoor, ctx) {
  if (zone.style === 'subway') return SUBWAY[cls] || 'CTTILE1';
  if (zone.style === 'sewer') return SEWER[cls] || 'CTSEWR1';
  if (!outdoor) return INTERIOR[cls] || 'CTPLAS1';
  const b = ctx && ctx.block !== undefined ? hash(ctx.block + 7) : 0;
  if (cls === 'glass') return SHOPS[b % SHOPS.length];
  if (cls === 'shutter') return b & 1 ? 'CTSHUT2' : 'CTSHUT1';
  if (cls === 'fence') return 'CTFENC1';
  if (cls === 'wood') return 'CTWOOD1';
  if (cls === 'container') return 'CTCONT' + (1 + (b % 3));
  if (cls === 'metal') return zone.style === 'docks' ? (b & 1 ? 'CTMETL1' : 'CTMETL2') : 'CTMETL2';
  if (cls === 'concrete' || cls === 'step' || cls === 'trim') return zone.style === 'docks' ? 'CTCONC2' : 'CTCONC1';
  const list = FACADES[zone.style] || FACADES.downtown;
  return list[b % list.length];
}

export function lowerTex(diff, zone, ctxTex, kind) {
  if (kind === 3) return zone.style === 'docks' ? 'CTCONC2' : 'CTSEWR2';
  if (diff <= 24) return zone.style === 'sewer' ? 'CTSEWR2' : 'CTSTEP1';
  if (zone.style === 'subway') return 'CTCONC1';
  return ctxTex || 'CTCONC1';
}

export function floorFlat(cls, zone, outdoor) {
  const s = zone.style;
  switch (cls) {
    case 'road': return 'CFASPH1';
    case 'roadline': return 'CFASPH2';
    case 'sidewalk': return 'CFSIDE1';
    case 'wood': return s === 'docks' && outdoor ? 'CFWOOD2' : 'CFWOOD1';
    case 'tile': return s === 'subway' ? 'CFTILE1' : 'CFTILE3';
    case 'metal': return 'CFMETL1';
    case 'dirt': return 'CFDIRT1';
    case 'stairs': return s === 'subway' ? 'CFTILE1' : 'CFCONC1';
    case 'carpet': return 'CFWOOD1';
    case 'water': return s === 'sewer' ? 'CFSEW1' : 'CFBAY1';
    default:
      if (s === 'subway') return 'CFTILE1';
      if (s === 'sewer') return 'CFCONC2';
      return outdoor ? 'CFCONC1' : 'CFCONC2';
  }
}

export function ceilFlat(cls, zone) {
  if (zone.style === 'sewer') return 'CFCEIL2';
  switch (cls) {
    case 'tiles': return 'CFCEIL1';
    case 'wood': return 'CFWOOD1';
    case 'metal': return 'CFMETL1';
    default: return 'CFCEIL2';
  }
}

// ---------------------------------------------------------------------------
// Construction helpers (all coordinates real, per layer).
let A; // api
const DIR = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
const floorNear = (layer, x, y) => {
  for (let r = 0; r <= 64; r += 8) {
    for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const c = A.cell(layer, x + dx, y + dy);
      if (c && c.kind === 1) return c.floor;
    }
  }
  return 0;
};

// Door sector across a doorway. r = door strip [x0,y0,x1,y1]; axis = travel axis ('x' or 'y');
// header = opening height above the floor; tex = door face; frame = depth of the header strips.
function door(layer, r, o) {
  const fl = o.floor !== undefined ? o.floor : floorNear(layer, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
  const hdr = fl + (o.header || 112);
  const g = A.newGroup();
  const fr = o.frame === undefined ? 8 : o.frame;
  if (fr) {
    const f1 = o.axis === 'x' ? [r[0] - fr, r[1], r[0], r[3]] : [r[0], r[1] - fr, r[2], r[1]];
    const f2 = o.axis === 'x' ? [r[2], r[1], r[2] + fr, r[3]] : [r[0], r[3], r[2], r[3] + fr];
    // outdoor gates get sky-coloured headers (sky hack): open sky above the gate
    for (const f of [f1, f2]) A.carve(layer, f, { floor: fl, ceil: hdr, group: g + 4000, light: o.light, special: 0, fflat: 'CFMETL1', cflat: o.skyFrame ? 'F_SKY1' : 'CFCEIL2' });
  }
  A.carve(layer, r, { floor: fl, ceil: o.open ? hdr : fl, tag: o.tag || 0, uptex: o.tex || 'CTDOOR2', group: g, light: o.light, cflat: 'CFMETL1', fflat: 'CFMETL1', special: 0 });
  // jambs: void cells beside the strip
  const jt = o.jamb || 'CTMETL2';
  if (o.axis === 'x') { A.wallTex(layer, [r[0], r[1] - 8, r[2], r[1]], jt); A.wallTex(layer, [r[0], r[3], r[2], r[3] + 8], jt); }
  else { A.wallTex(layer, [r[0] - 8, r[1], r[0], r[3]], jt); A.wallTex(layer, [r[2], r[1], r[2] + 8, r[3]], jt); }
  if (o.special) {
    // DR-style doors: specials on both faces
    if (o.axis === 'x') { A.line(layer, [r[0], r[1], r[0], r[3]], { special: o.special, front: 'w' }); A.line(layer, [r[2], r[1], r[2], r[3]], { special: o.special, front: 'e' }); }
    else { A.line(layer, [r[0], r[1], r[2], r[1]], { special: o.special, front: 's' }); A.line(layer, [r[0], r[3], r[2], r[3]], { special: o.special, front: 'n' }); }
  }
}

// Recess cut into the wall that faces `face` near (x,y): used for buttons,
// panels and signs (shows the texture exactly once). Returns the back line.
function niche(layer, x, y, face, o) {
  const [dx, dy] = DIR[face];
  // walk from the walkable side into the wall
  const wall = A.findWall(layer, x + dx * 24, y + dy * 24, -dx, -dy, 256);
  if (wall === null) { A.log(`niche ${o.tex} at ${layer} (${x},${y}) found no wall`); return null; }
  const w = o.w || 64, d = o.depth || 8;
  const fl = o.floorRef !== undefined ? o.floorRef : floorNear(layer, x + dx * 24, y + dy * 24);
  const z0 = fl + (o.z0 !== undefined ? o.z0 : 32), z1 = o.z1 !== undefined ? fl + o.z1 : z0 + texHeight(o.tex);
  let r, back;
  if (face === 'e') { r = [wall - d, y - w / 2, wall, y + w / 2]; back = [wall - d, y - w / 2, wall - d, y + w / 2]; }
  else if (face === 'w') { r = [wall, y - w / 2, wall + d, y + w / 2]; back = [wall + d, y - w / 2, wall + d, y + w / 2]; }
  else if (face === 'n') { r = [x - w / 2, wall - d, x + w / 2, wall]; back = [x - w / 2, wall - d, x + w / 2, wall - d]; }
  else { r = [x - w / 2, wall, x + w / 2, wall + d]; back = [x - w / 2, wall + d, x + w / 2, wall + d]; }
  A.carve(layer, r, { kind: 2, floor: z0, ceil: z1, onlyVoid: true, group: A.newGroup(), light: o.light, fflat: 'CFMETL1', cflat: 'CFMETL1' });
  return A.line(layer, back, { onWall: true, mid: o.tex, special: o.special || 0, tag: o.tag || 0, xoff: o.xoff || 0, yoff: 0 });
}

// Raised box (console, panel, post): floor raised by h, faces textured.
function box(layer, r, o) {
  const fl = floorNear(layer, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
  A.carve(layer, r, { kind: 2, floor: fl + o.h, ceil: o.ceil !== undefined ? o.ceil : undefined, steptex: o.tex, fflat: o.top || 'CFMETL1', group: A.newGroup(), light: o.light });
  for (const f of o.use || []) {
    const seg = f === 'n' ? [r[0], r[3], r[2], r[3]] : f === 's' ? [r[0], r[1], r[2], r[1]] : f === 'e' ? [r[2], r[1], r[2], r[3]] : [r[0], r[1], r[0], r[3]];
    A.line(layer, seg, { special: o.special, tag: o.tag, front: f, bottom: o.tex, xoff: 0 });
  }
}

// Masked blocking line across an opening (fence, gate, boards, glass).
const barrierLine = (layer, seg, mid, o = {}) => A.line(layer, seg, { flags: 1, mid, special: o.special || 0, tag: o.tag || 0, front: o.front, peg: o.peg || 'bottom', yoff: 0, optional: o.optional });

// ---------------------------------------------------------------------------
// Geometry edits (before styling).
export function geometry(api) {
  A = api;
  const S = 'subway', T = 'street', W = 'sewer';

  // === SUBWAY =============================================================
  // Trackbed west of the platform (not walkable: blocking edge), 64 lower.
  A.carve(S, [-2832, -6920, -2560, -5000], { onlyVoid: true, kind: 2, floor: -640, ceil: -400, fflat: 'CFTRAK1', cflat: 'CFCEIL2', light: 88 });
  A.wallTex(S, [-2848, -6936, -2832, -4920], 'CTTILE2');
  A.set(S, [-2560, -6912, -2544, -4936], { fflat: 'CFPLAT1' });
  // Chain-link fence with the chained double gate across the platform's north end.
  barrierLine(S, [-2560, -4880, -2432, -4880], 'CTFENC1', { optional: true });
  barrierLine(S, [-2432, -4880, -2336, -4880], 'CTGATE1', { special: 903, tag: 50, front: 's' });
  barrierLine(S, [-2336, -4880, -2200, -4880], 'CTFENC1', { optional: true });
  // Maintenance room door off the mezzanine.
  A.carve(S, [-2312, -4120, -2232, -4072], { floor: -384, ceil: -272 });
  door(S, [-2264, -4120, -2256, -4072], { axis: 'x', header: 112, special: 1, tex: 'CTDOOR2', frame: 8 });
  // Ticket-hall freight-elevator door (sector tag 1) and its button (904/1).
  door(S, [-2688, -4936, -2672, -4824], { axis: 'x', floor: -256, header: 112, tag: 1, tex: 'CTELEV1', frame: 8, jamb: 'CTMETL2' });
  // Portal 100 seam (subway side) and the dark stub beyond it.
  A.set(S, [-2632, -5000, -2560, -4760], { light: 72 });
  A.wallTex(S, [-2568, -5000, -2552, -4760], 'CTDARK1');

  // === EXIT PASSAGE (street layer) ========================================
  A.set(T, [-2688, -5000, -2600, -4760], { light: 72 });
  A.wallTex(T, [-2688, -4992, -2672, -4768], 'CTELEV1');

  // === GENERATOR YARD / ARCH GATE ==========================================
  // Roll-up gate (sector tag 2) in the N-S wall at x=-1016.
  door(T, [-1024, -4240, -1008, -4080], { axis: 'x', header: 128, tag: 2, tex: 'CTGRGE1', frame: 8, jamb: 'CTPILR1', skyFrame: true });
  A.solid(T, [-1032, -4256, -1000, -4240], 'CTPILR1');
  A.solid(T, [-1032, -4080, -1000, -4064], 'CTPILR1');
  // Paifang arch behind the gate: two red pillars, roof eave + name board on a beam.
  for (const py of [[-4296, -4248], [-4032, -3984]]) {
    A.carve(T, [-984, py[0], -944, py[1]], { kind: 2, floor: 352, ceil: 'sky', steptex: 'CTPILR1', fflat: 'CFROOF1', group: A.newGroup(), light: 136 });
  }
  A.carve(T, [-992, -4248, -936, -4032], { ceil: 352, cflat: 'F_SKY1', group: 9001, light: 136 }); // local sky band at the roofline
  A.carve(T, [-984, -4248, -944, -4032], { ceil: 288, cflat: 'CFROOF1', uptex: 'CTROOF1', group: 9002, light: 136 }); // eave
  A.carve(T, [-976, -4248, -952, -4032], { ceil: 224, cflat: 'CFWOOD1', uptex: 'CTNPAI1', group: 9003, light: 144 }); // name board

  // === MARKET: switch room window (unbreakable glass, north wall) ==========
  // (window strip carved where the glass brush was)
  A.carve(T, [1008, -2696, 1120, -2688], { floor: 42, ceil: 94, group: A.newGroup(), kind: 2 });
  barrierLine(T, [1008, -2688, 1120, -2688], 'CTGLAS1', { front: 'n', peg: 'bottom' });
  // Shortcut door storedoor01 (sector tag 4), opens east into the yard.
  door(T, [1024, -3120, 1040, -3008], { axis: 'x', header: 112, tag: 4, tex: 'CTDOOR2', frame: 8 });

  // === SAFE ROOM thin metal doors (DR) =====================================
  door(T, [1536, -2144, 1544, -2080], { axis: 'x', header: 112, special: 1, tex: 'CTDOOR2', frame: 8 });
  door(T, [1912, -2144, 1920, -2080], { axis: 'x', header: 112, special: 1, tex: 'CTDOOR2', frame: 8 });

  // === PRE-SEWER board (903/51) =============================================
  barrierLine(T, [-1264, -2248, -1264, -2104], 'CTBORD1', { special: 903, tag: 51, front: 'e' });

  // === SEWER: water channels, plank, medkit room door =====================
  // tunnel vaults in 32-unit steps (fewer sectors)
  for (let k = 0; k < A.KIND.length; k++) if (A.KIND[k] === 1 && A.LAY[k] === 3 && A.CZ[k] !== A.SKY) A.CZ[k] = Math.max(A.FZ[k] + 96, Math.round(A.CZ[k] / 32) * 32);
  // (water: floors at or below -280 in the sewer layer, set in decorate)
  barrierLine(W, [-1048, -1336, -1048, -1088], 'CTBORD2', { special: 903, tag: 54, front: 'e' });

  // === BACK ROOM / LAUNDROMAT ==============================================
  door(T, [-1304, -1536, -1248, -1528], { axis: 'y', header: 112, tag: 5, tex: 'CTDOOR2', frame: 8 });
  barrierLine(T, [-1344, -1216, -1192, -1216], 'CTBORD1', { special: 903, tag: 53, front: 's' });
  // Laundromat front windows (903/56) and double door
  for (const [x0, x1] of [[-1568, -1472], [-1312, -1216]]) {
    const fl = floorNear(T, (x0 + x1) / 2, -700);
    A.carve(T, [x0, -664, x1, -648], { floor: fl, ceil: fl + 128, fflat: 'CFTILE2', cflat: 'CFCEIL1', onlyVoid: true });
    barrierLine(T, [x0, -656, x1, -656], 'CTGLAS1', { special: 903, tag: 56, front: 'n' });
  }

  // === WELDER GARAGE doorway (tag 3, starts open) ==========================
  door(T, [-2496, -1760, -2488, -1632], { axis: 'x', header: 96, tag: 3, tex: 'CTGRGE1', frame: 8, open: true });
  // Boarded medical room behind the burning car (903/52)
  barrierLine(T, [-3392, -1256, -3392, -1168], 'CTBORD1', { special: 903, tag: 52, front: 'w' });

  // === WELD GATE (sector tag 6) ============================================
  door(T, [-2816, 880, -2600, 896], { axis: 'y', header: 112, tag: 6, tex: 'CTGATE3', frame: 8, jamb: 'CTMETL2', skyFrame: true });

  // === DOCKS ===============================================================
  // one roof height in the dock warehouse (trusses made lots of tiny ceiling steps)
  A.set(T, [-3072, 1280, -2184, 2064], { ceil: 464 }, (k) => A.KIND[k] === 1 && A.CZ[k] !== A.SKY && A.CZ[k] > 200);
  A.carve(T, [-2408, 1792, -2392, 1920], { floor: 0, ceil: 112, fflat: 'CFCONC2', cflat: 'CFCEIL2' });
  barrierLine(T, [-2400, 1792, -2400, 1920], 'CTGLAS1', { special: 903, tag: 57, front: 'w' });
  barrierLine(T, [-2344, 2032, -2272, 2032], 'CTBORD1', { special: 903, tag: 55, front: 's' });
  door(T, [-2360, 2040, -2304, 2048], { axis: 'y', header: 112, tag: 7, tex: 'CTDOOR2', frame: 8 });
  // Bay: open water around the quay and the pier (deep water, lethal).
  for (let k = 0; k < A.KIND.length; k++) {
    if (A.KIND[k] || A.WSURF[k] === -32768 || A.LAY[k] !== 1) continue;
    const j = (k / A.W) | 0;
    if (A.cellY(j) < 1900) continue;
    A.KIND[k] = 3; A.FZ[k] = -256; A.CZ[k] = A.SKY; A.SPEC[k] = 65;
  }
  A.set(T, [-3800, 1900, 2600, 4400], { fflat: 'CFBAY1' }, (k) => A.KIND[k] === 3);
}

// ---------------------------------------------------------------------------
// Things, specials and lights (after styling).
const rngState = { s: 20251014 };
const rnd = () => { rngState.s = (Math.imul(rngState.s, 1103515245) + 12345) >>> 0; return (rngState.s >>> 8) / 16777216; };

export function decorate(api, h) {
  A = api;
  const S = 'subway', T = 'street', W = 'sewer';
  const ref = A.ref;

  // --- objective use lines --------------------------------------------------
  niche(S, -2700, -4792, 'w', { tex: 'CTBUT1', special: 904, tag: 1, z0: 24, w: 48, xoff: 8 }); // elevator button, east wall of the ticket hall
  box(T, [-1088, -4400, -1072, -4368], { h: 64, tex: 'CTGEN1', use: ['w', 'n', 's'], special: 904, tag: 2 }); // generator panel
  niche(T, -1048, -4248, 'w', { tex: 'CTBUT1', special: 904, tag: 3, z0: 32, w: 16, xoff: 24 }); // gate button on the gate's south post
  niche(T, 1100, -2736, 'w', { tex: 'CTBUT1', special: 904, tag: 4, z0: 32, w: 64 }); // ladder release switch
  niche(T, 1000, -2984, 'w', { tex: 'CTBUT1', special: 904, tag: 5, z0: 32, w: 48, xoff: 8 }); // shortcut door button
  niche(T, -1220, -1500, 'n', { tex: 'CTBUT1', special: 904, tag: 6, z0: 32, w: 32, xoff: 16 }); // sewer exit door button (back room south wall)
  // weld gate: padlock post at the east end, crank post at the west end
  box(T, [-2600, 872, -2576, 904], { h: 64, tex: 'CTPADL1', use: ['s', 'w'], special: 904, tag: 7 });
  box(T, [-2856, 848, -2832, 872], { h: 64, tex: 'CTCRNK1', use: ['s', 'e', 'w'], special: 904, tag: 8 });
  niche(T, -2224, 1788, 'w', { tex: 'CTSOCK1', special: 904, tag: 9, z0: 24, w: 32, xoff: 16 }); // power socket
  box(T, [-968, 2952, -944, 2976], { h: 48, tex: 'CTRADI1', use: ['s', 'w', 'e', 'n'], special: 904, tag: 10 }); // radio console

  // --- ladders ------------------------------------------------------------
  const lad80 = niche(T, 368, -2300, 's', { tex: 'CTLADR3', special: 902, tag: 80, z0: 0, z1: 128, w: 64, depth: 8 });
  A.set(T, [320, -2272, 416, -2224], { tag: 80, group: 80 });
  A.thing(T, 368, -2248, 9061, 90);
  A.line(T, [-200, -2216, 560, -2216], { special: 905, tag: 131, optional: true });
  // the exit-room ladder stands on a free-standing frame in the room (its brush is the void strip at y -1472..-1464)
  A.line(W, [-1392, -1464, -1328, -1464], { onWall: true, mid: 'CTLADR1', special: 902, tag: 81, xoff: 0 });
  A.set(T, [-1344, -1488, -1264, -1408], { tag: 81, group: 81 });
  A.thing(T, -1304, -1448, 9061, 90);
  for (const seg of [[-1344, -1408, -1264, -1408], [-1344, -1488, -1264, -1488], [-1344, -1488, -1344, -1408], [-1264, -1488, -1264, -1408]]) A.line(T, seg, { special: 905, tag: 132, optional: true });

  // --- objective triggers ---------------------------------------------------------
  A.line(T, [-2048, -4768, -2048, -4992], { special: 905, tag: 130, front: 'w' });
  A.line(T, [-3008, 928, -2552, 928], { special: 905, tag: 133, front: 's', optional: true });
  // ambush triggers (director waves)
  const amb = [
    [140, [-104, -4320, -104, -3800]], // E-W street -> Market St
    [141, [1500, -2640, 1800, -2640]], // north E-W street -> loading warehouse
    [142, [1290, -3720, 1290, -3400]], // supply rooms -> market back
    [143, [-1640, -1000, -1208, -1000]], // inside the laundromat
    [144, [-2960, -200, -2560, -200]], // West St
    [145, [-1400, 1300, -840, 1300]], // dock road turning north
    [146, [-1320, 2700, -540, 2700]], // pier base
    [147, [-3100, 2100, -2200, 2100]], // quay north of the warehouse
  ];
  for (const [tag, seg] of amb) A.line(T, seg, { special: 905, tag, optional: true });

  // --- secrets (DOOM secret sectors) -----------------------------------------------
  for (const r of [[-3128, -3928, -2944, -3688], [-1104, -3480, -992, -3392], [2248, -1736, 2376, -1616]]) A.set(T, r, { special: 9, group: 99 }, (k) => A.KIND[k] === 1 && !A.SPEC[k]);

  // --- extraction zone ---------------------------------------------------------
  A.set(T, [-704, 3840, -512, 4000], { special: 66, tag: 160, group: 160 }, (k) => A.KIND[k] === 1);
  // --- sewer water ------------------------------------------------------------------
  for (let k = 0; k < A.KIND.length; k++) {
    if (A.KIND[k] === 1 && A.LAY[k] === 3 && A.FZ[k] <= -276) { A.SPEC[k] = 64; }
  }
  A.set(W, [-2700, -2600, -500, -100], { fflat: 'CFSEW1' }, (k) => A.SPEC[k] === 64);

  // --- things from the reference -----------------------------------------------
  placeVehicles(ref);
  placeProps(ref);
  placeItems(ref);
  placeZombies(ref);
  placeLights(ref, h);
  placeSigns(ref);

  // objective items
  A.thing(S, -2304, -6816, 1, 90);
  for (const [x, y] of [[-1056, -4992], [-1000, -5464], [-520, -5656]]) A.thing(T, x, y, 9040, 0);
  A.thing(T, -2264, 1912, 9041, 0); // plug: on the floor in front of the shelf it sits on in NMRiH (-2224,1912)
  A.thing(T, -2316, -1696, 9042, 0); // blowtorch: in front of the welder garage workbench (-2272,-1696)
  snapThing(T, -3143, -1249, 9042, 0);
  ref.heli.forEach((p, i) => A.thing(T, p[0], p[1], 9062, i));
  // wave markers (angle = group)
  const waves = {
    1: [[S, -2400, -4400], [S, -2700, -3950], [S, -3000, -4300], [S, -2950, -4850], [S, -2300, -5300]],
    2: [[T, -880, -3500], [T, -700, -3700], [T, -300, -4250], [T, 200, -4250], [T, -820, -3100], [T, 150, -3800]],
    3: [[T, 200, -2900], [T, -50, -3300], [T, 1300, -2450], [T, 900, -2400], [T, 1900, -2450], [T, 300, -2600]],
    4: [[T, -1100, -1700], [T, -700, -1600], [T, 300, -1800], [T, -1500, -900], [T, -1800, -1300], [T, -900, -2300]],
    5: [[T, -2800, -200], [T, -2700, 400], [T, -2200, -400], [T, -2900, -1100], [T, -2450, 650], [T, -1700, -350]],
    6: [[T, -1700, 1100], [T, -1200, 1700], [T, -2000, 2300], [T, -900, 2300], [T, -2900, 2300], [T, -700, 3300], [T, -1200, 3400], [T, -3500, 2200]],
  };
  for (const [g, list] of Object.entries(waves)) for (const [L, x, y] of list) snapThing(L, x, y, 9010, +g);

  // --- portals and objective triggers -----------------------------------------
  // Each seam must be a single linedef per side: make the cells on both sides
  // uniform (one sector each) so nothing splits the line.
  const seam = (L, r, props) => A.set(L, r, { special: 0, ...props, block: 0, group: 900 + (props.tag || 0) });
  for (const L of [S, T]) {
    seam(L, [-2648, -4992, -2616, -4768], { floor: -256, ceil: -128, fflat: 'CFTILE1', cflat: 'CFCEIL2', light: 80, tag: 0 });
    seam(L, [-2616, -4992, -2584, -4768], { floor: -256, ceil: -128, fflat: 'CFTILE1', cflat: 'CFCEIL2', light: 80, tag: 0, special: 0 });
  }
  A.line(S, [-2616, -4768, -2616, -4992], { special: 900, tag: 100, front: 'w' });
  A.line(T, [-2616, -4768, -2616, -4992], { special: 900, tag: 100, front: 'w' });
  for (const L of [T, W]) {
    seam(L, [-1664, -2080, -1496, -2048], { floor: -192, ceil: -64, fflat: 'CFCONC2', cflat: 'CFCEIL2', light: 72 });
    seam(L, [-1664, -2048, -1496, -2016], { floor: -192, ceil: -64, fflat: 'CFCONC2', cflat: 'CFCEIL2', light: 72, tag: 0 });
  }
  A.line(T, [-1664, -2048, -1496, -2048], { special: 900, tag: 101, front: 's' });
  A.line(W, [-1664, -2048, -1496, -2048], { special: 900, tag: 101, front: 's' });
}

// ---------------------------------------------------------------------------
function layerOfPoint(x, y, z) {
  if (x > -3400 && x < -1900 && y > -7000 && y < -3200 && z < -150 && !(y > -5000 && y < -4760 && x > -2616 && z > -300)) return 'subway';
  if (x > -2700 && x < -600 && y > -2450 && y < -150 && z < -150 && !(x < -1250 && y < -2048)) return 'sewer';
  return 'street';
}
function freeSpot(layer, x, y, rad = 64, clear = 1) {
  // nearest walkable, non-blocked cell centre with `clear` cells of clearance
  const ok = (px, py) => {
    for (let dy = -clear; dy <= clear; dy++) for (let dx = -clear; dx <= clear; dx++) {
      const c = A.cell(layer, px + dx * 8, py + dy * 8);
      if (!c || c.kind !== 1 || c.block) return false;
    }
    return true;
  };
  for (let r = 0; r <= rad; r += 8) {
    for (let a = 0; a < 16; a++) {
      const px = Math.round((x + r * Math.cos(a * Math.PI / 8)) / 8) * 8 + 4, py = Math.round((y + r * Math.sin(a * Math.PI / 8)) / 8) * 8 + 4;
      if (ok(px, py)) return [px, py];
      if (r === 0) break;
    }
  }
  return null;
}

function snapThing(L, x, y, type, angle, flags = 7) {
  const s = freeSpot(L, x, y, 128, 1) || freeSpot(L, x, y, 160, 0);
  if (s) A.thing(L, s[0], s[1], type, angle, flags);
  else A.log(`no free spot for thing ${type} near ${L} (${x},${y})`);
}

function placeVehicles(ref) {
  for (const v of ref.vehicles) {
    const L = layerOfPoint(v.x, v.y, v.z);
    const c = A.cell(L, v.x, v.y);
    if (!c || !c.kind) continue;
    A.footprint(L, v.x, v.y, v.yaw, v.len, v.wid, 65535);
    A.thing(L, v.x, v.y, v.t, v.yaw);
  }
}

function placeProps(ref) {
  for (const p of ref.props) {
    if (!p.t) continue;
    const L = layerOfPoint(p.x, p.y, p.z);
    const c = A.cell(L, p.x, p.y);
    if (!c || !c.kind) continue;
    if (p.t === 9131) { A.thing(L, p.x, p.y, 9131, 0); continue; }
    if (p.t === 9123) { A.footprint(L, p.x, p.y, p.yaw, 112, 64, 65535); A.thing(L, p.x, p.y, 9123, p.yaw); continue; }
    const s = freeSpot(L, p.x, p.y, 24, 0);
    if (s) A.thing(L, s[0], s[1], p.t, p.yaw);
  }
  // extra lantern strings along the Chinatown streets
  const strings = [
    [-900, -4060, 400, -4060, 128], [80, -3900, 80, -2500, 128], [-1000, -2000, 400, -2000, 160],
    [600, -2440, 2000, -2440, 160], [-2800, -1300, -2800, 600, 160], [-2400, -150, -1400, -150, 160],
  ];
  for (const [x0, y0, x1, y1, st] of strings) {
    const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / st);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      const c = A.cell('street', x, y);
      if (c && c.kind === 1) A.thing('street', x, y, 9131, 0);
    }
  }
}

function placeItems(ref) {
  // cluster spawners
  const used = new Array(ref.spawners.length).fill(false);
  const clusters = [];
  ref.spawners.forEach((s, i) => {
    if (used[i]) return;
    const c = [s]; used[i] = true;
    ref.spawners.forEach((t, j) => { if (!used[j] && Math.hypot(t.x - s.x, t.y - s.y) < 48 && Math.abs(t.z - s.z) < 64) { used[j] = true; c.push(t); } });
    clusters.push(c);
  });
  let chainguns = 0;
  const put = (x, y, z, type) => {
    const L = layerOfPoint(x, y, z);
    const s = freeSpot(L, x, y, 64, 1) || freeSpot(L, x, y, 96, 0);
    if (s) A.thing(L, s[0], s[1], type, 0);
  };
  for (const c of clusters) {
    const x = Math.round(c.reduce((a, s) => a + s.x, 0) / c.length), y = Math.round(c.reduce((a, s) => a + s.y, 0) / c.length), z = c[0].z;
    const cat = {};
    for (const s of c) for (const [k, v] of Object.entries(s.cats)) cat[k] = Math.max(cat[k] || 0, v);
    if (cat.me_chainsaw) { put(x, y, z, 2005); continue; }
    if ((cat.fa_m16a4 || cat.military || cat.rifle) && chainguns < 2 && ((x < -2100 && y > -2800) || (x > -1000 && y < -5400))) { put(x, y, z, 2002); chainguns++; continue; }
    if ((cat.shotgun || 0) >= 70) { put(x, y, z, 2001); continue; }
    if (cat.ammobox_12gauge || cat.shotgun) { put(x, y, z, c.length >= 3 ? 2049 : 2008); continue; }
    if (cat.item_pills) { put(x, y, z, 2011); continue; }
    const ammo = ['ammobox_9mm', 'ammobox_45acp', 'ammobox_357', 'ammobox_556', 'ammobox_762mm', 'ammobox_308', 'ammobox_22lr', 'handgun', 'ammo', 'fa_m16a4', 'fa_sks', 'fa_sako85', 'fa_1022', 'firearm', 'fa_1911', 'fa_m92fs'];
    if (ammo.some((k) => cat[k])) { put(x, y, z, c.length >= 3 ? 2048 : 2007); continue; }
  }
  // gun shop shotgun (always) and the secret goodies
  put(-2400, -2400, 40, 2001);
  put(-2420, -2380, 40, 2049);
  for (const it of ref.items) {
    const t = it.c === 'item_first_aid' ? 2012 : (it.c === 'item_bandages' || it.c === 'item_pills') ? 2011 : 0;
    if (t) put(it.x, it.y, it.z, t);
  }
  put(-3040, -3820, 0, 8); // backpack: secret 1 west storage
  put(2310, -1675, 0, 2005); // chainsaw: secret 3 storage
  put(-1620, -4140, 0, 2018); // green armour by the police car on Main St
}

function placeZombies(ref) {
  const boxes = ref.zspawn.map((b) => ({ b, L: layerOfPoint((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[2] + 8), area: (b[3] - b[0]) * (b[4] - b[1]) }));
  // a few extra boxes where NMRiH spawns come from just off-screen (subway corridors)
  boxes.push({ b: [-2560, -4840, -576, -2304, -4400, -560], L: 'subway', area: 110000 });
  boxes.push({ b: [-2800, -4096, -384, -2300, -3840, -380], L: 'subway', area: 128000 });
  const total = 222;
  const wsum = boxes.reduce((a, b) => a + Math.sqrt(b.area), 0);
  const placed = [];
  const types = () => { const r = rnd(); if (r < 0.08) return 9004; if (r < 0.13) return 9005; return 9000 + Math.floor(rnd() * 4); };
  let n = 0;
  for (const bx of boxes) {
    const want = Math.max(1, Math.round(total * Math.sqrt(bx.area) / wsum));
    const [x0, y0, , x1, y1] = bx.b;
    let got = 0;
    for (let tries = 0; tries < 400 && got < want; tries++) {
      const x = x0 + 16 + rnd() * Math.max(1, x1 - x0 - 32), y = y0 + 16 + rnd() * Math.max(1, y1 - y0 - 32);
      const s = freeSpot(bx.L, x, y, 16, 2);
      if (!s) continue;
      if (placed.some((p) => p.L === bx.L && Math.hypot(p.x - s[0], p.y - s[1]) < 40)) continue;
      // keep the start area quiet
      if (bx.L === 'subway' && s[1] < -5600) continue;
      const r = rnd();
      const flags = r < 0.7 ? 7 : r < 0.88 ? 6 : 4;
      A.thing(bx.L, s[0], s[1], types(), Math.floor(rnd() * 8) * 45, flags);
      placed.push({ L: bx.L, x: s[0], y: s[1] });
      got++; n++;
    }
  }
  A.log(`zombies placed: ${n}`);
}

function placeLights(ref, h) {
  let flick = 0;
  for (const l of ref.lights) {
    const L = layerOfPoint(l.x, l.y, l.z);
    const s = freeSpot(L, l.x, l.y, 48, 0);
    if (!s) continue;
    const c = A.cell(L, s[0], s[1]);
    const out = h.isOutdoorXY(L, s[0], s[1]);
    const red = l.c[0] > 150 && l.c[1] < 80;
    const rad = red ? 96 : out ? 120 : 88;
    const lvl = Math.min(208, (c.light || 120) + (red ? 48 : out ? 40 : 24));
    const fl = (flick++ % 11 === 5) ? (out ? 1 : 17) : 0;
    const panel = !out && L !== 'sewer' && c.ceil - c.floor <= 192;
    for (const k of A.cellsOf(L, [s[0] - rad, s[1] - rad, s[0] + rad, s[1] + rad])) {
      if (A.KIND[k] !== 1 || A.SPEC[k] || A.TAG[k] || A.GROUP[k]) continue;
      const i = k % A.W, j = (k / A.W) | 0;
      const px = A.cellX(i) + 4 - A.OFFSET[L], py = A.cellY(j) + 4;
      const d = Math.max(Math.abs(px - s[0]), Math.abs(py - s[1])); // square pools (DOOM style, few lines)
      if (d > rad) continue;
      if (Math.abs(A.FZ[k] - c.floor) > 64) continue;
      const v = d < rad * 0.55 ? lvl : Math.round((lvl + A.LIGHT[k]) / 2 / 8) * 8;
      if (v > A.LIGHT[k]) A.LIGHT[k] = v;
      if (fl && d < rad * 0.55) A.SPEC[k] = fl;
    }
    if (panel) A.set(L, [s[0] - 12, s[1] - 12, s[0] + 12, s[1] + 12], { cflat: 'CFNLIT1' }, (k) => A.KIND[k] === 1 && !A.TAG[k]);
  }
}

const SIGNTEX = {
  sign_chinatown_01: ['CTNSG2', 128, 32], sign_chinatown_02: ['CTNSG1', 32, 128], sign_chinatown_03: ['CTNSG1', 32, 128],
  sign_drugs: ['CTNSG9', 64, 64], sign_garage_01: ['CTNSG6', 128, 32], fallout_motel_sign: ['CTNSG7', 64, 128],
  subway_sign01: ['CTNSG5', 128, 32], sign_gun_shop_side: ['CTNSG3', 128, 32], sign_gun_shop_front: ['CTNSG3', 128, 32],
  sign_market_lg_01: ['CTNSG4', 128, 32],
};
function placeSigns(ref) {
  const list = ref.signs.filter((s) => SIGNTEX[s.m]).map((s) => ({ ...s }));
  list.push({ m: 'subway_sign01', x: -2040, y: -4700, z: 136 });
  list.push({ m: 'laundromat', x: -1500, y: -640, z: 120 });
  for (const s of list) {
    const [tex, w, hgt] = s.m === 'laundromat' ? ['CTNSG8', 128, 32] : SIGNTEX[s.m];
    // nearest wall from the sign position
    let best = null;
    for (const f of ['n', 's', 'e', 'w']) {
      const [dx, dy] = DIR[f];
      // look for a walkable cell next to the sign on side f, then the wall behind
      for (let r = 0; r <= 96; r += 8) {
        const c = A.cell('street', s.x + dx * r, s.y + dy * r);
        if (c && c.kind === 1) {
          const wall = A.findWall('street', s.x + dx * r, s.y + dy * r, -dx, -dy, 160);
          if (wall !== null) {
            const dist = Math.abs((dx ? s.x : s.y) - wall) + r;
            if (!best || dist < best.dist) best = { f, dist };
          }
          break;
        }
      }
    }
    if (!best) continue;
    const fl = floorNear('street', s.x, s.y);
    const z0 = Math.max(72, Math.min(s.z - fl - hgt / 2, 320));
    const [dx, dy] = DIR[best.f];
    const px = dx ? s.x + dx * 32 : s.x, py = dy ? s.y + dy * 32 : s.y;
    niche('street', px, py, best.f, { tex, w, z0, z1: z0 + hgt, xoff: 0 });
  }
}

// ---------------------------------------------------------------------------
export const PREVIEWS = [
  { name: 'overview_street', layer: 'street', box: [-3712, -7040, 2560, 4352], scale: 8 },
  { name: 'subway', layer: 'subway', box: [-3328, -7040, -1920, -3200], scale: 4 },
  { name: 'sewer', layer: 'sewer', box: [-2688, -2560, -512, -128], scale: 4 },
  { name: 'start_streets', layer: 'street', box: [-3200, -6200, -300, -2000], scale: 4 },
  { name: 'east', layer: 'street', box: [-1400, -4400, 2560, -1200], scale: 4 },
  { name: 'north_west', layer: 'street', box: [-3712, -2700, -300, 1000], scale: 4 },
  { name: 'docks', layer: 'street', box: [-3712, 800, 0, 4300], scale: 4 },
];

// Objective checkpoints for tools/ct/check-map.mjs (layer, x, y).
export const CHECKPOINTS = [];
