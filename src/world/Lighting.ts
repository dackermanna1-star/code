import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';
import { Sky } from './Sky';
import { GodRays } from './GodRays';
import { COUNTER, DOOR, GRILL, PICKUP, ROOM, WARMER } from './Layout';
import type { StructureRefs } from './Structure';
import type { DiningRefs } from './Dining';
import type { ExteriorRefs } from './Exterior';
import type { KitchenRefs } from './Kitchen';
import type { QualityPreset } from '../core/Engine';

interface SkyKey {
  h: number;
  zenith: number;
  horizon: number;
  ground: number;
  sun: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  cloud: number;
}

// Hour-keyed palette (colors in sRGB hex).
const KEYS: SkyKey[] = [
  { h: 5.0, zenith: 0x0b1633, horizon: 0x2b3a66, ground: 0x1b1d26, sun: 0xff9a5a, hemiSky: 0x3a4a7a, hemiGround: 0x1a1512, hemi: 0.25, cloud: 0x505a7a },
  { h: 7.0, zenith: 0x3f7fd0, horizon: 0xffc9a0, ground: 0x6b6259, sun: 0xffb27a, hemiSky: 0xbcd4ff, hemiGround: 0x4a3a2c, hemi: 0.65, cloud: 0xffe2cf },
  { h: 10.0, zenith: 0x3b82de, horizon: 0xcfe6ff, ground: 0x6b6259, sun: 0xfff1d8, hemiSky: 0xd6e8ff, hemiGround: 0x5a4636, hemi: 0.85, cloud: 0xffffff },
  { h: 14.0, zenith: 0x2f78d8, horizon: 0xd9ecff, ground: 0x6b6259, sun: 0xfff6e6, hemiSky: 0xdcecff, hemiGround: 0x5a4636, hemi: 0.9, cloud: 0xffffff },
  { h: 17.0, zenith: 0x3d6fc4, horizon: 0xffd6a1, ground: 0x6b5a4a, sun: 0xffc27a, hemiSky: 0xffe0c0, hemiGround: 0x5a4030, hemi: 0.75, cloud: 0xffe6c8 },
  { h: 18.6, zenith: 0x31418f, horizon: 0xff8a5c, ground: 0x4a3a33, sun: 0xff7a3a, hemiSky: 0xff9f7a, hemiGround: 0x3a2a24, hemi: 0.55, cloud: 0xff9f8a },
  { h: 19.6, zenith: 0x1b2256, horizon: 0x9a4f7a, ground: 0x2a2228, sun: 0xff6a4a, hemiSky: 0x7a5a9a, hemiGround: 0x241a1c, hemi: 0.35, cloud: 0x8a5a7a },
  { h: 20.6, zenith: 0x0a1030, horizon: 0x26305e, ground: 0x15141a, sun: 0x9ab4ff, hemiSky: 0x33406a, hemiGround: 0x16120f, hemi: 0.22, cloud: 0x3a4262 },
  { h: 24.0, zenith: 0x070b22, horizon: 0x1a2248, ground: 0x111016, sun: 0x9ab4ff, hemiSky: 0x2a355a, hemiGround: 0x120f0d, hemi: 0.18, cloud: 0x2a3050 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function lerpHex(a: number, b: number, t: number, out: THREE.Color): THREE.Color {
  tmpA.setHex(a);
  tmpB.setHex(b);
  return out.copy(tmpA).lerp(tmpB, t);
}

export class Lighting {
  readonly sky = new Sky();
  readonly godRays = new GodRays();
  readonly hemi = new THREE.HemisphereLight(0xdcecff, 0x5a4636, 0.8);
  readonly sun = new THREE.DirectionalLight(0xfff1d8, 3);
  readonly kitchenSpot = new THREE.SpotLight(0xfff4e2, 17, 8, 1.05, 0.6, 1.5);
  readonly counterSpot = new THREE.SpotLight(0xffe2b8, 16, 7, 0.9, 0.6, 1.6);
  readonly dining: THREE.PointLight[] = [];
  readonly kitchenFill = new THREE.PointLight(0xf2f6ff, 6, 10, 1.4);
  readonly pickupLamp = new THREE.PointLight(0xff6a2a, 2.2, 1.6, 2);
  readonly grillGlow = new THREE.PointLight(0xff6a1a, 0, 1.1, 2);
  readonly facadeWash = new THREE.SpotLight(0xffb870, 0, 16, 0.75, 0.7, 1.2);
  readonly streetFill = new THREE.PointLight(0xffcf96, 0, 14, 1.5);
  readonly sunDir = new THREE.Vector3(0.3, 0.6, 0.5).normalize();
  hour = 11;
  night = 0;
  private envTimer = 0;
  private lastEnvHour = -99;
  onEnvNeedsUpdate?: (night: number) => void;
  private bulbMats: THREE.MeshStandardMaterial[] = [];

  constructor(
    private scene: THREE.Scene,
    private refs: { structure: StructureRefs; dining: DiningRefs; exterior: ExteriorRefs; kitchen: KitchenRefs },
    quality: QualityPreset,
  ) {
    scene.add(this.sky.mesh);
    scene.add(this.hemi);

    // Sun
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.sun.target.position.set(0, 0, 1.5);

    // Kitchen station spotlight (crisp food shadows)
    // centred between the grill and the build station
    this.kitchenSpot.position.set(-2.2, 3.15, -4.35);
    this.kitchenSpot.target.position.set(-2.2, 0.9, -5.6);
    this.kitchenSpot.castShadow = true;
    this.kitchenSpot.shadow.bias = -0.0002;
    this.kitchenSpot.shadow.normalBias = 0.01;
    this.kitchenSpot.shadow.radius = 4;
    this.kitchenSpot.shadow.camera.near = 0.5;
    this.kitchenSpot.shadow.camera.far = 6;
    scene.add(this.kitchenSpot, this.kitchenSpot.target);

    // Counter spot: lights customers at order + pickup
    this.counterSpot.position.set(0.6, 3.1, -1.9);
    this.counterSpot.target.position.set(0.6, 1.0, 0.2);
    this.counterSpot.castShadow = quality.level !== 'low';
    this.counterSpot.shadow.bias = -0.0003;
    this.counterSpot.shadow.normalBias = 0.02;
    this.counterSpot.shadow.radius = 4;
    scene.add(this.counterSpot, this.counterSpot.target);

    // Dining pendants (a few real lights, the rest are emissive bulbs)
    const lightSpots = [
      new THREE.Vector3(-3.3, 2.0, 3.4),
      new THREE.Vector3(3.2, 2.0, 2.7),
      new THREE.Vector3(ROOM.maxX - 0.7, 2.0, 2.95),
    ];
    const count = quality.level === 'low' ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffc98a, 8, 6.5, 1.6);
      l.position.copy(lightSpots[i]);
      scene.add(l);
      this.dining.push(l);
    }
    this.kitchenFill.position.set(-1.8, 2.9, -4.2);
    scene.add(this.kitchenFill);
    this.pickupLamp.position.set(PICKUP.tray.x, PICKUP.tray.y + 0.8, PICKUP.tray.z - 0.1);
    scene.add(this.pickupLamp);
    // down in the firebox: warms the grates and the guards' lower edges without
    // a specular hot spot high on the (shiny) back guard
    this.grillGlow.position.set(GRILL.center.x, GRILL.center.y - 0.06, GRILL.center.z + 0.08);
    scene.add(this.grillGlow);
    // exterior night lighting: the sign washes the facade, street lamps fill the sidewalk
    this.facadeWash.position.set(0.3, 6.5, 10.5);
    this.facadeWash.target.position.set(0.3, 1.8, 6.3);
    scene.add(this.facadeWash, this.facadeWash.target);
    this.streetFill.position.set(-1.5, 3.8, 9.2);
    scene.add(this.streetFill);

    // God rays through the windows
    this.godRays.addWindow(new THREE.Vector3(-3.425, 1.75, ROOM.maxZ), new THREE.Vector3(1, 0, 0), 5.9, 1.6, new THREE.Vector3(0, 0, -1));
    this.godRays.addWindow(new THREE.Vector3(4.625, 1.75, ROOM.maxZ), new THREE.Vector3(1, 0, 0), 3.5, 1.6, new THREE.Vector3(0, 0, -1));
    this.godRays.addWindow(new THREE.Vector3(ROOM.maxX, 1.78, 2.95), new THREE.Vector3(0, 0, 1), 5.1, 1.5, new THREE.Vector3(-1, 0, 0));
    this.godRays.addWindow(new THREE.Vector3(DOOR.x, 1.3, ROOM.maxZ), new THREE.Vector3(1, 0, 0), 1.5, 2.0, new THREE.Vector3(0, 0, -1));
    scene.add(this.godRays.group);

    this.applyQuality(quality);
    void COUNTER;
    void WARMER;
  }

  registerBulb(mat: THREE.MeshStandardMaterial) {
    this.bulbMats.push(mat);
  }

  private shadowFrame = 0;
  /**
   * Stagger shadow-map refreshes: the sun barely moves and customers at the
   * counter are slow, so those maps re-render every 3rd / 2nd frame. The
   * kitchen spot (food being dragged and flipped) stays every frame.
   */
  tickShadows() {
    const f = ++this.shadowFrame;
    this.sun.shadow.autoUpdate = false;
    this.counterSpot.shadow.autoUpdate = false;
    if (f % 3 === 0) this.sun.shadow.needsUpdate = true;
    if (f % 2 === 0) this.counterSpot.shadow.needsUpdate = true;
  }

  applyQuality(q: QualityPreset) {
    const size = q.shadowMapSize;
    this.sun.shadow.mapSize.set(size, size);
    this.kitchenSpot.shadow.mapSize.set(Math.min(2048, size), Math.min(2048, size));
    this.counterSpot.shadow.mapSize.set(1024, 1024);
    for (const l of [this.sun, this.kitchenSpot, this.counterSpot]) {
      l.shadow.map?.dispose();
      (l.shadow as any).map = null;
      l.shadow.needsUpdate = true;
    }
  }

  /** Update sun frustum to cover the building from the current sun direction. */
  private fitSunShadow() {
    const cam = this.sun.shadow.camera;
    const center = new THREE.Vector3(0, 1.2, 1.5);
    this.sun.position.copy(center).addScaledVector(this.sunDir, 30);
    this.sun.target.position.copy(center);
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const p = new THREE.Vector3();
    // Light view space via camera matrixWorldInverse equivalent
    const lightCam = new THREE.OrthographicCamera();
    lightCam.position.copy(this.sun.position);
    lightCam.lookAt(center);
    lightCam.updateMatrixWorld();
    const toLight = lightCam.matrixWorld.clone().invert();
    for (const x of [-9, 9]) for (const y of [0, 5]) for (const z of [-6.8, 11]) {
      p.set(x, y, z).applyMatrix4(toLight);
      min.min(p);
      max.max(p);
    }
    cam.left = min.x - 0.5;
    cam.right = max.x + 0.5;
    cam.bottom = min.y - 0.5;
    cam.top = max.y + 0.5;
    cam.near = Math.max(0.1, -max.z - 2);
    cam.far = -min.z + 2;
    cam.updateProjectionMatrix();
  }

  /** Set the in-game hour (e.g. 10.5 = 10:30). */
  private lastHour = -1;
  setHour(hour: number, time: number, dt: number) {
    this.sky.uniforms.uTime.value = time;
    this.godRays.uniforms.uTime.value = time;
    if (Math.abs(hour - this.lastHour) < 0.004) return;
    this.lastHour = hour;
    this.hour = hour;
    // --- sun path: +z = south (front windows), +x = west (booth windows)
    const az = ((hour - 12.8) / 6.5) * (Math.PI * 0.55);
    const elRaw = Math.sin((Math.PI * (hour - 5.8)) / 14.0);
    const el = Math.max(-0.2, elRaw) * THREE.MathUtils.degToRad(58);
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    const sunUp = smoothstep(-0.02, 0.14, Math.sin(el));
    this.night = clamp(hour >= 12 ? smoothstep(18.4, 20.4, hour) : 1 - smoothstep(5.5, 7.2, hour));

    // --- interpolate palette
    let k0 = KEYS[0];
    let k1 = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) {
        k0 = KEYS[i];
        k1 = KEYS[i + 1];
        break;
      }
    }
    const t = clamp((hour - k0.h) / Math.max(1e-3, k1.h - k0.h));
    const u = this.sky.uniforms;
    lerpHex(k0.zenith, k1.zenith, t, u.uZenith.value);
    lerpHex(k0.horizon, k1.horizon, t, u.uHorizon.value);
    lerpHex(k0.ground, k1.ground, t, u.uGround.value);
    lerpHex(k0.sun, k1.sun, t, u.uSunColor.value);
    lerpHex(k0.cloud, k1.cloud, t, u.uCloudTint.value);
    u.uNight.value = this.night;
    u.uTime.value = time;
    // Show the moon opposite-ish after dark
    if (sunUp > 0.01) u.uSunDir.value.copy(this.sunDir);
    else u.uSunDir.value.set(-0.4, 0.55, 0.7).normalize();
    u.uSunSize.value = sunUp > 0.01 ? 1.0 : 0.6;

    lerpHex(k0.hemiSky, k1.hemiSky, t, this.hemi.color);
    lerpHex(k0.hemiGround, k1.hemiGround, t, this.hemi.groundColor);
    this.hemi.intensity = lerp(k0.hemi, k1.hemi, t) * 0.9;

    this.sun.color.copy(u.uSunColor.value);
    this.sun.intensity = 3.4 * sunUp;
    this.sun.castShadow = sunUp > 0.02;
    if (sunUp > 0.02) this.fitSunShadow();

    // --- interior & exterior practical lights
    const warm = 0.8 + this.night * 0.6;
    for (const l of this.dining) l.intensity = 7 * warm;
    this.counterSpot.intensity = 18 * (0.85 + this.night * 0.35);
    this.kitchenSpot.intensity = 17;
    for (const m of this.bulbMats) m.emissiveIntensity = 4 + this.night * 4;

    const ext = this.refs.exterior;
    const dusk = smoothstep(17.8, 19.6, hour) + (hour < 7 ? 1 : 0);
    for (const m of ext.lampMats) m.emissiveIntensity = 0.1 + clamp(dusk) * 5;
    for (const m of ext.windowMats) m.emissiveIntensity = clamp(dusk) * 1.4;
    ext.signMat.emissiveIntensity = 0.25 + clamp(dusk) * 1.2;
    ext.signNeon.color.setScalar(0.3 + clamp(dusk) * 1.8);
    this.facadeWash.intensity = clamp(dusk) * 55;
    this.streetFill.intensity = clamp(dusk) * 18;

    // --- god rays
    const rayInt = sunUp * (0.18 + 0.22 * smoothstep(0.9, 0.3, this.sunDir.y));
    this.godRays.update(this.sunDir, rayInt, this.sun.color, time);

    // --- environment map refresh at key moments (cheap PMREM regen)
    this.envTimer += dt;
    if (Math.abs(hour - this.lastEnvHour) > 0.75 && this.envTimer > 0.5) {
      this.envTimer = 0;
      this.lastEnvHour = hour;
      this.onEnvNeedsUpdate?.(this.night);
    }
  }
}
