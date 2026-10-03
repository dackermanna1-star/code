// buildKitchen(): assembles the room, the decor and every gameplay prop at the positions in
// layout.ts, and returns the KitchenRefs contract (see props/types.ts).
//
// Hierarchy: kitchen root -> room / counters / fixtures (static, merged) + one root per prop.
// Gameplay props are never merged: stations animate their parts and read world positions.

import * as THREE from 'three';
import type { KitchenRefs, ToolProp } from './props/types';
import { LAYOUT, COUNTER, BACK_WALL_Z } from './layout';
import { PALETTE } from './palette';
import { getSeasoning } from '../food/catalog';
import { buildStove } from './props/stove';
import { buildPan, buildGrillPan, buildPot, buildKettle } from './props/cookware';
import { buildBlender, buildToaster, buildFryer, buildMicrowave } from './props/appliances';
import { buildFridge } from './props/fridge';
import { buildCuttingBoard, buildToolCaddy, buildKnife, buildPeeler, buildRollingPin, buildMasher, buildMixingBowl, buildWhisk } from './props/prep';
import { buildPlate, buildBell, buildTable, buildChair } from './props/dining';
import { buildTrash } from './props/trash';
import { buildBottle } from './props/bottles';
import { mergeStatic } from './props/util';
import { buildRoom, WINDOW } from './decor/room';
import { buildCounters } from './decor/counter';
import { buildFixtures, SHELF_A, SHELF_B, SPICE_RACK_W } from './decor/fixtures';
import { bigPlant, smallPlant, updatePlant, cookbooks, mug, plateStack, cookieJar, napkinHolder, type Plant } from './decor/things';

/** Decorative seasoning bottle placed on a shelf group (local coords), facing +Z. Lower detail. */
function shelfBottle(parent: THREE.Object3D, id: string, x: number, y: number, z: number, yaw = 0, scale = 1) {
  const b = buildBottle(getSeasoning(id), 0.6);
  b.root.position.set(x, y, z);
  b.root.rotation.y = yaw;
  b.root.scale.setScalar(scale);
  parent.add(b.root);
  return b;
}

function place<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x: number, y: number, z: number, yaw = 0, scale = 1): T {
  o.position.set(x, y, z);
  o.rotation.y = yaw;
  o.scale.setScalar(scale);
  parent.add(o);
  return o;
}

