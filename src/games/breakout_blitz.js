// Breakout Blitz — brick breaker with six layouts, tough & steel bricks and falling power-ups.
import { defineGame } from './index.js';

// '.' empty · 1-3 hit points · S steel (unbreakable) · B bonus brick (always drops a power-up)
const LAYOUTS = [
  { name: 'Warm-Up', rows: ['............', '111111111111', '1B11111111B1', '222222222222', '111111111111', '111111111111'] },
  { name: 'Pyramid', rows: ['.....33.....', '....2222....', '...2B11B2...', '..11111111..', '.1111111111.', '222222222222'] },
  { name: 'Heart', rows: ['.22......22.', '2112....2112', '211112211112', '.2111BB1112.', '..21111112..', '...211112...', '.....22.....'] },
  { name: 'Invader', rows: ['..1......1..', '...1....1...', '..22222222..', '.22.3223.22.', '222222222222', '2.22B22B22.2', '2.2......2.2', '...33..33...'] },
  { name: 'Fortress', rows: ['S2S2S22S2S2S', '2B11111111B2', 'S1S......S1S', '212.3333.212', 'S1S......S1S', '211111111112', 'SSSS....SSSS'] },
  { name: 'Diamond', rows: ['.....33.....', '....3223....', '...321123...', '..321BB123..', '...321123...', '....3223....', '.....33.....'] },
];
const HPC = { 1: ['#4cc9f0', '#4895ef'], 2: ['#f72585', '#b5179e'], 3: ['#ffd166', '#f8961e'], S: ['#8d99ae', '#5c677d'], B: ['#7ae582', '#2a9d8f'] };
const PU = { W: ['#4cc9f0', 'WIDE'], M: ['#f72585', 'MULTI'], S: ['#7ae582', 'SLOW'], L: ['#ff595e', 'LASER'], F: ['#ff9f1c', 'FIRE'], '+': ['#ffd166', '1UP'] };

