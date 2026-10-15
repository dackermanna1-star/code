// Hand-authored design data for CHINATWN, applied by tools/ct/build-map.mjs on
// top of the measured raster (raster.json) and points (ref.json).
// Coordinates are real NMRiH (Source) units of the named layer; the builder
// applies the layer offsets (subway x-5000, sewer x+6000) and snaps to 8.
//
// Tags and specials follow tools/ct/SPEC.md sections 5-9. Extra tag used by
// this map (builder's call, SPEC section 8 leaves it free; the map script's
// GARAGE_TAG in src/game/ct/chinatown.js):
//   sector tag 8  = welder-garage doorway (garage_door1), a door sector that
//                   starts OPEN; the script may close it on its 50% roll.

// ---------------------------------------------------------------------------
// Zones: first match wins (box = [x0,y0,x1,y1] real coords; no box = layer default).
const Z_DOCKS = { layer: 'street', sky: 640, light: 120, lightIn: 128, style: 'docks' };
const Z_WEST = { layer: 'street', sky: 576, light: 120, lightIn: 136, style: 'west' };
const Z_EAST = { layer: 'street', sky: 576, light: 128, lightIn: 144, style: 'chinatown' };
export const ZONES = [
  // interiors with their own wall finish (wallIn / floorIn override the style indoors)
  { name: 'tickethall', layer: 'subway', box: [-3120, -4960, -2680, -4590], sky: 512, light: 112, lightIn: 112, style: 'subway', wallIn: 'CTTILE3' },
  { ...Z_WEST, name: 'laundromat', box: [-1660, -1236, -1200, -630], lightIn: 152, wallIn: 'CTTILE3', floorIn: 'CFTILE2' },
  { ...Z_EAST, name: 'loading', box: [1330, -3440, 1760, -2880], wallIn: 'CTWARE1' },
  { ...Z_DOCKS, name: 'dockwarehouse', box: [-3072, 1280, -2184, 2064], wallIn: 'CTWARE1' },
  { name: 'subway', layer: 'subway', sky: 512, light: 104, lightIn: 104, style: 'subway' },
  { name: 'sewer', layer: 'sewer', sky: 512, light: 88, lightIn: 88, style: 'sewer' },
  { ...Z_DOCKS, name: 'docks', box: [-3800, 880, 2600, 4400] },
  { ...Z_WEST, name: 'west', box: [-3800, -1800, -1180, 880] },
  { name: 'north', layer: 'street', box: [-1700, -2720, 640, -1180], sky: 576, light: 120, lightIn: 136, style: 'chinatown' },
  { ...Z_EAST, name: 'east', box: [-1000, -4320, 2600, -1180] },
  { name: 'passage', layer: 'street', box: [-2700, -5000, -2048, -4760], sky: 512, light: 96, lightIn: 96, style: 'subway' },
  { name: 'start', layer: 'street', sky: 512, light: 120, lightIn: 136, style: 'downtown' },
];
export const LETHAL_WATER = true;
// Facade strips on street faces of building blocks (see build-map.mjs).
// bigBlock: void blocks of more cells than this are buildings (unknown tops use maxTop)
export const FACADE = { band: 128, maxTop: 832, bigBlock: 2000, zones: ['start', 'east', 'north', 'west', 'docks'] };
const SHOPBAND = { downtown: ['CTSHOP4', 'CTSHUT1', 'CTSHOP6', 'CTBRK1', 'CTSHUT2', 'CTSHOP5'], chinatown: ['CTSHOP1', 'CTSHOP2', 'CTSHOP3', 'CTSHUT2', 'CTSHOP5', 'CTSHUT1'],
  west: ['CTSHOP3', 'CTSHUT1', 'CTSHOP1', 'CTBRK2', 'CTSHUT2'], docks: ['CTSHUT1', 'CTMETL2', 'CTSHUT2', 'CTCONC2'] };
const UPPER = { downtown: ['CTAPT1', 'CTBRK1', 'CTAPT2', 'CTSTUC1', 'CTBRK2'], chinatown: ['CTAPT2', 'CTAPT1', 'CTSTUC2', 'CTBRK1', 'CTSTUC1'],
  west: ['CTSTUC1', 'CTAPT2', 'CTBRK1', 'CTSTUC2'], docks: ['CTMETL1', 'CTCONC2', 'CTBRK2', 'CTMETL2'] };
