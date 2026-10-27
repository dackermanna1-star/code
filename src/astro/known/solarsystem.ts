/**
 * The Solar System (Known Universe mode).
 *
 * Measured: orbital elements (JPL approximate J2000 elements for planets;
 * mean elements for moons — moon orbital *phases* are approximate), masses,
 * radii, rotation periods, IAU pole orientations, atmospheric pressure and
 * composition, mean temperatures, ring extents.
 * Procedural (clearly labelled in the UI): surface topography and fine
 * detail. The terrain generator is steered by each world's known geology
 * (e.g. Mars' dichotomy and Tharsis volcanoes, Europa's lineae, Titan's
 * hydrocarbon lakes) but it is not real elevation data.
 */
import { Body, StarSystem } from '../body';
import { AU, DAY, G, SOLAR_LUMINOSITY, SOLAR_MASS } from '../../core/constants';
import { generatePlanet, type Formation, type PlanetOverrides } from '../planetgen';
import { blackbodyRGB } from '../stellar';
import { visualEfficacy } from '../photometry';
import { poleFromRaDec } from './coords';
import type { OrbitElements } from '../orbit';
import type { StarPhysics } from '../types';
import type { UPos } from '../../core/upos';
import type { RGB } from '../../terrain/surface';

const DEG = Math.PI / 180;
const KM = 1000;
const SRC = 'NASA/JPL planetary fact sheets & approximate J2000 elements; IAU WGCCRE pole orientations';

function srgb(r: number, g: number, b: number): RGB {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
}

interface KnownBody {
  id: string;
  name: string;
  parent: string;
  mass: number;
  radius: number;      // m (mean)
  // planets: a(AU), e, i, L (mean longitude), varpi (lon. of perihelion), node — degrees
  // moons:   a(km),  e, i, node, peri, M0 — degrees
  el: number[];
  rotHours: number;    // sidereal; negative = retrograde; 0 = synchronous
  pole?: [number, number]; // IAU RA, Dec of north pole (deg)
  formation: Formation;
  ov?: PlanetOverrides;
  equatorial?: boolean; // moon elements referenced to the parent's equator
  kind?: 'planet' | 'moon' | 'dwarf-planet' | 'comet';
}

const SUN: StarPhysics = {
  mass: SOLAR_MASS, radius: 6.957e8, luminosity: SOLAR_LUMINOSITY, temperature: 5772, spectralType: 'G2V', stage: 'main-sequence',
  age: 4.603e9, lifetime: 1.0e10, metallicity: 0, rotationPeriod: 25.38 * DAY, activity: 0.3,
  color: blackbodyRGB(5772).map((c) => c * visualEfficacy(5772)) as [number, number, number],
};

