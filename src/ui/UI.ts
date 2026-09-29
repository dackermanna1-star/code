import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, formatMoney } from '../core/math';
import { CATEGORIES, GRENADE, WEAPONS, WEAPON_MAP, WeaponDef, statsFor } from '../weapons/defs';
import { DEFENSES, DEFENSE_MAP, DefenseDef, turretCost } from '../defenses/defs';
import { Icons } from './Icons';
import { wavesForDay } from '../game/Progress';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const LOG = (v: number, max: number) => clamp(Math.log(1 + Math.max(0, v)) / Math.log(1 + max), 0.02, 1);

export interface DaySummary {
  day: number;
  kills: number;
  headshots: number;
  money: number;
  total: number;
  wave: number;
  waves: number;
  unlocks: string[];
  nextWaves: number;
}

export class UI {
  readonly icons = new Icons();
  private hudEl: HTMLDivElement;
  private refs: Record<string, HTMLElement> = {};
  private loadingEl: HTMLDivElement;
  private menuEl: HTMLDivElement | null = null;
  private overlayEl: HTMLDivElement | null = null;
  private shopEl: HTMLDivElement | null = null;
  shopOpen = false;
  private shopCat = 'pistol';
  private shopSel = 'm686';
  private shopTurretWeapon = '';
  private equipTarget = -1;
  private cache: Record<string, string> = {};
  private moneyShown = 0;
  private hmT = 0;
  private bannerT = 0;
  private dmgDirs: { el: HTMLDivElement; t: number }[] = [];
  private fpsT = 0;
  private frames = 0;
  private fps = 0;
  overlayOpen: string | null = null;

  constructor(private root: HTMLDivElement) {
    this.loadingEl = el('div', '', `<div class="inner"><div class="blood-banner"><div class="blood-title" style="font-size:54px">BLOOD ROAD</div></div><div class="bar"><i></i></div><div class="msg">Loading…</div></div>`);
    this.loadingEl.id = 'loading';
    root.appendChild(this.loadingEl);
    this.hudEl = el('div');
    this.hudEl.id = 'hud';
    this.hudEl.innerHTML = `
      <div id="vignette-low"></div>
      <div class="tl"><div class="money num" data-r="money">$0</div><div class="daywave" data-r="daywave"></div><div class="weather" data-r="weather"></div></div>
      <div class="tc"><div class="wavebox" data-r="wavebox"></div><div class="wavebar" data-r="wavebarw"><i data-r="wavebar"></i></div></div>
      <div class="tr"><div class="kills" data-r="kills"></div><div class="fps" data-r="fps"></div></div>
      <div id="killfeed"></div>
      <div class="bl"><div class="hp"><i data-r="hpbar"></i><b data-r="hptext"></b></div><div class="gren" data-r="gren"></div></div>
      <div class="bc" data-r="inv"></div>
      <div class="br"><div class="wname" data-r="wname"></div><div class="ammo" data-r="ammo"></div><div class="gauge" data-r="gaugew"><i data-r="gauge"></i></div><div class="slots" data-r="slots"></div></div>
      <div id="xh" data-r="xh"><i class="l"></i><i class="r"></i><i class="t"></i><i class="b"></i><i class="dot"></i></div>
      <div id="hm" data-r="hm"><i style="transform:translate(-14px,-8px) rotate(45deg)"></i><i style="transform:translate(4px,-8px) rotate(-45deg)"></i><i style="transform:translate(-14px,6px) rotate(-45deg)"></i><i style="transform:translate(4px,6px) rotate(45deg)"></i></div>
      <div id="dmgdir" data-r="dmgdir"></div>
      <div class="prompt" data-r="prompt"></div>
      <div class="center-help" data-r="help"></div>
      <div id="banner" data-r="banner"><div class="blood-banner big blood-title" data-r="bannerBig"></div><div class="sub" data-r="bannerSub"></div></div>
      <div id="toasts" data-r="toasts"></div>`;
    this.hudEl.querySelectorAll('[data-r]').forEach((e) => (this.refs[(e as HTMLElement).dataset.r!] = e as HTMLElement));
    this.hudEl.classList.add('hidden');
    root.appendChild(this.hudEl);
    for (let i = 0; i < 6; i++) {
      const d = el('div');
      this.refs.dmgdir.appendChild(d);
      this.dmgDirs.push({ el: d, t: 0 });
    }
    this.icons.onReady = () => {
      this.cache = {};
      if (this.shopOpen) this.renderShop();
    };
  }

