// Rural Millbrook County: farms (farmhouse, barn, silo, sheds, fields), Lake Millbrook Campground,
// the ranger station with its lookout tower, hunting cabins and hidden survivor camps.
import { B } from '../blocks.js';
import { SURFACE, ZONES } from '../World.js';
import { Frame } from './frame.js';
import { buildHouse } from './houses.js';
import { shell, carvePlan, connect, exteriorDoor, roomWindows, gableRoof } from './building.js';
import { Room } from './furnish.js';
import { tent, watchtower } from './military.js';
import { tree } from './vegetation.js';
import { CAR_COLORS } from './util.js';

const Y0 = SURFACE, Y = Y0 + 1;

// ----------------------------------------------------------------------------- crops
export function cropField(fr, x0, z0, x1, z1, kind, rng) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (fr.get(x, Y, z) !== 0 && fr.get(x, Y, z) !== B.tall_grass) continue;
    const rowGap = (z - z0) % 4 === 3;
    fr.set(x, Y0, z, rowGap ? B.dirt_path : B.dirt);
    fr.set(x, Y, z, 0);
    if (rowGap) continue;
    const r = rng.next();
    if (kind === 'corn') { if (r < 0.93) { fr.set(x, Y, z, B.corn); fr.set(x, Y + 1, z, r < 0.85 ? B.corn_top : 0); } else if (r < 0.96) fr.set(x, Y, z, B.dead_bush); }
    else if (kind === 'wheat') { if (r < 0.9) fr.set(x, Y, z, B.wheat); }
    else if (kind === 'pumpkin') { if (r < 0.22) fr.set(x, Y, z, B.pumpkin); else if (r < 0.5) fr.set(x, Y, z, B.tall_grass); }
  }
}
function scarecrow(fr, x, z) {
  fr.set(x, Y, z, B.fence_post); fr.set(x, Y + 1, z, B.hay_bale); fr.set(x, Y + 2, z, B.pumpkin);
}
function fenceRect(fr, x0, z0, x1, z1, kind, gapAt = null) {
  for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) {
    if (gapAt && gapAt(x, z)) continue;
    if (fr.get(x, Y, z) === 0) fr.place(x, Y, z, x === x0 || x === x1 ? 'fence_post' : kind, 0);
  }
  for (let z = z0 + 1; z < z1; z++) for (const x of [x0, x1]) {
    if (gapAt && gapAt(x, z)) continue;
    if (fr.get(x, Y, z) === 0) fr.place(x, Y, z, kind, 1);
  }
}