const BODIES: KnownBody[] = [
  { id: 'mercury', name: 'Mercury', parent: 'sun', mass: 3.3011e23, radius: 2439.7 * KM, el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rotHours: 1407.5, pole: [281.01, 61.42], formation: 'rocky',
    ov: { physics: { tempMean: 440, tempMin: 100, tempMax: 700, albedo: 0.088, tidallyLocked: false }, atmosphere: null,
      surface: { craters: 0.92, maria: 0.35, canyons: 0.25, reliefScale: 4500, volcanoes: 0.05, plates: 0, dichotomy: 0 },
      palette: { regolith: srgb(0.42, 0.4, 0.38), rockA: srgb(0.3, 0.29, 0.28), lowland: srgb(0.2, 0.19, 0.18), highland: srgb(0.55, 0.53, 0.5) } } },
  { id: 'venus', name: 'Venus', parent: 'sun', mass: 4.8675e24, radius: 6051.8 * KM, el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rotHours: -5832.6, pole: [272.76, 67.16], formation: 'rocky',
    ov: { physics: { tempMean: 737, tempMin: 730, tempMax: 745, albedo: 0.76, liquid: 'none', liquidCoverage: 0, life: noLife() },
      atmosphere: { pressure: 92, composition: { CO2: 0.965, N2: 0.035, SO2: 0.00015 }, meanMolecularMass: 43.45, scaleHeight: 15900, greenhouseK: 510, hazes: ['sulfuric acid'] },
      surface: { volcanoes: 0.7, craters: 0.12, minCraterRadius: 1500, plates: 0.15, reliefScale: 5000, dunes: 0.05 },
      palette: { rockA: srgb(0.27, 0.24, 0.2), regolith: srgb(0.36, 0.3, 0.22), sand: srgb(0.4, 0.33, 0.24) } } },
  { id: 'earth', name: 'Earth', parent: 'sun', mass: 5.97237e24, radius: 6371 * KM, el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    rotHours: 23.9344696, pole: [0, 90], formation: 'rocky',
    ov: { physics: { tempMean: 288, tempMin: 184, tempMax: 330, albedo: 0.306, liquid: 'water', liquidCoverage: 0.71, iceCoverage: 0.1, tectonics: 0.9, volcanism: 0.3,
        magneticField: 1, life: { kind: 'complex', biochemistry: 'water / carbon', pigment: 'green (chlorophyll)', coverage: 0.7, bioluminescence: 0, oxygenated: true, fossil: true, notes: 'Home. ~8.7 million eukaryotic species (estimated).' } },
      atmosphere: { pressure: 1.01325, composition: { N2: 0.7808, O2: 0.2095, Ar: 0.0093, CO2: 0.00042 }, meanMolecularMass: 28.97, scaleHeight: 8500, greenhouseK: 33, hazes: [] },
      surface: { oceanFraction: 0.71, plates: 0.85, bimodal: 0.85, mountains: 0.35, volcanoes: 0.2, dunes: 0.3, terraces: 0.3, canyons: 0.2, craters: 0, tempEquator: 300, tempPole: 240, moisture: 0.7, iceCap: 0.12, vegetation: 0.75, rivers: 0.8 },
      palette: { veg1: srgb(0.13, 0.25, 0.08), veg2: srgb(0.3, 0.33, 0.12), sand: srgb(0.78, 0.66, 0.46) },
      clouds: { coverage: 0.55, bottom: 1500, top: 9000, density: 0.035, scale: 7000, windSpeed: 15, storminess: 0.6, bands: 0.1 } } },
  { id: 'mars', name: 'Mars', parent: 'sun', mass: 6.4171e23, radius: 3389.5 * KM, el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rotHours: 24.6229, pole: [317.68, 52.89], formation: 'rocky',
    ov: { physics: { tempMean: 210, tempMin: 130, tempMax: 293, albedo: 0.25, liquid: 'none', liquidCoverage: 0, iceCoverage: 0.12,
        life: { kind: 'none', biochemistry: '—', pigment: '—', coverage: 0, bioluminescence: 0, oxygenated: false, fossil: false, notes: 'No confirmed biosignatures. Ancient fluvial and lacustrine terrains record a wetter past.' } },
      atmosphere: { pressure: 0.00636, composition: { CO2: 0.9532, N2: 0.026, Ar: 0.019, O2: 0.0017 }, meanMolecularMass: 43.34, scaleHeight: 11100, greenhouseK: 5, hazes: ['dust'] },
      surface: { dichotomy: 0.85, volcanoes: 0.9, reliefScale: 16000, canyons: 0.85, craters: 0.6, dunes: 0.55, terraces: 0.4, plates: 0, iceCap: 0.25, moisture: 0.12, tempEquator: 240, tempPole: 150, oceanFraction: 0, liquid: 'none', lavaGlow: 0 },
      palette: { regolith: srgb(0.66, 0.38, 0.22), sand: srgb(0.7, 0.44, 0.26), rockA: srgb(0.36, 0.24, 0.18), rockB: srgb(0.5, 0.3, 0.2),
        highland: srgb(0.72, 0.5, 0.36), lowland: srgb(0.3, 0.2, 0.16), ice: srgb(0.95, 0.94, 0.92) } } },
  { id: 'jupiter', name: 'Jupiter', parent: 'sun', mass: 1.89819e27, radius: 69911 * KM, el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rotHours: 9.925, pole: [268.06, 64.5], formation: 'gas-giant',
    ov: { physics: { tempMean: 165, albedo: 0.343 }, rings: null,
      gasGiant: { bandColors: [srgb(0.86, 0.8, 0.7), srgb(0.72, 0.52, 0.36), srgb(0.93, 0.9, 0.84), srgb(0.62, 0.42, 0.3), srgb(0.8, 0.68, 0.54)], bandCount: 14, greatSpot: 1, storms: 0.8, haze: 0.05, turbulence: 0.9 } } },
  { id: 'saturn', name: 'Saturn', parent: 'sun', mass: 5.6834e26, radius: 58232 * KM, el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rotHours: 10.656, pole: [40.59, 83.54], formation: 'gas-giant',
    ov: { physics: { tempMean: 134, albedo: 0.342 }, rings: { inner: 74500 * KM, outer: 140220 * KM, opacity: 0.9, color: srgb(0.88, 0.82, 0.7), seed: 42, composition: 'water ice (>95%)' },
      gasGiant: { bandColors: [srgb(0.88, 0.8, 0.6), srgb(0.8, 0.7, 0.5), srgb(0.9, 0.85, 0.68), srgb(0.75, 0.66, 0.48)], bandCount: 18, greatSpot: 0, storms: 0.3, haze: 0.35, turbulence: 0.4 } } },
  { id: 'uranus', name: 'Uranus', parent: 'sun', mass: 8.681e25, radius: 25362 * KM, el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rotHours: -17.24, pole: [257.31, -15.18], formation: 'ice-giant',
    ov: { physics: { tempMean: 76, albedo: 0.3 }, rings: { inner: 41837 * KM, outer: 51149 * KM, opacity: 0.05, color: srgb(0.25, 0.25, 0.25), seed: 9, composition: 'dark, radiation-processed ices' },
      gasGiant: { bandColors: [srgb(0.6, 0.82, 0.86), srgb(0.62, 0.84, 0.87), srgb(0.58, 0.8, 0.84)], bandCount: 8, greatSpot: 0, storms: 0.1, haze: 0.85, hazeColor: srgb(0.65, 0.85, 0.88), turbulence: 0.2 } } },
  { id: 'neptune', name: 'Neptune', parent: 'sun', mass: 1.02413e26, radius: 24622 * KM, el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rotHours: 16.11, pole: [299.36, 43.46], formation: 'ice-giant',
    ov: { physics: { tempMean: 72, albedo: 0.29 }, rings: { inner: 41900 * KM, outer: 62932 * KM, opacity: 0.02, color: srgb(0.25, 0.25, 0.27), seed: 11, composition: 'dark dust' },
      gasGiant: { bandColors: [srgb(0.25, 0.42, 0.85), srgb(0.3, 0.48, 0.9), srgb(0.22, 0.38, 0.78), srgb(0.36, 0.52, 0.9)], bandCount: 10, greatSpot: 0.5, storms: 0.5, haze: 0.45, hazeColor: srgb(0.4, 0.55, 0.9), turbulence: 0.5 } } },
  { id: 'pluto', name: 'Pluto', parent: 'sun', mass: 1.303e22, radius: 1188.3 * KM, el: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rotHours: -153.29, pole: [132.99, -6.16], formation: 'icy', kind: 'dwarf-planet',
    ov: { physics: { tempMean: 44, albedo: 0.52 }, atmosphere: null,
      surface: { craters: 0.35, iceCracks: 0.2, mountains: 0.5, reliefScale: 5000, dichotomy: 0.5, maria: 0 },
      palette: { rockA: srgb(0.85, 0.78, 0.68), regolith: srgb(0.8, 0.66, 0.52), lowland: srgb(0.35, 0.2, 0.12), highland: srgb(0.95, 0.92, 0.88), sand: srgb(0.75, 0.6, 0.48) } } },
  { id: 'ceres', name: 'Ceres', parent: 'sun', mass: 9.3835e20, radius: 469.7 * KM, el: [2.7675, 0.0758, 10.594, 95.99 + 73.6 + 80.3, 73.6 + 80.3, 80.3],
    rotHours: 9.074, pole: [291.42, 66.76], formation: 'rocky', kind: 'dwarf-planet',
    ov: { physics: { tempMean: 168 }, atmosphere: null, surface: { craters: 0.85, reliefScale: 6000 }, palette: { regolith: srgb(0.24, 0.23, 0.22), rockA: srgb(0.2, 0.2, 0.2), highland: srgb(0.85, 0.85, 0.82) } } },

  // ---- moons
  { id: 'moon', name: 'Moon', parent: 'earth', mass: 7.342e22, radius: 1737.4 * KM, el: [384399, 0.0549, 5.145, 125.08, 318.15, 135.27], rotHours: 0, formation: 'rocky', kind: 'moon',
    ov: { physics: { tempMean: 250, tempMin: 100, tempMax: 390, albedo: 0.12 }, atmosphere: null,
      surface: { maria: 0.75, craters: 0.9, dichotomy: 0.45, reliefScale: 9000, volcanoes: 0.05, canyons: 0.05, plates: 0 },
      palette: { regolith: srgb(0.44, 0.42, 0.4), highland: srgb(0.62, 0.6, 0.58), lowland: srgb(0.18, 0.175, 0.17), rockA: srgb(0.32, 0.31, 0.3) } } },
  { id: 'phobos', name: 'Phobos', parent: 'mars', mass: 1.0659e16, radius: 11.27 * KM, el: [9376, 0.0151, 1.08, 0, 150, 30], rotHours: 0, formation: 'asteroid', kind: 'moon', equatorial: true,
    ov: { palette: { regolith: srgb(0.22, 0.2, 0.19), rockA: srgb(0.18, 0.17, 0.16) } } },
  { id: 'deimos', name: 'Deimos', parent: 'mars', mass: 1.4762e15, radius: 6.2 * KM, el: [23463, 0.00033, 0.93, 0, 260, 200], rotHours: 0, formation: 'asteroid', kind: 'moon', equatorial: true,
    ov: { palette: { regolith: srgb(0.28, 0.26, 0.24) } } },
  { id: 'io', name: 'Io', parent: 'jupiter', mass: 8.931938e22, radius: 1821.6 * KM, el: [421700, 0.0041, 0.05, 0, 84, 342], rotHours: 0, formation: 'rocky', kind: 'moon', equatorial: true,
    ov: { physics: { tempMean: 110, volcanism: 1, albedo: 0.63, classLabel: 'Tidally heated volcanic moon' }, atmosphere: null,
      surface: { volcanoes: 1, lavaGlow: 1, craters: 0.02, reliefScale: 7000, mountains: 0.4, maria: 0 },
      palette: { rockA: srgb(0.78, 0.66, 0.3), rockB: srgb(0.66, 0.44, 0.2), regolith: srgb(0.88, 0.8, 0.45), sand: srgb(0.85, 0.75, 0.42), highland: srgb(0.92, 0.9, 0.78), lowland: srgb(0.12, 0.1, 0.08) } } },
  { id: 'europa', name: 'Europa', parent: 'jupiter', mass: 4.799844e22, radius: 1560.8 * KM, el: [671034, 0.009, 0.47, 0, 88, 171], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { physics: { tempMean: 102, albedo: 0.67, classLabel: 'Ice-shell ocean moon' }, atmosphere: null, surface: { iceCracks: 1, craters: 0.08, reliefScale: 600, lavaGlow: 0, volcanoes: 0 },
      palette: { rockA: srgb(0.85, 0.83, 0.8), regolith: srgb(0.82, 0.78, 0.72), lineae: srgb(0.55, 0.32, 0.2), lowland: srgb(0.62, 0.5, 0.4) } } },
  { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', mass: 1.4819e23, radius: 2634.1 * KM, el: [1070412, 0.0013, 0.2, 0, 192, 317], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { physics: { tempMean: 110, albedo: 0.43, magneticField: 0.02 }, atmosphere: null, surface: { iceCracks: 0.45, craters: 0.55, dichotomy: 0.4, lavaGlow: 0, volcanoes: 0 },
      palette: { lowland: srgb(0.35, 0.32, 0.28), highland: srgb(0.75, 0.73, 0.7), rockA: srgb(0.55, 0.52, 0.48) } } },
  { id: 'callisto', name: 'Callisto', parent: 'jupiter', mass: 1.075938e23, radius: 2410.3 * KM, el: [1882709, 0.0074, 0.192, 0, 52, 181], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { physics: { tempMean: 134, albedo: 0.22 }, atmosphere: null, surface: { craters: 0.97, iceCracks: 0, reliefScale: 2500, lavaGlow: 0, volcanoes: 0 },
      palette: { regolith: srgb(0.34, 0.31, 0.28), rockA: srgb(0.3, 0.28, 0.26), highland: srgb(0.7, 0.68, 0.65) } } },
  { id: 'mimas', name: 'Mimas', parent: 'saturn', mass: 3.7493e19, radius: 198.2 * KM, el: [185539, 0.0196, 1.574, 0, 14, 255], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.95, reliefScale: 10000, iceCracks: 0, lavaGlow: 0 } } },
  { id: 'enceladus', name: 'Enceladus', parent: 'saturn', mass: 1.08022e20, radius: 252.1 * KM, el: [237948, 0.0047, 0.009, 0, 211, 197], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { physics: { albedo: 1.375 }, atmosphere: null, surface: { iceCracks: 0.8, craters: 0.35, lavaGlow: 0, volcanoes: 0 }, palette: { rockA: srgb(0.95, 0.96, 0.98), regolith: srgb(0.94, 0.95, 0.97), lineae: srgb(0.6, 0.72, 0.85) } } },
  { id: 'tethys', name: 'Tethys', parent: 'saturn', mass: 6.17449e20, radius: 531.1 * KM, el: [294619, 0.0001, 1.12, 0, 262, 190], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.85, canyons: 0.3, lavaGlow: 0 } } },
  { id: 'dione', name: 'Dione', parent: 'saturn', mass: 1.095452e21, radius: 561.4 * KM, el: [377396, 0.0022, 0.019, 0, 168, 284], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.8, iceCracks: 0.3, lavaGlow: 0 } } },
  { id: 'rhea', name: 'Rhea', parent: 'saturn', mass: 2.306518e21, radius: 763.8 * KM, el: [527108, 0.001, 0.345, 0, 256, 31], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.9, lavaGlow: 0 } } },
  { id: 'titan', name: 'Titan', parent: 'saturn', mass: 1.3452e23, radius: 2574.73 * KM, el: [1221870, 0.0288, 0.34854, 0, 180, 164], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { physics: { tempMean: 94, tempMin: 90, tempMax: 95, albedo: 0.22, liquid: 'methane', liquidCoverage: 0.03,
        life: { kind: 'none', biochemistry: '—', pigment: '—', coverage: 0, bioluminescence: 0, oxygenated: false, fossil: false, notes: 'Prebiotic organic chemistry; no confirmed life.' } },
      atmosphere: { pressure: 1.467, composition: { N2: 0.984, CH4: 0.014, H2: 0.001 }, meanMolecularMass: 27.8, scaleHeight: 40000, greenhouseK: 12, hazes: ['tholin'] },
      surface: { dunes: 0.75, craters: 0.05, minCraterRadius: 3000, reliefScale: 1500, erosion: 0.8, rivers: 0.8, oceanFraction: 0.03, liquid: 'methane', iceCracks: 0, lavaGlow: 0, volcanoes: 0.1 },
      palette: { sand: srgb(0.32, 0.22, 0.14), regolith: srgb(0.5, 0.36, 0.22), rockA: srgb(0.55, 0.45, 0.35) },
      clouds: { coverage: 0.12, bottom: 15000, top: 30000, density: 0.004, scale: 30000, windSpeed: 1, storminess: 0.05, bands: 0.4, overcast: 0 } } },
  { id: 'iapetus', name: 'Iapetus', parent: 'saturn', mass: 1.805635e21, radius: 734.5 * KM, el: [3560820, 0.0286, 15.47, 0, 275, 74], rotHours: 0, formation: 'icy', kind: 'moon',
    ov: { atmosphere: null, surface: { craters: 0.9, dichotomy: 1, lavaGlow: 0, mountains: 0.3 }, palette: { lowland: srgb(0.08, 0.06, 0.05), highland: srgb(0.85, 0.84, 0.82) } } },
  { id: 'miranda', name: 'Miranda', parent: 'uranus', mass: 6.4e19, radius: 235.8 * KM, el: [129390, 0.0013, 4.232, 0, 68, 311], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { canyons: 0.9, terraces: 0.5, craters: 0.5, reliefScale: 12000, lavaGlow: 0 } } },
  { id: 'ariel', name: 'Ariel', parent: 'uranus', mass: 1.251e21, radius: 578.9 * KM, el: [191020, 0.0012, 0.26, 0, 115, 39], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { canyons: 0.6, craters: 0.6, lavaGlow: 0 } } },
  { id: 'umbriel', name: 'Umbriel', parent: 'uranus', mass: 1.275e21, radius: 584.7 * KM, el: [266300, 0.0039, 0.205, 0, 84, 12], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.95, lavaGlow: 0 }, palette: { regolith: srgb(0.3, 0.29, 0.28), rockA: srgb(0.28, 0.27, 0.26) } } },
  { id: 'titania', name: 'Titania', parent: 'uranus', mass: 3.4e21, radius: 788.9 * KM, el: [435910, 0.0011, 0.34, 0, 284, 24], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.8, canyons: 0.5, lavaGlow: 0 } } },
  { id: 'oberon', name: 'Oberon', parent: 'uranus', mass: 3.076e21, radius: 761.4 * KM, el: [583520, 0.0014, 0.058, 0, 104, 283], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.9, lavaGlow: 0 } } },
  { id: 'triton', name: 'Triton', parent: 'neptune', mass: 2.139e22, radius: 1353.4 * KM, el: [354759, 0.000016, 156.885, 0, 344, 264], rotHours: 0, formation: 'icy', kind: 'moon',
    ov: { physics: { tempMean: 38, albedo: 0.76 }, atmosphere: null, surface: { craters: 0.15, iceCracks: 0.5, reliefScale: 1000, lavaGlow: 0, volcanoes: 0.2 },
      palette: { rockA: srgb(0.85, 0.78, 0.74), regolith: srgb(0.82, 0.72, 0.68), lowland: srgb(0.55, 0.42, 0.38), lineae: srgb(0.45, 0.35, 0.32) } } },
  { id: 'charon', name: 'Charon', parent: 'pluto', mass: 1.586e21, radius: 606 * KM, el: [19591, 0.0002, 0.08, 0, 0, 0], rotHours: 0, formation: 'icy', kind: 'moon', equatorial: true,
    ov: { atmosphere: null, surface: { craters: 0.6, canyons: 0.6, lavaGlow: 0 }, palette: { regolith: srgb(0.55, 0.53, 0.52), lowland: srgb(0.4, 0.22, 0.15) } } },
];

