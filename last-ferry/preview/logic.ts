// Logic preview: the real game rules drawn through the exact gameplay camera
// projection (no three.js). Zombies are drawn as their hit silhouettes (what
// the view-consistent hit test uses), bodies, gas, fire, tracers, the crane.
// URL: ?seed=1&chapter=1&bot=1&t=0&speed=1&money=0&god=0&scene=
// Keys: WASD/arrows move, Space fire, R reload, E jump/stomp, H horn, F cannon,
// B buy best, 1-6 select/buy, Q cycle, T toggle bot, P pause, K skip to boss.
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import { worldToScreen } from '../src/config/view';
import { CRANE, ESCAPE_X, PIER, TICK_RATE, leftEdgeX } from '../src/config/world';
import { WEAPONS } from '../src/config/weapons';
import { WEAPON_ORDER, type WeaponId } from '../src/config/ids';
import type { BulletPath } from '../src/core/events';
import type { Zombie } from '../src/core/Zombie';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
const W = canvas.width;
const H = canvas.height;

let world = new World({ seed: num('seed', 1), startChapter: num('chapter', 1), money: num('money', 0), god: q.get('god') === '1', quiet: q.get('scene') ? true : false, skipSplash: !!q.get('scene') });
let bot: Bot | null = q.get('bot') === '0' ? null : new Bot(world.player, { skill: num('skill', 0.9) });
let paused = false;
const speed = num('speed', 1);

interface Tracer { p: BulletPath; t: number }
let tracers: Tracer[] = [];
const log: string[] = [];
let flash = 0;
let hitstop = 0;

function hook(w: World): void {
  w.events.on('shot', (e) => {
    for (const p of e.paths) tracers.push({ p, t: 0.12 });
  });
  const say = (s: string) => {
    log.unshift(`${(w.tick / TICK_RATE).toFixed(1)}s ${s}`);
    log.length = Math.min(log.length, 14);
  };
  w.events.on('chapterSplash', (e) => say(`CHAPTER ${e.num} · ${e.name.toUpperCase()} · ${e.clock}`));
  w.events.on('bossSpawn', (e) => say(`BOSS: ${e.name}`));
  w.events.on('chapterComplete', (e) => say(`chapter ${e.num} complete`));
  w.events.on('niceShot', (e) => say(e.n >= 6 ? `MASSACRE ×${e.n}` : `NICE SHOT ×${e.n}`));
  w.events.on('headshotStreak', (e) => say(`HEADSHOT ×${e.n}`));
  w.events.on('corpseRise', (e) => say(`body #${e.corpseId} rises → crawler #${e.zombieId}`));
  w.events.on('corpsePermanent', (e) => say(`body #${e.corpseId} stays down (${e.reason})`));
  w.events.on('horn', () => say('FERRY HORN'));
  w.events.on('crane', (e) => say(`crane ${e.state}`));
  w.events.on('cannonStrike', () => say('CANNON STRIKE'));
  w.events.on('explosion', (e) => say(`explosion (${e.kind})`));
  w.events.on('stretcherDrop', () => say('stretcher dropped'));
  w.events.on('plateOff', (e) => say(`riot plate ${e.plate} off`));
  w.events.on('enrage', () => say('Big Dave ENRAGES'));
  w.events.on('belch', () => say('Big Dave belches'));
  w.events.on('buy', (e) => say(`bought ${e.weapon}`));
  w.events.on('stomp', (e) => e.killed && say('TIDY'));
  w.events.on('gameOver', () => say(`GAME OVER: ${w.describeGameOver()}`));
  w.events.on('victory', () => say('VICTORY: the last ferry sails'));
  w.events.on('hitstop', (e) => (hitstop = Math.max(hitstop, e.ms / 1000)));
  w.events.on('explosion', () => (flash = 0.25));
}
hook(world);

