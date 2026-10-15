// IEnvironment: time of day, weather (smooth transitions), sky, sun/moon light, fog, IBL and exposure.
import * as THREE from 'three';
import type { IEnvironment } from '../../core/contracts';
import type { WeatherKind } from '../../core/types';
import type { Lighting } from '../../render/Lighting';
import { HeightFog } from '../../render/fog';
import { moonDirection, nightFactor, sunColor, sunDirection } from './celestial';
import { SkyDome } from './SkyDome';
import { cloneWeather, fogVisibilityDistance, lerpWeather, WEATHER_PRESETS, type WeatherParams } from './weather';

const SUN_INTENSITY = 4.2;
const MOON_INTENSITY = 0.85;

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _d = { x: 0, y: 0, z: 0 };

export class Environment implements IEnvironment {
  timeOfDay = 13.5;
  weather: WeatherKind = 'clear';
  /** Hours advanced per real second (0 = frozen time, PUBG default). */
  timeSpeed = 0;
  readonly sunDirection = new THREE.Vector3(0, 1, 0);
  readonly moonDirection = new THREE.Vector3(0, 1, 0);
  /** Current (interpolated) weather parameters. */
  readonly params: WeatherParams = cloneWeather(WEATHER_PRESETS.clear);
  /** Tone-mapping exposure multiplier suggested by lighting conditions (eye adaptation). */
  exposure = 1;
  readonly fog: HeightFog;
  readonly sky: SkyDome;
  /** 0..1 night amount. */
  night = 0;
  /** Set by the water system when the camera is below the surface (dense blue-green fog). */
  underwater = false;

