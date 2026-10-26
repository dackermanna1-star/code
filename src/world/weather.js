// Weather system: clear / cloudy / rain / storm / snow / fog, with rain streaks
// outside, droplets sliding down the glass, lightning, and ambient soundscape.
import * as THREE from 'three';
import { G } from '../game.js';
import { canvas, toTexture, cached } from '../core/textures.js';
import { clamp, lerp, pick, rand } from '../core/utils.js';

export const WEATHER = {
  clear: { label: 'Clear', icon: '☀️', nightIcon: '🌙', overcast: 0, rain: 0, snow: 0, wind: 0.1 },
  cloudy: { label: 'Cloudy', icon: '⛅', nightIcon: '☁️', overcast: 0.55, rain: 0, snow: 0, wind: 0.3 },
  rain: { label: 'Rain', icon: '🌧️', nightIcon: '🌧️', overcast: 0.85, rain: 0.7, snow: 0, wind: 0.4 },
  storm: { label: 'Thunderstorm', icon: '⛈️', nightIcon: '⛈️', overcast: 1, rain: 1, snow: 0, wind: 0.9 },
  snow: { label: 'Snow', icon: '🌨️', nightIcon: '🌨️', overcast: 0.75, rain: 0, snow: 1, wind: 0.2 },
  fog: { label: 'Foggy', icon: '🌫️', nightIcon: '🌫️', overcast: 0.7, rain: 0, snow: 0, wind: 0.05, fog: 1 },
};

const TRANSITIONS = {
  spring: { clear: 4, cloudy: 3, rain: 3, storm: 1, fog: 1 },
  summer: { clear: 6, cloudy: 2, rain: 1, storm: 2 },
  autumn: { clear: 3, cloudy: 4, rain: 3, storm: 1, fog: 2 },
  winter: { clear: 3, cloudy: 3, snow: 4, fog: 1, rain: 1 },
};

