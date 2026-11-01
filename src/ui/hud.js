// In-game HUD (DOM overlay): ID card with health/stamina, clock card, interaction prompt,
// world-anchored nameplates and speech, counter prompts and toasts.
import { BABYLON } from '../render/babylon.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = el('div', 'hud');
    root.appendChild(this.root);
    this.card = el('div', 'idcard');
    this.card.innerHTML = `<div class="idc-top"><div class="idc-photo"></div><div class="idc-text"><div class="idc-name"></div><div class="idc-num"></div></div></div>
      <div class="bar hp"><span></span><i></i></div><div class="bar st"><span></span><i></i></div>
      <div class="idc-row"><span class="ramen"></span><span class="held"></span></div>`;
    this.root.appendChild(this.card);
    this.clockCard = el('div', 'clockcard', `<div class="cc-time"></div><div class="cc-period"></div><div class="cc-day"></div>`);
    this.root.appendChild(this.clockCard);
    this.needs = el('div', 'needs', `<div class="need food"><b>FOOD</b><span></span></div><div class="need energy"><b>ENERGY</b><span></span></div>`);
    this.root.appendChild(this.needs);
    this.prompt = el('div', 'prompt');
    this.root.appendChild(this.prompt);
    this.labels = el('div', 'labels');
    this.root.appendChild(this.labels);
    this.toasts = el('div', 'toasts');
    this.root.appendChild(this.toasts);
    this.banner = el('div', 'banner');
    this.root.appendChild(this.banner);
    this.pockets = el('div', 'pockets');
    this.root.appendChild(this.pockets);
    this.vignette = el('div', 'hurtvig');
    this.root.appendChild(this.vignette);
    this.plates = new Map();
    this._v = new BABYLON.Vector3();
    this.toastList = [];
    this.lastHp = null;
  }
  setVisible(v) { this.root.style.display = v ? '' : 'none'; }
  toast(text, kind = 'info', dur = 3.2) {
    const t = el('div', `toast ${kind}`, text);
    this.toasts.appendChild(t);
    const item = { el: t, until: this.game.time + dur };
    this.toastList.push(item);
    while (this.toastList.length > 5) { const o = this.toastList.shift(); o.el.remove(); }
  }
  announce(title, sub, dur = 4) {
    this.banner.innerHTML = `<div class="b-title">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    this.banner.classList.add('show');
    this.bannerUntil = this.game.time + dur;
  }
  _project(x, y, z) {
    const g = this.game;
    const eng = g.engine, cam = g.cameraRig.camera;
    this._v.set(x, y, z);
    const p = BABYLON.Vector3.Project(this._v, BABYLON.Matrix.IdentityReadOnly, g.scene.getTransformMatrix(), cam.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
    const scale = eng.getHardwareScalingLevel();
    return { x: p.x * scale, y: p.y * scale, behind: p.z > 1 || p.z < 0 };
  }
  update(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    const hpK = p.hp / p.maxHp, stK = p.stamina / 100;
    this.card.querySelector('.idc-name').textContent = p.name;
    this.card.querySelector('.idc-num').textContent = p.app.idNumber;
    this.card.querySelector('.hp span').style.width = `${Math.max(0, hpK) * 100}%`;
    this.card.querySelector('.st span').style.width = `${Math.max(0, stK) * 100}%`;
    this.card.querySelector('.hp i').textContent = `${Math.ceil(p.hp)}`;
    this.card.querySelector('.st i').textContent = p.stamina < 12 ? 'WINDED' : '';
    this.card.querySelector('.ramen').innerHTML = `<b>${p.ramen}</b> ramen`;
    this.card.querySelector('.held').textContent = p.held ? p.held.def.name : 'Empty hands';
    if (this.lastHp != null && p.hp < this.lastHp - 0.5) this.card.classList.add('hit'), setTimeout(() => this.card.classList.remove('hit'), 180);
    this.lastHp = p.hp;
    this.vignette.style.opacity = String(Math.max(0, 0.75 - hpK * 1.6));
    const clk = g.sim.clock, per = clk.period;
    this.clockCard.querySelector('.cc-time').textContent = clk.hhmm;
    this.clockCard.querySelector('.cc-period').textContent = per.name;
    this.clockCard.querySelector('.cc-day').textContent = g.sentence ? `Day ${clk.day} · ${Math.max(0, g.sentence.daysLeft)} days left` : `Day ${clk.day}`;
    this.needs.querySelector('.food span').style.width = `${p.hunger}%`;
    this.needs.querySelector('.energy span').style.width = `${p.energy}%`;
    this.needs.querySelector('.food').classList.toggle('low', p.hunger < 20);
    this.needs.querySelector('.energy').classList.toggle('low', p.energy < 15);
    this.pockets.innerHTML = p.pockets.map((it, i) => `<div class="pk"><b>${i + 1}</b>${it.def.name}</div>`).join('');
    // Interaction prompt near the target
    const pr = g.controller.promptText();
    const inConv = g.dialogue && g.dialogue.active;
    if (pr && !inConv && p.state !== 'ko' && !g.menuOpen) {
      const t = pr.cand;
      const y = t.kind === 'talk' ? t.ref.y + t.ref.dims.H * 1.98 : t.kind === 'item' ? t.ref.y + 0.35 : (t.ref.y || 0) + 1.2;
      const s = this._project(t.x, y, t.z);
      this.prompt.style.display = s.behind ? 'none' : '';
      this.prompt.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      this.prompt.innerHTML = `<kbd>${g.input.lastDevice === 'gamepad' ? 'A' : 'E'}</kbd><span>${pr.verb}</span>${pr.more ? `<em><kbd>Tab</kbd> +${pr.more}</em>` : ''}`;
    } else this.prompt.style.display = 'none';
    // Nameplates / speech / counter flags for nearby characters
    const seen = new Set();
    for (const c of g.characters) {
      if (c === p || !c.rig) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const speaking = c.speech && g.time < c.speech.until;
      const fighting = c.combatTarget === p && c.combatTimer > 0;
      const counter = p.counterWindow > 0 && p.incoming && p.incoming.att === c;
      const targeted = p.combatTarget === c && (p.combatTimer > 0 || p.lockTarget === c);
      const isTalkTarget = pr && pr.cand.ref === c;
      if (!(d < 9 && (speaking || fighting || counter || targeted || isTalkTarget || d < 4.5))) continue;
      const s = this._project(c.x, c.y + c.dims.H * 2.08 + (c.isDown ? -1.3 : 0), c.z);
      if (s.behind) continue;
      seen.add(c.id);
      let pl = this.plates.get(c.id);
      if (!pl) { pl = el('div', 'plate'); this.labels.appendChild(pl); this.plates.set(c.id, pl); }
      const rel = g.social ? g.social.opinionOf(c, p) : 0;
      const hostile = fighting || (c.isGuard && g.rules && g.rules.isWanted?.(p));
      pl.className = `plate${hostile ? ' hostile' : ''}${targeted ? ' targeted' : ''}`;
      const hp = c.combatTimer > 0 || targeted ? `<div class="pbar"><span style="width:${Math.max(0, c.hp / c.maxHp) * 100}%"></span></div>` : '';
      const speech = speaking ? `<div class="speech ${c.speech.mood}">${c.speech.text}</div>` : '';
      const flag = counter ? '<div class="counterflag">⚡ <kbd>Q</kbd></div>' : '';
      const crew = c.def.crew && g.crews ? `<i style="background:${g.crews[c.def.crew]?.color || '#888'}"></i>` : '';
      const mood = rel > 40 ? '☺' : rel < -40 ? '☹' : '';
      pl.innerHTML = `${speech}${flag}<div class="pname">${crew}${c.short}${mood ? ` <u>${mood}</u>` : ''}</div>${hp}`;
      pl.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      pl.style.opacity = String(Math.min(1, Math.max(0.25, 1.4 - d / 7)));
    }
    for (const [id, pl] of this.plates) if (!seen.has(id)) { pl.remove(); this.plates.delete(id); }
    // Toasts
    const now = g.time;
    this.toastList = this.toastList.filter((t) => { if (now > t.until) { t.el.classList.add('out'); setTimeout(() => t.el.remove(), 400); return false; } return true; });
    if (this.bannerUntil && now > this.bannerUntil) { this.banner.classList.remove('show'); this.bannerUntil = 0; }
  }
}
