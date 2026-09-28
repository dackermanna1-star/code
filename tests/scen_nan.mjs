// Black-disc hunt: after the world pass, read the HDR buffer back and count NaN/Inf/huge pixels
// (a single non-finite pixel is spread into a big black disc by the bloom mip chain).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => {
    const R = window.game.renderer; const r = R.r; window.__nan = [];
    const pass = R.worldPass; const orig = pass.render.bind(pass);
    const buf = new Uint16Array(4 * 1);
    const toF = (h) => { const e = (h >> 10) & 31, m = h & 1023; if (e === 31) return m ? NaN : Infinity; return (e ? (1 + m / 1024) * 2 ** (e - 15) : m / 1024 * 2 ** -14); };
    pass.render = function (renderer, w, rb, ...a) {
      orig(renderer, w, rb, ...a);
      if (!window.__scan) return;
      window.__scan = false;
      const W = rb.width, H = rb.height; const px = new Uint16Array(W * H * 4);
      try { renderer.readRenderTargetPixels(rb, 0, 0, W, H, px); } catch (e) { window.__nan.push('readErr ' + e.message); return; }
      let bad = 0, huge = 0, max = 0, where = [];
      for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) { const v = toF(px[i * 4 + c]); if (!Number.isFinite(v)) { bad++; if (where.length < 6) where.push([i % W, (i / W) | 0, v]); break; } if (v > max) max = v; if (v > 200) huge++; }
      window.__nan.push({ bad, huge, max: +max.toFixed(1), where });
    };
  });
  const scan = async (label, setup, arg) => {
    await evalg(setup || (() => 0), arg);
    await evalg(() => { window.__scan = true; });
    await wait(1200);
    const r = await evalg(() => window.__nan.pop());
    console.log(label, JSON.stringify(r));
    return r;
  };
  const pos = await evalg(() => window.game.survivors.map((s) => [s.name, s.pos.x.toFixed(1), s.pos.z.toFixed(1), !!s.flashlight]));
  console.log('surv', JSON.stringify(pos));
  for (let i = 0; i < 16; i++) {
    const r = await scan('t' + i, (i) => { const g = window.game; g.player.yaw = i * 0.7; g.player.pitch = i % 3 === 0 ? -1.1 : i % 3 === 1 ? 0 : -0.5; g.player.flashlight = i % 2 === 0; g.advance(0.4); }, i);
    if (r && r.bad) { await shot('nan_' + i); break; }
  }
};
