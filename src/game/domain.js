// Domain Expansion system: startup (interruptible), activation cinematics,
// domain effects (Unlimited Void / Malevolent Shrine), Simple Domain escape,
// burnout, and the skill-based Domain Clash minigame.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN, FX = JJK.FX;
  const R = (a, b) => a + Math.random() * (b - a);
  const snd = (n, o) => JJK.Audio && JJK.Audio.play(n, o);
  const D = (JJK.Domain = {});

  const INFO = {
    void: { name: 'UNLIMITED VOID', jp: '無量空処', dur: 300, color: '#9fe0ff', banner: { top: '#ffffff', mid: '#bfe8ff', mid2: '#5fb0ff', bot: '#10306a', outline: '#000814' }, music: 'void' },
    shrine: { name: 'MALEVOLENT SHRINE', jp: '伏魔御厨子', dur: 360, color: '#ff4040', banner: { top: '#ffffff', mid: '#ff9090', mid2: '#e01010', bot: '#3a0000', outline: '#0a0000' }, music: 'shrine' },
  };
  D.INFO = INFO;
  const BURNOUT = 240;

  // ------------------------------------------------------------- startup
  D.typeOf = (f) => f.def.domainType;

  D.begin = function (f, m, type) {
    if (!f.spend(200)) return false;
    f.dg = 0;
    const o = m.opp(f);
    f.cs.domainType = type;
    // clash: opponent's domain is starting up, or is active and we are not immobilized
    const oStart = o.st === 'move' && o.move && o.move.id === 'domain';
    const active = m.domain && m.domain.owner === o && !(f.domainStun > 0);
    if (oStart || active) {
      m.pendingClash = { a: o, b: f };
    }
    snd('domain_activate', { vol: 0.5, pan: f.pan() });
    FX.spawn('ring', f.x, f.y + 100, { life: 24, size: 140, size2: 20, color: INFO[type].color, w: 3, add: true });
    m.popText(f, 'DOMAIN EXPANSION', INFO[type].color, true);
    if (JJK.Voice) JJK.Voice.say(f.def.id, 'domain');
    m.domainStartup = { owner: f, type };
    return true;
  };

  D.startupTick = function (f, m, mf) {
    const mv = f.move;
    // gathering energy, visibly vulnerable
    const c = f.anchor('chest');
    if (mf % 2 === 0) {
      const a = Math.random() * Math.PI * 2, d = R(60, 120);
      FX.spawn('px', c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, { vx: -Math.cos(a) * d / 12, vy: -Math.sin(a) * d / 12, life: 12, size: 2, color: INFO[D.typeOf(f)].color, add: true });
    }
    m.darken = Math.max(m.darken, Math.min(0.6, mf / mv.s * 0.6));
    if (m.stage) m.stage.darken = Math.max(m.stage.darken || 0, mf / mv.s * 0.5);
    if (mf === mv.s) {
      m.domainStartup = null;
      if (m.pendingClash) {
        const pc = m.pendingClash;
        m.pendingClash = null;
        const other = pc.a === f ? pc.b : pc.a;
        const otherLive = (other.st === 'move' && other.move && other.move.id === 'domain') || (m.domain && m.domain.owner === other);
        if (otherLive) { D.startClash(m, pc.a, pc.b); return; }
      }
      // if the opponent is mid-startup of their own domain, wait for them (clash resolves at their activation)
      const o = m.opp(f);
      if (o.st === 'move' && o.move && o.move.id === 'domain' && o.mf < o.move.s) {
        m.pendingClash = { a: f, b: o };
        return 'hold';
      }
      D.activate(f, m, D.typeOf(f));
    }
  };

  // Called by Battle when the startup was interrupted
  D.checkInterrupt = function (m) {
    const ds = m.domainStartup;
    if (!ds) return;
    const f = ds.owner;
    if (f.st !== 'move' || !f.move || f.move.id !== 'domain') {
      m.domainStartup = null;
      if (m.pendingClash && (m.pendingClash.a === f || m.pendingClash.b === f)) {
        // the other one still expands normally
        const other = m.pendingClash.a === f ? m.pendingClash.b : m.pendingClash.a;
        m.pendingClash = null;
        if (other.st === 'move' && other.move && other.move.id === 'domain') m.domainStartup = { owner: other, type: D.typeOf(other) };
      }
      f.meter = Math.min(300, f.meter + 100);
      f.dg = 50;
      m.popText(f, 'DOMAIN BROKEN', '#ff8080', true);
      snd('domain_shatter', { pan: f.pan() });
      const c = f.anchor('chest');
      for (let i = 0; i < 20; i++) FX.spawn('debris', c[0], c[1], { vx: R(-5, 5), vy: R(-1, 6), ay: -0.3, life: 40, size: R(2, 4), color: INFO[D.typeOf(f)].color, color2: '#fff', vr: R(-0.4, 0.4), floor: 0 });
    }
  };

  // ------------------------------------------------------------- activation
  D.activate = function (f, m, type, opts = {}) {
    const info = INFO[type];
    const o = m.opp(f);
    const head = f.anchor('head');
    if (JJK.Music) JJK.Music.cut();
    snd('domain_activate');
    snd(type === 'void' ? 'void_open' : 'shrine_open');
    if (JJK.Audio) JJK.Audio.rumble(0, 1, 1, 600), JJK.Audio.rumble(1, 1, 1, 600);
    m.projectiles.length = 0;
    const dur = opts.short ? 70 : 128;
    const fdur = Math.round(info.dur * (opts.durMul || 1));
    m.cinematic({
      dur, letterbox: 34, dark: 0.95,
      start(m) {
        f.eyesOpen = type === 'void';
        m.flashScreen('#000000', 1, 8);
      },
      update(m, t) {
        const cam = m.cam;
        if (!opts.short && t < 56) cam.override = { x: head[0] + f.facing * 8, y: head[1] - 14, zoom: 3.4, speed: 0.25 };
        else if (t < dur - 30) cam.override = { x: (f.x + o.x) / 2, y: JJK.CAM_BASE_Y + 20, zoom: 0.85, speed: 0.12 };
        else cam.override = { x: U.clamp((f.x + o.x) / 2, -cam.limit, cam.limit), y: JJK.CAM_BASE_Y, zoom: 1, speed: 0.15 };
        const tt = opts.short ? 0 : 56;
        if (t === tt) {
          m.flashScreen('#ffffff', 0.9, 10);
          cam.shake(0.7);
          if (m.stage && m.stage.setMode) m.stage.setMode(type, { originX: f.x, frames: 40, shrineX: f.x - f.facing * 170 });
          m.domainVisual = { type, owner: f, t: 0 };
          snd('explosion', { vol: 0.8 });
        }
        if (t > tt && t % 3 === 0) {
          const c = f.anchor('chest');
          FX.spawn('ring', c[0], c[1], { life: 20, size: 10, size2: 200, color: info.color, w: 2, add: true });
        }
        f.hairLift = type === 'void' ? 5 : 2;
      },
      draw(ctx, m, t) {
        if (t > 10 && t < (opts.short ? 60 : 56)) {
          JJK.Font.draw(ctx, 'DOMAIN EXPANSION', 320, 300, { color: '#ffffff', align: 'center', outline: '#000', scale: 2 });
        }
        if (t > (opts.short ? 10 : 64)) {
          const b = JJK.Font.banner(info.name, Object.assign({ scale: 5 }, info.banner));
          if (b) {
            const k = Math.min(1, (t - (opts.short ? 10 : 64)) / 8);
            ctx.globalAlpha = k;
            ctx.drawImage(b, Math.round(320 - b.width / 2), 96);
            ctx.globalAlpha = 1;
          }
          D.drawKanji(ctx, info.jp, 320, 172, info.color);
        }
      },
      onEnd(m) {
        f.eyesOpen = false;
        f.hairLift = 0;
        D.startDomain(f, m, type, fdur);
      },
    });
  };

  D.drawKanji = function (ctx, text, x, y, color) {
    if (!ctx.fillText) return;
    ctx.save();
    ctx.font = 'bold 22px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", "MS Mincho", serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  D.startDomain = function (f, m, type, dur) {
    const o = m.opp(f);
    m.domain = { owner: f, victim: o, type, t: 0, dur, dmg: 0, simple: false, nextSlash: 20 };
    if (JJK.Music) JJK.Music.play(INFO[type].music, 0.05);
    if (JJK.Audio) m.domain.amb = JJK.Audio.loop(type === 'void' ? 'void_ambience' : 'shrine_ambience', { vol: 0.6 });
    f.cs.infSuspended = false;
    if (type === 'void') {
      // sure-hit: overwhelming information immobilizes the target
      o.domainStun = 160;
      o.move = null;
      if (o.st !== 'down' && o.st !== 'juggle') { o.st = 'dizzy'; o.sf = 0; o.stun = 160; o.setAnim('dizzy'); o.vx = 0; }
      m.popText(o, 'MASH TO RESIST', '#ffffff');
      if (o.canAfford(100)) m.popText(o, 'UNIQUE: SIMPLE DOMAIN', '#bfe8ff');
    } else {
      m.popText(o, 'SURVIVE!', '#ff8080', true);
      if (o.canAfford(100)) m.popText(o, 'UNIQUE: SIMPLE DOMAIN', '#ffb0b0');
      f.cs.shrineBuff = true;
    }
    m.simplePrompt = { f: o, t: 60 };
  };

  // ------------------------------------------------------------- per-tick
  D.update = function (m) {
    const d = m.domain;
    if (!d) return;
    d.t++;
    const f = d.owner, o = d.victim;
    if (m.domainVisual) m.domainVisual.t++;
    // Simple Domain: spend 100 CE within the prompt window to resist the sure-hit
    if (m.simplePrompt) {
      const sp = m.simplePrompt;
      sp.t--;
      if (!d.simple && (o.buf.pr(0) & B.UN || (o.cpu && o.cpu.wantSimple)) && o.spend(100)) {
        d.simple = true;
        o.domainStun = Math.round((o.domainStun || 0) * 0.45);
        if (o.st === 'dizzy') o.stun = Math.min(o.stun, o.domainStun);
        m.popText(o, 'SIMPLE DOMAIN', '#ffffff', true);
        snd('perfect_guard', { pan: o.pan() });
        const c = o.anchor('chest');
        FX.spawn('ring', c[0], c[1] - 60, { life: 30, size: 20, size2: 70, color: '#ffffff', w: 2, add: true });
        m.simplePrompt = null;
      }
      if (sp.t <= 0) m.simplePrompt = null;
    }
    if (d.type === 'void') {
      if (o.domainStun > 0) {
        o.domainStun--;
        // information streams into the victim
        if (d.t % 2 === 0) {
          const h = o.anchor('head');
          const a = Math.random() * Math.PI * 2, r = R(80, 200);
          FX.spawn('line', h[0] + Math.cos(a) * r, h[1] + Math.sin(a) * r, { x2: h[0], y2: h[1], life: 6, size: 1, color: U.pick(['#ffffff', '#bfe8ff', '#7fd0ff']), add: true });
        }
        if (o.st === 'dizzy' && o.stun > o.domainStun) o.stun = o.domainStun;
      }
      // damage cap: the void cannot be a guaranteed kill
      if (o.combo.dmg > (d.simple ? 160 : 280) && o.domainStun > 0) { o.domainStun = 0; if (o.st === 'dizzy') o.stun = 0; m.popText(o, 'BROKE FREE', '#ffffff'); }
    } else {
      // Malevolent Shrine: sure-hit slashes rain on the victim
      if (d.t >= d.nextSlash && !o.ko) {
        const big = d.t % 60 < 4 && d.t > 40;
        d.nextSlash = d.t + Math.max(12, 22 - Math.floor(d.t / 40));
        D.shrineSlash(m, f, o, big, d.simple);
      }
    }
    if (d.t >= d.dur || f.ko || o.ko) D.end(m);
  };

  D.shrineSlash = function (m, f, o, big, simple) {
    const c = o.anchor(U.pick(['chest', 'head', 'hip']));
    const ang = R(-1.4, 1.4);
    const len = big ? 160 : 90;
    FX.spawn('slash', c[0] - Math.cos(ang) * len / 2, c[1] - Math.sin(ang) * len / 2, { x2: c[0] + Math.cos(ang) * len / 2, y2: c[1] + Math.sin(ang) * len / 2, life: 9, size: big ? 4 : 2, color: '#ff2020' });
    snd('shrine_slash', { pan: o.pan(), pitch: R(0.9, 1.2) });
    if (m.stage && m.stage.slashMark && Math.random() < 0.3) m.stage.slashMark(c[0] - 40, R(0, 30), c[0] + 40, R(0, 60));
    if (o.invulnTo('proj') && o.st !== 'dizzy') return;
    if (o.st === 'down' || o.st === 'techroll') return;
    let dmg = big ? 26 : 9;
    if (simple) dmg = Math.round(dmg * 0.5);
    if (big) {
      const h = { dmg, tier: 6, str: 'h', hs: 16, guard: 'unblockable', pb: 2, spark: '#ff9090', sfx: 'cleave_hit', minScale: 1, jug: 1 };
      JJK.Combat.hit(m, f, o, h, c, { moveId: 'shrine' + m.frame }, JJK.STR.h);
    } else {
      o.hp = Math.max(o.hp - dmg, m.training ? 1 : 0);
      o.dmgTakenRound += dmg;
      o.flash = 2;
      o.hitstop = Math.max(o.hitstop, 3);
      f.meterGain(dmg * 0.3);
      FX.hitSpark(c[0], c[1], Math.sign(o.x - f.x) || 1, 0.3, '#ff9090');
      if (m.hud) m.hud.onHit(f, o, { dmg });
      if (o.hp <= 0) m.onKO(o, f, { dmg });
    }
  };

  D.end = function (m) {
    const d = m.domain;
    if (!d) return;
    const f = d.owner, o = d.victim;
    m.domain = null;
    m.domainVisual = null;
    if (d.amb) d.amb.stop(0.6);
    if (m.stage && m.stage.setMode) m.stage.setMode('normal', { frames: 30 });
    snd('domain_shatter');
    m.flashScreen('#ffffff', 0.5, 10);
    m.cam.shake(0.4);
    o.domainStun = 0;
    if (o.st === 'dizzy') { o.stun = 0; }
    f.cs.shrineBuff = false;
    // technique burnout after a domain
    f.burnout = BURNOUT;
    if (f.cs.infOn !== undefined) { f.cs.infOn = false; }
    if (f.cs.da) f.cs.da = false;
    m.popText(f, 'BURNOUT', '#a0a0b0', true);
    snd('burnout', { pan: f.pan() });
    if (JJK.Music && m.phase === 'fight') JJK.Music.play('battle', 0.6);
  };

  // ------------------------------------------------------------- clash
  D.startClash = function (m, a, b) {
    // a = first expander, b = counter-expander
    if (m.domain) { const d = m.domain; if (d.amb) d.amb.stop(0.2); m.domain = null; d.victim.domainStun = 0; }
    if (JJK.Music) JJK.Music.cut();
    snd('domain_clash');
    m.projectiles.length = 0;
    const left = a.x < b.x ? a : b;
    const right = left === a ? b : a;
    m.clash = {
      a, b, left, right, t: 0, round: 0, rounds: 3, scores: new Map([[a, 0], [b, 0]]),
      phase: 'intro', ring: 0, speed: 1, pressed: new Map(), results: [], split: 0.5, splitV: 0,
      loop: JJK.Audio ? JJK.Audio.loop('domain_clash_loop', { vol: 0.7 }) : null,
    };
    for (const f of [a, b]) { f.move = null; f.st = 'cinematic'; f.setAnim('domainSign2' in f.def.poses ? 'idle' : 'idle'); f.vx = 0; f.vy = 0; }
    if (m.stage && m.stage.setMode) m.stage.setMode('clash', { split: 0.5, leftMode: D.typeOf(left), rightMode: D.typeOf(right), frames: 20 });
    m.banner('DOMAIN CLASH', { life: 90, scale: 6, top: '#ffffff', mid: '#ffd0ff', mid2: '#c060ff', bot: '#300050' });
    if (JJK.Voice) JJK.Voice.announce('Domain clash');
    m.cam.shake(0.6);
  };

  D.updateClash = function (m) {
    const c = m.clash;
    c.t++;
    const [f1, f2] = [c.left, c.right];
    for (const f of [f1, f2]) {
      f.readInput();
      f.pose = JJK.Rig.full(f.def.poses.domainSign2 || f.def.poses.idle);
      f.updatePose();
      f.hairLift = 4;
    }
    m.cam.override = { x: U.clamp((f1.x + f2.x) / 2, -m.cam.limit, m.cam.limit), y: JJK.CAM_BASE_Y + 10, zoom: 1.08, speed: 0.1 };
    // boundary wobble + tug of war based on scores
    const diff = (c.scores.get(f1) - c.scores.get(f2));
    const target = U.clamp(0.5 + diff * 0.12, 0.15, 0.85) + Math.sin(c.t * 0.15) * 0.03;
    c.splitV += (target - c.split) * 0.05; c.splitV *= 0.85; c.split += c.splitV;
    if (m.stage && m.stage.setSplit) m.stage.setSplit(c.split);
    m.cam.shake(0.03);
    if (c.loop) c.loop.setLevel(0.5 + 0.5 * Math.abs(diff) / 3);
    if (c.phase === 'intro') {
      if (c.t >= 70) { c.phase = 'ring'; c.ring = 0; c.pressed = new Map(); c.speed = [1.0, 1.25, 1.5][c.round] * (0.9 + JJK.rng() * 0.25); }
      return;
    }
    if (c.phase === 'ring') {
      c.ring += c.speed;
      const r = D.ringR(c);
      for (const f of [f1, f2]) {
        if (c.pressed.has(f)) continue;
        let press = f.buf.pr(0) & (B.L | B.M | B.H | B.SP | B.SU | B.UN);
        if (f.cpu) press = f.cpu.clashPress(r);
        if (press) {
          const err = Math.abs(r - 16);
          const score = err <= 2 ? 1 : err <= 6 ? 0.6 : err <= 12 ? 0.25 : 0;
          c.pressed.set(f, { score, r });
          c.scores.set(f, c.scores.get(f) + score);
          snd(score >= 1 ? 'perfect_guard' : score > 0 ? 'block' : 'ui_error', { pan: f === f1 ? -0.6 : 0.6 });
          m.cam.shake(0.1 + score * 0.2);
        }
      }
      if (r <= -6 || c.pressed.size === 2) {
        c.results.push(new Map(c.pressed));
        c.phase = 'result'; c.pt = 0;
      }
      return;
    }
    if (c.phase === 'result') {
      c.pt++;
      if (c.pt >= 40) {
        c.round++;
        if (c.round >= c.rounds) { c.phase = 'resolve'; c.pt = 0; }
        else { c.phase = 'ring'; c.ring = 0; c.pressed = new Map(); c.speed = [1.0, 1.25, 1.5][c.round] * (0.9 + JJK.rng() * 0.25); }
      }
      return;
    }
    if (c.phase === 'resolve') {
      c.pt++;
      if (c.pt === 1) {
        const s1 = c.scores.get(f1), s2 = c.scores.get(f2);
        c.winner = Math.abs(s1 - s2) < 0.2 ? null : s1 > s2 ? f1 : f2;
        if (c.winner) m.banner(c.winner.def.name + ' PREVAILS', { life: 80, scale: 4 });
        else m.banner('BOTH DOMAINS SHATTER', { life: 80, scale: 3 });
        snd('domain_shatter');
        m.flashScreen('#ffffff', 0.8, 12);
        m.cam.shake(0.8);
      }
      if (c.pt >= 60) {
        if (c.loop) c.loop.stop(0.3);
        m.clash = null;
        m.cam.override = null;
        for (const f of [f1, f2]) { f.st = 'idle'; f.toNeutral(); f.hairLift = 0; }
        if (c.winner) {
          const loser = m.opp(c.winner);
          loser.burnout = BURNOUT;
          m.popText(loser, 'BURNOUT', '#a0a0b0', true);
          D.activate(c.winner, m, D.typeOf(c.winner), { short: true, durMul: 0.75 });
        } else {
          for (const f of [f1, f2]) f.burnout = BURNOUT;
          if (m.stage && m.stage.setMode) m.stage.setMode('normal', { frames: 30 });
          if (JJK.Music) JJK.Music.play('battle');
        }
      }
    }
  };

  D.ringR = function (c) { return 70 - c.ring * 1.1; };

  D.drawClash = function (ctx, m) {
    const c = m.clash;
    const W = JJK.W;
    // boundary energy
    const bx = c.split * W;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const pts = FX.boltPath(bx + R(-4, 4), 0, bx + R(-4, 4), 360, 18, 12, (m.frame * 7 + i * 31) | 0);
      FX.strokePts(ctx, pts, 3 - i, i === 0 ? '#ffffff' : i === 1 ? '#e0a0ff' : '#ff6060');
    }
    ctx.restore();
    if (c.phase === 'ring' || c.phase === 'result') {
      const r = D.ringR(c);
      const sides = [[c.left, 150], [c.right, 490]];
      for (const [f, x] of sides) {
        const y = 200;
        const col = f.def.id === 'gojo' ? '#9fe0ff' : '#ff8080';
        // target ring
        FX.pxRing(ctx, x, y, 18, 4, 'rgba(255,255,255,0.9)');
        FX.pxRing(ctx, x, y, 14, 1, col);
        // closing ring
        const pr = c.pressed.get(f);
        const rr = pr ? pr.r : r;
        if (rr > 0) FX.pxRing(ctx, x, y, rr, 2, pr ? '#ffffff' : col);
        if (pr) {
          const t = pr.score >= 1 ? 'PERFECT' : pr.score >= 0.6 ? 'GREAT' : pr.score > 0 ? 'GOOD' : 'MISS';
          JJK.Font.draw(ctx, t, x, y + 30, { color: pr.score >= 1 ? '#ffffff' : pr.score > 0 ? col : '#808080', align: 'center', outline: '#000', scale: 2 });
        } else {
          JJK.Font.draw(ctx, 'PRESS!', x, y + 30, { color: '#ffffff', align: 'center', outline: '#000', scale: 1 });
        }
        // score pips
        for (let i = 0; i < c.rounds; i++) {
          const res = c.results[i] && c.results[i].get(f);
          const pc = res ? (res.score >= 1 ? '#ffffff' : res.score > 0 ? col : '#404040') : '#202020';
          FX.pxCircle(ctx, x - 16 + i * 16, y - 34, 4, pc);
        }
      }
      JJK.Font.draw(ctx, 'ROUND ' + (c.round + 1) + ' / ' + c.rounds, 320, 300, { color: '#ffffff', align: 'center', outline: '#000' });
      JJK.Font.draw(ctx, 'PRESS ANY ATTACK WHEN THE RINGS ALIGN', 320, 312, { color: '#d0c0ff', align: 'center', outline: '#000' });
    }
  };

  // Lights from domain visuals
  D.lights = function (m) {
    const d = m.domain;
    if (!d) return;
    if (d.type === 'void') FX.light(d.owner.x, 260, 500, [60, 120, 255], 0.5);
    else FX.light(d.owner.x - d.owner.facing * 170, 160, 420, [255, 30, 20], 0.6);
  };

  D.drawBack = function (ctx, m) {};
  D.drawFront = function (ctx, m) {
    const d = m.domain;
    if (!d) return;
    const cam = m.cam;
    if (d.type === 'void' && d.victim.domainStun > 0) {
      // the victim's mind is flooded: a halo of white glyph-like noise around the head
      const h = d.victim.anchor('head');
      const sx = cam.sx(h[0]), sy = cam.sy(h[1]);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#e8f6ff';
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, r = R(16, 40) * cam.ez;
        ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 1 + (i % 2), 1);
      }
      ctx.restore();
    }
    // timer bar for the domain
    const k = 1 - d.t / d.dur;
    const col = d.type === 'void' ? '#9fe0ff' : '#ff5050';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(220, 66, 200, 5);
    ctx.fillStyle = col;
    ctx.fillRect(221, 67, Math.round(198 * k), 3);
    JJK.Font.draw(ctx, INFO[d.type].name, 320, 74, { color: col, align: 'center', outline: '#000' });
  };
})();
