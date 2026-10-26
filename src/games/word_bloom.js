// Word Bloom — typing game: words drift down on dandelion seeds; type them before they land.
// Every finished word blooms into a flower in your garden.
import { defineGame } from './index.js';

const WORDS = ('sun rain leaf seed moss fern bee dew bud oak pond lily rose sky mint sage bark root soil nest wren moth frog plum pear fig kiwi cozy warm nap tea glow mist wind star moon pine vine twig hive lark dove reed '
  + 'petal bloom daisy tulip maple cedar honey clover grove brook cloud sprout breeze meadow willow garden orchid poppy acorn lotus iris aster basil thyme berry peach lemon apple mango cherry ripple puddle sunny '
  + 'blossom sunrise rainbow lantern morning orchard harvest sparrow firefly sunbeam moonlit evening thicket juniper lavender marigold primrose bluebell honeybee seedling dewdrop ladybug hedgehog butterfly dandelion '
  + 'sunflower snowdrop starlight hummingbird wildflower raindrop windchime greenhouse watercress foxglove').split(' ');
const PETALS = ['#ff8fab', '#ffd166', '#c77dff', '#4cc9f0', '#ff6b6b', '#ffffff', '#ffb4a2', '#90e0ef'];

defineGame({
  id: 'word_bloom', title: 'Word Bloom', genre: 'Typing', icon: '🌼', color: '#ffb4a2',
  desc: 'Words float down on dandelion fluff. Type them before they land and watch your garden bloom.',
  help: 'Just type the words! · Backspace to switch target · don\'t let words touch the ground',
  platforms: ['pc', 'console', 'tabletop'],
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2, GROUND = 352;
    let words = [], flowers = [], parts = [], pops = [], target = null, spawnT = 0.8, t = 0, health = 5, combo = 0, typedOK = 0, typedBad = 0, done = 0, dead = false, endT = 0, shake = 0, errFlash = 0;
    api.music('classical');
    const lvl = () => Math.min(1, t / 100);
    function spawn() {
      const L = lvl(), maxLen = 4 + Math.floor(L * 7) + (Math.random() < 0.2 ? 2 : 0), minLen = L > 0.5 ? 4 : 3;
      const pool = WORDS.filter((w) => w.length >= minLen && w.length <= maxLen && !words.some((o) => o.text[0] === w[0]));
      if (!pool.length) return;
      const text = pool[Math.floor(Math.random() * pool.length)];
      ctxMeasure.font = 'bold 17px sans-serif';
      const w = ctxMeasure.measureText(text).width + 22;
      words.push({ text, x: api.rand(20 + w / 2, W - 20 - w / 2), y: -20, w, vy: 16 + L * 26 + Math.random() * 6, sway: Math.random() * TAU, prog: 0, gold: Math.random() < 0.06, shake: 0 });
    }
    const ctxMeasure = document.createElement('canvas').getContext('2d');
    const burst = (x, y, n, cols) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 120; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.8 + Math.random() * 0.6, col: cols[i % cols.length], rot: Math.random() * TAU }); } };
    function bloom(wd) {
      done++; combo++;
      const pts = Math.round(wd.text.length * 10 * (1 + Math.min(combo, 20) * 0.1)) + (wd.gold ? 100 : 0);
      api.addScore(pts);
      pops.push({ x: wd.x, y: wd.y, txt: `+${pts}`, col: wd.gold ? '#ffd166' : '#fff', life: 1 });
      const col = PETALS[Math.floor(Math.random() * PETALS.length)];
      burst(wd.x, wd.y, 18, [col, '#fff', '#b7e4c7']);
      if (wd.gold) { health = Math.min(5, health + 1); api.sfx('sparkle'); }
      api.sfx('pop', { pitch: 1 + Math.min(1, combo * 0.04) }); api.sfx('chime', { volume: 0.5 });
      const x = Math.max(16, Math.min(W - 16, wd.x + api.rand(-20, 20)));
      const near = flowers.find((f) => Math.abs(f.x - x) < 14);
      if (near && near.size < 1.6) near.size += 0.25;
      else flowers.push({ x, h: 26 + Math.random() * 26, size: 0.01, tsize: 1, col, sway: Math.random() * TAU, kind: Math.floor(Math.random() * 3) });
      if (flowers.length > 40) flowers.shift();
    }

    return {
      update(dt, input) {
        t += dt; shake = Math.max(0, shake - dt * 25); errFlash = Math.max(0, errFlash - dt * 3);
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.vx *= 1 - dt; p.rot += dt * 4; p.life -= dt; }
        for (const p of pops) { p.y -= 30 * dt; p.life -= dt; }
        parts = parts.filter((p) => p.life > 0); pops = pops.filter((p) => p.life > 0);
        for (const f of flowers) { if (f.tsize) { f.size += (f.tsize - f.size) * Math.min(1, dt * 4); if (Math.abs(f.size - f.tsize) < 0.01) f.tsize = 0; } }
        if (dead) { endT -= dt; for (const w of words) w.y += 60 * dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        spawnT -= dt;
        if (spawnT <= 0) { spawn(); spawnT = Math.max(0.95, 2.6 - lvl() * 1.7) * api.rand(0.8, 1.2); }
        for (const w of words) { w.y += w.vy * dt; w.sway += dt * 1.4; w.shake = Math.max(0, w.shake - dt * 4); }
        // typing
        for (const raw of input.typed) {
          if (raw === '\b') { if (target) { target.prog = 0; target = null; api.sfx('uiBack'); } continue; }
          const ch = raw.toLowerCase();
          if (!/[a-z]/.test(ch)) continue;
          if (!target) {
            const cands = words.filter((w) => w.text[0] === ch).sort((a, b) => b.y - a.y);
            if (cands.length) { target = cands[0]; target.prog = 1; typedOK++; api.sfx('type'); }
            else { typedBad++; combo = 0; errFlash = 1; api.sfx('error', { volume: 0.5 }); }
          } else if (target.text[target.prog] === ch) { target.prog++; typedOK++; api.sfx('type'); }
          else { typedBad++; combo = 0; target.shake = 1; errFlash = 1; api.sfx('error', { volume: 0.5 }); }
          if (target && target.prog >= target.text.length) { target.dead = true; bloom(target); target = null; }
        }
        for (const w of words) {
          if (!w.dead && w.y > GROUND - 14) {
            w.dead = true; health--; combo = 0; shake = 8; api.sfx('thud'); api.sfx('error');
            burst(w.x, GROUND, 14, ['#6b4f3a', '#8d6e4a']);
            const victim = flowers.reduce((b, f) => (!b || Math.abs(f.x - w.x) < Math.abs(b.x - w.x) ? f : b), null);
            if (victim && Math.abs(victim.x - w.x) < 80) flowers.splice(flowers.indexOf(victim), 1);
            if (target === w) target = null;
            if (health <= 0) { dead = true; endT = 2.4; api.sfx('explode', { pitch: 0.5, volume: 0.5 }); }
          }
        }
        words = words.filter((w) => !w.dead);
      },
      draw(ctx) {
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        const sky = ctx.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, '#a9def9'); sky.addColorStop(0.7, '#e4c1f9'); sky.addColorStop(1, '#fcf6bd');
        ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, GROUND + 20);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (let i = 0; i < 4; i++) { const x = ((i * 210 + t * 6) % (W + 200)) - 100, y = 40 + (i % 2) * 50; ctx.beginPath(); ctx.ellipse(x, y, 50, 14, 0, 0, TAU); ctx.ellipse(x + 26, y - 8, 30, 14, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#b5e48c'; ctx.beginPath(); ctx.moveTo(0, GROUND); for (let x = 0; x <= W; x += 32) ctx.lineTo(x, GROUND - 26 - Math.sin(x * 0.012 + 1) * 18); ctx.lineTo(W, GROUND); ctx.fill();
        // flowers
        for (const f of flowers) {
          const s = f.size, sw = Math.sin(t * 1.5 + f.sway) * 3 * s, top = GROUND - f.h * s;
          ctx.strokeStyle = '#52b788'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(f.x, GROUND + 4); ctx.quadraticCurveTo(f.x - 4, GROUND - f.h * s * 0.5, f.x + sw, top); ctx.stroke();
          ctx.fillStyle = '#74c69d'; ctx.beginPath(); ctx.ellipse(f.x - 6 * s, GROUND - f.h * s * 0.35, 6 * s, 2.5 * s, -0.5, 0, TAU); ctx.fill();
          ctx.fillStyle = f.col;
          const n = f.kind === 0 ? 5 : f.kind === 1 ? 8 : 6, pr = (f.kind === 1 ? 5 : 6) * s;
          for (let i = 0; i < n; i++) { const a = i / n * TAU + t * 0.2; ctx.beginPath(); ctx.ellipse(f.x + sw + Math.cos(a) * pr, top + Math.sin(a) * pr, pr * 0.75, pr * 0.45, a, 0, TAU); ctx.fill(); }
          ctx.fillStyle = f.kind === 2 ? '#6a4c93' : '#ffb703'; ctx.beginPath(); ctx.arc(f.x + sw, top, 3.5 * s, 0, TAU); ctx.fill();
        }
        const gg = ctx.createLinearGradient(0, GROUND, 0, H); gg.addColorStop(0, '#7f5539'); gg.addColorStop(1, '#582f0e');
        ctx.fillStyle = gg; ctx.fillRect(-10, GROUND, W + 20, H - GROUND + 10);
        ctx.fillStyle = '#95d5b2'; ctx.fillRect(-10, GROUND - 2, W + 20, 5);
        // falling words on dandelion seeds
        for (const w of words) {
          const x = w.x + Math.sin(w.sway) * 10 + (w.shake ? Math.sin(t * 60) * 4 * w.shake : 0), y = w.y;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
          for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.28; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + Math.cos(a) * 18, y - 14 + Math.sin(a) * 18); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 18, y - 14 + Math.sin(a) * 18, 1.6, 0, TAU); ctx.fill(); }
          ctx.strokeStyle = '#d4a373'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 10); ctx.stroke();
          const isT = w === target;
          ctx.fillStyle = w.gold ? '#fff3b0' : 'rgba(255,255,255,0.95)';
          if (isT) { ctx.shadowColor = '#ff8fab'; ctx.shadowBlur = 14; }
          ctx.beginPath(); ctx.roundRect(x - w.w / 2, y - 11, w.w, 24, 12); ctx.fill(); ctx.shadowBlur = 0;
          if (isT) { ctx.strokeStyle = '#ff8fab'; ctx.lineWidth = 2; ctx.stroke(); }
          if (w.gold) { ctx.strokeStyle = '#ffb703'; ctx.lineWidth = 2; ctx.stroke(); }
          ctx.font = 'bold 17px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          const typedPart = w.text.slice(0, w.prog), rest = w.text.slice(w.prog), tw = ctx.measureText(w.text).width;
          ctx.fillStyle = '#e85d75'; ctx.fillText(typedPart, x - tw / 2, y + 1.5);
          ctx.fillStyle = '#3d2c4e'; ctx.fillText(rest, x - tw / 2 + ctx.measureText(typedPart).width, y + 1.5);
          const danger = (w.y - 200) / (GROUND - 200);
          if (danger > 0) { ctx.fillStyle = `rgba(255,80,80,${danger * 0.6})`; ctx.fillRect(x - w.w / 2 + 8, y + 10, (w.w - 16) * danger, 2); }
        }
        for (const p of parts) { ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 1.5); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.2, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = '#5a189a'; ctx.fillText(p.txt, p.x + 1, p.y - 19); ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y - 20); }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (errFlash) { ctx.fillStyle = `rgba(255,90,90,${errFlash * 0.12})`; ctx.fillRect(0, 0, W, H); }
        // HUD
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = 'bold 14px sans-serif';
        for (let i = 0; i < 5; i++) { ctx.fillStyle = i < health ? '#ff6b9a' : 'rgba(0,0,0,0.15)'; const x = 18 + i * 20, y = 20; ctx.beginPath(); ctx.arc(x - 3, y - 2, 4.5, 0, TAU); ctx.arc(x + 3, y - 2, 4.5, 0, TAU); ctx.moveTo(x - 7.5, y); ctx.lineTo(x, y + 8); ctx.lineTo(x + 7.5, y); ctx.fill(); }
        const acc = typedOK + typedBad ? typedOK / (typedOK + typedBad) : 1;
        ctx.fillStyle = '#3d2c4e'; ctx.fillText(`${done} words · ${(acc * 100).toFixed(0)}% accuracy${combo > 2 ? ` · combo ×${combo}` : ''}`, 124, 20);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(`${flowers.length} flowers`, W - 14, H - 22);
        if (t < 4 && !done) { ctx.globalAlpha = Math.min(1, 4 - t); ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#5a189a'; ctx.fillText('Type the falling words!', W / 2, 150); ctx.globalAlpha = 1; }
        if (dead) { ctx.fillStyle = 'rgba(60,30,80,0.55)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.font = 'bold 32px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('The garden rests', W / 2, H / 2 - 16); ctx.font = '16px sans-serif'; ctx.fillText(`${done} words bloomed · ${(acc * 100).toFixed(0)}% accuracy`, W / 2, H / 2 + 18); }
      },
    };
  },
});
