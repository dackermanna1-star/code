import type { SurfaceParams, LiquidKind } from '../terrain/surface';
import type { AtmosphereParams } from '../render/atmosphere';
import type { CloudParams } from '../render/clouds';

export type BodyKind =
  | 'barycenter' | 'star' | 'white-dwarf' | 'neutron-star' | 'black-hole' | 'brown-dwarf'
  | 'planet' | 'moon' | 'dwarf-planet' | 'asteroid' | 'comet';

export type StellarStage =
  | 'main-sequence' | 'subgiant' | 'red-giant' | 'horizontal-branch' | 'asymptotic-giant'
  | 'supergiant' | 'white-dwarf' | 'neutron-star' | 'black-hole' | 'brown-dwarf' | 'wolf-rayet';

export interface StarPhysics {
  mass: number;          // kg
  radius: number;        // m
  luminosity: number;    // W
  temperature: number;   // K (effective)
  spectralType: string;  // e.g. "G2V"
  stage: StellarStage;
  age: number;           // years
  lifetime: number;      // main-sequence lifetime, years
  metallicity: number;   // [Fe/H] dex
  rotationPeriod: number;// s
  activity: number;      // 0..1 magnetic activity (spots, flares)
  color: [number, number, number]; // linear RGB, unit luminance
  magneticField?: number;   // tesla (compact objects)
  pulsarPeriod?: number;    // s
}

export interface AtmosphereInfo {
  pressure: number;               // bar at datum
  composition: Record<string, number>; // volume fractions
  meanMolecularMass: number;      // amu
  scaleHeight: number;            // m
  greenhouseK: number;            // K warming
  hazes: string[];
}

export interface RingInfo {
  inner: number; outer: number;   // m
  opacity: number;                // 0..1 typical optical depth proxy
  color: [number, number, number];
  seed: number;
  composition: string;
}

export interface GasGiantParams {
  seed: number;
  bandColors: [number, number, number][]; // linear RGB band palette
  bandCount: number;
  turbulence: number;
  storms: number;          // 0..1
  greatSpot: number;       // 0..1 chance/size of a giant anticyclone
  haze: number;            // 0..1 high-altitude haze (ice giants: high)
  hazeColor: [number, number, number];
  glow: number;            // >0 for hot giants radiating thermally
  glowTemp: number;
}

export interface LifeInfo {
  kind: 'none' | 'prebiotic' | 'microbial' | 'simple' | 'complex';
  biochemistry: string;     // e.g. "water/carbon", "methane/azotosome (speculative)"
  pigment: string;          // dominant photosynthetic pigment description
  coverage: number;         // 0..1 of habitable land
  bioluminescence: number;  // 0..1
  oxygenated: boolean;
  fossil: boolean;          // evidence of an extinct biosphere
  notes: string;
}

export interface PlanetPhysics {
  type: 'rocky' | 'icy' | 'gas-giant' | 'ice-giant' | 'asteroid';
  classLabel: string;
  mass: number;
  radius: number;
  density: number;
  gravity: number;
  escapeVelocity: number;
  composition: { iron: number; silicate: number; ice: number; carbon: number; gas: number };
  albedo: number;
  tempEq: number;
  tempMean: number;
  tempMin: number;
  tempMax: number;
  atmosphere: AtmosphereInfo | null;
  liquid: LiquidKind;
  liquidCoverage: number;
  iceCoverage: number;
  tectonics: number;     // 0..1 present-day plate activity
  volcanism: number;     // 0..1
  surfaceAge: number;    // Gyr since last global resurfacing
  magneticField: number; // relative to Earth
  radiation: number;     // surface dose relative to Earth (rough)
  tidallyLocked: boolean;
  life: LifeInfo;
  anomalies: string[];
  surface?: SurfaceParams;
  atmosphereRender?: AtmosphereParams;
  clouds?: CloudParams;
  gasGiant?: GasGiantParams;
  rings?: RingInfo;
  knownSource?: string;  // for catalogued real objects: provenance of measured values
}
