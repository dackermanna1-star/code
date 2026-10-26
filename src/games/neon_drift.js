// Neon Drift — a synthwave lane-dodging racer (bundled with the Nova Box).
import { defineGame } from './index.js';

defineGame({
  id: 'neon_drift', title: 'Neon Drift', genre: 'Racing', icon: '🏎️', color: '#ff2e88', bundled: true,
  desc: 'Dodge traffic on an endless neon highway. Grab boosts, chain near-misses.',
  help: '← → / A D to switch lanes · Space to boost',
  create(api) {
    const W = api.w, H = api.h;
    const lanes = 4;
    let lane = 1.5, target = 1, speed = 260, dist = 0, boost = 0, alive = true, combo = 0;
    const cars = [];
    const pickups = [];
    let spawnT = 0;
    api.music('synth');
    const laneX = (l) => W / 2 + (l - (lanes - 1) / 2) * 90;
    return {
      update(dt, input) {
        if (!alive) return;
        if (input.pressed.has('left')) target = Math.max(0, target - 1);
        if (input.pressed.has('right')) target = Math.min(lanes - 1, target + 1);
        if (input.pressed.has('a') && boost <= 0 && api.score > 50) { boost = 1.2; api.addScore(-50); api.sfx('powerup'); }
        lane += (target - lane) * Math.min(1, dt * 12);
        boost -= dt;
        const sp = speed * (boost > 0 ? 1.8 : 1);
        speed += dt * 6;
        dist += sp * dt;
        api.addScore(sp * dt * 0.05);
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = Math.max(0.35, 1.1 - speed / 1200);
          const l = Math.floor(Math.random() * lanes);
          if (Math.random() < 0.18) pickups.push({ l, y: -40 }); else cars.push({ l, y: -60, c: ['#00f0ff', '#ffe600', '#9d4dff', '#ff7b00'][l], passed: false });
        }
        for (const c of cars) {
          c.y += (sp - 120) * dt;
          const px = laneX(lane), cx = laneX(c.l);
          if (Math.abs(c.y - (H - 70)) < 40 && Math.abs(px - cx) < 46) {
            if (boost > 0) { c.y = 9999; api.sfx('explode'); api.addScore(100); }
            else { alive = false; api.sfx('explode'); setTimeout(() => api.gameOver(), 700); }
          } else if (!c.passed && c.y > H - 40) { c.passed = true; if (Math.abs(px - cx) < 100) { combo++; api.addScore(10 * combo); api.sfx('blip', { pitch: 1 + combo * 0.05 }); } else combo = 0; }
        }
        for (const p of pickups) { p.y += (sp - 120) * dt; if (Math.abs(p.y - (H - 70)) < 30 && Math.abs(laneX(lane) - laneX(p.l)) < 40) { p.y = 9999; api.addScore(75); api.sfx('coin'); } }
        while (cars.length && cars[0].y > H + 100) cars.shift();
        while (pickups.length && pickups[0].y > H + 100) pickups.shift();
      },
      draw(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#12002b'); g.addColorStop(0.45, '#3d0057'); g.addColorStop(0.46, '#0b0016'); g.addColorStop(1, '#16002e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff5ec4'; ctx.beginPath(); ctx.arc(W / 2, H * 0.45, 70, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#12002b'; for (let i = 0; i < 6; i++) ctx.fillRect(W / 2 - 80, H * 0.45 - 12 - i * 11, 160, 3 + i * 0.5);
        // road
        ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 2;
        for (let i = 0; i <= lanes; i++) { const x = W / 2 + (i - lanes / 2) * 90; ctx.beginPath(); ctx.moveTo(W / 2 + (x - W / 2) * 0.15, H * 0.46); ctx.lineTo(x, H); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(0,240,255,0.35)';
        for (let i = 0; i < 12; i++) { const y = H * 0.46 + Math.pow(((i + (dist / 60) % 1) / 12), 2) * H * 0.56; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        for (const p of pickups) { ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.arc(laneX(p.l), p.y, 12, 0, 7); ctx.fill(); }
        for (const c of cars) { ctx.fillStyle = c.c; ctx.shadowColor = c.c; ctx.shadowBlur = 16; ctx.fillRect(laneX(c.l) - 26, c.y - 40, 52, 80); ctx.shadowBlur = 0; ctx.fillStyle = '#000a'; ctx.fillRect(laneX(c.l) - 18, c.y - 25, 36, 20); }
        const px = laneX(lane);
        ctx.fillStyle = boost > 0 ? '#ffffff' : '#00f0ff'; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 22;
        ctx.beginPath(); ctx.moveTo(px, H - 115); ctx.lineTo(px + 28, H - 30); ctx.lineTo(px - 28, H - 30); ctx.fill(); ctx.shadowBlur = 0;
        if (boost > 0) { ctx.fillStyle = '#ff5ec4'; ctx.fillRect(px - 10, H - 30, 20, 20 + Math.random() * 20); }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.fillText(`${Math.floor(speed)} km/h  combo x${combo}`, 14, 24);
        if (!alive) { ctx.fillStyle = 'rgba(255,0,80,0.35)'; ctx.fillRect(0, 0, W, H); }
      },
    };
  },
});
