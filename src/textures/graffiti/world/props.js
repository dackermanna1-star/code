// Paint layers for small prop surfaces: dumpsters, doors, utility boxes,
// wooden utility poles (unrolled, wraps horizontally), fences, roll-down shutters.

import { Rng } from '../core/rng.js';
import { createCanvas, get2d } from '../core/canvas.js';
import { PAINT, jitter, mix, pickTagColor } from '../core/color.js';
import { Painter } from '../paint/painter.js';
import { buildFields, Accumulator } from './aging.js';
import { getWriterPool, pickLocalWriters, pickWriter } from './writers.js';
import { renderTag } from '../elements/tag.js';
import { renderThrowup } from '../elements/throwup.js';
import { renderPiece } from '../elements/piece.js';
import { renderPaintOut, renderSprayBuff, renderRollerBuff, buffColor, shadeVariant } from '../elements/buff.js';
import { renderSticker } from '../elements/sticker.js';
import { renderFlyers } from '../elements/poster.js';
import { renderScribble, renderScratches } from '../elements/scribble.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const BASE_TONES = {
  dumpster: [58, 66, 60],
  door: [70, 72, 74],
  box: [120, 124, 118],
  pole: [96, 80, 64],
  fence: [110, 96, 80],
  shutter: [128, 130, 132],
};

// relative content mix per kind
const MIX = {
  dumpster: { tags: 1.0, throws: 0.25, pieces: 0, stickers: 0.35, scribbles: 0.8, buffs: 0.7, scratches: 0.6, flyers: 0 },
  door: { tags: 1.3, throws: 0.25, pieces: 0, stickers: 0.9, scribbles: 1.0, buffs: 0.8, scratches: 0.4, flyers: 0.1 },
  box: { tags: 0.9, throws: 0.1, pieces: 0, stickers: 1.6, scribbles: 0.8, buffs: 0.7, scratches: 0.3, flyers: 0.2 },
  pole: { tags: 0.7, throws: 0, pieces: 0, stickers: 1.3, scribbles: 0.6, buffs: 0.1, scratches: 0, flyers: 1 },
  fence: { tags: 1.1, throws: 0.5, pieces: 0.05, stickers: 0.3, scribbles: 0.8, buffs: 0.6, scratches: 0.1, flyers: 0.1 },
  shutter: { tags: 1.0, throws: 0.7, pieces: 0.35, stickers: 0.4, scribbles: 0.6, buffs: 0.8, scratches: 0.2, flyers: 0.1 },
};

export function normalizePropSpec(spec) {
  const kind = MIX[spec.kind] ? spec.kind : 'door';
  return {
    seed: spec.seed ?? 1,
    kind,
    widthM: Math.max(0.1, spec.widthM ?? 1),
    heightM: Math.max(0.1, spec.heightM ?? 2),
    ppm: Math.max(4, spec.pxPerMeter ?? 64),
    density: Math.max(0, Math.min(1, spec.density ?? 0.6)),
    wallTone: (spec.baseTone || spec.wallTone || BASE_TONES[kind]).slice(0, 3),
    ageYears: Math.max(0.3, spec.ageYears ?? (kind === 'pole' ? 12 : 6)),
    poolSeed: spec.poolSeed ?? 'alley',
    groundLine: spec.groundLine ?? 0,
    holes: [],
    periodicX: kind === 'pole',
    canvases: spec.canvases !== false,
    edgeMargin: kind === 'pole' ? 0 : 0.03,
  };
}

function poisson(rng, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + rng.gauss() * Math.sqrt(lambda)));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng.next(); } while (p > L);
  return k - 1;
}

/** Draw an element; on wrapping surfaces repeat it across the seam. */
function wrapDraw(P, S, seed, fn) {
  const box = fn(new Rng(seed));
  if (S.periodicX && box) {
    if (box.x0 < 0) { P.setOffset(S.widthM); fn(new Rng(seed)); P.setOffset(0); }
    if (box.x1 > S.widthM) { P.setOffset(-S.widthM); fn(new Rng(seed)); P.setOffset(0); }
  }
  return box;
}

