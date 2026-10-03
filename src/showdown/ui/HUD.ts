import * as THREE from 'three';
import { SD } from '../core/SD';
import { GOJO_CD, GOJO_COST, Player } from '../game/Player';
import './hud.css';

interface Ono {
  el: HTMLDivElement;
  pos: THREE.Vector3 | null;
  t: number;
  life: number;
  rot: number;
  scale: number;
}

const TECH: { key: string; id: 'blue' | 'red' | 'purple' | 'domain' | 'rct'; jp: string; en: string }[] = [
  { key: 'Q', id: 'blue', jp: '蒼', en: 'BLUE' },
  { key: 'RMB', id: 'red', jp: '赫', en: 'RED' },
  { key: 'R', id: 'purple', jp: '茈', en: 'PURPLE' },
  { key: 'Z', id: 'domain', jp: '領域', en: 'DOMAIN' },
  { key: 'F', id: 'rct', jp: '反転', en: 'RCT' },
];

/**
 * The fight HUD: health and cursed energy, technique slots, the Black Flash
 * ring, callouts, subtitles and manga sound effects pinned to the world.
 */
export class HUD {
  readonly root: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossTrail: HTMLDivElement;
  private bossBox: HTMLDivElement;
  private phaseEl: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpTrail: HTMLDivElement;
  private ceFill: HTMLDivElement;
  private dashPips: HTMLElement[] = [];
  private slots = new Map<string, { el: HTMLDivElement; sweep: HTMLDivElement }>();
  private ring: SVGCircleElement;
  private ringSweet: SVGCircleElement;
  private ringBox: HTMLDivElement;
  private callEl: HTMLDivElement;
  private subEl: HTMLDivElement;
  private onoLayer: HTMLDivElement;
  private bfEl: HTMLDivElement;
  private zoneEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private onos: Ono[] = [];
  private bossTrailV = 1;
  private hpTrailV = 1;
  private callT = 0;
  private subT = 0;
  private bfT = 0;

