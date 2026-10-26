// Slice Party — swipe the mouse to slice flying fruit, chain combos, never touch a bomb.
import { defineGame } from './index.js';

const FRUIT = [
  { k: 'melon', r: 30, skin: '#2d6a4f', skin2: '#52b788', flesh: '#ef476f', juice: '#ff5d8f' },
  { k: 'orange', r: 22, skin: '#f8961e', skin2: '#ffb347', flesh: '#ffc971', juice: '#ffb703' },
  { k: 'apple', r: 21, skin: '#c1121f', skin2: '#e63946', flesh: '#fff3d6', juice: '#fff1c1' },
  { k: 'kiwi', r: 19, skin: '#7f5539', skin2: '#9c6644', flesh: '#90be6d', juice: '#a7d676' },
  { k: 'lemon', r: 20, skin: '#f9c80e', skin2: '#ffe066', flesh: '#fff7b0', juice: '#fff07a' },
  { k: 'plum', r: 18, skin: '#5a189a', skin2: '#7b2cbf', flesh: '#ffd6a5', juice: '#c77dff' },
];
const GOLD = { k: 'gold', r: 20, skin: '#e0a800', skin2: '#ffd700', flesh: '#fff3a0', juice: '#ffe066', gold: true };

defineGame({
  id: 'slice_party', title: 'Slice Party', genre: 'Arcade', icon: '🍉', color: '#ef476f',
  desc: 'Fruit flies, you swipe. Slice several in one stroke for combos — but leave the bombs alone!',
  help: 'Hold the mouse button and swipe to slice · 3 dropped fruit or 1 bomb = game over',
  platforms: ['pc', 'console', 'handheld', 'vr', 'tabletop'],
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2, GRAV = 620;
    const items = [], halves = [], parts = [], splats = [], pops = [], blade = [];
    let launchT = 1, t = 0, strikes = 0, dead = false, endT = 0, shake = 0, flash = 0, combo = 0, comboT = 0, sliced = 0, lastM = null;
    api.music('bossa');
    // pre-rendered wooden board
    const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
    {
      const b = bg.getContext('2d');
      for (let i = 0; i < 6; i++) {
        const x = i * W / 6, gr = b.createLinearGradient(x, 0, x + W / 6, 0);
        const l = 28 + (i % 2) * 4; gr.addColorStop(0, `hsl(28,45%,${l}%)`); gr.addColorStop(1, `hsl(26,45%,${l - 5}%)`);
        b.fillStyle = gr; b.fillRect(x, 0, W / 6, H);
        b.strokeStyle = 'rgba(0,0,0,0.12)'; b.lineWidth = 1.5;
        for (let k = 0; k < 7; k++) { b.beginPath(); const gx = x + 10 + Math.random() * (W / 6 - 20); b.moveTo(gx, 0); for (let y = 0; y <= H; y += 20) b.lineTo(gx + Math.sin(y * 0.03 + k) * 4, y); b.stroke(); }
        b.fillStyle = 'rgba(0,0,0,0.35)'; b.fillRect(x, 0, 3, H);
      }
      const v = b.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 420); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      b.fillStyle = v; b.fillRect(0, 0, W, H);
    }

    function launch() {
      const lvl = Math.min(1, t / 90);
      const n = 1 + Math.floor(Math.random() * (2 + lvl * 3));
      for (let i = 0; i < n; i++) {
        const bombP = 0.08 + lvl * 0.14;
        const isBomb = Math.random() < bombP && t > 4;
        const def = isBomb ? null : Math.random() < 0.05 ? GOLD : FRUIT[Math.floor(Math.random() * FRUIT.length)];
        const x = api.rand(90, W - 90);
        items.push({ def, bomb: isBomb, r: isBomb ? 20 : def.r, x, y: H + 30 + i * 12, vx: (W / 2 - x) * api.rand(0.25, 0.6), vy: -api.rand(520, 640), rot: 0, vr: api.rand(-3, 3), up: true });
      }
      api.sfx('whoosh', { pitch: 0.8, volume: 0.4 });
      launchT = Math.max(0.75, 1.9 - lvl * 1.1) + Math.random() * 0.5;
    }
    const burst = (x, y, col, n, sp = 220) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (0.2 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.4 + Math.random() * 0.5, col, r: 2 + Math.random() * 3 }); } };
    function slice(o, ang) {
      o.dead = true;
      if (o.bomb) {
        dead = true; endT = 2; flash = 1; shake = 22; api.sfx('explode', { pitch: 0.6 }); api.sfx('thud');
        burst(o.x, o.y, '#ffd166', 50, 420); burst(o.x, o.y, '#555', 30, 250);
        return;
      }
      const d = o.def, pts = d.gold ? 50 : 10;
      sliced++; combo++; comboT = 0.3; api.addScore(pts);
      for (const s of [-1, 1]) halves.push({ def: d, x: o.x, y: o.y, vx: o.vx * 0.6 + Math.cos(ang + Math.PI / 2) * s * 90, vy: o.vy * 0.4 + Math.sin(ang + Math.PI / 2) * s * 90, ang, rot: 0, vr: s * api.rand(2, 5), side: s, life: 2.5 });
      burst(o.x, o.y, d.juice, d.gold ? 30 : 16);
      splats.push({ x: o.x, y: o.y, r: d.r * 0.75, col: d.juice, life: 3, drops: Array.from({ length: 9 }, () => { const a = Math.random() * TAU, dd = d.r * (0.6 + Math.random() * 1.3); return [Math.cos(a) * dd, Math.sin(a) * dd, d.r * (0.08 + Math.random() * 0.22)]; }) });
      if (splats.length > 14) splats.shift();
      api.sfx('squish', { pitch: 1.2 + Math.random() * 0.3, volume: 0.8 }); api.sfx('pop', { pitch: 0.8 + combo * 0.15, volume: 0.5 });
      if (d.gold) { api.sfx('sparkle'); pops.push({ x: o.x, y: o.y, txt: '+50', col: '#ffd700', life: 1 }); }
    }
    const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(px - ax - u * dx, py - ay - u * dy); };

    const drawFruit = (ctx, d, r) => {
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, d.skin2); g.addColorStop(1, d.skin);
      ctx.fillStyle = g; ctx.beginPath();
      if (d.k === 'lemon') ctx.ellipse(0, 0, r * 1.2, r * 0.9, 0, 0, TAU); else ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      if (d.k === 'melon') { ctx.strokeStyle = '#1b4332'; ctx.lineWidth = 3; for (const a of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(0, 0, r * Math.abs(Math.sin(a + 0.9)) * 0.9, r * 0.98, 0, 0, TAU); ctx.stroke(); } }
      if (d.k === 'apple' || d.k === 'plum') { ctx.strokeStyle = '#5c3d1e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -r + 2); ctx.lineTo(2, -r - 6); ctx.stroke(); ctx.fillStyle = '#52b788'; ctx.beginPath(); ctx.ellipse(7, -r - 3, 6, 3, -0.4, 0, TAU); ctx.fill(); }
      if (d.gold) { ctx.strokeStyle = '#fff8'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); } ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, TAU); ctx.fill();
    };

    return {
      update(dt, input) {
        t += dt; shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt * 1.5);
        const m = input.mouse;
        blade.push({ x: m.x, y: m.y, t, on: m.down });
        while (blade.length && t - blade[0].t > 0.14) blade.shift();
        for (const o of items) { o.vy += GRAV * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt; if (o.bomb && Math.random() < 0.6) parts.push({ x: o.x + Math.cos(o.rot - 1) * 22, y: o.y + Math.sin(o.rot - 1) * 22, vx: api.rand(-40, 40), vy: api.rand(-80, -20), life: 0.25, col: '#ffbe0b', r: 2.5 }); }
        for (const h of halves) { h.vy += GRAV * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.life -= dt; }
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
        for (const s of splats) s.life -= dt * 0.5;
        for (const p of pops) { p.y -= 40 * dt; p.life -= dt; }
        if (dead) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } }
        else {
          launchT -= dt; if (launchT <= 0) launch();
          if (m.down && lastM && Math.hypot(m.x - lastM.x, m.y - lastM.y) > 3) {
            const ang = Math.atan2(m.y - lastM.y, m.x - lastM.x);
            for (const o of items) if (!o.dead && segDist(o.x, o.y, lastM.x, lastM.y, m.x, m.y) < o.r + 4) { slice(o, ang); if (dead) break; }
          }
          comboT -= dt;
          if (comboT <= 0 && combo) {
            if (combo >= 3) { const b = combo * 15; api.addScore(b); pops.push({ x: Math.min(W - 90, Math.max(90, m.x)), y: Math.max(60, m.y - 30), txt: `${combo} FRUIT COMBO +${b}`, col: '#fff', life: 1.3 }); api.sfx('levelup'); shake = 6; }
            combo = 0;
          }
          for (const o of items) {
            if (o.vy > 0) o.up = false;
            if (!o.dead && o.y > H + 50 && !o.up) {
              o.dead = true;
              if (!o.bomb) { strikes++; api.sfx('error'); shake = 6; pops.push({ x: o.x, y: H - 30, txt: '✕', col: '#ff3b3b', life: 1 }); if (strikes >= 3) { dead = true; endT = 1.8; } }
            }
          }
        }
        lastM = { x: m.x, y: m.y };
        const keep = (arr, fn) => { let j = 0; for (const o of arr) if (fn(o)) arr[j++] = o; arr.length = j; };
        keep(items, (o) => !o.dead); keep(halves, (h) => h.life > 0 && h.y < H + 80); keep(parts, (p) => p.life > 0); keep(splats, (s) => s.life > 0); keep(pops, (p) => p.life > 0);
      },
      draw(ctx) {
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        ctx.drawImage(bg, 0, 0);
        for (const s of splats) {
          ctx.globalAlpha = Math.min(0.4, s.life * 0.3); ctx.fillStyle = s.col;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
          for (const [dx, dy, r] of s.drops) { ctx.beginPath(); ctx.arc(s.x + dx, s.y + dy, r, 0, TAU); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        for (const h of halves) {
          ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.ang + h.rot); ctx.globalAlpha = Math.min(1, h.life);
          const r = h.def.r;
          ctx.beginPath(); ctx.rect(-r * 1.3, h.side > 0 ? 0 : -r * 1.3, r * 2.6, r * 1.3); ctx.clip();
          drawFruit(ctx, h.def, r);
          ctx.fillStyle = h.def.flesh; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.86, r * 0.3, 0, 0, TAU); ctx.fill();
          if (h.def.k === 'melon' || h.def.k === 'kiwi') { ctx.fillStyle = '#222'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.28, -1, 3, 2); }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        for (const o of items) {
          ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot);
          if (o.bomb) {
            ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, o.r - 4, 0, TAU); ctx.stroke();
            ctx.fillStyle = '#444'; ctx.fillRect(-5, -o.r - 6, 10, 8);
            ctx.strokeStyle = '#a98467'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -o.r - 6); ctx.quadraticCurveTo(6, -o.r - 14, 10, -o.r - 10); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✕', 0, 1);
          } else drawFruit(ctx, o.def, o.r);
          ctx.restore();
        }
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        // blade trail
        const live = blade.filter((b) => b.on);
        if (live.length > 1) {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let i = 1; i < live.length; i++) {
            const a = i / live.length;
            ctx.strokeStyle = `rgba(200,240,255,${a})`; ctx.lineWidth = 2 + a * 7;
            ctx.beginPath(); ctx.moveTo(live[i - 1].x, live[i - 1].y); ctx.lineTo(live[i].x, live[i].y); ctx.stroke();
          }
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(live[0].x, live[0].y); for (const b of live) ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.font = 'bold 20px sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#0008'; ctx.strokeText(p.txt, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y); }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (flash) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
        // HUD
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 26px sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = '#3d1f0a';
        ctx.strokeText(Math.floor(api.score), 16, 12); ctx.fillStyle = '#ffd166'; ctx.fillText(Math.floor(api.score), 16, 12);
        ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(`${sliced} sliced`, 18, 44);
        ctx.textAlign = 'right'; ctx.font = 'bold 26px sans-serif';
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i < strikes ? '#ff3b3b' : 'rgba(255,255,255,0.25)'; ctx.fillText('✕', W - 16 - (2 - i) * 28, 10); }
        if (t < 3.5 && !sliced) { ctx.globalAlpha = Math.min(1, 3.5 - t); ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Hold the mouse button & swipe!', W / 2, H / 2); ctx.globalAlpha = 1; }
        if (dead && endT < 1.6) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 40px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000a'; ctx.strokeText(strikes >= 3 ? 'TOO MANY DROPS!' : 'KABOOM!', W / 2, H / 2); ctx.fillText(strikes >= 3 ? 'TOO MANY DROPS!' : 'KABOOM!', W / 2, H / 2); }
      },
    };
  },
});
