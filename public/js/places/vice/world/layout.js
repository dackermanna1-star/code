// The map of Vice City, written by hand: the land, the districts, the street
// grids, the causeways, the expressway and the places that matter.
// Everything else (the road graph, blocks, lots, buildings) is generated from
// this by plan.js, the same way every time.
//
// Coordinates are studs (about 0.33 m): +x is east, +z is SOUTH (north is -z),
// +y is up. The sea is at y = 0 and the land at y = GROUND (seawalls stand
// GROUND above the water). The map is SIZE x SIZE, centred on 0.
//
//   north (-z)
//   +---------------------------------------------------------------+
//   | airport  |  wynwood / little haiti  | bay | north beach (golf) |
//   |----------+--------------------------|     |--------------------|  ocean
//   | westside | overtown | DOWNTOWN      | port| mid beach          |  (east)
//   | suburbs  | little   |---------------| bay |--------------------|
//   |          | havana   | brickell      |     | SOUTH BEACH        |
//   |          |-------------------------- |     |  ocean drive       |
//   | coral gables / coconut grove (canals)|     |                    |
//   +---------------------------------------------------------------+
//   south (+z): the sea and the mangroves

export const SIZE = 8192, HALF = SIZE / 2;
export const SEA = 0;
export const GROUND = 3;          // street level
export const CELL = 8;            // height map cell

