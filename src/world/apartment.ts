import type { Arena } from './arena';
import type { BloodAtlas } from './bloodAtlas';
import { MapKit, MapParts } from './mapKit';
import type { Dressing } from './dressing';
import * as THREE from 'three';

export function buildApartment(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  const k = new MapKit(a, blood, pointLights, shadowMapSize);
  const mat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
  blood.patchMaterial(mat);
  k.floor(mat, [4, 4]);
  const hemi = k.hemi(0x8090b0, 0x302820, 1.4);
  const moon = k.key(0xa0b8e0, 1.6, new THREE.Vector3(-8, 16, -10));
  const dressing = { rain: new THREE.Texture(), beacon: new THREE.Sprite(), beams: new THREE.Mesh(), sparkLamp: null } as Dressing;
  return { moon, hemi, dust: k.noDust(), dressing, update: () => {} };
}
