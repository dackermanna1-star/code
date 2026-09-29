import { h, clear } from './dom';
import type { Order } from '../game/Order';
import type { OrderBook } from '../game/OrderBook';
import { DONENESS, INGREDIENTS } from '../food/Ingredients';
import type { IconRenderer } from './Icons';
import type { BurgerStack } from '../food/BurgerStack';
import { ROSTER_BY_ID } from '../characters/Roster';

export class Tickets {
  readonly rail: HTMLElement;
  readonly panel: HTMLElement;
  private els = new Map<number, HTMLElement>();
  onSelect?: (o: Order) => void;
  onTrash?: () => void;

  constructor(
    parent: HTMLElement,
    private orders: OrderBook,
    private icons: IconRenderer,
  ) {
    this.rail = h('div', { class: 'rail' });
    parent.append(this.rail);
    this.panel = h('div', { class: 'build-ticket card paper-tex' });
    parent.append(this.panel);
  }

  private miniTicket(o: Order): HTMLElement {
    const stack = h('div', { class: 'stackmini' });
    stack.append(h('img', { src: this.icons.get(o.bun + ':bottom') }));
    for (const l of o.layers) {
      const key = l.doneness ? `${l.id}:${l.doneness}` : l.id;
      const pip = h('div', { class: 'pip' }, h('img', { src: this.icons.get(key) || this.icons.get(l.id) }));
      if (l.doneness) pip.append(h('b', { style: { background: DONENESS[l.doneness].color } }, DONENESS[l.doneness].short));
      stack.append(pip);
    }
    stack.append(h('img', { src: this.icons.get(o.bun + ':top') }));
    const el = h(
      'div',
      { class: 'ticket', title: `${o.customerName}` },
      h('div', { class: 'mood' }, h('i', { style: { width: '100%' } })),
      h('div', { class: 'num' }, `#${o.ticket}`),
      h('div', { class: 'who' }, o.customerName.split(' ')[0]),
      stack,
    );
    el.addEventListener('click', () => this.onSelect?.(o));
    return el;
  }

  refresh() {
    const visible = this.orders.visible;
    const keep = new Set(visible.map((o) => o.id));
    for (const [id, el] of this.els) {
      if (!keep.has(id)) {
        el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-40px) rotate(-10deg)', opacity: 0 }], { duration: 300, easing: 'ease-in' }).onfinish = () => el.remove();
        this.els.delete(id);
      }
    }
    for (const o of visible) {
      let el = this.els.get(o.id);
      if (!el) {
        el = this.miniTicket(o);
        this.els.set(o.id, el);
        this.rail.append(el);
      }
      el.classList.toggle('active', this.orders.activeBuildId === o.id && o.status !== 'ready');
      el.classList.toggle('ready', o.status === 'ready');
    }
  }

  updateMoods(mood: (o: Order) => number) {
    for (const [id, el] of this.els) {
      const o = this.orders.get(id);
      if (!o) continue;
      const m = mood(o);
      const bar = el.querySelector('.mood i') as HTMLElement;
      bar.style.width = `${Math.round(m * 100)}%`;
      bar.style.background = m > 0.66 ? 'var(--pickle)' : m > 0.4 ? 'var(--mustard)' : 'var(--ketchup)';
    }
  }

  /** Screen rect of a ticket element (for fly-in animations). */
  rectOf(id: number): DOMRect | null {
    return this.els.get(id)?.getBoundingClientRect() ?? null;
  }

  elementOf(id: number) {
    return this.els.get(id) ?? null;
  }

  // ------------------------------------------------------------------ build panel
  showPanel(show: boolean) {
    this.panel.classList.toggle('show', show);
  }

  renderPanel(order: Order | null, stack: BurgerStack | null, guide: boolean) {
    clear(this.panel);
    if (!order) {
      this.panel.append(h('h3', {}, 'No ticket'), h('p', { style: { fontWeight: '700', color: 'var(--ink-2)', fontSize: '14px', margin: '6px 0' } }, 'Take an order at the counter, then pick a ticket from the rail.'));
      return;
    }
    const def = ROSTER_BY_ID[order.customerId];
    this.panel.append(
      h('h3', {}, `#${order.ticket}`, h('small', {}, `${order.layers.length + 2} layers`)),
      h('div', { class: 'cust' }, def ? h('img', { src: this.icons.portrait(def) }) : null, order.customerName),
    );
    const list = h('div', { class: 'layers' });
    const placed = stack ? stack.items : [];
    const hasBottom = placed.some((i) => i.kind === 'bottom');
    const layersPlaced = placed.filter((i) => i.kind === 'layer');
    const hasTop = placed.some((i) => i.kind === 'top');
    const rows: { key: string; name: string; state: string; chip?: { t: string; c: string } }[] = [];
    rows.push({ key: order.bun + ':bottom', name: INGREDIENTS[order.bun].name, state: hasBottom ? (placed.find((i) => i.kind === 'bottom')!.id === order.bun ? 'done' : 'wrong') : 'todo' });
    order.layers.forEach((l, i) => {
      const got = layersPlaced[i];
      const state = got ? (got.id === l.id ? 'done' : 'wrong') : 'todo';
      rows.push({
        key: l.doneness ? `${l.id}:${l.doneness}` : l.id,
        name: INGREDIENTS[l.id].name,
        state,
        chip: l.doneness ? { t: DONENESS[l.doneness].label, c: DONENESS[l.doneness].color } : undefined,
      });
    });
    rows.push({ key: order.bun + ':top', name: 'Top bun', state: hasTop ? 'done' : 'todo' });
    const nextIdx = rows.findIndex((r) => r.state === 'todo');
    rows.forEach((r, i) => {
      const cls = 'layer ' + (r.state === 'done' ? 'done' : r.state === 'wrong' ? 'wrong' : '') + (i === nextIdx && guide ? ' next' : '');
      const row = h('div', { class: cls }, h('img', { src: this.icons.get(r.key) || this.icons.get(r.key.split(':')[0]) }), h('span', {}, r.name));
      if (r.chip) row.append(h('span', { class: 'dn', style: { background: r.chip.c } }, r.chip.t));
      list.append(row);
    });
    this.panel.append(list);
    if (stack && stack.items.length) {
      const trash = h('button', { class: 'btn ghost small', onclick: () => this.onTrash?.() }, '🗑 Trash burger');
      this.panel.append(h('div', { class: 'actions' }, trash));
    }
    void layersPlaced;
  }
}
