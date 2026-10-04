/**
 * ALIEN INVASION (disaster spawner block `alien_invasion`).
 *
 * Timeline: alerts → a fleet of ships falls out of the sky in waves (plasma entry streaks) and
 * fill it as a turning swarm of lights → the 1.1 km mothership sinks out of the clouds with its
 * horn, blotting out the sun → fighters make strafing runs near you, destroyers bombard the
 * land, and every ~35 s the mothership charges its core and fires a colossal beam that craters
 * the ground (never right on top of you at first).
 *
 * Everything can be destroyed: explosions, tank shells, arrows and tridents, the hero's punches
 * and the Ion Railgun all damage ships (the mothership's core is a weak point, very weak while
 * charging). Destroyed ships burst, tumble down trailing fire and smoke and crash into the land.
 * When the mothership's hull fails, explosions ripple across it, the core detonates, it tips
 * and falls, and its crash tears out a crater; the surviving fleet flees into space.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { registerDisaster, BulkEdit, relightStep, type Disaster, type DisasterContext, S as blockState } from '../disasters/kit';
import { Fleet, St, Cls, CLASSES, type Ship } from './fleet';
import { Mothership, MOTHER_HP, type MotherState } from './mothership';
import { BillboardPool, BB_GLOW, BB_STREAK, BB_FIRE, BB_SMOKE, SHARED_TIME } from './alienRender';
import { Carver } from '../saitama/carve';
import { ShockRing } from '../saitama/heroFx';
import { ALIENS } from './targets';

const rnd = Math.random;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface Bolt {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  heavy: boolean;
}

const HUD_CSS = `
.inv-hud { position: absolute; inset: 0; pointer-events: none; font-family: 'JetBrains Mono', ui-monospace, monospace; }
.inv-alert { position: absolute; left: 50%; top: 13%; transform: translateX(-50%); padding: 8px 18px; white-space: nowrap;
  font: 700 18px/1.3 'Inter Tight', system-ui, sans-serif; letter-spacing: 0.16em; color: #ffdfd6; text-align: center;
  background: linear-gradient(90deg, rgba(120,0,0,0), rgba(140,10,10,0.72) 12%, rgba(140,10,10,0.72) 88%, rgba(120,0,0,0));
  border-top: 1px solid rgba(255,90,70,0.8); border-bottom: 1px solid rgba(255,90,70,0.8); text-shadow: 0 0 10px rgba(255,60,40,0.8); opacity: 0; transition: opacity 0.4s; }
.inv-alert small { display: block; font: 500 11px/1.4 'JetBrains Mono', monospace; letter-spacing: 0.2em; color: #ffb0a0; }
.inv-panel { position: absolute; right: 16px; top: 16px; min-width: 220px; padding: 10px 12px; color: #ffe0d8; font-size: 12px;
  background: rgba(20,6,6,0.55); border: 1px solid rgba(255,80,60,0.45); border-radius: 6px; }
.inv-panel .row { display: flex; justify-content: space-between; margin: 2px 0; }
.inv-panel .big { font-size: 17px; font-weight: 700; color: #fff; }
.inv-panel .bar { height: 6px; margin-top: 6px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; }
.inv-panel .bar > div { height: 100%; background: linear-gradient(90deg, #ff5040, #ffb050); }
.inv-blink { animation: invblink 0.6s steps(2) infinite; }
@keyframes invblink { 50% { opacity: 0.35; } }
`;

class InvasionHud {
  readonly el: HTMLElement;
  private alert: HTMLElement;
  private panel: HTMLElement;
  private f: Record<string, HTMLElement> = {};
  private alertT = 0;
  constructor(parent: HTMLElement) {
    const st = document.createElement('style');
    st.textContent = HUD_CSS;
    document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.className = 'inv-hud';
    this.el.innerHTML = `<div class="inv-alert"></div>
      <div class="inv-panel">
        <div class="row"><span>HOSTILE CONTACTS</span><span class="big" data-f="n">0</span></div>
        <div class="row"><span>DESTROYED</span><span data-f="k">0</span></div>
        <div data-f="mwrap" style="display:none"><div class="row" style="margin-top:6px"><span>MOTHERSHIP</span><span data-f="ms">—</span></div><div class="bar"><div data-f="mb" style="width:100%"></div></div></div>
      </div>`;
    parent.appendChild(this.el);
    this.alert = this.el.querySelector('.inv-alert')!;
    this.panel = this.el.querySelector('.inv-panel')!;
    this.el.querySelectorAll<HTMLElement>('[data-f]').forEach((n) => (this.f[n.dataset.f!] = n));
  }
  say(text: string, sub = '', life = 5, blink = false) {
    this.alert.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.alert.classList.toggle('inv-blink', blink);
    this.alertT = life;
  }
  update(dt: number, contacts: number, killed: number, motherHp: number | null, motherState: string) {
    this.alertT -= dt;
    // DOM writes only on change (rewriting text every frame forces a layout each frame)
    this.put('ao', this.alertT > 0 ? '1' : '0', (v) => (this.alert.style.opacity = v));
    this.put('n', contacts.toLocaleString('en-US'), (v) => (this.f.n.textContent = v));
    this.put('k', killed.toLocaleString('en-US'), (v) => (this.f.k.textContent = v));
    this.put('mw', motherHp === null ? 'none' : 'block', (v) => (this.f.mwrap.style.display = v));
    if (motherHp !== null) {
      this.put('mb', `${Math.max(0, motherHp * 100).toFixed(1)}%`, (v) => (this.f.mb.style.width = v));
      this.put('ms', motherState, (v) => (this.f.ms.textContent = v));
    }
    void this.panel;
  }
  private last: Record<string, string> = {};
  private put(key: string, v: string, set: (v: string) => void) {
    if (this.last[key] !== v) { this.last[key] = v; set(v); }
  }
  dispose() {
    this.el.remove();
  }
}

export class Invasion implements Disaster {
  readonly name = 'alien_invasion';
  private game: Game;
  private scene = new THREE.Scene();
  readonly fleet: Fleet;
  readonly mother: Mothership;
  private fx: BillboardPool;
  private bolts: Bolt[] = [];
  private rings: ShockRing[] = [];
  private hud: InvasionHud | null = null;
  private t = 0;
  private killed = 0;
  private drone: any = null;
  private bulk: BulkEdit;
  private carver: Carver;
  private nextBeam = 0;
  private boomBudget = 0;
  private smallBoomBudget = 0;
  private flybyT = 0;
  private destroyerT = 8;
  private said = new Set<string>();
  private offs: (() => void)[] = [];
  private center: THREE.Vector3;
  private wreckSmokeT = 0;
  private dyingT = 0;
  private crashT = -1;
  private beamFlash = 0;
  private lastMotherState: MotherState = 'waiting';

  constructor(private ctx: DisasterContext) {
    const g = (this.game = ctx.game);
    const gy = g.world.getHeight(Math.floor(ctx.x), Math.floor(ctx.z)) || ctx.y;
    this.center = new THREE.Vector3(ctx.x + 0.5, gy, ctx.z + 0.5);
    const q = g.renderer.settings.quality;
    const scale = q === 'low' ? 0.6 : q === 'medium' ? 0.8 : q === 'ultra' ? 1.5 : 1;
    this.fleet = new Fleet(g.renderer, this.center, {
      ground: (x, z) => this.ground(x, z),
      crash: (s, at) => this.onCrash(s, at),
      fire: (s, from, dir) => this.onFire(s, from, dir),
      destroyed: (s) => this.onDestroyed(s),
    }, scale);
    const hover = new THREE.Vector3(ctx.x + ctx.fx * 420, gy + 400, ctx.z + ctx.fz * 420);
    this.mother = new Mothership(g.renderer, hover);
    this.fx = new BillboardPool(g.renderer, 1200, false, 1.5);
    this.scene.add(this.fleet.group, this.mother.root, this.fx.mesh);
    (g.renderExtras.forward ??= []).push(this.scene);
    this.bulk = new BulkEdit(g);
    this.carver = new Carver({
      get: (x, y, z) => g.world.getBlock(x, y, z),
      set: (x, y, z, s) => {
        if (g.world.getBlockEntity(x, y, z)) g.world.setBlockEntity(x, y, z, null);
        return this.bulk.set(x, y, z, s);
      },
      top: (x, z) => {
        const w = g.world;
        if (!w.isLoaded(x, z)) return -1;
        const h = w.getHeight(x, z);
        for (let y = Math.min(255, h + 40); y > h; y--) if (w.getBlock(x, y, z)) return y;
        return Math.min(255, h + 1);
      },
      destroyed: (x, y, z, st) => {
        if (rnd() < 0.04) g.particles?.spawnBlockBreak?.(x, y, z, st);
      },
    });
    g.cameraCtl.minFar = 14000;
    this.offs.push(g.events.on('explosion', (e: any) => this.onExplosion(e.pos, e.power)));
    ALIENS.active = this;
    this.drone = g.audio?.loop?.('loop.alien.drone', { volume: 0.0001 }) ?? null;
  }

  private ground(x: number, z: number): number | null {
    const w = this.game.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    if (!w.isLoaded(bx, bz)) return null;
    return w.getHeight(bx, bz);
  }

  private hudEl(): InvasionHud | null {
    if (!this.hud && this.game.ui?.hud?.el) this.hud = new InvasionHud(this.game.ui.hud.el);
    return this.hud;
  }

  private once(key: string, fn: () => void) {
    if (this.said.has(key)) return;
    this.said.add(key);
    fn();
  }

  // ------------------------------------------------------------------------------- logic (20 TPS)
  tick(_game: Game): boolean {
    return true;
  }

  // ------------------------------------------------------------------------------- per frame
  update(game: Game, dt: number) {
    this.t += dt;
    SHARED_TIME.value = this.t;
    const t = this.t;
    const cam = game.cameraCtl.camera.position;
    const p: any = game.player;
    const hud = this.hudEl();
    this.boomBudget = Math.min(3, this.boomBudget + dt * 1.5);
    this.smallBoomBudget = Math.min(3, this.smallBoomBudget + dt * 3);
    // ---- timeline
    if (this.drone) this.drone.setVolume?.(Math.min(0.75, t / 10));
    this.once('a0', () => { hud?.say('⚠ UNIDENTIFIED OBJECTS ENTERING THE ATMOSPHERE', 'NORAD · ALL STATIONS', 7, true); game.audio?.play?.('alien.horn', { volume: 0.6, pitch: 1.6 }); });
    if (t > 9) this.once('a1', () => hud?.say(`${this.fleet.ships.length.toLocaleString('en-US')} CONTACTS AND RISING`, 'THEY ARE EVERYWHERE', 6));
    if (t > 38) this.once('m0', () => {
      this.mother.arrive();
      hud?.say('MASSIVE OBJECT DESCENDING', 'DIAMETER: 1.1 KM', 8, true);
      game.audio?.play?.('alien.horn', { volume: 3 });
      this.ctx.effects.addShake(0.6);
    });
    if (this.mother.state === 'hover' && this.lastMotherState === 'descend') {
      game.audio?.play?.('alien.horn', { volume: 3.5, pitch: 0.85 });
      this.ctx.effects.addShake(1.0);
      hud?.say('IT HAS STOPPED OVER US', 'ALL WEAPONS FREE', 6);
      this.nextBeam = t + 14;
    }
    this.fleet.maxAttackers = t < 30 ? 0 : Math.min(28, Math.floor((t - 30) * 0.5));
    this.fleet.attackCenter.set(p.pos.x, p.pos.y, p.pos.z);
    // ---- mothership beam cycle
    const m = this.mother;
    if (m.state === 'hover' && m.alive && t >= this.nextBeam) {
      const a = rnd() * Math.PI * 2, r = 150 + rnd() * 260;
      const tx = p.pos.x + Math.cos(a) * r, tz = p.pos.z + Math.sin(a) * r;
      const gy = this.ground(tx, tz) ?? p.pos.y;
      m.startCharge(new THREE.Vector3(tx, gy, tz));
      game.audio?.play?.('alien.charge', { pos: m.corePos(_v), volume: 6 });
      hud?.say('⚠ IT IS CHARGING THE MAIN WEAPON', 'SHOOT THE CORE', 6, true);
      this.nextBeam = t + 36;
    }
    const prevState = this.lastMotherState;
    const ev = m.update(dt, (x, z) => this.ground(x, z));
    if (m.state === 'fire' && prevState === 'charge') this.beamImpact(m.beamTarget);
    if (m.state === 'dying' && prevState !== 'dying') {
      hud?.say('THE MOTHERSHIP IS BREAKING UP', '', 7, true);
      this.dyingT = 0;
    }
    if (m.state === 'falling' && prevState === 'dying') this.coreDetonation();
    if (ev === 'crash') this.motherCrash();
    this.lastMotherState = m.state;
    this.motherFx(dt);
    // ---- the fleet
    this.fleet.update(dt, cam);
    this.destroyerFire(dt);
    this.updateBolts(dt);
    this.applyDamageSources(game, dt);
    this.flybys(dt, cam);
    // ---- carving
    if (this.carver.busy) {
      this.carver.advance(dt);
      this.bulk.begin();
      this.carver.work(40000, 6);
      this.bulk.end();
      relightStep(game, 2);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if (!this.rings[i].update(dt)) { this.rings[i].dispose(); this.rings.splice(i, 1); }
    // ---- sky: the disc blots out the sun
    const atmo: any = game.renderer.atmosphere;
    if (atmo && 'lightOcclusion' in atmo) atmo.lightOcclusion = m.occlusion(cam, (game as any).sunDir ?? UP) * (m.state === 'crashed' ? 0 : 0.9);
    // ---- HUD
    const contacts = this.fleet.alive;
    hud?.update(dt, contacts, this.killed, m.state === 'waiting' ? null : m.hp / MOTHER_HP, m.state === 'charge' ? 'CHARGING' : m.state === 'fire' ? 'FIRING' : m.alive ? 'HULL' : 'DESTROYED');
    if (this.beamFlash > 0) this.beamFlash = Math.max(0, this.beamFlash - dt);
  }

  // ------------------------------------------------------------------------------- mothership fx
  private motherFx(dt: number) {
    const m = this.mother;
    const g = this.game;
    this.fx.begin();
    // bolts
    for (const b of this.bolts) {
      _d.copy(b.vel).normalize();
      const len = b.heavy ? 22 : 9;
      const c = b.heavy ? [10, 3.2, 1.0] : [9, 1.6, 0.6];
      this.fx.push(b.pos.x - _d.x * len, b.pos.y - _d.y * len, b.pos.z - _d.z * len, b.heavy ? 2.4 : 0.9, len, c[0], c[1], c[2], 1, BB_STREAK, 0, 0, _d.x, _d.y, _d.z);
    }
    if (m.state === 'waiting') { this.fx.commit(); return; }
    const core = m.corePos(_v);
    // core glow (big)
    const ch = m.charge;
    const cg = (m.alive || m.state === 'dying' ? 1 : 0.05) * (1 + ch * ch * 12);
    this.fx.push(core.x, core.y, core.z, 60 + ch * 120, 60 + ch * 120, 0.5 * cg, 3 * cg, 1.6 * cg, 1, BB_GLOW, 0);
    // charging: energy streams converge on the core
    if (m.state === 'charge') {
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + m.t * 0.3;
        const r = 160 + 340 * (1 - ((m.t * 0.5 + i * 0.13) % 1));
        _w.set(Math.cos(a) * r, -60, Math.sin(a) * r).applyMatrix4(m.root.matrix);
        _d.copy(core).sub(_w);
        const L = _d.length();
        _d.divideScalar(L);
        this.fx.push(_w.x + _d.x * L * 0.5, _w.y + _d.y * L * 0.5, _w.z + _d.z * L * 0.5, 3 + ch * 4, L * 0.5, 1.2 * ch * 6, 7 * ch * 6, 3.6 * ch * 6, 1, BB_STREAK, i, 0, _d.x, _d.y, _d.z);
      }
      this.ctx.effects.addShake(0.15 * ch);
    }
    // firing: the beam
    if (m.state === 'fire') {
      const tg = m.beamTarget;
      _d.copy(tg).sub(core);
      const L = _d.length();
      _d.divideScalar(L);
      const flick = 0.85 + 0.15 * Math.sin(m.t * 60);
      const fade = Math.min(1, (3.5 - m.st) * 2);
      const mx = core.x + _d.x * L * 0.5, my = core.y + _d.y * L * 0.5, mz = core.z + _d.z * L * 0.5;
      const grow = Math.min(1, m.st * 4);
      // wide halo, the green sheath, and the white-hot core of the beam
      this.fx.push(mx, my, mz, 140 * grow, L * 0.5, 0.5 * flick * fade, 2.6 * flick * fade, 1.5 * flick * fade, 1, BB_STREAK, 101, 0, _d.x, _d.y, _d.z);
      this.fx.push(mx, my, mz, 48 * grow, L * 0.5, 4 * flick * fade, 22 * flick * fade, 12 * flick * fade, 1, BB_STREAK, 102, 0, _d.x, _d.y, _d.z);
      this.fx.push(mx, my, mz, 15 * grow, L * 0.5, 30 * fade, 40 * fade, 34 * fade, 1, BB_STREAK, 103, 0, _d.x, _d.y, _d.z);
      this.fx.push(tg.x, tg.y + 6, tg.z, 90, 90, 6 * fade, 26 * fade, 14 * fade, 1, BB_GLOW, 3);
      // keep the impact boiling
      if (rnd() < dt * 30) this.fleet.addPuff(tg.x + (rnd() - 0.5) * 40, tg.y + rnd() * 20, tg.z + (rnd() - 0.5) * 40, (rnd() - 0.5) * 30, 20 + rnd() * 30, (rnd() - 0.5) * 30, 25 + rnd() * 25, 2 + rnd(), BB_FIRE, 0.7, 1, 0.8, 1);
      this.ctx.effects.addShake(Math.min(1.4, 900 / Math.max(80, g.cameraCtl.camera.position.distanceTo(tg))));
    }
    // dying: explosions rippling across the hull
    if (m.state === 'dying') {
      this.dyingT -= dt;
      while (this.dyingT <= 0) {
        this.dyingT += 0.09;
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 540;
        _w.set(Math.cos(a) * r, (rnd() - 0.5) * 120, Math.sin(a) * r).applyMatrix4(m.root.matrix);
        const sz = 30 + rnd() * 90;
        for (let k = 0; k < 3; k++) this.fleet.addPuff(_w.x, _w.y, _w.z, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30, sz * (0.7 + rnd() * 0.6), 1.2 + rnd(), BB_FIRE, 1, 1, 1, 1.4);
        this.fleet.addPuff(_w.x, _w.y, _w.z, (rnd() - 0.5) * 10, 5, (rnd() - 0.5) * 10, sz * 1.6, 7 + rnd() * 5, BB_SMOKE, 0.08, 0.075, 0.07, 0.9);
        if (rnd() < 0.3) g.audio?.play?.('alien.boom', { pos: _w, volume: 8, pitch: 0.6 + rnd() * 0.3 });
        if (rnd() < 0.15) g.particles?.flash?.(_w.x, _w.y, _w.z, 0xffc080, 2e5, 0.4, 900);
      }
      this.ctx.effects.addShake(0.6);
    }
    // falling / crashed: smoke pouring off the hulk
    if (m.state === 'falling' || m.state === 'crashed') {
      this.wreckSmokeT -= dt;
      const rate = m.state === 'falling' ? 0.03 : 0.25;
      while (this.wreckSmokeT <= 0) {
        this.wreckSmokeT += rate;
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 520;
        _w.set(Math.cos(a) * r, 40, Math.sin(a) * r).applyMatrix4(m.root.matrix);
        this.fleet.addPuff(_w.x, _w.y, _w.z, (rnd() - 0.5) * 6, 8 + rnd() * 8, (rnd() - 0.5) * 6, 40 + rnd() * 60, 12 + rnd() * 8, BB_SMOKE, 0.06, 0.055, 0.05, 0.85);
        if (rnd() < 0.5) this.fleet.addPuff(_w.x, _w.y, _w.z, 0, 4, 0, 20 + rnd() * 30, 1 + rnd(), BB_FIRE, 1, 0.8, 0.6, 1);
      }
    }
    this.fx.commit();
  }

  /** The beam lands: crater, fire column, shockwave, quake. */
  private beamImpact(tg: THREE.Vector3) {
    const g = this.game;
    this.carver.sphere(tg.clone().setY(tg.y + 4), 26);
    const ex: any = (g as any).explosions;
    for (let i = 0; i < 4; i++) ex?.explode?.(new THREE.Vector3(tg.x + (rnd() - 0.5) * 30, tg.y + 1, tg.z + (rnd() - 0.5) * 30), 7, { breakBlocks: i < 2, drops: false, debris: i === 0 });
    g.audio?.play?.('alien.beam', { pos: tg, volume: 14 });
    g.particles?.flash?.(tg.x, tg.y + 20, tg.z, 0xb0ffc8, 6e5, 1.5, 700);
    this.ctx.effects.flash(0.7, 0xd8ffe0);
    for (let i = 0; i < 3; i++) {
      const r = new ShockRing(tg.clone().setY(tg.y + 3 + i * 8), UP, 6, 160 + i * 120, 1.4 + i * 0.5, new THREE.Color(0.85, 1, 0.9));
      this.scene.add(r.mesh);
      this.rings.push(r);
    }
    for (let i = 0; i < 40; i++) this.fleet.addPuff(tg.x + (rnd() - 0.5) * 50, tg.y + rnd() * 30, tg.z + (rnd() - 0.5) * 50, (rnd() - 0.5) * 40, 30 + rnd() * 60, (rnd() - 0.5) * 40, 25 + rnd() * 40, 2 + rnd() * 2, BB_FIRE, 1, 1, 1, 1.4);
    for (let i = 0; i < 30; i++) this.fleet.addPuff(tg.x + (rnd() - 0.5) * 80, tg.y + rnd() * 60, tg.z + (rnd() - 0.5) * 80, (rnd() - 0.5) * 20, 10 + rnd() * 25, (rnd() - 0.5) * 20, 50 + rnd() * 60, 14 + rnd() * 10, BB_SMOKE, 0.12, 0.11, 0.1, 0.9);
    const d = g.cameraCtl.camera.position.distanceTo(tg);
    this.ctx.effects.addShake(Math.min(3, 1600 / Math.max(60, d)));
    this.beamFlash = 3.5;
  }

  private coreDetonation() {
    const g = this.game;
    const c = this.mother.corePos(new THREE.Vector3());
    g.audio?.play?.('alien.beam', { pos: c, volume: 20, pitch: 0.6 });
    g.audio?.play?.('alien.boom', { pos: c, volume: 20, pitch: 0.4 });
    this.ctx.effects.flash(1, 0xffffff);
    this.ctx.effects.addShake(2);
    g.particles?.flash?.(c.x, c.y, c.z, 0xffffff, 3e6, 2, 2000);
    for (let i = 0; i < 3; i++) {
      const r = new ShockRing(c, UP, 30, 1400 + i * 900, 2 + i, new THREE.Color(1, 0.95, 0.85));
      this.scene.add(r.mesh);
      this.rings.push(r);
    }
    for (let i = 0; i < 50; i++) this.fleet.addPuff(c.x, c.y, c.z, (rnd() - 0.5) * 160, (rnd() - 0.5) * 160, (rnd() - 0.5) * 160, 60 + rnd() * 80, 2 + rnd() * 2, BB_FIRE, 1, 1, 1, 1.5);
    this.fleet.retreat();
    this.hudEl()?.say('THE CORE IS GONE — IT IS COMING DOWN', '', 7, true);
  }

  private motherCrash() {
    const g = this.game;
    const m = this.mother;
    const low = m.lowest(new THREE.Vector3());
    const gy = this.ground(low.x, low.z) ?? low.y;
    const at = new THREE.Vector3(low.x, gy, low.z);
    this.carver.crater(at, 150, 40, 120);
    g.audio?.play?.('hero.quake', { volume: 3 });
    g.audio?.play?.('alien.crash', { pos: at, volume: 25, pitch: 0.5 });
    this.ctx.effects.flash(0.8, 0xffd8a0);
    this.ctx.effects.addShake(3);
    for (let i = 0; i < 4; i++) {
      const r = new ShockRing(at.clone().setY(at.y + 4 + i * 10), UP, 20, 500 + i * 300, 2 + i * 0.6, new THREE.Color(1, 0.85, 0.6));
      this.scene.add(r.mesh);
      this.rings.push(r);
    }
    for (let i = 0; i < 80; i++) this.fleet.addPuff(at.x + (rnd() - 0.5) * 400, at.y + rnd() * 80, at.z + (rnd() - 0.5) * 400, (rnd() - 0.5) * 60, 20 + rnd() * 40, (rnd() - 0.5) * 60, 50 + rnd() * 80, 3 + rnd() * 3, BB_FIRE, 1, 0.9, 0.7, 1.3);
    for (let i = 0; i < 60; i++) this.fleet.addPuff(at.x + (rnd() - 0.5) * 700, at.y + rnd() * 60, at.z + (rnd() - 0.5) * 700, (rnd() - 0.5) * 30, 10 + rnd() * 20, (rnd() - 0.5) * 30, 80 + rnd() * 80, 20 + rnd() * 10, BB_SMOKE, 0.1, 0.09, 0.08, 0.9);
    this.hudEl()?.say('MOTHERSHIP DESTROYED', 'THE FLEET IS RETREATING', 10);
    this.crashT = this.t;
  }

  // ------------------------------------------------------------------------------- weapons
  private onFire(s: Ship, from: THREE.Vector3, dir: THREE.Vector3) {
    if (this.bolts.length > 260) return;
    this.bolts.push({ pos: from, vel: dir.multiplyScalar(210), life: 4, heavy: false });
    const g = this.game;
    if (g.cameraCtl.camera.position.distanceToSquared(from) < 320 * 320 && rnd() < 0.5) g.audio?.play?.('alien.plasma', { pos: from, volume: 2.5 });
    void s;
  }

  private destroyerFire(dt: number) {
    this.destroyerT -= dt;
    if (this.destroyerT > 0 || this.t < 40 || !this.mother.alive) return;
    this.destroyerT = 5 + rnd() * 6;
    const ds = this.fleet.ships.filter((s) => s.cls === Cls.Destroyer && s.st === St.Patrol);
    if (!ds.length) return;
    const s = ds[Math.floor(rnd() * ds.length)];
    const p = this.game.player.pos;
    const a = rnd() * Math.PI * 2, r = 120 + rnd() * 500;
    const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r;
    const ty = this.ground(tx, tz) ?? p.y;
    _v.set(0, -8, -55).applyQuaternion(s.quat).add(s.pos);
    _d.set(tx, ty, tz).sub(_v).normalize();
    this.bolts.push({ pos: _v.clone(), vel: _d.clone().multiplyScalar(260), life: 8, heavy: true });
  }

  private updateBolts(dt: number) {
    const g = this.game;
    const w = g.world;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const steps = 3;
      let hit = false;
      for (let k = 0; k < steps && !hit; k++) {
        b.pos.addScaledVector(b.vel, dt / steps);
        const bx = Math.floor(b.pos.x), by = Math.floor(b.pos.y), bz = Math.floor(b.pos.z);
        if (!w.isLoaded(bx, bz)) continue;
        const st = w.getBlock(bx, by, bz);
        if (st || by <= (w.getHeight(bx, bz) - 1)) hit = true;
      }
      if (hit) {
        const ex: any = (g as any).explosions;
        // Fighter bolts only scorch and hurt (no block edits); destroyer bolts crater within a
        // budget. No item drops or physics debris: a constant bombardment would otherwise bury
        // the game in hundreds of drops and rigid bodies.
        const power = b.heavy ? 6 : 2.4;
        if (b.heavy && this.boomBudget >= 1) {
          this.boomBudget -= 1;
          ex?.explode?.(b.pos.clone(), power, { breakBlocks: true, drops: false, debris: false });
        } else if (!b.heavy && this.smallBoomBudget >= 1 && b.pos.distanceToSquared(g.cameraCtl.camera.position) < 200 * 200) {
          // far impacts are billboards only; near ones get the full blast (light, particles, sound)
          this.smallBoomBudget -= 1;
          ex?.explode?.(b.pos.clone(), power, { breakBlocks: false, debris: false });
        }
        this.fleet.addPuff(b.pos.x, b.pos.y + 1, b.pos.z, 0, 4, 0, b.heavy ? 14 : 5, 0.8, BB_FIRE, 1, 0.8, 0.6, 1);
        this.fleet.addPuff(b.pos.x, b.pos.y + 2, b.pos.z, 0, 3, 0, b.heavy ? 22 : 7, 6, BB_SMOKE, 0.12, 0.11, 0.1, 0.8);
        this.bolts.splice(i, 1);
        continue;
      }
      if (b.life <= 0) this.bolts.splice(i, 1);
    }
  }

  /** Railgun / external hitscan: damage the first ship or the mothership along the ray. */
  lockOn(o: THREE.Vector3, d: THREE.Vector3, maxT: number, cone: number): THREE.Vector3 | null {
    if (this.fleet.raycast(o, d, maxT)) return null;
    const a = this.fleet.aimTarget(o, d, maxT, cone);
    if (!a || this.mother.raycast(o, _d.copy(a.ship.pos).sub(o).normalize(), a.t)) return null;
    return a.ship.pos;
  }

  rayHit(o: THREE.Vector3, d: THREE.Vector3, maxT: number, dmg: number, cone = 0): { t: number; what: 'ship' | 'mother' | null; at?: THREE.Vector3 } {
    let sh = this.fleet.raycast(o, d, maxT);
    if (!sh && cone > 0) {
      // aim assist: snap to the ship nearest the crosshair, unless the mothership is in the way
      const a = this.fleet.aimTarget(o, d, maxT, cone);
      if (a && !this.mother.raycast(o, _d.copy(a.ship.pos).sub(o).normalize(), a.t)) {
        const at = a.ship.pos.clone();
        this.fleet.hit(a.ship, dmg, _d);
        this.fleet.addPuff(at.x, at.y, at.z, 0, 0, 0, 6, 0.4, BB_FIRE, 1, 0.9, 0.7, 1);
        return { t: a.t, what: 'ship', at };
      }
    }
    const mh = this.mother.raycast(o, d, sh ? sh.t : maxT);
    if (mh) {
      const at = o.clone().addScaledVector(d, mh.t);
      this.mother.hit(dmg * 3, at);
      this.fleet.addPuff(at.x, at.y, at.z, 0, 0, 0, mh.core ? 26 : 12, 0.6, BB_FIRE, 0.6, 1, 0.8, 1.2);
      return { t: mh.t, what: 'mother' };
    }
    if (sh) {
      this.fleet.hit(sh.ship, dmg, d);
      const at = o.clone().addScaledVector(d, sh.t);
      this.fleet.addPuff(at.x, at.y, at.z, 0, 0, 0, 6, 0.4, BB_FIRE, 1, 0.9, 0.7, 1);
      return { t: sh.t, what: 'ship' };
    }
    return { t: maxT, what: null };
  }

  private onExplosion(pos: THREE.Vector3, power: number) {
    if (!pos) return;
    const ships = this.fleet.inSphere(pos, power * 3);
    for (const s of ships) this.fleet.hit(s, power * 45, _d.copy(s.pos).sub(pos).normalize());
    if (this.mother.alive && this.mother.raycast(pos, UP, 1)) this.mother.hit(power * 60, pos);
  }

  /** Shells, arrows/tridents and the hero's punch shockwaves. */
  private applyDamageSources(game: Game, dt: number) {
    // tank shells
    const tanks: any = game.systems.find((s) => s.name === 'tanks');
    for (const s of (tanks?.shells ?? []) as any[]) {
      if (s.life <= 0) continue;
      const sp = s.vel.length();
      const step = sp * Math.max(dt, 1 / 60) * 1.5;
      _d.copy(s.vel).divideScalar(sp);
      const r = this.rayHit(s.pos, _d, step, s.kind === 'main' ? 600 : 8);
      if (r.what) {
        s.life = 0;
        if (s.kind === 'main') game.audio?.play?.('alien.boom', { pos: s.pos.clone().addScaledVector(_d, r.t), volume: 4, pitch: 1.3 });
      }
    }
    // arrows, tridents and thrown things
    for (const e of game.entities.list as any[]) {
      if (e.removed || (e.type !== 'arrow' && e.type !== 'trident' && e.type !== 'snowball' && e.type !== 'fireball')) continue;
      _d.copy(e.pos).sub(e.prevPos);
      const L = _d.length();
      if (L < 1e-3) continue;
      _d.divideScalar(L);
      const r = this.rayHit(e.prevPos, _d, L + 0.5, e.type === 'trident' ? 40 : 15);
      if (r.what) e.remove();
    }
    // the hero's punches
    const hero: any = game.systems.find((s) => s.name === 'hero');
    for (const info of (hero?.jobs ?? []) as any[]) {
      const j = info.job;
      if (j.kind !== 'cone') continue;
      info.alienHit ??= new Set<Ship>();
      const reach = j.front * info.len;
      for (const s of this.fleet.ships) {
        if (s.st === St.Waiting || s.st === St.Gone || s.st === St.Falling || info.alienHit.has(s)) continue;
        _v.copy(s.pos).sub(info.o);
        const tt = _v.dot(info.d);
        if (tt < 0 || tt > reach) continue;
        const r = info.r0 + (info.r1 - info.r0) * Math.sqrt(tt / info.len) + CLASSES[s.cls].radius;
        if (_v.addScaledVector(info.d, -tt).lengthSq() > r * r) continue;
        info.alienHit.add(s);
        this.fleet.hit(s, 1500 * info.power, info.d);
      }
      if (!info.alienMother && this.mother.alive) {
        const mh = this.mother.raycast(info.o, info.d, reach);
        if (mh) {
          info.alienMother = true;
          this.mother.hit(4000 * info.power, info.o.clone().addScaledVector(info.d, mh.t));
        }
      }
    }
  }

  // ------------------------------------------------------------------------------- deaths & crashes
  private onDestroyed(s: Ship) {
    this.killed++;
    const g = this.game;
    const d = g.cameraCtl.camera.position.distanceTo(s.pos);
    const vol = s.cls === Cls.Destroyer ? 16 : s.cls === Cls.Bomber ? 7 : 4;
    if (d < 2500) g.audio?.play?.('alien.boom', { pos: s.pos, volume: vol, pitch: s.cls === Cls.Destroyer ? 0.55 : 0.9 + rnd() * 0.3 });
    if (d < 900) g.particles?.flash?.(s.pos.x, s.pos.y, s.pos.z, 0xffb070, s.cls === Cls.Destroyer ? 2e5 : 2e4, 0.5, s.cls === Cls.Destroyer ? 500 : 140);
    if (this.killed === 1) this.hudEl()?.say('FIRST CONFIRMED KILL', 'THEY CAN BE HURT', 4);
  }

  private onCrash(s: Ship, at: THREE.Vector3) {
    const g = this.game;
    const near = g.cameraCtl.camera.position.distanceTo(at);
    const c = CLASSES[s.cls];
    const ex: any = (g as any).explosions;
    const power = s.cls === Cls.Destroyer ? 9 : s.cls === Cls.Bomber ? 6 : 4;
    if (near < 600 && this.boomBudget >= 1) {
      this.boomBudget -= 1;
      ex?.explode?.(at.clone().setY(at.y + 1), power, { breakBlocks: true, fire: true, drops: false, debris: s.cls !== Cls.Fighter });
    }
    if (s.cls === Cls.Destroyer && near < 900) this.carver.sphere(at.clone().setY(at.y + 2), 16);
    // wreckage
    if (near < 600) this.wreckage(at, s.cls);
    const n = s.cls === Cls.Destroyer ? 16 : 4;
    for (let i = 0; i < n; i++) this.fleet.addPuff(at.x + (rnd() - 0.5) * c.radius, at.y + rnd() * c.radius * 0.5, at.z + (rnd() - 0.5) * c.radius, (rnd() - 0.5) * 10, 8 + rnd() * 10, (rnd() - 0.5) * 10, c.radius * (1 + rnd()), 1.2 + rnd(), BB_FIRE, 1, 0.9, 0.7, 1.2);
    for (let i = 0; i < n; i++) this.fleet.addPuff(at.x, at.y + 4, at.z, (rnd() - 0.5) * 6, 6 + rnd() * 6, (rnd() - 0.5) * 6, c.radius * (1.5 + rnd()), 10 + rnd() * 8, BB_SMOKE, 0.08, 0.075, 0.07, 0.85);
    if (near < 3000) g.audio?.play?.('alien.crash', { pos: at, volume: s.cls === Cls.Destroyer ? 18 : 6, pitch: s.cls === Cls.Destroyer ? 0.6 : 1 });
    if (near < 400) this.ctx.effects.addShake(Math.min(1.5, (s.cls === Cls.Destroyer ? 300 : 60) / Math.max(20, near)));
    const r = new ShockRing(at.clone().setY(at.y + 1.5), UP, 2, c.radius * 4, 0.7, new THREE.Color(1, 0.8, 0.6));
    this.scene.add(r.mesh);
    this.rings.push(r);
  }

  /** Burning alien wreckage scattered at a crash site. */
  private wreckage(at: THREE.Vector3, cls: Cls) {
    const g = this.game;
    const w = g.world;
    const mats = ['blackstone', 'netherite_block', 'polished_blackstone', 'magma_block', 'iron_block'];
    const n = cls === Cls.Destroyer ? 60 : cls === Cls.Bomber ? 14 : 6;
    const R = cls === Cls.Destroyer ? 14 : 4;
    let fire = 0;
    try { fire = blockState('fire'); } catch { fire = 0; }
    this.bulk.begin();
    for (let i = 0; i < n; i++) {
      const x = Math.floor(at.x + (rnd() - 0.5) * 2 * R), z = Math.floor(at.z + (rnd() - 0.5) * 2 * R);
      if (!w.isLoaded(x, z)) continue;
      const y = w.getHeight(x, z);
      let st = 0;
      try { st = blockState(mats[Math.floor(rnd() * mats.length)]); } catch { continue; }
      this.bulk.set(x, y, z, st);
      if (fire && rnd() < 0.4 && !w.getBlock(x, y + 1, z)) this.bulk.set(x, y + 1, z, fire);
    }
    this.bulk.end();
  }

  private flybys(dt: number, cam: THREE.Vector3) {
    this.flybyT -= dt;
    if (this.flybyT > 0) return;
    this.flybyT = 0.25;
    for (const s of this.fleet.ships) {
      if (s.cls !== Cls.Fighter || (s.st !== St.Attack && s.st !== St.Patrol)) continue;
      if (s.pos.distanceToSquared(cam) < 90 * 90) {
        this.game.audio?.play?.('alien.flyby', { pos: s.pos, volume: 3 });
        this.flybyT = 1.2;
        return;
      }
    }
  }

  dispose(game: Game) {
    this.scene.removeFromParent();
    const fw = game.renderExtras.forward;
    if (fw) { const i = fw.indexOf(this.scene); if (i >= 0) fw.splice(i, 1); }
    this.fleet.dispose();
    this.mother.dispose();
    this.fx.dispose();
    for (const r of this.rings) r.dispose();
    this.hud?.dispose();
    this.drone?.stop?.(1);
    for (const off of this.offs) off();
    game.cameraCtl.minFar = 0;
    const atmo: any = game.renderer.atmosphere;
    if (atmo && 'lightOcclusion' in atmo) atmo.lightOcclusion = 0;
    if (ALIENS.active === this) ALIENS.active = null;
  }
}

registerDisaster('alien_invasion', (ctx) => new Invasion(ctx));
