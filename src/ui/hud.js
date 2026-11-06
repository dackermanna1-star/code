// In-game HUD: hotbar, vitals, moodles, clock, compass, ammo, prompts, crosshair, hit markers,
// damage indicators, toasts, location banner, subtitles, scope overlay, FPS, starting hints.
// update(dt) is called every frame: it only touches the DOM when a value changed.
import { getItemDef, itemDisplayName } from '../items/items.js';
import { HOTBAR_SIZE } from '../inventory/Inventory.js';
import { h, setText, setStyle, setClass, clamp, pad2, phaseText, bearingFromYaw, cardinal } from './dom.js';
import { pixelImg, pixelURL, moodleIconName, WEATHER_ICON } from './pixel.js';
import { makeSlot, fillSlot } from './slots.js';

const COMPASS_PX_PER_DEG = 2.2; // in ui units
const COMPASS_WIDTH = 400; // ui units

const START_HINTS = [
  ['WASD', 'Move'], ['Shift', 'Sprint'], ['C', 'Crouch / sneak'], ['E', 'Interact / loot'],
  ['Tab', 'Inventory'], ['X', 'Crafting'], ['H', 'Health'], ['M', 'Map'], ['F', 'Flashlight'],
];

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.slowT = 0;
    this.time = 0;
    this.lastSel = -1;
    this.lastSelId = undefined;
    this.nameTimer = 0;
    this.staminaHideT = 0;
    this.hintsT = 0;
    this.hintsShown = false;
    this.toasts = [];
    this.moodleSig = '';
    this.crossSpread = -1;
    this.build();
  }

  build() {
    const el = (this.el = h('div.hud.hidden'));

    // scope + vignettes (bottom layers)
    this.scope = h('div.scope.hidden', h('div.scope-lens'), h('div.scope-ret',
      h('i.sr-h'), h('i.sr-v'), h('i.sr-dot'), h('i.sr-ticks')));
    this.vignette = h('div.hurt-vignette');
    this.flash = h('div.hurt-flash');

    // top-left clock
    this.dayEl = h('div.clock-day');
    this.timeIcon = pixelImg('watch', 'clock-ico');
    this.timeEl = h('span.clock-time');
    this.wxIcon = h('img.px.clock-ico', { draggable: false, alt: '' });
    this.wxEl = h('span.clock-wx');
    this.locEl = h('div.clock-loc');
    this.clock = h('div.clock',
      this.dayEl,
      h('div.clock-row', this.timeIcon, this.timeEl),
      h('div.clock-row', this.wxIcon, this.wxEl),
      this.locEl);

    // compass
    this.compTape = h('div.compass-tape');
    this.compRead = h('div.compass-read');
    this.compass = h('div.compass', h('div.compass-win', this.compTape, h('i.compass-needle')), this.compRead);
    this.compassMode = null;

    // moodles
    this.moodles = h('div.moodles');
    this.fps = h('div.fps.hidden');

    // toasts
    this.toastBox = h('div.toasts');

    // hints
    this.hints = h('div.hints.hidden',
      h('div.hints-title', 'Survival basics'),
      START_HINTS.map(([k, t]) => h('div.hint-row', h('span.key', k), h('span', t))),
      h('div.hints-foot', 'Stay quiet. Stay fed. Don’t get bitten.'));

    // centre
    this.cross = h('div.crosshair', h('i.ch-t'), h('i.ch-b'), h('i.ch-l'), h('i.ch-r'), h('i.ch-dot'));
    this.hit = h('div.hitmarker', h('i'), h('i'), h('i'), h('i'));
    this.dmgArcs = [];
    this.dmgBox = h('div.dmg-box');
    for (let i = 0; i < 6; i++) {
      const a = h('div.dmg-arc', h('i'));
      this.dmgBox.appendChild(a);
      this.dmgArcs.push(a);
    }
    this.dmgNext = 0;
    this.progLabel = h('div.progress-label');
    this.progFill = h('i');
    this.progress = h('div.progress.hidden', this.progLabel, h('div.progress-bar', this.progFill));

    // banner + subtitle
    this.bannerTitle = h('div.banner-title');
    this.bannerSub = h('div.banner-sub');
    this.banner = h('div.banner', h('div.banner-line'), this.bannerTitle, this.bannerSub, h('div.banner-line'));
    this.subText = h('span.subtitle-text');
    this.subSpeaker = h('span.subtitle-speaker');
    this.subtitleEl = h('div.subtitle.hidden', pixelImg('radio', 'subtitle-ico'), this.subSpeaker, this.subText);
    this.subT = 0;

    // bottom centre
    this.promptKey = h('span.key');
    this.promptText = h('span.prompt-text');
    this.promptSub = h('div.prompt-sub');
    this.prompt = h('div.prompt.hidden', h('div.prompt-main', this.promptKey, this.promptText), this.promptSub);
    this.itemName = h('div.item-name');
    this.stamFill = h('i');
    this.stamina = h('div.stamina', this.stamFill);
    this.hotbarSlots = [];
    this.hotbar = h('div.hotbar');
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = makeSlot('hb');
      s.appendChild(h('span.slot-num', String(i + 1)));
      this.hotbar.appendChild(s);
      this.hotbarSlots.push(s);
    }
    this.bottom = h('div.hud-bottom', this.prompt, this.itemName, this.stamina, this.hotbar);

    // vitals (bottom-left)
    this.vitals = {};
    const vrow = (id, icon) => {
      const fill = h('i');
      const row = h('div.vital.v-' + id, pixelImg(icon, 'vital-ico'), h('div.vital-bar', fill));
      this.vitals[id] = { row, fill };
      return row;
    };
    this.tempMarker = h('i.temp-mark');
    const tempRow = h('div.vital.v-temp', pixelImg('thermo', 'vital-ico'), h('div.vital-bar.temp-bar', this.tempMarker));
    this.vitals.temp = { row: tempRow, fill: this.tempMarker };
    this.status = h('div.vitals',
      vrow('health', 'heart'), vrow('hunger', 'food'), vrow('thirst', 'drop'), tempRow, vrow('weight', 'weight'));

    // ammo / held item (bottom-right)
    this.heldName = h('div.held-name');
    this.ammoLoaded = h('span.ammo-loaded');
    this.ammoReserve = h('span.ammo-reserve');
    this.ammoMode = h('span.ammo-mode');
    this.ammoJam = h('div.ammo-jam.hidden', 'JAMMED');
    this.ammoRow = h('div.ammo-row', this.ammoLoaded, h('span.ammo-sep', '/'), this.ammoReserve, this.ammoMode);
    this.condFill = h('i');
    this.cond = h('div.held-cond', this.condFill);
    this.held = h('div.held.hidden', this.heldName, this.ammoRow, this.ammoJam, this.cond);

    el.append(this.scope, this.vignette, this.flash, this.clock, this.compass, this.fps, this.moodles, this.toastBox,
      this.hints, this.dmgBox, this.cross, this.hit, this.progress, this.banner, this.subtitleEl, this.bottom,
      this.status, this.held);
  }

  show() {
    setClass(this.el, 'hidden', false);
    if (!this.hintsShown) {
      this.hintsShown = true;
      this.showHints();
    }
  }
  hide() { setClass(this.el, 'hidden', true); }

  showHints(seconds = 28) {
    this.hintsT = seconds;
    setClass(this.hints, 'hidden', false);
    setClass(this.hints, 'fade', false);
  }

  onResize(u) {
    this.u = u;
    this.buildCompassTape(true);
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    this.time += dt;

    this.updateCompass(p);
    this.updateHotbar(p, dt);
    this.updateHud(g.hud || {}, dt);
    this.updateScope(p);

    // timers
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) setClass(this.subtitleEl, 'hidden', true);
    }
    if (this.hintsT > 0) {
      this.hintsT -= dt;
      if (this.hintsT < 1.2) setClass(this.hints, 'fade', true);
      if (this.hintsT <= 0) setClass(this.hints, 'hidden', true);
    }

    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 0.1;
      this.updateVitals(p, dt);
      this.updateMoodles(p);
      this.updateClock(g);
      this.updateFps(g);
    }
  }

  // ---------------------------------------------------------------- compass
  buildCompassTape(force) {
    const p = this.game.player;
    const mode = p && p.hasCompass ? 'full' : 'basic';
    if (!force && mode === this.compassMode) return;
    this.compassMode = mode;
    setClass(this.compass, 'basic', mode === 'basic');
    this.compTape.textContent = '';
    const frag = document.createDocumentFragment();
    for (let d = -180; d <= 540; d += 5) {
      const deg = ((d % 360) + 360) % 360;
      const x = (d + 180) * COMPASS_PX_PER_DEG;
      const isCard = deg % 90 === 0;
      const isInter = deg % 45 === 0;
      if (mode === 'basic' && !isCard) continue;
      if (deg % 15 === 0 || mode === 'full') {
        const tick = h('i.ctick' + (isInter ? '.major' : deg % 15 === 0 ? '.mid' : ''), { style: { left: `calc(var(--u) * ${x})` } });
        if (mode === 'full' || isCard) frag.appendChild(tick);
      }
      if (isInter) {
        const lab = h('span.clabel' + (isCard ? '.card' : ''), { text: cardinal(deg), style: { left: `calc(var(--u) * ${x})` } });
        if (deg === 0) lab.classList.add('north');
        frag.appendChild(lab);
      } else if (mode === 'full' && deg % 15 === 0) {
        frag.appendChild(h('span.clabel.num', { text: String(deg), style: { left: `calc(var(--u) * ${x})` } }));
      }
    }
    this.compTape.appendChild(frag);
    this.lastBearing = null;
  }

  updateCompass(p) {
    this.buildCompassTape(false);
    const b = bearingFromYaw(p.yaw || 0);
    const rb = Math.round(b * 4) / 4;
    if (rb === this.lastBearing) return;
    this.lastBearing = rb;
    const u = this.u || 1;
    const x = (-(rb + 180) * COMPASS_PX_PER_DEG + COMPASS_WIDTH / 2) * u;
    this.compTape.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    if (this.compassMode === 'full') setText(this.compRead, `${pad3(Math.round(b) % 360)}° ${cardinal(b)}`);
    else setText(this.compRead, '');
  }

  // ---------------------------------------------------------------- hotbar
  updateHotbar(p, dt) {
    const inv = p.inv;
    if (!inv) return;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = this.hotbarSlots[i];
      fillSlot(s, inv.hotbar[i]);
      setClass(s, 'sel', i === inv.selected);
    }
    const st = inv.hotbar[inv.selected];
    const sid = st ? st.id : null;
    if (inv.selected !== this.lastSel || sid !== this.lastSelId) {
      const first = this.lastSel === -1;
      this.lastSel = inv.selected;
      this.lastSelId = sid;
      if (st && !first) {
        let name;
        try { name = itemDisplayName(st); } catch { name = getItemDef(st.id).name; }
        setText(this.itemName, name);
        this.itemName.getAnimations?.().forEach((a) => a.cancel());
        this.itemName.animate?.([
          { opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none', offset: 0.08 },
          { opacity: 1, offset: 0.75 }, { opacity: 0 },
        ], { duration: 2200, easing: 'linear', fill: 'forwards' });
      }
    }
    // stamina (Minecraft XP-bar position)
    const sm = p.maxStamina || 100;
    const sv = clamp((p.stamina ?? sm) / sm, 0, 1);
    const sq = Math.round(sv * 200) / 200;
    if (sq !== this._stam) {
      this._stam = sq;
      setStyle(this.stamFill, 'transform', `scaleX(${sq})`);
      setClass(this.stamina, 'low', sv < 0.25);
    }
    if (sv < 0.995) this.staminaHideT = 1.2;
    else this.staminaHideT -= dt;
    setClass(this.stamina, 'shown', this.staminaHideT > 0);
  }

  // ---------------------------------------------------------------- prompt / progress / ammo / crosshair
  updateHud(hud, dt) {
    const it = hud.interaction;
    if (it && it.text) {
      setClass(this.prompt, 'hidden', false);
      setText(this.promptKey, it.key || 'E');
      setText(this.promptText, it.text);
      setText(this.promptSub, it.sub || '');
      setClass(this.promptSub, 'hidden', !it.sub);
    } else setClass(this.prompt, 'hidden', true);

    const pr = hud.progress;
    if (pr) {
      setClass(this.progress, 'hidden', false);
      setText(this.progLabel, pr.label || '');
      const t = Math.round(clamp(pr.t || 0, 0, 1) * 400) / 400;
      setStyle(this.progFill, 'transform', `scaleX(${t})`);
    } else setClass(this.progress, 'hidden', true);

    const am = hud.ammo;
    const heldName = (am && am.name) || hud.heldName;
    const showCond = hud.durability != null && hud.durability !== undefined;
    if (am || heldName || showCond) {
      setClass(this.held, 'hidden', false);
      setText(this.heldName, heldName || '');
      if (am) {
        setClass(this.ammoRow, 'hidden', false);
        setText(this.ammoLoaded, am.loaded ?? 0);
        setText(this.ammoReserve, am.reserve ?? 0);
        setText(this.ammoMode, am.mode ? String(am.mode).toUpperCase() : '');
        setClass(this.ammoLoaded, 'empty', !am.loaded);
        setClass(this.ammoJam, 'hidden', !am.jammed);
      } else {
        setClass(this.ammoRow, 'hidden', true);
        setClass(this.ammoJam, 'hidden', true);
      }
      if (showCond) {
        setClass(this.cond, 'hidden', false);
        const d = clamp(hud.durability, 0, 1);
        const q = Math.round(d * 100) / 100;
        setStyle(this.condFill, 'transform', `scaleX(${q})`);
        setStyle(this.condFill, 'background', d > 0.6 ? '#7fb04a' : d > 0.3 ? '#d6a93a' : '#c8402a');
      } else setClass(this.cond, 'hidden', true);
    } else setClass(this.held, 'hidden', true);
  }

  setCrosshair(spread01) {
    const s = Math.round(clamp(spread01 || 0, 0, 1) * 100) / 100;
    if (s === this.crossSpread) return;
    this.crossSpread = s;
    this.cross.style.setProperty('--gap', (3 + s * 26).toFixed(1));
  }

  updateScope(p) {
    const on = !!p.scopeActive;
    setClass(this.scope, 'hidden', !on);
    setClass(this.cross, 'hidden', on);
  }

  // ---------------------------------------------------------------- vitals
  updateVitals(p) {
    const setBar = (id, v, warn, crit) => {
      const r = this.vitals[id];
      const q = Math.round(clamp(v, 0, 1) * 100) / 100;
      setStyle(r.fill, 'transform', `scaleX(${q})`);
      setClass(r.row, 'warn', v <= warn && v > crit);
      setClass(r.row, 'crit', v <= crit);
    };
    setBar('health', (p.health ?? 100) / (p.maxHealth || 100), 0.5, 0.25);
    setBar('hunger', (p.hunger ?? 100) / 100, 0.3, 0.12);
    setBar('thirst', (p.thirst ?? 100) / 100, 0.3, 0.12);

    // temperature gauge: 33..41 °C
    const bt = p.bodyTemp ?? 37;
    const f = clamp((bt - 33) / 8, 0, 1);
    setStyle(this.tempMarker, 'left', (f * 100).toFixed(1) + '%');
    const tr = this.vitals.temp.row;
    setClass(tr, 'cold', bt < 36.2);
    setClass(tr, 'hot', bt > 37.6);
    setClass(tr, 'warn', (bt < 36 && bt >= 35) || (bt > 37.8 && bt <= 38.5));
    setClass(tr, 'crit', bt < 35 || bt > 38.5);

    // weight only when encumbered
    const mw = p.maxWeight || p.inv?.maxWeight || 22;
    const w = p.weight ?? p.inv?.totalWeight?.() ?? 0;
    const wr = this.vitals.weight;
    const enc = w > mw;
    setClass(wr.row, 'hidden', !enc);
    if (enc) {
      const over = clamp((w - mw) / (mw * 0.5), 0, 1);
      setStyle(wr.fill, 'transform', `scaleX(${Math.round(over * 100) / 100})`);
      setClass(wr.row, 'warn', over < 0.5);
      setClass(wr.row, 'crit', over >= 0.5);
    }

    // low-health vignette
    const hp = (p.health ?? 100) / (p.maxHealth || 100);
    const vig = hp < 0.35 ? Math.round((1 - hp / 0.35) * 100) / 100 : 0;
    setStyle(this.vignette, 'opacity', String(vig));
    setClass(this.vignette, 'pulse', hp < 0.2);
  }

  // ---------------------------------------------------------------- moodles
  updateMoodles(p) {
    const list = p.moodles || [];
    let sig = '';
    for (const m of list) sig += m.id + ':' + m.level + ':' + (m.bad ? 1 : 0) + ':' + (m.label || '') + '|';
    if (sig === this.moodleSig) return;
    const prev = this.moodlePrev || {};
    const now = {};
    this.moodleSig = sig;
    this.moodles.textContent = '';
    for (const m of list) {
      const lvl = clamp(m.level | 0 || 1, 1, 4);
      now[m.id] = lvl;
      const bad = m.bad !== false;
      const pips = h('div.moodle-pips');
      for (let i = 0; i < 4; i++) pips.appendChild(h('i' + (i < lvl ? '.on' : '')));
      const tile = h(`div.moodle-tile.${bad ? 'bad' : 'good'}.l${lvl}`,
        pixelImg(moodleIconName(m.id), 'moodle-ico'), pips);
      const row = h('div.moodle', h('div.moodle-label', h('span', m.label || m.id), m.desc ? h('small', m.desc) : null), tile);
      if (prev[m.id] == null) row.classList.add('enter');
      else if (prev[m.id] !== lvl) row.classList.add(lvl > prev[m.id] ? 'up' : 'down');
      this.moodles.appendChild(row);
    }
    this.moodlePrev = now;
  }

  // ---------------------------------------------------------------- clock / weather / location
  updateClock(g) {
    const t = g.time || {};
    const p = g.player;
    setText(this.dayEl, `Day ${t.day ?? 1}`);
    const hour = t.hour ?? 8;
    if (p.hasWatch) {
      setText(this.timeEl, `${pad2(hour)}:${pad2(t.minute ?? 0)}`);
      setClass(this.timeIcon, 'hidden', false);
      setClass(this.timeEl, 'exact', true);
    } else {
      setText(this.timeEl, phaseText(hour + (t.minute || 0) / 60));
      setClass(this.timeIcon, 'hidden', true);
      setClass(this.timeEl, 'exact', false);
    }
    const w = g.weather || {};
    let wi = WEATHER_ICON[w.type] || 'cloud';
    if (wi === 'sun' && (t.isNight || t.phase === 'night')) wi = 'moon';
    const url = pixelURL(wi);
    if (this.wxIcon._src !== url) { this.wxIcon._src = url; this.wxIcon.src = url; }
    const label = w.label || (w.type ? w.type[0].toUpperCase() + w.type.slice(1) : '');
    const temp = w.temperature != null ? ` · ${Math.round(w.temperature)}°C` : '';
    setText(this.wxEl, label + temp);
    const loc = g.location;
    setText(this.locEl, loc && loc.name ? loc.name : '');
  }

  updateFps(g) {
    const show = !!g.settings?.showFps;
    setClass(this.fps, 'hidden', !show);
    if (show) {
      const f = Math.round(g.fps || 0);
      setText(this.fps, `${f} FPS`);
      setClass(this.fps, 'bad', f < 30);
    }
  }

  // ---------------------------------------------------------------- events
  hitMarker(kind = 'hit') {
    const el = this.hit;
    el.className = 'hitmarker ' + kind;
    el.getAnimations().forEach((a) => a.cancel());
    const dur = kind === 'headshot' ? 520 : kind === 'kill' ? 460 : 240;
    el.animate([
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.25)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.25 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' },
    ], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  }

  damageIndicator(angle) {
    const a = this.dmgArcs[this.dmgNext];
    this.dmgNext = (this.dmgNext + 1) % this.dmgArcs.length;
    a.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
    a.getAnimations().forEach((x) => x.cancel());
    a.animate([{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0 }],
      { duration: 1700, easing: 'ease-out', fill: 'forwards' });
    this.flash.getAnimations().forEach((x) => x.cancel());
    this.flash.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
  }

  toast(text, type = 'info') {
    const icons = { info: null, good: null, warn: null, danger: null };
    void icons;
    const t = h(`div.toast.t-${type}`, h('i.toast-bar'), h('span', String(text)));
    this.toastBox.appendChild(t);
    this.toasts.push(t);
    while (this.toasts.length > 5) {
      const old = this.toasts.shift();
      old.remove();
    }
    const life = type === 'danger' ? 6000 : type === 'warn' ? 5000 : 4000;
    t.animate([
      { opacity: 0, transform: 'translateX(calc(var(--u) * -16))' },
      { opacity: 1, transform: 'none', offset: 0.05 },
      { opacity: 1, transform: 'none', offset: 0.85 },
      { opacity: 0, transform: 'none' },
    ], { duration: life, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
      t.remove();
      const i = this.toasts.indexOf(t);
      if (i >= 0) this.toasts.splice(i, 1);
    };
  }

  locationBanner(name, subtitle) {
    setText(this.bannerTitle, name || '');
    setText(this.bannerSub, subtitle || '');
    setClass(this.bannerSub, 'hidden', !subtitle);
    const b = this.banner;
    b.getAnimations().forEach((a) => a.cancel());
    b.animate([
      { opacity: 0, letterSpacing: 'calc(var(--u) * 14)', filter: 'blur(3px)' },
      { opacity: 1, letterSpacing: 'calc(var(--u) * 7)', filter: 'blur(0)', offset: 0.2 },
      { opacity: 1, letterSpacing: 'calc(var(--u) * 6)', offset: 0.75 },
      { opacity: 0, letterSpacing: 'calc(var(--u) * 6)' },
    ], { duration: 6500, easing: 'ease-out', fill: 'forwards' });
  }

  subtitle(text, seconds = 5) {
    let s = String(text || '');
    let speaker = '';
    const m = s.match(/^([A-Z][\w .'-]{0,24}):\s+(.*)$/s);
    if (m) { speaker = m[1]; s = m[2]; }
    setText(this.subSpeaker, speaker ? speaker + ':' : '');
    setClass(this.subSpeaker, 'hidden', !speaker);
    setText(this.subText, s);
    setClass(this.subtitleEl, 'hidden', !s);
    this.subtitleEl.getAnimations().forEach((a) => a.cancel());
    this.subtitleEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
    this.subT = seconds;
  }
}

function pad3(n) { return String(n).padStart(3, '0'); }
