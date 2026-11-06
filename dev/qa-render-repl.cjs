// Render QA: persistent headless game + tiny HTTP control server so scenes can be scripted interactively.
// Usage: node dev/qa-render-repl.cjs [gamePort=5305] [ctlPort=5405]
//   curl -s localhost:5405/js --data-binary @snippet.js   (body = async function body, `g` = window.game; return JSON-able)
//   curl -s 'localhost:5405/shot?name=foo'                  (-> dev/out/qa-render-foo.png)
//   curl -s localhost:5405/reload                           (reload page + wait for game)
//   curl -s localhost:5405/log                              (console errors / warnings since last call)
const { chromium } = require('playwright');
const http = require('http');
const gamePort = process.argv[2] || 5305;
const ctlPort = +(process.argv[3] || 5405);
const seed = process.env.SEED || 'millbrook';
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  let logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 500)); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  const load = async () => {
    const t = Date.now();
    await p.goto(`http://localhost:${gamePort}/?autostart=1&test=1&seed=${seed}`);
    await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 300000 });
    // no-clip helper: P.flying freezes vertical motion (aerial / scripted shots)
    await p.evaluate(() => {
      const g = window.game; const P = g.player; const orig = P.updateMovement.bind(P);
      P.updateMovement = (dt, input, ctx) => {
        if (P.flying) { P.vy = 0; P.vx = P.vz = 0; return {}; }
        if (window.__input) input = Object.assign({}, input, window.__input);
        return orig(dt, input, ctx);
      };
      g.__god = true;
      window.__qa = {
        tp(x, y, z, yaw = 0, pitch = -0.1, fly = false) { P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; P.yaw = yaw; P.pitch = pitch; P.flying = fly; },
        time(h) { g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + h); },
        day(d, h) { g.time = g.computeTime((d - 1) * 24 + h); },
        weather(w) { g.weatherSys.set(w, true); g.weatherSys.nextChange = 999; },
        ground(x, z) { return g.world.surfaceY(Math.floor(x), Math.floor(z)); },
        poi(match) { return g.world.pois.find((q) => q.name.toLowerCase().includes(match) || q.type === match); },
        frames(n) { return new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }); },
      };
      const hurt = g.survival.hurt.bind(g.survival);
      g.survival.hurt = (a, c, s) => { if (!g.__god) return hurt(a, c, s); };
    });
    console.log('loaded in', ((Date.now() - t) / 1000).toFixed(1), 's');
  };
  await load();
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        let out;
        if (url.pathname === '/js') {
          out = await p.evaluate(async (src) => {
            const g = window.game;
            const fn = new Function('g', 'return (async () => {' + src + '\n})()');
            const r = await fn(g);
            return JSON.stringify(r ?? null);
          }, body);
          out = JSON.parse(out);
        } else if (url.pathname === '/shot') {
          const name = url.searchParams.get('name') || 'shot';
          await p.screenshot({ path: `dev/out/qa-render-${name}.png`, timeout: 120000 });
          out = 'dev/out/qa-render-' + name + '.png';
        } else if (url.pathname === '/reload') {
          logs = [];
          await load();
          out = 'reloaded';
        } else if (url.pathname === '/log') {
          out = logs; logs = [];
        } else if (url.pathname === '/wait') {
          await p.waitForTimeout(+(url.searchParams.get('ms') || 1000));
          out = 'ok';
        } else if (url.pathname === '/quit') {
          res.end('bye'); await b.close(); process.exit(0);
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(out, null, 1));
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e && e.stack || e).slice(0, 3000));
      }
    });
  });
  srv.listen(ctlPort, () => console.log('ctl on', ctlPort));
})();