export function buildKitchen(): KitchenRefs {
  const root = new THREE.Group();
  root.name = 'kitchen';

  // --- room, counter run, wall fixtures
  const room = buildRoom();
  root.add(room.root);
  const counters = buildCounters();
  root.add(counters.root);
  const fx = buildFixtures();
  root.add(fx.root);

  // --- stove (cooktop flush with the counter) + cookware on the burners
  const sp = LAYOUT.stove.pos;
  const stove = buildStove({ width: LAYOUT.stove.width, depth: LAYOUT.stove.depth, topY: COUNTER.topY, burners: LAYOUT.burners.map((b) => b.clone().sub(sp)) });
  stove.root.position.copy(sp);
  root.add(stove.root);
  const onBurner = (o: THREE.Object3D, i: number) => {
    o.position.copy(LAYOUT.burners[i]);
    root.add(o);
  };
  const pan = buildPan();
  onBurner(pan.root, LAYOUT.pan.burner);
  const grill = buildGrillPan();
  onBurner(grill.root, LAYOUT.grill.burner);
  const pot = buildPot();
  onBurner(pot.root, LAYOUT.pot.burner);
  const kettle = buildKettle();
  onBurner(kettle, LAYOUT.kettle.burner);

  // --- prep: board, tool caddy (+ tools resting in their slots), bowl + whisk
  const board = buildCuttingBoard(LAYOUT.board.size);
  board.root.position.copy(LAYOUT.board.pos);
  root.add(board.root);
  const caddy = buildToolCaddy();
  caddy.root.position.copy(LAYOUT.toolCaddy.pos);
  root.add(caddy.root);
  const tools: Record<'knife' | 'peeler' | 'rollingPin' | 'masher', ToolProp> = {
    knife: buildKnife(),
    peeler: buildPeeler(),
    rollingPin: buildRollingPin(),
    masher: buildMasher(),
  };
  for (const k of Object.keys(tools) as (keyof typeof tools)[]) {
    tools[k].root.position.copy(caddy.slots[k].pos);
    tools[k].root.rotation.copy(caddy.slots[k].rot);
    caddy.root.add(tools[k].root);
  }
  const bowl = buildMixingBowl();
  bowl.root.position.copy(LAYOUT.bowl.pos);
  root.add(bowl.root);
  // whisk resting on the worktop in front of the bowl (handle to the left, head to the right)
  const whisk = buildWhisk();
  whisk.root.position.set(LAYOUT.bowl.pos.x - 0.33, COUNTER.topY, -0.445);
  whisk.root.rotation.y = 0.1;
  root.add(whisk.root);

  // --- countertop appliances + microwave on its wall shelf
  const blender = buildBlender();
  blender.root.position.copy(LAYOUT.blender.pos);
  root.add(blender.root);
  const toaster = buildToaster();
  toaster.root.position.copy(LAYOUT.toaster.pos);
  root.add(toaster.root);
  const fryer = buildFryer();
  fryer.root.position.copy(LAYOUT.fryer.pos);
  root.add(fryer.root);
  const microwave = buildMicrowave();
  microwave.root.position.copy(LAYOUT.microwave.pos);
  root.add(microwave.root);

  // --- fridge (with freezer drawer) and the bin
  const fr = LAYOUT.fridge;
  const fridge = buildFridge(fr.width, fr.depth, fr.height);
  fridge.root.position.copy(fr.pos);
  root.add(fridge.root);
  const trash = buildTrash();
  trash.root.position.copy(LAYOUT.trash.pos);
  root.add(trash.root);

  // --- dining nook: table, Mochi's chair (left free for the character), plate, bell
  const table = buildTable(LAYOUT.table.radius, LAYOUT.table.topY);
  table.position.copy(LAYOUT.table.pos);
  root.add(table);
  const chair = buildChair(LAYOUT.character.pos.y, PALETTE.butter);
  chair.position.copy(LAYOUT.chair.pos);
  chair.rotation.y = LAYOUT.character.yaw;
  root.add(chair);
  const plate = buildPlate();
  plate.root.position.copy(LAYOUT.plate.pos);
  root.add(plate.root);
  const bell = buildBell();
  bell.root.position.copy(LAYOUT.bell.pos);
  root.add(bell.root);

  // --- decor that lives on fixtures (merged per group afterwards)
  const deco = new THREE.Group();
  deco.name = 'decor';
  root.add(deco);
  const plants: Plant[] = [];
  const addPlant = (p: Plant, parent: THREE.Object3D, x: number, y: number, z: number, yaw = 0, scale = 1) => {
    place(parent, p.root, x, y, z, yaw, scale);
    plants.push(p);
    return p;
  };

  // spice rack: shakers & the pepper mill
  const rackIds = ['salt', 'pepper', 'sugar', 'chili-flakes', 'herbs', 'cinnamon'];
  const rz = BACK_WALL_Z + 0.085;
  const step = (SPICE_RACK_W - 0.075) / (rackIds.length - 1);
  rackIds.forEach((id, i) => shelfBottle(fx.spiceRack, id, -SPICE_RACK_W / 2 + 0.0375 + i * step, 0, rz, (i % 2 ? -1 : 1) * 0.12));

  // shelf A (left, above the chalkboard): cookbooks, jars, (gap for the pendant), a trailing pothos
  const aY = SHELF_A.y, aZ = BACK_WALL_Z + SHELF_A.depth / 2;
  place(deco, cookbooks([PALETTE.coral, PALETTE.cabinet, PALETTE.lilac, PALETTE.butter], 2), SHELF_A.x0 + 0.05, aY, aZ);
  shelfBottle(deco, 'tomato-sauce', -1.03, aY, aZ, 0.15, 1.25);
  shelfBottle(deco, 'jam', -0.915, aY, aZ + 0.01, -0.2, 1.3);
  shelfBottle(deco, 'peanut-butter', -0.8, aY, aZ, 0.1, 1.2);
  addPlant(smallPlant('trailing', PALETTE.cabinet, 3, 0.34), deco, -0.2, aY, aZ - 0.02);

  // shelf B (right, above the microwave): oils & sauces, (gap for the pendant), plates, mugs, a succulent
  const bY = SHELF_B.y, bZ = BACK_WALL_Z + SHELF_B.depth / 2;
  shelfBottle(deco, 'olive-oil', 1.12, bY, bZ, 0.1, 1.2);
  shelfBottle(deco, 'soy-sauce', 1.23, bY, bZ + 0.01, -0.1, 1.2);
  shelfBottle(deco, 'honey', 1.34, bY, bZ, 0.2, 1.2);
  shelfBottle(deco, 'lemon-juice', 1.45, bY, bZ + 0.01, -0.3, 1.15);
  place(deco, plateStack(4), 2.08, bY, bZ - 0.01);
  place(deco, mug(PALETTE.coral), 2.24, bY, bZ, -0.4);
  place(deco, mug(PALETTE.cabinet), 2.34, bY, bZ - 0.03, -0.9);
  addPlant(smallPlant('succulent', PALETTE.coral, 5), deco, 2.45, bY, bZ);

  // fridge top: cookie jar + a little herb bush
  const fTop = fr.pos.y + fr.height;
  place(deco, cookieJar(1), fr.pos.x - 0.1, fTop, fr.pos.z - 0.12, 0.3);
  addPlant(smallPlant('bush', PALETTE.butter, 7), deco, fr.pos.x + 0.15, fTop, fr.pos.z - 0.14);

  // window sill succulent, big corner plant
  addPlant(smallPlant('succulent', PALETTE.cabinet, 9), deco, WINDOW.x0 + 0.18, WINDOW.y0 - 0.0275, BACK_WALL_Z + 0.07);
  addPlant(bigPlant(2), root, -3.03, 0, -0.66, 0.4);

  // diner condiments on the table (far side, away from the plate)
  const tp = LAYOUT.table.pos, ty = LAYOUT.table.topY;
  shelfBottle(deco, 'ketchup', tp.x - 0.36, ty, tp.z - 0.07, 0.35, 0.95);
  shelfBottle(deco, 'mustard', tp.x - 0.3, ty, tp.z - 0.16, 0.1, 0.95);
  place(deco, napkinHolder(), tp.x - 0.4, ty, tp.z - 0.2, 0.5);

  // merge static decor (plants keep their animated foliage)
  const keep = plants.map((p) => p.foliage);
  mergeStatic(deco, keep);
  mergeStatic(fx.spiceRack);

  const ambient = {
    update(dt: number, time: number) {
      room.update(dt, time);
      fx.update(dt, time);
      for (const p of plants) updatePlant(p, time);
    },
  };

  return {
    root,
    board,
    caddy,
    tools,
    bowl,
    whisk,
    stove,
    pan,
    grill,
    pot,
    blender,
    toaster,
    fryer,
    microwave,
    fridge,
    plate,
    bell,
    trash,
    chalkboard: fx.chalkboard,
    counterTop: counters.counterTop,
    lamps: fx.lamps,
    ambient,
  };
}
