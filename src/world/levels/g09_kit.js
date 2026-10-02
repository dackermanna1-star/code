// Group 09 shared helpers: carving corridors out of solid mass, small scripting utilities (timed
// teleports with a fade, the per-zone "epoch" that lets a script rebuild part of the world).
import { CF, M, cbox, hr } from './kit.js';

// ---------------------------------------------------------------- cells
// Fill a whole zone with solid mass of one material (corridors are carved out afterwards).
export function solidAll(zb, mat) {
  zb.floor.fill(0);
  zb.ceil.fill(NaN);
  zb.solid.fill(mat);
  zb.flags.fill(0);
  zb.noConnectivity = true;
}

// Open the cells of the absolute rectangle [x0, x1) x [z0, z1) (clipped to the zone): floor f,
// ceiling c, materials as given (omitted ones are left alone).
export function carve(zb, x0, z0, x1, z1, f, c, fmat, cmat, wmat) {
  zb.fill(Math.floor(x0), Math.floor(z0), Math.ceil(x1), Math.ceil(z1), (x, z, i) => {
    zb.solid[i] = 0;
    zb.floor[i] = f;
    zb.ceil[i] = c;
    zb.flags[i] = 0;
    if (fmat) zb.fmat[i] = fmat;
    if (cmat) zb.cmat[i] = cmat;
    if (wmat) zb.wmat[i] = wmat;
  });
}

// Make the cells of a rectangle solid again.
export function wall(zb, x0, z0, x1, z1, mat) {
  zb.fill(Math.floor(x0), Math.floor(z0), Math.ceil(x1), Math.ceil(z1), (x, z, i) => { zb.solid[i] = mat; });
}

// does the cell (x, z) of the zone lie inside the rectangle?
export const inRect = (x, z, x0, z0, x1, z1) => x >= x0 && x < x1 && z >= z0 && z < z1;

// integer range of lattice indices k (spacing g, offset o) whose value o + k*g lies in [lo, hi]
export function lattice(lo, hi, g, o = 0) {
  return [Math.ceil((lo - o) / g - 1e-9), Math.floor((hi - o) / g + 1e-9)];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------- epochs
// A script can ask for a zone to be generated anew by bumping its mutation counter (the world
// forwards it to the generator worker). A generator reads the counter with epochOf().
export const epochOf = (world, zone) => (world && world.mutation && world.mutation.get(zone.key)) || 0;

// A global state value shared with the generator worker: the mutation map carries arbitrary
// string keys, so the game thread can publish "lap numbers" and the like (world.mutation is
// copied to the worker when it starts and on every update).
export const sharedOf = (world, name) => (world && world.mutation && world.mutation.get('lv:' + name)) || 0;
export function publish(game, name, value) {
  const w = game.world, key = 'lv:' + name;
  w.mutation.set(key, value);
  if (w.worker) w.worker.postMessage({ type: 'mutate', key, count: value });
}

// Rebuild what a zone shows around the given rectangles only: bump the zone's epoch, drop its
// generated cells and unload just the chunks whose lit window touches one of the rects.
export function rebuildNear(game, zone, rects) {
  const w = game.world;
  const n = (w.mutation.get(zone.key) || 0) + 1;
  w.mutation.set(zone.key, n);
  w.builders.delete(zone.key);
  if (w.worker) w.worker.postMessage({ type: 'mutate', key: zone.key, count: n });
  for (const ch of [...w.chunks.values()]) {
    if (ch.dim !== zone.dim || ch.level !== zone.level) continue;
    const a = ch.cx * 16 - 8, b = ch.cz * 16 - 8, c = a + 32, d = b + 32;
    if (rects.some((r) => !(c <= r[0] || a >= r[2] || d <= r[1] || b >= r[3]))) w.unloadChunk(ch);
  }
  game.nav.timer = 0;           // ask the phone for fresh door positions
  return n;
}

// ---------------------------------------------------------------- view tests
// Is the point (x, y, z) in front of the player's eyes (within `half` radians of the view
// direction, horizontally) and not hidden behind collision geometry?
export function inView(game, x, y, z, half = 0.75, maxDist = 60) {
  const p = game.player;
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d > maxDist) return false;
  if (d > 1.5) {
    let a = Math.atan2(dx, -dz) - p.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > half) return false;
  }
  return !game.world.segmentBlocked(p.dim, p.x, p.y + 1.4, p.z, x, y, z);
}

// ---------------------------------------------------------------- teleports
// Fade out, move the player, fade in. Uses the engine's own pending teleport (the one that
// follows a fall), so the area around the destination is streamed in before the fade clears.
export function fadeTeleport(game, x, y, z, delay = 0.8, rate = 3.2) {
  if (game.pendingTeleport) return false;
  const p = game.player;
  game.ui.fadeRate = rate;
  game.ui.fadeTarget = 1;
  game.pendingTeleport = { t: delay, dim: p.dim, x, y, z };
  return true;
}
// call every frame: restores the default fade speed once a teleport is over
export function fadeIdle(game) {
  if (!game.pendingTeleport && !game.pendingSpawn && game.ui.fadeRate !== 2.4 && !game.levelTrans) game.ui.fadeRate = 2.4;
}

export { CF, M, cbox, hr };
