// Larger modal panels mixed into the UI: cooking, wardrobe, book reader,
// journal, painting easel, game library, trading-card reveal.
import { G } from '../game.js';
import { UI } from './ui.js';
import { el, fmtMoney, seeded, clamp } from '../core/utils.js';
import { ITEMS, RARITY } from '../items/registry.js';
import { thumbImg } from './thumbs.js';
import { RECIPES } from '../world/cooking.js';
import { ingredientsAvailable, useIngredient } from '../items/behaviors/kitchen.js';
import { SLOTS, SLOT_LABEL } from '../player/outfit.js';
import { GAMES } from '../games/index.js';
import { bookText } from './booktext.js';

const P = UI.prototype;

// ------------------------------------------------------------------ cooking
P.openCooking = function (range) {
  const known = new Set(G.state.flags.recipes || []);
  const list = el('div', { class: 'recipes' });
  for (const r of RECIPES) {
    const locked = r.learn && !known.has(r.id);
    const ing = ingredientsAvailable(r.ingredients);
    const ok = !locked && !!ing;
    const dish = ITEMS[r.makes];
    list.appendChild(el('div', { class: 'recipe' + (ok ? '' : ' off') },
      dish ? thumbImg(dish, 96) : el('div', {}),
      el('div', { class: 'rc-i' },
        el('div', { class: 'rc-n' }, locked ? '🔒 ' + r.name : r.name),
        el('div', { class: 'rc-s' }, locked ? 'Learn it from a cookbook' : r.ingredients.map((id) => `${G.items.all().some((i) => i.def.id === id && !['package', 'gone'].includes(i.data.loc)) ? '✅' : '❌'} ${ITEMS[id]?.name || id}`).join('  ')),
        el('div', { class: 'rc-m' }, `${r.method === 'oven' ? '🔥 Oven' : '🍳 Stovetop'} · ${r.seconds}s${dish?.use?.needs ? ' · +' + (dish.use.needs.hunger || 0) + ' hunger' : ''}`),
      ),
      el('button', { class: 'btn' + (ok ? ' primary' : ''), onclick: () => {
        if (!ok) { G.audio.play('error'); G.ui.toast(locked ? 'You haven\'t learned this recipe yet' : 'Missing ingredients — order them from FreshCart', { kind: 'bad', icon: '🛒' }); return; }
        this.closeModal();
        const used = ingredientsAvailable(r.ingredients);
        used.forEach(useIngredient);
        range.cook(r, (quality) => {
          const p = range.servePos(G.items.all().filter((i) => i.data.loc === 'world' && i.def.id.startsWith('dish_')).length % 4);
          const d = G.items.spawn(r.makes, { loc: 'world', pos: p, yaw: Math.PI, st: { madeAt: G.clock.total, homemade: true, quality } });
          G.particles.sparkle(p.clone().setY(p.y + 0.1), 12);
          G.ui.toast(`${r.name} is ready!${quality > 1.2 ? ' Chef\'s kiss 👌' : ''}`, { icon: '🍽️', kind: 'good' });
          G.needs.add({ fun: 6 });
          G.events.emit('act', 'cook', { item: r.makes, recipe: r.id });
          void d;
        });
      } }, 'Cook'),
    ));
  }
  this.openModal(el('div', {}, el('div', { class: 'tip' }, 'Ingredients come from FreshCart. Cookbooks teach new recipes. Tap the green zone while cooking for bonus quality!'), list), { title: 'What\'s cooking?', icon: '🍳', wide: true });
};

