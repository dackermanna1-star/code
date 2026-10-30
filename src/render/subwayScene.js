import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STATION, CAR, TRAIN_LEN } from '../game/subway.js';

/**
 * The station, rendered: tiled walls with the line's colour band and name boards, a worn concrete
 * platform (it samples the floor-decal texture, so blood and bullet marks show on it), tactile edge
 * strips, the track beds with rails and sleepers, fluorescent fixtures (a few of them failing),
 * the dark tunnel mouths and the trains. Repeated parts are instanced or merged per material to
 * keep the draw calls down; the lights are a handful of unshadowed points plus one shadowing spot
 * that hangs over the player.
 */
const S = STATION;
const NAME = 'ASHGROVE';
const LINE = 0x2f8f5b; // line colour

function canvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** White subway tiles (15 x 7.5 cm, running bond) with grime toward the bottom. */
function tileTexture(base = '#d9dcd6', grout = '#8c908a', dirty = 0.5, seed = 1) {
  const c = canvas(512, 512);
  if (!c) return null;
  const g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = grout;
  g.fillRect(0, 0, 512, 512);
  const tw = 64, th = 32;
  for (let j = 0; j < 16; j++) {
    for (let i = -1; i < 9; i++) {
      const x = i * tw + (j % 2 ? tw / 2 : 0), y = j * th;
      const v = 0.92 + R() * 0.08;
      g.fillStyle = base;
      g.globalAlpha = 1;
      g.fillRect(x + 2, y + 2, tw - 4, th - 4);
      g.fillStyle = `rgba(0,0,0,${(1 - v) * 1.4})`;
      g.fillRect(x + 2, y + 2, tw - 4, th - 4);
      // glaze highlight
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + 4, y + 4, tw - 8, 3);
      if (R() < 0.05 * dirty) {
        // a cracked or chipped tile
        g.strokeStyle = 'rgba(40,40,40,0.5)';
        g.beginPath();
        g.moveTo(x + R() * tw, y + 2);
        g.lineTo(x + R() * tw, y + th - 2);
        g.stroke();
      }
    }
  }
  // grime: streaks and blotches
  for (let k = 0; k < 140 * dirty; k++) {
    g.fillStyle = `rgba(${60 + R() * 30},${55 + R() * 20},${40 + R() * 20},${0.03 + R() * 0.06})`;
    const x = R() * 512, y = R() * 512, w = 4 + R() * 30;
    g.fillRect(x, y, w * 0.3, w * (1 + R() * 4));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textTexture(text, opts = {}) {
  const w = opts.w ?? 1024, h = opts.h ?? 192;
  const c = canvas(w, h);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg ?? '#14171a';
  g.fillRect(0, 0, w, h);
  if (opts.band) {
    g.fillStyle = opts.band;
    g.fillRect(0, h * 0.78, w, h * 0.22);
  }
  g.fillStyle = opts.fg ?? '#f2f2ee';
  g.font = `${opts.weight ?? 700} ${opts.size ?? 110}px Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h * (opts.band ? 0.42 : 0.5));
  if (opts.sub) {
    g.font = `500 ${Math.round((opts.size ?? 110) * 0.32)}px Helvetica, Arial, sans-serif`;
    g.fillText(opts.sub, w / 2, h * 0.88);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A pasted-up notice or advert: blocks of colour and lines of "text". */
function posterTexture(seed) {
  const c = canvas(256, 384);
  if (!c) return null;
  const g = c.getContext('2d');
  const R = rng(seed);
  const pal = [['#e8e2d0', '#b3261e'], ['#1f3a5f', '#f2c14e'], ['#f4f1ea', '#222'], ['#2b2b2b', '#e05a47'], ['#c9d6c3', '#1d4d3a']][Math.floor(R() * 5)];
  g.fillStyle = pal[0];
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = pal[1];
  const titles = ['EVACUATE', 'MISSING', 'STAY CALM', 'NOTICE', 'DO NOT', 'QUARANTINE'];
  g.font = '800 40px Helvetica, Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(titles[Math.floor(R() * titles.length)], 128, 70);
  g.fillRect(24, 100, 208, 120 + R() * 40);
  g.globalAlpha = 0.6;
  for (let k = 0; k < 7; k++) g.fillRect(28, 250 + k * 16, 140 + R() * 60, 7);
  g.globalAlpha = 1;
  // torn corner, grime
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.moveTo(256, 384);
  g.lineTo(256 - 40 - R() * 50, 384);
  g.lineTo(256, 384 - 30 - R() * 60);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Platform floor: worn concrete slabs, the tactile strips, the edge line and the decal stains. */
function platformMaterial(decals) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 0.78, metalness: 0 });
  const uniforms = { uDecals: { value: decals.target.texture }, uRect: { value: decals.rectUniform }, uW: { value: S.W } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldP;
        uniform sampler2D uDecals;
        uniform vec4 uRect;
        uniform float uW;
        float fh(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p, p+34.23); return fract(p.x*p.y); }
        float fn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fh(i),fh(i+vec2(1,0)),f.x),mix(fh(i+vec2(0,1)),fh(i+vec2(1,1)),f.x),f.y); }
        float ffbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*fn(p); p*=2.03; a*=0.5;} return s; }
        vec4 decalAt(vec2 xz){ vec2 uv = (xz - uRect.xy) / (2.0 * uRect.zw) + 0.5; if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0); return texture2D(uDecals, uv); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 xz = vWorldP.xz;
        float mott = ffbm(xz * 0.4);
        float grain = fn(xz * 55.0) * 0.5 + fn(xz * 150.0) * 0.5;
        diffuseColor.rgb *= 0.78 + 0.26 * mott + 0.08 * (grain - 0.5);
        // slab joints every 1.5 m, and footfall wear down the middle
        vec2 sl = abs(fract(xz / 1.5) - 0.5);
        float joint = 1.0 - smoothstep(0.0, 0.012, min(sl.x, sl.y) * 1.5);
        diffuseColor.rgb *= 1.0 - 0.35 * joint;
        float az = abs(xz.y);
        diffuseColor.rgb *= 0.92 + 0.12 * smoothstep(0.5, 3.0, az);
        // tactile warning strip (yellow, studded) and the painted edge line
        float strip = step(uW - 0.75, az) * step(az, uW - 0.15);
        vec2 stud = fract(xz * 18.0) - 0.5;
        float studs = 1.0 - smoothstep(0.18, 0.26, length(stud));
        vec3 yellow = vec3(0.78, 0.62, 0.08) * (0.8 + 0.3 * mott) * (0.9 + 0.2 * studs);
        diffuseColor.rgb = mix(diffuseColor.rgb, yellow, strip);
        float edge = step(uW - 0.12, az);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.6) * (0.85 + 0.2 * grain), edge);
        vec4 dec = decalAt(xz);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.13, 0.13), clamp(dec.g, 0.0, 1.0) * 0.85);
        float bt = dec.r;
        float bcov = smoothstep(0.03, 0.12, bt);
        vec3 bcol = mix(vec3(0.2, 0.011, 0.009), vec3(0.045, 0.0025, 0.002), smoothstep(0.15, 0.6, bt));
        diffuseColor.rgb = mix(diffuseColor.rgb, bcol, bcov);
        float floorWet = smoothstep(0.15, 0.45, bt) + 0.25 * smoothstep(0.62, 0.7, ffbm(xz * 0.21 + 3.1));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor * (0.9 + 0.2 * grain), 0.1, clamp(floorWet, 0.0, 1.0));
        roughnessFactor = mix(roughnessFactor, 0.55, strip);`,
      );
  };
  mat.customProgramCacheKey = () => 'subway-platform-v1';
  return mat;
}

