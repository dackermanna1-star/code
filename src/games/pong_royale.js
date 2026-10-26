// Pong Royale — neon pong against a fair AI, with spin and timed power hits. First to 7.
import { defineGame } from './index.js';

defineGame({
  id: 'pong_royale', title: 'Pong Royale', genre: 'Sports', icon: '🏓', color: '#00bbf9',
  desc: 'Classic paddle duel, remixed: curve the ball with spin and time your power smashes. First to 7 wins.',
  help: '↑ ↓ / W S or mouse to move · Space just before the ball hits = POWER smash · move while hitting for spin',
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2, PH = 72, PW = 10, WIN = 7, TOP = 20, BOT = H - 20;
    const me = { x: 34, y: H / 2, vy: 0, swing: 0, cd: 0, flash: 0 };
    const ai = { x: W - 34, y: H / 2, vy: 0, swing: 0, cd: 0, flash: 0, target: H / 2, err: 0 };
    const ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, spin: 0, speed: 320, power: 0 };
    const trail = [], parts = [];
    let sMe = 0, sAi = 0, serveT = 1.4, serveDir = 1, shake = 0, t = 0, rally = 0, over = false, endT = 0, msg = 'FIRST TO 7', msgT = 1.6, lastMouseY = null, useMouse = false;
    api.music('synth');

    const burst = (x, y, col, n = 14, sp = 180) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.4, col }); } };
    function serve() {
      const a = api.rand(-0.45, 0.45);
      ball.x = W / 2; ball.y = H / 2; ball.speed = 320; ball.spin = 0; ball.power = 0; rally = 0;
      ball.vx = Math.cos(a) * serveDir; ball.vy = Math.sin(a);
      ai.err = api.rand(-28, 28);
      api.sfx('blip', { pitch: 1.2 });
    }
    function predictY() {
      // where will the ball cross the AI paddle (ignoring spin), with wall bounces
      let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
      if (vx <= 0) return H / 2;
      const steps = (ai.x - x) / vx;
      y += vy * steps;
      const span = BOT - TOP - 14;
      let m = ((y - TOP - 7) % (2 * span) + 2 * span) % (2 * span);
      if (m > span) m = 2 * span - m;
      return TOP + 7 + m;
    }
    function hit(p, dir, isMe) {
      const off = Math.max(-1, Math.min(1, (ball.y - p.y) / (PH / 2)));
      const ang = off * 0.85;
      const power = p.swing > 0 && p.cd <= 0;
      rally++;
      ball.speed = Math.min(720, ball.speed + 16);
      ball.power = power ? 1 : 0;
      ball.vx = Math.cos(ang) * dir; ball.vy = Math.sin(ang);
      ball.spin = Math.max(-1.6, Math.min(1.6, p.vy * 0.0045));
      p.flash = 0.2;
      if (power) { p.cd = 0.8; p.swing = 0; shake = 12; burst(ball.x, ball.y, '#ffd166', 30, 320); api.sfx('explode', { pitch: 1.5, volume: 0.7 }); }
      else { burst(ball.x, ball.y, isMe ? '#00f5d4' : '#f15bb5', 10, 160); api.sfx('hit', { pitch: 1.4 + Math.min(0.6, rally * 0.04) }); shake = Math.max(shake, 3); }
      if (isMe) api.addScore(5 + (power ? 15 : 0));
      ai.err = api.rand(-1, 1) * (18 + ball.speed * 0.05 + (power ? 25 : 0));
      ai.want = isMe && Math.random() < 0.18 + Math.min(0.17, rally * 0.012);
    }
    function point(mine) {
      if (mine) { sMe++; api.addScore(100 + rally * 10); msg = 'POINT!'; api.sfx('success'); }
      else { sAi++; msg = 'AI SCORES'; api.sfx('error'); }
      msgT = 1.2; shake = 8; serveDir = mine ? 1 : -1; serveT = 1.3; trail.length = 0;
      burst(mine ? W - 10 : 10, ball.y, mine ? '#00f5d4' : '#f15bb5', 40, 260);
      if (sMe >= WIN || sAi >= WIN) {
        over = true; endT = 2.8; msgT = 9;
        msg = sMe >= WIN ? 'YOU WIN!' : 'AI WINS';
        if (sMe >= WIN) { api.addScore(1000 + (sMe - sAi) * 150); api.sfx('levelup'); }
      }
    }
    const movePaddle = (p, target, max, dt) => {
      const d = target - p.y, v = Math.max(-max, Math.min(max, d * 12));
      p.vy += (v - p.vy) * Math.min(1, dt * 14);
      p.y = Math.max(TOP + PH / 2, Math.min(BOT - PH / 2, p.y + p.vy * dt));
    };

    return {
      update(dt, input) {
        t += dt; shake = Math.max(0, shake - dt * 30); msgT -= dt;
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; p.life -= dt; }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
        for (const p of [me, ai]) { p.swing -= dt; p.cd -= dt; p.flash -= dt; }
        if (over) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        // player
        if (lastMouseY !== null && Math.abs(input.mouse.y - lastMouseY) > 0.5) useMouse = true;
        lastMouseY = input.mouse.y;
        const k = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (k) useMouse = false;
        if (useMouse) movePaddle(me, input.mouse.y, 520, dt);
        else { me.vy += (k * 430 - me.vy) * Math.min(1, dt * 16); me.y = Math.max(TOP + PH / 2, Math.min(BOT - PH / 2, me.y + me.vy * dt)); }
        if ((input.pressed.has('a') || input.mouse.clicked) && me.cd <= 0) { me.swing = 0.22; api.sfx('whoosh', { pitch: 1.8, volume: 0.4 }); }
        // AI
        const coming = ball.vx > 0 && serveT <= 0;
        if (coming && ball.x > W * 0.3) ai.target = predictY() + ai.err;
        else ai.target += (H / 2 - ai.target) * Math.min(1, dt * 1.5);
        movePaddle(ai, ai.target, 300 + Math.min(80, rally * 6), dt);
        if (coming && ai.want && ai.cd <= 0 && ai.x - ball.x < 60) { ai.want = false; ai.swing = 0.2; }
        // ball
        if (serveT > 0) { serveT -= dt; if (serveT <= 0) serve(); return; }
        const sp = ball.speed * (ball.power ? 1.5 : 1);
        ball.vy += ball.spin * dt * 0.9; ball.spin *= 1 - dt * 0.9;
        const n = Math.hypot(ball.vx, ball.vy); ball.vx /= n; ball.vy /= n;
        if (Math.abs(ball.vx) < 0.45) { ball.vx = Math.sign(ball.vx) * 0.45; const m = Math.hypot(ball.vx, ball.vy); ball.vx /= m; ball.vy /= m; }
        ball.x += ball.vx * sp * dt; ball.y += ball.vy * sp * dt;
        trail.push({ x: ball.x, y: ball.y }); if (trail.length > 14) trail.shift();
        if (ball.y < TOP + 7) { ball.y = TOP + 7; ball.vy = Math.abs(ball.vy); ball.spin *= -0.5; api.sfx('blip', { pitch: 0.9, volume: 0.5 }); burst(ball.x, ball.y, '#fff', 4, 80); }
        if (ball.y > BOT - 7) { ball.y = BOT - 7; ball.vy = -Math.abs(ball.vy); ball.spin *= -0.5; api.sfx('blip', { pitch: 0.9, volume: 0.5 }); burst(ball.x, ball.y, '#fff', 4, 80); }
        if (ball.vx < 0 && ball.x - 7 < me.x + PW / 2 && ball.x > me.x - 12 && Math.abs(ball.y - me.y) < PH / 2 + 7) { ball.x = me.x + PW / 2 + 7; hit(me, 1, true); }
        if (ball.vx > 0 && ball.x + 7 > ai.x - PW / 2 && ball.x < ai.x + 12 && Math.abs(ball.y - ai.y) < PH / 2 + 7) { ball.x = ai.x - PW / 2 - 7; hit(ai, -1, false); }
        if (ball.x < -20) point(false);
        if (ball.x > W + 20) point(true);
      },
      draw(ctx) {
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 420); g.addColorStop(0, '#16123a'); g.addColorStop(1, '#05040f');
        ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
        ctx.font = 'bold 150px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,245,212,0.08)'; ctx.fillText(sMe, W / 4, H / 2 + 6);
        ctx.fillStyle = 'rgba(241,91,181,0.08)'; ctx.fillText(sAi, W * 3 / 4, H / 2 + 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
        ctx.beginPath(); ctx.moveTo(W / 2, TOP); ctx.lineTo(W / 2, BOT); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#7b2ff7'; ctx.shadowColor = '#7b2ff7'; ctx.shadowBlur = 12; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, TOP); ctx.lineTo(W, TOP); ctx.moveTo(0, BOT); ctx.lineTo(W, BOT); ctx.stroke(); ctx.shadowBlur = 0;
        // paddles
        const paddle = (p, col) => {
          const sw = p.swing > 0 ? 1 : 0;
          ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = p.flash > 0 || sw ? 26 : 12;
          ctx.beginPath(); ctx.roundRect(p.x - PW / 2 - sw * 2, p.y - PH / 2, PW + sw * 4, PH, 5); ctx.fill(); ctx.shadowBlur = 0;
          if (p.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${p.flash * 4})`; ctx.fillRect(p.x - PW / 2, p.y - PH / 2, PW, PH); }
          if (p.cd > 0) { ctx.fillStyle = 'rgba(255,209,102,0.5)'; ctx.fillRect(p.x - PW / 2, p.y + PH / 2 + 4, PW * (1 - p.cd / 0.8), 3); }
        };
        paddle(me, '#00f5d4'); paddle(ai, '#f15bb5');
        // ball + trail
        if (serveT <= 0 || over) {
          trail.forEach((p, i) => {
            const a = i / trail.length;
            ctx.fillStyle = ball.power ? `rgba(255,${120 + a * 100},40,${a * 0.7})` : `rgba(160,230,255,${a * 0.4})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, 7 * a * (ball.power ? 1.4 : 1), 0, TAU); ctx.fill();
          });
          ctx.fillStyle = ball.power ? '#ffd166' : '#fff'; ctx.shadowColor = ball.power ? '#ff6d00' : '#9bf6ff'; ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.arc(ball.x, ball.y, 7, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
          if (Math.abs(ball.spin) > 0.25) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ball.x, ball.y, 11, t * 20 * Math.sign(ball.spin), t * 20 * Math.sign(ball.spin) + 2); ctx.stroke(); }
        } else {
          ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.fillText(serveT > 0.65 ? '•' : '••', W / 2, H / 2);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2.5); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.restore();
        // HUD
        ctx.font = 'bold 14px monospace'; ctx.textBaseline = 'top';
        ctx.textAlign = 'left'; ctx.fillStyle = '#00f5d4'; ctx.fillText(`YOU ${sMe}`, 14, 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#f15bb5'; ctx.fillText(`${sAi} CPU`, W - 14, 2);
        ctx.textAlign = 'center'; ctx.fillStyle = '#aaa'; ctx.fillText(rally > 2 ? `RALLY ${rally}` : '', W / 2, 2);
        if (msgT > 0) {
          ctx.globalAlpha = Math.min(1, msgT * 2); ctx.font = 'bold 40px monospace'; ctx.textBaseline = 'middle';
          ctx.fillStyle = msg === 'AI WINS' || msg === 'AI SCORES' ? '#f15bb5' : '#fff'; ctx.fillText(msg, W / 2, H / 2 - 60); ctx.globalAlpha = 1;
        }
      },
    };
  },
});
