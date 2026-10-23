import * as THREE from 'three';
import { U } from '../engine/uniforms.js';
import { Atmosphere } from './atmosphere.js';
import { Sky } from './sky.js';
import { HeightAtlas } from './terrain/heightAtlas.js';
import { TerrainMesh } from './terrain/terrainMesh.js';
import { createTerrainMaterial } from './terrain/terrainMaterial.js';
import { sunDirection, moonDirection, starRotation, moonPhaseFraction } from './astro.js';

const BASE_ALTITUDE_M = 720; // the erg floor above sea level
const MOON_STRENGTH = 1 / 650; // relative to the sun; brighter than reality so nights stay walkable

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class World {
  constructor(pipeline, quality) {
    this.pipeline = pipeline;
    this.renderer = pipeline.renderer;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;

    this.atmosphere = new Atmosphere(this.renderer);
    this.sky = new Sky(this.atmosphere);
    this.scene.add(this.sky.mesh);

    this.atlas = new HeightAtlas(this.renderer, {
      levels: quality.clipLevels,
      size: quality.clipSize,
      baseTexel: quality.clipTexel,
      shadowSteps: quality.shadowSteps,
    });
    this.terrainMaterial = createTerrainMaterial(this.atmosphere, this.atlas, quality);
    this.terrain = new TerrainMesh(this.terrainMaterial, {
      gridRes: quality.gridRes,
      leafSize: quality.leafSize,
      lodCount: quality.lodCount,
      rangeRatio: quality.rangeRatio,
    });
    this.scene.add(this.terrain.group);

    const atlasReach = (quality.clipSize / 2 - 8) * quality.clipTexel * 2 ** (quality.clipLevels - 1);
    this.viewDistance = Math.min(this.terrain.viewDistance, atlasReach);
    U.uFarFade.value.set(this.viewDistance * 0.5, this.viewDistance * 0.93);

    this.timeOfDay = 17.6;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.night = 0;
    this.exposureBias = 0;
    this.frame = 0;
    this._updateCelestial();
  }

  setTimeOfDay(hours) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
    this._updateCelestial();
    this.atlas.refreshShadows(U.uLightDir.value);
  }

  _updateCelestial() {
    sunDirection(this.timeOfDay, this.sunDir);
    moonDirection(this.timeOfDay, this.moonDir);
    U.uSunDir.value.copy(this.sunDir);
    U.uMoonDir.value.copy(this.moonDir);
    // Key light hands over from sun to moon during civil twilight.
    this.night = 1 - smoothstep(-0.11, -0.025, this.sunDir.y);
    U.uNight.value = this.night;
    U.uLightDir.value.copy(this.night > 0.5 ? this.moonDir : this.sunDir);
    starRotation(this.timeOfDay, U.uStarRotation.value);
  }

  update(dt, camera, { timeSpeed = 1, instantExposure = false } = {}) {
    this.frame++;
    U.uTime.value += dt;
    if (timeSpeed > 0) {
      this.timeOfDay = (this.timeOfDay + (dt * timeSpeed) / 60) % 24;
    }
    this._updateCelestial();
    U.uCameraAltitude.value = (BASE_ALTITUDE_M + camera.position.y) / 1000;

    U.uExposureBias.value = this.exposureBias;
    this.atmosphere.setDust(U.uDust.value);
    this.atmosphere.update(MOON_STRENGTH * (0.3 + 0.7 * moonPhaseFraction()), instantExposure ? 1 : 1 - Math.exp(-dt * 2.2));

    this.atlas.update(camera.position, U.uLightDir.value);
    this.terrain.update(camera);
    this.sky.update(camera);
    this.pipeline.post.compositeMat.uniforms.uNightGrade.value = this.night;
  }
}
