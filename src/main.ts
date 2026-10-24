import { Game } from './game/Game';

async function loadFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([document.fonts.load("120px 'Bungee'"), document.fonts.load("600 20px 'Rubik'")]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* offline: fall back to system fonts */
  }
}

async function boot(): Promise<void> {
  await loadFonts();
  const container = document.getElementById('app')!;
  const game = new Game();
  await game.init(container);
  game.start();
}

boot().catch((err) => {
  console.error(err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;color:#f66;padding:20px;white-space:pre-wrap;z-index:99';
  el.textContent = 'Failed to start: ' + (err?.stack || err);
  document.body.appendChild(el);
});