defineGame({
  id: 'breakout_blitz', title: 'Breakout Blitz', genre: 'Arcade', icon: '🧱', color: '#f72585',
  desc: 'Smash six handcrafted brick layouts. Catch power-ups: multi-ball, lasers, fireballs and more.',
  help: 'Mouse or ← → to move · Space / click to launch & fire lasers',
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2, BW = 48, BH = 18, GAP = 4, OX = 10, OY = 46, PY = 370;
    const pad = { x: W / 2, w: 86, tw: 86 };
    let balls = [], bricks = [], drops = [], lasers = [], parts = [], pops = [];
    let level = 0, lives = 3, combo = 0, shake = 0, t = 0, banner = '', bannerT = 0, over = false, endT = 0, useMouse = false, lastMX = null, clearT = 0;
    const fx = { W: 0, S: 0, L: 0, F: 0 };
    let laserCD = 0;
    api.music('chip');

    function load(i) {
      const L = LAYOUTS[i % LAYOUTS.length];
      bricks = [];
      L.rows.forEach((row, r) => [...row].forEach((c, k) => {
        if (c === '.') return;
        const hp = c === 'S' ? Infinity : c === 'B' ? 1 : +c;
        const [c1, c2] = c === '1' ? [`hsl(${(170 + r * 32) % 360},85%,62%)`, `hsl(${(170 + r * 32) % 360},75%,46%)`] : HPC[c];
        bricks.push({ x: OX + k * (BW + GAP), y: OY + r * (BH + GAP), hp, max: hp, kind: c, hit: 0, c1, c2 });
      }));
      banner = `LEVEL ${i + 1} · ${L.name}`; bannerT = 2; drops = []; lasers = [];
      resetBall();
    }
    const speed = () => (300 + level * 22) * (fx.S > 0 ? 0.7 : 1);
    function resetBall() { balls = [{ x: pad.x, y: PY - 10, vx: 0, vy: 0, stuck: true, trail: [] }]; combo = 0; }
    const burst = (x, y, col, n = 12, sp = 160) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.4, col }); } };
    function damage(b, byLaser) {
      if (b.hp === Infinity) { b.hit = 0.15; api.sfx('clink', { volume: 0.4 }); return; }
      b.hp--; b.hit = 0.12;
      if (b.hp > 0) { api.sfx('hit', { pitch: 1.8, volume: 0.5 }); return; }
      combo++;
      const pts = Math.round(20 * b.max * (1 + Math.min(combo, 20) * 0.1)); api.addScore(pts);
      if (combo >= 5 && combo % 5 === 0) pops.push({ x: b.x + BW / 2, y: b.y, txt: `COMBO ×${combo}`, life: 1 });
      const col = b.c1;
      burst(b.x + BW / 2, b.y + BH / 2, col, 14);
      api.sfx('pop', { pitch: 0.9 + Math.min(1, combo * 0.05), volume: 0.6 });
      shake = Math.max(shake, byLaser ? 2 : 4);
      if (b.kind === 'B' || Math.random() < 0.13) { const keys = Object.keys(PU); drops.push({ x: b.x + BW / 2, y: b.y + BH / 2, k: b.kind === 'B' ? keys[Math.floor(Math.random() * 5)] : keys[Math.floor(Math.random() * keys.length)] }); }
      b.dead = true;
    }
    function collect(k) {
      api.sfx('powerup'); pops.push({ x: pad.x, y: PY - 24, txt: PU[k][1], life: 1, col: PU[k][0] });
      if (k === 'W') fx.W = 12; if (k === 'S') fx.S = 8; if (k === 'L') fx.L = 10; if (k === 'F') fx.F = 7;
      if (k === '+') lives = Math.min(6, lives + 1);
      if (k === 'M') {
        const src = balls.find((b) => !b.stuck) || balls[0];
        for (const a of [-0.5, 0.5]) { const s = speed(), ang = Math.atan2(src.vy || -1, src.vx || 0) + a; balls.push({ x: src.x, y: src.y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, stuck: false, trail: [] }); }
      }
      api.addScore(50);
    }
    load(0);

    return {
      update(dt, input) {
        t += dt; shake = Math.max(0, shake - dt * 30); bannerT -= dt; laserCD -= dt;
        for (const k in fx) fx[k] = Math.max(0, fx[k] - dt);
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.life -= dt; }
        for (const p of pops) { p.y -= 30 * dt; p.life -= dt; }
        for (const b of bricks) b.hit = Math.max(0, b.hit - dt);
        parts = parts.filter((p) => p.life > 0); pops = pops.filter((p) => p.life > 0);
        if (over) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        if (clearT > 0) { clearT -= dt; if (clearT <= 0) { level++; load(level); } return; }
        // paddle
        pad.tw = fx.W > 0 ? 136 : 86; pad.w += (pad.tw - pad.w) * Math.min(1, dt * 8);
        if (lastMX !== null && Math.abs(input.mouse.x - lastMX) > 0.5) useMouse = true;
        lastMX = input.mouse.x;
        const k = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (k) useMouse = false;
        if (useMouse) pad.x += (input.mouse.x - pad.x) * Math.min(1, dt * 20); else pad.x += k * 480 * dt;
        pad.x = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.x));
        const fire = input.pressed.has('a') || input.mouse.clicked;
        if (fire && balls.some((b) => b.stuck)) {
          for (const b of balls) if (b.stuck) { b.stuck = false; const a = -Math.PI / 2 + api.rand(-0.35, 0.35); b.vx = Math.cos(a) * speed(); b.vy = Math.sin(a) * speed(); }
          api.sfx('boing', { pitch: 1.5, volume: 0.4 });
        } else if (fx.L > 0 && (input.a || input.mouse.down) && laserCD <= 0) {
          laserCD = 0.28; for (const s of [-1, 1]) lasers.push({ x: pad.x + s * (pad.w / 2 - 6), y: PY - 6 });
          api.sfx('blip', { pitch: 1.8, volume: 0.4 });
        }
        // lasers
        for (const l of lasers) { l.y -= 600 * dt; for (const b of bricks) if (!b.dead && !l.dead && l.x > b.x && l.x < b.x + BW && l.y > b.y && l.y < b.y + BH) { l.dead = true; damage(b, true); } }
        lasers = lasers.filter((l) => !l.dead && l.y > 0);
        // balls
        for (const ball of balls) {
          if (ball.stuck) { ball.x = pad.x; ball.y = PY - 10; continue; }
          const sp = Math.hypot(ball.vx, ball.vy), want = speed() * (1 + Math.min(0.4, combo * 0.01));
          ball.vx *= 1 + (want / sp - 1) * Math.min(1, dt * 2); ball.vy *= 1 + (want / sp - 1) * Math.min(1, dt * 2);
          const steps = Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 5);
          for (let s = 0; s < steps; s++) {
            ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
            if (ball.x < 6) { ball.x = 6; ball.vx = Math.abs(ball.vx); api.sfx('blip', { pitch: 0.8, volume: 0.3 }); }
            if (ball.x > W - 6) { ball.x = W - 6; ball.vx = -Math.abs(ball.vx); api.sfx('blip', { pitch: 0.8, volume: 0.3 }); }
            if (ball.y < 34) { ball.y = 34; ball.vy = Math.abs(ball.vy); api.sfx('blip', { pitch: 0.8, volume: 0.3 }); }
            if (ball.vy > 0 && ball.y + 6 >= PY - 6 && ball.y < PY + 6 && Math.abs(ball.x - pad.x) < pad.w / 2 + 6) {
              const off = Math.max(-1, Math.min(1, (ball.x - pad.x) / (pad.w / 2))), a = -Math.PI / 2 + off * 1.05, v = Math.hypot(ball.vx, ball.vy);
              ball.vx = Math.cos(a) * v; ball.vy = Math.sin(a) * v; ball.y = PY - 12; combo = 0;
              api.sfx('hit', { pitch: 1.3, volume: 0.5 }); burst(ball.x, PY - 6, '#fff', 5, 80);
            }
            for (const b of bricks) {
              if (b.dead) continue;
              const nx = Math.max(b.x, Math.min(ball.x, b.x + BW)), ny = Math.max(b.y, Math.min(ball.y, b.y + BH));
              if ((ball.x - nx) ** 2 + (ball.y - ny) ** 2 > 36) continue;
              const fire = fx.F > 0 && b.hp !== Infinity;
              if (!fire) {
                const px = Math.min(ball.x + 6 - b.x, b.x + BW - (ball.x - 6)), py = Math.min(ball.y + 6 - b.y, b.y + BH - (ball.y - 6));
                if (px < py) { ball.vx = ball.x < b.x + BW / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx); ball.x += Math.sign(ball.vx) * px; }
                else { ball.vy = ball.y < b.y + BH / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy); ball.y += Math.sign(ball.vy) * py; }
              }
              if (fire) { b.hp = 1; }
              damage(b, false);
              if (!fire) break;
            }
          }
          if (Math.abs(ball.vy) < 60) ball.vy = Math.sign(ball.vy || -1) * 60;
          ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 8) ball.trail.shift();
          if (ball.y > H + 10) ball.dead = true;
        }
        balls = balls.filter((b) => !b.dead);
        bricks = bricks.filter((b) => !b.dead);
        if (!balls.length) {
          lives--; shake = 10; api.sfx('error'); fx.W = fx.L = fx.F = fx.S = 0;
          if (lives <= 0) { over = true; endT = 2; banner = 'GAME OVER'; bannerT = 9; api.sfx('explode', { pitch: 0.6 }); }
          else { resetBall(); banner = lives > 1 ? `${lives} BALLS LEFT` : 'LAST BALL!'; bannerT = 1.2; }
        }
        // drops
        for (const d of drops) { d.y += 130 * dt; if (d.y > PY - 10 && d.y < PY + 10 && Math.abs(d.x - pad.x) < pad.w / 2 + 12) { d.dead = true; collect(d.k); } if (d.y > H + 20) d.dead = true; }
        drops = drops.filter((d) => !d.dead);
        if (!bricks.some((b) => b.hp !== Infinity) && !over) {
          const bonus = 500 * (level + 1) + lives * 100; api.addScore(bonus);
          banner = `CLEAR! +${bonus}`; bannerT = 2; clearT = 2; api.sfx('levelup'); shake = 8;
          for (const b of bricks) burst(b.x + BW / 2, b.y + BH / 2, '#8d99ae', 8);
        }
      },
      draw(ctx) {
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#10002b'); g.addColorStop(1, '#240046');
        ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
        ctx.strokeStyle = 'rgba(157,78,221,0.12)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 0; x < W; x += 32) { ctx.moveTo(x + 0.5, 30); ctx.lineTo(x + 0.5, H); } for (let y = 30; y < H; y += 32) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); } ctx.stroke();
        for (const b of bricks) {
          const { c1, c2 } = b, hitW = b.hit > 0;
          const bg = ctx.createLinearGradient(0, b.y, 0, b.y + BH); bg.addColorStop(0, hitW ? '#fff' : c1); bg.addColorStop(1, hitW ? '#ddd' : c2);
          ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(b.x, b.y, BW, BH, 4); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(b.x + 3, b.y + 2, BW - 6, 3);
          if (b.max > 1 && b.max !== Infinity && b.hp < b.max) { ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.x + 12, b.y + 2); ctx.lineTo(b.x + 20, b.y + 10); ctx.lineTo(b.x + 16, b.y + 16); if (b.hp === 1) { ctx.moveTo(b.x + 34, b.y + 3); ctx.lineTo(b.x + 30, b.y + 9); ctx.lineTo(b.x + 38, b.y + 15); } ctx.stroke(); }
          if (b.kind === 'S') { ctx.fillStyle = '#ced4da'; for (const dx of [6, BW - 6]) { ctx.beginPath(); ctx.arc(b.x + dx, b.y + BH / 2, 2, 0, TAU); ctx.fill(); } }
          if (b.kind === 'B') { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', b.x + BW / 2, b.y + BH / 2 + 1); }
        }
        for (const d of drops) {
          const [c, label] = PU[d.k];
          ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(d.x - 22, d.y - 8, 44, 16, 8); ctx.fill();
          ctx.fillStyle = '#10002b'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, d.x, d.y + 1);
        }
        ctx.fillStyle = '#ff595e'; for (const l of lasers) ctx.fillRect(l.x - 1.5, l.y - 10, 3, 12);
        // paddle
        const pg = ctx.createLinearGradient(0, PY - 6, 0, PY + 6); pg.addColorStop(0, '#e0aaff'); pg.addColorStop(1, '#7b2cbf');
        ctx.fillStyle = pg; ctx.shadowColor = '#c77dff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.roundRect(pad.x - pad.w / 2, PY - 6, pad.w, 12, 6); ctx.fill(); ctx.shadowBlur = 0;
        if (fx.L > 0) { ctx.fillStyle = '#ff595e'; for (const s of [-1, 1]) ctx.fillRect(pad.x + s * (pad.w / 2 - 6) - 3, PY - 12, 6, 8); }
        // balls
        for (const b of balls) {
          b.trail.forEach((p, i) => { ctx.fillStyle = fx.F > 0 ? `rgba(255,${100 + i * 15},0,${i / 16})` : `rgba(200,180,255,${i / 20})`; ctx.beginPath(); ctx.arc(p.x, p.y, 6 * i / 8, 0, TAU); ctx.fill(); });
          ctx.fillStyle = fx.F > 0 ? '#ffd166' : '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2.5); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 13px sans-serif';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col || '#fff'; ctx.fillText(p.txt, p.x, p.y); }
        ctx.globalAlpha = 1;
        ctx.restore();
        // HUD
        ctx.fillStyle = '#0008'; ctx.fillRect(0, 0, W, 30);
        ctx.font = 'bold 13px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#e0aaff';
        ctx.fillText(`LEVEL ${level + 1}`, 12, 15);
        for (let i = 0; i < lives; i++) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(90 + i * 14, 15, 4.5, 0, TAU); ctx.fill(); }
        let x = W - 12; ctx.textAlign = 'right';
        for (const k of ['L', 'F', 'S', 'W']) if (fx[k] > 0) { ctx.fillStyle = PU[k][0]; ctx.fillText(`${PU[k][1]} ${Math.ceil(fx[k])}`, x, 15); x -= 70; }
        if (combo >= 3) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffd166'; ctx.fillText(`combo ×${combo}`, W / 2, 15); }
        if (balls.some((b) => b.stuck) && !over && clearT <= 0) { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '14px sans-serif'; ctx.fillText('Space / click to launch', W / 2, PY - 40); }
        if (bannerT > 0) { ctx.globalAlpha = Math.min(1, bannerT * 2); ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#c77dff'; ctx.shadowBlur = 16; ctx.fillText(banner, W / 2, H / 2 + 40); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      },
    };
  },
});
