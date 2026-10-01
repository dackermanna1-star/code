// Boot: renderer, procedural textures, then hand over to the game.
import { RES_W, RES_H } from './config.js';
import { Renderer } from './gfx/renderer.js';
import { generateTextures } from './gfx/textures.js';
import { drawTextCentered } from './gfx/font.js';
import { resolveMaterials } from './world/materials.js';
import { setPropTextures } from './world/props.js';
import { World } from './world/world.js';
import './world/gen/index.js';
import { Player } from './game/player.js';
import { Input } from './game/input.js';
import { Flicker } from './game/flicker.js';
import { Game } from './game/game.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  const glc = document.getElementById('gl');
  const uic = document.getElementById('ui');
  uic.width = RES_W; uic.height = RES_H;
  const ctx = uic.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, RES_W, RES_H);
  drawTextCentered(ctx, 'NOW LOADING', RES_W / 2, RES_H / 2 - 4, '#b8b090', 1);
  await nextFrame();
  const renderer = new Renderer(glc);
  renderer.setResolution(RES_W, RES_H);
  const t0 = performance.now();
  const { layers, index } = generateTextures();
  renderer.uploadTextures(layers);
  resolveMaterials(index);
  setPropTextures(index);
  const input = new Input(glc.parentElement);
  const game = new Game({ renderer, glc, uic, input, texIndex: index, World, Player, Flicker });
  game.texMs = performance.now() - t0;
  window.__game = game;
  game.start();
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('err');
  if (el) { el.style.display = 'block'; el.textContent = 'This game needs WebGL2.\n\n' + e.message; }
});
