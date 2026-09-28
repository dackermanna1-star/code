// GPU-instanced billboard particle system with a procedurally painted texture
// atlas (noise-based smoke, flame tongues, fireballs, muzzle stars, sparks...).
// Two batches: additive (fire, sparks, flashes, embers) and alpha (smoke,
// blood, dust, debris). Particles can be lit per-vertex by the scene's light
// pool (smoke/dust/blood read correctly next to fires, lamps and flashlight
// beams), carry colour-over-life, a warm emissive glow (fire-lit smoke),
// velocity-stretched streaks, flat ground-aligned quads (shockwave rings,
// splashes), gravity, drag, bouncing (sparks, debris) and floor collision with
// blood-decal spawning. Ambient ash/embers (outdoors) and dust motes (indoors)
// are emitted around the camera automatically.
import * as THREE from 'three';

export const FR = {
  GLOW: 0, SMOKE1: 1, SMOKE2: 2, SMOKE3: 3, FIRE1: 4, FIRE2: 5, FIRE3: 6, FLASH: 7,
  FLASH2: 8, STREAK: 9, BLOOD: 10, MIST: 11, CHUNK: 12, RING: 13, WATER: 14, DUST: 15,
  // aliases kept for older call sites
  EMBER: 0, BILE: 11, SPRAY: 11,
};

// ------------------------------------------------------------------ atlas --
function makeAtlas() {
  const S = 256, N = 4;
  const c = document.createElement('canvas');
  c.width = c.height = S * N;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cell = (i) => [(i % N) * S, Math.floor(i / N) * S];
  // value noise + fbm
  const P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = rnd();
  const h2 = (x, y) => P[((x & 255) + P[(y & 255)] * 255) & 511 | 0];
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h2(xi, yi), b = h2(xi + 1, yi), cc = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  const fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += vn(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; };
  const pixels = (i, fn) => {
    const [x0, y0] = cell(i);
    const img = g.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, v = (y + 0.5) / S; // v: 0 top .. 1 bottom
      const o = (y * S + x) * 4;
      const r = fn(u, v);
      d[o] = r[0] * 255; d[o + 1] = r[1] * 255; d[o + 2] = r[2] * 255; d[o + 3] = Math.max(0, Math.min(1, r[3])) * 255;
    }
    g.putImageData(img, x0, y0);
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ss = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  // soft glow
  pixels(FR.GLOW, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; const a = Math.pow(clamp01(1 - r), 2.2); return [1, 1, 1, a]; });
  // smoke puffs: fbm density masked by a soft disc, baked top-light shading for volume
  const smoke = (i, sc, off, dens, cut) => pixels(i, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const n = fbm(u * sc + off, v * sc + off * 1.7, 5);
    const n2 = fbm(u * sc * 2.1 + off * 3, v * sc * 2.1, 3);
    const m = clamp01(1 - r * (0.85 + n2 * 0.4));
    let a = ss(cut, cut + 0.35, n * 0.9 + m * 0.75) * Math.pow(m, 0.7) * dens;
    const shade = clamp01(0.62 + (0.5 - v) * 0.5 + (0.5 - u) * 0.18 + (n - 0.5) * 0.5);
    return [shade, shade, shade * 0.98, a];
  });
  smoke(FR.SMOKE1, 3.2, 11.3, 1.0, 0.45);
  smoke(FR.SMOKE2, 4.1, 37.9, 0.95, 0.42);
  smoke(FR.SMOKE3, 2.6, 71.1, 1.1, 0.35);
  // fine grainy dust puff
  pixels(FR.DUST, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = fbm(u * 7 + 5, v * 7 + 9, 4);
    const grain = P[(Math.floor(u * 97) * 31 + Math.floor(v * 89) * 7) & 511];
    const a = clamp01(1 - r) ** 1.3 * (0.35 + n * 0.8) * (0.75 + grain * 0.35);
    return [0.9 + n * 0.1, 0.88 + n * 0.1, 0.85 + n * 0.1, a];
  });
  // flame tongue: tapering upward, turbulent edges, hot core
  pixels(FR.FIRE1, (u, v) => {
    const y = 1 - v; // 0 bottom .. 1 top
    const n = fbm(u * 4 + 3, v * 3 + 1, 4);
    const w = 0.34 * Math.pow(clamp01(1 - y), 0.75) * (0.8 + n * 0.5) + 0.02;
    const dx = Math.abs(u - 0.5 + (n - 0.5) * 0.18 * y);
    let a = ss(w, w * 0.35, dx) * ss(0.0, 0.12, y) * ss(1.0, 0.55, y + n * 0.25);
    const core = ss(w * 0.55, 0, dx) * ss(0.7, 0.1, y);
    a = clamp01(a * (0.75 + n * 0.5));
    return [1, 0.82 + core * 0.18, 0.55 + core * 0.45, a];
  });
  // flame cluster: several tongues
  pixels(FR.FIRE2, (u, v) => {
    const y = 1 - v;
    const n = fbm(u * 5 + 17, v * 4 + 2, 4);
    let a = 0;
    for (const [cx, hgt, wd] of [[0.35, 0.8, 0.16], [0.55, 1.0, 0.2], [0.7, 0.65, 0.13]]) {
      const w = wd * Math.pow(clamp01(1 - y / hgt), 0.7) + 0.01;
      const dx = Math.abs(u - cx + (n - 0.5) * 0.2 * y);
      a = Math.max(a, ss(w, w * 0.3, dx) * ss(hgt, hgt * 0.4, y + n * 0.2));
    }
    a *= ss(0, 0.1, y) * (0.7 + n * 0.6);
    const core = ss(0.55, 0.05, y) * a;
    return [1, 0.8 + core * 0.2, 0.5 + core * 0.5, clamp01(a)];
  });
  // fireball: round turbulent billow with bright pockets
  pixels(FR.FIRE3, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = fbm(u * 4.5 + 41, v * 4.5 + 13, 5);
    const a = ss(1.0, 0.55, r + (n - 0.5) * 0.7);
    const hot = ss(0.45, 0.8, n) * ss(0.9, 0.2, r);
    return [1, 0.75 + hot * 0.25, 0.45 + hot * 0.55, clamp01(a * (0.6 + n * 0.6))];
  });
  // muzzle star: 4 main prongs + 4 minor, hot centre
  pixels(FR.FLASH, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2, ang = Math.atan2(dy, dx);
    const prong = Math.pow(Math.abs(Math.cos(ang * 2)), 18) * 1.0 + Math.pow(Math.abs(Math.cos(ang * 2 + Math.PI / 4 * 2)), 30) * 0.45;
    const n = fbm(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + 5, 3);
    const len = 0.35 + prong * 0.65 * (0.7 + n * 0.5);
    const a = clamp01(ss(len, len * 0.2, r) + ss(0.35, 0, r));
    const core = ss(0.3, 0, r);
    return [1, 0.85 + core * 0.15, 0.6 + core * 0.4, a];
  });
  // side flash: elongated diamond flame (stretched along the barrel)
  pixels(FR.FLASH2, (u, v) => {
    const dx = Math.abs(u - 0.5) * 2, dy = Math.abs(v - 0.5) * 2;
    const n = fbm(u * 6 + 2, v * 3 + 7, 3);
    const w = (1 - dx) * 0.55 * (0.7 + n * 0.6);
    const a = ss(w, w * 0.3, dy) * ss(1, 0.7, dx);
    const core = ss(0.25, 0, dy) * ss(0.8, 0.2, dx);
    return [1, 0.85 + core * 0.15, 0.6 + core * 0.4, clamp01(a)];
  });
  // streak (stretched in the shader)
  pixels(FR.STREAK, (u, v) => { const a = ss(0.5, 0.0, Math.abs(u - 0.5)) * ss(0.5, 0.05, Math.abs(v - 0.5)); return [1, 1, 1, a]; });
  // blood droplet: irregular splat with satellite drops
  {
    const [x, y] = cell(FR.BLOOD);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    for (let k = 0; k <= 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const r = S * (0.18 + rnd() * 0.12);
      const px = x + S / 2 + Math.cos(a) * r, py = y + S / 2 + Math.sin(a) * r;
      k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.fill();
    for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(x + S / 2 + (rnd() - 0.5) * S * 0.8, y + S / 2 + (rnd() - 0.5) * S * 0.8, S * 0.025 * rnd() + 3, 0, 7); g.fill(); }
  }
  // fine mist
  pixels(FR.MIST, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = fbm(u * 9 + 3, v * 9 + 1, 4);
    const sp = P[(Math.floor(u * 61) * 13 + Math.floor(v * 67) * 5) & 511];
    return [1, 1, 1, clamp01(1 - r) ** 1.5 * (0.2 + n * 0.8) * (sp > 0.6 ? 1.2 : 0.7)];
  });
  // debris chip
  {
    const [x, y] = cell(FR.CHUNK);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = S * (0.22 + rnd() * 0.2);
      k === 0 ? g.moveTo(x + S / 2 + Math.cos(a) * r, y + S / 2 + Math.sin(a) * r) : g.lineTo(x + S / 2 + Math.cos(a) * r, y + S / 2 + Math.sin(a) * r);
    }
    g.fill();
    // faceted shading
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.moveTo(x + S / 2, y + S / 2); g.lineTo(x + S * 0.85, y + S * 0.6); g.lineTo(x + S * 0.5, y + S * 0.85); g.fill();
  }
  // shockwave ring
  pixels(FR.RING, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; const n = fbm(u * 8, v * 8, 3); return [1, 1, 1, ss(0.55, 0.85, r) * ss(1.0, 0.86, r) * (0.6 + n * 0.6)]; });
  // water droplet
  pixels(FR.WATER, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; const hl = ss(0.3, 0, Math.hypot(u - 0.4, v - 0.38) * 2); return [0.8 + hl * 0.2, 0.85 + hl * 0.15, 0.9 + hl * 0.1, ss(1, 0.6, r) * (0.6 + hl)]; });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 2;
  return t;
}

