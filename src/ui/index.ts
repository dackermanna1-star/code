// STUB — replaced by the UI agent. Minimal loading screen + main menu with a Play button.
import type { GameContext } from '../core/GameContext';
import type { IUI } from '../core/contracts';
import { startMatch } from '../game/Game';

export async function installUI(ctx: GameContext): Promise<void> {
  const root = document.getElementById('ui-root')!;
  const loading = document.createElement('div');
  loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#111;font-size:20px';
  root.appendChild(loading);
  const ui: IUI = {
    capturesInput: false,
    showMainMenu() {
      const menu = document.createElement('div');
      menu.className = 'interactive';
      menu.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)';
      const btn = document.createElement('button');
      btn.textContent = 'PLAY';
      btn.style.cssText = 'font-size:32px;padding:16px 64px';
      btn.onclick = () => { menu.remove(); ctx.input.requestPointerLock(); void startMatch({}); };
      menu.appendChild(btn);
      root.appendChild(menu);
    },
    showHUD() {},
    showResults() {},
    notify(text) { console.log('[notify]', text); },
    setLoading(p, msg) { loading.style.display = 'flex'; loading.textContent = `${msg} ${(p * 100).toFixed(0)}%`; },
    hideLoading() { loading.style.display = 'none'; },
  };
  ctx.ui = ui;
}
