import { Game } from './game.js';
import { loadSettings } from './config.js';
import { buildTestLevel } from './levels/testLevel.js';

const canvas = document.getElementById('game');
const settings = loadSettings();
const game = new Game(canvas, settings);
window.game = game;
game.createSurvivors('bill');
game.loadLevel(buildTestLevel);
game.placeSurvivors();
game.player.giveWeapon('pumpShotgun');
game.state = 'playing';
canvas.addEventListener('click', () => game.input.requestLock());
let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
