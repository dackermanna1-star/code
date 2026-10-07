// Staying alive. Health (what holds you together), blood (what's in you -
// lose too much and the world drains of colour, then goes dark), energy and
// water (eat and drink or start to suffer), body heat (wet clothes in the
// rain at night will kill you slowly), bleeding wounds (each one drips until
// it's bandaged), a broken leg from a bad fall, food poisoning from rotten
// food or dirty water, and pain, which makes your hands shake.
import { O } from '../state.js';
import { def } from './inventory.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Survival {
  constructor() {
    this.health = 100; this.blood = 100;
    this.energy = 72; this.water = 72;
    this.heat = 0.1; // -1 freezing .. 0 fine .. 1 hot
    this.wet = 0; // 0..1
    this.wounds = 0; // bleeding sources
    this.brokenLeg = false;
    this.sick = 0; // food poisoning 0..1
    this.pain = 0; // seconds of shaking left (painkillers cancel it)
    this.painkiller = 0; this.morphine = 0; this.vitamins = 0;
    this.maxStamina = 100;
    this.sway = 0;
    this.slow = 1;
    this.alive = true;
    this._notes = {};
    this.vomitT = 30;
    this.cause = null;
  }
  note(key, text, every = 90) {
    const t = performance.now() / 1000;
    if (this._notes[key] && t - this._notes[key] < every) return;
    this._notes[key] = t;
    O.hud?.note(text);
  }

  /** dt in seconds; ctx: { moving, sprinting, indoors, hour, weather, swimming } */
  update(dt, ctx) {
    if (!this.alive) return;
    const sprint = ctx.sprinting ? 1 : 0;
    // metabolism: about an hour of play from full to empty, faster when running
    this.energy = clamp(this.energy - dt * (0.022 + 0.03 * sprint + (this.heat < -0.4 ? 0.02 : 0)), 0, 100);
    this.water = clamp(this.water - dt * (0.03 + 0.045 * sprint + (this.heat > 0.4 ? 0.03 : 0)), 0, 100);
    // bleeding
    if (this.wounds > 0) {
      this.blood = clamp(this.blood - dt * this.wounds * 0.32, 0, 100);
      if (Math.random() < dt * this.wounds * 1.2) O.fx?.drip?.();
      this.note('bleed', 'You are bleeding', 40);
    }
    // recovery: blood comes back when you're fed and watered; health when your blood is good
    const fed = this.energy > 45 && this.water > 45;
    if (fed && this.wounds === 0) {
      this.blood = clamp(this.blood + dt * 0.06, 0, 100);
      if (this.blood > 70 && this.sick < 0.2 && this.heat > -0.5) this.health = clamp(this.health + dt * 0.05, 0, 100);
    }
    // starving and dying of thirst
    if (this.energy <= 0) { this.health -= dt * 0.18; this.note('starve', 'You are starving', 60); }
    else if (this.energy < 20) this.note('hungry', 'You are hungry', 120);
    if (this.water <= 0) { this.health -= dt * 0.3; this.note('thirst', 'You are dying of thirst', 60); }
    else if (this.water < 20) this.note('thirsty', 'You are thirsty', 120);
    // body heat: the weather, the night, how wet you are, what you're wearing, whether you're moving
    const hour = ctx.hour ?? 12;
    const night = hour < 5 || hour > 21 ? 1 : hour < 7 || hour > 19 ? 0.5 : 0;
    const w = ctx.weather || {};
    const air = 0.25 - night * 0.45 - (w.rain || 0) * 0.25 - (w.wind || 0) * 0.15 - (w.cold || 0);
    const warm = O.inv ? O.inv.warmth() : 0;
    const rainWet = (w.rain || 0) * (ctx.indoors ? 0 : 1) * (1 - (O.inv?.waterproof() ?? 0));
    this.wet = clamp(this.wet + dt * (rainWet * 0.012 - (ctx.indoors ? 0.006 : 0.002) * (1 - (w.rain || 0)) - (night ? 0 : 0.001)), 0, 1);
    const target = clamp(air + warm * 0.55 - this.wet * 0.6 + (ctx.moving ? 0.15 : 0) + sprint * 0.2 + (ctx.indoors ? 0.25 : 0), -1, 1);
    this.heat += (target - this.heat) * Math.min(1, dt * 0.01);
    if (this.heat < -0.55) { this.health -= dt * 0.08 * (-this.heat); this.note('cold', 'You are freezing', 60); }
    else if (this.heat < -0.3) this.note('cool', 'You feel cold', 150);
    if (this.wet > 0.5) this.note('wet', 'You are soaked through', 200);
    // food poisoning: you're sick for a while, and sometimes throw up
    if (this.sick > 0) {
      this.sick = clamp(this.sick - dt * (this.vitamins > 0 ? 0.004 : 0.0018), 0, 1);
      this.vomitT -= dt * this.sick;
      if (this.vomitT <= 0) { this.vomitT = 25 + Math.random() * 40; this.water = clamp(this.water - 18, 0, 100); this.energy = clamp(this.energy - 12, 0, 100); O.audio?.vomit(); O.post?.hit(0.4, 0x406020); this.note('vomit', 'You threw up', 1); }
      this.note('sick', 'You feel sick', 120);
      this.health -= dt * 0.02 * this.sick;
    }
    // drugs wearing off
    this.painkiller = Math.max(0, this.painkiller - dt);
    this.morphine = Math.max(0, this.morphine - dt);
    this.vitamins = Math.max(0, this.vitamins - dt);
    this.pain = Math.max(0, this.pain - dt);
    if (this.brokenLeg && this.morphine <= 0) { this.pain = Math.max(this.pain, 5); this.note('leg', 'Your leg is broken', 90); }
    // how steady your hands are
    const shake = (this.pain > 0 && this.painkiller <= 0 ? 1 : 0) + (this.heat < -0.45 ? 0.8 : 0) + (this.blood < 60 ? (60 - this.blood) / 40 : 0) + (ctx.exhausted ? 0.6 : 0);
    this.sway += (shake - this.sway) * Math.min(1, dt * 2);
    this.maxStamina = 100 * (this.energy < 15 ? 0.6 : 1) * (this.brokenLeg ? 0.5 : 1) * (this.sick > 0.4 ? 0.75 : 1);
    this.slow = this.blood < 40 ? 0.8 : 1;
    if (this.health <= 0 || this.blood <= 0) this.die(this.cause || (this.blood <= 0 ? 'blood loss' : 'your wounds'));
  }

  /**
   * Hurt: amount of health; o: { bleed (chance of a new wound), part ('head' | 'torso' | 'arm' | 'leg'), cause, blood (direct loss), armorPierce }
   * Armour (helmet, vest) takes a share off. Returns the damage taken.
   */
  hurt(amount, o = {}) {
    if (!this.alive) return 0;
    const armor = O.inv ? O.inv.armor(o.part || 'torso') : 0;
    const a = armor * (1 - (o.armorPierce || 0));
    const dmg = amount * (1 - a);
    if (a > 0 && O.inv) { const it = o.part === 'head' ? O.inv.slots.head : O.inv.slots.vest; if (it) it.cond = Math.max(0, it.cond - amount * 0.004); }
    this.health -= dmg;
    this.blood -= (o.blood ?? dmg * 0.35);
    if (Math.random() < (o.bleed ?? 0.3) * (1 - a * 0.7)) { this.wounds = Math.min(6, this.wounds + 1); }
    if (o.part === 'leg' && dmg > 25 && Math.random() < 0.25) this.breakLeg();
    this.cause = o.cause || this.cause;
    this.pain = Math.max(this.pain, Math.min(60, dmg * 1.5));
    // your clothes take a beating too
    if (O.inv) for (const s of ['torso', 'legs']) { const it = O.inv.slots[s]; if (it && Math.random() < 0.4) it.cond = Math.max(0, it.cond - dmg * 0.003); }
    O.post?.hit(Math.min(1, 0.25 + dmg / 30));
    O.audio?.hurt(dmg);
    if (this.health <= 0 || this.blood <= 0) this.die(o.cause || 'your wounds');
    return dmg;
  }
  fall(height) {
    const dmg = (height - 15) * 3.2;
    this.hurt(dmg, { bleed: 0, blood: 0, part: 'leg', cause: 'a fall' });
    if (height > 22 && Math.random() < Math.min(0.9, (height - 18) / 14)) this.breakLeg();
  }
  breakLeg() { if (this.brokenLeg) return; this.brokenLeg = true; O.audio?.bone(); this.note('legbreak', 'You broke your leg', 1); }
  die(cause) {
    if (!this.alive) return;
    this.alive = false; this.cause = cause;
    O.onDeath?.(cause);
  }

  // --- using things ----------------------------------------------------------------------------------------------------
  /** Eat or drink an item (it's used up, or one use is). Returns a message. */
  consume(it) {
    const d = def(it);
    const f = d.food || d.drink;
    if (!f) return null;
    let part = 1;
    if (d.can && !it.opened) {
      // a tin: a can opener opens it cleanly, a knife or an axe loses some
      const tool = bestOpener();
      if (!tool) return { fail: 'You need something to open it with.' };
      part = tool.q;
    }
    this.energy = clamp(this.energy + (f.energy || 0) * part, 0, 100);
    this.water = clamp(this.water + (f.water || 0) * part, 0, 100);
    if (f.sick && Math.random() < f.sick) this.poison(0.6);
    if (d.refill && it.dirty && Math.random() < 0.6) this.poison(0.5);
    if (d.disinfect) this.sick = Math.max(0, this.sick - 0.05);
    return { ok: true, part };
  }
  poison(amount) { this.sick = clamp(this.sick + amount, 0, 1); this.vomitT = Math.min(this.vomitT, 15); this.note('poison', 'Your stomach turns', 1); }
  /** Use a medical item. Returns { ok, msg }. */
  medicate(it) {
    const m = def(it).med;
    if (!m) return null;
    if (m.bandage) {
      if (this.wounds <= 0 && !m.health) return { fail: 'You aren’t bleeding.' };
      if (m.all) this.wounds = 0; else this.wounds = Math.max(0, this.wounds - 1);
      if (m.dirty && Math.random() < m.dirty) this.poison(0.25);
      if (m.health) this.health = clamp(this.health + m.health, 0, 100);
      return { ok: true, msg: m.all ? 'You patch yourself up' : this.wounds ? 'One wound is bandaged' : 'The bleeding has stopped' };
    }
    if (m.pain) { this.painkiller = Math.max(this.painkiller, m.pain); }
    if (m.morphine) { this.morphine = Math.max(this.morphine, m.morphine); return { ok: true, msg: 'The pain fades away' }; }
    if (m.splint) { if (!this.brokenLeg) return { fail: 'Your legs are fine.' }; this.brokenLeg = false; this.pain = 20; return { ok: true, msg: 'You set your leg' }; }
    if (m.cure) { this.sick = 0; return { ok: true, msg: 'You feel better' }; }
    if (m.cureFood) { this.sick = Math.max(0, this.sick - 0.6); return { ok: true, msg: 'Your stomach settles' }; }
    if (m.vitamins) { this.vitamins = Math.max(this.vitamins, m.vitamins); return { ok: true, msg: 'You take some vitamins' }; }
    if (m.blood) { this.blood = clamp(this.blood + m.blood, 0, 100); return { ok: true, msg: 'Some colour comes back' }; }
    if (m.disinfect) { return { ok: true, msg: 'You clean your wounds' }; }
    if (m.purify) return { fail: 'Use them on a bottle of water.' };
    return { ok: true, msg: 'You take the pills' };
  }

  /** The state of you, for the HUD: each 0..1 plus flags. */
  status() {
    return { health: this.health / 100, blood: this.blood / 100, energy: this.energy / 100, water: this.water / 100, heat: this.heat, wet: this.wet, wounds: this.wounds, brokenLeg: this.brokenLeg, sick: this.sick, pain: this.pain > 0 && this.painkiller <= 0 };
  }
  save() { const { health, blood, energy, water, heat, wet, wounds, brokenLeg, sick, painkiller, morphine, vitamins } = this; return { health, blood, energy, water, heat, wet, wounds, brokenLeg, sick, painkiller, morphine, vitamins }; }
  load(o) { Object.assign(this, o || {}); this.alive = this.health > 0 && this.blood > 0; }
}

function bestOpener() {
  if (!O.inv) return null;
  let best = null;
  for (const it of O.inv.all()) {
    const d = def(it);
    const q = d.opener ?? (d.knife ? 0.85 : d.melee && (d.melee.kind === 'chop') ? 0.6 : 0);
    if (q > (best?.q ?? 0)) best = { it, q };
  }
  // smash it open on a rock
  return best || { it: null, q: 0.45 };
}
