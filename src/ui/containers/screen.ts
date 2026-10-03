/**
 * Generic container screen: renders a ContainerMenu's slots at Minecraft GUI coordinates and
 * maps mouse/keyboard input to vanilla click types (port of AbstractContainerScreen input):
 * left/right click, shift-click, double-click collect (+shift double-click moves all matching),
 * drag distribution (left even / right one-each / middle clone in creative) with live preview,
 * number keys 1-9 / F swap with the hovered slot, Q / Ctrl+Q throw, middle-click clone,
 * click outside to drop, E/Esc to close (cursor stack returns to the inventory).
 *
 * Only slots whose stack changed are re-rendered (per-slot key compare when storage versions,
 * the cursor or the drag set change). Scales with `settings.guiScale` (0 = auto).
 */
import './containers.css';
import { h, type Screen, type UI } from '../ui';
import { itemIconElement, itemIconProvider } from '../hud';
import type { ItemStack } from '../../game/items/registry';
import { ContainerMenu, Slot, OUTSIDE, getQuickcraftMask, canItemQuickReplace, type ClickType } from '../../game/containers/menu';
import { stackKey, copyStack } from '../../game/containers/stacks';
import { tooltipLines, type TooltipLine } from './tooltip';
import { slotHint } from './widgets';
import { potionStackColor } from '../../game/brewing/potions';

const POTION_ITEMS = new Set(['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow']);

/** Build a stack visual (icon, count, durability, glint). Used by slots, the cursor and lists. */
export function stackVisual(s: ItemStack, opts: { count?: number | null; countClass?: string } = {}): HTMLElement {
  const wrap = h('div', { class: 'mcc-stack' });
  const icon = itemIconElement(s);
  // potions without a dedicated icon provider: tint the fallback swatch with the potion colour
  if (!itemIconProvider && POTION_ITEMS.has(s.item.name) && icon.classList.contains('swatch')) {
    const c = potionStackColor(s).toString(16).padStart(6, '0');
    icon.style.background = `radial-gradient(circle at 50% 62%, #${c} 0 45%, rgba(220,235,255,0.55) 47% 56%, transparent 58%)`;
    icon.style.boxShadow = 'none';
    icon.textContent = '';
  }
  wrap.append(icon);
  const enchanted = (s.ench && Object.keys(s.ench).length > 0) || s.item.name === 'enchanted_golden_apple' || s.item.name === 'experience_bottle' || s.item.name === 'nether_star';
  if (enchanted) {
    const g = h('div', { class: 'mcc-glint' });
    const src = icon instanceof HTMLImageElement ? icon.src : null;
    if (src) {
      (g.style as any).webkitMaskImage = `url("${src}")`;
      g.style.maskImage = `url("${src}")`;
    } else g.style.borderRadius = 'calc(var(--gp) * 2)';
    wrap.append(g);
  }
  const n = opts.count === undefined ? s.count : opts.count;
  if (n !== null && n !== 1) wrap.append(h('div', { class: 'mcc-count' + (opts.countClass ? ' ' + opts.countClass : '') }, String(n)));
  if (s.item.durability > 0 && s.damage > 0) {
    const f = Math.max(0, 1 - s.damage / s.item.durability);
    const w = Math.round(f * 13);
    const hue = Math.round(f * 120);
    wrap.append(h('div', { class: 'mcc-dur' }, h('div', { style: { width: `calc(var(--gp) * ${w})`, background: `hsl(${hue},100%,50%)` } })));
  }
  return wrap;
}

