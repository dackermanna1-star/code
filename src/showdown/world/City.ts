import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/math';
import { RAPIER } from '../../physics/Physics';
import { RAMP_WORLD, addOutline, outlineMaterial, toon } from '../render/Toon';
import { Builder, canvasTex } from './Build';
import { Building, BuildingSpec } from './Buildings';
import { STYLE, facadeMaterial, FACADE_U } from './Facade';
import { ConvexPoly, polyGeometry } from './Poly';
import { CarKind, bench, busStop, carModel, guardRail, planter, signGantry, streetLight, trafficSignal, tree, vendingMachine } from './Props';
import { DAY, Sky } from './Sky';

/** Road layout (metres; x east, z south, intersection at the origin). */
export const ROAD = {
  /** north-south avenue: roadway and sidewalk half widths */
  nsR: 13,
  nsS: 19,
  /** east-west avenue */
  ewR: 11,
  ewS: 17,
  curb: 0.15,
};

/** Where the fight happens: fighters are kept inside this radius. */
export const ARENA_R = 84;

export const SDGROUPS = {
  WORLD: 1,
  PIECE: 2,
  CAR: 4,
  DEBRIS: 8,
  FIGHTER: 16,
};
const grp = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const COLLIDE = {
  world: grp(SDGROUPS.WORLD, 0xffff),
  piece: grp(SDGROUPS.PIECE, SDGROUPS.WORLD | SDGROUPS.PIECE | SDGROUPS.CAR | SDGROUPS.DEBRIS | SDGROUPS.FIGHTER),
  car: grp(SDGROUPS.CAR, SDGROUPS.WORLD | SDGROUPS.PIECE | SDGROUPS.CAR | SDGROUPS.DEBRIS | SDGROUPS.FIGHTER),
  fighter: grp(SDGROUPS.FIGHTER, SDGROUPS.WORLD | SDGROUPS.PIECE | SDGROUPS.CAR),
  debris: grp(SDGROUPS.DEBRIS, SDGROUPS.WORLD | SDGROUPS.PIECE | SDGROUPS.CAR),
  rayStatic: grp(0xffff, SDGROUPS.WORLD),
  rayAll: grp(0xffff, SDGROUPS.WORLD | SDGROUPS.PIECE | SDGROUPS.CAR),
};

const ASPHALT_FRAG = /* glsl */ `
varying vec3 vWP;
float ah(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float an(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ah(i), ah(i + vec2(1.0, 0.0)), f.x), mix(ah(i + vec2(0.0, 1.0)), ah(i + vec2(1.0, 1.0)), f.x), f.y); }
float afbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * an(p); p *= 2.07; a *= 0.5; } return s; }
`;

const S = STYLE;
/** The ring of towers around the intersection: these can be cut down. */
const RING: BuildingSpec[] = [
  { name: 'N1', x: -44, z: -84, w: 44, d: 36, h: 150, style: S.CURTAIN, color: 0x3c4552, glass: 0x5f86b0, floor: 4.2, bay: 1.7 },
  { name: 'N2', x: -98, z: -90, w: 40, d: 44, h: 96, style: S.GRID, color: 0xcfc6b6, glass: 0x4d6a8a },
  {
    name: 'COCOON',
    x: 46,
    z: -100,
    w: 48,
    d: 38,
    h: 204,
    style: S.LATTICE,
    color: 0xeef2f4,
    glass: 0x2a4a6c,
    floor: 4,
    bay: 7.5,
    sides: 24,
    profile: [
      [0.78, 0],
      [0.94, 30],
      [1.0, 70],
      [0.95, 115],
      [0.8, 155],
      [0.55, 185],
      [0.22, 204],
    ],
  },
  { name: 'N4', x: 104, z: -84, w: 34, d: 34, h: 72, style: S.RIBBON, color: 0xe4e4df, glass: 0x34485e, floor: 3.8, bay: 1.5 },
  { name: 'S1', x: -46, z: 86, w: 48, d: 30, h: 178, style: S.FINS, color: 0xbdb6a9, glass: 0x51708e, bay: 1.3, floor: 3.6 },
  { name: 'S2', x: -102, z: 92, w: 38, d: 40, h: 58, style: S.GRID, color: 0x8f735f, glass: 0x405870 },
  { name: 'S3', x: 48, z: 88, w: 42, d: 38, h: 124, style: S.GRID, color: 0xd9d9d5, glass: 0x56789a, bay: 2.2 },
  { name: 'S3b', x: 48, z: 88, w: 30, d: 26, h: 42, y0: 124, style: S.CURTAIN, color: 0x39424d, glass: 0x6a90b8, bay: 1.6 },
  { name: 'S4', x: 102, z: 84, w: 32, d: 28, h: 46, style: S.GRID, color: 0xa7b2ba, glass: 0x3f5a74 },
  { name: 'W1', x: -94, z: -38, w: 40, d: 30, h: 112, style: S.RIBBON, color: 0xdedbd2, glass: 0x2f4256, floor: 4.0, bay: 1.6 },
  { name: 'W2', x: -96, z: 40, w: 40, d: 30, h: 78, style: S.GRID, color: 0xb9ab95, glass: 0x4a6480, bay: 2.4 },
  { name: 'E1', x: 94, z: -38, w: 38, d: 30, h: 88, style: S.CURTAIN, color: 0x46505c, glass: 0x7aa0c4, bay: 1.5 },
  { name: 'E2', x: 96, z: 40, w: 38, d: 30, h: 146, style: S.GRID, color: 0xe2e0d8, glass: 0x52708e, bay: 2.0 },
  { name: 'E2b', x: 96, z: 40, w: 26, d: 20, h: 30, y0: 146, style: S.RIBBON, color: 0xd0cec6, glass: 0x2f4256, bay: 1.6 },
];

