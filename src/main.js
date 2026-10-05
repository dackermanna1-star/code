// Delve — entry point.
import { Game } from './game/game.js';

function boot() {
  const canvasCheck = document.createElement('canvas');
  const gl = canvasCheck.getContext('webgl2');
  if (!gl) {
    document.body.innerHTML = '<div style="color:#e9dfcc;font-family:serif;padding:40px;text-align:center">Delve needs WebGL 2. Please use a recent desktop browser.</div>';
    return;
  }
  const game = new Game();
  // click the canvas to (re)capture the mouse while playing
  game.renderer.renderer.domElement.addEventListener('click', () => {
    game.audio.init();
    if (game.state === 'playing' && !game.input.locked) game.input.requestLock();
  });
}

boot();
