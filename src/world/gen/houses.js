// Suburban houses: plan templates (ranch / colonial / cottage), styles, conditions, furnished interiors, yards.
import { makeRng, hash32 } from '../../core/rng.js';
import { ZONES, SURFACE } from '../World.js';
import { B, BLOCKS, IS_DOOR } from '../blocks.js';
import { Frame } from './frame.js';
import { shell, carvePlan, connect, connectAny, exteriorDoor, roomWindows, paintRoomWalls, gableRoof, id } from './building.js';
import { furnish } from './furnish.js';
import { tree } from './vegetation.js';
import { CAR_COLORS, clearCell } from './util.js';
import { HOUSE_STORIES } from './stories.js';

const Y0 = SURFACE;
const SIDINGS = ['siding_white', 'siding_white', 'siding_blue', 'siding_yellow', 'siding_grey', 'siding_green', 'siding_red', 'siding_grey'];
const BRICKS = ['brick_red', 'brick_brown', 'brick_white'];
const ROOFS = ['dark', 'dark', 'red', 'brown', 'brown'];
const W_LIVING = ['wall_beige', 'wall_white', 'wallpaper_stripe', 'wall_green', 'wall_wood_panel', 'wall_beige'];
const W_BED = ['wallpaper_floral', 'wall_blue', 'wall_beige', 'wall_white', 'wallpaper_stripe', 'wall_green', 'wallpaper_floral'];
const W_KITCHEN = ['wall_white', 'wall_tile', 'wall_beige', 'wall_tile'];
const F_LIVING = ['floor_wood', 'carpet_beige', 'carpet_grey', 'floor_wood', 'carpet_blue', 'carpet_red'];
const F_BED = ['carpet_beige', 'carpet_blue', 'carpet_grey', 'floor_wood', 'carpet_red', 'carpet_beige'];
const F_KITCHEN = ['floor_tile', 'floor_linoleum', 'floor_checker', 'floor_tile'];
const CARS = [['sedan', 30], ['suv', 24], ['pickup', 20], ['hatchback', 14], ['van', 8]];

// ----------------------------------------------------------------------------- plan templates
// Each returns {W, D, floors:[{rooms, conns}], entry, back, garage?, stairs?} in house-local interior coords.
function R(id, type, x0, z0, x1, z1) { return { id, type, x0, z0, x1, z1 }; }

function planRanch(rng, maxW, maxD, withGarage) {
  const gw = withGarage ? rng.int(6, 7) : 0;
  const hallPlan = rng.chance(0.6);
  const baseW = hallPlan ? rng.int(18, 21) : rng.int(16, 19);
  const W = baseW + (gw ? gw + 2 : 0);
  const D = rng.int(hallPlan ? 14 : 12, 15);
  if (W > maxW || D > maxD) return null;
  const X0 = 2, X1 = W - 3, Z0 = 2, Z1 = D - 3, ID = Z1 - Z0 + 1;
  const rooms = [];
  let hx0 = X0;
  if (gw) { rooms.push(R('garage', 'garage', X0, Z0, X0 + gw - 1, Z1)); hx0 = X0 + gw + 2; }
  const IW = X1 - hx0 + 1;
  const pw = hallPlan ? Math.max(5, Math.min(8, Math.round(IW * 0.42))) : Math.max(5, Math.min(7, IW - 8));
  const kd = hallPlan ? Math.floor((ID - 3) / 2) : (ID >= 11 ? 5 : 4); // hall row then opens into the living room
  const kit = R('kitchen', 'kitchen', hx0, Z0, hx0 + pw - 1, Z0 + kd - 1);
  const liv = R('living', 'living', hx0, Z0 + kd + 1, hx0 + pw - 1, Z1);
  rooms.push(kit, liv);
  const px0 = hx0 + pw + 1;
  const conns = [['kitchen', ['living'], rng.chance(0.7) ? 'open' : 'door']];
  if (hallPlan) {
    const bd = Math.floor((ID - 3) / 2);
    const hz = Z0 + bd + 1;
    const hall = R('hall', 'hall', px0, hz, X1, hz);
    const pv = X1 - px0 + 1;
    rooms.push(hall);
    if (pv >= 8) {
      rooms.push(R('master', 'master', px0, Z0, X1 - 4, hz - 2), R('bath', 'bathroom', X1 - 2, Z0, X1, hz - 2));
      conns.push(['master', ['hall'], 'door'], ['bath', ['hall'], 'door']);
    } else {
      rooms.push(R('master', 'master', px0, Z0, X1, hz - 2));
      conns.push(['master', ['hall'], 'door']);
    }
    if (pv >= 10) {
      const mid = px0 + Math.floor(pv / 2);
      rooms.push(R('bed2', rng.chance(0.5) ? 'kids' : 'bedroom', px0, hz + 2, mid - 1, Z1), R('bed3', rng.pick(['bedroom', 'office', 'laundry', 'kids']), mid + 1, hz + 2, X1, Z1));
      conns.push(['bed2', ['hall'], 'door'], ['bed3', ['hall'], 'door']);
    } else {
      rooms.push(R('bed2', 'bedroom', px0, hz + 2, X1, Z1));
      conns.push(['bed2', ['hall'], 'door']);
    }
    conns.push(['hall', ['living', 'kitchen'], 'door']);
    if (!rooms.find((r) => r.type === 'bathroom')) {
      // squeeze a bathroom into bed2
      const b2 = rooms.find((r) => r.id === 'bed2');
      if (b2.x1 - b2.x0 >= 6) {
        rooms.push(R('bath', 'bathroom', b2.x1 - 2, b2.z0, b2.x1, b2.z1));
        b2.x1 -= 4;
        conns.push(['bath', ['hall'], 'door']);
      }
    }
  } else {
    // no hall: bedroom wing split along z
    const pv = X1 - px0 + 1;
    const zb = Z0 + Math.floor(ID / 2);
    rooms.push(R('master', 'master', px0, zb + 1, X1, Z1));
    if (pv >= 8) {
      rooms.push(R('bath', 'bathroom', px0, Z0, px0 + 2, zb - 1), R('bed2', 'kids', px0 + 4, Z0, X1, zb - 1));
      conns.push(['master', ['living', 'kitchen'], 'door'], ['bath', ['kitchen', 'living'], 'door'], ['bed2', ['master', 'bath'], 'door']);
    } else {
      rooms.push(R('bath', 'bathroom', px0, Z0, Math.min(X1, px0 + 3), zb - 1));
      if (X1 > px0 + 3) rooms.push(R('closet', 'closet', px0 + 5, Z0, X1, zb - 1));
      conns.push(['master', ['living', 'kitchen'], 'door'], ['bath', ['kitchen', 'living'], 'door'], ['closet', ['master', 'bath'], 'door']);
    }
  }
  if (gw) conns.push(['garage', ['kitchen', 'living'], 'garagedoor']);
  return { kind: 'ranch', W, D, floors: [{ rooms, conns }], entry: 'living', back: 'kitchen', garage: gw ? 'garage' : null };
}

