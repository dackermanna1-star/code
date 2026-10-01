// Window glass with interior-mapped rooms. Each pane looks into a fake room
// (box ray-cast in the fragment shader): walls, floor, ceiling, a doorway into
// a darker hall, furniture silhouettes, curtains or blinds. Lit rooms glow
// warm; some flicker with TV light; occasionally a silhouette crosses a
// curtain. States live in a small data texture updated from the CPU.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { shared } from '../render/shaderlib.js';
import { facadeToWorld, facadeNormal } from './layout.js';
import { LAYER_REFLECT } from './units.js';

const STYLE = { NONE: 0, CURTAIN: 1, BLINDS: 2, SHEET: 3, NEWSPAPER: 4 };

export class Windows {
  constructor(engine) {
    this.engine = engine;
    this.windows = [];
  }

  build(fixtures, paneProvider = null) {
    const rng = new RNG(9091);
    const pos = [], nrm = [], tan = [], wuv = [], wid = [], wpar = [], idx = [];
    let v = 0;
    let n = 0;
    for (const fx of fixtures) {
      if (fx.kind !== 'window' || fx.boarded) continue;
      const r = rng.fork(fx.seed);
      const panes = paneProvider ? paneProvider(fx) : [{ x: -fx.w / 2 + 0.05, y: 0.05, w: fx.w - 0.1, h: fx.h - 0.1, z: 0.03 }];
      const f = fx.facade;
      const N = facadeNormal(f);
      const T = new THREE.Vector3(-N.z, 0, N.x).negate(); // local +x direction of the facade
      // local x axis of facade: rotate outward normal by +90deg around Y
      T.set(N.z, 0, -N.x);
      const lit = fx.lit;
      const style = fx.backdrop ? r.pick([0, 1, 2]) : r.weighted([STYLE.NONE, STYLE.CURTAIN, STYLE.BLINDS, STYLE.SHEET, STYLE.NEWSPAPER], [3, 4, 3, 1, 0.6]);
      const w = {
        index: n,
        fx,
        lit,
        level: lit ? 1 : 0,
        target: lit ? 1 : 0,
        style,
        tv: lit && r.chance(0.22),
        silhouette: lit && style === STYLE.CURTAIN && r.chance(0.45),
        silX: -10,
        silV: 0,
        nextEvent: r.range(20, 140),
        canToggle: !fx.backdrop && fx.floor > 0 && r.chance(0.35),
        seed: r.next(),
        center: fx.center.clone(),
        normal: N,
      };
      this.windows.push(w);
      for (const p of panes) {
        // pane corners in facade-local coordinates relative to the opening's bottom-center
        const u0 = fx.u + fx.w / 2 + p.x, y0 = fx.y + p.y;
        const zOut = -fx.recess + (p.z ?? 0.03);
        const c = [
          facadeToWorld(f, u0, y0, zOut),
          facadeToWorld(f, u0 + p.w, y0, zOut),
          facadeToWorld(f, u0 + p.w, y0 + p.h, zOut),
          facadeToWorld(f, u0, y0 + p.h, zOut),
        ];
        const uvs = [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]];
        for (let k = 0; k < 4; k++) {
          pos.push(c[k].x, c[k].y, c[k].z);
          nrm.push(N.x, N.y, N.z);
          tan.push(T.x, T.y, T.z);
          // pane-local coords offset so the room is centred on the whole opening
          wuv.push(uvs[k][0] + (p.x + fx.w / 2), uvs[k][1] + p.y);
          wid.push(n);
          wpar.push(fx.w, fx.h, (fx.floor > 0 ? 0.8 : 1.1), 2.6 + w.seed * 2.4);
        }
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        v += 4;
      }
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('wtan', new THREE.Float32BufferAttribute(tan, 3));
    geo.setAttribute('wuv', new THREE.Float32BufferAttribute(wuv, 2));
    geo.setAttribute('wid', new THREE.Float32BufferAttribute(wid, 1));
    geo.setAttribute('wpar', new THREE.Float32BufferAttribute(wpar, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    // state texture: R level, G tv, B silhouette x (0.5 + x/8), A style/255
    this.stateData = new Uint8Array(Math.max(1, n) * 4);
    this.stateTex = new THREE.DataTexture(this.stateData, Math.max(1, n), 1, THREE.RGBAFormat);
    this.stateTex.minFilter = this.stateTex.magFilter = THREE.NearestFilter;
    this.writeStates();

    this.material = createWindowMaterial(this.stateTex, n);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'windows';
    this.mesh.layers.enable(LAYER_REFLECT);
    this.engine.scene.add(this.mesh);
    return this;
  }

  writeStates() {
    for (const w of this.windows) {
      const o = w.index * 4;
      this.stateData[o] = Math.round(Math.min(1, Math.max(0, w.level)) * 255);
      this.stateData[o + 1] = w.tv ? 255 : 0;
      this.stateData[o + 2] = Math.round(Math.min(1, Math.max(0, 0.5 + w.silX / 8)) * 255);
      this.stateData[o + 3] = w.style * 32 + Math.floor(w.seed * 31);
    }
    this.stateTex.needsUpdate = true;
  }

  update(dt, t) {
    let dirty = false;
    for (const w of this.windows) {
      // occasional lights on/off in some apartments
      if (w.canToggle) {
        w.nextEvent -= dt;
        if (w.nextEvent <= 0) {
          w.target = w.target > 0.5 ? 0 : 1;
          w.nextEvent = 40 + Math.random() * 160;
          w.flickerOn = w.target > 0.5 ? 0.35 : 0;
        }
      }
      let lv = w.level;
      if (w.target > lv) {
        // fluorescent-ish start: a few stutters then on
        if (w.flickerOn > 0) {
          w.flickerOn -= dt;
          lv = Math.random() < 0.5 ? 0.6 : 0.05;
          if (w.flickerOn <= 0) lv = 1;
        } else lv = Math.min(1, lv + dt * 6);
      } else if (w.target < lv) lv = Math.max(0, lv - dt * 8);
      if (lv !== w.level) {
        w.level = lv;
        dirty = true;
      }
      if (w.silhouette && w.level > 0.5) {
        // someone occasionally walks past behind the curtain
        if (w.silX <= -6 || w.silX >= 6) {
          if (Math.random() < dt * 0.02) {
            w.silX = Math.random() < 0.5 ? -2.5 : 2.5;
            w.silV = (w.silX < 0 ? 1 : -1) * (0.45 + Math.random() * 0.4);
          } else w.silX = -10;
        } else {
          w.silX += w.silV * dt;
          if (Math.abs(w.silX) > 2.6) w.silX = -10;
          dirty = true;
        }
      }
    }
    if (dirty) this.writeStates();
  }

  /** Lit windows for light baking / audio emitters. */
  litWindows() {
    return this.windows.filter((w) => w.lit);
  }
}

function createWindowMaterial(stateTex, count) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uState: { value: stateTex },
      uCount: { value: Math.max(1, count) },
      uTime: shared.uTime,
      uNoise2: shared.uNoise2,
      uIrrA: shared.uIrrA,
      uIrrB: shared.uIrrB,
      uIrrMin: shared.uIrrMin,
      uIrrInvSize: shared.uIrrInvSize,
      uSkyIrr: shared.uSkyIrr,
      uSkyIrrSide: shared.uSkyIrrSide,
    },
    vertexShader: /* glsl */ `
      attribute vec3 wtan;
      attribute vec2 wuv;
      attribute float wid;
      attribute vec4 wpar;
      varying vec3 vWPos;
      varying vec3 vN;
      varying vec3 vT;
      varying vec2 vUv;
      flat varying float vId;
      flat varying vec4 vPar;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vT = normalize(mat3(modelMatrix) * wtan);
        vUv = wuv;
        vId = wid;
        vPar = wpar;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uState;
      uniform float uCount;
      uniform float uTime;
      uniform sampler2D uNoise2;
      uniform highp sampler3D uIrrA;
      uniform highp sampler3D uIrrB;
      uniform vec3 uIrrMin, uIrrInvSize, uSkyIrr, uSkyIrrSide;
      varying vec3 vWPos;
      varying vec3 vN;
      varying vec3 vT;
      varying vec2 vUv;
      flat varying float vId;
      flat varying vec4 vPar;

      float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
      vec3 hash31(float p) { vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
      float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
      float sdCapsule(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }

      void main() {
        vec4 st = texture2D(uState, vec2((vId + 0.5) / uCount, 0.5));
        float level = st.r;
        float tv = st.g;
        float silX = (st.b - 0.5) * 8.0;
        float styleSeed = st.a * 255.0;
        float style = floor(styleSeed / 32.0);
        float seed = vId * 1.618 + 0.37;
        vec3 rnd = hash31(seed * 17.0);

        vec3 N = normalize(vN);
        vec3 T = normalize(vT);
        vec3 B = vec3(0.0, 1.0, 0.0);
        vec3 V = normalize(vWPos - cameraPosition);
        // ray in room space: x along window, y up, z out of the wall (room at z<0)
        vec3 d = vec3(dot(V, T), dot(V, B), dot(V, N));
        float W = vPar.x, H = vPar.y, sill = vPar.z, depth = vPar.w;
        vec3 o = vec3(vUv.x - W * 0.5, vUv.y, 0.0);
        float xHalf = W * 0.5 + 1.1 + rnd.x * 1.2;
        float yMin = -sill, yMax = 2.75 - sill;
        float tB = (-depth - o.z) / min(d.z, -1e-4);
        float tS = ((d.x > 0.0 ? xHalf : -xHalf) - o.x) / (abs(d.x) < 1e-4 ? 1e-4 : d.x);
        float tF = ((d.y > 0.0 ? yMax : yMin) - o.y) / (abs(d.y) < 1e-4 ? 1e-4 : d.y);
        float t = min(tB, min(abs(tS), abs(tF)));
        vec3 p = o + d * t;
        int surf = t == tB ? 0 : (t == abs(tS) ? 1 : (d.y > 0.0 ? 3 : 2));

        // room palette
        vec3 wallCol = mix(vec3(0.42, 0.36, 0.28), vec3(0.3, 0.36, 0.33), rnd.y);
        wallCol = mix(wallCol, vec3(0.38, 0.33, 0.36), step(0.7, rnd.z));
        vec3 floorCol = mix(vec3(0.22, 0.13, 0.07), vec3(0.15, 0.14, 0.13), step(0.6, rnd.x));
        vec3 ceilCol = vec3(0.5, 0.47, 0.42);
        vec3 col = surf == 0 ? wallCol : surf == 1 ? wallCol * 0.85 : surf == 2 ? floorCol : ceilCol;
        // back wall details: doorway into a darker hall, picture frame, cabinet / shelf silhouettes
        if (surf == 0) {
          float doorX = (rnd.z - 0.5) * W * 1.6;
          if (abs(p.x - doorX) < 0.42 && p.y < 2.05 - sill) col *= 0.18;
          float pic = sdBox(p.xy - vec2(-doorX * 0.6 + 0.2, 1.55 - sill), vec2(0.28, 0.2));
          if (pic < 0.0) col = mix(vec3(0.08, 0.07, 0.06), hash31(seed + 3.0) * 0.5, step(pic, -0.03));
          float shelf = sdBox(p.xy - vec2(doorX + (rnd.y > 0.5 ? 1.1 : -1.1), 0.9 - sill), vec2(0.45, 0.9));
          if (shelf < 0.0) col = vec3(0.09, 0.06, 0.04) * (0.7 + 0.3 * step(0.5, fract(p.y * 3.0)));
        }
        if (surf == 1 && p.y < 0.9 - sill && abs(p.z + depth * 0.5) < depth * 0.3) col = vec3(0.12, 0.1, 0.09); // sofa/cabinet against side wall
        // lighting: ceiling lamp (warm) or TV glow
        vec3 lampPos = vec3(rnd.x * 0.6 - 0.3, yMax - 0.25, -depth * 0.55);
        vec3 L = lampPos - p;
        float dist2 = dot(L, L);
        vec3 lampCol = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.78, 0.5), rnd.z);
        float tvF = 0.0;
        if (tv > 0.5) {
          float f1 = texture2D(uNoise2, vec2(uTime * 0.7, seed)).r;
          float f2 = texture2D(uNoise2, vec2(uTime * 3.1, seed * 2.0)).g;
          tvF = 0.45 + 0.9 * f1 * f2;
          lampCol = mix(lampCol * 0.35, vec3(0.55, 0.7, 1.0) * tvF, 0.8);
        }
        vec3 lit = lampCol * (0.75 / (0.6 + dist2)) * level;
        vec3 roomRad = col * (lit + 0.0025);
        // ceiling hot-spot near the lamp
        if (surf == 3) roomRad += lampCol * level * 0.25 * exp(-dot(L.xz, L.xz) * 3.0);

        // curtains / blinds just behind the glass
        vec3 outRad = roomRad;
        float u01 = vUv.x / W, v01 = vUv.y / H;
        if (style == 1.0) {
          // two curtain halves, partly drawn; backlit fabric glows warm
          float gap = 0.15 + 0.5 * fract(seed * 3.7);
          float cover = step(abs(u01 - 0.5), 0.5) * (1.0 - step(abs(u01 - 0.5 - (fract(seed * 7.1) - 0.5) * 0.2), gap * 0.5));
          float folds = 0.75 + 0.25 * sin(vUv.x * 38.0 + sin(vUv.y * 3.0) * 0.6);
          vec3 fab = mix(vec3(0.6, 0.45, 0.3), vec3(0.55, 0.52, 0.45), fract(seed * 5.3));
          vec3 curtainRad = fab * folds * (lampCol * 0.17 * level + 0.003);
          // silhouette of someone walking past, cast onto the curtain
          vec2 sp = vec2(vUv.x - W * 0.5 - silX, vUv.y + sill);
          float person = min(length(sp - vec2(0.0, 1.62)) - 0.12, sdCapsule(sp, vec2(0.0, 0.3), vec2(0.0, 1.38), 0.2));
          float shadow = 1.0 - smoothstep(-0.05, 0.12, person) * 0.85;
          curtainRad *= mix(1.0, shadow, step(abs(silX), 5.0));
          outRad = mix(roomRad, curtainRad, cover);
        } else if (style == 2.0) {
          // venetian blinds, some slats tilted, a few broken
          float slat = fract(vUv.y / 0.045);
          float openness = 0.25 + 0.5 * fract(seed * 9.3);
          float raised = step(0.82 - 0.3 * fract(seed * 2.9), v01);
          float blind = (1.0 - raised) * step(openness, slat);
          vec3 slatCol = vec3(0.55, 0.52, 0.47) * (lampCol * 0.14 * level + 0.003) * (0.8 + 0.2 * slat);
          outRad = mix(roomRad, slatCol, blind);
        } else if (style == 3.0) {
          vec3 sheet = vec3(0.65, 0.6, 0.55) * (lampCol * 0.15 * level + 0.003);
          outRad = mix(roomRad, sheet, 0.85);
        } else if (style == 4.0) {
          vec3 paper = vec3(0.5, 0.47, 0.4) * (0.75 + 0.25 * texture2D(uNoise2, vUv * 3.0).r) * (lampCol * 0.08 * level + 0.002);
          outRad = mix(roomRad, paper, 0.95);
        }

        // dirty glass: grime, rain spots, reflection of the alley / sky
        vec4 nz = texture2D(uNoise2, vUv * vec2(1.3, 0.9) + seed);
        float grime = 0.25 + 0.55 * nz.r + 0.3 * smoothstep(0.6, 0.0, v01);
        float NdV = clamp(dot(N, -V), 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
        vec3 uvw = (vWPos + N * 0.3 - uIrrMin) * uIrrInvSize;
        vec4 A = texture(uIrrA, uvw);
        vec3 R = reflect(V, N);
        // reflected radiance ~ sky radiance (irradiance / pi) where the sky is visible, dark walls elsewhere
        vec3 skyRad = mix(uSkyIrrSide, uSkyIrr, clamp(R.y * 1.5, 0.0, 1.0)) * 0.3183;
        vec3 env = skyRad * mix(0.08, 1.0, smoothstep(0.0, 0.6, R.y) * A.a) + A.rgb * 0.05;
        vec3 transmitted = outRad * mix(0.85, 0.45, grime);
        vec4 Bv = texture(uIrrB, uvw);
        float sideVis = N.x * N.x * (N.x >= 0.0 ? Bv.r : Bv.g) + N.z * N.z * (N.z >= 0.0 ? Bv.b : Bv.a);
        vec3 Eside = uSkyIrrSide * sideVis + A.rgb;
        vec3 dirt = Eside * (0.1 * grime / 3.14159);
        vec3 c = transmitted * (1.0 - F) + env * F * (1.0 - 0.5 * grime) + dirt;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}
