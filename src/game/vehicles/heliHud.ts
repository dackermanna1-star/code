/**
 * Cockpit HUD while piloting a helicopter (DOM overlay inside the game HUD, so F1 hides it):
 * altitude (MSL / AGL), airspeed, vertical speed, heading tape, rotor / engine RPM, collective,
 * hull integrity and caution messages; plus a controls hint shown for a few seconds after
 * boarding. Updated at ~12 Hz.
 */
import type { Game } from '../game';
import type { HelicopterEntity } from '../../entity/vehicles/helicopter';

const CSS = `
.heli-hud { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); width: 188px; padding: 10px 12px;
  font: 600 12px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #b8ffcf; letter-spacing: 0.04em;
  background: linear-gradient(180deg, rgba(6,14,10,0.55), rgba(6,14,10,0.35)); border: 1px solid rgba(140,255,180,0.28);
  border-radius: 8px; text-shadow: 0 0 6px rgba(80,255,140,0.45); pointer-events: none; display: none; }
.heli-hud .row { display: flex; justify-content: space-between; align-items: baseline; }
.heli-hud .lbl { color: rgba(184,255,207,0.6); font-weight: 500; }
.heli-hud .big { font-size: 17px; }
.heli-hud .unit { color: rgba(184,255,207,0.6); font-size: 10px; margin-left: 3px; }
.heli-hud .bar { height: 5px; margin: 3px 0 6px; background: rgba(184,255,207,0.12); border-radius: 3px; overflow: hidden; }
.heli-hud .bar > div { height: 100%; background: #9dffbe; border-radius: 3px; }
.heli-hud .tape { position: relative; height: 18px; margin: 2px 0 8px; overflow: hidden; border-bottom: 1px solid rgba(184,255,207,0.3); }
.heli-hud .tape span { position: absolute; top: 0; transform: translateX(-50%); font-size: 11px; }
.heli-hud .tape .caret { left: 50%; top: 12px; width: 0; height: 0; border: 5px solid transparent; border-bottom-color: #ffe08a; transform: translateX(-50%); }
.heli-hud .warn { margin-top: 6px; color: #ffcf5a; text-shadow: 0 0 6px rgba(255,190,60,0.6); min-height: 15px; }
.heli-hud .warn.red { color: #ff6a5a; text-shadow: 0 0 6px rgba(255,80,60,0.6); }
.heli-hint { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); padding: 10px 16px; max-width: 640px;
  font: 500 13px/1.6 system-ui, sans-serif; color: #fff; background: rgba(0,0,0,0.55); border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15); text-align: center; pointer-events: none; transition: opacity 0.8s; opacity: 0; }
.heli-hint b { color: #ffe08a; font-weight: 700; }
.heli-hint kbd { display: inline-block; padding: 0 5px; margin: 0 1px; border-radius: 4px; background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.25); font: 600 12px/1.4 ui-monospace, monospace; }
.hud.heli-mode .crosshair { display: none; }
`;

