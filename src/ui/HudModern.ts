// Modern HUD (Options.hudStyle 'modern'): small translucent chips anchored to
// the view edges, laid out in design px of a fluid layer (scaled by --k).
//
//   top centre    level / boss progress: label + hairline bar
//   top right     money · kills
//   bottom centre the ten buyable weapons as icon tiles (key, price or ammo)
//   bottom right  active weapon: name, ammo / clip, reload bar
//   bottom left   health, only while hurt
import { HUD_WEAPONS, WEAPONS, type WeaponId } from '../config/weapons';
import { fluidLayer, h } from './dom';
import type { HudSnapshot, HudWeapon } from './hudTypes';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

interface TileView {
  root: HTMLDivElement;
  icon: HTMLImageElement;
  name: HTMLSpanElement;
  cap: HTMLSpanElement;
  id: WeaponId | null;
  iconUrl: string | null;
  caption: string | null;
  cls: string;
}

/** Active weapon from the slots, for snapshots without `weapon`. */
function weaponFromSlots(s: HudSnapshot): HudWeapon {
  const sel = s.slots.find((d) => d.selected);
  if (sel && sel.owned) {
    const n = parseInt(sel.caption.replace(/^x/, ''), 10);
    return { id: sel.id, name: WEAPONS[sel.id].name, bullets: isFinite(n) ? n : NaN, clip: WEAPONS[sel.id].clip, reload: null };
  }
  return { id: 'pistol', name: WEAPONS.pistol.name, bullets: NaN, clip: WEAPONS.pistol.clip, reload: null };
}

export class ModernHud {
  onSlotClick: ((id: WeaponId) => void) | null = null;

  private readonly root: HTMLDivElement;
  private readonly progLabel: HTMLSpanElement;
  private readonly progFill: HTMLDivElement;
  private readonly money: HTMLSpanElement;
  private readonly kills: HTMLSpanElement;
  private readonly tiles: TileView[] = [];
  private readonly wpnName: HTMLDivElement;
  private readonly ammo: HTMLSpanElement;
  private readonly clip: HTMLSpanElement;
  private readonly ammoRow: HTMLDivElement;
  private readonly wpnBox: HTMLDivElement;
  private readonly reloadFill: HTMLDivElement;
  private readonly health: HTMLDivElement;
  private readonly healthFill: HTMLDivElement;
  private icons: Partial<Record<WeaponId, string>> = {};
  private visible = true;

  // Last values written to the DOM.
  private pLabel: string | null = null;
  private pMode: HudSnapshot['mode'] | null = null;
  private pProgress = -1;
  private pMoney: number | null = null;
  private pKills: number | null = null;
  private pSelected = -2;
  private pWpn = '';
  private pReload = -2;
  private pHealth = -1;