function planCottage(rng, maxW, maxD) {
  const W = rng.int(13, 15), D = rng.int(11, 13);
  if (W > maxW || D > maxD) return null;
  const X0 = 2, X1 = W - 3, Z0 = 2, Z1 = D - 3, ID = Z1 - Z0 + 1, IW = X1 - X0 + 1;
  const lw = Math.max(4, Math.floor(IW * 0.55));
  const kd = Math.max(3, Math.floor(ID / 2) - 1);
  const rooms = [
    R('kitchen', 'kitchen', X0, Z0, X0 + lw - 1, Z0 + kd - 1),
    R('living', 'living', X0, Z0 + kd + 1, X0 + lw - 1, Z1),
  ];
  const rx = X0 + lw + 1;
  const zb = Z0 + Math.max(3, Math.floor(ID * 0.55));
  rooms.push(R('bed', 'bedroom', rx, Z0, X1, zb - 1), R('bath', 'bathroom', rx, zb + 1, X1, Z1));
  const conns = [['kitchen', ['living'], 'open'], ['bath', ['living', 'kitchen'], 'door'], ['bed', ['kitchen', 'living', 'bath'], 'door']];
  return { kind: 'cottage', W, D, floors: [{ rooms, conns }], entry: 'living', back: 'kitchen' };
}

function planColonial(rng, maxW, maxD) {
  const W = rng.int(15, 18), D = rng.int(12, 14);
  if (W > maxW || D > maxD) return null;
  const X0 = 2, X1 = W - 3, Z0 = 2, Z1 = D - 3, ID = Z1 - Z0 + 1, IW = X1 - X0 + 1;
  const lw = Math.floor((IW - 4) / 2) + rng.int(0, 1);
  const hx = X0 + lw + 1; // hall columns hx, hx+1
  const rx = hx + 3;
  const kd = Math.min(ID - 4, rng.int(4, 5));
  const g = [];
  const gconns = [];
  const hall = R('hall', 'hall', hx, Z0, hx + 1, Z1);
  g.push(hall);
  if (ID >= 9 && rng.chance(0.6)) {
    const zm = Z0 + Math.floor(ID / 2) - 1;
    g.push(R('dining', 'dining', X0, Z0, hx - 2, zm - 1), R('living', 'living', X0, zm + 1, hx - 2, Z1));
    gconns.push(['living', ['hall'], 'wide'], ['dining', ['living'], 'open'], ['dining', ['hall'], 'door']);
  } else {
    g.push(R('living', 'living', X0, Z0, hx - 2, Z1));
    gconns.push(['living', ['hall'], 'wide']);
  }
  g.push(R('kitchen', 'kitchen', rx, Z0, X1, Z0 + kd - 1));
  g.push(R('front', rng.pick(['office', 'halfbath', 'laundry', 'den', 'office']), rx, Z0 + kd + 1, X1, Z1));
  gconns.push(['kitchen', ['hall'], rng.chance(0.5) ? 'open' : 'door'], ['front', ['hall'], 'door']);
  // upper floor
  const u = [R('hall', 'hall', hx, Z0, hx + 1, Z1)];
  const uconns = [];
  const zl = Z0 + Math.floor(ID / 2);
  if (rng.chance(0.5)) {
    u.push(R('bed1', 'master', X0, Z0, hx - 2, zl - 1), R('bed2', rng.pick(['bedroom', 'kids']), X0, zl + 1, hx - 2, Z1));
  } else u.push(R('bed1', 'master', X0, Z0, hx - 2, Z1));
  u.push(R('bath', 'bathroom', rx, Z0, X1, Z0 + 2), R('bed3', rng.pick(['bedroom', 'kids', 'kids', 'office']), rx, Z0 + 4, X1, Z1));
  for (const r of u) if (r.id !== 'hall') uconns.push([r.id, ['hall'], 'door']);
  return {
    kind: 'colonial', W, D,
    floors: [{ rooms: g, conns: gconns }, { rooms: u, conns: uconns }],
    entry: 'hall', entryX: hx + 1, back: 'kitchen', stairs: { x: hx, z: Z1 - 1 },
  };
}