  // ------------------------------------------------------------------ loading
  loading(p: number, msg: string) {
    (this.loadingEl.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    (this.loadingEl.querySelector('.msg') as HTMLElement).textContent = msg;
  }
  hideLoading() {
    this.loadingEl.remove();
  }

  // ------------------------------------------------------------------ menu
  showMenu() {
    this.hideMenu();
    this.hudEl.classList.add('hidden');
    const p = G.progress.data;
    const has = G.progress.hasSave() && (p.day > 1 || p.stats.kills > 0);
    const m = el('div');
    m.id = 'menu';
    m.innerHTML = `
      <div class="blood-banner"><h1 class="blood-title">BLOOD ROAD</h1><div class="tag">Hold the road. Kill the horde. Survive the day.</div></div>
      <div class="buttons">
        ${has ? `<div class="save-info">DAY ${p.day} &nbsp;·&nbsp; ${wavesForDay(p.day)} WAVES &nbsp;·&nbsp; ${formatMoney(p.money)}</div><button class="btn primary" data-a="continue">Continue — Day ${p.day}</button>` : `<button class="btn primary" data-a="new">Start Day 1</button>`}
        ${has ? `<button class="btn" data-a="new">New Game</button>` : ''}
        <button class="btn" data-a="help">How to Play</button>
        <button class="btn" data-a="settings">Settings</button>
      </div>
      <div class="foot"><span>Best day: ${p.stats.bestDay} &nbsp; Kills: ${p.stats.kills.toLocaleString()}</span><span>Click to play · WASD · Mouse</span></div>`;
    m.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (!a) return;
      G.audio?.unlock();
      G.audio?.play('uiClick', {});
      const act = a.dataset.a;
      if (act === 'continue') G.game.startDay(G.progress.data.day);
      else if (act === 'new') {
        if (has && !confirm('Start over from Day 1? Your progress, weapons and money will be lost.')) return;
        G.progress.reset();
        G.game.startDay(1);
      } else if (act === 'help') this.showHelp();
      else if (act === 'settings') this.showSettings();
    });
    this.root.appendChild(m);
    this.menuEl = m;
  }
  hideMenu() {
    this.menuEl?.remove();
    this.menuEl = null;
  }

  // ------------------------------------------------------------------ overlays
  private overlay(html: string, cls = '', onClick?: (a: string, e: MouseEvent) => void) {
    this.closeOverlay();
    const o = el('div', 'overlay', `<div class="panel ${cls}">${html}</div>`);
    o.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (a) {
        G.audio?.play('uiClick', {});
        onClick?.(a.dataset.a!, e);
      }
    });
    this.root.appendChild(o);
    this.overlayEl = o;
    return o;
  }
  closeOverlay() {
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.overlayOpen = null;
  }

  showPause() {
    this.overlayOpen = 'pause';
    this.overlay(
      `<h2>PAUSED</h2><div class="stack" style="width:320px">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="help">Controls</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="quit">Quit to Menu</button></div>`,
      '',
      (a) => {
        if (a === 'resume') G.game.resume();
        else if (a === 'settings') this.showSettings(true);
        else if (a === 'help') this.showHelp(true);
        else if (a === 'quit') G.game.quitToMenu();
      },
    );
    this.overlayOpen = 'pause';
  }

  showHelp(fromPause = false) {
    this.overlay(
      `<h2>HOW TO PLAY</h2>
      <div class="help-grid">
        <div><span>Move / Sprint / Jump</span><span><span class="kbd">WASD</span><span class="kbd">Shift</span><span class="kbd">Space</span></span></div>
        <div><span>Shoot / Aim</span><span><span class="kbd">LMB</span><span class="kbd">RMB</span></span></div>
        <div><span>Reload</span><span class="kbd">R</span></div>
        <div><span>Weapons</span><span><span class="kbd">1-4</span><span class="kbd">Wheel</span><span class="kbd">Q</span></span></div>
        <div><span>Grenade (hold to aim)</span><span class="kbd">G</span></div>
        <div><span>Build mode</span><span class="kbd">F</span></div>
        <div><span>Rotate structure</span><span><span class="kbd">Q</span><span class="kbd">E</span><span class="kbd">Wheel</span></span></div>
        <div><span>Pick up structure (prep)</span><span>hold <span class="kbd">E</span></span></div>
        <div><span>Shop (between waves)</span><span><span class="kbd">B</span><span class="kbd">Tab</span></span></div>
        <div><span>Start next wave</span><span class="kbd">Enter</span></div>
        <div><span>Crouch</span><span class="kbd">C</span></div>
        <div><span>Pause</span><span class="kbd">Esc</span></div>
      </div>
      <div class="help-note">Every dollar comes from killing zombies. Survive all waves of a day to unlock the next —
      days 1–10 have 3 waves, 11–20 have 4, and so on up to 10. Buy guns, build barricades and traps between waves.
      Destroyed defenses are gone for good: there is no repair, so place them wisely.</div>
      <div style="margin-top:16px;text-align:right"><button class="btn primary" data-a="back">Back</button></div>`,
      '',
      (a) => {
        if (a === 'back') fromPause ? this.showPause() : this.closeOverlay();
      },
    );
    this.overlayOpen = fromPause ? 'pause' : 'help';
  }

  showSettings(fromPause = false) {
    const s = G.progress.data.settings;
    const o = this.overlay(
      `<h2>SETTINGS</h2>
      <div style="width:min(460px,86vw)">
      <div class="row"><label>Mouse sensitivity</label><input type="range" min="0.2" max="3" step="0.05" data-k="sensitivity" value="${s.sensitivity}"></div>
      <div class="row"><label>Field of view</label><input type="range" min="65" max="105" step="1" data-k="fov" value="${s.fov}"></div>
      <div class="row"><label>Master volume</label><input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"></div>
      <div class="row"><label>Effects volume</label><input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></div>
      <div class="row"><label>Ambience volume</label><input type="range" min="0" max="1" step="0.05" data-k="music" value="${s.music}"></div>
      <div class="row"><label>Pixel size (0 = auto)</label><input type="range" min="0" max="4" step="1" data-k="pixelSize" value="${s.pixelSize}"></div>
      <div class="row"><label>Quality</label><select data-k="quality"><option value="low"${s.quality === 'low' ? ' selected' : ''}>Low</option><option value="medium"${s.quality === 'medium' ? ' selected' : ''}>Medium</option><option value="high"${s.quality === 'high' ? ' selected' : ''}>High</option></select></div>
      <div class="row"><label>Invert mouse Y</label><input type="checkbox" data-k="invertY"${s.invertY ? ' checked' : ''}></div>
      <div class="row"><label>Show FPS</label><input type="checkbox" data-k="showFps"${s.showFps ? ' checked' : ''}></div>
      </div>
      <div style="margin-top:16px;text-align:right"><button class="btn primary" data-a="back">Done</button></div>`,
      '',
      (a) => {
        if (a === 'back') fromPause ? this.showPause() : this.closeOverlay();
      },
    );
    this.overlayOpen = fromPause ? 'pause' : 'settings';
    o.querySelectorAll('[data-k]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = inp as HTMLInputElement;
        const k = i.dataset.k as keyof typeof s;
        const v = i.type === 'checkbox' ? i.checked : i.tagName === 'SELECT' ? i.value : parseFloat(i.value);
        (s as any)[k] = v;
        G.progress.save();
        G.game.applySettings();
      });
    });
  }

  showDayEnd(sum: DaySummary) {
    this.overlayOpen = 'dayEnd';
    this.hudEl.classList.add('hidden');
    this.overlay(
      `<div class="blood-banner"><h2 class="blood-title">DAY ${sum.day} SURVIVED</h2></div>
      <div class="body">
        <div class="stats">
          <div><span>Zombies killed</span><b>${sum.kills}</b></div>
          <div><span>Headshots</span><b>${sum.headshots}</b></div>
          <div><span>Money earned</span><b>${formatMoney(sum.money)}</b></div>
          <div><span>Total money</span><b>${formatMoney(sum.total)}</b></div>
        </div>
        <div class="unlocks"><h4>DAY ${sum.day + 1}: ${sum.nextWaves} WAVES${sum.nextWaves > sum.waves ? ' (+1 wave!)' : ''}</h4>
          ${sum.unlocks.length ? `<h4 style="margin-top:8px">NEW IN THE SHOP</h4>${sum.unlocks.map((u) => `<div>• ${esc(u)}</div>`).join('')}` : '<div>The horde grows stronger…</div>'}
        </div>
        <div class="actions"><button class="btn" data-a="shop">Shop</button><button class="btn primary" data-a="next">Continue to Day ${sum.day + 1}</button><button class="btn" data-a="menu">Main Menu</button></div>
      </div>`,
      'summary',
      (a) => {
        if (a === 'next') G.game.nextDay();
        else if (a === 'menu') G.game.quitToMenu(true);
        else if (a === 'shop') this.openShop(true);
      },
    );
    this.overlayOpen = 'dayEnd';
  }

  showDeath(sum: DaySummary) {
    this.overlayOpen = 'dead';
    this.hudEl.classList.add('hidden');
    this.overlay(
      `<div class="blood-banner" style="background:linear-gradient(#5a0509,#3a0306)"><h2 class="blood-title">YOU DIED</h2></div>
      <div class="body">
        <div style="font-family:var(--font-pixel);margin-bottom:12px">Day ${sum.day} — Wave ${sum.wave} of ${sum.waves}</div>
        <div class="stats">
          <div><span>Zombies killed</span><b>${sum.kills}</b></div>
          <div><span>Headshots</span><b>${sum.headshots}</b></div>
          <div><span>Money earned (kept)</span><b>${formatMoney(sum.money)}</b></div>
          <div><span>Total money</span><b>${formatMoney(sum.total)}</b></div>
        </div>
        <div class="help-note" style="margin:0 auto 14px">Your money, weapons and unplaced defenses are kept. Spend them and try again.</div>
        <div class="actions"><button class="btn" data-a="shop">Shop</button><button class="btn primary" data-a="retry">Retry Day ${sum.day}</button><button class="btn" data-a="menu">Main Menu</button></div>
      </div>`,
      'summary',
      (a) => {
        if (a === 'retry') G.game.startDay(G.progress.data.day);
        else if (a === 'menu') G.game.quitToMenu(true);
        else if (a === 'shop') this.openShop(true);
      },
    );
    this.overlayOpen = 'dead';
  }

  // ------------------------------------------------------------------ shop
  private returnTo: 'game' | 'summary' = 'game';
  openShop(fromSummary = false) {
    this.returnTo = fromSummary ? 'summary' : 'game';
    this.shopOpen = true;
    if (!this.shopEl) {
      this.shopEl = el('div');
      this.shopEl.id = 'shop';
      this.shopEl.addEventListener('click', (e) => this.onShopClick(e));
      this.shopEl.addEventListener('change', (e) => {
        const t = e.target as HTMLSelectElement;
        if (t.dataset.k === 'turretw') {
          this.shopTurretWeapon = t.value;
          this.renderShop();
        }
      });
      this.root.appendChild(this.shopEl);
    }
    this.shopEl.classList.remove('hidden');
    if (this.overlayEl) this.overlayEl.style.display = 'none';
    this.renderShop();
  }

  closeShop() {
    this.shopOpen = false;
    this.shopEl?.classList.add('hidden');
    if (this.overlayEl) this.overlayEl.style.display = '';
    this.equipTarget = -1;
    G.game.onShopClosed(this.returnTo);
  }

  private weaponIcon(id: string) {
    const lvl = Math.max(0, G.progress.level(id));
    const s = statsFor(WEAPON_MAP[id], lvl);
    return this.icons.get(`w:${id}${s.visual.length ? ':' + s.visual.join(',') : ''}`);
  }
  private defenseIcon(id: string, weapon?: string) {
    return this.icons.get(`d:${id}${weapon ? ':' + weapon : ''}`);
  }

  private onShopClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!t) return;
    const a = t.dataset.a!;
    const v = t.dataset.v ?? '';
    const P = G.progress;
    let ok = true;
    if (a === 'cat') {
      this.shopCat = v;
      const first = this.itemsFor(v)[0];
      if (first) this.shopSel = first;
      G.audio?.play('uiClick', {});
    } else if (a === 'sel') {
      this.shopSel = v;
      G.audio?.play('uiClick', {});
    } else if (a === 'buy') {
      ok = P.buyWeapon(v);
      if (ok) G.game.refreshLoadout();
    } else if (a === 'upgrade') {
      ok = P.upgradeWeapon(v);
      if (ok) G.game.refreshLoadout();
    } else if (a === 'equip') {
      P.equip(this.shopSel, parseInt(v, 10));
      G.game.refreshLoadout();
      G.audio?.play('equip', {});
    } else if (a === 'lslot') {
      const i = parseInt(v, 10);
      if (e.shiftKey || e.button === 2) P.unequip(i);
      else if (WEAPON_MAP[this.shopSel] && P.owns(this.shopSel)) {
        P.equip(this.shopSel, i);
        G.audio?.play('equip', {});
      } else if (P.data.loadout[i]) {
        this.shopSel = P.data.loadout[i]!;
        this.shopCat = WEAPON_MAP[this.shopSel].category;
      }
      G.game.refreshLoadout();
    } else if (a === 'unequip') {
      P.unequip(parseInt(v, 10));
      G.game.refreshLoadout();
    } else if (a === 'buydef') {
      const def = DEFENSE_MAP[v];
      if (def.kind === 'turret') {
        const w = this.shopTurretWeapon;
        if (!w || !P.owns(w)) ok = false;
        else ok = P.buyItem(`${v}:${w}`, turretCost(def, WEAPON_MAP[w].cost));
      } else ok = P.buyItem(v, def.cost);
    } else if (a === 'buygren') {
      ok = P.buyGrenade();
      if (ok) G.weapons.grenades = P.data.grenades;
    } else if (a === 'close') {
      this.closeShop();
      return;
    }
    if (a === 'buy' || a === 'upgrade' || a === 'buydef' || a === 'buygren') G.audio?.play(ok ? 'buy' : 'uiError', {});
    this.renderShop();
  }

  private itemsFor(cat: string): string[] {
    if (cat === 'defense') return DEFENSES.slice().sort((a, b) => a.unlockDay - b.unlockDay || a.cost - b.cost).map((d) => d.id);
    if (cat === 'equipment') return ['grenade'];
    return WEAPONS.filter((w) => w.category === cat).sort((a, b) => a.unlockDay - b.unlockDay || a.cost - b.cost).map((w) => w.id);
  }

  renderShop() {
    if (!this.shopEl) return;
    const P = G.progress;
    const d = P.data;
    const cats = [...CATEGORIES.map((c) => ({ id: c.id as string, label: c.label })), { id: 'equipment', label: 'Equipment' }];
    const items = this.itemsFor(this.shopCat);
    if (!items.includes(this.shopSel)) this.shopSel = items[0];
    const loadout = (d.loadout as (string | null)[])
      .map((id: string | null, i: number) => {
        const img = id ? this.weaponIcon(id) : '';
        return `<div class="lslot${this.equipTarget === i ? ' target' : ''}" data-a="lslot" data-v="${i}" title="${id ? esc(WEAPON_MAP[id].name) + ' — click to equip selected here' : 'Empty'}"><span>${i + 1}</span>${img ? `<img src="${img}">` : ''}</div>`;
      })
      .join('');
    const grid = items
      .map((id) => {
        if (this.shopCat === 'defense') {
          const def = DEFENSE_MAP[id];
          const locked = def.unlockDay > d.day;
          const cnt = def.kind === 'turret' ? Object.keys(d.inventory).filter((k) => k.startsWith(def.id + ':')).reduce((a, k) => a + d.inventory[k].length, 0) : P.itemCount(id);
          const price = def.kind === 'turret' ? `${formatMoney(def.cost)}+` : formatMoney(def.cost);
          return `<div class="item${this.shopSel === id ? ' on' : ''}${locked ? ' locked' : ''}" data-a="sel" data-v="${id}">
            ${locked ? `<div class="tag lock">DAY ${def.unlockDay}</div>` : cnt ? `<div class="tag own">x${cnt}</div>` : ''}
            <img src="${this.defenseIcon(id)}" alt=""><div class="nm">${esc(def.name)}</div>
            <div class="pr ${d.money >= def.cost ? 'can' : 'cant'}">${price}</div></div>`;
        }
        if (this.shopCat === 'equipment') {
          return `<div class="item${this.shopSel === id ? ' on' : ''}" data-a="sel" data-v="grenade"><div class="tag own">x${d.grenades}</div>
            <img src="${this.icons.get('g:grenade')}" alt=""><div class="nm">${GRENADE.name}</div><div class="pr ${d.money >= GRENADE.cost ? 'can' : 'cant'}">${formatMoney(GRENADE.cost)}</div></div>`;
        }
        const w = WEAPON_MAP[id];
        const owned = P.owns(id);
        const locked = w.unlockDay > d.day;
        const eq = d.loadout.includes(id);
        return `<div class="item${this.shopSel === id ? ' on' : ''}${locked ? ' locked' : ''}" data-a="sel" data-v="${id}">
          ${locked ? `<div class="tag lock">DAY ${w.unlockDay}</div>` : eq ? '<div class="tag eq">EQUIPPED</div>' : owned ? '<div class="tag own">OWNED</div>' : ''}
          <img src="${this.weaponIcon(id)}" alt=""><div class="nm">${esc(owned ? statsFor(w, P.level(id)).levelName : w.name)}</div>
          <div class="pr ${owned ? '' : d.money >= w.cost ? 'can' : 'cant'}">${owned ? (w.levels && P.level(id) < w.levels.length ? 'Upgrade available' : '&nbsp;') : w.cost === 0 ? 'FREE' : formatMoney(w.cost)}</div></div>`;
      })
      .join('');
    this.shopEl.innerHTML = `<div class="win">
      <div class="head"><h2 class="blood-title">SHOP</h2><div class="loadout">${loadout}</div><div class="cash">${formatMoney(d.money)}</div></div>
      <div class="main">
        <div class="cats">${cats.map((c) => `<div class="cat${this.shopCat === c.id ? ' on' : ''}" data-a="cat" data-v="${c.id}">${esc(c.label)}</div>`).join('')}</div>
        <div class="grid">${grid}</div>
        <div class="detail">${this.detailHtml()}</div>
      </div>
      <div class="foot"><span>Money only comes from kills. Day ${d.day} · ${wavesForDay(d.day)} waves</span><button class="btn primary" data-a="close">Done  (B)</button></div>
    </div>`;
  }

  private statRow(label: string, val: number, max: number, text: string, up?: number) {
    const w = LOG(val, max) * 100;
    const u = up !== undefined && up > val ? LOG(up, max) * 100 : 0;
    return `<div class="stat"><span>${label}</span><div class="sb">${u ? `<em style="width:${u}%"></em>` : ''}<i style="width:${w}%"></i></div><b>${text}</b></div>`;
  }

  private detailHtml(): string {
    const P = G.progress;
    const d = P.data;
    const id = this.shopSel;
    if (this.shopCat === 'equipment') {
      return `<img src="${this.icons.get('g:grenade')}"><h3>${GRENADE.name}</h3>
        <div class="desc">Pull the pin, hold <span class="kbd">G</span> to aim the arc, release to throw. Huge blast, launches bodies. Carry up to ${GRENADE.max}.</div>
        ${this.statRow('Damage', GRENADE.damage, 500, String(GRENADE.damage))}
        ${this.statRow('Blast radius', GRENADE.radius, 12, GRENADE.radius + 'm')}
        <div class="special">Owned: ${d.grenades} / ${GRENADE.max}</div>
        <div class="acts"><button class="btn gold" data-a="buygren" ${d.money < GRENADE.cost || d.grenades >= GRENADE.max ? 'disabled' : ''}>Buy — ${formatMoney(GRENADE.cost)}</button></div>`;
    }
    if (this.shopCat === 'defense') {
      const def = DEFENSE_MAP[id] as DefenseDef;
      const locked = def.unlockDay > d.day;
      let extra = '';
      let price = def.cost;
      let canBuy = !locked;
      if (def.kind === 'turret') {
        const capable = Object.keys(d.owned).filter((w) => WEAPON_MAP[w]?.turret);
        if (!capable.includes(this.shopTurretWeapon)) this.shopTurretWeapon = capable[0] ?? '';
        if (capable.length === 0) {
          extra = `<div class="special">You need a turret-capable weapon first (Glock 17, MP5K, P90, Saiga 12, BP-12, AA-12, M4 CQB, VSS, M249, M2 Browning, Laser Gun).</div>`;
          canBuy = false;
        } else {
          price = turretCost(def, WEAPON_MAP[this.shopTurretWeapon].cost);
          extra = `<div class="row" style="margin-top:8px"><label>Mounted weapon</label><select data-k="turretw">${capable
            .map((w) => `<option value="${w}"${w === this.shopTurretWeapon ? ' selected' : ''}>${esc(WEAPON_MAP[w].name)}</option>`)
            .join('')}</select></div>`;
        }
      }
      const owned = def.kind === 'turret' ? Object.keys(d.inventory).filter((k) => k.startsWith(def.id + ':')).reduce((a, k) => a + d.inventory[k].length, 0) : P.itemCount(id);
      const kindTxt = def.kind === 'barrier' ? 'Barrier — blocks zombies until destroyed' : def.kind === 'trap' ? 'Trap' : 'Automated defense';
      return `<img src="${this.defenseIcon(id, def.kind === 'turret' ? this.shopTurretWeapon : undefined)}"><h3>${esc(def.name)}</h3>
        <div class="desc">${esc(def.desc)}</div>
        ${this.statRow('Durability', def.hp, 5000, String(def.hp))}
        ${def.thorns ? this.statRow('Thorns', def.thorns, 20, String(def.thorns)) : ''}
        ${def.trap?.dps ? this.statRow('Damage / s', def.trap.dps, 30, String(def.trap.dps)) : ''}
        ${def.trap?.damage ? this.statRow('Damage', def.trap.damage, 300, String(def.trap.damage)) : ''}
        ${def.trap?.slow ? this.statRow('Slow', (1 - def.trap.slow) * 100, 100, Math.round((1 - def.trap.slow) * 100) + '%') : ''}
        ${def.turret ? this.statRow('Range', def.turret.range, 60, def.turret.range + 'm') : ''}
        <div class="special">${kindTxt}. In inventory: ${owned}. No repairs — destroyed means gone.</div>
        ${extra}
        <div class="acts">${locked ? `<button class="btn" disabled>Unlocks on Day ${def.unlockDay}</button>` : `<button class="btn gold" data-a="buydef" data-v="${id}" ${!canBuy || d.money < price ? 'disabled' : ''}>Buy — ${formatMoney(price)}</button>`}</div>`;
    }
    const w = WEAPON_MAP[id] as WeaponDef;
    const lvl = P.level(id);
    const owned = lvl >= 0;
    const s = statsFor(w, Math.max(0, lvl));
    const next = owned && w.levels && lvl < w.levels.length ? w.levels[lvl] : null;
    const ns = next ? statsFor(w, lvl + 1) : null;
    const locked = w.unlockDay > d.day;
    const dmgTxt = w.charge ? `${s.charge!.minDmg}-${s.charge!.maxDmg}` : w.flame ? `${w.flame.dps}/s` : s.pellets > 1 ? `${s.damage}×${s.pellets}` : String(Math.round(s.damage * 10) / 10);
    const dmgV = w.charge ? s.charge!.maxDmg : w.flame ? w.flame.dps : w.projectile?.explosive ? w.projectile.explosive.damage : s.damage * s.pellets;
    const nDmg = ns ? (ns.charge ? ns.charge.maxDmg : ns.damage * ns.pellets) : undefined;
    const modeTxt: Record<string, string> = { semi: 'Semi-auto', auto: 'Full-auto', burst: '3-round burst', pump: 'Pump action', bolt: 'Bolt action', break: 'Break action', spin: 'Rotary (spin-up)', heat: 'Full-auto (heat-up)', flame: 'Continuous', bow: 'Draw & release', charge: 'Charge shot' };
    let special = '';
    if (w.special === 'airstrike') special = 'Air strike: the last round of each magazine may call a bombing run. Chance rises as your health drops — guaranteed below 50% health.';
    else if (w.special === 'spinup') special = 'Barrels must spin up before firing. Slows you down while spinning.';
    else if (w.special === 'heat') special = 'Must heat up (hold fire) before the beam fires. Burns through targets.';
    else if (w.special === 'charge') special = `Hold to charge (${s.charge!.time}s). Higher charge = more damage, penetration and stopping power, costs up to ${s.charge!.maxAmmo} cells.`;
    else if (w.special === 'strength') special = `Damage scales with draw strength and your Strength (x${G.progress.strength.toFixed(2)}${w.strengthScale && w.strengthScale > 1 ? `, ${w.strengthScale}x scaling` : ''}).${w.projectile?.explosive ? ' Explosive arrows.' : ''}${w.projectile?.fire ? ' Ignites targets.' : ''}`;
    else if (w.special === 'elite') special = 'Double damage against armored, brute and boss zombies.';
    else if (w.special === 'suppressed') special = 'Integrally suppressed: no muzzle flash, quiet.';
    if (w.projectile?.explosive && w.category === 'launcher') special = `Explosive: ${w.projectile.explosive.damage} damage in a ${w.projectile.explosive.radius}m radius. Launches bodies.`;
    if (w.turret) special += (special ? ' ' : '') + 'Turret capable.';
    let acts = '';
    if (locked) acts = `<button class="btn" disabled>Unlocks on Day ${w.unlockDay}</button>`;
    else if (!owned) acts = `<button class="btn gold" data-a="buy" data-v="${id}" ${d.money < w.cost ? 'disabled' : ''}>Buy — ${formatMoney(w.cost)}</button>`;
    else {
      if (next) {
        acts += next.unlockDay > d.day
          ? `<button class="btn" disabled>${esc(next.name)} — Day ${next.unlockDay}</button>`
          : `<button class="btn gold" data-a="upgrade" data-v="${id}" ${d.money < next.cost ? 'disabled' : ''}>Upgrade: ${esc(next.name)} — ${formatMoney(next.cost)}</button>`;
      }
      const slot = d.loadout.indexOf(id);
      acts += `<div class="eqrow"><span class="px" style="font-size:11px;width:60px">Equip:</span>${[0, 1, 2, 3]
        .map((i) => `<button class="btn small${slot === i ? ' primary' : ''}" data-a="equip" data-v="${i}">${i + 1}</button>`)
        .join('')}</div>`;
      if (slot >= 0 && d.loadout.filter(Boolean).length > 1) acts += `<button class="btn small" data-a="unequip" data-v="${slot}">Unequip</button>`;
    }
    const icon = this.weaponIcon(id);
    return `<img src="${icon}"><h3>${esc(owned ? s.levelName : w.name)}</h3>
      <div class="desc">${esc(next && next.unlockDay <= d.day ? next.desc : w.desc)}</div>
      ${this.statRow('Damage', dmgV, 500, dmgTxt, nDmg)}
      ${this.statRow('Fire rate', w.mode === 'flame' ? 600 : s.rpm, 3000, w.mode === 'flame' ? '—' : s.rpm + ' rpm', ns?.rpm)}
      ${this.statRow('Magazine', s.mag, 500, w.mode === 'flame' ? 'fuel ' + s.mag : String(s.mag), ns?.mag)}
      ${this.statRow('Penetration', w.charge ? s.charge!.maxPen : s.pen, 1500, String(w.charge ? s.charge!.maxPen : s.pen), ns?.charge ? ns.charge.maxPen : ns?.pen)}
      ${this.statRow('Stopping power', w.charge ? s.charge!.maxSp : s.stopping, 900, String(w.charge ? s.charge!.maxSp : s.stopping))}
      <div class="stat"><span>Action</span><span style="grid-column: span 2; text-align:right; color:#fff">${modeTxt[s.mode] ?? s.mode}</span></div>
      ${special ? `<div class="special">${esc(special)}</div>` : ''}
      <div class="acts">${acts}</div>`;
  }

  // ------------------------------------------------------------------ HUD api
  showHud(v: boolean) {
    this.hudEl.classList.toggle('hidden', !v);
  }

  toast(msg: string, sec = 2.6) {
    const t = el('div', '', esc(msg));
    this.refs.toasts.appendChild(t);
    setTimeout(() => t.remove(), sec * 1000);
    while (this.refs.toasts.children.length > 4) this.refs.toasts.firstChild?.remove();
  }

  banner(big: string, sub = '', dur = 2.4) {
    this.refs.bannerBig.textContent = big;
    this.refs.bannerSub.textContent = sub;
    this.refs.banner.classList.add('show');
    this.bannerT = dur;
  }

  hitmarker(kind: 'hit' | 'kill' | 'head') {
    const hm = this.refs.hm;
    hm.className = kind === 'kill' ? 'kill' : kind === 'head' ? 'head' : '';
    hm.style.opacity = '1';
    hm.style.transform = kind === 'hit' ? 'scale(0.8)' : 'scale(1.15)';
    this.hmT = kind === 'hit' ? 0.12 : 0.25;
  }

  private popups: { e: HTMLDivElement; p: THREE.Vector3; t: number }[] = [];
  moneyPopup(amount: number, x: number, y: number, z: number, head: boolean) {
    if (this.popups.length > 24) {
      const old = this.popups.shift()!;
      old.e.remove();
    }
    const e = el('div', 'popup' + (head ? ' head' : ''), `+$${amount}`);
    this.hudEl.appendChild(e);
    this.popups.push({ e, p: new THREE.Vector3(x, y, z), t: 0 });
  }

  damageDir(angle: number) {
    const d = this.dmgDirs.reduce((a, b) => (a.t < b.t ? a : b));
    d.t = 1;
    d.el.style.transform = `rotate(${(-angle * 180) / Math.PI}deg)`;
  }

  killfeed(text: string) {
    const k = document.getElementById('killfeed')!;
    const d = el('div', '', esc(text));
    k.prepend(d);
    setTimeout(() => d.remove(), 3000);
    while (k.children.length > 5) k.lastChild?.remove();
  }

  private set(key: string, html: string) {
    if (this.cache[key] === html) return;
    this.cache[key] = html;
    this.refs[key].innerHTML = html;
  }

  update(dt: number) {
    this.icons.pump(2);
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT > 0.5) {
      this.fps = Math.round(this.frames / this.fpsT);
      this.frames = 0;
      this.fpsT = 0;
    }
    if (this.hudEl.classList.contains('hidden')) return;
    const P = G.progress.data;
    const W = G.waves;
    const pl = G.player;
    // money (animated count)
    const target = P.money;
    if (Math.abs(this.moneyShown - target) > 0.5) {
      this.moneyShown += (target - this.moneyShown) * Math.min(1, dt * 10) + Math.sign(target - this.moneyShown) * 0.5;
      this.refs.money.classList.add('pop');
    } else {
      this.moneyShown = target;
      this.refs.money.classList.remove('pop');
    }
    this.set('money', formatMoney(this.moneyShown));
    this.set('daywave', `DAY ${W.day} · WAVE ${Math.max(1, W.wave)}/${W.total}`);
    this.set('weather', esc(G.atmosphere.state.label));
    if (W.phase === 'wave') {
      const left = W.remaining;
      this.set('wavebox', `ZOMBIES LEFT: <span class="num" style="font-size:22px">${left}</span>`);
      this.refs.wavebarw.style.display = '';
      this.refs.wavebar.style.width = `${clamp(1 - left / Math.max(1, W.waveSize), 0, 1) * 100}%`;
    } else if (W.phase === 'prep') {
      this.set('wavebox', `PREPARE — <span class="kbd">Enter</span> start wave ${W.wave + 1}/${W.total} &nbsp; <span class="kbd">B</span> shop &nbsp; <span class="kbd">F</span> build`);
      this.refs.wavebarw.style.display = 'none';
    } else {
      this.set('wavebox', '');
      this.refs.wavebarw.style.display = 'none';
    }
    this.set('kills', `☠ ${W.dayKills}`);
    this.set('fps', P.settings.showFps ? `${this.fps} FPS · ${G.zombies.list.length} Z · ${G.ragdolls.active.length}/${G.ragdolls.corpses.length} R/C` : '');
    // health
    const hpk = pl.hp / pl.maxHp;
    this.refs.hpbar.style.width = `${hpk * 100}%`;
    this.set('hptext', `${Math.ceil(pl.hp)} / ${pl.maxHp}`);
    (document.getElementById('vignette-low') as HTMLElement).style.boxShadow = `inset 0 0 ${hpk < 0.35 ? 200 : 0}px rgba(170,0,0,${hpk < 0.35 ? 0.5 + Math.sin(G.time * 6) * 0.2 : 0})`;
    this.set('gren', `GRENADES <span class="num" style="font-size:22px">${G.weapons.grenades}</span> <span class="kbd">G</span>`);
    // weapon
    const info = G.weapons.info();
    if (info) {
      this.set('wname', esc(info.name));
      const low = info.ammo <= Math.max(1, Math.floor(info.mag * 0.25));
      this.refs.ammo.classList.toggle('low', low);
      this.set('ammo', info.reloading && !info.fuel ? `<small>RELOADING</small>` : info.fuel ? `${info.ammo}<small>% FUEL</small>` : `${info.ammo}<small>/${info.mag}</small>`);
      let g = -1;
      if (info.reloading) g = info.reloadK;
      else if (info.mode === 'spin') g = info.spin;
      else if (info.mode === 'heat') g = info.heat;
      else if (info.mode === 'charge') g = info.charge;
      else if (info.mode === 'bow') g = info.draw;
      this.refs.gaugew.style.display = g >= 0 ? '' : 'none';
      if (g >= 0) this.refs.gauge.style.width = `${clamp(g, 0, 1) * 100}%`;
    }
    const slotsHtml = G.weapons.slots
      .map((w: any, i: number) => {
        if (!w) return `<div class="slot"><span>${i + 1}</span></div>`;
        const icon = this.weaponIcon(w.id);
        return `<div class="slot${i === G.weapons.cur ? ' on' : ''}"><span>${i + 1}</span>${icon ? `<img src="${icon}">` : ''}</div>`;
      })
      .join('');
    this.set('slots', slotsHtml);
    // inventory bar
    const items = G.placement.items();
    const invHtml =
      `<div class="buildhint">${G.placement.active ? '<span class="kbd">LMB</span> place &nbsp;<span class="kbd">Q</span><span class="kbd">E</span> rotate &nbsp;<span class="kbd">F</span> exit' : W.phase === 'prep' || W.phase === 'wave' ? '<span class="kbd">F</span> BUILD' : ''}</div>` +
      (items as import('../defenses/Placement').InvItem[])
        .map((it, i: number) => {
          const icon = this.defenseIcon(it.defId, it.weaponId);
          const hp = it.hp.length ? Math.min(...it.hp) : 1;
          return `<div class="inv${G.placement.active && G.placement.selected === i ? ' sel' : ''}"><span>${i + 1}</span>${icon ? `<img src="${icon}">` : ''}<b>${it.count}</b>${hp < 0.999 ? `<i><em style="width:${hp * 100}%"></em></i>` : ''}</div>`;
        })
        .join('');
    this.set('inv', invHtml);
    // crosshair
    const xh = this.refs.xh;
    const sp = info ? 6 + G.weapons.bloom * 3 + (pl.moving ? 5 : 0) + (pl.onGround ? 0 : 8) : 8;
    const adsHide = G.weapons.ads > 0.6 && info && info.category !== 'shotgun';
    xh.style.opacity = adsHide || G.placement.active ? '0' : '1';
    const [l, r, t, b] = Array.from(xh.children) as HTMLElement[];
    l.style.transform = `translate(${-sp - 9}px,0)`;
    r.style.transform = `translate(${sp}px,0)`;
    t.style.transform = `translate(0,${-sp - 9}px)`;
    b.style.transform = `translate(0,${sp}px)`;
    // hitmarker
    if (this.hmT > 0) {
      this.hmT -= dt;
      if (this.hmT <= 0) this.refs.hm.style.opacity = '0';
    }
    // damage direction
    for (const d of this.dmgDirs) {
      if (d.t > 0) d.t -= dt * 1.2;
      d.el.style.opacity = String(Math.max(0, d.t));
    }
    // banner
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.refs.banner.classList.remove('show');
    }
    // prompts
    let prompt = '';
    const pt = G.placement.pickTarget;
    if (pt) prompt = `Hold <span class="kbd">E</span> to pack up ${esc(pt.def.name)} (${Math.round((pt.hp / pt.maxHp) * 100)}%)` + (G.placement.pickT > 0 ? `<div class="pbar"><i style="width:${(G.placement.pickT / 0.6) * 100}%"></i></div>` : '');
    if (G.placement.active && !G.placement.valid && G.placement.reason) prompt = `<span style="color:#ff8a80">${esc(G.placement.reason)}</span>`;
    this.set('prompt', prompt);
    let help = '';
    if (W.phase === 'prep' && W.wave === 0 && W.day <= 2) help = `Place your barricade with <span class="kbd">F</span>, check the shop with <span class="kbd">B</span>,<br>then press <span class="kbd">Enter</span> when you are ready.`;
    this.set('help', help);
    // world-space money popups
    const cam = G.camera;
    const v = new THREE.Vector3();
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t > 1.1) {
        p.e.remove();
        this.popups.splice(i, 1);
        continue;
      }
      v.copy(p.p);
      v.y += p.t * 0.8;
      v.project(cam);
      if (v.z > 1) {
        p.e.style.opacity = '0';
        continue;
      }
      p.e.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      p.e.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
      p.e.style.opacity = String(1 - Math.max(0, p.t - 0.6) / 0.5);
    }
  }
}
