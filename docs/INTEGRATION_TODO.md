# Integration backlog (for the next engine/systems pass)

Collected from map, narrative and art reports. Owner: the next fixes agent (after engine-fixes v2.2 lands).

## Engine / systems
- [ ] compact.js: honour `past.cond(state)` in `pastHere()`; gate `hasPastHere` (HUD sparkle) on `flags.compact_unlocked`.
- [ ] Lighting moon flash: only flash cells that are actual window tiles (so `type:'window'` light defs on non-window cells don't draw white squares on lightning).
- [ ] Seats with examine text: a second Confirm while seated should stand Tess up after the examine.
- [ ] Seats with a `script` can't be sat in. Support a seat `sitScript` (runs after sitting) — needed for Assembly front-row seats (`aud_seat_beside_*` carry `front`).
- [ ] Map `sounds: [{ loop, at: [tx, ty], vol, cond }]` → positional loops while cond holds (re-check on refresh). west2 uses it (faucet until `adair_met`).
- [ ] Map `fx: [...]` ambient particle points (drips, embers, steam, coal dust) → an emitter system (vault/breaker use it).
- [ ] Map weather: rain only on maps with `data.weather` (rain leaks indoors today); steam particles at `steam_vent` props when `weather.steam`.
- [ ] Exit `refuse` script missing → fall back to `lockedText`.
- [ ] Map light defs with `cond` (on while cond(state)), e.g. gym banks after `ch6_gym_lights`; or restore persisted groups on load.
- [ ] Assembly system: `setGroup('assembly', true)` on start.
- [ ] tests/maps.mjs reachability: treat function/item locks as passable (maps currently carve a chapter-0 exception into some locks: west1 office door, basement janitor door — remove those exceptions afterwards).
- [ ] Document the two-`door_side` convention for double doors in east–west walls.
- [ ] UI: compact past-view hint wraps to 2 lines.

## Art
- [ ] chalkboard: last of 4 lines clipped by 1 px (clipH 19 → 20).
- [ ] desk_student state `outline` (camcorder-shaped clean rectangle in the dust) for Leah's desk after `ch2_leah_taken`.
- [ ] headlights preset a little stronger (title shot).
- [ ] Optional: banner state `hallpass`, poster `navy`, a neutral dark 'drop' tile for galleries, graffiti 'chalk' state with params.text,
      wooden railing variant, husk_kneeling without pen, Kevin belt-off frame, vhs_frames frame 0 lobby group shot (+ frames: 6),
      colonel_hand `light` param, portrait_colonel more dominant, slightly lighter coal floor value.
