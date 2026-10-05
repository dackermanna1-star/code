// The "Desert Strike" heads-up display and buy menu, drawn over the classic
// ROBLOX game window (the place's own GUI, like later user-made shooters).
import { GUNS, ATTACHMENTS } from './guns.js';

const CSS = `
.ds-hud{position:absolute;inset:0;pointer-events:none;font-family:Arial,Helvetica,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);z-index:5;}
.ds-hud .cross{position:absolute;left:50%;top:50%;width:0;height:0;}
.ds-hud .cross i{position:absolute;background:rgba(255,255,255,.9);box-shadow:0 0 1px #000;}
.ds-hud .cross i.l,.ds-hud .cross i.r{height:2px;width:9px;top:-1px;}
.ds-hud .cross i.t,.ds-hud .cross i.b{width:2px;height:9px;left:-1px;}
.ds-hud .cross i.dot{width:2px;height:2px;left:-1px;top:-1px;}
.ds-hud .hit{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;}
.ds-hud .hit:before,.ds-hud .hit:after{content:'';position:absolute;left:12px;top:-2px;width:2px;height:30px;background:#fff;transform:rotate(45deg);}
.ds-hud .hit:after{transform:rotate(-45deg);}
.ds-hud .hit.head:before,.ds-hud .hit.head:after{background:#ff3030;}
.ds-hud .ammo{position:absolute;right:24px;bottom:58px;text-align:right;}
.ds-hud .ammo .gun{font-size:14px;letter-spacing:1px;opacity:.85;text-transform:uppercase;}
.ds-hud .ammo .n{font-size:40px;font-weight:bold;line-height:1;}
.ds-hud .ammo .n small{font-size:20px;opacity:.7;font-weight:normal;}
.ds-hud .ammo .hint{font-size:13px;color:#ffd060;height:16px;}
.ds-hud .hp{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);width:260px;text-align:center;}
.ds-hud .hp .bar{height:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.4);margin-top:3px;}
.ds-hud .hp .bar div{height:100%;background:linear-gradient(#9ee36a,#5aa63a);width:100%;transition:width .15s;}
.ds-hud .hp .num{font-size:22px;font-weight:bold;}
.ds-hud .cash{position:absolute;right:24px;bottom:150px;font-size:22px;font-weight:bold;color:#8cf28c;}
.ds-hud .cash .pop{position:absolute;right:0;top:-24px;font-size:16px;color:#ffe060;animation:dsPop 1.4s forwards;}
@keyframes dsPop{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-30px)}}
.ds-hud .score{position:absolute;left:50%;top:26px;transform:translateX(-50%);display:flex;gap:0;font-weight:bold;font-size:18px;}
.ds-hud .score div{padding:4px 12px;background:rgba(0,0,0,.45);}
.ds-hud .score .a{color:#7fb6ff;} .ds-hud .score .b{color:#ff8a6a;} .ds-hud .score .t{color:#fff;font-size:16px;}
.ds-hud .feed{position:absolute;right:16px;top:330px;width:360px;text-align:right;font-size:13px;}
.ds-hud .feed div{background:rgba(0,0,0,.45);display:inline-block;margin:2px 0;padding:3px 8px;}
.ds-hud .feed .ka{color:#7fb6ff;} .ds-hud .feed .kb{color:#ff8a6a;} .ds-hud .feed .w{color:#ddd;margin:0 6px;} .ds-hud .feed .hs{color:#ff4040;}
.ds-hud .vig{position:absolute;inset:0;box-shadow:inset 0 0 160px 60px rgba(150,0,0,.0);transition:box-shadow .2s;}
.ds-hud .dir{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px;opacity:0;}
.ds-hud .dir:before{content:'';position:absolute;left:96px;top:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:26px solid rgba(220,20,20,.85);}
.ds-hud .dead{position:absolute;left:0;right:0;top:34%;text-align:center;display:none;}
.ds-hud .dead .k{font-size:28px;font-weight:bold;} .ds-hud .dead .k b{color:#ff8a6a;} .ds-hud .dead .s{font-size:16px;margin-top:8px;opacity:.9;}
.ds-hud .msg{position:absolute;left:0;right:0;top:22%;text-align:center;font-size:40px;font-weight:bold;display:none;letter-spacing:2px;}
.ds-hud .scope{position:absolute;inset:0;display:none;}
.ds-hud .scope canvas{width:100%;height:100%;}
.ds-hud .help{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);font-size:14px;background:rgba(0,0,0,.5);padding:6px 12px;}
.ds-buy{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:860px;max-width:96vw;max-height:88vh;overflow:auto;background:rgba(20,22,24,.94);border:1px solid #6a6a60;color:#eee;font:13px Arial,sans-serif;z-index:40;display:none;pointer-events:auto;box-shadow:0 8px 40px rgba(0,0,0,.6);}
.ds-buy h2{margin:0;padding:12px 16px;background:#3a3a30;font-size:18px;letter-spacing:1px;display:flex;justify-content:space-between;}
.ds-buy h2 span{color:#8cf28c;}
.ds-buy .cols{display:flex;gap:12px;padding:12px;}
.ds-buy .list{width:300px;}
.ds-buy .item{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:4px;background:#2c2e30;cursor:pointer;border:1px solid transparent;}
.ds-buy .item:hover{border-color:#8a8a70;} .ds-buy .item.sel{border-color:#d8c070;background:#36382e;}
.ds-buy .item .p{color:#8cf28c;} .ds-buy .item .p.no{color:#c07060;} .ds-buy .item .eq{color:#d8c070;font-weight:bold;}
.ds-buy .sec{color:#aaa;margin:10px 0 4px;text-transform:uppercase;font-size:11px;letter-spacing:1px;}
.ds-buy .detail{flex:1;}
.ds-buy .detail canvas{width:100%;height:190px;background:linear-gradient(#4a4a40,#2a2a26);display:block;}
.ds-buy .stat{display:flex;align-items:center;margin:5px 0;} .ds-buy .stat span{width:90px;color:#bbb;} .ds-buy .stat div{flex:1;height:8px;background:#3a3a3a;} .ds-buy .stat div i{display:block;height:100%;background:#d8c070;}
.ds-buy button{background:#5a6a3a;color:#fff;border:1px solid #8a9a6a;padding:7px 16px;font:bold 13px Arial;cursor:pointer;margin:6px 6px 0 0;}
.ds-buy button:disabled{background:#444;border-color:#555;color:#888;cursor:default;}
.ds-buy .att{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#2c2e30;margin:3px 0;}
.ds-buy .att small{color:#999;display:block;}
.ds-buy .foot{padding:8px 16px 14px;color:#999;}
.rbx-gui.ds-mode .rbx-health,.rbx-gui.ds-mode .rbx-camctrl,.rbx-gui.ds-mode .rbx-fp-tip,.rbx-gui.ds-mode .rbx-report{display:none!important;}
`;

