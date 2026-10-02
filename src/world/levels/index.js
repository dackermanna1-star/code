// Registers every level. Level 0 is the main building; the others live in their own modules,
// loaded defensively so a broken level only removes itself.
import { defineLevel } from '../levels.js';
import { SPAWN } from '../gen/yellow.js';

defineLevel(0, {
  name: 'THE HALLS',
  entry: { x: SPAWN[0] + 0.5, y: 0, z: SPAWN[1] + 0.5, yaw: 0 },
  doorDensity: 0.45,
});

// reference level (see docs/LEVELS.md)
import './l007_thalassophobia.js';

const groups = [
  './g01.js', './g02.js', './g03.js', './g04.js', './g05.js',
  './g06.js', './g07.js', './g08.js', './g09.js', './g10.js',
];
await Promise.all(groups.map((p) => import(p).catch((e) => console.error('[levels] failed to load', p, e))));
