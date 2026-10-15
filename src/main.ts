import { bootGame } from './game/Game';

bootGame().catch((e) => {
  console.error('[boot] fatal', e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;color:#f66;background:#111;padding:20px;z-index:99999;white-space:pre-wrap';
  el.textContent = 'Failed to start: ' + (e?.stack ?? e);
  document.body.appendChild(el);
});
