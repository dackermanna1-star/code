// HUD + menus preview over a static dust-coloured backdrop with mock game state.
// Query params:
//   menu      buy | team | class | score | main | console | loading | options | newgame | chat
//             (buy: &cat=1..8 opens a category, &team=T|CT, &money=N; class: &team=T|CT)
//   bg        scene (default) | black | grey | <css colour>  (black = pure additive HUD contribution)
//   res       WxH internal render resolution (e.g. 640x480: HUD laid out at that size and stretched)
//   aspect    4:3 to pillarbox the viewport
//   hp ap helmet=1 money w(weapon id) clip reserve time(round seconds, 'none' hides) planted=1
//   c4=1 bombzone=1 buyzone=0 defuser=1 scope=1|2 flash=0..1 nvg=1 fps=N (0 hides) net=1
//   gap chsize=small|medium|large chcolor=r,g,b dead=1 spec=Name team=T|CT|SPEC light=1 (flashlight on)
//   kills=0 chat=0 center=<text> delta=+300 dmg=front,left,... demo=1 (animate) clean=1 (hide buttons)
import { Hud } from '../../src/ui/hud.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) && Q.get(k) !== '' ? Number(Q.get(k)) : d);
const app = document.getElementById('app');

// ------------------------------------------------------------------ backdrop
const bgCanvas = document.createElement('canvas');
bgCanvas.id = 'game-canvas';
app.appendChild(bgCanvas);

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function paintScene(c, w, h) {
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const mode = Q.get('bg') || 'scene';
  if (mode !== 'scene') {
    g.fillStyle = mode === 'grey' ? '#808080' : mode;
    g.fillRect(0, 0, w, h);
    return;
  }
  const r = rand(7);
  // sky
  let gr = g.createLinearGradient(0, 0, 0, h * 0.45);
  gr.addColorStop(0, '#5f86c4');
  gr.addColorStop(0.6, '#a9bfdc');
  gr.addColorStop(1, '#d9dde0');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h * 0.45);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(r() * w, r() * h * 0.25, 40 + r() * 120, 8 + r() * 20, 0, 0, Math.PI * 2);
    g.fill();
  }
  // mountains
  g.fillStyle = '#7d6a5c';
  g.beginPath();
  g.moveTo(0, h * 0.42);
  for (let x = 0; x <= w; x += w / 24) g.lineTo(x, h * (0.18 + r() * 0.2));
  g.lineTo(w, h * 0.45);
  g.lineTo(0, h * 0.45);
  g.fill();
  // sandstone wall band
  gr = g.createLinearGradient(0, h * 0.3, 0, h * 0.55);
  gr.addColorStop(0, '#c9a46a');
  gr.addColorStop(1, '#a8834e');
  g.fillStyle = gr;
  g.fillRect(0, h * 0.32, w, h * 0.24);
  g.strokeStyle = 'rgba(80,55,25,0.35)';
  g.lineWidth = 1;
  for (let y = h * 0.32; y < h * 0.56; y += h * 0.03) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    const off = r() * 60;
    for (let x = off; x < w; x += 50 + r() * 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h * 0.03); g.stroke(); }
  }
  // crates
  for (const [cx, cw] of [[0.33, 0.13], [0.7, 0.09]]) {
    g.fillStyle = '#8a6a3a';
    g.fillRect(w * cx, h * 0.36, w * cw, h * 0.2);
    g.strokeStyle = '#5a4320';
    g.lineWidth = Math.max(2, w / 400);
    g.strokeRect(w * cx, h * 0.36, w * cw, h * 0.2);
    g.beginPath(); g.moveTo(w * cx, h * 0.36); g.lineTo(w * (cx + cw), h * 0.56); g.moveTo(w * (cx + cw), h * 0.36); g.lineTo(w * cx, h * 0.56); g.stroke();
  }
  // sand floor
  gr = g.createLinearGradient(0, h * 0.55, 0, h);
  gr.addColorStop(0, '#c8a265');
  gr.addColorStop(1, '#9c7a48');
  g.fillStyle = gr;
  g.fillRect(0, h * 0.555, w, h * 0.45);
  const img = g.getImageData(0, Math.floor(h * 0.555), w, h - Math.floor(h * 0.555));
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 34;
    img.data[i] += n; img.data[i + 1] += n * 0.9; img.data[i + 2] += n * 0.7;
  }
  g.putImageData(img, 0, Math.floor(h * 0.555));
  // shadow band like ref 1
  g.fillStyle = 'rgba(40,25,10,0.25)';
  g.beginPath();
  g.moveTo(0, h * 0.62); g.lineTo(w * 0.45, h * 0.6); g.lineTo(w * 0.3, h * 0.8); g.lineTo(0, h * 0.85);
  g.fill();
}

