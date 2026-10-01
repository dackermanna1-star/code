// Battle scene: round flow, simulation step, collisions, camera, cinematics,
// screen effects (impact frames, screen tear, distortion, flashes) and rendering.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN;
  const W = JJK.W, H = JJK.H;
  const hasDoc = typeof document !== 'undefined';
  const MAX_SEP = 560;

  class Battle {
    constructor(o) {
      this.mode = o.mode || 'versus';
      this.opts = o;
      this.cam = new JJK.Camera();
      this.stage = JJK.Stage ? new JJK.Stage() : null;
      if (this.stage && this.stage.reset) this.stage.reset();
      this.projectiles = [];
      this.fighters = [
        new JJK.Fighter(JJK.Chars[o.p1.char], 0, o.p1.ctrl, { pal: o.p1.pal || 0 }),
        new JJK.Fighter(JJK.Chars[o.p2.char], 1, o.p2.ctrl, { pal: o.p2.pal || 0 }),
      ];
      for (const f of this.fighters) f.match = this;
      this.training = o.mode === 'training' ? JJK.Training.makeOptions() : null;
      this.round = 1;
      this.winsNeeded = o.winsNeeded || JJK.settings.rounds || 2;
      this.roundTime = (o.roundTime || JJK.settings.roundTime || 90) * 60;
      this.timer = this.roundTime;
      this.phase = 'intro';
      this.pt = 0; // phase time
      this.frame = 0;
      this.slow = 1; this.slowT = 0; this.slowAcc = 0;
      this.cine = null;
      this.freeze = 0; this.freezeOwner = null;
      this.flash = null;
      this.impactT = 0; this.impactCol = 0;
      this.tear = null;
      this.distorts = [];
      this.texts = []; // HUD banners
      this.popups = [];
      this.captions = [];
      this.darken = 0;
      this.letterbox = 0;
      this.topFighter = this.fighters[0];
      this.domain = null;
      this.clash = null;
      this.inputLocked = true;
      this.fighting = false;
      this.paused = false;
      this.result = null;
      this.hud = new JJK.HUD(this);
      this.events = [];
      this.stats = { hits: [0, 0], dmg: [0, 0], maxCombo: [0, 0] };
      this.lastHitBy = null;
      this.koT = 0;
      this.firstHit = false;
      if (o.p1.cpu) this.fighters[0].cpu = new JJK.AI(this.fighters[0], o.p1.cpu);
      if (o.p2.cpu) this.fighters[1].cpu = new JJK.AI(this.fighters[1], o.p2.cpu);
      if (this.training) JJK.Training.setup(this);
      if (JJK.Voice && JJK.Voice.onCaption) {
        this._capFn = (id, text) => this.caption(id, text);
        JJK.Voice.onCaption(this._capFn);
      }
      this.startRound();
      if (JJK.Music) JJK.Music.play(this.training ? 'training' : 'battle');
    }

    opp(f) { return f === this.fighters[0] ? this.fighters[1] : this.fighters[0]; }

    startRound() {
      const [a, b] = this.fighters;
      a.resetRound(-150, 1);
      b.resetRound(150, -1);
      this.projectiles.length = 0;
      if (JJK.FX) JJK.FX.clear();
      this.cam.reset();
      this.timer = this.roundTime;
      if (this.domain && this.domain.amb) this.domain.amb.stop(0.2);
      this.domain = null; this.clash = null; this.pendingClash = null; this.domainStartup = null; this.domainVisual = null;
      this.simplePrompt = null; this.tear = null; this.events.length = 0;
      if (this.stage && this.stage.setMode) this.stage.setMode('normal', { frames: 1 });
      this.cine = null; this.freeze = 0; this.slow = 1; this.slowT = 0;
      this.darken = 0; this.letterbox = 0;
      this.koT = 0; this.firstHit = false;
      this.inputLocked = true;
      this.fighting = false;
      if (this.training) {
        this.phase = 'fight'; this.pt = 0; this.inputLocked = false; this.fighting = true;
        for (const f of this.fighters) { f.st = 'idle'; f.setAnim('idle'); f.meter = 300; f.dg = 100; }
        return;
      }
      this.phase = 'intro'; this.pt = 0;
      for (const f of this.fighters) { f.st = 'intro'; f.setAnim('intro'); }
      if (this.round > 1) for (const f of this.fighters) f.meter = Math.min(300, f.meter); // meter carries
    }

    // --------------------------------------------------------------- hooks
    threatened(f) {
      const o = this.opp(f);
      if (o.st === 'move' && o.move && o.move.hits && o.mf <= o.move.s + o.move.a + 2 && Math.abs(o.x - f.x) < 260) return true;
      for (const p of this.projectiles) {
        if (p.owner === f || !p.hit || p.dead) continue;
        const dx = f.x - p.x;
        if (Math.abs(dx) < 280 && (Math.sign(p.vx) === Math.sign(dx) || Math.abs(dx) < 90)) return true;
      }
      return false;
    }
    onMoveStart(f, mv) {
      this.topFighter = f;
      if (mv.tier >= 4) f.dg = Math.min(100, f.dg + 0.3);
      if (this.training) JJK.Training.onMoveStart(this, f, mv);
    }
    onNoMeter(f) {
      if (JJK.Audio) JJK.Audio.play('ui_error', { vol: 0.4 });
    }
    onBurnoutEnd(f) {
      this.popText(f, 'TECHNIQUE RESTORED', '#9fe0ff');
    }
    onComboEnd(f, combo) {
      const att = this.opp(f);
      if (combo.hits > this.stats.maxCombo[att.side]) this.stats.maxCombo[att.side] = combo.hits;
      if (this.training) JJK.Training.onComboEnd(this, f, combo);
      if (combo.hits >= 2 && this.hud) this.hud.comboEnd(att.side, combo);
    }
    throwTech(att, def) { JJK.Combat.throwTech(this, att, def); }
    onWallBounce(f, side, splat) {
      const x = side * JJK.WALL, y = f.y + 70;
      if (JJK.FX) {
        JJK.FX.hitSpark(x, y, -side, 0.9, '#ffd8a0');
        JJK.FX.debris(x, y, 14, 1.2);
      }
      if (JJK.Audio) JJK.Audio.play('wall_bounce', { pan: side * 0.7 });
      this.cam.shake(0.35);
      this.cam.kick(side * 4, 0);
      if (this.stage && this.stage.impact) this.stage.impact(x, y, 0.8, 'wall');
      f.hitstop = splat ? 14 : 9;
    }
    onGroundBounce(f) {
      if (JJK.FX) { JJK.FX.dust(f.x, 1.2); JJK.FX.debris(f.x, 2, 10, 1); JJK.FX.spawn('shock', f.x, 0, { life: 16, size: 10, size2: 60, color: '#ffe0b0', w: 2 }); }
      if (JJK.Audio) JJK.Audio.play('ground_bounce', { pan: f.pan() });
      this.cam.shake(0.3);
      if (this.stage && this.stage.crater) this.stage.crater(f.x, 26);
      f.hitstop = 6;
    }
    onKnockdown(f, ko) {
      if (JJK.FX) { JJK.FX.dust(f.x, ko ? 1.2 : 0.8); }
      if (JJK.Audio) JJK.Audio.play('knockdown', { pan: f.pan() });
      this.cam.shake(ko ? 0.3 : 0.15);
    }
    onBlock(att, def, h, perfect) {}
    onParry(def, att) {}
    onHit(att, def, h, info) {
      this.lastHitBy = att;
      this.stats.hits[att.side]++;
      this.stats.dmg[att.side] += info.dmg;
      if (!this.firstHit && !this.training && this.fighting) {
        this.firstHit = true;
        this.popText(att, 'FIRST ATTACK', '#ffd23a', true);
      }
      if (this.training) JJK.Training.onHit(this, att, def, h, info);
      if (this.hud) this.hud.onHit(att, def, info);
      if (def.hp < def.maxHp * 0.25 && !def.lowHpFired && def.hp > 0) {
        def.lowHpFired = true;
        if (JJK.Voice && !this.training) setTimeoutSafe(() => JJK.Voice.say(def.def.id, 'lowhp'), 400);
      }
    }
    onKO(def, att, h) {
      if (def.ko || this.phase !== 'fight') { if (this.training && def.hp <= 0) def.hp = 1; return; }
      if (this.training) { def.hp = 1; return; }
      def.ko = true;
      def.hp = 0;
      this.phase = 'ko'; this.pt = 0;
      this.fighting = false;
      this.inputLocked = true;
      // KO launch
      if (def.st !== 'juggle') {
        def.st = 'juggle'; def.air = true; def.y = Math.max(def.y, 1);
        def.vy = 6; def.vx = Math.sign(def.x - att.x || 1) * 4;
      } else {
        def.vy = Math.max(def.vy, 5);
      }
      def.kd = 'hard'; def.stun = 999;
      def.hitstop = 24; att.hitstop = 24;
      this.slowmo(0.3, 80);
      this.impact(3, 0xffffffff);
      if (JJK.Audio) { JJK.Audio.play('ko_hit'); JJK.Audio.lowpass(0.7, 1.2); JJK.Audio.rumble(def.side, 1, 1, 500); }
      if (JJK.Voice) JJK.Voice.grunt(def.def.id, 'ko');
      this.cam.shake(0.8);
      this.cam.zoomPulse(0.08);
      if (JJK.Music) JJK.Music.stop(1.5);
      const perfect = att.hp >= att.maxHp;
      this.koInfo = { winner: att, loser: def, perfect };
    }

    popText(f, text, color, big) {
      const p = f.anchor ? f.anchor('head') : [f.x, f.y + 150];
      this.popups.push({ x: p[0], y: p[1] + 26, text, color, t: 0, life: big ? 60 : 45, big, side: f.side });
      if (this.popups.length > 6) this.popups.shift();
    }
    banner(text, opts = {}) {
      this.texts.push(Object.assign({ text, t: 0, life: 70 }, opts));
    }
    caption(id, text) {
      // chants already have stylized on-screen text
      if (/^(Dragon Scale|Recoil|Twin Meteors|Phase\. Twilight)/.test(text)) return;
      this.captions.push({ id, text, t: 0, life: Math.max(90, text.length * 5) });
      if (this.captions.length > 2) this.captions.shift();
    }
    flashScreen(color, alpha, frames) {
      if (!JJK.settings.flashes) alpha *= 0.35;
      this.flash = { color, alpha, frames, t: 0 };
    }
    impact(frames, col) {
      this.impactT = frames;
      this.impactCol = col || 0xffffffff;
    }
    slowmo(scale, frames) {
      this.slow = scale; this.slowT = frames;
    }
    spawn(p) { this.projectiles.push(p); return p; }
    distort(wx, wy, r, k) { this.distorts.push({ x: wx, y: wy, r, k }); }

    // Cinematic: { dur, update(m, t), draw(ctx, m, t), onEnd(m), cam: fn(t) -> {x,y,zoom} , owner }
    cinematic(c) {
      c.t = 0;
      this.cine = c;
      if (c.start) c.start(this);
    }
    // Classic super flash: freeze the world briefly, zoom on the user, show the move name.
    superFlash(f, name, o = {}) {
      const dur = o.dur || 34;
      const p = f.anchor('chest');
      this.freeze = dur; this.freezeOwner = f;
      this.freezeCam = { x: U.clamp(p[0], -this.cam.limit, this.cam.limit), y: Math.max(JJK.CAM_BASE_Y - 10, p[1] - 20), zoom: o.zoom || 1.35, speed: 0.25 };
      this.cam.override = this.freezeCam;
      this.darkenTarget = o.dark != null ? o.dark : 0.55;
      this.superName = { text: name, t: 0, life: dur + 30, side: f.side, color: o.color || f.def.color };
      f.flash = 3; f.flashK = 0.6;
      if (JJK.Audio) JJK.Audio.play('super_flash', { pan: f.pan() });
      if (JJK.FX) {
        JJK.FX.spawn('ring', p[0], p[1], { life: 22, size: 10, size2: 120, color: o.color || '#fff', w: 4, add: true });
        JJK.FX.spawn('glow', p[0], p[1], { life: 30, size: 80, size2: 10, color: o.color || '#ffffff', add: true });
      }
    }

    // --------------------------------------------------------------- tick
    tick(ctrls) {
      this.frame++;
      // pause
      if (this.paused) return;
      // poll controllers + AI
      for (const f of this.fighters) {
        if (f.cpu && !this.inputLocked) f.cpu.think(this);
        else if (f.cpu) f.ctrl.virtual = { dir: 5, held: 0 };
        f.ctrl.poll();
      }
      if (this.training) JJK.Training.tick(this);
      // slow-motion accumulator
      let steps = 1;
      if (this.slowT > 0) {
        this.slowT--;
        this.slowAcc += this.slow;
        steps = Math.floor(this.slowAcc);
        this.slowAcc -= steps;
        if (this.slowT === 0) { this.slow = 1; this.slowAcc = 0; if (JJK.Audio) JJK.Audio.lowpass(0, 0.4); }
      }
      for (let i = 0; i < steps; i++) this.step();
      // UI timers run in real time
      for (let i = this.texts.length - 1; i >= 0; i--) if (++this.texts[i].t >= this.texts[i].life) this.texts.splice(i, 1);
      for (let i = this.popups.length - 1; i >= 0; i--) if (++this.popups[i].t >= this.popups[i].life) this.popups.splice(i, 1);
      for (let i = this.captions.length - 1; i >= 0; i--) if (++this.captions[i].t >= this.captions[i].life) this.captions.splice(i, 1);
      if (this.flash && ++this.flash.t >= this.flash.frames) this.flash = null;
      if (this.impactT > 0) this.impactT--;
      if (this.superName && ++this.superName.t >= this.superName.life) this.superName = null;
      if (this.hud) this.hud.tick();
      this.roundFlow();
    }

    step() {
      const [a, b] = this.fighters;
      // cinematic freeze
      if (this.cine) {
        const c = this.cine;
        c.t++;
        if (c.update) c.update(this, c.t);
        if (c.fighters) for (const f of this.fighters) { f.animate(); }
        if (JJK.FX) JJK.FX.update();
        if (this.stage && this.stage.update) this.stage.update(this.cam);
        this.camStep();
        if (c.t >= c.dur) {
          this.cine = null;
          this.cam.override = null;
          if (c.onEnd) c.onEnd(this);
        }
        return;
      }
      if (this.freeze > 0) {
        this.freeze--;
        const f = this.freezeOwner;
        if (f) { f.af++; f.sec.update(f.J, f.x / JJK.CHAR_SCALE, f.y / JJK.CHAR_SCALE, f.facing); }
        if (JJK.FX) JJK.FX.update();
        this.darken = U.approach(this.darken, this.darkenTarget || 0.5, 0.08);
        this.camStep();
        if (this.freeze === 0) { this.cam.override = null; this.freezeOwner = null; }
        return;
      }
      this.darken = U.approach(this.darken, this.domain ? 0 : 0, 0.06);
      // fighters
      a.update(this);
      b.update(this);
      // projectiles
      JJK.updateProjectiles(this);
      // melee collisions (gather first to allow trades)
      const ha = JJK.Combat.findMelee(a, b);
      const hb = JJK.Combat.findMelee(b, a);
      if (ha) a.hitIds[ha.i] = true;
      if (hb) b.hitIds[hb.i] = true;
      if (ha && hb && !ha.h.throw && !hb.h.throw) {
        JJK.Combat.resolve(this, a, b, ha.h, ha.pt, { moveId: ha.mv.id });
        JJK.Combat.resolve(this, b, a, hb.h, hb.pt, { moveId: hb.mv.id });
      } else {
        if (ha) JJK.Combat.resolve(this, a, b, ha.h, ha.pt, { moveId: ha.mv.id });
        if (hb && !(ha && ha.h.throw)) JJK.Combat.resolve(this, b, a, hb.h, hb.pt, { moveId: hb.mv.id });
      }
      // timed events
      for (let i = this.events.length - 1; i >= 0; i--) {
        const e = this.events[i];
        if (--e.t <= 0) { this.events.splice(i, 1); e.fn(); }
      }
      // domain / character global effects
      if (this.domainStartup && JJK.Domain) JJK.Domain.checkInterrupt(this);
      if (this.domain && JJK.Domain) JJK.Domain.update(this);
      if (this.clash && JJK.Domain) JJK.Domain.updateClash(this);
      this.pushboxes();
      this.camStep();
      if (this.stage && this.stage.update) this.stage.update(this.cam);
      if (JJK.FX) JJK.FX.update();
      // timer
      if (this.phase === 'fight' && !this.training && !this.domain && !this.clash) {
        this.timer--;
        if (this.timer <= 0) this.timeOver();
      }
    }

    pushboxes() {
      const [a, b] = this.fighters;
      for (const f of this.fighters) {
        if (f.st === 'grabbed' || f.st === 'thrown') continue;
        if (Math.abs(f.x) > JJK.WALL) f.x = Math.sign(f.x) * JJK.WALL;
      }
      if (a.st === 'grabbed' || b.st === 'grabbed' || a.st === 'thrown' || b.st === 'thrown') return;
      if (a.noPush || b.noPush || a.invisible || b.invisible) return;
      const pw = JJK.PUSH_W * 2;
      const dx = b.x - a.x;
      const adx = Math.abs(dx);
      // vertical separation lets fighters pass over each other
      const hiA = a.y, hiB = b.y;
      const overlapY = Math.abs(hiA - hiB) < 120;
      if (adx < pw && overlapY && !(a.st === 'down' || b.st === 'down')) {
        const push = (pw - adx) / 2;
        let s = dx === 0 ? (a.facing > 0 ? 1 : -1) : Math.sign(dx);
        let pa = push, pb = push;
        // if one is at a wall, the other takes the push
        if (Math.abs(a.x - s * pa) > JJK.WALL) { pb += pa; pa = 0; }
        if (Math.abs(b.x + s * pb) > JJK.WALL) { pa += pb; pb = 0; }
        a.x -= s * pa;
        b.x += s * pb;
      }
      // max separation (camera bounds)
      const sep = b.x - a.x;
      if (Math.abs(sep) > MAX_SEP) {
        const over = Math.abs(sep) - MAX_SEP;
        const s = Math.sign(sep);
        // whoever is moving away gets stopped
        const aAway = Math.sign(a.vx) === -s, bAway = Math.sign(b.vx) === s;
        if (aAway && !bAway) a.x += s * over;
        else if (bAway && !aAway) b.x -= s * over;
        else { a.x += s * over / 2; b.x -= s * over / 2; }
      }
    }

    camStep() {
      const [a, b] = this.fighters;
      this.cam.update(a, b);
    }

    timeOver() {
      const [a, b] = this.fighters;
      this.phase = 'ko'; this.pt = 0; this.fighting = false; this.inputLocked = true;
      const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
      const winner = pa === pb ? null : pa > pb ? a : b;
      this.koInfo = { winner, loser: winner ? this.opp(winner) : null, timeout: true };
      this.banner('TIME OVER', { life: 100, scale: 6 });
      if (JJK.Voice) JJK.Voice.announce('Time over');
    }

    roundFlow() {
      this.pt++;
      const [a, b] = this.fighters;
      switch (this.phase) {
        case 'intro': {
          if (this.pt === 1) {
            if (JJK.Audio) JJK.Audio.play('round_bell');
            const text = this.round >= this.winsNeeded * 2 - 1 || (a.wins === this.winsNeeded - 1 && b.wins === this.winsNeeded - 1) ? 'FINAL ROUND' : 'ROUND ' + this.round;
            this.roundLabel = text;
            this.banner(text, { life: 90, scale: 6 });
            if (JJK.Voice) JJK.Voice.announce(text === 'FINAL ROUND' ? 'Final round' : 'Round ' + ['one', 'two', 'three', 'four', 'five'][this.round - 1]);
            if (this.round === 1) {
              setTimeoutSafe(() => JJK.Voice && JJK.Voice.say(a.def.id, 'intro'), 300);
              setTimeoutSafe(() => JJK.Voice && JJK.Voice.say(b.def.id, 'intro'), 2300);
            }
          }
          if (this.pt === 100) this.banner('READY', { life: 40, scale: 5, top: '#ffffff', mid: '#c8d8ff', bot: '#5070c0' });
          if (this.pt >= 140) {
            this.phase = 'fight'; this.pt = 0;
            this.banner('FIGHT!', { life: 55, scale: 9, shake: true });
            if (JJK.Voice) JJK.Voice.announce('Fight!');
            if (JJK.Audio) JJK.Audio.play('ui_start');
            this.inputLocked = false; this.fighting = true;
            for (const f of this.fighters) f.toNeutral();
            this.cam.shake(0.2);
            if (JJK.Music) {
              JJK.Music.play('battle');
              const final = this.roundLabel === 'FINAL ROUND';
              JJK.Music.setIntensity(final ? 0.5 : 0);
            }
          }
          break;
        }
        case 'fight': {
          // safety: any fighter at 0 HP must be KO'd (e.g. damage dealt during a transition)
          for (const f of this.fighters) if (f.hp <= 0 && !f.ko && !this.training) { this.onKO(f, this.opp(f), {}); break; }
          if (JJK.Music && !this.domain && !this.clash) {
            const low = Math.min(a.hp / a.maxHp, b.hp / b.maxHp);
            const final = this.roundLabel === 'FINAL ROUND';
            JJK.Music.setIntensity(low < 0.25 ? 1 : low < 0.5 ? 0.6 : final ? 0.5 : 0);
          }
          break;
        }
        case 'ko': {
          const info = this.koInfo;
          if (this.pt === 30 && !info.timeout) this.banner('K.O.', { life: 110, scale: 12, top: '#ffffff', mid: '#ff5040', mid2: '#e01010', bot: '#600000', shake: true });
          if (this.pt === 34 && !info.timeout && JJK.Voice) JJK.Voice.announce('K.O.');
          const settled = this.fighters.every((f) => f.st !== 'move' && f.st !== 'juggle' && f.st !== 'hit' && !this.cine) || this.pt > 260;
          if (this.pt >= 150 && settled && !this.koDone) {
            this.koDone = true;
            const w = info.winner;
            if (w) {
              w.wins++;
              w.st = 'win'; w.sf = 0; w.setAnim('win'); w.move = null; w.vx = 0;
              const l = info.loser;
              if (l && !l.ko) { l.st = 'lose'; l.setAnim('lose'); }
              const txt = w.def.name + ' WINS';
              this.banner(txt, { life: 150, scale: 6, y: 150 });
              if (info.perfect) this.banner('FLAWLESS VICTORY', { life: 150, scale: 3, y: 205, top: '#ffffff', mid: '#ffe080', bot: '#c07000' });
              if (JJK.Voice) { JJK.Voice.announce(w.def.name.toLowerCase() + ' wins'); }
              if (w.wins >= this.winsNeeded && JJK.Voice) setTimeoutSafe(() => JJK.Voice.say(w.def.id, 'win'), 1500);
              if (JJK.Music && w.wins >= this.winsNeeded) JJK.Music.play('victory');
            } else {
              this.banner('DRAW', { life: 150, scale: 6 });
              for (const f of this.fighters) f.wins++;
            }
            this.pt = 150;
          }
          if (this.koDone && this.pt >= 340) {
            this.koDone = false;
            const done = this.fighters.find((f) => f.wins >= this.winsNeeded);
            if (done) {
              const both = this.fighters.every((f) => f.wins >= this.winsNeeded);
              this.phase = 'over'; this.pt = 0;
              this.result = { winner: both ? null : done, stats: this.stats };
            } else {
              this.round++;
              if (JJK.Music) JJK.Music.play('battle');
              this.startRound();
            }
          }
          break;
        }
        case 'over': break;
      }
    }

    // --------------------------------------------------------------- render
    render(ctx) {
      const cam = this.cam;
      const st = this.stage;
      JJK.FX.lights.length = 0;
      // gather lights from projectiles & fighters (used by the rasterizer)
      for (const p of this.projectiles) if (p.light) p.light(p, this);
      for (const f of this.fighters) if (f.def.lights) f.def.lights(f, this);
      if (this.domain && JJK.Domain) JJK.Domain.lights(this);
      if (st) {
        st.darken = Math.max(this.darken, this.cine && this.cine.dark != null ? this.cine.dark : 0);
        st.drawBack(ctx, cam);
      } else {
        ctx.fillStyle = '#301010'; ctx.fillRect(0, 0, W, H);
      }
      if (this.domain && JJK.Domain) JJK.Domain.drawBack(ctx, this);
      JJK.FX.draw(ctx, cam, 'back');
      for (const p of this.projectiles) if (p.layer === 'back') p.draw(ctx, cam, this);
      for (const f of this.fighters) if (f.visible) f.drawShadow(ctx, cam);
      const order = this.topFighter === this.fighters[0] ? [this.fighters[1], this.fighters[0]] : [this.fighters[0], this.fighters[1]];
      for (const f of order) {
        if (f.def.drawBehind) f.def.drawBehind(f, ctx, cam, this);
        f.render(ctx, cam, this);
        if (f.def.drawFx) f.def.drawFx(f, ctx, cam, this);
      }
      for (const p of this.projectiles) if (p.layer !== 'back') p.draw(ctx, cam, this);
      JJK.FX.draw(ctx, cam, 'front');
      if (st && st.drawFront) st.drawFront(ctx, cam);
      if (this.domain && JJK.Domain) JJK.Domain.drawFront(ctx, this);
      this.applyDistortions(ctx);
      // low-health danger vignette
      if (this.phase === 'fight' && !this.training) {
        const low = Math.min(...this.fighters.map((f) => f.hp / f.maxHp));
        if (low < 0.25) this.drawDanger(ctx, (0.25 - low) / 0.25);
      }
      if (this.impactT > 0) this.drawImpactFrame(ctx);
      if (this.tear) this.applyTear(ctx);
      if (this.cine && this.cine.draw) this.cine.draw(ctx, this, this.cine.t);
      if (this.clash && JJK.Domain) JJK.Domain.drawClash(ctx, this);
      // popups
      for (const p of this.popups) {
        const k = p.t / p.life;
        const sx = cam.sx(p.x), sy = cam.sy(p.y) - k * 18;
        ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        JJK.Font.draw(ctx, p.text, U.clamp(sx, 50, W - 50), Math.max(56, sy), { color: p.color, scale: p.big ? 2 : 1, align: 'center', outline: '#000' });
        ctx.globalAlpha = 1;
      }
      // flash
      if (this.flash) {
        const f = this.flash;
        ctx.globalAlpha = f.alpha * (1 - f.t / f.frames);
        ctx.fillStyle = f.color;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      // letterbox
      const lb = this.cine && this.cine.letterbox ? this.cine.letterbox : this.freeze > 0 ? 18 : 0;
      this.letterbox = U.approach(this.letterbox, lb, 3);
      if (this.letterbox > 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, this.letterbox);
        ctx.fillRect(0, H - this.letterbox, W, this.letterbox);
      }
      // the HUD steps aside during cinematics
      this.hudAlpha = U.approach(this.hudAlpha == null ? 1 : this.hudAlpha, this.cine || this.clash ? 0 : 1, 0.12);
      if (this.hud && this.hudAlpha > 0.01) {
        ctx.globalAlpha = this.hudAlpha;
        this.hud.draw(ctx);
        ctx.globalAlpha = 1;
      }
      if (this.training && !this.cine) JJK.Training.draw(ctx, this);
    }

    drawDanger(ctx, k) {
      if (!this._vig && hasDoc) {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
        g.addColorStop(0, 'rgba(160,0,0,0)');
        g.addColorStop(1, 'rgba(160,0,0,1)');
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
        this._vig = c;
      }
      if (!this._vig) return;
      ctx.globalAlpha = (0.18 + 0.14 * Math.sin(this.frame * 0.12)) * (0.5 + k * 0.5);
      ctx.drawImage(this._vig, 0, 0);
      ctx.globalAlpha = 1;
    }

    drawImpactFrame(ctx) {
      // High-contrast anime impact frame: black screen, white silhouettes + speed lines
      ctx.save();
      ctx.fillStyle = this.impactCol === 0xff000000 ? '#fff' : '#000';
      ctx.globalAlpha = 0.92;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      const col = this.impactCol === 0xff000000 ? '#000' : '#fff';
      for (const f of this.fighters) {
        const r = f.raster;
        if (!r || !r.canvas) continue;
        const b = r.bbox;
        if (b[2] <= 0) continue;
        if (!this._sil) { this._sil = document.createElement('canvas'); this._sil.width = W; this._sil.height = H; }
        const sx = this._sil.getContext('2d');
        sx.globalCompositeOperation = 'source-over';
        sx.clearRect(0, 0, W, H);
        sx.drawImage(r.canvas, 0, 0);
        sx.globalCompositeOperation = 'source-in';
        sx.fillStyle = f === this.lastHitBy ? col : (this.impactCol === 0xffff2020 ? '#ff2020' : col);
        sx.fillRect(0, 0, W, H);
        ctx.drawImage(this._sil, 0, 0);
      }
      // radial speed lines
      const c = this.fighters[0].x + this.fighters[1].x;
      const cx = this.cam.sx(c / 2), cy = this.cam.sy(110);
      ctx.strokeStyle = col;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + this.frame * 0.3;
        const r0 = 120 + ((i * 37) % 60), r1 = 420;
        ctx.lineWidth = 1 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    applyDistortions(ctx) {
      if (!this.distorts.length || !hasDoc) { this.distorts.length = 0; return; }
      const canvas = ctx.canvas;
      for (const d of this.distorts) {
        const sx = this.cam.sx(d.x), sy = this.cam.sy(d.y), r = d.r * this.cam.ez;
        if (r < 4) continue;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.clip();
        // k < 1 pinches (Blue), k > 1 bulges (Red)
        const k = d.k;
        const src = r / k;
        try {
          ctx.drawImage(canvas, sx - src, sy - src, src * 2, src * 2, sx - r, sy - r, r * 2, r * 2);
        } catch (e) {}
        ctx.restore();
      }
      this.distorts.length = 0;
    }

    applyTear(ctx) {
      const t = this.tear;
      t.t++;
      if (t.t > t.life) { this.tear = null; return; }
      if (!hasDoc) return;
      if (!this._tearBuf) { this._tearBuf = document.createElement('canvas'); this._tearBuf.width = W; this._tearBuf.height = H; }
      const b = this._tearBuf.getContext('2d');
      b.clearRect(0, 0, W, H);
      b.drawImage(ctx.canvas, 0, 0);
      const x0 = this.cam.sx(t.x0), y0 = this.cam.sy(t.y0), x1 = this.cam.sx(t.x1), y1 = this.cam.sy(t.y1);
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      const k = t.t < t.life * 0.3 ? t.t / (t.life * 0.3) : 1 - (t.t - t.life * 0.3) / (t.life * 0.7);
      const off = t.amount * k;
      const far = 2000;
      const half = (sgn) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x0 - dx / l * far, y0 - dy / l * far);
        ctx.lineTo(x0 + dx / l * far, y0 + dy / l * far);
        ctx.lineTo(x0 + dx / l * far + nx * far * sgn, y0 + dy / l * far + ny * far * sgn);
        ctx.lineTo(x0 - dx / l * far + nx * far * sgn, y0 - dy / l * far + ny * far * sgn);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(this._tearBuf, (dx / l) * off * sgn + nx * off * 0.4 * sgn, (dy / l) * off * sgn + ny * off * 0.4 * sgn);
        ctx.restore();
      };
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      half(1);
      half(-1);
      // bright seam
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
      ctx.lineWidth = 1 + 3 * k;
      ctx.beginPath();
      ctx.moveTo(x0 - dx / l * far, y0 - dy / l * far);
      ctx.lineTo(x0 + dx / l * far, y0 + dy / l * far);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,40,40,${0.6 * k})`;
      ctx.lineWidth = 6 * k + 2;
      ctx.stroke();
      ctx.restore();
    }

    destroy() {
      if (JJK.Voice && JJK.Voice.offCaption && this._capFn) JJK.Voice.offCaption(this._capFn);
    }
  }

  // setTimeout that is safe for headless simulation (runs immediately-later via queue)
  function setTimeoutSafe(fn, ms) {
    if (typeof setTimeout !== 'undefined' && !JJK.HEADLESS) setTimeout(fn, ms);
  }
  JJK.setTimeoutSafe = setTimeoutSafe;

  JJK.Battle = Battle;
})();
