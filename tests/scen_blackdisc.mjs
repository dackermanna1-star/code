// Find what draws the black disc: hide viewmodel, then disable post passes one by one.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const probe = async (label, fn, arg) => {
    const r = await evalg(fn, arg);
    await wait(300);
    const px = await evalg(() => { const c = document.querySelector('canvas'); const g = window.game; g.renderer.render(0.016); const gl = g.renderer.r.getContext(); const b = new Uint8Array(4); gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height * 0.3), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b); });
    console.log(label, JSON.stringify(r), 'px', JSON.stringify(px));
    await shot('disc_' + label);
  };
  await probe('base', () => { const g = window.game; g.director.enabled = false; g.advance(0.3); return (g.renderer.composer?.passes || []).map((p) => p.constructor.name + (p.enabled ? '' : '(off)')); });
  await probe('novm', () => { const g = window.game; const vm = g.viewmodel; vm.root.visible = false; g.advance(0.05); return 'vm hidden'; });
  const n = await evalg(() => (window.game.renderer.composer?.passes || []).length);
  for (let i = 1; i < (n || 0); i++) {
    await probe('pass' + i, (i) => { const g = window.game; g.viewmodel.root.visible = true; const ps = g.renderer.composer.passes; ps.forEach((p, k) => { p.enabled = k !== i; }); g.advance(0.05); return 'disabled ' + ps[i].constructor.name + (ps[i].name ? ':' + ps[i].name : ''); }, i);
  }
};
