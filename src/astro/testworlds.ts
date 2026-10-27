/** Hand-built validation system used by tests and the renderer bring-up. */
import { Body, StarSystem } from './body';
import { AU, DAY, EARTH_MASS, G, SOLAR_LUMINOSITY, SOLAR_MASS, SOLAR_RADIUS } from '../core/constants';
import { UPos } from '../core/upos';
import { earthAtmosphere } from '../render/atmosphere';
import type { PlanetPhysics } from './types';
import type { SurfaceParams } from '../terrain/surface';

export function earthlikeSurface(seed: number, R: number): SurfaceParams {
  return {
    seed, radius: R, reliefScale: 7000, oceanFraction: 0.62, liquid: 'water',
    bimodal: 0.75, dichotomy: 0, continentFreq: 1.6, plates: 0.8, plateFreq: 1.4, mountains: 0.35,
    hills: 0.8, erosion: 0.8, roughness: 1, craters: 0.02, craterDegradation: 0.95, minCraterRadius: 400,
    volcanoes: 0.15, dunes: 0.25, canyons: 0.2, terraces: 0.2, iceCracks: 0, maria: 0, rivers: 0.5,
    tempEquator: 300, tempPole: 235, lapseRate: 0.0065, moisture: 0.7, iceCap: 0.1,
    tidallyLocked: false, substellar: [1, 0, 0], vegetation: 0.9, lifeGlow: 0, lavaGlow: 0,
    palette: {
      rockA: [0.16, 0.14, 0.12], rockB: [0.24, 0.2, 0.16], regolith: [0.22, 0.17, 0.12], sand: [0.5, 0.38, 0.24],
      highland: [0.35, 0.33, 0.3], lowland: [0.1, 0.09, 0.08], ice: [0.85, 0.88, 0.92],
      veg1: [0.04, 0.09, 0.025], veg2: [0.09, 0.12, 0.03], liquidShallow: [0.02, 0.09, 0.1], liquidDeep: [0.004, 0.014, 0.03],
      lineae: [0.3, 0.2, 0.1],
    },
  };
}

export function createTestSystem(): StarSystem {
  const sun = new Body('test:star', 'Test Star', 'star', null, SOLAR_MASS, SOLAR_RADIUS, null,
    { period: 25 * DAY, tilt: 0.12, tiltAzimuth: 0, phase0: 0, locked: false },
    {
      mass: SOLAR_MASS, radius: SOLAR_RADIUS, luminosity: SOLAR_LUMINOSITY, temperature: 5772, spectralType: 'G2V',
      stage: 'main-sequence', age: 4.6e9, lifetime: 1e10, metallicity: 0, rotationPeriod: 25 * DAY, activity: 0.4,
      color: [1.0, 0.98, 0.95],
    });
  const R = 6.371e6;
  const phys: PlanetPhysics = {
    type: 'rocky', classLabel: 'Temperate terrestrial', mass: EARTH_MASS, radius: R, density: 5514, gravity: 9.81,
    escapeVelocity: 11186, composition: { iron: 0.32, silicate: 0.67, ice: 0.01, carbon: 0, gas: 0 }, albedo: 0.3,
    tempEq: 255, tempMean: 288, tempMin: 200, tempMax: 330,
    atmosphere: { pressure: 1, composition: { N2: 0.78, O2: 0.21, Ar: 0.01 }, meanMolecularMass: 28.97, scaleHeight: 8500, greenhouseK: 33, hazes: [] },
    liquid: 'water', liquidCoverage: 0.62, iceCoverage: 0.05, tectonics: 0.8, volcanism: 0.3, surfaceAge: 0.5,
    magneticField: 1, radiation: 1, tidallyLocked: false,
    life: { kind: 'complex', biochemistry: 'water/carbon', pigment: 'chlorophyll-like', coverage: 0.6, bioluminescence: 0, oxygenated: true, fossil: true, notes: 'test' },
    anomalies: [],
    surface: earthlikeSurface(12345, R),
    atmosphereRender: earthAtmosphere(R),
    clouds: { bottom: 1500, top: 7000, coverage: 0.5, density: 0.035, scale: 7000, albedo: [0.95, 0.95, 0.95], windSpeed: 25, seed: 4242, storminess: 0.5, bands: 0.1, overcast: 0 },
  };
  const a = AU;
  new Body('test:planet', 'Testa', 'planet', sun, EARTH_MASS, R,
    { a, e: 0.0167, i: 0, node: 0, peri: 0, M0: 1.0, epoch: 0, mu: G * (SOLAR_MASS + EARTH_MASS) },
    { period: 86164, tilt: 0.41, tiltAzimuth: 0.3, phase0: 0, locked: false }, undefined, phys);
  return new StarSystem('test', 'Test System', new UPos(), sun);
}
