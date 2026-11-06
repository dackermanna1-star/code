// Survival simulation: needs, body temperature, wetness, wounds/bleeding, infections, sickness, panic, moodles.
import { clamp, lerp } from '../core/rng.js';
import { getItemDef } from '../items/items.js';
import { EQUIP_SLOTS } from '../inventory/Inventory.js';

export const BODY_PARTS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
export const PART_LABELS = { head: 'Head', torso: 'Torso', armL: 'Left Arm', armR: 'Right Arm', legL: 'Left Leg', legR: 'Right Leg' };
export const WOUND_INFO = {
  scratch: { label: 'Scratch', bleed: 0.12, heal: 6, selfStop: 35, zInfect: 0.07 },
  laceration: { label: 'Laceration', bleed: 0.32, heal: 16, selfStop: 160, zInfect: 0.25 },
  bite: { label: 'Bite', bleed: 0.28, heal: 24, selfStop: 200, zInfect: 0.9 },
  deep: { label: 'Deep Wound', bleed: 0.6, heal: 30, selfStop: 0, zInfect: 0 },
  bullet: { label: 'Gunshot Wound', bleed: 0.5, heal: 30, selfStop: 0, zInfect: 0 },
  fracture: { label: 'Fracture', bleed: 0, heal: 48, selfStop: 0, zInfect: 0 },
  burn: { label: 'Burn', bleed: 0, heal: 20, selfStop: 0, zInfect: 0 },
  glass: { label: 'Glass Cut', bleed: 0.22, heal: 10, selfStop: 60, zInfect: 0 },
};

export class Survival {
  constructor(player) {
    this.p = player;
    this.staminaDelay = 0;
    this.bleedTick = 0;
    this.infectionTimer = 0;
    this.vomitTimer = 30;
    this.sneezeTimer = 20;
    this.lastHurt = 0;
    this.time = 0;
    this.effects = { damage: 0, lowHealth: 0, wobble: 0, chroma: 0, sick: 0, desat: 0, blackout: 0 };
    this.bookBoost = {}; // skill -> game hours remaining of 2x xp
  }

  /** Clothing summary (insulation, water resistance, protection, speed). */
  clothing() {
    const inv = this.p.inv;
    let ins = 0, water = 0, bite = 0, scratch = 0, speed = 1, n = 0;
    const perPart = {};
    for (const part of BODY_PARTS) perPart[part] = { bite: 0, scratch: 0 };
    const cover = {
      head: ['head'], face: ['head'], torso: ['torso', 'armL', 'armR'], jacket: ['torso', 'armL', 'armR'],
      vest: ['torso'], hands: ['armL', 'armR'], legs: ['legL', 'legR'], feet: ['legL', 'legR'], back: [],
    };
    EQUIP_SLOTS.forEach((slot, i) => {
      const st = inv.equipment[i];
      if (!st) return;
      const def = getItemDef(st.id);
      const c = def.clothing;
      if (!c) return;
      const cond = def.durability ? clamp((st.dur ?? def.durability) / def.durability, 0.2, 1) : 1;
      ins += (c.insulation || 0);
      water = 1 - (1 - water) * (1 - (c.water || 0) * (slot === 'jacket' || slot === 'head' ? 1 : 0.4));
      if (c.speed) speed *= c.speed;
      for (const part of cover[slot] || []) {
        const pp = perPart[part];
        pp.bite = 1 - (1 - pp.bite) * (1 - (c.bite || 0) * cond);
        pp.scratch = 1 - (1 - pp.scratch) * (1 - (c.scratch || 0) * cond);
      }
      n++;
    });
    for (const part of BODY_PARTS) { bite += perPart[part].bite; scratch += perPart[part].scratch; }
    return {
      insulation: clamp(ins, 0, 1.2), water: clamp(water, 0, 0.95), speed,
      bite: bite / BODY_PARTS.length, scratch: scratch / BODY_PARTS.length, perPart,
    };
  }

