// Screenshot helpers that stay reliable on a heavily loaded machine: the game's
// own frame loop is quieted (paused + no render) and a frame is rendered and
// read back from the canvas inside one evaluate (no compositor round trip).
import fs from 'fs';
export async function quiet(evalg) {
  await evalg(() => { const g = window.game; g.paused = true; g.noRender = true; });
}
export async function grab(evalg, name, dt = 0.016) {
  const url = await evalg((dt) => {
    const g = window.game;
    g.renderer.render(dt);
    g.renderer.render(dt);
    return document.getElementById('game').toDataURL('image/png');
  }, dt);
  if (!url || !url.startsWith('data:image')) { console.log('grab failed', name); return; }
  fs.writeFileSync(`tests/out/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('shot', name);
}
