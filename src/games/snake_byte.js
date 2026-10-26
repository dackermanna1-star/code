// Snake Byte — neon snake with smooth movement, speed ramps and timed bonus "bytes".
import { defineGame } from './index.js';

defineGame({
  id: 'snake_byte', title: 'Snake Byte', genre: 'Arcade', icon: '🐍', color: '#06d6a0',
  desc: 'A glowing data-snake gobbling bits. It speeds up as it grows — grab the golden bytes before they expire.',
  help: 'Arrows / WASD to steer · don\'t hit the walls or yourself',
  create(api) {
    const W = api.w, H = api.h, S = 20, C = 32, R = 18, OY = 40, TAU = Math.PI * 2;
    let body = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }, { x: 5, y: 9 }];
    let prev = body.map((p) => ({ ...p }));
    let dir = { x: 1, y: 0 };
    const queue = [], parts = [], pops = [];
    let stepT = 0, eaten = 0, grow = 0, level = 1, dead = false, endT = 0, shake = 0, t = 0, ready = 1.2, levelFlash = 0;
    let food = null, bonus = null, bonusCD = 7;
    api.music('synth');

    const free = (x, y) => !body.some((b) => b.x === x && b.y === y) && !(food && food.x === x && food.y === y) && !(bonus && bonus.x === x && bonus.y === y);
    const place = () => { for (let i = 0; i < 500; i++) { const x = Math.floor(Math.random() * C), y = Math.floor(Math.random() * R); if (free(x, y)) return { x, y, t: 0 }; } return { x: 0, y: 0, t: 0 }; };
    food = place();
    const cx = (x) => x * S + S / 2, cy = (y) => OY + y * S + S / 2;
    const burst = (x, y, col, n = 16, sp = 140) => {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, col }); }
    };
    const interval = () => Math.max(0.055, 0.135 - eaten * 0.0035);
    const hue = (i) => (150 + i * 9 + t * 40) % 360;

    function die() {
      dead = true; endT = 1.6; shake = 10; api.sfx('explode'); api.sfx('error');
      body.forEach((b, i) => deathPops.push({ at: i * 0.03, b }));
    }
    const deathPops = [];

    function step() {
      while (queue.length) { const d = queue.shift(); if (d.x !== -dir.x || d.y !== -dir.y) { dir = d; break; } }
      const h = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      if (h.x < 0 || h.y < 0 || h.x >= C || h.y >= R || body.slice(0, body.length - (grow ? 0 : 1)).some((b) => b.x === h.x && b.y === h.y)) { die(); return; }
      prev = body.map((p) => ({ ...p }));
      body.unshift(h);
      if (grow > 0) grow--; else body.pop();
      if (food && h.x === food.x && h.y === food.y) {
        eaten++; grow += 1; const pts = 10 * level; api.addScore(pts);
        pops.push({ x: cx(h.x), y: cy(h.y), txt: `+${pts}`, col: '#ff4fa3', life: 0.8 });
        burst(cx(h.x), cy(h.y), '#ff4fa3', 18); api.sfx('pop', { pitch: 0.9 + Math.min(0.8, eaten * 0.02) });
        food = place();
        const nl = 1 + Math.floor(eaten / 5);
        if (nl > level) { level = nl; levelFlash = 1.2; api.sfx('powerup'); }
      }
      if (bonus && h.x === bonus.x && h.y === bonus.y) {
        const pts = Math.round(40 + 60 * bonus.life / 6) * level; api.addScore(pts); grow += 2;
        pops.push({ x: cx(h.x), y: cy(h.y), txt: `BYTE +${pts}`, col: '#ffd166', life: 1.1 });
        burst(cx(h.x), cy(h.y), '#ffd166', 30, 200); api.sfx('coin'); api.sfx('sparkle');
        bonus = null; bonusCD = 8 + Math.random() * 6; shake = 4;
      }
    }

    return {
      update(dt, input) {
        t += dt; shake = Math.max(0, shake - dt * 25); levelFlash -= dt;
        for (const k of ['up', 'down', 'left', 'right']) {
          if (!input.pressed.has(k) || dead) continue;
          const d = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[k];
          const last = queue[queue.length - 1] || dir;
          if ((d.x !== last.x || d.y !== last.y) && queue.length < 3) { queue.push(d); if (ready > 0) ready = 0; }
        }
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; p.life -= dt; }
        for (const p of pops) { p.y -= 28 * dt; p.life -= dt; }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
        for (let i = pops.length - 1; i >= 0; i--) if (pops[i].life <= 0) pops.splice(i, 1);
        if (food) food.t += dt;
        if (dead) {
          endT -= dt;
          for (const e of deathPops) { e.at -= dt; if (e.at <= 0 && !e.done) { e.done = true; burst(cx(e.b.x), cy(e.b.y), `hsl(${hue(body.indexOf(e.b))},100%,60%)`, 6, 90); } }
          if (endT <= 0) { endT = 99; api.gameOver(); }
          return;
        }
        if (ready > 0) { ready -= dt; return; }
        // bonus byte
        if (bonus) { bonus.life -= dt; bonus.t += dt; if (bonus.life <= 0) { burst(cx(bonus.x), cy(bonus.y), '#ffd16688', 10, 60); bonus = null; bonusCD = 6 + Math.random() * 6; } }
        else { bonusCD -= dt; if (bonusCD <= 0) { bonus = { ...place(), life: 6 }; api.sfx('chime'); } }
        stepT += dt;
        while (stepT >= interval() && !dead) { stepT -= interval(); step(); }
      },
      draw(ctx) {
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        ctx.fillStyle = '#060912'; ctx.fillRect(-10, -10, W + 20, H + 20);
        // grid
        ctx.strokeStyle = 'rgba(80,120,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 0; x <= C; x++) { ctx.moveTo(x * S + 0.5, OY); ctx.lineTo(x * S + 0.5, OY + R * S); }
        for (let y = 0; y <= R; y++) { ctx.moveTo(0, OY + y * S + 0.5); ctx.lineTo(W, OY + y * S + 0.5); }
        ctx.stroke();
        ctx.strokeStyle = `rgba(6,214,160,${0.5 + 0.2 * Math.sin(t * 3)})`; ctx.lineWidth = 2; ctx.strokeRect(1, OY + 1, W - 2, R * S - 2);
        // food
        if (food) {
          const x = cx(food.x), y = cy(food.y), s = 1 + 0.12 * Math.sin(food.t * 6);
          const g = ctx.createRadialGradient(x, y, 1, x, y, 16 * s); g.addColorStop(0, 'rgba(255,79,163,0.55)'); g.addColorStop(1, 'rgba(255,79,163,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 18, y - 18, 36, 36);
          ctx.fillStyle = '#ff4fa3'; ctx.beginPath(); ctx.arc(x, y, 6.5 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffd6ec'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 2, 0, TAU); ctx.fill();
        }
        if (bonus) {
          const x = cx(bonus.x), y = cy(bonus.y), blink = bonus.life < 2 && Math.floor(bonus.t * 8) % 2;
          if (!blink) {
            ctx.save(); ctx.translate(x, y); ctx.rotate(bonus.t * 2);
            ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffd166';
            ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, 0); ctx.lineTo(0, 9); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
            ctx.restore();
          }
          ctx.strokeStyle = '#ffd166aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + TAU * bonus.life / 6); ctx.stroke();
        }
        // snake (interpolated)
        const f = dead || ready > 0 ? 1 : Math.min(1, stepT / interval());
        const pts = body.map((b, i) => { const p = prev[i] || b; return { x: cx(p.x + (b.x - p.x) * f), y: cy(p.y + (b.y - p.y) * f) }; });
        if (!dead || endT > 1.2) {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let pass = 0; pass < 2; pass++) {
            for (let i = pts.length - 2; i >= 0; i--) {
              const w = pass ? 14 - (i / pts.length) * 5 : 24;
              ctx.strokeStyle = pass ? `hsl(${hue(i)},100%,${dead ? 85 : 60}%)` : `hsla(${hue(i)},100%,60%,0.12)`;
              ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[i + 1].x, pts[i + 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
            }
          }
          const h = pts[0];
          ctx.shadowColor = `hsl(${hue(0)},100%,60%)`; ctx.shadowBlur = 16; ctx.fillStyle = `hsl(${hue(0)},100%,70%)`;
          ctx.beginPath(); ctx.arc(h.x, h.y, 9, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
          const ex = dir.y, ey = -dir.x;
          for (const s of [-1, 1]) {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x + dir.x * 3 + ex * 4 * s, h.y + dir.y * 3 + ey * 4 * s, 3, 0, TAU); ctx.fill();
            ctx.fillStyle = '#061'; ctx.beginPath(); ctx.arc(h.x + dir.x * 4.5 + ex * 4 * s, h.y + dir.y * 4.5 + ey * 4 * s, 1.5, 0, TAU); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y - 14); }
        ctx.globalAlpha = 1;
        ctx.restore();
        // HUD
        const hg = ctx.createLinearGradient(0, 0, 0, OY); hg.addColorStop(0, '#0d1526'); hg.addColorStop(1, '#0a0f1c');
        ctx.fillStyle = hg; ctx.fillRect(0, 0, W, OY);
        ctx.font = 'bold 15px monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillStyle = '#06d6a0'; ctx.fillText(`SNAKE_BYTE`, 14, OY / 2);
        ctx.fillStyle = '#9fb3c8'; ctx.fillText(`LEN ${body.length}`, 170, OY / 2);
        ctx.fillStyle = levelFlash > 0 && Math.floor(t * 10) % 2 ? '#fff' : '#ffd166'; ctx.fillText(`SPEED ${level}`, 270, OY / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#ff4fa3'; ctx.fillText(`${String(Math.floor(api.score)).padStart(6, '0')}`, W - 14, OY / 2);
        ctx.textAlign = 'center';
        if (ready > 0) { ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(ready > 0.4 ? 'READY' : 'GO!', W / 2, H / 2); }
        if (levelFlash > 0) { ctx.globalAlpha = Math.min(1, levelFlash); ctx.font = 'bold 24px monospace'; ctx.fillStyle = '#ffd166'; ctx.fillText('SPEED UP!', W / 2, OY + 40); ctx.globalAlpha = 1; }
        if (dead) { ctx.fillStyle = `rgba(255,0,80,${Math.min(0.3, (1.6 - endT) * 0.4)})`; ctx.fillRect(0, OY, W, H - OY); ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#fff'; ctx.fillText('SEGFAULT', W / 2, H / 2); }
      },
    };
  },
});
