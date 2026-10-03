/**
 * Concrete container screens (vanilla layouts): inventory, crafting table, chest/barrel/ender
 * chest/double chest, dispenser/dropper, hopper, furnace/smoker/blast furnace, brewing stand,
 * enchanting table, anvil, villager trading.
 */
import { h, type UI } from '../ui';
import { ContainerScreen, stackVisual, type ContainerScreenOptions } from './screen';
import { arrowWidget, flameWidget, brewingWidgets, svgEl, plusSign, redCross, hammerIcon, lapisBadge, enchantBook } from './widgets';
import { effectIconURL, effectLabel, effectTime } from './effectIcons';
import type { ContainerMenu } from '../../game/containers/menu';
import { InventoryMenu, CraftingMenu, FurnaceMenu, BrewingMenu, EnchantmentMenu, AnvilMenu, MerchantMenu } from '../../game/containers/menus';
import { enchantmentLabel } from '../../game/enchant/enchantments';
import { randomSpell } from '../../game/enchant/table';
import { costA, costB, outOfStock, tradeStack, MERCHANT_LEVELS, MERCHANT_XP } from '../../game/containers/trading';
import { tooltipLines, stackName, type TooltipLine } from './tooltip';
import { displayName, stackKey } from '../../game/containers/stacks';
import { ARMOR } from '../../game/inventory';

// ====================================================================================== shared
export class BasicContainerScreen extends ContainerScreen {
  constructor(ui: UI, menu: ContainerMenu, opts: ContainerScreenOptions = {}) {
    super(ui, menu, opts);
    this.init();
  }
}

/** Active status effects panel to the right of the window (vanilla EffectRenderingInventoryScreen). */
class EffectsPanel {
  readonly el: HTMLElement;
  private key = '';
  constructor(private screen: ContainerScreen, private player: any) {
    this.el = h('div', { class: 'mcc-effects' });
    this.el.style.left = `calc(var(--gp) * ${screen.W + 4})`;
    screen.wrap.append(this.el);
  }
  update() {
    const fx = [...(this.player.effects?.values?.() ?? [])].filter((e: any) => e.duration !== 0);
    const key = fx.map((e: any) => `${e.id}:${e.amplifier}:${Math.ceil(e.duration / 20)}`).join('|');
    if (key === this.key) return;
    this.key = key;
    this.el.textContent = '';
    const compact = fx.length > 5;
    for (const e of fx) {
      const row = h('div', { class: 'mcc-effect' + (compact ? ' compact' : '') }, h('img', { class: 'ico', src: effectIconURL(e.id), draggable: 'false' }));
      if (!compact) row.append(h('div', {}, h('div', { class: 'nm' }, effectLabel(e.id, e.amplifier)), h('div', { class: 'tm' }, effectTime(e.duration))));
      this.el.append(row);
    }
  }
}

// ====================================================================================== player
const ARMOR_COLORS: Record<string, string> = { leather: '#8a5a32', chainmail: '#8f8f8f', iron: '#d2d2d2', gold: '#f2cf4a', golden: '#f2cf4a', diamond: '#5ee0e0', netherite: '#4a4142', turtle: '#47a043' };