  constructor(view: HTMLElement, icons: Partial<Record<WeaponId, string>> = {}) {
    this.root = fluidLayer(view, 'shm-hud hud');

    // Level / boss progress.
    const prog = h('div', 'shm-chip shm-prog');
    this.progLabel = h('span', 'shm-prog-label', 'Level 1');
    const track = h('div', 'shm-prog-track');
    this.progFill = h('div', 'shm-prog-fill');
    track.appendChild(this.progFill);
    prog.append(this.progLabel, track);

    // Money · kills.
    const stats = h('div', 'shm-chip shm-counters');
    const m = h('span', 'shm-stat');
    m.append(h('span', 'shm-stat-unit', '$'));
    this.money = h('span', 'shm-stat-num', '0');
    m.appendChild(this.money);
    const k = h('span', 'shm-stat');
    this.kills = h('span', 'shm-stat-num', '0');
    k.append(this.kills, h('span', 'shm-stat-label', 'kills'));
    stats.append(m, h('span', 'shm-stat-sep'), k);

    // Weapon bar.
    const bar = h('div', 'shm-bar');
    for (let i = 0; i < 10; i++) {
      const root = h('div', 'shm-tile');
      root.dataset.hudSlot = String(i);
      const key = h('span', 'shm-tile-key', KEYS[i]);
      const icon = h('img', 'shm-tile-icon');
      icon.alt = '';
      icon.draggable = false;
      const name = h('span', 'shm-tile-name');
      const cap = h('span', 'shm-tile-cap');
      root.append(key, icon, name, cap);
      const tv: TileView = { root, icon, name, cap, id: null, iconUrl: null, caption: null, cls: '' };
      const swallow = (e: Event) => e.stopPropagation();
      root.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.button === 0 && tv.id && this.onSlotClick) this.onSlotClick(tv.id);
      });
      root.addEventListener('mousedown', swallow);
      root.addEventListener('mouseup', swallow);
      root.addEventListener('click', swallow);
      root.addEventListener('contextmenu', (e) => e.preventDefault());
      bar.appendChild(root);
      this.tiles.push(tv);
    }

    // Active weapon.
    this.wpnBox = h('div', 'shm-wpn');
    this.wpnBox.style.display = 'none'; // until the first snapshot
    this.wpnName = h('div', 'shm-wpn-name');
    this.ammoRow = h('div', 'shm-wpn-ammo');
    this.ammo = h('span', 'shm-wpn-mag');
    this.clip = h('span', 'shm-wpn-clip');
    this.ammoRow.append(this.ammo, this.clip);
    const reload = h('div', 'shm-wpn-reload');
    this.reloadFill = h('div', 'shm-wpn-reload-fill');
    reload.appendChild(this.reloadFill);
    this.wpnBox.append(this.wpnName, this.ammoRow, reload);

    // Health (only while hurt).
    this.health = h('div', 'shm-health');
    const ht = h('div', 'shm-health-track');
    this.healthFill = h('div', 'shm-health-fill');
    ht.appendChild(this.healthFill);
    this.health.append(h('span', 'shm-health-label', 'health'), ht);

    this.root.append(prog, stats, bar, this.wpnBox, this.health);

    HUD_WEAPONS.forEach((id, i) => this.bindTile(this.tiles[i], id));
    this.setIcons(icons);
    HUD_WEAPONS.forEach((id, i) => this.setCaption(this.tiles[i], `$${fmt(WEAPONS[id].price)}`));
  }

  setIcons(icons: Partial<Record<WeaponId, string>>): void {
    this.icons = { ...icons };
    for (const t of this.tiles) this.applyIcon(t);
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
  }

  update(s: HudSnapshot): void {
    // Progress: "Level 4:" -> "Level 4".
    const label = s.label.replace(/:\s*$/, '');
    if (label !== this.pLabel) {
      this.pLabel = label;
      this.progLabel.textContent = label;
    }
    if (s.mode !== this.pMode) {
      this.pMode = s.mode;
      this.root.classList.toggle('is-boss', s.mode === 'boss');
    }
    const p = Math.round(Math.min(1, Math.max(0, s.progress || 0)) * 1000) / 1000;
    if (p !== this.pProgress) {
      this.pProgress = p;
      this.progFill.style.transform = `scaleX(${p})`;
    }

    const money = Math.floor(s.money);
    if (money !== this.pMoney) {
      this.pMoney = money;
      this.money.textContent = fmt(money);
    }
    const kills = Math.floor(s.kills);
    if (kills !== this.pKills) {
      this.pKills = kills;
      this.kills.textContent = fmt(kills);
    }

    // Tiles.
    let selected = -1;
    const n = Math.min(this.tiles.length, s.slots.length);
    for (let i = 0; i < n; i++) {
      const d = s.slots[i];
      const tv = this.tiles[i];
      if (d.id !== tv.id) this.bindTile(tv, d.id);
      const cls = d.owned ? 'is-owned' : d.affordable ? 'is-afford' : 'is-locked';
      if (cls !== tv.cls) {
        if (tv.cls) tv.root.classList.remove(tv.cls);
        tv.root.classList.add(cls);
        tv.cls = cls;
      }
      this.setCaption(tv, d.owned ? d.caption.replace(/^x/, '') : `$${fmt(d.price)}`);
      if (d.selected) selected = i;
    }
    if (selected !== this.pSelected) {
      this.pSelected = selected;
      this.tiles.forEach((tv, i) => tv.root.classList.toggle('is-selected', i === selected));
    }

    // Active weapon.
    const w = s.weapon ?? weaponFromSlots(s);
    const known = isFinite(w.bullets);
    const low = known && w.reload === null && w.bullets <= Math.max(1, Math.ceil(w.clip * 0.2));
    const key = `${w.name}|${known ? w.bullets : '-'}|${w.clip}|${low ? 1 : 0}|${w.reload === null ? 0 : 1}`;
    if (key !== this.pWpn) {
      this.pWpn = key;
      this.wpnBox.style.display = '';
      this.wpnName.textContent = w.reload !== null ? `${w.name} · reloading` : w.name;
      this.ammoRow.style.display = known ? '' : 'none';
      this.ammo.textContent = known ? String(w.bullets) : '';
      this.clip.textContent = `/ ${w.clip}`;
      this.wpnBox.classList.toggle('is-low', low);
      this.wpnBox.classList.toggle('is-reloading', w.reload !== null);
    }
    const r = w.reload === null ? -1 : Math.round(Math.min(1, Math.max(0, w.reload)) * 200) / 200;
    if (r !== this.pReload) {
      this.pReload = r;
      this.reloadFill.style.transform = `scaleX(${Math.max(0, r)})`;
    }

    // Health: hidden at full health.
    const hp = s.health === undefined ? 1 : Math.round(Math.min(1, Math.max(0, s.health)) * 200) / 200;
    if (hp !== this.pHealth) {
      this.pHealth = hp;
      this.healthFill.style.transform = `scaleX(${hp})`;
      this.health.classList.toggle('is-hurt', hp < 0.995);
      this.health.classList.toggle('is-low', hp < 0.35);
    }
  }

  private bindTile(tv: TileView, id: WeaponId): void {
    tv.id = id;
    tv.root.dataset.weapon = id;
    tv.root.title = `${WEAPONS[id].name} ($${fmt(WEAPONS[id].price)})`;
    tv.name.textContent = WEAPONS[id].name;
    this.applyIcon(tv);
  }

  private applyIcon(tv: TileView): void {
    const url = (tv.id && this.icons[tv.id]) || null;
    if (url === tv.iconUrl) return;
    tv.iconUrl = url;
    if (url) {
      tv.icon.src = url;
      tv.icon.style.display = '';
      tv.name.style.display = 'none';
    } else {
      tv.icon.removeAttribute('src');
      tv.icon.style.display = 'none';
      tv.name.style.display = '';
    }
  }

  private setCaption(tv: TileView, caption: string): void {
    if (caption === tv.caption) return;
    tv.caption = caption;
    tv.cap.textContent = caption;
  }
}
