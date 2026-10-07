// What's on the screen: the floor indicator (amber LEDs) with the floor's
// name and how long until the doors close, a banner when the doors open,
// little toasts for bonuses, speech bubbles over people's heads, the
// end-of-ride summary, and screen tints (gas, water, a flash).
import * as THREE from 'three';

const CSS = `
.elv{position:absolute;inset:0;pointer-events:none;font-family:Arial,Helvetica,sans-serif;z-index:6;color:#fff;overflow:hidden}
.elv .ind{position:absolute;left:50%;top:30px;transform:translateX(-50%);display:flex;align-items:stretch;background:linear-gradient(#2c2c30,#1a1a1d);border:2px solid #8a7a52;border-radius:7px;box-shadow:0 3px 12px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.12);min-width:330px}
.elv .led{background:#130803;border-right:2px solid #8a7a52;border-radius:5px 0 0 5px;padding:4px 14px;font:bold 34px 'Courier New',monospace;color:#ffa030;text-shadow:0 0 10px #ff7a10,0 0 2px #ffcf80;display:flex;align-items:center;gap:8px;min-width:96px;justify-content:center}
.elv .led i{font-style:normal;font-size:22px}
.elv .info{padding:5px 14px 6px;display:flex;flex-direction:column;justify-content:center;min-width:200px}
.elv .nm{font:bold 17px Arial;letter-spacing:.5px;text-shadow:0 1px 2px #000}
.elv .st{font-size:12px;color:#cfc6b0;margin-top:2px}
.elv .st.urgent{color:#ff6a4a;font-weight:bold;animation:elvPulse .5s infinite alternate}
@keyframes elvPulse{from{opacity:1}to{opacity:.45}}
.elv .banner{position:absolute;left:0;right:0;top:20%;text-align:center;opacity:0;transition:opacity .6s}
.elv .banner .s{font:bold 15px Arial;letter-spacing:7px;color:#ffcf6a;text-shadow:0 2px 3px #000}
.elv .banner .t{font:bold 56px 'Arial Black',Arial;letter-spacing:2px;-webkit-text-stroke:2px #000;text-shadow:0 4px 0 #000,0 0 26px rgba(0,0,0,.5);line-height:1.1}
.elv .banner .h{font:bold 18px Arial;text-shadow:0 2px 3px #000;margin-top:4px;color:#f2f2f2}
.elv .toast{position:absolute;left:50%;top:118px;transform:translateX(-50%);background:rgba(20,70,30,.88);border:2px solid #7cf07c;border-radius:6px;padding:6px 18px;font:bold 15px Arial;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .4s;white-space:nowrap}
.elv .dead{position:absolute;left:0;right:0;top:42%;text-align:center;font:bold 24px Arial;text-shadow:0 2px 4px #000;display:none}
.elv .dead small{display:block;font-size:14px;color:#ddd;margin-top:4px}
.elv .help{position:absolute;left:50%;transform:translateX(-50%);bottom:34px;font-size:12px;text-align:center;color:#eee;text-shadow:0 1px 2px #000;line-height:1.6;white-space:nowrap}
.elv .sum{position:absolute;left:50%;top:16%;transform:translateX(-50%);background:rgba(24,20,10,.9);border:3px solid #ffd84a;border-radius:10px;padding:14px 26px 16px;text-align:center;display:none;min-width:340px;box-shadow:0 0 40px rgba(255,200,40,.35)}
.elv .sum h2{margin:0 0 4px;font:bold 30px 'Arial Black',Arial;color:#ffd84a;-webkit-text-stroke:1px #000;text-shadow:0 3px 0 #000}
.elv .sum .fl{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin:8px 0;max-width:520px}
.elv .sum .fl span{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:2px 7px;font-size:12px}
.elv .sum .fl span.d{border-color:#ff6a4a;color:#ffb0a0}
.elv .sum div{font-size:15px;line-height:1.6}
.elv .tint{position:absolute;inset:0;opacity:0;transition:opacity .25s}
.elv .flash{position:absolute;inset:0;opacity:0}
.elv .bub{position:absolute;transform:translate(-50%,-100%);background:#fff;color:#111;border-radius:10px;padding:4px 9px;font:bold 13px Arial;max-width:220px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,.4);white-space:normal;line-height:1.25}
.elv .bub:after{content:'';position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-bottom:0;border-top-color:#fff}
.elv .bub.npc{background:#fff6d8;border:1px solid #b89a4a}
.elv .bub.npc b{display:block;font-size:10px;color:#8a6a1a;letter-spacing:.5px}
`;

