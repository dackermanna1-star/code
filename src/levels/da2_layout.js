// Dead Air 2 — The Crane: shared layout constants (metres, +Y up, +Z south).
//
// Route (west->east->west zig-zag, climbing, then south):
//   Harborview Hotel ground floor: kitchen safe room (east) -> kitchen -> service
//   hall -> loading dock (west) -> alley north of the hotel (walk east) -> fire
//   escape on the hotel's north face -> 3F room 301 (NE) -> 3F corridor (walk
//   west, collapsed section: detour through rooms 310/312) -> NW stairwell ->
//   hotel roof (neon HARBORVIEW letters, water tank) -> crane remote at the
//   loading bay on the south edge -> CRESCENDO: the tower crane on the
//   construction site swings a steel skip across the light well -> cross ->
//   construction deck -> scaffold stair + plank bridge -> printing works roof ->
//   Meridian office tower L3 (open plan, conference, copy room) -> NE stair to
//   the dark L2 (server room, last stand) -> mezzanine + grand stair to the
//   lobby -> alarmed emergency exit -> Commerce Street -> Stor-Safe Self Storage
//   -> safe room in storage unit C-17.
export const GY = 0;        // street / alley level
export const HG = 1.2;      // hotel ground floor (kitchen, dock)
export const HC = 4.9;      // hotel ground-floor ceiling
export const H3 = 8.6;      // hotel 3rd floor
export const HR = 12.0;     // hotel roof = construction deck
export const LR = 8.6;      // printing works roof
export const OL1 = 0.3, OL2 = 4.6, OL3 = 8.6; // office tower floors

export const HOTEL = { x0: 0, z0: 0, x1: 52, z1: 20 };
export const CB = { x0: 14, z0: 24.6, x1: 56, z1: 56 };  // construction building
export const LB = { x0: 14, z0: 60.4, x1: 58, z1: 86 };  // printing works (lower roof)
export const OT = { x0: 58, z0: 56, x1: 92, z1: 96 };    // Meridian office tower
export const STREET = { z0: 96, z1: 112 };               // Commerce Street (incl. sidewalks)
export const SS = { x0: 54, z0: 120, x1: 98, z1: 152 };   // Stor-Safe building

// the skip that bridges the light well between the hotel roof and the deck
export const SKIP = { x0: 34.8, x1: 37.2, z0: 18.8, z1: 26.0, floor: HR + 0.25, wallH: 1.5 };
export const BAY = { x0: 34.4, x1: 37.6 };   // loading-bay openings in the parapet / deck rail
export const GATE_N = 18.3, GATE_S = 26.5;   // safety gates either side of the skip
export const CRANE = { x: 36, z: 46, top: 36.5 }; // mast centre + slewing ring height
