// LAST FERRY — entry point: stage, environment, audio, UI, loading screen,
// then the title over a live attract game.
//
// Boot: the loading screen stays up only for the essentials — the pier's
// first frame, the shader / pipeline warm-up (one of everything the view can
// draw, compiled behind the loading screen) and the menu / title sounds. The
// sounds bake off the main thread in a Worker from the start, in parallel;
// the rest of them, and the zombie looks, keep warming up behind the title
// (a few ms per frame, never a stall). The frame loop draws through a gate
// (Game.shouldRender): the pause menu holds its picture, the results redraw
// slowly.
//
// URL parameters (testing / debugging):
//   ?play            skip the title          ?autoplay   a bot plays the game (implies ?play unless ?title)
//   ?chapter=N       start at chapter N      ?money=N    starting money
//   ?god             the Bosun can't die and nothing boards
//   ?speed=N         game speed multiplier   ?seed=N     world seed
//   ?quality=low|medium|high (this session)  ?nosound    no audio at all
//
// window.__lf: { stage, env, game, audio, screens, view, world(), step(n, dt),
//   spawn(kind, x, z, opts), setChapter(n), god(on), money(n), autoplay(on), stats(), skipToBoss() }
import { AudioSystem } from './audio';
import type { ZombieKind } from './config/ids';
import type { SpawnOpts } from './core/World';
import { Game } from './game/Game';
import { Environment } from './render/env/Environment';
import { Stage, type PostQuality } from './render/Stage';
import { Screens, loadOptions, type Quality } from './ui';

const params = new URLSearchParams(location.search);
const num = (k: string): number | undefined => {
  const v = params.get(k);
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/**
 * Yield to the browser between warm-up steps: the next frame (so the loading
 * bar paints) or 50 ms, whichever comes first (a slow compositor — software
 * GL — never holds the boot up).
 */
const breathe = () => Promise.race([nextFrame(), new Promise<void>((r) => setTimeout(r, 50))]);
/** Boot milestones as User Timing marks ('lf:…', visible in a DevTools performance trace). */
const mark = (name: string) => performance.mark?.(`lf:${name}`);
const POST: Record<Quality, PostQuality> = { low: 'low', medium: 'medium', high: 'high' };

async function boot(): Promise<void> {
  const host = document.getElementById('app')!;
  const qp = params.get('quality');
  const forced: Quality | null = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : null;

  // Audio unlocks on any gesture, menus included: registered before Screens,
  // whose capture-phase key handler stops menu keys from going any further.
  let audio: AudioSystem | null = null;
  const unlock = () => audio?.unlock();
  for (const ev of ['keydown', 'pointerdown', 'touchstart'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });

  // The stage first (a WebGL canvas), then the UI layers on top of it.
  const quality: Quality = forced ?? loadOptions().quality;
  const stage = new Stage(host, { post: POST[quality] });
  const screens = new Screens(stage.view);
  screens.showLoading(0.02, 'Building the pier');
  await nextFrame();

  const env = new Environment(stage, { quality });
  mark('env');
  screens.showLoading(0.15, 'Lighting the lamps');
  await nextFrame();

  // Sounds start baking now, off the main thread, most urgent first (they go on behind the title).
  audio = new AudioSystem(params.has('nosound') ? { context: null } : {});
  void audio.prewarm();
  let soundsReady = false;
  void audio.essentials().then(() => (soundsReady = true));

  const game = new Game(stage, env, audio, screens, { quality: forced });
  // Every frame draws through the gate: static screens hold their picture (Game.shouldRender).
  // Stage's own loop and the test harnesses (__lf.step, stage.frame) all go through it.
  const drawFrame = stage.frame.bind(stage);
  stage.frame = (dt: number, render = true) => drawFrame(dt, render && game.shouldRender(dt));
  mark('game');
  // The first frame compiles the pier's shaders (behind the loading screen).
  stage.frame(1 / 60);
  mark('first-frame');
  screens.showLoading(0.3, 'Waking the dead');
  await nextFrame();

  // Essentials: the shader / pipeline warm-up (one of everything the view can draw, compiled and
  // drawn once out of sight) and the menu / title sounds. The zombie looks are not essential: spawns
  // build their own, and the rest are built behind the title (Game.frame → view.prewarm).
  let viewDone = false;
  let viewCalls = 0;
  const t0 = performance.now();
  const limitMs = num('loadlimit') ?? 25000;
  while (!viewDone && performance.now() - t0 < limitMs) {
    viewDone = warmShaders(game, 40);
    viewCalls++;
    screens.showLoading(Math.min(0.95, 0.3 + 0.6 * (viewDone ? 1 : 1 - Math.exp(-viewCalls / 2))), 'Waking the dead');
    await breathe();
  }
  mark('shaders');
  // Line up the zombie looks for the title to build (the queue itself takes a few tens of ms).
  game.view.prewarm(1);
  if (!soundsReady) {
    screens.showLoading(0.95, 'Tuning the foghorn');
    const left = Math.max(0, limitMs - (performance.now() - t0));
    await Promise.race([audio.essentials(), new Promise<void>((r) => setTimeout(r, left))]);
  }
  mark('sounds');
  screens.showLoading(1, 'Boarding');

  // Debug / test switches.
  game.autoplay = params.has('autoplay');
  game.speed = Math.max(0.05, Math.min(64, num('speed') ?? 1));
  game.worldOptions = {
    startChapter: num('chapter') !== undefined ? Math.max(1, Math.min(3, Math.round(num('chapter')!))) : undefined,
    money: num('money'),
    god: params.has('god'),
    seed: num('seed'),
  };

  const lf = {
    stage,
    env,
    game,
    audio,
    screens,
    view: game.view,
    world: () => game.world,
    /** Step `n` frames of `dt` seconds (call stage.stop() first); renders the last one. */
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) stage.frame(dt, i === n - 1);
    },
    spawn: (kind: ZombieKind, x?: number, z?: number, opts?: SpawnOpts) => game.spawn(kind, x, z, opts),
    /** Start a new game at chapter n (with that chapter's usual money). */
    setChapter(n: number) {
      game.newGame({ startChapter: Math.max(1, Math.min(3, Math.round(n))) });
    },
    god(on = true) {
      game.worldOptions.god = on;
      if (game.world) game.world.god = on;
    },
    money(n: number) {
      if (game.world) game.world.player.money = n;
    },
    /** Let the bot play the running game (true) or give it back (false). */
    autoplay(on = true) {
      game.setAutoplay(on);
    },
    skipToBoss() {
      game.world?.skipToBoss();
    },
    stats: () => game.stats,
  };
  (window as unknown as { __lf: typeof lf }).__lf = lf;

  if (params.has('play') || (game.autoplay && !params.has('title'))) game.newGame();
  else game.showTitle();
  mark('title');
  screens.hideLoading();
  stage.start();
}

/**
 * The shader / pipeline half of the view warm-up (the zombie looks are built
 * later, behind the title). Uses the view's own entry point for it when the
 * render side has one, else the warm-up step of the view core.
 */
function warmShaders(game: Game, budgetMs: number): boolean {
  const view = game.view as unknown as { prewarmShaders?: (ms: number) => boolean };
  return typeof view.prewarmShaders === 'function' ? view.prewarmShaders(budgetMs) : game.view.debug.prewarm(budgetMs);
}

boot().catch((e: unknown) => {
  console.error(e);
  document.getElementById('lf-boot')?.remove();
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;background:#07090d;color:#f0d9b5;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;z-index:999';
  pre.textContent = `Last Ferry failed to start.\n\n${(e as Error)?.stack ?? String(e)}`;
  document.body.appendChild(pre);
});
