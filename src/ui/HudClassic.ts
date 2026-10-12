// Classic HUD (Options.hudStyle 'classic'): the original 2005 top bar —
// "Level N:" / "Boss:" progress strip, the steel-blue weapon panel with ten
// slots, and the "$ / Kills:" box.
//
// Geometry is in original 640x480 design pixels and was measured from the
// reference frames (docs/reference/ref*.jpg) and the original HUD art
// (blueHUD.png, blueBox_1.png, HUDSelected.png). The layer is scaled by --k
// (and centred horizontally when the view is wider than 4:3).
import { HUD_WEAPONS, WEAPONS, type WeaponId } from '../config/weapons';
import { designLayer, h } from './dom';
import { HUD_GEOMETRY, type HudSnapshot } from './hudTypes';

interface SlotView {
  root: HTMLDivElement;
  icon: HTMLImageElement;
  name: HTMLSpanElement;
  cap: HTMLSpanElement;
  id: WeaponId | null;
  iconUrl: string | null;
  caption: string | null;
  cls: string;
}

export class ClassicHud {
  /** Called when a weapon slot is clicked. */
  onSlotClick: ((id: WeaponId) => void) | null = null;
  /**
   * Tint the level bar toward red near the end, as py-sealhunter does:
   * rgb(255, 255-255k^8, 255-255k^8). The 2005 frames (ref2: white bar at ~96%)
   * suggest the original did not, so this can be switched off.
   */
  levelBarTint = true;

  private readonly root: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly money: HTMLSpanElement;
  private readonly kills: HTMLSpanElement;
  private readonly ring: HTMLDivElement;
  private readonly slots: SlotView[] = [];
  private icons: Partial<Record<WeaponId, string>> = {};
  private visible = true;

  // Last values written to the DOM.
  private pLabel: string | null = null;
  private pMode: HudSnapshot['mode'] | null = null;
  private pProgress = -1;
  private pColor = '';
  private pMoney: number | null = null;
  private pKills: number | null = null;
  private pSelected = -2;

