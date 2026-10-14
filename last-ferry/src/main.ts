// LAST FERRY — entry point: stage, environment, audio, UI, loading screen
// (audio baking + rig / shader warm-up in slices with real progress), then the
// title over a live attract game.
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
  screens.showLoading(0.18, 'Lighting the lamps');
  await nextFrame();

  audio = new AudioSystem(params.has('nosound') ? { context: null } : {});
  const game = new Game(stage, env, audio, screens);
  if (forced) {
    game.qualityOverride = forced;
    game.applyOptions(screens.options);
  }
  // The first frame compiles the pier's shaders (behind the loading screen).
  stage.frame(1 / 60);
  screens.showLoading(0.26, 'Waking the dead');
  await nextFrame();

  // Warm-up: bake every sound, build the zombie looks and effect shaders, in slices.
  let audioFrac = params.has('nosound') ? 1 : 0;
  let audioDone = params.has('nosound');
  if (!audioDone) {
    audio!
      .prewarm((d, t) => (audioFrac = t > 0 ? d / t : 1))
      .then(() => (audioDone = true))
      .catch(() => (audioDone = true));
  }
  let viewDone = false;
  let viewCalls = 0;
  const t0 = performance.now();
  const limitMs = num('loadlimit') ?? 25000;
  while (!(viewDone && audioDone) && performance.now() - t0 < limitMs) {
    if (!viewDone) {
      viewDone = game.view.prewarm(14);
      viewCalls++;
    }
    // Rig warm-up has no counter of its own: ~170 slices on a desktop; asymptotic until it reports done.
    const viewFrac = viewDone ? 1 : 1 - Math.exp(-viewCalls / 60);
    const p = 0.26 + 0.74 * (0.5 * viewFrac + 0.5 * audioFrac);
    screens.showLoading(Math.min(0.99, p), audioFrac < 1 ? 'Tuning the foghorn' : 'Waking the dead');
    await nextFrame();
  }
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
  screens.hideLoading();
  stage.start();
}

boot().catch((e: unknown) => {
  console.error(e);
  document.getElementById('lf-boot')?.remove();
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;background:#07090d;color:#f0d9b5;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;z-index:999';
  pre.textContent = `Last Ferry failed to start.\n\n${(e as Error)?.stack ?? String(e)}`;
  document.body.appendChild(pre);
});
