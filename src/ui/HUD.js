// In-battle heads-up display.

import * as THREE from 'three';
import { FACTION_INFO } from '../sim/world.js';
import { MAT } from '../world/terrain.js';
import { formatDistance, bearingDegrees } from '../core/math.js';

const _v = new THREE.Vector3();

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function fmtClock(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hourText(h) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}H`;
}

const MODE_NAMES = { free: 'Free camera', orbit: 'Orbit', follow: 'Chase', eyes: 'First person', cinematic: 'Cinematic', overview: 'Battle map' };

const HELP = [
  ['Fly', 'W A S D'],
  ['Down / up', 'Q / E'],
  ['Boost / precise', 'Shift / Ctrl'],
  ['Look', 'Right-drag (or drag)'],
  ['Camera speed / zoom', 'Mouse wheel'],
  ['Select unit', 'Left click'],
  ['Chase selected', 'F'],
  ['First person / gunner / FPV', 'V'],
  ['Orbit selected', 'O'],
  ['Free / Orbit / Chase / Eyes / Cinematic / Map', '1 – 6'],
  ['Next / previous unit', '] / ['],
  ['Jump to the heaviest fighting', 'R'],
  ['Follow a random aircraft', 'T'],
  ['Pause', 'Space'],
  ['Slower / faster time', '− / +'],
  ['Objective markers', 'M'],
  ['Hide interface', 'Tab'],
  ['Performance stats', 'P'],
  ['Release camera', 'Esc'],
  ['This help', 'H'],
];

export class HUD {
  constructor(root, app) {
    this.app = app;
    this.root = el('div');
    this.root.id = 'hud';
    root.append(this.root);
    this.build();
    this.t = 0;
    this.miniT = 0;
    this.feedItems = [];
    this.radioItems = [];
    this.selected = null;
    this.helpOpen = false;
  }

  build() {
    const r = this.root;
    // Top bar.
    this.top = el('div', 'topbar');
    const score = el('div', 'score panel');
    const side = (cls, f) => {
      const s = el('div', `side ${cls}`);
      const nm = el('div', 'nm');
      const name = el('span');
      name.append(el('span', 'full', FACTION_INFO[f].name), el('span', 'short', FACTION_INFO[f].short));
      const tk = el('span', 'tk');
      const num = el('b');
      tk.append(num, el('span', 'word', ' tickets'));
      nm.append(name, tk);
      const bar = el('div', 'bar');
      const fill = el('i');
      bar.append(fill);
      s.append(nm, bar);
      return { s, num, word: tk.lastChild, fill };
    };
    this.sides = [side('left', 0), side('right', 1)];
    this.clock = el('div', 'clock');
    score.append(this.sides[0].s, this.clock, this.sides[1].s);
    this.objs = el('div', 'objs');
    this.top.append(score, this.objs);
    // Status (camera mode, time scale).
    this.status = el('div', 'status panel');
    this.modeEl = el('div', 'mode');
    this.speedEl = el('div', 'speed');
    this.hintEl = el('div', 'hint', 'H: controls');
    this.status.append(this.modeEl, this.speedEl, this.hintEl);
    // Feeds.
    this.feed = el('div', 'feed');
    this.radio = el('div', 'radio panel');
    this.radio.append(el('div', 'label', 'Radio net'));
    this.radioList = el('div');
    this.radioList.style.display = 'grid';
    this.radioList.style.gap = '6px';
    this.radio.append(this.radioList);
    // Minimap.
    this.mini = el('div', 'minimap panel pe');
    this.miniCanvas = el('canvas');
    this.miniCanvas.width = 420;
    this.miniCanvas.height = 420;
    this.miniCanvas.setAttribute('aria-label', 'Battle map: click to move the camera');
    this.miniCap = el('div', 'cap label');
    this.mini.append(this.miniCanvas, this.miniCap);
    this.miniCanvas.addEventListener('click', (e) => {
      const rect = this.miniCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2048 - 1024;
      const z = ((e.clientY - rect.top) / rect.height) * 2048 - 1024;
      this.app.jumpTo(x, z);
    });
    // Unit card.
    this.card = el('div', 'card panel pe');
    this.card.hidden = true;
    const top = el('div', 'top');
    this.cardName = el('div', 'name');
    this.cardCs = el('div', 'cs');
    top.append(this.cardName, this.cardCs);
    const hp = el('div', 'hp');
    this.cardHp = el('i');
    hp.append(this.cardHp);
    this.cardDoing = el('div', 'doing');
    const facts = el('div', 'facts');
    const fact = (label) => {
      const f = el('div', 'fact');
      const v = el('div', 'v');
      f.append(el('div', 'label', label), v);
      facts.append(f);
      return v;
    };
    this.fWeapon = fact('Weapon');
    this.fAmmo = fact('Ammo');
    this.fKills = fact('Kills');
    this.fRange = fact('Target');
    const btns = el('div', 'btns');
    const b = (label, fn) => {
      const x = el('button', 'btn', label);
      x.type = 'button';
      x.addEventListener('click', fn);
      btns.append(x);
      return x;
    };
    this.btnFollow = b('Chase (F)', () => this.app.cameraFollow('follow'));
    this.btnEyes = b('Eyes (V)', () => this.app.cameraFollow('eyes'));
    this.btnOrbit = b('Orbit (O)', () => this.app.cameraFollow('orbit'));
    b('Release', () => this.app.release());
    this.card.append(top, hp, this.cardDoing, facts, btns);
    // Forces.
    this.forces = el('div', 'forces panel');
    // Labels layer.
    this.labels = el('div', 'labels');
    this.objLabels = [];
    this.selLabel = el('div', 'ulabel');
    this.selLabel.hidden = true;
    this.labels.append(this.selLabel);
    // Help.
    this.help = el('div', 'help panel pe');
    this.help.hidden = true;
    const h3 = el('h3', '', 'Spectator controls');
    const cols = el('div', 'cols');
    for (const [k, v] of HELP) {
      const kv = el('div', 'kv');
      const kb = el('kbd', '', v);
      kv.append(el('span', '', k), kb);
      cols.append(kv);
    }
    const close = el('button', 'btn', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => this.toggleHelp(false));
    this.help.append(h3, cols, close);
    // FPV OSD.
    this.osd = el('div', 'osd');
    this.osd.hidden = true;
    this.osdTL = el('div', 'tl');
    this.osdTR = el('div', 'tr');
    this.osdBL = el('div', 'bl');
    this.osdBR = el('div', 'br');
    this.osd.append(el('div', 'cross'), this.osdTL, this.osdTR, this.osdBL, this.osdBR);
    // Gunner's sight for vehicles in first person.
    this.sight = el('div', 'sight');
    this.sight.hidden = true;
    this.sight.innerHTML =
      '<svg class="ret" viewBox="-100 -100 200 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<path d="M-90 0H-14M14 0H90M0 14V60"/><path d="M-8 10L0 2L8 10"/>' +
      '<path d="M-40 -4V4M-60 -4V4M40 -4V4M60 -4V4M-6 30H6M-6 45H6"/></g></svg>';
    this.sightTL = el('div', 'tl');
    this.sightTR = el('div', 'tr');
    this.sightBL = el('div', 'bl');
    this.sightBR = el('div', 'br');
    this.sight.append(this.sightTL, this.sightTR, this.sightBL, this.sightBR);
    // Perf.
    this.perf = el('div', 'perf panel');
    this.perf.hidden = true;
    // Toast layer.
    this.toasts = el('div');
    // Touch pad.
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) this.buildTouchPad();
    r.append(this.labels, this.top, this.status, this.feed, this.radio, this.mini, this.card, this.forces, this.osd, this.sight, this.perf, this.toasts, this.help);
  }

  buildTouchPad() {
    const pad = el('div', 'touchpad pe');
    const keys = [['', null], ['▲', 'KeyW'], ['⤒', 'KeyE'], ['◀', 'KeyA'], ['▼', 'KeyS'], ['▶', 'KeyD'], ['', null], ['', null], ['⤓', 'KeyQ']];
    for (const [t, code] of keys) {
      const b = el('button', code ? '' : 'e', t);
      b.type = 'button';
      if (code) {
        const on = (e) => {
          e.preventDefault();
          this.app.camera.keys.add(code);
        };
        const off = () => this.app.camera.keys.delete(code);
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointerleave', off);
        b.addEventListener('pointercancel', off);
      }
      pad.append(b);
    }
    this.root.append(pad);
  }

  attachWorld(world) {
    this.world = world;
    this.buildMiniBase(world);
    // Objective chips and labels.
    this.objs.textContent = '';
    this.objChips = world.objectives
      .slice()
      .sort((a, b) => a.letter.localeCompare(b.letter))
      .map((o) => {
        const chip = el('div', 'obj panel');
        const ring = el('div', 'ring');
        ring.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2.5"/><circle class="arc" cx="12" cy="12" r="10" fill="none" stroke-width="2.5" stroke-dasharray="62.8" stroke-dashoffset="62.8" transform="rotate(-90 12 12)"/></svg>';
        ring.append(el('span', '', o.letter));
        chip.append(ring, el('span', '', o.name));
        this.objs.append(chip);
        const lab = el('div', 'olabel');
        const l1 = el('div', '', `${o.letter} · ${o.name}`);
        const l2 = el('div', 'd');
        lab.append(l1, l2);
        this.labels.append(lab);
        return { o, chip, arc: ring.querySelector('.arc'), letter: ring.lastChild, label: lab, dist: l2 };
      });
  }

  // Pre-render the battle map: hillshade, materials, buildings, forest.
  buildMiniBase(world) {
    const S = 420;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const t = world.terrain;
    const col = {
      [MAT.GRASS]: [86, 99, 58],
      [MAT.DRYGRASS]: [126, 120, 80],
      [MAT.DIRT]: [110, 92, 66],
      [MAT.ROCK]: [118, 114, 106],
      [MAT.SAND]: [170, 155, 118],
      [MAT.ROAD]: [62, 62, 62],
      [MAT.FIELD]: [128, 112, 70],
      [MAT.CONCRETE]: [130, 128, 122],
      [MAT.MUD]: [80, 66, 50],
      [MAT.FOREST]: [48, 64, 36],
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = (x / S) * 2048 - 1024;
        const wz = (y / S) * 2048 - 1024;
        const h = t.heightAt(wx, wz);
        const hx = t.heightAt(wx + 6, wz) - t.heightAt(wx - 6, wz);
        const hz = t.heightAt(wx, wz + 6) - t.heightAt(wx, wz - 6);
        const shade = Math.max(0.45, Math.min(1.35, 1 - (hx * 0.7 + hz * 0.45) * 0.08));
        const m = t.materialAt(wx, wz);
        const base = col[m] || col[MAT.GRASS];
        const contour = Math.abs(((h / 10) % 1) - 0.5) > 0.46 ? 0.82 : 1;
        const i = (y * S + x) * 4;
        img.data[i] = base[0] * shade * contour;
        img.data[i + 1] = base[1] * shade * contour;
        img.data[i + 2] = base[2] * shade * contour;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Buildings.
    ctx.fillStyle = 'rgba(30,28,26,0.9)';
    for (const s of world.structures.list) {
      if (s.kind !== 'building') continue;
      ctx.save();
      ctx.translate(((s.x + 1024) / 2048) * S, ((s.z + 1024) / 2048) * S);
      ctx.rotate(-s.yaw);
      const w = Math.max(1, (s.hx * 2 * S) / 2048);
      const h = Math.max(1, (s.hz * 2 * S) / 2048);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
    this.miniBase = c;
  }

  toggleHelp(v = !this.helpOpen) {
    this.helpOpen = v;
    this.help.hidden = !v;
  }

  togglePerf() {
    this.perf.hidden = !this.perf.hidden;
  }

  setHidden(v) {
    this.root.classList.toggle('hidden-ui', v);
  }

  toast(text, color) {
    const t = el('div', 'toast', text);
    if (color) t.style.color = color;
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3300);
  }

  handle(events) {
    const w = this.world;
    for (const e of events) {
      if (e.t === 'kill') this.addKill(e);
      else if (e.t === 'radio') this.addRadio(e.faction, e.text);
      else if (e.t === 'objective') {
        const f = FACTION_INFO[e.faction];
        if (e.kind === 'captured') this.toast(`Objective ${e.obj.letter} taken by ${f.name}`, f.color);
        else this.toast(`Objective ${e.obj.letter} neutralized`, '#dbe2d0');
      } else if (e.t === 'battle_over') this.showEnd(e.winner);
      else if (e.t === 'reinforcements' && e.faction !== undefined && Math.random() < 0.3) {
        // Occasional notice only; radio carries the detail.
      }
    }
    void w;
  }

  addKill(e) {
    const v = e.victim;
    if (!v || (v.cat === 'inf' && !e.killer && v.def.role === 'crew')) return;
    // Keep the feed readable: all vehicles/aircraft, a sample of infantry.
    if (v.cat === 'inf' && Math.random() > 0.35) return;
    const k = e.killer;
    const row = el('div', 'k');
    if (k) {
      const a = el('span', `c${k.faction}`, k.name);
      row.append(a, document.createTextNode(' ▸ '));
    }
    row.append(el('span', `c${v.faction}`, v.name));
    if (e.weapon && e.weapon.name) row.append(el('span', 'w', `  ${e.weapon.name}`));
    this.feed.prepend(row);
    this.feedItems.unshift({ row, t: performance.now() });
    while (this.feedItems.length > 7) this.feedItems.pop().row.remove();
  }

  addRadio(faction, text) {
    const i = text.indexOf(':');
    const m = el('div', `msg f${faction}`);
    const stamp = this.world ? hourText(this.world.weather.hour).slice(0, 4) : '';
    if (i > 0 && i < 40) {
      m.append(document.createTextNode(`${stamp} `), el('b', '', text.slice(0, i)), document.createTextNode(text.slice(i)));
    } else {
      m.append(document.createTextNode(`${stamp} `), el('b', '', FACTION_INFO[faction].short), document.createTextNode(` ${text}`));
    }
    this.radioList.prepend(m);
    this.radioItems.unshift(m);
    for (let k = 3; k < this.radioItems.length; k++) this.radioItems[k].classList.add('old');
    while (this.radioItems.length > 8) this.radioItems.pop().remove();
  }

  setSelected(u) {
    this.selected = u;
    this.card.hidden = !u;
  }

  describe(u) {
    const w = this.world;
    if (!u.alive && !u.dying) return u.cat === 'inf' ? 'Killed in action' : 'Destroyed';
    if (u.cat === 'inf') {
      if (u.para) return u.para.phase === 'fall' ? 'Exiting aircraft' : 'Under canopy, descending';
      if (u.mounted) return `Mounted in ${u.mounted.name}`;
      if (u.climb) return u.climb.up ? 'Climbing to the roof' : 'Coming down from the roof';
      if (u.suppression > 0.75) return 'Pinned down by fire';
      const sq = u.squad;
      if (sq && sq.state === 'retreat') return 'Falling back under fire';
      if (u.target && u.target.alive) return `Engaging ${u.target.name} at ${formatDistance(u.pos.distanceTo(u.target.pos))}`;
      const t = u.task ? u.task.type : null;
      if (t === 'bound') return 'Bounding to the next cover';
      if (t === 'assault') return 'Assaulting the position';
      if (t === 'flee') return 'Making for the rear';
      if (t === 'hold') return u.roof ? 'Holding a rooftop position' : sq && sq.order && sq.order.type === 'overwatch' ? 'On overwatch' : 'Holding position';
      if (t === 'fight') return u.cover ? 'In cover, scanning' : 'Looking for cover';
      if (sq && sq.state === 'flank') return 'Moving to flank';
      if (sq && sq.order && sq.order.obj) return `Moving on objective ${sq.order.obj.letter}`;
      return 'Moving with the squad';
    }
    if (u.cat === 'veh') {
      if (u.burning > 0) return 'On fire, crew bailing out';
      if (u.firepowerKill) return 'Main gun disabled, withdrawing';
      if (u.mobilityKill) return u.target ? `Immobilized, still firing on ${u.target.name}` : 'Immobilized';
      if (u.def.artillery) return u.brain && u.brain.current ? `Fire mission: ${u.brain.current.fired}/${u.brain.current.rounds} rounds` : 'Awaiting fire missions';
      if (u.carrierOf && u.carrierOf.mounted) return `Carrying ${u.carrierOf.callsign} to the drop-off`;
      if (u.target && u.target.alive) return `Engaging ${u.target.name} at ${formatDistance(u.pos.distanceTo(u.target.pos))}`;
      if (u.path) return u.reverse ? 'Reversing' : 'Advancing';
      return 'Holding, scanning sector';
    }
    if (u.crashing || u.dying) return 'Going down!';
    if (u.aclass === 'drone') return u.brain && u.brain.phase === 'dive' ? `Terminal dive on ${u.diveTarget ? u.diveTarget.name : 'target'}` : `Inbound to ${u.diveTarget ? u.diveTarget.name : 'target'}`;
    const b = u.brain;
    if (u.aclass === 'jet' && b) return { ingress: 'Ingress to the target area', run: 'Attack run', pull: 'Pulling off target', egress: 'Egressing' }[b.state] || 'On station';
    if (u.type === 'transport_heli' && b) return { inbound: 'Inbound to the LZ', approach: 'On approach', landing: 'Landing', unload: 'Troops disembarking', takeoff: 'Lifting off', outbound: 'Returning to base' }[b.state] || 'Flying';
    if (u.type === 'transport_plane') return u.passengers.length ? `Paradrop run, ${u.passengers.length} jumpers aboard` : 'Drop complete, egressing';
    if (u.type === 'recon_uav') return 'Orbiting the front, spotting';
    if (u.target && u.target.alive) return `Engaging ${u.target.name} at ${formatDistance(u.pos.distanceTo(u.target.pos))}`;
    void w;
    return 'Patrolling';
  }

  updateCard() {
    const u = this.selected;
    if (!u) return;
    if (u.removed) {
      this.setSelected(null);
      return;
    }
    const f = FACTION_INFO[u.faction];
    this.cardName.textContent = u.name;
    this.cardName.style.color = f.color;
    this.cardCs.textContent = `${u.callsign || f.short} · ${f.name}`;
    const hp = Math.max(0, u.hp / u.maxHp);
    this.cardHp.style.width = `${hp * 100}%`;
    this.cardHp.style.background = hp > 0.6 ? 'var(--ok)' : hp > 0.3 ? 'var(--warn)' : 'var(--bad)';
    this.cardDoing.textContent = this.describe(u);
    const w = u.weapon || u.weapons[0];
    this.fWeapon.textContent = w ? w.def.name : u.passengers && u.passengers.length ? `${u.passengers.length} troops` : '—';
    this.fAmmo.textContent = w ? (w.reloading ? 'Reloading' : w.def.ammo === Infinity ? `${w.mag} / ∞` : `${w.mag} / ${w.reserve}`) : u.aclass === 'drone' ? `${Math.round((u.battery / 300) * 100)}% batt` : '—';
    this.fKills.textContent = String(u.kills);
    this.fRange.textContent = u.target && u.target.alive ? formatDistance(u.pos.distanceTo(u.target.pos)) : '—';
    const m = this.app.camera.mode;
    this.btnFollow.classList.toggle('on', m === 'follow');
    this.btnEyes.classList.toggle('on', m === 'eyes');
    this.btnOrbit.classList.toggle('on', m === 'orbit');
  }

  updateScore() {
    const w = this.world;
    for (let f = 0; f < 2; f++) {
      const fac = w.factions[f];
      const s = this.sides[f];
      s.num.textContent = String(w.endless ? fac.units.length : Math.round(fac.tickets));
      s.word.textContent = w.endless ? ' units' : ' tickets';
      s.fill.style.width = `${w.endless ? 100 : (fac.tickets / fac.startTickets) * 100}%`;
    }
    this.clock.innerHTML = '';
    this.clock.append(document.createTextNode(fmtClock(w.time)));
    const small = el('small', '', `${hourText(w.weather.hour)} · ${w.weather.condition.toUpperCase()}`);
    this.clock.append(small);
    for (const c of this.objChips) {
      const o = c.o;
      const owner = o.owner;
      const col = owner === 0 ? FACTION_INFO[0].color : owner === 1 ? FACTION_INFO[1].color : '#cfd6c4';
      // Arc shows control toward the side currently pushing.
      const p = Math.abs(o.control);
      c.arc.setAttribute('stroke', o.control >= 0 ? FACTION_INFO[0].color : FACTION_INFO[1].color);
      c.arc.setAttribute('stroke-dashoffset', String(62.8 * (1 - p)));
      c.letter.style.color = col;
      c.chip.classList.toggle('contested', o.contested);
      c.chip.style.borderColor = owner >= 0 ? col : '';
    }
    const st = [w.strength(0), w.strength(1)];
    this.forces.innerHTML = '';
    const head = el('div', 'r h');
    head.append(el('span', '', ''), el('span', '', 'INF'), el('span', '', 'VEH'), el('span', '', 'AIR'));
    this.forces.append(head);
    for (let f = 0; f < 2; f++) {
      const r = el('div', 'r');
      const n = el('span', '', FACTION_INFO[f].short);
      n.style.color = FACTION_INFO[f].color;
      r.append(n, el('span', '', String(st[f].inf)), el('span', '', String(st[f].veh)), el('span', '', String(st[f].air)));
      this.forces.append(r);
    }
  }

  drawMini() {
    const w = this.world;
    const c = this.miniCanvas;
    const ctx = c.getContext('2d');
    const S = c.width;
    const k = S / 2048;
    ctx.drawImage(this.miniBase, 0, 0, S, S);
    ctx.fillStyle = 'rgba(8,10,8,0.18)';
    ctx.fillRect(0, 0, S, S);
    const px = (x) => (x + 1024) * k;
    // Objectives.
    for (const o of w.objectives) {
      const col = o.owner === 0 ? FACTION_INFO[0].color : o.owner === 1 ? FACTION_INFO[1].color : '#e6e6d8';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(o.x), px(o.z), Math.max(6, o.radius * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = '700 15px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.letter, px(o.x), px(o.z));
    }
    // Units.
    const colors = [FACTION_INFO[0].color, FACTION_INFO[1].color];
    for (const u of w.units) {
      if (!u.alive || u.hidden) continue;
      ctx.fillStyle = colors[u.faction];
      const x = px(u.pos.x);
      const y = px(u.pos.z);
      if (u.cat === 'inf') ctx.fillRect(x - 1, y - 1, 2, 2);
      else if (u.cat === 'veh') ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      else if (u.aclass !== 'drone') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-u.yaw + Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Camera frustum wedge.
    const cam = this.app.renderer.camera;
    const dir = cam.getWorldDirection(_v);
    const a = Math.atan2(dir.x, dir.z);
    const cx = px(cam.position.x);
    const cz = px(cam.position.z);
    const half = (cam.fov * cam.aspect * Math.PI) / 360;
    const r = 40;
    ctx.fillStyle = 'rgba(232,180,74,0.18)';
    ctx.strokeStyle = 'rgba(232,180,74,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cz);
    ctx.lineTo(cx + Math.sin(a - half) * r, cz + Math.cos(a - half) * r);
    ctx.lineTo(cx + Math.sin(a + half) * r, cz + Math.cos(a + half) * r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (this.selected && !this.selected.removed) {
      ctx.strokeStyle = '#e8b44a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(this.selected.pos.x), px(this.selected.pos.z), 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.miniCap.textContent = `${w.map.scenario.name} · ${w.units.length} active`;
  }

  updateLabels(camera, width, height) {
    const show = this.app.markersVisible;
    const placed = [];
    for (const c of this.objChips) {
      const o = c.o;
      _v.set(o.x, o.y + 16, o.z).project(camera);
      const vis = show && _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      c.label.hidden = !vis;
      if (vis) {
        c.sx = ((_v.x + 1) / 2) * width;
        c.sy = ((1 - _v.y) / 2) * height;
        c.label.style.color = o.owner === 0 ? FACTION_INFO[0].color : o.owner === 1 ? FACTION_INFO[1].color : '#e6e6d8';
        c.range = camera.position.distanceTo(_v.set(o.x, o.y, o.z));
        c.dist.textContent = formatDistance(c.range);
        if (!c.w) c.w = c.label.offsetWidth || 120;
        placed.push(c);
      }
    }
    // Nearest labels keep their spot; labels behind them that would overlap
    // stack upward. Positions are bottom-centre anchored.
    placed.sort((a, b) => a.range - b.range);
    for (let i = 0; i < placed.length; i++) {
      const c = placed[i];
      for (let pass = 0; pass < placed.length; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const p = placed[j];
          if (Math.abs(c.sx - p.sx) < (c.w + p.w) / 2 + 6 && Math.abs(c.sy - p.sy) < 34) {
            c.sy = p.sy - 36;
            moved = true;
          }
        }
        if (!moved) break;
      }
      c.label.style.left = `${c.sx}px`;
      c.label.style.top = `${c.sy}px`;
    }
    const u = this.selected;
    if (u && !u.removed && !u.hidden && this.app.camera.mode !== 'eyes') {
      const h = u.cat === 'inf' ? 2.3 : u.cat === 'veh' ? u.spec.height + 1.5 : 4;
      _v.set(u.pos.x, u.pos.y + h, u.pos.z).project(camera);
      const vis = _v.z < 1 && _v.z > -1;
      this.selLabel.hidden = !vis;
      if (vis) {
        this.selLabel.style.left = `${((_v.x + 1) / 2) * width}px`;
        this.selLabel.style.top = `${((1 - _v.y) / 2) * height}px`;
        this.selLabel.textContent = u.callsign || u.name;
      }
    } else this.selLabel.hidden = true;
  }

  updateOSD() {
    const cam = this.app.camera;
    const on = cam.fpvActive;
    this.osd.hidden = !on;
    if (!on) return;
    const d = cam.target;
    const w = this.world;
    const g = w.terrain.heightAt(d.pos.x, d.pos.z);
    const tg = d.diveTarget;
    this.osdTL.innerHTML = '';
    this.osdTL.append(el('div', '', `${d.callsign || 'FPV'} · CH ${(d.id % 8) + 1}`), el('div', 'rec', '● REC'));
    this.osdTR.innerHTML = '';
    this.osdTR.append(el('div', '', `BAT ${Math.max(0, Math.round((d.battery / 300) * 100))}%`), el('div', '', `${(14.8 - (1 - d.battery / 300) * 2.6).toFixed(1)}V`));
    this.osdBL.innerHTML = '';
    this.osdBL.append(el('div', '', `ALT ${Math.round(d.pos.y - g)} M`), el('div', '', `SPD ${Math.round(Math.hypot(d.vel.x, d.vel.y, d.vel.z) * 3.6)} KM/H`));
    this.osdBR.innerHTML = '';
    if (tg && tg.alive) this.osdBR.append(el('div', '', `TGT ${tg.name.toUpperCase()}`), el('div', '', `${Math.round(d.pos.distanceTo(tg.pos))} M`));
  }

  updateSight() {
    const cam = this.app.camera;
    const v = cam.target;
    const on = cam.mode === 'eyes' && v && v.cat === 'veh' && v.alive;
    this.sight.hidden = !on;
    if (!on) return;
    const w = v.weapons[0];
    const ammo = w && w.ammoType ? ` · ${w.ammoType.toUpperCase()}` : '';
    this.sightTL.textContent = `${(v.callsign || '').toUpperCase()} · GUNNER`;
    this.sightTR.textContent = w ? `${w.def.name.toUpperCase()}${ammo}${w.reloading ? ' · LOADING' : ''}` : '';
    const a = v.yaw + v.turretYaw;
    const az = Math.round(bearingDegrees(Math.sin(a), Math.cos(a))) % 360;
    this.sightBL.textContent = `AZ ${String(az).padStart(3, '0')}  EL ${v.gunPitch >= 0 ? '+' : ''}${((v.gunPitch * 180) / Math.PI).toFixed(1)}°`;
    const t = v.target;
    this.sightBR.textContent = t && t.alive ? `RNG ${Math.round(v.pos.distanceTo(t.pos))} M · ${t.name.toUpperCase()}` : 'RNG ----';
  }

  updatePerf(stats) {
    if (this.perf.hidden) return;
    this.perf.innerHTML = '';
    for (const line of stats) this.perf.append(el('div', '', line));
  }

  showEnd(winner) {
    const w = this.world;
    if (this.end) return;
    const card = el('div', 'endcard panel pe');
    const f = FACTION_INFO[winner];
    const h = el('h2', '', `${f.name} victory`);
    h.style.color = f.color;
    const table = el('table');
    const rows = [
      ['', FACTION_INFO[0].short, FACTION_INFO[1].short],
      ['Infantry lost', w.factions[0].losses.inf, w.factions[1].losses.inf],
      ['Vehicles lost', w.factions[0].losses.veh, w.factions[1].losses.veh],
      ['Aircraft lost', w.factions[0].losses.air, w.factions[1].losses.air],
      ['Kills', w.factions[0].kills, w.factions[1].kills],
      ['Tickets left', Math.round(w.factions[0].tickets), Math.round(w.factions[1].tickets)],
    ];
    rows.forEach((r, i) => {
      const tr = el('tr');
      r.forEach((c) => tr.append(el(i === 0 ? 'th' : 'td', '', String(c))));
      table.append(tr);
    });
    const btns = el('div', 'btns');
    const keep = el('button', 'btn', 'Keep watching');
    keep.type = 'button';
    keep.addEventListener('click', () => card.remove());
    const again = el('button', 'btn', 'New battle');
    again.type = 'button';
    again.addEventListener('click', () => this.app.newBattle());
    btns.append(keep, again);
    card.append(el('div', 'label', `Battle time ${fmtClock(w.time)}`), h, table, btns);
    this.root.append(card);
    this.end = card;
  }

  update(dt, camera, width, height) {
    this.t -= dt;
    this.miniT -= dt;
    if (this.world.over && !this.end) this.showEnd(this.world.winner);
    const m = this.app.camera.mode;
    this.modeEl.textContent = MODE_NAMES[m] || m;
    const app = this.app;
    this.speedEl.textContent = app.paused ? 'PAUSED' : `TIME ×${app.timeScale}${m === 'free' ? ` · CAM ${app.camera.speed} m/s` : ''}`;
    if (this.t <= 0) {
      this.t = 0.25;
      this.updateScore();
      this.updateCard();
      const now = performance.now();
      for (const f of this.feedItems) if (now - f.t > 9000) f.row.style.opacity = '0.45';
    }
    if (this.miniT <= 0) {
      this.miniT = 0.33;
      this.drawMini();
    }
    this.updateLabels(camera, width, height);
    this.updateOSD();
    this.updateSight();
  }
}

// Loading overlay.
export class Loading {
  constructor(root) {
    this.node = el('div');
    this.node.id = 'loading';
    const box = el('div', 'box panel');
    this.title = el('div', 'label', 'Preparing the battlefield');
    const bar = el('div', 'bar');
    this.fill = el('i');
    bar.append(this.fill);
    this.step = el('div', 'step', '');
    box.append(this.title, bar, this.step);
    this.node.append(box);
    this.node.hidden = true;
    root.append(this.node);
  }

  set(p, text) {
    this.node.hidden = false;
    this.fill.style.width = `${Math.round(p * 100)}%`;
    this.step.textContent = text;
  }

  hide() {
    this.node.hidden = true;
  }
}
