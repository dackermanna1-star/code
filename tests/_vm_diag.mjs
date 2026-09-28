export default async ({ page, evalg, wait, logs, shot }) => {
  await page.goto('http://localhost:5180/?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await wait(2000);
  const t0 = Date.now();
  await shot('vm_diag1');
  console.log('shot ms', Date.now() - t0);
  const r = await evalg(() => { const g = window.game; const out = []; for (let i = 0; i < 5; i++) { const t = performance.now(); g.frame(0.016); out.push((performance.now() - t).toFixed(0)); } return out.join(','); });
  console.log('frame ms', r);
  console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 12).join('\n').slice(0, 3000));
};
