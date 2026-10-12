// Overcast sky dome and backdrop sea.
//
// The sky is a large sphere around the backdrop camera with a procedural
// stratus shader: lavender-grey, horizontal cloud streaks (fbm in azimuth /
// elevation space, domain-warped), brighter towards the horizon and on the
// right. The same shader with ENV_MODE renders a cloudless gradient sphere for
// the PMREM environment map. All colours are linear, pre-tone-mapping (the
// main pass applies ACES).
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTop, uHorizon, uHorizonR, uHorizonL, uDark, uLight, uSea, uSeaFar;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  vec3 skyGradient(float el, float az) {
    float k = smoothstep(0.0, 0.16, el);
    vec3 hz = mix(uHorizonL, uHorizon, smoothstep(-0.25, 0.0, az));
    hz = mix(hz, uHorizonR, smoothstep(0.02, 0.2, az));
    return mix(hz, uTop, k);
  }
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    float el = d.y;
    float az = atan(d.x, -d.z);
#ifdef ENV_MODE
    vec3 c;
    if (el >= 0.0) {
      c = mix(uHorizon, uTop * 0.85, smoothstep(0.0, 0.6, el));
    } else {
      c = mix(uSeaFar, uSea, smoothstep(0.0, -0.35, el));
    }
    gl_FragColor = vec4(c, 1.0);
#else
    vec3 base = skyGradient(el, az);
    // Stratus streaks: coordinates in azimuth / elevation, stretched horizontally.
    vec2 q = vec2(az * 6.0 + uTime * 0.01, el * 36.0);
    vec2 w = vec2(envFbm3(q * vec2(0.35, 0.8) + 3.7), envFbm3(q * vec2(0.35, 0.8) + 9.1));
    q += (w - 0.5) * vec2(1.6, 1.1);
    float n = envFbm(q * vec2(0.55, 1.5));
    float fine = envFbm(q * vec2(1.6, 8.0) + 5.0);
    float streak = envFbm3(q * vec2(4.0, 22.0) + 11.0);
    float cloud = n + (fine - 0.5) * 0.7 + (streak - 0.5) * 0.25;
    float dark = smoothstep(0.46, 0.64, cloud);
    float light = smoothstep(0.42, 0.26, cloud);
    // Fewer dark clouds near the horizon and on the bright right side.
    float hz = 1.0 - smoothstep(0.0, 0.045, el);
    dark *= 1.0 - 0.7 * hz;
    dark *= 1.0 - 0.5 * smoothstep(0.08, 0.2, az) * (1.0 - smoothstep(0.03, 0.1, el));
    vec3 c = base;
    c = mix(c, uLight * (0.85 + 0.3 * streak), light * 0.75);
    c = mix(c, uDark * (0.75 + 0.5 * streak), dark * 0.9);
    gl_FragColor = vec4(c, 1.0);
#endif
  }
`;

export function skyUniforms() {
  return {
    uTime: { value: 0 },
    uTop: { value: new THREE.Vector3(0.2, 0.205, 0.29) },
    uHorizon: { value: new THREE.Vector3(0.52, 0.5, 0.68) },
    uHorizonR: { value: new THREE.Vector3(1.0, 0.95, 1.4) },
    uHorizonL: { value: new THREE.Vector3(0.6, 0.54, 0.62) },
    uDark: { value: new THREE.Vector3(0.13, 0.14, 0.21) },
    uLight: { value: new THREE.Vector3(0.7, 0.68, 0.92) },
    uSea: { value: new THREE.Vector3(0.06, 0.08, 0.13) },
    uSeaFar: { value: new THREE.Vector3(0.3, 0.33, 0.45) },
  };
}

export function createSkyMaterial(envMode = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: skyUniforms(),
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    defines: envMode ? { ENV_MODE: '' } : {},
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/** Backdrop sea: dark grey-blue, brightening to the hazy horizon. */
export function createSeaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNear: { value: new THREE.Vector3(0.07, 0.09, 0.15) },
      uFar: { value: new THREE.Vector3(0.36, 0.37, 0.5) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uNear, uFar;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec3 d = vWorld - cameraPosition;
        float dist = length(d.xz);
        float k = smoothstep(200.0, 6000.0, dist);
        float ripple = envNoise(vWorld.xz * vec2(0.02, 0.15)) - 0.5;
        vec3 c = mix(uNear, uFar, k) * (1.0 + ripple * 0.25 * (1.0 - k));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}
