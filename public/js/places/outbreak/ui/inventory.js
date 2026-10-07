// The inventory screen (Tab). On the left, what's around you: things on the
// ground, and the pockets of a body you're standing over. In the middle,
// what you're wearing and what's in it - each piece of clothing a grid of
// cells. On the right, the slots (head to boots, shoulder, melee, hands),
// your condition and how much you're carrying. Drag things between them
// (R or right-click while dragging turns them), drop one thing on another to
// combine (rounds into a magazine, a magazine into a gun, a sight onto a
// rifle, a battery into a torch), right-click for everything else.
import { O } from '../state.js';
import { def, size, condOf, Grid, makeItem, SLOTS } from '../game/inventory.js';
import { ITEMS, CALIBRES } from '../game/items.js';
import { iconURL } from './icons.js';

const SLOT_LABEL = { head: 'Head', torso: 'Body', vest: 'Vest', legs: 'Legs', back: 'Back', shoulder: 'Shoulder', melee: 'Melee', hands: 'Hands' };

export class InventoryUI {
  constructor(root) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = 'ob-screen ob-inv hide';
    root.appendChild(this.el);
    this.C = 42;
    this.tip = document.createElement('div'); this.tip.className = 'ob-tip hide'; document.body.appendChild(this.tip);
    this.menu = null;
    this.drag = null;
    this.el.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('pointerdown', (e) => { if (this.menu && !this.menu.contains(e.target)) this._closeMenu(); });
    window.addEventListener('keydown', (e) => { if (this.drag && (e.key === 'r' || e.key === 'R')) { this.drag.rot = !this.drag.rot; this._ghost(); this._hint(e); } });
  }
  get isOpen() { return !this.el.classList.contains('hide'); }
  open() { this.el.classList.remove('hide'); this.render(); }
  close() { this.el.classList.add('hide'); this.tip.classList.add('hide'); this._closeMenu(); this._cancelDrag(); }

  /** Draw it all again (after anything changes). */
  render() {
    if (!this.isOpen) return;
    const inv = O.inv, C = this.C;
    this.el.innerHTML = '';
    // the three columns
    const col = (title, w) => { const c = document.createElement('div'); c.className = 'ob-col ob-panel'; c.style.width = w; c.innerHTML = `<div class="ob-h">${title}</div>`; const s = document.createElement('div'); s.className = 'scroll'; c.appendChild(s); this.el.appendChild(c); return s; };
    const vic = col('Vicinity', '27%'), mid = col('Inventory', '38%'), right = col('Character', '25%');
    vic.parentElement.dataset.drop = 'ground';
    // --- the ground and bodies nearby -------------------------------------------------------------------------------------------
    const P = O.player;
    const ground = O.loot.near(P.pos, 5.5).filter((w) => Math.abs(w.y - P.pos.y) < 4);
    const gg = new Grid(Math.max(6, Math.floor((vic.clientWidth || 300) / C) - 1), 40);
    for (const w of ground) { const sp = gg.space(w.it); if (sp) { w.it.x = sp[0]; w.it.y = sp[1]; w.it.rot = sp[2]; gg.items.push(w.it); } }
    gg.h = Math.max(4, gg.items.reduce((m, it) => Math.max(m, it.y + size(it)[1]), 0) + 1);
    this._section(vic, 'On the ground', null, gg, { type: 'ground', worlds: ground });
    const bodies = O.bodies.near(P.pos, 6);
    for (const b of bodies) {
      if (!b.items.length) continue;
      const bg = new Grid(gg.w, 40);
      for (const it of b.items) { const sp = bg.space(it); if (sp) { it.x = sp[0]; it.y = sp[1]; it.rot = sp[2]; bg.items.push(it); } }
      bg.h = Math.max(2, bg.items.reduce((m, it) => Math.max(m, it.y + size(it)[1]), 0));
      this._section(vic, b.name, null, bg, { type: 'body', body: b });
    }
    // --- your clothes and their pockets -------------------------------------------------------------------------------------------
    for (const s of ['torso', 'legs', 'vest', 'back']) {
      const it = inv.slots[s];
      if (!it?.grid) continue;
      this._section(mid, def(it).name, it, it.grid, { type: 'inv', owner: it });
    }
    if (!inv.grids().length) mid.insertAdjacentHTML('beforeend', '<div style="padding:20px;color:#8a867c">You have nothing with pockets. Find some clothes.</div>');
    // --- slots, condition, weight ----------------------------------------------------------------------------------------------------
    const slotBox = document.createElement('div');
    slotBox.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px';
    right.appendChild(slotBox);
    for (const s of ['head', 'vest', 'torso', 'back', 'legs', 'melee', 'hands', 'shoulder']) {
      const it = inv.slots[s];
      const d = document.createElement('div');
      d.className = 'ob-slot'; d.dataset.slot = s;
      const wide = s === 'shoulder' || s === 'hands';
      d.style.cssText = `height:${wide ? Math.round(C * 1.7) : Math.round(C * 1.55)}px;${wide ? 'grid-column:span 2;' : ''}`;
      d.innerHTML = `<div class="lab">${SLOT_LABEL[s]}</div>`;
      if (it) d.appendChild(this._itemEl(it, { type: 'slot', slot: s }, true));
      slotBox.appendChild(d);
    }
    const S = O.survival, st = S.status();
    const bar = (name, v, col2) => `<div class="r"><span>${name}</span><div class="b"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${col2 || '#e9e5db'}"></i></div></div>`;
    const heatTxt = st.heat < -0.55 ? 'Freezing' : st.heat < -0.3 ? 'Cold' : st.heat > 0.6 ? 'Hot' : 'Fine';
    right.insertAdjacentHTML('beforeend', `<div class="ob-bars" style="margin-top:10px">
      ${bar('Health', st.health, st.health < 0.3 ? '#e0483a' : null)}${bar('Blood', st.blood, st.blood < 0.5 ? '#e0483a' : '#c84a3a')}
      ${bar('Energy', st.energy, st.energy < 0.2 ? '#e8c070' : null)}${bar('Water', st.water, st.water < 0.2 ? '#e8c070' : '#8ab8d8')}
      <div class="r"><span>Body</span>${heatTxt}${st.wet > 0.2 ? ', ' + (st.wet > 0.6 ? 'soaked' : 'damp') : ''}${st.wounds ? ', <span style="color:#e0483a">bleeding</span>' : ''}${st.brokenLeg ? ', <span style="color:#e0483a">broken leg</span>' : ''}${st.sick > 0.05 ? ', sick' : ''}</div>
      <div class="r"><span>Carrying</span>${inv.weight().toFixed(1)} kg${inv.weight() > 30 ? ' <span style="color:#e8c070">(heavy)</span>' : ''}</div>
    </div>`);
    // --- the hotbar along the bottom ---------------------------------------------------------------------------------------------------
    const hb = document.createElement('div');
    hb.style.cssText = 'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:5px';
    for (let i = 0; i < 9; i++) {
      const it = inv.hot(i);
      const d = document.createElement('div'); d.className = 'ob-slot'; d.dataset.hot = i; d.style.cssText = 'width:52px;height:52px';
      d.innerHTML = `<div class="lab">${i + 1}</div>${it ? `<img src="${iconURL(it)}" style="position:absolute;inset:6px;width:40px;height:40px;object-fit:contain;pointer-events:none">` : ''}`;
      d.addEventListener('contextmenu', () => { inv.hotbar[i] = null; inv.changed(); this.render(); });
      hb.appendChild(d);
    }
    this.el.appendChild(hb);
    this.el.insertAdjacentHTML('beforeend', '<div style="position:absolute;right:34px;bottom:26px;font-size:12px;color:#7a766c;text-align:right;line-height:1.6">Drag to move · R turns · Right-click for options<br>Drop on the hotbar to assign · Double-click to use</div>');
  }

  _section(parent, title, owner, grid, src) {
    const C = this.C;
    const sec = document.createElement('div'); sec.className = 'ob-sec';
    const hdr = document.createElement('div'); hdr.className = 'hdr';
    if (owner) { const c = condOf(owner); hdr.innerHTML = `<img src="${iconURL(owner)}"><span>${title}</span><span class="c" style="color:${c[2]}">${c[1]}</span>`; }
    else hdr.innerHTML = `<span>${title}</span>`;
    sec.appendChild(hdr);
    const g = document.createElement('div'); g.className = 'ob-grid';
    g.style.width = grid.w * C + 'px'; g.style.height = grid.h * C + 'px'; g.style.backgroundSize = `${C}px ${C}px`;
    g._grid = grid; g._src = src;
    for (const it of grid.items) g.appendChild(this._itemEl(it, src));
    sec.appendChild(g);
    parent.appendChild(sec);
  }

  _itemEl(it, src, inSlot = false) {
    const C = this.C, d = def(it);
    const [w, h] = inSlot ? [d.w, d.h] : size(it);
    const e = document.createElement('div'); e.className = 'ob-it';
    if (inSlot) { e.style.cssText = 'left:6px;right:6px;top:16px;bottom:6px'; }
    else { e.style.left = it.x * C + 1 + 'px'; e.style.top = it.y * C + 1 + 'px'; e.style.width = w * C - 2 + 'px'; e.style.height = h * C - 2 + 'px'; }
    const c = condOf(it);
    let q = '';
    if (d.stack > 1) q = it.n;
    else if (d.magOf) q = it.n + '/' + d.cap;
    else if (d.gun) q = d.internal ? it.rounds + (it.chamber ? 1 : 0) : it.mag ? it.mag.n + (it.chamber ? 1 : 0) : '';
    else if (d.uses || d.refill) q = (it.n ?? 0) + (d.refill ? '' : '');
    e.innerHTML = `<img src="${iconURL(it, !inSlot && it.rot)}"><div class="q">${q}</div><div class="cd" style="background:${c[2]}"></div>`;
    e._it = it; e._src = src;
    e.addEventListener('pointerdown', (ev) => { if (ev.button === 0) this._startDrag(ev, it, src, e); else if (ev.button === 2) { ev.stopPropagation(); this._contextMenu(ev, it, src); } });
    e.addEventListener('dblclick', () => this._quick(it, src));
    e.addEventListener('pointerenter', (ev) => this._showTip(ev, it));
    e.addEventListener('pointerleave', () => this.tip.classList.add('hide'));
    return e;
  }

  _showTip(ev, it) {
    if (this.drag) return;
    const d = def(it), c = condOf(it);
    let k = '';
    if (d.food || d.drink) k = `${d.food ? 'Energy +' + (d.food.energy || 0) : ''}${(d.food || d.drink).water ? ' · Water ' + ((d.food || d.drink).water > 0 ? '+' : '') + (d.food || d.drink).water : ''}${d.can ? ' · needs opening' : ''}`;
    if (d.gun) k = `${CALIBRES[d.cal].name} · ${d.internal ? d.internal + ' rounds' : 'takes ' + ITEMS[d.mag].name}${it.mag ? ' · ' + it.mag.n + ' in the magazine' : ''}${Object.values(it.attach || {}).filter(Boolean).length ? ' · ' + Object.values(it.attach).filter(Boolean).map((a) => ITEMS[a]?.name || a).join(', ') : ''}`;
    if (d.magOf) k = `${it.n} / ${d.cap} ${CALIBRES[d.magOf].name}`;
    if (d.ammo) k = `${it.n} rounds`;
    if (d.wear?.cargo) k = `${d.wear.cargo[0]}×${d.wear.cargo[1]} slots${d.wear.armor ? ' · armour ' + Math.round(d.wear.armor * 100) + '%' : ''}${d.wear.warmth ? ' · warmth ' + Math.round(d.wear.warmth * 10) : ''}`;
    if (d.light) k = `Battery ${Math.round(it.charge * 100)}%${it.on ? ' · on' : ''}`;
    if (d.refill) k = `${it.n} drink${it.n === 1 ? '' : 's'} left${it.dirty ? ' · <span style="color:#e8c070">unsafe water</span>' : ''}`;
    this.tip.innerHTML = `<div class="t">${d.name}</div><div class="d">${d.desc || ''}</div>${k ? `<div class="k">${k}</div>` : ''}<div class="k"><span style="color:${c[2]}">${c[1]}</span> · ${(d.weight * (d.stack > 1 ? it.n : 1)).toFixed(2)} kg</div>`;
    this.tip.classList.remove('hide');
    this.tip.style.left = Math.min(innerWidth - 310, ev.clientX + 16) + 'px';
    this.tip.style.top = Math.min(innerHeight - 140, ev.clientY + 12) + 'px';
  }

  // --- dragging ------------------------------------------------------------------------------------------------------------------
  _startDrag(ev, it, src, el) {
    ev.preventDefault();
    this._closeMenu();
    this.tip.classList.add('hide');
    const r = el.getBoundingClientRect();
    this.drag = { it, src, el, rot: it.rot && src.type !== 'slot', ox: ev.clientX - r.left, oy: ev.clientY - r.top, moved: false, x0: ev.clientX, y0: ev.clientY };
  }
  _ghost() {
    const D = this.drag; if (!D) return;
    if (!D.ghost) { D.ghost = document.createElement('div'); D.ghost.className = 'ob-ghost'; document.body.appendChild(D.ghost); D.el.classList.add('drag'); }
    const dd = def(D.it), w = D.rot ? dd.h : dd.w, h = D.rot ? dd.w : dd.h;
    D.ghost.style.width = w * this.C + 'px'; D.ghost.style.height = h * this.C + 'px';
    D.ghost.innerHTML = `<img src="${iconURL(D.it, D.rot)}">`;
  }
  _move(ev) {
    const D = this.drag;
    if (!D) return;
    if (!D.moved && Math.hypot(ev.clientX - D.x0, ev.clientY - D.y0) < 4) return;
    if (!D.moved) { D.moved = true; this._ghost(); D.ox = Math.min(D.ox, this.C / 2); D.oy = Math.min(D.oy, this.C / 2); }
    D.ghost.style.left = ev.clientX - D.ox + 'px'; D.ghost.style.top = ev.clientY - D.oy + 'px';
    this._hint(ev);
  }
  /** Where would it go if dropped here? */
  _target(ev) {
    const D = this.drag;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el) return null;
    const slot = el.closest('.ob-slot');
    if (slot?.dataset.slot) return { type: 'slot', slot: slot.dataset.slot, el: slot };
    if (slot?.dataset.hot !== undefined) return { type: 'hot', i: +slot.dataset.hot, el: slot };
    const itemEl = el.closest('.ob-it');
    if (itemEl && itemEl._it !== D.it) return { type: 'onto', it: itemEl._it, src: itemEl._src, el: itemEl };
    const grid = el.closest('.ob-grid');
    if (grid) {
      const r = grid.getBoundingClientRect();
      const x = Math.round((ev.clientX - D.ox - r.left) / this.C), y = Math.round((ev.clientY - D.oy - r.top) / this.C);
      return { type: 'grid', grid: grid._grid, src: grid._src, x, y, el: grid };
    }
    if (el.closest('[data-drop="ground"]')) return { type: 'ground' };
    return null;
  }
  _hint(ev) {
    for (const h of this.el.querySelectorAll('.ob-cell-hint')) h.remove();
    for (const h of this.el.querySelectorAll('.ob-slot.hl')) h.classList.remove('hl');
    const t = this._target(ev);
    if (!t) return;
    if (t.type === 'grid' && t.src.type === 'inv') {
      const D = this.drag, d = def(D.it), w = D.rot ? d.h : d.w, h = D.rot ? d.w : d.h;
      const ok = t.grid.fits(D.it, t.x, t.y, D.rot, D.it);
      const hint = document.createElement('div'); hint.className = 'ob-cell-hint';
      hint.style.cssText = `left:${t.x * this.C}px;top:${t.y * this.C}px;width:${w * this.C}px;height:${h * this.C}px;border-color:${ok ? '#9ac878' : '#e0483a'};background:${ok ? 'rgba(154,200,120,.12)' : 'rgba(224,72,58,.12)'}`;
      t.el.appendChild(hint);
    } else if (t.type === 'slot' || t.type === 'hot') t.el.classList.add('hl');
    else if (t.type === 'onto') t.el.style.borderColor = combineWith(this.drag.it, t.it) ? '#9ac878' : '';
  }
  _cancelDrag() { const D = this.drag; if (!D) return; D.ghost?.remove(); D.el.classList.remove('drag'); this.drag = null; }
  _up(ev) {
    const D = this.drag;
    if (!D) return;
    this._cancelDrag();
    if (!D.moved) return;
    const t = this._target(ev);
    if (t) this.moveTo(D.it, D.src, t, D.rot);
    this.render(); O.hud?.changed();
  }

  // --- moving things ----------------------------------------------------------------------------------------------------------------
  /** Take an item out of where it is (ground, body, inventory). */
  _lift(it, src) {
    if (src.type === 'ground') { const w = O.loot.items.find((q) => q.it === it); if (w) O.loot.take(w); O.audio?.pickup(); return true; }
    if (src.type === 'body') { const i = src.body.items.indexOf(it); if (i >= 0) src.body.items.splice(i, 1); O.audio?.pickup(); return true; }
    return O.inv.detach(it);
  }
  /** Put it back where it was (when a move fails). */
  _restore(it, src) {
    if (src.type === 'ground') { O.loot.drop(it, O.player.pos.x, O.player.pos.y, O.player.pos.z); return; }
    if (src.type === 'body') { src.body.items.push(it); return; }
    if (src.type === 'slot') { O.inv.slots[src.slot] = it; return; }
    if (it._from?.grid && it._from.grid.fits(it, it.x, it.y, it.rot)) { it._from.grid.put(it, it.x, it.y, it.rot); return; }
    if (!O.inv.add(it)) O.loot.drop(it, O.player.pos.x, O.player.pos.y, O.player.pos.z);
  }
  moveTo(it, src, t, rot) {
    const inv = O.inv;
    if (t.type === 'hot') { if (src.type !== 'ground' && src.type !== 'body') inv.setHot(t.i, it); else O.hud?.note('Pick it up first', 1.5); return; }
    if (t.type === 'onto') { if (this._combine(it, src, t.it, t.src)) return; t = { type: 'grid', grid: t.src.type === 'inv' ? inv.locate(t.it)?.grid : null, src: t.src, x: it.x, y: it.y }; if (!t.grid) return; }
    if (t.type === 'ground') { if (src.type === 'ground') return; if (it === inv.slots.hands) O.weapons.refresh(); this._lift(it, src); O.loot.drop(it, O.player.pos.x, O.player.pos.y, O.player.pos.z); O.audio?.cloth(0.5); inv.changed(); return; }
    if (t.type === 'grid') {
      if (t.src.type !== 'inv') { // into the vicinity: that's dropping
        if (t.src.type === 'ground') return this.moveTo(it, src, { type: 'ground' }, rot);
        if (t.src.type === 'body') { if (src.type === 'body') return; this._lift(it, src); t.src.body.items.push(it); return; }
        return;
      }
      if (it.grid?.items.length && t.src.owner !== undefined) { O.hud?.note('Empty it first', 1.5); return; }
      if (!t.grid.fits(it, t.x, t.y, rot, it)) { O.audio?.ui(); return; }
      const from = inv.locate(it);
      it._from = from;
      this._lift(it, src);
      // a piece of clothing can't go into its own pockets
      if (t.src.owner === it) { this._restore(it, src); return; }
      t.grid.put(it, t.x, t.y, rot);
      inv.changed(); O.audio?.pickup();
      return;
    }
    if (t.type === 'slot') {
      const d = def(it), s = t.slot;
      if (s === 'hands') {
        if (src.type === 'ground' || src.type === 'body') { if (inv.slots.hands) { if (!inv.add(inv.slots.hands)) { O.hud?.note('Your hands are full', 1.5); return; } inv.slots.hands = null; } this._lift(it, src); inv.slots.hands = it; }
        else O.weapons.take(it);
        inv.changed(); O.weapons.refresh(); return;
      }
      if (d.wear?.slot === s) {
        this._lift(it, src);
        const old = inv.wear(it);
        if (old) { if (!inv.add(old)) O.loot.drop(old, O.player.pos.x, O.player.pos.y, O.player.pos.z); }
        O.ui?.onWear?.(); O.audio?.cloth(0.8); return;
      }
      if ((s === 'shoulder' || s === 'melee') && ((d.gun && !d.pistol) || (d.melee && d.long && s === 'melee') || (d.gun && s === 'melee'))) {
        const old = inv.slots[s];
        this._lift(it, src);
        inv.slots[s] = it;
        if (old && old !== it) { if (!inv.add(old, { noWear: true })) O.loot.drop(old, O.player.pos.x, O.player.pos.y, O.player.pos.z); }
        inv.changed(); O.audio?.cloth(0.6); return;
      }
      O.audio?.ui();
    }
  }
  /** Drop one thing onto another: stack, load, attach. Returns true if something happened. */
  _combine(a, srcA, b, srcB) {
    const da = def(a), db = def(b), inv = O.inv;
    const fromInvB = srcB.type === 'inv' || srcB.type === 'slot';
    // stack the same things
    if (a.id === b.id && da.stack > 1 && b.n < da.stack) { const k = Math.min(a.n, da.stack - b.n); b.n += k; a.n -= k; if (a.n <= 0) this._lift(a, srcA); inv.changed(); return true; }
    // rounds into a magazine
    if (da.ammo && db.magOf === da.ammo && b.n < db.cap) { if (!fromInvB && srcB.type !== 'body') { O.hud?.note('Pick the magazine up first', 1.5); return true; } this._loadMag(b, a, srcA); return true; }
    // rounds into a shotgun or bolt rifle
    if (da.ammo && db.gun && db.internal && db.cal === da.ammo && b.rounds < db.internal) { const k = Math.min(db.internal - b.rounds, a.n); b.rounds += k; a.n -= k; if (a.n <= 0) this._lift(a, srcA); if (!b.chamber && b.rounds > 0) { b.rounds--; b.chamber = true; } O.audio?.click(); inv.changed(); return true; }
    // a magazine into a gun
    if (da.magOf && db.gun && db.mag === a.id) {
      this._lift(a, srcA);
      const old = b.mag; b.mag = a;
      if (old && !inv.add(old, { noWear: true })) O.loot.drop(old, O.player.pos.x, O.player.pos.y, O.player.pos.z);
      if (!b.chamber && a.n > 0) { a.n--; b.chamber = true; }
      O.audio?.click(); if (b === inv.slots.hands) O.weapons.refresh(); inv.changed(); return true;
    }
    // an attachment onto a gun
    if (da.attach && db.gun && db.attach.includes(da.attach)) {
      const slot = { reddot: 'optic', holo: 'optic', acog: 'optic', suppressor: 'muzzle', foregrip: 'under', laser: 'side' }[da.attach];
      b.attach = b.attach || {};
      const old = b.attach[slot];
      this._lift(a, srcA);
      b.attach[slot] = da.attach;
      if (old) { const o = makeItem(old); if (!inv.add(o)) O.loot.drop(o, O.player.pos.x, O.player.pos.y, O.player.pos.z); }
      O.audio?.click(); if (b === inv.slots.hands) { O.weapons.curUid = -1; O.weapons.refresh(); } inv.changed(); return true;
    }
    // a battery into a light
    if (da.battery === true && db.light) { b.charge = 1; a.n--; if (a.n <= 0) this._lift(a, srcA); O.audio?.click(); inv.changed(); return true; }
    // tape onto something worn
    if (da.repair && b.cond < 0.95 && !db.wear) { b.cond = Math.min(1, b.cond + 0.25); a.n--; if (a.n <= 0) this._lift(a, srcA); O.hud?.note('Repaired', 1.5); inv.changed(); return true; }
    if (da.repairCloth && db.wear && b.cond < 0.95) { b.cond = Math.min(1, b.cond + 0.3); a.n--; if (a.n <= 0) this._lift(a, srcA); O.hud?.note('Mended', 1.5); inv.changed(); return true; }
    if (da.med?.purify && db.refill) { b.dirty = false; a.n--; if (a.n <= 0) this._lift(a, srcA); O.hud?.note('The water is safe now', 1.5); inv.changed(); return true; }
    return false;
  }
  _loadMag(mag, ammo, srcAmmo) {
    const dm = def(mag);
    const n = Math.min(dm.cap - mag.n, ammo.n);
    if (n <= 0) return;
    O.ui.close();
    O.actions.start({ label: 'Loading ' + dm.name, time: Math.max(0.5, n * 0.28), tick: () => { if (Math.random() < 0.05) O.audio?.click(); }, done: () => {
      const k = Math.min(dm.cap - mag.n, ammo.n);
      mag.n += k; ammo.n -= k;
      if (ammo.n <= 0) this._lift(ammo, srcAmmo.type === 'slot' ? { type: 'inv' } : srcAmmo);
      O.inv.changed(); O.hud?.changed();
    } });
  }

  _quick(it, src) {
    const inv = O.inv, d = def(it);
    if (src.type === 'ground' || src.type === 'body') {
      // pick it up: wear it, or pocket it, or hold it
      this._lift(it, src);
      if (!inv.add(it)) { if (!inv.slots.hands) inv.slots.hands = it; else this._restore(it, src); }
      inv.changed(); O.weapons.refresh();
      if (d.wear) O.ui?.onWear?.();
    } else if (d.wear && inv.slots[d.wear.slot] !== it) { this._lift(it, src); const old = inv.wear(it); if (old && !inv.add(old)) O.loot.drop(old, O.player.pos.x, O.player.pos.y, O.player.pos.z); O.ui?.onWear?.(); }
    else if (d.gun || d.melee || d.light || d.zoom) O.weapons.take(it);
    else if (d.food || d.drink || d.med) { O.ui.close(); O.weapons.use(it); }
    this.render(); O.hud?.changed();
  }

  _contextMenu(ev, it, src) {
    ev.preventDefault();
    this._closeMenu();
    const inv = O.inv, d = def(it), acts = [];
    const onBody = src.type === 'ground' || src.type === 'body';
    if (onBody) acts.push(['Take', () => this._quick(it, src)]);
    if (!onBody) {
      if (d.food) acts.push([d.can ? 'Open and eat' : 'Eat', () => { O.ui.close(); O.weapons.use(it); }]);
      if (d.drink) acts.push(['Drink', () => { O.ui.close(); O.weapons.use(it); }]);
      if (d.med) acts.push([d.med.bandage ? 'Bandage yourself' : 'Use', () => { O.ui.close(); O.weapons.use(it); }]);
      if (d.wear && inv.slots[d.wear.slot] !== it) acts.push(['Wear', () => this._quick(it, src)]);
      if (inv.slots.hands !== it) acts.push(['Take in hands', () => O.weapons.take(it)]);
      if (d.light) acts.push([it.on ? 'Switch off' : 'Switch on', () => O.weapons.toggleLight(it)]);
      if (d.magOf && it.n > 0) acts.push(['Unload rounds', () => { const id = CALIBRES[d.magOf].item; let left = it.n; it.n = 0; while (left > 0) { const k = Math.min(ITEMS[id].stack, left); left -= k; const box = makeItem(id, { n: k }); if (!inv.add(box)) O.loot.drop(box, O.player.pos.x, O.player.pos.y, O.player.pos.z); } inv.changed(); }]);
      if (d.magOf && it.n < d.cap && inv.rounds(d.magOf) > 0) acts.push(['Load rounds', () => { const am = inv.find((x) => def(x).ammo === d.magOf); if (am) this._loadMag(it, am, { type: 'inv' }); }]);
      if (d.gun && it.mag) acts.push(['Remove magazine', () => { const m = it.mag; it.mag = null; if (!inv.add(m, { noWear: true })) O.loot.drop(m, O.player.pos.x, O.player.pos.y, O.player.pos.z); if (it === inv.slots.hands) { O.weapons.curUid = -1; O.weapons.refresh(); } inv.changed(); }]);
      if (d.gun && d.internal && (it.rounds > 0 || it.chamber)) acts.push(['Unload rounds', () => { let left = it.rounds + (it.chamber ? 1 : 0); it.rounds = 0; it.chamber = false; const id = CALIBRES[d.cal].item; while (left > 0) { const k = Math.min(ITEMS[id].stack, left); left -= k; const box = makeItem(id, { n: k }); if (!inv.add(box)) O.loot.drop(box, O.player.pos.x, O.player.pos.y, O.player.pos.z); } inv.changed(); }]);
      if (d.gun) for (const [slot, a] of Object.entries(it.attach || {})) if (a) acts.push(['Detach ' + (ITEMS[a]?.name || a), () => { it.attach[slot] = null; const o = makeItem(a); if (!inv.add(o)) O.loot.drop(o, O.player.pos.x, O.player.pos.y, O.player.pos.z); if (it === inv.slots.hands) { O.weapons.curUid = -1; O.weapons.refresh(); } inv.changed(); }]);
      if (d.stack > 1 && it.n > 1) acts.push(['Split', () => { const loc = inv.locate(it); const half = Math.floor(it.n / 2); const o = makeItem(it.id, { n: half, cond: it.cond }); const sp = loc?.grid?.space(o); if (sp) { it.n -= half; loc.grid.put(o, sp[0], sp[1], sp[2]); inv.changed(); } else O.hud?.note('No room to split it', 1.5); }]);
      if (d.refill && it.n > 0) acts.push(['Empty it', () => { it.n = 0; inv.changed(); }]);
      for (let i = 0; i < 3; i++) void i;
      acts.push(['Drop', () => { if (it === inv.slots.hands) inv.slots.hands = null; this._lift(it, src); O.loot.drop(it, O.player.pos.x, O.player.pos.y, O.player.pos.z); inv.changed(); O.weapons.refresh(); }]);
    }
    if (!acts.length) return;
    const m = document.createElement('div'); m.className = 'ob-menu';
    for (const [label, fn] of acts) { const r = document.createElement('div'); r.textContent = label; r.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._closeMenu(); fn(); this.render(); O.hud?.changed(); }); m.appendChild(r); }
    m.style.left = Math.min(innerWidth - 190, ev.clientX) + 'px'; m.style.top = Math.min(innerHeight - acts.length * 34 - 10, ev.clientY) + 'px';
    document.body.appendChild(m);
    this.menu = m;
  }
  _closeMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } }
}

/** Would dropping a onto b do something? */
export function combineWith(a, b) {
  const da = def(a), db = def(b);
  return (a.id === b.id && da.stack > 1) || (da.ammo && (db.magOf === da.ammo || (db.gun && db.internal && db.cal === da.ammo))) || (da.magOf && db.gun && db.mag === a.id) || (da.attach && db.gun && db.attach?.includes(da.attach)) || (da.battery === true && db.light) || (da.repair && !db.wear) || (da.repairCloth && db.wear) || (da.med?.purify && db.refill);
}
export { SLOTS };
