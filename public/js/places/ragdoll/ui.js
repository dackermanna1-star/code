// The Olympics on screen: the event bar at the top, the big intro card for
// each event, the countdown, the power meter, your score with the hits
// popping up next to it, words floating over the bodies ("CRACK!"), the live
// leaderboard, the results with their medals, the medal table and the
// ceremony. All HTML over the canvas.
import * as THREE from 'three';

const CSS = `
.rgo{position:absolute;inset:0;pointer-events:none;font-family:Arial,Helvetica,sans-serif;color:#fff;z-index:6;overflow:hidden;user-select:none}
.rbx-gui.ro-mode .rbx-health,.rbx-gui.ro-mode .rbx-report,.rbx-gui.ro-mode .rbx-backpack{display:none!important}
.rgo .bar{position:absolute;left:50%;top:26px;transform:translateX(-50%);display:flex;align-items:stretch;background:rgba(10,18,40,.78);border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.35);overflow:hidden;border:1px solid rgba(255,255,255,.14);min-width:380px}
.rgo .bar .ic{width:54px;display:flex;align-items:center;justify-content:center;font-size:28px;background:var(--ec,#ffcf4a);color:#10131c}
.rgo .bar .tx{padding:6px 16px 7px;flex:1}
.rgo .bar .nm{font:900 19px 'Arial Black',Arial;letter-spacing:1px;text-transform:uppercase;white-space:nowrap}
.rgo .bar .st{font-size:12px;color:#c9d3e6;margin-top:1px;letter-spacing:.4px;white-space:nowrap}
.rgo .bar .tm{display:flex;align-items:center;justify-content:center;padding:0 14px;font:900 22px 'Arial Black',Arial;background:rgba(255,255,255,.08);min-width:56px}
.rgo .bar .tm.urgent{color:#ff6a4a}
.rgo .rings{display:inline-flex;gap:2px;margin-right:6px;vertical-align:1px}
.rgo .rings i{width:9px;height:9px;border-radius:50%;border:2px solid;display:block}
.rgo .card{position:absolute;left:50%;top:17%;transform:translate(-50%,0) scale(.96);text-align:center;opacity:0;transition:opacity .45s,transform .45s;min-width:520px}
.rgo .card.on{opacity:1;transform:translate(-50%,0) scale(1)}
.rgo .card .n{font:bold 14px Arial;letter-spacing:6px;color:#ffe08a;text-shadow:0 2px 3px rgba(0,0,0,.8)}
.rgo .card .t{font:900 64px 'Arial Black',Arial;letter-spacing:1px;line-height:1.05;-webkit-text-stroke:2px #0b1430;text-shadow:0 5px 0 #0b1430,0 0 40px rgba(0,0,0,.45);margin:4px 0}
.rgo .card .w{font:bold 17px Arial;color:#e8eefc;text-shadow:0 2px 3px rgba(0,0,0,.8);letter-spacing:1px}
.rgo .card .d{font:bold 19px Arial;text-shadow:0 2px 4px rgba(0,0,0,.9);margin-top:10px}
.rgo .card .k{display:inline-block;margin-top:14px;background:rgba(10,18,40,.8);border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px 16px;font-size:14px;line-height:1.7;text-align:left}
.rgo .card .k b{display:inline-block;min-width:22px;padding:0 6px;margin-right:6px;border-radius:4px;background:#fff;color:#111;text-align:center;font-size:12px}
.rgo .count{position:absolute;left:0;right:0;top:34%;text-align:center;font:900 120px 'Arial Black',Arial;-webkit-text-stroke:3px #0b1430;text-shadow:0 6px 0 #0b1430;opacity:0}
.rgo .count.pop{animation:rgoPop .9s ease-out}
@keyframes rgoPop{0%{opacity:0;transform:scale(1.8)}15%{opacity:1;transform:scale(1)}70%{opacity:1}100%{opacity:0;transform:scale(.9)}}
.rgo .meter{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);width:420px;display:none}
.rgo .meter .lbl{font:bold 13px Arial;letter-spacing:3px;text-align:center;margin-bottom:5px;text-shadow:0 1px 3px #000}
.rgo .meter .tr{position:relative;height:22px;border-radius:12px;background:rgba(10,18,40,.75);border:2px solid rgba(255,255,255,.6);overflow:hidden}
.rgo .meter .fl{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#3ad16a,#f7d21e 60%,#ff7a1a 85%,#ff2a2a)}
.rgo .meter .sw{position:absolute;top:0;bottom:0;left:88%;width:8%;border-left:2px dashed rgba(255,255,255,.9);border-right:2px dashed rgba(255,255,255,.9);background:rgba(255,255,255,.15)}
.rgo .meter .nd{position:absolute;top:-4px;bottom:-4px;width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 6px #fff}
.rgo .hint{position:absolute;left:50%;bottom:60px;transform:translateX(-50%);font:bold 15px Arial;text-shadow:0 2px 4px #000,0 0 2px #000;white-space:nowrap;text-align:center;line-height:1.6}
.rgo .hint b{display:inline-block;min-width:20px;padding:0 6px;border-radius:4px;background:rgba(255,255,255,.92);color:#111;font-size:12px;margin:0 3px;text-shadow:none}
.rgo .mine{position:absolute;right:22px;top:150px;text-align:right;display:none}
.rgo .mine .l{font:bold 12px Arial;letter-spacing:3px;color:#ffe08a;text-shadow:0 1px 3px #000}
.rgo .mine .v{font:900 46px 'Arial Black',Arial;-webkit-text-stroke:1.5px #0b1430;text-shadow:0 4px 0 #0b1430;line-height:1}
.rgo .mine .u{font-size:16px;color:#dfe6f5;-webkit-text-stroke:0;text-shadow:0 2px 3px #000}
.rgo .mine .cb{font:900 20px 'Arial Black',Arial;color:#ffcf4a;-webkit-text-stroke:1px #000;height:26px}
.rgo .mine .log{margin-top:6px;font:bold 14px Arial;line-height:1.45;text-shadow:0 2px 3px #000}
.rgo .mine .log div{animation:rgoIn .25s ease-out}
.rgo .mine .log div.big{color:#ffcf4a;font-size:17px}
.rgo .mine .log div.brk{color:#ff7a6a;font-size:17px}
@keyframes rgoIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
.rgo .live{position:absolute;left:14px;top:150px;background:rgba(10,18,40,.66);border-radius:8px;padding:8px 10px;font-size:13px;min-width:190px;display:none;border:1px solid rgba(255,255,255,.1)}
.rgo .live h4{margin:0 0 4px;font:bold 11px Arial;letter-spacing:2px;color:#ffe08a}
.rgo .live table{border-collapse:collapse;width:100%}
.rgo .live td{padding:1px 4px;white-space:nowrap}
.rgo .live td.s{text-align:right;font-weight:bold}
.rgo .live tr.me td{color:#7cf0ff}
.rgo .live tr.dn td{opacity:.75}
.rgo .res{position:absolute;left:50%;top:150px;transform:translateX(-50%);background:rgba(8,14,32,.9);border-radius:14px;padding:16px 22px 18px;min-width:470px;display:none;box-shadow:0 10px 40px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14)}
.rgo .res.side{left:16px;top:150px;transform:none;min-width:0;width:360px;padding:12px 14px 14px}
.rgo .res.side h2{font-size:20px}
.rgo .res.side td{font-size:13px;padding:3px 6px}
.rgo .res h2{margin:0;font:900 28px 'Arial Black',Arial;text-align:center;letter-spacing:1px}
.rgo .res h3{margin:2px 0 10px;font:bold 12px Arial;letter-spacing:4px;text-align:center;color:#ffe08a}
.rgo .res table{border-collapse:collapse;width:100%}
.rgo .res td{padding:5px 8px;font-size:15px;border-top:1px solid rgba(255,255,255,.07)}
.rgo .res td.rk{width:34px;text-align:center;font:900 16px 'Arial Black',Arial}
.rgo .res td.sc{text-align:right;font-weight:bold}
.rgo .res td.pt{text-align:right;color:#9fb0d0;font-size:13px;width:52px}
.rgo .res tr.me td{background:rgba(124,240,255,.12);color:#9ff4ff}
.rgo .md{display:inline-block;width:22px;height:22px;border-radius:50%;line-height:22px;font:900 12px Arial;color:#3a2a00;box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),0 1px 3px rgba(0,0,0,.6)}
.rgo .md.g{background:radial-gradient(circle at 35% 30%,#fff6c0,#f2c14e 45%,#b8861a)}
.rgo .md.s{background:radial-gradient(circle at 35% 30%,#ffffff,#cfd5dc 45%,#8a939c);color:#2a3036}
.rgo .md.b{background:radial-gradient(circle at 35% 30%,#ffd6b0,#c0773a 45%,#7a4416);color:#2a1406}
.rgo .toast{position:absolute;left:50%;top:92px;transform:translateX(-50%);background:rgba(10,18,40,.85);border:2px solid #ffcf4a;border-radius:8px;padding:6px 18px;font:bold 16px Arial;white-space:nowrap;opacity:0;transition:opacity .35s;text-shadow:0 1px 2px #000}
.rgo .pops{position:absolute;inset:0}
.rgo .pop{position:absolute;transform:translate(-50%,-50%);font:900 22px 'Arial Black',Arial;-webkit-text-stroke:1.2px #000;text-shadow:0 3px 0 rgba(0,0,0,.6);white-space:nowrap;pointer-events:none}
.rgo .flash{position:absolute;inset:0;background:#fff;opacity:0}
.rgo .vig{position:absolute;inset:0;opacity:0;transition:opacity .3s;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(10,20,60,.55))}
.rgo .judges{position:absolute;left:50%;top:58%;transform:translateX(-50%);display:none;gap:10px}
.rgo .judges div{background:#fff;color:#111;font:900 28px 'Arial Black',Arial;padding:8px 12px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.45);min-width:58px;text-align:center;animation:rgoCard .4s ease-out backwards}
@keyframes rgoCard{from{opacity:0;transform:translateY(30px) rotateX(70deg)}to{opacity:1;transform:none}}
.rgo .help{position:absolute;right:14px;bottom:14px;font-size:12px;color:#e8eefc;text-shadow:0 1px 2px #000;text-align:right;line-height:1.6}
.rgo .wait{position:absolute;left:50%;top:44%;transform:translateX(-50%);font:bold 20px Arial;text-shadow:0 2px 4px #000;display:none;text-align:center}
.rgo .wait small{display:block;font-size:14px;color:#cfd8ea;margin-top:3px}
`;

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const RINGS = '<span class="rings"><i style="border-color:#0081c8"></i><i style="border-color:#fcb131"></i><i style="border-color:#111"></i><i style="border-color:#00a651"></i><i style="border-color:#ee334e"></i></span>';
export function medal(rank) { return rank === 1 ? '<span class="md g">1</span>' : rank === 2 ? '<span class="md s">2</span>' : rank === 3 ? '<span class="md b">3</span>' : ''; }

