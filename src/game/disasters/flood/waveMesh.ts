/**
 * The tsunami wall: a lateral x cross-section grid whose vertices follow the breaking-wave
 * profile (wave.ts PROFILES, mixed from steep to plunging per lateral position), animated
 * entirely in the vertex shader. Forward water shading: Fresnel sky reflection, refraction of
 * the opaque scene colour, absorption by thickness, back-lit translucency of the thin crest
 * and lip, sun glint, and foam (crest, lip, face streaks, whitewater at the toe).
 */
import * as THREE from 'three';
import type { Game } from '../../game';
import { ForwardLayer, GLSL_FOG, GLSL_PRELUDE, atmosphereParts } from '../fire/gl';
import { PROFILES, PROFILE_N, S_CREST, S_LIP, type WavePlan } from './wave';

const NU = 180;
const NS = PROFILE_N;

export class WaveMesh {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(game: Game, layer: ForwardLayer, plan: WavePlan) {
    const r = game.renderer as any;
    const tu = r.translucentUniforms ?? {};
    const lu = r.lightUniforms ?? {};
    const atmo = atmosphereParts(game);
    const toV2 = (a: Float32Array) => Array.from({ length: PROFILE_N }, (_, i) => new THREE.Vector2(a[i * 2], a[i * 2 + 1]));
    this.uniforms = {
      ...atmo.uniforms,
      u_sceneColor: tu.u_sceneColor ?? { value: null },
      u_linDepth: tu.u_linDepth ?? { value: null },
      u_resolution: tu.u_resolution ?? { value: new THREE.Vector2(1, 1) },
      u_cameraPos: lu.u_cameraPos ?? layer.cameraPosUniform(),
      u_lightDir: lu.u_lightDir ?? { value: new THREE.Vector3(0, 1, 0) },
      u_lightColor: lu.u_lightColor ?? { value: new THREE.Color(1, 1, 1) },
      u_sh: lu.u_sh ?? { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
      u_prof0: { value: toV2(PROFILES[0]) },
      u_prof1: { value: toV2(PROFILES[1]) },
      u_origin: { value: new THREE.Vector3(plan.px, plan.seaY + 0.9, plan.pz) },
      u_dir: { value: new THREE.Vector2(plan.dx, plan.dz) },
      u_lat: { value: new THREE.Vector2(plan.nx, plan.nz) },
      u_front: { value: plan.sStart },
      u_H: { value: 0 },
      u_halfW: { value: plan.halfW },
      u_curl: { value: 0 },
      u_time: { value: 0 },
      u_foam: { value: 0 },
      u_hasScene: { value: tu.u_sceneColor ? 1 : 0 },
    };
    const geo = new THREE.BufferGeometry();
    const uv = new Float32Array(NU * NS * 2);
    for (let j = 0; j < NS; j++)
      for (let i = 0; i < NU; i++) {
        uv[(j * NU + i) * 2] = (i / (NU - 1)) * 2 - 1;
        uv[(j * NU + i) * 2 + 1] = j / (NS - 1);
      }
    const idx = new Uint16Array((NU - 1) * (NS - 1) * 6);
    let k = 0;
    for (let j = 0; j < NS - 1; j++)
      for (let i = 0; i < NU - 1; i++) {
        const a = j * NU + i, b = a + 1, c = a + NU, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    geo.setAttribute('a_uv', new THREE.BufferAttribute(uv, 2));
    // three needs a position attribute for bounds; the shader ignores it
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NU * NS * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      vertexShader: `${GLSL_PRELUDE}
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 u_prof0[${PROFILE_N}];
uniform vec2 u_prof1[${PROFILE_N}];
uniform vec3 u_origin;
uniform vec2 u_dir;
uniform vec2 u_lat;
uniform float u_front;
uniform float u_H;
uniform float u_halfW;
uniform float u_curl;
uniform float u_time;
in vec2 a_uv;
out vec3 v_wp;
out vec3 v_n;
out vec3 v_q; // lateral (blocks), profile param, relative height

float wob(float u) { return 2.5 * sin(u * 0.045 + 1.3) + 1.5 * sin(u * 0.11 + 0.4); }

vec3 wavePos(float uN, float s, out float rel) {
  float uw = uN * (u_halfW + 12.0);
  float a = abs(uw);
  float tp = 1.0 - clamp((a - (u_halfW - 14.0)) / 26.0, 0.0, 1.0);
  tp = tp * tp * (3.0 - 2.0 * tp);
  float h = u_H * tp * (1.0 + 0.1 * sin(uw * 0.05 + u_time * 0.3) + 0.06 * sin(uw * 0.13 - u_time * 0.5));
  float c = clamp(u_curl + 0.3 * sin(uw * 0.045 + u_time * 0.4 + 1.3) * u_curl, 0.0, 1.0);
  float fi = clamp(s, 0.0, 1.0) * float(${PROFILE_N - 1});
  int i = int(floor(fi));
  int j = min(i + 1, ${PROFILE_N - 1});
  float f = fi - float(i);
  vec2 p = mix(mix(u_prof0[i], u_prof0[j], f), mix(u_prof1[i], u_prof1[j], f), c);
  // surface chop
  float chop = 0.25 * sin(uw * 0.7 + s * 30.0 - u_time * 3.0) * smoothstep(0.0, 4.0, h);
  float along = u_front + wob(uw) + p.x * max(h, 1.0) * 1.05;
  rel = p.y;
  return vec3(u_origin.x + u_lat.x * uw + u_dir.x * along, u_origin.y + p.y * h + chop, u_origin.z + u_lat.y * uw + u_dir.y * along);
}

void main() {
  float rel, r1, r2;
  vec3 P = wavePos(a_uv.x, a_uv.y, rel);
  float eu = 1.0 / ${NU - 1}.0, es = 1.0 / ${NS - 1}.0;
  vec3 Pu = wavePos(a_uv.x + eu, a_uv.y, r1) - wavePos(a_uv.x - eu, a_uv.y, r2);
  vec3 Ps = wavePos(a_uv.x, a_uv.y + es, r1) - wavePos(a_uv.x, a_uv.y - es, r2);
  vec3 N = cross(Pu, Ps);
  v_n = length(N) > 1e-6 ? normalize(N) : vec3(0.0, 1.0, 0.0);
  v_wp = P;
  v_q = vec3(a_uv.x * (u_halfW + 12.0), a_uv.y, rel);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}`,
      fragmentShader: `${GLSL_PRELUDE}
${atmo.glsl}
${GLSL_FOG}
uniform sampler2D u_sceneColor;
uniform sampler2D u_linDepth;
uniform vec2 u_resolution;
uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform float u_time;
uniform float u_H;
uniform float u_foam;
uniform float u_hasScene;
in vec3 v_wp;
in vec3 v_n;
in vec3 v_q;
out vec4 o;

float fbm(vec2 p) {
  return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.3) * 0.3 + vnoise(p * 4.3 + 1.7) * 0.15;
}

void main() {
  vec3 rel = v_wp - u_cameraPos;
  float dist = length(rel);
  vec3 V = -rel / dist;
  vec3 N = normalize(v_n);
  if (dot(N, V) < 0.0) N = -N;
  float s = v_q.y;
  float face = smoothstep(${S_CREST.toFixed(3)} - 0.05, ${S_CREST.toFixed(3)} + 0.05, s);
  // detail ripples flowing over the surface (down the face, toward the crest on the back)
  vec2 dp = vec2(v_q.x * 0.22, v_wp.y * 0.28 + u_time * mix(-0.6, 1.8, face));
  float n1 = fbm(dp), n2 = fbm(dp + vec2(3.7, 1.3));
  N = normalize(N + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.35);
  float NoV = max(dot(N, V), 1e-3);
  float F = 0.02 + 0.98 * pow5(1.0 - NoV);
  vec3 R = reflect(-V, N);
  vec3 refl = dz_sky(normalize(vec3(R.x, abs(R.y) + 0.02, R.z)));
  vec3 skyIrr = max(shIrradiance(vec3(0.0, 1.0, 0.0), u_sh) / PI, vec3(0.0));
  // thickness: thin crest and lip, thick body
  float thin = max(smoothstep(0.75, 1.0, v_q.z), smoothstep(0.12, 0.0, abs(s - ${S_LIP.toFixed(3)})) * 0.9);
  float T = mix(max(u_H, 4.0) * 0.8, 1.5, thin);
  vec3 absorb = exp(-T * vec3(0.45, 0.09, 0.06) * 0.5);
  vec2 suv = gl_FragCoord.xy / u_resolution;
  vec3 behind = vec3(0.0);
  if (u_hasScene > 0.5) behind = texture(u_sceneColor, clamp(suv + N.xz * 0.04 * thin, 0.001, 0.999)).rgb;
  vec3 deep = vec3(0.012, 0.06, 0.065) * (skyIrr * 1.2 + u_lightColor * max(u_lightDir.y, 0.0) * 0.08);
  // back-lit translucency through the thin water (turquoise glow of a breaking wave)
  float back = pow(max(dot(V, -u_lightDir), 0.0), 3.0) * 0.8 + 0.2;
  vec3 sss = u_lightColor * vec3(0.05, 0.35, 0.3) * back * thin * 0.18 * max(u_lightDir.y + 0.1, 0.0);
  vec3 trans = behind * absorb + deep * (1.0 - absorb) + sss;
  // sun glint
  vec3 Hh = normalize(V + u_lightDir);
  float NoL = max(dot(N, u_lightDir), 0.0);
  float a = 0.06;
  float spec = D_GGX(max(dot(N, Hh), 0.0), a) * V_SmithGGXCorrelated(NoV, NoL, a) * NoL;
  vec3 col = mix(trans, refl, F) + u_lightColor * spec * F;
  // foam
  float fn = fbm(vec2(v_q.x * 0.35, v_wp.y * 0.4 + u_time * mix(-0.4, 2.2, face)) + vec2(0.0, s * 6.0));
  float crest = smoothstep(0.84, 0.98, v_q.z) * smoothstep(0.3, 0.6, fn);
  float lip = smoothstep(0.1, 0.0, abs(s - ${S_LIP.toFixed(3)})) * smoothstep(0.35, 0.55, fn);
  float streak = face * smoothstep(0.62, 0.8, fbm(vec2(v_q.x * 0.5, v_wp.y * 0.08 + u_time * 1.2)));
  float toe = face * smoothstep(0.35, 0.0, v_q.z) * smoothstep(0.25, 0.55, fn + 0.25);
  float backFoam = (1.0 - face) * smoothstep(0.7, 0.85, fbm(v_wp.xz * 0.08 + u_time * 0.1)) * 0.6;
  float foam = clamp(crest + lip + streak * 0.7 + toe + backFoam + u_foam * smoothstep(0.3, 0.6, fn), 0.0, 1.0);
  vec3 foamCol = vec3(0.9, 0.93, 0.95) * (skyIrr + u_lightColor * (0.4 + 0.6 * NoL) * max(u_lightDir.y, 0.0) / PI + 0.002);
  col = mix(col, foamCol, foam * 0.92);
  o = vec4(dz_fog(col, -V, dist), 1.0);
}`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    layer.scene.add(this.mesh);
  }

  update(front: number, H: number, curl: number, time: number, foam: number) {
    const u = this.uniforms;
    u.u_front.value = front;
    u.u_H.value = H;
    u.u_curl.value = curl;
    u.u_time.value = time;
    u.u_foam.value = foam;
    this.mesh.visible = H > 0.3;
  }
}
