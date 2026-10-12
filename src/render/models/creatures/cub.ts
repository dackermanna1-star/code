import * as THREE from 'three';
import { createSeal } from './seal';
export const createCub = createSeal;
export function createCorpseCub(): THREE.Group { return createSeal().root; }
