// Simple stand-in kitchen implementing the KitchenRefs contract with primitive shapes.
// Used for development until (or if) the detailed kitchen is unavailable.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYOUT, COUNTER, BACK_WALL_Z } from './layout';
import { PALETTE } from './palette';
import type { KitchenRefs, ToolProp, PanProp } from './props/types';

const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const box = (w: number, h: number, d: number, mat: THREE.Material, r = 0.01) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.99), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};
const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, seg = 32) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};
const glowMat = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

function tool(len: number, color: string): ToolProp {
  const root = new THREE.Group();
  const handle = box(len * 0.4, 0.02, 0.025, std(PALETTE.wood));
  handle.position.x = len * 0.2;
  const head = box(len * 0.6, 0.006, 0.035, std(color, { metalness: 0.7, roughness: 0.3 }));
  head.position.x = len * 0.7;
  root.add(handle, head);
  return { root, grip: new THREE.Vector3(len * 0.2, 0, 0), tip: new THREE.Vector3(len * 0.75, 0, 0), length: len };
}

function pan(radius: number, grill: boolean): PanProp {
  const root = new THREE.Group();
  const prof = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(radius, 0), new THREE.Vector2(radius + 0.01, 0.045), new THREE.Vector2(radius + 0.006, 0.047), new THREE.Vector2(radius - 0.004, 0.008), new THREE.Vector2(0.0001, 0.008)];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), std(grill ? '#3b3534' : '#2f2b2b', { roughness: 0.45, metalness: 0.4 }));
  body.castShadow = body.receiveShadow = true;
  root.add(body);
  if (grill) {
    for (let i = -4; i <= 4; i++) {
      const ridge = box(radius * 1.7 * Math.cos(Math.asin(Math.min(0.95, Math.abs(i) / 5))), 0.006, 0.008, std('#2a2525'), 0.002);
      ridge.position.set(0, 0.011, i * radius * 0.2);
      root.add(ridge);
    }
  }
  const handle = new THREE.Group();
  const h = box(0.2, 0.025, 0.035, std(PALETTE.wood), 0.01);
  h.position.x = radius + 0.1;
  h.position.y = 0.04;
  handle.add(h);
  root.add(handle);
  const oil = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.92, 40), new THREE.MeshStandardMaterial({ color: '#e8c060', transparent: true, opacity: 0.0, roughness: 0.1 }));
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = 0.0095;
  oil.visible = false;
  root.add(oil);
  return { root, surfaceY: grill ? 0.014 : 0.009, innerRadius: radius, handle, oil };
}

