/**
 * Survival HUD (DOM overlay): crosshair that opens with the spread, hit markers, damage direction
 * arcs, health and stamina, ammunition, wave / score / kill feed, the boss bar, centre messages,
 * and the start, pause and game-over screens.
 */
const CSS = `
.sv { position: fixed; inset: 0; pointer-events: none; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: #e9ecef; user-select: none; z-index: 20; }
.sv.hidden { display: none; }
.sv .xh { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.sv .xh i { position: absolute; background: rgba(255,255,255,0.9); box-shadow: 0 0 2px rgba(0,0,0,0.9); }
.sv .xh i.t, .sv .xh i.b { width: 2px; height: 9px; left: -1px; }
.sv .xh i.l, .sv .xh i.r { height: 2px; width: 9px; top: -1px; }
.sv .xh .dot { position: absolute; width: 2px; height: 2px; left: -1px; top: -1px; background: rgba(255,255,255,0.8); }
.sv .hm { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; opacity: 0; transition: opacity 0.05s; }
.sv .hm::before, .sv .hm::after { content: ''; position: absolute; left: 12px; top: -1px; width: 2px; height: 28px; background: currentColor; }
.sv .hm::before { transform: rotate(45deg); } .sv .hm::after { transform: rotate(-45deg); }
.sv .hm { color: #fff; -webkit-mask: radial-gradient(circle, transparent 5px, #000 6px); mask: radial-gradient(circle, transparent 5px, #000 6px); }
.sv .hurt { position: absolute; left: 50%; top: 50%; width: 240px; height: 240px; margin: -120px 0 0 -120px; }
.sv .hurt i { position: absolute; left: 50%; top: 0; width: 70px; height: 120px; margin-left: -35px; transform-origin: 35px 120px;
  background: radial-gradient(ellipse at 50% 0%, rgba(220,20,20,0.85), rgba(220,20,20,0) 65%); opacity: 0; }
.sv .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(120,0,0,0.75) 100%); opacity: 0; }
.sv .flash { position: absolute; inset: 0; background: rgba(160,0,0,0.25); opacity: 0; }
.sv .bl { position: absolute; left: 28px; bottom: 26px; width: 260px; }
.sv .bar { height: 10px; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.18); border-radius: 2px; overflow: hidden; }
.sv .bar > b { display: block; height: 100%; background: linear-gradient(90deg, #d33, #f55); transition: width 0.15s; }
.sv .bar.st { height: 4px; margin-top: 4px; } .sv .bar.st > b { background: #cfd8dc; transition: none; }
.sv .lbl { font-size: 11px; letter-spacing: 2px; opacity: 0.75; margin-bottom: 4px; display: flex; justify-content: space-between; }
.sv .br { position: absolute; right: 30px; bottom: 22px; text-align: right; }
.sv .ammo { font-size: 42px; font-weight: 700; font-variant-numeric: tabular-nums; text-shadow: 0 2px 6px rgba(0,0,0,0.7); }
.sv .ammo small { font-size: 20px; opacity: 0.6; font-weight: 500; }
.sv .gun { font-size: 12px; letter-spacing: 3px; opacity: 0.8; text-transform: uppercase; }
.sv .hint { font-size: 12px; color: #ffcc66; letter-spacing: 1px; height: 16px; }
.sv .slots { margin-top: 6px; display: flex; gap: 6px; justify-content: flex-end; }
.sv .slots span { font-size: 10px; padding: 2px 6px; border: 1px solid rgba(255,255,255,0.25); border-radius: 2px; opacity: 0.5; }
.sv .slots span.on { opacity: 1; border-color: #fff; }
.sv .top { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); text-align: center; }
.sv .wave { font-size: 13px; letter-spacing: 4px; opacity: 0.85; }
.sv .left { font-size: 11px; letter-spacing: 2px; opacity: 0.6; margin-top: 2px; }
.sv .boss { margin-top: 10px; width: 420px; display: none; }
.sv .boss .bar > b { background: linear-gradient(90deg, #7a1fa2, #c04ce0); }
.sv .boss .lbl { justify-content: center; color: #d9a6ff; }
.sv .tr { position: absolute; right: 26px; top: 18px; text-align: right; }
.sv .score { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sv .stats { font-size: 11px; letter-spacing: 1px; opacity: 0.65; }
.sv .feed { margin-top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.sv .feed div { font-size: 12px; background: rgba(0,0,0,0.35); padding: 2px 8px; border-radius: 2px; animation: svfade 3.5s forwards; }
.sv .feed div.hs { color: #ffd166; }
@keyframes svfade { 0% { opacity: 0; transform: translateX(10px); } 6% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; } }
.sv .msg { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); text-align: center; opacity: 0; transition: opacity 0.4s; }
.sv .msg .big { font-size: 46px; font-weight: 800; letter-spacing: 10px; text-shadow: 0 4px 18px rgba(0,0,0,0.8); }
.sv .msg .sub { font-size: 14px; letter-spacing: 4px; opacity: 0.8; margin-top: 6px; }
.sv .msg.boss .big { color: #d9a6ff; }
.sv .screen { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(4,6,9,0.72); pointer-events: auto; backdrop-filter: blur(3px); }
.sv .screen.on { display: flex; }
.sv .card { width: min(560px, 92vw); text-align: center; }
.sv .card h1 { font-size: 40px; letter-spacing: 12px; margin: 0 0 4px; font-weight: 800; }
.sv .card h2 { font-size: 13px; letter-spacing: 5px; opacity: 0.7; margin: 0 0 22px; font-weight: 500; }
.sv .card p { font-size: 13px; line-height: 1.7; opacity: 0.85; }
.sv .keys { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; text-align: left; font-size: 12px; margin: 16px auto 22px; width: max-content; }
.sv .keys b { color: #ffd166; font-weight: 600; }
.sv button { pointer-events: auto; background: #e9ecef; color: #111; border: 0; padding: 10px 22px; margin: 6px; font-weight: 700; letter-spacing: 2px; border-radius: 2px; cursor: pointer; font-size: 13px; }
.sv button.alt { background: transparent; color: #e9ecef; border: 1px solid rgba(255,255,255,0.4); }
.sv .set { display: grid; grid-template-columns: 1fr 160px 48px; gap: 8px 12px; align-items: center; font-size: 12px; text-align: left; margin: 18px auto; width: 380px; }
.sv .set input[type=range] { width: 160px; }
.sv .res { font-size: 15px; line-height: 2; margin: 10px 0 18px; }
.sv .res b { font-size: 20px; }
.sv.dead .vig { opacity: 1 !important; background: radial-gradient(ellipse at center, rgba(60,0,0,0.4) 30%, rgba(40,0,0,0.95) 100%); }
`;

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export class SurvivalHud {
  /** opts.sandbox: the sandbox's first-person mode (no waves or score; its own start screen). */
  constructor(parent = document.body, handlers = {}, opts = {}) {
    this.h = handlers;
    this.sandbox = !!opts.sandbox;
    if (!document.getElementById('sv-css')) {
      const st = document.createElement('style');
      st.id = 'sv-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = (this.root = el('div', 'sv hidden', parent));
    this.vig = el('div', 'vig', root);
    this.flash = el('div', 'flash', root);
    this.xh = el('div', 'xh', root, '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><div class="dot"></div>');
    this.hm = el('div', 'hm', root);
    this.hurtEl = el('div', 'hurt', root);
    this.hurtArcs = [];
    for (let i = 0; i < 6; i++) this.hurtArcs.push(el('i', '', this.hurtEl));
    const bl = el('div', 'bl', root);
    this.hpLbl = el('div', 'lbl', bl, '<span>HEALTH</span><span>100</span>');
    this.hpBar = el('div', 'bar', bl, '<b style="width:100%"></b>');
    this.stBar = el('div', 'bar st', bl, '<b style="width:100%"></b>');
    const br = el('div', 'br', root);
    this.hint = el('div', 'hint', br);
    this.ammo = el('div', 'ammo', br, '15 <small>/ 105</small>');
    this.gun = el('div', 'gun', br, 'Pistol');
    this.slots = el('div', 'slots', br);
    const top = el('div', 'top', root);
    this.waveEl = el('div', 'wave', top, '');
    this.leftEl = el('div', 'left', top, '');
    this.bossEl = el('div', 'boss', top, '<div class="lbl">BRUTE</div><div class="bar"><b style="width:100%"></b></div>');
    if (this.sandbox) top.style.display = 'none';
    // the dummy in the sights (sandbox): name and state
    this.target = el('div', '', root);
    this.target.style.cssText = 'position:absolute;left:50%;top:calc(50% + 34px);transform:translateX(-50%);font-size:11px;letter-spacing:1px;opacity:0.8;text-align:center;text-shadow:0 1px 3px #000;white-space:pre';
    const tr = el('div', 'tr', root);
    if (this.sandbox) tr.style.display = 'none';
    this.scoreEl = el('div', 'score', tr, '0');
    this.statsEl = el('div', 'stats', tr, '');
    this.feed = el('div', 'feed', tr);
    this.msg = el('div', 'msg', root, '<div class="big"></div><div class="sub"></div>');
    this.msgT = 0;
    this.hmT = 0;
    this.flashT = 0;
    // screens
    this.start = el('div', 'screen', root);
    const sc = el('div', 'card', this.start);
    if (this.sandbox) {
      sc.innerHTML = `<h1>FIRST PERSON</h1><h2>SANDBOX — LIVE FIRE</h2>
      <p>Guns, a knife, a bat and your fists against the dummies.<br>Sniper hits on the head or chest go to the kill cam.</p>
      <div class="keys">
        <b>Mouse / touchpad</b><span>look</span><b>Click</b><span>fire / attack (hold: power swing)</span>
        <b>E</b><span>aim down sights · knife: stab</span><b>W A S D · Shift</b><span>move · sprint</span>
        <b>C / Ctrl · Space</b><span>crouch · jump / climb</span><b>R</b><span>reload</span>
        <b>1-6</b><span>pistol, revolver, shotgun, SMG, rifle, sniper</span><b>7 · 8 · 9</b><span>knife · bat · fists</span>
        <b>F</b><span>kick (stomp someone lying in front)</span><b>N</b><span>spawn a dummy in front</span>
        <b>Esc</b><span>pause · settings</span><b>Tab</b><span>back to the orbit view</span>
      </div>`;
    } else sc.innerHTML = `<h1>ASHGROVE</h1><h2>SURVIVAL — THE LAST STATION</h2>
      <p>The trains still run. They bring the dead.<br>Hold the platform as long as you can.</p>
      <div class="keys">
        <b>Mouse / touchpad</b><span>look</span><b>Click</b><span>fire</span>
        <b>E</b><span>aim down sights (toggle)</span><b>W A S D</b><span>move</span>
        <b>Shift</b><span>sprint</span><b>C / Ctrl</b><span>crouch</span>
        <b>Space</b><span>jump / climb a ledge</span><b>R</b><span>reload</span>
        <b>1-4 · Q · wheel</b><span>weapons</span><b>F</b><span>shove</span>
        <b>Esc</b><span>pause</span>
      </div>`;
    const sb = el('div', '', sc);
    el('button', '', sb, 'CLICK TO START').onclick = () => this.h.resume && this.h.resume();
    el('button', 'alt', sb, this.sandbox ? 'ORBIT VIEW' : 'BACK TO SANDBOX').onclick = () => this.h.exit && this.h.exit();
    this.pause = el('div', 'screen', root);
    const pc = el('div', 'card', this.pause);
    pc.innerHTML = '<h1>PAUSED</h1><h2 class="pw"></h2>';
    this.pauseWave = pc.querySelector('.pw');
    const set = el('div', 'set', pc);
    this.sens = this.slider(set, 'Mouse sensitivity', 0.4, 3, 1, 0.05, (v) => this.h.setting && this.h.setting('sensitivity', v));
    this.fov = this.slider(set, 'Field of view', 60, 100, 78, 1, (v) => this.h.setting && this.h.setting('fov', v));
    if (!this.sandbox) this.horde = this.slider(set, 'Horde size (max at once)', 4, 16, 10, 1, (v) => this.h.setting && this.h.setting('maxAlive', v));
    this.vol = this.slider(set, 'Volume', 0, 1, 0.7, 0.05, (v) => this.h.setting && this.h.setting('volume', v));
    const lab = el('label', '', set, 'Hold E to aim (instead of toggle)');
    lab.style.gridColumn = '1 / 3';
    this.holdBox = el('input', '', set);
    this.holdBox.type = 'checkbox';
    this.holdBox.onchange = () => this.h.setting && this.h.setting('adsHold', this.holdBox.checked);
    if (this.sandbox) {
      const lab2 = el('label', '', set, 'RDR reactions (stagger, active hits)');
      lab2.style.gridColumn = '1 / 3';
      this.rdrBox = el('input', '', set);
      this.rdrBox.type = 'checkbox';
      this.rdrBox.onchange = () => this.h.setting && this.h.setting('rdr', this.rdrBox.checked);
      el('span', '', set, 'Kill cam');
      this.camSel = el('select', '', set);
      for (const [v, t] of [['sniper', 'Sniper kill shots'], ['always', 'Every sniper hit'], ['all', 'Any gun, head shots'], ['off', 'Off']]) {
        const o = el('option', '', this.camSel, t);
        o.value = v;
      }
      this.camSel.style.pointerEvents = 'auto';
      this.camSel.onchange = () => this.h.setting && this.h.setting('killcam', this.camSel.value);
    }
    const pb = el('div', '', pc);
    el('button', '', pb, 'RESUME').onclick = () => this.h.resume && this.h.resume();
    if (!this.sandbox) el('button', 'alt', pb, 'RESTART').onclick = () => this.h.restart && this.h.restart();
    el('button', 'alt', pb, this.sandbox ? 'ORBIT VIEW' : 'BACK TO SANDBOX').onclick = () => this.h.exit && this.h.exit();
    this.over = el('div', 'screen', root);
    const oc = el('div', 'card', this.over);
    oc.innerHTML = '<h1 style="color:#ff5b5b">YOU DIED</h1><h2>THE STATION FELL SILENT</h2><div class="res"></div>';
    this.res = oc.querySelector('.res');
    const ob = el('div', '', oc);
    el('button', '', ob, 'PLAY AGAIN').onclick = () => this.h.restart && this.h.restart();
    el('button', 'alt', ob, 'BACK TO SANDBOX').onclick = () => this.h.exit && this.h.exit();
  }

  slider(parent, label, min, max, val, step, cb) {
    el('span', '', parent, label);
    const i = el('input', '', parent);
    i.type = 'range';
    i.min = min;
    i.max = max;
    i.step = step;
    i.value = val;
    const out = el('span', '', parent, String(val));
    i.oninput = () => {
      out.textContent = (+i.value).toFixed(step < 1 ? 2 : 0);
      cb(+i.value);
    };
    return i;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  screen(which) {
    for (const [k, e] of [['start', this.start], ['pause', this.pause], ['over', this.over]]) e.classList.toggle('on', k === which);
  }

  message(big, sub = '', boss = false, dur = 2.6) {
    this.msg.querySelector('.big').textContent = big;
    this.msg.querySelector('.sub').textContent = sub;
    this.msg.classList.toggle('boss', boss);
    this.msg.style.opacity = 1;
    this.msgT = dur;
  }

  hit(kill = false, head = false) {
    this.hm.style.color = kill ? (head ? '#ffd166' : '#ff4040') : '#ffffff';
    this.hm.style.opacity = 1;
    this.hmT = kill ? 0.3 : 0.12;
  }

  hurt() {
    this.flashT = 0.25;
  }

  killFeed(text, head = false) {
    const d = el('div', head ? 'hs' : '', this.feed, text);
    setTimeout(() => d.remove(), 3600);
    while (this.feed.children.length > 6) this.feed.firstChild.remove();
  }

  gameOver(stats) {
    this.res.innerHTML = `Wave <b>${stats.wave}</b> · Kills <b>${stats.kills}</b> · Headshots <b>${stats.headshots}</b><br>
      Accuracy <b>${stats.accuracy}%</b> · Score <b>${stats.score}</b>${stats.best ? `<br><span style="opacity:.7">Best: ${stats.best}</span>` : ''}`;
    this.screen('over');
  }

  /** Per frame. s: { player, arsenal, game, spread (px), yaw } */
  update(dt, s) {
    const pl = s.player, ar = s.arsenal, g = s.game;
    const hp = Math.max(0, pl.health);
    this.hpLbl.lastChild.textContent = Math.ceil(hp);
    this.hpBar.firstChild.style.width = `${(hp / pl.maxHealth) * 100}%`;
    this.stBar.firstChild.style.width = `${pl.stamina * 100}%`;
    this.vig.style.opacity = pl.alive ? Math.max(0, 1 - hp / 45) * 0.9 : 1;
    this.root.classList.toggle('dead', !pl.alive);
    const gun = ar.gun;
    if (gun.melee) {
      // melee: no ammunition - show the wind-up of a power blow instead
      const M = ar.melee;
      const ch = M && M.phase === 'charge' ? M.charge : 0;
      this.ammo.innerHTML = ch > 0 ? `<small>POWER</small> ${Math.round(ch * 100)}%` : '';
      this.ammo.style.color = ch >= 1 ? '#ff6b6b' : '';
      this.hint.textContent = gun.charge ? 'HOLD CLICK — POWER BLOW' : gun.type === 'knife' ? 'CLICK SLASH · E STAB' : '';
    } else {
      this.ammo.innerHTML = this.sandbox ? `${gun.ammo} <small>/ ∞</small>` : `${gun.ammo} <small>/ ${gun.spare}</small>`;
      this.ammo.style.color = gun.ammo === 0 ? '#ff6b6b' : gun.ammo <= gun.mag * 0.25 ? '#ffd166' : '';
      this.hint.textContent = ar.state === 'reload' ? 'RELOADING' : gun.ammo === 0 && gun.spare === 0 ? 'NO AMMO' : gun.ammo <= gun.mag * 0.25 ? 'R — RELOAD' : '';
    }
    this.gun.textContent = gun.w.label;
    const slots = ar.guns.map((x, i) => `<span class="${i === ar.index ? 'on' : ''}">${i + 1} ${x.w.label.split(' ').pop().toUpperCase()}</span>`).join('');
    if (slots !== this._slots) {
      this.slots.innerHTML = slots;
      this._slots = slots;
    }
    // crosshair: opens with the spread, gone when aimed
    const gap = s.spread;
    const xs = this.xh.children;
    xs[0].style.top = `${-gap - 9}px`;
    xs[1].style.top = `${gap}px`;
    xs[2].style.left = `${-gap - 9}px`;
    xs[3].style.left = `${gap}px`;
    this.xh.style.opacity = ar.adsAmount > 0.6 || pl.sprinting ? 0 : 1;
    if (!g) {
      this.hpLbl.style.display = this.hpBar.style.display = this.stBar.style.display = s.showHealth ? '' : 'none';
      this.tickTimers(dt, pl);
      return;
    }
    // wave panel
    if (g.state === 'intro') this.waveEl.textContent = 'GET READY';
    else this.waveEl.textContent = `WAVE ${g.wave}${g.spec && g.spec.boss ? ' · BOSS' : ''}`;
    this.leftEl.textContent = g.state === 'wave' ? `${g.waveLeft} REMAINING` : g.state === 'break' ? `NEXT WAVE IN ${Math.max(0, Math.ceil(g.opts.breakTime - g.stateT))}` : '';
    this.scoreEl.textContent = g.score.toLocaleString();
    this.statsEl.textContent = `${g.kills} KILLS · ${g.headshots} HEADSHOTS`;
    const boss = g.boss();
    this.bossEl.style.display = boss ? 'block' : 'none';
    if (boss) this.bossEl.querySelector('b').style.width = `${Math.max(0, boss.injury.hp / boss.injury.hpMax) * 100}%`;
    this.tickTimers(dt, pl);
  }

  tickTimers(dt, pl) {
    // damage direction arcs
    for (let i = 0; i < this.hurtArcs.length; i++) {
      const h = pl.hurt[i], a = this.hurtArcs[i];
      if (!h) {
        a.style.opacity = 0;
        continue;
      }
      const rel = h.yaw - pl.yaw;
      a.style.transform = `rotate(${-rel}rad)`;
      a.style.opacity = Math.max(0, 1 - (pl.time - h.t) / 1.4);
    }
    this.hmT -= dt;
    if (this.hmT <= 0) this.hm.style.opacity = 0;
    this.flashT -= dt;
    this.flash.style.opacity = Math.max(0, this.flashT * 4);
    this.msgT -= dt;
    if (this.msgT <= 0) this.msg.style.opacity = 0;
  }
}
