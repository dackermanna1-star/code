// Level group 09: 6 Pitch Black, 12 Matrix, 27 The Red Corridor, 32 Hallway 32, 36 The Red
// Door, 53 The Blue Hallway, 62 The Broken Elevator, 68 The Hall of Doors, 95 The Endless
// Corridor, 99 The Last Hallway. Each level loads on its own, so one broken file only removes
// its own level.
const files = [
  './l027_red_corridor.js',
  './l032_hallway_32.js',
  './l053_blue_hallway.js',
  './l095_endless_corridor.js',
  './l099_last_hallway.js',
];
await Promise.all(files.map((f) => import(f).catch((e) => console.error('[g09] failed to load', f, e))));
