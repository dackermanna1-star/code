// LAST LOOKOUT — TowerHud: the in-game HUD, the scope overlay, the shop and the menu screens.
//
//   const hud = new TowerHud(document.body, handlers, { audio, settings });
//   hud.update(dt, S);   // every frame (S: see CONTRACTS.md §5; extra optional fields below)
//   hud.event({ type: 'hit', head, kill });  // and 'bonus', 'wave', 'gateHit', 'playerHurt', 'killfeed', ...
//
// handlers: onResume(), onQuit(), onSetting(key, value), onShopBuy(id, info), onShopClose(),
// onPlace(kind), onStart({ continue }), onRestart(), and optionally onUi(kind).
//
// Optional S fields beyond the contract: S.thermal (bool), S.countdown (seconds to the next wave),
// S.rifle.id, S.rifle.magSize. Optional events: { type: 'cleared', n, kills, headshots, bonus },
// { type: 'shot' } (scope jolt), { type: 'alert', text }, { type: 'cash', amount }.
//
// The DOM is built in the constructor; importing this module touches nothing (Node-safe).

import { RIFLES, DEFENCES } from '../catalog.js';
import { el, setText, setStyle, toggle, retrigger, SegBar, Pool } from './dom.js';
import { themeCSS } from './theme.js';
import { ensurePixelFont } from './pixelFont.js';
import { cartridge, hitMarker, hipReticle, hudIcon, skull, noiseTile, grungeTile } from './sprites.js';
import { ScopeOverlay } from './scope.js';
import { Shop } from './shop.js';
import { Screens } from './screens.js';
import { SETTINGS, mergeSettings, sanitizeSetting } from './settingsModel.js';
import {
  formatCash, formatCashDelta, groupThousands, pad, waveTitle, formatClock, frac, ratio, approach,
} from './format.js';

const STYLE_ID = 'll-hud-css';

function drawInto(canvas, src) {
  canvas.width = src.width;
  canvas.height = src.height;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, src.width, src.height);
  c.drawImage(src, 0, 0);
}

function iconCanvas(parent, id, cls = '') {
  const c = el('canvas', cls, parent);
  drawInto(c, hudIcon(id));
  return c;
}

/** Upper case, but metres stay 'm' ('LONG SHOT 238 m'). */
function upperKeepUnits(s) {
  return String(s ?? '').toUpperCase().replace(/(\d)\s?M\b/g, '$1 m').replace(/ M\/S\b/g, ' m/s');
}

const rifleIdByName = new Map(Object.entries(RIFLES).map(([id, r]) => [r.name, id]));

export class TowerHud {
  constructor(parent = document.body, handlers = {}, opts = {}) {
    this.h = handlers || {};
    this.audio = opts.audio || null;
    this.settings = mergeSettings(opts.settings);
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = themeCSS(noiseTile(96, 7, 0.1), grungeTile());
      document.head.appendChild(st);
    }
    this.fontReady = ensurePixelFont();
    this._fire = (name, ...args) => {
      const f = this.h[name];
      if (typeof f === 'function') {
        try {
          f(...args);
        } catch (e) {
          console.error(e);
        }
      }
    };
    this._ui = (kind) => {
      try {
        if (this.audio && this.audio.ui) this.audio.ui(kind);
        if (typeof this.h.onUi === 'function') this.h.onUi(kind);
      } catch (e) {
        // sound is never allowed to break the UI
      }
    };

    const root = (this.root = el('div', 'll m-play', parent));
    const hud = (this.hud = el('div', 'hud', root));
    // mood / damage overlays under everything
    this.vig = el('div', 'vig', hud);
    this.lowhp = el('div', 'lowhp', hud);
    this.gatefx = el('div', 'gatefx', hud);
    this.scope = new ScopeOverlay(hud);
    this.focusfx = el('div', 'focusfx', hud);
    el('div', 'lb t', hud);
    el('div', 'lb b', hud);
    el('div', 'focuslbl', hud, '◀◀ FOCUS ▶▶');
    const play = (this.play = el('div', 'play', hud));
    play.style.position = 'absolute';
    play.style.inset = '0';
    play.style.transition = 'opacity .25s';