// --- scenes (quiet worlds set up to show one rule)
function scene(name: string): void {
  const w = world;
  const p = w.player;
  p.money = 20000;
  switch (name) {
    case 'hit': {
      // A row of zombies at different depths: what the gun line at z=0 hits.
      p.x = 12;
      p.z = 0;
      const kinds = ['shambler', 'jogger', 'bloater', 'riot'] as const;
      kinds.forEach((k, i) => {
        const z = w.spawn(k, -6 + i * 4, -1.2 + i * 0.6);
        z.speed = 0;
      });
      const c = w.spawn('shambler', -14, 0.9, { risen: true });
      c.speed = 0;
      w.spawnTeam(-20, -2.5);
      bot = null;
      break;
    }
    case 'barricade': {
      for (let i = 0; i < 40; i++) w.addCorpse('shambler', -4 + w.rng.range(-1.5, 1.5), w.rng.range(-3, 3), { risesIn: 4 + i * 0.4 });
      for (let i = 0; i < 8; i++) w.spawn('jogger', -20 - i * 2, w.rng.range(-3, 3));
      for (let i = 0; i < 8; i++) w.spawn('shambler', -16 - i * 2, w.rng.range(-3, 3));
      bot = null;
      p.x = 19;
      break;
    }
    case 'fire': {
      for (let i = 0; i < 20; i++) w.addCorpse('shambler', -3 + w.rng.range(-1.2, 1.2), w.rng.range(-1.5, 1.5), { risesIn: 30 });
      for (let i = 0; i < 8; i++) w.spawn('shambler', -10 - i * 1.2, w.rng.range(-2, 2));
      w.spawn('bloater', -1, 2.5);
      p.selectOrBuy('flare');
      p.x = 12;
      p.z = 0.2;
      bot = null;
      break;
    }
    case 'dave': {
      w.skipToBoss();
      bot = new Bot(p, { skill: 0.9 });
      break;
    }
  }
}
if (q.get('scene')) scene(q.get('scene')!);

// --- input
const keys = new Set<string>();
/** Keyboard input is applied while keys are held (and once more after release). */
let keysReleased = false;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  const p = world.player;
  if (e.code === 'KeyR') p.reload();
  if (e.code === 'KeyB' || e.code === 'Enter') p.buyBest();
  if (e.code === 'KeyQ' || e.code === 'Tab') p.cycle(1);
  if (e.code === 'KeyT') bot = bot ? null : new Bot(p, { skill: 0.9 });
  if (e.code === 'KeyP' || e.code === 'Escape') paused = !paused;
  if (e.code === 'KeyK') world.skipToBoss();
  const d = /^Digit([1-6])$/.exec(e.code);
  if (d) p.selectOrBuy(WEAPON_ORDER[Number(d[1]) - 1]);
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));

function readInput(): void {
  const i = world.player.input;
  const k = (...c: string[]) => c.some((x) => keys.has(x));
  i.left = k('KeyA', 'ArrowLeft');
  i.right = k('KeyD', 'ArrowRight');
  i.up = k('KeyW', 'ArrowUp');
  i.down = k('KeyS', 'ArrowDown');
  i.fire = k('Space', 'ControlLeft', 'ControlRight');
  i.jump = k('KeyE', 'ShiftLeft', 'ShiftRight');
  i.horn = k('KeyH');
  i.cannon = k('KeyF');
}

// --- drawing
const S = (x: number, y: number, z: number): [number, number] => {
  const s = worldToScreen(x, y, z);
  return [s.u * W, s.v * H];
};

const KIND_COL: Record<string, string> = {
  shambler: '#7f9f6a',
  jogger: '#5aa0d8',
  bloater: '#9bb24a',
  medic: '#e8e8e8',
  patient: '#c9a6a6',
  riot: '#4d5866',
  bigdave: '#b8c25a',
};

function groundPoly(pts: Array<[number, number]>, fill: string, stroke?: string): void {
  g.beginPath();
  pts.forEach(([x, z], i) => {
    const [sx, sy] = S(x, 0, z);
    if (i) g.lineTo(sx, sy);
    else g.moveTo(sx, sy);
  });
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function groundCircle(x: number, z: number, r: number, fill: string, stroke?: string): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  groundPoly(pts, fill, stroke);
}

