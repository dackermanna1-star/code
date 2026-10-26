// The furnished apartment you move into on a new game.
import * as THREE from 'three';
import { G } from '../game.js';
import { CONTAINERS } from '../items/container.js';
import { ITEMS } from '../items/registry.js';

const PI = Math.PI;

export function furnishStarter() {
  const W = (id, x, y, z, yaw = 0, st = {}) => (ITEMS[id] ? G.items.spawn(id, { loc: 'world', pos: new THREE.Vector3(x, y, z), yaw, st }) : null);
  const on = (parent, id, dx, dy, dz, yaw = 0, st = {}) => { const i = W(id, dx, dy, dz, yaw, st); if (i && parent) i.data.parent = parent.uid; return i; };
  // ---- living room
  W('rug_terracotta', -2.9, 0, -2.5, PI / 2);
  W('sofa_cloud', -4.3, 0, -2.5, PI / 2);
  const ct = W('coffee_table_oak', -2.75, 0, -2.5, PI / 2);
  on(ct, 'book_novel_lighthouse', -2.85, 0.445, -2.25, 0.4);
  const con = W('media_console', 0.71, 0, -2.5, -PI / 2);
  on(con, 'tv_55', 0.74, 0.51, -2.5, -PI / 2);
  on(con, 'console_nova', 0.72, 0.51, -1.95, -PI / 2);
  W('poster_city', 0.94, 1.78, -2.5, -PI / 2);
  W('lamp_floor_arc', -4.8, 0, -0.95);
  W('armchair_leather', -5.9, 0, -4.15, PI / 4);
  const st = W('side_table_round', -4.35, 0, -3.95);
  on(st, 'lamp_table_ceramic', -4.35, 0.545, -3.95);
  W('bookshelf_oak', 0.77, 0, -4.35, -PI / 2);
  W('plant_monstera', -6.45, 0, -4.45);
  W('plant_snake', -0.4, 0, -4.6);
  const dt = W('dining_table_round', -5.6, 0, -0.6);
  W('chair_dining', -5.6, 0, 0.12, PI);
  W('chair_dining', -5.6, 0, -1.32, 0);
  on(dt, 'fruit_bowl', -5.55, 0.76, -0.6);
  // ---- kitchen
  W('coffee_machine', -6.72, 0.94, 2.0, PI / 2);
  W('toaster', -6.72, 0.94, 3.95, PI / 2);
  W('stool_bar', -4.95, 0, 1.45, 0);
  W('stool_bar', -3.85, 0, 1.45, 0);
  W('banana', -4.0, 0.95, 2.55, 0.5);
  // ---- bedroom
  W('rug_abstract', 5.0, 0, -1.5, PI / 2);
  W('bed_queen', 5.73, 0, -1.5, -PI / 2);
  const n1 = W('nightstand_oak', 6.6, 0, -2.75, -PI / 2);
  const n2 = W('nightstand_oak', 6.6, 0, -0.25, -PI / 2);
  on(n1, 'lamp_table_ceramic', 6.6, 0.58, -2.75, -PI / 2, { on: false });
  on(n2, 'clock_alarm', 6.62, 0.58, -0.25, -PI / 2);
  on(n2, 'book_cozy_mystery', 6.55, 0.58, -0.05, -PI / 2 + 0.3);
  const desk = W('desk_minimal', 2.6, 0, -4.45, 0);
  on(desk, 'pc_setup', 2.55, 0.758, -4.5, 0);
  W('chair_desk', 2.55, 0, -3.72, PI);
  const dr = W('dresser_walnut', 2.4, 0, 1.18, PI);
  on(dr, 'plant_pothos', 2.0, 0.86, 1.2);
  W('poster_sunset', 6.85, 1.72, -1.5, -PI / 2);
  // ---- containers
  const C = (cid, ids) => { for (const id of ids) { if (!ITEMS[id]) continue; const i = G.items.spawn(id, { loc: 'storage' }); if (!G.items.toContainer(i, CONTAINERS[cid])) G.items.setLoc(i, 'storage'); } };
  C('fridge', ['water_bottle', 'water_bottle', 'soda_cola', 'milk', 'eggs', 'apple', 'apple', 'pizza_slice']);
  C('cabinet', ['toothbrush', 'toothpaste', 'hand_soap', 'shampoo', 'body_wash']);
  for (const id of ['granola_bar', 'granola_bar', 'bread', 'coffee_beans']) if (ITEMS[id]) G.items.spawn(id, { loc: 'pantry' });
  for (const id of ['fidget_spinner', 'rubber_duck', 'watering_can']) if (ITEMS[id]) G.items.spawn(id, { loc: 'storage' });
  for (const id of ['hoodie_gray', 'jeans_blue']) if (ITEMS[id]) G.items.spawn(id, { loc: 'wardrobe' });
  for (const id of ['tee_white', 'sweatpants_gray', 'slippers']) { const i = ITEMS[id] && G.items.spawn(id, { loc: 'wardrobe' }); if (i) { G.items.setLoc(i, 'worn'); G.state.outfit[i.def.use.slot] = i.uid; } }
  // a welcome gift on the doormat
  const gift = ['bubble_wand', 'fidget_cube', 'stress_ball'].filter((id) => ITEMS[id]);
  G.items.spawn('pkg_box_s', { loc: 'world', pos: new THREE.Vector3(-0.6, 0, 5.65), yaw: PI, st: { contents: gift.length ? gift : ['rubber_duck'], store: 'primo' } });
  G.items.refreshColliders();
}
