// Global service registry. Populated at boot by src/main.js.
// Every module reaches other subsystems at *runtime* through HW (never at import time),
// which keeps ES-module import graphs acyclic and lets modules be developed in isolation.
export const HW = {
  game: null,      // engine/game.js  — Game (loop, scene control, map loading)
  state: null,     // engine/state.js — GameState (flags, inventory, chapter, ...)
  settings: null,  // engine/settings.js — persisted user settings
  input: null,     // engine/input.js
  display: null,   // engine/display.js — canvases & scaling
  map: null,       // engine/map.js — current MapRuntime
  entities: null,  // engine/entities.js — EntityManager
  player: null,    // the Player entity
  camera: null,    // engine/camera.js
  scripts: null,   // engine/script.js — ScriptRunner
  ui: null,        // ui/ui.js — UI manager (dialogue, menus, special screens)
  audio: null,     // audio/audio.js — AudioEngine
  art: null,       // art/index.js — art facade (tiles, props, sprites, portraits, cg, icons)
  lighting: null,  // render/lighting.js
  fx: null,        // render/fx.js
  renderer: null,  // render/renderer.js
  periods: null,   // game/periods.js
  colonel: null,   // game/colonel_ai.js
  compact: null,   // game/compact.js
  data: null,      // { tiles, props, items, docs, chars, maps, scripts }
  time: 0,         // seconds of unpaused game time since boot
  debug: null,     // engine/debug.js (also exposed as window.__HW)
};
export default HW;
