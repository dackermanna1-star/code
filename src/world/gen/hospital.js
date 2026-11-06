// Millbrook General Hospital: 4 storeys + roof. Double loaded corridor, two stairwells, ER with ambulance bay,
// pharmacy (antiviral), morgue, surgery floor, wards, and a sealed quarantine floor.
import { B } from '../blocks.js';
import { SURFACE, ZONES } from '../World.js';
import { Frame } from './frame.js';
import { shell, connect, exteriorDoor, roomWindows, paintRoomWalls, flatRoof, stairwell, carvePlan } from './building.js';
import { Room, furnish } from './furnish.js';
import { aisles } from './commercial.js';
import { CAR_COLORS } from './util.js';

const Y0 = SURFACE;
const H = 5;

/** split x-range into rooms of roughly width w (inclusive rects separated by 1-thick walls) */
function row(x0, x1, z0, z1, w, prefix) {
  const out = [];
  const n = Math.max(1, Math.round((x1 - x0 + 2) / (w + 1)));
  const tot = x1 - x0 + 1 - (n - 1);
  let x = x0;
  for (let i = 0; i < n; i++) {
    const ww = Math.floor(tot / n) + (i < tot % n ? 1 : 0);
    out.push({ id: prefix + i, x0: x, x1: x + ww - 1, z0, z1 });
    x += ww + 1;
  }
  return out;
}

