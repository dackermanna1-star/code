/**
 * 2D overlay drawn over the 3D view: object labels, orbit lines, the
 * selection reticle (with an off-screen pointer) and flight markers.
 *
 * Everything is projected on the CPU in float64 from camera-relative
 * positions, so labels and orbits stay exact at any scale without touching
 * the HDR pipeline.
 */
import * as THREE from 'three';
import type { Body, StarSystem } from '../astro/body';
import { orbitState } from '../astro/orbit';
import { LY, PC } from '../core/constants';
import { UPos } from '../core/upos';
import { formatDistance } from '../core/mathutil';
import type { SceneRenderer } from '../render/scenerenderer';
import type { Cosmos } from '../sim/cosmos';
import type { World } from '../sim/world';
import type { Target } from '../sim/targets';
import type { Player } from '../sim/player';
import type { StarRef } from '../render/starfield';
import { starDesignation } from '../astro/starsectors';

const ORBIT_SAMPLES = 160;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _u = new UPos();

interface Screen { x: number; y: number; depth: number }
interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface OverlayState {
  world: World;
  cosmos: Cosmos;
  renderer: SceneRenderer;
  player: Player;
  selected: Target | null;
  showLabels: boolean;
  showOrbits: boolean;
}

/** Apparent visual magnitude of a star of visual luminosity lumV (L☉) at d metres. */
export function apparentMag(lumV: number, d: number): number {
  return 4.83 - 2.5 * Math.log10(Math.max(lumV, 1e-12)) + 5 * Math.log10(Math.max(d / PC, 1e-12)) - 5;
}

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private qInv = new THREE.Quaternion();
  private f = 1;
  pxAngle = 1e-3;
  private orbitCache = new Map<string, Float64Array>();
  private cachedSystem: StarSystem | null = null;
  private brightStars: { star: StarRef; name: string }[] = [];
  private brightFrame = -1000;
  private placed: Rect[] = [];

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'overlay';
    parent.prepend(this.canvas);
    this.g = this.canvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** Project a camera-relative vector to CSS pixels; null if behind the camera. */
  project(rel: THREE.Vector3, out: Screen = { x: 0, y: 0, depth: 0 }): Screen | null {
    const v = _v2.copy(rel).applyQuaternion(this.qInv);
    if (v.z >= 0) return null;
    const iz = -1 / v.z;
    out.x = (0.5 + (v.x * iz * this.f * this.h) / (2 * this.w)) * this.w;
    out.y = (0.5 - (v.y * iz * this.f) / 2) * this.h;
    out.depth = -v.z;
    return out;
  }

  /** Screen rectangles (CSS px) that labels must avoid, e.g. open panels. */
  avoid: DOMRect[] = [];
  /** Resolved discs of the active system's bodies this frame (for label occlusion). */
  private discs: { x: number; y: number; r: number; d: number }[] = [];

  /** True if a point at distance d (m) in direction rel is hidden behind a body disc. */
  private occluded(x: number, y: number, d: number): boolean {
    for (const c of this.discs) if (c.d < d && (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) return true;
    return false;
  }

  draw(s: OverlayState) {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    const cam = s.renderer.camera;
    this.qInv.copy(cam.quaternion).invert();
    this.f = 1 / Math.tan((cam.fov * Math.PI) / 360);
    this.pxAngle = (2 * Math.tan((cam.fov * Math.PI) / 360)) / this.h;
    this.placed.length = 0;
    for (const r of this.avoid) this.placed.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    const sys = s.world.system;
    this.discs.length = 0;
    if (sys) {
      for (const b of sys.bodies) {
        const rel = s.renderer.bodyRel.get(b.id);
        if (!rel || b.kind === 'barycenter') continue;
        const d = rel.length();
        const r = b.radius / d / this.pxAngle;
        if (r < 2) continue;
        const p = this.project(rel);
        if (p) this.discs.push({ x: p.x, y: p.y, r, d });
      }
    }
    if (sys !== this.cachedSystem) {
      this.orbitCache.clear();
      this.cachedSystem = sys;
    }
    g.font = '500 12px Inter, system-ui, sans-serif';
    g.textBaseline = 'middle';
    if (s.selected) this.drawSelection(s);
    if (s.player.mode === 'ship') this.drawFlightMarkers(s);
    if (sys && s.showOrbits) this.drawOrbits(s, sys);
    if (s.showLabels) {
      if (sys) this.drawBodyLabels(s, sys);
      this.drawTransientLabels(s);
      this.drawRogueLabels(s);
      this.drawStarLabels(s);
      this.drawNebulaLabels(s);
      this.drawGalaxyLabels(s);
    }
  }

  // ------------------------------------------------------------------ orbits
  private orbitPoints(b: Body): Float64Array | null {
    const o = b.orbit;
    if (!o || o.e >= 1 || !b.parent) return null;
    let pts = this.orbitCache.get(b.id);
    if (pts) return pts;
    pts = new Float64Array(ORBIT_SAMPLES * 3);
    const n = Math.sqrt(o.mu / (o.a * o.a * o.a));
    const p = new THREE.Vector3();
    for (let i = 0; i < ORBIT_SAMPLES; i++) {
      const E = (i / ORBIT_SAMPLES) * Math.PI * 2;
      const M = E - o.e * Math.sin(E);
      orbitState(o, o.epoch + (M - o.M0) / n, p);
      pts[i * 3] = p.x;
      pts[i * 3 + 1] = p.y;
      pts[i * 3 + 2] = p.z;
    }
    this.orbitCache.set(b.id, pts);
    return pts;
  }

  private drawOrbits(s: OverlayState, sys: StarSystem) {
    const g = this.g;
    const r = s.renderer;
    const parentRel = new THREE.Vector3();
    const p = new THREE.Vector3();
    const a = { x: 0, y: 0, depth: 0 }, bScr = { x: 0, y: 0, depth: 0 };
    for (const b of sys.bodies) {
      if (!b.orbit || !b.parent || b.kind === 'barycenter' && !b.children.length) continue;
      if (b.isStarLike && b.parent.kind === 'barycenter' && b.orbit.a < 1e9) continue;
      const pts = this.orbitPoints(b);
      if (!pts) continue;
      r.relOf(s.world, b.parent, parentRel);
      const size = b.orbit.a / Math.max(parentRel.length(), 1) / this.pxAngle;
      const sel = s.selected?.body === b;
      const minSize = b.kind === 'moon' ? 30 : b.kind === 'asteroid' || b.kind === 'comet' ? 40 : 10;
      if (size < minSize && !sel) continue;
      const alpha = sel ? 0.9 : Math.min(1, (size - minSize) / 60) * (b.kind === 'moon' ? 0.35 : b.kind === 'planet' ? 0.5 : 0.3);
      if (alpha <= 0.01) continue;
      g.strokeStyle = sel ? `rgba(255,207,124,${alpha})` : b.isStarLike ? `rgba(255,220,160,${alpha})` : b.kind === 'comet' ? `rgba(150,230,255,${alpha})` : `rgba(124,196,255,${alpha})`;
      g.lineWidth = sel ? 1.6 : 1;
      g.beginPath();
      let prev: Screen | null = null;
      for (let i = 0; i <= ORBIT_SAMPLES; i++) {
        const k = (i % ORBIT_SAMPLES) * 3;
        p.set(pts[k], pts[k + 1], pts[k + 2]).applyQuaternion(sys.q).add(parentRel);
        const cur = this.project(p, i % 2 ? a : bScr);
        if (cur && prev) g.lineTo(cur.x, cur.y);
        else if (cur) g.moveTo(cur.x, cur.y);
        prev = cur ? { ...cur } : null;
      }
      g.stroke();
    }
  }

  // ------------------------------------------------------------------ labels
  private tryPlace(x: number, y: number, w: number, h: number): boolean {
    const r = { x0: x - 2, y0: y - h / 2 - 1, x1: x + w + 2, y1: y + h / 2 + 1 };
    if (r.x1 < 0 || r.x0 > this.w || r.y1 < 0 || r.y0 > this.h) return false;
    for (const q of this.placed) if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) return false;
    this.placed.push(r);
    return true;
  }

  private label(x: number, y: number, text: string, color: string, marker: 'ring' | 'dot' | 'none', offset: number, sub?: string) {
    const g = this.g;
    const tw = g.measureText(text).width;
    const lx = x + offset + 6;
    if (!this.tryPlace(lx, y, tw + (sub ? 0 : 0), 14)) return false;
    if (marker !== 'none') {
      g.strokeStyle = color;
      g.lineWidth = 1;
      g.beginPath();
      if (marker === 'ring') g.arc(x, y, Math.max(offset, 4), 0, Math.PI * 2);
      else g.arc(x, y, 1.6, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillText(text, lx + 1, y + 1);
    g.fillStyle = color;
    g.fillText(text, lx, y);
    if (sub) {
      g.save();
      g.font = '400 10px Inter, system-ui, sans-serif';
      g.fillStyle = 'rgba(200,215,235,0.6)';
      g.fillText(sub, lx, y + 12);
      g.restore();
    }
    return true;
  }

  private drawBodyLabels(s: OverlayState, sys: StarSystem) {
    const r = s.renderer;
    const items: { b: Body; rel: THREE.Vector3; d: number; disc: number; pri: number }[] = [];
    const parentRel = new THREE.Vector3();
    for (const b of sys.bodies) {
      if (b.kind === 'barycenter') continue;
      const rel = r.bodyRel.get(b.id);
      if (!rel) continue;
      const d = rel.length();
      const disc = b.radius / d / this.pxAngle;
      let pri = b.isStarLike ? 0 : b.kind === 'planet' ? 1 : b.kind === 'dwarf-planet' ? 2 : b.kind === 'moon' ? 3 : 4;
      if (s.selected?.body === b) pri = -1;
      if (!b.isStarLike && b.orbit && b.parent && pri >= 0) {
        r.relOf(s.world, b.parent, parentRel);
        const orbitPx = b.orbit.a / Math.max(parentRel.length(), 1) / this.pxAngle;
        const need = pri === 1 ? 12 : pri === 2 ? 24 : pri === 3 ? 36 : 60;
        if (orbitPx < need && disc < 3) continue;
      }
      if (disc > this.h * 0.4) continue; // we are right next to it
      items.push({ b, rel, d, disc, pri });
    }
    items.sort((a, b) => a.pri - b.pri || a.d - b.d);
    const occ = items.filter((i) => i.disc > 2);
    const scr = { x: 0, y: 0, depth: 0 };
    for (const it of items) {
      const p = this.project(it.rel, scr);
      if (!p) continue;
      let hidden = false;
      for (const o of occ) {
        if (o === it || o.d >= it.d) continue;
        const ang = it.rel.angleTo(o.rel);
        if (ang < o.b.radius / o.d) { hidden = true; break; }
      }
      if (hidden) continue;
      const b = it.b;
      const col = b.isStarLike ? '#ffd9a0' : b.kind === 'moon' ? '#b8c4d4' : b.kind === 'planet' ? '#9fd4ff' : '#a0b0c0';
      const life = b.planet?.life && b.planet.life.kind !== 'none' && b.planet.life.kind !== 'prebiotic';
      const sub = it.pri <= 1 && it.disc < 40 ? formatDistance(Math.max(it.d - b.radius, 0)) : undefined;
      this.label(p.x, p.y, b.displayName + (life ? ' ✦' : ''), col, it.disc < 3 ? 'ring' : 'none', Math.max(it.disc, 4), sub);
    }
  }

  private drawStarLabels(s: OverlayState) {
    const cosmos = s.cosmos;
    const camU = s.renderer.camUPos;
    const scr = { x: 0, y: 0, depth: 0 };
    // catalogued systems
    const known: { name: string; rel: THREE.Vector3; m: number; col: [number, number, number] }[] = [];
    for (const k of cosmos.knownSystems) {
      if (k.id === cosmos.activeRef?.id || !cosmos.current || k.galaxyId !== cosmos.current.id) continue;
      const rel = k.upos.sub(camU, new THREE.Vector3());
      const d = rel.length();
      const m = k.lumV ? apparentMag(k.lumV, d) : 99;
      if (m > 4.5 && d > 15 * LY) continue;
      known.push({ name: k.name, rel, m, col: k.color ?? [1, 1, 1] });
    }
    known.sort((a, b) => a.m - b.m);
    for (const k of known.slice(0, 30)) {
      const p = this.project(k.rel, scr);
      if (!p || this.occluded(p.x, p.y, k.rel.length())) continue;
      this.label(p.x, p.y, k.name, starCss(k.col), 'none', 5);
    }
    // a few bright procedural stars
    const g = cosmos.current;
    if (!g) return;
    const frame = s.renderer.frame;
    if (frame - this.brightFrame > 30) {
      this.brightFrame = frame;
      const list: { star: StarRef; m: number }[] = [];
      for (const st of s.renderer.starField.stars()) {
        if (st.lumV <= 0) continue;
        const d = Math.hypot(st.x - cosmos.camG.x, st.y - cosmos.camG.y, st.z - cosmos.camG.z) * LY;
        const m = apparentMag(st.lumV, d);
        if (m < 1.0) list.push({ star: st, m });
      }
      list.sort((a, b) => a.m - b.m);
      this.brightStars = list.slice(0, 6).map((x) => ({ star: x.star, name: starDesignation(g, x.star.level, x.star.ix, x.star.iy, x.star.iz, x.star.index) }));
    }
    const active = cosmos.activeRef?.id;
    for (const b of this.brightStars) {
      const st = b.star;
      if (active && active.endsWith(`/${st.level}:${st.ix}:${st.iy}:${st.iz}:${st.index}`)) continue;
      const rel = _v.set(st.x - cosmos.camG.x, st.y - cosmos.camG.y, st.z - cosmos.camG.z).multiplyScalar(LY).applyQuaternion(g.q);
      const p = this.project(rel, scr);
      if (!p || this.occluded(p.x, p.y, rel.length())) continue;
      this.label(p.x, p.y, b.name, 'rgba(220,228,240,0.7)', 'none', 5);
    }
  }

  private drawRogueLabels(s: OverlayState) {
    const cosmos = s.cosmos;
    const g = cosmos.current;
    if (!g) return;
    const scr = { x: 0, y: 0, depth: 0 };
    for (const rg of cosmos.rogues) {
      if (rg.id === cosmos.activeRef?.id) continue;
      const relLy = rg.local.clone().sub(cosmos.camG);
      if (relLy.length() > 3) continue;
      const rel = relLy.multiplyScalar(LY).applyQuaternion(g.q);
      const p = this.project(rel, scr);
      if (!p || this.occluded(p.x, p.y, rel.length())) continue;
      this.label(p.x, p.y, `${rg.name} · rogue planet (IR)`, 'rgba(200,150,255,0.75)', 'ring', 4);
    }
  }

  private drawTransientLabels(s: OverlayState) {
    const camU = s.renderer.camUPos;
    const scr = { x: 0, y: 0, depth: 0 };
    for (const tr of s.renderer.transients) {
      const rel = tr.upos.sub(camU, new THREE.Vector3());
      const m = apparentMag(tr.lumV, rel.length());
      if (m > 7) continue;
      const p = this.project(rel, scr);
      if (!p || this.occluded(p.x, p.y, rel.length())) continue;
      this.label(p.x, p.y, `${tr.name}  m ${m.toFixed(1)}`, '#ffd27a', 'ring', 6);
    }
  }

  private drawNebulaLabels(s: OverlayState) {
    const cosmos = s.cosmos;
    const g = cosmos.current;
    if (!g) return;
    const scr = { x: 0, y: 0, depth: 0 };
    const items: { name: string; rel: THREE.Vector3; px: number; known: boolean }[] = [];
    for (const n of cosmos.nebulae) {
      const rel = n.center.clone().sub(cosmos.camG).multiplyScalar(LY).applyQuaternion(g.q);
      const d = rel.length();
      if (d < n.radius * LY) continue;
      const px = (n.radius * LY) / d / this.pxAngle;
      if (px < 10 && !(n.known && px > 1.5)) continue;
      items.push({ name: n.name, rel, px, known: n.known });
    }
    items.sort((a, b) => b.px - a.px);
    for (const it of items.slice(0, 12)) {
      if (it.px > this.h * 0.5) continue;
      const p = this.project(it.rel, scr);
      if (!p || this.occluded(p.x, p.y, it.rel.length())) continue;
      this.label(p.x, p.y, it.name, it.known ? '#ffb3c8' : 'rgba(255,180,200,0.7)', 'none', Math.min(it.px, 30) * 0.4);
    }
  }

  private drawGalaxyLabels(s: OverlayState) {
    const cosmos = s.cosmos;
    const camU = s.renderer.camUPos;
    const items: { name: string; rel: THREE.Vector3; px: number; known: boolean }[] = [];
    for (const gal of cosmos.galaxies) {
      if (gal === cosmos.current) continue;
      const rel = gal.upos.sub(camU, new THREE.Vector3());
      const d = rel.length();
      const px = (gal.radius * LY) / d / this.pxAngle;
      if (px < 5 && !(gal.known && px > 0.5)) continue;
      items.push({ name: gal.name, rel, px, known: gal.known });
    }
    items.sort((a, b) => b.px - a.px);
    const scr = { x: 0, y: 0, depth: 0 };
    for (const it of items.slice(0, 24)) {
      if (it.px > this.h * 0.6) continue;
      const p = this.project(it.rel, scr);
      if (!p || this.occluded(p.x, p.y, it.rel.length())) continue;
      this.label(p.x, p.y, it.name, it.known ? '#d6c8ff' : 'rgba(200,190,240,0.75)', 'none', Math.min(it.px, 40) * 0.5);
    }
  }

  // --------------------------------------------------------------- selection
  targetRel(s: OverlayState, t: Target, out: THREE.Vector3): THREE.Vector3 {
    if (t.kind === 'body' && t.body && t.body.system === s.world.system) {
      const rel = s.renderer.bodyRel.get(t.body.id);
      if (rel) return out.copy(rel);
      return s.renderer.relOf(s.world, t.body, out);
    }
    return t.position(_u).sub(s.renderer.camUPos, out);
  }

  private drawSelection(s: OverlayState) {
    const t = s.selected!;
    const g = this.g;
    const rel = this.targetRel(s, t, new THREE.Vector3());
    const d = rel.length();
    const disc = t.radius / Math.max(d, 1) / this.pxAngle;
    const p = this.project(rel);
    const col = '#ffcf7c';
    const surfaceD = t.kind === 'body' ? Math.max(d - t.radius, 0) : d;
    const distTxt = formatDistance(surfaceD);
    if (p && p.x > -50 && p.x < this.w + 50 && p.y > -50 && p.y < this.h + 50) {
      const R = Math.min(Math.max(disc * 1.12, 12), this.h * 0.45);
      const L = Math.max(5, R * 0.3);
      g.strokeStyle = col;
      g.lineWidth = 1.5;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = p.x + sx * R, cy = p.y + sy * R;
        g.moveTo(cx, cy - sy * L);
        g.lineTo(cx, cy);
        g.lineTo(cx - sx * L, cy);
      }
      g.stroke();
      const ty = Math.min(p.y + R + 14, this.h - 20);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText(t.name, p.x + 1, ty + 1);
      g.fillStyle = col;
      g.fillText(t.name, p.x, ty);
      g.font = '400 11px "JetBrains Mono", monospace';
      g.fillStyle = 'rgba(255,230,190,0.8)';
      g.fillText(distTxt, p.x, ty + 14);
      g.font = '500 12px Inter, system-ui, sans-serif';
      g.textAlign = 'left';
      this.placed.push({ x0: p.x - R, y0: p.y - R, x1: p.x + R, y1: ty + 20 });
      return;
    }
    // off-screen: arrow at the screen edge
    const v = _v.copy(rel).applyQuaternion(this.qInv);
    let ax = v.x, ay = -v.y;
    if (v.z > 0 && Math.abs(ax) + Math.abs(ay) < 1e-9) ax = 1;
    const len = Math.hypot(ax, ay) || 1;
    ax /= len;
    ay /= len;
    const cx = this.w / 2, cy = this.h / 2;
    const k = Math.min((cx - 40) / Math.max(Math.abs(ax), 1e-6), (cy - 40) / Math.max(Math.abs(ay), 1e-6));
    const x = cx + ax * k, y = cy + ay * k;
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(ay, ax));
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(12, 0);
    g.lineTo(-6, -7);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = col;
    g.textAlign = ax > 0.3 ? 'right' : ax < -0.3 ? 'left' : 'center';
    g.fillText(`${t.name} · ${distTxt}`, x - ax * 22, y - ay * 22);
    g.textAlign = 'left';
  }

  private drawFlightMarkers(s: OverlayState) {
    const ship = s.player.ship;
    if (!ship || !ship.frame.body || ship.landed) return;
    const v = ship.velocity;
    if (v.lengthSq() < 0.25) return;
    const g = this.g;
    const dir = _v.copy(v).normalize().multiplyScalar(1e9);
    const pro = this.project(dir);
    g.lineWidth = 1.5;
    if (pro) {
      g.strokeStyle = '#8fe3a5';
      g.beginPath();
      g.arc(pro.x, pro.y, 7, 0, Math.PI * 2);
      g.moveTo(pro.x, pro.y - 7); g.lineTo(pro.x, pro.y - 13);
      g.moveTo(pro.x - 7, pro.y); g.lineTo(pro.x - 13, pro.y);
      g.moveTo(pro.x + 7, pro.y); g.lineTo(pro.x + 13, pro.y);
      g.stroke();
    }
    const retro = this.project(dir.negate());
    if (retro) {
      g.strokeStyle = '#ff9f6b';
      g.beginPath();
      g.arc(retro.x, retro.y, 7, 0, Math.PI * 2);
      g.moveTo(retro.x - 5, retro.y - 5); g.lineTo(retro.x + 5, retro.y + 5);
      g.moveTo(retro.x + 5, retro.y - 5); g.lineTo(retro.x - 5, retro.y + 5);
      g.stroke();
    }
  }
}

function starCss(c: [number, number, number]): string {
  const m = Math.max(c[0], c[1], c[2], 1e-6);
  const f = (x: number) => Math.round(150 + 105 * Math.pow(x / m, 0.6));
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}
