// Boot + main loop.
import { RES_W, RES_H, CHUNK } from './config.js';
import { Renderer } from './gfx/renderer.js';
import { generateTextures } from './gfx/textures.js';
import { resolveMaterials } from './world/materials.js';
import { setPropTextures } from './world/props.js';
import { World } from './world/world.js';
import './world/gen/index.js';
import { Player } from './game/player.js';
import { Input } from './game/input.js';
import { Flicker } from './game/flicker.js';
import { Game } from './game/game.js';

async function boot() {
  const glc = document.getElementById('gl');
  const uic = document.getElementById('ui');
  const renderer = new Renderer(glc);
  renderer.setResolution(RES_W, RES_H);
  uic.width = RES_W; uic.height = RES_H;
  const t0 = performance.now();
  const { layers, index } = generateTextures();
  renderer.uploadTextures(layers);
  resolveMaterials(index);
  setPropTextures(index);
  const texMs = performance.now() - t0;
  const input = new Input(glc.parentElement);
  const game = new Game({ renderer, glc, uic, input, texIndex: index, World, Player, Flicker });
  game.texMs = texMs;
  window.__game = game;
  game.start();
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('err');
  if (el) { el.style.display = 'block'; el.textContent = 'Failed to start: ' + e.message; }
});
void CHUNK;