// ------------------------------------------------------------------ layout
const hud = new Hud(app);
let menus = null;

function viewport() {
  const cw = app.clientWidth, ch = app.clientHeight;
  let w = cw, h = ch;
  if (Q.get('aspect') === '4:3') {
    if (cw / ch > 4 / 3) w = Math.round((ch * 4) / 3); else h = Math.round((cw * 3) / 4);
  }
  const vp = { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w, h };
  const res = Q.get('res');
  if (res) {
    const [, rh] = res.split('x').map(Number);
    vp.rh = rh;
    vp.rw = Math.round((rh * w) / h);
  }
  return vp;
}

function layout() {
  const vp = viewport();
  Object.assign(bgCanvas.style, { left: vp.x + 'px', top: vp.y + 'px', width: vp.w + 'px', height: vp.h + 'px' });
  paintScene(bgCanvas, vp.rw || vp.w, vp.rh || vp.h);
  hud.resize(vp);
  menus?.resize?.(vp);
}
layout();
window.addEventListener('resize', layout);

// ------------------------------------------------------------------ mock state
const team = Q.get('team') || 'CT';
const weapon = Q.get('w') || (team === 'T' ? 'ak47' : 'm4a1');
const timeParam = Q.get('time');
const state = {
  alive: Q.get('dead') !== '1' && team !== 'SPEC',
  team,
  health: num('hp', 100),
  armor: num('ap', 100),
  helmet: Q.get('helmet') !== '0',
  money: num('money', 16000),
  weaponId: weapon,
  clip: Q.get('clip') === 'none' ? null : num('clip', weapon === 'knife' ? null : 30),
  reserve: Q.get('reserve') === 'none' ? null : num('reserve', weapon === 'knife' ? null : 90),
  roundTime: timeParam === 'none' ? null : num('time', 140),
  bombPlanted: Q.get('planted') === '1',
  hasC4: Q.get('c4') === '1',
  inBombZone: Q.get('bombzone') === '1',
  inBuyZone: Q.get('buyzone') !== '0',
  hasDefuser: Q.get('defuser') === '1',
  crosshair: {
    visible: true,
    gap: num('gap', 4),
    color: Q.get('chcolor') ? Q.get('chcolor').split(',').map(Number) : [50, 250, 50],
    size: Q.get('chsize') || 'auto',
  },
  scope: num('scope', 0),
  radar: {
    yaw: 90,
    pos: [0, 0, 0],
    range: 1024,
    blips: [
      { x: 300, y: 420, z: 0, kind: 'teammate', alive: true },
      { x: -500, y: 150, z: 200, kind: 'teammate', alive: true },
      { x: 120, y: -380, z: -260, kind: 'teammate', alive: true, flash: true },
      { x: -200, y: 700, z: 0, kind: 'bomb_planted' },
    ],
  },
  fps: Q.get('fps') === '0' ? null : num('fps', 249),
  netgraph: Q.get('net') === '1' ? { fps: 239.8, inBytes: 34, outBytes: 19, inRate: 14.99, outRate: 13.26, loss: 0, choke: 0 } : null,
  flash: num('flash', 0),
  damage: [],
  spectator: Q.get('spec') ? { target: Q.get('spec'), targetTeam: 'T', health: 76, mode: 'locked', tScore: 3, ctScore: 5 } : null,
  nightvision: Q.get('nvg') === '1',
  flashlight: { on: Q.get('light') === '1', battery: 1 },
};
if (Q.get('dmg')) state.damage = Q.get('dmg').split(',').map((dir) => ({ dir, t: 0 }));

const sampleKills = [
  { attacker: 'Josh', attackerTeam: 'CT', victim: 'Graham', victimTeam: 'T', weapon: 'hegrenade' },
  { attacker: 'Vinny', attackerTeam: 'T', victim: 'Player', victimTeam: 'CT', weapon: 'ak47', headshot: true },
  { attacker: 'Rex', attackerTeam: 'CT', victim: 'Zach', victimTeam: 'T', weapon: 'awp' },
  { attacker: '', attackerTeam: null, victim: 'Brett', victimTeam: 'T', weapon: 'world' },
];
for (const k of sampleKills.slice(0, num('kills', 4))) hud.addKill(k);
if (Q.get('chat') !== '0') {
  hud.chat('Graham', 'T', 'gg', { dead: true });
  hud.chat('Rex', 'CT', 'rush B', { teamOnly: true });
  hud.radio('Josh', 'CT', 'Fire in the hole!');
  hud.hint('Press the BUY key to purchase items.');
}
if (Q.get('center')) hud.centerPrint(Q.get('center'), 1e6);
if (Q.get('delta')) {
  hud.moneyDelta(Number(Q.get('delta')));
}

