/**
 * Interactive 3D map (M) at four scales: the current star system, the
 * stellar neighbourhood, the whole galaxy and the surrounding universe.
 * Drag to rotate, right-drag to pan, wheel to zoom, click to select,
 * double-click to travel.
 */
import * as THREE from 'three';
import type { StarSystem } from '../astro/body';
import { orbitState } from '../astro/orbit';
import { densities, ensureDensity, type GalaxyParams, type PopDensity } from '../astro/galaxy';
import { AU, LY, MPC } from '../core/constants';
import { Rng } from '../core/rng';
import { formatDistance } from '../core/mathutil';
import { UPos } from '../core/upos';
import type { Cosmos } from '../sim/cosmos';
import type { StarField } from '../render/starfield';
import { bodyTarget, galaxyTarget, systemTarget, type Target } from '../sim/targets';

export type MapLevel = 'system' | 'local' | 'galaxy' | 'universe';

interface MapPoint {
  x: number; y: number; z: number;
  size: number;
  color: string;
  label?: string;
  pri: number;
  target?: () => Target;
  id?: string;
}

interface MapLine { pts: number[]; color: string; width?: number }

export interface MapSources {
  cosmos: Cosmos;
  field: StarField;
  system: StarSystem | null;
  camUPos: UPos;
  time: number;
  selectedId: string | null;
  select: (t: Target, travel: boolean) => void;
}

const LEVELS: { id: MapLevel; label: string; unit: string }[] = [
  { id: 'system', label: 'System', unit: 'AU' },
  { id: 'local', label: 'Neighbourhood', unit: 'ly' },
  { id: 'galaxy', label: 'Galaxy', unit: 'kly' },
  { id: 'universe', label: 'Universe', unit: 'Mpc' },
];

const galaxyCloud = new Map<string, { pts: Float32Array; col: string[] }>();

