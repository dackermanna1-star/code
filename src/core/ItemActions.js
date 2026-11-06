// Item context menus, using items (eat/drink/medicine/read/equip), tooltips, wound treatments.
import { getItemDef, createItem, itemWeight, itemFreshness, getFoodEffect, getDrinkEffect, freshnessState, itemDisplayName, LIQUIDS } from '../items/items.js';
import { EQUIP_SLOTS, EQUIP_LABELS, moveStack } from '../inventory/Inventory.js';
import { PART_LABELS, WOUND_INFO } from '../player/Survival.js';
import { SKILLS } from '../player/professions.js';
import { NOTES } from '../world/gen/lore.js';
import { clamp } from './rng.js';
import { B } from '../world/blocks.js';
const blockId = (n) => B[n] ?? 0;

const hasTag = (s, t) => (getItemDef(s.id).tags || []).includes(t);
const CALIBER = {
  ammo_9mm: '9mm', ammo_45: '.45 ACP', ammo_357: '.357 Magnum', ammo_12g: '12ga Buckshot', ammo_12g_slug: '12ga Slug',
  ammo_556: '5.56mm', ammo_762: '7.62x39mm', ammo_308: '.308 Win', ammo_22: '.22 LR', crossbow_bolt: 'Bolts', arrow: 'Arrows',
};
// tools that can force a can open when there is no can opener / blade (slower, spills some of it, noisy)
const CAN_BASH_TAGS = ['pry', 'screwdriver', 'hammer', 'chop', 'heavy'];
const STITCHABLE = new Set(['deep', 'laceration', 'bullet', 'glass']);
const TOOL_TAG_LINES = {
  can_opener: 'Opens cans', pry: 'Pries doors & crates', hammer: 'Barricades (with planks + nails)', saw: 'Saws logs into planks',
  fire_starter: 'Lights fires & cigarettes', lockpick: 'Picks locks', repair_cloth: 'Repairs clothing', repair_blade: 'Sharpens blades',
  repair_gun: 'Cleans firearms', cooking_pot: 'Boils water, cooks stew', screwdriver: 'Salvages electronics',
};
/** first aid kit / IFAK: treats every wound at once */
const isKit = (def) => !!def.medical && def.medical.heal >= 15 && def.medical.stopBleed > 0 && def.medical.disinfect > 0;
const woundBleed = (w) => (w.bleeding ? (WOUND_INFO[w.type]?.bleed || 0) * (w.severity || 1) : 0);
const WOUND_RANK = { deep: 6, bullet: 6, bite: 5, laceration: 4, glass: 3, burn: 3, scratch: 1, fracture: 2 };

export class ItemActions {
  constructor(game) { this.game = game; }
  get p() { return this.game.player; }
  get inv() { return this.game.player.inv; }

  // ------------------------------------------------------------------ context menu
  getItemActions(desc, index) {
    const g = this.game, s = desc.slots[index];
    if (!s) return [];
    const def = getItemDef(s.id);
    const A = [];
    const add = (label, run, disabled = false) => A.push({ label, run: () => { run(); g.ui?.refresh(); }, disabled });
    const inWorld = desc.kind === 'world' || desc.kind === 'floor' || desc.kind === 'corpse' || desc.kind === 'vehicle';
    if (inWorld) add('Take', () => this.take(desc, index));
    if (def.food) {
      const open = this.canOpener(def.food);
      const smoke = def.useLabel === 'Smoke';
      add(def.food.needsOpener ? (open === 'bash' ? 'Bash Open & Eat' : 'Open & Eat') : smoke ? 'Smoke' : 'Eat', () => this.eat(desc, index), def.food.needsOpener && !open);
    }
    if (def.food?.cookTo && g.nearFire()) add('Cook', () => this.cook(desc, index));
    if (def.drink && !def.liquidContainer) add('Drink', () => this.drink(desc, index));
    if (def.liquidContainer) {
      const liq = s.data?.liquid;
      if (liq && (s.uses || 0) > 0 && liq !== 'gasoline') add(liq === 'dirty_water' ? 'Drink (Unsafe Water)' : 'Drink', () => this.drink(desc, index));
      if (liq === 'dirty_water') {
        const pur = this.findPurifier();
        if (pur) add('Purify with ' + getItemDef(pur.stack.id).name, () => this.purify(s, pur.stack));
        if (g.nearFire() && (hasTag(s, 'cooking_pot') || this.inv.has((x) => hasTag(x, 'cooking_pot')))) add('Boil Water', () => this.boil(s));
      }
      const src = g.interact?.nearbyWaterSource();
      if (src && (s.uses || 0) < def.liquidContainer.capacity) add(`Fill (${src.label})`, () => this.fill(s, src));
      if (liq && (s.uses || 0) > 0) add('Pour Out', () => { s.uses = 0; s.data.liquid = null; g.audio.play('splash', { volume: 0.4 }); this.inv.changed(); });
    }
    if (def.purify && !def.liquidContainer) add('Purify Water', () => this.usePurifier(s), !this.findDirtyWater());
    if (def.medical) add(this.medicalLabel(def), () => this.useMedical(desc, index));
    if (def.clothing) {
      if (desc.kind === 'equipment') add('Unequip', () => this.unequip(index));
      else add('Wear (' + EQUIP_LABELS[def.clothing.slot] + ')', () => this.equip(desc, index));
      if ((def.tags || []).includes('fabric') && desc.kind !== 'equipment') add('Rip into Rags', () => this.rip(desc, index));
    }
    const holdable = def.melee || def.firearm || def.throwable || def.category === 'tool' || def.light;
    if (holdable && desc.kind !== 'hotbar') add('Equip in Hand', () => this.toHotbar(desc, index));
    if (holdable && desc.kind === 'hotbar' && index !== this.inv.selected) add('Hold', () => { this.inv.selected = index; this.inv.changed(); });
    if ((def.tags || []).includes('radio')) {
      add('Listen to Radio', () => {
        if ((s.uses ?? 100) <= 0) { g.ui?.toast('The radio is dead. It needs batteries.', 'warn'); return; }
        s.uses = Math.max(0, (s.uses ?? 100) - (def.radio?.drain || 2));
        g.interact?.listenRadio?.();
        this.inv.changed();
      });
      if ((s.uses ?? 100) < 100 && this.inv.has('batteries')) add('Replace Batteries', () => { this.inv.remove('batteries', 1); s.uses = 100; g.audio.play('flashlight_click'); });
    }
    if (def.firearm) {
      if ((s.ammo || 0) > 0) add(`Unload (${s.ammo})`, () => this.unload(s));
      if (s.data?.suppressor) add('Remove Suppressor', () => this.detachSuppressor(s));
      else {
        const sup = this.inv.find((x) => getItemDef(x.id).attachment?.fits?.includes(s.id))[0];
        if (sup) add('Attach ' + getItemDef(sup.stack.id).name, () => this.attachSuppressor(s, sup.stack));
      }
      if (s.jammed) add('Clear Jam', () => { s.jammed = false; g.audio.play('cock'); });
    }
    if (def.light) {
      add(this.p.flashlightOn ? 'Turn Off Light' : 'Turn On Light', () => g.toggleFlashlight());
      if (!def.light.fire && (s.uses ?? 100) < 100 && this.inv.has('batteries')) add('Replace Batteries', () => { this.inv.remove('batteries', 1); s.uses = 100; g.audio.play('flashlight_click'); });
    }
    if (def.place && !inWorld) add('Place ' + def.name.replace(' Kit', ''), () => this.place(desc, index));
    if (def.book || s.id === 'note' || (def.tags || []).includes('map') || s.data?.noteId) add('Read', () => this.read(desc, index));
    if ((s.count || 1) > 1) add('Split Stack', () => this.split(desc, index));
    if (!inWorld) {
      add('Drop', () => g.dropItem(desc, index, 1));
      if ((s.count || 1) > 1) add('Drop All', () => g.dropItem(desc, index));
    }
    return A;
  }

