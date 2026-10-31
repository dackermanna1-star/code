// HOLDOUT — the on-foot HUD: the round in big red numerals, points with their little popups, the
// gun and what is left in it, grenades, field kits and running pickups, the buy prompt, a
// crosshair that opens with the spread, hit markers, the red of a beating and where it came from,
// banners for rounds, areas and pickups. DOM only, in Last Lookout's pixel font and palette (the
// TowerHud's stylesheet is already in the page).
import { el, setText, setStyle, toggle, retrigger } from '../ui/dom.js';
import { groupThousands } from '../ui/format.js';
import { ensurePixelFont } from '../ui/pixelFont.js';

const CSS = `
.ll.hold { z-index: 39; }
.hold .hc { position: absolute; inset: 0; }
.hold .h-vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 45%, rgba(140,0,0,.85) 100%); opacity: 0; }
.hold .h-flash { position: absolute; inset: 0; background: rgba(160,10,0,.35); opacity: 0; }
.hold .h-flash.h-go { animation: hflash .45s ease-out; }
@keyframes hflash { from { opacity: 1; } to { opacity: 0; } }
.hold .h-xh { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.hold .h-xh i { position: absolute; background: rgba(240,235,220,.92); box-shadow: 0 0 0 1px rgba(0,0,0,.55); }
.hold .h-xh .u, .hold .h-xh .d { width: 2px; height: 9px; left: -1px; }
.hold .h-xh .l, .hold .h-xh .r { width: 9px; height: 2px; top: -1px; }
.hold .h-xh .dot { width: 2px; height: 2px; left: -1px; top: -1px; }
.hold .h-hm { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; }
.hold .h-hm i { position: absolute; width: 11px; height: 3px; background: #f4efe0; box-shadow: 0 0 0 1px rgba(0,0,0,.6); }
.hold .h-hm i:nth-child(1) { transform: translate(5px, 5px) rotate(45deg); }
.hold .h-hm i:nth-child(2) { transform: translate(-16px, 5px) rotate(-45deg); }
.hold .h-hm i:nth-child(3) { transform: translate(5px, -8px) rotate(-45deg); }
.hold .h-hm i:nth-child(4) { transform: translate(-16px, -8px) rotate(45deg); }
.hold .h-hm.h-kill i { background: #ff3a22; }
.hold .h-hm.h-head i { background: #ffd040; }
.hold .h-hm.h-go { animation: hmk .32s ease-out; }
@keyframes hmk { from { opacity: 1; } 60% { opacity: 1; } to { opacity: 0; } }
.hold .h-hurt { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.hold .h-hurt i { position: absolute; left: -70px; top: -150px; width: 140px; height: 26px; border-radius: 50% 50% 0 0;
  border-top: 7px solid rgba(220,20,10,.85); transform-origin: 70px 150px; opacity: 0; }
.hold .h-round { position: absolute; left: 28px; bottom: 22px; }
.hold .h-round .h-n { font-size: 96px; line-height: 0.9; color: #b0140e; text-shadow: 3px 3px 0 rgba(0,0,0,.8), 0 0 18px rgba(200,20,10,.45); }
.hold .h-round .h-n.h-go { animation: hround 2.4s ease-out; }
@keyframes hround { 0% { color: #fff; transform: scale(1.35); } 30% { color: #fff; } 100% { color: #b0140e; transform: scale(1); } }
.hold .h-round .h-n.h-blink { animation: hblink 1s steps(2) infinite; }
@keyframes hblink { 50% { color: #f0e6d0; } }
.hold .h-round .h-lbl2 { font-size: 16px; color: #d8c8a0; letter-spacing: 2px; text-shadow: 2px 2px 0 rgba(0,0,0,.85); }
.hold .h-round .h-left { font-size: 12px; color: #b8ac78; margin-top: 2px; text-shadow: 1px 1px 0 #000; }
.hold .h-br { position: absolute; right: 28px; bottom: 22px; text-align: right; }
.hold .h-pts { font-size: 32px; color: #ffe08a; text-shadow: 2px 2px 0 rgba(0,0,0,.85), 0 0 8px rgba(255,170,50,.35); }
.hold .h-pts.h-x2 { color: #8fe060; }
.hold .h-pops { position: absolute; right: 0; bottom: 100%; width: 140px; height: 120px; pointer-events: none; }
.hold .h-pops span { position: absolute; right: 0; bottom: 0; font-size: 16px; color: #ffe08a; text-shadow: 1px 1px 0 #000; opacity: 0; }
.hold .h-pops span.h-neg { color: #ff6a50; }
.hold .h-pops span.h-go { animation: hpop .9s ease-out forwards; }
@keyframes hpop { from { opacity: 1; transform: translate(0, 0); } to { opacity: 0; transform: translate(-30px, -70px); } }
.hold .h-gun { margin-top: 10px; }
.hold .h-gun .h-name { font-size: 16px; color: #efe3c4; letter-spacing: 1px; text-shadow: 2px 2px 0 #000; }
.hold .h-gun .h-name.h-up { color: #b48aff; text-shadow: 2px 2px 0 #000, 0 0 10px rgba(160,100,255,.6); }
.hold .h-gun .h-ammo { font-size: 48px; line-height: 1; color: #efe3c4; text-shadow: 3px 3px 0 rgba(0,0,0,.85); }
.hold .h-gun .h-ammo.h-low { color: #ff6a40; }
.hold .h-gun .h-ammo small { font-size: 24px; color: #b8ac78; }
.hold .h-gun .h-st { font-size: 12px; color: #ffb43a; height: 15px; text-shadow: 1px 1px 0 #000; }
.hold .h-nades { margin-top: 4px; height: 14px; }
.hold .h-nades i { display: inline-block; width: 10px; height: 13px; margin-left: 4px; background: #5d6238; border: 2px solid #20230f; border-radius: 4px 4px 2px 2px; }
.hold .h-nades i.h-off { opacity: .2; }
.hold .h-prompt { position: absolute; left: 50%; bottom: 23%; transform: translateX(-50%); padding: 7px 14px; white-space: nowrap; font-size: 16px;
  color: #efe3c4; background: rgba(10,11,7,.72); border: 2px solid rgba(70,75,45,.9); text-shadow: 1px 1px 0 #000; }
.hold .h-prompt b { color: #ffc040; font-weight: normal; }
.hold .h-prompt b.h-no { color: #ff5a40; }
.hold .h-prompt.h-shake { animation: hshake .35s; }
@keyframes hshake { 20% { transform: translateX(calc(-50% - 8px)); } 40% { transform: translateX(calc(-50% + 8px)); } 60% { transform: translateX(calc(-50% - 5px)); } 80% { transform: translateX(calc(-50% + 4px)); } }
.hold .h-tl { position: absolute; left: 24px; top: 20px; }
.hold .h-perk { display: inline-block; width: 30px; height: 30px; margin-right: 6px; border: 2px solid rgba(0,0,0,.7); box-shadow: 0 0 10px rgba(0,0,0,.4);
  font-size: 12px; line-height: 26px; text-align: center; color: #fff; text-shadow: 1px 1px 0 #000; }
.hold .h-buff { margin-top: 8px; font-size: 16px; text-shadow: 2px 2px 0 #000; }
.hold .h-banner { position: absolute; left: 50%; top: 17%; transform: translateX(-50%); text-align: center; white-space: nowrap; opacity: 0; }
.hold .h-banner .h-big { font-size: 32px; color: #efe3c4; letter-spacing: 3px; text-shadow: 3px 3px 0 rgba(0,0,0,.85); }
.hold .h-banner .h-sm { font-size: 16px; color: #ffb43a; margin-top: 4px; text-shadow: 2px 2px 0 #000; }
.hold .h-banner.h-go { animation: hban 3.4s ease-out forwards; }
@keyframes hban { 0% { opacity: 0; transform: translate(-50%, -10px); } 10% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; } }
.hold .h-boss { position: absolute; left: 50%; top: 44px; width: 360px; transform: translateX(-50%); text-align: center; }
.hold .h-boss .h-nm { font-size: 16px; color: #ff6a40; letter-spacing: 2px; text-shadow: 2px 2px 0 #000; }
.hold .h-boss .h-bar { height: 10px; margin-top: 4px; background: rgba(0,0,0,.6); border: 2px solid rgba(70,20,10,.9); }
.hold .h-boss .h-bar i { display: block; height: 100%; background: linear-gradient(#e04020, #8e1b14); }
.hold .h-help { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); font-size: 12px; color: #b8ac78; white-space: nowrap;
  text-shadow: 1px 1px 0 #000; transition: opacity 1.2s; }
.hold .h-help .key { margin: 0 2px 0 8px; }
.hold .h-alert { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); font-size: 24px; color: #ff6a40; white-space: nowrap;
  text-shadow: 2px 2px 0 #000; opacity: 0; }
.hold .h-alert.h-go { animation: hban 3s ease-out forwards; }
.hold .h-dead { position: absolute; inset: 0; background: rgba(60,0,0,.0); transition: background 3s; }
.hold .h-dead.h-on { background: rgba(60,0,0,.55); }
`;

