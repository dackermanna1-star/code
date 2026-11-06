// Main menu: title over an animated backdrop; Continue / New Game / Settings / Controls / Credits.
import { getItemDef } from '../../items/items.js';
import { h, add, clear, setClass, timeAgo } from '../dom.js';
import { pixelImg, PIXEL_ICONS } from '../pixel.js';
import { Backdrop } from './backdrop.js';
import { SettingsView, ControlsView } from './SettingsView.js';

const FIRST = ['Earl', 'Mara', 'Dale', 'June', 'Wade', 'Darla', 'Cody', 'Loretta', 'Boyd', 'Tammy', 'Hank', 'Rhonda',
  'Travis', 'Della', 'Luke', 'Opal', 'Jesse', 'Wanda', 'Clint', 'Nora', 'Rusty', 'Faye', 'Billy', 'Shelby'];
const LAST = ['Whitaker', 'Collins', 'Hollis', 'Baker', 'Pruitt', 'Mayfield', 'Combs', 'Slone', 'Caudill', 'Ritchie',
  'Hatfield', 'Napier', 'Sizemore', 'Gibbs', 'Tackett', 'Fugate', 'Bowling', 'Messer', 'Couch', 'Turner'];

export const VERSION = 'v0.1.0';

export class MainMenu {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.screen = 'main';
    this.backdrop = new Backdrop({ particles: true });
    this.build();
  }

  build() {
    const ui = this.ui;
    this.title = h('div.menu-title-wrap',
      h('div.menu-title', { attrs: { 'data-text': 'DEAD COUNTY' } }, 'DEAD COUNTY'),
      h('div.menu-tag', 'Millbrook, Kentucky · October'));

    // main buttons
    this.saveInfo = h('span.save-info');
    this.continueBtn = ui.button('Continue', () => { this.game.continueGame?.(); }, 'btn-menu btn-continue');
    this.continueBtn.appendChild(this.saveInfo);
    this.mainScreen = h('div.menu-screen.ms-main',
      h('div.menu-buttons',
        this.continueBtn,
        ui.button('New Game', () => this.show('newgame'), 'btn-menu'),
        ui.button('Settings', () => this.show('settings'), 'btn-menu'),
        ui.button('Controls', () => this.show('controls'), 'btn-menu'),
        ui.button('Credits', () => this.show('credits'), 'btn-menu')));

    // new game
    this.buildNewGame();

    this.settings = new SettingsView(ui, () => this.show('main'));
    this.controls = new ControlsView(ui, () => this.show('main'));
    this.settingsScreen = h('div.menu-screen.ms-settings', this.settings.el);
    this.controlsScreen = h('div.menu-screen.ms-controls', this.controls.el);
    this.creditsScreen = h('div.menu-screen.ms-credits', h('div.panel-box.credits-box',
      h('div.pb-title', 'Credits'),
      h('div.credits',
        h('p.cr-lead', 'Dead County'),
        h('p', 'A voxel survival game about the last days of Millbrook, Kentucky.'),
        h('div.cr-sec', h('b', 'Inspired by'), h('span', 'Minecraft · DayZ · Project Zomboid')),
        h('div.cr-sec', h('b', 'Built with'), h('span', 'Three.js · Vite · Web Audio')),
        h('div.cr-sec', h('b', 'Fonts'), h('span', 'VT323 by Peter Hull · Silkscreen by Jason Kottke')),
        h('div.cr-sec', h('b', 'Everything else'), h('span', 'Procedurally generated, block by block')),
        h('p.cr-quote', '“This is how you died.”')),
      h('div.pb-foot', ui.button('Back', () => this.show('main'), 'btn-wide'))));

    this.screens = {
      main: this.mainScreen, newgame: this.ngScreen, settings: this.settingsScreen,
      controls: this.controlsScreen, credits: this.creditsScreen,
    };
    this.content = h('div.menu-content', this.title, ...Object.values(this.screens));
    this.el = h('div.menu.hidden', this.backdrop.el, this.content,
      h('div.menu-foot', h('span', VERSION + ' · early access'), h('span.menu-foot-r', 'Stay quiet. Stay alive.')));
  }

  buildNewGame() {
    const ui = this.ui;
    this.nameInput = h('input.text-input', { type: 'text', maxLength: 24, spellcheck: false, placeholder: 'Survivor name' });
    this.seedInput = h('input.text-input', { type: 'text', maxLength: 32, spellcheck: false, placeholder: 'Random' });
    const dice = h('button.btn.btn-icon', { type: 'button', title: 'Random name' }, '⚄');
    dice.addEventListener('click', () => { this.nameInput.value = randomName(); ui.sound('ui_click'); });
    this.profGrid = h('div.prof-grid');
    this.profDetail = h('div.prof-detail');
    this.startBtn = ui.button('Start', () => this.start(), 'btn-primary btn-wide');
    this.ngScreen = h('div.menu-screen.ms-newgame', h('div.panel-box.ng-box',
      h('div.pb-title', 'New survivor'),
      h('div.ng-body',
        h('div.ng-left',
          h('div.field', h('label', 'Name'), h('div.field-row', this.nameInput, dice)),
          h('div.field', h('label', 'Profession')),
          this.profGrid,
          h('div.field', h('label', 'World seed ', h('small', '(optional)')), this.seedInput)),
        this.profDetail),
      h('div.pb-foot', ui.button('Back', () => this.show('main'), 'btn-wide'), h('div.ft-spacer'), this.startBtn)));
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.start(); });
    this.seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.start(); });
  }

  renderProfessions() {
    clear(this.profGrid);
    const profs = this.game.PROFESSIONS || [];
    if (!this.prof || !profs.find((p) => p.id === this.prof)) this.prof = profs[0]?.id;
    for (const p of profs) {
      const card = h('button.prof-card' + (p.id === this.prof ? '.on' : ''), { type: 'button' },
        h('div.prof-ico', pixelImg(PIXEL_ICONS['p_' + p.id] ? 'p_' + p.id : 'p_unemployed', 'pi')),
        h('span.prof-name', p.name));
      card.addEventListener('click', () => {
        this.prof = p.id;
        this.ui.sound('ui_click');
        for (const c of this.profGrid.children) c.classList.toggle('on', c === card);
        this.renderProfDetail();
      });
      card.addEventListener('pointerenter', () => this.ui.sound('ui_hover', 0.25));
      this.profGrid.appendChild(card);
    }
    this.renderProfDetail();
  }

  renderProfDetail() {
    clear(this.profDetail);
    const p = (this.game.PROFESSIONS || []).find((x) => x.id === this.prof);
    if (!p) return;
    const skills = this.game.SKILLS || {};
    const sk = Object.entries(p.skills || {});
    const items = (p.startItems || []).map(([id, n]) => {
      const d = getItemDef(id);
      const name = d.id === 'unknown' ? id.replace(/_/g, ' ') : d.name;
      return `${name}${n > 1 ? ' ×' + n : ''}`;
    });
    add(this.profDetail,
      h('div.pd-head', h('div.pd-ico', pixelImg(PIXEL_ICONS['p_' + p.id] ? 'p_' + p.id : 'p_unemployed', 'pi')),
        h('div', h('div.pd-name', p.name), h('div.pd-desc', p.desc || ''))),
      h('div.cd-sec-title', 'Traits'),
      h('div.pd-perks', (p.perks || []).map((t) => h('div.perk', h('i'), t))),
      sk.length ? h('div.cd-sec-title', 'Starting skills') : null,
      sk.length ? h('div.pd-skills', sk.map(([id, lv]) => h('div.pd-skill', h('span', skills[id]?.name || id),
        h('span.pd-pips', Array.from({ length: 10 }, (_, i) => h('i' + (i < lv ? '.on' : '')))))))
        : null,
      items.length ? h('div.cd-sec-title', 'Starting gear') : null,
      items.length ? h('div.pd-items', items.join(' · ')) : null,
    );
  }

  start() {
    const name = this.nameInput.value.trim() || randomName();
    const seed = this.seedInput.value.trim();
    this.ui.sound('ui_click');
    try { this.game.newGame?.({ name, seed, profession: this.prof }); } catch (e) { console.error('newGame failed', e); }
  }

  async refreshSave() {
    const g = this.game;
    let has = false, info = null;
    try { has = !!(await g.hasSave?.()); } catch { has = false; }
    if (has) { try { info = await g.getSaveInfo?.(); } catch { info = null; } }
    setClass(this.continueBtn, 'hidden', !has);
    if (info) {
      const prof = (g.PROFESSIONS || []).find((p) => p.id === info.profession)?.name || info.profession || '';
      const parts = [info.name, prof, info.day != null ? `Day ${info.day}` : null, info.savedAt ? timeAgo(info.savedAt) : null].filter(Boolean);
      this.saveInfo.textContent = parts.join(' · ');
    } else this.saveInfo.textContent = '';
  }

  show(screen = 'main') {
    this.screen = screen;
    for (const [k, el] of Object.entries(this.screens)) setClass(el, 'hidden', k !== screen);
    setClass(this.title, 'small', screen !== 'main');
    if (screen === 'newgame') {
      if (!this.nameInput.value) this.nameInput.value = randomName();
      this.renderProfessions();
      setTimeout(() => this.nameInput.focus(), 30);
    } else if (screen === 'settings') this.settings.render();
    else if (screen === 'main') this.refreshSave();
  }

  open(screen = 'main') {
    setClass(this.el, 'hidden', false);
    this.backdrop.start();
    this.show(screen);
  }

  close() {
    setClass(this.el, 'hidden', true);
    this.backdrop.stop();
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  /** Esc → back to main screen. Returns true if consumed. */
  back() {
    if (this.screen !== 'main') { this.show('main'); this.ui.sound('ui_close'); return true; }
    return false;
  }
}

export function randomName() {
  const f = FIRST[Math.floor(Math.random() * FIRST.length)];
  const l = LAST[Math.floor(Math.random() * LAST.length)];
  return `${f} ${l}`;
}