// ----------------------------------------------------------------------------- house builder
const ROOM_STYLE = {
  living: () => [W_LIVING, F_LIVING], dining: () => [W_LIVING, ['floor_wood']], den: () => [['wall_wood_panel'], F_LIVING],
  bedroom: () => [W_BED, F_BED], master: () => [W_BED, F_BED], kids: () => [['wall_blue', 'wall_green', 'wallpaper_floral'], F_BED],
  kitchen: () => [W_KITCHEN, F_KITCHEN], bathroom: () => [['wall_tile'], ['floor_tile']], halfbath: () => [['wall_tile', 'wall_white'], ['floor_tile']],
  laundry: () => [['wall_white'], ['floor_linoleum']], office: () => [W_LIVING, ['floor_wood', 'carpet_grey']],
  hall: () => [W_LIVING, ['floor_wood']], garage: () => [['concrete'], ['concrete']],
};
const PAINT_ORDER = ['living', 'den', 'dining', 'master', 'bedroom', 'kids', 'office', 'kitchen', 'bathroom', 'halfbath', 'laundry', 'hall', 'garage'];

/**
 * Build a house in frame hf from plan. style: {outer, roof}. cond: condition string.
 * Returns info {rooms (with y), doors, windows, frontDoor}.
 */
export function buildHouse(ctx, hf, plan, style, rng, cond, opts = {}) {
  const { W, D } = plan;
  const nF = plan.floors.length;
  shell(hf, { W, D, floors: nF, storeyH: 4, outer: style.outer, inner: 'wall_white', ceiling: 'wall_white', slab: 'planks_oak' });
  const b = { x0: 2, z0: 2, x1: W - 3, z1: D - 3 };
  const info = { rooms: [], doors: [], windows: [], plan };
  const over = new Set([B.wall_white]);
  // carve + style rooms
  plan.floors.forEach((fl, f) => {
    const y = Y0 + f * 4;
    for (const r of fl.rooms) {
      const [walls, floors] = (ROOM_STYLE[r.type] || ROOM_STYLE.living)();
      r.wall = r.wall || rng.pick(walls);
      r.floor = r.floor || rng.pick(floors);
      r.y = y; r.f = f;
    }
    carvePlan(hf, y, fl.rooms, 'wall_white', 3, b);
    // garage partition is 2 thick: make room for it (carvePlan left both cells as wall)
  });
  // stairs (colonial)
  if (plan.stairs) {
    const { x, z } = plan.stairs;
    for (let s = 0; s < 4; s++) {
      const zz = z - s, yy = Y0 + 1 + s;
      hf.clear(x, yy, zz, 0);
      hf.place(x, yy, zz, 'stairs_wood', 0);
      for (let k = Y0 + 1; k < yy; k++) hf.set(x, k, zz, B.wall_white);
    }
    hf.clear(x, Y0 + 4, z, 0); hf.clear(x, Y0 + 4, z - 1, 0); hf.clear(x, Y0 + 4, z - 2, 0);
  }
  // connections
  plan.floors.forEach((fl, f) => {
    const y = Y0 + f * 4;
    const byId = Object.fromEntries(fl.rooms.map((r) => [r.id, r]));
    for (const [a, targets, kind] of fl.conns) {
      const ra = byId[a];
      if (!ra) continue;
      if (kind === 'garagedoor') {
        // 2-thick partition between garage and house: door on the house side, opening on the garage side
        const t = targets.map((n) => byId[n]).find((t2) => t2 && t2.x0 === ra.x1 + 3 && t2.z1 >= ra.z0 && t2.z0 <= ra.z1);
        if (!t) continue;
        const z0 = Math.max(ra.z0, t.z0) + 1, z1 = Math.min(ra.z1, t.z1) - 1;
        if (z1 < z0) continue;
        const zz = rng.int(z0, z1);
        hf.opening(ra.x1 + 1, y + 1, zz, 2);
        hf.door(ra.x1 + 2, y + 1, zz, 1, 'door_wood', { open: rng.chance(0.3), locked: false });
        continue;
      }
      const res = connectAny(hf, y, ra, targets.map((n) => byId[n]), kind, rng, { door: 'door_white', open: cond === 'ransacked' ? true : undefined });
      if (!res && kind !== 'door') connectAny(hf, y, ra, targets.map((n) => byId[n]), 'door', rng, { door: 'door_white' });
    }
  });
  // exterior doors
  const g0 = plan.floors[0];
  const byId0 = Object.fromEntries(g0.rooms.map((r) => [r.id, r]));
  const skip = new Set();
  const entry = byId0[plan.entry];
  const locked = opts.locked;
  const fdoor = exteriorDoor(hf, Y0, entry, 'front', W, D, rng.chance(0.75) ? 'door_wood' : 'door_white', rng,
    { locked, open: !locked && (cond === 'ransacked' || cond === 'broken') && rng.chance(0.5), barricade: cond === 'boarded' ? 2 : 0 }, plan.entryX ?? null);
  skip.add(fdoor.x + ',' + fdoor.z);
  info.frontDoor = fdoor;
  const back = byId0[plan.back];
  if (back && back.z0 === b.z0) {
    const bd = exteriorDoor(hf, Y0, back, 'back', W, D, 'door_wood', rng, { locked: locked && rng.chance(0.5), barricade: cond === 'boarded' ? 2 : 0 });
    skip.add(bd.x + ',' + bd.z);
    info.backDoor = bd;
  }
  // garage door
  if (plan.garage) {
    const gr = byId0[plan.garage];
    const cx = Math.floor((gr.x0 + gr.x1) / 2);
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let yy = Y0 + 1; yy <= Y0 + 2; yy++) { hf.clear(x, yy, D - 1, B.garage_door); hf.clear(x, yy, D - 2, 0); }
      hf.markOpening(x, Y0 + 1, D - 2);
      skip.add(x + ',' + (D - 1));
    }
    info.garageDoor = { x0: cx - 1, x1: cx + 1 };
  }
  // windows
  for (const fl of plan.floors) {
    for (const r of fl.rooms) {
      if (r.type === 'garage') { roomWindows(hf, r.y, r, b, W, D, 'glass', rng, skip, { spacing: 5, pairs: false }); continue; }
      const ws = roomWindows(hf, r.y, r, b, W, D, 'glass', rng, skip, { pairs: r.type !== 'bathroom' && r.type !== 'halfbath', spacing: 3 });
      info.windows.push(...ws.map((c) => ({ ...c, y: r.y })));
    }
  }
  // paint walls
  for (const fl of plan.floors) {
    const sorted = [...fl.rooms].sort((p, q) => PAINT_ORDER.indexOf(p.type) - PAINT_ORDER.indexOf(q.type));
    for (const r of sorted) paintRoomWalls(hf, r.y, r, r.wall, 3, over);
  }
  // roof
  const topY = Y0 + nF * 4;
  const alongX = W >= D;
  gableRoof(hf, W, D, topY, style.roof, style.outer, alongX, { maxRise: plan.kind === 'ranch' ? 4 : 0 });
  if (style.chimney) {
    const cz = Math.floor(D / 2), cx = -1;
    const peak = topY + Math.ceil((alongX ? D : W) / 2) + 2;
    if (alongX) for (let yy = Y0 + 1; yy <= peak; yy++) hf.clear(cx, yy, cz, B.cobblestone);
  }
  // furnish
  if (cond !== 'burned') {
    for (const fl of plan.floors) {
      for (const r of fl.rooms) {
        const room = furnish(hf, { ...r, y: r.y }, r.type, rng, { condition: cond, loot: opts.loot });
        r.furn = room;
        info.rooms.push(r);
      }
    }
  } else {
    for (const fl of plan.floors) for (const r of fl.rooms) info.rooms.push(r);
  }
  return info;
}

