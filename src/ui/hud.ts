import * as THREE from 'three';
import './hud.css';
// (the chapter select is styled with the story's sheet)
import '../story/story.css';
import type { Game } from '../game';
import { PRESETS, QualityName, saveSettings, Settings } from '../core/settings';
import { STYLES } from '../combat/styles';
import { MAPS } from '../world/arena';
import { MAX_CHARGES, MAX_SPECIAL, SPECIAL_KOS } from '../combat/player';
import { PERFECT_WINDOW } from '../ai/archetypes';
import type { Replay } from '../replay/replay';
import type { Story } from '../story/runner';
import { CHAPTERS, LOCKED_CHAPTERS } from '../story/chapters';
import { fmtTime, launchStory, loadProgress } from '../story/save';

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const BOLT = '<svg viewBox="0 0 24 24"><path d="M14.6 1 3.8 13.6h6.4L8.5 23 20.2 9.4h-6.4z"/></svg>';
const WARN = '<svg viewBox="0 0 24 24"><path d="M12 1.6.7 21.6h22.6zm-1.3 6.6h2.6l-.45 7.2h-1.7zM12 16.7a1.45 1.45 0 1 1 0 2.9 1.45 1.45 0 0 1 0-2.9z"/></svg>';
const CHEVRON = '<svg viewBox="0 0 18 12"><path d="M0 0h18L9 12z"/></svg>';

const CONTROLS: [string[], string][] = [
  [['WASD'], 'Move (camera relative)'],
  [['MOUSE'], 'Camera · click to lock the pointer'],
  [['LMB'], 'Strike — aim with movement, chain between enemies'],
  [['RMB'], 'Counter when the bolt shows (late = perfect)'],
  [['RMB', 'HOLD'], 'Block (drains guard)'],
  [['SPACE'], 'Dodge · towards an enemy = vault over'],
  [['Q'], 'Stun strike — opens brutes and guards'],
  [['E'], 'Grab (LMB knee, E throw) · pick up weapon'],
  [['F'], 'Finisher (uses a charge) · ground takedown'],
  [['R'], 'Special — Scarlet\'s pistol (loads with knockouts)'],
  [['G'], 'Throw the weapon in your hand'],
  [['ESC'], 'Pause'],
];

const TIERS: [number, string][] = [
  [35, 'UNSTOPPABLE'],
  [20, 'SAVAGE'],
  [10, 'BRUTAL'],
  [5, 'FLOWING'],
];

type MenuId = 'title' | 'pause' | 'settings' | 'controls' | 'gameover' | 'arenas' | 'fighters' | 'storymenu' | 'storydead' | 'storyend';
/** Menus that Esc / Backspace leave by their last button. */
const BACKABLE = new Set<string>(['settings', 'controls', 'arenas', 'fighters', 'storymenu']);
/** The death screens' line: why she gets back up. */
const GET_UP = ['Ivy is still out there.', 'The trucks leave at dawn.', 'Not tonight. Not like this.', 'Get up, Scar.', 'They don\'t get to keep her.'];

export class HUD {
  root = el('div');
  menus: Record<string, HTMLElement> = {};
  // player block
  private pl = el('div', 'pl');
  private hpNum = el('span');
  private hpFill = el('i', 'fill');
  private hpGhost = el('i', 'ghost');
  private gdBar = el('div', 'gdbar');
  private gdFill = el('i');
  private pipsEl = el('div', 'pips');
  private pips: HTMLElement[] = [];
  private pipsTxt = el('em', '', 'FINISHER READY');
  /** The special ability's meter (Scarlet's pistol): a pip per charge, filling with knockouts. */
  private spEl = el('div', 'pips sp');
  private spPips: HTMLElement[] = [];
  private spTxt = el('em', '', 'PISTOL');
  // wave block
  private waveB = el('b');
  private scoreEl = el('div', 'sc');
  private leftB = el('b');
  private bodiesB = el('b');
  private leftWrap = el('span', 'left');
  // combo
  private comboEl = el('div', 'combo');
  private comboN = el('b', 'n');
  private comboTier = el('span', 'tier');
  private comboMult = el('span', 'mult');
  private comboT = el('i');
  private cend = el('div', 'cend');
  // transient
  private feedEl = el('div', 'feed');
  private toastEl = el('div', 'toast');
  private banner = el('div', 'banner');
  private bossEl = el('div', 'boss');
  private bossName = el('div', 'bn');
  private bossFill = el('i', 'fill');
  private bossGhost = el('i', 'ghost');
  private bossBar = el('div', 'bb');
  private hintEl = el('div', 'hint');
  private promptEl = el('div', 'prompt');
  private fpsEl = el('div', 'fps');
  private dmgEl = el('div', 'dmg');
  private indPool: HTMLElement[] = [];
  private edgePool: HTMLElement[] = [];
  private hitPool: HTMLElement[] = [];
  private hitNext = 0;
  // state
  private toastT = 0;
  private hintT = 0;
  private bannerT = 0;
  private lastCombo = 0;
  private lastHp = -1;
  private ghostHp = 100;
  private ghostHold = 0;
  private scoreShown = 0;
  private bossKey = '';
  private bossGhostV = 1;
  private bossHold = 0;
  private lastBossHp = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsVal = 0;
  private runTime = 0;
  private shownHints = new Set<string>();
  private settingsFrom: MenuId = 'title';
  private trEl: HTMLElement | null = null;
  /** The menu the replay and the spectator camera come back to. */
  resultsId: MenuId = 'gameover';
  private settingsTab = 'graphics';
  private current: string | null = null;

