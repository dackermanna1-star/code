// Cutting a city block into lots that front its streets.
//
// A block is a rectangle between streets (plan.blocks: the roads and sidewalks are already outside it).
// Lots are laid along the sides that have a street: strips along the two long sides, then the short
// sides between them; what is left in the middle is the block's yard (parking, courtyards, gardens).
// A block too narrow for two rows gets one row, facing its best street.
//
//   const L = blockLots(block, info, opts, r)  -> { lots: [lot], yard: {x0, z0, x1, z1} | null }
//   lot = { x, z (centre), w (along the street), d (deep), yaw (its front faces (sin yaw, cos yaw)),
//           side 'n'|'s'|'e'|'w', street {cls, name}, cornerL, cornerR (a cross street on its left/right
//           seen from the street), x0, z0, x1, z1 (world rectangle) }
//   opts = { dmin, dmax, wmin, wmax, gmin, gmax (gaps between lots), single: prefer one row,
//            prefer: side to face when single, corner: true (corner lots take the cross street too) }

// a lot facing side s has its front towards: n -z, s +z, e +x, w -x
export const SIDE_YAW = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 };
const RANK = { blvd: 5, drive: 4, ave: 3, street: 2, hwy: 0 };

export function blockLots(b, info, o, r) {
  const lots = [];
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const has = { n: b.edge.n, s: b.edge.s, e: b.edge.e, w: b.edge.w };
  const street = info.streets || {};
  const rank = (s) => (has[s] ? (RANK[street[s]?.cls] ?? 1) + (street[s]?.bonus || 0) : -1);
  // the long sides
  const alongX = W >= D; // long sides are n and s (lots run along x)
  const longS = alongX ? ['n', 's'] : ['w', 'e'];
  const shortS = alongX ? ['w', 'e'] : ['n', 's'];
  const shortDim = alongX ? D : W, longDim = alongX ? W : D;
  const dmax = o.dmax, dmin = o.dmin;
  let single = o.single || shortDim < dmin * 2 + 4;
  // which long sides get a strip
  let strips = longS.filter((s) => has[s]);
  if (!strips.length) strips = longS.slice(0, 1);
  if (single || strips.length === 1) {
    // one row facing the better street (or the preferred one)
    const best = o.prefer && has[o.prefer] ? o.prefer : [...longS, ...shortS].filter((s) => has[s]).sort((a, c) => rank(c) - rank(a))[0] || longS[0];
    if (longS.includes(best) || !o.prefer) {
      const s = longS.includes(best) ? best : strips[0];
      const depth = Math.min(shortDim, single ? shortDim : dmax);
      layStrip(s, depth, 0, longDim, true, true);
      const yard = depth < shortDim - 20 ? rectBehind(s, depth) : null;
      return { lots, yard };
    }
    // facing a short side: lots run across the block
    layStrip(best, Math.min(longDim, dmax), 0, shortDim, true, true);
    return { lots, yard: null };
  }
  // two rows along the long sides, with the short sides between them
  const depth = Math.min(dmax, Math.max(dmin, shortDim / 2 - (shortDim > dmax * 2 + 30 ? 0 : 0)));
  const dd = Math.min(depth, shortDim / 2);
  for (const s of strips) layStrip(s, dd, 0, longDim, true, true);
  // the short sides (between the long strips) when there's room
  const mid0 = strips.includes(longS[0]) ? dd : 0, mid1 = shortDim - (strips.includes(longS[1]) ? dd : 0);
  if (mid1 - mid0 > (o.wmin || 20)) {
    for (const s of shortS) if (has[s]) layStrip(s, Math.min(dmax, longDim / 2), mid0, mid1, false, false);
  }
  // the yard: what's left in the middle
  let yard = null;
  const inner = Math.min(dmax, longDim / 2);
  if (mid1 - mid0 > 24 && longDim - inner * 2 > 24) {
    yard = alongX ? { x0: b.x0 + inner, x1: b.x1 - inner, z0: b.z0 + mid0, z1: b.z0 + mid1 } : { x0: b.x0 + mid0, x1: b.x0 + mid1, z0: b.z0 + inner, z1: b.z1 - inner };
  } else if (mid1 - mid0 > 24) {
    yard = alongX ? { x0: b.x0 + 4, x1: b.x1 - 4, z0: b.z0 + mid0, z1: b.z0 + mid1 } : { x0: b.x0 + mid0, x1: b.x0 + mid1, z0: b.z0 + 4, z1: b.z1 - 4 };
    if (shortS.some((s) => has[s])) yard = null; // the short-side lots fill it
  }
  return { lots, yard };

  // lots along side s, `depth` deep, from t0 to t1 along the side (measured from the block's low corner)
  function layStrip(s, depth, t0, t1, endsL, endsR) {
    const L = t1 - t0;
    if (L < (o.wmin || 16) * 0.6) return;
    // the widths: random, the last one takes up the slack
    const ws = [];
    let acc = 0;
    while (acc < L) {
      let w = o.wmin + r() * (o.wmax - o.wmin);
      const gap = ws.length ? o.gmin + r() * (o.gmax - o.gmin) : 0;
      if (acc + gap + w > L || L - (acc + gap + w) < o.wmin * 0.7) { w = L - acc - gap; if (w < o.wmin * 0.55) { if (ws.length) ws[ws.length - 1].w += w + gap; break; } }
      ws.push({ gap, w }); acc += gap + w;
      if (ws.length > 60) break;
    }
    let t = t0;
    for (let i = 0; i < ws.length; i++) {
      t += ws[i].gap;
      const a = t, c = t + ws[i].w; t = c;
      lots.push(makeLot(s, a, c, depth, i === 0 && endsL, i === ws.length - 1 && endsR));
    }
  }
  function makeLot(s, a, c, depth, first, last) {
    // the rectangle, and which end is on the lot's left seen from the street
    let x0, x1, z0, z1, leftIsLow;
    if (s === 'n') { x0 = b.x0 + a; x1 = b.x0 + c; z0 = b.z0; z1 = b.z0 + depth; leftIsLow = false; }
    else if (s === 's') { x0 = b.x0 + a; x1 = b.x0 + c; z0 = b.z1 - depth; z1 = b.z1; leftIsLow = true; }
    else if (s === 'w') { z0 = b.z0 + a; z1 = b.z0 + c; x0 = b.x0; x1 = b.x0 + depth; leftIsLow = true; }
    else { z0 = b.z0 + a; z1 = b.z0 + c; x0 = b.x1 - depth; x1 = b.x1; leftIsLow = false; }
    // a cross street at either end of the strip
    const lowSide = s === 'n' || s === 's' ? 'w' : 'n', highSide = s === 'n' || s === 's' ? 'e' : 's';
    const lowCorner = first && has[lowSide], highCorner = last && has[highSide];
    const ns = s === 'n' || s === 's';
    return {
      x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: ns ? x1 - x0 : z1 - z0, d: ns ? z1 - z0 : x1 - x0,
      yaw: SIDE_YAW[s], side: s, street: street[s] || { cls: 'street', name: '' },
      cornerL: leftIsLow ? lowCorner : highCorner, cornerR: leftIsLow ? highCorner : lowCorner,
      crossL: leftIsLow ? street[lowSide] : street[highSide], crossR: leftIsLow ? street[highSide] : street[lowSide],
      x0, x1, z0, z1, block: b,
    };
  }
  function rectBehind(s, depth) {
    if (s === 'n') return { x0: b.x0, x1: b.x1, z0: b.z0 + depth, z1: b.z1 };
    if (s === 's') return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 - depth };
    if (s === 'w') return { x0: b.x0 + depth, x1: b.x1, z0: b.z0, z1: b.z1 };
    return { x0: b.x0, x1: b.x1 - depth, z0: b.z0, z1: b.z1 };
  }
}

/** World (x, z) of a lot-local point (the lot's frame: +z towards its street, +x to the right seen from the street). */
export function lotWorld(lot, lx, lz) {
  const c = Math.cos(lot.yaw), s = Math.sin(lot.yaw);
  return [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c];
}
