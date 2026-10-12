// Procedural creature rigs for the eight enemy types.
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

export { createCorpseCub };
export type CorpseCub = THREE.Group;
export { createSeal, createFatSeal, createCub, createActivist, createPenguin, createBear, createTurtle, createWalrus };