  constructor(public game: Game) {
    this.root.id = 'hud';
    // ---- player block
    const lbl = el('div', 'lbl');
    lbl.append(el('b', '', 'HEALTH'), this.hpNum);
    const hpBar = el('div', 'hpbar');
    hpBar.append(this.hpGhost, this.hpFill, el('s'));
    this.gdBar.append(this.gdFill);
    for (let i = 0; i < MAX_CHARGES; i++) {
      const s = el('span');
      s.append(el('i'));
      this.pips.push(s);
      this.pipsEl.append(s);
    }
    this.pipsEl.append(this.pipsTxt);
    const gun = el('b', 'gunico');
    gun.innerHTML = '<svg viewBox="0 0 32 20" width="26" height="16"><path d="M2 3h26v5H14l-1 2h-3l-2 8H3l3-10H2z" fill="currentColor"/></svg>';
    this.spEl.append(gun);
    for (let i = 0; i < MAX_SPECIAL; i++) {
      const s = el('span');
      s.append(el('i'));
      this.spPips.push(s);
      this.spEl.append(s);
    }
    this.spEl.append(this.spTxt);
    this.pl.append(lbl, hpBar, this.gdBar, this.pipsEl, this.spEl);
    // ---- wave block
    const tr = el('div', 'tr');
    this.trEl = tr;
    const wv = el('div', 'wv');
    wv.append(el('small', '', 'WAVE'), this.waveB);
    const cnt = el('div', 'cnt');
    this.leftWrap.append(this.leftB, document.createTextNode('LEFT'));
    const bodies = el('span', 'bodies');
    bodies.append(this.bodiesB, document.createTextNode('BODIES'));
    cnt.append(this.leftWrap, bodies);
    tr.append(wv, this.scoreEl, cnt);
    // ---- combo
    const row = el('div', 'row');
    const meta = el('div', 'meta');
    meta.append(el('span', 'hits', 'HIT COMBO'), this.comboTier, this.comboMult);
    row.append(this.comboN, meta);
    const ct = el('div', 't');
    ct.append(this.comboT);
    this.comboEl.append(row, ct);
    // ---- boss
    this.bossBar.append(this.bossGhost, this.bossFill);
    this.bossEl.append(this.bossName, this.bossBar);
    this.root.append(this.dmgEl, this.pl, tr, this.feedEl, this.comboEl, this.cend, this.toastEl, this.banner, this.bossEl, this.hintEl, this.promptEl, this.fpsEl);
    document.body.append(this.root);
    this.buildMenus();
    game.player.onComboBreak = (n) => this.comboEnd(n);
  }

  // ------------------------------------------------------------------ menus
  private mk(id: MenuId, cls = '') {
    const m = el('div', 'menu ' + cls);
    m.id = id;
    m.append(el('div', 'shade'));
    const col = el('div', 'col');
    m.append(col);
    document.body.append(m);
    this.menus[id] = m;
    return col;
  }

  private btn(label: string, on: () => void, cls = '', sound: 'ok' | 'back' = 'ok') {
    const b = el('button', cls, label) as HTMLButtonElement;
    b.onclick = () => {
      this.game.audio.ui(sound);
      on();
    };
    b.onmouseenter = () => {
      if (document.activeElement !== b) {
        b.focus({ preventScroll: true });
        this.game.audio.ui('move');
      }
    };
    b.onfocus = () => {
      for (const x of b.parentElement?.children ?? []) x.classList.toggle('sel', x === b);
    };
    return b;
  }

