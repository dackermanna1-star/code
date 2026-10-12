import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/jacquard-12/400.css';
import '@fontsource/silkscreen/400.css';
import * as THREE from 'three';
import { Game } from './game/game';
import { Run } from './game/run';
import { Input } from './core/input';
import { DebugTools } from './ui/debug';
import { Menus, Settings } from './ui/menus';
import { audio } from './audio/audio';
import { ENEMIES } from './entities/enemyDefs';
import { Rng } from './core/rng';
import { SPELLS } from './magic/spells';
import { Wand } from './magic/casting';
import { generateWand } from './magic/wandGen';
import { makePotion } from './game/inventory';
import { HM, hmFloorY } from './world/biomes';
import { MATERIALS } from './world/materials';

// Colours are authored in sRGB and the renderer outputs them unconverted (pixel-art palette fidelity).
THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const input = new Input(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });

interface Session {
  game: Game;
  run: Run;
  debug: DebugTools;
  sandbox: boolean;
}

let session: Session | null = null;
let runCount = 0;
let loading: HTMLDivElement | null = null;
const clickHint = document.createElement('div');
clickHint.className = 'click-hint hidden';
clickHint.textContent = 'Click to play';
ui.appendChild(clickHint);

const menus = new Menus(ui, input, {
  newGame: (seed, sandbox) => startGame(seed ?? ((Math.random() * 2 ** 31) >>> 0), sandbox),
  resume: () => resume(),
  quitToMenu: () => {
    endSession();
    menus.show('main');
    audio.setAmbience('menu');
  },
  settingsChanged: (s) => applySettings(s),
  hasRun: () => !!session && session.game.state !== 'dead' && session.game.state !== 'won',
});

function applySettings(s: Settings): void {
  input.sensitivity = s.sensitivity;
  input.invertY = s.invertY;
  audio.setVolumes(s.master, s.sfx, s.music);
  if (session) {
    session.game.setFov(s.fov);
    session.game.setPixelScale(s.pixelScale);
    session.game.chunks.renderDistance = s.renderDistance;
    session.game.streamer.opts.radiusH = Math.max(5, s.renderDistance);
  }
}

function endSession(): void {
  if (!session) return;
  session.run.dispose();
  session.game.dispose();
  session.debug.overlay.remove();
  session.debug.panel.remove();
  session = null;
}

