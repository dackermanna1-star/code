// Shopping app shared by every retailer: storefronts, restaurants, search,
// product pages, cart & checkout, plus Stockpile's live resale market.
import { G } from '../../game.js';
import { el, fmtMoney, seeded, hashStr, clamp } from '../../core/utils.js';
import { STORES, RESTAURANTS } from '../../shop/stores.js';
import { ITEMS, CATEGORIES, RARITY, defBounds } from '../../items/registry.js';
import { thumbImg } from '../thumbs.js';
import { STATIONS } from '../../core/music.js';

export function rating(def) {
  const r = seeded(hashStr(def.id));
  return { stars: Math.round((3.9 + r() * 1.1) * 10) / 10, count: Math.floor(20 + r() * r() * 4000) };
}

const USE_TEXT = {
  eat: (u) => `Eat it — ${u.bites || 4} bites`, drink: (u) => `Drink it — ${u.sips || 5} sips${u.hot ? ', served hot' : ''}`,
  wear: (u) => `Wear it (${u.slot}) — shows up in mirrors & selfies`, light: (u) => `Lights up the room${u.smart ? ' · smart color modes' : ''}`, lamp: () => 'Lights up the room',
  seat: () => 'Sit, relax & recharge comfort', bed: () => 'Sleep, nap & lounge', tv: () => '10 channels · plays console games', console: (u) => `Play games on your TV${u.bundled ? ' · ' + u.bundled.length + ' games included' : ''}`,
  game: () => 'Adds a new game to your library', computer: () => 'Shop, freelance gigs, trading & PC gaming', speaker: () => 'Streams 8 music stations', radio: () => 'Streams music stations', turntable: () => 'Spins your vinyl collection',
  vinyl: (u) => `Vinyl record · ${STATIONS[u.station]?.name || 'music'} vibes`, plant: () => 'Grows when watered · boosts room comfort', wateringcan: () => 'Waters plants · refill at a sink', candle: (u) => `Light it for cozy vibes${u.scent ? ' · ' + u.scent : ''}`,
  diffuser: () => 'Mists a calming scent', clock: () => 'Shows the time', neon: () => 'Glows in neon · switch on/off', fan: () => 'Spins & cools you down', aquarium: () => 'Feed & watch your fish', vacuum: () => 'Cleans the floor by itself', projector: () => 'Projects a galaxy on the ceiling', decor: () => 'Decor — boosts comfort where placed',
  station: (u) => `Makes: ${(u.recipes || []).map((r) => ITEMS[r.makes]?.name || r.label).join(', ')}`, toothbrush: () => 'Brush your teeth at a sink', toothpaste: (u) => `${u.uses} brushes`, spray: (u) => `Spritz it on${u.scent ? ' · ' + u.scent : ''}`, soap: (u) => `Wash up at a sink · ${u.uses} uses`,
  shampoo: (u) => `Used automatically in the shower · ${u.uses} washes`, bodywash: (u) => `Used automatically in the shower · ${u.uses} washes`, conditioner: (u) => `Used in the shower · ${u.uses} washes`, skincare: () => 'Apply for a glow-up', bathbomb: () => 'Drop it in the bathtub for a fizzy color bath',
  spinner: () => 'Flick it and watch it spin', bubbles: () => 'Blow real floating bubbles', ball: () => 'Toss it, kick it, bounce it', yoyo: () => 'Walk the dog', squeak: () => 'Squeeze it', squish: () => 'Squish it to de-stress', cube: () => 'Twist it until it\'s solved', snowglobe: () => 'Shake it and watch it snow',
  glider: () => 'Throw it — it glides!', eightball: () => 'Ask it anything', instrument: () => 'Play it & practice to level up', cradle: () => 'Set the balls swinging', dice: () => 'Roll it', cards: () => 'Shuffle, draw, play solitaire', slinky: () => 'Bounce it', kendama: () => 'Try tricks', top: () => 'Spin it on a table', clicker: () => 'Click it endlessly', kaleidoscope: () => 'Look through it',
  blindbox: () => 'Open to reveal a random figure from the series', cardpack: (u) => `Rip open for ${u.count || 5} random cards`, rc: (u) => `Drive it around your apartment${u.drone ? ' (it flies!)' : ''}`,
  book: (u) => `Read it — ${u.pages || 10} pages · ${u.genre || 'book'}`, comic: () => 'Read it', magazine: () => 'Flip through it', ereader: () => 'Read on it', cookbook: (u) => `Teaches ${u.recipes?.length || 0} stove recipes`, easel: () => 'Paint your own artwork to hang', journal: () => 'Write daily entries',
  project: (u) => `Build it over ${u.sessions || 3} sessions${u.produces ? ' — makes ' + (ITEMS[u.produces]?.name || 'something') : ''}`, workout: () => 'Work out for an endorphin boost', meditate: () => 'Meditate to restore energy & calm', boardgame: () => 'Play a round',
  telescope: () => 'Spot things across the city', camera: () => 'Take photos for your gallery', headphones: () => 'Listen to music anywhere', vr: () => 'Dive into a VR game', arcade: (u) => `Play ${u.title || 'arcade games'}`, handheld: () => 'Play games anywhere', smartspeaker: () => 'Ask it things · plays music', ingredient: (u) => `Cooking ingredient${u.uses ? ' · ' + u.uses + ' uses' : ''}`,
  package: () => 'A package', bedding: () => 'Put it on your bed',
  drawers: (u) => `Stores up to ${u.capacity || 12} of your things`, table: () => 'A surface for your stuff · tidy it up',
  hairdryer: () => 'Style your hair · fresh-out-of-the-salon buff', vitamins: (u) => `Take one a day${u.uses ? ' · ' + u.uses + ' doses' : ''}`,
  jukebox: () => 'Plays music stations · neon pulses to the beat', streamgear: () => 'Go live from your desk (webcam + mic)', chess: () => 'Play chess · keeps your win record',
};
export function useText(def) {
  const u = def.use;
  const lines = [];
  if (u) { const f = USE_TEXT[u.type]; if (f) lines.push(f(u)); }
  const n = u?.needs;
  if (n) lines.push(Object.entries(n).filter(([, v]) => v > 0).map(([k, v]) => `+${Math.round(v)} ${k}`).join(' · '));
  if (u?.buff) lines.push(`Buff: ${u.buff.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  if (def.place === 'wall') lines.push('Hang it on any wall');
  else if (def.furniture) lines.push('Furniture — arrange it anywhere');
  else if (['decor', 'art', 'collectibles', 'plants', 'lighting'].includes(def.category)) lines.push('Display it on any surface');
  return lines.filter(Boolean);
}

function stars(r) { const full = Math.floor(r.stars); return '★'.repeat(full) + (r.stars - full >= 0.5 ? '½' : '') + ` ${r.stars} (${r.count.toLocaleString()})`; }

function priceTag(def, store) {
  const p = G.market.price(def, store);
  const d = store === 'stockpile' ? 0 : G.market.discount(def, store);
  return el('div', { class: 'price' }, d > 0 ? el('s', {}, fmtMoney(def.price)) : null, el('b', {}, fmtMoney(p)), d > 0 ? el('span', { class: 'off' }, `-${Math.round(d * 100)}%`) : null);
}

function header(ctx, title, store, extra = null) {
  const s = STORES[store];
  const count = G.orders.cartCount(store);
  return el('div', { class: 'app-head', style: { '--c': s.color, '--c2': s.color2 } },
    el('button', { class: 'ah-back', onclick: ctx.back }, '‹'),
    el('div', { class: 'ah-title' }, el('span', { class: 'ah-logo' }, s.logo), title),
    extra,
    el('button', { class: 'ah-cart', onclick: () => ctx.push('cart', { store }) }, '🛒', count ? el('span', { class: 'badge' }, String(count)) : null),
  );
}

function productCard(def, store, ctx, { compact = false } = {}) {
  const r = RARITY[def.rarity];
  const drop = def.limited && G.market.dropActive(def);
  const card = el('div', { class: 'p-card' + (compact ? ' compact' : ''), onclick: () => ctx.push('product', { store, id: def.id }) },
    el('div', { class: 'p-img' }, thumbImg(def, 192), def.rarity !== 'common' ? el('span', { class: 'p-rar', style: { background: r.color } }, r.label) : null, drop ? el('span', { class: 'p-drop' }, `🔥 ${G.state.market.drop.stock} left`) : null, G.items.countOwned(def.id) ? el('span', { class: 'p-own' }, `Owned ×${G.items.countOwned(def.id)}`) : G.market.isNew(def) ? el('span', { class: 'p-new' }, 'NEW') : null),
    el('div', { class: 'p-name' }, def.name),
    priceTag(def, store),
    el('button', { class: 'p-add', onclick: (e) => { e.stopPropagation(); G.orders.addToCart(store, def.id); ctx.refresh(); G.ui.toast(`Added ${def.name}`, { icon: '🛒', duration: 1.4 }); } }, '+'),
  );
  return card;
}

export const store = {
  render(root, ctx) {
    const { store: sid, restaurant, cat, search, tab } = ctx.arg;
    const s = STORES[sid];
    const all = G.market.itemsFor(sid);
    root.style.setProperty('--c', s.color);
    root.classList.add('shop', 'k-' + s.kind);
    // search box
    const searchBox = el('input', { class: 'search', placeholder: `Search ${s.name}`, value: search || '' });
    searchBox.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ctx.push('store', { store: sid, search: searchBox.value }); });
    root.appendChild(header(ctx, restaurant ? RESTAURANTS[restaurant].name : s.name, sid));
    const body = el('div', { class: 'app-body' });
    root.appendChild(body);
    if (sid === 'stockpile' && !restaurant && !cat && !search) {
      body.appendChild(el('div', { class: 'tabs' }, el('button', { class: tab !== 'sell' ? 'on' : '', onclick: () => ctx.push('store', { store: sid }) }, 'Buy'), el('button', { class: tab === 'sell' ? 'on' : '', onclick: () => ctx.push('store', { store: sid, tab: 'sell' }) }, 'Sell')));
      if (tab === 'sell') { renderSell(body, ctx); return; }
    }
    body.appendChild(el('div', { class: 'searchrow' }, searchBox));
    let list = all;
    if (search) { const q = search.toLowerCase(); list = all.filter((d) => d.name.toLowerCase().includes(q) || (d.desc || '').toLowerCase().includes(q) || d.category.includes(q)); body.appendChild(el('div', { class: 'sec' }, `${list.length} results for "${search}"`)); }
    if (restaurant) {
      const r = RESTAURANTS[restaurant];
      body.appendChild(el('div', { class: 'r-hero', style: { background: `linear-gradient(135deg, ${r.color}, ${r.color}99)` } }, el('div', { class: 'r-emo' }, r.emoji), el('div', {}, el('div', { class: 'r-n' }, r.name), el('div', { class: 'r-m' }, `★ ${r.rating} · ${r.cuisine} · ${s.delivery[0]}–${s.delivery[1]} min`))));
      list = all.filter((d) => d.restaurant === restaurant);
    } else if (cat) {
      list = all.filter((d) => d.category === cat);
      body.appendChild(el('div', { class: 'sec' }, CATEGORIES[cat]?.label || cat));
    } else if (!search) {
      // storefront: hero, deals, restaurants or categories
      const flash = G.market.flashSale();
      const drop = G.market.currentDrop();
      body.appendChild(el('div', { class: 'hero', style: { background: `linear-gradient(135deg, ${s.color}, ${s.color2})` } }, el('div', { class: 'h-t' }, s.tagline), el('div', { class: 'h-s' }, s.fee ? `Delivery ${fmtMoney(s.fee)}${s.freeOver ? ` · free over ${fmtMoney(s.freeOver)}` : ''}` : 'Free delivery', ` · ${s.delivery[0]}–${s.delivery[1]} min`)));
      if (flash && flash.store === sid) body.appendChild(el('div', { class: 'flash' }, `⚡ FLASH SALE: ${Math.round(flash.pct * 100)}% off everything · ends in ${G.clock.fmtDuration(flash.until - G.clock.total)}`));
      if (drop && ITEMS[drop.id]?.stores.includes(sid)) {
        const d = ITEMS[drop.id];
        const live = G.market.dropActive(d);
        const soon = G.clock.total < drop.start;
        body.appendChild(el('div', { class: 'dropcard', onclick: () => live && ctx.push('product', { store: sid, id: d.id }) }, thumbImg(d, 128), el('div', {}, el('div', { class: 'dc-k' }, live ? '🔥 LIMITED DROP — LIVE NOW' : soon ? `⏰ DROPS AT 6:00 PM (${G.clock.fmtDuration(drop.start - G.clock.total)})` : 'SOLD OUT'), el('div', { class: 'dc-n' }, d.name), el('div', { class: 'dc-s' }, live ? `${drop.stock} left · ${fmtMoney(G.market.price(d, sid))}` : 'Limited stock · resells for more on Stockpile'))));
      }
      const deals = Object.entries(G.market.deals(sid)).map(([id]) => ITEMS[id]).filter(Boolean);
      if (deals.length) {
        body.appendChild(el('div', { class: 'sec' }, '🏷️ Today\'s deals'));
        const row = el('div', { class: 'hscroll' }); deals.forEach((d) => row.appendChild(productCard(d, sid, ctx, { compact: true }))); body.appendChild(row);
      }
      const fresh = all.filter((d) => G.market.isNew(d) && !d.limited).slice(0, 8);
      if (fresh.length) {
        body.appendChild(el('div', { class: 'sec' }, '✨ New arrivals'));
        const row = el('div', { class: 'hscroll' }); fresh.forEach((d) => row.appendChild(productCard(d, sid, ctx, { compact: true }))); body.appendChild(row);
      }
      if (s.restaurants) {
        body.appendChild(el('div', { class: 'sec' }, s.kind === 'food' ? 'Restaurants near you' : 'Shops'));
        for (const [rid, r] of Object.entries(RESTAURANTS)) {
          if (r.store !== sid) continue;
          const n = all.filter((d) => d.restaurant === rid).length;
          if (!n) continue;
          body.appendChild(el('div', { class: 'r-card', onclick: () => ctx.push('store', { store: sid, restaurant: rid }) }, el('div', { class: 'r-img', style: { background: `linear-gradient(135deg, ${r.color}, ${r.color}88)` } }, r.emoji), el('div', { class: 'r-info' }, el('div', { class: 'r-n' }, r.name), el('div', { class: 'r-m' }, `★ ${r.rating} · ${r.cuisine} · ${n} items`))));
        }
        const loose = all.filter((d) => !d.restaurant);
        if (loose.length) { body.appendChild(el('div', { class: 'sec' }, 'More')); const g = el('div', { class: 'p-grid' }); loose.forEach((d) => g.appendChild(productCard(d, sid, ctx))); body.appendChild(g); }
        return;
      }
      const cats = [...new Set(all.map((d) => d.category))];
      if (cats.length > 1) {
        const chips = el('div', { class: 'chips' });
        for (const c of cats) chips.appendChild(el('button', { class: 'chip', onclick: () => ctx.push('store', { store: sid, cat: c }) }, `${CATEGORIES[c]?.icon || ''} ${CATEGORIES[c]?.label || c}`));
        body.appendChild(chips);
      }
      body.appendChild(el('div', { class: 'sec' }, sid === 'stockpile' ? '📈 Market' : 'Popular'));
    }
    const grid = el('div', { class: 'p-grid' });
    const sorted = [...list].sort((a, b) => (G.state.discovered[a.id] ? 1 : 0) - (G.state.discovered[b.id] ? 1 : 0) || a.price - b.price);
    sorted.forEach((d) => grid.appendChild(productCard(d, sid, ctx)));
    if (!list.length) grid.appendChild(el('div', { class: 'empty' }, 'Nothing here right now.'));
    body.appendChild(grid);
  },
};

function renderSell(body, ctx) {
  const mine = G.items.owned().filter((i) => G.market.resellable(i.def) && i.data.loc !== 'worn' && i.data.loc !== 'hand');
  body.appendChild(el('div', { class: 'sec' }, 'Your sellable items'));
  if (!mine.length) { body.appendChild(el('div', { class: 'empty' }, 'You don\'t own anything resellable yet. Sneakers, collectibles and limited drops can be flipped here.')); return; }
  const groups = {};
  for (const i of mine) (groups[i.def.id] ||= []).push(i);
  for (const list of Object.values(groups)) {
    const d = list[0].def;
    const price = G.market.sellPrice(d);
    body.appendChild(el('div', { class: 'sell-row' }, thumbImg(d, 96), el('div', { class: 'sr-i' }, el('div', { class: 'sr-n' }, d.name), el('div', { class: 'sr-m' }, `You own ${list.length} · retail ${fmtMoney(d.price)}`), sparkline(G.market.history(d, 10))),
      el('button', { class: 'btn', onclick: async () => {
        const ok = await G.ui.choose(`Sell ${d.name} for ${fmtMoney(price)}?`, [{ label: `Sell for ${fmtMoney(price)}`, value: true, primary: true, sub: 'Includes Stockpile\'s 10% seller fee' }, { label: 'Keep it', value: false }], { icon: '📈' });
        if (!ok) { G.phone.show(); return; }
        const inst = list[0];
        G.items.destroy(inst);
        G.wallet.earn(price, `Sold ${d.name}`);
        G.events.emit('act', 'sell', { item: d.id, price });
        G.phone.show();
      } }, `Sell ${fmtMoney(price)}`)));
  }
}

function sparkline(hist) {
  const w = 120, h = 30;
  const vals = hist.map((p) => p.v);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - ((v - mn) / Math.max(0.01, mx - mn)) * (h - 4) - 2}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('class', 'spark');
  s.innerHTML = `<polyline points="${pts}" fill="none" stroke="${up ? '#22c55e' : '#ef4444'}" stroke-width="2"/>`;
  return s;
}

export const product = {
  render(root, ctx) {
    const { store: sid, id } = ctx.arg;
    const def = ITEMS[id];
    const s = STORES[sid];
    root.classList.add('shop');
    root.appendChild(header(ctx, s.name, sid));
    const body = el('div', { class: 'app-body' });
    root.appendChild(body);
    defBounds(def);
    const r = rating(def);
    const rr = RARITY[def.rarity];
    let qty = 1;
    const qtyEl = el('span', { class: 'qty-n' }, '1');
    const owned = G.items.countOwned(id);
    body.append(
      el('div', { class: 'pd-img' }, thumbImg(def, 320)),
      el('div', { class: 'pd-name' }, def.name),
      el('div', { class: 'pd-meta' }, el('span', { style: { color: rr.color } }, rr.label), ` · ${CATEGORIES[def.category]?.label || def.category}`, def.brand ? ` · ${def.brand}` : '', def.restaurant ? ` · ${RESTAURANTS[def.restaurant]?.name}` : ''),
      el('div', { class: 'pd-stars' }, stars(r)),
      priceTag(def, sid),
      el('div', { class: 'pd-desc' }, def.desc || ''),
      el('div', { class: 'pd-uses' }, ...useText(def).map((t) => el('div', { class: 'pd-use' }, '✓ ', t))),
      owned ? el('div', { class: 'pd-owned' }, `You own ${owned}`) : null,
    );
    if (G.market.resellable(def)) {
      body.appendChild(el('div', { class: 'pd-market' }, el('div', {}, el('div', { class: 'k' }, 'Market value'), el('div', { class: 'v' }, fmtMoney(G.market.marketValue(def)))), sparkline(G.market.history(def, 14))));
    }
    if (def.limited && !G.market.dropActive(def)) { body.appendChild(el('div', { class: 'flash' }, 'This is a limited release. Watch for drops at 6 PM!')); return; }
    body.appendChild(el('div', { class: 'pd-buy' },
      el('div', { class: 'qty' }, el('button', { onclick: () => { qty = clamp(qty - 1, 1, 20); qtyEl.textContent = qty; } }, '−'), qtyEl, el('button', { onclick: () => { qty = clamp(qty + 1, 1, 20); qtyEl.textContent = qty; } }, '+')),
      el('button', { class: 'btn primary', style: { background: s.color }, onclick: () => { G.orders.addToCart(sid, id, qty); G.ui.toast(`Added ${qty}× ${def.name}`, { icon: '🛒', duration: 1.5 }); ctx.back(); } }, 'Add to cart'),
      el('button', { class: 'btn', onclick: () => { G.orders.addToCart(sid, id, qty); ctx.push('cart', { store: sid }); } }, 'Buy now'),
    ));
  },
};

export const cart = {
  render(root, ctx) {
    const sid = ctx.arg.store;
    const s = STORES[sid];
    root.classList.add('shop');
    root.appendChild(header(ctx, 'Your cart', sid));
    const body = el('div', { class: 'app-body' });
    root.appendChild(body);
    const opts = (cart.opts ||= {});
    opts.tipPct ??= s.kind === 'food' ? 0.15 : 0;
    const lines = G.orders.cart(sid).filter((l) => ITEMS[l.id]);
    if (!lines.length) { body.appendChild(el('div', { class: 'empty big' }, '🛒', el('div', {}, 'Your cart is empty'), el('button', { class: 'btn', onclick: ctx.back }, 'Keep shopping'))); return; }
    for (const l of lines) {
      const d = ITEMS[l.id];
      body.appendChild(el('div', { class: 'c-line' }, thumbImg(d, 96), el('div', { class: 'c-i' }, el('div', { class: 'c-n' }, d.name), el('div', { class: 'c-p' }, fmtMoney(G.market.price(d, sid)))),
        el('div', { class: 'qty' }, el('button', { onclick: () => { G.orders.setQty(sid, l.id, l.qty - 1); ctx.refresh(); } }, l.qty === 1 ? '🗑' : '−'), el('span', { class: 'qty-n' }, String(l.qty)), el('button', { onclick: () => { G.orders.setQty(sid, l.id, l.qty + 1); ctx.refresh(); } }, '+'))));
    }
    const sub = G.orders.quote(sid).subtotal;
    const tip = Math.round(sub * opts.tipPct * 100) / 100;
    const q = G.orders.quote(sid, { tip, express: !!opts.express });
    if (s.kind === 'food') {
      const tips = el('div', { class: 'tips' }, el('span', {}, 'Tip your courier'));
      for (const p of [0, 0.1, 0.15, 0.2]) tips.appendChild(el('button', { class: 'chip' + (opts.tipPct === p ? ' on' : ''), onclick: () => { opts.tipPct = p; ctx.refresh(); } }, p ? `${p * 100}%` : 'None'));
      body.appendChild(tips);
    }
    body.appendChild(el('label', { class: 'express' }, el('input', { type: 'checkbox', checked: opts.express ? true : null, onchange: (e) => { opts.express = e.target.checked; ctx.refresh(); } }), ` ⚡ Express delivery (+$4.99, ${q.eta[0]}–${q.eta[1]} min)`));
    const row = (k, v, bold = false) => el('div', { class: 'q-row' + (bold ? ' b' : '') }, el('span', {}, k), el('span', {}, v));
    body.appendChild(el('div', { class: 'quote' },
      row('Subtotal', fmtMoney(q.subtotal)),
      row('Delivery', q.fee ? fmtMoney(q.fee) : 'FREE'),
      q.service ? row('Service fee', fmtMoney(q.service)) : null,
      row('Tax', fmtMoney(q.tax)),
      q.tip ? row('Tip', fmtMoney(q.tip)) : null,
      q.expressFee ? row('Express', fmtMoney(q.expressFee)) : null,
      row('Total', fmtMoney(q.total), true),
      el('div', { class: 'q-eta' }, `Arrives in ${q.eta[0]}–${q.eta[1]} min · Balance after: ${fmtMoney(G.state.money - q.total)}`),
    ));
    const afford = G.wallet.canAfford(q.total);
    body.appendChild(el('button', { class: 'btn primary big', style: { background: afford ? s.color : '#888' }, onclick: () => {
      const res = G.orders.checkout(sid, { tip: q.tip, express: !!opts.express });
      if (!res.ok) { G.ui.toast(res.reason, { kind: 'bad', icon: '💸' }); G.audio.play('error'); return; }
      ctx.push('confirm', { store: sid, order: res.order.id });
    } }, afford ? `Place order · ${fmtMoney(q.total)}` : 'Not enough money'));
  },
};

export const confirm = {
  render(root, ctx) {
    const s = STORES[ctx.arg.store];
    const o = G.state.orders.find((x) => x.id === ctx.arg.order);
    root.appendChild(el('div', { class: 'confirm', style: { '--c': s.color } },
      el('div', { class: 'cf-check' }, '✓'),
      el('div', { class: 'cf-t' }, 'Order placed!'),
      el('div', { class: 'cf-s' }, `${s.name} #${o?.id} · ${o?.items.length} item${o?.items.length > 1 ? 's' : ''}`),
      el('div', { class: 'cf-eta' }, o ? `Arriving around ${G.clock.fmt(o.eta)}` : ''),
      el('div', { class: 'cf-hint' }, 'We\'ll ring the doorbell. Packages are left on your doormat.'),
      el('button', { class: 'btn', onclick: () => ctx.phone ? ctx.phone.openApp('orders') : ctx.back() }, 'Track order'),
      el('button', { class: 'btn ghost', onclick: () => ctx.phone ? ctx.phone.openApp(ctx.arg.store) : ctx.back() }, 'Keep shopping'),
    ));
    G.audio.play('success');
  },
};
