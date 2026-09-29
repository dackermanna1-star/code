import * as THREE from 'three';
import { h } from './dom';

export interface TutStep {
  id: string;
  text: string;
  /** event that completes the step (or 'ok' for a button) */
  until: string;
  /** where to point: a DOM selector, a 3D point or nothing */
  target?: string | (() => THREE.Vector3 | null);
  /** coach bubble placement */
  at?: 'top' | 'center' | 'left' | 'right' | 'bottom';
  station?: string;
}

export const STEPS: TutStep[] = [
  { id: 'welcome', text: "Welcome to Sizzle & Stack! Grandpa Gus just handed you the keys. Let's make someone's day — one burger at a time.", until: 'ok', at: 'center' },
  { id: 'order', text: 'A customer is at the counter! Click TAKE ORDER to hear what they want.', until: 'order-taken', target: '.take-order', at: 'left' },
  { id: 'to-grill', text: 'Their ticket is pinned on the rail. Now head to the GRILL.', until: 'at-grill', target: '[data-station="grill"]', at: 'bottom' },
  { id: 'place', text: 'Drag a raw patty from the tray onto the grill. (Quick tip: a simple click on the tray works too!)', until: 'patty-placed', at: 'right' },
  { id: 'flip', text: 'The gauge needle shows the side touching the grill. The ticket wants MEDIUM — when the needle reaches the orange zone, click the patty to flip it!', until: 'patty-flipped', at: 'right' },
  { id: 'done', text: 'Cook the other side to orange too (the yellow dot is the top side). Then drag the patty onto the holding tray to the right.', until: 'patty-done', at: 'right' },
  { id: 'to-build', text: 'Perfectly grilled! Now go to the BUILD station.', until: 'at-build', target: '[data-station="build"]', at: 'bottom' },
  { id: 'build', text: 'Build from the bottom up, following the ticket on the right. Drag each ingredient onto the tray — drop it dead-center for full marks. The glowing bin is next!', until: 'burger-done', at: 'left' },
  { id: 'to-serve', text: 'Order up! Head to the SERVE station.', until: 'at-serve', target: '[data-station="serve"]', at: 'bottom' },
  { id: 'serve', text: 'When your customer reaches the pickup window, click SERVE and watch their reaction!', until: 'served', target: '.serve-btn', at: 'left' },
  { id: 'finish', text: "That's the whole loop! Take orders, grill, build and serve until closing time. Juggle stations with keys 1–4. Good luck, chef!", until: 'ok', at: 'center' },
];

export class Tutorial {
  private idx = -1;
  private coach: HTMLElement;
  private arrow: HTMLElement;
  active = false;
  onDone?: () => void;

  constructor(
    private layer: HTMLElement,
    private project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean },
    private play: (id: string) => void,
  ) {
    this.coach = h('div', { class: 'coach hidden' });
    this.arrow = h('div', { class: 'pointer-arrow hidden' }, '👇');
    layer.append(this.coach, this.arrow);
  }

  start() {
    this.active = true;
    this.idx = -1;
    this.next();
  }

  stop() {
    this.active = false;
    this.coach.classList.add('hidden');
    this.arrow.classList.add('hidden');
  }

  get step(): TutStep | null {
    return this.active && this.idx >= 0 ? STEPS[this.idx] : null;
  }

  private next() {
    this.idx++;
    if (this.idx >= STEPS.length) {
      this.stop();
      this.onDone?.();
      return;
    }
    const s = STEPS[this.idx];
    this.coach.className = 'coach';
    this.coach.innerHTML = '';
    this.coach.append(h('div', { class: 'who' }, '👨‍🍳 Grandpa Gus'), h('div', {}, s.text));
    if (s.until === 'ok') {
      const b = h('button', { class: 'btn yellow small', style: { marginTop: '10px' } }, this.idx === STEPS.length - 1 ? "Let's go!" : 'Okay!');
      b.addEventListener('click', () => {
        this.play('click');
        this.next();
      });
      this.coach.append(b);
    }
    const skip = h('div', { class: 'skip' }, 'Skip tutorial');
    skip.addEventListener('click', () => {
      this.stop();
      this.onDone?.();
    });
    this.coach.append(skip);
    this.play('pop');
    this.place();
  }

  event(name: string) {
    if (!this.active) return;
    const s = STEPS[this.idx];
    if (s && s.until === name) this.next();
  }

  /** 3D targets registered by the game. */
  targets: Record<string, () => THREE.Vector3 | null> = {};

  private place() {
    const s = STEPS[this.idx];
    if (!s) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    let tx: number | null = null;
    let ty: number | null = null;
    if (typeof s.target === 'string') {
      const el = document.querySelector(s.target) as HTMLElement | null;
      if (el && el.offsetParent !== null) {
        const r = el.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top;
      }
    } else {
      const f = this.targets[s.id];
      const p = f ? f() : null;
      if (p) {
        const q = this.project(p);
        if (!q.behind) {
          tx = q.x;
          ty = q.y;
        }
      }
    }
    if (tx !== null && ty !== null) {
      this.arrow.classList.remove('hidden');
      this.arrow.style.left = `${tx}px`;
      this.arrow.style.top = `${ty}px`;
    } else this.arrow.classList.add('hidden');
    const cw = this.coach.offsetWidth || 320;
    const ch = this.coach.offsetHeight || 120;
    let x = W / 2 - cw / 2;
    let y = H * 0.28;
    switch (s.at) {
      case 'left':
        x = 24;
        y = H * 0.36;
        break;
      case 'right':
        x = W - cw - 24;
        y = H * 0.3;
        break;
      case 'bottom':
        x = W / 2 - cw / 2;
        y = H - ch - 150;
        break;
      case 'top':
        y = 110;
        break;
      case 'center':
        y = H / 2 - ch / 2 - 40;
    }
    this.coach.style.left = `${Math.max(12, x)}px`;
    this.coach.style.top = `${Math.max(90, y)}px`;
  }

  update() {
    if (this.active) this.place();
  }
}
