// Debug overlay + automation API (window.__game) used by headless tests (tools/*.mjs).
import { ctx } from './GameContext';

export interface DebugApi {
  ctx: typeof ctx;
  /** Arbitrary per-module debug helpers registered via registerDebug(). */
  [key: string]: unknown;
}

/** Shared debug state. When freeCam is true, gameplay camera controllers must not touch ctx.camera. */
export const debugState = { freeCam: false };

const api: DebugApi = { ctx, debugState };
(window as any).__game = api;

/** Modules register test/debug helpers here, e.g. registerDebug('giveItem', (id, n) => ...). */
export function registerDebug(name: string, value: unknown): void {
  api[name] = value;
}

let overlay: HTMLDivElement | null = null;
let lastUpdate = 0;

/** Small FPS/perf overlay, shown when settings.gameplay.showFps or ?debug=1. */
export function updateDebugOverlay(now: number): void {
  const show = ctx.settings?.data.gameplay.showFps || ctx.flags?.has('debug');
  if (!show) {
    if (overlay) overlay.style.display = 'none';
    return;
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'debug-overlay';
    overlay.style.cssText =
      'position:fixed;top:4px;left:4px;z-index:9999;font:11px/1.3 monospace;color:#9f9;background:rgba(0,0,0,.55);padding:4px 6px;pointer-events:none;white-space:pre';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  if (now - lastUpdate < 250) return;
  lastUpdate = now;
  const s = ctx.engine.stats;
  const p = ctx.player;
  const lines = [
    `${s.fps.toFixed(0)} fps  frame ${s.frameMs.toFixed(1)}ms  sim ${s.simMs.toFixed(1)}ms  render ${s.renderMs.toFixed(1)}ms`,
    `draws ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k  ticks ${s.ticks}`,
  ];
  if (p) lines.push(`pos ${p.position.x.toFixed(1)} ${p.position.y.toFixed(1)} ${p.position.z.toFixed(1)}  ${p.moveState} ${p.stance} hp ${p.health.toFixed(0)}`);
  overlay.textContent = lines.join('\n');
}
