// Map registry: id → map data module (TECH §5). Story maps per docs/CONTENT.md §2; test maps for engine tests.
import test from './test.js';
import test2 from './test2.js';
import testAi from './test_ai.js';
import exterior from './exterior.js';
import lobby from './lobby.js';
import west1 from './west1.js';
import library from './library.js';
import east1 from './east1.js';
import gym from './gym.js';
import basement from './basement.js';
import east2 from './east2.js';
import longhall from './longhall.js';
import west2 from './west2.js';
import aud from './aud.js';
import vault from './vault.js';
import breaker from './breaker.js';

const LIST = [test, test2, testAi, exterior, lobby, west1, library, east1, gym, basement, east2, longhall, west2, aud, vault, breaker];

export const MAPS = {};
for (const m of LIST) {
  if (MAPS[m.id]) throw new Error(`duplicate map id '${m.id}'`);
  MAPS[m.id] = m;
}

export default MAPS;
