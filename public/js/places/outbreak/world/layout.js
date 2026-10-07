// The map of South Karevia: where the coast, the river, the lake, the towns,
// the bases and the roads are. North is -z. The map is 6144 studs across
// (about 2 km); the sea is to the south.
//
// Everything else - the shape of the hills, the forests, where each house
// stands - is grown from this plan by the terrain and settlement builders.

export const SIZE = 6144;
export const HALF = SIZE / 2;
export const SEA = 0; // sea level

/**
 * Settlements. kind: city | town | village | military | airfield.
 * r: rough radius (flattened, fewer trees). streets: extra streets as point lists (the roads below pass through too).
 */
export const PLACES = [
  { id: 'morovsk', name: 'Morovsk', kind: 'city', x: 1560, z: 1780, r: 520 },
  { id: 'lipovo', name: 'Lipovo', kind: 'town', x: 260, z: -640, r: 300 },
  { id: 'sosnovka', name: 'Sosnovka', kind: 'town', x: -1760, z: 900, r: 280 },
  { id: 'dubki', name: 'Dubki', kind: 'village', x: -720, z: 2010, r: 170 },
  { id: 'lesnoye', name: 'Lesnoye', kind: 'village', x: 300, z: 2060, r: 160 },
  { id: 'rybachye', name: 'Rybachye', kind: 'village', x: -2220, z: 2160, r: 170 },
  { id: 'polyana', name: 'Polyana', kind: 'village', x: 1120, z: 480, r: 170 },
  { id: 'ozerki', name: 'Ozerki', kind: 'village', x: -1020, z: -120, r: 160 },
  { id: 'gorelovo', name: 'Gorelovo', kind: 'village', x: 2020, z: -1080, r: 170 },
  { id: 'krutoy', name: 'Krutoy', kind: 'village', x: -2330, z: -1330, r: 150 },
  { id: 'object47', name: 'Object 47', kind: 'military', x: -1720, z: -2240, r: 300 },
  { id: 'dolina', name: 'Dolina Airfield', kind: 'airfield', x: 800, z: -2150, r: 420 },
];

/** Smaller points of interest. */
export const POIS = [
  { id: 'castle', name: 'Vorona Castle', kind: 'castle', x: -470, z: -1270 },
  { id: 'radio', name: 'Radio Station', kind: 'radio', x: 2380, z: -2460 },
  { id: 'lighthouse', name: 'Cape Volk Lighthouse', kind: 'lighthouse', x: -2640, z: 2640 },
  { id: 'farm1', name: 'Kolkhoz Farm', kind: 'farm', x: -340, z: 640 },
  { id: 'farm2', name: 'Sunny Farm', kind: 'farm', x: 720, z: -120 },
  { id: 'farm3', name: 'Old Farm', kind: 'farm', x: -1380, z: 1520 },
  { id: 'farm4', name: 'East Farm', kind: 'farm', x: 2230, z: 560 },
  { id: 'farm5', name: 'Hill Farm', kind: 'farm', x: 1650, z: -420 },
  { id: 'camp1', name: 'Bandit Camp', kind: 'camp', x: -880, z: -1880 },
  { id: 'camp2', name: 'Bandit Camp', kind: 'camp', x: 1420, z: -1240 },
  { id: 'camp3', name: 'Bandit Camp', kind: 'camp', x: -2560, z: 220 },
  { id: 'camp4', name: 'Bandit Camp', kind: 'camp', x: -160, z: 1260 },
  { id: 'gas1', name: 'Gas Station', kind: 'gas', x: 1290, z: 1150 },
  { id: 'gas2', name: 'Gas Station', kind: 'gas', x: -1420, z: 2140 },
  { id: 'gas3', name: 'Gas Station', kind: 'gas', x: -540, z: -400 },
];

/** The river: from the northern hills down to the sea between Dubki and Lesnoye. w: width. */
export const RIVER = {
  w: 34,
  pts: [[-260, -3200], [-200, -2600], [-90, -2100], [-160, -1650], [-330, -1150], [-360, -820], [-250, -420], [-150, -120], [-260, 300], [-330, 720], [-210, 1180], [-170, 1600], [-80, 1980], [-40, 2500], [0, 3300]],
};
/** The lake by Ozerki. */
export const LAKE = { x: -1280, z: -380, rx: 260, rz: 190, level: null };

