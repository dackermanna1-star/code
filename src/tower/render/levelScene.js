import * as THREE from 'three';
import { createTextures, PROP_UV, rng } from './textures.js';
import { WORLD, lambert, unlit, patchWorld, FOG_PARS } from './worldMat.js';
import { Bank } from './geom.js';
import { SKY, buildSky, updateSky } from './sky.js';
import { buildGround, buildWater, roadStrip, groundY } from './terrain.js';
import { house, barn, silo, church, store, shed, crypt, gasStation, waterTower, windmillTower, bridge } from './buildings.js';
import { wreck } from './vehicles.js';
import { buildVegetation } from './vegetation.js';
import { tower, compound, valleyProps, lampPosts, makeGates, makeTrapFactory, makeFloodlights } from './props.js';
import { Crows, fireflies, dust, rain, glows } from './ambience.js';

/**
 * LAST LOOKOUT's world: the valley, the tower, the sky and the weather, built from LAYOUT.
 *
 *   const level = buildLevelScene(LAYOUT, { onLightning(delay, pos) {} });
 *   level.setTimeOfDay(0.1);  level.setRain(0);
 *   // each frame (before rendering):
 *   level.update(dt, camera);
 *
 * Static world: merged per material (~45 draw calls) + instanced vegetation; four real dynamic
 * lights at most (the cabin lantern + three floodlight spots), the rest are emissive glows and
 * additive ground pools. No shadow maps: the long dusk shadows are baked into the ground.
 */

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Time-of-day keyframes (t: 0 dusk .. 1 deep night)
const KEYS = [0, 0.3, 0.55, 0.8, 1];
const TOD = {
  sunCol: [0xffb070, 0xff8a50, 0x000000, 0x8aa8e0, 0x8ca8e8],
  sunI: [6.2, 3.4, 0.0, 0.6, 0.65],
  hemiSky: [0x9a90b8, 0x7a7098, 0x4a5080, 0x2a385e, 0x202c52],
  hemiGround: [0x5a4636, 0x4a3a30, 0x2a2630, 0x161820, 0x101218],
  hemiI: [0.8, 0.72, 0.62, 0.58, 0.54],
  fog: [0x8a7488, 0x6e5a74, 0x3a3a5a, 0x1e2440, 0x161c30],
  fogSun: [0xf0a060, 0xe07848, 0x6a4a62, 0x2c3654, 0x26324e],
  fogGlow: [7, 8, 8, 10, 10],
  fogFar: [900, 820, 700, 600, 560],
  mist: [0.004, 0.006, 0.011, 0.016, 0.018],
  zenith: [0x3a3c6a, 0x2c2e58, 0x161c3c, 0x0a1026, 0x070b1c],
  mid: [0x8a6e8a, 0x6a5276, 0x2e3054, 0x18213a, 0x121a30],
  cloudDark: [0x4a3a54, 0x3a2c48, 0x1e1e34, 0x10142a, 0x0c101e],
  cloudLit: [0xf09060, 0xd06048, 0x4a3448, 0x2c3450, 0x262c44],
  sunGlow: [0xd06a30, 0xc05030, 0x402030, 0x101828, 0x0c1420],
  mtnFar: [0x6a5a7a, 0x56486a, 0x2e2e4a, 0x1a2036, 0x141a2e],
  mtnNear: [0x3a2e44, 0x2e2438, 0x1a1a2c, 0x0e1220, 0x0a0e1a],
  alpen: [0xc07060, 0xa05050, 0x2a1a2a, 0x000000, 0x000000],
  wire: [0x2a2622, 0x241f1c, 0x14141a, 0x0c0e14, 0x0a0c12],
  exposure: [1.0, 1.02, 1.1, 1.22, 1.28],
};
const GRADE = {
  lift: [[0.012, 0.0, 0.025], [0.012, 0.0, 0.03], [0.01, 0.01, 0.04], [0.008, 0.016, 0.05], [0.008, 0.016, 0.05]],
  gain: [[1.05, 0.99, 0.92], [1.06, 0.97, 0.9], [0.98, 0.97, 1.02], [0.93, 0.98, 1.08], [0.92, 0.98, 1.08]],
  sat: [0.94, 0.95, 0.9, 0.86, 0.85],
};

function keyAt(t) {
  t = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1]) i++;
  return [i, (t - KEYS[i]) / (KEYS[i + 1] - KEYS[i])];
}
const _ca = new THREE.Color(), _cb = new THREE.Color();
function lerpHex(arr, i, k, out) {
  _ca.setHex(arr[i]);
  _cb.setHex(arr[i + 1]);
  return out.copy(_ca).lerp(_cb, k);
}
function lerpNum(arr, i, k) {
  return lerp(arr[i], arr[i + 1], k);
}

