// Level group 10: a hotel pool at night, an abandoned one, a clock tower, a staircase and a playground.
//   50 THE HOTEL POOL            night courtyard, a pool with no bottom, a diving tower to arrive on
//   90 THE ABANDONED HOTEL POOL  a glass hall full of dust and still water
//   40 THE CLOCK TOWER           wells with clock-face floors and gears, stairs without end (all stories)
//   84 THE YELLOW STAIRCASE      spiral stairs in square shafts, colours change every hundred steps
//   52 THE FOGGY PLAYGROUND      white fog, swings that move without wind
// (Levels 78, 92, 20 and 91 of this group are not part of this delivery.) Each level lives in its
// own file; a broken one only removes itself.
const files = [
  './l050_hotel_pool.js',
  './l090_abandoned_pool.js',
  './l040_clock_tower.js',
  './l084_yellow_staircase.js',
  './l052_foggy_playground.js',
];
await Promise.all(files.map((p) => import(p).catch((e) => console.error('[g10] failed to load', p, e))));
