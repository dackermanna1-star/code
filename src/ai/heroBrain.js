// The black stickman's mind. Layers, highest priority first:
//   1. Defence  - react to attacks he has actually noticed (attention is
//                 limited: reaction delay, blind spots, cognitive load).
//   2. Offence  - pick a target and a move, preferring opportunities the
//                 environment offers (hazards, ledges, crowds behind a target).
//   3. Tactics  - choose where to fight from (walls, corridors, high ground,
//                 hazards) and when to break out or catch his breath.
// Fatigue and injury raise reaction time and decision noise over time.

import { clamp } from '../core/math.js';
import { MOVES } from '../fighter/moves.js';
import { steerTo, surfaceOfFighter, stairsOf } from './steer.js';

const near = [];
const HERO_MOVES = ['jab', 'cross', 'hook', 'uppercut', 'elbow', 'knee', 'teep', 'roundhouse', 'spinkick', 'sweep', 'flyingkick', 'shove', 'grab', 'backkick', 'backelbow'];
const ARMED_MOVES = ['wswing', 'woverhead', 'wthrust', 'teep', 'knee', 'sweep', 'backkick', 'roundhouse', 'grab', 'wthrow'];
const HAZARD_NAMES = { electric: 'the live panel', ledge: 'the drop', window: 'the window', canister: 'the gas canister', stairs: 'the stairs', crowd: 'the crowd' };

export class HeroBrain {
  constructor(f, sim) {
    this.f = f;
    this.sim = sim;
    this.noticed = new Map();
    this.threats = [];
    this.engaged = 0;
    this.engagedFront = 0;
    this.engagedBack = 0;
    this.target = null;
    this.tactic = 'hunt';
    this.mind = 'Sizing them up';
    this.mindT = 0;
    this.anchor = null;
    this.evalT = 0;
    this.blockUntil = 0;
    this.throwPlan = 'hipthrow';
    this.counter = null;
    this.combo = 0;
    this.lastLand = -10;
    this.wantWeapon = null;
    this.dodgeLock = 0;
    this.lastDefense = -10;
    this.lastFlying = -10;
    this.threatClose = false;
  }

  epsilon() {
    const f = this.f;
    return clamp(0.025 + f.fatigue * 0.22 + (1 - f.skill) * 0.25 + (f.hp < f.maxHp * 0.3 ? 0.05 : 0), 0, 0.5);
  }

  say(text, hold = 0.6) {
    this.mind = text;
    this.mindT = hold;
  }

  // ------------------------------------------------------------ callbacks
  onParry(attacker) {
    this.counter = { target: attacker, t: this.sim.time };
  }

  onLanded(target, dmg, down) {
    if (this.sim.time - this.lastLand < 0.9) this.combo++;
    else this.combo = 1;
    this.lastLand = this.sim.time;
    if (this.combo >= 4) this.sim.emit({ t: 'combo', n: this.combo, f: this.f });
    void dmg;
    void down;
  }

  onHit(by) {
    if (by && !by.isHero) this.lastHitBy = by;
  }

  // ------------------------------------------------------------------ main
  update(dt) {
    const f = this.f;
    const it = f.intent;
    if (f.dead || f.removed) return;
    it.action = null;
    it.jump = false;
    if (this.mindT > 0) this.mindT -= dt;
    if (this.dodgeLock > 0) this.dodgeLock -= dt;
    this.perceive();
    it.block = this.sim.time < this.blockUntil && this.threatsAttacking();
    if (f.state === 'held') {
      this.struggle(dt);
      return;
    }
    if (f.ragdolled || f.state === 'grabbed') {
      if (this.mindT <= 0) this.mind = f.dead ? 'Defeated' : 'Down';
      it.mx = 0;
      return;
    }
    this.evalT -= dt;
    if (this.evalT <= 0) {
      this.evaluateTactics();
      this.evalT = 0.35 + this.sim.rng.range(0, 0.25);
    }
    if (this.defend()) return;
    if (it.block) {
      it.mx = 0;
      return;
    }
    if (this.offend()) return;
    this.position(dt);
  }

  threatsAttacking() {
    for (const t of this.threats) if (t.attacking && t.perceived) return true;
    return false;
  }

