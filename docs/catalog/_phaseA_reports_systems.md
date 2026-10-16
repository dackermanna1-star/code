## audio

### engineRequests
- Add an official silence/duck stage, a 'foley' bus and a duck-bypassing path for the 'ui' bus to AudioEngine. The package rewires the master chain at runtime in src/content/audio/mix.js: master → duck → snow shelf → muffle; foley → muffle; bus.ui → master-volume gain → muffle. If engine.master or engine.muffleFilter is renamed, it falls back to no ducking.
- Apply opts.cutoff (baseCutoff) to non-spatial emitters too. connectSource leaves their lowpass at 20 kHz and update() only touches spatial emitters, so audio inserts its own lowpass for opts.muffled.
- Keep passing the same opts object to the sound factory and to connectSource, or let factories return a 'defaults' field. Audio injects per-sound defaults (bus, refDistance, rolloff, maxDistance, reverb) into that object and removes them again in a microtask after play() returns.
- Expose a public IR accessor, e.g. engine.irFor(name), instead of the private _ir() that the foley convolvers use. Also cache one ConvolverNode per reverb kind in setReverb instead of reassigning .buffer on every zone change: each assignment FFT-partitions the impulse response on the main thread. The audio package already does this for its foley path.
- Let a source report or extend its real duration after an asynchronous start, e.g. connectSource honouring a src.ended promise or an em.extend(seconds). Auto-stop is computed from src.duration at play() time, so buffers rendered in the worker need maxDur estimates, and playSpeech runs its own stop timer.
- Track non-spatial emitters as well, or document that non-spatial loops must be stopped by the caller; they are not in engine.emitters.
- Optional: Doppler for moving emitters. Pass-by sounds bake their own Doppler, but drive loops attached to moving vehicles have none.

### knownIssues
- Nothing was listened to; headless Chromium has no audio output. Verification used spectrograms, peak/RMS/A-weighted levels and logs. The footstep rebalance (hard floors are now 6–8 dB louder to the ear than before) and the new drill and rattle sounds were tuned by measurement, not by ear, and need a listening pass.
- car_pass, bus_pass and trolleybus_pass without loop:true are 6–11 s fixed-point pass-bys with a baked envelope. Vehicles the game moves must use loop:true with speed, setPosition and setRate (the vehicles package does).
- Buffer memory is about 24 MB at load and grows to a soft cap of about 48 MB with LRU eviction; everything rendered would be about 71 MB. Buffers that are playing are never evicted, so the cap can be exceeded briefly. Worker CPU for the first tier is a few seconds, spread across the loading screen.
- The music's shared reverb is prepared once, in idle time about 20 s after audio starts. That is a one-off main-thread task of roughly 30–150 ms on this loaded SwiftShader machine, likely much less on real hardware. A piece forced earlier (?audio=music) pays it at its start.
- Music keeps running in AudioContext time while the game is paused. Chords and notes due during the pause are dropped (no clicks), but the director measures the piece's end in game time, so after a long pause the next piece starts somewhat later.
- A few delayed follow-ups (an answering dog, the distant lift stopping) use setTimeout and still fire while the menu is open; they are heard muffled under the menu.
- Low-sample-rate buffers (8–16 kHz) are resampled linearly by Web Audio. A recipe-level anti-imaging lowpass mitigates this, but faint images may remain. The distant car alarm's square waves have some synthesis aliasing.
- The synthesized speech is deliberately unintelligible: correct rhythm and intonation, not real words.
- The phone package owns phone_ringtone, phone_beep, phone_gsm and phone_pocket, and metro owns metro_door_open and metro_door_close; audio does not register them.
- Silence zones now duck the world by −12 dB (previously −20) and push their beds down about 28 dB. Layout agents placing silence:true courtyards should check that the result still feels nearly silent.
- In headless runs the game clock runs at roughly a quarter of real time, so --live sampling shows few timed far events. Use --fire to exercise every event path. tools/shot.mjs can time out under heavy machine load.

