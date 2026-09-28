// Dead Air 3 — The Construction Site: shared layout constants (metres, +Y up,
// +X east, +Z south). The route runs west -> east toward Metro International.
//
//   Stor-Safe unit C-17 (start safe room, same room chapter 2 ends in) ->
//   corridor C2 -> rear exit -> drive-up yard -> alley -> Kessler Ave (a failed
//   army checkpoint) -> SKYLINE TOWER construction site: front yard (site
//   cabins, a barricaded site office with a last stand, a Witch trailer, the
//   tower crane) -> ground floor of the concrete frame -> core stair -> level 2
//   slab (collapse, views) -> scaffold stair tower -> rear yard -> CRESCENDO:
//   the rear gate is blocked by a barricade of wrecks rigged with red gas
//   canisters: shoot them -> blast -> hordes -> Grid Road -> Substation 12
//   (fenced service alleys between humming, arcing transformer yards) ->
//   Voltex Electric workshop -> Terminal Road -> Newburg Generating Station
//   grounds (turbine hall, pipe racks, stacks, cooling towers) -> airport
//   plaza -> Park-Rite P3 garage: ramp -> level 2 (car-alarm trap) -> stairs ->
//   roof lobby -> glass skybridge -> conference-centre office safe room.
export const SY = 0.3;            // Stor-Safe floor
export const SS = { x0: -12.4, z0: -7.9, x1: 8.15, z1: 8.1, H: 4.2 };
export const C2 = { z0: -1.6, z1: 1.2 };                 // corridor
export const C17 = { x0: 1.5, x1: 7.85, z0: 1.3, z1: 7.8, door: 4.55 };
export const YARD = { x0: 8.15, x1: 34, z0: -12, z1: 10 };
export const ALLEY = { x0: 34, x1: 54, z0: -3.2, z1: 3.2 };
export const KES = { x0: 54, x1: 68, z0: -34, z1: 34 };  // Kessler Ave
export const SITE = { x0: 68, x1: 148, z0: -34, z1: 30, gate: [-4, 3] };
export const BLD = { x0: 96, x1: 124, z0: -22, z1: 6 };   // concrete frame
export const LV = { G: 0.2, L2: 4.4, L3: 8.6, L4: 12.8, L5: 17.0 };
export const CORE = { x0: 106, x1: 112, z0: -12, z1: -4 };
export const TOWER_ST = { x0: 124.2, x1: 128.4, z0: -19.6, z1: -10.8 }; // scaffold stair tower
export const BAR = { x: 148, z0: -8, z1: 2 };             // rear gate / barricade
export const GRID = { x0: 148.15, x1: 162 };               // Grid Road
export const SUB = { x0: 162, x1: 200 };                   // Substation 12
export const P1 = { x0: 162, x1: 180, z0: -5, z1: -1 };
export const P2 = { x0: 176, x1: 180, z0: -5, z1: 14 };
export const P3 = { x0: 180, x1: 200, z0: 10, z1: 14 };
export const WS = { x0: 200, x1: 218, z0: 2, z1: 22, y: 0.15, H: 5.6 }; // Voltex workshop
export const TRD = { x0: 218, x1: 232 };                   // Terminal Road
export const PS = { x0: 232, x1: 268, z0: -34, z1: 34 };   // generating station grounds
export const GAR = { x0: 276, x1: 312, z0: -20, z1: 20, D2: 3.4, D3: 6.8 };
export const SKY = { x0: 312, x1: 334, z0: -3.2, z1: 1.2, y: 6.8 };
export const END = { x0: 334.3, x1: 342.3, z0: -5, z1: 3, y: 6.8, H: 3.0 };
export const TOWER = { x: 470, z: -46, h: 64 };            // Metro International control tower
