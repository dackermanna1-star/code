// Dead County - entry point
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('game'), document.getElementById('ui'));
window.game = game; // handy for debugging from the console

// ?autostart=1&seed=abc&prof=police  -> skip the menu (used by automated tests)
// ?test=1                            -> pretend the pointer is locked (headless browsers can't lock)
const q = new URLSearchParams(location.search);
if (q.get('test')) {
  game.input.lock = () => { game.input.locked = true; };
  game.input.unlock = () => { game.input.locked = false; };
  game.input.locked = true;
}
if (q.get('autostart')) {
  game.newGame({ name: 'Tester', seed: q.get('seed') || 'millbrook', profession: q.get('prof') || 'unemployed' });
}
