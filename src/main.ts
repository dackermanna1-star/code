import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './ui/styles.css';
import { Game } from './game/Game';
import { SAVE_KEY } from './game/Progression';

/** Optional hot-update hook when hosted in an artifact viewer. */
interface HotHook {
  data?: { save?: string };
  ready?: (start: (data?: { save?: string }) => void) => void;
  snapshot?: (fn: () => unknown) => void;
}
const hot = (window as unknown as { claude?: { hot?: HotHook } }).claude?.hot;

function start(data: { save?: string } = {}) {
  // a republish hands back the snapshot below; restore the save if storage lost it
  if (data.save) {
    try {
      if (!localStorage.getItem(SAVE_KEY)) localStorage.setItem(SAVE_KEY, data.save);
    } catch {
      /* storage unavailable */
    }
  }
  const params = new URLSearchParams(location.search);
  if (params.has('view')) {
    import('./debug/viewer').then((m) => m.bootViewer());
    return;
  }
  const game = new Game();
  game.boot().catch((e) => {
    console.error(e);
    const el = document.createElement('pre');
    el.style.cssText = 'position:fixed;inset:20px;color:#fff;background:#300;padding:20px;z-index:999;white-space:pre-wrap;font:14px monospace';
    el.textContent = 'Failed to start: ' + (e?.stack || e);
    document.body.append(el);
  });
}

hot?.snapshot?.(() => {
  try {
    return { save: localStorage.getItem(SAVE_KEY) ?? undefined };
  } catch {
    return {};
  }
});
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
