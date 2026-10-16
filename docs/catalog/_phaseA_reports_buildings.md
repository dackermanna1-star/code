## residential

### summary
The residential package works for all six series (P-44, II-49, 1-515/9Sh, P-44T, K-7, brick II-32). I reviewed it in viewer shots at noon and at 21:00 with --lamp (front and back of every series, plus porches), in-world shots of the ?resdemo district (courtyard at 17:30 and 21:00, porch by day and night, tambour, landing 1, flight to the half-landing), a Node smoke test of the API and runtime for 8 series/floor combos in all 4 rotations, a Node build of all 117 section models, and a passing `npx vite build`.

The worst bug was in section.js: the plinth band was filled over the doorway, leaving a 0.5 m wall in every entrance. STEP_MAX is 0.3 m, so no enterable stairwell could actually be walked into. The doorway is now re-cleared.

Other model fixes:
- A black roof-tar stripe showed under the parapet on every facade; the slab edge is now part of the parapet.
- Basement and attic vents were filled with snow and showed as white squares; they are now dark holes.
- Parapet snow caps were 0.75–1 m thick; they are now 0.25–0.5 m cornices.
- The self-lit stairwell and transit-balcony walls glowed at noon (EMIT_CONST); they now use EMIT_STREET, so they are dark by day and lit from dusk.
- About a third of the P-44 transit-balcony bulbs are now dead, so those columns no longer read as two continuous light strips.
- The 25 cm black dado stripe made a heavy zigzag in the stairwells and was removed.
- Lift landing doors are now matte (they showed a big bulb highlight).
- Roof cables were cut down to short stubs.

Lighting and runtime fixes:
- The entrance lamp burnt the door, plate and canopy to white. It now hangs above the door at intensity 4.4 with the light point 0.8 m out, and the «Подъезд» plate moved beside the door at about 2.1 m, where it now reads blue at night.
- Stairwell bulbs got low scatter, and the tambour bulb moved to a corner at 1.1, which removed the haze filling the tambour.
- Explorable stairwells looked unlit from the courtyard. The model and runtime now share a per-variant half-landing bulb plan, and the model paints a faint glow (new material res_stair_glow_lo) around the working bulbs. This was verified by eye in a cropped night courtyard shot.
- Readable interactions with translations now exist for the tambour notice, the roof notice, graffiti and the «Мусорокамера» plate.
- Per-frame allocations were removed from the lift (shared vector, cached doorway boxes).
- residentialSize().frontMargin was overstated (4.0 m); it is now 2.5 m.

The loopStairs code is still in place but unused, and I removed it from the docs. docs/catalog/residential.md is rewritten to match all of the above. Shots are in /home/user/code/tools/out/resrev/; my scripts (private shot.mjs copy, smoke.mjs, mstat.mjs, elev.mjs, slice.mjs) are in /tmp/claude-0/-home-user-code/0a5dfbfd-6665-569f-9c69-cb088a31f473/scratchpad/resrev/.

### engineRequests
- Signs: no way to move, hide or redraw a sign at runtime. The moving lift button panel uses a private lit quad (plates.js, reusing shaderChunks); a dynamic sign API would remove the duplicated shader.
- occludesSnow uses the whole model AABB, so snowfall stops in the 1–1.5 m balcony margins in front of every facade. Porches are already split into their own model to limit this; an optional snow-occlusion rect per model would fix it properly.
- The greedy mesher splits a recessed window pane into several quads (AO differs at the edges), but the interior-mapped window shader needs one quad per pane. Workaround: an opening one voxel larger than the glass, where the ring becomes the frame. A mesher flag to ignore AO when merging EMIT_WINDOW faces would allow true flush or recessed panes.
- There is no night-only constant emissive. materials.js documents a `nightOnly` scaling for EMIT_CONST, but no such flag exists, so self-lit stair walls glowed at noon. They now use EMIT_STREET (follows uStreetOn). An EMIT_NIGHT kind, or honouring nightOnly, would be the proper tool.
- tools/shot.mjs: under heavy load (load average ~17–30), page.screenshot can hit Playwright's default 30 s timeout, and Vite HMR/watch can reload a page mid-shot when another agent edits a file. I used a private copy with a 300 s screenshot timeout and server.hmr=false / watch=null.