export function buildHospital(ctx, site) {
  const rng = ctx.rng.fork(0x4051);
  const W = 64, D = 40;
  const bx0 = site.x0 + 14, bz0 = site.z1 - 7 - D + 1;
  const fr = Frame.fromRect(ctx, bx0, bz0, bx0 + W - 1, bz0 + D - 1, 0);
  const floors = 4;
  shell(fr, { W, D, floors, storeyH: H, outer: 'brick_white', inner: 'wall_white', ceiling: 'concrete', slab: 'concrete' });
  const topY = Y0 + floors * H;
  flatRoof(fr, W, D, topY, 'brick_white');
  const zc = 18; // corridor rows 18..20
  const corr = { id: 'corr', x0: 2, z0: zc, x1: W - 3, z1: zc + 2, floor: 'floor_hospital', wall: 'wall_white' };
  const ib = { x0: 2, z0: 2, x1: W - 3, z1: D - 3 };
  const tasks = [];
  const zombie = (lx, y, lz, n, outfit, r = 2, types) => tasks.push(() => fr.zombies(lx, y + 1, lz, n, r, { indoor: true, outfit, ...(types ? { types } : {}) }));

  for (let f = 0; f < floors; f++) {
    const y = Y0 + f * H;
    const rooms = [corr];
    const north = [], south = [];
    if (f === 0) {
      north.push({ id: 'janitor', x0: 2, z0: 2, x1: 9, z1: 12, floor: 'concrete', wall: 'wall_white', t: 'storage' });
      north.push({ id: 'pharmacy', x0: 11, z0: 2, x1: 22, z1: 16, floor: 'floor_tile', wall: 'wall_white', t: 'pharmacy' });
      north.push({ id: 'lab', x0: 24, z0: 2, x1: 35, z1: 16, floor: 'floor_hospital', wall: 'wall_white', t: 'lab' });
      north.push({ id: 'morgue', x0: 37, z0: 2, x1: 50, z1: 16, floor: 'floor_tile', wall: 'wall_tile', t: 'morgue' });
      north.push({ id: 'security', x0: 52, z0: 2, x1: W - 3, z1: 12, floor: 'carpet_grey', wall: 'wall_white', t: 'security' });
      south.push({ id: 'cafe', x0: 2, z0: 22, x1: 12, z1: D - 3, floor: 'floor_checker', wall: 'wall_beige', t: 'cafe' });
      south.push({ id: 'waiting', x0: 14, z0: 22, x1: 24, z1: D - 3, floor: 'floor_hospital', wall: 'wall_green', t: 'waiting' });
      south.push({ id: 'lobby', x0: 26, z0: 22, x1: 37, z1: D - 3, floor: 'floor_checker', wall: 'wall_beige', t: 'lobby' });
      south.push({ id: 'er', x0: 39, z0: 22, x1: W - 3, z1: D - 3, floor: 'floor_hospital', wall: 'wall_white', t: 'er' });
    } else if (f === 1) {
      north.push({ id: 'supply', x0: 2, z0: 2, x1: 9, z1: 12, floor: 'concrete', wall: 'wall_white', t: 'supply' });
      north.push(...row(11, 50, 2, 16, 12, 'or').map((r) => ({ ...r, floor: 'floor_hospital', wall: 'wall_tile', t: 'or' })));
      north.push({ id: 'sterile', x0: 52, z0: 2, x1: W - 3, z1: 12, floor: 'floor_hospital', wall: 'wall_white', t: 'supply' });
      south.push({ id: 'recovery', x0: 2, z0: 22, x1: 30, z1: D - 3, floor: 'floor_hospital', wall: 'wall_green', t: 'recovery' });
      south.push(...row(32, W - 3, 22, D - 3, 6, 'doc').map((r) => ({ ...r, floor: 'carpet_grey', wall: 'wall_beige', t: 'doctor' })));
    } else {
      north.push({ id: 'linen' + f, x0: 2, z0: 2, x1: 9, z1: 12, floor: 'concrete', wall: 'wall_white', t: 'supply' });
      north.push(...row(11, 50, 2, 16, 6, 'n').map((r) => ({ ...r, floor: 'floor_hospital', wall: f === 3 ? 'wall_white' : 'wall_green', t: 'ward' })));
      north.push({ id: 'nstore' + f, x0: 52, z0: 2, x1: W - 3, z1: 12, floor: 'floor_hospital', wall: 'wall_white', t: 'supply' });
      south.push(...row(2, W - 3, 22, D - 3, 6, 's').map((r) => ({ ...r, floor: 'floor_hospital', wall: f === 3 ? 'wall_white' : 'wall_blue', t: 'ward' })));
    }
    rooms.push(...north, ...south);
    carvePlan(fr, y, rooms, 'wall_white', H - 1, ib);
    for (const r of [...north, ...south]) {
      const kind = r.t === 'lobby' || r.t === 'waiting' || r.t === 'cafe' ? 'wide' : 'door';
      const opts = { door: r.t === 'pharmacy' ? 'door_metal' : r.t === 'morgue' ? 'door_metal' : 'door_white', locked: r.t === 'pharmacy' ? true : r.t === 'supply' && rng.chance(0.3), open: r.t === 'ward' && rng.chance(0.5) };
      connect(fr, y, r, corr, kind, rng, opts);
      roomWindows(fr, y, r, ib, W, D, 'glass', rng, null, { spacing: 3 });
      paintRoomWalls(fr, y, r, r.wall, H - 1, new Set([B.wall_white]));
      r.y = y; r.f = f;
    }
    roomWindows(fr, y, corr, ib, W, D, 'glass', rng, null, { pairs: true });
    if (f === 0) {
      const lobby = south.find((r) => r.id === 'lobby'), er = south.find((r) => r.id === 'er');
      const d = exteriorDoor(fr, y, lobby, 'front', W, D, 'door_glass', rng, { open: true }, 31);
      fr.opening(32, y + 1, D - 2, 2); fr.door(32, y + 1, D - 1, 0, 'door_glass', { open: false });
      void d;
      // ER ambulance entrance on the east side
      exteriorDoor(fr, y, er, 'right', W, D, 'door_glass', rng, { open: true }, 29);
      fr.opening(W - 2, y + 1, 30, 2); fr.door(W - 1, y + 1, 30, 3, 'door_glass', {});
      exteriorDoor(fr, y, corr, 'left', W, D, 'door_metal', rng, { locked: true }, 19);
      exteriorDoor(fr, y, north.find((r) => r.id === 'morgue'), 'back', W, D, 'door_metal', rng, { locked: true }, 44);
    }
    for (const r of [...north, ...south]) tasks.push(() => hospitalRoom(ctx, fr, r, rng, zombie, f));
    // nurse station in the corridor
    if (f >= 1) tasks.push(() => {
      for (let x = 29; x <= 34; x++) if (fr.canPlace(x, y + 1, zc + 2)) fr.place(x, y + 1, zc + 2, 'bar_counter', 2);
      fr.container(30, y + 1, zc + 1, 'desk', 2, 'hospital');
      fr.loot(31, y + 2, zc + 2, 'floor_hospital', 0.6, 0);
    });
    if (f === 3) tasks.push(() => {
      // quarantine floor: barricaded corridor ends, military presence
      for (const bxc of [14, 49]) {
        let bx = bxc;
        while ([zc, zc + 2].some((z) => !fr.canPlace(bx, y + 1, z))) bx++;
        for (let z = zc; z <= zc + 2; z++) if (z !== zc + 1 || bxc === 49) { fr.set(bx, y + 1, z, B.barricade); fr.set(bx, y + 2, z, B.barricade); }
      }
      fr.corpse(16, y + 1, zc + 1, 1.2, 'military', 'corpse_military');
      fr.corpse(45, y + 1, zc, 2.5, 'medic', 'corpse_civilian');
      for (let cx2 = 20; cx2 < 28; cx2++) if (fr.canPlace(cx2, y + 1, zc + 1)) { fr.container(cx2, y + 1, zc + 1, 'crate_military', 0, 'military_medical'); break; }
      fr.note(18, y + 1, zc + 2, 'hosp_quarantine');
      ctx.usedNotes.add('hosp_quarantine');
      fr.zombies(30, y + 1, zc + 1, 4, 4, { indoor: true, outfit: 'patient', types: ['walker', 'walker', 'runner', 'screamer'] });
    });
  }
  // stairwells (rotated so their doors open onto the corridor), built after carving
  for (const sx of [2, 52]) {
    const swf = fr.child(sx, zc - 4, [0, 1], [1, 0], 4, H + 3);
    const well = stairwell(swf, 0, 0, Y0, H, floors + 1, { wall: 'concrete', floor: 'concrete', stair: 'stairs_concrete' });
    for (let L = 0; L <= floors; L++) {
      const dd = well.doors[L];
      swf.door(dd.x, dd.y + 1, dd.z, 3, L === floors ? 'door_metal' : 'door_white', { open: L === 0, barricade: L === 3 ? 2 : 0 });
    }
  }
  for (const t of tasks) t();
  if (ctx.debugLabels) {
    const targets = [];
    for (let f = 0; f < floors; f++) targets.push([fr.wx(26, zc + 1), Y0 + f * H + 1, fr.wz(26, zc + 1), 'corridor f' + f], [fr.wx(40, zc + 1), Y0 + f * H + 1, fr.wz(40, zc + 1), 'corridor-east f' + f]);
    targets.push([fr.wx(30, 15), Y0 + floors * H + 1, fr.wz(30, 15), 'roof']);
    ctx.reachChecks.push({ name: 'hospital', start: [fr.wx(31, D), Y0 + 1, fr.wz(31, D)], targets, fuzzy: true });
  }
  // roof: helipad
  const hy = topY;
  for (let x = 22; x <= 40; x++) for (let z = 12; z <= 28; z++) fr.set(x, hy, z, B.concrete_white);
  const Hpat = ['X...X', 'X...X', 'XXXXX', 'X...X', 'X...X'];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (Hpat[j][i] === 'X') { fr.set(29 + i * 1, hy, 18 + j, B.concrete_dark); }
  fr.container(24, hy + 1, 14, 'crate_military', 0, 'military_medical');
  fr.corpse(26, hy + 1, 26, 0.4, 'military', 'corpse_military');
  fr.note(25, hy + 1, 14, 'hosp_roof');
  ctx.usedNotes.add('hosp_roof');
  for (let x = 6; x <= 12; x += 3) { fr.set(x, hy + 1, 30, B.metal_wall); fr.set(x + 1, hy + 1, 30, B.metal_wall); }
  // signage
  fr.signCentered(16, 47, Y0 + 3, D, 'MILLBROOK GENERAL HOSPITAL', 0);
  fr.place(W, Y0 + 3, 27, 'sign_cross_red', 3); fr.place(W, Y0 + 3, 33, 'sign_cross_red', 3);
  fr.sign(W, Y0 + 4, 34, 'EMERGENCY', 3);
  // ER canopy + ambulance bay
  for (let x = W; x <= W + 7; x++) for (let z = 25; z <= 35; z++) { fr.set(x, Y0, z, B.concrete); }
  for (let x = W + 1; x <= W + 7; x++) for (let z = 25; z <= 35; z++) fr.set(x, Y0 + 4, z, B.slab_concrete);
  for (const [x, z] of [[W + 7, 25], [W + 7, 35]]) for (let yy = Y0 + 1; yy <= Y0 + 3; yy++) fr.set(x, yy, z, B.concrete);
  fr.vehicle(W + 4, 28, Math.PI, 'ambulance', { color: 0xf0f0f0, loot: 'ambulance', alarm: false });
  fr.vehicle(W + 4.2, 33, Math.PI + 0.15, 'ambulance', { color: 0xf0f0f0, loot: 'ambulance', wrecked: true });
  fr.zombies(W + 3, Y0 + 1, 30, 4, 4, { outfit: 'medic' });
  // drive from the ER bay down to Main Street + drop off loop
  const siteFr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0);
  const ex = bx0 + W + 1 - site.x0;
  for (let x = ex; x <= ex + 6; x++) for (let z = bz0 + 25 - site.z0; z <= site.d - 1; z++) if (ctx.world.get(siteFr.wx(x, z), Y0, siteFr.wz(x, z)) === B.grass) siteFr.set(x, Y0, z, B.asphalt);
  void siteFr;
  // parking lot north + west
  const lot = Frame.fromRect(ctx, site.x0, site.z0, site.x1, bz0 - 3, 0);
  lot.fill(0, Y0, 0, lot.w - 1, Y0, lot.d - 1, B.asphalt);
  for (let x = 2; x < lot.w - 2; x++) for (const z of [lot.d - 8, lot.d - 7, 6, 7, 20, 21, 34, 35]) if (z > 0 && z < lot.d && x % 3 === 0) lot.set(x, Y0, z, B.parking_line_z);
  for (let x = 3; x < lot.w - 3; x += 3) {
    for (const z of [lot.d - 9, 5, 19, 22, 33, 36]) {
      if (z <= 1 || z >= lot.d - 1) continue;
      if (rng.chance(0.11)) lot.vehicle(x + 1.5, z + (z % 2 ? -0.5 : 0.5), rng.chance(0.5) ? 0 : Math.PI, rng.weighted([['sedan', 5], ['suv', 4], ['hatchback', 3], ['pickup', 2], ['van', 1]]), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox', alarm: rng.chance(0.1), wrecked: rng.chance(0.08) });
    }
  }
  lot.vehicle(10, lot.d - 4, Math.PI / 2, 'humvee', { color: 0x4a5a3a, loot: 'military_truck' });
  lot.vehicle(30, lot.d - 4, Math.PI / 2 + 0.2, 'military_truck', { color: 0x4a5a3a, loot: 'military_truck', wrecked: true });
  for (let k = 0; k < 6; k++) lot.corpse(rng.int(5, lot.w - 5), Y0 + 1, rng.int(3, lot.d - 3), rng.range(0, 6.28), rng.pick(['civilian', 'civilian_f', 'patient']), 'corpse_civilian');
  lot.zombies(Math.floor(lot.w / 2), Y0 + 1, Math.floor(lot.d / 2), 5, 8, {});
  // sandbag wall the Guard started at the front
  for (let x = 20; x <= 44; x++) if (x < 29 || x > 35) fr.set(x, Y0 + 1, D + 4, B.sandbags);
  fr.zone(-14, -60, W + 12, D + 7, ZONES.HOSPITAL);
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.HOSPITAL);
  ctx.addPOI({ name: 'Millbrook General Hospital', type: 'hospital', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('hospital');
  const wr = fr.worldRect(-2, -2, W + 9, D + 5);
  ctx.planViews.push({ name: 'hospital-f1', ...wr, y: Y0 + 1, s: 8 }, { name: 'hospital-f2', ...wr, y: Y0 + H + 1, s: 8 }, { name: 'hospital-f4', ...wr, y: Y0 + 3 * H + 1, s: 8 });
  ctx.sectionViews.push({ name: 'hospital-x', axis: 'x', c: bz0 + 15, a0: bx0 - 4, a1: bx0 + W + 4, y0: 15, y1: 50, s: 6 });
}

function hospitalRoom(ctx, fr, r, rng, zombie, f) {
  const o = { height: H - 1 };
  const Y = r.y + 1;
  const cx = Math.floor((r.x0 + r.x1) / 2), cz = Math.floor((r.z0 + r.z1) / 2);
  switch (r.t) {
    case 'pharmacy': {
      aisles(fr, r.x0 + 2, r.z0 + 2, r.x1 - 2, r.z1 - 3, Y, 'store_shelf_meds', 'hospital_pharmacy', {});
      const rm = new Room(fr, r, rng, o);
      for (let k = 0; k < 4; k++) rm.wall('medical_cabinet', { loot: 'hospital_pharmacy' });
      rm.wall('safe', { loot: 'hospital_pharmacy', opts: { locked: true, name: 'Pharmacy safe', fixed: [{ id: 'antiviral', count: 1 }, { id: 'note', count: 1, data: { noteId: 'hosp_antiviral' } }] } });
      ctx.usedNotes.add('hosp_antiviral');
      rm.deskSet('desk', { loot: 'hospital' });
      zombie(cx, r.y, cz, 1, 'medic', 1);
      break;
    }
    case 'lab': {
      const rm = new Room(fr, r, rng, o);
      for (let k = 0; k < 3; k++) rm.tableSet(2, 1, 2);
      for (let k = 0; k < 5; k++) rm.wall('medical_cabinet', { loot: 'hospital_storage' });
      rm.wall('fridge', { loot: 'hospital_storage' });
      rm.deskSet('desk', { loot: 'office' });
      rm.tableLoot('floor_hospital', 0.7);
      fr.note(cx, Y, cz, 'hosp_lab');
      ctx.usedNotes.add('hosp_lab');
      break;
    }
    case 'morgue': {
      for (let x = r.x0; x <= r.x1; x++) if (fr.canPlace(x, Y, r.z0)) { fr.container(x, Y, r.z0, 'locker', 0, 'hospital'); fr.container(x, Y + 1, r.z0, 'locker', 0, 'hospital'); }
      for (let x = r.x0 + 2; x <= r.x1 - 2; x += 3) for (let z = r.z0 + 3; z <= r.z1 - 3; z += 4) {
        fr.place(x, Y, z, 'hospital_bed', 0); fr.place(x, Y, z + 1, 'hospital_bed', 0);
        fr.corpse(x - 1, Y, z, rng.range(0, 6.28), 'patient', 'corpse_civilian');
      }
      zombie(cx, r.y, r.z1 - 1, 3, 'patient', 3, ['walker', 'crawler', 'bloater']);
      fr.note(r.x1 - 1, Y, r.z1 - 1, 'hosp_morgue');
      ctx.usedNotes.add('hosp_morgue');
      break;
    }
    case 'security': furnish(fr, r, 'office', rng, { ...o, deskLoot: 'police_desk' }); zombie(cx, r.y, cz, 1, 'police', 1); break;
    case 'storage': case 'supply': {
      const rm = new Room(fr, r, rng, o);
      for (let k = 0; k < 7; k++) rm.wall(rng.pick(['metal_shelf', 'medical_cabinet', 'cardboard_box']), { loot: 'hospital_storage' });
      rm.center('cardboard_box', 0, { loot: 'hospital_storage' });
      break;
    }
    case 'cafe': {
      const rm = new Room(fr, r, rng, o);
      rm.run(['cooler', 'cooler', 'vending_machine', 'store_shelf']);
      for (let k = 0; k < 4; k++) rm.tableSet(1, 1, rng.int(2, 4));
      rm.tableLoot('floor_store', 0.5);
      zombie(cx, r.y, cz, 2, 'civilian', 2);
      break;
    }
    case 'waiting': {
      for (let z = r.z0 + 2; z <= r.z1 - 2; z += 3) for (let x = r.x0 + 1; x <= r.x1 - 1; x++) if (fr.canPlace(x, Y, z)) fr.place(x, Y, z, 'bench', 0);
      const rm = new Room(fr, r, rng, o);
      rm.wall('vending_machine'); rm.wall('table', { top: 'tv', access: false });
      fr.corpse(cx, Y, r.z0 + 1, 1, 'civilian_f', 'corpse_civilian');
      zombie(cx, r.y, cz, rng.int(3, 4), 'civilian', 3);
      break;
    }
    case 'lobby': {
      for (let x = r.x0 + 2; x <= r.x1 - 2; x++) fr.place(x, Y, r.z0 + 4, 'bar_counter', 0);
      fr.container(r.x0 + 4, Y, r.z0 + 3, 'desk', 0, 'hospital');
      fr.place(r.x0 + 6, Y + 1, r.z0 + 4, 'radio', 0);
      const rm = new Room(fr, { ...r, z0: r.z0 + 6 }, rng, o);
      rm.wall('bench'); rm.wall('bench'); rm.wall('bench');
      fr.note(cx + 2, Y, r.z1 - 2, 'hosp_triage');
      ctx.usedNotes.add('hosp_triage');
      break;
    }
    case 'er': {
      // treatment bays along the walls
      const rm = new Room(fr, r, rng, o);
      for (let k = 0; k < 8; k++) rm.bed(false, 'hospital_bed');
      for (let k = 0; k < 6; k++) rm.wall('medical_cabinet', { loot: 'hospital' });
      rm.center('table');
      rm.floorLoot('floor_hospital', 4, 0.6);
      fr.corpse(cx, Y, cz, 0.5, 'medic', 'corpse_civilian');
      zombie(cx + 3, r.y, cz, rng.int(3, 5), 'patient', 3);
      zombie(cx - 3, r.y, cz + 2, 2, 'medic', 2);
      break;
    }
    case 'or': {
      fr.place(cx, Y, cz, 'hospital_bed', 0);
      fr.place(cx, Y, cz + 1, 'hospital_bed', 0);
      fr.place(cx + 1, Y, cz, 'table');
      fr.set(cx, Y + 3, cz, B.lantern);
      for (const [dx, dz] of [[-1, 0], [-1, 1], [2, 1]]) if (fr.canPlace(cx + dx, Y, cz + dz)) fr.set(cx + dx, Y, cz + dz, B.street_pole);
      const rm = new Room(fr, r, rng, o);
      for (let k = 0; k < 7; k++) rm.wall('medical_cabinet', { loot: 'hospital_storage' });
      rm.run(['kitchen_sink', 'kitchen_sink']) || rm.wall('kitchen_sink');
      rm.wall('table', { top: 'tv', access: false });
      rm.wall('metal_shelf', { loot: 'hospital_storage' });
      rm.tableSet(1, 1, 0);
      fr.loot(cx + 1, Y + 1, cz, 'floor_hospital', 0.8, 0);
      if (rng.chance(0.5)) zombie(cx - 2, r.y, cz, 1, 'medic', 1);
      if (rng.chance(0.5)) fr.corpse(cx + 2, Y, cz + 2, rng.range(0, 6), 'patient', 'corpse_civilian');
      break;
    }
    case 'recovery': {
      for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) {
        if (fr.canPlace(x, Y, r.z0) && fr.canPlace(x, Y, r.z0 + 1)) { fr.place(x, Y, r.z0, 'hospital_bed', 0); fr.place(x, Y, r.z0 + 1, 'hospital_bed', 0); if (fr.canPlace(x + 1, Y, r.z0)) fr.container(x + 1, Y, r.z0, 'medical_cabinet', 0, 'hospital_ward'); }
        if (fr.canPlace(x, Y, r.z1) && fr.canPlace(x, Y, r.z1 - 1)) { fr.place(x, Y, r.z1, 'hospital_bed', 2); fr.place(x, Y, r.z1 - 1, 'hospital_bed', 2); }
      }
      zombie(Math.floor((r.x0 + r.x1) / 2), r.y, cz, rng.int(3, 5), 'patient', 5);
      new Room(fr, r, rng, o).floorLoot('floor_hospital', 3, 0.5);
      break;
    }
    case 'doctor': furnish(fr, r, 'office', rng, o); if (rng.chance(0.3)) zombie(cx, r.y, cz, 1, 'medic', 1); break;
    case 'ward': {
      const rm = new Room(fr, r, rng, o);
      const nb = (r.z1 - r.z0) > 8 ? 4 : 2;
      for (let b = 0; b < nb; b++) {
        const s = rm.bed(false, 'hospital_bed');
        // IV pole beside the bed
        if (s) { const [lx, lz] = s.side <= 1 ? [1, 0] : [0, 1]; rm.tryPlace([{ x: s.x + lx, z: s.z + lz, block: 'street_pole' }]) || rm.tryPlace([{ x: s.x - lx, z: s.z - lz, block: 'street_pole' }]); }
      }
      rm.wall('medical_cabinet', { loot: 'hospital_ward' });
      if (nb > 2) rm.wall('medical_cabinet', { loot: 'hospital_ward' });
      rm.wall('chair'); rm.wall('chair');
      if (nb > 2) { rm.wall('wardrobe', { loot: 'hospital_ward' }); rm.wall('kitchen_sink'); }
      if (rng.chance(0.4)) rm.wall('table', { top: 'tv', access: false });
      rm.floorLoot('floor_hospital', 1, 0.45);
      const p = f === 3 ? 0.8 : 0.45;
      if (rng.chance(p)) zombie(cx, r.y, cz, rng.int(1, f === 3 ? 2 : 1), 'patient', 1, f === 3 ? ['walker', 'runner'] : undefined);
      else if (rng.chance(0.25)) fr.corpse(cx, Y, cz, rng.range(0, 6), 'patient', 'corpse_civilian');
      if (f === 3 && rng.chance(0.4)) for (let x = r.x0; x <= r.x1; x++) if (fr.get(x, Y, r.z0 - 1) === B.glass) fr.set(x, Y, r.z0 - 1, B.barricade);
      break;
    }
    default: break;
  }
}
