/**
 * Zombie type definitions. Heights in meters, speeds in m/s.
 */
export type ZombieType = "shambler" | "runner" | "bloater" | "brute" | "climber";

export interface ZombieDef {
  type: ZombieType;
  health: number; // impact "force" (m/s of relative speed) needed to kill
  mass: number; // kg; affects how much it slows the car
  height: number;
  girth: number; // body width multiplier
  speed: number; // walk/run speed
  aggroRange: number; // starts chasing car within this distance
  cash: number; // payout per kill
  color: { skin: string; shirt: string; pants: string };
  explodes?: boolean; // bloater
  climbs?: boolean; // climber
}

export const ZOMBIES: Record<ZombieType, ZombieDef> = {
  shambler: {
    type: "shambler",
    health: 4,
    mass: 70,
    height: 1.75,
    girth: 1,
    speed: 0.9,
    aggroRange: 25,
    cash: 6,
    color: { skin: "#8fbf6a", shirt: "#6b7fa3", pants: "#4a4458" },
  },
  runner: {
    type: "runner",
    health: 4,
    mass: 65,
    height: 1.8,
    girth: 0.9,
    speed: 6.5,
    aggroRange: 60,
    cash: 10,
    color: { skin: "#a8c87a", shirt: "#e8743b", pants: "#33363f" },
  },
  bloater: {
    type: "bloater",
    health: 2,
    mass: 140,
    height: 1.7,
    girth: 1.8,
    speed: 0.6,
    aggroRange: 20,
    cash: 15,
    explodes: true,
    color: { skin: "#c6d65a", shirt: "#d9cfa0", pants: "#5b5040" },
  },
  brute: {
    type: "brute",
    health: 16,
    mass: 380,
    height: 2.6,
    girth: 1.7,
    speed: 1.5,
    aggroRange: 35,
    cash: 40,
    color: { skin: "#8a9a8a", shirt: "#5a5a5a", pants: "#2f2f2f" },
  },
  climber: {
    type: "climber",
    health: 3,
    mass: 55,
    height: 1.7,
    girth: 0.75,
    speed: 7.5,
    aggroRange: 45,
    cash: 12,
    climbs: true,
    color: { skin: "#d8e0c8", shirt: "#3c3c46", pants: "#2a2a30" },
  },
};
