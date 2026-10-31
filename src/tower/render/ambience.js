import * as THREE from 'three';
import { WORLD, FOG_PARS } from './worldMat.js';
import { rng } from './textures.js';
import { riverZ, riverW } from '../level/layout.js';

/**
 * Life in the dead valley: crows perched in flocks round the map (they lift off at a gunshot,
 * wheel overhead and settle back), fireflies blinking over the grass at dusk, dust blowing across
 * the yard and the roads, and rain streaks round the camera. Everything is one Points / Lines draw
 * each; the crows are simulated on the CPU (a few dozen), the rest is animated in the vertex
 * shader from the shared clock. No allocations per frame.
 */

const _v = new THREE.Vector3();
const _vp = new THREE.Vector4();
const FLAP = [1, 2, 3, 2]; // wingbeat frames

const BAYER_GLSL = /* glsl */ `
float bayer4(ivec2 p) {
  int i = (p.x & 3) + (p.y & 3) * 4;
  int m = i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 :
          i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5;
  return (float(m) + 0.5) / 16.0;
}`;

// ---------------------------------------------------------------------------------------------
// Crows

export class Crows {
  constructor(L, T) {
    const R = rng(808);
    this.R = R;
    this.birds = [];
    for (const roost of L.scenery.roosts) {
      for (let k = 0; k < roost.n; k++) {
        const off = roost.line ? [(R() - 0.5) * roost.spread * 2, 0, (R() - 0.5) * 0.3] : [(R() - 0.5) * roost.spread, roost.ground ? 0 : (R() - 0.5) * 0.2, (R() - 0.5) * roost.spread];
        const perch = new THREE.Vector3(roost.pos[0] + off[0], roost.pos[1] + off[1] + 0.2, roost.pos[2] + off[2]);
        this.birds.push({
          roost, perch, pos: perch.clone(), vel: new THREE.Vector3(), state: 0, timer: 0, ang: R() * 6.28, rad: 12 + R() * 14,
          alt: 14 + R() * 16, spin: (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.35), phase: R() * 10, flip: R() < 0.5 ? -1 : 1, peck: R() * 5,
          centre: new THREE.Vector3(),
        });
      }
    }
    const N = this.birds.length;
    this.N = N;
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(N * 3);
    this.infoArr = new Float32Array(N * 2); // frame, flip
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('info', new THREE.BufferAttribute(this.infoArr, 2).setUsage(THREE.DynamicDrawUsage));
    const uniforms = { map: { value: T.crows }, uViewH: { value: 360 }, uDark: { value: new THREE.Color(0x0c0c10) } };
    for (const k of Object.keys(WORLD)) uniforms[k] = WORLD[k];
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        attribute vec2 info;
        uniform float uViewH;
        varying vec2 vInfo;
        varying vec3 vWorldPos;
        varying float vSize;
        void main() {
          vInfo = info;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          float s = 1.25 * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.1);
          vSize = s;
          gl_PointSize = clamp(s, 1.0, 96.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uDark;
        varying vec2 vInfo;
        varying vec3 vWorldPos;
        varying float vSize;
        ${FOG_PARS}
        void main() {
          if (vSize < 5.0) {
            // a speck: one or two dark pixels (a 16-texel sprite would alias into a dot pattern)
            if (vSize > 2.0 && length(gl_PointCoord - 0.5) > 0.3) discard;
            gl_FragColor = vec4(applyWorldFog(uDark, vWorldPos), 1.0);
            return;
          }
          vec2 pc = gl_PointCoord;
          if (vInfo.y < 0.0) pc.x = 1.0 - pc.x;
          vec4 t = texture2D(map, vec2((vInfo.x + pc.x) * 0.25, 1.0 - pc.y));
          if (t.a < 0.5) discard;
          gl_FragColor = vec4(applyWorldFog(t.rgb * 0.9 + uDark * 0.1, vWorldPos), 1.0);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(_vp);
      mat.uniforms.uViewH.value = _vp.w;
    };
    this._sync(0);
  }

  /** Every flock within `radius` of pos takes off (and some more, farther, at random). */
  scare(pos, radius = 85) {
    const px = pos.x ?? pos[0], pz = pos.z ?? (pos.length > 2 ? pos[2] : pos[1]);
    for (const b of this.birds) {
      const d = Math.hypot(b.perch.x - px, b.perch.z - pz);
      if (d > radius && !(d < radius * 1.8 && this.R() < 0.25)) continue;
      if (b.state === 1) {
        b.timer = Math.max(b.timer, 6 + this.R() * 6);
        continue;
      }
      b.state = 1;
      b.timer = 10 + this.R() * 10;
      b.delay = this.R() * 0.35 + d * 0.004;
      b.vel.set((this.R() - 0.5) * 3, 3.5 + this.R() * 2.5, (this.R() - 0.5) * 3);
      b.centre.set(b.roost.pos[0] + (this.R() - 0.5) * 10, b.roost.pos[1] + b.alt, b.roost.pos[2] + (this.R() - 0.5) * 10);
      b.ang = Math.atan2(b.pos.z - b.centre.z, b.pos.x - b.centre.x);
    }
  }

  update(dt, camera, t) {
    dt = Math.min(dt, 0.1);
    const right = _v.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const B = this.birds;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (b.state === 0) {
        b.pos.copy(b.perch);
        b.peck -= dt;
        if (b.peck < 0) {
          b.peck = 1.5 + this.R() * 5;
          if (this.R() < 0.4) b.flip = -b.flip;
        }
        b.frame = 0;
        continue;
      }
      if (b.delay > 0) {
        b.delay -= dt;
        b.frame = 0;
        continue;
      }
      b.timer -= dt;
      let tx, ty, tz, maxA = 9, maxV = 9;
      if (b.state === 1) {
        b.ang += b.spin * dt;
        tx = b.centre.x + Math.cos(b.ang) * b.rad;
        tz = b.centre.z + Math.sin(b.ang) * b.rad;
        ty = b.centre.y + Math.sin(t * 0.7 + b.phase) * 3;
        if (b.timer <= 0) b.state = 2;
      } else {
        tx = b.perch.x;
        ty = b.perch.y;
        tz = b.perch.z;
        const d = Math.hypot(tx - b.pos.x, ty - b.pos.y, tz - b.pos.z);
        maxV = Math.min(9, 0.8 + d * 0.6);
        if (d < 0.35) {
          b.state = 0;
          b.vel.set(0, 0, 0);
          continue;
        }
      }
      // seek
      let ax = (tx - b.pos.x) * 0.9 - b.vel.x * 0.6, ay = (ty - b.pos.y) * 0.9 - b.vel.y * 0.6, az = (tz - b.pos.z) * 0.9 - b.vel.z * 0.6;
      const al = Math.hypot(ax, ay, az);
      if (al > maxA) {
        ax *= maxA / al;
        ay *= maxA / al;
        az *= maxA / al;
      }
      b.vel.x += ax * dt;
      b.vel.y += ay * dt;
      b.vel.z += az * dt;
      const vl = b.vel.length();
      if (vl > maxV) b.vel.multiplyScalar(maxV / vl);
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y < 0.2) b.pos.y = 0.2;
      // wings: flap, with glides when level and fast
      const gliding = b.state === 1 && Math.abs(b.vel.y) < 0.8 && Math.sin(t * 0.9 + b.phase) > 0.3;
      b.frame = gliding ? 2 : FLAP[Math.floor((t * 9 + b.phase) % 4)];
      const sx = b.vel.x * right.x + b.vel.z * right.z;
      if (Math.abs(sx) > 0.3) b.flip = sx > 0 ? 1 : -1;
    }
    this._sync(t);
  }

  _sync() {
    const P = this.posArr, I = this.infoArr, B = this.birds;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      P[i * 3] = b.pos.x;
      P[i * 3 + 1] = b.pos.y;
      P[i * 3 + 2] = b.pos.z;
      I[i * 2] = b.frame ?? 0;
      I[i * 2 + 1] = b.flip;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.info.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Fireflies (dusk), dust (always, faint), rain (when it rains)

export function fireflies(L) {
  const R = rng(919);
  const N = 150;
  const pos = new Float32Array(N * 3), info = new Float32Array(N * 3);
  let k = 0;
  while (k < N) {
    let x, z;
    if (R() < 0.45) {
      // along the river
      x = (R() - 0.5) * 300;
      z = riverZ(x) + (R() < 0.5 ? -1 : 1) * (riverW(x) + 2 + R() * 10);
    } else {
      const a = R() * 6.28, r = 14 + R() * 95;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    pos[k * 3] = x;
    pos[k * 3 + 1] = 0.4 + R() * 1.6;
    pos[k * 3 + 2] = z;
    info[k * 3] = R() * 6.28;
    info[k * 3 + 1] = 0.3 + R() * 0.7;
    info[k * 3 + 2] = R();
    k++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('info', new THREE.BufferAttribute(info, 3));
  const uniforms = { uK: { value: 0 } };
  for (const key of Object.keys(WORLD)) uniforms[key] = WORLD[key];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 info;
      uniform float uTime;
      uniform float uK;
      varying float vA;
      varying vec3 vWorldPos;
      void main() {
        float t = uTime * info.y + info.x;
        vec3 p = position + vec3(sin(t * 0.7) * 1.6 + sin(t * 1.9) * 0.4, sin(t * 1.1) * 0.35, cos(t * 0.6) * 1.6);
        vWorldPos = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = pow(max(0.0, sin(uTime * (0.8 + info.z) + info.x * 3.0)), 10.0);
        vA = blink * uK;
        gl_PointSize = -mv.z < 14.0 ? 2.0 : 1.0;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec3 vWorldPos;
      ${FOG_PARS}
      void main() {
        if (vA < 0.02) discard;
        vec3 dir;
        float f = worldFogAmount(vWorldPos, dir);
        gl_FragColor = vec4(vec3(0.75, 1.0, 0.35) * vA * 1.3 * (1.0 - f), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function dust(L, T) {
  const R = rng(929);
  const N = 90;
  const pos = new Float32Array(N * 3), info = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const a = R() * 6.28, r = 6 + R() * 70;
    pos[k * 3] = Math.cos(a) * r;
    pos[k * 3 + 1] = 0.3 + R() * 1.5;
    pos[k * 3 + 2] = Math.sin(a) * r;
    info[k * 3] = R() * 100;
    info[k * 3 + 1] = 0.6 + R() * 1.6;
    info[k * 3 + 2] = 1.2 + R() * 2.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('info', new THREE.BufferAttribute(info, 3));
  const uniforms = { map: { value: T.glow }, uColor: { value: new THREE.Color(0x9a8468) }, uK: { value: 0.12 }, uViewH: { value: 360 } };
  for (const key of Object.keys(WORLD)) uniforms[key] = WORLD[key];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 info;
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWindAmp;
      uniform float uViewH;
      varying float vA;
      varying vec3 vWorldPos;
      void main() {
        // drift downwind over a 140 m span, wrap, rise and fade over each pass
        float span = 140.0;
        float s = mod(info.x + uTime * info.y * (0.6 + uWindAmp * 2.5), span);
        vec3 p = position + vec3(uWindDir.x, 0.0, uWindDir.y) * (s - span * 0.5);
        p.y += s * 0.012 + sin(uTime * 0.8 + info.x) * 0.3;
        vWorldPos = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = sin(3.14159 * s / span);
        gl_PointSize = clamp(info.z * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.5), 1.0, 64.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform float uK;
      varying float vA;
      varying vec3 vWorldPos;
      ${FOG_PARS}
      ${BAYER_GLSL}
      void main() {
        float g = texture2D(map, gl_PointCoord).r * vA * uK;
        if (g < 0.004) discard;
        gl_FragColor = vec4(applyWorldFog(uColor, vWorldPos), g);
      }`,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(_vp);
    mat.uniforms.uViewH.value = _vp.w;
  };
  return pts;
}

/**
 * Halos round lamps (night only): one additive point sprite per light, sized in metres, with an
 * on/off weight per sprite (setOn(i, k)) and an optional flicker. list: [{ pos, color, size, flicker }]
 */
export function glows(list, T) {
  const N = Math.max(1, list.length);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), info = new Float32Array(N * 3);
  list.forEach((g, i) => {
    pos.set(g.pos, i * 3);
    col.set(g.color, i * 3);
    info.set([g.size ?? 3, g.flicker ?? 0, g.on ?? 1], i * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('gcol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('info', new THREE.BufferAttribute(info, 3));
  const uniforms = { map: { value: T.glow }, uViewH: { value: 360 } };
  for (const key of Object.keys(WORLD)) uniforms[key] = WORLD[key];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 gcol;
      attribute vec3 info;
      uniform float uTime;
      uniform float uNight;
      uniform float uViewH;
      varying vec3 vCol;
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        vec4 mv = viewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float fl = info.y > 0.0 ? 0.75 + 0.25 * sin(uTime * 19.0 + position.x) * sin(uTime * 5.3 + position.z) : 1.0;
        if (info.y > 0.5 && sin(uTime * 0.9 + position.x) > 0.93) fl *= 0.15;
        vCol = gcol * fl * info.z * (0.15 + 0.85 * uNight);
        gl_PointSize = clamp(info.x * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.5), 2.0, 160.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec3 vCol;
      varying vec3 vWorldPos;
      ${FOG_PARS}
      void main() {
        float g = texture2D(map, gl_PointCoord).r;
        vec3 dir;
        float f = worldFogAmount(vWorldPos, dir);
        gl_FragColor = vec4(vCol * g * (1.0 - f * 0.7), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  pts.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(_vp);
    mat.uniforms.uViewH.value = _vp.w;
  };
  pts.userData.setOn = (i, k) => {
    info[i * 3 + 2] = k;
    geo.attributes.info.needsUpdate = true;
  };
  return pts;
}

export function rain() {
  const N = 2600;
  const BOX = [70, 34, 70];
  const pos = new Float32Array(N * 6), end = new Float32Array(N * 2);
  const R = rng(939);
  for (let k = 0; k < N; k++) {
    const x = (R() - 0.5) * BOX[0], y = R() * BOX[1], z = (R() - 0.5) * BOX[2];
    pos.set([x, y, z, x, y, z], k * 6);
    end[k * 2] = 0;
    end[k * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('tail', new THREE.BufferAttribute(end, 1));
  const uniforms = { uK: { value: 0 }, uBox: { value: new THREE.Vector3(...BOX) }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0x9aa6b8) } };
  for (const key of Object.keys(WORLD)) uniforms[key] = WORLD[key];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float tail;
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWindAmp;
      uniform vec3 uBox;
      uniform vec3 uCam;
      varying vec3 vWorldPos;
      varying float vTail;
      void main() {
        vec3 vel = vec3(uWindDir.x * (2.0 + uWindAmp * 6.0), -11.0, uWindDir.y * (2.0 + uWindAmp * 6.0));
        vec3 p = position + vel * uTime;
        // wrap into the box round the camera
        p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
        p -= vel * 0.045 * tail;
        vWorldPos = p;
        vTail = tail;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK;
      uniform vec3 uColor;
      varying vec3 vWorldPos;
      varying float vTail;
      ${FOG_PARS}
      ${BAYER_GLSL}
      void main() {
        float a = uK * (0.35 + 0.65 * (1.0 - vTail));
        if (a < bayer4(ivec2(gl_FragCoord.xy))) discard;
        gl_FragColor = vec4(applyWorldFog(uColor, vWorldPos), 1.0);
      }`,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}
