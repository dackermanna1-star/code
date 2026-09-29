import * as THREE from 'three';
import { h } from './dom';
import { Gauges } from './Gauges';
import { Speech } from './Speech';
import { Tickets } from './Tickets';
import { RatingPanel } from './Rating';
import { Screens } from './Screens';
import { Tutorial } from './Tutorial';
import type { IconRenderer } from './Icons';
import type { AudioEngine } from '../audio/AudioEngine';
import type { OrderBook } from '../game/OrderBook';
import type { Order } from '../game/Order';
import type { StationId } from '../game/Context';
import type { Customer } from '../game/Customer';
import type { BurgerStack } from '../food/BurgerStack';
import type { Rating } from '../game/Scoring';
import type { Progression } from '../game/Progression';
import { ROSTER_BY_ID } from '../characters/Roster';

export interface UIHost {
  onTakeOrder(): void;
  onStation(id: StationId): void;
  onSelectTicket(o: Order): void;
  onServe(orderId: number): void;
  onTrashBurger(): void;
  onPause(): void;
  onToggleMute(): boolean;
  canServe(orderId: number): boolean;
  customerMood(o: Order): number;
  customerState(o: Order): string;
  customerList(): Customer[];
  buildStack(): BurgerStack | null;
  guide(): boolean;
  hints(): boolean;
}

const STATIONS: { id: StationId; icon: string; name: string; key: string }[] = [
  { id: 'order', icon: '🧾', name: 'Order', key: '1' },
  { id: 'grill', icon: '🔥', name: 'Grill', key: '2' },
  { id: 'build', icon: '🍔', name: 'Build', key: '3' },
  { id: 'serve', icon: '🛎️', name: 'Serve', key: '4' },
];

export class UI {
  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  readonly world: HTMLElement;
  readonly gauges: Gauges;
  readonly speech: Speech;
  readonly tickets: Tickets;
  readonly rating: RatingPanel;
  readonly screens: Screens;
  readonly tutorial: Tutorial;
  private stationBtns = new Map<StationId, HTMLElement>();
  private alerts = new Map<StationId, HTMLElement>();
  private clockTime!: HTMLElement;
  private clockDay!: HTMLElement;
  private clockArc!: SVGCircleElement;
  private clockSun!: HTMLElement;
  private moneyEl!: HTMLElement;
  private moneyCard!: HTMLElement;
  private rankNum!: HTMLElement;
  private rankTitle!: HTMLElement;
  private rankRing!: SVGCircleElement;
  private repEl!: HTMLElement;
  private toasts: HTMLElement;
  private hoverEl: HTMLElement;
  private trashEl: HTMLElement;
  private takeOrderEl: HTMLElement;
  private serveLayer: HTMLElement;
  private serveEls = new Map<number, HTMLElement>();
  private muteBtn!: HTMLElement;
  private vignette: HTMLElement;
  private money = 0;
  private moodTimer = 0;
  private mouse = { x: 0, y: 0 };
  camera!: THREE.Camera;

