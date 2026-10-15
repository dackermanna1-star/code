export const meta = {
  name: 'build-modules',
  description: 'Implement game subsystems (one agent each, disjoint dirs) then adversarially verify+fix each in headless Chromium',
  whenToUse: 'Pass args {modules:[keys], wave:"name", notes:"extra context"} to build a wave of subsystems',
  phases: [
    { title: 'Implement', detail: 'one senior agent per subsystem, own directories, sandbox + tests' },
    { title: 'Verify', detail: 'independent QA agent tests the subsystem adversarially in browser and fixes defects' },
  ],
}

// Scratch directory for raw downloads, Blender, screenshots (NOT in the repo). Pass args.sp with the
// current session's scratchpad path; the fallback is the original session's path.
const SP = (args && args.sp) || '/tmp/claude-0/-home-user-code/a38125ba-915d-511c-9109-7409ce62d7c3/scratchpad'

const COMMON = `
You are a senior engineer on a AAA-minded team recreating PUBG: BATTLEGROUNDS as a single-player browser game
(Three.js r186 WebGL2 + Rapier 0.21 WASM physics + TypeScript strict + Vite 7). Repo: /home/user/code. Do NOT git commit/push
(the lead commits between waves). Priority order from the client: gameplay fidelity & responsiveness > functional completeness >
visual quality > AI & physics realism > optimization & polish. "Do not claim features work unless implemented and tested. No TODO
placeholders, fake interactions or non-functional mockups for core features." When something is constrained by the browser,
implement the best functional alternative and document it.

READ FIRST (mandatory): docs/ARCHITECTURE.md, docs/DESIGN.md (gameplay numbers), docs/ASSETS.md, src/core/contracts.ts,
src/core/GameContext.ts, src/core/events.ts, src/core/Engine.ts, src/core/Physics.ts, src/core/Input.ts, src/core/Assets.ts,
src/core/Settings.ts, src/core/Debug.ts, src/core/math.ts, src/game/Game.ts, and the current src/<your module>/index.ts (a stub
or a previous implementation you are extending). Also skim the real implementations of modules already built (listed below) that you
depend on, so you integrate with them correctly.

OWNERSHIP: you own ONLY your module directories (listed in your spec) plus sandbox/<key>*.html, src/sandbox/<key>*.ts,
tests/<key>*.test.ts, tools/<key>*. Another agent may be working concurrently on a different module — never edit their files.
Contract changes (src/core/contracts.ts, events.ts, GameContext.ts): ADDITIVE ONLY (new optional members/interfaces/events), minimal,
and log each in docs/ARCHITECTURE.md "Contract changelog". If an additive non-optional member is truly required, update every
existing implementer/stub so the build stays green. Core files (Engine/Input/Physics/Assets/Settings/Debug/Game.ts): only small,
backwards-compatible fixes, logged in the changelog. Your module's entry point is install<X>(ctx) in src/<module>/index.ts —
keep that signature (Game.ts calls it).

ASSETS: public/assets/* is being produced concurrently by asset agents (characters/anims, weapons, attachments/gear/items,
vehicles, textures, vegetation/props, audio). Read public/assets/<category>/manifest.json + README.md when present. If an asset you
need is not there yet, implement a good procedural/fallback path AND the asset path (use ctx.assets.tryGltf / exists) so the game
upgrades automatically when files appear; re-check near the end of your work. Never write into public/assets yourself except files
your spec explicitly assigns to you.

TESTING (mandatory, iterate until it really works):
- Typecheck often: cd /home/user/code && npx tsc --noEmit 2>&1 | grep -E "src/(<your dirs>)|sandbox|tests/<key>" (others' WIP errors
  may appear; yours must be zero). At the end the WHOLE project must typecheck if the other concurrent module is not mid-edit.
- Run your own Vite dev server on YOUR PORT (see spec): (cd /home/user/code && npx vite --port <PORT> --strictPort > ${SP}/vite-<key>.log 2>&1 &)
  and kill it when done (pkill -f "vite --port <PORT>").
- Headless browser: node tools/shot.mjs "http://localhost:<PORT>/<page>" <out.png> <waitMs> --eval "<js>" (Chromium + SwiftShader
  WebGL: slow ~5-15 fps but correct; give it time; waitMs 8000-30000 for heavy scenes). Write richer Playwright scripts in
  tools/<key>-*.mjs when you need to simulate input over time (page.keyboard / page.mouse, or window.__game helpers + ctx.input.simulate()).
  Save screenshots under ${SP}/shots/<key>/ and LOOK at them with the Read tool. Judge them like a demanding art director / player.
- The full game boots via http://localhost:<PORT>/?quick=1&debug=1 (quick start without plane). Your sandbox pages are standalone
  scenes for focused tests. Register debug helpers with registerDebug() (core/Debug.ts) for automation.
- Write vitest unit tests for pure logic (tests/<key>*.test.ts; npx vitest run tests/<key>).
- Check the browser console logs from shot.mjs for errors/warnings from your code; fix them.

PERFORMANCE: target 60 fps at 1080p on a GTX 1660-class GPU on High with 80 combatants (see ARCHITECTURE budgets). Use
instancing/merging, LODs, culling, pooling; avoid per-frame allocations in hot paths; stagger expensive work.

WORK STYLE: this is a big job — plan first, then build incrementally, testing as you go. Keep a running progress log at
docs/progress/<key>.md (what's done, design decisions, known issues) so that work survives context compaction. Write clean,
well-structured code that reads like a professional game codebase (no giant god-files: split into cohesive files).

FINAL ANSWER: concise structured summary (what was implemented, how it was tested + evidence, known gaps, contract/core changes,
debug helpers, tips for the modules that depend on yours).
`