  // ------------------------------------------------------------ perception
  perceive() {
    const f = this.f;
    const sim = this.sim;
    const rng = sim.rng;
    const R = sim.level.dark ? 470 : sim.level.smoke ? 520 : 680;
    sim.fighterHash.query(f.x, f.y - 40, R, near);
    const threats = this.threats;
    threats.length = 0;
    let engaged = 0;
    let front = 0;
    let back = 0;
    for (const e of near) {
      if (e.isHero || e.removed || e.dead) continue;
      const dx = e.x - f.x;
      const ad = Math.abs(dx);
      const dy = e.y - f.y;
      if (Math.abs(dy) > 160) continue;
      const side = Math.sign(dx) || 1;
      const behind = side !== f.facing;
      const t = { e, dx, ad, dy, side, behind, attacking: false, perceived: false, tth: 9, move: null, down: e.ragdolled };
      if (!e.ragdolled && Math.abs(dy) < 50 && ad < 300) {
        engaged++;
        if (behind) back++;
        else front++;
      }
      if (e.state === 'move' && e.move && (e.move.hits.length || e.move.grab)) {
        const m = e.move;
        const start = m.hits.length ? m.hits[0].t0 : m.grab[0];
        const slow = e.mt < m.windup ? 0.62 + e.skill * 0.38 : 1;
        const rem = (start - e.mt) / Math.max(0.3, e.moveRate * slow);
        const dd = (f.x - e.x) * e.facing;
        const lunge = m.motion.length ? 30 : 0;
        const reach = m.back ? dd < 0 && -dd < -m.range[0] + 25 : dd > -12 && dd < m.range[1] + 26 + lunge;
        const tackling = m.id === 'tackle' && rem < 0.5;
        if ((rem > -0.06 || tackling) && (reach || (tackling && dd > 0 && dd < 260)) && Math.abs(dy) < 60) {
          t.attacking = true;
          t.move = m;
          // a charging tackle lands when the gap closes, not when its window opens
          t.tth = tackling ? Math.max(rem, (ad - 38) / Math.max(200, Math.abs(e.vx))) : rem;
          let rec = this.noticed.get(e.id);
          if (!rec || rec.start !== e.moveStartT) {
            const load = Math.max(0, this.engaged - 3) * 0.12;
            const delay = f.reaction * (1 + f.fatigue * 1.5 + load) * (behind ? 1.6 : 1) * (sim.level.dark ? 1.25 : 1) * rng.range(0.75, 1.25);
            const pMiss = clamp(f.fatigue * 0.28 + Math.max(0, this.engaged - 4) * 0.045 + (behind ? 0.13 : 0.015) - (f.skill - 0.85) * 0.5, 0, 0.65);
            rec = { start: e.moveStartT, at: sim.time + delay, missed: rng.chance(pMiss), handled: false };
            this.noticed.set(e.id, rec);
          }
          t.rec = rec;
          t.perceived = !rec.missed && sim.time >= rec.at;
        }
      }
      threats.push(t);
    }
    this.engaged = engaged;
    this.engagedFront = front;
    this.engagedBack = back;
    let close = false;
    for (const t of threats) if (!t.down && t.ad < 95 && Math.abs(t.dy) < 50) close = true;
    this.threatClose = close;
    if (this.noticed.size > 400) this.noticed.clear();
  }