  constructor(
    private host: UIHost,
    private icons: IconRenderer,
    private audio: AudioEngine,
    private orders: OrderBook,
    private progress: Progression,
  ) {
    this.root = document.getElementById('ui')!;
    this.world = h('div', { id: 'world' });
    this.root.append(this.world);
    this.hud = h('div', { id: 'hud' });
    this.root.append(this.hud);
    this.vignette = h('div', { class: 'vignette-flash' });
    this.root.append(this.vignette);

    const project = (v: THREE.Vector3) => this.project(v);
    this.gauges = new Gauges(this.world);
    this.speech = new Speech(this.world, icons, project);
    this.serveLayer = h('div', { style: { display: 'none' } });
    this.world.append(this.serveLayer);

    this.takeOrderEl = h('div', { class: 'anchored take-order hidden' }, h('button', { class: 'btn yellow', onclick: () => host.onTakeOrder() }, '🧾 Take Order'));
    this.world.append(this.takeOrderEl);

    this.buildHud();
    this.tickets = new Tickets(this.hud, orders, icons);
    this.tickets.onSelect = (o) => host.onSelectTicket(o);
    this.tickets.onTrash = () => host.onTrashBurger();
    this.toasts = h('div', { class: 'toasts' });
    this.hud.append(this.toasts);
    this.hoverEl = h('div', { class: 'hover-label' });
    this.root.append(this.hoverEl);
    this.trashEl = h('div', { class: 'trash' }, '🗑️');
    this.root.append(this.trashEl);
    this.rating = new RatingPanel(this.root, audio);
    this.screens = new Screens(this.root, icons, audio, progress);
    this.tutorial = new Tutorial(this.root, project, (id) => audio.play(id));
    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.hoverEl.style.left = `${e.clientX}px`;
      this.hoverEl.style.top = `${e.clientY}px`;
    });
  }

  // ------------------------------------------------------------------ HUD
  private buildHud() {
    // clock
    this.clockTime = h('div', { class: 'time' }, '10:00');
    this.clockDay = h('div', { class: 'day' }, 'Day 1');
    this.clockSun = h('div', { class: 'sun' }, '☀️');
    const dial = h('div', { class: 'clock-dial' });
    dial.innerHTML = `<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="#fbe9c8" stroke="#1d1714" stroke-width="3"/><circle class="arc" cx="23" cy="23" r="15" fill="none" stroke="#ffc93c" stroke-width="6" transform="rotate(-90 23 23)" stroke-dasharray="94.2" stroke-dashoffset="94.2"/></svg>`;
    dial.append(this.clockSun);
    this.clockArc = dial.querySelector('.arc') as SVGCircleElement;
    this.hud.append(h('div', { class: 'hud-left' }, h('div', { class: 'clock-card' }, dial, h('div', { class: 'clock-text' }, this.clockDay, this.clockTime))));
    // money + rank
    this.moneyEl = h('span', {}, '$0.00');
    this.moneyCard = h('div', { class: 'money-card' }, h('span', { class: 'coin' }, '$'), this.moneyEl);
    const badge = h('div', { class: 'badge' });
    badge.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#8e5bd8" stroke="#1d1714" stroke-width="3"/><circle class="ring" cx="20" cy="20" r="13" fill="none" stroke="#e6d4ff" stroke-width="4" transform="rotate(-90 20 20)" stroke-dasharray="81.7" stroke-dashoffset="81.7" stroke-linecap="round"/></svg><b style="color:#fff">1</b>`;
    this.rankRing = badge.querySelector('.ring') as SVGCircleElement;
    this.rankNum = badge.querySelector('b') as HTMLElement;
    this.rankTitle = h('span', {}, 'Rookie');
    this.repEl = h('span', { class: 'stars' }, '★★★☆☆');
    const rankCard = h('div', { class: 'rank-card' }, badge, h('div', { class: 'meta' }, h('small', {}, 'Rank'), this.rankTitle, this.repEl));
    this.hud.append(h('div', { class: 'hud-right' }, this.moneyCard, rankCard));
    // station bar
    const bar = h('div', { class: 'station-bar' });
    for (const s of STATIONS) {
      const alert = h('div', { class: 'alert' }, '!');
      const b = h('button', { class: 'st-btn', 'data-station': s.id, title: `${s.name} (${s.key})` }, h('span', { class: 'key' }, s.key), h('span', { class: 'ico' }, s.icon), s.name, alert);
      b.addEventListener('click', () => this.host.onStation(s.id));
      b.addEventListener('pointerenter', () => this.audio.play('hover', { volume: 0.3 }));
      this.stationBtns.set(s.id, b);
      this.alerts.set(s.id, alert);
      bar.append(b);
    }
    this.hud.append(bar);
    // corner buttons
    this.muteBtn = h('button', { class: 'icon-btn', title: 'Mute (M)' }, '🔊');
    this.muteBtn.addEventListener('click', () => {
      const muted = this.host.onToggleMute();
      this.muteBtn.textContent = muted ? '🔇' : '🔊';
    });
    const pauseBtn = h('button', { class: 'icon-btn', title: 'Pause (Esc)' }, '⏸');
    pauseBtn.addEventListener('click', () => this.host.onPause());
    this.hud.append(h('div', { class: 'corner-btns' }, this.muteBtn, pauseBtn));
  }

  setMuted(m: boolean) {
    this.muteBtn.textContent = m ? '🔇' : '🔊';
  }

  showHud(on: boolean) {
    this.hud.classList.toggle('on', on);
    this.world.style.display = on ? '' : 'none';
  }

  setStation(id: StationId) {
    for (const [k, b] of this.stationBtns) b.classList.toggle('on', k === id);
  }

  stationAlert(id: StationId, level: 0 | 1 | 2) {
    const a = this.alerts.get(id);
    const b = this.stationBtns.get(id);
    if (!a || !b) return;
    a.classList.toggle('show', level > 0);
    a.classList.toggle('warn', level === 1);
    a.textContent = level === 2 ? '🔥' : '!';
    b.classList.toggle('danger', level === 2);
  }

  setClock(day: number, hour: number, frac: number) {
    const hh = Math.floor(hour);
    const mm = Math.floor((hour - hh) * 60 / 5) * 5;
    const h12 = ((hh + 11) % 12) + 1;
    this.clockTime.textContent = `${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
    this.clockDay.textContent = `Day ${day}`;
    this.clockArc.setAttribute('stroke-dashoffset', String(94.2 * (1 - Math.min(1, frac))));
    this.clockSun.textContent = hour < 17 ? '☀️' : hour < 19.5 ? '🌇' : '🌙';
  }

  setMoney(v: number, bump = false) {
    const from = this.money;
    this.money = v;
    if (!bump) {
      this.moneyEl.textContent = `$${v.toFixed(2)}`;
      return;
    }
    this.moneyCard.classList.remove('bump');
    void this.moneyCard.offsetWidth;
    this.moneyCard.classList.add('bump');
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      this.moneyEl.textContent = `$${(from + (v - from) * (1 - Math.pow(1 - t, 3))).toFixed(2)}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  setRank(rank: number, title: string, frac: number, rep: number) {
    this.rankNum.textContent = String(rank);
    this.rankTitle.textContent = title;
    this.rankRing.setAttribute('stroke-dashoffset', String(81.7 * (1 - frac)));
    const r = Math.round(rep);
    this.repEl.textContent = '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  flashDanger(on: boolean) {
    this.vignette.classList.toggle('on', on);
  }

  // ------------------------------------------------------------------ world helpers
  project(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, behind: p.z > 1 || p.z < -1 };
  }

  toastWorld(text: string, at: THREE.Vector3, style: 'good' | 'bad' | 'perfect' | 'info' | 'money' = 'info') {
    const s = this.project(at);
    if (s.behind) return;
    this.floatText(text, s.x, s.y, style);
  }

  floatText(text: string, x: number, y: number, style: string) {
    const el = h('div', { class: `float-text ${style}` }, text);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.append(el);
    setTimeout(() => el.remove(), 1150);
  }

  toast(text: string, style: 'good' | 'bad' | 'info' = 'info') {
    const el = h('div', { class: `toast ${style}` }, text);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => el.remove(), 3100);
  }

  hoverLabel(text: string | null) {
    this.hoverEl.classList.toggle('show', !!text);
    if (text) this.hoverEl.textContent = text;
  }

  readonly trash = {
    show: () => this.trashEl.classList.add('show'),
    hide: () => this.trashEl.classList.remove('show', 'hot'),
    setHot: (on: boolean) => {
      const was = this.trashEl.classList.contains('hot');
      this.trashEl.classList.toggle('hot', on);
      if (on && !was) this.audio.play('hover', { rate: 0.7 });
    },
    containsNdc: (ndc: THREE.Vector2) => {
      if (!this.trashEl.classList.contains('show')) return false;
      const r = this.trashEl.getBoundingClientRect();
      const x = (ndc.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-ndc.y * 0.5 + 0.5) * window.innerHeight;
      return x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 20 && y <= r.bottom + 20;
    },
  };

  readonly takeOrder = {
    set: (show: boolean, anchor: THREE.Vector3 | null) => {
      this.takeOrderEl.classList.toggle('hidden', !show || !anchor);
      if (show && anchor) {
        const s = this.project(anchor);
        this.takeOrderEl.style.translate = `${s.x.toFixed(1)}px ${s.y.toFixed(1)}px`;
      }
    },
  };

  readonly serveButtons = {
    show: (on: boolean) => {
      this.serveLayer.style.display = on ? '' : 'none';
    },
    place: (orderId: number, x: number, y: number, visible: boolean) => {
      const el = this.serveEls.get(orderId);
      if (!el) return;
      el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      el.style.opacity = visible ? '1' : '0';
    },
  };

  refreshServe() {
    const ready = this.orders.ready;
    const ids = new Set(ready.map((r) => r.order.id));
    for (const [id, el] of this.serveEls)
      if (!ids.has(id)) {
        el.remove();
        this.serveEls.delete(id);
      }
    for (const r of ready) {
      let el = this.serveEls.get(r.order.id);
      if (!el) {
        el = h('div', { class: 'anchored serve-btn pop-in' });
        this.serveEls.set(r.order.id, el);
        this.serveLayer.append(el);
      }
      el.innerHTML = '';
      const can = this.host.canServe(r.order.id);
      el.append(h('div', { class: 'who' }, `#${r.order.ticket} · ${r.order.customerName.split(' ')[0]}`));
      if (can) {
        const b = h('button', { class: 'btn green' }, '🛎️ Serve');
        b.addEventListener('click', () => this.host.onServe(r.order.id));
        el.append(b);
      } else {
        const st = this.host.customerState(r.order);
        el.append(h('div', { class: 'walking' }, st === 'toPickup' ? 'On the way…' : 'Calling…'));
      }
    }
  }

  flyTicket(o: Order, x: number, y: number) {
    this.tickets.refresh();
    const target = this.tickets.elementOf(o.id);
    if (!target) return;
    const r = target.getBoundingClientRect();
    target.style.visibility = 'hidden';
    const ghost = target.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.style.margin = '0';
    ghost.style.visibility = 'visible';
    ghost.style.zIndex = '50';
    ghost.style.animation = 'none';
    this.root.append(ghost);
    const dx = x - r.left - r.width / 2;
    const dy = y - r.top - r.height / 2;
    const anim = ghost.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(-20deg)`, opacity: 0.2 },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.5 - 80}px) scale(1.25) rotate(8deg)`, opacity: 1, offset: 0.45 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 750, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    anim.onfinish = () => {
      ghost.remove();
      target.style.visibility = '';
      this.audio.play('pin');
    };
  }

  showBuildTicket(on: boolean) {
    this.tickets.showPanel(on);
    if (on) this.refreshBuildTicket();
  }

  refreshBuildTicket() {
    this.tickets.renderPanel(this.orders.activeBuild, this.host.buildStack(), this.host.guide());
    this.tickets.refresh();
  }

  async showRating(rating: Rating, tip: number, name: string, title: string, special?: string) {
    const def = Object.values(ROSTER_BY_ID).find((d) => d.name === name);
    await this.rating.show(rating, tip, name, title, def ? this.icons.portrait(def) : '', special);
  }

  get tutorialActive() {
    return this.tutorial.active;
  }

  tutorialEvent(name: string) {
    this.tutorial.event(name);
  }

  refreshTickets() {
    this.tickets.refresh();
    if (this.tickets.panel.classList.contains('show')) this.refreshBuildTicket();
  }

  update(dt: number) {
    this.speech.update(dt, this.host.customerList(), this.host.hints());
    this.moodTimer -= dt;
    if (this.moodTimer <= 0) {
      this.moodTimer = 0.4;
      this.tickets.updateMoods((o) => this.host.customerMood(o));
      // refresh serve labels (customer walking → arrived)
      for (const r of this.orders.ready) {
        const el = this.serveEls.get(r.order.id);
        const can = this.host.canServe(r.order.id);
        if (el && !!el.querySelector('button') !== can) this.refreshServe();
      }
    }
    this.tutorial.update();
  }

  clearWorld() {
    this.speech.clear();
    for (const el of this.serveEls.values()) el.remove();
    this.serveEls.clear();
    this.takeOrderEl.classList.add('hidden');
  }
}