  /**
   * ctx: {dt (real s), dtH (game hours), ambient (°C), indoor, raining (0..1 outdoors), nearFire, threat (0..1), sleeping, exertion}
   */
  update(ctx) {
    const p = this.p;
    if (p.dead) return;
    const { dt, dtH } = ctx;
    this.time += dt;
    const cl = this.clothing();
    p.insulation = cl.insulation; p.waterResist = cl.water;
    p.armor = { bite: cl.bite, scratch: cl.scratch };
    const bonus = p.bonus || {};
    const sprint = p.sprinting ? 1 : 0;

    // ---- needs
    // 1 game hour = 1 real minute: from full, "Peckish" after ~15 min, "Slightly Thirsty" after ~12 min
    const hungerRate = 2.6 * (bonus.hunger || 1) * (1 + sprint * 0.9) * (p.bodyTemp < 36 ? 1.25 : 1) * (ctx.sleeping ? 0.5 : 1);
    const thirstRate = 3.4 * (1 + sprint * 0.9) * (p.bodyTemp > 37.6 ? 1.4 : 1) * (p.drunk > 10 ? 1.3 : 1) * (ctx.sleeping ? 0.5 : 1);
    p.hunger = clamp(p.hunger - hungerRate * dtH, 0, 100);
    p.thirst = clamp(p.thirst - thirstRate * dtH, 0, 100);
    if (ctx.sleeping) p.energy = clamp(p.energy + 13 * dtH, 0, 100);
    else p.energy = clamp(p.energy - (3.2 + sprint * 2) * dtH * (p.caffeine > 0 ? 0.4 : 1), 0, 100);
    p.caffeine = Math.max(0, p.caffeine - dtH);
    p.painkiller = Math.max(0, p.painkiller - dtH);
    p.antiviralProtect = Math.max(0, (p.antiviralProtect || 0) - dtH);
    p.adrenaline = Math.max(0, p.adrenaline - dt);
    p.drunk = Math.max(0, p.drunk - 6 * dtH);

    // ---- stamina
    const fit = p.skillLevel('fitness');
    p.maxStamina = clamp(100 * (0.55 + 0.45 * (p.energy / 100)) * (p.hunger < 10 || p.thirst < 10 ? 0.7 : 1) + fit * 3, 30, 130);
    if (p.sprinting) {
      p.stamina -= (13 - fit * 0.7) * dt * (ctx.carryFactor < 1 ? 1.4 : 1);
      this.staminaDelay = 0.9;
      p.addXP('fitness', dt * 0.6);
    } else if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else {
      const regen = (11 + fit) * (p.hunger < 15 ? 0.5 : 1) * (p.thirst < 15 ? 0.5 : 1) * (p.bodyTemp < 35.5 ? 0.6 : 1) * (p.adrenaline > 0 ? 2 : 1);
      p.stamina += regen * dt * (p.crouching || !p.moving01 ? 1.3 : 1);
    }
    p.stamina = clamp(p.stamina, 0, p.maxStamina);

    // ---- temperature & wetness
    const exert = p.sprinting ? 7 : p.moving01 > 0.3 ? 2 : 0;
    let env = ctx.ambient + (ctx.indoor ? 4 : 0) + (ctx.nearFire ? 16 : 0);
    const effective = env + p.insulation * 18 + exert - p.wetness * 0.13 * (1 - p.insulation * 0.4) + (p.drunk > 20 ? 2 : 0);
    // comfort band 15..34: a winter coat on a mild 16 °C October day makes you warm, not heatstroke
    let tRate = 0;
    if (effective < 15) tRate = -(15 - effective) * 0.035 * (bonus.cold || 1);
    else if (effective > 34) tRate = (effective - 34) * 0.05;
    else tRate = (37 - p.bodyTemp) * 0.6;
    const fever = p.infectionKnown ? 0.012 * p.infection : 0;
    const woundFever = p.wounds.some((w) => w.infected) ? 0.6 : 0;
    p.bodyTemp = clamp(p.bodyTemp + tRate * dtH + (37 + fever + woundFever - p.bodyTemp) * (fever + woundFever > 0 ? 0.3 : 0) * dtH, 30, 41.5);
    if (ctx.raining > 0 && !ctx.indoor) p.wetness = clamp(p.wetness + ctx.raining * 55 * dtH * (1 - p.waterResist), 0, 100);
    if (p.inWater) p.wetness = 100;
    else if (!(ctx.raining > 0 && !ctx.indoor)) p.wetness = clamp(p.wetness - (ctx.nearFire ? 80 : ctx.indoor ? 18 : 10) * dtH, 0, 100);

    // ---- wounds
    let bleeding = 0, painSum = 0;
    const healMult = (1 + p.skillLevel('firstAid') * 0.06) * (bonus.healRate || 1) * (ctx.sleeping ? 2 : 1) *
      (p.hunger > 30 && p.thirst > 30 ? 1 : 0.4);
    for (const w of p.wounds) {
      const info = WOUND_INFO[w.type];
      w.age = (w.age || 0) + dt;
      if (w.bleeding) {
        if (w.bandaged) w.bleeding = false;
        else {
          bleeding += info.bleed * (w.severity || 1);
          if (info.selfStop && w.age > info.selfStop * (w.severity || 1)) w.bleeding = false;
        }
      }
      if (w.bandaged) {
        w.bandageAge = (w.bandageAge || 0) + dtH;
        // a dressing soaks through after a few game hours (sooner on heavy wounds) and should be changed
        const dirtyAfter = (w.bandageSterile ? 10 : 6) * (w.type === 'deep' || w.type === 'bullet' || w.type === 'bite' ? 0.6 : 1);
        if (w.bandageAge > dirtyAfter && !w.bandageDirty) w.bandageDirty = true;
      }
      if (w.antibiotic > 0) w.antibiotic -= dtH;
      // bacterial infection
      if (!w.infected && w.type !== 'fracture' && !w.disinfected) {
        let risk = (w.bandaged ? (w.bandageDirty ? 0.05 : 0.004) : 0.03) * dtH;
        if (w.embedded) risk *= 2;
        if (w.burnTreated) risk *= 0.3;
        if (w.antibiotic > 0) risk *= 0.15;
        if (Math.random() < risk) w.infected = true;
      }
      if (w.infected && w.antibiotic > 0 && Math.random() < 0.4 * dtH) w.infected = false;
      // healing (glass / bullet fragments left inside, unstitched deep wounds and unsplinted bones heal slowly)
      const canHeal = !w.bleeding && !w.infected;
      if (canHeal) {
        let rate = healMult;
        if (w.type === 'fracture' && !w.splinted) rate *= 0.3;
        if (w.type === 'deep' && !w.sutured) rate *= 0.2;
        if (w.embedded) rate *= 0.25;
        if (w.type === 'burn' && w.burnTreated) rate *= 2;
        w.heal = clamp((w.heal || 0) + (dtH / info.heal) * rate, 0, 1);
      }
      painSum += ((w.type === 'fracture' ? (w.splinted ? 15 : 35) : w.type === 'bite' ? 18 : w.type === 'deep' || w.type === 'bullet' ? 22 : w.type === 'burn' ? (w.burnTreated ? 9 : 18) : 8) + (w.embedded ? 6 : 0)) * (1 - (w.heal || 0)) + (w.infected ? 12 : 0);
    }
    p.wounds = p.wounds.filter((w) => (w.heal || 0) < 1);
    p.pain = clamp(lerp(p.pain, painSum * (p.painkiller > 0 ? 0.25 : 1), 1 - Math.exp(-dt * 0.5)), 0, 100);
    if (bleeding > 0) this.hurt(bleeding * dt, 'Bled out', true);

    // ---- zombie infection
    if (p.infected) {
      const slow = (p.antibioticSlow > 0 ? 0.5 : 1) * (p.antiviralProtect > 0 ? 0.35 : 1);
      p.antibioticSlow = Math.max(0, (p.antibioticSlow || 0) - dtH);
      p.infection = clamp(p.infection + 1.35 * dtH * slow, 0, 100);
      if (p.infection > 22 && !p.infectionKnown) {
        p.infectionKnown = true;
        this.onSymptoms?.();
      }
      if (p.infection > 40) this.hurt(((p.infection - 40) / 60) * 4 * dtH, 'Succumbed to the infection');
      if (p.infection >= 100) this.hurt(1000, 'Succumbed to the infection');
    }

    // ---- sickness (food poisoning / dirty water)
    if (p.sickness > 0) {
      p.sickness = clamp(p.sickness - 5 * dtH, 0, 100);
      if (p.sickness > 45) this.hurt((p.sickness - 45) * 0.08 * dtH, 'Food poisoning');
      this.vomitTimer -= dt;
      if (p.sickness > 55 && this.vomitTimer <= 0) {
        this.vomitTimer = 40 + Math.random() * 60;
        p.hunger = Math.max(0, p.hunger - 12);
        p.thirst = Math.max(0, p.thirst - 10);
        this.onVomit?.();
      }
    }
    // an untreated infected wound slowly makes you sick (net +2/h per wound, on top of the natural recovery)
    const infectedWounds = p.wounds.filter((w) => w.infected).length;
    if (infectedWounds && p.sickness < 60) p.sickness = clamp(p.sickness + (5 + 2 * infectedWounds) * dtH, 0, 60);

    // ---- starvation / dehydration / hypothermia / exhaustion damage
    if (p.hunger <= 0) this.hurt(5 * dtH, 'Starved to death');
    if (p.thirst <= 0) this.hurt(9 * dtH, 'Died of dehydration');
    if (p.bodyTemp < 34.5) this.hurt((34.5 - p.bodyTemp) * 6 * dtH, 'Froze to death (hypothermia)');
    if (p.bodyTemp > 40.2) this.hurt((p.bodyTemp - 40.2) * 8 * dtH, 'Heatstroke');

    // ---- natural regeneration
    if (bleeding === 0 && p.hunger > 25 && p.thirst > 25 && p.sickness < 30 && !(p.infectionKnown && p.infection > 40) && p.bodyTemp > 35) {
      p.health = clamp(p.health + (ctx.sleeping ? 6 : 1.6) * dtH * (p.hunger > 70 ? 1.5 : 1), 0, p.maxHealth);
    }

    // ---- panic
    const vet = bonus.noPanic;
    if (!vet) {
      const target = clamp(ctx.threat * 100, 0, 100);
      p.panic = target > p.panic ? lerp(p.panic, target, 1 - Math.exp(-dt * 0.8)) : Math.max(0, p.panic - 4 * dt);
      if (p.drunk > 20) p.panic *= 0.98;
    } else p.panic = 0;

    // ---- post effects
    const E = this.effects;
    E.damage = Math.max(0, E.damage - dt * 1.6);
    E.lowHealth = clamp((40 - p.health) / 40, 0, 1);
    E.wobble = clamp(p.drunk / 60 + p.sickness / 150 + (p.infectionKnown ? p.infection / 140 : 0) + (p.energy < 10 ? 0.3 : 0), 0, 1.4);
    E.chroma = clamp(p.panic / 120 + (p.infectionKnown ? p.infection / 200 : 0), 0, 1);
    E.sick = clamp(p.sickness / 80 + (p.infectionKnown ? p.infection / 160 : 0), 0, 1);
    E.desat = clamp((p.infectionKnown ? p.infection / 220 : 0) + (p.energy < 15 ? 0.15 : 0), 0, 0.7);
    E.blackout = p.energy < 4 && !ctx.sleeping ? 0.3 + 0.3 * Math.sin(this.time * 0.7) ** 8 : 0;

    this.computeMoodles(cl);
  }

