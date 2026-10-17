# Integration backlog (for the next engine/systems pass)

Collected from map, narrative and art reports. Owner: the next fixes agent (after engine-fixes v2.2 lands).

## Engine / systems
- [x] compact.js: honour `past.cond(state)` in `pastHere()`; gate `hasPastHere` (HUD sparkle) on `flags.compact_unlocked`.
      → done: `map.pastAt(tx, ty, state)` skips failing conds; `hasPastHere = compact_unlocked && pastHere()` (API_NOTES Integration 2 §1).
- [x] Lighting moon flash: only flash cells that are actual window tiles (so `type:'window'` light defs on non-window cells don't draw white squares on lightning).
      → done: `MoonLayer.flash` skips non-`window_*` cells; explicit + auto window on one cell no longer double (§2).
- [x] Seats with examine text: a second Confirm while seated should stand Tess up after the examine.
      → done in interact.js: examine once per sit, next tap stands (§3).
- [x] Seats with a `script` can't be sat in. Support a seat `sitScript` (runs after sitting) — needed for Assembly front-row seats (`aud_seat_beside_*` carry `front`).
      → done: `sitScript` (hiding.js, queued behind roll #3, `HW.hiding.sitScriptFor`); front seats default to `ch7.front_<front>` via `HW.assembly.sitScriptFor`, deferring to ch7.js's own sit hook so each scene runs once (§3–4).
- [x] Map `sounds: [{ loop, at: [tx, ty], vol, cond }]` → positional loops while cond holds (re-check on refresh). west2 uses it (faucet until `adair_met`).
      → done: `HW.ambient` (game/ambient.js); hands over to a script already playing the same loop there (ch5's faucet today), `HW.ambient.mute()`, `HW.audio.activeLoops()` (§5).
- [x] Map `fx: [...]` ambient particle points (drips, embers, steam, coal dust) → an emitter system (vault/breaker use it).
      → done: `HW.ambient` emitters, object form (vault/breaker data) and array form with `every`/`n`/`cond` (§5).
- [x] Map weather: rain only on maps with `data.weather` (rain leaks indoors today); steam particles at `steam_vent` props when `weather.steam`.
      → done: rain snaps off on maps without weather (even while deferring to pro.js), `HW.fx.rain(…, { instant })`; steam stays single-source (tested both ways) (§6).
- [x] Exit `refuse` script missing → fall back to `lockedText`.
      → done in game.js `_checkZones` (§7).
- [x] Map light defs with `cond` (on while cond(state)), e.g. gym banks after `ch6_gym_lights`; or restore persisted groups on load.
      → done: data light `cond` (map.js `condOff` + lighting), re-checked on refresh; groups were already persisted in v2.2 (§8).
- [x] Assembly system: `setGroup('assembly', true)` on start.
      → done in assembly.start() (§4).
- [x] tests/maps.mjs reachability: treat function/item locks as passable (maps currently carve a chapter-0 exception into some locks: west1 office door, basement janitor door — remove those exceptions afterwards).
      → done: `map.reachable({ doors: 'locks' | 'all' })`, `__HW.pathExists(…, { doors })`; exceptions removed from `w1_office_door` / `b_jan_door`, with regression checks (§9).
- [x] Document the two-`door_side` convention for double doors in east–west walls.
      → API_NOTES Integration 2 §10.
- [x] UI: compact past-view hint wraps to 2 lines.
      → done in overlays.js (§11).

## Art
- [x] chalkboard: last of 4 lines clipped by 1 px (clipH 19 → 20).
      → done: 4-line boards start a row higher + per-pixel clip at the slate edge (§12).
- [x] desk_student state `outline` (camcorder-shaped clean rectangle in the dust) for Leah's desk after `ch2_leah_taken`.
      → done (catalog state + art, up/side facings); wired on west1 `w1_desk_103_leah` via the new prop field `stateWhen` (§8b).
- [x] headlights preset a little stronger (title shot).
      → done: intensity 1, `twinAlpha` 0.8 (new preset field), brighter lamp glow.
- [x] Optional: banner state `hallpass`, poster `navy`, a neutral dark 'drop' tile for galleries, graffiti 'chalk' state with params.text,
      wooden railing variant, husk_kneeling without pen, Kevin belt-off frame, vhs_frames frame 0 lobby group shot (+ frames: 6),
      colonel_hand `light` param, portrait_colonel more dominant, slightly lighter coal floor value.
      → done: banner `hallpass` (params.text), poster `navy`, tiles `drop` ('O') + `railing_wood` ('I'), graffiti `chalk`, husk_kneeling `nopen`,
        Kevin `beltoff_down` (patrol.dismiss uses it), portrait_colonel bigger/bolder, lighter coal. NOT done: vhs_frames frame 0 and
        colonel_hand `light` — they live in the Colonel CG files the artist is redrawing (not mine to edit). Maps can adopt the new
        variants (longhall arch sign → banner hallpass, gallery → 'O', breaker railings → railing_wood) — map-author changes.