// ----------------------------------------------------------------------------- conditions
function applyCondition(ctx, hf, info, cond, rng) {
  const { W, D } = info.plan;
  if (cond === 'broken' || cond === 'ransacked') {
    for (const w of info.windows) {
      if (rng.chance(cond === 'broken' ? 0.5 : 0.3)) {
        for (let dy = 1; dy <= 2; dy++) if (hf.get(w.ix, w.y + dy, w.iz) === B.glass) hf.set(w.ix, w.y + dy, w.iz, B.glass_broken);
      }
    }
  }
  if (cond === 'ransacked') {
    for (const r of info.rooms) {
      if (r.furn && rng.chance(0.6)) {
        const c = r.furn.randomFree();
        if (c) r.furn.tryPlace([{ x: c[0], z: c[1], block: rng.chance(0.6) ? 'trash_bags' : 'cardboard_box' }]);
      }
    }
  }
  if (cond === 'boarded') {
    for (const w of info.windows) {
      if (w.y !== Y0 && rng.chance(0.4)) continue;
      for (let dy = 1; dy <= 2; dy++) if (hf.get(w.ix, w.y + dy, w.iz) === B.glass) hf.set(w.ix, w.y + dy, w.iz, B.barricade);
    }
  }
  if (cond === 'burned') {
    const nF = info.plan.floors.length;
    const topY = Y0 + nF * 4;
    // roof gone, ceiling holes
    hf.fill(-2, topY + 1, -2, W + 1, topY + 14, D + 1, 0);
    hf.fill(-1, topY, -1, W, topY, -1, 0); hf.fill(-1, topY, D, W, topY, D, 0);
    hf.fill(-1, topY, -1, -1, topY, D, 0); hf.fill(W, topY, -1, W, topY, D, 0);
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      const r = rng.next();
      if (r < 0.55) hf.clear(x, topY, z, 0);
      if (nF > 1 && x > 1 && z > 1 && x < W - 2 && z < D - 2 && r > 0.75) hf.clear(x, Y0 + 4, z, 0);
    }
    // charred walls with holes
    for (let y = Y0 + 1; y < topY; y++) {
      for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
        const id0 = hf.get(x, y, z);
        if (id0 === 0) continue;
        const dd = BLOCKS[id0];
        if (dd.door) {
          if ((hf.world.getMeta(hf.wx(x, z), y, hf.wz(x, z)) & 8) === 0 && rng.chance(0.6)) { hf.clear(x, y, z, 0); hf.clear(x, y + 1, z, 0); }
          continue;
        }
        if (dd.render !== 'cube' && dd.name !== 'glass_broken' && !dd.name.startsWith('stairs')) { hf.clear(x, y, z, 0); continue; }
        if (dd.name === 'glass' || dd.name === 'glass_broken') { hf.set(x, y, z, 0); continue; }
        const edge = x === 0 || z === 0 || x === W - 1 || z === D - 1;
        const hole = rng.chance(edge ? 0.12 + (y - Y0) * 0.06 : 0.3);
        if (hole && !dd.name.startsWith('stairs')) hf.set(x, y, z, 0);
        else if (!dd.name.startsWith('stairs')) hf.set(x, y, z, rng.chance(0.7) ? B.planks_dark : B.cobblestone);
      }
    }
    // floors charred + rubble
    for (const r of info.rooms) {
      for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
        if (hf.get(x, r.y, z) !== 0 && !BLOCKS[hf.get(x, r.y, z)].name.startsWith('stairs')) hf.set(x, r.y, z, B.planks_dark);
        const nearDoor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => IS_DOOR[hf.get(x + dx, r.y + 1, z + dz)] || hf.isOpening(x + dx, r.y + 1, z + dz));
        const fl = hf.get(x, r.y, z);
        if (!nearDoor && hf.get(x, r.y + 1, z) === 0 && SOLIDISH(fl) && !BLOCKS[fl].name.startsWith('stairs') && rng.chance(0.18)) hf.set(x, r.y + 1, z, B.rubble);
      }
    }
    if (rng.chance(0.5)) {
      const r = rng.pick(info.rooms);
      const x = rng.int(r.x0, r.x1), z = rng.int(r.z0, r.z1);
      if (hf.get(x, r.y + 1, z) === 0 && SOLIDISH(hf.get(x, r.y, z))) hf.set(x, r.y + 1, z, B.fire);
    }
    // a little loot survives
    const r = rng.pick(info.rooms);
    hf.loot(Math.floor((r.x0 + r.x1) / 2), r.y + 1, Math.floor((r.z0 + r.z1) / 2), 'floor_house', 0.5);
  }
}
const SOLIDISH = (i) => i !== 0 && BLOCKS[i].solid;