// ----------------------------------------------------------------- shader --
const VS = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <lights_pars_begin>
  attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iMisc; attribute vec3 iVel; attribute vec4 iExt;
  uniform float ambientFloor, lightScale;
  varying vec2 vLocal; varying vec2 vCell; varying vec4 vCol; varying vec3 vFx;
  void main(){
    float size = iMisc.x; float rot = iMisc.y; float frame = iMisc.z; float stretch = iMisc.w;
    vec2 corner = position.xy;
    vec4 mv;
    if (stretch < 0.0) {
      // flat, ground-aligned quad (rings, splashes)
      float cs = cos(rot), sn = sin(rot);
      vec2 o = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs) * size;
      mv = modelViewMatrix * vec4(iPos + vec3(o.x, 0.0, o.y), 1.0);
    } else {
      mv = modelViewMatrix * vec4(iPos, 1.0);
      if (stretch > 0.0) {
        vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
        vec2 dir = vv.xy; float l = length(dir);
        dir = l > 1e-4 ? dir / l : vec2(1.0, 0.0);
        vec2 perp = vec2(-dir.y, dir.x);
        mv.xy += dir * corner.x * (size + l * stretch) + perp * corner.y * size * 0.3;
      } else {
        float cs = cos(rot), sn = sin(rot);
        mv.xy += vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs) * size;
      }
    }
    gl_Position = projectionMatrix * mv;
    vec4 mvPosition = mv;
    #include <fog_vertex>
    float fx = mod(frame, 4.0), fy = floor(frame / 4.0);
    vCell = vec2(fx, 3.0 - fy);
    vLocal = position.xy + 0.5;
    vec3 col = iCol.rgb;
    float lit = iExt.x;
    if (lit > 0.0) {
      vec3 p = mv.xyz;
      vec3 ls = ambientLightColor + vec3(ambientFloor);
      #if NUM_HEMI_LIGHTS > 0
        for (int i = 0; i < NUM_HEMI_LIGHTS; i++) ls += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, 0.65);
      #endif
      #if NUM_DIR_LIGHTS > 0
        for (int i = 0; i < NUM_DIR_LIGHTS; i++) ls += directionalLights[i].color * 0.45;
      #endif
      #if NUM_POINT_LIGHTS > 0
        for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
          vec3 l = pointLights[i].position - p;
          ls += pointLights[i].color * getDistanceAttenuation(length(l), pointLights[i].distance, pointLights[i].decay) * 0.6;
        }
      #endif
      #if NUM_SPOT_LIGHTS > 0
        for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
          vec3 l = spotLights[i].position - p;
          float d = length(l);
          float sa = getSpotAttenuation(spotLights[i].coneCos, spotLights[i].penumbraCos, dot(l / max(d, 1e-4), spotLights[i].direction));
          ls += spotLights[i].color * sa * getDistanceAttenuation(d, spotLights[i].distance, spotLights[i].decay) * 0.6;
        }
      #endif
      col *= mix(vec3(1.0), ls * RECIPROCAL_PI * lightScale, lit);
    }
    // warm self-illumination (fire-lit smoke, glowing debris)
    col += vec3(1.0, 0.42, 0.14) * iExt.y;
    vCol = vec4(col, iCol.a);
    vFx = vec3(frame >= 3.5 && frame <= 6.5 ? 1.0 : 0.0, iExt.z, iExt.w);
  }
