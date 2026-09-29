import * as THREE from 'three';
import { Builder, Geo } from './Builder';
import { MaterialLib } from './Materials';
import { COUNTER, DOOR, ROOM } from './Layout';
import * as S from '../render/Surfaces';
import { canvasTexture, FONT_DISPLAY } from '../render/CanvasTex';

export interface Customization {
  wallColor: number;
  floorA: number;
  floorB: number;
  boothColor: number;
  counterColor: number;
  accentColor: number;
}

export const DEFAULT_CUSTOM: Customization = {
  wallColor: 0xf3e3c4,
  floorA: 0xf2ede4,
  floorB: 0x202027,
  boothColor: 0xc4262e,
  counterColor: 0xf1e6cf,
  accentColor: 0x2bb3a5,
};

export interface StructureRefs {
  doorLeft: THREE.Group;
  doorRight: THREE.Group;
  bell: THREE.Group;
  diningFloor: THREE.Mesh;
  upperWalls: THREE.Mesh[];
  wainscot: THREE.Mesh[];
  counterFront: THREE.Mesh[];
  counterTop: THREE.Mesh[];
  windowGlass: THREE.Mesh[];
  ceilingLamps: THREE.Vector3[];
  kitchenLamps: THREE.Vector3[];
}

const H = ROOM.height;
const T = ROOM.wall;

/**
 * Builds a wall running along X (at fixed z) or along Z (at fixed x) with
 * rectangular openings. Returns the created meshes. `inner` is the side the
 * textured skin faces (+1 / -1 along the wall normal).
 */
function wallSegments(
  from: number,
  to: number,
  openings: { a: number; b: number; bottom: number; top: number }[],
): { a: number; b: number; y0: number; y1: number }[] {
  const out: { a: number; b: number; y0: number; y1: number }[] = [];
  const ops = [...openings].sort((p, q) => p.a - q.a);
  let cursor = from;
  for (const o of ops) {
    if (o.a > cursor) out.push({ a: cursor, b: o.a, y0: 0, y1: H });
    if (o.bottom > 0) out.push({ a: o.a, b: o.b, y0: 0, y1: o.bottom });
    if (o.top < H) out.push({ a: o.a, b: o.b, y0: o.top, y1: H });
    cursor = o.b;
  }
  if (cursor < to) out.push({ a: cursor, b: to, y0: 0, y1: H });
  return out;
}

