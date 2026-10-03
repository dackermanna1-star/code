// Countertop appliances: retro blender, chrome toaster, deep fryer, microwave.

import * as THREE from 'three';
import type { BlenderProp, ToasterProp, FryerProp, MicrowaveProp } from './types';
import { PALETTE } from '../palette';
import {
  part, grp, rbox, rboxB, lathe, fillet, puck, cylB, tube, softExtrude, roundedRectShape, roundedRectPath, mergeGeo,
  lacquer, enamel, chrome, steel, rubber, glass, glowMat, lampMat, mergeStatic, dynamic, canvasTex, makeCanvasTexture, textured,
  FONT_STACK, roundRectPath, type V3,
} from './util';

// ---------------------------------------------------------------------------------------------
// Blender

export function buildBlender(): BlenderProp {
  const root = new THREE.Group();
  root.name = 'blender';
  const body = lacquer(PALETTE.butter, 0.4);
  const baseW = 0.27, baseD = 0.3, baseH = 0.115;
  const baseZ = 0.03; // base extends further to the front (button ledge)
  // feet
  for (const x of [-1, 1]) for (const z of [-1, 1]) part(root, cylB(0.016, 0.018, 0.012, 16), rubber(), { pos: [x * (baseW / 2 - 0.035), 0, baseZ + z * (baseD / 2 - 0.035)] });
  part(root, rboxB(baseW, baseH, baseD, 0.045, 4), body, { pos: [0, 0.008, baseZ] });
  // chrome waist band
  part(root, rbox(baseW + 0.004, 0.012, baseD + 0.004, 0.047, 4), chrome(), { pos: [0, 0.03, baseZ] });
  // jar seat (chrome collar socket)
  const seatY = 0.008 + baseH;
  part(root, lathe(fillet([[0.14, 0], [0.142, 0.004, 0.003], [0.132, 0.018, 0.006], [0, 0.018]], 4), 56), chrome(), { pos: [0, seatY - 0.004, 0] });
  // big button on the front ledge
  const btnZ = baseZ + baseD / 2 - 0.062;
  part(root, new THREE.TorusGeometry(0.036, 0.006, 10, 40).rotateX(Math.PI / 2), chrome(), { pos: [0, seatY + 0.002, btnZ] });
  const button = dynamic(grp(root, [0, seatY, btnZ], 'blenderButton'));
  part(button, puck(0.032, 0.026, 0.012, 40), lacquer(PALETTE.coral, 0.3));
  part(button, puck(0.016, 0.004, 0.002, 24), lacquer('#fff3e6', 0.3), { pos: [0, 0.024, 0] });
  // little speed dots
  for (const [i, c] of [[-1, PALETTE.cabinet], [1, PALETTE.cream]] as [number, string][]) part(root, puck(0.011, 0.008, 0.004, 20), lacquer(c, 0.35), { pos: [i * 0.075, seatY, btnZ + 0.005] });

  // jar (pivot at its bottom centre on the seat)
  const jarY = seatY + 0.012;
  const jar = dynamic(grp(root, [0, jarY, 0], 'blenderJar'));
  const RI = 0.115, RO = 0.121, collarH = 0.034, jarH = 0.265;
  // chrome collar
  part(jar, lathe(fillet([[0, 0], [0.13, 0, 0.006], [0.134, collarH * 0.5, 0.01], [0.126, collarH, 0.006], [RO, collarH + 0.002], [0, collarH + 0.002]], 5), 56), chrome());
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part(jar, rbox(0.012, collarH * 0.6, 0.012, 0.004, 2), chrome(), { pos: [Math.cos(a) * 0.132, collarH * 0.5, Math.sin(a) * 0.132] });
  }
  const glassBottomY = collarH + 0.006;
  // glass walls (outer surface with a slight flare + rolled rim)
  const glassMat = glass('#e8f6ff', 0.2);
  const wall = lathe(
    fillet(
      [
        [RI, glassBottomY - 0.002],
        [RO, glassBottomY - 0.004, 0.006],
        [RO, glassBottomY + jarH - 0.01, 0.01],
        [RO + 0.004, glassBottomY + jarH],
        [RI, glassBottomY + jarH],
        [RI, glassBottomY],
      ],
      5,
    ),
    64,
  );
  part(jar, wall, glassMat, { cast: false, order: 5 });
  part(jar, new THREE.CircleGeometry(RI, 48).rotateX(-Math.PI / 2), glassMat, { pos: [0, glassBottomY, 0], cast: false, order: 5 });
  // vertical facets (retro ribs) as faint glass strips
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ribs.push(new THREE.CapsuleGeometry(0.006, jarH - 0.05, 4, 8).translate(Math.cos(a) * (RO + 0.001), glassBottomY + jarH / 2, Math.sin(a) * (RO + 0.001)));
  }
  part(jar, mergeGeo(ribs), glass('#f4fbff', 0.16), { cast: false, order: 5 });
  // measuring marks (front-left)
  const marks: THREE.BufferGeometry[] = [];
  for (let i = 1; i <= 5; i++) {
    const y = glassBottomY + i * 0.04;
    const w = i % 2 ? 0.02 : 0.034;
    const a = Math.PI * 0.5 + 0.45;
    const g = rbox(w, 0.0035, 0.002, 0.001, 1).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * (RO + 0.0015), y, Math.sin(a) * (RO + 0.0015));
    marks.push(g);
  }
  part(jar, mergeGeo(marks), enamel('#ffffff', 0.4), { cast: false });
  // spout notch hint at front-left rim + handle on the right
  part(
    jar,
    tube(
      [
        [RO - 0.004, glassBottomY + jarH - 0.04, 0],
        [RO + 0.05, glassBottomY + jarH - 0.05, 0],
        [RO + 0.062, glassBottomY + jarH * 0.55, 0],
        [RO + 0.05, glassBottomY + 0.07, 0],
        [RO - 0.004, glassBottomY + 0.05, 0],
      ],
      0.013,
      40,
      12,
    ),
    lacquer(PALETTE.butter, 0.4),
  );
  // blades
  const blades = dynamic(grp(jar, [0, glassBottomY + 0.016, 0], 'blades'));
  part(blades, cylB(0.016, 0.02, 0.022, 20).translate(0, -0.016, 0), chrome());
  const bladeGeo = mergeGeo(
    [0, 1, 2, 3].map((k) => {
      const g = rbox(0.085, 0.003, 0.018, 0.0015, 1).translate(0.042, 0, 0);
      g.rotateX(k % 2 ? 0.35 : -0.35);
      g.rotateZ(k % 2 ? 0.25 : -0.12);
      return g.rotateY((k / 4) * Math.PI * 2);
    }),
  );
  part(blades, bladeGeo, chrome());
  part(blades, new THREE.SphereGeometry(0.01, 14, 10), chrome(), { pos: [0, 0.004, 0] });
  // lid
  const lid = dynamic(grp(jar, [0, glassBottomY + jarH, 0], 'blenderLid'));
  part(lid, lathe(fillet([[0, 0.022], [0.1, 0.022, 0.012], [RO + 0.008, 0.012, 0.006], [RO + 0.008, 0, 0.004], [RI - 0.004, -0.012], [0, -0.012]], 5), 56), lacquer(PALETTE.coral, 0.45));
  part(lid, puck(0.035, 0.016, 0.006, 32), lacquer(PALETTE.cream, 0.35), { pos: [0, 0.02, 0] });
  // liquid: unit-height cylinder, base at jarBottomY (gameplay scales y)
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(RI - 0.003, RI - 0.003, 1, 48).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: '#f59ab4', roughness: 0.35, metalness: 0 }),
  );
  liquid.position.y = glassBottomY + 0.001;
  liquid.visible = false;
  liquid.name = 'blenderLiquid';
  liquid.castShadow = false;
  jar.add(dynamic(liquid));
  mergeStatic(root);
  mergeStatic(jar);
  return {
    root,
    jar,
    jarInnerRadius: RI,
    // jar-local (the jar group shakes while blending and the contents ride along)
    jarBottomY: glassBottomY,
    jarTopY: glassBottomY + jarH,
    lid,
    blades,
    button,
    liquid,
  };
}

