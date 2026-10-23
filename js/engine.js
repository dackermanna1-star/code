/* What Derry Keeps — visual-novel runtime.
 * Runs the compiled Ink story (window.STORY_JSON), interprets @commands and
 * speaker lines, paints the stage with the ART registry, and keeps saves.
 * Menus, journal and the map live in ui.js; free text in freeform.js. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const snd = (fn, ...a) => { try { if (window.SND && typeof SND[fn] === 'function') return SND[fn](...a); } catch (e) { console.warn('audio', fn, e); } };

  /* ---------- storage (never trust it) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('wdk.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('wdk.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('wdk.' + k); } catch (e) { /* ignore */ } }
  };

  /* ---------- icons ---------- */
  const I = {
    journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3z"/><path d="M5 18a3 3 0 0 1 3-3h11"/><path d="M9 7h6"/></svg>',
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><circle cx="15.5" cy="11" r="2"/><path d="M7 19l1.5-3h7L17 19"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/></svg>',
    hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    clue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg>',
    tape: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><circle cx="15.5" cy="11" r="2"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></svg>'
  };

  /* ---------- tones ---------- */
  const TONES = {
    friendly: ['Friendly', '#d4835a', 't_warm'], kind: ['Kind', '#de9a86', 't_warm'], flirt: ['Flirt', '#d98aa6', 't_warm'],
    joke: ['Joke', '#d9a441', 't_funny'], sarcastic: ['Sarcastic', '#c9a24a', 't_funny'],
    blunt: ['Blunt', '#d6714f', 't_bold'], confront: ['Confront', '#d4544a', 't_bold'],
    shy: ['Shy', '#93a6bf', 't_careful'], silent: ['Silence', '#8a96a8', 't_careful'], deflect: ['Deflect', '#9aa7b8', 't_careful'], leave: ['Leave', '#8a96a8', 't_careful'],
    manipulate: ['Manipulate', '#a78fc4', 't_sly'], lie: ['Lie', '#b29bd0', 't_sly'],
    honest: ['Honest', '#e9e1cf', 't_honest'],
    ask: ['Ask', '#5fb7b0', 't_curious'], probe: ['Probe', '#6cc4bc', 't_curious'], look: ['Look', '#6cc4bc', 't_curious'],
    action: ['Act', '#9aae66', null], go: ['Go', '#9aae66', null], record: ['Record', '#e2843b', 't_curious']
  };
  const TONE_EXPR = { friendly: 'smile', kind: 'smile', flirt: 'blush', joke: 'grin', sarcastic: 'smirk', blunt: 'flat', confront: 'angry', shy: 'blush', silent: 'flat', deflect: 'smirk', leave: 'flat', manipulate: 'smirk', lie: 'smirk', honest: 'neutral', ask: 'thinking', probe: 'thinking', look: 'thinking', action: 'neutral', go: 'neutral', record: 'neutral' };

  /* ---------- state ---------- */
  const E = window.ENGINE = {
    story: null, store, icons: I, tones: TONES, clone, esc, snd,
    settings: Object.assign({ textSpeed: 45, autoDelay: 1.0, master: 0.9, music: 0.55, ambience: 0.6, sfx: 0.8, fx: 'full', fontScale: 1, skipUnseen: false, claude: true }, store.get('settings', {})),
    eng: null, vis: null, snap: null, runToken: 0, running: false,
    auto: false, skip: false, ctrlSkip: false, typing: false, hideUI: false,
    seen: new Set(store.get('seen', [])),
    log: [], lastLines: []
  };
  const freshEng = () => ({ clues: [], tapes: [], theories: [], memories: {}, met: [], ctx: '', freeLog: [], chapter: null, playtime: 0, location: '', decisions: [] });
  const freshVis = () => ({ bg: null, sprites: {}, music: null, amb: null, weather: null, cg: null, black: false, tint: null });

  /* ---------- text markup ---------- */
  function markup(s) {
    let h = esc(s);
    h = h.replace(/\[\[hand:(.+?)\]\]/g, '<span class="hand">$1</span>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/--/g, '—');
    return h;
  }

  /* ---------- speakers ---------- */
  const SPK = /^([A-Z][A-Z0-9_]*)(?:\(([a-z0-9_]+)\))?:\s+([\s\S]*)$/;
  function parseLine(raw) {
    const m = raw.match(SPK);
    if (!m || !(window.DATA && DATA.chars && (DATA.chars[m[1]] || ['GUS', 'THINK', 'TAPE', 'PHONE', 'RADIO', 'VOICE'].includes(m[1])))) return { kind: 'narr', text: raw };
    const key = m[1], arg = m[2] || null, text = m[3];
    if (key === 'GUS') return { kind: 'gus', expr: arg, text };
    if (key === 'THINK') return { kind: 'think', expr: arg, text };
    if (key === 'TAPE') return { kind: 'tape', who: arg, text };
    if (key === 'PHONE') return { kind: 'phone', who: arg, text };
    if (key === 'RADIO') return { kind: 'radio', who: arg, text };
    if (key === 'VOICE') return { kind: 'voice', who: arg, text };
    return { kind: 'char', key, expr: arg, text };
  }
  const charInfo = (key) => (DATA.chars && DATA.chars[key]) || { name: key.charAt(0) + key.slice(1).toLowerCase(), color: '#c0623a' };
  const nameFor = (who, fallback) => {
    if (!who) return fallback;
    const k = who.toUpperCase();
    return DATA.chars[k] ? DATA.chars[k].name : who.charAt(0).toUpperCase() + who.slice(1);
  };

  /* ---------- stage: background ---------- */
  const POS = { farleft: 13, left: 27, center: 50, right: 73, farright: 87 };
  function lightMatrix(L) {
    const s = L.s == null ? 1 : L.s;
    const m = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
    const r = [L.r, L.g, L.b];
    const v = [];
    for (let i = 0; i < 3; i++) v.push(...[m[i * 3] * r[i], m[i * 3 + 1] * r[i], m[i * 3 + 2] * r[i]].map((x) => x.toFixed(3)), 0, 0);
    v.push(0, 0, 0, 1, 0);
    return v.join(' ');
  }
  function setLight(L) { const m = $('#spriteLightM'); if (m && L) m.setAttribute('values', lightMatrix(L)); }
  E.setBg = function (id, time, variant, trans) {
    const r = window.KIT ? KIT.renderBg(id, time, variant) : null;
    if (!r) console.warn('missing background', id);
    const host = $('#bg');
    const div = document.createElement('div');
    div.className = 'bgimg';
    div.innerHTML = r ? r.svg : '';
    const reduce = E.settings.fx !== 'full';
    const olds = $$('.bgimg', host);
    if (trans === 'cut' || trans === 'flash' || trans === 'glitch' || !olds.length || E.fastForward()) {
      olds.forEach((o) => o.remove());
      host.appendChild(div);
      if (trans === 'flash' && !reduce) fx('flash');
      if (trans === 'glitch' && !reduce) fx('glitch');
    } else {
      div.classList.add('out');
      if (trans === 'slow') div.style.transitionDuration = '2.6s';
      host.appendChild(div);
      requestAnimationFrame(() => requestAnimationFrame(() => div.classList.remove('out')));
      const dur = trans === 'slow' ? 2700 : 1200;
      setTimeout(() => olds.forEach((o) => o.remove()), dur);
    }
    if (r) setLight(r.light);
    E.vis.bg = { id, time: r ? r.time : time, variant: variant || null };
    E.eng.location = (DATA.places && DATA.places[id] && DATA.places[id].name) || E.eng.location;
    if (E.vis.black) { E.vis.black = false; $('#fx .black').classList.remove('on'); }
  };

  /* ---------- stage: sprites ---------- */
  const spriteEls = {};
  function renderSprite(el, id, expr, outfit) {
    const svg = window.KIT && KIT.renderChar(id, expr, outfit);
    el.innerHTML = '<div class="sp">' + (svg || '') + '</div>';
    el.dataset.expr = expr;
  }
  E.show = function (id, expr, pos, outfit) {
    if (!window.ART || !ART.chars[id]) { console.warn('missing character', id); return; }
    const cur = E.vis.sprites[id] || {};
    expr = expr || cur.expr || 'neutral';
    pos = pos || cur.pos || 'center';
    outfit = outfit || cur.outfit || null;
    let el = spriteEls[id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'sprite breathe';
      el.style.setProperty('--bd', (-Math.random() * 5).toFixed(2) + 's');
      el.style.setProperty('--blink', (4.4 + Math.random() * 2.4).toFixed(2) + 's');
      el.style.left = POS[pos] + '%';
      $('#sprites').appendChild(el);
      spriteEls[id] = el;
      renderSprite(el, id, expr, outfit);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    } else {
      el.style.left = (POS[pos] || 50) + '%';
      if (el.dataset.expr !== expr || cur.outfit !== outfit) renderSprite(el, id, expr, outfit);
      el.classList.add('on');
    }
    E.vis.sprites[id] = { expr, pos, outfit };
    markMet(id);
  };
  E.expr = function (id, expr) { if (E.vis.sprites[id]) E.show(id, expr); };
  E.hide = function (id) {
    const ids = id === 'all' ? Object.keys(spriteEls) : [id];
    for (const k of ids) {
      const el = spriteEls[k];
      if (el) { el.classList.remove('on'); delete spriteEls[k]; setTimeout(() => el.remove(), 520); }
      delete E.vis.sprites[k];
    }
  };
  function speaking(id) {
    const ids = Object.keys(spriteEls);
    const onStage = id && spriteEls[id];
    for (const k of ids) spriteEls[k].classList.toggle('speaking', !onStage || k === id);
  }
  function markMet(id) { if (id && !E.eng.met.includes(id)) E.eng.met.push(id); }

  /* ---------- stage: cg, weather, fx ---------- */
  E.cg = function (id, variant) {
    const host = $('#cg');
    if (!id || id === 'off') { host.classList.remove('on'); E.vis.cg = null; setTimeout(() => { if (!E.vis.cg) host.innerHTML = ''; }, 1300); return; }
    const r = window.KIT ? KIT.renderBg(id, null, variant) : null;
    host.innerHTML = r ? r.svg : '';
    requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('on')));
    E.vis.cg = { id, variant: variant || null };
  };
  /* weather particles on a canvas */
  const W = { type: null, parts: [], raf: 0, w: 0, h: 0, ctx: null };
  function weatherResize() {
    const c = $('#weather'); const st = $('#stage');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W.w = st.clientWidth; W.h = st.clientHeight;
    c.width = Math.round(W.w * dpr); c.height = Math.round(W.h * dpr);
    W.ctx = c.getContext('2d'); W.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function weatherSeed() {
    W.parts = [];
    const n = W.type === 'rain' ? 170 : W.type === 'leaves' ? 18 : W.type === 'fog' ? 7 : W.type === 'dust' ? 50 : W.type === 'snow' ? 90 : 0;
    for (let i = 0; i < n; i++) W.parts.push(newPart(true));
  }
  const LEAF = ['#b5532e', '#e08a3c', '#d9a441', '#8c3b2e'];
  function newPart(init) {
    const w = W.w || 800, h = W.h || 450;
    if (W.type === 'rain') return { x: Math.random() * w * 1.2, y: init ? Math.random() * h : -20, l: 8 + Math.random() * 14, v: 9 + Math.random() * 7, a: 0.12 + Math.random() * 0.25 };
    if (W.type === 'leaves') return { x: Math.random() * w, y: init ? Math.random() * h : -20, r: 3 + Math.random() * 4, v: 0.5 + Math.random() * 0.9, ph: Math.random() * 6, rot: Math.random() * 6, c: LEAF[Math.floor(Math.random() * 4)] };
    if (W.type === 'fog') return { x: Math.random() * w, y: h * (0.45 + Math.random() * 0.5), r: w * (0.18 + Math.random() * 0.2), v: 0.08 + Math.random() * 0.15, a: 0.05 + Math.random() * 0.06 };
    if (W.type === 'dust') return { x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.4, v: 0.05 + Math.random() * 0.15, ph: Math.random() * 6, a: 0.2 + Math.random() * 0.4 };
    return { x: Math.random() * w, y: init ? Math.random() * h : -10, r: 1 + Math.random() * 2, v: 0.4 + Math.random() * 0.8, ph: Math.random() * 6 };
  }
  function weatherTick() {
    const c = W.ctx; if (!c) return;
    c.clearRect(0, 0, W.w, W.h);
    for (let i = 0; i < W.parts.length; i++) {
      const p = W.parts[i];
      if (W.type === 'rain') {
        c.strokeStyle = `rgba(200,215,235,${p.a})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.l * 0.18, p.y + p.l); c.stroke();
        p.y += p.v; p.x -= p.v * 0.18;
        if (p.y > W.h) W.parts[i] = newPart(false);
      } else if (W.type === 'leaves') {
        p.ph += 0.02; p.rot += 0.03; p.y += p.v; p.x += Math.sin(p.ph) * 0.8 + 0.25;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.c; c.globalAlpha = 0.85;
        c.beginPath(); c.ellipse(0, 0, p.r * 1.6, p.r * 0.7, 0, 0, Math.PI * 2); c.fill(); c.restore();
        if (p.y > W.h + 10) W.parts[i] = newPart(false);
      } else if (W.type === 'fog') {
        p.x += p.v; if (p.x - p.r > W.w) p.x = -p.r;
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(170,180,190,${p.a})`); g.addColorStop(1, 'rgba(170,180,190,0)');
        c.fillStyle = g; c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      } else if (W.type === 'dust') {
        p.ph += 0.01; p.y -= p.v; p.x += Math.sin(p.ph) * 0.2;
        if (p.y < -5) { p.y = W.h + 5; p.x = Math.random() * W.w; }
        c.fillStyle = `rgba(255,240,210,${p.a * (0.6 + 0.4 * Math.sin(p.ph * 3))})`;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
      } else {
        p.ph += 0.02; p.y += p.v; p.x += Math.sin(p.ph) * 0.4;
        c.fillStyle = 'rgba(240,244,250,.7)'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
        if (p.y > W.h + 5) W.parts[i] = newPart(false);
      }
    }
    W.raf = requestAnimationFrame(weatherTick);
  }
  E.weather = function (type) {
    if (type === 'none' || type === 'off') type = null;
    cancelAnimationFrame(W.raf);
    W.type = type; E.vis.weather = type;
    weatherResize();
    if (W.ctx) W.ctx.clearRect(0, 0, W.w, W.h);
    if (!type) { snd('weather', null); return; }
    weatherSeed();
    W.raf = requestAnimationFrame(weatherTick);
    snd('weather', type === 'rain' ? 'rain' : type === 'fog' ? null : null);
  };
  function fx(name) {
    const reduce = E.settings.fx === 'off' ? 2 : E.settings.fx === 'reduced' ? 1 : 0;
    const stage = $('#stage');
    switch (name) {
      case 'shake': if (!reduce) { stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); setTimeout(() => stage.classList.remove('shake'), 500); } break;
      case 'flash': if (reduce < 2) { const f = $('#fx .flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); } break;
      case 'glitch': if (!reduce) { const b = $('#bg'); b.classList.remove('glitch'); void b.offsetWidth; b.classList.add('glitch'); setTimeout(() => b.classList.remove('glitch'), 1100); } snd('sfx', 'static_burst'); break;
      case 'pulse': if (reduce < 2) { const p = $('#fx .pulse'); p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); } break;
      case 'blackout': $('#fx .black').classList.add('on'); E.vis.black = true; break;
      case 'clear': $('#fx .black').classList.remove('on'); E.vis.black = false; tint(null); break;
      case 'redout': tint('rgba(150,30,25,.55)'); break;
      case 'greenout': tint('rgba(80,140,70,.5)'); break;
      case 'heartbeat': snd('heartbeat', 72); if (reduce < 2) fx('pulse'); break;
      case 'heartbeat_off': snd('heartbeat', null); break;
      case 'lights_out': snd('sfx', 'lights_out'); tint('rgba(10,14,22,.55)'); break;
      default: console.warn('unknown fx', name);
    }
  }
  function tint(c) { const t = $('#fx .tint'); if (!c) { t.style.opacity = 0; E.vis.tint = null; return; } t.style.backgroundColor = c; t.style.opacity = 1; E.vis.tint = c; }
  E.fx = fx;

  /* ---------- cards and toasts ---------- */
  function card(num, title, when) {
    return new Promise((resolve) => {
      const c = $('#card');
      $('.num', c).textContent = num || '';
      $('.title', c).textContent = title || '';
      $('.when', c).textContent = when || '';
      c.classList.add('on');
      let done = false;
      const finish = () => { if (done) return; done = true; c.classList.remove('on'); c.removeEventListener('click', finish); setTimeout(resolve, 600); };
      c.addEventListener('click', finish);
      setTimeout(finish, E.fastForward() ? 300 : 3600);
    });
  }
  let dateTimer = 0;
  function dateCard(text) {
    const d = $('#datecard'); d.textContent = text; d.classList.add('on');
    clearTimeout(dateTimer); dateTimer = setTimeout(() => d.classList.remove('on'), 4800);
  }
  E.toast = function (text, cls, icon) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.innerHTML = (icon ? I[icon] : '') + '<span></span>';
    t.querySelector('span').textContent = text;
    $('#toasts').appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('on')));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, 3900);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  };

  /* ---------- dialogue box ---------- */
  let typeState = null;
  function portraitSVG(id, expr) {
    const svg = window.KIT && KIT.renderChar(id, expr || 'neutral');
    return svg ? svg.replace('viewBox="0 0 600 900"', 'viewBox="140 66 320 320"').replace('xMidYMax meet', 'xMidYMid slice') : '';
  }
  E.portraitSVG = portraitSVG;
  async function showText(line) {
    const box = $('#dialogue'), plate = $('#nameplate'), port = $('#portrait'), txt = $('#text');
    box.hidden = false;
    box.classList.remove('tape', 'radio');
    txt.className = '';
    let name = null, sub = '', color = null, portrait = null;
    if (line.kind === 'narr') { txt.classList.add('narration'); speaking(null); }
    else if (line.kind === 'gus') { name = 'Gus'; color = DATA.chars.GUS ? DATA.chars.GUS.color : '#8a9a5b'; portrait = ['gus', line.expr || 'neutral']; speaking(null); }
    else if (line.kind === 'think') { txt.classList.add('think'); portrait = ['gus', line.expr || 'thinking']; speaking(null); }
    else if (line.kind === 'tape') { name = line.who ? nameFor(line.who, 'Tape') : 'Tape'; sub = 'cassette'; color = '#4fa3a3'; box.classList.add('tape'); speaking(null); }
    else if (line.kind === 'phone') { name = nameFor(line.who, 'Phone'); sub = 'phone'; color = line.who ? charInfo(line.who.toUpperCase()).color : '#888'; speaking(null); }
    else if (line.kind === 'radio') { name = 'Radio'; sub = 'static'; color = '#a6e08e'; box.classList.add('radio'); speaking(null); }
    else if (line.kind === 'voice') { name = line.who ? nameFor(line.who, '???') : '???'; color = '#a6e08e'; txt.classList.add('think'); speaking(null); }
    else {
      const ci = charInfo(line.key);
      name = ci.name; color = ci.color;
      if (ci.sprite && E.vis.sprites[ci.sprite]) { if (line.expr) E.expr(ci.sprite, line.expr); speaking(ci.sprite); }
      else speaking(null);
      if (ci.sprite) markMet(ci.sprite);
    }
    if (name) { plate.hidden = false; plate.innerHTML = esc(name) + (sub ? `<span class="sub">${esc(sub)}</span>` : ''); plate.style.setProperty('--nc', color || '#c0623a'); }
    else plate.hidden = true;
    if (portrait) { port.hidden = false; const k = portrait.join(':'); if (port.dataset.k !== k) { port.innerHTML = portraitSVG(portrait[0], portrait[1]); port.dataset.k = k; } }
    else port.hidden = true;
    E.lastLines.push({ who: name || (line.kind === 'think' ? 'Gus (thinking)' : ''), text: line.text });
    if (E.lastLines.length > 14) E.lastLines.shift();
    E.log.push({ who: name || (line.kind === 'think' ? 'Gus, thinking' : ''), text: line.text, kind: line.kind });
    if (E.log.length > 400) E.log.splice(0, E.log.length - 400);
    if (line.kind === 'tape') { snd('tape', true); snd('voice', Math.min(6, 1 + line.text.length / 18), line.who === 'june' || line.who === 'girl' ? 'girl' : line.who === 'memere' ? 'old' : 'boy'); }
    await typewrite(txt, markup(line.text));
  }
  function typewrite(el, html) {
    return new Promise((resolve) => {
      const more = $('#more');
      more.classList.remove('on');
      // build char spans preserving tags
      el.innerHTML = '';
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      const chars = [];
      (function walk(src, dst) {
        for (const node of Array.from(src.childNodes)) {
          if (node.nodeType === 3) {
            for (const ch of node.textContent) { const sp = document.createElement('span'); sp.textContent = ch; sp.style.opacity = '0'; dst.appendChild(sp); chars.push(sp); }
          } else if (node.nodeType === 1) { const c = node.cloneNode(false); dst.appendChild(c); walk(node, c); }
        }
      })(tmp, el);
      const instant = E.settings.textSpeed >= 100 || E.fastForward();
      let i = 0, raf = 0, last = performance.now();
      const cps = 18 + E.settings.textSpeed * 1.4;
      const finish = () => { cancelAnimationFrame(raf); for (; i < chars.length; i++) chars[i].style.opacity = ''; E.typing = false; typeState = null; more.classList.add('on'); resolve(); };
      typeState = { finish };
      E.typing = true;
      if (instant) { finish(); return; }
      const step = (now) => {
        const n = Math.max(1, Math.floor(((now - last) / 1000) * cps));
        if (now - last >= 1000 / cps) {
          last = now;
          for (let k = 0; k < n && i < chars.length; k++, i++) {
            chars[i].style.opacity = '';
            const ch = chars[i].textContent;
            if (ch === '.' || ch === '?' || ch === '!' || ch === '—') { last = now + 120; break; }
            if (ch === ',') { last = now + 40; break; }
          }
        }
        if (i >= chars.length) finish(); else raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
  }

  /* ---------- input ---------- */
  let advanceResolve = null;
  function waitAdvance() { return new Promise((r) => { advanceResolve = r; }); }
  function userAdvance() {
    if (E.menuOpen()) return;
    if (E.typing && typeState) { typeState.finish(); return; }
    if (advanceResolve) { const r = advanceResolve; advanceResolve = null; snd('sfx', 'click', { volume: 0.4 }); r(true); }
  }
  E.userAdvance = userAdvance;
  E.fastForward = () => (E.skip || E.ctrlSkip);
  E.menuOpen = () => !!$('.screen.on') || !!$('#map.on');

  /* ---------- the run loop ---------- */
  function lineKey(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function capture() { return { ink: E.story.state.ToJson(), vis: clone(E.vis), eng: clone(E.eng) }; }

  async function run(token) {
    const S = E.story;
    E.running = true;
    try {
      while (token === E.runToken) {
        if (S.canContinue) {
          const pending = capture();
          let raw = S.Continue();
          raw = (raw || '').trim();
          if (!raw) continue;
          if (raw[0] === '@') { await command(raw.slice(1), token); continue; }
          E.snap = pending;
          const line = parseLine(raw);
          if (line.kind !== 'tape') snd('tape', false);
          const key = lineKey(raw);
          const wasSeen = E.seen.has(key);
          if (E.skip && !wasSeen && !E.settings.skipUnseen && !E.ctrlSkip) setSkip(false);
          await showText(line);
          E.seen.add(key);
          if (token !== E.runToken) return;
          await afterLine(raw.length, token);
        } else if (S.currentChoices.length) {
          E.snap = capture();
          const res = await E.choose(S.currentChoices.slice(), token);
          if (token !== E.runToken || !res) return;
          applyChoice(res);
          S.ChooseChoiceIndex(res.index);
          if (res.echo) { await showText(res.echo); if (token !== E.runToken) return; await afterLine(res.echo.text.length, token); }
          if (res.reaction) { await showText(res.reaction); if (token !== E.runToken) return; await afterLine(res.reaction.text.length, token); }
          saveSeen();
        } else { break; }
      }
    } catch (err) {
      console.error(err);
      E.toast('The story hit a snag: ' + (err && err.message ? err.message.slice(0, 120) : err), 'remember');
    } finally { if (token === E.runToken) E.running = false; }
  }
  async function afterLine(len, token) {
    if (E.fastForward()) { await sleep(E.ctrlSkip ? 25 : 45); return; }
    if (E.auto) {
      const p = waitAdvance();
      const t = sleep((900 + len * 32) * E.settings.autoDelay).then(() => { if (advanceResolve) { const r = advanceResolve; advanceResolve = null; r(true); } });
      await Promise.race([p, t]);
      return;
    }
    await waitAdvance();
  }
  function saveSeen() { const arr = Array.from(E.seen); store.set('seen', arr.slice(-6000)); }

  function applyChoice(res) {
    // personality from tone tags
    const tone = res.tone;
    if (tone && TONES[tone] && TONES[tone][2]) {
      const v = TONES[tone][2];
      try { E.story.variablesState[v] = (E.story.variablesState[v] || 0) + 1; } catch (e) { /* var may not exist */ }
    }
    E.log.push({ who: 'You chose', text: res.logText, kind: 'choice' });
  }

  /* ---------- commands ---------- */
  async function command(cmd, token) {
    const sp = cmd.indexOf(' ');
    const name = sp < 0 ? cmd : cmd.slice(0, sp);
    const argStr = sp < 0 ? '' : cmd.slice(sp + 1).trim();
    const a = argStr ? argStr.split(/\s+/) : [];
    switch (name) {
      case 'bg': E.setBg(a[0], a[1] && a[1] !== '-' ? a[1] : null, a[2] && a[2] !== '-' ? a[2] : null, a[3] || 'fade'); break;
      case 'show': E.show(a[0], a[1], a[2], a[3]); break;
      case 'expr': E.expr(a[0], a[1]); break;
      case 'hide': E.hide(a[0] || 'all'); break;
      case 'music': E.vis.music = a[0] === 'stop' ? null : a[0]; snd('music', E.vis.music, { fade: a[1] ? +a[1] : 2 }); break;
      case 'amb': E.vis.amb = a[0] === 'stop' ? null : a[0]; snd('ambience', E.vis.amb, { fade: a[1] ? +a[1] : 2 }); break;
      case 'sfx': if (!E.fastForward()) snd('sfx', a[0], a[1] ? { volume: +a[1] } : undefined); break;
      case 'weather': E.weather(a[0]); break;
      case 'cg': E.cg(a[0], a[1]); break;
      case 'fx': fx(a[0]); break;
      case 'wait': if (!E.fastForward()) { $('#more').classList.remove('on'); await Promise.race([sleep(parseFloat(a[0] || '1') * 1000), new Promise((r) => { advanceResolve = r; })]); advanceResolve = null; } break;
      case 'clear': $('#dialogue').hidden = true; break;
      case 'chapter': {
        const [num, title, when] = argStr.split('::').map((x) => x.trim());
        $('#dialogue').hidden = true;
        E.eng.chapter = { num, title, when };
        snd('sfx', 'typewriter', { volume: 0.5 });
        await card(num, title, when);
        if (token === E.runToken) { const d = E.serialize(); store.set('save.auto', d); const n = (num || '').replace(/\D/g, '') || title; store.set('chapter.' + n, d); const ch = store.get('chapters', []); if (!ch.includes(n)) { ch.push(n); store.set('chapters', ch); } }
        break;
      }
      case 'card': {
        const [num, title, when] = argStr.split('::').map((x) => x.trim());
        $('#dialogue').hidden = true;
        await card(num, title, when);
        break;
      }
      case 'date': dateCard(argStr); break;
      case 'ctx': E.eng.ctx = argStr; break;
      case 'clue': {
        const id = a[0];
        if (!E.eng.clues.includes(id)) { E.eng.clues.push(id); const c = DATA.clues && DATA.clues[id]; E.toast('New clue · ' + (c ? c.title : id), '', 'clue'); snd('sfx', 'clue', { volume: 0.6 }); }
        break;
      }
      case 'tape': {
        const id = a[0];
        if (!E.eng.tapes.includes(id)) { E.eng.tapes.push(id); const t = DATA.tapes && DATA.tapes[id]; E.toast('On tape · ' + (t ? t.title : id), 'tape', 'tape'); }
        break;
      }
      case 'remember': {
        const who = a[0]; const note = a.slice(1).join(' ');
        const nm = (DATA.chars[who.toUpperCase()] || {}).name || who;
        E.toast(nm + ' will remember that.', 'remember', 'heart');
        if (note) { (E.eng.memories[who] = E.eng.memories[who] || []).push(note); }
        break;
      }
      case 'note': { const who = a[0]; const note = a.slice(1).join(' '); if (note) (E.eng.memories[who] = E.eng.memories[who] || []).push(note); break; }
      case 'decide': E.eng.decisions.push(argStr); break;
      case 'theory': if (!E.eng.theories.includes(a[0])) { E.eng.theories.push(a[0]); E.toast('Theory noted in your notebook', '', 'journal'); } break;
      case 'met': markMet(a[0]); break;
      case 'map': E.mapNext = true; E.eng.mapNote = argStr || ''; break;
      case 'save': store.set('save.auto', E.serialize()); break;
      case 'end': $('#dialogue').hidden = true; await sleep(800); if (window.UI) UI.summary(); break;
      default: console.warn('unknown command', cmd);
    }
  }

  /* ---------- choices ---------- */
  function parseTags(tags) {
    const t = { tone: null, flags: {}, map: null, timed: 0, expr: null };
    for (const raw of tags || []) {
      const s = raw.trim();
      if (s.startsWith('timed:')) t.timed = parseFloat(s.slice(6)) || 8;
      else if (s.startsWith('map:')) t.map = s.slice(4);
      else if (s.startsWith('expr:')) t.expr = s.slice(5);
      else if (TONES[s] && !t.tone) t.tone = s;
      else t.flags[s] = true;
    }
    return t;
  }
  const isSay = (text) => /^["“]/.test(text.trim());
  const stripQuotes = (text) => text.trim().replace(/^["“]\s*/, '').replace(/\s*["”]$/, '');
  E.parseTags = parseTags; E.isSay = isSay; E.stripQuotes = stripQuotes;

  E.choose = function (choices, token) {
    const opts = choices.map((c) => ({ index: c.index, text: c.text, ...parseTags(c.tags) }));
    if (E.mapNext && window.UI) { E.mapNext = false; return UI.mapChoose(opts, token).then((r) => r && finishChoice(opts.find((o) => o.index === r.index), null)); }
    return new Promise((resolve) => {
      const box = $('#choices');
      box.innerHTML = '';
      box.hidden = false;
      $('#more').classList.remove('on');
      if (E.skip && !E.ctrlSkip) setSkip(false);
      const timed = Math.max(...opts.map((o) => o.timed || 0));
      const freeOK = opts.length >= 2 && !timed && !opts.some((o) => o.flags.nofree) && window.FREE;
      let timer = 0, done = false;
      const pick = (o, free) => {
        if (done) return; done = true;
        clearInterval(timer);
        box.hidden = true; box.innerHTML = '';
        snd('sfx', 'select', { volume: 0.6 });
        resolve(finishChoice(o, free));
      };
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        const tone = TONES[o.tone];
        const say = isSay(o.text);
        b.innerHTML = (tone ? `<span class="tone" style="--tc:${tone[1]}">${tone[0]}</span>` : '') +
          `<span class="ct${say ? '' : ' act'}"></span>` + (o.flags.clue ? '<span class="badge">clue</span>' : '') + `<span class="key">${i + 1}</span>`;
        b.querySelector('.ct').textContent = say ? '“' + stripQuotes(o.text) + '”' : o.text;
        b.addEventListener('click', () => pick(o));
        b.addEventListener('mouseenter', () => snd('sfx', 'hover', { volume: 0.25 }));
        box.appendChild(b);
        setTimeout(() => b.classList.add('on'), 40 + i * 70);
      });
      if (freeOK) {
        const sayMode = opts.filter((o) => isSay(o.text)).length >= 1;
        const b = document.createElement('button');
        b.className = 'choice free';
        b.innerHTML = `<span class="tone" style="--tc:#e9e1cf">${I.pencil.replace('<svg', '<svg style="width:1.1em;height:1.1em;vertical-align:-.15em"')}</span><span class="ct"></span><span class="key">${opts.length + 1}</span>`;
        b.querySelector('.ct').textContent = sayMode ? 'Say something else…' : 'Do something else…';
        b.addEventListener('click', () => {
          box.hidden = true;
          window.FREE.open({ opts, sayMode, token }).then((fr) => {
            if (!fr) { box.hidden = false; return; }
            pick(opts.find((o) => o.index === fr.index) || opts[0], fr);
          });
        });
        box.appendChild(b);
        setTimeout(() => b.classList.add('on'), 40 + opts.length * 70);
      }
      if (timed) {
        const bar = document.createElement('div'); bar.className = 'timer'; bar.innerHTML = '<i></i>';
        box.prepend(bar);
        const i0 = performance.now(), dur = timed * 1000;
        const fill = bar.querySelector('i');
        timer = setInterval(() => {
          const k = 1 - (performance.now() - i0) / dur;
          fill.style.transform = `scaleX(${Math.max(0, k)})`;
          if (k <= 0) { const d = opts.find((o) => o.flags.default) || opts[opts.length - 1]; pick(d); }
        }, 50);
      }
      E._choiceKeys = (n) => { const o = opts[n]; if (o) pick(o); else if (n === opts.length && freeOK) box.querySelector('.choice.free').click(); };
      setTimeout(() => { const f = box.querySelector('.choice'); if (f && document.activeElement === document.body) f.focus({ preventScroll: true }); }, 60);
    });
  };
  function finishChoice(o, free) {
    E._choiceKeys = null;
    if (!o) return null;
    const say = isSay(o.text);
    const res = { index: o.index, tone: o.tone, logText: say ? '“' + stripQuotes(o.text) + '”' : o.text, echo: null, reaction: null };
    if (free) {
      res.logText = free.gusText || free.input;
      res.tone = o.tone; // the branch's tone still shapes Gus
      res.echo = free.kind === 'do' ? { kind: 'narr', text: free.gusText } : { kind: 'gus', expr: free.gusExpr || TONE_EXPR[o.tone] || 'neutral', text: free.gusText };
      if (free.reaction && free.reaction.text) res.reaction = free.reaction;
      E.eng.freeLog.push({ said: free.gusText, ctx: E.eng.ctx.slice(0, 120) });
      if (E.eng.freeLog.length > 12) E.eng.freeLog.shift();
    } else if (say) {
      res.echo = { kind: 'gus', expr: o.expr || TONE_EXPR[o.tone] || 'neutral', text: stripQuotes(o.text) };
    }
    return res;
  }

  /* ---------- skip / auto ---------- */
  function setSkip(on) { E.skip = on; $('#b-skip').classList.toggle('active', on); if (on && advanceResolve) userAdvance(); }
  function setAuto(on) { E.auto = on; $('#b-auto').classList.toggle('active', on); if (on && advanceResolve && !E.typing) userAdvance(); }
  E.setSkip = setSkip; E.setAuto = setAuto;

  /* ---------- saves ---------- */
  E.serialize = function () {
    const s = E.snap || capture();
    const loc = (E.eng && E.eng.location) || '';
    const last = E.lastLines.length ? E.lastLines[E.lastLines.length - 1] : null;
    return { v: 1, ink: s.ink, vis: s.vis, eng: s.eng, log: E.log.slice(-120), meta: { at: Date.now(), chapter: E.eng.chapter, location: loc, snippet: last ? (last.who ? last.who + ': ' : '') + last.text.slice(0, 110) : '', playtime: Math.round(E.eng.playtime) } };
  };
  E.restore = function (d) {
    if (!d || !d.ink) return false;
    E.runToken++;
    if (advanceResolve) { advanceResolve = null; }
    if (typeState) typeState.finish();
    $('#choices').hidden = true; $('#choices').innerHTML = ''; $('#freeform').hidden = true;
    if (window.UI) UI.closeAll(true);
    try { E.story.state.LoadJson(d.ink); } catch (e) { console.error(e); E.toast('That save could not be read.', 'remember'); return false; }
    E.eng = Object.assign(freshEng(), clone(d.eng || {}));
    E.log = (d.log || []).slice();
    E.lastLines = [];
    const v = d.vis || freshVis();
    E.vis = freshVis();
    $('#sprites').innerHTML = ''; for (const k in spriteEls) delete spriteEls[k];
    $('#bg').innerHTML = '';
    if (v.bg) E.setBg(v.bg.id, v.bg.time, v.bg.variant, 'cut');
    for (const id in v.sprites) { const sp = v.sprites[id]; E.show(id, sp.expr, sp.pos, sp.outfit); }
    E.cg(v.cg ? v.cg.id : null, v.cg ? v.cg.variant : null);
    E.weather(v.weather);
    if (v.black) fx('blackout'); else $('#fx .black').classList.remove('on');
    tint(v.tint || null);
    E.vis.music = v.music; E.vis.amb = v.amb;
    snd('music', v.music || null, { fade: 1.5 }); snd('ambience', v.amb || null, { fade: 1.5 });
    $('#dialogue').hidden = true;
    $('#hud').hidden = false;
    const token = E.runToken;
    setTimeout(() => run(token), 50);
    return true;
  };
  E.newGame = function () {
    E.runToken++;
    E.story = new inkjs.Story(window.STORY_JSON);
    E.story.onError = (msg, type) => { console.warn('ink', msg); };
    E.eng = freshEng(); E.vis = freshVis(); E.log = []; E.lastLines = [];
    $('#sprites').innerHTML = ''; for (const k in spriteEls) delete spriteEls[k];
    $('#bg').innerHTML = ''; E.cg(null); E.weather(null); tint(null);
    $('#fx .black').classList.add('on'); E.vis.black = true;
    $('#hud').hidden = false; $('#dialogue').hidden = true;
    const token = E.runToken;
    run(token);
  };
  E.ensureStory = function () { if (!E.story) { E.story = new inkjs.Story(window.STORY_JSON); E.story.onError = (msg) => console.warn('ink', msg); E.eng = freshEng(); E.vis = freshVis(); } };
  E.v = function (name) { try { const x = E.story.variablesState[name]; return x; } catch (e) { return undefined; } };

  /* ---------- playtime ---------- */
  setInterval(() => { if (E.eng && E.running && !document.hidden && !E.menuOpen()) E.eng.playtime += 1; }, 1000);

  /* ---------- global input wiring ---------- */
  function wire() {
    $('#dialogue').addEventListener('click', (e) => { e.stopPropagation(); userAdvance(); });
    $('#stage').addEventListener('click', (e) => {
      if (e.target.closest('#hud') || e.target.closest('#map') || e.target.closest('#card')) return;
      if (E.hideUI) { E.hideUI = false; document.body.classList.remove('hide-ui'); return; }
      if (!$('#choices').hidden || !$('#freeform').hidden) return;
      userAdvance();
    });
    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (e.key === 'Control') { E.ctrlSkip = true; if (advanceResolve) userAdvance(); return; }
      if (window.UI && UI.onKey(e)) return;
      if (E.menuOpen()) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (document.activeElement && document.activeElement.classList.contains('choice')) return;
        if (!$('#choices').hidden) return;
        e.preventDefault(); userAdvance();
      } else if (/^[1-9]$/.test(e.key) && E._choiceKeys && !$('#choices').hidden) { E._choiceKeys(+e.key - 1); }
      else if (e.key === 'a' || e.key === 'A') setAuto(!E.auto);
      else if (e.key === 'h' || e.key === 'H') { E.hideUI = !E.hideUI; document.body.classList.toggle('hide-ui', E.hideUI); }
    });
    document.addEventListener('keyup', (e) => { if (e.key === 'Control') E.ctrlSkip = false; });
    window.addEventListener('blur', () => { E.ctrlSkip = false; });
    window.addEventListener('resize', () => { if (W.type) { weatherResize(); weatherSeed(); } });
    $('#b-auto').addEventListener('click', (e) => { e.stopPropagation(); setAuto(!E.auto); });
    $('#b-skip').addEventListener('click', (e) => { e.stopPropagation(); setSkip(!E.skip); });
    $('#b-hide').addEventListener('click', (e) => { e.stopPropagation(); E.hideUI = true; document.body.classList.add('hide-ui'); });
    for (const [id, ic] of [['b-journal', 'journal'], ['b-log', 'log'], ['b-save', 'save'], ['b-auto', 'auto'], ['b-skip', 'skip'], ['b-hide', 'hide'], ['b-menu', 'menu']]) $('#' + id).innerHTML = I[ic];
    // film grain texture
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    $('#grade .grain').style.backgroundImage = `url(${c.toDataURL()})`;
    document.documentElement.style.setProperty('--fs', E.settings.fontScale);
    document.body.classList.toggle('reduce-fx', E.settings.fx !== 'full');
  }
  E.applyAudioSettings = function () {
    const s = E.settings;
    snd('setVolume', 'master', s.master); snd('setVolume', 'music', s.music); snd('setVolume', 'ambience', s.ambience); snd('setVolume', 'sfx', s.sfx);
  };
  E.saveSettings = function () { store.set('settings', E.settings); document.documentElement.style.setProperty('--fs', E.settings.fontScale); document.body.classList.toggle('reduce-fx', E.settings.fx !== 'full'); E.applyAudioSettings(); };

  /* ---------- boot ---------- */
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function whenInk(fn, tries = 0) {
    if (window.inkjs && window.STORY_JSON) return fn();
    if (tries === 15 && !window.inkjs) { const s = document.createElement('script'); s.src = 'js/vendor/ink.js'; document.head.appendChild(s); }
    if (tries > 120) { document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;left:16px;bottom:16px;color:#e9e1cf">The story engine could not load. Check your connection and reload.</p>'); return; }
    setTimeout(() => whenInk(fn, tries + 1), 100);
  }
  ready(() => {
    wire();
    whenInk(() => {
      const start = (data) => {
        if (window.UI) UI.boot();
        if (data && data.save && data.save.ink) { E.ensureStory(); UI.hideTitle(); E.restore(data.save); }
      };
      try {
        const hot = window.claude && window.claude.hot;
        if (hot && hot.snapshot) hot.snapshot(() => (E.story && E.eng && E.running ? { save: E.serialize() } : {}));
        if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
      } catch (e) { start({}); }
    });
  });
})();