const RAIN_VERT = /* glsl */`
uniform float uTime; uniform float uSpeed; uniform float uHeight; uniform float uWind;
attribute float aOffset;
varying float vAlpha;
void main() {
  vec3 p = position;
  float y = mod(p.y - uTime * uSpeed + aOffset * uHeight, uHeight) - uHeight * 0.5;
  p.y = y + 2.0;
  p.x += uWind * (y + uHeight * 0.5) * 0.15;
  vAlpha = 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 2.0;
}`;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.overcast = 0; this.rain = 0; this.snow = 0; this.wind = 0.1; this.fog = 0;
    this.target = { ...WEATHER.clear };
    this._buildRain();
    this._buildSnow();
    this._buildGlass();
    this.nextBolt = 5;
    this.sounds = {};
  }

  get kind() { return G.state.weather.kind; }
  get info() { return WEATHER[this.kind] || WEATHER.clear; }

  _buildRain() {
    const N = 7000;
    const pos = [], off = [];
    let i = 0;
    while (i < N) {
      const x = rand(-45, 45), z = rand(-45, 45);
      if (x > -8.5 && x < 8.5 && z > -6.3 && z < 8) continue; // keep it outside
      const len = 0.35;
      pos.push(x, 0, z, x, len, z);
      const o = Math.random();
      off.push(o, o);
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 1));
    this.rainUniforms = { uTime: { value: 0 }, uSpeed: { value: 14 }, uHeight: { value: 40 }, uWind: { value: 0.3 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#c9d6e3') } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      vertexShader: RAIN_VERT,
      fragmentShader: 'uniform float uOpacity; uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, uOpacity); }',
      transparent: true, depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(g, m);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);
  }

  _buildSnow() {
    const N = 4000; const pos = []; const off = [];
    let i = 0;
    while (i < N) {
      const x = rand(-40, 40), z = rand(-40, 40);
      if (x > -8.5 && x < 8.5 && z > -6.3 && z < 8) continue;
      pos.push(x, 0, z); off.push(Math.random()); i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 1));
    this.snowUniforms = { uTime: { value: 0 }, uSpeed: { value: 1.2 }, uHeight: { value: 30 }, uWind: { value: 0.3 }, uOpacity: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uSpeed; uniform float uHeight; uniform float uWind;
        attribute float aOffset;
        void main() {
          vec3 p = position;
          float y = mod(-uTime * uSpeed + aOffset * uHeight, uHeight) - uHeight * 0.5;
          p.y = y + 2.0;
          p.x += sin(uTime * 0.7 + aOffset * 40.0) * 0.6 + uWind * y * 0.2;
          p.z += cos(uTime * 0.5 + aOffset * 30.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(60.0 / -mv.z, 1.0, 8.0);
        }`,
      fragmentShader: 'uniform float uOpacity; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)); gl_FragColor = vec4(vec3(1.0), a * uOpacity); }',
      transparent: true, depthWrite: false,
    });
    this.snowPoints = new THREE.Points(g, m);
    this.snowPoints.frustumCulled = false;
    this.snowPoints.visible = false;
    this.scene.add(this.snowPoints);
  }

  _buildGlass() {
    // droplets on the window glass (texture scrolls slowly so drops appear to slide)
    const tex = cached('raindrops', () => {
      const S = 512; const c = canvas(S, S); const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, S, S);
      for (let i = 0; i < 520; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = 1 + Math.random() * Math.random() * 5;
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.6, 'rgba(200,220,235,0.35)'); g.addColorStop(1, 'rgba(120,140,160,0.0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 0.85, r, 0, 0, 7); ctx.fill();
        if (Math.random() < 0.12) { ctx.strokeStyle = 'rgba(220,235,245,0.25)'; ctx.lineWidth = r * 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 20 - Math.random() * 60); ctx.stroke(); }
      }
      const t = toTexture(c);
      return t;
    });
    this.dropTex = tex;
    this.glassDrops = [];
    this.glassMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0, roughness: 0.1, depthWrite: false, emissive: '#9fb0c0', emissiveIntensity: 0.05, emissiveMap: tex });
    G.events.once('aptBuilt', () => {
      for (const w of G.apartment.windows) {
        const len = w.b - w.a, h = w.top - w.bottom;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), this.glassMat);
        const uv = p.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 2.5, uv.getY(i) * h / 2.5);
        p.position.set(0, (w.top + w.bottom) / 2, 0.01);
        p.renderOrder = 3;
        w.group.add(p);
        this.glassDrops.push(p);
      }
    });
  }

  pickNext() {
    const season = G.clock.season;
    const weights = TRANSITIONS[season];
    const entries = Object.entries(weights);
    let total = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
    return 'clear';
  }

  set(kind, instant = false) {
    G.state.weather.kind = kind;
    G.state.weather.nextChange = G.clock.total + rand(150, 420);
    if (instant) Object.assign(this, { overcast: WEATHER[kind].overcast, rain: WEATHER[kind].rain, snow: WEATHER[kind].snow, wind: WEATHER[kind].wind, fog: WEATHER[kind].fog || 0 });
    G.events.emit('weather', kind);
  }

  forecast() {
    // simple deterministic-ish forecast for the weather app (next 5 slots of ~3h)
    const out = [];
    let k = this.kind;
    const r = mulberry(Math.floor(G.clock.total / 180) * 7 + 3);
    for (let i = 0; i < 5; i++) {
      out.push({ time: G.clock.total + i * 180, kind: k });
      const w = TRANSITIONS[G.clock.season];
      const e = Object.entries(w); let tot = e.reduce((a, [, x]) => a + x, 0); let rr = r() * tot;
      for (const [kk, x] of e) { rr -= x; if (rr <= 0) { if (r() < 0.55) k = kk; break; } }
    }
    return out;
  }

  startAmbience() {
    const a = G.audio;
    this.sounds.city = a.loop('city', { volume: 0.25, bus: 'ambience' });
    this.sounds.rain = a.loop('rain', { volume: 0, bus: 'ambience' });
    this.sounds.birds = a.loop('birds', { volume: 0, bus: 'ambience' });
  }

  update(dt, t) {
    const st = G.state.weather;
    if (G.clock.total > st.nextChange) this.set(this.pickNext());
    const tgt = WEATHER[st.kind] || WEATHER.clear;
    const k = 1 - Math.exp(-dt * 0.15);
    this.overcast = lerp(this.overcast, tgt.overcast, k);
    this.rain = lerp(this.rain, tgt.rain, k);
    this.snow = lerp(this.snow, tgt.snow, k);
    this.wind = lerp(this.wind, tgt.wind, k);
    this.fog = lerp(this.fog, tgt.fog || 0, k);
    // particles
    this.rainLines.visible = this.rain > 0.02;
    this.rainUniforms.uTime.value = t;
    this.rainUniforms.uOpacity.value = this.rain * 0.35;
    this.rainUniforms.uWind.value = this.wind;
    const sky = G.sky.info?.daylight ?? 1;
    this.rainUniforms.uColor.value.set('#aab8c8').multiplyScalar(0.4 + sky * 0.6);
    this.snowPoints.visible = this.snow > 0.02;
    this.snowUniforms.uTime.value = t;
    this.snowUniforms.uOpacity.value = this.snow * 0.9;
    // glass droplets
    this.glassMat.opacity = clamp(this.rain * 1.1, 0, 0.85);
    this.dropTex.offset.y -= dt * 0.02 * this.rain;
    for (const g of this.glassDrops) g.visible = this.rain > 0.03;
    // lightning
    if (st.kind === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rand(6, 22);
        G.sky.lightning();
        const dist = rand(0.2, 1);
        G.audio.play('thunder', { delay: dist * 2.5, volume: 1.2 - dist * 0.6, big: 1.2 - dist * 0.5, bus: 'ambience' });
      }
    }
    // ambience mix
    const s = this.sounds;
    if (s.city) {
      const night = 1 - sky;
      const h = G.clock.hour;
      const windowsOpenFeel = 0.22 + (1 - this.rain) * 0.1 - night * 0.06;
      s.city.setVolume(windowsOpenFeel, 1);
      s.rain.setVolume(this.rain * 0.55 + this.snow * 0.04, 1);
      s.birds.setVolume(h > 5.5 && h < 10 && this.rain < 0.2 ? 0.6 : 0, 2);
    }
  }
}

function mulberry(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export { pick };