/** Track bed: ballast and grime (also takes the decal stains). */
function ballastMaterial(decals) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.95 });
  const uniforms = { uDecals: { value: decals.target.texture }, uRect: { value: decals.rectUniform } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldP;
        uniform sampler2D uDecals;
        uniform vec4 uRect;
        float fh(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p, p+34.23); return fract(p.x*p.y); }
        float fn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fh(i),fh(i+vec2(1,0)),f.x),mix(fh(i+vec2(0,1)),fh(i+vec2(1,1)),f.x),f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 xz = vWorldP.xz;
        float st = fn(xz * 26.0) * 0.6 + fn(xz * 70.0) * 0.4;
        diffuseColor.rgb *= 0.55 + 0.7 * st;
        vec2 uv = (xz - uRect.xy) / (2.0 * uRect.zw) + 0.5;
        if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
          vec4 dec = texture2D(uDecals, uv);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.005, 0.004), smoothstep(0.03, 0.15, dec.r));
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'subway-ballast-v1';
  return mat;
}

function boxGeo(sx, sy, sz, x, y, z) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

export class SubwayScene {
  constructor(renderer, decals, envMap = null) {
    this.renderer = renderer;
    this.decals = decals;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x040507);
    scene.fog = new THREE.FogExp2(0x07090c, 0.026);
    if (envMap) {
      scene.environment = envMap;
      scene.environmentIntensity = 0.18;
    }
    this.flicker = [];
    this.trainMeshes = new Map();
    this.time = 0;
    this.buildLights();
    this.buildStation();
    this.buildTracks();
    this.buildFixtures();
  }

  // ------------------------------------------------------------------------------------------
  buildLights() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight(0x8592a3, 0x1a1712, 0.42));
    // a few warm-white points along the platform (no shadows), one cold one over each tunnel mouth
    this.points = [];
    for (const x of [-26, -18, -10, -2.5, 2.5, 10, 18, 26]) {
      const l = new THREE.PointLight(0xf1f4e8, 9, 15, 1.6);
      l.position.set(x, S.ceiling - 0.5, 0);
      scene.add(l);
      this.points.push(l);
    }
    for (const sd of [-1, 1]) {
      const l = new THREE.PointLight(0x9fb7d6, 3, 10, 1.8);
      l.position.set(sd * (S.halfLen + 1), 2.8, 0);
      scene.add(l);
    }
    // the one shadowing light: an overhead spot that follows the player around
    const sp = new THREE.SpotLight(0xfff6e6, 26, 18, 0.95, 0.6, 1.4);
    sp.position.set(0, S.ceiling - 0.2, 0);
    sp.castShadow = true;
    sp.shadow.mapSize.set(1024, 1024);
    sp.shadow.camera.near = 0.5;
    sp.shadow.camera.far = 14;
    sp.shadow.bias = -0.0005;
    sp.shadow.normalBias = 0.03;
    scene.add(sp);
    scene.add(sp.target);
    this.spot = sp;
    // the trains' lamps and door spill come from a fixed pool (adding a light to the scene would
    // recompile every material the moment a train comes in)
    this.trainLights = [];
    for (let i = 0; i < 2; i++) {
      const head = new THREE.SpotLight(0xfff0cc, 0, 60, 0.45, 0.5, 1.2);
      const spill = new THREE.PointLight(0xe8f0dc, 0, 9, 1.6);
      scene.add(head, head.target, spill);
      this.trainLights.push({ head, spill, train: null });
    }
  }

  buildStation() {
    const scene = this.scene, L = S.halfLen, W = S.W, D = S.pitDepth, far = L + S.tunnel;
    const decals = this.decals;
    // platform floor and its edge face
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, W * 2).rotateX(-Math.PI / 2), platformMaterial(decals));
    floor.receiveShadow = true;
    scene.add(floor);
    const faceMat = new THREE.MeshStandardMaterial({ color: 0x3b3a37, roughness: 0.9 });
    const faces = mergeGeometries([boxGeo(L * 2, D, 0.3, 0, -D / 2, W - 0.15), boxGeo(L * 2, D, 0.3, 0, -D / 2, -W + 0.15)]);
    const fm = new THREE.Mesh(faces, faceMat);
    fm.receiveShadow = true;
    scene.add(fm);
    // track beds
    const bal = ballastMaterial(decals);
    for (const sd of [-1, 1]) {
      const g = new THREE.PlaneGeometry(far * 2, S.wallZ - W).rotateX(-Math.PI / 2);
      g.translate(0, -D, (sd * (W + S.wallZ)) / 2);
      const m = new THREE.Mesh(g, bal);
      m.receiveShadow = true;
      scene.add(m);
    }
    // walls behind the tracks: tiles with the line's band, and a black dado where the trains run
    const tiles = tileTexture('#d8dbd4', '#7e827c', 0.8, 7);
    if (tiles) tiles.repeat.set(far / 1.2, 3.2);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tiles, roughness: 0.35, metalness: 0 });
    const dadoMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.85 });
    const bandMat = new THREE.MeshStandardMaterial({ color: LINE, roughness: 0.4 });
    for (const sd of [-1, 1]) {
      const z = sd * S.wallZ;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, S.ceiling + D - 1.2), wallMat);
      wall.position.set(0, (S.ceiling + 1.2 - D) / 2 + 0.0, z);
      wall.rotation.y = sd > 0 ? Math.PI : 0;
      wall.receiveShadow = true;
      scene.add(wall);
      const dado = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, 1.25), dadoMat);
      dado.position.set(0, -D + 0.62, z - sd * 0.01);
      dado.rotation.y = wall.rotation.y;
      scene.add(dado);
      const band = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, 0.32), bandMat);
      band.position.set(0, 2.6, z - sd * 0.012);
      band.rotation.y = wall.rotation.y;
      scene.add(band);
      // name boards and posters
      const nameTex = textTexture(NAME, { band: '#2f8f5b', sub: 'NORTHBOUND  ·  SOUTHBOUND', size: 120 });
      const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: nameTex, roughness: 0.5, emissive: 0x111111, emissiveMap: nameTex, emissiveIntensity: 0.6 });
      for (const x of [-20, 0, 20]) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), boardMat);
        b.position.set(x, 1.75, z - sd * 0.02);
        b.rotation.y = wall.rotation.y;
        scene.add(b);
      }
      let seed = sd > 0 ? 11 : 31;
      for (const x of [-27, -24.5, -13, -10.5, -6, 8, 12.5, 15, 25, 27.5]) {
        const pt = posterTexture(seed++);
        const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, map: pt, roughness: 0.8 });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.65), pm);
        p.position.set(x, 1.15, z - sd * 0.02);
        p.rotation.y = wall.rotation.y + (Math.random() - 0.5) * 0.02;
        p.rotation.z = (Math.random() - 0.5) * 0.03;
        scene.add(p);
      }
      // tunnel walls beyond the station (dark concrete) and their ceilings
      const tun = new THREE.MeshStandardMaterial({ color: 0x2a2928, roughness: 0.95 });
      for (const ex of [-1, 1]) {
        const g = new THREE.PlaneGeometry(S.tunnel, 5.5);
        const m = new THREE.Mesh(g, tun);
        m.position.set(ex * (L + S.tunnel / 2), 1.6 - D, z);
        m.rotation.y = wall.rotation.y;
        scene.add(m);
        const c = new THREE.Mesh(new THREE.PlaneGeometry(S.tunnel, S.wallZ - W + 0.4), tun);
        c.rotation.x = Math.PI / 2;
        c.position.set(ex * (L + S.tunnel / 2), 3.6, (sd * (W + S.wallZ)) / 2);
        scene.add(c);
        // the inner tunnel walls on the platform side, beyond the end walls
        const inner = new THREE.Mesh(new THREE.PlaneGeometry(S.tunnel, 5.5), tun);
        inner.position.set(ex * (L + S.tunnel / 2), 1.6 - D, sd * (W - 0.02));
        inner.rotation.y = sd > 0 ? 0 : Math.PI;
        scene.add(inner);
        // a few dim lamps disappearing into the tunnel, and the signal at the mouth
        for (let k = 1; k < 7; k++) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
          lamp.position.set(ex * (L + k * 11), 2.4, sd * (S.wallZ - 0.1));
          scene.add(lamp);
        }
        const sig = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
        sig.position.set(ex * (L + 1.5), 2.2, sd * (W + 0.3));
        scene.add(sig);
        this.flicker.push({ mesh: sig, kind: 'signal', base: 1 });
      }
    }
    // end walls of the platform
    const endTiles = tileTexture('#d3d6cf', '#787c76', 1, 13);
    if (endTiles) endTiles.repeat.set(W * 2 / 1.2, 3.6);
    const endMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: endTiles, roughness: 0.4 });
    for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, S.ceiling), endMat);
      m.position.set(sd * L, S.ceiling / 2, 0);
      m.rotation.y = -sd * Math.PI / 2;
      scene.add(m);
      const exitTex = textTexture('NO EXIT', { bg: '#2a0d0d', fg: '#ff6d5a', size: 120, w: 512, h: 160 });
      const ex = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.44), new THREE.MeshBasicMaterial({ map: exitTex }));
      ex.position.set(sd * (L - 0.02), 2.9, 0);
      ex.rotation.y = -sd * Math.PI / 2;
      scene.add(ex);
    }
    // ceiling: dark, with a cable tray along each side
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, S.wallZ * 2 + 0.4), new THREE.MeshStandardMaterial({ color: 0x191a1b, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = S.ceiling;
    scene.add(ceil);
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.6, metalness: 0.5 });
    const trays = mergeGeometries([boxGeo(L * 2, 0.08, 0.4, 0, S.ceiling - 0.35, 3.6), boxGeo(L * 2, 0.08, 0.4, 0, S.ceiling - 0.35, -3.6)]);
    scene.add(new THREE.Mesh(trays, trayMat));

    // columns: tiled shafts with a black base and a name plate
    const colTiles = tileTexture('#e1e3dc', '#82867f', 0.6, 21);
    if (colTiles) colTiles.repeat.set(1, 4);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: colTiles, roughness: 0.38 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e1f20, roughness: 0.7 });
    const colGeo = new THREE.BoxGeometry(0.6, S.ceiling, 0.6);
    const xs = [-24, -16, -8, 8, 16, 24], zs = [-2.4, 2.4];
    const cols = new THREE.InstancedMesh(colGeo, colMat, xs.length * zs.length);
    const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.66, 0.35, 0.66), baseMat, xs.length * zs.length);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (const x of xs) {
      for (const z of zs) {
        m4.makeTranslation(x, S.ceiling / 2, z);
        cols.setMatrixAt(k, m4);
        m4.makeTranslation(x, 0.175, z);
        bases.setMatrixAt(k, m4);
        k++;
      }
    }
    cols.castShadow = cols.receiveShadow = true;
    bases.receiveShadow = true;
    scene.add(cols, bases);
    const plateTex = textTexture(NAME, { band: '#2f8f5b', size: 120 });
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 });
    for (const x of xs) {
      for (const z of zs) {
        for (const f of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.12), plateMat);
          p.position.set(x, 2.1, z + f * 0.305);
          p.rotation.y = f > 0 ? 0 : Math.PI;
          scene.add(p);
        }
      }
    }
    // benches: slats on two legs
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.75 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3e4144, roughness: 0.5, metalness: 0.7 });
    const benchWood = [], benchSteel = [];
    for (const x of [-28, -20, -12, 12, 20, 28]) {
      for (let s = 0; s < 4; s++) benchWood.push(boxGeo(1.8, 0.035, 0.1, x, 0.44, -0.18 + s * 0.12));
      for (const e of [-0.75, 0.75]) benchSteel.push(boxGeo(0.06, 0.42, 0.46, x + e, 0.21, 0));
    }
    const bw = new THREE.Mesh(mergeGeometries(benchWood), wood);
    const bs = new THREE.Mesh(mergeGeometries(benchSteel), steel);
    bw.castShadow = bs.castShadow = true;
    scene.add(bw, bs);
    // bins and the ticket machine
    const binMat = new THREE.MeshStandardMaterial({ color: 0x2b4a3a, roughness: 0.6, metalness: 0.4 });
    for (const [x, z] of [[-8, -3.05], [16, 3.05]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.9, 16), binMat);
      b.position.set(x, 0.45, z);
      b.castShadow = true;
      scene.add(b);
    }
    const mach = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a1f1f, roughness: 0.5, metalness: 0.3 }));
    mach.position.set(-16, 0.85, 3.1);
    mach.castShadow = true;
    scene.add(mach);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ color: 0x5fd0ff }));
    screen.position.set(-16, 1.25, 2.79);
    screen.rotation.y = Math.PI;
    scene.add(screen);
    this.flicker.push({ mesh: screen, kind: 'screen', base: 1 });
    this.buildStairs();
  }

  /** The stairwell in the middle: a concrete enclosure, railings, the steps up to a shut grille. */
  buildStairs() {
    const scene = this.scene;
    const conc = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.85 });
    const geos = [];
    // side walls up to the ceiling and the half-height parapet along the open sides
    geos.push(boxGeo(7.2, S.ceiling, 0.2, 0, S.ceiling / 2, 1.2), boxGeo(7.2, S.ceiling, 0.2, 0, S.ceiling / 2, -1.2));
    geos.push(boxGeo(0.2, 1.05, 2.6, 3.5, 0.52, 0), boxGeo(0.2, S.ceiling - 2.3, 2.6, -3.5, S.ceiling - (S.ceiling - 2.3) / 2, 0));
    // steps rising toward -x, up through the ceiling
    for (let k = 0; k < 22; k++) geos.push(boxGeo(0.3, 0.17 * (k + 1), 2.2, 3.3 - k * 0.3, 0.085 * (k + 1), 0));
    const m = new THREE.Mesh(mergeGeometries(geos), conc);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    // railings
    const rail = new THREE.MeshStandardMaterial({ color: 0xa8acad, roughness: 0.3, metalness: 0.9 });
    const rg = [];
    for (const z of [-1.05, 1.05]) {
      rg.push(boxGeo(7.0, 0.05, 0.05, 0, 1.1, z * 1.18));
      for (let k = 0; k < 8; k++) rg.push(boxGeo(0.04, 1.1, 0.04, -3.4 + k * 0.97, 0.55, z * 1.18));
    }
    scene.add(new THREE.Mesh(mergeGeometries(rg), rail));
    // the shut grille at the top of the stairs and its sign
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.9), new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide }));
    grille.position.set(-3.3, S.ceiling - 0.6, 0);
    grille.rotation.y = Math.PI / 2;
    scene.add(grille);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.36), new THREE.MeshBasicMaterial({ map: textTexture('WAY OUT  ↑', { bg: '#f2c94c', fg: '#1a1a1a', size: 100, w: 768, h: 160 }) }));
    sign.position.set(3.62, 2.2, 0);
    sign.rotation.y = Math.PI / 2;
    scene.add(sign);
  }

  buildTracks() {
    const scene = this.scene, far = S.halfLen + S.tunnel, D = S.pitDepth;
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x5a554e, roughness: 0.9 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8f8b86, roughness: 0.35, metalness: 0.9 });
    const n = Math.floor((far * 2) / 0.7);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.12, 2.5), sleeperMat, n * 2);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (const sd of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        m4.makeTranslation(-far + i * 0.7, -D + 0.06, sd * S.trackZ);
        sleepers.setMatrixAt(k++, m4);
      }
    }
    sleepers.receiveShadow = true;
    scene.add(sleepers);
    const rails = [];
    for (const sd of [-1, 1]) {
      for (const g of [-0.72, 0.72]) rails.push(boxGeo(far * 2, 0.15, 0.07, 0, -D + 0.19, sd * S.trackZ + g));
      // the third rail on its insulators, toward the wall
      rails.push(boxGeo(far * 2, 0.08, 0.1, 0, -D + 0.32, sd * (S.trackZ + 1.25)));
    }
    scene.add(new THREE.Mesh(mergeGeometries(rails), railMat));
  }

  /** Fluorescent fixtures along the platform (emissive tubes; some of them failing). */
  buildFixtures() {
    const scene = this.scene;
    const housing = new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.5, metalness: 0.5 });
    this.tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ec, emissiveIntensity: 2.2 });
    this.tubeDeadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ec, emissiveIntensity: 2.2 });
    const xs = [];
    for (let x = -29; x <= 29; x += 4) xs.push(x);
    const geoH = [], geoT = [], geoD = [];
    let k = 0;
    for (const x of xs) {
      for (const z of [-1.4, 1.4, -3.5, 3.5]) {
        geoH.push(boxGeo(1.6, 0.06, 0.16, x, S.ceiling - 0.42, z));
        // every so often a fixture is on the blink
        (k++ % 9 === 4 ? geoD : geoT).push(boxGeo(1.5, 0.035, 0.07, x, S.ceiling - 0.465, z));
      }
    }
    scene.add(new THREE.Mesh(mergeGeometries(geoH), housing));
    scene.add(new THREE.Mesh(mergeGeometries(geoT), this.tubeMat));
    const dead = new THREE.Mesh(mergeGeometries(geoD), this.tubeDeadMat);
    scene.add(dead);
    this.flicker.push({ mat: this.tubeDeadMat, kind: 'tube', base: 2.2 });
  }

  // ------------------------------------------------------------------------------------------
  /** Mesh for a train (cars, doors, lit interiors, lamps); moved along by update(). */
  addTrain(train) {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xb9bdc0, roughness: 0.32, metalness: 0.85 });
    const stripe = new THREE.MeshStandardMaterial({ color: LINE, roughness: 0.4, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b1013, roughness: 0.06, metalness: 0.3, emissive: 0x9aa58c, emissiveIntensity: 0.22 });
    const inner = new THREE.MeshStandardMaterial({ color: 0xc9cbc2, roughness: 0.7, emissive: 0x2a2d27, emissiveIntensity: 0.6 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x3d3f3a, roughness: 0.85 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x27446a, roughness: 0.8 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xf2f6e8 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd0d3d4, roughness: 0.25, metalness: 0.9 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xa7abae, roughness: 0.3, metalness: 0.85 });
    const sd = train.side, W = S.W;
    // the same walls the physics has (built for the train standing at x = 0)
    const x0 = train.x;
    train.x = 0;
    const boxes = train.boxes();
    train.x = x0;
    const walls = [], floors = [], glassG = [], stripeG = [], seats = [], poles = [], lights = [], roof = [], skirt = [], inside = [];
    const zIn = sd * (W + 0.12), zOut = sd * (W + 0.12 + CAR.width), zc = (zIn + zOut) / 2;
    for (const b of boxes) {
      const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
      const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
      if (b.kind === 'carWall') {
        walls.push(boxGeo(sx, sy, sz, cx, cy, cz));
        // window glass on the side walls (on both faces), the line's stripe below it
        if (sz < 0.5 && sx > 0.6) {
          for (const f of [-1, 1]) glassG.push(boxGeo(sx - 0.25, 0.75, 0.01, cx, 1.35, cz + f * (sz / 2 + 0.006)));
          stripeG.push(boxGeo(sx, 0.11, sz + 0.02, cx, 0.62, cz));
        }
      } else if (b.kind === 'carFloor') floors.push(boxGeo(sx, sy, sz, cx, cy, cz));
    }
    for (let k = 0; k < CAR.cars; k++) {
      const cx = (k - (CAR.cars - 1) / 2) * (CAR.len + CAR.gap);
      roof.push(boxGeo(CAR.len, 0.28, CAR.width + 0.12, cx, CAR.height + 0.14, zc));
      skirt.push(boxGeo(CAR.len - 1.2, 0.75, CAR.width - 0.3, cx, -0.78, zc));
      // interior lining: ceiling with a light strip down the middle
      inside.push(boxGeo(CAR.len - 0.3, 0.04, CAR.width - 0.3, cx, CAR.height - 0.04, zc));
      lights.push(boxGeo(CAR.len - 2, 0.03, 0.18, cx, CAR.height - 0.08, zc));
      // longitudinal seats along the far wall, and grab poles by the doors
      seats.push(boxGeo(CAR.len - 2.5, 0.42, 0.48, cx, 0.21, zOut - sd * 0.33));
      seats.push(boxGeo(CAR.len - 2.5, 0.55, 0.08, cx, 0.55, zOut - sd * 0.12));
      for (const d of CAR.doors) poles.push(new THREE.CylinderGeometry(0.02, 0.02, CAR.height, 8).translate(cx + d, CAR.height / 2, zc + sd * 0.2));
    }
    const add = (geos, mat, shadow = false) => {
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      g.add(m);
    };
    add(walls, body, true);
    add(roof, body, true);
    add(skirt, new THREE.MeshStandardMaterial({ color: 0x2b2c2d, roughness: 0.8 }));
    add(floors, floorMat);
    add(glassG, glass);
    add(stripeG, stripe);
    add(inside, inner);
    add(lights, lightMat);
    add(seats, seatMat);
    add(poles, poleMat);
    // doors on the platform side: two leaves per opening that slide apart
    const doors = [];
    for (let k = 0; k < CAR.cars; k++) {
      const cx = (k - (CAR.cars - 1) / 2) * (CAR.len + CAR.gap);
      for (const d of CAR.doors) {
        for (const leaf of [-1, 1]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(CAR.doorWidth / 2, CAR.height - 0.05, 0.05), doorMat);
          const x = cx + d + leaf * CAR.doorWidth / 4;
          m.position.set(x, (CAR.height - 0.05) / 2, zIn + sd * 0.03);
          const win = new THREE.Mesh(new THREE.BoxGeometry(CAR.doorWidth / 2 - 0.14, 0.7, 0.06), glass);
          win.position.y = 1.3 - (CAR.height - 0.05) / 2;
          m.add(win);
          g.add(m);
          doors.push({ m, x0: x, leaf });
        }
      }
    }
    // head- and tail-lamps at both ends; the leading end gets a real light
    const lampW = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
    const lampR = new THREE.MeshBasicMaterial({ color: 0xff2410 });
    const half = TRAIN_LEN / 2;
    for (const e of [-1, 1]) {
      const lead = e === train.dir;
      for (const lz of [-0.9, 0.9]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lead ? lampW : lampR);
        lamp.position.set(e * (half + 0.02), 0.25, zc + lz);
        g.add(lamp);
      }
      // cab end with the destination sign
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({ map: textTexture('NOT IN SERVICE', { bg: '#120d04', fg: '#ffb52e', size: 90, w: 768, h: 140 }) }));
      sign.position.set(e * (half + 0.01), CAR.height - 0.25, zc);
      sign.rotation.y = e > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(sign);
    }
    // a pooled headlight (and the interior light spilling onto the platform through the doors)
    const slot = this.trainLights.find((l) => !l.train) || null;
    if (slot) slot.train = train;
    this.scene.add(g);
    const rec = { g, doors, slot, zc, half };
    this.trainMeshes.set(train, rec);
    return rec;
  }

  removeTrain(train) {
    const t = this.trainMeshes.get(train);
    if (!t) return;
    if (t.slot) {
      t.slot.train = null;
      t.slot.head.intensity = 0;
      t.slot.spill.intensity = 0;
    }
    this.scene.remove(t.g);
    t.g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.trainMeshes.delete(train);
  }

  // ------------------------------------------------------------------------------------------
  update(dt, focus, trains) {
    this.time += dt;
    // the shadowing spot hangs over the player, looking down a little ahead
    if (focus) {
      this.spot.position.set(focus.x, S.ceiling - 0.25, focus.z * 0.6);
      this.spot.target.position.set(focus.x + (focus.fx || 0) * 1.5, 0, focus.z + (focus.fz || 0) * 1.5);
    }
    for (const f of this.flicker) {
      const n = Math.sin(this.time * 31 + f.base * 7) * Math.sin(this.time * 7.3) + Math.sin(this.time * 2.1);
      const on = n > 0.2 || (Math.sin(this.time * 0.7) > 0.6 && n > -0.6);
      if (f.kind === 'tube') f.mat.emissiveIntensity = on ? f.base : 0.05;
      else if (f.kind === 'signal') f.mesh.visible = Math.sin(this.time * 3) > -0.2;
      else if (f.kind === 'screen') f.mesh.material.color.setScalar(on ? 1 : 0.4);
    }
    for (const tr of trains || []) {
      const t = this.trainMeshes.get(tr) || this.addTrain(tr);
      t.g.position.x = tr.x;
      const open = tr.doorOpen;
      for (const d of t.doors) d.m.position.x = d.x0 + d.leaf * open * (CAR.doorWidth / 2 - 0.02);
      if (t.slot) {
        const { head, spill } = t.slot;
        head.position.set(tr.x + tr.dir * (t.half + 0.2), 0.6, t.zc);
        head.target.position.set(tr.x + tr.dir * (t.half + 30), -0.6, t.zc);
        head.intensity = tr.state === 'stopped' ? 15 : 60;
        spill.position.set(tr.x, 1.8, t.zc);
        spill.intensity = 5 * open;
      }
    }
    for (const [tr] of this.trainMeshes) if (!trains || !trains.includes(tr)) this.removeTrain(tr);
  }
}
