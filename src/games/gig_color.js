// WorkHub gig: Brand Color Match — dial in each client's brand color with RGB or HSL sliders. Scored by perceptual ΔE.
import { defineGame } from './index.js';

const BRANDS = [
  ['Fernwood Coffee', '#6f4e37', 'our signature roast brown'], ['Lagoon Spa', '#2ec4b6', 'that calm lagoon teal'], ['Sunny Side Diner', '#ffbe0b', 'egg-yolk yellow, obviously'],
  ['Velvet Records', '#7b2cbf', 'a deep velvet purple'], ['Ember Fitness', '#e63946', 'energetic ember red'], ['Mint Condition', '#95d5b2', 'soft mint, not too loud'],
  ['Coral Studio', '#ff7f50', 'warm coral'], ['Harbor Bank', '#0077b6', 'trustworthy ocean blue'], ['Plum & Co', '#8e4585', 'a moody plum'],
  ['Forest Friends', '#2d6a4f', 'deep forest green'], ['Peachy Keen', '#ffb4a2', 'gentle peach'], ['Night Owl Tea', '#3d348b', 'midnight indigo'],
];
const ROUNDS = 6, RT = 14;
const PAY = (score) => (score < 150 ? 0 : Math.min(140, 20 + (score - 150) * 0.2));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const css = ([r, g, b]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
function hsl2rgb(h, s, l) { const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255]; }
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function lab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), y = f(R * 0.2126 + G * 0.7152 + B * 0.0722), z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

