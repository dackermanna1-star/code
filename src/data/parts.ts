/**
 * Upgrade parts. Each slot has tiers 0..4 (0 = stock). Effects are
 * multipliers/additions applied to the car's base stats.
 * Prices scale with the car's tier via `priceScale` in cars (applied in Economy).
 */
import type { CarDef } from "./cars";

export type SlotId = "engine" | "fuel" | "tires" | "armor" | "booster" | "weapon";

export interface TierDef {
  name: string;
  price: number; // base price; multiplied by car price factor
  desc: string;
}

export interface SlotDef {
  id: SlotId;
  name: string;
  icon: string; // emoji/glyph used in garage cards
  tiers: TierDef[]; // index 0 = stock (price 0)
}

export const SLOTS: SlotDef[] = [
  {
    id: "engine",
    name: "Engine",
    icon: "⚙",
    tiers: [
      { name: "Stock", price: 0, desc: "It runs. Mostly." },
      { name: "Tuned", price: 400, desc: "+20% power, +10% top speed" },
      { name: "Turbo", price: 1200, desc: "+45% power, +20% top speed" },
      { name: "V8 Swap", price: 3000, desc: "+75% power, +32% top speed" },
      { name: "Supercharged", price: 6500, desc: "+110% power, +45% top speed" },
    ],
  },
  {
    id: "fuel",
    name: "Fuel Tank",
    icon: "⛽",
    tiers: [
      { name: "Stock", price: 0, desc: "Barely enough." },
      { name: "Jerry Can", price: 300, desc: "+35% fuel" },
      { name: "Long Range", price: 1000, desc: "+80% fuel" },
      { name: "Twin Tanks", price: 2600, desc: "+140% fuel" },
      { name: "Bladder Tank", price: 5500, desc: "+220% fuel" },
    ],
  },
  {
    id: "tires",
    name: "Wheels",
    icon: "◎",
    tiers: [
      { name: "Bald", price: 0, desc: "Good luck." },
      { name: "All-Terrain", price: 350, desc: "+15% grip, softer landings" },
      { name: "Off-Road", price: 1100, desc: "+30% grip, bigger wheels" },
      { name: "Monster", price: 2800, desc: "+45% grip, much bigger wheels" },
      { name: "Crawler", price: 6000, desc: "+60% grip, huge wheels" },
    ],
  },
  {
    id: "armor",
    name: "Armor",
    icon: "⛨",
    tiers: [
      { name: "None", price: 0, desc: "Factory sheet metal." },
      { name: "Plywood", price: 300, desc: "+40% health" },
      { name: "Scrap Plates", price: 1000, desc: "+90% health, ram plow" },
      { name: "Welded Steel", price: 2600, desc: "+160% health, spiked plow" },
      { name: "Reactive", price: 6000, desc: "+260% health, zombies barely slow you" },
    ],
  },
  {
    id: "booster",
    name: "Booster",
    icon: "🔥",
    tiers: [
      { name: "None", price: 0, desc: "No rocket. Sad." },
      { name: "Bottle Rocket", price: 500, desc: "Small boost" },
      { name: "Nitro", price: 1500, desc: "Strong boost, more capacity" },
      { name: "Jet Engine", price: 3800, desc: "Huge boost" },
      { name: "Afterburner", price: 7500, desc: "Absurd boost, big tank" },
    ],
  },
  {
    id: "weapon",
    name: "Weapon",
    icon: "✸",
    tiers: [
      { name: "None", price: 0, desc: "Your car is the weapon." },
      { name: "Roof Gun", price: 900, desc: "Auto-aim gun, 60 rounds" },
      { name: "Heavy Gun", price: 2500, desc: "Faster, harder, 120 rounds" },
      { name: "Flamethrower", price: 5000, desc: "Short-range fire, burns hordes" },
      { name: "Twin Flame + Gun", price: 9000, desc: "Both. Everything burns." },
    ],
  },
];

export type Loadout = Record<SlotId, number>;

export const EMPTY_LOADOUT: Loadout = { engine: 0, fuel: 0, tires: 0, armor: 0, booster: 0, weapon: 0 };

/** Final stats after applying the loadout to a car. */
export interface CarStats {
  enginePower: number;
  topSpeed: number;
  fuel: number;
  fuelPerSecond: number;
  health: number;
  grip: number;
  wheelRadius: number;
  boostForce: number; // 0 if no booster
  boostCapacity: number; // seconds
  zombieResistance: number;
  airControl: number;
  weaponTier: number;
  armorTier: number;
}

const ENGINE_POWER = [1, 1.2, 1.45, 1.75, 2.1];
const ENGINE_SPEED = [1, 1.1, 1.2, 1.32, 1.45];
const FUEL = [1, 1.35, 1.8, 2.4, 3.2];
const GRIP = [1, 1.15, 1.3, 1.45, 1.6];
const WHEEL = [1, 1.05, 1.15, 1.3, 1.45];
const HEALTH = [1, 1.4, 1.9, 2.6, 3.6];
const BOOST_FORCE = [0, 0.7, 1.0, 1.5, 2.1];
const BOOST_CAP = [0, 0.8, 1.0, 1.3, 1.7];
const ZRES = [0, 0.05, 0.1, 0.16, 0.25];

export function computeStats(car: CarDef, l: Loadout): CarStats {
  return {
    enginePower: car.enginePower * ENGINE_POWER[l.engine],
    topSpeed: car.topSpeed * ENGINE_SPEED[l.engine],
    fuel: car.fuel * FUEL[l.fuel],
    fuelPerSecond: car.fuelPerSecond * (1 + l.engine * 0.06),
    health: car.health * HEALTH[l.armor],
    grip: car.grip * GRIP[l.tires],
    wheelRadius: car.wheelRadius * WHEEL[l.tires],
    boostForce: car.boostForce * BOOST_FORCE[l.booster],
    boostCapacity: car.boostCapacity * BOOST_CAP[l.booster],
    zombieResistance: Math.min(0.98, car.zombieResistance + ZRES[l.armor]),
    airControl: car.airControl,
    weaponTier: l.weapon,
    armorTier: l.armor,
  };
}

/** Price factor so upgrades for expensive cars cost more. */
export function partPrice(car: CarDef, slot: SlotId, tier: number): number {
  const base = SLOTS.find((s) => s.id === slot)!.tiers[tier].price;
  const factor = 1 + car.price / 20000;
  return Math.round((base * factor) / 10) * 10;
}
