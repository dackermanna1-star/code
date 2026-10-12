// Inventory / wand editing screen (Tab). Layout follows Noita: WANDS | ITEMS | SPELLS on top,
// one card per wand below with its stats and spell slots. Drag & drop to move spells.
import { Inventory, potionName } from '../game/inventory';
import { Wand } from '../magic/casting';
import { SPELLS } from '../magic/spells';
import type { SpellInstance } from '../magic/types';
import { spellIconUrl, wandIconUrl, potionIconUrl } from './icons';

type Loc = { kind: 'wandspell'; wand: number; slot: number } | { kind: 'inv'; slot: number } | { kind: 'wand'; slot: number } | { kind: 'item'; slot: number };

export interface InventoryCallbacks {
  canEdit: () => boolean;
  dropWand: (w: Wand) => void;
  dropSpell: (s: SpellInstance) => void;
  dropItem: (slot: number) => void;
  changed: () => void;
  sound: (name: string) => void;
}

const fmt = (frames: number) => `${(frames / 60).toFixed(2)} s`;

export class InventoryUI {
  readonly root: HTMLDivElement;
  open = false;
  private drag: { loc: Loc; ghost: HTMLImageElement } | null = null;
  private tooltip: HTMLDivElement;

  constructor(parent: HTMLElement, private inv: Inventory, private cb: InventoryCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'inventory hidden';
    parent.appendChild(this.root);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip noita-panel hidden';
    parent.appendChild(this.tooltip);
    window.addEventListener('mousemove', (e) => {
      if (this.drag) {
        this.drag.ghost.style.left = `${e.clientX - 18}px`;
        this.drag.ghost.style.top = `${e.clientY - 18}px`;
      }
      if (!this.tooltip.classList.contains('hidden')) {
        this.tooltip.style.left = `${Math.min(window.innerWidth - 300, e.clientX + 16)}px`;
        this.tooltip.style.top = `${Math.min(window.innerHeight - 220, e.clientY + 16)}px`;
      }
    });
    window.addEventListener('mouseup', (e) => this.endDrag(e));
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.root.classList.toggle('hidden', !this.open);
    this.tooltip.classList.add('hidden');
    if (this.open) this.render();
    else if (this.drag) {
      this.drag.ghost.remove();
      this.drag = null;
    }
  }

  render(): void {
    if (!this.open) return;
    const inv = this.inv;
    const canEdit = this.cb.canEdit();
    const slot = (loc: Loc, content: string, extra = '') =>
      `<div class="islot ${extra}" data-loc='${JSON.stringify(loc)}'>${content}</div>`;
    const spellImg = (s: SpellInstance | null) =>
      s ? `<img src="${spellIconUrl(s.id)}" draggable="false">${s.uses >= 0 ? `<span class="cnt">${s.uses}</span>` : ''}` : '';
    let html = `<div class="inv-top noita-panel">
      <div class="col"><div class="hdr">WANDS</div><div class="row">${inv.wands
        .map((w, i) => slot({ kind: 'wand', slot: i }, w ? `<img src="${wandIconUrl(w.stats)}" draggable="false">` : '', inv.selected === i ? 'sel' : ''))
        .join('')}</div></div>
      <div class="col"><div class="hdr">ITEMS</div><div class="row">${inv.items
        .map((it, i) => slot({ kind: 'item', slot: i }, it ? `<img src="${potionIconUrl(it)}" draggable="false">` : '', inv.selected === i + 4 ? 'sel' : ''))
        .join('')}</div></div>
      <div class="col spells"><div class="hdr">SPELLS</div><div class="row">${inv.spells.map((s, i) => slot({ kind: 'inv', slot: i }, spellImg(s))).join('')}</div></div>
    </div>
    <div class="inv-edit-hint ${canEdit ? 'ok' : ''}">${canEdit ? 'Holy Mountain: you may modify your wands. Drag spells to rearrange them.' : 'Wands can only be modified in a Holy Mountain. You can still sort your spell bag, and drag items out of the panel to drop them.'}</div>
    <div class="inv-wands">`;
    inv.wands.forEach((w, wi) => {
      if (!w) return;
      const s = w.stats;
      html += `<div class="wandcard noita-panel ${inv.selected === wi ? 'sel' : ''}">
        <div class="wc-head"><img class="wc-icon" src="${wandIconUrl(s)}" draggable="false"><div class="wc-name">${s.name}</div></div>
        <div class="wc-stats">
          <div><span>Shuffle</span><b>${s.shuffle ? 'Yes' : 'No'}</b></div>
          <div><span>Spells/Cast</span><b>${s.actionsPerRound}</b></div>
          <div><span>Cast delay</span><b>${fmt(s.castDelay)}</b></div>
          <div><span>Rech. Time</span><b>${fmt(s.rechargeTime)}</b></div>
          <div><span>Mana max</span><b>${Math.round(s.manaMax)}</b></div>
          <div><span>Mana chg. Spd</span><b>${Math.round(s.manaChargeSpeed)}</b></div>
          <div><span>Capacity</span><b>${s.capacity}</b></div>
          <div><span>Spread</span><b>${s.spread.toFixed(1)} DEG</b></div>
        </div>
        ${w.alwaysCast.length ? `<div class="wc-ac">Always casts: ${w.alwaysCast.map((id) => `<img src="${spellIconUrl(id)}" title="${SPELLS[id]?.name}">`).join('')}</div>` : ''}
        <div class="wc-slots">${w.spells.map((sp, si) => slot({ kind: 'wandspell', wand: wi, slot: si }, spellImg(sp), canEdit ? '' : 'locked')).join('')}</div>
        <div class="wc-order">Next: ${w.deckPreview().slice(0, 8).map((id) => `<img src="${spellIconUrl(id)}">`).join('') || '<i>recharging</i>'}</div>
      </div>`;
    });
    html += `</div><div class="inv-foot">Tab: close · Drag outside to drop · Right-click a spell for details</div>`;
    this.root.innerHTML = html;
    this.root.querySelectorAll('.islot').forEach((el) => {
      const loc = JSON.parse((el as HTMLElement).dataset.loc!) as Loc;
      el.addEventListener('mousedown', (e) => this.beginDrag(loc, e as MouseEvent));
      el.addEventListener('mouseenter', () => this.showTip(loc));
      el.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
    });
  }

