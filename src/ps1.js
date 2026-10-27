// PS1-style rendering: a single world material (vertex lighting, affine texture
// mapping, vertex snapping, per-vertex fog, texture-page atlas) and a
// post-process pass that quantises to 15-bit colour with 4x4 ordered dither.
import * as THREE from 'three';

export const MAX_LAMPS = 128; // packed into 32 vec4 uniforms

const worldVertex = /* glsl */ `
in vec4 aAtlas;   // texture-page rect in the atlas: u0, v0, du, dv
in vec4 aBake;    // baked static light (rgb, 0..1 == 0..2x)
in vec4 aLamp;    // dynamic lamp contribution (rgb 0..1 == 0..2x), a = lamp index / 255

uniform vec4 uLamps[${MAX_LAMPS / 4}];
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform vec3 uFlashColor;
uniform float uFlashOn;
uniform float uFlashRange;
uniform vec2 uFlashCone;
uniform vec2 uSnap;
uniform float uJitter;
uniform float uFogNear;
uniform float uFogFar;
uniform float uBrightness;

out vec3 vUvW;
out vec2 vUvP;
out vec4 vAtlas;
out vec3 vLight;
out float vFog;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 vp = viewMatrix * wp;
  vec4 cp = projectionMatrix * vp;

  // Gouraud lighting, evaluated per vertex like the GTE would.
  vec3 light = aBake.rgb * 2.0;
  int li = int(aLamp.a * 255.0 + 0.5);
  light += aLamp.rgb * 2.0 * uLamps[li >> 2][li & 3];

  if (uFlashOn > 0.001 && dot(normal, normal) > 0.25) {
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 tv = wp.xyz - uFlashPos;
    float d = length(tv);
    vec3 L = tv / max(d, 0.001);
    float spot = smoothstep(uFlashCone.y, uFlashCone.x, dot(L, uFlashDir));
    float att = clamp(1.0 - d / uFlashRange, 0.0, 1.0);
    att *= att;
    float ndl = clamp(dot(n, -L) * 0.8 + 0.2, 0.0, 1.0);
    float spill = clamp(1.0 - d / 3.5, 0.0, 1.0) * 0.12;
    light += uFlashColor * uFlashOn * ndl * (spot * att * 1.7 + spill);
  }
  vLight = light * uBrightness;

  vFog = smoothstep(uFogNear, uFogFar, -vp.z);

  // No sub-pixel precision: snap projected vertices to the low-res grid.
  if (uJitter > 0.5 && cp.w > 0.0) {
    vec2 ndc = cp.xy / cp.w;
    ndc = floor(ndc * uSnap + 0.5) / uSnap;
    cp.xy = ndc * cp.w;
  }
  gl_Position = cp;

  // Affine mapping: interpolate uv*w and w, divide per fragment.
  vUvW = vec3(uv * cp.w, cp.w);
  vUvP = uv;
  vAtlas = aAtlas;
}
`;

const worldFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uAffine;

in vec3 vUvW;
in vec2 vUvP;
in vec4 vAtlas;
in vec3 vLight;
in float vFog;
out vec4 fragColor;

void main() {
  vec2 uv = uAffine > 0.5 ? vUvW.xy / vUvW.z : vUvP;
  vec2 tuv = vAtlas.xy + fract(uv) * vAtlas.zw;
  vec4 t = texture(uAtlas, tuv);
  if (t.a < 0.5) discard;
  vec3 c = t.rgb * min(vLight, vec3(2.0));
  c = mix(c, uFogColor, vFog);
  fragColor = vec4(c, 1.0);
}
`;

const postVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const postFragment = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uDither;
uniform float uLevels;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 px = floor(gl_FragCoord.xy);
  vec3 c = texture(tScene, (px + 0.5) / uRes).rgb;
  // PS1 4x4 ordered dither matrix, applied before truncating to 5 bits/channel.
  const mat4 bayer = mat4(
    0.0, 12.0, 3.0, 15.0,
    8.0, 4.0, 11.0, 7.0,
    2.0, 14.0, 1.0, 13.0,
    10.0, 6.0, 9.0, 5.0);
  int x = int(mod(px.x, 4.0));
  int y = int(mod(px.y, 4.0));
  float b = bayer[x][y] / 16.0 - 0.5;
  c += uDither * b / uLevels;
  c = floor(clamp(c, 0.0, 1.0) * uLevels + 0.5) / uLevels;
  fragColor = vec4(c, 1.0);
}
`;

export function createAtlasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

export function createWorldMaterial(atlasTexture) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: worldVertex,
    fragmentShader: worldFragment,
    uniforms: {
      uAtlas: { value: atlasTexture },
      uLamps: { value: new Float32Array(MAX_LAMPS) },
      uFlashPos: { value: new THREE.Vector3() },
      uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
      uFlashColor: { value: new THREE.Vector3(1.0, 0.9, 0.72) },
      uFlashOn: { value: 1 },
      uFlashRange: { value: 12 },
      uFlashCone: { value: new THREE.Vector2(0.975, 0.875) },
      uSnap: { value: new THREE.Vector2(160, 120) },
      uJitter: { value: 1 },
      uAffine: { value: 1 },
      uFogColor: { value: new THREE.Color(0.016, 0.017, 0.022) },
      uFogNear: { value: 2.5 },
      uFogFar: { value: 17 },
      uBrightness: { value: 1 },
    },
  });
}

// Low-res scene target + dither/quantise pass. The canvas itself is sized to the
// internal resolution and upscaled by CSS with nearest-neighbour filtering.
export class PS1Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      colorSpace: THREE.NoColorSpace,
    });
    this.postMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: postVertex,
      fragmentShader: postFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(4, 4) },
        uDither: { value: 1 },
        uLevels: { value: 31 },
      },
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, this.postMaterial);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCamera = new THREE.Camera();
  }

  setSize(w, h) {
    this.target.setSize(w, h);
    this.postMaterial.uniforms.uRes.value.set(w, h);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}
