// STUB — replaced by the props agent. Exports: initProps(), getProp(type, opts) → {canvas, ox, oy},
// drawPropDynamic(ctx, type, px, py, params, t).
import { propDef } from '../data/props.js';
import { makeCanvas, ctxOf, hashStr, tinyText } from './util.js';
import { PROP_B_TYPES, renderPropB, drawPropDynamicB, initPropsB } from './props_b.js';
const cache = new Map();
export async function initProps() { await initPropsB(); }
export function getProp(type, opts = {}) {
  if (PROP_B_TYPES.includes(type)) { const r = renderPropB(type, opts); if (r) return r; }
  const key = `${type}|${opts.state || ''}|${opts.dir || ''}`;
  if (cache.has(key)) return cache.get(key);
  const d = propDef(type);
  const w = d.w * 16, h = d.h * 16 + (d.mount === 'floor' ? 8 : 0);
  const c = makeCanvas(w, h); const x = ctxOf(c);
  const hue = hashStr(type) % 360;
  x.fillStyle = `hsl(${hue},25%,${d.mount === 'decal' ? 22 : 35}%)`; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, h - 2, w, 2);
  tinyText(x, 1, 1, type.slice(0, Math.max(1, Math.floor(w / 4))), '#fff');
  const r = { canvas: c, ox: 0, oy: -(h - d.h * 16) };
  cache.set(key, r); return r;
}
export function drawPropDynamic(ctx, type, px, py, params = {}, t = 0) {
  if (PROP_B_TYPES.includes(type)) return drawPropDynamicB(ctx, type, px, py, params, t);
  const p = getProp(type, params); ctx.drawImage(p.canvas, px + p.ox, py + p.oy);
}
