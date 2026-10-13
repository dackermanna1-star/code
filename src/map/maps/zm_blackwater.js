// Blackwater Docks (zm_blackwater): a foggy cargo harbour at grey dawn. An original layout:
// a long concrete quay runs east-west along the harbour with the gantry crane (the landmark)
// standing over a moored freighter at its west end, the slipway, the harbour master's office
// and the fish market in the middle, and the root of the breakwater at its east end; two
// timber piers run out into the water to a pier head, a footbridge crosses to the breakwater,
// which curls round the harbour to the lighthouse. Behind the quay road stand the two
// warehouses, the customs yard and the fuel depot; behind them the rail siding and the
// container yard. The squad starts at the harbour master's office; the horde comes out of the
// container yard, the rail tunnel, the warehouses, the truck gate, the far piers, the
// breakwater and the freighter's hold.
//
// Units: x east, y north, z up. The quay and the yards are at z 0, the breakwater 32, the
// freighter's deck 112 and its hold -64; the water's surface is at -88 (fall in: back on land).
// Floors from zm_blackwater_layout.js, structures from zm_blackwater_build.js; deterministic.
import { AreaMap } from '../areagen.js';
import { spawnGrid, navSeed, zone } from '../kit.js';
import { BOUNDS, layout, WATER_Z, BREAK_Z, DECK_Z, HOLD_Z } from './zm_blackwater_layout.js';
import * as B from './zm_blackwater_build.js';
import * as X from './zm_blackwater_detail.js';

/** The map's textures by role (the shared pack + the blackwater pack: 20 world textures). */
export const T = {
  concrete: 'bw_concrete', seawall: 'bw_seawall', planks: 'bw_planks', pile: 'bw_planks', water: 'bw_water', mud: 'bw_seawall',
  road: 'asphalt_lane', gravel: 'bw_railbed', perimeter: 'brick_red', brick: 'brick_red', cladding: 'bw_cladding', roofDark: 'bw_cladding',
  plaster: 'concrete_paint', paintWhite: 'concrete_paint', tile: 'bw_concrete', steel: 'bw_steel', crane: 'bw_steel', pump: 'bw_steel',
  iron: 'bw_iron', rust: 'bw_iron', tyre: 'bw_iron', rack: 'bw_iron', hatch: 'bw_iron', tank: 'concrete_paint',
  hull: 'bw_hull', hullBoat: 'bw_hull', deck: 'metal_diamond', grate: 'metal_diamond', glass: 'glass_dark', lightPanel: 'light_panel',
  crate: 'bw_atlas', c1: 'container_red', c2: 'container_blue', c3: 'bw_container_teal', c4: 'container_orange',
};

