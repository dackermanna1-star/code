// Map registry: id → map data module (TECH §5). Add story maps here as they are authored
// (exterior, lobby, west1, library, east1, gym, basement, east2, longhall, west2, aud, vault, breaker).
import test from './test.js';
import test2 from './test2.js';

const LIST = [test, test2];

export const MAPS = {};
for (const m of LIST) {
  if (MAPS[m.id]) throw new Error(`duplicate map id '${m.id}'`);
  MAPS[m.id] = m;
}

export default MAPS;
