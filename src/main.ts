import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/jacquard-12/400.css';
import '@fontsource/silkscreen/400.css';
import { Game } from './game/game';
import { Input } from './core/input';
import { DebugTools } from './ui/debug';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const input = new Input(canvas);

async function startGame(seed: number) {
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `<div>Generating world… seed ${seed}</div><div class="bar"><div></div></div>`;
  ui.appendChild(loading);
  const game = new Game(canvas, {
    seed,
    pixelScale: parseFloat(params.get('pixel') ?? '2'),
    useWorkers: params.get('workers') !== '0',
    debug: params.has('debug'),
  }, input);
  const debug = new DebugTools(game, ui);
  (window as unknown as { game: Game }).game = game;
  (window as unknown as { debug: DebugTools }).debug = debug;
  await game.preload((f) => ((loading.querySelector('.bar > div') as HTMLDivElement).style.width = `${(f * 100).toFixed(0)}%`));
  loading.remove();
  if (params.has('debug')) debug.toggleOverlay();
  debug.tool = 'dig';
  game.frameHooks.push((dt) => {
    if (input.hit('debug')) debug.toggleOverlay();
    if (input.hit('debugMenu')) debug.togglePanel();
    if (game.state === 'playing') debug.applyTool(input.mouseHeld(0), input.mouseClicked(0));
    debug.update(dt);
  });
  canvas.addEventListener('click', () => input.requestLock());
  game.start();
}

const seed = params.has('seed') ? parseInt(params.get('seed')!) >>> 0 : (Math.random() * 2 ** 31) >>> 0;
startGame(seed);
