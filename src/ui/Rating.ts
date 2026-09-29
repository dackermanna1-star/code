import { h, countUp } from './dom';
import type { Rating } from '../game/Scoring';
import type { AudioEngine } from '../audio/AudioEngine';

/** Animated post-serve rating card: three scores fill in, then stars + tip. */
export class RatingPanel {
  readonly el: HTMLElement;
  private resolve: (() => void) | null = null;
  private skip = false;

  constructor(parent: HTMLElement, private audio: AudioEngine) {
    this.el = h('div', { class: 'rating card paper-tex' });
    this.el.addEventListener('pointerdown', () => {
      this.skip = true;
      if (this.resolve) this.close();
    });
    parent.append(this.el);
  }

  private close() {
    this.el.classList.remove('show');
    const r = this.resolve;
    this.resolve = null;
    setTimeout(() => r?.(), 250);
  }

  async show(rating: Rating, tip: number, name: string, title: string, portrait: string, special?: string): Promise<void> {
    this.skip = false;
    this.el.innerHTML = '';
    const pct = h('div', { class: 'pct' }, '0%');
    const label = h('div', { class: 'label' }, '');
    this.el.append(
      h(
        'div',
        { class: 'head' },
        h('img', { src: portrait }),
        h('div', {}, h('h2', {}, name), h('small', {}, special === 'critic' ? '★ FOOD CRITIC ★' : title)),
        h('div', { class: 'total' }, pct, label),
      ),
    );
    const rows = h('div', { class: 'rows' });
    const mk = (icon: string, nm: string, s: { score: number; notes: string[] }) => {
      const bar = h('i', {});
      const v = h('div', { class: 'v' }, '0');
      const notes = h('div', { class: 'notes' }, '');
      rows.append(h('div', { class: 'row' }, h('div', { class: 'name' }, icon, nm), h('div', { class: 'bar' }, bar), v, notes));
      return { bar, v, notes, s };
    };
    const parts = [mk('⏱️', 'Waiting', rating.wait), mk('🔥', 'Grilling', rating.grill), mk('🍔', 'Building', rating.build)];
    this.el.append(rows);
    const stars = h('div', { class: 'stars' });
    for (let i = 0; i < 5; i++) stars.append(h('span', {}, '★'));
    const tipEl = h('div', { class: 'tip' }, '');
    const pts = h('div', { class: 'pts' }, '');
    this.el.append(h('div', { class: 'foot' }, stars, pts, tipEl), h('div', { class: 'hint' }, 'click to continue'));
    requestAnimationFrame(() => this.el.classList.add('show'));
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, this.skip ? 0 : ms));
    await wait(350);
    for (const p of parts) {
      const cls = p.s.score >= 80 ? '' : p.s.score >= 55 ? 'mid' : 'low';
      p.bar.className = cls;
      p.bar.style.width = `${p.s.score}%`;
      this.audio.play('tick', { rate: 0.8 + p.s.score / 250 });
      await countUp(p.v, 0, p.s.score, this.skip ? 1 : 520, (x) => `${Math.round(x)}`, () => this.audio.play('tick', { volume: 0.25, rate: 1.4 }));
      p.notes.textContent = p.s.notes.slice(0, 2).join(' · ');
      this.audio.play(p.s.score >= 80 ? 'dingSmall' : p.s.score >= 55 ? 'blip' : 'thud', { volume: 0.7 });
      await wait(160);
    }
    await countUp(pct, 0, rating.total, this.skip ? 1 : 600, (x) => `${Math.round(x)}%`);
    label.textContent = rating.label;
    label.animate([{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1 }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    for (let i = 0; i < rating.stars; i++) {
      const s = stars.children[i] as HTMLElement;
      s.className = 'on';
      s.style.animationDelay = `${i * 0.09}s`;
      setTimeout(() => this.audio.play('star', { rate: 1 + i * 0.12 }), this.skip ? 0 : i * 90);
    }
    await wait(rating.stars * 90 + 150);
    pts.textContent = `+${rating.total} pts`;
    this.audio.play('coins', { volume: 0.8 });
    await countUp(tipEl, 0, tip, this.skip ? 1 : 500, (x) => `+$${x.toFixed(2)}`);
    // auto close
    await new Promise<void>((resolve) => {
      this.resolve = resolve;
      setTimeout(() => {
        if (this.resolve === resolve) this.close();
      }, this.skip ? 900 : 2600);
    });
  }
}
