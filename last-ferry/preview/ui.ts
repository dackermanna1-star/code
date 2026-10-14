// UI preview: a letterboxed 16:9 #game-view (same sizing as Stage) over a
// painted dusk-pier backdrop, with every HUD state and screen driven by fake
// data. Exposes window.__ui for automated checks.
//
//   preview/ui.html?screen=hud&state=early|mid|full|boss|outboard|hurt|reload|empty   frozen HUD states
//   preview/ui.html?screen=live                 animated HUD + overlay + callouts (cycles)
//   preview/ui.html?screen=callout&kind=nice|massacre|headshot|tidy|boss|info|danger
//   preview/ui.html?screen=title|splash|pause|options|help|gameover|gameover-dead|victory|loading
//   &freeze=MS   pause every CSS animation at MS (deterministic screenshots)
//   &night=1     chapter-3 backdrop + night vignette
import { WEAPON_ORDER, type WeaponId } from '../src/config/ids';
import { DESIGN_H, DESIGN_W, worldToScreen } from '../src/config/view';
import { Hud, Screens, WorldOverlay, hudSnapshot, overlayFrame as overlayFromWorld, runStats, type CalloutKind, type HudSlot, type HudSnapshot, type OverlayFrame, type RunStats } from '../src/ui';
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import { TICK } from '../src/config/world';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'live';
const state = params.get('state') ?? 'mid';
const night = params.get('night') === '1';
if (params.has('shot')) document.body.classList.add('shot');

// ------------------------------------------------------------ fake view
const host = document.getElementById('app')!;
const view = document.createElement('div');
view.id = 'game-view';
host.appendChild(view);
const bg = document.createElement('canvas');
bg.className = 'pv-bg';
view.appendChild(bg);

function fit(): void {
  const k = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
  const w = Math.floor(DESIGN_W * k);
  const h = Math.floor(DESIGN_H * k);
  Object.assign(view.style, {
    width: `${w}px`,
    height: `${h}px`,
    left: `${Math.floor((window.innerWidth - w) / 2)}px`,
    top: `${Math.floor((window.innerHeight - h) / 2)}px`,
  });
  view.style.setProperty('--k', String(w / DESIGN_W));
  paintBackdrop(w, h);
}

