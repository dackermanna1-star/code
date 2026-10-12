// HUD: compact, Noita-like. Quick bar top-left, bars + gold top-right, stains, crosshair, prompts.
import * as THREE from 'three';
import { Inventory, potionTotal } from '../game/inventory';
import { spellIconUrl, wandIconUrl, potionIconUrl } from './icons';
import { SPELLS } from '../magic/spells';
import { StatusState } from '../entities/creature';

interface Floater {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  t: number;
  life: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  lev: number;
  levMax: number;
  mana: number;
  manaMax: number;
  reload: number; // 0..1 remaining recharge fraction
  delay: number; // 0..1 remaining cast delay fraction
  gold: number;
  orbs: number;
  status: StatusState;
  breath: number;
  prompt: string;
  canEdit: boolean;
}

export class Hud {
  readonly root: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private slotKeys: string[] = [];
  private hpFill: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private levFill: HTMLDivElement;
  private manaFill: HTMLDivElement;
  private reloadFill: HTMLDivElement;
  private goldText: HTMLSpanElement;
  private orbText: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private logEl: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private vignette: HTMLDivElement;
  private floatersEl: HTMLDivElement;
  private floaters: Floater[] = [];
  private titleT = 0;
  private hurt = 0;
  private lastHp = -1;
  private breathEl: HTMLDivElement;
  private darkEl: HTMLDivElement;
  /** 0..1 strength of the dark cave vignette */
  darkness = 0.6;
  private spellBar: HTMLDivElement;
  private spellBarKey = '';
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    const r = document.createElement('div');
    r.className = 'hud';
    r.innerHTML = `
      <div class="hud-bar">
        <div class="hud-group">${'<div class="slot"></div>'.repeat(4)}</div>
        <div class="hud-group">${'<div class="slot"></div>'.repeat(4)}</div>
      </div>
      <div class="hud-spells"></div>
      <div class="hud-stats">
        <div class="stat"><div class="bar hp"><div></div></div><span class="ico">✚</span><span class="num hpnum">100</span></div>
        <div class="stat"><div class="bar lev"><div></div></div><span class="ico">⌃</span></div>
        <div class="stat"><div class="bar mana"><div></div></div><span class="ico">▮</span></div>
        <div class="stat thin"><div class="bar reload"><div></div></div></div>
        <div class="stat gold"><span class="ico">$</span><span class="num goldnum">0</span></div>
        <div class="stat orbs"></div>
        <div class="hud-status"></div>
        <div class="breath"></div>
      </div>
      <div class="crosshair"></div>
      <div class="hud-prompt"></div>
      <div class="hud-guide"><div class="g-strip"><div class="g-tick"></div><div class="g-mark">▼</div></div><div class="g-txt"></div></div>
      <div class="hud-log"></div>
      <div class="hud-title"></div>
      <div class="hud-dark"></div>
      <div class="hud-vignette"></div>
      <div class="hud-floaters"></div>`;
    parent.appendChild(r);
    this.root = r;
    this.slots = [...r.querySelectorAll('.slot')] as HTMLDivElement[];
    this.slotKeys = this.slots.map(() => '');
    this.hpFill = r.querySelector('.bar.hp > div')!;
    this.hpText = r.querySelector('.hpnum')!;
    this.levFill = r.querySelector('.bar.lev > div')!;
    this.manaFill = r.querySelector('.bar.mana > div')!;
    this.reloadFill = r.querySelector('.bar.reload > div')!;
    this.goldText = r.querySelector('.goldnum')!;
    this.orbText = r.querySelector('.orbs')!;
    this.statusEl = r.querySelector('.hud-status')!;
    this.promptEl = r.querySelector('.hud-prompt')!;
    this.logEl = r.querySelector('.hud-log')!;
    this.titleEl = r.querySelector('.hud-title')!;
    this.vignette = r.querySelector('.hud-vignette')!;
    this.floatersEl = r.querySelector('.hud-floaters')!;
    this.breathEl = r.querySelector('.breath')!;
    this.darkEl = r.querySelector('.hud-dark')!;
    this.spellBar = r.querySelector('.hud-spells')!;
    this.guideEl = r.querySelector('.hud-guide')!;
    this.guideMark = r.querySelector('.g-mark')!;
    this.guideTxt = r.querySelector('.g-txt')!;
  }

  private guideEl: HTMLDivElement;
  private guideMark: HTMLDivElement;
  private guideTxt: HTMLDivElement;
  private guideKey = '';

  /**
   * Way-down guide at the top of the screen. `bearing` is the target's horizontal angle relative to
   * the view (radians, + = right), or null when the way is straight down.
   */
  guide(g: { bearing: number | null; text: string } | null): void {
    if (!g) {
      this.guideEl.style.display = 'none';
      return;
    }
    this.guideEl.style.display = '';
    const strip = 160; // half width in px, covering ±90°
    let glyph = '▼', x = 0;
    if (g.bearing !== null) {
      const b = Math.atan2(Math.sin(g.bearing), Math.cos(g.bearing));
      if (b > Math.PI / 2) {
        glyph = '▶';
        x = strip;
      } else if (b < -Math.PI / 2) {
        glyph = '◀';
        x = -strip;
      } else {
        glyph = '◆';
        x = (b / (Math.PI / 2)) * strip;
      }
    }
    this.guideMark.style.transform = `translateX(${x.toFixed(0)}px)`;
    const key = glyph + g.text;
    if (key !== this.guideKey) {
      this.guideKey = key;
      this.guideMark.textContent = glyph;
      this.guideTxt.textContent = g.text;
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  log(text: string, color = '#d8ccb8'): void {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.color = color;
    this.logEl.appendChild(d);
    setTimeout(() => d.classList.add('fade'), 3500);
    setTimeout(() => d.remove(), 4600);
    while (this.logEl.children.length > 6) this.logEl.firstChild!.remove();
  }

  title(text: string, sub = ''): void {
    this.titleEl.innerHTML = `<div class="big">${text}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.titleT = 4;
    this.titleEl.style.opacity = '1';
  }

  floatText(x: number, y: number, z: number, text: string, color: string): void {
    if (this.floaters.length > 40) {
      const f = this.floaters.shift()!;
      f.el.remove();
    }
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    this.floatersEl.appendChild(el);
    this.floaters.push({ el, x, y, z, t: 0, life: 1.1 });
  }

  update(dt: number, s: HudState, inv: Inventory, cam: THREE.Camera): void {
    // quick bar
    for (let i = 0; i < 8; i++) {
      const el = this.slots[i];
      let key = 'empty';
      let html = '';
      if (i < 4) {
        const w = inv.wands[i];
        if (w) {
          let minUses = -1;
          for (const sp of w.spells) if (sp && sp.uses >= 0) minUses = minUses < 0 ? sp.uses : Math.min(minUses, sp.uses);
          key = `w${w.stats.spriteSeed}:${minUses}`;
          html = `<img src="${wandIconUrl(w.stats)}">${minUses >= 0 ? `<span class="cnt">${minUses}</span>` : ''}`;
        }
      } else {
        const it = inv.items[i - 4];
        if (it) {
          const pct = Math.round((potionTotal(it) / it.capacity) * 100);
          key = `p${potionIconUrl(it)}:${pct}`;
          html = `<img src="${potionIconUrl(it)}"><span class="cnt">${pct}</span>`;
        }
      }
      if (inv.selected === i) key += ':sel';
      if (this.slotKeys[i] !== key) {
        this.slotKeys[i] = key;
        el.innerHTML = html;
        el.classList.toggle('sel', inv.selected === i);
      }
    }
    // active wand spell strip (deck order)
    const w = inv.activeWand();
    const sk = w ? w.spells.map((x) => (x ? `${x.id}:${x.uses}` : '-')).join(',') : '';
    if (sk !== this.spellBarKey) {
      this.spellBarKey = sk;
      this.spellBar.innerHTML = w
        ? w.spells.map((x) => `<div class="mini">${x ? `<img src="${spellIconUrl(x.id)}" title="${SPELLS[x.id]?.name ?? x.id}">${x.uses >= 0 ? `<span class="cnt">${x.uses}</span>` : ''}` : ''}</div>`).join('')
        : '';
    }
    // bars
    this.hpFill.style.width = `${Math.max(0, (s.hp / s.maxHp) * 100)}%`;
    this.hpFill.parentElement!.classList.toggle('low', s.hp / s.maxHp < 0.25);
    this.hpText.textContent = s.hp >= 10 ? s.hp.toFixed(0) : s.hp.toFixed(1);
    this.levFill.style.width = `${(s.lev / s.levMax) * 100}%`;
    this.manaFill.style.width = `${s.manaMax > 0 ? (s.mana / s.manaMax) * 100 : 0}%`;
    this.reloadFill.style.width = `${Math.max(s.reload, s.delay) * 100}%`;
    this.reloadFill.style.background = s.reload > 0 ? '#c8a050' : '#7a7066';
    this.goldText.textContent = String(Math.floor(s.gold));
    this.orbText.textContent = s.orbs > 0 ? `◈ ${s.orbs}` : '';
    // stains / statuses
    const st = s.status;
    const chips: string[] = [];
    const add = (cond: number, label: string, cls: string, pct = true) => {
      if (cond > 0.01) chips.push(`<span class="chip ${cls}">${label}${pct ? ` ${Math.round(Math.min(1, cond) * 100)}%` : ''}</span>`);
    };
    add(st.onFire > 0 ? 1 : 0, 'On fire!', 'fire', false);
    add(st.wet, 'Wet', 'wet');
    add(st.bloody, 'Bloody', 'bloody');
    add(st.oily, 'Oiled', 'oily');
    add(st.slimy, 'Slimy', 'slimy');
    add(st.toxic, 'Toxic', 'toxic');
    add(st.drunk, 'Drunk', 'drunk');
    add(st.poisoned > 0 ? 1 : 0, 'Poisoned', 'toxic', false);
    add(st.regen > 0 ? 1 : 0, 'Regenerating', 'regen', false);
    add(st.manaRegen > 0 ? 1 : 0, 'Mana regen', 'mana', false);
    add(st.berserk > 0 ? 1 : 0, 'Berserk', 'fire', false);
    add(st.teleportitis > 0 ? 1 : 0, 'Teleportitis', 'tele', false);
    add(st.frozen > 0 ? 1 : 0, 'Frozen', 'wet', false);
    add(st.cursed > 0 ? 1 : 0, 'Cursed', 'fire', false);
    const html = chips.join('');
    if (this.statusEl.innerHTML !== html) this.statusEl.innerHTML = html;
    this.breathEl.style.display = s.breath < 0.999 ? '' : 'none';
    this.breathEl.style.width = `${s.breath * 100}px`;
    // prompt
    if (this.promptEl.textContent !== s.prompt) this.promptEl.textContent = s.prompt;
    this.promptEl.style.display = s.prompt ? '' : 'none';
    // title fade
    if (this.titleT > 0) {
      this.titleT -= dt;
      this.titleEl.style.opacity = String(Math.min(1, this.titleT));
    }
    this.darkEl.style.opacity = this.darkness.toFixed(2);
    // hurt vignette
    if (this.lastHp >= 0 && s.hp < this.lastHp - 0.05) this.hurt = Math.min(1, this.hurt + 0.35 + (this.lastHp - s.hp) / 30);
    this.lastHp = s.hp;
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    const low = s.hp / s.maxHp < 0.25 ? 0.25 + 0.15 * Math.sin(performance.now() / 180) : 0;
    this.vignette.style.opacity = String(Math.min(1, this.hurt + low));
    // floaters
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t > f.life) {
        f.el.remove();
        this.floaters.splice(i, 1);
        continue;
      }
      this.v.set(f.x, f.y + f.t * 2.5, f.z).project(cam);
      if (this.v.z > 1) {
        f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = '';
      f.el.style.transform = `translate(${((this.v.x + 1) / 2) * W}px, ${((1 - this.v.y) / 2) * H}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(1 - f.t / f.life);
    }
  }

  hurtAmount(): number {
    return this.hurt;
  }

  clearFloaters(): void {
    for (const f of this.floaters) f.el.remove();
    this.floaters.length = 0;
  }
}
