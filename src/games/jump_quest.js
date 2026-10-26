// Jump Quest — rooftop auto-runner: jump & double-jump across the skyline, grab coins, mind the gaps.
import { defineGame } from './index.js';

const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

defineGame({
  id: 'jump_quest', title: 'Jump Quest', genre: 'Platformer', icon: '🏃', color: '#f77f00',
  desc: 'Free-run across downtown rooftops at dusk. Double-jump the gaps, hop the crates, snag every coin.',
  help: 'Space / ↑ / W to jump (tap again in the air to double-jump) · hold for higher jumps',
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2, GRAV = 1700;
    const P = { x: 0, y: 300, vy: 0, ground: true, jumps: 0, coyote: 0, buffer: 0, spin: 0, run: 0, squash: 1 };
    const segs = [], crates = [], coins = [], plats = [], parts = [], pops = [];
    let speed = 230, dist = 0, coinsGot = 0, dead = false, endT = 0, shake = 0, t = 0, lastX = -200, lastY = 300, camX = -140;
    api.music('pop');

    function addSeg(x0, x1, y) {
      segs.push({ x0, x1, y, hue: Math.floor(hash(x0) * 4) });
      // crates and coins on the roof
      const len = x1 - x0;
      if (x0 > 500 && len > 260 && Math.random() < 0.6) {
        const cx = x0 + 100 + Math.random() * (len - 200), stack = Math.random() < 0.25 && speed > 280 ? 2 : 1;
        for (let i = 0; i < stack; i++) crates.push({ x: cx, y: y - 26 * (i + 1), w: 26, h: 26 });
        for (let i = 0; i < 4; i++) coins.push({ x: cx - 30 + i * 22, y: y - 26 * stack - 50 - Math.sin(i / 3 * Math.PI) * 20, t: Math.random() });
      } else if (len > 180) for (let i = 0; i < 3; i++) coins.push({ x: x0 + len / 2 - 22 + i * 22, y: y - 28, t: Math.random() });
    }
    function generate() {
      while (lastX < camX + W + 300) {
        if (lastX < 500) { addSeg(lastX, 700, 300); lastX = 700; continue; }
        const gap = 60 + Math.random() * (40 + speed * 0.22);
        const ny = Math.max(250, Math.min(340, lastY + (Math.random() * 90 - 45)));
        // coins arc over the gap
        for (let i = 1; i < 5; i++) coins.push({ x: lastX + gap * i / 5, y: Math.min(lastY, ny) - 50 - Math.sin(i / 5 * Math.PI) * 40, t: Math.random() });
        if (gap > 110 && Math.random() < 0.5) plats.push({ x0: lastX + gap / 2 - 40, x1: lastX + gap / 2 + 40, y: Math.min(lastY, ny) - 70 });
        const x0 = lastX + gap, len = 180 + Math.random() * 380;
        addSeg(x0, x0 + len, ny); lastX = x0 + len; lastY = ny;
      }
    }
    generate();
    const burst = (x, y, col, n = 10, sp = 120, up = 0) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life: 0.5 + Math.random() * 0.4, col, g: up ? 600 : 0 }); } };
    function die(why) {
      if (dead) return;
      dead = true; endT = 1.6; shake = 12; P.vy = -500; api.sfx(why === 'fall' ? 'whoosh' : 'hit'); api.sfx('error');
      burst(P.x, P.y - 15, '#ffd166', 20, 200);
    }

    return {
      update(dt, input) {
        t += dt; shake = Math.max(0, shake - dt * 30);
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
        for (const p of pops) { p.y -= 30 * dt; p.life -= dt; }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
        for (let i = pops.length - 1; i >= 0; i--) if (pops[i].life <= 0) pops.splice(i, 1);
        for (const c of coins) c.t += dt;
        if (dead) { P.vy += GRAV * dt; P.y += P.vy * dt; P.x += speed * 0.3 * dt; P.spin += dt * 10; endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        speed = Math.min(440, speed + dt * 5);
        const dx = speed * dt; P.x += dx; dist += dx; camX = P.x - 150;
        api.addScore(dx * 0.1);
        const jumpPressed = input.pressed.has('a') || input.pressed.has('up');
        const holding = input.a || input.up;
        if (jumpPressed) P.buffer = 0.13;
        P.buffer -= dt; P.coyote -= dt;
        if (P.buffer > 0) {
          if (P.ground || P.coyote > 0) { P.vy = -600; P.ground = false; P.coyote = 0; P.jumps = 1; P.buffer = 0; P.squash = 0.7; api.sfx('boing', { pitch: 1.6, volume: 0.5 }); burst(P.x, P.y, '#ddd', 6, 60); }
          else if (P.jumps < 2) { P.vy = -540; P.jumps = 2; P.buffer = 0; P.spin = 0.001; api.sfx('whoosh', { pitch: 1.5 }); burst(P.x, P.y, '#9bf6ff', 12, 140); }
        }
        if (!holding && P.vy < -220) P.vy += GRAV * 1.6 * dt;
        const prevY = P.y;
        P.vy = Math.min(900, P.vy + GRAV * dt); P.y += P.vy * dt;
        if (P.spin) { P.spin += dt * 14; if (P.spin > TAU) P.spin = 0; }
        P.squash += (1 - P.squash) * Math.min(1, dt * 10);
        const wasGround = P.ground; P.ground = false;
        const L = P.x - 9, R = P.x + 9;
        const solids = [...segs, ...plats.map((q) => ({ ...q, plat: true })), ...crates.map((c) => ({ x0: c.x, x1: c.x + c.w, y: c.y }))];
        for (const s of solids) {
          if (R < s.x0 || L > s.x1) continue;
          const stepUp = P.y > s.y && P.y - s.y < 10 && !s.plat;
          if ((P.vy >= 0 && prevY <= s.y + 1 && P.y >= s.y) || stepUp) { P.y = s.y; P.vy = 0; P.ground = true; P.jumps = 0; }
          else if (!s.plat && P.y > s.y + 4) die('wall');
        }
        if (P.ground && !wasGround) { P.squash = 1.35; burst(P.x, P.y, '#cbb', 6, 70); api.sfx('thud', { pitch: 1.6, volume: 0.35 }); }
        if (wasGround && !P.ground && P.vy >= 0) P.coyote = 0.1;
        if (P.ground) P.run += dt * speed / 22;
        if (P.y > H + 40) die('fall');
        for (const c of coins) {
          if (!c.got && Math.abs(c.x - P.x) < 16 && Math.abs(c.y - (P.y - 16)) < 22) {
            c.got = true; coinsGot++; api.addScore(25); api.sfx('coin');
            burst(c.x, c.y, '#ffd166', 8, 90); pops.push({ x: c.x, y: c.y, txt: '+25', life: 0.6 });
          }
        }
        // cleanup + generate
        const cut = camX - 120;
        while (segs.length && segs[0].x1 < cut) segs.shift();
        while (plats.length && plats[0].x1 < cut) plats.shift();
        while (crates.length && crates[0].x + 30 < cut) crates.shift();
        for (let i = coins.length - 1; i >= 0; i--) if (coins[i].x < cut || coins[i].got) coins.splice(i, 1);
        generate();
      },
      draw(ctx) {
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.55, '#d1477a'); sky.addColorStop(1, '#ffb563');
        ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, H + 20);
        ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.beginPath(); ctx.arc(470, 150, 42, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.beginPath(); ctx.arc(470, 150, 70, 0, TAU); ctx.fill();
        // parallax skyline layers
        const layer = (f, bw, minH, maxH, col, win, seed) => {
          const off = camX * f, i0 = Math.floor(off / bw) - 1;
          for (let i = i0; i < i0 + W / bw + 3; i++) {
            const h = minH + hash(i + seed) * (maxH - minH), x = i * bw - off, w = bw * (0.7 + hash(i * 3 + seed) * 0.3);
            ctx.fillStyle = col; ctx.fillRect(x, H - h, w, h);
            if (hash(i + seed * 2) > 0.7) ctx.fillRect(x + w * 0.4, H - h - 18, 3, 18);
            if (win) for (let wy = H - h + 10; wy < H - 10; wy += 16) for (let wx = x + 6; wx < x + w - 8; wx += 12) if (hash(wx * 0.37 + wy * 1.7 + i) > 0.62) { ctx.fillStyle = win; ctx.fillRect(wx, wy, 5, 7); ctx.fillStyle = col; }
          }
        };
        layer(0.12, 70, 120, 230, '#5a2a6e', null, 1);
        layer(0.3, 90, 90, 190, '#3d1b52', 'rgba(255,214,140,0.55)', 7);
        // world
        ctx.save(); ctx.translate(-camX, 0);
        for (const s of segs) {
          const cols = [['#2a1a3a', '#3b2752'], ['#1f2340', '#2e3560'], ['#33202a', '#4a2f3c'], ['#1d2b33', '#2b404b']][s.hue];
          ctx.fillStyle = cols[0]; ctx.fillRect(s.x0, s.y, s.x1 - s.x0, H - s.y + 20);
          ctx.fillStyle = cols[1]; ctx.fillRect(s.x0 - 4, s.y, s.x1 - s.x0 + 8, 8);
          for (let wy = s.y + 26; wy < H; wy += 30) for (let wx = s.x0 + 14; wx < s.x1 - 20; wx += 28) { ctx.fillStyle = hash(wx + wy * 7) > 0.55 ? '#ffd27a' : '#151025'; ctx.fillRect(wx, wy, 12, 16); }
        }
        for (const p of plats) { ctx.fillStyle = '#8d99ae'; ctx.fillRect(p.x0, p.y, p.x1 - p.x0, 6); ctx.fillStyle = '#5c677d'; for (let x = p.x0 + 6; x < p.x1; x += 16) ctx.fillRect(x, p.y + 6, 3, 8); }
        for (const c of crates) {
          ctx.fillStyle = '#b5651d'; ctx.fillRect(c.x, c.y, c.w, c.h); ctx.strokeStyle = '#7a4212'; ctx.lineWidth = 2; ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
          ctx.beginPath(); ctx.moveTo(c.x + 2, c.y + 2); ctx.lineTo(c.x + c.w - 2, c.y + c.h - 2); ctx.moveTo(c.x + c.w - 2, c.y + 2); ctx.lineTo(c.x + 2, c.y + c.h - 2); ctx.stroke();
        }
        for (const c of coins) {
          const sx = Math.abs(Math.cos(c.t * 4)) * 7 + 1;
          ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.ellipse(c.x, c.y, sx, 8, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff6'; ctx.beginPath(); ctx.ellipse(c.x - sx * 0.3, c.y - 2, sx * 0.3, 3, 0, 0, TAU); ctx.fill();
        }
        // runner
        ctx.save(); ctx.translate(P.x, P.y);
        if (P.spin) { ctx.translate(0, -16); ctx.rotate(P.spin); ctx.translate(0, 16); }
        ctx.scale(1 / P.squash, P.squash);
        const leg = P.ground ? Math.sin(P.run) * 7 : 4;
        ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(leg, 0); ctx.moveTo(0, -12); ctx.lineTo(-leg, P.ground ? 0 : -4); ctx.stroke();
        ctx.fillStyle = '#f77f00'; ctx.beginPath(); ctx.roundRect(-7, -27, 14, 17, 4); ctx.fill();
        ctx.strokeStyle = '#f77f00'; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(8 - leg * 0.6, -14); ctx.stroke();
        ctx.fillStyle = '#ffd6a5'; ctx.beginPath(); ctx.arc(1, -33, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(-6, -27); ctx.lineTo(-16 - Math.sin(t * 20) * 3, -30 + Math.cos(t * 17) * 3); ctx.lineTo(-6, -24); ctx.fill();
        ctx.fillStyle = '#2b2d42'; ctx.fillRect(-6, -40, 13, 4); ctx.fillRect(3, -35, 2, 2);
        ctx.restore();
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalAlpha = 1; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillText(p.txt, p.x, p.y - 12); }
        ctx.globalAlpha = 1;
        ctx.restore(); ctx.restore();
        // HUD
        ctx.fillStyle = 'rgba(20,10,40,0.55)'; ctx.beginPath(); ctx.roundRect(10, 10, 230, 32, 10); ctx.fill();
        ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; ctx.fillText(`${Math.floor(dist / 20)} m`, 22, 27);
        ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(112, 26, 7, 0, TAU); ctx.fill(); ctx.fillText(`× ${coinsGot}`, 124, 27);
        ctx.fillStyle = '#9bf6ff'; ctx.fillText(`${Math.round(speed / 4)} km/h`, 172, 27);
        if (t < 3) { ctx.globalAlpha = Math.min(1, 3 - t); ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Tap SPACE to jump · tap again to double-jump', W / 2, 80); ctx.globalAlpha = 1; }
        if (dead) { ctx.fillStyle = `rgba(40,0,30,${Math.min(0.45, (1.6 - endT) * 0.5)})`; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('WIPEOUT!', W / 2, H / 2 - 20); }
      },
    };
  },
});