function noLife() {
  return { kind: 'none' as const, biochemistry: '—', pigment: '—', coverage: 0, bioluminescence: 0, oxygenated: false, fossil: false, notes: 'No biosignatures detected.' };
}

export const SOLAR_SYSTEM_ID = 'MW/known/sol';

export function buildSolarSystem(upos: UPos, systemQ: { x: number; y: number; z: number; w: number }): StarSystem {
  const sunPole = poleFromRaDec(286.13, 63.87);
  const sun = new Body(`${SOLAR_SYSTEM_ID}/sun`, 'Sun', 'star', null, SOLAR_MASS, SUN.radius, null,
    { period: SUN.rotationPeriod, tilt: sunPole.tilt, tiltAzimuth: sunPole.az, phase0: 0, locked: false }, SUN, undefined, true);
  const byId = new Map<string, Body>([['sun', sun]]);
  for (const k of BODIES) {
    const parent = byId.get(k.parent)!;
    const isMoon = k.parent !== 'sun';
    let o: OrbitElements;
    if (!isMoon) {
      const [a, e, i, L, varpi, node] = k.el;
      o = { a: a * AU, e, i: i * DEG, node: node * DEG, peri: (varpi - node) * DEG, M0: (L - varpi) * DEG, epoch: 0, mu: G * (SOLAR_MASS + k.mass) };
    } else {
      const [a, e, i, node, peri, M0] = k.el;
      o = { a: a * KM, e, i: i * DEG, node: node * DEG, peri: peri * DEG, M0: M0 * DEG, epoch: 0, mu: G * (parent.mass + k.mass) };
      if (k.equatorial) o.refQ = { x: parent.poleQ.x, y: parent.poleQ.y, z: parent.poleQ.z, w: parent.poleQ.w };
    }
    const pole = k.pole ? poleFromRaDec(k.pole[0], k.pole[1]) : { tilt: isMoon ? parent.rotation.tilt : 0, az: isMoon ? parent.rotation.tiltAzimuth : 0 };
    const sunDist = isMoon ? (parent.orbit?.a ?? AU) : o.a;
    const phys = generatePlanet({
      seed: hashId(k.id), isMoon, mass: k.mass, formation: k.formation, starLum: SOLAR_LUMINOSITY, starTemp: 5772, starMass: SOLAR_MASS,
      starAge: 4.6e9, starActivity: 0.3, starIsRemnant: false, distance: sunDist, ecc: o.e, carbonRich: false, metallicity: 0, lifeFrequency: 0,
      host: isMoon ? { mass: parent.mass, radius: parent.radius, moonA: o.a, moonE: o.e, isGiant: parent.planet?.type === 'gas-giant' || parent.planet?.type === 'ice-giant' } : undefined,
    }, {
      ...k.ov,
      physics: { radius: k.radius, mass: k.mass, gravity: (G * k.mass) / (k.radius * k.radius), escapeVelocity: Math.sqrt((2 * G * k.mass) / k.radius),
        density: k.mass / ((4 / 3) * Math.PI * k.radius ** 3), tidallyLocked: k.rotHours === 0, knownSource: SRC, ...(k.ov?.physics ?? {}) },
      surface: { ...(k.ov?.surface ?? {}), radius: k.radius },
    });
    phys.radius = k.radius;
    if (phys.surface) phys.surface.radius = k.radius;
    if (phys.atmosphereRender) {
      const d = k.radius - phys.atmosphereRender.bottomRadius;
      phys.atmosphereRender.bottomRadius += d;
      phys.atmosphereRender.topRadius += d;
    }
    const kind = k.kind ?? 'planet';
    const b = new Body(`${SOLAR_SYSTEM_ID}/${k.id}`, k.name, kind, parent, k.mass, k.radius, o,
      { period: k.rotHours === 0 ? 0 : k.rotHours * 3600, tilt: pole.tilt, tiltAzimuth: pole.az, phase0: 0, locked: k.rotHours === 0 }, undefined, phys, true);
    byId.set(k.id, b);
  }
  const sys = new StarSystem(SOLAR_SYSTEM_ID, 'Solar System', upos, sun, true);
  sys.q.set(systemQ.x, systemQ.y, systemQ.z, systemQ.w);
  sys.notes = 'Known Universe: measured orbits and bulk properties; terrain is procedural (not real elevation data).';
  sys.belts = [
    { name: 'Main asteroid belt', parent: sun, inner: 2.1 * AU, outer: 3.3 * AU, thickness: 10 * DEG, count: 15000, icy: false, seed: 1801 },
    { name: 'Kuiper belt', parent: sun, inner: 30 * AU, outer: 50 * AU, thickness: 12 * DEG, count: 15000, icy: true, seed: 1992 },
  ];
  return sys;
}

function hashId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
