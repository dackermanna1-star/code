// The sky over Vice City and the light it gives: a dome drawn by a shader -
// deep saturated blue at noon with puffy cumulus and high cirrus, golden
// mornings and afternoons, the orange -> pink -> magenta -> purple of the
// sunset and dusk (with the pink "belt" opposite the sun), a deep blue night
// with stars, the moon and the city's glow on the horizon - keyframed over
// the day. It drives the sun (or the moon) and its shadows, the ambient
// light, the reflections (PMREM env map) and the haze.
//
//   const sky = new Sky(world);
//   sky.update(dt, hour, camPos)     sun path: rises in the east (+x) at 6:30, sets in the west (-x) at 19:00
//   sky.updateEnv(renderer, scene)   re-bakes scene.environment now and then
//   sky.setWeather('clear'|'fair'|'cloudy'|'rain', instant)   default 'fair'
//   sky.setQuality('low'|'medium'|'high')   shadow map 1024 / 2048 / 4096
//   sky.state = { night 0..1, sunI, light 0..1, rain, fogFar, lamps 0..1 (street lights/windows/neon on),
//                 dusk 0..1 (sunset colours), cover, wind, exposure (for Post), hour }
//   sky.sunDir (Vector3, towards the sun even at night), sky.lightDir (towards the light that casts shadows)
//   sky.uniforms: the shared sky uniforms (SKY_GLSL below uses them: water reflections etc.)
//
// The haze is not three's plain fog: installFog() patches three's fog chunks
// (once, for every material compiled after it) into height fog - thick along
// the ground and over the sea, thin up high - whose colour follows the sky's
// horizon in that direction (glowing towards the setting sun), so distant
// towers melt into the sky behind them. Materials that include the standard
// fog chunks get it for free; `scene.fog` stays a THREE.Fog (fog.far = state.fogFar).
import * as THREE from 'three';
import { clamp, lerp, smooth } from '../../outbreak/noise.js';
import { cloudTex } from './textures.js';
import { V } from '../state.js';

export const SUNRISE = 6.5, SUNSET = 19.0;
const FOG_FAR = 8600;            // fog is complete here (camera.far is 9000)

// ---- the fog patch -----------------------------------------------------------
// Shared uniform values are plain objects: three's uniform cloning copies them by
// reference, so every material sees the same values (vec4 = {x, y, z, w}).
export const FOG = {
  vcFogView: { value: { x: 0, y: 0, z: 1, w: 1 } },  // 2/width, 2/height, tan(fovX/2), tan(fovY/2)
  vcFogUp: { value: { x: 0, y: 1, z: 0, w: 0 } },    // world up in view space, camera height
  vcFogSun: { value: { x: 0, y: 1, z: 0, w: 0 } },   // sun in view space, w: 1 = on
  vcFogHor: { value: { x: 1, y: 1, z: 1, w: 3 } },   // horizon colour towards the sun, falloff power
  vcFogGlow: { value: { x: 0, y: 0, z: 0, w: 0 } },  // sun glow colour
  vcFogP: { value: { x: 0.0001, y: 1 / 800, z: 0.05, w: 0.4 } }, // density, 1/scale height, height-independent part, far fade start
};
const FOG_PARS = `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
		uniform vec4 vcFogView, vcFogUp, vcFogSun, vcFogHor, vcFogGlow, vcFogP;
	#endif
#endif`;
const FOG_FRAG = `
#ifdef USE_FOG
	vec3 vcFogCol = fogColor;
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor;
		if ( vcFogSun.w > 0.5 ) {
			// the view ray from gl_FragCoord (no extra varyings needed)
			vec3 vcVp = vec3( ( gl_FragCoord.xy * vcFogView.xy - 1.0 ) * vcFogView.zw, -1.0 ) * vFogDepth;
			float vcD = length( vcVp );
			vec3 vcDir = vcVp / max( vcD, 1e-4 );
			// height fog: the density falls off exponentially with height, integrated along the ray
			float vcY0 = max( vcFogUp.w, 0.0 ), vcY1 = max( vcFogUp.w + dot( vcVp, vcFogUp.xyz ), 0.0 );
			float vcA = exp( - vcFogP.y * vcY0 ), vcB = exp( - vcFogP.y * vcY1 ), vcDy = vcFogP.y * ( vcY1 - vcY0 );
			float vcF = abs( vcDy ) > 1e-3 ? ( vcA - vcB ) / vcDy : vcA;
			fogFactor = 1.0 - exp( - vcFogP.x * vcD * ( vcF + vcFogP.z ) );
			fogFactor = max( fogFactor, smoothstep( fogFar * vcFogP.w, fogFar, vFogDepth ) );
			// the colour of the horizon in this direction: warmer and brighter towards the sun
			float vcSw = max( dot( vcDir, vcFogSun.xyz ), 0.0 );
			vcFogCol = mix( fogColor, vcFogHor.xyz, pow( vcSw, vcFogHor.w ) ) + vcFogGlow.xyz * ( pow( vcSw, 10.0 ) * 0.35 + pow( vcSw, 120.0 ) * 1.2 );
		} else {
			fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		}
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, vcFogCol, fogFactor );
#endif`;