export function* propPaintGen(spec) {
  const t0 = now();
  const S = normalizePropSpec(spec);
  const Wpx = Math.max(1, Math.round(S.widthM * S.ppm));
  const Hpx = Math.max(1, Math.round(S.heightM * S.ppm));
  const rng = new Rng('prop:' + S.kind + ':' + String(S.seed));
  const fields = buildFields(S, Wpx, Hpx, rng.fork('fields'));
  const acc = new Accumulator(Wpx, Hpx);
  const pool = getWriterPool(S.poolSeed);
  const local = pickLocalWriters(pool, rng.fork('local'), 10);
  const color = createCanvas(Wpx, Hpx), cctx = get2d(color);
  const props = createCanvas(Math.ceil(Wpx / 2), Math.ceil(Hpx / 2)), pctx = get2d(props);
  const mixK = MIX[S.kind];
  const area = S.widthM * Math.min(S.heightM, 3);
  const nEras = Math.max(2, Math.min(4, Math.round(1 + S.ageYears / 4)));
  const counts = { tags: 0, throwups: 0, pieces: 0, buffs: 0, stickers: 0, flyers: 0, scribbles: 0, scratches: 0 };
  const isPole = S.kind === 'pole';
  const reachTop = Math.min(S.heightM, isPole ? 3.0 : S.heightM);
  // canvas v for a height above the surface bottom
  const vOf = (y) => S.heightM - y;
  yield;
  for (let e = 0; e < nEras; e++) {
    const er = rng.fork('era' + e);
    const age = e === nEras - 1 ? er.range(0.1, 1) : S.ageYears * (1 - (e + er.range(0.3, 0.7)) / nEras);
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, Wpx, Hpx);
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, props.width, props.height);
    const P = new Painter({ ctx: cctx, pctx, ppm: S.ppm, widthM: S.widthM, heightM: S.heightM, wallTone: S.wallTone, propsScale: 0.5 });
    const dens = S.density * er.range(0.7, 1.2);
    let jid = 0;
    const seedFor = () => er.int(0, 1e9) + jid++;
    const xr = () => (isPole ? er.range(0, S.widthM) : er.range(0.08, S.widthM - 0.08) * 1);

    // buff squares first (older tags painted out)
    if (e > 0) {
      const nb = poisson(er, area * 0.45 * mixK.buffs * dens);
      for (let i = 0; i < nb; i++) {
        const w = Math.min(S.widthM * 0.9, er.range(0.2, 0.9)), h = er.range(0.12, 0.6);
        const x0 = isPole ? er.range(0, S.widthM) : er.range(0, Math.max(0.01, S.widthM - w));
        const yb = er.range(0.1, Math.max(0.15, reachTop - h));
        const c = er.chance(0.6) ? shadeVariant(S.wallTone, er, 0.12) : buffColor(S.wallTone, er).color;
        wrapDraw(P, S, seedFor(), (r) => (r.chance(0.7)
          ? renderPaintOut(P, r, { x0, x1: x0 + w, top: vOf(yb + h), bottom: vOf(yb), color: c })
          : renderSprayBuff(P, r, { box: { x0, x1: x0 + w, y0: vOf(yb + h), y1: vOf(yb) }, color: c })));
        counts.buffs++;
      }
      if (S.kind === 'shutter' && er.chance(0.4 * mixK.buffs)) {
        const c = buffColor(S.wallTone, er, er.pick(['grey', 'darkgrey', 'beige'])).color;
        wrapDraw(P, S, seedFor(), (r) => renderRollerBuff(P, r, { x0: 0.02, x1: S.widthM - 0.02, top: vOf(Math.min(S.heightM - 0.02, er.range(1.2, 2.8))), bottom: vOf(0.02), color: c }));
        counts.buffs++;
      }
    }
    // flyers (poles, sometimes boxes/doors)
    if (mixK.flyers > 0 && er.chance(Math.min(1, mixK.flyers))) {
      const n = Math.round((isPole ? 6 : 2) * dens * er.range(0.6, 1.4));
      const y0 = isPole ? 1.15 : 1.0, y1 = isPole ? 2.3 : 1.7;
      const nStaples = isPole ? Math.round(80 * dens) : 0;
      for (let i = 0; i < n; i++) {
        const fx = er.range(0, S.widthM);
        wrapDraw(P, S, seedFor(), (r) => renderFlyers(P, r, { x0: fx - 0.1, x1: fx + 0.15, y0: vOf(Math.min(S.heightM, y1)), y1: vOf(y0), count: 1, staples: Math.round(nStaples / n) }));
      }
      counts.flyers += n;
    }
    // pieces / throw-ups on large flat props
    const nPieces = poisson(er, area * 0.03 * mixK.pieces * dens);
    for (let i = 0; i < nPieces; i++) {
      const w = pickWriter(local, er);
      const h = Math.min(S.heightM * 0.45, er.range(0.6, 1.0));
      const x = S.widthM / 2 + er.range(-0.25, 0.25) * S.widthM, y = vOf(er.range(h, Math.max(h + 0.01, S.heightM - h)));
      wrapDraw(P, S, seedFor(), (r) => renderPiece(P, r, { writer: w, h, x, y, maxW: S.widthM * 0.9 }));
      counts.pieces++;
    }
    const nThrows = poisson(er, area * 0.22 * mixK.throws * dens);
    for (let i = 0; i < nThrows; i++) {
      let w = pickWriter(local, er);
      const h = Math.min(S.heightM * 0.5, er.range(0.25, 0.6));
      const y = vOf(er.range(h * 0.8, Math.max(h, reachTop - h * 0.6)));
      const x = xr();
      wrapDraw(P, S, seedFor(), (r) => renderThrowup(P, r, { writer: w, h, x, y }));
      counts.throwups++;
    }
    // tags
    const nTags = Math.round(area * 4.2 * mixK.tags * dens);
    for (let i = 0; i < nTags; i++) {
      const w = pickWriter(local, er);
      const vertical = isPole && er.chance(0.35);
      const h = vertical ? er.range(0.07, 0.14) : Math.max(0.05, Math.min(0.4, Math.exp(er.gauss() * 0.35) * (isPole ? 0.12 : 0.16)));
      const y = vOf(er.range(isPole ? 0.4 : 0.1, reachTop - 0.1));
      const x = xr();
      const tool = S.kind === 'dumpster' && er.chance(0.5) ? 'marker' : w.tool;
      const col = S.kind === 'dumpster' || S.kind === 'door' || S.kind === 'shutter'
        ? (er.chance(0.45) ? er.pickW([[PAINT.white, 4], [PAINT.silver, 3], [PAINT.lightGrey, 1], [PAINT.black, 2]]) : w.color)
        : er.chance(0.7) ? w.color : pickTagColor(er);
      wrapDraw(P, S, seedFor(), (r) => renderTag(P, r, { writer: w, h, x, y, tool, color: col, vertical, maxW: isPole ? S.widthM * 0.8 : S.widthM * 0.95 }));
      counts.tags++;
    }
    // stickers
    const nSt = poisson(er, area * 3.0 * mixK.stickers * dens);
    for (let i = 0; i < nSt; i++) {
      const w = pickWriter(local, er);
      const x = xr();
      const y = vOf(er.range(isPole ? 1.0 : 0.6, Math.min(reachTop, isPole ? 2.4 : 1.9)));
      wrapDraw(P, S, seedFor(), (r) => renderSticker(P, r, { x, y, size: r.range(0.06, 0.14), writer: w, age: e < nEras - 1 ? 0.5 : 0.1 }));
      counts.stickers++;
    }
    // marker scribbles
    const nSc = Math.round(area * 2.5 * mixK.scribbles * dens);
    for (let i = 0; i < nSc; i++) {
      const w = pickWriter(local, er);
      const x = xr();
      const y = vOf(er.range(0.2, reachTop - 0.05));
      wrapDraw(P, S, seedFor(), (r) => (r.chance(0.45)
        ? renderTag(P, r, { writer: w, h: r.range(0.035, 0.09), x, y, tool: 'marker', color: r.chance(0.5) ? PAINT.black : w.markerColor })
        : renderScribble(P, r, { x, y, writer: w })));
      counts.scribbles++;
    }
    // scratchiti on metal props
    const nScr = poisson(er, area * 0.8 * mixK.scratches * dens);
    for (let i = 0; i < nScr; i++) {
      const x = xr(), y = vOf(er.range(0.3, reachTop - 0.1));
      wrapDraw(P, S, seedFor(), (r) => renderScratches(P, r, { x, y, r: r.range(0.08, 0.3) }));
      counts.scratches++;
    }
    const img = cctx.getImageData(0, 0, Wpx, Hpx).data;
    const pimg = pctx.getImageData(0, 0, props.width, props.height).data;
    acc.composite(img, pimg, fields, age, { wallTone: S.wallTone, eraIndex: e, erosion: S.kind === 'pole' ? 1.1 : 0.85, pshift: 1 });
    yield;
  }
  const out = acc.finish({ canvases: S.canvases });
  const stats = { ms: Math.round(now() - t0), width: Wpx, height: Hpx, kind: S.kind, eras: nEras, counts, coverage: +out.coverage.toFixed(3) };
  return { color: out.color, props: out.props, colorImage: out.colorImage, propsImage: out.propsImage, stats };
}

export { mix, jitter };
