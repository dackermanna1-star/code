import * as THREE from 'three';
import { Builder, Geo } from './Builder';
import { MaterialLib } from './Materials';
import { DOOR, ROOM } from './Layout';
import { canvasTexture, FONT_DISPLAY, FONT_BODY } from '../render/CanvasTex';
import { Rng } from '../core/math';
import * as S from '../render/Surfaces';

export interface ExteriorRefs {
  streetLamps: THREE.Vector3[];
  lampMats: THREE.MeshStandardMaterial[];
  windowMats: THREE.MeshStandardMaterial[];
  signMat: THREE.MeshStandardMaterial;
  signNeon: THREE.MeshBasicMaterial;
  trees: THREE.Object3D[];
  carLane: { z: number; dir: 1 | -1 }[];
  sconces: THREE.Vector3[];
}

const rng = new Rng('street');

export const STREET = {
  sidewalkZ0: ROOM.maxZ + ROOM.wall,
  curbZ: 9.6,
  roadZ1: 16.4,
  farCurbZ: 16.4,
  farZ: 19.5,
};

function buildingWindows(cols: number, rows: number, lit: number, seed: string, tint = '#ffd99a'): THREE.CanvasTexture {
  const r = new Rng(seed);
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols;
    const rh = h / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (r.next() < lit) {
          ctx.fillStyle = r.chance(0.2) ? '#9fd4ff' : tint;
          ctx.globalAlpha = r.range(0.5, 1);
          ctx.fillRect(x * cw + cw * 0.2, y * rh + rh * 0.2, cw * 0.6, rh * 0.55);
        }
      }
    ctx.globalAlpha = 1;
  });
}

function facadeTexture(base: string, cols: number, rows: number, seed: string, shop?: { name: string; color: string }): THREE.CanvasTexture {
  const r = new Rng(seed);
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // subtle brick/siding lines
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
    ctx.globalAlpha = 1;
    const cw = w / cols;
    const rh = h / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (shop && y === rows - 1) continue;
        const wx = x * cw + cw * 0.2;
        const wy = y * rh + rh * 0.2;
        ctx.fillStyle = '#e8e0d0';
        ctx.fillRect(wx - 4, wy - 4, cw * 0.6 + 8, rh * 0.55 + 8);
        ctx.fillStyle = r.chance(0.5) ? '#2c3a4a' : '#3b4b5e';
        ctx.fillRect(wx, wy, cw * 0.6, rh * 0.55);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(wx, wy, cw * 0.25, rh * 0.55);
        if (r.chance(0.3)) {
          ctx.fillStyle = r.pick(['#c96f6f', '#6fa3c9', '#e8c56f']);
          ctx.fillRect(wx, wy, cw * 0.6, rh * 0.2);
        }
      }
    if (shop) {
      const y0 = h - rh;
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, y0, w, rh);
      ctx.fillStyle = '#6e8ca8';
      ctx.fillRect(w * 0.08, y0 + rh * 0.25, w * 0.55, rh * 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(w * 0.08, y0 + rh * 0.25, w * 0.2, rh * 0.7);
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(w * 0.7, y0 + rh * 0.2, w * 0.18, rh * 0.8);
      ctx.fillStyle = shop.color;
      ctx.fillRect(0, y0 - 6, w, rh * 0.22);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(rh * 0.16)}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shop.name, w / 2, y0 - 6 + rh * 0.11);
    }
  });
}

