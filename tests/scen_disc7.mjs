// Black-disc repro/bisect: look down at the ch1 start, measure the fraction of pure-black
// pixels in the centre/bottom box under several configurations (no image viewing needed).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.player.flashlight = true; g.advance(0.3); });
  const measure = async (label, setup, keep) => {
    const r = await evalg(setup);
    await evalg(() => { const g = window.game; g.player.pitch = -1.1; g.advance(0.05); g.player.pitch = -1.1; });
    await wait(1800);
    const buf = await page.screenshot({ clip: { x: 240, y: 300, width: 480, height: 240 }, timeout: 90000 }).catch(() => null);
    if (!buf) { console.log(label, 'shot failed'); return; }
    const frac = await evalg(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, sum = 0;
      for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; if (s < 6) n++; sum += s; }
      return (n / (d.length / 4)).toFixed(3) + ' mean ' + (sum / (d.length / 4) / 3).toFixed(1);
    }, buf.toString('base64'));
    console.log(label, 'black', frac, JSON.stringify(r));
    if (keep) await shot('disc7_' + label);
    await evalg(() => window.__undo?.());
  };
  await measure('base', () => { window.__undo = null; const g = window.game; return { fl: g.flashlight.intensity, cast: g.flashlight.castShadow, pos: g.flashlight.position.toArray() }; }, true);
  await measure('noAO', () => { const R = window.game.renderer; if (R.ao) R.ao.enabled = false; window.__undo = () => { if (R.ao) R.ao.enabled = true; }; return !!R.ao; });
  await measure('noBloom', () => { const R = window.game.renderer; if (R.bloom) R.bloom.enabled = false; window.__undo = () => { if (R.bloom) R.bloom.enabled = true; }; return !!R.bloom; });
  await measure('flashOff', () => { const g = window.game; g.player.flashlight = false; window.__undo = () => { g.player.flashlight = true; }; });
  await measure('noShadow', () => { const g = window.game; g.flashlight.castShadow = false; window.__undo = () => { g.flashlight.castShadow = true; }; });
  await measure('flashAtEye', () => { const g = window.game; g.flashlight.position.set(0.25, -0.2, 0); window.__undo = () => { g.flashlight.position.set(0.25, -0.2, 1.1); }; });
  await measure('noGlow', () => { const R = window.game.renderer; const o = R.glow; if (o) o.enabled = false; window.__undo = () => { if (o) o.enabled = true; }; return Object.keys(R).filter((k) => R[k] && R[k].enabled !== undefined).join(','); });
};