/** A rough painting of the game view (sea, pier deck, ferry, figures) for contrast checks. */
function paintBackdrop(w: number, h: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  bg.width = Math.round(w * dpr);
  bg.height = Math.round(h * dpr);
  bg.style.width = `${w}px`;
  bg.style.height = `${h}px`;
  const g = bg.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const P = (x: number, y: number, z: number) => {
    const p = worldToScreen(x, y, z);
    return [p.u * w, p.v * h] as const;
  };
  // Sea.
  const sea = g.createLinearGradient(0, 0, 0, h);
  if (night) {
    sea.addColorStop(0, '#0b1422');
    sea.addColorStop(1, '#04070d');
  } else {
    sea.addColorStop(0, '#d9824a');
    sea.addColorStop(0.18, '#7a5160');
    sea.addColorStop(0.45, '#2c3a4d');
    sea.addColorStop(1, '#141c27');
  }
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);
  // Glints.
  g.globalAlpha = night ? 0.15 : 0.35;
  for (let i = 0; i < 260; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 12543.123) % 1;
    g.fillStyle = night ? '#9fb8d8' : '#ffc890';
    g.fillRect(Math.abs(x) * w, Math.abs(y) * h * 0.45, 6 + (i % 5) * 3, 1);
  }
  g.globalAlpha = 1;
  // Deck.
  const corners = [P(-31, 0, -6), P(23.5, 0, -6), P(23.5, 0, 6), P(-31, 0, 6)];
  g.beginPath();
  corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  const deck = g.createLinearGradient(0, corners[0][1], 0, corners[2][1]);
  deck.addColorStop(0, night ? '#26201c' : '#5a4434');
  deck.addColorStop(1, night ? '#1a1512' : '#433226');
  g.fillStyle = deck;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = night ? 'rgba(0,0,0,0.35)' : 'rgba(20,12,6,0.45)';
  g.lineWidth = 1;
  for (let x = -31; x <= 23.5; x += 0.32) {
    const [x0, y0] = P(x, 0, -6);
    const [x1, y1] = P(x, 0, 6);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  // Blood splats.
  g.fillStyle = 'rgba(90, 8, 6, 0.55)';
  for (let i = 0; i < 14; i++) {
    const [x, y] = P(-20 + i * 2.6, 0, Math.sin(i * 3.1) * 4);
    g.beginPath();
    g.ellipse(x, y, 14 + (i % 4) * 6, 6 + (i % 3) * 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // Ferry hull (right).
  const [hx0, hy0] = P(23.5, 3, -9);
  const [, hy1] = P(23.5, -2.6, 8);
  g.fillStyle = night ? '#0e1218' : '#e9e4da';
  g.fillRect(hx0, hy0, w - hx0, hy1 - hy0);
  g.fillStyle = '#b8302a';
  g.fillRect(hx0, hy1 - (hy1 - hy0) * 0.25, w - hx0, (hy1 - hy0) * 0.25);
  g.fillStyle = night ? '#ffd27a' : '#2b3644';
  for (let i = 0; i < 8; i++) g.fillRect(hx0 + 10, hy0 + 20 + i * ((hy1 - hy0) / 10), w - hx0 - 20, 6);
  // Figures: zombies (green-grey) on the left half, the Bosun (yellow) right of centre.
  const fig = (x: number, z: number, col: string, hgt = 1.75, wdt = 0.5) => {
    const [fx, fy] = P(x, 0, z);
    const [, ty] = P(x, hgt, z);
    const [rx] = P(x + wdt / 2, 0, z);
    const bw = (rx - fx) * 2;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(fx, fy, bw * 0.9, bw * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    if (g.roundRect) g.roundRect(fx - bw / 2, ty, bw, fy - ty, bw / 2.5);
    else g.rect(fx - bw / 2, ty, bw, fy - ty);
    g.fill();
  };
  if (screen === 'sim') return;
  const zs: Array<[number, number]> = [[-18, -3], [-14, 1.5], [-11, -0.5], [-9, 3.4], [-6, -2.2], [-3.5, 1], [-1, -4], [2, 2.6]];
  for (const [x, z] of zs) fig(x, z, night ? '#3d4a3a' : '#6f7d63');
  fig(9, 0.4, '#f2c230', 1.75, 0.6);
  // Downed bodies.
  g.fillStyle = night ? '#2c3328' : '#56604c';
  for (const [x, z] of [[-4, 0.5], [-7, -1.5], [-12, 2.6]] as const) {
    const [bx, by] = P(x, 0, z);
    g.beginPath();
    g.ellipse(bx, by, 22, 6, 0.1, 0, Math.PI * 2);
    g.fill();
  }
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- UI
const overlay = new WorldOverlay(view);
const hud = new Hud(view);
const screens = new Screens(view);
hud.onSlotClick = (id) => {
  hud.callout(`clicked ${id}`, 'info');
  snap.slots.forEach((s) => (s.selected = s.id === id && s.owned));
};

const NAMES: Record<WeaponId, string> = {
  revolver: 'Old Faithful',
  nailgun: 'Nail gun',
  shotgun: 'Pump shotgun',
  flare: 'Flare pistol',
  harpoon: 'Harpoon gun',
  outboard: 'The Outboard',
};
const PRICE: Record<WeaponId, number> = { revolver: 0, nailgun: 600, shotgun: 1500, flare: 2200, harpoon: 3500, outboard: 9000 };
const CLIP: Record<WeaponId, number> = { revolver: 6, nailgun: 40, shotgun: 6, flare: 1, harpoon: 1, outboard: 300 };

function slots(owned: WeaponId[], selected: WeaponId, money: number, ammo: Partial<Record<WeaponId, number>> = {}): HudSlot[] {
  return WEAPON_ORDER.map((id, i) => ({
    id,
    name: NAMES[id],
    price: PRICE[id],
    owned: owned.includes(id),
    selected: id === selected,
    affordable: money >= PRICE[id],
    ammo: ammo[id] ?? CLIP[id],
    key: i + 1,
  }));
}

function makeSnap(st: string): HudSnapshot {
  const base: HudSnapshot = {
    chapter: 1,
    chapterName: 'Last Light',
    mode: 'boarding',
    boarded: 23,
    passengers: 48,
    bossLife: 1,
    bossName: 'Big Dave',
    money: 1840,
    kills: 87,
    slots: slots(['revolver', 'nailgun'], 'nailgun', 1840, { nailgun: 27 }),
    weapon: { id: 'nailgun', name: NAMES.nailgun, bullets: 27, clip: 40, reload: null, heat: 0, spin: 0 },
    health: 1,
    favour: 0.62,
    favourReady: false,
    hornReady: true,
    craneReady: true,
    clock: '18:52',
  };
  switch (st) {
    case 'danger':
      return { ...base, danger: 1, boarded: 44, clock: '19:08' };
    case 'early':
      return {
        ...base,
        boarded: 2,
        money: 160,
        kills: 4,
        slots: slots(['revolver'], 'revolver', 160, { revolver: 4 }),
        weapon: { id: 'revolver', name: NAMES.revolver, bullets: 4, clip: 6, reload: null, heat: 0, spin: 0 },
        favour: 0.08,
      };
    case 'full':
      return {
        ...base,
        chapter: 2,
        chapterName: 'Blue Hour',
        boarded: 57,
        passengers: 60,
        money: 6420,
        kills: 241,
        slots: slots(['revolver', 'nailgun', 'shotgun', 'flare'], 'shotgun', 6420, { shotgun: 4, nailgun: 12, flare: 1 }),
        weapon: { id: 'shotgun', name: NAMES.shotgun, bullets: 4, clip: 6, reload: null, heat: 0, spin: 0 },
        favour: 1,
        favourReady: true,
        hornReady: false,
        craneReady: false,
      };
    case 'boss':
      return {
        ...base,
        mode: 'boss',
        boarded: 48,
        bossLife: 0.58,
        money: 3290,
        kills: 136,
        slots: slots(['revolver', 'nailgun', 'shotgun'], 'shotgun', 3290, { shotgun: 2 }),
        weapon: { id: 'shotgun', name: NAMES.shotgun, bullets: 2, clip: 6, reload: null, heat: 0, spin: 0 },
        health: 0.71,
        favour: 0.94,
      };
    case 'outboard':
      return {
        ...base,
        chapter: 3,
        chapterName: 'Lights Out',
        boarded: 41,
        passengers: 72,
        money: 12650,
        kills: 512,
        slots: slots(WEAPON_ORDER, 'outboard', 12650, { outboard: 188, harpoon: 1, flare: 0, shotgun: 6, nailgun: 40 }),
        weapon: { id: 'outboard', name: NAMES.outboard, bullets: 188, clip: 300, reload: null, heat: 0.78, spin: 1 },
        favour: 0.35,
        hornReady: false,
      };
    case 'hurt':
      return { ...base, health: 0.22, weapon: { ...base.weapon, bullets: 5 }, slots: slots(['revolver', 'nailgun'], 'nailgun', 1840, { nailgun: 5 }) };
    case 'reload':
      return {
        ...base,
        slots: slots(['revolver', 'nailgun', 'shotgun'], 'revolver', 1840, { revolver: 0 }),
        weapon: { id: 'revolver', name: NAMES.revolver, bullets: 0, clip: 6, reload: 0.55, heat: 0, spin: 0 },
      };
    case 'empty':
      return {
        ...base,
        slots: slots(['revolver', 'nailgun', 'harpoon'], 'harpoon', 1840, { harpoon: 0 }),
        weapon: { id: 'harpoon', name: NAMES.harpoon, bullets: 0, clip: 1, reload: null, heat: 0, spin: 0 },
      };
    default:
      return base;
  }
}

let snap = makeSnap(state);
const hunter = () => {
  const p = worldToScreen(9, 1.0, 0.4);
  return { x: p.u * view.clientWidth, y: p.v * view.clientHeight };
};
const cross = () => {
  const p = worldToScreen(9 - 4.5, 1.0, 0.4);
  return { x: p.u * view.clientWidth, y: p.v * view.clientHeight };
};
const twitchAt = (x: number, z: number, t: number) => {
  const p = worldToScreen(x, 0.2, z);
  return { x: p.u * view.clientWidth, y: p.v * view.clientHeight, t };
};

function overlayFrame(): OverlayFrame {
  const c = cross();
  return {
    crosshair: {
      x: c.x,
      y: c.y,
      bullets: snap.weapon.bullets,
      clip: snap.weapon.clip,
      reload: snap.weapon.reload,
      spin: snap.weapon.spin,
      heat: snap.weapon.heat,
      weapon: snap.weapon.id,
    },
    twitches: screen === 'hud' && state !== 'early' ? [twitchAt(-4, 0.5, 0.35), twitchAt(-7, -1.5, 0.85)] : [],
    damage: Math.max(0, 1 - snap.health * 1.6),
    night: night ? 0.8 : 0,
    danger: snap.danger ?? 0,
  };
}

const callouts: Array<[string, CalloutKind]> = [
  ['NICE SHOT', 'nice'],
  ['HEADSHOT ×3', 'headshot'],
  ['MASSACRE', 'massacre'],
  ['TIDY', 'tidy'],
  ['BIG DAVE', 'boss'],
  ['Horn ready', 'info'],
  ['One of them is at the gangway!', 'danger'],
];

const stats: RunStats = {
  chapter: 2,
  chapterName: 'Blue Hour',
  timeSec: 412,
  kills: 238,
  headshots: 61,
  shots: 1490,
  hits: 1012,
  moneyEarned: 9120,
  moneyLeft: 1420,
  niceShots: 7,
  bestNiceShot: 5,
  favouriteWeapon: 'shotgun',
  corpsesStomped: 23,
  risenKilled: 31,
  bodiesNailed: 9,
  passengersSaved: 71,
  killsByKind: { shambler: 141, jogger: 38, bloater: 9, medic: 8, patient: 4, riot: 0, bigdave: 1 },
};

function freezeAt(ms: number): void {
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = ms;
  }
}

const noop = () => undefined;
let live = false;

switch (screen) {
  case 'hud':
    hud.update(snap);
    overlay.render(overlayFrame(), 0);
    if (state === 'mid') {
      const h0 = hunter();
      overlay.popMoney(h0.x - 260, h0.y - 40, 40);
      overlay.popMoney(h0.x - 330, h0.y - 20, 15, 'headshot');
      overlay.popMoney(h0.x - 420, h0.y - 10, 75, 'nice');
      overlay.render(overlayFrame(), 0.25);
    }
    break;
  case 'callout': {
    hud.update(snap);
    overlay.render(overlayFrame(), 0);
    const kind = (params.get('kind') ?? 'nice') as CalloutKind;
    const found = callouts.find(([, k]) => k === kind);
    hud.callout(params.get('text') ?? found?.[0] ?? 'NICE SHOT', kind);
    if (kind === 'danger') hud.callout('Big Dave belches', 'info');
    break;
  }
  case 'title':
    hud.setVisible(false);
    screens.showTitle({ onPlay: () => hud.setVisible(true) });
    break;
  case 'splash':
    hud.update(makeSnap('early'));
    screens.showChapterSplash(1, 'Last Light', '18:40', Number(params.get('ms') ?? 2600));
    break;
  case 'pause':
    hud.update(snap);
    screens.showPause({ onResume: noop, onRestart: noop, onQuit: noop });
    break;
  case 'options':
    hud.update(snap);
    screens.showOptions();
    break;
  case 'help':
    hud.setVisible(false);
    screens.showHelp();
    break;
  case 'gameover':
  case 'gameover-dead':
    hud.update(snap);
    screens.showGameOver(screen === 'gameover' ? 'gangway' : 'dead', stats, { onRetry: noop, onTitle: noop });
    break;
  case 'victory':
    hud.setVisible(false);
    screens.showVictory({ ...stats, chapter: 3, chapterName: 'Lights Out', kills: 702, moneyEarned: 21450, passengersSaved: 180 }, { onRetry: noop, onTitle: noop });
    break;
  case 'loading':
    screens.showLoading(0.64, 'Building the pier');
    break;
  case 'sim':
    startSim();
    break;
  default:
    live = true;
}

// ------------------------------------------------- real logic (World + Bot)
/** screen=sim: the real core/World played by core/Bot, wired through src/ui/glue.ts like the app will be. */
function startSim(): void {
  const chapter = Number(params.get('ch') ?? 1);
  const w = new World({ seed: Number(params.get('seed') ?? 7), startChapter: chapter, money: [0, 0, 3000, 12000][chapter] ?? 0 });
  const bot = new Bot(w.player, { skill: 0.85, buyList: ['nailgun', 'shotgun', 'flare', 'harpoon', 'outboard'] });
  const layer = document.createElement('canvas');
  layer.className = 'pv-bg';
  view.insertBefore(layer, bg.nextSibling);
  const ev = w.events;
  ev.on('chapterSplash', (e) => screens.showChapterSplash(e.num, e.name, e.clock));
  ev.on('niceShot', (e) => hud.callout(e.n >= 6 ? 'MASSACRE' : 'NICE SHOT', e.n >= 6 ? 'massacre' : 'nice'));
  ev.on('headshotStreak', (e) => e.n >= 2 && hud.callout(`HEADSHOT ×${e.n}`, 'headshot'));
  ev.on('bossSpawn', (e) => hud.callout(e.name, 'boss'));
  let warming = true;
  ev.on('money', (e) => {
    if (warming) return;
    overlay.popMoneyAt(e.x, e.y, e.z, e.amount, e.reason);
    if (e.reason === 'tidy') hud.callout('TIDY', 'tidy');
  });
  ev.on('horn', () => hud.callout('The ferry sounds its horn', 'info'));
  ev.on('corpseRise', () => hud.callout('One of them got back up', 'danger'));
  ev.on('gameOver', (e) => screens.showGameOver(e.reason, runStats(w, w.player.stats, w.tick * TICK), { onRetry: () => location.reload(), onTitle: () => location.reload() }));
  const speed = Number(params.get('speed') ?? 1);
  const warm = Number(params.get('warm') ?? 0);
  for (let i = 0; i < warm * 50 && !w.gameEnded; i++) {
    bot.think(w);
    w.step();
  }
  warming = false;
  let acc = 0;
  let prev = performance.now();
  const snap = hudSnapshot(w);
  const draw = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    acc += dt * speed;
    while (acc >= TICK && !w.gameEnded) {
      bot.think(w);
      w.step();
      acc -= TICK;
    }
    hud.update(hudSnapshot(w, { out: snap }));
    overlay.render(overlayFromWorld(w, (x, y, z) => overlay.project(x, y, z)), dt);
    paintWorld(layer, w);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  (window as unknown as { __sim: unknown }).__sim = { w, bot };
}

/** Zombies, bodies and the Bosun as simple shapes at their real positions. */
function paintWorld(c: HTMLCanvasElement, w: World): void {
  const W = view.clientWidth;
  const H = view.clientHeight;
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
  }
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const P = (x: number, y: number, z: number) => {
    const p = worldToScreen(x, y, z);
    return [p.u * W, p.v * H] as const;
  };
  for (const cp of w.corpses) {
    if (cp.removed) continue;
    const [x, y] = P(cp.x, 0, cp.z);
    g.fillStyle = cp.ash ? '#3a3a38' : cp.burning > 0 ? '#c25a1a' : cp.twitching ? '#7a6a3a' : '#4f5a46';
    g.beginPath();
    g.ellipse(x, y, 16 * (W / 1280), 5 * (W / 1280), 0, 0, Math.PI * 2);
    g.fill();
  }
  const fig = (x: number, z: number, hgt: number, col: string, wd = 0.5) => {
    const [fx, fy] = P(x, 0, z);
    const [, ty] = P(x, hgt, z);
    const [rx] = P(x + wd / 2, 0, z);
    const bw = (rx - fx) * 2;
    g.fillStyle = col;
    g.beginPath();
    if (g.roundRect) g.roundRect(fx - bw / 2, ty, bw, fy - ty, bw / 2.5);
    else g.rect(fx - bw / 2, ty, bw, fy - ty);
    g.fill();
  };
  for (const z of w.zombies) {
    if (z.removed || z.dead) continue;
    const h = z.state === 'crawl' || z.risen ? 0.55 : z.kind === 'bigdave' ? 3 : 1.75;
    const wd = z.kind === 'bloater' || z.kind === 'bigdave' ? 1.1 : 0.5;
    fig(z.x, z.z, h, z.burning > 0 ? '#e0702a' : z.kind === 'jogger' ? '#7d8f6a' : '#6f7d63', wd);
  }
  for (const gcl of w.gas) {
    const [x, y] = P(gcl.x, 0, gcl.z);
    const [rx] = P(gcl.x + gcl.radius, 0, gcl.z);
    g.fillStyle = 'rgba(150,220,60,0.25)';
    g.beginPath();
    g.ellipse(x, y, rx - x, (rx - x) * 0.45, 0, 0, Math.PI * 2);
    g.fill();
  }
  const p = w.player;
  fig(p.x, p.z, 1.75, '#f2c230', 0.6);
}

// --------------------------------------------------------------- live demo
let t = 0;
let last = performance.now();
let nextCallout = 1;
let ci = 0;
let nextPop = 0.4;
let fireT = 0;
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  if (live) {
    const s = snap;
    s.boarded = Math.min(s.passengers, Math.floor(t * 1.2) % (s.passengers + 1));
    s.mode = Math.floor(t / 20) % 2 === 1 ? 'boss' : 'boarding';
    s.bossLife = 1 - ((t % 20) / 20) * 0.95;
    s.favour = Math.min(1, (t % 14) / 12);
    s.favourReady = s.favour >= 1;
    s.health = 0.5 + 0.5 * Math.cos(t * 0.4);
    s.hornReady = Math.floor(t / 9) % 2 === 0;
    s.craneReady = Math.floor(t / 7) % 2 === 0;
    fireT -= dt;
    if (s.weapon.reload !== null) {
      s.weapon.reload += dt / 1.6;
      if (s.weapon.reload >= 1) {
        s.weapon.reload = null;
        s.weapon.bullets = s.weapon.clip;
      }
    } else if (fireT <= 0) {
      s.weapon.bullets--;
      fireT = 0.12;
      if (s.weapon.bullets <= 0) s.weapon.reload = 0;
    }
    s.slots.forEach((sl) => {
      if (sl.selected) sl.ammo = s.weapon.bullets;
    });
    nextPop -= dt;
    if (nextPop <= 0) {
      nextPop = 0.5 + Math.random();
      const p = worldToScreen(-14 + Math.random() * 16, 1.6, -3 + Math.random() * 6);
      const r = Math.random();
      overlay.popMoney(p.u * view.clientWidth, p.v * view.clientHeight, r < 0.2 ? 15 : r < 0.3 ? 75 : 40, r < 0.2 ? 'headshot' : r < 0.3 ? 'nice' : 'bounty');
      s.money += 40;
      s.kills += 1;
    }
    nextCallout -= dt;
    if (nextCallout <= 0) {
      nextCallout = 2.2;
      const [text, kind] = callouts[ci++ % callouts.length];
      hud.callout(text, kind);
    }
    hud.update(s);
    const f = overlayFrame();
    f.twitches = [twitchAt(-4, 0.5, (t % 2) / 2), twitchAt(-7, -1.5, ((t + 1) % 2) / 2)];
    f.gas = Math.max(0, Math.sin(t * 0.3)) * 0.8;
    f.danger = Math.max(0, Math.sin(t * 0.5 + 2));
    if (f.crosshair) f.crosshair.kick = Math.max(0, fireT / 0.12);
    overlay.render(f, dt);
    screens.setFps(60);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const freeze = params.get('freeze');
if (freeze !== null) {
  // Let layout settle, then pin every animation at the requested time.
  requestAnimationFrame(() => requestAnimationFrame(() => freezeAt(Number(freeze))));
}

declare global {
  interface Window {
    __ui: unknown;
  }
}
window.__ui = { hud, screens, overlay, makeSnap, freezeAt, overlayFrame, setSnap: (s: HudSnapshot) => (snap = s) };
