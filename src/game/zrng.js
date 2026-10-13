// Seeded randomness for zombie survival (Milestone 3 foundation). Gameplay things that should
// come out the same for the same run seed (the boss order now; a daily run's setup later, M4)
// draw from a stream of their own: rng(seed, 'bosses'). Everything else keeps Math.random.
// A run's seed is g.zombies.seed (ZombieMode.start: the New Game option `seed`, else random).

/** mulberry32: a small, fast 32-bit PRNG. Returns () => [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string (a stream name) to 32 bits. */
export function hash32(s) {
  let h = 0x811C9DC5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** A generator for one stream of a run: rng(Z.seed, 'bosses'). */
export function rng(seed, stream = '') { return mulberry32((seed ^ hash32(stream)) >>> 0); }

/** Fisher-Yates in place with the given generator (default Math.random). Returns the array. */
export function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}

/** A fresh random 32-bit seed. */
export function newSeed() { return (Math.random() * 4294967296) >>> 0; }
