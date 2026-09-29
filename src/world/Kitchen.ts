import * as THREE from 'three';
import { Builder, Geo } from './Builder';
import { MaterialLib } from './Materials';
import { BACKLINE, BUILD, COUNTER, GRILL, ROOM, WARMER } from './Layout';
import { canvasTexture, FONT_DISPLAY, FONT_BODY } from '../render/CanvasTex';
import { Rng } from '../core/math';

export interface KitchenRefs {
  fryerOil: THREE.Mesh[];
  fryerBaskets: THREE.Object3D[];
  hoodLights: THREE.Vector3[];
  heatLampWarmer: THREE.Vector3;
  dishSteam: THREE.Vector3;
  clockHands: { hour: THREE.Object3D; minute: THREE.Object3D };
  radio: THREE.Vector3;
  ticketRail: { y: number; z: number; x0: number; x1: number };
  grillGlowSlot: THREE.Vector3;
  sinkDrip: THREE.Vector3;
}

const rng = new Rng('kitchen');

/** Backline counter segment with doors/drawers. */
function counterSegment(b: Builder, mats: MaterialLib, x0: number, x1: number, kind: 'doors' | 'drawers' | 'open', topMat?: THREE.Material) {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const z = BACKLINE.z;
  const d = BACKLINE.depth;
  const h = BACKLINE.height;
  b.box(w, h - 0.1, d - 0.05, mats.steel, cx, 0.1 + (h - 0.1) / 2 - 0.02, z - 0.02);
  b.box(w - 0.04, 0.1, d - 0.12, mats.blackPlastic, cx, 0.05, z - 0.05, { cast: false });
  b.tbox(w + 0.02, 0.04, d + 0.04, 1.0, topMat ?? mats.steel, cx, h - 0.02, z);
  // front lip
  b.box(w + 0.02, 0.05, 0.02, mats.steel, cx, h - 0.03, z + d / 2 + 0.01);
  const fz = z + d / 2 - 0.02;
  if (kind === 'doors') {
    const n = Math.max(1, Math.round(w / 0.55));
    const dw = w / n;
    for (let i = 0; i < n; i++) {
      const dx = x0 + dw * (i + 0.5);
      b.box(dw - 0.03, h - 0.24, 0.02, mats.steel, dx, 0.12 + (h - 0.24) / 2 + 0.02, fz + 0.012);
      b.box(0.02, 0.22, 0.03, mats.chrome, dx + (i % 2 ? -1 : 1) * (dw / 2 - 0.07), 0.55, fz + 0.035);
    }
  } else if (kind === 'drawers') {
    const n = Math.max(1, Math.round(w / 0.6));
    const dw = w / n;
    for (let i = 0; i < n; i++) {
      const dx = x0 + dw * (i + 0.5);
      for (let r = 0; r < 2; r++) {
        const dy = 0.3 + r * 0.33;
        b.box(dw - 0.03, 0.3, 0.02, mats.steel, dx, dy, fz + 0.012);
        b.box(dw * 0.6, 0.025, 0.035, mats.chrome, dx, dy + 0.1, fz + 0.035);
      }
    }
  }
}