// ---------------------------------------------------------------------------------------------
// Toaster

export function buildToaster(): ToasterProp {
  const root = new THREE.Group();
  root.name = 'toaster';
  const W = 0.34, D = 0.215, H = 0.205;
  const baseH = 0.022;
  const coral = lacquer(PALETTE.coral, 0.38);
  // base plinth
  part(root, rboxB(W + 0.012, baseH, D + 0.012, 0.012, 3), enamel('#3a3230', 0.5), { pos: [0, 0, 0] });
  for (const x of [-1, 1]) for (const z of [-1, 1]) part(root, cylB(0.012, 0.012, 0.006, 12), rubber(), { pos: [x * (W / 2 - 0.03), -0.002, z * (D / 2 - 0.03)] });
  // chrome loaf body
  const bodyH = H - baseH;
  part(root, rboxB(W, bodyH, D, 0.045, 5), chrome(), { pos: [0, baseH, 0] });
  // coral end caps (left / right)
  for (const s of [-1, 1]) part(root, rboxB(0.03, bodyH - 0.01, D - 0.01, 0.014, 4), coral, { pos: [s * (W / 2 - 0.006), baseH + 0.004, 0] });
  // decorative chrome ribs along the front/back faces
  for (const z of [-1, 1]) for (const y of [0.05, 0.075, 0.1]) part(root, pill(W - 0.12, 0.0035), chrome(), { pos: [0, baseH + y, z * (D / 2 + 0.001)] });
  // slots
  const slotL = 0.235, slotW = 0.042;
  const slotZ = [-0.046, 0.046];
  const top = baseH + bodyH;
  const slotMat = enamel('#1c1817', 0.6);
  const slotGeos: THREE.BufferGeometry[] = [];
  const rimGeos: THREE.BufferGeometry[] = [];
  for (const z of slotZ) {
    slotGeos.push(new THREE.ShapeGeometry(roundedRectShape(slotL, slotW, slotW / 2), 8).rotateX(-Math.PI / 2).translate(0, top + 0.0015, z));
    const ring = roundedRectShape(slotL + 0.016, slotW + 0.016, slotW / 2 + 0.008);
    ring.holes.push(roundedRectPath(slotL, slotW, slotW / 2));
    rimGeos.push(softExtrude(ring, 0.006, 0.0025, { curveSegs: 8 }).rotateX(-Math.PI / 2).translate(0, top - 0.002, z));
  }
  part(root, mergeGeo(slotGeos), slotMat, { cast: false });
  part(root, mergeGeo(rimGeos), chrome());
  // glow inside the slots
  const glowGeo = mergeGeo(slotZ.map((z) => new THREE.ShapeGeometry(roundedRectShape(slotL - 0.01, slotW - 0.01, slotW / 2 - 0.005), 8).rotateX(-Math.PI / 2).translate(0, top + 0.0025, z)));
  const glow = new THREE.Mesh(glowGeo, glowMat('#ff6a1c'));
  glow.name = 'toasterGlow';
  glow.renderOrder = 2;
  root.add(dynamic(glow));
  // lever on the right end (+X), slides down
  const leverTravel = 0.085;
  const leverY = top - 0.045;
  part(root, rbox(0.006, leverTravel + 0.03, 0.014, 0.003, 2), enamel('#2b2626', 0.5), { pos: [W / 2 + 0.01, leverY - leverTravel / 2, 0.035] });
  const lever = dynamic(grp(root, [W / 2 + 0.012, leverY, 0.035], 'toasterLever'));
  part(lever, rbox(0.03, 0.012, 0.012, 0.004, 2), chrome(), { pos: [0.012, 0, 0] });
  part(lever, rbox(0.036, 0.026, 0.05, 0.012, 3), lacquer(PALETTE.cream, 0.35), { pos: [0.036, 0, 0] });
  // browning dial on the right end
  const dial = grp(root, [W / 2 + 0.01, baseH + 0.05, -0.045]);
  part(dial, puck(0.019, 0.012, 0.004, 24).rotateZ(-Math.PI / 2), lacquer(PALETTE.cream, 0.35));
  part(dial, rbox(0.006, 0.028, 0.006, 0.002, 1), enamel(PALETTE.coralDark, 0.4), { pos: [0.014, 0, 0] });
  // brand badge on the front
  const badge = canvasTex(
    'toasterBadge',
    256,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff7ea';
      roundRectPath(ctx, 0, 0, w, h, 30);
      ctx.fill();
      ctx.fillStyle = PALETTE.coralDark;
      ctx.font = `bold 40px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('toasty', w / 2, h / 2 + 2);
    },
    {},
  );
  part(root, rbox(0.09, 0.024, 0.004, 0.012, 3), textured('toasterBadge', badge, { roughness: 0.35 }), { pos: [0, baseH + 0.135, D / 2 + 0.001] });
  mergeStatic(root);
  return {
    root,
    slots: slotZ.map((z) => new THREE.Vector3(0, top, z)),
    slotSize: [slotL - 0.02, slotW - 0.012],
    slotDepth: 0.13,
    lever,
    leverTravel,
    glow,
  };
}

function pill(len: number, r: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len - 2 * r, 4, 8).rotateZ(Math.PI / 2);
}

// ---------------------------------------------------------------------------------------------
// Deep fryer

function wireMeshTex(): THREE.Texture {
  return canvasTex(
    'wireMesh',
    64,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      const n = 4, t = 3;
      for (let i = 0; i < n; i++) {
        ctx.fillRect((i * w) / n, 0, t, h);
        ctx.fillRect(0, (i * h) / n, w, t);
      }
    },
    { wrap: true, srgb: false },
  );
}

export function buildFryer(): FryerProp {
  const root = new THREE.Group();
  root.name = 'fryer';
  const W = 0.36, D = 0.3, H = 0.235;
  const wellW = 0.29, wellD = 0.226, wellR = 0.03;
  const body = lacquer('#8fcde9', 0.4);
  // feet + base
  for (const x of [-1, 1]) for (const z of [-1, 1]) part(root, cylB(0.014, 0.016, 0.012, 14), rubber(), { pos: [x * (W / 2 - 0.035), 0, z * (D / 2 - 0.035)] });
  // shell with an opening on top
  const ring = roundedRectShape(W, D, 0.05);
  ring.holes.push(roundedRectPath(wellW, wellD, wellR));
  part(root, softExtrude(ring, H, 0.012, { curveSegs: 10, bevelSegs: 4 }).rotateX(-Math.PI / 2), body, { pos: [0, 0.01, 0] });
  // chrome top trim around the well
  const trim = roundedRectShape(wellW + 0.024, wellD + 0.024, wellR + 0.012);
  trim.holes.push(roundedRectPath(wellW, wellD, wellR));
  part(root, softExtrude(trim, 0.006, 0.0025, { curveSegs: 10 }).rotateX(-Math.PI / 2), chrome(), { pos: [0, 0.01 + H - 0.003, 0] });
  // steel well liner (open box) + bottom
  const wellBottom = 0.06;
  const linerH = H - wellBottom + 0.008;
  const liner = roundedRectShape(wellW + 0.002, wellD + 0.002, wellR);
  liner.holes.push(roundedRectPath(wellW - 0.006, wellD - 0.006, wellR - 0.003));
  part(root, softExtrude(liner, linerH, 0.001, { curveSegs: 10, bevelSegs: 1 }).rotateX(-Math.PI / 2), steel(), { pos: [0, wellBottom, 0], cast: false });
  part(root, new THREE.ShapeGeometry(roundedRectShape(wellW, wellD, wellR), 8).rotateX(-Math.PI / 2), steel(), { pos: [0, wellBottom + 0.002, 0], cast: false });
  // heating element coil at the bottom
  part(root, tube([[-0.11, wellBottom + 0.012, -0.07], [0.11, wellBottom + 0.012, -0.07], [0.12, wellBottom + 0.012, 0], [-0.11, wellBottom + 0.012, 0.0], [-0.12, wellBottom + 0.012, 0.07], [0.11, wellBottom + 0.012, 0.07]], 0.0045, 60, 8, false, 0.3), darkCoil());
  // oil surface
  const oilY = 0.01 + H - 0.05;
  const oil = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRectShape(wellW - 0.004, wellD - 0.004, wellR - 0.002), 10).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#e9b43c', roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.8, depthWrite: false, emissive: '#5a3a00', emissiveIntensity: 0.25 }),
  );
  oil.position.y = oilY;
  oil.name = 'fryerOil';
  oil.renderOrder = 3;
  oil.receiveShadow = true;
  root.add(dynamic(oil));
  // oil body tint below the surface (so the well looks filled)
  const bodyOil = new THREE.Mesh(
    new THREE.BoxGeometry(wellW - 0.008, oilY - wellBottom - 0.004, wellD - 0.008),
    new THREE.MeshBasicMaterial({ color: '#c88a1a', transparent: true, opacity: 0.35, side: THREE.BackSide, depthWrite: false }),
  );
  bodyOil.position.y = wellBottom + (oilY - wellBottom) / 2;
  bodyOil.renderOrder = 2;
  root.add(dynamic(bodyOil));
  oil.userData.body = bodyOil;

  // basket (moves along Y). Basket-local: floor at y = 0.
  const bW = 0.28, bD = 0.21, bH = 0.105;
  const basketDownY = wellBottom + 0.024;
  const basketUpY = oilY + 0.035;
  const basket = dynamic(grp(root, [0, basketUpY, 0], 'fryerBasket'));
  const meshTex = wireMeshTex().clone();
  meshTex.needsUpdate = true;
  meshTex.repeat.set(10, 4);
  const meshMat = new THREE.MeshStandardMaterial({ color: '#dfe6ec', metalness: 0.8, roughness: 0.3, alphaMap: meshTex, alphaTest: 0.5, side: THREE.DoubleSide });
  // open-top box from planes
  const planes: THREE.BufferGeometry[] = [
    new THREE.PlaneGeometry(bW, bH).translate(0, bH / 2, bD / 2),
    new THREE.PlaneGeometry(bW, bH).translate(0, bH / 2, -bD / 2),
    new THREE.PlaneGeometry(bD, bH).rotateY(Math.PI / 2).translate(bW / 2, bH / 2, 0),
    new THREE.PlaneGeometry(bD, bH).rotateY(Math.PI / 2).translate(-bW / 2, bH / 2, 0),
    new THREE.PlaneGeometry(bW, bD).rotateX(-Math.PI / 2).translate(0, 0.002, 0),
  ];
  part(basket, mergeGeo(planes), meshMat, { cast: true });
  // frame rods
  const frame: THREE.BufferGeometry[] = [];
  for (const y of [0.002, bH]) {
    const pts: V3[] = [[-bW / 2, y, -bD / 2], [bW / 2, y, -bD / 2], [bW / 2, y, bD / 2], [-bW / 2, y, bD / 2], [-bW / 2, y, -bD / 2]];
    for (let i = 0; i < 4; i++) {
      const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
      const len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(0.0035, 0.0035, len, 8).rotateZ(Math.PI / 2);
      const dir = b.clone().sub(a).normalize();
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.atan2(dir.z, dir.x)));
      g.translate((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      frame.push(g);
    }
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) frame.push(new THREE.CylinderGeometry(0.003, 0.003, bH, 6).translate((x * bW) / 2, bH / 2, (z * bD) / 2));
  part(basket, mergeGeo(frame), chrome());
  // handle forward (+Z) and up, with a coral grip
  const hz0 = bD / 2;
  part(basket, tube([[-0.03, bH, hz0], [-0.025, bH + 0.02, hz0 + 0.05], [-0.02, bH + 0.04, hz0 + 0.1]], 0.0045, 16, 8), chrome());
  part(basket, tube([[0.03, bH, hz0], [0.025, bH + 0.02, hz0 + 0.05], [0.02, bH + 0.04, hz0 + 0.1]], 0.0045, 16, 8), chrome());
  const gripG = new THREE.CapsuleGeometry(0.016, 0.1, 6, 16).rotateX(Math.PI / 2 - 0.38);
  part(basket, gripG, lacquer(PALETTE.coral, 0.4), { pos: [0, bH + 0.06, hz0 + 0.14] });
  // control panel on the front face: dial + lamp + label
  const front = D / 2 + 0.01;
  const panel = canvasTex(
    'fryerPanel',
    256,
    96,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff7ea';
      roundRectPath(ctx, 0, 0, w, h, 24);
      ctx.fill();
      ctx.fillStyle = '#5a7f95';
      ctx.font = `bold 34px ${FONT_STACK}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('FRY', 22, h / 2 + 2);
      ctx.strokeStyle = '#ffb08a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * 0.8 + (k / 4) * Math.PI * 1.4;
        const cx = w * 0.58, cy = h / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 33, cy + Math.sin(a) * 33);
        ctx.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
        ctx.stroke();
      }
    },
    {},
  );
  part(root, rbox(0.17, 0.064, 0.008, 0.014, 3), textured('fryerPanel', panel, { roughness: 0.35 }), { pos: [0.02, 0.105, front - 0.002] });
  const dialG = grp(root, [0.035 + 0.02 - 0.013, 0.105, front + 0.002]);
  part(dialG, puck(0.022, 0.016, 0.006, 24).rotateX(Math.PI / 2), lacquer(PALETTE.cream, 0.35));
  part(dialG, rbox(0.008, 0.03, 0.01, 0.003, 2), enamel(PALETTE.coralDark, 0.4), { pos: [0, 0, 0.018] });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), lampMat('#2f6a3a', '#5cff7a'));
  lamp.position.set(0.085, 0.105, front + 0.002);
  lamp.name = 'fryerLamp';
  lamp.castShadow = false;
  root.add(dynamic(lamp));
  part(root, new THREE.TorusGeometry(0.0105, 0.0026, 8, 20), chrome(), { pos: [0.085, 0.105, front + 0.002] });
  // side handles
  for (const s of [-1, 1]) part(root, rbox(0.024, 0.026, 0.12, 0.011, 3), chrome(), { pos: [s * (W / 2 + 0.008), 0.18, 0] });
  mergeStatic(root);
  return {
    root,
    basket,
    basketUpY,
    basketDownY,
    basketFloorY: 0.006,
    basketSize: [bW - 0.02, bD - 0.02],
    oil,
    oilY,
    lamp,
  };
}