  medicalLabel(def) {
    const m = def.medical;
    if (isKit(def)) return 'Treat Wounds (' + (def.id === 'ifak' ? 'IFAK' : 'Kit') + ')';
    if (m.extract) return 'Remove Shard / Bullet';
    if (m.burn) return 'Treat Burn';
    if (m.stopBleed) return 'Apply Bandage';
    if (m.splint) return 'Apply Splint';
    if (m.suture) return 'Stitch Wound';
    if (m.disinfect) return 'Disinfect Wound';
    return def.id.includes('morphine') || def.id.includes('adrenaline') ? 'Inject' : 'Take';
  }

  /** Double click default action */
  useItem(desc, index) {
    const s = desc.slots[index];
    if (!s) return;
    const def = getItemDef(s.id);
    const inWorld = desc.kind === 'world' || desc.kind === 'floor' || desc.kind === 'corpse' || desc.kind === 'vehicle';
    if (inWorld) return this.take(desc, index);
    if (desc.kind === 'equipment') return this.unequip(index);
    if (def.food) return this.eat(desc, index);
    if (def.drink || (def.liquidContainer && s.uses > 0 && LIQUIDS[s.data?.liquid]?.drinkable)) return this.drink(desc, index);
    if (def.medical) return this.useMedical(desc, index);
    if (def.purify) return this.usePurifier(s);
    if (def.clothing) return this.equip(desc, index);
    if (def.book || s.data?.noteId || (def.tags || []).includes('map')) return this.read(desc, index);
    if (def.place) return this.place(desc, index);
    if (desc.kind !== 'hotbar') return this.toHotbar(desc, index);
  }

  take(desc, index) {
    const s = desc.slots[index];
    if (!s) return;
    const left = this.inv.addItem(s);
    desc.slots[index] = left;
    desc.onChange?.();
    this.game.audio.play('item_pickup', { volume: 0.6 });
    if (left) this.game.ui?.toast('No room in your inventory.', 'warn');
    this.game.afterInventoryChange();
  }

  consume(desc, index, n = 1) {
    const s = desc.slots[index];
    s.count = (s.count || 1) - n;
    if (s.count <= 0) desc.slots[index] = null;
    desc.onChange?.();
    this.inv.changed();
  }

  // ------------------------------------------------------------------ food & drink
  /** How a can could be opened: 'opener' (can opener / blade), 'bash' (pry it open with a tool) or null. */
  canOpener(food) {
    if (!food?.needsOpener) return 'opener';
    if (this.inv.has((x) => hasTag(x, 'can_opener') || hasTag(x, 'blade'))) return 'opener';
    if (this.inv.has((x) => CAN_BASH_TAGS.some((t) => hasTag(x, t)))) return 'bash';
    return null;
  }

  eat(desc, index) {
    const g = this.game, p = this.p;
    const s = desc.slots[index];
    const def = getItemDef(s.id), f = def.food;
    const smoke = def.useLabel === 'Smoke';
    const open = this.canOpener(f);
    if (!open) {
      g.ui?.toast('You need a can opener or a knife — or a tool to pry it open.', 'warn');
      return;
    }
    if (smoke && !this.inv.has((x) => hasTag(x, 'fire_starter'))) { g.ui?.toast('You need a lighter or matches.', 'warn'); return; }
    if (p.hunger > 97 && f.hunger > 0 && !smoke) { g.ui?.toast("You're too full to eat.", 'info'); return; }
    const bash = f.needsOpener && open === 'bash';
    g.startAction({
      stack: s, label: (smoke ? 'Smoking ' : bash ? 'Prying open ' : 'Eating ') + def.name, time: Math.min(f.eatTime || 3, 6) + (bash ? 4 : 0),
      anim: smoke ? 'pills' : 'eat', sound: smoke ? 'lighter' : bash ? 'hit_metal' : 'eat',
      onDone: () => {
        if (desc.slots[index] !== s) return;
        const e = getFoodEffect(s, g.time.totalHours) || {};
        const st = freshnessState(s, g.time.totalHours);
        const spill = bash ? 0.7 : 1;
        if (bash) g.noise?.(p.x, p.y, p.z, 6, 'bash', true);
        if (st === 'rotten') g.ui?.toast('That was rotten... you feel sick.', 'danger');
        else if (st === 'stale') g.ui?.toast('It tasted stale.', 'warn');
        else if (f.raw) g.ui?.toast('Eating that raw was a bad idea.', 'warn');
        else if (bash) g.ui?.toast('You hacked it open and lost some of it.', 'info');
        p.hunger = clamp(p.hunger + (e.hunger || 0) * spill, 0, 100);
        p.thirst = clamp(p.thirst + (e.thirst || 0) * spill, 0, 100);
        p.health = clamp(p.health + (e.health || 0), 0, p.maxHealth);
        p.sickness = clamp(p.sickness + (e.sickness || 0), 0, 100);
        p.panic = clamp(p.panic + (e.panic || 0), 0, 100);
        p.energy = clamp(p.energy + (e.energy || 0), 0, 100);
        if (e.energy > 0) p.caffeine = Math.max(p.caffeine, 3);
        if (smoke) { const fs = this.inv.find((x) => hasTag(x, 'fire_starter'))[0]; if (fs && getItemDef(fs.stack.id).uses) { fs.stack.uses = (fs.stack.uses ?? 1) - 1; if (fs.stack.uses <= 0) this.inv.removeStack(fs.stack); } }
        if (def.uses && (s.uses ?? def.uses) > 1) { s.uses = (s.uses ?? def.uses) - 1; this.inv.changed(); }
        else {
          this.consume(desc, index);
          if (f.leaves) this.giveOrDrop(createItem(f.leaves));
        }
      },
    });
  }

