// Memory Match — card-flip pairs game (free; the tabletop board game and PC both run it).
import { defineGame } from './index.js';

const SYMS = [
  ['heart', '#ef476f'], ['star', '#ffb703'], ['moon', '#9d4edd'], ['bolt', '#f77f00'], ['leaf', '#2a9d8f'],
  ['drop', '#4895ef'], ['flower', '#ff8fab'], ['gem', '#00b4d8'], ['sun', '#e85d04'], ['cloud', '#8d99ae'],
];

function drawSym(ctx, k, col, s) {
  const TAU = Math.PI * 2;
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 3 * s; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (k === 'heart') { ctx.moveTo(0, 14 * s); ctx.bezierCurveTo(-26 * s, -4 * s, -12 * s, -22 * s, 0, -9 * s); ctx.bezierCurveTo(12 * s, -22 * s, 26 * s, -4 * s, 0, 14 * s); ctx.fill(); }
  else if (k === 'star') { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = (i % 2 ? 8 : 19) * s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); }
  else if (k === 'moon') { ctx.arc(0, 0, 17 * s, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8 * s, -5 * s, 14 * s, 0, TAU); ctx.fill(); }
  else if (k === 'bolt') { ctx.moveTo(4 * s, -19 * s); ctx.lineTo(-11 * s, 3 * s); ctx.lineTo(-1 * s, 3 * s); ctx.lineTo(-5 * s, 19 * s); ctx.lineTo(11 * s, -4 * s); ctx.lineTo(1 * s, -4 * s); ctx.closePath(); ctx.fill(); }
  else if (k === 'leaf') { ctx.moveTo(-14 * s, 14 * s); ctx.quadraticCurveTo(-16 * s, -14 * s, 16 * s, -16 * s); ctx.quadraticCurveTo(14 * s, 14 * s, -14 * s, 14 * s); ctx.fill(); ctx.strokeStyle = '#fff8'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(-14 * s, 14 * s); ctx.lineTo(8 * s, -8 * s); ctx.stroke(); }
  else if (k === 'drop') { ctx.moveTo(0, -19 * s); ctx.quadraticCurveTo(15 * s, 2 * s, 12 * s, 8 * s); ctx.arc(0, 7 * s, 12 * s, 0.1, Math.PI - 0.1); ctx.quadraticCurveTo(-15 * s, 2 * s, 0, -19 * s); ctx.fill(); }
  else if (k === 'flower') { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 9 * s, Math.sin(a) * 9 * s, 8 * s, 0, TAU); ctx.fill(); } ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 6 * s, 0, TAU); ctx.fill(); }
  else if (k === 'gem') { ctx.moveTo(-16 * s, -6 * s); ctx.lineTo(-8 * s, -15 * s); ctx.lineTo(8 * s, -15 * s); ctx.lineTo(16 * s, -6 * s); ctx.lineTo(0, 17 * s); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff9'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(-16 * s, -6 * s); ctx.lineTo(16 * s, -6 * s); ctx.moveTo(-5 * s, -6 * s); ctx.lineTo(0, 17 * s); ctx.lineTo(5 * s, -6 * s); ctx.stroke(); }
  else if (k === 'sun') { ctx.arc(0, 0, 10 * s, 0, TAU); ctx.fill(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 13 * s, Math.sin(a) * 13 * s); ctx.lineTo(Math.cos(a) * 19 * s, Math.sin(a) * 19 * s); ctx.stroke(); } }
  else if (k === 'cloud') { ctx.arc(-8 * s, 4 * s, 9 * s, 0, TAU); ctx.arc(3 * s, -3 * s, 11 * s, 0, TAU); ctx.arc(12 * s, 5 * s, 8 * s, 0, TAU); ctx.fill(); ctx.fillRect(-8 * s, 4 * s, 20 * s, 9 * s); }
}

