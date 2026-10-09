// The shared state of Vice City: every system puts itself here (V.phys,
// V.vehicles, V.peds, ...) so the others can find it. See ARCHITECTURE.md.
export const V = {};

/** Constants shared by every system. */
export const K = {
  G: 80,            // gravity, studs/s² (everything that falls uses this)
  GROUND: 3,        // street level (sea level is 0)
  STUD: 0.33,       // metres per stud (for speedometers and stats)
};