    // centre
    this.hip = el('canvas', 'hip', play);
    drawInto(this.hip, hipReticle());
    this.hm = el('canvas', 'hm', play);
    this.bonusBox = el('div', 'bonus', play);
    this.bonusPool = new Pool(this.bonusBox, 6, '');
    for (const b of this.bonusPool.items) {
      b._t = el('span', 't', b);
      b._c = el('span', 'c', b);
    }
    this.bonusQ = [];
    this.bonusT = 0;
    this.bonusRow = 0;
    this.bonusRowT = 0;

    // top left: wave
    const tl = (this.tl = el('div', 'pn tl', play));
    const r1 = el('div', 'row', tl);
    const wl = el('div', '', r1);
    el('span', 'lbl', wl, 'WAVE ');
    this.waveN = el('span', 'wave-n glow', wl, '01');
    const tod = el('div', 'tod', r1);
    this.todIcon = iconCanvas(tod, 'sun');
    this.todTxt = el('span', 'lbl', tod, 'DUSK');
    this.leftEl = el('div', 'left lbl', tl, '');
    this.fps = el('div', 'fps hide', root, '');

    // top right: cash, popups, kill feed
    const tr = el('div', 'pn tr', play);
    el('div', 'lbl', tr, 'FUNDS');
    this.cashEl = el('div', 'cash glow', tr, '$0');
    this.cashPop = el('div', 'cashpop', play);
    this.cashPool = new Pool(this.cashPop, 5, '');
    this.feed = el('div', 'feed', play);

    // boss bar
    this.bossEl = el('div', 'pn boss alert hide', play);
    const bn = el('div', 'name', this.bossEl);
    this.bossName = el('span', '', bn, 'BRUTE');
    this.bossHp = el('span', 'f12', bn, '');
    this.bossBar = new SegBar(this.bossEl);

    // bottom left: gate and cabin
    const bl = (this.bl = el('div', 'pn bl', play));
    const m1 = el('div', 'meter', bl);
    iconCanvas(m1, 'gate');
    const c1 = el('div', '', m1);
    el('div', 'lbl', c1, 'GATE INTEGRITY');
    this.gateBar = new SegBar(c1);
    this.gateVal = el('div', 'val', m1, '100%');
    const m2 = el('div', 'meter', bl);
    iconCanvas(m2, 'cabin');
    const c2 = el('div', '', m2);
    el('div', 'lbl', c2, 'LOOKOUT');
    this.hpBar = new SegBar(c2, 'hp');
    this.hpVal = el('div', 'val', m2, '100');

    // bottom right: rifle and rounds
    const br = (this.br = el('div', 'pn br', play));
    this.wstate = el('div', 'wstate', br, '');
    this.rifleEl = el('div', 'rifle sh', br, 'M91 BOLT');
    this.rounds = el('div', 'rounds', br);
    const al = el('div', 'ammo-line', br);
    this.ammoKey = el('span', 'key', al, 'T');
    this.ammoName = el('span', 'ammo-type sh', al, 'FMJ');
    this.reserve = el('span', 'reserve sh', al, '∞');
    this.roundEls = [];
    this.roundKey = '';
    this.magHigh = new Map();

    // bottom centre: breath + focus
    const bc = (this.bc = el('div', 'bc', play));
    this.breathMini = el('div', 'mini breath', bc);
    iconCanvas(this.breathMini, 'lungs');
    this.breathBar = new SegBar(this.breathMini, 'hp');
    this.focusMini = el('div', 'mini focus', bc);
    iconCanvas(this.focusMini, 'focus');
    this.focusBar = new SegBar(this.focusMini);
    el('span', 'key', this.focusMini, 'F');

    // banners, countdown, alerts, placement prompt
    const ban = el('div', 'banner', play);
    this.band = el('div', 'band', ban);
    this.bandTtl = el('div', 'ttl', this.band, '');
    this.bandSub = el('div', 'sub', this.band, '');
    this.bandSum = el('div', 'sum', this.band, '');
    this.bandState = null;
    this.countEl = el('div', 'count hide', play);
    this.countLbl = el('span', '', this.countEl, 'NEXT WAVE IN');
    this.countV = el('b', '', this.countEl, '0:00');
    this.alertEl = el('div', 'alertbar', play, '');
    this.placeEl = el('div', 'pn place hide', play);
    this.placeWhat = el('div', 'what glow', this.placeEl, '');
    this.placeHow = el('div', 'how', this.placeEl, '');

    // shop and screens
    this.shop = new Shop(root, this._fire, this._ui);
    this.screens = new Screens(root, this._fire, this._ui, () => this.settings, (k, v) => this._setSetting(k, v));

