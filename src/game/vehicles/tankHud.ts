/**
 * Gunner / commander HUD while crewing an M1 Abrams (DOM overlay inside the game HUD, so F1
 * hides it):
 *  - first person (gunner's primary sight): circular sight vignette, stadia reticle with the
 *    aiming box, magnification readout (C zooms 3× → 10×)
 *  - third person: aim circle at the screen centre and the gun cross where the stabilised gun
 *    actually points (they meet when the turret has caught up)
 *  - status panel: speed, gear, turbine, hull integrity, main gun state (loading bar / READY)
 *    and rounds, a hull/turret orientation diagram
 *  - a controls hint for a few seconds after climbing in
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { TankEntity } from '../../entity/vehicles/tank';
import { TANK } from '../../entity/vehicles/tankPhysics';

const CSS = `
.tank-hud { position: absolute; inset: 0; pointer-events: none; display: none; }
.tank-hud .panel { position: absolute; right: 18px; bottom: 96px; width: 210px; padding: 10px 12px;
  font: 600 12px/1.4 var(--font-mono, ui-monospace, Menlo, Consolas, monospace); color: #e9f2d0; letter-spacing: 0.04em;
  background: linear-gradient(180deg, rgba(14,16,10,0.62), rgba(14,16,10,0.42)); border: 1px solid rgba(230,240,190,0.22);
  border-radius: 8px; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
.tank-hud .row { display: flex; justify-content: space-between; align-items: baseline; }
.tank-hud .lbl { color: rgba(233,242,208,0.6); font-weight: 500; }
.tank-hud .big { font-size: 17px; }
.tank-hud .unit { color: rgba(233,242,208,0.6); font-size: 10px; margin-left: 3px; }
.tank-hud .bar { height: 5px; margin: 3px 0 6px; background: rgba(233,242,208,0.12); border-radius: 3px; overflow: hidden; }
.tank-hud .bar > div { height: 100%; background: #d9e8a8; border-radius: 3px; }
.tank-hud .ready { color: #9dff8a; text-shadow: 0 0 6px rgba(120,255,100,0.5); }
.tank-hud .loading { color: #ffcf5a; }
.tank-hud svg.ori { display: block; margin: 6px auto 0; }
.tank-hud .gx { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; }
.tank-hud .aim { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border: 2px solid rgba(255,255,255,0.75);
  border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,0.35); }
.tank-hud .sight { position: absolute; inset: 0; display: none;
  background: radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0 33vh, rgba(0,0,0,0.92) 34vh); }
.tank-hud .sight svg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
.tank-hud .mag { position: absolute; left: 50%; top: calc(50% + 36vh); transform: translateX(-50%);
  font: 600 13px var(--font-mono, ui-monospace, monospace); color: #ffb347; letter-spacing: 0.1em; }
.tank-hint { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); padding: 10px 16px; max-width: 700px;
  font: 500 13px/1.6 var(--font-ui, system-ui, sans-serif); color: #fff; background: rgba(0,0,0,0.58); border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15); text-align: center; pointer-events: none; transition: opacity 0.8s; opacity: 0; }
.tank-hint b { color: #ffe08a; }
.tank-hint kbd { display: inline-block; padding: 0 5px; margin: 0 1px; border-radius: 4px; background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.25); font: 600 12px/1.4 ui-monospace, monospace; }
.hud.tank-mode .crosshair { display: none; }
`;

const RETICLE = `<svg width="520" height="520" viewBox="-260 -260 520 520" fill="none" stroke="#ff9b3d" stroke-width="2">
  <line x1="-240" y1="0" x2="-28" y2="0"/><line x1="28" y1="0" x2="240" y2="0"/>
  <line x1="0" y1="28" x2="0" y2="240"/><line x1="0" y1="-240" x2="0" y2="-60"/>
  <rect x="-8" y="-8" width="16" height="16" stroke-width="1.5"/>
  <line x1="-3" y1="0" x2="3" y2="0" stroke-width="1"/><line x1="0" y1="-3" x2="0" y2="3" stroke-width="1"/>
  <g stroke-width="1.5">
    <line x1="-12" y1="40" x2="12" y2="40"/><line x1="-8" y1="62" x2="8" y2="62"/><line x1="-12" y1="84" x2="12" y2="84"/>
    <line x1="-8" y1="106" x2="8" y2="106"/><line x1="-12" y1="128" x2="12" y2="128"/>
  </g>
  <g fill="#ff9b3d" stroke="none" font-family="monospace" font-size="11">
    <text x="16" y="44">4</text><text x="16" y="88">8</text><text x="16" y="132">12</text>
  </g>
  <g stroke-width="1.5"><line x1="-80" y1="-6" x2="-80" y2="6"/><line x1="-150" y1="-6" x2="-150" y2="6"/>
    <line x1="80" y1="-6" x2="80" y2="6"/><line x1="150" y1="-6" x2="150" y2="6"/></g>
</svg>`;

const keyName = (code: string) =>
  code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code === 'ShiftLeft' || code === 'ShiftRight' ? 'Shift'
    : code === 'Space' ? 'Space' : code.startsWith('Mouse') ? ['LMB', 'MMB', 'RMB'][Number(code.slice(5))] ?? code : code;

export class TankHud {
  private readonly el: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly style: HTMLStyleElement;
  private readonly sight: HTMLElement;
  private readonly aim: HTMLElement;
  private readonly gx: HTMLElement;
  private readonly mag: HTMLElement;
  private f: Record<string, HTMLElement> = {};
  private turretLine: SVGLineElement;
  private acc = 0;
  private hintT = 0;
  private shown = false;
  private readonly v = new THREE.Vector3();
  private readonly d = new THREE.Vector3();

  constructor(private parent: HTMLElement) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'tank-hud';
    this.el.innerHTML = `
      <div class="sight">${RETICLE}<div class="mag">GPS 3×</div></div>
      <div class="aim"></div>
      <svg class="gx" viewBox="-13 -13 26 26" fill="none" stroke="#ffd36a" stroke-width="2"><path d="M-11 0H-4M4 0H11M0 -11V-4M0 4V11"/></svg>
      <div class="panel">
        <div class="row"><span class="lbl">SPD</span><span><span class="big" data-f="spd">0</span><span class="unit">km/h</span></span></div>
        <div class="row"><span class="lbl">GEAR</span><span data-f="gear">N</span></div>
        <div class="row"><span class="lbl">TURBINE</span><span><span data-f="eng">0</span><span class="unit">%</span></span></div>
        <div class="bar"><div data-f="engbar" style="width:0%"></div></div>
        <div class="row"><span class="lbl">HULL</span><span><span data-f="hull">100</span><span class="unit">%</span></span></div>
        <div class="bar"><div data-f="hullbar" style="width:100%"></div></div>
        <div class="row"><span class="lbl">120MM</span><span data-f="gun" class="ready">READY</span></div>
        <div class="bar"><div data-f="gunbar" style="width:100%"></div></div>
        <div class="row"><span class="lbl">ROUNDS</span><span data-f="ammo">42</span></div>
        <svg class="ori" width="64" height="64" viewBox="-32 -32 64 64">
          <rect x="-10" y="-20" width="20" height="40" rx="3" fill="rgba(233,242,208,0.12)" stroke="rgba(233,242,208,0.55)"/>
          <circle r="7" fill="rgba(233,242,208,0.35)"/>
          <line data-f="tl" x1="0" y1="0" x2="0" y2="-26" stroke="#ffd36a" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </div>`;
    parent.appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>('[data-f]').forEach((n) => (this.f[n.dataset.f!] = n));
    this.turretLine = this.el.querySelector('[data-f="tl"]') as unknown as SVGLineElement;
    this.sight = this.el.querySelector('.sight')!;
    this.aim = this.el.querySelector('.aim')!;
    this.gx = this.el.querySelector('.gx')!;
    this.mag = this.el.querySelector('.mag')!;
    this.hint = document.createElement('div');
    this.hint.className = 'tank-hint';
    parent.appendChild(this.hint);
  }

  showHint() {
    this.hintT = 14;
  }

  update(game: Game, dt: number) {
    const p = game.player as any;
    const t = p?.vehicle instanceof TankEntity ? (p.vehicle as TankEntity) : null;
    const on = !!t && !t.destroyed;
    if (on !== this.shown) {
      this.shown = on;
      this.el.style.display = on ? 'block' : 'none';
      this.parent.classList.toggle('tank-mode', on);
      if (!on) this.hintT = 0;
    }
    // controls hint
    if (this.hintT > 0 && on) {
      this.hintT -= dt;
      const b = (game.input as any)?.bindings ?? {};
      const k = (a: string, d: string) => `<kbd>${keyName(b[a] ?? d)}</kbd>`;
      this.hint.innerHTML = `<b>M1 Abrams</b> · ${k('forward', 'KeyW')}${k('back', 'KeyS')} drive / reverse · ${k('left', 'KeyA')}${k('right', 'KeyD')} steer (pivot when stopped) · ${k('jump', 'Space')} brake<br>`
        + `Mouse aims the turret · ${k('attack', 'Mouse0')} 120 mm gun · hold ${k('use', 'Mouse2')} coax MG · ${k('zoom', 'KeyC')} zoom · ${k('vehicleView', 'KeyV')} gunner's sight · ${k('sneak', 'ShiftLeft')} climb out`;
      this.hint.style.opacity = this.hintT > 1 ? '1' : String(Math.max(0, this.hintT));
    } else this.hint.style.opacity = '0';
    if (!on || !t) return;
    const first = game.cameraCtl.perspective === 'first';
    this.sight.style.display = first ? 'block' : 'none';
    this.aim.style.display = first ? 'none' : 'block';
    const zoom = (game.input as any)?.isDown?.('zoom');
    this.mag.textContent = zoom ? 'GPS 10×' : 'GPS 3×';
    // gun cross: where the gun points, 250 m out, projected
    const cam = game.cameraCtl.camera;
    t.gunLine(this.v, this.d);
    this.v.addScaledVector(this.d, 250).project(cam);
    const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
    this.gx.style.display = visible ? 'block' : 'none';
    if (visible) {
      this.gx.style.left = `${(this.v.x * 0.5 + 0.5) * 100}%`;
      this.gx.style.top = `${(-this.v.y * 0.5 + 0.5) * 100}%`;
    }
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;
    const b = t.body;
    const kmh = Math.abs(b.speed) * 3.6;
    this.f.spd.textContent = kmh.toFixed(0);
    this.f.gear.textContent = b.input.brake ? 'BRK' : b.speed > 0.3 ? 'F' : b.speed < -0.3 ? 'R' : 'N';
    this.f.eng.textContent = (b.spool * 100).toFixed(0);
    this.f.engbar.style.width = `${b.spool * 100}%`;
    const hp = Math.max(0, t.health / t.maxHealth);
    this.f.hull.textContent = (hp * 100).toFixed(0);
    this.f.hullbar.style.width = `${hp * 100}%`;
    this.f.hullbar.style.background = hp > 0.5 ? '#d9e8a8' : hp > 0.25 ? '#ffcf5a' : '#ff6a5a';
    const ready = t.reload <= 0;
    this.f.gun.textContent = ready ? 'READY' : `LOADING ${t.reload.toFixed(1)}s`;
    this.f.gun.className = ready ? 'ready' : 'loading';
    this.f.gunbar.style.width = `${(1 - t.reload / TANK.reload) * 100}%`;
    this.f.ammo.textContent = p.creative ? '∞' : String(t.rounds);
    const ty = b.turretYaw;
    this.turretLine.setAttribute('x2', String(-Math.sin(ty) * 26));
    this.turretLine.setAttribute('y2', String(-Math.cos(ty) * 26));
  }

  dispose() {
    this.el.remove();
    this.hint.remove();
    this.style.remove();
  }
}