/** Patch three's fog chunks and shader libs (idempotent). Call before materials compile. */
export function installFog() {
  if (THREE.ShaderChunk.__vcFog) return;
  THREE.ShaderChunk.fog_pars_fragment = FOG_PARS;
  THREE.ShaderChunk.fog_fragment = FOG_FRAG;
  for (const lib of Object.values(THREE.ShaderLib)) if (lib.uniforms && 'fogColor' in lib.uniforms) Object.assign(lib.uniforms, FOG);
  Object.assign(THREE.UniformsLib.fog, FOG);
  THREE.ShaderChunk.__vcFog = true;
}

// ---- the sky shader ----------------------------------------------------------
/**
 * GLSL shared by the dome and anything that reflects the sky (needs Sky.uniforms):
 *   vec3 skyBase(vec3 d)            gradient, horizon glow, sun haze, dusk belt
 *   vec4 skyClouds(vec3 d, float q) cloud colour (rgb) and cover (a); q = detail 0..1
 *   vec3 skyColor(vec3 d)           both together (no sun disc, stars or moon)
 */
export const SKY_GLSL = `
uniform vec3 skZen, skHor, skHorSun, skSunCol, skSunDir, skMoonDir, skCloudLit, skCloudShade, skBelt;
uniform vec4 skP;   // x: sun glow, y: night, z: cloud cover, w: time
uniform vec4 skP2;  // x: cirrus, y: city glow, z: moon light, w: sun disc
uniform sampler2D skCloud;
vec3 skyHorizon(vec3 d) {
  float sw = max(dot(d, skSunDir), 0.0);
  return mix(skHor, skHorSun, pow(sw, 3.0)) + skSunCol * skP.x * (pow(sw, 10.0) * 0.35 + pow(sw, 120.0) * 1.2) + vec3(1.0, 0.5, 0.3) * skP2.y;
}
vec3 skyBase(vec3 d) {
  float up = clamp(d.y, 0.0, 1.0);
  float sw = max(dot(d, skSunDir), 0.0);
  vec3 hor = mix(skHor, skHorSun, pow(sw, 3.0));
  vec3 col = mix(skZen, hor, pow(1.0 - up, 4.5));
  col += skSunCol * skP.x * (pow(sw, 10.0) * 0.35 + pow(sw, 120.0) * 1.2);
  // dusk: a pink band opposite the sun (the belt of Venus) over the earth's blue shadow
  float anti = max(dot(normalize(d.xz + 1e-5), normalize(-skSunDir.xz + 1e-5)), 0.0);
  col += skBelt * smoothstep(0.0, 0.12, up) * (1.0 - smoothstep(0.1, 0.42, up)) * (0.35 + 0.65 * anti);
  // the city's glow on the horizon at night
  col += vec3(1.0, 0.5, 0.3) * skP2.y * pow(1.0 - up, 10.0);
  return col;
}
vec4 skyClouds(vec3 d, float q) {
  if (d.y < 0.005) return vec4(0.0);
  vec2 p = d.xz / (d.y + 0.07);
  float t = skP.w;
  vec2 wind = vec2(t * 0.0021, t * 0.0009);
  vec2 uv = p * 0.3 + wind;
  float cov = texture(skCloud, uv * 0.13 + vec2(0.31, 0.77)).a;
  float b = texture(skCloud, uv).r * 0.72 + texture(skCloud, uv * 2.3 + 0.17).r * 0.28;
  float e = texture(skCloud, uv * 4.3 + wind * 1.5).g;
  float th = mix(0.82, 0.2, skP.z) + (0.5 - cov) * 0.5;
  float c = b - e * 0.2 * q * (1.0 - smoothstep(0.0, 0.25, b - th));   // eroded edges, solid cores
  float dens = smoothstep(th, th + 0.12, c);
  // light: a few steps towards the sun - the more cloud that way, the darker
  vec2 sd = normalize(skSunDir.xz + 1e-4) * 0.022;
  float occ = 0.0;
  for (int i = 1; i <= 3; i++) {
    vec2 o = uv + sd * float(i);
    occ += max(texture(skCloud, o).r * 0.72 + texture(skCloud, o * 2.3 + 0.17).r * 0.28 - th, 0.0);
  }
  float lit = exp(-occ * 4.5);
  lit = mix(lit, 1.0, (1.0 - smoothstep(-0.15, 0.1, skSunDir.y)) * 0.4); // after sunset the undersides glow
  float thick = smoothstep(0.03, 0.3, c - th);
  float sw = max(dot(d, skSunDir), 0.0);
  vec3 cc = mix(skCloudShade, skCloudLit, lit);
  // flat grey bases on the thick ones overhead (we see them from below)
  cc *= 1.0 - thick * (0.22 + 0.25 * smoothstep(0.15, 0.7, d.y)) * (1.0 - lit * 0.5);
  cc += skSunCol * skP.x * pow(sw, 9.0) * (1.0 - dens * 0.75) * 1.8;   // silver lining
  // high cirrus streaks
  vec2 cu = mat2(0.8, 0.6, -0.6, 0.8) * p * vec2(0.09, 0.22) + vec2(t * 0.0006, 0.13);
  float ci = smoothstep(0.6, 0.92, texture(skCloud, cu).b) * smoothstep(0.45, 0.8, texture(skCloud, p * 0.11 + vec2(0.5, t * 0.0005)).a) * skP2.x * smoothstep(0.02, 0.2, d.y);
  vec3 cic = skCloudLit * 1.05 + skSunCol * skP.x * pow(sw, 6.0) * 0.6;
  dens *= smoothstep(0.005, 0.07, d.y);
  // far clouds fade into the haze
  float aer = (1.0 - smoothstep(0.0, 0.3, d.y)) * 0.65;
  vec3 hz = skyHorizon(d);
  cc = mix(cc, hz, aer); cic = mix(cic, hz, aer);
  float a = dens + ci * (1.0 - dens);
  vec3 col = (cc * dens + cic * ci * (1.0 - dens)) / max(a, 1e-4);
  return vec4(col, a);
}
vec3 skyColor(vec3 d) {
  vec3 col = skyBase(d);
  vec4 c = skyClouds(d, 0.0);
  return mix(col, c.rgb, c.a);
}`;

