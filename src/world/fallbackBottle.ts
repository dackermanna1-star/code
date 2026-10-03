// Simple seasoning bottle used when the detailed bottle models are unavailable.
import * as THREE from 'three';
import type { SeasoningDef } from '../food/types';
import type { BottleProp } from './props/types';

export function makeBottleFallback(def: SeasoningDef): BottleProp {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.11, 20), new THREE.MeshStandardMaterial({ color: def.kind === 'shake' ? '#f4f7fb' : def.color, roughness: 0.35 }));
  body.position.y = 0.055;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.045, 20, 1, true), new THREE.MeshStandardMaterial({ color: def.label, roughness: 0.6 }));
  label.position.y = 0.05;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.03, 16), new THREE.MeshStandardMaterial({ color: def.label, roughness: 0.4 }));
  cap.position.y = 0.125;
  root.add(body, label, cap);
  root.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { root, nozzle: new THREE.Vector3(0, 0.14, 0), height: 0.14 };
}
