// Inter-town road network (control points; smoothed into splines by MapData).
// Asphalt highways link the towns; dirt tracks reach farms, ruins, the quarry floor and the radio tower.
// Town streets are authored in locations.ts next to the lots they serve.
import type { XZ } from './types';
import { xz } from './geometry';

export interface RoadSpec {
  name: string;
  kind: 'asphalt' | 'dirt';
  width: number;
  points: XZ[];
}

export const HIGHWAY_WIDTH = 8;
export const STREET_WIDTH = 6.5;
export const DIRT_WIDTH = 4.5;

export const HIGHWAYS: RoadSpec[] = [
  {
    name: 'A1 Zalivsk-Lipovo-Kamenka',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [
      xz(560, 520), xz(760, 570), xz(990, 585), xz(1150, 500), xz(1250, 380), xz(1440, 290), xz(1700, 320),
      xz(1940, 430), xz(2120, 600), xz(2230, 700),
    ],
  },
  {
    name: 'A2 Zalivsk-Quarry-Malinovka',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [
      xz(560, 520), xz(600, 690), xz(655, 880), xz(720, 1030), xz(800, 1160), xz(800, 1300), xz(700, 1400),
      xz(590, 1450), xz(545, 1600), xz(535, 1800), xz(590, 2010), xz(640, 2110),
    ],
  },
  {
    name: 'A3 Central (Ruins-Volodino-Teplograd)',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [
      xz(800, 1300), xz(930, 1385), xz(1075, 1420), xz(1240, 1408), xz(1380, 1400), xz(1550, 1402), xz(1760, 1470),
      xz(1990, 1570), xz(2280, 1540), xz(2470, 1465), xz(2560, 1450),
    ],
  },
  {
    name: 'A4 North-South (Lipovo-School-Volodino-Berezovka-East bridge)',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [
      xz(1250, 380), xz(1320, 560), xz(1440, 760), xz(1545, 830), xz(1530, 1030), xz(1430, 1250), xz(1380, 1400),
      xz(1420, 1600), xz(1520, 1820), xz(1640, 2020), xz(1700, 2140), xz(1860, 2240), xz(2010, 2285),
      xz(2050, 2320), xz(2050, 2460), xz(2050, 2560), xz(1920, 2650), xz(1760, 2700),
    ],
  },
  {
    name: 'A5 South (Malinovka-West bridge-Base)',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [
      xz(640, 2110), xz(820, 2190), xz(990, 2250), xz(1100, 2300), xz(1100, 2420), xz(1100, 2560), xz(1170, 2640),
      xz(1350, 2700), xz(1540, 2700),
    ],
  },
  {
    name: 'A6 Berezovka link (river bridge)',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [xz(1000, 2255), xz(1190, 2245), xz(1375, 2205), xz(1550, 2165), xz(1690, 2145)],
  },
  {
    name: 'A7 School-Kamenka',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [xz(1545, 830), xz(1800, 800), xz(2050, 760), xz(2230, 700), xz(2400, 690)],
  },
  {
    name: 'A8 East coast (Kamenka-Teplograd)',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [xz(2400, 690), xz(2460, 790), xz(2610, 850), xz(2690, 990), xz(2700, 1150), xz(2660, 1330), xz(2620, 1390)],
  },
  {
    name: 'A9 South-east (Teplograd-East bridge)',
    kind: 'asphalt',
    width: HIGHWAY_WIDTH,
    points: [xz(2600, 1530), xz(2600, 1700), xz(2470, 1900), xz(2300, 2120), xz(2120, 2250), xz(2050, 2320)],
  },
];

export const TRACKS: RoadSpec[] = [
  {
    name: 'D1 Ruins',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(800, 1210), xz(770, 1180), xz(735, 1160), xz(700, 1150)],
  },
  {
    name: 'D2 Quarry ramp',
    kind: 'dirt',
    width: 6,
    points: [xz(590, 1440), xz(560, 1395), xz(495, 1385), xz(440, 1420), xz(420, 1490)],
  },
  {
    name: 'D3 Radio tower',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(1955, 1555), xz(1985, 1440), xz(2050, 1350), xz(2000, 1270), xz(2045, 1190), xz(2052, 1160)],
  },
  {
    name: 'D4 River road',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(1440, 760), xz(1260, 880), xz(1140, 1030), xz(1110, 1200), xz(1150, 1340), xz(1240, 1408)],
  },
  {
    name: 'D5 Military perimeter',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(1170, 2640), xz(1000, 2700), xz(980, 2800), xz(1200, 2880), xz(1500, 2900), xz(1800, 2890), xz(2100, 2860), xz(2330, 2760), xz(2300, 2640), xz(2120, 2580), xz(2050, 2560)],
  },
  {
    name: 'D6 North farms',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(1700, 320), xz(1760, 480), xz(1800, 600), xz(1800, 800)],
  },
  {
    name: 'D7 West coast track',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(545, 1600), xz(400, 1660), xz(300, 1780), xz(330, 1950), xz(470, 2060), xz(590, 2010)],
  },
  {
    name: 'D8 East forest track',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(2050, 760), xz(2150, 900), xz(2350, 1000), xz(2520, 1080), xz(2690, 1100)],
  },
  {
    name: 'D9 South woods',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(1420, 1600), xz(1250, 1650), xz(1180, 1720)],
  },
  {
    name: 'D10 North coast',
    kind: 'dirt',
    width: DIRT_WIDTH,
    points: [xz(1150, 500), xz(1000, 420), xz(850, 260), xz(700, 230), xz(560, 300), xz(540, 420), xz(560, 520)],
  },
];
