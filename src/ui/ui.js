// Core UI: HUD, interaction prompts, toasts, progress bars, dialogs, overlays and modal panels.
import { G } from '../game.js';
import { el, fmtMoney, clamp, escapeHtml } from '../core/utils.js';
import { NEEDS, BUFFS } from '../player/needs.js';
import { RARITY, CATEGORIES } from '../items/registry.js';
import { levelProgress, LEVEL_TITLES } from '../progression/progress.js';
import { thumbImg } from './thumbs.js';
import { storeUnlocked, STORES, STORE_ORDER } from '../shop/stores.js';

const KEYCAP = { LMB: '🖱 L', RMB: '🖱 R', E: 'E', F: 'F', R: 'R', X: 'X', G: 'G', Q: 'Q', T: 'T' };

export class UI {
  constructor() {
    this.root = document.getElementById('ui');
    this.blockingCount = 0;
    this.modal = null;
    this._promptSig = '';
    this._build();
  }

  get blocking() { return this.blockingCount > 0 || !!this.modal || !!G.phone?.open || !!G.computer?.open || !!G.games?.active || !!this.paused; }

  _build() {
    const r = this.root;
    r.innerHTML = `
      <div id="crosshair"><div class="dot"></div><div class="ring"></div></div>
      <div id="prompt" class="hidden"><div class="p-name"></div><div class="p-sub"></div><div class="p-actions"></div></div>
      <div id="held" class="hidden"><div class="h-name"></div><div class="h-actions"></div></div>
      <div id="hud-top">
        <div id="clockbox"><div class="c-time"></div><div class="c-day"></div></div>
        <div id="weatherbox"></div>
        <div id="moneybox"><span class="m-amt"></span></div>
        <div id="levelbox"><div class="l-num"></div><div class="l-bar"><div></div></div></div>
      </div>
      <div id="needs"></div>
      <div id="buffs"></div>
      <div id="toasts"></div>
      <div id="notifs"></div>
      <div id="hint" class="hidden"></div>
      <div id="progress" class="hidden"><div class="pr-icon"></div><div class="pr-label"></div><div class="pr-bar"><div class="pr-fill"></div><div class="pr-zone hidden"></div><div class="pr-needle hidden"></div></div><div class="pr-sub"></div></div>
      <div id="holdring" class="hidden"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg"/></svg></div>
      <div id="throwbar" class="hidden"><div></div></div>
      <div id="placehelp" class="hidden"></div>
      <div id="inspect" class="hidden"></div>
      <div id="fade"></div>
      <div id="overlay-steam" class="ov"></div>
      <div id="overlay-peephole" class="ov"></div>
      <div id="overlay-scope" class="ov"></div>
      <div id="overlay-flash" class="ov"></div>
      <div id="overlay-face" class="ov"></div>
      <div id="overlay-breathe" class="ov"><div class="circle"></div><div class="txt">breathe</div></div>
      <div id="overlay-kaleido" class="ov"></div>
      <div id="overlay-sleep" class="ov"><div class="zzz">z z z</div><div class="st"></div></div>
      <div id="overlay-vignette" class="ov"></div>
      <div id="popups"></div>
      <div id="modal-root"></div>
    `;
    this.$ = (s) => r.querySelector(s);
    this.prompt = this.$('#prompt');
    this.heldBox = this.$('#held');
    this.needsEl = this.$('#needs');
    this.needBars = {};
    for (const [k, n] of Object.entries(NEEDS)) {
      const e = el('div', { class: 'need', title: n.label }, el('div', { class: 'n-ring' }, el('div', { class: 'n-icon' }, n.icon)), el('div', { class: 'n-label' }, n.label));
      e.style.setProperty('--c', n.color);
      this.needsEl.appendChild(e);
      this.needBars[k] = e;
    }
    this.moodEl = el('div', { class: 'need mood', title: 'Mood' }, el('div', { class: 'n-ring' }, el('div', { class: 'n-icon' }, '🙂')), el('div', { class: 'n-label' }, 'Mood'));
    this.needsEl.prepend(this.moodEl);
    this._hudT = 0;
  }

