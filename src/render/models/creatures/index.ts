// Procedural creature rigs for the eight enemy types.
//
// Each rig: root origin at the feet centre, facing +X; meshes are built with
// PartBuilder per bone (shadow casting, REFLECT_LAYER). Geometry is generated
// once per kind and shared by later rigs of that kind (do not mutate it).
// animate() poses bones from the logic state (see CREATURE_STATES).
import type * as THREE from 'three';
import type { EnemyType } from '../../../config/enemies';
import type { CreatureRig } from '../types';
import { createSeal } from './seal';
import { createFatSeal } from './fatseal';
import { createCub, createCorpseCub } from './cub';
import { createActivist } from './activist';
import { createPenguin } from './penguin';
import { createBear } from './bear';
import { createTurtle } from './turtle';
import { createWalrus } from './walrus';

/** Logic states each rig animates (anything else falls back to the first). */
export const CREATURE_STATES: Record<EnemyType, readonly string[]> = {
  seal: ['walk', 'startcrawl', 'crawl'],
  fatseal: ['walk', 'stopped'],
  cub: ['walk', 'sniff', 'drop', 'held'],
  activist: ['run', 'panic', 'flee'],
  penguin: ['walk', 'glide'],
  bear: ['walk'],
  turtle: ['walk', 'hide', 'hidden', 'emerge'],
  walrus: ['walk', 'charge', 'rush', 'eat'],
};

export function createCreatureRig(type: EnemyType): CreatureRig {
  switch (type) {
    case 'seal':
      return createSeal();
    case 'fatseal':
      return createFatSeal();
    case 'cub':
      return createCub();
    case 'activist':
      return createActivist();
    case 'penguin':
      return createPenguin();
    case 'bear':
      return createBear();
    case 'turtle':
      return createTurtle();
    case 'walrus':
      return createWalrus();
  }
}

/** Static cub model (rest pose), e.g. for a cub shot out of an activist's arms. */
export function createCorpseCubModel(): THREE.Group {
  return createCorpseCub();
}

export { createCorpseCub };
export { createSeal, createFatSeal, createCub, createActivist, createPenguin, createBear, createTurtle, createWalrus };
