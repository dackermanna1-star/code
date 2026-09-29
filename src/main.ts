import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/vt323/400.css';
import './ui/ui.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;
const game = new Game(canvas, uiRoot);
(window as any).__game = game;
game.boot().catch((err) => {
  console.error(err);
  uiRoot.innerHTML = `<div class="fatal">Failed to start: ${String(err?.message ?? err)}</div>`;
});
