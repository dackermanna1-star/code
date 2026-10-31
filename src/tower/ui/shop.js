// LAST LOOKOUT — the between-wave shop ("QUARTERMASTER"): tabs, item cards built from the
// catalog via shopModel, buy / equip / place buttons, cash and gate status, NEXT WAVE.
// Mouse and keyboard: arrows / WASD select, Enter buys, L loads ammo, Q / E / Tab / 1-4 switch
// tabs, N starts the next wave.

import { el, SegBar, retrigger } from './dom.js';
import { SHOP_TABS, shopItems, normalizeShopState, moveSelection, actionCall, tabBadges } from './shopModel.js';
import { formatCash, formatClock, pad } from './format.js';
import { shopIcon, spriteElement } from './sprites.js';

export class Shop {
  /** fire(name, ...args): calls a TowerHud handler; ui(kind): UI sound. */
  constructor(parent, fire, ui) {
    this.fire = fire;
    this.ui = ui;
    const root = (this.root = el('div', 'scr shop', parent));
    el('div', 'grid-bg', root);
    el('div', 'scan', root);
    el('div', 'vign', root);
    const fr = el('div', 'frame', root);
    const hdr = el('div', 'hdr', fr);
    const brand = el('div', 'brand', hdr, 'QUARTERMASTER');
    this.sub = el('small', '', brand, 'SUPPLY DROP');
    const wallet = el('div', 'wallet', hdr);
    el('div', 'lbl', wallet, 'FUNDS');
    this.cash = el('div', 'cash glow', wallet, '$0');
    const gate = el('div', 'gate', wallet);
    el('span', 'lbl', gate, 'GATE');
    this.gateBar = new SegBar(gate);
    this.gatePct = el('span', 'f16', gate, '100%');
    this.tabsEl = el('div', 'tabs', fr);
    this.tabBtns = SHOP_TABS.map((t, i) => {
      const b = el('button', 'tab', this.tabsEl);
      el('span', 'key', b, t.key);
      b.appendChild(document.createTextNode(t.label));
      b._badge = el('span', 'badge hide', b, '0');
      b.addEventListener('click', () => this.setTab(i, true));
      return b;
    });
    el('div', 'hint', this.tabsEl, 'Q / E  SWITCH TAB');
    this.cardsEl = el('div', 'cards', fr);
    const ftr = el('div', 'ftr', fr);
    const help = el('div', 'help', ftr);
    help.innerHTML = '<span class="key">←</span><span class="key">→</span><span class="key">↑</span><span class="key">↓</span> SELECT &nbsp; '
      + '<span class="key">ENTER</span> BUY / EQUIP &nbsp; <span class="key">L</span> LOAD AMMO';
    const right = el('div', '', ftr);
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    this.auto = el('span', 'auto', right, '');
    this.next = el('button', 'btn next', right);
    this.next.innerHTML = 'NEXT WAVE ▶▶<small>[N]</small>';
    this.next.addEventListener('click', () => this._next());
    this.toast = el('div', 'toast', root, '');

    this.tab = 0;
    this.sel = 0;
    this.items = [];
    this.cards = [];
    this.state = normalizeShopState({});
    this.pending = null;
    this.visible = false;
  }

  show(state) {
    const st = normalizeShopState(state);
    const wasVisible = this.visible;
    // feedback for the action that led to this refresh
    if (this.pending && wasVisible) {
      const p = this.pending;
      if (st.cash < p.cash - 0.5) {
        this._toast(`${p.verb} ${p.name}  -${formatCash(p.cash - st.cash)}`);
        this.ui('buy');
      } else if (p.action === 'equip') {
        this._toast(`${p.name} ${p.kind === 'ammo' ? 'LOADED' : 'EQUIPPED'}`);
        this.ui('equip');
      }
    }
    this.pending = null;
    this.state = st;
    this.visible = true;
    this.root.classList.add('on');
    this.cash.textContent = formatCash(st.cash);
    const g = st.gate.hp / st.gate.max;
    this.gateBar.set(g);
    this.gateBar.low(g < 0.3);
    this.gatePct.textContent = `${Math.round(g * 100)}%`;
    this.sub.textContent = `SUPPLY DROP · WAVE ${pad(st.wave)} CLEARED`;
    if (st.countdown !== null && Number.isFinite(st.countdown)) this.auto.textContent = `AUTO-START ${formatClock(st.countdown)}`;
    else this.auto.textContent = '';
    const badges = tabBadges(st);
    SHOP_TABS.forEach((t, i) => {
      const b = this.tabBtns[i]._badge;
      b.textContent = String(badges[t.id]);
      b.classList.toggle('hide', !badges[t.id]);
    });
    this._render();
    if (!wasVisible) this.ui('open');
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.root.classList.remove('on');
  }

