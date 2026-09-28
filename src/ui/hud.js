// DOM heads-up display. Minimal layout: thin bars, small-caps labels, corner
// gradients instead of boxes. Every public method/property other code uses
// (toast, setObjective, clearTransient, titleCard, subtitle, hit, damageFrom,
// update, title/titleT/subs/objective/root, …) is kept.
import * as THREE from 'three';
import { itemName } from '../world/items.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
// cached DOM writes (the HUD refreshes ~12x/s; skip unchanged values)
const txt = (e, v) => { if (e._txt !== v) { e._txt = v; e.textContent = v; } };
const htm = (e, v) => { if (e._htm !== v) { e._htm = v; e.innerHTML = v; } };
const cls = (e, v) => { if (e._cls !== v) { e._cls = v; e.className = v; } };
const sty = (e, k, v) => { const c = '_s_' + k; if (e[c] !== v) { e[c] = v; e.style[k] = v; } };
const vr = (e, k, v) => { const c = '_v_' + k; if (e[c] !== v) { e[c] = v; e.style.setProperty(k, v); } };

const svg = (vb, body) => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const PISTOL = '<path d="M2 3.5h24.5v4.2H13.6l-1.9 7.3H6.8l1.9-7.3H2z"/><path d="M13.6 7.7h3.8l-.7 2.8h-3.8z" opacity=".6"/>';
const ICON = {
  pistol: svg('0 0 28 16', PISTOL),
  dual: svg('0 0 36 18', `<g transform="translate(8 0)" opacity=".5">${PISTOL}</g><g transform="translate(0 2.5)">${PISTOL}</g>`),
  magnum: svg('0 0 34 16', '<path d="M1.5 4h30v3.6H17.8l-1.4 2.2h-2.2l-2.4 5.7H6.9l2.5-7L8 7.6H1.5z"/><circle cx="15.5" cy="5.8" r="3"/>'),
  smg: svg('0 0 40 16', '<path d="M1 5.2h6v2.6H1z"/><path d="M7 3.6h21.5v5.6H7z"/><path d="M28.5 5.2h9v2.2h-9z"/><path d="M19.5 9.2h3.4l.9 6h-3.4z"/><path d="M10.2 9.2h3.4l-1.5 5.3H8.7z"/>'),
  rifle: svg('0 0 48 16', '<path d="M1 5.2l9-1h2V10H9.5L2 12.8H1z"/><path d="M12 3.6h19v5.8H12z"/><path d="M17 1.8h7v1.8h-7z"/><path d="M31 4.6h10v3.8H31z"/><path d="M41 5.6h6.5v1.8H41z"/><path d="M22.6 9.4h3.6l1.6 5.8h-3.6z"/><path d="M14.2 9.4h3.3l-1.4 5H12.8z"/>'),
  shotgun: svg('0 0 50 16', '<path d="M1 6.4l10-2.2h2.5v5.3H9.5L2 12.6H1z"/><path d="M13.5 4h11v5.6h-11z"/><path d="M24.5 4.6h24v2.2h-24z"/><path d="M24.5 7.4h17v1.6h-17z"/><rect x="29" y="6.6" width="10" height="3.6" rx="1"/><path d="M15.2 9.6h3.2l-1.2 4.6H14z"/>'),
  sniper: svg('0 0 52 16', '<path d="M1 6.6l9.5-1.8H13v5H9L2 12.8H1z"/><path d="M13 4.8h14v4.8H13z"/><path d="M27 5.8h24v1.8H27z"/><rect x="14" y="1" width="12.5" height="2.4" rx="1.1"/><path d="M17 3.2h1.6v1.8H17zM22.2 3.2h1.6v1.8h-1.6z"/><path d="M20 9.6h3.4v3.6H20z"/><path d="M14.4 9.6h3.2l-1.2 4.6h-3.2z"/>'),
  heavy: svg('0 0 52 16', '<path d="M1 5.4l9-1.4h2.5v5.6H9L2 12.4H1z"/><path d="M12.5 3.4h18v6.4h-18z"/><path d="M30.5 5h20v2h-20z"/><path d="M19 9.8h8v5h-8z"/><path d="M40 7l-2.5 7.5h1.4L41.4 7zM41.6 7l2.5 7.5h-1.4L40.2 7z"/>'),
  launcher: svg('0 0 46 16', '<rect x="2" y="3.5" width="40" height="6.2" rx="1.2"/><path d="M14 9.7h3.4l-1.3 5h-3.3zM24 9.7h3v3.4h-3z"/>'),
  minigun: svg('0 0 46 16', '<rect x="2" y="3" width="16" height="9" rx="2"/><path d="M18 3.8h26v2H18zM18 6.6h26v2H18zM18 9.4h26v2H18z"/>'),
  melee: svg('0 0 40 16', '<path d="M2.5 14.2L29.3 3.6l.9 1.8L3.4 16z"/><path d="M26.4 .6l8.8 3.2-2.6 6.6-3.6-1.9 1.2-3-4.8-1.8z"/>'),
  pipebomb: svg('0 0 16 16', '<rect x="4.2" y="4.6" width="7.6" height="10.6" rx="1.2"/><rect x="3.4" y="3.4" width="9.2" height="2.2" rx=".6"/><path d="M7.4 3.4c0-2.2 1.6-2.8 3.4-3l.2 1c-1.5.3-2.4.6-2.4 2z"/>'),
  molotov: svg('0 0 16 16', '<path d="M6.3 3.6h3.4v2.2l2.1 2.1V15.4H4.2V7.9l2.1-2.1z"/><path d="M6.5 3.2C6 1.8 7.5 1.5 8 0c.9 1.4 2 1.9 1.4 3.2z" opacity=".7"/>'),
  bile: svg('0 0 16 16', '<rect x="4.4" y="1.4" width="7.2" height="2.4" rx=".6"/><path d="M4.6 4.4h6.8l1.4 1.8v9.2H3.2V6.2z"/>'),
  medkit: svg('0 0 18 16', '<path fill-rule="evenodd" d="M1 4.4h16v11H1zM7.6 6.6v2.5H5.1v2.8h2.5v2.5h2.8v-2.5h2.5V9.1h-2.5V6.6z"/><path d="M6 4.4V2h6v2.4h-1.5V3.3h-3v1.1z"/>'),
  pills: svg('0 0 12 16', '<rect x="1.6" y="1" width="8.8" height="3" rx=".8"/><rect x="2.4" y="4.6" width="7.2" height="10.8" rx="1.4"/>'),
  adrenaline: svg('0 0 16 16', '<path d="M11.6 1l3.4 3.4-1 1-.9-.9-1.5 1.5 1 1L5 14.6l-.8-.8-2.4 2.4-1.2-1.2 2.4-2.4-.8-.8L9.8 4.2l1 1 1.5-1.5-.9-.9z"/>'),
  // status
  down: svg('0 0 16 16', '<circle cx="3.6" cy="10.4" r="2.2"/><rect x="6.6" y="8.8" width="8.6" height="3.2" rx="1.6"/>'),
  pinned: svg('0 0 16 16', '<path fill-rule="evenodd" d="M8 1.2l7.4 13.2H.6zM7.1 5.6v4.6h1.8V5.6zM7.1 11.2V13h1.8v-1.8z"/>'),
  bw: svg('0 0 16 16', '<path fill-rule="evenodd" d="M8 1.4a6.6 6.6 0 1 1 0 13.2A6.6 6.6 0 0 1 8 1.4zm0 1.7v9.8a4.9 4.9 0 0 0 0-9.8z"/>'),
  dead: svg('0 0 16 16', '<path fill-rule="evenodd" d="M8 1.2c3.7 0 6.2 2.5 6.2 5.8 0 2-1 3.4-2.4 4.2v3.2H4.2v-3.2C2.8 10.4 1.8 9 1.8 7c0-3.3 2.5-5.8 6.2-5.8zM5.6 6.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm4.8 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>'),
};
const weaponIcon = (w) => !w ? '' : w.def.melee ? ICON.melee : w.dual ? ICON.dual : w.type === 'magnum' ? ICON.magnum : (ICON[w.def.kind] || ICON.rifle);
const itemIcons = (inv) => (inv.medkit ? `<i class="ic med">${ICON.medkit}</i>` : '') +
  (inv.pills ? `<i class="ic pil">${ICON[inv.pills] || ICON.pills}</i>` : '') +
  (inv.throwable ? `<i class="ic thr">${ICON[inv.throwable] || ICON.pipebomb}</i>` : '');

