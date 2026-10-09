// The HUD: modern and minimal. A rounded radar bottom-left that turns with
// the camera (roads, blips, the GPS route to your waypoint or objective),
// health and armour under it; wanted stars, money and the weapon top-right;
// help prompts top-left; subtitles and the objective bottom-centre; the
// district name and the speedometer bottom-right; WASTED / BUSTED / MISSION
// PASSED in the middle; damage and hit feedback.
//
//   V.hud = new Hud(game.gui.root)
//   notify(text, secs)  help(html, secs)  subtitle(who, text, secs)  objective(text)
//   big(kind: 'wasted'|'busted'|'passed'|'failed', title?, sub?)  hideBig()
//   zone(name, sub)  damage(dir, dmg)  hitmark(head)  radio(name)
//   blips: Map id -> {x, z, icon, color, label, route, flash}   setWaypoint(x, z) / clearWaypoint()
//   update(dt)  resize()  dispose()
import { V } from '../state.js';
import { mapImage } from './mapimage.js';
import { route } from '../core/route.js';
import { PLACES } from '../world/layout.js';

const CSS = `
.rbx-gui.vc-mode > :not(.vc){display:none!important}
.vc{position:fixed;inset:0;pointer-events:none;font-family:Inter,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff;user-select:none;z-index:5}
.vc *{box-sizing:border-box}
.vc-hud{position:absolute;inset:0;transition:opacity .4s}
.vc-hud.off{opacity:0}
.vc-hud.cut,.vc-big.cut{transition:none!important}
.vc-radar{position:absolute;left:28px;bottom:30px;width:244px}
.vc-radar canvas{display:block;width:244px;height:184px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.45),0 0 0 2px rgba(255,255,255,.08) inset;background:#0e2f45}
.vc-bars{display:flex;gap:4px;margin-top:5px}
.vc-bar{height:6px;border-radius:3px;background:rgba(0,0,0,.45);overflow:hidden;flex:1}
.vc-bar i{display:block;height:100%;transition:width .25s}
.vc-bar.hp{flex:1.3}.vc-bar.hp i{background:linear-gradient(90deg,#3ecf6e,#7af09a)}
.vc-bar.hp.low i{background:linear-gradient(90deg,#e0403a,#ff7a6a);animation:vc-pulse .8s infinite}
.vc-bar.ar i{background:linear-gradient(90deg,#3a8ff0,#7ac0ff)}
@keyframes vc-pulse{50%{opacity:.45}}
.vc-tr{position:absolute;right:30px;top:26px;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.vc-stars{display:flex;gap:3px;font-size:26px;line-height:1;height:28px}
.vc-stars b{color:rgba(255,255,255,.14);text-shadow:0 2px 6px rgba(0,0,0,.5);font-weight:400}
.vc-stars b.on{color:#fff}
.vc-stars.flash b.on{animation:vc-flash .6s infinite}
@keyframes vc-flash{50%{color:rgba(255,255,255,.25)}}
.vc-money{font-size:30px;font-weight:700;letter-spacing:.5px;color:#7cf0a2;text-shadow:0 2px 8px rgba(0,0,0,.6);font-variant-numeric:tabular-nums}
.vc-delta{font-size:20px;font-weight:700;height:22px;opacity:0;transition:opacity .3s}
.vc-delta.show{opacity:1}
.vc-weapon{display:flex;align-items:center;gap:10px;padding:6px 12px;border-radius:10px;background:rgba(10,14,24,.42);backdrop-filter:blur(4px)}
.vc-weapon .ico{font-size:22px}.vc-weapon .nm{font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.75}
.vc-weapon .am{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}.vc-weapon .am small{opacity:.55;font-weight:500;font-size:14px}
.vc-help{position:absolute;left:28px;top:26px;max-width:360px;display:flex;flex-direction:column;gap:6px}
.vc-help div{background:rgba(10,14,24,.72);border-left:3px solid #ff4fa3;padding:10px 14px;border-radius:6px;font-size:14px;line-height:1.45;animation:vc-in .3s}
.vc-help kbd{display:inline-block;min-width:20px;padding:1px 6px;margin:0 2px;border-radius:4px;background:#fff;color:#111;font:700 12px Inter,Arial,sans-serif;text-align:center}
@keyframes vc-in{from{opacity:0;transform:translateX(-8px)}}
.vc-feed{position:absolute;left:28px;bottom:250px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.vc-feed div{background:rgba(10,14,24,.75);padding:8px 13px;border-radius:8px;font-size:14px;animation:vc-in .3s;max-width:330px}
.vc-sub{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(820px,80vw);text-align:center;font-size:21px;font-weight:600;text-shadow:0 2px 6px rgba(0,0,0,.9),0 0 2px #000;line-height:1.35}
.vc-sub .who{color:#ffcf4a}
.vc-obj{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);font-size:16px;font-weight:600;text-shadow:0 2px 5px rgba(0,0,0,.9);white-space:nowrap}
.vc-obj b{color:#ffcf4a}
.vc-zone{position:absolute;right:34px;bottom:34px;text-align:right;opacity:0;transition:opacity .8s}
.vc-zone.show{opacity:1}
.vc-zone .z{font-size:28px;font-weight:800;letter-spacing:1px;font-style:italic;text-shadow:0 3px 10px rgba(0,0,0,.7)}
.vc-zone .s{font-size:14px;opacity:.85;letter-spacing:2px;text-transform:uppercase}
.vc-speedo{position:absolute;right:34px;bottom:96px;text-align:right;opacity:0;transition:opacity .3s}
.vc-speedo.show{opacity:1}
.vc-speedo .v{font-size:46px;font-weight:800;font-style:italic;line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 3px 10px rgba(0,0,0,.6)}
.vc-speedo .u{font-size:13px;letter-spacing:3px;opacity:.7}
.vc-speedo .n{font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.8;margin-top:4px}
.vc-radio{position:absolute;left:50%;top:30px;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .5s}
.vc-radio.show{opacity:1}
.vc-radio .s{font-size:24px;font-weight:800;font-style:italic;background:linear-gradient(90deg,#ff4fa3,#4fd8ff);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
.vc-radio .t{font-size:12px;letter-spacing:3px;opacity:.75;text-transform:uppercase}
.vc-big{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .6s}
.vc-big.show{opacity:1}
.vc-big .t{font-size:clamp(56px,9vw,120px);font-weight:900;font-style:italic;letter-spacing:4px;text-transform:uppercase;text-shadow:0 6px 30px rgba(0,0,0,.6)}
.vc-big .b{width:100%;padding:18px 0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.55) 20%,rgba(0,0,0,.55) 80%,transparent);text-align:center}
.vc-big .s{font-size:22px;font-weight:600;margin-top:6px;opacity:.9}
.vc-big.wasted .t{color:#d8322c}.vc-big.busted .t{color:#fff;text-shadow:0 0 30px #3a7bff}
.vc-big.passed .t{color:#ffcf4a;font-size:clamp(40px,6vw,76px)}.vc-big.failed .t{color:#e2463e;font-size:clamp(40px,6vw,76px)}
.vc-dmg{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(190,0,0,.55));transition:opacity .15s}
.vc-cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.6);opacity:0}
.vc-cross.on{opacity:1}.vc-cross.target{background:#ff3b3b}
.vc-hit{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;transition:opacity .12s}
.vc-hit.show{opacity:1}
.vc-hit::before,.vc-hit::after{content:"";position:absolute;left:50%;top:0;width:2px;height:100%;margin-left:-1px;background:#fff;transform:rotate(45deg)}
.vc-hit::after{transform:rotate(-45deg)}
.vc-hit.head::before,.vc-hit.head::after{background:#ff4040}
`;

