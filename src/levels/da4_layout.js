// Dead Air 4 — The Terminal: shared coordinates (metres, +Y up, north = -Z).
//
//          apron (walkable detour x -40..16, z -84..-44)  + parked airliners
//   ───────────────────────── z -42 ─────────────────────────────
//   | safe | C5 gate · VIP |fire| C3 gate · food court · shops | atrium  |checkpoint|  baggage handling  |
//   | room |   (west)      |door|        (east)    CONCOURSE YD| escal.  | x 54..100|  x 100..144        |
//   ───────────────────────── z -4 / 0 ───────────────────────────
//              | conference wing  |  balcony → grand stair     |           claim hall |
//              | (YU) x 2..30     |  LOBBY (check-in hall)     | barricade  x 100..136 |
//              | start room z 38+ |  x 30..100, z 0..44        |                       |
//   ───────────── landside curb, road, parking garage (visual), skybridge from the south
export const YU = 7.2;   // conference-centre / skybridge level
export const YD = 6.4;   // departure level (concourse)
export const WING = { x0: 2, x1: 30, z0: 0, z1: 46 };
export const START = { x0: 6, x1: 16, z0: 38, z1: 46 };
export const LOBBY = { x0: 30, x1: 100, z0: 0, z1: 44, h: 16 };
export const BAL = { x0: 30, x1: 64, z0: 0, z1: 6 };           // balcony (YU)
export const STAIR = { x0: 64, x1: 76, z0: 0.4, z1: 5 };       // grand stair (YU -> 0, descending +x)
export const BARR = { x: 100, z0: 14, z1: 22, h: 4 };         // barricade opening in the lobby's east wall
export const CLAIM = { x0: 100, x1: 136, z0: 0, z1: 44, h: 7 };
export const BAG = { x0: 100, x1: 144, z0: -36, z1: 0, h: 7 };
export const SEC = { x0: 54, x1: 100, z0: -34, z1: -2 };      // security area (ground)
export const CHK = { x: 82, lanes: [-7, -13, -19], office: { x0: 78, x1: 86, z0: -34, z1: -26 } };
export const ATR = { x0: 52, x1: 82, h: 12.4 };                // airside atrium (double height)
export const ESC = { x0: 52, x1: 64 };                          // escalators rise towards -x
export const CON = { x0: -50, x1: 52, z0: -42, z1: -4, h: 6 };  // concourse at YD
export const SHUTTER_X = -3;                                    // fire shutter across the concourse
export const GATES = { C1: 40, C2: 22, C3: 6, C4: -12, C5: -30 };
export const APRON = { x0: -40, x1: 16, z0: -84, z1: -42 };    // walkable apron detour
export const JB = { z0: -58, cab0: -61.5, stairZ: -71 };        // jet bridge extents (north of the gate door)
export const SAFE = { x0: -50, x1: -40, z0: -42, z1: -32 };     // end safe room (YD)
export const VAN = { x: 76, z: 37 };                            // shuttle van start (nose north)
export const TOWER = { x: 150, z: -190, h: 58 };                // control tower (red beacon)