  /** Countdown text refresh without re-rendering the cards. */
  setCountdown(s) {
    if (!this.visible) return;
    this.auto.textContent = s !== null && Number.isFinite(s) ? `AUTO-START ${formatClock(s)}` : '';
  }

  setTab(i, sound = false) {
    const n = SHOP_TABS.length;
    const t = ((i % n) + n) % n;
    if (t === this.tab && this.cards.length) return;
    this.tab = t;
    this.sel = 0;
    if (sound) this.ui('tab');
    this._render();
  }

  _render() {
    this.tabBtns.forEach((b, i) => b.classList.toggle('on', i === this.tab));
    const items = (this.items = shopItems(SHOP_TABS[this.tab].id, this.state));
    this.cardsEl.className = 'cards t-' + SHOP_TABS[this.tab].id;
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1);
    const scroll = this.cardsEl.scrollTop;
    this.cardsEl.textContent = '';
    this.cards = items.map((it, i) => this._card(it, i));
    this.cardsEl.scrollTop = scroll;
    this._select(this.sel, false);
  }

  _card(it, i) {
    const c = el('div', 'card pn', this.cardsEl);
    c.classList.toggle('dis', !it.enabled && it.status !== 'equipped');
    const stampText = it.status === 'equipped' ? (it.kind === 'ammo' ? 'LOADED' : 'EQUIPPED')
      : it.status === 'maxed' ? it.actionLabel || 'MAXED' : it.status === 'owned' && it.kind === 'rifle' ? 'OWNED' : '';
    if (stampText) el('div', `stampc ${it.status === 'equipped' ? 'eq' : it.status === 'maxed' ? 'mx' : 'own'}`, c, stampText);
    const ic = el('div', 'ic', c);
    const spr = shopIcon(it.kind, it.id);
    if (spr) ic.appendChild(spriteElement(spr, 3));
    el('div', 'nm', c, it.name);
    el('div', 'tg', c, it.tag);
    el('div', 'ds', c, it.desc);
    if (it.level && it.level.max > 1) {
      const pips = el('div', 'pips', c);
      for (let k = 0; k < it.level.max; k++) el('i', k < it.level.cur ? 'on' : '', pips);
    }
    if (it.stats.length) {
      const st = el('div', 'st', c);
      for (const s of it.stats) {
        el('span', 'k', st, s.label);
        const bar = new SegBar(st, s.label === 'GATE' && s.value < 0.3 ? 'low' : '');
        bar.set(s.value, true);
        el('span', 't', st, s.text || '');
      }
    }
    const act = el('div', 'act', c);
    if (it.action && it.price !== null) {
      const pr = el('span', 'price' + (it.affordable ? '' : ' no'), act, it.priceText);
      if (!it.affordable && it.reason) pr.title = it.reason;
    } else if (it.reason) el('span', 'reason', act, it.reason);
    else el('span', '', act, '');
    const btns = el('div', 'btns', act);
    if (it.secondary && it.secondary.enabled) {
      const b2 = el('button', 'btn alt', btns, it.secondary.label);
      if (!it.secondary.enabled) b2.disabled = true;
      b2.addEventListener('click', (e) => {
        e.stopPropagation();
        this._select(i, false);
        this._act(it, 'secondary', b2);
      });
    }
    if (it.action) {
      const label = !it.affordable && it.reason && it.reason.startsWith('NEED') ? it.reason : it.reason === 'GATE INTACT' ? 'INTACT' : it.actionLabel;
      const b = el('button', 'btn', btns, label);
      if (!it.enabled) b.disabled = true;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._select(i, false);
        this._act(it, 'primary', b);
      });
      c._btn = b;
    }
    c.addEventListener('mouseenter', () => this._select(i, true));
    c.addEventListener('click', () => this._select(i, true));
    return c;
  }

  _select(i, sound) {
    if (!this.cards.length) return;
    const j = Math.max(0, Math.min(this.cards.length - 1, i));
    if (j !== this.sel && sound) this.ui('hover');
    if (this.cards[this.sel]) this.cards[this.sel].classList.remove('sel');
    this.sel = j;
    const c = this.cards[j];
    c.classList.add('sel');
    if (sound === false) return;
    const r = c.getBoundingClientRect(), pr = this.cardsEl.getBoundingClientRect();
    if (r.top < pr.top || r.bottom > pr.bottom) c.scrollIntoView({ block: 'nearest' });
  }

  _act(it, which, btn) {
    const sec = which === 'secondary';
    const enabled = sec ? it.secondary && it.secondary.enabled : it.enabled;
    if (!enabled) {
      this.ui('deny');
      if (btn) retrigger(btn, 'deny');
      else if (this.cards[this.sel]) retrigger(this.cards[this.sel], 'shake');
      if (it.reason) this._toast(it.reason);
      return;
    }
    const call = actionCall(it, which);
    if (!call) return;
    this.ui('click');
    const action = sec ? it.secondary.action : it.action;
    const verb = action === 'upgrade' ? 'UPGRADED' : action === 'repair' ? 'REPAIRED' : action === 'refill' ? 'REFILLED' : 'BOUGHT';
    this.pending = { cash: this.state.cash, name: it.name, action, kind: it.kind, verb };
    if (call[0] === 'onPlace') {
      this.pending = null;
      this.ui('place');
    }
    this.fire(...call);
  }

  _next() {
    this.ui('confirm');
    this.fire('onShopClose');
  }

  _toast(text) {
    const t = this.toast;
    t.textContent = text;
    if (t._anim) t._anim.cancel();
    t._anim = t.animate([
      { opacity: 0, transform: 'translate(-50%, 8px)' },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.1 },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.8 },
      { opacity: 0, transform: 'translate(-50%, -6px)' },
    ], { duration: 1800, easing: 'steps(12, end)' });
  }

  _cols() {
    const cs = this.cards;
    if (cs.length < 2) return 1;
    const top = cs[0].offsetTop;
    let n = 0;
    for (const c of cs) {
      if (c.offsetTop !== top) break;
      n++;
    }
    return Math.max(1, n);
  }

  /** Keyboard while the shop is open; returns true when the key was used. */
  key(e) {
    if (!this.visible) return false;
    const k = e.key;
    const move = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', Home: 'home', End: 'end' }[k.length === 1 ? k.toLowerCase() : k];
    if (move) {
      this._select(moveSelection(this.sel, this.cards.length, this._cols(), move), true);
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      const it = this.items[this.sel];
      if (it) this._act(it, 'primary', this.cards[this.sel] && this.cards[this.sel]._btn);
      return true;
    }
    if (k === 'l' || k === 'L') {
      const it = this.items[this.sel];
      if (it && it.secondary) this._act(it, 'secondary', null);
      return true;
    }
    if (k === 'Tab') {
      this.setTab(this.tab + (e.shiftKey ? -1 : 1), true);
      return true;
    }
    if (k === 'q' || k === 'Q') {
      this.setTab(this.tab - 1, true);
      return true;
    }
    if (k === 'e' || k === 'E') {
      this.setTab(this.tab + 1, true);
      return true;
    }
    if (k >= '1' && k <= String(SHOP_TABS.length)) {
      this.setTab(+k - 1, true);
      return true;
    }
    if (k === 'n' || k === 'N') {
      this._next();
      return true;
    }
    return false;
  }
}