// ------------------------------------------------------------------ wardrobe
P.openWardrobe = function () {
  const render = () => {
    body.innerHTML = '';
    const r = G.outfit.styleReport();
    body.appendChild(el('div', { class: 'wd-top' },
      el('div', { class: 'wd-score' }, el('div', { class: 'k' }, 'Style'), el('div', { class: 'v' }, String(r.score)), el('div', { class: 'vibe' }, r.vibe)),
      el('div', { class: 'wd-slots' }, ...SLOTS.map((s) => { const w = G.outfit.worn(s); return el('div', { class: 'wd-slot' + (w ? ' on' : '') }, el('div', { class: 'k' }, SLOT_LABEL[s]), w ? thumbImg(w.def, 96) : el('div', { class: 'none' }, '—'), w ? el('button', { class: 'x', onclick: () => { G.outfit.takeOff(s); render(); } }, 'Remove') : null); })),
    ));
    const all = G.items.inLoc('wardrobe').concat(G.items.inLoc('storage').filter((i) => i.def.use?.type === 'wear'));
    for (const s of SLOTS) {
      const list = all.filter((i) => i.def.use.slot === s);
      if (!list.length) continue;
      body.appendChild(el('div', { class: 'sec' }, SLOT_LABEL[s]));
      body.appendChild(el('div', { class: 'inv-grid' }, ...list.map((i) => el('div', { class: 'inv-card clickable', style: { '--r': RARITY[i.def.rarity].color }, onclick: () => { G.outfit.wear(i); render(); } }, thumbImg(i.def, 128), el('div', { class: 'inv-n' }, i.def.name), el('div', { class: 'inv-tags' }, (i.def.use.vibe || []).join(' · '))))));
    }
    if (!all.length) body.appendChild(el('div', { class: 'empty' }, 'Your wardrobe is empty. Shop on Threadline!'));
  };
  const body = el('div', { class: 'wardrobe' });
  this.openModal(body, { title: 'Wardrobe', icon: '👕', wide: true });
  render();
};

// ------------------------------------------------------------------ book reader
P.openBook = function (inst, { onPage, onFinish }) {
  const u = inst.def.use;
  const pages = u.pages || 10;
  const comic = inst.def.use.type === 'comic';
  let page = inst.st.page || 0;
  const wrap = el('div', { class: 'book' + (comic ? ' comic' : '') });
  const render = () => {
    wrap.innerHTML = '';
    const left = el('div', { class: 'bk-page' }), right = el('div', { class: 'bk-page' });
    const fill = (pg, n) => {
      if (n >= pages) { pg.appendChild(el('div', { class: 'bk-end' }, '— The End —')); return; }
      if (comic) { pg.appendChild(comicPage(inst.def.id, n, u)); }
      else {
        if (n === 0) pg.appendChild(el('div', { class: 'bk-title' }, inst.def.name, el('div', { class: 'bk-auth' }, u.author || inst.def.brand || '')));
        for (const p of bookText(inst.def, n)) pg.appendChild(el('p', {}, p));
      }
      pg.appendChild(el('div', { class: 'bk-num' }, String(n + 1)));
    };
    fill(left, page); fill(right, page + 1);
    wrap.append(el('div', { class: 'bk-spread' }, left, right), el('div', { class: 'bk-nav' },
      el('button', { class: 'btn', onclick: () => { if (page > 0) { page -= 2; inst.st.page = page; G.audio.play('pageturn'); render(); } } }, '← Prev'),
      el('div', { class: 'bk-prog' }, `${Math.min(pages, page + 2)} / ${pages}`),
      el('button', { class: 'btn primary', onclick: () => {
        if (page + 2 >= pages) { onFinish?.(); inst.st.page = 0; this.closeModal(); return; }
        page += 2; inst.st.page = page; onPage?.(); onPage?.(); render();
      } }, page + 2 >= pages ? 'Finish ✓' : 'Next →')));
  };
  this.openModal(wrap, { title: inst.def.name, icon: comic ? '💥' : '📖', wide: true, cls: 'book-modal' });
  render();
  const onKey = (e) => { if (!this.modal) { window.removeEventListener('keydown', onKey); return; } if (e.code === 'ArrowRight') wrap.querySelector('.btn.primary')?.click(); if (e.code === 'ArrowLeft') wrap.querySelector('.btn')?.click(); };
  window.addEventListener('keydown', onKey);
};

