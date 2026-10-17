// Script registry: merges every script file into one id → async (g, ctx) map (TECH §6).
// Files and owners: docs/CONTENT.md §3.
import test from './test.js';
import pro from './pro.js';
import ch1 from './ch1.js';
import ch2 from './ch2.js';
import ch3 from './ch3.js';
import ch4 from './ch4.js';
import ch5 from './ch5.js';
import ch6 from './ch6.js';
import ch7 from './ch7.js';
import ch8 from './ch8.js';
import end from './end.js';
import items from './items.js';
import sys from './sys.js';
import gen from './gen.js';

const FILES = [test, pro, ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, end, items, sys, gen];

export const SCRIPTS = {};
for (const file of FILES) {
  for (const [id, fn] of Object.entries(file)) {
    if (SCRIPTS[id]) console.warn(`[scripts] duplicate script id '${id}' (later file wins)`);
    SCRIPTS[id] = fn;
  }
}

export default SCRIPTS;