  cook(desc, index) {
    const g = this.game;
    const s = desc.slots[index];
    const def = getItemDef(s.id);
    g.startAction({
      label: 'Cooking ' + def.name, time: 6, anim: 'craft', sound: 'fire_loop',
      onDone: () => {
        if (desc.slots[index] !== s) return;
        if (!g.nearFire()) { g.ui?.toast('You moved away from the fire.', 'warn'); return; }
        this.consume(desc, index);
        this.giveOrDrop(createItem(def.food.cookTo, { age: g.time.totalHours }));
        g.ui?.toast('Cooked ' + getItemDef(def.food.cookTo).name, 'good');
      },
    });
  }

  drink(desc, index) {
    const g = this.game, p = this.p;
    const s = desc.slots[index];
    const def = getItemDef(s.id);
    const e0 = getDrinkEffect(s, g.time.totalHours);
    if (!e0) { g.ui?.toast("It's empty.", 'info'); return; }
    if (!e0.drinkable) { g.ui?.toast("You can't drink that.", 'warn'); return; }
    if (p.thirst > 98 && !e0.alcohol) { g.ui?.toast("You're not thirsty.", 'info'); return; }
    g.startAction({
      stack: s, label: 'Drinking', time: 1.8, anim: 'drink', sound: 'drink',
      onDone: () => {
        if (desc.slots[index] !== s) return;
        const e = getDrinkEffect(s, g.time.totalHours);
        if (!e) return;
        const st = def.liquidContainer ? null : freshnessState(s, g.time.totalHours);
        if (st === 'rotten') g.ui?.toast('It had gone off... your stomach turns.', 'danger');
        else if (st === 'stale') g.ui?.toast('It tasted sour.', 'warn');
        p.thirst = clamp(p.thirst + (e.thirst || 0), 0, 100);
        p.hunger = clamp(p.hunger + (e.hunger || 0), 0, 100);
        if (e.sickness > 0 && Math.random() < (def.liquidContainer ? 0.75 : 1)) p.sickness = clamp(p.sickness + e.sickness, 0, 100);
        p.panic = clamp(p.panic + (e.panic || 0), 0, 100);
        if (e.alcohol) { p.drunk = clamp(p.drunk + e.alcohol, 0, 100); p.panic = Math.max(0, p.panic - e.alcohol * 0.5); }
        if (e.energy) { p.energy = clamp(p.energy + e.energy, 0, 100); p.caffeine = Math.max(p.caffeine, 4); }
        if (def.liquidContainer) {
          s.uses = Math.max(0, (s.uses || 0) - 1);
          if (s.uses <= 0) s.data.liquid = null;
          this.inv.changed();
          return;
        }
        if (def.uses && (s.uses ?? def.uses) > 1) { s.uses = (s.uses ?? def.uses) - 1; this.inv.changed(); }
        else {
          this.consume(desc, index);
          if (def.drink.leaves) this.giveOrDrop(createItem(def.drink.leaves));
        }
      },
    });
  }

  fill(s, src) {
    const g = this.game;
    const def = getItemDef(s.id);
    const cap = def.liquidContainer.capacity;
    if (s.data?.liquid && s.data.liquid !== src.liquid && s.uses > 0) { g.ui?.toast('Empty it first.', 'warn'); return; }
    g.startAction({
      label: 'Filling ' + def.name, time: 2.5, anim: 'drink', sound: 'splash',
      onDone: () => {
        const amt = src.take ? src.take(cap - (s.uses || 0)) : cap - (s.uses || 0);
        if (amt <= 0) { g.ui?.toast('No water left here.', 'warn'); return; }
        s.data = { ...(s.data || {}), liquid: src.liquid };
        s.uses = (s.uses || 0) + amt;
        g.ui?.toast(`Filled your ${def.name} (${s.uses}/${cap})${src.liquid === 'dirty_water' ? ' — purify or boil it before drinking' : ''}.`, src.liquid === 'dirty_water' ? 'warn' : 'good');
        this.inv.changed();
      },
    });
  }

  // ------------------------------------------------------------------ water purification
  findPurifier() { return this.inv.find((x) => getItemDef(x.id).purify && (getItemDef(x.id).uses ? (x.uses ?? 1) > 0 : true))[0] || null; }
  findDirtyWater() { return this.inv.find((x) => getItemDef(x.id).liquidContainer && x.data?.liquid === 'dirty_water' && (x.uses || 0) > 0)[0] || null; }