defineGame({
  id: 'gig_color', title: 'Brand Color Match', genre: 'Freelance', icon: '🎨', color: '#ec4899', gig: true,
  desc: 'Six clients, six brand colors. Mix each one by eye with RGB or HSL sliders before the client loses patience.',
  payText: 'Pays $20–140 · based on color accuracy and speed (6 rounds)',
  pay: PAY,
  help: 'Drag the sliders with the mouse (or ↑ ↓ pick slider, ← → adjust) · Space / Submit when it matches',
  platforms: ['pc'],
  create(api) {
    const W = api.w, H = api.h, TX = 150, TW = 360, SY = [232, 272, 312];
    const brands = [...BRANDS].sort(() => Math.random() - 0.5).slice(0, ROUNDS);
    let round = -1, mode = 'rgb', vals = [0.5, 0.5, 0.5], sel = 0, drag = -1, time = RT, result = null, resT = 0, finished = false, endT = 0, t = 0, total = 0, accs = [], parts = [];
    const target = () => hex(brands[round][1]);
    const mixRGB = (v = vals) => (mode === 'rgb' ? v.map((x) => x * 255) : hsl2rgb(v[0] * 360, v[1], v[2]));
    const LABELS = { rgb: ['Red', 'Green', 'Blue'], hsl: ['Hue', 'Saturation', 'Lightness'] };
    function next() {
      round++;
      if (round >= ROUNDS) { finished = true; endT = 4; api.sfx('cash'); return; }
      mode = round % 2 ? 'hsl' : 'rgb'; vals = mode === 'rgb' ? [0.5, 0.5, 0.5] : [Math.random(), 0.5, 0.5]; sel = 0; time = RT; result = null;
      api.sfx('notify');
    }
    function submit() {
      if (result || finished) return;
      const dE = deltaE(target(), mixRGB()), acc = Math.max(0, Math.min(100, 100 - dE * 2.2));
      const bonus = acc >= 80 ? Math.round(time * 2) : 0, pts = Math.round(acc) + bonus;
      total += pts; accs.push(acc); api.addScore(pts);
      const word = acc >= 95 ? 'Pixel perfect!' : acc >= 85 ? 'Client is thrilled' : acc >= 70 ? 'Close enough' : acc >= 45 ? 'Hmm, not quite…' : 'The client is confused';
      result = { acc, bonus, word }; resT = 2;
      api.sfx(acc >= 85 ? 'success' : acc >= 60 ? 'ding' : 'error');
      if (acc >= 90) { api.sfx('sparkle'); for (let i = 0; i < 30; i++) { const a = Math.random() * 7, s = 60 + Math.random() * 160; parts.push({ x: W / 2, y: 135, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8, col: brands[round][1] }); } }
    }
    next();

    return {
      get debugState() { if (round >= ROUNDS || result) return null; const [r, g, b] = target(); return mode === 'rgb' ? [r / 255, g / 255, b / 255] : (([h, s, l]) => [h / 360, s, l])(rgb2hsl(r, g, b)); },
      update(dt, input) {
        t += dt;
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.life -= dt; }
        parts = parts.filter((p) => p.life > 0);
        if (finished) { endT -= dt; if (endT <= 0 || (input.pressed.has('a') && endT < 3)) { endT = 99; api.gameOver(); } return; }
        if (result) { resT -= dt; if (resT <= 0 || (input.pressed.has('a') && resT < 1.5)) next(); return; }
        time -= dt;
        if (time <= 0) { time = 0; submit(); return; }
        // keyboard
        if (input.pressed.has('up')) { sel = (sel + 2) % 3; api.sfx('hover'); }
        if (input.pressed.has('down')) { sel = (sel + 1) % 3; api.sfx('hover'); }
        const k = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (input.pressed.has('left') || input.pressed.has('right')) vals[sel] = Math.max(0, Math.min(1, vals[sel] + k / 255));
        else if (k) vals[sel] = Math.max(0, Math.min(1, vals[sel] + k * 0.32 * dt));
        // mouse
        const m = input.mouse;
        if (m.clicked) {
          drag = SY.findIndex((y) => Math.abs(m.y - y) < 14 && m.x > TX - 12 && m.x < TX + TW + 12);
          if (drag >= 0) { sel = drag; api.sfx('click', { volume: 0.4 }); }
          if (m.x > 500 && m.x < 620 && m.y > 346 && m.y < 384) { submit(); return; }
        }
        if (!m.down) drag = -1;
        if (drag >= 0) vals[drag] = Math.max(0, Math.min(1, (m.x - TX) / TW));
        if (input.pressed.has('a')) submit();
      },
      draw(ctx) {
        ctx.fillStyle = '#18181b'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#27272a'; ctx.fillRect(0, 0, W, 30);
        ctx.font = 'bold 13px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#f9a8d4'; ctx.fillText('WorkHub · Brand Color Match', 12, 15);
        ctx.fillStyle = '#d4d4d8'; ctx.fillText(`Round ${Math.min(ROUNDS, round + 1)}/${ROUNDS}`, 230, 15);
        ctx.textAlign = 'right'; ctx.fillStyle = '#22d3ee'; ctx.fillText(`Est. $${PAY(total).toFixed(0)}`, W - 12, 15);
        if (round < ROUNDS) {
          const [name, , brief] = brands[round];
          ctx.textAlign = 'center'; ctx.fillStyle = '#e4e4e7'; ctx.font = '14px sans-serif'; ctx.fillText(`${name}: “${brief}”`, W / 2, 48);
          const sw = (x, label, col) => {
            ctx.fillStyle = '#00000066'; ctx.beginPath(); ctx.roundRect(x + 3, 68, 240, 120, 14); ctx.fill();
            ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x, 64, 240, 120, 14); ctx.fill();
            ctx.fillStyle = '#a1a1aa'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(label, x + 120, 198);
          };
          sw(64, 'CLIENT COLOR', brands[round][1]); sw(336, mode === 'rgb' ? 'YOUR MIX · RGB' : 'YOUR MIX · HSL', css(mixRGB()));
          // sliders
          for (let i = 0; i < 3; i++) {
            const y = SY[i], g = ctx.createLinearGradient(TX, 0, TX + TW, 0);
            if (mode === 'hsl' && i === 0) for (let s = 0; s <= 6; s++) g.addColorStop(s / 6, css(hsl2rgb(s * 60, vals[1], vals[2])));
            else for (const s of [0, 0.5, 1]) { const v = [...vals]; v[i] = s; g.addColorStop(s, css(mixRGB(v))); }
            ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(TX, y - 7, TW, 14, 7); ctx.fill();
            if (i === sel) { ctx.strokeStyle = '#f9a8d4'; ctx.lineWidth = 2; ctx.stroke(); }
            const hx = TX + vals[i] * TW;
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, y, 10, 0, 7); ctx.fill(); ctx.fillStyle = css(mixRGB()); ctx.beginPath(); ctx.arc(hx, y, 6, 0, 7); ctx.fill();
            ctx.textAlign = 'right'; ctx.fillStyle = i === sel ? '#f9a8d4' : '#d4d4d8'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(LABELS[mode][i], TX - 18, y);
            ctx.textAlign = 'left'; ctx.fillStyle = '#a1a1aa'; ctx.font = '13px monospace';
            ctx.fillText(mode === 'rgb' ? String(Math.round(vals[i] * 255)) : i === 0 ? `${Math.round(vals[0] * 360)}°` : `${Math.round(vals[i] * 100)}%`, TX + TW + 16, y);
          }
          // timer + submit
          ctx.fillStyle = '#3f3f46'; ctx.beginPath(); ctx.roundRect(20, 358, 460, 12, 6); ctx.fill();
          ctx.fillStyle = time < 4 ? '#f87171' : '#f9a8d4'; ctx.beginPath(); ctx.roundRect(20, 358, 460 * Math.max(0, time / RT), 12, 6); ctx.fill();
          ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.roundRect(500, 346, 120, 38, 10); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Submit', 560, 365);
          if (result) {
            ctx.fillStyle = 'rgba(24,24,27,0.88)'; ctx.fillRect(0, 210, W, 130);
            ctx.fillStyle = result.acc >= 85 ? '#4ade80' : result.acc >= 60 ? '#facc15' : '#f87171'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(`${Math.round(result.acc)}% match`, W / 2, 255);
            ctx.fillStyle = '#e4e4e7'; ctx.font = '17px sans-serif'; ctx.fillText(result.word + (result.bonus ? ` · speed bonus +${result.bonus}` : ''), W / 2, 295);
          }
        }
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
        ctx.globalAlpha = 1;
        if (finished) {
          const avg = accs.reduce((a, b) => a + b, 0) / Math.max(1, accs.length);
          ctx.fillStyle = 'rgba(24,24,27,0.94)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center';
          ctx.fillStyle = '#f9a8d4'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Palette delivered!', W / 2, 110);
          brands.forEach((b, i) => { ctx.fillStyle = b[1]; ctx.beginPath(); ctx.roundRect(W / 2 - 165 + i * 56, 140, 48, 48, 10); ctx.fill(); ctx.fillStyle = '#d4d4d8'; ctx.font = '12px sans-serif'; ctx.fillText(`${Math.round(accs[i] ?? 0)}%`, W / 2 - 141 + i * 56, 202); });
          ctx.fillStyle = '#e4e4e7'; ctx.font = '18px sans-serif'; ctx.fillText(`Average match ${Math.round(avg)}%`, W / 2, 245);
          ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(`Payout: $${PAY(total).toFixed(2)} (before mood bonus)`, W / 2, 285);
        }
      },
    };
  },
});
