import * as THREE from 'three';
import { WORLD, FOG_PARS } from './worldMat.js';
import { hash2, vnoise } from './textures.js';

/**
 * The sky and everything at infinity: a gradient dome with sun glow and banded clouds lit from
 * below at dusk, a big low sun, stars (1-texel points, dithered in as the light goes), the moon
 * with a halo, a lightning bolt for storms, and three painter-sorted mountain ridges all round the
 * valley (they write depth at the far plane so the stars and the moon's halo sit behind them;
 * the world draws over them). The horizon colour equals the world fog colour in every direction,
 * so the haze melts into the sky.
 *
 * Render order: dome -1000, stars -990, moon -985, bolt -980, ridges -970..-950.
 */

export const SKY = {
  uSkyZenith: { value: new THREE.Color(0x2a2a4a) },
  uSkyMid: { value: new THREE.Color(0x6a5a78) },
  uSunDir: { value: new THREE.Vector3(-0.99, 0.06, -0.08).normalize() },
  uSunColor: { value: new THREE.Color(0xffd090) },
  uSunGlow: { value: new THREE.Color(0xd06a30) },
  uSunSize: { value: 0.045 },
  uSunVis: { value: 1 },
  uMoonDir: { value: new THREE.Vector3(0.55, 0.42, 0.72).normalize() },
  uStarAlpha: { value: 0 },
  uCloudCover: { value: 0.45 },
  uCloudDark: { value: new THREE.Color(0x3a2e42) },
  uCloudLit: { value: new THREE.Color(0xe08a58) },
  uCloudShift: { value: new THREE.Vector2(0, 0) },
  uMtnFar: { value: new THREE.Color(0x4a4060) },
  uMtnNear: { value: new THREE.Color(0x2a2434) },
  uAlpenglow: { value: new THREE.Color(0xb06a60) },
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSunGlow;
uniform float uSunSize;
uniform float uSunVis;
uniform float uCloudCover;
uniform vec3 uCloudDark;
uniform vec3 uCloudLit;
uniform vec2 uCloudShift;
uniform float uTime;
float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = sHash(i), b = sHash(i + vec2(1.0, 0.0)), c = sHash(i + vec2(0.0, 1.0)), d = sHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float sFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * sNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s / 0.9375;
}
// cloud cover and lighting at a sky direction (d.y > 0)
vec2 skyCloud(vec3 d) {
  vec2 cp = d.xz / (d.y + 0.07);
  cp = vec2(cp.x * 0.55, cp.y * 1.25) * 1.3 + uCloudShift;
  float n = sFbm(cp);
  float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.28, n);
  float n2 = sFbm(cp + normalize(uSunDir.xz + 1e-4) * 0.22);
  float lit = clamp(0.55 + (n - n2) * 4.0, 0.0, 1.0);
  cov *= smoothstep(0.0, 0.16, d.y);
  return vec2(cov, lit);
}
vec3 skyColor(vec3 d) {
  float h = d.y;
  vec3 fogc = worldFogColor(d);
  float t = clamp(h, 0.0, 1.0);
  vec3 col = mix(fogc, uSkyMid, smoothstep(0.0, 0.22, t));
  col = mix(col, uSkyZenith, smoothstep(0.18, 0.85, t));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunGlow * (pow(sd, 5.0) * 0.55 + pow(sd, 40.0) * 0.5) * smoothstep(-0.05, 0.1, h + 0.05);
  // clouds
  if (h > 0.0) {
    vec2 c = skyCloud(d);
    vec3 cc = mix(uCloudDark, uCloudLit, c.y);
    cc += uSunGlow * pow(sd, 6.0) * 0.6 * c.y;
    col = mix(col, cc, c.x * 0.92);
    // the sun disc, dimmed behind clouds
    float ang = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
    float disc = smoothstep(uSunSize, uSunSize * 0.82, ang) * uSunVis;
    col = mix(col, uSunColor, disc * (1.0 - c.x * 0.75));
  }
  return col;
}
`;

function skyDome() {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const uniforms = { ...SKY };
  for (const k of Object.keys(WORLD)) uniforms[k] = WORLD[k];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
        p.z = p.w * 0.99999;
        gl_Position = p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${FOG_PARS}
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyColor(d);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

function stars() {
  const N = 1100;
  const pos = new Float32Array(N * 3), info = new Float32Array(N * 3);
  let k = 0;
  for (let i = 0; i < N * 4 && k < N; i++) {
    const u = hash2(i, 1, 501), v = hash2(i, 2, 501);
    const y = u; // upper hemisphere, denser toward the horizon is fine
    const r = Math.sqrt(1 - y * y), a = v * Math.PI * 2;
    if (y < 0.04) continue;
    pos[k * 3] = Math.cos(a) * r;
    pos[k * 3 + 1] = y;
    pos[k * 3 + 2] = Math.sin(a) * r;
    const b = hash2(i, 3, 501);
    info[k * 3] = 0.25 + 0.75 * b * b * b; // brightness
    info[k * 3 + 1] = hash2(i, 4, 501) * 6.28; // twinkle phase
    info[k * 3 + 2] = hash2(i, 5, 501); // colour
    k++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
  geo.setAttribute('info', new THREE.BufferAttribute(info.subarray(0, k * 3), 3));
  const uniforms = { ...SKY };
  for (const key of Object.keys(WORLD)) uniforms[key] = WORLD[key];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 info;
      uniform float uStarAlpha;
      varying vec3 vCol;
      varying float vA;
      ${FOG_PARS}
      ${SKY_GLSL}
      void main() {
        vec4 p = projectionMatrix * viewMatrix * vec4(position * 400.0 + cameraPosition, 1.0);
        p.z = p.w * 0.99999;
        gl_Position = p;
        float tw = 0.65 + 0.35 * sin(uTime * (2.0 + info.y) + info.y * 7.0);
        vec2 c = skyCloud(position);
        vA = uStarAlpha * info.x * tw * (1.0 - c.x) * smoothstep(0.03, 0.2, position.y);
        vCol = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), info.z) * (0.7 + info.x * 1.2);
        gl_PointSize = info.x > 0.85 ? 2.0 : 1.0;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying float vA;
      void main() {
        ivec2 q = ivec2(gl_FragCoord.xy) & 3;
        int i = q.x + q.y * 4;
        float th = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0;
        if (vA < th + 0.03) discard;
        gl_FragColor = vec4(vCol * (0.6 + vA), 1.0);
      }`,
    depthWrite: false, depthTest: false, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -990;
  pts.frustumCulled = false;
  return pts;
}