  /** Purify one dirty water container with a purifier stack (tablets: count, bleach: uses). */
  purify(container, purifier) {
    const g = this.game;
    purifier = purifier || this.findPurifier()?.stack;
    if (!purifier) { g.ui?.toast('You have nothing to purify water with.', 'warn'); return false; }
    const pdef = getItemDef(purifier.id);
    const per = pdef.purify || 4;
    const need = Math.max(1, Math.ceil((container.uses || 0) / per));
    const usesBased = !!pdef.uses;
    let have = 0;
    for (const f of this.inv.find((x) => x.id === purifier.id)) have += usesBased ? (f.stack.uses ?? pdef.uses) : (f.stack.count || 1);
    if (have < need) { g.ui?.toast(`You need ${need} ${usesBased ? 'uses of ' + pdef.name.toLowerCase() : pdef.name.toLowerCase()} for ${container.uses} units.`, 'warn'); return false; }
    let left = need;
    for (const f of this.inv.find((x) => x.id === purifier.id)) {
      if (left <= 0) break;
      const st = f.stack;
      if (usesBased) {
        const t = Math.min(left, st.uses ?? pdef.uses);
        st.uses = (st.uses ?? pdef.uses) - t; left -= t;
        if (st.uses <= 0) f.slots[f.index] = null;
      } else {
        const t = Math.min(left, st.count || 1);
        st.count = (st.count || 1) - t; left -= t;
        if (st.count <= 0) f.slots[f.index] = null;
      }
    }
    container.data.liquid = 'water';
    g.audio?.play?.('pills', { volume: 0.5 });
    g.ui?.toast(`Water purified (${container.uses} units).`, 'good');
    this.inv.changed();
    return true;
  }

  /** Context action on the tablets / bleach themselves: purify the first dirty container that is carried. */
  usePurifier(purifier) {
    const dirty = this.findDirtyWater();
    if (!dirty) { this.game.ui?.toast('You have no dirty water to purify.', 'info'); return; }
    this.purify(dirty.stack, purifier);
  }

  boil(s) {
    const g = this.game;
    g.startAction({
      label: 'Boiling water', time: 8, anim: 'craft', sound: 'fire_loop',
      onDone: () => {
        if (!g.nearFire()) { g.ui?.toast('You moved away from the fire.', 'warn'); return; }
        if (s.data?.liquid !== 'dirty_water') return;
        s.data.liquid = 'water'; g.ui?.toast('The water is safe to drink now.', 'good'); this.inv.changed();
      },
    });
  }

  // ------------------------------------------------------------------ medicine
  /** Wounds matching pred, most urgent first (heaviest bleeding, then worst wound type). */
  pickWound(pred) {
    const list = this.p.wounds.map((w, i) => ({ w, i })).filter(({ w }) => pred(w));
    list.sort((a, b) => woundBleed(b.w) - woundBleed(a.w) || (WOUND_RANK[b.w.type] || 0) - (WOUND_RANK[a.w.type] || 0));
    return list[0];
  }

  useMedical(desc, index) {
    const g = this.game, p = this.p;
    const s = desc.slots[index];
    const def = getItemDef(s.id), m = def.medical;
    if (isKit(def)) {
      if (!p.wounds.length && p.health >= p.maxHealth - 1) { g.ui?.toast('You have nothing to treat.', 'info'); return; }
      return g.startAction({
        stack: s, label: 'Using ' + def.name, time: (m.time || 6) / (1 + p.skillLevel('firstAid') * 0.1), anim: 'bandage', sound: 'bandage',
        onDone: () => {
          for (const w of p.wounds) {
            if (w.type === 'fracture') continue;
            w.bleeding = false; w.bandaged = true; w.bandageDirty = false; w.bandageAge = 0; w.bandageSterile = true;
            w.disinfected = true;
            if (w.infected && Math.random() < 0.65) w.infected = false;
            if (w.type === 'deep' || w.type === 'bullet') w.sutured = true;
            if (w.type === 'burn') w.burnTreated = true;
          }
          if (m.painkiller) { p.painkiller = Math.max(p.painkiller, 2); p.pain = Math.max(0, p.pain - m.painkiller); }
          p.health = clamp(p.health + (m.heal || 20), 0, p.maxHealth);
          this.useOne(desc, index, s);
          p.addXP('firstAid', 8);
          g.ui?.toast('Wounds cleaned and dressed.', 'good');
        },
      });
    }
    if (m.extract) {
      const t = this.pickWound((w) => w.embedded);
      if (!t) { g.ui?.toast('Nothing is lodged in your wounds.', 'info'); return; }
      return this.treat(t.i, 'extract', s, desc, index);
    }
    if (m.burn) {
      const t = this.pickWound((w) => w.type === 'burn' && !w.burnTreated);
      if (!t) { g.ui?.toast('You have no untreated burns.', 'info'); return; }
      return this.treat(t.i, 'burn', s, desc, index);
    }
    if (m.stopBleed) {
      const t = this.pickWound((w) => w.type !== 'fracture' && (!w.bandaged || w.bandageDirty));
      if (!t) { g.ui?.toast('No wounds need bandaging.', 'info'); return; }
      return this.treat(t.i, 'bandage', s, desc, index);
    }
    if (m.disinfect) {
      const t = this.pickWound((w) => !w.disinfected && w.type !== 'fracture');
      if (!t) { g.ui?.toast('No wounds need disinfecting.', 'info'); return; }
      return this.treat(t.i, 'disinfect', s, desc, index);
    }
    if (m.suture) {
      const t = this.pickWound((w) => STITCHABLE.has(w.type) && !w.sutured && w.type !== 'glass') || this.pickWound((w) => STITCHABLE.has(w.type) && !w.sutured);
      if (!t) { g.ui?.toast('No wounds need stitches.', 'info'); return; }
      return this.treat(t.i, 'suture', s, desc, index);
    }
    if (m.splint) {
      const t = this.pickWound((w) => w.type === 'fracture' && !w.splinted);
      if (!t) { g.ui?.toast('You have no fractures.', 'info'); return; }
      return this.treat(t.i, 'splint', s, desc, index);
    }
    // pills / injections
    const inject = def.useLabel === 'Inject';
    g.startAction({
      stack: s, label: (inject ? 'Injecting ' : 'Taking ') + def.name, time: m.time || 1.5, anim: inject ? 'inject' : 'pills', sound: 'pills',
      onDone: () => {
        if (m.painkiller) { p.painkiller = Math.max(p.painkiller, m.duration || 4); p.pain = Math.max(0, p.pain - m.painkiller); }
        if (m.panic) p.panic = clamp(p.panic + m.panic, 0, 100);
        if (m.sickness) p.sickness = clamp(p.sickness + m.sickness, 0, 100);
        if (m.energy) p.energy = clamp(p.energy + m.energy, 0, 100);
        if (m.stamina) p.stamina = clamp(p.stamina + m.stamina, 0, p.maxStamina);
        if (m.antibiotic) {
          for (const w of p.wounds) w.antibiotic = Math.max(w.antibiotic || 0, m.duration || 12);
          p.antibioticSlow = 24;
          g.ui?.toast(p.wounds.some((w) => w.infected) ? 'Antibiotics will fight off the wound infection.' : 'Antibiotics will keep your wounds from getting infected for a while.', 'good');
        }
        if (m.antiviral) {
          if (p.infected) {
            p.infection = Math.max(0, p.infection - m.antiviral);
            if (p.infection <= 15) {
              p.infected = false; p.infection = 0; p.infectionKnown = false;
              g.ui?.toast('The fever breaks. The infection is gone. You got lucky.', 'good');
            } else g.ui?.toast('The fever eases a little... you will need another dose.', 'warn');
          } else g.ui?.toast('You feel nothing. Hopefully it protects you.', 'info');
          p.antiviralProtect = m.duration || 24;
        }
        if (m.heal) p.health = clamp(p.health + m.heal, 0, p.maxHealth);
        if (def.id === 'vitamins') p.energy = clamp(p.energy + 6, 0, 100);
        if (def.id === 'adrenaline') { p.adrenaline = 60; p.stamina = p.maxStamina; p.panic = 0; }
        if (def.id === 'sleeping_pills') g.ui?.toast('You feel drowsy... find a bed.', 'info');
        this.useOne(desc, index, s);
      },
    });
  }