  private from: WeatherParams = cloneWeather(WEATHER_PRESETS.clear);
  private to: WeatherParams = cloneWeather(WEATHER_PRESETS.clear);
  private transT = 1;
  private transDur = 0;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvKey = '';
  private envTimer = 0;
  private cloudTime = 0;
  private envDirty = true;
  private _visibility = 1;
  private _fogDistance = 3000;
  readonly fogColor = new THREE.Color();
  /** Listeners notified when weather/time changes (e.g. rain, water, terrain wetness). */
  readonly onChange = new Set<() => void>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly lighting: Lighting,
    noise: THREE.Texture,
  ) {
    this.sky = new SkyDome(noise);
    this.sky.mesh.onBeforeRender = (_r, _s, cam) => this.sky.follow(cam as THREE.PerspectiveCamera);
    scene.add(this.sky.mesh);
    this.fog = new HeightFog(0x9fb0c0, 0.0003, 0.006);
    scene.fog = this.fog;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.apply(true);
  }

  get visibility(): number {
    return this._visibility;
  }

  get fogDistance(): number {
    return this._fogDistance;
  }

  setTimeOfDay(h: number): void {
    if (!Number.isFinite(h)) return; // e.g. a malformed ?time= flag: keep the current time instead of NaN lighting
    this.timeOfDay = ((h % 24) + 24) % 24;
    this.envDirty = true;
    this.apply(false);
  }

  /** Change weather. `transitionSeconds` > 0 blends smoothly (default instant, e.g. at match start). */
  setWeather(w: WeatherKind, transitionSeconds = 0): void {
    if (!WEATHER_PRESETS[w]) return;
    this.weather = w;
    this.from = cloneWeather(this.params);
    this.to = cloneWeather(WEATHER_PRESETS[w]);
    this.transDur = Math.max(0, transitionSeconds);
    this.transT = this.transDur > 0 ? 0 : 1;
    if (this.transDur === 0) lerpWeather(this.from, this.to, 1, this.params);
    this.envDirty = true;
    this.apply(this.transDur === 0);
    for (const f of this.onChange) f();
  }

  /** Switch the underwater look (fog) immediately, e.g. when the camera crosses the water surface. */
  setUnderwater(on: boolean): void {
    if (on === this.underwater) return;
    this.underwater = on;
    this.apply(false);
  }

  update(dt: number): void {
    if (!Number.isFinite(this.timeSpeed)) this.timeSpeed = 0;
    if (this.timeSpeed !== 0) {
      this.timeOfDay = (this.timeOfDay + this.timeSpeed * dt + 24) % 24;
      this.envDirty = true;
    }
    if (this.transT < 1) {
      this.transT = Math.min(1, this.transT + dt / Math.max(1e-3, this.transDur));
      const t = this.transT * this.transT * (3 - 2 * this.transT);
      lerpWeather(this.from, this.to, t, this.params);
      this.envDirty = true;
    }
    this.cloudTime += dt;
    this.sky.uniforms.uCloudTime.value = this.cloudTime;
    this.apply(false);
    // throttled IBL refresh
    this.envTimer -= dt;
    if (this.envDirty && this.envTimer <= 0) this.refreshEnvMap(false);
  }

  /** Recompute lights, fog and sky uniforms from time + weather. */
  private apply(forceEnv: boolean): void {
    const p = this.params;
    sunDirection(this.timeOfDay, _d);
    this.sunDirection.set(_d.x, _d.y, _d.z);
    moonDirection(this.timeOfDay, _d);
    this.moonDirection.set(_d.x, _d.y, _d.z);
    const sunY = this.sunDirection.y;
    const night = nightFactor(sunY);
    this.night = night;

    // key light: sun by day, moon by night (swap when both are dim)
    sunColor(sunY, _d);
    const sunCol = _c.setRGB(_d.x, _d.y, _d.z);
    const sunUp = THREE.MathUtils.smoothstep(sunY, -0.035, 0.1);
    const sunI = SUN_INTENSITY * sunUp * (0.55 + 0.45 * THREE.MathUtils.smoothstep(sunY, 0.0, 0.3)) * p.sunIntensity;
    const moonI = MOON_INTENSITY * night * (1 - p.cloudCover * 0.7);
    if (sunI >= moonI) {
      this.lighting.setKeyLight(this.sunDirection, sunCol, sunI, p.shadowStrength * Math.min(1, 0.4 + sunUp));
    } else {
      this.lighting.setKeyLight(this.moonDirection, _c2.setRGB(0.55, 0.66, 0.95), moonI, 0.55 * p.shadowStrength + 0.2);
    }

    // sky uniforms
    const u = this.sky.uniforms;
    u.uSunDir.value.copy(this.sunDirection);
    u.uMoonDir.value.copy(this.moonDirection);
    u.uSunColor.value.copy(sunCol).multiplyScalar(sunUp * 0.5);
    u.uTurbidity.value = p.turbidity;
    u.uSkyIntensity.value = p.skyIntensity;
    u.uSkyGrey.value = p.skyGrey;
    u.uNight.value = night;
    u.uCloudCover.value = p.cloudCover;
    u.uCloudDark.value = p.cloudDarkness;
    u.uStars.value = night;
    u.uSunDisc.value = Math.max(0, 1 - p.cloudCover * 1.05) * p.sunIntensity;
    u.uWind.value.set(1, 0.35).normalize().multiplyScalar((p.wind * 0.6) / 9000);

    // fog: color follows the sky near the horizon
    const day = _c2.setRGB(0.56, 0.66, 0.8).multiplyScalar(0.62);
    const golden = this.fogColor.setRGB(0.8, 0.6, 0.45).multiplyScalar(0.5);
    const g = THREE.MathUtils.smoothstep(sunY, 0.02, 0.32);
    golden.lerp(day, g);
    const nightCol = _c2.setRGB(0.012, 0.016, 0.028);
    golden.lerp(nightCol, night);
    const grey = (golden.r + golden.g + golden.b) / 3;
    golden.lerp(_c2.setRGB(grey, grey, grey * 1.04), p.skyGrey * 0.85);
    golden.multiplyScalar(p.skyIntensity);
    this.fog.color.copy(golden);
    this.fog.density = p.fogDensity;
    this.fog.falloff = p.fogFalloff;
    if (this.underwater) {
      const lum = (1 - night * 0.9) * p.skyIntensity;
      this.fog.color.setRGB(0.02, 0.075, 0.08).multiplyScalar(lum * 1.4);
      this.fog.density = 0.11;
      this.fog.falloff = 0.0001;
    }
    u.uFogColor.value.copy(golden);
    u.uFogDensity.value = p.fogDensity;
    u.uFogFalloff.value = p.fogFalloff;

    // weak hemisphere fill (mainly so moonlit nights are readable)
    this.lighting.setFill(_c.setRGB(0.4, 0.5, 0.75), _c2.setRGB(0.12, 0.13, 0.1), 0.22 * night + 0.02);

    // eye adaptation: the scattering sky dims ~10x toward sunset; compensate partially (sqrt), plus nights and
    // gloomy weather
    const sunE = 1000 * Math.max(0, 1 - Math.exp(-(1.6110731556870734 - Math.acos(THREE.MathUtils.clamp(sunY, -1, 1))) / 1.5));
    const dayAdapt = THREE.MathUtils.clamp(Math.pow(560 / Math.max(sunE, 1), 0.36), 1, 2.6);
    this.exposure = Math.max(dayAdapt, THREE.MathUtils.lerp(1, 4.0, night)) * (1 + (1 - p.skyIntensity) * 0.6);

    // AI visibility & fog distance
    this._fogDistance = fogVisibilityDistance(p);
    const light = THREE.MathUtils.lerp(1, 0.28 + 0.1 * (1 - p.cloudCover), night);
    this._visibility = Math.max(0.1, Math.min(1, light * (1 - p.rain * 0.2) * THREE.MathUtils.clamp(this._fogDistance / 1200, 0.35, 1)));

    if (forceEnv) this.refreshEnvMap(true);
  }

  /** Re-bake the IBL from the current sky (throttled unless forced). */
  refreshEnvMap(force: boolean): void {
    const key = `${this.sunDirection.x.toFixed(2)},${this.sunDirection.y.toFixed(2)},${this.params.cloudCover.toFixed(2)},${this.params.skyGrey.toFixed(2)},${this.params.skyIntensity.toFixed(2)},${this.night.toFixed(2)}`;
    this.envDirty = false;
    if (!force && key === this.lastEnvKey) return;
    this.lastEnvKey = key;
    this.envTimer = 1.5;
    const prevCam = this.sky.uniforms.uCamPos.value.clone();
    this.sky.uniforms.uCamPos.value.set(prevCam.x, Math.max(2, prevCam.y), prevCam.z);
    const disc = this.sky.uniforms.uSunDisc.value;
    this.sky.uniforms.uSunDisc.value = 0; // the key light provides the sun's specular; avoid IBL fireflies
    const rt = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 200, { size: 128 });
    this.sky.uniforms.uSunDisc.value = disc;
    this.sky.uniforms.uCamPos.value.copy(prevCam);
    const old = this.envRT;
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 1;
    old?.dispose();
    for (const f of this.onChange) f();
  }

  dispose(): void {
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
