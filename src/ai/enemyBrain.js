// Enemy behaviour. Personalities differ in aggression, patience, courage and
// intelligence; an attack-token system keeps most of the crowd circling while
// a few engage, which reads as choreography without scripting anything.

import { clamp } from '../core/math.js';
import { MOVES, STYLES } from '../fighter/moves.js';
import { steerTo, surfaceOfFighter } from './steer.js';

const near = [];

export class EnemyBrain {
  constructor(f, sim, spec) {
    this.f = f;
    this.sim = sim;
    this.courage = spec.courage;
    this.baseCourage = spec.courage;
    this.usesTokens = spec.usesTokens;
    this.thinkT = sim.rng.range(0, 0.4);
    this.mode = 'approach';
    this.waitDist = clamp(110 + (1 - f.aggression) * 120 + (1 - spec.courage) * 60, 100, 280);
    this.circleDir = sim.rng.sign();
    this.circleT = sim.rng.range(0.6, 2);
    this.cooldown = sim.rng.range(0.3, 1.2);
    this.planned = null;
    this.reactFor = null;
    this.reactT = 0;
    this.tauntT = 0;
    this.blockT = 0;
    this.hopT = 0;
    this.token = false;
    this.lastAttack = -10;
    this.pickupTarget = null;
    this.seenKO = 0;
  }

  get hero() {
    return this.sim.hero;
  }

  onHit(by, dmg) {
    if (by && by.isHero) {
      this.courage = Math.max(0, this.courage - dmg * 0.004 * (1 - this.f.aggression));
      this.thinkT = Math.min(this.thinkT, 0.1);
    }
  }

  onWitnessKO(dist) {
    const f = this.f;
    if (f.personality === 'berserker' || f.personality === 'brute') return;
    this.courage = Math.max(0, this.courage - (0.09 * (1 - f.aggression * 0.6)) * clamp(1 - dist / 500, 0, 1));
  }

