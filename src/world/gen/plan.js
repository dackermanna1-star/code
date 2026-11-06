// Master plan of Millbrook County: roads, special sites and residential lots (pure 2D data).
//
//   X east, Z south. Downtown Millbrook is centred near (512, 512). I-65 runs north-south at x = 920 along the
//   east side, the river comes from the north edge through Lake Millbrook (north-west) and winds south then east.
//
// Occupancy grid values (ctx.occ):
export const OCC = { FREE: 0, ROAD: 1, LOT: 2, SITE: 3, WATER: 4, MARGIN: 5 };

export const HWY_X = 920; // highway median centre
export const RAIL_Z = 780;

// Road kinds: main (downtown main street), street (town), county (rural 2 lane), highway, dirt, ramp
// {axis, c, a0, a1, hw, sw, kind, name}
export function makeRoads() {
  const R = [];
  const add = (axis, c, a0, a1, hw, sw, kind, name, extra = {}) => R.push({ axis, c, a0, a1, hw, sw, kind, name, ...extra });
  // --- east-west
  add('x', 512, 0, 199, 3, 0, 'county', 'Route 31');
  add('x', 512, 200, 391, 4, 2, 'street', 'Main Street');
  add('x', 512, 392, 640, 5, 3, 'main', 'Main Street');
  add('x', 512, 641, 883, 4, 2, 'street', 'Main Street');
  add('x', 452, 380, 613, 3, 2, 'street', 'Church Street');
  add('x', 572, 380, 613, 3, 2, 'street', 'Market Street');
  add('x', 330, 330, 720, 3, 2, 'street', 'Elm Street');
  add('x', 330, 721, 883, 3, 0, 'county', 'Quarry Road');
  add('x', 265, 330, 700, 3, 2, 'street', 'Maple Avenue');
  add('x', 400, 266, 330, 3, 1, 'street', 'Aspen Court');
  add('x', 636, 330, 608, 3, 2, 'street', 'Sycamore Street');
  add('x', 700, 330, 608, 3, 1, 'street', 'Poplar Avenue');
  add('x', 760, 266, 883, 3, 0, 'county', 'River Road');
  add('x', 680, 612, 883, 3, 0, 'street', 'Factory Road', { industrial: true });
  add('x', 200, 362, 508, 3, 0, 'county', 'Lake Road');
  add('x', 920, 80, 508, 3, 0, 'county', 'Old Mill Road');
  // --- north-south
  add('z', 512, 0, 259, 3, 0, 'county', 'Route 9');
  add('z', 512, 260, 419, 4, 2, 'street', 'Lincoln Avenue');
  add('z', 512, 420, 600, 4, 3, 'main', 'Lincoln Avenue');
  add('z', 512, 601, 763, 4, 2, 'street', 'Lincoln Avenue');
  add('z', 512, 764, 1023, 3, 0, 'county', 'Route 9');
  add('z', 416, 330, 640, 3, 2, 'street', 'Oak Street');
  add('z', 464, 447, 577, 3, 2, 'street', 'Walnut Street');
  add('z', 560, 447, 577, 3, 2, 'street', 'Spring Street');
  add('z', 608, 447, 763, 3, 2, 'street', 'Depot Street');
  add('z', 700, 265, 330, 3, 1, 'street', 'Hickory Lane');
  add('z', 330, 265, 763, 3, 2, 'street', 'Cedar Street');
  add('z', 266, 400, 700, 3, 1, 'street', 'Willow Lane');
  add('z', 886, 292, 763, 3, 0, 'county', 'Frontage Road');
  add('z', 266, 701, 763, 3, 0, 'street', 'Willow Lane');
  return R;
}

/** Residential streets the lot packer fills (name, road filter, sides). */
export const RESIDENTIAL = [
  { name: 'Elm Street', axis: 'x', c: 330, a0: 336, a1: 716, sides: [-1, 1], area: 'Elm Street' },
  { name: 'Maple Avenue', axis: 'x', c: 265, a0: 336, a1: 696, sides: [-1, 1], area: 'Maple Avenue' },
  { name: 'Cedar Street', axis: 'z', c: 330, a0: 336, a1: 756, sides: [-1, 1], area: 'Cedar Street' },
  { name: 'Willow Lane', axis: 'z', c: 266, a0: 404, a1: 756, sides: [-1, 1], area: 'Willow Lane' },
  { name: 'Sycamore Street', axis: 'x', c: 636, a0: 336, a1: 604, sides: [-1, 1], area: 'Sycamore Street' },
  { name: 'Poplar Avenue', axis: 'x', c: 700, a0: 336, a1: 604, sides: [-1, 1], area: 'Poplar Avenue' },
  { name: 'Lincoln Avenue', axis: 'z', c: 512, a0: 268, a1: 446, sides: [-1, 1], area: 'North Lincoln' },
  { name: 'Lincoln Avenue', axis: 'z', c: 512, a0: 600, a1: 756, sides: [-1, 1], area: 'South Lincoln' },
  { name: 'Oak Street', axis: 'z', c: 416, a0: 336, a1: 446, sides: [-1, 1], area: 'Oak Street' },
  { name: 'Oak Street', axis: 'z', c: 416, a0: 580, a1: 636, sides: [-1, 1], area: 'Oak Street' },
  { name: 'Main Street', axis: 'x', c: 512, a0: 200, a1: 378, sides: [-1, 1], area: 'West Main' },
  { name: 'Depot Street', axis: 'z', c: 608, a0: 580, a1: 756, sides: [-1], area: 'Depot Street' },
  { name: 'Hickory Lane', axis: 'z', c: 700, a0: 270, a1: 326, sides: [1], area: 'Hickory Lane' },
  { name: 'Aspen Court', axis: 'x', c: 400, a0: 272, a1: 324, sides: [-1, 1], area: 'Aspen Court' },
];

