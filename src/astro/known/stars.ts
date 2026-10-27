/**
 * Catalogued stars near the Sun and notable naked-eye/extreme objects, with
 * confirmed exoplanets. Values are rounded literature estimates (SIMBAD /
 * NASA Exoplanet Archive era ~2024); uncertain items are marked. Planets of
 * stars without confirmed detections are procedural and labelled
 * "hypothetical" in the UI.
 */
export interface KnownPlanet {
  name: string;
  massEarth: number;     // minimum mass for RV detections
  radiusEarth?: number;
  a: number;             // AU
  e?: number;
  status: 'confirmed' | 'candidate';
  note?: string;
}

export interface KnownStarEntry {
  id: string;
  name: string;
  ra: number;            // deg (J2000)
  dec: number;           // deg
  dist: number;          // ly
  spec: string;
  mass: number;          // M☉
  lum: number;           // L☉
  temp: number;          // K
  radius: number;        // R☉
  ageGyr?: number;
  kind?: 'star' | 'white-dwarf' | 'neutron-star' | 'black-hole';
  companion?: { name: string; spec: string; mass: number; lum: number; temp: number; radius: number; a: number; e: number; kind?: 'star' | 'white-dwarf' | 'black-hole' | 'brown-dwarf' };
  planets?: KnownPlanet[];
  note?: string;
  pulsarPeriod?: number; // s
}