### knownIssues
- Stair windows at night are subtler than lit apartment windows by design. In non-enterable sections about 72% of stair floors glow from dusk. Explorable sections rely on real indoor bulbs plus a faint glow around the working half-landing bulbs. That plan is per model variant, so two enterable sections with the same variant share the half-landing pattern, and the glow does not flicker with 'buzz' bulbs. Beyond 75 m the engine's stair_window_far LOD takes over.
- 17-storey sections have more than 255 windows, so window ids wrap. Repeated ids only fall on the opposite facade, so lit-window patterns never repeat visibly.
- Stairwell ceilings are 2.25 m (2-voxel slabs) and the tambour is 2.0 m (it sits under the first half-landing). The tambour ceiling slab shows terrazzo on both sides.
- Standing directly under a stairwell bulb still gives noticeable bloom. Bulbs are intensity 1.6 (tambour 1.1, hung in a corner) with scatter 0.3; about 38% of landing bulbs are dead.
- Whitewash ceilings use the core material's per-voxel variation, so they read slightly like a tiled ceiling up close.
- An open entrance door has collision off until it closes again, so you can walk through the open leaf. The door waits while the player is within 1.5 m of the hinge.
- TV antennas and parapet cables are 1 voxel (0.25 m) thick, so they look chunkier than real ones; the cables were cut down to short stubs for this reason.
- The K-7 uses the yellowed core tile_cream rather than the white or red tile the research describes.
- The loopStairs (endless stairwell) code is still present but unused and undocumented, per the lead. It was not re-verified after the slab and doorway changes.
- The demo scene (?resdemo=1 or ?resdemo=home) changes terrain in its own test area and only activates with that URL parameter.
- Adds 14 materials to the shared palette (res_* prefix, including the new res_stair_glow_lo); the palette total is 187.

## public

### summary
I reviewed the whole `public` package (src/content/public/, docs/catalog/public.md) as art director and QA lead. I checked it with in-world shots at noon, dusk and night on the test lot, with a new rotated test lot (`?pubtest=1&pubonly=rot`), viewer shots, a node model probe and a browser functional test. The worst bug was the doors: collision switched off within 0.3 m of any door, so you could walk through closed doors, including the pharmacy door that is locked at night. Now a door is only passable while it is swinging or when its leaf is actually inside the player. The doors also open to 1.65 rad instead of 1.5, because at 1.5 rad the leaf blocked anyone walking through the middle of the doorway. The functional test now passes on every check: the closed shop door and the locked pharmacy door block the player, the open door lets you into the 'shop' zone, the door auto-closes, buying bread works, and heat-pipe runs end exactly at their corners. Several models had no room for snow above their roofs: the kiosks (no roof snow at all), the kindergarten fence, the hockey goal, the open garage doors and the school roof-exit box, which was also clipped. I made them taller and gave the kiosks a roof drift. Heat-pipe runs overshot corners and run ends by up to 6 m and left gaps of about 4 m at arches. They now use 6 m segments plus a new 1 m filler model, arches are centred on their point, the insulation has patchy snow, and leak steam starts at ground height. Door approaches are now `kind:'entrance'` navPaths, so the life package turns them into door nodes; the kindergarten's three porch stubs feed one yard path. Visual fixes: a downlight from the shop sign onto the facade (it was a black slab at night) and a slightly dimmer sign. The bread rack is now steel with readable loaves, a printed price strip under each shelf and bread crates. The cashier has hair on top so she reads as a person above the counter. Bottles, jars and counter glass use a new opaque glossy material, because the engine's glass made them glow white. The shop porch has a cigarette-butt urn and a heap of shovelled snow. Kiosks have rust and a patch sheet, plus snow drifts at the back and sides. Garage drifts now bank up against the doors and work for rotated rows, and solid dirty-snow patches became tyre ruts at the garages and the warehouse. Boiler windows are dimmer and glow as whole windows instead of random speckles, and they turn dark by day through a light linked to the night. The pharmacy hours plate moved off the door leaf (it blocked the door prompt), as did the shop's «ОТ СЕБЯ» sticker (it floated in the doorway). The green-cross light is softer, and future dates (12.12.08, 14.11.08) were fixed for the game date of 14.01.2008. `npx vite build --outDir tools/out/build-public --emptyOutDir` succeeds and the shots show no console or content errors. The catalog is updated: sizes, the new models and materials, the entrance-stub conventions, the door behaviour, kiosk drifts, the heat-pipe rules and the rotated test lot.

