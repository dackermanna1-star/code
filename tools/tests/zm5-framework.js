// Milestone 5 map framework (m5-contracts): every registered built-in map builds, compiles,
// has valid metadata, a nav graph that covers its spawns and reaches the squad from (almost)
// everywhere, no crouch-jump ledges the horde can't follow, a shipped lightmap whose hash
// matches, and stays within de_dust2's budget x 1.3; de_dust2's hash is unchanged; the
// single-file asset table works; texture packs, sky presets, fog and the map ambience work;
// the loaded map's fronts, hazards and title shots work; load time and frame cost with 28
// zombies up (software GL, reported).
// usage (dev server running; any map - every registered map is checked, the loaded one in depth):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2&map=de_dust2" tools/tests/zm5-framework.js /tmp/zm5
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2&map=zm_blackwater" tools/tests/zm5-framework.js /tmp/zm5bw
//   ?only=<id> checks just that map (plus de_dust2 as the budget reference): what a map builder runs.
//   From the single-file build (file:///.../dist/cs16.html?...) it also checks every map file is inline.
// Prints "[sim] PASS ..." / "[sim] FAIL ..." / "[sim] INFO ...".
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const info = (s) => out.push(`[sim] INFO ${s}`);
  const Q = new URLSearchParams(location.search);
  const only = Q.get('only');
  const BUDGET = 1.3;
  const src = (p) => (location.protocol === 'file:' ? null : p); // (modules only import from the dev server)
  let M = null; // modules
  const steps = [];
  const stats = {};

  // ---------------------------------------------------------------- modules, registry, metadata
  steps.push(async () => {
    if (!src('x')) {
      // the single-file build: no module imports - check what the page itself loaded
      const A = window.__cs16Assets || {};
      const W = g.W;
      check('single file: the asset table is there', Object.keys(A).length > 0, `${Object.keys(A).length} files`);
      check('single file: the loaded map used its inlined lightmap (no bake)', W.lmSource === 'prebaked' && !!A[`maps/${W.mapDef.id}.lm.png`], `${W.mapDef.id} ${W.lmSource}`);
      const ids = Object.keys(window.__cs16Assets).filter((k) => k.endsWith('.lm.json')).map((k) => k.slice(5, -8));
      check('single file: every built-in map has its lightmap and thumbnail inline', ['de_dust2', 'zm_fort_ember', 'zm_hollow_creek', 'zm_sector9', 'zm_blackwater'].every((id) => A[`maps/${id}.lm.json`] && A[`maps/${id}.lm.png`] && A[`maps/${id}.thumb.jpg`]), ids.join(' '));
      if (W.mapDef.id === 'de_dust2') check('single file: de_dust2 hash', W.hash === '61e36e23', W.hash);
      return 'end';
    }
    M = {
      maps: await import('/src/map/maps/index.js'),
      prep: await import('/src/map/prepare.js'),
      nav: await import('/src/game/nav.js'),
      tex: await import('/src/assets/textures.js'),
      light: await import('/src/map/lighting.js'),
      sky: await import('/src/assets/sky.js'),
      asset: await import('/src/engine/assetpath.js'),
      snd: await import('/src/assets/sounds.js'),
      reg: await import('/src/game/maps.js'),
      meta: await import('/src/game/mapmeta.js'),
      bots: await import('/src/game/bots.js'),
      dir: await import('/src/game/director.js'),
      coll: await import('/src/engine/collision.js'),
      pm: await import('/src/engine/pmove.js'),
    };
    const ids = M.maps.BUILTIN_MAPS.map((d) => d.id);
    check('registry: de_dust2 + the four original maps, in order', ids.join(',') === 'de_dust2,zm_fort_ember,zm_hollow_creek,zm_sector9,zm_blackwater', ids.join(','));
    check('registry: maps.js MAPS holds every built-in (and cs_mansion)', ids.every((id) => M.reg.MAPS[id]?.id === id && M.reg.MAPS[id].builtin && typeof M.reg.MAPS[id].build === 'function') && !!M.reg.MAPS.cs_mansion && !M.reg.MAPS.cs_mansion.builtin);
    check('classic is offered on de_dust2 only (the new maps are zombies-only)', M.reg.mapOffers(M.maps.BUILTIN.de_dust2, 'classic') && ids.slice(1).every((id) => !M.reg.mapOffers(M.maps.BUILTIN[id], 'classic') && M.reg.mapOffers(M.maps.BUILTIN[id], 'zombies')));
    check('menu labels are the titles', M.reg.mapLabel(M.maps.BUILTIN.zm_blackwater) === 'Blackwater Docks' && M.reg.mapLabel(M.maps.BUILTIN.de_dust2) === 'de_dust2');
    const v3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    for (const d of M.maps.BUILTIN_MAPS) {
      if (only && d.id !== only && d.id !== 'de_dust2') continue;
      const bad = [];
      const L = d.lighting;
      if (!v3(L.sunDir) || !v3(L.sunColor) || !v3(L.skyColor) || !v3(L.ambientMin) || !(L.bounce >= 0)) bad.push('lighting');
      if (L.lmEncoding && !['linear', 'sqrt'].includes(L.lmEncoding)) bad.push('lmEncoding');
      if (!['dust', 'none', ...Object.keys(M.sky.SKY_PRESETS)].includes(d.sky?.preset)) bad.push('sky.preset');
      if (d.fog && !(v3(d.fog.color) && ((d.fog.near >= 0 && d.fog.far > d.fog.near) || d.fog.density > 0))) bad.push('fog');
      if (!d.title || (d.id !== 'de_dust2' && (!d.tagline || !d.blurb || !d.mood?.length))) bad.push('title/tagline/blurb/mood');
      if (!(d.squad?.min >= 1 && d.squad.best >= d.squad.min && d.squad.max >= d.squad.best)) bad.push('squad');
      if (!M.snd.SOUND_META[d.ambience?.loop]) bad.push(`ambience ${d.ambience?.loop}`);
      if (d.zones && !d.zones.every((z) => z.length === 8 && typeof z[0] === 'string' && z.slice(2).every(Number.isFinite) && z[2] < z[4] && z[3] < z[5] && z[6] < z[7])) bad.push('zones');
      const zn = new Set((d.zones || []).map((z) => z[0]));
      if (d.fronts && !d.fronts.every((f) => f.id && f.name && f.zones?.length && f.zones.every((n) => zn.has(n)) && (!f.mouth || f.mouth.length === 2))) bad.push('fronts (unknown zone?)');
      if (d.id !== 'de_dust2') {
        if (!d.squadStart || !v3(d.squadStart.pos) || !(d.squadStart.radius > 0)) bad.push('squadStart');
        if (!d.buyArea || !v3(d.buyArea.pos)) bad.push('buyArea');
        if (!d.extraction?.length || !d.extraction.every((e) => e.id && e.name && v3(e.pos) && e.radius > 0)) bad.push('extraction');
        if (!d.objectives?.length || !d.objectives.every((o) => o.id && o.name && ['hold', 'defend', 'supply', 'escort'].includes(o.kind) && v3(o.pos) && (o.kind !== 'escort' || v3(o.to)))) bad.push('objectives');
        if (!d.titleShots?.length || !d.titleShots.every((s) => v3(s.eye) && v3(s.look))) bad.push('titleShots');
        if (!d.zones?.length || !d.fronts?.length) bad.push('zones/fronts');
      }
      if (!(d.hazards || []).every((h) => ['teleport', 'hurt', 'kill'].includes(h.kind || 'teleport') && v3(h.mins) && v3(h.maxs) && h.mins.every((v, i) => v < h.maxs[i]))) bad.push('hazards');
      check(`${d.id}: metadata`, !bad.length, bad.join(', '));
    }
    return false;
  });

  // ---------------------------------------------------------------- texture packs, albedo
  steps.push(async () => {
    const T = M.tex.TEXTURES;
    const packs = {};
    for (const [n, t] of Object.entries(T)) if (t.pack) (packs[t.pack] ||= []).push(n);
    const need = ['brick_red', 'concrete_paint', 'cinder_block', 'asphalt', 'asphalt_lane', 'sidewalk', 'metal_corrugated', 'metal_rust', 'metal_diamond', 'tile_white', 'lab_panel', 'ceiling_tile', 'siding_paint', 'wood_dark', 'grass', 'dirt_dark', 'gravel', 'glass_dark', 'container_ribs', 'light_panel'];
    check('shared pack: the generic modern set', need.every((n) => T[n]?.pack === 'shared'), need.filter((n) => T[n]?.pack !== 'shared').join(' '));
    check('one pack per original map, registered', ['fortember', 'hollowcreek', 'sector9', 'blackwater'].every((p) => packs[p]?.length), Object.entries(packs).map(([p, l]) => `${p}:${l.length}`).join(' '));
    const prefix = { fortember: 'fe_', hollowcreek: 'hc_', sector9: 's9_', blackwater: 'bw_' };
    const unprefixed = Object.entries(prefix).flatMap(([p, pre]) => (packs[p] || []).filter((n) => !n.startsWith(pre)));
    check('map pack textures carry their prefix', !unprefixed.length, unprefixed.join(' '));
    const badSize = [], slow = [];
    for (const list of Object.values(packs)) for (const n of list) {
      const t0 = performance.now();
      const p = M.tex.generatePixels(n);
      const ms = performance.now() - t0;
      if (p.w !== T[n].size[0] || p.h !== T[n].size[1] || ![64, 128, 256, 512].includes(p.w) && p.w !== 32) badSize.push(n);
      if (ms > 400) slow.push(`${n} ${ms | 0}ms`);
      const a = M.light.albedoOf(n);
      if (!(a.length === 3 && a.every((v) => v >= 0 && v <= 1))) badSize.push(n + '(albedo)');
    }
    check('pack textures generate at their declared size, with an albedo', !badSize.length, badSize.join(' '));
    check('pack textures generate quickly (< 400 ms each)', !slow.length, slow.join(' '));
    check('glass is alpha-blended with a dark albedo', T.glass_dark.blend && T.glass_dark.alpha && M.light.albedoOf('glass_dark')[0] < 0.2);
    return false;
  });

  // ---------------------------------------------------------------- each map: build, compile, hash, nav, exploit scan, budget
  const nodeNear = (nav, p, r = 64) => nav.nearest([p[0], p[1], p[2]], r) || nav.nearestXY([p[0], p[1], p[2]], r, 48);
  /** BFS over the nav graph from start ids; reverse: follow edges backwards (who can reach start). */
  const reach = (nav, ids, reverse) => {
    const N = nav.nodes.length, seen = new Uint8Array(N), q = [...ids];
    let rev = null;
    if (reverse) { rev = nav.nodes.map(() => []); for (const n of nav.nodes) for (const e of n.edges) rev[e.to].push(n.id); }
    for (const i of ids) seen[i] = 1;
    while (q.length) {
      const i = q.pop();
      for (const j of reverse ? rev[i] : nav.nodes[i].edges.map((e) => e.to)) if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
    return seen;
  };
  /** Ledges a player can crouch-jump onto (42-62 above a nav node) that the nav graph (the horde) can't reach. */
  const ledges = (world, nav, H) => {
    const tr = new M.coll.TraceResult(), found = [];
    const D = [[32, 0], [-32, 0], [0, 32], [0, -32], [24, 24], [-24, 24], [24, -24], [-24, -24]];
    for (const n of nav.nodes) {
      if (n.hazard) continue;
      for (const [dx, dy] of D) {
        const x = n.x + dx, y = n.y + dy, top = n.z + 64 + 36;
        if (world.testBox([x, y, top], H.mins, H.maxs, M.coll.MASK_WORLD_PLAYER)) continue;
        world.trace([x, y, top], [x, y, n.z + 20 + 36], H.mins, H.maxs, M.coll.MASK_WORLD_PLAYER, tr);
        if (tr.fraction >= 1 || tr.startsolid || tr.normal[2] < 0.7) continue;
        const fz = tr.endpos[2] - 36, rise = fz - n.z;
        if (rise <= 42 || rise > 62) continue;
        // reachable after all (a nav node there, e.g. by stairs)?
        if (nav.nearest([x, y, fz], 40)) continue;
        if (!found.some((f) => Math.hypot(f[0] - x, f[1] - y) < 96 && Math.abs(f[2] - fz) < 24)) found.push([Math.round(x), Math.round(y), Math.round(fz)]);
      }
    }
    return found;
  };
  const mapStep = (d) => async () => {
    const t0 = performance.now();
    let P;
    try { P = M.prep.prepareMap(d); } catch (e) { check(`${d.id}: builds and compiles`, false, e.message); return false; }
    const buildMs = performance.now() - t0;
    let tris = 0;
    const texNames = new Set();
    for (const f of P.compiled.faces) { tris += f.poly.length - 2; texNames.add(f.texName); }
    check(`${d.id}: builds and compiles`, P.compiled.faces.length > 50 && P.map.bounds.length === 4, `${P.map.brushes.length} brushes, ${P.compiled.faces.length} faces, ${tris} tris, ${buildMs | 0} ms`);
    const T = M.tex.TEXTURES, own = d.textures;
    const unknown = [...texNames].filter((n) => !T[n]);
    const foreign = [...texNames].filter((n) => T[n]?.pack && T[n].pack !== 'shared' && T[n].pack !== own);
    check(`${d.id}: every texture exists (dust, shared or its own pack)`, !unknown.length && !foreign.length, [...unknown.map((n) => 'unknown ' + n), ...foreign.map((n) => 'other pack ' + n)].join(' '));
    // the shipped lightmap
    let meta = null;
    try { const r = await fetch(M.asset.assetUrl(`maps/${d.id}.lm.json`)); if (r.ok && /json/.test(r.headers.get('content-type') || 'json')) meta = await r.json(); } catch { /* none */ }
    check(`${d.id}: shipped lightmap matches its build (hash ${P.hash})`, !!meta && meta.hash === P.hash && meta.width === P.alloc.width && meta.height === P.alloc.height, meta ? `json ${meta.hash} ${meta.width}x${meta.height}` : 'no public/maps json (node tools/bake.mjs ' + d.id + ')');
    if (d.id === 'de_dust2') check('de_dust2: hash unchanged (61e36e23)', P.hash === '61e36e23', P.hash);
    let thumb = false;
    try { const r = await fetch(M.asset.assetUrl(`maps/${d.id}.thumb.jpg`)); thumb = r.ok && /jpe?g|octet/.test(r.headers.get('content-type') || 'jpeg'); } catch { /* none */ }
    check(`${d.id}: thumbnail shipped`, thumb, thumb ? '' : `node tools/thumb.mjs ${d.id} <port>`);
    // nav from the spawns (as Game does), hazards cut out (as hazards.js does)
    const ents = P.map.entities, ct = ents.filter((e) => e.classname === 'info_player_start'), ts = ents.filter((e) => e.classname === 'info_player_deathmatch');
    const t1 = performance.now();
    const nav = new M.nav.NavGraph(P.compiled.world, P.map.bounds).build([...ts, ...ct].map((e) => [e.origin[0], e.origin[1], e.origin[2] - 36]));
    const navMs = performance.now() - t1;
    for (const h of d.hazards || []) {
      if (h.kind === 'hurt') continue;
      const inH = (n) => n.x >= h.mins[0] && n.x <= h.maxs[0] && n.y >= h.mins[1] && n.y <= h.maxs[1] && n.z >= h.mins[2] && n.z <= h.maxs[2];
      for (const n of nav.nodes) if (inH(n)) { n.edges = []; n.hazard = true; }
      for (const n of nav.nodes) n.edges = n.edges.filter((e) => !nav.nodes[e.to].hazard);
    }
    const spawnNodes = [...ct, ...ts].map((e) => nodeNear(nav, [e.origin[0], e.origin[1], e.origin[2] - 36]));
    check(`${d.id}: nav covers every spawn`, ct.length >= 1 && ts.length >= 1 && spawnNodes.every(Boolean), `${ct.length} CT, ${ts.length} T, ${spawnNodes.filter((n) => !n).length} off the graph, ${nav.nodes.length} nodes in ${navMs | 0} ms`);
    check(`${d.id}: room for a full squad (8+ squad spawns)`, d.id === 'de_dust2' || ct.length >= 8, `${ct.length}`);
    const ctIds = spawnNodes.slice(0, ct.length).filter(Boolean).map((n) => n.id);
    const live = nav.nodes.filter((n) => !n.hazard);
    const fwd = reach(nav, ctIds, false), back = reach(nav, ctIds, true);
    const fwdN = live.filter((n) => fwd[n.id]).length, backN = live.filter((n) => back[n.id]).length;
    // the squad can go there, the horde can come back from there (no dead ends, no isolated pockets)
    check(`${d.id}: the squad start reaches the map and the map reaches the squad start`, fwdN >= live.length * 0.95 && backN >= live.length * 0.95, `forward ${fwdN}/${live.length}, back ${backN}/${live.length}`);
    const oneWay = live.filter((n) => fwd[n.id] && !back[n.id]);
    check(`${d.id}: no one-way pockets (reachable but no way back for the horde)`, oneWay.length <= Math.max(3, live.length * 0.005), oneWay.slice(0, 4).map((n) => `${n.x | 0},${n.y | 0},${n.z | 0}`).join(' '));
    const ledge = ledges(P.compiled.world, nav, M.pm.HULL_STAND);
    if (d.id === 'de_dust2') info(`de_dust2: ${ledge.length} crouch-jump ledges the nav graph can't reach (reference only)`);
    else check(`${d.id}: no crouch-jump ledges the horde can't follow`, !ledge.length, ledge.slice(0, 6).map((p) => p.join(',')).join(' '));
    // metadata points sit on the graph, and the horde can get there
    if (d.id !== 'de_dust2') {
      const pts = [['squadStart', d.squadStart.pos], ...d.extraction.map((e) => [e.id, e.pos]), ...d.objectives.map((o) => [o.id, o.pos]), ...d.objectives.filter((o) => o.to).map((o) => [o.id + '.to', o.to])];
      const off = pts.filter(([, p]) => { const n = nav.nearestXY(p, 200, 96); return !n || !back[n.id] || n.hazard; }).map(([k]) => k);
      check(`${d.id}: squad start, extraction and objective points are on the graph and reachable`, !off.length, off.join(' '));
      const shotsBad = d.titleShots.filter((s) => P.compiled.world.testBox(s.eye, [-8, -8, -8], [8, 8, 8], M.coll.MASK_SHOT) || P.compiled.world.occluded(s.eye, [s.look[0], s.look[1], s.look[2] + 16], M.coll.MASK_SHOT));
      check(`${d.id}: title shots: camera in the open, looking at its target`, !shotsBad.length, `${shotsBad.length} of ${d.titleShots.length} bad`);
      const zoneOfSq = (d.zones || []).find((z) => { const p = d.squadStart.pos; return p[0] >= z[2] && p[0] <= z[4] && p[1] >= z[3] && p[1] <= z[5] && p[2] >= z[6] && p[2] <= z[7]; });
      check(`${d.id}: the squad start has a callout`, !!zoneOfSq, zoneOfSq?.[0] || 'none');
    }
    stats[d.id] = { brushes: P.map.brushes.length, faces: P.compiled.faces.length, tris, draws: texNames.size, atlas: P.alloc.width * P.alloc.height, nav: nav.nodes.length, lights: P.lighting.lights.length, atlasStr: `${P.alloc.width}x${P.alloc.height}` };
    return false;
  };
  for (const id of ['de_dust2', 'zm_fort_ember', 'zm_hollow_creek', 'zm_sector9', 'zm_blackwater']) steps.push(async () => (only && id !== only && id !== 'de_dust2' ? false : mapStep(M.maps.BUILTIN[id])()));

  steps.push(async () => {
    const ref = stats.de_dust2;
    info(`de_dust2 budget reference: ${ref.brushes} brushes, ${ref.faces} faces, ${ref.tris} tris, ${ref.draws} world draw calls, lightmap ${ref.atlasStr}, ${ref.nav} nav nodes, ${ref.lights} lights`);
    for (const [id, s] of Object.entries(stats)) {
      if (id === 'de_dust2') continue;
      const over = ['brushes', 'faces', 'tris', 'draws', 'atlas', 'nav'].filter((k) => s[k] > ref[k] * BUDGET).map((k) => `${k} ${s[k]} > ${Math.round(ref[k] * BUDGET)}`);
      check(`${id}: within de_dust2's budget x ${BUDGET}`, !over.length, over.length ? over.join(', ') : `${s.brushes} brushes, ${s.faces} faces, ${s.tris} tris, ${s.draws} draws, lightmap ${s.atlasStr}, ${s.nav} nav, ${s.lights} lights`);
    }
    return false;
  });

  // ---------------------------------------------------------------- the single-file asset table
  steps.push(async () => {
    const A = M.asset;
    const prev = window.__cs16Assets;
    check('assetUrl: next to the page without a table', A.assetUrl('maps/de_dust2.lm.json').endsWith('maps/de_dust2.lm.json') && !A.assetUrl('maps/de_dust2.lm.json').startsWith('data:'));
    const json = JSON.stringify({ width: 1, height: 1, hash: 'feedf00d' });
    window.__cs16Assets = { 'maps/zz_test.lm.json': 'data:application/json;base64,' + btoa(json) };
    let got = null;
    try { got = await (await fetch(A.assetUrl('maps/zz_test.lm.json'))).json(); } catch { /* fail */ }
    check('assetUrl: a table entry (data: URL) wins and fetches', got?.hash === 'feedf00d' && A.assetInlined('maps/zz_test.lm.json') && !A.assetInlined('maps/de_dust2.lm.json'));
    window.__cs16Assets = prev;
    return false;
  });

  // ---------------------------------------------------------------- sky presets, fog
  steps.push(async () => {
    const r = g.renderer.renderer, S = M.sky;
    const px = (tex, face, x, y) => { const b = new Uint8Array(4); r.readRenderTargetPixels(tex.userData.renderTarget, x, y, 1, 1, b, face); return [...b.slice(0, 3)]; };
    const avg = (tex, face) => { const R = tex.userData.renderTarget, N = R.width, b = new Uint8Array(N * N * 4); r.readRenderTargetPixels(R, 0, 0, N, N, b, face); const s = [0, 0, 0]; for (let i = 0; i < b.length; i += 4) { s[0] += b[i]; s[1] += b[i + 1]; s[2] += b[i + 2]; } return s.map((v) => v / (N * N)); };
    // cube faces: +y (index 2) is the zenith in three's Y-up space
    const sunset = S.createSky(r, { preset: 'sunset', sunDir: [-0.945, -0.253, 0.208] });
    const night = S.createSky(r, { preset: 'night', sunDir: [-0.383, 0.663, 0.643] });
    const over = S.createSky(r, { preset: 'overcast', sunDir: [0.321, 0.557, 0.766], fog: { color: [0.42, 0.45, 0.48] } });
    const none = S.createSky(r, { preset: 'none', color: [0.02, 0.022, 0.026] });
    const zN = avg(night, 2), zO = avg(over, 2);
    // the -x face (index 1) looks west: the sunset's sun side
    const west = avg(sunset, 1), east = avg(sunset, 0);
    check('sky sunset: warm toward the low sun, cooler away from it', west[0] > west[2] * 1.3 && west[0] > east[0], `west ${west.map((v) => v | 0)} east ${east.map((v) => v | 0)}`);
    check('sky night: a dark blue zenith with stars', zN[2] > zN[0] && zN[2] < 60 && (() => { const R = night.userData.renderTarget, N = R.width, b = new Uint8Array(N * N * 4); r.readRenderTargetPixels(R, 0, 0, N, N, b, 2); let bright = 0; for (let i = 0; i < b.length; i += 4) if (b[i] > 120) bright++; return bright > 20; })(), `zenith ${zN.map((v) => v | 0)}`);
    check('sky overcast: grey and flat', Math.max(...zO) - Math.min(...zO) < 25 && zO[0] > 90, `zenith ${zO.map((v) => v | 0)}`);
    // just under the horizon on a side face (rows 100 / 156: one is below it, whichever way the face is stored)
    const fogC = [0.42, 0.45, 0.48].map((v) => v * 255);
    const dist = (p) => Math.max(...p.map((v, i) => Math.abs(v - fogC[i])));
    const below = [px(over, 0, 128, 100), px(over, 0, 128, 156)].sort((a, b) => dist(a) - dist(b))[0];
    check('sky fog: the horizon fades into the fog colour', dist(below) < 6, `below the horizon ${below} fog ${fogC.map((v) => v | 0)}`);
    check('sky none: a plain colour', none.isColor === true && Math.abs(none.r - 0.02) < 1e-6);
    for (const t of [sunset, night, over]) t.userData.dispose();
    // fog on the loaded map
    const fog = g.W.mapDef.fog, sf = g.renderer.scene.fog;
    if (!fog) check(`${g.W.mapDef.id}: no scene fog (its preset has none)`, sf === null);
    else {
      g.frame(1 / 60);
      g.renderer.render(true);
      const wm = g.W.meshes.find((m) => m.material?.uniforms?.fogColor);
      check(`${g.W.mapDef.id}: scene fog from its preset, fed to the world shader`, !!sf && Math.abs(sf.color.r - fog.color[0]) < 1e-6 && (fog.density ? sf.density === fog.density : sf.near === fog.near && sf.far === fog.far) && wm && Math.abs(wm.material.uniforms.fogColor.value.r - fog.color[0]) < 1e-6);
      // (the app's own three.js instance: the fog patch lives on its Material prototype)
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/.vite/deps/three.js'));
      const THREE = url ? await import(url).catch(() => null) : null;
      if (!THREE) info('additive fog check skipped (three.js module not found)');
      else {
        const s = new THREE.Scene(); s.fog = sf;
        const add = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending }));
        s.add(add);
        r.compile(s, g.renderer.camera);
        const keys = r.info.programs.map((p) => p.cacheKey || '');
        check(`${g.W.mapDef.id}: additive glows fade out in the fog (their own fog chunk)`, keys.some((k) => k.includes('fog-additive')));
      }
      const pm = g.players.find((p) => p.model)?.model;
      let fogged = false;
      pm?.object3D.traverse((o) => { if (o.material?.fog) fogged = true; });
      check(`${g.W.mapDef.id}: player / zombie models take the fog`, fogged);
    }
    const F = await import('/src/engine/fog.js');
    check(`${g.W.mapDef.id}: its grade on the canvas`, (g.renderer.canvas.dataset.grade || '') === F.gradeFilter(g.W.mapDef.grade), g.renderer.canvas.dataset.grade || 'none');
    return false;
  });

  // ---------------------------------------------------------------- ambience
  steps.push(async () => {
    const amb = M.snd.SOUND_GROUPS['Map ambience'] || [];
    check('Map ambience group: one loop per original map', ['amb_fort_ember', 'amb_hollow_creek', 'amb_sector9', 'amb_blackwater'].every((n) => amb.includes(n)) && amb.every((n) => M.snd.SOUND_META[n].loop), amb.join(' '));
    const loop = g.W.mapDef.ambience.loop;
    const before = performance.now();
    const ok = await g.sound.ensure(loop);
    const b = g.sound.bank.get(loop);
    check(`${g.W.mapDef.id}: its ambience (${loop}) is synthesised and loops`, ok && b && b.duration >= 5, `${b ? b.duration.toFixed(1) : 0} s, ${(performance.now() - before) | 0} ms`);
    const lazy = amb.filter((n) => n !== loop && g.sound.bank.has(n) && !g.sound._ensuring?.has(n));
    check('map ambience is lazy: other maps\' loops are not in the bank', !lazy.length, lazy.join(' '));
    for (const n of amb) {
      const t0 = performance.now();
      await g.sound.ensure(n);
      const ms = performance.now() - t0;
      check(`${n}: synthesises (lazily) in under 800 ms`, g.sound.bank.has(n) && ms < 800, `${ms | 0} ms`);
    }
    return false;
  });

  // ---------------------------------------------------------------- the loaded map in the game
  steps.push(async () => {
    const d = g.W.mapDef;
    check(`${d.id}: loaded with its shipped lightmap`, g.W.lmSource === 'prebaked', `${g.W.lmSource}, ${g.W.loadMs | 0} ms build+load`);
    check(`${d.id}: active map metadata (zones for callouts)`, M.meta.activeMap() === d && (d.zones ? M.meta.activeZones() === d.zones : M.meta.activeZones() === null));
    const fr = g.zombies.director.fronts();
    if (d.fronts) check(`${d.id}: its fronts, each with spawn nodes`, fr.length === d.fronts.length && fr.every((f) => f.nodes.length >= M.dir.MIN_FRONT), fr.map((f) => `${f.name}:${f.nodes.length}`).join(' '));
    else info(`${d.id}: fronts ${fr.map((f) => `${f.name}:${f.nodes.length}`).join(' ')}`);
    if (d.zones) {
      const sq = d.squadStart?.pos;
      const z = sq && M.bots.zoneOf([sq[0], sq[1], sq[2] + 1]);
      check(`${d.id}: zoneOf uses the map's callouts`, !!z && d.zones.includes(z), z?.[0] || 'none');
    } else check(`${d.id}: zoneOf uses de_dust2's table`, M.bots.calloutOf([-1550, 2650, 10]) === 'B Site');
    check(`${d.id}: bot knowledge (dust2: MAPDATA; others: derived)`, d.bots === 'mapdata' ? !g.bots.K().generic : g.bots.K().generic === true);
    return false;
  });

  // ---------------------------------------------------------------- hazards
  steps.push(async () => {
    const d = g.W.mapDef, Hz = g.mapEnts.hazards;
    if (!d.hazards?.length) { check(`${d.id}: no hazards, nothing cut from the nav graph`, Hz.list.length === 0 && Hz.cut === 0); return false; }
    const h = Hz.list[0];
    const inside = g.nav.nodes.filter((n) => n.x >= h.mins[0] && n.x <= h.maxs[0] && n.y >= h.mins[1] && n.y <= h.maxs[1] && n.z >= h.mins[2] && n.z <= h.maxs[2]);
    check(`${d.id}: hazard ${h.id}: its nav nodes are cut out`, inside.length > 0 && inside.every((n) => n.hazard && !n.edges.length) && !g.nav.nodes.some((n) => n.edges.some((e) => g.nav.nodes[e.to].hazard)), `${inside.length} nodes`);
    const me = g.local, wasGod = me.god;
    me.god = false;
    const hp0 = me.health;
    const c = [(h.mins[0] + h.maxs[0]) / 2, (h.mins[1] + h.maxs[1]) / 2, h.mins[2] + 30];
    me.pm.origin = [c[0], c[1], Math.min(h.maxs[2] - 4, inside[0]?.z ?? c[2]) + 36];
    g.tick();
    const o = me.pm.origin;
    const out = !Hz.at(o[0], o[1], o[2] - 36);
    check(`${d.id}: falling into ${h.id} puts you back on land (${h.kind}, ${h.damage} damage)`, me.alive && out && (h.damage ? me.health < hp0 : true), `at ${o.map((v) => v | 0)}, hp ${hp0} -> ${me.health}`);
    me.god = wasGod;
    // a zombie in the water comes back at a fresh spawn spot (never a free kill)
    const Z = g.zombies;
    const before = new Set(Z.pool.filter((z) => z.alive));
    const n0 = g.nav.nodes.find((n) => !n.hazard && n.edges.length >= 6);
    Z.spawnZombie({ at: [n0.x, n0.y, n0.z + 37] });
    const z = Z.pool.find((q) => q.alive && !before.has(q));
    if (z) {
      for (let i = 0; i < 20; i++) g.tick(); // (the flow field)
      z.pm.origin = [c[0], c[1], (inside[0]?.z ?? c[2]) + 37];
      g.tick();
      const zo = z.pm.origin;
      check(`${d.id}: a zombie that falls in comes back elsewhere`, z.alive && !Hz.at(zo[0], zo[1], zo[2] - 36), `alive ${z.alive} at ${zo.map((v) => v | 0)}`);
    } else check(`${d.id}: a zombie that falls in comes back elsewhere`, false, 'no zombie spawned');
    return false;
  });

  // ---------------------------------------------------------------- frame cost with 28 up (software GL: reported)
  steps.push(async () => {
    const Z = g.zombies;
    g.local.god = true;
    try { g.console.exec('sv_cheats 1'); g.console.exec('zm_god_squad'); g.console.exec('zm_wave 8'); } catch { /* cheats optional */ }
    Z.stats = { ...Z.stats, count: 500, maxAlive: 28, interval: 0.02, special: 0 };
    const D = Z.director, dmax = D.maxAlive;
    D.maxAlive = (S) => S.maxAlive;
    let up = 0;
    for (let i = 0; i < 1500 && up < 28; i++) {
      g.tick();
      if (i % 25 === 0) { up = 0; for (const z of Z.pool) if (z.alive) { up++; z.health = Math.max(z.health, 1e5); } }
    }
    D.maxAlive = dmax;
    const r = g.renderer, gl = r.renderer.getContext(), pxb = new Uint8Array(4), ri = r.renderer.info;
    let sim = 0, ren = 0, calls = 0;
    const N = 40;
    ri.autoReset = false; // (the world and the view model are two render() calls: count both)
    for (let i = 0; i < N; i++) {
      const a = performance.now();
      g.frame(1 / 60);
      const b = performance.now();
      ri.reset();
      r.render(g.drawVm);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pxb); // (wait for the GPU)
      ren += performance.now() - b; sim += b - a;
      calls += ri.render.calls;
      for (const z of Z.pool) if (z.alive) z.health = Math.max(z.health, 1e5);
    }
    ri.autoReset = true;
    info(`${g.W.mapDef.id}: ${up} zombies up: ${(sim / N).toFixed(1)} ms simulation + models, ${(ren / N).toFixed(1)} ms render (software GL), ${(calls / N) | 0} draw calls a frame; build + lightmap load ${g.W.loadMs | 0} ms`);
    check(`${g.W.mapDef.id}: 28 zombies up for the frame measurement`, up >= 24, `${up}`);
    return false;
  });

  let i = 0;
  window.__drive = async () => {
    if (i >= steps.length) return { done: true, log: [...out.splice(0), `[sim] ${fail ? 'FAIL' : 'PASS'} zm5-framework: ${pass} passed, ${fail} failed`].join('\n') };
    let r;
    try { r = await steps[i++](); } catch (e) { check(`step ${i} threw`, false, e.message + ' ' + (e.stack || '').split('\n')[1]); }
    if (r === 'end') i = steps.length;
    return { log: out.splice(0).join('\n') || undefined };
  };
})();
