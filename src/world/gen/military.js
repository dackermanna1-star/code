// Military: FEMA quarantine camp (Millbrook Fairgrounds), Checkpoint Bravo on I-65, the highway jam,
// and the crashed medevac helicopter.
import { B } from '../blocks.js';
import { SURFACE, ZONES } from '../World.js';
import { Frame } from './frame.js';
import { HWY_X } from './plan.js';
import { CAR_COLORS } from './util.js';

const Y0 = SURFACE, Y = Y0 + 1;

/** Small tent: footprint w x d (local), walls 1 high + ridge, open front at +z. */
export function tent(fr, x0, z0, w, d, mat, rng, o = {}) {
  const m = B[mat];
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
    if (fr.get(x, Y, z) !== 0 && !o.force) return false;
  }
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
    const edgeX = x === x0 || x === x0 + w - 1;
    const edgeZ = z === z0 || z === z0 + d - 1;
    fr.set(x, Y0, z, o.floor ? B[o.floor] : B.dirt);
    if (edgeX || (edgeZ && z === z0)) { fr.set(x, Y, z, m); fr.set(x, Y + 1, z, m); }
    fr.set(x, Y + 2, z, m);
  }
  // ridge
  const mx = x0 + Math.floor(w / 2);
  for (let z = z0; z < z0 + d; z++) { fr.set(mx, Y + 3, z, m); if (w % 2 === 0) fr.set(mx - 1, Y + 3, z, m); }
  // door opening at the front centre
  const doorX = x0 + Math.floor(w / 2);
  const fz = z0 + d - 1;
  fr.set(doorX, Y, fz, 0); fr.set(doorX, Y + 1, fz, 0);
  if (w >= 5) { fr.set(doorX - 1, Y, fz, 0); fr.set(doorX - 1, Y + 1, fz, 0); }
  // side walls along the front
  for (let x = x0; x < x0 + w; x++) if (Math.abs(x - doorX) > (w >= 5 ? 1 : 0) && !(x === x0 || x === x0 + w - 1)) { fr.set(x, Y, fz, m); fr.set(x, Y + 1, fz, m); }
  fr.markOpening(doorX, Y, fz);
  void rng;
  return { x0: x0 + 1, z0: z0 + 1, x1: x0 + w - 2, z1: z0 + d - 2, doorX, fz };
}

/** Wooden watchtower with a ladder: 3x3 posts, platform at y+5, sandbags, roof. */
export function watchtower(fr, x0, z0, rng, o = {}) {
  const h = o.h || 5;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) for (let yy = Y; yy < Y + h; yy++) fr.set(x0 + dx, yy, z0 + dz, B.log_pine);
  const py = Y + h;
  for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 3; dz++) fr.set(x0 + dx, py, z0 + dz, B.planks_oak);
  for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 3; dz++) {
    const edge = dx === -1 || dz === -1 || dx === 3 || dz === 3;
    if (edge) fr.set(x0 + dx, py + 1, z0 + dz, B.sandbags);
  }
  for (const [dx, dz] of [[-1, -1], [3, -1], [-1, 3], [3, 3]]) for (let yy = py + 2; yy <= py + 3; yy++) fr.set(x0 + dx, yy, z0 + dz, B.fence_post);
  for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 3; dz++) fr.set(x0 + dx, py + 4, z0 + dz, B.corrugated_metal);
  // ladder on the south face (center column), hatch in the platform
  const lx = x0 + 1, lz = z0 + 3;
  for (let yy = Y; yy <= py; yy++) { fr.clear(lx, yy, lz - 1, 0); fr.place(lx, yy, lz - 1, 'ladder', 0); }
  fr.clear(lx, py + 1, lz - 1, 0);
  fr.place(lx, py + 1, lz - 1, 'ladder', 0);
  fr.set(lx, py, lz - 2, B.planks_oak);
  return { top: [x0 + 1, py + 1, z0 + 1] };
}

function sandbagArc(fr, x, z, rng) {
  for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]]) if (fr.get(x + dx, Y, z + dz) === 0) fr.set(x + dx, Y, z + dz, B.sandbags);
  void rng;
}

const MILV = () => ({ color: 0x4a5a3a, loot: 'military_truck' });

