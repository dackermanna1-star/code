// Lightweight needs, buffs ("moodlets") and overall mood.
import { G } from '../game.js';
import { clamp, lerp } from '../core/utils.js';
import { roomAt } from '../world/apartment.js';

export const NEEDS = {
  hunger: { label: 'Hunger', icon: '🍔', color: '#ff9f43', decay: 3.4, low: 'You\'re getting hungry. Order something or cook!' },
  thirst: { label: 'Thirst', icon: '💧', color: '#4fc3f7', decay: 4.4, low: 'You\'re thirsty. Grab a drink!' },
  energy: { label: 'Energy', icon: '⚡', color: '#ffd54f', decay: 3.1, low: 'You\'re exhausted. A nap would help.' },
  hygiene: { label: 'Hygiene', icon: '🧼', color: '#81c784', decay: 2.4, low: 'Time for a shower…' },
  fun: { label: 'Fun', icon: '🎮', color: '#ba68c8', decay: 3.8, low: 'You\'re bored. Play with something!' },
  comfort: { label: 'Comfort', icon: '🛋️', color: '#f48fb1', decay: 0, low: 'You feel uncomfortable. Sit down, decorate, adjust the lights.' },
};

// buffs: decay multipliers, speed, earnings & mood bonus
export const BUFFS = {
  wellFed: { label: 'Well Fed', icon: '😋', mood: 8, decay: { hunger: 0.6 }, desc: 'Hunger drops slower' },
  caffeinated: { label: 'Caffeinated', icon: '☕', mood: 5, speed: 1.15, decay: { energy: 0.5 }, earn: 1.1, desc: 'Move faster, work better' },
  sugarRush: { label: 'Sugar Rush', icon: '🍭', mood: 6, speed: 1.1, decay: { fun: 0.7 }, desc: 'Zoomies!' },
  fresh: { label: 'Fresh & Clean', icon: '✨', mood: 6, decay: { hygiene: 0.6 }, desc: 'Squeaky clean' },
  pampered: { label: 'Pampered', icon: '🧖', mood: 12, decay: { hygiene: 0.4, comfort: 0.5 }, desc: 'Fancy products, fancy you' },
  minty: { label: 'Minty Fresh', icon: '🦷', mood: 4, desc: 'Great smile' },
  clean: { label: 'Clean Hands', icon: '🧼', mood: 2 },
  scented: { label: 'Smelling Great', icon: '🌸', mood: 7, earn: 1.05, desc: 'Confidence +' },
  glowing: { label: 'Glowing Skin', icon: '💆', mood: 7, decay: { comfort: 0.7 } },
  goodHair: { label: 'Good Hair Day', icon: '💇', mood: 6, earn: 1.05 },
  relaxed: { label: 'Relaxed', icon: '🛁', mood: 10, decay: { comfort: 0.5, fun: 0.8 } },
  blissful: { label: 'Blissful', icon: '🌈', mood: 18, decay: { comfort: 0.3, fun: 0.6 }, desc: 'Bath bomb magic' },
  wellRested: { label: 'Well Rested', icon: '😌', mood: 12, decay: { energy: 0.6 }, earn: 1.1 },
  napped: { label: 'Refreshed Nap', icon: '💤', mood: 4, decay: { energy: 0.8 } },
  cozy: { label: 'Cozy Vibes', icon: '🕯️', mood: 8, decay: { comfort: 0.5 } },
  calm: { label: 'Calm', icon: '🍃', mood: 9, decay: { fun: 0.8, energy: 0.85 } },
  zen: { label: 'Zen', icon: '🧘', mood: 10 },
  inspired: { label: 'Inspired', icon: '💡', mood: 9, earn: 1.15, desc: 'Better gig payouts' },
  reflective: { label: 'Reflective', icon: '📓', mood: 6 },
  endorphins: { label: 'Endorphins', icon: '💪', mood: 10, speed: 1.1 },
  groovy: { label: 'Groovy', icon: '🎶', mood: 7, decay: { fun: 0.6 } },
  inTheZone: { label: 'In The Zone', icon: '🎧', mood: 5, earn: 1.1 },
  dreamy: { label: 'Dreamy', icon: '🌌', mood: 8, decay: { comfort: 0.6 } },
  stylish: { label: 'Stylish', icon: '😎', mood: 10, earn: 1.1, desc: 'Your outfit slaps' },
  comfy: { label: 'Comfy Clothes', icon: '🧦', mood: 6, decay: { comfort: 0.6 } },
  vitalized: { label: 'Vitalized', icon: '💊', mood: 5, decay: { energy: 0.8, hunger: 0.9 } },
  treatYoself: { label: 'Treat Yo\'self', icon: '🛍️', mood: 8, desc: 'New stuff!' },
  social: { label: 'Connected', icon: '💬', mood: 6, desc: 'Nice chat' },
  freshRoom: { label: 'Fresh Room', icon: '🌿', mood: 5, decay: { comfort: 0.7 } },
  hangry: { label: 'Hangry', icon: '😤', mood: -10, negative: true },
  stinky: { label: 'Stinky', icon: '🦨', mood: -8, negative: true },
  exhausted: { label: 'Exhausted', icon: '🥱', mood: -10, speed: 0.85, negative: true },
  bored: { label: 'Bored', icon: '😐', mood: -6, negative: true },
};