/**
 * West Shinjuku at noon on December 24th: a wide intersection ringed by
 * towers, avenues running off into the skyscraper district, Fuji in the haze.
 */
export class City {
  readonly group = new THREE.Group();
  readonly sky = new Sky();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  readonly buildings: Building[] = [];
  readonly cars: { mesh: THREE.Mesh; body: RAPIER.RigidBody }[] = [];
  readonly facadeMat = facadeMaterial();
  readonly propMat = toon(0xffffff, { ramp: RAMP_WORLD, vertexColors: true });
  private time = 0;

  constructor(readonly scene: THREE.Scene, readonly world: RAPIER.World) {
    scene.add(this.group);
    scene.add(this.sky.mesh);
    this.fog = new THREE.FogExp2(DAY.haze.getHex(), DAY.fogDensity);
    this.fog.color.copy(DAY.haze);
    scene.fog = this.fog;
    scene.background = null;

    this.sun = new THREE.DirectionalLight(DAY.sunColor, DAY.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -190;
    sc.right = 190;
    sc.top = 190;
    sc.bottom = -190;
    sc.near = 10;
    sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiIntensity);
    scene.add(this.hemi);
    this.placeSun(new THREE.Vector3());

    this.buildGround();
    this.buildMarkings();
    this.buildRing();
    this.buildDeck();
    this.buildFarCity();
    this.buildProps();
    this.buildSigns();
    this.buildCars();
  }

  /** Ground height (sidewalks and plazas are a curb above the road). */
  groundY(x: number, z: number) {
    return Math.abs(x) > ROAD.nsR && Math.abs(z) > ROAD.ewR ? ROAD.curb : 0;
  }

  /** Keeps the shadow map centred on the action. */
  placeSun(focus: THREE.Vector3) {
    const d = DAY.sunDir;
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.set(focus.x + d.x * 400, d.y * 400, focus.z + d.z * 400);
    this.sun.target.updateMatrixWorld();
  }