  useOne(desc, index, s) {
    const def = getItemDef(s.id);
    if (def.uses && (s.uses ?? def.uses) > 1) { s.uses = (s.uses ?? def.uses) - 1; this.inv.changed(); return; }
    const i = desc.slots.indexOf(s);
    if (i >= 0) this.consume(desc, i);
    else this.inv.removeStack(s);
  }

  /** Wound treatment options (health panel). */
  getTreatments(wi) {
    const p = this.p, w = p.wounds[wi];
    if (!w) return [];
    const out = [];
    // one representative stack per item id
    const byId = new Map();
    this.inv.forEachStack((s) => { if (getItemDef(s.id).medical && !byId.has(s.id) && (getItemDef(s.id).liquidContainer ? (s.uses || 0) > 0 : true)) byId.set(s.id, s); });
    const meds = [...byId.values()].map((s) => ({ s, def: getItemDef(s.id), m: getItemDef(s.id).medical }));
    const opt = (label, kind, stack) => out.push({ label, run: () => this.treat(wi, kind, stack, null, null), disabled: false });
    const fracture = w.type === 'fracture';
    if (!fracture && (!w.bandaged || w.bandageDirty)) {
      const list = meds.filter((x) => x.m.stopBleed && !isKit(x.def))
        .sort((a, b) => (b.m.sterile ? 1 : 0) - (a.m.sterile ? 1 : 0) || (a.m.dirty ? 1 : 0) - (b.m.dirty ? 1 : 0) || b.m.stopBleed - a.m.stopBleed);
      for (const x of list.slice(0, 2)) opt((w.bandaged ? 'Change Bandage: ' : 'Bandage with ') + x.def.name, 'bandage', x.s); // best two
    }
    if (w.bandaged) out.push({ label: w.bandageDirty ? 'Remove Dirty Bandage' : 'Remove Bandage', run: () => { w.bandaged = false; w.bandageDirty = false; this.game.audio.play('bandage', { volume: 0.5 }); this.game.ui?.refresh(); } });
    if (w.embedded) {
      for (const x of meds.filter((x) => x.m.extract)) opt((w.type === 'bullet' ? 'Remove Bullet' : 'Remove Glass Shard') + ' (' + x.def.name + ')', 'extract', x.s);
    }
    if (w.type === 'burn' && !w.burnTreated) for (const x of meds.filter((x) => x.m.burn)) opt('Treat Burn with ' + x.def.name, 'burn', x.s);
    if (!w.disinfected && !fracture) {
      const list = meds.filter((x) => x.m.disinfect && !isKit(x.def) && !x.m.burn).sort((a, b) => b.m.disinfect - a.m.disinfect);
      for (const x of list.slice(0, 2)) opt('Disinfect with ' + x.def.name, 'disinfect', x.s);
    }
    if (STITCHABLE.has(w.type) && !w.sutured) for (const x of meds.filter((x) => x.m.suture)) opt('Stitch with ' + x.def.name, 'suture', x.s);
    if (fracture && !w.splinted) for (const x of meds.filter((x) => x.m.splint)) opt('Apply ' + x.def.name, 'splint', x.s);
    if (!fracture) {
      for (const x of meds.filter((x) => isKit(x.def))) {
        const r = this.inv.find((s) => s === x.s)[0];
        if (r) out.push({ label: 'Treat All with ' + x.def.name, run: () => this.useMedical({ slots: r.slots, onChange: () => this.inv.changed() }, r.index) });
      }
    }
    if (w.infected) {
      const f = this.inv.find((s) => getItemDef(s.id).medical?.antibiotic)[0];
      if (f) out.push({ label: 'Take ' + getItemDef(f.stack.id).name, run: () => { const r = this.inv.find((s) => getItemDef(s.id).medical?.antibiotic)[0]; if (r) this.useMedical({ slots: r.slots, onChange: () => this.inv.changed() }, r.index); } });
    }
    if (!out.length) out.push({ label: fracture ? 'Need a splint (craft: 2 sticks + 2 rags)' : 'No treatment available (rip clothing for rags)', run: () => {}, disabled: true });
    return out;
  }