export class Hud {
  constructor(root, game) {
    this.game = game;
    if (!document.getElementById('ds-css')) { const st = document.createElement('style'); st.id = 'ds-css'; st.textContent = CSS; document.head.appendChild(st); }
    root.classList.add('ds-mode');
    const el = document.createElement('div');
    el.className = 'ds-hud';
    el.innerHTML = `
      <div class="vig"></div><div class="dir"></div>
      <div class="scope"><canvas></canvas></div>
      <div class="cross"><i class="l"></i><i class="r"></i><i class="t"></i><i class="b"></i><i class="dot"></i></div>
      <div class="hit"></div>
      <div class="score"><div class="a">COALITION <span>0</span></div><div class="t">10:00</div><div class="b"><span>0</span> MILITIA</div></div>
      <div class="feed"></div>
      <div class="hp"><div class="num">100</div><div class="bar"><div></div></div></div>
      <div class="cash">$0</div>
      <div class="ammo"><div class="hint"></div><div class="gun"></div><div class="n">0 <small>/ 0</small></div></div>
      <div class="dead"><div class="k"></div><div class="s"></div></div>
      <div class="msg"></div>
      <div class="help">Click the game to use the mouse &middot; Click: fire &middot; <b>E: aim down sights</b> &middot; R: reload &middot; Shift: sprint &middot; 1/2: switch guns &middot; <b>B: buy menu</b></div>`;
    root.appendChild(el);
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.cross = q('.cross'); this.hit = q('.hit'); this.ammoN = q('.ammo .n'); this.gunName = q('.ammo .gun'); this.hint = q('.ammo .hint');
    this.hpNum = q('.hp .num'); this.hpBar = q('.hp .bar div'); this.cashEl = q('.cash'); this.feed = q('.feed');
    this.scoreA = q('.score .a span'); this.scoreB = q('.score .b span'); this.clock = q('.score .t');
    this.vig = q('.vig'); this.dir = q('.dir'); this.dead = q('.dead'); this.msg = q('.msg'); this.scope = q('.scope'); this.help = q('.help');
    this.scopeCanvas = q('.scope canvas');
    this.hitT = 0; this.dmgT = 0; this.dirT = 0;
    setTimeout(() => { this.help.style.display = 'none'; }, 14000);
  }

