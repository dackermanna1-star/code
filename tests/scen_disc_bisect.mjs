// Bisect the black-disc artifact: toggle passes / scene children and sample pixels (streams results).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log('playing');
  await evalg(() => {
    const g = window.game, R = g.renderer, c = R.r.domElement, gl = R.r.getContext();
    g.director.enabled = false; g.player.pitch = -1.1; g.advance(0.3); g.player.pitch = -1.1; g.advance(0.05);
    g.paused = true;
    const pts = [[0.5, 0.6], [0.5, 0.8], [0.4, 0.7], [0.6, 0.5]];
    window.__sample = () => { R.render(0.016); const out = []; for (const [x, y] of pts) { const b = new Uint8Array(4); gl.readPixels(Math.floor(c.width * x), Math.floor(c.height * (1 - y)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); out.push(b[0] + b[1] + b[2]); } return out.join(','); };
  });
  const t0 = Date.now();
  console.log('base', await evalg(() => window.__sample()), Date.now() - t0, 'ms');
  for (const k of ['ao', 'vmPass', 'bloom', 'grade', 'fxaa']) console.log('no_' + k, await evalg((k) => { const R = window.game.renderer, p = R[k]; if (!p) return 'n/a'; p.enabled = false; const s = window.__sample(); p.enabled = true; return s; }, k));
  console.log('flash noshadow', await evalg(() => { const g = window.game; g.flashlight.castShadow = false; const s = window.__sample(); g.flashlight.castShadow = true; return s; }));
  console.log('flash off', await evalg(() => { const g = window.game; const i = g.flashlight.intensity; g.flashlight.intensity = 0; const s = window.__sample(); g.flashlight.intensity = i; return s; }));
  const n = await evalg(() => window.game.renderer.scene.children.length);
  console.log('children', n);
  // binary halves of scene children
  const test = (a, b) => evalg(([a, b]) => { const ch = window.game.renderer.scene.children; const hid = []; for (let i = a; i < b; i++) if (ch[i].visible) { ch[i].visible = false; hid.push(ch[i]); } const s = window.__sample(); hid.forEach((o) => (o.visible = true)); return s; }, [a, b]);
  const step = Math.max(1, Math.ceil(n / 12));
  for (let a = 0; a < n; a += step) console.log('hide', a, Math.min(n, a + step), await test(a, Math.min(n, a + step)), await evalg(([a, b]) => window.game.renderer.scene.children.slice(a, b).map((o) => (o.name || o.type)).join(' ').slice(0, 200), [a, a + step]));
};
