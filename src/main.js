import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { LEVELS } from './levels/index.js';
import { characterById, CHARACTERS } from './characters/index.js';
import { Autopilot } from './core/autopilot.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
const ui = new UI(game);

function resize() {
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  // keep the backing store under ~3.7 MP for consistent frame rates
  while (w * h * dpr * dpr > 3.7e6 && dpr > 1) dpr -= 0.25;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resize);
resize();

// Optional URL parameters for quick testing: ?level=3&char=rosa[&auto=1]
const params = new URLSearchParams(location.search);
if (params.has('level')) {
  const lv = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, parseInt(params.get('level'), 10) - 1))];
  ui.charId = characterById(params.get('char') || ui.charId).id;
  ui.startLevel(lv);
  if (params.get('auto') === '1') {
    game.autopilot = new Autopilot(game.input, { boost: true });
  }
}

let last = performance.now();
function loop(t) {
  const dt = (t - last) / 1000;
  last = t;
  try {
    game.frame(dt);
    game.render();
    ui.update(dt);
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// debug / test hooks
window.__game = game;
window.__ui = ui;
window.__levels = LEVELS;
window.__chars = CHARACTERS;
