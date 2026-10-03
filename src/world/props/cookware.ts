// Cookware that sits on the burners: frying pan, grill pan, soup pot (+ hidden lid), kettle.
// Every root is at the burner centre at cooktop level; bodies rest on the grate (GRATE_TOP).

import * as THREE from 'three';
import type { PanProp, PotProp } from './types';
import { PALETTE } from '../palette';
import { GRATE_TOP } from './stove';
import {
  part, grp, rbox, lathe, fillet, puck, cylB, tube, softExtrude, roundedRectShape, roundedRectPath, mergeGeo,
  lacquer, enamel, chrome, steel, castIron, textured, mergeStatic, dynamic, type P2,
} from './util';
import { speckleTex, polkaTex, woodTex } from './textures';

const B = GRATE_TOP;

/** Wooden handle grip lathed along +X (starts at x=0). */
function woodGrip(len: number, r0: number, r1: number): THREE.BufferGeometry {
  const prof: P2[] = fillet(
    [
      [0, 0],
      [r0, 0, 0.004],
      [r0 * 1.04, len * 0.25],
      [r1, len * 0.8],
      [r1 * 1.02, len - r1 * 0.9, r1 * 0.9],
      [0, len],
    ],
    5,
  );
  return lathe(prof, 20).rotateZ(-Math.PI / 2);
}

function woodMat(): THREE.MeshStandardMaterial {
  return textured('handleWood', woodTex('handle', { w: 256, h: 128, rings: 4, base: '#f0d2b0', contrast: 0.7 }), { roughness: 0.48, color: '#e2b384' });
}

/** Handle assembly along +X starting at the rim: riveted chrome bracket + wooden grip. */
function panHandle(len = 0.2, lift = 0.14): THREE.Group {
  const h = new THREE.Group();
  h.name = 'handle';
  const tilt = new THREE.Group();
  tilt.rotation.z = lift;
  h.add(tilt);
  // bracket
  part(tilt, rbox(0.06, 0.016, 0.03, 0.007, 3), chrome(), { pos: [0.012, 0, 0] });
  for (const z of [-0.008, 0.008]) part(tilt, new THREE.SphereGeometry(0.0035, 10, 8), chrome(), { pos: [-0.016, 0.004, z] });
  part(tilt, cylB(0.012, 0.014, 0.012, 20).rotateZ(-Math.PI / 2), chrome(), { pos: [0.036, 0, 0] });
  const grip = woodGrip(len - 0.05, 0.0135, 0.0165);
  part(tilt, grip, woodMat(), { pos: [0.046, 0, 0] });
  // hang hole ring at the end
  part(tilt, new THREE.TorusGeometry(0.0075, 0.0025, 8, 20).rotateX(Math.PI / 2), chrome(), { pos: [len - 0.02, 0.0155, 0] });
  return h;
}