const keyName = (code: string) =>
  code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code === 'ShiftLeft' || code === 'ShiftRight' ? 'Shift'
    : code === 'ControlLeft' ? 'Ctrl' : code.startsWith('Mouse') ? ['LMB', 'MMB', 'RMB'][Number(code.slice(5))] ?? code : code;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class HeliHud {
  private readonly el: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly style: HTMLStyleElement;
  private f: Record<string, HTMLElement> = {};
  private acc = 0;
  private hintT = 0;
  private shown = false;

  constructor(private parent: HTMLElement) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'heli-hud';
    this.el.innerHTML = `
      <div class="row"><span class="lbl">ALT</span><span><span class="big" data-f="alt">0</span><span class="unit">m</span></span></div>
      <div class="row"><span class="lbl">AGL</span><span><span data-f="agl">0</span><span class="unit">m</span></span></div>
      <div class="row"><span class="lbl">SPD</span><span><span class="big" data-f="spd">0</span><span class="unit">km/h</span></span></div>
      <div class="row"><span class="lbl">V/S</span><span><span data-f="vs">0</span><span class="unit">m/s</span></span></div>
      <div class="row"><span class="lbl">HDG</span><span><span data-f="hdg">000</span><span class="unit" data-f="card">N</span></span></div>
      <div class="tape" data-f="tape"></div>
      <div class="row"><span class="lbl">ROTOR</span><span data-f="nr">0%</span></div>
      <div class="bar"><div data-f="nrBar"></div></div>
      <div class="row"><span class="lbl">ENGINE N1</span><span data-f="n1">0%</span></div>
      <div class="bar"><div data-f="n1Bar"></div></div>
      <div class="row"><span class="lbl">COLLECTIVE</span><span data-f="col">0%</span></div>
      <div class="bar"><div data-f="colBar"></div></div>
      <div class="row"><span class="lbl">HULL</span><span data-f="hull">100%</span></div>
      <div class="bar"><div data-f="hullBar"></div></div>
      <div class="warn" data-f="warn"></div>`;
    for (const n of this.el.querySelectorAll<HTMLElement>('[data-f]')) this.f[n.dataset.f!] = n;
    this.hint = document.createElement('div');
    this.hint.className = 'heli-hint';
    parent.append(this.el, this.hint);
  }

  showHint(game: Game) {
    const b = game.input.bindings;
    const k = (a: keyof typeof b) => `<kbd>${keyName(b[a])}</kbd>`;
    this.hint.innerHTML = `<b>HELICOPTER</b> &nbsp;Engine starting, wait for rotor RPM<br>`
      + `${k('jump')}/${k('sneak')} collective (climb / descend, release = hold altitude) &nbsp; ${k('forward')}/${k('back')} pitch &nbsp; ${k('left')}/${k('right')} bank<br>`
      + `<kbd>Mouse X</kbd> or ${k('yawLeft')}/${k('yawRight')} yaw (pedals) &nbsp; <kbd>Mouse Y</kbd> look &nbsp; ${k('perspective')} view &nbsp; ${k('sneak')} when landed: exit`;
    this.hintT = 13;
  }

  update(game: Game, dt: number) {
    const p: any = game.player;
    const h = (p?.vehicle ?? null) as HelicopterEntity | null;
    const on = !!h && (h as any).isVehicle === true && !p.dead;
    if (on !== this.shown) {
      this.shown = on;
      this.el.style.display = on ? 'block' : 'none';
      this.parent.classList.toggle('heli-mode', on);
      if (!on) this.hintT = 0;
    }
    if (this.hintT > 0) this.hintT -= dt;
    this.hint.style.opacity = on && this.hintT > 0 ? String(Math.min(1, this.hintT / 0.8)) : '0';
    if (!on || !h) return;
    this.acc += dt;
    if (this.acc < 1 / 12) return;
    this.acc = 0;
    const b = h.body;
    const f = this.f;
    const v = h.vel;
    const skidAgl = Math.max(0, b.agl - 2.78);
    f.alt.textContent = Math.round(b.c.y).toString();
    f.agl.textContent = Number.isFinite(skidAgl) ? (skidAgl < 10 ? skidAgl.toFixed(1) : Math.round(skidAgl).toString()) : '---';
    f.spd.textContent = Math.round(Math.hypot(v.x, v.z) * 3.6).toString();
    const vs = v.y;
    f.vs.textContent = (vs >= 0 ? '+' : '') + vs.toFixed(1);
    const hdg = ((-b.heading() * 180) / Math.PI % 360 + 360) % 360;
    f.hdg.textContent = Math.round(hdg).toString().padStart(3, '0');
    f.card.textContent = COMPASS[Math.round(hdg / 45) % 8];
    // heading tape: ticks every 10°, labels every 30°
    let tape = '<div class="caret"></div>';
    for (let d = Math.floor((hdg - 40) / 10) * 10; d <= hdg + 40; d += 10) {
      const x = 50 + ((d - hdg) / 80) * 100;
      const dd = ((d % 360) + 360) % 360;
      const lab = dd % 90 === 0 ? COMPASS[dd / 45] : dd % 30 === 0 ? String(dd / 10).padStart(2, '0') : '·';
      tape += `<span style="left:${x.toFixed(1)}%">${lab}</span>`;
    }
    f.tape.innerHTML = tape;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    f.nr.textContent = pct(b.rpm);
    f.nrBar.style.width = pct(Math.min(1, b.rpm));
    f.nrBar.style.background = b.rpm < 0.9 ? '#ffcf5a' : '#9dffbe';
    f.n1.textContent = pct(b.n1);
    f.n1Bar.style.width = pct(Math.min(1, b.n1));
    f.col.textContent = pct(b.collective);
    f.colBar.style.width = pct(b.collective);
    const hull = h.health / h.maxHealth;
    f.hull.textContent = pct(hull);
    f.hullBar.style.width = pct(hull);
    f.hullBar.style.background = hull < 0.3 ? '#ff6a5a' : hull < 0.6 ? '#ffcf5a' : '#9dffbe';
    // cautions (most important first)
    let warn = '', red = false;
    if (b.waterDepth > 0.15) { warn = 'WATER - ENGINE OUT'; red = true; }
    else if (hull < 0.25) { warn = 'HULL CRITICAL'; red = true; }
    else if (vs < -9 && skidAgl < 40) { warn = 'SINK RATE - PULL UP'; red = true; }
    else if (h.exitHint > 0) warn = 'LAND TO EXIT';
    else if (b.engineOn && b.rpm < 0.92) warn = b.rpm < 0.6 ? 'ENGINE START - WAIT' : 'ROTOR RPM LOW';
    else if (!b.engineOn && b.rpm > 0.05) { warn = 'ENGINE OFF'; red = true; }
    else if (hull < 0.5) warn = 'HULL DAMAGED';
    else if (b.contacts >= 2 && b.collective < 0.05) warn = 'ON GROUND';
    f.warn.textContent = warn;
    f.warn.classList.toggle('red', red);
  }

  dispose() {
    this.el.remove();
    this.hint.remove();
    this.style.remove();
    this.parent.classList.remove('heli-mode');
  }
}
