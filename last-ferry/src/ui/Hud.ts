// In-game HUD (modern, minimal, nautical). Renders a HudSnapshot every frame;
// every DOM write is guarded by a "last value" check, so an unchanged frame
// costs a few comparisons.
//
//   top left      chapter tag
//   top centre    boarding bar: ferry icon, PASSENGERS 23 / 48, one tick per
//                 passenger (boss phases: skull, boss name, red life bar with a
//                 lagging "damage" ghost; mop-up: MOP UP · N LEFT)
//   top right     money · kills
//   bottom left   Captain's Favour (ship's-wheel ring, pulsing F when ready),
//                 horn H chip, crane chip (glows when a crowd is under the
//                 pallet); health above them only when hurt
//   bottom centre six weapon tiles (key, silhouette, price or ammo; locked /
//                 affordable / owned / selected states; click to buy/select)
//   bottom right  active weapon: name, ammo (revolver cylinder, shells, flare,
//                 bolt or a magazine bar), reload bar, outboard heat + RPM
import type { WeaponId } from '../config/ids';
import { CRANE } from '../config/world';
import { Callouts } from './Callouts';
import { clamp01, fluidLayer, fmtInt, fromHtml, h, retrigger } from './dom';
import type { CalloutKind, HudSlot, HudSnapshot } from './hudTypes';
import { COIN_SVG, CRANE_SVG, CROSS_SVG, FERRY_SVG, HORN_SVG, SKULL_SVG, WEAPON_SVG, WHEEL_SVG } from './icons';

interface TileView {
  root: HTMLDivElement;
  ico: HTMLSpanElement;
  cap: HTMLSpanElement;
  key: HTMLSpanElement;
  id: WeaponId | null;
  cls: string;
  caption: string;
  selected: boolean;
  empty: boolean;
}