export const KNOWN_STARS: KnownStarEntry[] = [
  { id: 'alphacen', name: 'Alpha Centauri', ra: 219.9, dec: -60.834, dist: 4.37, spec: 'G2V', mass: 1.1, lum: 1.52, temp: 5790, radius: 1.22, ageGyr: 5.3,
    companion: { name: 'Alpha Centauri B', spec: 'K1V', mass: 0.91, lum: 0.5, temp: 5260, radius: 0.86, a: 23.4, e: 0.52 }, note: 'Nearest Sun-like stars; planet candidates unconfirmed.' },
  { id: 'proxima', name: 'Proxima Centauri', ra: 217.429, dec: -62.68, dist: 4.244, spec: 'M5.5Ve', mass: 0.122, lum: 0.0017, temp: 3042, radius: 0.154, ageGyr: 4.85,
    planets: [
      { name: 'Proxima Centauri d', massEarth: 0.26, a: 0.0289, e: 0.04, status: 'confirmed' },
      { name: 'Proxima Centauri b', massEarth: 1.07, a: 0.0485, e: 0.02, status: 'confirmed', note: 'In the habitable zone; flare-dominated environment.' },
    ], note: 'Flare star; nearest star to the Sun.' },
  { id: 'barnard', name: "Barnard's Star", ra: 269.452, dec: 4.693, dist: 5.96, spec: 'M4V', mass: 0.144, lum: 0.0035, temp: 3134, radius: 0.196, ageGyr: 10,
    planets: [{ name: "Barnard's Star b", massEarth: 0.37, a: 0.0229, status: 'confirmed' }] },
  { id: 'wolf359', name: 'Wolf 359', ra: 164.12, dec: 7.01, dist: 7.86, spec: 'M6V', mass: 0.11, lum: 0.0014, temp: 2800, radius: 0.16, ageGyr: 0.5 },
  { id: 'lalande21185', name: 'Lalande 21185', ra: 165.83, dec: 35.97, dist: 8.31, spec: 'M2V', mass: 0.39, lum: 0.022, temp: 3550, radius: 0.39, ageGyr: 8,
    planets: [{ name: 'Lalande 21185 b', massEarth: 2.7, a: 0.079, status: 'confirmed' }] },
  { id: 'sirius', name: 'Sirius', ra: 101.287, dec: -16.716, dist: 8.6, spec: 'A1V', mass: 2.06, lum: 25.4, temp: 9940, radius: 1.71, ageGyr: 0.24,
    companion: { name: 'Sirius B', spec: 'DA2', mass: 1.02, lum: 0.056, temp: 25000, radius: 0.0084, a: 19.8, e: 0.59, kind: 'white-dwarf' }, note: 'Brightest star in Earth’s night sky.' },
  { id: 'uvceti', name: 'Luyten 726-8', ra: 24.75, dec: -17.95, dist: 8.73, spec: 'M5.5V', mass: 0.1, lum: 0.0006, temp: 2670, radius: 0.14,
    companion: { name: 'UV Ceti', spec: 'M6V', mass: 0.09, lum: 0.0004, temp: 2650, radius: 0.13, a: 5.5, e: 0.62 } },
  { id: 'ross154', name: 'Ross 154', ra: 282.46, dec: -23.84, dist: 9.7, spec: 'M3.5V', mass: 0.18, lum: 0.0038, temp: 3248, radius: 0.24 },
  { id: 'ross248', name: 'Ross 248', ra: 355.48, dec: 44.18, dist: 10.3, spec: 'M5.5V', mass: 0.136, lum: 0.0018, temp: 2799, radius: 0.16 },
  { id: 'epseri', name: 'Epsilon Eridani', ra: 53.233, dec: -9.458, dist: 10.5, spec: 'K2V', mass: 0.82, lum: 0.34, temp: 5084, radius: 0.74, ageGyr: 0.6,
    planets: [{ name: 'Epsilon Eridani b', massEarth: 210, a: 3.5, e: 0.07, status: 'confirmed', note: 'Jovian planet inside a dusty debris system.' }] },
  { id: 'lacaille9352', name: 'Lacaille 9352', ra: 346.47, dec: -35.85, dist: 10.7, spec: 'M0.5V', mass: 0.48, lum: 0.033, temp: 3688, radius: 0.47 },
  { id: 'ross128', name: 'Ross 128', ra: 176.94, dec: 0.8, dist: 11.0, spec: 'M4V', mass: 0.17, lum: 0.0036, temp: 3192, radius: 0.2, ageGyr: 9.5,
    planets: [{ name: 'Ross 128 b', massEarth: 1.4, a: 0.0496, e: 0.03, status: 'confirmed', note: 'Temperate; quiet host star.' }] },
  { id: 'procyon', name: 'Procyon', ra: 114.825, dec: 5.225, dist: 11.46, spec: 'F5IV-V', mass: 1.5, lum: 6.93, temp: 6530, radius: 2.05, ageGyr: 1.9,
    companion: { name: 'Procyon B', spec: 'DQZ', mass: 0.6, lum: 0.00049, temp: 7740, radius: 0.012, a: 15, e: 0.41, kind: 'white-dwarf' } },
  { id: '61cyg', name: '61 Cygni', ra: 316.73, dec: 38.75, dist: 11.4, spec: 'K5V', mass: 0.7, lum: 0.15, temp: 4526, radius: 0.67, ageGyr: 6,
    companion: { name: '61 Cygni B', spec: 'K7V', mass: 0.63, lum: 0.085, temp: 4077, radius: 0.6, a: 84, e: 0.49 } },
  { id: 'epsind', name: 'Epsilon Indi', ra: 330.84, dec: -56.79, dist: 11.87, spec: 'K5V', mass: 0.76, lum: 0.22, temp: 4630, radius: 0.71, ageGyr: 3.5,
    planets: [{ name: 'Epsilon Indi Ab', massEarth: 1000, a: 11.6, e: 0.26, status: 'confirmed', note: 'Cold super-Jupiter imaged directly (JWST, 2024).' }] },
  { id: 'tauceti', name: 'Tau Ceti', ra: 26.017, dec: -15.938, dist: 11.9, spec: 'G8V', mass: 0.78, lum: 0.52, temp: 5344, radius: 0.79, ageGyr: 5.8,
    planets: [
      { name: 'Tau Ceti g', massEarth: 1.75, a: 0.133, status: 'candidate' },
      { name: 'Tau Ceti h', massEarth: 1.83, a: 0.243, status: 'candidate' },
      { name: 'Tau Ceti e', massEarth: 3.9, a: 0.538, status: 'candidate' },
      { name: 'Tau Ceti f', massEarth: 3.9, a: 1.334, status: 'candidate' },
    ], note: 'Planets are radial-velocity candidates.' },
  { id: 'luyten', name: "Luyten's Star", ra: 111.85, dec: 5.23, dist: 12.35, spec: 'M3.5V', mass: 0.26, lum: 0.0088, temp: 3382, radius: 0.35,
    planets: [{ name: "Luyten's Star b", massEarth: 2.9, a: 0.091, status: 'confirmed', note: 'Habitable-zone super-Earth.' }, { name: "Luyten's Star c", massEarth: 1.2, a: 0.036, status: 'confirmed' }] },
  { id: 'teegarden', name: "Teegarden's Star", ra: 43.254, dec: 16.881, dist: 12.5, spec: 'M7V', mass: 0.097, lum: 0.00073, temp: 2904, radius: 0.107, ageGyr: 8,
    planets: [{ name: "Teegarden's Star b", massEarth: 1.05, a: 0.0252, status: 'confirmed' }, { name: "Teegarden's Star c", massEarth: 1.11, a: 0.0443, status: 'confirmed' }] },
  { id: 'kapteyn', name: "Kapteyn's Star", ra: 77.92, dec: -45.02, dist: 12.8, spec: 'sdM1', mass: 0.27, lum: 0.012, temp: 3550, radius: 0.29, ageGyr: 11.5, note: 'Halo star on a retrograde galactic orbit.' },
  { id: 'wolf1061', name: 'Wolf 1061', ra: 247.58, dec: -12.66, dist: 14.0, spec: 'M3V', mass: 0.29, lum: 0.01, temp: 3342, radius: 0.31,
    planets: [{ name: 'Wolf 1061 b', massEarth: 1.9, a: 0.038, status: 'confirmed' }, { name: 'Wolf 1061 c', massEarth: 3.4, a: 0.089, status: 'confirmed' }, { name: 'Wolf 1061 d', massEarth: 7.7, a: 0.47, status: 'confirmed' }] },
  { id: 'gj581', name: 'Gliese 581', ra: 229.86, dec: -7.72, dist: 20.5, spec: 'M3V', mass: 0.31, lum: 0.012, temp: 3480, radius: 0.3,
    planets: [{ name: 'Gliese 581 e', massEarth: 1.7, a: 0.028, status: 'confirmed' }, { name: 'Gliese 581 b', massEarth: 15.8, a: 0.041, status: 'confirmed' }, { name: 'Gliese 581 c', massEarth: 5.5, a: 0.072, status: 'confirmed' }] },
  { id: 'trappist1', name: 'TRAPPIST-1', ra: 346.622, dec: -5.041, dist: 40.7, spec: 'M8V', mass: 0.0898, lum: 0.000553, temp: 2566, radius: 0.119, ageGyr: 7.6,
    planets: [
      { name: 'TRAPPIST-1 b', massEarth: 1.374, radiusEarth: 1.116, a: 0.01154, status: 'confirmed', note: 'JWST: no thick atmosphere.' },
      { name: 'TRAPPIST-1 c', massEarth: 1.308, radiusEarth: 1.097, a: 0.0158, status: 'confirmed' },
      { name: 'TRAPPIST-1 d', massEarth: 0.388, radiusEarth: 0.788, a: 0.02227, status: 'confirmed' },
      { name: 'TRAPPIST-1 e', massEarth: 0.692, radiusEarth: 0.92, a: 0.02925, status: 'confirmed', note: 'Habitable zone.' },
      { name: 'TRAPPIST-1 f', massEarth: 1.039, radiusEarth: 1.045, a: 0.03849, status: 'confirmed', note: 'Habitable zone.' },
      { name: 'TRAPPIST-1 g', massEarth: 1.321, radiusEarth: 1.129, a: 0.04683, status: 'confirmed', note: 'Habitable zone (outer edge).' },
      { name: 'TRAPPIST-1 h', massEarth: 0.326, radiusEarth: 0.755, a: 0.06189, status: 'confirmed' },
    ], note: 'Seven Earth-sized planets in a resonant chain.' },
  { id: 'vega', name: 'Vega', ra: 279.235, dec: 38.784, dist: 25.04, spec: 'A0V', mass: 2.14, lum: 40, temp: 9600, radius: 2.36, ageGyr: 0.45, note: 'Rapid rotator seen nearly pole-on; debris disk.' },
  { id: 'fomalhaut', name: 'Fomalhaut', ra: 344.413, dec: -29.622, dist: 25.1, spec: 'A3V', mass: 1.92, lum: 16.6, temp: 8590, radius: 1.84, ageGyr: 0.44, note: 'Bright debris ring at ~140 AU.' },
  { id: 'pollux', name: 'Pollux', ra: 116.329, dec: 28.026, dist: 33.8, spec: 'K0III', mass: 1.9, lum: 32.7, temp: 4666, radius: 9.06, ageGyr: 0.7,
    planets: [{ name: 'Pollux b', massEarth: 731, a: 1.64, status: 'confirmed', note: 'Giant planet around a giant star.' }] },
  { id: 'arcturus', name: 'Arcturus', ra: 213.915, dec: 19.182, dist: 36.7, spec: 'K1.5III', mass: 1.08, lum: 170, temp: 4286, radius: 25.4, ageGyr: 7.1 },
  { id: 'capella', name: 'Capella', ra: 79.172, dec: 45.998, dist: 42.9, spec: 'G3III', mass: 2.57, lum: 78.7, temp: 4970, radius: 11.98, ageGyr: 0.59,
    companion: { name: 'Capella Ab', spec: 'G0III', mass: 2.48, lum: 72.7, temp: 5730, radius: 8.83, a: 0.74, e: 0.0 } },
  { id: 'aldebaran', name: 'Aldebaran', ra: 68.98, dec: 16.509, dist: 65.3, spec: 'K5III', mass: 1.16, lum: 439, temp: 3910, radius: 45, ageGyr: 6.4 },
  { id: 'regulus', name: 'Regulus', ra: 152.093, dec: 11.967, dist: 79.3, spec: 'B8IVn', mass: 3.8, lum: 288, temp: 12460, radius: 4.35, ageGyr: 0.05 },
  { id: 'achernar', name: 'Achernar', ra: 24.429, dec: -57.237, dist: 139, spec: 'B6Vep', mass: 6.7, lum: 3150, temp: 15000, radius: 7.3, ageGyr: 0.06, note: 'One of the most oblate stars known.' },
  { id: 'spica', name: 'Spica', ra: 201.298, dec: -11.161, dist: 250, spec: 'B1III-IV', mass: 11.4, lum: 20500, temp: 22400, radius: 7.47, ageGyr: 0.0125,
    companion: { name: 'Spica B', spec: 'B2V', mass: 7.2, lum: 1500, temp: 18500, radius: 3.64, a: 0.12, e: 0.13 } },
  { id: 'mira', name: 'Mira', ra: 34.837, dec: -2.977, dist: 300, spec: 'M7IIIe', mass: 1.2, lum: 8400, temp: 2900, radius: 330, ageGyr: 6, note: 'Pulsating AGB variable.' },
  { id: 'canopus', name: 'Canopus', ra: 95.988, dec: -52.696, dist: 310, spec: 'A9II', mass: 8, lum: 10700, temp: 7400, radius: 71, ageGyr: 0.03 },
  { id: 'polaris', name: 'Polaris', ra: 37.955, dec: 89.264, dist: 433, spec: 'F7Ib', mass: 5.4, lum: 1260, temp: 6015, radius: 37.5, ageGyr: 0.07, note: 'Cepheid variable; current pole star.' },
  { id: 'betelgeuse', name: 'Betelgeuse', ra: 88.793, dec: 7.407, dist: 548, spec: 'M1-2Ia-ab', mass: 16.5, lum: 100000, temp: 3600, radius: 764, ageGyr: 0.01, note: 'Red supergiant; future core-collapse supernova.' },
  { id: 'antares', name: 'Antares', ra: 247.352, dec: -26.432, dist: 550, spec: 'M1.5Iab', mass: 12, lum: 75900, temp: 3660, radius: 680, ageGyr: 0.012 },
  { id: 'rigel', name: 'Rigel', ra: 78.634, dec: -8.202, dist: 860, spec: 'B8Ia', mass: 21, lum: 120000, temp: 12100, radius: 78.9, ageGyr: 0.008 },
  { id: 'deneb', name: 'Deneb', ra: 310.358, dec: 45.28, dist: 2600, spec: 'A2Ia', mass: 19, lum: 196000, temp: 8525, radius: 203, ageGyr: 0.01 },
  { id: 'etacar', name: 'Eta Carinae', ra: 161.265, dec: -59.685, dist: 7500, spec: 'LBV', mass: 100, lum: 4600000, temp: 9400, radius: 240, ageGyr: 0.003,
    companion: { name: 'Eta Carinae B', spec: 'O/WR', mass: 30, lum: 500000, temp: 37000, radius: 20, a: 15.4, e: 0.9 }, note: 'Luminous blue variable binary; Great Eruption of the 1840s.' },
  { id: 'cygx1', name: 'Cygnus X-1', ra: 299.59, dec: 35.2, dist: 7200, spec: 'O9.7Iab', mass: 40.6, lum: 400000, temp: 31000, radius: 22, ageGyr: 0.005,
    companion: { name: 'Cygnus X-1 (black hole)', spec: 'BH', mass: 21.2, lum: 0, temp: 0, radius: 0, a: 0.2, e: 0.02, kind: 'black-hole' }, note: 'First widely accepted stellar black hole (X-ray binary).' },
  { id: 'crabpulsar', name: 'Crab Pulsar', ra: 83.633, dec: 22.014, dist: 6500, spec: 'NS', mass: 1.4, lum: 0, temp: 1.6e6, radius: 12 / 696340, ageGyr: 0.000971, kind: 'neutron-star', pulsarPeriod: 0.0337, note: 'Remnant of SN 1054, at the heart of the Crab Nebula.' },
  { id: 'sgra', name: 'Sagittarius A*', ra: 266.417, dec: -29.008, dist: 26670, spec: 'SMBH', mass: 4.3e6, lum: 0, temp: 0, radius: 0, kind: 'black-hole', note: 'Supermassive black hole at the Galactic Centre (EHT image 2022).' },
];