  // ------------------------------------------------------------- per-frame HUD
  update(dt) {
    this._hudT -= dt;
    if (this._hudT > 0) return;
    this._hudT = 0.25;
    const st = G.state;
    this.$('#clockbox .c-time').textContent = G.clock.fmt();
    this.$('#clockbox .c-day').textContent = `${G.clock.dayName.slice(0, 3)} · Day ${G.clock.day}`;
    const w = G.weather.info;
    this.$('#weatherbox').textContent = `${G.clock.isNight() ? w.nightIcon : w.icon} ${w.label}`;
    this.$('#moneybox .m-amt').textContent = fmtMoney(st.money);
    const lp = levelProgress();
    this.$('#levelbox .l-num').textContent = `Lv ${lp.level}`;
    this.$('#levelbox .l-bar div').style.width = `${clamp(lp.frac, 0, 1) * 100}%`;
    this.$('#levelbox').title = `${lp.title} · ${st.xp}/${lp.next} XP`;
    for (const [k, e] of Object.entries(this.needBars)) {
      const v = st.needs[k];
      e.style.setProperty('--v', v);
      e.classList.toggle('low', v < 20);
    }
    const m = G.needs.mood();
    this.moodEl.style.setProperty('--v', m);
    this.moodEl.querySelector('.n-icon').textContent = G.needs.moodLabel().icon;
    this.needsEl.classList.toggle('hidden', !st.settings.showNeeds);
    // buffs
    const buffs = G.needs.activeBuffs();
    const sig = buffs.map((b) => b.id).join(',');
    if (sig !== this._buffSig) {
      this._buffSig = sig;
      const be = this.$('#buffs'); be.innerHTML = '';
      for (const b of buffs) { const d = BUFFS[b.id]; be.appendChild(el('div', { class: 'buff' + (d.negative ? ' neg' : ''), title: `${d.label}${d.desc ? ' — ' + d.desc : ''}` }, d.icon)); }
    }
    // exhaustion vignette
    this.$('#overlay-vignette').style.opacity = st.needs.energy < 15 ? (0.6 - st.needs.energy / 30) : 0;
  }

  // ------------------------------------------------------------- prompts
  setPrompt(focus, actions, held) {
    const name = focus ? focus.getName() : '';
    const sub = focus ? (focus.subtitleText ?? focus.subtitle ?? '') : '';
    const sig = name + '|' + sub + '|' + actions.map((a) => a.key + a.label + (a.disabled ? 'd' : '')).join(';') + '|' + held.map((a) => a.key + a.label).join(';');
    if (sig === this._promptSig) return;
    this._promptSig = sig;
    const p = this.prompt;
    if (!focus || !actions.length) p.classList.add('hidden');
    else {
      p.classList.remove('hidden');
      p.querySelector('.p-name').textContent = name;
      p.querySelector('.p-sub').textContent = sub;
      const box = p.querySelector('.p-actions'); box.innerHTML = '';
      for (const a of actions) box.appendChild(el('div', { class: 'act' + (a.disabled ? ' disabled' : '') }, el('span', { class: 'key' }, KEYCAP[a.key] || a.key), el('span', {}, a.label + (a.hold ? ' (hold)' : ''))));
    }
    const h = this.heldBox;
    const inst = G.hand.held;
    if (!inst || G.placement.active) h.classList.add('hidden');
    else {
      h.classList.remove('hidden');
      const subH = G.behaviors.subtitle(inst);
      h.querySelector('.h-name').innerHTML = `<b>${escapeHtml(inst.def.name)}</b>${subH ? `<span>${escapeHtml(subH)}</span>` : ''}`;
      const box = h.querySelector('.h-actions'); box.innerHTML = '';
      for (const a of held) box.appendChild(el('div', { class: 'act' }, el('span', { class: 'key' }, KEYCAP[a.key] || a.key), el('span', {}, a.label)));
    }
  }
  setHoldProgress(f) {
    const r = this.$('#holdring');
    r.classList.toggle('hidden', f <= 0);
    r.querySelector('.fg').style.strokeDashoffset = String(100 - clamp(f, 0, 1) * 100);
  }
  setThrowCharge(f) {
    const t = this.$('#throwbar');
    t.classList.toggle('hidden', f <= 0);
    t.firstChild.style.width = `${f * 100}%`;
  }
  setPlacementHelp(def) {
    const p = this.$('#placehelp');
    if (!def) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    p.innerHTML = `<b>${escapeHtml(def.name)}</b><div><span class="key">🖱 L</span> / <span class="key">F</span> Place</div><div><span class="key">Scroll</span> <span class="key">Q</span> <span class="key">R</span> Rotate</div><div><span class="key">🖱 R</span> / <span class="key">G</span> Cancel</div><div class="valid"></div>`;
  }
  setPlacementValid(v) { const e = this.$('#placehelp .valid'); if (e) { e.textContent = v ? '✓ Looks good' : '✕ Can\'t place here'; e.className = 'valid ' + (v ? 'ok' : 'bad'); } }