export function buildLevelScene(LAYOUT, opts = {}) {
  const L = LAYOUT;
  const T = createTextures();
  const scene = new THREE.Scene();
  scene.name = 'lastLookout';
  scene.background = new THREE.Color(0x6a5a6e);
  scene.fog = new THREE.Fog(0x6a5a6e, 0, 620);
  const R = rng(1234);

  // ---- sun direction (the disc) and its azimuth for the baked shadows
  const SUN_AZ = Math.atan2(-0.08, -0.99); // a little north of west, just left of the steeple
  const sunDir = new THREE.Vector3();
  const moonDir = SKY.uMoonDir.value;

  // ---- materials
  const poly = (m, f = -1, u = -2) => {
    m.polygonOffset = true;
    m.polygonOffsetFactor = f;
    m.polygonOffsetUnits = u;
    return m;
  };
  const DS = THREE.DoubleSide;
  const M = {
    steel: lambert({ map: T.towerSteel }, { wet: 0.15 }),
    concrete: lambert({ map: T.concrete }, { wet: 0.25 }),
    cabinWood: lambert({ map: T.cabinWood }, { wet: 0.2 }),
    cabinIn: lambert({ map: T.cabinPine }, { interior: true, key: 'cabinIn' }),
    roofGreen: lambert({ map: T.greenShingles }, { wet: 0.2 }),
    paint: lambert({ map: T.car }, { wet: 0.15 }),
    trim: lambert({ map: T.trim }, { wet: 0.2 }),
    grating: lambert({ map: T.grating, alphaTest: 0.5, side: DS }),
    chain: lambert({ map: T.chainLink, alphaTest: 0.5, side: DS }),
    planks: lambert({ map: T.greyPlanks }, { wet: 0.25 }),
    red: lambert({ map: T.redPlanks }, { wet: 0.25 }),
    clap: lambert({ map: T.clapboard }, { wet: 0.2 }),
    brick: lambert({ map: T.brick }, { wet: 0.25 }),
    shingle: lambert({ map: T.shingles, side: DS }, { wet: 0.2 }),
    corr: lambert({ map: T.corrugated, side: DS }, { wet: 0.15 }),
    charred: lambert({ map: T.charred, side: DS }, { wet: 0.1 }),
    window: lambert({ map: T.window }),
    windowBroken: lambert({ map: T.windowBroken }),
    black: lambert({}),
    car: lambert({ map: T.car }, { wet: 0.15 }),
    signs: poly(lambert({ map: T.signs, alphaTest: 0.5, side: DS }), -1, -1),
    props: lambert({ map: T.props }, { wet: 0.1 }),
    propsIn: lambert({ map: T.props }, { interior: true, key: 'propsIn' }),
    sandbag: lambert({ map: T.sandbag }, { wet: 0.3 }),
    hay: lambert({ map: T.hay }, { wet: 0.25 }),
    bark: lambert({ map: T.bark }, { wet: 0.2 }),
    leaves: lambert({ map: T.foliage, alphaTest: 0.5, side: DS }, { sway: true, wet: 0.15 }),
    stone: lambert({ map: T.stone }, { wet: 0.25 }),
    corn: lambert({ map: T.corn, alphaTest: 0.5, side: DS }, { sway: true, wet: 0.15 }),
    asphalt: poly(lambert({ map: T.asphalt }, { wet: 0.35 }), -2, -4),
    dirtRoad: poly(lambert({ map: T.dirtRoad, alphaTest: 0.5 }, { wet: 0.35 }), -1, -2),
    track: poly(lambert({ map: T.track, alphaTest: 0.5 }, { wet: 0.35 }), -1, -3),
    cardPine: lambert({ map: T.pine, alphaTest: 0.5, side: DS, vertexColors: false }, { sway: true, wet: 0.1 }),
    cardBroad: lambert({ map: T.broad, alphaTest: 0.5, side: DS, vertexColors: false }, { sway: true, wet: 0.1 }),
    cardBare: lambert({ map: T.bare, alphaTest: 0.5, side: DS, vertexColors: false }, { sway: true, wet: 0.1 }),
    cardPoplar: lambert({ map: T.poplar, alphaTest: 0.5, side: DS, vertexColors: false }, { sway: true, wet: 0.1 }),
    tuft: lambert({ map: T.grassTuft, alphaTest: 0.5, side: DS, vertexColors: false }, { sway: true, wet: 0.15 }),
    treeline: lambert({ map: T.treeline, alphaTest: 0.5, vertexColors: false }, { sway: true }),
    gate: lambert({ map: T.greyPlanks, vertexColors: false }, { wet: 0.2 }),
    wire: unlit({ color: 0x2a2622, vertexColors: false }),
    lens: unlit({ color: 0xeef4ff, intensity: 3, vertexColors: false }),
    pool: unlit({ map: T.pool, blending: 'add', color: 0xd4dcf0, intensity: 0.22, nightOnly: true, polygonOffset: true, vertexColors: false }),
    sodiumPool: unlit({ map: T.pool, blending: 'add', color: 0xff8a30, intensity: 0.5, nightOnly: true, polygonOffset: true, vertexColors: false }),
    lampHead: unlit({ color: 0xffffff, intensity: 2.6, nightOnly: true, flicker: false }),
    lampFlicker: unlit({ color: 0xffffff, intensity: 2.6, nightOnly: true, flicker: true }),
    winGlow: unlit({ color: 0xffb466, intensity: 1.6, nightOnly: true }),
    candle: unlit({ color: 0xff9440, intensity: 1.5, nightOnly: true, flicker: true }),
    lanternGlass: unlit({ map: T.props, color: 0xffd090, intensity: 2.2, vertexColors: false }),
  };
  M.sodiumPool.depthWrite = false;
  M.pool.depthWrite = false;
  // floodlight beam: additive cone, brighter on the axis and near the lamp, a little dust in it
  M.beam = new THREE.ShaderMaterial({
    uniforms: { ...Object.fromEntries(Object.keys(WORLD).map((k) => [k, WORLD[k]])), uK: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying float vAlong;
      void main() {
        vAlong = -position.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK;
      uniform float uNight;
      uniform float uRain;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying float vAlong;
      ${FOG_PARS}
      void main() {
        vec3 V = normalize(cameraPosition - vWorldPos);
        float edge = pow(abs(dot(normalize(vN), V)), 2.6);
        float along = pow(1.0 - smoothstep(0.0, 1.0, vAlong), 1.6) * smoothstep(0.0, 0.04, vAlong);
        float motes = 0.8 + 0.2 * sin(vWorldPos.x * 3.1 + uTime * 0.7) * sin(vWorldPos.z * 2.7 - uTime * 0.5 + vWorldPos.y * 4.0);
        float k = uK * edge * along * motes * (0.012 + 0.05 * uNight) * (1.0 + uRain * 2.2);
        vec3 dir;
        float f = worldFogAmount(vWorldPos, dir);
        gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * k * (1.0 - f * 0.8), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  // cloth (wind flags, the windsock): positions from an anchor and an offset in the wind's frame
  M.cloth = lambert({ map: T.flag, alphaTest: 0.5, side: DS }, {
    key: 'cloth',
    vertPars: 'attribute vec3 anchor;\nattribute vec3 offs;',
    beginNormal: `vec2 cwd = normalize(uWindDir + vec2(1e-4));\nvec3 objectNormal = vec3(-cwd.y, 0.25, cwd.x);`,
    beginVertex: /* glsl */ `
      float ct = offs.x;
      float cwave = sin(uTime * 9.0 - ct * 6.0 + anchor.x * 0.37) * 0.12 * ct * (0.25 + uWindAmp);
      float cdroop = (1.0 - clamp(uWindAmp * 1.8, 0.0, 1.0)) * ct * 0.85;
      vec3 cW = vec3(cwd.x, 0.0, cwd.y), cP = vec3(-cwd.y, 0.0, cwd.x);
      vec3 transformed = anchor + cW * ct * (1.0 - cdroop * 0.5) + vec3(0.0, offs.y - cdroop, 0.0) + cP * (offs.z + cwave);`,
  });

  // ---- lights (fixed set: no shader recompiles when floodlights come and go)
  const sun = new THREE.DirectionalLight(0xffb070, 3);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9a90b8, 0x5a4636, 1.2);
  scene.add(hemi);
  const lanternPos = new THREE.Vector3(-1.15, L.tower.cabin.eavesY - 0.55, 1.15);
  const lantern = new THREE.PointLight(0xffa850, 1.5, 14, 2);
  lantern.position.copy(lanternPos);
  scene.add(lantern);
  const spots = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.SpotLight(0xdde6f6, 0, 70, 0.42, 0.7, 2);
    s.position.set(0, -100, 0);
    s.target.position.set(0, -101, 0);
    s.userData.active = false;
    scene.add(s, s.target);
    spots.push(s);
  }

  // ---- sky, ground, water
  const sky = buildSky(T);
  scene.add(sky.group);
  const ground = buildGround(L, T, SUN_AZ);
  scene.add(ground);
  const water = buildWater(T);
  scene.add(water);

  // ---- static props (merged per material)
  const bank = new Bank();
  const wires = [];
  tower(bank, L, wires);
  compound(bank, L, wires);
  const { flags } = valleyProps(bank, L, wires);
  lampPosts(bank, L);
  const S = L.scenery;
  const glowFor = Object.fromEntries((S.windowLights ?? []).map((w) => [w.building, w.kind]));
  for (const b of S.buildings) {
    const spec = { ...b, glow: glowFor[b.id] };
    if (b.type === 'house') house(bank, spec);
    else if (b.type === 'barn') barn(bank, spec);
    else if (b.type === 'church') church(bank, spec);
    else if (b.type === 'store') store(bank, spec);
    else if (b.type === 'shed' || b.type === 'shelter') shed(bank, spec);
    else if (b.type === 'crypt') crypt(bank, spec);
  }
  for (const s of S.silos) silo(bank, s);
  gasStation(bank, S.gas, S.buildings.find((b) => b.id === 'gasShop'));
  waterTower(bank, S.waterTower);
  windmillTower(bank, S.windmill);
  for (const br of S.bridges) bridge(bank, br, L.river.waterY);
  for (const w of S.wrecks) wreck(bank, w);
  // roads
  {
    const gaps = S.bridges.filter((b) => b.kind === 'wood').map((b) => [b.z0, b.z1, b.x - b.half - 1, b.x + b.half + 1]);
    let k = 0;
    for (const r of S.roads) {
      const name = r.kind === 'asphalt' ? 'asphalt' : r.kind === 'track' ? 'track' : 'dirtRoad';
      const b = bank.b(name);
      b.setColor(1, 1, 1);
      bank.identity();
      roadStrip(b, r, r.kind === 'asphalt' ? 0.04 : 0.02 + k * 0.002, r.kind === 'asphalt' ? 14.4 : 9.2, r.kind === 'asphalt' ? [] : gaps);
      k++;
    }
  }
  // window glows: lit windows of the buildings named in LAYOUT.scenery.windowLights
  {
    for (const wl of S.windowLights ?? []) {
      const b = S.buildings.find((bb) => bb.id === wl.building);
      if (!b) continue;
      const G = bank.b(wl.kind === 'candle' ? 'candle' : 'winGlow');
      G.setColor(1, 1, 1);
      const [w, d] = b.size;
      bank.at(b.pos[0], 0, b.pos[1], b.yaw);
      if (b.type === 'church') {
        // candlelight in the open doorway of the steeple, facing the tower
        const sz0 = d / 2 + 1.9;
        G.quad([-0.7, 0.3, sz0 + 1.84], [0.7, 0.3, sz0 + 1.84], [0.7, 2.7, sz0 + 1.84], [-0.7, 2.7, sz0 + 1.84], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, 1]);
        for (const sx of [1, -1]) {
          for (let k = 0; k < 4; k++) {
            const z = -d / 2 + 2.6 + k * ((d - 5.2) / 3);
            const x = sx * (w / 2 + 0.035);
            if (sx > 0) G.quad([x, 1.4, z + 0.4], [x, 1.4, z - 0.4], [x, 3.8, z - 0.4], [x, 3.8, z + 0.4], [0, 0], [1, 0], [1, 1], [0, 1], [1, 0, 0]);
            else G.quad([x, 1.4, z - 0.4], [x, 1.4, z + 0.4], [x, 3.8, z + 0.4], [x, 3.8, z - 0.4], [0, 0], [1, 0], [1, 1], [0, 1], [-1, 0, 0]);
          }
        }
      } else {
        const n = Math.max(1, Math.floor(w / 2.6));
        for (let k = 0; k < n; k++) {
          const cx = -w / 2 + (w * (k + 0.5)) / n;
          if (k === Math.floor(n / 2)) continue;
          G.quad([cx - 0.5, 1.0, d / 2 + 0.035], [cx + 0.5, 1.0, d / 2 + 0.035], [cx + 0.5, 2.2, d / 2 + 0.035], [cx - 0.5, 2.2, d / 2 + 0.035], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, 1]);
        }
      }
      bank.identity();
    }
  }
  // lamp heads (the valley's fake lights) and their pools
  const pools = new Bank();
  {
    for (const l of S.lamps) {
      const [x, y, z] = l.pos;
      const col = l.kind === 'sodium' ? [1.0, 0.62, 0.25] : l.kind === 'fluoro' ? [0.75, 0.95, 0.85] : [1.0, 0.85, 0.6];
      const H = bank.b(l.flicker ? 'lampFlicker' : 'lampHead');
      H.setColor(col);
      if (l.kind === 'fluoro') {
        for (const o of [-3, 0, 3]) H.quad([x - 0.6, y - 0.02, z + o + 0.15], [x + 0.6, y - 0.02, z + o + 0.15], [x + 0.6, y - 0.02, z + o - 0.15], [x - 0.6, y - 0.02, z + o - 0.15], [0, 0], [1, 0], [1, 1], [0, 1], [0, -1, 0]);
      } else {
        H.box(x, y - 0.02, z, 0.42, 0.06, 0.22, { uv: [1, 1], split: false });
      }
      const P = pools.b(l.kind === 'sodium' || l.kind === 'work' ? 'sodiumPool' : 'pool');
      P.setColor(l.kind === 'work' ? [1.0, 0.85, 0.55] : col);
      const r = l.radius;
      P.quad([x - r, 0.08, z + r], [x + r, 0.08, z + r], [x + r, 0.08, z - r], [x - r, 0.08, z - r], [0, 0], [1, 0], [1, 1], [0, 1], [0, 1, 0]);
    }
  }
  // the cabin lantern's glass
  {
    const G = bank.b('lanternGlass');
    G.setColor(1, 1, 1);
    const [gx, gy, gw, gh] = PROP_UV.lanternGlass;
    const atl = { tex: [128, 128], all: [gx, gy, gw, gh] };
    G.box(lanternPos.x, lanternPos.y, lanternPos.z, 0.09, 0.15, 0.09, { atlas: atl, split: false });
    const C = bank.b('steel');
    C.setColor(0.3, 0.28, 0.26);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) C.beam([lanternPos.x + dx * 0.06, lanternPos.y - 0.11, lanternPos.z + dz * 0.06], [lanternPos.x + dx * 0.06, lanternPos.y + 0.12, lanternPos.z + dz * 0.06], 0.012);
    C.cyl(lanternPos.x, lanternPos.y + 0.1, lanternPos.z, 0.08, 0.06, { seg: 6, r1: 0.03, caps: 'top', uv: [1, 1] });
  }
  const staticMeshes = bank.meshes(M, scene);
  const poolMeshes = pools.meshes(M, scene);
  for (const m of poolMeshes) m.renderOrder = 3;
  // wires: one line set
  {
    const arr = new Float32Array(wires.length * 6);
    wires.forEach((w, i) => arr.set(w, i * 6));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const lines = new THREE.LineSegments(g, M.wire);
    lines.frustumCulled = false;
    lines.matrixAutoUpdate = false;
    scene.add(lines);
  }

  // ---- vegetation
  const vegBank = new Bank();
  const veg = buildVegetation(L, vegBank, M);
  for (const m of veg.meshes) scene.add(m);
  vegBank.meshes(M, scene);

  // ---- cloth: wind flags on the range boards and the compound's windsock
  {
    const anchor = [], offs = [], uv = [], idx = [];
    let base = 0;
    const quad = (ax, ay, az, verts) => {
      for (const [ox, oy, oz, u, v] of verts) {
        anchor.push(ax, ay, az);
        offs.push(ox, oy, oz);
        uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    };
    for (const [x, y, z, w, h] of flags) {
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * w, b2 = ((s + 1) / 3) * w;
        quad(x, y, z, [[a, -h / 2, 0, s / 3, 0], [b2, -h / 2, 0, (s + 1) / 3, 0], [b2, h / 2, 0, (s + 1) / 3, 1], [a, h / 2, 0, s / 3, 1]]);
      }
    }
    // windsock: a cone of 6 strips x 4 segments
    const wx = 7.0, wy = 6.05, wz = -7.0, len = 1.6;
    for (let s = 0; s < 4; s++) {
      const t0 = (s / 4) * len, t1 = ((s + 1) / 4) * len;
      const r0 = 0.24 - 0.13 * (s / 4), r1 = 0.24 - 0.13 * ((s + 1) / 4);
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
        quad(wx, wy, wz, [
          [t0, Math.sin(a0) * r0, Math.cos(a0) * r0, s / 4, k / 6], [t1, Math.sin(a0) * r1, Math.cos(a0) * r1, (s + 1) / 4, k / 6],
          [t1, Math.sin(a1) * r1, Math.cos(a1) * r1, (s + 1) / 4, (k + 1) / 6], [t0, Math.sin(a1) * r0, Math.cos(a1) * r0, s / 4, (k + 1) / 6],
        ]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(anchor, 3)); // (replaced in the shader)
    g.setAttribute('anchor', new THREE.Float32BufferAttribute(anchor, 3));
    g.setAttribute('offs', new THREE.Float32BufferAttribute(offs, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(anchor.length), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(anchor.length).fill(1), 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, M.cloth);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    scene.add(m);
  }

  // ---- the windmill's wheel (turns into the wind)
  const windmill = new THREE.Group();
  {
    const W = S.windmill;
    windmill.position.set(W.pos[0], W.h + 0.3, W.pos[1]);
    const wb = new Bank();
    const St = wb.b('steel');
    St.setColor(0.75, 0.75, 0.72);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      wb.identity();
      St.quad([0, c * 0.5, s * 0.5], [0.12, c * 1.9, s * 1.9], [0.0, c * 1.9 + -s * 0.28, s * 1.9 + c * 0.28], [-0.05, c * 0.5 - s * 0.12, s * 0.5 + c * 0.12], [0, 0], [1, 0], [1, 1], [0, 1]);
    }
    St.cyl(0, -0.15, 0, 0.18, 0.3, { seg: 8, caps: 'both', uv: [1, 1] });
    const wheel = new THREE.Group();
    for (const m of wb.meshes(M)) wheel.add(m);
    wheel.rotation.order = 'YXZ';
    const head = new THREE.Group();
    head.add(wheel);
    wheel.position.set(0.5, 0, 0);
    const vb = new Bank();
    const Pv = vb.b('paint');
    Pv.setColor(0.75, 0.73, 0.68);
    Pv.box(-1.4, 0.1, 0, 2.6, 0.06, 0.06, { atlas: { tex: [64, 64], all: [0, 0, 32, 32] } });
    Pv.quad([-2.6, -0.4, 0], [-1.6, -0.25, 0], [-1.6, 0.6, 0], [-2.6, 0.75, 0], [0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]);
    Pv.quad([-1.6, -0.25, 0], [-2.6, -0.4, 0], [-2.6, 0.75, 0], [-1.6, 0.6, 0], [0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]);
    for (const m of vb.meshes(M)) head.add(m);
    windmill.add(head);
    windmill.userData = { head, wheel };
    scene.add(windmill);
  }

  // ---- gates, floodlights, traps
  const gates = makeGates(L, M.gate);
  scene.add(gates.mesh);
  const flood = makeFloodlights(L, M, spots);
  scene.add(flood.group);
  // halos: the valley's lamps (always on at night) then the floodlight lenses (when bought)
  const glowList = S.lamps.map((l) => ({
    pos: [l.pos[0], l.pos[1] - 0.15, l.pos[2]],
    color: l.kind === 'sodium' ? [1.0, 0.55, 0.18] : l.kind === 'fluoro' ? [0.55, 0.8, 0.7] : [1.0, 0.75, 0.45],
    size: l.kind === 'fluoro' ? 7 : 3.2, flicker: l.flicker ?? 0,
  }));
  const glowBase = glowList.length;
  for (const m of L.floodlightMounts) glowList.push({ pos: m.pos, color: [0.8, 0.88, 1.0], size: 2.6, on: 0 });
  const halos = glows(glowList, T);
  scene.add(halos);
  const floodIndex = Object.fromEntries(L.floodlightMounts.map((m, i) => [m.id, glowBase + i]));
  const trapFactory = makeTrapFactory(M);
  const traps = new THREE.Group();
  traps.name = 'traps';
  scene.add(traps);

  // ---- ambience
  const crows = new Crows(L, T);
  scene.add(crows.points);
  const flies = fireflies(L);
  scene.add(flies);
  const dustPts = dust(L, T);
  scene.add(dustPts);
  const rainLines = rain();
  scene.add(rainLines);

  // ---------------------------------------------------------------------------------------------
  // state

  let tod = 0, rainAmt = 0, time = 0;
  let windSpeed = 4, windAmp = 0.35;
  const windDir = WORLD.uWindDir.value;
  windDir.set(0.94, 0.34).normalize();
  let flash = 0, nextBolt = 8, flashSeq = 0;
  const flashTimes = [0, 0.09, 0.22, 0.31];
  const grade = { exposure: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1.1, vignette: 1 };
  scene.userData.retroGrade = grade;
  const base = { hemiI: 1, sunI: 1, fogFar: 600, mist: 0.006 };
  const _col = new THREE.Color(), _col2 = new THREE.Color();
  const sunVisDir = new THREE.Vector3();

  function setTimeOfDay(t) {
    tod = Math.min(1, Math.max(0, t));
    const [i, k] = keyAt(tod);
    // the sun's disc sinks below the western ridge; the moon rises in the south-east
    const elev = lerp(4.6, -26, smooth(0, 1, tod) ** 0.8) * (Math.PI / 180);
    const ce = Math.cos(elev);
    sunVisDir.set(Math.cos(SUN_AZ) * ce, Math.sin(elev), Math.sin(SUN_AZ) * ce);
    SKY.uSunDir.value.copy(sunVisDir);
    SKY.uSunVis.value = smooth(-0.05, 0.02, Math.sin(elev));
    const sunness = 1 - smooth(0.36, 0.5, tod);
    // the lighting direction is a little higher than the disc (long but readable shadows)
    if (sunness > 0.5) {
      const le = Math.max(0.12, elev + 0.24);
      sunDir.set(Math.cos(SUN_AZ) * Math.cos(le), Math.sin(le), Math.sin(SUN_AZ) * Math.cos(le));
    } else sunDir.copy(moonDir);
    sun.position.copy(sunDir).multiplyScalar(300);
    lerpHex(TOD.sunCol, i, k, sun.color);
    base.sunI = lerpNum(TOD.sunI, i, k);
    lerpHex(TOD.hemiSky, i, k, hemi.color);
    lerpHex(TOD.hemiGround, i, k, hemi.groundColor);
    base.hemiI = lerpNum(TOD.hemiI, i, k);
    lerpHex(TOD.fog, i, k, WORLD.uFogColor.value);
    lerpHex(TOD.fogSun, i, k, WORLD.uFogSunColor.value);
    WORLD.uFogGlow.value = lerpNum(TOD.fogGlow, i, k);
    WORLD.uFogSunDir.value.copy(sunness > 0.5 ? sunVisDir : moonDir);
    if (sunness <= 0.5) WORLD.uFogSunDir.value.set(moonDir.x, 0.05, moonDir.z).normalize();
    base.fogFar = lerpNum(TOD.fogFar, i, k);
    base.mist = lerpNum(TOD.mist, i, k);
    lerpHex(TOD.zenith, i, k, SKY.uSkyZenith.value);
    lerpHex(TOD.mid, i, k, SKY.uSkyMid.value);
    lerpHex(TOD.cloudDark, i, k, SKY.uCloudDark.value);
    lerpHex(TOD.cloudLit, i, k, SKY.uCloudLit.value);
    lerpHex(TOD.sunGlow, i, k, SKY.uSunGlow.value);
    lerpHex(TOD.mtnFar, i, k, SKY.uMtnFar.value);
    lerpHex(TOD.mtnNear, i, k, SKY.uMtnNear.value);
    lerpHex(TOD.alpen, i, k, SKY.uAlpenglow.value);
    SKY.uSunColor.value.setRGB(2.4, 2.0, 1.3);
    SKY.uStarAlpha.value = smooth(0.42, 0.78, tod);
    WORLD.uNight.value = smooth(0.32, 0.72, tod);
    lerpHex(TOD.wire, i, k, M.wire.uniforms.uColor.value);
    ground.userData.uniforms.uShadowK.value = sunness;
    // the post grade
    grade.exposure = lerpNum(TOD.exposure, i, k);
    for (let c = 0; c < 3; c++) {
      grade.lift[c] = lerp(GRADE.lift[i][c], GRADE.lift[i + 1][c], k);
      grade.gain[c] = lerp(GRADE.gain[i][c], GRADE.gain[i + 1][c], k);
    }
    grade.saturation = lerpNum(GRADE.sat, i, k);
    applyWeather();
  }

  function applyWeather() {
    const r = rainAmt;
    SKY.uCloudCover.value = lerp(0.44, 0.97, r);
    sun.intensity = base.sunI * (1 - 0.85 * r);
    hemi.intensity = base.hemiI * (1 - 0.3 * r) + flash * 2.2;
    WORLD.uFogParams.value.set(lerp(base.fogFar, 470, r), 1, lerp(base.mist, base.mist + 0.009, r), 6);
    WORLD.uRain.value = r;
    WORLD.uFlash.value = flash * 0.9;
    WORLD.uWindAmp.value = windAmp + r * 0.35;
    // overcast: greyer sky and haze
    if (r > 0) {
      _col.setRGB(0.085, 0.09, 0.11).multiplyScalar(1 - 0.7 * WORLD.uNight.value);
      SKY.uSkyMid.value.lerp(_col, r * 0.7);
      SKY.uSkyZenith.value.lerp(_col, r * 0.5);
      WORLD.uFogColor.value.lerp(_col, r * 0.55);
      SKY.uCloudLit.value.lerp(_col2.copy(_col).multiplyScalar(1.3), r * 0.8);
      SKY.uCloudDark.value.lerp(_col2.copy(_col).multiplyScalar(0.6), r * 0.8);
      SKY.uAlpenglow.value.multiplyScalar(1 - 0.85 * r);
      SKY.uMtnFar.value.lerp(_col, r * 0.5);
    }
    scene.fog.color.copy(WORLD.uFogColor.value).lerp(WORLD.uFogSunColor.value, 0.12);
    scene.fog.far = WORLD.uFogParams.value.x;
    scene.background.copy(scene.fog.color);
    rainLines.visible = r > 0.02;
    rainLines.material.uniforms.uK.value = r * 0.75;
  }

  function setRain(a) {
    rainAmt = Math.min(1, Math.max(0, a || 0));
    if (rainAmt <= 0.45) {
      // the storm passes: no flash left hanging
      flash = 0;
      flashSeq = 0;
      sky.bolt.visible = false;
    }
    setTimeOfDay(tod);
  }

  function setWind(dx, dz, speed = windSpeed) {
    const l = Math.hypot(dx, dz) || 1;
    windDir.set(dx / l, dz / l);
    windSpeed = speed;
    windAmp = Math.min(1, speed / 12);
    applyWeather();
  }

  // ---------------------------------------------------------------------------------------------
  // per frame

  const tmpV = new THREE.Vector3();
  function update(dt, camera) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    time += dt;
    WORLD.uTime.value = time;
    SKY.uCloudShift.value.set(time * 0.004 * (1 + windAmp), time * 0.0015);
    updateSky(sky, camera, smooth(0.32, 0.7, tod));
    // lantern flicker (stronger at night), the floodlight spots
    const night = WORLD.uNight.value;
    const fl = 0.86 + 0.08 * Math.sin(time * 13.1) * Math.sin(time * 7.7 + 1.3) + 0.06 * Math.sin(time * 23.3);
    lantern.intensity = (0.9 + 2.6 * night) * fl;
    M.lanternGlass.uniforms.uIntensity.value = (1.2 + 1.6 * night) * fl;
    for (const s of spots) if (s.userData.active) s.intensity = (25 + 230 * night) * (1 - 0.15 * rainAmt);
    // weather: lightning when it storms
    if (rainAmt > 0.45) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = 6 + R() * 16 * (1.4 - rainAmt);
        flashSeq = 0.0001;
        const a = R() * Math.PI * 2;
        sky.bolt.userData.strike(a, R);
        sky.bolt.visible = true;
        if (opts.onLightning) {
          const dist = 1200 + R() * 2500;
          opts.onLightning(dist / 343, [Math.cos(a) * dist, 0, Math.sin(a) * dist]);
        }
      }
    }
    if (flashSeq > 0) {
      flashSeq += dt;
      let f = 0;
      for (const ft of flashTimes) {
        const d = flashSeq - ft;
        if (d >= 0 && d < 0.08) f = Math.max(f, 1 - d / 0.08);
      }
      flash = f * (0.6 + 0.4 * rainAmt);
      if (flashSeq > 0.45) {
        flashSeq = 0;
        flash = 0;
        sky.bolt.visible = false;
      }
      sky.bolt.material.uniforms.uK.value = flash;
      applyWeather();
    }
    // ambience
    crows.update(dt, camera, time);
    flies.material.uniforms.uK.value = smooth(0.08, 0.3, tod) * (1 - smooth(0.62, 0.85, tod)) * (1 - rainAmt);
    dustPts.material.uniforms.uK.value = (0.1 + windAmp * 0.12) * (1 - rainAmt * 0.8) * (1 - night * 0.7);
    rainLines.material.uniforms.uCam.value.copy(camera.position);
    // the windmill faces the wind and spins
    const wm = windmill.userData;
    wm.head.rotation.y = Math.atan2(-windDir.y, windDir.x) + Math.PI;
    wm.wheel.rotation.x += dt * (0.6 + windAmp * 3.5);
  }

  // ---------------------------------------------------------------------------------------------
  // API

  function placeTrapMesh(kind, pos, yaw = 0) {
    const obj = trapFactory(kind);
    const x = pos.x ?? pos[0], z = pos.z ?? (pos.length > 2 ? pos[2] : pos[1]);
    const y = pos.y !== undefined ? pos.y : pos.length > 2 ? pos[1] : 0;
    obj.position.set(x, kind === 'mine' ? 0.0 : y, z);
    obj.rotation.y = yaw;
    traps.add(obj);
    return obj;
  }
  function removeTrapMesh(obj) {
    if (obj && obj.parent) obj.parent.remove(obj);
  }
  function gateMesh(id) {
    return gates.handles[id];
  }
  function scare(pos) {
    crows.scare(pos);
  }
  function stats() {
    let tris = 0, draws = 0;
    scene.traverse((o) => {
      if (!o.visible || !(o.isMesh || o.isPoints || o.isLine)) return;
      const g = o.geometry;
      const n = g.index ? g.index.count : g.attributes.position.count;
      draws++;
      if (o.isMesh) tris += (n / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    return { draws, tris, trees: veg.treeCount, corn: veg.cornCount, tufts: veg.tuftCount };
  }

  setTimeOfDay(0);
  return {
    scene,
    update,
    setTimeOfDay,
    get timeOfDay() {
      return tod;
    },
    sunDir,
    setRain,
    get rain() {
      return rainAmt;
    },
    setWind,
    addFloodlight: (id) => {
      if (floodIndex[id] !== undefined) halos.userData.setOn(floodIndex[id], 1);
      return flood.add(id);
    },
    removeFloodlight: (id) => {
      if (floodIndex[id] !== undefined) halos.userData.setOn(floodIndex[id], 0);
      flood.remove(id);
    },
    placeTrapMesh,
    removeTrapMesh,
    gateMesh,
    scare,
    stats,
    groundY,
    lights: { sun, hemi, lantern, spots },
    materials: M,
  };
}