/** Special sites (generator key + rect). Reserved before lots. */
export function makeSites() {
  const S = [];
  const add = (key, name, x0, z0, x1, z1, extra = {}) => S.push({ key, name, x0, z0, x1, z1, ...extra });
  // downtown blocks
  add('dt_a1', 'Downtown', 422, 458, 458, 503);
  add('dt_a2', 'Downtown', 470, 458, 504, 503);
  add('dt_a3', 'Millbrook Town Hall', 520, 458, 554, 503);
  add('dt_a4', 'Millbrook Police Department', 566, 458, 602, 503);
  add('dt_b1', 'Foodland Supermarket', 422, 521, 458, 566);
  add('dt_b2', 'Downtown', 470, 521, 504, 566);
  add('dt_b3', 'Veterans Park', 520, 521, 554, 566);
  add('dt_b4', 'Downtown', 566, 521, 602, 566);
  add('dt_w1', 'Millbrook Fire Department', 380, 458, 410, 503);
  add('dt_w2', 'Millbrook Fuel', 380, 521, 410, 566);
  add('church', "St. Mark's Church", 392, 372, 470, 446);
  add('school', 'Millbrook High School', 522, 352, 618, 446);
  add('hospital', 'Millbrook General Hospital', 626, 396, 742, 503);
  add('burger', 'Burger Barn', 752, 474, 798, 503);
  add('motel', 'Starlite Motel', 806, 430, 878, 503);
  add('carlot', 'Kentucky Motors', 622, 519, 700, 566);
  add('autoparts', 'Dollar Barn', 712, 519, 776, 562);
  add('gas_exit', 'Exit 81 Gas & Go', 794, 519, 878, 586);
  add('apartments', 'Riverside Apartments', 420, 580, 500, 628);
  add('construction', 'Construction Site', 522, 580, 600, 628);
  add('trailer', 'Pine Grove Mobile Home Park', 392, 706, 500, 754);
  add('industrial', 'Millbrook Industrial Park', 616, 594, 878, 754);
  // rural
  add('farm_hollister', 'Hollister Farm', 36, 420, 150, 503);
  add('fields_hollister', 'Hollister Farm', 36, 521, 150, 640, { fields: true });
  add('farm_dawson', 'Dawson Farm', 522, 880, 706, 990);
  add('farm_pruitt', 'Pruitt Farm', 120, 928, 290, 992);
  add('fields_pruitt', 'Pruitt Farm', 120, 848, 290, 912, { fields: true });
  add('campground', 'Lake Millbrook Campground', 300, 140, 362, 236);
  add('ranger', 'Ranger Station', 532, 64, 604, 122);
  add('fema', 'FEMA Camp', 736, 104, 880, 288);
  add('checkpoint', 'I-65 Military Checkpoint', 890, 160, 952, 236);
  add('heli', 'Crash Site', 640, 128, 692, 170, { wild: true });
  add('cabin_ne', 'Hunting Cabin', 688, 52, 720, 84, { wild: true });
  add('cabin_e', 'Hunting Cabin', 966, 598, 996, 628, { wild: true });
  add('cabin_sw', 'Hunting Cabin', 40, 736, 70, 766, { wild: true });
  add('camp_w', 'Survivor Camp', 48, 296, 66, 314, { wild: true, camp: 0 });
  add('camp_e', 'Survivor Camp', 970, 296, 988, 314, { wild: true, camp: 1 });
  add('camp_se', 'Survivor Camp', 744, 952, 762, 970, { wild: true, camp: 2 });
  add('camp_s', 'Survivor Camp', 352, 960, 370, 978, { wild: true, camp: 3 });
  add('camp_n', 'Survivor Camp', 412, 96, 430, 114, { wild: true, camp: 4 });
  add('camp_island', 'Survivor Camp', 186, 172, 200, 186, { wild: true, island: true, camp: 5 });
  add('watertower', 'Water Tower', 702, 572, 716, 586);
  return S;
}

/** Lake + river definition (used by water.js). */
export const LAKE = { cx: 205, cz: 188, rx: 92, rz: 62 };
export const ISLAND = { cx: 193, cz: 179, r: 9 };
export const RIVER = [
  [118, -10], [124, 60], [150, 128], // into the lake (north)
  [236, 244], [212, 300], [186, 360], [168, 440], [166, 520], [178, 600], [204, 668], [250, 726], [300, 770],
  [350, 806], [430, 836], [512, 852], [600, 872], [700, 888], [800, 900], [920, 908], [1040, 916],
];
