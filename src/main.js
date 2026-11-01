import { Game } from './game.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const params = new URLSearchParams(location.search);
const game = new Game({ canvas, ui, debug: params.has('debug'), manual: params.has('manual'), quality: params.get('q') || undefined, autostart: params.has('start') });
window.__game = game;
game.boot().then(() => document.getElementById('boot')?.classList.add('hidden')).catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.querySelector('.boot-sub').textContent = `Failed to start: ${e.message}`;
});
