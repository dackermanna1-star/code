// Item context menus, using items (eat/drink/medicine/read/equip), tooltips, wound treatments.
import { getItemDef, createItem, itemWeight, itemFreshness } from '../items/items.js';
import { EQUIP_SLOTS, EQUIP_LABELS, moveStack } from '../inventory/Inventory.js';
import { PART_LABELS, WOUND_INFO } from '../player/Survival.js';
import { SKILLS } from '../player/professions.js';
import { NOTES } from '../world/gen/lore.js';
import { clamp } from './rng.js';

const hasTag = (s, t) => (getItemDef(s.id).tags || []).includes(t);
const CALIBER = {
  ammo_9mm: '9mm', ammo_45: '.45 ACP', ammo_357: '.357 Magnum', ammo_12g: '12ga Buckshot', ammo_12g_slug: '12ga Slug',
  ammo_556: '5.56mm', ammo_762: '7.62x39mm', ammo_308: '.308 Win', ammo_22: '.22 LR', crossbow_bolt: 'Bolts', arrow: 'Arrows',
};

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
    if (def.food) add(def.food.needsOpener ? 'Open & Eat' : 'Eat', () => this.eat(desc, index));
    if (def.food?.cookTo && g.nearFire()) add('Cook', () => this.cook(desc, index));
    if (def.drink && !def.liquidContainer) add('Drink', () => this.drink(desc, index));
    if (def.liquidContainer) {
      const liq = s.data?.liquid;
      if (liq && (s.uses || 0) > 0 && liq !== 'gasoline') add(liq === 'dirty_water' ? 'Drink (Unsafe Water)' : 'Drink', () => this.drink(desc, index));
      if (liq === 'dirty_water' && this.inv.has('purification_tablets')) add('Purify Water', () => this.purify(s));
      if (liq === 'dirty_water' && g.nearFire() && this.inv.has((x) => hasTag(x, 'cooking_pot'))) add('Boil Water', () => this.boil(s));
      const src = g.interact?.nearbyWaterSource();
      if (src && (s.uses || 0) < def.liquidContainer.capacity) add(`Fill (${src.label})`, () => this.fill(s, src));
      if (liq && (s.uses || 0) > 0) add('Pour Out', () => { s.uses = 0; s.data.liquid = null; g.audio.play('splash', { volume: 0.4 }); this.inv.changed(); });
    }
    if (def.medical) add(this.medicalLabel(def), () => this.useMedical(desc, index));
    if (def.clothing) {
      const eqIdx = EQUIP_SLOTS.indexOf(def.clothing.slot);
      if (desc.kind === 'equipment') add('Unequip', () => this.unequip(index));
      else add('Wear (' + EQUIP_LABELS[def.clothing.slot] + ')', () => this.equip(desc, index));
      if ((def.tags || []).includes('fabric')) add('Rip into Rags', () => this.rip(desc, index));
      void eqIdx;
    }
    if ((def.melee || def.firearm || def.throwable || def.category === 'tool' || def.light) && desc.kind !== 'hotbar') add('Equip in Hand', () => this.toHotbar(desc, index));
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
      if ((s.uses ?? 100) < 100 && this.inv.has('batteries')) add('Replace Batteries', () => { this.inv.remove('batteries', 1); s.uses = 100; g.audio.play('flashlight_click'); });
    }
    if (def.book || s.id === 'note' || (def.tags || []).includes('map') || s.data?.noteId) add('Read', () => this.read(desc, index));
    if (def.id === 'gas_can' && s.uses > 0 && g.interact?.lookingAtCampfire()) add('Use as Fuel', () => {});
    if ((s.count || 1) > 1) add('Split Stack', () => this.split(desc, index));
    if (!inWorld) {
      add('Drop', () => g.dropItem(desc, index, 1));
      if ((s.count || 1) > 1) add('Drop All', () => g.dropItem(desc, index));
    }
    return A;
  }

  medicalLabel(def) {
    const m = def.medical;
    if (m.stopBleed) return 'Apply Bandage';
    if (m.splint) return 'Apply Splint';
    if (m.suture) return 'Stitch Wound';
    if (m.disinfect) return 'Disinfect Wound';
    if (def.id === 'first_aid_kit') return 'Use First Aid Kit';
    if (def.id === 'purification_tablets') return 'Purify Water';
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
    if (def.drink || (def.liquidContainer && s.uses > 0)) return this.drink(desc, index);
    if (def.medical) return this.useMedical(desc, index);
    if (def.clothing) return this.equip(desc, index);
    if (def.book || s.data?.noteId || (def.tags || []).includes('map')) return this.read(desc, index);
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
  eat(desc, index) {
    const g = this.game, p = this.p;
    const s = desc.slots[index];
    const def = getItemDef(s.id), f = def.food;
    if (f.needsOpener && !this.inv.has((x) => hasTag(x, 'can_opener') || hasTag(x, 'blade'))) {
      g.ui?.toast('You need a can opener or a knife to open this.', 'warn');
      return;
    }
    if (p.hunger > 97 && !f.thirst) { g.ui?.toast("You're too full to eat.", 'info'); return; }
    g.startAction({
      label: 'Eating ' + def.name, time: f.eatTime || 2.5, anim: 'eat', sound: 'eat',
      onDone: () => {
        if (desc.slots[index] !== s) return;
        const fresh = itemFreshness(s, g.time.totalHours);
        let sick = f.sickness || 0;
        if (f.raw) sick += 22;
        if (fresh <= 0) { sick += 40; g.ui?.toast('That was rotten... you feel sick.', 'danger'); }
        else if (fresh < 0.3) { sick += 10; g.ui?.toast('It tasted stale.', 'warn'); }
        p.hunger = clamp(p.hunger + (f.hunger || 0) * (fresh <= 0 ? 0.5 : 1), 0, 100);
        p.thirst = clamp(p.thirst + (f.thirst || 0), 0, 100);
        p.health = clamp(p.health + (f.health || 0), 0, p.maxHealth);
        p.sickness = clamp(p.sickness + sick, 0, 100);
        p.panic = clamp(p.panic - (f.panic || 0), 0, 100);
        p.energy = clamp(p.energy + (f.energy || 0), 0, 100);
        if (f.energy > 0) p.caffeine = Math.max(p.caffeine, 3);
        this.consume(desc, index);
        if (f.leaves) this.giveOrDrop(createItem(f.leaves));
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
    if (p.thirst > 98) { g.ui?.toast("You're not thirsty.", 'info'); return; }
    g.startAction({
      label: 'Drinking', time: 1.8, anim: 'drink', sound: 'drink',
      onDone: () => {
        if (desc.slots[index] !== s) return;
        if (def.liquidContainer) {
          if (!(s.uses > 0)) return;
          const dirty = s.data?.liquid === 'dirty_water';
          p.thirst = clamp(p.thirst + (def.drink?.thirst || 18), 0, 100);
          if (dirty && Math.random() < 0.7) p.sickness = clamp(p.sickness + 22, 0, 100);
          s.uses--;
          if (s.uses <= 0) { s.uses = 0; s.data.liquid = null; }
          this.inv.changed();
          return;
        }
        const d = def.drink;
        p.thirst = clamp(p.thirst + (d.thirst || 0), 0, 100);
        p.hunger = clamp(p.hunger + (def.food?.hunger || d.hunger || 0), 0, 100);
        p.sickness = clamp(p.sickness + (d.sickness || 0), 0, 100);
        if (d.alcohol) { p.drunk = clamp(p.drunk + d.alcohol, 0, 100); p.panic = Math.max(0, p.panic - d.alcohol); }
        if (d.energy) { p.energy = clamp(p.energy + d.energy, 0, 100); p.caffeine = Math.max(p.caffeine, 4); }
        if (def.uses && s.uses > 1) { s.uses--; this.inv.changed(); }
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
        this.inv.changed();
      },
    });
  }

  purify(s) {
    this.inv.remove('purification_tablets', 1);
    s.data.liquid = 'water';
    this.game.ui?.toast('Water purified.', 'good');
    this.inv.changed();
  }
  boil(s) {
    this.game.startAction({ label: 'Boiling water', time: 8, anim: 'craft', onDone: () => { s.data.liquid = 'water'; this.game.ui?.toast('The water is safe to drink now.', 'good'); this.inv.changed(); } });
  }

  // ------------------------------------------------------------------ medicine
  useMedical(desc, index) {
    const g = this.game, p = this.p;
    const s = desc.slots[index];
    const def = getItemDef(s.id), m = def.medical;
    const wounds = p.wounds;
    const pickWound = (pred) => {
      const list = wounds.map((w, i) => ({ w, i })).filter(({ w }) => pred(w));
      list.sort((a, b) => (b.w.bleeding ? 2 : 0) - (a.w.bleeding ? 2 : 0));
      return list[0];
    };
    if (def.id === 'first_aid_kit') {
      return g.startAction({
        label: 'Using first aid kit', time: 6 / (1 + p.skillLevel('firstAid') * 0.1), anim: 'bandage', sound: 'bandage',
        onDone: () => {
          for (const w of wounds) { w.bleeding = false; w.bandaged = true; w.bandageDirty = false; w.bandageAge = 0; w.disinfected = true; if (w.type === 'deep') w.sutured = true; }
          p.health = clamp(p.health + 25, 0, p.maxHealth);
          this.useOne(desc, index, s);
          p.addXP('firstAid', 8);
        },
      });
    }
    if (m.stopBleed) {
      const t = pickWound((w) => !w.bandaged && w.type !== 'fracture');
      if (!t) { g.ui?.toast('No wounds need bandaging.', 'info'); return; }
      return this.treat(t.i, 'bandage', s, desc, index);
    }
    if (m.disinfect) {
      const t = pickWound((w) => !w.disinfected && w.type !== 'fracture');
      if (!t) { g.ui?.toast('No wounds need disinfecting.', 'info'); return; }
      return this.treat(t.i, 'disinfect', s, desc, index);
    }
    if (m.suture) {
      const t = pickWound((w) => (w.type === 'deep' || w.type === 'laceration' || w.type === 'bullet') && !w.sutured);
      if (!t) { g.ui?.toast('No wounds need stitches.', 'info'); return; }
      return this.treat(t.i, 'suture', s, desc, index);
    }
    if (m.splint) {
      const t = pickWound((w) => w.type === 'fracture' && !w.splinted);
      if (!t) { g.ui?.toast('You have no fractures.', 'info'); return; }
      return this.treat(t.i, 'splint', s, desc, index);
    }
    if (def.id === 'purification_tablets') {
      const dirty = this.inv.find((x) => x.data?.liquid === 'dirty_water')[0];
      if (!dirty) { g.ui?.toast('You have no dirty water to purify.', 'info'); return; }
      this.purify(dirty.stack);
      this.useOne(desc, index, s, true);
      return;
    }
    // pills / injections
    g.startAction({
      label: 'Taking ' + def.name, time: m.time || 1.5, anim: def.id.includes('morphine') || def.id.includes('adrenaline') ? 'inject' : 'pills', sound: 'pills',
      onDone: () => {
        if (m.painkiller) { p.painkiller = Math.max(p.painkiller, def.id.includes('morphine') ? 12 : 6); if (def.id.includes('morphine')) p.pain = 0; }
        if (m.antibiotic) { for (const w of wounds) w.antibiotic = 18; p.antibioticSlow = 24; g.ui?.toast('Antibiotics will fight off wound infections.', 'good'); }
        if (m.antiviral) {
          if (p.infected) {
            p.infected = false; p.infection = 0; p.infectionKnown = false;
            g.ui?.toast('The fever breaks. The infection is receding...', 'good');
          } else g.ui?.toast('You feel nothing. Hopefully it protects you.', 'info');
          p.antiviralProtect = 24;
        }
        if (m.heal) p.health = clamp(p.health + m.heal, 0, p.maxHealth);
        if (def.id === 'vitamins') { p.energy = clamp(p.energy + 8, 0, 100); p.sickness = Math.max(0, p.sickness - 10); }
        if (def.id === 'adrenaline') { p.adrenaline = 60; p.stamina = p.maxStamina; p.panic = 0; }
        if (def.id === 'sleeping_pills') { p.energy = Math.max(0, p.energy - 25); g.ui?.toast('You feel drowsy...', 'info'); }
        this.useOne(desc, index, s);
      },
    });
  }

  useOne(desc, index, s, instant = false) {
    const def = getItemDef(s.id);
    if (def.uses && (s.uses ?? def.uses) > 1) { s.uses = (s.uses ?? def.uses) - 1; this.inv.changed(); return; }
    const i = desc.slots.indexOf(s);
    if (i >= 0) this.consume(desc, i);
    else this.inv.removeStack(s);
    void instant;
  }

  /** Wound treatment options (health panel). */
  getTreatments(wi) {
    const p = this.p, w = p.wounds[wi];
    if (!w) return [];
    const out = [];
    const find = (pred) => this.inv.find(pred)[0];
    const opt = (label, kind, f) => out.push({ label, run: () => this.treat(wi, kind, f.stack, null, null), disabled: false });
    if (!w.bandaged && w.type !== 'fracture') {
      for (const id of ['sterile_bandage', 'bandage', 'rag', 'rag_dirty']) {
        const f = find((s) => s.id === id);
        if (f) opt('Bandage with ' + getItemDef(id).name, 'bandage', f);
      }
    }
    if (w.bandaged) out.push({ label: w.bandageDirty ? 'Remove Dirty Bandage' : 'Remove Bandage', run: () => { w.bandaged = false; w.bandageDirty = false; this.game.audio.play('bandage', { volume: 0.5 }); this.game.ui?.refresh(); } });
    if (!w.disinfected && w.type !== 'fracture') {
      for (const id of ['disinfectant', 'alcohol_wipes', 'whiskey']) {
        const f = find((s) => s.id === id);
        if (f) opt('Disinfect with ' + getItemDef(id).name, 'disinfect', f);
      }
    }
    if ((w.type === 'deep' || w.type === 'laceration' || w.type === 'bullet') && !w.sutured) {
      const f = find((s) => s.id === 'suture_kit');
      if (f) opt('Stitch with Suture Kit', 'suture', f);
    }
    if (w.type === 'fracture' && !w.splinted) {
      const f = find((s) => s.id === 'splint');
      if (f) opt('Apply Splint', 'splint', f);
    }
    if (w.infected) {
      const f = find((s) => s.id === 'antibiotics');
      if (f) out.push({ label: 'Take Antibiotics', run: () => { const r = this.inv.find((s) => s.id === 'antibiotics')[0]; if (r) this.useMedical({ slots: r.slots, onChange: () => this.inv.changed() }, r.index); } });
    }
    if (!out.length) out.push({ label: 'No treatment available', run: () => {}, disabled: true });
    return out;
  }

  treat(wi, kind, stack, desc, index) {
    const g = this.game, p = this.p;
    const w = p.wounds[wi];
    if (!w) return;
    const def = getItemDef(stack.id);
    const fa = p.skillLevel('firstAid');
    const time = { bandage: 2.6, disinfect: 2, suture: 6, splint: 5 }[kind] / (1 + fa * 0.12);
    g.startAction({
      label: { bandage: 'Bandaging', disinfect: 'Disinfecting', suture: 'Stitching', splint: 'Splinting' }[kind] + ' ' + PART_LABELS[w.part].toLowerCase(),
      time, anim: 'bandage', sound: kind === 'disinfect' ? 'pills' : 'bandage',
      onDone: () => {
        if (!p.wounds.includes(w)) return;
        if (kind === 'bandage') {
          w.bandaged = true; w.bleeding = false; w.bandageAge = 0;
          w.bandageDirty = stack.id === 'rag_dirty';
          if (stack.id === 'sterile_bandage') w.disinfected = true;
          if (stack.id === 'rag_dirty' && !w.disinfected && Math.random() < 0.4) w.infected = true;
        } else if (kind === 'disinfect') {
          w.disinfected = true;
          if (w.infected && Math.random() < 0.65) w.infected = false;
          p.pain = Math.min(100, p.pain + 10);
        } else if (kind === 'suture') { w.sutured = true; w.bleeding = false; w.heal = Math.max(w.heal, 0.2); }
        else if (kind === 'splint') { w.splinted = true; }
        p.addXP('firstAid', kind === 'suture' ? 8 : 4);
        // consume
        const sdef = getItemDef(stack.id);
        if (sdef.uses && (stack.uses ?? sdef.uses) > 1 && !sdef.liquidContainer) { stack.uses = (stack.uses ?? sdef.uses) - 1; this.inv.changed(); }
        else if (stack.id === 'whiskey' && (stack.uses ?? 1) > 1) { stack.uses--; this.inv.changed(); }
        else if (desc && desc.slots[index] === stack) this.consume(desc, index);
        else { stack.count = (stack.count || 1) - 1; if (stack.count <= 0) this.inv.removeStack(stack); this.inv.changed(); }
        g.ui?.refresh();
      },
    });
    void def;
  }

  // ------------------------------------------------------------------ equipment
  equip(desc, index) {
    const g = this.game;
    const s = desc.slots[index];
    const def = getItemDef(s.id);
    const slot = def.clothing.slot;
    const ei = EQUIP_SLOTS.indexOf(slot);
    const eq = this.inv.equipmentDesc();
    if ((s.count || 1) > 1) {
      // take one from the stack
      const one = { ...JSON.parse(JSON.stringify(s)), count: 1 };
      s.count--;
      const old = this.inv.equipment[ei];
      this.inv.equipment[ei] = one;
      if (old) this.giveOrDrop(old);
    } else if (!moveStack(desc, index, eq, ei)) {
      g.ui?.toast("Can't wear that right now.", 'warn');
      return;
    }
    desc.onChange?.();
    g.audio.play('zipper', { volume: 0.6 });
    g.afterInventoryChange();
  }

  unequip(ei) {
    const g = this.game;
    const s = this.inv.equipment[ei];
    if (!s) return;
    this.inv.equipment[ei] = null;
    const left = this.inv.addItem(s);
    if (left) { g.groundItems.dropAt(left, this.p.x, this.p.y, this.p.z); g.ui?.toast('Dropped ' + getItemDef(s.id).name + ' (no room).', 'info'); }
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
    }
  }

  rip(desc, index) {
    const g = this.game;
    const s = desc.slots[index];
    const def = getItemDef(s.id);
    g.startAction({
      label: 'Ripping ' + def.name, time: this.inv.has((x) => hasTag(x, 'blade')) ? 2 : 4, anim: 'craft', sound: 'bandage',
      onDone: () => {
        if (desc.slots[index] !== s) return;
        if (s.contents) for (const c of s.contents) if (c) this.giveOrDrop(c);
        const n = clamp(Math.round((def.weight || 0.5) * 4), 1, 5);
        desc.slots[index] = null;
        desc.onChange?.();
        this.giveOrDrop(createItem(s.dur !== undefined && s.dur < (def.durability || 100) * 0.4 ? 'rag_dirty' : 'rag', { count: n }));
        g.ui?.toast(`Got ${n} rags.`, 'good');
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
      label: 'Reading ' + def.name, time: 8, anim: 'read', sound: 'ui_click',
      onDone: () => {
        if (b.skill) {
          g.survival.bookBoost[b.skill] = (b.hours || 24);
          g.ui?.toast(`${SKILLS[b.skill]?.name || b.skill} XP gain x${b.mult || 2} for ${b.hours || 24} hours.`, 'good');
          p.addXP(b.skill, 20);
        } else {
          p.panic = Math.max(0, p.panic - (b.panic || 20));
          g.ui?.toast('You feel a little calmer.', 'good');
        }
        if (def.category === 'book' && !b.keep) {
          // books remain; literature (comics, novels) can be re-read
        }
      },
    });
  }

  split(desc, index) {
    const s = desc.slots[index];
    const j = desc.slots.indexOf(null);
    if (j < 0) return;
    moveStack(desc, index, desc, j, Math.floor(s.count / 2));
    desc.onChange?.();
  }

  giveOrDrop(stack) {
    const left = this.inv.addItem(stack);
    if (left) this.game.groundItems.dropAt(left, this.p.x, this.p.y, this.p.z);
    this.game.afterInventoryChange();
  }

  // ------------------------------------------------------------------ tooltip
  describeItem(stack) {
    const g = this.game;
    const def = getItemDef(stack.id);
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
      L.push(`Hunger +${f.hunger || 0}${f.thirst ? `  ·  Thirst ${f.thirst > 0 ? '+' : ''}${f.thirst}` : ''}`);
      if (f.spoils) {
        const fr = itemFreshness(stack, g.time.totalHours);
        L.push(fr <= 0 ? 'ROTTEN' : fr < 0.3 ? 'Stale' : 'Fresh');
      }
      if (f.needsOpener) L.push('Needs a can opener or knife');
      if (f.raw) L.push('Raw - cook it first');
    }
    if (def.liquidContainer) {
      const liq = stack.data?.liquid;
      L.push(liq ? `${liq === 'dirty_water' ? 'Unsafe water' : liq === 'gasoline' ? 'Gasoline' : 'Water'}: ${stack.uses || 0}/${def.liquidContainer.capacity}` : 'Empty');
    } else if (def.drink) L.push(`Thirst +${def.drink.thirst || 0}${def.uses ? `  ·  ${stack.uses ?? def.uses} sips left` : ''}`);
    if (def.clothing) {
      const c = def.clothing;
      L.push(`Slot: ${EQUIP_LABELS[c.slot]}`);
      const parts = [];
      if (c.insulation) parts.push(`Warmth ${Math.round(c.insulation * 100)}`);
      if (c.water) parts.push(`Waterproof ${Math.round(c.water * 100)}`);
      if (c.bite || c.scratch) parts.push(`Bite ${Math.round((c.bite || 0) * 100)} / Scratch ${Math.round((c.scratch || 0) * 100)}`);
      if (parts.length) L.push(parts.join('  ·  '));
    }
    if (def.capacity) L.push(`Storage: ${def.capacity} slots${def.weightReduction ? `  ·  -${Math.round(def.weightReduction * 100)}% weight` : ''}`);
    if (def.light) L.push(`Battery: ${Math.round(stack.uses ?? 100)}%`);
    if (def.uses && !def.liquidContainer && !def.drink && !def.light) L.push(`Uses left: ${stack.uses ?? def.uses}`);
    if (def.book?.skill) L.push(`Boosts ${SKILLS[def.book.skill]?.name || def.book.skill} XP`);
    return { name: def.name + ((stack.count || 1) > 1 ? ` (${stack.count})` : ''), lines: L, rarity: def.rarity || 'common', condition };
  }
}

function conditionLabel(c) {
  return c > 0.85 ? 'Pristine' : c > 0.6 ? 'Worn' : c > 0.35 ? 'Damaged' : c > 0.12 ? 'Badly Damaged' : 'Ruined';
}
export { WOUND_INFO };