function comicPage(id, n, u) {
  const c = document.createElement('canvas'); c.width = 360; c.height = 480;
  const ctx = c.getContext('2d');
  const rnd = seeded(id + ':' + n);
  ctx.fillStyle = '#fffdf6'; ctx.fillRect(0, 0, 360, 480);
  const panels = [[10, 10, 340, 150], [10, 170, 165, 150], [185, 170, 165, 150], [10, 330, 340, 140]];
  const pal = u.palette || ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
  const lines = u.lines || ['POW!', 'Not today!', 'Wait… is that…', 'To be continued!', 'ZAP!', 'We need pizza.', 'KA-BLAM!', 'The city needs us.'];
  for (const [x, y, w, h] of panels) {
    ctx.fillStyle = pal[Math.floor(rnd() * pal.length)]; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 18; i++) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x + rnd() * w, y + rnd() * h, 3, 0, 7); ctx.fill(); }
    const cx = x + w * (0.3 + rnd() * 0.4), cy = y + h * 0.65;
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx, cy - 30, 16, 0, 7); ctx.fill(); ctx.fillRect(cx - 14, cy - 14, 28, 40);
    ctx.fillStyle = pal[Math.floor(rnd() * pal.length)]; ctx.fillRect(cx - 14, cy - 10, 28, 12);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    const bx = x + 10, by = y + 10; const txt = lines[Math.floor(rnd() * lines.length)];
    ctx.font = 'bold 15px "Comic Sans MS", Inter, sans-serif';
    const tw = ctx.measureText(txt).width + 16;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw, 28, 10) : ctx.rect(bx, by, tw, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.fillText(txt, bx + 8, by + 19);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
  }
  const img = new Image(); img.src = c.toDataURL(); img.className = 'comic-img';
  return img;
}

// ------------------------------------------------------------------ journal
P.openJournal = function (inst, onSave) {
  const ta = el('textarea', { class: 'journal-ta', placeholder: 'Dear diary… today I stayed in. Again. It was great.' });
  ta.addEventListener('keydown', (e) => e.stopPropagation());
  const past = (inst.st.entries || []).slice(-6).reverse();
  const body = el('div', { class: 'journal' },
    el('div', { class: 'j-date' }, `${G.clock.dayName}, Day ${G.clock.day} · ${G.clock.fmt()}`),
    ta,
    el('button', { class: 'btn primary', onclick: () => { onSave(ta.value); this.closeModal(); } }, 'Save entry'),
    past.length ? el('div', { class: 'sec' }, 'Past entries') : null,
    ...past.map((e) => el('div', { class: 'j-entry' }, el('div', { class: 'j-h' }, `Day ${e.day} · ${e.time}`), el('div', {}, e.text))),
  );
  this.openModal(body, { title: inst.def.name, icon: '📓', cls: 'journal-modal' });
  setTimeout(() => ta.focus(), 50);
};

// ------------------------------------------------------------------ painting
P.openPainter = function ({ onDone, onCancel }) {
  const W = 320, H = 400;
  const c = el('canvas', { width: W, height: H, class: 'paint-canvas' });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, W, H);
  let color = '#e63946', size = 10, drawing = false, last = null, tool = 'brush';
  const palette = ['#1d1d1d', '#ffffff', '#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#8ecae6', '#219ebc', '#a259ff', '#ff70a6', '#6a994e', '#bc6c25', '#7f5539'];
  const pos = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  c.addEventListener('mousedown', (e) => { drawing = true; last = pos(e); if (tool === 'fill') { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); drawing = false; } else stroke(last, last); });
  window.addEventListener('mouseup', () => (drawing = false));
  c.addEventListener('mousemove', (e) => { if (!drawing) return; const p = pos(e); stroke(last, p); last = p; });
  const stroke = (a, b) => {
    ctx.strokeStyle = tool === 'eraser' ? '#fbfaf6' : color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (tool === 'spray') { ctx.fillStyle = color; for (let i = 0; i < 14; i++) { const ang = Math.random() * 6.28, r = Math.random() * size * 1.5; ctx.globalAlpha = 0.5; ctx.fillRect(b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r, 1.6, 1.6); } ctx.globalAlpha = 1; return; }
    ctx.globalAlpha = tool === 'water' ? 0.15 : 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalAlpha = 1;
  };
  const title = el('input', { class: 'paint-title', placeholder: 'Title your masterpiece', value: '' });
  title.addEventListener('keydown', (e) => e.stopPropagation());
  const tools = el('div', { class: 'paint-tools' },
    ...['brush', 'water', 'spray', 'eraser', 'fill'].map((t) => el('button', { class: 'chip' + (t === tool ? ' on' : ''), onclick: (e) => { tool = t; tools.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); } }, { brush: '🖌️ Brush', water: '💧 Watercolor', spray: '🫧 Spray', eraser: '🧽 Eraser', fill: '🪣 Fill' }[t])),
    (() => { const r = el('input', { type: 'range', min: 2, max: 40, value: size }); r.addEventListener('input', () => (size = +r.value)); return r; })(),
  );
  const pal = el('div', { class: 'paint-pal' }, ...palette.map((p) => el('button', { class: 'sw', style: { background: p }, onclick: () => { color = p; } })));
  let done = false;
  const body = el('div', { class: 'painter' }, c, el('div', { class: 'paint-side' }, tools, pal, title,
    el('button', { class: 'btn primary', onclick: () => { done = true; const url = c.toDataURL('image/jpeg', 0.85); this.closeModal(); onDone(url, title.value.trim()); } }, 'Finish painting'),
    el('div', { class: 'tip' }, 'Your painting becomes a framed artwork you can hang anywhere.'),
  ));
  this.openModal(body, { title: 'Easel', icon: '🎨', wide: true, onClose: () => { if (!done) onCancel?.(); } });
};

