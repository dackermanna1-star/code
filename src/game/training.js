// Training mode: infinite health/meter, hitbox display, frame data, frame meter,
// combo damage, dummy behaviors (stand/crouch/jump/block/CPU), recording & playback.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN, Font = JJK.Font;
  const T = (JJK.Training = {});

  T.DUMMY = ['STAND', 'CROUCH', 'JUMP', 'CPU', 'RECORDING'];
  T.BLOCK = ['NONE', 'ALL', 'AFTER FIRST HIT', 'RANDOM'];

  T.makeOptions = () => ({
    infHp: true, infMeter: true, hitboxes: false, frameData: true, frameMeter: true,
    dummy: 0, block: 0, cpuLevel: 'normal',
    rec: [], recording: false, playing: false, playI: 0,
    last: null, lastCombo: null, refill: 0, blockedOnce: false,
    meterRows: [[], []],
  });

  T.setup = function (m) {
    const d = m.fighters[1];
    d.cpuDummy = true;
    d.ctrl.virtual = { dir: 5, held: 0 };
    m.fighters[0].cpuDummy = false;
  };

  T.reset = function (m, where) {
    const [a, b] = m.fighters;
    const x0 = where === 'left' ? -JJK.WALL + 60 : where === 'right' ? JJK.WALL - 160 : -100;
    a.resetRound(x0, 1);
    b.resetRound(x0 + 120, -1);
    for (const f of m.fighters) { f.meter = 300; f.dg = 100; f.st = 'idle'; f.setAnim('idle'); }
    m.projectiles.length = 0;
    m.domain = null; m.clash = null; m.cine = null;
    if (m.stage && m.stage.setMode) m.stage.setMode('normal', { frames: 1 });
    m.cam.reset();
    JJK.FX.clear();
  };

  function keyPressed(code) { return JJK.keyPressed && JJK.keyPressed(code); }

  T.tick = function (m) {
    const t = m.training;
    const [p, d] = m.fighters;
    // hotkeys
    if (keyPressed('Digit3')) T.reset(m, 'center');
    if (keyPressed('Digit4')) T.reset(m, p.x < 0 ? 'left' : 'right');
    if (keyPressed('Digit6')) t.hitboxes = !t.hitboxes;
    if (keyPressed('Digit7')) t.frameData = !t.frameData;
    if (keyPressed('Digit8')) { t.dummy = (t.dummy + 1) % T.DUMMY.length; T.applyDummy(m); }
    if (keyPressed('Digit9')) t.block = (t.block + 1) % T.BLOCK.length;
    if (keyPressed('Digit0')) t.infMeter = !t.infMeter;
    if (keyPressed('Digit1')) {
      if (!t.recording) { t.recording = true; t.rec = []; t.playing = false; m.popText(d, 'RECORDING', '#ff6060', true); }
      else { t.recording = false; m.popText(d, 'RECORDED ' + t.rec.length + 'F', '#ffffff'); }
    }
    if (keyPressed('Digit2')) { t.playing = !t.playing && t.rec.length > 0; t.playI = 0; t.recording = false; }
    const pad = JJK.padState && JJK.padState(JJK.settings.p1Pad);
    if (pad && pad.BACK && !t._padBack) T.reset(m, 'center');
    t._padBack = pad && pad.BACK;
    // infinite resources / refills
    for (const f of m.fighters) {
      if (t.infMeter) { f.meter = 300; f.dg = 100; }
      if (f.def.id === 'gojo' && t.infMeter && !f.cs.infOn) f.cs.inf = Math.max(f.cs.inf, 100);
    }
    if (t.infHp) {
      for (const f of m.fighters) {
        if (f.hp < f.maxHp && !f.isStunned() && f.combo.hits === 0) {
          t.refill = (t.refill || 0) + 1;
          if (t.refill > 50) { f.hp = f.maxHp; f.red = 0; }
        }
        f.hp = Math.max(1, f.hp);
      }
      if (m.fighters.every((f) => f.hp >= f.maxHp)) t.refill = 0;
    }
    // dummy control
    T.dummyInput(m, t, p, d);
    // frame meter
    if (t.frameMeter) {
      for (let i = 0; i < 2; i++) {
        const f = m.fighters[i];
        const row = t.meterRows[i];
        row.push(T.frameCode(f));
        if (row.length > 90) row.shift();
      }
    }
  };

  T.applyDummy = function (m) {
    const t = m.training;
    const d = m.fighters[1];
    if (T.DUMMY[t.dummy] === 'CPU') d.cpu = new JJK.AI(d, t.cpuLevel);
    else d.cpu = null;
    d.ctrl.virtual = { dir: 5, held: 0 };
  };

  T.dummyInput = function (m, t, p, d) {
    const mode = T.DUMMY[t.dummy];
    if (mode === 'CPU') return; // AI drives it
    const v = { dir: 5, held: 0 };
    if (t.recording) {
      // P1's controller drives the dummy; P1 stands still
      const c = p.ctrl;
      v.dir = c.dir; v.held = c.held;
      t.rec.push({ d: d.facing > 0 ? c.dir : JJK.mirrorDir(c.dir), h: c.held });
      p.ctrl.dir = 5; p.ctrl.held = 0; p.ctrl.pressed = 0;
      if (t.rec.length > 600) t.recording = false;
    } else if (t.playing && t.rec.length) {
      const s = t.rec[t.playI % t.rec.length];
      t.playI++;
      v.dir = d.facing > 0 ? s.d : JJK.mirrorDir(s.d);
      v.held = s.h;
    } else {
      const toward = d.facing > 0 ? 6 : 4, away = d.facing > 0 ? 4 : 6;
      if (mode === 'CROUCH') v.dir = 2;
      else if (mode === 'JUMP') v.dir = 8;
      // blocking
      const bm = T.BLOCK[t.block];
      let block = bm === 'ALL' || (bm === 'AFTER FIRST HIT' && d.combo.hits > 0) || (bm === 'RANDOM' && (m.frame >> 3) % 2 === 0) || d.st === 'block';
      if (bm === 'AFTER FIRST HIT' && d.combo.hits === 0 && d.st !== 'block') block = false;
      if (block && (m.threatened(d) || d.st === 'block' || d.st === 'ablock')) {
        let low = false;
        if (p.st === 'move' && p.move && p.move.hits) low = p.move.hits.some((h) => h.guard === 'low');
        const relDir = low || mode === 'CROUCH' ? 1 : 4;
        v.dir = d.facing > 0 ? relDir : JJK.mirrorDir(relDir);
      }
      void toward; void away;
    }
    // apply into the dummy controller; poll() will compute pressed edges
    d.ctrl.virtual = v;
  };

  // frame meter codes: 0 idle, 1 startup, 2 active, 3 recovery, 4 stun, 5 invuln
  T.frameCode = function (f) {
    if (f.hitstop > 0) return 6;
    if (f.isStunned() || f.st === 'block' || f.st === 'ablock') return 4;
    if (f.st === 'move') {
      if (f.invulnTo('strike')) return 5;
      const ph = f.phase;
      return ph === 'startup' ? 1 : ph === 'active' ? 2 : 3;
    }
    if (f.st === 'land' || f.st === 'prejump' || f.st === 'down' || f.st === 'wakeup' || f.st === 'techroll') return 3;
    return 0;
  };

  T.onMoveStart = function (m, f, mv) {
    if (f.side !== 0) return;
    m.training.last = { id: mv.id, name: mv.name, s: mv.s, a: mv.a, r: mv.r, total: mv.total, adv: null, dmg: null };
  };
  T.onHit = function (m, att, def, h, info) {
    const t = m.training;
    if (att.side === 0 && t.last && att.move) {
      t.last.dmg = info.dmg;
      const remaining = att.move.total - att.mf;
      t.last.adv = def.stun - remaining;
      t.last.ctx = info.ch ? 'COUNTER' : 'HIT';
    }
  };
  T.onComboEnd = function (m, f, combo) {
    if (f.side === 1) m.training.lastCombo = { hits: combo.hits, dmg: combo.dmg };
  };

  T.draw = function (ctx, m) {
    const t = m.training;
    const [p, d] = m.fighters;
    // block frame advantage when P1's move is blocked
    if (t.last && p.st === 'move' && p.contact === 'block' && t.last.adv == null) {
      const remaining = p.move.total - p.mf;
      t.last.adv = d.stun - remaining;
      t.last.ctx = 'BLOCK';
    }
    if (t.hitboxes) T.drawBoxes(ctx, m);
    // info panel
    if (t.frameData) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(6, 52, 168, 74);
      const L = t.last;
      let y = 56;
      const line = (s, c) => { Font.draw(ctx, s, 10, y, { color: c || '#ffffff' }); y += 9; };
      if (L) {
        line((L.name || L.id).toUpperCase().slice(0, 26), '#ffd23a');
        line('STARTUP ' + L.s + '  ACTIVE ' + L.a + '  REC ' + Math.max(0, L.total - L.s - L.a + 1));
        line('TOTAL ' + L.total + 'F');
        if (L.adv != null) line((L.ctx || '') + ' ADV ' + (L.adv >= 0 ? '+' : '') + L.adv, L.adv >= 0 ? '#80ff80' : '#ff8080');
        if (L.dmg != null) line('DAMAGE ' + L.dmg);
      } else line('PERFORM A MOVE', '#aaaaaa');
      if (t.lastCombo) line('LAST COMBO ' + t.lastCombo.hits + ' HITS / ' + t.lastCombo.dmg + ' DMG', '#ffb0a0');
      line('DUMMY ' + T.DUMMY[t.dummy] + ' / BLOCK ' + T.BLOCK[t.block], '#a0d0ff');
    }
    if (t.frameMeter) T.drawFrameMeter(ctx, m);
    // hints
    const hint = '1 REC  2 PLAY  3 RESET  4 CORNER  6 BOXES  7 DATA  8 DUMMY  9 BLOCK  0 METER';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 351, JJK.W, 9);
    Font.draw(ctx, hint, JJK.W / 2, 352, { color: '#c0c0d0', align: 'center' });
    if (t.recording) Font.draw(ctx, '● REC ' + (t.rec.length / 60).toFixed(1) + 'S', JJK.W - 10, 56, { color: '#ff4040', align: 'right', outline: '#000' });
    if (t.playing) Font.draw(ctx, '▶ PLAYBACK', JJK.W - 10, 56, { color: '#80ff80', align: 'right', outline: '#000' });
  };

  T.drawFrameMeter = function (ctx, m) {
    const t = m.training;
    const cols = ['#3a3a44', '#2fd06a', '#ff3a3a', '#3a7aff', '#e0c020', '#ffffff', '#606070'];
    const x0 = 140, y0 = 326;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0 - 2, y0 - 2, 364, 22);
    for (let i = 0; i < 2; i++) {
      const row = t.meterRows[i];
      for (let k = 0; k < row.length; k++) {
        ctx.fillStyle = cols[row[k]];
        ctx.fillRect(x0 + k * 4, y0 + i * 10, 3, 8);
      }
    }
  };

  T.drawBoxes = function (ctx, m) {
    const cam = m.cam;
    const rect = (b, col, fill) => {
      const x0 = cam.sx(b[0]), x1 = cam.sx(b[2]), y0 = cam.sy(b[3]), y1 = cam.sy(b[1]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    };
    for (const f of m.fighters) {
      for (const h of f.hurt) rect(h, 'rgba(60,255,120,0.9)', f.invulnTo('strike') ? 'rgba(255,255,255,0.15)' : 'rgba(60,255,120,0.12)');
      // pushbox
      rect([f.x - JJK.PUSH_W, f.y, f.x + JJK.PUSH_W, f.y + 8], 'rgba(255,255,0,0.8)');
      if (f.st === 'move' && f.move && f.move.hits) {
        f.move.hits.forEach((h) => {
          if (f.mf >= h.f[0] && f.mf <= h.f[1]) rect(JJK.Combat.hitbox(f, h), h.throw ? 'rgba(80,160,255,1)' : 'rgba(255,40,40,1)', h.throw ? 'rgba(80,160,255,0.25)' : 'rgba(255,40,40,0.3)');
        });
      }
    }
    for (const p of m.projectiles) if (p.hit && !p.noCollide) rect(p.box, 'rgba(255,120,40,1)', 'rgba(255,120,40,0.2)');
  };
})();