async function startGame(seed: number, sandbox: boolean): Promise<void> {
  endSession();
  menus.show('none');
  audio.unlock();
  loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `<div class="logo" style="font-size:72px;margin:0">Noita</div><div>Generating the world… seed ${seed}</div><div class="bar"><div></div></div>`;
  ui.appendChild(loading);
  const s = menus.settings;
  const game = new Game(canvas, {
    seed,
    pixelScale: parseFloat(params.get('pixel') ?? String(s.pixelScale)),
    useWorkers: params.get('workers') !== '0',
    debug: sandbox || params.has('debug'),
  }, input, renderer);
  const run = new Run(game, ui, runCount === 0);
  runCount++;
  const debug = new DebugTools(game, ui);
  debug.enemyTypes = Object.keys(ENEMIES);
  debug.godMode = false;
  debug.onSpawnEnemy = (type, x, y, z) => run.enemies.spawn(type, x, y, z, 0, new Rng((Math.random() * 1e9) >>> 0));
  debug.spellIds = Object.keys(SPELLS);
  debug.giveSpell = (id) => {
    run.inv.addSpell({ id, uses: SPELLS[id].maxUses });
    run.hud.log(`Spell added: ${SPELLS[id].name}`);
  };
  debug.giveWand = (tier) => {
    const gw = generateWand(() => Math.random(), tier);
    const w = new Wand(gw.stats, gw.spells, gw.alwaysCast);
    if (run.inv.addWand(w) < 0) run.dropWand(w);
    run.hud.log(`Wand added: ${gw.stats.name}`);
  };
  debug.givePotion = (m) => {
    if (run.inv.addItem(makePotion(m)) < 0) run.hud.log('Item slots full');
  };
  debug.teleportDepth = (layer) => {
    const p = game.player;
    if (layer < 0) {
      p.body.x = HM.cx + 0.5; p.body.y = hmFloorY(0) + 0.1; p.body.z = HM.cz - 6;
    } else {
      const pts = game.streamer.gen.routePoints[layer];
      const q = pts[Math.floor(pts.length * 0.3)];
      p.body.x = q.x; p.body.y = q.y - 3; p.body.z = q.z;
    }
    p.body.vx = p.body.vy = p.body.vz = 0;
    p.eyeY = p.body.y + p.eyeHeight();
  };
  debug.extraStats = () => ({
    entities: `enemies ${run.enemies.list.length} (awake ${run.enemies.list.filter((e) => !e.sleeping).length})  projectiles ${run.projectiles.list.length}  pickups ${run.pickups.list.length}`,
    audio: `voices ${audio.stats.voices} dropped ${audio.stats.dropped}`,
  });
  session = { game, run, debug, sandbox };
  (window as unknown as Record<string, unknown>).game = game;
  (window as unknown as Record<string, unknown>).run = run;
  (window as unknown as Record<string, unknown>).debug = debug;
  // test hooks for automated scenarios
  (window as unknown as Record<string, unknown>).__spellIds = Object.keys(SPELLS);
  (window as unknown as Record<string, unknown>).__MATERIALS = MATERIALS;
  (window as unknown as Record<string, unknown>).__makeWand = (id: string) => {
    const def = SPELLS[id];
    const spells = [{ id, uses: def.maxUses }];
    if (def.type === 'modifier' || def.type === 'multicast' || def.type === 'other') spells.push({ id: 'LIGHT_BULLET', uses: -1 }, { id: 'LIGHT_BULLET', uses: -1 });
    return new Wand({ name: 'Test', shuffle: false, actionsPerRound: 1, castDelay: 5, rechargeTime: 10, manaMax: 2000, manaChargeSpeed: 500, capacity: 4, spread: 0, speedMult: 1, spriteSeed: 7 }, spells);
  };
  applySettings(s);
  await game.preload((f) => {
    const bar = loading?.querySelector('.bar > div') as HTMLDivElement | null;
    if (bar) bar.style.width = `${(f * 100).toFixed(0)}%`;
  });
  loading?.remove();
  loading = null;
  if (game.opts.debug) debug.toggleOverlay();
  game.frameHooks.unshift((dt) => {
    if (input.hit('debug')) debug.toggleOverlay();
    if (input.hit('debugMenu') && session?.sandbox) {
      debug.togglePanel();
      if (debug.showPanel) input.exitLock();
    }
    debug.godMode && (run.damage.godMode = true);
    if (!debug.godMode) run.damage.godMode = false;
    if (game.state === 'playing' && session?.sandbox) debug.applyTool(input.mouseHeld(0), input.mouseClicked(0));
    debug.update(dt);
    if (input.hit('pause') && game.state === 'playing') pause();
    clickHint.classList.toggle('hidden', !(game.state === 'playing' && !input.locked && !debug.showPanel));
  });
  run.onDeath = () => {
    input.exitLock();
    const st = run.stats();
    setTimeout(() => menus.show('dead', { ...st, seed, cause: run.lastCause }), 1200);
  };
  run.onWin = () => {
    input.exitLock();
    menus.show('won', run.stats());
  };
  game.start();
  audio.setAmbience('surface');
  run.hud.title('Noita', 'Descend into the mountain');
  input.requestLock();
}

function pause(): void {
  if (!session) return;
  session.game.state = 'paused';
  input.exitLock();
  menus.show('pause');
}

function resume(): void {
  if (!session) return;
  menus.show('none');
  session.game.state = 'playing';
  input.requestLock();
}

canvas.addEventListener('click', () => {
  audio.unlock();
  if (session && session.game.state === 'playing') input.requestLock();
});

// losing pointer lock (browser Esc) pauses the game
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && session && session.game.state === 'playing' && !session.run.invUI.open && !session.debug.showPanel) {
    pause();
  }
});

applySettings(menus.settings);
if (params.has('autostart')) {
  startGame(params.has('seed') ? parseInt(params.get('seed')!, 10) >>> 0 : (Math.random() * 2 ** 31) >>> 0, params.has('sandbox'));
} else {
  menus.show('main');
  audio.setAmbience('menu');
}
