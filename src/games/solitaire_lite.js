// Solitaire Lite — Golf solitaire: clear seven columns by playing cards one rank above or below the pile.
// Free on PC and tabletop. A–K wrap around in this relaxed "lite" version.
import { defineGame } from './index.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = [['♠', '#1d1d1f'], ['♥', '#d62828'], ['♦', '#d62828'], ['♣', '#1d1d1f']];

defineGame({
  id: 'solitaire_lite', title: 'Solitaire Lite', genre: 'Cards', icon: '🂡', color: '#2d6a4f', free: true,
  desc: 'Golf solitaire: play column cards one rank above or below the pile and clear the whole table.',
  help: 'Click a bottom card that is one rank up or down from the pile · click the deck to draw · or ← → + Space, ↓ to draw',
  platforms: ['tabletop', 'pc', 'console', 'handheld'],
  create(api) {
    const W = api.w, H = api.h, CW = 60, CH = 84, COLS = 7, GAPX = 16, OY = 18, STEP = 24, TAU = Math.PI * 2;
    const X0 = (W - (COLS * CW + (COLS - 1) * GAPX)) / 2;
    const deck = [];
    for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ r, s, x: W / 2, y: H + 100, tx: 0, ty: 0, delay: 0 });
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const cols = Array.from({ length: COLS }, (_, c) => deck.slice(c * 5, c * 5 + 5));
    const stock = deck.slice(35), waste = [];
    const SX = 70, SY = 290, WX = 170;
    cols.forEach((col, c) => col.forEach((card, i) => { card.tx = X0 + c * (CW + GAPX); card.ty = OY + i * STEP; card.delay = (i * COLS + c) * 0.03; }));
    stock.forEach((card, i) => { card.tx = SX - i * 0.4; card.ty = SY - i * 0.4; card.x = card.tx; card.y = card.ty; });
    let cursor = 0, t = 0, streak = 0, best = 0, cleared = 0, over = false, won = false, endT = 0, parts = [], pops = [], shakeCol = -1, shakeT = 0, hintT = 0;
    api.music('jazz');

    const top = () => waste[waste.length - 1];
    const fits = (card) => { const w = top(); if (!w) return false; const d = Math.abs(card.r - w.r); return d === 1 || d === 12; };
    const anyMove = () => cols.some((c) => c.length && fits(c[c.length - 1]));
    const burst = (x, y, col) => { for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, s = 50 + Math.random() * 140; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, col }); } };
    function toWaste(card) {
      waste.push(card); card.delay = 0;
      const skip = Math.max(0, waste.length - 3);
      waste.forEach((c, i) => { c.tx = WX + Math.max(0, i - skip) * 16; c.ty = SY; });
    }
    function draw1() {
      if (over || !stock.length) return;
      const c = stock.pop(); toWaste(c); streak = 0; api.sfx('whoosh', { pitch: 1.6, volume: 0.4 }); api.sfx('click');
      check();
    }
    function play(ci) {
      const col = cols[ci]; if (over || !col.length) return;
      const card = col[col.length - 1];
      if (!fits(card)) { shakeCol = ci; shakeT = 0.3; api.sfx('error', { volume: 0.5 }); return; }
      col.pop(); toWaste(card); streak++; best = Math.max(best, streak); cleared++;
      const pts = 10 + (streak - 1) * 5; api.addScore(pts);
      pops.push({ x: card.x + CW / 2, y: card.y, txt: streak > 2 ? `+${pts} streak ${streak}` : `+${pts}`, life: 1 });
      api.sfx('pop', { pitch: 0.9 + Math.min(1, streak * 0.06) }); api.sfx('click', { volume: 0.5 });
      if (!col.length) { burst(X0 + ci * (CW + GAPX) + CW / 2, OY + 40, '#ffd166'); api.sfx('chime'); }
      check();
    }
    function check() {
      if (cols.every((c) => !c.length)) { won = over = true; endT = 3.5; const bonus = 500 + stock.length * 50; api.addScore(bonus); api.sfx('levelup'); for (let i = 0; i < 6; i++) burst(api.rand(100, 540), api.rand(60, 200), ['#ffd166', '#ef476f', '#4cc9f0'][i % 3]); }
      else if (!stock.length && !anyMove()) { over = true; endT = 3.5; api.sfx('error'); }
    }
    toWaste(stock.pop());
    waste[0].x = SX; waste[0].y = SY;

    const cardAt = (x, y) => {
      for (let c = 0; c < COLS; c++) { const col = cols[c]; if (!col.length) continue; const card = col[col.length - 1]; if (x >= card.tx && x <= card.tx + CW && y >= card.ty && y <= card.ty + CH) return c; }
      return -1;
    };
    const drawCard = (ctx, card, x, y, glow) => {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.roundRect(x + 2, y + 3, CW, CH, 7); ctx.fill();
      if (glow) { ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14; }
      ctx.fillStyle = '#fffdf7'; ctx.beginPath(); ctx.roundRect(x, y, CW, CH, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = glow ? '#ffd166' : '#d6d0c4'; ctx.lineWidth = glow ? 2.5 : 1; ctx.stroke();
      const [sym, col] = SUITS[card.s];
      ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = 'bold 15px sans-serif'; ctx.fillText(RANKS[card.r], x + 5, y + 4);
      ctx.font = '13px sans-serif'; ctx.fillText(sym, x + 5, y + 20);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = card.r >= 10 ? 'bold 26px serif' : '30px sans-serif';
      ctx.fillText(card.r >= 10 ? RANKS[card.r] : sym, x + CW / 2 + 4, y + CH / 2 + 10);
    };
    const drawBack = (ctx, x, y) => {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.roundRect(x + 2, y + 3, CW, CH, 7); ctx.fill();
      ctx.fillStyle = '#9d0208'; ctx.beginPath(); ctx.roundRect(x, y, CW, CH, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x + 4, y + 4, CW - 8, CH - 8, 5); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(x + 6, y + 6, CW - 12, CH - 12); ctx.clip();
      ctx.strokeStyle = '#ffffff38'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = -CH; i < CW + CH; i += 8) { ctx.moveTo(x + i, y); ctx.lineTo(x + i - CH, y + CH); ctx.moveTo(x + i - CH, y); ctx.lineTo(x + i, y + CH); }
      ctx.stroke(); ctx.restore();
    };

    return {
      get debugState() { return { cols: cols.map((c) => c.map((k) => k.r)), top: top()?.r, stock: stock.length }; },
      update(dt, input) {
        t += dt; shakeT = Math.max(0, shakeT - dt); hintT += dt;
        for (const c of deck) {
          if (c.delay > 0) { c.delay -= dt; continue; }
          c.x += (c.tx - c.x) * Math.min(1, dt * 14); c.y += (c.ty - c.y) * Math.min(1, dt * 14);
        }
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt; }
        for (const p of pops) { p.y -= 28 * dt; p.life -= dt; }
        parts = parts.filter((p) => p.life > 0); pops = pops.filter((p) => p.life > 0);
        if (over) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        if (t < 1.2) return;
        if (input.pressed.has('left')) { cursor = (cursor + COLS - 1) % COLS; api.sfx('hover'); }
        if (input.pressed.has('right')) { cursor = (cursor + 1) % COLS; api.sfx('hover'); }
        if (input.pressed.has('a')) { play(cursor); hintT = 0; }
        if (input.pressed.has('down') || input.pressed.has('b')) { draw1(); hintT = 0; }
        const m = input.mouse;
        if (m.clicked) {
          hintT = 0;
          if (m.x >= SX - 6 && m.x <= SX + CW && m.y >= SY - 8 && m.y <= SY + CH) draw1();
          else { const c = cardAt(m.x, m.y); if (c >= 0) { cursor = c; play(c); } }
        }
      },
      draw(ctx) {
        const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 440); g.addColorStop(0, '#40916c'); g.addColorStop(1, '#1b4332');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
        for (let c = 0; c < COLS; c++) { ctx.beginPath(); ctx.roundRect(X0 + c * (CW + GAPX), OY, CW, CH, 7); ctx.stroke(); }
        ctx.beginPath(); ctx.roundRect(SX, SY, CW, CH, 7); ctx.stroke(); ctx.beginPath(); ctx.roundRect(WX, SY, CW, CH, 7); ctx.stroke();
        // stock
        for (const c of stock) drawBack(ctx, c.x, c.y);
        if (stock.length) { ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${stock.length} left`, SX + CW / 2, SY + CH + 16); }
        // waste: show the top few with a fan
        for (const c of waste.slice(-4)) drawCard(ctx, c, c.x, c.y, false);
        // columns
        const hint = hintT > 6;
        cols.forEach((col, ci) => {
          const sh = ci === shakeCol && shakeT > 0 ? Math.sin(shakeT * 60) * 4 : 0;
          col.forEach((c, i) => { if (c.delay <= 0) drawCard(ctx, c, c.x + sh, c.y, i === col.length - 1 && hint && fits(c)); });
          if (ci === cursor && !over) {
            const y = col.length ? col[col.length - 1].ty + CH + 8 : OY + CH + 8;
            ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(X0 + ci * (CW + GAPX) + CW / 2, y); ctx.lineTo(X0 + ci * (CW + GAPX) + CW / 2 - 7, y + 9); ctx.lineTo(X0 + ci * (CW + GAPX) + CW / 2 + 7, y + 9); ctx.fill();
          }
        });
        // flying cards on top
        for (const c of waste) if (Math.hypot(c.x - c.tx, c.y - c.ty) > 4 && c.delay <= 0) drawCard(ctx, c, c.x, c.y, false);
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 14px sans-serif';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = '#ffd166'; ctx.fillText(p.txt, p.x, p.y - 8); }
        ctx.globalAlpha = 1;
        // HUD
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#d8f3dc';
        ctx.fillText(`Cleared ${cleared}/35`, 300, SY + 22); ctx.fillText(`Streak ${streak} (best ${best})`, 300, SY + 46);
        ctx.font = '13px sans-serif'; ctx.fillStyle = '#b7e4c7'; ctx.fillText('Play a card one rank above or below the pile.', 300, SY + 70);
        if (over) {
          ctx.fillStyle = 'rgba(8,28,21,0.82)'; ctx.fillRect(0, H / 2 - 60, W, 110);
          ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = won ? '#ffd166' : '#fff';
          ctx.fillText(won ? 'Table cleared!' : 'No more moves', W / 2, H / 2 - 22);
          ctx.font = '16px sans-serif'; ctx.fillStyle = '#d8f3dc'; ctx.fillText(won ? `${stock.length} cards left in the deck · bonus +${500 + stock.length * 50}` : `${cleared} of 35 cards cleared · longest streak ${best}`, W / 2, H / 2 + 14);
        }
      },
    };
  },
});