### apis
- playAt(name, pos, opts?) → emitter|null — e.g. playAt('crow_caw', [x, 18, z])
- playStep(surface: SURF number | 'snow'|'snow_packed'|'tile'|…, pos, opts?) → emitter|null — NPC footstep (loudness-matched per surface)
- playRadioFragment(pos, opts? {duration, gain, variant: 0|1, static:false}) → emitter|null — 8–18 s of late-2000s pop from a cheap radio with tuning static
- playSpeech(text, opts? {voice:'male'|'female'|'old'|'child'|'anchor', chain:'pa'|'wall'|'phone'|'radio'|'muffled'|'none', pos, gain, rate, f0, …}) → emitter|null — now really renders the given text/voice/chain (was always «Алло?»); rendered async in the worker (~0.1–0.3 s), cached per text, emitter stops from the real rendered length
- preload(names: string|string[]) → Promise — render buffers ahead of a scripted moment
- requestSilence(seconds = 30) — trigger a silence event now
- isSilent() → boolean — silence event or silence zone active
- playMusicNow(seed?) → piece|null — start an ambient music piece (debug)
- audioStats() → object — director + bank snapshot (debug)
- SOUND_NAMES: string[] (93); CASHIER_PHRASES / KIOSK_PHRASES / PA_PHRASES: [{ru, en, text}] (index = opts.phrase)
- STEP_DB (exported from src/content/audio/sounds.js): per-surface footstep levels, loudness-matched (A-weighted); shared by the player's steps and the NPC step_* sounds
- New sounds: neighbour_drill (перфоратор through concrete, 7–10 s, bus ambience), wind_rattle (loose roof tin in a strong gust, FAR defaults, refDistance 10)
- Sound opts (via ctx.audio.play): car_pass/bus_pass/trolleybus_pass {loop:true → drive loop, speed km/h}; metro_rumble {loop:true → in-tunnel roar}; intercom_beep {kind:'key'|'ok'|'open'|'error'}; elevator_doors {dir:'open'|'close'}; doorbell {kind:'trill'|'bell'|'chime'|seed}; fluorescent_buzz {failing:true}; tv_muffled {variant:'news'|'show'}; radio_distant {fragment:true, duration}; swing_creak {period, pitch}; footsteps_phantom {indoor}; dog_bark {dog, howl}; crow_caw {jackdaw}; turnstile {kind:'pass'|'slam'|'gate'}; announcement/cashier_voice/kiosk_voice {phrase}; metro_station_announce {terminus}; phone_* {muffled}; phone_key {tone:false, freq}; phone_vibrate {pulses|loop}; phone_ring_out {loop|duration}; phone_busy {cycles}; dial_pulse {digit}; radiator_knock {kind:'tick'}; any {variant} is clamped to the rendered range

## phone

### engineRequests
- Game.tick sends Escape to phone.close(), so the phone can only tell 'step back' from 'close' by checking input.hit('Escape') inside close(). A separate phone.back() hook, or a reason passed to close(), would be cleaner.
- While the phone is open, Game skips player.update, which would freeze gravity, lift and metro carry, and escalators. The phone works around this by calling player.update itself with movement keys filtered out. A built-in 'no-move' input mode in Player.update would be more robust.
- Game does not clear the interaction prompt when the phone opens. The phone calls ui.setPrompt(null) in show() as a workaround.
- Signs.add draws the canvas immediately, and nothing waits for web fonts before content builds. The phone package redraws texts that use its bundled fonts in its own build (order 60) before the atlas is packed. An engine hook, such as 'await fonts before build' or 'draw lazily at signs.build', would let any package use web fonts safely.
- Signs are baked once at build, so a placed notice cannot change later (for example, tearing off another strip). A small API to swap one sign's texture at runtime would allow that.
- In Chrome, pressing Escape while the pointer is locked also releases the lock. With the phone open, the player then has to click to look around again after Escape steps back or closes the phone. Game could re-request the lock after the phone handles Escape.

### knownIssues
- The fallback 'phone_unavailable' voice is a crude formant synth that is not intelligible. In the full game the audio package registers its own phone_key, phone_sms, phone_vibrate, phone_ring_out and phone_unavailable, and those win. The LCD text and the English caption carry the meaning either way.
- If the bundled handwriting fonts fail to load, or take more than 6 s by the time the phone package builds, notes and graffiti fall back to system fonts (Segoe Print, Comic Sans or DejaVu). Graffiti widths are measured with whichever font was ready at placement time, so a late font can leave a little extra empty space in that sign.
- The LCD scales by whole device pixels with a minimum of 2× so the bitmap font stays crisp. At very small windows such as 960×540 the phone still covers about 77% of the height; at 720p and above it is capped at about 62%. On small windows the glove is mostly below the screen edge.
- Each placed item uses about 40k atlas pixels, roughly 100 per 2048 px atlas page, so several hundred items mean several atlas pages.
- Snake, ringtone and contrast settings are stored in localStorage (guarded with try/catch); SMS and call state last for the session only.
- Some graffiti names real bands and clubs (Tsoi/Kino, Sektor Gaza, KiSh, Spartak, CSKA). This is authentic street graffiti rather than advertising; all commercial brands are fictional parodies.

