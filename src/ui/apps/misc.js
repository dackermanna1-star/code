// System apps: orders, messages, wallet, goals, smart home, music, weather,
// storage, collection, camera, photos, quick gigs and settings.
import { G } from '../../game.js';
import { el, fmtMoney, clamp, pick } from '../../core/utils.js';
import { STORES } from '../../shop/stores.js';
import { ITEMS, CATEGORIES, RARITY } from '../../items/registry.js';
import { CONTAINERS } from '../../items/container.js';
import { thumbImg } from '../thumbs.js';
import { CONTACTS } from '../../progression/messages.js';
import { levelProgress, ACHIEVEMENTS, LEVEL_TITLES } from '../../progression/progress.js';
import { STATIONS } from '../../core/music.js';
import { ROOMS, ROOM_ORDER } from '../../world/apartment.js';
import { FLOORS, PAINTS } from '../../world/finishes.js';
import { SMART_COLORS } from '../../items/behaviors/home.js';
import { setBlinds } from '../../world/fixtures/blinds.js';
import { WEATHER } from '../../world/weather.js';
import { SERIES, CARD_SETS } from '../../items/behaviors/toys.js';
import { WALLPAPERS } from '../phone.js';
import { saveState, wipeSave } from '../../core/state.js';
import { SKIN_TONES, HAIR_STYLES, HAIR_COLORS } from '../../player/avatar.js';
import { SLOTS, SLOT_LABEL } from '../../player/outfit.js';
import { BUFFS } from '../../player/needs.js';

function head(ctx, title, color = '#1c1c1e', right = null) {
  return el('div', { class: 'app-head plain', style: { '--c': color } }, el('button', { class: 'ah-back', onclick: ctx.back }, '‹'), el('div', { class: 'ah-title' }, title), right);
}
function body(root) { const b = el('div', { class: 'app-body' }); root.appendChild(b); return b; }
function sec(t) { return el('div', { class: 'sec' }, t); }
function toggle(on, onchange) { const t = el('button', { class: 'switch' + (on ? ' on' : ''), onclick: () => onchange(!on) }, el('span')); return t; }

export const orders = {
  render(root, ctx) {
    root.appendChild(head(ctx, '🚚 Orders', '#ff9f1c'));
    const b = body(root);
    const act = G.orders.active();
    if (act.length) b.appendChild(sec('On the way'));
    for (const o of act) {
      const s = STORES[o.store]; const st = G.orders.stageOf(o);
      const steps = ['confirmed', 'preparing', 'onway', 'arriving'];
      b.appendChild(el('div', { class: 'ord' },
        el('div', { class: 'o-h' }, el('span', { class: 'o-logo', style: { background: s.color } }, s.logo), el('div', {}, el('div', { class: 'o-n' }, `${s.name} #${o.id}`), el('div', { class: 'o-s' }, `${st.label} · ETA ${G.clock.fmtDuration(o.eta - G.clock.total)}`))),
        el('div', { class: 'o-bar' }, el('div', { style: { width: `${clamp(st.k, 0, 1) * 100}%`, background: s.color } }), el('div', { class: 'o-bike', style: { left: `${clamp(st.k, 0, 1) * 92}%` } }, s.kind === 'food' ? '🛵' : '🚚')),
        el('div', { class: 'o-steps' }, ...steps.map((k, i) => el('span', { class: steps.indexOf(st.key) >= i ? 'on' : '' }, ['Placed', 'Preparing', 'On the way', 'Arriving'][i]))),
        el('div', { class: 'o-items' }, ...o.items.slice(0, 8).map((id) => thumbImg(id, 64))),
      ));
    }
    const past = G.state.orders.filter((o) => o.status === 'delivered').slice(0, 15);
    if (past.length) b.appendChild(sec('Delivered'));
    for (const o of past) {
      const s = STORES[o.store];
      b.appendChild(el('div', { class: 'ord past' }, el('div', { class: 'o-h' }, el('span', { class: 'o-logo', style: { background: s.color } }, s.logo), el('div', {}, el('div', { class: 'o-n' }, `${s.name} #${o.id} · ${fmtMoney(o.total)}`), el('div', { class: 'o-s' }, `${o.items.length} items · Day ${Math.floor(o.deliveredAt / 1440) + 1}`))),
        el('button', { class: 'btn small', onclick: () => { for (const id of o.items) if (ITEMS[id] && G.market.itemsFor(o.store).includes(ITEMS[id])) G.orders.addToCart(o.store, id); ctx.phone ? ctx.phone.push('cart', { store: o.store }) : ctx.push('cart', { store: o.store }); } }, 'Reorder')));
    }
    if (!act.length && !past.length) b.appendChild(el('div', { class: 'empty big' }, '📭', el('div', {}, 'No orders yet. Go treat yourself!')));
    if (act.length) setTimeout(() => { if (G.phone.open && G.phone.stack.at(-1)?.id === 'orders') ctx.refresh(); }, 1000);
  },
};

