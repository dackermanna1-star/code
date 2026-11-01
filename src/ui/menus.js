// Menus: title, intake (character creation), pause, notebook (status / people / tasks /
// schedule / map), options, controls and the ending papers.
import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, FACIAL, BUILDS } from '../characters/appearance.js';
import { CRIMES } from '../characters/roster.js';
import { PERIODS } from '../gameplay/schedule.js';
import { ROOMS } from '../world/layout.js';
import { JOBS } from '../gameplay/activities.js';
import { BINDING_LABELS } from '../core/input.js';
import { slotInfo } from '../save/save.js';
import { formatClock } from '../core/mathutil.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Menus {
  constructor(game, root) {
    this.game = game;
    this.root = el('div', 'menus ui-interactive');
    root.appendChild(this.root);
    this.screen = null;
    this.tab = 'status';
  }
  get open() { return !!this.screen; }
  close() { this.screen = null; this.root.innerHTML = ''; this.root.className = 'menus ui-interactive'; this.game.setMenuOpen(false); }
  _show(name, html, cls = '') {
    this.screen = name;
    this.root.className = `menus ui-interactive show ${cls}`;
    this.root.innerHTML = html;
    this.game.setMenuOpen(true);
    this.root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.game.audio?.ui('click'); this.action(b.dataset.act, b.dataset); }));
  }
  update() {
    const input = this.game.input;
    if (this.screen === 'title' || this.screen === 'intake' || this.screen === 'ending') return;
    if (input.consume('pause', 0.2) || (this.screen && input.consume('back_ui', 0.2))) {
      if (this.screen) { if (this.screen === 'pause') this.close(); else this.showPause(); }
      else if (!this.game.dialogueUI.open) this.showPause();
    }
    if (!this.screen && input.consume('notebook', 0.2)) this.showNotebook('status');
    else if (this.screen === 'notebook' && input.consume('notebook', 0.2)) this.close();
    if (!this.screen && input.consume('map', 0.2)) this.showNotebook('map');
  }

  // ------------------------------------------------------------------ title
  showTitle() {
    const auto = slotInfo('auto');
    this._show('title', `<div class="title-wrap"><div class="logo">GRAVELMOUTH</div><div class="tagline">a prison life sandbox</div>
      <div class="menu-col">
        ${auto ? `<button data-act="continue">Continue <small>${esc(auto.name)} · Day ${auto.day}</small></button>` : ''}
        <button data-act="intake" class="primary">New Sentence</button>
        <button data-act="loadMenu">Load</button>
        <button data-act="options">Options</button>
        <button data-act="controls">Controls</button>
        <button data-act="about">About</button>
      </div>
      <div class="title-foot">Gravelmouth State Penitentiary · Est. 1931 · "We keep the lights on."</div></div>`, 'title');
  }
  // ------------------------------------------------------------------ intake / creator
  showIntake() {
    const g = this.game;
    const s = this.setup = this.setup || { name: 'Dale Pickett', female: false, skin: 2, hair: 2, hairColor: 1, facial: 1, build: 'average', crime: 0, days: 21 };
    const opt = (k, label, values, fmt) => `<div class="field"><label>${label}</label><div class="stepper"><button data-act="dec" data-k="${k}">‹</button><span>${fmt(s[k])}</span><button data-act="inc" data-k="${k}">›</button></div></div>`;
    const swatch = (v, list) => `<i class="sw" style="background:${list[v]}"></i>`;
    this._show('intake', `<div class="intake">
      <div class="paper">
        <div class="paper-head"><div><b>GRAVELMOUTH STATE PENITENTIARY</b><br>Form 7-B · Inmate Intake</div><div class="stamp">PROCESSING</div></div>
        <div class="field"><label>Name</label><input id="in-name" maxlength="22" value="${esc(s.name)}"></div>
        ${opt('female', 'Body', [false, true], (v) => (v ? 'Type B' : 'Type A'))}
        ${opt('build', 'Build', Object.keys(BUILDS), (v) => v[0].toUpperCase() + v.slice(1))}
        ${opt('skin', 'Skin', SKIN_TONES, (v) => swatch(v, SKIN_TONES))}
        ${opt('hair', 'Hair', HAIR_STYLES, (v) => HAIR_STYLES[v])}
        ${opt('hairColor', 'Hair colour', HAIR_COLORS, (v) => swatch(v, HAIR_COLORS))}
        ${opt('facial', 'Facial hair', FACIAL, (v) => FACIAL[v])}
        ${opt('crime', 'Conviction', CRIMES, (v) => CRIMES[v])}
        ${opt('days', 'Sentence', [7, 14, 21, 30], (v) => `${v} days`)}
        <p class="fine">By signing below the inmate agrees that the soup is soup.</p>
        <div class="row"><button data-act="title">Back</button><button class="primary" data-act="begin">Begin Sentence</button></div>
      </div>
      <div class="mug-note">Rotate preview: drag · Your mugshot is being taken</div></div>`, 'intake-screen');
    this.root.querySelector('#in-name').addEventListener('input', (e) => { s.name = e.target.value || 'Inmate'; });
    g.previewSetup(s);
  }
  _step(k, dir) {
    const s = this.setup;
    const lists = { female: [false, true], build: Object.keys(BUILDS), skin: SKIN_TONES, hair: HAIR_STYLES, hairColor: HAIR_COLORS, facial: FACIAL, crime: CRIMES, days: [7, 14, 21, 30] };
    const list = lists[k];
    if (k === 'female' || k === 'build' || k === 'days') { const i = list.indexOf(s[k]); s[k] = list[(i + dir + list.length) % list.length]; }
    else s[k] = (s[k] + dir + list.length) % list.length;
    this.showIntake();
  }
  // ------------------------------------------------------------------ pause & notebook
  showPause() {
    this._show('pause', `<div class="panel pause"><h2>Paused</h2><div class="menu-col">
      <button data-act="resume" class="primary">Resume</button>
      <button data-act="notebook">Notebook</button>
      <button data-act="save">Save Game</button>
      <button data-act="loadMenu">Load Game</button>
      <button data-act="options">Options</button>
      <button data-act="controls">Controls</button>
      <button data-act="quit">Quit to Title</button></div></div>`);
  }
  showNotebook(tab = this.tab) {
    this.tab = tab;
    const g = this.game, sim = g.sim, p = sim.player, prog = sim.progression;
    const tabs = ['status', 'people', 'tasks', 'schedule', 'map'];
    let body = '';
    if (tab === 'status') {
      const st = (k, label) => `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${p.stats[k]}%"></i></div><b>${Math.floor(p.stats[k])}</b></div>`;
      const job = p.job ? JOBS[p.job].name : 'Unemployed — see the Warden';
      body = `<div class="cols"><div>${st('str', 'Strength')}${st('agi', 'Agility')}${st('tgh', 'Toughness')}${st('smt', 'Smarts')}
        <div class="stat"><span>Respect</span><div class="sbar rep"><i style="width:${p.respect}%"></i></div><b>${Math.floor(p.respect)}</b></div>
        <div class="stat"><span>Conduct</span><div class="sbar con"><i style="width:${prog.behavior}%"></i></div><b>${Math.floor(prog.behavior)}</b></div></div>
        <div class="facts"><p><b>Inmate</b> ${esc(p.name)} · ${p.app.idNumber}</p><p><b>Conviction</b> ${esc(prog.sentence.crime)}</p>
        <p><b>Sentence</b> ${prog.sentence.daysLeft} of ${prog.sentence.total} days left · served ${prog.sentence.served}</p>
        <p><b>Cell</b> ${p.cell || '—'} · <b>Job</b> ${job}</p><p><b>Ramen</b> ${p.ramen}</p>
        <p><b>Heat</b> ${Math.round(sim.rules.heat(p))}${sim.rules.isWanted(p) ? ' · <span class="bad">WANTED</span>' : ''}</p>
        <p class="tip">Train in the gym or yard to raise Strength, Agility and Toughness. Read in the library for Smarts. Work, eat, sleep and stay out of trouble to impress the parole board.</p></div></div>`;
    } else if (tab === 'people') {
      const known = sim.characters.filter((c) => c !== p).map((c) => ({ c, op: sim.social.opinionOf(c, p) })).sort((a, b) => b.op - a.op);
      body = `<div class="people ui-scroll">${known.map(({ c, op }) => `<div class="person"><div class="pn">${esc(c.name)}${c.def.crew ? ` <span class="crewtag" style="--c:${g.crews[c.def.crew].color}">${g.crews[c.def.crew].name}</span>` : ''}${sim.social.followers.has(c.id) ? ' <span class="crewtag" style="--c:#e0a43a">Has your back</span>' : ''}</div>
        <div class="pd">${c.kind === 'guard' ? 'Officer' : c.kind === 'staff' ? 'Staff' : `${c.app.idNumber} · ${esc(c.def.crime || '')}`}</div><div class="opbar"><span style="left:${50 + op / 2}%"></span></div></div>`).join('')}</div>`;
    } else if (tab === 'tasks') {
      const fv = sim.economy.favors.filter((f) => f.status !== 'done');
      const done = sim.economy.favors.filter((f) => f.status === 'done').length;
      body = `<div class="tasks"><h3>Favours</h3>${fv.length ? fv.map((f) => `<p class="${f.status}">${f.status === 'ready' ? '✔ ' : '☐ '}${esc(f.text)} <em>${f.reward} ramen</em></p>`).join('') : '<p class="dim">Nobody owes you, you owe nobody. Ask around: "Need anything?"</p>'}
        <p class="dim">${done} favours completed.</p>
        <h3>Ways out</h3><p>☐ Serve your time: ${prog.sentence.daysLeft} days left. Good conduct shortens it at the weekly parole board.</p>
        <p>☐ Or... rumour has it the fence behind the yard bleachers is rusted through. You'd need cutters.</p></div>`;
    } else if (tab === 'schedule') {
      const cur = sim.clock.period.id;
      body = `<table class="sched">${PERIODS.map((pp) => `<tr class="${pp.id === cur ? 'now' : ''}"><td>${formatClock(pp.start)}</td><td><b>${pp.name}</b></td><td>${pp.desc}</td></tr>`).join('')}</table>`;
    } else if (tab === 'map') body = `<div class="mapwrap">${this._mapSVG()}</div>`;
    this._show('notebook', `<div class="panel notebook"><div class="nb-tabs">${tabs.map((t) => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('')}<button data-act="resume" class="x">✕</button></div><div class="nb-body">${body}</div></div>`, 'nb');
  }
  _mapSVG() {
    const sim = this.game.sim, p = sim.player;
    const x0 = -18, z0 = -4, w = 112, h = 116, S = 5;
    const rect = (r, cls) => `<rect class="${cls}" x="${(r.rect[0] - x0) * S}" y="${(r.rect[1] - z0) * S}" width="${(r.rect[2] - r.rect[0]) * S}" height="${(r.rect[3] - r.rect[1]) * S}"/>`;
    let svg = `<svg viewBox="0 0 ${w * S} ${h * S}" class="map">`;
    for (const r of ROOMS) if (!r.under) svg += rect(r, `room ${r.outdoor ? 'out' : ''} ${r.restricted ? 'res' : ''}`);
    for (const c of sim.world.cells) svg += rect(c, 'cell');
    for (const r of ROOMS) if (!r.under) svg += `<text x="${((r.rect[0] + r.rect[2]) / 2 - x0) * S}" y="${((r.rect[1] + r.rect[3]) / 2 - z0) * S}">${r.name}</text>`;
    for (const c of sim.characters) {
      if (c === p) continue;
      const cls = c.kind === 'guard' ? 'g' : c.kind === 'staff' ? 's' : sim.social.followers.has(c.id) ? 'f' : 'i';
      svg += `<circle class="dot ${cls}" cx="${(c.x - x0) * S}" cy="${(c.z - z0) * S}" r="${cls === 'g' ? 5 : 4}"/>`;
    }
    svg += `<circle class="dot me" cx="${(p.x - x0) * S}" cy="${(p.z - z0) * S}" r="8"/>`;
    return svg + '</svg><div class="legend"><i class="me"></i>You <i class="g"></i>Guards <i class="i"></i>Inmates <i class="f"></i>Your backup</div>';
  }
  // ------------------------------------------------------------------ options / controls / load
  showOptions(back = 'pause') {
    const g = this.game, o = g.options;
    const slider = (k, label, min, max, step) => `<div class="field"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${o[k]}" data-opt="${k}"><b>${Math.round(o[k] * 100) / 100}</b></div>`;
    const toggle = (k, label) => `<div class="field"><label>${label}</label><button data-act="toggle" data-k="${k}">${o[k] ? 'On' : 'Off'}</button></div>`;
    const choice = (k, label, vals) => `<div class="field"><label>${label}</label><div class="stepper">${vals.map((v) => `<button data-act="setopt" data-k="${k}" data-v="${v}" class="${o[k] === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>`;
    this.back = back;
    this._show('options', `<div class="panel opts"><h2>Options</h2>
      ${slider('master', 'Master volume', 0, 1, 0.05)}${slider('music', 'Music', 0, 1, 0.05)}${slider('sfx', 'Effects', 0, 1, 0.05)}
      ${slider('sensitivity', 'Mouse sensitivity', 0.3, 2.5, 0.1)}${toggle('invertY', 'Invert camera Y')}${toggle('autoCam', 'Camera follows movement')}${toggle('shake', 'Screen shake')}
      ${choice('timeSpeed', 'Time speed', ['slow', 'normal', 'fast'])}${choice('quality', 'Graphics (restart)', ['low', 'medium', 'high'])}
      <div class="row"><button data-act="${back}" class="primary">Done</button></div></div>`);
    this.root.querySelectorAll('[data-opt]').forEach((s) => s.addEventListener('input', () => { g.setOption(s.dataset.opt, +s.value); s.nextElementSibling.textContent = s.value; }));
  }
  showControls(back = 'pause') {
    const k = BINDING_LABELS.keyboard, p = BINDING_LABELS.gamepad;
    const rows = [['Move', 'move'], ['Sprint', 'sprint'], ['Camera', 'camera'], ['Punch / swing', 'attack'], ['Kick / heavy', 'heavy'], ['Block (tap at ⚡ to counter)', 'block'], ['Dodge', 'dodge'], ['Grab / throw held item', 'grab'], ['Talk / pick up / use', 'interact'], ['Drop item', 'drop'], ['Use item (eat, read)', 'use'], ['Lock on', 'lock'], ['Next target', 'cycle'], ['Notebook', 'notebook'], ['Map', 'map'], ['Pause', 'pause']];
    this._show('controls', `<div class="panel ctrls"><h2>Controls</h2><table>${rows.map(([l, a]) => `<tr><td>${l}</td><td><kbd>${k[a] || '—'}</kbd></td><td><kbd>${p[a] || '—'}</kbd></td></tr>`).join('')}</table>
      <p class="tip">In a grapple: punch/kick for knees and headbutts, grab again to throw (steer with movement), dodge to shove away. When grabbed or knocked down, mash buttons to recover faster. 1–3 take items out of your pockets. Click the game to capture the mouse.</p>
      <div class="row"><button data-act="${back}" class="primary">Back</button></div></div>`);
  }
  showLoad(back = 'pause') {
    const slots = ['auto', '1', '2', '3'];
    this._show('load', `<div class="panel"><h2>Load</h2><div class="menu-col">${slots.map((s) => { const i = slotInfo(s); return `<button data-act="load" data-slot="${s}" ${i ? '' : 'disabled'}>${s === 'auto' ? 'Autosave' : `Slot ${s}`} <small>${i ? `${esc(i.name)} · Day ${i.day} · ${new Date(i.savedAt).toLocaleString()}` : 'empty'}</small></button>`; }).join('')}</div>
      <div class="row"><button data-act="${back}">Back</button></div></div>`);
  }
  showSave() {
    const slots = ['1', '2', '3'];
    this._show('save', `<div class="panel"><h2>Save</h2><div class="menu-col">${slots.map((s) => { const i = slotInfo(s); return `<button data-act="saveSlot" data-slot="${s}">Slot ${s} <small>${i ? `${esc(i.name)} · Day ${i.day}` : 'empty'}</small></button>`; }).join('')}</div>
      <div class="row"><button data-act="pause">Back</button></div></div>`);
  }
  showAbout() {
    this._show('about', `<div class="panel"><h2>About</h2><p>GRAVELMOUTH is an original prison-life sandbox built with Babylon.js. Serve your sentence, find work, train, make friends and enemies, join a crew — or find a way over the fence.</p>
      <p class="dim">Motion-captured locomotion and impact sound effects were shared from the "Last Stance" project; the locomotion tracks are derived from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), created with funding from NSF EIA-0196217.</p>
      <div class="row"><button data-act="title">Back</button></div></div>`);
  }
  showEnding(end) {
    const sim = this.game.sim, prog = sim.progression, st = prog.stats, p = sim.player;
    const escaped = end.kind === 'escaped';
    this._show('ending', `<div class="paper ending"><div class="paper-head"><div><b>GRAVELMOUTH STATE PENITENTIARY</b><br>${escaped ? 'Incident Report · ESCAPE' : 'Certificate of Release'}</div><div class="stamp ${escaped ? 'red' : ''}">${escaped ? 'AT LARGE' : 'RELEASED'}</div></div>
      <h1>${esc(p.name)}</h1><p class="verdict">${escaped ? `Went over the fence on day ${end.day}. The search continues.` : `Released on day ${end.day} after serving ${prog.sentence.served} days.`}</p>
      <p class="titlecard">“${prog.title()}”</p>
      <table class="endstats"><tr><td>Knockouts dealt</td><td>${st.kos}</td></tr><tr><td>Times knocked out</td><td>${st.timesKOd}</td></tr><tr><td>Crimes on record</td><td>${st.crimes}</td></tr>
      <tr><td>Arrests</td><td>${st.arrests}</td></tr><tr><td>Ramen earned working</td><td>${st.ramenEarned}</td></tr><tr><td>Favours done</td><td>${st.favors}</td></tr>
      <tr><td>Final stats</td><td>STR ${Math.floor(p.stats.str)} · AGI ${Math.floor(p.stats.agi)} · TGH ${Math.floor(p.stats.tgh)} · SMT ${Math.floor(p.stats.smt)}</td></tr><tr><td>Respect</td><td>${Math.floor(p.respect)}</td></tr></table>
      <div class="row"><button class="primary" data-act="newAfter">New Sentence</button><button data-act="keep">Keep playing</button></div></div>`, 'ending-screen');
  }

  action(act, data) {
    const g = this.game;
    switch (act) {
      case 'resume': this.close(); break;
      case 'continue': g.loadGame('auto'); break;
      case 'intake': this.showIntake(); break;
      case 'title': this.showTitle(); g.titleCamera(); break;
      case 'dec': this._step(data.k, -1); break;
      case 'inc': this._step(data.k, 1); break;
      case 'begin': g.beginSentence(this.setup); break;
      case 'notebook': this.showNotebook(); break;
      case 'tab': this.showNotebook(data.tab); break;
      case 'save': this.showSave(); break;
      case 'saveSlot': g.saveGame(data.slot); this.showSave(); break;
      case 'loadMenu': this.showLoad(this.screen === 'title' ? 'title' : 'pause'); break;
      case 'load': g.loadGame(data.slot); break;
      case 'options': this.showOptions(this.screen === 'title' ? 'title' : 'pause'); break;
      case 'controls': this.showControls(this.screen === 'title' ? 'title' : 'pause'); break;
      case 'about': this.showAbout(); break;
      case 'pause': this.showPause(); break;
      case 'quit': g.quitToTitle(); break;
      case 'toggle': g.setOption(data.k, !g.options[data.k]); this.showOptions(this.back); break;
      case 'setopt': g.setOption(data.k, data.v); this.showOptions(this.back); break;
      case 'newAfter': g.quitToTitle(); this.showIntake(); break;
      case 'keep': g.sim.progression.ended = { kind: 'continued' }; this.close(); break;
      default: break;
    }
  }
}