export function buildPlaceholderKitchen(): KitchenRefs {
  const root = new THREE.Group();
  root.name = 'kitchen-placeholder';

  // room
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), std(PALETTE.floorA, { roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 1.5);
  floor.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), std(PALETTE.wall, { roughness: 0.95 }));
  wall.position.set(0, 1.5, BACK_WALL_Z);
  wall.receiveShadow = true;
  const backsplash = new THREE.Mesh(new THREE.PlaneGeometry(COUNTER.x1 - COUNTER.x0, 0.55), std(PALETTE.tile, { roughness: 0.4 }));
  backsplash.position.set((COUNTER.x0 + COUNTER.x1) / 2, COUNTER.topY + 0.275, BACK_WALL_Z + 0.002);
  root.add(floor, wall, backsplash);

  // counter run
  const cw = COUNTER.x1 - COUNTER.x0;
  const cd = COUNTER.zFront - COUNTER.zBack;
  const cab = box(cw, COUNTER.topY - COUNTER.thickness, cd - 0.03, std(PALETTE.cabinet));
  cab.position.set((COUNTER.x0 + COUNTER.x1) / 2, (COUNTER.topY - COUNTER.thickness) / 2, (COUNTER.zBack + COUNTER.zFront) / 2 - 0.015);
  const top = box(cw + 0.02, COUNTER.thickness, cd + 0.02, std(PALETTE.counter, { roughness: 0.7 }), 0.012);
  top.position.set((COUNTER.x0 + COUNTER.x1) / 2, COUNTER.topY - COUNTER.thickness / 2, (COUNTER.zBack + COUNTER.zFront) / 2);
  root.add(cab, top);

  // board
  const boardRoot = new THREE.Group();
  const board = box(LAYOUT.board.size[0], 0.03, LAYOUT.board.size[1], std('#e3b57e', { roughness: 0.75 }), 0.012);
  board.position.y = 0.015;
  boardRoot.add(board);
  boardRoot.position.copy(LAYOUT.board.pos);
  root.add(boardRoot);

  // caddy + tools
  const caddyRoot = new THREE.Group();
  caddyRoot.position.copy(LAYOUT.toolCaddy.pos);
  const caddyBox = box(0.16, 0.1, 0.12, std(PALETTE.coral), 0.015);
  caddyBox.position.y = 0.05;
  caddyRoot.add(caddyBox);
  root.add(caddyRoot);
  const tools = {
    knife: tool(0.26, '#dfe6ea'),
    peeler: tool(0.16, '#f2c14a'),
    rollingPin: tool(0.3, '#e6c08f'),
    masher: tool(0.22, '#b9c3cb'),
  };
  const slots = {
    knife: { pos: new THREE.Vector3(-0.05, 0.1, -0.02), rot: new THREE.Euler(0, 0, Math.PI / 2.4) },
    peeler: { pos: new THREE.Vector3(-0.015, 0.1, 0.02), rot: new THREE.Euler(0, 0, Math.PI / 2.4) },
    rollingPin: { pos: new THREE.Vector3(0.02, 0.1, -0.02), rot: new THREE.Euler(0, 0, Math.PI / 2.4) },
    masher: { pos: new THREE.Vector3(0.055, 0.1, 0.02), rot: new THREE.Euler(0, 0, Math.PI / 2.4) },
  };
  for (const k of Object.keys(tools) as (keyof typeof tools)[]) {
    tools[k].root.position.copy(slots[k].pos).add(caddyRoot.position);
    tools[k].root.rotation.copy(slots[k].rot);
    root.add(tools[k].root);
  }

  // bowl
  const bowlRoot = new THREE.Group();
  bowlRoot.position.copy(LAYOUT.bowl.pos);
  const bp = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.15, 0.04), new THREE.Vector2(0.165, 0.12), new THREE.Vector2(0.157, 0.122), new THREE.Vector2(0.142, 0.045), new THREE.Vector2(0.085, 0.012), new THREE.Vector2(0.0001, 0.012)];
  const bowlMesh = new THREE.Mesh(new THREE.LatheGeometry(bp, 48), std('#f7f2ea', { roughness: 0.3 }));
  bowlMesh.castShadow = bowlMesh.receiveShadow = true;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.13, 40), new THREE.MeshStandardMaterial({ color: '#f6dc9a', roughness: 0.25 }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.04;
  fill.visible = false;
  bowlRoot.add(bowlMesh, fill);
  root.add(bowlRoot);
  const whisk = tool(0.24, '#cfd7dd');
  whisk.root.position.copy(LAYOUT.bowl.pos).add(new THREE.Vector3(0.15, 0.13, 0.05));
  whisk.root.rotation.z = 0.5;
  root.add(whisk.root);

  // stove + oven
  const stoveRoot = new THREE.Group();
  stoveRoot.position.copy(LAYOUT.stove.pos);
  const stoveBody = box(LAYOUT.stove.width, COUNTER.topY, LAYOUT.stove.depth, std(PALETTE.coral, { roughness: 0.4 }), 0.03);
  stoveBody.position.y = COUNTER.topY / 2;
  stoveRoot.add(stoveBody);
  const burners = LAYOUT.burners.map((w, i) => {
    const local = w.clone().sub(LAYOUT.stove.pos);
    const ring = cyl(0.07, 0.07, 0.008, std('#2b2626'));
    ring.position.copy(local).setY(COUNTER.topY + 0.004);
    stoveRoot.add(ring);
    const flame = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.025, 6), new THREE.MeshBasicMaterial({ color: '#5aa8ff', transparent: true, opacity: 0.85 }));
      const a = (k / 10) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.055, 0.012, Math.sin(a) * 0.055);
      flame.add(c);
    }
    flame.position.copy(local).setY(COUNTER.topY + 0.006);
    flame.scale.setScalar(0);
    stoveRoot.add(flame);
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.075, 32), glowMat('#ff5a2a'));
    glow.rotation.x = -Math.PI / 2;
    glow.position.copy(local).setY(COUNTER.topY + 0.009);
    stoveRoot.add(glow);
    const knob = new THREE.Group();
    const kn = cyl(0.022, 0.022, 0.025, std('#fff7ea'));
    kn.rotation.x = Math.PI / 2;
    knob.add(kn);
    knob.position.set(-0.3 + i * 0.2, COUNTER.topY - 0.06, LAYOUT.stove.depth / 2 + 0.012);
    stoveRoot.add(knob);
    return { center: new THREE.Vector3(local.x, COUNTER.topY, local.z), flame, glow, knob };
  });
  // oven
  const door = new THREE.Group();
  door.position.set(0, 0.1, LAYOUT.stove.depth / 2 + 0.01);
  const doorPanel = box(0.66, 0.55, 0.03, std(PALETTE.coralDark, { roughness: 0.4 }), 0.02);
  doorPanel.position.y = 0.275;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.24), std('#2a2020', { roughness: 0.15, metalness: 0.2 }));
  win.position.set(0, 0.3, 0.017);
  door.add(doorPanel, win);
  stoveRoot.add(door);
  const rack = new THREE.Group();
  const rackMesh = box(0.6, 0.012, 0.45, std('#b9c3cb', { metalness: 0.7, roughness: 0.35 }), 0.004);
  rack.add(rackMesh);
  rack.position.set(0, 0.36, 0.02);
  stoveRoot.add(rack);
  const ovenGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), glowMat('#ff8a3a'));
  ovenGlow.position.set(0, 0.38, -0.15);
  stoveRoot.add(ovenGlow);
  const dial = new THREE.Group();
  const dm = cyl(0.03, 0.03, 0.02, std('#fff7ea'));
  dm.rotation.x = Math.PI / 2;
  dial.add(dm);
  dial.position.set(0.3, COUNTER.topY - 0.06, LAYOUT.stove.depth / 2 + 0.012);
  stoveRoot.add(dial);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshStandardMaterial({ color: '#661111', emissive: '#ff2200', emissiveIntensity: 0 }));
  lamp.position.set(0.36, COUNTER.topY - 0.06, LAYOUT.stove.depth / 2 + 0.012);
  stoveRoot.add(lamp);
  root.add(stoveRoot);

  // pans & pot
  const fryPan = pan(0.18, false);
  fryPan.root.position.copy(LAYOUT.burners[0]).setY(COUNTER.topY + 0.008);
  fryPan.root.rotation.y = 0.5;
  const grillPan = pan(0.17, true);
  grillPan.root.position.copy(LAYOUT.burners[1]).setY(COUNTER.topY + 0.008);
  grillPan.root.rotation.y = -0.5 + Math.PI;
  root.add(fryPan.root, grillPan.root);
  const potRoot = new THREE.Group();
  potRoot.position.copy(LAYOUT.burners[2]).setY(COUNTER.topY + 0.008);
  const pp = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.155, 0), new THREE.Vector2(0.16, 0.2), new THREE.Vector2(0.15, 0.2), new THREE.Vector2(0.145, 0.012), new THREE.Vector2(0.0001, 0.012)];
  const potMesh = new THREE.Mesh(new THREE.LatheGeometry(pp, 48), std('#ff8a74', { roughness: 0.35 }));
  potMesh.castShadow = potMesh.receiveShadow = true;
  const waterMat = new THREE.MeshStandardMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.65, roughness: 0.08 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.145, 40), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.14;
  const waterBody = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.128, 40, 1, true), waterMat);
  waterBody.position.y = 0.076;
  potRoot.add(potMesh, water, waterBody);
  root.add(potRoot);

  // blender
  const blRoot = new THREE.Group();
  blRoot.position.copy(LAYOUT.blender.pos);
  const blBase = box(0.18, 0.12, 0.18, std(PALETTE.cabinet), 0.03);
  blBase.position.y = 0.06;
  const jar = new THREE.Group();
  jar.position.y = 0.12;
  const jarMesh = cyl(0.12, 0.095, 0.3, new THREE.MeshPhysicalMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.3, roughness: 0.05 }), 40);
  jarMesh.position.y = 0.15;
  (jarMesh.material as THREE.Material).depthWrite = false;
  const lid = new THREE.Group();
  const lm = cyl(0.125, 0.125, 0.02, std('#2f2b2b'));
  lid.add(lm);
  lid.position.y = 0.31;
  const blades = new THREE.Group();
  const bl = box(0.12, 0.004, 0.02, std('#c9d2d9', { metalness: 0.8 }), 0.002);
  blades.add(bl);
  blades.position.y = 0.02;
  const liquid = cyl(0.105, 0.09, 1, new THREE.MeshStandardMaterial({ color: '#f4a0c0', roughness: 0.2 }), 32);
  liquid.geometry.translate(0, 0.5, 0);
  liquid.position.y = 0.01;
  liquid.scale.y = 0.001;
  liquid.visible = false;
  jar.add(jarMesh, lid, blades, liquid);
  const button = new THREE.Group();
  const bm = cyl(0.025, 0.025, 0.015, std('#ff5a5a'));
  bm.rotation.x = Math.PI / 2;
  button.add(bm);
  button.position.set(0, 0.06, 0.092);
  blRoot.add(blBase, jar, button);
  root.add(blRoot);

  // toaster
  const tRoot = new THREE.Group();
  tRoot.position.copy(LAYOUT.toaster.pos);
  const tBody = box(0.3, 0.2, 0.18, std(PALETTE.chrome, { metalness: 0.6, roughness: 0.25 }), 0.05);
  tBody.position.y = 0.1;
  tRoot.add(tBody);
  const lever = new THREE.Group();
  const lv = box(0.03, 0.015, 0.03, std('#2b2626'), 0.005);
  lever.add(lv);
  lever.position.set(0.16, 0.16, 0);
  tRoot.add(lever);
  const tGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), glowMat('#ff6a2a'));
  tGlow.rotation.x = -Math.PI / 2;
  tGlow.position.y = 0.201;
  tRoot.add(tGlow);
  root.add(tRoot);

  // fryer
  const fRoot = new THREE.Group();
  fRoot.position.copy(LAYOUT.fryer.pos);
  const fBody = box(0.36, 0.22, 0.3, std(PALETTE.butter, { roughness: 0.4 }), 0.04);
  fBody.position.y = 0.11;
  const oil = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), new THREE.MeshStandardMaterial({ color: '#e8a830', roughness: 0.12 }));
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = 0.18;
  const basket = new THREE.Group();
  const bk = box(0.28, 0.1, 0.22, new THREE.MeshStandardMaterial({ color: '#c9d2d9', metalness: 0.7, roughness: 0.35, wireframe: true }), 0.01);
  bk.position.y = 0.05;
  basket.add(bk);
  basket.position.y = 0.2;
  const fLamp = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshStandardMaterial({ color: '#661111', emissive: '#ff2200', emissiveIntensity: 0 }));
  fLamp.position.set(0.14, 0.15, 0.152);
  fRoot.add(fBody, oil, basket, fLamp);
  root.add(fRoot);

  // microwave
  const mRoot = new THREE.Group();
  mRoot.position.copy(LAYOUT.microwave.pos);
  const mBody = box(0.5, 0.3, 0.36, std('#f7f2ea', { roughness: 0.4 }), 0.03);
  mBody.position.y = 0.15;
  const mDoor = new THREE.Group();
  mDoor.position.set(-0.25, 0, 0.18);
  const md = box(0.36, 0.26, 0.02, std('#3a3434', { roughness: 0.2 }), 0.01);
  md.position.set(0.18, 0.15, 0);
  mDoor.add(md);
  const mPlate = new THREE.Group();
  const mp = cyl(0.12, 0.12, 0.008, std('#eef6fa', { roughness: 0.15 }));
  mPlate.add(mp);
  mPlate.position.set(-0.05, 0.03, 0);
  const mLight = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), glowMat('#fff2b0'));
  mLight.position.set(-0.05, 0.15, -0.15);
  const mButton = new THREE.Group();
  const mb = box(0.05, 0.03, 0.01, std('#7bd88f'), 0.005);
  mButton.add(mb);
  mButton.position.set(0.19, 0.08, 0.185);
  mRoot.add(mBody, mDoor, mPlate, mLight, mButton);
  root.add(mRoot);

  // fridge
  const frRoot = new THREE.Group();
  frRoot.position.copy(LAYOUT.fridge.pos);
  const frBody = box(LAYOUT.fridge.width, LAYOUT.fridge.height, LAYOUT.fridge.depth, std(PALETTE.butter, { roughness: 0.35 }), 0.06);
  frBody.position.y = LAYOUT.fridge.height / 2;
  const frDoor = new THREE.Group();
  frDoor.position.set(LAYOUT.fridge.width / 2, 0.62, LAYOUT.fridge.depth / 2);
  const fd = box(LAYOUT.fridge.width, 1.24, 0.04, std(PALETTE.butterDark, { roughness: 0.35 }), 0.04);
  fd.position.set(-LAYOUT.fridge.width / 2, 0.62, 0.02);
  frDoor.add(fd);
  const drawer = new THREE.Group();
  drawer.position.set(0, 0.06, LAYOUT.fridge.depth / 2 - 0.25);
  const dr = box(LAYOUT.fridge.width - 0.06, 0.38, 0.5, std('#dff4ff', { roughness: 0.3 }), 0.03);
  dr.position.y = 0.19;
  drawer.add(dr);
  const frLight = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), glowMat('#cfeeff'));
  frLight.rotation.x = -Math.PI / 2;
  frLight.position.set(0, 0.3, 0);
  drawer.add(frLight);
  frRoot.add(frBody, frDoor, drawer);
  root.add(frRoot);

  // dining nook
  const tableRoot = new THREE.Group();
  tableRoot.position.copy(LAYOUT.table.pos);
  const tTop = cyl(LAYOUT.table.radius, LAYOUT.table.radius, 0.04, std('#fff7ea', { roughness: 0.5 }), 48);
  tTop.position.y = LAYOUT.table.topY - 0.02;
  const tLeg = cyl(0.05, 0.12, LAYOUT.table.topY - 0.04, std(PALETTE.coral));
  tLeg.position.y = (LAYOUT.table.topY - 0.04) / 2;
  tableRoot.add(tTop, tLeg);
  root.add(tableRoot);
  const chair = new THREE.Group();
  chair.position.copy(LAYOUT.chair.pos);
  const seat = cyl(0.25, 0.25, 0.06, std(PALETTE.lilac), 32);
  seat.position.y = 0.47;
  const back = box(0.5, 0.5, 0.06, std(PALETTE.lilac), 0.03);
  back.position.set(0, 0.75, -0.24);
  chair.add(seat, back);
  root.add(chair);

  const plateRoot = new THREE.Group();
  plateRoot.position.copy(LAYOUT.plate.pos);
  const plp = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.17, 0.018), new THREE.Vector2(0.168, 0.022), new THREE.Vector2(0.115, 0.006), new THREE.Vector2(0.0001, 0.006)];
  const plateMesh = new THREE.Mesh(new THREE.LatheGeometry(plp, 48), std('#ffffff', { roughness: 0.25 }));
  plateMesh.castShadow = plateMesh.receiveShadow = true;
  plateRoot.add(plateMesh);
  root.add(plateRoot);

  const bellRoot = new THREE.Group();
  bellRoot.position.copy(LAYOUT.bell.pos);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#e8c04a', { metalness: 0.8, roughness: 0.25 }));
  dome.castShadow = true;
  const plunger = new THREE.Group();
  const pl = cyl(0.008, 0.008, 0.02, std('#e8c04a', { metalness: 0.8, roughness: 0.25 }));
  pl.position.y = 0.01;
  plunger.add(pl);
  plunger.position.y = 0.045;
  bellRoot.add(dome, plunger);
  root.add(bellRoot);

  const trashRoot = new THREE.Group();
  trashRoot.position.copy(LAYOUT.trash.pos);
  const can = cyl(0.14, 0.12, 0.36, std('#9ad0e8', { roughness: 0.4 }));
  can.position.y = 0.18;
  const tLid = new THREE.Group();
  tLid.position.set(0, 0.36, -0.14);
  const lidMesh = cyl(0.145, 0.145, 0.02, std('#7bbcd8'));
  lidMesh.position.z = 0.14;
  tLid.add(lidMesh);
  const pedal = new THREE.Group();
  pedal.position.set(0, 0.02, 0.14);
  trashRoot.add(can, tLid, pedal);
  root.add(trashRoot);

  // chalkboard
  const cbCanvas = document.createElement('canvas');
  cbCanvas.width = 512;
  cbCanvas.height = 320;
  const cbTex = new THREE.CanvasTexture(cbCanvas);
  cbTex.colorSpace = THREE.SRGBColorSpace;
  const cb = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshStandardMaterial({ map: cbTex, roughness: 0.9 }));
  const cbRoot = new THREE.Group();
  cbRoot.position.copy(LAYOUT.chalkboard.pos);
  cbRoot.add(cb);
  root.add(cbRoot);
  const write = (title: string, subtitle?: string) => {
    const c = cbCanvas.getContext('2d')!;
    c.fillStyle = '#2e3b33';
    c.fillRect(0, 0, 512, 320);
    c.fillStyle = '#f4f1e6';
    c.textAlign = 'center';
    c.font = 'bold 44px sans-serif';
    c.fillText(title, 256, 140, 480);
    if (subtitle) {
      c.font = '28px sans-serif';
      c.fillText(subtitle, 256, 210, 480);
    }
    cbTex.needsUpdate = true;
  };
  write("Today's Special", 'Anything!');

  return {
    root,
    board: { root: boardRoot, surfaceY: 0.03, size: LAYOUT.board.size },
    caddy: { root: caddyRoot, slots },
    tools,
    bowl: { root: bowlRoot, innerRadius: 0.15, bottomY: 0.012, rimY: 0.12, fill },
    whisk,
    stove: { root: stoveRoot, burners, oven: { door, openAngle: 1.35, rackCenter: new THREE.Vector3(0, 0.366, 0.02), rackSize: [0.56, 0.4], rack, glow: ovenGlow, dial, lamp }, cooktopY: COUNTER.topY },
    pan: fryPan,
    grill: grillPan,
    pot: { root: potRoot, innerRadius: 0.145, waterY: 0.14, bottomY: 0.012, rimY: 0.2, water, waterBody, lid: null },
    blender: { root: blRoot, jar, jarInnerRadius: 0.1, jarBottomY: 0.01, jarTopY: 0.3, lid, blades, button, liquid },
    toaster: { root: tRoot, slots: [new THREE.Vector3(0, 0.2, -0.035), new THREE.Vector3(0, 0.2, 0.035)], slotSize: [0.22, 0.04], slotDepth: 0.12, lever, leverTravel: 0.09, glow: tGlow },
    fryer: { root: fRoot, basket, basketUpY: 0.2, basketDownY: 0.1, basketFloorY: 0.005, basketSize: [0.26, 0.2], oil, oilY: 0.18, lamp: fLamp },
    microwave: { root: mRoot, door: mDoor, openAngle: 1.6, plate: mPlate, plateY: 0.034, plateRadius: 0.12, light: mLight, button: mButton, setDisplay: () => {} },
    fridge: { root: frRoot, door: frDoor, openAngle: 1.6, drawer, drawerTravel: 0.35, drawerFloorY: 0.05, drawerSize: [0.55, 0.36], interiorLight: frLight },
    plate: { root: plateRoot, surfaceY: 0.006, radius: 0.17 },
    bell: { root: bellRoot, plunger },
    trash: { root: trashRoot, lid: tLid, openAngle: 1.1, openingY: 0.36, radius: 0.13, pedal },
    chalkboard: { root: cbRoot, write },
    counterTop: top,
    lamps: [],
    ambient: { update: () => {} },
  };
}
