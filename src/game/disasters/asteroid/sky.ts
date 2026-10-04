/**
 * Sky and key-light effects of the asteroid, applied by wrapping the atmosphere's per-frame
 * light update at runtime (no renderer changes; idempotent, inert when nothing is registered):
 *
 *  - approach: the incoming bolide becomes a second key light. The light direction swings
 *    toward it as it brightens (shadows rotate), its blackbody colour adds to the sun, and the
 *    sky picks up a hot orange cast.
 *  - impact winter: dust dims and reddens the sun and the sky (top-of-atmosphere illuminance
 *    feeds the sky-view LUT, clouds and the sun disk), and thickens clouds and haze.
 *
 * Several asteroids may contribute: dust takes the maximum, lights add up.
 */
import * as THREE from 'three';

export interface SkySource {
  /** Impact-winter dust 0..1. */
  dust: number;
  /** World position of an incoming bolide (when `light` > 0). */
  pos: THREE.Vector3;
  /** Its illuminance at the camera (same units as the sun, ~20 at noon). */
  light: number;
  color: THREE.Color;
  /** Orange sky glow 0..1. */
  glow: number;
}

const sources = new Set<SkySource>();
const HOOK = Symbol.for('voxelcraft.asteroid.skyHook');

/** The key light before the asteroid's changes (for materials lit only by the sun). */
export const baseLight = { dir: new THREE.Vector3(0, 1, 0), color: new THREE.Color(1, 1, 1) };

export function addSkySource(): SkySource {
  const s: SkySource = { dust: 0, pos: new THREE.Vector3(), light: 0, color: new THREE.Color(1, 0.75, 0.5), glow: 0 };
  sources.add(s);
  return s;
}
export function removeSkySource(s: SkySource) {
  sources.delete(s);
}

const _d = new THREE.Vector3();
const _tint = new THREE.Vector3();

function combined() {
  let dust = 0, glow = 0;
  for (const s of sources) {
    dust = Math.max(dust, s.dust);
    glow = Math.max(glow, s.glow);
  }
  return { dust, glow };
}

/** Sun tint for a dust level (multiplier on the top-of-atmosphere illuminance). */
export function dustTint(dust: number, glow = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const k = 1 - 0.9 * dust;
  out.set(k * (1 + 0.5 * glow), k * (1 - 0.5 * dust) * (1 + 0.1 * glow), k * (1 - 0.72 * dust) * (1 - 0.35 * glow));
  return out;
}

/** Applies dust and bolide light to the atmosphere's freshly computed light. */
function adjust(atmo: any, camPos: THREE.Vector3 | null) {
  baseLight.dir.copy(atmo.lightDir);
  baseLight.color.copy(atmo.lightColor);
  if (!sources.size) return;
  const { dust, glow } = combined();
  const U = atmo.uniforms ?? {};
  const C = atmo.cloudUniforms ?? {};
  if (dust > 0 || glow > 0) {
    dustTint(dust, glow, _tint);
    (U.atmo_sunIlluminance?.value as THREE.Vector3 | undefined)?.multiply(_tint);
    (U.atmo_moonIlluminance?.value as THREE.Vector3 | undefined)?.multiply(_tint);
    (C.cl_lightIllum?.value as THREE.Vector3 | undefined)?.multiply(_tint);
    atmo.lightColor.r *= _tint.x;
    atmo.lightColor.g *= _tint.y;
    atmo.lightColor.b *= _tint.z;
    baseLight.color.copy(atmo.lightColor);
  }
  // bolides as an extra key light: weighted direction, added colour
  if (camPos) {
    const L = atmo.lightDir as THREE.Vector3;
    const c = atmo.lightColor as THREE.Color;
    const sunI = (c.r + c.g + c.b) / 3;
    _d.copy(L).multiplyScalar(sunI);
    let any = false;
    for (const s of sources) {
      if (s.light <= 1e-3) continue;
      any = true;
      const dir = new THREE.Vector3().subVectors(s.pos, camPos);
      const len = dir.length();
      if (len < 1e-3) continue;
      dir.divideScalar(len);
      _d.addScaledVector(dir, s.light);
      c.r += s.color.r * s.light;
      c.g += s.color.g * s.light;
      c.b += s.color.b * s.light;
    }
    if (any && _d.lengthSq() > 1e-8) {
      _d.normalize();
      if (_d.y < 0.06) { _d.y = 0.06; _d.normalize(); }
      L.copy(_d);
    }
  }
  U.atmo_lightColor?.value?.set?.(atmo.lightColor.r, atmo.lightColor.g, atmo.lightColor.b);
}

/** Installs the wrapper on an atmosphere instance (once). */
export function installSkyHook(atmo: any) {
  if (!atmo || atmo[HOOK]) return;
  atmo[HOOK] = true;
  const inner = atmo.updateCelestialAndLight;
  if (typeof inner === 'function') {
    // full atmosphere: adjust between the light computation and the sky LUT / cloud passes
    atmo.updateCelestialAndLight = function (p: any) {
      if (sources.size) {
        const { dust } = combined();
        if (dust > 0) p.rain = Math.max(p.rain ?? 0, 0.6 * dust); // overcast, hazy (sky only: no rain falls)
      }
      inner.call(this, p);
      adjust(this, p.cameraPosition ?? null);
    };
  } else if (typeof atmo.update === 'function') {
    // fallback atmospheres: adjust the light after the update
    const upd = atmo.update;
    atmo.update = function (p: any, cam: any, frame: number) {
      upd.call(this, p, cam, frame);
      adjust(this, p?.cameraPosition ?? null);
    };
  }
}
