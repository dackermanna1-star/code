// All thirty floors the elevator can stop at (ten of them, at random, each ride),
// plus the lobby and the penthouse.
import { LOBBY, PENTHOUSE } from './special.js';
import { beach, lava, disco } from './a.js';
import { hallway, kitchen, moon, gas, farm } from './b.js';
import { waiting, voidFloor, temple, aquarium, snow } from './c.js';
import { factory, library, arcade, dino, circus } from './d.js';
import { office, sky, candy, girders, west } from './e.js';
import { computer, tomb, bowling, mirror, minefield, museum, pizza } from './f.js';

export { LOBBY, PENTHOUSE };
export const FLOORS = [
  beach, lava, disco, hallway, kitchen, moon, gas, farm,
  waiting, voidFloor, temple, aquarium, snow,
  factory, library, arcade, dino, circus,
  office, sky, candy, girders, west,
  computer, tomb, bowling, mirror, minefield, museum, pizza,
];
