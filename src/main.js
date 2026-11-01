import { Game } from './game.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const params = new URLSearchParams(location.search);
// Phones and tablets default to the light renderer (no shadow maps or post-processing).
const coarse = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
const quality = params.get('q') || (coarse ? 'low' : undefined);
const game = new Game({ canvas, ui, debug: params.has('debug'), manual: params.has('manual'), quality, autostart: params.has('start') });
window.__game = game;
game.boot().then(() => document.getElementById('boot')?.classList.add('hidden')).catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.querySelector('.boot-sub').textContent = `Failed to start: ${e.message}`;
});