class SlotView {
  readonly el: HTMLElement;
  private holder: HTMLElement;
  private key = '\u0000';
  private hintEl: Element | null = null;
  constructor(readonly slot: Slot) {
    this.el = h('div', { class: 'mcc-slot' });
    this.el.dataset.slot = String(slot.index);
    this.holder = h('div', { class: 'mcc-item' });
    this.el.append(this.holder);
    if (slot.hint) {
      const hint = slotHint(slot.hint);
      if (hint) {
        hint.classList.add('mcc-hint');
        this.hintEl = hint;
        this.el.prepend(hint);
      }
    }
  }
  render(s: ItemStack | null, count?: number | null, countClass?: string) {
    const key = stackKey(s) + '|' + (count ?? '') + (countClass ?? '');
    if (key === this.key) return;
    this.key = key;
    this.holder.textContent = '';
    if (s) this.holder.append(stackVisual(s, { count, countClass }));
    if (this.hintEl) (this.hintEl as HTMLElement).style.display = s ? 'none' : '';
  }
}

export interface ContainerScreenOptions {
  /** Inventory label position (y); null = none. Defaults to height - 94. */
  inventoryLabelY?: number | null;
  inventoryLabelX?: number;
  titleX?: number;
  titleY?: number;
  /** Center the title (anvil/merchant style). */
  titleCentered?: boolean;
  /** Kind used for events (`containerOpen/Close`). */
  kind?: string;
  /** Extra info for events (block position ...). */
  pos?: { x: number; y: number; z: number };
  block?: string;
}

/** Compute the GUI scale (CSS px per GUI px). */
export function guiScale(ui: UI | null, w = 176, hgt = 166): number {
  const set = ui?.game?.settings?.guiScale ?? 2;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  let gp = set > 0 ? set : Math.max(1, Math.floor(Math.min(vw / 320, vh / 240)));
  while (gp > 1 && (w * gp > vw - 16 || hgt * gp > vh - 16)) gp -= 0.5;
  return gp;
}

export class ContainerScreen implements Screen {
  readonly el: HTMLElement;
  readonly wrap: HTMLElement;
  readonly win: HTMLElement;
  showHud = true;
  pauses = false;
  protected gp = 2;
  protected views: SlotView[] = [];
  protected cursorEl: HTMLElement;
  protected tipEl: HTMLElement;
  protected hovered: Slot | null = null;
  private mouseX = -1000;
  private mouseY = -1000;
  // vanilla click state
  private isQuickCrafting = false;
  private quickCraftingButton = 0;
  private quickCraftingType = 0;
  private readonly quickCraftSlots = new Set<Slot>();
  private skipNextRelease = false;
  private lastClickSlot: Slot | null = null;
  private lastClickTime = 0;
  private lastClickButton = -1;
  private doubleclick = false;
  private lastQuickMoved: ItemStack | null = null;
  private buttonsDown = 0;
  private versions = '';
  private cursorKey = '\u0000';
  private tipKey = '';
  protected dirty = true;
  private resizeFn = () => this.applyScale();
  /** Width/height of the window in GUI px. */
  readonly W: number;
  readonly H: number;

  constructor(readonly ui: UI, readonly menu: ContainerMenu, protected opts: ContainerScreenOptions = {}) {
    this.W = menu.width;
    this.H = menu.height;
    this.el = h('div', { class: 'mcc' });
    this.wrap = h('div', { class: 'mcc-wrap' });
    this.win = h('div', { class: 'mcc-win' });
    this.wrap.append(this.win);
    this.el.append(this.wrap);
    this.cursorEl = h('div', { class: 'mcc-cursor' });
    this.tipEl = h('div', { class: 'mcc-tip hidden' });
    this.el.append(this.cursorEl, this.tipEl);
  }

  /**
   * Builds the DOM. Subclasses call this at the END of their constructor (so their own fields
   * are initialised before `build()` runs).
   */
  protected init() {
    const menu = this.menu, opts = this.opts;
    this.buildBackground();
    for (const s of menu.slots) {
      const v = new SlotView(s);
      this.place(v.el, s.x - 1, s.y - 1);
      if (s.hidden) v.el.style.display = 'none';
      this.views.push(v);
      this.win.append(v.el);
    }
    if (menu.title) this.label(menu.title, opts.titleX ?? 8, opts.titleY ?? 6, opts.titleCentered);
    const invY = opts.inventoryLabelY === undefined ? this.H - 94 : opts.inventoryLabelY;
    if (invY !== null) this.label('Inventory', opts.inventoryLabelX ?? 8, invY);
    this.build();
    this.applyScale();
    this.attachInput();
    return this;
  }

