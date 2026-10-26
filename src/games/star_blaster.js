// Star Blaster — vertical shoot-'em-up: alien waves, power-ups and a boss every fourth wave.
// Also the game inside the arcade cabinet.
import { defineGame } from './index.js';

const DROPS = { P: '#ffb703', S: '#4cc9f0', B: '#ff4fa3', L: '#7ae582' };

defineGame({
  id: 'star_blaster', title: 'Star Blaster', genre: 'Shoot-em-up', icon: '🚀', color: '#3a86ff',
  desc: 'Blast through alien waves, power up your cannons and topple a boss every fourth wave.',
  help: 'Arrows / WASD move · auto-fire · Space / X smart bomb',
  platforms: ['console', 'pc', 'handheld', 'arcade'],
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2;
    const P = { x: W / 2, y: H - 50, inv: 2, lives: 3, bombs: 2, lvl: 1, shield: 0, fireT: 0, tilt: 0 };
    const shots = [], ebul = [], foes = [], drops = [], parts = [], stars = [], pops = [];
    for (let i = 0; i < 110; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() });
    let wave = 0, queue = [], spawnT = 0, banner = '', bannerT = 0, shake = 0, flash = 0, dead = false, endT = 0, boss = null, t = 0, waveDelay = 1.2;
    api.music('chip');

    const burst = (x, y, col, n = 14, sp = 160, life = 0.6) => {
      for (let i = 0; i < n && parts.length < 500; i++) {
        const a = Math.random() * TAU, s = sp * (0.25 + Math.random());
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.5), max: life, col, r: 1.5 + Math.random() * 2.5 });
      }
    };
    const pop = (x, y, txt, col = '#fff') => pops.push({ x, y, txt, col, life: 0.9 });
    const aim = (x, y, sp, spread = 0) => { const a = Math.atan2(P.y - y, P.x - x) + spread; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }; };
    const fireE = (x, y, vx, vy, col = '#ff5d8f') => ebul.push({ x, y, vx, vy, col });

    function nextWave() {
      wave++;
      if (wave % 4 === 0) {
        const hp = 70 + wave * 18;
        boss = { x: W / 2, y: -90, hp, max: hp, t: 0, hitT: 0, mode: 0, modeT: 0, fireT: 0, ang: 0 };
        banner = 'WARNING · BOSS APPROACHING'; bannerT = 2.4; api.sfx('error');
        return;
      }
      banner = `WAVE ${wave}`; bannerT = 1.6; api.sfx('reveal');
      const squads = 3 + Math.floor(wave / 2);
      for (let s = 0; s < squads; s++) {
        const r = Math.random();
        const kind = wave >= 3 && r < 0.22 ? 'gunship' : wave >= 2 && r < 0.55 ? 'diver' : 'drone';
        const count = kind === 'gunship' ? 1 + (wave > 6 ? 1 : 0) : 4 + Math.floor(Math.random() * 3);
        const x0 = api.rand(90, W - 90), line = Math.random() < 0.5;
        for (let i = 0; i < count; i++) queue.push({ d: i === 0 ? 1.3 : 0.3, kind, x: line ? x0 : 60 + (W - 120) * (i + 0.5) / count });
      }
    }
    function spawn(e) {
      const hp = { drone: 1, diver: 2, gunship: 7 }[e.kind] + Math.floor(wave / 5);
      foes.push({ kind: e.kind, x: e.x, bx: e.x, y: -24, hp, max: hp, t: 0, ph: Math.random() * TAU, fireT: api.rand(0.8, 2.5), vx: 0, vy: 0, hitT: 0, state: 0 });
    }
    function hurtPlayer() {
      if (P.inv > 0 || dead) return;
      if (P.shield) { P.shield = 0; P.inv = 1; api.sfx('hit', { pitch: 1.6 }); burst(P.x, P.y, '#4cc9f0', 20, 200); return; }
      P.lives--; P.lvl = Math.max(1, P.lvl - 1); P.inv = 2.5; shake = 14; flash = 0.4;
      burst(P.x, P.y, '#ffd166', 40, 260, 0.9); api.sfx('explode');
      if (P.lives < 0) { dead = true; endT = 1.8; banner = 'GAME OVER'; bannerT = 9; }
    }
    function killFoe(f) {
      const pts = { drone: 50, diver: 80, gunship: 250 }[f.kind];
      api.addScore(pts * (1 + Math.floor(wave / 4))); pop(f.x, f.y, `+${pts}`);
      burst(f.x, f.y, f.kind === 'gunship' ? '#c77dff' : '#ff7b54', f.kind === 'gunship' ? 34 : 16, 200);
      shake = Math.max(shake, f.kind === 'gunship' ? 7 : 3); api.sfx('explode', { pitch: f.kind === 'gunship' ? 0.8 : 1.4, volume: 0.6 });
      const r = Math.random();
      if (r < (f.kind === 'gunship' ? 0.9 : 0.09)) {
        const k = Math.random() < 0.45 ? 'P' : Math.random() < 0.45 ? 'S' : Math.random() < 0.7 ? 'B' : 'L';
        drops.push({ x: f.x, y: f.y, k, t: 0 });
      }
    }
    function bomb() {
      if (P.bombs <= 0 || dead) return;
      P.bombs--; flash = 0.6; shake = 16; api.sfx('explode', { pitch: 0.6 }); api.sfx('sparkle');
      for (const b of ebul) { burst(b.x, b.y, '#ffd6ff', 2, 60, 0.4); api.addScore(5); }
      ebul.length = 0;
      for (const f of foes) { f.hp -= 10; f.hitT = 0.1; }
      if (boss && boss.y > 0) { boss.hp -= 20; boss.hitT = 0.15; }
    }

    return {
      update(dt, input) {
        t += dt;
        shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt); bannerT -= dt;
        for (const s of stars) { s.y += (20 + s.z * 140) * dt; if (s.y > H) { s.y = -2; s.x = Math.random() * W; } }
        if (dead) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } }
        else {
          // player
          const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0), my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
          const n = mx && my ? 0.7071 : 1;
          P.x = Math.max(16, Math.min(W - 16, P.x + mx * n * 300 * dt));
          P.y = Math.max(H * 0.35, Math.min(H - 20, P.y + my * n * 260 * dt));
          P.tilt += (mx * 0.35 - P.tilt) * Math.min(1, dt * 10);
          P.inv -= dt;
          if (input.pressed.has('a') || input.pressed.has('b')) bomb();
          P.fireT -= dt;
          if (P.fireT <= 0) {
            P.fireT = 0.11;
            const L = P.lvl, add = (dx, ang) => shots.push({ x: P.x + dx, y: P.y - 14, vx: Math.sin(ang) * 560, vy: -Math.cos(ang) * 560 });
            if (L === 1) add(0, 0);
            else { add(-6, 0); add(6, 0); }
            if (L >= 3) { add(-10, -0.22); add(10, 0.22); }
            if (L >= 4) add(0, 0);
            if (L >= 4 && Math.random() < 0.5) { add(-12, -0.45); add(12, 0.45); }
            api.sfx('blip', { pitch: 1.9 + Math.random() * 0.2, volume: 0.25 });
          }
        }
        // waves
        if (!boss && !queue.length && !foes.length) { waveDelay -= dt; if (waveDelay <= 0) { waveDelay = 1.6; nextWave(); } }
        if (queue.length) { spawnT -= dt; if (spawnT <= 0) { const e = queue.shift(); spawn(e); spawnT = queue[0]?.d ?? 0; } }
        // shots
        for (const s of shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
        for (const b of ebul) { b.x += b.vx * dt; b.y += b.vy * dt; if (!dead && Math.hypot(b.x - P.x, b.y - P.y) < 6) { b.dead = true; hurtPlayer(); } }
        // foes
        for (const f of foes) {
          f.t += dt; f.hitT -= dt; f.fireT -= dt;
          const sp = 1 + wave * 0.06;
          if (f.kind === 'drone') { f.y += 75 * sp * dt; f.x = f.bx + Math.sin(f.t * 2.2 + f.ph) * 45; if (f.fireT <= 0 && f.y < H * 0.6) { f.fireT = api.rand(1.8, 3.5) / sp; const v = aim(f.x, f.y, 150); fireE(f.x, f.y, v.vx, v.vy); } }
          else if (f.kind === 'diver') {
            if (f.state === 0) { f.y += 120 * dt; if (f.y > 70 + (f.ph * 10)) { f.state = 1; const v = aim(f.x, f.y, 240 * sp); f.vx = v.vx * 0.5; f.vy = v.vy; api.sfx('whoosh', { volume: 0.4 }); } }
            else { f.vy += 160 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
          } else {
            if (f.y < 70) f.y += 60 * dt; else { f.state += dt; const tx = W / 2 + Math.sin(f.state * 0.7 + f.ph) * (W / 2 - 70); f.x += (tx - f.x) * Math.min(1, dt * 1.2); }
            if (f.fireT <= 0 && f.y >= 60) { f.fireT = 1.7 / sp; for (const d of [-0.25, 0, 0.25]) { const v = aim(f.x, f.y + 10, 170, d); fireE(f.x, f.y + 10, v.vx, v.vy, '#ffb703'); } api.sfx('blip', { pitch: 0.6, volume: 0.4 }); }
          }
          const R = f.kind === 'gunship' ? 22 : 13;
          for (const s of shots) if (!s.dead && Math.abs(s.x - f.x) < R && Math.abs(s.y - f.y) < R) { s.dead = true; f.hp--; f.hitT = 0.06; burst(s.x, s.y, '#bdf', 2, 80, 0.2); }
          if (!dead && Math.hypot(f.x - P.x, f.y - P.y) < R + 8) { f.hp = Math.min(f.hp, f.kind === 'gunship' ? f.hp - 3 : 0); hurtPlayer(); }
          if (f.hp <= 0 && !f.dead) { f.dead = true; killFoe(f); }
          if (f.y > H + 40 || f.x < -60 || f.x > W + 60) f.dead = true;
        }
        // boss
        if (boss) {
          const b = boss; b.t += dt; b.hitT -= dt; b.modeT += dt; b.fireT -= dt;
          if (b.y < 78) b.y += 50 * dt;
          else {
            b.x = W / 2 + Math.sin(b.t * 0.6) * 190;
            const rage = b.hp < b.max * 0.4 ? 1.5 : 1;
            if (b.modeT > 4.5) { b.modeT = 0; b.mode = (b.mode + 1) % 3; }
            if (b.fireT <= 0) {
              if (b.mode === 0) { b.fireT = 1.1 / rage; for (let i = -4; i <= 4; i++) { const a = Math.PI / 2 + i * 0.16; fireE(b.x, b.y + 30, Math.cos(a) * 150, Math.sin(a) * 150); } api.sfx('blip', { pitch: 0.5, volume: 0.5 }); }
              else if (b.mode === 1) { b.fireT = 0.09 / rage; b.ang += 0.42; for (const o of [0, Math.PI]) fireE(b.x, b.y + 10, Math.cos(b.ang + o) * 130, Math.sin(b.ang + o) * 130 + 40, '#c77dff'); }
              else { b.fireT = 0.6 / rage; for (const x of [-46, 46]) { const v = aim(b.x + x, b.y + 20, 210); fireE(b.x + x, b.y + 20, v.vx, v.vy, '#ffb703'); } api.sfx('blip', { pitch: 0.8, volume: 0.4 }); }
            }
          }
          for (const s of shots) if (!s.dead && Math.abs(s.x - b.x) < 64 && Math.abs(s.y - b.y) < 34) { s.dead = true; b.hp--; b.hitT = 0.05; burst(s.x, s.y - 4, '#ffe066', 2, 90, 0.25); api.addScore(2); }
          if (!dead && Math.abs(P.x - b.x) < 60 && Math.abs(P.y - b.y) < 30) hurtPlayer();
          if (b.hp <= 0) {
            const pts = 2000 + wave * 250; api.addScore(pts); pop(b.x, b.y, `BOSS +${pts}`, '#ffd166');
            for (let i = 0; i < 6; i++) burst(b.x + api.rand(-50, 50), b.y + api.rand(-25, 25), ['#ffd166', '#ff5d8f', '#c77dff'][i % 3], 30, 280, 1.2);
            shake = 22; flash = 0.8; api.sfx('explode', { pitch: 0.5 }); api.sfx('levelup');
            drops.push({ x: b.x - 30, y: b.y, k: 'P', t: 0 }, { x: b.x + 30, y: b.y, k: Math.random() < 0.5 ? 'L' : 'B', t: 0 });
            ebul.length = 0; boss = null; banner = 'BOSS DEFEATED!'; bannerT = 2; waveDelay = 2.5;
          }
        }
        // drops
        for (const d of drops) {
          d.t += dt; d.y += 70 * dt; d.x += Math.sin(d.t * 3) * 30 * dt;
          if (!dead && Math.hypot(d.x - P.x, d.y - P.y) < 22) {
            d.dead = true; api.sfx('powerup'); burst(d.x, d.y, DROPS[d.k], 18, 140);
            if (d.k === 'P') { if (P.lvl < 4) P.lvl++; else api.addScore(500); pop(d.x, d.y, P.lvl < 4 ? 'POWER UP' : '+500', DROPS.P); }
            if (d.k === 'S') { P.shield = 1; pop(d.x, d.y, 'SHIELD', DROPS.S); }
            if (d.k === 'B') { P.bombs = Math.min(5, P.bombs + 1); pop(d.x, d.y, '+BOMB', DROPS.B); }
            if (d.k === 'L') { P.lives = Math.min(5, P.lives + 1); pop(d.x, d.y, '1UP', DROPS.L); }
          }
          if (d.y > H + 20) d.dead = true;
        }
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2; p.life -= dt; }
        for (const p of pops) { p.y -= 30 * dt; p.life -= dt; }
        const keep = (arr, fn) => { let j = 0; for (const o of arr) if (fn(o)) arr[j++] = o; arr.length = j; };
        keep(shots, (s) => !s.dead && s.y > -20 && s.x > -20 && s.x < W + 20);
        keep(ebul, (b) => !b.dead && b.y < H + 20 && b.y > -40 && b.x > -20 && b.x < W + 20);
        keep(foes, (f) => !f.dead); keep(drops, (d) => !d.dead); keep(parts, (p) => p.life > 0); keep(pops, (p) => p.life > 0);
      },
      draw(ctx) {
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#04030f'); g.addColorStop(1, '#140a33');
        ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
        const neb = ctx.createRadialGradient(W * 0.75, (t * 8) % (H + 300) - 150, 10, W * 0.75, (t * 8) % (H + 300) - 150, 220);
        neb.addColorStop(0, 'rgba(120,40,200,0.25)'); neb.addColorStop(1, 'rgba(120,40,200,0)'); ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
        for (const s of stars) { ctx.fillStyle = `rgba(200,220,255,${0.25 + s.z * 0.75})`; ctx.fillRect(s.x, s.y, 1 + s.z * 1.5, 1 + s.z * 2.5); }
        // drops
        for (const d of drops) {
          const c = DROPS[d.k]; ctx.globalAlpha = 0.3 + 0.2 * Math.sin(d.t * 8); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(d.x, d.y, 15, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, TAU); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = c; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.k, d.x, d.y + 1);
        }
        // foes
        for (const f of foes) {
          ctx.save(); ctx.translate(f.x, f.y);
          const hit = f.hitT > 0;
          if (f.kind === 'drone') {
            ctx.fillStyle = hit ? '#fff' : '#ff4d6d'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 7, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = hit ? '#fff' : '#ffb3c1'; ctx.beginPath(); ctx.arc(0, -3, 6, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#fff3'; ctx.fillRect(-12, 1, 24, 2);
          } else if (f.kind === 'diver') {
            ctx.rotate(f.state ? Math.atan2(f.vy, f.vx) - Math.PI / 2 : 0);
            ctx.fillStyle = hit ? '#fff' : '#ff9f1c'; ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(13, -10); ctx.lineTo(0, -4); ctx.lineTo(-13, -10); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff8'; ctx.beginPath(); ctx.arc(0, 2, 3, 0, TAU); ctx.fill();
          } else {
            ctx.fillStyle = hit ? '#fff' : '#7b2cbf'; ctx.beginPath();
            for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 18); } ctx.fill();
            ctx.fillStyle = hit ? '#fff' : '#c77dff'; ctx.fillRect(-20, 6, 8, 12); ctx.fillRect(12, 6, 8, 12);
            ctx.fillStyle = `rgba(255,220,120,${0.6 + 0.4 * Math.sin(f.t * 6)})`; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
            ctx.fillStyle = '#0008'; ctx.fillRect(-18, -26, 36, 4); ctx.fillStyle = '#7ae582'; ctx.fillRect(-18, -26, 36 * f.hp / f.max, 4);
          }
          ctx.restore();
        }
        // boss
        if (boss) {
          const b = boss, hit = b.hitT > 0;
          ctx.save(); ctx.translate(b.x, b.y);
          ctx.fillStyle = hit ? '#fff' : '#3c096c';
          ctx.beginPath(); ctx.moveTo(-70, -10); ctx.lineTo(-40, -32); ctx.lineTo(40, -32); ctx.lineTo(70, -10); ctx.lineTo(56, 22); ctx.lineTo(20, 34); ctx.lineTo(-20, 34); ctx.lineTo(-56, 22); ctx.closePath(); ctx.fill();
          ctx.fillStyle = hit ? '#fff' : '#5a189a'; ctx.fillRect(-60, -6, 120, 14);
          ctx.fillStyle = hit ? '#fff' : '#9d4edd'; for (const x of [-46, 46]) { ctx.fillRect(x - 6, 10, 12, 18); }
          const pulse = 0.6 + 0.4 * Math.sin(b.t * 8);
          ctx.shadowColor = '#ff006e'; ctx.shadowBlur = 20; ctx.fillStyle = `rgba(255,${80 + pulse * 120},160,1)`;
          ctx.beginPath(); ctx.arc(0, 4, 13 + pulse * 3, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
          ctx.restore();
          ctx.fillStyle = '#0009'; ctx.fillRect(W / 2 - 160, 8, 320, 10); ctx.fillStyle = '#ff006e'; ctx.fillRect(W / 2 - 159, 9, 318 * Math.max(0, b.hp / b.max), 8);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('MOTHERSHIP', W / 2, 21);
        }
        // shots
        ctx.fillStyle = '#9bf6ff';
        for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 8, 3, 14);
        for (const b of ebul) { ctx.fillStyle = b.col; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, TAU); ctx.fill(); }
        // player
        if (!dead && (P.inv <= 0 || Math.floor(t * 14) % 2)) {
          ctx.save(); ctx.translate(P.x, P.y); ctx.scale(1 - Math.abs(P.tilt) * 0.4, 1);
          ctx.fillStyle = `rgba(255,${150 + Math.random() * 100},60,0.9)`; ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 20 + Math.random() * 10); ctx.lineTo(5, 12); ctx.fill();
          const pg = ctx.createLinearGradient(0, -18, 0, 14); pg.addColorStop(0, '#e0fbfc'); pg.addColorStop(1, '#3a86ff');
          ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(16, 12); ctx.lineTo(5, 8); ctx.lineTo(0, 13); ctx.lineTo(-5, 8); ctx.lineTo(-16, 12); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ff006e'; ctx.beginPath(); ctx.arc(0, -2, 3, 0, TAU); ctx.fill();
          if (P.shield) { ctx.strokeStyle = `rgba(76,201,240,${0.5 + 0.3 * Math.sin(t * 10)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke(); }
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 12px monospace';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y); }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (flash) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, flash)})`; ctx.fillRect(0, 0, W, H); }
        // HUD
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#cde';
        ctx.fillText(`WAVE ${wave}`, 12, 10);
        for (let i = 0; i < Math.max(0, P.lives); i++) { ctx.fillStyle = '#3a86ff'; ctx.beginPath(); ctx.moveTo(14 + i * 16, 42); ctx.lineTo(20 + i * 16, 30); ctx.lineTo(26 + i * 16, 42); ctx.fill(); }
        for (let i = 0; i < P.bombs; i++) { ctx.fillStyle = DROPS.B; ctx.beginPath(); ctx.arc(18 + i * 14, 54, 4.5, 0, TAU); ctx.fill(); }
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffb703'; ctx.fillText('PWR ' + '▮'.repeat(P.lvl) + '▯'.repeat(4 - P.lvl), W - 12, boss ? 34 : 10);
        if (bannerT > 0) {
          ctx.globalAlpha = Math.min(1, bannerT * 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = 'bold 30px monospace'; ctx.fillStyle = banner.startsWith('WARN') ? '#ff006e' : '#fff';
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16; ctx.fillText(banner, W / 2, H / 2 - 20); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
      },
    };
  },
});
