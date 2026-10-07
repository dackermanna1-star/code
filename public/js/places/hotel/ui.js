// Everything drawn over the picture: the title screen and settings, the
// pause menu, the crosshair and "E" prompt, the objective, subtitles, the
// notes you read, the key box's keypad, your stamina, flashlight battery and
// breath, the death screen and the end. (The 2008 game window's own HUD is
// hidden while you're in the hotel.)
import { H } from './state.js';
import { ITEMS } from './items.js';
import { loadSettings, saveSettings } from './player.js';

const CSS = `
.rbx-gui.hh-mode > :not(.hh){display:none!important}
.hh{position:absolute;inset:0;pointer-events:none;z-index:20;font-family:Georgia,'Times New Roman',serif;color:#e8e0d0;user-select:none;-webkit-user-select:none}
.hh *{box-sizing:border-box}
.hh .cross{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:rgba(255,248,230,.55);transition:all .12s}
.hh .cross.on{width:14px;height:14px;margin:-7px 0 0 -7px;background:transparent;border:1.5px solid rgba(255,248,230,.8)}
.hh .prompt{position:absolute;left:50%;top:calc(50% + 26px);transform:translateX(-50%);text-align:center;font-size:15px;text-shadow:0 1px 3px #000,0 0 8px #000;opacity:0;transition:opacity .15s;white-space:nowrap}
.hh .prompt.on{opacity:1}
.hh .key{display:inline-block;min-width:22px;padding:1px 6px;margin-right:7px;border:1.5px solid rgba(255,248,230,.85);border-radius:4px;font:bold 13px Arial,sans-serif;color:#fff;background:rgba(0,0,0,.35)}
.hh .prompt .lbl{color:#f2e8d0}.hh .prompt .verb{color:#c8b890;font-style:italic}
.hh .ring{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;opacity:0}
.hh .ring.on{opacity:1}
.hh .obj{position:absolute;left:28px;top:24px;max-width:46%;font-size:17px;line-height:1.35;text-shadow:0 1px 3px #000,0 0 10px #000;opacity:0;transition:opacity .8s}
.hh .obj small{display:block;font:11px Arial,sans-serif;letter-spacing:3px;color:#a89878;margin-bottom:3px}
.hh .obj.on{opacity:1}
.hh .toast{position:absolute;left:50%;bottom:21%;transform:translateX(-50%);text-align:center;font-size:17px;text-shadow:0 1px 3px #000,0 0 10px #000;opacity:0;transition:opacity .4s;max-width:70%}
.hh .toast small{display:block;font-size:13px;color:#b8ac90;font-style:italic;margin-top:3px}
.hh .toast.on{opacity:1}
.hh .sub{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);text-align:center;font:17px Arial,sans-serif;max-width:72%;}
.hh .sub div{display:inline-block;background:rgba(0,0,0,.55);padding:5px 12px;border-radius:3px;margin-top:4px;transition:opacity .4s}
.hh .sub b{color:#d8b878;font-weight:normal}
.hh .sub i{color:#a8a090}
.hh .hint{position:absolute;left:28px;bottom:28px;font:13px Arial,sans-serif;color:#d8d0c0;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .6s;line-height:1.8}
.hh .hint.on{opacity:.9}
.hh.cine .obj,.hh.cine .hint,.hh.cine .inv,.hh.cine .batt,.hh.cine .bars,.hh.cine .prompt,.hh.cine .cross,.hh.cine .ring{visibility:hidden}
.hh.scr .obj,.hh.scr .hint,.hh.scr .inv,.hh.scr .batt,.hh.scr .bars,.hh.scr .sub,.hh.scr .toast,.hh.scr .prompt,.hh.scr .cross,.hh.scr .ring{visibility:hidden}
.hh .inv{position:absolute;right:26px;bottom:26px;display:flex;gap:8px;opacity:0;transition:opacity .6s}
.hh .inv.on{opacity:1}
.hh .chip{display:flex;align-items:center;gap:6px;background:rgba(10,8,6,.62);border:1px solid rgba(200,170,110,.4);border-radius:4px;padding:4px 9px 4px 6px;font-size:13px}
.hh .chip svg{width:20px;height:20px}
.hh .chip b{font:bold 11px Arial;color:#c8a860}
.hh .bars{position:absolute;left:50%;bottom:4.5%;transform:translateX(-50%);width:170px}
.hh .bar{height:3px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden;opacity:0;transition:opacity .5s;margin-top:4px}
.hh .bar i{display:block;height:100%;background:rgba(230,220,200,.8)}
.hh .bar.on{opacity:1}
.hh .batt{position:absolute;right:26px;top:22px;font:12px Arial,sans-serif;display:flex;align-items:center;gap:7px;opacity:0;transition:opacity .6s;text-shadow:0 1px 2px #000}
.hh .batt.on{opacity:.85}
.hh .batt .cell{width:30px;height:13px;border:1.5px solid #d8d0c0;border-radius:2px;padding:1.5px;position:relative}
.hh .batt .cell:after{content:'';position:absolute;right:-4px;top:3px;width:2px;height:5px;background:#d8d0c0}
.hh .batt .cell i{display:block;height:100%;background:#d8d0c0}
.hh .batt.low .cell i{background:#c03020}
.hh .breath{position:absolute;left:50%;bottom:16%;transform:translateX(-50%);text-align:center;font:13px Arial,sans-serif;opacity:0;transition:opacity .4s}
.hh .breath.on{opacity:1}
.hh .breath .lung{width:220px;height:6px;margin:6px auto 0;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}
.hh .breath .lung i{display:block;height:100%;background:#d8e0f0;transition:background .2s}
.hh .breath.warn .lung i{background:#d04030}
.hh .breath .tell{font:bold 15px Georgia;letter-spacing:4px;color:#e85030;text-shadow:0 0 8px #000;opacity:0}
.hh .breath.check .tell{opacity:1;animation:hhpulse .7s infinite alternate}
@keyframes hhpulse{from{opacity:.35}to{opacity:1}}
.hh .ovl{position:absolute;inset:0;pointer-events:auto;display:none;align-items:center;justify-content:center}
.hh .ovl.on{display:flex}
.hh .note{background:#e4dcc6;color:#2a2418;width:min(560px,86vw);max-height:84vh;overflow:auto;padding:34px 42px 30px;box-shadow:0 10px 60px rgba(0,0,0,.9);transform:rotate(-.6deg);font-size:16px;line-height:1.55;position:relative;background-image:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.25),transparent 60%),radial-gradient(ellipse at 80% 90%,rgba(120,90,40,.18),transparent 55%)}
.hh .note h3{margin:0 0 14px;font:italic 13px Georgia;color:#6a5a40;letter-spacing:1px}
.hh .note p{margin:0 0 10px}
.hh .note .typed{font-family:'Courier New',Courier,monospace;font-size:15px}
.hh .note .hand{font-family:'Segoe Script','Bradley Hand','Brush Script MT',cursive;font-size:18px;color:#1a2240}
.hh .note .child{font-family:'Comic Sans MS','Chalkboard SE',cursive;font-size:17px;color:#3a2a6a;transform:rotate(-.5deg)}
.hh .note .scrawl{font:bold 21px 'Courier New',monospace;color:#3a0808;letter-spacing:1px;transform:rotate(-1deg)}
.hh .note .sig{text-align:right;margin-top:14px}
.hh .note .small{font-size:13px;opacity:.8}
.hh .note .big{font-size:22px;font-weight:bold}
.hh .note .red{color:#8a1010;font-family:'Courier New',monospace;font-size:13px}
.hh .note table.reg{width:100%;border-collapse:collapse;font:13px 'Courier New',monospace;margin:8px 0}
.hh .note table.reg td,.hh .note table.reg th{border-bottom:1px solid rgba(60,40,20,.35);padding:4px 3px;text-align:left}
.hh .note .close{display:block;text-align:center;font:12px Arial;color:#6a5a40;margin-top:16px;letter-spacing:1px}
.hh .keypad{background:linear-gradient(#5a5c60,#3a3c40);border:3px solid #2a2a2a;border-radius:8px;padding:18px;box-shadow:0 10px 60px #000;width:230px}
.hh .keypad .scr{background:#102010;color:#50ff70;font:bold 30px 'Courier New',monospace;text-align:center;letter-spacing:10px;padding:6px 0;border:2px inset #222;margin-bottom:14px;text-shadow:0 0 8px #30c050;height:50px}
.hh .keypad.bad .scr{color:#ff4030;text-shadow:0 0 8px #c03020;animation:hhshake .3s}
@keyframes hhshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.hh .keypad .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.hh .keypad button,.hh .btn{font:bold 18px Arial;padding:10px 0;border-radius:4px;border:1px solid #1a1a1a;background:linear-gradient(#d8d8d8,#9a9a9a);cursor:pointer;color:#1a1a1a}
.hh .keypad button:active{background:#888}
.hh .keypad .lbl{text-align:center;font:11px Arial;color:#ccc;margin-top:10px}
.hh .scrn{background:radial-gradient(ellipse at center,rgba(20,8,6,.92),rgba(0,0,0,.97));flex-direction:column;text-align:center}
.hh .scrn h1{font:normal 64px Georgia;letter-spacing:14px;margin:0;color:#d8c8a8;text-shadow:0 0 30px rgba(200,120,60,.25)}
.hh .scrn h2{font:italic 18px Georgia;margin:6px 0 30px;color:#9a8a6a;letter-spacing:2px}
.hh .scrn .menu{display:flex;flex-direction:column;gap:10px;align-items:center;margin:8px 0 18px}
.hh .scrn .mb{pointer-events:auto;font:18px Georgia;letter-spacing:3px;color:#d8c8a8;background:none;border:1px solid rgba(216,200,168,.35);padding:9px 34px;min-width:250px;cursor:pointer;transition:all .2s}
.hh .scrn .mb:hover{background:rgba(216,200,168,.12);border-color:rgba(216,200,168,.8);color:#fff}
.hh .scrn .mb.dim{opacity:.55}
.hh .scrn .set{display:grid;grid-template-columns:150px 200px 40px;gap:10px 14px;align-items:center;font:13px Arial;color:#b8a888;margin:6px 0 14px;text-align:left}
.hh .scrn .set input[type=range]{width:200px;accent-color:#a08850}
.hh .scrn .set select{width:200px;background:#120e0a;color:#d8c8a0;border:1px solid #5a4a30;font:13px Arial;padding:3px 4px}
.hh .scrn .calib{display:flex;align-items:center;gap:14px;margin:4px 0 10px;font:12px Arial;color:#8a7a5a}
.hh .scrn .ctl{font:12px Arial;color:#8a7a60;line-height:1.9;margin-top:6px}
.hh .scrn .ctl b{color:#c8b888;font-weight:normal;border:1px solid rgba(200,184,136,.4);border-radius:3px;padding:0 5px;margin:0 2px}
.hh .scrn .warn{font:italic 13px Georgia;color:#7a6a50;margin-top:18px}
.hh .death h1{color:#9a1a10;letter-spacing:6px;font-size:40px;text-shadow:0 0 30px rgba(160,20,10,.4)}
.hh .death p{font:italic 17px Georgia;color:#9a8a7a;margin:10px 0 30px}
.hh .end .stats{font:15px Georgia;color:#b8a888;line-height:2;margin:10px 0 26px}
.hh .end .stats b{color:#e8dcc0}
.hh .fadein{animation:hhfade 2s}
@keyframes hhfade{from{opacity:0}to{opacity:1}}
`;