export const messages = {
  render(root, ctx) {
    const who = ctx.arg?.who;
    G.messages.markRead();
    if (!who) {
      root.appendChild(head(ctx, '💬 Messages', '#34c759'));
      const b = body(root);
      const ids = Object.keys(CONTACTS).sort((a, b2) => (G.messages.thread(b2).at(-1)?.t || 0) - (G.messages.thread(a).at(-1)?.t || 0));
      for (const id of ids) {
        const c = CONTACTS[id]; const th = G.messages.thread(id); const last = th.at(-1);
        b.appendChild(el('div', { class: 'thread-row', onclick: () => ctx.push('messages', { who: id }) }, el('div', { class: 'avatar', style: { background: c.color } }, c.avatar), el('div', { class: 'tr-i' }, el('div', { class: 'tr-n' }, c.name, G.messages.pending(id) ? el('span', { class: 'dot' }) : null), el('div', { class: 'tr-l' }, last ? (last.from === 'me' ? 'You: ' : '') + last.text : 'No messages yet'))));
      }
      return;
    }
    const c = CONTACTS[who];
    root.appendChild(head(ctx, `${c.avatar} ${c.name}`, c.color));
    const b = body(root); b.classList.add('chat');
    for (const m of G.messages.thread(who)) b.appendChild(el('div', { class: 'bubble ' + (m.from === 'me' ? 'me' : 'them') }, m.text));
    const p = G.messages.pending(who);
    if (p) {
      const replies = el('div', { class: 'replies' });
      const opts = G.messages.repliesFor(who);
      opts.forEach((r, i) => replies.appendChild(el('button', { class: 'reply', onclick: () => G.messages.reply(who, i) }, r.label)));
      root.appendChild(replies);
    }
    setTimeout(() => { b.scrollTop = b.scrollHeight; }, 10);
  },
};

export const wallet = {
  render(root, ctx) {
    root.appendChild(head(ctx, '💳 Wallet', '#1c1c1e'));
    const b = body(root);
    const st = G.state;
    b.appendChild(el('div', { class: 'card-visual' }, el('div', { class: 'cv-k' }, 'HOMEBODY CARD'), el('div', { class: 'cv-v' }, fmtMoney(st.money)), el('div', { class: 'cv-n' }, '•••• 2403')));
    b.appendChild(el('div', { class: 'stats2' }, el('div', {}, el('div', { class: 'k' }, 'Earned'), el('div', { class: 'v up' }, fmtMoney(st.stats.earned))), el('div', {}, el('div', { class: 'k' }, 'Spent'), el('div', { class: 'v down' }, fmtMoney(st.stats.spent)))));
    b.appendChild(el('div', { class: 'tip' }, '💡 Earn money with freelance gigs on your computer, quick surveys in the Gigs app, streaming games (needs a webcam & mic), flipping items on Stockpile, daily challenges — and your royalties deposit every morning.'));
    b.appendChild(sec('Recent activity'));
    for (const t of (st.transactions || []).slice(0, 40)) b.appendChild(el('div', { class: 'tx' }, el('span', {}, t.label), el('span', { class: t.amount >= 0 ? 'up' : 'down' }, (t.amount >= 0 ? '+' : '') + fmtMoney(t.amount))));
  },
};

