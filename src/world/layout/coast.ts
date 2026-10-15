// Island outlines (authored control points, smoothed with Catmull-Rom at build time).
// Map: 3072 x 3072 m, X = east, Z = south (-Z = north). Main island + southern military island
// separated by a ~130-160 m channel, plus two small islets.
import type { CliffDef, Polygon } from './types';
import { xz } from './geometry';

/** Main island, clockwise (north edge west→east, east edge north→south, ...). */
export const MAIN_ISLAND: Polygon = [
  // north coast
  xz(300, 250), xz(470, 175), xz(700, 150), xz(930, 175), xz(1120, 140), xz(1380, 160),
  xz(1620, 125), xz(1880, 150), xz(2120, 190), xz(2360, 160), xz(2600, 240),
  // north-east cape
  xz(2790, 360), xz(2900, 560), xz(2950, 820),
  // east coast
  xz(2915, 1060), xz(2955, 1300), xz(2965, 1540), xz(2925, 1630), xz(2820, 1680), xz(2770, 1760),
  xz(2830, 1850), xz(2880, 1960),
  // south-east
  xz(2730, 2180), xz(2560, 2300), xz(2330, 2345), xz(2120, 2365),
  // south coast (channel, north shore)
  xz(1900, 2345), xz(1660, 2370), xz(1440, 2355), xz(1220, 2370), xz(1000, 2360), xz(800, 2330),
  // south-west
  xz(610, 2280), xz(430, 2170), xz(330, 2110), xz(200, 2140), xz(150, 2060), xz(230, 1960), xz(200, 1800),
  // west coast
  xz(160, 1560), xz(150, 1320), xz(185, 1090), xz(150, 900),
  // north-west bay (river mouth / port)
  xz(210, 830), xz(300, 800), xz(380, 772), xz(392, 745), xz(320, 700), xz(240, 672),
  xz(175, 600), xz(170, 470),
];

/** Southern military island. */
export const MILITARY_ISLAND: Polygon = [
  xz(920, 2530), xz(1100, 2505), xz(1330, 2520), xz(1560, 2495), xz(1800, 2510), xz(2050, 2500),
  xz(2260, 2540), xz(2420, 2620), xz(2470, 2740), xz(2400, 2860), xz(2200, 2935), xz(1950, 2965),
  xz(1680, 2950), xz(1400, 2965), xz(1160, 2930), xz(980, 2860), xz(860, 2750), xz(850, 2620),
];

/** Small rocky islets. */
export const ISLETS: Polygon[] = [
  [xz(2700, 2560), xz(2790, 2530), xz(2850, 2600), xz(2800, 2680), xz(2710, 2660)],
  [xz(330, 2480), xz(410, 2450), xz(470, 2510), xz(420, 2580), xz(340, 2560)],
];

/** Coastal cliff segments (land rises steeply at the shore). */
export const CLIFFS: CliffDef[] = [
  // north coast between Lipovo and the prison
  { points: [xz(1500, 135), xz(1700, 128), xz(1900, 150), xz(2100, 185)], height: 26, width: 45 },
  // west coast below the quarry
  { points: [xz(155, 1250), xz(150, 1400), xz(160, 1560), xz(185, 1700)], height: 22, width: 40 },
  // military island south coast
  { points: [xz(1450, 2962), xz(1700, 2950), xz(1950, 2963), xz(2200, 2935)], height: 18, width: 35 },
  // north-east cape
  { points: [xz(2790, 360), xz(2900, 560), xz(2950, 820)], height: 20, width: 40 },
];