// ----------------------------------------------------------------------------- barn / silo / sheds
function barn(ctx, fr, x0, z0, rng, notes = {}) {
  const W = 15, D = 21;
  const bf = fr.sub(x0, z0, W, D);
  bf.fill(0, Y0, 0, W - 1, Y0, D - 1, B.planks_dark);
  bf.walls(0, Y, 0, W - 1, Y + 5, D - 1, B.barn_red);
  bf.fill(1, Y, 1, W - 2, Y + 5, D - 2, 0);
  // loft along the back third
  bf.fill(1, Y + 4, 1, W - 2, Y + 4, 6, B.planks_oak);
  gableRoof(bf, W, D, Y + 6, 'red', 'barn_red', false, { overhang: 1 });
  // big doors front + back
  for (let x = 5; x <= 9; x++) for (let yy = Y; yy <= Y + 3; yy++) bf.clear(x, yy, D - 1, 0);
  for (let x = 5; x <= 9; x++) bf.markOpening(x, Y, D - 1);
  for (let x = 6; x <= 8; x++) for (let yy = Y; yy <= Y + 2; yy++) bf.clear(x, yy, 0, 0);
  bf.markOpening(7, Y, 0);
  // stalls along both side walls
  for (const sx of [1, W - 2]) {
    for (let z = 8; z <= D - 3; z += 3) {
      for (let k = 1; k <= 3; k++) bf.place(sx + (sx === 1 ? k - 1 : -(k - 1)), Y, z, 'fence_wood', 0);
      bf.set(sx, Y, z + 1, B.hay_bale);
      if (rng.chance(0.4)) bf.set(sx, Y + 1, z + 1, B.hay_bale);
    }
  }
  // loft hay + ladder
  for (let x = 1; x <= W - 2; x++) for (let z = 1; z <= 5; z++) if (rng.chance(0.45)) { bf.set(x, Y + 5, z, B.hay_bale); if (rng.chance(0.3) && x > 2) bf.set(x, Y + 6, z, B.hay_bale); }
  for (let yy = Y; yy <= Y + 4; yy++) { bf.clear(W - 3, yy, 7, 0); bf.place(W - 3, yy, 7, 'ladder', 0); }
  bf.clear(W - 3, Y + 4, 6, 0); bf.clear(W - 3, Y + 5, 6, 0); bf.clear(W - 3, Y + 6, 6, 0);
  bf.container(3, Y + 5, 2, 'crate_wood', 0, 'farm_barn', notes.loft ? { fixed: [{ id: 'note', count: 1, data: { noteId: notes.loft } }] } : {});
  if (notes.loft) ctx.usedNotes.add(notes.loft);
  // workbench, barrels, crates
  bf.place(6, Y, 1, 'workbench'); bf.place(6, Y + 1, 1, 'toolbox');
  bf.container(7, Y, 1, 'metal_shelf', 0, 'farm_barn');
  bf.container(2, Y, 1, 'barrel_rust', 0, 'farm_barn'); bf.container(3, Y, 1, 'barrel_rust', 0, 'farm_barn');
  bf.container(W - 3, Y, 1, 'crate_wood', 0, 'farm_barn'); bf.container(W - 4, Y, 1, 'crate_wood', 0, 'farm_barn');
  bf.vehicle(7.5, 13, rng.chance(0.5) ? 0 : Math.PI, 'tractor', { color: rng.pick([0x2e7d32, 0xc62828, 0x1565c0]), loot: 'pickup_bed' });
  bf.zombies(7, Y, 9, rng.int(1, 3), 3, { indoor: true, outfit: 'farmer' });
  ctx.building('barn');
  return bf;
}
function silo(ctx, fr, cx, cz, rng) {
  const R = 3, H = 15;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > R + 0.4) continue;
    fr.set(cx + dx, Y0, cz + dz, B.concrete);
    for (let yy = Y; yy < Y + H; yy++) fr.set(cx + dx, yy, cz + dz, d > R - 0.6 ? (yy % 4 === 0 ? B.metal_wall : B.concrete_white) : 0);
    const dome = Math.round(Math.sqrt(Math.max(0, R * R - d * d)) * 0.8);
    for (let k = 0; k <= dome; k++) fr.set(cx + dx, Y + H + k, cz + dz, k === dome ? B.roof_metal : 0);
    fr.set(cx + dx, Y + H, cz + dz, B.roof_metal);
  }
  fr.clear(cx, Y, cz + R, 0); fr.clear(cx, Y + 1, cz + R, 0);
  for (let yy = Y; yy < Y + H; yy++) fr.place(cx, yy, cz - R + 1, 'ladder', 0);
  fr.set(cx, Y, cz, B.hay_bale);
  ctx.building('silo');
}
function machineShed(ctx, fr, x0, z0, rng) {
  const W = 10, D = 8;
  const sf = fr.sub(x0, z0, W, D);
  sf.fill(0, Y0, 0, W - 1, Y0, D - 1, B.gravel);
  sf.fill(0, Y, 0, W - 1, Y + 3, 0, B.corrugated_metal);
  sf.fill(0, Y, 0, 0, Y + 3, D - 1, B.corrugated_metal);
  sf.fill(W - 1, Y, 0, W - 1, Y + 3, D - 1, B.corrugated_metal);
  sf.fill(0, Y + 4, 0, W - 1, Y + 4, D - 1, B.roof_metal);
  sf.container(1, Y, 1, 'metal_shelf', 0, 'farm_shed'); sf.container(2, Y, 1, 'metal_shelf', 0, 'farm_shed');
  sf.place(W - 2, Y, 1, 'workbench'); sf.container(W - 2, Y + 1, 1, 'toolbox', 0, 'mechanic');
  sf.container(W - 3, Y, 1, 'barrel_rust', 0, 'farm_shed');
  sf.vehicle(W / 2, D / 2 + 0.5, 0, rng.chance(0.5) ? 'pickup' : 'tractor', { color: rng.pick(CAR_COLORS), loot: 'pickup_bed', gloveLoot: 'car_glovebox' });
  ctx.building('machine_shed');
}

/**
 * Farmstead in frame fr (front = road side, +z). area: the rest of the site becomes fields/pasture.
 */