// ----------------------------------------------------------------------------- yards
function fenceLine(fr, x0, z0, x1, z1, kind, gaps) {
  // straight line along x or z at ground level y=21
  const along = z0 === z1 ? 'x' : 'z';
  const n = along === 'x' ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
  for (let k = 0; k <= n; k++) {
    const x = x0 + sx * k, z = z0 + sz * k;
    if (gaps && gaps.has(x + ',' + z)) continue;
    const g = fr.get(x, Y0, z);
    if (g !== B.grass && g !== B.dirt && g !== B.dry_grass) continue;
    if (fr.get(x, Y0 + 1, z) !== 0) continue;
    if (k === 0 || k === n) fr.place(x, Y0 + 1, z, 'fence_post');
    else fr.place(x, Y0 + 1, z, kind, along === 'x' ? 0 : 1);
  }
}

function yardTree(ctx, fr, lx, lz, rng) {
  if (fr.get(lx, Y0, lz) !== B.grass || fr.get(lx, Y0 + 1, lz) !== 0) return false;
  // keep clear of buildings: check 2-radius column air at y 21..26
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (let y = Y0 + 1; y <= Y0 + 8; y++) {
      const id0 = fr.get(lx + dx, y, lz + dz);
      if (id0 !== 0 && !BLOCKS[id0].name.startsWith('leaves') && BLOCKS[id0].name !== 'tall_grass') return false;
    }
  }
  tree(ctx.world, fr.wx(lx, lz), Y0 + 1, fr.wz(lx, lz), rng.pick(['oak', 'oak', 'oak', 'birch', 'pine']), rng.next() * 0.6, ctx.seed);
  return true;
}

/** Paint a driveway / path from lot local (x0..x1) between lz0..lz1 and extend across the sidewalk to the road. */
function pave(fr, x0, x1, lz0, lz1, mat) {
  for (let x = x0; x <= x1; x++) {
    for (let z = lz0; z <= lz1; z++) {
      const g = fr.get(x, Y0, z);
      if (g === B.grass || g === B.dirt || g === B.dry_grass || g === B.sidewalk || g === B.gravel) {
        fr.clear(x, Y0, z, mat);
        const above = fr.get(x, Y0 + 1, z);
        if (above && !BLOCKS[above].solid) fr.clear(x, Y0 + 1, z, 0);
      }
    }
    // beyond the lot front: until asphalt
    for (let z = lz1 + 1; z <= lz1 + 6; z++) {
      const g = fr.get(x, Y0, z);
      if (g === B.asphalt || g === B.asphalt_cracked || BLOCKS[g].name.startsWith('road') || g === B.crosswalk_x || g === B.crosswalk_z || g === B.manhole) break;
      if (g === B.grass || g === B.sidewalk || g === B.dirt || g === B.gravel) {
        fr.clear(x, Y0, z, mat);
        const above = fr.get(x, Y0 + 1, z);
        if (above) fr.clear(x, Y0 + 1, z, 0);
      }
    }
  }
}

function shed(ctx, fr, x0, z0, rng) {
  const w = rng.int(3, 4), d = 3;
  for (let x = x0 - 1; x <= x0 + w; x++) for (let z = z0 - 1; z <= z0 + d; z++) {
    for (let y = Y0 + 1; y <= Y0 + 4; y++) if (fr.get(x, y, z) !== 0) return false;
  }
  const mat = rng.pick(['planks_dark', 'siding_white', 'corrugated_metal', 'planks_oak', 'siding_red']);
  const sf = fr.sub(x0, z0, w, d);
  sf.fill(0, Y0, 0, w - 1, Y0, d - 1, B.planks_oak);
  sf.walls(0, Y0 + 1, 0, w - 1, Y0 + 3, d - 1, id(mat));
  sf.fill(0, Y0 + 4, 0, w - 1, Y0 + 4, d - 1, mat === 'corrugated_metal' ? B.roof_metal : B.roof_dark_slab);
  sf.door(1, Y0 + 1, d - 1, 0, 'door_wood', { open: rng.chance(0.3), locked: rng.chance(0.2) });
  sf.place(0 + (w > 3 ? 1 : 0) + 1, Y0 + 1, 0, 'metal_shelf', 0);
  if (w > 3) { sf.place(1, Y0 + 1, 0, 'workbench'); sf.place(1, Y0 + 2, 0, 'toolbox'); }
  ctx.building('shed');
  return true;
}

