// Rich item tooltip (game.describeItem) and the right-click context menu.
import { getItemDef, itemWeight, itemDisplayName } from '../items/items.js';
import { getItemIconURL } from '../items/icons.js';
import { h, clear, clamp, fmtKg, RARITY_COLORS } from './dom.js';

export class Tooltip {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div.tooltip.hidden');
    this.stack = null;
  }

  describe(stack) {
    const g = this.ui.game;
    let d = null;
    try { d = g.describeItem?.(stack); } catch (e) { console.warn('describeItem failed', e); }
    const def = getItemDef(stack.id);
    if (!d) {
      const lines = [];
      if (def.desc) lines.push(def.desc);
      d = { name: safeName(stack), lines, rarity: def.rarity || 'common', condition: def.durability ? (stack.dur ?? def.durability) / def.durability : null };
    }
    return { def, d };
  }

  show(stack, x, y, extra) {
    if (!stack) return this.hide();
    if (this.stack !== stack || this._n !== stack.count || this._dur !== stack.dur || this._extra !== extra) {
      this.stack = stack; this._n = stack.count; this._dur = stack.dur; this._extra = extra;
      this.render(stack, extra);
    }
    this.el.classList.remove('hidden');
    this.place(x, y);
  }

  render(stack, extra) {
    const { def, d } = this.describe(stack);
    const rarity = d.rarity || def.rarity || 'common';
    const col = RARITY_COLORS[rarity] || RARITY_COLORS.common;
    clear(this.el);
    this.el.dataset.rarity = rarity;
    const cat = (def.category || 'misc').replace(/_/g, ' ');
    const head = h('div.tt-head',
      h('div.tt-icon', h('img.px', { src: getItemIconURL(def), draggable: false, alt: '' })),
      h('div.tt-titles',
        h('div.tt-name', { text: d.name || safeName(stack), style: { color: col } }),
        h('div.tt-sub', `${rarity} · ${cat}`)));
    this.el.appendChild(head);
    if (d.condition != null && !isNaN(d.condition)) {
      const c = clamp(d.condition, 0, 1);
      const color = c > 0.6 ? '#7fb04a' : c > 0.3 ? '#d6a93a' : '#c8402a';
      this.el.appendChild(h('div.tt-cond',
        h('span.tt-k', 'Condition'),
        h('div.tt-cond-bar', h('i', { style: { width: (c * 100).toFixed(0) + '%', background: color } })),
        h('span.tt-v', Math.round(c * 100) + '%')));
    }
    const lines = h('div.tt-lines');
    for (const raw of d.lines || []) {
      const line = String(raw);
      const m = line.match(/^([^:.]{1,22}):\s*(.+)$/);
      let cls = 'tt-line';
      if (/^(warning|!)/i.test(line) || /spoil|rotten|broken|jammed|empty/i.test(line)) cls += ' bad';
      if (m) lines.appendChild(h('div.' + cls.split(' ').join('.'), h('span.tt-k', m[1]), h('span.tt-v', m[2])));
      else lines.appendChild(h('div.' + cls.split(' ').join('.') + '.text', line));
    }
    if (lines.childNodes.length) this.el.appendChild(lines);
    const w = itemWeight(stack);
    const count = stack.count || 1;
    this.el.appendChild(h('div.tt-foot',
      h('span', `${fmtKg(w)} kg${count > 1 ? `  (${count} × ${fmtKg(def.weight || 0)})` : ''}`),
      extra ? h('span.tt-hint', extra) : null));
  }

  /** simple two-line tooltip (empty equipment slots, map POIs, buttons) */
  showText(title, sub, x, y) {
    const key = 'T|' + title + '|' + sub;
    if (this.stack !== key) {
      this.stack = key;
      clear(this.el);
      this.el.dataset.rarity = 'common';
      this.el.appendChild(h('div.tt-simple', h('div.tt-name', title), sub ? h('div.tt-sub', sub) : null));
    }
    this.el.classList.remove('hidden');
    this.place(x, y);
  }

  place(x, y) {
    const r = this.el.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    let px = x + 18, py = y + 14;
    if (px + r.width > W - 6) px = x - r.width - 14;
    if (py + r.height > H - 6) py = H - r.height - 6;
    if (py < 6) py = 6;
    if (px < 6) px = 6;
    this.el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
  }

  hide() {
    this.stack = null;
    this.el.classList.add('hidden');
  }
}

function safeName(stack) {
  try { return itemDisplayName(stack); } catch { return getItemDef(stack.id).name; }
}

export class ContextMenu {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div.ctxmenu.hidden');
    this.open = false;
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('pointerdown', (e) => {
      if (this.open && !this.el.contains(e.target)) this.hide();
    }, true);
  }

  show(x, y, title, actions) {
    clear(this.el);
    if (title) this.el.appendChild(h('div.ctx-title', title));
    if (!actions || !actions.length) this.el.appendChild(h('div.ctx-item.disabled', 'No actions'));
    for (const a of actions || []) {
      if (a.separator) { this.el.appendChild(h('div.ctx-sep')); continue; }
      const it = h('div.ctx-item' + (a.disabled ? '.disabled' : '') + (a.danger ? '.danger' : ''),
        h('span', a.label), a.hint ? h('span.ctx-hint', a.hint) : null);
      if (!a.disabled) {
        it.addEventListener('pointerenter', () => this.ui.sound('ui_hover', 0.25));
        it.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hide();
          this.ui.sound('ui_click');
          try { a.run?.(); } catch (err) { console.error('action failed', err); }
          this.ui.refresh();
        });
      }
      this.el.appendChild(it);
    }
    this.el.classList.remove('hidden');
    this.open = true;
    const r = this.el.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    let px = x + 2, py = y + 2;
    if (px + r.width > W - 4) px = x - r.width - 2;
    if (py + r.height > H - 4) py = H - r.height - 4;
    this.el.style.transform = `translate(${Math.round(Math.max(4, px))}px, ${Math.round(Math.max(4, py))}px)`;
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
  }
}