  treat(wi, kind, stack, desc, index) {
    const g = this.game, p = this.p;
    const w = p.wounds[wi];
    if (!w || !stack) return;
    const def = getItemDef(stack.id);
    const m = def.medical || {};
    const fa = p.skillLevel('firstAid');
    const time = { bandage: 2.6, disinfect: 2, suture: 6, splint: 5, extract: 4, burn: 3 }[kind] / (1 + fa * 0.12);
    const verb = { bandage: w.bandaged ? 'Changing bandage on' : 'Bandaging', disinfect: 'Disinfecting', suture: 'Stitching', splint: 'Splinting', extract: w.type === 'bullet' ? 'Digging the bullet out of' : 'Pulling glass out of', burn: 'Treating the burn on' }[kind];
    g.startAction({
      label: verb + ' ' + PART_LABELS[w.part].toLowerCase(),
      time, anim: 'bandage', sound: kind === 'disinfect' ? 'pills' : 'bandage',
      onDone: () => {
        if (!p.wounds.includes(w)) return;
        if (!this.inv.find((s) => s === stack).length && !(desc && desc.slots[index] === stack)) { g.ui?.toast('You no longer have the ' + def.name + '.', 'warn'); return; }
        if (kind === 'bandage') {
          w.bandaged = true; w.bleeding = false; w.bandageAge = 0;
          w.bandageDirty = !!m.dirty;
          w.bandageSterile = !!m.sterile;
          if (m.sterile) w.disinfected = true;
          if (m.dirty && !w.disinfected && Math.random() < 0.4) w.infected = true;
        } else if (kind === 'disinfect') {
          w.disinfected = true;
          if (w.infected && Math.random() < 0.65 * Math.min(1, (m.disinfect || 1) + 0.2)) w.infected = false;
          p.pain = Math.min(100, p.pain + 10);
        } else if (kind === 'suture') { w.sutured = true; w.bleeding = false; w.heal = Math.max(w.heal, 0.2); }
        else if (kind === 'splint') { w.splinted = true; }
        else if (kind === 'extract') {
          w.embedded = false;
          p.pain = Math.min(100, p.pain + 15);
          if (!w.bandaged) w.bleeding = true;
          g.ui?.toast(w.type === 'bullet' ? 'You dug the bullet out. Now bandage it.' : 'You pulled the shard out. Bandage it.', 'good');
        } else if (kind === 'burn') { w.burnTreated = true; w.disinfected = true; p.pain = Math.max(0, p.pain - 15); }
        p.addXP('firstAid', kind === 'suture' || kind === 'extract' ? 8 : 4);
        // consume / wear
        if (kind === 'extract' && def.durability) {
          stack.dur = (stack.dur ?? def.durability) - 10;
          if (stack.dur <= 0) { this.inv.removeStack(stack); g.ui?.toast('Your ' + def.name + ' broke.', 'warn'); }
          this.inv.changed();
        } else if (def.uses && (stack.uses ?? def.uses) > 1) { stack.uses = (stack.uses ?? def.uses) - 1; this.inv.changed(); }
        else if (desc && desc.slots[index] === stack) this.consume(desc, index);
        else { stack.count = (stack.count || 1) - 1; if (stack.count <= 0) this.inv.removeStack(stack); this.inv.changed(); }
        g.ui?.refresh();
      },
    });
  }

  // ------------------------------------------------------------------ equipment
  equip(desc, index) {
    const g = this.game;
    const s = desc.slots[index];
    if (!s) return;
    const def = getItemDef(s.id);
    if (!def.clothing) return;
    const ei = EQUIP_SLOTS.indexOf(def.clothing.slot);
    let item = s;
    if ((s.count || 1) > 1) { item = { ...JSON.parse(JSON.stringify(s)), count: 1 }; s.count--; } else desc.slots[index] = null;
    const old = this.inv.equipment[ei];
    this.inv.equipment[ei] = item;
    desc.onChange?.();
    if (old) {
      // what was in the old pockets / bag moves into what you now wear (whatever fits)
      const moved = this.inv.spillContents(old);
      // the old piece goes where the new one was, else anywhere in the inventory, else on the ground
      const fits = !desc.slots[index] && (!desc.accepts || desc.accepts(old, index)) && !(desc.owner && (desc.owner === old));
      const hb = this.inv.hotbar.indexOf(null);
      if (fits && desc.kind !== 'equipment') { desc.slots[index] = old; desc.onChange?.(); }
      else if (getItemDef(old.id).clothing?.slot === 'back') {
        // an old bag goes into your hands (or on the ground), never inside the new bag
        if (hb >= 0) { this.inv.hotbar[hb] = old; this.inv.changed(); } else { this.game.groundItems.dropAt(old, this.p.x, this.p.y, this.p.z); g.ui?.toast(`Dropped your ${getItemDef(old.id).name} at your feet.`, 'info'); }
      } else this.giveOrDrop(old, true);
      const still = old.contents?.some(Boolean);
      if (moved || still) g.ui?.toast(`Swapped ${getItemDef(old.id).name} for ${def.name}${moved ? ` — moved ${moved} item${moved > 1 ? 's' : ''} over` : ''}${still ? '; some things are still in the old one' : ''}.`, 'info');
    }
    g.audio.play('zipper', { volume: 0.6 });
    g.afterInventoryChange();
  }

  unequip(ei) {
    const g = this.game;
    const s = this.inv.equipment[ei];
    if (!s) return;
    this.inv.equipment[ei] = null;
    // pockets empty into the rest of your clothes; a backpack keeps its contents (take it off to drop or stash it)
    const moved = EQUIP_SLOTS[ei] !== 'back' ? this.inv.spillContents(s) : 0;
    const left = this.inv.addItem(s);
    if (left) { g.groundItems.dropAt(left, this.p.x, this.p.y, this.p.z); g.ui?.toast('Dropped ' + getItemDef(s.id).name + ' (no room).', 'info'); }
    else if (moved) g.ui?.toast(`Moved ${moved} item${moved > 1 ? 's' : ''} out of the ${getItemDef(s.id).name}.`, 'info');
    g.audio.play('zipper', { volume: 0.6 });
    g.afterInventoryChange();
  }

  toHotbar(desc, index) {
    const inv = this.inv;
    const hb = inv.hotbarDesc();
    let target = inv.hotbar[inv.selected] ? inv.hotbar.indexOf(null) : inv.selected;
    if (target < 0) target = inv.selected;
    if (moveStack(desc, index, hb, target)) {
      inv.selected = target;
      desc.onChange?.();
      this.game.afterInventoryChange();
    } else this.game.ui?.toast('No room in your hands — free a hotbar slot.', 'warn');
  }