const VS = `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const FS = `
${SKY_GLSL}
uniform float envPass;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col;
  if (d.y < 0.0) {
    // below the horizon (only seen from high up, past the end of the sea): hazy sea
    col = skyHorizon(d);
  } else {
    col = skyBase(d);
    float sw = dot(d, skSunDir);
    float vis = smoothstep(-0.04, 0.01, skSunDir.y) * (1.0 - envPass);
    // the sun: a hot disc (bloom turns it into glare)
    col += skSunCol * smoothstep(0.99955, 0.99978, sw) * skP2.w * vis;
    // stars and the moon
    float night = skP.y * (1.0 - envPass * 0.7);
    if (night > 0.01) {
      vec2 g = vec2(atan(d.x, d.z) * 190.0, d.y * 170.0);
      vec2 cell = floor(g); float h = hash(cell);
      if (h > 0.982) {
        vec2 c = fract(g) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5;
        float s = smoothstep(0.1 + (h - 0.982) * 4.0, 0.0, length(c));
        col += mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash(cell + 1.3)) * s * night * (0.6 + 0.4 * sin(skP.w * 2.3 + h * 90.0)) * smoothstep(0.02, 0.3, d.y) * (1.0 + 2.0 * step(0.996, h)) * (1.0 - envPass);
      }
      float md = max(dot(d, skMoonDir), 0.0);
      float disc = smoothstep(0.99962, 0.99975, md);
      vec2 mp = (d.xz - skMoonDir.xz) * 900.0;
      float mare = 0.82 + 0.18 * sin(mp.x * 0.9 + 1.0) * sin(mp.y * 1.1 + 2.0);
      col += vec3(0.9, 0.93, 1.0) * (disc * 6.0 * mare * (1.0 - envPass) + pow(md, 60.0) * 0.08 + pow(md, 8.0) * 0.02) * night;
    }
    vec4 c = skyClouds(d, 1.0);
    col = mix(col, c.rgb, c.a);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---- the day ----------------------------------------------------------------
