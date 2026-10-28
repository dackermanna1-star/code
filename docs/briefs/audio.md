# Brief: audio (`src/audio/**`)

Owner paths: `src/audio/**`, `tests/probes/audio-*.probe.ts`, `tests/unit/audio-*.test.ts`.

Implement `AudioSystem` (src/core/context.ts) as `class Audio` exported from
`src/audio/audio.ts` with `export async function createAudio(opts: { events: EventBus<GameEvents>;
settings: Settings }): Promise<Audio>` plus `setRoomResolver(fn: (p: Vec3) => RoomAcoustics | null)`
and `setOcclusion(fn: (from: Vec3, to: Vec3) => number /* 0 = blocked .. 1 = clear */)` hooks
(the integrator wires physics raycasts against structure + room lookup from plan.ts). Use the raw
Web Audio API (own AudioContext; read `docs/api-notes/vfx-audio.md` when available for verified
facts, incl. how to stop Babylon from creating its own audio engine — the integrator passes the
engine option). Must never throw when audio is unavailable or the context is suspended; one-shots
requested before `resume()` are dropped, loops start silently and fade in after resume.

Graph: voices (AudioBufferSourceNode → per-voice gain → lowpass (occlusion/distance air
absorption) → HRTF PannerNode (interior-tuned distance model, refDistance ~1 m, rolloff by
loudness class) → dry bus + reverb sends) → sfx/ambience/ui buses → master → DynamicsCompressor
/limiter → destination. Reverb: 2–3 ConvolverNodes with impulse responses generated at startup
(small bright tiled room ~1.1 s, medium living room ~0.55 s, dead bedroom ~0.3 s); send level per
voice from the SOURCE room's acoustics, wet mix crossfaded by LISTENER room. Voice cap ~48 with
priority (loudness × proximity), steal quietest; per-sound-id and per-island-id rate limits.
Distant/occluded sounds get lowpassed and quieter (walls you punched holes in let sound through —
that comes from the occlusion hook).

Sound bank (generated procedurally at startup, time-budgeted ≤ ~1.5 s total and spread across
frames/microtasks so the loading bar can update; cache AudioBuffers): physically-motivated
synthesis — modal synthesis for resonant impacts (partial ratio tables per profile: glass, ceramic,
stone, concrete, drywall, wood, metal, metalThin, plastic, electronics, soft, paper, flesh; base
frequency ∝ 1/size; decay times per material; strike noise transient shaped by hardness; 4–6
variations per profile × 3 size classes), plus generators: glass shatter (initial crack transient
+ dozens of randomized short high tinkles over 0.4–1.5 s + noise crash), tempered glass "dice"
shower (dense granular tinkle), ceramic shatter, wood crack/snap/splinter (crackle trains of
resonant clicks + low thump), drywall punch-through & crumble (dull thud + granular crumble +
dust hiss), concrete chip/crumble, metal clang/dent crunch (inharmonic long decays; crunch =
noise bursts through resonant filters), plastic crack/snap, screw ping (pitched metallic tick),
nail squeal-snap, glue crack, weld snap, mortar crumble, hinge creak/strain (frequency-modulated
friction), wood/drywall strain creaks for prying, debris ticks (tiny clicks pitched by size, used
for rattling as pieces settle), swing whooshes (filtered noise sweeps; heavier tool = lower,
slower), punch thud, kick thud, footsteps per floor material (laminate/hardwood, tile, carpet,
concrete) with variation, jump/land, grab/drop/throw cloth whoosh, door creak/latch click/slam,
light bulb pop, electrical spark crackle + buzz loop, water spray loop and drip, fridge hum,
city ambience (distant traffic rumble + occasional horn), wind loop (louder when windows are
broken: listen to fracture events of glass parts on exterior windows — the integrator may call
`setWindExposure(0..1)`; expose it). Additionally, if `public/assets/sounds/manifest.json` exists
(CC0 Kenney packs being downloaded by another agent), decode and LAYER matching samples
(impacts by material, footsteps, punches) with the synthesized ones for realism; never depend on
them existing.

Event mapping (subscribe in createAudio): impact (energy → gain on a log scale; pitch from
size; both materials layered; rate-limit by island ids), fracture (material/mode-specific break
sound scaled by brokenVolume/energy, + delayed debris rattle), chip, crack (crackle), dent
(metal crunch), bondBreak (kind-specific), split (creak + settle), toolSwing (whoosh), toolHit
(handled by impact/fracture mostly; add a sharp transient + 'ouch' thud for flesh on hard),
footstep, land, grab, throw, drop, strain (creak loop intensity by stress), feature (lightBroken
pop, sparks crackle, waterStart/Stop loop, powerOut (fridge hum stops, electrical clunk),
alarm chirp), fellOut (very distant delayed crash). Loudness must feel right: a sledgehammer
through drywall is loud; a falling pen is a tiny tick; footsteps subtle.

Verification: probes that (1) generate the bank and report timing and buffer counts, (2) play
a scripted burst of events headless without errors and with voices capped, (3) render a few
sounds through OfflineAudioContext to WAV files in your scratch area and check simple spectral
properties (glass centroid frequency > wood; larger size → lower pitch; shatter longer than knock).
Document the sound id list at the top of `src/audio/bank.ts`.
