// Item thumbnail preview page (preview.html?cat=food | ?store=grubhop | ?ids=a,b | ?q=text | ?from=0&n=60)
// Used to visually check catalogue models without booting the whole game.
import { G } from './game.js';
import { Events } from './core/events.js';
import { ITEMS, defBounds, RARITY } from './items/registry.js';
import { thumbImg } from './ui/thumbs.js';
import './catalog/index.js';
import './shop/packages.js';
import { validate } from './validate.js';
import './player/outfit.js';

G.events = new Events();
if (new URLSearchParams(location.search).has('validate')) { window.__validation = validate(); }
const p = new URLSearchParams(location.search);
let list = Object.values(ITEMS);
if (p.get('cat')) list = list.filter((d) => d.category === p.get('cat'));
if (p.get('store')) list = list.filter((d) => d.stores.includes(p.get('store')));
if (p.get('ids')) { const ids = p.get('ids').split(','); list = list.filter((d) => ids.includes(d.id)); }
if (p.get('q')) list = list.filter((d) => d.id.includes(p.get('q')) || d.name.toLowerCase().includes(p.get('q')));
const from = +(p.get('from') || 0), n = +(p.get('n') || 400);
list = list.slice(from, from + n);
const grid = document.getElementById('grid');
let errors = 0;
for (const d of list) {
  const c = document.createElement('div'); c.className = 'c';
  try {
    const b = defBounds(d);
    c.appendChild(thumbImg(d, 160));
    c.insertAdjacentHTML('beforeend', `<div><b>${d.name}</b></div><div class="id">${d.id} · $${d.price} · ${d.use?.type || '—'}${d.furniture ? ' · furn' : ''} · ${b.size.x.toFixed(2)}×${b.size.y.toFixed(2)}×${b.size.z.toFixed(2)}m</div><div class="id" style="color:${RARITY[d.rarity]?.color}">${d.rarity}</div>`);
  } catch (e) { errors++; c.className = 'c err'; c.textContent = d.id + ': ' + e.message; console.error(d.id, e); }
  grid.appendChild(c);
}
document.getElementById('status').textContent = `${list.length} items (${Object.keys(ITEMS).length} total) · ${errors} errors`;
window.__previewDone = () => document.querySelectorAll('#grid img').length && [...document.querySelectorAll('#grid img')].every((i) => i.src.startsWith('data:image/webp'));
