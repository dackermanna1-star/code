// QA scratch: evaluate an expression file in the running game. Usage: node dev/qa-zombies-dbg.cjs <file.js> [port]
const fs = require('fs');
const { boot } = require('./qa-zombies-lib.cjs');
(async () => {
  const files = process.argv.slice(2).filter((a) => !/^\d+$/.test(a));
  const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const { browser, page, ev, shot, settle, report } = await boot({ port: process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 5302 });
  const steps = src.split(/^\/\/ ---- ?(.*)$/m);
  // steps: [pre, label1, body1, label2, body2...]; body is an async function body run in-page; "wait N" label waits N ms
  for (let i = 1; i < steps.length; i += 2) {
    const label = steps[i].trim(), body = steps[i + 1];
    if (/^wait \d+/.test(label)) { await page.waitForTimeout(+label.split(' ')[1]); }
    else if (/^shot /.test(label)) { await shot(label.slice(5)); continue; }
    else if (/^settle/.test(label)) { await settle(+(label.split(' ')[1] || 2500)); }
    if (!body.trim()) continue;
    try {
      const r = await ev(new Function('return (async () => {' + body + '})()'));
      if (r !== undefined) console.log('[' + label + ']', typeof r === 'string' ? r : JSON.stringify(r));
    } catch (e) { console.log('[' + label + '] ERROR', e.message.split('\n')[0]); }
  }
  report();
  await browser.close();
})();
