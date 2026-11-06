// UI test harness: mounts the UI over a fake voxel scene with the mock game.
//   /dev/ui-test.html?screen=hud|inventory|crafting|health|skills|map|menu|newgame|settings|controls|credits|
//                            loading|pause|death|note|dialog|icons
//   extra flags: &scope=1 &nowatch=1 &nocompass=1 &revealed=1 &nosave=1 &infected=1 &jam=1 &calm=1
import { UI } from '../src/ui/UI.js';
import { createMockGame, MOCK_NOTES } from './ui-mock.js';
import { PIXEL_ICONS, pixelURL } from '../src/ui/pixel.js';

const q = new URLSearchParams(location.search);
const screen = q.get('screen') || 'hud';
const flag = (k) => q.get(k) === '1';

window.__uiLog = [];
window.__sounds = [];
const game = createMockGame({
  scope: flag('scope'), watch: !flag('nowatch'), compass: !flag('nocompass'), revealed: flag('revealed'),
  save: !flag('nosave'), state: ['menu', 'newgame', 'settings', 'controls', 'credits'].includes(screen) ? 'menu' : 'playing',
});
if (flag('infected')) game.player.infectionKnown = true;
if (flag('jam')) game.hud.ammo.jammed = true;
if (flag('calm')) {
  Object.assign(game.player, { health: 100, hunger: 90, thirst: 90, stamina: 100, bodyTemp: 37, panic: 0, pain: 0, moodles: [] });
  game.hud.progress = null;
  game.hud.interaction = null;
}
window.game = game;

// ---------------------------------------------------------------- fake voxel scene behind the HUD
function drawScene() {
  const c = document.createElement('canvas');
  const W = 320, H = 180;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, '#6a7a8a'); sky.addColorStop(1, '#a8a89a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // far trees
  for (let x = 0; x < W; x += 6) {
    const h = 18 + ((x * 37) % 13);
    g.fillStyle = '#4a5a46'; g.fillRect(x, 100 - h, 6, h);
  }
  // houses
  const house = (x, y, w, h, wall, roof) => {
    g.fillStyle = wall; g.fillRect(x, y, w, h);
    g.fillStyle = roof; for (let i = 0; i < w / 2; i++) g.fillRect(x - 2 + i, y - i, w + 4 - i * 2, 1);
    g.fillStyle = '#20262a'; g.fillRect(x + 4, y + 6, 6, 6); g.fillRect(x + w - 10, y + 6, 6, 6);
    g.fillStyle = '#3a2a1e'; g.fillRect(x + w / 2 - 3, y + h - 12, 6, 12);
  };
  house(40, 74, 44, 28, '#b8a890', '#5a3a2a');
  house(196, 70, 56, 32, '#8a9aa8', '#3a3a3a');
  house(268, 78, 36, 24, '#c8b8a0', '#6a2a1a');
  // ground (grass + road)
  for (let y = 100; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const n = ((x * 13 + y * 7) % 5);
      g.fillStyle = ['#5a7a3a', '#628240', '#567438', '#5e7c3c', '#668a44'][n];
      g.fillRect(x, y, 4, 4);
    }
  }
  g.fillStyle = '#3a3a3c';
  g.beginPath(); g.moveTo(140, 100); g.lineTo(180, 100); g.lineTo(260, H); g.lineTo(60, H); g.closePath(); g.fill();
  g.fillStyle = '#c8b040'; for (let y = 104; y < H; y += 12) g.fillRect(158 + (y - 100) * 0.05, y, 3, 6);
  // zombie silhouette
  g.fillStyle = '#4a5a3a'; g.fillRect(212, 104, 6, 6);
  g.fillStyle = '#3a4a5a'; g.fillRect(211, 110, 8, 10);
  g.fillStyle = '#2a2a3a'; g.fillRect(211, 120, 3, 9); g.fillRect(216, 120, 3, 9);
  g.fillStyle = '#4a5a3a'; g.fillRect(219, 110, 6, 3); g.fillRect(205, 110, 6, 3);
  return c;
}
const sceneEl = document.getElementById('game');
if (!['menu', 'newgame', 'settings', 'controls', 'credits', 'loading', 'icons'].includes(screen)) sceneEl.appendChild(drawScene());

// ---------------------------------------------------------------- UI
const ui = new UI(game, document.getElementById('ui'));
game.ui = ui;
window.ui = ui;

let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (game.state === 'playing' || game.state === 'paused') ui.update(dt);
  requestAnimationFrame(frame);
}

document.addEventListener('keydown', (e) => {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  if (ui.handleKey(e)) { e.preventDefault(); return; }
  if (e.key === 'Escape' && game.state === 'playing') { game.state = 'paused'; ui.showPause(); }
  if (e.key >= '1' && e.key <= '9') game.player.inv.selected = +e.key - 1;
});

function setup() {
  switch (screen) {
    case 'hud':
      ui.update(0.016);
      ui.toast('You found a can of beans.', 'good');
      ui.toast('You hear something moving nearby…', 'warn');
      ui.toast('You are bleeding!', 'danger');
      ui.locationBanner('Millbrook General Hospital', 'Millbrook, Kentucky');
      ui.subtitle('WKMB Radio: …this is an emergency broadcast. Residents of Millbrook County should remain indoors…', 30);
      setTimeout(() => ui.hitMarker('headshot'), 900);
      setTimeout(() => ui.damageIndicator(Math.PI * 0.6), 950);
      ui.setCrosshair(0.25);
      break;
    case 'inventory': ui.update(0.016); ui.openInventory(); break;
    case 'crafting': ui.update(0.016); ui.openPanel('crafting'); break;
    case 'health': ui.update(0.016); ui.openPanel('health'); break;
    case 'skills': ui.update(0.016); ui.openPanel('skills'); break;
    case 'map': ui.update(0.016); ui.openPanel('map'); break;
    case 'menu': ui.showMainMenu(); break;
    case 'newgame': case 'settings': case 'controls': case 'credits': ui.showMainMenu(screen); break;
    case 'loading': ui.showLoading('Generating Millbrook — furnishing houses…', 0.62); break;
    case 'pause': ui.update(0.016); game.state = 'paused'; ui.showPause(); break;
    case 'death':
      game.state = 'dead';
      ui.showDeath({
        name: game.player.name, profession: 'nurse', daysSurvived: 4.3, kills: 37,
        cause: 'Bitten on the neck by a runner behind Hollis Hardware.', skills: game.player.skills,
      });
      break;
    case 'note': ui.update(0.016); ui.showNote(MOCK_NOTES.note_hospital); break;
    case 'dialog':
      ui.update(0.016);
      ui.showDialog({
        title: 'Sleep until morning?', text: 'You will sleep for about 9 hours. Zombies may find you if the house is not barricaded.',
        buttons: [{ label: 'Sleep', run: () => {} }, { label: 'Cancel', run: () => {} }],
      });
      break;
    case 'icons': {
      const box = document.getElementById('icons');
      box.style.display = 'block';
      for (const name of Object.keys(PIXEL_ICONS)) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const img = document.createElement('img');
        img.src = pixelURL(name);
        cell.append(img, document.createTextNode(name));
        box.appendChild(cell);
      }
      break;
    }
    default: break;
  }
  requestAnimationFrame(frame);
}

document.fonts.ready.then(() => { setup(); window.__ready = true; });
