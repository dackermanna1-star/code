// Registry of zone types. Generators register themselves with defineZone().
export const ZT = {};

export function defineZone(name, def) {
  ZT[name] = Object.assign({
    name,
    border: 'wall',      // 'open' borders merge seamlessly with other open zones
    gate: 'door',        // door | open | wide
    minW: 16, minD: 16, maxW: 1e9, maxD: 1e9,
    tall: 0,             // extra levels claimed above (only on even levels)
    allowStairs: true,
    weight: () => 0,     // (ctx) => relative weight
    params: () => ({}),  // (zone, rng, ctx) => style params
    gen: () => {},       // (zb, world) => void
  }, def);
  return ZT[name];
}

export const GATE_ORDER = { door: 0, open: 1, wide: 2 };
