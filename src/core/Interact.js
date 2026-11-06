// What the player is looking at + the E interaction (containers, doors, beds, water, campfires, items, corpses, cars).
import * as THREE from 'three';
import { raycast } from '../world/raycast.js';
import { BLOCKS, B, IS_DOOR, FACING_DIR } from '../world/blocks.js';
import { getItemDef, createItem } from '../items/items.js';
import { RADIO_BROADCASTS } from '../world/gen/lore.js';
import { generateLoot } from '../items/loot.js';
import { makeRng, hash32 } from './rng.js';
import { vehicleName } from '../entities/Vehicles.js';

const REACH = 3.2;
const hasTag = (s, t) => (getItemDef(s.id).tags || []).includes(t);
function interactFilter(id, d) { return d.render !== 'none'; }
const isWindowGlass = (id) => id === B.glass || id === B.glass_shop;
const PLANK_HP = 150; // barricade hp per plank (doors)
/** Campfire fuel: burnable items only (never liquid containers like the gas can, never drinks). */
const isFireFuel = (s) => {
  const d = getItemDef(s.id);
  if (d.liquidContainer || d.drink || d.food) return false;
  return !!d.burnTime || ['log', 'plank', 'stick', 'newspaper', 'novel', 'comic', 'rag', 'rag_dirty', 'magazine'].includes(s.id);
};
const fuelMinutes = (s) => getItemDef(s.id).burnTime || 10;

const CONTAINER_NAMES = {
  fridge: 'Fridge', freezer: 'Freezer', stove: 'Oven', kitchen_cabinet: 'Kitchen Cabinet', kitchen_sink: 'Under the Sink', couch: 'Couch Cushions',
  couch_blue: 'Couch Cushions', wardrobe: 'Wardrobe', dresser: 'Dresser', bookshelf: 'Bookshelf', desk: 'Desk', medicine_cabinet: 'Medicine Cabinet',
  washing_machine: 'Washing Machine', workbench: 'Workbench', metal_shelf: 'Shelves', toolbox: 'Toolbox', gun_cabinet: 'Gun Cabinet', safe: 'Safe',
  store_shelf: 'Store Shelf', store_shelf_misc: 'Store Shelf', store_shelf_meds: 'Pharmacy Shelf', store_shelf_empty: 'Looted Shelf', cooler: 'Drinks Cooler',
  checkout: 'Checkout Counter', clothing_rack: 'Clothing Rack', filing_cabinet: 'Filing Cabinet', locker: 'Locker', medical_cabinet: 'Medical Cabinet',
  crate_wood: 'Wooden Crate', crate_military: 'Military Crate', cardboard_box: 'Cardboard Box', bar_counter: 'Bar Counter', floorboard_loose: 'Loose Floorboard',
  hollow_log: 'Hollow Log', mailbox: 'Mailbox', trash_can: 'Trash Can', dumpster: 'Dumpster', vending_machine: 'Vending Machine', barrel_rust: 'Barrel', trash_bags: 'Trash Bags',
};