/** Revolver cylinder: six chambers that empty and turn 60° per shot. */
const CYLINDER_SVG = (() => {
  let ch = '';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    ch += `<circle class="ch" cx="${(17 + Math.cos(a) * 9.2).toFixed(2)}" cy="${(17 + Math.sin(a) * 9.2).toFixed(2)}" r="3.7"/>`;
  }
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="currentColor" opacity="0.92"/>
    <circle cx="17" cy="17" r="16" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/>${ch}
    <circle cx="17" cy="17" r="2.4" fill="rgba(0,0,0,.5)"/></svg>`;
})();

type PipStyle = 'cylinder' | 'shell' | 'flare' | 'bolt' | 'bar';

function pipStyle(id: WeaponId, clip: number): PipStyle {
  if (id === 'revolver' && clip === 6) return 'cylinder';
  if (id === 'flare') return 'flare';
  if (id === 'harpoon') return 'bolt';
  if (clip <= 8) return 'shell';
  return 'bar';
}

export class Hud {
  /** Called when a weapon tile is clicked (buy or select). */
  onSlotClick: ((id: WeaponId) => void) | null = null;
  /** Big centred callouts + info/danger lines (also reachable via callout()). */
  readonly callouts: Callouts;

  private readonly root: HTMLDivElement;
  // Boarding / boss.
  private readonly board: HTMLDivElement;
  private readonly boardCount: HTMLElement;
  private readonly boardTotal: HTMLElement;
  private readonly ticks: HTMLDivElement;
  private tickEls: HTMLElement[] = [];
  private readonly bossName: HTMLSpanElement;
  private readonly bossPct: HTMLSpanElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossGhost: HTMLDivElement;
  // Chapter tag.
  private readonly chNum: HTMLElement;
  private readonly chName: HTMLSpanElement;
  private readonly chClock: HTMLElement;
  // Purse.
  private readonly moneyBox: HTMLDivElement;
  private readonly money: HTMLSpanElement;
  private readonly kills: HTMLSpanElement;
  // Tiles.
  private readonly tiles: TileView[] = [];
  // Active weapon.
  private readonly wpn: HTMLDivElement;
  private readonly wpnName: HTMLDivElement;
  private readonly pips: HTMLDivElement;
  private readonly mag: HTMLSpanElement;
  private readonly clip: HTMLSpanElement;
  private readonly magBar: HTMLDivElement;
  private readonly magFill: HTMLDivElement;
  private readonly reloadFill: HTMLDivElement;
  private readonly rpm: HTMLElement;
  private readonly heat: HTMLElement;
  private pipEls: Element[] = [];
  private cyl: HTMLElement | null = null;
  // Abilities.
  private readonly abilRow: HTMLDivElement;
  private readonly wheel: HTMLDivElement;
  private readonly wheelFill: SVGCircleElement;
  private readonly wheelSpokes: SVGGElement;
  private readonly favourVal: HTMLElement;
  private readonly hornChip: HTMLDivElement;
  private readonly craneChip: HTMLDivElement;
  private readonly health: HTMLDivElement;
  private readonly healthFill: HTMLDivElement;
  private readonly healthNum: HTMLSpanElement;

  private visible = true;
  // Last values written.
  private pMode: HudSnapshot['mode'] | null = null;
  private pPassengers = -1;
  private pBoarded = -1;
  private pChapter = -1;
  private pChName = '';
  private pClock = '';
  private pDanger = false;
  private pBossName = '';
  private pBoss = -1;
  private pMoney = -1;
  private pKills = -1;
  private pWpnKey = '';
  private pPipKey = '';
  private pReload = -2;
  private pMag = -2;
  private pRpm = -1;
  private pHeat = -1;
  private pFavour = -1;
  private pFavourReady: boolean | null = null;
  private pHorn: boolean | null = null;
  private pCrane: boolean | null = null;
  private pCraneHot = false;
  private pLeft = -1;
  private pHealth = -1;
  private moneyPulseAt = 0;

  constructor(view: HTMLElement) {
    this.root = fluidLayer(view, 'lf-hud');
    this.callouts = new Callouts(view);

    // ---- boarding / boss bar
    this.board = h('div', 'lf-board lf-glass');
    const pass = h('div', 'lf-board-pass');
    const head = h('div', 'lf-board-head');
    const ico = h('span', 'lf-board-ico');
    ico.appendChild(fromHtml(FERRY_SVG));
    const count = h('span', 'lf-board-count');
    this.boardCount = h('b', '', '0');
    this.boardTotal = h('i', '', '/ 0');
    count.append(this.boardCount, this.boardTotal);
    head.append(ico, h('span', 'lf-board-label', 'PASSENGERS'), count);
    this.ticks = h('div', 'lf-ticks');
    pass.append(head, this.ticks);

    const boss = h('div', 'lf-boss');
    const bhead = h('div', 'lf-boss-head');
    const skull = h('span', 'lf-boss-skull');
    skull.appendChild(fromHtml(SKULL_SVG));
    this.bossName = h('span', 'lf-boss-name', '');
    this.bossPct = h('span', 'lf-boss-pct', '');
    bhead.append(skull, this.bossName, this.bossPct);
    const track = h('div', 'lf-boss-track');
    this.bossGhost = h('div', 'lf-boss-ghost');
    this.bossFill = h('div', 'lf-boss-fill');
    track.append(this.bossGhost, this.bossFill);
    boss.append(bhead, track);
    this.board.append(pass, boss);

    // ---- chapter tag
    const chtag = h('div', 'lf-chtag');
    this.chNum = h('b', '', 'CH 1');
    this.chName = h('span', '', '');
    this.chClock = h('i', 'lf-chtag-clock', '');
    chtag.append(this.chNum, this.chName, this.chClock);

    // ---- money / kills
    const purse = h('div', 'lf-purse lf-glass');
    this.moneyBox = h('div', 'lf-money');
    const coin = h('span', 'lf-coin');
    coin.appendChild(fromHtml(COIN_SVG));
    this.money = h('span', 'lf-money-num', '$0');
    this.moneyBox.append(coin, this.money);
    const k = h('div', 'lf-kills');
    this.kills = h('span', 'lf-kills-num', '0');
    k.append(this.kills, h('span', 'lf-kills-lbl', 'KILLS'));
    purse.append(this.moneyBox, h('span', 'lf-sep'), k);

    // ---- weapon bar
    const bar = h('div', 'lf-bar lf-glass');
    for (let i = 0; i < 6; i++) {
      const root = h('div', 'lf-tile is-locked');
      const key = h('span', 'lf-tile-key', String(i + 1));
      const ico2 = h('span', 'lf-tile-ico');
      const cap = h('span', 'lf-tile-cap', '');
      root.append(key, ico2, cap);
      const tv: TileView = { root, ico: ico2, cap, key, id: null, cls: 'is-locked', caption: '', selected: false, empty: false };
      const swallow = (e: Event) => e.stopPropagation();
      root.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.button !== 0 || !tv.id) return;
        if (tv.cls === 'is-locked') retrigger(tv.root, 'is-deny');
        this.onSlotClick?.(tv.id);
      });
      root.addEventListener('mousedown', swallow);
      root.addEventListener('mouseup', swallow);
      root.addEventListener('click', swallow);
      root.addEventListener('contextmenu', (e) => e.preventDefault());
      bar.appendChild(root);
      this.tiles.push(tv);
    }

    // ---- active weapon
    this.wpn = h('div', 'lf-wpn lf-glass');
    this.wpnName = h('div', 'lf-wpn-name', '');
    const row = h('div', 'lf-wpn-row');
    this.pips = h('div', 'lf-pips');
    const num = h('div', 'lf-wpn-num');
    this.mag = h('span', 'lf-wpn-mag', '');
    this.clip = h('span', 'lf-wpn-clip', '');
    num.append(this.mag, this.clip);
    row.append(this.pips, num);
    this.magBar = h('div', 'lf-mag');
    this.magFill = h('div', 'lf-mag-fill');
    this.magBar.appendChild(this.magFill);
    const reload = h('div', 'lf-wpn-reload');
    this.reloadFill = h('div', 'lf-wpn-reload-fill');
    reload.appendChild(this.reloadFill);
    const engine = h('div', 'lf-engine');
    const rpm = h('div', 'lf-gauge rpm');
    this.rpm = h('i');
    rpm.appendChild(this.rpm);
    const heat = h('div', 'lf-gauge heat');
    this.heat = h('i');
    heat.appendChild(this.heat);
    engine.append(h('span', '', 'RPM'), rpm, h('span', '', 'HEAT'), heat);
    this.wpn.append(h('div', 'lf-wpn-reload-lbl', 'RELOADING'), this.wpnName, row, this.magBar, reload, engine);

    // ---- abilities
    const abil = h('div', 'lf-abil');
    this.health = h('div', 'lf-health lf-glass');
    const hico = h('span', 'lf-health-ico');
    hico.appendChild(fromHtml(CROSS_SVG));
    const htrack = h('div', 'lf-health-track');
    this.healthFill = h('div', 'lf-health-fill');
    htrack.appendChild(this.healthFill);
    this.healthNum = h('span', 'lf-health-num', '100');
    this.health.append(hico, htrack, this.healthNum);

    this.abilRow = h('div', 'lf-abil-row lf-glass');
    this.wheel = h('div', 'lf-wheel');
    this.wheel.appendChild(fromHtml(WHEEL_SVG));
    this.wheel.appendChild(h('span', 'lf-wheel-key', 'F'));
    this.wheelFill = this.wheel.querySelector('.lf-wheel-fill') as SVGCircleElement;
    this.wheelSpokes = this.wheel.querySelector('.lf-wheel-spokes') as SVGGElement;
    const text = h('div', 'lf-abil-text');
    const fl = h('div', 'lf-favour-lbl', "CAPTAIN'S FAVOUR");
    this.favourVal = h('b', '', '0%');
    fl.appendChild(this.favourVal);
    const chips = h('div', 'lf-chips');
    this.hornChip = this.chip('H', HORN_SVG, 'HORN');
    this.craneChip = this.chip('', CRANE_SVG, 'CRANE');
    chips.append(this.hornChip, this.craneChip);
    text.append(fl, chips);
    this.abilRow.append(this.wheel, text);
    abil.append(this.health, this.abilRow);

    this.root.append(chtag, this.board, purse, bar, this.wpn, abil);
  }

  private chip(key: string, icon: string, label: string): HTMLDivElement {
    const c = h('div', 'lf-chip');
    if (key) c.appendChild(h('span', 'lf-kbd', key));
    const i = h('span', 'lf-chip-ico');
    i.appendChild(fromHtml(icon));
    c.append(i, h('span', '', label));
    return c;
  }

  /** Big centred text: NICE SHOT, MASSACRE, HEADSHOT ×3, TIDY, boss names; info/danger lines. */
  callout(text: string, kind: CalloutKind = 'info'): void {
    this.callouts.show(text, kind);
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.root.classList.toggle('is-hidden', !v);
    this.callouts.setVisible(v);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Flash an ability chip to point at it (e.g. the horn when one of them nears the gangway). */
  flashChip(which: 'horn' | 'crane'): void {
    retrigger(which === 'horn' ? this.hornChip : this.craneChip, 'is-hint');
  }

  /** Flash a tile as "can't afford" (e.g. a 1–6 key press on a locked weapon). */
  denySlot(id: WeaponId): void {
    const tv = this.tiles.find((t) => t.id === id);
    if (tv) retrigger(tv.root, 'is-deny');
  }

  update(s: HudSnapshot): void {
    this.updateBoard(s);
    this.updatePurse(s);
    this.updateTiles(s.slots);
    this.updateWeapon(s);
    this.updateAbilities(s);
  }

  // ------------------------------------------------------------------ parts

  private updateBoard(s: HudSnapshot): void {
    if (s.mode !== this.pMode) {
      this.pMode = s.mode;
      this.root.classList.toggle('is-boss', s.mode === 'boss' || s.mode === 'mopup');
      this.root.classList.toggle('is-mopup', s.mode === 'mopup');
      this.pBoss = -1;
      this.pBossName = '';
      this.pLeft = -1;
    }
    if (s.chapter !== this.pChapter || s.chapterName !== this.pChName) {
      this.pChapter = s.chapter;
      this.pChName = s.chapterName;
      this.chNum.textContent = `CH ${s.chapter}`;
      this.chName.textContent = s.chapterName;
    }
    const clock = s.clock ?? '';
    if (clock !== this.pClock) {
      this.pClock = clock;
      this.chClock.textContent = clock;
    }
    const danger = (s.danger ?? 0) > 0.5;
    if (danger !== this.pDanger) {
      this.pDanger = danger;
      this.board.classList.toggle('is-danger', danger);
    }
    if (s.mode === 'mopup') {
      // The boss is down; the stragglers still on the deck hold up the end of the chapter.
      if (this.pBossName !== 'MOP UP') {
        this.pBossName = 'MOP UP';
        this.bossName.textContent = 'MOP UP';
      }
      const left = Math.max(0, Math.round(s.stragglers ?? 0));
      const max = Math.max(left, Math.round(s.stragglersMax ?? 0), 1);
      if (left !== this.pLeft) {
        if (this.pLeft >= 0 && left < this.pLeft) retrigger(this.board, 'is-hit');
        this.pLeft = left;
        const f = left / max;
        this.bossFill.style.transform = `scaleX(${f})`;
        this.bossGhost.style.transform = `scaleX(${f})`;
        this.bossPct.textContent = `${left} LEFT`;
      }
      return;
    }
    if (s.mode === 'boss') {
      if (s.bossName !== this.pBossName) {
        this.pBossName = s.bossName;
        this.bossName.textContent = s.bossName;
      }
      const life = Math.round(clamp01(s.bossLife) * 1000) / 1000;
      if (life !== this.pBoss) {
        if (this.pBoss >= 0 && life < this.pBoss) retrigger(this.board, 'is-hit');
        this.pBoss = life;
        this.bossFill.style.transform = `scaleX(${life})`;
        this.bossGhost.style.transform = `scaleX(${life})`;
        this.bossPct.textContent = `${Math.ceil(life * 100)}%`;
      }
      return;
    }
    const total = Math.max(0, Math.round(s.passengers));
    if (total !== this.pPassengers) {
      this.pPassengers = total;
      this.boardTotal.textContent = `/ ${total}`;
      this.ticks.replaceChildren();
      this.tickEls = [];
      for (let i = 0; i < total; i++) {
        const t = h('i');
        this.ticks.appendChild(t);
        this.tickEls.push(t);
      }
      this.pBoarded = -1;
    }
    const boarded = Math.max(0, Math.min(total, Math.round(s.boarded)));
    if (boarded !== this.pBoarded) {
      const prev = this.pBoarded;
      this.pBoarded = boarded;
      this.boardCount.textContent = String(boarded);
      for (let i = 0; i < this.tickEls.length; i++) {
        const t = this.tickEls[i];
        const cls = i < boarded ? 'on' : i === boarded ? 'next' : '';
        if (t.className.split(' ')[0] !== cls) t.className = cls;
      }
      if (prev >= 0 && boarded > prev) {
        for (let i = prev; i < boarded && i < this.tickEls.length; i++) retrigger(this.tickEls[i], 'fresh');
        retrigger(this.board, 'is-bump');
      }
    }
  }

  private updatePurse(s: HudSnapshot): void {
    const money = Math.floor(s.money);
    if (money !== this.pMoney) {
      const prev = this.pMoney;
      this.pMoney = money;
      this.money.textContent = `$${fmtInt(money)}`;
      const now = performance.now();
      if (prev >= 0 && now - this.moneyPulseAt > 110) {
        this.moneyPulseAt = now;
        this.moneyBox.classList.remove('is-up', 'is-down');
        retrigger(this.moneyBox, money > prev ? 'is-up' : 'is-down');
      }
    }
    const kills = Math.floor(s.kills);
    if (kills !== this.pKills) {
      this.pKills = kills;
      this.kills.textContent = fmtInt(kills);
    }
  }

  private updateTiles(slots: HudSlot[]): void {
    const n = Math.min(this.tiles.length, slots.length);
    for (let i = 0; i < n; i++) {
      const d = slots[i];
      const tv = this.tiles[i];
      if (d.id !== tv.id) {
        tv.id = d.id;
        tv.root.dataset.weapon = d.id;
        tv.ico.replaceChildren(fromHtml(WEAPON_SVG[d.id]));
        tv.key.textContent = String(d.key || i + 1);
      }
      const tip = d.owned ? d.name : `${d.name} · $${fmtInt(d.price)}`;
      if (tv.root.dataset.tip !== tip) tv.root.dataset.tip = tip;
      const cls = d.owned ? 'is-owned' : d.affordable ? 'is-afford' : 'is-locked';
      if (cls !== tv.cls) {
        const prev = tv.cls;
        tv.root.classList.remove(prev);
        tv.root.classList.add(cls);
        tv.cls = cls;
        // Newly affordable or just bought: a short brass flash.
        if ((cls === 'is-afford' && prev === 'is-locked') || (cls === 'is-owned' && prev !== 'is-owned')) retrigger(tv.root, 'is-new');
      }
      const caption = d.owned ? String(Math.max(0, Math.round(d.ammo))) : d.price > 0 ? `$${fmtInt(d.price)}` : 'FREE';
      if (caption !== tv.caption) {
        tv.caption = caption;
        tv.cap.textContent = caption;
      }
      const empty = d.owned && d.ammo <= 0;
      if (empty !== tv.empty) {
        tv.empty = empty;
        tv.root.classList.toggle('is-empty', empty);
      }
      if (d.selected !== tv.selected) {
        tv.selected = d.selected;
        tv.root.classList.toggle('is-selected', d.selected);
      }
    }
  }

  private updateWeapon(s: HudSnapshot): void {
    const w = s.weapon;
    const clip = Math.max(1, Math.round(w.clip));
    const bullets = Math.max(0, Math.round(w.bullets));
    const reloading = w.reload !== null && w.reload !== undefined;
    const low = !reloading && bullets <= Math.max(1, Math.floor(clip * 0.2)) && clip > 1;
    const empty = !reloading && bullets === 0;
    const engine = w.id === 'outboard';
    const key = `${w.id}|${w.name}|${bullets}|${clip}|${low ? 1 : 0}|${empty ? 1 : 0}|${reloading ? 1 : 0}`;
    if (key !== this.pWpnKey) {
      this.pWpnKey = key;
      this.wpnName.textContent = w.name;
      this.mag.textContent = String(bullets);
      this.clip.textContent = `/ ${clip}`;
      this.wpn.classList.toggle('is-low', low && !empty);
      this.wpn.classList.toggle('is-empty', empty);
      this.wpn.classList.toggle('is-reloading', reloading);
      this.wpn.classList.toggle('is-engine', engine);
      this.updatePips(w.id, clip, bullets);
    }
    const style = pipStyle(w.id, clip);
    const m = style === 'bar' ? Math.round((bullets / clip) * 300) / 300 : -1;
    if (m !== this.pMag) {
      this.pMag = m;
      this.magBar.style.display = m < 0 ? 'none' : '';
      if (m >= 0) this.magFill.style.transform = `scaleX(${m})`;
    }
    const r = reloading ? Math.round(clamp01(w.reload as number) * 200) / 200 : -1;
    if (r !== this.pReload) {
      this.pReload = r;
      this.reloadFill.style.transform = `scaleX(${Math.max(0, r)})`;
    }
    if (engine) {
      const spin = Math.round(clamp01(w.spin) * 100) / 100;
      if (spin !== this.pRpm) {
        this.pRpm = spin;
        this.rpm.style.transform = `scaleX(${spin})`;
        this.wpn.classList.toggle('is-spinning', spin > 0.95);
      }
      const heat = Math.round(clamp01(w.heat) * 100) / 100;
      if (heat !== this.pHeat) {
        this.pHeat = heat;
        this.heat.style.transform = `scaleX(${heat})`;
        // Keep the gradient pinned to the full track so the colour reads the heat.
        this.heat.style.setProperty('--w', `${heat > 0 ? (100 / heat).toFixed(1) : 100}%`);
        this.wpn.classList.toggle('is-hot', heat > 0.85);
      }
    }
  }

  private updatePips(id: WeaponId, clip: number, bullets: number): void {
    const style = pipStyle(id, clip);
    const pkey = `${style}|${clip}`;
    if (pkey !== this.pPipKey) {
      this.pPipKey = pkey;
      this.pips.replaceChildren();
      this.pipEls = [];
      this.cyl = null;
      if (style === 'cylinder') {
        this.cyl = h('span', 'lf-cyl');
        this.cyl.appendChild(fromHtml(CYLINDER_SVG));
        this.pips.appendChild(this.cyl);
        this.pipEls = Array.from(this.cyl.querySelectorAll('.ch'));
      } else if (style !== 'bar') {
        for (let i = 0; i < clip; i++) {
          const p = h('i', `lf-pip ${style === 'shell' ? '' : style}`);
          this.pips.appendChild(p);
          this.pipEls.push(p);
        }
      }
    }
    if (style === 'cylinder' && this.cyl) {
      // Chamber i (clockwise from 12 o'clock) is spent once i >= bullets; the
      // cylinder turns one chamber per shot.
      this.pipEls.forEach((c, i) => c.classList.toggle('is-spent', i >= bullets));
      this.cyl.style.transform = `rotate(${-(clip - bullets) * 60}deg)`;
    } else {
      // Shells / flare / bolt: spent ones from the left.
      const spent = clip - bullets;
      this.pipEls.forEach((p, i) => p.classList.toggle('is-spent', i < spent));
    }
  }

  private updateAbilities(s: HudSnapshot): void {
    const f = Math.round(clamp01(s.favour) * 200) / 200;
    if (f !== this.pFavour) {
      this.pFavour = f;
      this.wheelFill.setAttribute('stroke-dasharray', `${(f * 100).toFixed(1)} 100`);
      if (!s.favourReady) this.wheelSpokes.style.transform = `rotate(${(f * 180).toFixed(1)}deg)`;
      this.favourVal.textContent = s.favourReady ? 'READY' : `${Math.floor(f * 100)}%`;
    }
    if (s.favourReady !== this.pFavourReady) {
      this.pFavourReady = s.favourReady;
      this.wheel.classList.toggle('is-ready', s.favourReady);
      this.abilRow.classList.toggle('is-ready', s.favourReady);
      if (s.favourReady) {
        this.wheelSpokes.style.transform = '';
        this.favourVal.textContent = 'READY';
      } else {
        this.favourVal.textContent = `${Math.floor(f * 100)}%`;
      }
    }
    if (s.hornReady !== this.pHorn) {
      const restored = this.pHorn === false && s.hornReady;
      this.pHorn = s.hornReady;
      this.hornChip.classList.toggle('is-used', !s.hornReady);
      if (restored) retrigger(this.hornChip, 'is-fresh');
    }
    if (s.craneReady !== this.pCrane) {
      const restored = this.pCrane === false && s.craneReady;
      this.pCrane = s.craneReady;
      this.craneChip.classList.toggle('is-used', !s.craneReady);
      this.craneChip.title = s.craneReady ? 'Line up with the crane hook and shoot it to drop the crates' : 'Crane used this chapter';
      if (restored) retrigger(this.craneChip, 'is-fresh');
    }
    const hot = s.craneReady && (s.craneUnder ?? 0) >= CRANE.crowd;
    if (hot !== this.pCraneHot) {
      this.pCraneHot = hot;
      this.craneChip.classList.toggle('is-hot', hot);
    }
    const hp = Math.round(clamp01(s.health) * 200) / 200;
    if (hp !== this.pHealth) {
      this.pHealth = hp;
      this.healthFill.style.transform = `scaleX(${hp})`;
      this.healthNum.textContent = String(Math.ceil(hp * 100));
      this.health.classList.toggle('is-hurt', hp < 0.995);
      this.health.classList.toggle('is-low', hp < 0.35);
    }
  }
}
