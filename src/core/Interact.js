// What the player is looking at + the E interaction (containers, doors, beds, water, campfires, items, corpses, cars).
import * as THREE from 'three';
import { raycast } from '../world/raycast.js';
import { BLOCKS, B, IS_DOOR } from '../world/blocks.js';
import { getItemDef, createItem } from '../items/items.js';
import { RADIO_BROADCASTS } from '../world/gen/lore.js';
import { generateLoot } from '../items/loot.js';
import { makeRng, hash32 } from './rng.js';

const REACH = 3.2;
const hasTag = (s, t) => (getItemDef(s.id).tags || []).includes(t);
function interactFilter(id, d) { return d.render !== 'none'; }

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
      if (def.container || def.door || def.interact || bh.id === B.glass_broken || bh.id === B.glass || (bh.id === B.barricade)) best = { kind: 'block', dist: bh.dist, hit: bh, def };
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
      const v = new THREE.Vector3(c.x + 0.5 - o.x, c.y + 0.2 - o.y, c.z + 0.5 - o.z);
      const along = v.dot(d);
      if (along < 0) continue;
      const perp = v.addScaledVector(d, -along).length();
      if (perp < 0.9 && (!best || along < best.dist)) best = { kind: 'corpse', dist: along, corpse: c };
    }
    const vh = g.vehicles.raycast(o, d, REACH);
    if (vh && (!best || vh.dist < best.dist)) best = { kind: 'vehicle', dist: vh.dist, vehicle: vh.v };
    return best;
  }

  label(t) {
    const g = this.game, p = g.player;
    if (!t) return null;
    const held = p.inv.selectedStack;
    const heldTags = held ? getItemDef(held.id).tags || [] : [];
    switch (t.kind) {
      case 'item': return { key: 'E', text: 'Pick up ' + getItemDef(t.item.stack.id).name + ((t.item.stack.count || 1) > 1 ? ` (${t.item.stack.count})` : '') };
      case 'zcorpse': return { key: 'E', text: 'Search Zombie' };
      case 'corpse': return { key: 'E', text: 'Search Body' };
      case 'vehicle': return { key: 'E', text: 'Search ' + t.vehicle.type.replace('_', ' '), sub: t.vehicle.alarm && !t.vehicle.alarmUsed ? 'Something blinks on the dashboard...' : null };
      case 'water': return { key: 'E', text: 'Drink Water', sub: 'Untreated water may make you sick' };
    }
    const { hit, def } = t;
    const w = g.world;
    if (def.door) {
      const door = w.getDoor(hit.x, hit.y, hit.z);
      if (heldTags.includes('hammer') && !door.open) return { key: 'E', text: door.barricade > 0 ? 'Reinforce Barricade' : 'Barricade Door', sub: 'Needs a plank and 2 nails' };
      if (door.locked && !door.open) return { key: 'E', text: 'Locked Door', sub: this.lockHint() };
      return { key: 'E', text: door.open ? 'Close Door' : 'Open Door' };
    }
    if (hit.id === B.glass || hit.id === B.glass_broken || hit.id === B.barricade) {
      if (heldTags.includes('hammer')) return { key: 'E', text: hit.id === B.barricade ? 'Reinforce Barricade' : 'Barricade Window', sub: 'Needs a plank and 2 nails' };
      if (hit.id === B.glass_broken) return { key: 'E', text: 'Clear Glass Shards' };
      return null;
    }
    if (def.container) {
      const c = w.getContainer(hit.x, hit.y, hit.z);
      const name = c?.name || CONTAINER_NAMES[def.name] || 'Container';
      if (c?.locked) return { key: 'E', text: 'Locked ' + name, sub: this.lockHint() };
      return { key: 'E', text: 'Open ' + name };
    }
    switch (def.interact) {
      case 'bed': return { key: 'E', text: 'Sleep' };
      case 'sink': return { key: 'E', text: 'Use Sink' };
      case 'toilet': return { key: 'E', text: 'Drink from Toilet Tank', sub: 'Desperate times...' };
      case 'water_pump': return { key: 'E', text: 'Use Water Pump', sub: 'Clean well water' };
      case 'rain_barrel': return { key: 'E', text: 'Use Rain Barrel' };
      case 'gas_pump': return { key: 'E', text: 'Siphon Gas', sub: 'Needs an empty gas can' };
      case 'campfire': return { key: 'E', text: 'Warm up / Cook', sub: 'Crafting near fire unlocked (C)' };
      case 'campfire_out': return { key: 'E', text: 'Light Campfire', sub: 'Needs fuel and a lighter or matches' };
      case 'workbench': return { key: 'E', text: 'Workbench', sub: 'Open crafting (C)' };
      case 'radio': return { key: 'E', text: 'Listen to Radio' };
      case 'forage': return { key: 'E', text: 'Pick Berries' };
    }
    return null;
  }

  lockHint() {
    const inv = this.game.player.inv;
    if (this.game.player.bonus?.lockpick) return 'You can pick this lock (E)';
    if (inv.has('lockpick')) return 'Pick lock (E)';
    const held = inv.selectedStack;
    if (held && (getItemDef(held.id).tags || []).includes('pry')) return 'Pry it open (E)';
    return 'Find the key, pry it with a crowbar, or break it down';
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
        const left = p.inv.addItem(t.item.stack);
        if (left) { g.ui?.toast('Your inventory is full.', 'warn'); return; }
        g.groundItems.remove(t.item);
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
      if (door.locked && !door.open) return this.tryUnlock(door, () => { door.locked = false; g.ui?.toast('Unlocked.', 'good'); });
      door.open = !door.open;
      w.syncDoor(door);
      const pos = { x: door.x + 0.5, y: door.y + 1, z: door.z + 0.5 };
      g.audio.play(door.open ? 'door_open' : 'door_close', { pos });
      g.noise(pos.x, pos.y, pos.z, p.crouching ? 2 : 5, 'door', true);
      return;
    }
    if (hit.id === B.glass || hit.id === B.glass_broken || hit.id === B.barricade) {
      if (heldTags.includes('hammer')) return this.barricadeWindow(hit);
      if (hit.id === B.glass_broken) {
        g.startAction({ label: 'Clearing glass', time: 1.5, anim: 'craft', onDone: () => { w.setBlock(hit.x, hit.y, hit.z, 0); g.audio.play('hit_glass', { volume: 0.5 }); if (!p.inv.has((s) => s.id === 'work_gloves' || s.id === 'leather_gloves' || s.id === 'tactical_gloves') && Math.random() < 0.3) { g.survival.addWound('glass', Math.random() < 0.5 ? 'armL' : 'armR'); g.ui?.toast('You cut yourself on the glass!', 'danger'); } } });
      }
      return;
    }
    if (def.container) {
      const c = w.getContainer(hit.x, hit.y, hit.z);
      if (c.locked) return this.tryUnlock(c, () => { c.locked = false; g.ui?.toast('You got it open.', 'good'); });
      g.audio.play(def.mat === 'metal' ? 'container_metal_open' : 'container_open', { pos: { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 } });
      g.openLoot([g.containerDesc(c)]);
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
      case 'campfire': g.ui?.openPanel?.('crafting'); return;
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
    if (keyId && inv.has((s) => s.id === keyId || s.data?.keyId === keyId)) {
      g.audio.play('cock', { volume: 0.6 });
      onOpen();
      return;
    }
    const held = inv.selectedStack;
    const tags = held ? getItemDef(held.id).tags || [] : [];
    if (tags.includes('pry')) {
      g.startAction({
        label: 'Prying it open', time: 4, anim: 'craft', sound: 'pry',
        onDone: () => { g.noise(p.x, p.y, p.z, 12, 'pry', true); onOpen(); if (obj.hp !== undefined && obj.maxHp) obj.hp = Math.min(obj.hp, obj.maxHp * 0.5); },
      });
      return;
    }
    if (p.bonus?.lockpick || inv.has('lockpick')) {
      const chance = p.bonus?.lockpick ? 0.85 : 0.5 + p.skillLevel('sneaking') * 0.04;
      g.startAction({
        label: 'Picking the lock', time: 6, anim: 'craft', sound: 'ui_click',
        onDone: () => {
          if (Math.random() < chance) { onOpen(); p.addXP('sneaking', 5); }
          else {
            g.ui?.toast('The pick slips...', 'warn');
            if (!p.bonus?.lockpick && Math.random() < 0.4) { inv.remove('lockpick', 1); g.ui?.toast('Your lockpick snapped.', 'warn'); }
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
        g.player.inv.remove('plank', 1); g.player.inv.remove('nails', 2);
        door.barricade = Math.min(600, (door.barricade || 0) + 150 * (g.player.bonus?.barricade || 1));
        door.open = false;
        g.world.syncDoor(door);
        g.noise(door.x, door.y, door.z, 18, 'hammer', true);
        g.player.addXP('maintenance', 4);
      },
    });
  }
  barricadeWindow(hit) {
    const g = this.game, w = g.world;
    if (!this.hasBarricadeMats()) { g.ui?.toast('You need a plank and 2 nails.', 'warn'); return; }
    g.startAction({
      label: 'Barricading window', time: 3, anim: 'craft', sound: 'barricade_hammer',
      onDone: () => {
        g.player.inv.remove('plank', 1); g.player.inv.remove('nails', 2);
        const idx = w.idx(hit.x, hit.y, hit.z);
        if (w.get(hit.x, hit.y, hit.z) === B.barricade) g.blockDamage.set(idx, Math.min(0, (g.blockDamage.get(idx) || 0) - 120));
        else w.setBlock(hit.x, hit.y, hit.z, B.barricade);
        g.noise(hit.x, hit.y, hit.z, 18, 'hammer', true);
        g.player.addXP('maintenance', 4);
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
        const bottle = p.inv.find((s) => { const d = getItemDef(s.id); return d.liquidContainer && (!s.data?.liquid || s.data.liquid === src.liquid) && (s.uses || 0) < d.liquidContainer.capacity; })[0];
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
    const fuel = inv.find((s) => ['log', 'plank', 'stick', 'newspaper', 'book_novel', 'comic', 'rag'].includes(s.id) || hasTag(s, 'fuel'))[0];
    if (!fuel) { g.ui?.toast('You need fuel: logs, planks, sticks or paper.', 'warn'); return; }
    g.startAction({
      label: 'Lighting a fire', time: 3, anim: 'craft', sound: 'match',
      onDone: () => {
        inv.remove(fuel.stack.id, 1);
        const sd = getItemDef(starter.stack.id);
        if (sd.uses) { starter.stack.uses = (starter.stack.uses ?? sd.uses) - 1; if (starter.stack.uses <= 0) inv.removeStack(starter.stack); }
        g.world.setBlock(hit.x, hit.y, hit.z, B.campfire);
        g.campfires.set(g.world.idx(hit.x, hit.y, hit.z), { x: hit.x, y: hit.y, z: hit.z, fuel: 3 });
        g.audio.play('fire_loop', { pos: { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 }, volume: 0.6 });
        inv.changed();
      },
    });
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
