// UI preview: mounts a fake 4:3 #game-view (same sizing as Stage) over a grey
// gradient and demonstrates the HUD, the world overlay and every screen.
//
//   preview/ui.html?screen=hud            animated HUD + overlay (default)
//   preview/ui.html?screen=hud&fake=ref2  frozen HUD matching docs/reference/ref2.jpg (also ref1, ref5)
//   preview/ui.html?screen=title|pause|gameover|victory|splash|options|help
import { HUD_WEAPONS, WEAPONS, type WeaponId } from '../config/weapons';
import type { EnemyType } from '../config/enemies';
import { Hud, type HudSnapshot, type HudWeaponSlot } from '../ui/Hud';
import { WorldOverlay, type OverlayText } from '../ui/WorldOverlay';
import { Screens, type GameStats } from '../ui/Screens';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'hud';
const fake = params.get('fake');

// --- fake game view (Stage.resize logic) ----------------------------------
const host = document.getElementById('app') ?? document.body;
const view = document.createElement('div');
view.id = 'game-view';
host.appendChild(view);
Object.assign(view.style, {
  background:
    'linear-gradient(to bottom, #c3c4d2 0%, #b4b9cb 22%, #cfd5e2 30%, #9aa3b5 31%, #dfe4ec 34%, #d4dae4 62%, #c6ced9 92%, #5d6b80 93%, #8796ab 100%)',
});
const fit = () => {
  const k = Math.min(window.innerWidth / 640, window.innerHeight / 480);
  const w = Math.floor(640 * k);
  const h = Math.floor(480 * k);
  Object.assign(view.style, {
    width: `${w}px`,
    height: `${h}px`,
    left: `${Math.floor((window.innerWidth - w) / 2)}px`,
    top: `${Math.floor((window.innerHeight - h) / 2)}px`,
  });
  view.style.setProperty('--k', String(w / 640));
};
window.addEventListener('resize', fit);
fit();

// --- placeholder weapon icons (simple silhouettes drawn on a canvas) -------
function makeIcon(id: WeaponId): string {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 116;
  const g = c.getContext('2d')!;
  g.scale(4, 4);
  const metal = '#c9ccd2';
  const dark = '#3a3d44';
  const wood = '#6b3a1c';
  const rect = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  g.lineJoin = 'round';
  switch (id) {
    case 'grenades':
      g.fillStyle = '#3d6b2a';
      g.beginPath();
      g.ellipse(24, 16, 8, 10, 0, 0, Math.PI * 2);
      g.fill();
      rect(21, 4, 6, 3, '#555');
      break;
    case 'flunk':
      rect(10, 9, 22, 12, '#8a8d93');
      rect(18, 11, 8, 8, '#d3a520');
      rect(32, 14, 8, 11, wood);
      break;
    case 'minigun':
      for (let i = 0; i < 4; i++) rect(6, 9 + i * 3, 30, 2, i % 2 ? '#8a8d93' : metal);
      rect(34, 6, 9, 13, '#2e5a2a');
      break;
    default: {
      const long = { magnum: 18, mp5: 26, shotgun: 34, mac10: 20, m4: 32, awp: 38, vintage: 38 } as Record<string, number>;
      const L = long[id] ?? 26;
      const x0 = 44 - L;
      rect(x0, 11, L - 8, 3, id === 'vintage' ? dark : metal);
      rect(36, 10, 8, 6, id === 'magnum' || id === 'vintage' || id === 'shotgun' ? wood : dark);
      rect(30, 14, 4, 9, dark);
      if (id === 'awp') rect(22, 7, 10, 3, '#4a7a3a');
      if (id === 'mac10') rect(14, 15, 20, 3, metal);
    }
  }
  return c.toDataURL();
}

const icons: Partial<Record<WeaponId, string>> = {};
if (params.get('icons') !== '0') for (const id of HUD_WEAPONS) icons[id] = makeIcon(id);

