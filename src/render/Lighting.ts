// Sun/moon key light with cascaded shadows + a weak hemisphere fill (IBL from the sky does most ambient work).
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import type { GraphicsSettings } from '../core/Settings';
import { CascadedSunShadow, patchSunShadowChunk } from './CascadedShadow';

export interface ShadowConfig {
  enabled: boolean;
  cascades: number;
  mapSize: number;
  distance: number;
}

export function shadowConfigFor(g: GraphicsSettings): ShadowConfig {
  switch (g.shadowQuality) {
    case 0:
      return { enabled: false, cascades: 1, mapSize: 1024, distance: 0 };
    case 1:
      return { enabled: true, cascades: 2, mapSize: 1024, distance: Math.min(g.shadowDistance, 90) };
    case 2:
      return { enabled: true, cascades: 3, mapSize: 2048, distance: g.shadowDistance };
    default:
      return { enabled: true, cascades: 4, mapSize: 2048, distance: g.shadowDistance };
  }
}

export class Lighting {
  readonly sun: SunLight;
  readonly shadow: CascadedSunShadow;
  readonly hemi: THREE.HemisphereLight;
  /** Unit vector toward the light source currently used (sun by day, moon by night). */
  readonly lightDir = new THREE.Vector3(0.3, 0.8, 0.2).normalize();
  private config: ShadowConfig = { enabled: true, cascades: 4, mapSize: 2048, distance: 250 };

  constructor(private readonly scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    patchSunShadowChunk();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCFSoft was removed (falls back with a warning)
    this.sun = new SunLight(0xffffff, 5);
    this.shadow = new CascadedSunShadow();
    this.sun.shadow = this.shadow as unknown as SunLight['shadow'];
    this.sun.castShadow = true;
    this.sun.name = 'sun';
    this.shadow.bias = -0.0004;
    this.shadow.normalBias = 0.035;
    this.shadow.radius = 2.2;
    this.shadow.camera.near = 1;
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a5236, 0.0);
    this.hemi.name = 'fill';
    scene.add(this.sun, this.hemi);
  }

  applySettings(g: GraphicsSettings): void {
    const c = shadowConfigFor(g);
    const prev = this.config;
    this.config = c;
    this.sun.castShadow = c.enabled;
    this.shadow.activeCascades = c.cascades;
    this.shadow.maxDistance = Math.max(20, c.distance);
    if (this.shadow.mapSize.x !== c.mapSize) {
      this.shadow.mapSize.set(c.mapSize, c.mapSize);
      this.shadow.map?.dispose();
      this.shadow.map = null;
    }
    if (prev.enabled !== c.enabled) this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
  }

  get shadowConfig(): ShadowConfig {
    return this.config;
  }

  /** Point the key light along `dir` (toward the light) with a linear color and intensity. */
  setKeyLight(dir: THREE.Vector3, color: THREE.Color, intensity: number, shadowStrength: number): void {
    this.lightDir.copy(dir);
    this.sun.position.copy(dir);
    this.sun.color.copy(color);
    this.sun.intensity = intensity;
    this.shadow.intensity = shadowStrength;
    // larger normal bias at grazing angles avoids acne on long slopes
    this.shadow.normalBias = 0.03 + 0.05 * (1 - Math.min(1, Math.max(0, dir.y) * 2));
  }

  setFill(sky: THREE.Color, ground: THREE.Color, intensity: number): void {
    this.hemi.color.copy(sky);
    this.hemi.groundColor.copy(ground);
    this.hemi.intensity = intensity;
  }
}
