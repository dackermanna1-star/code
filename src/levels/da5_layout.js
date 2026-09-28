// Dead Air 5 — Runway Finale: shared layout constants (metres, +Y up, +Z south).
//
//  z=-34 ..-4   Metro International terminal (Concourse C). Departure level at
//               y=6: safe room (west) -> Gate C4 lounge (glass wall onto the
//               apron) -> jet bridge south over the apron -> cab -> service
//               stair down to the apron (y=0). Ground level: three baggage-hall
//               roll-up doors (infected pour out of them).
//  z=-4 .. 88   The apron (playable): service road, baggage trains, the burning
//               regional jet (west), bomb craters, a military checkpoint line
//               (z=34), and the evacuation staging area: the C-130 transport
//               (ramp up until it is fuelled), the fuel tanker off its right
//               wing, two minigun nests, tents and supply tables.
//  x=92..        Hangar 3 (east): its half-open door is an infected spawn.
//  T-walls       2.4 m concrete blast walls close the apron west (x=-70) and
//               south (z=89); infected climb over them from the outside strips.
//  z=95 ..       Visual only: grass, taxiway, the runway (centreline z=128) with
//               the burning wreck of SkyLine Air 212 (crashes at chapter start),
//               the control tower (red beacon), the burning city skyline.
export const DEP = 6;                 // departure level floor height
export const FAC_Z = -4;              // terminal south facade (outer face)
export const TERM = { x0: -82, x1: 100, z0: -34, z1: -4, roof: 13 };
export const APRON = { x0: -70, z0: -4, x1: 92, z1: 88.6 };
export const TW = { h: 2.4, t: 0.6 };  // perimeter T-walls
export const STRIP = 6;               // outside strip width (infected spawn ground)
export const SAFE = { x0: -44, z0: -12, x1: -36, z1: FAC_Z };
export const LOUNGE = { x0: -36, z0: -17, x1: -10, z1: FAC_Z, h: 4.6 };
export const GATE_X = -24.3;          // jet bridge door (centre x; one 2.6 m glass bay)
export const BRIDGE = { x0: -25.8, x1: -22.8, z0: FAC_Z, z1: 14 };
export const CAB = { x0: -27.6, x1: -21.0, z0: 14, z1: 18.8 };
export const STAIR = { x0: -21.0, x1: -12.6, z0: 15.3, z1: 17.3 };
export const HALLS = [ // ground-level baggage halls (x0, x1): doors in the facade
  { x0: -58, x1: -46, door: [-54.5, -49.5] },
  { x0: 2, x1: 14, door: [5.5, 10.5] },
  { x0: 60, x1: 72, door: [63.5, 68.5] },
];
export const HANGAR = { x0: 92, x1: 134, z0: 20, z1: 80, door: [41, 55], h: 17 };
export const PLANE = { x: 58, z: 66, yaw: Math.PI }; // C-130: nose south, ramp faces north
export const TANKER = { x: 40, z: 67 };
export const CHECK_Z = 34;            // checkpoint barrier line
export const RUNWAY = { z: 128, hw: 22 };
export const NEST_A = { x: 24, z: 42.5, yaw: 0 };            // minigun facing north
export const NEST_B = { x: 82, z: 56, yaw: -Math.PI / 2 };   // minigun facing east (hangar)