  // ---------------------------------------------------------------- defence
  defend() {
    const f = this.f;
    const sim = this.sim;
    const rng = sim.rng;
    const it = f.intent;
    let first = null;
    let nFront = 0;
    let nBack = 0;
    for (const t of this.threats) {
      if (!t.attacking || !t.perceived || t.rec.handled || t.tth > 0.42) continue;
      if (t.behind) nBack++;
      else nFront++;
      if (!first || t.tth < first.tth) first = t;
    }
    if (!first) return false;
    if (!f.canAct()) return false;
    const sandwiched = nFront > 0 && nBack > 0;
    const m = first.move;
    const h0 = m.hits.length ? m.hits[0] : null;
    const high = h0 && h0.height === 'high';
    const low = h0 && (h0.height === 'low' || h0.height === 'ground');
    const grab = !!m.grab;
    const tackle = m.id === 'tackle';
    const opts = [];
    const rate = f.computeMoveRate(MOVES.jab);
    const st = f.stamina;
    const startOf = (id) => MOVES[id].hits[0].t0 / rate;
    if (!first.behind) {
      if (first.ad > 16 && first.ad < 60 && startOf('jab') < first.tth - 0.012 && st > 6) opts.push(['jab', 2.0 + f.skill]);
      if (first.ad > 24 && first.ad < 64 && startOf('teep') < first.tth - 0.01 && st > 10) opts.push(['teep', 1.9 + this.envOpportunity(first.e).push]);
      if (!low && !tackle && first.tth < 0.17 / rate && first.tth > 0.015) opts.push(['parry', 2.5 * f.skill]);
      if (grab) opts.push(['backstep', 2.2]);
    } else {
      if (first.ad > 18 && first.ad < 66 && startOf('backkick') < first.tth - 0.01 && st > 10) opts.push(['backkick', 2.4]);
      if (first.ad < 34 && startOf('backelbow') < first.tth - 0.01) opts.push(['backelbow', 2.0]);
    }
    if (high && !grab) opts.push(['duck', sandwiched ? 2.8 : 1.5]);
    if (low) opts.push(['jumpUp', 2.2]);
    if (tackle && !first.behind) {
      // stop the charge: knee to the lowered head, or a push kick at range
      if (Math.abs(startOf('knee') - first.tth) < 0.06) opts.push(['knee', 3.0]);
      if (first.ad < 90 && startOf('teep') < first.tth) opts.push(['teep', 2.6]);
      opts.push(['jumpUp', 1.3]);
    }
    const behindSpace = this.spaceToward(-first.side);
    if (!sandwiched && behindSpace > 90) opts.push(['backstep', 1.4]);
    if ((sandwiched || this.engaged >= 4) && st > 12) opts.push(['roll', 1.7 + (sandwiched ? 1 : 0)]);
    if (sandwiched && st > 16 && first.ad < 150 && first.ad > 40) opts.push(['vault', 1.9]);
    if (!low && !grab && !tackle) opts.push(['block', 1.1 + (st > 30 ? 0.4 : -0.9)]);
    // decision noise: sometimes a worse choice, sometimes frozen
    const eps = this.epsilon();
    if (rng.chance(eps * 0.5)) {
      first.rec.handled = true;
      return false;
    }
    let best = null;
    let bw = -1;
    for (const [id, w] of opts) {
      const ww = w + rng.range(0, eps * 3);
      if (ww > bw) {
        bw = ww;
        best = id;
      }
    }
    if (!best) return false;
    first.rec.handled = true;
    this.lastDefense = sim.time;
    switch (best) {
      case 'block':
        it.face = first.side;
        it.block = true;
        this.blockUntil = sim.time + first.tth + 0.22;
        this.say('Blocking', 0.4);
        break;
      case 'jumpUp':
        it.mx = 0;
        it.jump = true;
        it.jumpVy = f.jumpSpeed * 0.9;
        f.stats.dodges++;
        this.say('Evading', 0.5);
        break;
      case 'roll': {
        const dir = this.lessCrowdedSide();
        it.face = dir;
        it.action = 'roll';
        f.stats.dodges++;
        this.say('Rolling out', 0.6);
        break;
      }
      case 'vault':
        it.face = first.side;
        it.action = 'vault';
        f.stats.dodges++;
        this.say('Vaulting the crowd', 0.7);
        break;
      case 'backkick':
      case 'backelbow':
        it.action = best;
        it.target = first.e;
        this.say('Countering behind', 0.6);
        break;
      default:
        it.face = first.side;
        it.action = best;
        it.target = first.e;
        if (best === 'duck' || best === 'backstep') f.stats.dodges++;
        if (best === 'duck' && sandwiched) this.say('Slipping between them', 0.8);
        else if (best === 'parry') this.say('Parrying', 0.5);
        else if (best === 'jab' || best === 'teep') this.say('Beating him to it', 0.5);
        else this.say('Evading', 0.5);
    }
    return true;
  }

  spaceToward(dir) {
    const f = this.f;
    let space = 300;
    for (const t of this.threats) {
      if (t.down || Math.abs(t.dy) > 40) continue;
      if (Math.sign(t.dx) === dir) space = Math.min(space, t.ad);
    }
    const L = this.sim.level;
    for (let d = 30; d <= 150; d += 30) {
      const x = f.x + dir * d;
      if (L.isSolidAt(x, f.y - 40)) return Math.min(space, d - 20);
      if (!L.groundUnder(x - 3, x + 3, f.y - 4, 40, true, true)) return Math.min(space, d - 25);
    }
    return space;
  }

