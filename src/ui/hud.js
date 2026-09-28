// DOM heads-up display.
import * as THREE from 'three';
import { itemName } from '../world/items.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

const SLOT_ICON = {
  0: '<svg viewBox="0 0 64 24"><path d="M2 10h40l4-4h6v4h10v4H48l-4 8h-6l2-8H14l-4 6H4l2-6H2z" fill="currentColor"/></svg>',
  1: '<svg viewBox="0 0 40 24"><path d="M4 6h30v6H16l-2 10H7l2-10H4z" fill="currentColor"/></svg>',
  melee: '<svg viewBox="0 0 40 24"><path d="M3 20L30 4l4 2-4 6-24 11z" fill="currentColor"/></svg>',
  2: '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="18" rx="2" fill="currentColor"/><rect x="10" y="0" width="4" height="4" fill="currentColor"/></svg>',
  3: '<svg viewBox="0 0 28 24"><rect x="2" y="4" width="24" height="18" rx="2" fill="currentColor"/><path d="M12 8h4v4h4v4h-4v4h-4v-4H8v-4h4z" fill="#000"/></svg>',
  4: '<svg viewBox="0 0 20 24"><rect x="4" y="6" width="12" height="16" rx="3" fill="currentColor"/><rect x="3" y="2" width="14" height="5" rx="1" fill="currentColor"/></svg>',
};

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = el('div', 'hud', root);
    this.root.style.display = 'none';
    // crosshair
    this.cross = el('div', 'crosshair', this.root);
    this.crossLines = ['t', 'b', 'l', 'r'].map((k) => el('div', 'ch ch-' + k, this.cross));
    this.hitMark = el('div', 'hitmark', this.root, '<i></i><i></i><i></i><i></i>');
    // damage indicator canvas
    this.dmgCanvas = el('canvas', 'dmgcanvas', this.root);
    this.dmgCanvas.width = 300; this.dmgCanvas.height = 300;
    this.dmgCtx = this.dmgCanvas.getContext('2d');
    this.dmgInd = [];
    // team
    this.team = el('div', 'team', this.root);
    this.teamRows = [];
    // player block
    this.pblock = el('div', 'pblock', this.root);
    this.pname = el('div', 'pname', this.pblock);
    this.pbar = el('div', 'pbar', this.pblock);
    this.pbarFill = el('div', 'fill', this.pbar);
    this.pbarTemp = el('div', 'temp', this.pbar);
    this.pnum = el('div', 'pnum', this.pblock);
    this.pstate = el('div', 'pstate', this.pblock);
    // weapon block
    this.wblock = el('div', 'wblock', this.root);
    this.wname = el('div', 'wname', this.wblock);
    this.wammo = el('div', 'wammo', this.wblock);
    this.slots = el('div', 'slots', this.wblock);
    this.slotEls = [0, 1, 2, 3, 4].map((i) => el('div', 'slot', this.slots));
    // prompt / progress
    this.prompt = el('div', 'prompt', this.root);
    this.progress = el('div', 'progress', this.root);
    this.progressLabel = el('div', 'plabel', this.progress);
    this.progressBar = el('div', 'pfill', el('div', 'ptrack', this.progress));
    // subtitles
    this.subs = el('div', 'subs', this.root);
    // objective & toast
    this.objective = el('div', 'objective', this.root);
    this.toastEl = el('div', 'toast', this.root);
    this.title = el('div', 'titlecard', this.root);
    // name tags
    this.tags = el('div', 'tags', this.root);
    this.tagEls = new Map();
    // scope
    this.scope = el('div', 'scope', this.root, '<div class="scope-cross"></div>');
    // boss bar
    this.boss = el('div', 'bossbar', this.root, '<div class="bname">TANK</div><div class="btrack"><div class="bfill"></div></div>');
    this.bossFill = this.boss.querySelector('.bfill');
    // incap/bleed info
    this.center = el('div', 'centermsg', this.root);
    this.fpsEl = el('div', 'fps', this.root);
    this.t = 0;
    this.subQueue = [];
    this.hitT = 0;
    this._v = new THREE.Vector3();
  }
  show(v) { this.root.style.display = v ? '' : 'none'; }
  toast(text, dur = 2.2) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = 1;
    this.toastT = dur;
  }
  setObjective(text, dur = 7) {
    this.objective.innerHTML = text;
    this.objective.style.opacity = text ? 1 : 0;
    this.objT = dur;
  }
  // chapter change: drop the previous chapter's objective, subtitles, toasts
  clearTransient() {
    this.setObjective('', 0);
    this.subs.innerHTML = '';
    this.toastEl.style.opacity = 0;
    this.toastT = 0;
  }
  titleCard(big, small, dur = 5) {
    this.title.innerHTML = `<div class="tc-small">${small}</div><div class="tc-big">${big}</div>`;
    this.title.style.opacity = 1;
    this.titleT = dur;
  }
  subtitle(text, name, color, dur) {
    const line = el('div', 'subline', this.subs, `<span class="sname" style="color:${color}">${name}:</span> ${text}`);
    line._t = dur;
    while (this.subs.children.length > 3) this.subs.removeChild(this.subs.firstChild);
  }
  hit(kill = false, head = false) {
    this.hitT = 0.18;
    this.hitMark.className = 'hitmark on' + (kill ? ' kill' : '') + (head ? ' head' : '');
  }
  damageFrom(x, z) {
    this.dmgInd.push({ x, z, t: 1.2 });
    if (this.dmgInd.length > 8) this.dmgInd.shift();
  }
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    this.t += dt;
    // timers
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.style.opacity = 0; }
    if (this.objT > 0) { this.objT -= dt; if (this.objT <= 0) this.objective.style.opacity = 0; }
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) this.title.style.opacity = 0; }
    for (const c of Array.from(this.subs.children)) { c._t -= dt; if (c._t <= 0) c.remove(); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitMark.className = 'hitmark'; }
    // crosshair spread
    const w = p.weapon;
    const cam = g.renderer.camera;
    let gap = 8;
    if (w && !w.def.melee) {
      const deg = w.spread(p);
      const px = Math.tan(THREE.MathUtils.degToRad(deg)) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (window.innerHeight / 2);
      gap = Math.max(4, Math.min(80, px));
    }
    const hideCross = !w || (w && w.zoomed) || p.dead || w.def.melee;
    this.cross.style.display = hideCross ? 'none' : '';
    this.crossLines[0].style.transform = `translate(-50%, ${-gap - 10}px)`;
    this.crossLines[1].style.transform = `translate(-50%, ${gap}px)`;
    this.crossLines[2].style.transform = `translate(${-gap - 10}px, -50%)`;
    this.crossLines[3].style.transform = `translate(${gap}px, -50%)`;
    this.scope.style.display = w && w.zoomed ? 'block' : 'none';
    // throttle heavy DOM work
    this.slowT = (this.slowT || 0) - dt;
    this.drawDamage(dt);
    this.updateTags();
    if (this.slowT > 0) return;
    this.slowT = 0.08;
    this.updatePlayer(p);
    this.updateTeam();
    this.updateWeapon(p);
    this.updatePrompt(p);
    // tank bar
    const tank = g.infected.specials.find((s) => s.kind === 'tank' && !s.dead && s.pos.distanceTo(p.pos) < 60);
    this.boss.style.display = tank ? 'block' : 'none';
    if (tank) this.bossFill.style.width = Math.max(0, tank.hp / tank.maxHp * 100) + '%';
    this.fpsEl.style.display = g.settings.showFps ? 'block' : 'none';
    if (g.settings.showFps) this.fpsEl.textContent = `${g.fps.toFixed(0)} fps | ${g.infected.commons.length} inf | upd ${(g.perf?.upd || 0).toFixed(1)}ms`;
  }
  updatePlayer(p) {
    const tot = p.health + p.temp;
    const col = p.incapped ? '#d02020' : tot > 39 ? '#4ec04e' : tot > 24 ? '#e0c030' : '#d02020';
    this.pname.textContent = p.name;
    this.pname.style.color = p.char.color;
    if (p.incapped) {
      this.pbarFill.style.width = (p.incapHP / 300 * 100) + '%';
      this.pbarTemp.style.width = '0%';
      this.pnum.textContent = Math.ceil(p.incapHP);
    } else {
      this.pbarFill.style.width = p.health + '%';
      this.pbarTemp.style.left = p.health + '%';
      this.pbarTemp.style.width = Math.min(100 - p.health, p.temp) + '%';
      this.pnum.textContent = Math.ceil(tot);
    }
    this.pbarFill.style.background = col;
    this.pnum.style.color = col;
    let st = '';
    if (p.dead) st = 'DEAD';
    else if (p.incapped) st = p.beingRevived ? 'BEING REVIVED' : 'INCAPACITATED';
    else if (p.pinned) st = 'PINNED!';
    else if (p.blackAndWhite) st = 'ONE MORE DOWN = DEATH';
    this.pstate.textContent = st;
    this.center.textContent = p.dead ? (this.game.survivors.some((s) => !s.dead) ? 'You died. Spectating — click to switch. You will rejoin at the next safe room.' : '') : (p.incapped && !p.beingRevived ? 'You are incapacitated! Hold on — your team must help you up.' : '');
  }
  updateTeam() {
    const g = this.game;
    const mates = g.survivors.filter((s) => s !== g.player);
    while (this.teamRows.length < mates.length) {
      const r = el('div', 'trow', this.team);
      r.nameEl = el('div', 'tname', r);
      const bar = el('div', 'tbar', r);
      r.fill = el('div', 'fill', bar);
      r.temp = el('div', 'temp', bar);
      r.icons = el('div', 'ticons', r);
      r.status = el('div', 'tstat', r);
      this.teamRows.push(r);
    }
    mates.forEach((s, i) => {
      const r = this.teamRows[i];
      r.nameEl.textContent = s.netName ? s.name + " · " + s.netName : s.name;
      r.nameEl.style.color = s.char.color;
      const tot = s.health + s.temp;
      const col = s.incapped ? '#d02020' : tot > 39 ? '#4ec04e' : tot > 24 ? '#e0c030' : '#d02020';
      r.fill.style.width = (s.dead ? 0 : s.incapped ? s.incapHP / 3 : s.health) + '%';
      r.fill.style.background = col;
      r.temp.style.left = s.health + '%';
      r.temp.style.width = (s.incapped || s.dead ? 0 : Math.min(100 - s.health, s.temp)) + '%';
      r.status.textContent = s.dead ? 'DEAD' : s.pinned ? 'PINNED' : s.incapped ? 'DOWN' : s.blackAndWhite ? 'B&W' : '';
      r.status.className = 'tstat' + (s.dead || s.pinned || s.incapped ? ' bad' : '');
      r.icons.innerHTML = (s.inv.medkit ? '<span class="ic med">+</span>' : '') + (s.inv.pills ? '<span class="ic pil">P</span>' : '') + (s.inv.throwable ? '<span class="ic thr">T</span>' : '');
    });
  }
  updateWeapon(p) {
    const w = p.weapon;
    const item = p.activeItem;
    if (w) {
      this.wname.textContent = w.name;
      if (w.def.melee) this.wammo.innerHTML = '';
      else if (p.usingMounted) { const m = p.usingMounted; this.wammo.innerHTML = `<div style="width:160px;height:10px;border:1px solid #aaa;display:inline-block;background:#111"><div style="height:100%;width:${Math.round(m.heat * 100)}%;background:${m.overheated > 0 ? '#e03020' : 'linear-gradient(90deg,#e0c030,#e05020)'}"></div></div><span style="font-size:13px">HEAT</span>`; }
      else if (w.def.noReload) this.wammo.innerHTML = `<b>${w.clip}</b>`;
      else this.wammo.innerHTML = `<b class="${w.clip === 0 ? 'empty' : w.clip <= w.maxClip * 0.25 ? 'low' : ''}">${w.clip}</b><span>/ ${w.reserve === Infinity ? '∞' : w.reserve}</span>`;
    } else {
      this.wname.textContent = item ? itemName(item) : '';
      this.wammo.innerHTML = '';
    }
    const has = [!!p.inv.primary, true, !!p.inv.throwable, p.inv.medkit, !!p.inv.pills];
    this.slotEls.forEach((e, i) => {
      e.className = 'slot' + (i === p.slot ? ' sel' : '') + (has[i] ? '' : ' empty');
      const icon = i === 1 && p.inv.secondary.melee ? SLOT_ICON.melee : SLOT_ICON[i];
      if (e._icon !== icon + has[i]) { e.innerHTML = `<span class="key">${i + 1}</span>` + (has[i] ? icon : ''); e._icon = icon + has[i]; }
    });
  }
  updatePrompt(p) {
    const g = this.game;
    const a = p.action;
    if (a && (a.type === 'heal' || a.type === 'revive' || a.type === 'use' || a.type === 'pills')) {
      this.progress.style.display = 'block';
      const lbl = a.type === 'heal' ? (a.target ? 'Healing ' + a.target.name : 'Healing yourself') : a.type === 'revive' ? 'Reviving ' + a.target.name : a.type === 'pills' ? 'Taking pills' : (a.label || 'Using');
      this.progressLabel.textContent = lbl;
      this.progressBar.style.width = Math.min(100, a.t / a.dur * 100) + '%';
    } else if (p.beingRevived || p.beingHealed) {
      const by = p.beingRevived || p.beingHealed;
      this.progress.style.display = 'block';
      this.progressLabel.textContent = (p.beingRevived ? 'Being revived by ' : 'Being healed by ') + by.name;
      const ba = by.action;
      this.progressBar.style.width = ba ? Math.min(100, ba.t / ba.dur * 100) + '%' : '0%';
    } else this.progress.style.display = 'none';
    const u = g.currentUsable;
    if (u && !a && !p.incapped && !p.dead) {
      this.prompt.innerHTML = `<span class="key">E</span> ${u.prompt}`;
      this.prompt.style.opacity = 1;
    } else this.prompt.style.opacity = 0;
  }
  drawDamage(dt) {
    const c = this.dmgCtx;
    c.clearRect(0, 0, 300, 300);
    const p = this.game.player;
    if (!p) return;
    for (let i = this.dmgInd.length - 1; i >= 0; i--) {
      const d = this.dmgInd[i];
      d.t -= dt;
      if (d.t <= 0) { this.dmgInd.splice(i, 1); continue; }
      const ang = Math.atan2(-(d.x - p.pos.x), -(d.z - p.pos.z)) - p.yaw;
      const a = -ang - Math.PI / 2;
      c.strokeStyle = `rgba(220,20,10,${Math.min(1, d.t) * 0.85})`;
      c.lineWidth = 10;
      c.beginPath();
      c.arc(150, 150, 110, a - 0.35, a + 0.35);
      c.stroke();
    }
  }
  updateTags() {
    const g = this.game;
    const cam = g.renderer.camera;
    const p = g.player;
    const W = window.innerWidth, H = window.innerHeight;
    for (const s of g.survivors) {
      if (s === p) continue;
      let t = this.tagEls.get(s);
      if (!t) { t = el('div', 'tag', this.tags); this.tagEls.set(s, t); }
      if (s.dead || p.dead && false) { t.style.display = 'none'; continue; }
      const v = this._v.set(s.pos.x, s.pos.y + (s.incapped ? 0.9 : 2.05), s.pos.z);
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (d > 25 && !s.incapped && !s.pinned)) { t.style.display = 'none'; continue; }
      t.style.display = 'block';
      t.style.left = ((v.x + 1) / 2 * W) + 'px';
      t.style.top = ((1 - v.y) / 2 * H) + 'px';
      const trouble = s.incapped || s.pinned;
      t.innerHTML = `<span style="color:${trouble ? '#ff4030' : s.char.color}">${s.name}${trouble ? ' !' : ''}</span>`;
      t.style.opacity = Math.max(0.35, 1 - d / 30);
    }
  }
}