export class UI {
  constructor(root) {
    if (!document.getElementById('elv-css')) { const st = document.createElement('style'); st.id = 'elv-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = document.createElement('div'); el.className = 'elv';
    el.innerHTML = `<div class="tint"></div><div class="flash"></div><div class="bubs"></div>
      <div class="ind"><div class="led"><i></i><span>G</span></div><div class="info"><div class="nm">Lobby</div><div class="st"></div></div></div>
      <div class="banner"><div class="s"></div><div class="t"></div><div class="h"></div></div>
      <div class="toast"></div><div class="dead"></div>
      <div class="sum"><h2>YOU MADE IT TO THE TOP!</h2><div class="fl"></div><div class="body"></div></div>
      <div class="help">Ride the elevator! Step out if you dare - get back in before the doors close.<br>WASD move · Space jump · right-drag look · I/O zoom · click the buttons by the door</div>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    Object.assign(this, { el, arrow: q('.led i'), num: q('.led span'), nm: q('.nm'), st: q('.st'), banner: q('.banner'), toastEl: q('.toast'), deadEl: q('.dead'), sumEl: q('.sum'), tintEl: q('.tint'), flashEl: q('.flash'), bubs: q('.bubs'), help: q('.help') });
    this.bubbles = new Map();
    this.flashA = 0;
    setTimeout(() => { this.help.style.display = 'none'; }, 40000);
  }
  _set(key, node, html) { if (this['_' + key] !== html) { this['_' + key] = html; node.innerHTML = html; } }
  setFloor(label, arrow, name) {
    this._set('num', this.num, label);
    this._set('arrow', this.arrow, arrow === 'up' ? '▲' : arrow === 'down' ? '▼' : '');
    this._set('nm', this.nm, name);
  }
  setStatus(text, urgent = false) { this._set('st', this.st, text); this.st.classList.toggle('urgent', !!urgent); }
  showBanner(sub, title, hint, color = '#ffffff') {
    this.banner.querySelector('.s').textContent = sub;
    const t = this.banner.querySelector('.t'); t.textContent = title; t.style.color = color;
    this.banner.querySelector('.h').textContent = hint || '';
    this.banner.style.opacity = 1;
    clearTimeout(this._bt); this._bt = setTimeout(() => { this.banner.style.opacity = 0; }, 3800);
  }
  toast(html, color = '#7cf07c', bg = 'rgba(20,70,30,.88)') {
    this.toastEl.innerHTML = html; this.toastEl.style.borderColor = color; this.toastEl.style.background = bg; this.toastEl.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { this.toastEl.style.opacity = 0; }, 2800);
  }
  setDead(text, sub) { this.deadEl.style.display = text ? 'block' : 'none'; this.deadEl.innerHTML = text ? `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}` : ''; }
  summary(o) {
    if (!o) { this.sumEl.style.display = 'none'; return; }
    this.sumEl.querySelector('h2').textContent = o.title;
    this.sumEl.querySelector('.fl').innerHTML = o.floors.map((f) => `<span class="${f.died ? 'd' : ''}">${esc(f.label)} · ${esc(f.name)}${f.died ? ' ☠' : ''}</span>`).join('');
    this.sumEl.querySelector('.body').innerHTML = o.body;
    this.sumEl.style.display = 'block';
    clearTimeout(this._st); this._st = setTimeout(() => { this.sumEl.style.display = 'none'; }, o.secs * 1000);
  }
  tint(css, a) { if (this._tint !== css + a) { this._tint = css + a; this.tintEl.style.background = css; this.tintEl.style.opacity = a; } }
  flash(color = '#ffffff', a = 0.8) { this.flashEl.style.background = color; this.flashA = a; }
  /** A speech bubble over something (getPos() gives its head position) for a few seconds. */
  bubble(key, text, getPos, o = {}) {
    let b = this.bubbles.get(key);
    if (!b) { const node = document.createElement('div'); node.className = 'bub' + (o.npc ? ' npc' : ''); this.bubs.appendChild(node); b = { node }; this.bubbles.set(key, b); }
    b.node.innerHTML = o.npc && o.name ? `<b>${esc(o.name)}</b>${esc(text)}` : esc(text);
    b.getPos = getPos; b.until = performance.now() + (o.secs ?? Math.min(7, 2.5 + text.length * 0.06)) * 1000;
  }
  update(dt, camera, w, h) {
    if (this.flashA > 0) { this.flashA = Math.max(0, this.flashA - dt * 2.2); this.flashEl.style.opacity = this.flashA; }
    const now = performance.now(), v = new THREE.Vector3();
    for (const [k, b] of this.bubbles) {
      const p = now < b.until ? b.getPos() : null;
      if (!p) { b.node.remove(); this.bubbles.delete(k); continue; }
      v.copy(p).add(new THREE.Vector3(0, 1.4, 0)).project(camera);
      const vis = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && camera.position.distanceTo(p) < 90;
      b.node.style.display = vis ? 'block' : 'none';
      if (vis) { b.node.style.left = `${(v.x * 0.5 + 0.5) * w}px`; b.node.style.top = `${(-v.y * 0.5 + 0.5) * h}px`; }
    }
  }
}
function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }
