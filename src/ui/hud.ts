import * as THREE from 'three';
import './hud.css';
import type { Game } from '../game';
import { PRESETS, QualityName, saveSettings, Settings } from '../core/settings';

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const CONTROLS: [string, string][] = [
  ['WASD', 'Move (camera relative)'],
  ['Mouse', 'Camera (click to lock pointer)'],
  ['LMB', 'Strike — aim with movement direction; chain between enemies'],
  ['RMB tap', 'Counter when ⚡ shows (perfect = last moment)'],
  ['RMB hold', 'Block (drains guard)'],
  ['SPACE', 'Dodge · toward an enemy = vault over (dazes)'],
  ['Q', 'Stun strike — opens brutes and guards'],
  ['E', 'Grab (LMB knee, E throw) · pick up weapon'],
  ['F', 'Finisher (uses charge) · takedown on downed enemies'],
  ['G', 'Throw held weapon'],
  ['ESC', 'Pause / settings'],
  ['Gamepad', 'X strike · Y counter · A dodge · B stun · RB grab · LB/RT finisher · LT block'],
];

export class HUD {
  root = el('div');
  private hp = el('i');
  private guard = el('i');
  private pips: HTMLElement[] = [];
  private waveEl = el('div', 'wave');
  private scoreEl = el('div', 'score');
  private leftEl = el('div', 'left');
  private comboEl = el('div', 'combo');
  private comboN = el('div', 'n');
  private comboM = el('div', 'm');
  private comboT = el('i');
  private toastEl = el('div', 'toast');
  private banner = el('div', 'banner');
  private bossEl = el('div', 'boss');
  private bossName = el('div', 'name');
  private bossHp = el('i');
  private hintEl = el('div', 'hint');
  private promptEl = el('div', 'prompt');
  private fpsEl = el('div', 'fps');
  private dmgEl = el('div', 'dmg');
  private indPool: HTMLElement[] = [];
  private toastT = 0;
  private hintT = 0;
  private bannerT = 0;
  private lastCombo = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsVal = 0;
  menus: Record<string, HTMLElement> = {};
  private shownHints = new Set<string>();

  constructor(public game: Game) {
    this.root.id = 'hud';
    const tl = el('div', 'tl');
    tl.append(el('div', 'label', 'HEALTH'));
    const hpBar = el('div', 'bar');
    hpBar.append(this.hp);
    const gBar = el('div', 'bar guard');
    gBar.append(this.guard);
    tl.append(hpBar, gBar);
    const pips = el('div', 'pips');
    for (let i = 0; i < 3; i++) {
      const s = el('span');
      this.pips.push(s);
      pips.append(s);
    }
    tl.append(pips);
    const tr = el('div', 'tr');
    tr.append(this.waveEl, this.scoreEl, this.leftEl);
    this.comboEl.append(this.comboN, this.comboM);
    const ct = el('div', 't');
    ct.append(this.comboT);
    this.comboEl.append(ct);
    this.bossEl.append(this.bossName);
    const bb = el('div', 'bar');
    bb.append(this.bossHp);
    this.bossEl.append(bb);
    this.root.append(this.dmgEl, tl, tr, this.comboEl, this.toastEl, this.banner, this.bossEl, this.hintEl, this.promptEl, this.fpsEl);
    document.body.append(this.root);
    this.buildMenus();
  }

