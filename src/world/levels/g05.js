// Level group 05: parking, rail and hall levels. Each level loads defensively so a broken one
// only removes itself.
const levels = [
  './l015_futuristic_halls.js',
  './l023_endless_elevator.js',
  './l029_parking_structure.js',
  './l073_endless_garage.js',
  './l082_endless_parking_lot.js',
];
await Promise.all(levels.map((p) => import(p).catch((e) => console.error('[g05] failed to load', p, e))));
