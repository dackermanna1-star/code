// Stand-in HUD: plain text panels, a crosshair, a scope ring, a bare shop list.
import { RIFLES, AMMO, UPGRADES, DEFENCES, RIFLE_ORDER, AMMO_ORDER, UPGRADE_ORDER, DEFENCE_ORDER } from '../catalog.js';

export class TowerHud {
  constructor(parent, handlers) {
    this.h = handlers;
    const d = (css) => {
      const e = document.createElement('div');
      e.style.cssText = css;
      parent.appendChild(e);
      return e;
    };
    this.info = d('position:fixed;left:12px;top:10px;color:#e8d8a0;font:14px monospace;white-space:pre;text-shadow:0 1px 2px #000;z-index:20;pointer-events:none');
    this.cross = d('position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px;border:1px solid #fff;z-index:20;pointer-events:none');
    this.scope = d('position:fixed;inset:0;z-index:19;pointer-events:none;opacity:0;background:radial-gradient(circle at center, transparent 0, transparent 40vmin, #000 40.5vmin)');
    this.scope.innerHTML = '<div style="position:absolute;left:50%;top:10%;bottom:10%;width:1px;background:#000"></div><div style="position:absolute;top:50%;left:20%;right:20%;height:1px;background:#000"></div>';
    this.msg = d('position:fixed;left:0;right:0;top:30%;text-align:center;color:#ffd98a;font:bold 34px monospace;text-shadow:0 2px 4px #000;z-index:21;pointer-events:none');
    this.screen = d('position:fixed;inset:0;z-index:30;display:none;background:rgba(10,8,6,0.85);color:#e8d8a0;font:15px monospace;overflow:auto;padding:30px');
    this.msgT = 0;
  }
  update(dt, S) {
    this.msgT -= dt;
    if (this.msgT <= 0) this.msg.textContent = '';
    const r = S.rifle;
    this.info.textContent = `$${S.cash}   WAVE ${S.wave} (${S.phase})   LEFT ${S.toKill}\nGATE ${Math.round(S.gate.hp)}/${S.gate.max}   CABIN ${Math.round(S.player.hp)}\n${r.name} ${r.ammo}/${r.mag}${r.reloading ? ' RELOADING' : ''}  ${S.ammoType.name}${S.ammoType.count < Infinity ? ' x' + S.ammoType.count : ''}\nbreath ${(S.breath * 100) | 0}%  focus ${(S.focus * 100) | 0}%${S.focusActive ? ' ACTIVE' : ''}\n${S.rangeM ? 'range ' + S.rangeM + ' m  ' : ''}wind ${S.wind.speed.toFixed(1)} m/s  fps ${S.fps}${S.placing ? '\nPLACE ' + S.placing.toUpperCase() + ': click the ground, R rotate, Esc done' : ''}${S.boss ? '\nBOSS ' + S.boss.name + ' ' + Math.round(S.boss.hp) : ''}`;
    this.scope.style.opacity = S.scope > 0.98 ? 1 : 0;
    this.cross.style.display = S.scope > 0.98 ? 'none' : '';
  }
  event(e) {
    if (e.type === 'wave') this.flash(`WAVE ${e.n}${e.boss ? ' — ' + e.boss : ''}`, 3);
    else if (e.type === 'bonus') this.flash(`${e.text} +$${e.cash}`, 1.5);
    else if (e.type === 'cleared') this.flash('WAVE CLEARED', 3);
  }
  flash(t, s) {
    this.msg.textContent = t;
    this.msgT = s;
  }
  showShop(st) {
    const rows = [];
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'margin:3px;font:13px monospace';
      b.onclick = fn;
      return b;
    };
    this.screen.innerHTML = `<h2>SUPPLIES — wave ${st.wave} done — $${st.cash}</h2>`;
    const add = (title, list, cat, priceOf) => {
      const h = document.createElement('h3');
      h.textContent = title;
      this.screen.appendChild(h);
      for (const [id, item] of list) this.screen.appendChild(btn(`${item.name} $${priceOf(id, item)}`, () => this.h.onShopBuy(cat, id)));
    };
    add('Rifles', RIFLE_ORDER.map((k) => [k, RIFLES[k]]), 'rifle', (k, r) => (st.owned.rifles.has(k) ? 'owned' : r.price));
    add('Ammo', AMMO_ORDER.filter((k) => k !== 'fmj').map((k) => [k, AMMO[k]]), 'ammo', (k, a) => a.price);
    add('Upgrades', UPGRADE_ORDER.map((k) => [k, UPGRADES[k]]), 'upgrade', (k, u) => (u.levels[st.owned.upgrades[k] || 0] || { price: 'max' }).price);
    add('Defences', DEFENCE_ORDER.map((k) => [k, DEFENCES[k]]), 'defence', (k, d) => d.price);
    this.screen.appendChild(document.createElement('br'));
    this.screen.appendChild(btn('NEXT WAVE ▶', () => this.h.onShopClose()));
    this.screen.style.display = 'block';
    void rows;
  }
  hideShop() {
    this.screen.style.display = 'none';
  }
  showTitle(meta) {
    this.screen.innerHTML = `<h1>LAST LOOKOUT</h1><p>best wave ${meta.bestWave || 0} · best score ${meta.bestScore || 0}</p>`;
    this.screen.appendChild(Object.assign(document.createElement('button'), { textContent: 'START', onclick: () => this.h.onStart() }));
    if (meta.canContinue) this.screen.appendChild(Object.assign(document.createElement('button'), { textContent: 'CONTINUE', onclick: () => this.h.onContinue() }));
    this.screen.style.display = 'block';
  }
  showPause() {
    this.screen.innerHTML = '<h1>PAUSED</h1>';
    this.screen.appendChild(Object.assign(document.createElement('button'), { textContent: 'RESUME', onclick: () => this.h.onResume() }));
    this.screen.appendChild(Object.assign(document.createElement('button'), { textContent: 'QUIT', onclick: () => this.h.onQuit() }));
    this.screen.style.display = 'block';
  }
  showGameOver(st) {
    this.screen.innerHTML = `<h1>${st.reason === 'gate' ? 'THE GATE IS DOWN' : 'OVERRUN'}</h1><pre>${JSON.stringify(st, null, 1)}</pre>`;
    this.screen.appendChild(Object.assign(document.createElement('button'), { textContent: 'AGAIN', onclick: () => this.h.onRestart() }));
    this.screen.style.display = 'block';
  }
  hideScreens() {
    this.screen.style.display = 'none';
  }
}
