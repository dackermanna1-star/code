// Story houses: specific homes that the notes point to (keys, stashes, tragedies).
import { B, IS_DOOR } from '../blocks.js';

function room(rec, types, floor = null) {
  const rs = rec.info.rooms.filter((r) => r.furn && types.includes(r.type) && (floor === null || r.f === floor));
  return rs[0] || rec.info.rooms.find((r) => r.furn && r.type !== 'garage') || null;
}
function floorStash(rec, r, fixed, loot = 'survivor_stash') {
  const c = r.furn.randomFree();
  if (!c) return false;
  rec.hf.clear(c[0], r.y, c[1], 0);
  rec.hf.container(c[0], r.y, c[1], 'floorboard_loose', 0, loot, { fixed });
  return true;
}
function putWith(rec, r, block, fixed, loot = null, extra = {}) {
  let s = r.furn.wall(block, { loot, opts: { fixed, ...extra } });
  if (!s) s = r.furn.center(block, 0, { loot, opts: { fixed, ...extra } });
  if (!s) {
    // last resort: hide it under the floorboards
    return floorStash(rec, r, fixed, loot || 'survivor_stash');
  }
  return true;
}
const note = (id) => ({ id: 'note', count: 1, data: { noteId: id } });

export const HOUSE_STORIES = [
  {
    id: 'maple_guns', area: 'Maple Avenue', pickFrac: 0.35, outer: 'siding_blue', cond: 'normal', locked: true,
    apply(ctx, rec) {
      const r = room(rec, ['living', 'den']);
      floorStash(rec, r, [{ id: 'shotgun_pump', count: 1 }, { id: 'pistol_glock', count: 1 }, { id: 'ammo_12g', count: 12 }, { id: 'ammo_12g_slug', count: 6 }, { id: 'ammo_9mm', count: 30 }, note('maple_guns')]);
      ctx.usedNotes.add('maple_guns');
      rec.hf.zombies(Math.floor((r.x0 + r.x1) / 2), r.y + 1, r.z1, 1, 1, { indoor: true, outfit: 'civilian' });
    },
  },
  {
    id: 'gunstore_owner', area: 'North Lincoln', pickFrac: 0.4, cond: 'normal',
    apply(ctx, rec) {
      const r = room(rec, ['office', 'den', 'master', 'bedroom']);
      putWith(rec, r, 'desk', [{ id: 'key_gunstore', count: 1 }, note('gunstore_owner')], 'desk', { name: "Earl Mason's desk" });
      ctx.usedNotes.add('gunstore_owner');
      const l = room(rec, ['living']);
      l.furn.wall('gun_cabinet');
    },
  },
  {
    id: 'pharmacist', area: 'Sycamore Street', pickFrac: 0.6, cond: 'normal',
    apply(ctx, rec) {
      const r = room(rec, ['master', 'bedroom']);
      putWith(rec, r, 'dresser', [{ id: 'key_pharmacy', count: 1 }, note('pharmacist')], 'dresser', { name: "Karen's dresser" });
      ctx.usedNotes.add('pharmacist');
      const c = r.furn.randomFree();
      if (c) rec.hf.zombies(c[0], r.y + 1, c[1], 1, 0, { indoor: true, outfit: 'civilian_f' });
    },
  },
  {
    id: 'ham_radio', area: 'Elm Street', pickFrac: 0.7, plan: 'colonial',
    apply(ctx, rec) {
      const r = room(rec, ['office', 'den', 'living', 'kids']);
      r.furn.wall('table', { top: 'radio', access: false });
      const c = r.furn.randomFree();
      if (c) rec.hf.note(c[0], r.y + 1, c[1], 'ham_radio');
      putWith(rec, r, 'cardboard_box', [{ id: 'batteries', count: 4 }, { id: 'radio_handheld', count: 1 }], 'cardboard');
    },
  },
  {
    id: 'bitten_husband', area: 'Willow Lane', pickFrac: 0.4, cond: 'normal', plan: 'ranch',
    apply(ctx, rec) {
      const r = room(rec, ['master', 'bedroom']);
      const { hf } = rec;
      // lock every door of that room, put the husband inside
      for (let x = r.x0 - 1; x <= r.x1 + 1; x++) for (let z = r.z0 - 1; z <= r.z1 + 1; z++) {
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) continue;
        if (IS_DOOR[hf.get(x, r.y + 1, z)]) {
          const d = ctx.world.getDoor(hf.wx(x, z), r.y + 1, hf.wz(x, z));
          if (d) { d.locked = true; d.open = false; ctx.world.setMeta(d.x, d.y, d.z, ctx.world.getMeta(d.x, d.y, d.z) & ~4); ctx.world.setMeta(d.x, d.y + 1, d.z, ctx.world.getMeta(d.x, d.y + 1, d.z) & ~4); }
          // note in front of the door, outside the room
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx >= r.x0 && nx <= r.x1 && nz >= r.z0 && nz <= r.z1) continue;
            if (hf.get(nx, r.y + 1, nz) === 0 && hf.get(nx, r.y, nz) !== 0) { hf.note(nx, r.y + 1, nz, 'bitten_husband'); break; }
          }
        }
      }
      ctx.usedNotes.add('bitten_husband');
      const c = r.furn.randomFree();
      if (c) hf.zombies(c[0], r.y + 1, c[1], 1, 0, { indoor: true, outfit: 'civilian', types: ['brute'] });
    },
  },
  {
    id: 'doctor_house', area: 'Cedar Street', pickFrac: 0.5, outer: 'brick_white', cond: 'normal', locked: true,
    apply(ctx, rec) {
      const r = room(rec, ['master', 'bedroom', 'office']);
      putWith(rec, r, 'safe', [{ id: 'antibiotics', count: 2 }, { id: 'sterile_bandage', count: 3 }, { id: 'suture_kit', count: 1 }, { id: 'painkillers', count: 1 }, note('doctor_house')], 'medicine_cabinet', { locked: false, name: "Dr. Whitaker's safe" });
      ctx.usedNotes.add('doctor_house');
    },
  },
  {
    id: 'cop_house', area: 'Hickory Lane', pickFrac: 0.3, cond: 'boarded',
    apply(ctx, rec) {
      const r = room(rec, ['living', 'den', 'master']);
      putWith(rec, r, 'gun_cabinet', [{ id: 'pistol_m9', count: 1 }, { id: 'rifle_hunting', count: 1 }, { id: 'ammo_9mm', count: 15 }, { id: 'ammo_308', count: 10 }, note('cop_house')], 'gun_cabinet', { locked: true });
      ctx.usedNotes.add('cop_house');
      const c = r.furn.randomFree();
      if (c) rec.hf.corpse(c[0], r.y + 1, c[1], 1, 'police', 'corpse_police');
    },
  },
  {
    id: 'prepper', area: 'Quarry Road', pickFrac: 0.5, cond: 'boarded',
    apply(ctx, rec) {
      const r = room(rec, ['garage', 'laundry', 'kitchen', 'living']) || room(rec, ['kitchen']);
      floorStash(rec, r, [{ id: 'canned_beans', count: 4 }, { id: 'canned_meat', count: 3 }, { id: 'water_jug', count: 1 }, { id: 'purification_tablets', count: 2 }, { id: 'mre', count: 2 }, note('prepper')]);
      ctx.usedNotes.add('prepper');
    },
  },
  {
    id: 'kids_note', area: 'Poplar Avenue', pickFrac: 0.4, cond: 'normal', plan: 'colonial',
    apply(ctx, rec) {
      const r = room(rec, ['kids', 'bedroom']);
      const c = r.furn.randomFree();
      if (c) rec.hf.note(c[0], r.y + 1, c[1], 'kids_note');
      ctx.usedNotes.add('kids_note');
      r.furn.floorLoot('floor_house', 2, 0.8);
    },
  },
  {
    id: 'farewell', area: 'West Main', pickFrac: 0.5, cond: 'normal',
    apply(ctx, rec) {
      const r = room(rec, ['master', 'bedroom']);
      for (let k = 0; k < 2; k++) { const c = r.furn.randomFree(); if (c) rec.hf.corpse(c[0], r.y + 1, c[1], k * 1.5, k ? 'civilian_f' : 'civilian', 'corpse_civilian'); }
      const c = r.furn.randomFree();
      if (c) rec.hf.note(c[0], r.y + 1, c[1], 'farewell');
      ctx.usedNotes.add('farewell');
    },
  },
];

void B;