  rip(desc, index) {
    const g = this.game;
    const s = desc.slots[index];
    const def = getItemDef(s.id);
    g.startAction({
      label: 'Ripping ' + def.name, time: this.inv.has((x) => hasTag(x, 'blade')) ? 2 : 4, anim: 'craft', sound: 'bandage',
      onDone: () => {
        if (desc.slots[index] !== s) return;
        desc.slots[index] = null;
        desc.onChange?.();
        if (s.contents) for (const c of s.contents) if (c) this.giveOrDrop(c);
        const n = clamp(Math.round((def.weight || 0.5) * 4), 1, 5);
        this.giveOrDrop(createItem(s.dur !== undefined && s.dur < (def.durability || 100) * 0.4 ? 'rag_dirty' : 'rag', { count: n }));
        g.ui?.toast(`Got ${n} rag${n > 1 ? 's' : ''}.`, 'good');
        g.afterInventoryChange();
      },
    });
  }

  unload(s) {
    const def = getItemDef(s.id);
    const type = s.ammoType || def.firearm.ammo[0];
    this.giveOrDrop(createItem(type, { count: s.ammo }));
    s.ammo = 0;
    this.game.audio.play('reload_mag_out', { volume: 0.6 });
    this.inv.changed();
  }

  attachSuppressor(gun, sup) {
    const sdef = getItemDef(sup.id);
    gun.data = { ...(gun.data || {}), suppressor: sup.id, suppressorUses: sup.uses ?? sdef.attachment.uses ?? (sup.id === 'suppressor_bottle' ? 8 : 400) };
    sup.count = (sup.count || 1) - 1;
    if (sup.count <= 0) this.inv.removeStack(sup);
    this.game.audio.play('cock', { volume: 0.5 });
    this.inv.changed();
  }
  detachSuppressor(gun) {
    const id = gun.data.suppressor;
    const it = createItem(id);
    if (gun.data.suppressorUses !== undefined) it.uses = gun.data.suppressorUses;
    delete gun.data.suppressor; delete gun.data.suppressorUses;
    this.giveOrDrop(it);
    this.inv.changed();
  }

  read(desc, index) {
    const g = this.game, p = this.p;
    const s = desc.slots[index];
    const def = getItemDef(s.id);
    if (s.data?.noteId) {
      const note = NOTES[s.data.noteId] || { title: def.name, text: 'The writing is smudged beyond reading.' };
      g.ui?.showNote(note);
      if (!g.readNotes.has(s.data.noteId)) { g.readNotes.add(s.data.noteId); g.onNoteRead?.(s.data.noteId); }
      return;
    }
    if ((def.tags || []).includes('map')) {
      g.mapRevealed = true;
      g.ui?.toast('You study the map. The whole county is now marked on your map (M).', 'good');
      return;
    }
    const b = def.book;
    if (!b) return;
    g.startAction({
      stack: s, label: 'Reading ' + def.name, time: clamp((b.hours || 2) * 4, 5, 14), anim: 'read', sound: 'ui_click',
      onDone: () => {
        if (b.skill) {
          g.survival.bookBoost[b.skill] = 24;
          const first = !s.data?.read;
          s.data = { ...(s.data || {}), read: true };
          if (first) p.addXP(b.skill, b.xp || 20);
          g.ui?.toast(`${SKILLS[b.skill]?.name || b.skill} XP gain x${b.mult || 2} for 24 hours.`, 'good');
          this.inv.changed();
        } else {
          p.panic = clamp(p.panic - Math.abs(b.panic ?? 10), 0, 100);
          g.ui?.toast('You feel a little calmer.', 'good');
        }
      },
    });
  }

  place(desc, index) {
    const g = this.game, p = this.p, w = g.world;
    const s = desc.slots[index];
    const def = getItemDef(s.id);
    const fx = Math.floor(p.x - Math.sin(p.yaw) * 1.4), fz = Math.floor(p.z - Math.cos(p.yaw) * 1.4);
    let y = Math.floor(p.y + 0.5);
    for (let k = 0; k < 3 && w.get(fx, y, fz) !== 0; k++) y++;
    while (y > 1 && w.get(fx, y - 1, fz) === 0) y--;
    if (w.get(fx, y, fz) !== 0) { g.ui?.toast('No room to place that here.', 'warn'); return; }
    const block = def.place === 'campfire' ? 'campfire_out' : def.place;
    w.setBlock(fx, y, fz, blockId(block));
    this.consume(desc, index);
    g.ui?.toast(def.place === 'campfire' ? 'Campfire placed. Light it with a lighter or matches (E).' : 'Placed.', 'good');
    g.afterInventoryChange();
  }

  split(desc, index) {
    const s = desc.slots[index];
    const j = desc.slots.indexOf(null);
    if (j < 0) { this.game.ui?.toast('No free slot to split into.', 'warn'); return; }
    moveStack(desc, index, desc, j, Math.floor(s.count / 2));
    desc.onChange?.();
  }

  giveOrDrop(stack, quiet = false) {
    const left = this.inv.addItem(stack);
    if (left) {
      this.game.groundItems.dropAt(left, this.p.x, this.p.y, this.p.z);
      if (!quiet) this.game.ui?.toast(`No room — ${getItemDef(left.id).name} dropped at your feet.`, 'info');
    }
    this.game.afterInventoryChange();
  }

