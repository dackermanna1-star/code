# Audio engine spec (procedural, WebAudio, zero asset files)

File to implement: `src/audio/audioEngine.js` exporting `class AudioEngine`.
It replaces `NullAudio` (src/audio/audio.js) as `game.audio`. All sound must be
synthesized in code (oscillators, filtered noise, FM, waveshaping, envelopes),
pre-rendered into `AudioBuffer`s with `OfflineAudioContext` at init (several
random variants per sound, e.g. 3-6) so runtime playback is cheap.

## API (must match exactly)

```js
const audio = new AudioEngine(settings) // settings: {master, music, sfx, voice} 0..1
await audio.init()          // create AudioContext + pre-render all buffers (show progress via optional callback audio.onProgress(frac))
audio.resume()              // call on user gesture
audio.play(name, opts)      // one-shot. opts: {pos: {x,y,z} | THREE.Vector3 (world, optional => 2D),
                            //   vol=1, rate=1 (playbackRate multiplier, random +-5% added automatically),
                            //   owner (survivor object; if owner.isHuman, play as 2D 'local' sound, louder, no panning),
                            //   gun (bool: route to gunshot reverb send strongly), priority}
                            // returns a handle {stop()} or null. Unknown names: warn once, return null.
audio.loop(name, opts)      // looping sound. opts {pos, vol, rate}. returns {stop(fadeSec), set({vol, pos, rate}) }
audio.setListener(pos, forward, up)  // THREE.Vector3s, called every frame
audio.setVolumes({master, music, sfx, voice})
audio.setReverb(preset)     // 'outdoor' | 'room' | 'hall' | 'tunnel' | 'sewer' | 'stairwell' | 'safe' ; crossfade ~0.5 s
audio.setAmbience(name)     // background bed crossfade: 'city' | 'apartments' | 'subway' | 'sewer' | 'hospital' | 'rooftop' | 'safe' | null
audio.music.setState(state) // dynamic music, crossfading layers: 'none' | 'calm' | 'tension' | 'combat' | 'horde' | 'tank' | 'witch' | 'finale' | 'rescue'
audio.music.setIntensity(x) // 0..1 from the AI director, drives layer mix within a state
audio.music.stinger(name)   // one-shots: 'hordeIncoming' (the signature "horde is coming" cue), 'tank', 'witch', 'hunterNear', 'smokerNear', 'boomerNear',
                            //  'pinned', 'incap', 'death', 'safeRoom', 'chapterStart', 'finaleStart', 'rescueArrive', 'escape', 'objective'
audio.heartbeat(k)          // 0..1 low-health heartbeat loop intensity (0 = off)
audio.update(dt)            // housekeeping (voice culling, fades)
audio.stopAll()
```

Voice limiting: max ~40 concurrent one-shots; cull quietest/farthest; per-name
throttle (e.g. same name at most ~12 simultaneously, and zombie vocals ~8).
Distance model: inverse, refDistance ~2-4 m (scale by sound type: gunshots/explosions
large, footsteps small), maxDistance ~120 m, rolloff ~1.2. Use PannerNode
('HRTF' for nearby important sounds is optional; 'equalpower' is fine).
Occlusion is not required. Gunshots should sound punchy/loud with a reverb tail
that differs strongly between outdoor (slap echo, long) and indoor (tight room)
presets. Generate impulse responses procedurally (exponentially decaying
filtered noise with early reflections).

## Sounds (names that the game uses; ALL must exist)

