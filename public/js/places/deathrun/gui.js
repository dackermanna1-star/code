// The deathrun's screen: lapis and gold. The round bar at the top (which
// hall, the time, runners left, who the Pharaoh is), big banners, the feed
// of deaths, the Pharaoh's traps and his button prompt, the spectator bar,
// the camp board between rounds and the results.
const CSS = `
.dr{position:absolute;inset:0;pointer-events:none;font-family:Georgia,'Times New Roman',serif;color:#f4e6c4;z-index:6}
.dr *{box-sizing:border-box}
.dr .gold{background:linear-gradient(180deg,#fff2b8 0%,#f2c75c 45%,#b9862a 55%,#f6d77a 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.dr .bar{position:absolute;left:50%;top:14px;transform:translateX(-50%);display:flex;align-items:stretch;gap:0;background:linear-gradient(180deg,rgba(18,30,72,.88),rgba(10,16,40,.88));border:2px solid #c99a2e;border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,220,140,.25);min-width:520px}
.dr .bar>div{padding:6px 16px;text-align:center;border-right:1px solid rgba(201,154,46,.45)}
.dr .bar>div:last-child{border-right:0}
.dr .bar .lbl{font-size:10px;letter-spacing:3px;color:#c9a96a;text-transform:uppercase}
.dr .bar .val{font-size:20px;font-weight:bold;letter-spacing:1px;text-shadow:0 2px 2px #000}
.dr .bar .hall{min-width:210px}
.dr .bar .hall .val{font-size:17px}
.dr .bar .time .val{font-variant-numeric:tabular-nums;min-width:62px}
.dr .bar .time.low .val{color:#ff6a4a}
.dr .prog{position:absolute;left:50%;top:78px;transform:translateX(-50%);width:520px;height:8px;background:rgba(10,16,40,.75);border:1px solid #c99a2e;border-radius:4px;overflow:visible}
.dr .prog i{position:absolute;top:-1px;bottom:-1px;width:1px;background:rgba(201,154,46,.6)}
.dr .prog b{position:absolute;top:-4px;width:12px;height:14px;margin-left:-6px;border-radius:3px;border:1px solid #000;box-shadow:0 1px 3px #000}
.dr .prog b.me{height:18px;top:-6px;border:2px solid #fff}
.dr .banner{position:absolute;left:0;right:0;top:22%;text-align:center;opacity:0;transition:opacity .6s}
.dr .banner .s{font-size:16px;letter-spacing:9px;color:#e8d4a4;text-shadow:0 2px 3px #000;text-transform:uppercase}
.dr .banner .t{font-size:64px;font-weight:bold;letter-spacing:6px;line-height:1.1;text-transform:uppercase;filter:drop-shadow(0 4px 0 #2a1806) drop-shadow(0 0 22px rgba(0,0,0,.6))}
.dr .banner .d{margin-top:6px;font-size:16px;color:#f1e3bf;text-shadow:0 2px 3px #000}
.dr .feed{position:absolute;right:14px;top:120px;width:330px;display:flex;flex-direction:column;gap:4px;align-items:flex-end}
.dr .feed div{background:rgba(10,16,40,.78);border-left:3px solid #b8352b;padding:4px 10px;font-size:13px;border-radius:2px;animation:drin .3s ease-out;text-shadow:0 1px 1px #000}
.dr .feed div.ok{border-left-color:#d9a82e}
@keyframes drin{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
.dr .traps{position:absolute;left:14px;top:120px;width:250px;background:linear-gradient(180deg,rgba(18,30,72,.85),rgba(10,16,40,.85));border:2px solid #c99a2e;border-radius:4px;padding:8px 10px;display:none}
.dr .traps h3{margin:0 0 6px;font-size:13px;letter-spacing:3px;text-align:center;text-transform:uppercase}
.dr .traps .hn{font-size:11px;color:#c9a96a;letter-spacing:2px;text-transform:uppercase;margin:6px 0 2px}
.dr .traps .tr{display:flex;align-items:center;gap:7px;font-size:13px;padding:2px 0}
.dr .traps .tr i{width:10px;height:10px;border-radius:50%;background:#ff4a2a;box-shadow:0 0 6px #ff4a2a;flex:none}
.dr .traps .tr.used{color:#7f7663;text-decoration:line-through}
.dr .traps .tr.used i{background:#444;box-shadow:none}
.dr .traps .tr.next{color:#ffe48a}
.dr .prompt{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(10,16,40,.86);border:2px solid #c99a2e;border-radius:4px;padding:8px 18px;font-size:18px;display:none;white-space:nowrap;text-shadow:0 1px 2px #000}
.dr .prompt kbd{display:inline-block;background:#f2c75c;color:#2a1806;border-radius:3px;padding:0 7px;margin-right:8px;font-family:Arial,sans-serif;font-weight:bold}
.dr .spec{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);background:rgba(10,16,40,.82);border:1px solid #c99a2e;border-radius:4px;padding:6px 16px;font-size:15px;display:none;white-space:nowrap}
.dr .spec kbd{background:#f2c75c;color:#2a1806;border-radius:3px;padding:0 6px;font-family:Arial,sans-serif;font-weight:bold;margin:0 4px}
.dr .dead{position:absolute;left:0;right:0;top:42%;text-align:center;font-size:24px;font-weight:bold;color:#ffb39a;text-shadow:0 2px 4px #000;display:none;letter-spacing:1px}
.dr .camp{position:absolute;left:50%;top:96px;transform:translateX(-50%);text-align:center;display:none;font-size:15px;color:#f1e3bf;text-shadow:0 1px 3px #000}
.dr .camp kbd{background:#f2c75c;color:#2a1806;border-radius:3px;padding:0 6px;font-family:Arial,sans-serif;font-weight:bold}
.dr .camp .vol{margin-top:6px;font-size:13px;color:#c9a96a}
.dr .camp .vol.on{color:#ffe48a}
.dr .res{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:480px;background:linear-gradient(180deg,rgba(18,30,72,.92),rgba(10,16,40,.92));border:2px solid #c99a2e;border-radius:6px;padding:14px 20px;display:none;box-shadow:0 0 40px rgba(0,0,0,.6)}
.dr .res h2{margin:0 0 4px;text-align:center;font-size:30px;letter-spacing:4px;text-transform:uppercase}
.dr .res .sub{text-align:center;font-size:13px;color:#c9a96a;margin-bottom:10px;letter-spacing:2px;text-transform:uppercase}
.dr .res table{width:100%;border-collapse:collapse;font-size:14px}
.dr .res td{padding:3px 6px;border-bottom:1px solid rgba(201,154,46,.25)}
.dr .res td:last-child{text-align:right;color:#f2c75c}
.dr .res tr.me td{color:#fff;font-weight:bold}
.dr .help{position:absolute;right:14px;bottom:100px;font-size:12px;text-align:right;color:#efe1bd;text-shadow:0 1px 2px #000;line-height:1.6;opacity:.9}
.dr .eye{position:absolute;left:50%;top:104px;transform:translateX(-50%);font-size:20px;font-weight:bold;letter-spacing:3px;display:none;text-shadow:0 0 12px rgba(255,180,40,.8)}
.dr .flash{position:absolute;inset:0;background:radial-gradient(circle,rgba(255,240,180,.0) 0%,rgba(255,200,80,.0) 100%);opacity:0;transition:opacity .25s}
`;

