// Surface types shared by terrain cells and colliders. Tire grip, rolling
// resistance, body sliding friction and particle hints all key off these.

export const Surface = {
  ASPHALT: 0,
  CONCRETE: 1,
  GRASS: 2,
  DIRT: 3,
  SAND: 4,
  GRAVEL: 5,
  METAL: 6,
  WOOD: 7,
  RUBBER: 8,
  ICE: 9,
  MUD: 10,
  ROCK: 11,
} as const;

export type SurfaceId = (typeof Surface)[keyof typeof Surface];

export interface SurfaceProps {
  name: string;
  /** Tire friction multiplier (1 = dry asphalt). */
  grip: number;
  /** Additional rolling resistance coefficient for tires. */
  rolling: number;
  /** Coulomb friction for sliding body nodes. */
  bodyFriction: number;
  /** Metal sliding on it produces sparks. */
  sparks: boolean;
  /** Amount of dust kicked up by wheels (0..1). */
  dust: number;
  dustColor: [number, number, number];
  /** Leaves skid marks when tires slide. */
  skidMarks: boolean;
  /** Random ground roughness amplitude in meters (felt through tires). */
  roughness: number;
  /** Deformable ground: soft surfaces absorb more on impact. */
  soft: number;
}

export const SURFACES: SurfaceProps[] = [];
SURFACES[Surface.ASPHALT] = { name: 'asphalt', grip: 1.0, rolling: 0, bodyFriction: 0.55, sparks: true, dust: 0, dustColor: [0.5, 0.5, 0.5], skidMarks: true, roughness: 0, soft: 0 };
SURFACES[Surface.CONCRETE] = { name: 'concrete', grip: 0.95, rolling: 0, bodyFriction: 0.55, sparks: true, dust: 0.05, dustColor: [0.6, 0.6, 0.58], skidMarks: true, roughness: 0, soft: 0 };
SURFACES[Surface.GRASS] = { name: 'grass', grip: 0.62, rolling: 0.04, bodyFriction: 0.45, sparks: false, dust: 0.35, dustColor: [0.42, 0.38, 0.25], skidMarks: false, roughness: 0.012, soft: 0.3 };
SURFACES[Surface.DIRT] = { name: 'dirt', grip: 0.7, rolling: 0.03, bodyFriction: 0.5, sparks: false, dust: 1.0, dustColor: [0.55, 0.45, 0.33], skidMarks: false, roughness: 0.015, soft: 0.4 };
SURFACES[Surface.SAND] = { name: 'sand', grip: 0.55, rolling: 0.09, bodyFriction: 0.6, sparks: false, dust: 1.0, dustColor: [0.78, 0.7, 0.52], skidMarks: false, roughness: 0.01, soft: 0.7 };
SURFACES[Surface.GRAVEL] = { name: 'gravel', grip: 0.68, rolling: 0.025, bodyFriction: 0.55, sparks: false, dust: 0.8, dustColor: [0.6, 0.58, 0.55], skidMarks: false, roughness: 0.02, soft: 0.25 };
SURFACES[Surface.METAL] = { name: 'metal', grip: 0.75, rolling: 0, bodyFriction: 0.35, sparks: true, dust: 0, dustColor: [0.5, 0.5, 0.5], skidMarks: false, roughness: 0, soft: 0 };
SURFACES[Surface.WOOD] = { name: 'wood', grip: 0.8, rolling: 0.005, bodyFriction: 0.5, sparks: false, dust: 0.1, dustColor: [0.5, 0.4, 0.3], skidMarks: false, roughness: 0, soft: 0.1 };
SURFACES[Surface.RUBBER] = { name: 'rubber', grip: 1.1, rolling: 0.01, bodyFriction: 0.9, sparks: false, dust: 0, dustColor: [0.2, 0.2, 0.2], skidMarks: false, roughness: 0, soft: 0.6 };
SURFACES[Surface.ICE] = { name: 'ice', grip: 0.14, rolling: 0, bodyFriction: 0.05, sparks: false, dust: 0, dustColor: [0.9, 0.95, 1], skidMarks: false, roughness: 0, soft: 0 };
SURFACES[Surface.MUD] = { name: 'mud', grip: 0.42, rolling: 0.12, bodyFriction: 0.5, sparks: false, dust: 0.6, dustColor: [0.32, 0.25, 0.17], skidMarks: false, roughness: 0.02, soft: 0.8 };
SURFACES[Surface.ROCK] = { name: 'rock', grip: 0.85, rolling: 0.01, bodyFriction: 0.6, sparks: true, dust: 0.2, dustColor: [0.5, 0.5, 0.5], skidMarks: false, roughness: 0.02, soft: 0 };