const ICON = {
  key: '<svg viewBox="0 0 24 24"><circle cx="7" cy="12" r="4" fill="none" stroke="#c8a050" stroke-width="2"/><path d="M11 12h10M17 12v4M20 12v3" stroke="#c8a050" stroke-width="2" fill="none"/></svg>',
  fuse: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="6" rx="1" fill="rgba(180,200,210,.4)" stroke="#c8c0b0"/><rect x="2" y="8.5" width="4" height="7" fill="#c8a050"/><rect x="18" y="8.5" width="4" height="7" fill="#c8a050"/><path d="M6 12h12" stroke="#ddd" stroke-width=".8"/></svg>',
  battery: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="16" height="8" rx="1" fill="#8a1a10" stroke="#c8c0b0"/><rect x="19" y="10.5" width="2.5" height="3" fill="#c8c0b0"/></svg>',
  flash: '<svg viewBox="0 0 24 24"><rect x="3" y="10" width="11" height="4" fill="#a8a8a0"/><path d="M14 9l5-2v10l-5-2z" fill="#c8c8c0"/><path d="M20 9l3-1M20 12h3M20 15l3 1" stroke="#ffe8a0" stroke-width="1"/></svg>',
  cutters: '<svg viewBox="0 0 24 24"><path d="M4 21l7-9M9 21l3-9" stroke="#a01810" stroke-width="2.5"/><path d="M11 12l2-8M12 12l4-7" stroke="#888" stroke-width="2"/></svg>',
};