export function buildStructure(root: THREE.Object3D, mats: MaterialLib, custom: Customization): StructureRefs {
  const b = new Builder(root);
  const refs: StructureRefs = {
    doorLeft: new THREE.Group(),
    doorRight: new THREE.Group(),
    bell: new THREE.Group(),
    diningFloor: null!,
    upperWalls: [],
    wainscot: [],
    counterFront: [],
    counterTop: [],
    windowGlass: [],
    ceilingLamps: [],
    kitchenLamps: [],
  };

  const shell = mats.std(0xd9cbb5, 0.9);
  const plasterUp = mats.baker.material(S.plaster(custom.wallColor), {});
  plasterUp.name = 'upperWall';
  const plasterKitchen = mats.get('plasterKitchen', () => mats.baker.material(S.plaster(0xf2efe8, 'plasterK'), {}));
  const beadMat = mats.baker.material(S.beadboard(custom.accentColor), {});
  beadMat.name = 'wainscot';
  const trimWood = mats.std(0x3b2418, 0.5);

  // ---------------------------------------------------------------- floors
  const checker = mats.baker.material(S.checkerTile(custom.floorA, custom.floorB), {});
  checker.name = 'diningFloor';
  const diningDepth = ROOM.maxZ - COUNTER.z;
  refs.diningFloor = b.tplane(14, diningDepth, 0.7, checker, 0, 0, COUNTER.z + diningDepth / 2, { rx: -Math.PI / 2 });
  const kitchenDepth = COUNTER.z - ROOM.minZ;
  b.tplane(14, kitchenDepth, 0.75, mats.kitchenFloor, 0, 0.001, ROOM.minZ + kitchenDepth / 2, { rx: -Math.PI / 2 });
  // floor drain + anti-fatigue mats in the kitchen
  b.cyl(0.09, 0.09, 0.004, mats.steelDark, -1.0, 0.003, -3.6, { seg: 20, cast: false });
  for (let i = 0; i < 5; i++) b.box(0.012, 0.005, 0.12, mats.blackPlastic, -1.0 + (i - 2) * 0.03, 0.005, -3.6, { cast: false });
  const matGeo = new THREE.BoxGeometry(1, 0.015, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x19191b, roughness: 0.95 });
  const holes = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      ctx.beginPath();
      ctx.ellipse(16 + x * 32, 16 + y * 32, 9, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: true, srgb: false });
  holes.repeat.set(10, 3);
  mat.alphaMap = holes;
  mat.alphaTest = 0.5;
  const kmat = new THREE.Mesh(matGeo, mat);
  kmat.scale.set(4.2, 1, 1.2);
  kmat.position.set(-1.9, 0.008, -4.7);
  kmat.receiveShadow = true;
  kmat.userData.static = true;
  root.add(kmat);

  // ---------------------------------------------------------------- walls (shell)
  // Back wall
  b.box(ROOM.maxX - ROOM.minX + 2 * T, H, T, shell, 0, H / 2, ROOM.minZ - T / 2);
  // Left wall
  b.box(T, H, ROOM.maxZ - ROOM.minZ, shell, ROOM.minX - T / 2, H / 2, (ROOM.maxZ + ROOM.minZ) / 2);

  // Right wall with back door + dining windows
  const rightOpenings = [
    { a: -4.55, b: -3.45, bottom: 0, top: 2.2 }, // back door
    { a: 0.35, b: 5.55, bottom: 1.0, top: 2.55 }, // windows
  ];
  for (const s of wallSegments(ROOM.minZ, ROOM.maxZ, rightOpenings)) {
    b.box(T, s.y1 - s.y0, s.b - s.a, shell, ROOM.maxX + T / 2, (s.y0 + s.y1) / 2, (s.a + s.b) / 2);
  }
  // Front wall with door + two windows
  const frontOpenings = [
    { a: -6.4, b: -0.45, bottom: 0.95, top: 2.55 },
    { a: DOOR.x - DOOR.width / 2, b: DOOR.x + DOOR.width / 2, bottom: 0, top: DOOR.height },
    { a: 2.85, b: 6.4, bottom: 0.95, top: 2.55 },
  ];
  for (const s of wallSegments(ROOM.minX - T, ROOM.maxX + T, frontOpenings)) {
    b.box(s.b - s.a, s.y1 - s.y0, T, shell, (s.a + s.b) / 2, (s.y0 + s.y1) / 2, ROOM.maxZ + T / 2);
  }

  // ---------------------------------------------------------------- inner skins
  const eps = 0.004;
  // Kitchen back wall: subway tile backsplash + plaster above
  b.tplane(14, 2.2, 0.6, mats.subway, 0, 1.1, ROOM.minZ + eps, { name: 'backsplash' });
  b.tplane(14, H - 2.2, 1.5, plasterKitchen, 0, 2.2 + (H - 2.2) / 2, ROOM.minZ + eps);
  // greasy tiles right behind the grill
  b.tplane(1.9, 1.25, 0.6, mats.subwayGreasy, -3.0, 0.95 + 0.62, ROOM.minZ + eps * 2);
  // Kitchen left wall
  b.tplane(kitchenDepth, 2.2, 0.6, mats.subway, ROOM.minX + eps, 1.1, ROOM.minZ + kitchenDepth / 2, { ry: Math.PI / 2 });
  b.tplane(kitchenDepth, H - 2.2, 1.5, plasterKitchen, ROOM.minX + eps, 2.2 + (H - 2.2) / 2, ROOM.minZ + kitchenDepth / 2, { ry: Math.PI / 2 });
  // Dining left wall: exposed brick
  b.tplane(diningDepth, H, 0.9, mats.brick, ROOM.minX + eps, H / 2, COUNTER.z + diningDepth / 2, { ry: Math.PI / 2 });
  // Kitchen right wall (with door opening)
  for (const s of wallSegments(ROOM.minZ, COUNTER.z, [rightOpenings[0]])) {
    const w = s.b - s.a;
    const cz = (s.a + s.b) / 2;
    const y0 = s.y0;
    const y1 = s.y1;
    // tiles below 2.2, plaster above
    if (y0 < 2.2) {
      const top = Math.min(2.2, y1);
      b.tplane(w, top - y0, 0.6, mats.subway, ROOM.maxX - eps, (y0 + top) / 2, cz, { ry: -Math.PI / 2 });
    }
    if (y1 > 2.2) {
      const bot = Math.max(2.2, y0);
      b.tplane(w, y1 - bot, 1.5, plasterKitchen, ROOM.maxX - eps, (bot + y1) / 2, cz, { ry: -Math.PI / 2 });
    }
  }
  // Dining right wall
  for (const s of wallSegments(COUNTER.z, ROOM.maxZ, [rightOpenings[1]])) {
    const w = s.b - s.a;
    const cz = (s.a + s.b) / 2;
    if (s.y0 < 1.0) {
      const top = Math.min(1.0, s.y1);
      refs.wainscot.push(b.tplane(w, top - s.y0, [1.0, 1.0], beadMat, ROOM.maxX - eps, (s.y0 + top) / 2, cz, { ry: -Math.PI / 2 }));
    }
    if (s.y1 > 1.0) {
      const bot = Math.max(1.0, s.y0);
      refs.upperWalls.push(b.tplane(w, s.y1 - bot, 1.5, plasterUp, ROOM.maxX - eps, (bot + s.y1) / 2, cz, { ry: -Math.PI / 2 }));
    }
  }
  // Dining front wall inner skin
  for (const s of wallSegments(ROOM.minX, ROOM.maxX, frontOpenings)) {
    const w = s.b - s.a;
    const cx = (s.a + s.b) / 2;
    if (s.y0 < 1.0) {
      const top = Math.min(1.0, s.y1);
      refs.wainscot.push(b.tplane(w, top - s.y0, [1.0, 1.0], beadMat, cx, (s.y0 + top) / 2, ROOM.maxZ - eps, { ry: Math.PI }));
    }
    if (s.y1 > 1.0) {
      const bot = Math.max(1.0, s.y0);
      refs.upperWalls.push(b.tplane(w, s.y1 - bot, 1.5, plasterUp, cx, (bot + s.y1) / 2, ROOM.maxZ - eps, { ry: Math.PI }));
    }
  }
  // chrome chair rail + baseboards in the dining room
  const railY = 1.0;
  b.box(0.03, 0.035, diningDepth - 0.1, mats.chrome, ROOM.maxX - 0.02, railY, COUNTER.z + diningDepth / 2, { cast: false });
  b.box(ROOM.maxX - ROOM.minX, 0.035, 0.03, mats.chrome, 0, railY, ROOM.maxZ - 0.02, { cast: false });
  b.box(0.02, 0.1, diningDepth, trimWood, ROOM.maxX - 0.01, 0.05, COUNTER.z + diningDepth / 2, { cast: false });
  b.box(ROOM.maxX - ROOM.minX, 0.1, 0.02, trimWood, 0, 0.05, ROOM.maxZ - 0.01, { cast: false });
  b.box(0.02, 0.1, diningDepth, trimWood, ROOM.minX + 0.01, 0.05, COUNTER.z + diningDepth / 2, { cast: false });
  // cove base in the kitchen
  b.box(14, 0.12, 0.02, mats.std(0x2b2b2e, 0.6), 0, 0.06, ROOM.minZ + 0.01, { cast: false });

  // ---------------------------------------------------------------- ceiling + roof
  const tin = mats.get('tin', () => mats.baker.material(S.tinCeiling, { envMapIntensity: 0.6 }));
  b.tplane(14, diningDepth, 0.6, tin, 0, H, COUNTER.z + diningDepth / 2, { rx: Math.PI / 2, receive: true });
  b.tplane(14, kitchenDepth, 1.5, plasterKitchen, 0, H, ROOM.minZ + kitchenDepth / 2, { rx: Math.PI / 2 });
  // Roof slab (casts the sun shadow over the whole interior)
  b.box(ROOM.maxX - ROOM.minX + 1.2, 0.35, ROOM.maxZ - ROOM.minZ + 1.0, mats.std(0x5a5550, 0.9), 0, H + 0.18, (ROOM.maxZ + ROOM.minZ) / 2 - 0.2);
  // crown moulding in dining
  b.box(ROOM.maxX - ROOM.minX, 0.08, 0.06, mats.std(0xf5ecdc, 0.6), 0, H - 0.04, ROOM.maxZ - 0.03, { cast: false });
  b.box(0.06, 0.08, diningDepth, mats.std(0xf5ecdc, 0.6), ROOM.maxX - 0.03, H - 0.04, COUNTER.z + diningDepth / 2, { cast: false });

  // ---------------------------------------------------------------- windows
  const frameMat = mats.std(0x8c1e22, 0.45);
  const addWindow = (cx: number, cz: number, w: number, bottom: number, top: number, ry: number, panes: number) => {
    const g = b.group(cx, 0, cz, ry);
    const gb = b.at(g);
    const h = top - bottom;
    const glass = gb.box(w, h, 0.01, mats.glass, 0, bottom + h / 2, 0, { cast: false, receive: false, dynamic: true });
    glass.renderOrder = 5;
    refs.windowGlass.push(glass);
    // frame
    gb.box(w + 0.1, 0.07, 0.14, frameMat, 0, bottom, 0);
    gb.box(w + 0.1, 0.07, 0.14, frameMat, 0, top, 0);
    gb.box(0.07, h, 0.14, frameMat, -w / 2, bottom + h / 2, 0);
    gb.box(0.07, h, 0.14, frameMat, w / 2, bottom + h / 2, 0);
    for (let i = 1; i < panes; i++) gb.box(0.05, h, 0.1, frameMat, -w / 2 + (w * i) / panes, bottom + h / 2, 0);
    // interior sill
    gb.box(w + 0.16, 0.035, 0.26, mats.std(0xefe5d2, 0.5), 0, bottom - 0.02, -0.12);
    return g;
  };
  addWindow(-3.425, ROOM.maxZ + 0.02, 5.95, 0.95, 2.55, 0, 3);
  addWindow(4.625, ROOM.maxZ + 0.02, 3.55, 0.95, 2.55, 0, 2);
  addWindow(ROOM.maxX + 0.02, 2.95, 5.2, 1.0, 2.55, Math.PI / 2, 3);

  // Painted window lettering (seen mirrored from inside)
  const letter = canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 118px ${FONT_DISPLAY}`;
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#7a1414';
    ctx.strokeText('Sizzle & Stack', w / 2, h / 2 - 20);
    ctx.fillStyle = '#ffd35a';
    ctx.fillText('Sizzle & Stack', w / 2, h / 2 - 20);
    ctx.font = `600 44px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#fff3d6';
    ctx.fillText('BURGERS  •  SHAKES  •  SMILES', w / 2, h / 2 + 72);
  });
  const letterMat = new THREE.MeshStandardMaterial({ map: letter, transparent: true, roughness: 0.4, depthWrite: false, side: THREE.DoubleSide });
  const lettering = new THREE.Mesh(Geo.plane(2.6, 0.65), letterMat);
  lettering.position.set(-3.425, 1.95, ROOM.maxZ + 0.035); // reads correctly from the street, mirrored inside
  lettering.renderOrder = 6;
  root.add(lettering);

  // Café curtains on the front windows
  const curtainTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fbf6ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(196,38,46,0.85)';
    const s = 16;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) if (((x + y) / s) % 2 === 0) ctx.fillRect(x, y, s, s);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#c4262e';
    for (let y = 0; y < h; y += s) ctx.fillRect(0, y, w, s / 2);
  }, { repeat: true });
  curtainTex.repeat.set(3, 1);
  const curtainMat = new THREE.MeshStandardMaterial({ map: curtainTex, roughness: 0.9, side: THREE.DoubleSide });
  const curtainGeo = new THREE.PlaneGeometry(1, 0.55, 40, 1);
  {
    const p = curtainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 60) * 0.018);
    curtainGeo.computeVertexNormals();
  }
  for (const [cx, w] of [[-3.425, 5.9], [4.625, 3.5]] as const) {
    const c = new THREE.Mesh(curtainGeo, curtainMat);
    c.scale.set(w, 1, 1);
    c.position.set(cx, 1.28, ROOM.maxZ - 0.08);
    c.castShadow = true;
    c.receiveShadow = true;
    c.userData.static = true;
    root.add(c);
    b.cyl(0.012, 0.012, w, mats.chrome, cx, 1.57, ROOM.maxZ - 0.08, { rz: Math.PI / 2, seg: 8 });
  }

  // ---------------------------------------------------------------- front door
  const doorFrame = mats.std(0x9a9ea3, 0.3, 1);
  const dx0 = DOOR.x - DOOR.width / 2;
  const dx1 = DOOR.x + DOOR.width / 2;
  b.box(0.08, DOOR.height, 0.2, doorFrame, dx0 - 0.04, DOOR.height / 2, ROOM.maxZ + 0.02);
  b.box(0.08, DOOR.height, 0.2, doorFrame, dx1 + 0.04, DOOR.height / 2, ROOM.maxZ + 0.02);
  b.box(DOOR.width + 0.16, 0.1, 0.2, doorFrame, DOOR.x, DOOR.height + 0.05, ROOM.maxZ + 0.02);
  // transom glass above door
  const makeLeaf = (pivot: THREE.Group, dir: 1 | -1) => {
    const w = DOOR.width / 2 - 0.01;
    const gb = b.at(pivot);
    const hx = (dir * w) / 2;
    gb.box(w, 0.1, 0.05, doorFrame, hx, 0.05, 0, { dynamic: true });
    gb.box(w, 0.1, 0.05, doorFrame, hx, DOOR.height - 0.06, 0, { dynamic: true });
    gb.box(0.06, DOOR.height - 0.02, 0.05, doorFrame, dir * 0.03, DOOR.height / 2, 0, { dynamic: true });
    gb.box(0.06, DOOR.height - 0.02, 0.05, doorFrame, dir * (w - 0.03), DOOR.height / 2, 0, { dynamic: true });
    gb.box(w - 0.1, 0.2, 0.05, doorFrame, hx, 0.2, 0, { dynamic: true });
    const gl = gb.box(w - 0.1, DOOR.height - 0.4, 0.012, mats.glass, hx, DOOR.height / 2 + 0.08, 0, {
      cast: false,
      receive: false,
      dynamic: true,
    });
    gl.renderOrder = 5;
    // push bars
    gb.cyl(0.018, 0.018, w * 0.7, mats.chrome, hx, 1.05, -0.07, { rz: Math.PI / 2, dynamic: true, seg: 12 });
    gb.cyl(0.018, 0.018, w * 0.7, mats.chrome, hx, 1.05, 0.07, { rz: Math.PI / 2, dynamic: true, seg: 12 });
    for (const s of [-1, 1]) {
      gb.cyl(0.012, 0.012, 0.07, mats.chrome, hx + s * w * 0.3, 1.05, -0.04, { rx: Math.PI / 2, dynamic: true, seg: 8 });
      gb.cyl(0.012, 0.012, 0.07, mats.chrome, hx + s * w * 0.3, 1.05, 0.04, { rx: Math.PI / 2, dynamic: true, seg: 8 });
    }
  };
  refs.doorLeft.position.set(dx0, 0, ROOM.maxZ + 0.02);
  refs.doorRight.position.set(dx1, 0, ROOM.maxZ + 0.02);
  refs.doorLeft.userData.dynamic = true;
  refs.doorRight.userData.dynamic = true;
  root.add(refs.doorLeft, refs.doorRight);
  makeLeaf(refs.doorLeft, 1);
  makeLeaf(refs.doorRight, -1);
  // OPEN sign hanging on the right leaf
  const openTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fff8e8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c4262e';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#c4262e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 64px ${FONT_DISPLAY}`;
    ctx.fillText('OPEN', w / 2, h / 2 + 4);
  });
  const sign = new THREE.Mesh(Geo.plane(0.34, 0.17), new THREE.MeshStandardMaterial({ map: openTex, roughness: 0.6, side: THREE.DoubleSide }));
  sign.position.set(-DOOR.width / 4, 1.55, 0.03);
  sign.rotation.y = Math.PI;
  refs.doorRight.add(sign);
  // brass bell above the door (swings when the door opens)
  refs.bell.position.set(DOOR.x, DOOR.height - 0.02, ROOM.maxZ - 0.12);
  refs.bell.userData.dynamic = true;
  root.add(refs.bell);
  const brass = mats.std(0xc89a3c, 0.25, 1);
  const bb = b.at(refs.bell);
  bb.cyl(0.004, 0.004, 0.08, brass, 0, -0.04, 0, { dynamic: true, seg: 6 });
  bb.mesh(Geo.lathe('bell', [[0.0, 0.0], [0.03, 0.0], [0.028, 0.01], [0.022, 0.03], [0.012, 0.05], [0.0, 0.055]], 20), brass, 0, -0.14, 0, {
    dynamic: true,
  });
  bb.sphere(0.008, brass, 0, -0.145, 0, { dynamic: true });
  b.box(0.12, 0.03, 0.05, brass, DOOR.x, DOOR.height - 0.01, ROOM.maxZ - 0.1);

  // Door mat
  const matTex = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c4262e';
    ctx.fillRect(18, 18, w - 36, h - 36);
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(30, 30, w - 60, h - 60);
    ctx.fillStyle = '#f2d27a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 76px ${FONT_DISPLAY}`;
    ctx.fillText('WELCOME', w / 2, h / 2 + 6);
  });
  b.mesh(Geo.box(1.4, 0.012, 0.7), new THREE.MeshStandardMaterial({ map: matTex, roughness: 1 }), DOOR.x, 0.006, ROOM.maxZ - 0.55, { cast: false });

  // ---------------------------------------------------------------- back door (kitchen)
  const bd = mats.std(0x6f7e86, 0.5, 0.4);
  b.box(0.06, 2.18, 1.08, bd, ROOM.maxX - 0.02, 1.09, -4.0);
  b.cyl(0.015, 0.015, 0.5, mats.chrome, ROOM.maxX - 0.08, 1.05, -4.0, { rz: 0, rx: Math.PI / 2, seg: 10 });
  const exitTex = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#0e3b1f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5dff8a';
    ctx.font = `800 64px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', w / 2, h / 2 + 4);
  });
  b.mesh(Geo.box(0.36, 0.13, 0.05), new THREE.MeshStandardMaterial({ map: exitTex, emissive: 0xffffff, emissiveMap: exitTex, emissiveIntensity: 1.6 }), ROOM.maxX - 0.05, 2.38, -4.0, {
    ry: -Math.PI / 2,
    cast: false,
  });

  // ---------------------------------------------------------------- service counter
  buildCounter(b, mats, custom, refs);

  // ---------------------------------------------------------------- ceiling lamp anchors
  refs.ceilingLamps.push(new THREE.Vector3(-3.2, H, 2.2), new THREE.Vector3(0.4, H, 2.4), new THREE.Vector3(4.2, H, 2.6),
    new THREE.Vector3(-3.2, H, 4.8), new THREE.Vector3(4.2, H, 4.8), new THREE.Vector3(0.4, H, 4.9));
  refs.kitchenLamps.push(new THREE.Vector3(-2.0, H, -3.6), new THREE.Vector3(1.8, H, -3.6), new THREE.Vector3(-5.2, H, -3.6));
  return refs;
}

function buildCounter(b: Builder, mats: MaterialLib, custom: Customization, refs: StructureRefs) {
  const z = COUNTER.z;
  const d = COUNTER.depth;
  const h = COUNTER.height;
  const x0 = COUNTER.minX;
  const x1 = COUNTER.maxX;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const front = mats.vinyl(custom.boothColor, 6);
  front.name = 'counterFront';
  const top = mats.laminate(custom.counterColor);
  top.name = 'counterTop';
  const body = mats.std(0xe8e2d6, 0.7);
  // body
  b.box(w, h - 0.06, d - 0.04, body, cx, (h - 0.06) / 2, z);
  // quilted front panel (customer side)
  refs.counterFront.push(b.tplane(w, h - 0.22, [0.6, 0.9], front, cx, 0.12 + (h - 0.22) / 2, z + d / 2 - 0.01, { cast: false }));
  // side of counter at the gap end
  b.tplane(d - 0.04, h - 0.22, [0.6, 0.9], front, x1 + 0.001, 0.12 + (h - 0.22) / 2, z, { ry: Math.PI / 2, cast: false });
  // chrome kick plate + trims
  b.box(w, 0.12, 0.02, mats.chrome, cx, 0.06, z + d / 2 - 0.005, { cast: false });
  b.box(w, 0.03, 0.03, mats.chrome, cx, h - 0.2, z + d / 2);
  b.box(w, 0.02, 0.025, mats.chrome, cx, 0.13, z + d / 2);
  // counter top with rounded chrome nosing
  const topMesh = b.tbox(w + 0.06, 0.045, d + 0.08, 0.5, top, cx, h - 0.0225, z + 0.02);
  refs.counterTop.push(topMesh);
  b.cyl(0.028, 0.028, w + 0.06, mats.chrome, cx, h - 0.024, z + d / 2 + 0.06, { rz: Math.PI / 2, seg: 16 });
  // kitchen side: open steel shelving under the counter
  b.box(w, 0.02, 0.4, mats.steel, cx, 0.35, z - d / 2 + 0.18);
  b.box(w, 0.02, 0.4, mats.steel, cx, 0.7, z - d / 2 + 0.18);

  // Menu bulkhead over the counter
  const bw = 10.2;
  const bcx = -1.2;
  b.box(bw, 0.8, 0.5, mats.std(0x2a1d18, 0.6), bcx, ROOM.height - 0.4, z + 0.05);
  b.box(bw, 0.04, 0.52, mats.chrome, bcx, ROOM.height - 0.8, z + 0.05, { cast: false });

  // Partition wall to the right of the pass-through gap
  const px0 = COUNTER.gapMaxX;
  const px1 = ROOM.maxX;
  b.box(px1 - px0, ROOM.height, 0.2, mats.std(0xd9cbb5, 0.9), (px0 + px1) / 2, ROOM.height / 2, z);
  const plasterUp = refs.upperWalls.length ? (refs.upperWalls[0].material as THREE.Material) : mats.std(0xf3e3c4, 0.9);
  refs.upperWalls.push(b.tplane(px1 - px0, ROOM.height - 1.0, 1.5, plasterUp, (px0 + px1) / 2, 1.0 + (ROOM.height - 1.0) / 2, z + 0.101));
  const wains = refs.wainscot.length ? (refs.wainscot[0].material as THREE.Material) : mats.std(0x2bb3a5, 0.5);
  refs.wainscot.push(b.tplane(px1 - px0, 1.0, [1.0, 1.0], wains, (px0 + px1) / 2, 0.5, z + 0.101));
  b.box(px1 - px0, 0.035, 0.03, mats.chrome, (px0 + px1) / 2, 1.0, z + 0.115, { cast: false });
  // kitchen side of partition
  b.tplane(px1 - px0, 2.2, 0.6, mats.subway, (px0 + px1) / 2, 1.1, z - 0.101, { ry: Math.PI });
  // Half swinging door in the gap
  const sd = mats.std(0x8a5a3a, 0.5);
  b.box(COUNTER.gapMaxX - COUNTER.gapMinX - 0.04, 0.9, 0.04, sd, (COUNTER.gapMinX + COUNTER.gapMaxX) / 2, 0.55, z);
  b.box(COUNTER.gapMaxX - COUNTER.gapMinX - 0.04, 0.04, 0.05, mats.chrome, (COUNTER.gapMinX + COUNTER.gapMaxX) / 2, 1.0, z);
}