  constructor(parent: HTMLElement) {
    const r = (this.root = document.createElement('div'));
    r.className = 'sd-hud';
    r.innerHTML = `
      <div class="sd-boss">
        <div class="sd-bname"><span class="jp">両面宿儺</span><span class="en">RYOMEN SUKUNA</span><span class="title">呪いの王</span></div>
        <div class="sd-bar big"><div class="trail"></div><div class="fill"></div><div class="ticks"><i></i><i></i><i></i></div></div>
        <div class="sd-phase"></div>
      </div>
      <div class="sd-me">
        <div class="sd-pname"><span class="jp">五条悟</span><span class="en">SATORU GOJO</span></div>
        <div class="sd-bar hp"><div class="trail"></div><div class="fill"></div></div>
        <div class="sd-bar ce"><div class="fill"></div><span class="lbl">呪力</span></div>
        <div class="sd-dash"><i></i><i></i></div>
      </div>
      <div class="sd-tech"></div>
      <div class="sd-cross"><div class="dot"></div></div>
      <div class="sd-ring"><svg viewBox="-60 -60 120 120"><circle class="sweet" r="22"></circle><circle class="ring" r="56"></circle></svg><div class="lbl">黒閃</div></div>
      <div class="sd-callout"></div>
      <div class="sd-sub"></div>
      <div class="sd-onos"></div>
      <div class="sd-bf"></div>
      <div class="sd-zone">ZONE</div>
      <div class="sd-hint"></div>`;
    parent.appendChild(r);
    const q = <T extends Element>(s: string) => r.querySelector(s) as T;
    this.bossBox = q('.sd-boss');
    this.bossFill = q('.sd-boss .fill');
    this.bossTrail = q('.sd-boss .trail');
    this.phaseEl = q('.sd-phase');
    this.hpFill = q('.sd-bar.hp .fill');
    this.hpTrail = q('.sd-bar.hp .trail');
    this.ceFill = q('.sd-bar.ce .fill');
    this.dashPips = [...r.querySelectorAll('.sd-dash i')] as HTMLElement[];
    this.ring = q('.sd-ring .ring');
    this.ringSweet = q('.sd-ring .sweet');
    this.ringBox = q('.sd-ring');
    this.callEl = q('.sd-callout');
    this.subEl = q('.sd-sub');
    this.onoLayer = q('.sd-onos');
    this.bfEl = q('.sd-bf');
    this.zoneEl = q('.sd-zone');
    this.hintEl = q('.sd-hint');
    const tech = q<HTMLDivElement>('.sd-tech');
    for (const t of TECH) {
      const el = document.createElement('div');
      el.className = `slot ${t.id}`;
      el.innerHTML = `<div class="sweep"></div><span class="k">${t.key}</span><span class="jp">${t.jp}</span><span class="en">${t.en}</span>`;
      tech.appendChild(el);
      this.slots.set(t.id, { el, sweep: el.querySelector('.sweep') as HTMLDivElement });
    }
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  /** Big technique name: brush kanji with an English line. */
  callout(jp: string, en: string, kind = '', dur = 1.8) {
    this.callEl.className = `sd-callout show ${kind}`;
    this.callEl.innerHTML = `<div class="jp">${jp}</div><div class="en">${en}</div>`;
    this.callT = dur;
    // restart the animation
    void this.callEl.offsetWidth;
  }

  subtitle(jp: string, en: string, who = '', dur = 2.6) {
    this.subEl.className = `sd-sub show ${who}`;
    this.subEl.innerHTML = `<div class="jp">${jp}</div><div class="en">${en}</div>`;
    this.subT = dur;
  }

  hint(text: string, dur = 3) {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    window.clearTimeout((this.hintEl as any)._t);
    (this.hintEl as any)._t = window.setTimeout(() => this.hintEl.classList.remove('show'), dur * 1000);
  }

  /** Manga sound effect at a world point (or screen centre). */
  ono(text: string, pos: THREE.Vector3 | null, scale = 1, kind = '') {
    const el = document.createElement('div');
    el.className = `ono ${kind}`;
    el.textContent = text;
    this.onoLayer.appendChild(el);
    this.onos.push({ el, pos: pos ? pos.clone() : null, t: 0, life: kind === 'bf' || kind === 'purple' ? 1.4 : 0.85, rot: (Math.random() - 0.5) * 0.5, scale });
    if (this.onos.length > 12) {
      const o = this.onos.shift()!;
      o.el.remove();
    }
  }

  blackFlash(streak: number) {
    this.bfEl.innerHTML = `<div class="jp">黒閃</div><div class="en">BLACK FLASH${streak > 1 ? ` ×${streak}` : ''}</div>`;
    this.bfEl.classList.remove('show');
    void this.bfEl.offsetWidth;
    this.bfEl.classList.add('show');
    this.bfT = 2.2;
  }

  update(dt: number, p: Player, boss: { hp: number; maxHp: number; alive: boolean; phase: number } | null) {
    // boss
    if (boss) {
      this.bossBox.style.display = '';
      const k = Math.max(0, boss.hp / boss.maxHp);
      this.bossFill.style.width = `${k * 100}%`;
      this.bossTrailV = Math.max(k, this.bossTrailV - dt * 0.25);
      if (this.bossTrailV < k) this.bossTrailV = k;
      this.bossTrail.style.width = `${this.bossTrailV * 100}%`;
      const ph = ['壱', '弐', '参', '肆'];
      this.phaseEl.innerHTML = ph.map((c, i) => `<i class="${i + 1 === boss.phase ? 'on' : i + 1 < boss.phase ? 'done' : ''}">${c}</i>`).join('');
    } else this.bossBox.style.display = 'none';
    // player
    const hk = Math.max(0, p.hp / p.maxHp);
    this.hpFill.style.width = `${hk * 100}%`;
    this.hpTrailV = Math.max(hk, this.hpTrailV - dt * 0.35);
    this.hpTrail.style.width = `${this.hpTrailV * 100}%`;
    this.hpFill.classList.toggle('low', hk < 0.3);
    this.ceFill.style.width = `${(p.ce / p.maxCe) * 100}%`;
    this.dashPips.forEach((d, i) => d.classList.toggle('on', i < p.dash.charges));
    // technique slots
    for (const t of TECH) {
      const s = this.slots.get(t.id)!;
      let k = 0;
      let ready = true;
      if (t.id === 'rct') {
        ready = p.ce > 2;
        s.el.classList.toggle('active', p.act === 'rct');
      } else {
        const cd = GOJO_CD[t.id];
        k = p.cd[t.id] / cd;
        ready = p.cd[t.id] <= 0 && p.ce >= GOJO_COST[t.id] && p.burnout <= 0;
      }
      s.sweep.style.background = k > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${k * 360}deg, transparent 0)` : 'none';
      s.el.classList.toggle('ready', ready);
      s.el.classList.toggle('burnt', p.burnout > 0 && t.id !== 'rct');
    }
    // Black Flash ring
    const charging = p.act === 'charge';
    this.ringBox.classList.toggle('show', charging);
    if (charging) {
      const r = 56 - Math.min(1.2, p.bf.ring) * (56 - 22) / Player.BF_SWEET;
      this.ring.setAttribute('r', `${Math.max(4, r)}`);
      const near = Math.abs(p.bf.ring - Player.BF_SWEET) * 0.8 <= p.bfWindow;
      this.ringBox.classList.toggle('near', near);
      this.ringSweet.setAttribute('stroke-width', p.bf.zone > 0 ? '7' : '4');
    }
    this.zoneEl.classList.toggle('show', p.bf.zone > 0);
    // timers
    if (this.callT > 0 && (this.callT -= dt) <= 0) this.callEl.classList.remove('show');
    if (this.subT > 0 && (this.subT -= dt) <= 0) this.subEl.classList.remove('show');
    if (this.bfT > 0 && (this.bfT -= dt) <= 0) this.bfEl.classList.remove('show');
    // sound effects ride the world
    const w = SD.renderer.width;
    const h = SD.renderer.height;
    for (let i = this.onos.length - 1; i >= 0; i--) {
      const o = this.onos[i];
      o.t += dt;
      if (o.t >= o.life) {
        o.el.remove();
        this.onos.splice(i, 1);
        continue;
      }
      let x = w / 2;
      let y = h / 2;
      if (o.pos) {
        const v = o.pos.clone().project(SD.camera);
        if (v.z > 1) {
          o.el.style.display = 'none';
          continue;
        }
        o.el.style.display = '';
        x = (v.x * 0.5 + 0.5) * w;
        y = (-v.y * 0.5 + 0.5) * h;
      }
      const pop = o.t < 0.08 ? 0.5 + (o.t / 0.08) * 0.8 : 1.3 - Math.min(0.3, (o.t - 0.08) * 1.2);
      const a = o.t > o.life - 0.25 ? (o.life - o.t) / 0.25 : 1;
      o.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${o.rot}rad) scale(${pop * o.scale})`;
      o.el.style.opacity = `${a}`;
    }
  }
}