### engineRequests
- Glass shader (src/render/VoxelMaterial.js glassFragment): it applies sky ambient and edge frost to indoor-domain faces, so small indoor glass (bottles, counter guards, display cabinets) glows milky white, especially by day. Please skip the frost and uSkyAmb terms when vDomain is indoor. Workaround: an opaque glossy 'pub_glass_goods' for small items; the pharmacy's glass counter and display cabinet still frost.
- tools/shot.mjs: page.screenshot uses Playwright's default 30 s timeout, so the first job often fails under load ('Timeout 30000ms exceeded'). Please pass a long timeout. Its own Vite server should also run with hmr:false and watch:null; otherwise other agents' edits reload the page mid-shot ('Execution context was destroyed'). And --query mode does not add the common params (t, weather, frames, timescale). I worked around all three with a private copy in the scratchpad.
- Emissive light groups: the placement flag dims ALL EMIT_CONST, FLUOR, TV and STREET voxels of a model, so one building cannot have independently scheduled lit parts (caretaker room vs classroom vs entrance lamp). A per-voxel group id (e.g. via the extra byte) mapped to a light would allow this. Workaround: separate small lamp models, and only one light linked per building shell.
- Zones and interaction boxes are axis-aligned only, so enterable interiors must use quarter-turn rotations. Oriented boxes (or a rotation-aware zone) would allow angled shops and exact interaction boxes for angled kiosks.
- Optional: a documented registry convention for entrances ({x, y, z, angle, kind, enterable}), so residential, public and life all use the same format. I used that shape, plus navPaths {kind:'entrance'} stubs that start at the door.