export const MAP = {
  id: 'zm_blackwater',
  title: 'Blackwater Docks',
  modes: ['zombies'],
  tagline: 'You hear them before you see them',
  blurb: 'A cargo harbour at grey dawn: fog off the water, a silent gantry crane over a moored freighter, sodium lamps over the container stacks - and the dead coming up out of the hold, off the piers and down the rails.',
  mood: ['overcast', 'fog', 'harbour'],
  squad: { min: 1, best: 4, max: 11 },
  // a low cold sun lost in the haze (soft, weak shadows), a blue-grey sky doing most of the work
  lighting: {
    sunDir: [0.53, -0.6, 0.6],
    sunColor: [0.34, 0.34, 0.36],
    skyColor: [0.44, 0.47, 0.52],
    ambientMin: [0.06, 0.065, 0.075],
    bounce: 0.45,
    voidColor: [0.1, 0.12, 0.13],
    lmEncoding: 'sqrt',
  },
  sky: { preset: 'overcast' },
  fog: { color: [0.43, 0.47, 0.5], near: 220, far: 2300 },
  grade: { saturate: 0.82, contrast: 1.04 },
  ambience: { loop: 'amb_blackwater', volume: 0.42 },
  textures: 'blackwater',
  // callouts (first match wins: interiors and high places first)
  zones: [
    zone('Harbour Master', 'office', -128, -544, 256, -256, -50, 400),
    zone('Crane Cabin', 'cabin', -1104, -400, -944, -272, -50, 300),
    zone('Freighter Hold', 'hold', -2048, -1104, -608, -704, -100, 100),
    zone('Freighter Deck', 'deck', -2048, -1104, -608, -704, 100, 800),
    zone('Gangways', 'gangway', -1408, -704, -952, -432, 1, 300),
    zone('Lighthouse', 'lighthouse', -112, -2144, 352, -1632, -100, 1000),
    zone('Breakwater', 'breakwater', 320, -2048, 2048, -1760, -100, 400),
    zone('Breakwater', 'breakwater', 1760, -1792, 2048, -640, -100, 400),
    zone('Footbridge', 'bridge', 864, -1792, 960, -1600, -100, 300),
    zone('The Launch', 'launch', 1344, -1440, 1600, -960, -100, 300),
    zone('Pier Head', 'head', 480, -1640, 1376, -1216, -100, 300),
    zone('Pier One', 'pier1', 480, -1216, 736, -640, -100, 300),
    zone('Pier Two', 'pier2', 1120, -1216, 1376, -640, -100, 300),
    zone('Slipway', 'slipway', -512, -960, -256, -640, -300, 300),
    zone('Fish Market', 'market', 768, -544, 1536, -192, -50, 400),
    zone('The Berth', 'berth', -2112, -690, -640, -128, -50, 400),
    zone('East Quay', 'eastquay', 1536, -690, 2112, -128, -50, 400),
    zone('The Quay', 'quay', -640, -690, 1536, -128, -50, 400),
    zone('Quay Road', 'road', -2112, -128, 2112, 96, -50, 400),
    zone('Warehouse Two Office', 'w2office', -160, 400, 240, 672, 100, 400),
    zone('Warehouse One', 'w1', -1600, 96, -864, 672, -50, 400),
    zone('Warehouse Two', 'w2', -480, 96, 256, 672, -50, 400),
    zone('Warehouse Row', 'row', -864, 96, -480, 736, -50, 400),
    zone('Rail Gate', 'railgate', -2560, 640, -1728, 928, -50, 400),
    zone('West Yard', 'westyard', -2112, 96, -1600, 928, -50, 400),
    zone('Loading Road', 'loading', -1600, 672, 320, 928, -50, 400),
    zone('Container Tops', 'tops', -2112, 928, 1088, 1344, 90, 600),
    zone('Container Yard', 'yard', -2112, 928, 1088, 1344, -50, 400),
    zone('Customs Office', 'customsoffice', 832, 576, 1216, 864, -50, 400),
    zone('Truck Gate', 'truckgate', 1088, 928, 1600, 1536, -50, 400),
    zone('Customs Yard', 'customs', 256, 96, 1600, 928, -50, 400),
    zone('Fuel Depot', 'depot', 1600, 96, 2112, 1344, -50, 400),
  ],
  // the horde's seven ways in, each with the mouth where it breaks into the docks
  fronts: [
    { id: 'yard', name: 'CONTAINER YARD', via: 'out of the', zones: ['Container Yard', 'Container Tops'], mouth: [-608, 900] },
    { id: 'rail', name: 'RAIL GATE', via: 'through the', zones: ['Rail Gate'], mouth: [-1760, 800] },
    { id: 'warehouses', name: 'WAREHOUSES', via: 'out of the', zones: ['Warehouse One'], mouth: [-1360, 140] },
    { id: 'truck', name: 'TRUCK GATE', via: 'through the', zones: ['Truck Gate'], mouth: [1344, 900] },
    { id: 'piers', name: 'FAR PIERS', via: 'off the', zones: ['Pier Head'], mouth: [928, -680] },
    { id: 'hold', name: 'FREIGHTER HOLD', via: 'up out of the', zones: ['Freighter Hold'], mouth: [-1180, -420] },
    { id: 'breakwater', name: 'BREAKWATER', via: 'along the', zones: ['Breakwater', 'Lighthouse'], mouth: [1888, -600] },
  ],
  squadStart: { pos: [64, -176, 0], yaw: 200, radius: 200 },
  buyArea: { pos: [64, -176, 0], radius: 320 },
  // the wave-20 way out: the launch at pier two, or the freighter's deck
  extraction: [
    { id: 'launch', name: 'The Launch', pos: [1456, -1180, -16], radius: 220 },
    { id: 'freighter', name: 'Freighter Deck', pos: [-1360, -904, 112], radius: 260 },
  ],
  objectives: [
    { id: 'crane', name: 'Hold the crane controls', kind: 'hold', pos: [-1024, -336, 0], radius: 160 },
    { id: 'pumps', name: 'Defend the fuel pumps', kind: 'defend', pos: [1856, 240, 8], radius: 220 },
    { id: 'radio', name: 'Radio from the lighthouse', kind: 'hold', pos: [128, -1888, 32], radius: 140 },
    { id: 'supply_head', name: 'Supply drop: the pier head', kind: 'supply', pos: [928, -1536, 0] },
    { id: 'fuel_run', name: 'Fuel run: the pumps to the launch', kind: 'escort', pos: [1856, 240, 8], to: [1456, -1180, -16] },
  ],
  titleShots: [
    { eye: [700, -560, 120], look: [-1300, -700, 420] },
    { eye: [1250, -1560, 90], look: [300, -1880, 300] },
    { eye: [-620, 600, 90], look: [-620, 1300, 70] },
    { eye: [1900, -560, 110], look: [900, -1450, 0] },
  ],
  thumbShot: { eye: [900, -480, 160], look: [-1300, -800, 380] },
  hazards: [
    // the harbour: fall in and you're back on the nearest bit of land (zombies: a fresh spawn spot)
    { id: 'harbour', kind: 'teleport', mins: [BOUNDS[0], BOUNDS[1], -600], maxs: [BOUNDS[2], -641, WATER_Z + 8], damage: 10, zombies: 'recycle' },
  ],
};

export function build() {
  const m = new AreaMap(BOUNDS);
  layout(m, T);
  B.water(m, T);
  B.quay(m, T);
  B.slipway(m, T);
  B.crane(m, T);
  B.freighter(m, T);
  B.piers(m, T);
  B.breakwater(m, T);
  B.office(m, T);
  B.market(m, T);
  B.warehouses(m, T);
  B.customs(m, T);
  B.depot(m, T);
  B.containerYard(m, T);
  B.westYard(m, T);
  B.quayProps(m, T);
  B.yardLights(m, T);
  X.quayDetail(m, T);
  X.shipDetail(m, T);
  X.waterfrontDetail(m, T);
  X.buildingDetail(m, T);
  X.yardDetail(m, T);
  X.perimeterDetail(m, T);
  // the squad: on the quay in front of the harbour master's office
  spawnGrid(m, 'info_player_start', 64, -176, 0, 200, 4, 2, 64); // (facing the crane)
  // nav seeds where the flood fill from the squad can't walk to (the hold is down a drop too)
  navSeed(m, -1360, -904, HOLD_Z);
  navSeed(m, -1500, -904, DECK_Z);
  navSeed(m, 1100, -1900, BREAK_Z);
  return m;
}