/** Paper-doll Steve in the player preview box; the head follows the mouse like vanilla. */
class PlayerDoll {
  readonly el: HTMLElement;
  private head: HTMLElement;
  private face: HTMLElement;
  private parts: Record<string, HTMLElement> = {};
  private armorKey = '';
  constructor(private screen: ContainerScreen, private player: any) {
    const u = (n: number) => `calc(var(--gp) * ${n})`;
    const part = (name: string, x: number, y: number, w: number, hh: number, bg: string) => {
      const p = h('div', { style: { position: 'absolute', left: u(x), top: u(y), width: u(w), height: u(hh), background: bg, borderRadius: u(0.6), boxShadow: `inset ${u(-0.8)} ${u(-0.8)} 0 rgba(0,0,0,0.28), inset ${u(0.8)} ${u(0.8)} 0 rgba(255,255,255,0.18)` } });
      this.parts[name] = p;
      return p;
    };
    this.el = h('div', { class: 'mcc-steve', style: { left: u(26 + 1), top: u(8 + 1), width: u(49), height: u(68), overflow: 'hidden', borderRadius: u(0.5) } });
    const bg = h('div', { style: { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at 50% 30%, #3a3f4a, #121418 75%)' } });
    const body = h('div', { style: { position: 'absolute', left: u(8.5), top: u(4), width: u(32), height: u(62) } });
    this.head = part('head', 8, 0, 16, 16, 'linear-gradient(#3b2a14 0 30%, #b98a5e 30%)');
    this.face = h('div', { style: { position: 'absolute', left: u(2), top: u(7), width: u(12), height: u(7) } },
      h('div', { style: { position: 'absolute', left: u(1), top: u(1), width: u(4), height: u(2), background: 'linear-gradient(90deg,#fff 50%,#4a3a9a 50%)' } }),
      h('div', { style: { position: 'absolute', right: u(1), top: u(1), width: u(4), height: u(2), background: 'linear-gradient(90deg,#4a3a9a 50%,#fff 50%)' } }),
      h('div', { style: { position: 'absolute', left: u(4), top: u(4.5), width: u(4), height: u(1.5), background: '#7a4a32' } }));
    this.head.append(this.face);
    body.append(
      part('legL', 8, 40, 8, 22, 'linear-gradient(#2c2e9a 80%, #4b4b4b 80%)'),
      part('legR', 16, 40, 8, 22, 'linear-gradient(#2c2e9a 80%, #4b4b4b 80%)'),
      part('armL', 0, 16, 8, 24, 'linear-gradient(#0ea8a0 35%, #b98a5e 35%)'),
      part('armR', 24, 16, 8, 24, 'linear-gradient(#0ea8a0 35%, #b98a5e 35%)'),
      part('torso', 8, 16, 16, 24, 'linear-gradient(#10b0a6, #0a8f87)'),
      this.head,
    );
    this.el.append(bg, body);
    screen.win.append(this.el);
  }
  look(mx: number, my: number) {
    const r = this.head.getBoundingClientRect();
    if (!r.width) return;
    const dx = Math.max(-1, Math.min(1, (mx - (r.left + r.width / 2)) / 240));
    const dy = Math.max(-1, Math.min(1, (my - (r.top + r.height / 2)) / 240));
    this.face.style.transform = `translate(calc(var(--gp) * ${dx * 2}), calc(var(--gp) * ${dy * 1.5}))`;
    this.head.style.transform = `rotate(${dx * 6}deg)`;
  }
  update() {
    const inv = this.player.inventory;
    const key = [0, 1, 2, 3].map((i) => stackKey(inv.get(ARMOR + i))).join('|');
    if (key === this.armorKey) return;
    this.armorKey = key;
    const mat = (i: number) => {
      const s = inv.get(ARMOR + i);
      if (!s) return null;
      const m = s.item.armor?.material ?? s.item.name.split('_')[0];
      return typeof s.data?.color === 'number' ? '#' + s.data.color.toString(16).padStart(6, '0') : ARMOR_COLORS[m] ?? '#aaa';
    };
    const set = (names: string[], col: string | null, frac: string) => {
      for (const n of names) {
        const p = this.parts[n];
        let o = p.querySelector('.armor') as HTMLElement | null;
        if (!col) { o?.remove(); continue; }
        if (!o) { o = h('div', { class: 'armor', style: { position: 'absolute', left: '-8%', right: '-8%', borderRadius: 'calc(var(--gp) * 1)', boxShadow: 'inset 0 0 0 calc(var(--gp) * 0.8) rgba(0,0,0,0.3), inset 0 calc(var(--gp) * 1.5) 0 rgba(255,255,255,0.35)' } }); p.append(o); }
        o.style.background = `linear-gradient(135deg, ${col}, ${col} 60%, rgba(0,0,0,0.25))`;
        const [top, hh] = frac.split(':');
        o.style.top = top;
        o.style.height = hh;
      }
    };
    set(['head'], mat(3), '-6%:46%');
    set(['torso', 'armL', 'armR'], mat(2), '-3%:45%');
    set(['legL', 'legR'], mat(1), '-2%:62%');
    set(['legL', 'legR'], null, '');
    const legs = mat(1), boots = mat(0);
    if (legs) set(['legL', 'legR'], legs, '-2%:62%');
    if (boots && !legs) set(['legL', 'legR'], boots, '72%:30%');
  }
}

export class InventoryScreen extends ContainerScreen {
  private effects!: EffectsPanel;
  private doll!: PlayerDoll;
  constructor(ui: UI, menu: InventoryMenu) {
    super(ui, menu, { titleX: 97, titleY: 8, inventoryLabelY: null, kind: 'inventory' });
    this.init();
  }
  protected override build() {
    this.doll = new PlayerDoll(this, this.menu.player);
    const inset = h('div', { class: 'mcc-inset' });
    this.place(inset, 26, 8, 51, 72);
    inset.style.background = 'transparent';
    inset.style.zIndex = '1';
    inset.style.pointerEvents = 'none';
    this.win.append(inset);
    const a = arrowWidget(16, 13);
    this.widget(a.svg, 135, 29, 16, 13);
    this.effects = new EffectsPanel(this, this.menu.player);
  }
  protected override extraWidth() {
    return 2 * 124;
  }
  protected override updateWidgets() {
    this.effects.update();
    this.doll.update();
  }
  override setMouse(x: number, y: number) {
    super.setMouse(x, y);
    this.doll.look(x, y);
  }
  override onOpen() {
    super.onOpen();
    this.el.addEventListener('mousemove', (e) => this.doll.look(e.clientX, e.clientY));
  }
}

// ====================================================================================== crafting table
export class CraftingScreen extends ContainerScreen {
  constructor(ui: UI, menu: CraftingMenu, opts: ContainerScreenOptions = {}) {
    super(ui, menu, { titleX: 29, titleY: 6, kind: 'crafting', ...opts });
    this.init();
  }
  protected override build() {
    this.widget(arrowWidget(22, 15).svg, 90, 35, 22, 15);
    const big = this.views[0].el;
    big.classList.add('big');
    this.place(big, 119, 30);
  }
}

// ====================================================================================== furnace
export class FurnaceScreen extends ContainerScreen {
  private flame!: ReturnType<typeof flameWidget>;
  private arrow!: ReturnType<typeof arrowWidget>;
  constructor(ui: UI, readonly fm: FurnaceMenu, opts: ContainerScreenOptions = {}) {
    super(ui, fm, { titleCentered: true, ...opts });
    this.init();
  }
  protected override build() {
    this.flame = flameWidget();
    this.arrow = arrowWidget(24, 17);
    this.widget(this.flame.svg, 57, 36, 14, 14);
    this.widget(this.arrow.svg, 79, 34, 24, 17);
    const big = this.views[2].el;
    big.classList.add('big');
    this.place(big, 111, 30);
  }
  protected override updateWidgets() {
    this.flame.set(this.fm.burnProgress);
    this.arrow.set(this.fm.cookProgress);
  }
}

// ====================================================================================== brewing
export class BrewingScreen extends ContainerScreen {
  private w!: ReturnType<typeof brewingWidgets>;
  private t = 0;
  constructor(ui: UI, readonly bm: BrewingMenu, opts: ContainerScreenOptions = {}) {
    super(ui, bm, { titleCentered: true, ...opts });
    this.init();
  }
  protected override buildBackground() {
    // tubes from the ingredient to the three bottles + fuel pipe (drawn behind the slots)
    const frame = svgEl(176, 80, `
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <g stroke="#555" stroke-width="5"><path d="M87 34 V57"/><path d="M84 40 Q64 40 64 50"/><path d="M90 40 Q110 40 110 50"/><path d="M25 34 V44 H60"/></g>
        <g stroke="#a7a7a7" stroke-width="3"><path d="M87 34 V57"/><path d="M84 40 Q64 40 64 50"/><path d="M90 40 Q110 40 110 50"/><path d="M25 34 V44 H60"/></g>
        <g stroke="#d8d8d8" stroke-width="0.8" opacity="0.8"><path d="M86.2 35 V56"/><path d="M84 39.2 Q63.2 39.2 63.2 50"/><path d="M90 39.2 Q110.8 39.2 110.8 50"/></g>
      </g>`);
    this.widget(frame, 0, 0, 176, 80);
  }
  protected override build() {
    this.w = brewingWidgets();
    this.widget(this.w.bubbles, 63, 14, 12, 29);
    this.widget(this.w.arrow, 97, 16, 9, 28);
    this.widget(this.w.fuel, 60, 44, 18, 4);
  }
  protected override updateWidgets(dt: number) {
    const p = this.bm.brewProgress;
    this.w.setArrow(p);
    this.t += dt;
    this.w.setBubbles(p > 0 ? ((this.t * 0.9) % 1) : 0);
    this.w.setFuel(this.bm.fuel / 20);
  }
}

// ====================================================================================== enchanting
export class EnchantmentScreen extends ContainerScreen {
  private buttons: { el: HTMLElement; glyphs: HTMLElement; lvl: HTMLElement; lap: HTMLElement }[] = [];
  private ver = -1;
  private hoverBtn = -1;
  private stateKey = '';
  constructor(ui: UI, readonly em: EnchantmentMenu, opts: ContainerScreenOptions = {}) {
    super(ui, em, { titleX: 12, titleY: 5, kind: 'enchanting_table', ...opts });
    this.init();
  }
  protected override build() {
    this.widget(enchantBook(), 9, 15, 42, 30);
    for (let i = 0; i < 3; i++) {
      const glyphs = h('div', { class: 'glyphs' });
      const lvl = h('div', { class: 'lvl' });
      const lap = h('div', { class: 'lap' });
      const el = h('div', { class: 'mcc-btn mcc-ench' }, lap, glyphs, lvl);
      this.place(el, 60, 14 + 19 * i, 108, 19);
      el.addEventListener('mouseenter', () => { this.hoverBtn = i; this.setTip(); });
      el.addEventListener('mouseleave', () => { this.hoverBtn = -1; this.customTip = null; this.updateTooltip(); });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.em.canEnchant(i) && this.em.clickMenuButton(i)) {
          this.ver = -1;
          this.refresh();
        }
      });
      this.win.append(el);
      this.buttons.push({ el, glyphs, lvl, lap });
    }
  }
  private setTip() {
    const i = this.hoverBtn;
    const o = this.em.offers;
    if (i < 0 || o.costs[i] <= 0 || !this.em.inputs.get(0)) {
      this.customTip = null;
      this.updateTooltip();
      return;
    }
    const p: any = this.em.player;
    const lines: TooltipLine[] = [];
    const clue = o.clues[i];
    if (clue) lines.push({ text: `${enchantmentLabel(clue.id, clue.level)} . . . ?`, color: '#ffffff', italic: true });
    if (!p.creative) {
      if (p.xpLevel < o.costs[i]) lines.push({ text: `Level Requirement: ${o.costs[i]}`, color: '#ff5555', gap: !!clue });
      else {
        const n = i + 1;
        lines.push({ text: `${n} Lapis Lazuli`, color: this.em.lapis >= n ? '#aaaaaa' : '#ff5555', gap: !!clue });
        lines.push({ text: `${n} Enchantment Level${n > 1 ? 's' : ''}`, color: '#aaaaaa' });
      }
    }
    this.customTip = { key: `ench${i}:${o.costs[i]}:${clue?.id}:${p.xpLevel}:${this.em.lapis}`, lines };
    this.updateTooltip();
  }
  protected override updateWidgets() {
    const p: any = this.em.player;
    const key = `${this.em.offersVersion}:${p.xpLevel}:${this.em.lapis}:${p.creative}`;
    if (key === this.stateKey) return;
    this.stateKey = key;
    const o = this.em.offers;
    const hasItem = !!this.em.inputs.get(0);
    this.buttons.forEach((b, i) => {
      const cost = o.costs[i];
      const empty = !hasItem || cost <= 0;
      const ok = !empty && this.em.canEnchant(i);
      b.el.classList.toggle('empty', empty);
      b.el.classList.toggle('disabled', !empty && !ok);
      if (!empty) {
        if (this.ver !== this.em.offersVersion) b.glyphs.textContent = randomSpell(mulberry(this.em.seed + i * 977)).glyphs;
        b.lvl.textContent = String(cost);
        b.lap.textContent = '';
        b.lap.append(lapisBadge(i + 1, ok));
      }
    });
    this.ver = this.em.offersVersion;
    if (this.hoverBtn >= 0) this.setTip();
  }
}
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ====================================================================================== anvil
export class AnvilScreen extends ContainerScreen {
  private input!: HTMLInputElement;
  private cross!: HTMLElement;
  private cost!: HTMLElement;
  private leftKey = '';
  private stateVer = '';
  constructor(ui: UI, readonly am: AnvilMenu, opts: ContainerScreenOptions = {}) {
    super(ui, am, { titleX: 60, titleY: 6, kind: 'anvil', ...opts });
    this.init();
  }
  protected override build() {
    this.widget(hammerIcon(), 8, 4, 16, 16).style.opacity = '0.9';
    this.input = h('input', { class: 'mcc-text-input', maxlength: 50, spellcheck: 'false' }) as HTMLInputElement;
    this.place(this.input, 59, 20, 110, 16);
    this.input.disabled = true;
    this.input.addEventListener('input', () => this.am.setItemName(this.input.value));
    this.input.addEventListener('mousedown', (e) => e.stopPropagation());
    this.win.append(this.input);
    this.widget(plusSign(), 54, 48, 13, 13);
    this.widget(arrowWidget(22, 15).svg, 102, 48, 22, 15);
    this.cross = this.widget(redCross(), 99, 45, 28, 21);
    this.cost = h('div', { class: 'mcc-label', style: { right: 'calc(var(--gp) * 8)', top: 'calc(var(--gp) * 69)', left: 'auto', padding: 'calc(var(--gp) * 2) calc(var(--gp) * 3)', background: 'rgba(0,0,0,0.31)', borderRadius: 'calc(var(--gp) * 1)', textShadow: 'var(--gp) var(--gp) 0 rgba(0,0,0,0.6)' } });
    this.win.append(this.cost);
  }
  protected override updateWidgets() {
    const left = this.am.inputs.get(0);
    const lk = left ? `${left.item.id}:${left.data?.name ?? ''}` : '';
    if (lk !== this.leftKey) {
      this.leftKey = lk;
      this.input.disabled = !left;
      this.input.value = left ? displayName(left) : '';
      this.am.itemName = left ? this.input.value : undefined;
      this.am.createResult();
    }
    const st = this.am.state;
    const p: any = this.am.player;
    const key = `${this.am.stateVersion}:${p.xpLevel}`;
    if (key === this.stateVer) return;
    this.stateVer = key;
    const invalid = (!!left || !!this.am.inputs.get(1)) && !st.result;
    this.cross.style.display = invalid ? '' : 'none';
    if (st.cost > 0 || st.tooExpensive) {
      const tooExp = st.tooExpensive;
      const afford = p.creative || p.xpLevel >= st.cost;
      this.cost.textContent = tooExp ? 'Too Expensive!' : `Enchantment Cost: ${st.cost}`;
      this.cost.style.color = tooExp || !afford ? '#ff6060' : '#80ff20';
      this.cost.style.display = '';
    } else this.cost.style.display = 'none';
  }
}

