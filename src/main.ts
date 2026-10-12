// Entry point: loading, stage, environment, audio, title screen.
import './style.css';
import { Stage } from './render/Stage';
import { Environment } from './render/env/Environment';
import { AudioSystem } from './audio/AudioSystem';
import { renderWeaponIcons } from './render/models/weaponIcons';
import { Game } from './game/Game';
import { World } from './core/World';
import { Bot } from './core/Bot';
import { ensureFonts } from './ui/dom';
import { createEnemy } from './core/enemies';
import type { EnemyType } from './config/enemies';
import { FP, wrapAngle, type ViewMode } from './config/firstPerson';

const params = new URLSearchParams(location.search);

async function boot(): Promise<void> {
  ensureFonts();
  const host = document.getElementById('app')!;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = '<div class="loading-title">SealHunter</div><div class="loading-bar"><i></i></div><div class="loading-text">Loading…</div>';
  document.body.appendChild(loading);
  const bar = loading.querySelector('i') as HTMLElement;
  const setProgress = (k: number, text?: string) => {
    bar.style.width = `${Math.round(k * 100)}%`;
    if (text) (loading.querySelector('.loading-text') as HTMLElement).textContent = text;
  };

  const stage = new Stage(host);
  const quality = (params.get('quality') as 'low' | 'medium' | 'high' | null) ?? 'high';
  setProgress(0.05, 'Building the ice floe…');
  await nextFrame();
  const env = new Environment(stage, { quality });

  const audio = new AudioSystem();
  const fontsReady = Promise.all(
    ['SH Trebuchet', 'SH Kinifed', 'SH Kroftsmann', 'SH Default'].map((f) =>
      document.fonts.load(`16px "${f}"`).catch(() => undefined),
    ),
  );
  setProgress(0.15, 'Loading sounds…');
  const audioReady = params.has('nosound')
    ? Promise.resolve()
    : audio.load((d, t) => setProgress(0.15 + 0.7 * (d / Math.max(1, t)))).catch((e) => console.warn('audio', e));
  await Promise.all([audioReady, fontsReady]);

  setProgress(0.9, 'Polishing guns…');
  await nextFrame();
  const icons = renderWeaponIcons(stage.renderer);

  const game = new Game(stage, env, audio, icons);
  (window as unknown as { __game: unknown }).__game = {
    game,
    stage,
    env,
    World,
    Bot,
    /** Debug: spawn a creature in the running world. */
    spawn(type: EnemyType, x: number, z: number, boss = false) {
      const w = game.world;
      if (!w) return null;
      const e = createEnemy(w, type, { x, z, boss });
      w.addEnemy(e, false);
      return e;
    },
    /** Debug: switch the running game's view ('third' | 'first'), like the V key. */
    setView(mode: ViewMode) {
      game.screens.setOption('view', mode);
    },
    /** Debug: aim the first-person view (yaw/pitch in the config/firstPerson.ts convention; sets player.aim). */
    setAim(yaw: number, pitch = 0) {
      const p = game.world?.player;
      if (!p) return null;
      p.aim = { yaw: wrapAngle(yaw), pitch: Math.max(FP.pitchMin, Math.min(FP.pitchMax, pitch)) };
      return p.aim;
    },
    /** Debug: step `n` frames of `dt` seconds deterministically (call stage.stop() first), rendering the last. */
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) stage.frame(dt, i === n - 1);
    },
  };
  setProgress(1);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);

  if (params.has('autoplay')) game.autoplay = true;
  if (params.has('god')) game.worldOptions.god = true;
  if (params.has('level')) game.worldOptions.startLevel = Number(params.get('level')) || 1;
  if (params.has('money')) game.worldOptions.money = Number(params.get('money')) || 0;
  if (params.has('speed')) game.timeScale = Number(params.get('speed')) || 1;
  // ?fp: play in first person (not persisted to the saved options).
  if (params.has('fp')) game.screens.options.view = 'first';
  if (params.has('play') || params.has('autoplay')) game.newGame();
  else game.showTitle();
  stage.start();
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

boot().catch((e) => {
  console.error(e);
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = `Seal Hunter failed to start:\n${e?.stack ?? e}`;
  document.body.appendChild(pre);
});
