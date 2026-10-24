// Entry point: loading screen, world build, UI and main loop.

import './styles.css';
import { Game } from './game/game.ts';
import { UI } from './ui/ui.ts';
import { h } from './ui/dom.ts';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const bar = h('i');
  const label = h('div', { class: 'label' }, 'Starting');
  const loading = h('div', { id: 'loading' }, h('div', { class: 'logo' }, 'WRECK', h('span', {}, 'FIELD')), h('div', { class: 'bar' }, bar), label);
  document.body.appendChild(loading);
  let game: Game;
  try {
    game = new Game(canvas);
  } catch (err) {
    label.textContent = 'WebGL is not available in this browser.';
    console.error(err);
    return;
  }
  await game.load((p, l) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    label.textContent = l;
  });
  const ui = new UI(game, uiRoot);
  const g = game as Game & { onFrame?: (dt: number) => void };
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    ui.update((now - last) / 1000);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  game.start();
  loading.style.transition = 'opacity 0.5s';
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 600);
  (window as unknown as { game: Game }).game = g;
  // auto-start for automated tests: ?autostart
  if (new URLSearchParams(location.search).has('autostart')) {
    (document.querySelector('#mainmenu .btn.primary') as HTMLButtonElement | null)?.click();
  }
}

void boot();
