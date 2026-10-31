import type { ControlsHandlers, ControlsState, IControls } from './types';
import { el, prepareRoot, svg } from './dom';
import { ICONS, type IconName } from './icons';

/** Compact bottom-right control bar + global keyboard shortcuts. */
export class Controls implements IControls {
  private bar!: HTMLElement;
  private h!: ControlsHandlers;
  private btn: Record<string, HTMLButtonElement> = {};
  private speedBtns: HTMLButtonElement[] = [];
  private vol!: HTMLInputElement;
  private seed!: HTMLInputElement;
  private state: Partial<ControlsState> = {};
  private idleTimer = 0;
  private mounted = false;

  mount(root: HTMLElement, handlers: ControlsHandlers): void {
    if (this.mounted) return;
    this.mounted = true;
    prepareRoot(root);
    this.h = handlers;
    const bar = el('div', 'gl-controls', root);
    this.bar = bar;

    const mk = (key: string, icon: IconName, title: string, onClick: () => void, cls = ''): HTMLButtonElement => {
      const b = el('button', `gl-cb ${cls}`.trim(), bar);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.appendChild(svg(ICONS[icon]));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
        b.blur();
      });
      this.btn[key] = b;
      return b;
    };

    mk('pause', 'pause', 'Pause / play (Space)', () => this.h.onPauseToggle());
    const sp = el('div', 'gl-speed', bar);
    for (const [v, label] of [[0.5, '½×'], [1, '1×'], [2, '2×']] as [number, string][]) {
      const b = el('button', 'gl-sp', sp, label);
      b.type = 'button';
      b.title = `Speed ${v}× (${v === 0.5 ? 1 : v === 1 ? 2 : 3})`;
      b.dataset.v = String(v);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onSpeed(v);
        b.blur();
      });
      this.speedBtns.push(b);
    }
    mk('next', 'next', 'Next battle (N)', () => this.h.onNewBattle());
    mk('replay', 'replay', 'Replay this battle (R)', () => this.h.onReplay());
    mk('rematch', 'rematch', 'Rematch — same gods, new fate', () => this.h.onRematch(), 'gl-cb-minor');
    el('span', 'gl-cb-sep', bar);
    const volWrap = el('div', 'gl-volwrap', bar);
    const mute = el('button', 'gl-cb', volWrap);
    mute.type = 'button';
    mute.title = 'Mute (M)';
    mute.appendChild(svg(ICONS.volume, 'gl-ico gl-ico-on'));
    mute.appendChild(svg(ICONS.mute, 'gl-ico gl-ico-off'));
    mute.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.onMuteToggle();
      mute.blur();
    });
    this.btn.mute = mute;
    this.vol = el('input', 'gl-vol', volWrap);
    this.vol.type = 'range';
    this.vol.min = '0';
    this.vol.max = '1';
    this.vol.step = '0.01';
    this.vol.value = '0.8';
    this.vol.title = 'Volume';
    this.vol.addEventListener('input', () => this.h.onVolume(parseFloat(this.vol.value)));
    mk('hud', 'hud', 'Toggle HUD (H)', () => this.h.onToggleHud());
    mk('feed', 'feed', 'Toggle battle feed (L)', () => this.h.onToggleFeed(), 'gl-cb-minor');
    mk('auto', 'auto', 'Auto-continue to the next battle', () => this.h.onAutoContinue(!this.state.autoContinue));
    mk('fs', 'fullscreen', 'Fullscreen (F)', () => this.h.onFullscreen());
    el('span', 'gl-cb-sep gl-cb-minor', bar);
    const seedWrap = el('label', 'gl-seedwrap', bar);
    el('span', 'gl-seed-k', seedWrap, 'SEED');
    this.seed = el('input', 'gl-seed', seedWrap);
    this.seed.type = 'text';
    this.seed.spellcheck = false;
    this.seed.autocomplete = 'off';
    this.seed.maxLength = 9;
    this.seed.title = 'Seed — type one and press Enter to load that exact battle';
    this.seed.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = this.seed.value.trim();
        if (v) this.h.onLoadSeed(v.toUpperCase());
        this.seed.blur();
      } else if (e.key === 'Escape') {
        this.seed.value = this.state.seedCode ?? '';
        this.seed.blur();
      }
    });
    this.seed.addEventListener('blur', () => {
      if (this.state.seedCode !== undefined) this.seed.value = this.state.seedCode;
    });
    mk('link', 'link', 'Copy a link to this battle', () => this.h.onCopyLink());

    // Shortcuts (bubble phase; screens may swallow keys in the capture phase).
    window.addEventListener('keydown', (e) => this.key(e));

    // Idle fade.
    const wake = () => {
      bar.classList.remove('gl-idle');
      clearTimeout(this.idleTimer);
      this.idleTimer = window.setTimeout(() => bar.classList.add('gl-idle'), 2500);
    };
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
    wake();
  }

  private key(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    let handled = true;
    switch (k) {
      case ' ': this.h.onPauseToggle(); break;
      case 'n': this.h.onNewBattle(); break;
      case 'r': this.h.onReplay(); break;
      case 'h': this.h.onToggleHud(); break;
      case 'l': this.h.onToggleFeed(); break;
      case 'f': this.h.onFullscreen(); break;
      case 'm': this.h.onMuteToggle(); break;
      case '1': this.h.onSpeed(0.5); break;
      case '2': this.h.onSpeed(1); break;
      case '3': this.h.onSpeed(2); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  update(s: ControlsState): void {
    if (!this.mounted) return;
    const p = this.state;
    if (p.paused !== s.paused) {
      const b = this.btn.pause;
      b.textContent = '';
      b.appendChild(svg(s.paused ? ICONS.play : ICONS.pause));
      b.classList.toggle('gl-on', s.paused);
      b.title = s.paused ? 'Play (Space)' : 'Pause (Space)';
    }
    if (p.speed !== s.speed) for (const b of this.speedBtns) b.classList.toggle('gl-on', parseFloat(b.dataset.v ?? '1') === s.speed);
    if (p.muted !== s.muted) this.btn.mute.classList.toggle('gl-muted', s.muted);
    if (p.volume !== s.volume && document.activeElement !== this.vol) this.vol.value = String(s.volume);
    if (p.autoContinue !== s.autoContinue) this.btn.auto.classList.toggle('gl-on', s.autoContinue);
    if (p.hudVisible !== s.hudVisible) this.btn.hud.classList.toggle('gl-off', !s.hudVisible);
    if (p.feedVisible !== s.feedVisible) this.btn.feed.classList.toggle('gl-off', !s.feedVisible);
    if (p.seedCode !== s.seedCode && document.activeElement !== this.seed) this.seed.value = s.seedCode;
    this.state = { ...s };
  }

  setVisible(v: boolean): void {
    if (this.bar) this.bar.classList.toggle('gl-hidden', !v);
  }
}
