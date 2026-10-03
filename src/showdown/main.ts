import './ui/fonts.css';
import { Showdown } from './Showdown';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;
const game = new Showdown(canvas, uiRoot);
(window as any).__sd = game;
game.boot().catch((err) => {
  console.error(err);
  uiRoot.innerHTML = `<div class="sd-fatal">Failed to start: ${String(err?.message ?? err)}</div>`;
});
import { SD } from './core/SD';
(window as any).__SDC = SD;