// zen/hor: the sky overhead and at the horizon (away from the sun), hs: the horizon
// towards the sun, sun: sunlight colour, sunI: its intensity, glow: haze round the sun,
// belt: the pink dusk band, cl/cs: lit and shaded cloud, amb: hemisphere [sky, ground,
// intensity], moon: moonlight, fog: haze density, exp: exposure, glowC: city glow.
const KEYS = [
  { h: 0, zen: 0x0a1a46, hor: 0x24356a, hs: 0x24356a, sun: 0xff8040, sunI: 0, glow: 0, belt: 0x000000, cl: 0x323e6e, cs: 0x141b3a, amb: [0x3b4f88, 0x1a1e2e, 0.5], moon: 0.32, fog: 1.0, exp: 1.45, glowC: 0.05 },
  { h: 4.6, zen: 0x0a1a46, hor: 0x24356a, hs: 0x24356a, sun: 0xff8040, sunI: 0, glow: 0, belt: 0x000000, cl: 0x323e6e, cs: 0x141b3a, amb: [0x3b4f88, 0x1a1e2e, 0.5], moon: 0.3, fog: 1.0, exp: 1.45, glowC: 0.05 },
  { h: 5.6, zen: 0x1c2c6c, hor: 0x5e4c86, hs: 0xd27890, sun: 0xff7040, sunI: 0, glow: 0.35, belt: 0x2a1430, cl: 0xc87098, cs: 0x2c2a58, amb: [0x56589a, 0x2a2232, 0.55], moon: 0.12, fog: 1.25, exp: 1.45, glowC: 0.03 },
  { h: 6.5, zen: 0x3358ac, hor: 0xe8a492, hs: 0xffb478, sun: 0xff9c58, sunI: 0.9, glow: 1.0, belt: 0x301828, cl: 0xffc49a, cs: 0x6c6c9c, amb: [0x8a9cd0, 0x5c4c44, 0.6], moon: 0, fog: 1.2, exp: 1.15, glowC: 0 },
  { h: 7.6, zen: 0x2a68cc, hor: 0xcfdcec, hs: 0xffe4bc, sun: 0xffd6a8, sunI: 2.4, glow: 0.55, belt: 0x000000, cl: 0xfff4e8, cs: 0x8c9cbc, amb: [0xb4c4dc, 0x9a8670, 0.65], moon: 0, fog: 1.05, exp: 1.0, glowC: 0 },
  { h: 9.5, zen: 0x1c60d8, hor: 0xb0d2f6, hs: 0xe4eef8, sun: 0xfff4e6, sunI: 3.1, glow: 0.32, belt: 0x000000, cl: 0xffffff, cs: 0x8ea4c8, amb: [0xbccce2, 0xa89a80, 0.7], moon: 0, fog: 1.0, exp: 1.0, glowC: 0 },
  { h: 12.75, zen: 0x1456d2, hor: 0xa6cef6, hs: 0xdceafa, sun: 0xffffff, sunI: 3.4, glow: 0.28, belt: 0x000000, cl: 0xffffff, cs: 0x90a6ca, amb: [0xc0d0e4, 0xaa9c82, 0.72], moon: 0, fog: 0.95, exp: 1.0, glowC: 0 },
  { h: 16.2, zen: 0x185ad0, hor: 0xacd0f2, hs: 0xf2ecde, sun: 0xfff2de, sunI: 3.1, glow: 0.38, belt: 0x000000, cl: 0xffffff, cs: 0x8ea2c6, amb: [0xbccce2, 0xa89a80, 0.7], moon: 0, fog: 1.0, exp: 1.0, glowC: 0 },
  { h: 17.5, zen: 0x245cc0, hor: 0xd6d6cc, hs: 0xffdaa4, sun: 0xffd49c, sunI: 2.7, glow: 0.7, belt: 0x000000, cl: 0xfff0d8, cs: 0x8c96bc, amb: [0xbcc4d8, 0x98806a, 0.66], moon: 0, fog: 1.05, exp: 1.02, glowC: 0 },
  { h: 18.5, zen: 0x2f4fa4, hor: 0xeea48e, hs: 0xffa252, sun: 0xff9a48, sunI: 1.9, glow: 1.25, belt: 0x2a1020, cl: 0xffb47a, cs: 0x7a6c9e, amb: [0x9c9cc4, 0x6a4c3c, 0.6], moon: 0, fog: 1.15, exp: 1.08, glowC: 0 },
  { h: 19.0, zen: 0x283a8c, hor: 0xc07a9c, hs: 0xff8040, sun: 0xff6a2c, sunI: 0.55, glow: 1.6, belt: 0x4a1a3a, cl: 0xff8c76, cs: 0x6c4c8e, amb: [0x8c82b6, 0x4c3038, 0.55], moon: 0, fog: 1.0, exp: 1.12, glowC: 0 },
  { h: 19.35, zen: 0x1c2870, hor: 0x7a5094, hs: 0xff6a4c, sun: 0xff5030, sunI: 0, glow: 1.05, belt: 0x5a1c48, cl: 0xff7088, cs: 0x463a78, amb: [0x6c5c9c, 0x30202e, 0.5], moon: 0, fog: 0.95, exp: 1.22, glowC: 0.01 },
  { h: 19.9, zen: 0x121e5a, hor: 0x40357a, hs: 0x9a4870, sun: 0xff4030, sunI: 0, glow: 0.35, belt: 0x241030, cl: 0x844a80, cs: 0x262e5c, amb: [0x484c80, 0x1e1c2a, 0.48], moon: 0.12, fog: 1.1, exp: 1.38, glowC: 0.03 },
  { h: 20.7, zen: 0x0b1b4a, hor: 0x26366c, hs: 0x2c3468, sun: 0xff4030, sunI: 0, glow: 0, belt: 0x000000, cl: 0x323e6e, cs: 0x141b3a, amb: [0x3b4f88, 0x1a1e2e, 0.5], moon: 0.3, fog: 1.0, exp: 1.45, glowC: 0.05 },
  { h: 24, zen: 0x0a1a46, hor: 0x24356a, hs: 0x24356a, sun: 0xff8040, sunI: 0, glow: 0, belt: 0x000000, cl: 0x323e6e, cs: 0x141b3a, amb: [0x3b4f88, 0x1a1e2e, 0.5], moon: 0.32, fog: 1.0, exp: 1.45, glowC: 0.05 },
];
// the keys as linear colours, once
const LK = KEYS.map((k) => {
  const c = (h) => new THREE.Color(h);
  return { ...k, zen: c(k.zen), hor: c(k.hor), hs: c(k.hs), sun: c(k.sun), belt: c(k.belt), cl: c(k.cl), cs: c(k.cs), ambS: c(k.amb[0]), ambG: c(k.amb[1]), ambI: k.amb[2] };
});
const MOON_COL = new THREE.Color(0x9fb6ff);