  // ------------------------------------------------------------------ layout helpers
  get game(): any {
    return this.ui.game;
  }
  protected place(el: HTMLElement | SVGElement, x: number, y: number, w?: number, hgt?: number) {
    const st = (el as HTMLElement).style;
    st.position = 'absolute';
    st.left = `calc(var(--gp) * ${x})`;
    st.top = `calc(var(--gp) * ${y})`;
    if (w !== undefined) st.width = `calc(var(--gp) * ${w})`;
    if (hgt !== undefined) st.height = `calc(var(--gp) * ${hgt})`;
    return el;
  }
  label(text: string, x: number, y: number, centered = false, color?: string): HTMLElement {
    const el = h('div', { class: 'mcc-label' }, text);
    this.place(el, x, y);
    if (centered) {
      el.style.left = `calc(var(--gp) * ${this.W / 2})`;
      el.style.transform = 'translateX(-50%)';
    }
    if (color) el.style.color = color;
    this.win.append(el);
    return el;
  }
  widget(node: SVGElement | HTMLElement, x: number, y: number, w: number, hgt: number, parent: HTMLElement = this.win): HTMLElement {
    const el = h('div', { class: 'mcc-widget' });
    el.append(node);
    this.place(el, x, y, w, hgt);
    parent.append(el);
    return el;
  }
  protected buildBackground() {}
  /** Subclasses add widgets here. */
  protected build() {}
  /** Subclasses refresh widgets here (called every frame). */
  protected updateWidgets(_dt: number) {}

  protected applyScale() {
    this.gp = guiScale(this.ui, this.W + this.extraWidth(), this.H + this.extraHeight());
    this.el.style.setProperty('--gp', `${this.gp}px`);
    this.win.style.width = `calc(var(--gp) * ${this.W})`;
    this.win.style.height = `calc(var(--gp) * ${this.H})`;
  }
  /** Extra GUI px around the window that must fit on screen (tabs, effect panels). */
  protected extraWidth() {
    return 0;
  }
  protected extraHeight() {
    return 0;
  }

  // ------------------------------------------------------------------ input
  private slotAt(target: EventTarget | null): Slot | null {
    const el = (target as HTMLElement | null)?.closest?.('.mcc-slot') as HTMLElement | null;
    if (!el || !this.win.contains(el)) return null;
    const i = Number(el.dataset.slot);
    const s = this.menu.slots[i];
    return s && !s.hidden ? s : null;
  }
  /** Click position outside the window (and outside widgets that belong to the screen). */
  protected isOutside(target: EventTarget | null): boolean {
    const t = target as HTMLElement | null;
    return !!t && !this.wrap.contains(t);
  }