// --- fake data ------------------------------------------------------------
const stats: GameStats = {
  timeSec: 373,
  level: 5,
  levelName: 'Level 5',
  kills: 248,
  killsByType: { seal: 121, activist: 44, cub: 19, penguin: 38, fatseal: 9, bear: 3, turtle: 1 } as Partial<Record<EnemyType, number>>,
  moneyEarned: 31540,
  moneyLeft: 5580,
  shots: 2410,
  hits: 1585,
  headshots: 212,
  niceShots: 17,
  bestNiceShot: 6,
  weaponsBought: ['magnum', 'mp5', 'shotgun', 'flunk', 'm4', 'minigun'],
  favoriteWeapon: 'minigun',
};

function slots(money: number, owned: Partial<Record<WeaponId, number>>, selected: WeaponId | null): HudWeaponSlot[] {
  return HUD_WEAPONS.map((id) => {
    const isOwned = owned[id] !== undefined;
    return {
      id,
      price: WEAPONS[id].price,
      owned: isOwned,
      selected: id === selected,
      affordable: money >= WEAPONS[id].price,
      caption: isOwned ? `x${owned[id]}` : `$${WEAPONS[id].price}`,
    };
  });
}

const FAKES: Record<string, HudSnapshot> = {
  ref1: { mode: 'level', label: 'Level 1:', progress: 0.0695, money: 0, kills: 0, slots: slots(0, {}, null) },
  ref2: { mode: 'level', label: 'Level 2:', progress: 0.956, money: 4160, kills: 57, slots: slots(4160, { magnum: 0 }, 'magnum') },
  ref5: {
    mode: 'boss',
    label: 'Boss:',
    progress: 0.2725,
    money: 8665,
    kills: 273,
    slots: slots(8665, { magnum: 3, flunk: 5, minigun: 32 }, 'minigun'),
  },
};

const hud = new Hud(view, icons);
if (fake || params.get('tint') === '0') hud.levelBarTint = false;
const overlay = new WorldOverlay(view);
const screens = new Screens(view);
screens.onOptionsChange = (o) => console.log('[options]', JSON.stringify(o));
hud.onSlotClick = (id) => {
  screens.message(`Clicked ${WEAPONS[id].name}`);
  selectedSlot = id;
  if (owned[id] === undefined && money >= WEAPONS[id].price) {
    money -= WEAPONS[id].price;
    owned[id] = WEAPONS[id].clip;
  }
};

const noop = () => undefined;
const log = (what: string) => () => console.log('[screens]', what);
let hudVisible = true;

switch (screen) {
  case 'title':
    hudVisible = false;
    screens.showTitle({ onStart: () => { hudVisible = true; screens.showSplash('Level 1'); } });
    break;
  case 'pause':
    screens.showPause({ onResume: log('resume'), onRestart: log('restart'), onQuit: log('quit') });
    break;
  case 'gameover':
    screens.showGameOver('A brown seal reached the edge of the floe.', stats, { onRetry: log('retry'), onTitle: log('title') });
    break;
  case 'victory':
    screens.showVictory({ ...stats, timeSec: 455, level: 6, levelName: 'Last seal on the planet', kills: 311 }, { onRetry: log('retry'), onTitle: log('title') });
    break;
  case 'splash':
    screens.showSplash('Level 2', 6000);
    break;
  case 'options':
    screens.showOptions(noop);
    break;
  case 'help':
    screens.showHelp(noop);
    break;
  default:
    break;
}
hud.setVisible(hudVisible);
if (screen === 'hud' && !fake) {
  screens.message('Get ready: the seals are coming!');
  window.setTimeout(() => screens.message('You bought the Magnum.'), 900);
}