  // ------------------------------------------------------------------ tooltip
  describeItem(stack) {
    const g = this.game;
    const def = getItemDef(stack.id);
    const now = g.time?.totalHours;
    const L = [];
    if (def.desc) L.push(def.desc);
    L.push(`Weight: ${itemWeight(stack).toFixed(2)} kg`);
    let condition = null;
    if (def.durability) {
      condition = clamp((stack.dur ?? def.durability) / def.durability, 0, 1);
      L.push(`Condition: ${conditionLabel(condition)} (${Math.round(condition * 100)}%)`);
    }
    if (def.melee) {
      const m = def.melee;
      L.push(`Damage: ${m.damage}  ·  Speed: ${m.speed?.toFixed?.(1) ?? m.speed}/s  ·  Reach: ${m.range}m`);
      if (m.twoHanded) L.push('Two-handed');
    }
    if (def.firearm) {
      const f = def.firearm;
      L.push(`Caliber: ${f.ammo.map((a) => CALIBER[a] || a).join(' / ')}`);
      L.push(`Damage: ${f.damage}${f.pellets > 1 ? ' x' + f.pellets : ''}  ·  Capacity: ${f.magSize}  ·  Noise: ${f.noise}m`);
      L.push(`Loaded: ${stack.ammo || 0}${stack.ammoType ? ' (' + (CALIBER[stack.ammoType] || stack.ammoType) + ')' : ''}  ·  Modes: ${(f.modes || ['semi']).join('/')}`);
      if (stack.data?.suppressor) L.push('Suppressed');
      if (stack.jammed) L.push('JAMMED');
    }
    if (def.food) {
      const f = def.food;
      if (def.useLabel === 'Smoke') L.push('Calms the nerves  ·  needs a lighter or matches');
      else L.push(`Hunger +${f.hunger || 0}${f.thirst ? `  ·  Thirst ${f.thirst > 0 ? '+' : ''}${f.thirst}` : ''}${def.uses ? `  ·  ${stack.uses ?? def.uses}/${def.uses} portions` : ''}`);
      if (f.spoils) {
        const fr = itemFreshness(stack, now);
        L.push(fr <= 0 ? 'ROTTEN — will make you sick' : fr < 0.35 ? 'Stale' : `Fresh (~${Math.max(1, Math.round(((fr - 0.35) * f.spoils) / 24))} days)`);
      }
      if (f.needsOpener) L.push('Needs a can opener or knife');
      if (f.raw) L.push('Raw - cook it first');
    }
    if (def.liquidContainer) {
      const liq = stack.data?.liquid;
      L.push(liq && stack.uses ? `${liq === 'dirty_water' ? 'Unsafe water' : liq === 'gasoline' ? 'Gasoline' : 'Water'}: ${stack.uses || 0}/${def.liquidContainer.capacity}` : `Empty (holds ${def.liquidContainer.capacity})`);
      if (liq === 'dirty_water') L.push('Purify or boil before drinking');
    } else if (def.drink) {
      L.push(`Thirst +${def.drink.thirst || 0}${def.uses ? `  ·  ${stack.uses ?? def.uses} sips left` : ''}`);
      if (def.drink.spoils) { const fr = itemFreshness(stack, now); L.push(fr <= 0 ? 'SPOILED' : fr < 0.35 ? 'Going sour' : 'Fresh'); }
    }
    if (def.medical) {
      const m = def.medical, u = [];
      if (isKit(def)) u.push('Treats every wound at once');
      else {
        if (m.stopBleed) u.push(m.dirty ? 'Stops bleeding (risk of infection)' : 'Stops bleeding');
        if (m.sterile) u.push('sterile');
        if (m.disinfect && !m.burn) u.push('Disinfects wounds');
        if (m.suture) u.push('Stitches deep wounds');
        if (m.splint) u.push('Splints fractures');
        if (m.extract) u.push('Removes glass & bullets');
        if (m.burn) u.push('Treats burns');
        if (m.painkiller && !m.stopBleed) u.push('Relieves pain');
        if (m.antibiotic) u.push('Cures wound infection');
        if (m.antiviral) u.push('Fights the zombie infection');
        if (m.panic < 0) u.push('Calms');
        if (m.sickness < 0) u.push('Settles the stomach');
      }
      if (u.length) L.push(u.join('  ·  '));
    }
    if (def.purify) L.push(`Purifies ${def.purify} units of dirty water${def.uses ? ' per use' : ' each'}`);
    if (def.clothing) {
      const c = def.clothing;
      L.push(`Slot: ${EQUIP_LABELS[c.slot]}`);
      const parts = [];
      if (c.insulation) parts.push(`Warmth ${Math.round(c.insulation * 100)}`);
      if (c.water) parts.push(`Waterproof ${Math.round(c.water * 100)}`);
      if (c.bite || c.scratch) parts.push(`Bite ${Math.round((c.bite || 0) * 100)} / Scratch ${Math.round((c.scratch || 0) * 100)}`);
      if (parts.length) L.push(parts.join('  ·  '));
    }
    if (def.capacity) L.push(`Storage: ${def.capacity} slots${def.weightReduction ? `  ·  -${Math.round(def.weightReduction * 100)}% weight` : ''}${def.clothing?.slot !== 'back' ? '  ·  small items only' : ''}`);
    if (stack.contents?.some(Boolean)) L.push(`Contains: ${stack.contents.filter(Boolean).length} item${stack.contents.filter(Boolean).length > 1 ? 's' : ''} (wear it to get at them)`);
    const radio = (def.tags || []).includes('radio');
    if (def.light) L.push(def.light.fire ? `Burns: ${Math.round(stack.uses ?? 100)}%` : `Battery: ${Math.round(stack.uses ?? 100)}%`);
    else if (radio || (def.tags || []).includes('battery')) L.push(`${radio ? 'Battery' : 'Charge'}: ${Math.round(stack.uses ?? 100)}%`);
    if (def.uses && !def.liquidContainer && !def.drink && !def.light && !def.food && !radio && !(def.tags || []).includes('battery')) L.push(`Uses left: ${stack.uses ?? def.uses}`);
    const blade = (def.tags || []).includes('blade');
    const tags = (def.tags || []).filter((t) => TOOL_TAG_LINES[t] && !(blade && t === 'can_opener')).map((t) => TOOL_TAG_LINES[t]);
    if (blade && !def.food) tags.unshift('Opens cans, cuts rags');
    if (tags.length && !def.food) L.push(tags.slice(0, 3).join('  ·  '));
    if (def.book?.skill) L.push(`Boosts ${SKILLS[def.book.skill]?.name || def.book.skill} XP${stack.data?.read ? ' (already read)' : ''}`);
    let name = def.name;
    try { name = itemDisplayName(stack, now); } catch { /* keep def name */ }
    return { name: name + ((stack.count || 1) > 1 ? ` (${stack.count})` : ''), lines: L, rarity: def.rarity || 'common', condition };
  }
}

function conditionLabel(c) {
  return c > 0.85 ? 'Pristine' : c > 0.6 ? 'Worn' : c > 0.35 ? 'Damaged' : c > 0.12 ? 'Badly Damaged' : 'Ruined';
}
export { WOUND_INFO };