  private buildMenus() {
    const g = this.game;
    // ---- title
    const t = this.mk('title');
    t.append(el('div', 'kick', 'A FREE-FLOW COMBAT SIMULATOR'));
    t.append(el('h1', '', 'LAST<span>STANCE</span>'));
    t.append(el('div', 'tag', 'ONE FIGHTER · ENDLESS ENEMIES · NO MERCY'));
    const tl = el('div', 'mlist');
    // the arena: cycling it rebuilds the world (a reload, straight back to this screen)
    const mi = Math.max(0, MAPS.findIndex((m) => m.id === g.settings.map));
    const me = STYLES[g.settings.fighter] ?? STYLES.jin;
    tl.append(
      this.btn('STORY<small>SCARLET: BEFORE DAWN</small>', () => this.openStory(), 'primary'),
      this.btn('ENDLESS<small>THE WAVES, THEN FOREVER</small>', () => g.beginRun()),
      this.btn(`FIGHTER<small>${me.name} · ${me.tag}</small>`, () => this.show('fighters')),
      this.btn(`ARENA<small>${MAPS[mi].name}</small>`, () => this.show('arenas')),
      this.btn('SETTINGS', () => this.openSettings('title')),
      this.btn('CONTROLS', () => this.show('controls')),
    );
    t.append(tl);
    t.append(el('div', 'arena-blurb', MAPS[mi].blurb.toUpperCase()));
    const best = el('div', 'best');
    best.id = 'bestline';
    t.append(best);
    const tf = el('div', 'foot', '<span>A story of one night · five arenas · 15 waves and their bosses, then endless · bodies and blood never disappear</span><span><b>CLICK</b> LOCKS THE MOUSE · <b>ESC</b> PAUSES</span>');
    this.menus.title.append(tf);
    // ---- arenas: pick one (the world is rebuilt: a reload, straight back to the title)
    const ar = this.mk('arenas', 'blur');
    ar.append(el('div', 'kick', 'WHERE TO FIGHT'));
    ar.append(el('h2', '', 'ARENA'));
    const al = el('div', 'mlist');
    for (const m of MAPS) {
      const b = this.btn(`${m.name}<small>${m.blurb.toUpperCase()}</small>`, () => {
        if (m.id === g.settings.map) return this.show('title');
        g.settings.map = m.id;
        saveSettings(g.settings);
        location.reload();
      }, m.id === g.settings.map ? 'primary' : '');
      al.append(b);
    }
    al.append(this.btn('BACK', () => this.show('title'), '', 'back'));
    ar.append(al);
    // ---- fighters: who fights (a reload, straight back to the title with them in it)
    const fr = this.mk('fighters', 'blur');
    fr.append(el('div', 'kick', 'WHO FIGHTS'));
    fr.append(el('h2', '', 'FIGHTER'));
    const fl = el('div', 'mlist');
    for (const f of Object.values(STYLES)) {
      fl.append(this.btn(`${f.name} · ${f.tag}<small>${f.blurb.toUpperCase()}</small>`, () => {
        if (f.id === g.settings.fighter) return this.show('title');
        g.settings.fighter = f.id;
        saveSettings(g.settings);
        location.reload();
      }, f.id === g.settings.fighter ? 'primary' : ''));
    }
    fl.append(this.btn('BACK', () => this.show('title'), '', 'back'));
    fr.append(fl);
    // ---- controls
    const c = this.mk('controls', 'blur');
    c.classList.add('wide');
    c.append(el('div', 'kick', 'HOW TO FIGHT'));
    c.append(el('h2', '', 'CONTROLS'));
    const keys = el('div', 'keys');
    for (const [ks, desc] of CONTROLS) keys.append(el('div', '', ks.map((k) => `<kbd>${k}</kbd>`).join('') + `<span>${desc}</span>`));
    keys.append(el('div', 'pad', 'GAMEPAD &nbsp;<kbd>X</kbd>strike <kbd>Y</kbd>counter <kbd>A</kbd>dodge <kbd>B</kbd>stun <kbd>RB</kbd>grab <kbd>LB</kbd>finisher <kbd>RT</kbd>special <kbd>LT</kbd>block'));
    c.append(keys);
    const cl = el('div', 'mlist');
    cl.append(this.btn('BACK', () => this.show(g.started && !g.over ? 'pause' : 'title'), '', 'back'));
    c.append(cl);
    // ---- pause
    const p = this.mk('pause', 'blur');
    p.append(el('div', 'kick', 'RUN IN PROGRESS'));
    p.append(el('h2', '', 'PAUSED'));
    const rs = el('div', 'runstats');
    rs.id = 'runstats';
    p.append(rs);
    const pl = el('div', 'mlist');
    pl.append(
      this.btn('RESUME', () => g.setPaused(false), 'primary'),
      this.btn('SETTINGS', () => this.openSettings('pause')),
      this.btn('CONTROLS', () => this.show('controls')),
      this.btn('RESTART', () => this.restart(true)),
      this.btn('QUIT TO TITLE', () => this.restart(false), '', 'back'),
    );
    p.append(pl);
    // ---- settings (rebuilt on open)
    this.mk('settings', 'blur').classList.add('wide');
    // ---- results
    const go = this.mk('gameover', 'blur');
    go.classList.add('wide');
    go.id = 'gocol';
    // ---- the story: its chapters, her death, a chapter's end (filled when opened)
    this.mk('storymenu', 'blur').classList.add('wide');
    this.menus.storymenu.id = 'storymenu';
    this.mk('storydead', 'blur');
    this.mk('storyend', 'blur').classList.add('wide');
    try {
      if (sessionStorage.getItem('last-stance-open-story') === '1') {
        sessionStorage.removeItem('last-stance-open-story');
        requestAnimationFrame(() => this.openStory());
      }
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ the story
  /** The chapter select: continue, the chapters open so far (best grades), the ones to come. */
  openStory() {
    const col = this.menus.storymenu.querySelector('.col') as HTMLElement;
    col.innerHTML = '';
    const pr = loadProgress();
    col.append(el('div', 'kick', 'A LAST STANCE STORY'));
    col.append(el('h2', '', 'BEFORE DAWN'));
    col.append(el('div', 'synopsis', 'Scarlet used to work nights guarding a lab that pays cash and asks nothing. Tonight her little sister <b>Ivy</b> didn\'t come home from her shift at <b>the Lantern</b> — the KX Crew\'s club. The crew pays its debts in people. <b>The trucks leave at dawn.</b>'));
    const cleared = Object.keys(pr.best).length;
    col.append(el('div', 'stline', `CHAPTERS CLEARED <b>${cleared}</b> / ${CHAPTERS.length} &nbsp;·&nbsp; DIFFICULTY <b>${this.game.settings.difficulty.toUpperCase()}</b> <span style="opacity:.6">(SETTINGS · GAMEPLAY)</span>`));
    const ml = el('div', 'mlist');
    const r = pr.resume;
    if (r && CHAPTERS[r.chapter]) {
      const c = CHAPTERS[r.chapter];
      const cpName = c.segments[r.cp]?.name ?? '';
      ml.append(this.btn(`CONTINUE<small>${c.kick} · ${c.title}${r.cp > 0 ? ` — ${cpName}` : ''}</small>`, () => launchStory({ chapter: r.chapter, cp: r.cp, state: r }), 'primary'));
    }
    CHAPTERS.forEach((c, i) => {
      const open = i <= pr.unlocked;
      const best = pr.best[c.id];
      const label = `<em class="no">${String(i).padStart(2, '0')}</em><span class="nm">${open ? c.title : '— — —'}<small>${open ? `${c.place} · ${c.clock}` : 'FINISH THE CHAPTER BEFORE'}</small></span>${best ? `<em class="gr">${best.grade}</em><small>${fmtTime(best.time)}</small>` : ''}`;
      const b = this.btn(label, () => {
        if (!open) return;
        launchStory({ chapter: i, cp: 0, state: null });
      }, !r && i === Math.min(pr.unlocked, CHAPTERS.length - 1) ? 'primary' : '');
      if (!open) b.classList.add('locked');
      ml.append(b);
    });
    for (const [i, c] of LOCKED_CHAPTERS.entries()) {
      const b = this.btn(`<em class="no">${String(CHAPTERS.length + i).padStart(2, '0')}</em><span class="nm">${c.title}<small>${c.place} · COMING SOON</small></span>`, () => undefined);
      b.classList.add('locked');
      ml.append(b);
    }
    ml.append(this.btn('BACK', () => this.show('title'), '', 'back'));
    col.append(ml);
    this.show('storymenu');
  }

  /** The story is running: its pause menu, no wave counter. */
  applyStoryMode() {
    const g = this.game;
    const col = this.menus.pause.querySelector('.col') as HTMLElement;
    col.innerHTML = '';
    const st = g.story!;
    col.append(el('div', 'kick', `${st.chapter.kick} · ${st.chapter.title}`));
    col.append(el('h2', '', 'PAUSED'));
    const rs = el('div', 'runstats');
    rs.id = 'runstats';
    col.append(rs);
    const pl = el('div', 'mlist');
    pl.append(
      this.btn('RESUME', () => g.setPaused(false), 'primary'),
      this.btn('SETTINGS', () => this.openSettings('pause')),
      this.btn('CONTROLS', () => this.show('controls')),
      this.btn('RESTART CHECKPOINT', () => st.retry()),
      this.btn('RESTART CHAPTER', () => st.restartChapter()),
      this.btn('QUIT TO TITLE', () => this.restart(false), '', 'back'),
    );
    col.append(pl);
    if (this.trEl) this.trEl.style.display = 'none';
  }

  /** She's down: back up at the checkpoint, or watch it again. */
  storyDeath(st: Story) {
    const col = this.menus.storydead.querySelector('.col') as HTMLElement;
    col.innerHTML = '';
    col.append(el('div', 'kick', `${st.chapter.kick} · ${st.chapter.title}`));
    col.append(el('h2', '', 'SCARLET IS DOWN'));
    col.append(el('div', 'quote', `${GET_UP[Math.floor(Math.random() * GET_UP.length)]}`));
    const ml = el('div', 'mlist');
    ml.append(
      this.btn(`RETRY<small>${st.cp > 0 ? 'FROM THE CHECKPOINT · ' + st.chapter.segments[st.cp].name : 'FROM THE START'}</small>`, () => st.retry(), 'primary'),
      this.btn('RESTART CHAPTER', () => st.restartChapter()),
      this.btn('REPLAY<small>THE LAST MINUTE</small>', () => this.game.openReplay()),
      this.btn('QUIT TO TITLE', () => this.restart(false), '', 'back'),
    );
    col.append(ml);
    this.resultsId = 'storydead';
    if (!this.game.spectating) this.show('storydead');
  }

  /** A chapter done: the grade, the numbers, what's next. */
  storyResults(st: Story, grade: string, stats: Record<string, string | number>, improved: boolean) {
    const c = st.chapter;
    const col = this.menus.storyend.querySelector('.col') as HTMLElement;
    col.innerHTML = '';
    col.append(el('div', 'kick', `${c.kick} COMPLETE`));
    col.append(el('h2', '', c.title));
    const res = el('div', 'res');
    const gr = el('div', 'grade', `<b>${grade}</b><span>GRADE</span>`);
    const sts = el('div', 'stats');
    Object.entries(stats).forEach(([k, v], i) => {
      const d = el('div', '', `<span>${k}</span><b>${v}</b>`);
      d.style.animationDelay = `${0.35 + i * 0.05}s`;
      sts.append(d);
    });
    res.append(gr, sts);
    col.append(res);
    if (improved) col.append(el('div', 'record', 'NEW BEST'));
    const nx = CHAPTERS[c.id + 1];
    if (c.next) col.append(el('div', 'quote', `${c.next.line}<small>NEXT · ${c.next.kick} · ${c.next.title}${nx ? '' : ' · COMING SOON'}</small>`));
    const ml = el('div', 'mlist');
    if (nx) ml.append(this.btn(`NEXT CHAPTER<small>${nx.kick} · ${nx.title}</small>`, () => launchStory({ chapter: nx.id, cp: 0, state: null }), 'primary'));
    ml.append(
      this.btn('REPLAY CHAPTER', () => st.restartChapter(), nx ? '' : 'primary'),
      this.btn('CHAPTER SELECT', () => {
        try {
          sessionStorage.setItem('last-stance-open-story', '1');
        } catch {
          /* ignore */
        }
        location.reload();
      }),
      this.btn('TITLE', () => this.restart(false), '', 'back'),
    );
    col.append(ml);
    this.show('storyend');
  }

  private restart(fight: boolean) {
    try {
      if (fight) sessionStorage.setItem('last-stance-autostart', '1');
    } catch {
      /* ignore */
    }
    location.reload();
  }

  show(id: string | null) {
    this.current = id;
    for (const [k, m] of Object.entries(this.menus)) m.classList.toggle('on', k === id);
    // (update() doesn't run while paused: step the HUD aside here too)
    this.root.style.display = this.game.started && !id && !this.game.story?.inScene ? '' : 'none';
    if (id === 'title') {
      let best = '';
      try {
        const b = JSON.parse(localStorage.getItem('last-stance-best') ?? 'null');
        if (b) best = `PERSONAL BEST &nbsp; WAVE <b>${b.wave}</b> · <b>${Number(b.score).toLocaleString()}</b> PTS · <b>${b.kills}</b> KILLS`;
      } catch {
        /* ignore */
      }
      const bl = document.getElementById('bestline');
      if (bl) bl.innerHTML = best;
    }
    if (id === 'pause') this.fillRunStats();
    if (id) {
      // focus the first entry for keyboard / gamepad navigation
      const first = this.menus[id]?.querySelector<HTMLButtonElement>('.mlist button');
      requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    }
  }

  private fillRunStats() {
    const g = this.game;
    const p = g.player;
    const rs = document.getElementById('runstats');
    if (!rs) return;
    if (g.story) {
      rs.innerHTML = [
        ['TIME', fmtTime(g.story.time)],
        ['KILLS', p.stats.kills],
        ['BEST COMBO', p.bestCombo],
        ['RETRIES', g.story.retries],
      ]
        .map(([k, v]) => `<div>${k}<b>${v}</b></div>`)
        .join('');
      return;
    }
    const mm = Math.floor(this.runTime / 60), ss = Math.floor(this.runTime % 60);
    rs.innerHTML = [
      ['WAVE', g.waves.wave],
      ['SCORE', p.score.toLocaleString()],
      ['KILLS', p.stats.kills],
      ['BEST COMBO', p.bestCombo],
      ['TIME', `${mm}:${String(ss).padStart(2, '0')}`],
    ]
      .map(([k, v]) => `<div>${k}<b>${v}</b></div>`)
      .join('');
  }

  /** Arrow keys / Enter / Esc drive whichever menu is open. */
  handleMenuKey(e: KeyboardEvent): boolean {
    if (!this.current) return false;
    const m = this.menus[this.current];
    if (!m) return false;
    const btns = [...m.querySelectorAll<HTMLButtonElement>('.mlist button')];
    if (!btns.length) return false;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      btns[(i + 1 + btns.length) % btns.length].focus({ preventScroll: true });
      this.game.audio.ui('move');
      return true;
    }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      btns[(i - 1 + btns.length) % btns.length].focus({ preventScroll: true });
      this.game.audio.ui('move');
      return true;
    }
    if (e.code === 'Escape' || e.code === 'Backspace') {
      if (BACKABLE.has(this.current)) {
        btns[btns.length - 1].click();
        return true;
      }
    }
    return false;
  }