// ------------------------------------------------------------------ games
P.openGameLibrary = function ({ console: con = null, tv = null, handheld = null } = {}) {
  const platform = handheld ? 'handheld' : con ? 'console' : 'pc';
  const lib = G.games.library(platform);
  const grid = el('div', { class: 'game-lib' });
  for (const g of lib) {
    grid.appendChild(el('div', { class: 'gl-card', style: { background: `linear-gradient(145deg, ${g.color || '#333'}, #111)` }, onclick: () => { this.closeModal(true); if (tv && !tv.st.on) G.behaviorsRaw?.tv?.power(tv, true); G.games.launch(g.id, { source: con || handheld }); } },
      el('div', { class: 'gl-ico' }, g.icon || '🎮'), el('div', { class: 'gl-t' }, g.title), el('div', { class: 'gl-g' }, g.genre || ''), el('div', { class: 'gl-b' }, `Best: ${G.state.flags.highscores?.[g.id] || 0}`)));
  }
  if (!lib.length) grid.appendChild(el('div', { class: 'empty' }, 'No games yet! Buy some from Volt.'));
  const streamOk = G.games.canStream();
  this.openModal(el('div', {}, el('div', { class: 'tip' }, `${lib.length} games in your library. ${streamOk ? (G.state.flags.streaming ? '🔴 Streaming is ON — you\'ll earn tips while playing.' : 'Turn on streaming in Settings to earn tips while playing.') : 'Get a webcam + microphone to stream your games for tips.'}`), grid), { title: handheld ? 'Handheld' : con ? con.def.name : 'Games', icon: '🎮', wide: true });
};

// ------------------------------------------------------------------ trading cards reveal
P.cardReveal = function (set, pulls) {
  const row = el('div', { class: 'card-reveal' });
  pulls.forEach((c, i) => {
    const r = RARITY[c.rarity];
    const card = el('div', { class: 'rcard r-' + c.rarity, style: { '--r': r.color, animationDelay: `${i * 0.35}s` } },
      el('div', { class: 'rc-inner' }, el('div', { class: 'rc-back' }, '✦'), el('div', { class: 'rc-front' }, el('div', { class: 'rc-art', style: { background: `linear-gradient(160deg, ${c.color || r.color}, #111)` } }, c.emoji || '✨'), el('div', { class: 'rc-name' }, c.name), el('div', { class: 'rc-rar' }, r.label), el('div', { class: 'rc-val' }, fmtMoney(c.value || 1)))));
    card.addEventListener('click', () => card.classList.add('flip'));
    setTimeout(() => { card.classList.add('flip'); G.audio.play(['epic', 'legendary'].includes(c.rarity) ? 'legendary' : 'paper'); if (c.rarity === 'legendary') G.particles.confetti(G.camera.position.clone(), 40); }, 700 + i * 450);
    row.appendChild(card);
  });
  this.openModal(el('div', {}, row, el('div', { class: 'tip' }, 'Cards are stored in your Collection app. Rare pulls can be worth a lot!')), { title: `${set.name} — Booster`, icon: '🃏', wide: true });
};

void clamp;
