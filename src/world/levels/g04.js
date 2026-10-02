// Level group 04: streets, suburbs and cities (levels 1, 9, 11, 37, 43, 79, 83, 88, 93, 98).
// Each level lives in its own file and is loaded defensively, so one broken level only removes itself.
import './g04_kit.js';
const levels = [
  './l009_darkness_ave.js',
  './l037_suburban_loop.js',
];
await Promise.all(levels.map((p) => import(p).catch((e) => console.error('[g04] failed to load', p, e))));
