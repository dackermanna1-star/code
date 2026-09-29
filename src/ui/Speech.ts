import * as THREE from 'three';
import { h } from './dom';
import type { Customer, EmoteKind } from '../game/Customer';
import type { BunId } from '../food/Ingredients';
import type { OrderLayer } from '../game/Order';
import { DONENESS, INGREDIENTS } from '../food/Ingredients';
import type { IconRenderer } from './Icons';

interface Bubble {
  el: HTMLElement;
  c: Customer;
  until: number;
  offsetY: number;
}

const EMOTES: Record<EmoteKind, string> = {
  heart: '💖',
  star: '⭐',
  angry: '💢',
  dots: '💬',
  sweat: '💦',
  exclaim: '❗',
  music: '🎵',
  note: '🎶',
  happy: '😊',
  sad: '😞',
  yum: '😋',
};

/** Speech bubbles, emotes and patience rings anchored above customers. */
export class Speech {
  private bubbles: Bubble[] = [];
  private emotes: { el: HTMLElement; c: Customer; until: number }[] = [];
  private patience = new Map<number, HTMLElement>();
  private time = 0;

  constructor(
    private layer: HTMLElement,
    private icons: IconRenderer,
    private project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean },
  ) {}

  private removeFor(c: Customer) {
    for (const b of this.bubbles.filter((b) => b.c === c)) this.kill(b);
  }

  private kill(b: Bubble) {
    b.el.classList.add('out');
    setTimeout(() => b.el.remove(), 260);
    this.bubbles = this.bubbles.filter((x) => x !== b);
  }

  say(c: Customer, text: string, o: { duration?: number; mood?: 'angry' | 'neutral' } = {}) {
    this.removeFor(c);
    const el = h('div', { class: 'bubble' + (o.mood === 'angry' ? ' angry' : '') }, text);
    this.layer.append(el);
    this.bubbles.push({ el, c, until: this.time + (o.duration ?? 2), offsetY: 0 });
  }

  /** Order bubble: ingredient icons appear one by one, bottom to top. */
  order(c: Customer, bun: BunId, layers: OrderLayer[], step: number) {
    this.removeFor(c);
    const el = h('div', { class: 'bubble order' });
    const items: HTMLElement[] = [];
    const mk = (src: string, badge?: { text: string; color: string }) => {
      const row = h('div', { class: 'row' }, h('img', { src, alt: '' }));
      if (badge) row.append(h('b', { style: { background: badge.color } }, badge.text));
      return row;
    };
    items.push(mk(this.icons.get(bun + ':bottom') || this.icons.get(bun)));
    for (const l of layers) {
      const key = l.doneness ? `${l.id}:${l.doneness}` : l.id;
      items.push(mk(this.icons.get(key) || this.icons.get(l.id), l.doneness ? { text: DONENESS[l.doneness].short, color: DONENESS[l.doneness].color } : undefined));
    }
    items.push(mk(this.icons.get(bun + ':top') || this.icons.get(bun)));
    items.forEach((it, i) => {
      const img = it.querySelector('img')!;
      img.style.animationDelay = `${i * step}s`;
      const b = it.querySelector('b');
      if (b) (b as HTMLElement).style.animation = `itemIn 0.3s ${i * step}s both`;
      el.append(it);
    });
    el.title = [INGREDIENTS[bun].name, ...layers.map((l) => INGREDIENTS[l.id].name)].join(', ');
    this.layer.append(el);
    this.bubbles.push({ el, c, until: this.time + items.length * step + 2.2, offsetY: 0 });
  }

  emote(c: Customer, kind: EmoteKind) {
    const el = h('div', { class: 'emote' }, EMOTES[kind]);
    this.layer.append(el);
    this.emotes.push({ el, c, until: this.time + 1.6 });
  }

  update(dt: number, customers: Customer[], showPatience: boolean) {
    this.time += dt;
    const tmp = new THREE.Vector3();
    for (const b of [...this.bubbles]) {
      if (this.time > b.until || b.c.state === 'gone') {
        this.kill(b);
        continue;
      }
      const s = this.project(b.c.bubbleAnchor(tmp));
      const w = b.el.offsetWidth;
      const hgt = b.el.offsetHeight;
      b.el.style.translate = `${(s.x - 30).toFixed(1)}px ${(s.y - hgt - 14).toFixed(1)}px`;
      b.el.style.visibility = s.behind ? 'hidden' : 'visible';
      void w;
    }
    for (const e of [...this.emotes]) {
      if (this.time > e.until) {
        e.el.remove();
        this.emotes = this.emotes.filter((x) => x !== e);
        continue;
      }
      const s = this.project(e.c.bubbleAnchor(tmp));
      e.el.style.left = `${s.x + 26}px`;
      e.el.style.top = `${s.y}px`;
    }
    // patience rings for waiting customers
    const seen = new Set<number>();
    for (const c of customers) {
      const waiting = (c.state === 'waiting' || c.state === 'queued' || c.state === 'atCounter' || c.state === 'atPickup') && !c.moving;
      if (!waiting || !showPatience) continue;
      seen.add(c.uid);
      let el = this.patience.get(c.uid);
      if (!el) {
        el = h('div', { class: 'anchored patience pop-in' });
        el.innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="rgba(24,16,12,.75)" stroke="#1d1714" stroke-width="2"/><circle class="arc" cx="18" cy="18" r="11" fill="none" stroke="#4fb45a" stroke-width="5" stroke-linecap="round" transform="rotate(-90 18 18)" stroke-dasharray="69.1" stroke-dashoffset="0"/><text x="18" y="22.5" text-anchor="middle" font-size="12">🙂</text></svg>`;
        this.layer.append(el);
        this.patience.set(c.uid, el);
      }
      const hasBubble = this.bubbles.some((b) => b.c === c);
      const s = this.project(c.bubbleAnchor(tmp));
      el.style.translate = `${s.x.toFixed(1)}px ${(s.y - 4).toFixed(1)}px`;
      el.style.opacity = s.behind || hasBubble ? '0' : '1';
      const m = c.mood;
      const arc = el.querySelector('.arc') as SVGCircleElement;
      arc.setAttribute('stroke-dashoffset', String(69.1 * (1 - m)));
      arc.setAttribute('stroke', m > 0.66 ? '#4fb45a' : m > 0.4 ? '#ffc93c' : '#e2402b');
      const face = el.querySelector('text')!;
      face.textContent = m > 0.8 ? '🙂' : m > 0.6 ? '😐' : m > 0.4 ? '😒' : '😠';
    }
    for (const [uid, el] of this.patience) {
      if (!seen.has(uid)) {
        el.remove();
        this.patience.delete(uid);
      }
    }
  }

  clear() {
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
    for (const e of this.emotes) e.el.remove();
    this.emotes = [];
    for (const el of this.patience.values()) el.remove();
    this.patience.clear();
  }
}
