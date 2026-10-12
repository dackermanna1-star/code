// Boot: load WADs, build resources and subsystems, run the main loop.

import { Wad, WadStack, detectGameMode } from './wad/wad.js';
import { Resources } from './game/resources.js';
import { Renderer } from './render/renderer.js';
import { ViewRenderer } from './render/view.js';
import { Settings } from './settings.js';
import { Input } from './input.js';
import { Game } from './game/game.js';
import { TICRATE, SKILL } from './game/defs.js';
import './game/enemy.js';
import './game/weapons.js';
import { missingActions } from './game/tables.js';
import { App } from './app.js';
import { loadStoredIwad } from './wadstore.js';

const bootEl = document.getElementById('boot');
const bootMsg = document.getElementById('boot-msg');

function status(msg) { bootMsg.textContent = msg; }

function fail(err) {
  console.error(err);
  bootEl.classList.remove('hidden');
  bootMsg.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'err';
  d.textContent = `Failed to start: ${err && err.message ? err.message : err}`;
  bootMsg.appendChild(d);
}

async function fetchWad(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.arrayBuffer();
}

async function main() {
  const params = new URLSearchParams(location.search);
  status('Loading WAD files…');
  const stack = new WadStack();
  let iwadBuf = null;
  let iwadName = 'DOOM1.WAD';
  if (!params.has('shareware')) {
    try {
      const stored = await loadStoredIwad();
      if (stored) { iwadBuf = stored.data; iwadName = stored.name; }
    } catch {
      // IndexedDB unavailable; fall back to shareware.
    }
  }
  if (!iwadBuf) iwadBuf = await fetchWad('assets/wads/doom1.wad');
  stack.add(new Wad(iwadBuf, iwadName));
  try {
    stack.add(new Wad(await fetchWad('assets/wads/doomx-extras.wad'), 'extras'), { fallback: true });
  } catch (e) {
    console.warn('extras WAD missing; plasma rifle/BFG art unavailable in shareware', e);
  }
  const gamemode = detectGameMode(stack);
  status('Decoding graphics…');
  await new Promise((r) => setTimeout(r, 0));
  const res = new Resources(stack);
  res.init();
  res.prewarmPatches();
  const missing = missingActions();
  if (missing.length) console.warn('Unimplemented actions:', missing);

  const settings = new Settings();
  const canvas = document.getElementById('screen');
  const renderer = new Renderer(canvas, res, settings);
  const input = new Input(canvas, settings);
  const app = new App({ canvas, stack, res, renderer, settings, input, gamemode, iwadName, params });
  window.doom = app;
  await app.init();
  bootEl.classList.add('hidden');
  app.start();
}

main().catch(fail);

export { TICRATE, SKILL, Game, ViewRenderer };
