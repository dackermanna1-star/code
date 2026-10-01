// CPU opponents. The AI only drives a virtual controller, so it must obey the
// same rules (motions, frame data, meter) as a human. Difficulty controls
// reaction time, defense, anti-airs, punishes, combo length and meter use.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN;

  const LEVELS = {
    easy: { bf: 0, react: 30, block: 0.22, antiair: 0.1, punish: 0.1, combo: 1, specials: 0.25, supers: 0.08, aggr: 0.35, tech: 0.1, perfect: 0.1, mash: 0.2, parry: 0, jump: 0.15 },
    normal: { bf: 0.04, react: 20, block: 0.5, antiair: 0.35, punish: 0.35, combo: 2, specials: 0.45, supers: 0.3, aggr: 0.5, tech: 0.4, perfect: 0.3, mash: 0.5, parry: 0.02, jump: 0.12 },
    hard: { bf: 0.1, react: 14, block: 0.74, antiair: 0.62, punish: 0.68, combo: 3, specials: 0.58, supers: 0.65, aggr: 0.55, tech: 0.7, perfect: 0.55, mash: 0.8, parry: 0.05, jump: 0.1 },
    extreme: { bf: 0.2, react: 10, block: 0.88, antiair: 0.85, punish: 0.9, combo: 4, specials: 0.66, supers: 0.85, aggr: 0.6, tech: 0.9, perfect: 0.75, mash: 1, parry: 0.08, jump: 0.08 },
    boss: { bf: 0.35, react: 7, block: 0.94, antiair: 0.94, punish: 1, combo: 4, specials: 0.7, supers: 1, aggr: 0.85, tech: 1, perfect: 0.9, mash: 1, parry: 0.12, jump: 0.1 },
  };
  JJK.AI_LEVELS = LEVELS;

  // Combo routes (ids of moves), executed on hit-confirm.
  const ROUTES = {
    gojo: {
      basic: ['5L', '5M', '5H', 'red'],
      low: ['2L', '2M', 'redLaunch'],
      launch: ['5M', '2H', 'J', 'jM', 'jH'],
      meter: ['5M', '5H', 'maxRed'],
      pull: ['bluePull', '5M', '5H', 'redLaunch'],
      cancelSpecial: { red: '214SP', redLaunch: '2SP', maxRed: '214SU', blueCrush: '236SU', bluePull: '5SP' },
    },
    sukuna: {
      basic: ['5L', '5M', '5H', 'cleave'],
      low: ['2L', '2M', 'dismantle'],
      launch: ['5M', '2H', 'J', 'jM', 'jH'],
      meter: ['5M', '5H', 'enhancedCleave'],
      cancelSpecial: { cleave: '214SP', dismantle: '236SP', enhancedCleave: '214SU', cross: '2SP', lunge: '6SP' },
    },
  };

  class AI {
    constructor(f, level) {
      this.f = f;
      this.level = level;
      this.p = LEVELS[level] || LEVELS.normal;
      // rushdown needs more execution than zoning: at the lower tiers CPU Sukuna is
      // blended toward the next tier so each difficulty feels similar for both characters
      const order = ['easy', 'normal', 'hard', 'extreme', 'boss'];
      const li = order.indexOf(level);
      if (f.def.id === 'sukuna' && li >= 0 && li < 3) {
        const a = this.p, b = LEVELS[order[li + 1]], k = 0.6;
        const mix = {};
        for (const key in a) mix[key] = a[key] + (b[key] - a[key]) * k;
        mix.combo = Math.round(mix.combo);
        this.p = mix;
      }
      this.plan = [];
      this.cool = 0;
      this.t = 0;
      this.route = null;
      this.ri = 0;
      this.holdSU = false;
      this.holdSP = false;
      this.holdT = 0;
      this.aim = null;
      this.wantSimple = false;
      this.seenAttack = 0;
      this.habit = { jumps: 0, projectiles: 0, approaches: 0 };
      this.blockT = 0;
      this.blockDir = 4;
      this.clashDone = false;
      this.rng = U.makeRng(((Math.random() * 1e9) | 0) + f.side);
    }
    r() { return this.rng(); }

    // Emit the virtual controller frame.
    emit(rel, held) {
      const f = this.f;
      const abs = f.facing > 0 ? rel : JJK.mirrorDir(rel);
      f.ctrl.virtual = { dir: abs, held: held | 0 };
    }

    // Queue a command string, e.g. '236SP', '5L', '2M', 'LM', 'MH', '66', 'SPSU', 'j', 'jH'
    cmd(s) {
      const steps = [];
      if (s === 'J') { steps.push({ d: 8 }, { d: 8 }, { d: 8 }, { d: 8 }); this.plan.push(...steps); return; }
      if (s === 'JF') { steps.push({ d: 9 }, { d: 9 }, { d: 9 }, { d: 9 }); this.plan.push(...steps); return; }
      if (s === '66' || s === '44') {
        const d = +s[0];
        steps.push({ d }, { d: 5 }, { d });
        this.plan.push(...steps);
        return;
      }
      let air = false;
      if (s[0] === 'j') { air = true; s = s.slice(1); }
      const m = s.match(/^(\d*)(L|M|H|SP|SU|UN|LM|MH|SPSU)$/);
      if (!m) return;
      let digits = m[1] || '5';
      const btn = { L: B.L, M: B.M, H: B.H, SP: B.SP, SU: B.SU, UN: B.UN, LM: B.L | B.M, MH: B.M | B.H, SPSU: B.SP | B.SU }[m[2]];
      for (let i = 0; i < digits.length - 1; i++) steps.push({ d: +digits[i] });
      const last = +digits[digits.length - 1];
      steps.push({ d: last, b: btn });
      steps.push({ d: last === 5 || air ? 5 : last });
      this.plan.push(...steps);
    }
    hold(rel, n) { for (let i = 0; i < n; i++) this.plan.push({ d: rel }); }

    think(m) {
      const f = this.f, o = m.opp(f);
      this.t++;
      if (this.holdT > 0) { this.holdT--; if (this.holdT === 0) { this.holdSU = false; this.holdSP = false; } }
      // follow the current plan
      if (this.plan.length) {
        const s = this.plan.shift();
        this.emit(s.d, s.b || 0);
        return;
      }
      this.emit(5, 0);
      if (m.clash) return;
      // dizzy: mash
      if (f.st === 'dizzy') {
        if (this.r() < this.p.mash * 0.5) this.emit(5, (this.t % 2) ? B.L : B.M);
        if (m.simplePrompt && m.simplePrompt.f === f && f.meter >= 100 && this.r() < this.p.supers) this.wantSimple = true;
        return;
      }
      if (m.simplePrompt && m.simplePrompt.f === f && f.meter >= 100 && this.r() < this.p.supers * 0.1) this.wantSimple = true;
      // knockdown: tech roll
      if (f.st === 'down' && f.sf === 4 && this.r() < this.p.tech) { this.emit(4, B.L); return; }
      // grabbed: tech
      if (f.st === 'grabbed' && f.techWindow > 0 && f.sf >= Math.max(2, 10 - this.p.react / 3) && this.r() < this.p.tech * 0.7) { this.emit(5, B.L | B.M); return; }
      // air combo after a jump cancel
      if (this.route && this.route[this.ri] === 'J' && f.st === 'air') {
        if (f.sf >= 4 && f.vy < 6) { this.ri++; const nx = this.route[this.ri]; if (nx) this.issue(f, nx); else this.route = null; }
        return;
      }
      // continue a combo on hit-confirm
      if (f.st === 'move') { this.comboStep(m, f, o); return; }
      if (f.st === 'block' || f.st === 'ablock') {
        // keep blocking; maybe parry next hit or reversal on wake
        this.emit(this.blockDir, 0);
        return;
      }
      if (!f.actionable && f.st !== 'air') return;
      // track opponent attack for reaction time
      const oAtt = o.st === 'move' && o.move && o.move.hits && o.phase !== 'recovery';
      if (oAtt) this.seenAttack++; else this.seenAttack = 0;
      const dist = Math.abs(o.x - f.x);
      // keep blocking for a short while after deciding to block
      if (this.blockT > 0) { this.blockT--; this.emit(this.blockDir, 0); return; }
      // ---- defense
      const proj = this.incomingProj(m);
      if (oAtt && dist < 230 && this.seenAttack >= Math.max(1, this.p.react - (o.move.s || 8) * 0.6)) {
        if (this.r() < this.p.block) {
          const g = o.move.hits[0].guard;
          const readGuard = this.level !== 'easy' && this.r() < this.p.block;
          this.blockDir = readGuard ? (g === 'low' ? 1 : 4) : this.r() < 0.5 ? 1 : 4;
          this.blockT = 10 + Math.floor(this.r() * 12);
          if (this.r() < this.p.parry && dist < 120) { this.cmd('MH'); this.blockT = 0; return; }
          // Gojo: switch on Infinity under pressure
          if (f.def.id === 'gojo' && !f.cs.infOn && f.cs.inf > 60 && this.r() < this.p.specials * 0.25) { this.plan.push({ d: 4, b: B.UN }); return; }
          this.emit(this.blockDir, 0);
          return;
        }
      }
      // answer zoning: jump over low projectiles, trade, or counter
      if (proj && proj.dist > 110 && proj.dist < 300 && f.onGround && f.actionable) {
        const x = this.r();
        if (x < this.p.jump * 2.2 && proj.y < 130) { this.cmd('JF'); return; }
        if (f.def.id === 'sukuna' && !f.cs.da && f.burnout <= 0 && x < this.p.specials * 0.5) { this.cmd(f.meter >= 50 && this.r() < this.p.supers * 0.3 ? '4SU' : '236SP'); return; }
      }
      if (proj && proj.dist < 200) {
        if (f.def.id === 'gojo' && !f.cs.infOn && f.cs.inf > 40 && this.r() < this.p.specials * 0.4) { this.plan.push({ d: 5, b: B.UN }); return; }
        if (this.r() < this.p.block * 0.8) { this.blockDir = 4; this.blockT = 14; this.emit(4, 0); return; }
        if (this.r() < this.p.jump && proj.y < 120) { this.cmd('JF'); return; }
      }
      // ---- anti-air
      if (o.y > 30 && o.st !== 'juggle' && dist < 170 && Math.sign(o.vx || f.x - o.x) === Math.sign(f.x - o.x) && f.onGround) {
        if (this.r() < this.p.antiair * 0.25) { this.antiAir(f); return; }
      }
      // ---- punish whiffs / recovery
      if (o.st === 'move' && o.phase === 'recovery' && o.move.tier >= 2) {
        const left = o.move.total - o.mf;
        if (left > 8 && dist < 110 && this.r() < this.p.punish * 0.35) { this.startRoute(f, 'meterOrBasic'); return; }
        if (left > 14 && dist < 250 && this.r() < this.p.punish * 0.2) { this.longPunish(f, m, o); return; }
      }
      if (this.cool > 0) { this.cool--; this.neutralMove(f, o, dist); return; }
      this.cool = Math.max(2, Math.round(this.p.react * (0.5 + this.r())));
      if (f.def.id === 'gojo') this.gojo(m, f, o, dist);
      else this.sukuna(m, f, o, dist);
    }

    incomingProj(m) {
      const f = this.f;
      let best = null;
      for (const p of m.projectiles) {
        if (p.owner === f || p.dead || !p.hit) continue;
        const dx = f.x - p.x;
        if (Math.sign(p.vx) !== Math.sign(dx) && Math.abs(dx) > 40) continue;
        const d = Math.abs(dx);
        if (!best || d < best.dist) best = { dist: d, y: p.y, p };
      }
      return best;
    }

    neutralMove(f, o, dist) {
      // drift toward preferred range
      const pref = f.def.id === 'gojo' ? 230 : 90;
      if (dist > pref + 40) this.emit(6, 0);
      else if (dist < pref - 40 && f.def.id === 'gojo') this.emit(4, 0);
    }

    antiAir(f) {
      if (f.def.id === 'gojo') this.cmd(this.r() < 0.5 && f.burnout <= 0 ? '2SP' : '2H');
      else this.cmd(this.r() < 0.5 && f.burnout <= 0 && !f.cs.da ? '2SP' : '2H');
      this.route = null;
    }

    longPunish(f, m, o) {
      if (f.def.id === 'gojo') {
        if (f.meter >= 100 && this.r() < this.p.supers) this.cmd('214SU');
        else if (f.burnout <= 0) this.cmd('6SP');
        else this.cmd('66');
      } else {
        if (f.meter >= 100 && this.r() < this.p.supers && !f.cs.da) this.cmd('214SU');
        else if (!f.cs.da && f.burnout <= 0) this.cmd('236SP');
        else this.cmd('6SP');
      }
    }

    startRoute(f, kind) {
      const R = ROUTES[f.def.id];
      let key = kind;
      if (kind === 'meterOrBasic') key = f.meter >= 100 && this.r() < this.p.supers ? 'meter' : this.r() < 0.35 ? 'launch' : 'basic';
      const route = R[key].slice(0, 1 + this.p.combo + (key === 'launch' ? 2 : 0));
      if ((f.burnout > 0 || (f.cs && f.cs.da)) && route.length) {
        // no techniques available: strip specials
        while (route.length && !['5L', '5M', '5H', '2L', '2M', '2H', 'J', 'jM', 'jH', 'jL'].includes(route[route.length - 1])) route.pop();
      }
      this.route = route; this.ri = 0;
      this.issue(f, route[0]);
    }

    issue(f, id) {
      const R = ROUTES[f.def.id];
      if (id === 'J') { this.plan.push({ d: 9 }, { d: 9 }); return; }
      if (R.cancelSpecial[id]) { this.cmd(R.cancelSpecial[id]); return; }
      if (id[0] === 'j') { this.cmd('j' + id.slice(1).replace(/^/, '5')); return; }
      const d = id[0], b = id.slice(1);
      // heavies in a chain: only sometimes hit the Black Flash timing
      if (b === 'H' && this.route && this.ri > 0 && this.r() > this.p.bf) {
        const n = 2 + Math.floor(this.r() * 2);
        for (let i = 0; i < n; i++) this.plan.push({ d: +d });
      }
      this.cmd(d + b);
    }

    comboStep(m, f, o) {
      if (!this.route) return;
      const mv = f.move;
      if (f.contact === 'hit' && f.hitstop <= 1) {
        const next = this.route[this.ri + 1];
        if (!next) { this.route = null; return; }
        // timing: input during cancel window
        if (f.mf >= mv.s) {
          this.ri++;
          this.issue(f, next);
        }
      } else if (f.contact === 'block' && f.mf >= mv.s) {
        // on block: maybe finish with a safe special or stop
        if (this.r() < 0.5 && this.route.length > this.ri + 1) {
          const last = this.route[this.route.length - 1];
          if (ROUTES[f.def.id].cancelSpecial[last] && (f.def.id !== 'sukuna' || last !== 'cleave')) this.issue(f, last);
        }
        this.route = null;
      } else if (!f.contact && f.mf > mv.s + mv.a) this.route = null;
    }

    // ---------------------------------------------------------------- brains
    gojo(m, f, o, dist) {
      const p = this.p, r = () => this.r();
      const tech = f.burnout <= 0;
      // domain
      if (tech && f.dg >= 100 && f.meter >= 200 && r() < p.supers * 0.5 && (o.st === 'down' || o.isStunned() || dist > 250)) { this.cmd('SPSU'); return; }
      // Hollow Purple when the opponent is far or knocked down
      if (tech && f.meter >= 100 && (o.st === 'down' || dist > 330) && r() < p.supers * 0.35) {
        this.cmd('623SU');
        this.holdSU = true;
        this.holdT = f.meter >= 300 && o.st === 'down' ? 120 : f.meter >= 200 ? 66 : 24;
        return;
      }
      // Infinity management vs. zoning
      if (tech && !f.cs.infOn && f.cs.inf > 70 && o.def.id === 'sukuna' && !o.cs.da && dist > 160 && r() < p.specials * 0.15) { this.plan.push({ d: 5, b: B.UN }); return; }
      if (f.cs.infOn && o.cs && o.cs.da && r() < 0.5) { this.plan.push({ d: 5, b: B.UN }); return; }
      if (dist > 300) {
        if (tech && r() < p.specials) { this.cmd(r() < 0.6 ? '214SP' : '236SP'); return; }
        if (r() < p.aggr * 0.5) { this.cmd('66'); return; }
        this.hold(6, 10);
        return;
      }
      if (dist > 160) {
        const x = r();
        if (tech && x < p.specials * 0.4) { this.cmd('5SP'); this.route = ['bluePull', '5M', '5H', 'redLaunch'].slice(0, 1 + p.combo); this.ri = 0; return; }
        if (tech && x < p.specials * 0.7) { this.cmd(r() < 0.5 ? '214SP' : '236SP'); return; }
        if (tech && x < p.specials * 0.8 && f.cs.tpCd <= 0) { this.cmd('22SP'); this.cool = 6; return; }
        if (x < 0.85) { this.cmd(r() < p.aggr ? '66' : '44'); return; }
        if (r() < p.jump) { this.cmd('JF'); return; }
        this.hold(r() < 0.5 ? 6 : 4, 12);
        return;
      }
      // close range
      const x = r();
      if (x < 0.12) { this.cmd('LM'); return; }
      if (x < 0.22 && tech) { this.cmd('2SP'); return; }
      if (x < 0.32) { this.cmd('44'); return; }
      if (x < 0.4 && f.meter >= 100 && r() < p.supers * 0.4 && tech) { this.cmd('236SU'); return; }
      this.startRoute(f, r() < 0.3 ? 'low' : r() < 0.5 ? 'launch' : 'basic');
    }

    sukuna(m, f, o, dist) {
      const p = this.p, r = () => this.r();
      const tech = f.burnout <= 0 && !f.cs.da;
      // Domain Amplification versus Infinity
      if (o.def.id === 'gojo' && o.cs.infOn && !f.cs.da && f.meter >= 40 && r() < 0.5) { this.plan.push({ d: 6, b: B.UN }); return; }
      if (f.cs.da && (!(o.cs && o.cs.infOn) || f.meter < 25) && r() < 0.3) { this.plan.push({ d: 5, b: B.UN }); return; }
      // domain
      if (tech && f.dg >= 100 && f.meter >= 200 && r() < p.supers * 0.5 && (o.st === 'down' || o.isStunned() || dist < 200)) { this.cmd('SPSU'); return; }
      // World Cutting Slash: aim at grounded/airborne opponent from range
      if (tech && f.meter >= 200 && dist > 200 && r() < p.supers * 0.2) {
        this.cmd('623SU');
        this.aim = o.y > 60 ? 1 : 0;
        return;
      }
      // Fuga when safe
      if (tech && (o.st === 'down' || dist > 320) && r() < p.specials * 0.3) {
        this.cmd('22SP');
        this.holdSP = true;
        this.holdT = f.meter >= 100 && f.cs.kindle >= 1 ? 80 : f.meter >= 50 ? 46 : 18;
        return;
      }
      const oRecover = o.st === 'move' && o.phase === 'recovery' && o.move.total - o.mf > 10;
      const oBusy = oRecover || o.st === 'block' || o.st === 'down' || o.st === 'wakeup';
      if (dist > 260) {
        // close the gap: dash on openings, otherwise walk in behind Dismantle pressure
        if (oBusy || r() < p.aggr * 0.35) { this.cmd('66'); this.hold(6, 14 + Math.floor(r() * 12)); return; }
        if (tech && r() < p.specials * 0.6) { this.cmd('236SP'); if (r() < 0.4) this.plan.push({ d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5, b: B.SP }); return; }
        this.hold(6, 16);
        return;
      }
      if (dist > 130) {
        const x = r();
        if (oRecover && dist < 240) { this.cmd('6SP'); this.route = ['lunge', 'cleave']; this.ri = 0; return; }
        if (oBusy && x < 0.6) { this.cmd('66'); this.hold(6, 4); this.cmd(r() < 0.5 ? '2L' : 'LM'); this.route = ['2L', '2M', 'dismantle']; this.ri = 0; return; }
        if (tech && x < p.specials * 0.45) { this.cmd('236SP'); return; }
        if (x < 0.25 && r() < p.jump * 1.1 && !o.isStunned()) { this.cmd('JF'); this.plan.push({ d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5, b: B.H }); return; }
        if (x < 0.4 && f.meter >= 50 && o.def.id === 'gojo' && o.cs.infOn && !f.cs.da) { this.plan.push({ d: 6, b: B.UN }); return; }
        // walk forward ready to block
        this.hold(6, 10 + Math.floor(r() * 10));
        return;
      }
      // close: mix-ups
      const x = r();
      if (x < 0.14) { this.cmd('LM'); return; }
      if (x < 0.22) { this.cmd('6H'); return; }
      if (x < 0.3 && tech) { this.cmd('63214SP'); return; }
      if (x < 0.38 && tech) { this.cmd('214SP'); return; }
      if (x < 0.44 && f.meter >= 100 && tech && r() < p.supers * 0.5) { this.cmd('214SU'); return; }
      this.startRoute(f, r() < 0.35 ? 'low' : r() < 0.55 ? 'launch' : 'basic');
    }

    // Domain clash timing press
    clashPress(r) {
      if (r > 60) this.clashDone = false;
      if (this.clashDone) return 0;
      const skill = this.p.perfect;
      const err = (1 - skill) * 14 * (this.r() < 0.5 ? -1 : 1) + (this.r() - 0.5) * 4;
      if (r <= 16 + err) { this.clashDone = true; return B.L; }
      return 0;
    }
  }

  JJK.AI = AI;
})();
