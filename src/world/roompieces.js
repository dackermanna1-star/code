// Registry of special "room set-pieces": unusual rooms that ordinary zone generators can drop
// into a rectangular room they have carved out (offices, yellow rooms, school wings ...).
//
//   defineRoomPiece('orientation_circle', {
//     minW: 5, minD: 5, maxW: 14, maxD: 14,
//     weight: (ctx) => 1,           // ctx = zone.ctx (dist, level, ...)
//     build(zb, rect, rng) { ... }, // rect = {x0,z0,x1,z1} interior cells, walls already exist
//   });
//
// Generators call tryRoomPiece(zb, rect, rng, chance) for rooms they would otherwise furnish.
export const ROOM_PIECES = {};

export function defineRoomPiece(name, def) {
  ROOM_PIECES[name] = Object.assign({ name, minW: 4, minD: 4, maxW: 40, maxD: 40, weight: () => 1, build: () => {} }, def);
}

// Returns the piece name if one was built.
export function tryRoomPiece(zb, rect, rng, chance = 0.08) {
  const ctx = zb.zone.ctx || {};
  const force = zb.world && zb.world.zones.forcePiece;
  if (!force && !rng.chance(chance)) return null;
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  const pairs = [];
  for (const k in ROOM_PIECES) {
    const p = ROOM_PIECES[k];
    if (force && force !== k) continue;
    const fits = (w >= p.minW && d >= p.minD && w <= p.maxW && d <= p.maxD) || (d >= p.minW && w >= p.minD && d <= p.maxW && w <= p.maxD);
    if (!fits) continue;
    const wt = force ? 1 : p.weight(ctx);
    if (wt > 0) pairs.push([p, wt]);
  }
  if (!pairs.length) return null;
  const piece = rng.weighted(pairs);
  piece.build(zb, rect, rng.fork(piece.name));
  return piece.name;
}
