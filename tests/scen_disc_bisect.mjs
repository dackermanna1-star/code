// Bisect the black-disc artifact: toggle passes / scene children and sample pixels.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, R = g.renderer, c = R.r.domElement, gl = R.r.getContext();
    g.director.enabled = false; g.player.pitch = -1.1; g.advance(0.3); g.player.pitch = -1.1; g.advance(0.05);
    const pts = [[0.5, 0.6], [0.5, 0.8], [0.4, 0.7], [0.6, 0.5]];
    const sample = () => { R.render(0.016); const out = []; for (const [x, y] of pts) { const b = new Uint8Array(4); gl.readPixels(Math.floor(c.width * x), Math.floor(c.height * (1 - y)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); out.push(b[0] + b[1] + b[2]); } return out.join(','); };
    const res = { base: sample() };
    for (const k of ['ao', 'vmPass', 'bloom', 'grade', 'fxaa']) { const p = R[k]; if (!p) continue; p.enabled = false; res['no_' + k] = sample(); p.enabled = true; }
    R.scene.children.forEach((o, i) => { if (!o.visible) return; o.visible = false; res['hide' + i + '_' + (o.name || o.type)] = sample(); o.visible = true; });
    R.camera.children.forEach((o, i) => { if (!o.visible) return; o.visible = false; res['camhide' + i + '_' + (o.name || o.type)] = sample(); o.visible = true; });
    res.camPos = R.camera.position.toArray().map((v) => v.toFixed(2)).join(','); res.near = R.camera.near;
    return res;
  });
  console.log(JSON.stringify(r, null, 0));
};
