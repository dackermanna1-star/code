// Level group 02: 2 Pipe Dreams, 3 Electrical Station, 8 Forgotten Mineshaft, 59 The Maintenance
// Tunnels, 81 The Empty Factory, 17 The Carrier, 24 Blast Off, 25 The Flooded Basement,
// 19 Crawlspace, 49 The Endless Stairwell. Each level loads on its own: a broken file only
// removes that level.
const files = [
  './l002_pipe_dreams.js',
  './l059_maintenance_tunnels.js',
  './l019_crawlspace.js',
];
await Promise.all(files.map((p) => import(p).catch((e) => console.error('[g02] failed to load', p, e))));
