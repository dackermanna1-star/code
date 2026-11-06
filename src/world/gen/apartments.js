// Apartment buildings: 3-5 floors, a stairwell at the end of a central corridor, 3-4 units per floor.
import { B } from '../blocks.js';
import { SURFACE } from '../World.js';
import { shell, carvePlan, connect, connectAny, exteriorDoor, roomWindows, paintRoomWalls, flatRoof, stairwell, id } from './building.js';
import { furnish, Room } from './furnish.js';

const Y0 = SURFACE;

/** Split a unit rect into rooms; ext = which side has windows ('front' = +z, 'back' = -z). */
function unitRooms(u, ext, rng) {
  const w = u.x1 - u.x0 + 1, d = u.z1 - u.z0 + 1;
  const xm = u.x0 + Math.max(4, Math.floor(w * 0.55));
  const zm = ext === 'front' ? u.z0 + Math.max(3, Math.floor(d * 0.4)) : u.z1 - Math.max(3, Math.floor(d * 0.4));
  // corridor side strip: kitchen + bath ; exterior strip: living + bedroom
  let inner, outer;
  if (ext === 'front') { inner = [u.z0, zm - 1]; outer = [zm + 1, u.z1]; } else { inner = [zm + 1, u.z1]; outer = [u.z0, zm - 1]; }
  const liv = { id: 'living', type: 'living', x0: u.x0, x1: xm - 1, z0: outer[0], z1: outer[1] };
  const bed = { id: 'bed', type: rng.chance(0.6) ? 'master' : 'bedroom', x0: xm + 1, x1: u.x1, z0: outer[0], z1: outer[1] };
  const kit = { id: 'kitchen', type: 'kitchen', x0: u.x0, x1: xm - 1, z0: inner[0], z1: inner[1] };
  const bath = { id: 'bath', type: 'bathroom', x0: xm + 1, x1: u.x1, z0: inner[0], z1: inner[1] };
  return [liv, bed, kit, bath];
}

const FLOOR = { living: ['floor_wood', 'carpet_beige', 'carpet_grey', 'carpet_blue'], master: ['carpet_beige', 'carpet_blue', 'floor_wood'], bedroom: ['carpet_beige', 'carpet_red', 'floor_wood'], kitchen: ['floor_linoleum', 'floor_tile'], bathroom: ['floor_tile'] };
const WALL = { living: ['wall_beige', 'wallpaper_stripe', 'wall_white', 'wall_green'], master: ['wallpaper_floral', 'wall_blue', 'wall_beige'], bedroom: ['wallpaper_floral', 'wall_blue', 'wall_white'], kitchen: ['wall_white', 'wall_tile'], bathroom: ['wall_tile'] };

/**
 * Apartment building in frame fr (front +z). opts: {floors, outer, name, H}
 */