  setCrosshair(gapPx, visible) {
    this.cross.style.display = visible ? 'block' : 'none';
    const g = Math.round(gapPx);
    const [l, r, t, b] = this.cross.children;
    l.style.left = (-g - 9) + 'px'; r.style.left = g + 'px'; t.style.top = (-g - 9) + 'px'; b.style.top = g + 'px';
  }
  hitmarker(head) { this.hit.classList.toggle('head', !!head); this.hitT = head ? 0.35 : 0.2; }
  setAmmo(name, mag, reserve, hint = '') {
    this.gunName.textContent = name;
    this.ammoN.innerHTML = `${mag} <small>/ ${reserve}</small>`;
    this.ammoN.style.color = mag === 0 ? '#ff5050' : '#fff';
    this.hint.textContent = hint;
  }
  setHealth(h) { const v = Math.max(0, Math.ceil(h)); this.hpNum.textContent = v; this.hpBar.style.width = v + '%'; this.hpBar.style.background = v < 30 ? '#e04030' : ''; }
  setCash(c, gained) {
    this.cashEl.innerHTML = '$' + c.toLocaleString();
    if (gained) { const p = document.createElement('div'); p.className = 'pop'; p.textContent = '+$' + gained; this.cashEl.appendChild(p); setTimeout(() => p.remove(), 1400); }
  }
  setScore(a, b, secs) { this.scoreA.textContent = a; this.scoreB.textContent = b; const s = Math.max(0, Math.ceil(secs)); this.clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  kill(killer, victim, weapon, head, killerTeam, victimTeam) {
    const d = document.createElement('div');
    const cls = (t) => (t === 'Coalition' ? 'ka' : 'kb');
    d.innerHTML = `<span class="${cls(killerTeam)}">${esc(killer)}</span><span class="w">[${esc(weapon)}]${head ? ' <span class="hs">&#9673;</span>' : ''}</span><span class="${cls(victimTeam)}">${esc(victim)}</span>`;
    const wrap = document.createElement('div'); wrap.style.background = 'none'; wrap.style.display = 'block'; wrap.appendChild(d);
    this.feed.prepend(wrap);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => wrap.remove(), 7000);
  }
  damage(amount, angle) {
    this.dmgT = Math.min(1, this.dmgT + amount / 60);
    if (angle != null) { this.dir.style.transform = `rotate(${angle}rad)`; this.dirT = 1.2; }
  }
  showDeath(text, sub) { this.dead.style.display = text ? 'block' : 'none'; this.dead.firstChild.innerHTML = text || ''; this.dead.lastChild.textContent = sub || ''; }
  showMessage(text) { this.msg.style.display = text ? 'block' : 'none'; this.msg.textContent = text || ''; }
  setScope(kind) {
    if (this._scope === kind) return;
    this._scope = kind;
    this.scope.style.display = kind ? 'block' : 'none';
    if (!kind) return;
    const c = this.scopeCanvas; const w = c.width = innerWidth, h = c.height = innerHeight;
    const x = c.getContext('2d');
    const r = Math.min(w, h) * 0.46;
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(w / 2, h / 2, r, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'source-over';
    const g = x.createRadialGradient(w / 2, h / 2, r * 0.82, w / 2, h / 2, r); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, h / 2, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#000'; x.fillStyle = '#000';
    if (kind === 'sniper') {
      x.lineWidth = 1.5; x.beginPath(); x.moveTo(w / 2 - r, h / 2); x.lineTo(w / 2 + r, h / 2); x.moveTo(w / 2, h / 2 - r); x.lineTo(w / 2, h / 2 + r); x.stroke();
      x.lineWidth = 6; x.beginPath(); x.moveTo(w / 2 - r, h / 2); x.lineTo(w / 2 - r * 0.25, h / 2); x.moveTo(w / 2 + r * 0.25, h / 2); x.lineTo(w / 2 + r, h / 2); x.moveTo(w / 2, h / 2 + r * 0.25); x.lineTo(w / 2, h / 2 + r); x.stroke();
      for (let i = 1; i <= 4; i++) for (const s of [-1, 1]) { x.beginPath(); x.arc(w / 2 + s * i * r * 0.05, h / 2, 2, 0, 7); x.fill(); x.beginPath(); x.arc(w / 2, h / 2 + s * i * r * 0.05, 2, 0, 7); x.fill(); }
    } else {
      // ACOG chevron reticle with the bullet-drop ladder
      x.strokeStyle = '#ff3a20'; x.fillStyle = '#ff3a20'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(w / 2 - 12, h / 2 + 12); x.lineTo(w / 2, h / 2); x.lineTo(w / 2 + 12, h / 2 + 12); x.stroke();
      x.strokeStyle = '#111'; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2, h / 2 + 14); x.lineTo(w / 2, h / 2 + r * 0.5); x.stroke();
      for (let i = 1; i <= 5; i++) { x.beginPath(); x.moveTo(w / 2 - 10 + i, h / 2 + 14 + i * r * 0.07); x.lineTo(w / 2 + 10 - i, h / 2 + 14 + i * r * 0.07); x.stroke(); }
    }
  }
  update(dt) {
    this.hitT -= dt; this.hit.style.opacity = this.hitT > 0 ? 1 : 0;
    this.dmgT = Math.max(0, this.dmgT - dt * 0.6);
    this.vig.style.boxShadow = `inset 0 0 ${120 + this.dmgT * 120}px ${30 + this.dmgT * 80}px rgba(140,0,0,${(this.dmgT * 0.75).toFixed(2)})`;
    this.dirT -= dt; this.dir.style.opacity = Math.max(0, Math.min(1, this.dirT));
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The buy menu. profile = { cash, guns:[ids], att:{gun:[ids]}, equipped:{primary,secondary}, on:{gun:[ids]} } */
export class BuyMenu {
  constructor(root, profile, { onChange, preview }) {
    this.profile = profile; this.onChange = onChange; this.preview = preview;
    const el = document.createElement('div'); el.className = 'ds-buy';
    root.appendChild(el);
    this.el = el;
    this.sel = profile.equipped.primary || 'glock';
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => this.click(e));
  }
  get open() { return this.el.style.display === 'block'; }
  toggle(force) {
    const on = force ?? !this.open;
    this.el.style.display = on ? 'block' : 'none';
    if (on) { document.exitPointerLock?.(); this.render(); }
  }
  click(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const P = this.profile, id = t.dataset.id;
    switch (t.dataset.act) {
      case 'sel': this.sel = id; break;
      case 'buy': if (P.cash >= GUNS[id].price && !P.guns.includes(id)) { P.cash -= GUNS[id].price; P.guns.push(id); P.equipped[GUNS[id].slot] = id; } break;
      case 'equip': P.equipped[GUNS[id].slot] = id; break;
      case 'buyatt': {
        const a = ATTACHMENTS[id], g = this.sel;
        const own = (P.att[g] ||= []);
        if (P.cash >= a.price && !own.includes(id)) { P.cash -= a.price; own.push(id); this.setAttachment(g, id, true); }
        break;
      }
      case 'toggleatt': { const on = (this.profile.on[this.sel] || []).includes(id); this.setAttachment(this.sel, id, !on); break; }
      case 'close': this.toggle(false); return;
    }
    this.onChange?.();
    this.render();
  }
  setAttachment(g, id, on) {
    const P = this.profile;
    let list = (P.on[g] ||= []);
    const type = ATTACHMENTS[id].type;
    list = list.filter((x) => x !== id && ATTACHMENTS[x].type !== type);
    if (on) list.push(id);
    P.on[g] = list;
  }
  render() {
    const P = this.profile, G = GUNS, sel = G[this.sel];
    const row = (id) => {
      const g = G[id], owned = P.guns.includes(id), eq = P.equipped[g.slot] === id;
      return `<div class="item${this.sel === id ? ' sel' : ''}" data-act="sel" data-id="${id}"><span>${esc(g.name)}</span>${eq ? '<span class="eq">EQUIPPED</span>' : owned ? '<span>owned</span>' : `<span class="p${P.cash < g.price ? ' no' : ''}">$${g.price.toLocaleString()}</span>`}</div>`;
    };
    const ids = Object.keys(G).sort((a, b) => G[a].price - G[b].price);
    const bar = (label, v) => `<div class="stat"><span>${label}</span><div><i style="width:${Math.round(Math.max(0.03, Math.min(1, v)) * 100)}%"></i></div></div>`;
    const owned = P.guns.includes(this.sel);
    const atts = sel.attach.map((a) => {
      const A = ATTACHMENTS[a], have = (P.att[this.sel] || []).includes(a), on = (P.on[this.sel] || []).includes(a);
      if (this.sel === 'ak47' && ['reddot', 'holo', 'acog'].includes(a)) return '';
      return `<div class="att"><div>${esc(A.name)}<small>${esc(A.desc)}</small></div>${have ? `<button data-act="toggleatt" data-id="${a}">${on ? 'Remove' : 'Attach'}</button>` : `<button data-act="buyatt" data-id="${a}" ${!owned || P.cash < A.price ? 'disabled' : ''}>Buy $${A.price}</button>`}</div>`;
    }).join('');
    this.el.innerHTML = `
      <h2>ARMORY <span>$${P.cash.toLocaleString()}</span></h2>
      <div class="cols">
        <div class="list"><div class="sec">Primary</div>${ids.filter((i) => G[i].slot === 'primary').map(row).join('')}<div class="sec">Secondary</div>${ids.filter((i) => G[i].slot === 'secondary').map(row).join('')}</div>
        <div class="detail">
          <canvas width="520" height="190"></canvas>
          <h3 style="margin:8px 0 4px">${esc(sel.name)}</h3>
          ${bar('Damage', (sel.damage * (sel.pellets || 1)) / 110)}${bar('Fire rate', sel.rpm / 850)}${bar('Accuracy', 1 - sel.spread[0] / 9)}${bar('Range', sel.range / 900)}${bar('Mobility', (sel.move - 0.75) / 0.25)}${bar('Magazine', sel.mag / 100)}
          ${owned ? (P.equipped[sel.slot] === this.sel ? '<button disabled>Equipped</button>' : `<button data-act="equip" data-id="${this.sel}">Equip</button>`) : `<button data-act="buy" data-id="${this.sel}" ${P.cash < sel.price ? 'disabled' : ''}>Buy $${sel.price.toLocaleString()}</button>`}
          <div class="sec">Attachments</div>${atts || '<div class="att">None for this weapon.</div>'}
        </div>
      </div>
      <div class="foot">Earn $100 per kill, +$50 for a headshot, $500 for winning a round. Changes apply when you respawn (or right away at your base). <button data-act="close">Close (B)</button></div>`;
    this.preview?.(this.el.querySelector('canvas'), this.sel, P.on[this.sel] || []);
  }
}
