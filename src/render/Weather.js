// Weather state machine (clear → rain → storm …), ambient temperature, GPU rain with roof occlusion, lightning.
import * as THREE from 'three';
import { globalUniforms, LIGHTING_GLSL } from './materials.js';
import { clamp, lerp } from '../core/rng.js';

export const WEATHER_TYPES = {
  clear: { label: 'Clear', cloud: 0.18, overcast: 0.0, fog: 0.0, rain: 0, wind: 0.2, temp: 1.5 },
  cloudy: { label: 'Cloudy', cloud: 0.5, overcast: 0.25, fog: 0.0, rain: 0, wind: 0.35, temp: 0 },
  overcast: { label: 'Overcast', cloud: 0.85, overcast: 0.75, fog: 0.08, rain: 0, wind: 0.4, temp: -1.5 },
  fog: { label: 'Heavy Fog', cloud: 0.7, overcast: 0.6, fog: 1.0, rain: 0, wind: 0.05, temp: -2 },
  rain: { label: 'Rain', cloud: 0.95, overcast: 0.9, fog: 0.2, rain: 0.65, wind: 0.55, temp: -3 },
  storm: { label: 'Thunderstorm', cloud: 1.0, overcast: 1.0, fog: 0.25, rain: 1.0, wind: 1.0, temp: -4 },
};
const TRANSITIONS = {
  clear: [['clear', 4], ['cloudy', 4], ['fog', 1]],
  cloudy: [['clear', 3], ['cloudy', 2], ['overcast', 3], ['fog', 1]],
  overcast: [['cloudy', 2], ['overcast', 1], ['rain', 4], ['storm', 1], ['fog', 1]],
  fog: [['cloudy', 3], ['overcast', 2], ['clear', 1]],
  rain: [['overcast', 3], ['rain', 2], ['storm', 2], ['cloudy', 1]],
  storm: [['rain', 4], ['overcast', 2]],
};

const RAIN_VERT = /* glsl */ `
in vec4 aSeed;
uniform float uTime;
uniform vec3 uCamPos;
uniform float uWind;
uniform sampler2D uHeight;
uniform float uRainAmount;
out float vAlpha;
out vec3 vWorldPos;
const vec3 BOX = vec3(48.0, 36.0, 48.0);
void main() {
  if (aSeed.w > uRainAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  float speed = 18.0 + aSeed.w * 6.0;
  vec3 p = aSeed.xyz * BOX;
  p.y -= uTime * speed;
  p.x += uTime * uWind * 4.0;
  p = mod(p - uCamPos + BOX * 0.5, BOX) + uCamPos - BOX * 0.5;
  ivec2 hc = ivec2(floor(p.xz));
  float roof = -1.0;
  if (hc.x >= 0 && hc.y >= 0 && hc.x < 1024 && hc.y < 1024) roof = texelFetch(uHeight, hc, 0).r * 255.0;
  if (p.y < roof + 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  // vertical billboard streak
  vec3 toCam = uCamPos - p;
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)) * 0.018;
  vec3 down = normalize(vec3(uWind * 0.25, -1.0, 0.0)) * 0.7;
  vec3 wp = p + side * (position.x * 2.0 - 1.0) + down * position.y;
  vWorldPos = wp;
  float d = length(toCam);
  vAlpha = (1.0 - smoothstep(16.0, 24.0, d)) * 0.38;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const RAIN_FRAG = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in float vAlpha;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
  vec3 lit = computeLighting(vWorldPos, vec3(0.0, 0.0, 1.0), 1.0, 0.0, 1.0);
  fragColor = vec4(vec3(0.55, 0.6, 0.7) * (lit + 0.04), vAlpha);
}
`;

export class Weather {
  constructor(scene, world, rng) {
    this.world = world;
    this.rng = rng;
    this.type = 'clear';
    this.params = { ...WEATHER_TYPES.clear };
    this.target = { ...WEATHER_TYPES.clear };
    this.nextChange = 3; // game hours until next roll
    this.lightningTimer = 8;
    this.flashes = [];
    this.temperature = 14;
    this.dailyOffset = 0;
    this.onThunder = null; // (delaySec, distance01) => void

    // GPU rain
    const COUNT = 7000;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT * 4; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = COUNT;
    this.heightTex = new THREE.DataTexture(world.height, world.SX, world.SZ, THREE.RedFormat, THREE.UnsignedByteType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    this.rainUniforms = {
      ...globalUniforms,
      uHeight: { value: this.heightTex },
      uRainAmount: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: this.rainUniforms,
      transparent: true,
      depthWrite: false,
    });
    this.rainMesh = new THREE.Mesh(g, mat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 5;
    scene.add(this.rainMesh);
    this.heightDirty = false;
    this.heightTimer = 0;
    world.listeners.push(() => { this.heightDirty = true; });
  }

  set(type, instant = false) {
    this.type = type;
    this.target = { ...WEATHER_TYPES[type] };
    if (instant) this.params = { ...this.target };
  }

  get label() { return WEATHER_TYPES[this.type].label; }

  /** dtHours: game hours elapsed; dt: real seconds; hour: time of day; day number */
  update(dt, dtHours, hour, day) {
    this.nextChange -= dtHours;
    if (this.nextChange <= 0) {
      const opts = TRANSITIONS[this.type];
      this.set(this.rng.weighted(opts));
      this.nextChange = this.rng.range(1.5, 5);
      if (this.type === 'storm') this.nextChange = this.rng.range(0.8, 2);
    }
    const k = 1 - Math.exp(-dt / 25);
    for (const key of ['cloud', 'overcast', 'fog', 'rain', 'wind', 'temp']) {
      this.params[key] = lerp(this.params[key], this.target[key], k);
    }
    // temperature: autumn, colder at night and as days pass
    const diurnal = Math.cos(((hour - 15) / 24) * Math.PI * 2); // peak at 15:00
    const base = 10 - Math.min(day - 1, 20) * 0.25;
    this.temperature = base + diurnal * 6.5 + this.params.temp;

    globalUniforms.uWind.value = this.params.wind;
    globalUniforms.uWetness.value = lerp(globalUniforms.uWetness.value, this.params.rain > 0.1 ? 1 : 0, dt / (this.params.rain > 0.1 ? 40 : 160));
    this.rainUniforms.uRainAmount.value = this.params.rain;

    // lightning
    if (this.target.rain >= 1 && this.params.rain > 0.7) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 5 + Math.random() * 18;
        const dist = Math.random();
        const strength = 1 - dist * 0.7;
        const t0 = 0;
        this.flashes.push({ t: t0, dur: 0.08, s: strength }, { t: t0 + 0.14, dur: 0.06, s: strength * 0.6 }, { t: t0 + 0.3 + Math.random() * 0.2, dur: 0.12, s: strength * 0.9 });
        if (this.onThunder) this.onThunder(0.3 + dist * 3.5, dist);
      }
    }
    let L = 0;
    for (const f of this.flashes) {
      f.t -= dt;
      if (f.t <= 0 && f.t > -f.dur) L = Math.max(L, f.s);
    }
    this.flashes = this.flashes.filter((f) => f.t > -f.dur);
    globalUniforms.uLightning.value = L;

    this.heightTimer -= dt;
    if (this.heightDirty && this.heightTimer <= 0) {
      this.heightTex.needsUpdate = true;
      this.heightDirty = false;
      this.heightTimer = 1;
    }
  }

  toJSON() { return { type: this.type, nextChange: this.nextChange }; }
  load(d) { if (d && WEATHER_TYPES[d.type]) { this.set(d.type, true); this.nextChange = d.nextChange || 2; } }
}