  private get(loc: Loc): unknown {
    const inv = this.inv;
    switch (loc.kind) {
      case 'wandspell':
        return inv.wands[loc.wand]?.spells[loc.slot] ?? null;
      case 'inv':
        return inv.spells[loc.slot];
      case 'wand':
        return inv.wands[loc.slot];
      case 'item':
        return inv.items[loc.slot];
    }
  }

  private showTip(loc: Loc): void {
    const v = this.get(loc);
    if (!v) return;
    let html = '';
    if (loc.kind === 'wandspell' || loc.kind === 'inv') {
      const s = v as SpellInstance;
      const d = SPELLS[s.id];
      if (!d) return;
      html = `<div class="tt-title">${d.name}</div><div class="tt-type">${d.type}</div><div class="tt-desc">${d.description}</div>
        <div class="tt-stats"><div><span>Mana drain</span><b>${d.mana}</b></div>${s.uses >= 0 ? `<div><span>Uses remaining</span><b>${s.uses}</b></div>` : ''}
        ${Object.entries(d.stats).map(([k, val]) => `<div><span>${k}</span><b>${val}</b></div>`).join('')}</div>`;
    } else if (loc.kind === 'wand') {
      html = `<div class="tt-title">${(v as Wand).stats.name}</div><div class="tt-desc">Drag outside the panel to drop the wand.</div>`;
    } else if (loc.kind === 'item') {
      html = `<div class="tt-title">${potionName(v as never)}</div><div class="tt-desc">LMB: pour · RMB: throw · R: drink · E (aiming at liquid): fill</div>`;
    }
    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
  }

  private beginDrag(loc: Loc, e: MouseEvent): void {
    if (e.button !== 0) return;
    const v = this.get(loc);
    if (!v) return;
    if (loc.kind === 'wandspell' && !this.cb.canEdit()) {
      this.cb.sound('not_enough_mana');
      return;
    }
    const img = (e.currentTarget as HTMLElement).querySelector('img');
    if (!img) return;
    const ghost = img.cloneNode() as HTMLImageElement;
    ghost.className = 'drag-ghost';
    ghost.style.left = `${e.clientX - 18}px`;
    ghost.style.top = `${e.clientY - 18}px`;
    document.body.appendChild(ghost);
    this.drag = { loc, ghost };
    e.preventDefault();
  }

  private endDrag(e: MouseEvent): void {
    if (!this.drag) return;
    const { loc, ghost } = this.drag;
    ghost.remove();
    this.drag = null;
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.islot') as HTMLElement | null;
    const insidePanel = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.inventory');
    if (!target) {
      if (!insidePanel) this.dropOut(loc);
      return;
    }
    const to = JSON.parse(target.dataset.loc!) as Loc;
    this.move(loc, to);
  }

  private dropOut(loc: Loc): void {
    const inv = this.inv;
    if (loc.kind === 'wand' && inv.wands[loc.slot]) {
      this.cb.dropWand(inv.wands[loc.slot]!);
      inv.wands[loc.slot] = null;
    } else if (loc.kind === 'inv' && inv.spells[loc.slot]) {
      this.cb.dropSpell(inv.spells[loc.slot]!);
      inv.spells[loc.slot] = null;
    } else if (loc.kind === 'wandspell' && this.cb.canEdit()) {
      const w = inv.wands[loc.wand]!;
      const s = w.spells[loc.slot];
      if (s) {
        this.cb.dropSpell(s);
        w.spells[loc.slot] = null;
        w.refreshDeck();
      }
    } else if (loc.kind === 'item' && inv.items[loc.slot]) {
      this.cb.dropItem(loc.slot);
    }
    this.cb.changed();
    this.render();
  }

  /** Swap contents of two compatible locations. */
  move(from: Loc, to: Loc): boolean {
    const inv = this.inv;
    const isSpell = (l: Loc) => l.kind === 'wandspell' || l.kind === 'inv';
    const canEdit = this.cb.canEdit();
    let ok = false;
    if (isSpell(from) && isSpell(to)) {
      if ((from.kind === 'wandspell' || to.kind === 'wandspell') && !canEdit) return false;
      const a = this.get(from) as SpellInstance | null;
      const b = this.get(to) as SpellInstance | null;
      this.setSpell(from, b);
      this.setSpell(to, a);
      ok = true;
    } else if (from.kind === 'wand' && to.kind === 'wand') {
      const t = inv.wands[to.slot];
      inv.wands[to.slot] = inv.wands[from.slot];
      inv.wands[from.slot] = t;
      ok = true;
    } else if (from.kind === 'item' && to.kind === 'item') {
      const t = inv.items[to.slot];
      inv.items[to.slot] = inv.items[from.slot];
      inv.items[from.slot] = t;
      ok = true;
    }
    if (ok) {
      this.cb.sound('wand_edit');
      this.cb.changed();
      this.render();
    }
    return ok;
  }

  private setSpell(loc: Loc, s: SpellInstance | null): void {
    if (loc.kind === 'inv') this.inv.spells[loc.slot] = s;
    else if (loc.kind === 'wandspell') {
      const w = this.inv.wands[loc.wand]!;
      w.spells[loc.slot] = s;
      w.refreshDeck();
    }
  }
}
