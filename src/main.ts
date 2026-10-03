import './ui/style.css';
import { Game } from './game/Game';
import { makeFood } from './food/types';

function boot() {
  const app = document.getElementById('app')!;
  let game: Game;
  try {
    game = new Game(app);
  } catch (e) {
    console.error(e);
    const b = document.getElementById('boot');
    if (b) b.textContent = 'Oops! This device could not start the kitchen (WebGL needed).';
    return;
  }
  game.start();
  (window as unknown as { game: Game }).game = game;
  (window as unknown as { __mk: typeof makeFood }).__mk = makeFood; // handy for scripted playtests
  const b = document.getElementById('boot');
  if (b) {
    // let a couple of frames render first
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        b.style.opacity = '0';
        setTimeout(() => b.remove(), 600);
        (window as unknown as { __ready: boolean }).__ready = true;
      }),
    );
  }
}

boot();