### apis
- game.phone: toggle(); show(screen?); close({force}?) (Escape steps back one screen; in the dialler it leaves; at standby it closes); handleInput(input, dt); update(dt); receive({from, fromEn, ru, en, contact?}) -> bool (max 3 per session); addMissed({who, en, time, contact?}); trigger('mum'|'promo'|'friend'|'underground'); goto(name); props open, signal(0-4), battery(1-3), inbox, log, settings, visU
- addNotice(ctx, {x, y, z, angle=0, w?, h?, item|id|kind:'notice', sub?, seed?, aged?, tornTabs?:'allButOne'|bool[], paper?, ink?, tape?, flat?, readable=true, indoor?, emissive?}) -> {item, sign, interaction, w, h, x, y, z, angle, kind}
- addPoster(ctx, {x, y, z, angle, w?, h?, item|id|kind:'ad', seed?, fade?, emissive?, schedule?}) -> record
- addGraffiti(ctx, {x, y, z, angle, h?, item|id|kind:'graffiti', look?:'spray'|'marker'|'scratch'|'stencil'|'tag'|'chalk'|'dust', color?, seed?, readable?}) -> record
- addPriceTag(ctx, {x, y, z, angle, item|id|seed, indoor?}) -> record (7.5x5 cm)
- addPlate(ctx, {x, y, z, angle, item|id|kind:'street'|'metro'|'shop', w?, h?, emissive?, indoor?}) -> record
- addText(ctx, {x, y, z, angle, w?, h?, scale?, item|id|kind+sub, seed?, look?, aged?, fade?, readable?, prompt?, reach?, tag?, indoor?, emissive?, schedule?, double?, offset=0.01, ppm?, color?, tornTabs?, tape?, paper?, ink?, flat?}) -> record|null
- addNoticeCluster(ctx, {x, y, z, angle, w, h, count=3, seed, kinds:['notice'|'ad'], subs?, include?:[ids], exclude?, aged?, indoor?}) -> record[] (with 'ad' it mixes in photocopied flyers; subs apply to notices only)
- addReadable(ctx, {x, y, z, angle, w, h, item|note, prompt?, reach?, tag?}) -> interaction
- noteFor(item) -> {title, ru, en, style, footer}
- resolveText(o, fallbackKind) -> item
- handFontsReady(timeoutMs=5000) -> Promise<bool>; redrawHandTexts() -> number (called by the phone package's build)
- HAND_STACK ('LM Script' Bad Script cursive + fallbacks), MARKER_STACK ('LM Marker' Neucha + fallbacks): CSS font stacks for custom signs.add({draw})
- getText(id) / textsOf(kind, {sub, look, exclude}) / pickText(kind, seed, filter)
- TEXTS {NOTICES, ADS, GRAFFITI, SHOP, METRO, STREET, SMS}, ALL_TEXTS
- drawItem(g, W, H, item, {seed, look}) / drawNotice / drawPoster / drawGraffiti / drawPriceTag / drawPlate / defaultSize(item, look) -> [w, h] / graffitiAspect(item)
- sounds.js: registerPhoneSounds(audio), PHONE_SOUNDS, RINGTONES, parseTune(str)

## life

### engineRequests
- Per-model voxel size option in defineModel (e.g. voxelSize), so def.min/max, voxelToWorld/toLocal, contact shadows, the stock --viewer framing and the shader's uVoxelScale follow the model's own grain. Fine-voxel models (life, the nature package's crows) hack this today: life registers lods:[2f, f] with an empty LOD 0 and lodDistances [-1e6], so it draws through the LOD-1 material (no 0.25 m edge grid), and it patches def.min/max at runtime (fixFine). They therefore get no voxel edge darkening at all, and their colour variation comes in 0.5 m cells. The stock viewer still frames them 4-16x too far away.
- Footprints: a separate budget for NPC prints (they currently share the player's 1400-print ring buffer; life only adds prints within 95 m of the player) and alternative print shapes (paws, sled runners, trolley wheels). Also, Footprints.add allocates a new THREE.Vector3 on every call; it is called for every NPC footfall too.
- residential: an official door API for NPCs, e.g. entrance.openFor(seconds), with the runtime's own swing state updated. Life now borrows enterable (dynamic) doors only while they stand closed and swings them itself, so the residential runtime's prompt and state do not know the door is open. If the player presses E mid-swing, the residential runtime takes over and the leaf snaps to its own state.
- public: expose the shop, pharmacy, school and kindergarten door records (placement or open()) in their registry.entrances entries. Life cannot animate those doors, so walkers use them only when the door is out of the player's sight or more than 45 m away.
- audio package (optional): small sounds 'cat_meow', 'sled_scrape' (runners on packed snow) and 'trolley_squeak' (shopping-trolley wheels). Life does not call them yet.
- tools/shot.mjs: page.screenshot's 30 s timeout still fails now and then on a loaded machine (a retry works). A built-in option to shoot against a production build would help. Today you can run `npx vite preview --outDir tools/out/build-<pkg>` and pass `--base`; this avoids the full reloads the dev server does when other agents edit files, and it made shots 3-5x faster here.

### knownIssues
- Walkers and the dog have no collision or obstacle avoidance. They follow nav-path lines, keep 0.25-0.8 m to the right, and step aside only for the player, so layout nav paths must be clear of cars, benches and fences. Two walkers may pass through each other when one overtakes the other; spawns keep them at least 6 m apart.
- While the layouts provide less than 300 m of walkway, walkers also use straight fallback routes along the PLAN.md streets. These are cut wherever something blocks them, but not around low obstacles under knee height.
- Composite models (sled, trolley, leashed dog) turn rigidly with the person at path corners.
- Fine-voxel models are drawn through the engine's LOD-1 material, so they have no voxel edge darkening, and their colour variation comes in 0.5 m cells. People are tuned to be seen at 15-120 m and look chunky closer than about 3 m.
- Tickets and keys are tiny (6-28 cm) and are mostly found through the inspect prompt.
- placeStoryAtEntrance assumes the plinth is flush with the door plane. Pass `out` if a facade differs.
- Entrances whose stub cannot be joined to a path by a clear link within 32 m are not used by walkers until the layouts add courtyard paths to them.
- Shop, pharmacy, school and kindergarten doors cannot be animated by life, so walkers go in or out of them only out of the player's sight or more than 45 m away.
- When life swings an enterable residential door, the residential runtime's state does not know the door is open. If the player uses the door mid-swing, it snaps to the residential runtime's state.
- The stock --viewer frames fine models too far away and too far apart (`--dist 0.3` helps). Use the life studio (`lifetest=1&studio=...`) instead.
- The runtime RNG is seeded, so the first spawn timings are the same every session (by design).

### apis
- placeStory(ctx, kind, { x, z, angle=0, y?, seed, bench?, along?, benchSnow=(0.25, or 0 on a bare street_bench_*_none), inspect=true, text?, tint?, lean?, post?, bowl=true, note=false, variant? }) -> { kind, placement, placements, interaction, text, x, y, z, angle } | null   // kind in STORY_KINDS: mittens, glove, sled, snowman, ticket, bread, frozen_bag, key, butts, cat, bicycle, yolka
- placeStoryAtEntrance(ctx, entrance, kind, { side=±1, along=2.6, out?, seed, ...placeStory opts }) -> same as placeStory   // entrance = a registry.entrances record
- placePerson(ctx, type, { x, z, y?, angle, frame: 0..3 | 'stand', tint?, visible=true }) -> Placement (dynamic, no collision)
- spawnWalker(ctx, { type?, rMin=8, rMax=60, visible=false, door=false }) -> walker | null   // runtime only, after init
- setPeopleDensity(k)   // multiplies the time-of-day pedestrian density; 0 = nobody
- lifeStats() -> { walkers, dog, graph, story, spawned, despawned, entered, exited, barks, doorsSwinging, ... }
- peopleTarget(minutes, snow) -> expected walker count
- exports: STORY, STORY_KINDS, PEOPLE, PERSON_TYPES, DOG_MODELS (from src/content/life/api.js)
- nav.js (internal): DOOR_KINDS { home, shop, shop24, public }, doorOpenAt(node, hour); rt.js (internal): doorVisual(entrance) -> 'swing' | 'open' | null, swingDoor(entrance, hold, { kind, sound })
