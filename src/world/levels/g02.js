// Level group 02: 2 Pipe Dreams, 17 The Carrier, 19 Crawlspace, 24 Blast Off, 59 The Maintenance
// Tunnels. Each level loads on its own: a broken file only removes that level.
// (l008_forgotten_mineshaft.js is an untested draft for a later round and is not loaded.)
const files = [
  './l002_pipe_dreams.js',
  './l059_maintenance_tunnels.js',
  './l017_the_carrier.js',
  './l019_crawlspace.js',
  './l024_blast_off.js',
];
await Promise.all(files.map((p) => import(p).catch((e) => console.error('[g02] failed to load', p, e))));
