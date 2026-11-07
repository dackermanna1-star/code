// =============================================================================
// Landside: curb roads, car parks (asphalt + painted bays) with instanced cars,
// cars on the multi-storey deck, buses / taxis at the curb.
// =============================================================================
import * as THREE from 'three';
import { GeoBuilder, PRIM, mat, mulberry, makeCanvas } from './util.js';
import { taxiwayMaterial } from './materials.js';

const CAR_COLORS = [0xe8e8e8, 0x1a1a1c, 0x8a8d90, 0x5d6166, 0x2a3a5a, 0x7a1818, 0xc9c9c4, 0x30343a, 0x1f4a3a, 0xb5a585, 0x3a5f8a, 0x9a9a9a];

function carGeometry() {
  const b = new GeoBuilder();
  b.add(PRIM.box, mat(0, 0.55, 0, 0, 0, 0, 1.78, 0.62, 4.45), 0xffffff);
  b.add(PRIM.box, mat(0, 1.1, 0.25, 0, 0, 0, 1.6, 0.52, 2.3), 0x9a9a9a);           // cabin (tinted by instance colour -> darker)
  b.add(PRIM.box, mat(0, 1.1, 0.25, 0, 0, 0, 1.62, 0.36, 2.0), 0x111418);          // glass band
  for (const [x, z] of [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]]) b.add(PRIM.cyl8, mat(x, 0.32, z, 0, 0, Math.PI / 2, 0.62, 0.22, 0.62), 0x141414);
  return b.build();
}

function bayTexture() {
  // 2.5 m x 16 m tile: two rows of 5 m bays and a 6 m aisle
  const [c, ctx] = makeCanvas(64, 512);
  ctx.clearRect(0, 0, 64, 512);
  ctx.fillStyle = 'rgba(235,235,230,0.95)';
  const pxm = 512 / 16;
  ctx.fillRect(0, 0, 3, 5 * pxm);
  ctx.fillRect(0, 11 * pxm, 3, 5 * pxm);
  ctx.fillRect(0, 5 * pxm - 2, 64, 3);
  ctx.fillRect(0, 11 * pxm - 1, 64, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildLandside(def, ctx, info, detail = 1) {
  const group = new THREE.Group();
  group.name = 'landside';
  const rnd = mulberry(def.seed + 303);
  // asphalt: roads + car parks share the taxiway asphalt material
  const P = [], N = [], U = [], I = [];
  const rect = (x0, x1, z0, z1, y = 0.015) => {
    const k = P.length / 3;
    P.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    U.push(x0 / 4, -z0 / 4, x1 / 4, -z0 / 4, x1 / 4, -z1 / 4, x0 / 4, -z1 / 4);
    I.push(k, k + 2, k + 1, k, k + 3, k + 2);
  };
  for (const [x0, x1, z0, z1] of info.roads) rect(x0, x1, Math.min(z0, z1), Math.max(z0, z1));
  for (const [x0, x1, za, zb] of info.carparks) rect(x0, x1, Math.min(za, zb), Math.max(za, zb));
  // connecting access roads (north-south) at both ends of the terminal
  const T = def.terminal;
  for (const x of [T.xMin - 30, T.xMax + 30]) rect(x - 6, x + 6, -900, T.zMin + 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const asphalt = new THREE.Mesh(g, taxiwayMaterial(ctx));
  asphalt.receiveShadow = true;
  group.add(asphalt);
  // painted bays (transparent overlay)
  const tex = bayTexture();
  const bp = [], bu = [], bi = [];
  for (const [x0, x1, za, zb] of info.carparks) {
    const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
    const k = bp.length / 3, y = 0.03;
    bp.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    bu.push(x0 / 2.5, z0 / 16, x1 / 2.5, z0 / 16, x1 / 2.5, z1 / 16, x0 / 2.5, z1 / 16);
    bi.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(bp.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
  bg.setIndex(bi);
  const bays = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.7 }));
  bays.renderOrder = 1;
  group.add(bays);
  // cars
  const maxCars = [450, 1100, 2200, 3200][Math.max(0, Math.min(3, detail))];
  const spots = [];
  for (const [x0, x1, za, zb] of info.carparks) {
    const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
    for (let tz = Math.floor(z0 / 16) * 16; tz < z1; tz += 16) {
      for (const [rz, yaw] of [[2.5, 0], [13.5, Math.PI]]) {
        const z = tz + rz;
        if (z < z0 + 2 || z > z1 - 2) continue;
        for (let x = Math.ceil(x0 / 2.5) * 2.5 + 1.25; x < x1 - 1; x += 2.5) spots.push([x, 0.03, z, yaw + (rnd() - 0.5) * 0.06]);
      }
    }
  }
  // fuller near the terminal
  const tzc = T.zMin;
  const cars = [];
  for (const s of spots) {
    const near = Math.exp(-Math.abs(s[2] - tzc) / 220);
    if (rnd() < 0.35 + 0.5 * near) cars.push(s);
  }
  // multi-storey deck
  const dk = info.parkingDeck;
  if (dk) for (let lv = 0; lv <= dk.levels; lv++) for (let x = -52; x <= 52; x += 2.6) for (const z of [-24, -14, 14, 24]) if (rnd() < 0.7) cars.push([dk.x + x, lv * 3.2 + 0.5, dk.z + z, z > 0 ? Math.PI : 0]);
  // shuffle-trim to the budget
  while (cars.length > maxCars) cars.splice(Math.floor(rnd() * cars.length), 1);
  const im = new THREE.InstancedMesh(carGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45, envMapIntensity: 1.2 }), cars.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  cars.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s[3]);
    const sc = 0.92 + rnd() * 0.16;
    m.compose(new THREE.Vector3(s[0], s[1], s[2]), q, new THREE.Vector3(1, 0.95 + rnd() * 0.15, sc));
    im.setMatrixAt(i, m);
    im.setColorAt(i, c.setHex(CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]));
  });
  im.castShadow = false; im.receiveShadow = true;
  im.computeBoundingSphere();
  group.add(im);
  // buses / taxis at the departures curb
  const curb = new GeoBuilder();
  for (let x = T.xMin + 60; x < T.xMax - 60; x += 70 + rnd() * 40) {
    if (rnd() < 0.5) {
      curb.add(PRIM.box, mat(x, 1.7, info.roads[0][2] + 3.5, 0, Math.PI / 2, 0, 2.5, 3.0, 12), rnd() < 0.5 ? 0xd9d9d4 : 0x2d5d8a);
      curb.add(PRIM.box, mat(x, 2.2, info.roads[0][2] + 3.5, 0, Math.PI / 2, 0, 2.52, 1.0, 11.6), 0x15191d);
    } else {
      curb.add(PRIM.box, mat(x, 0.75, info.roads[0][2] + 2.5, 0, Math.PI / 2, 0, 1.8, 1.4, 4.6), 0xe0c020);
    }
  }
  if (!curb.empty) {
    const cm = new THREE.Mesh(curb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }));
    cm.castShadow = true;
    group.add(cm);
  }
  return group;
}