// --- animated HUD + overlay ----------------------------------------------
let money = 0;
let kills = 0;
const owned: Partial<Record<WeaponId, number>> = {};
let selectedSlot: WeaponId | null = null;
const popups: Array<{ x: number; y: number; t: number; amount: number }> = [];
let last = performance.now();
let t = 0;
let nextKill = 0.6;
let fpsAcc = 0;
let fpsFrames = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  const W = view.clientWidth;
  const H = view.clientHeight;
  const k = W / 640;

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc > 0.5) {
    screens.setFps(screens.options.showFps || screen === 'hud' ? fpsFrames / fpsAcc : null);
    fpsAcc = 0;
    fpsFrames = 0;
  }

  if (screen !== 'hud') {
    overlay.render({ crosshairs: [], texts: [] });
    return;
  }
  if (fake && FAKES[fake]) {
    hud.update(FAKES[fake]);
    const f = FAKES[fake];
    overlay.render({
      crosshairs: [{ x: 0.19 * W, y: 0.67 * H, text: f.money ? '90%' : '12', textColor: f.money ? 'rgba(255,80,80,0.75)' : 'rgba(0,255,0,0.55)' }],
      texts: [{ x: 0.285 * W, y: 0.6 * H, text: `$${f.money}`, color: '#33363c', alpha: 1, size: 10 }],
    });
    return;
  }

  // Money ticks up with fake kills.
  if (t > nextKill) {
    nextKill = t + 0.35 + Math.random() * 0.7;
    const amount = Math.random() < 0.2 ? 60 : 50;
    money += amount;
    kills++;
    popups.push({ x: (0.05 + Math.random() * 0.12) * W, y: (0.45 + Math.random() * 0.4) * H, t: 0, amount });
  }
  // Auto-buy and select to show owned / selected slots.
  for (const id of HUD_WEAPONS) {
    if (owned[id] === undefined && money >= WEAPONS[id].price * 1.6) {
      money -= WEAPONS[id].price;
      owned[id] = WEAPONS[id].clip;
      selectedSlot = id;
      screens.message(`You bought the ${WEAPONS[id].name}.`);
    }
  }
  const sel = selectedSlot;
  if (sel && owned[sel] !== undefined && Math.random() < dt * 6) {
    owned[sel] = (owned[sel]! - 1 + WEAPONS[sel].clip + 1) % (WEAPONS[sel].clip + 1);
  }

  const cycle = t % 24;
  const boss = cycle > 16;
  const snap: HudSnapshot = {
    mode: boss ? 'boss' : 'level',
    label: boss ? 'Boss:' : `Level ${1 + Math.floor(t / 24)}:`,
    progress: boss ? 1 - (cycle - 16) / 8 : cycle / 16,
    money,
    kills,
    slots: slots(money, owned, sel),
  };
  hud.update(snap);

  // Overlay: crosshair with ammo / reload, money above the hunter, popups.
  const hx = (0.28 + 0.04 * Math.sin(t * 0.7)) * W;
  const hy = (0.67 + 0.05 * Math.sin(t * 0.45)) * H;
  const reload = (t % 5) / 5;
  const reloading = reload > 0.7;
  const pct = Math.floor(((reload - 0.7) / 0.3) * 10) * 10;
  const texts: OverlayText[] = [{ x: hx + 2 * k, y: hy - 27 * k, text: `$${money}`, color: '#33363c', alpha: 1 }];
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt;
    if (p.t > 1) {
      popups.splice(i, 1);
      continue;
    }
    texts.push({ x: p.x, y: p.y - p.t * 50 * k, text: `+${p.amount}$`, color: '#ff0000', alpha: 0.4 * (1 - p.t), size: 10 });
  }
  const ammo = sel && owned[sel] !== undefined ? owned[sel]! : 12;
  const frac = ammo / (sel ? WEAPONS[sel].clip : 12);
  overlay.render({
    crosshairs: [
      {
        x: hx - 48 * k,
        y: hy,
        text: reloading ? `${pct}%` : String(ammo),
        textColor: reloading
          ? `rgba(${255 - pct * 1.5},${pct * 1.5},0,${1 - pct / 100})`
          : `rgba(${Math.round(255 - 150 * frac)},${Math.round(150 * frac)},0,${(255 - 100 * frac) / 255})`,
      },
    ],
    texts,
    lines: sel === 'awp' ? [{ x0: hx - 30 * k, y0: hy, x1: 0, y1: hy, color: '#ff0000', width: 1, alpha: 0.5 }] : [],
    vignette: t % 10 > 8 ? Math.sin(((t % 10) - 8) * Math.PI * 0.5) * 0.7 : 0,
  });
}
requestAnimationFrame(frame);

// Expose for manual poking from the console.
Object.assign(window, { hud, overlay, screens });