// ============================================================================ FEMA CAMP
export function buildFema(ctx, site) {
  const rng = ctx.rng.fork(0xfe3a);
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0);
  const W = fr.w, D = fr.d;
  // ground: trampled dirt/gravel paths
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const r = ((x * 73 + z * 151) % 97) / 97;
    fr.set(x, Y0, z, r < 0.25 ? B.dirt : r < 0.35 ? B.mud : B.dry_grass);
  }
  for (let x = 2; x < W - 2; x++) for (const z of [Math.floor(D / 2), D - 12]) for (let k = -1; k <= 1; k++) fr.set(x, Y0, z + k, B.gravel);
  for (let z = 2; z < D - 2; z++) for (let k = -1; k <= 1; k++) fr.set(Math.floor(W / 2) + k, Y0, z, B.gravel);
  // perimeter fence + wire, gate on the south-east
  const gx0 = W - 22, gx1 = W - 12;
  for (let x = 0; x < W; x++) for (const z of [0, D - 1]) {
    if (z === D - 1 && x >= gx0 && x <= gx1) continue;
    fr.place(x, Y, z, 'fence_chainlink', 0); fr.place(x, Y + 1, z, 'fence_chainlink', 0); fr.set(x, Y + 2, z, B.barbed_wire);
  }
  for (let z = 0; z < D; z++) for (const x of [0, W - 1]) { fr.place(x, Y, z, 'fence_chainlink', 1); fr.place(x, Y + 1, z, 'fence_chainlink', 1); fr.set(x, Y + 2, z, B.barbed_wire); }
  // HESCO gate + checkpoint booth
  for (const x of [gx0 - 3, gx0 - 2, gx0 - 1, gx1 + 1, gx1 + 2, gx1 + 3]) for (let z = D - 4; z <= D - 1; z++) { fr.set(x, Y, z, B.hesco); fr.set(x, Y + 1, z, B.hesco); }
  for (let x = gx0; x <= gx1; x++) if (x % 3 === 0) fr.place(x, Y, D - 1, 'jersey_barrier', 0);
  for (let x = gx0 + 1; x <= gx1 - 1; x += 3) fr.place(x, Y, D + 2, 'traffic_cone');
  // connector road to the frontage road
  for (let x = gx0; x <= W + 10; x++) for (let z = D; z <= D + 6; z++) if (fr.get(x, Y0, z) !== B.asphalt) { fr.set(x, Y0, z, B.asphalt); if (fr.get(x, Y, z) !== 0 && fr.get(x, Y, z) !== B.traffic_cone) fr.clear(x, Y, z, 0); }
  fr.sign(gx0 - 3, Y + 2, D, 'FEMA', 0);
  // watchtowers at the corners
  const towers = [[3, 3], [W - 7, 3], [3, D - 8], [W - 7, D - 8]];
  for (const [tx, tz] of towers) {
    const t = watchtower(fr, tx, tz, rng);
    fr.corpse(t.top[0], t.top[1], t.top[2], rng.range(0, 6), 'military', 'corpse_military');
    fr.container(tx, t.top[1], tz, 'crate_military', 0, 'military_crate');
  }
  // ---- processing area near the gate: lanes + intake tents
  for (let z = D - 22; z <= D - 6; z++) for (const x of [gx0 + 1, gx0 + 4, gx0 + 7]) if (z % 6 !== 0) fr.place(x, Y, z, 'fence_chainlink', 1);
  const intake = tent(fr, gx0 - 16, D - 22, 9, 7, 'tent_white', rng, { floor: 'planks_oak' });
  if (intake) {
    fr.place(intake.x0 + 1, Y, intake.z0 + 1, 'table'); fr.place(intake.x0 + 2, Y, intake.z0 + 1, 'table');
    fr.container(intake.x0 + 4, Y, intake.z0, 'desk', 0, 'fema_supply');
    fr.container(intake.x0 + 5, Y, intake.z0, 'filing_cabinet', 0, 'office');
    fr.note(intake.x0 + 3, Y, intake.z0 + 2, 'fema_intake');
  }
  // ---- civilian tent rows (A-D)
  let tentsBuilt = 0;
  for (let row = 0; row < 4; row++) {
    const tz = 14 + row * 14;
    for (let tx = 6; tx < W - 30; tx += 8) {
      const t = tent(fr, tx, tz, 6, 5, 'tent_white', rng, { floor: 'planks_light' });
      if (!t) continue;
      tentsBuilt++;
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) { fr.place(t.x0 + k * 2 - (k > 1 ? 1 : 0), Y, t.z0, 'bed_head', 0); fr.place(t.x0 + k * 2 - (k > 1 ? 1 : 0), Y, t.z0 + 1, 'bed_foot', 0); }
      if (rng.chance(0.5)) fr.container(t.x1, Y, t.z1, rng.chance(0.5) ? 'cardboard_box' : 'crate_wood', 0, rng.chance(0.6) ? 'fema_supply' : 'floor_camp' === 'x' ? null : 'survivor_stash');
      if (rng.chance(0.3)) fr.loot(t.x0 + 1, Y, t.z1, 'floor_camp', 0.6);
      if (rng.chance(0.3)) fr.corpse(t.doorX, Y, t.fz + 1, rng.range(0, 6), rng.pick(['civilian', 'civilian_f']), 'corpse_civilian');
    }
    fr.zombies(Math.floor(W / 3), Y, tz + 6, rng.int(4, 6), 12, { outfit: rng.pick(['civilian', 'civilian_f']) });
    fr.zombies(Math.floor(W / 2) + 10, Y, tz + 6, rng.int(3, 5), 10, {});
  }
  ctx.stats.femaTents = tentsBuilt;
  // ---- medical tent (big)
  const med = tent(fr, W - 28, 16, 13, 9, 'tent_white', rng, { floor: 'planks_light' });
  if (med) {
    fr.place(med.x0 + 5, Y + 2, med.z1 + 1, 'sign_cross_red', 0);
    for (let x = med.x0; x <= med.x1; x += 2) { fr.place(x, Y, med.z0, 'hospital_bed', 0); fr.place(x, Y, med.z0 + 1, 'hospital_bed', 0); }
    for (let k = 0; k < 3; k++) fr.container(med.x0 + k * 2, Y, med.z1 - 1, 'crate_military', 0, 'military_medical');
    fr.container(med.x1, Y, med.z1 - 1, 'medical_cabinet', 1, 'military_medical');
    fr.note(med.x0 + 7, Y, med.z1 - 1, 'fema_medic');
    fr.zombies(med.x0 + 5, Y, med.z0 + 4, 4, 3, { indoor: true, outfit: rng.pick(['patient', 'medic']) });
  }
  // ---- military area (north-east): command, armory, barracks tents, vehicles under camo nets
  const cmd = tent(fr, W - 28, 32, 9, 7, 'tent_green', rng, { floor: 'planks_oak' });
  if (cmd) {
    fr.container(cmd.x0 + 3, Y, cmd.z0, 'desk', 0, 'military_tent', { fixed: [{ id: 'note', count: 1, data: { noteId: 'fema_orders' } }] });
    fr.place(cmd.x0 + 4, Y, cmd.z0, 'table'); fr.place(cmd.x0 + 4, Y + 1, cmd.z0, 'radio', 0);
    fr.container(cmd.x1, Y, cmd.z0, 'filing_cabinet', 1, 'office');
    fr.corpse(cmd.x0 + 2, Y, cmd.z0 + 3, 2, 'military', 'corpse_military');
  }
  const arm = tent(fr, W - 17, 32, 9, 7, 'tent_green', rng, { floor: 'planks_oak' });
  if (arm) {
    for (let k = 0; k < 5; k++) fr.container(arm.x0 + k, Y, arm.z0, 'crate_military', 0, 'military_armory');
    fr.container(arm.x0, Y, arm.z0 + 2, 'gun_cabinet', 3, 'military_armory', { locked: true });
    fr.container(arm.x1, Y, arm.z0 + 2, 'locker', 1, 'military_crate');
    fr.zombies(arm.x0 + 3, Y, arm.z0 + 3, 2, 2, { indoor: true, outfit: 'military' });
  }
  for (let k = 0; k < 3; k++) {
    const t = tent(fr, W - 28 + k * 9, 44, 7, 6, 'tent_green', rng, { floor: 'planks_oak' });
    if (!t) continue;
    for (let b = 0; b < 3; b++) { fr.place(t.x0 + b * 2, Y, t.z0, 'bed_head', 0); fr.place(t.x0 + b * 2, Y, t.z0 + 1, 'bed_foot', 0); }
    fr.container(t.x1, Y, t.z1, 'locker', 1, 'military_tent');
    fr.container(t.x0, Y, t.z1, 'crate_military', 0, 'military_tent');
  }
  // vehicles + camo net
  const vz = 4;
  for (let k = 0; k < 4; k++) {
    const vx = 20 + k * 8;
    fr.vehicle(vx, vz + 4, 0, k % 2 ? 'humvee' : 'military_truck', { ...MILV(), wrecked: rng.chance(0.2) });
  }
  for (let x = 16; x <= 52; x++) for (let z = 3; z <= 12; z++) if (fr.get(x, Y + 4, z) === 0) fr.set(x, Y + 4, z, B.camo_net);
  for (const [x, z] of [[16, 3], [52, 3], [16, 12], [52, 12]]) for (let yy = Y; yy <= Y + 3; yy++) fr.set(x, yy, z, B.fence_post);
  // supply barn (fairgrounds exhibition hall) full of FEMA supplies
  const bx = 6, bz = 70;
  const bw = 20, bd = 14;
  if (bz + bd < D - 26) {
    fr.walls(bx, Y, bz, bx + bw - 1, Y + 4, bz + bd - 1, B.barn_red);
    for (let x = bx; x < bx + bw; x++) for (let z = bz; z < bz + bd; z++) { fr.set(x, Y0, z, B.concrete); fr.set(x, Y + 5, z, B.roof_metal); }
    for (let x = bx + 8; x <= bx + 11; x++) for (let yy = Y; yy <= Y + 2; yy++) fr.set(x, yy, bz + bd - 1, 0);
    fr.markOpening(bx + 9, Y, bz + bd - 1);
    for (let x = bx + 1; x < bx + bw - 1; x += 2) for (const z of [bz + 1, bz + 2, bz + 5]) {
      if (fr.get(x, Y, z) !== 0) continue;
      fr.container(x, Y, z, rng.pick(['crate_military', 'cardboard_box', 'crate_wood']), 0, 'fema_supply');
      if (rng.chance(0.4) && fr.get(x, Y + 1, z) === 0) fr.container(x, Y + 1, z, 'cardboard_box', 0, 'fema_supply');
    }
    for (let x = bx + 2; x < bx + bw - 2; x += 4) fr.set(x, Y, bz + 9, B.pallet);
    fr.sign(bx + 2, Y + 3, bz + bd, 'SUPPLY', 0);
    fr.zombies(bx + 10, Y, bz + 8, 3, 4, { indoor: true, outfit: 'military' });
  }
  // burn pit
  const px = 40, pz = 74;
  for (let x = px; x < px + 8; x++) for (let z = pz; z < pz + 6; z++) { fr.set(x, Y0, z, B.mud); if (rng.chance(0.35)) fr.set(x, Y, z, B.rubble); else if (rng.chance(0.12)) fr.set(x, Y, z, B.fire); }
  for (let k = 0; k < 6; k++) fr.corpse(px + rng.int(0, 7), Y, pz + rng.int(-2, 7), rng.range(0, 6.28), rng.pick(['civilian', 'civilian_f', 'patient']), 'corpse_civilian');
  // barrels burning around the camp
  for (let k = 0; k < 8; k++) {
    const x = rng.int(6, W - 8), z = rng.int(6, D - 8);
    if (fr.get(x, Y, z) === 0 && fr.get(x, Y0, z) !== 0) fr.set(x, Y, z, rng.chance(0.6) ? B.barrel_burning : B.barrel_rust);
  }
  // helipad
  for (let x = W - 30; x <= W - 18; x++) for (let z = 60; z <= 72; z++) fr.set(x, Y0, z, (x === W - 24 || ((z === 63 || z === 69) && x >= W - 27 && x <= W - 21)) ? B.concrete_dark : B.concrete_white);
  // scattered dead soldiers + loot
  for (let k = 0; k < 6; k++) fr.corpse(rng.int(10, W - 10), Y, rng.int(10, D - 10), rng.range(0, 6.28), 'military', 'corpse_military');
  for (let k = 0; k < 10; k++) fr.loot(rng.int(5, W - 5), Y, rng.int(5, D - 5), rng.chance(0.5) ? 'floor_military' : 'floor_camp', 0.5);
  fr.zombies(W - 20, Y, 50, 6, 8, { outfit: 'military', types: ['walker', 'walker', 'runner', 'brute'] });
  fr.zombies(30, Y, D - 15, 5, 8, { outfit: 'civilian' });
  fr.zone(0, 0, W - 1, D - 1, ZONES.MILITARY);
  ctx.addPOI({ name: 'FEMA Camp', type: 'military', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.addPOI({ name: 'Millbrook Fairgrounds', type: 'landmark', x0: site.x0 + 4, z0: site.z0 + 60, x1: site.x0 + 30, z1: site.z0 + 90 });
  ctx.usedNotes.add('fema_orders'); ctx.usedNotes.add('fema_medic'); ctx.usedNotes.add('fema_intake');
  ctx.building('fema_camp');
  ctx.planViews.push({ name: 'fema', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 + 8, y: Y, s: 4 });
}

// ============================================================================ CHECKPOINT BRAVO
export function buildCheckpoint(ctx, site) {
  const rng = ctx.rng.fork(0xc0c0);
  const { world } = ctx;
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0);
  const W = fr.w, D = fr.d;
  const lx = (wx) => wx - site.x0, lz = (wz) => wz - site.z0;
  const bz = lz(200);
  // HESCO barrier across the highway with a closed gate in the northbound lanes
  for (let x = 0; x < W; x++) {
    const wx = site.x0 + x;
    const gate = wx >= HWY_X + 6 && wx <= HWY_X + 11;
    for (const z of [bz, bz + 1]) {
      if (gate) continue;
      fr.clear(x, Y, z, B.hesco); fr.clear(x, Y + 1, z, B.hesco);
      if (z === bz) fr.set(x, Y + 2, z, B.barbed_wire);
    }
    if (gate) { fr.clear(x, Y, bz + 1, 0); fr.place(x, Y, bz + 1, 'jersey_barrier', 0); }
  }
  // sandbag fighting positions behind the wall
  for (const wx of [HWY_X - 12, HWY_X - 4, HWY_X + 4, HWY_X + 14]) sandbagArc(fr, lx(wx), bz - 3, rng);
  // concertina wire + chicane of jersey barriers south of the wall
  for (let x = 0; x < W; x++) for (const z of [bz + 4, bz + 5]) if (fr.get(x, Y, z) === 0 && (x % 7) !== 3) fr.set(x, Y, z, B.barbed_wire);
  for (let k = 0; k < 5; k++) {
    const z = bz + 9 + k * 4;
    const left = k % 2 === 0;
    for (let wx = HWY_X + 5; wx <= HWY_X + 13; wx++) if ((left && wx <= HWY_X + 10) || (!left && wx >= HWY_X + 8)) { const x = lx(wx); fr.clear(x, Y, z, 0); fr.place(x, Y, z, 'jersey_barrier', 0); }
    for (let wx = HWY_X - 13; wx <= HWY_X - 5; wx++) if (k % 2) { const x = lx(wx); fr.clear(x, Y, z, 0); fr.place(x, Y, z, 'jersey_barrier', 0); }
  }
  // watchtowers beside the highway
  const tw = watchtower(fr, lx(HWY_X - 26), bz - 6, rng, { h: 6 });
  const te = watchtower(fr, lx(HWY_X + 21), bz - 6, rng, { h: 6 });
  fr.container(tw.top[0] + 1, tw.top[1], tw.top[2], 'crate_military', 0, 'military_armory');
  fr.corpse(tw.top[0], tw.top[1], tw.top[2], 1, 'military', 'corpse_military');
  fr.container(te.top[0] + 1, te.top[1], te.top[2], 'crate_military', 0, 'military_crate');
  // north side: camp of the checkpoint (tents on the shoulders, vehicles in the lanes)
  for (let k = 0; k < 3; k++) {
    const t = tent(fr, lx(HWY_X - 29) , 8 + k * 9, 6, 6, 'tent_green', rng, { floor: 'planks_oak' });
    if (t) { fr.place(t.x0, Y, t.z0, 'bed_head', 0); fr.place(t.x0, Y, t.z0 + 1, 'bed_foot', 0); fr.container(t.x1, Y, t.z0, 'crate_military', 0, 'military_tent'); if (k === 0) fr.note(t.x0 + 2, Y, t.z0 + 2, 'checkpoint_diary'); }
  }
  for (let k = 0; k < 2; k++) {
    const t = tent(fr, lx(HWY_X + 21), 6 + k * 10, 7, 6, 'tent_green', rng, { floor: 'planks_oak' });
    if (t) { for (let c = 0; c < 3; c++) fr.container(t.x0 + c, Y, t.z0, 'crate_military', 0, k ? 'military_medical' : 'military_crate'); if (k === 0) { fr.container(t.x1, Y, t.z1, 'desk', 1, 'military_tent', { fixed: [{ id: 'note', count: 1, data: { noteId: 'checkpoint_roe' } }] }); } }
  }
  ctx.usedNotes.add('checkpoint_diary'); ctx.usedNotes.add('checkpoint_roe');
  const vy = Y;
  ctx.addVehicle({ type: 'humvee', x: HWY_X + 8.5, y: vy, z: site.z0 + bz - 4, yaw: 0, ...MILV() });
  ctx.addVehicle({ type: 'humvee', x: HWY_X - 9, y: vy, z: site.z0 + bz - 5, yaw: Math.PI * 0.5, ...MILV() });
  ctx.addVehicle({ type: 'military_truck', x: HWY_X + 9, y: vy, z: site.z0 + 18, yaw: Math.PI, ...MILV() });
  ctx.addVehicle({ type: 'military_truck', x: HWY_X - 9, y: vy, z: site.z0 + 22, yaw: 0, ...MILV(), wrecked: true });
  ctx.addVehicle({ type: 'humvee', x: HWY_X + 9, y: vy, z: site.z0 + 6, yaw: Math.PI * 0.95, ...MILV(), burned: true, wrecked: true });
  for (const [wx, wz] of [[HWY_X - 14, site.z0 + 10], [HWY_X + 13, site.z0 + 14], [HWY_X - 2, site.z0 + bz - 2], [HWY_X + 3, site.z0 + bz - 2]]) if (world.get(wx, Y, wz) === 0) world.set(wx, Y, wz, B.barrel_burning);
  for (let k = 0; k < 7; k++) fr.corpse(rng.int(8, W - 8), Y, rng.int(4, bz - 2), rng.range(0, 6.28), 'military', 'corpse_military');
  for (let k = 0; k < 9; k++) fr.corpse(rng.int(10, W - 10), Y, rng.int(bz + 3, D - 2), rng.range(0, 6.28), rng.pick(['civilian', 'civilian_f']), 'corpse_civilian');
  for (let k = 0; k < 6; k++) fr.loot(rng.int(8, W - 8), Y, rng.int(3, bz - 2), 'floor_military', 0.6);
  // camo net over the gate position
  for (let wx = HWY_X + 3; wx <= HWY_X + 14; wx++) for (let z = bz - 7; z <= bz - 2; z++) if (fr.get(lx(wx), Y + 3, z) === 0) fr.set(lx(wx), Y + 3, z, B.camo_net);
  fr.zombies(lx(HWY_X), Y, bz - 8, 6, 10, { outfit: 'military', types: ['walker', 'walker', 'walker', 'runner', 'brute', 'screamer'] });
  fr.zombies(lx(HWY_X + 8), Y, bz + 12, 6, 10, { outfit: 'civilian' });
  fr.zone(0, 0, W - 1, D - 1, ZONES.MILITARY);
  ctx.addPOI({ name: 'I-65 Military Checkpoint', type: 'military', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('checkpoint');
  ctx.planViews.push({ name: 'checkpoint', x0: site.x0 - 4, z0: site.z0, x1: site.x1 + 4, z1: site.z1 + 30, y: Y, s: 8 });
}

// ============================================================================ HIGHWAY JAM + PILEUPS
const JAM_TYPES = [['sedan', 30], ['suv', 22], ['pickup', 18], ['hatchback', 12], ['van', 10], ['semi', 4], ['bus', 1.2], ['police', 1], ['ambulance', 0.7]];

function jamCar(ctx, rng, x, z, yaw, type, o = {}) {
  const loot = type === 'semi' ? 'truck_cargo' : type === 'pickup' ? 'pickup_bed' : type === 'police' ? 'police_car_trunk' : type === 'ambulance' ? 'ambulance' : 'car_trunk';
  const burned = o.burned ?? rng.chance(0.08);
  return ctx.addVehicle({ type, x, y: Y, z, yaw, color: type === 'police' ? 0x1a1a2a : type === 'ambulance' ? 0xf0f0f0 : type === 'bus' ? 0xe0b020 : rng.pick(CAR_COLORS), wrecked: burned || rng.chance(o.wreck ?? 0.15), burned, alarm: !burned && rng.chance(0.08), loot, gloveLoot: 'car_glovebox' });
}

export function buildHighwayJam(ctx) {
  const rng = ctx.rng.fork(0x1a77);
  let n = 0;
  // the queue for the checkpoint: northbound (east carriageway, cars facing north = yaw PI)
  const lanesNB = [HWY_X + 7, HWY_X + 11.5, HWY_X + 14.6];
  const lanesSB = [HWY_X - 7, HWY_X - 11.5, HWY_X - 14.6];
  let truckerDone = false;
  for (let z = 238; z <= 470; z += rng.range(5.6, 8)) {
    const dens = z < 330 ? 0.9 : z < 420 ? 0.6 : 0.3;
    for (const lx of lanesNB) {
      if (!rng.chance(dens * (lx === lanesNB[2] ? 0.5 : 1))) continue;
      const type = rng.weighted(JAM_TYPES);
      const zz = z + (type === 'semi' ? 6 : type === 'bus' ? 4 : 0);
      if (jamCar(ctx, rng, lx + rng.range(-0.4, 0.4), zz, Math.PI + rng.range(-0.12, 0.12), type)) {
        n++;
        if (type === 'semi' && !truckerDone) { truckerDone = true; ctx.world.addNote(lx + 1.8, Y, zz - 6, 'trucker_log'); ctx.usedNotes.add('trucker_log'); }
      }
    }
    // southbound lanes: people turned around / tried to drive the wrong way
    for (const lx of lanesSB) {
      if (!rng.chance(dens * 0.45)) continue;
      const type = rng.weighted(JAM_TYPES);
      const wrongWay = rng.chance(0.4);
      if (jamCar(ctx, rng, lx + rng.range(-0.4, 0.4), z + rng.range(-1, 1), (wrongWay ? Math.PI : 0) + rng.range(-0.3, 0.3), type)) n++;
    }
    if (rng.chance(0.35)) ctx.world.addCorpse({ x: HWY_X + rng.range(-14, 14), y: Y, z: z + rng.range(-2, 2), yaw: rng.range(0, 6.28), outfit: rng.pick(['civilian', 'civilian_f']), loot: 'corpse_civilian' });
    if (rng.chance(0.25)) ctx.world.addFloorLoot(HWY_X + rng.range(-14, 14), Y, z, 'floor_street', 0.6);
    if (rng.chance(0.2) && z < 400) ctx.world.addZombieSpawn({ x: HWY_X + rng.range(-12, 12), y: Y, z, count: rng.int(2, 4), radius: 6 });
  }
  // burning wreck cluster
  for (let k = 0; k < 4; k++) {
    const x = HWY_X + rng.range(5, 14), z = 300 + k * 3;
    if (jamCar(ctx, rng, x, z, rng.range(0, 6.28), rng.pick(['sedan', 'suv', 'van']), { burned: true })) n++;
    if (ctx.world.get(Math.floor(x) + 2, Y, z) === 0) ctx.world.set(Math.floor(x) + 2, Y, z, B.fire);
  }
  // scattered abandoned / crashed cars along the rest of the interstate
  for (let z = 30; z < 990; z += rng.range(18, 40)) {
    if (z > 150 && z < 480) continue;
    const sb = rng.chance(0.5);
    const lane = sb ? rng.pick(lanesSB) : rng.pick(lanesNB);
    if (jamCar(ctx, rng, lane, z, (sb ? 0 : Math.PI) + rng.range(-0.6, 0.6), rng.weighted(JAM_TYPES), { wreck: 0.4 })) n++;
  }
  // map-edge pileups (roads leaving the county)
  pileup(ctx, rng, HWY_X, 14, 30, 9);
  pileup(ctx, rng, HWY_X, 1009, 30, 9);
  pileup(ctx, rng, 512, 12, 8, 6);
  pileup(ctx, rng, 512, 1011, 8, 6);
  pileup(ctx, rng, 14, 512, 8, 6, true);
  ctx.stats.jamVehicles = n;
  ctx.addPOI({ name: 'I-65 Traffic Jam', type: 'highway', x0: HWY_X - 16, z0: 236, x1: HWY_X + 16, z1: 420 });
  ctx.addPOI({ name: 'Interstate 65', type: 'highway', x0: HWY_X - 16, z0: 480, x1: HWY_X + 16, z1: 1000 });
}

function pileup(ctx, rng, cx, cz, halfW, n, alongX = false) {
  const { world } = ctx;
  for (let k = 0; k < n * 2; k++) {
    const a = rng.range(-halfW, halfW), b = rng.range(-7, 7);
    const [x, z] = alongX ? [cx + b, cz + a] : [cx + a, cz + b];
    jamCar(ctx, rng, x, z, rng.range(0, 6.28), rng.weighted(JAM_TYPES), { wreck: 0.9, burned: rng.chance(0.35) });
  }
  for (let k = 0; k < 8; k++) {
    const a = Math.floor(rng.range(-halfW, halfW)), b = Math.floor(rng.range(-6, 6));
    const [x, z] = alongX ? [cx + b, cz + a] : [cx + a, cz + b];
    if (world.get(x, Y, z) === 0 && world.get(x, Y0, z) !== 0) world.set(x, Y, z, rng.chance(0.4) ? B.fire : rng.chance(0.5) ? B.rubble : B.jersey_barrier);
  }
  for (let k = 0; k < 3; k++) world.addCorpse({ x: cx + rng.range(-halfW, halfW) * (alongX ? 0.2 : 1), y: Y, z: cz + rng.range(-5, 5), yaw: rng.range(0, 6), outfit: rng.pick(['civilian', 'civilian_f', 'survivor']), loot: rng.chance(0.3) ? 'corpse_survivor' : 'corpse_civilian' });
  world.addZombieSpawn({ x: cx, y: Y, z: cz, count: rng.int(3, 5), radius: 8 });
}

// ============================================================================ HELICOPTER CRASH
export function buildHeliCrash(ctx, site) {
  const rng = ctx.rng.fork(0x4e11);
  const { world } = ctx;
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0);
  const W = fr.w, D = fr.d;
  const gy = (x, z) => ctx.ground[fr.wz(x, z) * ctx.SX + fr.wx(x, z)];
  const cx = Math.floor(W / 2), cz = Math.floor(D / 2);
  const base = gy(cx, cz) + 1;
  // scorched ground
  for (let x = 2; x < W - 2; x++) for (let z = 2; z < D - 2; z++) {
    const d = Math.hypot(x - cx, (z - cz) * 1.3);
    if (d > 14) continue;
    const g = gy(x, z);
    fr.set(x, g, z, d < 6 ? B.mud : rng.chance(0.5) ? B.dirt : B.forest_floor);
    for (let yy = g + 1; yy <= g + 12; yy++) { const id0 = fr.get(x, yy, z); if (id0 && (id0 === B.leaves_oak || id0 === B.leaves_autumn || id0 === B.leaves_autumn_red || id0 === B.leaves_pine || id0 === B.leaves_birch || id0 === B.tall_grass || id0 === B.fern || id0 === B.bush)) fr.set(x, yy, z, 0); }
    if (d > 6 && d < 13 && rng.chance(0.04)) fr.set(x, g + 1, z, B.log_oak); // felled trunks
  }
  // fuselage: 4 wide, 9 long, 3 tall, open side door, broken tail boom
  const fx0 = cx - 2, fz0 = cz - 5;
  for (let x = fx0; x < fx0 + 4; x++) for (let z = fz0; z < fz0 + 9; z++) for (let yy = base; yy < base + 3; yy++) {
    const shellCell = x === fx0 || x === fx0 + 3 || z === fz0 || z === fz0 + 8 || yy === base + 2;
    fr.clear(x, yy, z, shellCell ? (yy === base + 2 ? B.metal_wall : B.corrugated_metal) : 0);
    if (yy === base) fr.set(x, base - 1, z, B.metal_wall);
  }
  for (let z = fz0 + 2; z <= fz0 + 4; z++) { fr.clear(fx0 + 3, base, z, 0); fr.clear(fx0 + 3, base + 1, z, 0); }
  fr.markOpening(fx0 + 3, base, fz0 + 3);
  for (let x = fx0 + 1; x <= fx0 + 2; x++) fr.set(x, base + 1, fz0 + 8, B.glass_broken);
  for (let k = 1; k <= 7; k++) fr.clear(cx - (k > 4 ? 1 : 0), base + (k > 5 ? 1 : 0), fz0 - k, B.metal_wall);
  for (let k = -5; k <= 5; k++) { fr.clear(cx + k, base + 3, cz + Math.round(k * 0.3), k % 3 ? B.iron_bars : B.metal_wall); }
  for (let k = 0; k < 6; k++) fr.clear(cx + 6 + k, gy(cx + 6 + k, cz + 3) + 1, cz + 3 + (k >> 1), B.iron_bars);
  fr.clear(cx, base + 3, cz, B.metal_wall);
  // camo + fire
  for (let k = 0; k < 6; k++) { const x = fx0 + rng.int(-2, 5), z = fz0 + rng.int(-2, 10); const g = gy(x, z); if (fr.get(x, g + 1, z) === 0) fr.set(x, g + 1, z, rng.chance(0.5) ? B.fire : B.rubble); }
  fr.set(fx0 + 1, base + 3, fz0 + 6, B.fire);
  // cargo
  fr.container(fx0 + 1, base, fz0 + 2, 'crate_military', 0, 'heli_crash', { fixed: [{ id: 'note', count: 1, data: { noteId: 'heli_manifest' } }] });
  fr.container(fx0 + 2, base, fz0 + 2, 'crate_military', 0, 'heli_crash');
  fr.container(fx0 + 1, base, fz0 + 5, 'crate_military', 0, 'military_medical');
  fr.container(fx0 + 2, base, fz0 + 6, 'crate_military', 0, 'military_armory');
  fr.corpse(fx0 + 1, base, fz0 + 7, 0.5, 'military', 'corpse_military');
  const px = fx0 + 6, pz = fz0 + 4;
  fr.corpse(px, gy(px, pz) + 1, pz, 2.2, 'military', 'corpse_military');
  world.addNote(fr.px(px + 1.5, pz + 0.5), gy(px + 1, pz) + 1, fr.pz(px + 1.5, pz + 0.5), 'heli_pilot');
  ctx.usedNotes.add('heli_manifest'); ctx.usedNotes.add('heli_pilot');
  for (let k = 0; k < 3; k++) { const x = cx + rng.int(-10, 10), z = cz + rng.int(-10, 10); fr.loot(x, gy(x, z) + 1, z, 'floor_military', 0.7); }
  const zx = cx + 8, zz = cz - 6;
  fr.zombies(zx, gy(zx, zz) + 1, zz, 5, 6, { outfit: 'military', types: ['walker', 'walker', 'runner', 'brute'] });
  fr.zone(0, 0, W - 1, D - 1, ZONES.MILITARY);
  ctx.addPOI({ name: 'Helicopter Crash Site', type: 'military', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('heli_crash');
}