export class Gui {
  constructor(root) {
    if (!document.getElementById('dr-css')) { const st = document.createElement('style'); st.id = 'dr-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = document.createElement('div'); el.className = 'dr';
    el.innerHTML = `
      <div class="bar"><div class="hall"><div class="lbl">Hall</div><div class="val gold"></div></div><div class="time"><div class="lbl">Time</div><div class="val"></div></div><div class="run"><div class="lbl">Runners</div><div class="val"></div></div><div class="ph"><div class="lbl">The Pharaoh</div><div class="val gold"></div></div></div>
      <div class="prog"></div>
      <div class="eye gold"></div>
      <div class="camp"><div class="msg"></div><div class="vol"></div></div>
      <div class="banner"><div class="s"></div><div class="t gold"></div><div class="d"></div></div>
      <div class="feed"></div>
      <div class="traps"><h3 class="gold">Your Traps</h3><div class="list"></div></div>
      <div class="prompt"></div>
      <div class="spec"></div>
      <div class="dead"></div>
      <div class="res"></div>
      <div class="help">WASD move · Space jump · right-drag to look<br>Pharaoh: walk up to a scarab and press <b>E</b><br>Dead: <b>Q</b>/<b>E</b> watch someone else · <b>P</b> volunteer as Pharaoh</div>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    Object.assign(this, {
      el, hall: q('.hall .val'), timeBox: q('.time'), time: q('.time .val'), run: q('.run .val'), ph: q('.ph .val'), prog: q('.prog'),
      eye: q('.eye'), camp: q('.camp'), campMsg: q('.camp .msg'), vol: q('.camp .vol'),
      banner: q('.banner'), feedEl: q('.feed'), traps: q('.traps'), trapList: q('.traps .list'), prompt: q('.prompt'), spec: q('.spec'), dead: q('.dead'), res: q('.res'), help: q('.help'),
    });
    this.cache = {};
    setTimeout(() => { this.help.style.display = 'none'; }, 45000);
  }
  set(key, node, html) { if (this.cache[key] !== html) { this.cache[key] = html; node.innerHTML = html; } }
  show(node, on) { const v = on ? 'block' : 'none'; if (node.style.display !== v) node.style.display = v; }

  top({ hall, time, low, runners, pharaoh }) {
    this.set('hall', this.hall, hall);
    this.set('time', this.time, time);
    this.timeBox.classList.toggle('low', !!low);
    this.set('run', this.run, runners);
    this.set('ph', this.ph, pharaoh);
  }
  /** The progress line: hall marks and a pip for each runner (0..1). */
  progress(halls, pips) {
    if (!this._marks) { this._marks = true; this.prog.innerHTML = halls.map((_, i) => `<i style="left:${(i / halls.length) * 100}%"></i>`).join('') + '<span class="pips"></span>'; this._pips = this.prog.querySelector('.pips'); }
    const html = pips.map((p) => `<b class="${p.me ? 'me' : ''}" style="left:${(p.k * 100).toFixed(1)}%;background:${p.color};opacity:${p.dead ? 0.35 : 1}" title="${p.name}"></b>`).join('');
    this.set('pips', this._pips, html);
  }
  bannerShow(title, sub = '', desc = '', secs = 3.2) {
    this.banner.querySelector('.s').textContent = sub;
    this.banner.querySelector('.t').textContent = title;
    this.banner.querySelector('.d').innerHTML = desc;
    this.banner.style.opacity = 1;
    clearTimeout(this._bt); this._bt = setTimeout(() => { this.banner.style.opacity = 0; }, secs * 1000);
  }
  feed(html, ok = false) {
    const d = document.createElement('div'); d.innerHTML = html; if (ok) d.className = 'ok';
    this.feedEl.prepend(d);
    while (this.feedEl.children.length > 6) this.feedEl.lastChild.remove();
    setTimeout(() => d.remove(), 9000);
  }
  trapsPanel(on, halls, cur) {
    this.show(this.traps, on);
    if (!on) return;
    let html = '';
    for (const h of halls) {
      if (!h || Math.abs(h.i - cur) > 1) continue;
      html += `<div class="hn">${h.i + 1}. ${h.name}</div>`;
      for (const t of h.buttons) html += `<div class="tr ${t.used ? 'used' : ''} ${t.next ? 'next' : ''}"><i></i>${t.name}</div>`;
    }
    this.set('traps', this.trapList, html);
  }
  promptShow(html) { this.set('prompt', this.prompt, html || ''); this.show(this.prompt, !!html); }
  specShow(name) { this.set('spec', this.spec, name ? `<kbd>Q</kbd> Watching <b>${name}</b> <kbd>E</kbd>` : ''); this.show(this.spec, !!name); }
  deadShow(text) { this.set('dead', this.dead, text || ''); this.show(this.dead, !!text); }
  campShow(msg, vol) {
    this.show(this.camp, !!msg);
    if (!msg) return;
    this.set('camp', this.campMsg, msg);
    this.set('vol', this.vol, vol ? '&#9733; You volunteered to be the next Pharaoh (<kbd>P</kbd> to cancel)' : 'Press <kbd>P</kbd> to volunteer as the next Pharaoh');
    this.vol.classList.toggle('on', !!vol);
  }
  eyeShow(text) { this.set('eye', this.eye, text || ''); this.show(this.eye, !!text); }
  results(title, sub, rows) {
    if (!title) { this.show(this.res, false); return; }
    this.res.innerHTML = `<h2 class="gold">${title}</h2><div class="sub">${sub}</div><table>${rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td>${r.what}</td><td>${r.gold}</td></tr>`).join('')}</table>`;
    this.show(this.res, true);
  }
}