    // state
    this.t = 0;
    this.last = {};
    this.cashShown = null;
    this.cashTarget = 0;
    this.cashDelta = 0;
    this.cashDeltaT = 0;
    this.phase = null;
    this.gateHitAt = -99;
    this.hurtAt = -99;
    this.alertText = '';
    this.alertUntil = 0;
    this.pendingClear = null;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.fpsT = 0;
    this.mode = 'play';
    this._applySettings();

    this._onKey = (e) => this._key(e);
    this._onResize = () => {
      this.sizeDirty = true;
    };
    addEventListener('keydown', this._onKey, true);
    addEventListener('resize', this._onResize);
    this.sizeDirty = true;
    this._resize();
  }

  // -------------------------------------------------------------------------------------------
  // public API

  update(dt, S) {
    if (!(dt >= 0) || dt > 1) dt = 1 / 60;
    this.t += dt;
    if (this.sizeDirty || (typeof devicePixelRatio === 'number' && devicePixelRatio !== this.dpr)) this._resize();
    this._fps(dt, S);
    if (!S) return;
    const L = this.last;
    // wave panel
    if (S.wave !== L.wave) {
      L.wave = S.wave;
      setText(this.waveN, pad(S.wave));
    }
    if (S.alive !== L.alive || S.toKill !== L.toKill) {
      L.alive = S.alive;
      L.toKill = S.toKill;
      const left = Number.isFinite(S.toKill) ? S.toKill : S.alive;
      setText(this.leftEl, Number.isFinite(left) ? `${left} HOSTILE${left === 1 ? '' : 'S'} LEFT` : '');
    }
    const tq = Math.round(frac(S.timeOfDay) * 20);
    if (tq !== L.tod) {
      L.tod = tq;
      const t = tq / 20;
      drawInto(this.todIcon, hudIcon(t < 0.5 ? 'sun' : 'moon'));
      setText(this.todTxt, waveTitle(1, null, t).sub);
    }
    // cash: rolling counter + delta popups
    this._cash(dt, S.cash);
    // gate / cabin
    const g = ratio(S.gate);
    if (g !== L.gate) {
      L.gate = g;
      this.gateBar.set(g);
      this.gateBar.low(g < 0.3);
      setText(this.gateVal, `${Math.round(g * 100)}%`);
    }
    const p = ratio(S.player);
    if (p !== L.player) {
      L.player = p;
      this.hpBar.set(p);
      this.hpBar.low(p < 0.3);
      setText(this.hpVal, String(Math.max(0, Math.round((S.player && S.player.hp) || 0))));
    }
    this.gateBar.tick(dt);
    this.hpBar.tick(dt);
    if (p > 0 && p < 0.3 && S.phase !== 'over') {
      const pulse = 0.45 + 0.35 * Math.sin(this.t * 7.5) ** 2 * (1 - p / 0.3);
      setStyle(this.lowhp, 'opacity', pulse.toFixed(2));
    } else setStyle(this.lowhp, 'opacity', '0');
    // rifle / rounds
    this._rifle(S);
    // breath and focus
    const scope = frac(S.scope);
    const br = frac(S.breath ?? 1);
    this.breathBar.set(br);
    this.breathBar.tick(dt);
    toggle(this.breathMini, 'hold', !!S.holding);
    setStyle(this.breathMini, 'opacity', scope < 0.4 && br < 0.98 ? '1' : '0');
    setStyle(this.bc, 'opacity', scope > 0.4 ? '0' : '1');
    const fo = frac(S.focus);
    this.focusBar.set(fo);
    this.focusBar.tick(dt);
    toggle(this.focusMini, 'full', fo >= 0.999);
    toggle(this.focusMini, 'on', !!S.focusActive);
    toggle(this.focusfx, 'on', !!S.focusActive);
    setStyle(this.focusfx, 'opacity', S.focusActive ? '1' : '0');
    // boss
    const boss = S.boss;
    toggle(this.bossEl, 'hide', !boss);
    if (boss) {
      if (boss.name !== L.bossName) {
        L.bossName = boss.name;
        setText(this.bossName, String(boss.name || 'BOSS').toUpperCase());
      }
      const bf = ratio(boss);
      if (bf !== L.boss) {
        L.boss = bf;
        this.bossBar.set(bf);
        setText(this.bossHp, `${Math.round(bf * 100)}%`);
      }
      this.bossBar.tick(dt);
    }
    // phase changes
    if (S.phase !== this.phase) this._phase(this.phase, S.phase, S);
    this._banner(dt);
    // countdown
    const showCount = Number.isFinite(S.countdown) && (S.phase === 'intro' || S.phase === 'cleared');
    toggle(this.countEl, 'hide', !showCount);
    if (showCount) {
      const c = Math.ceil(S.countdown);
      if (c !== L.count) {
        L.count = c;
        setText(this.countV, formatClock(S.countdown));
        setText(this.countLbl, S.phase === 'cleared' ? 'SUPPLY DROP IN' : 'NEXT WAVE IN');
      }
    }
    if (this.shop.visible && Number.isFinite(S.countdown) && Math.ceil(S.countdown) !== L.shopCount) {
      L.shopCount = Math.ceil(S.countdown);
      this.shop.setCountdown(S.countdown);
    }
    // alerts
    let alert = '';
    if (this.t < this.alertUntil) alert = this.alertText;
    else if (this.t - this.hurtAt < 2.2) alert = '▲ CLIMBER IN THE CABIN ▲';
    else if (this.t - this.gateHitAt < 2.2) alert = '▲ GATE UNDER ATTACK ▲';
    if (alert !== L.alert) {
      L.alert = alert;
      setText(this.alertEl, alert);
      toggle(this.alertEl, 'on', !!alert);
    }
    // placement prompt
    if (S.placing !== L.placing) {
      L.placing = S.placing;
      this._placing(S.placing);
    }
    // scope + hip reticle
    this.scope.update(dt, S);
    const hipOn = scope < 0.25 && !S.placing && (S.phase === 'fight' || S.phase === 'intro' || S.phase === 'cleared');
    setStyle(this.hip, 'opacity', hipOn ? '1' : '0');
    // bonus popup queue
    this._bonusTick(dt);
  }

  event(e) {
    if (!e || !e.type) return;
    switch (e.type) {
      case 'hit': {
        const kind = e.kill ? (e.head ? 'headkill' : 'kill') : e.head ? 'head' : 'hit';
        drawInto(this.hm, hitMarker(kind));
        const big = e.kill ? 1.6 : 1.25;
        if (this.hm._anim) this.hm._anim.cancel();
        this.hm._anim = this.hm.animate([
          { opacity: 1, transform: `scale(${big})` },
          { opacity: 1, transform: 'scale(1)', offset: 0.25 },
          { opacity: 0, transform: 'scale(1)' },
        ], { duration: e.kill ? 520 : 260, easing: 'steps(8, end)', fill: 'forwards' });
        break;
      }
      case 'bonus':
        this.bonusQ.push({ text: upperKeepUnits(e.text), cash: e.cash || 0 });
        if (this.bonusQ.length > 8) this.bonusQ.shift();
        break;
      case 'wave': {
        const wt = waveTitle(e.n, e.boss, this.last.todValue ?? 0);
        this._showBand(wt.boss ? 'boss' : 'wave', wt.title, wt.sub, '', wt.boss ? 4.2 : 3.4);
        break;
      }
      case 'cleared':
        this.pendingClear = e;
        this._showCleared(e);
        break;
      case 'gateHit':
        this.gateHitAt = this.t;
        this._flash(this.gatefx, 0.9, 500);
        retrigger(this.bl, 'shake');
        break;
      case 'playerHurt':
        this.hurtAt = this.t;
        this._flash(this.vig, 1, 650);
        retrigger(this.bl, 'shake');
        break;
      case 'killfeed':
        this._feed(e.text || '', e);
        break;
      case 'shot':
        this.scope.shot();
        break;
      case 'alert':
        this.alertText = String(e.text || '').toUpperCase();
        this.alertUntil = this.t + (e.dur || 3);
        break;
      case 'cash':
        this._cashPopup(e.amount || 0);
        break;
      default:
        break;
    }
  }

  showShop(state) {
    this.screens.hide();
    this._mode('shop');
    this.shop.show(state);
  }

  hideShop() {
    this.shop.hide();
    if (this.mode === 'shop') this._mode('play');
  }

  showTitle(meta) {
    this.shop.hide();
    this._mode('title');
    this.screens.showTitle(meta);
  }

  showPause(meta) {
    this._mode('pause');
    this.screens.showPause(meta);
  }

  showGameOver(stats) {
    this.shop.hide();
    this._mode('over');
    this.screens.showGameOver(stats);
  }

  hideScreens() {
    this.screens.hide();
    this._mode(this.shop.visible ? 'shop' : 'play');
  }

  /** Current settings (keys of SETTINGS in settingsModel.js). */
  getSettings() {
    return { ...this.settings };
  }

  /** Replaces settings without firing onSetting (e.g. values loaded from storage). */
  setSettings(values) {
    this.settings = mergeSettings({ ...this.settings, ...values });
    this._applySettings();
  }

  /** True while a menu, the shop or the title is up (the core should keep the pointer free). */
  get blocking() {
    return this.mode !== 'play';
  }

  dispose() {
    removeEventListener('keydown', this._onKey, true);
    removeEventListener('resize', this._onResize);
    this.screens.art.stop();
    this.root.remove();
  }

  // -------------------------------------------------------------------------------------------
  // internals

  _mode(m) {
    this.mode = m;
    this.root.classList.remove('m-play', 'm-shop', 'm-title', 'm-over', 'm-pause');
    this.root.classList.add('m-' + m);
  }

  _setSetting(k, v) {
    const spec = SETTINGS.find((s) => s.key === k);
    if (!spec) return;
    const val = sanitizeSetting(spec, v);
    if (this.settings[k] === val) return;
    this.settings[k] = val;
    this._applySettings();
    this._fire('onSetting', k, val);
  }

  _applySettings() {
    toggle(this.fps, 'hide', !this.settings.showFps);
  }

  _resize() {
    this.sizeDirty = false;
    const w = innerWidth, h = innerHeight;
    this.dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    this.scope.resize(w, h, this.dpr);
    this.screens.resize(w, h);
  }

  _key(e) {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) return;
    let used = false;
    if (this.shop.visible && this.mode === 'shop') used = this.shop.key(e);
    else if (this.screens.active) used = this.screens.key(e);
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  _fps(dt, S) {
    if (!this.settings.showFps) return;
    this.fpsAcc += dt;
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT < 0.25) return;
    const fps = S && Number.isFinite(S.fps) ? S.fps : this.fpsN / Math.max(1e-3, this.fpsAcc);
    setText(this.fps, `${Math.round(fps)} FPS`);
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.fpsT = 0;
  }

  _cash(dt, cash) {
    if (!Number.isFinite(cash)) return;
    if (this.cashShown === null) {
      this.cashShown = cash;
      this.cashTarget = cash;
      setText(this.cashEl, formatCash(cash));
      return;
    }
    if (cash !== this.cashTarget) {
      this.cashDelta += cash - this.cashTarget;
      this.cashDeltaT = 0.12;
      this.cashTarget = cash;
    }
    if (this.cashDeltaT > 0) {
      this.cashDeltaT -= dt;
      if (this.cashDeltaT <= 0) {
        this._cashPopup(this.cashDelta);
        this.cashDelta = 0;
      }
    }
    if (this.cashShown !== cash) {
      // roll the counter: fast at first, ~0.6 s overall, never overshooting
      let v = approach(this.cashShown, cash, 9, dt);
      if (Math.abs(cash - v) < 1) v = cash;
      this.cashShown = v;
      const shown = Math.round(v);
      if (shown !== this.last.cashShown) {
        this.last.cashShown = shown;
        setText(this.cashEl, formatCash(shown));
      }
    }
  }

  _cashPopup(d) {
    if (!d) return;
    const e = this.cashPool.next();
    e.textContent = formatCashDelta(d);
    e.className = d < 0 ? 'neg' : '';
    // stack popups that arrive close together instead of drawing them on top of each other
    if (this.t - (this.cashPopAt || -9) > 0.9) this.cashRow = 0;
    const y = (this.cashRow || 0) * 30;
    this.cashRow = ((this.cashRow || 0) + 1) % 4;
    this.cashPopAt = this.t;
    e._anim = e.animate([
      { opacity: 0, transform: `translateY(${y + 10}px)` },
      { opacity: 1, transform: `translateY(${y}px)`, offset: 0.12 },
      { opacity: 1, transform: `translateY(${y - 8}px)`, offset: 0.7 },
      { opacity: 0, transform: `translateY(${y - 26}px)` },
    ], { duration: 1400, easing: 'steps(14, end)', fill: 'forwards' });
  }

  _bonusTick(dt) {
    this.bonusT -= dt;
    this.bonusRowT -= dt;
    if (this.bonusRowT <= 0) this.bonusRow = 0;
    if (this.bonusT > 0 || !this.bonusQ.length) return;
    const b = this.bonusQ.shift();
    this.bonusT = 0.16;
    const e = this.bonusPool.next();
    e._t.textContent = b.text;
    e._t.className = 't' + (/HEAD/.test(b.text) ? ' hs' : '');
    e._c.textContent = b.cash ? formatCashDelta(b.cash) : '';
    const y = this.bonusRow * 32;
    this.bonusRow = (this.bonusRow + 1) % 5;
    this.bonusRowT = 1.1;
    e._anim = e.animate([
      { opacity: 0, transform: `translate(-12px, ${y}px) scale(1.5)` },
      { opacity: 1, transform: `translate(0, ${y}px) scale(1)`, offset: 0.08 },
      { opacity: 1, transform: `translate(0, ${y - 6}px) scale(1)`, offset: 0.75 },
      { opacity: 0, transform: `translate(0, ${y - 22}px) scale(1)` },
    ], { duration: 1700, easing: 'steps(20, end)', fill: 'forwards' });
    if (b.cash) this._ui('bonus');
  }

  _rifle(S) {
    const r = S.rifle || {};
    const L = this.last;
    const id = r.id || rifleIdByName.get(r.name) || 'm91';
    const ammo = (S.ammoType && S.ammoType.id) || 'fmj';
    const mag = Math.max(0, r.mag | 0);
    const hk = r.name || id;
    const high = Math.max(this.magHigh.get(hk) || 0, mag);
    this.magHigh.set(hk, high);
    const cap = Math.max(mag, r.magSize | 0, high, RIFLES[id] ? RIFLES[id].mag : 0);
    if (r.name !== L.rifleName) {
      L.rifleName = r.name;
      setText(this.rifleEl, String(r.name || '').toUpperCase());
    }
    const key = `${id}|${ammo}|${cap}`;
    if (key !== this.roundKey) {
      this.roundKey = key;
      this.rounds.textContent = '';
      this.roundEls = [];
      const big = cap > 12 ? 1 : 2;
      for (let i = 0; i < cap; i++) {
        const c = el('canvas', '', this.rounds);
        c._full = null;
        c._big = big;
        this.roundEls.push(c);
      }
      L.mag = -1;
    }
    if (mag !== L.mag) {
      const prev = L.mag;
      L.mag = mag;
      const n = this.roundEls.length;
      for (let i = 0; i < n; i++) {
        // spent slots on the left, live rounds packed to the right
        const full = i >= n - mag;
        const c = this.roundEls[i];
        if (c._full !== full) {
          const spr = cartridge(id, ammo, !full);
          drawInto(c, spr);
          c.style.width = `${spr.width * c._big}px`;
          c.style.height = `${spr.height * c._big}px`;
          if (c._full === true && !full && prev > mag) {
            c.animate([{ transform: 'translateY(-8px)', filter: 'brightness(2)' }, { transform: 'none', filter: 'none' }], { duration: 220, easing: 'steps(4, end)' });
          }
          c._full = full;
        }
      }
    }
    const at = S.ammoType || {};
    const an = String(at.name || 'FMJ').toUpperCase();
    if (an !== L.ammoName) {
      L.ammoName = an;
      setText(this.ammoName, an);
    }
    const res = Number.isFinite(at.count) ? at.count : Number.isFinite(r.ammo) ? r.ammo : Infinity;
    if (res !== L.reserve) {
      L.reserve = res;
      setText(this.reserve, Number.isFinite(res) ? `${groupThousands(res)} RDS` : '∞');
    }
    const ws = r.reloading ? 'RELOADING' : r.bolting ? 'WORKING BOLT' : mag === 0 ? 'EMPTY · R' : '';
    if (ws !== L.wstate) {
      L.wstate = ws;
      setText(this.wstate, ws);
      toggle(this.wstate, 'blink', !!ws && ws !== 'WORKING BOLT');
      setStyle(this.wstate, 'color', mag === 0 && !r.reloading ? 'var(--rust)' : '');
    }
  }

  _phase(prev, next, S) {
    this.phase = next;
    this.last.todValue = frac(S.timeOfDay);
    if (next === 'cleared' && !this.pendingClear) this._showCleared({ n: S.wave });
    if (next !== 'cleared') this.pendingClear = null;
    if (next === 'fight' && this.bandState && this.bandState.kind === 'clear') this.bandState.t = Math.max(this.bandState.t, this.bandState.dur - 0.4);
  }

  _showCleared(e) {
    const bits = [];
    if (Number.isFinite(e.kills)) bits.push(`KILLS <b>${e.kills}</b>`);
    if (Number.isFinite(e.headshots)) bits.push(`HEADSHOTS <b>${e.headshots}</b>`);
    if (Number.isFinite(e.bonus)) bits.push(`BONUS <b class="cashv">${formatCash(e.bonus)}</b>`);
    this._showBand('clear', `WAVE ${pad(e.n ?? this.last.wave ?? 0)} CLEARED`, 'THE VALLEY FALLS QUIET', bits.join(' &nbsp;·&nbsp; '), 5);
  }

  _showBand(kind, title, sub, sumHtml, dur) {
    this.bandState = { kind, title, sub, t: 0, dur };
    this.band.className = 'band ' + (kind === 'boss' ? 'b-boss' : kind === 'clear' ? 'b-clear' : '');
    setText(this.bandTtl, '');
    setText(this.bandSub, '');
    this.bandSum.innerHTML = sumHtml || '';
    this._ui(kind === 'boss' ? 'alarm' : kind === 'clear' ? 'cleared' : 'banner');
  }

  _banner(dt) {
    const b = this.bandState;
    if (!b) return;
    b.t += dt;
    const t = b.t;
    // typewriter title, then the subtitle; flicker on arrival; fade at the end
    const nT = Math.min(b.title.length, Math.floor(t / 0.035));
    const nS = Math.max(0, Math.min(b.sub.length, Math.floor((t - 0.35) / 0.03)));
    setText(this.bandTtl, b.title.slice(0, nT) + (nT < b.title.length ? '█' : ''));
    setText(this.bandSub, b.sub.slice(0, nS));
    let op = 1;
    if (t < 0.25) op = Math.floor(t * 40) % 2 ? 1 : 0.35;
    if (t > b.dur - 0.5) op = Math.max(0, (b.dur - t) / 0.5);
    setStyle(this.band, 'opacity', op.toFixed(2));
    setStyle(this.bandSum, 'opacity', t > 0.9 ? '1' : '0');
    if (t >= b.dur) {
      this.bandState = null;
      setStyle(this.band, 'opacity', '0');
    }
  }

  _flash(elm, peak, ms) {
    if (elm._anim) elm._anim.cancel();
    elm._anim = elm.animate([{ opacity: peak }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
  }

  _feed(text, e) {
    const t = upperKeepUnits(text);
    const row = el('div', /HEAD/.test(t) ? 'hs' : e.boss ? 'big' : '', null);
    if (/HEAD|KILL|✕/.test(t) || e.kill) {
      const c = el('canvas', '', row);
      drawInto(c, skull());
    }
    el('span', '', row, t);
    this.feed.insertBefore(row, this.feed.firstChild);
    while (this.feed.childElementCount > 5) this.feed.lastChild.remove();
    row.animate([
      { opacity: 0, transform: 'translateX(14px)' },
      { opacity: 1, transform: 'none', offset: 0.05 },
      { opacity: 1, transform: 'none', offset: 0.85 },
      { opacity: 0, transform: 'none' },
    ], { duration: 5200, easing: 'steps(30, end)', fill: 'forwards' }).onfinish = () => row.remove();
  }

  _placing(kind) {
    toggle(this.placeEl, 'hide', !kind);
    if (!kind) return;
    const d = DEFENCES[kind];
    const name = d ? d.name.toUpperCase() : String(kind).toUpperCase();
    setText(this.placeWhat, `PLACE ${name}`);
    const place = d ? d.place : 'ground';
    const how = place === 'ground'
      ? '<span class="key">LMB</span> PLACE ON THE GROUND &nbsp;·&nbsp; <span class="key">R</span> ROTATE &nbsp;·&nbsp; <span class="key">ESC</span> CANCEL'
      : place === 'barrel' ? '<span class="key">LMB</span> PICK A BARREL SPOT &nbsp;·&nbsp; <span class="key">ESC</span> CANCEL'
        : place === 'mount' ? '<span class="key">LMB</span> PICK A LIGHT MOUNT &nbsp;·&nbsp; <span class="key">ESC</span> CANCEL'
          : '<span class="key">LMB</span> CONFIRM &nbsp;·&nbsp; <span class="key">ESC</span> CANCEL';
    this.placeHow.innerHTML = how;
  }
}
