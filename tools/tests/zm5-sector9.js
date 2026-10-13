// Sector 9 (zm_sector9) map test: it builds and compiles, loading its shipped lightmap; no leaks
// (from every reachable spot nothing leads out of the level: no open void above, a player can't
// walk or jump out of the world); the nav graph covers the walkable floor of every level (L0 pit
// and tunnels, L1, the L2 galleries and suite, the yard) and is one piece from the squad's spawns;
// no perches the horde can't reach (crouch-jumps up to 128 u out, drops onto unreached ledges);
// every walkable spot is lit enough to see a zombie; zombies reach the squad from every front and
// reach a god player on 14 tricky spots (the tank ring, galleries, bridges, the suite, the
// collapse, the shaft, the cells...); a 3-bot squad survives waves 1-5 on Normal without getting
// stuck; budgets against de_dust2 x 1.3; load time and frame cost with 28 zombies up.
// Screenshots: the title shots, every front's arrival, both extraction points, a dark corner, a fight.
// Prints "[sim] PASS ..." / "[sim] FAIL ..." / "[sim] INFO ...".
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=0&map=zm_sector9" tools/tests/zm5-sector9.js /tmp/zm5/sector9/t
//   (&skip=waves,shots skips parts; &only=waves runs just one: static, fronts, spots, shots, perf, waves)
/* global performance, location, URLSearchParams, innerWidth, innerHeight */
(() => {
  const g = window.__game;
  const Q = new URLSearchParams(location.search);
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const info = (s) => out.push(`[sim] INFO ${s}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const me = () => g.local;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const DEG = Math.PI / 180;
  let M = null, D = null, nav = null, world = null, P = null;
  const steps = [];
  const skip = (Q.get('skip') || '').split(','), only = Q.get('only');
  const want = (k) => (!only || only === k) && !skip.includes(k);

  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 0, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 0);
    ticks(50);
    me().god = true;
    con('sv_cheats 1');
  }
  const holdBreak = () => { Z().nextWaveAt = 1e9; Z().clearHorde(); };
  const put = (p, pos) => { p.pm.origin = [pos[0], pos[1], pos[2] + 37]; p.prevOrigin = p.pm.origin.slice(); p.pm.velocity = [0, 0, 0]; };
  const spawnAt = (n) => {
    const up = new Set(Z().pool.filter((q) => q.alive));
    Z().spawnZombie({ at: [n.x, n.y, n.z + 37], variant: 'walker' });
    const z = Z().pool.find((q) => q.alive && !up.has(q));
    if (z) { z.health = z.maxHealth = 1e6; z.zDamage = 0; }
    return z;
  };
  const killAll = () => { for (const z of Z().pool) if (z.alive) { z.health = 1; g.damagePlayer(z, me(), 1000, 1, 'ak47', [0, 0, 1], z.pm.origin.slice()); } ticks(5); };
  const aim = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; };
  /** Look from eye at look (a fixed camera, the HUD hidden while it lasts) and render one frame. */
  let hud = null, frame0 = null;
  const camera = (eye, look) => {
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dl = Math.hypot(dx, dy) || 1;
    g.renderer.setView(eye, Math.atan2(eye[2] - look[2], dl) * 180 / Math.PI, Math.atan2(dy, dx) * 180 / Math.PI);
    g.renderer.render(false);
  };
  const hideHud = (on) => {
    if (on && !hud) {
      // (freeze the game's own frames while the fixed camera is up, and hide everything but the canvas)
      hud = [];
      frame0 = g.frame; g.frame = () => {};
      const keep = new Set();
      for (let e = g.renderer.canvas; e; e = e.parentElement) keep.add(e);
      for (const e of document.body.querySelectorAll('*')) if (!keep.has(e) && !e.contains(g.renderer.canvas)) { hud.push([e, e.style.visibility]); e.style.visibility = 'hidden'; }
    }
    if (!on && hud) { for (const [e, v] of hud) e.style.visibility = v; hud = null; g.frame = frame0; }
  };
  const reach = (ids, rev) => {
    const N = nav.nodes.length, seen = new Uint8Array(N), q = [...ids];
    let R = null;
    if (rev) { R = nav.nodes.map(() => []); for (const n of nav.nodes) for (const e of n.edges) R[e.to].push(n.id); }
    for (const i of ids) seen[i] = 1;
    while (q.length) { const i = q.pop(); for (const j of rev ? R[i] : nav.nodes[i].edges.map((e) => e.to)) if (!seen[j]) { seen[j] = 1; q.push(j); } }
    return seen;
  };

  // ---------------------------------------------------------------- build, budgets, leaks, nav coverage, light
  steps.push(async () => {
    M = {
      prep: await import('/src/map/prepare.js'),
      maps: await import('/src/map/maps/index.js'),
      coll: await import('/src/engine/collision.js'),
      pm: await import('/src/engine/pmove.js'),
      area: await import('/src/map/areagen.js'),
    };
    D = g.W.mapDef; nav = g.nav; world = g.W.collision || g.collision;
    check('Sector 9 is the loaded map', D.id === 'zm_sector9', D.id);
    if (!want('static')) return false;
    const t0 = performance.now();
    P = M.prep.prepareMap(M.maps.BUILTIN.zm_sector9);
    const ms = performance.now() - t0;
    let tris = 0;
    const tex = new Set();
    for (const f of P.compiled.faces) { tris += f.poly.length - 2; tex.add(f.texName); }
    check('builds and compiles (deterministic: same hash as the loaded world)', P.compiled.faces.length > 1000 && P.hash === g.W.hash, `${P.map.brushes.length} brushes, ${P.compiled.faces.length} faces, ${tris} tris, ${ms | 0} ms, hash ${P.hash}`);
    check('loaded with its shipped lightmap (no bake at load)', g.W.lmSource === 'prebaked', `${g.W.lmSource}, build + lightmap load ${g.W.loadMs | 0} ms`);
    info(`load: build + lightmap ${g.W.loadMs | 0} ms; page ready ${(performance.now() / 1000).toFixed(1)} s after navigation`);
    // budgets: de_dust2 x 1.3
    const ref = { brushes: 9571, faces: 14858, tris: 29717, draws: 16, atlas: 2048 * 1024, nav: 8146 };
    const mine = { brushes: P.map.brushes.length, faces: P.compiled.faces.length, tris, draws: tex.size, atlas: P.alloc.width * P.alloc.height, nav: nav.nodes.length };
    const over = Object.keys(ref).filter((k) => mine[k] > ref[k] * 1.3);
    check('within de_dust2\'s budget x 1.3', !over.length, Object.keys(ref).map((k) => `${k} ${mine[k]}/${Math.round(ref[k] * 1.3)} (${(mine[k] / ref[k]).toFixed(2)}x)`).join(', ') + `, lightmap ${P.alloc.width}x${P.alloc.height}, ${P.lighting.lights.length} lights`);
    // leaks 1: every column of the world has something under it (nothing falls out of the bottom)
    const [bx0, by0, bx1, by1] = P.map.bounds, tr = new M.coll.TraceResult();
    let cols = 0, holes = 0;
    for (let x = bx0 + 32; x < bx1; x += 64) for (let y = by0 + 32; y < by1; y += 64) {
      cols++;
      world.trace([x, y, 1590], [x, y, -700], [0, 0, 0], [0, 0, 0], M.coll.MASK_SHOT, tr);
      if (tr.fraction >= 1 && !tr.startsolid) holes++;
    }
    check('no leaks: every column of the world has a floor (no void underneath)', holes === 0, `${holes} holes in ${cols} columns`);
    // leaks 2: straight up from every reachable spot there is a ceiling - except in the yard, which is under the sky
    const yard = D.zones.find((z) => z[0] === 'Surface Yard');
    let open = 0;
    const opens = [];
    for (const n of nav.nodes) {
      world.trace([n.x, n.y, n.z + 40], [n.x, n.y, 4000], [0, 0, 0], [0, 0, 0], M.coll.MASK_SHOT, tr);
      if (tr.fraction < 1) continue;
      const inYard = n.x >= yard[2] && n.x <= yard[4] && n.y >= yard[3] && n.y <= yard[5];
      if (!inYard) { open++; if (opens.length < 4) opens.push(`${n.x | 0},${n.y | 0},${n.z | 0}`); }
    }
    check('no leaks: every spot underground has a roof (only the yard sees the sky)', open === 0, `${open} open spots ${opens.join(' ')}`);
    // leaks 3: from every reachable spot, a player walking or jumping out in 8 directions stays inside
    const H = M.pm.HULL_STAND;
    let rays = 0, escapes = 0;
    const esc = [];
    for (let i = 0; i < nav.nodes.length; i += 3) {
      const n = nav.nodes[i];
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        for (const dz of [1, 62]) {
          const s = [n.x, n.y, n.z + 37 + dz], e = [n.x + Math.cos(a) * 9000, n.y + Math.sin(a) * 9000, s[2]];
          world.trace(s, e, H.mins, H.maxs, M.coll.MASK_WORLD_PLAYER, tr);
          rays++;
          if (tr.startsolid) continue;
          const p = tr.endpos;
          if (tr.fraction >= 1 || p[0] < bx0 + 8 || p[0] > bx1 - 8 || p[1] < by0 + 8 || p[1] > by1 - 8) { escapes++; if (esc.length < 4) esc.push(`${n.x | 0},${n.y | 0},${n.z | 0}`); }
        }
      }
    }
    check('no leaks: nobody can walk or jump out of the world from any reachable spot', escapes === 0, `${escapes} of ${rays} hull rays left the bounds ${esc.join(' ')}`);
    // nav coverage: sample every area's floor (each level on its own) and the decks/treads/galleries
    let floor = 0, covered = 0;
    const miss = [];
    const sampleAt = (x, y, fz) => {
      world.trace([x, y, fz + 40], [x, y, fz - 24], [0, 0, 0], [0, 0, 0], M.coll.MASK_WORLD_PLAYER, tr);
      if (tr.fraction >= 1 || tr.startsolid || tr.normal[2] < 0.7) return;
      const z = tr.endpos[2];
      if (world.testBox([x, y, z + 37 + 12], H.mins, H.maxs, M.coll.MASK_WORLD_PLAYER)) return; // (no room to stand: under a prop, in a wall's foot)
      floor++;
      if (nav.nearest([x, y, z], 40) || nav.nearestXY([x, y, z], 40, 24)) covered++;
      else if (miss.length < 6) miss.push(`${x | 0},${y | 0},${z | 0}`);
    };
    for (const a of P.map.areas) {
      if (a.noFloor) continue;
      for (let x = a.x0 + 24; x < a.x1; x += 48) for (let y = a.y0 + 24; y < a.y1; y += 48) sampleAt(x, y, M.area.AreaMap.floorAt(a, x, y));
    }
    for (const b of P.map.brushes) {
      if (b.name !== 'deck' && b.name !== 'suite_floor') continue;
      for (let x = b.mins[0] + 24; x < b.maxs[0]; x += 48) for (let y = b.mins[1] + 24; y < b.maxs[1]; y += 48) sampleAt(x, y, b.maxs[2]);
    }
    check('nav covers the walkable floor of every level (sampled every 48 u, a node within 40 u)', covered >= floor * 0.97, `${(covered / floor * 100).toFixed(1)}% of ${floor} floor samples ${miss.join(' ')}`);
    // one connected graph from the squad's spawns: everywhere reachable, and back
    const ct = g.W.map.entities.filter((e) => e.classname === 'info_player_start');
    const ids = ct.map((e) => nav.nearest([e.origin[0], e.origin[1], e.origin[2] - 36], 64)).filter(Boolean).map((n) => n.id);
    const fw = reach(ids, false).reduce((s, v) => s + v, 0), bk = reach(ids, true).reduce((s, v) => s + v, 0);
    check('the nav graph is one piece from the squad\'s spawns (all of it reachable, and back)', ids.length === ct.length && fw === nav.nodes.length && bk === nav.nodes.length, `${ct.length} squad spawns, forward ${fw}/${nav.nodes.length}, back ${bk}/${nav.nodes.length}`);
    // readability: the light on the floor at every walkable spot (red light counts by its strongest channel)
    const L = [], lo = [];
    const o3 = [0, 0, 0];
    for (const n of nav.nodes) {
      g.W.sampler.sample([n.x, n.y, n.z + 8], o3);
      const l = Math.max(0.3 * o3[0] + 0.55 * o3[1] + 0.15 * o3[2], 0.5 * Math.max(o3[0], o3[1], o3[2]));
      L.push(l);
      if (l < 0.05 && lo.length < 5) lo.push(`${n.x | 0},${n.y | 0},${n.z | 0}=${l.toFixed(3)}`);
    }
    L.sort((a, b) => a - b);
    const dark = L.filter((v) => v < 0.05).length;
    check('readable: every walkable spot is lit (light >= 0.05 on 98%+ of them)', dark <= L.length * 0.02, `p01 ${L[Math.floor(L.length * 0.01)].toFixed(3)}, p10 ${L[Math.floor(L.length * 0.1)].toFixed(3)}, median ${L[Math.floor(L.length / 2)].toFixed(3)}; ${dark} of ${L.length} below 0.05 ${lo.join(' ')}`);
    return false;
  });

  // ---------------------------------------------------------------- perches the horde can't follow
  steps.push(async () => {
    if (!want('static')) return false;
    const H = M.pm.HULL_STAND, tr = new M.coll.TraceResult(), MW = M.coll.MASK_WORLD_PLAYER;
    // a crouch-jump (42-62 up) onto a spot 32-128 u out with nothing in the way and no nav node there
    const up = [];
    for (let i = 0; i < nav.nodes.length; i++) {
      const n = nav.nodes[i];
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8;
        for (const r of [32, 64, 96, 128]) {
          const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r, top = n.z + 64 + 36;
          if (world.testBox([x, y, top], H.mins, H.maxs, MW)) continue;
          world.trace([n.x, n.y, top], [x, y, top], H.mins, H.maxs, MW, tr); // the arc's way over
          if (tr.fraction < 1 || tr.startsolid) continue;
          world.trace([x, y, top], [x, y, n.z + 20 + 36], H.mins, H.maxs, MW, tr);
          if (tr.fraction >= 1 || tr.startsolid || tr.normal[2] < 0.7) continue;
          const fz = tr.endpos[2] - 36, rise = fz - n.z;
          if (rise <= 42 || rise > 62) continue;
          if (nav.nearest([x, y, fz], 48)) continue; // (48: a stair's edge is fine)
          if (!up.some((f) => Math.hypot(f[0] - x, f[1] - y) < 96 && Math.abs(f[2] - fz) < 24)) up.push([x | 0, y | 0, fz | 0]);
        }
      }
    }
    check('no crouch-jump perches up to 128 u out the horde can\'t follow', !up.length, up.slice(0, 6).map((p) => p.join(',')).join(' '));
    // a drop (or a running jump down) onto a ledge 48-160 u out: it must have a nav node within 96 u
    const down = [];
    for (let i = 0; i < nav.nodes.length; i++) {
      const n = nav.nodes[i];
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        for (const r of [48, 96, 160]) {
          const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r, z0 = n.z + 36 + 20;
          world.trace([n.x, n.y, z0], [x, y, z0], H.mins, H.maxs, MW, tr);
          if (tr.fraction < 1 || tr.startsolid) continue;
          world.trace([x, y, z0], [x, y, n.z + 36 - 260], H.mins, H.maxs, MW, tr);
          if (tr.fraction >= 1 || tr.startsolid || tr.normal[2] < 0.7) continue;
          const fz = tr.endpos[2] - 36;
          if (nav.nearest([x, y, fz], 96) || nav.nearestXY([x, y, fz], 96, 48)) continue;
          if (!down.some((f) => Math.hypot(f[0] - x, f[1] - y) < 96 && Math.abs(f[2] - fz) < 24)) down.push([x | 0, y | 0, fz | 0]);
        }
      }
    }
    check('no ledges you can drop onto that the horde can\'t get near (96 u)', !down.length, down.slice(0, 6).map((p) => p.join(',')).join(' '));
    // holdouts have more than one way in: the suite, the server room, the cafeteria, the lower labs, the tank ring
    const ways = (zoneName) => {
      const zn = D.zones.find((z) => z[0] === zoneName);
      const inZ = (n) => n.x >= zn[2] && n.x <= zn[4] && n.y >= zn[3] && n.y <= zn[5] && n.z >= zn[6] && n.z <= zn[7];
      const exits = [];
      for (const n of nav.nodes) {
        if (!inZ(n)) continue;
        for (const e of n.edges) { const m = nav.nodes[e.to]; if (!inZ(m) && !exits.some((q) => Math.hypot(q.x - m.x, q.y - m.y) < 160 && Math.abs(q.z - m.z) < 64)) exits.push(m); }
      }
      return exits.length;
    };
    const holds = ['Security', 'Server Room', 'Cafeteria', 'Lower Labs', 'Tank Ring', 'Lab A', 'Lab B'].map((k) => [k, ways(k)]);
    check('holdouts have two or more ways in (none a one-door room to camp)', holds.every(([, n]) => n >= 2), holds.map(([k, n]) => `${k} ${n}`).join(', '));
    return false;
  });

  // ---------------------------------------------------------------- every front reaches the squad
  steps.push(async () => {
    if (!want('fronts')) return false;
    newRun({ allies: 0 });
    holdBreak();
    nav = g.nav;
    const p = me();
    put(p, D.squadStart.pos);
    Z().buildFlow();
    const dist = Z().dist;
    const fr = Z().director.fronts();
    check('six fronts, each with spawn nodes', fr.length === 6 && fr.every((f) => f.nodes.length >= 10), fr.map((f) => `${f.name}:${f.nodes.length}`).join(' '));
    const runs = [];
    for (const f of fr) {
      // two spawn spots per front: its farthest usable node (path) and one a third of the way in
      const cand = f.nodes.filter((n) => dist[n.id] > 700 && dist[n.id] < 3400).sort((a, b) => dist[b.id] - dist[a.id]);
      const picks = [cand[0], cand[Math.floor(cand.length / 3)]].filter(Boolean);
      for (const n of picks) { const z = spawnAt(n); if (z) runs.push({ f, z, from: [n.x, n.y, n.z], path: dist[n.id], t: null }); }
    }
    const t0 = g.time;
    for (let i = 0; i < 9000 && runs.some((r) => r.t == null); i++) {
      g.tick();
      p.pm.velocity[0] = p.pm.velocity[1] = 0;
      for (const r of runs) if (r.t == null && r.z.alive && d3(r.z.pm.origin, p.pm.origin) < 110) r.t = g.time - t0;
    }
    for (const f of fr) {
      const rs = runs.filter((r) => r.f === f);
      const worst = Math.max(...rs.map((r) => (r.t == null ? Infinity : r.t)));
      const lim = Math.max(...rs.map((r) => r.path / 100 + 15)); // the path at a slow walk (100 u/s) + 15 s
      check(`front ${f.name}: zombies from it reach the squad`, rs.length >= 2 && worst <= lim, rs.map((r) => `${r.path | 0} u -> ${r.t == null ? 'never' : r.t.toFixed(1) + ' s'}`).join(', ') + ` (limit ${lim | 0} s)`);
    }
    killAll();
    return false;
  });

  // each front arriving (screenshots): stand by its mouth, a pack walks in from its far end
  const ARRIVE = {
    containment: [[0, 480, 0]], lowerlabs: [[-544, 1300, 0]], tunnels: [[-480, -200, 0]],
    ramp: [[-420, -1150, 0]], freight: [[200, -1150, 0]], vents: [[480, 200, 0]],
  };
  for (const id of Object.keys(ARRIVE)) {
    steps.push(async () => {
      if (!want('fronts')) return false;
      killAll();
      const p = me();
      put(p, ARRIVE[id][0]);
      ticks(2);
      Z().buildFlow();
      const f = Z().director.front(id);
      if (!f) { check(`front ${id} exists`, false); return false; }
      const n0 = f.nodes.filter((n) => Z().dist[n.id] > 700 && Z().dist[n.id] < 2600).sort((a, b) => Z().dist[a.id] - Z().dist[b.id])[0] || f.nodes[0];
      const zs = [];
      for (let i = 0; i < 5; i++) zs.push(spawnAt(n0));
      let lead = null;
      for (let i = 0; i < 5000; i++) {
        g.tick(); p.pm.velocity[0] = p.pm.velocity[1] = 0;
        lead = zs.filter((z) => z && z.alive).sort((a, b) => d3(a.pm.origin, p.pm.origin) - d3(b.pm.origin, p.pm.origin))[0];
        if (lead && d3(lead.pm.origin, p.pm.origin) < 340 && g.visible(p.eyePos(), [lead.pm.origin[0], lead.pm.origin[1], lead.pm.origin[2] + 20])) break;
      }
      if (lead) aim(p, [lead.pm.origin[0], lead.pm.origin[1], lead.pm.origin[2] + 20]);
      g.frame(1 / 60);
      info(`front arrival: ${f.name}, lead zombie ${lead ? d3(lead.pm.origin, p.pm.origin) | 0 : '-'} u out (${id})`);
      return { shot: true, wait: 200 };
    });
  }

  // ---------------------------------------------------------------- tricky spots: they get to you there too
  steps.push(async () => {
    if (!want('spots')) return false;
    if (!want('fronts')) { newRun({ allies: 0 }); holdBreak(); }
    killAll();
    const p = me();
    const spots = [
      ['the tank ring', [150, 150, 192]], ['the NE gallery corner', [592, 592, 192]], ['the south bridge', [0, -400, 192]],
      ['the suite\'s records room', [120, -900, 192]], ['the loading platform', [200, -1430, 32]], ['the freight collapse (top step)', [1420, -1360, 112]],
      ['the guard booth', [-1856, -1544, 320]], ['the helipad', [-2016, -1776, 324]], ['the elevator shaft bottom', [-2400, 0, -192]],
      ['the pump room corner', [-1690, -1150, -192]], ['a containment cell', [-300, 1500, 0]], ['a broken pod in the vault', [-224, 1980, 36]],
      ['the lower labs', [-1180, 1000, -192]], ['a lab bench top', [-1336, 240, 36]], ['the vent sump', [1650, 0, -192]],
    ];
    for (const [name, pos] of spots) {
      killAll();
      const sn = g.nav.nearest(pos, 64) || g.nav.nearestXY(pos, 64, 40);
      if (!sn) { check(`spot ${name}: on the nav graph`, false, pos.join(',')); continue; }
      put(p, [pos[0], pos[1], sn.z]);
      ticks(2);
      Z().buildFlow();
      const dist = Z().dist;
      // three zombies 600-1400 u away by path, from different directions
      const ring = g.nav.around(sn, 1400, 6000).filter((x) => x.dist > 600 && (x.node.support ?? 5) >= 3 && dist[x.node.id] < Infinity);
      const picks = [ring[0], ring[Math.floor(ring.length / 2)], ring[ring.length - 1]].filter(Boolean).map((x) => x.node);
      const zs = picks.map(spawnAt).filter(Boolean);
      const t0 = g.time;
      let t = null;
      for (let i = 0; i < 7000 && t == null; i++) {
        g.tick();
        p.pm.velocity[0] = p.pm.velocity[1] = 0;
        if (zs.some((z) => z.alive && d3(z.pm.origin, p.pm.origin) < 100)) t = g.time - t0;
      }
      check(`spot ${name}: zombies get to a player standing there`, t != null && t < 60, t == null ? 'never (70 s)' : `${t.toFixed(1)} s, ${zs.length} zombies from ${picks.map((n) => dist[n.id] | 0).join('/')} u`);
    }
    killAll();
    return false;
  });

  // ---------------------------------------------------------------- the title shots, the extraction points, a dark corner (screenshots)
  const views = [];
  if (want('shots')) {
    for (const [i, s] of (window.__game.W?.mapDef?.titleShots || []).entries()) views.push([`title shot ${i}`, s.eye, s.look]);
    views.push(['extraction: the helipad', [-1790, -1300, 420], [-2016, -1776, 324]]);
    views.push(['extraction: the cargo elevator', [-1850, 250, 64], [-2304, 0, 120]]);
    views.push(['a dark corner: the pump room', [-1240, -1150, -120], [-1700, -980, -180]]);
    views.push(['a dark corner: the cell block (red)', [-560, 1820, 60], [-560, 700, 30]]);
    views.push(['the landmark from the lab row', [-1700, 0, 64], [0, 0, 100]]);
  }
  for (const v of views) {
    steps.push(async () => {
      const [name, eye, look] = v;
      hideHud(true);
      g.drawVm = false;
      camera(eye, look);
      info(`view: ${name} (${eye.join(',')} -> ${look.join(',')})`);
      return { shot: true, wait: 300 };
    });
  }
  if (views.length) steps.push(async () => { hideHud(false); g.drawVm = true; return false; });

  // ---------------------------------------------------------------- 28 zombies up: frame cost
  steps.push(async () => {
    if (!want('perf')) return false;
    newRun({ allies: 0 });
    const p = me();
    put(p, [0, -500, 0]);
    con('zm_wave 8');
    const S = Z().stats;
    Z().stats = { ...S, count: 500, maxAlive: 28, interval: 0.02, special: 0 };
    const Dr = Z().director, dmax = Dr.maxAlive;
    Dr.maxAlive = (s) => s.maxAlive;
    let up = 0;
    for (let i = 0; i < 2000 && up < 28; i++) {
      g.tick();
      if (i % 25 === 0) { up = 0; for (const z of Z().pool) if (z.alive) { up++; z.health = Math.max(z.health, 1e5); } }
    }
    for (let i = 0; i < 400; i++) { g.tick(); p.pm.velocity[0] = p.pm.velocity[1] = 0; for (const z of Z().pool) if (z.alive) z.health = Math.max(z.health, 1e5); }
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
      for (const z of Z().pool) if (z.alive) z.health = Math.max(z.health, 1e5);
    }
    ri.autoReset = true;
    info(`28 zombies up: ${up} alive, ${(sim / N).toFixed(1)} ms simulation + models, ${(ren / N).toFixed(1)} ms render, ${(calls / N) | 0} draw calls per frame (software GL, ${innerWidth}x${innerHeight})`);
    check('28 zombies up for the frame measurement', up >= 24, `${up}`);
    // and a fight to look at: aim at the thick of them
    const near = Z().pool.filter((z) => z.alive && g.visible(p.eyePos(), [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + 16])).sort((a, b) => flat(a.pm.origin, p.pm.origin) - flat(b.pm.origin, p.pm.origin))[3];
    if (near) aim(p, [near.pm.origin[0], near.pm.origin[1], near.pm.origin[2] + 16]);
    g.frame(1 / 60);
    return { shot: true, wait: 200 };
  });

  // ---------------------------------------------------------------- a 3-bot squad survives waves 1-5 on Normal
  let run = null;
  steps.push(async () => {
    if (!want('waves')) return false;
    newRun({ allies: 3, zdiff: 'normal' });
    const p = me();
    put(p, D.squadStart.pos);
    p.armor = 100; p.helmet = true;
    run = {
      next: 0, t0: g.time, deaths: 0, downs: 0, stuckBots: 0, zStuck: 0, zSamples: 0, rec0: Z().horde?.counts?.recycled || 0,
      botStuck0: g.bots.stats.stuck, last: new Map(), waveT: {}, done: false, offNav: 0,
    };
    Z().events.on('down', () => { run.downs++; });
    const od = g.damagePlayer.bind(g);
    g.damagePlayer = (v, a, ...r) => { const was = v.alive; const res = od(v, a, ...r); if (was && !v.alive && v.isBot && v.team === 'CT') run.deaths++; return res; };
    return false;
  });
  const turret = () => {
    // the local player as a stand-in: an AK on the closest visible zombie (zsim's turret, ~200 dps)
    const p = me();
    if (!p.alive || g.time < run.next) return;
    run.next = g.time + 0.18;
    const eye = p.eyePos();
    let best = null, bd = 1e9;
    for (const z of [...Z().pool, ...(g.bosses?.alive?.() ? [g.bosses.boss] : [])]) {
      if (!z.alive) continue;
      const c = [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + 10];
      const dd = d3(c, eye);
      if (dd < bd && dd < 1400 && g.visible(eye, c)) { bd = dd; best = { z, c, d: dd }; }
    }
    if (!best) return;
    const dir = [(best.c[0] - eye[0]) / best.d, (best.c[1] - eye[1]) / best.d, (best.c[2] - eye[2]) / best.d];
    g.damagePlayer(best.z, p, 36, 2, 'ak47', dir, [best.c[0] - dir[0] * 10, best.c[1] - dir[1] * 10, best.c[2] - dir[2] * 10]);
  };
  const waveStep = async () => {
    if (!want('waves') || !run || run.done) return false;
    const bots = g.bots.bots.filter((b) => b.p.team === 'CT');
    for (let i = 0; i < 600; i++) {
      g.tick();
      turret();
      if (Z().state === 'break' && Z().nextWaveAt - g.time > 8) Z().nextWaveAt = g.time + 8; // (short breaks)
      if (i % 50 === 0) {
        for (const z of Z().pool) if (z.alive) { run.zSamples++; if (z.stuckSince && g.time - z.stuckSince > 3) run.zStuck++; }
        for (const b of bots) {
          // stuck: the bot's own progress watchdog says it is trying to move and getting nowhere
          // (stuckLevel 2+: side-stepping, re-pathing) for 8 s on end; standing guard is fine
          const o = b.p.pm.origin;
          if (!b.p.alive || b.p.downed) { run.last.delete(b); continue; }
          const Lb = run.last.get(b) || { n: 0 };
          Lb.n = (b.stuckLevel || 0) >= 2 ? Lb.n + 1 : 0;
          if (Lb.n === 16) { run.stuckBots++; info(`bot ${b.p.name} stuck near ${o.map((v) => v | 0).join(',')}`); }
          run.last.set(b, Lb);
          if (!g.nav.nearest([o[0], o[1], o[2] - 36], 96)) run.offNav++;
        }
      }
    }
    if (!run.waveT[Z().wave]) run.waveT[Z().wave] = g.time - run.t0;
    const alive = bots.filter((b) => b.p.alive).length;
    const line = `[sim] INFO waves: t=${(g.time - run.t0).toFixed(0)} s ${Z().state} w${Z().wave} killed ${Z().killed}/${Z().stats.count} bots alive ${alive}/3 deaths ${run.deaths} downs ${run.downs} hp ${bots.map((b) => b.p.health | 0).join('/')}`;
    const end = Z().state === 'over' || Z().wave >= 6 || g.time - run.t0 > 1500;
    if (end) {
      run.done = true;
      const ok = Z().state !== 'over' && Z().wave >= 6;
      check('a 3-bot squad (and a stand-in player) survives waves 1-5 on Normal', ok, `reached wave ${Z().wave} (${Z().state}) in ${(g.time - run.t0) | 0} s game time; bot deaths ${run.deaths}, downs ${run.downs}; wave starts ${Object.entries(run.waveT).map(([w, t]) => `w${w}@${t | 0}s`).join(' ')}`);
      const bs = g.bots.stats.stuck - run.botStuck0;
      check('no stuck bots (none fighting its way nowhere for 8 s; always on the nav graph)', run.stuckBots === 0 && run.offNav <= 3 && bs <= 6, `${run.stuckBots} stuck, bot watchdog unsticks ${bs}, off the graph ${run.offNav} samples`);
      const rec = (Z().horde?.counts?.recycled || 0) - run.rec0;
      check('zombies don\'t get stuck on the way in', run.zStuck / Math.max(1, run.zSamples) < 0.05, `${run.zStuck} stuck (3 s+) of ${run.zSamples} samples, ${rec} recycled`);
    }
    return { log: line };
  };
  for (let i = 0; i < 300; i++) steps.push(waveStep);

  let i = 0;
  window.__drive = async () => {
    while (i < steps.length) {
      let r;
      try { r = await steps[i++](); } catch (e) { check(`step ${i} threw`, false, e.message + ' ' + (e.stack || '').split('\n')[1]); }
      if (r === false && !out.length) continue; // (skipped / nothing to say)
      const o = r && typeof r === 'object' ? r : {};
      return { ...o, log: [...out.splice(0), o.log].filter(Boolean).join('\n') || undefined };
    }
    return { done: true, log: [...out.splice(0), `[sim] ${fail ? 'FAIL' : 'PASS'} zm5-sector9: ${pass} passed, ${fail} failed`].join('\n') };
  };
})();