`;
const FS = /* glsl */ `
  uniform sampler2D atlas; uniform float additive, time;
  varying vec2 vLocal; varying vec2 vCell; varying vec4 vCol; varying vec3 vFx;
  #include <fog_pars_fragment>
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec2 lc = vLocal;
    if (vFx.x > 0.5) {
      // animated turbulence licking up through the flame
      float s = vFx.y * 17.0;
      vec2 q = vec2(lc.x * 3.0 + s, lc.y * 2.5 - time * 3.1 - s);
      float n1 = vn(q), n2 = vn(q * 2.1 + 3.7);
      lc.x += (n1 - 0.5) * 0.22 * lc.y;
      lc.y += (n2 - 0.5) * 0.12;
    }
    lc = clamp(lc, 0.004, 0.996);
    vec4 t = texture2D(atlas, (vCell + lc) / 4.0);
    vec4 c = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
    if (vFx.x > 0.5) {
      // flames: burn away as they age (alpha erosion by noise)
      float e = vn(vLocal * 5.0 + vFx.y * 9.0 + vec2(0.0, -time * 2.0));
      c.a *= smoothstep(vFx.z - 0.25, vFx.z + 0.15, e + 0.35);
    }
    if (c.a < 0.004) discard;
    gl_FragColor = c;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      if (additive > 0.5) gl_FragColor.rgb *= (1.0 - fogFactor * 0.85);
      else gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    #endif
  }