export const goals = {
  render(root, ctx) {
    root.appendChild(head(ctx, '🏆 Goals', '#ff2d55'));
    const b = body(root);
    const lp = levelProgress();
    b.appendChild(el('div', { class: 'lvl' }, el('div', { class: 'lv-n' }, `Level ${lp.level}`), el('div', { class: 'lv-t' }, lp.title), el('div', { class: 'lv-bar' }, el('div', { style: { width: `${clamp(lp.frac, 0, 1) * 100}%` } })), el('div', { class: 'lv-x' }, `${G.state.xp} / ${lp.next} XP · next: ${LEVEL_TITLES[lp.level] || '—'}`)));
    const mood = G.needs.moodLabel();
    b.appendChild(el('div', { class: 'moodcard' }, `${mood.icon} You feel ${mood.label.toLowerCase()} · earnings ×${G.needs.earnMult().toFixed(2)}`));
    const buffs = G.needs.activeBuffs();
    if (buffs.length) { b.appendChild(sec('Active moodlets')); b.appendChild(el('div', { class: 'bufflist' }, ...buffs.map((x) => el('div', { class: 'bf' + (BUFFS[x.id].negative ? ' neg' : '') }, `${BUFFS[x.id].icon} ${BUFFS[x.id].label}`, el('span', {}, G.clock.fmtDuration(x.until - G.clock.total)))))); }
    b.appendChild(sec(`Daily challenges · Day ${G.clock.day}`));
    for (const d of G.goals.dailyDefs()) b.appendChild(el('div', { class: 'goal' + (d.state.done ? ' done' : '') }, el('div', { class: 'g-i' }, d.icon), el('div', { class: 'g-b' }, el('div', { class: 'g-t' }, d.text), el('div', { class: 'g-bar' }, el('div', { style: { width: `${clamp(d.state.progress / d.n, 0, 1) * 100}%` } })), el('div', { class: 'g-r' }, `${Math.min(d.state.progress, d.n)}/${d.n} · +${fmtMoney(d.money)} · +${d.xp} XP`)), d.state.done ? el('div', { class: 'g-ok' }, '✓') : null));
    b.appendChild(sec(`Achievements · ${Object.keys(G.state.goals.done).length}/${ACHIEVEMENTS.length}`));
    for (const a of ACHIEVEMENTS) { const done = G.state.goals.done[a.id]; b.appendChild(el('div', { class: 'goal ach' + (done ? ' done' : '') }, el('div', { class: 'g-i' }, done ? a.icon : '🔒'), el('div', { class: 'g-b' }, el('div', { class: 'g-t' }, a.text), el('div', { class: 'g-r' }, a.desc + (a.money ? ` · ${fmtMoney(a.money)}` : ''))))); }
  },
};