export interface KnownNebula {
  id: string;
  name: string;
  ra: number; dec: number; dist: number; // ly
  size: number;                          // ly (diameter)
  type: 'emission' | 'reflection' | 'dark' | 'planetary' | 'supernova-remnant';
  note?: string;
}

export const KNOWN_NEBULAE: KnownNebula[] = [
  { id: 'm42', name: 'Orion Nebula (M42)', ra: 83.82, dec: -5.39, dist: 1344, size: 24, type: 'emission', note: 'Nearest massive star-forming region; ionised by the Trapezium cluster.' },
  { id: 'm1', name: 'Crab Nebula (M1)', ra: 83.633, dec: 22.014, dist: 6500, size: 11, type: 'supernova-remnant', note: 'Remnant of the supernova observed in 1054 CE.' },
  { id: 'm57', name: 'Ring Nebula (M57)', ra: 283.396, dec: 33.029, dist: 2570, size: 1.3, type: 'planetary' },
  { id: 'ngc7293', name: 'Helix Nebula', ra: 337.41, dec: -20.84, dist: 650, size: 2.9, type: 'planetary' },
  { id: 'm16', name: 'Eagle Nebula (M16)', ra: 274.7, dec: -13.8, dist: 5700, size: 70, type: 'emission', note: 'Pillars of Creation.' },
  { id: 'm8', name: 'Lagoon Nebula (M8)', ra: 270.92, dec: -24.38, dist: 4100, size: 55, type: 'emission' },
  { id: 'horsehead', name: 'Horsehead Nebula (Barnard 33)', ra: 85.25, dec: -2.46, dist: 1375, size: 3.5, type: 'dark' },
  { id: 'ngc3372', name: 'Carina Nebula', ra: 161.265, dec: -59.867, dist: 7500, size: 230, type: 'emission' },
  { id: 'm45neb', name: 'Pleiades reflection nebulosity', ra: 56.75, dec: 24.12, dist: 444, size: 8, type: 'reflection' },
  { id: 'veil', name: 'Veil Nebula', ra: 312.75, dec: 30.72, dist: 2400, size: 110, type: 'supernova-remnant' },
];