export class Needs {
  constructor() { this.popups = []; this._envT = 0; this.comfortTarget = 60; this._lowWarned = {}; }
  get v() { return G.state.needs; }

  add(delta, { silent = false } = {}) {
    for (const [k, d] of Object.entries(delta)) {
      if (!(k in this.v)) continue;
      const before = this.v[k];
      this.v[k] = clamp(before + d, 0, 100);
      if (!silent && Math.abs(d) >= 1) G.ui.needPopup?.(k, d);
    }
  }

  hasBuff(id) { return G.state.buffs.some((b) => b.id === id && b.until > G.clock.total); }
  addBuff(id, minutes) {
    if (!BUFFS[id]) return;
    const b = G.state.buffs.find((x) => x.id === id);
    const until = G.clock.total + minutes;
    if (b) b.until = Math.max(b.until, until);
    else { G.state.buffs.push({ id, until }); G.ui.toast?.(`${BUFFS[id].icon} ${BUFFS[id].label}${BUFFS[id].desc ? ' — ' + BUFFS[id].desc : ''}`, { kind: BUFFS[id].negative ? 'bad' : 'good', duration: 2.6 }); }
    G.events.emit('buffs');
  }
  activeBuffs() { return G.state.buffs.filter((b) => b.until > G.clock.total && BUFFS[b.id]); }

  decayMult(k) {
    let m = 1;
    for (const b of this.activeBuffs()) m *= BUFFS[b.id].decay?.[k] ?? 1;
    return m;
  }
  speedMult() {
    let m = this.v.energy < 12 ? 0.85 : 1;
    for (const b of this.activeBuffs()) m *= BUFFS[b.id].speed ?? 1;
    return m;
  }
  earnMult() {
    let m = 0.8 + this.mood() / 100 * 0.4; // 0.8 .. 1.2
    for (const b of this.activeBuffs()) m *= BUFFS[b.id].earn ?? 1;
    return m;
  }
  mood() {
    const v = this.v;
    const base = (v.hunger + v.thirst + v.energy + v.hygiene + v.fun + v.comfort) / 6;
    let bonus = 0;
    for (const b of this.activeBuffs()) bonus += BUFFS[b.id].mood || 0;
    return clamp(base + bonus * 0.6, 0, 100);
  }
  moodLabel() {
    const m = this.mood();
    if (m > 88) return { label: 'Blissful', icon: '🤩' };
    if (m > 72) return { label: 'Happy', icon: '😊' };
    if (m > 55) return { label: 'Content', icon: '🙂' };
    if (m > 38) return { label: 'Meh', icon: '😐' };
    if (m > 22) return { label: 'Low', icon: '😕' };
    return { label: 'Miserable', icon: '😩' };
  }