export const home = {
  render(root, ctx) {
    const tab = ctx.arg?.tab || 'control';
    root.appendChild(head(ctx, '🏠 Home', '#ff9500'));
    const b = body(root);
    b.appendChild(el('div', { class: 'tabs' }, ...[['control', 'Control'], ['renovate', 'Renovate'], ['avatar', 'Me']].map(([k, l]) => el('button', { class: tab === k ? 'on' : '', onclick: () => ctx.push('home', { tab: k }) }, l))));
    if (tab === 'control') {
      b.appendChild(sec('Lights'));
      for (const r of ROOM_ORDER) {
        const on = G.state.home.lights[r];
        const colors = el('div', { class: 'swatches' }, ...SMART_COLORS.slice(0, 7).map((c) => el('button', { class: 'sw' + (G.state.home.lightColor[r] === c ? ' on' : ''), style: { background: c }, onclick: () => { G.apartment.setRoomLightColor(r, c); if (!G.state.home.lights[r]) G.apartment.setRoomLight(r, true); ctx.refresh(); } })));
        b.appendChild(el('div', { class: 'hrow' }, el('div', {}, el('div', { class: 'hr-n' }, `💡 ${ROOMS[r].name}`), colors), toggle(on, (v) => { G.apartment.setRoomLight(r, v); G.audio.play('switch'); ctx.refresh(); })));
      }
      b.appendChild(el('div', { class: 'hrow' }, el('div', { class: 'hr-n' }, 'All lights'), el('div', {}, el('button', { class: 'btn small', onclick: () => { ROOM_ORDER.forEach((r) => (G.state.home.lights[r] = true)); G.apartment.applyLights(); ctx.refresh(); } }, 'On'), el('button', { class: 'btn small ghost', onclick: () => { ROOM_ORDER.forEach((r) => (G.state.home.lights[r] = false)); G.apartment.applyLights(); ctx.refresh(); } }, 'Off'))));
      b.appendChild(sec('Blinds'));
      for (const g of ['living', 'bedroom']) {
        const v = G.state.home.blinds[g] || 0;
        const slider = el('input', { type: 'range', min: 0, max: 100, value: Math.round(v * 100) });
        slider.addEventListener('change', () => { setBlinds(g, slider.value / 100); });
        b.appendChild(el('div', { class: 'hrow' }, el('div', { class: 'hr-n' }, `🪟 ${ROOMS[g].name}`), slider));
      }
      b.appendChild(sec('Climate'));
      const t = G.state.home.thermostat;
      b.appendChild(el('div', { class: 'hrow thermo' }, el('button', { class: 'btn small', onclick: () => { G.apartment.thermostat.set(t - 1); ctx.refresh(); } }, '−'), el('div', { class: 'tv' }, `${t}°C`), el('button', { class: 'btn small', onclick: () => { G.apartment.thermostat.set(t + 1); ctx.refresh(); } }, '+')));
      b.appendChild(el('div', { class: 'tip' }, `Comfort right now: ${Math.round(G.needs.env?.score || 0)}/100. Decor, plants, art, good lighting at night and a comfy temperature all make rooms cozier.`));
      b.appendChild(sec('Front door'));
      b.appendChild(el('div', { class: 'hrow' }, el('div', { class: 'hr-n' }, '🚪 Smart lock'), el('button', { class: 'btn small', onclick: () => { G.apartment.doors.front.toggle(); ctx.refresh(); } }, G.apartment.doors.front.isOpen ? 'Close door' : 'Open door')));
    } else if (tab === 'renovate') {
      const room = ctx.arg?.room || 'living';
      b.appendChild(el('div', { class: 'chips' }, ...ROOM_ORDER.map((r) => el('button', { class: 'chip' + (r === room ? ' on' : ''), onclick: () => ctx.push('home', { tab, room: r }) }, ROOMS[r].name))));
      b.appendChild(sec('Wall paint'));
      const pal = el('div', { class: 'paints' });
      for (const p of PAINTS) {
        const owned = p.price === 0 || (G.state.home.unlockedFinishes || []).includes('paint_' + p.id);
        pal.appendChild(el('button', { class: 'paint' + (G.state.home.walls[room] === p.color ? ' on' : ''), title: p.label, onclick: async () => {
          if (!owned) { if (!G.wallet.spend(p.price, `Paint: ${p.label}`)) { G.ui.toast('Not enough money', { kind: 'bad' }); return; } G.state.home.unlockedFinishes.push('paint_' + p.id); }
          G.apartment.setWallColor(room, p.color); G.audio.play('splash'); G.events.emit('act', 'renovate'); ctx.refresh();
        } }, el('span', { style: { background: p.color } }), el('div', {}, p.label), el('small', {}, owned ? 'Owned' : fmtMoney(p.price))));
      }
      b.appendChild(pal);
      b.appendChild(sec('Flooring'));
      const fl = el('div', { class: 'floors' });
      for (const [id, f] of Object.entries(FLOORS)) {
        const owned = f.price === 0 || G.state.home.unlockedFinishes.includes(id);
        fl.appendChild(el('button', { class: 'floor' + (G.state.home.floors[room] === id ? ' on' : ''), onclick: () => {
          if (!owned) { if (!G.wallet.spend(f.price, `Flooring: ${f.label}`)) { G.ui.toast('Not enough money', { kind: 'bad' }); return; } G.state.home.unlockedFinishes.push(id); }
          G.apartment.setFloor(room, id); G.audio.play('thud', { impact: 0.6 }); G.events.emit('act', 'renovate'); ctx.refresh();
        } }, el('span', { class: 'fsw', style: { backgroundImage: `url(${floorSwatch(id)})` } }), el('div', {}, f.label), el('small', {}, owned ? 'Owned · free to apply' : fmtMoney(f.price))));
      }
      b.appendChild(fl);
    } else {
      const look = G.avatar.look();
      b.appendChild(sec('Skin tone'));
      b.appendChild(el('div', { class: 'swatches big' }, ...SKIN_TONES.map((c, i) => el('button', { class: 'sw' + (look.skin === i ? ' on' : ''), style: { background: c }, onclick: () => { look.skin = i; G.avatar.rebuild(); ctx.refresh(); } }))));
      b.appendChild(sec('Hair style'));
      b.appendChild(el('div', { class: 'chips' }, ...HAIR_STYLES.map((s, i) => el('button', { class: 'chip' + (look.hair === i ? ' on' : ''), onclick: () => { look.hair = i; G.avatar.rebuild(); ctx.refresh(); } }, s))));
      b.appendChild(sec('Hair color'));
      b.appendChild(el('div', { class: 'swatches big' }, ...HAIR_COLORS.map((c, i) => el('button', { class: 'sw' + (look.hairColor === i ? ' on' : ''), style: { background: c }, onclick: () => { look.hairColor = i; G.avatar.rebuild(); ctx.refresh(); } }))));
      b.appendChild(sec('Wearing'));
      for (const s of SLOTS) { const w = G.outfit.worn(s); b.appendChild(el('div', { class: 'hrow' }, el('div', { class: 'hr-n' }, `${SLOT_LABEL[s]}: ${w ? w.def.name : '—'}`), w ? el('button', { class: 'btn small ghost', onclick: () => { G.outfit.takeOff(s); ctx.refresh(); } }, 'Take off') : null)); }
      b.appendChild(el('div', { class: 'tip' }, 'Check yourself out in the bathroom mirror or the closet\'s full-length mirror. Change outfits at the wardrobe rack in the closet.'));
    }
  },
};
const swatchCache = {};
function floorSwatch(id) {
  if (swatchCache[id]) return swatchCache[id];
  const m = FLOORS[id].make();
  const img = m.map?.image;
  if (!img) return '';
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  c.getContext('2d').drawImage(img, 0, 0, 256, 256, 0, 0, 64, 64);
  return (swatchCache[id] = c.toDataURL());
}

