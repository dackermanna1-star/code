// Script registry: merges every script file into one id → async (g, ctx) map (TECH §6).
// Add new files here (pro.js, ch1.js … ch8.js, end.js, item.js, sys.js, gen.js).
import test from './test.js';

const FILES = [test];

export const SCRIPTS = {};
for (const file of FILES) {
  for (const [id, fn] of Object.entries(file)) {
    if (SCRIPTS[id]) console.warn(`[scripts] duplicate script id '${id}' (later file wins)`);
    SCRIPTS[id] = fn;
  }
}

export default SCRIPTS;
