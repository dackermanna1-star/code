// Shared helpers for the survival QA scripts (dev/qa-survival-*.cjs).
const { chromium } = require('playwright');

async function boot(port = 5303, { seed = 'millbrook', query = '' } = {}) {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  const t0 = Date.now();
  await p.goto(`http://localhost:${port}/?autostart=1&test=1&seed=${seed}${query}`);
  await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 300000 });
  console.log('booted in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const shot = async (name) => { await p.screenshot({ path: `dev/out/qa-survival-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot fail', name, e.message.split('\n')[0])); console.log('shot', name); };
  // install helpers in the page
  await ev(async () => {
    const g = window.game;
    const items = await import('/src/items/items.js');
    window.__items = items;
    window.__inv = await import('/src/inventory/Inventory.js');
    window.H = {
      g,
      give(id, o = {}) { const s = items.createItem(id, o); const left = g.player.inv.addItem(s); g.afterInventoryChange(); return left; },
      clearInv() { const inv = g.player.inv; inv.hotbar.fill(null); for (const s of inv.equipment) if (s?.contents) s.contents.fill(null); inv.changed(); },
      find(id) { return g.player.inv.find(id)[0]; },
      descOf(stack) {
        const inv = g.player.inv;
        for (const d of [...inv.allDescs(), inv.equipmentDesc()]) { const i = d.slots.indexOf(stack); if (i >= 0) return { d, i }; }
        return null;
      },
      actions(stack) { const r = this.descOf(stack); if (!r) return null; return g.getItemActions(r.d, r.i).map((a) => a.label + (a.disabled ? ' (x)' : '')); },
      run(stack, labelStart) {
        const r = this.descOf(stack); if (!r) return 'not found';
        const a = g.getItemActions(r.d, r.i).find((x) => x.label.startsWith(labelStart));
        if (!a) return 'no action ' + labelStart;
        a.run(); return 'ok';
      },
      // advance the game simulation without rendering (headless rendering is ~2-5 fps, dt is clamped to 0.1)
      step(seconds, dt = 0.05) { for (let t = 0; t < seconds; t += dt) { g.update(dt); g.ui.update?.(dt); if (g.player.dead) break; } },
      // finish the current timed action instantly
      finish() { const a = g.action; if (!a) return false; a.t = a.time; g.updateAction(0); return true; },
      stats() { const P = g.player; return { hp: +P.health.toFixed(1), hunger: +P.hunger.toFixed(1), thirst: +P.thirst.toFixed(1), energy: +P.energy.toFixed(1), temp: +P.bodyTemp.toFixed(2), wet: +P.wetness.toFixed(1), sick: +P.sickness.toFixed(1), panic: +P.panic.toFixed(1), pain: +P.pain.toFixed(1), inf: +P.infection.toFixed(1), infected: P.infected, known: P.infectionKnown, drunk: +(P.drunk || 0).toFixed(1), wounds: P.wounds.map((w) => `${w.type}@${w.part}${w.bleeding ? ' BLEED' : ''}${w.bandaged ? ' band' : ''}${w.bandageDirty ? '(dirty)' : ''}${w.disinfected ? ' dis' : ''}${w.infected ? ' INF' : ''}${w.sutured ? ' sut' : ''}${w.splinted ? ' spl' : ''} h${(w.heal || 0).toFixed(2)}`), moodles: P.moodles.map((m) => m.id + m.level) }; },
    };
  });
  return { b, p, ev, shot, errors };
}

function dumpErrors(errors) {
  const uniq = [...new Set(errors)];
  console.log('errors (' + uniq.length + '):\n' + uniq.slice(0, 40).join('\n'));
}

module.exports = { boot, dumpErrors };