export const music = {
  render(root, ctx) {
    root.appendChild(head(ctx, '🎵 Music', '#fc3c44'));
    const b = body(root);
    const m = G.phone.music;
    const cur = m?.station || G.state.phone.music.station;
    const playing = !!m?.playing;
    b.appendChild(el('div', { class: 'np', style: { background: `linear-gradient(135deg, ${STATIONS[cur].color}, #222)` } }, el('div', { class: 'np-k' }, playing ? 'NOW PLAYING' : 'PAUSED'), el('div', { class: 'np-t' }, playing ? m.trackName?.title || STATIONS[cur].name : STATIONS[cur].name), el('div', { class: 'np-a' }, playing ? `${m.trackName?.artist || ''} · ${STATIONS[cur].name}` : STATIONS[cur].desc),
      el('button', { class: 'np-play', onclick: () => { G.phone.toggleMusic(); ctx.refresh(); } }, playing ? '⏸' : '▶')));
    b.appendChild(sec('Stations'));
    for (const [id, s] of Object.entries(STATIONS)) b.appendChild(el('div', { class: 'station' + (id === cur ? ' on' : ''), onclick: () => { G.phone.toggleMusic(id); ctx.refresh(); } }, el('span', { class: 'st-dot', style: { background: s.color } }), el('div', {}, el('div', { class: 'st-n' }, s.name), el('div', { class: 'st-d' }, s.desc))));
    b.appendChild(el('div', { class: 'tip' }, '🎧 Phone music plays everywhere. Speakers & record players play from where they sit in your apartment.'));
  },
};

export const weather = {
  render(root, ctx) {
    root.appendChild(head(ctx, '🌤️ Weather', '#4facfe'));
    const b = body(root);
    const w = G.weather.info;
    const sun = G.clock.sun();
    b.appendChild(el('div', { class: 'wx', style: { background: G.clock.isNight() ? 'linear-gradient(160deg,#141e30,#243b55)' : 'linear-gradient(160deg,#4facfe,#00f2fe)' } }, el('div', { class: 'wx-city' }, 'Downtown · Floor 24'), el('div', { class: 'wx-i' }, G.clock.isNight() ? w.nightIcon : w.icon), el('div', { class: 'wx-t' }, `${Math.round(14 + sun.daylight * 8 + (G.clock.season === 'summer' ? 8 : G.clock.season === 'winter' ? -10 : 0) - G.weather.rain * 3)}°`), el('div', { class: 'wx-l' }, w.label), el('div', { class: 'wx-s' }, `${G.clock.season[0].toUpperCase() + G.clock.season.slice(1)} · day ${G.clock.dayOfSeason}/7`)));
    b.appendChild(sec('Next hours'));
    b.appendChild(el('div', { class: 'fc' }, ...G.weather.forecast().map((f) => el('div', { class: 'fc-i' }, el('div', {}, G.clock.fmt(f.time).replace(':00', '')), el('div', { class: 'fc-e' }, WEATHER[f.kind].icon), el('div', {}, WEATHER[f.kind].label)))));
    b.appendChild(el('div', { class: 'tip' }, 'Rainy and stormy days make indoor life extra cozy (+comfort). Seasons change every 7 days and bring seasonal products to the stores.'));
  },
};

