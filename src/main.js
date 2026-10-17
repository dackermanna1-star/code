// HALLOWELL — boot (TECH §4).
// Works both as the dev entry (index.html, native ES modules) and as the esbuild IIFE bundle in
// dist/hallowell.html (tools/build.mjs).
//
// display → settings → art (loading bar) → audio → UI → lighting/FX → data → systems → title → loop.
import HW from './engine/hw.js';
import { createDisplay } from './engine/display.js';
import input from './engine/input.js';
import settings from './engine/settings.js';
import { createState } from './engine/state.js';
import game from './engine/game.js';
import entities from './engine/entities.js';
import camera from './engine/camera.js';
import scripts from './engine/script.js';
import interact from './engine/interact.js';
import debug from './engine/debug.js';
import renderer from './render/renderer.js';
import flashlight from './game/flashlight.js';
import hiding from './game/hiding.js';
import compact from './game/compact.js';
import art from './art/index.js';
import audio from './audio/audio.js';
import ui from './ui/ui.js';
import lighting from './render/lighting.js';
import fx from './render/fx.js';
import { TILES } from './data/tiles.js';
import { PROPS } from './data/props.js';
import { ITEMS } from './data/items.js';
import { DOCS } from './data/docs.js';
import { CHARS } from './data/chars.js';
import MAPS from './data/maps/index.js';
import SCRIPTS from './data/scripts/index.js';

const IS_BUILD = globalThis.__HW_BUILD__ === true;

function findCanvas() {
  let canvas = document.getElementById('screen');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'screen';
    canvas.tabIndex = 0;
    Object.assign(canvas.style, {
      display: 'block', width: '100vw', height: '100vh', imageRendering: 'pixelated', outline: 'none',
    });
    document.body.style.margin = '0';
    document.body.style.background = '#000';
    document.body.style.overflow = 'hidden';
    document.body.appendChild(canvas);
  }
  return canvas;
}

/** Give the UI fonts a moment to arrive so the first frames don't flash fallback type. */
async function preloadFonts() {
  if (!document.fonts?.load) return;
  const families = ['600 16px "Pixelify Sans"', '16px "Pixelify Sans"', '16px "VT323"', '16px "Special Elite"', '16px "Patrick Hand"', '16px "Caveat"', '16px "DotGothic16"'];
  await Promise.race([
    Promise.allSettled(families.map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
}

async function boot() {
  debug.install();
  HW.debug = debug;

  const canvas = findCanvas();
  HW.settings = settings;
  settings.load();
  HW.display = createDisplay(canvas);
  HW.display.applySettings(settings.values);
  HW.input = input;
  input.init(canvas);

  HW.state = createState();
  HW.data = { tiles: TILES, props: PROPS, items: ITEMS, docs: DOCS, chars: CHARS, maps: MAPS, scripts: SCRIPTS };
  HW.game = game;
  HW.entities = entities;
  HW.camera = camera;
  HW.scripts = scripts;
  HW.renderer = renderer;
  HW.compact = compact;
  HW.art = art;
  HW.audio = audio;
  HW.ui = ui;
  HW.lighting = lighting;
  HW.fx = fx;
  // Engine extensions (not in hw.js's initial list; documented in the engine report).
  HW.interact = interact;
  HW.flashlight = flashlight;
  HW.hiding = hiding;
  if (!IS_BUILD) window.HW = HW;

  HW.display.drawLoading(0, 'loading');
  await preloadFonts();
  await art.init((p) => HW.display.drawLoading(0.1 + p * 0.85, 'drawing the school'));
  HW.display.drawLoading(0.97, 'waking up');
  await audio.init?.();
  // Sound occlusion for positional audio (TECH §10): 0 = clear line, 0.5 = one wall, 1 = two+.
  audio.occluder = (x0, y0, x1, y1) => (HW.map ? Math.min(1, HW.map.opaqueCount(x0, y0, x1, y1, 2) / 2) : 0);
  await ui.init?.();
  await lighting.init?.();
  await fx.init?.();
  settings.apply();

  game.addSystem(flashlight);
  game.addSystem(hiding);
  game.addSystem(compact);

  game.start();
  game.toTitle();
}

boot().catch((e) => {
  console.error('[boot] failed', e);
  HW.display?.drawError?.(`HALLOWELL failed to start:\n${e?.stack || e}`);
});