defineGame({
  id: 'memory_match', title: 'Memory Match', genre: 'Puzzle', icon: '🃏', color: '#2a9d8f', free: true,
  desc: 'Flip cards two at a time and find all ten pairs in as few moves as you can.',
  help: 'Click cards to flip · or arrows to move the cursor & Space to flip',
  platforms: ['tabletop', 'pc', 'console', 'handheld'],
  create(api) {
    const W = api.w, H = api.h, COLS = 5, ROWS = 4, CW = 88, CH = 74, GX = 12, GY = 10, TAU = Math.PI * 2;
    const X0 = (W - (COLS * CW + (COLS - 1) * GX)) / 2, Y0 = 52;
    const ids = [...Array(SYMS.length).keys(), ...Array(SYMS.length).keys()];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const cards = ids.map((s, i) => ({ s, i, col: i % COLS, row: Math.floor(i / COLS), flip: 0, up: false, matched: false, deal: -i * 0.04, wob: 0 }));
    let open = [], hideT = 0, moves = 0, pairs = 0, streak = 0, t = 0, clock = 0, cursor = 0, won = false, endT = 0, parts = [], pops = [], mouseMode = false;
    api.music('jazz');
    const pos = (c) => ({ x: X0 + c.col * (CW + GX), y: Y0 + c.row * (CH + GY) });
    const burst = (x, y, col) => { for (let i = 0; i < 22; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 160; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, col: i % 3 ? col : '#fff' }); } };

    function flip(c) {
      if (won || c.up || c.matched || open.length >= 2 || hideT > 0 || c.deal < 1) return;
      c.up = true; open.push(c); api.sfx('click', { pitch: 0.8 }); api.sfx('whoosh', { pitch: 2, volume: 0.25 });
      if (open.length === 2) {
        moves++;
        const [a, b] = open;
        if (a.s === b.s) {
          a.matched = b.matched = true; pairs++; streak++; open = [];
          const pts = 100 + (streak - 1) * 50; api.addScore(pts);
          for (const c2 of [a, b]) { const p = pos(c2); burst(p.x + CW / 2, p.y + CH / 2, SYMS[c2.s][1]); }
          const p = pos(b); pops.push({ x: p.x + CW / 2, y: p.y, txt: streak > 1 ? `STREAK ×${streak} +${pts}` : `+${pts}`, life: 1.1 });
          api.sfx('success', { delay: 0.12 }); if (streak > 1) api.sfx('sparkle', { delay: 0.2 });
          if (pairs === SYMS.length) {
            won = true; endT = 3.2;
            const bonus = Math.max(0, 1200 - (moves - SYMS.length) * 60) + Math.max(0, 600 - Math.floor(clock) * 5);
            api.addScore(bonus); api.sfx('levelup', { delay: 0.4 });
          }
        } else { streak = 0; hideT = 0.85; a.wob = b.wob = 0.01; api.sfx('error', { delay: 0.25, volume: 0.4 }); }
      }
    }

    return {
      get debugState() { return cards.map((c) => c.s); },
      update(dt, input) {
        t += dt; if (!won) clock += dt;
        for (const c of cards) {
          c.deal = Math.min(1, c.deal + dt * 3);
          const want = c.up || c.matched ? 1 : 0;
          c.flip += Math.sign(want - c.flip) * Math.min(Math.abs(want - c.flip), dt * 6);
          if (c.wob) { c.wob += dt; if (c.wob > 0.5) c.wob = 0; }
        }
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.life -= dt; }
        for (const p of pops) { p.y -= 25 * dt; p.life -= dt; }
        parts = parts.filter((p) => p.life > 0); pops = pops.filter((p) => p.life > 0);
        if (won) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        if (hideT > 0) { hideT -= dt; if (hideT <= 0) { for (const c of open) c.up = false; open = []; api.sfx('whoosh', { pitch: 1.6, volume: 0.25 }); } }
        // keyboard cursor
        const mv = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
        for (const k in mv) if (input.pressed.has(k)) {
          mouseMode = false;
          const c = cards[cursor], col = (c.col + mv[k][0] + COLS) % COLS, row = (c.row + mv[k][1] + ROWS) % ROWS;
          cursor = row * COLS + col; api.sfx('hover', { volume: 0.6 });
        }
        if (input.pressed.has('a')) flip(cards[cursor]);
        // mouse
        const m = input.mouse;
        const hov = cards.find((c) => { const p = pos(c); return m.x >= p.x && m.x <= p.x + CW && m.y >= p.y && m.y <= p.y + CH; });
        if (hov && (m.clicked || hov.i !== cursor && mouseMode)) { cursor = hov.i; }
        if (m.clicked) { mouseMode = true; if (hov) flip(hov); }
      },
      draw(ctx) {
        const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 420); g.addColorStop(0, '#2d6a4f'); g.addColorStop(1, '#0b2b22');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
        for (let i = -H; i < W; i += 14) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
        for (const c of cards) {
          const p = pos(c), d = c.deal;
          if (d <= 0) continue;
          const e = 1 - Math.pow(1 - Math.max(0, d), 3);
          const x = W / 2 - CW / 2 + (p.x - (W / 2 - CW / 2)) * e, y = H + 40 + (p.y - H - 40) * e;
          const sx = Math.abs(Math.cos(c.flip * Math.PI)), face = c.flip > 0.5;
          const wob = c.wob ? Math.sin(c.wob * 40) * 4 * (0.5 - c.wob) * 2 : 0;
          const lift = c.i === cursor && !c.matched && !won ? -3 : 0;
          ctx.save(); ctx.translate(x + CW / 2 + wob, y + CH / 2 + lift); ctx.scale(Math.max(0.02, sx), 1);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(-CW / 2 + 3, -CH / 2 + 5, CW, CH, 10); ctx.fill();
          if (face) {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-CW / 2, -CH / 2, CW, CH, 10); ctx.fill();
            if (c.matched) { ctx.strokeStyle = SYMS[c.s][1]; ctx.lineWidth = 3; ctx.stroke(); }
            const pulse = c.matched ? 1 + Math.max(0, Math.sin(t * 3 + c.i) * 0.04) : 1;
            drawSym(ctx, SYMS[c.s][0], SYMS[c.s][1], 1.15 * pulse);
          } else {
            const bg = ctx.createLinearGradient(0, -CH / 2, 0, CH / 2); bg.addColorStop(0, '#3a0ca3'); bg.addColorStop(1, '#240046');
            ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-CW / 2, -CH / 2, CW, CH, 10); ctx.fill();
            ctx.strokeStyle = '#ffd16688'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-CW / 2 + 6, -CH / 2 + 6, CW - 12, CH - 12, 6); ctx.stroke();
            ctx.fillStyle = '#ffd16655';
            for (let yy = -1; yy <= 1; yy++) for (let xx = -2; xx <= 2; xx++) { ctx.beginPath(); const cx = xx * 14 + (yy % 2 ? 7 : 0), cy = yy * 16; ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 5, cy); ctx.fill(); }
          }
          ctx.restore();
          if (c.i === cursor && !won && !mouseMode) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x - 4, y - 4 + lift, CW + 8, CH + 8, 13); ctx.stroke(); }
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 15px sans-serif';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = '#000a'; ctx.fillText(p.txt, p.x + 1, p.y + 1); ctx.fillStyle = '#ffd166'; ctx.fillText(p.txt, p.x, p.y); }
        ctx.globalAlpha = 1;
        // HUD
        ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#e9f5db';
        ctx.fillText(`Pairs ${pairs}/${SYMS.length}`, 22, 26);
        ctx.textAlign = 'center'; ctx.fillText(`Moves ${moves}`, W / 2, 26);
        ctx.textAlign = 'right'; ctx.fillText(`${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, '0')}`, W - 22, 26);
        if (won) {
          ctx.fillStyle = 'rgba(11,43,34,0.8)'; ctx.fillRect(0, H / 2 - 50, W, 100);
          ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = '#ffd166'; ctx.fillText('All pairs found!', W / 2, H / 2 - 14);
          ctx.font = '16px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(`${moves} moves · ${Math.floor(clock)} seconds`, W / 2, H / 2 + 20);
        }
      },
    };
  },
});