`;

// particle flags
const F_COLLIDE = 1, F_DECAL = 2, F_BOUNCE = 4, F_DRIP = 8, F_FIRE = 16;

class Batch {
  constructor(scene, atlas, cap, additive, shared) {
    this.cap = cap;
    this.n = 0;
    const N = cap;
    const f32 = () => new Float32Array(N);
    this.px = f32(); this.py = f32(); this.pz = f32();
    this.vx = f32(); this.vy = f32(); this.vz = f32();
    this.life = f32(); this.max = f32();
    this.s0 = f32(); this.s1 = f32();
    this.rot = f32(); this.rv = f32();
    this.r = f32(); this.g = f32(); this.b = f32();
    this.r1 = f32(); this.g1 = f32(); this.b1 = f32();
    this.a0 = f32(); this.a1 = f32(); this.fin = f32();
    this.frame = f32(); this.grav = f32(); this.drag = f32();
    this.stretch = f32(); this.flags = new Uint8Array(N); this.bounces = new Uint8Array(N);
    this.lit = f32(); this.emit = f32(); this.seed = f32();
    this.arrays = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'max', 's0', 's1', 'rot', 'rv', 'r', 'g', 'b', 'r1', 'g1', 'b1', 'a0', 'a1', 'fin', 'frame', 'grav', 'drag', 'stretch', 'flags', 'bounces', 'lit', 'emit', 'seed'];
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const ia = (k) => new THREE.InstancedBufferAttribute(new Float32Array(N * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aPos = ia(3); this.aCol = ia(4); this.aMisc = ia(4); this.aVel = ia(3); this.aExt = ia(4);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iExt', this.aExt);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, { atlas: { value: atlas }, additive: { value: additive ? 1 : 0 }, time: { value: 0 }, ambientFloor: { value: 0.035 }, lightScale: { value: 1.0 } }]),
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
      lights: true,
    });
    mat.uniforms.atlas.value = atlas;
    mat.uniforms.time = shared.time; // shared uniform object
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    this.geo = geo;
    scene.add(this.mesh);
  }
  spawn(o) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else i = Math.floor(Math.random() * this.cap); // overwrite random when full
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.life[i] = this.max[i] = o.life || 1;
    this.s0[i] = o.size ?? 0.2; this.s1[i] = o.size1 ?? this.s0[i];
    this.rot[i] = o.rot ?? Math.random() * 6.28; this.rv[i] = o.rv || 0;
    const c = o.color || [1, 1, 1];
    const c1 = o.color1 || c;
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
    this.r1[i] = c1[0]; this.g1[i] = c1[1]; this.b1[i] = c1[2];
    this.a0[i] = o.alpha ?? 1; this.a1[i] = o.alpha1 ?? 0; this.fin[i] = o.fadeIn || 0;
    this.frame[i] = o.frame || 0;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0;
    this.stretch[i] = o.flat ? -1 : (o.stretch || 0);
    this.flags[i] = (o.collide ? F_COLLIDE : 0) | (o.decal ? F_DECAL : 0) | (o.bounce ? F_BOUNCE | F_COLLIDE : 0) | (o.drip ? F_DRIP | F_COLLIDE : 0) | (o.frame >= 4 && o.frame <= 6 ? F_FIRE : 0);
    this.bounces[i] = o.bounce ? (o.bounces ?? 2) : 0;
    this.lit[i] = o.lit || 0; this.emit[i] = o.emit || 0; this.seed[i] = Math.random();
    return i;
  }
  kill(i) {
    const j = --this.n;
    if (i !== j) for (const k of this.arrays) this[k][i] = this[k][j];
  }
  update(dt, sys) {
    const P = this.aPos.array, C = this.aCol.array, M = this.aMisc.array, V = this.aVel.array, X = this.aExt.array;
    const col = sys.col;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dr; this.vz[i] *= dr;
      this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      const fl = this.flags[i];
      if (fl & F_COLLIDE && col && (this.vy[i] < 0 || fl & F_BOUNCE) && (sys.frame + i) % 2 === 0) {
        // cheap floor/wall collision via raycast along velocity
        const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
        if (sp > 0.01) {
          const ix = this.vx[i] / sp, iy = this.vy[i] / sp, iz = this.vz[i] / sp;
          const h = col.raycast(this.px[i], this.py[i], this.pz[i], ix, iy, iz, sp * dt * 2.5 + 0.02, 1);
          if (h) {
            if (fl & F_DECAL && sys.onBloodHit) sys.onBloodHit(h.x, h.y, h.z, h.nx, h.ny, h.nz, this.s0[i]);
            if (fl & F_DRIP) sys.dripHit(h.x, h.y, h.z);
            if (fl & F_BOUNCE && this.bounces[i] > 0) {
              this.bounces[i]--;
              const vn = this.vx[i] * h.nx + this.vy[i] * h.ny + this.vz[i] * h.nz;
              const e = 0.35 + this.seed[i] * 0.2; // restitution
              this.vx[i] = (this.vx[i] - 2 * vn * h.nx) * (h.ny > 0.5 ? 0.55 : e);
              this.vy[i] = (this.vy[i] - 2 * vn * h.ny) * e;
              this.vz[i] = (this.vz[i] - 2 * vn * h.nz) * (h.ny > 0.5 ? 0.55 : e);
              this.px[i] = h.x + h.nx * 0.01; this.py[i] = h.y + h.ny * 0.01; this.pz[i] = h.z + h.nz * 0.01;
              this.rv[i] *= 0.5;
              if (this.bounces[i] === 0 && h.ny > 0.5) { this.vx[i] *= 0.3; this.vy[i] = 0; this.vz[i] *= 0.3; this.grav[i] = 0; this.drag[i] = Math.max(this.drag[i], 6); this.flags[i] &= ~F_COLLIDE; }
              continue;
            }
            this.kill(i);
            continue;
          }
        }
      }
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rv[i] * dt;
    }
    for (let i = 0; i < this.n; i++) {
      const k = 1 - this.life[i] / this.max[i];
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      C[i * 4] = this.r[i] + (this.r1[i] - this.r[i]) * k;
      C[i * 4 + 1] = this.g[i] + (this.g1[i] - this.g[i]) * k;
      C[i * 4 + 2] = this.b[i] + (this.b1[i] - this.b[i]) * k;
      let a = this.a0[i] + (this.a1[i] - this.a0[i]) * k;
      const fi = this.fin[i];
      if (fi > 0 && k < fi) a *= k / fi;
      C[i * 4 + 3] = a;
      const s0 = this.s0[i], s1 = this.s1[i];
      M[i * 4] = s1 > s0 ? s0 + (s1 - s0) * (1 - (1 - k) * (1 - k)) : s0 + (s1 - s0) * k;
      M[i * 4 + 1] = this.rot[i];
      M[i * 4 + 2] = this.frame[i];
      M[i * 4 + 3] = this.stretch[i];
      V[i * 3] = this.vx[i]; V[i * 3 + 1] = this.vy[i]; V[i * 3 + 2] = this.vz[i];
      X[i * 4] = this.lit[i];
      const e = this.emit[i];
      X[i * 4 + 1] = e > 0 ? e * (1 - k) * (1 - k) : 0;
      X[i * 4 + 2] = this.seed[i];
      X[i * 4 + 3] = k;
    }
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aCol, this.aMisc, this.aVel, this.aExt]) {
      a.needsUpdate = true;
      if (a.clearUpdateRanges) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, this.n) * a.itemSize); }
    }
  }
}

const R = Math.random;
const rs = (a) => (R() - 0.5) * a; // symmetric random

export class Particles {
  constructor(scene, quality = 1) {
    const atlas = makeAtlas();
    this.shared = { time: { value: 0 } };
    this.add = new Batch(scene, atlas, Math.round(2500 * quality), true, this.shared);
    this.alpha = new Batch(scene, atlas, Math.round(3500 * quality), false, this.shared);
    this.scene = scene;
    this.frame = 0;
    this.col = null;
    this.onBloodHit = null;
    this.q = quality;
    // ambient emitters around the camera: ash/embers outdoors, dust motes indoors
    this.ambient = { ash: 1, embers: 1, motes: 1, wind: [0.45, 0.12] };
    this._amb = { outdoor: false, t: 0, ash: 0, emb: 0, mote: 0, cam: null };
  }
  update(dt) {
    this.frame++;
    this.shared.time.value += dt;
    if (dt > 0) this.updateAmbient(dt);
    this.add.update(dt, this);
    this.alpha.update(dt, this);
  }
  clear() { this.add.n = 0; this.alpha.n = 0; }

  // ------------------------------------------------------------- ambient --
  updateAmbient(dt) {
    const A = this.ambient, S = this._amb;
    if (!A || !this.col) return;
    if (!S.cam) S.cam = this.scene.children.find((o) => o.isPerspectiveCamera) || null;
    const cam = S.cam;
    if (!cam) return;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    S.t -= dt;
    if (S.t <= 0) {
      S.t = 0.4;
      // outdoors = open sky above the camera
      S.outdoor = !this.col.raycast(cx, cy + 0.2, cz, 0, 1, 0, 45, 7);
    }
    const q = this.q;
    const room = (b) => b.n < b.cap * 0.6;
    if (S.outdoor) {
      const [wx, wz] = A.wind;
      if (A.ash > 0 && room(this.alpha)) {
        S.ash += dt * 13 * q * A.ash;
        while (S.ash >= 1) {
          S.ash -= 1;
          const a = R() * 6.283, d = 2 + Math.sqrt(R()) * 16;
          const g = 0.5 + R() * 0.12;
          this.alpha.spawn({ x: cx + Math.cos(a) * d - wx * 4, y: cy + 4 + R() * 9, z: cz + Math.sin(a) * d - wz * 4, vx: wx + rs(0.3), vy: -0.35 - R() * 0.45, vz: wz + rs(0.3),
            life: 7 + R() * 5, size: 0.022 + R() * 0.022, frame: FR.CHUNK, color: [g, g * 0.97, g * 0.94], alpha: 0.85, alpha1: 0.6, fadeIn: 0.1, rv: rs(5), lit: 0.9 });
        }
      }
      if (A.embers > 0 && room(this.add)) {
        S.emb += dt * 2.2 * q * A.embers;
        while (S.emb >= 1) {
          S.emb -= 1;
          const a = R() * 6.283, d = 3 + Math.sqrt(R()) * 14;
          this.add.spawn({ x: cx + Math.cos(a) * d - wx * 3, y: cy - 1 + R() * 7, z: cz + Math.sin(a) * d - wz * 3, vx: wx * 1.5 + rs(0.6), vy: rs(0.5) + 0.25, vz: wz * 1.5 + rs(0.6),
            life: 3 + R() * 4, size: 0.018 + R() * 0.02, frame: FR.GLOW, color: [1, 0.55, 0.18], color1: [0.8, 0.18, 0.04], alpha: 1, alpha1: 0, fadeIn: 0.15, drag: 0.2, grav: -0.05 });
        }
      }
    } else if (A.motes > 0 && room(this.add)) {
      S.mote += dt * 16 * q * A.motes;
      while (S.mote >= 1) {
        S.mote -= 1;
        const a = R() * 6.283, d = 0.6 + Math.sqrt(R()) * 6;
        this.add.spawn({ x: cx + Math.cos(a) * d, y: cy - 1.2 + R() * 2.6, z: cz + Math.sin(a) * d, vx: rs(0.08), vy: rs(0.05) - 0.01, vz: rs(0.08),
          life: 5 + R() * 5, size: 0.007 + R() * 0.008, frame: FR.GLOW, color: [0.9, 0.85, 0.75], alpha: 0.9, alpha1: 0, fadeIn: 0.25, lit: 1 });
      }
    }
  }

  // ------------------------------------------------------------ emitters --
  // Hot sparks that bounce off floors/walls, cooling from white to deep orange.
  sparks(x, y, z, nx, ny, nz, n = 8, color = [1, 0.75, 0.4], speed = 6) {
    const hot = [Math.min(1.6, color[0] * 1.6), Math.min(1.5, color[1] * 1.5), Math.min(1.4, color[2] * 1.8)];
    const cool = [color[0] * 0.9, color[1] * 0.45, color[2] * 0.25];
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + R() * 0.9);
      const vx = nx * s * 0.6 + rs(s * 1.4), vy = ny * s * 0.6 + (R() - 0.2) * s, vz = nz * s * 0.6 + rs(s * 1.4);
      this.add.spawn({ x, y, z, vx, vy, vz, life: 0.25 + R() * 0.55, size: 0.01 + R() * 0.006, frame: FR.STREAK, color: hot, color1: cool, alpha: 1, alpha1: 0.3, grav: 9.8, drag: 0.8, stretch: 0.03, bounce: R() < 0.7, bounces: 2 });
    }
    this.add.spawn({ x: x + nx * 0.02, y: y + ny * 0.02, z: z + nz * 0.02, life: 0.07, size: 0.22, size1: 0.1, frame: FR.GLOW, color: [1, 0.8, 0.5], alpha: 0.9 });
    if (R() < 0.5) this.alpha.spawn({ x, y, z, vx: nx * 0.4, vy: ny * 0.4 + 0.3, vz: nz * 0.4, life: 0.8, size: 0.04, size1: 0.25, frame: FR.SMOKE2, color: [0.5, 0.5, 0.5], alpha: 0.25, alpha1: 0, drag: 2, grav: -0.3, lit: 0.8 });
  }
  // Bullet impact dust: a fast jet of powder along the normal + a slow haze.
  dust(x, y, z, nx, ny, nz, color = [0.5, 0.48, 0.44], n = 4, size = 0.25) {
    const c = [color[0] * 1.5, color[1] * 1.5, color[2] * 1.5];
    for (let i = 0; i < n; i++) {
      const s = 1.2 + R() * 2.5;
      this.alpha.spawn({ x, y, z, vx: nx * s + rs(0.8), vy: ny * s + R() * 0.4, vz: nz * s + rs(0.8),
        life: 0.5 + R() * 0.7, size: size * 0.3, size1: size * (1.2 + R()), frame: i % 2 ? FR.DUST : FR.SMOKE2, color: c, alpha: 0.55, alpha1: 0, fadeIn: 0.05, drag: 4.5, grav: -0.08, rv: rs(2), lit: 0.75 });
    }
    // lingering haze
    this.alpha.spawn({ x: x + nx * 0.15, y: y + ny * 0.15, z: z + nz * 0.15, vx: nx * 0.3, vy: 0.08, vz: nz * 0.3, life: 1.6 + R(), size: size * 0.6, size1: size * 3, frame: FR.SMOKE1, color: c, alpha: 0.18, alpha1: 0, fadeIn: 0.2, drag: 1.5, rv: rs(0.5), lit: 0.75 });
  }
  // Debris chips that bounce; wood-coloured chips become splinters, glass glints.
  chips(x, y, z, nx, ny, nz, color = [0.35, 0.33, 0.3], n = 5) {
    const wood = color[0] > color[2] * 1.9 && color[1] > color[2] * 1.3 && color[0] < color[1] * 1.6;
    const glass = color[2] > color[0] * 1.02 && color[1] > 0.4;
    for (let i = 0; i < n; i++) {
      const s = 2 + R() * 3.5;
      const k = 0.8 + R() * 0.4;
      this.alpha.spawn({ x, y, z, vx: nx * s + rs(3), vy: ny * s + R() * 2.2, vz: nz * s + rs(3),
        life: 0.9 + R() * 0.9, size: (wood ? 0.012 : 0.015) + R() * 0.02, frame: FR.CHUNK, color: [color[0] * k * 1.3, color[1] * k * 1.3, color[2] * k * 1.3], alpha: 1, alpha1: 1,
        grav: 13, rv: rs(24), stretch: wood ? 0.05 : 0, bounce: true, bounces: 2, lit: 0.85 });
    }
    if (glass) for (let i = 0; i < 3; i++) this.add.spawn({ x, y, z, vx: nx * 2 + rs(2), vy: ny * 2 + R() * 1.5, vz: nz * 2 + rs(2), life: 0.5 + R() * 0.4, size: 0.012, frame: FR.GLOW, color: [0.8, 0.9, 1], alpha: 0.8, alpha1: 0, grav: 12, lit: 1 });
  }
  // Blood: dark, glossy droplets (lit so they are near-black in the dark and
  // deep red under light), a few stretched streaks and a thin mist.
  blood(x, y, z, dx, dy, dz, amount = 1, decal = true) {
    this.screenBlood?.(x, y, z, amount); // lens splatter on close kills (set by the renderer)
    const n = Math.round(6 * amount * this.q) + 2;
    for (let i = 0; i < n; i++) {
      const s = 1.5 + R() * 4 * amount;
      const k = 0.7 + R() * 0.5;
      this.alpha.spawn({ x, y, z, vx: dx * s + rs(2.5), vy: dy * s + R() * 2.2, vz: dz * s + rs(2.5),
        life: 0.6 + R() * 0.6, size: 0.02 + R() * 0.03, frame: FR.BLOOD, color: [0.42 * k, 0.03 * k, 0.025 * k], color1: [0.3 * k, 0.02 * k, 0.018 * k], alpha: 1, alpha1: 0.9,
        grav: 13, collide: true, decal: decal && i < 3, stretch: i % 3 === 0 ? 0.035 : 0.012, lit: 0.8 });
    }
    for (let i = 0; i < 1 + amount; i++) {
      this.alpha.spawn({ x, y, z, vx: dx * 1.5 + rs(1), vy: dy + R() * 0.5, vz: dz * 1.5 + rs(1),
        life: 0.3 + R() * 0.35, size: 0.06, size1: 0.3 + amount * 0.2, frame: FR.MIST, color: [0.35, 0.03, 0.025], alpha: 0.45, alpha1: 0, drag: 5, lit: 0.7 });
    }
  }
  bloodSpurt(x, y, z, dx, dy, dz) {
    this.alpha.spawn({ x, y, z, vx: dx * 3 + rs(1), vy: dy * 3 + 1 + R(), vz: dz * 3 + rs(1),
      life: 0.7, size: 0.028, frame: FR.BLOOD, color: [0.38, 0.025, 0.02], color1: [0.26, 0.015, 0.012], alpha: 1, alpha1: 1, grav: 12, collide: true, decal: R() < 0.3, stretch: 0.03, lit: 0.8 });
  }
  // Muzzle flash shaped by weapon class (scale: 0.9 pistol, 1 SMG/rifle,
  // 1.3 heavy, 1.4 launcher, 1.6 shotgun), plus powder smoke wisps.
  muzzle(x, y, z, dx, dy, dz, scale = 1, color = [1, 0.75, 0.4]) {
    const hot = [color[0] * 1.3, color[1] * 1.25, color[2] * 1.2];
    const shotgun = scale >= 1.55, launcher = scale > 1.35 && scale < 1.55, heavy = scale > 1.15 && scale <= 1.35, pistol = scale < 0.95;
    const rot = R() * 6.28;
    if (launcher) {
      this.add.spawn({ x, y, z, life: 0.06, size: 0.3, size1: 0.2, frame: FR.FIRE3, color: hot, alpha: 0.8, alpha1: 0 });
      for (let i = 0; i < 4; i++) this.alpha.spawn({ x: x + dx * 0.1, y: y + dy * 0.1, z: z + dz * 0.1, vx: dx * (1 + R() * 2) + rs(0.4), vy: dy * 1.5 + 0.3, vz: dz * (1 + R() * 2) + rs(0.4), life: 1.2 + R(), size: 0.1, size1: 0.8, frame: FR.SMOKE1 + (i % 3), color: [0.6, 0.6, 0.58], alpha: 0.35, alpha1: 0, drag: 2.5, grav: -0.3, rv: rs(1), lit: 0.8 });
      return;
    }
    // front star (reads from first person)
    this.add.spawn({ x, y, z, life: 0.045, size: (shotgun ? 0.5 : heavy ? 0.42 : pistol ? 0.24 : 0.32) * scale, size1: 0.2 * scale, frame: FR.FLASH, rot, color: hot, alpha: 1, alpha1: 0.5 });
    // hot core
    this.add.spawn({ x, y, z, life: 0.035, size: 0.16 * scale, size1: 0.08, frame: FR.GLOW, color: [1.4, 1.2, 0.9], alpha: 1, alpha1: 0.4 });
    // forward flame (reads from the side: elongated along the barrel)
    const fl = shotgun ? 0.07 : heavy ? 0.09 : pistol ? 0.035 : 0.06;
    this.add.spawn({ x: x + dx * 0.08 * scale, y: y + dy * 0.08 * scale, z: z + dz * 0.08 * scale, vx: dx * 3, vy: dy * 3, vz: dz * 3, life: 0.04, size: 0.1 * scale, frame: FR.FLASH2, color: hot, alpha: 0.9, alpha1: 0.3, stretch: fl });
    if (shotgun) {
      // wide ball of burning powder + a few unburnt grains
      this.add.spawn({ x: x + dx * 0.15, y: y + dy * 0.15, z: z + dz * 0.15, life: 0.06, size: 0.35, size1: 0.5, frame: FR.FIRE3, rot, color: [1, 0.6, 0.25], alpha: 0.8, alpha1: 0 });
      for (let i = 0; i < 4; i++) this.add.spawn({ x, y, z, vx: dx * 12 + rs(3), vy: dy * 12 + rs(3), vz: dz * 12 + rs(3), life: 0.12 + R() * 0.1, size: 0.008, frame: FR.STREAK, color: [1, 0.7, 0.3], alpha: 1, alpha1: 0, stretch: 0.02, grav: 3 });
    }
    if (heavy) {
      for (const sgn of [-1, 1]) {
        // side prongs (muzzle-brake style)
        const px = -dz * sgn, pz = dx * sgn;
        this.add.spawn({ x: x + dx * 0.05, y, z: z + dz * 0.05, vx: px * 2, vy: 0, vz: pz * 2, life: 0.035, size: 0.06, frame: FR.FLASH2, color: hot, alpha: 0.8, alpha1: 0, stretch: 0.05 });
      }
    }
    // powder smoke: a quick burst plus a slow curling wisp
    const nS = shotgun ? 3 : heavy ? 2 : 1;
    for (let i = 0; i < nS; i++) {
      this.alpha.spawn({ x: x + dx * 0.12, y: y + dy * 0.12, z: z + dz * 0.12, vx: dx * (1.2 + R() * 1.5) + rs(0.3), vy: dy * 1.5 + 0.25 + R() * 0.2, vz: dz * (1.2 + R() * 1.5) + rs(0.3),
        life: 0.7 + R() * 0.6, size: 0.06 * scale, size1: (0.35 + R() * 0.3) * scale, frame: FR.SMOKE1 + (i % 3), color: [0.62, 0.62, 0.6], alpha: shotgun ? 0.28 : 0.18, alpha1: 0, fadeIn: 0.05, drag: 3, grav: -0.35, rv: rs(1.5), lit: 0.75 });
    }
    if (R() < 0.35) this.alpha.spawn({ x, y, z, vx: dx * 0.3, vy: 0.35, vz: dz * 0.3, life: 1.8, size: 0.03, size1: 0.2, frame: FR.SMOKE2, color: [0.7, 0.7, 0.68], alpha: 0.12, alpha1: 0, fadeIn: 0.1, drag: 1, grav: -0.2, rv: rs(0.8), lit: 0.8 });
  }
  tracer(x, y, z, dx, dy, dz, speed = 260, len = 0.03) {
    this.add.spawn({ x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, life: 0.12, size: 0.014, frame: FR.STREAK, color: [1.3, 1.0, 0.6], color1: [1, 0.6, 0.3], alpha: 0.95, alpha1: 0.4, stretch: len });
  }
  // Explosion: flash, turbulent fireball, shockwave rings, bouncing debris and
  // embers, a ground dust skirt and a dense column of fire-lit smoke.
  explosion(x, y, z, scale = 1) {
    const q = this.q;
    this.add.spawn({ x, y: y + 0.4 * scale, z, life: 0.16, size: 2.5 * scale, size1: 7 * scale, frame: FR.GLOW, color: [1.5, 1.1, 0.7], alpha: 1, alpha1: 0 });
    // fireball
    const nb = Math.max(4, Math.round(16 * q * scale));
    for (let i = 0; i < nb; i++) {
      const a = R() * 6.28, e = R() * 1.3, s = (2 + R() * 6) * scale;
      this.add.spawn({ x: x + rs(0.4 * scale), y: y + 0.2 + R() * 0.6 * scale, z: z + rs(0.4 * scale), vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1.5, vz: Math.sin(a) * Math.cos(e) * s,
        life: 0.45 + R() * 0.55, size: 0.6 * scale, size1: (1.8 + R()) * scale, frame: i % 3 === 0 ? FR.FIRE2 : FR.FIRE3, color: [1.6, 1.15, 0.6], color1: [0.9, 0.22, 0.04], alpha: 1, alpha1: 0, drag: 3.5, rv: rs(4), grav: -1.5 });
    }
    // rising flames
    for (let i = 0; i < 6 * q * scale; i++) {
      this.add.spawn({ x: x + rs(1.2 * scale), y: y + 0.3, z: z + rs(1.2 * scale), vx: rs(1), vy: 2 + R() * 3, vz: rs(1), life: 0.6 + R() * 0.5, size: 0.8 * scale, size1: 0.3 * scale, frame: FR.FIRE1, color: [1.3, 0.8, 0.35], color1: [0.8, 0.2, 0.05], alpha: 0.9, alpha1: 0 });
    }
    this.shockwave(x, y, z, 4 * scale);
    // dark fire-lit smoke column (lingers)
    const ns = Math.max(6, Math.round(22 * q * scale));
    for (let i = 0; i < ns; i++) {
      const a = R() * 6.28, s = (0.6 + R() * 3) * scale;
      const g = 0.14 + R() * 0.06;
      this.alpha.spawn({ x: x + rs(scale), y: y + 0.4 + R() * scale, z: z + rs(scale), vx: Math.cos(a) * s, vy: 1.2 + R() * 2.6, vz: Math.sin(a) * s,
        life: 4 + R() * 5, size: 0.8 * scale, size1: (3 + R() * 2.5) * scale, frame: FR.SMOKE1 + (i % 3), color: [g, g * 0.95, g * 0.9], color1: [g * 1.4, g * 1.4, g * 1.38], alpha: 0.75, alpha1: 0, fadeIn: 0.04,
        drag: 1.4, grav: -0.35, rv: rs(0.6), lit: 0.85, emit: 0.9 + R() * 0.6 });
    }
    // ground dust skirt
    for (let i = 0; i < 10 * q * scale; i++) {
      const a = (i / (10 * q * scale)) * 6.28 + rs(0.3), s = (4 + R() * 4) * scale;
      this.alpha.spawn({ x, y: y + 0.1, z, vx: Math.cos(a) * s, vy: 0.3 + R() * 0.4, vz: Math.sin(a) * s, life: 1.4 + R(), size: 0.4 * scale, size1: 1.8 * scale, frame: FR.DUST, color: [0.42, 0.39, 0.35], alpha: 0.45, alpha1: 0, drag: 2.6, rv: rs(1), lit: 0.8 });
    }
    // embers & sparks (bounce)
    for (let i = 0; i < 26 * q * scale; i++) {
      const a = R() * 6.28, s = 4 + R() * 12;
      this.add.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: 2 + R() * 9, vz: Math.sin(a) * s, life: 0.8 + R() * 1.4, size: 0.022 + R() * 0.02, frame: i % 3 ? FR.GLOW : FR.STREAK, color: [1.4, 0.9, 0.4], color1: [0.9, 0.25, 0.05], alpha: 1, alpha1: 0, grav: 9, drag: 0.4, stretch: i % 3 ? 0 : 0.025, bounce: true, bounces: 1 });
    }
    // debris chunks (bounce, some smouldering)
    for (let i = 0; i < 14 * q * scale; i++) {
      const a = R() * 6.28, s = 3 + R() * 8;
      const g = 0.12 + R() * 0.1;
      this.alpha.spawn({ x, y: y + 0.2, z, vx: Math.cos(a) * s, vy: 3 + R() * 7, vz: Math.sin(a) * s, life: 1.6 + R() * 1.5, size: 0.04 + R() * 0.07, frame: FR.CHUNK, color: [g, g * 0.95, g * 0.9], alpha: 1, alpha1: 1, grav: 14, rv: rs(20), bounce: true, bounces: 2, lit: 0.9, emit: R() < 0.3 ? 0.6 : 0 });
    }
  }
  // Layered fire: white-hot core, orange body, red tips burning away into
  // fire-lit smoke, plus drifting embers. Called every frame per source.
  fire(x, y, z, intensity = 1) {
    const s = intensity;
    if (R() < 0.9) {
      const k = R();
      this.add.spawn({ x: x + rs(0.4 * s), y, z: z + rs(0.4 * s), vx: rs(0.3), vy: 1.1 + R() * 1.4, vz: rs(0.3),
        life: 0.45 + R() * 0.5, size: (0.32 + k * 0.18) * s, size1: 0.1 * s, frame: k < 0.5 ? FR.FIRE1 : FR.FIRE2, rot: rs(0.35), rv: rs(1.2),
        color: [1.25, 0.72 + R() * 0.15, 0.28], color1: [0.85, 0.2, 0.04], alpha: 0.95, alpha1: 0.15, fadeIn: 0.08 });
    }
    if (R() < 0.45) {
      // hot core at the base
      this.add.spawn({ x: x + rs(0.25 * s), y: y + 0.05, z: z + rs(0.25 * s), vx: rs(0.2), vy: 0.6 + R() * 0.6, vz: rs(0.2),
        life: 0.25 + R() * 0.2, size: 0.2 * s, size1: 0.12 * s, frame: FR.FIRE1, rot: rs(0.2), color: [1.5, 1.2, 0.75], color1: [1.2, 0.6, 0.2], alpha: 0.8, alpha1: 0 });
    }
    if (R() < 0.28) {
      const g = 0.1 + R() * 0.05;
      this.alpha.spawn({ x: x + rs(0.3 * s), y: y + 0.7 * s, z: z + rs(0.3 * s), vx: rs(0.4), vy: 0.9 + R(), vz: rs(0.4),
        life: 2.2 + R() * 2.2, size: 0.3 * s, size1: 1.9 * s, frame: FR.SMOKE1 + Math.floor(R() * 3), color: [g, g * 0.95, g * 0.92], color1: [g * 1.2, g * 1.2, g * 1.18], alpha: 0.5, alpha1: 0, fadeIn: 0.12,
        drag: 0.4, grav: -0.3, rv: rs(1), lit: 0.8, emit: 0.55 });
    }
    if (R() < 0.12) this.add.spawn({ x: x + rs(0.3 * s), y: y + 0.3, z: z + rs(0.3 * s), vx: rs(1.5), vy: 1.5 + R() * 2.2, vz: rs(1.5), life: 1 + R() * 1.4, size: 0.016 + R() * 0.012, frame: FR.GLOW, color: [1.4, 0.8, 0.3], color1: [0.9, 0.2, 0.03], alpha: 1, alpha1: 0, drag: 0.6, grav: -0.4 });
  }
  // Dense rolling smoke column (billowing puffs that darken and spread).
  smokeColumn(x, y, z, size = 1, color = [0.12, 0.12, 0.12]) {
    const c = [color[0] * 1.6, color[1] * 1.6, color[2] * 1.6];
    this.alpha.spawn({ x: x + rs(size), y, z: z + rs(size), vx: rs(0.3) + 0.25, vy: 0.8 + R() * 0.8, vz: rs(0.3),
      life: 6 + R() * 4, size: 0.9 * size, size1: (4.5 + R() * 2) * size, frame: FR.SMOKE1 + Math.floor(R() * 3), color: c, color1: [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15], alpha: 0.5, alpha1: 0, fadeIn: 0.1,
      drag: 0.12, grav: -0.18, rv: rs(0.35), lit: 0.85, emit: 0.25 });
  }
  cloud(x, y, z, r, color, n = 20, life = 6) {
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, d = R() * r;
      this.alpha.spawn({ x: x + Math.cos(a) * d, y: y + R() * 1.2, z: z + Math.sin(a) * d, vx: rs(0.3), vy: 0.1 + R() * 0.2, vz: rs(0.3),
        life: life * (0.6 + R() * 0.6), size: r * 0.4, size1: r * 1.3, frame: FR.SMOKE1 + (i % 3), color, alpha: 0.5, alpha1: 0, fadeIn: 0.08, drag: 0.5, rv: rs(0.4), lit: 0.35 });
    }
  }
  splash(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      this.alpha.spawn({ x, y, z, vx: rs(2.5), vy: 2 + R() * 2.5, vz: rs(2.5), life: 0.5 + R() * 0.3, size: 0.035, frame: FR.WATER, color: [0.7, 0.75, 0.72], alpha: 0.7, alpha1: 0, grav: 12, stretch: 0.02, lit: 0.9 });
    }
    this.alpha.spawn({ x, y: y + 0.01, z, life: 0.6, size: 0.1, size1: 0.6 + n * 0.02, frame: FR.RING, color: [0.8, 0.85, 0.85], alpha: 0.5, alpha1: 0, flat: true, lit: 0.9 });
  }
  // Water drip from a ceiling point; splashes where it lands.
  drip(x, y, z) {
    this.alpha.spawn({ x, y, z, vy: -0.5, life: 3, size: 0.012, frame: FR.WATER, color: [0.75, 0.8, 0.8], alpha: 0.85, alpha1: 0.85, grav: 9.8, stretch: 0.012, drip: true, lit: 1 });
  }
  dripHit(x, y, z) {
    for (let i = 0; i < 3; i++) this.alpha.spawn({ x, y: y + 0.01, z, vx: rs(0.8), vy: 0.8 + R() * 0.8, vz: rs(0.8), life: 0.3, size: 0.008, frame: FR.WATER, color: [0.75, 0.8, 0.8], alpha: 0.7, alpha1: 0, grav: 10, lit: 1 });
    this.alpha.spawn({ x, y: y + 0.005, z, life: 0.5, size: 0.02, size1: 0.18, frame: FR.RING, color: [0.8, 0.85, 0.85], alpha: 0.35, alpha1: 0, flat: true, lit: 1 });
  }
  bileSpray(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 8; i++) {
      const s = 5 + R() * 4;
      this.alpha.spawn({ x, y, z, vx: dx * s + rs(1.5), vy: dy * s + R() * 1.5, vz: dz * s + rs(1.5),
        life: 0.9, size: 0.08, size1: 0.35, frame: FR.MIST, color: [0.45, 0.55, 0.1], alpha: 0.9, alpha1: 0.2, grav: 8, drag: 0.8, lit: 0.4 });
    }
  }
  shockwave(x, y, z, r = 4) {
    this.add.spawn({ x, y, z, life: 0.22, size: 0.5, size1: r * 2, frame: FR.RING, color: [1, 0.85, 0.7], alpha: 0.45, alpha1: 0 });
    this.alpha.spawn({ x, y: y + 0.05, z, life: 0.55, size: 0.6, size1: r * 2.6, frame: FR.RING, color: [0.5, 0.47, 0.42], alpha: 0.6, alpha1: 0, flat: true, lit: 0.8 });
  }
}