export const storage = {
  render(root, ctx) {
    const loc = ctx.arg?.loc || 'storage';
    root.appendChild(head(ctx, '📦 Storage', '#8e8e93'));
    const b = body(root);
    const locs = [['storage', '📦 Closet'], ['wardrobe', '👕 Wardrobe'], ['pantry', '🥫 Pantry'], ['fridge', '🧊 Fridge'], ['cabinet', '🪥 Cabinet'], ['world', '🏠 Placed']];
    b.appendChild(el('div', { class: 'chips' }, ...locs.map(([k, l]) => el('button', { class: 'chip' + (k === loc ? ' on' : ''), onclick: () => ctx.push('storage', { loc: k }) }, `${l} (${G.items.inLoc(k).length})`))));
    const items = G.items.inLoc(loc);
    const groups = {};
    for (const i of items) (groups[i.def.id] ||= []).push(i);
    const grid = el('div', { class: 'inv-grid phone' });
    for (const list of Object.values(groups)) {
      const d = list[0].def;
      grid.appendChild(el('div', { class: 'inv-card', style: { '--r': RARITY[d.rarity]?.color } }, thumbImg(d, 128), el('div', { class: 'inv-n' }, d.name), list.length > 1 ? el('div', { class: 'inv-q' }, '×' + list.length) : null,
        el('div', { class: 'inv-b' },
          loc !== 'world' ? el('button', { onclick: () => { G.phone.close(); G.items.pickUp(list[0]); } }, d.furniture ? 'Place' : 'Take out') : el('button', { onclick: () => { G.items.toStorage(list[0]); ctx.refresh(); } }, 'Store'),
          d.use?.type === 'wear' && loc !== 'world' ? el('button', { onclick: () => { G.outfit.wear(list[0]); ctx.refresh(); } }, 'Wear') : null,
        )));
    }
    if (!items.length) grid.appendChild(el('div', { class: 'empty' }, 'Empty'));
    b.appendChild(grid);
    void CONTAINERS;
  },
};

export const collection = {
  render(root, ctx) {
    const tab = ctx.arg?.tab || 'discovered';
    root.appendChild(head(ctx, '🗂️ Collection', '#5856d6'));
    const b = body(root);
    b.appendChild(el('div', { class: 'tabs' }, ...[['discovered', 'Catalogue'], ['series', 'Figures'], ['cards', 'Cards']].map(([k, l]) => el('button', { class: tab === k ? 'on' : '', onclick: () => ctx.push('collection', { tab: k }) }, l))));
    if (tab === 'discovered') {
      const all = Object.values(ITEMS).filter((d) => !d.hidden && d.category !== 'package');
      const found = all.filter((d) => G.state.discovered[d.id]);
      b.appendChild(el('div', { class: 'lvl' }, el('div', { class: 'lv-n' }, `${found.length} / ${all.length}`), el('div', { class: 'lv-t' }, 'items discovered'), el('div', { class: 'lv-bar' }, el('div', { style: { width: `${found.length / all.length * 100}%` } }))));
      const cats = {};
      for (const d of all) (cats[d.category] ||= []).push(d);
      for (const [c, list] of Object.entries(cats)) {
        const n = list.filter((d) => G.state.discovered[d.id]).length;
        b.appendChild(el('div', { class: 'hrow' }, el('div', { class: 'hr-n' }, `${CATEGORIES[c]?.icon || ''} ${CATEGORIES[c]?.label || c}`), el('div', {}, `${n}/${list.length}`)));
      }
    } else if (tab === 'series') {
      for (const [sid, s] of Object.entries(SERIES)) {
        const owned = s.items.filter((id) => G.state.discovered[id]);
        b.appendChild(sec(`${s.name} · ${owned.length}/${s.items.length}`));
        b.appendChild(el('div', { class: 'fig-grid' }, ...s.items.map((id) => el('div', { class: 'fig' + (G.state.discovered[id] ? '' : ' unknown'), style: { '--r': RARITY[ITEMS[id]?.rarity]?.color } }, G.state.discovered[id] ? thumbImg(id, 96) : el('div', { class: 'q' }, '?'), el('div', {}, G.state.discovered[id] ? ITEMS[id].name : '???')))));
        void sid;
      }
      if (!Object.keys(SERIES).length) b.appendChild(el('div', { class: 'empty' }, 'No series yet.'));
    } else {
      const col = G.state.collection.cards || {};
      for (const [sid, set] of Object.entries(CARD_SETS)) {
        const have = set.cards.filter((c) => col[c.id]).length;
        b.appendChild(sec(`${set.name} · ${have}/${set.cards.length}`));
        b.appendChild(el('div', { class: 'card-grid' }, ...set.cards.map((c) => el('div', { class: 'tcard r-' + c.rarity + (col[c.id] ? '' : ' unknown'), style: { '--r': RARITY[c.rarity].color } }, col[c.id] ? el('div', { class: 'tc-art' }, c.emoji || '✨') : el('div', { class: 'tc-art' }, '?'), el('div', { class: 'tc-n' }, col[c.id] ? c.name : '???'), col[c.id] > 1 ? el('div', { class: 'tc-q' }, '×' + col[c.id]) : null))));
        void sid;
      }
      if (!Object.keys(CARD_SETS).length) b.appendChild(el('div', { class: 'empty' }, 'No card sets yet.'));
    }
  },
};