function farmstead(ctx, fr, name, rng, opts = {}) {
  const w = fr.w, d = fr.d;
  // ground
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) if (fr.get(x, Y0, z) === B.grass && rng.chance(0.3)) fr.set(x, Y0, z, B.dry_grass);
  // driveway
  const dx = opts.driveX ?? 24;
  for (let z = 4; z < d + 3; z++) for (let x = dx; x <= dx + 2; x++) {
    const g = fr.get(x, Y0, z);
    if (g === B.grass || g === B.dry_grass || g === B.gravel || g === B.dirt) { fr.set(x, Y0, z, B.dirt_path); if (fr.get(x, Y, z) !== 0 && !B.mailbox) fr.set(x, Y, z, 0); }
  }
  for (let x = 6; x <= dx + 30 && x < w - 2; x++) for (let z = 26; z <= 30; z++) if (fr.get(x, Y0, z) !== B.planks_dark) fr.set(x, Y0, z, B.dirt_path);
  fr.place(dx - 1, Y, d - 1, 'mailbox');
  fr.signCentered(dx - 12, dx - 2, Y + 1, d, name.toUpperCase().slice(0, 11), 0);
  for (let x = dx - 12; x <= dx - 2; x++) fr.set(x, Y, d - 1, B.fence_post);
  // farmhouse (colonial with porch) near the road
  const plan = farmPlan(rng);
  const hx = dx + 6, hz = d - 7 - plan.D;
  const hf = fr.sub(hx, hz, plan.W, plan.D);
  const info = buildHouse(ctx, hf, plan, { outer: rng.pick(['siding_white', 'siding_white', 'planks_white', 'siding_yellow']), roof: rng.pick(['red', 'dark', 'brown']), chimney: true }, rng, opts.cond || 'normal', { locked: rng.chance(0.4) });
  // porch across the front
  const fz = hz + plan.D;
  for (let x = hx - 1; x <= hx + plan.W; x++) for (let z = fz; z <= fz + 2; z++) if (fr.get(x, Y0, z) !== B.dirt_path) fr.set(x, Y0, z, B.planks_oak);
  for (let x = hx - 1; x <= hx + plan.W; x++) for (let z = fz + 1; z <= fz + 2; z++) if (fr.get(x, Y0 + 4, z) === 0) fr.set(x, Y0 + 4, z, B.roof_red_slab);
  for (const x of [hx - 1, hx + plan.W]) for (let yy = Y; yy <= Y + 2; yy++) fr.set(x, yy, fz + 2, B.fence_post);
  const doorLX = hx + info.frontDoor.x;
  for (let z = fz + 3; z < d; z++) if (fr.get(doorLX, Y0, z) === B.grass || fr.get(doorLX, Y0, z) === B.dry_grass) fr.set(doorLX, Y0, z, B.dirt_path);
  // water pump behind the house (clean water)
  fr.place(hx + 3, Y, hz - 3, 'water_pump');
  fr.place(hx + 5, Y, hz - 2, 'rain_barrel');
  // note
  if (opts.note) {
    const r = info.rooms.find((q) => q.type === 'kitchen' && q.furn) || info.rooms.find((q) => q.furn);
    const c = r && r.furn.randomFree();
    if (c) hf.note(c[0], r.y + 1, c[1], opts.note);
    ctx.usedNotes.add(opts.note);
  }
  if (rng.chance(0.6)) { const r = info.rooms.find((q) => q.furn && q.f === 0); const c = r && r.furn.randomFree(); if (c) hf.zombies(c[0], r.y + 1, c[1], 1, 1, { indoor: true, outfit: 'farmer' }); }
  // barn + silo + machine shed behind
  barn(ctx, fr, dx + 4, 2, rng, { loft: opts.loftNote });
  silo(ctx, fr, dx + 24, 8, rng);
  machineShed(ctx, fr, dx - 14, 4, rng);
  // chicken coop + woodpile
  const cx0 = dx - 12, cz0 = 18;
  fr.fill(cx0, Y, cz0, cx0 + 3, Y + 1, cz0 + 2, B.planks_dark); fr.fill(cx0 + 1, Y, cz0 + 1, cx0 + 2, Y + 1, cz0 + 1, 0); fr.fill(cx0, Y + 2, cz0, cx0 + 3, Y + 2, cz0 + 2, B.roof_brown_slab);
  fr.set(cx0 + 1, Y, cz0 + 2, 0); fr.set(cx0 + 1, Y + 1, cz0 + 2, 0); fr.set(cx0 + 2, Y, cz0 + 1, B.hay_bale);
  for (let k = 0; k < 4; k++) fr.set(hx - 3, Y + (k >> 1), hz + 2 + (k & 1), B.log_oak);
  // vehicles + farmer zombies around
  fr.vehicle(dx + 1.5, d - 12, Math.PI + rng.range(-0.2, 0.2), 'pickup', { color: rng.pick([0x8a1c1c, 0x2f5f2f, 0x1c3f8a, 0x9a8a5a]), loot: 'pickup_bed', gloveLoot: 'car_glovebox' });
  fr.zombies(dx, Y, 30, rng.int(2, 3), 6, { outfit: 'farmer' });
  // fenced pasture on the far side
  const pX0 = Math.min(w - 4, dx + 32), pX1 = w - 3;
  if (pX1 - pX0 > 10) {
    fenceRect(fr, pX0, 3, pX1, Math.min(d - 4, 40), 'fence_wood', (x, z) => z === Math.min(d - 4, 40) && x >= pX0 + 2 && x <= pX0 + 4);
    for (let k = 0; k < 6; k++) { const x = rng.int(pX0 + 2, pX1 - 2), z = rng.int(5, Math.min(d - 6, 38)); if (fr.get(x, Y, z) === 0) fr.set(x, Y, z, B.hay_bale); }
  }
  // trees around the house
  for (let k = 0; k < 6; k++) {
    const x = rng.int(2, w - 3), z = rng.int(d - 6, d - 2);
    if (fr.get(x, Y, z) === 0 && fr.get(x, Y0, z) === B.grass && Math.abs(x - dx - 1) > 3 && (x < hx - 3 || x > hx + plan.W + 3)) tree(ctx.world, fr.wx(x, z), Y, fr.wz(x, z), 'oak', rng.next(), ctx.seed);
  }
  ctx.building('farm');
  return { hx, hz, plan, info };
}