  // ------------------------------------------------------------------ menus
  private buildMenus() {
    const g = this.game;
    const mk = (id: string) => {
      const m = el('div', 'menu');
      m.id = id;
      const card = el('div', 'card');
      m.append(card);
      document.body.append(m);
      this.menus[id] = m;
      return card;
    };
    // title
    const t = mk('title');
    t.append(el('h1', '', 'LAST <span>STANCE</span>'));
    t.append(el('div', 'tag', 'ONE FIGHTER · ENDLESS ENEMIES · NO MERCY'));
    const start = el('button', 'primary', 'FIGHT');
    start.onclick = () => g.beginRun();
    const set = el('button', '', 'SETTINGS');
    set.onclick = () => this.openSettings('title');
    const ctl = el('button', '', 'CONTROLS');
    ctl.onclick = () => this.show('controls');
    t.append(start, set, ctl);
    const best = el('div', 'small');
    best.id = 'bestline';
    t.append(best);
    t.append(el('div', 'small', 'Bodies and blood never disappear. Survive 15 waves and the Grandmaster — then endless.'));
    // controls
    const c = mk('controls');
    c.append(el('h2', '', 'CONTROLS'));
    const tbl = el('table');
    for (const [k, v] of CONTROLS) {
      const tr = el('tr');
      tr.append(el('td', '', k), el('td', '', v));
      tbl.append(tr);
    }
    c.append(tbl);
    const back = el('button', '', 'BACK');
    back.onclick = () => this.show(g.started ? 'pause' : 'title');
    c.append(back);
    // pause
    const p = mk('pause');
    p.append(el('h2', '', 'PAUSED'));
    const resume = el('button', 'primary', 'RESUME');
    resume.onclick = () => g.setPaused(false);
    const ps = el('button', '', 'SETTINGS');
    ps.onclick = () => this.openSettings('pause');
    const pc = el('button', '', 'CONTROLS');
    pc.onclick = () => this.show('controls');
    const restart = el('button', '', 'RESTART');
    restart.onclick = () => location.reload();
    p.append(resume, ps, pc, restart);
    // settings
    mk('settings');
    // game over
    const go = mk('gameover');
    go.append(el('h2', '', 'YOU FELL'));
    const stats = el('div', 'stats');
    stats.id = 'gostats';
    go.append(stats);
    const again = el('button', 'primary', 'FIGHT AGAIN');
    again.onclick = () => location.reload();
    go.append(again);
  }

  show(id: string | null) {
    for (const [k, m] of Object.entries(this.menus)) m.classList.toggle('on', k === id);
    if (id === 'title') {
      let best = '';
      try {
        const b = JSON.parse(localStorage.getItem('last-stance-best') ?? 'null');
        if (b) best = `Best: wave ${b.wave} · ${b.score} pts · ${b.kills} kills`;
      } catch {
        /* ignore */
      }
      const bl = document.getElementById('bestline');
      if (bl) bl.textContent = best;
    }
  }

  openSettings(from: 'title' | 'pause') {
    const g = this.game;
    const card = this.menus.settings.firstElementChild as HTMLElement;
    card.innerHTML = '';
    card.append(el('h2', '', 'SETTINGS'));
    const s = g.settings;
    const row = (label: string, input: HTMLElement) => {
      const r = el('div', 'row');
      r.append(el('span', '', label), input);
      card.append(r);
    };
    const sel = (opts: string[], val: string, on: (v: string) => void) => {
      const e = document.createElement('select');
      for (const o of opts) {
        const op = document.createElement('option');
        op.value = o;
        op.textContent = o.toUpperCase();
        if (o === val) op.selected = true;
        e.append(op);
      }
      e.onchange = () => on(e.value);
      return e;
    };
    const rng = (min: number, max: number, step: number, val: number, on: (v: number) => void) => {
      const e = document.createElement('input');
      e.type = 'range';
      e.min = String(min);
      e.max = String(max);
      e.step = String(step);
      e.value = String(val);
      e.oninput = () => on(Number(e.value));
      return e;
    };
    const chk = (val: boolean, on: (v: boolean) => void) => {
      const e = document.createElement('input');
      e.type = 'checkbox';
      e.checked = val;
      e.style.pointerEvents = 'auto';
      e.onchange = () => on(e.checked);
      return e;
    };
    const apply = (fn: (s: Settings) => void, reloadNote = false) => {
      fn(s);
      saveSettings(s);
      g.applySettings();
      if (reloadNote) note.textContent = 'Shadow-map / blood-atlas size changes apply after restart.';
    };
    row('Quality preset', sel(Object.keys(PRESETS), s.quality, (v) => apply((x) => (x.quality = v as QualityName), true)));
    row('Render scale', rng(0.5, 1.25, 0.05, s.renderScale, (v) => apply((x) => (x.renderScale = v))));
    row('Dynamic resolution', chk(s.dynamicResolution, (v) => apply((x) => (x.dynamicResolution = v))));
    row('Shadows', chk(s.shadows, (v) => apply((x) => (x.shadows = v))));
    row('Bloom', chk(s.bloom, (v) => apply((x) => (x.bloom = v))));
    row('Film grain', chk(s.filmGrain, (v) => apply((x) => (x.filmGrain = v))));
    row('Impact FX (chromatic)', chk(s.motionFx, (v) => apply((x) => (x.motionFx = v))));
    row('Camera shake', rng(0, 1.5, 0.05, s.cameraShake, (v) => apply((x) => (x.cameraShake = v))));
    row('Mouse sensitivity', rng(0.2, 3, 0.05, s.mouseSensitivity, (v) => apply((x) => (x.mouseSensitivity = v))));
    row('Invert Y', chk(s.invertY, (v) => apply((x) => (x.invertY = v))));
    row('Master volume', rng(0, 1, 0.01, s.masterVolume, (v) => apply((x) => (x.masterVolume = v))));
    row('Effects volume', rng(0, 1, 0.01, s.sfxVolume, (v) => apply((x) => (x.sfxVolume = v))));
    row('Music volume', rng(0, 1, 0.01, s.musicVolume, (v) => apply((x) => (x.musicVolume = v))));
    row('Tutorial hints', chk(s.showHints, (v) => apply((x) => (x.showHints = v))));
    row('FPS / stats overlay', chk(s.fpsCounter, (v) => apply((x) => (x.fpsCounter = v))));
    const note = el('div', 'small', 'Blood and bodies are never removed by any setting — quality only changes resolution and effect counts.');
    card.append(note);
    const back = el('button', 'primary', 'BACK');
    back.onclick = () => this.show(from);
    card.append(back);
    this.show('settings');
  }

