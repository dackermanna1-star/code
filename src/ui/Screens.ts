import { h, clear, countUp } from './dom';
import type { IconRenderer } from './Icons';
import type { AudioEngine } from '../audio/AudioEngine';
import {
  CUSTOM_OPTIONS,
  DECOR,
  DecorId,
  Progression,
  RANK_TITLES,
  Settings,
  UPGRADES,
  UpgradeId,
  pointsForRank,
  MAX_RANK,
} from '../game/Progression';
import { INGREDIENTS, IngredientId } from '../food/Ingredients';
import type { CustomerDef } from '../characters/Roster';
import { ROSTER } from '../characters/Roster';
import type { Customization } from '../world/Structure';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekday = (day: number) => WEEKDAYS[day % 7];

const TIPS = [
  'Flip patties when the needle hits the zone on the ticket.',
  'Drag toppings for pinpoint placement — or click a bin for a quick drop.',
  'Regulars always order their favourite. Learn their tastes!',
  'Burnt patties go in the trash. Nobody wants charcoal.',
  'Decorations make waiting customers more patient.',
  'The Food Critic visits every 5th day. Be ready.',
  'Cheese melts over hot patties — stack it right on top!',
  'Press 1–4 to jump between stations.',
];

export interface DaySummary {
  day: number;
  served: number;
  avg: number;
  tips: number;
  sales: number;
  perfect: number;
  best?: { name: string; score: number; portrait: string };
  xpBefore: number;
  xpAfter: number;
  rankBefore: number;
  rankAfter: number;
  reputation: number;
}

export class Screens {
  private layer: HTMLElement;
  private current: HTMLElement | null = null;

  constructor(
    root: HTMLElement,
    private icons: IconRenderer,
    private audio: AudioEngine,
    private progress: Progression,
  ) {
    this.layer = h('div', { class: 'screens' });
    root.append(this.layer);
  }

  private open(el: HTMLElement) {
    this.close();
    this.current = el;
    this.layer.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
  }

  close() {
    const el = this.current;
    if (!el) return;
    this.current = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }

  get isOpen() {
    return !!this.current;
  }

  // ------------------------------------------------------------------ loading
  static loading(): { set(p: number, label?: string): void; ready(onStart: () => void): void; remove(): void } {
    const bar = h('i', {});
    const tip = h('div', { class: 'load-tip' }, 'Preheating the grill…');
    const btnWrap = h('div', { class: 'load-start' });
    const el = h(
      'div',
      { id: 'loading' },
      h('div', { class: 'load-box' }, h('div', { class: 'load-burger' }, '🍔'), h('div', { class: 'load-bar' }, bar), tip, btnWrap),
    );
    document.body.append(el);
    let t = 0;
    const tipTimer = setInterval(() => (tip.textContent = TIPS[t++ % TIPS.length]), 2600);
    return {
      set(p: number, label?: string) {
        bar.style.width = `${Math.round(p * 100)}%`;
        if (label) tip.textContent = label;
      },
      ready(onStart: () => void) {
        clearInterval(tipTimer);
        bar.style.width = '100%';
        tip.textContent = 'Kitchen is ready!';
        const b = h('button', { class: 'btn yellow big pop-in' }, '🔥 Fire up the grill');
        b.addEventListener('click', () => {
          onStart();
          el.classList.add('fade');
          setTimeout(() => el.remove(), 900);
        });
        btnWrap.append(b);
      },
      remove() {
        clearInterval(tipTimer);
        el.classList.add('fade');
        setTimeout(() => el.remove(), 900);
      },
    };
  }

