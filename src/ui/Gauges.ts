import { h } from './dom';

const NS = 'http://www.w3.org/2000/svg';
const START = 135; // degrees
const SWEEP = 270;
const MAX = 1.2;

const ZONES: [number, number, string][] = [
  [0, 0.3, '#f4c2bf'],
  [0.3, 0.5, '#e25555'],
  [0.5, 0.7, '#e08a3a'],
  [0.7, 0.9, '#8a5328'],
  [0.9, 1.0, '#4a2c18'],
  [1.0, 1.2, '#161212'],
];

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}
function arcPath(r: number, v0: number, v1: number) {
  const a0 = START + (v0 / MAX) * SWEEP;
  const a1 = START + (v1 / MAX) * SWEEP;
  const [x0, y0] = polar(32, 34, r, a0);
  const [x1, y1] = polar(32, 34, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
const el = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export interface Gauge {
  el: HTMLElement;
  set(down: number, up: number, o: { warn: boolean; labels: boolean; targets: number[]; flipHint: boolean }): void;
  place(x: number, y: number, visible: boolean): void;
  remove(): void;
}

export class Gauges {
  constructor(private layer: HTMLElement) {}

  create(): Gauge {
    const root = h('div', { class: 'anchored gauge pop-in' });
    const svg = el('svg', { viewBox: '0 0 64 64' });
    // backing disc
    svg.append(el('circle', { cx: 32, cy: 34, r: 29, fill: 'rgba(24,16,12,0.78)', stroke: '#1d1714', 'stroke-width': 2 }));
    for (const [a, b, c] of ZONES) svg.append(el('path', { d: arcPath(22, a, b), stroke: c, 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'butt' }));
    const progress = el('path', { d: arcPath(22, 0, 0.01), stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' });
    svg.append(progress);
    const ticks = el('g', {});
    svg.append(ticks);
    const needle = el('g', {});
    needle.append(el('path', { d: 'M 32 34 L 30 33 L 32 8 L 34 33 Z', fill: '#fff', stroke: '#1d1714', 'stroke-width': 1 }));
    needle.append(el('circle', { cx: 32, cy: 34, r: 4, fill: '#fff', stroke: '#1d1714', 'stroke-width': 1.5 }));
    svg.append(needle);
    const dot = el('circle', { cx: 32, cy: 12, r: 3.6, fill: '#ffd35a', stroke: '#1d1714', 'stroke-width': 1.5 });
    svg.append(dot);
    root.append(svg);
    const lbl = h('div', { class: 'lbl' });
    root.append(lbl);
    const flip = h('div', { class: 'flip' }, '↻ FLIP');
    root.append(flip);
    this.layer.append(root);
    let lastTargets = '';
    const g: Gauge = {
      el: root,
      set(down, up, o) {
        const dv = Math.min(MAX, down);
        const deg = START + (dv / MAX) * SWEEP + 90; // needle drawn pointing up
        needle.setAttribute('transform', `rotate(${deg} 32 34)`);
        progress.setAttribute('d', arcPath(27, 0, Math.max(0.01, dv)));
        const ua = START + (Math.min(MAX, up) / MAX) * SWEEP;
        const [ux, uy] = polar(32, 34, 13, ua);
        dot.setAttribute('cx', String(ux));
        dot.setAttribute('cy', String(uy));
        root.classList.toggle('warn', o.warn);
        flip.classList.toggle('show', o.flipHint);
        if (o.labels) {
          lbl.textContent = down >= 1 ? '🔥' : down < 0.3 ? '' : down < 0.5 ? 'R' : down < 0.7 ? 'M' : down < 0.9 ? 'W' : '!!';
        } else lbl.textContent = '';
        const key = o.targets.join(',');
        if (key !== lastTargets) {
          lastTargets = key;
          while (ticks.firstChild) ticks.removeChild(ticks.firstChild);
          for (const t of new Set(o.targets)) {
            const a = START + (t / MAX) * SWEEP;
            const [x0, y0] = polar(32, 34, 16, a);
            const [x1, y1] = polar(32, 34, 29, a);
            ticks.append(el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: '#7dffb0', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
          }
        }
      },
      place(x, y, visible) {
        root.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        root.style.opacity = visible ? '1' : '0';
      },
      remove() {
        root.remove();
      },
    };
    return g;
  }
}