/**
 * Roads. type: highway (asphalt, 22 wide) | road (asphalt, 17) | dirt (14) | track (10).
 * Points are rough; they are smoothed into curves and draped over the land.
 */
export const ROADS = [
  // the coast road, west to east
  { type: 'highway', pts: [[-2900, 2330], [-2220, 2180], [-1700, 2150], [-1420, 2120], [-1000, 2060], [-720, 2020], [-380, 2010], [-80, 1990], [260, 2070], [700, 2020], [1080, 1880], [1450, 1780], [1900, 1760], [2350, 1680], [3000, 1560]] },
  // the north road: Morovsk - Polyana - Lipovo - the airfield
  { type: 'highway', pts: [[1540, 1700], [1480, 1400], [1300, 1100], [1160, 760], [1120, 480], [960, 180], [700, -120], [440, -420], [260, -640], [240, -900], [380, -1300], [560, -1720], [700, -2040]] },
  // Lipovo west to Ozerki and Sosnovka (bridge over the river)
  { type: 'road', pts: [[260, -640], [0, -560], [-250, -440], [-520, -380], [-800, -220], [-1020, -120], [-1250, 140], [-1500, 460], [-1760, 900]] },
  // Sosnovka down to the coast at Rybachye
  { type: 'road', pts: [[-1760, 900], [-1820, 1250], [-1980, 1700], [-2220, 2180]] },
  // Sosnovka north through the hills to Krutoy and the military base
  { type: 'dirt', pts: [[-1760, 900], [-2000, 450], [-2180, 0], [-2320, -600], [-2330, -1330], [-2150, -1800], [-1720, -2240]] },
  // Lipovo up to the castle (a ford over the river)
  { type: 'dirt', pts: [[240, -900], [0, -1050], [-250, -1150], [-470, -1270]] },
  // Morovsk north-east to Gorelovo and the radio station
  { type: 'road', pts: [[1900, 1760], [2150, 1300], [2280, 600], [2200, -200], [2020, -1080]] },
  { type: 'dirt', pts: [[2020, -1080], [2200, -1700], [2380, -2460]] },
  // Lipovo east to Gorelovo
  { type: 'dirt', pts: [[260, -640], [700, -800], [1200, -900], [1650, -1000], [2020, -1080]] },
  // the airfield west to the military base
  { type: 'dirt', pts: [[300, -2160], [-300, -2280], [-900, -2300], [-1720, -2240]] },
  // Dubki inland to Sosnovka
  { type: 'dirt', pts: [[-720, 2020], [-880, 1600], [-1150, 1300], [-1500, 1080], [-1760, 900]] },
  // Polyana to the farms
  { type: 'track', pts: [[1120, 480], [1500, 500], [1900, 560], [2230, 560]] },
  { type: 'track', pts: [[-250, -440], [-300, 100], [-340, 640]] },
  { type: 'track', pts: [[-1150, 1300], [-1380, 1520]] },
  { type: 'track', pts: [[1200, -900], [1650, -420]] },
  { type: 'track', pts: [[-2220, 2180], [-2450, 2450], [-2640, 2640]] },
  { type: 'track', pts: [[-380, 2010], [-200, 1600], [-160, 1260]] },
  { type: 'track', pts: [[-1000, -2300], [-880, -1880]] },
  { type: 'track', pts: [[1200, -900], [1420, -1240]] },
];

export const ROAD_STYLE = {
  highway: { w: 22, shoulder: 10, tex: 'asphalt', lines: true },
  road: { w: 17, shoulder: 8, tex: 'asphalt', lines: true },
  dirt: { w: 14, shoulder: 6, tex: 'track', lines: false },
  track: { w: 9, shoulder: 5, tex: 'track', lines: false },
  street: { w: 15, shoulder: 3, tex: 'asphalt', lines: true },
  lane: { w: 9, shoulder: 3, tex: 'track', lines: false },
  base: { w: 14, shoulder: 3, tex: 'asphalt', lines: false },
};

/** Where you might wake up: along the coast. */
export const SPAWNS = [[-2500, 2280], [-1900, 2210], [-1250, 2140], [-500, 2080], [450, 2130], [900, 2080]];