  // ------------------------------------------------------------------ title
  title(o: { hasSave: boolean; day: number; onPlay: () => void; onNew: () => void; onSettings: () => void; onCredits: () => void }) {
    const btns = h('div', { class: 'title-btns' });
    if (o.hasSave) {
      btns.append(h('button', { class: 'btn yellow big', onclick: () => this.click(o.onPlay) }, `▶ Continue · Day ${o.day}`));
      btns.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => this.confirmNew(o.onNew) }, 'New Game'), h('button', { class: 'btn ghost', onclick: () => this.click(o.onSettings) }, '⚙ Settings')));
    } else {
      btns.append(h('button', { class: 'btn yellow big', onclick: () => this.click(o.onPlay) }, '▶ Open the Shop'));
      btns.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => this.click(o.onSettings) }, '⚙ Settings'), h('button', { class: 'btn ghost', onclick: () => this.click(o.onCredits) }, '★ Credits')));
    }
    const el = h(
      'div',
      { class: 'screen title-screen' },
      h(
        'div',
        { class: 'title-wrap' },
        h('div', { class: 'logo' }, h('h1', {}, h('span', { class: 's1' }, 'Sizzle'), h('span', { class: 'amp' }, ' & '), 'Stack'), h('div', { class: 'sub' }, 'A Burger Shop Story')),
        btns,
      ),
      h('div', { class: 'title-foot' }, 'Drag · Flip · Stack · Serve   —   Headphones recommended 🎧'),
    );
    this.open(el);
  }

  private click(fn: () => void) {
    this.audio.play('click');
    fn();
  }

  private confirmNew(onNew: () => void) {
    this.audio.play('click');
    const el = h(
      'div',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'card modal paper-tex', style: { width: 'min(460px, calc(100vw - 32px))' } },
        h('h2', {}, 'Start over?'),
        h('p', { class: 'lead' }, 'This erases your restaurant, money and rank. Settings are kept.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: () => this.titleBack() }, 'Keep playing'), h('button', { class: 'btn', onclick: () => this.click(onNew) }, 'Erase & restart')),
      ),
    );
    this.open(el);
  }
  titleBack: () => void = () => this.close();

  // ------------------------------------------------------------------ banners
  dayBanner(day: number, sub: string) {
    const el = h('div', { class: 'day-banner' }, h('div', { class: 'big' }, `Day ${day}`), h('div', { class: 'small' }, sub));
    this.layer.append(el);
    setTimeout(() => el.remove(), 3000);
  }

  bigBanner(text: string, sub = '') {
    const el = h('div', { class: 'day-banner' }, h('div', { class: 'big' }, text), sub ? h('div', { class: 'small' }, sub) : null);
    this.layer.append(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ------------------------------------------------------------------ pause & settings
  pause(o: { onResume: () => void; onSettings: () => void; onQuit: () => void; onHelp: () => void }) {
    const el = h(
      'div',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'card modal paper-tex', style: { width: 'min(440px, calc(100vw - 32px))', textAlign: 'center' } },
        h('h2', {}, 'Paused'),
        h('p', { class: 'lead' }, 'The patties are waiting (patiently, for once).'),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' } },
          h('button', { class: 'btn yellow', onclick: () => this.click(o.onResume) }, '▶ Resume'),
          h('button', { class: 'btn ghost', onclick: () => this.click(o.onHelp) }, '❓ How to play'),
          h('button', { class: 'btn ghost', onclick: () => this.click(o.onSettings) }, '⚙ Settings'),
          h('button', { class: 'btn ghost', onclick: () => this.click(o.onQuit) }, '🏠 Save & quit to title'),
        ),
      ),
    );
    this.open(el);
  }

  help(onBack: () => void) {
    const row = (icon: string, title: string, text: string) =>
      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start', margin: '8px 0' } }, h('div', { style: { fontSize: '30px' } }, icon), h('div', {}, h('b', { style: { fontFamily: 'var(--display)', fontSize: '18px' } }, title), h('div', { style: { fontWeight: '700', color: 'var(--ink-2)' } }, text)));
    const el = h(
      'div',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'card modal paper-tex' },
        h('h2', {}, 'How to play'),
        row('🧾', 'Order', 'Click “Take Order” when a customer reaches the counter. Their ticket lands on the rail.'),
        row('🔥', 'Grill', 'Drag patties onto the grill. Click a patty to flip it. The gauge needle shows the side on the grill — match the ticket’s doneness (R / M / W) on both sides, then drag it to the holding tray.'),
        row('🍔', 'Build', 'Drag the bottom bun, then each layer in the ticket’s order (bottom to top). Drop layers dead-center for full marks. Finish with the top bun.'),
        row('🛎️', 'Serve', 'When the customer walks up to the pickup window, click Serve. They rate waiting, grilling and building — and tip accordingly!'),
        row('🤠', 'Revolver', 'At the order counter, G draws it. Aim with the mouse (push to a screen edge to look around), click to fire, R reloads, G holsters. Kids are off limits. Switch it off, or the blood, in Settings.'),
        row('⌨️', 'Shortcuts', '1–4 switch stations · Space takes orders / serves · G revolver · Esc pauses'),
        h('div', { class: 'actions' }, h('button', { class: 'btn yellow', onclick: () => this.click(onBack) }, 'Got it!')),
      ),
    );
    this.open(el);
  }

  settings(s: Settings, onChange: (s: Settings) => void, onBack: () => void, onReset?: () => void) {
    const slider = (key: 'master' | 'music' | 'sfx', label: string) => {
      const input = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: s[key] }) as HTMLInputElement;
      input.addEventListener('input', () => {
        s[key] = parseFloat(input.value);
        onChange(s);
      });
      input.addEventListener('change', () => this.audio.play('click'));
      return h('div', { class: 'set-row' }, h('span', {}, label), input);
    };
    const seg = <T extends string>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const wrap = h('div', { class: 'seg' });
      const render = () => {
        clear(wrap);
        for (const [v, name] of opts) {
          const b = h('button', { class: get() === v ? 'on' : '' }, name);
          b.addEventListener('click', () => {
            set(v);
            onChange(s);
            this.audio.play('click');
            render();
          });
          wrap.append(b);
        }
      };
      render();
      return h('div', { class: 'set-row' }, h('span', {}, label), wrap);
    };
    const toggle = (key: 'shake' | 'motion' | 'hints' | 'revolver' | 'gore', label: string) =>
      seg(label, [['on', 'On'], ['off', 'Off']], () => (s[key] ? 'on' : 'off'), (v) => (s[key] = v === 'on'));
    const el = h(
      'div',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'card modal paper-tex', style: { width: 'min(620px, calc(100vw - 32px))' } },
        h('h2', {}, 'Settings'),
        h('p', { class: 'lead' }, 'Tune the sizzle to taste.'),
        slider('master', '🔊 Master volume'),
        slider('music', '🎵 Music'),
        slider('sfx', '🍳 Sound effects'),
        seg('🖥️ Graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], () => s.quality, (v) => (s.quality = v)),
        toggle('shake', '📳 Screen shake'),
        toggle('motion', '🎥 Camera motion'),
        toggle('hints', '💡 Hints & guides'),
        toggle('revolver', '🤠 Revolver at the counter'),
        toggle('gore', '🩸 Blood'),
        h(
          'div',
          { class: 'actions' },
          onReset ? this.armedButton('Reset save', 'Tap again to erase everything', onReset) : null,
          h('button', { class: 'btn yellow', onclick: () => this.click(onBack) }, 'Done'),
        ),
      ),
    );
    this.open(el);
  }

  /** A destructive button that needs a second tap within 3 s (no native dialogs). */
  private armedButton(label: string, armedLabel: string, action: () => void): HTMLElement {
    let armed = 0;
    const b = h('button', { class: 'btn ghost small' }, label) as HTMLButtonElement;
    b.addEventListener('click', () => {
      if (armed && performance.now() - armed < 3000) {
        this.audio.play('trash');
        action();
        return;
      }
      armed = performance.now();
      this.audio.play('error', { volume: 0.5 });
      b.textContent = armedLabel;
      b.classList.add('danger');
      setTimeout(() => {
        if (performance.now() - armed >= 3000) {
          b.textContent = label;
          b.classList.remove('danger');
          armed = 0;
        }
      }, 3050);
    });
    return b;
  }

  credits(onBack: () => void) {
    const el = h(
      'div',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'card modal paper-tex', style: { width: 'min(520px, calc(100vw - 32px))', textAlign: 'center' } },
        h('h2', {}, 'Credits'),
        h('p', { class: 'lead' }, 'Sizzle & Stack — a love letter to classic restaurant-management games.'),
        h('p', { style: { fontWeight: '700' } }, 'Every model, texture, character, sound and song is generated procedurally in code at load time — no external art assets.'),
        h('p', { style: { fontWeight: '700', color: 'var(--ink-2)' } }, 'Built with three.js, postprocessing & N8AO. Fonts: Fredoka & Nunito (OFL).'),
        h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn yellow', onclick: () => this.click(onBack) }, 'Back')),
      ),
    );
    this.open(el);
  }

  // ------------------------------------------------------------------ day summary
  async summary(d: DaySummary, o: { onShop: () => void; onNext: () => void }) {
    const stat = (label: string, value: string) => h('div', { class: 'stat' }, h('b', {}, value), h('small', {}, label));
    const xpBar = h('i', {});
    const rankLabel = h('span', {}, `Rank ${d.rankBefore} · ${RANK_TITLES[d.rankBefore]}`);
    const xpText = h('span', {}, '');
    const tipsEl = h('b', {}, '$0.00');
    const el = h(
      'div',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'card modal paper-tex' },
        h('h2', {}, `Day ${d.day} complete!`),
        h('p', { class: 'lead' }, d.avg >= 90 ? 'Outstanding service — the whole town is talking!' : d.avg >= 75 ? 'Great shift. Customers left smiling.' : d.avg >= 55 ? 'Not bad! Room to sizzle a little more.' : 'A rough day. Tomorrow is a fresh bun.'),
        h(
          'div',
          { class: 'stats-grid' },
          stat('Served', `${d.served}`),
          stat('Avg score', `${Math.round(d.avg)}%`),
          stat('Perfect', `${d.perfect}`),
          h('div', { class: 'stat' }, tipsEl, h('small', {}, 'Tips + sales')),
        ),
        d.best ? h('div', { class: 'best-list' }, h('span', { class: 'chip' }, h('img', { src: d.best.portrait }), `Happiest customer: ${d.best.name} (${d.best.score}%)`), h('span', { class: 'chip' }, `Reputation: ${'★'.repeat(Math.round(d.reputation))}${'☆'.repeat(5 - Math.round(d.reputation))}`)) : null,
        h('div', { class: 'xp' }, h('div', { class: 'top' }, rankLabel, xpText), h('div', { class: 'bar' }, xpBar)),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn teal', onclick: () => this.click(o.onShop) }, '🛒 Shop & Upgrades'),
          h('button', { class: 'btn yellow', onclick: () => this.click(o.onNext) }, `Next day ▶`),
        ),
      ),
    );
    this.open(el);
    await new Promise((r) => setTimeout(r, 500));
    this.audio.play('coins');
    countUp(tipsEl, 0, d.tips + d.sales, 900, (v) => `$${v.toFixed(2)}`, () => this.audio.play('tick', { volume: 0.25, rate: 1.5 }));
    // xp bar animation (may span a rank-up)
    const frac = (xp: number, r: number) => (r >= MAX_RANK ? 1 : (xp - pointsForRank(r)) / (pointsForRank(r + 1) - pointsForRank(r)));
    xpBar.style.transition = 'none';
    xpBar.style.width = `${frac(d.xpBefore, d.rankBefore) * 100}%`;
    await new Promise((r) => setTimeout(r, 60));
    xpBar.style.transition = '';
    if (d.rankAfter > d.rankBefore) {
      xpBar.style.width = '100%';
      await new Promise((r) => setTimeout(r, 1200));
      xpBar.style.transition = 'none';
      xpBar.style.width = '0%';
      rankLabel.textContent = `Rank ${d.rankAfter} · ${RANK_TITLES[d.rankAfter]}`;
      this.audio.play('levelUp');
      await new Promise((r) => setTimeout(r, 60));
      xpBar.style.transition = '';
    }
    xpBar.style.width = `${frac(d.xpAfter, d.rankAfter) * 100}%`;
    xpText.textContent = d.rankAfter >= MAX_RANK ? 'MAX RANK' : `${d.xpAfter - pointsForRank(d.rankAfter)} / ${pointsForRank(d.rankAfter + 1) - pointsForRank(d.rankAfter)} pts`;
  }

  // ------------------------------------------------------------------ unlock showcase
  unlock(rank: number, u: { ingredients: IngredientId[]; customers: CustomerDef[]; upgrades: { name: string; icon: string }[]; decor: { name: string; icon: string }[] }): Promise<void> {
    return new Promise((resolve) => {
      const grid = h('div', { class: 'unlock-grid' });
      let i = 0;
      const add = (tag: string, img: string | null, icon: string | null, name: string, text: string) => {
        const it = h('div', { class: 'unlock-item', style: { animationDelay: `${0.3 + i++ * 0.12}s` } }, h('div', { class: 'tag' }, tag), img ? h('img', { src: img }) : h('div', { style: { fontSize: '64px', height: '90px', display: 'grid', placeItems: 'center' } }, icon), h('h4', {}, name), h('p', {}, text));
        grid.append(it);
      };
      for (const id of u.ingredients) add('New ingredient', this.icons.get(id) || this.icons.get(id + ':top'), null, INGREDIENTS[id].name, INGREDIENTS[id].blurb);
      for (const c of u.customers) add('New customer', this.icons.portrait(c), null, c.name, c.title);
      for (const x of u.upgrades) add('In the shop', null, x.icon, x.name, 'New equipment available');
      for (const x of u.decor) add('Decoration', null, x.icon, x.name, 'Now available in the shop');
      const el = h(
        'div',
        { class: 'screen scrim' },
        h(
          'div',
          { class: 'card modal paper-tex unlock' },
          h('div', { class: 'burst' }, 'RANK UP!'),
          h('div', { class: 'rankname' }, `Rank ${rank} · ${RANK_TITLES[rank]}`),
          grid,
          h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn yellow', onclick: () => { this.click(() => {}); this.close(); resolve(); } }, 'Awesome!')),
        ),
      );
      this.open(el);
      this.audio.play('levelUp');
    });
  }

  // ------------------------------------------------------------------ shop
  shop(o: {
    onBuyUpgrade: (id: UpgradeId) => boolean;
    onBuyDecor: (id: DecorId) => boolean;
    onCustom: (key: keyof Customization, value: number, cost: number) => boolean;
    onClose: () => void;
  }) {
    const p = this.progress;
    let tab: 'equip' | 'decor' | 'style' = 'equip';
    const body = h('div', {});
    const money = h('span', { class: 'money-card', style: { fontSize: '20px' } }, h('span', { class: 'coin' }, '$'), '');
    const tabs = h('div', { class: 'tabs' });
    const render = () => {
      (money.lastChild as Text).textContent = `$${p.data.money.toFixed(2)}`;
      clear(tabs);
      for (const [k, name] of [['equip', '🔧 Equipment'], ['decor', '🪴 Decor'], ['style', '🎨 Style']] as const) {
        const t = h('div', { class: 'tab' + (tab === k ? ' on' : '') }, name);
        t.addEventListener('click', () => {
          tab = k;
          this.audio.play('click');
          render();
        });
        tabs.append(t);
      }
      clear(body);
      if (tab === 'equip') {
        const grid = h('div', { class: 'shop-grid' });
        for (const u of UPGRADES) {
          const lvl = p.level(u.id);
          const max = u.costs.length;
          const done = lvl >= max;
          const cost = done ? 0 : u.costs[lvl];
          const rankNeed = done ? 0 : u.ranks[lvl];
          const locked = !done && p.rank < rankNeed;
          const lv = h('div', { class: 'lvl' });
          for (let i = 0; i < max; i++) lv.append(h('i', { class: i < lvl ? 'on' : '' }));
          const btn = done
            ? h('div', { class: 'owned' }, '✓ Maxed out')
            : locked
              ? h('button', { class: 'btn ghost small', disabled: true }, `🔒 Rank ${rankNeed}`)
              : h('button', { class: 'btn green small', disabled: p.data.money < cost ? true : undefined }, `Buy $${cost}`);
          if (!done && !locked)
            btn.addEventListener('click', () => {
              if (o.onBuyUpgrade(u.id)) {
                this.audio.play('buy');
                render();
              } else this.audio.play('error');
            });
          grid.append(h('div', { class: 'item' + (locked ? ' locked' : '') }, h('div', { class: 'ic' }, u.icon), h('h4', {}, u.name), h('p', {}, u.desc[Math.min(lvl, u.desc.length - 1)]), lv, btn));
        }
        body.append(grid);
      } else if (tab === 'decor') {
        const grid = h('div', { class: 'shop-grid' });
        for (const d of DECOR) {
          const owned = p.data.decor.includes(d.id);
          const locked = p.rank < d.rank;
          const btn = owned
            ? h('div', { class: 'owned' }, '✓ Placed')
            : locked
              ? h('button', { class: 'btn ghost small', disabled: true }, `🔒 Rank ${d.rank}`)
              : h('button', { class: 'btn green small', disabled: p.data.money < d.cost ? true : undefined }, `Buy $${d.cost}`);
          if (!owned && !locked)
            btn.addEventListener('click', () => {
              if (o.onBuyDecor(d.id)) {
                this.audio.play('buy');
                render();
              } else this.audio.play('error');
            });
          grid.append(h('div', { class: 'item' + (locked ? ' locked' : '') }, h('div', { class: 'ic' }, d.icon), h('h4', {}, d.name), h('p', {}, d.desc), h('small', { style: { fontWeight: '800', color: 'var(--teal-d)' } }, `+${d.comfort} comfort`), btn));
        }
        body.append(h('p', { class: 'lead' }, `Comfort ${p.comfortPoints} — cozier lobbies keep customers patient longer.`), grid);
      } else {
        for (const opt of CUSTOM_OPTIONS) {
          body.append(h('div', { class: 'section-title' }, opt.label));
          const sw = h('div', { class: 'swatches' });
          const current = (p.data.custom[opt.key] as number | undefined) ?? opt.options[0].value;
          for (const c of opt.options) {
            const owned = c.cost === 0 || p.data.owned.includes(`${opt.key}:${c.value}`);
            const s = h('div', { class: 'swatch' + (current === c.value ? ' on' : ''), title: c.name, style: { background: '#' + c.value.toString(16).padStart(6, '0') } });
            if (!owned) s.append(h('span', { class: 'price' }, `$${c.cost}`));
            s.addEventListener('click', () => {
              if (o.onCustom(opt.key, c.value, owned ? 0 : c.cost)) {
                this.audio.play(owned ? 'click' : 'buy');
                render();
              } else this.audio.play('error');
            });
            sw.append(s);
          }
          body.append(sw);
        }
      }
    };
    const el = h(
      'div',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'card modal paper-tex', style: { width: 'min(860px, calc(100vw - 32px))' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } }, h('h2', {}, 'Shop'), money),
        h('p', { class: 'lead' }, 'Invest your tips in a better burger joint.'),
        tabs,
        body,
        h('div', { class: 'actions' }, h('button', { class: 'btn yellow', onclick: () => this.click(o.onClose) }, 'Done')),
      ),
    );
    render();
    this.open(el);
  }
}

export function allCustomers(): CustomerDef[] {
  return ROSTER;
}