Weapons: pistol, magnum, smg, silenced, shotgun, autoshotgun, rifle, rifle2, sniper, m60, launcher, minigun,
minigunSpin (loop), dryFire, magOut, magIn, slideRack, boltCycle, pump, shellInsert, reloadStart, casing (brass clink), shellDrop (plastic shell bounce),
Melee: swing (whoosh), meleeHit (sharp flesh chop), meleeHitBlunt (thud crunch), meleeWall (blunt metal on concrete), meleeWallSharp, shove (cloth/whoosh), shoveHit (body thump)
Impacts: impactConcrete, impactTile, impactWood, impactSoft, impactMetal (ricochet-ish ping), impactGlass, impactWater, bulletFlesh (wet thwack), headshot (wet crunch/pop), dismember (squelch + snap), gibSplat (wet splat), bodyFall (thud)
Explosives: explosion (big, with low rumble tail), molotov (glass smash + whoomp ignite), glass (bottle smash), beep (pipe bomb beep, short high tone), throw (whoosh), bounce (metal pipe clank), fireLoop (loop crackle), propaneExplode, gasCanIgnite, oxygenHiss (loop)
Common infected: zIdle (moans, groans, gurgles; many variants), zAlert (sharp snarl/shriek), zChase (running panting snarls), zHit (claw swipe hitting survivor: slap/scratch), zShoved (grunt), zBurn (burning scream), zDeath (death gurgle), hordeScream (a distant chorus of many infected screaming - used when a mob spawns), hordeRumble (loop: dense crowd footsteps/growls)
Hunter: hunterGrowl (low stalking growl, loop-able one-shot), hunterScream (pre-pounce shriek), hunterPounce, hunterShred (fast shredding hits)
Smoker: smokerCough (hacking cough), smokerTongue (wet whip/slap), smokerChoke (choking struggle), smokerDeath (puff cough)
Boomer: boomerGurgle (bloated belching idle), boomerVomit (vomit spray), boomerExplode (wet explosion), boomerBile (bile hitting)
Tank: tankRoar (huge bellow), tankStep (ground thud), tankPunch (massive impact), tankRock (rock ripping from ground), tankRockHit, tankDeath
Witch: witchCry (sobbing — must work as a loop via audio.loop('witchCry')), witchGrowl (warning snarls), witchScream (startled shriek), witchSlash
Survivors: stepConcrete, stepWood, stepMetal, stepTile, stepWater, stepCarpet, stepDirt, jump, land, hurtMale, hurtFemale (pain grunt - synthesized vocal-ish grunt),
heal (bandage/ripping tape), pills (pill bottle rattle), pickup (item grab), ammoPickup (ammo pile rummage), weaponPickup (gun handling clack), flashlight (click)
World: doorOpen, doorClose, doorBang (infected hitting door), doorBreak (door splintering), safeDoorOpen, safeDoorClose (heavy metal slam), glassBreak, woodBreak, metalImpact,
carAlarm (loop), alarm (loop, building fire alarm/bell), generator (loop, diesel generator), elevatorMotor (loop), elevatorDing, liftMotor (loop, hydraulic/scissor lift grind),
helicopter (loop: rotor thump with blade slap, pitch/volume via rate), radioStatic (short burst), radioBeep, buttonPress, metalGate (big rolling gate), water drips 'drip',
UI: uiClick, uiHover, objective (short chime), chapterComplete

Ambience beds (loops managed internally by setAmbience): city (wind, distant sirens, far gunshots/screams occasionally), apartments (creaks, distant
TV static, muffled screams), subway (low rumble, electrical hum, drips), sewer (flowing water, drips, pipe groans), hospital (fluorescent hum, distant
alarm beeps, monitors), rooftop (strong wind, distant city), safe (quiet room tone). Beds must be subtle and randomised (schedule occasional
one-off details, e.g. distant screams, rather than obvious short loops).

Music (synthesized, original, dark and orchestral-ish using layered detuned
saws/strings pads, low brass-like FM, taiko-like percussion from noise+sine
thumps, dissonant clusters). States crossfade over 1-3 s. 'horde' = urgent
pulsing strings + percussion; 'tank' = heavy, fast, aggressive drum-driven
theme; 'witch' = eerie high strings; 'calm' = sparse, sad piano/pad motif;
'tension' = low drones with occasional swells; 'finale' = driving and epic;
'rescue' = triumphant-but-sad resolution. Music must loop seamlessly (schedule
bars with the AudioContext clock, lookahead scheduler), and never clip
(use a compressor/limiter on the master bus).

## Constraints
- Pure JS ES module, no dependencies except optional `three` import for vector types (not required).
- Must not throw if AudioContext is unavailable (headless tests): degrade to no-ops.
- Init time for pre-rendering should stay reasonable (< ~6 s on a laptop). Render buffers
  lazily in batches if needed (e.g. render critical sounds first, the rest in the background with `setTimeout` chunks).
- Keep everything in `src/audio/` (you may split into several files). Do not modify other game files.
- Provide `src/audio/demo.html` + `src/audio/demo.js`: a standalone page (served by Vite at /src/audio/demo.html)
  with buttons to audition every sound, music state and ambience, for manual testing.
