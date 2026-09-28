// Black-disc regression: inject an Inf-bright and a NaN-emitting pixel source in view and
// measure the black-pixel fraction of the centre box (was a screen-sized black disc).
// The frame is rendered and read back inside one evaluate (no slow page screenshots).
import fs from 'fs';
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.player.flashlight = true; g.advance(0.3); g.paused = true; });
  const measure = async (label, setup, keep) => {
    const r = await evalg(setup);
    const out = await evalg((keep) => {
      const g = window.game; g.player.pitch = -0.9; g.advance(0.05); g.player.pitch = -0.9; g.advance(0.0001);
      for (let i = 0; i < 3; i++) g.renderer.render(0.016, g); // bloom mips settle
      const cv = g.renderer.r.domElement, c = document.createElement('canvas'); c.width = 480; c.height = 270;
      const x = c.getContext('2d'); x.drawImage(cv, 0, 0, 480, 270);
      const d = x.getImageData(120, 70, 240, 170).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 6) n++;
      return { black: +(n / (d.length / 4)).toFixed(3), png: keep ? c.toDataURL('image/png') : null };
    }, keep);
    if (!out) { console.log(label, 'failed'); return; }
    console.log(label, 'black', out.black, JSON.stringify(r));
    if (out.png) fs.writeFileSync(`tests/out/disc10_${label}.png`, Buffer.from(out.png.split(',')[1], 'base64'));
  };
  await measure('base', () => 0);
  await measure('inf', () => {
    const g = window.game; const cam = g.renderer.camera;
    let M = null; g.scene.traverse((o) => { if (!M && o.isMesh && o.material?.isMeshBasicMaterial) M = o; });
    const mat = new M.material.constructor({ color: 0xffffff }); mat.color.setRGB(1e7, 1e7, 1e7); mat.toneMapped = false; mat.fog = false;
    const geo = new M.geometry.constructor();
    geo.setAttribute('position', new (M.geometry.attributes.position.constructor)(new Float32Array([-0.02, -0.02, 0, 0.02, -0.02, 0, 0, 0.02, 0]), 3));
    const m = new M.constructor(geo, mat); m.position.set(0, -0.1, -1.5); m.frustumCulled = false; cam.add(m); window.__inj = m;
    return mat.type;
  });
  await measure('nan', () => {
    const m = window.__inj; const all = []; window.game.scene.traverse((o) => { if (o.material?.isShaderMaterial && all.length < 1) all.push(o.material); });
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
  await measure('infUnsanitized', () => { const m = window.__inj; const M = m.material; let B = null; window.game.scene.traverse((o) => { if (!B && o.isMesh && o.material?.isMeshBasicMaterial) B = o.material; }); const mat = new B.constructor(); mat.color.setRGB(1e7, 1e7, 1e7); mat.toneMapped = false; mat.fog = false; m.material = mat; return 'inf'; });
};