  update(dt) {
    const f = this.f;
    const sim = this.sim;
    const it = f.intent;
    if (f.dead || f.removed || f.state === 'spawn') return;
    const hero = this.hero;
    this.courage = Math.min(this.baseCourage, this.courage + dt * 0.02);
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.blockT > 0) this.blockT -= dt;
    it.block = this.blockT > 0;
    if (!hero || hero.removed) {
      it.mx = 0;
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.think();
      const far = Math.abs(hero.x - f.x) > 700 ? 1.8 : 1;
      this.thinkT = f.reaction * sim.rng.range(0.6, 1.25) * far;
    }
    this.react(dt);
    this.act(dt);
  }

  // ------------------------------------------------------------- decisions
  think() {
    const f = this.f;
    const sim = this.sim;
    const hero = this.hero;
    const dist = Math.abs(hero.x - f.x);
    const dy = Math.abs(hero.y - f.y);
    const hs = surfaceOfFighter(hero);
    const fs = surfaceOfFighter(f);
    const same = (hs === fs && hs >= 0) || (dy < 40 && dist < 260);
    const heroDown = hero.ragdolled && !hero.dead;
    const heroHeld = hero.state === 'held';
    const vision = sim.level.dark ? 480 : sim.level.smoke ? 420 : 9999;
    this.dist = dist;
    this.same = same;

    if (dist > vision && !same) {
      this.mode = 'search';
      this.releaseToken();
      return;
    }
    if (f.personality === 'weapon' && !f.weapon && dist > 220) {
      const w = sim.props.nearestWeapon(f.x, f.y, 520);
      if (w) {
        this.mode = 'pickup';
        this.pickupTarget = w;
        return;
      }
    }
    if (f.ammo > 0 && same && dist > 170 && dist < 540 && !heroDown && this.cooldown <= 0) {
      this.mode = 'throw';
      return;
    }
    if (!same || dist > 380) {
      this.mode = 'approach';
      this.releaseToken();
      return;
    }
    // morale
    if (this.courage < 0.12 && !heroDown && !heroHeld) {
      this.mode = 'flee';
      this.releaseToken();
      return;
    }
    const behind = Math.sign(f.x - hero.x) !== hero.facing;
    let priority = f.aggression + (behind ? 0.6 * f.intelligence : 0) + (heroDown ? 0.5 : 0) + (heroHeld ? 0.9 : 0) - dist / 900 + sim.rng.range(0, 0.3);
    if (f.personality === 'flanker' && behind) priority += 0.5;
    let go = false;
    if (!this.usesTokens || heroHeld || (heroDown && f.aggression > 0.4)) go = true;
    else go = sim.tokens.request(f, priority);
    if (f.personality === 'hesitant' && !heroDown && !heroHeld && sim.rng.chance(0.5)) {
      const busy = hero.state === 'move' || hero.state === 'held';
      if (!busy || !behind) go = false;
    }
    if (go && this.cooldown <= 0) {
      this.mode = 'attack';
      this.token = true;
      this.planAttack(dist, heroDown, heroHeld);
    } else {
      this.mode = 'wait';
      if (!go) this.token = false;
    }
  }

  planAttack(dist, heroDown, heroHeld) {
    const f = this.f;
    const rng = this.sim.rng;
    if (heroDown) {
      this.planned = 'groundkick';
      return;
    }
    if (f.weapon) {
      this.planned = rng.weighted([['wswing', 3], ['woverhead', 1.5], ['wthrust', 1.5]]);
      return;
    }
    const style = STYLES[f.style] || STYLES.balanced;
    let opts = style.filter(([id]) => {
      const m = MOVES[id];
      if (!m || m.heroOnly) return false;
      if (heroHeld && (id === 'bearhug' || id === 'tackle')) return false;
      if (id === 'flyingkick' || id === 'tackle') return dist > 90;
      return true;
    });
    if (!opts.length) opts = [['jab', 1]];
    // prefer moves that reach from here
    opts = opts.map(([id, w]) => {
      const r = MOVES[id].range;
      const fits = dist >= r[0] - 10 && dist <= r[1] + 40;
      return [id, w * (fits ? 2.2 : 1)];
    });
    if (f.personality === 'rusher' && dist > 100 && rng.chance(0.4)) this.planned = 'tackle';
    else this.planned = rng.weighted(opts);
  }

  releaseToken() {
    if (this.token) this.sim.tokens.release(this.f);
    this.token = false;
  }

  // Watch the hero's attacks and respond after our reaction time.
  react(dt) {
    const f = this.f;
    const hero = this.hero;
    if (hero.state !== 'move' || !hero.move || !hero.move.hits.length) {
      this.reactFor = null;
      return;
    }
    if (this.reactFor === hero.move && this.reactDone) return;
    if (this.reactFor !== hero.move) {
      this.reactFor = hero.move;
      this.reactT = 0;
      this.reactDone = false;
    }
    this.reactT += dt;
    if (this.reactT < f.reaction * 0.8) return;
    this.reactDone = true;
    const m = hero.move;
    const d = (f.x - hero.x) * hero.facing;
    const inRange = m.back ? d < 0 && -d < -m.range[0] + 30 : d > 0 && d < m.range[1] + 30;
    if (!inRange) return;
    if (!f.canAct()) return;
    const rng = this.sim.rng;
    if (rng.chance(f.skill * 0.5) && Math.sign(hero.x - f.x) === f.facing) {
      this.blockT = Math.max(0.25, (m.dur - hero.mt) / hero.moveRate);
      f.intent.block = true;
    } else if (rng.chance(f.agility * 0.12 + (1 - this.courage) * 0.1)) {
      f.intent.action = 'backstep';
    }
  }

  // ------------------------------------------------------------- execution
  act(dt) {
    const f = this.f;
    const sim = this.sim;
    const hero = this.hero;
    const it = f.intent;
    const hs = surfaceOfFighter(hero);
    const dx = hero.x - f.x;
    const dist = Math.abs(dx);
    const side = Math.sign(f.x - hero.x) || 1;
    f.lookTarget = hero;
    f.stance = 'guard';
    it.target = hero;

    switch (this.mode) {
      case 'search': {
        const err = Math.sin(sim.time * 0.3 + f.id) * 260;
        steerTo(f, sim, hero.x + err, hs, { run: false });
        f.stance = 'relaxed';
        break;
      }
      case 'approach': {
        steerTo(f, sim, hero.x - side * 0, hs, { run: true, arrive: 60 });
        if (dist < 400 && it.mx !== 0) it.face = Math.sign(dx);
        else it.face = it.mx || 0;
        break;
      }
      case 'pickup': {
        const w = this.pickupTarget;
        if (!w || w.held || !sim.props.sticks.includes(w)) {
          this.mode = 'approach';
          break;
        }
        const wx = (w.p[0].x + w.p[1].x) / 2;
        steerTo(f, sim, wx, -1, { run: true, arrive: 10 });
        it.face = it.mx || f.facing;
        if (Math.abs(wx - f.x) < 26 * f.scale && f.canAct()) {
          it.action = 'pickup';
          this.mode = 'approach';
          this.thinkT = 0.5;
        }
        break;
      }
      case 'throw': {
        it.mx = 0;
        it.face = Math.sign(dx) || f.facing;
        if (f.canAct() && f.facing === Math.sign(dx)) {
          it.action = 'throwobj';
          f.ammo--;
          this.cooldown = sim.rng.range(1.2, 2.4);
          this.mode = 'wait';
          this.thinkT = 0.8;
        }
        break;
      }
      case 'flee': {
        const tx = hero.x + side * 420;
        steerTo(f, sim, tx, surfaceOfFighter(f), { run: true, careful: true });
        it.face = -side;
        f.stance = 'guard';
        break;
      }
      case 'wait': {
        this.circleT -= dt;
        if (this.circleT <= 0) {
          this.circleDir = -this.circleDir;
          this.circleT = sim.rng.range(0.5, 1.6);
          if (sim.rng.chance(0.18 * (1 - f.intelligence))) this.tauntT = sim.rng.range(0.8, 1.6);
        }
        let want = this.waitDist + this.circleDir * 22;
        // crowd: if allies already sit at my slot, hang back a little further
        const tx = hero.x + side * want;
        steerTo(f, sim, tx, hs, { run: Math.abs(tx - f.x) > 160, arrive: 14, careful: true });
        it.face = Math.sign(dx) || f.facing;
        if (this.tauntT > 0) {
          this.tauntT -= dt;
          if (it.mx === 0) f.stance = 'taunt';
        }
        // agile flankers leap over a busy hero to get behind him
        const behind = side !== hero.facing;
        if (f.personality === 'flanker' && !behind && dist < 130 && dist > 60 && hero.state === 'move' && f.canAct() && sim.rng.chance(dt * 1.5)) {
          it.face = Math.sign(dx);
          it.action = 'hop';
        }
        break;
      }
      case 'attack': {
        const m = MOVES[this.planned] || MOVES.jab;
        const r = m.range;
        const want = (r[0] + r[1]) * 0.5;
        if (this.planned === 'groundkick' && !(hero.state === 'down' || hero.state === 'ragdoll')) {
          this.mode = 'wait';
          this.thinkT = 0;
          break;
        }
        if (!f.canAct() && f.state !== 'ground') {
          it.mx = 0;
          break;
        }
        it.face = Math.sign(dx) || f.facing;
        if (dist > r[1]) {
          steerTo(f, sim, hero.x + side * want, hs, { run: dist > 140, arrive: 4 });
        } else if (dist < r[0]) {
          it.mx = side;
          it.run = false;
        } else {
          it.mx = 0;
          if (f.facing === Math.sign(dx) && f.canAct()) {
            if (this.allyInTheWay(dist) && sim.rng.chance(f.intelligence)) {
              this.mode = 'wait';
              this.releaseToken();
              this.cooldown = 0.4;
              break;
            }
            it.action = this.planned;
            this.lastAttack = sim.time;
            // hit-and-run vs keep pressing
            if (sim.rng.chance(0.35 + f.aggression * 0.45)) {
              this.planAttack(dist, false, hero.state === 'held');
              this.cooldown = sim.rng.range(0.05, 0.35) / (0.5 + f.aggression);
              this.thinkT = Math.max(this.thinkT, 0.25);
            } else {
              this.mode = 'wait';
              this.releaseToken();
              this.cooldown = sim.rng.range(0.35, 1.1) * (1.35 - f.aggression);
            }
          }
        }
        break;
      }
    }
  }

  allyInTheWay(dist) {
    const f = this.f;
    const hero = this.hero;
    this.sim.fighterHash.query((f.x + hero.x) / 2, f.y - 40, dist / 2 + 10, near);
    for (const o of near) {
      if (o === f || o.isHero || o.dead || o.ragdolled) continue;
      if (Math.abs(o.y - f.y) > 30) continue;
      if ((o.x - f.x) * Math.sign(hero.x - f.x) > 6 && Math.abs(o.x - f.x) < dist - 6) return true;
    }
    return false;
  }
}

