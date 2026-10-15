// Characters sandbox arena: a flat test world with ramps, stairs, vault/climb boxes, a low tunnel,
// a pool with a beach, a 40 m tower with fall-test platforms. Implements IWorld/IEnvironment for the sandbox.
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { IEnvironment, IWorld, MapLocation } from '../core/contracts';
import { RAPIER, Layer } from '../core/Physics';
import type { SurfaceType } from '../core/types';

/** Arena origin (world coords). */
export const ARENA = { x: 1500, z: 1500 };
/** Pool: rectangle (world coords), water surface Y, floor Y. */
export const POOL = { x0: ARENA.x + 50, x1: ARENA.x + 80, z0: ARENA.z - 10, z1: ARENA.z + 6, surface: -0.15, floor: -3.2 };
/** Named test spots: approach positions in front of each feature (features extend north, toward -Z). */
export const SPOTS = {
  start: new THREE.Vector3(ARENA.x, 0, ARENA.z + 30),
  /** Vault/climb row: box i (0..5) at x = boxes.x + i*6, its front face 3.7 m north of the spot. */
  boxes: new THREE.Vector3(ARENA.x - 30, 0, ARENA.z),
  ramps: new THREE.Vector3(ARENA.x + 30, 0, ARENA.z - 30),
  stairs: new THREE.Vector3(ARENA.x - 40, 0, ARENA.z - 30),
  tunnel: new THREE.Vector3(ARENA.x + 25, 0, ARENA.z),
  pool: new THREE.Vector3(POOL.x0 - 3, 0, ARENA.z - 2),
  tower: new THREE.Vector3(ARENA.x - 60, 40, ARENA.z - 60),
  speedTrack: new THREE.Vector3(ARENA.x - 60, 0, ARENA.z + 60),
};
export const BOX_HEIGHTS = [0.5, 0.8, 1.1, 1.6, 2.0, 2.5];

function gridTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6f7d5c';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#66744f';
  g.fillRect(0, 0, 128, 128);
  g.fillRect(128, 128, 128, 128);
  g.strokeStyle = 'rgba(30,40,20,0.55)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(30,40,20,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.moveTo(0, 128);
  g.lineTo(256, 128);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export async function installArenaWorld(ctx: GameContext): Promise<void> {
  const size = 3072;
  const scene = ctx.scene;
  const physics = ctx.physics;
  const tex = gridTexture();

  const matGround = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const matConcrete = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.85 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.8 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x6d7880, roughness: 0.5, metalness: 0.6 });
  const matRed = new THREE.MeshStandardMaterial({ color: 0xa04030, roughness: 0.8 });

  // ── ground with a pool pit ──
  const groundY = 0;
  // NOTE: Rapier's KinematicCharacterController slowly sinks into very large cuboids (half extents ≳ 600 m,
  // f32 precision in the shape casts), so the ground is tiled into ≤ 256 m pieces.
  const addGroundBox = (x0: number, x1: number, z0: number, z1: number) => {
    const TILE = 256;
    for (let tx = x0; tx < x1 - 1e-3; tx += TILE)
      for (let tz = z0; tz < z1 - 1e-3; tz += TILE) {
        const ex = Math.min(x1, tx + TILE), ez = Math.min(z1, tz + TILE);
        const cx = (tx + ex) / 2, cz = (tz + ez) / 2, hx = (ex - tx) / 2, hz = (ez - tz) / 2;
        physics.addStatic(RAPIER.ColliderDesc.cuboid(hx, 2, hz).setTranslation(cx, groundY - 2, cz), { kind: 'terrain', surface: 'grass' }, Layer.Terrain);
      }
  };
  addGroundBox(0, POOL.x0, 0, size);
  addGroundBox(POOL.x1, size, 0, size);
  addGroundBox(POOL.x0, POOL.x1, 0, POOL.z0);
  addGroundBox(POOL.x0, POOL.x1, POOL.z1, size);
  // Ground visual: four planes around the pool hole.
  const groundPlane = (x0: number, x1: number, z0: number, z1: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    // World-aligned UVs so the grid is continuous across pieces.
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
    const m = new THREE.Mesh(g, matGround);
    m.receiveShadow = true;
    scene.add(m);
  };
  tex.repeat.set(1, 1);
  groundPlane(0, POOL.x0, 0, size);
  groundPlane(POOL.x1, size, 0, size);
  groundPlane(POOL.x0, POOL.x1, 0, POOL.z0);
  groundPlane(POOL.x0, POOL.x1, POOL.z1, size);

  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: THREE.Material, surface: SurfaceType = 'concrete', rotX = 0, rotY = 0, rotZ = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(cx, cy, cz);
    m.rotation.set(rotX, rotY, rotZ, 'YXZ');
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    m.updateMatrixWorld();
    const q = m.quaternion;
    physics.addStatic(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(cx, cy, cz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      { kind: 'building', surface },
    );
    return m;
  };

  // ── pool basin (floor + beach ramp on the east side + tiled walls) ──
  const pw = POOL.x1 - POOL.x0, pd = POOL.z1 - POOL.z0;
  const depth = -POOL.floor;
  const pcx = (POOL.x0 + POOL.x1) / 2, pcz = (POOL.z0 + POOL.z1) / 2;
  const tile = new THREE.MeshStandardMaterial({ color: 0x8fb8c8, roughness: 0.6 });
  box(pcx, POOL.floor - 0.25, pcz, pw, 0.5, pd, tile, 'tile');
  const beachLen = 9;
  const ang = Math.atan2(depth, beachLen);
  const rampLen = Math.hypot(depth, beachLen) + 0.4;
  // Ramp rising toward +X: rotate about Z by +ang (YXZ order: Z applied last is fine for a pure Z rotation).
  box(POOL.x1 - beachLen / 2, POOL.floor / 2 - 0.13, pcz, rampLen, 0.3, pd, tile, 'tile', 0, 0, ang);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7aa9bb, roughness: 0.6, side: THREE.BackSide });
  const basin = new THREE.Mesh(new THREE.BoxGeometry(pw, depth, pd), wallMat);
  basin.position.set(pcx, -depth / 2, pcz);
  basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2a6f8f, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  water.position.set(pcx, POOL.surface, pcz);
  water.renderOrder = 2;
  scene.add(water);

  // ── vault / climb boxes ──
  const bx = SPOTS.boxes.x, bz = SPOTS.boxes.z;
  BOX_HEIGHTS.forEach((h, i) => {
    box(bx + i * 6, h / 2, bz - 4, 3, h, 0.6, i < 3 ? matWood : matConcrete, i < 3 ? 'wood' : 'concrete');
  });
  // Thick 1.1 m platform (climb onto) and a thin 1.0 m fence.
  box(bx + 36, 0.55, bz - 5.2, 3, 1.1, 3, matConcrete);
  box(bx + 42, 0.5, bz - 3.75, 3, 1.0, 0.12, matWood, 'wood');
  // ── ramps ──
  const rx = SPOTS.ramps.x, rz = SPOTS.ramps.z;
  [20, 30, 40, 45, 55].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const len = 8;
    const h = Math.sin(a) * len;
    box(rx + i * 6, h / 2 - 0.2 * Math.cos(a), rz - Math.cos(a) * len / 2, 4, 0.4, len, i % 2 ? matConcrete : matWood, 'concrete', a, 0);
  });
  // ── stairs (0.18 m rise, 0.3 m run, 10 steps) + landing; steep stairs (0.25 rise) ──
  const sx = SPOTS.stairs.x, sz = SPOTS.stairs.z;
  for (let i = 0; i < 10; i++) {
    const h = (i + 1) * 0.18;
    box(sx, h / 2, sz - i * 0.3, 2.5, h, 0.3, matConcrete);
  }
  box(sx, 0.9, sz - 3 - 1.5, 2.5, 1.8, 3, matConcrete);
  for (let i = 0; i < 7; i++) {
    const h = (i + 1) * 0.25;
    box(sx - 4, h / 2, sz - i * 0.28, 2.0, h, 0.28, matWood, 'wood');
  }
  // ── tunnel: crouch section (ceiling 1.5 m) then prone section (0.85 m) ──
  const tx = SPOTS.tunnel.x, tz = SPOTS.tunnel.z;
  box(tx - 1.6, 1.0, tz - 6, 0.4, 2.0, 12, matMetal, 'metal');
  box(tx + 1.6, 1.0, tz - 6, 0.4, 2.0, 12, matMetal, 'metal');
  box(tx, 1.5 + 0.15, tz - 3, 3.6, 0.3, 6, matMetal, 'metal');
  box(tx, 0.85 + 0.15, tz - 9, 3.6, 0.3, 6, matRed, 'metal');
  // ── tower (40 m) + fall-test platforms at 5/10/15/20 m ──
  const twx = SPOTS.tower.x, twz = SPOTS.tower.z;
  box(twx, 20, twz, 4, 40, 4, matConcrete);
  [5, 10, 15, 20].forEach((h, i) => box(twx + 8 + i * 6, h / 2, twz, 3, h, 3, matConcrete));
  // ── speed track markers (every 10 m) ──
  for (let i = 0; i <= 10; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 3), matRed);
    m.position.set(SPOTS.speedTrack.x + i * 10, 0.01, SPOTS.speedTrack.z);
    scene.add(m);
  }

  // ── lighting ──
  const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -40;
  sc.right = sc.top = 40;
  sc.near = 1;
  sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xc4dcff, 0x56603e, 1.1));
  scene.background = new THREE.Color(0x9fc6ea);
  scene.fog = new THREE.Fog(0x9fc6ea, 250, 1500);
  const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
  ctx.engine.addSystem({
    name: 'arenaSun',
    priority: 79,
    update: () => {
      const c = ctx.camera.position;
      sun.target.position.set(c.x, 0, c.z);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 150);
    },
  });

  const locations: MapLocation[] = [{ name: 'Arena', kind: 'town', x: ARENA.x, z: ARENA.z, radius: 80, lootTier: 0.5 }];
  const world: IWorld = {
    size,
    seaLevel: -10,
    locations,
    lots: [],
    props: [],
    roads: [],
    vehicleSpawns: [],
    getHeight: (x, z) => (x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1 ? POOL.floor : 0),
    getNormal: (_x, _z, out) => out.set(0, 1, 0),
    getSurface: () => 'grass',
    getWaterHeight: (x, z) => (x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1 ? POOL.surface : null),
    isLand: (x, z) => x > 0 && z > 0 && x < size && z < size,
    getGroundCover: () => 0.3,
    getTreeDensity: () => 0,
    isReserved: () => false,
    nearestLocation: () => locations[0],
    getMapImage: () => null,
  };
  const env: IEnvironment = {
    timeOfDay: 13,
    weather: 'clear',
    sunDirection: sunDir,
    visibility: 1,
    fogDistance: 1500,
    setTimeOfDay(h) {
      this.timeOfDay = h;
    },
    setWeather(w) {
      this.weather = w;
    },
  };
  ctx.world = world;
  ctx.environment = env;
}