function drawDeck(): void {
  const tod = world.timeOfDay;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, tod < 0.33 ? '#3a2a3e' : tod < 0.66 ? '#1c2a44' : '#0a0e18');
  sky.addColorStop(0.45, tod < 0.33 ? '#c9774a' : tod < 0.66 ? '#40587a' : '#141c2c');
  sky.addColorStop(1, '#0d1620');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // Sea.
  groundPoly([[-80, -60], [80, -60], [80, 30], [-80, 30]], '#13303f');
  // Deck.
  groundPoly([[PIER.minX, PIER.minZ], [PIER.maxX, PIER.minZ], [PIER.maxX, PIER.maxZ], [PIER.minX, PIER.maxZ]], '#4b3b2c', '#2a2018');
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  for (let x = PIER.minX; x < PIER.maxX; x += 1.5) {
    const [a, b] = S(x, 0, PIER.minZ);
    const [c, d] = S(x, 0, PIER.maxZ);
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(c, d);
    g.stroke();
  }
  // Ferry hull and the gangway line.
  groundPoly([[PIER.maxX, -9], [40, -9], [40, 9], [PIER.maxX, 9]], '#e7e2d6', '#6b6658');
  const [e0, e1] = S(ESCAPE_X, 0, -6);
  const [e2, e3] = S(ESCAPE_X, 0, 6);
  g.strokeStyle = 'rgba(255,60,40,0.7)';
  g.setLineDash([6, 6]);
  g.beginPath();
  g.moveTo(e0, e1);
  g.lineTo(e2, e3);
  g.stroke();
  g.setLineDash([]);
  // Crane drop zone / barricade.
  const cr = world.crane;
  const r = CRANE.radius;
  const zone: Array<[number, number]> = [[CRANE.hookX - r, CRANE.hookZ - r], [CRANE.hookX + r, CRANE.hookZ - r], [CRANE.hookX + r, CRANE.hookZ + r], [CRANE.hookX - r, CRANE.hookZ + r]];
  if (cr.state === 'down') groundPoly(zone, 'rgba(160,120,60,0.55)', '#d8a050');
  else if (cr.state === 'hanging' || cr.state === 'falling') groundPoly(zone, 'rgba(255,200,80,0.06)', 'rgba(255,200,80,0.25)');
}

