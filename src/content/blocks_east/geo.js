// Layout plan of the eastern blocks (B, E, C) and their driveways, in world meters
// (x east, z south). One place for every coordinate so the sub-builders, the API and the
// catalog agree. See docs/catalog/blocks_east.md for a map.

export const REGION = {
  B: { x0: 308, z0: 144, x1: 456, z1: 322 },
  E: { x0: 308, z0: 328, x1: 456, z1: 500 }, // z 500–508 is the avenue's tree strip
  C: { x0: 462, z0: 144, x1: 600, z1: 322 },
}

// driveways (проезды), road level y = 0
export const DRIVE = {
  ns: { x0: 456, x1: 462, z0: 144, z1: 524 },        // eastern N–S driveway (runs on to the avenue kerb)
  ew: { z0: 322, z1: 328, x0: 308, x1: 598 },        // E–W driveway (blocks_west owns x 150–308)
  innerB: { z0: 173, z1: 178, x0: 308, x1: 456 },    // along the 9-storey of Block B
  innerE: { z0: 357, z1: 362, x0: 308, x1: 456 },    // along the three towers of Block E
  innerC: { z0: 198, z1: 203, x0: 462, x1: 576 },    // along the long building of Block C (dead end)
  garageC: { z0: 158.5, z1: 165, x0: 462, x1: 594 }, // lane in front of the brick garages
}

const ZAV = 'ул. Заводская'
const MOL = '3-й Молодёжный пр.'

// residential buildings: placeResidential opts (x, z = front-left corner of the entrance facade)
export const BUILDINGS = {
  // Block B
  b9: { series: '1515', floors: 9, sections: 5, x: 449.5, z: 168, rot: 2, seed: 41, address: { street: ZAV, house: '5' }, firstApartment: 1 },
  bt1: { series: 'p44t', floors: 17, sections: 2, x: 330, z: 194, rot: 3, seed: 42, address: { street: MOL, house: '3', korpus: '1' }, tint: 0x8a5a44 },
  bt2: { series: 'p44', floors: 16, sections: 1, x: 436, z: 236, rot: 1, seed: 43, address: { street: MOL, house: '3', korpus: '2' }, tint: 0x7a4b32, firstApartment: 1 },
  // Block E: three P-44T towers in a row, entrances facing the vast courtyard to the south
  et1: { series: 'p44t', floors: 17, sections: 1, x: 343, z: 352, rot: 2, seed: 51, address: { street: MOL, house: '8', korpus: '1' }, tint: 0x8f5d45 },
  et2: { series: 'p44t', floors: 17, sections: 1, x: 395, z: 352, rot: 2, seed: 52, address: { street: MOL, house: '8', korpus: '2' }, tint: 0x8a5a44, enterable: [0], homeLight: [0] },
  et3: { series: 'p44t', floors: 17, sections: 1, x: 447, z: 352, rot: 2, seed: 53, address: { street: MOL, house: '8', korpus: '3' }, tint: 0x925f48 },
  // Block C: the very long 9-storey P-44 — 7 identical sections bent into an L: five along the
  // yard (x 466.5–594) and two more turning south along the east edge (x 585–598, z 197–248),
  // entrances numbered 1–7 from the south end of the east wing round the corner to the west end —
  // and a brick 5-storey
  c9: { series: 'p44', floors: 9, sections: 5, x: 594, z: 193, rot: 2, seed: 61, address: { street: ZAV, house: '9' }, tint: 0x4f6b8f, lampsBroken: 0.35, variants: ['a', 'b', 'a', 'a', 'b'], firstEntrance: 3, firstApartment: 73 },
  c9e: { series: 'p44', floors: 9, sections: 2, x: 585, z: 248, rot: 1, seed: 64, address: { street: ZAV, house: '9' }, tint: 0x4f6b8f, lampsBroken: 0.5, firstEntrance: 1, firstApartment: 1, variants: ['a', 'b'] },
  c5: { series: 'ii32', floors: 5, sections: 4, x: 486, z: 290, rot: 0, seed: 62, address: { street: MOL, house: '5' } },
}

// public buildings
export const PUBLIC = {
  kindergarten: { x: 390, z: 287, rot: 0, seed: 4, number: 1543 }, // site x 357.5–422.5, z 260.75–313.25, gate (390, 260.75)
  hockey: { x: 380, z: 222, rot: 1, w: 20, d: 40, seed: 3 },        // rink x 360–400, z 212–232, gate (380, 233) facing south
  shop: { x: 425, z: 470, rot: 1, seed: 7 },                        // footprint x 420–430, z 463–477, door (420, 474.5) facing west
  substation: { x: 327, z: 486, rot: 3, seed: 2, number: 2208 },    // doors face east
  garages: { x: 531, z: 155, rot: 2, count: 34, seed: 9, numberStart: 1, brick: 'white', name: 'Мотор-14' },
}

// the courtyard snow hill in Block E (top of the mound), chute running south
export const HILL = [356, 462]

// the shop's door (world), for paths and the registry
export const SHOP_DOOR = [420, 474.5]

// construction site in Block C (abandoned dug pit behind a corrugated fence)
export const SITE = {
  fence: { x0: 522, z0: 214, x1: 574, z1: 268 },  // gate gap on the west side z 238–243.5
  gate: [238, 243.5],
  pit: { x0: 531, z0: 223, x1: 565, z1: 259 },    // dug to y −1.5 with stepped slopes
  floorY: -1.5,
}

// the lone flickering lamp at the far (east) end of the long building, by the dead end
export const LONE_LAMP = [582.4, 200.5]

// landmarks for the catalog / registry
export const LANDMARKS = [
  { name: 'Block E towers (3 × P-44T, 17 floors)', x: 382, z: 345, height: 51 },
  { name: '«ПРОДУКТЫ 24 ЧАСА» shop (enterable)', x: 425, z: 470 },
  { name: 'Hockey box (Block B)', x: 380, z: 222 },
  { name: 'Kindergarten № 1543', x: 390, z: 287 },
  { name: 'Long 9-storey P-44, ул. Заводская 9 (Block C, 7 sections in an L)', x: 530, z: 186, height: 29 },
  { name: 'Abandoned construction pit (Block C)', x: 548, z: 241 },
  { name: 'Lone flickering lamp at the far end of the long building', x: 582.4, z: 200.5 },
  { name: 'Roof sign «ПРОДУКТЫ» over the shop (lit, faces west toward Block D)', x: 421.6, z: 470, height: 5.9 },
  { name: 'Brick garages ГСК «Мотор-14»', x: 531, z: 155 },
]
