// On-screen touch controls for phones and tablets.

import type { Game } from '../game/game.ts';
import { h } from './dom.ts';

export class TouchControls {
  private root: HTMLElement;
  private game: Game;

  constructor(game: Game, parent: HTMLElement, onMenu: () => void) {
    this.game = game;
    const t = game.input.touch;
    const hold = (label: string, style: Record<string, string>, on: (v: boolean) => void, cls = '') => {
      const b = h('div', { class: `tbtn ${cls}`, style, role: 'button', 'aria-label': label }, label);
      const set = (v: boolean) => {
        b.classList.toggle('on', v);
        on(v);
        t.active = true;
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        set(true);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
      return b;
    };
    const tap = (label: string, style: Record<string, string>, fn: () => void) => {
      const b = h('div', { class: 'tbtn sm', style, role: 'button', 'aria-label': label }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
      return b;
    };
    let left = false, right = false;
    const steer = () => (t.steer = (left ? 1 : 0) - (right ? 1 : 0));
    this.root = h(
      'div',
      { id: 'touch', class: 'hidden' },
      hold('◀', { left: '18px', bottom: '22px' }, (v) => { left = v; steer(); }),
      hold('▶', { left: '108px', bottom: '22px' }, (v) => { right = v; steer(); }),
      hold('GAS', { right: '18px', bottom: '96px', width: '86px', height: '86px' }, (v) => (t.throttle = v ? 1 : 0)),
      hold('BRK', { right: '112px', bottom: '22px' }, (v) => (t.brake = v ? 1 : 0)),
      hold('HB', { right: '18px', bottom: '22px', width: '64px', height: '64px', fontSize: '14px' }, (v) => (t.handbrake = v ? 1 : 0)),
      tap('R', { left: '18px', top: '64px' }, () => game.input.push('reset')),
      tap('CAM', { left: '78px', top: '64px' }, () => game.input.push('camera')),
      tap('SLO', { left: '138px', top: '64px' }, () => game.input.push('slowmo')),
      tap('☰', { left: '198px', top: '64px' }, onMenu),
    );
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    // the HUD makes room for the pedals
    this.root.parentElement?.classList.toggle('touch-ui', v);
    if (!v) {
      const t = this.game.input.touch;
      t.throttle = t.brake = t.handbrake = t.steer = 0;
    }
  }
}