const PERK_STYLE = {
  kevlar: ['#6f8f3a', 'KV'], quick: ['#c89a10', 'QH'], thirdArm: ['#8a3cc0', 'III'], adrenaline: ['#c8301e', 'AD'],
};

export class HoldoutHud {
  constructor(parent = document.body) {
    if (!document.getElementById('ll-hold-css')) {
      const st = document.createElement('style');
      st.id = 'll-hold-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    ensurePixelFont();
    const root = (this.root = el('div', 'll hold', parent));
    const c = (this.c = el('div', 'hc', root));
    this.vig = el('div', 'h-vig', c);
    this.flashEl = el('div', 'h-flash', c);
    this.deadEl = el('div', 'h-dead', c);
    // crosshair
    this.xh = el('div', 'h-xh', c);
    this.xhU = el('i', 'u', this.xh);
    this.xhD = el('i', 'd', this.xh);
    this.xhL = el('i', 'l', this.xh);
    this.xhR = el('i', 'r', this.xh);
    el('i', 'dot', this.xh);
    this.hm = el('div', 'h-hm', c);
    for (let k = 0; k < 4; k++) el('i', '', this.hm);
    this.hurtEl = el('div', 'h-hurt', c);
    this.hurtArcs = [];
    for (let k = 0; k < 4; k++) this.hurtArcs.push({ e: el('i', '', this.hurtEl), t: 0, a: 0 });
    // the round
    const rd = el('div', 'h-round', c);
    this.roundLbl = el('div', 'h-lbl2', rd, 'ROUND');
    this.roundN = el('div', 'h-n', rd, '1');
    this.leftEl = el('div', 'h-left', rd, '');
    // points and the gun
    const br = el('div', 'h-br', c);
    const pw = el('div', '', br);
    pw.style.position = 'relative';
    this.pops = el('div', 'h-pops', pw);
    this.popPool = [];
    for (let k = 0; k < 8; k++) this.popPool.push(el('span', '', this.pops));
    this.popI = 0;
    this.ptsEl = el('div', 'h-pts', pw, '500');
    const g = el('div', 'h-gun', br);
    this.gunName = el('div', 'h-name', g, '');
    this.ammoEl = el('div', 'h-ammo', g, '');
    this.gunSt = el('div', 'h-st', g, '');
    this.nades = el('div', 'h-nades', br);
    this.nadeEls = [];
    for (let k = 0; k < 4; k++) this.nadeEls.push(el('i', '', this.nades));
    // the prompt
    this.prompt = el('div', 'h-prompt', c);
    this.promptKey = el('span', 'key', this.prompt, 'F');
    this.promptTxt = el('span', '', this.prompt, '');
    this.promptPrice = el('b', '', this.prompt, '');
    // field kits and pickups running
    const tl = el('div', 'h-tl', c);
    this.perkRow = el('div', '', tl);
    this.perkEls = {};
    this.buffEls = { fury: el('div', 'h-buff', tl, ''), bounty: el('div', 'h-buff', tl, '') };
    this.buffEls.fury.style.color = '#ff5a3a';
    this.buffEls.bounty.style.color = '#8fe060';
    // banners, the boss, help, alerts
    this.banner = el('div', 'h-banner', c);
    this.bannerBig = el('div', 'h-big', this.banner, '');
    this.bannerSm = el('div', 'h-sm', this.banner, '');
    this.alertEl = el('div', 'h-alert', c, '');
    this.bossEl = el('div', 'h-boss', c);
    this.bossNm = el('div', 'h-nm', this.bossEl, '');
    const bb = el('div', 'h-bar', this.bossEl);
    this.bossFill = el('i', '', bb);
    this.help = el('div', 'h-help', c);
    const keys = [['WASD', 'MOVE'], ['SHIFT', 'SPRINT'], ['E / RMB', 'AIM'], ['R', 'RELOAD'], ['F', 'USE · BUY'], ['V', 'KICK'], ['G', 'GRENADE'], ['1-3 / Q', 'GUNS'], ['ESC', 'PAUSE']];
    for (const [k, t] of keys) {
      el('span', 'key', this.help, k);
      el('span', '', this.help, t);
    }
    this.helpT = 14;
    this.last = {};
    this.visible = true;
    this.show(false);
  }

  show(on) {
    if (this.visible === on) return;
    this.visible = on;
    this.root.style.display = on ? '' : 'none';
  }

  reset() {
    this.helpT = 14;
    this.help.style.opacity = '1';
    toggle(this.deadEl, 'h-on', false);
    this.last = {};
    for (const k of Object.keys(this.perkEls)) this.perkEls[k].remove();
    this.perkEls = {};
  }

  /**
   * Per frame. S: { round, phase, timer, remaining, points, x2, hp, maxHp, dead, gun: { name, up,
   * ammo, mag, spare, state }, grenades, perks: [ids], buffs: { fury, bounty } (seconds left),
   * prompt: { text, price, can } | null, spreadPx, ads, boss: { name, hp, max } | null }
   */
  update(dt, S) {
    const L = this.last;
    if (this.helpT > 0) {
      this.helpT -= dt;
      if (this.helpT <= 0) this.help.style.opacity = '0';
    }
    if (S.round !== L.round) {
      L.round = S.round;
      setText(this.roundN, S.round > 0 ? `${S.round}` : '');
      retrigger(this.roundN, 'h-go');
    }
    toggle(this.roundN, 'h-blink', S.phase === 'break');
    const left = S.phase === 'fight' ? `${S.remaining} LEFT` : S.phase === 'break' ? `NEXT ROUND IN ${Math.ceil(Math.max(0, S.timer))}` : S.phase === 'intro' ? 'THEY ARE COMING' : '';
    setText(this.leftEl, left);
    // points
    if (S.points !== L.points) {
      L.points = S.points;
      setText(this.ptsEl, groupThousands(S.points));
    }
    toggle(this.ptsEl, 'h-x2', !!S.x2);
    // the gun
    const g = S.gun;
    if (g) {
      setText(this.gunName, g.name);
      toggle(this.gunName, 'h-up', !!g.up);
      this.ammoEl.innerHTML = `${g.ammo}<small> / ${g.spare}</small>`;
      toggle(this.ammoEl, 'h-low', g.ammo <= Math.ceil(g.mag * 0.25));
      setText(this.gunSt, g.state === 'reload' ? 'RELOADING' : g.ammo === 0 && g.spare === 0 ? 'NO AMMUNITION' : g.ammo === 0 ? 'R · RELOAD' : '');
    }
    for (let k = 0; k < 4; k++) toggle(this.nadeEls[k], 'h-off', k >= S.grenades);
    // field kits
    for (const id of S.perks) {
      if (this.perkEls[id]) continue;
      const [col, ab] = PERK_STYLE[id] || ['#777', id.slice(0, 2).toUpperCase()];
      const e = el('div', 'h-perk', this.perkRow, ab);
      e.style.background = col;
      this.perkEls[id] = e;
    }
    for (const k of ['fury', 'bounty']) {
      const t = S.buffs[k];
      setText(this.buffEls[k], t > 0 ? `${k === 'fury' ? 'FURY · ONE HIT KILLS' : 'BOUNTY · DOUBLE POINTS'} ${Math.ceil(t)}` : '');
    }
    // the prompt
    const P = S.prompt;
    if (P) {
      setStyle(this.prompt, 'display', '');
      setText(this.promptTxt, ` ${P.text}`);
      setText(this.promptPrice, P.price ? `  ${groupThousands(P.price)}` : '');
      toggle(this.promptPrice, 'h-no', !P.can);
    } else setStyle(this.prompt, 'display', 'none');
    // crosshair: opens with the spread, gone when aiming
    const s = Math.round(Math.min(70, Math.max(5, S.spreadPx)));
    if (s !== L.s) {
      L.s = s;
      this.xhU.style.top = `${-s - 9}px`;
      this.xhD.style.top = `${s}px`;
      this.xhL.style.left = `${-s - 9}px`;
      this.xhR.style.left = `${s}px`;
    }
    setStyle(this.xh, 'opacity', `${Math.max(0, 1 - S.ads * 1.6) * (S.dead ? 0 : 1)}`);
    // damage
    const hurt = S.maxHp > 0 ? 1 - S.hp / S.maxHp : 0;
    setStyle(this.vig, 'opacity', `${Math.min(1, Math.max(0, (hurt - 0.15) * 1.4)).toFixed(2)}`);
    for (const a of this.hurtArcs) {
      if (a.t <= 0) continue;
      a.t -= dt;
      a.e.style.opacity = `${Math.max(0, a.t / 1.1).toFixed(2)}`;
      a.e.style.transform = `rotate(${(a.a * 180) / Math.PI}deg)`;
    }
    toggle(this.deadEl, 'h-on', !!S.dead);
    // boss
    if (S.boss) {
      setStyle(this.bossEl, 'display', '');
      setText(this.bossNm, S.boss.name.toUpperCase());
      setStyle(this.bossFill, 'width', `${Math.max(0, Math.min(100, (100 * S.boss.hp) / S.boss.max)).toFixed(1)}%`);
    } else setStyle(this.bossEl, 'display', 'none');
  }

  /** Points popup (+10, +100 ...). */
  points(n) {
    const e = this.popPool[this.popI++ % this.popPool.length];
    e.textContent = `${n > 0 ? '+' : ''}${n}`;
    e.className = n < 0 ? 'h-neg' : '';
    e.style.right = `${Math.round(Math.random() * 30)}px`;
    void e.offsetWidth;
    e.classList.add('h-go');
  }

  hit(kind) {
    this.hm.className = 'h-hm' + (kind === 'kill' ? ' h-kill' : kind === 'head' ? ' h-head' : '');
    void this.hm.offsetWidth;
    this.hm.classList.add('h-go');
  }

  /** A blow from screen angle a (rad, 0 = straight ahead, clockwise). */
  hurt(a) {
    let best = this.hurtArcs[0];
    for (const x of this.hurtArcs) if (x.t < best.t) best = x;
    best.t = 1.1;
    best.a = a;
    retrigger(this.flashEl, 'h-go');
  }

  bannerShow(big, small = '') {
    setText(this.bannerBig, big);
    setText(this.bannerSm, small);
    retrigger(this.banner, 'h-go');
  }

  alert(text) {
    setText(this.alertEl, text);
    retrigger(this.alertEl, 'h-go');
  }

  denied() {
    retrigger(this.prompt, 'h-shake');
  }

  dispose() {
    this.root.remove();
  }
}