const SPECS = {
  world: {
    port: 5201,
    dirs: 'src/world/, src/render/',
    prompt: `MODULE: WORLD + RENDERING (key: world). Implements IWorld + IEnvironment (ctx.world, ctx.environment) and the render pipeline.
1) MAP LAYOUT (src/world/MapData.ts + helpers): a HANDCRAFTED Erangel-inspired 3072x3072 m island per docs/DESIGN.md §2 — authored
   data, not random scatter: coastline shape (main island + southern military island separated by a ~120-200 m channel, joined by TWO
   bridges), a river crossing the main island with 2-3 bridges, beaches, some cliffs, two hill ridges + a radio-tower hilltop, quarry
   pit, valleys, fields. 9-12 named locations with distinct identities (central dense town, school+apartments, port with container yard,
   military base, power plant/industrial, walled compound/prison or mansion, 3-4 villages/farms, ruins). Give them Eastern-European
   style names. For each location author BuildingLots (types from BUILDING_FOOTPRINTS; aligned to streets; realistic spacing; e.g.
   central town ~35-45 houses + church + police, school + 4 apartments, port ~8 warehouses + apartments, military ~6 barracks + 2 hangars
   + 4 watchtowers, villages 6-12 houses + barns/sheds; scattered farmsteads across the countryside) totalling ~220-320 buildings.
   Road network (asphalt highways between towns + dirt tracks to farms) as smooth splines; street grids inside towns. PropPlacements:
   fences around farms/yards, power poles along main roads, shipping containers in the port and military (lots of them, stacked), car
   wrecks, hay bales in fields, concrete barriers/sandbags at military checkpoints, guard rails on bridges. VehicleSpawns (~40 land on
   roads/towns/farms + ~8 water at coast/river). Loot tiers per location.
2) TERRAIN: generate the heightmap at load (2 m grid, 1537x1537; use a Web Worker so the main thread stays responsive; < 3 s target)
   from the layout: island mask with smooth beaches, layered noise for natural relief (domain-warped), authored ridges/hills,
   river carving with banks, flattened building lots (with smooth blend skirts), roads cut/filled into the terrain with banked
   shoulders, bridge approaches, quarry pit. Rapier heightfield collider (tag kind 'terrain', surface by getSurface).
   getHeight/getNormal bilinear and EXACTLY matching the rendered surface and collider.
   Rendering: chunked terrain (e.g. 128 m chunks) with distance LODs and no cracks (skirts or stitching), frustum culled. A splat
   material (shader via onBeforeCompile or custom ShaderMaterial with three's lighting/shadows/fog) blending grass/dry grass/forest floor/
   dirt/mud/rock(slope)/sand(beach, near water)/gravel/field textures from public/assets/textures (manifest) using a generated splat
   map + slope + height + macro noise; anti-tiling (stochastic/rotated sampling or multi-scale blending), triplanar for steep rock,
   normal maps. Fallback procedural colors if textures aren't there yet. Roads as terrain-conforming ribbon meshes with asphalt/dirt
   textures, worn edges and lane markings (polygonOffset to avoid z-fighting); bridges as real 3D structures (deck, railings,
   supports) with colliders.
3) WATER: ocean surrounding the island + river (+ ponds) with a high-quality water shader (animated normal maps/Gerstner-ish waves,
   fresnel reflection of sky/env map, sun specular, depth-based color & shoreline foam/transparency), underwater view (fog/tint when the
   camera is below the surface). getWaterHeight() for swimming/boats. Water colliders are not solid (swimming is handled by characters).
4) SKY / TIME OF DAY / WEATHER (IEnvironment): physically-based sky (three Sky addon or custom scattering) with sun (+ moon/stars at
   night), cloud layer (procedural animated clouds), sun/ambient light colors derived from time of day, PMREM environment map
   regenerated when time/weather changes (throttled), height/distance fog matched to sky, weather states clear/cloudy/overcast/rain/fog
   with smooth transitions (rain particles around camera + wet look darkening via material roughness tweaks is optional),
   visibility/fogDistance values for AI. Optional HDRIs from public/assets/hdri for reflections.
5) LIGHTING & SHADOWS: CSM (three/examples/jsm/csm/CSM.js) cascaded sun shadows following the camera with settings-driven cascades/
   distance/map size; expose a helper for other modules to register materials with CSM (CSM requires csm.setupMaterial(material)) —
   e.g. export function registerShadowMaterial(m) from src/render and document it. Good ambient (hemisphere + IBL).
6) POST-PROCESSING (src/render/): pmndrs 'postprocessing' EffectComposer installed via ctx.engine.setRenderFn: N8AO ('n8ao' package,
   N8AOPostPass) SSAO, subtle bloom, SMAA/FXAA, tone mapping (AgX or ACES) + filmic color grading (PUBG look: natural, slightly
   desaturated, warm sun / cool shadows, no oversaturation), vignette, optional ADS depth-of-field hook; all toggled by graphics
   settings (listen to 'settings:changed'); render scale; graphics presets apply live. Verify the composer works with three r186
   (check package peer versions; if incompatible, write the needed passes yourself).
7) MAP IMAGE: getMapImage() returns a 2048x2048 canvas: a PUBG-style top-down map (hillshade relief, land colors by surface, water,
   roads, building footprints (from world.lots + BUILDING_FOOTPRINTS), maybe forest tint; no labels — the UI draws names).
8) Vegetation/buildings support: getTreeDensity (authored forest regions + noise, 0 on roads/lots/water/fields/beaches), isReserved
   (roads, lots, bridges, props, with margin), getGroundCover (meadows high, fields high, forest floor medium, roads/sand 0).
9) DEBUG: register helpers: teleport(x,z) (moves ctx.player if present), setTime(h), setWeather(w), and a free-fly debug camera:
   debugCam(x,y,z,yawDeg,pitchDeg) sets debugState.freeCam=true and places ctx.camera (plus ?flycam=1 WASD+mouse fly mode). Others
   rely on debugCam for screenshots. Also screenshotTour() that returns a list of interesting viewpoints (towns, bridges, coast).
SANDBOX: sandbox/world.html (full world + fly camera). Validate visually from many viewpoints (ground level in a town lot area,
forest edge, coastline/beach, river+bridge, hill top vista, aerial view, sunset, overcast/fog, night) and fix what looks wrong or fake.
Performance: measure frame time in the sandbox (SwiftShader is slow — reason about draw calls/triangles via ctx.engine.stats and
keep terrain + water + sky under ~150 draw calls, ~1.5M tris at High).`,
  },
  characters: {
    port: 5202,
    dirs: 'src/characters/',
    prompt: `MODULE: CHARACTERS + CAMERA + PLAYER CONTROL (key: characters). Implements ICharacters (ctx.characters), the Character class
(ICharacter), ICameraRig (ctx.cameraRig) and PlayerController. Bots will drive the exact same Character through CharacterIntent.
1) MOVEMENT (docs/DESIGN.md §3 numbers): Rapier KinematicCharacterController + capsule (radius 0.35; stand 1.8 / crouch 1.25 / prone
   ~0.6 high), autostep for stairs (~0.45 m), slope limit ~50°, snap to ground; acceleration/deceleration/inertia; speeds per stance and
   mode (walk/run/sprint/crouch/prone/back/strafe/ADS/firing/weapon weight/boost bonus); stance transitions with timings and collision
   checks (cannot stand up under a low ceiling; prone blocked on steep slopes / in tight spots); jump; VAULT (Space near 0.5-1.1 m
   obstacles: animated arc over, ~0.6 s) and CLIMB onto ledges up to 2.1 m (shape/ray probes); LEAN Q/E (eye + upper body offset,
   blocked by walls); fall damage via ctx.combat.applyDamage({type:'fall'}) (combat may be a stub — if so, temporarily apply directly
   via applyHealthDelta in a clearly-marked fallback); swimming when water depth > ~1.3 m (world.getWaterHeight): surface swim, dive
   (Ctrl/C) & surface, breath + drowning, no weapons; FREEFALL + PARACHUTE flight model (DESIGN §1: freefall glide/dive, manual (F) +
   auto deploy at 120 m AGL, parachute steering/pitch, landing) driven by setMoveState('freefall') from the match module; KNOCKED
   (DBNO) crawl; dead state; vehicle seat state (follow vehicle.getSeatTransform each tick; exit placement) — vehicles are a stub now,
   design for it; 'plane' state (hidden, follows a transform set by match).
2) CHARACTER VISUALS & ANIMATION: load the character model(s) + animation clips listed in public/assets/characters/manifest.json
   (asset agent is producing them right now; fall back to three.js Soldier.glb from https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/
   examples/models/gltf/Soldier.glb only if needed — download into public/assets/characters/fallback/ if you must). Build an
   animation controller: per-stance 8-direction locomotion blend (walk/jog/sprint, crouch, prone) with playback rate synced to actual
   ground speed (manifest speed_mps) so feet don't slide; smooth start/stop/turn; upper-body weapon layer: PROCEDURAL two-bone IK so the
   right hand holds the weapon grip and the left hand the weapon's grip_support node, weapon positioned by aim (pitch/yaw), with
   rifle/pistol/melee/throwable/unarmed holding styles; aim offset distributed over spine bones; lean; procedural recoil kick;
   reload/heal/throw/switch gestures (procedural if no clips: weapon tilt + left hand to magazine etc.), synced to action progress;
   foot IK on slopes/stairs (raycast feet, pelvis adjustment); jump/fall/land; swim; freefall/parachute poses; knocked crawl; seated in
   vehicle; hit reactions (additive procedural flinch by direction); death → RAGDOLL (Rapier rigid bodies + joints for ~11 bones,
   initialised from the current pose & velocity, sleeping after rest; not rubbery) or a good death clip blend if ragdoll proves
   unstable. Animation LOD: full rate within ~40 m, reduced rates beyond, LOD1 mesh beyond ~50 m (manifest lod1), cull beyond view.
   Equipment visuals from public/assets/gear (helmet/vest/backpack levels → attach to bones; fallback simple shaped meshes) and weapons:
   held weapon in hands (use ctx.combat.createWeaponModel?.(w) if implemented, else load w.def.model), slung primaries on the back,
   pistol in a thigh holster. Character variants: tint/outfit variation per character. Team marker hooks.
   Footsteps: emit 'character:footstep' events (surface from physics ColliderInfo/world.getSurface) on animation foot contacts plus
   ctx.events 'noise' with DESIGN §8 hearing radii; also jump/land/stance/swim/parachute events.
3) HITBOXES: getHitboxes() world-space capsules per zone (head, neck, chest, stomach, pelvis, upper/lower arms (zone 'arm'), hands,
   thighs/shins ('leg'), feet) computed from the posed skeleton every fixed tick (cheap path for far characters: transform a cached
   pose), correct for all stances incl. prone, knocked, lean, in vehicles.
4) CAMERA RIG (ICameraRig): PUBG-style TPP: camera behind/right of the shoulder, orbiting with mouse; RMB-hold = closer
   over-the-shoulder aim; ADS (RMB click per settings.aimMode 'hybrid') moves the camera to the weapon sight (weapon 'sight_eye'
   node / optic 'eye') with FOV zoom from ctx.combat.getOptic?.(w) (2x..8x magnification); FPP mode (V toggles; camera at the head,
   head/hair hidden, body visible, weapon visible in front); camera collision (sphere cast to avoid clipping into walls/terrain);
   free look (Alt) without turning the body; smooth stance height transitions; recoil camera kick (from combat.updateWeaponHandling
   result); camera shake API; vehicle camera (orbit behind vehicle, passenger aim); freefall/parachute camera; spectate(c) mode;
   deathcam; menu/plane modes; respects debugState.freeCam (do nothing then). Render-rate mouse look for responsiveness; character
   body interpolated between ticks (alpha) — no jitter.
5) PLAYER CONTROLLER: input → CharacterIntent each fixed tick (bindings from core/Input; hold/toggle semantics per Settings: toggle
   crouch, aimMode hybrid, sensitivity per scope/ADS, invert Y); mouse wheel weapon cycle; number keys slots; 7-0 quick heals;
   interaction: ctx.interactions.best(player) → expose getFocusedInteractable() (for UI prompt) and handle hold-to-interact (holdTime)
   with progress in player.action. Disabled while ctx.ui.capturesInput.
6) REGISTRY: ICharacters with spawn/remove/all/byId/queryRadius (spatial hash); the Character fixedUpdate order: intent → action/
   stance/movement → combat.updateWeaponHandling (ctx.combat) → hitboxes. Respect DamageInfo/lifeState transitions (setLifeState
   called by combat/match).
SANDBOX: sandbox/characters.html: test arena (flat ground, ramps 20-45°, stairs, boxes 0.5/0.8/1.1/1.6/2.0/2.5 m for vault/climb, a low
ceiling tunnel for crouch/prone, a pool for swimming, a 40 m tower for fall damage, a 600 m drop for freefall/parachute) + the player
+ 6 dummy bots driven by scripted intents (walking circles, crouching, prone, strafing). Use the real world module if it's ready
(?world=real) else the stub. Record evidence: screenshots of each stance/animation from TPP and FPP, hitbox debug overlay
(__game.showHitboxes(true)), movement speed measurements vs DESIGN numbers (automated test script asserting speeds ±10%), vault/
climb success, fall damage numbers, swim, parachute landing.`,
  },
  combat: {
    port: 5203,
    dirs: 'src/combat/',
    prompt: `MODULE: COMBAT (key: combat). Implements ICombat (ctx.combat): weapons, recoil, spread, ballistics, hit detection,
damage/armor/knock rules, throwables, melee, weapon models & optics.
1) DATA: WeaponDefs for every weapon in docs/DESIGN.md §5 (30 guns + 4 melee + 4 throwables) with all stats: damage, rpm, fire
   modes, burst, mag/extended mag, reload times (tactical/empty/per-shell), bolt/pump cycle times, muzzle velocity, drag coefficient,
   range/falloff, hit-zone multipliers by class, hip spread params, ADS spread, movement spread penalties, RECOIL PATTERN (vertical
   kick per shot, horizontal drift pattern with randomness, first-shot multiplier, recovery rate, camera kick vs weapon kick split),
   sway, ADS time, weapon weight/move speed multiplier, sound class, attachment slots & compatible attachment ids. Attachment defs with
   stat modifiers per DESIGN §5 (compensator, flash hider, suppressor (quieter: affects noise radius + audio id + no muzzle flash),
   grips, mags (ext/quickdraw/ext-qd), stocks, optics with zoom levels). Weapon defs' model field = assets/weapons/<id>.glb (asset
   agents are producing them: read public/assets/weapons/manifest.json; fall back to a clean procedural model if a file is missing).
2) WEAPON HANDLING: updateWeaponHandling(c, dt) called by the Character every fixed tick: trigger logic per fire mode (semi requires
   release, burst, auto), RPM timing with sub-tick accumulation, bolt/pump cycling, dry fire, auto-reload on empty when trigger
   pressed again, reload (tactical vs empty; per-shell for shotguns/bolt actions with interrupt by firing; ammo from c.inventory;
   uses c.setAction({kind:'reload',...})), weapon switching timings (c.equipSlot + action 'switchWeapon'), fire mode toggle, zeroing
   (PageUp/Down for SR/DMR via intent? add to CharacterIntent additively if needed), hold-breath for scoped sway (Shift while ADS).
   Returns recoil offsets for the camera; the player must be able to control sustained fire by pulling down; bots get the same recoil.
   Shots originate from the camera/eye ray in TPP/FPP but are corrected so that a muzzle obstruction is respected (PUBG-like: bullet
   from muzzle toward the aim point; if a wall is between muzzle and aim point it hits the wall).
3) BALLISTICS: pooled projectiles simulated each fixed tick with gravity + drag + travel time; segment test vs world
   (ctx.physics.raycast Mask.World) and characters (broadphase via ctx.characters.queryRadius on the segment, then rayCapsule on
   getHitboxes()); closest hit wins; ignore the shooter; penetration through thin 'wood'/'glass' (ColliderInfo.penetration) with damage
   loss; glass: call (info.owner as IBreakable).break(); vehicles: (ctx.vehicles.byCollider(handle)).applyDamage; impacts → ctx.fx
   impact/bulletHole/blood + 'projectile:hit' event; near misses within ~3 m of a character → 'projectile:nearMiss' (flyby audio + AI
   suppression); water entry slows/stops bullets; tracers (ctx.fx.tracer) for some rounds; max lifetime/distance.
4) DAMAGE: applyDamage(target, info) implementing DESIGN §4/§5: zone multipliers per weapon class, helmet/vest reduction & durability
   loss & breaking (update target inventory equipment durability + 'inventory:changed'), falloff by distance, knock vs kill using
   ctx.match.shouldKnock(target) (match may be a stub: treat as solo), knocked targets take damage to knockHealth, finishing a knocked
   enemy = kill, credit attacker (for kill feed: KillRecord with headshot, distance, weapon) → 'combat:damage', 'combat:knock',
   'combat:kill' events; fall/zone/drown/fire/explosion/vehicle damage types (zone & fall bypass armor). Friendly fire on (PUBG).
5) THROWABLES: frag (cookable 5 s fuse, throw arcs overhand/underhand by intent, bouncing physics vs world with restitution, explosion
   damage with distance falloff + LOS check (walls protect), explodes in hand if overcooked), smoke (fx.smokeCloud; contributes to
   AI vision via fx), stun (blind/deafen by distance + facing; player gets fx.flashbang + audio muffling event), molotov (shatters,
   spreading fire area damage over time, ignites on characters; fx.fire). Throw intent flow: hold fire to cook (pin pulled), release
   to throw; RMB toggles underhand. Visible arc preview for the player is a nice extra.
6) MELEE: pan/machete/crowbar/sickle swings (quick sweep test in front, damage per DESIGN, head x1.5), also punching unarmed (fists:
   10 dmg), pan on the back/hip blocks bullets to the pelvis/back (optional).
7) WEAPON MODELS & OPTICS: createWeaponModel(w) → Object3D with weapon GLB + mounted attachment GLBs (public/assets/attachments/*:
   scopes at rail_top, muzzle devices at 'muzzle', grips under the handguard, ext mags replace 'mag' scale) and guaranteed child
   empties muzzle/grip_support/sight_eye (sight_eye moves to the optic 'eye' node when an optic is mounted). Red dot/holo get an
   emissive reticle on the lens (visible when ADS); magnified scopes: getOptic(w) returns zoom for the camera + UI scope overlay.
   Muzzle flash via ctx.fx.muzzleFlash at the muzzle (hidden when suppressed), shell ejection ctx.fx.shellEject.
8) EVENTS & NOISE: 'weapon:fired' (audio picks class/suppressed sounds), 'weapon:reload' phases, 'noise' events (gunshot radius 600 m
   / suppressed 120 m / explosion 400 m), 'explosion', 'throwable:bounce'.
9) DEBUG helpers: give(weaponId, attachments[]) to the player, spawnTarget(dist) dummy, infiniteAmmo(bool), plus a firing-range
   sandbox: sandbox/combat.html with targets at 10/25/50/100/200/300/500 m, steel plates, wooden walls & glass panes for penetration,
   a dummy with helmet/vest levels, recoil pattern visualizer (spray at a wall & screenshot the bullet holes), TTK table printout.
   Unit tests: damage math (zone/armor/falloff), recoil pattern determinism, ballistic drop vs distance table (e.g. Kar98k drop at 300 m),
   fire rate timing.`,
  },
  items: {
    port: 5204,
    dirs: 'src/items/',
    prompt: `MODULE: ITEMS, INVENTORY, LOOT (key: items). Implements IItems (ctx.items) incl. ILoot.
1) ITEM DEFS for everything in docs/DESIGN.md §4/§5: ammo types, heals, boosts, throwables, all attachments (ids consistent with the
   combat module's attachment ids — read src/combat/ if it exists; otherwise define the canonical attachment id list in
   src/items/defs and document it so combat uses the same ids), helmets/vests/backpacks L1-3, fuel can, and weapons (category
   'weapon', id = weapon def id; ammo/ground-model info). Weights per DESIGN. Model URLs (public/assets/items|gear|attachments|weapons
   manifests). Icons: generate PNG icons for every item into public/assets/icons/<id>.png (render the GLB models offscreen in headless
   Chromium with a consistent 3/4 view + transparent background; procedural silhouettes as fallback) — you own public/assets/icons/.
2) INVENTORY (IInventory): capacity = 20 + vest 50 + backpack (150/200/250); weight-based; stacking; weapon slots (2 primaries,
   pistol, melee, throwable slot showing the selected throwable type); equipment with durability; attachments stored on weapons;
   swap/drop logic; auto-move compatible attachments when swapping weapons; ammo top-up rules; capacity changes when dropping a
   backpack (overflow dropped); notifyChanged → 'inventory:changed'. Equip rules (pick up a helmet when wearing one → swap & drop old).
3) CONSUMABLES: useDuration/canUse/applyUse per DESIGN §4 (bandage/first aid caps at 75, medkit 100, boosts), the use flow
   (character action 'useItem' with progress; moving restrictions; cancel), and a BOOST system that ticks every character: decay,
   heal over time, speed bonus exposure (export a helper the character module can read: e.g. getBoostSpeedMultiplier(c)).
4) LOOT (ILoot): populate(seed, density) distributing loot over ctx.buildings.getLootSpawnPoints() + outdoor points, with PUBG-like
   spawn tables (weapon + matching ammo clusters, attachments, armor, heals, throwables), weighted by location lootTier (world
   locations) and building type; crate-only items excluded; ~5-8k items for a full map is fine. Ground items: real 3D models (shared
   geometry; InstancedMesh per model or merged batches; rendered only within ~120 m, highlighted/outlined subtly when focused), laid
   flat on the surface; registered as Interactables (F: pick up; label "Pick up M416"); itemsNear() for the UI vicinity panel & bots;
   pickUp() handling all categories (weapons fill an empty slot or swap the active slot, armor swaps, attachments auto-attach if
   enabled, ammo/heals stack up to capacity leaving remainder on the ground); drop(); death boxes (createDeathBox: crate model with
   everything the character carried, interactable, opens a loot list for the UI — expose its contents as ground items with a shared
   container id or a dedicated API documented for UI); AIRDROPS (spawnAirdrop: crate descends slowly by parachute from ~300 m with red
   smoke flare on landing (ctx.fx.smokeCloud), contains crate weapons AWM/Groza/Mk14 + L3 gear + ghillie/adrenaline; emits events).
5) DEBUG helpers: give(itemId, count), lootStats() (counts by category/tier), showLootAround(r).
SANDBOX: sandbox/items.html: a room/yard with spawned loot of every item, the player picks things up (automate with simulated F/
interact + inventory assertions in a Playwright script), inventory capacity edge cases, consumable timings and effects (assert HP
results), death box creation + looting, airdrop fall. Unit tests: inventory capacity/stacking/swap logic, consumable rules, loot table
distribution sanity.`,
  },
  buildings: {
    port: 5205,
    dirs: 'src/buildings/',
    prompt: `MODULE: BUILDINGS + WORLD PROPS (key: buildings). Implements IBuildings (ctx.buildings). Consumes ctx.world.lots and
ctx.world.props (the world module is implemented — read src/world/ to understand lots/props/groundY and the shadow-material helper).
1) PROCEDURAL BUILDING GENERATOR for every BuildingType (contracts.ts BUILDING_FOOTPRINTS — must fit the footprint): seeded floor plans
   (rooms, hallways, kitchens, bathrooms, bedrooms, offices, classrooms, garages), realistic dimensions (wall 0.2-0.3 m thick, floor
   height ~3 m, doors 0.9x2.1 m, windows with sills), exterior walls with door/window openings, interior partitions with doorways, floors
   and ceilings, STAIRS (straight or U-shaped; walkable by the kinematic controller: max step 0.2 m or ramps hidden under step visuals;
   railings), roofs (gabled with overhangs + tiles/corrugated; hip; flat with parapets and roof access hatch/stairs for apartments,
   school, police, hospital), balconies, porches, chimneys, gutters, window frames, glass panes (breakable: IBreakable owner on a
   Layer.Glass collider; shatter on bullets via fx/'glass:break'), trims and corner details, color/material variation per building
   (brick, plaster, wood siding, painted concrete; PBR sets from public/assets/textures manifest with procedural fallback), interior
   materials (wallpaper/plaster/tiles/wood floors/concrete). Type-specific architecture: barns (big doors, hay loft), warehouses (roller
   doors, catwalks), hangars (arched roof), watchtowers (ladder/stairs + platform with railing), church (tower), school (long corridors,
   classrooms, 3 floors), apartments (stairwell + flats per floor), police, hospital, gas station (canopy + shop), ruins (broken walls).
   Interiors furnished per room type from public/assets/props (manifest) with procedural fallbacks (beds, tables, chairs, sofas,
   shelves, cabinets, kitchen counters, fridges, toilets, crates, lockers, desks) — placed against walls, not blocking doors, with
   colliders where they block movement.
2) DOORS (IDoor): hinged doors that animate open/close (~0.35 s), kinematic colliders that follow (Layer.Door), interactable via
   ctx.interactions ("Open door"/"Close door"), AI can open them (door.open()), emit 'door:toggle' + 'noise'. Doors swing away from
   the opener.
3) COLLISION: walls/floors/ceilings/stairs/roofs/furniture as Rapier static colliders tagged {kind:'building', surface: concrete/wood/
   metal/tile...} with penetration values for thin wood walls; colliders must exactly match visuals (no invisible walls, no holes).
4) PERFORMANCE: ~250-320 buildings. Merge geometry per material per spatial chunk (e.g. 128 m) to keep draw calls low; separate
   interior batch per chunk that is hidden beyond ~180 m; shared geometries/instancing for furniture/props; frustum culling per chunk;
   shadow casting for exteriors. Build at load in < ~4 s total (spread/yield to keep the loading screen responsive).
5) LOOT POINTS: getLootSpawnPoints(): realistic positions on floors, tables, shelves in every room (indoor) + some at porches/
   garages (tier by building type: military/police/hospital/school higher).
6) NAV GRAPH: getNavGraph(): nodes per room/hallway/stair landing/doorway with exterior nodes just outside each exterior door,
   edges kind walk/stairs/door(doorId); must be walkable by the character controller. buildingAt()/isIndoors() via room volumes.
7) WORLD PROPS: instantiate ctx.world.props (fences (wood / chain-link, segmented along length), power poles with sagging wires,
   shipping containers (stackable, some open & enterable), car wrecks, hay bales, jersey barriers, sandbags, guard rails, street lamps,
   signs, dumpsters, crates/barrels/pallets) using public/assets/props models (instanced) with procedural fallbacks + colliders.
8) DEBUG helpers: listBuildings(), buildingInfo(id), showNav(true), gotoBuilding(type) (teleport the player/camera there).
SANDBOX: sandbox/buildings.html: a gallery row of every building type on flat ground + fly camera; plus the full world view. Evidence:
exterior screenshots of each type (day light), interior screenshots (living room, stairs, apartment stairwell, warehouse, school
corridor), walk test: the player (characters module is implemented — read src/characters) walks up every staircase type and through
doors (automated script asserting position reaches upper floors), draw-call count for a town view.`,
  },
  vegetation: {
    port: 5206,
    dirs: 'src/vegetation/',
    prompt: `MODULE: VEGETATION + ROCKS (key: vegetation). Implements IVegetation (ctx.vegetation). Uses ctx.world.getTreeDensity,
getGroundCover, isReserved, getHeight/getNormal/getSurface/getWaterHeight (world module is implemented — read src/world/ incl. the
shadow-material/CSM helper and how terrain chunks are organized).
1) TREES: species from public/assets/vegetation (manifest: conifers, birch/deciduous, dead trees; LOD0/LOD1/LOD2 impostor cards) with
   procedural fallback (e.g. @dgreenheck/ez-tree is on npm, or your own generator) — realistic, not lollipop trees. Distribution:
   Poisson-disc / jittered grid by getTreeDensity with species by region (pines in forests, birches at edges, deciduous in villages),
   scale/rotation/tint variation, no trees on roads/lots/water (isReserved) or steep cliffs. Count: dense forests (target 25-50k trees
   on the map). Rendering: chunked InstancedMesh per species per LOD with distance-based LOD selection updated incrementally (not every
   frame for all), cross-fade or dithered LOD transitions, impostors beyond ~250 m up to view distance, wind sway vertex animation
   (trunk bend + leaf flutter) via onBeforeCompile preserving shadows/fog, alpha-tested leaves with alpha-to-coverage when MSAA is not
   used (or dithered), correct shadow casting for LOD0/LOD1 near the camera (keep shadow cost bounded), leaf translucency-ish
   lighting. Colliders: trunk cylinders/capsules for every tree (Rapier static, kind 'tree', surface 'wood') so bullets and vehicles
   are stopped by trunks.
2) BUSHES & UNDERGROWTH: bushes/shrubs, ferns, flowers, saplings, logs and stumps (logs/stumps with colliders), instanced, chunked,
   culled at ~150-200 m; bushes have NO movement collider but provide concealment (foliageOcclusion).
3) GRASS: GPU-instanced grass blades/clumps around the camera within settings.graphics.grassDistance with density from getGroundCover,
   terrain-height conforming (sample height on CPU per patch or via a heightmap texture), wind animation, color variation matching the
   terrain splat (dry/lush), distance fade; crop fields (wheat) as taller grass variant in field areas; cheap (target < 2 ms GPU).
4) ROCKS: boulders/rock clusters/cliff pieces from public/assets/props/rocks (manifest) placed on slopes, hills, coastlines, quarry,
   forests; with colliders (convex hull or simplified boxes/spheres), kind 'rock'.
5) QUERIES: foliageOcclusion(from,to) — spatial hash of bush/crown spheres + tall grass/crop fields → 0..1 sight blocking along the
   segment (cheap: AI calls it often); treesNear(pos, r) for AI cover search.
6) SETTINGS: foliageDensity / grassDistance / viewDistance / shadowQuality applied live.
7) DEBUG: vegStats() (instances per type, draw calls), showColliders(true).
SANDBOX: sandbox/vegetation.html (full world + fly camera). Evidence: screenshots of dense forest interior at eye height, forest edge from
a field, hill vista showing LOD/impostor transitions (no popping eyesores), grass close-up with wind, birch grove, coastline rocks,
quarry; draw call/triangle counts at a forest viewpoint; walk/drive collision test against trunks.`,
  },
  fx: {
    port: 5208,
    dirs: 'src/fx/',
    prompt: `MODULE: FX (key: fx). Implements IEffects (ctx.fx) incl. smokeDensityAlong.
1) PARTICLE SYSTEM: high-performance pooled GPU-instanced billboard particles (one or few draw calls per material: additive and
   alpha-blended lit), procedurally generated texture atlas (smoke puffs with soft noise, sparks, fire flipbook, debris chunks,
   blood droplets/mist, dust, water droplets, muzzle flash star shapes) generated at startup into a canvas/DataTexture (or authored
   PNG files you create in public/assets/fx/ — you own that folder), soft particles if a depth texture is available from the
   render pipeline (read src/render/ — coordinate via an exported hook; fallback without), simple lighting for smoke (sun direction
   from ctx.environment), sorting for alpha particles, quality scaling by settings.graphics.effectsQuality, hard caps.
2) EFFECTS: muzzleFlash (bright short-lived star + side flashes + brief point light (pooled lights, few at once) + smoke wisp; scaled
   by weapon class; suppressed → tiny puff only), tracer (stretched bright streak segment traveling along the path, fades),
   impact by surface (dust puffs for dirt/grass/sand, sparks + small debris for metal/concrete/rock, splinters for wood, shards for
   glass, splash for water, foliage leaf bits), blood (PUBG-style red mist puff at hit + small droplets; amount by damage),
   bulletHole decals (pooled oriented quads with polygonOffset, surface-specific textures, ~300 max, fade old), explosion (flash light,
   fireball flipbook, shockwave ring, debris, lingering dark smoke column, scorch decal; emit cameraRig.shake by distance),
   smokeCloud (dense, voluminous, slowly expanding soft cloud of large lit sprites lasting duration ~40 s, wind drift; registers a
   smoke volume used by smokeDensityAlong which AI vision uses — must actually block sight convincingly), fire (molotov: spreading
   flame patches + embers + smoke + flickering light, duration), waterSplash, dust (vehicle wheels, landing), shellEject (small brass
   casing meshes (instanced) with simple physics bounce off the ground/world via ctx.world.getHeight or physics raycast, pooled),
   flashbang (full-screen white overlay that fades by intensity — DOM or post pass; plus 'fx:flashbang' event for audio).
3) WEATHER HELP: if the world module lacks rain particles, provide rainAroundCamera(intensity) and wire it to ctx.environment.weather.
4) Robust: never throw; graceful when the pool is exhausted; zero per-frame allocations in update.
5) DEBUG: fxTest(kind) spawns each effect in front of the camera; fxStats().
SANDBOX: sandbox/fx.html: a test range with surfaces (concrete wall, metal plate, wooden wall, dirt, water pool, glass) and buttons/
automation spawning every effect; capture screenshot sequences (several frames over time) for each effect and LOOK at them —
iterate until they look convincing (not cartoonish blobs), with sensible scale in meters.`,
  },
  vehicles: {
    port: 5207,
    dirs: 'src/vehicles/',
    prompt: `MODULE: VEHICLES (key: vehicles). Implements IVehicles (ctx.vehicles) and IVehicle per docs/DESIGN.md §6.
1) PHYSICS: Rapier dynamic rigid-body chassis (realistic mass 900-2000 kg, center of mass low, inertia) with a raycast-suspension
   vehicle model (Rapier DynamicRayCastVehicleController or your own per-wheel raycast spring-damper with a slip-based tire friction
   model — choose what gives the most believable, controllable result): engine torque curve, automatic gearbox with gear shifts,
   drivetrain per vehicle (UAZ 4WD, Dacia RWD/FWD, buggy RWD), speed-sensitive steering with steering speed limits, brakes, handbrake
   (rear lock → drifts), weight transfer, traction loss and power slides on dirt/grass vs asphalt (surface from world.getSurface/
   ColliderInfo), downforce-free, rollover possible (but not on every bump), air control (motorcycle pitch with Ctrl/Space or the
   pitch control), boost (Shift; uses more fuel), top speeds per DESIGN. Motorcycle: two wheels with stabilization assist and lean
   visuals; boats (PG-117): buoyancy from world.getWaterHeight with multiple float points, water drag, propeller thrust only when in
   water, beaching behaviour. Collisions with buildings/trees/rocks/vehicles are solid and weighty (big impulse → damage + 'vehicle:
   collision' event); running over characters → ctx.combat.applyDamage({type:'vehicle'}) scaled by speed (no damage < ~10 km/h).
2) MODELS: public/assets/vehicles (manifest: wheels/seats/steering nodes; asset agent producing them now) with procedural fallback
   models of decent quality; wheel spin/steer/suspension compression visuals; steering wheel turns; headlights (night) + brake lights;
   damaged look as HP drops (smoke at < 30% HP, fire at < 10%), explosion (fx.explosion, 'explosion' event, damage around, burnt wreck
   remains), tire damage optional.
3) SEATS & INTERACTION: Interactables to enter ("Drive UAZ", "Ride"), seat switching (intent.switchSeat / F1-F4 bindings), exit
   (find a free spot beside the vehicle; exiting at speed hurts per DESIGN), occupants attached via character.setVehicle (read
   src/characters to integrate: the character follows getSeatTransform and the camera has a vehicle mode); driver controls from
   intent.vehicle; passengers may shoot (character module handles aiming, you expose canShoot). Vehicles are also hit by bullets
   (ColliderInfo owner = vehicle; byCollider) and explosions.
4) FUEL & HEALTH: consumption by throttle/rpm, empty → no engine power; refuel(amount) with fuel cans (items module); health per DESIGN.
5) AUDIO HOOKS: emit events / expose rpm, speed, skid amount, so the audio module can drive engine loops (add an exported per-vehicle
   telemetry getter) + 'noise' events (vehicle 250 m radius) for AI.
6) SPAWNING: spawnAll(seed) from ctx.world.vehicleSpawns with a PUBG-like mix (UAZ/Dacia/buggy/motorcycle by area; boats on water
   spawns), not inside buildings/trees, settled on the ground. AI helpers: a function to compute steering/throttle toward a target
   point (useful for the AI module's driving), documented.
7) DEBUG: spawnVehicle(kind) in front of the player, enterNearest(), vehicleTelemetry().
SANDBOX: sandbox/vehicles.html: test track (flat asphalt area, dirt area, ramps, bumps, a slope 25°, walls, trees, a lake for the boat)
with automated driving scripts (full throttle acceleration test logging time to 60 km/h and top speed, braking distance, slalom,
handbrake turn, jump off a ramp, crash into a wall → damage, boat run) — assert numbers are plausible; screenshots from the vehicle
camera. Also verify in the full world (?quick=1) driving on terrain/roads/bridges.`,
  },
  match: {
    port: 5209,
    dirs: 'src/match/',
    prompt: `MODULE: MATCH FLOW + ZONE (key: match). Implements IMatch (ctx.match) and IZone (ctx.zone). Read every implemented module
(world, buildings, characters, items, combat, vehicles, fx) to orchestrate them.
1) MATCH STATE MACHINE per docs/DESIGN.md §1: start(config) → (loading screen updates) → spawn the player + bots (config.totalPlayers,
   teams by mode: solo/duo/squad; player's teammates are bots) → PLANE: aircraft model (public/assets/vehicles/aircraft_transport.glb or
   fallback) flying a random line across the map at 600 m / 60 m/s with spinning props, engine sound via ctx.audio, everyone inside
   (moveState 'plane', hidden), camera mode 'plane' (orbit camera around the plane), HUD hint "Press F to jump", the player jumps with
   F (interact), bots jump at points chosen by their brains (ctx.ai may still be a stub: implement a default jump-point picker that
   distributes bots over locations weighted by loot tier & distance to the path; AI module can override via an exported hook), forced
   jump at the end of the path; FREEFALL/PARACHUTE handled by the character module (setMoveState('freefall')); after landing → playing.
   quickStart: spawn everyone on the ground at random land positions near buildings with a little starter loot, skip the plane.
   Bots spawn with ctx.ai.addBot(c, difficulty). Teammates are tracked; team colors/markers.
2) ZONE per DESIGN §7: phases with wait/shrink timers, white circle selection fully inside the current one, biased toward land (reject
   centers in water / mostly-water circles), blue zone smooth shrink, damage ticks to everyone outside (ctx.combat.applyDamage type
   'zone', bypasses armor), events 'zone:announce'/'zone:shrinkStart'/'zone:shrinkEnd' + UI notify texts ("Restricting the play area in
   1:00!" etc.). Visual: a tall translucent animated blue wall cylinder (shader with scrolling noise + fade at distance, visible from
   inside and outside, correct depth blending) and a white circle indicator for the next zone shown on the map (UI draws map circles).
   Optional red zone bombardment (random area, shells exploding with fx/audio, damage). Airdrops 2-4 per match via
   ctx.items.loot.spawnAirdrop with a plane flyover.
3) RULES: shouldKnock(c) (duo/squad and the team has a living non-knocked member), team elimination (when all members are knocked/dead
   → knocked members die), bleed-out ticking for knocked players (DESIGN §4; per-knock acceleration), revives (interactable on knocked
   teammates: hold F 10 s; reviver action 'revive', target 'beingRevived'; interrupted by moving/damage) → 'combat:revive'; kill feed
   records (combat events), per-combatant stats (kills/knocks/damage dealt/distance traveled/survival time), alive counts, end
   detection (last team standing) → result + 'match:ended' + ctx.ui.showResults; after the player dies: deathcam on killer for 3-4 s then
   spectate teammates (or killer) via ctx.cameraRig.spectate with next/prev; the match continues simulating to the end if the player
   chooses to spectate; return to lobby/main menu cleanly (dispose everything, no leaks, start a new match without page reload).
4) PERFORMANCE: staggering for 100 combatants; bots far from the player still play a real match (AI module handles behaviour).
5) DEBUG: skipPhase(), setZone(x,z,r), killAllBots(except?), endMatch(), matchInfo().
SANDBOX: use the full game (?quick=1 and normal flow). Evidence: automated Playwright run of the full flow: menu → start → plane →
jump → freefall → parachute → land (screenshots at each), zone announce/shrink with timers accelerated (?zoneSpeed=10 flag), zone damage
applied outside, a full fast-forward match (timeScale) ending with a winner and the results screen; duo/squad knock & revive tests.`,
  },
  ui: {
    port: 5210,
    dirs: 'src/ui/',
    prompt: `MODULE: UI / UX (key: ui). Implements IUI (ctx.ui): menus, settings, HUD, inventory, map, minimap, compass, kill feed,
notifications, results, pause, loading — PUBG-like look & feel per docs/DESIGN.md §9. Read all implemented modules to bind real data.
1) STYLE: clean PUBG-style UI — white/translucent dark panels, condensed sans font (bundle a font via npm @fontsource/* e.g.
   roboto-condensed / oswald so it works offline), crisp icons (inline SVG icon set you author; item icons from public/assets/icons if
   present), subtle animations, scalable (settings.gameplay.uiScale), responsive 1280x720 → 4K. No browser-default looking controls.
2) MAIN MENU: animated background (render the world/sky behind a dark gradient, or a stylized scene), PLAY (mode Solo/Duo/Squad,
   players 30-100, bot difficulty, perspective TPP/FPP, time of day/weather/random, seed), SETTINGS, CONTROLS help, QUIT-to-title,
   credits/asset licenses page (read manifests). LOADING screen with progress + tips. PAUSE (Esc): resume, settings, leave match (back
   to main menu without reload).
3) SETTINGS: every field of core/Settings (graphics presets + individual options applied live, audio sliders, controls: sensitivity +
   per-scope sensitivities, invert, aim/crouch toggle modes, full KEY REBINDING with conflict detection via input.listenForNextKey,
   gameplay: perspective, crosshair color/style, colorblind mode (apply a CSS/canvas filter or post pass hook), sound visualizer, hit
   markers, auto pickup, UI scale, show FPS). Persisted.
4) HUD: compass strip with degrees/cardinals + teammate/marker/sound-visualizer bearings; health bar (white → red, knocked state),
   boost bar segments; equipped weapon panel (weapon name, ammo in mag / reserve, fire mode, zeroing, attachment icons), weapon slots
   strip, throwable count, quick heals with counts; helmet/vest/backpack icons with durability colors; team panel (names + health for
   duo/squad); alive count, kills, zone timer + distance-to-safe-zone + run indicator; minimap (canvas: world.getMapImage() rotated/
   north-up option, player arrow with view cone, zone circles, plane path, teammates, vehicles nearby, markers, gunfire bearing hints
   only if sound visualizer on); kill feed (top-right, PUBG wording e.g. "X knocked out Y with M416" / "killed by headshot"); center
   notifications (zone warnings, "YOU KILLED Player123", kill count); interaction prompt "F  Pick up M416" with hold-progress ring;
   reload/heal progress ring + cancel hint; dynamic crosshair (spread from ctx.combat.getSpread; hidden while ADS; style/color settings);
   hit markers (white body / red kill / different for headshots) + damage numbers optional; damage direction indicators; scope overlay
   for magnified optics (black vignette ring + reticle when ctx.cameraRig.zoom > 1.5 and ADS) — coordinate with combat's getOptic;
   low-health screen vignette; freefall HUD (altitude, speed) and plane HUD ("F jump", distance to path), vehicle HUD (speed, fuel,
   health), spectate HUD (spectating name, next/prev), death screen ("BETTER LUCK NEXT TIME" with placement & kills) and WIN screen
   ("WINNER WINNER CHICKEN DINNER!").
5) INVENTORY (Tab): PUBG layout — vicinity list (ground items + death boxes near the player via ctx.items.loot.itemsNear), backpack list
   with capacity bar, equipment (helmet/vest/backpack) and 5 weapon slots with attachment sub-slots; drag & drop between all zones
   (drop to ground, equip, attach/detach, swap weapon slots), right-click quick actions (use, drop, equip), drop partial stacks
   (Ctrl-drag split), tooltips with stats; game continues running underneath; mouse cursor visible (pointer lock released) and gameplay
   input disabled (capturesInput) while open.
6) MAP (M): full-screen map image with zoom (wheel) & pan (drag), named locations, zone circles (current blue + next white), plane path,
   player + teammates, vehicles nearby, custom marker (right-click) shown on compass/minimap, grid labels (A-H / 1-8 like PUBG).
7) RESULTS screen: placement #N/total, kills, damage dealt, survival time, distance, plus "return to lobby" / "spectate".
8) ACCESSIBILITY: colorblind palettes for UI markers, UI scale, sound visualizer, subtitles for important audio cues (zone warnings).
9) Audio: ctx.audio.play('ui/click' etc.) for UI interactions.
SANDBOX: the full game (?quick=1). Evidence: screenshots of every screen (main menu, settings tabs, key rebinding, loading, HUD in
combat with all elements populated (use debug helpers to give gear/weapons), inventory with items & drag-drop (automated via Playwright
mouse), map zoomed, minimap, kill feed with entries, scope overlay, results win & death screens, pause menu). Check text legibility at
1280x720 and 1920x1080.`,
  },
  ai: {
    port: 5211,
    dirs: 'src/ai/',
    prompt: `MODULE: AI BOTS (key: ai). Implements IAI (ctx.ai). This is the hardest module — bots must behave like competent but
imperfect PUBG players, with ZERO cheating (docs/DESIGN.md §8 + the client's fairness rules: no wallhacks, no omniscient tracking, no
instant acquisition, no perfect recoil control, no guaranteed headshots, no knowledge of unseen players). Bots drive their Character
ONLY through CharacterIntent (same rules as the player). Read all implemented modules first.
1) NAVIGATION: outdoor nav grid built at load (e.g. 3-4 m cells over the island; walkability from slope, water depth, building
   footprints (ctx.buildings.buildings bounds), trees/rocks colliders via physics probes; cost for open ground/roads/forest) + the
   indoor graph (ctx.buildings.getNavGraph(), linked at exterior door nodes) + hierarchical/cached A* in a time-sliced queue (never
   stall a frame), path smoothing (string pulling with LOS), local steering with obstacle/character avoidance, door opening when
   pathing through doors, stair handling, vault/jump over small obstacles via intent.jump, stuck detection & recovery (re-path, back
   up, jump, try alternative) — NO teleporting. Swimming across rivers when needed (prefer bridges).
2) PERCEPTION: vision cone (configurable FOV per difficulty), detection meter per target filling with visibility factors (distance,
   target stance/speed/firing/silhouette/lighting ctx.environment.visibility/fog, foliage via ctx.vegetation.foliageOcclusion, smoke via
   ctx.fx.smokeDensityAlong, prone in grass via ctx.world.getGroundCover), requiring physics line-of-sight (ctx.physics.lineOfSight from
   eye to several target body points), staggered raycasts (budget per tick), reaction time before acting, memory of last known
   position/velocity that decays, losing targets; HEARING from 'noise' events with distance attenuation (+ indoors muffling) producing
   uncertain positions (error grows with distance); suppression from 'projectile:nearMiss'; squad knowledge sharing with delay +
   approximate positions.
3) DECISION MAKING (utility AI / behaviour tree, 2-10 Hz think rate with per-tick intent execution): pick a drop location from the
   plane (hot/medium/cold preferences, integrates with the match module's jump hook — read src/match), steer the parachute to land
   near it, LOOT buildings room by room (ctx.items.loot.itemsNear + pickUp; evaluate needs: better weapon tier for its range
   preference, matching ammo, armor upgrades, heals, scopes/attachments; inventory management & weapon slot choice), heal/boost when
   safe, ROTATE with the zone (timing by personality, prefer cover/forest routes, use vehicles for long distances and drive them
   using the vehicles module's steering helper — drive along roads when sensible, exit near destination), INVESTIGATE sounds
   cautiously, ENGAGE: choose engagement based on weapon range/health/armor/squad/cover; take cover (search cover points: building
   walls/windows, trees via ctx.vegetation.treesNear, rocks, vehicles; validate with raycasts that cover blocks the threat direction);
   peek & shoot, crouch/prone in open fields, burst fire at range, full auto close, reload behind cover, throw frags at enemies behind
   cover / smoke to revive or cross, flank with teammates, retreat when losing, push knocked enemies, finish or ignore based on risk,
   revive teammates when safe, avoid clustering, avoid crossing open ground when threatened, loot death boxes after fights.
4) AIM MODEL (human-like): aim point on the target body (center mass mostly, sometimes head at high skill/close range), error offset
   that converges while tracking (convergence time 0.6-2 s by difficulty), increases with target angular velocity, own movement,
   distance, target partial visibility, suppression and recent damage taken; smooth mouse-like rotation with max angular speed and
   overshoot; imperfect recoil compensation (pull down by a fraction of the actual recoil returned by combat); bullet drop/lead
   compensation imperfect (estimates distance with error); first-shot reaction delay; fires only with LOS to the aim point.
5) DIFFICULTY (easy/normal/hard/veteran) via perception range/FOV, reaction time, aim convergence/stability, recoil control,
   tactical competence/decision quality, plus per-bot personality (aggressive/cautious/looter/camper) — never information access.
6) PERFORMANCE: 99 bots: staggered thinking, budgeted raycasts and A* per tick, cheap far-from-player behaviour (lower think rate,
   still real movement/combat). Measure ms per tick.
7) DEBUG: aiDebug(true) draws paths/perception/state labels above bots, botInfo(id), spectateBot(id), aiStats() (time per tick,
   paths/s, states histogram).
SANDBOX: sandbox/ai.html arena(s): 1v1 duels at 20/80/200 m with different weapons (log hit rates — should be human-like: e.g. normal
bots hitting ~20-35% at 50 m with ARs, much less at 200 m), bots looting a house, bots navigating a town and stairs, 10-bot free-for-all
in a small town, squad behaviour. Then full-game soak tests (?quick=1&players=80 with timeScale for several minutes): count stuck bots
(no progress > 20 s), kills over time, zone deaths ratio, distribution of states, exceptions. Fix until bots look and play convincingly.`,
  },
  audio: {
    port: 5212,
    dirs: 'src/audio/',
    prompt: `MODULE: AUDIO (key: audio). Implements IAudio (ctx.audio) and wires ALL gameplay sound. Read every module's events.
1) ENGINE: WebAudio with mixer buses per category (sfx/ui/ambience/music/voice + master) driven by settings.audio (live); voice
   management (priority, max voices ~48, steal quietest/farthest); positional audio via PannerNode (HRTF when settings.audio.hrtf,
   else equalpower) with realistic distance models per sound type; listener follows ctx.camera (or player head in TPP - choose
   PUBG-like: listener at the camera for TPP is acceptable but footsteps/shots should localize correctly); speed-of-sound delay for
   distant events; distance filtering (air absorption lowpass); OCCLUSION: when physics line-of-sight between listener and source is
   blocked (ctx.physics.lineOfSight with Mask.Sight, throttled/cached per voice) apply lowpass + attenuation; REVERB: convolver
   impulse responses generated procedurally (outdoor open, forest, indoor small room, indoor large hall, urban street echo) chosen
   by listener/ source location (ctx.buildings.isIndoors) with smooth wet/dry transitions; gunshot distance layers (near crack +
   mechanical, mid, distant boom/tail) crossfaded by distance; supersonic crack/thump for bullet flybys at range; audio unlock on first
   user gesture (unlock()).
2) SOUND BANK: load public/assets/audio/manifest.json (asset agent producing it; ids like 'weapons/ar_556' with _01.._04 variations)
   lazily with caching; high-quality procedural synthesis fallback for any missing id (so the game never goes silent).
3) EVENT WIRING (subscribe to ctx.events): 'weapon:fired' (class/suppressed/distance variants; the local player's shots louder/
   stereo-ish), 'weapon:reload' (mag out/in/bolt timed with the reload duration), 'weapon:switch', 'projectile:hit' (surface
   impacts + hit markers for the player's hits: body thud / helmet ding / headshot), 'projectile:nearMiss' (flyby/crack for the
   player), 'combat:damage' (player hurt grunt optional), 'combat:knock'/'combat:kill' (kill confirm UI sound for the player),
   'character:footstep' (surface + speed; crouch/walk quieter; others' footsteps positional and audible within DESIGN §8 radii so the
   player can hear enemies — key PUBG mechanic), jump/land/stance/swim/parachute, 'door:toggle', 'glass:break', 'explosion',
   'throwable:bounce', 'item:pickup'/'item:used' (bandage/drink/medkit/syringe sounds while using), 'vehicle:*' + continuous engine
   loops per vehicle with rpm-based pitch/crossfade, tire skid, impacts (use the vehicles module's telemetry API), plane drone during
   the plane phase, parachute wind, freefall wind (volume by speed), zone events (warning sound + wall hum when near the blue zone),
   match start/end stings, airdrop plane. Ambience beds: wind, forest birds (day) / crickets (night), ocean near coast, river near
   water, rain by weather, indoor room tone — mixed by position.
4) MUSIC: menu music loop (from assets or tasteful procedural), lobby; silence in match (PUBG style), victory/defeat stings.
5) DEBUG: audioStats() (active voices, loaded buffers), playTest(id).
SANDBOX: sandbox/audio.html: buttons to trigger every sound group in 3D around the listener (distance slider), occlusion test behind a
wall, reverb indoor/outdoor test; verify in headless Chromium that buffers decode and the graph builds without errors (can't listen —
use OfflineAudioContext renders to check output RMS levels are sane per category, no clipping, delays correct).`,
  },
}