export const WEATHER = {
  clear: { cover: 0.12, cirrus: 0.5, fog: 1, rain: 0, wind: 0.3 },
  fair: { cover: 0.36, cirrus: 0.55, fog: 1, rain: 0, wind: 0.4 },
  cloudy: { cover: 0.62, cirrus: 0.4, fog: 1.15, rain: 0, wind: 0.6 },
  rain: { cover: 0.9, cirrus: 0, fog: 1.6, rain: 1, wind: 0.8 },
};

/** Where the sun is at this hour (unit vector towards it). */
export function sunDirAt(hour, out = new THREE.Vector3()) {
  let a;
  if (hour >= SUNRISE && hour <= SUNSET) a = Math.PI * (hour - SUNRISE) / (SUNSET - SUNRISE);
  else { const h = hour < SUNRISE ? hour + 24 : hour; a = Math.PI + Math.PI * (h - SUNSET) / (24 - (SUNSET - SUNRISE)); }
  return out.set(Math.cos(a) * 0.92, Math.sin(a), 0.34).normalize();
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _sz = new THREE.Vector2();
const _c = new THREE.Color();
const set4 = (o, x, y, z, w) => { o.x = x; o.y = y; o.z = z; o.w = w; };

export class Sky {
  constructor(world) {
    installFog();
    this.world = world;
    const C = () => ({ value: new THREE.Color() });
    this.uniforms = {
      skZen: C(), skHor: C(), skHorSun: C(), skSunCol: C(), skCloudLit: C(), skCloudShade: C(), skBelt: C(),
      skSunDir: { value: new THREE.Vector3(0, 1, 0) }, skMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      skP: { value: new THREE.Vector4(0.3, 0, 0.36, 0) }, skP2: { value: new THREE.Vector4(0.6, 0, 0, 40) },
      skCloud: { value: cloudTex() },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { ...this.uniforms, envPass: { value: 0 } }, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    this.dome.scale.setScalar(6000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.dome.name = 'sky';
    if (world.skyMesh) world.scene.remove(world.skyMesh);
    world.skyMesh = null;
    world.scene.background = null;
    world.scene.add(this.dome);
    // the lights: the sun (the moon at night) casts the one shadow; the hemisphere fills
    this.sun = world.sun; this.hemi = world.ambient;
    if (world.fill) { world.fill.intensity = 0; world.fill.visible = false; }
    const S = this.sun;
    S.castShadow = true;
    S.shadow.bias = -0.00025;
    S.shadow.normalBias = 0.35;
    world.scene.add(S.target);
    this.ext = 250; this.setQuality(V.cfg?.quality || 'high');
    world.scene.fog = new THREE.Fog(0xa6cef6, 0, FOG_FAR);
    this.autoFar = true; this.fogFar = FOG_FAR;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.hour = 12;
    this.weather = 'fair'; this.w = { ...WEATHER.fair }; this.wTarget = { ...WEATHER.fair };
    this.env = null; this.envHour = -99; this.envCover = -1; this.pm = null;
    this.state = { sunI: 1, night: 0, fogFar: FOG_FAR, rain: 0, wind: 0.4, cover: 0.36, light: 1, lamps: 0, dusk: 0, exposure: 1, hour: 12 };
    this._k = { zen: new THREE.Color(), hor: new THREE.Color(), hs: new THREE.Color(), sun: new THREE.Color(), belt: new THREE.Color(), cl: new THREE.Color(), cs: new THREE.Color(), ambS: new THREE.Color(), ambG: new THREE.Color() };
  }

  setQuality(q = 'high') {
    const n = q === 'low' ? 1024 : q === 'medium' ? 2048 : 4096;
    const S = this.sun.shadow;
    if (S.mapSize.x !== n) { S.mapSize.set(n, n); S.map?.dispose(); S.map = null; }
    this.quality = q;
  }

  setWeather(kind, instant = false) {
    if (!WEATHER[kind]) return;
    this.weather = kind;
    this.wTarget = { ...WEATHER[kind] };
    if (instant) this.w = { ...this.wTarget };
  }

  /** hour: 0..24. Moves the sun and recolours everything. */
  update(dt, hour, camPos) {
    this.hour = hour;
    if (!this._hooks && typeof window !== 'undefined' && window.__vc) {
      // test hooks: __vc.weather('clear'|'fair'|'cloudy'|'rain'), __vc.skyInfo()
      this._hooks = true;
      Object.assign(window.__vc, {
        weather: (k = 'fair') => { this.setWeather(k, true); return k; },
        skyInfo: () => ({ ...this.state, sun: this.sunDir.toArray().map((v) => +v.toFixed(3)), far: this.world.camera.far, shadow: this.sun.shadow.mapSize.x, ext: this.ext }),
      });
    }
    for (const k in this.w) this.w[k] = lerp(this.w[k], this.wTarget[k], Math.min(1, dt * 0.05));
    const u = this.uniforms, w = this.w, K = this._k;
    u.skP.value.w += dt;
    // the keyframes
    let i0 = 0;
    while (i0 < LK.length - 2 && hour > LK[i0 + 1].h) i0++;
    const a = LK[i0], b = LK[i0 + 1];
    const t = smooth(0, 1, clamp((hour - a.h) / Math.max(0.001, b.h - a.h)));
    for (const k in K) K[k].copy(a[k]).lerp(b[k], t);
    // where the sun and moon are
    const sun = sunDirAt(hour, this.sunDir);
    u.skSunDir.value.copy(sun);
    const moon = u.skMoonDir.value.set(-sun.x * 0.8, Math.max(0.3, -sun.y), 0.42).normalize();
    // clouds and rain grey everything over
    const cover = w.cover, grey = smooth(0.45, 1, cover);
    const night = 1 - smooth(-0.12, 0.1, sun.y);
    u.skZen.value.copy(K.zen).lerp(_c.setRGB(0.32, 0.36, 0.42).multiplyScalar(1 - night * 0.9), grey * 0.6);
    u.skHor.value.copy(K.hor).lerp(_c.setRGB(0.5, 0.53, 0.56).multiplyScalar(1 - night * 0.9), grey * 0.55);
    u.skHorSun.value.copy(K.hs).lerp(u.skHor.value, grey * 0.6);
    u.skSunCol.value.copy(K.sun);
    u.skBelt.value.copy(K.belt).multiplyScalar(1 - grey);
    u.skCloudLit.value.copy(K.cl).lerp(_c.setRGB(0.55, 0.57, 0.6).multiplyScalar(1 - night * 0.9), grey * 0.7);
    u.skCloudShade.value.copy(K.cs).lerp(_c.setRGB(0.25, 0.27, 0.3).multiplyScalar(1 - night * 0.9), grey * 0.7);
    const sunVis = smooth(-0.035, 0.05, sun.y);
    u.skP.value.x = lerp(a.glow, b.glow, t) * (1 - grey * 0.8);
    u.skP.value.y = night * (1 - smooth(0.3, 0.8, cover));
    u.skP.value.z = cover;
    u.skP2.value.set(w.cirrus * (1 - grey), lerp(a.glowC, b.glowC, t), 0, lerp(14, 46, smooth(0.0, 0.35, sun.y)) * (1 - grey));
    // the lights: the sun by day, the moon by night (one shadow-casting light)
    const S = this.sun;
    const sunI = lerp(a.sunI, b.sunI, t) * (1 - grey * 0.75) * sunVis;
    const moonI = lerp(a.moon, b.moon, t) * (1 - grey * 0.7);
    if (sun.y > -0.02) { this.lightDir.copy(sun); S.color.copy(K.sun); S.intensity = sunI; }
    else { this.lightDir.copy(moon); S.color.copy(MOON_COL); S.intensity = moonI; }
    this.hemi.color.copy(K.ambS).lerp(_c.setRGB(0.6, 0.62, 0.66).multiplyScalar(1 - night * 0.85), grey * 0.5);
    this.hemi.groundColor.copy(K.ambG);
    // (the env map lights things with the sky too, so the hemisphere is the smaller part by day)
    // (three's hemisphere light is divided by pi in the shading: x2.2 to count as sky fill and bounce)
    this.hemi.intensity = (a.ambI + (b.ambI - a.ambI) * t) * lerp(2.2, 2.0, night);
    this._far();
    this._shadow(camPos || this.world.camera.position);
    // the haze
    const fog = this.world.scene.fog;
    fog.color.copy(u.skHor.value).add(_c.setRGB(1, 0.5, 0.3).multiplyScalar(u.skP2.value.y)); // (as skyHorizon())
    fog.near = 0; fog.far = this.fogFar;
    this._fog(lerp(a.fog, b.fog, t) * w.fog);
    // what the rest of the game wants to know
    const st = this.state;
    st.sunI = S.intensity; st.night = night; st.rain = w.rain; st.wind = w.wind; st.cover = cover; st.hour = hour;
    st.fogFar = this.fogFar;
    st.light = clamp(Math.max(sunI / 3.2, (this.hemi.intensity * (K.ambS.r + K.ambS.g + K.ambS.b)) / 1.6));
    st.lamps = 1 - smooth(0.02, 0.14, sun.y) * (1 - grey * 0.5);
    st.dusk = Math.max(smooth(17.6, 18.8, hour) * (1 - smooth(19.6, 20.4, hour)), smooth(5.2, 6.0, hour) * (1 - smooth(6.9, 7.8, hour)));
    st.exposure = lerp(a.exp, b.exp, t);
    this.dome.position.copy(this.world.camera.position);
  }

  /** From high up you can see further: the far plane (and the fog with it) grows with height. */
  _far() {
    const cam = this.world.camera;
    if (!this.autoFar) { this.fogFar = cam.far * 0.955; return; }
    const far = Math.round(lerp(9000, 17000, smooth(350, 2600, cam.position.y)) / 250) * 250;
    if (cam.far !== far) { cam.far = far; cam.updateProjectionMatrix(); }
    this.fogFar = far * 0.955;
  }

  /** The shadow box follows the camera (a bit ahead of it), snapped to whole shadow texels. */
  _shadow(p) {
    const S = this.sun, cam = this.world.camera, sc = S.shadow.camera;
    // bigger when high up (in steps, so it doesn't shimmer)
    const h = Math.max(0, p.y - 40);
    const ext = h < 120 ? 250 : h < 400 ? 420 : h < 1000 ? 700 : 1100;
    if (ext !== this.ext || sc.right !== ext) {
      this.ext = ext;
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 5000;
      sc.updateProjectionMatrix();
    }
    cam.getWorldDirection(_v); _v.y = 0;
    const fl = _v.length();
    _v2.copy(p);
    if (fl > 1e-3) _v2.addScaledVector(_v, (ext * 0.45) / fl);
    _v2.y = Math.min(p.y, 40);
    // the light's view axes (as Matrix4.lookAt builds them) and the texel size
    const L = this.lightDir;
    _x.set(0, 1, 0).cross(L);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.normalize(); _y.copy(L).cross(_x).normalize();
    const tx = (2 * ext) / S.shadow.mapSize.x;
    const px = _v2.dot(_x), py = _v2.dot(_y);
    _v2.addScaledVector(_x, Math.round(px / tx) * tx - px).addScaledVector(_y, Math.round(py / tx) * tx - py);
    S.target.position.copy(_v2);
    S.position.copy(_v2).addScaledVector(L, 2500);
    S.target.updateMatrixWorld();
    S.updateMatrixWorld();
  }

  /** The shared fog uniforms, in the main camera's view space. */
  _fog(density) {
    const cam = this.world.camera, r = this.world.renderer, u = this.uniforms;
    cam.updateMatrixWorld();
    r.getDrawingBufferSize(_sz);
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / (cam.zoom || 1);
    set4(FOG.vcFogView.value, 2 / Math.max(1, _sz.x), 2 / Math.max(1, _sz.y), ty * cam.aspect, ty);
    const vm = cam.matrixWorldInverse;
    _v.set(0, 1, 0).transformDirection(vm);
    set4(FOG.vcFogUp.value, _v.x, _v.y, _v.z, cam.position.y);
    _v.copy(u.skSunDir.value).transformDirection(vm);
    set4(FOG.vcFogSun.value, _v.x, _v.y, _v.z, 1);
    const hs = u.skHorSun.value, g = u.skSunCol.value, gi = u.skP.value.x;
    const cg = u.skP2.value.y; // (the city glow, as in skyHorizon())
    set4(FOG.vcFogHor.value, hs.r + cg, hs.g + cg * 0.5, hs.b + cg * 0.3, 3);
    set4(FOG.vcFogGlow.value, g.r * gi, g.g * gi, g.b * gi, 0);
    // (the far fade hides where the sea is clipped; from high up it starts a little later)
    set4(FOG.vcFogP.value, 0.0001 * density, 1 / 800, 0.05, lerp(0.4, 0.5, smooth(60, 1500, cam.position.y)));
  }

  /**
   * Reflections and sky light for standard materials: the sky re-baked now and then.
   * The dome is rendered into a small cube map one face per frame (a 7-frame cycle that
   * ends with the PMREM filter into the same reused target), so a re-bake never costs a
   * frame more than a fraction of a millisecond on a GPU. It re-bakes about every 0.12 h
   * while the light changes fast (dawn/dusk) and every 0.4 h otherwise; a big jump (a new
   * game, __vc.time(), the weather snapping) bakes everything at once.
   */
  updateEnv(renderer, scene) {
    if (!this.pm) {
      this.pm = new THREE.PMREMGenerator(renderer);
      this.envScene = new THREE.Scene();
      this.envDome = new THREE.Mesh(this.dome.geometry, this.dome.material);
      this.envDome.scale.setScalar(100); this.envDome.frustumCulled = false;
      this.envScene.add(this.envDome);
      this.envCube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
      this.envCam = new THREE.CubeCamera(0.1, 400, this.envCube);
      this.envCam.coordinateSystem = renderer.coordinateSystem; this.envCam.updateCoordinateSystem();
      this.envCam.updateMatrixWorld(true);
      this.envFace = -1;   // -1: idle, 0..5: the next face to draw, 6: filter
    }
    const dh0 = Math.abs(this.hour - this.envHour), dh = Math.min(dh0, 24 - dh0);
    const fast = this.state.dusk > 0.01 || (this.hour > 4.8 && this.hour < 8) || (this.hour > 17.2 && this.hour < 21);
    const dc = Math.abs(this.w.cover - this.envCover);
    if (!this.env || dh > 0.9 || dc > 0.3) { this._bake(renderer, 0, 7); this._envDone(scene); return; }
    if (this.envFace < 0) {
      if (dh < (fast ? 0.12 : 0.4) && dc < 0.06) return;
      this.envFace = 0;
    }
    this._bake(renderer, this.envFace, this.envFace + 1);
    if (++this.envFace > 6) this._envDone(scene);
  }

  /** Draws cube faces [f0, f1) of the sky (face 6 = the PMREM filter). */
  _bake(renderer, f0, f1) {
    if (f0 === 0) { this.bakeHour = this.hour; this.bakeCover = this.w.cover; }
    const m = this.dome.material, cams = this.envCam.children, old = renderer.getRenderTarget();
    const ae = renderer.xr.enabled; renderer.xr.enabled = false;
    m.uniforms.envPass.value = 1;
    for (let f = f0; f < Math.min(f1, 6); f++) { renderer.setRenderTarget(this.envCube, f); renderer.render(this.envScene, cams[f]); }
    m.uniforms.envPass.value = 0;
    renderer.setRenderTarget(old);
    renderer.xr.enabled = ae;
    if (f1 > 6) this.env = this.pm.fromCubemap(this.envCube.texture, this.env);
  }

  _envDone(scene) {
    this.envFace = -1; this.envHour = this.bakeHour; this.envCover = this.bakeCover;
    if (scene.environment !== this.env.texture) scene.environment = this.env.texture;
  }
}