function moon(T) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: T.moon }, uK: { value: 1 }, uFlash: WORLD.uFlash },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        p.z = p.w * 0.99998;
        gl_Position = p;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float uK;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5 || uK < 0.02) discard;
        gl_FragColor = vec4(t.rgb * 1.25 * uK, 1.0);
      }`,
    depthWrite: false, depthTest: false, toneMapped: false,
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  disc.renderOrder = -985;
  disc.frustumCulled = false;
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: T.glow }, uK: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          p.z = p.w * 0.99999;
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float uK;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(vec3(0.55, 0.62, 0.8) * texture2D(map, vUv).r * 0.35 * uK, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false,
    }),
  );
  halo.frustumCulled = false;
  g.add(halo, disc);
  g.userData = { disc, halo };
  return g;
}

function bolt() {
  const N = 40;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } },
    vertexShader: /* glsl */ `
      void main() {
        vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
        p.z = p.w * 0.99997;
        gl_Position = p;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK;
      void main() { gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * (1.5 + 2.0 * uK), 1.0); }`,
    depthWrite: false, depthTest: false, toneMapped: false,
  });
  const line = new THREE.LineSegments(geo, mat);
  line.renderOrder = -980;
  line.frustumCulled = false;
  line.visible = false;
  /** Rebuild the bolt toward azimuth a (rad), branching a little; R: () => [0,1). */
  line.userData.strike = (a, R) => {
    const p = geo.attributes.position.array;
    let n = 0;
    const seg = (x0, y0, z0, x1, y1, z1) => {
      if (n >= N) return;
      p.set([x0, y0, z0, x1, y1, z1], n * 6);
      n++;
    };
    const dist = 420;
    const top = 150 + R() * 60;
    let x = Math.cos(a) * dist, z = Math.sin(a) * dist, y = top;
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const nx = x + (R() - 0.5) * 18, ny = y - (top + 10) / steps, nz = z + (R() - 0.5) * 18;
      seg(x, y, z, nx, ny, nz);
      if (R() < 0.2) {
        let bx = nx, by = ny, bz = nz;
        for (let j = 0; j < 3; j++) {
          const qx = bx + (R() - 0.5) * 22, qy = by - 7 - R() * 6, qz = bz + (R() - 0.5) * 22;
          seg(bx, by, bz, qx, qy, qz);
          bx = qx;
          by = qy;
          bz = qz;
        }
      }
      x = nx;
      y = ny;
      z = nz;
    }
    geo.setDrawRange(0, n * 2);
    geo.attributes.position.needsUpdate = true;
  };
  return line;
}

function smooth01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Ridge profile: ridged noise along the azimuth, a few dominant peaks. */
function ridge(theta, seed, sharp) {
  let s = 0, a = 1, f = 5, n0 = 0;
  for (let o = 0; o < 7; o++) {
    const n = vnoise((theta / (Math.PI * 2)) * f, o * 7.3, f, 64, seed + o);
    // ridged octaves sharpen the peaks; later octaves ride on the big shapes (erosion-ish)
    const v = sharp ? 1 - Math.abs(n * 2 - 1) : n;
    s += a * v * (o === 0 ? 1 : 0.6 + 0.8 * n0);
    if (o === 0) n0 = v;
    a *= 0.48;
    f *= 2;
  }
  return s / 1.9;
}

function mountains() {
  const g = new THREE.Group();
  // layer: [radius (fog distance), base elevation, height scale, seed, colour mix (0 far .. 1 near), haze]
  const layers = [
    [3000, 0.05, 0.15, 601, 0, 0.6],
    [1900, 0.04, 0.085, 611, 0.5, 0.44],
    [1150, 0.032, 0.05, 621, 1, 0.3],
  ];
  layers.forEach(([R, e0, eh, seed, near, haze], li) => {
    const N = 720;
    const pos = [], vv = [], idx = [];
    // a range of peaks: each a rounded triangle in azimuth; the ridge is their envelope, with
    // ridged noise riding on it for crags and saddles
    const np = [14, 22, 30][li];
    const peaks = [];
    for (let k = 0; k < np; k++) {
      const u = hash2(k, li, seed);
      peaks.push([u * Math.PI * 2, 0.35 + 0.65 * hash2(k, li + 9, seed) ** 1.5, (0.1 + 0.22 * hash2(k, li + 17, seed)) * (li === 0 ? 1.3 : 1)]);
    }
    const env = (th) => {
      let m = 0;
      for (const [c, h, w] of peaks) {
        const d = Math.abs(Math.atan2(Math.sin(th - c), Math.cos(th - c))) / w;
        if (d < 1) m = Math.max(m, h * Math.pow(1 - d, 1.25 + h * 0.6));
      }
      return m;
    };
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      let e = e0 + eh * (env(th) * (0.82 + 0.3 * ridge(th, seed, true)) + 0.12 * ridge(th, seed + 5, false));
      // keep the far west lower round the sunset (the sun sits on a notch behind the steeple)
      const dw = Math.abs(Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI)));
      e *= 0.62 + 0.38 * smooth01(0.05, 0.45, dw);
      const cx = Math.cos(th), cz = Math.sin(th);
      pos.push(cx * Math.cos(e) * R, Math.sin(e) * R, cz * Math.cos(e) * R, cx * R, -0.06 * R, cz * R);
      vv.push(1, 0);
      if (i < N) {
        const k = i * 2;
        idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('ridge', new THREE.Float32BufferAttribute(vv, 1));
    geo.setIndex(idx);
    const uniforms = { ...SKY, uNearMix: { value: near }, uHaze: { value: haze } };
    for (const k of Object.keys(WORLD)) uniforms[k] = WORLD[k];
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        attribute float ridge;
        varying vec3 vDir;
        varying float vRidge;
        void main() {
          vDir = position;
          vRidge = ridge;
          vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
          p.z = p.w * 0.99996;
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uMtnFar;
        uniform vec3 uMtnNear;
        uniform vec3 uAlpenglow;
        uniform vec3 uSunDir;
        uniform float uNearMix;
        uniform float uHaze;
        varying vec3 vDir;
        varying float vRidge;
        ${FOG_PARS}
        float mh(vec2 p) { p = fract(p * vec2(443.8, 441.4)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
        void main() {
          vec3 d = normalize(vDir);
          vec3 base = mix(uMtnFar, uMtnNear, uNearMix);
          // slopes: a little texture from the direction, brighter toward the ridge
          float az = atan(d.z, d.x);
          float streak = mh(vec2(floor(az * 260.0), floor(d.y * 900.0)));
          base *= 0.86 + 0.18 * streak * vRidge;
          // alpenglow on the peaks facing away from the sun; a rim on the ones in front of it
          vec2 sxz = normalize(uSunDir.xz + 1e-4);
          float away = max(-dot(normalize(d.xz), sxz), 0.0);
          float toward = max(dot(normalize(d.xz), sxz), 0.0);
          base += uAlpenglow * pow(away, 1.5) * smoothstep(0.35, 1.0, vRidge) * 0.55;
          base += uAlpenglow * pow(toward, 8.0) * smoothstep(0.8, 1.0, vRidge) * 0.35;
          float haze = mix(min(1.0, uHaze + 0.3), uHaze, smoothstep(0.0, 0.8, vRidge));
          // toward the sun the ridges stand as flat silhouettes in the glare
          haze = mix(haze, haze * 0.7, pow(toward, 3.0));
          vec3 c = mix(base, worldFogColor(d), haze);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -970 + li * 10;
    mesh.frustumCulled = false;
    g.add(mesh);
  });
  return g;
}

/** Build the sky group. Returns { group, dome, stars, moon, bolt, mountains }. */
export function buildSky(T) {
  const group = new THREE.Group();
  group.name = 'sky';
  const dome = skyDome();
  const st = stars();
  const mo = moon(T);
  const bo = bolt();
  const mt = mountains();
  group.add(dome, st, mo, bo, mt);
  return { group, dome, stars: st, moon: mo, bolt: bo, mountains: mt };
}

/** Per-frame: keep the moon billboard at its direction from the camera. */
const _q = new THREE.Vector3();
export function updateSky(sky, camera, moonK) {
  const m = sky.moon;
  const d = SKY.uMoonDir.value;
  _q.copy(d).multiplyScalar(420).add(camera.position);
  m.position.copy(_q);
  m.quaternion.copy(camera.quaternion);
  const size = 420 * 0.034;
  m.userData.disc.scale.set(size, size, 1);
  m.userData.halo.scale.set(size * 7, size * 7, 1);
  m.userData.disc.material.uniforms.uK.value = moonK;
  m.userData.halo.material.uniforms.uK.value = moonK;
  m.visible = moonK > 0.01;
}
