// Entry point.
import { Game } from './game/game.js';

const game = new Game({
  canvas: document.getElementById('game'),
  hud: document.getElementById('hud'),
  ui: document.getElementById('ui'),
});
window.__game = game; // exposed for automated tests / debugging
game.start();