function tempCss(T: number, a = 1): string {
  const t = Math.max(1000, Math.min(40000, T));
  const r = t < 6600 ? 255 : Math.round(329.7 * Math.pow(t / 100 - 60, -0.1332));
  const g = t < 6600 ? Math.round(99.47 * Math.log(t / 100) - 161.1) : Math.round(288.1 * Math.pow(t / 100 - 60, -0.0755));
  const b = t >= 6600 ? 255 : t < 1900 ? 0 : Math.round(138.5 * Math.log(t / 100 - 10) - 305);
  const c = (v: number) => Math.max(60, Math.min(255, v));
  return `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

export class StarMap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private info: HTMLElement;
  level: MapLevel = 'system';
  private yaw = 0.6;
  private pitch = 0.55;
  private dist = 30;
  private center = new THREE.Vector3();
  private points: MapPoint[] = [];
  private lines: MapLine[] = [];
  private you: THREE.Vector3 | null = null;
  private scaleLabel = 'AU';
  private w = 1;
  private h = 1;
  private dpr = 1;
  private drag: { x: number; y: number; btn: number; moved: number } | null = null;
  private src: MapSources | null = null;
  private screen: { x: number; y: number; p: MapPoint }[] = [];
  isOpen = false;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'map-wrap';
    this.root.innerHTML = `<canvas></canvas>
      <div class="panel map-bar">
        <div class="tabs">${LEVELS.map((l, i) => `<button data-level="${l.id}" title="${i + 1}">${l.label}</button>`).join('')}</div>
        <button data-center title="Centre on your position">⌖ You</button>
        <button data-close aria-label="Close map">✕</button>
      </div>
      <div class="panel map-info mono"></div>
      <div class="map-hint dim">drag: rotate · right-drag: pan · wheel: zoom · click: select · double-click: travel · 1–4: scale · M/Esc: close</div>`;
    this.canvas = this.root.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.info = this.root.querySelector('.map-info')!;
    this.root.style.display = 'none';
    this.root.querySelector('.map-bar')!.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.level) this.setLevel(t.dataset.level as MapLevel);
      else if (t.dataset.center !== undefined) this.recentre();
      else if (t.dataset.close !== undefined) this.close();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => { this.drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: 0 }; });
    window.addEventListener('mousemove', (e) => {
      if (!this.drag || !this.isOpen) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.btn === 2 || e.shiftKey) {
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const k = (this.dist * 1.0) / this.h;
        this.center.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
      } else {
        this.yaw -= dx * 0.006;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + dy * 0.006));
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.drag) return;
      const click = this.drag.moved < 5 && this.drag.btn === 0;
      this.drag = null;
      if (click) this.click(e.offsetX, e.offsetY, false);
    });
    this.canvas.addEventListener('dblclick', (e) => this.click(e.offsetX, e.offsetY, true));
    this.canvas.addEventListener('wheel', (e) => {
      this.dist *= Math.pow(1.15, Math.sign(e.deltaY));
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) { this.setLevel(LEVELS[i].id); e.stopImmediatePropagation(); }
    }, true);
    parent.appendChild(this.root);
  }

  open(src: MapSources) {
    this.src = src;
    this.isOpen = true;
    this.root.style.display = '';
    this.resize();
    const lvl: MapLevel = src.system ? 'system' : src.cosmos.current ? 'local' : 'universe';
    this.setLevel(lvl);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.display = 'none';
    this.onClose();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  setLevel(l: MapLevel) {
    this.level = l;
    for (const b of this.root.querySelectorAll('[data-level]')) b.classList.toggle('active', (b as HTMLElement).dataset.level === l);
    this.build();
    this.recentre();
  }

  private recentre() {
    this.center.copy(this.you ?? new THREE.Vector3());
    if (this.level === 'system') {
      // fit the planetary system
      let r = 1;
      for (const p of this.points) if (p.pri <= 1) r = Math.max(r, Math.hypot(p.x, p.y, p.z));
      this.center.set(0, 0, 0);
      this.dist = r * 2.6;
    } else if (this.level === 'local') this.dist = 70;
    else if (this.level === 'galaxy') { this.center.set(0, 0, 0); this.dist = (this.src?.cosmos.current?.radius ?? 50000) / 1000 * 2.4; this.pitch = 1.15; }
    else this.dist = 25;
  }

  /** Update dynamic content (called every frame while open). */
  update(src: MapSources) {
    this.src = src;
    if (src.system !== this.builtFor || this.level === 'system') this.build();
    this.draw();
  }

  private builtFor: StarSystem | null | undefined = undefined;

  private build() {
    const s = this.src;
    if (!s) return;
    this.builtFor = s.system;
    this.points = [];
    this.lines = [];
    this.you = null;
    if (this.level === 'system') this.buildSystem(s);
    else if (this.level === 'local') this.buildLocal(s);
    else if (this.level === 'galaxy') this.buildGalaxy(s);
    else this.buildUniverse(s);
  }

  private buildSystem(s: MapSources) {
    const sys = s.system;
    this.scaleLabel = 'AU';
    if (!sys) return;
    const inv = sys.q.clone().invert();
    const you = s.camUPos.sub(sys.upos, new THREE.Vector3()).applyQuaternion(inv).multiplyScalar(1 / AU);
    this.you = you;
    const p = new THREE.Vector3();
    for (const b of sys.bodies) {
      if (b.kind === 'barycenter') continue;
      const pri = b.isStarLike ? 0 : b.kind === 'planet' ? 1 : b.kind === 'dwarf-planet' ? 2 : b.kind === 'moon' ? 3 : 4;
      const life = b.planet?.life && !['none', 'prebiotic'].includes(b.planet.life.kind);
      this.points.push({
        x: b.posSys.x / AU, y: b.posSys.y / AU, z: b.posSys.z / AU,
        size: b.isStarLike ? 6 : pri === 1 ? 3.5 : pri === 3 ? 1.6 : 2.2,
        color: b.isStarLike ? tempCss(b.star!.temperature) : life ? '#8fe3a5' : pri === 1 ? '#9fd4ff' : '#a8b4c4',
        label: b.displayName + (life ? ' ✦' : ''), pri, target: () => bodyTarget(b), id: b.id,
      });
      if (b.orbit && b.parent && b.orbit.e < 1 && pri <= 4) {
        const o = b.orbit;
        const n = Math.sqrt(o.mu / (o.a * o.a * o.a));
        const pts: number[] = [];
        const N = pri === 3 ? 48 : 128;
        for (let i = 0; i <= N; i++) {
          const E = (i / N) * Math.PI * 2;
          orbitState(o, o.epoch + (E - o.e * Math.sin(E) - o.M0) / n, p);
          p.add(b.parent.posSys);
          pts.push(p.x / AU, p.y / AU, p.z / AU);
        }
        this.lines.push({ pts, color: pri === 3 ? 'rgba(180,190,210,0.18)' : b.kind === 'comet' ? 'rgba(150,230,255,0.25)' : 'rgba(124,196,255,0.32)' });
      }
    }
    // Oort cloud: an inferred, far too sparse to see, spherical reservoir of comets
    if (sys.bodies.some((b) => b.kind === 'comet') && sys.stars.length) {
      for (const r of [2000, 50000]) {
        for (const plane of [0, 1, 2]) {
          const pts: number[] = [];
          for (let i = 0; i <= 96; i++) {
            const a = (i / 96) * Math.PI * 2, c = Math.cos(a) * r, d = Math.sin(a) * r;
            pts.push(plane === 0 ? c : plane === 1 ? c : 0, plane === 0 ? 0 : plane === 1 ? d : c, plane === 0 ? d : plane === 1 ? 0 : d);
          }
          this.lines.push({ pts, color: 'rgba(150,200,255,0.06)' });
        }
      }
      this.points.push({ x: 0, y: 50000, z: 0, size: 0, color: '#9cc', label: 'Oort cloud (inferred, 2 000–100 000 AU)', pri: 2 });
    }
    for (const belt of sys.belts) {
      const pts: number[] = [];
      for (const r of [belt.inner, belt.outer]) {
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          p.set(Math.cos(a) * r, 0, Math.sin(a) * r).add(belt.parent.posSys);
          pts.push(p.x / AU, p.y / AU, p.z / AU);
        }
        this.lines.push({ pts: pts.splice(0), color: 'rgba(200,180,150,0.18)' });
      }
    }
  }

  private buildLocal(s: MapSources) {
    const g = s.cosmos.current;
    this.scaleLabel = 'ly';
    if (!g) return;
    const c = s.cosmos.camG;
    this.you = new THREE.Vector3(0, 0, 0);
    const R = 120;
    for (const st of s.field.stars()) {
      const dx = st.x - c.x, dy = st.y - c.y, dz = st.z - c.z;
      if (dx * dx + dy * dy + dz * dz > R * R) continue;
      const lum = st.lumV;
      const label = undefined;
      this.points.push({
        x: dx, y: dy, z: dz, size: Math.max(0.8, Math.min(4, 1.2 + Math.log10(Math.max(lum, 1e-4)) * 0.6)),
        color: st.remnant === 3 ? '#b080ff' : tempCss(st.temp, st.remnant === 1 ? 0.7 : 0.9), label, pri: 5,
        target: () => systemTarget(s.cosmos.refFromStar(st)), id: `${g.id}/${st.level}:${st.ix}:${st.iy}:${st.iz}:${st.index}`,
      });
    }
    for (const rg of s.cosmos.rogues) {
      const d = rg.local.clone().sub(c);
      this.points.push({ x: d.x, y: d.y, z: d.z, size: 1.4, color: 'rgba(190,140,255,0.8)', label: d.length() < 4 ? `${rg.name} (rogue)` : undefined, pri: 4,
        target: () => systemTarget(s.cosmos.refFromRogue(rg)), id: rg.id });
    }
    for (const k of s.cosmos.knownSystems) {
      if (k.galaxyId !== g.id) continue;
      const d = k.local.clone().sub(c);
      if (d.length() > R * 4) continue;
      this.points.push({
        x: d.x, y: d.y, z: d.z, size: 3, color: k.color ? tempCss(k.id.endsWith('sol') ? 5772 : 5000) : '#fff',
        label: k.name, pri: k.id.endsWith('/sol') ? 0 : 2, target: () => systemTarget(k), id: k.id,
      });
    }
    // galactic plane grid (10 ly)
    for (let i = -10; i <= 10; i++) {
      this.lines.push({ pts: [i * 10, -c.y, -100, i * 10, -c.y, 100], color: 'rgba(124,196,255,0.07)' });
      this.lines.push({ pts: [-100, -c.y, i * 10, 100, -c.y, i * 10], color: 'rgba(124,196,255,0.07)' });
    }
    // direction to the galactic centre
    const toC = new THREE.Vector3(-c.x, 0, -c.z).normalize().multiplyScalar(60);
    this.lines.push({ pts: [0, 0, 0, toC.x, 0, toC.z], color: 'rgba(255,207,124,0.35)', width: 1.5 });
    this.points.push({ x: toC.x, y: 0, z: toC.z, size: 0, color: '#ffcf7c', label: '→ galactic centre', pri: 1 });
  }

  private buildGalaxy(s: MapSources) {
    const g = s.cosmos.current ?? nearestGalaxy(s);
    this.scaleLabel = 'kly';
    if (!g) return;
    const cloud = galaxyPoints(g);
    for (let i = 0; i < cloud.col.length; i++) {
      this.points.push({ x: cloud.pts[i * 3] / 1000, y: cloud.pts[i * 3 + 1] / 1000, z: cloud.pts[i * 3 + 2] / 1000, size: 0.9, color: cloud.col[i], pri: 9 });
    }
    const c = s.cosmos.current === g ? s.cosmos.camG : null;
    if (c) this.you = c.clone().multiplyScalar(1 / 1000);
    this.points.push({ x: 0, y: 0, z: 0, size: 3, color: '#ffcf7c', label: g.bhMass > 1e5 ? `central black hole (${(g.bhMass / 1e6).toPrecision(2)}M M☉)` : 'centre', pri: 1 });
    if (g.known && g.id === 'MW') {
      const sun = s.cosmos.universe.sunLocal;
      const sol = s.cosmos.knownSystems.find((k) => k.id.endsWith('/sol'));
      this.points.push({ x: sun.x / 1000, y: sun.y / 1000, z: sun.z / 1000, size: 3, color: '#fff3c0', label: 'Sun', pri: 0, target: sol ? () => systemTarget(sol) : undefined, id: sol?.id });
    }
    // radial rings every 10 kly
    for (let r = 10; r * 1000 < g.radius * 1.1; r += 10) {
      const pts: number[] = [];
      for (let i = 0; i <= 96; i++) pts.push(Math.cos((i / 96) * 6.2832) * r, 0, Math.sin((i / 96) * 6.2832) * r);
      this.lines.push({ pts, color: 'rgba(124,196,255,0.08)' });
    }
  }

  private buildUniverse(s: MapSources) {
    this.scaleLabel = 'Mpc';
    this.you = new THREE.Vector3();
    for (const gal of s.cosmos.galaxies) {
      const d = gal.upos.sub(s.camUPos, new THREE.Vector3()).multiplyScalar(1 / MPC);
      const big = Math.log10(Math.max(gal.stellarMass, 1e6));
      this.points.push({
        x: d.x, y: d.y, z: d.z, size: Math.max(0.8, (big - 7.5) * 1.3),
        color: gal.type === 'elliptical' || gal.type === 'lenticular' ? 'rgba(255,214,160,0.9)' : gal.type === 'irregular' ? 'rgba(170,200,255,0.8)' : 'rgba(205,220,255,0.9)',
        label: gal.known || big > 11 ? gal.name : undefined, pri: gal.known ? 1 : big > 11 ? 3 : 6,
        target: () => galaxyTarget(gal), id: gal.id,
      });
    }
  }

  // ------------------------------------------------------------------ draw
  private draw() {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = 'rgba(2,4,10,0.96)';
    g.fillRect(0, 0, this.w, this.h);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const eye = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.dist).add(this.center);
    const m = new THREE.Matrix4().lookAt(eye, this.center, new THREE.Vector3(0, 1, 0));
    const qInv = new THREE.Quaternion().setFromRotationMatrix(m).invert();
    const f = 1 / Math.tan((50 * Math.PI) / 360);
    const v = new THREE.Vector3();
    const proj = (x: number, y: number, z: number): [number, number, number] | null => {
      v.set(x - eye.x, y - eye.y, z - eye.z).applyQuaternion(qInv);
      if (v.z > -1e-9) return null;
      const iz = -1 / v.z;
      return [this.w / 2 + v.x * iz * f * this.h / 2, this.h / 2 - v.y * iz * f * this.h / 2, -v.z];
    };
    for (const l of this.lines) {
      g.strokeStyle = l.color;
      g.lineWidth = l.width ?? 1;
      g.beginPath();
      let pen = false;
      for (let i = 0; i < l.pts.length; i += 3) {
        const p = proj(l.pts[i], l.pts[i + 1], l.pts[i + 2]);
        if (!p) { pen = false; continue; }
        if (pen) g.lineTo(p[0], p[1]);
        else g.moveTo(p[0], p[1]);
        pen = true;
      }
      g.stroke();
    }
    this.screen.length = 0;
    const labels: { x: number; y: number; p: MapPoint; d: number }[] = [];
    for (const pt of this.points) {
      const p = proj(pt.x, pt.y, pt.z);
      if (!p) continue;
      if (pt.size > 0) {
        g.fillStyle = pt.color;
        const r = pt.size;
        if (r < 1.2) g.fillRect(p[0] - 0.6, p[1] - 0.6, 1.3, 1.3);
        else { g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill(); }
      }
      if (pt.target) this.screen.push({ x: p[0], y: p[1], p: pt });
      if (pt.label || (pt.id && pt.id === this.src?.selectedId)) labels.push({ x: p[0], y: p[1], p: pt, d: p[2] });
    }
    // labels, decluttered by priority
    labels.sort((a, b) => a.p.pri - b.p.pri || a.d - b.d);
    const placed: number[][] = [];
    g.font = '500 12px Inter, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const l of labels) {
      const sel = l.p.id && l.p.id === this.src?.selectedId;
      const text = l.p.label ?? '';
      const w = g.measureText(text).width;
      const x0 = l.x + 7, y0 = l.y - 7;
      if (!sel && placed.some((r) => x0 < r[2] && x0 + w > r[0] && y0 < r[3] && y0 + 14 > r[1])) continue;
      placed.push([x0, y0, x0 + w, y0 + 14]);
      g.fillStyle = sel ? '#ffcf7c' : l.p.pri <= 1 ? 'rgba(232,238,246,0.95)' : 'rgba(200,210,225,0.75)';
      g.fillText(text, x0, l.y);
      if (sel) {
        g.strokeStyle = '#ffcf7c';
        g.beginPath();
        g.arc(l.x, l.y, Math.max(l.p.size + 4, 7), 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (this.you) {
      const p = proj(this.you.x, this.you.y, this.you.z);
      if (p) {
        g.strokeStyle = '#8fe3a5';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(p[0] - 9, p[1]); g.lineTo(p[0] - 3, p[1]);
        g.moveTo(p[0] + 3, p[1]); g.lineTo(p[0] + 9, p[1]);
        g.moveTo(p[0], p[1] - 9); g.lineTo(p[0], p[1] - 3);
        g.moveTo(p[0], p[1] + 3); g.lineTo(p[0], p[1] + 9);
        g.stroke();
        g.fillStyle = '#8fe3a5';
        g.fillText('you', p[0] + 11, p[1] + 10);
      }
    }
    // scale bar
    const unitM = this.scaleLabel === 'AU' ? AU : this.scaleLabel === 'ly' ? LY : this.scaleLabel === 'kly' ? 1000 * LY : MPC;
    const worldPerPx = (this.dist * 2) / (f * this.h);
    const target = 120 * worldPerPx;
    const nice = Math.pow(10, Math.floor(Math.log10(target)));
    const len = [1, 2, 5, 10].map((k) => k * nice).find((x) => x >= target * 0.5) ?? nice;
    const px = len / worldPerPx;
    g.strokeStyle = 'rgba(232,238,246,0.7)';
    g.beginPath();
    g.moveTo(24, this.h - 40); g.lineTo(24 + px, this.h - 40);
    g.moveTo(24, this.h - 44); g.lineTo(24, this.h - 36);
    g.moveTo(24 + px, this.h - 44); g.lineTo(24 + px, this.h - 36);
    g.stroke();
    g.fillStyle = 'rgba(232,238,246,0.8)';
    const alt = formatDistance(len * unitM);
    g.fillText(alt.endsWith(this.scaleLabel) ? `${len} ${this.scaleLabel}` : `${len} ${this.scaleLabel}  (${alt})`, 24, this.h - 54);
    const s = this.src;
    const what = this.level === 'system' ? s?.system?.name ?? 'no system' : this.level === 'local' ? `within 120 ly · ${s?.cosmos.current?.name ?? ''}` : this.level === 'galaxy' ? s?.cosmos.current?.name ?? 'nearest galaxy' : `${s?.cosmos.galaxies.length ?? 0} galaxies`;
    this.info.textContent = `${LEVELS.find((l) => l.id === this.level)!.label}: ${what} · ${this.points.filter((p) => p.target).length} objects`;
  }

  private click(x: number, y: number, travel: boolean) {
    let best: { p: MapPoint; d: number } | null = null;
    for (const s of this.screen) {
      const d = Math.hypot(s.x - x, s.y - y) - s.p.size;
      if (d < 12 && (!best || d < best.d)) best = { p: s.p, d };
    }
    if (best?.p.target && this.src) {
      this.src.select(best.p.target(), travel);
      if (travel) this.close();
    }
  }
}

function nearestGalaxy(s: MapSources): GalaxyParams | null {
  let best: GalaxyParams | null = null;
  let bd = Infinity;
  for (const g of s.cosmos.galaxies) {
    const d = g.upos.distanceTo(s.camUPos);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

/** Monte-Carlo point cloud of a galaxy's stellar density (cached). */
function galaxyPoints(g: GalaxyParams): { pts: Float32Array; col: string[] } {
  const c = galaxyCloud.get(g.id);
  if (c) return c;
  ensureDensity(g);
  const rng = new Rng(g.seed ^ 0x51a7);
  const N = 14000;
  const pts = new Float32Array(N * 3);
  const col: string[] = [];
  const pd: PopDensity = { young: 0, disk: 0, bulge: 0, halo: 0 };
  const R = g.radius;
  const flat = g.type === 'elliptical' ? Math.min(1, g.ellipAxes[1] / Math.max(g.ellipAxes[0], 1e-3)) : 0.25;
  densities(g, 0, 0, 0, pd);
  const ref = Math.max(pd.young + pd.disk + pd.bulge + pd.halo, 1e-12);
  let k = 0;
  for (let it = 0; it < 900000 && k < N; it++) {
    const x = rng.range(-R, R), z = rng.range(-R, R), y = rng.range(-R * flat, R * flat);
    densities(g, x, y, z, pd);
    const tot = pd.young + pd.disk + pd.bulge + pd.halo;
    // compressed density, with young (arm) populations emphasised so structure reads
    if (rng.next() > Math.pow(tot / ref, 0.5) * (0.3 + 2.2 * (pd.young / tot))) continue;
    pts[k * 3] = x;
    pts[k * 3 + 1] = y;
    pts[k * 3 + 2] = z;
    const yb = pd.young / tot, bb = (pd.bulge + pd.halo) / tot;
    col.push(yb > 0.25 ? 'rgba(150,185,255,0.75)' : bb > 0.5 ? 'rgba(255,214,160,0.6)' : 'rgba(230,225,215,0.55)');
    k++;
  }
  const out = { pts: pts.subarray(0, k * 3), col };
  galaxyCloud.set(g.id, out);
  return out;
}