export function buildExterior(root: THREE.Object3D, mats: MaterialLib): ExteriorRefs {
  const b = new Builder(root);
  const refs: ExteriorRefs = {
    streetLamps: [],
    lampMats: [],
    windowMats: [],
    signMat: null!,
    signNeon: null!,
    trees: [],
    carLane: [
      { z: 11.4, dir: 1 },
      { z: 14.4, dir: -1 },
    ],
    sconces: [],
  };
  const S0 = STREET.sidewalkZ0;

  // ------------------------------------------------------------ ground
  const sidewalkDepth = STREET.curbZ - S0;
  b.tplane(90, sidewalkDepth, 3.0, mats.concrete, 0, 0.12, S0 + sidewalkDepth / 2, { rx: -Math.PI / 2 });
  b.box(90, 0.14, 0.18, mats.std(0x9a958d, 0.85), 0, 0.07, STREET.curbZ, { cast: false });
  const roadDepth = STREET.roadZ1 - STREET.curbZ;
  b.tplane(90, roadDepth, 4.0, mats.asphalt, 0, 0.0, STREET.curbZ + roadDepth / 2, { rx: -Math.PI / 2 });
  // lane markings
  const paint = mats.std(0xf2d24a, 0.7);
  for (let x = -44; x < 44; x += 3) b.box(1.6, 0.005, 0.12, paint, x, 0.004, (STREET.curbZ + STREET.roadZ1) / 2, { cast: false });
  // crosswalk
  for (let i = 0; i < 8; i++) b.box(0.45, 0.005, roadDepth - 0.6, mats.std(0xf4f1ea, 0.75), -9 + i * 0.8, 0.004, STREET.curbZ + roadDepth / 2, { cast: false });
  // far sidewalk
  b.tplane(90, STREET.farZ - STREET.farCurbZ, 3.0, mats.concrete, 0, 0.12, (STREET.farZ + STREET.farCurbZ) / 2, { rx: -Math.PI / 2 });
  b.box(90, 0.14, 0.18, mats.std(0x9a958d, 0.85), 0, 0.07, STREET.farCurbZ, { cast: false });
  // big ground plane (behind everything)
  b.box(200, 0.1, 200, mats.std(0x4f5a3c, 1), 0, -0.06, 0, { cast: false });
  // ground under the building (sidewalk level mismatch hidden by walls)

  // ------------------------------------------------------------ restaurant facade
  const facadeZ = ROOM.maxZ + ROOM.wall + 0.005;
  const brickSkin = mats.brick;
  // facade skin segments around openings
  const segs = [
    { x0: ROOM.minX - ROOM.wall, x1: -6.4, y0: 0, y1: ROOM.height },
    { x0: -6.4, x1: -0.45, y0: 0, y1: 0.95 },
    { x0: -6.4, x1: -0.45, y0: 2.55, y1: ROOM.height },
    { x0: -0.45, x1: DOOR.x - DOOR.width / 2 - 0.08, y0: 0, y1: ROOM.height },
    { x0: DOOR.x - DOOR.width / 2 - 0.08, x1: DOOR.x + DOOR.width / 2 + 0.08, y0: DOOR.height + 0.1, y1: ROOM.height },
    { x0: DOOR.x + DOOR.width / 2 + 0.08, x1: 2.85, y0: 0, y1: ROOM.height },
    { x0: 2.85, x1: 6.4, y0: 0, y1: 0.95 },
    { x0: 2.85, x1: 6.4, y0: 2.55, y1: ROOM.height },
    { x0: 6.4, x1: ROOM.maxX + ROOM.wall, y0: 0, y1: ROOM.height },
  ];
  for (const s of segs) {
    const w = s.x1 - s.x0;
    const h = s.y1 - s.y0;
    b.tplane(w, h, 0.9, brickSkin, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, facadeZ, { receive: true });
  }
  // parapet + cornice
  const parapetH = 1.3;
  b.tbox(ROOM.maxX - ROOM.minX + 2 * ROOM.wall, parapetH, 0.3, 0.9, brickSkin, 0, ROOM.height + parapetH / 2, facadeZ - 0.12);
  b.box(ROOM.maxX - ROOM.minX + 0.9, 0.14, 0.45, mats.std(0xefe3cc, 0.6), 0, ROOM.height + parapetH + 0.07, facadeZ - 0.06);
  b.box(ROOM.maxX - ROOM.minX + 0.7, 0.1, 0.3, mats.std(0xefe3cc, 0.6), 0, ROOM.height + 0.05, facadeZ + 0.05);
  // side walls exterior (visible from street at an angle)
  b.tplane(ROOM.maxZ - ROOM.minZ + 1, ROOM.height + parapetH, 0.9, brickSkin, ROOM.maxX + ROOM.wall + 0.005, (ROOM.height + parapetH) / 2, (ROOM.maxZ + ROOM.minZ) / 2, { ry: Math.PI / 2 });
  b.tplane(ROOM.maxZ - ROOM.minZ + 1, ROOM.height + parapetH, 0.9, brickSkin, ROOM.minX - ROOM.wall - 0.005, (ROOM.height + parapetH) / 2, (ROOM.maxZ + ROOM.minZ) / 2, { ry: -Math.PI / 2 });

  // Main sign
  const signTex = canvasTexture(2048, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d8342c');
    g.addColorStop(1, '#a51f1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffd35a';
    ctx.lineWidth = 18;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = '#fff4c2';
      ctx.beginPath();
      ctx.arc(60 + (i * (w - 120)) / 39, 60, 10, 0, Math.PI * 2);
      ctx.arc(60 + (i * (w - 120)) / 39, h - 60, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 230px ${FONT_DISPLAY}`;
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#5a0f0c';
    ctx.strokeText('SIZZLE & STACK', w / 2, h / 2 + 10);
    ctx.fillStyle = '#fff3d0';
    ctx.fillText('SIZZLE & STACK', w / 2, h / 2 + 10);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.25, roughness: 0.45 });
  refs.signMat = signMat;
  const signW = 6.4;
  const signH = 1.6;
  b.box(signW + 0.1, signH + 0.1, 0.18, mats.std(0x2a1a14, 0.5), 0.3, ROOM.height + 0.55, facadeZ + 0.12);
  b.mesh(Geo.plane(signW, signH), signMat, 0.3, ROOM.height + 0.55, facadeZ + 0.215, { cast: false });
  // neon burger icon above sign
  const neonTex = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    const stroke = (col: string, lw: number, blur: number) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.shadowBlur = blur;
      ctx.shadowColor = col;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.45, 190, 150, 0, Math.PI, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2 - 200, h * 0.55);
      for (let i = 0; i <= 10; i++) ctx.lineTo(w / 2 - 200 + i * 40, h * 0.55 + (i % 2 ? 22 : 0));
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(w / 2 - 195, h * 0.63, 390, 50, 25);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(w / 2 - 190, h * 0.76, 380, 60, 30);
      ctx.stroke();
    };
    stroke('#ffb13b', 22, 30);
    ctx.shadowBlur = 0;
    stroke('#fff2cf', 7, 0);
  });
  const neonMat = new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(0.3, 0.3, 0.3) });
  refs.signNeon = neonMat;
  b.mesh(Geo.plane(1.4, 1.4), neonMat, 0.3, ROOM.height + parapetH + 0.75, facadeZ - 0.04, { cast: false, receive: false, dynamic: true });

  // awnings over the windows
  const awningMat = mats.awning(0xc4262e);
  const awning = (cx: number, w: number) => {
    const g = b.group(cx, 2.72, facadeZ);
    const gb = b.at(g);
    const geo = new THREE.PlaneGeometry(w, 1.0, 1, 1);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * w) / 1.2);
    const m = gb.mesh(geo, awningMat, 0, -0.18, 0.42, { rx: -0.95 });
    m.castShadow = true;
    // scalloped valance
    const val = new THREE.PlaneGeometry(w, 0.18);
    const vuv = val.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < vuv.count; i++) vuv.setX(i, (vuv.getX(i) * w) / 1.2);
    gb.mesh(val, awningMat, 0, -0.52, 0.81);
    gb.cyl(0.012, 0.012, w, mats.chrome, 0, -0.44, 0.81, { rz: Math.PI / 2, seg: 8 });
  };
  awning(-3.425, 6.2);
  awning(4.625, 3.8);
  // sconces beside the door
  for (const sx of [DOOR.x - DOOR.width / 2 - 0.35, DOOR.x + DOOR.width / 2 + 0.35]) {
    b.box(0.1, 0.18, 0.06, mats.std(0x1b1b1b, 0.4, 0.6), sx, 2.1, facadeZ + 0.03);
    const lm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc27a, emissiveIntensity: 0.2 });
    refs.lampMats.push(lm);
    b.mesh(Geo.sphere(0.07, 16, 12), lm, sx, 2.22, facadeZ + 0.1, { cast: false });
    refs.sconces.push(new THREE.Vector3(sx, 2.22, facadeZ + 0.2));
  }
  // planter boxes under windows with flowers
  const flowerCols = [0xff5d73, 0xffd23f, 0xffffff, 0xff9f1c, 0xc77dff];
  for (const [cx, w] of [[-3.425, 5.8], [4.625, 3.4]] as const) {
    b.tbox(w, 0.34, 0.36, 0.5, mats.wood(0x6b4a33, 3), cx, 0.29, facadeZ + 0.2);
    b.box(w - 0.06, 0.04, 0.3, mats.std(0x3a2618, 1), cx, 0.46, facadeZ + 0.2, { cast: false });
    const n = Math.round(w * 7);
    for (let i = 0; i < n; i++) {
      const fx = cx - w / 2 + 0.08 + (i / (n - 1)) * (w - 0.16);
      const fz = facadeZ + 0.2 + rng.range(-0.09, 0.09);
      b.cyl(0.006, 0.006, 0.14, mats.std(0x3f8f3a, 0.6), fx, 0.52, fz, { seg: 5, cast: false });
      b.sphere(rng.range(0.03, 0.045), mats.std(rng.pick(flowerCols), 0.6), fx, 0.6, fz, { sy: 0.7 });
      if (rng.chance(0.6)) b.sphere(0.05, mats.std(0x4c9a3e, 0.7), fx + 0.04, 0.5, fz, { sy: 0.6 });
    }
  }
  // sandwich board
  {
    const g = b.group(-0.9, 0.12, facadeZ + 1.5, 0.35);
    const gb = b.at(g);
    const special = canvasTexture(256, 380, (ctx, w, h) => {
      ctx.fillStyle = '#1f2a24';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#8a6a44';
      ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `700 40px ${FONT_DISPLAY}`;
      ctx.fillText("TODAY'S", w / 2, 70);
      ctx.fillStyle = '#ffd35a';
      ctx.fillText('SPECIAL', w / 2, 118);
      ctx.fillStyle = '#ff8a7a';
      ctx.font = `700 30px ${FONT_BODY}`;
      ctx.fillText('The Big', w / 2, 190);
      ctx.fillText('Sizzler', w / 2, 226);
      ctx.fillStyle = '#9fe0c9';
      ctx.font = `700 44px ${FONT_DISPLAY}`;
      ctx.fillText('$7.99', w / 2, 300);
      ctx.fillStyle = '#fff';
      ctx.font = `600 20px ${FONT_BODY}`;
      ctx.fillText('with a smile :)', w / 2, 346);
    });
    const sm = new THREE.MeshStandardMaterial({ map: special, roughness: 0.85 });
    gb.box(0.55, 0.85, 0.03, sm, 0, 0.42, 0.15, { rx: -0.18 });
    gb.box(0.55, 0.85, 0.03, sm, 0, 0.42, -0.15, { rx: 0.18, ry: Math.PI });
  }
  // bench + trash can on sidewalk
  {
    const g = b.group(-5.6, 0.12, 8.6, Math.PI);
    const gb = b.at(g);
    for (let i = 0; i < 4; i++) gb.box(1.6, 0.03, 0.09, mats.wood(0x7a5234, 3), 0, 0.45, -0.15 + i * 0.1);
    for (let i = 0; i < 3; i++) gb.box(1.6, 0.09, 0.03, mats.wood(0x7a5234, 3), 0, 0.62 + i * 0.12, -0.24, { rx: 0.1 });
    for (const sx of [-0.7, 0.7]) gb.box(0.05, 0.45, 0.4, mats.std(0x1f2a24, 0.4, 0.6), sx, 0.22, 0);
  }
  b.cyl(0.25, 0.23, 0.9, mats.std(0x22412f, 0.5, 0.4), 6.8, 0.57, 8.9, { seg: 18 });
  // fire hydrant
  {
    const hx = 9.3;
    const hz = 9.0;
    const red = mats.std(0xd1261d, 0.35, 0.3);
    b.cyl(0.11, 0.13, 0.5, red, hx, 0.37, hz, { seg: 14 });
    b.sphere(0.115, red, hx, 0.62, hz, { sy: 0.7 });
    b.cyl(0.05, 0.05, 0.32, red, hx, 0.45, hz, { rz: Math.PI / 2, seg: 10 });
    b.cyl(0.14, 0.14, 0.05, red, hx, 0.15, hz, { seg: 14 });
  }

  // ------------------------------------------------------------ street lamps
  for (const lx of [-12, 0.3 - 5.5, 7.5, 19]) {
    const lz = STREET.curbZ - 0.4;
    const pole = mats.std(0x1c2a24, 0.45, 0.6);
    b.cyl(0.07, 0.1, 4.2, pole, lx, 2.2, lz, { seg: 12 });
    b.cyl(0.14, 0.14, 0.3, pole, lx, 0.27, lz, { seg: 12 });
    b.mesh(Geo.lathe('lampHead', [[0, 0.32], [0.08, 0.32], [0.2, 0.1], [0.22, 0.0], [0.0, 0.0]], 18), pole, lx, 4.2, lz);
    const lm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 0.1 });
    refs.lampMats.push(lm);
    b.mesh(Geo.sphere(0.16, 16, 10), lm, lx, 4.18, lz, { sy: 0.5, cast: false });
    refs.streetLamps.push(new THREE.Vector3(lx, 4.0, lz));
  }

  // ------------------------------------------------------------ trees
  const leafMats = [0x4f9a3d, 0x5aa84a, 0x3f8a36].map((c) =>
    mats.get('treeLeaf' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true })),
  );
  const trunkMat = mats.std(0x6a4a33, 0.9);
  const tree = (x: number, z: number, s: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.12, z);
    g.scale.setScalar(s);
    g.userData.dynamic = true;
    root.add(g);
    const gb = b.at(g);
    gb.cyl(0.08, 0.13, 2.2, trunkMat, 0, 1.1, 0, { seg: 10, dynamic: true });
    const canopy = new THREE.Group();
    canopy.position.y = 2.2;
    g.add(canopy);
    const cb = b.at(canopy);
    for (let i = 0; i < 7; i++) {
      const r = rng.range(0.45, 0.75);
      cb.mesh(new THREE.IcosahedronGeometry(r, 1), rng.pick(leafMats), rng.range(-0.55, 0.55), rng.range(0.1, 1.0), rng.range(-0.55, 0.55), { dynamic: true });
    }
    // tree grate
    b.box(1.1, 0.02, 1.1, mats.std(0x2a2a2a, 0.6, 0.7), x, 0.125, z, { cast: false });
    refs.trees.push(canopy);
  };
  for (const [tx, tz, s] of [[-9.5, 8.9, 1.1], [4.2 + 7.2, 8.9, 1.0], [-18, 8.9, 1.2], [18.5, 8.9, 0.95], [-4, 18.5, 1.3], [8, 18.5, 1.15], [-15, 18.4, 1.0]] as const) tree(tx, tz, s);

  // ------------------------------------------------------------ neighboring buildings
  const neighbor = (x0: number, x1: number, h: number, color: string, depth: number, shop: { name: string; color: string } | undefined, seed: string, zFront: number, faceSign = 1) => {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const cols = Math.max(2, Math.round(w / 1.6));
    const rows = Math.max(2, Math.round(h / 2.6));
    const tex = facadeTexture(color, cols, rows, seed, shop);
    const winTex = buildingWindows(cols, rows, 0.55, seed + 'w');
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0 });
    refs.windowMats.push(mat);
    b.box(w, h, depth, mats.std(new THREE.Color(color).multiplyScalar(0.8).getHex(), 0.9), cx, h / 2, zFront - (faceSign * depth) / 2);
    b.mesh(Geo.plane(w, h), mat, cx, h / 2, zFront + faceSign * 0.01, { ry: faceSign > 0 ? 0 : Math.PI, cast: false });
    b.box(w + 0.2, 0.25, 0.4, mats.std(0xe8dcc6, 0.7), cx, h + 0.1, zFront);
  };
  const fz = ROOM.maxZ + ROOM.wall;
  neighbor(-15.5, ROOM.minX - ROOM.wall, 6.5, '#8fb3c9', 12, { name: 'SUDS LAUNDRY', color: '#2f7fbf' }, 'n1', fz);
  neighbor(ROOM.maxX + ROOM.wall, 15.5, 5.2, '#d9b38c', 12, { name: 'SPIN RECORDS', color: '#8e44ad' }, 'n2', fz);
  neighbor(-26, -15.5, 8.5, '#c98f7a', 12, undefined, 'n3', fz);
  neighbor(15.5, 26, 7.5, '#a7c4a0', 12, { name: 'BLOOM FLORIST', color: '#e56b9f' }, 'n4', fz);
  // across the street
  const far = STREET.farZ;
  let xx = -40;
  let i = 0;
  const palette = ['#b9695a', '#e0c9a6', '#7fa7b5', '#c9a96e', '#9c8fb5', '#d98c6a', '#8fb58c'];
  const shops = ['CORNER CAFE', 'ARCADE', 'BOOKS', 'BAKERY', 'PIZZA', 'GYM', 'TOYS', 'BARBER'];
  while (xx < 40) {
    const w = rng.range(6, 10);
    const h = rng.range(6, 14);
    neighbor(xx, xx + w, h, palette[i % palette.length], 10, rng.chance(0.75) ? { name: shops[i % shops.length], color: rng.pick(['#c4262e', '#2f7fbf', '#27ae60', '#e67e22', '#8e44ad']) } : undefined, 'far' + i, far, -1);
    xx += w;
    i++;
  }

  // ------------------------------------------------------------ parked car
  parkedCar(b, mats, -10.5, 10.25, 0xf2c14e, 0);
  parkedCar(b, mats, 13.5, 10.25, 0x4fa3d1, 0);
  return refs;
}

export function makeCar(mats: MaterialLib, color: number): THREE.Group {
  const g = new THREE.Group();
  const b = new Builder(g);
  const paint = mats.phys('carPaint' + color, { color, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = mats.phys('carGlass', { color: 0x2b3a44, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  b.rbox(3.9, 0.7, 1.75, 0.25, paint, 0, 0.62, 0, { dynamic: true });
  b.rbox(2.1, 0.62, 1.55, 0.22, paint, -0.25, 1.18, 0, { dynamic: true });
  b.rbox(2.02, 0.5, 1.58, 0.18, glass, -0.25, 1.2, 0, { dynamic: true });
  b.box(0.05, 0.14, 1.2, mats.chrome, 1.96, 0.55, 0, { dynamic: true });
  b.box(0.05, 0.14, 1.2, mats.chrome, -1.96, 0.55, 0, { dynamic: true });
  const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c9, emissiveIntensity: 0.4 });
  const tl = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2200, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    b.cyl(0.11, 0.11, 0.05, hl, 1.95, 0.72, s * 0.62, { rz: Math.PI / 2, dynamic: true, seg: 16 });
    b.box(0.04, 0.12, 0.3, tl, -1.95, 0.75, s * 0.6, { dynamic: true });
  }
  const tire = mats.std(0x1b1b1b, 0.85);
  const hub = mats.chrome;
  const wheels: THREE.Object3D[] = [];
  for (const wx of [-1.25, 1.25])
    for (const wz of [-0.82, 0.82]) {
      const w = new THREE.Group();
      w.position.set(wx, 0.34, wz);
      g.add(w);
      const wb = new Builder(w);
      wb.cyl(0.34, 0.34, 0.24, tire, 0, 0, 0, { rx: Math.PI / 2, dynamic: true, seg: 20 });
      wb.cyl(0.2, 0.2, 0.25, hub, 0, 0, 0, { rx: Math.PI / 2, dynamic: true, seg: 16 });
      wheels.push(w);
    }
  g.userData.wheels = wheels;
  g.userData.dynamic = true;
  return g;
}

function parkedCar(b: Builder, mats: MaterialLib, x: number, z: number, color: number, ry: number) {
  const car = makeCar(mats, color);
  car.position.set(x, 0, z);
  car.rotation.y = ry;
  car.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  b.root.add(car);
}
