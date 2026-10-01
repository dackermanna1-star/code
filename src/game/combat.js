// Combat resolution: hitbox tests, hits, blocks, perfect guards, parries,
// counter hits, damage scaling, juggle limits, guard crush and throws.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN;
  const S = JJK.CHAR_SCALE;

  const STR = {
    l: { stop: 7, shake: 0.07, pb: 4.2, sfx: 'hit_l', gdmg: 4, spark: 0.25, grunt: 'hurt' },
    m: { stop: 9, shake: 0.13, pb: 5.2, sfx: 'hit_m', gdmg: 7, spark: 0.45, grunt: 'hurt' },
    h: { stop: 12, shake: 0.24, pb: 6.4, sfx: 'hit_h', gdmg: 11, spark: 0.75, grunt: 'hurt_heavy' },
    s: { stop: 11, shake: 0.3, pb: 6.6, sfx: 'hit_h', gdmg: 12, spark: 0.8, grunt: 'hurt_heavy' },
    x: { stop: 16, shake: 0.5, pb: 8, sfx: 'hit_super', gdmg: 20, spark: 1, grunt: 'hurt_heavy' },
  };
  JJK.STR = STR;
  const JUG_MAX = 16;
  const MIN_SCALE = 0.3;

  const C = (JJK.Combat = {});

  C.overlap = function (a, b) {
    return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  };

  // World hitbox of a move hit for fighter f.
  // Strike hitboxes cover the striking limb from mid-forearm/shin to the fist/foot,
  // so point-blank attacks connect even when the fist extends past the body.
  const PARENT = { fh: 'fe', nh: 'ne', ff: 'fk', nf: 'nk' };
  C.hitbox = function (f, h) {
    if (h.at) {
      const p = f.anchor(h.at);
      const r = (h.r || 12) * S;
      const ox = (h.off ? h.off[0] : 0) * S * f.facing, oy = (h.off ? h.off[1] : 0) * S;
      let x0 = p[0], y0 = p[1], x1 = p[0], y1 = p[1];
      const par = PARENT[h.at];
      if (par && !h.point) {
        const q = f.anchor(par);
        const mx = q[0] + (p[0] - q[0]) * 0.25, my = q[1] + (p[1] - q[1]) * 0.25;
        x0 = Math.min(x0, mx); x1 = Math.max(x1, mx); y0 = Math.min(y0, my); y1 = Math.max(y1, my);
      }
      const rv = r * 0.8;
      return [x0 + ox - r, y0 + oy - rv, x1 + ox + r, y1 + oy + rv];
    }
    return f.boxToWorld(h.box);
  };

  function contactPoint(a, b) {
    return [(Math.max(a[0], b[0]) + Math.min(a[2], b[2])) / 2, (Math.max(a[1], b[1]) + Math.min(a[3], b[3])) / 2];
  }

  // Gather melee hits of att against def this frame (without applying).
  C.findMelee = function (att, def) {
    if (att.st !== 'move' || !att.move || !att.move.hits) return null;
    const mv = att.move;
    for (let i = 0; i < mv.hits.length; i++) {
      const h = mv.hits[i];
      if (att.mf < h.f[0] || att.mf > h.f[1]) continue;
      if (att.hitIds[i]) continue;
      const kind = h.throw ? 'throw' : 'strike';
      if (def.invulnTo(kind, att.air)) continue;
      if (def.st === 'juggle' && def.combo.jug >= JUG_MAX && !h.otg) continue;
      if (h.ground && def.y > 2) continue;
      if (h.airOnly && def.y <= 2) continue;
      const hb = C.hitbox(att, h);
      for (const hu of def.hurt) {
        if (C.overlap(hb, hu)) {
          return { att, def, h, i, kind, pt: contactPoint(hb, hu), mv };
        }
      }
    }
    return null;
  };

  // Which way is the attack coming from (world x sign relative to defender)
  function attackSide(def, src) {
    const sx = src.x != null ? src.x : def.x;
    if (Math.abs(sx - def.x) < 1) return -def.facing * -1;
    return sx > def.x ? 1 : -1;
  }

  C.canBlock = function (def, h, srcX, fromAir) {
    if (h.guard === 'unblockable' || h.throw) return false;
    const st = def.st;
    const okState = st === 'idle' || st === 'walkB' || st === 'walkF' || st === 'guard' || st === 'cguard' || st === 'crouch' ||
      st === 'block' || st === 'ablock' || (st === 'air' && !def.move) || (st === 'land' && def.sf > 1) || st === 'prejump';
    if (!okState) return false;
    const d = def.buf.dir(0);
    const relH = d === 4 || d === 1 || d === 7 ? -1 : d === 6 || d === 3 || d === 9 ? 1 : 0;
    if (!relH) return false;
    const absH = relH * def.facing;
    const side = srcX > def.x ? 1 : srcX < def.x ? -1 : def.facing;
    if (absH !== -side) return false;
    const airborne = def.y > 0.5 || st === 'air' || st === 'ablock';
    if (airborne) return h.airBlockable !== false;
    const crouching = d === 1;
    if (h.guard === 'high' && crouching) return false;
    if (h.guard === 'low' && !crouching) return false;
    return true;
  };

  // Resolve a single contact. src: {x,y} origin of the attack (fighter or projectile)
  // Returns 'hit' | 'block' | 'parry' | 'nullified' | 'countered' | 'whiff'
  C.resolve = function (m, att, def, h, pt, ctx) {
    ctx = ctx || {};
    const src = ctx.proj || att;
    const kind = ctx.kind || (h.throw ? 'throw' : ctx.proj ? 'proj' : 'strike');
    const str = STR[h.str || 'm'];
    // character-specific interception (Infinity, Domain Amplification ...)
    if (def.def.preHit) {
      const r = def.def.preHit(def, att, h, { kind, pt, proj: ctx.proj, m });
      if (typeof r === 'string') return r;
      if (r && r.dmgMul) ctx.dmgMul = (ctx.dmgMul || 1) * r.dmgMul;
    }
    if (att.def.preDeal) {
      const r = att.def.preDeal(att, def, h, { kind, pt, proj: ctx.proj, m });
      if (typeof r === 'string') return r;
      if (r && r.dmgMul) ctx.dmgMul = (ctx.dmgMul || 1) * r.dmgMul;
    }
    // throws
    if (kind === 'throw') return C.throwConnect(m, att, def, h);
    // parry
    if (def.st === 'move' && def.move.parry && def.mf >= def.move.parry[0] && def.mf <= def.move.parry[1] && h.guard !== 'unblockable' && !h.noParry) {
      C.parry(m, att, def, h, pt, ctx);
      return 'parry';
    }
    // counter stances
    if (def.st === 'move' && def.move.counter && def.mf >= def.move.counter[0] && def.mf <= def.move.counter[1] && h.guard !== 'unblockable') {
      const types = def.move.counterTypes || ['strike'];
      if (types.includes(kind)) {
        if (def.move.onCounter(def, att, m, { h, pt, proj: ctx.proj }) !== false) return 'countered';
      }
    }
    if (C.canBlock(def, h, src.x, att.air)) {
      C.block(m, att, def, h, pt, ctx, str);
      return 'block';
    }
    C.hit(m, att, def, h, pt, ctx, str);
    return 'hit';
  };

  C.block = function (m, att, def, h, pt, ctx, str) {
    const proj = ctx.proj;
    const pgWin = 5 + (def.def.pgBonus || 0);
    const perfect = def.backHeld > 0 && def.backHeld <= pgWin && def.st !== 'block' && def.st !== 'ablock';
    const airborne = def.y > 0.5;
    const d = def.buf.dir(0);
    def.crouchBlock = !airborne && d === 1;
    def.st = airborne ? 'ablock' : 'block';
    def.sf = 0;
    def.move = null;
    def.stun = Math.max(1, Math.round((h.bs || 12) * (perfect ? 0.55 : 1)));
    def.setAnim(airborne ? 'ablock' : def.crouchBlock ? 'cblock' : 'block');
    // chip
    const dmgMul = (att.dmgMul ? att.dmgMul() : 1);
    let chip = h.chip != null ? h.chip : (h.tier || 1) >= 4 ? (h.dmg || 0) * 0.14 : 0;
    chip *= dmgMul;
    if (perfect) chip = 0;
    if (chip > 0) {
      chip = Math.round(chip);
      const canKO = (h.tier || 1) >= 6;
      def.hp = canKO ? def.hp - chip : Math.max(1, def.hp - chip);
      def.dmgTakenRound += chip;
    }
    // guard damage
    const gd = (h.gdmg != null ? h.gdmg : str.gdmg) * (perfect ? 0 : 1);
    def.guard -= gd;
    def.guardDelay = 70;
    // pushback
    const side = (proj ? proj.x : att.x) > def.x ? 1 : -1;
    const pb = (h.pb != null ? h.pb : str.pb) * (perfect ? 0.5 : 1);
    def.vx = -side * pb;
    if (airborne) { def.vy = Math.max(def.vy, 2); }
    if (!proj && Math.abs(def.x) >= JJK.WALL - 4 && Math.sign(def.x) === -side) att.vx = side * pb * 0.8;
    // hitstop
    const stop = Math.max(4, (h.stop || str.stop) - 2 + (perfect ? 5 : 0));
    def.hitstop = stop;
    if (!proj) { att.hitstop = stop; att.contact = 'block'; }
    else if (att.st === 'move') att.contact = att.contact || 'block';
    // meter
    att.meterGain((h.dmg || 10) * 0.12);
    def.meterGain(perfect ? 12 : 3 * (def.def.blockMeterMult || 1));
    if (perfect) def.dg = Math.min(100, def.dg + 1.5);
    // fx
    if (JJK.FX) {
      if (perfect) JJK.FX.perfectSpark(pt[0], pt[1]);
      else JJK.FX.blockSpark(pt[0], pt[1], side, def.def.blockColor || '#9fd8ff');
    }
    if (JJK.Audio) JJK.Audio.play(perfect ? 'perfect_guard' : (h.str === 'h' || h.str === 'x' || h.str === 's') ? 'block_heavy' : 'block', { pan: def.pan() });
    if (m.cam) m.cam.shake(perfect ? 0.12 : str.shake * 0.5);
    if (perfect) m.popText(def, 'PERFECT', '#bff8ff');
    if (def.guard <= 0) C.guardCrush(m, att, def);
    if (def.hp <= 0) m.onKO(def, att, h);
    m.onBlock(att, def, h, perfect);
  };

  C.guardCrush = function (m, att, def) {
    def.guard = 0;
    def.st = 'guardbreak'; def.sf = 0; def.stun = 48;
    def.setAnim('guardbreak');
    def.vx = -Math.sign(att.x - def.x || 1) * 3;
    def.hitstop = 16; att.hitstop = 16;
    def.guardDelay = 120;
    setTimeoutGuard(def);
    if (JJK.Audio) JJK.Audio.play('guard_break', { pan: def.pan() });
    if (JJK.FX) {
      const p = def.anchor('chest');
      JJK.FX.hitSpark(p[0], p[1], -def.facing, 1, '#7fd0ff');
      for (let i = 0; i < 18; i++) JJK.FX.spawn('debris', p[0], p[1], { vx: U.rand(-5, 5), vy: U.rand(-1, 6), ay: -0.35, life: 40, size: U.rand(2, 4), color: '#bfe8ff', color2: '#fff', vr: U.rand(-0.4, 0.4), floor: 0 });
    }
    m.popText(def, 'GUARD BREAK', '#ff6a3a');
    if (m.cam) m.cam.shake(0.4);
  };
  function setTimeoutGuard(def) { def.guardRefill = true; }

  C.parry = function (m, att, def, h, pt, ctx) {
    const proj = ctx.proj;
    def.hitstop = 14;
    def.move = null; def.st = 'idle'; def.sf = 0; def.setAnim('parry');
    def.inv = 6; def.invType = 'strike';
    def.meterGain(20);
    def.dg = Math.min(100, def.dg + 3);
    if (proj) {
      proj.dead = true;
    } else {
      att.hitstop = 14;
      att.st = 'stagger'; att.sf = 0; att.stun = 26; att.move = null; att.setAnim('stagger');
      att.vx = -att.facing * 2;
    }
    if (JJK.FX) {
      JJK.FX.perfectSpark(pt[0], pt[1]);
      JJK.FX.spawn('star', pt[0], pt[1], { life: 10, size: 40, size2: 10, color: '#fff', color2: '#ffe28a', shape: 6 });
    }
    if (JJK.Audio) JJK.Audio.play('parry', { pan: def.pan() });
    if (m.cam) { m.cam.shake(0.18); m.cam.zoomPulse(0.03); }
    m.popText(def, 'PARRY', '#ffe28a');
    m.flashScreen('#ffffff', 0.25, 4);
    m.onParry(def, att);
  };

  C.hit = function (m, att, def, h, pt, ctx, str) {
    const proj = ctx.proj;
    const wasAir = def.y > 0.5 || def.st === 'juggle' || def.st === 'air' || def.st === 'ablock';
    let ch = false, pc = false;
    if (def.st === 'move' && !def.move.noCH) {
      const ph = def.phase;
      if (ph === 'startup' || ph === 'active') ch = true;
      else if (ph === 'recovery') pc = true;
    } else if (def.st === 'prejump' || (def.st === 'land' && def.landLag > 4)) pc = true;
    // combo bookkeeping & damage scaling
    const combo = def.combo;
    if (combo.hits === 0) {
      combo.starter = h.starter != null ? h.starter : (h.tier || 1) === 1 ? 0.85 : 1;
      combo.time = 0;
    }
    combo.hits++;
    const hits = combo.hits;
    let scale = combo.starter * Math.max(MIN_SCALE, hits <= 2 ? 1 : 1 - (hits - 2) * 0.1);
    if (h.minScale) scale = Math.max(scale, h.minScale);
    const mvId = ctx.moveId || (att.move ? att.move.id : '');
    if (combo.used[mvId] && hits > 1 && !h.multi) scale *= 0.82;
    combo.used[mvId] = (combo.used[mvId] || 0) + 1;
    const dmgMul = (att.dmgMul ? att.dmgMul() : 1) * (def.dmgTakenMul ? def.dmgTakenMul() : 1);
    let blackFlash = false;
    if (!proj && att.bfArmed && (h.tier || 1) === 3) { blackFlash = true; att.bfArmed = false; }
    let dmg = (h.dmg || 0) * scale * (ch ? 1.2 : pc ? 1.1 : 1) * dmgMul * (blackFlash ? 2.5 : 1);
    if (ctx.dmgMul) dmg *= ctx.dmgMul;
    dmg = Math.max(h.dmg > 0 ? 1 : 0, Math.round(dmg));
    const t = m.training;
    def.hp -= dmg;
    def.dmgTakenRound += dmg;
    combo.dmg += dmg;
    if ((h.tier || 1) < 6) def.red = Math.min(def.red + dmg * 0.22, 200);
    def.redDelay = 150;
    if (t && t.infHp && def.cpuDummy) def.hp = Math.max(def.hp, 1);
    // stun with decay
    const decay = Math.max(0.5, 1 - combo.time / 360);
    let hs = Math.round(((h.hs || 16) + (ch ? 4 : pc ? 2 : 0)) * (wasAir ? decay : Math.max(0.7, decay)));
    // set state
    def.move = null;
    def.sf = 0;
    const away = (proj ? (proj.vx !== 0 ? Math.sign(proj.vx) : Math.sign(def.x - proj.x) || 1) : Math.sign(def.x - att.x) || att.facing);
    const launch = h.launch || (ch && h.chLaunch);
    if (wasAir || launch || h.kdGround) {
      def.st = 'juggle';
      def.air = true;
      def.y = Math.max(def.y, 1);
      const lv = launch ? (h.lv || 9) : h.av != null ? h.av : 5.5;
      def.vy = lv * (wasAir ? Math.max(0.75, decay) : 1);
      def.vx = away * (h.lx != null ? h.lx : launch ? 2 : 3.2);
      def.stun = Math.max(hs, launch ? 30 : 20);
      def.kd = h.hkd ? 'hard' : (launch || h.kd || wasAir) ? (h.hkd ? 'hard' : 'soft') : null;
      if (!launch && wasAir && !h.kd) def.kd = combo.hits > 1 ? 'soft' : null;
      combo.jug += h.jug != null ? h.jug : (h.tier || 1) >= 4 ? 3 : 2;
      def.setAnim('juggleUp');
    } else {
      def.st = 'hit';
      def.stun = hs;
      def.vx = away * (h.pb != null ? h.pb : str.pb);
      if (Math.abs(def.x) >= JJK.WALL - 4 && Math.sign(def.x) === away && !proj) att.vx = -away * (h.pb != null ? h.pb : str.pb) * 0.85;
      def.setAnim(h.ha === 'low' ? 'hitLow' : h.ha === 'mid' || (h.str === 'h' && !h.ha) ? 'hitMid' : 'hitHigh');
    }
    const wb = (h.wb || (ch && h.chWb)) && !combo.wb;
    const gb = (h.gb || (ch && h.chGb)) && !combo.gb && (def.st === 'juggle');
    def.bounce = wb ? (h.splat ? 'splat' : 'wall') : gb ? 'ground' : null;
    if (h.special && h.special(att, def, m, ctx) === 'skip') return;
    // hitstop
    const stop = (h.stop || str.stop) + (ch ? 3 : 0);
    def.hitstop = stop;
    if (!proj) { att.hitstop = stop; att.contact = 'hit'; }
    else if (att.st === 'move' && (!ctx.ownerless)) att.contact = att.contact || 'hit';
    def.flash = 2; def.flashK = 0.85;
    // meter / domain gauge
    att.meterGain(dmg * 0.5 + (ch ? 10 : 0) + (h.meter || 0));
    def.meterGain(dmg * 0.32);
    att.dg = Math.min(100, att.dg + dmg * 0.022);
    def.dg = Math.min(100, def.dg + dmg * 0.045);
    // fx
    const power = str.spark + (ch ? 0.2 : 0);
    if (JJK.FX) JJK.FX.hitSpark(pt[0], pt[1], away, Math.min(1.2, power), h.spark || att.def.hitColor || '#ffd27a');
    if (JJK.Audio) {
      JJK.Audio.play(ch ? 'hit_counter' : (h.sfx || str.sfx), { pan: def.pan() });
      if (JJK.Voice && (h.str !== 'l' || U.chance(0.35))) JJK.Voice.grunt(def.def.id, def.hp <= 0 ? 'ko' : str.grunt);
    }
    if (m.cam) {
      m.cam.shake(str.shake + (ch ? 0.08 : 0));
      if (h.str === 'h' || h.str === 'x' || h.str === 's') m.cam.zoomPulse(h.str === 'x' ? 0.05 : 0.025);
      if (h.kick) m.cam.kick(h.kick[0] * away, h.kick[1]);
    }
    if (JJK.Audio && h.str !== 'l') JJK.Audio.rumble(def.side, h.str === 'x' ? 1 : 0.5, 0.6, h.str === 'x' ? 300 : 120);
    if (blackFlash) C.blackFlash(m, att, def, pt);
    else if (ch && (h.tier || 1) >= 3 && !proj) m.impact(2, 0xffffffff); // anime impact frame on big counters
    if (ch) m.popText(att, 'COUNTER', '#ff4a3a', true);
    else if (pc) m.popText(att, 'PUNISH', '#ffb03a', true);
    m.onHit(att, def, h, { dmg, ch, pc, pt, proj });
    if (def.hp <= 0) m.onKO(def, att, h);
  };

  // Black Flash: cursed energy distortion within a millionth of a second of impact.
  C.blackFlash = function (m, att, def, pt) {
    def.hitstop += 10; att.hitstop += 10;
    att.meterGain(60);
    att.dg = Math.min(100, att.dg + 15);
    m.impact(4, 0xff000000);
    m.flashScreen('#000000', 0.5, 6);
    m.cam.shake(0.6);
    m.cam.zoomPulse(0.06);
    m.popText(att, 'BLACK FLASH', '#ff2020', true);
    if (JJK.FX) {
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 60;
        JJK.FX.bolt(pt[0], pt[1], pt[0] + Math.cos(a) * r, pt[1] + Math.sin(a) * r, '#ff1a1a', '#000000', 12, 12);
      }
      JJK.FX.spawn('ring', pt[0], pt[1], { life: 16, size: 6, size2: 70, color: '#000000', w: 4 });
      JJK.FX.spawn('ring', pt[0], pt[1], { life: 18, size: 4, size2: 50, color: '#ff2020', w: 2, add: true });
    }
    if (JJK.Audio) { JJK.Audio.play('black_flash', { pan: def.pan() }); JJK.Audio.rumble(att.side, 1, 1, 300); }
  };

  // ----- throws ------------------------------------------------------------
  C.throwConnect = function (m, att, def, h) {
    const st = def.st;
    if (st === 'hit' || st === 'block' || st === 'juggle' || st === 'ablock' || def.y > 1 || st === 'air') return 'whiff';
    // throw vs throw = tech
    if (def.st === 'move' && def.move.isThrow && def.mf <= def.move.s + 1) {
      C.throwTech(m, att, def);
      return 'parry';
    }
    const back = att.buf.dir(0) === 4 || att.buf.dir(0) === 1;
    const id = h.throwMove || (back && att.def.moves.throwB ? 'throwB' : 'throwF');
    att.startMove(id, { free: true, data: { ex: !!h.ex } });
    def.st = 'grabbed'; def.sf = 0; def.move = null; def.vx = 0; def.vy = 0;
    def.thrower = att; def.techWindow = h.noTech ? 0 : 10;
    def.setAnim('grabbed');
    att.grab = def;
    att.hitstop = 2; def.hitstop = 2;
    if (JJK.Audio) JJK.Audio.play('throw_grab', { pan: def.pan() });
    return 'hit';
  };

  C.throwTech = function (m, att, def) {
    for (const f of [att, def]) {
      f.st = 'throwtech'; f.sf = 0; f.move = null; f.setAnim('techPush');
      f.vx = -f.facing * 5.5; f.hitstop = 8; f.grab = null; f.thrower = null;
      f.throwInv = 20;
      f.meterGain(5);
    }
    const mx = (att.x + def.x) / 2, my = 100;
    if (JJK.FX) JJK.FX.perfectSpark(mx, my);
    if (JJK.Audio) JJK.Audio.play('throw_tech');
    m.popText(def, 'THROW ESCAPE', '#bff8ff');
    if (m.cam) m.cam.shake(0.12);
  };

  // Generic throw release: deals damage and launches the victim.
  C.throwRelease = function (m, att, def, o) {
    if (def.st !== 'grabbed' && def.st !== 'thrown') return;
    def.thrower = null; att.grab = null;
    const h = Object.assign({ dmg: 110, str: 'h', tier: 3, hkd: true, kd: true, lv: o.lv || 6, lx: o.lx || 5, launch: true, ha: 'mid' }, o.h || {});
    def.st = 'idle';
    const pt = def.anchor('chest');
    C.hit(m, att, def, h, pt, { moveId: 'throw' }, STR[h.str]);
    def.st = 'juggle';
    def.kd = 'hard';
    def.vx = (o.dir || att.facing) * (o.lx || 5);
    def.vy = o.lv || 6;
    def.throwInv = 30;
    if (o.swap) def.facing = -def.facing;
  };
})();