  lessCrowdedSide() {
    let l = 0;
    let r = 0;
    for (const t of this.threats) {
      if (t.down || t.ad > 260) continue;
      const w = 1 / (40 + t.ad);
      if (t.dx < 0) l += w;
      else r += w;
    }
    const L = this.sim.level;
    const f = this.f;
    if (L.isSolidAt(f.x - 60, f.y - 40)) l += 1;
    if (L.isSolidAt(f.x + 60, f.y - 40)) r += 1;
    return l < r ? -1 : 1;
  }

  // ------------------------------------------------------------ opportunity
  // What lies beyond a target in the direction we would knock it?
  envOpportunity(e, dirOverride) {
    const f = this.f;
    const sim = this.sim;
    const L = sim.level;
    const d = dirOverride || Math.sign(e.x - f.x) || f.facing;
    let push = 0;
    let label = null;
    let best = 0;
    const note = (v, l) => {
      push += v;
      if (v > best) {
        best = v;
        label = l;
      }
    };
    for (const hz of sim.hazards.list) {
      if (hz.type !== 'electric' || Math.abs(hz.y - e.y) > 24) continue;
      const dist = (hz.x - e.x) * d;
      if (dist > 0 && dist < 240) note(1.4 * (1 - dist / 280), 'electric');
    }
    for (const lg of L.ledges) {
      if (Math.abs(lg.y - e.y) > 10) continue;
      const edge = d > 0 ? lg.x0 : lg.x1;
      const dist = (edge - e.x) * d;
      if (dist > -10 && dist < 190) note(1.2 * (1 - dist / 230) * (lg.edge ? 1.4 : 1), 'ledge');
    }
    for (const w of L.windows) {
      if (w.broken || w.kind !== 'glass') continue;
      if (e.y < w.y || e.y > w.y + w.h + 6) continue;
      const dist = (w.x - e.x) * d;
      if (dist > 0 && dist < 220) note(1.15 * (1 - dist / 260), 'window');
    }
    for (const b of sim.props.boxes) {
      if (!b.k.explosive) continue;
      const [cx, cy] = b.center();
      if (Math.abs(cy - (e.y - 22)) > 40) continue;
      const dist = (cx - e.x) * d;
      if (dist > 10 && dist < 200) note(0.8, 'canister');
    }
    let crowd = 0;
    for (const t of this.threats) {
      if (t.e === e || t.down || Math.abs(t.e.y - e.y) > 30) continue;
      const dist = (t.e.x - e.x) * d;
      if (dist > 15 && dist < 230) crowd++;
    }
    if (crowd) note(Math.min(1.1, crowd * 0.32), 'crowd');
    const st = e.groundSolid && e.groundSolid.step ? sim.nav.surfaces[e.groundSolid.surface] : null;
    if (st && st.dir === -d) note(0.6, 'stairs');
    return { push, label, crowd };
  }

  // Value of throwing something behind us (shoulder toss).
  behindValue() {
    const f = this.f;
    const fake = { x: f.x - f.facing * 10, y: f.y };
    return this.envOpportunity(fake, -f.facing).push;
  }