  showInspect(inst) {
    const d = inst.def;
    const r = RARITY[d.rarity];
    const box = this.$('#inspect');
    const extra = G.behaviors.subtitle(inst);
    const val = G.market?.resellable(d) ? `<div class="i-val">Market value ${fmtMoney(G.market.marketValue(d))}</div>` : '';
    box.innerHTML = `<div class="i-name">${escapeHtml(d.name)}</div><div class="i-meta"><span class="rar" style="color:${r.color}">${r.label}</span> · ${CATEGORIES[d.category]?.label || d.category}${d.brand ? ' · ' + escapeHtml(d.brand) : ''}</div><div class="i-desc">${escapeHtml(d.desc || '')}</div>${extra ? `<div class="i-sub">${escapeHtml(extra)}</div>` : ''}${val}<div class="i-hint">Move mouse to rotate · scroll to zoom</div>`;
    box.classList.remove('hidden');
  }
  hideInspect() { this.$('#inspect')?.classList.add('hidden'); }

  hint(text, secs = 3) {
    const h = this.$('#hint');
    h.textContent = text; h.classList.remove('hidden');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => h.classList.add('hidden'), secs * 1000);
  }

  // ------------------------------------------------------------- toasts / popups
  toast(text, { icon = 'ℹ️', kind = 'info', duration = 2.8 } = {}) {
    const box = this.$('#toasts');
    const t = el('div', { class: 'toast ' + kind }, el('span', { class: 't-icon' }, icon), el('span', { class: 't-text' }, text));
    box.appendChild(t);
    while (box.children.length > 5) box.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 400); }, duration * 1000);
  }
  needPopup(k, d) {
    const n = NEEDS[k];
    const box = this.$('#popups');
    const p = el('div', { class: 'popup ' + (d > 0 ? 'up' : 'down') }, `${n.icon} ${d > 0 ? '+' : ''}${Math.round(d)}`);
    p.style.left = `${46 + Math.random() * 8}%`;
    box.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
  xpPopup(n, reason) {
    if (n <= 0) return;
    const box = this.$('#popups');
    const p = el('div', { class: 'popup xp' }, `+${n} XP${reason ? ' · ' + reason : ''}`);
    p.style.left = `${44 + Math.random() * 6}%`;
    box.appendChild(p);
    setTimeout(() => p.remove(), 1600);
  }
  levelUp(lv) {
    const unlocked = STORE_ORDER.filter((s) => STORES[s].unlock === lv);
    const card = el('div', { class: 'levelup' },
      el('div', { class: 'lu-k' }, 'LEVEL UP'),
      el('div', { class: 'lu-n' }, String(lv)),
      el('div', { class: 'lu-t' }, LEVEL_TITLES[lv - 1] || ''),
      unlocked.length ? el('div', { class: 'lu-u' }, 'Unlocked: ' + unlocked.map((s) => `${STORES[s].logo} ${STORES[s].name}`).join(', ')) : null,
    );
    this.root.appendChild(card);
    requestAnimationFrame(() => card.classList.add('in'));
    setTimeout(() => { card.classList.remove('in'); setTimeout(() => card.remove(), 600); }, 3800);
    for (const s of unlocked) G.phone?.notify({ app: s, title: `${STORES[s].name} unlocked!`, body: STORES[s].tagline });
  }
  achievement(a) {
    const card = el('div', { class: 'achv' }, el('div', { class: 'a-icon' }, a.icon), el('div', {}, el('div', { class: 'a-k' }, 'Achievement unlocked'), el('div', { class: 'a-t' }, a.text), el('div', { class: 'a-d' }, a.desc + (a.money ? ` · +${fmtMoney(a.money)}` : ''))));
    this.root.appendChild(card);
    requestAnimationFrame(() => card.classList.add('in'));
    setTimeout(() => { card.classList.remove('in'); setTimeout(() => card.remove(), 600); }, 4200);
  }

  // ------------------------------------------------------------- progress (with optional stir minigame)
  progress(label, seconds, { icon = '⏳', cancelable = true, minigame = null } = {}) {
    return new Promise((resolve) => {
      const p = this.$('#progress');
      p.classList.remove('hidden');
      p.querySelector('.pr-icon').textContent = icon;
      p.querySelector('.pr-label').textContent = label;
      const fill = p.querySelector('.pr-fill');
      const zone = p.querySelector('.pr-zone'), needle = p.querySelector('.pr-needle');
      const sub = p.querySelector('.pr-sub');
      zone.classList.toggle('hidden', !minigame); needle.classList.toggle('hidden', !minigame);
      sub.textContent = minigame ? 'Click when the needle is in the green zone for bonus quality!' : cancelable ? 'Move or press Esc to cancel' : '';
      let t = 0, quality = 1, hits = 0, tries = 0;
      let zoneAt = 0.3 + Math.random() * 0.5;
      if (minigame) { zone.style.left = `${zoneAt * 100 - 9}%`; }
      const startPos = G.player.pos.clone();
      const off = G.engine.onUpdate((dt) => {
        t += dt;
        fill.style.width = `${clamp(t / seconds, 0, 1) * 100}%`;
        if (minigame) {
          const nv = (Math.sin(t * 3.2) + 1) / 2;
          needle.style.left = `${nv * 100}%`;
          if (G.input.wasPressed('Mouse0') || G.input.wasPressed('Space')) {
            tries++;
            if (Math.abs(nv - zoneAt) < 0.09) { hits++; G.audio.play('success'); zoneAt = 0.15 + Math.random() * 0.7; zone.style.left = `${zoneAt * 100 - 9}%`; G.particles.sparkle(G.camera.position.clone().add(G.camera.getWorldDirection(G.camera.position.clone()).multiplyScalar(0.8)), 4); }
            else G.audio.play('click', { pitch: 0.6 });
          }
        }
        const moved = G.player.mode === 'walk' && G.player.pos.distanceTo(startPos) > 0.25;
        if (cancelable && (G.input.wasPressed('Escape') || moved)) { finish(false); return; }
        if (t >= seconds) { quality = minigame ? 1 + Math.min(0.5, hits * 0.12) - Math.max(0, tries - hits) * 0.03 : 1; finish(quality); }
      });
      const finish = (v) => { off(); p.classList.add('hidden'); resolve(v); };
    });
  }

  // ------------------------------------------------------------- fades & overlays
  fadeOut(s = 0.6) { const f = this.$('#fade'); f.style.transition = `opacity ${s}s`; f.style.opacity = 1; return new Promise((r) => setTimeout(r, s * 1000)); }
  fadeIn(s = 0.6) { const f = this.$('#fade'); f.style.transition = `opacity ${s}s`; f.style.opacity = 0; return new Promise((r) => setTimeout(r, s * 1000)); }
  setSteam(on, k = 1) { const e = this.$('#overlay-steam'); e.style.opacity = on ? 0.55 * k : 0; }
  peephole(on) { this.$('#overlay-peephole').classList.toggle('on', on); G.hand.hidden = on; }
  scopeOverlay(on) { this.$('#overlay-scope').classList.toggle('on', on); }
  flash() { const f = this.$('#overlay-flash'); f.style.transition = 'none'; f.style.opacity = 0.9; requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = 0; }); }
  faceOverlay(color, secs) { const f = this.$('#overlay-face'); f.style.setProperty('--c', color); f.classList.add('on'); clearTimeout(this._faceT); this._faceT = setTimeout(() => f.classList.remove('on'), secs * 1000); }
  breathe(on) { this.$('#overlay-breathe').classList.toggle('on', on); }
  kaleidoscope(secs) { const k = this.$('#overlay-kaleido'); k.classList.add('on'); setTimeout(() => k.classList.remove('on'), secs * 1000); }
  sleepOverlay(on) {
    const s = this.$('#overlay-sleep'); s.classList.toggle('on', on);
    clearInterval(this._sleepT);
    if (on) this._sleepT = setInterval(() => { s.querySelector('.st').textContent = `${G.clock.fmt()} · Day ${G.clock.day}`; }, 100);
  }

  // ------------------------------------------------------------- modal panels
  openModal(content, { title = '', cls = '', onClose = null, wide = false, icon = '' } = {}) {
    this.closeModal(true);
    G.input.unlock();
    const root = this.$('#modal-root');
    const close = el('button', { class: 'm-close', onclick: () => this.closeModal() }, '✕');
    const panel = el('div', { class: `modal ${cls} ${wide ? 'wide' : ''}` }, el('div', { class: 'm-head' }, el('div', { class: 'm-title' }, icon ? el('span', { class: 'm-icon' }, icon) : null, title), close), el('div', { class: 'm-body' }, content));
    const back = el('div', { class: 'm-back', onclick: (e) => { if (e.target === back) this.closeModal(); } }, panel);
    root.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    this.modal = { back, onClose, panel };
    G.audio.play('ui');
    return panel;
  }
  closeModal(silent = false) {
    if (!this.modal) return;
    const m = this.modal;
    this.modal = null;
    m.back.classList.remove('in');
    setTimeout(() => m.back.remove(), 200);
    m.onClose?.();
    if (!silent) { G.audio.play('uiBack'); this.relock(); }
  }
  relock() { if (!this.blocking && G.started) setTimeout(() => { if (!this.blocking) G.input.lock(); }, 50); }

  choose(title, options, { icon = '' } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const list = el('div', { class: 'choices' });
      for (const o of options) {
        const b = el('button', { class: 'choice' + (o.primary ? ' primary' : '') + (o.disabled ? ' disabled' : ''), onclick: () => { if (o.disabled) { G.audio.play('error'); return; } done = true; this.closeModal(); resolve(o.value); } },
          o.icon ? el('span', { class: 'c-ico' }, o.icon) : null,
          el('div', {}, el('div', { class: 'c-l' }, o.label), o.sub ? el('div', { class: 'c-s' }, o.sub) : null));
        list.appendChild(b);
      }
      this.openModal(list, { title, icon, cls: 'choose', onClose: () => { if (!done) resolve(undefined); } });
    });
  }

  // Container / storage browser
  openContainer(container) {
    const render = () => {
      const items = container.items();
      const grid = el('div', { class: 'inv-grid' });
      if (!items.length) grid.appendChild(el('div', { class: 'empty' }, 'Nothing in here yet.'));
      const groups = {};
      for (const it of items) (groups[it.def.id] ||= []).push(it);
      for (const [id, list] of Object.entries(groups)) {
        const d = list[0].def;
        const card = el('div', { class: 'inv-card' },
          thumbImg(d, 160),
          el('div', { class: 'inv-n' }, d.name),
          list.length > 1 ? el('div', { class: 'inv-q' }, '×' + list.length) : null,
          el('div', { class: 'inv-b' },
            el('button', { onclick: () => { this.closeModal(true); G.items.pickUp(list[0]); this.relock(); } }, d.furniture ? 'Place' : 'Take'),
            d.use?.type === 'wear' ? el('button', { onclick: () => { G.outfit.wear(list[0]); render(); } }, 'Wear') : null,
          ));
        card.style.setProperty('--r', RARITY[d.rarity]?.color || '#999');
        grid.appendChild(card);
      }
      body.innerHTML = '';
      body.appendChild(el('div', { class: 'inv-head' }, `${items.length}${container.capacity < 999 ? ' / ' + container.capacity : ''} items`));
      body.appendChild(grid);
    };
    const body = el('div', { class: 'inv' });
    this.openModal(body, { title: container.name, icon: container.icon, wide: true });
    render();
  }

  // Reveal card for blind boxes / special unboxings
  reveal({ title, subtitle, rarity, item }) {
    const r = RARITY[rarity] || RARITY.common;
    const card = el('div', { class: 'reveal r-' + rarity }, el('div', { class: 'rv-glow' }), thumbImg(item, 320), el('div', { class: 'rv-r', style: { color: r.color } }, r.label.toUpperCase()), el('div', { class: 'rv-t' }, title), el('div', { class: 'rv-s' }, subtitle));
    card.style.setProperty('--rc', r.color);
    this.root.appendChild(card);
    requestAnimationFrame(() => card.classList.add('in'));
    setTimeout(() => { card.classList.remove('in'); setTimeout(() => card.remove(), 600); }, 3200);
  }

  showStyleCard() {
    const s = G.outfit.styleReport();
    let c = this.$('#stylecard');
    if (!c) { c = el('div', { id: 'stylecard' }); this.root.appendChild(c); }
    c.innerHTML = `<div class="sc-k">YOUR FIT</div><div class="sc-score">${s.score}<span>/100</span></div><div class="sc-vibe">${s.vibe}</div><div class="sc-list">${s.lines.map((l) => `<div>${l}</div>`).join('')}</div>`;
    c.classList.add('in');
  }
  hideStyleCard() { this.$('#stylecard')?.classList.remove('in'); }
}

export { storeUnlocked };
