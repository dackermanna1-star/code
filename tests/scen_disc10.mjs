// Black-disc regression: inject an Inf-bright and a NaN-emitting pixel source in view and
// measure the black-pixel fraction of the centre box (was a screen-sized black disc).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.player.flashlight = true; g.advance(0.3); });
  const measure = async (label, setup, keep) => {
    const r = await evalg(setup);
    await evalg(() => { const g = window.game; g.player.pitch = -0.9; g.advance(0.05); g.player.pitch = -0.9; });
    await wait(2500);
    const buf = await page.screenshot({ timeout: 90000 }).catch(() => null);
    if (!buf) { console.log(label, 'shot failed'); return; }
    const frac = await evalg(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(240, 200, 480, 300).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 6) n++;
      return (n / (d.length / 4)).toFixed(3);
    }, buf.toString('base64'));
    console.log(label, 'black', frac, JSON.stringify(r));
    if (keep) await shot('disc10_' + label);
  };
  await measure('base', () => 0);
  await measure('inf', () => {
    const g = window.game; const T = g.renderer.camera.constructor; // THREE via instances
    const cam = g.renderer.camera; let M = null; g.scene.traverse((o) => { if (!M && o.isMesh && o.material?.isMeshBasicMaterial) M = o; });
    const mat = new M.material.constructor({ color: 0xffffff }); mat.color.setRGB(1e7, 1e7, 1e7); mat.toneMapped = false; mat.fog = false;
    const geo = new M.geometry.constructor(); // empty BufferGeometry
    const p = new Float32Array([-0.05, -0.05, 0, 0.05, -0.05, 0, 0, 0.05, 0]); geo.setAttribute('position', new (M.geometry.attributes.position.constructor)(p, 3)); geo.computeVertexNormals();
    const m = new M.constructor(geo, mat); m.position.set(0, -0.1, -1.5); m.frustumCulled = false; cam.add(m); window.__inj = m;
    return mat.type;
  }, true);
  await measure('nan', () => {
    const m = window.__inj; const S = m.material.constructor; // replace with a NaN-emitting shader material
    const all = []; window.game.scene.traverse((o) => { if (o.material?.isShaderMaterial && all.length < 1) all.push(o.material); });
    const sm = all[0].clone(); sm.vertexShader = 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
    sm.fragmentShader = 'uniform float zz; void main(){ float n = zz / zz; gl_FragColor = vec4(vec3(n), 1.0); }';
    sm.uniforms = { zz: { value: 0 } }; sm.transparent = false; sm.depthWrite = true; sm.blending = 1; sm.needsUpdate = true; m.material = sm;
    return 'nan';
  }, true);
  // control: strip the sanitizer from the three post shaders -> the disc must come back
  await measure('nanUnsanitized', () => {
    const R = window.game.renderer; const pat = /if \(!\(s >= 0\.0\)\) return vec3\(0\.0\);\s*return min\(max\(c, vec3\(0\.0\)\), vec3\(64\.0\)\);/;
    let n = 0; for (const m of [R.grade.material, R.ao?.compMat, R.bloom?.materialHighPassFilter]) { if (m && pat.test(m.fragmentShader)) { m.fragmentShader = m.fragmentShader.replace(pat, 'return c;'); m.needsUpdate = true; n++; } }
    return n;
  }, true);
};
