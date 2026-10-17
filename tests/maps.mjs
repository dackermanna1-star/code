// Story map validation (CONTENT.md v2 §2). For every story map: loads in the engine without errors,
// has every required anchor, every exit points to an existing map + anchor, every anchor is reachable
// from the map's first anchor (closed doors and lock-gated doors — item:/flag:/function locks, whatever
// their value right now — treated as passable: `doors: 'locks'`; doors shut by state alone stay shut),
// every referenced script id exists (warning only — scripts are authored after maps).
// Usage: node tests/maps.mjs [mapId ...]
import { launch, openGame, suite } from './lib.mjs';
import { REQUIRED_ANCHORS, STORY_MAPS } from './anchors.mjs';

const only = process.argv.slice(2);
const ids = only.length ? only : STORY_MAPS;
const t = suite('maps');
const browser = await launch();
const game = await openGame(browser);
await game.hw(async (H) => { H.autoAdvance(true); H.god(true); await H.newGame({ skipIntro: true }); });

for (const id of ids) {
  const r = await game.hw(async (H, mapId, required) => {
    const HW = window.HW;
    const data = HW.data.maps[mapId];
    if (!data) return { missingMap: true };
    const out = { warnings: [], anchorsMissing: [], badExits: [], unreachable: [], errorsBefore: H.errors.length, placeholder: /placeholder/.test(data.name) };
    for (const a of required) if (!data.anchors?.[a]) out.anchorsMissing.push(a);
    for (const e of data.exits || []) {
      const tgt = HW.data.maps[e.to];
      if (!tgt) out.badExits.push(`${e.to} (no map)`);
      else if (e.anchor && !tgt.anchors?.[e.anchor]) out.badExits.push(`${e.to}:${e.anchor} (no anchor)`);
    }
    const first = Object.keys(data.anchors || {})[0];
    try { await H.teleport(mapId, first); await H.idle(); } catch (err) { out.loadError = String(err); return out; }
    const map = HW.map;
    for (const [name] of Object.entries(data.anchors || {})) {
      try { if (!H.pathExists(mapId, first, name, { doors: 'locks' })) out.unreachable.push(name); } catch (err) { out.unreachable.push(`${name} (${err.message})`); }
    }
    const S = HW.data.scripts;
    const refs = new Set();
    for (const p of map.props) { const sc = p.inst?.script || p.script || p.params?.script; if (sc) refs.add(sc); }
    for (const tr of data.triggers || []) if (tr.script) refs.add(tr.script);
    for (const e of data.exits || []) { if (e.script) refs.add(e.script); if (typeof e.refuse === 'string') refs.add(e.refuse); }
    out.missingScripts = [...refs].filter((s) => typeof s === 'string' && !S[s]);
    out.size = [map.w, map.h];
    out.props = map.props.length;
    out.newErrors = H.errors.slice(out.errorsBefore);
    return out;
  }, id, REQUIRED_ANCHORS[id] || []);
  if (r.missingMap) { t.ok(false, `${id}: map registered`); continue; }
  const tag = r.placeholder ? ' [PLACEHOLDER]' : '';
  t.ok(!r.loadError, `${id}${tag}: loads`, r.loadError);
  t.ok(r.anchorsMissing.length === 0, `${id}: required anchors present`, r.anchorsMissing);
  t.ok(r.badExits.length === 0, `${id}: exits point to real maps/anchors`, r.badExits);
  t.ok(r.unreachable.length === 0, `${id}: all anchors reachable from the first anchor`, r.unreachable);
  t.ok(r.newErrors.length === 0, `${id}: no errors while loading`, r.newErrors);
  if (r.missingScripts?.length) console.log(`  warn ${id}: scripts not yet defined: ${r.missingScripts.join(', ')}`);
  if (r.size) console.log(`  info ${id}: ${r.size[0]}x${r.size[1]} tiles, ${r.props} props`);
}
// Lock-gated rooms: shut on the live grid without the key (no chapter-0 exception carved into the lock),
// reachable for validation with doors: 'locks'.
if (!only.length || only.includes('west1') || only.includes('basement')) {
  const r = await game.hw((H) => {
    const HW = window.HW;
    const s = HW.state;
    const saved = { chapter: s.chapter, keyring: s.inv.keyring, jan: s.flags.ch3_jan_key };
    s.chapter = 0; delete s.inv.keyring; delete s.flags.ch3_jan_key;
    const out = {};
    for (const [mapId, from, to, door] of [['west1', 'door_office', 'in_office', 'w1_office_door'], ['basement', 'from_east1', 'keyring', 'b_jan_door']]) {
      const lock = HW.data.maps[mapId].doors && Object.values(HW.data.maps[mapId].doors).find((d) => d.id === door)?.lock;
      out[mapId] = { live: H.pathExists(mapId, from, to), locks: H.pathExists(mapId, from, to, { doors: 'locks' }), all: H.pathExists(mapId, from, to, { doors: 'all' }),
        lockedCh0: typeof lock === 'function' ? !!lock(s) : null };
    }
    s.chapter = saved.chapter;
    if (saved.keyring) s.inv.keyring = saved.keyring;
    if (saved.jan) s.flags.ch3_jan_key = saved.jan;
    return out;
  });
  for (const id of ['west1', 'basement']) {
    t.ok(r[id].lockedCh0 === true, `${id}: the door lock holds in chapter 0 without its key (no chapter exception)`, r[id]);
    t.ok(!r[id].live && r[id].locks && r[id].all, `${id}: locked room unreachable live, reachable with doors 'locks'/'all'`, r[id]);
  }
}

await game.close(); await browser.close();
process.exit(t.done ? (t.done() ? 0 : 1) : 0);