// ---- the land --------------------------------------------------------------
// Polygons (x, z), clockwise. shore: how the land meets the water by default
// ('wall' = a concrete bulkhead, 'beach' = sand sloping into the sea,
// 'rocks' = riprap). Segments listed in `beaches` (index of the first point)
// are sand whatever the default.
export const LAND = [
  {
    id: 'mainland', shore: 'wall',
    pts: [
      [-4300, -4300], [760, -4300], [740, -3400], [700, -2900], [690, -2500], [640, -2100], [610, -1700],
      [620, -1300], [580, -1000], [560, -700], [600, -350], [640, 50], [620, 500], [560, 1000], [470, 1500],
      [330, 2000], [180, 2450], [-60, 2900], [-420, 3300], [-900, 3560], [-1700, 3720], [-2600, 3780],
      [-3400, 3700], [-4300, 3680],
    ],
    beaches: [],
    mangroves: [17, 18, 19, 20, 21, 22], // the south coast is mangrove swamp
  },
  {
    id: 'beach', shore: 'wall',
    pts: [
      [1960, -3820], [2860, -3820], [2950, -3000], [2990, -2000], [3010, -1000], [3020, 0], [3010, 1000],
      [2980, 1800], [2900, 2350], [2760, 2580], [2420, 2620], [2140, 2520], [2010, 2280], [1960, 1800],
      [2010, 1300], [2060, 900], [1960, 400], [1920, 0], [1960, -600], [2000, -1100], [1940, -1700],
      [1900, -2300], [1940, -3000],
    ],
    // the whole Atlantic side is beach, and so is the south tip
    beaches: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  { id: 'port', shore: 'wall', pts: [[860, -980], [1660, -1010], [1720, -720], [1680, -400], [880, -360], [830, -660]], beaches: [] },
  { id: 'watson', shore: 'rocks', pts: [[840, -1440], [1170, -1450], [1190, -1330], [1160, -1170], [860, -1160], [820, -1300]], beaches: [] },
  { id: 'star', shore: 'wall', ellipse: [1400, -1530, 200, 95], beaches: [] },
  { id: 'brickellkey', shore: 'wall', pts: [[720, 120], [880, 110], [900, 260], [860, 330], [730, 320], [700, 220]], beaches: [] },
];

// carved below sea level inside the land: canals (polylines with a width)
export const CANALS = [
  { id: 'gables', w: 64, pts: [[600, 2140], [-200, 2150], [-700, 2120], [-1200, 2200], [-1700, 2180]] },
  { id: 'gables2', w: 52, pts: [[-700, 2120], [-720, 2700], [-650, 3200]] },
  { id: 'creek', w: 60, pts: [[1940, -2720], [2190, -2700], [2190, -1700], [2186, -900], [2010, -760]] },
  { id: 'river', w: 76, pts: [[640, -60], [200, -70], [-300, -40], [-700, -90], [-1200, -60], [-1700, -110], [-2150, -90]] },
];

// ---- districts -------------------------------------------------------------
// Rectangles [x0, z0, x1, z1] (the first that contains a point wins).
// style: the building generator. h: [min, max] height of the buildings in studs.
// peds: how busy the pavements are (0..1). gang: who owns the streets.
export const DISTRICTS = [
  { id: 'southbeach', name: 'South Beach', rect: [1880, 300, 3100, 2700], style: 'deco', h: [26, 70], peds: 1, color: '#ff5fa2' },
  { id: 'midbeach', name: 'Mid Beach', rect: [1880, -1500, 3100, 300], style: 'resort', h: [60, 380], peds: 0.7, color: '#ff9e5f' },
  { id: 'northbeach', name: 'North Beach', rect: [1880, -3900, 3100, -1500], style: 'condo', h: [30, 160], peds: 0.45, color: '#ffc75f' },
  { id: 'port', name: 'Port of Vice City', rect: [820, -1020, 1740, -350], style: 'port', h: [20, 60], peds: 0.15, gang: 'dockers', color: '#5fb4ff' },
  { id: 'watson', name: 'Watson Island', rect: [800, -1460, 1200, -1150], style: 'park', h: [20, 40], peds: 0.3, color: '#7ce0c3' },
  { id: 'star', name: 'Star Island', rect: [1180, -1650, 1620, -1420], style: 'mansion', h: [20, 36], peds: 0.1, color: '#ffd86b' },
  { id: 'brickellkey', name: 'Brickell Key', rect: [680, 90, 920, 350], style: 'tower', h: [180, 420], peds: 0.4, color: '#9fb6ff' },
  { id: 'downtown', name: 'Downtown', rect: [-640, -1700, 760, -60], style: 'tower', h: [120, 720], peds: 1, color: '#7c9cff' },
  { id: 'brickell', name: 'Brickell', rect: [-640, -60, 760, 1350], style: 'tower', h: [90, 520], peds: 0.85, color: '#a98bff' },
  { id: 'overtown', name: 'Overtown', rect: [-1500, -1700, -640, -560], style: 'lowrise', h: [16, 48], peds: 0.55, gang: 'kings', color: '#c0a070' },
  { id: 'havana', name: 'Little Havana', rect: [-2400, -560, -640, 1350], style: 'havana', h: [14, 44], peds: 0.9, gang: 'cubans', color: '#ffb35f' },
  { id: 'wynwood', name: 'Wynwood', rect: [-2400, -3000, 760, -1700], style: 'warehouse', h: [18, 56], peds: 0.6, gang: 'kings', color: '#ff6b6b' },
  { id: 'littlehaiti', name: 'Little Haiti', rect: [-2400, -4300, 760, -3000], style: 'lowrise', h: [14, 34], peds: 0.5, gang: 'haitians', color: '#e0e070' },
  { id: 'airport', name: 'Vice City International', rect: [-4300, -4300, -2400, -760], style: 'airport', h: [20, 60], peds: 0.1, color: '#cfd8e8' },
  { id: 'westside', name: 'Hialeah', rect: [-4300, -760, -2400, 3800], style: 'suburb', h: [12, 22], peds: 0.35, color: '#9be07c' },
  { id: 'gables', name: 'Coral Gables', rect: [-2400, 1350, 800, 3800], style: 'villa', h: [14, 30], peds: 0.35, color: '#6be0a0' },
];

// ---- streets ---------------------------------------------------------------
// Road classes: lanes each way, lane width, median, sidewalk width, speed (studs/s).
export const ROAD = {
  hwy: { lanes: 3, lane: 13, median: 8, walk: 0, speed: 110, barrier: true },
  blvd: { lanes: 3, lane: 13, median: 14, walk: 16, speed: 70, palms: true },
  ave: { lanes: 2, lane: 13, median: 0, walk: 14, speed: 60 },
  street: { lanes: 1, lane: 14, median: 0, walk: 12, speed: 45, parking: true },
  drive: { lanes: 1, lane: 14, median: 0, walk: 20, speed: 35, parking: true }, // Ocean Drive
};

// Street grids. Each grid is clipped to its land and its rect; `xs` are the
// north-south avenues (x), `zs` the east-west streets (z). A line can name its
// class and a name; plain numbers are 'street'. `skip` removes rectangles
// (parks, the airport, the golf course) from the grid.
const span = (a, b, step) => { const o = []; for (let v = a; v <= b + 1e-6; v += step) o.push(Math.round(v)); return o; };
export const GRIDS = [
  {
    id: 'main', land: 'mainland', rect: [-4060, -3900, 700, 3500],
    xs: [
      ...span(-4000, -2440, 260).map((x) => x), -2200, [-1960, 'ave', 'NW 27th Ave'], -1720, -1480, [-1240, 'ave', 'NW 12th Ave'],
      -1020, [-800, 'blvd', 'I-95 Frontage'], -580, [-360, 'ave', 'Miami Ave'], -140, [80, 'ave', '2nd Ave'], 300, [500, 'blvd', 'Biscayne Blvd'],
    ],
    zs: [
      [-3900, 'ave', '79th Street'], -3640, -3380, [-3120, 'ave', '54th Street'], -2860, [-2600, 'ave', '36th Street'], -2340, -2080,
      [-1840, 'ave', 'NE 14th St'], -1620, -1420, [-1220, 'blvd', 'Port Blvd'], [-1020, 'blvd', 'Dolphin Frontage'], -560, -360, [-160, 'ave', 'Flagler St'],
      40, 240, [440, 'blvd', 'Calle Ocho'], 640, 840, [1040, 'ave', 'Coral Way'], 1240, 1460, 1680, 1900, [2380, 'ave', 'Bird Road'], 2620, 2860, 3100, 3300, [3500, 'ave', 'Old Cutler Road'],
    ],
    skip: [
      [-4300, -4300, -2400, -760],     // the airport (its own roads)
      [380, -1180, 760, -880],          // Bayfront Park
      [-2100, 1700, -1500, 2120],       // Gables golf club
      [-1830, 560, -1270, 960],         // the ballpark
      [380, -2380, 760, -2000],         // Margaret Pace Park
      [-1700, -3700, -1290, -3270],     // the cemetery
      [-3640, 1180, -3100, 1720],       // Westside Park
      [-260, 2420, 260, 2840],          // Peacock Park (Coconut Grove)
      [-470, -1520, -250, -1300],       // Government Center plaza
    ],
  },
  {
    id: 'beach', land: 'beach', rect: [1940, -3780, 3000, 2560],
    xs: [[2090, 'ave', 'Alton Road'], 2280, [2440, 'ave', 'Washington Ave'], [2600, 'ave', 'Collins Ave'], [2760, 'drive', 'Ocean Drive', [240, 2420]]],
    zs: [
      [-3600, 'ave', '71st Street'], -3380, -3160, [-2940, 'ave', '63rd Street'], -2500, -2280, [-2060, 'ave', '41st Street'],
      -1840, -1620, [-1300, 'ave', '5th Street'], -1080, -860, -640, -420, -200, [20, 'street', 'Lincoln Road'], 240, 460, 680, 900,
      1120, 1340, 1560, 1780, 2000, 2220, 2420,
    ],
    skip: [
      [1960, -3420, 2460, -2980], // the golf course
      [2280, 1120, 2600, 1340],   // Flamingo Park (between its four streets)
      [2470, -560, 2740, -300],   // Collins Park
    ],
  },
  {
    id: 'port', land: 'port', rect: [880, -980, 1680, -420],
    xs: [[960, 'ave', 'Port Way'], 1240, 1520], zs: [-880, [-720, 'ave', 'Caribbean Way'], -560], skip: [],
  },
];

// Causeways and bridges: roads across open water, joining the grids. They
// start and end on grid streets. Where a road crosses water it is carried on
// a deck; `deck` is the clearance over the sea at the middle (ramps either end).
export const CROSSINGS = [
  { id: 'julia', name: 'Julia Tuttle Causeway', cls: 'ave', pts: [[500, -2600], [2090, -2500]], deck: 20 },
  { id: 'macarthur', name: 'MacArthur Causeway', cls: 'blvd', pts: [[500, -1220], [860, -1300], [2090, -1300]], deck: 26 },
  { id: 'portbridge', name: 'Port Bridge', cls: 'ave', pts: [[500, -560], [960, -560]], deck: 34 },
  { id: 'venetian', name: 'Venetian Causeway', cls: 'street', pts: [[500, 640], [2090, 680]], deck: 12 },
  { id: 'keybridge', name: 'Brickell Key Bridge', cls: 'street', pts: [[500, 240], [790, 240]], deck: 6 },
  { id: 'starbridge', name: 'Star Island Bridge', cls: 'street', pts: [[1400, -1300], [1400, -1530]], deck: 6 },
];

// Other roads at street level (x, z): the airport, the islands' loops.
export const EXTRA_ROADS = [
  { name: 'Perimeter Road', cls: 'street', pts: [[-4000, -760], [-2400, -760], [-2400, -3900]] },
  { name: 'Airport Road', cls: 'ave', pts: [[-3220, -560], [-3220, -1020], [-3220, -1700]] },
  { name: 'Terminal Loop', cls: 'ave', pts: [[-3220, -1700], [-2700, -1700], [-2700, -2300], [-3220, -2300], [-3220, -1700]] },
  { name: 'Cargo Road', cls: 'street', pts: [[-2700, -1700], [-2440, -1700]] },
  { name: 'Brickell Key Drive', cls: 'street', pts: [[790, 240], [790, 160], [860, 200], [860, 290], [790, 240]] },
  { name: 'Star Island Drive', cls: 'street', pts: [[1400, -1530], [1260, -1530], [1260, -1480], [1540, -1480], [1540, -1530], [1400, -1530]] },
  { name: 'Watson Drive', cls: 'street', pts: [[1000, -1300], [1000, -1400]] },
];

// The elevated expressway: polylines of [x, z, y] where y is the height above
// street level. Ends at y = 0 join the streets; shared points join each other.
// I-95 runs north-south over the frontage avenue at x = -800 (which carries on
// underneath); the Dolphin spur comes in from the airport.
export const EXPRESSWAY = {
  cls: 'hwy',
  lines: [
    { name: 'I-95', pts: [[-800, -3900, 0], [-800, -3380, 46], [-800, -1020, 46], [-800, 840, 46], [-800, 1240, 0]] },
    { name: 'Dolphin Expressway', pts: [[-3220, -1020, 0], [-2900, -1020, 34], [-2400, -1020, 46], [-800, -1020, 46]] },
  ],
  // the frontage avenue gives way to the ramps here (x, z0, z1)
  clear: [[-800, -3900, -3380], [-800, 840, 1240]],
};

// ---- places ------------------------------------------------------------------
export const PLACES = [
  { id: 'safehouse', name: 'Safehouse', x: 2470, z: 1460, kind: 'safehouse' },   // a deco hotel room on Washington Ave
  { id: 'hospital', name: 'Mount Sinai Medical', x: 2120, z: -2160, kind: 'hospital' },
  { id: 'hospital2', name: 'Jackson Memorial', x: -1360, z: -880, kind: 'hospital' },
  { id: 'police', name: 'VCPD Headquarters', x: -260, z: -620, kind: 'police' },
  { id: 'police2', name: 'VCPD Beach Station', x: 2350, z: 120, kind: 'police' },
  { id: 'gunshop', name: 'Ammu-Vice', x: -1100, z: 300, kind: 'gunshop' },
  { id: 'gunshop2', name: 'Ammu-Vice', x: 2350, z: -1950, kind: 'gunshop' },
  { id: 'sprayshop', name: 'Pay \'n\' Spray', x: -1600, z: -2200, kind: 'spray' },
  { id: 'arena', name: 'Vice Arena', x: 420, z: -640, kind: 'arena' },
  { id: 'marina', name: 'South Pointe Marina', x: 2200, z: 2440, kind: 'marina' },
  { id: 'helipad', name: 'Watson Heliport', x: 1000, z: -1380, kind: 'helipad' },
  { id: 'pier', name: 'South Pointe Pier', x: 2900, z: 2470, kind: 'pier' },
];

// Where you start: outside the safehouse, by the beach.
export const START = { x: 2476, z: 1470, heading: -Math.PI / 2 }; // on the sidewalk, facing Washington Ave
