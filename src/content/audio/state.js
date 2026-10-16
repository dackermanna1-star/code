// Shared runtime references (set by the package entry) — kept separate to avoid import cycles.
export const shared = { game: null }

/** Zone at a world position (or null). */
export function zoneAt(pos) {
  const z = shared.game?.zones
  if (!z || !pos) return null
  try {
    const x = Array.isArray(pos) ? pos[0] : pos.x, y = Array.isArray(pos) ? pos[1] : pos.y, zz = Array.isArray(pos) ? pos[2] : pos.z
    return z.at(x, y, zz)
  } catch { return null }
}

/** Stable small integer from a position (same door → same bell, same flat → same TV). */
export function posHash(pos) {
  if (!pos) return 0
  const x = Array.isArray(pos) ? pos[0] : pos.x, y = Array.isArray(pos) ? pos[1] : pos.y, z = Array.isArray(pos) ? pos[2] : pos.z
  let h = Math.imul(Math.floor(x * 2) | 0, 73856093) ^ Math.imul(Math.floor(y * 2) | 0, 19349663) ^ Math.imul(Math.floor(z * 2) | 0, 83492791)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  return (h ^ (h >>> 15)) >>> 0
}