### knownIssues
- Only the shop, the pharmacy (8–22) and the open garage are enterable. School, kindergarten, boiler house, warehouse and booth interiors are just lit rooms you see through windows; their doors are locked, which is intended.
- Only the cashier is a separate model. The kiosk vendors, the school cleaner and watchman, the guard, the pharmacist and the dispatcher are baked into their buildings' voxels, so the life package cannot animate them.
- Doors are non-solid only while swinging (about 0.6–0.9 s) or while the leaf actually intersects the player; closed and locked doors block. The open leaf (opened to about 95°) still takes 0.25 m of the 1 m doorway, so walking through the middle works but hugging the hinge side bumps into it.
- The big shop and pharmacy windows look frosted and milky, and the pharmacy's glass counter and display cabinet glow slightly by day. This comes from the engine's glass shader (see engineRequests).
- Each kiosk has one point light (domain 'all') under its sign box, which lights both the display and the snow. With no shadows, a little light leaks round the kiosk's sides. Kiosk interaction boxes are only approximate at non-quarter angles.
- Chimney, stovepipe, shawarma-vent and pipe-leak steam needs the nature package (addSteam). It is added in public.init() and skipped quietly if nature is missing.
- School, kindergarten, boiler house, warehouse and hockey box ignore opts.angle and use rot (quarter turns) only.
- Terrain snow mounds (kiosk drifts, garage-door drifts, the shop's shovelled heap, hockey snow banks) add to the terrain height that is already there. Call the helpers after painting the ground. Kiosks placed less than 1 m apart get a pile between them (cosmetic; pass drifts:false to avoid it).
- The boiler hall's lit panes follow a night-weighted light (dim by day). The lit panes are still fairly bright at night under bloom.
- The hockey floodlights run on a fixed schedule (dusk to 22:30), not with the street lights.
- Every placement carries userData.noRelocate = true. Any future relocation or anomaly code has to respect this, or it may split multi-part buildings (school wing, gym and entrance; boiler hall and chimney).

## metro

### summary
I reviewed the metro package and fixed what I found. I checked about 40 in-world shots at noon, 17:30 and 21:00 (all four entrances, stairs, both halls, the corridor, kiosks, the payphone, the leak, the vestibule, the КАССЫ window, the turnstiles, the three escalators from top, middle and bottom, the lower hall and booth, the platform, the interval clock, and a train arriving, docked, getting off and departing). I also ran a scripted headless check against the real game loop.

Underground looked milky. Two causes: the weather's fog and snow scatter applied below ground, and white tiles under rows of tubes passed the HDR bloom threshold. Fog underground is now a faint fixed haze whatever the weather (0.35 in the underpass, 0.16 from the vestibule down), snow scatter is dropped, and the bloom threshold is raised ×2.2 (strength ×0.7) while underground. All of it is restored on the surface. I also lowered the tube glow and zone exposures, added a light over the turnstiles and centre tubes in both stair halls (the south hall was nearly black).

Other fixes:
- Floors were a checkerboard of light, brown and dark slabs. They are now two close greys of granite (new material `metro_granite_grey`), with rare pale slabs, clustered brown repairs, and meltwater thinning out from the doors.
- Train windows showed the glass shader's frost. Windows, windshield and door windows are now open, with a vent transom, so the lit interior reads through them.
- The interval clock housings `metro_clock_box` were defined but never placed; they now sit on both tunnel lintels.
- The train is no longer drawn when the player is above ground.
- The clock now builds its strings only when a digit changes.
- Passengers who get off now use the real terrain height on the surface. They only vanish when the player is more than about 32 m away, otherwise they keep walking.
- Turnstile flaps no longer close on a player already level with them, which could lift the player on top of the turnstile.

One bug was mine: the new train culling hit a null car slot before the first train and stopped the whole metro update. The scripted check caught it and it is fixed.

The scripted check then passed:
- The walk route: NE stair, corridor, doors, slam without a ticket, buying a ticket, the pass, the stopped escalator, the platform, the edge clamp, a 33.5 s up-escalator ride, an exit lane, and out the SW stair.
- The doors stay open for 25 s while the player stands in a doorway.
- A full train cycle with both tracks runs from closing to idle.
- Culling, fog and bloom are restored on the surface.
- Passengers walk off out of sight.

The production build succeeds, and the catalog is updated.

### engineRequests
- Terrain.holeRect gives the bordering cells 12 m deep side faces (h-48). At a stair pit these wall off the passage at the foot of the stairs. Please add a depth option (e.g. holeRect(x0,z0,x1,z1,{depth: CRUST})) or limit hole faces to the crust. Workaround: terrain._sideQuad is wrapped on the instance and faces next to the metro footprint are clamped to CRUST.
- Please add a post-build hook, or a rule, so later layout packages (e.g. avenue at order 32) cannot paint over earlier packages' holes. Workaround: world.finalize is wrapped on the instance and re-carves the four pits first.
- Glass shader: it uses uSkyAmb for tint and frost and reflects fogSky, so underground glass turns white and always shows edge frost. Please make it use uIndoorAmb with no sky reflection for indoor placements (aInst2.y) and add a per-material 'no frost' flag. Workaround: the metro has no glass voxels at all now. Kiosk fronts, the kassa hatch, the booths and the train windows, windshield and door windows are open, and the vestibule doors use opaque glass_frosted.
- Please add per-zone atmosphere overrides: fog density and colour, lamp scatter, ambient, and bloom threshold/strength. Underground the weather fog thickens with depth (exp height falloff), the snow's scatter applies, and dozens of tubes over white tiles flood the HDR bloom. Workaround: atmos.update is wrapped on the instance. It scales uFogDensity to a weather-independent haze (0.35 / 0.16 of clear weather), clamps uScatter, and darkens the sky/fog uniforms past the vestibule doors. game.post.bloom.threshold/strength are raised/lowered while underground and restored to the captured values on the surface.
- Audio: please add door-only sounds 'metro_door_open' / 'metro_door_close' with no speech, and an option on 'metro_doors' to set the next station (it always says «Заречная», which is wrong for trains leaving the terminus toward «Улица Строителей»). The metro registers simple fallbacks for the two door sounds only if audio.has() is false.
- UI: ui.showNote plays a 'paper' sound that is not registered when the audio package is absent ('Unknown sound paper' warning with only=base,metro). It is harmless, but the UI could check audio.has().

### knownIssues
- On a moving escalator the collision is a static staircase under the sliding bands, so the view rises or sinks one voxel per step (the camera step smoothing softens it).
- The escalator tunnel ceiling and handrails are visibly stepped (1 voxel per 0.5 m), and the 0.5 m wooden balustrades are chunky next to real ones; changing that would move every lane constant.
- The interval clock's left half shows the accelerated game clock (0.5 game-min per second), while the right half counts real seconds; it tops out at 99:59.
- The departure PA uses the audio package's 'metro_doors', which names «Заречная» as the next station. The speech is synthesized and unintelligible and has no caption, so it is rarely noticeable.
- Train, kiosk and kassa windows are open holes, not glass. This is deliberate: the engine glass frosts and reflects the sky underground. A window opening starts 0.75 m above the floor, so it cannot be walked through.
- Seen from the nave centre, the column rows hide the tracks at shallow angles, so a far arriving train is only visible near the edge (this matches a real column station).
- Polished granite floors show scattered single-voxel specular glints from the ceiling tubes.
- Fine-voxel people use engine AABBs twice their real size (affects culling only); passengers have no collision and walk through the player.
- Underground placements, lights and the train are culled by player position; the rule is chosen so the hidden parts can't be seen through the pits.
- Four instance-level engine tweaks are installed at build, init and update (terrain._sideQuad, world.finalize, atmos.update, and post.bloom threshold/strength while underground). They can be removed once the engine requests are done.
- The fallback road, sidewalk and median painted inside the footprint may not exactly match the avenue package's tyre-track noise at x 374 and 396. Until the avenue package exists, the base snow (y 0.5) meets the painted sidewalk (y 0.25) with a visible step at the footprint edge.