function darkCoil(): THREE.MeshStandardMaterial {
  return enamel('#4a4442', 0.5);
}

// ---------------------------------------------------------------------------------------------
// Microwave

function drawDisplay(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  ctx.fillStyle = '#16251f';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * 0.5);
  ctx.font = `bold ${Math.round(h * 0.62)}px 'DejaVu Sans Mono', 'Courier New', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#7dffb0';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#9dffc4';
  ctx.fillText(text, w / 2, h / 2 + 2);
  ctx.shadowBlur = 0;
}

export function buildMicrowave(): MicrowaveProp {
  const root = new THREE.Group();
  root.name = 'microwave';
  const W = 0.5, H = 0.29, D = 0.36;
  const bodyMat = lacquer('#fbf1e1', 0.38);
  const accent = lacquer(PALETTE.coral, 0.38);
  const doorW = 0.34;
  const panelW = W - doorW;
  const x0 = -W / 2;
  // feet
  for (const x of [-1, 1]) for (const z of [-1, 1]) part(root, cylB(0.012, 0.014, 0.01, 12), rubber(), { pos: [x * (W / 2 - 0.04), 0, z * (D / 2 - 0.04)] });
  const by = 0.008;
  // cavity extents
  const cavX0 = x0 + 0.02, cavX1 = x0 + doorW - 0.012;
  const cavY0 = by + 0.022, cavY1 = by + H - 0.022;
  const cavZ0 = -D / 2 + 0.025, cavZ1 = D / 2 - 0.012;
  // shell: top, bottom, left side, back, partition + control block on the right
  part(root, rboxB(W, 0.024, D, 0.012, 3), bodyMat, { pos: [0, by + H - 0.024, 0] });
  part(root, rboxB(W, 0.024, D, 0.012, 3), bodyMat, { pos: [0, by, 0] });
  part(root, rboxB(0.022, H, D, 0.011, 3), bodyMat, { pos: [x0 + 0.011, by, 0] });
  part(root, rboxB(W, H, 0.02, 0.01, 2), bodyMat, { pos: [0, by, -D / 2 + 0.01] });
  // control block (solid) on the right
  part(root, rboxB(panelW + 0.004, H, D, 0.012, 3), bodyMat, { pos: [W / 2 - panelW / 2 - 0.002, by, 0] });
  // rounded outer cover hint: coral side stripe
  part(root, rbox(0.004, 0.03, D - 0.04, 0.002, 1), accent, { pos: [x0 - 0.0005, by + H * 0.5, 0] });
  // cavity interior (light enamel)
  const cav = enamel('#f3efe6', 0.5);
  const cw = cavX1 - cavX0, ch = cavY1 - cavY0, cd = cavZ1 - cavZ0;
  part(root, new THREE.PlaneGeometry(cw, ch), cav, { pos: [(cavX0 + cavX1) / 2, (cavY0 + cavY1) / 2, cavZ0], cast: false });
  part(root, new THREE.PlaneGeometry(cw, cd).rotateX(-Math.PI / 2), cav, { pos: [(cavX0 + cavX1) / 2, cavY0, (cavZ0 + cavZ1) / 2], cast: false });
  part(root, new THREE.PlaneGeometry(cw, cd).rotateX(Math.PI / 2), cav, { pos: [(cavX0 + cavX1) / 2, cavY1, (cavZ0 + cavZ1) / 2], cast: false });
  part(root, new THREE.PlaneGeometry(cd, ch).rotateY(Math.PI / 2), cav, { pos: [cavX0, (cavY0 + cavY1) / 2, (cavZ0 + cavZ1) / 2], cast: false });
  part(root, new THREE.PlaneGeometry(cd, ch).rotateY(-Math.PI / 2), cav, { pos: [cavX1, (cavY0 + cavY1) / 2, (cavZ0 + cavZ1) / 2], cast: false });
  // vent slots on the right inner wall
  for (let i = 0; i < 5; i++) part(root, rbox(0.002, 0.008, 0.05, 0.002, 1), enamel('#d9d2c4', 0.5), { pos: [cavX1 - 0.001, cavY1 - 0.04 - i * 0.016, cavZ0 + 0.08] });
  // turntable
  const plateY = cavY0 + 0.016;
  const plateR = Math.min(cw, cd) / 2 - 0.018;
  const pc = new THREE.Vector3((cavX0 + cavX1) / 2, 0, (cavZ0 + cavZ1) / 2);
  part(root, new THREE.TorusGeometry(plateR * 0.55, 0.004, 6, 32).rotateX(Math.PI / 2), enamel('#c9c2b6', 0.5), { pos: [pc.x, cavY0 + 0.006, pc.z], cast: false });
  const plate = dynamic(grp(root, [pc.x, plateY, pc.z], 'turntable'));
  part(plate, lathe(fillet([[0, 0], [plateR - 0.012, 0, 0.01], [plateR, 0.012, 0.004], [plateR - 0.004, 0.014], [plateR - 0.012, 0.004, 0.006], [0, 0.004]], 4), 56), glass('#eaf6ff', 0.55), { cast: false, order: 2 });
  // interior light (opacity animated)
  const light = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.004, ch - 0.004, cd - 0.004), glowMat('#ffc457', { side: THREE.BackSide }));
  light.position.set((cavX0 + cavX1) / 2, (cavY0 + cavY1) / 2, (cavZ0 + cavZ1) / 2);
  light.name = 'microwaveLight';
  light.renderOrder = 2;
  root.add(dynamic(light));

  // door: pivot on the left front edge
  const door = dynamic(grp(root, [x0, by, D / 2], 'microwaveDoor'));
  const dW = doorW, dH = H, dT = 0.03;
  const frame = roundedRectShape(dW, dH, 0.024, dW / 2, dH / 2);
  const winW = dW - 0.09, winH = dH - 0.085;
  frame.holes.push(roundedRectPath(winW, winH, 0.018, dW / 2 - 0.012, dH / 2));
  part(door, softExtrude(frame, dT, 0.008, { curveSegs: 8 }), lacquer(PALETTE.cabinet, 0.38));
  // window: dotted screen with dark tint (lets the light glow through)
  const screenTex = canvasTex(
    'mwScreen',
    128,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      for (let y = 4; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) {
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { wrap: true, srgb: false },
  );
  const screen = screenTex.clone();
  screen.repeat.set(6, 4);
  screen.needsUpdate = true;
  // light enough to watch the food turn (the dotted screen and the interior glow do the rest)
  const winMat = new THREE.MeshStandardMaterial({ color: '#2a2a33', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  part(door, new THREE.ShapeGeometry(roundedRectShape(winW + 0.006, winH + 0.006, 0.02, dW / 2 - 0.012, dH / 2), 8), winMat, { pos: [0, 0, dT * 0.5], cast: false, order: 4 });
  const dotsMat = new THREE.MeshStandardMaterial({ color: '#111114', roughness: 0.5, alphaMap: screen, alphaTest: 0.5, side: THREE.DoubleSide });
  part(door, new THREE.ShapeGeometry(roundedRectShape(winW + 0.006, winH + 0.006, 0.02, dW / 2 - 0.012, dH / 2), 8), dotsMat, { pos: [0, 0, dT * 0.45], cast: false });
  // chrome pull handle on the right edge of the door
  part(door, new THREE.CapsuleGeometry(0.009, dH * 0.6, 6, 12), chrome(), { pos: [dW - 0.03, dH / 2, dT + 0.03] });
  for (const y of [-1, 1]) part(door, cylB(0.006, 0.007, 0.03, 10).rotateX(Math.PI / 2), chrome(), { pos: [dW - 0.03, dH / 2 + y * dH * 0.27, dT] });

  // control panel face
  const px = W / 2 - panelW / 2 - 0.002;
  const pz = D / 2;
  part(root, rbox(panelW - 0.024, H - 0.04, 0.008, 0.012, 3), accent, { pos: [px, by + H / 2, pz + 0.002] });
  // display
  const dispCanvasW = 128, dispCanvasH = 56;
  let dispText = ':)';
  const dispTex = makeCanvasTexture(dispCanvasW, dispCanvasH, (ctx, w, h) => drawDisplay(ctx, w, h, dispText), { mipmaps: false });
  const dispMat = new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false });
  part(root, rbox(panelW - 0.05, 0.05, 0.006, 0.006, 2), enamel('#2b2626', 0.4), { pos: [px, by + H - 0.06, pz + 0.006] });
  part(root, new THREE.PlaneGeometry(panelW - 0.058, 0.042), dispMat, { pos: [px, by + H - 0.06, pz + 0.0095], cast: false });
  // dial
  const dial = grp(root, [px, by + H * 0.5, pz + 0.006]);
  part(dial, lathe(fillet([[0, 0], [0.036, 0], [0.036, 0.006, 0.003], [0.03, 0.009], [0, 0.009]], 3), 36).rotateX(Math.PI / 2), chrome());
  part(dial, puck(0.028, 0.02, 0.008, 32).rotateX(Math.PI / 2), lacquer(PALETTE.cream, 0.35), { pos: [0, 0, 0.004] });
  part(dial, rbox(0.01, 0.042, 0.012, 0.004, 2), lacquer(PALETTE.cream, 0.35), { pos: [0, 0, 0.026] });
  // start button (press along local Z)
  const button = dynamic(grp(root, [px, by + 0.058, pz + 0.006], 'microwaveButton'));
  part(button, puck(0.025, 0.016, 0.007, 32).rotateX(Math.PI / 2), lacquer(PALETTE.cabinet, 0.32));
  const startTex = canvasTex(
    'mwStart',
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h * 0.28);
      ctx.lineTo(w * 0.72, h * 0.5);
      ctx.lineTo(w * 0.38, h * 0.72);
      ctx.closePath();
      ctx.fill();
    },
    {},
  );
  part(button, new THREE.CircleGeometry(0.016, 24), new THREE.MeshBasicMaterial({ map: startTex, transparent: true, toneMapped: false }), { pos: [0, 0, 0.0165], cast: false });
  part(root, new THREE.TorusGeometry(0.028, 0.004, 8, 32), chrome(), { pos: [px, by + 0.058, pz + 0.007] });
  // vents on top
  for (let i = 0; i < 6; i++) part(root, rbox(0.06, 0.003, 0.01, 0.002, 1), enamel('#d8cbb6', 0.5), { pos: [W / 2 - 0.1, by + H + 0.0005, -0.1 + i * 0.022] });
  mergeStatic(root);
  return {
    root,
    door,
    openAngle: 1.75,
    plate,
    plateY: plateY + 0.004,
    plateRadius: plateR - 0.01,
    light,
    button,
    setDisplay(text: string) {
      dispText = text;
      const c = dispTex.image as HTMLCanvasElement | undefined;
      const ctx = c && 'getContext' in c ? (c.getContext('2d') as CanvasRenderingContext2D | null) : null;
      if (ctx) {
        drawDisplay(ctx, dispCanvasW, dispCanvasH, text);
        dispTex.needsUpdate = true;
      }
    },
  };
}
