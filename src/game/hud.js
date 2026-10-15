// HUD drawn on a low-resolution 2D canvas (pixel-art look, scaled up).
import * as THREE from 'three';
import { WEAPONS, MELEE, ITEMS, SURVIVOR } from './config.js';
import { currentSpread } from './weapons.js';
import { displayName } from './items.js';

const VH = 360; // virtual height
const _v = new THREE.Vector3();

const ACTION_TEXT = {
  revive: (s, t) => [`Reviving ${t.name}`, `${s.name} is reviving you`],
  ledge: (s, t) => [`Helping ${t.name} up`, `${s.name} is helping you up`],
  heal_self: () => ['Healing yourself', ''],
  heal_other: (s, t) => [`Healing ${t.name}`, `${s.name} is healing you`],
  defib: (s, t) => [`Defibrillating ${t.name}`, ''],
  deploy: () => ['Deploying ammo upgrade', ''],
  pour: () => ['Pouring gas', ''],
  use: (s, t) => [t && t.useText ? t.useText : 'Using', ''],
};

export class HUD {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    this.ctx = canvas.getContext('2d');
    this.dmgMarks = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.fps = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.objectiveFlash = 0;
  }
  resize() {
    const h = VH, w = Math.round(VH * window.innerWidth / window.innerHeight);
    this.canvas.width = w; this.canvas.height = h;
    this.W = w; this.H = h;
    this.ctx.imageSmoothingEnabled = false;
  }
  addDamage(dirWorld, player) {
    // convert world direction (from attacker to player) into screen angle relative to view
    const yaw = player.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const dx = -dirWorld.x, dz = -dirWorld.z; // towards attacker
    const a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    this.dmgMarks.push({ a, t: 1 });
  }

  text(str, x, y, opts = {}) {
    const c = this.ctx;
    c.font = `${opts.bold === false ? '' : 'bold '}${opts.size || 8}px ${opts.font || 'monospace'}`;
    c.textAlign = opts.align || 'left'; c.textBaseline = opts.base || 'top';
    if (opts.shadow !== false) { c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(str, x + 1, y + 1); }
    c.fillStyle = opts.color || '#e8e4d8';
    c.fillText(str, x, y);
  }
  bar(x, y, w, h, frac, color, bg = 'rgba(0,0,0,0.6)', temp = 0, tempColor = 'rgba(230,230,220,0.9)') {
    const c = this.ctx;
    c.fillStyle = bg; c.fillRect(x - 1, y - 1, w + 2, h + 2);
    const pw = Math.round(w * Math.max(0, Math.min(1, frac)));
    c.fillStyle = color; c.fillRect(x, y, pw, h);
    if (temp > 0) { const tw = Math.round(w * Math.min(1 - frac, temp)); c.fillStyle = tempColor; c.fillRect(x + pw, y, tw, h); }
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y, pw, 1);
  }

  draw(dt) {
    const g = this.game, w = g.world, c = this.ctx;
    c.clearRect(0, 0, this.W, this.H);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    if (!w || !g.player) return;
    const p = g.player.s;
    this.drawTeam(p);
    if (p.state !== 'dead') this.drawWeapons(p);
    this.drawCrosshair(p);
    this.drawProgress(p);
    this.drawHints(p);
    this.drawTags(p);
    this.drawMessages();
    this.drawSubtitles();
    this.drawObjective();
    this.drawDamage(dt);
    if (g.player.zoom) this.drawScope();
    if (g.settings.get('showFps')) this.text(`${this.fps} fps`, this.W - 4, 4, { align: 'right', size: 7, color: '#9f9' });
  }

  hpColor(total) { return total >= 40 ? '#3cb43c' : total >= 25 ? '#d8b020' : '#c83020'; }

  drawTeam(p) {
    const w = this.game.world;
    const others = w.survivors.filter((s) => s !== p);
    let y = this.H - 12;
    // player (big)
    this.drawSurvivorRow(p, 8, y - 26, true);
    y -= 34;
    for (const s of others) { this.drawSurvivorRow(s, 8, y - 16, false); y -= 20; }
  }
  drawSurvivorRow(s, x, y, big) {
    const bw = big ? 120 : 84, bh = big ? 7 : 4;
    const name = s.name.toUpperCase();
    const st = s.state;
    let label = '', frac = 0, temp = 0, col = this.hpColor(s.total);
    if (st === 'dead') { label = 'DEAD'; col = '#555'; }
    else if (st === 'incap') { label = 'DOWN'; frac = s.incapHealth / SURVIVOR.incapHealth; col = '#c83020'; }
    else if (st === 'ledge') { label = 'HANGING'; frac = s.ledgeHealth / SURVIVOR.ledgeHealth; col = '#c86020'; }
    else { frac = s.health / 100; temp = s.temp / 100; }
    if (s.pinnedBy && st !== 'dead') label = (Math.floor(this.game.world.time * 4) % 2 ? 'PINNED' : '');
    // portrait block
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - 3, y - 3, bw + (big ? 70 : 58), big ? 26 : 19);
    c.fillStyle = st === 'dead' ? '#333' : (s.needsHelp ? '#a03010' : '#304070');
    c.fillRect(x, y, big ? 18 : 13, big ? 18 : 13);
    this.text(name[0], x + (big ? 9 : 6.5), y + (big ? 3 : 2), { align: 'center', size: big ? 12 : 9, color: '#fff' });
    const bx = x + (big ? 23 : 17);
    this.text(name + (s.blackAndWhite && big ? '  ♥' : ''), bx, y - 1, { size: big ? 8 : 7, color: st === 'dead' ? '#777' : '#eee' });
    const hpTxt = st === 'alive' ? String(Math.ceil(s.total)) : label;
    this.text(hpTxt, bx + bw, y - 1, { size: big ? 8 : 7, align: 'right', color: st === 'alive' ? col : '#f66' });
    if (st !== 'dead') this.bar(bx, y + (big ? 10 : 9), bw, bh, frac, col, 'rgba(0,0,0,0.6)', temp);
    if (label && st === 'alive') this.text(label, bx + bw / 2, y + (big ? 10 : 8) - 1, { size: 6, align: 'center', color: '#fff' });
    // inventory icons
    const ix = bx + bw + 6;
    const items = [s.inv.throwable, s.inv.kit, s.inv.pills];
    items.forEach((it, i) => { if (it) this.icon(it, ix + i * (big ? 14 : 11), y + (big ? 6 : 4), big ? 10 : 8); });
  }

  icon(id, x, y, s) {
    const c = this.ctx;
    c.save(); c.translate(x, y);
    const k = s / 10;
    c.scale(k, k);
    switch (id) {
      case 'medkit': c.fillStyle = '#ddd'; c.fillRect(0, 1, 10, 8); c.fillStyle = '#c22'; c.fillRect(4, 2, 2, 6); c.fillRect(2, 4, 6, 2); break;
      case 'defib': c.fillStyle = '#d8a020'; c.fillRect(0, 2, 10, 7); c.fillStyle = '#333'; c.fillRect(1, 0, 3, 3); c.fillRect(6, 0, 3, 3); break;
      case 'pills': c.fillStyle = '#e88a20'; c.fillRect(2, 2, 6, 8); c.fillStyle = '#eee'; c.fillRect(2, 0, 6, 3); break;
      case 'adrenaline': c.fillStyle = '#ddd'; c.fillRect(1, 4, 7, 3); c.fillStyle = '#e86a10'; c.fillRect(7, 3, 3, 5); c.fillStyle = '#aaa'; c.fillRect(0, 5, 2, 1); break;
      case 'pipebomb': c.fillStyle = '#888'; c.fillRect(1, 3, 8, 4); c.fillStyle = '#e22'; c.fillRect(4, 2, 2, 2); break;
      case 'molotov': c.fillStyle = '#6a8a40'; c.fillRect(3, 3, 4, 7); c.fillRect(4, 1, 2, 2); c.fillStyle = '#f80'; c.fillRect(4, -1, 2, 2); break;
      case 'bilejar': c.fillStyle = '#5a8a20'; c.fillRect(2, 3, 6, 7); c.fillStyle = '#ccc'; c.fillRect(2, 1, 6, 2); break;
      case 'upgrade_incendiary': c.fillStyle = '#6a5a3a'; c.fillRect(0, 2, 10, 7); c.fillStyle = '#f60'; c.fillRect(3, 3, 4, 5); break;
      case 'upgrade_explosive': c.fillStyle = '#6a5a3a'; c.fillRect(0, 2, 10, 7); c.fillStyle = '#38f'; c.fillRect(3, 3, 4, 5); break;
      default: c.fillStyle = '#ccc'; c.fillRect(0, 0, 10, 10);
    }
    c.restore();
  }

  drawWeapons(p) {
    const c = this.ctx, W = this.W, H = this.H;
    const x0 = W - 168, y0 = H - 48;
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x0 - 4, y0 - 4, 166, 48);
    const slots = [p.inv.primary, p.inv.secondary, p.inv.throwable, p.inv.kit, p.inv.pills];
    for (let i = 0; i < 5; i++) {
      const sx = x0 + i * 32, sy = y0 + 22;
      const active = p.slot === i && !p.inv.carry;
      c.fillStyle = active ? 'rgba(220,200,120,0.35)' : 'rgba(255,255,255,0.08)';
      c.fillRect(sx, sy, 30, 16);
      const it = slots[i];
      if (!it) continue;
      if (i <= 1) {
        const name = it.id === 'dual_pistols' ? 'DUALS' : (WEAPONS[it.id] || MELEE[it.id]).name.replace(/(Assault|Combat|Submachine|Silenced|Military|Hunting|Grenade|Chrome|Pump)\s/, (m) => m[0] + '.').toUpperCase().slice(0, 8);
        this.text(name, sx + 15, sy + 4, { size: 6, align: 'center', color: active ? '#fff' : '#bbb' });
      } else this.icon(it, sx + 10, sy + 3, 10);
    }
    if (p.inv.carry) { this.text('CARRYING ' + displayName(p.inv.carry.type).toUpperCase(), x0 + 80, y0 + 2, { size: 8, align: 'center', color: '#fd6' }); return; }
    const ws = p.activeWeapon;
    if (ws && !ws.isMelee) {
      const res = ws.reserve === Infinity ? '' : String(ws.reserve);
      const low = ws.clip <= Math.ceil(ws.def.clip * 0.2);
      this.text(String(ws.clip), x0 + 96, y0 - 2, { size: 18, align: 'right', color: low ? '#f55' : '#fff' });
      if (res) this.text(res, x0 + 102, y0 + 5, { size: 10, color: '#ccc' });
      if (ws.upgrade) this.text(`${ws.upgrade.rounds} ${ws.upgrade.type === 'incendiary' ? 'INCEND' : 'EXPLO'}`, x0 + 2, y0 + 4, { size: 7, color: ws.upgrade.type === 'incendiary' ? '#f80' : '#5af' });
      if (ws.laser) this.text('LASER', x0 + 2, y0 - 3, { size: 6, color: '#f44' });
    } else if (ws && ws.def.kind === 'chainsaw') {
      this.bar(x0 + 40, y0 + 4, 80, 5, ws.fuel / ws.def.fuel, '#e80');
      this.text('FUEL', x0 + 4, y0 + 2, { size: 7 });
    } else if (p.activeItem) this.text(displayName(p.activeItem).toUpperCase(), x0 + 80, y0 + 2, { size: 8, align: 'center' });
  }

  drawCrosshair(p) {
    if (p.state === 'dead' || this.game.world.cameraMode !== 'fp' || !this.game.settings.get('crosshair')) return;
    if (this.game.player.zoom) return;
    const c = this.ctx, cx = Math.round(this.W / 2), cy = Math.round(this.H / 2);
    const ws = p.activeWeapon;
    let gap = 3;
    if (ws && ws.def.spread) gap = 2 + currentSpread(ws, p) * 2.2 + (ws.def.kind === 'shotgun' ? 6 : 0);
    if (!ws) gap = 2;
    gap = Math.min(30, gap);
    const len = 4;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(cx - gap - len - 1, cy - 1, len + 2, 3); c.fillRect(cx + gap - 1, cy - 1, len + 2, 3);
    c.fillRect(cx - 1, cy - gap - len - 1, 3, len + 2); c.fillRect(cx - 1, cy + gap - 1, 3, len + 2);
    c.fillStyle = p.useFocus ? '#bff' : '#eee';
    c.fillRect(cx - gap - len, cy, len, 1); c.fillRect(cx + gap, cy, len, 1);
    c.fillRect(cx, cy - gap - len, 1, len); c.fillRect(cx, cy + gap, 1, len);
    if (ws && ws.isMelee) { c.fillRect(cx, cy, 1, 1); }
    // shove fatigue meter
    if (p.shoveFatigue > SURVIVOR.shoveFatigueMin && p.shoveCd > 0) { this.bar(cx - 15, cy + 16, 30, 2, 1 - p.shoveCd / 2, '#d84'); }
  }

  drawProgress(p) {
    const w = this.game.world;
    let a = p.action, label = '', frac = 0;
    if (a && ACTION_TEXT[a.type]) { label = ACTION_TEXT[a.type](p, a.target)[0]; frac = a.t / a.dur; }
    else {
      // being helped
      for (const s of w.survivors) if (s.action && s.action.target === p && ACTION_TEXT[s.action.type]) { label = ACTION_TEXT[s.action.type](s, p)[1]; frac = s.action.t / s.action.dur; }
    }
    if (!label) {
      if (p.state === 'incap') label = p.helper ? '' : 'You are incapacitated! Hold on for help.';
      if (p.state === 'ledge') label = 'Hanging from a ledge!';
      if (p.state === 'dead') {
        const sp = this.game.player.specTarget;
        this.text('YOU ARE DEAD', this.W / 2, this.H * 0.18, { size: 14, align: 'center', color: '#e44' });
        this.text(sp && sp !== p ? `Spectating ${sp.name}  (click to switch)` : 'Waiting for rescue...', this.W / 2, this.H * 0.18 + 18, { size: 8, align: 'center', color: '#ccc' });
        return;
      }
      if (label) this.text(label, this.W / 2, this.H * 0.68, { size: 8, align: 'center', color: '#f88' });
      if (p.state === 'incap' || p.state === 'ledge') {
        const f = p.state === 'incap' ? p.incapHealth / 300 : p.ledgeHealth / 300;
        this.bar(this.W / 2 - 60, this.H * 0.68 + 12, 120, 4, f, '#c83020');
      }
      return;
    }
    const bw = 140;
    this.text(label, this.W / 2, this.H * 0.62, { size: 8, align: 'center' });
    this.bar(this.W / 2 - bw / 2, this.H * 0.62 + 12, bw, 5, frac, '#e8e0c0');
  }

  drawHints(p) {
    const f = this.game.player.useFocus;
    if (!f || p.action) return;
    let txt = '';
    const t = f.target;
    if (f.kind === 'revive') txt = `[E] Help ${t.name} up`;
    else if (f.kind === 'ledge') txt = `[E] Pull ${t.name} up`;
    else if (f.kind === 'pickup') txt = t.id === 'ammo_pile' ? '[E] Grab ammo' : t.id === 'laser_sight' ? '[E] Attach laser sight' : t.id.endsWith('_deployed') ? '[E] Take special ammo' : `[E] Pick up ${displayName(t.id)}`;
    else if (f.kind === 'carry') txt = `[E] Pick up ${displayName(t.type)}`;
    else if (f.kind === 'interact') txt = `[E] ${t.useText || (t.closed !== undefined ? (t.closed ? 'Open door' : 'Close door') : 'Use')}`;
    else if (f.kind === 'pour') txt = `[E] ${t.useText || 'Pour'}`;
    if (txt) this.text(txt, this.W / 2, this.H / 2 + 22, { size: 8, align: 'center', color: '#dfe8ff' });
    if (p.activeItem === 'medkit' && !p.action) this.text('[LMB] Heal self   [RMB] Heal teammate', this.W / 2, this.H - 62, { size: 7, align: 'center', color: '#bbb' });
    if ((p.activeItem === 'pills' || p.activeItem === 'adrenaline') && !p.action) this.text('[LMB] Use   [RMB] Give to teammate', this.W / 2, this.H - 62, { size: 7, align: 'center', color: '#bbb' });
    if (p.inv.carry) this.text('[LMB] Throw   [G] Drop', this.W / 2, this.H - 62, { size: 7, align: 'center', color: '#bbb' });
  }

  project(pos) {
    const cam = this.game.camera;
    _v.copy(pos).project(cam);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * this.W, y: (-_v.y * 0.5 + 0.5) * this.H };
  }
  drawTags(p) {
    const w = this.game.world;
    for (const s of w.survivors) {
      if (s === p) continue;
      const head = _v.set(s.body.pos.x, s.body.pos.y + (s.state === 'alive' ? 2.05 : 0.9), s.body.pos.z);
      const d = head.distanceTo(this.game.camera.position);
      const sp = this.project(head);
      if (!sp) continue;
      if (s.needsHelp && s.state !== 'dead') {
        const blink = Math.floor(w.time * 3) % 2;
        const what = s.pinnedBy ? `SAVE ${s.name.toUpperCase()}` : s.state === 'ledge' ? `PULL UP ${s.name.toUpperCase()}` : `HELP ${s.name.toUpperCase()}`;
        this.text(what, Math.max(30, Math.min(this.W - 30, sp.x)), Math.max(10, Math.min(this.H - 70, sp.y - 10)), { size: 8, align: 'center', color: blink ? '#ff7030' : '#ffb080' });
        this.text(`${Math.round(d)}m`, Math.max(30, Math.min(this.W - 30, sp.x)), Math.max(10, Math.min(this.H - 70, sp.y)), { size: 6, align: 'center', color: '#fca' });
      } else if (s.state === 'dead' && p.activeItem === 'defib') {
        this.text(`DEFIB ${s.name.toUpperCase()}`, sp.x, sp.y, { size: 7, align: 'center', color: '#fd4' });
      } else if (d < 22 && s.state !== 'dead' && Math.abs(sp.x - this.W / 2) < 60 && Math.abs(sp.y - this.H / 2) < 60) {
        this.text(s.name, sp.x, sp.y - 6, { size: 7, align: 'center', color: '#9bf' });
      }
    }
  }
  drawMessages() {
    const w = this.game.world;
    let y = 6;
    const col = { info: '#e8e4d8', warn: '#ffb050', bad: '#ff5050', kill: '#a0e0ff', ff: '#ff8080', item: '#c8ffc8' };
    for (const m of w.messages) {
      const a = Math.min(1, m.t);
      this.ctx.globalAlpha = a;
      this.text(m.text, 6, y, { size: 7, color: col[m.kind] || '#eee' });
      y += 10;
    }
    this.ctx.globalAlpha = 1;
  }
  drawSubtitles() {
    if (!this.game.settings.get('subtitles')) return;
    const w = this.game.world;
    let y = this.H - 78 - (w.subtitles.length - 1) * 10;
    for (const s of w.subtitles) {
      this.ctx.globalAlpha = Math.min(1, s.t * 2);
      const line = `${s.who}: ${s.text}`;
      this.ctx.font = 'bold 8px monospace';
      const tw = this.ctx.measureText(line).width;
      this.ctx.fillStyle = 'rgba(0,0,0,0.5)'; this.ctx.fillRect(this.W / 2 - tw / 2 - 3, y - 1, tw + 6, 10);
      this.text(line, this.W / 2, y, { size: 8, align: 'center', color: '#f0e6c0' });
      y += 10;
    }
    this.ctx.globalAlpha = 1;
  }
  drawObjective() {
    const w = this.game.world;
    const o = w.objective;
    if (!o) return;
    const txt = typeof o === 'function' ? o(w) : o;
    if (!txt) return;
    this.ctx.font = 'bold 9px monospace';
    const tw = this.ctx.measureText(txt).width;
    this.ctx.fillStyle = 'rgba(0,0,0,0.55)'; this.ctx.fillRect(this.W / 2 - tw / 2 - 6, 5, tw + 12, 14);
    this.text(txt, this.W / 2, 8, { size: 9, align: 'center', color: '#ffe8a0' });
  }
  drawDamage(dt) {
    const c = this.ctx, cx = this.W / 2, cy = this.H / 2;
    for (let i = 0; i < this.dmgMarks.length; i++) {
      const m = this.dmgMarks[i];
      m.t -= dt * 1.2;
      if (m.t <= 0) { this.dmgMarks.splice(i, 1); i--; continue; }
      const r = Math.min(this.W, this.H) * 0.32;
      const x = cx + Math.sin(m.a) * r, y = cy - Math.cos(m.a) * r;
      c.save(); c.translate(x, y); c.rotate(m.a);
      c.fillStyle = `rgba(220,20,10,${m.t * 0.8})`;
      c.beginPath(); c.moveTo(-14, 4); c.lineTo(0, -6); c.lineTo(14, 4); c.lineTo(0, 0); c.closePath(); c.fill();
      c.restore();
    }
  }
  drawScope() {
    const c = this.ctx, cx = this.W / 2, cy = this.H / 2, r = this.H * 0.45;
    c.fillStyle = '#000';
    c.beginPath(); c.rect(0, 0, this.W, this.H); c.arc(cx, cy, r, 0, Math.PI * 2, true); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.9)';
    c.fillRect(cx - r, cy, r * 2, 1); c.fillRect(cx, cy - r, 1, r * 2);
  }
}
