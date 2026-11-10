// Prop registry: the ten spawnable props plus the launcher's projectiles.
import * as THREE from 'three';
import { PropBuilder } from './builder.js';
import { tinted } from '../core/materials.js';
import { buildWindow, buildVase } from './fragile.js';
import { buildBookshelf, buildDoor, buildCabinet, buildChair } from './furniture.js';
import { buildLaptop, buildDesk, buildTV, buildWasher } from './electronics.js';

export const PROPS = [
  { type: 'window', label: 'Window Pane', hint: 'Annealed glass in a timber frame', build: buildWindow },
  { type: 'laptop', label: 'Laptop', hint: 'Screen, hinge, keyboard, internals', build: buildLaptop },
  { type: 'desk', label: 'Office Table + PC', hint: 'Tower, monitor, keyboard, mouse', build: buildDesk },
  { type: 'tv', label: '75" Television', hint: 'Glass panel over a steel chassis', build: buildTV },
  { type: 'door', label: 'Wooden Door', hint: 'Panelled leaf on hinges and a latch', build: buildDoor },
  { type: 'bookshelf', label: 'Bookshelf', hint: 'Loaded with books and ornaments', build: buildBookshelf },
  { type: 'chair', label: 'Office Chair', hint: 'Steel that bends, casters that snap', build: buildChair },
  { type: 'vase', label: 'Ceramic Vase', hint: 'A hundred glazed shell tiles', build: buildVase },
  { type: 'washer', label: 'Washing Machine', hint: 'Sheet steel, drum, concrete weights', build: buildWasher },
  { type: 'cabinet', label: 'Wooden Cabinet', hint: 'Hinged doors, shelves, crockery', build: buildCabinet },
];

export const PROP_BY_TYPE = Object.fromEntries(PROPS.map((p) => [p.type, p]));

export const PROJECTILES = [
  { type: 'baseball', label: 'Baseball', mass: 0.145, radius: 0.037 },
  { type: 'brick', label: 'Brick', mass: 2.3 },
  { type: 'steel', label: 'Steel ball', mass: 4, radius: 0.05 },
  { type: 'bowling', label: 'Bowling ball', mass: 7, radius: 0.108 },
  { type: 'cannon', label: 'Cannonball', mass: 24, radius: 0.14 },
];

export function buildProjectile(type) {
  const b = new PropBuilder('projectile', 'Projectile');
  const body = b.cur;
  body.sleeping = false;
  body.ccd = true;
  body.projectile = true;
  if (type === 'brick') {
    b.box('brick', [0.215, 0.065, 0.1025], [0, 0, 0], tinted('concrete', 0xb5593c), { mass: 2.3, strength: 3.5, sound: 'concrete' });
  } else if (type === 'baseball') {
    b.ball('ball', 0.037, [0, 0, 0], tinted('plastic_white', 0xf3efe6, { roughness: 0.75 }), { mass: 0.145, sound: 'rubber', phys: undefined });
  } else if (type === 'bowling') {
    b.ball('ball', 0.108, [0, 0, 0], tinted('plastic_gloss', 0x1b2a6b, { roughness: 0.08 }), { mass: 7, sound: 'plastic' });
  } else if (type === 'cannon') {
    b.ball('ball', 0.14, [0, 0, 0], 'blacksteel', { mass: 24 });
  } else {
    b.ball('ball', 0.05, [0, 0, 0], 'chrome', { mass: 4 });
  }
  return b.build();
}

/** Default showroom layout: all ten props in two rows. */
export function defaultLayout() {
  const row = (types, z, yawBase) =>
    types.map((type, i) => ({ type, pos: new THREE.Vector3((i - (types.length - 1) / 2) * 2.25, 0, z), yaw: yawBase }));
  return [
    ...row(['window', 'door', 'bookshelf', 'cabinet', 'washer'], -2.3, 0),
    ...row(['vase', 'chair', 'desk', 'tv', 'laptop'], 1.3, 0),
  ];
}
