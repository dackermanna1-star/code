import * as THREE from 'three';
import { FullscreenPass, makeFullscreenMaterial } from '../engine/fullscreen.js';
import { NOISE_GLSL, HEIGHTFIELD_GLSL, heightAt } from '../world/heightfield.js';

// Dev check: evaluates the GLSL heightfield on the GPU at random points and compares it
// with the JavaScript version used for collision. Run with ?validate in the URL.
export function validateHeightfield(renderer, count = 4096) {
  const size = Math.ceil(Math.sqrt(count));
  const pts = new Float32Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // Mix of nearby, mid-range and far coordinates, including the spawn oasis.
    const r = i % 3 === 0 ? 3000 : i % 3 === 1 ? 30000 : 600;
    pts[i * 4] = (Math.random() * 2 - 1) * r + (i % 7 === 0 ? 880 : 0);
    pts[i * 4 + 1] = (Math.random() * 2 - 1) * r + (i % 7 === 0 ? 760 : 0);
  }
  const input = new THREE.DataTexture(pts, size, size, THREE.RGBAFormat, THREE.FloatType);
  input.needsUpdate = true;
  const target = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType, depthBuffer: false });
  const mat = makeFullscreenMaterial(
    `${NOISE_GLSL}
${HEIGHTFIELD_GLSL}
uniform highp sampler2D tPts;
void main() {
  vec2 p = texelFetch(tPts, ivec2(gl_FragCoord.xy), 0).xy;
  gl_FragColor = vec4(terrainHeightLee(p, 0.0), 0.0, 1.0);
}`,
    { tPts: { value: input } },
  );
  new FullscreenPass(mat).render(renderer, target);
  const out = new Float32Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, out);
  let maxErr = 0;
  let sumErr = 0;
  let worst = null;
  for (let i = 0; i < size * size; i++) {
    const x = pts[i * 4];
    const z = pts[i * 4 + 1];
    const js = heightAt(x, z);
    const err = Math.abs(js - out[i * 4]);
    sumErr += err;
    if (err > maxErr) {
      maxErr = err;
      worst = { x, z, js, gpu: out[i * 4] };
    }
  }
  target.dispose();
  input.dispose();
  mat.dispose();
  return { samples: size * size, maxErr, meanErr: sumErr / (size * size), worst };
}
