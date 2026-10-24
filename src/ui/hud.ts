// In-game HUD: tachometer/speedometer, damage diagram, mechanical status,
// minimap, chips, toasts.

import type { Game, Notice } from '../game/game.ts';
import { h } from './dom.ts';
import { ZONES, PADS } from '../game/map/layout.ts';
import { Zone as DZone } from '../sim/vehicle/structure.ts';

function dmgColor(v: number): string {
  // green -> yellow -> red
  const t = Math.max(0, Math.min(1, v));
  const r = t < 0.5 ? Math.round(80 + t * 2 * 175) : 255;
  const g = t < 0.5 ? 210 : Math.round(210 - (t - 0.5) * 2 * 170);
  return `rgb(${r},${g},70)`;
}

export class HUD {
  readonly root: HTMLElement;
  private game: Game;
  private zoneEl: HTMLElement;
  private chipsEl: HTMLElement;
  private toastsEl: HTMLElement;
  private tacho: HTMLCanvasElement;
  private dmg: HTMLCanvasElement;
  private mini: HTMLCanvasElement;
  private mech: HTMLElement;
  private fpsEl: HTMLElement;
  private hint: HTMLElement;
  private miniBase: HTMLCanvasElement;
  private t = 0;
  private lastChips = '';

  constructor(game: Game) {
    this.game = game;
    this.zoneEl = h('div', { class: 'zone-name' }, '');
    this.chipsEl = h('div', { class: 'chips' });
    this.toastsEl = h('div', { class: 'toasts' });
    this.tacho = h('canvas', { id: 'tacho' });
    this.dmg = h('canvas', { id: 'dmgCanvas' });
    this.mini = h('canvas', { id: 'minimap' });
    this.mech = h('div', { class: 'mech' });
    this.fpsEl = h('div', { class: 'fps hidden' });
    this.hint = h('div', { class: 'hint' }, 'H controls · C camera · T slow-mo · R reset · Esc menu');
    this.root = h(
      'div',
      { id: 'hud' },
      h('div', { class: 'hud-tl' }, this.zoneEl, this.chipsEl),
      h('div', { class: 'hud-tr' }, this.mini),
      this.toastsEl,
      this.fpsEl,
      h('div', { class: 'hud-bl' }, h('div', { class: 'panel damage-card' }, this.dmg, this.mech)),
      h('div', { class: 'hud-br' }, this.tacho),
      this.hint,
    );
    this.miniBase = this.buildMinimapBase();
    this.sizeCanvases();
    window.addEventListener('resize', () => this.sizeCanvases());
  }

