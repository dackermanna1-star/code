// Entry point: settings, audio engine, session and the frame loop.
import { Session } from './session.js';
import { loadSettings } from './config.js';
import { NullAudio } from './audio/audio.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const settings = loadSettings();

async function makeAudio() {
  try {
    const mod = await import('./audio/audioEngine.js');
    const a = new mod.AudioEngine(settings);
    await a.init();
    return a;
  } catch (e) {
    console.warn('Audio engine unavailable, running silent:', e?.message || e);
    const n = new NullAudio();
    n.music = { setState() {}, setIntensity() {}, stinger() {} };
    return n;
  }
}

(async () => {
  const audio = await makeAudio();
  if (!audio.music) audio.music = { setState() {}, setIntensity() {}, stinger() {} };
  const session = new Session(canvas, ui, settings, audio);
  window.session = session;
  const params = new URLSearchParams(location.search);
  session.showMainMenu();
  if (params.has('autostart')) {
    const ch = parseInt(params.get('autostart')) || 0;
    session.startCampaign(ch);
  }
  // resume audio on first interaction
  const resume = () => { audio.resume?.(); };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', (e) => {
    resume();
    if ((e.code === 'Escape' || e.code === 'KeyP') && session.state === 'playing' && !session.game.paused && session.game.input.locked === false) session.pause();
  });
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const g = session.game;
    if (session.state === 'menu' && g.level && g.player) {
      // slow cinematic drift behind the menu
      g.player.yaw += dt * 0.03;
    }
    session.tickFade();
    g.frame(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // Co-op: requestAnimationFrame stops in hidden tabs, which would freeze the
  // host's simulation for everyone (or starve a client). Keep ticking without
  // rendering while the tab is hidden.
  setInterval(() => {
    if (!document.hidden || !session.net) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const g = session.game;
    const nr = g.noRender;
    g.noRender = true;
    g.frame(dt);
    g.noRender = nr;
  }, 50);
})();
