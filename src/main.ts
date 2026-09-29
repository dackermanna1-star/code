import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './ui/styles.css';
import { Game } from './game/Game';

const params = new URLSearchParams(location.search);
if (params.has('view')) {
  import('./debug/viewer').then((m) => m.bootViewer());
} else {
  const game = new Game();
  game.boot().catch((e) => {
    console.error(e);
    const el = document.createElement('pre');
    el.style.cssText = 'position:fixed;inset:20px;color:#fff;background:#300;padding:20px;z-index:999;white-space:pre-wrap;font:14px monospace';
    el.textContent = 'Failed to start: ' + (e?.stack || e);
    document.body.append(el);
  });
}