export function apartmentBuilding(ctx, fr, opts, rng) {
  const W = fr.w, D = fr.d;
  const H = opts.H || 4;
  const floors = opts.floors || 3;
  const outer = opts.outer || 'brick_brown';
  const sh = shell(fr, { W, D, floors, storeyH: H, outer, inner: 'wall_white', ceiling: 'concrete', slab: 'concrete' });
  flatRoof(fr, W, D, sh.topY, outer);
  const ib = { x0: 2, z0: 2, x1: W - 3, z1: D - 3 };
  // corridor (2 wide) through the middle along x; stairwell (rotated, door side +z) behind it at the left end
  const zc = 2 + Math.floor((D - 4) / 2) - 1; // corridor rows zc, zc+1
  const swW = H + 3; // stairwell x extent
  const swZ0 = zc - 4;
  const backUnitsX0 = 2 + swW + 1;
  const units = [];
  const tasks = [];
  for (let f = 0; f < floors; f++) {
    const y = Y0 + f * H;
    const corr = { id: 'corr', type: 'hall', x0: 2, z0: zc, x1: W - 3, z1: zc + 1, floor: f === 0 ? 'floor_tile' : 'carpet_red', wall: 'wall_beige' };
    const rooms = [corr];
    // back units (behind the corridor, right of the stairwell)
    const bw = W - 3 - backUnitsX0 + 1;
    const nb = bw >= 20 ? 2 : 1;
    const bwu = Math.floor((bw - (nb - 1)) / nb);
    const fu = [];
    for (let k = 0; k < nb; k++) {
      const x0 = backUnitsX0 + k * (bwu + 1);
      fu.push({ x0, x1: k === nb - 1 ? W - 3 : x0 + bwu - 1, z0: 2, z1: zc - 2, ext: 'back' });
    }
    // front units
    const fwTot = W - 4;
    let lobby = null;
    if (f === 0) {
      const lw = 4;
      const lx0 = 2 + Math.floor((fwTot - lw) / 2);
      lobby = { id: 'lobby', type: 'hall', x0: lx0, x1: lx0 + lw - 1, z0: zc + 3, z1: D - 3, floor: 'floor_tile', wall: 'wall_beige' };
      rooms.push(lobby);
      fu.push({ x0: 2, x1: lx0 - 2, z0: zc + 3, z1: D - 3, ext: 'front' }, { x0: lx0 + lw + 1, x1: W - 3, z0: zc + 3, z1: D - 3, ext: 'front' });
    } else {
      const nf = fwTot >= 22 ? 2 : 1;
      const fwu = Math.floor((fwTot - (nf - 1)) / nf);
      for (let k = 0; k < nf; k++) {
        const x0 = 2 + k * (fwu + 1);
        fu.push({ x0, x1: k === nf - 1 ? W - 3 : x0 + fwu - 1, z0: zc + 3, z1: D - 3, ext: 'front' });
      }
    }
    const unitRoomList = [];
    for (const u of fu) {
      if (u.x1 - u.x0 < 8 || u.z1 - u.z0 < 6) continue;
      const rs = unitRooms(u, u.ext, rng);
      for (const r of rs) { r.floor = rng.pick(FLOOR[r.type] || FLOOR.living); r.wall = rng.pick(WALL[r.type] || WALL.living); }
      unitRoomList.push({ u, rs });
      rooms.push(...rs);
    }
    carvePlan(fr, y, rooms, 'wall_white', H - 1, ib);
    // connections
    if (lobby) connect(fr, y, lobby, corr, 'wide', rng);
    for (const { u, rs } of unitRoomList) {
      const [liv, bed, kit, bath] = rs;
      connect(fr, y, kit, corr, 'door', rng, { door: 'door_wood', locked: rng.chance(0.35), open: rng.chance(0.3) });
      connect(fr, y, kit, liv, 'open', rng);
      connectAny(fr, y, bed, [liv], 'door', rng);
      connectAny(fr, y, bath, [kit, bed], 'door', rng);
      for (const r of rs) roomWindows(fr, y, r, ib, W, D, 'glass', rng, null, { spacing: 3 });
      for (const r of rs) paintRoomWalls(fr, y, r, r.wall, H - 1, new Set([B.wall_white]));
      units.push({ u, rs, y, f });
    }
    paintRoomWalls(fr, y, corr, 'wall_beige', H - 1, new Set([B.wall_white]));
    // corridor end windows
    roomWindows(fr, y, corr, ib, W, D, 'glass', rng, null, { pairs: false });
    if (f === 0) {
      const d = exteriorDoor(fr, y, lobby, 'front', W, D, 'door_glass', rng, { locked: false }, lobby.x0 + 1);
      fr.door(d.x + 1, y + 1, d.z, 0, 'door_glass', {});
      fr.opening(d.x + 1, y + 1, D - 2, 2);
      // mailboxes in the lobby
      for (let z = lobby.z0; z <= lobby.z1 - 2; z++) fr.container(lobby.x0, y + 1, z, 'metal_shelf', 3, 'mailbox');
      // back exit at the corridor end
      exteriorDoor(fr, y, corr, 'right', W, D, 'door_metal', rng, { locked: rng.chance(0.4) });
    }
  }
  // stairwell (built after the floors were carved), rotated: door side faces +z (the corridor)
  const swf = fr.child(2, swZ0, [0, 1], [1, 0], 4, swW);
  const well = stairwell(swf, 0, 0, Y0, H, floors + 1, { wall: 'concrete', floor: 'concrete', stair: 'stairs_concrete' });
  for (let L = 0; L <= floors; L++) {
    const dd = well.doors[L];
    swf.door(dd.x, dd.y + 1, dd.z, 3, L === floors ? 'door_metal' : 'door_white', { open: L < floors && rng.chance(0.4) });
  }
  // furnish units
  for (const un of units) {
    const [liv, bed, kit, bath] = un.rs;
    const cond = rng.weighted([['normal', 50], ['ransacked', 35], ['abandoned', 15]]);
    const o = { height: H - 1, condition: cond };
    furnish(fr, { ...liv, y: un.y }, 'living', rng, o);
    furnish(fr, { ...bed, y: un.y }, bed.type, rng, o);
    furnish(fr, { ...kit, y: un.y }, 'kitchen', rng, o);
    furnish(fr, { ...bath, y: un.y }, 'bathroom', rng, o);
    if (rng.chance(0.3)) {
      const cx = Math.floor((liv.x0 + liv.x1) / 2), cz = Math.floor((liv.z0 + liv.z1) / 2);
      if (fr.get(cx, un.y + 1, cz) === 0) fr.zombies(cx, un.y + 1, cz, rng.int(1, 2), 1, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f']) });
    }
  }
  if (opts.name) fr.signCentered(1, W - 2, Y0 + 3, D, opts.name, 0);
  ctx.building('apartments');
  ctx.stats.apartmentUnits = (ctx.stats.apartmentUnits || 0) + units.length;
  return { units, well, H, floors };
}