export class UI {
  constructor(root) {
    if (!document.getElementById('rgo-css')) { const st = document.createElement('style'); st.id = 'rgo-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = document.createElement('div'); el.className = 'rgo';
    el.innerHTML = `<div class="vig"></div><div class="flash"></div><div class="pops"></div>
      <div class="bar"><div class="ic">🏅</div><div class="tx"><div class="nm"></div><div class="st"></div></div><div class="tm"></div></div>
      <div class="card"><div class="n"></div><div class="t"></div><div class="w"></div><div class="d"></div><div class="k"></div></div>
      <div class="count"></div>
      <div class="meter"><div class="lbl">POWER</div><div class="tr"><div class="fl"></div><div class="sw"></div><div class="nd"></div></div></div>
      <div class="hint"></div>
      <div class="mine"><div class="l">YOUR SCORE</div><div class="v">0</div><div class="cb"></div><div class="log"></div></div>
      <div class="live"><h4>LEADERBOARD</h4><table></table></div>
      <div class="res"><h2></h2><h3></h3><table></table></div>
      <div class="judges"></div>
      <div class="toast"></div>
      <div class="wait"></div>
      <div class="help">WASD move · Space jump · right-drag look · I/O zoom<br>R ragdoll yourself (between events) · Tab standings</div>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    Object.assign(this, {
      el, bar: q('.bar'), barIc: q('.bar .ic'), barNm: q('.bar .nm'), barSt: q('.bar .st'), barTm: q('.bar .tm'),
      cardEl: q('.card'), countEl: q('.count'), meterEl: q('.meter'), meterFill: q('.meter .fl'), meterNeedle: q('.meter .nd'), meterLbl: q('.meter .lbl'), meterSweet: q('.meter .sw'),
      hintEl: q('.hint'), meEl: q('.mine'), meV: q('.mine .v'), meCb: q('.mine .cb'), meLog: q('.mine .log'), meL: q('.mine .l'),
      liveEl: q('.live'), liveT: q('.live table'), liveH: q('.live h4'), resEl: q('.res'), toastEl: q('.toast'), pops: q('.pops'), flashEl: q('.flash'), vigEl: q('.vig'),
      judgesEl: q('.judges'), waitEl: q('.wait'), helpEl: q('.help'),
    });
    this.popList = [];
    this.flashA = 0;
    this._c = {};
    setTimeout(() => { this.helpEl.style.opacity = 0.55; }, 30000);
  }
  _set(k, node, html) { if (this._c[k] !== html) { this._c[k] = html; node.innerHTML = html; } }

  // --- the event bar ----------------------------------------------------------------------------------------------------
  setBar(icon, name, sub, color, timer = '', urgent = false) {
    this._set('bi', this.barIc, icon); this._set('bn', this.barNm, name); this._set('bs', this.barSt, sub); this._set('bt', this.barTm, timer);
    this.barTm.style.display = timer === '' ? 'none' : 'flex';
    this.barTm.classList.toggle('urgent', !!urgent);
    this.bar.style.setProperty('--ec', color || '#ffcf4a');
  }

  // --- the intro card --------------------------------------------------------------------------------------------------------
  card(o) {
    if (!o) { this.cardEl.classList.remove('on'); return; }
    const q = (s) => this.cardEl.querySelector(s);
    q('.n').textContent = o.n || ''; q('.t').textContent = o.title; q('.t').style.color = o.color || '#fff';
    q('.w').innerHTML = o.where ? `${RINGS}${esc(o.where)}` : ''; q('.d').textContent = o.desc || '';
    q('.k').innerHTML = (o.keys || []).map(([k, t]) => `<div>${k.split(' ').map((x) => `<b>${esc(x)}</b>`).join('')} ${esc(t)}</div>`).join('');
    q('.k').style.display = o.keys?.length ? 'inline-block' : 'none';
    this.cardEl.classList.add('on');
    clearTimeout(this._ct); if (o.secs) this._ct = setTimeout(() => this.cardEl.classList.remove('on'), o.secs * 1000);
  }
  count(text, color = '#fff') {
    this.countEl.textContent = text; this.countEl.style.color = color;
    this.countEl.classList.remove('pop'); void this.countEl.offsetWidth; this.countEl.classList.add('pop');
  }

  // --- the power meter -----------------------------------------------------------------------------------------------------------
  meter(v, label = 'POWER', sweet = true) {
    if (v == null) { this.meterEl.style.display = 'none'; return; }
    this.meterEl.style.display = 'block';
    this.meterFill.style.width = `${(v * 100).toFixed(1)}%`;
    this.meterNeedle.style.left = `${(v * 100).toFixed(1)}%`;
    this._set('ml', this.meterLbl, label);
    this.meterSweet.style.display = sweet ? 'block' : 'none';
  }
  hint(html) { this._set('hint', this.hintEl, html || ''); }
  wait(text, sub) { this.waitEl.style.display = text ? 'block' : 'none'; this._set('wait', this.waitEl, text ? `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}` : ''); }

  // --- your score ------------------------------------------------------------------------------------------------------------------
  myScore(v, unit = '', label = 'YOUR SCORE') {
    if (v == null) { this.meEl.style.display = 'none'; this.meLog.innerHTML = ''; this._c.mv = null; return; }
    this.meEl.style.display = 'block';
    this._set('ml', this.meL, label);
    this._set('mv', this.meV, `${typeof v === 'number' ? fmtInt(v) : esc(v)}${unit ? `<span class="u"> ${esc(unit)}</span>` : ''}`);
  }
  combo(m) { this._set('cb', this.meCb, m > 1.05 ? `COMBO ×${m.toFixed(1)}` : ''); }
  log(text, cls = '') {
    const d = document.createElement('div'); d.className = cls; d.textContent = text;
    this.meLog.prepend(d);
    while (this.meLog.children.length > 6) this.meLog.lastChild.remove();
    setTimeout(() => { d.style.transition = 'opacity .6s'; d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, 2600);
  }

  // --- words over the action -------------------------------------------------------------------------------------------------------------
  pop(text, pos, color = '#fff', size = 22, secs = 1.1) {
    const d = document.createElement('div'); d.className = 'pop'; d.textContent = text; d.style.color = color; d.style.fontSize = size + 'px';
    this.pops.appendChild(d);
    this.popList.push({ d, pos: pos.clone(), t: 0, secs, rise: 4 + Math.random() * 2, dx: (Math.random() - 0.5) * 30 });
    if (this.popList.length > 24) { const o = this.popList.shift(); o.d.remove(); }
  }

  // --- tables ----------------------------------------------------------------------------------------------------------------------------------
  live(rows, title = 'LEADERBOARD') {
    if (!rows) { this.liveEl.style.display = 'none'; return; }
    this.liveEl.style.display = 'block';
    this._set('lh', this.liveH, title);
    this._set('lt', this.liveT, rows.map((r, i) => `<tr class="${r.me ? 'me' : ''} ${r.done ? 'dn' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="s">${esc(r.score)}</td></tr>`).join(''));
  }
  results(o) {
    if (!o) { this.resEl.style.display = 'none'; return; }
    this.resEl.style.display = 'block';
    this.resEl.classList.toggle('side', !!o.side);
    this.resEl.querySelector('h2').innerHTML = o.title;
    this.resEl.querySelector('h3').textContent = o.sub || '';
    this.resEl.querySelector('table').innerHTML = o.rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td class="rk">${r.rank <= 3 ? medal(r.rank) : r.rank}</td><td>${esc(r.name)}</td><td class="sc">${esc(r.score)}</td>${r.pts != null ? `<td class="pt">${esc(r.pts)}</td>` : ''}</tr>`).join('');
  }
  judges(scores) {
    if (!scores) { this.judgesEl.style.display = 'none'; return; }
    this.judgesEl.style.display = 'flex';
    this.judgesEl.innerHTML = scores.map((s, i) => `<div style="animation-delay:${i * 0.12}s">${s.toFixed(1)}</div>`).join('');
  }
  toast(html, color = '#ffcf4a', secs = 2.6) {
    this.toastEl.innerHTML = html; this.toastEl.style.borderColor = color; this.toastEl.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { this.toastEl.style.opacity = 0; }, secs * 1000);
  }
  flash(a = 0.6, color = '#fff') { this.flashEl.style.background = color; this.flashA = Math.max(this.flashA, a); }
  vignette(on) { this.vigEl.style.opacity = on ? 1 : 0; }

  update(dt, camera, w, h) {
    if (this.flashA > 0) { this.flashA = Math.max(0, this.flashA - dt * 2.5); this.flashEl.style.opacity = this.flashA; }
    const v = new THREE.Vector3();
    for (let i = this.popList.length - 1; i >= 0; i--) {
      const p = this.popList[i];
      p.t += dt;
      const k = p.t / p.secs;
      if (k >= 1) { p.d.remove(); this.popList.splice(i, 1); continue; }
      v.copy(p.pos); v.y += p.rise * k;
      v.project(camera);
      if (v.z > 1 || v.z < -1) { p.d.style.display = 'none'; continue; }
      p.d.style.display = 'block';
      const s = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      p.d.style.left = `${(v.x * 0.5 + 0.5) * w + p.dx * k}px`; p.d.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
      p.d.style.transform = `translate(-50%,-50%) scale(${s.toFixed(2)})`;
      p.d.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  }
}