export const ICONS = { safehouse: ['H', '#7cf0a2'], hospital: ['+', '#ff6b6b'], police: ['★', '#5aa8ff'], gunshop: ['G', '#ffb35f'], spray: ['S', '#c08bff'], marina: ['⚓', '#9fd8ff'], helipad: ['H', '#ffd86b'], arena: ['A', '#ffffff'], pier: ['P', '#9fd8ff'] };

export class Hud {
  constructor(root) {
    this.root = root;
    if (!document.getElementById('vc-hud-css')) { const s = document.createElement('style'); s.id = 'vc-hud-css'; s.textContent = CSS; document.head.appendChild(s); }
    root.classList.add('vc-mode');
    const el = (this.el = document.createElement('div'));
    el.className = 'vc vc-hud-root';
    el.innerHTML = `<div class="vc-hud">
      <div class="vc-radar"><canvas width="488" height="368"></canvas><div class="vc-bars"><div class="vc-bar hp"><i></i></div><div class="vc-bar ar"><i></i></div></div></div>
      <div class="vc-tr"><div class="vc-stars"><b>★</b><b>★</b><b>★</b><b>★</b><b>★</b></div><div class="vc-money">$0</div><div class="vc-delta"></div><div class="vc-weapon"><span class="ico">✊</span><div><div class="nm">Fists</div><div class="am"></div></div></div></div>
      <div class="vc-help"></div><div class="vc-feed"></div>
      <div class="vc-obj"></div><div class="vc-sub"></div>
      <div class="vc-zone"><div class="z"></div><div class="s"></div></div>
      <div class="vc-speedo"><div class="v">0</div><div class="u">MPH</div><div class="n"></div></div>
      <div class="vc-radio"><div class="s"></div><div class="t"></div></div>
      <div class="vc-cross"></div><div class="vc-hit"></div>
    </div>
    <div class="vc-dmg"></div>
    <div class="vc-big"><div class="b"><div class="t"></div><div class="s"></div></div></div>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.$ = {
      hud: q('.vc-hud'), radar: q('.vc-radar canvas'), hp: q('.vc-bar.hp'), hpI: q('.vc-bar.hp i'), arI: q('.vc-bar.ar i'), ar: q('.vc-bar.ar'),
      stars: q('.vc-stars'), starB: [...el.querySelectorAll('.vc-stars b')], money: q('.vc-money'), delta: q('.vc-delta'),
      wIco: q('.vc-weapon .ico'), wNm: q('.vc-weapon .nm'), wAm: q('.vc-weapon .am'), weapon: q('.vc-weapon'),
      help: q('.vc-help'), feed: q('.vc-feed'), obj: q('.vc-obj'), sub: q('.vc-sub'),
      zone: q('.vc-zone'), zoneZ: q('.vc-zone .z'), zoneS: q('.vc-zone .s'),
      speedo: q('.vc-speedo'), spV: q('.vc-speedo .v'), spN: q('.vc-speedo .n'),
      radio: q('.vc-radio'), radioS: q('.vc-radio .s'), radioT: q('.vc-radio .t'),
      cross: q('.vc-cross'), hit: q('.vc-hit'), dmg: el.querySelector('.vc-dmg'), big: el.querySelector('.vc-big'), bigT: el.querySelector('.vc-big .t'), bigS: el.querySelector('.vc-big .s'),
    };
    this.ctx = this.$.radar.getContext('2d');
    this.blips = new Map();
    this.waypoint = null;
    this.t = 0; this.shownMoney = null; this.subs = []; this.helpT = 0; this.zoneT = 0; this.radioT = 0; this.dmgA = 0; this.hitT = 0; this.deltaT = 0;
    this.routeT = 0; this.route = null; this.last = {};
  }

  // ---- messages ----
  notify(text, secs = 5) {
    const d = document.createElement('div'); d.textContent = text;
    this.$.feed.appendChild(d);
    while (this.$.feed.children.length > 4) this.$.feed.firstChild.remove();
    (this.timers ||= []).push({ t: secs, fn: () => d.remove() });
  }
  /** A help box (html allowed; use <kbd>F</kbd> for keys). Same text again just keeps it up. */
  help(html, secs = 4) {
    if (!html) { this.$.help.innerHTML = ''; this.helpText = ''; return; }
    if (this.helpText !== html) { this.$.help.innerHTML = `<div>${html}</div>`; this.helpText = html; }
    this.helpT = secs;
  }
  subtitle(who, text, secs = 4) { this.subs.push({ who, text, secs }); if (this.subs.length === 1) this._showSub(); }
  _showSub() { const s = this.subs[0]; this.$.sub.innerHTML = s ? (s.who ? `<span class="who">${esc(s.who)}:</span> ` : '') + esc(s.text) : ''; }
  objective(text) { this.$.obj.innerHTML = text ? text.replace(/\*([^*]+)\*/g, '<b>$1</b>') : ''; }
  big(kind, title, sub = '') {
    const T = { wasted: 'Wasted', busted: 'Busted', passed: 'Mission Passed', failed: 'Mission Failed' };
    this.$.big.className = 'vc-big show ' + kind;
    this.$.bigT.textContent = title || T[kind] || kind;
    this.$.bigS.textContent = sub || '';
    this.bigT = kind === 'passed' || kind === 'failed' ? 5 : 0;
  }
  /** Fade the big title out (instant: gone at once, e.g. while the screen is black). */
  hideBig(instant = false) { this.$.big.className = 'vc-big' + (instant ? ' cut' : ''); this.bigT = 0; }
  zone(name, sub = '') { this.$.zoneZ.textContent = name; this.$.zoneS.textContent = sub; this.$.zone.classList.add('show'); this.zoneT = 5; }
  radio(name, track = '') { this.$.radioS.textContent = name; this.$.radioT.textContent = track; this.$.radio.classList.add('show'); this.radioT = 3; }
  damage(dir, dmg) { this.dmgA = Math.min(1, this.dmgA + 0.25 + dmg / 40); }
  hitmark(head) { this.$.hit.className = 'vc-hit show' + (head ? ' head' : ''); this.hitT = 0.18; }
  money(delta) { if (!delta) return; this.$.delta.textContent = (delta > 0 ? '+$' : '-$') + Math.abs(Math.round(delta)).toLocaleString('en-US'); this.$.delta.style.color = delta > 0 ? '#7cf0a2' : '#ff6b6b'; this.$.delta.classList.add('show'); this.deltaT = 2.5; }
  setWaypoint(x, z) { this.waypoint = { x, z }; this.routeT = 0; }
  clearWaypoint() { this.waypoint = null; this.route = null; }
  show(on, instant = false) {
    const h = this.$.hud;
    if (instant && h.classList.contains('off') !== !on) { h.classList.add('cut'); this.cutT = 2; }
    h.classList.toggle('off', !on);
  }
  resize() {}

  // ---- every frame ----
  update(dt) {
    this.t += dt;
    const P = V.player, S = V.session?.state;
    if (!P || !P.pos) return;
    this.show(S === 'play' || S === 'wasted' || S === 'busted' || S === 'cutscene');
    if (this.cutT > 0 && --this.cutT === 0) this.$.hud.classList.remove('cut'); // back to fading after a hard cut
    if (this.timers?.length) for (const t of [...this.timers]) { t.t -= dt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.fn(); } }
    // health and armour
    this._set('hp', Math.round((P.hp / P.maxHp) * 100), (v) => { this.$.hpI.style.width = v + '%'; this.$.hp.classList.toggle('low', v < 25); });
    this._set('ar', Math.round(P.armor), (v) => { this.$.arI.style.width = v + '%'; });
    // wanted
    const W = V.police?.wanted || 0, fl = !!V.police?.searching;
    this._set('stars', W * 2 + (fl ? 1 : 0), () => { this.$.starB.forEach((b, i) => b.classList.toggle('on', i < W)); this.$.stars.classList.toggle('flash', fl); });
    // money counts up/down
    if (this.shownMoney == null) this.shownMoney = P.money;
    if (this.shownMoney !== P.money) {
      const d = P.money - this.shownMoney;
      if (this.lastMoney != null && P.money !== this.lastMoney) this.money(P.money - this.lastMoney);
      this.shownMoney += Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 6));
      if (Math.abs(P.money - this.shownMoney) < 1) this.shownMoney = P.money;
    }
    this.lastMoney = P.money;
    this._set('money', Math.round(this.shownMoney), (v) => { this.$.money.textContent = '$' + v.toLocaleString('en-US'); });
    if (this.deltaT > 0 && (this.deltaT -= dt) <= 0) this.$.delta.classList.remove('show');
    // weapon
    const w = V.weapons?.current;
    const wk = w ? `${w.id}|${w.mag ?? ''}|${w.reserve ?? ''}` : 'none';
    this._set('w', wk, () => {
      this.$.weapon.style.display = w ? '' : 'none';
      if (!w) return;
      this.$.wIco.textContent = w.icon || '•'; this.$.wNm.textContent = w.name || w.id;
      this.$.wAm.innerHTML = w.mag == null ? '' : `${w.mag} <small>/ ${w.reserve}</small>`;
    });
    // crosshair (unless the weapons system draws its own)
    const aim = !!V.weapons?.aiming && !V.weapons?.ownCrosshair;
    this._set('cross', (aim ? 1 : 0) + (V.weapons?.target ? 2 : 0), (v) => { this.$.cross.className = 'vc-cross' + (v & 1 ? ' on' : '') + (v & 2 ? ' target' : ''); });
    if (this.hitT > 0 && (this.hitT -= dt) <= 0) this.$.hit.className = 'vc-hit';
    // help, subtitles
    if (this.helpT > 0 && (this.helpT -= dt) <= 0) this.help('');
    if (this.subs.length) { this.subs[0].secs -= dt; if (this.subs[0].secs <= 0) { this.subs.shift(); this._showSub(); } }
    // damage flash
    this.dmgA = Math.max(0, this.dmgA - dt * 1.6);
    const lowHp = P.hp < 25 && !P.dead ? 0.35 + Math.sin(this.t * 6) * 0.12 : 0;
    this._set('dmg', Math.round(Math.max(this.dmgA, lowHp) * 50), (v) => { this.$.dmg.style.opacity = v / 50; });
    // the district you're in
    if ((this.zoneCheck = (this.zoneCheck || 0) - dt) <= 0) {
      this.zoneCheck = 0.5;
      const D = V.plan.districtAt(P.pos.x, P.pos.z);
      if (D && D.name !== this.lastZone) { const first = this.lastZone == null; this.lastZone = D.name; if (!first || S === 'play') this.zone(D.name, P.vehicle ? '' : ''); }
    }
    if (this.zoneT > 0 && (this.zoneT -= dt) <= 0) this.$.zone.classList.remove('show');
    if (this.radioT > 0 && (this.radioT -= dt) <= 0) this.$.radio.classList.remove('show');
    if (this.bigT > 0 && (this.bigT -= dt) <= 0) this.hideBig();
    // speedometer
    const veh = P.vehicle;
    this.$.speedo.classList.toggle('show', !!veh);
    if (veh) {
      const mph = Math.round(Math.abs(veh.speed || 0) * 0.738);
      this._set('mph', mph, (v) => { this.$.spV.textContent = v; });
      this._set('vname', veh.def?.name || veh.type || '', (v) => { this.$.spN.textContent = v; });
    }
    // the radar
    this._radar(dt);
  }

  _set(k, v, fn) { if (this.last[k] === v) return; this.last[k] = v; fn(v); }

  _radar(dt) {
    const P = V.player, g = this.ctx, cv = this.$.radar, W = cv.width, H = cv.height;
    const M = mapImage(V.plan, V.ground);
    const veh = P.vehicle;
    // zoom out with speed, and with height in the air (GTA-style): ~600 studs across on
    // foot, ~1000 in a car in town, ~2000 flat out on the expressway, up to ~4000 flying high
    const spd = veh ? Math.abs(veh.speed || 0) : 0;
    let want = 0.8;
    if (veh) {
      const air = veh.kind === 'heli' || veh.kind === 'plane';
      const agl = Math.max(0, veh.pos.y - (V.ground?.heightAt?.(veh.pos.x, veh.pos.z) ?? 0));
      want = air ? 0.38 / (1 + agl / 90 + spd / 140) : 0.5 / (1 + spd / 85);
      want = Math.max(0.12, want);
    }
    this.zoom = this.zoom ? this.zoom * Math.exp(Math.log(want / this.zoom) * Math.min(1, dt * 1.5)) : want;
    const k = this.zoom; // px per stud
    const yaw = V.cam?.yaw ?? 0;
    const cx = W / 2, cy = H * 0.62; // the player sits a little below the middle (you see more ahead)
    g.save();
    g.fillStyle = '#0e2f45'; g.fillRect(0, 0, W, H);
    g.translate(cx, cy); g.rotate(yaw); g.scale(k / M.scale, k / M.scale);
    const [px, py] = M.toPx(P.pos.x, P.pos.z);
    g.translate(-px, -py);
    g.drawImage(M.canvas, 0, 0);
    // the GPS route
    const target = this.waypoint || [...this.blips.values()].find((b) => b.route);
    if (target) {
      if ((this.routeT -= dt) <= 0) { this.routeT = 1.2; this.route = route(V.plan, P.pos.x, P.pos.z, target.x, target.z); }
      if (this.route) {
        g.strokeStyle = this.waypoint ? '#d66bff' : '#ffcf4a'; g.lineWidth = 7 * M.scale / k * 1.0; g.lineJoin = 'round'; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(...M.toPx(P.pos.x, P.pos.z));
        for (const p of this.route.pts) g.lineTo(...M.toPx(p.x, p.z));
        g.stroke();
      }
    } else this.route = null;
    // the police search area (red/blue, pulsing)
    const SA = V.police?.searching && V.police.search;
    if (SA) {
      const [sx, sy] = M.toPx(SA.x, SA.z), rp = Math.abs(M.toPx(SA.x + SA.r, SA.z)[0] - sx);
      g.beginPath(); g.arc(sx, sy, rp, 0, Math.PI * 2);
      g.fillStyle = Math.floor(this.t * 2) % 2 ? 'rgba(255,60,60,.2)' : 'rgba(60,120,255,.2)'; g.fill();
      g.lineWidth = 3 * M.scale / k; g.strokeStyle = 'rgba(255,255,255,.45)'; g.stroke();
    }
    g.restore();
    // blips (drawn upright, clamped to the edge)
    const blip = (x, z, label, color, r = 9, clamp = false, shape = 'circle') => {
      const dx = (x - P.pos.x) * k, dz = (z - P.pos.z) * k;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      let sx = cx + dx * c - dz * s, sy = cy + dx * s + dz * c;
      const inside = sx > 8 && sx < W - 8 && sy > 8 && sy < H - 8;
      if (!inside) { if (!clamp) return; sx = Math.max(10, Math.min(W - 10, sx)); sy = Math.max(10, Math.min(H - 10, sy)); }
      g.beginPath();
      if (shape === 'square') g.rect(sx - r, sy - r, r * 2, r * 2); else g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fillStyle = color; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.65)'; g.stroke();
      if (label) { g.fillStyle = '#111'; g.font = `bold ${Math.round(r * 1.25)}px Inter,Arial,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, sx, sy + 1); }
    };
    const reach = Math.hypot(W, H) / k; // studs from the player to the radar's far corner (and then some)
    for (const p of PLACES) { const I = ICONS[p.kind]; if (I && Math.abs(p.x - P.pos.x) < reach && Math.abs(p.z - P.pos.z) < reach) blip(p.x, p.z, I[0], I[1], 9, false); }
    for (const b of V.police?.blips || []) blip(b.x, b.z, '', Math.floor(this.t * 4) % 2 ? '#ff3b3b' : '#3b7bff', 6, false);
    for (const b of this.blips.values()) { if (b.flash && Math.floor(this.t * 3) % 2) continue; blip(b.x, b.z, b.label || '', b.color || '#ffcf4a', b.r || 10, true, b.shape); }
    if (this.waypoint) blip(this.waypoint.x, this.waypoint.z, '', '#d66bff', 8, true, 'square');
    // north
    const north = (() => { const c = Math.cos(yaw), s = Math.sin(yaw); const d = 400; let sx = cx + (0 * c - -d * s), sy = cy + (0 * s + -d * c); sx = Math.max(12, Math.min(W - 12, sx)); sy = Math.max(12, Math.min(H - 12, sy)); return [sx, sy]; })();
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(north[0], north[1], 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 13px Inter,Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', north[0], north[1] + 1);
    // you: an arrow along your heading (in screen space: heading relative to the camera)
    const h = (veh ? veh.heading : P.heading) ?? 0;
    const a = Math.PI - (h - yaw); // screen angle (up = camera forward)
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.7)'; g.stroke();
    g.restore();
  }

  dispose() { this.el.remove(); this.root.classList.remove('vc-mode'); }
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
