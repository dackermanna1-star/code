// All the floors the elevator can stop at (ten of them, at random, each ride),
// plus the lobby and the penthouse.
import { LOBBY, PENTHOUSE } from './special.js';
import { beach, lava, disco } from './a.js';
import { hallway, kitchen, moon, gas, farm } from './b.js';

export { LOBBY, PENTHOUSE };
export const FLOORS = [beach, lava, disco, hallway, kitchen, moon, gas, farm];