export function buildKitchen(root: THREE.Object3D, mats: MaterialLib): KitchenRefs {
  const b = new Builder(root);
  const refs: KitchenRefs = {
    fryerOil: [],
    fryerBaskets: [],
    hoodLights: [],
    heatLampWarmer: new THREE.Vector3(WARMER.center.x, 1.75, WARMER.center.z),
    dishSteam: new THREE.Vector3(3.55, 1.2, -5.6),
    clockHands: { hour: new THREE.Object3D(), minute: new THREE.Object3D() },
    radio: new THREE.Vector3(5.2, 1.7, -6.0),
    ticketRail: { y: 1.62, z: -5.32, x0: -1.35, x1: 1.0 },
    grillGlowSlot: GRILL.center.clone(),
    sinkDrip: new THREE.Vector3(2.35, 1.1, -5.95),
  };
  const z = BACKLINE.z;
  const h = BACKLINE.height;

  // ------------------------------------------------------------ reach-in fridge
  {
    const fx = -6.45;
    const fw = 0.95;
    b.box(fw, 2.05, 0.8, mats.steel, fx, 1.025, -5.85);
    b.box(fw - 0.06, 1.9, 0.03, mats.steelDark, fx, 1.05, -5.44);
    const glass = b.box(fw - 0.2, 1.3, 0.01, mats.glass, fx, 1.2, -5.42, { cast: false, receive: false, dynamic: true });
    glass.renderOrder = 5;
    b.box(0.03, 0.6, 0.04, mats.chrome, fx + fw / 2 - 0.1, 1.15, -5.4);
    // interior light + shelves with containers
    b.box(fw - 0.22, 1.28, 0.02, mats.emissive(0xdff3ff, 0.35, 'fridge'), fx, 1.2, -5.8, { cast: false });
    for (let s = 0; s < 3; s++) {
      const sy = 0.7 + s * 0.42;
      b.box(fw - 0.22, 0.015, 0.34, mats.chrome, fx, sy, -5.62, { cast: false });
      for (let i = 0; i < 4; i++) {
        const c = [0xd84a3a, 0x6fb54b, 0xf2c14e, 0xe8e2d0][(s + i) % 4];
        b.rbox(0.16, 0.14, 0.2, 0.02, mats.std(c, 0.35, 0, { transparent: false }), fx - 0.28 + i * 0.185, sy + 0.08, -5.62);
      }
    }
    b.box(fw, 0.06, 0.8, mats.blackPlastic, fx, 2.08, -5.85);
    const logo = canvasTexture(256, 64, (ctx, w, hh) => {
      ctx.fillStyle = '#1b1b1d';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#9fe3ff';
      ctx.font = `700 36px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FROSTLINE', w / 2, hh / 2 + 2);
    });
    b.mesh(Geo.plane(0.6, 0.15), new THREE.MeshStandardMaterial({ map: logo, emissive: 0xffffff, emissiveMap: logo, emissiveIntensity: 0.6 }), fx, 1.95, -5.42, { cast: false });
  }

  // ------------------------------------------------------------ backline counters
  counterSegment(b, mats, -5.95, -3.82, 'drawers');
  // grill cabinet
  const gx0 = GRILL.center.x - GRILL.width / 2 - 0.06;
  const gx1 = GRILL.center.x + GRILL.width / 2 + 0.06;
  {
    const gw = gx1 - gx0;
    const gcx = GRILL.center.x;
    b.box(gw, 0.74, 0.82, mats.steelDark, gcx, 0.37 + 0.06, z);
    b.box(gw - 0.04, 0.06, 0.7, mats.blackPlastic, gcx, 0.03, z, { cast: false });
    // control panel (angled strip with knobs)
    b.box(gw, 0.14, 0.06, mats.steel, gcx, 0.83, z + 0.42, { rx: -0.25 });
    for (let i = 0; i < 5; i++) {
      const kx = gcx - gw / 2 + 0.16 + i * ((gw - 0.32) / 4);
      b.cyl(0.028, 0.03, 0.035, mats.blackPlastic, kx, 0.83, z + 0.47, { rx: Math.PI / 2 - 0.25, seg: 16 });
      b.box(0.006, 0.03, 0.01, mats.std(0xd32f2f, 0.4), kx, 0.845, z + 0.487, { rx: -0.25 });
    }
    // grease trough at the front of the grill
    b.box(gw - 0.1, 0.035, 0.07, mats.steel, gcx, GRILL.center.y - 0.04, GRILL.center.z + GRILL.depth / 2 + 0.06);
    // side + back guards
    b.box(0.03, 0.18, GRILL.depth + 0.12, mats.steel, gx0 + 0.015, GRILL.center.y + 0.05, GRILL.center.z);
    b.box(0.03, 0.18, GRILL.depth + 0.12, mats.steel, gx1 - 0.015, GRILL.center.y + 0.05, GRILL.center.z);
    b.box(gw, 0.34, 0.03, mats.steel, gcx, GRILL.center.y + 0.13, GRILL.center.z - GRILL.depth / 2 - 0.05);
    // firebox walls (dark, below grates)
    b.box(gw - 0.06, 0.12, GRILL.depth, mats.std(0x151312, 0.9), gcx, GRILL.center.y - 0.1, GRILL.center.z, { cast: false });
    // cast iron grates: bars running front-to-back
    const barCount = 30;
    for (let i = 0; i < barCount; i++) {
      const bx = GRILL.center.x - GRILL.width / 2 + 0.02 + (i * (GRILL.width - 0.04)) / (barCount - 1);
      b.box(0.022, 0.03, GRILL.depth, mats.castIron, bx, GRILL.center.y - 0.015, GRILL.center.z, { cast: false });
    }
    for (const zz of [-1, 0, 1]) b.box(GRILL.width, 0.025, 0.02, mats.castIron, GRILL.center.x, GRILL.center.y - 0.04, GRILL.center.z + zz * GRILL.depth * 0.45, { cast: false });
    const brand = canvasTexture(256, 48, (ctx, w, hh) => {
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#ffb347';
      ctx.font = `700 30px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BLAZEMASTER 3000', w / 2, hh / 2 + 2);
    });
    b.mesh(Geo.plane(0.5, 0.094), new THREE.MeshStandardMaterial({ map: brand, roughness: 0.4, metalness: 0.3 }), gcx, 0.62, z + 0.412, { cast: false });
  }
  // warming station counter
  counterSegment(b, mats, gx1 + 0.02, WARMER.center.x + WARMER.width / 2 + 0.08, 'doors');
  // build station counter with butcher block inlay
  const bx0 = WARMER.center.x + WARMER.width / 2 + 0.1;
  const bx1 = 1.02;
  counterSegment(b, mats, bx0, bx1, 'drawers');
  b.tbox(1.0, 0.03, 0.46, 0.63, mats.butcherBlock, BUILD.center.x, h + 0.001, BUILD.center.z + 0.02, { receive: true });
  // cold rail riser behind the assembly area (bins sit in it)
  b.box(bx1 - bx0, 0.1, 0.34, mats.steel, (bx0 + bx1) / 2, h + 0.05, -5.97);
  b.box(bx1 - bx0, 0.012, 0.3, mats.std(0xcfe8f2, 0.2, 0, { transparent: true, opacity: 0.85 }), (bx0 + bx1) / 2, h + 0.098, -5.97, { cast: false });

  // fryer
  {
    const fx = 1.42;
    b.box(0.7, h + 0.04, 0.82, mats.steel, fx, (h + 0.04) / 2, z);
    for (const s of [-1, 1]) {
      const ox = fx + s * 0.16;
      b.box(0.28, 0.02, 0.4, mats.std(0x1a1614, 0.8), ox, h + 0.03, z - 0.02, { cast: false });
      const oil = b.box(0.26, 0.004, 0.38, mats.phys('fryerOil', { color: 0xb07418, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }), ox, h + 0.02, z - 0.02, {
        cast: false,
        dynamic: true,
      });
      refs.fryerOil.push(oil);
      const basket = new THREE.Group();
      basket.position.set(ox, h + 0.18, z + 0.02);
      basket.rotation.x = -0.35;
      basket.userData.dynamic = true;
      root.add(basket);
      const bb = b.at(basket);
      const wire = mats.chrome;
      bb.box(0.24, 0.12, 0.005, wire, 0, 0, 0.17, { dynamic: true });
      bb.box(0.24, 0.12, 0.005, wire, 0, 0, -0.17, { dynamic: true });
      bb.box(0.005, 0.12, 0.34, wire, 0.12, 0, 0, { dynamic: true });
      bb.box(0.005, 0.12, 0.34, wire, -0.12, 0, 0, { dynamic: true });
      bb.cyl(0.012, 0.012, 0.3, mats.blackPlastic, 0, 0.05, 0.3, { rx: Math.PI / 2 - 0.4, dynamic: true, seg: 8 });
      // golden fries in the basket
      const fry = mats.std(0xe8b14a, 0.55);
      for (let i = 0; i < 26; i++) {
        bb.box(0.012, 0.012, rng.range(0.06, 0.1), fry, rng.range(-0.1, 0.1), rng.range(-0.04, 0.04), rng.range(-0.13, 0.13), {
          rx: rng.range(-0.6, 0.6),
          ry: rng.range(-1.5, 1.5),
          dynamic: true,
          cast: false,
        });
      }
      refs.fryerBaskets.push(basket);
    }
  }
  // prep sink
  {
    const sx = 2.35;
    counterSegment(b, mats, 1.8, 2.9, 'doors');
    b.box(0.62, 0.05, 0.46, mats.std(0x2b2e31, 0.2, 1), sx, h - 0.02, z, { cast: false });
    b.box(0.58, 0.2, 0.42, mats.steelDark, sx, h - 0.12, z, { cast: false });
    // faucet
    b.cyl(0.018, 0.022, 0.32, mats.chrome, sx, h + 0.16, -6.08, { seg: 12 });
    b.mesh(Geo.torus(0.12, 0.016, 8, 20, Math.PI), mats.chrome, sx, h + 0.32, -5.96, { ry: Math.PI / 2 });
    b.cyl(0.012, 0.012, 0.06, mats.chrome, sx, h + 0.29, -5.84, { seg: 10 });
    b.cyl(0.016, 0.016, 0.08, mats.std(0xd33a2c, 0.4), sx - 0.1, h + 0.08, -6.1, { seg: 10 });
    b.cyl(0.016, 0.016, 0.08, mats.std(0x2c6ed3, 0.4), sx + 0.1, h + 0.08, -6.1, { seg: 10 });
    // dish soap + sponge
    b.rbox(0.06, 0.16, 0.05, 0.02, mats.std(0x3fbf6a, 0.25), sx + 0.4, h + 0.08, -6.0);
    b.rbox(0.09, 0.03, 0.06, 0.01, mats.std(0xf2d24a, 0.9), sx + 0.36, h + 0.015, -5.82);
  }
  // dishwasher + dish rack
  {
    const dx = 3.55;
    b.box(0.72, 1.45, 0.78, mats.steel, dx, 0.725, z);
    b.box(0.6, 0.02, 0.7, mats.chrome, dx, 1.46, z, { cast: false });
    b.box(0.08, 0.02, 0.1, mats.std(0x33ff66, 0.3, 0, { emissive: 0x33ff66, emissiveIntensity: 1.5 }), dx + 0.25, 1.3, z + 0.4, { cast: false });
    // stacks of plates
    const plate = mats.std(0xf6f4ee, 0.2);
    for (let i = 0; i < 12; i++) b.cyl(0.13, 0.11, 0.012, plate, dx - 0.18, 1.48 + i * 0.014, z + 0.05, { seg: 28 });
    for (let i = 0; i < 8; i++) b.cyl(0.11, 0.09, 0.012, plate, dx + 0.18, 1.48 + i * 0.014, z - 0.05, { seg: 28 });
  }
  // storage shelving right side
  for (let s = 0; s < 4; s++) {
    const sy = 0.25 + s * 0.52;
    b.box(1.6, 0.025, 0.5, mats.chrome, 5.2, sy, -5.95);
  }
  for (const px of [4.42, 5.98]) for (const pz of [-6.18, -5.72]) b.cyl(0.012, 0.012, 1.9, mats.chrome, px, 0.95, pz, { seg: 8 });
  const boxColors = [0xb98b58, 0xa87c4c, 0xc49a63];
  for (let s = 0; s < 3; s++) {
    let cx = 4.55;
    while (cx < 5.85) {
      const w = rng.range(0.22, 0.42);
      if (cx + w > 5.9) break;
      const hh = rng.range(0.18, 0.36);
      if (rng.chance(0.75)) {
        b.tbox(w, hh, 0.38, 0.5, mats.cardboard, cx + w / 2, 0.265 + s * 0.52 + hh / 2, -5.95, { ry: rng.range(-0.05, 0.05) });
        // tape strip
        b.box(w * 0.2, 0.002, 0.385, mats.std(0xd8c49a, 0.4), cx + w / 2, 0.265 + s * 0.52 + hh + 0.001, -5.95, { cast: false });
      } else {
        // cans
        for (let k = 0; k < 3; k++) b.cyl(0.05, 0.05, 0.15, mats.std(boxColors[k % 3] === 0xb98b58 ? 0xc94432 : 0x3a8bd1, 0.35, 0.6), cx + 0.06 + k * 0.11, 0.265 + s * 0.52 + 0.075, -5.95, { seg: 16 });
      }
      cx += w + 0.04;
    }
  }
  // radio on top shelf
  b.rbox(0.3, 0.16, 0.12, 0.03, mats.std(0x2f6fae, 0.4), 5.2, 1.87 + 0.08, -6.0);
  b.cyl(0.045, 0.045, 0.01, mats.std(0x222222, 0.8), 5.12, 1.95, -5.935, { rx: Math.PI / 2, seg: 20 });
  b.cyl(0.004, 0.004, 0.3, mats.chrome, 5.3, 2.1, -6.0, { rz: 0.4, seg: 6 });
  refs.radio.set(5.2, 1.95, -6.0);

  // mop bucket + trash
  b.cyl(0.18, 0.15, 0.3, mats.std(0xf2c230, 0.5), 6.4, 0.15, -2.2, { seg: 20 });
  b.cyl(0.012, 0.012, 1.3, mats.std(0x8a6a44, 0.6), 6.35, 0.8, -2.25, { rz: 0.15, seg: 8 });
  b.cyl(0.24, 0.22, 0.72, mats.std(0x3a4a58, 0.6), 6.45, 0.36, -2.9, { seg: 20 });
  b.cyl(0.25, 0.25, 0.04, mats.std(0x2e3a45, 0.6), 6.45, 0.74, -2.9, { seg: 20 });
  // wet floor sign
  {
    const sg = b.group(5.7, 0, -2.2, 0.5);
    const sb = b.at(sg);
    const signTex = canvasTexture(128, 256, (ctx, w, hh) => {
      ctx.fillStyle = '#ffd21f';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#1b1b1b';
      ctx.font = `800 28px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('CAUTION', w / 2, 60);
      ctx.font = `700 20px ${FONT_BODY}`;
      ctx.fillText('WET FLOOR', w / 2, 200);
      ctx.beginPath();
      ctx.moveTo(w / 2, 90);
      ctx.lineTo(w / 2 + 34, 160);
      ctx.lineTo(w / 2 - 34, 160);
      ctx.closePath();
      ctx.lineWidth = 6;
      ctx.stroke();
    });
    const sm = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 });
    sb.box(0.3, 0.6, 0.01, sm, 0, 0.3, 0.1, { rx: -0.17 });
    sb.box(0.3, 0.6, 0.01, sm, 0, 0.3, -0.1, { rx: 0.17, ry: Math.PI });
  }

  // ------------------------------------------------------------ hood over the grill
  {
    const hx0 = -3.95;
    const hx1 = -2.05;
    const hw = hx1 - hx0;
    const hcx = (hx0 + hx1) / 2;
    b.box(hw, 0.5, 1.0, mats.steel, hcx, 2.45, ROOM.minZ + 0.5);
    b.box(hw + 0.04, 0.06, 0.06, mats.steel, hcx, 2.2, ROOM.minZ + 1.0);
    b.box(hw - 0.1, 0.02, 0.8, mats.steelDark, hcx, 2.19, ROOM.minZ + 0.48, { cast: false });
    // baffle filters
    for (let i = 0; i < 4; i++) b.box(hw / 4 - 0.04, 0.35, 0.02, mats.std(0x8f9296, 0.35, 1), hx0 + (hw / 4) * (i + 0.5), 2.34, ROOM.minZ + 0.12, { rx: -0.5, cast: false });
    for (const lx of [hcx - 0.45, hcx + 0.45]) {
      b.box(0.3, 0.012, 0.12, mats.emissive(0xfff1d6, 3.0, 'hoodLight'), lx, 2.178, ROOM.minZ + 0.7, { cast: false });
      refs.hoodLights.push(new THREE.Vector3(lx, 2.12, ROOM.minZ + 0.72));
    }
    // duct up to ceiling
    b.box(0.8, ROOM.height - 2.7, 0.6, mats.steel, hcx, 2.7 + (ROOM.height - 2.7) / 2, ROOM.minZ + 0.35);
  }
  // fryer hood
  b.box(0.9, 0.4, 0.9, mats.steel, 1.42, 2.5, ROOM.minZ + 0.45);
  b.box(0.3, 0.012, 0.12, mats.emissive(0xfff1d6, 3.0, 'hoodLight'), 1.42, 2.29, ROOM.minZ + 0.7, { cast: false });

  // ------------------------------------------------------------ utensil rail + shelves above build
  {
    const railY = 1.95;
    b.cyl(0.01, 0.01, 1.6, mats.chrome, -2.9, railY, ROOM.minZ + 0.05, { rz: Math.PI / 2, seg: 8 });
    // (rail sits under the hood, visible behind the grill)
    const tools = [
      () => {
        const g = new THREE.Group();
        const gb = b.at(g);
        gb.box(0.012, 0.22, 0.012, mats.blackPlastic, 0, -0.16, 0, { dynamic: true });
        gb.box(0.09, 0.11, 0.004, mats.chrome, 0, -0.32, 0, { dynamic: true });
        return g;
      },
      () => {
        const g = new THREE.Group();
        const gb = b.at(g);
        gb.box(0.01, 0.3, 0.01, mats.chrome, -0.012, -0.18, 0, { rz: 0.05, dynamic: true });
        gb.box(0.01, 0.3, 0.01, mats.chrome, 0.012, -0.18, 0, { rz: -0.05, dynamic: true });
        return g;
      },
      () => {
        const g = new THREE.Group();
        const gb = b.at(g);
        gb.box(0.012, 0.2, 0.012, mats.chrome, 0, -0.12, 0, { dynamic: true });
        gb.mesh(Geo.sphere(0.045, 14, 10), mats.chrome, 0, -0.26, 0, { sy: 0.6, dynamic: true });
        return g;
      },
      () => {
        const g = new THREE.Group();
        const gb = b.at(g);
        gb.box(0.012, 0.14, 0.012, mats.std(0x6b4526, 0.6), 0, -0.1, 0, { dynamic: true });
        for (let i = 0; i < 6; i++) gb.mesh(Geo.torus(0.03, 0.002, 4, 16), mats.chrome, 0, -0.22, 0, { ry: (i / 6) * Math.PI, sy: 1.8, dynamic: true });
        return g;
      },
    ];
    for (let i = 0; i < 6; i++) {
      const t = tools[i % tools.length]();
      t.position.set(-3.55 + i * 0.26, railY, ROOM.minZ + 0.06);
      t.rotation.z = rng.range(-0.05, 0.05);
      root.add(t);
      b.mesh(Geo.torus(0.012, 0.002, 4, 12), mats.chrome, -3.55 + i * 0.26, railY - 0.012, ROOM.minZ + 0.06, { dynamic: true });
    }
  }
  // shelf above build station with spice jars & containers
  {
    const sx0 = -1.4;
    const sx1 = 1.0;
    const sy = 1.95;
    b.box(sx1 - sx0, 0.03, 0.34, mats.steel, (sx0 + sx1) / 2, sy, ROOM.minZ + 0.17);
    for (const bx of [sx0 + 0.1, sx1 - 0.1]) b.box(0.03, 0.2, 0.3, mats.steel, bx, sy - 0.1, ROOM.minZ + 0.16);
    const jarCols = [0xb3401f, 0x3d7a2e, 0xd9a31f, 0x7a3a1f, 0xe8dcc0, 0x5a2d1a];
    for (let i = 0; i < 11; i++) {
      const jx = sx0 + 0.18 + i * 0.19;
      const jh = rng.range(0.12, 0.18);
      b.cyl(0.04, 0.04, jh, mats.phys('jarGlass', { color: 0xffffff, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.35 }), jx, sy + 0.015 + jh / 2, ROOM.minZ + 0.15, { seg: 16, cast: false, dynamic: true });
      b.cyl(0.036, 0.036, jh * 0.7, mats.std(jarCols[i % jarCols.length], 0.9), jx, sy + 0.015 + (jh * 0.7) / 2, ROOM.minZ + 0.15, { seg: 12 });
      b.cyl(0.042, 0.042, 0.025, mats.std(0x1f1f22, 0.4), jx, sy + 0.015 + jh + 0.012, ROOM.minZ + 0.15, { seg: 16 });
    }
    // ticket rail (order wheel bar) along the shelf front
    const r = refs.ticketRail;
    r.y = sy - 0.06;
    r.z = ROOM.minZ + 0.36;
    r.x0 = sx0 + 0.05;
    r.x1 = sx1 - 0.05;
    b.box(r.x1 - r.x0, 0.03, 0.03, mats.chrome, (r.x0 + r.x1) / 2, r.y, r.z);
    b.box(r.x1 - r.x0, 0.008, 0.02, mats.std(0x111111, 0.4), (r.x0 + r.x1) / 2, r.y - 0.018, r.z + 0.005, { cast: false });
  }
  // heat lamp over warmer
  {
    const lx = WARMER.center.x;
    b.box(0.72, 0.06, 0.26, mats.steel, lx, 1.78, WARMER.center.z - 0.02);
    b.box(0.62, 0.015, 0.14, mats.emissive(0xff4a1c, 2.5, 'heatLamp'), lx, 1.748, WARMER.center.z - 0.02, { cast: false });
    b.cyl(0.012, 0.012, 1.5, mats.chrome, lx - 0.3, 2.55, WARMER.center.z - 0.02, { seg: 8 });
    b.cyl(0.012, 0.012, 1.5, mats.chrome, lx + 0.3, 2.55, WARMER.center.z - 0.02, { seg: 8 });
  }

  // ------------------------------------------------------------ left wall: walk-in cooler + dry storage
  {
    const wx = ROOM.minX + 0.02;
    b.box(0.08, 2.2, 1.2, mats.steel, wx + 0.04, 1.1, -3.2);
    b.box(0.06, 0.08, 0.3, mats.chrome, wx + 0.11, 1.1, -2.75);
    b.box(0.05, 2.3, 0.06, mats.steelDark, wx + 0.05, 1.15, -2.57);
    b.box(0.05, 2.3, 0.06, mats.steelDark, wx + 0.05, 1.15, -3.83);
    const wiTex = canvasTexture(256, 96, (ctx, w, hh) => {
      ctx.fillStyle = '#123a5a';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#e8f6ff';
      ctx.font = `700 40px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('WALK-IN', w / 2, hh / 2 - 8);
      ctx.font = `600 22px ${FONT_BODY}`;
      ctx.fillText('KEEP CLOSED  •  34°F', w / 2, hh / 2 + 26);
    });
    b.mesh(Geo.plane(0.5, 0.19), new THREE.MeshStandardMaterial({ map: wiTex, roughness: 0.5 }), wx + 0.09, 1.7, -3.2, { ry: Math.PI / 2, cast: false });
    // bun rack with bags
    const rx = ROOM.minX + 0.4;
    for (let s = 0; s < 5; s++) b.box(0.55, 0.02, 0.62, mats.chrome, rx, 0.2 + s * 0.38, -1.95);
    for (const pz of [-2.24, -1.66]) for (const px of [rx - 0.25, rx + 0.25]) b.cyl(0.012, 0.012, 1.8, mats.chrome, px, 0.9, pz, { seg: 8 });
    const bag = mats.phys('bunBag', { color: 0xf3e0b8, roughness: 0.3, transparent: true, opacity: 0.92, clearcoat: 0.6 });
    for (let s = 0; s < 4; s++) for (let k = 0; k < 2; k++) {
      b.rbox(0.22, 0.12, 0.5, 0.05, bag, rx - 0.13 + k * 0.26, 0.28 + s * 0.38, -1.95);
      b.box(0.02, 0.02, 0.06, mats.std(0x2a7de1, 0.5), rx - 0.13 + k * 0.26, 0.28 + s * 0.38, -1.7);
    }
    // flour/onion sacks on the floor
    const sack = mats.get('sack', () => new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 1, normalMap: mats.fabric.normalMap ?? null }));
    for (let i = 0; i < 3; i++) b.mesh(Geo.capsule(0.18, 0.3, 4, 10), sack, ROOM.minX + 0.35, 0.2, -4.5 - i * 0.45, { rz: Math.PI / 2, sy: 0.85, sz: 0.9 });
  }

  // ------------------------------------------------------------ central prep island
  {
    const ix = -1.4;
    const iz = -3.35;
    const iw = 2.4;
    b.tbox(iw, 0.04, 0.8, 1.0, mats.steel, ix, 0.9, iz);
    b.box(iw - 0.05, 0.02, 0.72, mats.steel, ix, 0.25, iz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.02, 0.02, 0.9, mats.chrome, ix + sx * (iw / 2 - 0.06), 0.45, iz + sz * 0.34, { seg: 8 });
    // cutting board, knife, veg
    b.tbox(0.5, 0.025, 0.34, 0.63, mats.butcherBlock, ix - 0.3, 0.935, iz + 0.05);
    b.box(0.2, 0.004, 0.035, mats.chrome, ix - 0.25, 0.952, iz + 0.12, { ry: 0.3 });
    b.box(0.1, 0.018, 0.024, mats.blackPlastic, ix - 0.38, 0.955, iz + 0.165, { ry: 0.3 });
    const tomato = mats.phys('tomatoWhole', { color: 0xd8341f, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    for (let i = 0; i < 5; i++) b.sphere(0.045, tomato, ix + 0.25 + (i % 3) * 0.09, 0.955, iz - 0.1 + Math.floor(i / 3) * 0.09, { sy: 0.85 });
    const lettuceHead = mats.std(0x7cbf4a, 0.55);
    b.mesh(Geo.sphere(0.1, 20, 14), lettuceHead, ix + 0.72, 0.99, iz + 0.05, { sy: 0.85 });
    const onion = mats.phys('onionWhole', { color: 0xc98e4a, roughness: 0.4, clearcoat: 0.3 });
    for (let i = 0; i < 3; i++) b.sphere(0.042, onion, ix + 0.5 + i * 0.08, 0.95, iz + 0.2, { sy: 0.9 });
    // stainless bowl
    b.mesh(Geo.lathe('bowl', [[0, 0], [0.06, 0], [0.14, 0.05], [0.16, 0.09], [0.155, 0.09], [0.13, 0.05], [0.055, 0.006], [0, 0.006]], 28), mats.chrome, ix + 0.95, 0.92, iz - 0.15);
  }

  // ------------------------------------------------------------ wall clock above the warmer
  {
    const cx = -1.72;
    const cy = 2.42;
    const cz = ROOM.minZ + 0.03;
    const face = canvasTexture(256, 256, (ctx, w, hh) => {
      ctx.fillStyle = '#fbf7ee';
      ctx.beginPath();
      ctx.arc(w / 2, hh / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.save();
        ctx.translate(w / 2 + Math.sin(a) * 104, hh / 2 - Math.cos(a) * 104);
        ctx.rotate(a);
        ctx.fillRect(-3, -8, 6, i % 3 === 0 ? 22 : 12);
        ctx.restore();
      }
      ctx.fillStyle = '#c4262e';
      ctx.font = `700 24px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('S&S', w / 2, hh / 2 + 56);
    });
    b.mesh(new THREE.CircleGeometry(0.17, 40), new THREE.MeshStandardMaterial({ map: face, roughness: 0.35 }), cx, cy, cz, { cast: false });
    b.mesh(Geo.torus(0.175, 0.016, 8, 40), mats.std(0xc4262e, 0.4), cx, cy, cz);
    const hands = new THREE.Group();
    hands.position.set(cx, cy, cz + 0.006);
    hands.userData.dynamic = true;
    root.add(hands);
    const hour = new THREE.Group();
    const minute = new THREE.Group();
    hands.add(hour, minute);
    const hm = new THREE.Mesh(Geo.box(0.014, 0.085, 0.004), mats.std(0x1b1b1b, 0.5));
    hm.position.y = 0.038;
    hour.add(hm);
    const mm = new THREE.Mesh(Geo.box(0.009, 0.13, 0.004), mats.std(0x1b1b1b, 0.5));
    mm.position.set(0, 0.06, 0.004);
    minute.add(mm);
    const pin = new THREE.Mesh(Geo.cyl(0.012, 0.012, 0.012, 12), mats.std(0xc4262e, 0.4));
    pin.rotation.x = Math.PI / 2;
    pin.position.z = 0.008;
    hands.add(pin);
    refs.clockHands = { hour, minute };
  }

  // ------------------------------------------------------------ signage
  {
    const wash = canvasTexture(256, 180, (ctx, w, hh) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#1d5fb8';
      ctx.fillRect(0, 0, w, 40);
      ctx.fillStyle = '#fff';
      ctx.font = `700 24px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('NOTICE', w / 2, 28);
      ctx.fillStyle = '#1b1b1b';
      ctx.font = `700 26px ${FONT_BODY}`;
      ctx.fillText('EMPLOYEES MUST', w / 2, 90);
      ctx.fillText('WASH HANDS', w / 2, 124);
      ctx.font = `600 18px ${FONT_BODY}`;
      ctx.fillText('before returning to work', w / 2, 158);
    });
    b.mesh(Geo.plane(0.36, 0.25), new THREE.MeshStandardMaterial({ map: wash, roughness: 0.6 }), 2.35, 1.55, ROOM.minZ + 0.012, { cast: false });
    // fire extinguisher
    b.cyl(0.07, 0.07, 0.42, mats.std(0xc81e1e, 0.35, 0.2), 0.75 + 3.45, 0.55, ROOM.minZ + 0.1, { seg: 16 });
    b.sphere(0.07, mats.std(0xc81e1e, 0.35, 0.2), 4.2, 0.76, ROOM.minZ + 0.1, { sy: 0.5 });
    b.box(0.05, 0.08, 0.05, mats.blackPlastic, 4.2, 0.82, ROOM.minZ + 0.1);
    // order-up bell on pass shelf (kitchen side)
  }

  // ------------------------------------------------------------ kitchen ceiling panels (fluorescent)
  for (const lx of [-4.5, -1.8, 1.0, 3.8]) {
    b.box(1.2, 0.05, 0.3, mats.std(0xeeeeee, 0.5), lx, ROOM.height - 0.025, -3.6);
    b.box(1.14, 0.01, 0.24, mats.emissive(0xf4f8ff, 2.2, 'fluoro'), lx, ROOM.height - 0.055, -3.6, { cast: false });
  }
  return refs;
}