  // ---------------------------------------------------------------- offence
  offend() {
    const f = this.f;
    const sim = this.sim;
    const rng = sim.rng;
    const it = f.intent;
    if (!f.canAct()) return f.state === 'move';
    // counter after a parry
    if (this.counter && sim.time - this.counter.t < 0.6) {
      const c = this.counter.target;
      this.counter = null;
      if (!c.dead && !c.ragdolled) {
        const ad = Math.abs(c.x - f.x);
        it.face = Math.sign(c.x - f.x) || f.facing;
        it.target = c;
        if (ad < 46 && f.stamina > 10) {
          this.chooseThrow(c);
          it.action = 'grab';
          this.say('Turning his attack against him', 1);
        } else {
          it.action = ad < 40 ? 'uppercut' : 'cross';
          this.say('Counter', 0.6);
        }
        return true;
      }
    }
    const cands = this.threats.filter((t) => !t.down && t.ad < 400 && Math.abs(t.dy) < 60 && t.e.state !== 'spawn');
    if (!cands.length) {
      this.target = null;
      return false;
    }
    // target selection
    let best = null;
    let bs = -1e9;
    for (const t of cands) {
      const e = t.e;
      let s = 2.4 - t.ad / 140;
      if (t.attacking) s += 1.2;
      if (e.state === 'hitstun' || e.staggered) s += 1.1;
      if (e.weapon) s += 0.7;
      if (e.personality === 'grappler') s += 0.4;
      if (e.state === 'holding') s += 2;
      if (t.behind) s -= 0.35;
      if (e.hp < e.maxHp * 0.35) s += 0.4;
      if (this.target === e) s += 0.5;
      const env = this.envOpportunity(e);
      s += env.push * 1.1;
      t.env = env;
      s += rng.range(0, this.epsilon() * 2);
      if (s > bs) {
        bs = s;
        best = t;
      }
    }
    this.target = best.e;
    const opts = this.moveOptions(best, cands);
    if (!opts.length) {
      // close the distance (but do not charge blindly into a crowd)
      const e = best.e;
      const want = f.weapon ? 60 : 44;
      steerTo(f, sim, e.x - best.side * want, surfaceOfFighter(e), { run: best.ad > 150, arrive: 6, careful: true });
      it.face = best.side;
      if (this.mindT <= 0) this.mind = this.engaged > 2 ? 'Picking his target' : 'Closing in';
      return true;
    }
    let pick = null;
    let pw = -1;
    for (const [id, w] of opts) {
      const ww = w * rng.range(0.75, 1.25);
      if (ww > pw) {
        pw = ww;
        pick = id;
      }
    }
    const m = MOVES[pick];
    if (!m.back) it.face = best.side;
    it.target = best.e;
    it.mx = 0;
    if (pick === 'grab') this.chooseThrow(best.e);
    if (pick === 'flyingkick') this.lastFlying = this.sim.time;
    it.action = pick;
    if (best.env && best.env.push > 0.6 && (m.crowd || pick === 'grab' || pick === 'teep' || pick === 'shove')) {
      this.say(best.env.label === 'crowd' ? 'Sending him into the crowd' : `Using ${HAZARD_NAMES[best.env.label] || 'the terrain'}`, 1);
    } else if (this.mindT <= 0) {
      this.mind = this.engaged >= 4 ? 'Fighting the crowd' : this.engaged >= 2 ? 'Managing the fight' : 'Pressing the attack';
    }
    return true;
  }

  moveOptions(T, cands) {
    const f = this.f;
    const e = T.e;
    const st = f.stamina;
    const ad = T.ad;
    const env = T.env || { push: 0, crowd: 0 };
    const opts = [];
    const stag = e.state === 'hitstun' || e.staggered;
    const blocking = e.state === 'block';
    let frontCluster = 0;
    for (const t of cands) if (!t.behind && t.ad < 95) frontCluster++;
    let isolated = true;
    for (const t of cands) if (t.e !== e && Math.abs(t.e.x - e.x) < 160) isolated = false;
    const list = f.weapon ? ARMED_MOVES : HERO_MOVES;
    for (const id of list) {
      const m = MOVES[id];
      if (m.weapon && !f.weapon) continue;
      const r = m.range;
      if (m.back) {
        if (!T.behind || ad < -r[1] || ad > -r[0]) continue;
      } else if (ad < r[0] || ad > r[1]) continue;
      if (st < m.stamina * 0.9 && id !== 'jab') continue;
      let w = 1;
      switch (id) {
        case 'jab': w = 1.25; break;
        case 'cross': w = 1.15 + (stag ? 0.5 : 0); break;
        case 'hook': w = 0.85 + (stag ? 0.3 : 0); break;
        case 'uppercut': w = 0.7 + (stag ? 1.0 : 0); break;
        case 'elbow': w = 0.9; break;
        case 'knee': w = 0.9 + (stag ? 0.4 : 0); break;
        case 'teep': w = 0.75 + env.push * 2.6 + (frontCluster >= 2 ? 0.6 : 0); break;
        case 'roundhouse': w = 0.85 + (stag ? 0.7 : 0); break;
        case 'spinkick': w = 0.35 + env.push * 2.2 + (stag ? 0.9 : 0) + (st > 45 ? 0.2 : -0.4); break;
        case 'sweep': w = 0.35 + (frontCluster >= 2 ? 1.1 : 0) + (blocking ? 1.6 : 0); break;
        case 'flyingkick': w = isolated && st > 50 && this.sim.time - this.lastFlying > 6 ? 0.55 : 0; break;
        case 'shove': w = 0.25 + env.push * 2.2; break;
        case 'grab': w = 0.6 + env.push * 1.8 + (blocking ? 1.8 : 0) + this.behindValue() * 1.2; break;
        case 'backkick': w = 1.8 + env.push * 0.5; break;
        case 'backelbow': w = 1.5; break;
        case 'wswing': w = 1.6 + frontCluster * 0.5; break;
        case 'woverhead': w = 0.9 + (stag ? 0.8 : 0); break;
        case 'wthrust': w = 1.0; break;
        case 'wthrow': w = f.weapon && f.weapon.durability <= 2 && isolated ? 2 : 0.05; break;
      }
      if (T.behind && !m.back && this.engagedFront > 0) w *= 0.4; // turning away from others is risky
      if (w > 0.05) opts.push([id, w]);
    }
    return opts;
  }

