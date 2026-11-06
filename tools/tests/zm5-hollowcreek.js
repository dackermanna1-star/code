// Hollow Creek (zm_hollow_creek, Milestone 5): the map's own checks, on top of zm5-framework.js.
//  - builds and compiles; budgets against de_dust2 x 1.3 (the numbers are printed)
//  - no leaks: a grid of traces down from the sky always lands on the world; every nav node is
//    inside the playable footprint (the callout zones), stands on a floor, and the horizon is
//    closed round it (hull traces in 8 directions never leave the map); nobody falls out
//  - nav: % of sampled floor (every area, every 48 units) on the graph within 40 units; one
//    connected component both ways from the squad start
//  - every front: zombies spawned at its far and middle spawn spots walk to the squad in time
//  - tricky spots (the hardware roof deck, the gazebo, a car roof, the bus hood, behind the diner
//    counter, the church altar, the bell tower, the holding cell, the highway, the rail platform,
//    under the covered bridge, the kiosk): the horde reaches a god player standing there
//  - light: how bright the walkable floor is (a zombie must read at 800 units), lit vs dark share
//  - a 3-bot squad (and you as a turret, in god mode) through waves 1-5 on Normal; no stuck bots
//  - load time, frame cost with 28 zombies up
// Screenshots (<outPrefix>_N.png, labelled in the log): the title shots and the thumbnail view,
// each front's first arrival, a dark corner, both extraction points, a fight in wave 3.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=3&map=zm_hollow_creek" tools/tests/zm5-hollowcreek.js /tmp/zm5hc
// Prints "[sim] PASS ..." / "[sim] FAIL ..." / "[sim] INFO ...".
/* global performance */
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const info = (s) => out.push(`[sim] INFO ${s}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { try { g.console.exec(line); } catch { /* cheats optional */ } };
  const Z = () => g.zombies;
  const me = () => g.local;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const put = (p, pos) => { p.pm.origin = [pos[0], pos[1], pos[2] + 37]; p.prevOrigin = p.pm.origin.slice(); p.pm.velocity = [0, 0, 0]; };
  let M = null, D = null; // modules, the map definition
  const steps = [];
  const shots = []; // pending screenshots { label, eye, look }
  let frozen = null;

  function newRun(allies) {
    g.newGame({ mode: 'zombies', allies });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(allies);
    ticks(50);
    me().god = true;
    con('sv_cheats 1');
  }
  const holdBreak = () => { Z().nextWaveAt = 1e9; Z().clearHorde(); };
  /** Bring a walker up at nav node n: tough and harmless (it only has to arrive). */
  function walker(n) {
    const up = new Set(Z().pool.filter((q) => q.alive));
    Z().spawnZombie({ at: [n.x, n.y, n.z + 37], variant: 'walker' });
    const z = Z().pool.find((q) => q.alive && !up.has(q));
    if (z) { z.health = z.maxHealth = 1e6; z.zDamage = 0; }
    return z;
  }
  const near = (z, p, r = 96) => flat(z.pm.origin, p.pm.origin) < r && Math.abs(z.pm.origin[2] - p.pm.origin[2]) < 80;
  const eyeOf = (p) => [p.pm.origin[0], p.pm.origin[1], p.pm.origin[2] + 28];
  function shot(label, eye, look) { shots.push({ label, eye, look }); }

  // ---------------------------------------------------------------- static: build, budgets, leaks, nav, light
  steps.push(async () => {
    M = {
      maps: await import('/src/map/maps/index.js'), prep: await import('/src/map/prepare.js'), nav: await import('/src/game/nav.js'),
      coll: await import('/src/engine/collision.js'), pm: await import('/src/engine/pmove.js'), area: await import('/src/map/areagen.js'),
    };
    D = M.maps.BUILTIN.zm_hollow_creek;
    check('the page loaded Hollow Creek', g.W.mapDef.id === 'zm_hollow_creek', g.W.mapDef.id);
    const t0 = performance.now();
    let P;
    try { P = M.prep.prepareMap(D); } catch (e) { check('builds and compiles', false, e.message); return true; }
    const ms = performance.now() - t0;
    let tris = 0;
    const tex = new Set();
    for (const f of P.compiled.faces) { tris += f.poly.length - 2; tex.add(f.texName); }
    check('builds and compiles (deterministic: same hash as the loaded world)', P.compiled.faces.length > 1000 && P.hash === g.W.hash, `${P.map.brushes.length} brushes, ${P.compiled.faces.length} faces in ${ms | 0} ms, hash ${P.hash}`);
    // budgets against de_dust2
    const R = M.prep.prepareMap(M.maps.BUILTIN.de_dust2);
    let rtris = 0;
    const rtex = new Set();
    for (const f of R.compiled.faces) { rtris += f.poly.length - 2; rtex.add(f.texName); }
    const seeds = (map) => map.entities.filter((e) => e.classname.startsWith('info_player_')).map((e) => [e.origin[0], e.origin[1], e.origin[2] - 36]);
    const rnav = new M.nav.NavGraph(R.compiled.world, R.map.bounds).build(seeds(R.map));
    const mine = { brushes: P.map.brushes.length, faces: P.compiled.faces.length, tris, draws: tex.size, atlas: P.alloc.width * P.alloc.height, nav: g.nav.nodes.length, lights: P.lighting.lights.length };
    const ref = { brushes: R.map.brushes.length, faces: R.compiled.faces.length, tris: rtris, draws: rtex.size, atlas: R.alloc.width * R.alloc.height, nav: rnav.nodes.length, lights: R.lighting.lights.length };
    const over = ['brushes', 'faces', 'tris', 'draws', 'atlas', 'nav'].filter((k) => mine[k] > ref[k] * 1.3);
    check('budgets within de_dust2 x 1.3', !over.length, ['brushes', 'faces', 'tris', 'draws', 'atlas', 'nav'].map((k) => `${k} ${mine[k]}/${Math.round(ref[k] * 1.3)} (${(mine[k] / ref[k]).toFixed(2)}x)`).join(', ') + `, lightmap ${P.alloc.width}x${P.alloc.height}, ${mine.lights} lights`);
    info(`load: build + lightmap ${g.W.loadMs | 0} ms (${g.W.lmSource}); textures: ${[...tex].join(' ')}`);
    check('loaded with its shipped lightmap (no bake at load)', g.W.lmSource === 'prebaked', g.W.lmSource);

    // leaks: the sky never sees through to the void
    const W = P.compiled.world, tr = new M.coll.TraceResult(), [bx0, by0, bx1, by1] = P.map.bounds;
    let holes = 0, probes = 0;
    for (let x = bx0 + 8; x < bx1; x += 64) for (let y = by0 + 8; y < by1; y += 64) {
      probes++;
      W.trace([x, y, 2400], [x, y, -900], [0, 0, 0], [0, 0, 0], M.coll.MASK_WORLD_PLAYER, tr);
      if (tr.fraction >= 1) holes++;
    }
    check('no holes to the void (traces down from the sky on a 64-unit grid)', !holes, `${holes} of ${probes}`);
    // every nav node: inside the playable footprint, on a floor, enclosed (hull traces in 8 directions hit something)
    const nodes = g.nav.nodes, zones = D.zones;
    const inZone = (n) => zones.some((z) => n.x >= z[2] && n.x <= z[4] && n.y >= z[3] && n.y <= z[5]);
    const outside = nodes.filter((n) => !inZone(n));
    check('every nav node is inside the town (no walking onto the hills)', !outside.length, `${nodes.length} nodes, ${outside.length} outside: ${outside.slice(0, 4).map((n) => `${n.x | 0},${n.y | 0},${n.z | 0}`).join(' ')}`);
    const low = nodes.filter((n) => n.z < -120);
    check('nobody can fall out (no node below the creek bed)', !low.length, low.slice(0, 3).map((n) => `${n.x | 0},${n.y | 0},${n.z | 0}`).join(' '));
    const H = M.pm.HULL_STAND;
    let open = 0, tested = 0, floorless = 0;
    const openAt = [];
    for (let i = 0; i < nodes.length; i += 5) {
      const n = nodes[i];
      W.trace([n.x, n.y, n.z + 36 + 8], [n.x, n.y, n.z + 36 - 24], H.mins, H.maxs, M.coll.MASK_WORLD_PLAYER, tr);
      if (tr.fraction >= 1 && !tr.startsolid) floorless++;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, s = [n.x, n.y, n.z + 37], e = [n.x + Math.cos(a) * 6000, n.y + Math.sin(a) * 6000, n.z + 37];
        tested++;
        W.trace(s, e, H.mins, H.maxs, M.coll.MASK_WORLD_PLAYER, tr);
        if (tr.fraction >= 1 || tr.endpos[0] < bx0 || tr.endpos[0] > bx1 || tr.endpos[1] < by0 || tr.endpos[1] > by1) { open++; if (openAt.length < 4) openAt.push(`${n.x | 0},${n.y | 0},${n.z | 0}@${k * 45}`); }
      }
    }
    check('enclosed: no hull trace from the graph leaves the map, every node stands on a floor', !open && !floorless, `${tested} traces, ${open} open ${openAt.join(' ')}, ${floorless} floorless`);

    // nav coverage of the floor: sample every area every 48 units
    let samples = 0, covered = 0;
    const miss = [];
    for (const a of P.map.areas) {
      if (a.noFloor || a.kind === 'stairs') continue;
      for (let x = a.x0 + 24; x < a.x1 - 16; x += 48) for (let y = a.y0 + 24; y < a.y1 - 16; y += 48) {
        if (!M.area.AreaMap.contains(a, x, y)) continue;
        const z = M.area.AreaMap.floorAt(a, x, y);
        // the floor there, as a player would stand on it (props, buildings and other areas excluded)
        W.trace([x, y, z + 40 + 36], [x, y, z - 8 + 36], H.mins, H.maxs, M.coll.MASK_WORLD_PLAYER, tr);
        if (tr.startsolid || tr.fraction >= 1 || Math.abs(tr.endpos[2] - 36 - z) > 6) continue;
        samples++;
        if (g.nav.nearest([x, y, z], 40)) covered++;
        else if (miss.length < 6) miss.push(`${x | 0},${y | 0},${z | 0}`);
      }
    }
    check('the nav graph covers the walkable floor (sampled points within 40 units of a node)', covered >= samples * 0.95, `${(100 * covered / samples).toFixed(1)}% of ${samples}; missed e.g. ${miss.join(' ')}`);
    // one component, both ways, from the squad start
    const sq = g.nav.nearest([D.squadStart.pos[0], D.squadStart.pos[1], D.squadStart.pos[2]], 64);
    const N = nodes.length, fwd = new Uint8Array(N), back = new Uint8Array(N), rev = nodes.map(() => []);
    for (const n of nodes) for (const e of n.edges) rev[e.to].push(n.id);
    for (const [seen, nb] of [[fwd, (i) => nodes[i].edges.map((e) => e.to)], [back, (i) => rev[i]]]) {
      const q = [sq.id]; seen[sq.id] = 1;
      while (q.length) { const i = q.pop(); for (const j of nb(i)) if (!seen[j]) { seen[j] = 1; q.push(j); } }
    }
    let both = 0;
    for (let i = 0; i < N; i++) if (fwd[i] && back[i]) both++;
    check('one connected graph: the squad start reaches every node and every node reaches it', both === N, `${both}/${N}`);
    // the buildings you can go into are on the graph, through their doors
    const B = await import('/src/map/maps/zm_hollow_creek_build.js');
    const rooms = { diner: B.DINER, pharmacy: B.PHARMACY, kiosk: B.KIOSK, police: B.POLICE, church: B.NAVE, tower: B.TOWER, 'Elm Lane house': B.HOUSE_ELM, 'Oak Lane house': B.HOUSE_OAK };
    const inside = Object.entries(rooms).map(([k, r]) => [k, nodes.filter((n) => n.x > r.x0 && n.x < r.x1 && n.y > r.y0 && n.y < r.y1 && Math.abs(n.z - r.z) < 20).length]);
    check('every building you can enter is on the nav graph', inside.every(([, c]) => c >= 4), inside.map(([k, c]) => `${k} ${c}`).join(', '));
    // and every doorway works: the path from 40 inside to 64 outside goes straight through it
    const R2 = { diner: B.DINER, pharmacy: B.PHARMACY, kiosk: B.KIOSK, police: B.POLICE, tower: B.TOWER, nave: B.NAVE, elm: B.HOUSE_ELM, oak: B.HOUSE_OAK };
    const shut = [];
    const ways = {};
    for (const [k, f, c] of B.DOORS) {
      const r = R2[k], dv = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[f], wall = { n: r.y1, s: r.y0, e: r.x1, w: r.x0 }[f];
      const at = (o) => (dv[0] ? [wall + dv[0] * o, c] : [c, wall + dv[1] * o]);
      const a0 = at(-40), b0 = at(64);
      const nin = g.nav.nearest([a0[0], a0[1], r.z], 48), nout = g.nav.nearestXY([b0[0], b0[1], r.z], 48, 48);
      const len = g.nav.pathLength(g.nav.findPath(nin, nout));
      if (!(len < 214)) shut.push(`${k} ${f} ${c} (${len | 0})`);
      else ways[k] = (ways[k] || 0) + 1;
    }
    check(`all ${B.DOORS.length} doorways are open to the horde (a short path through each)`, !shut.length, shut.join(', ') || Object.entries(ways).map(([k, n]) => `${k} ${n}`).join(', '));
    check('the holdouts have 2-3 ways in (the diner, the police station, the church)', ways.diner >= 3 && ways.police >= 3 && (ways.nave || 0) >= 2, `diner ${ways.diner}, police ${ways.police}, church ${ways.nave} + the tower door`);
    // light on the walkable floor (what a zombie standing there is lit by)
    const L = [], tmp = [0, 0, 0];
    for (let i = 0; i < N; i += 3) { const n = nodes[i]; g.W.sampler.sample([n.x, n.y, n.z + 30], tmp); L.push(0.3 * tmp[0] + 0.59 * tmp[1] + 0.11 * tmp[2]); }
    L.sort((a, b) => a - b);
    const pct = (p) => L[Math.min(L.length - 1, Math.floor(p * L.length))];
    const mean = L.reduce((s, v) => s + v, 0) / L.length;
    const dark = L.filter((v) => v < 0.05).length / L.length;
    info(`light on the walkable floor (0..2, 1 = sunlit): mean ${mean.toFixed(3)}, 5% ${pct(0.05).toFixed(3)}, 25% ${pct(0.25).toFixed(3)}, median ${pct(0.5).toFixed(3)}, 95% ${pct(0.95).toFixed(3)}; under 0.05: ${(dark * 100).toFixed(1)}%`);
    check('readable at night: nearly all of the walkable floor is lit (light >= 0.05 on 97%)', dark <= 0.03, `${(dark * 100).toFixed(1)}% darker`);
    check('a night map: darker than daylight (mean light well under 0.6)', mean < 0.45, mean.toFixed(3));
    // the screenshots of the title shots and the thumbnail view
    D.titleShots.forEach((s, i) => shot(`title shot ${i}`, s.eye, s.look));
    if (D.thumbShot) shot('thumbnail view', D.thumbShot.eye, D.thumbShot.look);
    return true;
  });

  // ---------------------------------------------------------------- every front reaches the squad
  let FR = null;
  steps.push(async () => {
    if (!FR) {
      newRun(0);
      holdBreak();
      put(me(), D.squadStart.pos);
      ticks(30);
      const fronts = Z().director.fronts();
      check('five named fronts, each with spawn spots', fronts.length === 5 && fronts.every((f) => f.nodes.length >= 10), fronts.map((f) => `${f.name}:${f.nodes.length}`).join(' '));
      Z().buildFlow();
      const dist = Z().dist;
      FR = { t0: g.time, list: [], shot: new Set() };
      for (const f of fronts) {
        const ok = f.nodes.filter((n) => dist[n.id] < Infinity && dist[n.id] > 500).sort((a, b) => dist[b.id] - dist[a.id]);
        for (const n of [ok[0], ok[Math.floor(ok.length / 2)]].filter(Boolean)) {
          const z = walker(n);
          FR.list.push({ f, z, from: n, path: dist[n.id], t: null });
        }
      }
      info(`fronts: ${FR.list.map((r) => `${r.f.id} from ${r.from.x | 0},${r.from.y | 0} (${r.path | 0} by path)`).join('; ')}`);
      return false;
    }
    for (let k = 0; k < 100; k++) {
      g.tick();
      for (const r of FR.list) if (r.t == null && r.z.alive && near(r.z, me())) {
        r.t = g.time - FR.t0;
        if (!FR.shot.has(r.f.id)) {
          FR.shot.add(r.f.id);
          shot(`front ${r.f.id}: first arrival (${r.t.toFixed(1)} s)`, eyeOf(me()), [r.z.pm.origin[0], r.z.pm.origin[1], r.z.pm.origin[2] + 20]);
          return false; // (take the shot now)
        }
      }
    }
    const left = FR.list.filter((r) => r.t == null);
    if (left.length && g.time - FR.t0 < 100) return false;
    for (const f of new Set(FR.list.map((r) => r.f))) {
      const rs = FR.list.filter((r) => r.f === f);
      // a walker covers about 100 units a second: allow its path at half that pace, plus 10 s
      check(`front ${f.name}: its zombies reach the squad in the town square`, rs.every((r) => r.t != null && r.t < r.path / 50 + 10), rs.map((r) => `${r.path | 0} units in ${r.t == null ? 'never' : r.t.toFixed(1) + ' s'}`).join(', '));
    }
    return true;
  });

  // ---------------------------------------------------------------- tricky spots
  const SPOTS = [
    ['the hardware store roof deck', [-464, -384, 160]],
    ['the gazebo', [60, 528, 32]],
    ['a dumpster lid behind the shops', [-260, -780, 48]],
    ['the sandbags at the police station', [470, 420, 48]],
    ['behind the diner counter', [-1000, -476, 16]],
    ['the church altar', [72, 1470, 44]],
    ['the bell tower', [0, 1200, 32]],
    ['the police holding cell', [820, 330, 16]],
    ['the highway deck', [1100, -1760, 256]],
    ['the rail yard platform', [1500, 1744, 32]],
    ['under the covered bridge', [-1616, 0, -96]],
    ['the gas station kiosk', [1040, -740, 8]],
  ];
  let SP = null;
  steps.push(async () => {
    if (!SP) SP = { i: 0, cur: null, ok: [] };
    if (SP.i >= SPOTS.length) {
      check(`the horde reaches a god player at ${SPOTS.length} tricky spots`, SP.ok.every((r) => r.ok), SP.ok.map((r) => `${r.name} ${r.ok ? r.t.toFixed(1) + ' s' : 'NEVER'}`).join('; '));
      return true;
    }
    if (!SP.cur) {
      const [name, pos] = SPOTS[SP.i];
      Z().clearHorde();
      holdBreak();
      put(me(), pos);
      ticks(10);
      const o = me().pm.origin;
      const n = g.nav.nearest([o[0], o[1], o[2] - 36], 64);
      const standing = me().pm.onground && Math.abs(o[2] - 37 - pos[2]) < 12;
      // three walkers from 700-1300 units away by path, from different directions
      const ring = n ? g.nav.around(n, 1300, 4000).filter((x) => x.dist > 700 && (x.node.support ?? 5) >= 3) : [];
      const zs = [];
      for (let k = 0; k < 3 && ring.length; k++) zs.push(walker(ring[Math.floor((k + 0.5) * ring.length / 3)].node));
      SP.cur = { name, pos, zs, t0: g.time, standing, onNav: !!n };
      if (!standing || !n) { SP.ok.push({ name, ok: false, t: 0 }); info(`${name}: can't stand there (${o.map((v) => v | 0)}, nav ${!!n})`); SP.cur = null; SP.i++; }
      return false;
    }
    const c = SP.cur;
    for (let k = 0; k < 200; k++) {
      g.tick();
      put(me(), c.pos); // (stay put)
      if (c.zs.some((z) => z && z.alive && near(z, me(), 88))) { SP.ok.push({ name: c.name, ok: true, t: g.time - c.t0 }); SP.cur = null; SP.i++; return false; }
    }
    if (g.time - c.t0 > 60) { SP.ok.push({ name: c.name, ok: false, t: 60 }); SP.cur = null; SP.i++; }
    return false;
  });

  // ---------------------------------------------------------------- a dark corner, the extraction points
  steps.push(async () => {
    Z().clearHorde();
    holdBreak();
    // the darkest walkable spot near the cemetery's west end, looking out from the church's back door
    put(me(), [-120, 1600, 20]);
    ticks(5);
    const n = g.nav.nearest([-700, 1700, 20], 200);
    if (n) { const z = walker(n); if (z) { z.zSpeed = 0; ticks(2); } }
    shot('a dark corner: the cemetery from the church steps, a zombie about 600 units off', [-120, 1600, 84], [n ? n.x : -700, n ? n.y : 1700, (n ? n.z : 20) + 30]);
    // (from the street corner for the tanker, from the church steps for the field)
    const views = { tanker: [960, -160, 150], field: [300, 1140, 170] };
    for (const e of D.extraction) shot(`extraction ${e.id}: ${e.name}`, views[e.id] || [e.pos[0] - 420, e.pos[1] - 360, e.pos[2] + 180], e.pos);
    return true;
  });

  // ---------------------------------------------------------------- a 3-bot squad through waves 1-5
  let WV = null;
  steps.push(async () => {
    if (!WV) {
      newRun(3);
      con('zm_god_squad'); con('zm_god_squad'); // (off again: the bots fight for real)
      for (const b of g.bots.bots) b.p && (b.p.god = false);
      put(me(), D.squadStart.pos);
      WV = { t0: g.time, next: 0, track: new Map(), stuckSpots: [], stuck0: g.bots.stats.stuck, downs: 0, deaths: 0, shotDone: false, maxWave: 0 };
      const od = g.damagePlayer.bind(g);
      g.damagePlayer = (v, a, dmg, ...r) => { const was = v.alive; const res = od(v, a, dmg, ...r); if (was && !v.alive && v.team === 'CT' && v.isBot) WV.deaths++; return res; };
      return false;
    }
    const p = me();
    for (let i = 0; i < 300; i++) {
      g.tick();
      // you: a turret at the squad start (the bots move round you)
      if (g.time >= WV.next && p.alive) {
        WV.next = g.time + 0.15;
        const eye = p.eyePos();
        let best = null, bd = 1e9;
        for (const z of g.zombies.pool) {
          if (!z.alive) continue;
          const c = [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + 10];
          const d = Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]);
          if (d < bd && d < 1400 && g.visible(eye, c)) { bd = d; best = { z, c, d }; }
        }
        if (best) {
          const { z, c, d } = best, dir = [(c[0] - eye[0]) / d, (c[1] - eye[1]) / d, (c[2] - eye[2]) / d];
          g.damagePlayer(z, p, 36, 2, 'ak47', dir, [c[0] - dir[0] * 10, c[1] - dir[1] * 10, c[2] - dir[2] * 10]);
        }
      }
      if (Z().state === 'break' && Z().nextWaveAt > g.time + 6) Z().nextWaveAt = g.time + 6; // (short breaks)
    }
    WV.maxWave = Math.max(WV.maxWave, Z().wave);
    // track the bots: a bot that hasn't moved 48 units in 40 s while a wave is on, away from you, is stuck
    for (const b of g.bots.bots) {
      const q = b.p;
      if (!q || !q.alive) { WV.track.delete(b); continue; }
      const o = q.pm.origin, t = WV.track.get(b);
      if (!t || flat(t.pos, o) > 48) WV.track.set(b, { pos: o.slice(), since: g.time });
      else if (Z().state === 'wave' && g.time - t.since > 40 && flat(o, p.pm.origin) > 500 && !WV.stuckSpots.some((s) => flat(s, o) < 64)) WV.stuckSpots.push(o.map((v) => v | 0));
    }
    if (!WV.shotDone && Z().wave === 3 && Z().state === 'wave') {
      const alive = Z().pool.filter((z) => z.alive).sort((a, b) => flat(a.pm.origin, p.pm.origin) - flat(b.pm.origin, p.pm.origin));
      if (alive.length >= 3 && flat(alive[0].pm.origin, p.pm.origin) < 700) {
        WV.shotDone = true;
        shot('the fight: wave 3 coming at the square', eyeOf(p), [alive[0].pm.origin[0], alive[0].pm.origin[1], alive[0].pm.origin[2] + 20]);
        return false;
      }
    }
    const done = Z().state === 'over' || Z().wave >= 6 || g.time - WV.t0 > 1500;
    if (!done) return false;
    const survived = Z().state !== 'over' && Z().wave >= 6;
    check('a 3-bot squad gets through waves 1-5 on Normal', survived, `reached wave ${Z().wave} (${Z().state}) in ${(g.time - WV.t0) | 0} s game time, ${Z().kills} kills, bot deaths ${WV.deaths}`);
    const st = g.bots.stats.stuck - WV.stuck0;
    check('no stuck bots (no bot pinned in one spot away from the squad for 40 s)', !WV.stuckSpots.length, `pinned at ${WV.stuckSpots.map((s) => s.join(',')).join(' ') || 'none'}; unstuck manoeuvres ${st}`);
    return true;
  });

  // ---------------------------------------------------------------- frame cost with 28 up
  steps.push(async () => {
    newRun(0);
    put(me(), D.squadStart.pos);
    con('zm_wave 8');
    const Zm = Z();
    Zm.stats = { ...Zm.stats, count: 500, maxAlive: 28, interval: 0.02, special: 0 };
    const Dr = Zm.director, dmax = Dr.maxAlive;
    Dr.maxAlive = (S) => S.maxAlive;
    let up = 0;
    for (let i = 0; i < 2000 && up < 28; i++) {
      g.tick();
      if (i % 25 === 0) { up = 0; for (const z of Zm.pool) if (z.alive) { up++; z.health = Math.max(z.health, 1e5); } }
    }
    Dr.maxAlive = dmax;
    const r = g.renderer, gl = r.renderer.getContext(), px = new Uint8Array(4), ri = r.renderer.info;
    let sim = 0, ren = 0, calls = 0;
    const N = 40;
    ri.autoReset = false;
    for (let i = 0; i < N; i++) {
      const a = performance.now();
      g.frame(1 / 60);
      const b = performance.now();
      ri.reset();
      r.render(g.drawVm);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ren += performance.now() - b; sim += b - a;
      calls += ri.render.calls;
      for (const z of Zm.pool) if (z.alive) z.health = Math.max(z.health, 1e5);
    }
    ri.autoReset = true;
    info(`${up} zombies up: ${(sim / N).toFixed(1)} ms simulation + models, ${(ren / N).toFixed(1)} ms render (software GL), ${(calls / N) | 0} draw calls a frame`);
    check('28 zombies up for the frame measurement', up >= 24, `${up}`);
    return true;
  });

  // ---------------------------------------------------------------- the driver (screenshots between steps)
  let i = 0;
  const keepVis = [];
  window.__drive = async () => {
    if (frozen) { g.frame = frozen; frozen = null; for (const [e, v] of keepVis.splice(0)) e.style.visibility = v; for (const q of g.players) if (q.model) q.model.object3D.visible = true; }
    if (shots.length) {
      const s = shots.shift();
      frozen = g.frame;
      g.frame = () => {};
      const dx = s.look[0] - s.eye[0], dy = s.look[1] - s.eye[1], dl = Math.hypot(dx, dy) || 1;
      if (me().model) me().model.object3D.visible = false;
      g.renderer.setView(s.eye, Math.atan2(s.eye[2] - s.look[2], dl) * 180 / Math.PI, Math.atan2(dy, dx) * 180 / Math.PI);
      g.renderer.render(false);
      const keep = new Set();
      for (let e = g.renderer.canvas; e; e = e.parentElement) keep.add(e);
      for (const e of document.body.querySelectorAll('*')) if (!keep.has(e) && !e.contains(g.renderer.canvas)) { keepVis.push([e, e.style.visibility]); e.style.visibility = 'hidden'; }
      return { shot: true, wait: 300, log: `[sim] SHOT ${s.label}` };
    }
    if (i >= steps.length) return { done: true, log: [...out.splice(0), `[sim] ${fail ? 'FAIL' : 'PASS'} zm5-hollowcreek: ${pass} passed, ${fail} failed`].join('\n') };
    let r;
    try { r = await steps[i](); } catch (e) { check(`step ${i} threw`, false, e.message + ' ' + (e.stack || '').split('\n')[1]); r = true; }
    if (r) i++;
    return { log: out.splice(0).join('\n') };
  };
})();