export class UI {
  constructor(game) {
    this.game = game;
    const root = game.gui.root;
    if (!document.getElementById('hh-css')) { const st = document.createElement('style'); st.id = 'hh-css'; st.textContent = CSS; document.head.appendChild(st); }
    root.classList.add('hh-mode');
    const el = document.createElement('div'); el.className = 'hh';
    el.innerHTML = `
      <div class="cross"></div>
      <svg class="ring" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="3"/><circle class="arc" cx="23" cy="23" r="19" fill="none" stroke="#f0e6d0" stroke-width="3" stroke-dasharray="119.4" stroke-dashoffset="119.4" transform="rotate(-90 23 23)"/></svg>
      <div class="prompt"></div>
      <div class="obj"></div>
      <div class="toast"></div>
      <div class="sub"></div>
      <div class="hint"></div>
      <div class="inv"></div>
      <div class="batt"><span>FLASHLIGHT</span><div class="cell"><i></i></div></div>
      <div class="bars"><div class="bar stam"><i></i></div></div>
      <div class="breath"><div class="tell">HOLD YOUR BREATH</div><div class="lung"><i></i></div><div class="bl">Hold <b>SPACE</b> to hold your breath &nbsp;·&nbsp; <b>E</b> to come out</div></div>
      <div class="ovl notebox"><div class="note"></div></div>
      <div class="ovl padbox"><div class="keypad"><div class="scr"></div><div class="grid"></div><div class="lbl">Type the code, or Esc to step back</div></div></div>
      <div class="ovl scrn title"></div>
      <div class="ovl scrn pausebox"></div>
      <div class="ovl scrn death"></div>
      <div class="ovl scrn end"></div>`;
    root.appendChild(el);
    this.el = el;
    const q = (s) => el.querySelector(s);
    Object.assign(this, { cross: q('.cross'), ring: q('.ring'), arc: q('.ring .arc'), promptEl: q('.prompt'), objEl: q('.obj'), toastEl: q('.toast'), subEl: q('.sub'), hintEl: q('.hint'), invEl: q('.inv'), batt: q('.batt'), stam: q('.bar.stam'), breathEl: q('.breath'), noteBox: q('.notebox'), padBox: q('.padbox'), titleEl: q('.title'), pauseEl: q('.pausebox'), deathEl: q('.death'), endEl: q('.end') });
    this.note = q('.note'); this.pad = q('.keypad');
    this.noteBox.addEventListener('mousedown', () => this.closeNote());
    this.hintsShown = new Set();
    this.subs = [];
    this.statusT = 0;
    H.ui = this;
  }
  overlayOpen() { return this.noteOpen || this.padOpen || this.titleOpen || H.paused || this.deadOpen || this.endOpen; }

