// Level group 10: pools, towers, stairs, playgrounds and warehouses.
//   50 THE HOTEL POOL      90 THE ABANDONED HOTEL POOL     78 THE UNDERGROUND POOL
//   40 THE CLOCK TOWER     84 THE YELLOW STAIRCASE
//   52 THE FOGGY PLAYGROUND   92 THE DARK PLAYGROUND
//   20 WAREHOUSE           91 THE ENDLESS WAREHOUSE
// Each level lives in its own file; a broken one only removes itself.
const files = [
  './l050_hotel_pool.js',
  './l090_abandoned_pool.js',
];
await Promise.all(files.map((p) => import(p).catch((e) => console.error('[g10] failed to load', p, e))));
