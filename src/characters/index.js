// Character roster. To add a character: subclass Character (see marco.js for a full
// example), give it static metadata + a `look`, and list it here.

import { Marco } from './marco.js';
import { Gary } from './gary.js';
import { Bonbon } from './bonbon.js';
import { Rosa } from './rosa.js';
import { Reginald } from './reginald.js';

export const CHARACTERS = [Marco, Gary, Bonbon, Rosa, Reginald];

export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