export function buildPan(): PanProp {
  const root = new THREE.Group();
  root.name = 'pan';
  const rimY = B + 0.058;
  const outer = fillet(
    [
      [0, B],
      [0.128, B, 0.03],
      [0.175, rimY, 0.004],
      [0.1715, rimY + 0.003],
    ],
    6,
  );
  const inner = fillet(
    [
      [0.1715, rimY + 0.003],
      [0.168, rimY, 0.004],
      [0.122, B + 0.008, 0.028],
      [0, B + 0.008],
    ],
    6,
  );
  part(root, lathe(outer, 64), lacquer(PALETTE.cabinet, 0.38));
  const nonstick = textured('nonstick', speckleTex('nonstick', '#3b3735', '#6f6862', 1600, [0.4, 1.0]), { roughness: 0.42, metalness: 0.15 });
  part(root, lathe(inner, 64), nonstick);
  // chrome rim bead
  part(root, new THREE.TorusGeometry(0.1715, 0.0032, 8, 72).rotateX(Math.PI / 2), chrome(), { pos: [0, rimY + 0.001, 0] });
  // handle towards the front-left
  const handle = panHandle(0.21, 0.13);
  handle.position.set(0.168, rimY - 0.014, 0);
  const hp = new THREE.Group();
  hp.rotation.y = -Math.PI * (5 / 6);
  hp.add(handle);
  root.add(hp);
  dynamic(hp);
  const oil = new THREE.Mesh(
    new THREE.CircleGeometry(0.15, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#f3c552', transparent: true, opacity: 0.5, roughness: 0.06, metalness: 0.05, depthWrite: false }),
  );
  oil.position.y = B + 0.0095;
  oil.visible = false;
  oil.name = 'panOil';
  oil.renderOrder = 2;
  root.add(dynamic(oil));
  mergeStatic(root);
  return { root, surfaceY: B + 0.008, innerRadius: 0.15, handle, oil };
}

export function buildGrillPan(): PanProp {
  const root = new THREE.Group();
  root.name = 'grillPan';
  const S = 0.35, R = 0.055, wallH = 0.052, floorT = 0.012, wallT = 0.011;
  const iron = castIron();
  // floor
  part(root, softExtrude(roundedRectShape(S, S, R), floorT, 0.004, { curveSegs: 8 }).rotateX(-Math.PI / 2), iron, { pos: [0, B, 0] });
  // wall ring
  const ring = roundedRectShape(S, S, R);
  ring.holes.push(roundedRectPath(S - 2 * wallT, S - 2 * wallT, R - wallT));
  part(root, softExtrude(ring, wallH, 0.0045, { curveSegs: 8 }).rotateX(-Math.PI / 2), iron, { pos: [0, B, 0] });
  // ridges
  const ridges: THREE.BufferGeometry[] = [];
  const n = 10;
  const inner = S - 2 * wallT - 0.02;
  for (let i = 0; i < n; i++) {
    const z = -inner / 2 + 0.012 + (i * (inner - 0.024)) / (n - 1);
    ridges.push(new THREE.CapsuleGeometry(0.0048, inner - 0.02, 4, 8).rotateZ(Math.PI / 2).translate(0, B + floorT + 0.002, z));
  }
  part(root, mergeGeo(ridges), iron);
  // pour spouts (little notches) - two chrome rivets on the handle side
  const handle = panHandle(0.2, 0.1);
  handle.position.set(S / 2 - 0.004, B + wallH - 0.016, 0);
  const hp = new THREE.Group();
  hp.rotation.y = -0.35;
  hp.add(handle);
  root.add(hp);
  dynamic(hp);
  // helper handle on the opposite side (little loop)
  part(root, tube([[-S / 2 + 0.004, B + wallH - 0.012, -0.035], [-S / 2 - 0.03, B + wallH - 0.006, -0.03], [-S / 2 - 0.04, B + wallH - 0.004, 0], [-S / 2 - 0.03, B + wallH - 0.006, 0.03], [-S / 2 + 0.004, B + wallH - 0.012, 0.035]], 0.0065, 24, 8), iron);
  const surfaceY = B + floorT + 0.007;
  const oilShape = roundedRectShape(S - 2 * wallT - 0.004, S - 2 * wallT - 0.004, R - wallT);
  const oil = new THREE.Mesh(
    new THREE.ShapeGeometry(oilShape, 8).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#f3c552', transparent: true, opacity: 0.45, roughness: 0.06, metalness: 0.05, depthWrite: false }),
  );
  oil.position.y = surfaceY - 0.003;
  oil.visible = false;
  oil.name = 'grillOil';
  oil.renderOrder = 2;
  root.add(dynamic(oil));
  mergeStatic(root);
  return { root, surfaceY, innerRadius: 0.15, handle, oil };
}

export function buildPot(): PotProp {
  const root = new THREE.Group();
  root.name = 'pot';
  const RO = 0.136, RI = 0.129, H = 0.19;
  const top = B + H;
  const bottomIn = B + 0.012;
  // outer wall (textured with polka dots) + bottom
  const wall = lathe(fillet([[RO - 0.012, B], [RO, B + 0.012], [RO, top - 0.004]], 4), 64);
  const circ = 2 * Math.PI * RO;
  const dotTex = polkaTex('pot', '#9fd3f0', '#ffffff', 6, 0.17).clone();
  dotTex.needsUpdate = true;
  const tilesAround = 2;
  const tileH = circ / tilesAround;
  dotTex.repeat.set(tilesAround, H / tileH);
  dotTex.offset.set(0, 0.12);
  const outerMat = new THREE.MeshStandardMaterial({ map: dotTex, roughness: 0.3, metalness: 0 });
  part(root, wall, outerMat);
  part(root, lathe([[0, B], [RO - 0.012, B]], 48), enamel('#7fb8d8', 0.4));
  // inner
  const innerMat = textured('potInner', speckleTex('potInner', '#f8f5ef', '#c8d4dc', 500, [0.4, 0.9]), { roughness: 0.25 });
  part(root, lathe(fillet([[RI, top], [RI, bottomIn, 0.014], [0, bottomIn]], 5), 64), innerMat);
  // rolled chrome rim
  part(root, new THREE.TorusGeometry((RO + RI) / 2, (RO - RI) / 2 + 0.0022, 10, 80).rotateX(Math.PI / 2), chrome(), { pos: [0, top, 0] });
  // band near the top
  part(root, new THREE.TorusGeometry(RO + 0.0005, 0.0028, 8, 80).rotateX(Math.PI / 2), enamel(PALETTE.coral, 0.35), { pos: [0, top - 0.026, 0] });
  // loop handles (left / right)
  for (const s of [-1, 1]) {
    const hy = top - 0.04;
    part(
      root,
      tube(
        [
          [s * (RO - 0.002), hy, -0.034],
          [s * (RO + 0.03), hy + 0.012, -0.03],
          [s * (RO + 0.042), hy + 0.016, 0],
          [s * (RO + 0.03), hy + 0.012, 0.03],
          [s * (RO - 0.002), hy, 0.034],
        ],
        0.0062,
        28,
        10,
      ),
      chrome(),
    );
    for (const z of [-0.034, 0.034]) part(root, rbox(0.01, 0.022, 0.016, 0.005, 2), chrome(), { pos: [s * (RO + 0.002), hy, z] });
  }
  // water
  const waterY = B + 0.135;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(RI - 0.0008, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#b8e2f2', transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.05, depthWrite: false, envMapIntensity: 1.4 }),
  );
  water.position.y = waterY;
  water.name = 'potWater';
  water.renderOrder = 3;
  water.receiveShadow = true;
  const bodyH = waterY - bottomIn - 0.002;
  const waterBody = new THREE.Mesh(
    new THREE.CylinderGeometry(RI - 0.0015, RI - 0.0015, bodyH, 48, 1, false).translate(0, bodyH / 2, 0),
    new THREE.MeshStandardMaterial({ color: '#8ccbe6', transparent: true, opacity: 0.32, roughness: 0.2, side: THREE.BackSide, depthWrite: false }),
  );
  waterBody.position.y = bottomIn + 0.001;
  waterBody.name = 'potWaterBody';
  waterBody.renderOrder = 2;
  root.add(dynamic(water), dynamic(waterBody));
  // lid (rest pose = on the pot); hidden by default so the pot reads as open
  const lid = dynamic(grp(root, [0, top + 0.003, 0], 'potLid'));
  part(lid, lathe(fillet([[0, 0.05], [0.05, 0.044, 0.02], [RO + 0.004, 0.006, 0.006], [RO + 0.006, 0]], 6), 64), chrome());
  part(lid, puck(0.02, 0.022, 0.008, 24), enamel(PALETTE.coral, 0.35), { pos: [0, 0.05, 0] });
  lid.visible = false;
  mergeStatic(root);
  return { root, innerRadius: RI - 0.004, waterY, bottomY: bottomIn, rimY: top, water, waterBody, lid };
}

/** Decorative whistling kettle (mint) for the back-right burner. */
export function buildKettle(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'kettle';
  const body = lacquer(PALETTE.cabinet, 0.36);
  const prof = fillet(
    [
      [0, B],
      [0.095, B, 0.012],
      [0.104, B + 0.035, 0.03],
      [0.088, B + 0.11, 0.05],
      [0.05, B + 0.15, 0.015],
      [0.045, B + 0.152],
    ],
    7,
  );
  part(root, lathe(prof, 56), body);
  part(root, lathe([[0, B + 0.0005], [0.1, B + 0.0005]], 40), steel());
  // chrome base band
  part(root, new THREE.TorusGeometry(0.099, 0.004, 8, 56).rotateX(Math.PI / 2), chrome(), { pos: [0, B + 0.012, 0] });
  // lid + knob
  part(root, lathe(fillet([[0, B + 0.17], [0.03, B + 0.165, 0.01], [0.048, B + 0.152], [0.046, B + 0.149]], 5), 40), chrome());
  part(root, new THREE.SphereGeometry(0.014, 20, 14), enamel(PALETTE.coral, 0.35), { pos: [0, B + 0.178, 0] });
  // spout (towards front-right)
  const sp = grp(root, [0, 0, 0], 'spout', [0, -0.6, 0]);
  part(
    sp,
    lathe(fillet([[0.026, 0], [0.022, 0.05, 0.02], [0.013, 0.1, 0.01], [0.011, 0.11]], 5), 20),
    body,
    { pos: [0.065, B + 0.055, 0], rot: [0, 0, -0.85] },
  );
  part(sp, cylB(0.011, 0.011, 0.012, 16), chrome(), { pos: [0.142, B + 0.128, 0], rot: [0, 0, -0.85] });
  // handle arch (black bakelite with chrome posts)
  part(root, tube([[-0.06, B + 0.13, 0], [-0.055, B + 0.215, 0], [0, B + 0.245, 0], [0.05, B + 0.215, 0], [0.04, B + 0.15, 0]], 0.011, 32, 12), enamel('#2f2a29', 0.4));
  for (const x of [-0.058, 0.042]) part(root, cylB(0.007, 0.009, 0.03, 12), chrome(), { pos: [x, B + 0.122, 0] });
  mergeStatic(root);
  return root;
}

export { panHandle };