export const camera = {
  render(root, ctx) {
    root.appendChild(head(ctx, '📷 Camera', '#3a3a3c'));
    const b = body(root);
    b.appendChild(el('div', { class: 'cam-opts' },
      el('button', { class: 'btn big', onclick: () => { G.phone.close(); setTimeout(() => { G.audio.play('shutter'); G.ui.flash(); G.phone.capturePhoto(); }, 350); } }, '📸 Take a photo'),
      el('button', { class: 'btn big', onclick: () => { G.phone.close(); setTimeout(() => G.phone.mirrorSelfie(), 350); } }, '🤳 Selfie'),
      ...['vintage', 'noir', 'vivid'].map((f) => el('button', { class: 'btn', onclick: () => { G.phone.close(); setTimeout(() => { G.audio.play('shutter'); G.ui.flash(); G.phone.capturePhoto(f); }, 350); } }, `Filter: ${f}`)),
    ));
    b.appendChild(el('div', { class: 'tip' }, 'Photos go to your gallery. You can print them as framed photos to hang on your walls!'));
  },
};

export const photos = {
  render(root, ctx) {
    root.appendChild(head(ctx, '🖼️ Photos', '#ffcc00'));
    const b = body(root);
    const list = G.state.photos;
    if (!list.length) { b.appendChild(el('div', { class: 'empty big' }, '📷', el('div', {}, 'No photos yet. Use the Camera app!'))); return; }
    const grid = el('div', { class: 'photo-grid' });
    list.forEach((p, i) => grid.appendChild(el('div', { class: 'photo' }, el('img', { src: p.url }), el('div', { class: 'ph-b' },
      el('button', { onclick: () => {
        if (!G.wallet.spend(9.99, 'Photo print')) { G.ui.toast('Not enough money', { kind: 'bad' }); return; }
        const it = G.items.spawn('custom_photo', { loc: 'storage', st: { img: p.url } });
        G.phone.close(); G.items.pickUp(it); G.ui.toast('Printed & framed! Hang it with F.', { icon: '🖼️', kind: 'good' });
      } }, 'Print $9.99'),
      el('button', { onclick: () => { list.splice(i, 1); ctx.refresh(); } }, '🗑'),
    ))));
    b.appendChild(grid);
  },
};

const SURVEY_Q = [
  ['How often do you order takeout?', ['Daily', 'Hourly', 'I live on takeout']],
  ['Pick a pizza topping', ['Pepperoni', 'Pineapple', 'Everything']],
  ['Best time for a nap?', ['2 PM', 'Always', 'Right now']],
  ['How many plants is too many?', ['10', '50', 'There is no limit']],
  ['Rate your couch', ['⭐⭐⭐⭐', '⭐⭐⭐⭐⭐', 'I married it']],
  ['Cats or dogs?', ['Cats', 'Dogs', 'Both, obviously']],
  ['Ideal Saturday?', ['Gaming', 'Reading', 'Ordering things']],
  ['Favorite delivery app?', ['GrubHop', 'Dashr', 'All of them']],
];
export const gigs = {
  render(root, ctx) {
    root.appendChild(head(ctx, '💼 Gigs', '#0a84ff'));
    const b = body(root);
    const st = (G.state.flags.survey ||= { next: 0, q: null, i: 0 });
    const ready = G.clock.total >= st.next;
    b.appendChild(el('div', { class: 'tip' }, '💻 Bigger freelance jobs (writing, data, design) pay much more on WorkHub — open it on your computer.'));
    b.appendChild(sec('Quick paid surveys'));
    if (!ready) { b.appendChild(el('div', { class: 'empty' }, `Next survey available in ${G.clock.fmtDuration(st.next - G.clock.total)}`)); return; }
    if (!st.q) { st.q = [...SURVEY_Q].sort(() => Math.random() - 0.5).slice(0, 3).map((x) => SURVEY_Q.indexOf(x)); st.i = 0; }
    const [q, opts] = SURVEY_Q[st.q[st.i]];
    b.appendChild(el('div', { class: 'survey' }, el('div', { class: 'sv-k' }, `Question ${st.i + 1} of 3`), el('div', { class: 'sv-q' }, q), ...opts.map((o) => el('button', { class: 'btn', onclick: () => {
      G.audio.play('click');
      st.i++;
      if (st.i >= 3) { st.q = null; st.next = G.clock.total + 90; const pay = Math.round((6 + Math.random() * 6) * G.needs.earnMult() * 100) / 100; G.wallet.earn(pay, 'Survey reward'); G.events.emit('act', 'survey'); }
      ctx.refresh();
    } }, o))));
  },
};

