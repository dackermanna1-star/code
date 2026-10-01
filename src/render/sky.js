// Blue-hour sky: deep blue zenith, paler horizon with a faint sodium city glow,
// slow overcast clouds lit from below by the city. Rendered as HDR radiance.
import * as THREE from 'three';
import { shared } from './shaderlib.js';

export const SKY = {
  zenith: new THREE.Color(0.016, 0.03, 0.07),
  horizon: new THREE.Color(0.05, 0.075, 0.13),
  glow: new THREE.Color(0.045, 0.03, 0.02),
  cloudLit: new THREE.Color(0.06, 0.07, 0.1),
  cloudDark: new THREE.Color(0.02, 0.028, 0.05),
};

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uGlow: { value: SKY.glow },
      uCloudLit: { value: SKY.cloudLit },
      uCloudDark: { value: SKY.cloudDark },
      uTime: shared.uTime,
      uNoise2: shared.uNoise2,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // at the far plane
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGlow, uCloudLit, uCloudDark;
      uniform float uTime;
      uniform sampler2D uNoise2;
      varying vec3 vDir;
      float n2(vec2 p) { return texture2D(uNoise2, p / 256.0).r; }
      float cloudFbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.02 + 13.7; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.3, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.5));
        col += uGlow * exp(-max(h, 0.0) * 7.0);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 22.0 + vec2(uTime * 0.18, uTime * 0.07);
          float c = cloudFbm(uv);
          float cov = smoothstep(0.38, 0.72, c);
          float thick = smoothstep(0.5, 0.95, c);
          vec3 cc = mix(uCloudLit, uCloudDark, thick);
          cc += uGlow * 0.8 * exp(-max(h, 0.0) * 3.0);
          col = mix(col, cc, cov * smoothstep(0.0, 0.15, d.y));
        } else {
          col = uHorizon * 0.5;
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const geo = new THREE.SphereGeometry(500, 48, 24);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

/** Irradiance an unoccluded up-facing surface receives from this sky (π · average radiance). */
export function skyIrradiance() {
  const up = SKY.zenith.clone().multiplyScalar(0.55).add(SKY.horizon.clone().multiplyScalar(0.45));
  const side = SKY.zenith.clone().multiplyScalar(0.3).add(SKY.horizon.clone().multiplyScalar(0.55)).add(SKY.glow.clone().multiplyScalar(0.4));
  return { up: up.multiplyScalar(Math.PI), side: side.multiplyScalar(Math.PI) };
}
