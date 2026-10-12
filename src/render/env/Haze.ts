// First-person arctic haze: one horizon colour per world direction, shared by
// the first-person sky, the distant bergs, the sea and the fog of every
// material in the scene, so whatever fades into the mist fades into exactly
// the sky behind it.
//
// three.js fog uses a single colour and view-space depth. installHazeFog()
// patches the fog shader chunks once (before any program compiles) so that
// with `scene.fog` set:
//  * the fog factor uses the true eye distance (no haze change when turning),
//  * the fog colour is the horizon colour in the fragment's world direction,
//    tone-mapped and encoded exactly like the background is.
// The classic view has no fog (scene.fog = null): USE_FOG is undefined and the
// patched chunks compile to nothing, as before.
import * as THREE from 'three';

/** Linear (pre-tone-mapping) horizon colours of the first-person sky. */
export const HORIZON = {
  /** Most of the horizon (also the colour behind you, towards +z). */
  mid: new THREE.Vector3(0.52, 0.5, 0.68),
  /** Warmer grey to the left (-x), where the classic sky is pinkish. */
  left: new THREE.Vector3(0.6, 0.54, 0.62),
  /** The bright lavender glow to the right of the iceberg (classic sky's right side). */
  right: new THREE.Vector3(0.95, 0.9, 1.3),
};

/** First-person fog density (exp2): ~25 % at 60 m, opaque past ~250 m. */
export const HAZE_DENSITY = 0.0085;

const v3 = (v: THREE.Vector3) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

/**
 * GLSL: envHorizon(dir) = linear horizon colour seen in world direction `dir`
 * (any length). Azimuth 0 looks at -z (the iceberg), positive turns to +x.
 * Periodic and smooth all the way round.
 */
export const HAZE_GLSL = /* glsl */ `
#ifndef ENV_HAZE_GLSL
#define ENV_HAZE_GLSL
float envHazeLobe(float a, float c, float w) {
  float d = mod(a - c + 3.14159265, 6.2831853) - 3.14159265;
  return exp(-(d * d) / (w * w));
}
vec3 envHorizon(vec3 dir) {
  float az = atan(dir.x, -dir.z + 1e-6);
  vec3 c = ${v3(HORIZON.mid)};
  c = mix(c, ${v3(HORIZON.left)}, envHazeLobe(az, -1.0, 0.95));
  c = mix(c, ${v3(HORIZON.right)}, 0.9 * envHazeLobe(az, 0.85, 0.7));
  return c;
}
#endif
`;

/** CPU version of envHorizon (same maths), linear colour. */
export function horizonColor(dir: { x: number; z: number }, out = new THREE.Color()): THREE.Color {
  const az = Math.atan2(dir.x, -dir.z + 1e-6);
  const lobe = (c: number, w: number) => {
    let d = (az - c + Math.PI) % (2 * Math.PI);
    if (d < 0) d += 2 * Math.PI;
    d -= Math.PI;
    return Math.exp(-(d * d) / (w * w));
  };
  const c = HORIZON.mid.clone().lerp(HORIZON.left, lobe(-1.0, 0.95)).lerp(HORIZON.right, 0.9 * lobe(0.85, 0.7));
  return out.setRGB(c.x, c.y, c.z, THREE.LinearSRGBColorSpace);
}

let installed = false;

/** Patch three.js' fog chunks (idempotent). Must run before fogged programs compile. */
export function installHazeFog(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldDir;
#endif
`;
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // World-space vector from the eye to this vertex (inverse view rotation).
  vFogWorldDir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
#endif
`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldDir;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${HAZE_GLSL}
#endif
`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogDist = length(vFogWorldDir);
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * fogDist * fogDist);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, fogDist);
  #endif
  vec3 fogHz = envHorizon(vFogWorldDir);
  #ifdef TONE_MAPPING
    fogHz = toneMapping(fogHz);
  #endif
  fogHz = linearToOutputTexel(vec4(fogHz, 1.0)).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogHz, fogFactor);
#endif
`;
}

/** The scene fog used in first person (its colour is unused by the patched chunks). */
export function createHazeFog(): THREE.FogExp2 {
  installHazeFog();
  return new THREE.FogExp2(horizonColor({ x: 0, z: -1 }).getHex(), HAZE_DENSITY);
}