  private attachInput() {
    const el = this.el;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('input, .mcc-btn, .mcc-tab, .mcc-scroll, .mcc-offer')) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.buttonsDown |= 1 << e.button;
      this.mouseClicked(e.target, e.button === 2 ? 1 : e.button === 1 ? 2 : 0, e.shiftKey);
      this.refresh();
    });
    el.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      const s = this.slotAt(e.target);
      this.setHovered(s);
      if (this.buttonsDown && s) this.mouseDragged(s);
      this.positionFloating();
    });
    el.addEventListener('mouseleave', () => this.setHovered(null));
    window.addEventListener('mouseup', this.onUp);
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }
  private onUp = (e: MouseEvent) => {
    if (!this.el.isConnected) return;
    if (!(this.buttonsDown & (1 << e.button))) return;
    this.buttonsDown &= ~(1 << e.button);
    this.mouseReleased(e.target, e.button === 2 ? 1 : e.button === 1 ? 2 : 0, e.shiftKey);
    this.refresh();
  };
  protected onWheel(_e: WheelEvent) {}

  private setHovered(s: Slot | null) {
    if (s === this.hovered) return;
    if (this.hovered) this.views[this.hovered.index]?.el.classList.remove('hover');
    this.hovered = s;
    if (s) this.views[s.index]?.el.classList.add('hover');
    this.tipKey = '';
  }

  /** Overridable click dispatch (creative screen intercepts). */
  protected slotClicked(slot: Slot | null, slotId: number, button: number, type: ClickType) {
    this.menu.clicked(slot ? slot.index : slotId, button, type);
    this.dirty = true;
  }

  private mouseClicked(target: EventTarget | null, button: number, shift: boolean) {
    const slot = this.slotAt(target);
    const now = performance.now();
    this.doubleclick = this.lastClickSlot === slot && now - this.lastClickTime < 250 && this.lastClickButton === button;
    this.skipNextRelease = false;
    const middle = button === 2;
    const outside = !slot && this.isOutside(target);
    let id = -1;
    if (slot) id = slot.index;
    if (outside) id = OUTSIDE;
    if (id !== -1 && !this.isQuickCrafting) {
      if (!this.menu.getCarried()) {
        if (middle) this.slotClicked(slot, id, button, 'clone');
        else {
          const quick = id !== OUTSIDE && shift;
          let type: ClickType = 'pickup';
          if (quick) {
            this.lastQuickMoved = slot?.item ? copyStack(slot.item) : null;
            type = 'quick_move';
          } else if (id === OUTSIDE) type = 'throw';
          this.slotClicked(slot, id, button, type);
        }
        this.skipNextRelease = true;
      } else {
        this.isQuickCrafting = true;
        this.quickCraftingButton = button;
        this.quickCraftSlots.clear();
        this.quickCraftingType = button === 0 ? 0 : button === 1 ? 1 : 2;
      }
    }
    this.lastClickSlot = slot;
    this.lastClickTime = now;
    this.lastClickButton = button;
  }

  private mouseDragged(slot: Slot) {
    const c = this.menu.getCarried();
    if (!this.isQuickCrafting || !c) return;
    if ((c.count > this.quickCraftSlots.size || this.quickCraftingType === 2) && canItemQuickReplace(slot, c, true) && slot.mayPlace(c) && this.menu.canDragTo(slot)) {
      if (!this.quickCraftSlots.has(slot)) {
        this.quickCraftSlots.add(slot);
        this.dirty = true;
      }
    }
  }

  private mouseReleased(target: EventTarget | null, button: number, shift: boolean) {
    const slot = this.slotAt(target);
    const outside = !slot && this.isOutside(target);
    let id = -1;
    if (slot) id = slot.index;
    if (outside) id = OUTSIDE;
    if (this.doubleclick && slot && button === 0 && this.menu.canTakeItemForPickAll(null, slot)) {
      if (shift) {
        if (this.lastQuickMoved) {
          for (const s2 of this.menu.slots) {
            if (s2.hidden || !s2.hasItem() || !s2.mayPickup(this.menu.player)) continue;
            if (s2.storage === slot.storage && canItemQuickReplace(s2, this.lastQuickMoved, true)) this.slotClicked(s2, s2.index, button, 'quick_move');
          }
        }
      } else this.slotClicked(slot, id, button, 'pickup_all');
      this.doubleclick = false;
      this.lastClickTime = 0;
    } else {
      if (this.isQuickCrafting && this.quickCraftingButton !== button) {
        this.isQuickCrafting = false;
        this.quickCraftSlots.clear();
        this.skipNextRelease = true;
        this.dirty = true;
        return;
      }
      if (this.skipNextRelease) {
        this.skipNextRelease = false;
        return;
      }
      if (this.isQuickCrafting && this.quickCraftSlots.size) {
        const t = this.quickCraftingType;
        this.slotClicked(null, OUTSIDE, getQuickcraftMask(0, t), 'quick_craft');
        for (const s of this.quickCraftSlots) this.slotClicked(s, s.index, getQuickcraftMask(1, t), 'quick_craft');
        this.slotClicked(null, OUTSIDE, getQuickcraftMask(2, t), 'quick_craft');
      } else if (this.menu.getCarried() && id !== -1) {
        if (button === 2) this.slotClicked(slot, id, button, 'clone');
        else {
          const quick = id !== OUTSIDE && shift;
          if (quick) this.lastQuickMoved = slot?.item ? copyStack(slot.item) : null;
          this.slotClicked(slot, id, button, quick ? 'quick_move' : 'pickup');
        }
      }
    }
    if (!this.menu.getCarried()) this.lastClickTime = 0;
    this.isQuickCrafting = false;
    this.quickCraftSlots.clear();
    this.dirty = true;
  }

  // ------------------------------------------------------------------ keys
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const active = document.activeElement as HTMLElement | null;
    const typing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && this.el.contains(active);
    if (!down) return true;
    if (code === 'Escape') {
      this.close();
      return true;
    }
    if (typing) return true;
    const b: Record<string, string> = (this.ui.game?.input?.bindings as any) ?? {};
    if (code === (b.inventory ?? 'KeyE')) {
      this.close();
      return true;
    }
    if (this.hovered && !this.menu.getCarried()) {
      if (code === (b.swapHands ?? 'KeyF')) {
        this.slotClicked(this.hovered, this.hovered.index, 40, 'swap');
        this.refresh();
        return true;
      }
      for (let i = 1; i <= 9; i++) {
        if (code === (b['hotbar' + i] ?? 'Digit' + i)) {
          this.slotClicked(this.hovered, this.hovered.index, i - 1, 'swap');
          this.refresh();
          return true;
        }
      }
      if (code === (b.drop ?? 'KeyQ')) {
        this.slotClicked(this.hovered, this.hovered.index, e.ctrlKey || e.metaKey ? 1 : 0, 'throw');
        this.refresh();
        return true;
      }
    }
    return true;
  }

  close() {
    this.ui.close(this);
    if (!this.ui.top) this.ui.game?.input?.requestLock?.();
  }

  // ------------------------------------------------------------------ lifecycle
  onOpen() {
    window.addEventListener('resize', this.resizeFn);
    this.refresh();
    this.ui.game?.events?.emit('containerOpen', { player: this.menu.player, kind: this.opts.kind ?? this.menu.kind, pos: this.opts.pos, block: this.opts.block, menu: this.menu });
  }
  onClose() {
    window.removeEventListener('resize', this.resizeFn);
    window.removeEventListener('mouseup', this.onUp);
    if (!this.menu.closed) this.menu.removed();
    this.ui.game?.events?.emit('containerClose', { player: this.menu.player, kind: this.opts.kind ?? this.menu.kind, pos: this.opts.pos, block: this.opts.block, menu: this.menu });
  }

  update(dt: number) {
    if (!this.menu.stillValid()) {
      this.close();
      return;
    }
    this.refresh();
    this.updateWidgets(dt);
  }

  /** Re-render changed slots, cursor stack and tooltip. */
  refresh() {
    let v = String(this.menu.carriedVersion) + ':' + this.quickCraftSlots.size + ':' + (this.isQuickCrafting ? 1 : 0);
    const seen = new Set<any>();
    for (const s of this.menu.slots) {
      if (seen.has(s.storage)) continue;
      seen.add(s.storage);
      v += ':' + s.storage.version;
    }
    if (v === this.versions && !this.dirty) {
      this.updateTooltip();
      return;
    }
    this.versions = v;
    this.dirty = false;
    const carried = this.menu.getCarried();
    const dragging = this.isQuickCrafting && carried && this.quickCraftSlots.size > 1;
    const preview = dragging ? this.menu.dragPreview([...this.quickCraftSlots], this.quickCraftingType) : null;
    for (const view of this.views) {
      const s = view.slot;
      if (s.hidden) continue;
      const pc = preview?.counts.get(s);
      if (pc !== undefined && carried) {
        const shown = { ...carried, count: pc };
        const max = Math.min(carried.item.maxStack, s.maxStackFor(carried));
        view.render(shown, pc, pc >= max ? 'yellow' : undefined);
        view.el.classList.add('drag');
      } else {
        view.render(s.item);
        view.el.classList.toggle('drag', this.isQuickCrafting && this.quickCraftSlots.has(s));
      }
    }
    // cursor
    const shownCount = preview ? preview.remaining : carried?.count ?? 0;
    const ck = carried && shownCount > 0 ? stackKey(carried) + '#' + shownCount : '';
    if (ck !== this.cursorKey) {
      this.cursorKey = ck;
      this.cursorEl.textContent = '';
      if (carried && shownCount > 0) this.cursorEl.append(stackVisual(carried, { count: shownCount, countClass: preview && shownCount === 0 ? 'yellow' : undefined }));
    }
    this.tipKey = '';
    this.updateTooltip();
    this.positionFloating();
  }

  /** Tooltip content for the hovered slot (subclasses can provide tooltips for widgets). */
  protected tooltipFor(): { key: string; lines: TooltipLine[] } | null {
    const s = this.hovered;
    if (!s || this.menu.getCarried()) return null;
    const it = s.item;
    if (!it) return null;
    const adv = !!(this.ui.game?.settings as any)?.advancedTooltips;
    return { key: 's' + s.index + stackKey(it), lines: tooltipLines(it, { advanced: adv }) };
  }
  protected customTip: { key: string; lines: TooltipLine[] } | null = null;

  protected updateTooltip() {
    const t = this.customTip ?? this.tooltipFor();
    const key = t ? t.key : '';
    if (key === this.tipKey) return;
    this.tipKey = key;
    if (!t) {
      this.tipEl.classList.add('hidden');
      return;
    }
    this.tipEl.textContent = '';
    for (const l of t.lines) {
      const d = h('div', { class: (l.gap ? 'gap ' : '') + (l.italic ? 'it' : '') }, l.text);
      d.style.color = l.color;
      this.tipEl.append(d);
    }
    this.tipEl.classList.remove('hidden');
    this.positionFloating();
  }

  protected positionFloating() {
    const gp = this.gp;
    this.cursorEl.style.transform = `translate(${this.mouseX - 9 * gp}px, ${this.mouseY - 9 * gp}px)`;
    if (!this.tipEl.classList.contains('hidden')) {
      const r = this.tipEl.getBoundingClientRect();
      let x = this.mouseX + 12 * gp, y = this.mouseY - 12 * gp;
      if (x + r.width > window.innerWidth - 4) x = Math.max(4, this.mouseX - 16 * gp - r.width);
      if (y + r.height > window.innerHeight - 4) y = window.innerHeight - 4 - r.height;
      if (y < 4) y = 4;
      this.tipEl.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  /** Used by tests/harness: simulate the mouse at a slot (hover). */
  hoverSlot(index: number | null) {
    const s = index === null ? null : this.menu.slots[index];
    this.setHovered(s ?? null);
    if (s) {
      const r = this.views[s.index].el.getBoundingClientRect();
      this.mouseX = r.left + r.width * 0.6;
      this.mouseY = r.top + r.height * 0.6;
    }
    this.tipKey = '';
    this.updateTooltip();
    this.positionFloating();
  }
  /** Used by the harness: put the virtual mouse somewhere (cursor stack position). */
  setMouse(x: number, y: number) {
    this.mouseX = x;
    this.mouseY = y;
    this.positionFloating();
  }
  slotRect(index: number): DOMRect {
    return this.views[index].el.getBoundingClientRect();
  }
}
