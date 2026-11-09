/**
 * Level / biome definitions. The road runs along +Z starting at z=0.
 * `length` is the distance in meters to the evac zone.
 */
export type BiomeId = "desert" | "suburbs" | "city" | "frozen" | "military";

export interface Palette {
  sky: string; // horizon/clear color
  skyTop: string;
  fog: string;
  ground: string; // terrain beside the road
  road: string;
  roadLine: string;
  propA: string; // primary prop color
  propB: string;
  propC: string;
  sun: string; // directional light color
  ambient: string; // hemispheric light color
  ambientGround: string;
}

export interface LevelDef {
  id: number;
  name: string;
  biome: BiomeId;
  tagline: string;
  length: number; // meters to evac
  checkpointAt: number; // meters; mid-level garage
  zombieDensity: number; // zombies per 100m at start
  zombieDensityEnd: number; // zombies per 100m near the end
  zombieTypes: Record<string, number>; // type -> spawn weight
  rampFrequency: number; // ramps per 100m (approx)
  obstacleFrequency: number; // wrecks/barricades per 100m
  survivors: number; // survivors placed along the route
  night: boolean;
  weather: "none" | "dust" | "rain" | "snow" | "ash";
  fogDensity: number;
  palette: Palette;
  reward: number; // cash for reaching evac
}

export const LEVELS: LevelDef[] = [
  {
    id: 0,
    name: "Dust Highway",
    biome: "desert",
    tagline: "Dawn. 1.6 km of cracked asphalt between you and the first safe zone.",
    length: 1600,
    checkpointAt: 800,
    zombieDensity: 4,
    zombieDensityEnd: 12,
    zombieTypes: { shambler: 10, runner: 2, bloater: 1 },
    rampFrequency: 1.1,
    obstacleFrequency: 1.2,
    survivors: 2,
    night: false,
    weather: "dust",
    fogDensity: 0.004,
    reward: 5000,
    palette: {
      sky: "#f6b26b",
      skyTop: "#3fa7b5",
      fog: "#f0c08a",
      ground: "#e0a15c",
      road: "#4a4048",
      roadLine: "#f7e7b4",
      propA: "#c85a3c",
      propB: "#7a4e8c",
      propC: "#3a8f8b",
      sun: "#ffe0b0",
      ambient: "#ffd7a8",
      ambientGround: "#7a4e8c",
    },
  },
  {
    id: 1,
    name: "Dead Suburbs",
    biome: "suburbs",
    tagline: "Picket fences, minivans, and a lot of former neighbors.",
    length: 2200,
    checkpointAt: 1100,
    zombieDensity: 7,
    zombieDensityEnd: 18,
    zombieTypes: { shambler: 10, runner: 4, bloater: 2, climber: 2 },
    rampFrequency: 1.2,
    obstacleFrequency: 1.6,
    survivors: 3,
    night: false,
    weather: "none",
    fogDensity: 0.003,
    reward: 9000,
    palette: {
      sky: "#bfe3d0",
      skyTop: "#5fa8d3",
      fog: "#cfe8dc",
      ground: "#7fb069",
      road: "#454b52",
      roadLine: "#ffffff",
      propA: "#f4a6a6",
      propB: "#f7d488",
      propC: "#a7c7e7",
      sun: "#fff4dc",
      ambient: "#e3f2ea",
      ambientGround: "#4f7a45",
    },
  },
  {
    id: 2,
    name: "Night City",
    biome: "city",
    tagline: "The lights still work. Nothing else does.",
    length: 2800,
    checkpointAt: 1400,
    zombieDensity: 10,
    zombieDensityEnd: 26,
    zombieTypes: { shambler: 10, runner: 6, bloater: 3, climber: 3, brute: 1 },
    rampFrequency: 1.3,
    obstacleFrequency: 2.0,
    survivors: 3,
    night: true,
    weather: "rain",
    fogDensity: 0.006,
    reward: 15000,
    palette: {
      sky: "#1b1f3b",
      skyTop: "#0b0d1f",
      fog: "#20244a",
      ground: "#2b2d42",
      road: "#22232e",
      roadLine: "#ffd166",
      propA: "#ff4f9a",
      propB: "#3ec7ff",
      propC: "#6b4bd8",
      sun: "#8899ff",
      ambient: "#5560a0",
      ambientGround: "#1a1030",
    },
  },
  {
    id: 3,
    name: "Frozen Pass",
    biome: "frozen",
    tagline: "Ice on the road, things in the snow.",
    length: 3400,
    checkpointAt: 1700,
    zombieDensity: 10,
    zombieDensityEnd: 28,
    zombieTypes: { shambler: 8, runner: 6, bloater: 3, climber: 4, brute: 3 },
    rampFrequency: 1.4,
    obstacleFrequency: 1.8,
    survivors: 4,
    night: false,
    weather: "snow",
    fogDensity: 0.006,
    reward: 24000,
    palette: {
      sky: "#dfe9f3",
      skyTop: "#8fb3d9",
      fog: "#e6eef6",
      ground: "#f4f7fb",
      road: "#5a6270",
      roadLine: "#ffcf5c",
      propA: "#4f6d8f",
      propB: "#c9d6e3",
      propC: "#e8743b",
      sun: "#fff6e6",
      ambient: "#dbe7f5",
      ambientGround: "#8aa0b8",
    },
  },
  {
    id: 4,
    name: "Military Blockade",
    biome: "military",
    tagline: "The evac point is behind the wall. So is everyone else.",
    length: 4000,
    checkpointAt: 2000,
    zombieDensity: 14,
    zombieDensityEnd: 36,
    zombieTypes: { shambler: 8, runner: 7, bloater: 4, climber: 4, brute: 5 },
    rampFrequency: 1.4,
    obstacleFrequency: 2.4,
    survivors: 4,
    night: false,
    weather: "ash",
    fogDensity: 0.005,
    reward: 40000,
    palette: {
      sky: "#b8a98a",
      skyTop: "#6d6a5a",
      fog: "#a89c80",
      ground: "#7d7a5c",
      road: "#3d3f3a",
      roadLine: "#e0c341",
      propA: "#5b6b4f",
      propB: "#8a8f86",
      propC: "#c0392b",
      sun: "#ffe7c2",
      ambient: "#c9bfa5",
      ambientGround: "#4a4535",
    },
  },
];