  update(dt: number, cam: THREE.Camera) {
    this.time += dt;
    FACADE_U.uTime.value = this.time;
    this.sky.update(this.time, cam);
    for (const c of this.cars) {
      if (c.body.isSleeping()) continue;
      const t = c.body.translation();
      const r = c.body.rotation();
      c.mesh.position.set(t.x, t.y, t.z);
      c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  // ------------------------------------------------------------------ ground
  private buildGround() {
    const asphalt = toon(0x45474c, { ramp: RAMP_WORLD });
    asphalt.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + ASPHALT_FRAG).replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vWP.xz;
          float n = afbm(p * 0.35);
          float fine = an(p * 9.0);
          vec3 c = diffuseColor.rgb * (0.82 + 0.3 * n + 0.08 * fine);
          // repair patches and cracks
          vec2 cell = floor(p / 9.0);
          float ph = ah(cell);
          vec2 pf = fract(p / 9.0);
          if (ph > 0.82 && pf.x > 0.2 && pf.x < 0.75 && pf.y > 0.3 && pf.y < 0.6) c *= 0.82;
          float cr = abs(afbm(p * 0.5 + 7.0) - 0.5);
          c *= 1.0 - (1.0 - smoothstep(0.0, 0.006, cr)) * 0.18 * step(0.68, afbm(p * 0.05));
          // tyre tracks darken the lanes
          float lane = abs(fract(abs(vWP.x) / 3.25) - 0.5);
          if (abs(vWP.z) > 20.0 && abs(vWP.x) < 13.0) c *= 0.94 + 0.06 * smoothstep(0.05, 0.25, lane);
          diffuseColor.rgb = c;
        }`,
      );
    };
    asphalt.customProgramCacheKey = () => 'asphalt';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), asphalt);
    ground.receiveShadow = true;
    this.group.add(ground);

    // raised paving: everything off the two avenues' roadways
    const paving = toon(0xa9a49a, { ramp: RAMP_WORLD });
    paving.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + ASPHALT_FRAG).replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vWP.xz;
          vec2 t = p / vec2(0.9, 0.6);
          t.x += step(1.0, mod(floor(t.y), 2.0)) * 0.5;
          vec2 id = floor(t);
          vec2 f = fract(t);
          float h = ah(id);
          vec3 c = diffuseColor.rgb * (0.88 + 0.16 * h);
          if (h > 0.93) c *= vec3(0.9, 0.86, 0.8);
          float g = min(min(f.x, 1.0 - f.x) * 0.9, min(f.y, 1.0 - f.y) * 0.6);
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.03, g);
          // tactile paving strips along the curbs
          float ax = abs(vWP.x); float az = abs(vWP.z);
          float strip = (step(${ROAD.nsR + 0.6}, ax) * step(ax, ${ROAD.nsR + 0.9}) + step(${ROAD.ewR + 0.6}, az) * step(az, ${ROAD.ewR + 0.9}));
          c = mix(c, vec3(0.86, 0.68, 0.12), clamp(strip, 0.0, 1.0) * 0.9);
          c *= 0.95 + 0.1 * afbm(p * 0.2);
          diffuseColor.rgb = c;
        }`,
      );
    };
    paving.customProgramCacheKey = () => 'paving';
    const big = 2900;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const w = big - ROAD.nsR;
        const d = big - ROAD.ewR;
        const g = new THREE.BoxGeometry(w, ROAD.curb, d);
        const m = new THREE.Mesh(g, paving);
        m.position.set(sx * (ROAD.nsR + w / 2), ROAD.curb / 2, sz * (ROAD.ewR + d / 2));
        m.receiveShadow = true;
        this.group.add(m);
      }
    // north-south median with hedges, outside the arena
    const med = new Builder();
    for (const s of [-1, 1]) {
      med.box(2.2, 0.25, 900, 0xb0aca2, 0, 0.125, s * (ARENA_R + 8 + 450));
      for (let z = ARENA_R + 10; z < 900; z += 3.2) med.sphere(0.85, 0x3a6334, 0, 0.75, s * z, 0.9, 0.62, 1.6);
    }
    const medMesh = new THREE.Mesh(med.build(), this.propMat);
    medMesh.receiveShadow = true;
    medMesh.castShadow = true;
    this.group.add(medMesh);

    // physics ground
    const gb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(3000, 1, 3000).setCollisionGroups(COLLIDE.world).setFriction(0.9), gb);
  }

  private buildMarkings() {
    const b = new Builder();
    const W = 0xe9e9e4;
    const Y = 0xe2b33a;
    const y = 0.012;
    const flat = (w: number, d: number, c: number, x: number, z: number) => b.box(w, 0.006, d, c, x, y, z);
    // crosswalks on all four approaches (stripes run with the road)
    const stripes = (alongX: boolean, center: number, half: number) => {
      for (let t = -half + 0.6; t <= half - 0.4; t += 1.0) {
        if (alongX) flat(4.0, 0.5, W, center, t);
        else flat(0.5, 4.0, W, t, center);
      }
    };
    stripes(false, -(ROAD.ewS + 2.5), ROAD.nsR);
    stripes(false, ROAD.ewS + 2.5, ROAD.nsR);
    stripes(true, -(ROAD.nsS + 2.5), ROAD.ewR);
    stripes(true, ROAD.nsS + 2.5, ROAD.ewR);
    // bicycle crossing bands beside them
    for (const s of [-1, 1]) {
      flat(ROAD.nsR * 2, 0.15, W, 0, s * (ROAD.ewS + 5.2));
      flat(ROAD.nsR * 2, 0.15, W, 0, s * (ROAD.ewS + 6.8));
      flat(0.15, ROAD.ewR * 2, W, s * (ROAD.nsS + 5.2), 0);
      flat(0.15, ROAD.ewR * 2, W, s * (ROAD.nsS + 6.8), 0);
    }
    // stop lines on the inbound halves
    flat(ROAD.nsR - 0.5, 0.45, W, -ROAD.nsR / 2, -(ROAD.ewS + 8.2));
    flat(ROAD.nsR - 0.5, 0.45, W, ROAD.nsR / 2, ROAD.ewS + 8.2);
    flat(0.45, ROAD.ewR - 0.5, W, ROAD.nsS + 8.2, -ROAD.ewR / 2);
    flat(0.45, ROAD.ewR - 0.5, W, -(ROAD.nsS + 8.2), ROAD.ewR / 2);
    // lane dashes and centre lines
    const far = 1400;
    for (const s of [-1, 1]) {
      const z0 = ROAD.ewS + 9;
      for (let z = z0; z < far; z += 10) {
        for (const lx of [3.25, 6.5, 9.75]) {
          flat(0.15, 5, W, lx, s * (z + 2.5));
          flat(0.15, 5, W, -lx, s * (z + 2.5));
        }
      }
      flat(0.15, far - z0, Y, 0.18, s * (z0 + (far - z0) / 2));
      flat(0.15, far - z0, Y, -0.18, s * (z0 + (far - z0) / 2));
      flat(0.15, far - z0, W, 12.4, s * (z0 + (far - z0) / 2));
      flat(0.15, far - z0, W, -12.4, s * (z0 + (far - z0) / 2));
      const x0 = ROAD.nsS + 9;
      for (let x = x0; x < far; x += 10) {
        for (const lz of [3.6, 7.2]) {
          flat(5, 0.15, W, s * (x + 2.5), lz);
          flat(5, 0.15, W, s * (x + 2.5), -lz);
        }
      }
      flat(far - x0, 0.15, Y, s * (x0 + (far - x0) / 2), 0.18);
      flat(far - x0, 0.15, Y, s * (x0 + (far - x0) / 2), -0.18);
      flat(far - x0, 0.15, W, s * (x0 + (far - x0) / 2), 10.4);
      flat(far - x0, 0.15, W, s * (x0 + (far - x0) / 2), -10.4);
    }
    // turn arrows on the north approach
    for (const lx of [-3.25 / 2 - 0, -6.5 + 1.6, -11]) {
      flat(0.3, 4.2, W, lx, -(ROAD.ewS + 16));
      b.box(1.1, 0.006, 1.1, W, lx, y, -(ROAD.ewS + 13.6), 0, Math.PI / 4, 0);
    }
    const mat = toon(0xffffff, { ramp: RAMP_WORLD, vertexColors: true });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    const m = new THREE.Mesh(b.build(), mat);
    m.receiveShadow = true;
    this.group.add(m);
  }

  // ------------------------------------------------------------------ buildings
  private buildRing() {
    for (const s of RING) {
      const b = Building.fromSpec(s, this.facadeMat);
      b.makeStatic(this.world, COLLIDE.world);
      this.group.add(b.mesh);
      this.buildings.push(b);
    }
    // low podiums with shops at street level along the plazas
    const pods: BuildingSpec[] = [
      { name: 'P1', x: -44, z: -63, w: 40, d: 6, h: 5.2, style: S.SHOPS, color: 0x9e9282, bay: 4.4 },
      { name: 'P2', x: 48, z: 66, w: 38, d: 6, h: 5.2, style: S.SHOPS, color: 0x8a8d92, bay: 5 },
      { name: 'P3', x: -73, z: -38, w: 6, d: 26, h: 5.2, style: S.SHOPS, color: 0xa29684, bay: 4.4 },
      { name: 'P4', x: 74, z: 40, w: 6, d: 26, h: 5.2, style: S.SHOPS, color: 0x7f848a, bay: 4.8 },
    ];
    for (const s of pods) {
      const b = Building.fromSpec(s, this.facadeMat);
      b.makeStatic(this.world, COLLIDE.world);
      this.group.add(b.mesh);
      this.buildings.push(b);
    }
  }

  /** Pedestrian deck over the east-west avenue (sliceable). */
  private buildDeck() {
    const x = 50;
    const specs: BuildingSpec[] = [
      { name: 'DECK', x, z: 0, w: 5, d: ROAD.ewS * 2 + 6, h: 1.1, y0: 6.2, style: S.PLAIN, color: 0x9da3a8 },
      { name: 'DECK_P1', x, z: -(ROAD.ewS + 1.5), w: 1.4, d: 1.4, h: 6.2, style: S.PLAIN, color: 0x8d9398 },
      { name: 'DECK_P2', x, z: ROAD.ewS + 1.5, w: 1.4, d: 1.4, h: 6.2, style: S.PLAIN, color: 0x8d9398 },
    ];
    for (const s of specs) {
      const b = Building.fromSpec(s, this.facadeMat);
      b.makeStatic(this.world, COLLIDE.world);
      this.group.add(b.mesh);
      this.buildings.push(b);
    }
    // railings on the deck (decor)
    const r = new Builder();
    for (const s of [-1, 1]) {
      r.box(0.08, 1.0, ROAD.ewS * 2 + 6, 0xd8dcdf, x + s * 2.4, 7.8, 0);
      r.box(0.06, 0.06, ROAD.ewS * 2 + 6, 0x8d9398, x + s * 2.4, 8.3, 0);
    }
    // stairs down on the south end
    for (let i = 0; i < 18; i++) r.box(2.2, 0.36, 0.5, 0x9da3a8, x + 3.8, 6.2 - i * 0.345 - 0.18, ROAD.ewS + 4 + i * 0.5);
    const m = new THREE.Mesh(r.build(), this.propMat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
  }

  private buildFarCity() {
    const rnd = mulberry32(2412);
    const near: THREE.BufferGeometry[] = [];
    const far: THREE.BufferGeometry[] = [];
    const colors = [0xd8d4ca, 0xc4bcae, 0x9aa1a8, 0x7c858f, 0xe3e1db, 0xb4a48f, 0x8b7a68, 0x5b6470, 0xa8aeb3];
    const glass = [0x4d6a8a, 0x5f86b0, 0x34485e, 0x6a90b8, 0x405870];
    const add = (x: number, z: number, w: number, d: number, h: number, list: THREE.BufferGeometry[], style?: number) => {
      const st = style ?? [S.GRID, S.GRID, S.RIBBON, S.CURTAIN, S.FINS][Math.floor(rnd() * 5)];
      const poly = ConvexPoly.box(w / 2, d / 2, 0, h);
      const g = polyGeometry(poly, {
        fac: [st, 3.6 + rnd() * 0.8, st === S.CURTAIN ? 1.5 : 1.8 + rnd() * 1.2, rnd()],
        box: [w / 2, d / 2, h, 0],
        color: new THREE.Color(st === S.CURTAIN ? 0x3c4552 : colors[Math.floor(rnd() * colors.length)]),
        glass: new THREE.Color(glass[Math.floor(rnd() * glass.length)]),
      });
      g.translate(x, 0, z);
      list.push(g);
    };
    // landmark: the twin-towered metropolitan government building closing the west vista
    add(-470, 0, 120, 80, 42, near, S.GRID);
    for (const s of [-1, 1]) {
      add(-470, s * 26, 56, 40, 200, near, S.GRID);
      add(-470, s * 26, 44, 32, 243, near, S.GRID);
      add(-470, s * 26 + s * 6, 20, 20, 254, near, S.PLAIN);
    }
    // stepped park-tower trio to the south-west
    add(-330, 330, 40, 40, 235, near, S.CURTAIN);
    add(-372, 330, 40, 40, 205, near, S.CURTAIN);
    add(-351, 372, 40, 40, 175, near, S.CURTAIN);
    const taken = (x: number, z: number, w: number, d: number) =>
      (Math.abs(x) < 130 && Math.abs(z) < 130) ||
      Math.abs(x) < ROAD.nsS + 4 + w / 2 ||
      Math.abs(z) < ROAD.ewS + 4 + d / 2 ||
      (x < -400 && x > -540 && Math.abs(z) < 80) ||
      (x < -300 && x > -400 && z > 300 && z < 400);
    for (let gx = -1500; gx <= 1500; gx += 62) {
      for (let gz = -1500; gz <= 1500; gz += 58) {
        const r = Math.hypot(gx, gz);
        if (r > 1550) continue;
        const nLots = r < 700 ? 2 : 1;
        for (let k = 0; k < nLots; k++) {
          const w = 18 + rnd() * 26;
          const d = 18 + rnd() * 24;
          const x = gx + (rnd() - 0.5) * (62 - w) * 0.8 + (k ? 0 : 0);
          const z = gz + (k ? 1 : -1) * (nLots > 1 ? 14 : 0) + (rnd() - 0.5) * 6;
          if (taken(x, z, w, d)) continue;
          // the skyscraper district is west of the station
          const west = x < 0 ? 1.0 : 0.55;
          const tall = rnd() < 0.18 * west ? 120 + rnd() * 110 : 18 + rnd() * rnd() * 90;
          const h = r > 900 ? tall * 0.7 : tall;
          add(x, z, w, d, h, r < 600 ? near : far);
        }
      }
    }
    const mk = (list: THREE.BufferGeometry[], shadow: boolean) => {
      // merge in batches so frustum culling still helps
      const groups = new Map<string, THREE.BufferGeometry[]>();
      for (const g of list) {
        g.computeBoundingSphere();
        const c = g.boundingSphere!.center;
        const key = `${Math.floor(c.x / 500)},${Math.floor(c.z / 500)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(g);
      }
      for (const arr of groups.values()) {
        const merged = mergeGeometries(arr, false);
        if (!merged) continue;
        const m = new THREE.Mesh(merged, this.facadeMat);
        m.castShadow = shadow;
        m.receiveShadow = true;
        this.group.add(m);
      }
    };
    mk(near, false);
    mk(far, false);
  }

  // ------------------------------------------------------------------ props
  private instanced(geo: THREE.BufferGeometry, mats: THREE.Matrix4[], shadow = true) {
    const m = new THREE.InstancedMesh(geo, this.propMat, mats.length);
    mats.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    this.group.add(m);
    return m;
  }

  private buildProps() {
    const M = (x: number, y: number, z: number, ry = 0, s = 1) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    const c = ROAD.curb;
    // street lights along every curb, arms over the road
    const lights: THREE.Matrix4[] = [];
    for (const s of [-1, 1]) {
      for (let z = 30; z < 700; z += 26) {
        lights.push(M(ROAD.nsR + 0.8, c, s * z, Math.PI));
        lights.push(M(-ROAD.nsR - 0.8, c, s * z, 0));
      }
      for (let x = 34; x < 700; x += 26) {
        lights.push(M(s * x, c, ROAD.ewR + 0.8, Math.PI / 2));
        lights.push(M(s * x, c, -ROAD.ewR - 0.8, -Math.PI / 2));
      }
    }
    this.instanced(streetLight(), lights);
    // signals on the four corners
    const sig: THREE.Matrix4[] = [];
    sig.push(M(ROAD.nsR + 1.4, c, ROAD.ewR + 1.4, Math.PI));
    sig.push(M(-ROAD.nsR - 1.4, c, -ROAD.ewR - 1.4, 0));
    sig.push(M(-ROAD.nsR - 1.4, c, ROAD.ewR + 1.4, Math.PI / 2));
    sig.push(M(ROAD.nsR + 1.4, c, -ROAD.ewR - 1.4, -Math.PI / 2));
    this.instanced(trafficSignal(), sig);
    // ginkgo rows along the sidewalks and a grove in each plaza
    const trees: THREE.Matrix4[][] = [[], [], []];
    const rnd = mulberry32(77);
    const t = (x: number, z: number) => trees[Math.floor(rnd() * 3)].push(M(x, c, z, rnd() * 6.28, 0.85 + rnd() * 0.35));
    for (const s of [-1, 1]) {
      for (let z = 43; z < 700; z += 13) {
        t(ROAD.nsR + 3.6, s * z);
        t(-ROAD.nsR - 3.6, s * z);
      }
      for (let x = 47; x < 700; x += 13) {
        t(s * x, ROAD.ewR + 3.6);
        t(s * x, -ROAD.ewR - 3.6);
      }
    }
    for (const [px, pz] of [
      [-40, -42],
      [36, -46],
      [-36, 44],
      [38, 42],
    ])
      for (let i = 0; i < 6; i++) t(px + (i % 3) * 7 - 7 + rnd() * 2, pz + Math.floor(i / 3) * 8 - 4 + rnd() * 2);
    trees.forEach((list, i) => list.length && this.instanced(tree(11 + i * 7), list));
    // guard rails along the curbs, broken at the crosswalks
    const rails: THREE.Matrix4[] = [];
    for (const s of [-1, 1]) {
      for (let z = ROAD.ewS + 10; z < 600; z += 8.4) {
        rails.push(M(ROAD.nsR + 0.35, c, s * (z + 4), Math.PI / 2));
        rails.push(M(-ROAD.nsR - 0.35, c, s * (z + 4), Math.PI / 2));
      }
      for (let x = ROAD.nsS + 10; x < 600; x += 8.4) {
        rails.push(M(s * (x + 4), c, ROAD.ewR + 0.35, 0));
        rails.push(M(s * (x + 4), c, -ROAD.ewR - 0.35, 0));
      }
    }
    this.instanced(guardRail(8), rails, false);
    // plaza furniture
    const benches: THREE.Matrix4[] = [];
    const planters: THREE.Matrix4[] = [];
    for (const [px, pz, ry] of [
      [-30, -30, 0],
      [-48, -30, 0],
      [30, -32, 0],
      [52, -30, 0],
      [-30, 30, Math.PI],
      [-50, 32, Math.PI],
      [30, 30, Math.PI],
      [56, 32, Math.PI],
    ]) {
      benches.push(M(px, c, pz, ry));
      planters.push(M(px + 4, c, pz + (pz < 0 ? -3 : 3), ry));
    }
    this.instanced(bench(), benches);
    this.instanced(planter(), planters);
    const vend = [0xd0242a, 0x2456c8, 0xf2f2f0, 0x1c8a52];
    vend.forEach((col, i) => this.instanced(vendingMachine(col), [M(58 + i * 1.08, c, 58.6, Math.PI)]));
    vend.forEach((col, i) => this.instanced(vendingMachine(col), [M(-60 - i * 1.08, c, -57.4, 0)]));
    this.instanced(busStop(), [M(36, c, ROAD.ewR + 2.6, Math.PI), M(-38, c, -ROAD.ewR - 2.6, 0)]);
    this.instanced(signGantry(ROAD.nsR * 2 + 2), [M(0, 0, 112, 0), M(0, 0, -118, Math.PI)]);
  }

  /** Blue road signs, shop signs and a billboard (canvas textures). */
  private buildSigns() {
    const font = '"SD Mincho", "SD Impact", "Yu Gothic", "Hiragino Sans", sans-serif';
    const road = (lines: [string, string, string][]) =>
      canvasTex(1024, 300, (g) => {
        g.fillStyle = '#1a4fa0';
        g.fillRect(0, 0, 1024, 300);
        g.strokeStyle = '#f4f4f4';
        g.lineWidth = 8;
        g.strokeRect(10, 10, 1004, 280);
        g.fillStyle = '#f4f4f4';
        lines.forEach(([jp, en, arrow], i) => {
          const x = 40 + i * 330;
          g.font = `bold 72px ${font}`;
          g.fillText(jp, x, 130);
          g.font = `bold 36px "SD Oswald", Arial, sans-serif`;
          g.fillText(en, x, 190);
          g.font = `bold 80px sans-serif`;
          g.fillText(arrow, x + 120, 268);
        });
      });
    const signMat = (t: THREE.Texture) => new THREE.MeshBasicMaterial({ map: t, color: 0xdddddd, fog: true });
    const north = road([
      ['都庁', 'Tochō', '←'],
      ['新宿駅', 'Shinjuku Sta.', '↑'],
      ['中野', 'Nakano', '→'],
    ]);
    const south = road([
      ['代々木', 'Yoyogi', '←'],
      ['甲州街道', 'Kōshū-kaidō', '↑'],
      ['四谷', 'Yotsuya', '→'],
    ]);
    const plane = new THREE.PlaneGeometry(14, 4.1);
    const s1 = new THREE.Mesh(plane, signMat(north));
    s1.position.set(-4, 7.6, 111.8);
    s1.rotation.y = Math.PI;
    const s2 = new THREE.Mesh(plane, signMat(south));
    s2.position.set(4, 7.6, -117.8);
    this.group.add(s1, s2);
    // a giant billboard on the west tower facing the intersection
    const bb = canvasTex(1024, 512, (g) => {
      const grd = g.createLinearGradient(0, 0, 1024, 512);
      grd.addColorStop(0, '#101018');
      grd.addColorStop(1, '#2a1030');
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 512);
      g.fillStyle = '#ffffff';
      g.font = `110px "SD Brush", ${font}`;
      g.fillText('新宿', 60, 190);
      g.fillStyle = '#ff3b6b';
      g.font = `bold 64px "SD Impact", ${font}`;
      g.fillText('年末大売出し', 60, 330);
      g.fillStyle = '#f0d070';
      g.font = `bold 40px "SD Oswald", Arial, sans-serif`;
      g.fillText('YEAR-END SALE  12.24', 60, 430);
      g.strokeStyle = '#f0d070';
      g.lineWidth = 6;
      g.strokeRect(20, 20, 984, 472);
    });
    const bbm = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshBasicMaterial({ map: bb, fog: true }));
    bbm.position.set(-73.9, 38, -38);
    bbm.rotation.y = Math.PI / 2;
    this.group.add(bbm);
    // vertical shop signs on the podiums
    const words = ['ラーメン', 'カラオケ', '薬局', '居酒屋', 'ホテル', 'カフェ'];
    const cols = ['#d42a2a', '#1f6fd0', '#18a058', '#e0a020', '#7a3fc0', '#e05090'];
    words.forEach((w, i) => {
      const tex = canvasTex(128, 512, (g) => {
        g.fillStyle = cols[i];
        g.fillRect(0, 0, 128, 512);
        g.fillStyle = '#fff';
        g.font = `bold 84px "SD Impact", ${font}`;
        g.textAlign = 'center';
        const chars = [...w];
        chars.forEach((ch, k) => g.fillText(ch, 64, 100 + k * (400 / Math.max(3, chars.length))));
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.5, 1.1), [
        new THREE.MeshBasicMaterial({ map: tex }),
        new THREE.MeshBasicMaterial({ map: tex }),
        new THREE.MeshBasicMaterial({ color: cols[i] }),
        new THREE.MeshBasicMaterial({ color: cols[i] }),
        new THREE.MeshBasicMaterial({ color: cols[i] }),
        new THREE.MeshBasicMaterial({ color: cols[i] }),
      ]);
      const spots: [number, number, number][] = [
        [-30, -66.6, 0],
        [-56, -66.6, 0],
        [36, 69.6, 0],
        [60, 69.6, 0],
        [-76.6, -30, Math.PI / 2],
        [77.6, 32, Math.PI / 2],
      ];
      const [x, z, ry] = spots[i];
      m.position.set(x, 9.5, z);
      m.rotation.y = ry + Math.PI / 2;
      m.castShadow = true;
      this.group.add(m);
    });
  }

  // ------------------------------------------------------------------ cars
  private buildCars() {
    const rnd = mulberry32(1224);
    const paints = [0xf2f2f0, 0x1b1c20, 0x9da4ab, 0x2a3d6a, 0x8c1c1c, 0xe8e2d0, 0x3d4a3a];
    const taxis = [0x1c2340, 0xe6c22a, 0x2f7a46];
    const place = (kind: CarKind, x: number, z: number, yaw: number) => {
      const color = kind === 'taxi' ? taxis[Math.floor(rnd() * taxis.length)] : kind === 'bus' ? 0 : paints[Math.floor(rnd() * paints.length)];
      const model = carModel(kind, color);
      const mesh = new THREE.Mesh(model.geo, this.propMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      addOutline(mesh, CAR_OUTLINE);
      const gy = this.groundY(x, z);
      mesh.position.set(x, gy, z);
      mesh.rotation.y = yaw;
      this.group.add(mesh);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, gy, z)
          .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
          .setLinearDamping(0.1)
          .setAngularDamping(0.4)
          .setCanSleep(true),
      );
      const h = model.half;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(h.x, h.y * 0.9, h.z)
          .setTranslation(0, model.cy, 0)
          .setMass(model.mass)
          .setFriction(0.7)
          .setRestitution(0.1)
          .setCollisionGroups(COLLIDE.car),
        body,
      );
      body.sleep();
      this.cars.push({ mesh, body });
    };
    // traffic abandoned mid-evacuation: queues on the approaches, a few strays in the junction
    const lanes = [-11.4, -8.1, -4.9, -1.6, 1.6, 4.9, 8.1, 11.4];
    for (const lx of lanes) {
      const dir = lx < 0 ? 1 : -1;
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const z = dir * -(ROAD.ewS + 14 + i * 7.5 + rnd() * 3) * (lx < 0 ? -1 : 1);
        const kinds: CarKind[] = ['sedan', 'taxi', 'sedan', 'kei', 'van', 'taxi'];
        place(kinds[Math.floor(rnd() * kinds.length)], lx + (rnd() - 0.5) * 0.4, z, (lx < 0 ? Math.PI / 2 : -Math.PI / 2) + (rnd() - 0.5) * 0.12);
      }
    }
    for (const lz of [-9, -5.4, -1.8, 1.8, 5.4, 9]) {
      const n = Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const x = (lz < 0 ? 1 : -1) * (ROAD.nsS + 14 + i * 7.5 + rnd() * 3);
        place(rnd() < 0.3 ? 'taxi' : 'sedan', x, lz, (lz < 0 ? Math.PI : 0) + (rnd() - 0.5) * 0.1);
      }
    }
    place('bus', -7.5, 46, Math.PI / 2 + 0.05);
    place('truck', 36, 4.5, Math.PI + 0.1);
    place('sedan', 5, -3, 0.9);
    place('taxi', -8, 6, -2.2);
    place('van', 22, -7, 2.9);
  }

  /** Static colliders a fighter's capsule should not pass through. */
  get staticMeshes() {
    return this.buildings.map((b) => b.mesh);
  }
}

const CAR_OUTLINE = outlineMaterial(1.6, 0x0d0c12);