/** Build a complete residential lot (house + yard) */
function buildHouseLot(ctx, lot) {
  const rng = makeRng(hash32(ctx.seed, lot.x0 * 7 + 3, lot.z0 * 13 + 5, 99));
  const mirror = rng.chance(0.5);
  const fr = Frame.fromRect(ctx, lot.x0, lot.z0, lot.x1, lot.z1, lot.front, mirror);
  const w = fr.w, d = fr.d;
  const story = lot.story || null;
  const setback = rng.int(6, 8);
  const maxD = d - setback - 5;
  // choose plan
  const order = rng.shuffle(['ranch', 'ranch', 'colonial', 'colonial', 'cottage']);
  if (story && story.plan) order.unshift(story.plan);
  let plan = null;
  for (const k of order) {
    if (k === 'ranch') plan = planRanch(rng, w - 4, maxD, w >= 30 ? rng.chance(0.8) : false) || planRanch(rng, w - 4, maxD, false);
    else if (k === 'colonial') plan = planColonial(rng, w - 5, maxD);
    else plan = planCottage(rng, w - 4, maxD);
    if (plan) break;
  }
  if (!plan) plan = planCottage(rng, w - 2, d - 8);
  if (!plan) return null;
  const { W, D } = plan;
  // position: centred-ish, side drive space if no garage
  const sideRoom = w - W;
  let hx = Math.floor(sideRoom / 2);
  let drive = null; // [x0,x1] lot coords
  if (!plan.garage && sideRoom >= 6) { hx = sideRoom - 2; drive = [hx - 4, hx - 2]; }
  const hz = d - setback - D;
  const hf = fr.sub(hx, hz, W, D);
  // style
  let outer = story?.outer || (rng.chance(0.2) ? rng.pick(BRICKS) : rng.pick(SIDINGS));
  if (!story && lot.area === 'Maple Avenue' && outer === 'siding_blue') outer = 'siding_grey';
  const style = { outer, roof: story?.roof || rng.pick(ROOFS), chimney: rng.chance(0.3) };
  let cond = story?.cond || rng.weighted([['normal', 40], ['broken', 20], ['ransacked', 22], ['boarded', 10], ['burned', 5]]);
  if (lot.spawn && (cond === 'burned' || cond === 'boarded')) cond = 'normal';
  const locked = story?.locked ?? (cond === 'boarded' ? true : rng.chance(0.3));
  const info = buildHouse(ctx, hf, plan, style, rng, cond, { locked });
  applyCondition(ctx, hf, info, cond, rng);
  ctx.building('house_' + plan.kind);
  if (cond !== 'normal') ctx.building('cond_' + cond);
  // ---- yard
  const frontZ = hz + D; // first yard row in front of the house
  const doorLX = hx + info.frontDoor.x;
  // porch
  if (cond !== 'burned' && (plan.kind !== 'ranch' || rng.chance(0.35)) && setback >= 6) {
    const px0 = Math.max(hx, doorLX - rng.int(2, 3)), px1 = Math.min(hx + W - 1, doorLX + rng.int(2, 4));
    if (plan.garage && info.garageDoor) { /* keep porch off the garage */ }
    const gx0 = plan.garage ? hx + info.garageDoor.x1 + 2 : -1;
    const ax0 = Math.max(px0, gx0);
    for (let x = ax0; x <= px1; x++) for (let z = frontZ; z <= frontZ + 2; z++) fr.clear(x, Y0, z, B.planks_oak);
    const roofSlab = id('roof_' + style.roof + '_slab');
    const topY = Y0 + 4;
    for (let x = ax0; x <= px1; x++) for (let z = frontZ + 1; z <= frontZ + 2; z++) if (fr.get(x, topY, z) === 0) fr.set(x, topY, z, roofSlab);
    for (const x of [ax0, px1]) for (let y = Y0 + 1; y < topY; y++) fr.set(x, y, frontZ + 2, B.fence_post);
    // railing with a gap at the door
    for (let x = ax0 + 1; x < px1; x++) if (Math.abs(x - doorLX) > 1) fr.place(x, Y0 + 1, frontZ + 2, 'fence_wood', 0);
    if (rng.chance(0.5)) {
      const bx = doorLX + (doorLX - ax0 > px1 - doorLX ? -2 : 2);
      if (fr.get(bx, Y0 + 1, frontZ) === 0 && bx > ax0 && bx < px1) fr.place(bx, Y0 + 1, frontZ, 'bench', 0);
    }
  }
  // walkway from the door to the street
  pave(fr, doorLX, doorLX, frontZ, d - 1, B.concrete);
  // driveway
  const dmat = rng.chance(0.75) ? B.concrete : B.gravel;
  let driveX = null;
  if (plan.garage) {
    driveX = [hx + info.garageDoor.x0, hx + info.garageDoor.x1];
    pave(fr, driveX[0], driveX[1], frontZ, d - 1, dmat);
  } else if (drive) {
    driveX = drive;
    pave(fr, drive[0], drive[1], hz + 2, d - 1, dmat);
  }
  // car(s)
  if (driveX && rng.chance(cond === 'burned' ? 0.25 : 0.48)) {
    const type = rng.weighted(CARS);
    const cx = (driveX[0] + driveX[1] + 1) / 2;
    const cz = d - 4 + rng.range(-0.6, 0.6);
    ctx.addVehicle({ type, x: fr.px(cx, cz), y: Y0 + 1, z: fr.pz(cx, cz), yaw: fr.yaw(rng.chance(0.7) ? Math.PI : 0) + rng.range(-0.08, 0.08), color: rng.pick(CAR_COLORS), burned: cond === 'burned', wrecked: cond === 'burned' || rng.chance(0.05), alarm: rng.chance(0.12), loot: type === 'pickup' ? 'pickup_bed' : 'car_trunk', gloveLoot: 'car_glovebox' });
  }
  if (plan.garage && rng.chance(0.25) && cond !== 'burned') {
    const g = info.rooms.find((r) => r.type === 'garage');
    if (g) {
      const cx = hx + (g.x0 + g.x1 + 1) / 2, cz = hz + (g.z0 + g.z1 + 1) / 2;
      ctx.addVehicle({ type: rng.weighted(CARS), x: fr.px(cx, cz), y: Y0 + 1, z: fr.pz(cx, cz), yaw: fr.yaw(Math.PI), color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox' });
    }
  }
  // mailbox
  const mbx = driveX ? driveX[0] - 1 : doorLX + 1;
  if (fr.get(mbx, Y0 + 1, d - 1) === 0 && fr.get(mbx, Y0, d - 1) === B.grass) fr.place(mbx, Y0 + 1, d - 1, 'mailbox');
  // fences
  const gaps = new Set();
  for (let x = doorLX - 1; x <= doorLX + 1; x++) gaps.add(x + ',' + (d - 1));
  if (driveX) for (let x = driveX[0] - 1; x <= driveX[1] + 1; x++) gaps.add(x + ',' + (d - 1));
  gaps.add(mbx + ',' + (d - 1));
  if (rng.chance(0.4)) fenceLine(fr, 0, d - 1, w - 1, d - 1, 'fence_picket', gaps);
  if (rng.chance(0.65) && hz >= 4) {
    const fk = rng.chance(0.7) ? 'fence_wood' : 'fence_chainlink';
    fenceLine(fr, 0, 0, w - 1, 0, fk);
    const sideGaps = new Set([0 + ',' + (hz + 1), (w - 1) + ',' + (hz + 1)]);
    fenceLine(fr, 0, 0, 0, hz + D - 2, fk, sideGaps);
    fenceLine(fr, w - 1, 0, w - 1, hz + D - 2, fk, sideGaps);
  }
  // back yard features
  if (hz >= 6 && rng.chance(0.45)) shed(ctx, fr, rng.chance(0.5) ? 2 : w - 6, 1, rng);
  if (hz >= 6 && rng.chance(0.18)) {
    // vegetable garden
    const gx0 = rng.int(2, Math.max(2, w - 8)), gz0 = rng.int(1, Math.max(1, hz - 4));
    for (let x = gx0; x < gx0 + 5; x++) for (let z = gz0; z < gz0 + 3; z++) {
      if (fr.get(x, Y0, z) !== B.grass || !fr.canPlace(x, Y0 + 1, z)) continue;
      fr.set(x, Y0, z, B.dirt);
      if (z !== gz0 + 1) fr.set(x, Y0 + 1, z, rng.chance(0.5) ? B.pumpkin : rng.chance(0.5) ? B.wheat : B.dead_bush);
    }
  }
  if (hz >= 5 && rng.chance(0.2)) {
    const tx = rng.int(3, w - 4), tz = rng.int(1, hz - 3);
    if (fr.get(tx, Y0 + 1, tz) === 0 && fr.get(tx + 1, Y0 + 1, tz) === 0 && fr.get(tx, Y0 + 1, tz + 1) === 0 && fr.get(tx + 1, Y0 + 1, tz + 1) === 0 && fr.get(tx, Y0 + 1, tz - 1) === 0) {
      fr.place(tx, Y0 + 1, tz, 'table'); fr.place(tx + 1, Y0 + 1, tz, 'table');
      fr.place(tx, Y0 + 1, tz + 1, 'bench', 2); fr.place(tx + 1, Y0 + 1, tz + 1, 'bench', 2);
      fr.place(tx, Y0 + 1, tz - 1, 'bench', 0); fr.place(tx + 1, Y0 + 1, tz - 1, 'bench', 0);
    }
  }
  if (rng.chance(0.2)) { const x = hx + W, z = hz + 1; if (fr.get(x, Y0 + 1, z) === 0) fr.place(x, Y0 + 1, z, 'rain_barrel'); }
  for (let k = rng.int(0, 2); k > 0; k--) { const x = hx - 1, z = hz + 2 + k; if (x >= 0 && fr.get(x, Y0 + 1, z) === 0 && fr.get(x, Y0, z) === B.grass) fr.place(x, Y0 + 1, z, 'trash_can'); }
  // trees
  let nt = rng.int(0, 2);
  for (let tries = 0; tries < 8 && nt > 0; tries++) if (yardTree(ctx, fr, rng.int(1, w - 2), rng.int(frontZ + 2, d - 2), rng)) nt--;
  nt = rng.int(0, 2);
  for (let tries = 0; tries < 8 && nt > 0 && hz > 4; tries++) if (yardTree(ctx, fr, rng.int(1, w - 2), rng.int(1, hz - 2), rng)) nt--;
  // gameplay
  fr.zone(0, 0, w - 1, d - 1, ZONES.SUBURB);
  const rec = { lot, fr, hf, plan, info, cond, style, rng, hx, hz };
  // zombies inside
  if (!lot.spawn && cond !== 'burned' && rng.chance(0.24)) {
    const r = rng.pick(info.rooms);
    if (r && r.furn) {
      const c = r.furn.randomFree();
      if (c) hf.zombies(c[0], r.y + 1, c[1], rng.int(1, 2), 1, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f']) });
    }
  }
  if (!lot.spawn && rng.chance(0.06)) {
    const r = rng.pick(info.rooms);
    if (r && r.furn) { const c = r.furn.randomFree(); if (c) hf.corpse(c[0], r.y + 1, c[1], rng.range(0, 6.28), rng.pick(['civilian', 'civilian_f']), 'corpse_civilian'); }
  }
  if (cond === 'boarded' && !story) holdout(ctx, rec, rng);
  if (story) story.apply(ctx, rec, rng);
  ctx.houses.push(rec);
  if (ctx.debugLabels && cond !== 'burned') {
    const fd = info.frontDoor;
    const start = [hf.wx(fd.x, fd.z + 1), Y0 + 1, hf.wz(fd.x, fd.z + 1)];
    const targets = [];
    for (const r of info.rooms) {
      const c = r.furn ? (r.furn.keepCells()[0] || r.furn.freeCells()[0]) : [r.x0, r.z0]; // no rng use: debug must not change the world
      if (c) targets.push([hf.wx(c[0], c[1]), r.y + 1, hf.wz(c[0], c[1]), r.type + ' f' + r.f]);
    }
    ctx.reachChecks.push({ name: `house ${plan.kind} @${lot.x0},${lot.z0}`, start, targets });
  }
  const kinds = ctx.planViews.filter((v) => v.kind === plan.kind).length;
  if (kinds < 3) {
    const wr = fr.worldRect(-1, -1, w, d + 3);
    const sr = hf.worldRect(0, 0, W - 1, D - 1);
    const along = (sr.x1 - sr.x0) > (sr.z1 - sr.z0) ? 'x' : 'z';
    if (plan.stairs) {
      const sx = hf.wx(plan.stairs.x, 0), sz = hf.wz(plan.stairs.x, 0);
      const ax = hf.wx(0, 0) === hf.wx(0, 5) ? 'z' : 'x';
      ctx.sectionViews.push({ name: `house-${plan.kind}-${kinds}-stairs`, axis: ax, c: ax === 'z' ? sx : sz, a0: (ax === 'z' ? sr.z0 : sr.x0) - 3, a1: (ax === 'z' ? sr.z1 : sr.x1) + 3, y0: 18, y1: 38, s: 10 });
    } else ctx.sectionViews.push({ name: `house-${plan.kind}-${kinds}`, axis: along === 'x' ? 'z' : 'x', c: along === 'x' ? Math.floor((sr.x0 + sr.x1) / 2) : Math.floor((sr.z0 + sr.z1) / 2), a0: (along === 'x' ? sr.z0 : sr.x0) - 3, a1: (along === 'x' ? sr.z1 : sr.x1) + 3, y0: 18, y1: 34, s: 10 });
    for (let f = 0; f < plan.floors.length; f++) ctx.planViews.push({ name: `house-${plan.kind}-${kinds}-f${f}`, kind: plan.kind, ...wr, y: Y0 + 1 + f * 4, s: 14 });
  }
  return rec;
}

/** Survivor holdout: stash under loose floorboards + their note. */
const HOLDOUT_NOTES = ['holdout_1', 'holdout_2', 'holdout_3', 'holdout_4', 'holdout_5'];
function holdout(ctx, rec, rng) {
  const { hf, info } = rec;
  const rooms = info.rooms.filter((r) => r.furn && r.f === 0 && r.type !== 'garage');
  if (!rooms.length) return;
  const r = rng.pick(rooms);
  const c = r.furn.randomFree();
  if (!c) return;
  const noteId = HOLDOUT_NOTES[ctx.holdoutCount++ % HOLDOUT_NOTES.length];
  hf.clear(c[0], r.y, c[1], 0);
  hf.container(c[0], r.y, c[1], 'floorboard_loose', 0, 'survivor_stash', { fixed: [{ id: 'note', count: 1, data: { noteId } }] });
  ctx.usedNotes.add(noteId);
  // supplies on the table / floor
  r.furn.floorLoot('floor_camp', 2, 0.8);
  if (rng.chance(0.4)) {
    const c2 = r.furn.randomFree();
    if (c2) hf.corpse(c2[0], r.y + 1, c2[1], rng.range(0, 6.28), 'survivor', 'corpse_survivor');
  } else if (rng.chance(0.5)) {
    const rr = rng.pick(info.rooms);
    const c3 = rr.furn && rr.furn.randomFree();
    if (c3) hf.zombies(c3[0], rr.y + 1, c3[1], rng.int(1, 3), 1, { indoor: true, outfit: 'survivor' });
  }
  // a lantern left on
  const c4 = r.furn.randomFree();
  if (c4 && rng.chance(0.5)) hf.place(c4[0], r.y + 1, c4[1], 'lantern');
}

export function buildLots(ctx) {
  ctx.houses = [];
  ctx.holdoutCount = 0;
  assignStories(ctx);
  pickSpawnLots(ctx);
  for (const lot of ctx.lots) buildHouseLot(ctx, lot);
  // spawn points in the chosen houses
  for (const h of ctx.houses) {
    if (!h.lot.spawn) continue;
    const living = h.info.rooms.find((r) => r.type === 'living' && r.furn) || h.info.rooms.find((r) => r.furn && r.f === 0);
    const c = living && living.furn.randomFree();
    if (c) h.hf.spawnPoint(c[0], living.y + 1, c[1], h.rng.range(0, 6.28));
    else h.fr.spawnPoint(Math.floor(h.fr.w / 2), Y0 + 1, h.fr.d - 1, Math.PI);
  }
  // residential POIs (bounding box per area)
  const areas = new Map();
  for (const l of ctx.lots) {
    const a = areas.get(l.area) || { x0: 1e9, z0: 1e9, x1: -1, z1: -1, n: 0 };
    a.x0 = Math.min(a.x0, l.x0); a.z0 = Math.min(a.z0, l.z0); a.x1 = Math.max(a.x1, l.x1); a.z1 = Math.max(a.z1, l.z1); a.n++;
    areas.set(l.area, a);
  }
  for (const [name, a] of areas) if (a.n >= 2) ctx.addPOI({ name, type: 'residential', x0: a.x0, z0: a.z0, x1: a.x1, z1: a.z1 });
  void IS_DOOR; void clearCell; void connect;
}

function assignStories(ctx) {
  const used = new Set();
  for (const st of HOUSE_STORIES) {
    const cands = ctx.lots.filter((l) => !used.has(l) && (!st.area || l.area === st.area) && (!st.minW || l.w >= st.minW));
    if (!cands.length) continue;
    const pick = cands[Math.floor(st.pickFrac * cands.length) % cands.length];
    used.add(pick);
    pick.story = st;
  }
}

function pickSpawnLots(ctx) {
  const quiet = ['Maple Avenue', 'Willow Lane', 'Poplar Avenue', 'Hickory Lane', 'Cedar Street', 'Elm Street', 'Sycamore Street', 'West Main', 'Old Mill Road', 'Lake Road', 'Route 9 North'];
  const rng = ctx.rng.fork(55);
  let n = 0;
  for (const area of quiet) {
    const lots = ctx.lots.filter((l) => l.area === area && !l.story);
    if (!lots.length) continue;
    const k = area === 'Maple Avenue' || area === 'Willow Lane' || area === 'Cedar Street' ? 2 : 1;
    rng.shuffle(lots);
    for (let i = 0; i < k && i < lots.length; i++) { lots[i].spawn = true; n++; }
  }
  return n;
}