function farmPlan(rng) {
  // farmhouses are colonials
  const W = rng.int(15, 17), D = rng.int(12, 13);
  const X0 = 2, X1 = W - 3, Z0 = 2, Z1 = D - 3, IW = X1 - X0 + 1, ID = Z1 - Z0 + 1;
  const lw = Math.floor((IW - 4) / 2);
  const hx = X0 + lw + 1, rx = hx + 3, kd = 5;
  const R = (id, type, x0, z0, x1, z1) => ({ id, type, x0, z0, x1, z1 });
  const zl = Z0 + Math.floor(ID / 2);
  return {
    kind: 'farmhouse', W, D,
    floors: [
      { rooms: [R('hall', 'hall', hx, Z0, hx + 1, Z1), R('living', 'living', X0, Z0, hx - 2, Z1), R('kitchen', 'kitchen', rx, Z0, X1, Z0 + kd - 1), R('front', 'den', rx, Z0 + kd + 1, X1, Z1)], conns: [['living', ['hall'], 'wide'], ['kitchen', ['hall'], 'open'], ['front', ['hall'], 'door']] },
      { rooms: [R('hall', 'hall', hx, Z0, hx + 1, Z1), R('bed1', 'master', X0, Z0, hx - 2, zl - 1), R('bed2', 'kids', X0, zl + 1, hx - 2, Z1), R('bath', 'bathroom', rx, Z0, X1, Z0 + 2), R('bed3', 'bedroom', rx, Z0 + 4, X1, Z1)], conns: [['bed1', ['hall'], 'door'], ['bed2', ['hall'], 'door'], ['bath', ['hall'], 'door'], ['bed3', ['hall'], 'door']] },
    ],
    entry: 'hall', entryX: hx + 1, back: 'kitchen', stairs: { x: hx, z: Z1 - 1 },
  };
}

export function buildFarm(ctx, site) {
  const rng = ctx.rng.fork(0xfa00 + site.x0);
  let fr, name, note, loft;
  if (site.key === 'farm_hollister') { fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0); name = 'Hollister Farm'; note = 'hollister_diary'; }
  else if (site.key === 'farm_dawson') { fr = Frame.fromRect(ctx, site.x0, site.z0, site.x0 + 80, site.z1, 1); name = 'Dawson Farm'; note = 'dawson_letter'; }
  else { fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 2); name = 'Pruitt Farm'; note = 'pruitt_note'; loft = null; }
  farmstead(ctx, fr, name, rng, { note, loftNote: loft, driveX: 30 });
  // Dawson: fields on the rest of the site (east part)
  if (site.key === 'farm_dawson') {
    const ff = Frame.fromRect(ctx, site.x0 + 84, site.z0, site.x1, site.z1, 0);
    fieldBlock(ctx, ff, rng);
  }
  if (site.key === 'farm_pruitt') {
    // moonshine still in a shed + the hollow log stash at the woods' edge
    const sf = fr.sub(4, fr.d - 20, 6, 5);
    sf.walls(0, Y, 0, 5, Y + 2, 4, B.planks_dark); sf.fill(0, Y + 3, 0, 5, Y + 3, 4, B.roof_metal); sf.fill(1, Y, 1, 4, Y + 2, 3, 0);
    sf.door(2, Y, 4, 0, 'door_wood', { locked: true });
    sf.container(1, Y, 1, 'barrel_rust', 0, 'liquor_store'); sf.container(2, Y, 1, 'barrel_rust', 0, 'liquor_store'); sf.set(3, Y, 1, B.campfire_out); sf.container(4, Y, 1, 'crate_wood', 0, 'liquor_store');
    const lx = site.x1 + 6, lz = site.z0 + 22;
    const g = ctx.ground[lz * ctx.SX + lx];
    ctx.world.set(lx, g + 1, lz, B.hollow_log);
    ctx.world.addContainer(lx, g + 1, lz, 'survivor_stash', { fixed: [{ id: 'whiskey', count: 2 }, { id: 'cigarettes', count: 2 }, { id: 'rifle_22', count: 1 }, { id: 'ammo_22', count: 25 }] });
  }
  fr.zone(0, 0, fr.w - 1, fr.d - 1, ZONES.FARM);
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.FARM);
  ctx.addPOI({ name, type: 'farm', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
}

function fieldBlock(ctx, ff, rng) {
  const W = ff.w, D = ff.d;
  const kinds = rng.shuffle(['corn', 'corn', 'wheat', 'pumpkin', 'corn']);
  const nx = W > 70 ? 2 : 1, nz = D > 70 ? 2 : 1;
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = 2 + Math.floor(i * W / nx), x1 = Math.floor((i + 1) * W / nx) - 3;
    const z0 = 2 + Math.floor(j * D / nz), z1 = Math.floor((j + 1) * D / nz) - 3;
    const kind = kinds[k++ % kinds.length];
    cropField(ff, x0, z0, x1, z1, kind, rng);
    fenceRect(ff, x0 - 1, z0 - 1, x1 + 1, z1 + 1, 'fence_wood', (x, z) => (x - x0) % 23 === 5 || (z - z0) % 31 === 7);
    if (kind === 'corn') {
      scarecrow(ff, Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2));
      ff.zombies(Math.floor((x0 + x1) / 2) + 4, Y, Math.floor((z0 + z1) / 2) + 3, rng.int(2, 4), 8, { outfit: 'farmer' });
    }
  }
  for (let k2 = 0; k2 < 8; k2++) { const x = rng.int(1, W - 2), z = rng.int(1, D - 2); if (ff.get(x, Y, z) === 0 && ff.get(x, Y0, z) !== 0) ff.set(x, Y, z, B.hay_bale); }
  ff.zone(0, 0, W - 1, D - 1, ZONES.FARM);
}

export function buildFields(ctx, site) {
  const rng = ctx.rng.fork(0xf1e1 + site.x0);
  const ff = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0);
  fieldBlock(ctx, ff, rng);
  if (site.key === 'fields_pruitt') {
    // abandoned tractor in the field
    ff.vehicle(20, 12, 1.2, 'tractor', { color: 0xc62828, loot: 'pickup_bed', wrecked: true });
  }
}