  // Environmental comfort: decor, plants, lighting and temperature of the current room.
  environment() {
    const room = G.player.room;
    let score = 40;
    let decor = 0;
    for (const inst of G.items.all()) {
      if (inst.data.loc !== 'world' || !inst.data.pos) continue;
      if (roomAt(inst.data.pos[0], inst.data.pos[2]) !== room) continue;
      const c = inst.def.category;
      decor += c === 'plants' ? 4 : c === 'art' ? 4 : c === 'decor' ? 3 : c === 'lighting' ? 3 : c === 'furniture' ? 2 : c === 'collectibles' ? 2 : 0.5;
    }
    score += Math.min(36, decor * 1.3);
    const night = G.sky?.info ? 1 - G.sky.info.daylight : 0;
    const lit = G.state.home.lights[room] || G.items.all().some((i) => i.data.loc === 'world' && i.st.on && i.def.use?.type === 'light' && i.data.pos && roomAt(i.data.pos[0], i.data.pos[2]) === room);
    if (night > 0.5) score += lit ? 8 : -12;
    const t = G.state.home.thermostat;
    const ideal = G.clock.season === 'winter' ? 22 : G.clock.season === 'summer' ? 20 : 21;
    score += 10 - Math.min(20, Math.abs(t - ideal) * 5);
    if (G.player.isSitting) score += G.player.occ?.lying ? 18 : 12;
    if (G.weather?.kind === 'storm' || G.weather?.kind === 'rain') score += 4; // rain is cozy indoors
    return { score: clamp(score, 0, 100), decor };
  }

  update(dt) {
    const mins = dt * (G.state.settings.timeScale || 1) * G.clock.speedMult;
    const v = this.v;
    for (const [k, n] of Object.entries(NEEDS)) {
      if (!n.decay) continue;
      let rate = n.decay * this.decayMult(k);
      if (k === 'energy' && G.player.isSitting) rate *= 0.5;
      if (k === 'fun' && G.games?.active) rate = -2;
      v[k] = clamp(v[k] - rate * mins / 60, 0, 100);
    }
    this._envT -= dt;
    if (this._envT <= 0) { this._envT = 2; this.env = this.environment(); this.comfortTarget = this.env.score; }
    v.comfort = clamp(lerp(v.comfort, this.comfortTarget, 1 - Math.exp(-mins / 60 * 0.6 * (this.comfortTarget > v.comfort ? 1 / this.decayMult('comfort') : this.decayMult('comfort')))), 0, 100);
    // negative moodlets & gentle reminders
    this._checkLow('hunger', 15, 'hangry');
    this._checkLow('hygiene', 12, 'stinky');
    this._checkLow('energy', 10, 'exhausted');
    this._checkLow('fun', 10, 'bored');
    this._checkLow('thirst', 15, null);
    this._checkLow('comfort', 20, null);
    G.state.buffs = G.state.buffs.filter((b) => b.until > G.clock.total - 1);
  }

  _checkLow(k, th, buff) {
    if (this.v[k] < th) {
      if (!this._lowWarned[k]) { this._lowWarned[k] = true; G.ui.toast?.(NEEDS[k].low, { icon: NEEDS[k].icon, kind: 'bad', duration: 4 }); if (buff) this.addBuff(buff, 120); }
    } else if (this.v[k] > th + 15) this._lowWarned[k] = false;
  }

  sleepTick(minutes, quality = 1) {
    const v = this.v;
    v.energy = clamp(v.energy + minutes * 0.2 * quality, 0, 100);
    v.hunger = clamp(v.hunger - minutes * NEEDS.hunger.decay / 60 * 0.45, 0, 100);
    v.thirst = clamp(v.thirst - minutes * NEEDS.thirst.decay / 60 * 0.45, 0, 100);
    v.hygiene = clamp(v.hygiene - minutes * NEEDS.hygiene.decay / 60 * 0.5, 0, 100);
    v.comfort = clamp(v.comfort + minutes * 0.05, 0, 100);
    v.fun = clamp(v.fun + minutes * 0.02, 0, 100);
  }
}