  // --- the HUD -------------------------------------------------------------------------------------------------------------------------
  prompt(it, prog, spot) {
    const on = !!it;
    this.cross.classList.toggle('on', on);
    if (on) {
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const verb = typeof it.verb === 'function' ? it.verb() : it.verb;
      const html = `<span class="key">${it.hold ? 'Hold E' : 'E'}</span><span class="lbl">${verb && verb !== 'Locked' ? `${verb} ` : ''}${label}</span>${verb === 'Locked' ? ' <span class="verb">(locked)</span>' : ''}`;
      if (html !== this._ph) { this._ph = html; this.promptEl.innerHTML = html; }
    }
    this.promptEl.classList.toggle('on', on);
    this.ring.classList.toggle('on', prog > 0);
    this.arc.setAttribute('stroke-dashoffset', String(119.4 * (1 - prog)));
    this.cross.style.opacity = spot ? 0 : 1;
  }
  objective(text, sub = 'OBJECTIVE') {
    if (!text) { this.objEl.classList.remove('on'); this._obj = null; return; }
    this._obj = text;
    this.objEl.innerHTML = `<small>${sub}</small>${text}`;
    this.objEl.classList.add('on');
    clearTimeout(this._ot); this._ot = setTimeout(() => { if (!this.status) this.objEl.classList.remove('on'); }, 7000);
  }
  toast(html, secs = 3.2) {
    this.toastEl.innerHTML = html;
    this.toastEl.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => this.toastEl.classList.remove('on'), secs * 1000);
  }
  /** A subtitle line ([sound] in italics, or Speaker: words). */
  subtitle(text, secs = 3, speaker = null) {
    const d = document.createElement('div');
    d.innerHTML = speaker ? `<b>${speaker}:</b> ${text}` : `<i>${text}</i>`;
    const wrap = document.createElement('div'); wrap.appendChild(d); wrap.style.display = 'block'; wrap.style.background = 'none'; wrap.style.padding = '0';
    this.subEl.appendChild(wrap);
    while (this.subEl.children.length > 3) this.subEl.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => wrap.remove(), 450); }, secs * 1000);
  }
  hint(kind) {
    if (this.hintsShown.has(kind)) return;
    const txt = {
      start: 'Move the mouse to look around &nbsp;·&nbsp; <b>W A S D</b> to walk &nbsp;·&nbsp; <b>E</b> to use things',
      flash: '<b>F</b> turns the flashlight on and off. He can see the beam.',
      run: '<b>Shift</b> to run - but he can hear you running. <b>C</b> to crouch and creep quietly.',
      hide: 'Hiding. <b>Space</b> holds your breath when he comes close. <b>E</b> to come out.',
      battery: 'The batteries are running low. <b>R</b> to change them (if you have any).',
      tab: '<b>Tab</b> shows what you\'re doing and what you\'re carrying.',
    }[kind];
    if (!txt) return;
    this.hintsShown.add(kind);
    this.hintEl.innerHTML = txt;
    this.hintEl.classList.add('on');
    clearTimeout(this._ht); this._ht = setTimeout(() => this.hintEl.classList.remove('on'), 9000);
  }
  inventory(inv) {
    const chips = [];
    const p = H.player;
    if (p?.hasFlash) chips.push(`<div class="chip">${ICON.flash}Flashlight</div>`);
    for (const [id, n] of inv.items) {
      const it = ITEMS[id]; if (!it || id === 'flashlight') continue; // (the flashlight has its own chip, above)
      chips.push(`<div class="chip">${ICON[it.icon] || ''}${it.name}${n > 1 ? ` <b>x${n}</b>` : ''}</div>`);
    }
    this.invEl.innerHTML = chips.join('');
    this.invEl.classList.add('on');
    clearTimeout(this._it); this._it = setTimeout(() => { if (!this.status) this.invEl.classList.remove('on'); }, 4500);
  }
  showStatus(on) {
    if (this.status === on) return;
    this.status = on;
    if (on) { this.objEl.classList.toggle('on', !!this._obj); this.invEl.classList.add('on'); this.batt.classList.add('on'); }
    else { this.objEl.classList.remove('on'); this.invEl.classList.remove('on'); }
  }
  update(dt) {
    const p = H.player;
    if (!p) return;
    // nothing on screen but him while he has you (and in the cutscenes, but for what's said)
    this.el.classList.toggle('cine', p.mode === 'dead' || p.mode === 'cut' || p.mode === 'end');
    this.el.classList.toggle('scr', !!(this.deadOpen || this.endOpen));
    this.stam.classList.toggle('on', p.stamina < 0.99 && p.mode === 'play');
    this.stam.firstElementChild.style.width = `${p.stamina * 100}%`;
    this.stam.firstElementChild.style.background = p.tired ? '#c05030' : '';
    const showB = p.hasFlash && (this.status || p.battery < 0.25 || (p.flashOn && (this._bt = (this._bt || 0) + dt) < 3));
    if (!p.flashOn) this._bt = 0;
    this.batt.classList.toggle('on', !!showB);
    this.batt.classList.toggle('low', p.battery < 0.2);
    this.batt.querySelector('i').style.width = `${Math.max(0, p.battery) * 100}%`;
    if (p.battery < 0.2 && p.hasFlash) this.hint('battery');
    const hid = p.mode === 'hide';
    this.breathEl.classList.toggle('on', hid);
    if (hid) {
      this.breathEl.querySelector('.lung i').style.width = `${p.breath * 100}%`;
      this.breathEl.classList.toggle('warn', p.breath < 0.3);
      this.breathEl.classList.toggle('check', !!H.monster?.checking && H.monster.checking === p.spot);
    }
  }

  // --- notes and the keypad ---------------------------------------------------------------------------------------------------------
  showNote(title, html) {
    this.note.innerHTML = `<h3>${title}</h3>${html}<span class="close">E / click to put it down</span>`;
    this.noteBox.classList.add('on');
    this.noteOpen = true;
    this.note.scrollTop = 0;
  }
  closeNote() { if (!this.noteOpen) return; this.noteBox.classList.remove('on'); this.noteOpen = false; H.audio?.paper(); }
  keypad(onCode, len = 4) {
    this.code = '';
    this.padOpen = true; this.onCode = onCode;
    const grid = this.pad.querySelector('.grid');
    grid.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((d) => `<button data-d="${d}">${d}</button>`).join('');
    grid.onclick = (e) => { const d = e.target.dataset.d; if (d) this._padKey(d === '⌫' ? 'backspace' : d === 'OK' ? 'enter' : d); };
    this.padLen = len;
    this._padShow();
    this.padBox.classList.add('on');
    document.exitPointerLock?.();
  }
  _padShow() { this.pad.querySelector('.scr').textContent = (this.code + '____').slice(0, this.padLen); }
  _padKey(k) {
    if (/^[0-9]$/.test(k) && this.code.length < this.padLen) { this.code += k; H.audio?.beep(1); }
    else if (k === 'backspace') this.code = this.code.slice(0, -1);
    else if (k === 'enter' || this.code.length >= this.padLen) {
      if (this.code.length < this.padLen) return;
      const ok = this.onCode(this.code);
      if (ok) { this.closePad(); return; }
      H.audio?.beep(0);
      this.pad.classList.remove('bad'); void this.pad.offsetWidth; this.pad.classList.add('bad');
      setTimeout(() => { this.code = ''; this._padShow(); this.pad.classList.remove('bad'); }, 650);
    }
    this._padShow();
    if (this.code.length >= this.padLen && k !== 'enter') setTimeout(() => this._padKey('enter'), 180);
  }
  closePad() { this.padOpen = false; this.padBox.classList.remove('on'); H.player?.lock(); }

  /** Keys for whatever's open. Returns true if it used the key. */
  onKey(k, e) {
    if (this.titleOpen || this.endOpen) return true;
    if (this.deadOpen) { if (k === ' ' || k === 'enter' || k === 'e') this._retry?.(); return true; }
    if (this.noteOpen) { if (k === 'e' || k === 'escape' || k === ' ' || k === 'enter') this.closeNote(); return true; }
    if (this.padOpen) { e.preventDefault(); if (k === 'escape') this.closePad(); else this._padKey(k); return true; }
    if (H.paused) { if (k === 'escape') this.pause(false); return true; }
    return false;
  }

  // --- screens --------------------------------------------------------------------------------------------------------------------------------
  _settingsHtml() {
    const s = H.player?.settings || loadSettings();
    return `<div class="calib"><canvas width="210" height="44" class="calibcv"></canvas><span>Brightness: the left raven<br>should be barely visible</span></div>
      <div class="set">
        <span>Brightness</span><input type="range" min="0.6" max="1.8" step="0.05" value="${s.brightness}" data-k="brightness"><span class="v"></span>
        <span>Mouse sensitivity</span><input type="range" min="0.3" max="2.5" step="0.05" value="${s.sens}" data-k="sens"><span class="v"></span>
        <span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"><span class="v"></span>
        <span>Invert mouse</span><input type="checkbox" ${s.invert ? 'checked' : ''} data-k="invert"><span></span>
        <span>Graphics</span><select data-k="quality"><option value="2"${s.quality !== 1 ? ' selected' : ''}>High (shadows, smooth edges)</option><option value="1"${s.quality === 1 ? ' selected' : ''}>Low (faster)</option></select><span></span>
      </div>`;
  }
  _wireSettings(box) {
    const s = H.player?.settings || loadSettings();
    const apply = () => {
      for (const inp of box.querySelectorAll('[data-k]')) {
        const k = inp.dataset.k;
        s[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        const v = inp.nextElementSibling; if (v && inp.type !== 'checkbox' && inp.tagName !== 'SELECT') v.textContent = k === 'volume' ? `${Math.round(s[k] * 100)}%` : s[k].toFixed(2);
      }
      saveSettings(s);
      if (s.quality !== this._q) { this._q = s.quality; H.applyQuality?.(s.quality); }
      if (H.post) H.post.brightness = s.brightness;
      H.audio?.setVolume(s.volume);
      drawCalib(box.querySelector('.calibcv'), s.brightness);
    };
    box.querySelectorAll('[data-k]').forEach((i) => { i.oninput = apply; i.onchange = apply; i.onmousedown = (e) => e.stopPropagation(); });
    apply();
  }
  title(hasSave, onStart) {
    this.titleOpen = true;
    this.titleEl.innerHTML = `<h1>RAVENHURST</h1><h2>Escape the Haunted Hotel</h2>
      <div class="menu">${hasSave ? '<button class="mb" data-a="continue">Continue</button>' : ''}<button class="mb${hasSave ? ' dim' : ''}" data-a="new">${hasSave ? 'Start again' : 'Check in'}</button></div>
      ${this._settingsHtml()}
      <div class="ctl"><b>Mouse</b> look &nbsp; <b>W A S D</b> walk &nbsp; <b>Shift</b> run &nbsp; <b>C</b> crouch &nbsp; <b>E</b> use / hide &nbsp; <b>F</b> flashlight &nbsp; <b>Space</b> hold breath (hiding) &nbsp; <b>R</b> batteries &nbsp; <b>Tab</b> objective &nbsp; <b>Esc</b> pause</div>
      <div class="warn">Headphones. Lights off. Contains darkness, chases and sudden frights.</div>`;
    this.titleEl.classList.add('on', 'fadein');
    this._wireSettings(this.titleEl);
    this.titleEl.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { this.titleEl.classList.remove('on'); this.titleOpen = false; onStart(b.dataset.a); }; });
  }
  pause(on) {
    if (on === !!H.paused) return;
    H.paused = on;
    if (on) {
      this.pauseEl.innerHTML = `<h1 style="font-size:40px">PAUSED</h1><h2>${this._obj ? this._obj : ''}</h2>
        <div class="menu"><button class="mb" data-a="resume">Resume</button><button class="mb" data-a="checkpoint">Back to the last checkpoint</button><button class="mb" data-a="quit">Leave the hotel</button></div>${this._settingsHtml()}`;
      this.pauseEl.classList.add('on');
      this._wireSettings(this.pauseEl);
      this.pauseEl.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'resume') { this.pause(false); H.player?.lock(); }
        if (a === 'checkpoint') { this.pause(false); H.story?.respawn(); H.player?.lock(); }
        if (a === 'quit') { this.pause(false); this.game.emit('exit'); }
      }; });
      H.audio?.pause(true);
    } else { this.pauseEl.classList.remove('on'); H.audio?.pause(false); }
  }
  death(line, onRetry) {
    this.deadOpen = true;
    this._retry = () => { if (!this.deadOpen) return; this.deadOpen = false; this.deathEl.classList.remove('on'); this.el.classList.remove('scr'); onRetry(); };
    this.el.classList.add('scr');
    this.deathEl.innerHTML = `<h1>${line[0]}</h1><p>${line[1]}</p><div class="menu"><button class="mb" data-a="retry">Try again</button></div><div class="ctl">Space to try again</div>`;
    this.deathEl.classList.add('on', 'fadein');
    this.deathEl.querySelector('[data-a=retry]').onclick = () => this._retry();
    document.exitPointerLock?.();
  }
  ending(stats, onLeave, onAgain) {
    this.endOpen = true;
    this.el.classList.add('scr');
    this.endEl.innerHTML = `<h1 style="font-size:46px">CHECKED OUT</h1><h2>You escaped the Ravenhurst Hotel.</h2>
      <div class="stats">Time: <b>${stats.time}</b> &nbsp;·&nbsp; Caught: <b>${stats.deaths}</b> time${stats.deaths === 1 ? '' : 's'} &nbsp;·&nbsp; Notes found: <b>${stats.notes}</b><br><i>"Thank you for staying with us. We look forward to your return."</i></div>
      <div class="menu"><button class="mb" data-a="again">Check in again</button><button class="mb dim" data-a="leave">Leave</button></div>`;
    this.endEl.classList.add('on', 'fadein');
    this.endEl.querySelector('[data-a=leave]').onclick = onLeave;
    this.endEl.querySelector('[data-a=again]').onclick = onAgain;
    document.exitPointerLock?.();
  }
}

/** The brightness test card: three ravens at the edge of black. */
function drawCalib(cv, b) {
  if (!cv) return;
  const x = cv.getContext('2d'), w = cv.width, h = cv.height;
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  [0.006, 0.02, 0.06].forEach((lin, i) => {
    const v = Math.round(255 * Math.pow(Math.pow(lin, 1 / 2.2), 1 / b));
    x.fillStyle = `rgb(${v},${v},${v})`;
    const cx = 35 + i * 70, cy = 24;
    x.beginPath(); x.ellipse(cx, cy, 14, 8, -0.2, 0, 7); x.fill();
    x.beginPath(); x.arc(cx + 13, cy - 6, 5, 0, 7); x.fill();
    x.beginPath(); x.moveTo(cx + 17, cy - 7); x.lineTo(cx + 24, cy - 5); x.lineTo(cx + 17, cy - 4); x.fill();
    x.beginPath(); x.moveTo(cx - 12, cy); x.lineTo(cx - 24, cy - 6); x.lineTo(cx - 20, cy + 4); x.fill();
  });
}