  chooseThrow(victim) {
    const f = this.f;
    const fwd = this.envOpportunity(victim);
    const back = this.behindValue();
    if (back > fwd.push + 0.25) this.throwPlan = 'shouldertoss';
    else if (fwd.crowd >= 2 && f.stamina > 35) this.throwPlan = 'spinthrow';
    else this.throwPlan = this.sim.rng.chance(0.7) ? 'hipthrow' : 'shouldertoss';
  }

  // ----------------------------------------------------------------- tactics
  evaluateTactics() {
    const f = this.f;
    const sim = this.sim;
    const L = sim.level;
    const nav = sim.nav;
    const cur = surfaceOfFighter(f);
    const enemies = sim.enemies;
    let threatsNear = 0;
    let incoming = 0;
    for (const e of enemies) {
      if (e.dead || e.ragdolled || e.removed) continue;
      const d = Math.abs(e.x - f.x) + Math.abs(e.y - f.y) * 1.5;
      if (d < 420) threatsNear++;
      if (d < 1100) incoming++;
    }
    this.threatsNear = threatsNear;
    const lowHp = f.hp < f.maxHp * 0.25;
    if (threatsNear === 0 && incoming === 0) {
      this.tactic = 'recover';
      // grab a weapon or move to a strong spot while it is quiet
      const w = !f.weapon ? sim.props.nearestWeapon(f.x, f.y, 420) : null;
      this.wantWeapon = w;
      this.anchor = this.bestPosition(cur, 0.6);
      return;
    }
    if (!f.weapon && threatsNear <= 1 && !this.threatClose && sim.time - (this.lastPickup || -10) > 4) {
      const w = sim.props.nearestWeapon(f.x, f.y, 240);
      this.wantWeapon = w && Math.abs((w.p[0].x + w.p[1].x) / 2 - f.x) < 240 && (w.weapon.kind !== 'plank' || threatsNear === 0) ? w : null;
    } else this.wantWeapon = null;
    if ((f.stamina < 20 || lowHp) && threatsNear >= 2) {
      this.tactic = 'breakout';
      this.anchor = this.bestPosition(cur, 2.2);
      return;
    }
    if (threatsNear <= 2 && f.stamina > 30 && !lowHp && incoming < 6) {
      this.tactic = 'hunt';
      this.anchor = null;
      return;
    }
    this.tactic = 'hold';
    const cand = this.bestPosition(cur, 1);
    if (!this.anchor || cand.score > this.anchor.score + 0.3 || Math.abs(this.anchor.x - f.x) > 900) this.anchor = cand;
    else this.anchor.score = this.scorePosition(this.anchor.x, this.anchor.y, this.anchor.surf, cur, 1).score;
    void nav;
    void L;
  }

  bestPosition(cur, crowdFear) {
    const f = this.f;
    const sim = this.sim;
    const nav = sim.nav;
    let best = { x: f.x, y: f.y, surf: cur, score: -1e9, label: '' };
    const consider = (x, y, surf, extra) => {
      const r = this.scorePosition(x, y, surf, cur, crowdFear);
      r.score += extra || 0;
      if (r.score > best.score) best = r;
    };
    consider(f.x, f.y, cur, 0.15);
    for (const S of nav.surfaces) {
      if (S.isolated) continue;
      if (cur >= 0 && S.id !== cur && nav.dist[cur][S.id] > 4.5) continue;
      if (S.type === 'stairs') {
        const x = S.xTop - S.dir * 50;
        const y = S.yTop + 50 * (S.yBottom - S.yTop) / Math.abs(S.xTop - S.xBottom || 1);
        if (Math.abs(x - f.x) < 1200) consider(x, y, S.id, 0);
        continue;
      }
      const step = 80;
      for (let x = S.x0 + 34; x <= S.x1 - 34; x += step) {
        if (Math.abs(x - f.x) > 1100) continue;
        consider(x, S.y, S.id, 0);
      }
    }
    return best;
  }