export class Interactor {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.waterUsed = new Map(); // block idx -> uses taken (sinks, toilets, rain barrels)
    this.foraged = new Set();
    this.gasUsed = new Map();
  }

  /** Determine the interaction target under the crosshair. */
  scan() {
    const g = this.game, p = g.player, w = g.world;
    const cam = g.renderer.camera;
    const o = cam.position, d = p.forward(new THREE.Vector3());
    let best = null;
    const bh = raycast(w, o.x, o.y, o.z, d.x, d.y, d.z, REACH, interactFilter);
    const wh = raycast(w, o.x, o.y, o.z, d.x, d.y, d.z, REACH, (id, def) => def.render === 'liquid');
    if (bh) {
      const def = BLOCKS[bh.id];
      if (def.container || def.door || def.interact || bh.id === B.glass_broken || isWindowGlass(bh.id) || (bh.id === B.barricade)) best = { kind: 'block', dist: bh.dist, hit: bh, def };
    }
    if (wh && (!best || wh.dist < best.dist) && (!bh || wh.dist <= bh.dist + 0.01)) best = { kind: 'water', dist: wh.dist, hit: wh };
    // ground items
    for (const it of g.groundItems.near(p.x, p.y, p.z, REACH + 0.5)) {
      const v = new THREE.Vector3(it.x - o.x, it.y + 0.2 - o.y, it.z - o.z);
      const along = v.dot(d);
      if (along < 0 || along > REACH) continue;
      const perp = v.addScaledVector(d, -along).length();
      if (perp < 0.35 && (!best || along < best.dist + 0.3)) best = { kind: 'item', dist: along, item: it };
    }
    // corpses (zombie + static)
    const tmp = new THREE.Vector3();
    for (const z of g.zombies.corpses) {
      g.zombies.corpsePosition(z, tmp);
      if (tmp.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) > 2.6) continue;
      const v = tmp.clone().sub(o);
      const along = v.dot(d);
      if (along < 0) continue;
      const perp = v.addScaledVector(d, -along).length();
      if (perp < 0.8 && (!best || along < best.dist)) best = { kind: 'zcorpse', dist: along, zombie: z };
    }
    for (const c of g.corpses.near(p.x, p.y, p.z, 2.6)) {
      const v = new THREE.Vector3(c.x - o.x, c.y + 0.2 - o.y, c.z - o.z);
      const along = v.dot(d);
      if (along < 0) continue;
      const perp = v.addScaledVector(d, -along).length();
      if (perp < 0.9 && (!best || along < best.dist)) best = { kind: 'corpse', dist: along, corpse: c };
    }
    const vh = g.vehicles.raycast(o, d, REACH);
    if (vh && (!best || vh.dist < best.dist)) best = { kind: 'vehicle', dist: vh.dist, vehicle: vh.v };
    // An open door is only a thin panel at its hinge: when the crosshair is on the empty doorway (and on
    // nothing else), still offer "Close Door" (not for the doorway the player is standing in).
    if (!best) {
      const dh = this.openDoorAlong(o, d, bh && bh.id !== B.water ? Math.min(bh.dist, REACH) : REACH);
      if (dh) best = { kind: 'block', dist: dh.dist, hit: dh, def: BLOCKS[dh.id] };
    }
    return best;
  }

  /** First open-door cell the ray passes through (whole cell counts), skipping the cell the eye is in. */
  openDoorAlong(o, d, maxDist) {
    const w = this.game.world;
    const ex = Math.floor(o.x), ey = Math.floor(o.y), ez = Math.floor(o.z);
    let lx = ex, ly = ey, lz = ez;
    for (let t = 0.1; t <= maxDist; t += 0.08) {
      const x = Math.floor(o.x + d.x * t), y = Math.floor(o.y + d.y * t), z = Math.floor(o.z + d.z * t);
      if (x === lx && y === ly && z === lz) continue;
      lx = x; ly = y; lz = z;
      if (x === ex && z === ez && (y === ey || y === ey - 1)) continue;
      const id = w.get(x, y, z);
      if (!IS_DOOR[id]) continue;
      if (!(w.getMeta(x, y, z) & 4)) return null; // closed door: the precise ray already handles it
      return { x, y, z, id, nx: 0, ny: 0, nz: 0, dist: t, px: o.x + d.x * t, py: o.y + d.y * t, pz: o.z + d.z * t };
    }
    return null;
  }

  /** Kitchen sinks are both a cabinet and a tap: the basin (top face) is the tap, the front is the cabinet. */
  usesTap(t) {
    return t.def.interact === 'sink' && (!t.def.container || t.hit.ny === 1);
  }

  /** Is the player on the inside of this door (so a plain lock can be opened by hand)? */
  insideOf(door) {
    const w = this.game.world, p = this.game.player;
    const [nx, , nz] = FACING_DIR[door.facing];
    const side = Math.sign((p.x - (door.x + 0.5)) * nx + (p.z - (door.z + 0.5)) * nz) || 1;
    // An exterior door: open sky within a few steps on the far side (a porch roof is short), while the
    // player's side stays under the building's roof. Interior doors (locked rooms) never qualify.
    const roofedRun = (s, max) => {
      let n = 0;
      for (let k = 1; k <= max; k++) { if (w.roofY(door.x + nx * k * s, door.z + nz * k * s) > door.y + 1) n++; else break; }
      return n;
    };
    return roofedRun(side, 3) === 3 && roofedRun(-side, 4) < 4;
  }

  label(t) {
    const g = this.game, p = g.player;
    if (!t) return null;
    const held = p.inv.selectedStack;
    const heldTags = held ? getItemDef(held.id).tags || [] : [];
    switch (t.kind) {
      case 'item': {
        const s = t.item.stack;
        if (s.data?.noteId) return { key: 'E', text: 'Read ' + getItemDef(s.id).name, sub: 'Takes it with you' };
        return { key: 'E', text: 'Pick up ' + getItemDef(s.id).name + ((s.count || 1) > 1 ? ` (${s.count})` : '') };
      }
      case 'zcorpse': return { key: 'E', text: 'Search Zombie' };
      case 'corpse': return { key: 'E', text: 'Search Body' };
      case 'vehicle': return { key: 'E', text: 'Search ' + vehicleName(t.vehicle.type), sub: t.vehicle.alarm && !t.vehicle.alarmUsed && !t.vehicle.burned ? 'Something blinks on the dashboard...' : null };
      case 'water': return { key: 'E', text: 'Drink Water', sub: 'Untreated water may make you sick' };
    }
    const { hit, def } = t;
    const w = g.world;
    if (def.door) {
      const door = w.getDoor(hit.x, hit.y, hit.z);
      if (heldTags.includes('hammer') && !door.open) return { key: 'E', text: door.barricade > 0 ? 'Reinforce Barricade' : 'Barricade Door', sub: 'Needs a plank and 2 nails' };
      if (door.barricade > 0 && !door.open) {
        if (heldTags.includes('pry')) return { key: 'E', text: 'Pry Off Boards', sub: 'Recovers some planks' };
        return { key: 'E', text: 'Barricaded Door', sub: 'Pry the boards off with a crowbar, or break through' };
      }
      if (door.locked && !door.open) {
        if (door.locked === true && this.insideOf(door)) return { key: 'E', text: 'Unlock Door', sub: 'Locked from this side' };
        return { key: 'E', text: 'Locked Door', sub: this.lockHint(door) };
      }
      return { key: 'E', text: door.open ? 'Close Door' : 'Open Door' };
    }
    if (isWindowGlass(hit.id) || hit.id === B.glass_broken || hit.id === B.barricade) {
      if (heldTags.includes('hammer')) return { key: 'E', text: hit.id === B.barricade ? 'Reinforce Barricade' : 'Barricade Window', sub: 'Needs a plank and 2 nails' };
      if (hit.id === B.glass_broken) return { key: 'E', text: 'Clear Glass Shards', sub: 'Gloves help' };
      return null;
    }
    if (def.container && !this.usesTap(t)) {
      const c = w.getContainer(hit.x, hit.y, hit.z);
      const name = c?.name || CONTAINER_NAMES[def.name] || 'Container';
      if (c?.locked) return { key: 'E', text: 'Locked ' + name, sub: this.lockHint(c) };
      if (def.interact === 'workbench') return { key: 'E', text: 'Open ' + name, sub: 'Crafting station (C to craft here)' };
      if (def.interact === 'sink') return { key: 'E', text: 'Open ' + name, sub: 'Look at the basin to use the tap' };
      return { key: 'E', text: 'Open ' + name };
    }
    switch (def.interact) {
      case 'bed': return { key: 'E', text: 'Sleep' };
      case 'sink': return g.time.day > 3 ? { key: 'E', text: 'Use Sink', sub: 'The taps have probably run dry' } : { key: 'E', text: 'Use Sink', sub: 'Drink / fill bottles' };
      case 'toilet': return { key: 'E', text: 'Drink from Toilet Tank', sub: 'Desperate times...' };
      case 'water_pump': return { key: 'E', text: 'Use Water Pump', sub: 'Clean well water' };
      case 'rain_barrel': return { key: 'E', text: 'Use Rain Barrel' };
      case 'gas_pump': return { key: 'E', text: 'Siphon Gas', sub: 'Needs an empty gas can' };
      case 'campfire': {
        const held2 = p.inv.selectedStack;
        if (held2 && isFireFuel(held2) && g.campfires.has(w.idx(hit.x, hit.y, hit.z))) return { key: 'E', text: 'Add ' + getItemDef(held2.id).name + ' to the Fire', sub: this.fireLeft(hit) };
        return { key: 'E', text: 'Warm up / Cook', sub: g.campfires.has(w.idx(hit.x, hit.y, hit.z)) ? this.fireLeft(hit) + ' · hold fuel to add it' : 'Crafting near fire unlocked (C)' };
      }
      case 'campfire_out': return { key: 'E', text: 'Light Campfire', sub: 'Needs fuel and a lighter or matches' };
      case 'workbench': return { key: 'E', text: 'Workbench', sub: 'Open crafting (C)' };
      case 'radio': return { key: 'E', text: 'Listen to Radio' };
      case 'forage': return { key: 'E', text: 'Pick Berries' };
    }
    return null;
  }

  /** Hint matching what tryUnlock will actually do (same priority: key, held pry tool, lockpick). */
  lockHint(obj) {
    const p = this.game.player, inv = p.inv;
    const keyId = obj && typeof obj.locked === 'string' ? obj.locked : null;
    if (keyId && this.hasKey(keyId)) return 'Unlock with your key (E)';
    const held = inv.selectedStack;
    if (held && (getItemDef(held.id).tags || []).includes('pry')) return this.isSafe(obj) ? 'Pry it open (E) - slow and loud' : 'Pry it open (E)';
    if (p.bonus?.lockpick) return 'You can pick this lock (E)';
    if (this.hasLockpick()) return 'Pick the lock (E)';
    if (keyId) return 'Needs a key - or pry it, or pick the lock';
    return 'Pry it with a crowbar, pick the lock, or break it down';
  }
  hasKey(keyId) { return this.game.player.inv.has((s) => s.id === keyId || s.data?.keyId === keyId); }
  hasLockpick() { return this.game.player.inv.has((s) => hasTag(s, 'lockpick')); }
  isSafe(obj) { return !!obj && !obj.kind && obj.x !== undefined && this.game.world.get(obj.x, obj.y, obj.z) === B.safe; }
  fireLeft(hit) {
    const c = this.game.campfires.get(this.game.world.idx(hit.x, hit.y, hit.z));
    if (!c) return '';
    const m = Math.max(0, Math.round(c.fuel * 60));
    return m >= 60 ? `Burns ~${Math.floor(m / 60)}h ${m % 60}m more` : `Burns ~${m} min more`;
  }

  update(dt, input) {
    const g = this.game;
    this.target = g.actionBusy ? null : this.scan();
    g.hud.interaction = this.label(this.target);
    if (input.interactPressed && this.target && !g.actionBusy) this.interact(this.target);
  }

  interact(t) {
    const g = this.game, p = g.player, w = g.world;
    switch (t.kind) {
      case 'item': {
        const s = t.item.stack;
        const before = s.count || 1;
        if (s.data?.noteId) g.itemActions?.read?.({ slots: [s], kind: 'floor' }, 0);
        const left = p.inv.addItem(s);
        if (left && (left.count || 1) >= before) { if (!s.data?.noteId) g.ui?.toast('Your inventory is full.', 'warn'); return; }
        if (!left) g.groundItems.remove(t.item);
        else g.ui?.toast('Your inventory is full - picked up ' + (before - (left.count || 1)) + '.', 'warn');
        g.audio.play('item_pickup', { volume: 0.7 });
        g.afterInventoryChange();
        return;
      }
      case 'zcorpse': {
        g.zombies.corpseLoot(t.zombie);
        g.openLoot([{ key: 'zc:' + t.zombie.id, name: 'Zombie', kind: 'corpse', slots: t.zombie.loot }]);
        return;
      }
      case 'corpse': g.openLoot([g.corpses.desc(t.corpse)]); return;
      case 'vehicle': {
        const v = t.vehicle;
        if (v.alarm && !v.alarmUsed && Math.random() < 0.45) g.vehicles.triggerAlarm(v);
        g.audio.play('container_metal_open', { pos: { x: v.x, y: v.y + 1, z: v.z } });
        g.openLoot(g.vehicles.lootDescs(v));
        return;
      }
      case 'water': {
        this.drinkFrom({ label: 'River', liquid: 'dirty_water' });
        return;
      }
    }
    const { hit, def } = t;
    const held = p.inv.selectedStack;
    const heldTags = held ? getItemDef(held.id).tags || [] : [];
    if (def.door) {
      const door = w.getDoor(hit.x, hit.y, hit.z);
      if (heldTags.includes('hammer') && !door.open) return this.barricadeDoor(door);
      if (door.barricade > 0 && !door.open) {
        if (heldTags.includes('pry')) return this.unbarricadeDoor(door);
        g.audio.play('door_locked', { volume: 0.7 });
        g.ui?.toast('The door is boarded up. Pry the boards off with a crowbar, or break through.', 'warn');
        return;
      }
      const toggle = () => {
        door.open = !door.open;
        w.syncDoor(door);
        const pos = { x: door.x + 0.5, y: door.y + 1, z: door.z + 0.5 };
        g.audio.play(door.open ? 'door_open' : 'door_close', { pos });
        g.noise(pos.x, pos.y, pos.z, p.crouching ? 2 : 5, 'door', true);
      };
      if (door.locked && !door.open) {
        if (door.locked === true && this.insideOf(door)) { door.locked = false; g.audio.play('cock', { volume: 0.5 }); toggle(); return; }
        return this.tryUnlock(door, (how) => { door.locked = false; g.ui?.toast(how === 'key' ? 'Unlocked with your key.' : 'Unlocked.', 'good'); if (!door.open) toggle(); });
      }
      toggle();
      return;
    }
    if (isWindowGlass(hit.id) || hit.id === B.glass_broken || hit.id === B.barricade) {
      if (heldTags.includes('hammer')) return this.barricadeWindow(hit);
      if (hit.id === B.glass_broken) {
        g.startAction({
          label: 'Clearing glass', time: 1.5, anim: 'craft',
          onDone: () => {
            if (w.get(hit.x, hit.y, hit.z) !== B.glass_broken) return;
            w.setBlock(hit.x, hit.y, hit.z, 0);
            g.audio.play('hit_glass', { pos: { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 }, volume: 0.5 });
            const gloved = !!p.inv.getEquipped('hands');
            if (!gloved && Math.random() < 0.3) { g.survival.addWound('glass', Math.random() < 0.5 ? 'armL' : 'armR'); g.ui?.toast('You cut yourself on the glass!', 'danger'); }
          },
        });
      }
      return;
    }
    if (def.container && !this.usesTap(t)) {
      const c = w.getContainer(hit.x, hit.y, hit.z);
      const open = () => {
        g.audio.play(def.mat === 'metal' ? 'container_metal_open' : 'container_open', { pos: { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 } });
        g.openLoot([g.containerDesc(c)]);
      };
      if (c.locked) return this.tryUnlock(c, () => { c.locked = false; c.lockedChanged = true; g.ui?.toast('You got it open.', 'good'); open(); });
      open();
      return;
    }
    switch (def.interact) {
      case 'bed': return g.trySleep(hit);
      case 'sink': {
        if (g.time.day > 3) { g.ui?.toast('The taps sputter and go dry. The water has been shut off.', 'warn'); return; }
        return this.drinkFrom({ label: 'Tap', liquid: 'water', idx: w.idx(hit.x, hit.y, hit.z), limit: 30 });
      }
      case 'toilet': return this.drinkFrom({ label: 'Toilet Tank', liquid: 'dirty_water', idx: w.idx(hit.x, hit.y, hit.z), limit: 6 });
      case 'water_pump': return this.drinkFrom({ label: 'Water Pump', liquid: 'water' });
      case 'rain_barrel': return this.drinkFrom({ label: 'Rain Barrel', liquid: 'water', idx: w.idx(hit.x, hit.y, hit.z), limit: 12 + Math.floor(g.rainCollected) });
      case 'gas_pump': return this.siphonGas(hit);
      case 'campfire': {
        const fire = g.campfires.get(w.idx(hit.x, hit.y, hit.z));
        if (fire && held && isFireFuel(held)) return this.addFuel(fire, held);
        g.ui?.openPanel?.('crafting');
        return;
      }
      case 'campfire_out': return this.lightCampfire(hit);
      case 'workbench': g.ui?.openPanel?.('crafting'); return;
      case 'radio': return this.listenRadio();
      case 'forage': return this.forage(hit);
    }
  }

  // ------------------------------------------------------------------ locks
  tryUnlock(obj, onOpen) {
    const g = this.game, p = g.player;
    const inv = p.inv;
    const keyId = typeof obj.locked === 'string' ? obj.locked : null;
    if (keyId && this.hasKey(keyId)) {
      g.audio.play('cock', { volume: 0.6 });
      onOpen('key');
      return;
    }
    const held = inv.selectedStack;
    const tags = held ? getItemDef(held.id).tags || [] : [];
    if (tags.includes('pry')) {
      const safe = this.isSafe(obj);
      g.startAction({
        label: safe ? 'Prying the safe door' : 'Prying it open', time: safe ? 12 : 4, anim: 'craft', sound: 'pry',
        onDone: () => {
          g.noise(p.x, p.y, p.z, safe ? 24 : 12, 'pry', true);
          onOpen('pry');
          if (obj.hp !== undefined && obj.maxHp) obj.hp = Math.min(obj.hp, obj.maxHp * 0.5);
          if (held.dur !== undefined) { held.dur = Math.max(1, held.dur - (safe ? 8 : 2)); inv.changed(); }
        },
      });
      return;
    }
    if (p.bonus?.lockpick || this.hasLockpick()) {
      const chance = (p.bonus?.lockpick ? 0.85 : 0.5 + p.skillLevel('sneaking') * 0.04) * (this.isSafe(obj) ? 0.6 : 1);
      g.startAction({
        label: 'Picking the lock', time: 6, anim: 'craft', sound: 'ui_click',
        onDone: () => {
          if (Math.random() < chance) { onOpen('pick'); p.addXP('sneaking', 5); }
          else {
            g.ui?.toast('The pick slips... try again.', 'warn');
            if (!p.bonus?.lockpick && Math.random() < 0.4) { inv.remove((s) => hasTag(s, 'lockpick'), 1); inv.changed(); g.ui?.toast('Your lockpick snapped.', 'warn'); }
          }
        },
      });
      return;
    }
    g.audio.play('door_locked', { volume: 0.8 });
    g.ui?.toast('It\'s locked. ' + this.lockHint(), 'warn');
  }

  // ------------------------------------------------------------------ barricades
  hasBarricadeMats() {
    const inv = this.game.player.inv;
    return inv.has('plank') && inv.count('nails') >= 2;
  }
  barricadeDoor(door) {
    const g = this.game;
    if (!this.hasBarricadeMats()) { g.ui?.toast('You need a plank and 2 nails.', 'warn'); return; }
    g.startAction({
      label: 'Barricading', time: 3, anim: 'craft', sound: 'barricade_hammer',
      onDone: () => {
        if (!this.hasBarricadeMats() || !g.world.getDoor(door.x, door.y, door.z)) return;
        g.player.inv.remove('plank', 1); g.player.inv.remove('nails', 2);
        door.barricade = Math.min(PLANK_HP * 4, (door.barricade || 0) + PLANK_HP * (g.player.bonus?.barricade || 1));
        door.open = false;
        g.world.syncDoor(door);
        g.noise(door.x, door.y, door.z, 18, 'hammer', true);
        g.player.addXP('maintenance', 4);
        g.player.inv.changed();
        g.ui?.toast(`Barricade: ${Math.max(1, Math.round(door.barricade / PLANK_HP))} plank${door.barricade > PLANK_HP * 1.5 ? 's' : ''} thick.`, 'good');
      },
    });
  }
  unbarricadeDoor(door) {
    const g = this.game;
    g.startAction({
      label: 'Prying off boards', time: 4, anim: 'craft', sound: 'pry',
      onDone: () => {
        if (!(door.barricade > 0)) return;
        const planks = Math.max(1, Math.floor(door.barricade / PLANK_HP));
        door.barricade = 0;
        g.world.syncDoor(door);
        g.noise(door.x, door.y, door.z, 12, 'pry', true);
        g.itemActions.giveOrDrop(createItem('plank', { count: planks }));
        g.ui?.toast(`You pried the boards off (${planks} plank${planks > 1 ? 's' : ''}).`, 'good');
        g.player.inv.changed();
      },
    });
  }
  barricadeWindow(hit) {
    const g = this.game, w = g.world;
    if (!this.hasBarricadeMats()) { g.ui?.toast('You need a plank and 2 nails.', 'warn'); return; }
    g.startAction({
      label: 'Barricading window', time: 3, anim: 'craft', sound: 'barricade_hammer',
      onDone: () => {
        if (!this.hasBarricadeMats()) return;
        const id = w.get(hit.x, hit.y, hit.z);
        if (id !== B.barricade && !isWindowGlass(id) && id !== B.glass_broken && id !== 0) return;
        g.player.inv.remove('plank', 1); g.player.inv.remove('nails', 2);
        const idx = w.idx(hit.x, hit.y, hit.z);
        // a reinforced barricade stores negative damage (extra hp); cap at 3 extra planks
        if (id === B.barricade) g.blockDamage.set(idx, Math.max(-360, Math.min(0, g.blockDamage.get(idx) || 0) - 120));
        else w.setBlock(hit.x, hit.y, hit.z, B.barricade);
        g.noise(hit.x, hit.y, hit.z, 18, 'hammer', true);
        g.player.addXP('maintenance', 4);
        g.player.inv.changed();
      },
    });
  }

  // ------------------------------------------------------------------ water / misc
  /** Water source the player is near (for filling bottles from the context menu). */
  nearbyWaterSource() {
    const t = this.target;
    if (!t) return null;
    if (t.kind === 'water') return { label: 'River', liquid: 'dirty_water' };
    if (t.kind !== 'block') return null;
    const w = this.game.world;
    const idx = w.idx(t.hit.x, t.hit.y, t.hit.z);
    switch (t.def.interact) {
      case 'water_pump': return { label: 'Pump', liquid: 'water' };
      case 'sink': return this.game.time.day > 3 ? null : this.limited({ label: 'Tap', liquid: 'water', idx, limit: 30 });
      case 'rain_barrel': return this.limited({ label: 'Rain Barrel', liquid: 'water', idx, limit: 12 + Math.floor(this.game.rainCollected) });
      case 'toilet': return this.limited({ label: 'Toilet Tank', liquid: 'dirty_water', idx, limit: 6 });
    }
    return null;
  }
  limited(src) {
    if (src.idx === undefined) return src;
    src.take = (n) => {
      const used = this.waterUsed.get(src.idx) || 0;
      const amt = Math.max(0, Math.min(n, src.limit - used));
      this.waterUsed.set(src.idx, used + amt);
      return amt;
    };
    return src;
  }

  drinkFrom(src) {
    const g = this.game, p = g.player;
    if (src.idx !== undefined) {
      const used = this.waterUsed.get(src.idx) || 0;
      if (used >= src.limit) { g.ui?.toast('There is no water left.', 'warn'); return; }
    }
    if (p.thirst > 97) { g.ui?.toast("You're not thirsty. (Right-click a bottle to fill it.)", 'info'); return; }
    g.startAction({
      label: 'Drinking from ' + src.label, time: 2.2, anim: 'drink', sound: 'drink',
      onDone: () => {
        if (src.idx !== undefined) this.waterUsed.set(src.idx, (this.waterUsed.get(src.idx) || 0) + 2);
        p.thirst = Math.min(100, p.thirst + 35);
        if (src.liquid === 'dirty_water' && Math.random() < 0.65) { p.sickness = Math.min(100, p.sickness + 25); }
        // auto-fill one empty / partly filled bottle with the same liquid
        // only drinking vessels (never the gas can or the cooking pot); an empty bottle takes any water
        const bottle = p.inv.find((s) => {
          const d = getItemDef(s.id);
          if (!d.liquidContainer || !d.drink || hasTag(s, 'fuel')) return false;
          return ((s.uses || 0) <= 0 || !s.data?.liquid || s.data.liquid === src.liquid) && (s.uses || 0) < d.liquidContainer.capacity;
        })[0];
        if (bottle && src.liquid !== 'gasoline') {
          const d = getItemDef(bottle.stack.id);
          const want = d.liquidContainer.capacity - (bottle.stack.uses || 0);
          const amt = src.idx !== undefined ? this.limited({ ...src }).take(want) : want;
          if (amt > 0) {
            bottle.stack.data = { ...(bottle.stack.data || {}), liquid: src.liquid };
            bottle.stack.uses = (bottle.stack.uses || 0) + amt;
            g.ui?.toast(`Filled your ${d.name}.`, 'good');
            p.inv.changed();
          }
        }
      },
    });
  }

  siphonGas(hit) {
    const g = this.game, p = g.player, w = g.world;
    const can = p.inv.find((s) => s.id === 'gas_can' && (s.uses || 0) < (getItemDef('gas_can').liquidContainer?.capacity || getItemDef('gas_can').uses || 10))[0];
    if (!can) { g.ui?.toast('You need a gas can with room in it.', 'warn'); return; }
    const idx = w.idx(hit.x, hit.y, hit.z);
    const left = 12 - (this.gasUsed.get(idx) || 0);
    if (left <= 0) { g.ui?.toast('The underground tank is dry.', 'warn'); return; }
    g.startAction({
      label: 'Siphoning gasoline', time: 5, anim: 'craft', sound: 'splash',
      onDone: () => {
        const cap = getItemDef('gas_can').liquidContainer?.capacity || getItemDef('gas_can').uses || 10;
        const amt = Math.min(left, cap - (can.stack.uses || 0));
        can.stack.uses = (can.stack.uses || 0) + amt;
        can.stack.data = { ...(can.stack.data || {}), liquid: 'gasoline' };
        this.gasUsed.set(idx, (this.gasUsed.get(idx) || 0) + amt);
        g.ui?.toast('Filled the gas can.', 'good');
        p.inv.changed();
      },
    });
  }

  lightCampfire(hit) {
    const g = this.game, p = g.player, inv = p.inv;
    const starter = inv.find((s) => hasTag(s, 'fire_starter'))[0];
    if (!starter) { g.ui?.toast('You need a lighter or matches.', 'warn'); return; }
    // burn the best fuel carried (held fuel first): a log burns for hours, a rag barely catches
    const held = inv.selectedStack;
    const fuels = inv.find(isFireFuel).sort((a, b) => fuelMinutes(b.stack) - fuelMinutes(a.stack));
    const fuel = held && isFireFuel(held) ? { stack: held } : fuels[0];
    if (!fuel) { g.ui?.toast('You need fuel: logs, planks, sticks or paper.', 'warn'); return; }
    g.startAction({
      label: 'Lighting a fire', time: 3, anim: 'craft', sound: 'match',
      onDone: () => {
        if (g.world.get(hit.x, hit.y, hit.z) !== B.campfire_out) return;
        const mins = fuelMinutes(fuel.stack);
        fuel.stack.count = (fuel.stack.count || 1) - 1;
        if (fuel.stack.count <= 0) inv.removeStack(fuel.stack);
        const sd = getItemDef(starter.stack.id);
        if (sd.uses) { starter.stack.uses = (starter.stack.uses ?? sd.uses) - 1; if (starter.stack.uses <= 0) inv.removeStack(starter.stack); }
        g.world.setBlock(hit.x, hit.y, hit.z, B.campfire);
        g.campfires.set(g.world.idx(hit.x, hit.y, hit.z), { x: hit.x, y: hit.y, z: hit.z, fuel: 1 + (mins * 2) / 60 });
        g.audio.play('lighter', { pos: { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 }, volume: 0.6 });
        g.ui?.toast('The fire catches. ' + this.fireLeft(hit) + '.', 'good');
        inv.changed();
      },
    });
  }

  addFuel(fire, stack) {
    const g = this.game, inv = g.player.inv;
    const mins = fuelMinutes(stack);
    stack.count = (stack.count || 1) - 1;
    if (stack.count <= 0) inv.removeStack(stack);
    fire.fuel = Math.min(12, fire.fuel + (mins * 2) / 60);
    g.audio.play('wood_chop', { pos: { x: fire.x + 0.5, y: fire.y + 0.5, z: fire.z + 0.5 }, volume: 0.3 });
    g.ui?.toast('Added fuel. ' + this.fireLeft(fire) + '.', 'good');
    inv.changed();
  }

  listenRadio() {
    const g = this.game;
    const day = g.time.day;
    const list = RADIO_BROADCASTS.filter((b) => b.day <= day);
    g.audio.play('radio_static', { volume: 0.8 });
    if (!list.length) { g.ui?.subtitle('[Static]', 3); return; }
    const pick = list[Math.max(0, list.length - 1 - Math.floor(Math.random() * Math.min(3, list.length)))];
    g.ui?.subtitle('[Radio] ' + pick.text, Math.min(14, 4 + pick.text.length / 18));
  }

  forage(hit) {
    const g = this.game, p = g.player, w = g.world;
    g.startAction({
      label: 'Foraging', time: 2.5, anim: 'craft', sound: 'item_pickup',
      onDone: () => {
        const n = 1 + Math.floor(Math.random() * (2 + p.skillLevel('scavenging') * 0.4));
        g.itemActions.giveOrDrop(createItem('berries', { count: n, age: g.time.totalHours }));
        w.setBlock(hit.x, hit.y, hit.z, B.bush);
        p.addXP('scavenging', 3);
        g.ui?.toast(`Picked ${n} berries.`, 'good');
      },
    });
  }

  lookingAtCampfire() { return this.target?.def?.interact === 'campfire'; }

  toJSON() { return { water: [...this.waterUsed], gas: [...this.gasUsed] }; }
  load(d) { if (!d) return; this.waterUsed = new Map(d.water || []); this.gasUsed = new Map(d.gas || []); }
}
export { generateLoot, makeRng, hash32 };