  private sizeCanvases(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.tacho, this.dmg, this.mini]) {
      const r = c.getBoundingClientRect();
      const w = Math.max(10, Math.round((r.width || 200) * dpr)), hh = Math.max(10, Math.round((r.height || 200) * dpr));
      if (c.width !== w || c.height !== hh) {
        c.width = w;
        c.height = hh;
      }
    }
  }

  toast(n: Notice): void {
    const el = h('div', { class: `toast ${n.kind}` }, n.text);
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.removeChild(this.toastsEl.firstChild!);
    setTimeout(() => el.classList.add('out'), n.kind === 'bad' ? 3200 : 2200);
    setTimeout(() => el.remove(), n.kind === 'bad' ? 3700 : 2700);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) this.sizeCanvases();
  }

  update(dt: number): void {
    this.t += dt;
    if (this.t < 1 / 30) return;
    this.t = 0;
    const g = this.game;
    const p = g.player;
    this.zoneEl.textContent = g.currentZone.name;
    const chips: [string, string][] = [];
    if (g.paused) chips.push(['PAUSED', 'red']);
    if (g.timeScale !== 1) chips.push([`SLOW-MO ×${g.timeScale}`, 'amber']);
    if (g.rig.mode !== 'chase') chips.push([g.rig.mode.toUpperCase() + ' CAM', 'blue']);
    if (p && !p.vehicle.drivetrain.automatic) chips.push(['MANUAL', '']);
    if (g.settings.fragility !== 1) chips.push([`DAMAGE ×${g.settings.fragility}`, '']);
    const key = chips.map((c) => c.join()).join('|');
    if (key !== this.lastChips) {
      this.lastChips = key;
      this.chipsEl.replaceChildren(...chips.map(([t, c]) => h('span', { class: `chip ${c}` }, t)));
    }
    this.fpsEl.classList.toggle('hidden', !g.settings.showFps);
    if (g.settings.showFps) this.fpsEl.textContent = `${g.fps.toFixed(0)} fps · phys ${g.physMs.toFixed(1)} ms · frame ${g.frameMs.toFixed(1)} ms`;
    if (p) {
      this.drawTacho();
      this.drawDamage();
      this.drawMinimap();
    }
  }

  private drawTacho(): void {
    const c = this.tacho;
    const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    const s = W / 230;
    ctx.clearRect(0, 0, W, H);
    const v = this.game.player!.vehicle;
    const d = v.drivetrain;
    const e = v.def.engine;
    const cx = W / 2, cy = H / 2 + 6 * s, R = 98 * s;
    const maxR = Math.ceil(e.maxRpm / 1000) * 1000;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = (rpm: number) => a0 + (a1 - a0) * Math.min(1, Math.max(0, rpm / maxR));
    // backdrop
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,12,17,0.72)';
    ctx.fill();
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    // track
    ctx.lineCap = 'round';
    ctx.lineWidth = 8 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(cx, cy, R - 6 * s, a0, a1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,60,60,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, R - 6 * s, ang(e.redline), a1);
    ctx.stroke();
    // rpm fill
    const rpm = d.rpm;
    const grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#4fb3ff');
    grad.addColorStop(0.7, '#ffb020');
    grad.addColorStop(1, '#ff4d4d');
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 6 * s, a0, ang(rpm));
    ctx.stroke();
    // ticks
    ctx.fillStyle = '#c6d0da';
    ctx.font = `600 ${11 * s}px Barlow, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r <= maxR; r += 1000) {
      const a = ang(r);
      ctx.strokeStyle = r >= e.redline ? '#ff6b6b' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 16 * s), cy + Math.sin(a) * (R - 16 * s));
      ctx.lineTo(cx + Math.cos(a) * (R - 24 * s), cy + Math.sin(a) * (R - 24 * s));
      ctx.stroke();
      ctx.fillText(String(r / 1000), cx + Math.cos(a) * (R - 35 * s), cy + Math.sin(a) * (R - 35 * s));
    }
    // needle
    const na = ang(rpm);
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(na) * 20 * s, cy + Math.sin(na) * 20 * s);
    ctx.lineTo(cx + Math.cos(na) * (R - 8 * s), cy + Math.sin(na) * (R - 8 * s));
    ctx.stroke();
    // speed
    const kmh = Math.abs(v.speed) * 3.6;
    ctx.fillStyle = '#eef2f6';
    ctx.font = `700 ${46 * s}px Barlow, system-ui, sans-serif`;
    ctx.fillText(kmh.toFixed(0), cx, cy + 6 * s);
    ctx.fillStyle = '#93a1b0';
    ctx.font = `600 ${11 * s}px Barlow, system-ui, sans-serif`;
    ctx.fillText('KM/H', cx, cy + 34 * s);
    // gear
    const gear = d.shiftTimer > 0 ? d.pendingGear : d.gear;
    const gs = gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, cx - 16 * s, cy + 46 * s, 32 * s, 28 * s, 6 * s);
    ctx.fill();
    ctx.fillStyle = gear < 0 ? '#ff8a8a' : '#ffb020';
    ctx.font = `800 ${20 * s}px Barlow, system-ui, sans-serif`;
    ctx.fillText(gs, cx, cy + 60 * s);
    ctx.font = `700 ${9 * s}px Barlow, system-ui, sans-serif`;
    ctx.fillStyle = '#93a1b0';
    ctx.fillText(d.automatic ? 'AUTO' : 'MAN', cx, cy + 82 * s);
    // indicators
    const ind: [string, boolean, string][] = [
      ['ABS', v.wheels.some((w) => w.absActive), '#ffb020'],
      ['TC', v.tractionControl && v.controls.throttle < v.input.throttle - 0.05, '#ffb020'],
      ['ENG', v.damage.engine > 0.3 || !d.running, '#ff4d4d'],
      ['HB', v.controls.handbrake > 0, '#ff4d4d'],
    ];
    ind.forEach(([t, on, col], i) => {
      ctx.fillStyle = on ? col : 'rgba(255,255,255,0.18)';
      ctx.font = `800 ${10 * s}px Barlow, system-ui, sans-serif`;
      ctx.fillText(t, cx - 45 * s + i * 30 * s, cy - 36 * s);
    });
  }

  private drawDamage(): void {
    const c = this.dmg;
    const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const v = this.game.player!.vehicle;
    const z = v.damage.zones;
    const bx = W * 0.18, by = H * 0.06, bw = W * 0.64, bh = H * 0.88;
    const r = bw * 0.28;
    // body outline
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, r);
    ctx.clip();
    const seg = (y0: number, y1: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(bx, by + bh * y0, bw, bh * (y1 - y0));
    };
    seg(0, 0.28, dmgColor(z[DZone.FRONT]));
    seg(0.72, 1, dmgColor(z[DZone.REAR]));
    seg(0.28, 0.72, dmgColor(Math.max(z[DZone.FLOOR], z[DZone.ROOF] * 0.8)));
    ctx.fillStyle = dmgColor(z[DZone.LEFT]);
    ctx.fillRect(bx, by + bh * 0.28, bw * 0.22, bh * 0.44);
    ctx.fillStyle = dmgColor(z[DZone.RIGHT]);
    ctx.fillRect(bx + bw * 0.78, by + bh * 0.28, bw * 0.22, bh * 0.44);
    ctx.restore();
    // roof / windows
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    roundRect(ctx, bx + bw * 0.2, by + bh * 0.3, bw * 0.6, bh * 0.36, bw * 0.12);
    ctx.fill();
    const ws = v.windowState;
    const win = (i: number, x: number, y: number, w: number, hh: number) => {
      const s = ws[i] ?? 0;
      ctx.fillStyle = s === 2 ? 'rgba(255,77,77,0.9)' : s === 1 ? 'rgba(255,200,80,0.9)' : 'rgba(140,200,255,0.55)';
      ctx.fillRect(x, y, w, hh);
    };
    win(0, bx + bw * 0.22, by + bh * 0.27, bw * 0.56, bh * 0.04);
    if (v.struct.windows[1]?.name === 'rear') win(1, bx + bw * 0.22, by + bh * 0.69, bw * 0.56, bh * 0.03);
    // outline
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, W * 0.02);
    roundRect(ctx, bx, by, bw, bh, r);
    ctx.stroke();
    // wheels
    const wpos = [[0, 0.18], [1, 0.18], [0, 0.8], [1, 0.8]];
    v.wheels.forEach((w, i) => {
      const [sx, sy] = wpos[i];
      const x = sx === 0 ? bx - W * 0.12 : bx + bw + W * 0.02;
      const y = by + bh * sy - bh * 0.06;
      ctx.fillStyle = w.detached ? 'rgba(255,77,77,0.0)' : w.flat > 0.3 ? '#ff8c3a' : '#2b333b';
      ctx.strokeStyle = w.detached ? '#ff4d4d' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.max(1, W * 0.02);
      roundRect(ctx, x, y, W * 0.1, bh * 0.12, W * 0.03);
      ctx.fill();
      ctx.stroke();
    });
    // mechanical text (DOM, low rate)
    const d = v.damage;
    const health = Math.round((1 - d.engine) * 100);
    const temp = Math.round(d.temperature);
    const tires = v.wheels.map((w) => (w.detached ? 'off' : w.flat > 0.3 ? 'flat' : 'ok'));
    const bad = tires.filter((t) => t !== 'ok').length;
    const status = !v.drivetrain.running ? 'Engine off' : d.engine > 0.75 ? 'Critical' : d.engine > 0.3 ? 'Damaged' : 'Running';
    const html = `
      <div class="item"><span>Engine</span><b style="color:${health > 60 ? 'var(--good)' : health > 25 ? 'var(--warn)' : 'var(--bad)'}">${health}%</b></div>
      <div class="bar"><i style="width:${health}%;background:${health > 60 ? 'var(--good)' : health > 25 ? 'var(--warn)' : 'var(--bad)'}"></i></div>
      <div class="item"><span>Coolant</span><b style="color:${temp > 115 ? 'var(--bad)' : temp > 100 ? 'var(--warn)' : 'inherit'}">${temp}°C</b></div>
      <div class="item"><span>Tires</span><b style="color:${bad ? 'var(--warn)' : 'inherit'}">${bad ? `${bad} damaged` : 'OK'}</b></div>
      <div class="item"><span>Body</span><b>${Math.round(d.total * 100)}%</b></div>
      <div class="item"><span>Status</span><b>${status}</b></div>`;
    if (this.mech.innerHTML !== html) this.mech.innerHTML = html;
  }

  private buildMinimapBase(): HTMLCanvasElement {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const half = 800;
    const toPx = (x: number) => ((x + half) / (half * 2)) * S;
    ctx.fillStyle = '#18221a';
    ctx.fillRect(0, 0, S, S);
    // mountains ring
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(90,90,85,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(160,160,160,0.45)';
    for (const p of PADS) {
      ctx.fillRect(toPx(p.x - p.w / 2), toPx(p.z - p.d / 2), (p.w / (half * 2)) * S, (p.d / (half * 2)) * S);
    }
    ctx.strokeStyle = 'rgba(220,220,220,0.75)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of this.game.roads) {
      ctx.lineWidth = Math.max(1.5, (r.def.width / (half * 2)) * S);
      ctx.beginPath();
      r.samples.forEach((s, i) => (i ? ctx.lineTo(toPx(s.x), toPx(s.z)) : ctx.moveTo(toPx(s.x), toPx(s.z))));
      ctx.stroke();
    }
    for (const z of ZONES) {
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(toPx(z.x), toPx(z.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }

  private drawMinimap(): void {
    const c = this.mini;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const v = this.game.player!.vehicle;
    const px = v.position[0], pz = v.position[2];
    const heading = Math.atan2(v.forward[0], v.forward[2]);
    const viewR = 260; // meters radius shown
    const S = this.miniBase.width;
    const scale = W / (viewR * 2) * (1600 / S);
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(Math.PI + heading);
    ctx.scale(scale, scale);
    const mx = ((px + 800) / 1600) * S, mz = ((pz + 800) / 1600) * S;
    ctx.drawImage(this.miniBase, -mx, -mz);
    // other vehicles
    for (const e of this.game.vehicles) {
      if (e === this.game.player) continue;
      const ex = ((e.vehicle.position[0] + 800) / 1600) * S - mx, ez = ((e.vehicle.position[2] + 800) / 1600) * S - mz;
      ctx.fillStyle = e.role === 'ai' ? '#ff4d4d' : '#9aa4ad';
      ctx.beginPath();
      ctx.arc(ex, ez, 2.5 / scale * (W / 180), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // player arrow (always up)
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.fillStyle = '#ffb020';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    const a = W * 0.05;
    ctx.beginPath();
    ctx.moveTo(0, -a * 1.2);
    ctx.lineTo(a * 0.8, a);
    ctx.lineTo(0, a * 0.5);
    ctx.lineTo(-a * 0.8, a);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // north marker
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(Math.PI + heading);
    ctx.fillStyle = '#eef2f6';
    ctx.font = `700 ${W * 0.07}px Barlow, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -W * 0.42);
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + hh - r);
  ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
  ctx.lineTo(x + r, y + hh);
  ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