  scorePosition(x, y, surf, cur, crowdFear) {
    const f = this.f;
    const sim = this.sim;
    const L = sim.level;
    const S = sim.nav.surfaces[surf];
    let score = 0;
    const tags = [];
    // walls covering a flank
    const wallL = L.isSolidAt(x - 44, y - 50);
    const wallR = L.isSolidAt(x + 44, y - 50);
    if (wallL || wallR) {
      score += 1.0;
      tags.push('wall');
    }
    // low ceilings stop jump-ins and flying kicks
    for (const w of L.walls) {
      if (w.type === 'lowCeiling' && Math.abs(w.y - y) < 4 && x > w.x0 && x < w.x1) {
        score += 0.45;
        tags.push('corridor');
      }
    }
    for (const d of L.doorways) {
      if (Math.abs(d.y - y) < 4 && Math.abs(d.x - x) < 46) {
        score += 0.35;
        tags.push('corridor');
      }
    }
    // enemies: below us (high ground), around the spot, between us and it
    let below = 0;
    let total = 0;
    let close = 0;
    let between = 0;
    let sideL = 0;
    let sideR = 0;
    for (const e of sim.enemies) {
      if (e.dead || e.ragdolled || e.removed) continue;
      const dx = e.x - x;
      const d = Math.abs(dx) + Math.abs(e.y - y);
      if (d > 950) continue;
      total++;
      if (e.y > y + 50) below++;
      if (Math.abs(dx) < 170 && Math.abs(e.y - y) < 70) close++;
      if (dx < 0) sideL += 1 / (60 + d);
      else sideR += 1 / (60 + d);
      if (Math.abs(e.y - f.y) < 50 && (e.x - f.x) * (x - f.x) > 0 && Math.abs(e.x - f.x) < Math.abs(x - f.x)) between++;
    }
    if (S && S.type === 'stairs' && total) {
      score += 0.9 * (below / total);
      tags.push('high');
    } else if (total && below / total > 0.5 && S && S.type !== 'stairs') {
      score += 0.5;
      tags.push('high');
    }
    score -= close * 0.42 * crowdFear;
    score -= between * 0.38 * crowdFear;
    // hazards: leverage toward the enemies' side, danger right next to us
    const enemySide = sideL > sideR ? -1 : 1;
    for (const hz of sim.hazards.list) {
      if (hz.type !== 'electric' || Math.abs(hz.y - y) > 20) continue;
      const dd = (hz.x - x) * enemySide;
      const ad = Math.abs(hz.x - x);
      if (ad < 80) score -= 1.4;
      else if (dd > 60 && dd < 240) {
        score += 0.7;
        tags.push('hazard');
      }
    }
    for (const lg of L.ledges) {
      if (Math.abs(lg.y - y) > 8) continue;
      const dist = x < lg.x0 ? lg.x0 - x : x > lg.x1 ? x - lg.x1 : 0;
      if (dist < 110) score -= (lg.edge ? 1.7 : 1.1) * (1 - dist / 110);
    }
    for (const w of L.windows) {
      if (w.broken || w.kind !== 'glass') continue;
      if (y < w.y || y > w.y + w.h + 6) continue;
      if (Math.abs(w.x - x) < 110) score -= 0.9;
    }
    const travel = Math.abs(x - f.x) + (surf !== cur ? 260 : 0);
    score -= travel / 650;
    let label = 'Holding position';
    if (tags.includes('high')) label = 'Taking the high ground';
    else if (tags.includes('corridor')) label = 'Holding the corridor';
    else if (tags.includes('wall')) label = 'Back to the wall';
    else if (tags.includes('hazard')) label = 'Drawing them toward the hazard';
    return { x, y, surf, score, label };
  }

