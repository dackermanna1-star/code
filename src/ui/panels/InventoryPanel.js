// Inventory screen: paper-doll + equipment (left), carried containers (middle), loot sources (right).
// All mutations go through moveStack / quickMove / splitStack followed by game.onItemMoved().
import { EQUIP_SLOTS, EQUIP_LABELS, moveStack, quickMove } from '../../inventory/Inventory.js';
import { getItemDef, canStack, itemWeight, itemDisplayName } from '../../items/items.js';
import { getItemIconURL } from '../../items/icons.js';
import { h, clear, setText, setStyle, setClass, clamp, fmtKg } from '../dom.js';
import { pixelImg } from '../pixel.js';
import { makeSlot, fillSlot, setSilhouette } from '../slots.js';
import { makeFigure } from '../figure.js';

const KIND_ICON = { world: 'box', floor: 'ground', corpse: 'skull', vehicle: 'car', clothing: 'bag', hotbar: 'hand' };
const LEFT_EQ = ['head', 'face', 'torso', 'jacket', 'vest'];
const RIGHT_EQ = ['back', 'hands', 'legs', 'feet'];
const PLAYER_KINDS = new Set(['hotbar', 'equipment', 'clothing']);

export class InventoryPanel {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.descs = new Map();
    this.explicitLoot = null;
    this.lootDescs = [];
    this.press = null;
    this.drag = null;
    this.hover = null;
    this.lastClick = null;
    this.version = -1;
    this.lootSig = '';
    this.pollT = 0;
    this.build();
  }

  get inv() { return this.game.player?.inv; }

  // ------------------------------------------------------------------ build
  build() {
    this.el = h('div.panel.inv-panel');

    // --- left: character / equipment
    this.eqSlots = {};
    const eqCol = (slots) => h('div.doll-col', slots.map((s) => {
      const el = makeSlot('eq');
      el.dataset.key = 'equipment';
      el.dataset.i = String(EQUIP_SLOTS.indexOf(s));
      el.dataset.eq = s;
      setSilhouette(el, 'eq_' + s);
      el.appendChild(h('span.eq-label', EQUIP_LABELS[s] || s));
      this.eqSlots[s] = el;
      return el;
    }));
    this.figure = makeFigure(8, 'doll-fig');
    this.charName = h('span.col-sub');
    this.weightText = h('span.wt-val');
    this.weightFill = h('i');
    this.weightMark = h('i.wt-mark');
    this.weightBar = h('div.wt-bar', this.weightFill, this.weightMark);
    this.armor = {
      bite: h('b'), scratch: h('b'), warmth: h('b'),
    };
    this.left = h('div.inv-col.inv-char',
      h('div.col-head', h('span.col-title', 'Survivor'), this.charName),
      h('div.doll', eqCol(LEFT_EQ), h('div.doll-mid', this.figure.el), eqCol(RIGHT_EQ)),
      h('div.wt', h('div.wt-row', h('span.wt-label', 'Carry weight'), this.weightText), this.weightBar),
      h('div.armor',
        h('div.armor-chip', h('span', 'Bite'), this.armor.bite),
        h('div.armor-chip', h('span', 'Scratch'), this.armor.scratch),
        h('div.armor-chip', h('span', 'Warmth'), this.armor.warmth)),
      h('div.inv-help',
        h('div', h('span.key.sm', 'LMB'), ' drag stack'),
        h('div', h('span.key.sm', 'RMB'), ' drag half / actions'),
        h('div', h('span.key.sm', 'Shift'), ' quick move'),
        h('div', h('span.key.sm', '1-9'), ' to hotbar · ', h('span.key.sm', 'Q'), ' drop')));

    // --- middle: carried containers
    this.playerTotal = h('span.col-sub');
    this.playerScroll = h('div.inv-scroll');
    this.mid = h('div.inv-col.inv-player',
      h('div.col-head', h('span.col-title', 'Inventory'), this.playerTotal), this.playerScroll);

    // --- right: loot
    this.lootCount = h('span.col-sub');
    this.lootScroll = h('div.inv-scroll');
    this.right = h('div.inv-col.inv-loot',
      h('div.col-head', h('span.col-title', 'Nearby'), this.lootCount), this.lootScroll);

    this.el.append(this.left, this.mid, this.right);

    // ghost for dragging
    this.ghostImg = h('img.px', { draggable: false, alt: '' });
    this.ghostCount = h('span.slot-count');
    this.ghostLabel = h('span.ghost-label', 'Drop');
    this.ghost = h('div.drag-ghost.hidden', this.ghostImg, this.ghostCount, this.ghostLabel);

    // events
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this._move = (e) => this.onMove(e);
    this._up = (e) => this.onUp(e);
    this.el.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.ui.tooltip.hide(); } });
  }

  onShow(lootSources) {
    this.explicitLoot = Array.isArray(lootSources) ? lootSources : null;
    if (!this.ghost.parentNode) this.ui.root.appendChild(this.ghost);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    this.render();
  }

  onHide() {
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    this.cancelDrag();
    this.press = null;
    this.hover = null;
    this.explicitLoot = null;
    this.ui.tooltip.hide();
  }

  getLoot() {
    if (this.explicitLoot) return this.explicitLoot;
    try { return this.game.getLootSources?.() || []; } catch (e) { console.warn('getLootSources failed', e); return []; }
  }

  // ------------------------------------------------------------------ render
  reg(desc) { this.descs.set(desc.key, desc); return desc; }

  render() {
    const inv = this.inv;
    if (!inv) return;
    const p = this.game.player;
    this.descs.clear();
    this.version = inv.version;
    const eq = this.reg(inv.equipmentDesc());
    const hb = this.reg(inv.hotbarDesc());
    const storage = inv.storageDescs().map((d) => this.reg(d));
    this.hotbar = hb;
    this.equipment = eq;
    this.storage = storage;

    // equipment
    EQUIP_SLOTS.forEach((s, i) => {
      const el = this.eqSlots[s];
      if (el) fillSlot(el, eq.slots[i]);
    });
    const clad = (s) => !!inv.getEquipped(s);
    setClass(this.figure.parts.head, 'clad', clad('head'));
    setClass(this.figure.parts.torso, 'clad', clad('torso') || clad('jacket') || clad('vest'));
    setClass(this.figure.parts.torso, 'armored', clad('vest'));
    setClass(this.figure.parts.armL, 'clad', clad('jacket') || clad('torso'));
    setClass(this.figure.parts.armR, 'clad', clad('jacket') || clad('torso'));
    setClass(this.figure.parts.legL, 'clad', clad('legs'));
    setClass(this.figure.parts.legR, 'clad', clad('legs'));
    this.paintDoll(inv);
    setText(this.charName, p.name || '');

    // weight
    const w = inv.totalWeight();
    const mw = p.maxWeight || inv.maxWeight || 22;
    const scaleMax = Math.max(mw * 1.5, w);
    setText(this.weightText, `${fmtKg(w)} / ${fmtKg(mw)} kg`);
    setStyle(this.weightFill, 'width', clamp((w / scaleMax) * 100, 0, 100).toFixed(1) + '%');
    setStyle(this.weightMark, 'left', ((mw / scaleMax) * 100).toFixed(1) + '%');
    const ratio = w / mw;
    setClass(this.weightBar, 'warn', ratio > 0.85 && ratio <= 1);
    setClass(this.weightBar, 'over', ratio > 1);
    setClass(this.weightText, 'over', ratio > 1);
    const arm = p.armor || {};
    setText(this.armor.bite, pct(arm.bite));
    setText(this.armor.scratch, pct(arm.scratch));
    setText(this.armor.warmth, pct(p.insulation));

    // player containers
    const st1 = this.playerScroll.scrollTop;
    clear(this.playerScroll);
    this.playerScroll.appendChild(this.section(hb, 'player', { title: 'Hotbar', icon: 'hand', selected: inv.selected }));
    for (const d of storage) this.playerScroll.appendChild(this.section(d, 'player'));
    if (!storage.length) {
      this.playerScroll.appendChild(h('div.inv-empty', 'No pockets or bags. Wear clothing with pockets or a backpack to carry more.'));
    }
    this.playerScroll.scrollTop = st1;
    const usedSlots = storage.reduce((n, d) => n + d.slots.filter(Boolean).length, 0);
    const totSlots = storage.reduce((n, d) => n + d.slots.length, 0);
    setText(this.playerTotal, `${usedSlots}/${totSlots} slots`);

    // loot
    const loot = this.getLoot();
    this.lootDescs = loot.map((d) => this.reg(d));
    const st2 = this.lootScroll.scrollTop;
    clear(this.lootScroll);
    for (const d of loot) this.lootScroll.appendChild(this.section(d, 'loot'));
    if (!loot.length) this.lootScroll.appendChild(h('div.inv-empty', 'Nothing within reach.'));
    this.lootScroll.scrollTop = st2;
    setText(this.lootCount, loot.length ? `${loot.length} source${loot.length > 1 ? 's' : ''}` : '');
    this.lootSig = this.computeLootSig(loot);

    // restore hover tooltip
    if (this.hover && !this.drag) this.refreshHover();
  }

  /** Tint the paper-doll with the colours of what is worn (outermost layer; gloves / shoes at the ends). */
  paintDoll(inv) {
    const col = (slot) => {
      const st = inv.getEquipped(slot);
      return st ? getItemDef(st.id).icon?.color || '#6b5841' : null;
    };
    const P = this.figure.parts;
    const paint = (el, main, end, endFrac) => {
      const sig = (main || '') + '|' + (end || '');
      if (el._paint === sig) return;
      el._paint = sig;
      if (!main && !end) { el.style.background = ''; return; }
      const m = main || '#4e483f';
      el.style.background = end
        ? `linear-gradient(to bottom, ${m} 0, ${m} ${100 - endFrac}%, ${end} ${100 - endFrac}%, ${end} 100%)`
        : m;
    };
    paint(P.head, col('head'), null, 0);
    const torso = col('vest') || col('jacket') || col('torso');
    paint(P.torso, torso, null, 0);
    const sleeve = col('jacket') || (inv.getEquipped('torso') && inv.getEquipped('torso').id !== 'tank_top' ? col('torso') : null);
    paint(P.armL, sleeve, col('hands'), 22);
    paint(P.armR, sleeve, col('hands'), 22);
    paint(P.legL, col('legs'), col('feet'), 18);
    paint(P.legR, col('legs'), col('feet'), 18);
  }

  section(desc, side, opt = {}) {
    const used = desc.slots.filter(Boolean).length;
    let weight = 0;
    for (const s of desc.slots) weight += itemWeight(s);
    const icon = opt.icon || KIND_ICON[desc.kind] || 'box';
    const def = desc.owner ? getItemDef(desc.owner.id) : null;
    const red = def && def.weightReduction ? h('span.sec-red', `-${Math.round(def.weightReduction * 100)}% wt`) : null;
    const head = h('div.sec-head',
      pixelImg(icon, 'sec-ico'),
      h('span.sec-name', opt.title || desc.name || desc.key),
      red,
      h('span.sec-fill', `${used}/${desc.slots.length}`),
      h('span.sec-wt', `${fmtKg(weight)} kg`));
    if (side === 'loot' && used > 0) {
      const take = h('button.sec-take', { text: 'Take all', type: 'button' });
      take.addEventListener('pointerdown', (e) => e.stopPropagation());
      take.addEventListener('click', (e) => { e.stopPropagation(); this.takeAll(desc); });
      head.appendChild(take);
    }
    const grid = h('div.slot-grid');
    desc.slots.forEach((st, i) => {
      const s = makeSlot();
      s.dataset.key = desc.key;
      s.dataset.i = String(i);
      fillSlot(s, st);
      if (opt.selected === i) s.classList.add('sel');
      if (desc.kind === 'hotbar') s.appendChild(h('span.slot-num', String(i + 1)));
      grid.appendChild(s);
    });
    return h('div.inv-section.k-' + desc.kind, { dataset: { key: desc.key } }, head, grid);
  }

  computeLootSig(loot) {
    let s = '';
    for (const d of loot) {
      s += d.key + ':' + d.slots.length + '[';
      for (const st of d.slots) s += st ? st.id + 'x' + (st.count || 1) + (st.dur != null ? 'd' + st.dur : '') + ',' : '-,';
      s += ']';
    }
    return s;
  }

  update(dt) {
    const inv = this.inv;
    if (!inv) return;
    if (this.drag) return; // never re-render under the cursor while dragging
    if (inv.version !== this.version) { this.render(); return; }
    this.pollT -= dt;
    if (this.pollT <= 0) {
      this.pollT = 0.3;
      const sig = this.computeLootSig(this.getLoot());
      if (sig !== this.lootSig) this.render();
    }
  }

  refresh() { if (!this.drag) this.render(); }

  // ------------------------------------------------------------------ helpers
  slotFromEl(el) {
    const s = el && el.closest ? el.closest('.slot') : null;
    if (!s || !this.el.contains(s) || s.dataset.key == null) return null;
    const desc = this.descs.get(s.dataset.key);
    if (!desc) return null;
    return { el: s, desc, i: +s.dataset.i };
  }

  sideOf(desc) { return PLAYER_KINDS.has(desc.kind) ? 'player' : 'loot'; }

  playerTargets(stack) {
    const def = getItemDef(stack.id);
    const preferHotbar = !!(def.melee || def.firearm || def.throwable || def.category === 'weapon' || def.category === 'tool');
    return preferHotbar ? [this.hotbar, ...this.storage] : [...this.storage, this.hotbar];
  }

  quickTargets(desc) {
    if (this.sideOf(desc) === 'loot') return this.playerTargets(desc.slots[this._qi] || { id: 'unknown' });
    if (this.lootDescs.length && desc.kind !== 'equipment') return this.lootDescs;
    if (desc.kind === 'hotbar') return this.storage;
    if (desc.kind === 'equipment') return [...this.storage.filter((d) => d.owner !== desc.slots[this._qi]), this.hotbar];
    return [this.hotbar, ...this.storage.filter((d) => d !== desc)];
  }

  snapshot(targets) {
    return targets.map((t) => t.slots.map((s) => (s ? [s, s.count || 1] : null)));
  }

  diff(targets, snap) {
    for (let k = 0; k < targets.length; k++) {
      const t = targets[k];
      for (let j = 0; j < t.slots.length; j++) {
        const a = snap[k][j];
        const b = t.slots[j];
        if ((a ? a[0] : null) !== b || (b && a && a[1] !== (b.count || 1))) return { desc: t, i: j };
      }
    }
    return null;
  }

  notifyMoved(src, si, dst, di) {
    try { this.game.onItemMoved?.(src, si, dst, di); } catch (e) { console.error('onItemMoved failed', e); }
  }

  deny(el) {
    if (!el) return;
    el.classList.remove('deny');
    void el.offsetWidth; // restart animation (rare, user action only)
    el.classList.add('deny');
    this.ui.sound('ui_hover', 0.4, 0.6);
  }

  // ------------------------------------------------------------------ actions
  doQuickMove(desc, i, slotEl) {
    if (!desc.slots[i]) return;
    this._qi = i;
    const targets = this.quickTargets(desc).filter(Boolean);
    const snap = this.snapshot(targets);
    const moving = desc.slots[i];
    const ok = quickMove(desc, i, targets);
    if (ok) {
      const d = this.diff(targets, snap);
      if (desc.kind === 'equipment') this.spillUnequipped(moving, EQUIP_SLOTS[i]);
      this.notifyMoved(desc, i, d ? d.desc : targets[0], d ? d.i : -1);
      this.render();
    } else this.deny(slotEl);
  }

  /**
   * A worn piece of clothing just went into your inventory: empty its pockets into what you still wear
   * (a backpack keeps its contents). Pocket items would otherwise be stuck inside a jacket in your bag.
   */
  spillUnequipped(stack, slot, swapped = false) {
    if (!stack || !stack.contents || !stack.contents.some(Boolean)) return;
    if (!this.inv.spillContents || (slot === 'back' && !swapped)) return;
    let carried = swapped;
    for (const d of [this.inv.hotbarDesc(), ...this.inv.storageDescs()]) if (d.slots.includes(stack)) carried = true;
    if (!carried) return;
    const n = this.inv.spillContents(stack);
    if (n) this.ui.toast(`Moved ${n} item${n > 1 ? 's' : ''} out of the ${getItemDef(stack.id).name}.`, 'info');
  }

  takeAll(desc) {
    let any = false;
    for (let i = 0; i < desc.slots.length; i++) {
      const st = desc.slots[i];
      if (!st) continue;
      const targets = this.playerTargets(st);
      const snap = this.snapshot(targets);
      if (quickMove(desc, i, targets)) {
        any = true;
        const d = this.diff(targets, snap);
        this.notifyMoved(desc, i, d ? d.desc : targets[0], d ? d.i : -1);
      }
    }
    if (!any) this.ui.toast('No room to carry that.', 'warn');
    this.render();
  }

  /** move up to `count` of src[si] into any fitting slot of dst. Returns first index used or -1. */
  moveInto(src, si, dst, count) {
    const a = src.slots[si];
    if (!a) return -1;
    let left = Math.min(count, a.count || 1);
    let first = -1;
    for (let j = 0; j < dst.slots.length && left > 0 && src.slots[si]; j++) {
      if (src === dst && j === si) continue;
      const b = dst.slots[j];
      if (b && canStack(b, a)) {
        const before = a.count || 1;
        if (moveStack(src, si, dst, j, left)) {
          const after = src.slots[si] ? src.slots[si].count || 1 : 0;
          left -= before - after;
          if (first < 0) first = j;
        }
      }
    }
    if (left > 0 && src.slots[si]) {
      for (let j = 0; j < dst.slots.length; j++) {
        if (dst.slots[j] || (src === dst && j === si)) continue;
        if (moveStack(src, si, dst, j, left)) { if (first < 0) first = j; break; }
      }
    }
    return first;
  }

  equipIndexFor(stack) {
    const def = getItemDef(stack.id);
    if (!def.clothing) return -1;
    return EQUIP_SLOTS.indexOf(def.clothing.slot);
  }

  useItem(desc, i) {
    if (!desc.slots[i]) return;
    try { this.game.useItem?.(desc, i); } catch (e) { console.error('useItem failed', e); }
    this.ui.refresh();
  }

  openMenu(desc, i, x, y) {
    const st = desc.slots[i];
    if (!st) return;
    let actions = null;
    try { actions = this.game.getItemActions?.(desc, i); } catch (e) { console.warn('getItemActions failed', e); }
    if (!actions) {
      actions = [
        { label: 'Use', run: () => this.game.useItem?.(desc, i) },
        { label: 'Drop', run: () => this.game.dropItem?.(desc, i) },
      ];
    }
    this.ui.tooltip.hide();
    this.ui.ctx.show(x, y, safeName(st), actions);
  }

  // ------------------------------------------------------------------ pointer handling
  onDown(e) {
    if (e.button !== 0 && e.button !== 2) return;
    const hit = this.slotFromEl(e.target);
    if (!hit) return;
    e.preventDefault();
    const stack = hit.desc.slots[hit.i];
    this.press = {
      ...hit, button: e.button, x: e.clientX, y: e.clientY, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, stack,
    };
  }

  onMove(e) {
    if (this.drag) {
      this.moveGhost(e.clientX, e.clientY);
      this.updateDropTarget(e.clientX, e.clientY);
      return;
    }
    if (this.press && this.press.stack) {
      const dx = e.clientX - this.press.x, dy = e.clientY - this.press.y;
      if (dx * dx + dy * dy > 25) { this.startDrag(e); return; }
    }
    // hover tooltip
    const hit = this.slotFromEl(document.elementFromPoint(e.clientX, e.clientY));
    if (hit) {
      this.hover = { key: hit.desc.key, i: hit.i, x: e.clientX, y: e.clientY };
      this.refreshHover();
    } else if (this.hover) {
      this.hover = null;
      this.ui.tooltip.hide();
    }
  }

  refreshHover() {
    const hv = this.hover;
    if (!hv) return;
    const desc = this.descs.get(hv.key);
    const st = desc && desc.slots[hv.i];
    if (this.ui.ctx.open) return;
    if (st) {
      const hint = this.sideOf(desc) === 'loot' ? 'Shift: take' : desc.kind === 'equipment' ? 'Shift: unequip' : 'Dbl-click: use';
      this.ui.tooltip.show(st, hv.x, hv.y, hint);
    } else if (desc && desc.kind === 'equipment') {
      this.ui.tooltip.showText(EQUIP_LABELS[EQUIP_SLOTS[hv.i]] || 'Slot', 'Empty', hv.x, hv.y);
    } else this.ui.tooltip.hide();
  }

  startDrag(e) {
    const p = this.press;
    const n = p.stack.count || 1;
    const half = p.button === 2 || p.ctrl;
    const count = half ? Math.max(1, Math.ceil(n / 2)) : n;
    this.drag = { desc: p.desc, i: p.i, stack: p.stack, count, srcEl: p.el };
    this.press = null;
    this.ui.tooltip.hide();
    this.ui.ctx.hide();
    this.ghostImg.src = getItemIconURL(getItemDef(p.stack.id));
    setText(this.ghostCount, count > 1 ? count : '');
    this.ghost.classList.remove('hidden');
    p.el.classList.add('drag-src');
    this.el.classList.add('dragging');
    this.moveGhost(e.clientX, e.clientY);
    this.updateDropTarget(e.clientX, e.clientY);
  }

  moveGhost(x, y) {
    this.ghost.style.transform = `translate(${x}px, ${y}px)`;
  }

  updateDropTarget(x, y) {
    const t = document.elementFromPoint(x, y);
    const hit = this.slotFromEl(t);
    const prev = this.dropEl;
    let el = null, cls = '';
    if (hit) {
      el = hit.el;
      cls = this.canDropOn(hit.desc, hit.i) ? 'drop-ok' : 'drop-bad';
    } else {
      const sec = t && t.closest ? t.closest('.inv-section') : null;
      if (sec && this.el.contains(sec)) { el = sec; cls = 'drop-ok'; }
    }
    if (prev && (prev !== el || prev._dcls !== cls)) prev.classList.remove('drop-ok', 'drop-bad');
    if (el && cls) { el.classList.add(cls); el._dcls = cls; }
    this.dropEl = el;
    const outside = !t || !t.closest || !t.closest('.frame');
    setClass(this.ghost, 'outside', outside && !!this.game.dropItem);
  }

  canDropOn(desc, i) {
    const d = this.drag;
    if (!d) return false;
    if (desc === d.desc && i === d.i) return true;
    if (desc.accepts && !desc.accepts(d.stack, i)) {
      return desc.kind === 'equipment' && this.equipIndexFor(d.stack) >= 0;
    }
    return true;
  }

  cancelDrag() {
    if (!this.drag) return;
    this.drag.srcEl?.classList.remove('drag-src');
    this.drag = null;
    this.ghost.classList.add('hidden');
    this.el.classList.remove('dragging');
    if (this.dropEl) this.dropEl.classList.remove('drop-ok', 'drop-bad');
    this.dropEl = null;
  }

  onUp(e) {
    if (this.drag) {
      const d = this.drag;
      this.cancelDrag();
      this.finishDrag(d, e.clientX, e.clientY);
      return;
    }
    const p = this.press;
    this.press = null;
    if (!p) return;
    const hit = this.slotFromEl(document.elementFromPoint(e.clientX, e.clientY));
    if (!hit || hit.el !== p.el && (hit.desc !== p.desc || hit.i !== p.i)) return;
    if (p.button === 2) { this.openMenu(p.desc, p.i, e.clientX, e.clientY); return; }
    if (!p.stack) return;
    if (p.shift) { this.doQuickMove(p.desc, p.i, p.el); return; }
    const now = performance.now();
    const lc = this.lastClick;
    if (lc && lc.key === p.desc.key && lc.i === p.i && now - lc.t < 380) {
      this.lastClick = null;
      this.useItem(p.desc, p.i);
    } else this.lastClick = { key: p.desc.key, i: p.i, t: now };
  }

  finishDrag(d, x, y) {
    const src = d.desc, si = d.i;
    if (!src.slots[si]) { this.render(); return; }
    const t = document.elementFromPoint(x, y);
    const hit = this.slotFromEl(t);
    let ok = false, dst = null, di = -1, targetEl = null;
    if (hit) {
      dst = hit.desc; di = hit.i; targetEl = hit.el;
      if (dst === src && di === si) return;
      ok = moveStack(src, si, dst, di, d.count);
      if (!ok && dst.kind === 'equipment') {
        const ei = this.equipIndexFor(d.stack);
        if (ei >= 0 && ei !== di) { di = ei; ok = moveStack(src, si, dst, di, d.count); }
      }
    } else if (t && t.closest && t.closest('.doll-fig')) {
      dst = this.equipment; di = this.equipIndexFor(d.stack);
      if (di >= 0) ok = moveStack(src, si, dst, di, d.count);
    } else {
      const sec = t && t.closest ? t.closest('.inv-section') : null;
      if (sec && this.el.contains(sec)) {
        dst = this.descs.get(sec.dataset.key);
        targetEl = sec;
        if (dst && dst !== src) { di = this.moveInto(src, si, dst, d.count); ok = di >= 0; }
        else if (dst === src) return;
      } else if (!t || !t.closest || !t.closest('.frame')) {
        // dropped outside the window: drop on the ground
        if (this.game.dropItem) {
          try { this.game.dropItem(src, si, d.count); } catch (err) { console.error('dropItem failed', err); }
          this.render();
          return;
        }
      } else return;
    }
    if (!ok && dst && dst.kind === 'equipment' && this.equipIndexFor(d.stack) >= 0 && this.sideOf(src) === 'player' && this.game.itemActions?.equip) {
      // e.g. a new backpack dragged out of the backpack you are wearing: swap them properly
      try { this.game.itemActions.equip(src, si); } catch (err) { console.error('equip failed', err); }
      if (this.inv.equipment.includes(d.stack)) { this.render(); return; }
    }
    if (ok) {
      if (dst && dst.kind === 'equipment' && src.kind !== 'equipment') {
        // swapped: the piece you took off now sits where the new one was
        const old = src.slots[si];
        if (old && old !== d.stack) this.spillUnequipped(old, getItemDef(old.id).clothing?.slot, true);
      } else if (src.kind === 'equipment' && dst && dst.kind !== 'equipment') {
        this.spillUnequipped(d.stack, EQUIP_SLOTS[si]);
      }
      this.notifyMoved(src, si, dst, di);
      this.render();
    } else {
      this.deny(targetEl);
    }
  }

  // ------------------------------------------------------------------ keys
  handleKey(e) {
    const hv = this.hover;
    if (!hv) return false;
    const desc = this.descs.get(hv.key);
    if (!desc || !desc.slots[hv.i]) return false;
    const k = e.key;
    if (k >= '1' && k <= '9' && !e.ctrlKey && !e.altKey) {
      const di = +k - 1;
      if (desc === this.hotbar && di === hv.i) return true;
      if (moveStack(desc, hv.i, this.hotbar, di)) {
        this.notifyMoved(desc, hv.i, this.hotbar, di);
        this.render();
      } else this.deny(this.el.querySelector(`.slot[data-key="hotbar"][data-i="${di}"]`));
      return true;
    }
    if ((k === 'q' || k === 'Q') && this.game.dropItem) {
      const st = desc.slots[hv.i];
      const n = e.ctrlKey || e.shiftKey ? st.count || 1 : 1;
      try { this.game.dropItem(desc, hv.i, n); } catch (err) { console.error(err); }
      this.render();
      return true;
    }
    return false;
  }
}

function pct(v) {
  if (v == null || isNaN(v)) return '0%';
  return Math.round(clamp(v, 0, 1) * 100) + '%';
}

function safeName(stack) {
  try { return itemDisplayName(stack); } catch { return getItemDef(stack.id).name; }
}