  openSettings(from: MenuId) {
    this.settingsFrom = from;
    const col = this.menus.settings.querySelector('.col') as HTMLElement;
    col.innerHTML = '';
    col.append(el('div', 'kick', from === 'pause' ? 'RUN PAUSED' : 'OPTIONS'));
    col.append(el('h2', '', 'SETTINGS'));
    const tabs = el('div', 'tabs');
    const rows = el('div', 'rows');
    const note = el('div', 'note');
    const TABS: [string, string][] = [['graphics', 'GRAPHICS'], ['audio', 'AUDIO'], ['controls', 'CONTROLS'], ['gameplay', 'GAMEPLAY']];
    for (const [key, label] of TABS) {
      const b = el('button', key === this.settingsTab ? 'on' : '', label) as HTMLButtonElement;
      b.onclick = () => {
        this.settingsTab = key;
        this.game.audio.ui('move');
        for (const x of tabs.children) x.classList.toggle('on', x === b);
        this.fillSettings(rows, note);
      };
      tabs.append(b);
    }
    col.append(tabs, rows, note);
    const bl = el('div', 'mlist');
    bl.append(this.btn('BACK', () => this.show(this.settingsFrom), '', 'back'));
    col.append(bl);
    this.fillSettings(rows, note);
    this.show('settings');
  }