  constructor(view: HTMLElement, icons: Partial<Record<WeaponId, string>> = {}) {
    const G = HUD_GEOMETRY;
    this.root = designLayer(view, 'sh-hud');

    // Black strip with the level / boss progress bar.
    const strip = h('div', 'sh-hud-strip');
    this.label = h('div', 'sh-hud-label', 'Level 1:');
    const bar = h('div', 'sh-hud-bar');
    this.fill = h('div', 'sh-hud-fill');
    bar.appendChild(this.fill);
    strip.append(this.label, bar);

    // Steel-blue panel.
    const panel = h('div', 'sh-hud-panel');
    for (let i = 0; i < 10; i++) {
      const root = h('div', 'sh-slot');
      root.dataset.hudSlot = String(i);
      root.style.left = `${G.slotX0 + i * G.slotPitch}px`;
      const icon = h('img', 'sh-slot-icon');
      icon.alt = '';
      icon.draggable = false;
      const name = h('span', 'sh-slot-name');
      const cap = h('span', 'sh-slot-cap');
      root.append(icon, name, cap);
      const sv: SlotView = { root, icon, name, cap, id: null, iconUrl: null, caption: null, cls: '' };
      const swallow = (e: Event) => e.stopPropagation();
      root.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.button === 0 && sv.id && this.onSlotClick) this.onSlotClick(sv.id);
      });
      root.addEventListener('mousedown', swallow);
      root.addEventListener('mouseup', swallow);
      root.addEventListener('click', swallow);
      root.addEventListener('contextmenu', (e) => e.preventDefault());
      panel.appendChild(root);
      this.slots.push(sv);
    }
    this.ring = h('div', 'sh-hud-ring');
    this.ring.style.display = 'none';
    panel.appendChild(this.ring);

    const box = h('div', 'sh-hud-box');
    const lm = h('span', 'sh-hud-lbl sh-hud-l1', '$');
    const lk = h('span', 'sh-hud-lbl sh-hud-l2', 'Kills:');
    this.money = h('span', 'sh-hud-num sh-hud-l1', '0');
    this.kills = h('span', 'sh-hud-num sh-hud-l2', '0');
    box.append(lm, this.money, lk, this.kills);
    panel.appendChild(box);

    this.root.append(strip, panel);

    // Default slot contents until the first snapshot arrives.
    HUD_WEAPONS.forEach((id, i) => this.bindSlot(this.slots[i], id));
    this.setIcons(icons);
    HUD_WEAPONS.forEach((id, i) => this.setCaption(this.slots[i], `$${WEAPONS[id].price}`));
  }

  setIcons(icons: Partial<Record<WeaponId, string>>): void {
    this.icons = { ...icons };
    for (const s of this.slots) this.applyIcon(s);
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
  }

  get isVisible(): boolean {
    return this.visible;
  }

  update(s: HudSnapshot): void {
    // Label + mode.
    if (s.label !== this.pLabel) {
      this.pLabel = s.label;
      this.label.textContent = s.label;
    }
    if (s.mode !== this.pMode) {
      this.pMode = s.mode;
      this.root.classList.toggle('sh-boss', s.mode === 'boss');
      this.pColor = '';
    }

    // Progress bar (quantised so tiny changes do not touch the DOM).
    const p = Math.round(Math.min(1, Math.max(0, s.progress || 0)) * 2000) / 2000;
    if (p !== this.pProgress) {
      this.pProgress = p;
      this.fill.style.transform = `scaleX(${p})`;
    }
    // Original: the level bar tints toward red at the very end.
    let color = '#fff';
    if (s.mode === 'level' && this.levelBarTint) {
      const g = Math.round(255 - 255 * Math.pow(p, 8));
      color = g >= 255 ? '#fff' : `rgb(255,${g},${g})`;
    }
    if (color !== this.pColor) {
      this.pColor = color;
      this.fill.style.backgroundColor = color;
    }

    // Money / kills.
    const money = Math.floor(s.money);
    if (money !== this.pMoney) {
      this.pMoney = money;
      this.money.textContent = String(money);
    }
    const kills = Math.floor(s.kills);
    if (kills !== this.pKills) {
      this.pKills = kills;
      this.kills.textContent = String(kills);
    }

    // Slots.
    let selected = -1;
    const n = Math.min(this.slots.length, s.slots.length);
    for (let i = 0; i < n; i++) {
      const d = s.slots[i];
      const sv = this.slots[i];
      if (d.id !== sv.id) this.bindSlot(sv, d.id);
      const cls = d.owned ? 'sh-owned' : d.affordable ? 'sh-afford' : 'sh-locked';
      if (cls !== sv.cls) {
        if (sv.cls) sv.root.classList.remove(sv.cls);
        sv.root.classList.add(cls);
        sv.cls = cls;
      }
      this.setCaption(sv, d.caption);
      if (d.selected) selected = i;
    }
    if (selected !== this.pSelected) {
      this.pSelected = selected;
      if (selected < 0) this.ring.style.display = 'none';
      else {
        this.ring.style.display = '';
        this.ring.style.left = `${HUD_GEOMETRY.slotX0 + selected * HUD_GEOMETRY.slotPitch}px`;
      }
      this.slots.forEach((sv, i) => sv.root.classList.toggle('sh-selected', i === selected));
    }
  }

  private bindSlot(sv: SlotView, id: WeaponId): void {
    sv.id = id;
    sv.root.dataset.weapon = id;
    sv.root.title = `${WEAPONS[id].name} ($${WEAPONS[id].price})`;
    sv.name.textContent = WEAPONS[id].name;
    this.applyIcon(sv);
  }

  private applyIcon(sv: SlotView): void {
    const url = (sv.id && this.icons[sv.id]) || null;
    if (url === sv.iconUrl) return;
    sv.iconUrl = url;
    if (url) {
      sv.icon.src = url;
      sv.icon.style.display = '';
      sv.name.style.display = 'none';
    } else {
      sv.icon.removeAttribute('src');
      sv.icon.style.display = 'none';
      sv.name.style.display = '';
    }
  }

  private setCaption(sv: SlotView, caption: string): void {
    if (caption === sv.caption) return;
    sv.caption = caption;
    sv.cap.textContent = caption;
  }
}
