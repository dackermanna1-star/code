// Runs a viewer script against tests/fphands.html:
//   SCRIPT=path/to/snippet.js OUT=name node tests/play.mjs tests/fph_run.mjs
// The snippet is the body of an async function (FPV in scope) returning a dataURL (or {url, log}).
import fs from 'fs';
export default async ({ page, wait, logs }) => {
  const q = process.env.Q || '';
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + 'tests/fphands.html?' + q, { timeout: 180000 });
  for (let i = 0; i < 240; i++) { await wait(500); if (await page.evaluate(() => window.__ready).catch(() => false)) break; }
  const src = fs.readFileSync(process.env.SCRIPT, 'utf8');
  const t0 = Date.now();
  const res = await page.evaluate(`(async () => { const FPV = window.FPV; ${src} })()`).catch((e) => ({ err: e.message }));
  console.log('eval ms', Date.now() - t0);
  const outs = Array.isArray(res) ? res : [res];
  outs.forEach((r, i) => {
    if (!r) return;
    if (r.err) console.log('ERR', r.err);
    if (r.log) console.log(r.log);
    if (r.url) { const f = `tests/out/${process.env.OUT || 'fph'}${outs.length > 1 ? '_' + i : ''}.png`; fs.writeFileSync(f, Buffer.from(r.url.split(',')[1], 'base64')); console.log('wrote', f); }
  });
  const errs = logs.filter((l) => /error|warn/i.test(l));
  console.log('console errors/warnings:', errs.length); errs.slice(0, 20).forEach((l) => console.log(l.slice(0, 400)));
};