  gameOver(stats: Record<string, string | number>) {
    const s = document.getElementById('gostats')!;
    s.innerHTML = Object.entries(stats)
      .map(([k, v]) => `<div>${k}<b>${v}</b></div>`)
      .join('');
    this.show('gameover');
  }

  // ------------------------------------------------------------------ transient
  toast(text: string, color = '#fff', dur = 1.1) {
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.classList.add('on');
    this.toastT = dur;
  }
  bannerShow(big: string, sub = '', dur = 2.4) {
    this.banner.innerHTML = `<div class="big">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.banner.classList.add('on');
    this.bannerT = dur;
  }
  hint(text: string, key?: string, dur = 6) {
    if (!this.game.settings.showHints) return;
    if (key) {
      if (this.shownHints.has(key)) return;
      this.shownHints.add(key);
    }
    this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    this.hintT = dur;
  }
  flashFinisherReady() {
    this.toast('FINISHER READY  [F]', '#ffcf4a', 1.0);
    this.game.audio.play('announcer', { file: 'audio/announcer/announcer_combo.wav', vol: 0.5 });
  }

  private ind(i: number) {
    while (this.indPool.length <= i) {
      const d = el('div', 'ind', '<div class="ring"></div><span></span>');
      d.style.display = 'none';
      this.root.append(d);
      this.indPool.push(d);
    }
    return this.indPool[i];
  }

  update(dt: number, realDt: number) {
    const g = this.game;
    const p = g.player;
    this.hp.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    this.guard.style.width = `${Math.max(0, p.guard)}%`;
    const need = p.charges === 0 ? 6 : 8;
    this.pips.forEach((s, i) => {
      s.classList.toggle('on', i < p.charges);
      const prog = i === p.charges ? Math.min(1, p.chargeProgress / need) : 0;
      s.classList.toggle('prog', prog > 0 && i >= p.charges);
      s.style.setProperty('--p', `${prog * 100}%`);
    });
    const w = g.waves;
    this.waveEl.textContent = w.wave > 0 ? `WAVE ${w.wave}` : '';
    this.scoreEl.textContent = `${p.score.toLocaleString()}`;
    this.leftEl.textContent = w.wave > 0 && !w.betweenWaves ? `${w.remaining} LEFT · ${g.corpses.count} DOWN` : `${g.corpses.count} DOWN`;
    // combo
    if (p.combo >= 2) {
      this.comboEl.classList.add('on');
      if (p.combo !== this.lastCombo) {
        this.comboEl.classList.remove('pop');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('pop');
      }
      this.comboN.innerHTML = `<small>x</small>${p.combo}`;
      const words = p.combo >= 40 ? 'UNSTOPPABLE' : p.combo >= 25 ? 'SAVAGE' : p.combo >= 15 ? 'BRUTAL' : p.combo >= 8 ? 'FLOWING' : '';
      this.comboM.textContent = `${words}${words ? ' · ' : ''}x${p.multiplier.toFixed(2)}`;
      this.comboT.style.width = `${Math.max(0, (p.comboTimer / 2.6) * 100)}%`;
    } else this.comboEl.classList.remove('on');
    this.lastCombo = p.combo;
    // boss
    const boss = g.bosses.active;
    if (boss) {
      this.bossEl.classList.add('on');
      this.bossName.textContent = boss.cfg.label;
      this.bossHp.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    } else this.bossEl.classList.remove('on');
    // timers
    if (this.toastT > 0 && (this.toastT -= realDt) <= 0) this.toastEl.classList.remove('on');
    if (this.hintT > 0 && (this.hintT -= realDt) <= 0) this.hintEl.classList.remove('on');
    if (this.bannerT > 0 && (this.bannerT -= realDt) <= 0) this.banner.classList.remove('on');
    // low health vignette
    const low = Math.max(0, 1 - p.hp / (p.maxHp * 0.35));
    this.dmgEl.style.boxShadow = `inset 0 0 ${120 + low * 80}px rgba(150,0,0,${(low * 0.55).toFixed(2)})`;
    // indicators
    const cam = g.cam.camera;
    const W = window.innerWidth, H = window.innerHeight;
    let n = 0;
    const v = new THREE.Vector3();
    const now = g.time;
    for (const inc of g.director.incoming) {
      const e = inc.enemy;
      if (!e.alive) continue;
      e.bodyPoint('head', v);
      v.y += 0.42 * e.scale;
      v.project(cam);
      if (v.z > 1) continue;
      const d = this.ind(n++);
      d.style.display = 'flex';
      d.className = 'ind ' + (inc.counterable ? 'counter' : 'unblock');
      d.style.left = `${((v.x + 1) / 2) * W}px`;
      d.style.top = `${((1 - v.y) / 2) * H}px`;
      (d.lastElementChild as HTMLElement).textContent = inc.counterable ? '⚡' : '!';
      const total = Math.max(0.05, inc.hitTime - inc.start);
      const k = Math.max(0, Math.min(1, (inc.hitTime - now) / total));
      (d.firstElementChild as HTMLElement).style.transform = `scale(${0.55 + k * 1.1})`;
      (d.firstElementChild as HTMLElement).style.opacity = String(0.4 + (1 - k) * 0.6);
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
        d.className = 'ind target';
        d.style.left = `${((v.x + 1) / 2) * W}px`;
        d.style.top = `${((1 - v.y) / 2) * H}px`;
        (d.lastElementChild as HTMLElement).textContent = '▼';
        (d.firstElementChild as HTMLElement).style.opacity = '0';
      }
    }
    for (let i = n; i < this.indPool.length; i++) this.indPool[i].style.display = 'none';
    // contextual prompts
    let prompt = '';
    if (p.alive && p.action === 'free') {
      const downed = p.selectTarget(2.6, (e) => e.state === 'down');
      const wp = g.weapons.find((x) => x.pickable && x.worldPos(v).distanceTo(new THREE.Vector3(p.x, v.y, p.z)) < 1.4);
      if (downed) prompt = '<b>F</b>GROUND TAKEDOWN';
      else if (wp && !p.weapon) prompt = `<b>E</b>PICK UP ${wp.kind.toUpperCase()}`;
      else if (p.charges > 0 && p.selectTarget(4)) prompt = '<b>F</b>FINISHER';
      else if (p.weapon) prompt = '<b>G</b>THROW ' + p.weapon.kind.toUpperCase();
    } else if (p.action === 'grab') prompt = '<b>LMB</b>KNEE &nbsp; <b>E</b>THROW';
    this.promptEl.innerHTML = prompt;
    this.promptEl.classList.toggle('on', prompt !== '');
    // first-time hints
    if (g.director.incoming.some((i) => i.counterable)) this.hint('⚡ above an enemy: press RMB (or Y) to COUNTER. Perfect timing = bigger counters.', 'counter');
    if (g.director.incoming.some((i) => !i.counterable)) this.hint('Red ! attacks cannot be countered — DODGE with SPACE (A).', 'red');
    // fps / stats
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
        `${this.fpsVal.toFixed(0)} fps  scale ${(g.renderer.pixelRatio).toFixed(2)}\n` +
        `corpses ${g.corpses.count}  verts ${(g.corpses.totalVerts / 1000).toFixed(0)}k  splats ${g.blood.totalSplats}\n` +
        `draws ${g.renderer.sceneStats.calls}  tris ${(g.renderer.sceneStats.triangles / 1000).toFixed(0)}k  particles ${g.fx.liveParticles}\n` +
        `ragdolls ${g.death.dying.length}  weapons ${g.weapons.length}  debris ${g.fx.wood.total + g.fx.bone.total}` +
        (mem ? `\nheap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : '');
    } else this.fpsEl.textContent = '';
    void dt;
  }
}