  hurt(amount, cause, silent = false) {
    const p = this.p;
    if (p.dead || amount <= 0) return;
    p.health -= amount;
    if (!silent && amount >= 1) this.effects.damage = clamp(this.effects.damage + amount / 25, 0, 1);
    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      p.deathCause = cause || 'Died';
      this.onDeath?.(p.deathCause);
    }
  }

  /**
   * Zombie attack lands. Returns {wound, blocked}. dmg base damage; kind 'bite'|'scratch'|'laceration' rolled here.
   */
  zombieHit(dmg, zombieType = 'walker') {
    const p = this.p;
    const part = pickPart();
    const cl = this.clothing();
    const prot = cl.perPart[part];
    let r = Math.random();
    let type = r < 0.55 ? 'scratch' : r < 0.85 ? 'laceration' : 'bite';
    if (zombieType === 'crawler' && (part === 'legL' || part === 'legR')) type = Math.random() < 0.5 ? 'bite' : type;
    // clothing can stop the wound entirely
    const stopChance = type === 'bite' ? prot.bite : prot.scratch;
    let wound = null;
    let blocked = false;
    if (Math.random() < stopChance) {
      blocked = true;
      dmg *= 0.35;
      this.damageClothing(part, 6);
    } else {
      wound = this.addWound(type, part);
      this.damageClothing(part, 3);
    }
    this.hurt(dmg, zombieType === 'brute' ? 'Torn apart by a brute' : 'Killed by zombies');
    p.panic = Math.min(100, p.panic + 18);
    return { wound, blocked, part };
  }

  addWound(type, part = pickPart(), severity = 1) {
    const w = {
      part, type, severity, bleeding: WOUND_INFO[type].bleed > 0, bandaged: false, bandageDirty: false,
      disinfected: false, infected: false, splinted: false, sutured: false, heal: 0, age: 0,
      // glass shards / bullet fragments stay inside until pulled out (tweezers): slow healing, infection risk
      embedded: type === 'glass' || type === 'bullet',
    };
    this.p.wounds.push(w);
    const zi = WOUND_INFO[type].zInfect * ((this.p.antiviralProtect || 0) > 0 ? 0.25 : 1);
    if (zi && !this.p.infected && Math.random() < zi) {
      this.p.infected = true;
      this.p.infection = Math.max(this.p.infection, 1);
    }
    return w;
  }

  damageClothing(part, amount) {
    const inv = this.p.inv;
    const slots = { head: ['head'], torso: ['jacket', 'vest', 'torso'], armL: ['jacket', 'torso', 'hands'], armR: ['jacket', 'torso', 'hands'], legL: ['legs'], legR: ['legs'] }[part] || [];
    for (const s of slots) {
      const st = inv.getEquipped(s);
      if (st && st.dur !== undefined) {
        st.dur = Math.max(1, st.dur - amount);
        return;
      }
    }
  }

  computeMoodles() {
    const p = this.p;
    const m = [];
    const add = (id, label, level, desc, bad = true) => { if (level > 0) m.push({ id, label, level: Math.min(4, level), desc, bad }); };
    add('hungry', ['', 'Peckish', 'Hungry', 'Very Hungry', 'Starving'][lvl(100 - p.hunger, [40, 60, 80, 95])], lvl(100 - p.hunger, [40, 60, 80, 95]), 'Eat something.');
    add('thirsty', ['', 'Slightly Thirsty', 'Thirsty', 'Parched', 'Dying of Thirst'][lvl(100 - p.thirst, [40, 60, 80, 95])], lvl(100 - p.thirst, [40, 60, 80, 95]), 'Drink water.');
    const bleeding = p.wounds.filter((w) => w.bleeding).length;
    add('bleeding', bleeding > 1 ? 'Heavy Bleeding' : 'Bleeding', bleeding ? Math.min(4, bleeding + 1) : 0, 'Bandage your wounds (H).');
    const inj = p.health < 100 ? lvl(100 - p.health, [15, 40, 65, 85]) : 0;
    add('injured', ['', 'Minor Injuries', 'Injured', 'Badly Injured', 'Critical'][inj], inj, 'Health ' + Math.round(p.health));
    add('pain', ['', 'Minor Pain', 'Pain', 'Severe Pain', 'Agony'][lvl(p.pain, [10, 30, 55, 80])], lvl(p.pain, [10, 30, 55, 80]), 'Painkillers help.');
    if (p.infectionKnown) add('infected', ['', 'Feverish', 'Infected', 'Very Sick', 'Dying'][lvl(p.infection, [1, 40, 65, 85])], lvl(p.infection, [1, 40, 65, 85]), 'Find antiviral medicine. Hospital? Military?');
    const woundInf = p.wounds.filter((w) => w.infected).length;
    if (woundInf) add('woundinf', 'Infected Wound', 2, 'Disinfect it or take antibiotics.');
    add('sick', ['', 'Queasy', 'Nauseous', 'Sick', 'Fever'][lvl(p.sickness, [15, 35, 55, 75])], lvl(p.sickness, [15, 35, 55, 75]), 'Rest, drink clean water.');
    add('cold', ['', 'Chilly', 'Cold', 'Freezing', 'Hypothermia'][lvl(37 - p.bodyTemp, [0.5, 1.2, 2.0, 2.8])], lvl(37 - p.bodyTemp, [0.5, 1.2, 2.0, 2.8]), 'Wear warmer clothes, find a fire.');
    add('hot', ['', 'Warm', 'Hot', 'Overheating', 'Heatstroke'][lvl(p.bodyTemp - 37, [0.6, 1.2, 2.0, 3.0])], lvl(p.bodyTemp - 37, [0.6, 1.2, 2.0, 3.0]), 'Remove layers, drink.');
    add('wet', ['', 'Damp', 'Wet', 'Soaked', 'Drenched'][lvl(p.wetness, [15, 40, 70, 90])], lvl(p.wetness, [15, 40, 70, 90]), 'Get indoors / near a fire.');
    add('tired', ['', 'Drowsy', 'Tired', 'Very Tired', 'Ready to Collapse'][lvl(100 - p.energy, [55, 70, 85, 95])], lvl(100 - p.energy, [55, 70, 85, 95]), 'Sleep in a bed (E).');
    add('exhausted', p.stamina < 15 ? 'Out of Breath' : 'Winded', p.stamina < 35 ? (p.stamina < 15 ? 3 : 1) : 0, 'Stop sprinting.');
    const over = p.weight / p.maxWeight;
    add('heavy', ['', 'Heavy Load', 'Burdened', 'Over-Encumbered', 'Immobile'][lvl(over, [1.0, 1.25, 1.5, 2.0])], lvl(over, [1.0, 1.25, 1.5, 2.0]), `${p.weight.toFixed(1)} / ${p.maxWeight.toFixed(0)} kg`);
    add('panic', ['', 'Nervous', 'Panicked', 'Terrified', 'Hysterical'][lvl(p.panic, [15, 40, 65, 85])], lvl(p.panic, [15, 40, 65, 85]), 'Aim suffers while panicked.');
    add('drunk', ['', 'Tipsy', 'Drunk', 'Wasted', 'Blackout'][lvl(p.drunk, [10, 30, 55, 80])], lvl(p.drunk, [10, 30, 55, 80]), '');
    if (p.hunger > 92) add('full', 'Well Fed', 1, '', false);
    if (p.adrenaline > 0) add('adrenaline', 'Adrenaline', 2, 'Stamina regenerates fast.', false);
    const frac = p.wounds.find((w) => w.type === 'fracture');
    if (frac) add('fracture', frac.splinted ? 'Splinted' : 'Broken Bone', frac.splinted ? 1 : 3, 'Apply a splint (H).');
    this.p.moodles = m;
  }
}

function lvl(v, th) {
  let l = 0;
  for (let i = 0; i < th.length; i++) if (v >= th[i]) l = i + 1;
  return l;
}

function pickPart() {
  const r = Math.random();
  if (r < 0.1) return 'head';
  if (r < 0.35) return 'torso';
  if (r < 0.55) return 'armL';
  if (r < 0.75) return 'armR';
  if (r < 0.88) return 'legL';
  return 'legR';
}
