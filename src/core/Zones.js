// Spatial zones: axis-aligned volumes that tell the game what kind of space the player is in
// (acoustics, indoor/outdoor, ambience mix, conveyors for escalators).

const DEFAULT = Object.freeze({
  name: 'outside', type: 'outdoor', indoor: false, priority: -1,
  reverb: 'outdoor', wind: 1, traffic: 1, snow: true, conveyor: null, silence: false,
})

export class Zones {
  constructor() {
    this.list = []
    this.default = DEFAULT
  }

  /**
   * Add a zone. o: { name, min:[x,y,z], max:[x,y,z], type, indoor, priority=0,
   *   reverb ('outdoor'|'courtyard'|'stairwell'|'underpass'|'metro'|'shop'|'elevator'|'tunnel'|'room'|'park'),
   *   wind 0..1 (wind loudness), traffic 0..1, snow (particles visible), conveyor [vx,vy,vz] m/s,
   *   silence (all ambience fades), surface (footstep override), data }
   */
  add(o) {
    const z = {
      ...DEFAULT,
      priority: 0,
      reverb: o.reverb ?? (o.indoor ? 'room' : 'outdoor'),
      wind: o.wind ?? (o.indoor ? 0.15 : 1),
      traffic: o.traffic ?? (o.indoor ? 0.25 : 1),
      snow: o.snow ?? !o.indoor,
      ...o,
    }
    z.vol = (z.max[0] - z.min[0]) * (z.max[1] - z.min[1]) * (z.max[2] - z.min[2])
    this.list.push(z)
    return z
  }

  /** The most specific zone containing the point (highest priority, then smallest volume). */
  at(x, y, z) {
    let best = null
    for (const zn of this.list) {
      if (x < zn.min[0] || y < zn.min[1] || z < zn.min[2] || x > zn.max[0] || y > zn.max[1] || z > zn.max[2]) continue
      if (!best || zn.priority > best.priority || (zn.priority === best.priority && zn.vol < best.vol)) best = zn
    }
    return best || this.default
  }

  all(x, y, z) {
    return this.list.filter(zn => !(x < zn.min[0] || y < zn.min[1] || z < zn.min[2] || x > zn.max[0] || y > zn.max[1] || z > zn.max[2]))
  }
}
