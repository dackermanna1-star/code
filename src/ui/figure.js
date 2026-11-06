// Minecraft-proportioned body silhouette made of 6 part boxes (16 x 32 "skin pixels").
// Seen from behind, so armL / legL are on the screen-left (matches the first-person point of view).
import { h } from './dom.js';

export const BODY_PARTS = {
  head: { x: 4, y: 0, w: 8, h: 8 },
  torso: { x: 4, y: 8, w: 8, h: 12 },
  armL: { x: 0, y: 8, w: 4, h: 12 },
  armR: { x: 12, y: 8, w: 4, h: 12 },
  legL: { x: 4, y: 20, w: 4, h: 12 },
  legR: { x: 8, y: 20, w: 4, h: 12 },
};

/** px = size of one skin pixel in ui units. Returns {el, parts:{name: el}} */
export function makeFigure(px, cls = '') {
  const el = h('div.figure' + (cls ? '.' + cls : ''), { style: { '--px': String(px) } });
  const parts = {};
  for (const [name, b] of Object.entries(BODY_PARTS)) {
    const p = h('div.fig-part.fp-' + name, {
      dataset: { part: name },
      style: {
        left: `calc(var(--u) * ${b.x * px})`, top: `calc(var(--u) * ${b.y * px})`,
        width: `calc(var(--u) * ${b.w * px})`, height: `calc(var(--u) * ${b.h * px})`,
      },
    });
    parts[name] = p;
    el.appendChild(p);
  }
  // head details: hair line
  parts.head.appendChild(h('i.fig-hair'));
  return { el, parts };
}

/** centre of a part in ui units (relative to the figure) */
export function partCenter(name, px) {
  const b = BODY_PARTS[name] || BODY_PARTS.torso;
  return { x: (b.x + b.w / 2) * px, y: (b.y + b.h / 2) * px };
}