// ------------------------------------------------------------------ menus
const bar = document.getElementById('bar');
if (Q.get('clean') === '1') bar.style.display = 'none';

async function setupMenus() {
  let mod;
  try { mod = await import('../../src/ui/menus.js'); } catch (e) { console.warn('menus unavailable', e); return; }
  menus = new mod.Menus(app, { onCommand: (c) => console.log('cmd', c) });
  menus.resize?.(viewport());
  window.__menus = menus;
  const players = [
    { name: 'Vinny', team: 'T', kills: 12, deaths: 4, ping: 34, alive: true, bomb: true },
    { name: 'Graham', team: 'T', kills: 7, deaths: 9, ping: 48, alive: false },
    { name: 'Brett', team: 'T', kills: 3, deaths: 10, ping: 61, alive: true },
    { name: 'Zach', team: 'T', kills: 1, deaths: 6, ping: 22, alive: false },
    { name: 'Player', team: 'CT', kills: 15, deaths: 3, ping: 5, alive: true, isLocal: true },
    { name: 'Josh', team: 'CT', kills: 9, deaths: 7, ping: 41, alive: true },
    { name: 'Rex', team: 'CT', kills: 6, deaths: 8, ping: 57, alive: false },
  ];
  const show = {
    buy: () => menus.showBuyMenu({ team, money: state.money }, { onBuy: (id) => console.log('buy', id) }),
    team: () => menus.showTeamSelect((t) => console.log('team', t)),
    class: () => menus.showClassSelect(team === 'SPEC' ? 'T' : team, (c) => console.log('class', c)),
    score: () => menus.showScoreboard({ tScore: 3, ctScore: 5, players }),
    main: () => menus.showMain({ inGame: true }),
    console: () => {
      menus.toggleConsole();
      menus.print('Counter-Strike 1.6 (build 3266)');
      menus.print('Server # 1: de_dust2, 10 players');
      menus.print('] say hello', [255, 255, 255]);
      menus.print('Unknown command: foo', [255, 120, 120]);
    },
    loading: () => menus.showLoading('Precaching resources', 0.62),
    options: () => menus.showOptions({ mode: 'native', aspect: 'fill', fov: 90, sensitivity: 2.5, invertY: false, volume: 0.8, crosshairColor: [50, 250, 50], crosshairSize: 'auto', crosshairTranslucent: true, dynamicCrosshair: true, showFps: true, netGraph: 0 }, (s) => console.log('options', JSON.stringify(s))),
    newgame: () => menus.showNewGame({ botsPerTeam: 5, difficulty: 'normal', roundTime: 2.5, freezeTime: 3, c4Timer: 35, startMoney: 800 }, (o) => console.log('start', JSON.stringify(o))),
    chat: () => menus.showChatInput(false, (t) => console.log('say', t)),
  };
  for (const [k, fn] of Object.entries(show)) {
    const b = document.createElement('button');
    b.textContent = k;
    b.onclick = () => { menus.hideAll(); fn(); };
    bar.appendChild(b);
  }
  const hide = document.createElement('button');
  hide.textContent = 'hide';
  hide.onclick = () => menus.hideAll();
  bar.appendChild(hide);
  const m = Q.get('menu');
  if (m && show[m]) {
    show[m]();
    if (m === 'buy' && Q.get('cat')) menus.buyCategory?.(Number(Q.get('cat')));
  }
}
setupMenus();

// ------------------------------------------------------------------ loop
const demo = Q.get('demo') === '1';
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  if (demo) {
    if (state.roundTime != null) state.roundTime = Math.max(0, state.roundTime - dt);
    state.crosshair.gap = 4 + Math.max(0, Math.sin(acc * 3)) * 10;
    state.radar.yaw = (90 + acc * 20) % 360;
    if (Math.floor(acc) % 4 === 0 && Math.floor(acc - dt) % 4 !== 0) {
      state.health = Math.max(1, state.health - 13);
      state.damage.push({ dir: ['front', 'left', 'right', 'back'][Math.floor(acc) % 4], t: acc });
      hud.addKill({ attacker: 'Bot' + Math.floor(acc), attackerTeam: 'T', victim: 'Ct' + Math.floor(acc), victimTeam: 'CT', weapon: ['deagle', 'm4a1', 'knife', 'p90'][Math.floor(acc) % 4], headshot: acc % 8 < 4 });
      state.money = Math.min(16000, state.money + 300);
      hud.moneyDelta(300);
    }
  }
  hud.draw(state, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__hud = hud;
window.__state = state;
window.__ready = true;
