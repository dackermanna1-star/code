// DOM heads-up display: fridge, spice rack, station dock, tools, action button, labels,
// speech bubbles, meal banner, cookbook, settings and the title screen.

import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { Station } from '../stations/Station';
import type { ViewName } from '../game/CameraRig';
import type { DropTarget } from '../game/Interaction';
import type { FoodItem } from '../game/FoodItem';
import { PANTRY_TABS, pantryItems, SEASONINGS, getDef, hasDef } from '../food/catalog';
import { icon, TAB_COLORS } from './icons';
import { Thumbs } from './Thumbs';
import type { MealAnalysis } from '../recipes';
import { DISHES } from '../recipes';
import type { ToolName } from '../stations/Board';
import type { StationId } from '../world/layout';

type LabelStyle = 'good' | 'bad' | 'info';

interface FloatLabel {
  el: HTMLElement;
  pos: THREE.Vector3;
  t: number;
  life: number;
}

const DOCK: StationId[] = ['board', 'bowl', 'pan', 'grill', 'pot', 'oven', 'fryer', 'blender', 'toaster', 'microwave', 'freezer', 'plate'];
const SETTINGS_KEY = 'munchlab.settings.v1';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class Hud {
  readonly root: HTMLElement;
  readonly thumbs: Thumbs;
  private back: HTMLButtonElement;
  private title: HTMLElement;
  private fridgeTab: HTMLButtonElement;
  private pantry: HTMLElement;
  private pantryGrid: HTMLElement;
  private tabs: HTMLElement;
  private currentTab = PANTRY_TABS[0].category;
  private dock: HTMLElement;
  private dockBtns = new Map<StationId, HTMLButtonElement>();
  private tools: HTMLElement;
  private toolBtns = new Map<ToolName, HTMLButtonElement>();
  private actionBtn: HTMLButtonElement;
  private spiceBtn: HTMLButtonElement;
  private spiceRack: HTMLElement;
  private trashTarget: HTMLElement;
  private labels: FloatLabel[] = [];
  private labelLayer: HTMLElement;
  private speechEl: HTMLElement;
  private speechPos: THREE.Vector3 | null = null;
  private speechT = 0;
  private banner: HTMLElement;
  private bannerT = 0;
  private toastEl: HTMLElement;
  private toastT = 0;
  private hintEl: HTMLElement;
  private hintStep = 0;
  private hintT = 0;
  private cookbook: HTMLElement;
  private titleScreen: HTMLElement | null = null;
  private dragging = false;
  private actionHeld = false;
  private lastActionKey = '';
  private settings = { sfx: true, music: true };
  private musicBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private started = false;
  private highlightEl: HTMLElement | null = null;

  constructor(private game: Game) {
    this.thumbs = new Thumbs(game.renderer, 160);
    try {
      Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'));
    } catch {
      /* ignore */
    }
    game.audio.setSfxEnabled(this.settings.sfx);
    game.audio.setMusicEnabled(this.settings.music);

    const root = (this.root = h('div', 'hud'));
    game.container.appendChild(root);
    root.appendChild(h('div', 'vignette'));

    // top-left: back + title
    const tl = h('div', 'hud-tl');
    this.back = h('button', 'btn round back', icon('back'));
    this.back.title = 'Back to the kitchen';
    this.back.onclick = () => {
      game.audio.play('ui-close');
      game.back();
    };
    this.title = h('div', 'station-title');
    tl.append(this.back, this.title);
    root.appendChild(tl);

    // top-right: settings
    const tr = h('div', 'hud-tr');
    const bookBtn = h('button', 'btn round', icon('book'));
    bookBtn.title = 'Cookbook';
    bookBtn.onclick = () => this.openCookbook();
    this.musicBtn = h('button', 'btn round', icon(this.settings.music ? 'music' : 'musicOff'));
    this.musicBtn.title = 'Music';
    this.musicBtn.onclick = () => this.toggleMusic();
    this.soundBtn = h('button', 'btn round', icon(this.settings.sfx ? 'sound' : 'soundOff'));
    this.soundBtn.title = 'Sound effects';
    this.soundBtn.onclick = () => this.toggleSound();
    const resetBtn = h('button', 'btn round', icon('reset'));
    resetBtn.title = 'Clean the kitchen';
    resetBtn.onclick = () => this.confirmReset();
    const fullBtn = h('button', 'btn round', icon('full'));
    fullBtn.title = 'Fullscreen';
    fullBtn.onclick = () => {
      const d = document.documentElement;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void d.requestFullscreen?.().catch(() => {});
    };
    tr.append(bookBtn, this.musicBtn, this.soundBtn, resetBtn, fullBtn);
    root.appendChild(tr);

    // fridge tab + pantry panel
    this.fridgeTab = h('button', 'fridge-tab', `${icon('fridge')}<span>Fridge</span>`);
    this.fridgeTab.onclick = () => this.togglePantry();
    root.appendChild(this.fridgeTab);
    this.pantry = h('div', 'pantry');
    const ph = h('div', 'pantry-head', `<div class="pantry-title">${icon('fridge')}<span>Fridge</span></div>`);
    const close = h('button', 'btn round small', icon('close'));
    close.onclick = () => this.togglePantry(false);
    ph.appendChild(close);
    this.tabs = h('div', 'pantry-tabs');
    this.pantryGrid = h('div', 'pantry-grid');
    this.pantry.append(ph, this.tabs, this.pantryGrid);
    root.appendChild(this.pantry);
    this.buildTabs();

    // dock
    this.dock = h('div', 'dock');
    for (const id of DOCK) {
      const st = game.stations[id];
      const b = h('button', 'dock-btn', icon(st.icon));
      b.title = st.label;
      b.dataset.station = id;
      b.onclick = () => {
        game.audio.play('tap');
        game.goTo(st.view);
      };
      this.dock.appendChild(b);
      this.dockBtns.set(id, b);
    }
    root.appendChild(this.dock);

    // trash drop target (station views, while dragging)
    this.trashTarget = h('div', 'trash-target', icon('trash'));
    root.appendChild(this.trashTarget);

    // board tools
    this.tools = h('div', 'tools');
    const toolNames: [ToolName, string][] = [['knife', 'Knife'], ['peeler', 'Peeler'], ['rollingPin', 'Rolling pin'], ['masher', 'Masher']];
    for (const [t, label] of toolNames) {
      const b = h('button', 'tool-btn', `${icon(t)}<span>${label}</span>`);
      b.onclick = () => game.stations.board.selectTool(t);
      this.tools.appendChild(b);
      this.toolBtns.set(t, b);
    }
    root.appendChild(this.tools);

    // action button
    this.actionBtn = h('button', 'action-btn');
    this.actionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actionHeld = true;
      game.audio.unlock();
      const st = game.currentStation();
      st?.doAction(true);
      this.actionBtn.classList.add('pressed');
    });
    const release = () => {
      if (!this.actionHeld) return;
      this.actionHeld = false;
      this.actionBtn.classList.remove('pressed');
      game.currentStation()?.doAction(false);
    };
    this.actionBtn.addEventListener('pointerup', release);
    this.actionBtn.addEventListener('pointerleave', release);
    root.appendChild(this.actionBtn);

    // spice rack
    this.spiceBtn = h('button', 'spice-btn', `${icon('spice')}<span>Spices</span>`);
    this.spiceBtn.onclick = () => this.toggleSpices();
    root.appendChild(this.spiceBtn);
    this.spiceRack = h('div', 'spice-rack');
    root.appendChild(this.spiceRack);
    this.buildSpices();

    // labels, speech, banner, toast, hints
    this.labelLayer = h('div', 'labels');
    root.appendChild(this.labelLayer);
    this.speechEl = h('div', 'speech');
    root.appendChild(this.speechEl);
    this.banner = h('div', 'banner');
    root.appendChild(this.banner);
    this.toastEl = h('div', 'toast');
    root.appendChild(this.toastEl);
    this.hintEl = h('div', 'hint');
    root.appendChild(this.hintEl);
    this.cookbook = h('div', 'cookbook hidden');
    root.appendChild(this.cookbook);
    const rot = h('div', 'rotate-hint', 'Tip: turn your device sideways for a bigger kitchen!');
    rot.onclick = () => rot.remove();
    root.appendChild(rot);

    this.setView('overview', null);
    this.showTitle();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.cookbook.classList.contains('hidden')) this.closeCookbook();
        else if (this.pantry.classList.contains('open')) this.togglePantry(false);
        else game.back();
      }
    });
  }

  // ------------------------------------------------------------------------------------------
  // Title screen

  private showTitle() {
    const t = (this.titleScreen = h('div', 'title-screen'));
    t.innerHTML = `
      <div class="title-card">
        <div class="logo"><span class="l1">Munch</span><span class="l2">Lab</span></div>
        <div class="tagline">Cook anything. Feed Mochi. See what happens!</div>
        <button class="play">${icon('chef')}<span>Let's cook!</span></button>
        <div class="title-tips">Drag food from the fridge · tap stations to zoom in · serve the plate to Mochi</div>
      </div>`;
    this.root.appendChild(t);
    const play = t.querySelector('.play') as HTMLButtonElement;
    play.onclick = () => this.start();
  }

  private start() {
    if (this.started) return;
    this.started = true;
    const g = this.game;
    g.audio.unlock();
    g.audio.play('magic');
    if (this.settings.music) g.audio.startMusic();
    this.titleScreen?.classList.add('gone');
    setTimeout(() => this.titleScreen?.remove(), 700);
    setTimeout(() => g.character.greet(), 500);
    this.hintStep = 0;
    this.hintT = 2.5;
  }

  onUserGesture() {
    if (!this.started) return;
  }

  // ------------------------------------------------------------------------------------------
  // View changes

  setView(view: ViewName, st: Station | null) {
    const overview = view === 'overview';
    this.root.classList.toggle('in-station', !overview);
    this.back.classList.toggle('hidden', overview);
    this.title.textContent = st ? st.label : '';
    this.title.classList.toggle('hidden', !st);
    for (const [id, b] of this.dockBtns) b.classList.toggle('active', !!st && st.id === id);
    this.tools.classList.toggle('show', view === 'board');
    this.refreshAction(true);
    if (!overview) this.togglePantry(false);
  }

  onArrive() {
    this.refreshAction(true);
  }

  setTool(name: ToolName) {
    for (const [t, b] of this.toolBtns) b.classList.toggle('active', t === name);
  }

  private refreshAction(force = false) {
    const st = this.game.currentStation();
    const a = st?.action() ?? null;
    const key = a ? `${a.label}|${a.icon}|${a.active ? 1 : 0}` : '';
    if (!force && key === this.lastActionKey) return;
    this.lastActionKey = key;
    if (!a) {
      this.actionBtn.classList.remove('show');
      return;
    }
    this.actionBtn.innerHTML = `${icon(a.icon)}<span>${a.label}</span>`;
    this.actionBtn.classList.add('show');
    this.actionBtn.classList.toggle('active', !!a.active);
  }

  // ------------------------------------------------------------------------------------------
  // Pantry

  private buildTabs() {
    this.tabs.innerHTML = '';
    for (const t of PANTRY_TABS) {
      const b = h('button', 'tab', `<img alt=""><span>${t.label}</span>`);
      b.style.setProperty('--tab', TAB_COLORS[t.category] ?? '#ddd');
      b.dataset.cat = t.category;
      b.onclick = () => {
        this.currentTab = t.category;
        this.game.audio.play('page');
        this.renderPantry();
      };
      const first = pantryItems(t.category)[0];
      if (first) void this.thumbs.food(first.id).then((url) => ((b.querySelector('img') as HTMLImageElement).src = url));
      this.tabs.appendChild(b);
    }
    this.renderPantry();
  }

  private renderPantry() {
    for (const b of this.tabs.children) (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.cat === this.currentTab);
    this.pantryGrid.innerHTML = '';
    for (const def of pantryItems(this.currentTab)) {
      const card = h('div', 'food-card', `<div class="thumb"><img alt=""></div><span>${def.name}</span>`);
      card.dataset.id = def.id;
      void this.thumbs.food(def.id).then((url) => {
        const img = card.querySelector('img') as HTMLImageElement;
        img.src = url;
        img.classList.add('ready');
      });
      this.bindDragSource(card, (x, y, pid) => {
        this.togglePantry(false);
        this.game.interaction.beginPantryDrag(def.id, x, y, pid);
      }, () => this.quickAdd(def.id));
      this.pantryGrid.appendChild(card);
    }
    this.pantryGrid.scrollTop = 0;
  }

  /** Tap on a fridge item: drop it into the station on screen (or onto the counter). */
  private quickAdd(id: string) {
    const g = this.game;
    g.audio.unlock();
    const st = g.currentStation();
    const start = g.camera.camera.position.clone().add(new THREE.Vector3(0.3, -0.2, -0.4));
    const item = g.items.spawn(makeFoodLazy(id), start);
    if (st && st.accepts(item)) g.interaction.toStation(item, st);
    else g.interaction.parkOnCounter(item);
    g.audio.play('pickup');
    this.hintAdvance(1);
  }

  togglePantry(open?: boolean) {
    const want = open ?? !this.pantry.classList.contains('open');
    if (want === this.pantry.classList.contains('open')) return;
    this.pantry.classList.toggle('open', want);
    this.fridgeTab.classList.toggle('hidden', want);
    this.game.audio.play(want ? 'fridge-open' : 'fridge-close', { volume: 0.7 });
    const fr = this.game.kitchen.fridge;
    const from = fr.door.rotation.y, to = want ? fr.openAngle * 0.85 : 0;
    this.game.anim.run(0.45, (k) => (fr.door.rotation.y = from + (to - from) * k));
    if (want) this.hintAdvance(0);
  }

  // ------------------------------------------------------------------------------------------
  // Spices

  private buildSpices() {
    this.spiceRack.innerHTML = '';
    const shelf = h('div', 'spice-shelf');
    for (const s of SEASONINGS) {
      const card = h('div', 'spice-card', `<div class="thumb"><img alt=""></div><span>${s.name}</span>`);
      card.style.setProperty('--label', s.label);
      void this.thumbs.object('bottle:' + s.id, () => this.game.makeBottle(s).root).then((url) => {
        const img = card.querySelector('img') as HTMLImageElement;
        img.src = url;
        img.classList.add('ready');
      });
      this.bindDragSource(card, (x, y, pid) => {
        this.toggleSpices(false);
        this.game.interaction.beginSeasonDrag(s.id, x, y, pid);
      }, () => {
        this.floatAtScreen('Drag it over food!', card);
        this.game.audio.play('shake', { volume: 0.5 });
      }, 'up');
      shelf.appendChild(card);
    }
    this.spiceRack.appendChild(shelf);
  }

  toggleSpices(open?: boolean) {
    const want = open ?? !this.spiceRack.classList.contains('open');
    this.spiceRack.classList.toggle('open', want);
    this.spiceBtn.classList.toggle('active', want);
    this.game.audio.play(want ? 'drawer-open' : 'drawer-close', { volume: 0.5 });
  }

  /**
   * Make a DOM card a drag source: drags heading into the scene start a 3D drag; mostly-along-the-
   * scroll-axis moves keep scrolling; a tap calls onTap.
   */
  private bindDragSource(el: HTMLElement, onDrag: (x: number, y: number, pointerId: number) => void, onTap: () => void, dir: 'left' | 'up' = 'left') {
    let sx = 0, sy = 0, pid = -1, active = false, dragged = false;
    el.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
      pid = e.pointerId;
      active = true;
      dragged = false;
      this.game.audio.unlock();
    });
    el.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== pid || dragged) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const out = dir === 'left' ? -dx > 10 && Math.abs(dx) > Math.abs(dy) * 0.8 : -dy > 10 && Math.abs(dy) > Math.abs(dx) * 0.8;
      const mouseDrag = e.pointerType === 'mouse' && Math.hypot(dx, dy) > 8;
      if (out || mouseDrag) {
        dragged = true;
        active = false;
        try {
          el.releasePointerCapture(pid);
        } catch {
          /* ignore */
        }
        onDrag(e.clientX, e.clientY, pid);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (active && !dragged && Math.hypot(e.clientX - sx, e.clientY - sy) < 10) onTap();
      active = false;
    });
    el.addEventListener('pointercancel', () => (active = false));
  }

  // ------------------------------------------------------------------------------------------
  // Dragging feedback

  setDragging(on: boolean) {
    this.dragging = on;
    this.root.classList.toggle('dragging', on);
  }

  dragAt(_x: number, _y: number) {}

  /** HUD drop targets: dock buttons and the trash. */
  dropTargetAt(x: number, y: number): DropTarget | null {
    if (!this.dragging) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const dockBtn = el.closest('.dock-btn') as HTMLElement | null;
    if (dockBtn && this.root.classList.contains('in-station')) {
      const id = dockBtn.dataset.station as StationId;
      return { kind: 'dock', station: this.game.stations[id] };
    }
    if (el.closest('.trash-target')) return { kind: 'hud-trash' };
    return null;
  }

  highlightDrop(t: DropTarget | null) {
    let el: HTMLElement | null = null;
    if (t?.kind === 'dock') el = this.dockBtns.get(t.station.id) ?? null;
    else if (t?.kind === 'hud-trash') el = this.trashTarget;
    if (el !== this.highlightEl) {
      this.highlightEl?.classList.remove('drop-hover');
      el?.classList.add('drop-hover');
      this.highlightEl = el;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Floating labels & speech

  floatLabel(text: string, pos: THREE.Vector3, style: LabelStyle = 'info', scale = 1) {
    if (!text) return;
    const el = h('div', `float-label ${style}`);
    el.textContent = text;
    el.style.setProperty('--s', String(scale));
    this.labelLayer.appendChild(el);
    this.labels.push({ el, pos: pos.clone(), t: 0, life: 1.6 });
    if (this.labels.length > 8) {
      const old = this.labels.shift()!;
      old.el.remove();
    }
  }

  private floatAtScreen(text: string, near: HTMLElement) {
    const r = near.getBoundingClientRect();
    const el = h('div', 'float-label info screen');
    el.textContent = text;
    el.style.left = r.left + r.width / 2 + 'px';
    el.style.top = r.top - 10 + 'px';
    this.labelLayer.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  speech(text: string, pos: THREE.Vector3) {
    if (!text) return;
    this.speechEl.textContent = text;
    this.speechPos = pos.clone();
    this.speechT = 2.6;
    this.speechEl.classList.remove('show');
    void this.speechEl.offsetWidth;
    this.speechEl.classList.add('show');
  }

  colorOf(id: string): string {
    return hasDef(id) ? getDef(id).colors.flesh : '#e8c890';
  }

  // ------------------------------------------------------------------------------------------
  // Meals

  mealBanner(a: MealAnalysis, _item: FoodItem) {
    const stars = Math.max(1, Math.min(5, Math.round((a.taste + 1) * 2.5)));
    this.banner.innerHTML = `<div class="banner-name">${escapeHtml(a.name)}</div><div class="stars">${'<i class="on">★</i>'.repeat(stars)}${'<i>★</i>'.repeat(5 - stars)}</div><div class="ribbon hidden">New recipe!</div>`;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerT = 6;
  }

  /** Called after the meal: mark the banner as a discovery. */
  markNew(isNewDish: boolean) {
    const rib = this.banner.querySelector('.ribbon');
    if (rib && isNewDish) rib.classList.remove('hidden');
  }

  toast(title: string, sub = '', thumb?: string) {
    this.toastEl.innerHTML = `${thumb ? `<img src="${thumb}" alt="">` : icon('sparkle')}<div><b>${escapeHtml(title)}</b><span>${escapeHtml(sub)}</span></div>`;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    this.toastT = 4;
  }

  // ------------------------------------------------------------------------------------------
  // Hints for first-time players

  private hintAdvance(step: number) {
    if (this.hintStep === step) {
      this.hintStep = step + 1;
      this.hintT = step === 1 ? 6 : 2.5;
      this.hintEl.classList.remove('show');
    }
  }

  private updateHints(dt: number) {
    if (!this.started || this.hintStep > 3) return;
    const g = this.game;
    // advance as soon as the player has done the thing
    const cooking = g.stationList.some((s) => s.id !== 'plate' && s.contents.length);
    if (this.hintStep === 0 && (this.pantry.classList.contains('open') || g.items.list.length)) this.hintAdvance(0);
    if (this.hintStep === 1 && g.items.list.length) this.hintAdvance(1);
    if (this.hintStep === 2 && (g.stations.plate.contents.length || g.discoveries.meals > 0 || (cooking && g.time > 40))) this.hintAdvance(2);
    if (this.hintStep === 3 && g.discoveries.meals > 0) this.hintAdvance(3);
    if (this.hintStep > 3) return;
    this.hintT -= dt;
    if (this.hintT > 0 || this.hintEl.classList.contains('show')) return;
    if (this.hintStep === 3 && !g.stations.plate.contents.length && !cooking) return;
    const hints = ['Open the fridge to get some food!', 'Drag food onto a station — or tap it to drop it in!', 'Cook it, chop it, mix it... anything goes!', 'Put food on Mochi’s plate, then ring the bell!'];
    this.hintEl.textContent = hints[this.hintStep];
    this.hintEl.classList.toggle('at-fridge', this.hintStep === 0);
    this.hintEl.classList.add('show');
  }

  // ------------------------------------------------------------------------------------------
  // Cookbook

  private openCookbook() {
    const g = this.game;
    g.audio.play('page');
    const list = g.discoveries.list();
    const found = new Set(list.map((e) => e.dishId).filter(Boolean));
    const todo = DISHES.filter((d) => !found.has(d.id));
    const hints = todo.sort(() => Math.random() - 0.5).slice(0, 3);
    this.cookbook.innerHTML = `
      <div class="book">
        <div class="book-head"><h2>${icon('book')} Mochi's Cookbook</h2><button class="btn round small close">${icon('close')}</button></div>
        <div class="progress"><div class="bar"><i style="width:${(found.size / Math.max(1, DISHES.length)) * 100}%"></i></div><span>${found.size} of ${DISHES.length} recipes discovered · ${g.discoveries.meals} meals served</span></div>
        <div class="book-grid">${list.length ? list.map((e) => `<div class="dish ${e.dishId ? 'recipe' : 'silly'}"><div class="thumb">${e.thumb ? `<img src="${e.thumb}" alt="">` : icon('plate')}</div><b>${escapeHtml(e.name)}</b><span>${reactionWord(e.reaction)}${e.count > 1 ? ' · ×' + e.count : ''}</span></div>`).join('') : '<p class="empty">Nothing yet! Cook something and serve it to Mochi.</p>'}</div>
        ${hints.length ? `<div class="hints"><h3>Ideas to try</h3>${hints.map((d) => `<div class="idea"><b>${escapeHtml(d.name)}</b><span>${escapeHtml(d.hint)}</span></div>`).join('')}</div>` : ''}
      </div>`;
    this.cookbook.classList.remove('hidden');
    (this.cookbook.querySelector('.close') as HTMLElement).onclick = () => this.closeCookbook();
    this.cookbook.onclick = (e) => {
      if (e.target === this.cookbook) this.closeCookbook();
    };
  }

  private closeCookbook() {
    this.cookbook.classList.add('hidden');
    this.game.audio.play('ui-close');
  }

  // ------------------------------------------------------------------------------------------
  // Settings

  private saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  private toggleMusic() {
    this.settings.music = !this.settings.music;
    this.game.audio.setMusicEnabled(this.settings.music);
    if (this.settings.music) this.game.audio.startMusic();
    this.musicBtn.innerHTML = icon(this.settings.music ? 'music' : 'musicOff');
    this.saveSettings();
  }

  private toggleSound() {
    this.settings.sfx = !this.settings.sfx;
    this.game.audio.setSfxEnabled(this.settings.sfx);
    this.soundBtn.innerHTML = icon(this.settings.sfx ? 'sound' : 'soundOff');
    this.game.audio.play('tap');
    this.saveSettings();
  }

  private confirmReset() {
    const g = this.game;
    if (!g.items.list.length) return;
    const el = h('div', 'confirm', `<div class="confirm-card"><b>Clean up the whole kitchen?</b><div class="row"><button class="no">Keep cooking</button><button class="yes">${icon('reset')} Clean up!</button></div></div>`);
    this.root.appendChild(el);
    (el.querySelector('.no') as HTMLElement).onclick = () => el.remove();
    (el.querySelector('.yes') as HTMLElement).onclick = () => {
      el.remove();
      for (const it of g.items.list) g.fx.poof(it.position.clone().add(new THREE.Vector3(0, 0.05, 0)), '#ffffff', 0.6);
      g.audio.play('poof');
      g.reset();
    };
  }

  // ------------------------------------------------------------------------------------------

  update(dt: number) {
    this.thumbs.pump(this.started ? 5 : 12);
    const cam = this.game.camera.camera;
    const w = this.root.clientWidth, hgt = this.root.clientHeight;
    const proj = (p: THREE.Vector3) => {
      const v = p.clone().project(cam);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * hgt, behind: v.z > 1 };
    };
    for (const l of this.labels) {
      l.t += dt;
      const s = proj(l.pos);
      l.el.style.transform = `translate(${s.x}px, ${s.y - l.t * 40}px) translate(-50%, -50%) scale(var(--s))`;
      l.el.style.opacity = String(Math.min(1, (l.life - l.t) * 2.5));
      if (s.behind) l.el.style.opacity = '0';
    }
    this.labels = this.labels.filter((l) => {
      if (l.t < l.life) return true;
      l.el.remove();
      return false;
    });
    if (this.speechT > 0 && this.speechPos) {
      this.speechT -= dt;
      const s = proj(this.speechPos);
      this.speechEl.style.left = s.x + 'px';
      this.speechEl.style.top = s.y + 'px';
      if (this.speechT <= 0) this.speechEl.classList.remove('show');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('show');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
    this.refreshAction();
    this.updateHints(dt);
    this.trashTarget.classList.toggle('show', this.dragging && this.root.classList.contains('in-station'));
  }
}

function makeFoodLazy(id: string) {
  return { id, form: 'whole' as const, cook: { fry: 0, grill: 0, boil: 0, bake: 0, deepfry: 0, toast: 0, micro: 0, burn: 0, freeze: 0, temp: 0, melt: 0 }, season: {}, seed: Math.floor(Math.random() * 1e6) };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function reactionWord(r: string): string {
  const m: Record<string, string> = { love: 'Loved it!', yum: 'Yummy!', okay: 'Pretty good', meh: 'Meh...', yuck: 'Yuck!', gross: 'Gross!', spicy: 'Spicy!', sour: 'Sour!', burnt: 'Burnt!', frozen: 'Brrr!', 'weird-good': 'Weirdly good!', 'weird-bad': 'Weird...', 'sugar-rush': 'Sugar rush!', tears: 'Happy tears' };
  return m[r] ?? r;
}