const modules = (args && args.modules) || []
const notes = (args && args.notes) || ''
const built = (args && args.built) || []

// args.verifyOnly: module keys whose implementation is already done — run only the QA/verify stage.
const VERIFY_ONLY = new Set((args && args.verifyOnly) || [])

const results = await pipeline(
  modules,
  (key) => {
    const s = SPECS[key]
    if (VERIFY_ONLY.has(key)) {
      return Promise.resolve({
        module: key,
        implemented: [`(implemented in an earlier session — read docs/progress/${key}.md for the full report, API and known gaps)`],
        testing: [], knownGaps: [], contractChanges: [], debugHelpers: [],
        notesForOthers: 'verify-only resume run; a previous QA pass may have been interrupted midway — check docs/progress for its notes',
      })
    }
    return agent(`${COMMON}\nALREADY-IMPLEMENTED MODULES you can rely on: ${built.length ? built.join(', ') : '(none yet — only core + stubs)'}.\nCONCURRENT MODULES being built right now by other agents: ${modules.filter((m) => m !== key).join(', ') || 'none'}.\nWAVE NOTES FROM THE LEAD: ${notes}\n\nYOUR PORT: ${s.port}. YOUR DIRS: ${s.dirs}\n\n${s.prompt}`, {
      label: `impl:${key}`,
      phase: 'Implement',
      schema: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          implemented: { type: 'array', items: { type: 'string' } },
          testing: { type: 'array', items: { type: 'string' }, description: 'tests run + evidence (screenshot paths, numbers)' },
          knownGaps: { type: 'array', items: { type: 'string' } },
          contractChanges: { type: 'array', items: { type: 'string' } },
          debugHelpers: { type: 'array', items: { type: 'string' } },
          notesForOthers: { type: 'string' },
        },
        required: ['module', 'implemented', 'testing', 'knownGaps', 'contractChanges', 'debugHelpers', 'notesForOthers'],
      },
    })
  },
  (impl, key) => {
    const s = SPECS[key]
    return agent(`${COMMON}\nYou are the independent QA + FIX engineer for module '${key}' (dirs: ${s.dirs}; use port ${s.port + 100}).
The implementing engineer reports:\n${JSON.stringify(impl, null, 1)}\n\nThe original spec they were given:\n${s.prompt}\n
Your job: be adversarial and thorough. Assume claims are unverified. Read the code critically (bugs, edge cases, perf hazards, per-frame
allocations, missing spec items, things that are faked/stubbed/TODO, contract violations, coupling to other modules' internals).
Then TEST it for real in headless Chromium (sandbox + full game ?quick=1): reproduce each claimed feature, try to break it (edge cases,
odd inputs, long runs, many entities), check console errors, compare numbers to docs/DESIGN.md, and LOOK at screenshots like a
demanding player/art director (is it convincing? anything broken, ugly, floating, z-fighting, too dark/bright, wrong scale?).
FIX every defect you find directly in the module's code (you now own those dirs), and implement missing spec items that are feasible.
Re-test after fixing. Make sure the whole project typechecks (npx tsc --noEmit) and the full game still boots with no console errors.
Update docs/progress/${key}.md with a QA section. Final answer: what you verified (with evidence), what you fixed, what remains.`, {
      label: `verify:${key}`,
      phase: 'Verify',
      schema: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          verified: { type: 'array', items: { type: 'string' } },
          defectsFound: { type: 'array', items: { type: 'string' } },
          fixed: { type: 'array', items: { type: 'string' } },
          remaining: { type: 'array', items: { type: 'string' } },
          screenshots: { type: 'array', items: { type: 'string' } },
        },
        required: ['module', 'verified', 'defectsFound', 'fixed', 'remaining', 'screenshots'],
      },
    }).then((v) => ({ key, impl, verify: v }))
  },
)
return results