  // -------------------------------------------------------------- movement
  position() {
    const f = this.f;
    const sim = this.sim;
    const it = f.intent;
    let nearest = null;
    for (const t of this.threats) {
      if (t.down || Math.abs(t.dy) > 60) continue;
      if (!nearest || t.ad < nearest.ad) nearest = t;
    }
    let tx = f.x;
    let ts = surfaceOfFighter(f);
    let run = false;
    f.stance = 'guard';
    if (this.wantWeapon && sim.props.sticks.includes(this.wantWeapon)) {
      const w = this.wantWeapon;
      tx = (w.p[0].x + w.p[1].x) / 2;
      ts = -1;
      run = Math.abs(tx - f.x) > 100;
      if (Math.abs(tx - f.x) < 22 * f.scale && f.canAct()) {
        it.action = 'pickup';
        this.wantWeapon = null;
        this.lastPickup = sim.time;
        this.say(`Picks up the ${w.weapon.label}`, 1.2);
        return;
      }
      if (this.mindT <= 0) this.mind = `Going for the ${w.weapon.label}`;
    } else if (this.anchor && (this.tactic === 'hold' || this.tactic === 'breakout' || this.tactic === 'recover')) {
      tx = this.anchor.x;
      ts = this.anchor.surf;
      run = this.tactic === 'breakout' || Math.abs(tx - f.x) > 260;
      if (this.mindT <= 0) {
        if (this.tactic === 'breakout') this.mind = 'Breaking out';
        else if (this.tactic === 'recover') this.mind = f.fatigue > 0.25 || f.stamina < 70 ? 'Catching his breath' : 'Waiting for the next wave';
        else this.mind = this.anchor.label;
      }
    } else if (this.tactic === 'hunt' && nearest) {
      tx = nearest.e.x - nearest.side * 50;
      ts = surfaceOfFighter(nearest.e);
      run = nearest.ad > 220;
      if (this.mindT <= 0) this.mind = 'Hunting';
    } else if (this.tactic === 'hunt') {
      // nobody close: go towards the nearest enemy anywhere
      let ne = null;
      let nd = 1e9;
      for (const e of sim.enemies) {
        if (e.dead || e.ragdolled || e.removed) continue;
        const d = Math.abs(e.x - f.x) + Math.abs(e.y - f.y) * 2;
        if (d < nd) {
          nd = d;
          ne = e;
        }
      }
      if (ne) {
        tx = ne.x;
        ts = surfaceOfFighter(ne);
        run = nd > 300;
        if (this.mindT <= 0) this.mind = 'Hunting';
      }
    }
    steerTo(f, sim, tx, ts, { run, arrive: 14, careful: true });
    if (nearest && nearest.ad < 320) {
      it.face = nearest.side;
      if (it.mx === -nearest.side) it.run = false; // backpedal, eyes on the threat
    } else if (it.mx) it.face = it.mx;
    const calm = !nearest || nearest.ad > 340;
    if (calm && it.mx === 0) f.stance = f.fatigue > 0.25 || f.stamina < 55 ? 'tired' : 'relaxed';
    if (f.hp < f.maxHp * 0.2 && this.mindT <= 0 && !calm) this.mind = 'Last stand';
  }

  // ------------------------------------------------------------- grappled
  struggle() {
    const f = this.f;
    const g = f.grabbedBy;
    const it = f.intent;
    it.mx = 0;
    if (this.mindT <= 0) this.mind = 'Grabbed! Struggling free';
    if (!g) return;
    const need = 0.85 + g.strength * 0.35 - f.skill * 0.3 + f.fatigue * 0.9;
    if (f.holdStruggle < need) return;
    const rng = this.sim.rng;
    g.releaseHold();
    f.setState('ground');
    if (f.stamina > 14 && rng.chance(0.5 + f.skill * 0.3)) {
      // reversal: face away from the grappler and haul him over the shoulder
      f.facing = Math.sign(f.x - g.x) || f.facing;
      f.attachVictim(g, 'reversal');
      this.say('Reversal!', 1.2);
      this.sim.emit({ t: 'feed', text: `Onyx reverses ${g.name}'s hold`, level: 2 });
    } else {
      it.action = 'backelbow';
      this.say('Breaks free', 0.8);
      this.sim.emit({ t: 'feed', text: `Onyx elbows free of ${g.name}`, level: 1 });
    }
  }
}