// Limits how many enemies commit to attacks at the same time.
export class TokenManager {
  constructor(sim) {
    this.sim = sim;
    this.holders = new Map();
    this.max = 2;
  }

  update() {
    const S = this.sim.settings;
    const lvl = this.sim.director.level;
    this.max = Math.max(1, Math.round(1.6 + lvl * 1.3 + (S.enemyIntelligence - 1) * 1.2 + (S.enemyAggression - 1) * 2.5));
    const now = this.sim.time;
    for (const [f, t] of this.holders) {
      if (f.dead || f.removed || now - t > 3.2 || Math.abs(f.x - this.sim.hero.x) > 420) this.holders.delete(f);
    }
  }

  request(f, priority) {
    if (this.holders.has(f)) return true;
    if (this.holders.size < this.max) {
      this.holders.set(f, this.sim.time);
      f._tokPri = priority;
      return true;
    }
    // bump the weakest claim if ours is clearly stronger
    let worst = null;
    let wp = Infinity;
    for (const [o] of this.holders) {
      if ((o._tokPri || 0) < wp) {
        wp = o._tokPri || 0;
        worst = o;
      }
    }
    if (worst && priority > wp + 0.35) {
      this.holders.delete(worst);
      if (worst.brain) worst.brain.token = false;
      this.holders.set(f, this.sim.time);
      f._tokPri = priority;
      return true;
    }
    return false;
  }

  release(f) {
    this.holders.delete(f);
  }
}