  private fillSettings(rows: HTMLElement, note: HTMLElement) {
    const g = this.game;
    const s = g.settings;
    rows.innerHTML = '';
    note.textContent = 'Blood and bodies are never removed by any setting — quality only changes resolution and effect counts.';
    const apply = (fn: (s: Settings) => void, msg = '') => {
      fn(s);
      saveSettings(s);
      g.applySettings();
      if (msg) note.textContent = msg;
    };
    const row = (label: string, ctl: HTMLElement) => {
      const r = el('div', 'row');
      const wrap = el('div', 'ctl');
      wrap.append(ctl);
      r.append(el('label', '', label), wrap);
      rows.append(r);
      return wrap;
    };
    const range = (label: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string, on: (v: number) => void) => {
      const e = document.createElement('input');
      e.type = 'range';
      e.min = String(min);
      e.max = String(max);
      e.step = String(step);
      e.value = String(val);
      const out = el('output', '', fmt(val));
      e.oninput = () => {
        out.textContent = fmt(Number(e.value));
        on(Number(e.value));
      };
      row(label, e).append(out);
    };
    const tog = (label: string, val: boolean, on: (v: boolean) => void) => {
      const e = el('div', 'tog' + (val ? ' on' : ''));
      e.onclick = () => {
        const v = !e.classList.contains('on');
        e.classList.toggle('on', v);
        g.audio.ui('move');
        on(v);
      };
      row(label, e);
    };
    const seg = (label: string, opts: string[], val: string, on: (v: string) => void) => {
      const e = el('div', 'seg');
      for (const o of opts) {
        const sp = el('span', o === val ? 'on' : '', o.toUpperCase());
        sp.onclick = () => {
          for (const x of e.children) x.classList.toggle('on', x === sp);
          g.audio.ui('move');
          on(o);
        };
        e.append(sp);
      }
      row(label, e);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    switch (this.settingsTab) {
      case 'graphics':
        seg('Quality preset', Object.keys(PRESETS), s.quality, (v) => apply((x) => (x.quality = v as QualityName), 'Shadow-map, blood-atlas and ragdoll budget changes apply after a restart.'));
        range('Render scale', 0.5, 1.25, 0.05, s.renderScale, pct, (v) => apply((x) => (x.renderScale = v)));
        tog('Dynamic resolution', s.dynamicResolution, (v) => apply((x) => (x.dynamicResolution = v)));
        tog('Shadows', s.shadows, (v) => apply((x) => (x.shadows = v)));
        tog('Bloom', s.bloom, (v) => apply((x) => (x.bloom = v)));
        tog('Film grain', s.filmGrain, (v) => apply((x) => (x.filmGrain = v)));
        tog('Impact effects (chromatic)', s.motionFx, (v) => apply((x) => (x.motionFx = v)));
        range('Camera shake', 0, 1.5, 0.05, s.cameraShake, pct, (v) => apply((x) => (x.cameraShake = v)));
        break;
      case 'audio':
        range('Master volume', 0, 1, 0.01, s.masterVolume, pct, (v) => apply((x) => (x.masterVolume = v)));
        range('Effects volume', 0, 1, 0.01, s.sfxVolume, pct, (v) => apply((x) => (x.sfxVolume = v)));
        range('Music volume', 0, 1, 0.01, s.musicVolume, pct, (v) => apply((x) => (x.musicVolume = v)));
        break;
      case 'controls':
        range('Mouse sensitivity', 0.2, 3, 0.05, s.mouseSensitivity, (v) => `${v.toFixed(2)}×`, (v) => apply((x) => (x.mouseSensitivity = v)));
        tog('Invert camera Y', s.invertY, (v) => apply((x) => (x.invertY = v)));
        break;
      case 'gameplay': {
        const DIFF_NOTE: Record<string, string> = {
          story: 'STORY — long warnings before every attack, softer hits, fewer attackers at once. Score x0.75.',
          fighter: 'FIGHTER — the intended balance.',
          brutal: 'BRUTAL — shorter warnings, harder hits, one more attacker at once. Score x1.35.',
        };
        seg('Difficulty', ['story', 'fighter', 'brutal'], s.difficulty, (v) => apply((x) => (x.difficulty = v as Settings['difficulty']), DIFF_NOTE[v]));
        tog('Active ragdolls (euphoria)', s.ragdolls === 'euphoria', (v) => apply((x) => (x.ragdolls = v ? 'euphoria' : 'classic')));
        tog('Motion-captured movement', s.mocap, (v) => apply((x) => (x.mocap = v)));
        tog('Tutorial tips', s.showHints, (v) => apply((x) => (x.showHints = v)));
        tog('FPS / stats overlay', s.fpsCounter, (v) => apply((x) => (x.fpsCounter = v)));
        break;
      }
    }
  }

  gameOver(stats: Record<string, string | number>, info: { grade?: string; record?: boolean } = {}) {
    const col = document.getElementById('gocol')!;
    col.innerHTML = '';
    col.append(el('div', 'kick', 'RUN OVER'));
    col.append(el('h2', '', 'DEFEATED'));
    const res = el('div', 'res');
    const grade = el('div', 'grade', `<b>${info.grade ?? 'C'}</b><span>RANK</span>`);
    const st = el('div', 'stats');
    Object.entries(stats).forEach(([k, v], i) => {
      const d = el('div', '', `<span>${k}</span><b>${v}</b>`);
      d.style.animationDelay = `${0.35 + i * 0.05}s`;
      st.append(d);
    });
    res.append(grade, st);
    col.append(res);
    if (info.record) col.append(el('div', 'record', 'NEW PERSONAL BEST'));
    const ml = el('div', 'mlist');
    ml.append(this.btn('FIGHT AGAIN', () => this.restart(true), 'primary'), this.btn('REPLAY', () => this.game.openReplay()), this.btn('SPECTATE', () => this.game.startSpectate()), this.btn('TITLE', () => this.restart(false), '', 'back'));
    col.append(ml);
    // (already flying round the room: the results wait for Esc)
    if (!this.game.spectating) this.show('gameover');
  }

  /** Spectating: the fight's HUD steps aside for a small line of controls. */
  private spectEl: HTMLElement | null = null;
  setSpectate(on: boolean) {
    if (!this.spectEl) {
      this.spectEl = el('div', 'spectate', '<b>SPECTATING</b><span>WASD fly</span><span>MOUSE look</span><span>E / Q · SPACE up / down</span><span>SHIFT fast</span><span>ESC results</span>');
      document.body.append(this.spectEl);
    }
    this.spectEl.classList.toggle('on', on);
    this.root.classList.toggle('spectating', on);
    if (on) this.root.style.display = 'none';
  }

  /** Watching the replay: a timeline (click to jump), the clock, speed and camera, the keys. */
  private replayEl: HTMLElement | null = null;
  private replayParts: { state: HTMLElement; time: HTMLElement; rel: HTMLElement; speed: HTMLElement; cam: HTMLElement; fill: HTMLElement; mark: HTMLElement } | null = null;
  setReplay(on: boolean) {
    if (!this.replayEl) {
      const root = el('div', 'replay');
      const top = el('div', 'rtop');
      const state = el('b', 'rstate');
      const time = el('span', 'rtime');
      const rel = el('span', 'rrel');
      const speed = el('span', 'rspeed');
      const cam = el('span', 'rcam');
      top.append(el('b', 'rtitle', 'REPLAY'), state, time, rel, speed, cam);
      const bar = el('div', 'rbar');
      const fill = el('div', 'rfill');
      const mark = el('div', 'rmark');
      bar.append(fill, mark);
      // (click / drag along the bar: jump there)
      const seek = (e: PointerEvent) => {
        const r = bar.getBoundingClientRect();
        const rp = this.game.replay;
        rp.seek(rp.start + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * rp.length);
      };
      bar.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        bar.setPointerCapture(e.pointerId);
        seek(e);
      });
      bar.addEventListener('pointermove', (e) => {
        if (bar.hasPointerCapture(e.pointerId)) seek(e);
      });
      const keys = el('div', 'rkeys', '<span><b>SPACE</b> play / pause</span><span><b>← →</b> 5 s</span><span><b>, .</b> frame</span><span><b>↑ ↓</b> speed</span><span><b>C</b> camera</span><span><b>WASD · MOUSE</b> fly (click)</span><span><b>E / Q</b> up / down</span><span><b>ESC</b> results</span>');
      root.append(top, bar, keys);
      document.body.append(root);
      this.replayEl = root;
      this.replayParts = { state, time, rel, speed, cam, fill, mark };
    }
    this.replayEl.classList.toggle('on', on);
    this.root.classList.toggle('spectating', on);
    if (on) this.root.style.display = 'none';
  }
  updateReplay(r: Replay) {
    const p = this.replayParts;
    if (!p) return;
    const len = Math.max(1e-3, r.length);
    const at = r.t - r.start;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
    p.state.textContent = r.playing ? '▶' : '❚❚';
    p.time.textContent = `${fmt(at)} / ${fmt(len)}`;
    const toFall = r.t - r.deathT;
    p.rel.textContent = Number.isFinite(toFall) ? (toFall < 0 ? `${(-toFall).toFixed(1)} s before the fall` : toFall < 0.05 ? 'the fall' : `${toFall.toFixed(1)} s after`) : '';
    p.speed.textContent = `${r.speed}×`;
    p.cam.textContent = r.cam === 'free' ? 'FREE CAMERA' : 'GAME CAMERA';
    p.fill.style.width = `${(at / len) * 100}%`;
    const df = (r.deathT - r.start) / len;
    p.mark.style.display = Number.isFinite(df) && df >= 0 && df <= 1 ? 'block' : 'none';
    p.mark.style.left = `${df * 100}%`;
  }

  // ------------------------------------------------------------------ transient
  toast(text: string, color = '#fff', dur = 1.1) {
    const t = this.toastEl;
    t.textContent = text;
    t.style.color = color;
    t.style.setProperty('--dur', `${dur + 0.25}s`);
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    this.toastT = dur + 0.25;
  }

  /** Small stacked notices on the left (secondary events). */
  feed(text: string, sub = '') {
    const it = el('div', 'it', `${text}${sub ? `<span>${sub}</span>` : ''}`);
    this.feedEl.append(it);
    while (this.feedEl.children.length > 5) this.feedEl.firstElementChild?.remove();
    setTimeout(() => it.classList.add('out'), 1900);
    setTimeout(() => it.remove(), 2450);
  }

  bannerShow(big: string, sub = '', dur = 2.4, kick = '', boss = false) {
    const b = this.banner;
    b.innerHTML = `${kick ? `<div class="kick">${kick}</div>` : ''}<div class="big">${big}</div><div class="slash"></div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    b.classList.toggle('boss', boss);
    b.style.setProperty('--dur', `${dur}s`);
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    this.bannerT = dur;
  }

  hint(text: string, key?: string, dur = 6) {
    if (!this.game.settings.showHints) return;
    if (key) {
      if (this.shownHints.has(key)) return;
      this.shownHints.add(key);
    }
    // (the story teaches with its own prompts, at its own moments)
    if (this.game.story) return;
    this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    this.hintT = dur;
  }

  flashFinisherReady() {
    this.toast('FINISHER READY', '#ffcf4a', 1.0);
    this.game.audio.play('announcer', { file: 'audio/announcer/announcer_combo.wav', vol: 0.5 });
  }

  private comboEnd(n: number) {
    if (n < 5) return;
    let tier = '';
    for (const [k, w] of TIERS) if (n >= k) {
      tier = w;
      break;
    }
    this.cend.innerHTML = `${tier || 'COMBO'}<b>${n} HITS</b>`;
    this.cend.classList.remove('on');
    void this.cend.offsetWidth;
    this.cend.classList.add('on');
  }

  /** Red arc on the screen edge pointing at whoever just hit the player. */
  damageFrom(x: number, z: number) {
    const g = this.game;
    const cam = g.cam.camera;
    const fwd = cam.getWorldDirection(_v).setY(0).normalize();
    const rx = -fwd.z, rz = fwd.x;
    const dx = x - g.player.x, dz = z - g.player.z;
    const ang = Math.atan2(dx * rx + dz * rz, dx * fwd.x + dz * fwd.z);
    while (this.hitPool.length < 4) {
      const d = el('div', 'hitdir');
      this.root.append(d);
      this.hitPool.push(d);
    }
    const d = this.hitPool[this.hitNext++ % this.hitPool.length];
    d.style.transform = `rotate(${ang}rad)`;
    d.classList.remove('on');
    void d.offsetWidth;
    d.classList.add('on');
  }

  private ind(i: number) {
    while (this.indPool.length <= i) {
      const d = el('div', 'ind', '<div class="ring"></div><div class="ic"></div>');
      d.style.display = 'none';
      this.root.append(d);
      this.indPool.push(d);
    }
    return this.indPool[i];
  }
  private edge(i: number) {
    while (this.edgePool.length <= i) {
      const d = el('div', 'edge', '<i></i>');
      d.style.display = 'none';
      this.root.append(d);
      this.edgePool.push(d);
    }
    return this.edgePool[i];
  }

  update(dt: number, realDt: number) {
    const g = this.game;
    const p = g.player;
    // the HUD steps aside while a menu (pause, settings, controls, results) is up
    this.root.style.display = g.started && !this.current && !g.spectating && !g.story?.inScene ? '' : 'none';
    if (g.started && !g.paused && !g.over) this.runTime += realDt;
    // ---- health (with a trailing "ghost" of recent damage)
    const maxHp = p.maxHp;
    if (this.lastHp < 0) this.lastHp = this.ghostHp = p.hp;
    if (p.hp < this.lastHp - 0.01) this.ghostHold = 0.5;
    else if (p.hp > this.lastHp + 1.5) {
      this.ghostHp = p.hp;
      this.hpFill.classList.remove('heal');
      void this.hpFill.offsetWidth;
      this.hpFill.classList.add('heal');
    }
    this.lastHp = p.hp;
    if (this.ghostHold > 0) this.ghostHold -= realDt;
    else this.ghostHp = Math.max(p.hp, this.ghostHp - maxHp * 0.55 * realDt);
    this.ghostHp = Math.max(this.ghostHp, p.hp);
    const hpF = Math.max(0, p.hp / maxHp);
    this.hpFill.style.width = `${hpF * 100}%`;
    this.hpGhost.style.width = `${Math.max(0, this.ghostHp / maxHp) * 100}%`;
    this.hpNum.textContent = String(Math.max(0, Math.ceil(p.hp)));
    this.pl.classList.toggle('low', hpF < 0.3 && p.alive);
    this.gdFill.style.width = `${Math.max(0, p.guard)}%`;
    this.gdBar.classList.toggle('broken', p.guard < 5);
    const need = p.chargeNeed;
    this.pips.forEach((s, i) => {
      s.classList.toggle('on', i < p.charges);
      const prog = i === p.charges ? Math.min(1, p.chargeProgress / need) : 0;
      s.style.setProperty('--p', `${prog * 100}%`);
    });
    const cool = p.execCd > 0;
    this.pipsEl.classList.toggle('ready', p.charges > 0 && !cool);
    this.pipsEl.classList.toggle('cool', cool && p.charges > 0);
    const txt = cool ? 'RECOVERING' : 'FINISHER READY';
    if (this.pipsTxt.textContent !== txt) this.pipsTxt.textContent = txt;
    // ---- special (only fighters who have one)
    const hasSp = !!p.style.special && !p.specialLocked;
    this.spEl.style.display = hasSp ? '' : 'none';
    if (hasSp) {
      this.spPips.forEach((s, i) => {
        s.classList.toggle('on', i < p.specialCharges);
        const prog = i === p.specialCharges ? Math.min(1, p.specialKOs / SPECIAL_KOS) : 0;
        s.style.setProperty('--p', `${prog * 100}%`);
      });
      this.spEl.classList.toggle('ready', p.specialCharges > 0);
      const st = p.specialCharges > 0 ? 'PISTOL  R' : `PISTOL  ${p.specialKOs}/${SPECIAL_KOS} KO`;
      if (this.spTxt.textContent !== st) this.spTxt.textContent = st;
    }
    // ---- wave / score
    const w = g.waves;
    this.waveB.textContent = w.wave > 0 ? String(w.wave) : '–';
    this.scoreShown += (p.score - this.scoreShown) * Math.min(1, realDt * 9);
    if (Math.abs(p.score - this.scoreShown) < 1) this.scoreShown = p.score;
    this.scoreEl.textContent = Math.round(this.scoreShown).toLocaleString();
    const showLeft = w.wave > 0 && !w.betweenWaves;
    this.leftWrap.style.display = showLeft ? '' : 'none';
    this.leftB.textContent = String(w.remaining);
    this.bodiesB.textContent = String(g.corpses.count);
    // ---- combo
    if (p.combo >= 2) {
      this.comboEl.classList.add('on');
      if (p.combo !== this.lastCombo) {
        this.comboEl.classList.remove('pop');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('pop');
      }
      this.comboN.textContent = String(p.combo);
      let tier = '', ti = 0;
      TIERS.forEach(([k, word], idx) => {
        if (!tier && p.combo >= k) {
          tier = word;
          ti = 4 - idx;
        }
      });
      this.comboTier.textContent = tier;
      this.comboMult.textContent = `×${p.multiplier.toFixed(2)}`;
      this.comboEl.className = `combo on${this.comboEl.classList.contains('pop') ? ' pop' : ''}${ti ? ' t' + ti : ''}`;
      this.comboT.style.width = `${Math.max(0, (p.comboTimer / 2.6) * 100)}%`;
    } else this.comboEl.classList.remove('on');
    this.lastCombo = p.combo;
    // ---- boss
    const boss = g.bosses.active;
    if (boss) {
      this.bossEl.classList.add('on');
      const key = boss.cfg.key;
      const phases = boss.cfg.phases ?? 2;
      if (key !== this.bossKey) {
        this.bossKey = key;
        this.bossGhostV = this.lastBossHp = boss.hp / boss.maxHp;
        for (const m of [...this.bossBar.querySelectorAll('s')]) m.remove();
        const marks = phases === 3 ? [1 / 3, 2 / 3] : [0.5];
        for (const f of marks) {
          const s = el('s');
          s.style.left = `${f * 100}%`;
          this.bossBar.append(s);
        }
      }
      this.bossName.innerHTML = `<small>BOSS</small>${boss.cfg.label}<em>PHASE ${boss.phase}/${phases}</em>`;
      const f = Math.max(0, boss.hp / boss.maxHp);
      if (f < this.lastBossHp - 1e-4) this.bossHold = 0.6;
      this.lastBossHp = f;
      if (this.bossHold > 0) this.bossHold -= realDt;
      else this.bossGhostV = Math.max(f, this.bossGhostV - 0.4 * realDt);
      this.bossFill.style.width = `${f * 100}%`;
      this.bossGhost.style.width = `${Math.max(f, this.bossGhostV) * 100}%`;
    } else {
      this.bossEl.classList.remove('on');
      this.bossKey = '';
    }
    // ---- timers
    if (this.toastT > 0 && (this.toastT -= realDt) <= 0) this.toastEl.classList.remove('on');
    if (this.hintT > 0 && (this.hintT -= realDt) <= 0) this.hintEl.classList.remove('on');
    if (this.bannerT > 0 && (this.bannerT -= realDt) <= 0) this.banner.classList.remove('on');
    // ---- low health vignette + heartbeat
    const low = p.alive ? Math.max(0, 1 - p.hp / (maxHp * 0.35)) : 0;
    this.dmgEl.style.boxShadow = `inset 0 0 ${130 + low * 90}px rgba(150,0,0,${(low * 0.6).toFixed(2)})`;
    this.dmgEl.classList.toggle('pulse', low > 0.3);
    // ---- attack indicators (on screen) and edge arrows (off screen)
    const cam = g.cam.camera;
    const W = window.innerWidth, H = window.innerHeight;
    let n = 0, ne = 0;
    const v = _v;
    const now = g.time;
    for (const inc of g.director.incoming) {
      const e = inc.enemy;
      if (!e.alive) continue;
      e.bodyPoint('head', v);
      v.y += 0.42 * e.scale;
      v.project(cam);
      const kind = inc.counterable ? 'counter' : 'unblock';
      const onScreen = v.z < 1 && Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.92;
      if (onScreen) {
        const d = this.ind(n++);
        d.style.display = 'flex';
        if (!d.classList.contains(kind)) {
          d.className = 'ind ' + kind;
          (d.lastElementChild as HTMLElement).innerHTML = inc.counterable ? BOLT : WARN;
        }
        d.style.left = `${((v.x + 1) / 2) * W}px`;
        d.style.top = `${((1 - v.y) / 2) * H}px`;
        const total = Math.max(0.05, inc.hitTime - inc.start);
        const k = Math.max(0, Math.min(1, (inc.hitTime - now) / total));
        const ring = d.firstElementChild as HTMLElement;
        ring.style.transform = `scale(${0.6 + k * 1.15})${inc.counterable ? '' : ' rotate(45deg)'}`;
        ring.style.opacity = String(0.35 + (1 - k) * 0.65);
        // (inside the perfect-counter window: the same one the counter itself uses)
        d.classList.toggle('now', inc.counterable && inc.hitTime - now < (e.cfg.perfectWindow ?? PERFECT_WINDOW) && inc.hitTime - now > -0.06);
      } else {
        // clamp onto an ellipse inside the screen edge, arrow pointing at the attacker
        let x = v.x, y = v.y;
        if (v.z > 1) {
          x = -x;
          y = -y;
        }
        const a = Math.atan2(y, x);
        const ex = Math.cos(a) * 0.86, ey = Math.sin(a) * 0.8;
        const d = this.edge(ne++);
        d.style.display = '';
        d.className = 'edge ' + kind;
        d.style.left = `${((ex + 1) / 2) * W}px`;
        d.style.top = `${((1 - ey) / 2) * H}px`;
        (d.firstElementChild as HTMLElement).style.transform = `rotate(${Math.PI / 2 - a}rad)`;
      }
    }
    // target marker
    const t = p.target;
    if (t && t.alive && p.action !== 'free') {
      t.bodyPoint('head', v);
      v.y += 0.3 * t.scale;
      v.project(cam);
      if (v.z < 1) {
        const d = this.ind(n++);
        d.style.display = 'flex';
        if (!d.classList.contains('target')) {
          d.className = 'ind target';
          (d.lastElementChild as HTMLElement).innerHTML = CHEVRON;
        }
        (d.firstElementChild as HTMLElement).style.opacity = '0';
        d.style.left = `${((v.x + 1) / 2) * W}px`;
        d.style.top = `${((1 - v.y) / 2) * H}px`;
      }
    }
    for (let i = n; i < this.indPool.length; i++) this.indPool[i].style.display = 'none';
    for (let i = ne; i < this.edgePool.length; i++) this.edgePool[i].style.display = 'none';
    // ---- contextual prompts
    let prompt = '';
    if (p.alive && p.action === 'free') {
      const downed = p.selectTarget(2.6, (e) => e.state === 'down');
      const wp = g.weapons.find((x) => x.pickable && x.worldPos(v).distanceTo(_w.set(p.x, v.y, p.z)) < 1.4);
      if (downed && p.execCd <= 0) prompt = '<b>F</b>GROUND TAKEDOWN';
      else if (wp && !p.weapon) prompt = `<b>E</b>PICK UP ${wp.kind.toUpperCase()}`;
      else if (p.charges > 0 && p.execCd <= 0 && p.selectTarget(4)) prompt = '<b>F</b>FINISHER';
      else if (p.specialCharges > 0 && p.style.special && p.selectTarget(15)) prompt = '<b>R</b>PISTOL';
      else if (p.weapon) prompt = '<b>G</b>THROW ' + p.weapon.kind.toUpperCase();
    } else if (p.action === 'grab') prompt = '<b>LMB</b>KNEE &nbsp;&nbsp; <b>E</b>THROW';
    if (this.promptEl.innerHTML !== prompt) this.promptEl.innerHTML = prompt;
    this.promptEl.classList.toggle('on', prompt !== '');
    // ---- first-time hints
    // the first counterable attack of the session: time slows on the window while the hint teaches it
    const ctr = g.director.incoming.find((i) => i.counterable);
    if (ctr && g.settings.showHints && !this.shownHints.has('counter') && ctr.hitTime - g.time < 0.5) {
      g.slowMo(0.3, 0.75);
      this.hint('A gold bolt above an enemy: press RMB (Y) to COUNTER — at the last moment for a perfect counter.', 'counter', 7);
    }
    if (g.director.incoming.some((i) => !i.counterable)) this.hint('Red warnings cannot be countered — DODGE with SPACE (A).', 'red');
    // ---- fps / stats
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fpsVal = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (g.settings.fpsCounter || g.debug) {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      this.fpsEl.textContent =
        `${this.fpsVal.toFixed(0)} fps  scale ${g.renderer.pixelRatio.toFixed(2)}\n` +
        `corpses ${g.corpses.count}  verts ${(g.corpses.totalVerts / 1000).toFixed(0)}k  splats ${g.blood.totalSplats}\n` +
        `draws ${g.renderer.sceneStats.calls}  tris ${(g.renderer.sceneStats.triangles / 1000).toFixed(0)}k  particles ${g.fx.liveParticles}\n` +
        `ragdolls ${g.death.dying.length}  active ${g.euphoria.actives.length} (${g.euphoria.stepMs.toFixed(1)}ms x${g.euphoria.world.substeps})  weapons ${g.weapons.length}  debris ${g.fx.wood.total + g.fx.bone.total}` +
        (mem ? `\nheap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : '');
    } else if (this.fpsEl.textContent) this.fpsEl.textContent = '';
    void dt;
  }
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
