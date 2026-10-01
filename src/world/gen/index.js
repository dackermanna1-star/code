// Registers all zone generators.
import './yellow.js';
import './office.js';
import '../pocket/index.js';

// Modules that are still being developed load defensively, so a broken file only removes its
// own zone types instead of taking the whole game down.
const optional = [
  './storage.js', './warehouse.js', './maintenance.js',
  './corridors.js', './school.js', './lobby.js',
  '../special/setpieces.js',
];
await Promise.all(optional.map((p) => import(p).catch((e) => console.error('[gen] failed to load', p, e))));
