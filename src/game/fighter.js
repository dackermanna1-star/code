// Fighter: state machine, physics, move execution, cancels, defensive states,
// hurtbox generation and rendering (rasterized pixel art + afterimages + smears).
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, Rig = JJK.Rig, B = JJK.BTN;
  const S = (JJK.CHAR_SCALE = 1.2);
  const PUSH_W = (JJK.PUSH_W = 17);
  const MOT = JJK.MOTIONS, MWIN = JJK.MOTION_WIN;
  const hasDoc = typeof document !== 'undefined';

  const NEUTRAL = { idle: 1, walkF: 1, walkB: 1, crouch: 1, guard: 1, cguard: 1, run: 1 };
  const TIER = { normal1: 1, normal2: 2, normal3: 3, special: 4, ex: 5, super: 6, ult: 7, domain: 8 };
  JJK.TIER = TIER;

  let fighterIds = 0;

  class Fighter {
    constructor(def, side, ctrl, opts = {}) {
      this.id = fighterIds++;
      this.def = def;
      this.art = def.art;
      this.side = side;
      this.ctrl = ctrl;
      this.pal = opts.pal || 0;
      this.buf = new JJK.InputBuffer();
      this.sec = new Rig.Secondary();
      this.raster = hasDoc ? new JJK.Raster(JJK.W, JJK.H) : null;
      this.xf = new Rig.Xform();
      this.after = [];
      this.afterPool = [];
      this.meter = 0;
      this.wins = 0;
      this.stats = def.stats;
      this.cpu = null;
      this.name = def.name;
      this.training = null; // training options reference
      this.resetRound(side === 0 ? -150 : 150, side === 0 ? 1 : -1);
    }

    resetRound(x, facing) {
      this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
      this.facing = facing;
      this.hp = this.stats.hp;
      this.red = 0; // recoverable (RCT) health
      this.redDelay = 0;
      this.guard = 100;
      this.guardDelay = 0;
      this.dg = 0; // domain gauge
      this.st = 'idle'; this.sf = 0;
      this.move = null; this.mf = 0;
      this.hitstop = 0; this.stun = 0;
      this.air = false; this.airActions = this.stats.airActions;
      this.pending = null;
      this.inv = 0; this.invType = 'all';
      this.throwInv = 0;
      this.combo = { hits: 0, dmg: 0, scale: 1, jug: 0, wb: false, gb: false, time: 0, used: {}, starter: 1 };
      this.kd = null; this.bounce = null;
      this.contact = null; this.chain = 0;
      this.hitIds = {};
      this.flash = 0; this.shakeT = 0;
      this.burnout = 0;
      this.backHeld = 0;
      this.af = 0; this.anim = null; this.animName = '';
      this.pose = null; this.J = null; this.hurt = [];
      this.prevEnds = null; this.smears = [];
      this.afterT = 0; this.afterCol = null;
      this.visible = true;
      this.ko = false;
      this.lowHpFired = false;
      this.lastMoveId = null;
      this.counterType = null;
      this.timeScale = 1; this.tsAcc = 0; this.slowT = 0;
      this.grab = null; this.thrower = null;
      this.techWindow = 0;
      this.struggle = 0;
      this.wallSplat = 0;
      this.aura = null;
      this.hairLift = 0;
      this.dmgTakenRound = 0;
      this.cs = this.def.initState ? this.def.initState(this) : {};
      this.sec.reset();
      this.after.length = 0;
      this.buf.clear();
      this.setAnim('idle');
      this.updatePose();
    }

    get opp() { return this.match ? this.match.opp(this) : null; }
    get onGround() { return this.y <= 0.001 && !this.air; }
    get maxHp() { return this.stats.hp; }

    // ------------------------------------------------------------ input
    readInput() {
      const c = this.ctrl;
      const locked = !this.match || this.match.inputLocked;
      const dir = locked ? 5 : this.facing > 0 ? c.dir : JJK.mirrorDir(c.dir);
      this.buf.push(dir, locked ? 0 : c.held, locked ? 0 : c.pressed, locked ? false : c.dash);
      const d0 = this.buf.dir(0);
      this.backHeld = d0 === 4 || d0 === 1 || d0 === 7 ? this.backHeld + 1 : 0;
      if (!locked && this.buf.pr(0) & (B.L | B.M | B.H | B.SP | B.SU | B.UN)) {
        const cmd = this.recognize();
        if (cmd) this.pending = { cmd, t: 8 };
      }
    }

    // Find the best matching command for this frame's press.
    recognize() {
      const cmds = this.def.commands;
      const buf = this.buf;
      const air = this.air || this.y > 0;
      const crouch = buf.dir(0) <= 3;
      let best = null, bestScore = -1e9;
      for (let i = 0; i < cmds.length; i++) {
        const c = cmds[i];
        if (c.air === true && !air) continue;
        if (c.air === false && air) continue;
        if (c.air === undefined && air) continue; // default ground-only
        let score = 1000 - i;
        if (c.chord) {
          if (!buf.chordWithin(c.b, 3, 1)) continue;
          score += 100000;
        } else if (!(buf.pr(0) & c.b)) continue;
        if (c.m) {
          const age = buf.motion(MOT[c.m], MWIN[c.m] + (c.m.length > 3 ? 4 : 0), 9);
          if (age < 0) continue;
          score += 50000 + c.m.length * 1000 - age * 20;
        }
        if (c.dir && !c.dir.includes(buf.dir(0))) continue;
        if (c.crouch === true && !crouch) continue;
        if (c.crouch === false && crouch) continue;
        if (c.cond && !c.cond(this)) continue;
        if (score > bestScore) { best = c; bestScore = score; }
      }
      return best;
    }

    // ------------------------------------------------------------ helpers
    get actionable() {
      if (this.ko) return false;
      return !!NEUTRAL[this.st] || (this.st === 'air' && !this.move) || (this.st === 'land' && this.sf > 1);
    }
    face(opp) {
      if (Math.abs(opp.x - this.x) > 2) this.facing = opp.x > this.x ? 1 : -1;
    }
    setState(st) {
      this.st = st; this.sf = 0;
      if (st !== 'move') this.move = null;
    }
    setAnim(name, keepFrame) {
      if (this.animName === name && keepFrame !== false) return;
      this.animName = name;
      this.anim = this.def.anims[name] || this.def.anims.idle;
      this.af = 0;
    }
    meterGain(n) {
      if (n <= 0) return;
      const t = this.match && this.match.training;
      this.meter = U.clamp(this.meter + n * (this.def.meterMult || 1), 0, 300);
      if (t && t.infMeter) this.meter = 300;
    }
    spend(n) {
      const t = this.match && this.match.training;
      if (t && t.infMeter) return true;
      if (this.meter < n) return false;
      this.meter -= n;
      return true;
    }
    canAfford(n) {
      const t = this.match && this.match.training;
      return (t && t.infMeter) || this.meter >= n;
    }
    dist(o) { return Math.abs(o.x - this.x); }

    // ------------------------------------------------------------ moves
    startMove(id, opts = {}) {
      const mv = this.def.moves[id];
      if (!mv) { console.warn('missing move', id); return false; }
      const paid = mv.cost && !opts.free ? mv.cost : 0;
      if (paid && !this.spend(paid)) return false;
      const prevData = this.moveData, prevMove = this.move, prevSt = this.st;
      this.moveData = opts.data || {};
      if (mv.onStart && mv.onStart(this, this.match, opts) === false) {
        this.moveData = prevData;
        if (paid) this.meter = Math.min(300, this.meter + paid);
        return false;
      }
      void prevMove; void prevSt;
      this.st = 'move'; this.sf = 0;
      this.move = mv; this.mf = 0;
      this.contact = null;
      this.hitIds = {};
      this.lastMoveId = id;
      this.af = 0;
      this.anim = mv.anim;
      this.animName = 'move:' + id;
      if (mv.air) this.air = true;
      if (!mv.air && !mv.keepVel) { this.vx = 0; }
      if (mv.tier <= 3) this.chain = (opts.chain ? this.chain : 0) + 1;
      else this.chain = 0;
      if (mv.sfxStart && JJK.Audio) JJK.Audio.play(mv.sfxStart, { pan: this.pan() });
      if (mv.voice && JJK.Voice) JJK.Voice.say(this.def.id, mv.voice);
      if (mv.grunt && JJK.Voice) JJK.Voice.grunt(this.def.id, mv.grunt);
      if (mv.after) this.afterT = mv.after;
      if (this.match) this.match.onMoveStart(this, mv);
      return true;
    }

    // Can the current move be cancelled into `mv`?
    canCancel(mv) {
      const cur = this.move;
      if (!cur || !mv) return false;
      if (cur.noCancel) return false;
      if (mv.air !== !!cur.air && !(mv.air && cur.jc)) {
        if (mv.air && !cur.air) return false;
        if (!mv.air && cur.air) return false;
      }
      const tierNew = mv.tier, tierCur = cur.tier;
      const contact = this.contact;
      const inWindow = this.mf >= (cur.cancelFrom || cur.s) && this.mf <= (cur.cancelTo || cur.s + cur.a + 10);
      if (cur.whiffCancel && tierNew >= 4 && this.mf >= cur.s && this.mf <= cur.s + cur.a + 4) return true;
      if (!contact || !inWindow) return false;
      if (cur.cancels === false) return false;
      if (tierCur <= 3) {
        if (tierNew > tierCur) return tierNew >= 4 || !cur.noChain;
        if (tierNew === tierCur && tierCur === 1 && this.chain < 3 && mv.tier === 1) return true;
        return false;
      }
      // special -> super/ult ; super -> ult ; ex -> super
      if (tierCur === 4 && tierNew >= 6) return true;
      if (tierCur === 5 && tierNew >= 6) return true;
      if (tierCur === 6 && tierNew >= 7 && tierNew < 8) return true;
      if (cur.cancelInto && cur.cancelInto.includes(mv.id)) return true;
      return false;
    }

    tryPending() {
      const p = this.pending;
      if (!p) return false;
      const mv = this.def.moves[p.cmd.id];
      if (!mv) { this.pending = null; return false; }
      if (mv.cost && !this.canAfford(mv.cost)) { this.pending = null; if (this.match) this.match.onNoMeter(this); return false; }
      if (this.st === 'move') {
        if (!this.canCancel(mv)) return false;
      } else if (!this.actionable) return false;
      if (mv.cond && !mv.cond(this)) { this.pending = null; return false; }
      this.pending = null;
      if (!this.move || this.st !== 'move') this.faceOpp();
      return this.startMove(mv.id, { chain: this.st === 'move' });
    }
    faceOpp() {
      const o = this.opp;
      if (o && !this.air) this.face(o);
    }

    // ------------------------------------------------------------ update
    update(m) {
      this.match = m;
      const opp = m.opp(this);
      this.readInput();
      if (this.hitstop > 0) {
        this.hitstop--;
        this.shakeT++;
        return;
      }
      this.shakeT = 0;
      // per-fighter slow motion (Infinity slows attackers)
      if (this.slowT > 0) {
        this.slowT--;
        this.tsAcc += this.timeScale;
        if (this.tsAcc < 1) { this.animate(); return; }
        this.tsAcc -= 1;
      }
      this.sf++;
      this.tickTimers(m);
      if (this.def.update) this.def.update(this, m);
      this.stateUpdate(m, opp);
      this.physics(m);
      if (this.pending && --this.pending.t <= 0) this.pending = null;
      this.animate();
    }

    tickTimers(m) {
      if (this.inv > 0) this.inv--;
      if (this.throwInv > 0) this.throwInv--;
      if (this.flash > 0) this.flash--;
      if (this.burnout > 0) {
        this.burnout--;
        if (this.burnout === 0 && m) m.onBurnoutEnd(this);
      }
      // RCT: recoverable health regenerates when not under pressure
      if (this.red > 0) {
        if (this.redDelay > 0) this.redDelay--;
        else if (NEUTRAL[this.st] || this.st === 'air') {
          const r = Math.min(this.red, 0.45);
          this.red -= r;
          this.hp = Math.min(this.maxHp, this.hp + r);
        }
      }
      // guard gauge regen
      if (this.guardDelay > 0) this.guardDelay--;
      else this.guard = Math.min(100, this.guard + 0.22);
      // passive meter & domain gauge
      if (m && m.fighting) {
        this.meterGain(1.4 / 60);
        if (this.burnout <= 0) this.dg = Math.min(100, this.dg + 100 / (48 * 60));
      }
      if (this.afterT > 0) this.afterT--;
      // combo bookkeeping (as defender)
      if (this.combo.hits > 0) {
        this.combo.time++;
        if (!this.isStunned()) this.endCombo();
      }
    }

    isStunned() {
      return this.st === 'hit' || this.st === 'juggle' || this.st === 'thrown' || this.st === 'stagger' || this.st === 'guardbreak' ||
        this.st === 'dizzy' || this.st === 'wallsplat' || (this.st === 'down' && this.sf < 2) || this.st === 'grabbed';
    }
    endCombo() {
      if (this.match) this.match.onComboEnd(this, this.combo);
      this.combo.hits = 0; this.combo.dmg = 0; this.combo.scale = 1; this.combo.jug = 0;
      this.combo.wb = false; this.combo.gb = false; this.combo.time = 0; this.combo.used = {}; this.combo.starter = 1;
    }

    stateUpdate(m, opp) {
      const st = this.st;
      const stats = this.stats;
      const buf = this.buf;
      const d = buf.dir(0);
      switch (st) {
        case 'idle': case 'walkF': case 'walkB': case 'crouch': case 'guard': case 'cguard': case 'run': {
          if (this.tryPending()) return;
          this.face(opp);
          // dashes
          const dashKey = buf.dashPressed;
          const tapF = d === 6 && buf.dir(1) !== 6 && buf.motion(MOT['66'], MWIN['66'], 1) >= 0;
          const tapB = d === 4 && buf.dir(1) !== 4 && buf.motion(MOT['44'], MWIN['44'], 1) >= 0;
          if (st === 'run') {
            if (d === 6 || d === 9 || d === 3) {
              this.vx = this.facing * stats.runSpeed;
              if (d === 9) { this.jump(1, true); return; }
              this.setAnim('run');
              return;
            }
            this.setState('idle');
            this.vx *= 0.5;
          }
          if (tapF || (dashKey && d !== 4 && d !== 1 && d !== 7)) { this.startMove('dashF'); return; }
          if (tapB || (dashKey && (d === 4 || d === 1 || d === 7))) { this.startMove('dashB'); return; }
          if (d >= 7) { this.prejump(d === 9 ? 1 : d === 7 ? -1 : 0); return; }
          const threat = m.threatened(this);
          if (d <= 3) {
            const blockPose = (d === 1) && threat;
            this.st = blockPose ? 'cguard' : 'crouch';
            this.vx = 0;
            this.setAnim(blockPose ? 'cblock' : 'crouch');
            return;
          }
          if (d === 6) {
            this.st = 'walkF';
            this.vx = this.facing * stats.walkF;
            this.setAnim('walkF');
          } else if (d === 4) {
            if (threat) {
              this.st = 'guard'; this.vx = 0; this.setAnim('block');
            } else {
              this.st = 'walkB';
              this.vx = -this.facing * stats.walkB;
              this.setAnim('walkB');
            }
          } else {
            this.st = 'idle';
            this.vx = 0;
            this.setAnim(this.hp < this.maxHp * 0.25 ? 'idleTired' : 'idle');
          }
          return;
        }
        case 'prejump': {
          this.vx = 0;
          if (this.tryPendingThrowOrSpecial()) return;
          if (this.sf >= stats.prejump) this.jump(this.jumpDir, false);
          return;
        }
        case 'air': {
          if (this.tryPending()) return;
          // double jump
          const up = d >= 7;
          const upPressed = up && buf.dir(1) < 7;
          if (upPressed && this.airActions > 0 && this.sf > 5) {
            this.airActions--;
            this.vy = stats.jumpV * 0.88;
            this.vx = (d === 9 ? 1 : d === 7 ? -1 : 0) * stats.jumpVx * this.facing;
            this.setAnim('jumpUp', false);
            this.sf = 1;
            if (JJK.FX) JJK.FX.spawn('ring', this.x, this.y, { life: 12, size: 4, size2: 22, color: '#ffffff', w: 2, add: true });
            if (JJK.Audio) JJK.Audio.play('jump', { pitch: 1.2, pan: this.pan() });
            return;
          }
          const tapF = d === 6 && buf.dir(1) !== 6 && buf.motion(MOT['66'], MWIN['66'], 1) >= 0;
          const tapB = d === 4 && buf.dir(1) !== 4 && buf.motion(MOT['44'], MWIN['44'], 1) >= 0;
          if ((tapF || tapB || buf.dashPressed) && this.airActions > 0 && this.y > 30 && this.def.moves.airdashF) {
            this.airActions--;
            this.startMove(tapB || (buf.dashPressed && (d === 4 || d === 1 || d === 7)) ? 'airdashB' : 'airdashF');
            return;
          }
          this.setAnim(this.vy > 2 ? 'jumpUp' : this.vy > -2 ? 'jumpTop' : 'jumpDown');
          return;
        }
        case 'land': {
          this.vx *= 0.6;
          if (this.sf > 1 && this.tryPending()) return;
          if (this.sf >= (this.landLag || 3)) { this.setState('idle'); this.setAnim('idle'); }
          return;
        }
        case 'move': this.moveUpdate(m); return;
        case 'hit': case 'block': case 'stagger': case 'guardbreak': {
          this.stun--;
          if (st === 'block') this.setAnim(this.crouchBlock ? 'cblock' : 'block');
          if (this.stun <= 0) {
            if (st === 'block' || st === 'hit') this.throwInv = 5;
            this.toNeutral();
            if (this.tryPending()) return;
          }
          return;
        }
        case 'ablock': {
          this.stun--;
          if (this.stun <= 0) { this.st = 'air'; this.sf = 10; }
          return;
        }
        case 'juggle': {
          this.stun--;
          this.setAnim(this.vy > 1 ? 'juggleUp' : 'juggleDown');
          // air recovery when stun ends and not a forced knockdown
          if (this.stun <= 0 && !this.kd && this.y > 20) {
            this.st = 'air'; this.sf = 10; this.inv = 8; this.invType = 'all';
            this.vy = Math.max(this.vy, 3); this.vx = -this.facing * 2;
            this.setAnim('jumpTop');
            if (JJK.FX) JJK.FX.spawn('ring', this.x, this.y + 60, { life: 12, size: 6, size2: 28, color: '#fff', w: 2, add: true });
          }
          return;
        }
        case 'wallsplat': {
          this.vx = 0; this.vy = 0;
          this.stun--;
          if (this.stun <= 0) { this.st = 'juggle'; this.sf = 0; this.stun = 30; this.vy = -1; this.vx = -this.facing * 0.5; }
          return;
        }
        case 'down': {
          this.vx *= 0.8;
          this.setAnim('down');
          const pressed = buf.pr(0) & (B.L | B.M | B.H | B.SP | B.SU);
          if (this.kd === 'soft' && this.sf <= 12 && this.sf > 2 && pressed && !this.ko) {
            this.st = 'techroll'; this.sf = 0; this.inv = 18; this.invType = 'all';
            this.techDir = buf.dir(0) === 6 || buf.dir(0) === 3 ? 1 : -1;
            this.setAnim('roll');
            if (JJK.Audio) JJK.Audio.play('dash', { pitch: 0.8, pan: this.pan() });
            return;
          }
          if (this.ko) return;
          const len = this.kd === 'hard' ? 58 : 38;
          if (this.sf >= len) { this.st = 'wakeup'; this.sf = 0; this.inv = 16; this.invType = 'all'; this.setAnim('wakeup'); }
          return;
        }
        case 'techroll': {
          this.vx = this.techDir * this.facing * 4.2 * (1 - this.sf / 22);
          if (this.sf >= 20) { this.toNeutral(); this.throwInv = 6; }
          return;
        }
        case 'wakeup': {
          if (this.sf >= 14) {
            this.toNeutral();
            this.throwInv = 4;
            if (this.tryPending()) return;
          }
          return;
        }
        case 'throwtech': {
          this.vx *= 0.85;
          if (this.sf >= 16) this.toNeutral();
          return;
        }
        case 'grabbed': {
          // thrower moves us; tech window
          if (this.techWindow > 0) {
            this.techWindow--;
            if (buf.chordWithin(B.L | B.M, 3, 1) && this.thrower) m.throwTech(this.thrower, this);
          }
          return;
        }
        case 'thrown': return;
        case 'dizzy': {
          // Unlimited Void immobilization; mashing struggles free faster
          this.stun--;
          if (buf.pr(0) & (B.L | B.M | B.H | B.SP | B.SU | B.UN)) { this.stun -= 2.5; this.struggle = 6; }
          if (this.struggle > 0) this.struggle--;
          if (this.stun <= 0) { this.toNeutral(); this.inv = 10; this.invType = 'all'; }
          return;
        }
        case 'intro': case 'win': case 'lose': case 'ko': case 'timeout': case 'cinematic':
          return;
        default:
          this.toNeutral();
      }
    }

    tryPendingThrowOrSpecial() {
      const p = this.pending;
      if (!p) return false;
      const mv = this.def.moves[p.cmd.id];
      if (!mv || mv.tier < 4) return false;
      return this.tryPending();
    }

    toNeutral() {
      this.move = null;
      if (this.y > 0.5) { this.st = 'air'; this.sf = 10; this.air = true; this.setAnim('jumpDown'); return; }
      this.y = 0; this.air = false; this.vy = 0;
      this.airActions = this.stats.airActions;
      const d = this.buf.dir(0);
      this.st = d <= 3 ? 'crouch' : 'idle';
      this.sf = 0;
      this.setAnim(this.st === 'crouch' ? 'crouch' : 'idle');
    }

    prejump(dir) {
      this.st = 'prejump'; this.sf = 0; this.jumpDir = dir; this.vx = 0;
      this.setAnim('prejump');
    }
    jump(dir, fromRun) {
      const s = this.stats;
      this.st = 'air'; this.sf = 0; this.air = true;
      this.vy = s.jumpV;
      this.vx = dir * this.facing * (fromRun ? s.jumpVx * 1.45 : s.jumpVx);
      this.y = 0.5;
      this.airActions = s.airActions - 1;
      this.setAnim('jumpUp');
      if (JJK.Audio) JJK.Audio.play('jump', { pan: this.pan() });
      if (JJK.FX) JJK.FX.dust(this.x, 0.4);
    }

    moveUpdate(m) {
      const mv = this.move;
      this.mf++;
      // cancels
      if (this.pending && this.tryPending()) return;
      // jump cancel (launchers)
      if (mv.jc && this.contact === 'hit' && this.mf >= mv.s + 2 && this.buf.dir(0) >= 7) {
        this.move = null;
        this.st = 'air';
        this.jump(this.buf.dir(0) === 9 ? 1 : this.buf.dir(0) === 7 ? -1 : 0, false);
        this.vy = this.stats.jumpV * 1.05;
        this.airActions = this.stats.airActions;
        return;
      }
      // scripted velocities [frame, vx, vy?]
      if (mv.vel) {
        for (let i = 0; i < mv.vel.length; i++) {
          const v = mv.vel[i];
          if (v[0] === this.mf) {
            if (v[1] !== null) this.vx = v[1] * this.facing;
            if (v.length > 2 && v[2] !== null) { this.vy = v[2]; if (v[2] > 0) { this.air = true; this.y = Math.max(this.y, 0.5); } }
          }
        }
      }
      if (mv.friction != null && !this.air) this.vx *= mv.friction;
      let r;
      if (mv.tick) r = mv.tick(this, m, this.mf);
      if (r === 'hold') { this.mf--; }
      if (this.st !== 'move' || this.move !== mv) return; // tick changed state
      // landing during air moves
      if (this.air && this.y <= 0 && this.vy <= 0 && this.sf > 1) {
        this.y = 0; this.air = false; this.vy = 0;
        if (mv.air && !mv.keepOnLand) {
          this.landLag = mv.land != null ? mv.land : 4;
          if (mv.onLand) mv.onLand(this, m);
          this.setState('land'); this.setAnim('land');
          if (JJK.FX) JJK.FX.dust(this.x, 0.3);
          return;
        }
      }
      if (this.mf >= mv.total) {
        if (mv.next) { this.startMove(mv.next, { free: true }); return; }
        if (mv.onEnd) mv.onEnd(this, m);
        if (this.st === 'move' && this.move === mv) this.toNeutral();
      }
    }

    // Phase of the current move for counter-hit detection.
    get phase() {
      if (this.st !== 'move' || !this.move) return null;
      const mv = this.move;
      if (this.mf < mv.s) return 'startup';
      if (this.mf < mv.s + mv.a) return 'active';
      return 'recovery';
    }

    // Is the fighter invulnerable to the given attack kind? kind: 'strike'|'proj'|'throw'|'air'
    invulnTo(kind, fromAir) {
      if (this.inv > 0 && (this.invType === 'all' || this.invType === kind)) return true;
      if (kind === 'throw' && (this.throwInv > 0 || this.air || this.y > 0)) return true;
      if (this.st === 'down' || this.st === 'techroll' || this.st === 'wakeup') return true;
      if (this.ko) return true;
      if (this.st === 'move' && this.move.inv) {
        for (const w of this.move.inv) {
          if (this.mf >= w[0] && this.mf <= w[1]) {
            if (w[2] === 'all' || w[2] === kind) return true;
            if (w[2] === 'air' && fromAir) return true;
            if (w[2] === 'strike' && kind === 'proj' && w[3]) return true;
          }
        }
      }
      if (this.invisible) return true;
      return false;
    }

    // ------------------------------------------------------------ physics
    physics(m) {
      const st = this.st;
      if (st === 'thrown' || st === 'grabbed' || st === 'cinematic') return;
      const grav = this.move && this.move.grav != null ? this.move.grav : this.stats.grav;
      const airborne = this.air || this.y > 0;
      if (airborne) {
        let g = grav;
        if (st === 'juggle') g *= 1 + Math.min(0.6, this.combo.time / 240) + Math.min(0.4, this.combo.jug * 0.025);
        if (this.move && this.move.noGrav && this.mf <= this.move.noGrav) g = 0;
        this.vy -= g;
        if (this.vy < -14) this.vy = -14;
      }
      this.x += this.vx;
      this.y += this.vy;
      if (this.y <= 0) {
        if (airborne) this.landed(m);
        this.y = 0;
      }
      if (!airborne && st !== 'move' && !NEUTRAL[st]) {
        // pushback friction in stun states
        this.vx *= st === 'down' ? 0.8 : 0.86;
      }
      // walls
      const W = JJK.WALL;
      if (this.x < -W || this.x > W) {
        const side = this.x < 0 ? -1 : 1;
        this.x = side * W;
        if (st === 'juggle' && this.bounce === 'wall' && Math.abs(this.vx) > 3) {
          this.bounce = null;
          this.vx = -side * 3.5;
          this.vy = Math.max(this.vy, 7);
          this.stun = Math.max(this.stun, 30);
          this.combo.wb = true;
          if (m) m.onWallBounce(this, side);
        } else if (st === 'juggle' && this.bounce === 'splat' && Math.abs(this.vx) > 3) {
          this.bounce = null;
          this.st = 'wallsplat'; this.sf = 0; this.stun = 24; this.vx = 0; this.vy = 0;
          this.combo.wb = true;
          if (m) m.onWallBounce(this, side, true);
        } else if (st !== 'move') this.vx = 0;
      }
    }

    landed(m) {
      const st = this.st;
      this.air = false;
      if (st === 'juggle' || (st === 'ko' && this.vy < 0)) {
        if (this.bounce === 'ground' && !this.combo.gb) {
          this.bounce = null;
          this.combo.gb = true;
          this.vy = 7.2; this.vx *= 0.6;
          this.y = 1;
          this.air = true;
          this.stun = Math.max(this.stun, 32);
          if (m) m.onGroundBounce(this);
          return;
        }
        this.vy = 0;
        if (this.ko) { this.st = 'ko'; this.sf = 0; this.setAnim('down'); if (m) m.onKnockdown(this, true); return; }
        this.st = 'down'; this.sf = 0;
        if (!this.kd) this.kd = 'soft';
        this.setAnim('down');
        if (m) m.onKnockdown(this, false);
        return;
      }
      if (st === 'air') {
        this.vy = 0;
        this.landLag = 3;
        this.setState('land'); this.setAnim('land');
        if (JJK.FX) JJK.FX.dust(this.x, 0.25);
        if (JJK.Audio) JJK.Audio.play('land', { vol: 0.6, pan: this.pan() });
        this.sec.wind[1] = 0;
        return;
      }
      if (st === 'ablock') { this.vy = 0; this.st = 'block'; this.crouchBlock = false; return; }
      if (st === 'hit') { this.vy = 0; return; }
    }

    pan() {
      const m = this.match;
      if (!m || !m.cam) return 0;
      return U.clamp((this.x - m.cam.x) / 320, -1, 1) * 0.6;
    }

    // ------------------------------------------------------------ animation
    animate() {
      this.af += this.move && this.move.animSpeed ? this.move.animSpeed : 1;
      if (this.st === 'move' && this.move) {
        const mf = this.move.animFrame ? this.move.animFrame(this) : this.mf;
        this.pose = Rig.sample(this.move.anim, mf, this.def.poses);
      } else {
        let f = this.af;
        if (this.st === 'walkF' || this.st === 'walkB' || this.st === 'run') f = this.af;
        if (this.st === 'hit' || this.st === 'block' || this.st === 'stagger' || this.st === 'guardbreak') f = this.sf;
        this.pose = Rig.sample(this.anim, f, this.def.poses);
      }
      if (this.def.poseMod) this.def.poseMod(this, this.pose);
      this.updatePose();
    }

    updatePose() {
      if (!this.pose) this.pose = Rig.full(this.def.poses.idle || {});
      this.J = Rig.solve(this.pose, this.art.dims);
      this.computeHurt();
      this.sec.update(this.J, this.x / S, this.y / S, this.facing);
    }

    // world position of a joint/anchor
    anchor(name) {
      const J = this.J;
      const map = { nh: J.haN, fh: J.haF, nf: J.anN, ff: J.anF, head: J.head, chest: J.chest, hip: J.hip, ne: J.elN, fe: J.elF, nk: J.knN, fk: J.knF };
      const p = map[name] || J.chest;
      const pose = this.pose;
      let px = p[0], py = p[1];
      if (pose && pose.rot) {
        const a = -pose.rot * Math.PI / 180;
        const dx = px - 0, dy = py - 70;
        px = dx * Math.cos(a) - dy * Math.sin(a);
        py = 70 + dx * Math.sin(a) + dy * Math.cos(a);
      }
      return [this.x + this.facing * px * S, this.y + py * S];
    }

    // Convert a facing-space box [x0,y0,x1,y1] (pose units) to world AABB.
    boxToWorld(b) {
      const xa = this.x + this.facing * b[0] * S, xb = this.x + this.facing * b[2] * S;
      return [Math.min(xa, xb), this.y + Math.min(b[1], b[3]) * S, Math.max(xa, xb), this.y + Math.max(b[1], b[3]) * S];
    }

    computeHurt() {
      const J = this.J;
      const out = this.hurt;
      out.length = 0;
      if (!J) return;
      const pose = this.pose || {};
      const rot = pose.rot || 0;
      const box = (pts, mx, my) => {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of pts) {
          let px = p[0], py = p[1];
          if (rot) {
            const a = -rot * Math.PI / 180, dx = px, dy = py - 70;
            px = dx * Math.cos(a) - dy * Math.sin(a);
            py = 70 + dx * Math.sin(a) + dy * Math.cos(a);
          }
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        }
        out.push(this.boxToWorld([x0 - mx, y0 - my, x1 + mx, y1 + my]));
      };
      if (this.st === 'down' || this.st === 'ko') {
        out.push(this.boxToWorld([-36, 0, 36, 18]));
        return;
      }
      box([J.head], 11, 11);
      box([J.hip, J.waist, J.chest], 12, 5);
      box([J.hpN, J.hpF, J.knN, J.knF, J.anN, J.anF], 6, 4);
      box([J.elN, J.haN], 5, 5);
      box([J.elF, J.haF], 5, 5);
    }

    // ------------------------------------------------------------ rendering
    render(ctx, cam, m) {
      if (!this.raster || !this.visible) return;
      const r = this.raster;
      const pose = this.pose;
      const z = cam.ez * S;
      let ox = cam.sx(this.x), oy = cam.sy(this.y);
      if (this.hitstop > 0 && (this.st === 'hit' || this.st === 'juggle' || this.st === 'block' || this.st === 'ablock' || this.st === 'stagger' || this.st === 'guardbreak'))
        ox += (this.shakeT % 2 ? 2 : -2) * Math.min(1, this.hitstop / 4);
      if (this.st === 'dizzy') ox += Math.sin(this.sf * 0.9) * (this.struggle > 0 ? 1.5 : 0.5);
      this.xf.set(ox, oy, this.facing, z, pose.rot || 0, [0, 70], pose.sx || 1, pose.sy || 1);
      r.begin();
      // lighting
      const amb = m && m.stage && m.stage.getAmbient ? m.stage.getAmbient() : null;
      if (amb) {
        r.ambient = amb.mul;
        r.rim.c = amb.rim;
        r.rim.k = amb.rimK;
        r.rim.x = this.facing > 0 ? 0.8 : -0.8;
      }
      const L = JJK.FX.lights;
      for (let i = 0; i < L.length && r.lights.length < 4; i++) {
        const l = L[i];
        const lx = cam.sx(l.x), ly = cam.sy(l.y);
        const rr = l.r * cam.ez;
        if (Math.abs(lx - ox) > rr + 160 * z || Math.abs(ly - oy + 80 * z) > rr + 160 * z) continue;
        r.lights.push({ x: lx, y: ly, r: rr, r2: rr * rr, c: l.c, i: l.i });
      }
      if (this.flash > 0) r.flash = this.flashK != null ? this.flashK : 0.85;
      if (this.tint) r.tint = this.tint;
      if (m && m.silhouette) r.override = m.silhouette;
      // smears behind the limbs
      this.drawSmears(r, cam);
      const vis = {
        pose, pal: this.pal, sec: this.sec, t: this.sf,
        eyesOpen: this.eyesOpen, hairLift: this.hairLift,
      };
      this.art.draw(r, this.J, this.xf, vis);
      const aura = this.auraColor ? this.auraColor() : 0;
      const outline = m && m.silhouette ? null : this.art.outline;
      if (outline) r.outline(outline, aura, true);
      if (this.def.glowRing) {
        const gr = this.def.glowRing(this);
        if (gr) r.glowRing(gr);
      }
      r.flush();
      // afterimages
      this.updateAfterimages(ctx, cam);
      for (const a of this.after) {
        const k = 1 - a.t / a.life;
        ctx.globalAlpha = 0.55 * k;
        ctx.globalCompositeOperation = a.add ? 'lighter' : 'source-over';
        ctx.drawImage(a.c, 0, 0, a.w, a.h, cam.sx(a.x) + a.dx, cam.sy(a.y) + a.dy, a.w, a.h);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const alpha = this.alpha != null ? this.alpha : 1;
      r.drawTo(ctx, alpha);
    }

    dmgMul() { return this.def.dmgMul ? this.def.dmgMul(this) : 1; }
    dmgTakenMul() { return this.def.dmgTakenMul ? this.def.dmgTakenMul(this) : 1; }

    auraColor() {
      if (this.def.auraColor) return this.def.auraColor(this);
      return 0;
    }

    drawSmears(r, cam) {
      const J = this.J;
      const ends = [
        ['haN', 4.5], ['haF', 4.5], ['anN', 6], ['anF', 6],
      ];
      const cur = {};
      for (const e of ends) cur[e[0]] = this.xf.p(J[e[0]]);
      const attacking = this.st === 'move' && this.move && this.move.smear !== false && this.mf <= (this.move.s + this.move.a + 1);
      if (this.prevEnds && attacking) {
        const mat = this.def.smearMat;
        for (const e of ends) {
          const a = this.prevEnds[e[0]], b = cur[e[0]];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const d = Math.hypot(dx, dy);
          if (d > 9 * cam.ez && d < 140 * cam.ez) {
            const w = e[1] * this.xf.z;
            const nx = -dy / d * w, ny = dx / d * w;
            r.poly([a[0], a[1], b[0] + nx, b[1] + ny, b[0] - nx, b[1] - ny], mat, 0, { n: [0, 0, 1] });
          }
        }
      }
      this.prevEnds = cur;
    }

    updateAfterimages(ctx, cam) {
      for (let i = this.after.length - 1; i >= 0; i--) {
        const a = this.after[i];
        a.t++;
        if (a.t >= a.life) { this.afterPool.push(a); this.after.splice(i, 1); }
      }
      if (this.afterT > 0 && this.sf % 2 === 0 && this.raster && this.raster.canvas) {
        const b = this.raster.bbox;
        if (b[2] > 0 && b[3] > 0) {
          let a = this.afterPool.pop();
          if (!a) {
            const c = document.createElement('canvas');
            a = { c, x2: c.getContext('2d') };
          }
          if (a.c.width < b[2] || a.c.height < b[3]) { a.c.width = Math.max(a.c.width, b[2]); a.c.height = Math.max(a.c.height, b[3]); }
          const x = a.x2;
          x.globalCompositeOperation = 'source-over';
          x.clearRect(0, 0, a.c.width, a.c.height);
          x.drawImage(this.raster.canvas, b[0], b[1], b[2], b[3], 0, 0, b[2], b[3]);
          x.globalCompositeOperation = 'source-atop';
          x.fillStyle = this.afterCol || this.def.afterColor || '#6ad0ff';
          x.globalAlpha = 0.75;
          x.fillRect(0, 0, b[2], b[3]);
          x.globalAlpha = 1;
          a.w = b[2]; a.h = b[3];
          a.x = this.x; a.y = this.y;
          a.dx = b[0] - cam.sx(this.x); a.dy = b[1] - cam.sy(this.y);
          a.t = 0; a.life = 14; a.add = true;
          this.after.push(a);
        }
      }
    }

    drawShadow(ctx, cam) {
      const sx = cam.sx(this.x), sy = cam.sy(0);
      const h = Math.max(0, this.y);
      const w = Math.max(10, (34 - h * 0.12)) * cam.ez * S;
      ctx.globalAlpha = Math.max(0.15, 0.45 - h * 0.002);
      ctx.fillStyle = '#1a0a0a';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 1, w, w * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  JJK.Fighter = Fighter;
})();