// health colour: soft green -> amber (limping, <40) -> red (<25), continuous
function hpColor(tot, bad) {
  if (bad || tot < 25) return 'hsl(5 88% 60%)';
  if (tot < 40) return `hsl(${Math.round(24 + (tot - 25) / 15 * 18)} 90% 58%)`;
  return `hsl(${Math.round(44 + Math.min(1, (tot - 40) / 35) * 72)} ${Math.round(88 - Math.min(1, (tot - 40) / 35) * 34)}% 60%)`;
}
const PIN = { smoker: 'Smoker', hunter: 'Hunter', jockey: 'Jockey', charger: 'Charger' };
const pinLabel = (s) => PIN[s.pinned?.kind] || PIN[s.pinType] || 'Pinned';
const RING = '<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="rt" cx="18" cy="18" r="16"/><circle class="rf" cx="18" cy="18" r="16" pathLength="100"/></svg>';

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = el('div', 'hud', root);
    this.root.style.display = 'none';
    el('div', 'hud-shade', this.root);
    // crosshair
    this.cross = el('div', 'crosshair', this.root);
    this.crossLines = ['t', 'b', 'l', 'r'].map((k) => el('div', 'ch ch-' + k, this.cross));
    el('div', 'ch ch-dot', this.cross);
    this.hitMark = el('div', 'hitmark', this.root, '<i></i><i></i><i></i><i></i>');
    // damage direction indicators
    this.dmgCanvas = el('canvas', 'dmgcanvas', this.root);
    this.dmgCanvas.width = 300; this.dmgCanvas.height = 300;
    this.dmgCtx = this.dmgCanvas.getContext('2d');
    this.dmgInd = [];
    // teammates (bottom-left, above the player block)
    this.team = el('div', 'team', this.root);
    this.teamRows = [];
    // player block
    this.pblock = el('div', 'pblock', this.root);
    this.pnum = el('div', 'pnum', this.pblock);
    const phead = el('div', 'phead', this.pblock);
    this.pname = el('div', 'pname', phead);
    this.pflag = el('div', 'pflag', phead);
    this.pitems = el('div', 'pitems', phead);
    this.pbar = el('div', 'pbar', this.pblock);
    this.pbarGhost = el('div', 'ghost', this.pbar);
    this.pbarFill = el('div', 'fill', this.pbar);
    this.pbarTemp = el('div', 'temp', this.pbar);
    this.pstate = el('div', 'pstate', this.pblock);
    // weapon block (bottom-right)
    this.wblock = el('div', 'wblock', this.root);
    this.slots = el('div', 'slots', this.wblock);
    this.slotEls = [0, 1, 2, 3, 4].map((i) => el('div', 'slot', this.slots));
    this.wname = el('div', 'wname', this.wblock);
    this.wammo = el('div', 'wammo', this.wblock);
    this.wclip = el('div', 'wclip', this.wblock);
    this.slotShowT = 0;
    // use prompt pill + hold progress ring
    this.prompt = el('div', 'useprompt', this.root, `<span class="kc">${RING}<b>E</b></span><span class="ptxt"><em>Hold</em><span></span></span>`);
    this.promptText = this.prompt.querySelector('.ptxt > span');
    this.progress = el('div', 'useprompt useprogress hold', this.root, `<span class="kc">${RING}<b></b></span><span class="ptxt"><span></span></span>`);
    this.progressLabel = this.progress.querySelector('.ptxt > span');
    this.progressGlyph = this.progress.querySelector('.kc b');
    this.progressBar = this.progress.querySelector('.rf');
    // subtitles
    this.subs = el('div', 'subs', this.root);
    // objective, toast, chapter title
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
    this.gap = 8;
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
    if (text) this.objective.className = 'objective ' + ((this._objFlip = !this._objFlip) ? 'in-a' : 'in-b');
  }
  // chapter change: drop the previous chapter's objective, subtitles, toasts
  clearTransient() {
    this.setObjective('', 0);
    this.subs.innerHTML = '';
    this.toastEl.style.opacity = 0;
    this.toastT = 0;
  }
  titleCard(big, small, dur = 5) {
    this.title.innerHTML = `<div class="tc-small">${small}</div><div class="tc-rule"></div><div class="tc-big">${big}</div>`;
    this.title.style.opacity = 1;
    this.titleT = dur;
  }
  subtitle(text, name, color, dur) {
    const line = el('div', 'subline', this.subs, `<span class="sname">${name}</span><span class="stext">${text}</span>`);
    line.style.setProperty('--c', color);
    line._t = dur;
    while (this.subs.children.length > 3) this.subs.removeChild(this.subs.firstChild);
  }
  hit(kill = false, head = false) {
    this.hitT = 0.26;
    // alternate the animation name so every hit restarts the pop
    this.hitMark.className = 'hitmark on ' + ((this._hmFlip = !this._hmFlip) ? 'a' : 'b') + (kill ? ' kill' : '') + (head ? ' head' : '');
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
    for (const c of Array.from(this.subs.children)) {
      c._t -= dt;
      if (c._t <= 0) c.remove();
      else if (c._t < 0.4 && !c._out) { c._out = true; c.classList.add('out'); }
    }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitMark.className = 'hitmark'; }
    if (this.slotShowT > 0) { this.slotShowT -= dt; if (this.slotShowT <= 0) this.slots.classList.remove('show'); }
    // crosshair: thin lines, spread follows the weapon's live cone (smoothed)
    const w = p.weapon;
    const cam = g.renderer.camera;
    const H = window.innerHeight;
    let gap = 7;
    if (w && !w.def.melee) {
      const deg = w.spread(p);
      const px = Math.tan(THREE.MathUtils.degToRad(deg)) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (H / 2);
      gap = Math.max(4, Math.min(80, px));
    }
    this.gap += (gap - this.gap) * Math.min(1, dt * 22);
    const hideCross = !w || (w && w.zoomed) || p.dead || w.def.melee;
    sty(this.cross, 'opacity', hideCross ? '0' : '1');
    if (!hideCross) {
      const cw = H >= 900 ? 2 : 1, len = H >= 900 ? 9 : 6, o = cw >> 1, gp = Math.round(this.gap);
      if (this._cw !== cw) {
        this._cw = cw;
        this.cross.style.setProperty('--cw', cw + 'px');
        this.cross.style.setProperty('--cl', len + 'px');
      }
      if (this._gp !== gp) {
        this._gp = gp;
        this.crossLines[0].style.transform = `translate(${-o}px, ${-gp - len}px)`;
        this.crossLines[1].style.transform = `translate(${-o}px, ${gp}px)`;
        this.crossLines[2].style.transform = `translate(${-gp - len}px, ${-o}px)`;
        this.crossLines[3].style.transform = `translate(${gp}px, ${-o}px)`;
      }
    }
    sty(this.scope, 'display', w && w.zoomed ? 'block' : 'none');
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
    sty(this.boss, 'display', tank ? 'block' : 'none');
    if (tank) sty(this.bossFill, 'width', Math.max(0, tank.hp / tank.maxHp * 100).toFixed(1) + '%');
    sty(this.fpsEl, 'display', g.settings.showFps ? 'block' : 'none');
    if (g.settings.showFps) this.fpsEl.textContent = `${g.fps.toFixed(0)} fps | ${g.infected.commons.length} inf | upd ${(g.perf?.upd || 0).toFixed(1)}ms`;
  }
  updatePlayer(p) {
    const tot = p.health + p.temp;
    const col = hpColor(tot, p.incapped || p.dead);
    txt(this.pname, p.name);
    sty(this.pname, 'color', p.char.color);
    vr(this.pblock, '--hp', col);
    let fill, num;
    if (p.dead) { fill = 0; num = 0; sty(this.pbarTemp, 'width', '0%'); }
    else if (p.incapped) {
      fill = p.incapHP / 300 * 100; num = Math.ceil(p.incapHP);
      sty(this.pbarTemp, 'width', '0%');
    } else {
      fill = p.health; num = Math.ceil(tot);
      sty(this.pbarTemp, 'left', p.health + '%');
      sty(this.pbarTemp, 'width', Math.min(100 - p.health, p.temp) + '%');
    }
    const fw = Math.max(0, Math.min(100, fill)).toFixed(1) + '%';
    sty(this.pbarFill, 'width', fw);
    sty(this.pbarGhost, 'width', fw);
    txt(this.pnum, String(num));
    let st = '', flag = '', mode = '';
    if (p.dead) { st = 'Dead'; mode = 'dead'; }
    else if (p.incapped) { st = p.beingRevived ? 'Being revived' : 'Incapacitated'; flag = ICON.down; mode = 'incap'; }
    else if (p.pinned) { st = pinLabel(p); flag = ICON.pinned; mode = 'pinned'; }
    else if (p.blackAndWhite) { st = 'Next down is fatal'; flag = ICON.bw; mode = 'bw'; }
    if (!mode && tot < 25) mode = 'crit';
    cls(this.pblock, 'pblock' + (mode ? ' m-' + mode : ''));
    txt(this.pstate, st);
    htm(this.pflag, flag);
    htm(this.pitems, itemIcons(p.inv));
    txt(this.center, p.dead ? (this.game.survivors.some((s) => !s.dead) ? 'You died. Spectating — click to switch. You will rejoin at the next safe room.' : '') : (p.incapped && !p.beingRevived ? 'You are incapacitated! Hold on — your team must help you up.' : ''));
  }
  updateTeam() {
    const g = this.game;
    const mates = g.survivors.filter((s) => s !== g.player);
    while (this.teamRows.length < mates.length) {
      const r = el('div', 'trow', this.team);
      const head = el('div', 'thead', r);
      r.nameEl = el('div', 'tname', head);
      r.status = el('div', 'tstat', head);
      r.icons = el('div', 'ticons', head);
      const bar = el('div', 'tbar', r);
      r.fill = el('div', 'fill', bar);
      r.temp = el('div', 'temp', bar);
      this.teamRows.push(r);
    }
    this.teamRows.forEach((r, i) => sty(r, 'display', i < mates.length ? '' : 'none'));
    mates.forEach((s, i) => {
      const r = this.teamRows[i];
      txt(r.nameEl, s.netName ? s.name + ' · ' + s.netName : s.name);
      sty(r.nameEl, 'color', s.char.color);
      const tot = s.health + s.temp;
      vr(r, '--hp', hpColor(tot, s.incapped || s.dead));
      sty(r.fill, 'width', (s.dead ? 0 : s.incapped ? s.incapHP / 3 : s.health).toFixed(1) + '%');
      sty(r.temp, 'left', s.health + '%');
      sty(r.temp, 'width', (s.incapped || s.dead ? 0 : Math.min(100 - s.health, s.temp)) + '%');
      const mode = s.dead ? 'dead' : s.pinned ? 'pinned' : s.incapped ? 'down' : s.blackAndWhite ? 'bw' : '';
      const label = s.dead ? 'Dead' : s.pinned ? pinLabel(s) : s.incapped ? 'Down' : s.blackAndWhite ? 'B&amp;W' : '';
      htm(r.status, mode ? ICON[mode] + `<span>${label}</span>` : '');
      cls(r, 'trow' + (mode ? ' st-' + mode : ''));
      htm(r.icons, s.dead ? '' : itemIcons(s.inv));
    });
  }
  updateWeapon(p) {
    const w = p.weapon;
    const item = p.activeItem;
    let ammo = '', clip = '', state = '';
    if (w) {
      txt(this.wname, w.name);
      if (w.def.melee) ammo = '';
      else if (p.usingMounted) {
        const m = p.usingMounted;
        ammo = `<span class="heat${m.overheated > 0 ? ' over' : ''}"><i style="width:${Math.round(m.heat * 100)}%"></i></span><em>${m.overheated > 0 ? 'Overheated' : 'Heat'}</em>`;
      } else if (w.def.noReload) ammo = `<b>${w.clip}</b>`;
      else {
        ammo = `<b class="${w.clip === 0 ? 'empty' : w.clip <= w.maxClip * 0.25 ? 'low' : ''}">${w.clip}</b><i>/</i><span>${w.reserve === Infinity ? '∞' : w.reserve}</span>`;
        const mc = w.maxClip;
        if (mc <= 16) {
          let s = '';
          for (let k = 0; k < mc; k++) s += k < w.clip ? '<i class="on"></i>' : '<i></i>';
          clip = `<div class="pips">${s}</div>`;
        } else clip = `<div class="cbar"><i style="width:${(w.clip / mc * 100).toFixed(1)}%"></i></div>`;
        if (w.reloading) state = 'reloading';
        else if (w.clip === 0) state = 'empty';
      }
    } else {
      txt(this.wname, item ? itemName(item) : '');
    }
    htm(this.wammo, ammo);
    htm(this.wclip, clip);
    cls(this.wblock, 'wblock' + (state ? ' ' + state : '') + (w && w.def.melee ? ' melee' : '') + (!w ? ' noweap' : ''));
    const inv = p.inv;
    const has = [!!inv.primary, true, !!inv.throwable, inv.medkit, !!inv.pills];
    const icons = [weaponIcon(inv.primary), weaponIcon(inv.secondary), inv.throwable ? ICON[inv.throwable] || ICON.pipebomb : '', ICON.medkit, ICON[inv.pills] || ICON.pills];
    let sig = String(p.slot);
    this.slotEls.forEach((e, i) => {
      const ic = has[i] ? icons[i] : '';
      sig += '|' + (has[i] ? ic.length + (inv.throwable || '') + (inv.pills || '') : '-');
      cls(e, 'slot' + (i === p.slot ? ' sel' : '') + (has[i] ? '' : ' empty'));
      htm(e, `<span class="sk">${i + 1}</span>` + ic);
    });
    // slots fade in on any change (switch, pickup, use) and fade out again
    if (this._slotSig !== sig) {
      if (this._slotSig !== undefined) { this.slotShowT = 2.6; this.slots.classList.add('show'); }
      this._slotSig = sig;
    }
  }
  updatePrompt(p) {
    const g = this.game;
    const a = p.action;
    let frac = -1, label = '', glyph = '';
    if (a && (a.type === 'heal' || a.type === 'revive' || a.type === 'use' || a.type === 'pills')) {
      label = a.type === 'heal' ? (a.target ? 'Healing ' + a.target.name : 'Healing yourself') : a.type === 'revive' ? 'Reviving ' + a.target.name : a.type === 'pills' ? 'Taking pills' : (a.label || 'Using');
      frac = a.t / a.dur;
      glyph = a.type === 'heal' ? ICON.medkit : a.type === 'pills' ? ICON.pills : 'E';
    } else if (p.beingRevived || p.beingHealed) {
      const by = p.beingRevived || p.beingHealed;
      label = (p.beingRevived ? 'Being revived by ' : 'Being healed by ') + by.name;
      const ba = by.action;
      frac = ba ? ba.t / ba.dur : 0;
      glyph = p.beingRevived ? ICON.down : ICON.medkit;
    }
    const busy = frac >= 0;
    if (busy) {
      txt(this.progressLabel, label);
      htm(this.progressGlyph, glyph);
      sty(this.progressBar, 'strokeDashoffset', (100 - Math.max(0, Math.min(1, frac)) * 100).toFixed(1));
    }
    cls(this.progress, 'useprompt useprogress hold' + (busy ? ' on' : ''));
    const u = g.currentUsable;
    const show = u && !a && !busy && !p.incapped && !p.dead;
    if (show) {
      txt(this.promptText, u.prompt || '');
      cls(this.prompt, 'useprompt on' + (u.hold ? ' hold' : ''));
    } else cls(this.prompt, 'useprompt');
  }
  drawDamage(dt) {
    const c = this.dmgCtx;
    const W = window.innerWidth, H = window.innerHeight;
    if (this._dW !== W || this._dH !== H) {
      this._dW = W; this._dH = H;
      const css = Math.round(Math.min(H * 0.56, W * 0.6));
      const S = Math.min(1024, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
      this.dmgCanvas.width = S; this.dmgCanvas.height = S;
      this.dmgCanvas.style.width = this.dmgCanvas.style.height = css + 'px';
      this._dirty = true;
    }
    const p = this.game.player;
    if (!p) return;
    if (!this.dmgInd.length) { if (this._dirty) { c.clearRect(0, 0, this.dmgCanvas.width, this.dmgCanvas.height); this._dirty = false; } return; }
    const S = this.dmgCanvas.width, C = S / 2;
    c.clearRect(0, 0, S, S);
    this._dirty = true;
    c.lineCap = 'round';
    for (let i = this.dmgInd.length - 1; i >= 0; i--) {
      const d = this.dmgInd[i];
      d.t -= dt;
      if (d.t <= 0) { this.dmgInd.splice(i, 1); continue; }
      const ang = Math.atan2(-(d.x - p.pos.x), -(d.z - p.pos.z)) - p.yaw;
      const a = -ang - Math.PI / 2;
      const k = Math.min(1, d.t / 0.7);            // fade out
      const pop = Math.max(0, d.t - 1.0) / 0.2;    // slight inward slide on arrival
      const R = S * (0.4 + pop * 0.03);
      c.strokeStyle = `rgba(255,40,24,${0.16 * k})`;
      c.lineWidth = S * 0.05;
      c.beginPath(); c.arc(C, C, R, a - 0.3, a + 0.3); c.stroke();
      c.strokeStyle = `rgba(255,90,70,${0.85 * k})`;
      c.lineWidth = Math.max(2, S * 0.008);
      c.beginPath(); c.arc(C, C, R, a - 0.22, a + 0.22); c.stroke();
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
      if (s.dead) { sty(t, 'display', 'none'); continue; }
      const v = this._v.set(s.pos.x, s.pos.y + (s.incapped ? 0.9 : 2.05), s.pos.z);
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (d > 25 && !s.incapped && !s.pinned)) { sty(t, 'display', 'none'); continue; }
      sty(t, 'display', 'block');
      t.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - v.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`;
      const trouble = s.incapped || s.pinned;
      cls(t, 'tag' + (trouble ? ' trouble' : ''));
      htm(t, trouble ? `${ICON[s.pinned ? 'pinned' : 'down']}<span>${s.name}</span>` : `<span style="color:${s.char.color}">${s.name}</span>`);
      sty(t, 'opacity', Math.max(0.35, 1 - d / 30).toFixed(2));
    }
  }
}