function ellipseAt(cx: number, cy: number, cz: number, a: number, b: number, fill: string): void {
  const [x, y] = S(cx, cy, cz);
  const [xa] = S(cx + a, cy, cz);
  const [, yb] = S(cx, cy + b, cz);
  g.beginPath();
  g.ellipse(x, y, Math.abs(xa - x), Math.abs(yb - y), 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function drawZombie(z: Zombie): void {
  const base = KIND_COL[z.kind] ?? '#888';
  // Shadow.
  groundCircle(z.x, z.z, z.def.halfDepth * 0.9, 'rgba(0,0,0,0.25)');
  for (const s of z.shapes()) {
    let col = base;
    if (s.part === 'head') col = z.risen ? '#8a6b5a' : '#e0b49a';
    else if (s.part === 'legs') col = '#3c3f48';
    else if (s.part === 'plate') col = '#9fb0c4';
    else if (s.part === 'stretcher') col = '#a07a4a';
    if (z.burning > 0) col = (z.ticks >> 2) % 2 ? '#ff7a2a' : '#ffb03a';
    ellipseAt(z.x + (z.facing >= 0 ? s.cx : -s.cx), s.cy, z.z, s.a, s.b, col);
  }
  const [lx, ly] = S(z.x, z.height + 0.35, z.z);
  g.fillStyle = z.isBoss ? '#ffcf40' : 'rgba(255,255,255,0.6)';
  g.font = '10px ui-monospace, monospace';
  g.textAlign = 'center';
  const tag = `${z.risen ? 'crawl ' : ''}${z.kind}${z.medal ? ' 🥇' : ''} ${Math.max(0, z.life).toFixed(0)}${z.state !== 'walk' && z.state !== 'run' && z.state !== 'crawl' ? ` [${z.state}]` : ''}`;
  g.fillText(tag, lx, ly);
}

function draw(): void {
  drawDeck();
  for (const f of world.fires) groundCircle(f.x, f.z, f.radius, `rgba(255,120,30,${0.25 + 0.35 * (f.ttl / f.max)})`, '#ff9a40');
  // Bodies.
  for (const c of [...world.corpses].sort((a, b) => a.z - b.z)) {
    const col = c.burning > 0 ? '#ff6a20' : c.risesAt !== null ? (c.twitching ? '#e05a5a' : '#8d5a4a') : '#4a3a34';
    groundPoly([[c.x - 0.8, c.z - 0.22], [c.x + 0.8, c.z - 0.22], [c.x + 0.8, c.z + 0.22], [c.x - 0.8, c.z + 0.22]], col, 'rgba(0,0,0,0.4)');
    if (c.risesAt !== null) {
      const [x, y] = S(c.x, 0.35, c.z);
      g.fillStyle = '#ffd0c0';
      g.font = '9px ui-monospace, monospace';
      g.textAlign = 'center';
      g.fillText(`${Math.max(0, (c.risesAt - world.tick) / TICK_RATE).toFixed(1)}s${c.pinNails ? ` n${c.pinNails}` : ''}`, x, y);
    }
  }
  // Hook block.
  if (world.crane.state === 'hanging' || world.crane.state === 'falling') {
    const fall = world.crane.state === 'falling' ? (world.crane.stateTime / CRANE.dropTime) ** 2 * CRANE.palletY : 0;
    const [x0, y0] = S(CRANE.hookX - CRANE.hookHalfX, CRANE.hookY1, CRANE.hookZ);
    const [x1, y1] = S(CRANE.hookX + CRANE.hookHalfX, CRANE.hookY0, CRANE.hookZ);
    g.fillStyle = '#e0b030';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const [px0, py0] = S(CRANE.hookX - 1.6, CRANE.palletY + 1.4 - fall, CRANE.hookZ);
    const [px1, py1] = S(CRANE.hookX + 1.6, CRANE.palletY - fall, CRANE.hookZ);
    g.fillStyle = '#8a6a3a';
    g.fillRect(px0, py0, px1 - px0, py1 - py0);
  }
  // Zombies and the hunter, far to near.
  const p = world.player;
  const items: Array<{ z: number; f: () => void }> = world.zombies.filter((z) => !z.removed).map((z) => ({ z: z.z, f: () => drawZombie(z) }));
  items.push({
    z: p.z,
    f: () => {
      groundCircle(p.x, p.z, 0.4, 'rgba(0,0,0,0.3)');
      ellipseAt(p.x, p.y + 0.5, p.z, 0.22, 0.5, '#2a2f3a');
      ellipseAt(p.x, p.y + 1.15, p.z, 0.3, 0.38, p.state === 'grabbed' ? '#ff5040' : '#f2c81a');
      ellipseAt(p.x, p.y + 1.62, p.z, 0.2, 0.14, '#f2c81a');
      const m = p.muzzle();
      const [a, b] = S(p.x, m.y, m.z);
      const [c, d] = S(m.x, m.y, m.z);
      g.strokeStyle = '#222';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(a, b);
      g.lineTo(c, d);
      g.stroke();
      g.lineWidth = 1;
    },
  });
  for (const it of items.sort((a, b) => a.z - b.z)) it.f();
  for (const s of world.gas) groundCircle(s.x, s.z, s.radius, `rgba(120,200,60,${0.12 + 0.25 * (s.ttl / s.max)})`, 'rgba(160,230,80,0.6)');
  // Gun line (laser preview).
  const lt = world.combat.lineTrace(p);
  {
    const [a, b] = S(lt.from.x, lt.from.y, lt.from.z);
    const [c, d] = S(lt.to.x, lt.to.y, lt.to.z);
    g.strokeStyle = lt.kind === 'zombie' ? 'rgba(255,60,60,0.35)' : 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(c, d);
    g.stroke();
  }
  // Tracers.
  for (const t of tracers) {
    const [a, b] = S(t.p.from.x, t.p.from.y, t.p.from.z);
    const [c, d] = S(t.p.to.x, t.p.to.y, t.p.to.z);
    g.strokeStyle = t.p.kind === 'harpoon' ? `rgba(220,220,220,${t.t * 8})` : t.p.ric ? `rgba(120,200,255,${t.t * 8})` : `rgba(255,230,140,${t.t * 8})`;
    g.lineWidth = t.p.kind === 'harpoon' ? 2 : 1;
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(c, d);
    g.stroke();
    g.lineWidth = 1;
  }
  for (const pr of world.projectiles) {
    const [x, y] = S(pr.x, pr.y, pr.z);
    g.fillStyle = pr.kind === 'flare' ? '#ff4030' : '#222';
    g.beginPath();
    g.arc(x, y, pr.kind === 'flare' ? 4 : 5, 0, Math.PI * 2);
    g.fill();
  }
  if (flash > 0) {
    g.fillStyle = `rgba(255,220,160,${flash})`;
    g.fillRect(0, 0, W, H);
  }
  // Left frame edge marker.
  const [lx0, ly0] = S(leftEdgeX(-6), 0, -6);
  void lx0;
  void ly0;
  hud();
}

function hud(): void {
  const w = world;
  const p = w.player;
  g.textAlign = 'left';
  g.font = '13px ui-monospace, monospace';
  const bar = w.bossLife !== null ? `BOSS ${w.bossName}: ${(w.bossLife * 100).toFixed(0)}% (${w.level.bossesLeft} left)` : `PASSENGERS ${w.boarded} / ${w.passengers}`;
  const lines = [
    `CH ${w.chapter} ${w.chapterName}  phase ${w.phase}  t=${(w.tick / TICK_RATE).toFixed(1)}s  tod ${w.timeOfDay.toFixed(2)}`,
    bar,
    `$${p.money}  kills ${p.kills}  life ${p.life.toFixed(0)}  state ${p.state}`,
    `${WEAPONS[p.weapon.id].short} ${p.weapon.bullets}/${p.weapon.def.clip} ${p.weapon.state}${p.weapon.reloading ? ` ${(p.weapon.reloadProgress * 100).toFixed(0)}%` : ''}${p.weapon.id === 'outboard' ? ` spin ${p.weapon.spin.toFixed(2)} heat ${p.weapon.heat.toFixed(2)}` : ''}`,
    `favour ${w.favour.toFixed(0)}${w.favourReady ? ' [F]' : ''}  horn ${w.hornReady ? '[H]' : '-'}  crane ${w.crane.state}  bodies ${w.corpses.length}  zombies ${w.zombies.length}`,
    `owned: ${[...p.owned.keys()].join(' ')}  ${bot ? `BOT(${bot.mode})` : 'manual'}`,
  ];
  g.fillStyle = 'rgba(8,12,18,0.72)';
  g.fillRect(8, 8, 620, lines.length * 17 + 10);
  g.fillStyle = '#e8eef4';
  lines.forEach((l, i) => g.fillText(l, 16, 26 + i * 17));
  g.fillStyle = 'rgba(8,12,18,0.6)';
  g.fillRect(W - 430, 8, 422, log.length * 15 + 10);
  g.fillStyle = '#ffd890';
  g.font = '11px ui-monospace, monospace';
  log.forEach((l, i) => g.fillText(l, W - 422, 24 + i * 15));
}

/** Advance the logic n ticks (with bot). */
function steps(n: number): void {
  for (let i = 0; i < n && !world.gameEnded; i++) {
    if (bot) bot.think(world);
    else if (keys.size || keysReleased) {
      readInput();
      keysReleased = keys.size > 0;
    }
    world.step();
  }
}

// Fast-forward to ?t= seconds.
steps(Math.round(num('t', 0) * TICK_RATE));

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    if (hitstop > 0) hitstop -= dt;
    else {
      acc += dt * speed;
      const n = Math.floor(acc * TICK_RATE);
      acc -= n / TICK_RATE;
      steps(n);
    }
  }
  tracers = tracers.filter((t) => (t.t -= dt) > 0);
  flash = Math.max(0, flash - dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hooks (playwright).
const api = {
  get world() {
    return world;
  },
  steps,
  draw,
  reset(seed = 1, chapter = 1) {
    world = new World({ seed, startChapter: chapter });
    hook(world);
    bot = new Bot(world.player, { skill: 0.9 });
  },
  buy(id: WeaponId) {
    return world.player.selectOrBuy(id);
  },
};
(window as unknown as { __lf: typeof api }).__lf = api;
