// Satoru Gojo — Limitless. Spatial control, teleportation, Infinity defense, explosive burst.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN, Kit = JJK.Kit, FX = JJK.FX;
  const S = JJK.CHAR_SCALE;
  const A = Kit.A;
  const R = (a, b) => a + Math.random() * (b - a);
  const snd = (n, o) => JJK.Audio && JJK.Audio.play(n, o);

  const BLUE = '#3aa0ff', BLUE2 = '#8fe0ff', RED = '#ff3030', RED2 = '#ff9a7a', PURPLE = '#b050ff';

  // ---------------------------------------------------------------- helpers
  function technique(f) {
    return f.burnout <= 0 && !(f.match && f.match.domain && f.match.domain.noTech === f);
  }
  function hasProj(f, type) {
    return f.match && f.match.projectiles.some((p) => p.owner === f && p.type === type && !p.dead);
  }
  function handPos(f, which) { return f.anchor(which || 'fh'); }

  // ---------------------------------------------------------------- VFX
  function drawOrb(ctx, sx, sy, r, cols, t, wobble) {
    for (let i = 0; i < cols.length; i++) {
      const rr = r * (1 - i / cols.length) + (wobble ? Math.sin(t * 0.7 + i) * wobble : 0);
      FX.pxCircle(ctx, sx, sy, rr, cols[i]);
    }
  }
  function blueSpiral(x, y, rad, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rad * R(0.6, 1);
      FX.spawn('px', x + Math.cos(a) * d, y + Math.sin(a) * d, {
        vx: -Math.cos(a) * d / 14 + Math.sin(a) * 1.5, vy: -Math.sin(a) * d / 14 - Math.cos(a) * 1.5,
        life: 14, size: R(1, 2.5), color: U.pick([BLUE2, '#ffffff', BLUE]), add: true, fade: 0.6,
      });
    }
  }
  function redBurstFx(m, x, y, power) {
    FX.spawn('flash', x, y, { life: 3, size: 12 + power * 18, size2: 4, color: '#ffffff', add: true });
    FX.spawn('glow', x, y, { life: 18, size: 60 + power * 80, size2: 10, color: RED, add: true });
    FX.spawn('ring', x, y, { life: 16, size: 8, size2: 60 + power * 90, color: RED2, w: 4, add: true });
    FX.spawn('ring', x, y, { life: 22, size: 6, size2: 40 + power * 70, color: RED, w: 2, add: true, delay: 3 });
    for (let i = 0; i < 20 + power * 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = R(4, 12) * (0.6 + power);
      FX.spawn('spark', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.88, life: R(10, 22), size: 2, len: 2, color: U.pick([RED, RED2, '#ffd0c0']) });
    }
    FX.debris(x, Math.max(4, y - 30), 8 + power * 16, 1 + power);
    if (m.stage && m.stage.blast) m.stage.blast(x, y, 60 + power * 100, power);
    m.cam.shake(0.25 + power * 0.4);
    m.distort(x, y, 50 + power * 60, 1.25);
  }

  // ---------------------------------------------------------------- projectiles
  function spawnBlue(f, m, x, y, opts = {}) {
    const p = new JJK.Projectile(f, {
      x, y, vx: (opts.vx || 0.7) * f.facing, vy: opts.vy || 0, w: 16, h: 16, life: opts.life || 84, type: 'blue', kind: 'field',
      hits: 4, interval: 11, hp: 3, moveId: 'blue',
      hit: { dmg: 14, tier: 4, str: 's', hs: 16, bs: 10, stop: 5, pb: 0, chip: 3, gdmg: 4, spark: BLUE2, sfx: 'hit_m', lx: 0.5, av: 2, jug: 1, multi: true },
      update(p, m) {
        // pull the opponent and debris toward the core
        const o = m.opp(f);
        const dx = p.x - o.x, dy = p.y - (o.y + 70);
        const d = Math.hypot(dx, dy);
        const R2 = 170;
        if (d < R2 && !o.invulnTo('proj') && !(o.cs && o.cs.da) && o.st !== 'down' && o.st !== 'grabbed') {
          const k = (1 - d / R2) * 0.09;
          o.x += dx * k;
          if (o.y > 0 || o.st === 'juggle') o.y = Math.max(0, o.y + dy * k * 0.5);
        }
        if (p.t % 2 === 0) blueSpiral(p.x, p.y, 70, 3);
        if (p.t % 6 === 0 && m.stage && m.stage.pull) m.stage.pull(p.x, p.y, 150, 0.6, 8);
        if (p.t > p.life - 10) p.w = p.h = 16 * (p.life - p.t) / 10;
        if (p.t === 1) snd('blue_cast', { pan: f.pan() });
      },
      light(p) { FX.light(p.x, p.y, 120, [40, 110, 255], 1.1); },
      draw(p, ctx, cam, m) {
        const sx = cam.sx(p.x), sy = cam.sy(p.y), z = cam.ez;
        const grow = Math.min(1, p.t / 8) * (p.t > p.life - 10 ? (p.life - p.t) / 10 : 1);
        m.distort(p.x, p.y, 58 * grow, 0.8);
        FX.glow(ctx, sx, sy, 70 * z * grow, BLUE, 0.9);
        FX.glow(ctx, sx, sy, 26 * z * grow, '#bfe8ff', 1);
        drawOrb(ctx, sx, sy, 15 * z * grow, ['#0b1f7a', '#1f5fff', BLUE, BLUE2, '#ffffff'], p.t, 0.8);
        // swirl arcs
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(140,210,255,0.8)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const a0 = p.t * 0.25 + i * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(sx, sy, (24 + i * 7) * z * grow, a0, a0 + 1.4);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
    m.spawn(p);
    return p;
  }

  function spawnRed(f, m, x, y, o = {}) {
    const big = o.big;
    const p = new JJK.Projectile(f, {
      x, y, vx: (o.vx || 9.5) * f.facing, vy: o.vy || 0, w: big ? 34 : 13, h: big ? 34 : 13, life: big ? 90 : 70, type: big ? 'maxred' : 'red', hp: big ? 6 : 2,
      moveId: big ? 'maxRed' : 'red',
      hits: big ? 2 : 1, interval: 6,
      hit: big
        ? { dmg: 110, tier: 6, str: 'x', hs: 40, bs: 24, launch: true, lv: 6, lx: 11, wb: true, splat: true, chip: 24, gdmg: 30, spark: RED2, kick: [8, 0], minScale: 0.5, jug: 0 }
        : { dmg: 72, tier: 4, str: 's', hs: 30, bs: 18, launch: true, lv: 5, lx: 9, wb: true, chip: 10, gdmg: 14, spark: RED2, kick: [5, 0] },
      update(p, m) {
        if (p.t % 1 === 0) FX.spawn('flame', p.x - p.vx * 0.5, p.y + R(-4, 4), { vx: -p.vx * 0.15, vy: R(-0.5, 0.5), life: 12, size: big ? 14 : 5, size2: 1, color: RED, color2: '#801010', add: true });
        if (big && p.t % 3 === 0 && m.stage && m.stage.impact) m.stage.impact(p.x, p.y, 0.4, 'red');
      },
      light(p) { FX.light(p.x, p.y, big ? 160 : 90, [255, 50, 30], big ? 1.3 : 1); },
      onHit(p, t, m) { redBurstFx(m, p.x, p.y, big ? 1 : 0.5); snd(big ? 'max_red' : 'red_burst', { pan: f.pan() }); },
      onBlock(p, t, m) { redBurstFx(m, p.x, p.y, big ? 0.7 : 0.3); snd('red_burst', { pan: f.pan(), vol: 0.7 }); },
      onEnd(p, m) { if (!p.hitOnce) { FX.spawn('ring', p.x, p.y, { life: 10, size: 4, size2: 30, color: RED2, w: 2, add: true }); } },
      draw(p, ctx, cam, m) {
        const sx = cam.sx(p.x), sy = cam.sy(p.y), z = cam.ez;
        const r = (big ? 34 : 12) * z;
        m.distort(p.x, p.y, (big ? 60 : 24), 1.2);
        FX.glow(ctx, sx, sy, r * 3.4, RED, 0.9);
        drawOrb(ctx, sx, sy, r, ['#5a0000', '#c00000', RED, RED2, '#ffffff'], p.t, big ? 1.5 : 0.6);
        // shock cone
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,120,100,0.7)';
        for (let i = 0; i < 3; i++) {
          const rr = r * (1.3 + i * 0.4 + (p.t % 6) * 0.08);
          ctx.beginPath();
          ctx.arc(sx, sy, rr, f.facing > 0 ? -0.9 : Math.PI - 0.9, f.facing > 0 ? 0.9 : Math.PI + 0.9);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
    m.spawn(p);
    return p;
  }

  function spawnPurple(f, m, lvl) {
    const hand = handPos(f, 'fh');
    const rad = [0, 22, 38, 64][lvl];
    const p = new JJK.Projectile(f, {
      x: hand[0] + f.facing * rad * 0.6, y: Math.max(rad * 0.8, hand[1]), vx: (lvl === 3 ? 7.5 : 8.5) * f.facing, w: rad, h: rad, life: 160, type: 'purple', hp: 99, pierce: true,
      hits: lvl === 3 ? 4 : lvl === 2 ? 3 : 2, interval: 5, moveId: 'purple', bypassInf: true, reflectable: false,
      hit: {
        dmg: [0, 70, 80, 95][lvl], tier: 7, str: 'x', hs: 40, bs: 24, launch: true, lv: 7, lx: 9, wb: lvl >= 2, splat: lvl === 3,
        chip: [0, 12, 18, 0][lvl], gdmg: 40, spark: '#e0b0ff', guard: lvl === 3 ? 'unblockable' : 'mid', minScale: 0.6, jug: 0, multi: true, kick: [6, 0],
      },
      update(p, m) {
        if (p.t % 2 === 0) for (let i = 0; i < 2 + lvl; i++) {
          const a = Math.random() * Math.PI * 2;
          FX.spawn('px', p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, { vx: -p.vx * 0.3 + R(-1, 1), vy: R(-1, 1), life: 18, size: 2, color: U.pick(['#e0b0ff', PURPLE, '#ffffff']), add: true });
        }
        if (m.stage) {
          if (p.t % 2 === 0 && m.stage.erase) m.stage.erase(p.x - 10, p.x + 10, p.y, rad * 1.3);
          if (p.t % 5 === 0 && m.stage.impact) m.stage.impact(p.x, p.y, 0.6, 'purple');
        }
        if (p.t % 4 === 0) FX.debris(p.x, Math.max(4, p.y - rad), 3, 1.4, ['#6a5a52', '#3a2a44', '#b080ff']);
        m.cam.shake(0.04 * lvl);
      },
      light(p) { FX.light(p.x, p.y, 120 + lvl * 50, [180, 60, 255], 1.3); },
      onHit(p, t, m) {
        FX.spawn('flash', p.x, p.y, { life: 4, size: rad, size2: 4, color: '#fff', add: true });
        snd('purple_impact', { pan: f.pan() });
        m.cam.shake(0.3 + lvl * 0.15);
        if (lvl === 3) m.impact(3, 0xffffffff);
      },
      draw(p, ctx, cam, m) {
        const sx = cam.sx(p.x), sy = cam.sy(p.y), z = cam.ez;
        const r = rad * z * Math.min(1, p.t / 6);
        m.distort(p.x, p.y, rad * 1.6, 0.75);
        FX.glow(ctx, sx, sy, r * 3, PURPLE, 1);
        FX.glow(ctx, sx, sy, r * 1.6, '#ffd8ff', 0.8);
        // crackling rim
        ctx.save();
        ctx.fillStyle = '#e8c8ff';
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, rr = r * R(0.95, 1.15);
          ctx.fillRect(Math.round(sx + Math.cos(a) * rr), Math.round(sy + Math.sin(a) * rr), 2, 2);
        }
        ctx.restore();
        drawOrb(ctx, sx, sy, r, ['#1a0030', '#4a0080', '#8a2ae0', PURPLE, '#e0b0ff', '#ffffff'], p.t, 1.2);
        // blue & red cores still visible inside, swirling
        const a = p.t * 0.4;
        FX.pxCircle(ctx, sx + Math.cos(a) * r * 0.35, sy + Math.sin(a) * r * 0.35, r * 0.18, BLUE2);
        FX.pxCircle(ctx, sx - Math.cos(a) * r * 0.35, sy - Math.sin(a) * r * 0.35, r * 0.18, RED2);
      },
    });
    m.spawn(p);
    return p;
  }

  // ---------------------------------------------------------------- teleport
  function teleportFx(m, f, x, y) {
    FX.spawn('flash', x, y + 80, { life: 4, size: 26, size2: 2, color: '#ffffff', add: true });
    FX.spawn('ring', x, y + 80, { life: 12, size: 30, size2: 2, color: BLUE2, w: 2, add: true });
    for (let i = 0; i < 14; i++) FX.spawn('line', x + R(-16, 16), y + R(10, 160), { x2: x + R(-16, 16), y2: y + R(10, 160), life: 6, size: 1, color: '#bfe8ff' });
    for (let i = 0; i < 10; i++) FX.spawn('px', x + R(-20, 20), y + R(20, 150), { vx: R(-2, 2), vy: R(-2, 2), life: 16, size: 2, color: U.pick([BLUE2, '#fff']), add: true });
    m.distort(x, y + 90, 50, 0.85);
  }
  function blinkTo(f, m, x, y) {
    teleportFx(m, f, f.x, f.y);
    f.x = U.clamp(x, -JJK.WALL, JJK.WALL);
    if (y != null) { f.y = y; f.air = y > 0; }
    teleportFx(m, f, f.x, f.y);
    snd('teleport', { pan: f.pan() });
  }

  // ---------------------------------------------------------------- moves
  const moves = Object.assign(Kit.commonMoves(), {
    dashF: {
      name: 'Spatial Step', tier: 0, s: 1, a: 0, r: 0, total: 17, noCH: true, smear: false,
      inv: [[3, 8, 'all']],
      anim: [[0, 'blink0', 'out'], [5, 'blink1', 'snap'], [17, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 3) { f.invisible = true; f.afterT = 6; }
        if (mf === 6) {
          const o = m.opp(f);
          let nx = f.x + f.facing * 95;
          // don't blink through the opponent's body: stop just in front
          if (Math.sign(o.x - f.x) === f.facing && Math.abs(o.x - f.x) < 95 + 36) nx = o.x - f.facing * 36;
          blinkTo(f, m, nx);
        }
        if (mf === 7) f.invisible = false;
      },
      onEnd(f) { f.invisible = false; },
    },
    dashB: {
      name: 'Back Step', tier: 0, s: 1, a: 0, r: 0, total: 20, noCH: true, smear: false,
      inv: [[1, 9, 'all']],
      anim: [[0, 'blink0', 'out'], [6, 'blink1', 'snap'], [20, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 2) { f.invisible = true; }
        if (mf === 5) blinkTo(f, m, f.x - f.facing * 90);
        if (mf === 6) f.invisible = false;
      },
      onEnd(f) { f.invisible = false; },
    },
    airdashF: {
      name: 'Air Step', tier: 0, s: 1, a: 0, r: 0, total: 16, air: true, noGrav: 14, smear: false, keepVel: false,
      anim: [[0, 'airBlink'], [16, 'jumpTop']],
      tick(f, m, mf) {
        if (mf === 1) { f.vy = 0; f.vx = 0; f.invisible = true; }
        if (mf === 3) blinkTo(f, m, f.x + f.facing * 90);
        if (mf === 4) f.invisible = false;
        if (mf <= 14) f.vy = 0;
        if (mf === 14) f.vx = f.facing * 2;
      },
      onEnd(f) { f.invisible = false; f.st = 'air'; },
      land: 4,
    },
    airdashB: {
      name: 'Air Back Step', tier: 0, s: 1, a: 0, r: 0, total: 16, air: true, noGrav: 14, smear: false,
      anim: [[0, 'airBlink'], [16, 'jumpTop']],
      tick(f, m, mf) {
        if (mf === 1) { f.vy = 0; f.vx = 0; f.invisible = true; }
        if (mf === 3) blinkTo(f, m, f.x - f.facing * 80);
        if (mf === 4) f.invisible = false;
        if (mf <= 14) f.vy = 0;
      },
      onEnd(f) { f.invisible = false; },
      land: 4,
    },
    throwF: {
      name: 'Blue Toss', tier: 3, s: 1, a: 0, r: 0, total: 36, noCH: true,
      anim: [[0, 'throwReach'], [8, 'pull0', 'out'], [16, 'palm1', 'snap'], [36, 'idle', 'inOut']],
      tick(f, m, mf) {
        const v = f.grab;
        if (!v) return;
        const p = f.anchor('fh');
        if (mf < 16) { v.x = f.x + f.facing * 42; v.y = 0; v.facing = -f.facing; v.setAnim('grabbed'); }
        if (mf === 16) {
          JJK.Combat.throwRelease(m, f, v, { lx: 9, lv: 5, dir: f.facing, h: { dmg: 105, wb: true, spark: BLUE2 } });
          blueSpiral(p[0], p[1], 50, 14);
          snd('blue_pull', { pan: f.pan() });
          m.cam.kick(f.facing * 3, 0);
        }
      },
    },
    throwB: {
      name: 'Spatial Swap', tier: 3, s: 1, a: 0, r: 0, total: 40, noCH: true,
      anim: [[0, 'throwReach'], [10, 'pull1', 'out'], [20, 'kick1', 'snap'], [40, 'idle', 'inOut']],
      tick(f, m, mf) {
        const v = f.grab;
        if (!v) return;
        if (mf < 12) { v.x = f.x + f.facing * 40; v.y = 0; v.facing = -f.facing; }
        if (mf === 12) {
          // Blue drags them through to the other side
          teleportFx(m, v, v.x, v.y);
          v.x = f.x - f.facing * 44;
          v.facing = f.facing;
          f.facing = -f.facing;
          teleportFx(m, v, v.x, v.y);
          snd('teleport', { pan: f.pan() });
        }
        if (mf === 20) JJK.Combat.throwRelease(m, f, v, { lx: 8, lv: 6, dir: f.facing, h: { dmg: 115, spark: BLUE2 } });
      },
    },

    // ---- normals
    '5L': {
      name: 'Jab', tier: 1, s: 4, a: 3, r: 7,
      hits: [{ at: 'fh', r: 10, dmg: 18, hs: 14, bs: 10, ha: 'high' }],
      anim: [[0, 'idle'], [2, 'jab0', 'out'], [4, 'jab1', 'snap'], [6, 'jab1', 'linear'], [9, 'jab2', 'out'], [13, 'idle', 'inOut']],
      sfxStart: 'whiff_l', grunt: 'light',
    },
    '5M': {
      name: 'Palm Strike', tier: 2, s: 7, a: 3, r: 13,
      hits: [{ at: 'nh', r: 12, dmg: 40, hs: 19, bs: 13 }],
      vel: [[3, 3.4], [9, 0.5], [12, 0]],
      anim: [[0, 'idle'], [4, 'palm0', 'out'], [7, 'palm1', 'snap'], [10, 'palm1', 'linear'], [15, 'palm2', 'out'], [22, 'idle', 'inOut']],
      sfxStart: 'whiff_m', grunt: 'medium',
    },
    '5H': {
      name: 'Spinning Heel', tier: 3, s: 11, a: 4, r: 18,
      hits: [{ at: 'nf', r: 14, dmg: 62, hs: 22, bs: 16, pb: 7, chWb: true, chLaunch: true, lv: 6, lx: 8 }],
      anim: [[0, 'idle'], [6, 'kick0', 'out'], [11, 'kick1', 'snap'], [15, 'kick1', 'linear'], [22, 'kick2', 'out'], [32, 'idle', 'inOut']],
      vel: [[1, 1.2], [10, 0]],
      sfxStart: 'whiff_h', grunt: 'heavy',
    },
    '2L': {
      name: 'Low Kick', tier: 1, s: 5, a: 2, r: 9,
      hits: [{ at: 'ff', r: 10, dmg: 15, hs: 14, bs: 10, guard: 'low', ha: 'low' }],
      anim: [[0, 'crouch'], [3, 'lowKick0', 'out'], [5, 'lowKick1', 'snap'], [7, 'lowKick1'], [15, 'crouch', 'inOut']],
      sfxStart: 'whiff_l', grunt: 'light',
    },
    '2M': {
      name: 'Sliding Shin', tier: 2, s: 8, a: 3, r: 15,
      hits: [{ at: 'ff', r: 12, dmg: 34, hs: 18, bs: 12, guard: 'low', ha: 'low' }],
      vel: [[4, 3], [10, 0]],
      anim: [[0, 'crouch'], [5, 'poke0', 'out'], [8, 'poke1', 'snap'], [11, 'poke1'], [25, 'crouch', 'inOut']],
      sfxStart: 'whiff_m', grunt: 'medium',
    },
    '2H': {
      name: 'Rising Uppercut', tier: 3, s: 9, a: 4, r: 22, jc: true,
      hits: [{ at: 'nh', r: 15, off: [0, 4], dmg: 55, launch: true, lv: 10.5, lx: 1.6, hs: 30, bs: 15 }],
      inv: [[3, 12, 'air']],
      anim: [[0, 'crouch'], [5, 'upper0', 'out'], [9, 'upper1', 'snap'], [13, 'upper1', 'linear'], [22, 'upper2', 'out'], [34, 'idle', 'inOut']],
      sfxStart: 'whiff_h', grunt: 'heavy',
    },
    jL: {
      name: 'Air Jab', tier: 1, s: 5, a: 4, r: 10, air: true, land: 3,
      hits: [{ at: 'fh', r: 11, dmg: 16, hs: 14, bs: 10, guard: 'high' }],
      anim: [[0, 'jumpTop'], [3, 'ajab0', 'out'], [5, 'ajab1', 'snap'], [9, 'ajab1'], [18, 'jumpTop', 'inOut']],
      sfxStart: 'whiff_l', grunt: 'light',
    },
    jM: {
      name: 'Air Knee', tier: 2, s: 7, a: 5, r: 12, air: true, land: 4,
      hits: [{ at: 'fk', r: 13, dmg: 32, hs: 17, bs: 12, guard: 'high' }],
      anim: [[0, 'jumpTop'], [4, 'aknee0', 'out'], [7, 'aknee1', 'snap'], [12, 'aknee1'], [23, 'jumpTop', 'inOut']],
      sfxStart: 'whiff_m', grunt: 'medium',
    },
    jH: {
      name: 'Axe Kick', tier: 3, s: 10, a: 5, r: 14, air: true, land: 6,
      hits: [{ at: 'nf', r: 15, dmg: 50, hs: 20, bs: 15, guard: 'high', gb: true, av: -6, lx: 2 }],
      anim: [[0, 'jumpTop'], [6, 'axe0', 'out'], [10, 'axe1', 'snap'], [15, 'axe1'], [28, 'jumpDown', 'inOut']],
      sfxStart: 'whiff_h', grunt: 'heavy',
    },
    '6H': {
      name: 'Blink Strike', tier: 3, s: 18, a: 3, r: 16,
      hits: [{ at: 'nh', r: 14, dmg: 60, hs: 22, bs: 15, pb: 6, chLaunch: true, lv: 7 }],
      anim: [[0, 'idle'], [5, 'tpunch0', 'out'], [12, 'tpunch0'], [18, 'tpunch1', 'snap'], [21, 'tpunch1'], [37, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 8) f.invisible = true;
        if (mf === 11) {
          const o = m.opp(f);
          let nx = f.x + f.facing * 80;
          if (Math.sign(o.x - f.x) === f.facing && Math.abs(o.x - f.x) < 80 + 40) nx = o.x - f.facing * 40;
          blinkTo(f, m, nx);
        }
        if (mf === 12) f.invisible = false;
      },
      onEnd(f) { f.invisible = false; },
      sfxStart: 'whiff_m', grunt: 'heavy',
    },

    // ---- specials
    blue: {
      name: 'Lapse: Blue', tier: 4, s: 16, a: 1, r: 22, technique: true,
      cond: (f) => technique(f) && !hasProj(f, 'blue'),
      anim: [[0, 'idle'], [6, 'castBlue0', 'out'], [14, 'castBlue1', 'snap'], [24, 'castBlue1'], [38, 'idle', 'inOut']],
      tick(f, m, mf) {
        const h = handPos(f, 'fh');
        if (mf < 16 && mf % 2 === 0) blueSpiral(h[0], h[1], 26, 2);
        if (mf === 16) spawnBlue(f, m, f.x + f.facing * 150, f.y + 96);
      },
      voice: 'blue',
    },
    jBlue: {
      name: 'Air Blue', tier: 4, s: 14, a: 1, r: 18, air: true, land: 8, technique: true, noGrav: 24,
      cond: (f) => technique(f) && !hasProj(f, 'blue'),
      anim: [[0, 'jumpTop'], [6, 'castBlue0', 'out'], [12, 'castBlue1', 'snap'], [32, 'jumpTop', 'inOut']],
      tick(f, m, mf) {
        if (mf <= 24) f.vy = Math.max(f.vy, -0.5) * 0.5;
        if (mf === 14) spawnBlue(f, m, f.x + f.facing * 110, Math.max(70, f.y + 20), { vx: 0.5, life: 70 });
      },
      voice: 'blue',
    },
    red: {
      name: 'Reversal: Red', tier: 4, s: 18, a: 1, r: 24, technique: true,
      cond: (f) => technique(f) && !hasProj(f, 'red'),
      anim: [[0, 'idle'], [8, 'castRed0', 'out'], [16, 'castRed0'], [18, 'castRed1', 'snap'], [28, 'castRed1'], [42, 'idle', 'inOut']],
      tick(f, m, mf) {
        const h = handPos(f, 'fh');
        if (mf === 2) snd('red_charge', { pan: f.pan() });
        if (mf < 18) FX.spawn('px', h[0] + R(-14, 14), h[1] + R(-14, 14), { vx: R(-1, 1), vy: R(-1, 1), life: 8, size: 2, color: U.pick([RED, RED2]), add: true });
        if (mf === 18) {
          spawnRed(f, m, h[0] + f.facing * 10, h[1]);
          snd('red_shot', { pan: f.pan() });
          f.vx = -f.facing * 2.5;
          m.cam.kick(-f.facing * 2, 0);
        }
      },
      friction: 0.85,
      voice: 'red',
    },
    jRed: {
      name: 'Air Red', tier: 4, s: 15, a: 1, r: 20, air: true, land: 8, technique: true, noGrav: 20,
      cond: (f) => technique(f) && !hasProj(f, 'red'),
      anim: [[0, 'jumpTop'], [8, 'castRed0', 'out'], [15, 'castRed1', 'snap'], [35, 'jumpTop', 'inOut']],
      tick(f, m, mf) {
        if (mf <= 20) f.vy *= 0.5;
        if (mf === 15) {
          const h = handPos(f, 'fh');
          const pr = spawnRed(f, m, h[0], h[1], { vx: 8, vy: -4.2 });
          pr.vx = f.facing * 8;
          snd('red_shot', { pan: f.pan() });
          f.vx = -f.facing * 3; f.vy = 3;
        }
      },
      voice: 'red',
    },
    redLaunch: {
      name: 'Red: Launcher', tier: 4, s: 10, a: 5, r: 26, technique: true,
      cond: (f) => technique(f),
      hits: [{ box: [8, 30, 64, 150], dmg: 70, launch: true, lv: 11.5, lx: 2.4, hs: 34, bs: 18, spark: RED2, chip: 8, kick: [0, -4] }],
      inv: [[1, 9, 'air']],
      anim: [[0, 'idle'], [5, 'burst0', 'out'], [10, 'burst1', 'snap'], [15, 'burst1'], [40, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 10) {
          const h = handPos(f, 'fh');
          redBurstFx(m, h[0], h[1] - 10, 0.35);
          snd('red_burst', { pan: f.pan() });
        }
      },
      jc: true,
      grunt: 'heavy',
    },
    teleport: {
      name: 'Spatial Teleport', tier: 4, s: 1, a: 0, r: 0, total: 30, technique: true,
      cond: (f) => technique(f) && f.cs.tpCd <= 0,
      inv: [[1, 12, 'all']],
      anim: [[0, 'blink0', 'out'], [10, 'blink0'], [12, 'blink1', 'snap'], [30, 'idle', 'inOut']],
      tick(f, m, mf) {
        const o = m.opp(f);
        if (mf === 3) f.invisible = true;
        if (mf === 9) {
          f.cs.tpCd = 50;
          // behind the opponent (or in front if they are cornered)
          let side = o.facing; // opponent faces toward us: behind them is -o.facing relative... use their back
          let nx = o.x - o.facing * 62;
          if (Math.abs(nx) > JJK.WALL - 10) nx = o.x + o.facing * 62;
          blinkTo(f, m, nx, f.air ? f.y : 0);
          f.face(o);
          void side;
        }
        if (mf === 11) f.invisible = false;
      },
      onEnd(f) { f.invisible = false; },
    },
    jTeleport: {
      name: 'Aerial Teleport', tier: 4, s: 1, a: 0, r: 0, total: 26, air: true, technique: true, noGrav: 12, land: 6,
      cond: (f) => technique(f) && f.cs.tpCd <= 0,
      inv: [[1, 11, 'all']],
      anim: [[0, 'airBlink'], [12, 'jumpTop', 'snap'], [26, 'jumpDown']],
      tick(f, m, mf) {
        const o = m.opp(f);
        if (mf === 1) { f.vx = 0; f.vy = 0; }
        if (mf <= 12) f.vy = 0;
        if (mf === 3) f.invisible = true;
        if (mf === 8) {
          f.cs.tpCd = 50;
          blinkTo(f, m, o.x - o.facing * 30, Math.max(110, o.y + 140));
          f.face(o);
        }
        if (mf === 10) f.invisible = false;
      },
      onEnd(f) { f.invisible = false; },
    },
    bluePull: {
      name: 'Blue: Pull', tier: 4, s: 14, a: 4, r: 22, technique: true,
      cond: (f) => technique(f),
      hits: [{ box: [40, 0, 230, 170], dmg: 30, hs: 30, bs: 18, pb: -4, spark: BLUE2, str: 's', chip: 0, gdmg: 6,
        special(att, def, m) { pullTo(att, def, m, 48); } }],
      anim: [[0, 'idle'], [8, 'pull0', 'out'], [14, 'pull0'], [18, 'pull1', 'snap'], [39, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf >= 10 && mf <= 18) {
          const x = f.x + f.facing * (40 + (mf - 10) * 22);
          blueSpiral(x, f.y + 90, 30, 2);
          if (mf === 14) snd('blue_pull', { pan: f.pan() });
        }
      },
      onBlockPull: true,
    },
    blueRush: {
      name: 'Blue: Movement', tier: 4, s: 18, a: 4, r: 18, technique: true,
      cond: (f) => technique(f),
      inv: [[2, 16, 'proj']],
      hits: [{ at: 'nh', r: 15, dmg: 52, hs: 22, bs: 12, pb: 6, spark: BLUE2 }],
      anim: [[0, 'idle'], [4, 'rush', 'out'], [16, 'rush'], [18, 'tpunch1', 'snap'], [22, 'tpunch1'], [40, 'idle', 'inOut']],
      tick(f, m, mf) {
        const o = m.opp(f);
        if (mf === 2) { snd('blue_pull', { pan: f.pan() }); f.afterT = 16; f.afterCol = '#4aa8ff'; }
        if (mf >= 3 && mf <= 16) {
          const gap = Math.abs(o.x - f.x);
          f.vx = gap > 58 ? f.facing * 13 : 0;
          blueSpiral(f.x + f.facing * 40, f.y + 90, 24, 1);
        }
        if (mf === 17) f.vx = 0;
      },
      onEnd(f) { f.afterCol = null; },
    },
    blueCounter: {
      name: 'Blue: Counter', tier: 4, s: 3, a: 22, r: 18, technique: true, counter: [3, 24], counterTypes: ['strike'],
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [3, 'counter0', 'snap'], [24, 'counter0'], [42, 'idle', 'inOut']],
      onCounter(f, att, m) {
        // distort space: drag the attacker through, then strike
        f.hitstop = 10; att.hitstop = 10;
        FX.perfectSpark(f.x + f.facing * 30, f.y + 100);
        snd('blue_pull', { pan: f.pan() });
        m.flashScreen('#9fd8ff', 0.3, 6);
        att.st = 'stagger'; att.sf = 0; att.stun = 30; att.move = null; att.setAnim('stagger');
        f.startMove('counterHit', { free: true });
        return true;
      },
    },
    counterHit: {
      name: 'Counter Strike', tier: 4, s: 6, a: 4, r: 20, noCH: true,
      hits: [{ at: 'fh', r: 18, dmg: 80, launch: true, lv: 9, lx: 6, hs: 30, spark: BLUE2, str: 's', wb: true }],
      anim: [[0, 'pull1'], [6, 'palm1', 'snap'], [10, 'palm1'], [30, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 1) { const o = m.opp(f); pullTo(f, o, m, 52); }
      },
    },

    // ---- EX (Lv1, 50)
    blueCrush: {
      name: 'Blue Crush', tier: 5, s: 20, a: 1, r: 24, cost: 50, technique: true,
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [6, 'castBlue0', 'out'], [18, 'castBlue1', 'snap'], [45, 'idle', 'inOut']],
      onStart(f, m) {
        const o = m.opp(f);
        f.moveData.tx = o.x; f.moveData.ty = Math.max(70, o.y + 80);
        snd('blue_cast', { pan: f.pan() });
      },
      tick(f, m, mf) {
        const d = f.moveData;
        if (mf < 20) {
          if (mf % 2 === 0) blueSpiral(d.tx, d.ty, 60 - mf * 2, 4);
          m.distort(d.tx, d.ty, 30 + mf, 0.85);
          FX.light(d.tx, d.ty, 80, [40, 110, 255], 0.8);
        }
        if (mf === 20) {
          const o = m.opp(f);
          const near = Math.abs(o.x - d.tx) < 70 && Math.abs(o.y + 80 - d.ty) < 90;
          spawnBlue(f, m, d.tx, d.ty, { vx: 0, life: 20 });
          if (near && !o.invulnTo('proj')) {
            // pulled straight into Gojo's fist
            const h = { dmg: 30, tier: 5, str: 's', hs: 40, bs: 0, guard: 'unblockable', spark: BLUE2, pb: 0, launch: false, av: 0 };
            JJK.Combat.hit(m, f, o, h, [o.x, o.y + 80], { moveId: 'blueCrush' }, JJK.STR.s);
            pullTo(f, o, m, 48);
            o.st = 'hit'; o.stun = 40; o.y = 0; o.air = false; o.vy = 0;
            f.startMove('blueCrushHit', { free: true });
          }
        }
      },
      voice: 'blue',
    },
    blueCrushHit: {
      name: 'Blue Crush', tier: 5, s: 8, a: 3, r: 24, noCH: true,
      hits: [{ at: 'nh', r: 18, dmg: 95, launch: true, lv: 10, lx: 4, hs: 34, str: 'x', spark: BLUE2, wb: true, minScale: 0.5 }],
      anim: [[0, 'pull1'], [5, 'palm0', 'out'], [8, 'palm1', 'snap'], [11, 'palm1'], [35, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 8) { m.cam.zoomPulse(0.05); m.impact(2, 0xffffffff); } },
    },
    exRedBurst: {
      name: 'Red: Burst', tier: 5, s: 7, a: 5, r: 28, cost: 50, technique: true,
      cond: (f) => technique(f),
      hits: [{ box: [-50, 0, 80, 160], dmg: 100, launch: true, lv: 11, lx: 6, hs: 36, bs: 18, wb: true, spark: RED2, str: 's', chip: 14, kick: [6, -2] }],
      inv: [[1, 11, 'all']],
      anim: [[0, 'burst0'], [7, 'burst1', 'snap'], [12, 'burst1'], [40, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 1) { m.superFlash(f, 'RED: BURST', { dur: 12, zoom: 1.2, color: RED }); }
        if (mf === 7) { redBurstFx(m, f.x + f.facing * 20, f.y + 90, 0.9); snd('red_burst', { pan: f.pan() }); }
      },
      voice: 'red',
    },
    redCounter: {
      name: 'Red: Counter', tier: 5, s: 2, a: 28, r: 20, cost: 50, technique: true, counter: [2, 30], counterTypes: ['strike', 'proj'],
      cond: (f) => technique(f),
      anim: [[0, 'idle'], [2, 'counter0', 'snap'], [30, 'counter0'], [50, 'idle', 'inOut']],
      onStart(f, m) { m.superFlash(f, 'RED: COUNTER', { dur: 10, zoom: 1.15, color: RED }); },
      onCounter(f, att, m, info) {
        if (info.proj) { info.proj.kill(m); }
        f.hitstop = 8;
        f.startMove('redCounterHit', { free: true });
        return true;
      },
    },
    redCounterHit: {
      name: 'Red: Counter', tier: 5, s: 4, a: 4, r: 24, noCH: true, inv: [[1, 8, 'all']],
      hits: [{ box: [0, 0, 110, 170], dmg: 130, launch: true, lv: 7, lx: 12, hs: 40, str: 'x', wb: true, splat: true, spark: RED2, kick: [8, 0] }],
      anim: [[0, 'counter0'], [4, 'castRed1', 'snap'], [8, 'castRed1'], [32, 'idle', 'inOut']],
      tick(f, m, mf) { if (mf === 4) { redBurstFx(m, f.x + f.facing * 50, f.y + 95, 1); snd('max_red', { pan: f.pan() }); } },
    },

    // ---- Supers
    maxRed: {
      name: 'Maximum Output: Red', tier: 6, s: 22, a: 1, r: 30, cost: 100, technique: true,
      cond: (f) => technique(f),
      inv: [[1, 22, 'all']],
      anim: [[0, 'idle'], [4, 'castRed0', 'out'], [20, 'castRed0'], [22, 'castRed1', 'snap'], [34, 'castRed1'], [52, 'idle', 'inOut']],
      onStart(f, m) { m.superFlash(f, 'MAXIMUM OUTPUT: RED', { dur: 36, zoom: 1.4, color: RED }); f.hairLift = 4; },
      tick(f, m, mf) {
        const h = handPos(f, 'fh');
        if (mf < 22) for (let i = 0; i < 3; i++) FX.spawn('px', h[0] + R(-30, 30), h[1] + R(-30, 30), { vx: R(-2, 2), vy: R(-2, 2), life: 10, size: 2, color: U.pick([RED, RED2, '#fff']), add: true });
        if (mf === 22) {
          spawnRed(f, m, h[0] + f.facing * 30, h[1], { big: true, vx: 10 });
          snd('max_red', { pan: f.pan() });
          f.vx = -f.facing * 5;
          m.cam.kick(-f.facing * 8, 0);
          m.cam.shake(0.5);
          m.flashScreen('#ff4030', 0.35, 8);
        }
      },
      onEnd(f) { f.hairLift = 0; },
      friction: 0.86,
      voice: 'maxred',
    },
    purple: {
      name: 'Hollow Purple', tier: 7, s: 24, a: 1, r: 34, technique: true, total: 999,
      cond: (f) => technique(f) && f.canAfford(100),
      anim: [[0, 'idle'], [8, 'purpleCharge', 'out'], [30, 'purpleCharge2', 'inOut'], [52, 'purpleCharge', 'inOut']],
      animFrame: (f) => { const c = f.moveData.charge || 0; return c < 52 ? c : 8 + ((c - 8) % 44); },
      onStart(f, m) {
        f.moveData.charge = 0; f.moveData.lvl = 1; f.moveData.fired = false;
        f.cs.infSuspended = true;
        f.cs.purpleSnd = JJK.Audio ? JJK.Audio.loop('purple_charge', { pan: f.pan() }) : null;
        if (JJK.Voice) JJK.Voice.say('gojo', 'purple_chant');
      },
      tick(f, m, mf) { return purpleTick(f, m, mf); },
      onEnd(f) { f.cs.infSuspended = false; f.hairLift = 0; if (f.cs.purpleSnd) { f.cs.purpleSnd.stop(0.1); f.cs.purpleSnd = null; } },
    },
    purpleFire: {
      name: 'Hollow Purple', tier: 7, s: 6, a: 1, r: 36, noCH: true,
      anim: [[0, 'purpleMerge'], [6, 'purpleFire', 'snap'], [30, 'purpleFire'], [42, 'idle', 'inOut']],
      tick(f, m, mf) {
        if (mf === 6) {
          const lvl = f.moveData.lvl || 1;
          spawnPurple(f, m, lvl);
          snd('purple_fire', { pan: f.pan() });
          f.vx = -f.facing * (2 + lvl);
          m.cam.shake(0.3 + lvl * 0.2);
          m.cam.kick(-f.facing * 6 * lvl, 0);
          m.flashScreen('#e0b0ff', 0.4, 10);
          if (JJK.Audio) JJK.Audio.rumble(f.side, 1, 1, 400 + lvl * 200);
        }
      },
      onEnd(f) { f.cs.infSuspended = false; f.hairLift = 0; },
      friction: 0.9,
    },

    // ---- Domain
    domain: {
      name: 'Domain Expansion: Unlimited Void', tier: 8, s: 24, a: 1, r: 10, total: 34, technique: true, noCH: false,
      cond: (f) => technique(f) && f.dg >= 100 && f.canAfford(200),
      anim: [[0, 'idle'], [10, 'domainSign', 'out'], [24, 'domainSign2', 'inOut'], [34, 'domainSign2']],
      onStart(f, m) { return JJK.Domain.begin(f, m, 'void'); },
      tick(f, m, mf) { return JJK.Domain.startupTick(f, m, mf); },
    },
  });

  // Pull defender in front of the attacker (used by Blue moves).
  function pullTo(att, def, m, dist) {
    const from = def.x;
    def.x = U.clamp(att.x + att.facing * dist, -JJK.WALL, JJK.WALL);
    def.y = Math.max(0, def.y * 0.3);
    def.vx = 0;
    def.facing = -att.facing;
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      FX.spawn('px', U.lerp(from, def.x, t), def.y + 90 + R(-20, 20), { vx: att.facing * -2, life: 12, size: 2, color: BLUE2, add: true });
    }
    def.afterT = 6; def.afterCol = '#4aa8ff';
    m.distort(def.x, def.y + 90, 60, 0.8);
  }

  // Hollow Purple charge logic: hold SU to raise the level (limited by meter).
  function purpleTick(f, m, mf) {
    const d = f.moveData;
    const holding = (f.buf.held(0) & B.SU) || (f.cpu && f.cpu.holdSU);
    const nh = f.anchor('nh'), fh = f.anchor('fh');
    const lvlMax = f.canAfford(300) ? 3 : f.canAfford(200) ? 2 : 1;
    d.charge++;
    // level thresholds
    const need = [0, 22, 60, 110];
    const lvl = d.charge >= need[3] && lvlMax >= 3 ? 3 : d.charge >= need[2] && lvlMax >= 2 ? 2 : 1;
    if (lvl !== d.lvl) {
      d.lvl = lvl;
      snd('charge_level', { pitch: 1 + lvl * 0.2 });
      FX.spawn('ring', f.x, f.y + 95, { life: 18, size: 10, size2: 70 + lvl * 20, color: PURPLE, w: 3, add: true });
      m.popText(f, 'LV ' + lvl, '#e0b0ff');
    }
    const k = Math.min(1, d.charge / 110);
    // visuals: blue in the rear hand, red in the lead hand, orbiting & growing
    const orbit = d.charge * (0.15 + k * 0.25);
    const rB = 6 + k * 14, rR = 6 + k * 14;
    d.bx = nh[0] + Math.cos(orbit) * 6 * k; d.by = nh[1] + Math.sin(orbit) * 6 * k;
    d.rx = fh[0] - Math.cos(orbit) * 6 * k; d.ry = fh[1] - Math.sin(orbit) * 6 * k;
    d.rB = rB; d.rR = rR; d.k = k;
    blueSpiral(d.bx, d.by, 40 + k * 30, 1 + Math.floor(k * 3));
    if (d.charge % 2 === 0) FX.spawn('px', d.rx + R(-10, 10), d.ry + R(-10, 10), { vx: R(-3, 3), vy: R(-3, 3), life: 10, size: 2, color: U.pick([RED, RED2]), add: true });
    f.hairLift = k * 6;
    m.cam.shake(0.01 + k * 0.04);
    if (f.cs.purpleSnd) f.cs.purpleSnd.setLevel(k);
    if (JJK.Audio && d.charge % 20 === 0) JJK.Audio.rumble(f.side, k * 0.6, k, 300);
    if (m.stage && m.stage.pull && d.charge % 10 === 0) m.stage.pull(f.x, f.y + 100, 200, k, 10);
    if (m.stage) m.stage.darken = Math.max(m.stage.darken || 0, k * 0.4);
    const minT = need[1];
    if ((holding && d.charge < 170) || d.charge < minT) return 'hold';
    // release
    const cost = [0, 100, 200, 300][d.lvl];
    if (!f.spend(cost)) { d.lvl = 1; f.spend(100); }
    if (f.cs.purpleSnd) { f.cs.purpleSnd.stop(0.05); f.cs.purpleSnd = null; }
    f.startMove('purpleFire', { free: true, data: d });
    f.moveData = d;
    if (d.lvl >= 2) {
      if (d.lvl === 3) purpleCinematic(f, m);
      else m.superFlash(f, 'HOLLOW PURPLE', { dur: 30, zoom: 1.35, color: PURPLE });
    }
    if (JJK.Voice) JJK.Voice.say('gojo', 'purple');
    return 'stop';
  }

  // Full cinematic for Maximum Output Hollow Purple.
  function purpleCinematic(f, m) {
    const head = f.anchor('head');
    const dur = 130;
    m.cinematic({
      dur, letterbox: 30, fighters: false, dark: 0.85,
      start(m) { if (JJK.Audio) JJK.Audio.play('domain_activate', { vol: 0.5 }); f.eyesOpen = true; },
      update(m, t) {
        const cam = m.cam;
        if (t < 70) {
          cam.override = { x: head[0] + f.facing * 10, y: head[1] - 18, zoom: 3.1, speed: 0.2 };
        } else if (t < 96) {
          cam.override = { x: f.x + f.facing * 60, y: JJK.CAM_BASE_Y + 20, zoom: 1.5, speed: 0.2 };
        } else {
          cam.override = { x: U.clamp(f.x + f.facing * 160, -cam.limit, cam.limit), y: JJK.CAM_BASE_Y + 30, zoom: 0.78, speed: 0.15 };
        }
        f.hairLift = 8;
        const d = f.moveData;
        // orbit blue & red into a merge
        const nh = f.anchor('fh');
        const k = U.clamp((t - 20) / 50, 0, 1);
        const ang = t * 0.25;
        const rad = 30 * (1 - k);
        d.cbx = nh[0] + f.facing * 26 + Math.cos(ang) * rad; d.cby = nh[1] + 10 + Math.sin(ang) * rad;
        d.crx = nh[0] + f.facing * 26 - Math.cos(ang) * rad; d.cry = nh[1] + 10 - Math.sin(ang) * rad;
        d.cm = k;
        if (t === 66) { snd('purple_fire'); m.flashScreen('#ffffff', 0.9, 10); m.cam.shake(0.6); }
        if (t % 3 === 0) blueSpiral(d.cbx, d.cby, 40, 2);
      },
      draw(ctx, m, t) {
        const d = f.moveData;
        const cam = m.cam;
        if (t < 70 && d.cbx != null) {
          const r = 8 * cam.ez * (1 + d.cm);
          FX.glow(ctx, cam.sx(d.cbx), cam.sy(d.cby), r * 4, BLUE, 1);
          FX.pxCircle(ctx, cam.sx(d.cbx), cam.sy(d.cby), r, BLUE2);
          FX.glow(ctx, cam.sx(d.crx), cam.sy(d.cry), r * 4, RED, 1);
          FX.pxCircle(ctx, cam.sx(d.crx), cam.sy(d.cry), r, RED2);
          if (d.cm > 0.6) FX.glow(ctx, cam.sx((d.cbx + d.crx) / 2), cam.sy((d.cby + d.cry) / 2), r * 8 * d.cm, PURPLE, d.cm);
        }
        // chant text
        const lines = ['PHASE.', 'TWILIGHT.', 'EYES OF WISDOM.'];
        for (let i = 0; i < 3; i++) {
          const t0 = 6 + i * 18;
          if (t > t0 && t < 72) JJK.Font.draw(ctx, lines[i], 40 + i * 8, 250 + i * 14, { color: '#e0d0ff', outline: '#200030' });
        }
        if (t > 72 && t < 128) {
          const b = JJK.Font.banner('HOLLOW PURPLE', { scale: 5, top: '#ffffff', mid: '#e0a0ff', mid2: '#b050ff', bot: '#40007a', outline: '#10001a' });
          if (b) ctx.drawImage(b, Math.round(320 - b.width / 2), 40);
          JJK.Font.draw(ctx, 'IMAGINARY TECHNIQUE', 320, 30, { color: '#d0b0ff', align: 'center', outline: '#000' });
        }
      },
      onEnd(m) { f.eyesOpen = false; },
    });
  }

  // ---------------------------------------------------------------- Infinity
  function preHit(def, att, h, info) {
    const cs = def.cs;
    if (!cs.infOn || cs.infSuspended || def.burnout > 0) return null;
    if (h.bypassInf || (info.proj && info.proj.bypassInf)) return null;
    if (att.cs && att.cs.da && info.kind !== 'proj') {
      // Domain Amplification neutralizes Infinity on contact
      if (info.m && def.sf % 4 === 0) FX.spawn('ring', info.pt[0], info.pt[1], { life: 8, size: 4, size2: 20, color: '#202030', w: 2 });
      return null;
    }
    const m = info.m;
    if (m.domain && m.domain.type === 'shrine') return null; // sure-hit
    const dmg = h.dmg || 10;
    let cost = 6 + dmg * 0.34 + (info.kind === 'throw' ? 10 : 0);
    if (def.st === 'move' && def.move && def.move.tier < 4) cost *= 1.5; // harder to maintain while attacking
    if (cost > cs.inf) {
      // overwhelmed: Infinity shatters, the attack goes through with reduced force
      breakInfinity(def, m);
      return null;
    }
    cs.inf -= cost;
    def.meterGain(4);
    const pt = info.pt;
    // the attack slows to a crawl and never arrives
    if (info.proj) {
      const p = info.proj;
      p.stopped = true; p.frozen = 20; p.noCollide = true;
      setTimeout0(m, 20, () => { p.kill(m); FX.spawn('ring', p.x, p.y, { life: 12, size: 4, size2: 26, color: '#dff4ff', w: 1, add: true }); });
    } else {
      att.slowT = 22; att.timeScale = 0.12;
      att.hitstop = 2;
      att.vx = 0;
      if (att.st === 'move') att.contact = 'block';
    }
    FX.spawn('ring', pt[0], pt[1], { life: 18, size: 2, size2: 30, color: '#dff4ff', w: 1, add: true });
    FX.spawn('ring', pt[0], pt[1], { life: 24, size: 2, size2: 18, color: '#9fd8ff', w: 1, add: true, delay: 4 });
    m.distort(pt[0], pt[1], 28, 0.9);
    snd('infinity_stop', { pan: def.pan() });
    cs.stopFx = 20; cs.stopPt = pt;
    if (info.kind === 'throw') return 'nullified';
    return 'nullified';
  }

  function setTimeout0(m, frames, fn) {
    m.events.push({ t: frames, fn });
  }

  function breakInfinity(f, m) {
    const cs = f.cs;
    cs.infOn = false; cs.inf = 0; cs.infBroken = true;
    const p = f.anchor('chest');
    for (let i = 0; i < 24; i++) FX.spawn('debris', p[0] + R(-30, 30), p[1] + R(-50, 50), { vx: R(-5, 5), vy: R(-2, 6), ay: -0.3, life: 40, size: R(2, 4), color: '#dff4ff', color2: '#ffffff', vr: R(-0.4, 0.4), floor: 0 });
    FX.spawn('ring', p[0], p[1], { life: 16, size: 60, size2: 10, color: '#dff4ff', w: 2, add: true });
    snd('infinity_break', { pan: f.pan() });
    m.popText(f, 'INFINITY BROKEN', '#9fd8ff', true);
    m.cam.shake(0.25);
    if (f.st !== 'move' || (f.move && f.move.tier < 6)) {
      f.st = 'stagger'; f.sf = 0; f.stun = 18; f.move = null; f.setAnim('stagger');
    }
  }

  // ---------------------------------------------------------------- definition
  const commands = [
    { id: 'domain', b: B.SP | B.SU, chord: true, air: 'both' },
    { id: 'purple', m: '623', b: B.SU },
    { id: 'maxRed', m: '214', b: B.SU },
    { id: 'blueCrush', m: '236', b: B.SU },
    { id: 'exRedBurst', b: B.SU, dir: [1, 2, 3] },
    { id: 'redCounter', b: B.SU, dir: [4] },
    { id: 'blue', m: '236', b: B.SP },
    { id: 'red', m: '214', b: B.SP },
    { id: 'teleport', m: '22', b: B.SP },
    { id: 'jBlue', m: '236', b: B.SP, air: true },
    { id: 'jRed', m: '214', b: B.SP, air: true },
    { id: 'jTeleport', m: '22', b: B.SP, air: true },
    { id: 'redLaunch', b: B.SP, dir: [1, 2, 3] },
    { id: 'blueCounter', b: B.SP, dir: [4] },
    { id: 'blueRush', b: B.SP, dir: [6] },
    { id: 'bluePull', b: B.SP },
    { id: 'jTeleport', b: B.SP, air: true, dir: [1, 2, 3] },
    { id: 'jBlue', b: B.SP, air: true },
  ].concat(Kit.normalsCommands());

  const def = {
    id: 'gojo', name: 'GOJO', full: 'SATORU GOJO', title: 'THE STRONGEST',
    art: JJK.Art.gojo,
    color: '#7fd8ff',
    hitColor: '#cfeeff',
    blockColor: '#9fd8ff',
    afterColor: '#4aa8ff',
    smearMat: U.mat('#dff2ff', { emissive: 1, light: '#ffffff', shadow: '#bfe2ff', deep: '#9fd0ff' }),
    pgBonus: 3, // Six Eyes: wider perfect guard window
    blockMeterMult: 1.5,
    stats: { hp: 1000, walkF: 2.7, walkB: 2.2, runSpeed: 0, jumpV: 11.2, jumpVx: 4.1, grav: 0.55, prejump: 3, airActions: 2 },
    poses: JJK.Poses.gojo,
    anims: Kit.baseAnims(),
    moves: Kit.build(moves),
    commands: [],
    initState(f) {
      return { inf: 100, infOn: false, infBroken: false, infSuspended: false, tpCd: 0, stopFx: 0, purpleSnd: null, hum: null };
    },
    update(f, m) {
      const cs = f.cs;
      if (cs.tpCd > 0) cs.tpCd--;
      if (cs.stopFx > 0) cs.stopFx--;
      // toggle Infinity with the Unique button
      if (f.buf.pr(0) & B.UN && !m.inputLocked && !f.isStunned() && f.st !== 'cinematic') {
        if (cs.infOn) {
          cs.infOn = false;
          snd('infinity_off', { pan: f.pan() });
        } else if (!cs.infBroken && cs.inf >= 25 && f.burnout <= 0) {
          cs.infOn = true;
          snd('infinity_on', { pan: f.pan() });
          FX.spawn('ring', f.x, f.y + 95, { life: 16, size: 70, size2: 30, color: '#dff4ff', w: 1, add: true });
          if (JJK.Voice && U.chance(0.3)) JJK.Voice.say('gojo', 'infinity');
        } else if (JJK.Audio) JJK.Audio.play('ui_error', { vol: 0.4 });
      }
      if (f.burnout > 0) cs.infOn = false;
      const t = m.training;
      if (cs.infOn && !cs.infSuspended) {
        cs.inf -= 4.5 / 60;
        if (cs.inf <= 0) { cs.inf = 0; cs.infOn = false; snd('infinity_off'); }
      } else if (!cs.infOn) {
        cs.inf = Math.min(100, cs.inf + (cs.infBroken ? 9 : 12) / 60);
        if (cs.infBroken && cs.inf >= 100) { cs.infBroken = false; m.popText(f, 'INFINITY READY', '#dff4ff'); }
      }
      if (t && t.infMeter) cs.inf = Math.max(cs.inf, cs.infOn ? 100 : cs.inf);
      // hum loop while active
      if (cs.infOn && !cs.hum && JJK.Audio) cs.hum = JJK.Audio.loop('infinity_hum', { vol: 0.5 });
      if (!cs.infOn && cs.hum) { cs.hum.stop(0.3); cs.hum = null; }
      // hand glow particles
      if (f.visible && !f.invisible && m.frame % 3 === 0 && JJK.HEADLESS !== true) {
        const h = f.anchor(f.facing > 0 ? 'fh' : 'fh');
        FX.spawn('px', h[0] + R(-4, 4), h[1] + R(-3, 5), { vy: R(0.4, 1.2), vx: R(-0.3, 0.3), life: 14, size: R(1, 2.5), color: U.pick([BLUE2, BLUE, '#ffffff']), add: true });
      }
    },
    preHit,
    lights(f, m) {
      if (!f.visible || f.invisible) return;
      const h = f.anchor('fh');
      FX.light(h[0], h[1], 46, [40, 120, 255], 0.55);
      if (f.st === 'move' && f.move && (f.move.id === 'purple') && f.moveData.bx != null) {
        const d = f.moveData;
        FX.light(d.bx, d.by, 90 + d.k * 80, [40, 110, 255], 1.2);
        FX.light(d.rx, d.ry, 90 + d.k * 80, [255, 50, 30], 1.2);
      }
    },
    auraColor(f) {
      const cs = f.cs;
      if (cs.infOn && !cs.infSuspended) return (f.match && f.match.frame % 20 < 10) ? U.pack(210, 240, 255) : U.pack(150, 210, 255);
      if (f.burnout > 0) return U.pack(60, 60, 70);
      return 0;
    },
    drawFx(f, ctx, cam, m) {
      if (!f.visible || f.invisible) return;
      const z = cam.ez;
      // fist glow (reference: blue cursed energy around the hands)
      for (const a of ['fh', 'nh']) {
        const h = f.anchor(a);
        const sx = cam.sx(h[0]), sy = cam.sy(h[1]);
        FX.glow(ctx, sx, sy, (a === 'fh' ? 16 : 11) * z, BLUE, 0.75);
      }
      // Infinity field
      const cs = f.cs;
      if (cs.infOn && !cs.infSuspended) {
        const c = f.anchor('chest');
        const sx = cam.sx(c[0]), sy = cam.sy(c[1]);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + 0.06 * Math.sin(m.frame * 0.1);
        ctx.strokeStyle = '#dff4ff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const rr = (62 + i * 9 + ((m.frame * 0.6 + i * 20) % 18)) * z;
          ctx.beginPath();
          ctx.ellipse(sx, sy + 10 * z, rr * 0.75, rr, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (cs.stopFx > 0 && cs.stopPt) {
        const p = cs.stopPt;
        m.distort(p[0], p[1], 22, 0.92);
      }
      // Purple charge orbs
      if (f.st === 'move' && f.move && f.move.id === 'purple' && f.moveData.bx != null) {
        const d = f.moveData;
        const rB = d.rB * z, rR = d.rR * z;
        m.distort(d.bx, d.by, d.rB * 2.5, 0.8);
        m.distort(d.rx, d.ry, d.rR * 2.5, 1.2);
        FX.glow(ctx, cam.sx(d.bx), cam.sy(d.by), rB * 4, BLUE, 1);
        drawOrb(ctx, cam.sx(d.bx), cam.sy(d.by), rB, ['#0b1f7a', BLUE, BLUE2, '#ffffff'], m.frame, 0.6);
        FX.glow(ctx, cam.sx(d.rx), cam.sy(d.ry), rR * 4, RED, 1);
        drawOrb(ctx, cam.sx(d.rx), cam.sy(d.ry), rR, ['#5a0000', RED, RED2, '#ffffff'], m.frame, 0.6);
        if (d.lvl >= 2) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = d.lvl === 3 ? '#e0b0ff' : '#b070ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cam.sx(d.bx), cam.sy(d.by));
          ctx.lineTo(cam.sx(d.rx), cam.sy(d.ry));
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    moveList: [
      ['NORMALS', ''],
      ['L / M / H', 'Jab / Palm Strike / Spinning Heel'],
      ['2L / 2M / 2H', 'Low Kick (low) / Sliding Shin (low) / Rising Uppercut (launcher)'],
      ['j.L / j.M / j.H', 'Air Jab / Air Knee / Axe Kick (ground bounce)'],
      ['6H', 'Blink Strike (teleporting punch)'],
      ['L+M', 'Throw (hold ← to swap sides)'],
      ['M+H', 'Cursed Parry'],
      ['→→ / ←←', 'Spatial Step (blink) / Back Step'],
      ['TECHNIQUES', ''],
      ['↓↘→ + SP', 'Lapse: Blue (gravity orb, pulls opponent)  [air OK]'],
      ['↓↙← + SP', 'Reversal: Red (repelling blast)  [air OK]'],
      ['↓↓ + SP', 'Spatial Teleport (behind opponent)  [air: above]'],
      ['SP', 'Blue: Pull (drag opponent into range)'],
      ['→ + SP', 'Blue: Movement (projectile-proof rush)'],
      ['← + SP', 'Blue: Counter (counter stance)'],
      ['↓ + SP', 'Red: Launcher (anti-air)'],
      ['UNIQUE', 'Toggle INFINITY (drains Infinity gauge)'],
      ['ENHANCED (50 CE)', ''],
      ['↓↘→ + SU', 'Blue Crush (targeted gravity, pulls into a strike)'],
      ['↓ + SU', 'Red: Burst (invincible reversal)'],
      ['← + SU', 'Red: Counter (catches strikes & projectiles)'],
      ['SUPERS', ''],
      ['↓↙← + SU', 'Maximum Output: Red  (100 CE)'],
      ['→↓↘ + SU', 'Hollow Purple: hold SU to charge Lv1-3 (100/200/300 CE)'],
      ['SP + SU', 'Domain Expansion: Unlimited Void (200 CE + full Domain gauge)'],
    ],
  };
  // filter commands to existing moves
  def.commands = commands.filter((c) => def.moves[c.id]);
  JJK.Chars.gojo = def;
})();