export const settings = {
  render(root, ctx) {
    root.appendChild(head(ctx, '⚙️ Settings', '#636366'));
    const b = body(root);
    const s = G.state.settings;
    const row = (label, control) => el('div', { class: 'hrow' }, el('div', { class: 'hr-n' }, label), control);
    const range = (val, min, max, step, on) => { const r = el('input', { type: 'range', min, max, step, value: val }); r.addEventListener('input', () => on(parseFloat(r.value))); return r; };
    b.appendChild(sec('Graphics'));
    b.appendChild(row('Quality', el('div', {}, ...['low', 'medium', 'high'].map((q) => el('button', { class: 'chip' + (s.quality === q ? ' on' : ''), onclick: () => { s.quality = q; G.engine.setQuality(q); ctx.refresh(); } }, q)))));
    b.appendChild(row(`Field of view (${s.fov}°)`, range(s.fov, 60, 95, 1, (v) => { s.fov = v; })));
    b.appendChild(sec('Controls'));
    b.appendChild(row(`Mouse sensitivity (${s.sensitivity.toFixed(2)})`, range(s.sensitivity, 0.2, 3, 0.05, (v) => { s.sensitivity = v; })));
    b.appendChild(row('Invert Y', toggle(s.invertY, (v) => { s.invertY = v; ctx.refresh(); })));
    b.appendChild(sec('Audio'));
    for (const k of ['master', 'music', 'sfx', 'ambience']) b.appendChild(row(k[0].toUpperCase() + k.slice(1), range(s.volumes[k], 0, 1, 0.05, (v) => { s.volumes[k] = v; G.audio.volumes[k] = v; G.audio.applyVolumes(); })));
    b.appendChild(sec('Gameplay'));
    b.appendChild(row('Time speed', el('div', {}, ...[[0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']].map(([v, l]) => el('button', { class: 'chip' + (s.timeScale === v ? ' on' : ''), onclick: () => { s.timeScale = v; ctx.refresh(); } }, l)))));
    b.appendChild(row('Show needs HUD', toggle(s.showNeeds, (v) => { s.showNeeds = v; ctx.refresh(); })));
    b.appendChild(row('Auto-store deliveries', toggle(s.autoStoreDeliveries, (v) => { s.autoStoreDeliveries = v; ctx.refresh(); })));
    b.appendChild(row('Stream when playing games', toggle(!!G.state.flags.streaming, (v) => { if (v && !G.games.canStream()) { G.ui.toast('You need a webcam and a microphone to stream.', { kind: 'bad', icon: '🎥' }); return; } G.state.flags.streaming = v; ctx.refresh(); })));
    b.appendChild(sec('Phone'));
    b.appendChild(el('div', { class: 'swatches big' }, ...WALLPAPERS.map((w, i) => el('button', { class: 'sw wall' + (G.state.phone.wallpaper === i ? ' on' : ''), style: { background: w }, onclick: () => { G.state.phone.wallpaper = i; G.phone.show(); ctx.refresh(); } }))));
    b.appendChild(sec('Save'));
    b.appendChild(el('div', { class: 'btnrow' }, el('button', { class: 'btn', onclick: () => { saveState(); G.ui.toast('Game saved', { icon: '💾' }); } }, '💾 Save now'), el('button', { class: 'btn danger', onclick: async () => { const ok = await G.ui.choose('Start over? This deletes your save.', [{ label: 'Yes, reset everything', value: true }, { label: 'Cancel', value: false, primary: true }], { icon: '⚠️' }); if (ok) { wipeSave(); G.resetting = true; location.reload(); } } }, 'Reset game')));
    b.appendChild(sec('Controls'));
    b.appendChild(el('div', { class: 'controls' }, ...[['WASD', 'Move'], ['Shift', 'Run'], ['C / Ctrl', 'Crouch'], ['Space', 'Jump / stand up'], ['E', 'Interact'], ['F', 'Secondary / place held item'], ['R / Q', 'More actions / rotate'], ['X', 'Store / stash'], ['G', 'Drop · hold to throw'], ['Left click', 'Use held item'], ['Right click (hold)', 'Inspect held item'], ['Tab', 'Phone'], ['I', 'Storage'], ['Esc', 'Pause']].map(([k, v]) => el('div', {}, el('span', { class: 'key' }, k), v))));
    void pick;
  },
};
