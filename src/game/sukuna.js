// Ryomen Sukuna — Shrine. Rushdown, lethal spacing, slashes, devastating resource use.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN, Kit = JJK.Kit, FX = JJK.FX;
  const R = (a, b) => a + Math.random() * (b - a);
  const snd = (n, o) => JJK.Audio && JJK.Audio.play(n, o);

  const CRIM = '#ff2a2a', CRIM2 = '#ff8a7a', DARK = '#1a0004', FIRE = '#ff7a1a', FIRE2 = '#ffd040';

  function technique(f) { return f.burnout <= 0 && !f.cs.da; }
  function kindle(f, n = 1) {
    const before = f.cs.kindle;
    f.cs.kindle = Math.min(3, f.cs.kindle + n);
    if (f.cs.kindle > before && f.match) {
      const h = f.anchor('nh');
      FX.spawn('glow', h[0], h[1], { life: 20, size: 30, size2: 6, color: FIRE, add: true });
    }
  }

  // ---------------------------------------------------------------- Dismantle
  function slashFx(x, y, len, ang, col, life = 10) {
    const c = Math.cos(ang), s = Math.sin(ang);
    FX.spawn('slash', x - c * len / 2, y - s * len / 2, { x2: x + c * len / 2, y2: y + s * len / 2, life, size: 3, color: col || CRIM });
  }

  function spawnDismantle(f, m, o = {}) {
    const charged = o.charged;
    const h = o.h || (charged ? 46 : 32);
    const p = new JJK.Projectile(f, {
      x: f.x + f.facing * 50, y: o.y != null ? o.y : f.y + (o.dy || 96), vx: (o.vx || (charged ? 12.5 : 11)) * f.facing, vy: o.vy || 0,
      w: charged ? 18 : 11, h, life: 75, type: 'dismantle', hp: charged ? 2 : 1, moveId: o.id || 'dismantle',
      hit: charged
        ? { dmg: 92, tier: 4, str: 's', hs: 30, bs: 18, launch: true, lv: 6, lx: 5, chip: 12, gdmg: 14, spark: CRIM2, sfx: 'dismantle_hit', kd: true }
        : { dmg: o.dmg || 55, tier: o.tier || 4, str: 's', hs: 20, bs: 15, pb: 5, chip: 7, gdmg: 9, spark: CRIM2, sfx: 'dismantle_hit', av: 4 },
      update(p, m) {
        if (p.t % 2 === 0) FX.spawn('px', p.x - p.vx, p.y + R(-p.h, p.h) * 0.8, { vx: -p.vx * 0.1, life: 8, size: 1, color: U.pick([CRIM, '#fff']), add: true });
      },
      onHit(p, t, m) { kindle(f); slashFx(p.x, p.y, 70, R(-0.8, 0.8), '#fff', 8); if (m.stage && m.stage.slashMark) m.stage.slashMark(p.x - 30, p.y - 30, p.x + 30, p.y + 30); },
      onEnd(p, m) { if (m.stage && m.stage.slashMark && Math.abs(p.x) > JJK.WALL - 30) m.stage.slashMark(p.x, p.y - 30, p.x + 8, p.y + 30); },
      light(p) { FX.light(p.x, p.y, 60, [255, 40, 40], 0.7); },
      draw(p, ctx, cam) {
        const sx = cam.sx(p.x), sy = cam.sy(p.y), z = cam.ez;
        const hh = p.h * z * Math.min(1, p.t / 4);
        const dir = Math.sign(p.vx) || 1;
        const tilt = p.vy ? Math.atan2(-p.vy, Math.abs(p.vx)) * dir : 0;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-tilt);
        // crescent: dark red trail, crimson edge, white core
        ctx.globalCompositeOperation = 'lighter';
        FX.glow(ctx, 0, 0, hh * 1.4, CRIM, 0.5);
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = ['#3a0006', CRIM, '#ffffff'][i];
          ctx.lineWidth = [4, 2, 1][i] * Math.max(1, z * (charged ? 1.4 : 1));
          ctx.beginPath();
          ctx.ellipse(-dir * 6 * z + i * dir * 2, 0, 8 * z, hh, 0, dir > 0 ? -1.3 : Math.PI - 1.3, dir > 0 ? 1.3 : Math.PI + 1.3);
          ctx.stroke();
        }
        // air distortion streaks
        ctx.strokeStyle = 'rgba(255,200,200,0.35)';
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(-dir * 10 * z, i * hh * 0.35);
          ctx.lineTo(-dir * (28 + Math.abs(i) * 6) * z, i * hh * 0.35);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
    m.spawn(p);
    snd('dismantle', { pan: f.pan() });
    return p;
  }

  function spawnCross(f, m, ex) {
    const p = new JJK.Projectile(f, {
      x: f.x + f.facing * 46, y: f.y + 110, vx: (ex ? 9 : 7) * f.facing, w: ex ? 34 : 26, h: ex ? 60 : 46, life: 70, type: 'cross', hp: 2, moveId: ex ? 'exCross' : 'cross',
      hits: 2, interval: 6,
      hit: { dmg: ex ? 48 : 38, tier: ex ? 5 : 4, str: 's', hs: 24, bs: 16, launch: true, lv: 8, lx: 3, chip: 6, spark: CRIM2, sfx: 'dismantle_hit', multi: true },
      onHit(p, t, m) { kindle(f); },
      light(p) { FX.light(p.x, p.y, 70, [255, 40, 40], 0.8); },
      draw(p, ctx, cam) {
        const sx = cam.sx(p.x), sy = cam.sy(p.y), z = cam.ez;
        const s = Math.min(1, p.t / 5) * z;
        ctx.save();
        FX.glow(ctx, sx, sy, p.h * 1.3 * s, CRIM, 0.6);
        for (const k of [1, -1]) {
          for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = ['#3a0006', CRIM, '#ffffff'][i];
            ctx.lineWidth = [5, 3, 1][i] * Math.max(1, z);
            ctx.beginPath();
            ctx.moveTo(sx - p.w * s, sy - k * p.h * s);
            ctx.lineTo(sx + p.w * s, sy + k * p.h * s);
            ctx.stroke();
          }
        }
        ctx.restore();
      },
    });
    m.spawn(p);
    snd('dismantle', { pan: f.pan(), pitch: 0.8 });
  }

  // ---------------------------------------------------------------- Fuga
  function spawnFuga(f, m, lvl) {
    const h = f.anchor('fh');
    const big = lvl === 3;
    const dims = [null, [16, 7], [34, 12], [70, 40]][lvl];
    const kmul = 1 + f.cs.usedKindle * 0.12;
    const p = new JJK.Projectile(f, {
      x: h[0] + f.facing * 20, y: h[1], vx: (big ? 8 : 10) * f.facing, w: dims[0], h: dims[1], life: 120, type: 'fuga', hp: [0, 2, 4, 99][lvl], pierce: big,
      hits: big ? 1 : 1, moveId: 'fuga' + lvl,
      hit: [null,
        { dmg: Math.round(60 * kmul), tier: 4, str: 's', hs: 26, bs: 16, launch: true, lv: 6, lx: 5, chip: 8, spark: FIRE2, sfx: 'fuga_explode' },
        { dmg: Math.round(130 * kmul), tier: 5, str: 's', hs: 34, bs: 20, launch: true, lv: 7, lx: 7, wb: true, chip: 18, gdmg: 20, spark: FIRE2, sfx: 'fuga_explode' },
        { dmg: Math.round(260 * kmul), tier: 7, str: 'x', hs: 50, bs: 26, launch: true, lv: 9, lx: 9, wb: true, splat: true, chip: 50, gdmg: 60, spark: FIRE2, sfx: 'fuga_explode', minScale: 0.6, jug: 0 },
      ][lvl],
      update(p, m) {
        const n = big ? 6 : lvl === 2 ? 3 : 1;
        for (let i = 0; i < n; i++)
          FX.spawn('flame', p.x - p.vx * R(0, 1.5), p.y + R(-p.h, p.h), { vx: -p.vx * 0.2, vy: R(0.3, 1.5), life: R(10, 22), size: R(3, 6) * (big ? 2.4 : lvl === 2 ? 1.4 : 1), size2: 1, color: FIRE, color2: '#c02000', add: true });
        if (big && m.stage && m.stage.burn && p.t % 6 === 0) m.stage.burn(p.x, 50, 200);
        if (big) m.cam.shake(0.05);
      },
      onHit(p, t, m) { fugaExplosion(f, m, p.x, p.y, lvl); if (big) p.kill(m); },
      onBlock(p, t, m) { fugaExplosion(f, m, p.x, p.y, lvl * 0.7); },
      onEnd(p, m) { if (!p.exploded && Math.abs(p.x) > JJK.WALL - 40) fugaExplosion(f, m, p.x, p.y, lvl * 0.6); },
      light(p) { FX.light(p.x, p.y, [0, 80, 140, 260][lvl], [255, 120, 30], big ? 1.6 : 1.1); },
      draw(p, ctx, cam, m) {
        const sx = cam.sx(p.x), sy = cam.sy(p.y), z = cam.ez;
        const dir = Math.sign(p.vx) || 1;
        FX.glow(ctx, sx, sy, p.w * 2.2 * z, FIRE, 1);
        // arrow of flame: elongated flame body with a bright head
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(dir, 1);
        const L = p.w * z, Hh = p.h * z;
        const flick = Math.sin(p.t * 1.3) * 2;
        ctx.fillStyle = '#801800';
        ctx.beginPath(); ctx.moveTo(L * 1.2, 0); ctx.lineTo(-L * 1.6, -Hh * 1.2 - flick); ctx.lineTo(-L * 1.1, 0); ctx.lineTo(-L * 1.6, Hh * 1.2 + flick); ctx.closePath(); ctx.fill();
        ctx.fillStyle = FIRE;
        ctx.beginPath(); ctx.moveTo(L * 1.1, 0); ctx.lineTo(-L * 1.2, -Hh * 0.8); ctx.lineTo(-L * 0.7, 0); ctx.lineTo(-L * 1.2, Hh * 0.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = FIRE2;
        ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.6, -Hh * 0.45); ctx.lineTo(-L * 0.3, 0); ctx.lineTo(-L * 0.6, Hh * 0.45); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff6d0';
        ctx.beginPath(); ctx.ellipse(L * 0.55, 0, L * 0.4, Hh * 0.25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (big) m.distort(p.x, p.y, 90, 1.15);
      },
    });
    p.lvl = lvl;
    m.spawn(p);
    snd('fuga_fire', { pan: f.pan() });
    return p;
  }

  function fugaExplosion(f, m, x, y, lvl) {
    const k = lvl / 3;
    FX.spawn('flash', x, y, { life: 4, size: 14 + k * 40, size2: 4, color: '#fff6d0', add: true });
    FX.spawn('glow', x, y, { life: 26, size: 80 + k * 200, size2: 20, color: FIRE, add: true });
    FX.spawn('ring', x, y, { life: 20, size: 10, size2: 70 + k * 160, color: FIRE2, w: 4, add: true });
    for (let i = 0; i < 20 + k * 60; i++) {
      const a = Math.random() * Math.PI * 2, sp = R(2, 10) * (0.6 + k);
      FX.spawn('flame', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1, drag: 0.9, life: R(18, 40), size: R(4, 10) * (0.6 + k), size2: 1, color: FIRE, color2: '#a01800', add: true });
    }
    FX.debris(x, Math.max(5, y - 30), 10 + k * 30, 1 + k);
    if (m.stage) {
      if (m.stage.burn) m.stage.burn(x, 40 + k * 120, 120 + k * 360);
      if (m.stage.blast) m.stage.blast(x, y, 60 + k * 140, k);
    }
    m.cam.shake(0.25 + k * 0.6);
    if (lvl >= 3) { m.flashScreen('#ffb060', 0.5, 12); m.impact(2, 0xffffffff); }
    snd('fuga_explode', { pan: f.pan() });
  }

  // ---------------------------------------------------------------- World Cutting Slash
  function wcsLine(f, aim) {
    // line through Sukuna's pointing hand across the whole world, angled by aim
    const h = f.anchor('fh');
    const ang = aim > 0 ? 0.42 : aim < 0 ? -0.3 : 0;
    const dx = Math.cos(ang) * f.facing, dy = Math.sin(ang);
    const x0 = h[0], y0 = aim < 0 ? h[1] : aim > 0 ? h[1] : f.y + 96;
    return { x0, y0, x1: x0 + dx * 1400, y1: y0 + dy * 1400, dx, dy };
  }
  function segBoxHit(L, box, thick) {
    // sample along the line and test inflated box
    const b = [box[0] - thick, box[1] - thick, box[2] + thick, box[3] + thick];
    for (let t = 0; t <= 1; t += 0.004) {
      const x = L.x0 + (L.x1 - L.x0) * t, y = L.y0 + (L.y1 - L.y0) * t;
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return [x, y];
    }
    return null;
  }

  // ---------------------------------------------------------------- moves
  const moves = Object.assign(Kit.commonMoves(), {
    dashF: {
      name: 'Dash', tier: 0, s: 1, a: 0, r: 0, total: 16, noCH: false, smear: false, after: 10,
      anim: [[0, 'dash0', 'snap'], [16, 'run0']],
      vel: [[1, 9.5], [10, 7.5]],
      tick(f, m, mf) {
        if (mf === 1) { snd('dash', { pan: f.pan() }); FX.dust(f.x, 0.5, -f.facing); f.afterCol = '#ff3040'; }
        if (mf >= 10 && (f.buf.dir(0) === 6 || f.buf.dir(0) === 3 || f.buf.dir(0) === 9)) {
          f.move = null; f.st = 'run'; f.sf = 0; f.setAnim('run'); f.vx = f.facing * f.stats.runSpeed;
          return;
        }
        if (mf > 10) f.vx *= 0.7;
      },
      onEnd(f) { f.afterCol = null; },
    },
    dashB: {
      name: 'Backstep', tier: 0, s: 1, a: 0, r: 0, total: 20, noCH: false, smear: false,
      inv: [[1, 6, 'all']],
      anim: [[0, 'backdash', 'snap'], [14, 'backdash'], [20, 'idle', 'inOut']],
      vel: [[1, -7, 3.6], [14, 0]],
      tick(f, m, mf) { if (mf === 1) snd('dash', { pan: f.pan(), pitch: 0.9 }); },
      grav: 0.45,
    },
    airdashF: {
      name: 'Air Dash', tier: 0, s: 1, a: 0, r: 0, total: 16, air: true, noGrav: 12, smear: false, after: 12,
      anim: [[0, 'airdash', 'snap'], [16, 'jumpTop']],
      vel: [[1, 9.5, 0]],
      tick(f, m, mf) { if (mf <= 12) f.vy = 0; if (mf === 1) snd('airdash', { pan: f.pan() }); },
      land: 4,
    },
    airdashB: {
      name: 'Air Backdash', tier: 0, s: 1, a: 0, r: 0, total: 16, air: true, noGrav: 10, smear: false,
      anim: [[0, 'backdash', 'snap'], [16, 'jumpTop']],
      vel: [[1, -7.5, 0]],
      tick(f, m, mf) { if (mf <= 10) f.vy = 0; },
      land: 4,
    },
    throwF: {
      name: 'Skull Slam', tier: 3, s: 1, a: 0, r: 0, total: 40, noCH: true,
      anim: [[0, 'throwReach'], [8, 'grab1', 'out'], [18, 'grab2', 'snap'], [40, 'idle', 'inOut']],
      tick(f, m, mf) {
        const v = f.grab;
        if (!v) return;
        if (mf < 18) { v.x = f.x + f.facing * 40; v.y = Math.min(30, mf * 2.4); v.facing = -f.facing; }
        if (mf === 18) {
          JJK.Combat.throwRelease(m, f, v, { lx: 3, lv: 2, dir: f.facing, h: { dmg: 115, gb: true, spark: CRIM2 } });
          v.vy = -8;
          v.bounce = 'ground';
          m.cam.shake(0.35);
          FX.dust(v.x, 1.2);
        }
      },
    },
    throwB: {
      name: 'Reversal Toss', tier: 3, s: 1, a: 0, r: 0, total: 40, noCH: true,
      anim: [[0, 'throwReach'], [10, 'grab1', 'out'], [20, 'cleave1', 'snap'], [40, 'idle', 'inOut']],
      tick(f, m, mf) {
        const v = f.grab;
        if (!v) return;
        if (mf < 14) { v.x = f.x + f.facing * 40; v.facing = -f.facing; }
        if (mf === 14) { v.x = f.x - f.facing * 46; v.facing = f.facing; f.facing = -f.facing; }
        if (mf === 20) {
          JJK.Combat.throwRelease(m, f, v, { lx: 7, lv: 6, dir: f.facing, h: { dmg: 110, spark: CRIM2 } });
          slashFx(v.x, v.y + 90, 80, 0.7, '#fff', 10);
        }
      },
    },

    // ---- normals
    '5L': {
      name: 'Backfist', tier: 1, s: 5, a: 3, r: 8,
      hits: [{ at: 'fh', r: 11, dmg: 20, hs: 14, bs: 10, ha: 'high' }],
      anim: [[0, 'idle'], [3, 'bfist0', 'out'], [5, 'bfist1', 'snap'], [8, 'bfist1'], [15, 'idle', 'inOut']],
      sfxStart: 'whiff_l', grunt: 'light',
    },
    '5M': {
      name: 'Claw Rake', tier: 2, s: 8, a: 3, r: 14,
      hits: [{ at: 'nh', r: 14, dmg: 44, hs: 19, bs: 13 }],
      vel: [[3, 2.6], [10, 0]],
      anim: [[0, 'idle'], [4, 'claw0', 'out'], [8, 'claw1', 'snap'], [11, 'claw1'], [16, 'claw2', 'out'], [24, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 8) { const h = f.anchor('nh'); slashFx(h[0], h[1], 30, -0.9 * f.facing, CRIM, 6); } },
      sfxStart: 'whiff_m', grunt: 'medium',
    },
    '5H': {
      name: 'Cursed Fist', tier: 3, s: 12, a: 4, r: 18,
      hits: [{ at: 'nh', r: 14, dmg: 68, hs: 22, bs: 16, pb: 7.5, chWb: true, chLaunch: true, lv: 6, lx: 9 }],
      vel: [[5, 3], [12, 0]],
      anim: [[0, 'idle'], [7, 'heavy0', 'out'], [12, 'heavy1', 'snap'], [16, 'heavy1'], [24, 'heavy2', 'out'], [33, 'idle', 'inOut']],
      sfxStart: 'whiff_h', grunt: 'heavy',
    },
    '2L': {
      name: 'Shin Kick', tier: 1, s: 5, a: 2, r: 9,
      hits: [{ at: 'ff', r: 10, dmg: 16, hs: 14, bs: 10, guard: 'low', ha: 'low' }],
      anim: [[0, 'crouch'], [3, 'lowKick0', 'out'], [5, 'lowKick1', 'snap'], [7, 'lowKick1'], [15, 'crouch', 'inOut']],
      sfxStart: 'whiff_l', grunt: 'light',
    },
    '2M': {
      name: 'Slide', tier: 2, s: 10, a: 4, r: 16,
      hits: [{ at: 'ff', r: 13, dmg: 38, hs: 18, bs: 12, guard: 'low', ha: 'low' }],
      vel: [[5, 6], [14, 1], [17, 0]],
      anim: [[0, 'crouch'], [6, 'slide0', 'out'], [10, 'slide1', 'snap'], [14, 'slide1'], [29, 'crouch', 'inOut']],
      tick(f, m, mf) { if (mf === 8) FX.dust(f.x, 0.6, -f.facing); },
      sfxStart: 'whiff_m', grunt: 'medium',
    },
    '2H': {
      name: 'Rising Talon', tier: 3, s: 10, a: 4, r: 22, jc: true,
      hits: [{ at: 'nh', r: 15, off: [0, 4], dmg: 58, launch: true, lv: 10.5, lx: 1.6, hs: 30, bs: 15 }],
      inv: [[4, 12, 'air']],
      anim: [[0, 'crouch'], [5, 'rclaw0', 'out'], [10, 'rclaw1', 'snap'], [14, 'rclaw1'], [24, 'rclaw2', 'out'], [35, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 10) { const h = f.anchor('nh'); slashFx(h[0], h[1] - 20, 50, 1.3, CRIM, 7); } },
      sfxStart: 'whiff_h', grunt: 'heavy',
    },
    jL: {
      name: 'Air Chop', tier: 1, s: 5, a: 4, r: 10, air: true, land: 3,
      hits: [{ at: 'fh', r: 11, dmg: 18, hs: 14, bs: 10, guard: 'high' }],
      anim: [[0, 'jumpTop'], [3, 'achop0', 'out'], [5, 'achop1', 'snap'], [9, 'achop1'], [18, 'jumpTop', 'inOut']],
      sfxStart: 'whiff_l', grunt: 'light',
    },
    jM: {
      name: 'Air Knee', tier: 2, s: 7, a: 5, r: 12, air: true, land: 4,
      hits: [{ at: 'fk', r: 13, dmg: 34, hs: 17, bs: 12, guard: 'high' }],
      anim: [[0, 'jumpTop'], [4, 'aknee0', 'out'], [7, 'aknee1', 'snap'], [12, 'aknee1'], [23, 'jumpTop', 'inOut']],
      sfxStart: 'whiff_m', grunt: 'medium',
    },
    jH: {
      name: 'Hammer Fist', tier: 3, s: 11, a: 5, r: 14, air: true, land: 6,
      hits: [{ box: [10, 20, 60, 90], dmg: 54, hs: 20, bs: 15, guard: 'high', gb: true, av: -6, lx: 2 }],
      anim: [[0, 'jumpTop'], [6, 'hammer0', 'out'], [11, 'hammer1', 'snap'], [16, 'hammer1'], [29, 'jumpDown', 'inOut']],
      sfxStart: 'whiff_h', grunt: 'heavy',
    },
    '6H': {
      name: 'Heel Drop', tier: 3, s: 20, a: 3, r: 16,
      hits: [{ at: 'ff', r: 15, dmg: 72, hs: 22, bs: 16, guard: 'high', chGb: true, chLaunch: true, lv: 4, ha: 'mid' }],
      vel: [[6, 3, 4], [19, 0]],
      anim: [[0, 'idle'], [8, 'heel0', 'out'], [18, 'heel0'], [20, 'heel1', 'snap'], [23, 'heel1'], [39, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 21) { FX.dust(f.x + f.facing * 40, 0.7); m.cam.shake(0.1); } },
      sfxStart: 'whiff_h', grunt: 'heavy',
    },

    // ---- specials
    dismantle: {
      name: 'Dismantle', tier: 4, s: 13, a: 1, r: 20, technique: true,
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [6, 'slash0', 'out'], [13, 'slash1', 'snap'], [18, 'slash2', 'out'], [33, 'idle', 'inOut']],
      animFrame: (f) => f.mf,
      tick(f, m, mf) {
        const d = f.moveData;
        d.charge = d.charge || 0;
        // hold SP during startup to charge
        if (mf === 11 && (f.buf.held(0) & B.SP || (f.cpu && f.cpu.holdSP)) && d.charge < 30) {
          d.charge++;
          if (d.charge % 3 === 0) { const h = f.anchor('fh'); FX.spawn('px', h[0] + R(-10, 10), h[1] + R(-10, 10), { vx: R(-1, 1), vy: R(-1, 1), life: 10, size: 2, color: CRIM, add: true }); }
          if (d.charge === 30) { snd('charge_level'); FX.spawn('ring', f.x, f.y + 96, { life: 14, size: 10, size2: 50, color: CRIM, w: 2, add: true }); }
          return 'hold';
        }
        if (mf === 13) {
          spawnDismantle(f, m, { charged: d.charge >= 30 });
          if (JJK.Voice && U.chance(0.4)) JJK.Voice.say('sukuna', 'dismantle');
        }
        // follow-up second slash
        if (mf > 14 && mf < 30 && (f.buf.pr(0) & B.SP) && !d.second) {
          d.second = true;
          f.startMove('dismantle2', { free: true });
        }
      },
    },
    dismantle2: {
      name: 'Double Slash', tier: 4, s: 7, a: 1, r: 20, technique: true,
      anim: [[0, 'slash2'], [4, 'slashB0', 'out'], [7, 'slashB1', 'snap'], [27, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 7) spawnDismantle(f, m, { dy: 78, dmg: 40, id: 'dismantle2' }); },
    },
    jDismantle: {
      name: 'Air Dismantle', tier: 4, s: 12, a: 1, r: 16, air: true, land: 7, technique: true, noGrav: 16,
      cond: (f) => technique(f),
      anim: [[0, 'jumpTop'], [6, 'slash0', 'out'], [12, 'slash1', 'snap'], [28, 'jumpTop', 'inOut']],
      tick(f, m, mf) {
        if (mf <= 16) f.vy *= 0.6;
        if (mf === 12) spawnDismantle(f, m, { vx: 9, vy: -6, dy: 70, id: 'jDismantle' });
      },
    },
    cleave: {
      name: 'Cleave', tier: 4, s: 9, a: 7, r: 20, technique: true,
      cond: (f) => technique(f),
      hits: [
        { f: [9, 10], box: [6, 30, 80, 150], dmg: 30, hs: 20, bs: 12, pb: 1, spark: CRIM2, sfx: 'cleave_hit', multi: true },
        { f: [11, 12], box: [6, 30, 80, 150], dmg: 30, hs: 20, bs: 12, pb: 1, spark: CRIM2, sfx: 'cleave_hit', multi: true },
        { f: [13, 15], box: [6, 30, 84, 150], dmg: 34, hs: 26, bs: 16, pb: 6, spark: CRIM2, sfx: 'cleave_hit', launch: false, chLaunch: true, lv: 7, multi: true },
      ],
      vel: [[2, 2.5], [8, 0]],
      anim: [[0, 'idle'], [5, 'cleave0', 'out'], [9, 'cleave1', 'snap'], [11, 'cleave2', 'snap'], [13, 'cleave1', 'snap'], [16, 'cleave2'], [35, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 9 || mf === 11 || mf === 13) {
          const x = f.x + f.facing * 50, y = f.y + 90;
          slashFx(x, y, 80, [0.8, -0.8, 0.2][(mf - 9) / 2] * f.facing, '#ffffff', 7);
          slashFx(x, y, 60, [0.9, -0.7, 0.3][(mf - 9) / 2] * f.facing, CRIM, 9);
          snd('cleave', { pan: f.pan(), pitch: 1 + (mf - 9) * 0.05 });
        }
        if (mf === 15 && f.contact === 'hit') kindle(f);
      },
      voice: 'cleave',
    },
    cross: {
      name: 'Cross Dismantle', tier: 4, s: 16, a: 1, r: 22, technique: true,
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [8, 'cross0', 'out'], [16, 'cross1', 'snap'], [38, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 16) spawnCross(f, m, false); },
    },
    lunge: {
      name: 'Shrine Lunge', tier: 4, s: 15, a: 4, r: 20, technique: false,
      hits: [{ at: 'nh', r: 16, dmg: 52, hs: 22, bs: 12, pb: 4, spark: CRIM2 }],
      vel: [[5, 12], [15, 4], [18, 0]],
      anim: [[0, 'idle'], [4, 'lunge0', 'out'], [14, 'lunge1', 'snap'], [19, 'lunge1'], [38, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 5) { f.afterT = 10; f.afterCol = '#ff3040'; snd('dash', { pan: f.pan() }); } if (mf > 5 && mf < 15 && Math.abs(m.opp(f).x - f.x) < 60) f.vx = 0; },
      onEnd(f) { f.afterCol = null; },
      grunt: 'heavy',
    },
    counterCleave: {
      name: 'Counter Cleave', tier: 4, s: 3, a: 20, r: 18, technique: true, counter: [3, 22], counterTypes: ['strike'],
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [3, 'counter0', 'snap'], [22, 'counter0'], [40, 'idle', 'inOut']],
      onCounter(f, att, m) {
        f.hitstop = 8; att.hitstop = 8;
        att.st = 'stagger'; att.sf = 0; att.stun = 22; att.move = null; att.setAnim('stagger');
        FX.perfectSpark(f.x + f.facing * 30, f.y + 100);
        f.startMove('counterCleaveHit', { free: true });
        return true;
      },
    },
    counterCleaveHit: {
      name: 'Counter Cleave', tier: 4, s: 4, a: 4, r: 22, noCH: true, inv: [[1, 8, 'all']],
      hits: [{ box: [0, 20, 90, 160], dmg: 110, launch: true, lv: 8, lx: 6, hs: 32, str: 's', spark: CRIM2, sfx: 'cleave_hit', kd: true }],
      anim: [[0, 'counter0'], [4, 'cleave1', 'snap'], [8, 'cleave2'], [30, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 4) { slashFx(f.x + f.facing * 50, f.y + 95, 120, 0.6 * f.facing, '#ffffff', 10); snd('cleave', { pan: f.pan() }); m.impact(2, 0xffff2020); } },
    },
    grabCleave: {
      name: 'Grab Cleave', tier: 4, s: 6, a: 3, r: 30, technique: true,
      cond: (f) => technique(f),
      hits: [{ box: [6, 30, 60, 140], throw: true, dmg: 0, throwMove: 'grabCleaveHit', noTech: true }],
      anim: [[0, 'idle'], [3, 'grab0', 'out'], [8, 'grab0'], [39, 'idle', 'inOut']],
      sfxStart: 'whiff_m',
    },
    grabCleaveHit: {
      name: 'Grab Cleave', tier: 4, s: 1, a: 0, r: 0, total: 44, noCH: true,
      anim: [[0, 'grab0'], [8, 'grab1', 'out'], [20, 'grab1'], [24, 'grab2', 'snap'], [44, 'idle', 'inOut']],
      tick(f, m, mf) {
        const v = f.grab;
        if (!v) return;
        if (mf < 24) { const h = f.anchor('nh'); v.x = f.x + f.facing * 38; v.y = Math.max(0, Math.min(36, mf * 3)); v.facing = -f.facing; v.setAnim('grabbed'); }
        if (mf === 12 || mf === 16 || mf === 20) {
          slashFx(v.x, v.y + 90, 50, R(-1, 1), '#ffffff', 6);
          snd('cleave', { pan: f.pan(), pitch: 1.1 });
          m.cam.shake(0.08);
          v.flash = 2;
        }
        if (mf === 24) {
          JJK.Combat.throwRelease(m, f, v, { lx: 6, lv: 6, dir: f.facing, h: { dmg: f.moveData.ex ? 210 : 150, spark: CRIM2, wb: true, str: 'h' } });
          kindle(f);
          slashFx(v.x, v.y + 90, 120, 0.6 * f.facing, '#ffffff', 12);
          snd('cleave_hit', { pan: f.pan() });
          m.impact(2, 0xffff2020);
        }
      },
      voice: 'cleave',
    },
    fuga: {
      name: 'Fuga: Divine Flame', tier: 4, s: 18, a: 1, r: 20, total: 999, technique: true,
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [6, 'fuga0', 'out'], [14, 'fugaDraw', 'out'], [40, 'fugaDraw2', 'inOut'], [66, 'fugaDraw', 'inOut']],
      animFrame: (f) => { const c = f.moveData.charge || 0; return c < 66 ? c : 14 + ((c - 14) % 52); },
      onStart(f, m) {
        f.moveData.charge = 0; f.moveData.lvl = 1;
        f.cs.fugaSnd = JJK.Audio ? JJK.Audio.loop('fuga_charge', { pan: f.pan() }) : null;
        if (JJK.Voice) JJK.Voice.say('sukuna', 'fuga');
      },
      tick(f, m, mf) { return fugaTick(f, m, mf); },
      onEnd(f) { if (f.cs.fugaSnd) { f.cs.fugaSnd.stop(0.1); f.cs.fugaSnd = null; } },
    },
    fugaFire: {
      name: 'Fuga', tier: 4, s: 4, a: 1, r: 26, noCH: true,
      anim: [[0, 'fugaDraw2'], [4, 'fugaRelease', 'snap'], [20, 'fugaRelease'], [30, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 4) {
          const lvl = f.moveData.lvl || 1;
          spawnFuga(f, m, lvl);
          f.vx = -f.facing * (1 + lvl);
          m.cam.kick(-f.facing * 2 * lvl, 0);
          if (JJK.Audio) JJK.Audio.rumble(f.side, 0.4 * lvl, 0.6, 200 * lvl);
        }
      },
      friction: 0.88,
    },

    // ---- EX
    exDismantle: {
      name: 'Dismantle: Triple', tier: 5, s: 10, a: 1, r: 22, cost: 50, technique: true,
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [5, 'slash0', 'out'], [10, 'slash1', 'snap'], [16, 'slashB1', 'snap'], [32, 'idle', 'inOut']],
      onStart(f, m) { m.superFlash(f, 'DISMANTLE', { dur: 10, zoom: 1.15, color: CRIM }); },
      tick(f, m, mf) {
        if (mf === 10) spawnDismantle(f, m, { dy: 104, vx: 13, tier: 5, dmg: 42, id: 'exDismantle' });
        if (mf === 13) spawnDismantle(f, m, { dy: 70, vx: 13, tier: 5, dmg: 42, id: 'exDismantle2' });
        if (mf === 16) spawnDismantle(f, m, { dy: 138, vx: 13, tier: 5, dmg: 42, id: 'exDismantle3' });
      },
      voice: 'dismantle',
    },
    exCross: {
      name: 'Cross Dismantle EX', tier: 5, s: 8, a: 1, r: 26, cost: 50, technique: true,
      cond: (f) => technique(f),
      inv: [[1, 10, 'all']],
      anim: [[0, 'idle'], [4, 'cross0', 'out'], [8, 'cross1', 'snap'], [34, 'idle', 'inOut']],
      onStart(f, m) { m.superFlash(f, 'CROSS DISMANTLE', { dur: 10, zoom: 1.15, color: CRIM }); },
      tick(f, m, mf) { if (mf === 8) spawnCross(f, m, true); },
    },
    exCounter: {
      name: 'Counter Cleave EX', tier: 5, s: 2, a: 28, r: 18, cost: 50, technique: true, counter: [2, 30], counterTypes: ['strike', 'proj'],
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [2, 'counter0', 'snap'], [30, 'counter0'], [48, 'idle', 'inOut']],
      onStart(f, m) { m.superFlash(f, 'COUNTER CLEAVE', { dur: 10, zoom: 1.15, color: CRIM }); },
      onCounter(f, att, m, info) {
        if (info.proj) info.proj.kill(m);
        else { att.st = 'stagger'; att.sf = 0; att.stun = 26; att.move = null; att.setAnim('stagger'); }
        f.hitstop = 6;
        // dash to the attacker if they are far (projectile counter)
        if (Math.abs(att.x - f.x) > 80) { f.x = att.x - f.facing * 60; FX.dust(f.x, 0.6); }
        f.startMove('counterCleaveHit', { free: true });
        return true;
      },
    },
    exGrab: {
      name: 'Grab Cleave EX', tier: 5, s: 5, a: 3, r: 30, cost: 50, technique: true,
      cond: (f) => technique(f),
      hits: [{ box: [6, 30, 76, 140], throw: true, dmg: 0, throwMove: 'grabCleaveHit', noTech: true, ex: true }],
      inv: [[1, 4, 'strike']],
      anim: [[0, 'idle'], [3, 'grab0', 'out'], [8, 'grab0'], [38, 'idle', 'inOut']],
      onStart(f, m) { m.superFlash(f, 'GRAB CLEAVE', { dur: 8, zoom: 1.1, color: CRIM }); },
    },

    // ---- Supers
    enhancedCleave: {
      name: 'Cleave: Enhanced', tier: 6, s: 14, a: 14, r: 26, cost: 100, technique: true,
      cond: (f) => technique(f),
      inv: [[1, 16, 'all']],
      hits: [
        { f: [14, 15], box: [0, 20, 96, 160], dmg: 40, hs: 30, bs: 14, pb: 0, spark: CRIM2, sfx: 'cleave_hit', multi: true, minScale: 0.5 },
        { f: [17, 18], box: [0, 20, 96, 160], dmg: 40, hs: 30, bs: 14, pb: 0, spark: CRIM2, sfx: 'cleave_hit', multi: true, minScale: 0.5 },
        { f: [20, 21], box: [0, 20, 96, 160], dmg: 40, hs: 30, bs: 14, pb: 0, spark: CRIM2, sfx: 'cleave_hit', multi: true, minScale: 0.5 },
        { f: [23, 24], box: [0, 20, 96, 160], dmg: 40, hs: 30, bs: 14, pb: 0, spark: CRIM2, sfx: 'cleave_hit', multi: true, minScale: 0.5 },
        { f: [26, 27], box: [0, 20, 100, 170], dmg: 70, hs: 40, bs: 18, launch: true, lv: 7, lx: 11, wb: true, splat: true, spark: '#ffffff', sfx: 'cleave_hit', multi: true, minScale: 0.5, kick: [8, 0] },
      ],
      vel: [[8, 12], [13, 0]],
      anim: [[0, 'idle'], [6, 'cleave0', 'out'], [14, 'cleave1', 'snap'], [17, 'cleave2', 'snap'], [20, 'cleave1', 'snap'], [23, 'cleave2', 'snap'], [26, 'cleave1', 'snap'], [30, 'cleave2'], [53, 'idle', 'inOut']],
      onStart(f, m) { m.superFlash(f, 'CLEAVE', { dur: 34, zoom: 1.4, color: CRIM }); },
      tick(f, m, mf) {
        if (mf === 8) { f.afterT = 8; f.afterCol = '#ff3040'; snd('dash'); }
        if (mf > 8 && mf < 13 && Math.abs(m.opp(f).x - f.x) < 70) f.vx = 0;
        if (mf >= 14 && mf <= 27 && (mf - 14) % 3 === 0) {
          const x = f.x + f.facing * 55, y = f.y + 95;
          slashFx(x, y, 110, R(-1.2, 1.2), '#ffffff', 8);
          slashFx(x, y, 90, R(-1.2, 1.2), CRIM, 10);
          snd('cleave', { pan: f.pan(), pitch: 1 + (mf - 14) * 0.02 });
          m.cam.shake(0.12);
        }
        if (mf === 26) { m.impact(2, 0xffff2020); m.cam.zoomPulse(0.05); }
      },
      onEnd(f) { f.afterCol = null; },
      voice: 'cleave',
    },
    wcs: {
      name: 'World Cutting Slash', tier: 7, s: 120, a: 1, r: 40, cost: 200, technique: true, total: 170,
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [10, 'wcsStance', 'out'], [26, 'wcsSign', 'inOut'], [100, 'wcsSign'], [112, 'wcsPoint', 'snap'], [150, 'wcsPoint'], [170, 'idle', 'inOut']],
      onStart(f, m) {
        f.moveData.aim = 0;
        m.superFlash(f, 'WORLD CUTTING SLASH', { dur: 14, zoom: 1.2, color: '#ffffff', dark: 0.3 });
      },
      tick(f, m, mf) { return wcsTick(f, m, mf); },
      onEnd(f, m) { if (JJK.Audio) JJK.Audio.unhush(0.2); f.cs.wcsAim = null; },
    },

    // ---- Domain
    domain: {
      name: 'Domain Expansion: Malevolent Shrine', tier: 8, s: 28, a: 1, r: 10, total: 38, technique: true,
      cond: (f) => technique(f) && f.dg >= 100 && f.canAfford(200),
      anim: [[0, 'idle'], [10, 'domainSign', 'out'], [28, 'domainSign2', 'inOut'], [38, 'domainSign2']],
      onStart(f, m) { return JJK.Domain.begin(f, m, 'shrine'); },
      tick(f, m, mf) { return JJK.Domain.startupTick(f, m, mf); },
    },
  });

  function fugaTick(f, m, mf) {
    const d = f.moveData;
    const holding = (f.buf.held(0) & B.SP) || (f.cpu && f.cpu.holdSP);
    d.charge++;
    const kd = f.cs.kindle * 10;
    const need = [0, 18, 46 - kd, 96 - kd * 2];
    const lvlMax = f.canAfford(100) ? 3 : f.canAfford(50) ? 2 : 1;
    const lvl = d.charge >= need[3] && lvlMax >= 3 ? 3 : d.charge >= need[2] && lvlMax >= 2 ? 2 : 1;
    if (lvl !== d.lvl) {
      d.lvl = lvl;
      snd('charge_level', { pitch: 1 + lvl * 0.2 });
      m.popText(f, 'LV ' + lvl, '#ffb060');
      FX.spawn('ring', f.x, f.y + 95, { life: 18, size: 10, size2: 60 + lvl * 25, color: FIRE, w: 3, add: true });
    }
    const k = Math.min(1, d.charge / 96);
    d.k = k;
    // flames gather at the bow
    const h = f.anchor('fh'), n = f.anchor('nh');
    for (let i = 0; i < 1 + k * 4; i++) {
      const t = Math.random();
      FX.spawn('flame', U.lerp(n[0], h[0], t) + R(-4, 4), U.lerp(n[1], h[1], t) + R(-4, 4), { vx: R(-0.5, 0.5), vy: R(0.5, 2), life: R(10, 20), size: R(2, 4) * (1 + k * 1.5), size2: 1, color: FIRE, color2: '#a01800', add: true });
    }
    if (d.charge % 3 === 0) FX.spawn('px', f.x + R(-200, 200), R(10, 220), { vy: R(0.5, 1.5), vx: R(-0.5, 0.5), life: 40, size: 1, color: FIRE2, add: true }); // embers
    m.cam.shake(0.01 + k * 0.03);
    if (m.stage) m.stage.darken = Math.max(m.stage.darken || 0, k * 0.25);
    if (f.cs.fugaSnd) f.cs.fugaSnd.setLevel(k);
    if ((holding && d.charge < 150) || d.charge < need[1]) return 'hold';
    const cost = [0, 0, 50, 100][d.lvl];
    if (cost && !f.spend(cost)) d.lvl = 1;
    f.cs.usedKindle = f.cs.kindle;
    f.cs.kindle = 0;
    if (f.cs.fugaSnd) { f.cs.fugaSnd.stop(0.05); f.cs.fugaSnd = null; }
    f.startMove('fugaFire', { free: true, data: d });
    f.moveData = d;
    if (d.lvl === 3) {
      m.superFlash(f, 'FUGA', { dur: 40, zoom: 1.45, color: FIRE });
      m.flashScreen('#ff9040', 0.3, 10);
    }
    return 'stop';
  }

  function wcsTick(f, m, mf) {
    const d = f.moveData;
    // aim: hold up / down during the chant
    const dir = f.buf.dir(0);
    if (mf < 110) {
      if (f.cpu && f.cpu.aim != null) d.aim = f.cpu.aim;
      else d.aim = dir >= 7 ? 1 : dir <= 3 ? -1 : 0;
    }
    f.cs.wcsAim = mf >= 20 && mf < 122 ? wcsLine(f, d.aim) : null;
    // chant
    if (mf === 26) { JJK.Voice && JJK.Voice.say('sukuna', 'wcs_1'); snd('chant_tick'); }
    if (mf === 56) { JJK.Voice && JJK.Voice.say('sukuna', 'wcs_2'); snd('chant_tick'); }
    if (mf === 86) { JJK.Voice && JJK.Voice.say('sukuna', 'wcs_3'); snd('chant_tick'); }
    if (mf === 40 && JJK.Audio) JJK.Audio.hush(2.2, 0.06);
    if (mf > 30 && mf < 120 && m.stage) m.stage.darken = Math.max(m.stage.darken || 0, Math.min(0.45, (mf - 30) / 120));
    if (mf === 120) {
      const L = wcsLine(f, d.aim);
      if (JJK.Audio) { JJK.Audio.unhush(0.02); }
      snd('wcs_tear', { bypassHush: true });
      if (JJK.Voice) JJK.Voice.say('sukuna', 'wcs');
      // the cut
      const o = m.opp(f);
      let hitPt = null;
      if (!o.invulnTo('proj') || o.st === 'move') {
        for (const b of o.hurt) { hitPt = segBoxHit(L, b, 10); if (hitPt) break; }
      }
      if (o.st === 'down' || o.st === 'techroll' || (o.inv > 0 && o.invType === 'all')) hitPt = null;
      if (hitPt) {
        const h = { dmg: 300, tier: 7, str: 'x', hs: 60, launch: true, lv: 9, lx: 6, hkd: true, guard: 'unblockable', bypassInf: true, spark: '#ffffff', minScale: 0.7, jug: 0, noParry: true };
        o.hitstop = 0;
        JJK.Combat.hit(m, f, o, h, hitPt, { moveId: 'wcs' }, JJK.STR.x);
        o.hitstop = 50; f.hitstop = 0;
        m.popText(o, 'SEVERED', '#ffffff', true);
      }
      // reality tears along the line
      m.tear = { x0: L.x0, y0: L.y0, x1: L.x1, y1: L.y1, t: 0, life: 48, amount: 18 };
      if (m.stage && m.stage.worldCut) m.stage.worldCut(L.x0 - L.dx * 1400, L.y0 - L.dy * 1400, L.x1, L.y1);
      m.cam.shake(0.9);
      m.flashScreen('#ffffff', 0.8, 6);
      m.impact(3, 0xffffffff);
      m.slowmo(0.35, 40);
      if (JJK.Audio) JJK.Audio.rumble(o.side, 1, 1, 700);
      FX.spawn('slash', L.x0, L.y0, { x2: L.x1, y2: L.y1, life: 30, size: 6, color: '#ff2020' });
    }
  }

  // ---------------------------------------------------------------- Domain Amplification
  function preHit(def, att, h, info) {
    if (def.cs.da && info.kind === 'proj') return { dmgMul: 0.5 };
    return null;
  }

  const commands = [
    { id: 'domain', b: B.SP | B.SU, chord: true, air: 'both' },
    { id: 'wcs', m: '623', b: B.SU },
    { id: 'exGrab', m: '63214', b: B.SU },
    { id: 'enhancedCleave', m: '214', b: B.SU },
    { id: 'exDismantle', m: '236', b: B.SU },
    { id: 'exCross', b: B.SU, dir: [1, 2, 3] },
    { id: 'exCounter', b: B.SU, dir: [4] },
    { id: 'grabCleave', m: '63214', b: B.SP },
    { id: 'dismantle', m: '236', b: B.SP },
    { id: 'cleave', m: '214', b: B.SP },
    { id: 'fuga', m: '22', b: B.SP },
    { id: 'jDismantle', m: '236', b: B.SP, air: true },
    { id: 'cross', b: B.SP, dir: [1, 2, 3] },
    { id: 'counterCleave', b: B.SP, dir: [4] },
    { id: 'lunge', b: B.SP, dir: [6] },
    { id: 'dismantle', b: B.SP },
    { id: 'jDismantle', b: B.SP, air: true },
  ].concat(Kit.normalsCommands());

  const def = {
    id: 'sukuna', name: 'SUKUNA', full: 'RYOMEN SUKUNA', title: 'KING OF CURSES',
    art: JJK.Art.sukuna,
    color: '#ff5050',
    hitColor: '#ff9a7a',
    blockColor: '#ffb0a0',
    afterColor: '#ff3040',
    smearMat: U.mat('#ffe0e0', { emissive: 1, light: '#ffffff', shadow: '#ffc0c0', deep: '#ff9090' }),
    pgBonus: 0,
    stats: { hp: 1000, walkF: 2.9, walkB: 2.1, runSpeed: 6.6, jumpV: 11, jumpVx: 4.2, grav: 0.56, prejump: 4, airActions: 2 },
    poses: JJK.Poses.sukuna,
    anims: Kit.baseAnims(),
    moves: Kit.build(moves),
    commands: [],
    initState() { return { kindle: 0, usedKindle: 0, da: false, daT: 0, fugaSnd: null, wcsAim: null }; },
    dmgMul(f) { return f.cs.da ? 1.12 : 1; },
    update(f, m) {
      const cs = f.cs;
      // Domain Amplification toggle (Unique button)
      if (f.buf.pr(0) & B.UN && !m.inputLocked && !f.isStunned()) {
        if (cs.da) { cs.da = false; snd('da_off', { pan: f.pan() }); }
        else if (f.canAfford(25) && f.burnout <= 0) {
          f.spend(15);
          cs.da = true; cs.daT = 0;
          snd('da_on', { pan: f.pan() });
          if (JJK.Voice && U.chance(0.4)) JJK.Voice.say('sukuna', 'da');
          FX.spawn('ring', f.x, f.y + 95, { life: 16, size: 20, size2: 80, color: '#301020', w: 3 });
        } else if (JJK.Audio) JJK.Audio.play('ui_error', { vol: 0.4 });
      }
      if (cs.da) {
        cs.daT++;
        const t = m.training;
        if (!(t && t.infMeter)) f.meter -= 9 / 60;
        if (f.meter <= 0 || f.burnout > 0) { f.meter = Math.max(0, f.meter); cs.da = false; snd('da_off'); }
        if (m.frame % 2 === 0) {
          const c = f.anchor(U.pick(['chest', 'hip', 'head', 'nh', 'fh']));
          FX.spawn('smoke', c[0] + R(-12, 12), c[1] + R(-12, 12), { vy: R(0.3, 1.2), life: 24, size: R(3, 5), size2: 1, color: '#0a0610', alpha: 0.7 });
        }
      }
      // hand flames (reference: red cursed flames on the fists)
      if (!cs.da && f.visible && m.frame % 2 === 0 && JJK.HEADLESS !== true) {
        for (const a of ['fh', 'nh']) {
          if (a === 'nh' && m.frame % 4) continue;
          const h = f.anchor(a);
          FX.spawn('flame', h[0] + R(-4, 4), h[1] + R(-3, 4), { vy: R(0.6, 1.6), vx: R(-0.3, 0.3), life: R(10, 18), size: R(2, 3.5), size2: 0.5, color: CRIM, color2: '#801010', add: true });
        }
      }
    },
    preHit,
    lights(f, m) {
      if (!f.visible) return;
      const h = f.anchor('fh');
      if (!f.cs.da) FX.light(h[0], h[1], 46, [255, 50, 30], 0.55);
      if (f.st === 'move' && f.move && f.move.id === 'fuga' && f.moveData.k != null) {
        const n = f.anchor('nh');
        FX.light((h[0] + n[0]) / 2, (h[1] + n[1]) / 2, 90 + f.moveData.k * 140, [255, 120, 30], 1.3);
      }
    },
    auraColor(f) {
      if (f.cs.da) return U.pack(20, 10, 30);
      if (f.burnout > 0) return U.pack(60, 60, 70);
      return 0;
    },
    glowRing(f) { return f.cs.da ? U.pack(70, 30, 90) : 0; },
    drawFx(f, ctx, cam, m) {
      if (!f.visible) return;
      const z = cam.ez;
      if (!f.cs.da) for (const a of ['fh', 'nh']) {
        const h = f.anchor(a);
        FX.glow(ctx, cam.sx(h[0]), cam.sy(h[1]), (a === 'fh' ? 16 : 11) * z, CRIM, 0.7);
      }
      // fire bow during Fuga
      if (f.st === 'move' && f.move && f.move.id === 'fuga') {
        const d = f.moveData;
        const h = f.anchor('fh'), n = f.anchor('nh');
        const k = d.k || 0;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = FIRE;
        ctx.lineWidth = Math.max(1, (1 + k * 2) * z);
        // bow arc around the lead hand
        const bx = cam.sx(h[0]), by = cam.sy(h[1]);
        ctx.beginPath();
        ctx.arc(bx - f.facing * 6 * z, by, 26 * z, f.facing > 0 ? -1.1 : Math.PI - 1.1 + 0, f.facing > 0 ? 1.1 : Math.PI + 1.1);
        ctx.stroke();
        // string + arrow
        ctx.strokeStyle = FIRE2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cam.sx(n[0]), cam.sy(n[1]));
        ctx.lineTo(bx + f.facing * 14 * z, by);
        ctx.stroke();
        ctx.restore();
        FX.glow(ctx, bx, by, (30 + k * 60) * z, FIRE, 0.8);
      }
      // World Cutting Slash aim line (visible to both players)
      if (f.cs.wcsAim) {
        const L = f.cs.wcsAim;
        const a = 0.35 + 0.25 * Math.sin(m.frame * 0.3);
        ctx.save();
        ctx.strokeStyle = `rgba(255,40,40,${a})`;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -m.frame;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cam.sx(L.x0), cam.sy(L.y0));
        ctx.lineTo(cam.sx(L.x1), cam.sy(L.y1));
        ctx.stroke();
        ctx.restore();
        // chant subtitles
        const mf = f.mf;
        const words = [['DRAGON SCALE.', 26], ['RECOIL.', 56], ['TWIN METEORS.', 86]];
        for (let i = 0; i < 3; i++) {
          if (mf >= words[i][1] && mf < 122) JJK.Font.draw(ctx, words[i][0], 320, 236 + i * 13, { color: i === 2 ? '#ff5050' : '#ffd0d0', align: 'center', outline: '#000', scale: 1 });
        }
      }
    },
    moveList: [
      ['NORMALS', ''],
      ['L / M / H', 'Backfist / Claw Rake / Cursed Fist'],
      ['2L / 2M / 2H', 'Shin Kick (low) / Slide (low) / Rising Talon (launcher)'],
      ['j.L / j.M / j.H', 'Air Chop / Air Knee / Hammer Fist (ground bounce)'],
      ['6H', 'Heel Drop (overhead)'],
      ['L+M', 'Throw (hold ← to swap sides)'],
      ['M+H', 'Cursed Parry'],
      ['→→ (hold) / ←←', 'Dash into Run / Backstep'],
      ['TECHNIQUES', ''],
      ['↓↘→ + SP', 'Dismantle (hold SP: Charged; SP again: Double Slash)  [air OK]'],
      ['↓↙← + SP', 'Cleave (close-range, high damage)'],
      ['→↘↓↙← + SP', 'Grab Cleave (command grab)'],
      ['↓↓ + SP', 'Fuga: hold SP to charge Lv1-3 (Lv2: 50 CE, Lv3: 100 CE)'],
      ['↓ + SP', 'Cross Dismantle (anti-air)'],
      ['→ + SP', 'Shrine Lunge (rush)'],
      ['← + SP', 'Counter Cleave (counter stance)'],
      ['UNIQUE', 'Toggle DOMAIN AMPLIFICATION (pierces Infinity, no techniques, drains CE)'],
      ['ENHANCED (50 CE)', ''],
      ['↓↘→ + SU', 'Triple Dismantle'],
      ['↓ + SU', 'Cross Dismantle EX (invincible)'],
      ['← + SU', 'Counter Cleave EX (catches projectiles)'],
      ['63214 + SU', 'Grab Cleave EX'],
      ['SUPERS', ''],
      ['↓↙← + SU', 'Cleave: Enhanced  (100 CE)'],
      ['→↓↘ + SU', 'World Cutting Slash: hold ↑/↓ to aim (200 CE)'],
      ['SP + SU', 'Domain Expansion: Malevolent Shrine (200 CE + full Domain gauge)'],
      ['PASSIVE', 'Dismantle/Cleave hits add KINDLING: faster, stronger Fuga'],
    ],
  };
  def.commands = commands.filter((c) => def.moves[c.id]);
  JJK.Chars.sukuna = def;
})();