// ============================================================================ CAMPGROUND
export function buildCampground(ctx, site) {
  const rng = ctx.rng.fork(0xca3b);
  const { world } = ctx;
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 3); // front faces east (Lake Road)
  const W = fr.w, D = fr.d; // w along z (97), d along x (63)
  // gravel loop road
  const rx0 = 6, rx1 = W - 7, rz0 = 10, rz1 = D - 8;
  for (let x = rx0; x <= rx1; x++) for (const z of [rz0, rz1]) for (let k = 0; k < 3; k++) fr.set(x, Y0, z + k - 1, B.gravel);
  for (let z = rz0; z <= rz1; z++) for (const x of [rx0, rx1]) for (let k = 0; k < 3; k++) fr.set(x + k - 1, Y0, z, B.gravel);
  const mid = Math.floor(W / 2);
  for (let z = rz1; z < D + 4; z++) for (let x = mid - 1; x <= mid + 1; x++) fr.set(x, Y0, z, B.gravel);
  fr.signCentered(mid - 12, mid - 3, Y + 1, D - 1, 'CAMPGROUND', 0);
  for (let x = mid - 12; x <= mid - 3; x++) fr.set(x, Y, D - 2, B.fence_post);
  // office cabin at the entrance
  const of = fr.sub(mid + 4, D - 12, 9, 8);
  smallCabin(ctx, of, rng, { loot: 'ranger_station', name: 'office', desk: true });
  // restrooms
  const wc = fr.sub(rx1 - 14, rz0 + 3, 8, 6);
  wc.fill(0, Y0, 0, 7, Y0, 5, B.concrete); wc.walls(0, Y, 0, 7, Y + 2, 5, B.cobblestone); wc.fill(0, Y + 3, 0, 7, Y + 3, 5, B.roof_dark_slab);
  wc.door(3, Y, 5, 0, 'door_wood', {}); wc.place(1, Y, 1, 'toilet', 0); wc.place(3, Y, 1, 'toilet', 0); wc.place(5, Y, 1, 'kitchen_sink', 0); wc.place(6, Y, 1, 'kitchen_sink', 0);
  // campsites along the loop: tent + picnic table + fire ring + car
  let sites = 0;
  for (let x = rx0 + 6; x <= rx1 - 6; x += 9) {
    for (const [zt, f] of [[rz0 + 4, 0], [rz1 - 8, 2]]) {
      const kind = rng.weighted([['tent', 5], ['rv', 2], ['empty', 1]]);
      if (kind === 'empty') continue;
      if (kind === 'tent') {
        const t = tent(fr, x, zt, 4, 4, rng.pick(['tent_orange', 'tent_green', 'tent_orange']), rng, {});
        if (t) { fr.place(t.x0, Y, t.z0, 'bed_head', 0); fr.place(t.x0, Y, t.z0 + 1, 'bed_foot', 0); fr.container(t.x1, Y, t.z0, 'crate_wood', 0, 'campsite'); }
      } else {
        fr.vehicle(x + 2, zt + 2, Math.PI / 2, 'van', { color: 0xeeeeee, loot: 'car_trunk', gloveLoot: 'car_glovebox' });
      }
      const pz = f === 0 ? zt + 6 : zt - 2;
      if (fr.get(x + 1, Y, pz) === 0) { fr.place(x + 1, Y, pz, 'table'); fr.place(x + 2, Y, pz, 'table'); fr.place(x + 1, Y, pz - 1, 'bench', 0); fr.place(x + 2, Y, pz - 1, 'bench', 0); fr.place(x + 1, Y, pz + 1, 'bench', 2); fr.place(x + 2, Y, pz + 1, 'bench', 2); }
      fr.set(x + 5, Y, pz, B.campfire_out);
      if (rng.chance(0.3)) fr.loot(x + 2, Y + 1, pz, 'floor_camp', 0.7, -0.18);
      if (rng.chance(0.4)) fr.vehicle(x + 6, f === 0 ? zt + 1 : zt + 3, rng.range(0, 6.28) * 0 + Math.PI / 2, rng.pick(['suv', 'pickup', 'sedan']), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox' });
      sites++;
    }
  }
  // cabins in the middle
  for (let k = 0; k < 4; k++) {
    const cf = fr.sub(rx0 + 8 + k * 16, Math.floor((rz0 + rz1) / 2) - 4, 8, 7);
    smallCabin(ctx, cf, rng, { loot: 'campsite', note: k === 2 ? 'campground_note' : null });
  }
  // dock into the lake (west side = local -z... front faces east, so the lake is at local z < 0)
  const dockX = mid - 4;
  for (let z = -1; z >= -14; z--) {
    for (let x = dockX; x <= dockX + 2; x++) {
      const wx = fr.wx(x, z), wz = fr.wz(x, z);
      if (!ctx.water[wz * ctx.SX + wx] && z < -3) continue;
      world.set(wx, 19, wz, B.planks_oak);
      if (world.get(wx, 20, wz) !== 0 && world.get(wx, 20, wz) !== B.reeds) world.set(wx, 20, wz, 0);
      if (world.get(wx, 20, wz) === B.reeds) world.set(wx, 20, wz, 0);
    }
  }
  for (let k = 0; k < 4; k++) fr.zombies(rx0 + 10 + k * 18, Y, rng.int(rz0 + 2, rz1 - 2), rng.int(2, 3), 5, { outfit: rng.pick(['civilian', 'civilian_f', 'hunter']) });
  fr.corpse(mid, Y, rz0 + 2, 1, 'civilian', 'corpse_civilian');
  fr.zone(0, 0, W - 1, D - 1, ZONES.CAMP);
  ctx.addPOI({ name: 'Lake Millbrook Campground', type: 'camp', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.stats.campsites = sites;
  ctx.building('campground');
}

/** Small log cabin (frame w x d, door at front centre). */
function smallCabin(ctx, cf, rng, o = {}) {
  const W = cf.w, D = cf.d;
  cf.fill(0, Y0, 0, W - 1, Y0, D - 1, B.planks_oak);
  cf.walls(0, Y, 0, W - 1, Y + 2, D - 1, o.wall ? B[o.wall] : B.log_oak);
  cf.fill(1, Y, 1, W - 2, Y + 2, D - 2, 0);
  gableRoof(cf, W, D, Y + 3, o.roof || 'brown', o.wall || 'planks_dark', true, { overhang: 1 });
  cf.fill(1, Y + 3, 1, W - 2, Y + 3, D - 2, B.planks_dark);
  const dx = Math.floor(W / 2);
  cf.door(dx, Y, D - 1, 0, 'door_wood', { locked: o.locked ?? rng.chance(0.3) });
  for (const [x, z] of [[1, D - 1], [W - 2, D - 1], [0, 2], [W - 1, 2], [0, D - 3], [W - 1, D - 3]]) if (Math.abs(x - dx) > 1 || z !== D - 1) cf.set(x, Y + 1, z, B.glass);
  const r = new Room(cf, { x0: 1, z0: 1, x1: W - 2, z1: D - 2, y: Y0 }, rng, { height: 3 });
  r.bed(rng.chance(0.4));
  if (o.desk) { r.deskSet('desk', { loot: o.loot }); r.wall('filing_cabinet', { loot: o.loot }); r.wall('table', { top: 'radio', access: false }); }
  else { r.tableSet(1, 1, 2); r.wall('stove'); }
  r.wall(o.gun ? 'gun_cabinet' : 'wardrobe', { loot: o.gun ? o.loot : null });
  r.wall('crate_wood', { loot: o.loot });
  if (o.fixedCrate) r.wall('crate_wood', { loot: o.loot, opts: { fixed: o.fixedCrate } });
  const c = r.randomFree();
  if (o.note && c) { cf.note(c[0], Y, c[1], o.note); ctx.usedNotes.add(o.note); }
  r.floorLoot('floor_camp', 1, 0.5);
  ctx.building('cabin');
  return r;
}

// ============================================================================ RANGER STATION + LOOKOUT
export function buildRanger(ctx, site) {
  const rng = ctx.rng.fork(0x4a46);
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 1); // front faces west (Route 9)
  const W = fr.w, D = fr.d; // w along z, d along x
  for (let x = 0; x < W; x++) for (let z = D - 14; z < D; z++) fr.set(x, Y0, z, B.gravel);
  // station: log building 15 x 11 with office, bunks, storage
  const sw = 15, sd = 11;
  const sf = fr.sub(6, D - 15 - sd, sw, sd);
  shell(sf, { W: sw, D: sd, floors: 1, storeyH: 4, outer: 'log_pine', inner: 'wall_wood_panel', ceiling: 'planks_dark' });
  gableRoof(sf, sw, sd, Y0 + 4, 'dark', 'log_pine', true);
  const rooms = [
    { id: 'office', x0: 2, z0: 5, x1: 7, z1: sd - 3, floor: 'floor_wood', wall: 'wall_wood_panel' },
    { id: 'storage', x0: 2, z0: 2, x1: 7, z1: 3, floor: 'planks_dark', wall: 'wall_wood_panel' },
    { id: 'bunk', x0: 9, z0: 2, x1: sw - 3, z1: sd - 3, floor: 'planks_oak', wall: 'wall_wood_panel' },
  ];
  carvePlan(sf, Y0, rooms, 'wall_wood_panel', 3, { x0: 2, z0: 2, x1: sw - 3, z1: sd - 3 });
  connect(sf, Y0, rooms[0], rooms[1], 'door', rng, { door: 'door_wood', locked: true });
  connect(sf, Y0, rooms[0], rooms[2], 'door', rng, { door: 'door_wood' });
  exteriorDoor(sf, Y0, rooms[0], 'front', sw, sd, 'door_wood', rng, { locked: false });
  for (const r of rooms) roomWindows(sf, Y0, r, { x0: 2, z0: 2, x1: sw - 3, z1: sd - 3 }, sw, sd, 'glass', rng, null, {});
  const off = new Room(sf, { ...rooms[0], y: Y0 }, rng, { height: 3 });
  off.deskSet('desk', { loot: 'ranger_station' }); off.wall('table', { top: 'radio', access: false }); off.wall('filing_cabinet', { loot: 'ranger_station' }); off.wall('bookshelf', { loot: 'ranger_station' });
  const oc = off.randomFree(); if (oc) sf.note(oc[0], Y, oc[1], 'ranger_log');
  ctx.usedNotes.add('ranger_log');
  const st = new Room(sf, { ...rooms[1], y: Y0 }, rng, { height: 3 });
  st.wall('gun_cabinet', { loot: 'ranger_station' }); st.wall('metal_shelf', { loot: 'ranger_station' }); st.wall('crate_wood', { loot: 'ranger_station' });
  const bk = new Room(sf, { ...rooms[2], y: Y0 }, rng, { height: 3 });
  bk.bed(false); bk.bed(false); bk.wall('locker', { loot: 'ranger_station' }); bk.wall('stove'); bk.wall('fridge');
  sf.signCentered(1, sw - 2, Y + 2, sd, 'RANGER', 0);
  fr.vehicle(W - 6, D - 6, Math.PI / 2, 'pickup', { color: 0x2f5f2f, loot: 'pickup_bed', gloveLoot: 'car_glovebox' });
  for (let yy = Y; yy <= Y + 8; yy++) fr.set(4, yy, D - 4, B.street_pole);
  // lookout tower behind the station
  const tx = 30, tz = 14;
  const H = 15;
  for (const [dx, dz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) for (let yy = Y; yy < Y + H; yy++) fr.set(tx + dx, yy, tz + dz, B.log_pine);
  for (let yy = Y + 3; yy < Y + H; yy += 4) for (let k = 1; k <= 3; k++) { fr.set(tx + k, yy, tz, B.planks_dark); fr.set(tx + k, yy, tz + 4, B.planks_dark); fr.set(tx, yy, tz + k, B.planks_dark); fr.set(tx + 4, yy, tz + k, B.planks_dark); }
  const py = Y + H;
  fr.fill(tx - 1, py, tz - 1, tx + 5, py, tz + 5, B.planks_oak);
  fr.walls(tx - 1, py + 1, tz - 1, tx + 5, py + 3, tz + 5, B.planks_dark);
  for (let k = 0; k <= 4; k++) for (const yy of [py + 2]) { fr.set(tx + k, yy, tz - 1, B.glass); fr.set(tx + k, yy, tz + 5, B.glass); fr.set(tx - 1, yy, tz + k, B.glass); fr.set(tx + 5, yy, tz + k, B.glass); }
  gableRoof(fr.sub(tx - 1, tz - 1, 7, 7), 7, 7, py + 4, 'dark', 'planks_dark', true);
  // ladder up the middle, hatch
  const lx = tx + 2, lz = tz + 2;
  for (let yy = Y; yy <= py; yy++) { fr.clear(lx, yy, lz, 0); fr.place(lx, yy, lz, 'ladder', 0); }
  for (let yy = Y; yy <= py; yy++) if (fr.get(lx, yy, lz - 1) === 0) fr.set(lx, yy, lz - 1, B.log_pine);
  fr.container(tx, py + 1, tz + 4, 'gun_cabinet', 0, 'ranger_station', { fixed: [{ id: 'rifle_hunting', count: 1 }, { id: 'ammo_308', count: 20 }] });
  fr.place(tx + 4, py + 1, tz, 'table'); fr.place(tx + 4, py + 2, tz, 'radio', 2);
  fr.note(tx + 1, py + 1, tz + 1, 'lookout_note');
  ctx.usedNotes.add('lookout_note');
  fr.place(tx + 3, py + 1, tz + 4, 'bed_head', 2); fr.place(tx + 3, py + 1, tz + 3, 'bed_foot', 2);
  fr.zombies(14, Y, D - 8, 2, 4, { outfit: 'hunter' });
  if (ctx.debugLabels) ctx.reachChecks.push({ name: 'lookout tower', start: [fr.wx(tx + 2, tz + 6), Y, fr.wz(tx + 2, tz + 6)], targets: [[fr.wx(tx + 1, tz + 2), py + 1, fr.wz(tx + 1, tz + 2), 'top']], fuzzy: true });
  fr.zone(0, 0, W - 1, D - 1, ZONES.CAMP);
  ctx.addPOI({ name: 'Ranger Station', type: 'ranger', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.addPOI({ name: 'Lookout Tower', type: 'landmark', ...fr.worldRect(tx - 2, tz - 2, tx + 6, tz + 6) });
  ctx.building('ranger_station');
  ctx.building('lookout_tower');
}

// ============================================================================ HUNTING CABINS
export function buildCabin(ctx, site) {
  const rng = ctx.rng.fork(0xcab0 + site.x0);
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, rng.int(0, 3));
  const W = fr.w, D = fr.d;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) if (fr.get(x, Y0, z) === B.grass) fr.set(x, Y0, z, rng.chance(0.6) ? B.forest_floor : B.dirt);
  const cf = fr.sub(Math.floor(W / 2) - 4, Math.floor(D / 2) - 4, 9, 7);
  const note = site.key === 'cabin_ne' ? 'cabin_hunter' : null;
  smallCabin(ctx, cf, rng, { loot: 'hunting_cabin', gun: true, note, wall: 'log_oak', roof: 'dark', locked: false });
  // fireplace + woodpile + outhouse + tree stand
  cf.set(0, Y, 3, B.cobblestone); cf.set(-1, Y, 3, B.cobblestone); cf.set(-1, Y + 1, 3, B.cobblestone); cf.set(-1, Y + 2, 3, B.cobblestone); cf.set(-1, Y + 3, 3, B.cobblestone); cf.set(-1, Y + 4, 3, B.cobblestone);
  for (let k = 0; k < 6; k++) fr.set(Math.floor(W / 2) + 6, Y + (k % 2), Math.floor(D / 2) - 3 + (k >> 1), B.log_oak);
  const ox = Math.floor(W / 2) - 8, oz = Math.floor(D / 2) + 4;
  fr.walls(ox, Y, oz, ox + 2, Y + 2, oz + 3, B.planks_dark); fr.fill(ox, Y + 3, oz, ox + 2, Y + 3, oz + 3, B.roof_brown_slab);
  fr.fill(ox + 1, Y, oz + 1, ox + 1, Y + 1, oz + 2, 0);
  fr.place(ox + 1, Y, oz + 1, 'toilet', 0); fr.door(ox + 1, Y, oz + 3, 0, 'door_wood', {});
  const st = watchtower(fr, W - 7, 3, rng, { h: 4 });
  fr.container(st.top[0], st.top[1], st.top[2], 'crate_wood', 0, 'hunting_cabin');
  fr.zombies(W - 8, Y, D - 6, rng.int(1, 2), 3, { outfit: 'hunter' });
  ctx.addPOI({ name: site.key === 'cabin_ne' ? 'Hunting Cabin' : site.key === 'cabin_e' ? "Miller's Hunting Cabin" : "Old Coleman Cabin", type: 'cabin', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  fr.zone(0, 0, W - 1, D - 1, ZONES.CAMP);
}

// ============================================================================ SURVIVOR CAMPS
const CAMP_NOTES = ['camp_0', 'camp_1', 'camp_2', 'camp_3', 'camp_4', 'camp_5'];
export function buildSurvivorCamp(ctx, site) {
  const rng = ctx.rng.fork(0x5c00 + site.x0 + site.z0);
  const { world } = ctx;
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, rng.int(0, 3));
  const W = fr.w, D = fr.d;
  const gy = (x, z) => ctx.ground[fr.wz(x, z) * ctx.SX + fr.wx(x, z)];
  const cx = Math.floor(W / 2), cz = Math.floor(D / 2);
  const base = gy(cx, cz);
  const Yc = base + 1;
  // clear the clearing
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < D - 1; z++) {
    const g = gy(x, z);
    for (let yy = g + 1; yy <= g + 3; yy++) { const id0 = fr.get(x, yy, z); if (id0 === B.tall_grass || id0 === B.fern || id0 === B.bush || id0 === B.flower_red || id0 === B.flower_yellow || id0 === B.dead_bush) fr.set(x, yy, z, 0); }
  }
  const lit = site.camp === 5 || site.camp === 1 || rng.chance(0.3);
  fr.set(cx, Yc, cz, lit ? B.campfire : B.campfire_out);
  for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2]]) fr.set(cx + dx, Yc, cz + dz, B.log_oak);
  const t = tent(fr, cx - 2, cz + 3 - (D > 14 ? 0 : 1), 4, 4, rng.pick(['tent_green', 'tent_orange']), rng, { force: true, floor: 'dirt' });
  if (t) { fr.place(t.x0, Yc, t.z0, 'bed_head', 0); fr.place(t.x0, Yc, t.z0 + 1, 'bed_foot', 0); }
  const idx = site.camp ?? 0;
  const noteId = CAMP_NOTES[idx % CAMP_NOTES.length];
  const fixed = [{ id: 'note', count: 1, data: { noteId } }];
  if (idx === 4) fixed.push({ id: 'note', count: 1, data: { noteId: 'maple_guns_hint' } });
  fr.container(cx + 3, Yc, cz - 1, 'crate_wood', 0, 'survivor_stash', { fixed });
  ctx.usedNotes.add(noteId); if (idx === 4) ctx.usedNotes.add('maple_guns_hint');
  fr.container(cx + 3, Yc, cz + 1, rng.chance(0.5) ? 'barrel_rust' : 'cardboard_box', 0, 'campsite');
  fr.set(cx - 3, Yc, cz - 2, B.lantern);
  if (rng.chance(0.6)) fr.corpse(cx - 2, Yc, cz - 1, rng.range(0, 6.28), 'survivor', 'corpse_survivor');
  for (let k = 0; k < 2; k++) fr.loot(cx + rng.int(-3, 3), Yc, cz + rng.int(-3, 3), 'floor_camp', 0.7);
  // crude barricade ring (some camps)
  if (rng.chance(0.5)) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const edge = x === 0 || z === 0 || x === W - 1 || z === D - 1;
    if (!edge || rng.chance(0.4)) continue;
    const g = gy(x, z);
    if (fr.get(x, g + 1, z) === 0) fr.place(x, g + 1, z, rng.chance(0.6) ? 'fence_wood' : 'barricade', x === 0 || x === W - 1 ? 1 : 0);
  }
  if (!site.island && rng.chance(0.6)) fr.zombies(cx + 6, Yc, cz + 6, rng.int(1, 3), 4, { outfit: 'survivor' });
  if (site.island) {
    // fishing gear, rowboat on the shore
    fr.container(cx - 4, Yc, cz + 2, 'crate_wood', 0, 'campsite');
    fr.spawnPoint(cx - 1, Yc, cz + 1, 0);
  }
  ctx.addPOI({ name: site.island ? 'Lake Island' : 'Survivor Camp', type: 'camp', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  fr.zone(0, 0, W - 1, D - 1, ZONES.CAMP);
  ctx.building('survivor_camp');
}