// ====================================================================================== trading
export class MerchantScreen extends ContainerScreen {
  private list!: HTMLElement;
  private scroll = 0;
  private listKey = '';
  private xp!: HTMLElement;
  private title2!: HTMLElement;
  private cross!: HTMLElement;
  private hoverOffer = -1;
  constructor(ui: UI, readonly mm: MerchantMenu, opts: ContainerScreenOptions = {}) {
    super(ui, mm, { titleX: 0, titleY: 6, inventoryLabelX: 107, inventoryLabelY: 72, kind: 'merchant', ...opts });
    this.init();
  }
  protected override build() {
    // the generic title is replaced by profession - level over the right half
    for (const l of this.win.querySelectorAll('.mcc-label')) if (l.textContent === this.mm.title) l.remove();
    this.title2 = this.label('', 0, 6);
    this.label('Trades', 5 + 44 - 13, 6);
    const panel = h('div', { class: 'mcc-inset' });
    this.place(panel, 4, 16, 97, 144);
    panel.style.background = 'linear-gradient(#9a9a9a, #8d8d8d)';
    this.win.append(panel);
    this.list = h('div', { style: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' } });
    this.win.append(this.list);
    this.xp = h('div', { class: 'mcc-xpbar' }, h('div'));
    this.place(this.xp, 136, 16, 102, 5);
    this.win.append(this.xp);
    this.widget(arrowWidget(22, 15).svg, 186, 36, 22, 15);
    this.cross = this.widget(redCross(), 183, 33, 28, 21);
    const big = this.views[2].el;
    big.classList.add('big');
    this.place(big, 215, 32);
  }
  protected override onWheel(e: WheelEvent) {
    const n = this.mm.offers.length;
    if (n <= 7) return;
    e.preventDefault();
    this.scroll = Math.max(0, Math.min(n - 7, this.scroll + Math.sign(e.deltaY)));
    this.listKey = '';
  }
  protected override updateWidgets() {
    const offers = this.mm.offers;
    const key = `${this.mm.offersVersion}:${this.mm.selected}:${this.scroll}:` + offers.map((o) => `${o.uses}/${o.maxUses}:${o.specialPrice ?? 0}:${o.demand ?? 0}`).join(',');
    if (key !== this.listKey) {
      this.listKey = key;
      this.renderOffers();
    }
    const out = !!this.mm.activeOffer && outOfStock(this.mm.activeOffer);
    this.cross.style.display = out ? '' : 'none';
  }
  private renderOffers() {
    const m = this.mm.merchant;
    const lvl = Math.max(1, Math.min(5, m.merchantLevel ?? 0));
    const name = this.mm.title + (m.merchantLevel ? ` - ${MERCHANT_LEVELS[lvl - 1]}` : '');
    this.title2.textContent = name;
    this.title2.style.left = `calc(var(--gp) * ${107 + 85})`;
    this.title2.style.transform = 'translateX(-50%)';
    if (m.merchantLevel && m.merchantXp !== undefined && lvl < 5) {
      const lo = MERCHANT_XP[lvl - 1], hi = MERCHANT_XP[lvl];
      (this.xp.firstChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, (m.merchantXp - lo) / (hi - lo))) * 100}%`;
      this.xp.style.display = '';
    } else this.xp.style.display = 'none';
    this.list.textContent = '';
    const offers = this.mm.offers;
    for (let k = 0; k < Math.min(7, offers.length - this.scroll); k++) {
      const i = k + this.scroll;
      const o = offers[i];
      const btn = h('div', { class: 'mcc-btn mcc-offer' + (i === this.mm.selected ? ' sel' : '') + (outOfStock(o) ? ' out' : '') });
      this.place(btn, 5, 18 + 20 * k, 88, 20);
      const a = costA(o), base = tradeStack(o.buy), b = costB(o), r = tradeStack(o.sell);
      const at = (el: HTMLElement, x: number) => { el.style.left = `calc(var(--gp) * ${x})`; btn.append(el); };
      if (a) at(stackVisual(a), 5);
      if (a && base && base.count !== a.count) {
        const s = h('div', { class: 'mcc-strike' }, String(base.count));
        s.style.left = 'calc(var(--gp) * 2)';
        s.style.top = 'calc(var(--gp) * 1)';
        btn.append(s);
      }
      if (b) at(stackVisual(b), 35);
      const arr = h('div', { class: 'mcc-widget' });
      arr.append(outOfStock(o) ? redCross() : arrowWidget(10, 9).svg);
      this.place(arr, outOfStock(o) ? 52 : 55, outOfStock(o) ? 4 : 5.5, outOfStock(o) ? 14 : 10, outOfStock(o) ? 11 : 9);
      btn.append(arr);
      if (r) at(stackVisual(r), 68);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.mm.clickMenuButton(i);
        this.listKey = '';
        this.refresh();
      });
      btn.addEventListener('mouseenter', () => {
        this.hoverOffer = i;
        const st = r;
        if (st) this.customTip = { key: 'offer' + i + stackKey(st), lines: [...tooltipLines(st), ...(outOfStock(o) ? [{ text: 'Out of stock — the villager needs to restock', color: '#ff5555', gap: true }] : [])] };
        this.updateTooltip();
      });
      btn.addEventListener('mouseleave', () => {
        this.hoverOffer = -1;
        this.customTip = null;
        this.updateTooltip();
      });
      this.list.append(btn);
    }
    if (offers.length > 7) {
      const track = h('div', { class: 'mcc-scroll' });
      this.place(track, 94, 18, 6, 139);
      const th = h('div', { class: 'mcc-thumb', style: { left: '0', width: 'calc(var(--gp) * 6)', height: 'calc(var(--gp) * 27)' } });
      th.style.top = `calc(var(--gp) * ${((139 - 27) * this.scroll) / Math.max(1, offers.length - 7)})`;
      track.append(th);
      this.list.append(track);
    }
    void stackName;
  }
}