// shop band texture (ground floor): stays the same along ~128 units of a facade
export function facadeLower(cls, zone, k) {
  if (cls === 'container') return 'CTCONT' + (1 + (hash(k >> 6) % 3));
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

// Masked textures (holes): only ever used as two-sided midtextures; anywhere
// else (one-sided walls, upper/lower pieces) the builder swaps in an opaque one.
export const MASKED_TEX = ['CTFENC1', 'CTGATE1', 'CTGATE2', 'CTGATE3', 'CTBORD1', 'CTBORD2', 'CTBORD3', 'CTGLAS1', 'CTGLAS2', 'CTRAIL1', 'CTSCAF1'];
export const opaqueFor = (t, ctx) => (ctx === 'wall' && (t === 'CTFENC1' || t === 'CTGATE1' || t === 'CTGATE2') ? 'CTSHUT1' : null) || ({ CTFENC1: 'CTMETL2', CTGATE1: 'CTMETL2', CTGATE2: 'CTMETL2', CTGATE3: 'CTMETL2', CTSCAF1: 'CTMETL2', CTRAIL1: 'CTMETL2', CTGLAS1: 'CTPLAS1', CTGLAS2: 'CTPLAS1' })[t] || 'CTWOOD1';
// Solid prop things block with this radius (SPEC section 4).
export const PROP_RADIUS = { 9120: 24, 9121: 20, 9122: 8, 9124: 16, 9125: 16, 9126: 12, 9127: 8, 9128: 12, 9129: 16, 9130: 8, 9132: 20, 9133: 24 };
// Obstacles without a prop sprite (shelves, dumpsters, tables, clipped
// areas...) are drawn as raised blocks: texture, height, top flat.
const OBST_STYLE = {
  shelf: { tex: 'CTMETL2', h: 96, flat: 'CFMETL1' }, dumpster: { tex: 'CTCONT3', h: 56, flat: 'CFMETL1' }, pallet: { tex: 'CTWOOD1', h: 40, flat: 'CFWOOD1' },
  crate: { tex: 'CTWOOD1', h: 48, flat: 'CFWOOD1' }, table: { tex: 'CTWOOD1', h: 40, flat: 'CFWOOD1' }, barrel: { tex: 'CTMETL2', h: 48, flat: 'CFMETL1' },
  sandbag: { tex: 'CTCONC2', h: 40, flat: 'CFDIRT1' }, tire: { tex: 'CTDARK1', h: 32, flat: 'CFDIRT1' }, machine: { tex: 'CTMETL2', h: 64, flat: 'CFMETL1' },
  garbage: { tex: 'CTCONC2', h: 32, flat: 'CFDIRT1' }, bed: { tex: 'CTWOOD1', h: 24, flat: 'CFWOOD1' }, spool: { tex: 'CTWOOD1', h: 48, flat: 'CFWOOD1' },
  scaffold: { tex: 'CTMETL2', h: 64, flat: 'CFMETL1' }, container: { tex: 'CTCONT1', h: 96, flat: 'CFMETL1' }, concrete: { tex: 'CTCONC1', h: 40, flat: 'CFCONC1' },
  wood: { tex: 'CTWOOD1', h: 48, flat: 'CFWOOD1' }, metal: { tex: 'CTMETL2', h: 48, flat: 'CFMETL1' },
};
export function obstacleStyle(cat, zone, outdoor, cells) {
  if (cat && OBST_STYLE[cat]) return OBST_STYLE[cat];
  if (zone.style === 'sewer') return { tex: 'CTSEWR2', h: 40, flat: 'CFCONC2' };
  if (zone.style === 'subway') return { tex: 'CTCONC1', h: 40, flat: 'CFCONC1' };
  if (!outdoor) return cells > 60 ? OBST_STYLE.shelf : OBST_STYLE.crate;
  return cells > 200 ? OBST_STYLE.concrete : OBST_STYLE.crate;
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
  if (zone.wallIn && (!outdoor || zone.style === 'subway') && cls !== 'glass' && cls !== 'fence') return zone.wallIn;
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
  if (zone.floorIn && !outdoor) return zone.floorIn;
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
  o = { light: 120, ...o }; // one explicit light: a door must stay a single sector
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

  // === VEHICLES ============================================================
  // Every vehicle seen from the playable area gets an impassable floor
  // footprint (its sprite stands on it); solid cells under it (clipped into
  // the building line in the reference) become floor first, so vehicles are
  // never drawn as walls or facades.
  vehicleFootprints(A.ref);
  placeFences(A.ref);

  // === UNDERGROUND CEILINGS ==================================================
  // Subway and sewer cells where the reference has no ceiling face (walkway
  // strips beside the tunnel walls, light shafts) take the neighbouring
  // ceiling: there is no sky underground.
  {
    let todo = [];
    for (let k = 0; k < A.KIND.length; k++) if (A.KIND[k] === 1 && (A.LAY[k] === 2 || A.LAY[k] === 3) && A.CZ[k] === A.SKY) todo.push(k);
    for (let pass = 0; pass < 64 && todo.length; pass++) {
      const set = [];
      for (const k of todo) {
        let best = -Infinity;
        for (const q of [k + 1, k - 1, k + A.W, k - A.W]) if (A.KIND[q] === 1 && A.LAY[q] === A.LAY[k] && A.CZ[q] !== A.SKY) best = Math.max(best, A.CZ[q]);
        if (best > -Infinity) set.push([k, Math.max(best, A.FZ[k] + 72)]);
      }
      if (!set.length) break;
      for (const [k, c] of set) A.CZ[k] = c;
      todo = todo.filter((k) => A.CZ[k] === A.SKY);
    }
    for (const k of todo) A.CZ[k] = A.FZ[k] + 128;
  }

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
  A.carve(S, [-2312, -4120, -2232, -4072], { floor: -448, ceil: -336 });
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

  // === ROADBLOCK ==============================================================
  // Plywood wall 128 high across the street with chain-link panels on top;
  // the ladder (902/80, placed in decorate) hangs on its south face.
  A.carve(T, [-160, -2296, 504, -2272], { kind: 2, floor: 128, ceil: 'sky', steptex: 'CTWOOD1', fflat: 'CFWOOD1', group: A.newGroup(), light: 120 });
  barrierLine(T, [-160, -2280, 504, -2280], 'CTFENC1');

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
  door(T, [-2496, -1760, -2488, -1632], { axis: 'x', header: 96, tag: 8, tex: 'CTGRGE1', frame: 8, open: true });
  // Boarded medical room behind the burning car (903/52)
  barrierLine(T, [-3392, -1256, -3392, -1168], 'CTBORD1', { special: 903, tag: 52, front: 'w' });

  // === WELD GATE (sector tag 6) ============================================
  door(T, [-2816, 880, -2600, 896], { axis: 'y', header: 112, tag: 6, tex: 'CTGATE3', frame: 8, jamb: 'CTMETL2', skyFrame: true });
  // the rest of the E-W fence the gate sits in: chain-link instead of a solid wall
  A.carve(T, [-3040, 880, -2824, 896], { floor: 0, ceil: 'sky', onlyVoid: true, fflat: 'CFASPH1' });
  barrierLine(T, [-3040, 888, -2824, 888], 'CTFENC1', { front: 's' });

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
  // Open horizon: void cells on the bay's outer edge become closed sky sectors
  // (floor = ceiling, sky ceiling) so the sea meets the sky instead of a wall.
  const hz = [];
  for (let k = 0; k < A.KIND.length; k++) {
    if (A.KIND[k] || A.LAY[k] !== 1) continue;
    const i = k % A.W, j = (k / A.W) | 0;
    const x = A.cellX(i), y = A.cellY(j);
    if (!(x > 0 || y > 4100 || x < -3640)) continue;
    if ([k + 1, k - 1, k + A.W, k - A.W].some((q) => q >= 0 && q < A.KIND.length && A.KIND[q] === 3)) hz.push(k);
  }
  for (const k of hz) { A.KIND[k] = 3; A.FZ[k] = -256; A.CZ[k] = -256; A.SPEC[k] = 65; A.GROUP[k] = 65; }
  A.set(T, [-3800, 1900, 2600, 4400], { fflat: 'CFBAY1', cflat: 'F_SKY1' }, (k) => A.GROUP[k] === 65);
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
  // roadblock ladder: on the plywood's south face (lower texture of the
  // street -> plywood line; the script swaps CTLADR3 -> CTLADR2)
  A.line(T, [336, -2296, 400, -2296], { special: 902, tag: 80, front: 's', bottom: 'CTLADR3', xoff: 0 });
  A.set(T, [320, -2272, 416, -2224], { tag: 80, group: 80 });
  A.thing(T, 368, -2248, 9061, 90);
  A.set(T, [-176, -2272, 520, -2192], { steptex: 'CTMETL2' }, (k) => A.FZ[k] >= 120);
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

  // --- extraction zone ---------------------------------------------------------
  // NMRiH's volume is (-704,3840)-(-512,4000); the deck ends at y 3872, so the
  // zone reaches back onto the deck (the script tests the player's centre)
  // and is marked with platform-edge paint and its own light.
  A.set(T, [-704, 3744, -512, 3872], { special: 66, tag: 160, group: 160, light: 176, fflat: 'CFPLAT1' }, (k) => A.KIND[k] === 1);
  // --- sewer water ------------------------------------------------------------------
  // the channel (below -276) and the shallow water-textured runs beside it
  // burn; the dry walkway keeps a concrete floor
  const waterCls = A.floorClass('water');
  for (let k = 0; k < A.KIND.length; k++) {
    if (A.KIND[k] !== 1 || A.LAY[k] !== 3 || A.SPEC[k] || A.TAG[k]) continue;
    if (A.FZ[k] <= -276 || (A.FZ[k] <= -264 && A.FCLS[k] === waterCls)) A.SPEC[k] = 64;
  }
  A.set(W, [-2700, -2600, -500, -100], { fflat: 'CFSEW1' }, (k) => A.SPEC[k] === 64);
  const sew = A.flatId('CFSEW1'), conc = A.flatId('CFCONC2');
  for (let k = 0; k < A.KIND.length; k++) if (A.KIND[k] && A.LAY[k] === 3 && A.FFLAT[k] === sew && A.SPEC[k] !== 64) A.FFLAT[k] = conc;

  // --- things from the reference -----------------------------------------------
  placeVehicles(ref);
  placeProps(ref);
  placeItems(ref);
  placeZombies(ref);
  placeLights(ref, h);
  placeSigns(ref);
  placeSecrets();

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
    4: [[T, -1100, -1700], [T, -700, -1600], [T, 300, -1800], [T, -1500, -900], [T, -2100, -1300], [T, -900, -2300]],
    5: [[T, -2800, -200], [T, -2300, 100], [T, -2200, -400], [T, -2900, -1100], [T, -2650, -600], [T, -1700, -350]],
    // hold-out: on the quay and at the pier base, so waves walk in along the pier
    6: [[T, -1700, 1100], [T, -1200, 1700], [T, -2000, 2300], [T, -900, 2250], [T, -2900, 2300], [T, -1450, 2550], [T, -560, 2600], [T, -3500, 2200], [T, -2400, 2250], [T, -1150, 2500]],
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
  // What each side shows beyond its seam is a copy of the other side: the
  // subway stub gets the first steps of the exit stairs (not walkable there:
  // the platform's north end lies under them) and a dark end wall, sealing
  // it from the platform; both stubs of portal 101 take the other side's light.
  A.copyFrom(S, T, [-2584, -5000, -2520, -4760], { kind: 2, wtex: 'CTDARK1' });
  A.copyFrom(W, T, [-1672, -2120, -1496, -2080], { only: ['light'] });
  A.copyFrom(T, W, [-1672, -2016, -1496, -1976], { only: ['light'] });
  // one wall finish round the stairwell in both layers (zone styles differ)
  for (const L of [T, W]) A.wallTex(L, [-1696, -2136, -1464, -1960], 'CTCONC2');
}

// ---------------------------------------------------------------------------
function layerOfPoint(x, y, z) {
  if (x > -3400 && x < -1900 && y > -7000 && y < -3200 && z < -150 && !(y > -5000 && y < -4760 && x > -2616 && z > -300)) return 'subway';
  if (x > -2700 && x < -600 && y > -2450 && y < -150 && z < -150 && !(x < -1250 && y < -2048)) return 'sewer';
  return 'street';
}
// Solid things placed so far (props, zombies): [layer, x, y, radius]
const SOLIDS = [];
const overlapsSolid = (L, x, y, r) => SOLIDS.some((s) => s[0] === L && Math.abs(s[1] - x) < s[3] + r && Math.abs(s[2] - y) < s[3] + r);
// Nearest position (8-unit lattice) to (x,y) within rad where a box of
// half-size `r` fits by DOOM rules (A.boxFree) inside a reasonably large open
// area (not a sliver behind props) and clear of solid things.
function freeSpot(layer, x, y, rad = 64, r = 16, o = {}) {
  const ok = (px, py) => {
    // in a region the player can roam (not a pocket behind props or rails)
    if (A.boxRegion(layer, px, py) < (o.region || 600)) return false;
    if (!A.boxFree(layer, px, py, r, o)) return false;
    if (o.avoid && o.avoid.some((p) => p[0] === layer && Math.abs(p[1] - px) < 24 && Math.abs(p[2] - py) < 24)) return false;
    return !(o.solid && overlapsSolid(layer, px, py, r));
  };
  for (let d = 0; d <= rad; d += 8) {
    const n = d ? Math.max(8, Math.round(d * Math.PI / 4)) : 1;
    let best = null, bd = Infinity;
    for (let a = 0; a < n; a++) {
      const px = Math.round((x + d * Math.cos(a * 2 * Math.PI / n)) / 8) * 8, py = Math.round((y + d * Math.sin(a * 2 * Math.PI / n)) / 8) * 8;
      if (!ok(px, py)) continue;
      const dd = Math.hypot(px - x, py - y);
      if (dd < bd) { bd = dd; best = [px, py]; }
    }
    if (best) return best;
  }
  return null;
}

function snapThing(L, x, y, type, angle, flags = 7, r = 16) {
  const s = freeSpot(L, x, y, 160, r, { solid: true });
  if (s) A.thing(L, s[0], s[1], type, angle, flags);
  else A.log(`no free spot for thing ${type} near ${L} (${x},${y})`);
  return s;
}

// Hanging lanterns spawn at the ceiling: under open sky they get a small
// 'hook' sector whose sky ceiling sits at the lantern's height (invisible:
// both sides are sky), so they hang over the street instead of at the roofline.
let hookGroup = 7000;
function lantern(L, x, y, z) {
  const c = A.cell(L, x, y);
  if (!c || c.kind !== 1) return;
  const outdoor = c.ceil >= 500;
  if (outdoor) {
    const h = Math.max(c.floor + 152, Math.min(z !== null ? Math.round(z / 8) * 8 + 24 : c.floor + 232, c.floor + 320));
    const gx = Math.floor(x / 16) * 16, gy = Math.floor(y / 16) * 16;
    const r = [gx, gy, gx + 16, gy + 16];
    let ok = true;
    for (const k of A.cellsOf(L, r)) if (A.KIND[k] !== 1 || A.GROUP[k] || A.TAG[k] || A.SPEC[k] || A.FZ[k] !== c.floor) ok = false;
    if (!ok) return;
    A.set(L, r, { ceil: h, group: hookGroup++ });
    A.thing(L, gx + 8, gy + 8, 9131, 0);
  } else A.thing(L, x, y, 9131, 0);
}

// Vehicles seen from the playable area (walkable cells round the footprint):
// footprint cells (carving solid cells under it), recorded for decorate.
const VEHICLES = [];
function vehicleFootprints(ref) {
  for (const v of ref.vehicles) {
    const L = layerOfPoint(v.x, v.y, v.z);
    const inner = new Set(A.rectCells(L, v.x, v.y, v.yaw, v.len, v.wid));
    const ring = A.rectCells(L, v.x, v.y, v.yaw, v.len + 96, v.wid + 96).filter((k) => !inner.has(k) && A.KIND[k] === 1);
    if (ring.length < 12) continue; // out of bounds: nobody sees it
    const fl = ring.map((k) => A.FZ[k]).sort((a, b) => a - b)[ring.length >> 1];
    const sky = ring.filter((k) => A.CZ[k] === A.SKY).length * 2 >= ring.length;
    const cs = ring.filter((k) => A.CZ[k] !== A.SKY).map((k) => A.CZ[k]).sort((a, b) => a - b);
    const n = A.footprint(L, v.x, v.y, v.yaw, v.len, v.wid, 65535, { carve: { floor: fl, ceil: sky || !cs.length ? 'sky' : cs[cs.length >> 1] } });
    if (n) VEHICLES.push({ ...v, L });
  }
}

// Chain-link fence props (their long side is the model's y axis): masked
// blocking lines along the ones that run with the grid. Where the reference
// clipped a pen shut, the fence is what shows the invisible wall.
function placeFences(ref) {
  let n = 0;
  for (const f of ref.fences || []) {
    const L = layerOfPoint(f.x, f.y, f.z);
    if (Math.abs(f.z - floorNear(L, f.x, f.y)) > 32) continue; // on a roof or balcony, not across the floor here
    const dir = ((f.yaw + 90) % 180 + 180) % 180; // 0 = along x, 90 = along y
    const h = f.len / 2;
    let seg = null;
    // ends rounded outward so panels in a row leave no slits between them
    if (dir <= 12 || dir >= 168) { const y = Math.round(f.y / 8) * 8; seg = [Math.floor((f.x - h) / 8) * 8, y, Math.ceil((f.x + h) / 8) * 8, y]; }
    else if (Math.abs(dir - 90) <= 12) { const x = Math.round(f.x / 8) * 8; seg = [x, Math.floor((f.y - h) / 8) * 8, x, Math.ceil((f.y + h) / 8) * 8]; }
    if (!seg) continue;
    const ln = barrierLine(L, seg, 'CTFENC1', { optional: true });
    if (ln.n) n++;
  }
  A.log(`fences: ${n} of ${(ref.fences || []).length} drawn`);
}

function placeVehicles() {
  const placed = [];
  for (const v of VEHICLES) {
    // tractor + trailer pairs share an origin in the reference: one sprite
    if (placed.some((p) => p.L === v.L && Math.hypot(p.x - v.x, p.y - v.y) < 64)) continue;
    A.thing(v.L, v.x, v.y, v.t, v.yaw);
    placed.push(v);
  }
  A.log(`vehicles: ${placed.length} sprites, ${VEHICLES.length} footprints of ${A.ref.vehicles.length} in the reference`);
}

function placeProps(ref) {
  let n = 0, skipped = 0;
  for (const p of ref.props) {
    if (!p.t) continue;
    const L = layerOfPoint(p.x, p.y, p.z);
    const c = A.cell(L, p.x, p.y);
    if (!c || !c.kind) { skipped++; continue; }
    if (p.t === 9131) { lantern(L, p.x, p.y, p.z); continue; }
    if (p.t === 9123) { A.footprint(L, p.x, p.y, p.yaw, 112, 64, 65535); A.thing(L, p.x, p.y, 9123, p.yaw); continue; }
    // solid props stand exactly where the reference has them (their own
    // radius blocks; the build frees the nav-hole cells round them)
    const r = PROP_RADIUS[p.t] || 16;
    if (c.kind !== 1 || overlapsSolid(L, p.x, p.y, r)) { skipped++; continue; }
    if (Math.abs(c.floor - floorNear(L, p.x, p.y)) > 24) { skipped++; continue; }
    A.thing(L, p.x, p.y, p.t, p.yaw);
    SOLIDS.push([L, p.x, p.y, r]);
    n++;
  }
  A.log(`props: ${n} placed, ${skipped} skipped (outside the map)`);
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
      if (c && c.kind === 1) lantern('street', x, y, null);
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
  const cgDone = { gun: false, base: false };
  // shotguns only where NMRiH rolls them most (gun shop, secret 1 storage, secret 2 alley, boarded medical room)
  const shotgunOK = (x, y) => (x < -2900 && y > -3950 && y < -3650) || (x > -1120 && x < -980 && y > -3500 && y < -3380) || (x < -2900 && y > -1300 && y < -1000) || (x > -2700 && x < -2180 && y > -2800 && y < -2100);
  // pickups go where the player's own box fits (so they can always be
  // touched), as near the reference spawner as possible
  const placed = [];
  const put = (x, y, z, type) => {
    const L = layerOfPoint(x, y, z);
    const s = freeSpot(L, x, y, 96, 16, { solid: true, step: 0, avoid: placed });
    if (s) { A.thing(L, s[0], s[1], type, 0); placed.push([L, s[0], s[1]]); }
    else A.log(`pickup ${type} near (${x},${y}) has no free spot`);
  };
  for (const c of clusters) {
    const x = Math.round(c.reduce((a, s) => a + s.x, 0) / c.length), y = Math.round(c.reduce((a, s) => a + s.y, 0) / c.length), z = c[0].z;
    const cat = {};
    for (const s of c) for (const [k, v] of Object.entries(s.cats)) cat[k] = Math.max(cat[k] || 0, v);
    if (cat.me_chainsaw) continue; // the chainsaw is placed in the secret 3 storage below
    if (cat.fa_m16a4 || cat.military || cat.rifle) {
      const where = x < -2100 && y > -2800 && y < -2100 ? 'gun' : x > -1000 && y < -5400 ? 'base' : null;
      if (where && !cgDone[where]) { put(x, y, z, 2002); cgDone[where] = true; continue; }
    }
    if ((cat.shotgun || 0) >= 45 && shotgunOK(x, y)) { put(x, y, z, 2001); continue; }
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
  // a few extra boxes where NMRiH spawns come from just off-screen (subway
  // corridors); kept small so the subway stays a light opening act
  boxes.push({ b: [-2560, -4840, -576, -2304, -4400, -560], L: 'subway', area: 30000, cap: 4 });
  boxes.push({ b: [-2800, -4096, -384, -2300, -3840, -380], L: 'subway', area: 30000, cap: 4 });
  const total = 220;
  // population follows the reference spawn volumes' area (like NMRiH's
  // func_zombie_spawn coverage); every volume gets at least one
  const wsum = boxes.reduce((a, b) => a + b.area, 0);
  for (const bx of boxes) { bx.want = Math.max(1, Math.round(total * bx.area / wsum)); if (bx.cap) bx.want = Math.min(bx.want, bx.cap); bx.got = 0; }
  const placed = [];
  const types = () => { const r = rnd(); if (r < 0.08) return 9004; if (r < 0.13) return 9005; return 9000 + Math.floor(rnd() * 4); };
  let n = 0;
  const fill = (bx, want, tries0) => {
    const [x0, y0, , x1, y1] = bx.b;
    for (let tries = 0; tries < tries0 && bx.got < want; tries++) {
      const x = x0 + 16 + rnd() * Math.max(1, x1 - x0 - 32), y = y0 + 16 + rnd() * Math.max(1, y1 - y0 - 32);
      const s = freeSpot(bx.L, x, y, 16, 16, { solid: true });
      if (!s) continue;
      if (placed.some((p) => p.L === bx.L && Math.hypot(p.x - s[0], p.y - s[1]) < 40)) continue;
      // keep the start area quiet
      if (bx.L === 'subway' && s[1] < -5600) continue;
      const type = types();
      const r = rnd();
      const flags = r < 0.7 ? 7 : r < 0.88 ? 6 : 4;
      A.thing(bx.L, s[0], s[1], type, Math.floor(rnd() * 8) * 45, flags);
      SOLIDS.push([bx.L, s[0], s[1], 16]);
      placed.push({ L: bx.L, x: s[0], y: s[1] });
      bx.got++; n++;
    }
  };
  for (const bx of boxes) fill(bx, bx.want, 400);
  // volumes that could not take their share (mostly blocked) pass it on to
  // the others, by area
  let deficit = total - n;
  for (let pass = 0; pass < 3 && deficit > 0; pass++) {
    const open = boxes.filter((b) => !b.cap && b.got >= b.want);
    const osum = open.reduce((a, b) => a + b.area, 0);
    for (const bx of open) { if (deficit <= 0) break; const before = bx.got; fill(bx, bx.got + Math.max(1, Math.round(deficit * bx.area / osum)), 200); deficit -= bx.got - before; }
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

// One secret sector per secret area: special 9 on the main walkable part
// (the largest run of cells sharing floor, ceiling and flats), with uniform
// light and ceiling flat across the area so light pools and ceiling panels
// don't split it into many tiny secrets.
const SECRETS = [[-3128, -3928, -2944, -3688], [-1104, -3480, -992, -3392], [2248, -1736, 2376, -1616]];
function placeSecrets() {
  const nlit = A.flatId('CFNLIT1');
  SECRETS.forEach((r, n) => {
    const cells = A.cellsOf('street', r).filter((k) => A.KIND[k] === 1 && !A.TAG[k] && !A.BLOCK[k] && (!A.GROUP[k] || A.GROUP[k] >= 7000));
    const cnt = new Map();
    for (const k of cells) if (A.CFLAT[k] !== nlit) cnt.set(A.CFLAT[k], (cnt.get(A.CFLAT[k]) || 0) + 1);
    const cf = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
    for (const k of cells) {
      A.LIGHT[k] = 144;
      if (A.CFLAT[k] === nlit) A.CFLAT[k] = cf;
      if (A.SPEC[k] === 1 || A.SPEC[k] === 17) A.SPEC[k] = 0;
    }
    const inBox = new Set(cells), seen = new Set();
    let best = [];
    for (const k0 of cells) {
      if (seen.has(k0) || A.SPEC[k0]) continue;
      const key = (k) => `${A.FZ[k]},${A.CZ[k]},${A.FFLAT[k]},${A.CFLAT[k]}`;
      const kk = key(k0), comp = [k0]; seen.add(k0);
      for (let i = 0; i < comp.length; i++) for (const q of [comp[i] + 1, comp[i] - 1, comp[i] + A.W, comp[i] - A.W]) if (inBox.has(q) && !seen.has(q) && !A.SPEC[q] && key(q) === kk) { seen.add(q); comp.push(q); }
      if (comp.length > best.length) best = comp;
    }
    for (const k of best) { A.SPEC[k] = 9; A.GROUP[k] = 99 + n; }
    A.log(`secret ${n + 1}: ${best.length} of ${cells.length} cells`);
  });
}

const SIGNTEX = {
  sign_chinatown_01: ['CTNSG2', 128, 32], sign_chinatown_02: ['CTNSG1', 32, 128], sign_chinatown_03: ['CTNSG1', 32, 128],
  sign_drugs: ['CTNSG9', 64, 64], sign_garage_01: ['CTNSG6', 128, 32], fallout_motel_sign: ['CTNSG7', 64, 128],
  subway_sign01: ['CTNSG5', 128, 32], sign_gun_shop_side: ['CTNSG3', 128, 32], sign_gun_shop_front: ['CTNSG3', 128, 32],
  sign_market_lg_01: ['CTNSG4', 128, 32],
};
// A sign band over an opening: the opening (ceiling z0) is behind the edge
// `seg`; a one-cell header strip on the `face` side gets ceiling z0 + the
// sign's height, so the sign shows exactly once as the upper texture between.
function signHeader(layer, seg, face, tex) {
  const [x0, y0, x1, y1] = seg;
  const [dx, dy] = DIR[face];
  const r = dx ? [x0, y0, x0 + dx * 8, y1] : [x0, y0, x1, y0 + dy * 8];
  // the opening's own ceiling (cells just behind the edge)
  const inner = dx ? [x0 - dx * 8, y0, x0, y1] : [x0, y0 - dy * 8, x1, y0];
  let z0 = Infinity;
  for (const k of A.cellsOf(layer, inner)) if (A.KIND[k] === 1) z0 = Math.min(z0, A.CZ[k]);
  A.set(layer, r, { ceil: z0 + texHeight(tex), cflat: 'CFCEIL2', group: A.newGroup() });
  const len = dx ? Math.abs(y1 - y0) : Math.abs(x1 - x0);
  A.line(layer, seg, { top: tex, front: face, xoff: Math.max(0, (texWidth(tex) - len) / 2) });
  for (const k of A.cellsOf(layer, [r[0] - 96, r[1] - 96, r[2] + 96, r[3] + 96])) {
    if (A.KIND[k] === 1 && !A.SPEC[k] && !A.TAG[k] && !A.GROUP[k]) A.LIGHT[k] = Math.min(200, Math.max(A.LIGHT[k], 160));
  }
}

function placeSigns(ref) {
  // signs over openings hang on a header: the SUBWAY sign over the exit
  // mouth (reference (-1984,-4880), 160 up) and the laundromat's
  signHeader('street', [-1992, -4944, -1992, -4816], 'e', 'CTNSG5');
  // (the laundromat's sign: on the front of the arcade before its windows)
  signHeader('street', [-1568, -576, -1440, -576], 'n', 'CTNSG8');
  const list = ref.signs.filter((s) => SIGNTEX[s.m] && s.m !== 'subway_sign01').map((s) => ({ ...s }));
  for (const s of list) {
    const [tex, w, hgt] = SIGNTEX[s.m];
    // the wall the sign faces away from (model yaw), else the nearest wall
    let best = null;
    const yf = s.yaw === undefined ? null : ['e', 'n', 'w', 's'][Math.round(s.yaw / 90) % 4];
    for (const f of yf ? [yf, 'n', 's', 'e', 'w'] : ['n', 's', 'e', 'w']) {
      if (best && best.yaw) break;
      const [dx, dy] = DIR[f];
      // look for a walkable cell next to the sign on side f, then the wall behind
      for (let r = 0; r <= (f === yf ? 160 : 96); r += 8) {
        const c = A.cell('street', s.x + dx * r, s.y + dy * r);
        if (c && c.kind === 1) {
          const wall = A.findWall('street', s.x + dx * r, s.y + dy * r, -dx, -dy, 160);
          if (wall !== null) {
            const dist = Math.abs((dx ? s.x : s.y) - wall) + r;
            if (f === yf && dist <= 192) best = { f, dist, yaw: true };
            else if (!best || dist < best.dist) best = { f, dist };
          }
          break;
        }
      }
    }
    if (!best) { A.log(`sign ${s.m} at (${s.x},${s.y}) found no wall`); continue; }
    const fl = floorNear('street', s.x, s.y);
    const z0 = Math.max(72, Math.min(s.z - fl - hgt / 2, 320));
    const [dx, dy] = DIR[best.f];
    const px = dx ? s.x + dx * 32 : s.x, py = dy ? s.y + dy * 32 : s.y;
    niche('street', px, py, best.f, { tex, w, z0, z1: z0 + hgt, xoff: 0 });
    // neon glow on the street in front of the sign
    for (const k of A.cellsOf('street', [px - 96, py - 96, px + 96, py + 96])) {
      if (A.KIND[k] !== 1 || A.SPEC[k] || A.TAG[k] || A.GROUP[k]) continue;
      A.LIGHT[k] = Math.min(200, Math.max(A.LIGHT[k], 160 + (tex === 'CTNSG7' || tex === 'CTNSG1' ? 16 : 0)));
    }
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

