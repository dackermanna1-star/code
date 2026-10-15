export const meta = {
  name: 'acquire-assets',
  description: 'Acquire, process and verify external game assets (characters/anims, weapons, gear, vehicles, textures, vegetation/props, audio)',
  phases: [
    { title: 'Acquire', detail: 'one agent per asset category downloads/processes/authors assets' },
    { title: 'Verify', detail: 'independent agent loads every asset in headless three.js, checks conventions, fixes issues' },
  ],
}

// Scratch directory for raw downloads, Blender, screenshots (NOT in the repo). Pass args.sp with the
// current session's scratchpad path; the fallback is the original session's path.
const SP = (args && args.sp) || '/tmp/claude-0/-home-user-code/a38125ba-915d-511c-9109-7409ce62d7c3/scratchpad'

const COMMON = `
You are part of a AAA-minded team building a single-player PUBG: BATTLEGROUNDS-style battle royale in the browser
(Three.js r186 WebGL2 renderer, Rapier physics, TypeScript, Vite). Repo: /home/user/code (git; do NOT commit or push — the lead does that).
Your job is ASSET ACQUISITION/PRODUCTION for ONE category (below). Other agents work concurrently on other categories
and on code in src/ — only write inside YOUR assigned output directories plus your own scratch dirs.

READ FIRST: /home/user/code/docs/ASSETS.md (conventions: +Y up, +Z forward, meters, GLB, meshopt allowed, NO Draco, NO KTX2,
PBR texture-set layout, named nodes, manifest.json + README.md per category, file-size budget).

Quality bar: realistic, non-blocky, AAA-leaning visuals. Avoid low-poly/cartoon/toy assets unless nothing better exists
(then say so in the README). Prefer CC0/public domain (Poly Haven api.polyhaven.com + dl.polyhaven.org, ambientCG API,
Quaternius, Kenney, KhronosGroup glTF-Sample-Assets on GitHub, three.js repo examples/models, OpenGameArt CC0, archive.org).
Other freely downloadable assets are acceptable (private, unpublished project) — record source URL + license for each.
Sketchfab/Mixamo/CGTrader/TurboSquid need login: skip them. freesound.org is blocked.

Tools:
- Blender 4.5 LTS headless is installed at ${SP}/tools/blender/blender (run: blender --background --python script.py -- args).
  Use it for FBX/OBJ/DAE import, retargeting, decimation/LOD, baking, UV, scripted modeling, glTF export (export_format='GLB').
- node 22 with @gltf-transform/core|functions|extensions, meshoptimizer, three installed in /home/user/code/node_modules.
  Put any reusable processing scripts in /home/user/code/tools/assets/<category>/ (these are kept in the repo).
- python3.13 (pip install --user allowed), curl, git clone (github works), ffmpeg may need installing (pip install imageio-ffmpeg
  gives a static ffmpeg binary, or apt is unavailable — check).
- Headless Chromium with WebGL (SwiftShader): see /home/user/code/tools/shot.mjs for how to launch Playwright chromium
  (args --use-angle=swiftshader --enable-unsafe-swiftshader). Use it to render previews with three.js to visually check your work
  (serve files with: npx vite --port <unique port 52xx> from /home/user/code, or a tiny static server). LOOK at your preview PNGs with the Read tool.
- Put raw downloads and intermediates in ${SP}/raw/<category>/ — NEVER in the repo.

Budget: each file <= 20 MB. Stay within your category budget below.
When done, return a concise structured summary.
`

const CATEGORIES = [
  {
    key: 'characters',
    out: 'public/assets/characters/ and public/assets/anims/',
    budget: '70 MB',
    prompt: `CATEGORY: CHARACTERS + ANIMATIONS (most critical asset category).
Deliver:
1) Realistic human combatant character model(s) — tactical/civilian-survivor look like PUBG (detailed face, realistic proportions,
   clothing). Minimum ONE excellent base character; ideally 4-8 visual variants (different outfits/heads/skin tones or texture variants)
   ALL sharing ONE identical skeleton so a single animation set drives all. LOD0 <= ~35k tris; also produce a LOD1 (~6-10k tris)
   per variant (decimated in Blender) as a separate file <id>_lod1.glb with the same skeleton.
   Candidates (evaluate, pick the best realistic one): three.js repo examples/models/gltf/Soldier.glb (Mixamo 'Vanguard' soldier),
   Xbot.glb, readyplayer.me.glb / Michelle.glb; Quaternius 'Universal Base Characters' (CC0); other free realistic rigged humans
   in GitHub repos (Mixamo-rigged FBX/GLB are common in shooter tutorial repos). Mixamo-style bone naming is preferred.
2) The broadest possible animation set, retargeted onto that ONE skeleton, in-place (strip horizontal root motion but MEASURE it first:
   record each locomotion clip's average speed in m/s in the manifest so code can sync playback rate to movement speed and avoid foot sliding).
   Sources to evaluate: Ready Player Me animation-library (already cloned at ${SP}/rpm-anim — masculine/glb/{idle,locomotion,expression,...},
   Mixamo-like bone names without prefix), Quaternius 'Universal Animation Library' (CC0, ~120 clips incl. combat/pistol/swim/death/driving —
   find a direct download: quaternius.com, itch.io (scriptable free download), GitHub mirrors), three.js example clips, GitHub repos that
   contain Mixamo rifle animation sets (rifle idle/walk/run/strafe/aim/fire/reload, crouch rifle, prone, death) — use web search to find them.
   Canonical clip names to produce (as many as possible; note which are missing):
   idle, walk_f, walk_b, walk_l, walk_r, jog_f, jog_b, jog_l, jog_r, sprint_f, crouch_idle, crouch_walk_f, crouch_walk_b, crouch_walk_l,
   crouch_walk_r, prone_idle, prone_crawl_f, prone_crawl_b, jump_start, fall_loop, land, swim_idle, swim_f, freefall, parachute_idle,
   drive_sit, passenger_sit, death_f, death_b, knocked_idle, knocked_crawl, rifle_idle, rifle_aim, rifle_walk_f/b/l/r, rifle_jog_f/b/l/r,
   rifle_sprint, rifle_crouch_idle, rifle_crouch_walk_f/b/l/r, rifle_reload, rifle_fire, pistol_idle, pistol_aim, pistol_reload,
   throw_grenade, melee_swing, use_item (bandage/medkit), drink, pickup, interact_door, vault, climb, hit_react_f/b/l/r, revive_teammate.
   Export animations as GLB(s) containing the skeleton + clips only (no mesh), e.g. public/assets/anims/locomotion.glb, combat.glb, misc.glb.
   Clips must use the canonical names. Make sure they play correctly on every character variant (check visually: render a few frames of
   several clips on the character in headless Chromium and LOOK at them — catch broken retargets, twisted limbs, wrong rest-pose offsets).
3) public/assets/characters/manifest.json with: skeleton bone list, key bone names (hips, spine chain, neck, head, left/right shoulder/arm/forearm/hand,
   upLeg/leg/foot), rest-pose type, height in m, per-variant files, and an 'anims' section: clip name -> {file, duration, loop, speed_mps, source, license}.
   README.md with gaps (e.g. 'no prone clip — code must do procedural prone') and recommendations.`,
  },
  {
    key: 'weapons',
    out: 'public/assets/weapons/',
    budget: '45 MB',
    prompt: `CATEGORY: FIREARMS (realistic gun models).
Roster (ids): ar_m416, ar_akm, ar_scarl, ar_m16a4, ar_beryl, ar_aug, ar_groza, smg_ump45, smg_vector, smg_uzi, smg_tommy, smg_mp5k,
dmr_sks, dmr_mini14, dmr_slr, dmr_mk14, sr_kar98k, sr_m24, sr_awm, sr_win94, sg_s1897, sg_s686, sg_s12k, lmg_m249, lmg_dp28,
pistol_p92, pistol_p1911, pistol_r1895, pistol_p18c, pistol_sawedoff.
For EACH id deliver public/assets/weapons/<id>.glb following docs/ASSETS.md weapon conventions: origin at the firing-hand pistol grip,
barrel along +Z, +Y up, meters, real-world length; child empties 'muzzle', 'grip_support' (support-hand position), 'sight_eye'
(eye point for iron-sight ADS, aligned with the sight line), 'rail_top' (where optics mount, if any); separate child meshes named 'mag' and
'bolt' (or 'charging_handle'/'slide') so code can animate reloads/cycling. ~3k-15k tris each, 1-2 PBR materials, 512-1024 px textures.
Strategy: first search hard for free realistic models (OpenGameArt CC0, GitHub repos of three.js/Unity/Godot FPS projects that ship GLB/FBX/OBJ
guns, archive.org, Quaternius/Kenney only if nothing realistic exists). For any roster gun without a good realistic model, AUTHOR it with
scripted Blender modeling: trace an accurate side-profile silhouette (real dimensions) for receiver/stock/handguard, extrude with bevels,
add cylinders for barrels/gas tubes/muzzle devices, curved AK/Beryl/Groza magazines, rails with ridges, iron sights, triggers/guards,
wood furniture where real (AKM, Kar98k, SKS, Tommy, Win94, S1897, S686, DP-28, M24 stock is synthetic), proper PBR materials
(parkerized steel, anodized aluminum, polymer, wood with procedural grain baked to texture or vertex-color + roughness variation).
Weighted normals / smoothing so it never looks blocky. Render a contact sheet of all weapons (side + 3/4 view) in headless Chromium and LOOK
at it; iterate until each is recognizable as its real counterpart. manifest.json: id, file, length_m, source/license or 'authored',
node names present, tri count.`,
  },
  {
    key: 'equipment',
    out: 'public/assets/attachments/, public/assets/gear/, public/assets/items/',
    budget: '35 MB',
    prompt: `CATEGORY: WEAPON ATTACHMENTS + MELEE + THROWABLES + WEARABLE GEAR + LOOT ITEM PICKUPS.
Deliver GLBs (+Z forward, +Y up, meters):
- public/assets/attachments/: scope_reddot, scope_holo, scope_2x, scope_3x, scope_4x, scope_6x, scope_8x (each with child empty 'eye' at
  the eyepoint on the optical axis and 'lens' mesh named for the rear lens so code can render a scope view; origin at the rail-mount base),
  muzzle_suppressor_ar, muzzle_comp_ar, muzzle_flash_ar, muzzle_suppressor_smg, muzzle_suppressor_sr, grip_vertical, grip_angled,
  grip_half, grip_thumb, grip_light, mag_ext (generic box mag extension), stock_tactical, stock_cheekpad.
- public/assets/weapons/melee_pan.glb, melee_machete.glb, melee_crowbar.glb, melee_sickle.glb (origin at hand grip, +Z = tip direction).
- public/assets/weapons/throw_frag.glb, throw_smoke.glb, throw_stun.glb, throw_molotov.glb.
- public/assets/gear/: helmet_1 (motorcycle-style), helmet_2 (military ballistic helmet), helmet_3 (Spetsnaz-style heavy helmet),
  vest_1 (police vest), vest_2 (police/tactical vest), vest_3 (military plate carrier), backpack_1, backpack_2, backpack_3 (increasing size),
  parachute (canopy + lines, separate 'canopy' node; canopy ~ 7m span), ghillie optional. Gear must fit a ~1.8 m human: helmets origin at head
  center, vests origin at chest center, backpacks origin at upper-back attach point; document intended attach bone (Head/Spine2) + offsets.
- public/assets/items/: ammo_556, ammo_762, ammo_9mm, ammo_45acp, ammo_12g, ammo_300mag (ammo boxes), item_bandage, item_firstaid,
  item_medkit, item_energydrink, item_painkiller, item_adrenaline, item_fuelcan, airdrop_crate (with parachute variant), deathbox (loot crate).
Search for realistic free models first (Poly Haven models API has some props; GitHub repos; OpenGameArt CC0; Kenney/Quaternius only as last resort),
otherwise author them with scripted Blender modeling to a realistic standard (bevels, proper proportions, PBR materials, decals/labels
via generated textures — e.g. red cross on medkit, energy drink can label). Render a contact sheet in headless Chromium and LOOK at it.
manifest.json per folder or one combined manifest at public/assets/gear/manifest.json listing everything.`,
  },
  {
    key: 'vehicles',
    out: 'public/assets/vehicles/',
    budget: '45 MB',
    prompt: `CATEGORY: VEHICLES + AIRCRAFT.
Deliver GLBs per docs/ASSETS.md vehicle conventions (forward +Z, origin on ground at wheelbase center, wheels separate nodes named
wheel_fl/wheel_fr/wheel_rl/wheel_rr with origin at hub; seats seat_0..n as empties at hip position; steering_wheel node; exhaust empty;
headlights empties 'light_l','light_r'; optional door nodes; glass as separate transmissive/transparent material):
- vehicle_uaz (Soviet 4x4 jeep, ~4.0 m long, 4 seats), vehicle_dacia (1970s-80s 4-door sedan, ~4.3 m, 4 seats),
  vehicle_buggy (2-seat dune buggy, roll cage), vehicle_motorcycle (2 seats, wheels wheel_f/wheel_r, handlebar node 'handlebar'),
  vehicle_pickup (small pickup truck, 4 seats) optional, vehicle_boat (PG-117-like small motor boat ~5 m, 4+ seats; origin at waterline),
  aircraft_transport (C-130-like 4-prop military transport plane ~30 m long with 'prop_1'..'prop_4' nodes for spinning and a 'ramp' node),
  also wrecked/burnt variants for decoration if cheap (vehicle_*_wreck).
Sources: KhronosGroup glTF-Sample-Assets (e.g. 'Buggy', 'CarConcept', 'CesiumMilkTruck'), three.js examples (ferrari.glb shows a good
separate-wheels pattern), Poly Haven models, OpenGameArt, GitHub repos, archive.org. Where nothing realistic exists, author with scripted
Blender modeling to a realistic standard (smooth beveled body panels via subdivision, proper wheel/tire geometry with tread, rims, glass,
lights, interiors with seats + steering wheel, PBR paint with clearcoat-like low roughness, rubber, chrome, rust variants).
Tri budget ~15-40k per vehicle (plane up to 60k). Render a contact sheet in headless Chromium and LOOK at it. manifest.json: id, file,
dimensions, wheel radius, wheelbase, track width, seat count, node names, source/license.`,
  },
  {
    key: 'textures',
    out: 'public/assets/textures/ and public/assets/hdri/',
    budget: '110 MB',
    prompt: `CATEGORY: PBR TEXTURE SETS + HDRIs.
Use Poly Haven (api.polyhaven.com/assets?t=textures, /files/<id>) and ambientCG (api/v2/full_json, downloads) — both CC0.
Deliver texture sets per docs/ASSETS.md (albedo.jpg sRGB, normal.jpg OpenGL, arm.jpg = AO/Rough/Metal packed; build arm yourself when the
source gives separate maps; resize with python Pillow). Seamless/tileable only.
Terrain (2048 px for the first 6, others 1024): terrain_grass (lush meadow grass, European plains), terrain_grass_dry, terrain_forest_floor
(needles/leaves), terrain_dirt, terrain_mud, terrain_rock (cliff rock), terrain_sand (beach), terrain_gravel, road_asphalt (worn),
road_dirt (dirt track with tire ruts if available), terrain_field (plowed field / crops).
Buildings & props (1024 px): brick_red, brick_white, plaster_white, plaster_painted (weathered, tintable — low saturation),
concrete_wall, concrete_floor, concrete_dirty, wood_planks_floor, wood_siding (exterior), wood_painted, roof_tiles, roof_corrugated_metal,
metal_rusty, metal_painted, floor_tiles, wall_tiles, wallpaper (2 variants), carpet, fabric, sidewalk_pavers, container_metal,
bark_pine, bark_birch, bark_oak (tree trunks), military_camo_fabric.
Also: grass blade/leaf alpha textures if available (for vegetation code), decals (cracks, dirt, bullet holes for impacts — can be generated),
a blue-noise texture (64x64) for dithering.
HDRIs (public/assets/hdri/): 3-4 outdoor HDRIs at 1k (and one at 2k) .hdr for IBL/reflections: clear midday, partly cloudy afternoon,
overcast, sunset; Poly Haven. Also a cloud/sky texture if useful.
Write manifest.json with each set: id, files, real-world tile size in meters (from Poly Haven 'dimensions' metadata), source, license.
Render a contact sheet (sphere/plane previews lit in three.js) in headless Chromium and LOOK at it.`,
  },
  {
    key: 'environment',
    out: 'public/assets/vegetation/ and public/assets/props/',
    budget: '70 MB',
    prompt: `CATEGORY: VEGETATION + ROCKS + ENVIRONMENT PROPS + FURNITURE.
Sources: Poly Haven models API (api.polyhaven.com/assets?t=models — includes trees, shrubs, grass, rocks, furniture, props), ambientCG,
KhronosGroup samples, Quaternius 'Stylized Nature' only as last resort (we want realism).
Deliver GLBs (+Y up, meters, origin at ground contact point; tris budgets matter: these get instanced thousands of times):
- public/assets/vegetation/: 3-4 conifer/pine/fir trees (12-18 m), 2-3 deciduous (birch/oak/linden), 1-2 dead/burnt trees, 3-4 bushes/shrubs,
  2-3 grass/weed clumps, ferns, flower clumps, tree stumps, fallen logs. For each tree provide LOD0 (<= ~8-15k tris), LOD1 (~2-3k tris) and an
  impostor-friendly LOD2 (crossed quads / billboard card with baked albedo+normal atlas texture, < 100 tris) — use Blender decimation +
  bake cards. Leaves must use alpha-tested materials (alphaMode MASK) with proper textures; bark with PBR textures. If Poly Haven trees are
  too heavy, decimate aggressively while preserving silhouette, or generate trees in Blender (Sapling add-on is bundled: 'add_curve_sapling').
- public/assets/props/rocks: 6-8 rocks/boulders/cliff pieces (photoscanned Poly Haven rocks are ideal), decimated to <= 3-5k tris with normal maps.
- public/assets/props/: furniture & clutter for building interiors and exteriors: wooden chair, table, sofa, bed, wardrobe/cabinet, shelf,
  desk, kitchen counter/stove, fridge, bathtub/toilet (optional), crates (wood), barrels (metal, oil drum), pallets, hay bales, fences
  (wooden fence segment, chain-link segment), utility/power pole, street lamp, traffic sign, concrete barrier (jersey), sandbags, shipping
  container (6 m and 12 m, openable door optional), water tower (optional), tires pile, dumpster, bench, mailbox — prefer Poly Haven
  where available, otherwise author in Blender realistically. 0.5k-10k tris each.
manifest.json: id, file, tris per LOD, bounds (m), collision hint (box/cylinder dims), source, license. Contact sheet render + LOOK at it.`,
  },
  {
    key: 'audio',
    out: 'public/assets/audio/',
    budget: '60 MB',
    prompt: `CATEGORY: AUDIO.
Find realistic, high-quality CC0/free sounds (OpenGameArt CC0 sound packs, Kenney audio packs (kenney.nl/assets — direct zip downloads),
archive.org collections, GitHub repos of game projects shipping weapon audio, Sonniss GDC royalty-free bundle if a reasonable-size direct
download exists, BBC Sound Effects is NOT allowed (license), freesound is blocked). Where no good recording exists, SYNTHESIZE high quality
sounds offline in python (numpy/scipy: layered transients, filtered noise, convolution with synthetic IRs, proper envelopes) — e.g.
gunshot mechanics + tails, footsteps on surfaces, bullet cracks/whizzes, UI clicks. Normalize loudness consistently (approx -16 LUFS for
one-shots relative scale; note peak levels), trim silence, mono for positional one-shots, stereo for ambience/UI, encode .ogg (vorbis q5)
— get an ffmpeg (pip install imageio-ffmpeg provides a binary) or use soundfile/pyogg.
Deliver public/assets/audio/ with subfolders and these sound groups (multiple variations per group where noted, e.g. _01.._04):
weapons/: per weapon CLASS near shot (ar_556, ar_762, smg_9mm, smg_45, dmr, sr_bolt (big boom), sg_12g, lmg, pistol, pistol_magnum),
  plus suppressed variants (suppressed_rifle, suppressed_smg, suppressed_sr), distant shot tails (distant_rifle, distant_sniper,
  distant_smg_pistol) and indoor tail; mechanical: dry_fire, reload_mag_out, reload_mag_in, reload_bolt (charging), bolt_action_cycle,
  shotgun_pump, shell_insert, weapon_switch, ads_in, attach_equip, fire_mode_switch; shell casings dropping (brass on concrete/grass).
ballistics/: bullet_flyby (crack/whiz variants x4), impact_concrete, impact_metal, impact_wood, impact_dirt, impact_glass, impact_water,
  impact_flesh (hit marker body), hit_helmet (ding), hit_armor, headshot.
explosions/: grenade_explode (near/far), molotov_shatter + fire_loop, smoke_hiss, stun_bang, grenade_pin, grenade_bounce.
foley/: footsteps per surface (grass, dirt, gravel, concrete, wood, metal, water, sand; walk + run, x4 variations each), jump, land,
  prone crawl, cloth movement, bandage, medkit, energy drink can open, pill bottle, syringe, door_open/door_close (wood, metal),
  window_break, pickup_item, inventory drag, parachute_open, parachute_wind_loop, freefall_wind_loop, swim strokes, splash.
vehicles/: engine loops at multiple rpm for car (low/mid/high), motorcycle, buggy, boat; engine start/stop, horn, skid/tire screech loop,
  collision impacts (light/heavy), explosion, gear shift, gravel/dirt tire roll loop, plane engine drone loop (C-130 interior + exterior).
ambience/: wind_open_field loop, forest_birds loop, wind_strong loop, rain loop + rain on roof, thunder, ocean waves loop, river loop,
  indoor room tone, night crickets.
ui/: click, hover, open_inventory, close_inventory, zone_warning (alarm-like 'restricting play area' cue), countdown beep, kill_confirm,
  knock_confirm, victory sting, defeat sting, match_start, airdrop_incoming, lobby music loop (synthesize something tasteful).
Budget 60 MB total. manifest.json: every file with group, description, duration, channels, source, license, loop flag.
Verify all files decode (load them in headless Chromium via AudioContext.decodeAudioData) and report.`,
  },
]

// args.categories: only these category keys (default: all).
// args.verifyOnly: keys whose acquisition is already done — skip straight to the verify stage.
const SELECT = (args && args.categories) || null
const VERIFY_ONLY = new Set((args && args.verifyOnly) || [])
const LIST = SELECT ? CATEGORIES.filter((c) => SELECT.includes(c.key)) : CATEGORIES

const results = await pipeline(
  LIST,
  (c) => VERIFY_ONLY.has(c.key)
    ? Promise.resolve({ category: c.key, delivered: ['(delivered in an earlier session — read the category manifest.json + README.md)'], missing: [], totalMB: 0, notes: 'verify-only resume run' })
    : agent(`${COMMON}\nOUTPUT DIRS: ${c.out}\nCATEGORY BUDGET: ${c.budget}\nRESUME NOTES FROM THE LEAD: ${(args && args.notes && args.notes[c.key]) || '(none)'}\n\n${c.prompt}`, {
    label: `acquire:${c.key}`,
    phase: 'Acquire',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        delivered: { type: 'array', items: { type: 'string' }, description: 'files/ids delivered with one-line quality note each' },
        missing: { type: 'array', items: { type: 'string' }, description: 'requested items not delivered and why' },
        totalMB: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['category', 'delivered', 'missing', 'totalMB', 'notes'],
    },
  }),
  (acq, c) => agent(`${COMMON}\nYou are the independent VERIFIER for category '${c.key}' (output dirs: ${c.out}). Another agent just produced these assets.
Its report: ${JSON.stringify(acq)}
Original spec for that agent:\n${c.prompt}\n
Your job: be skeptical. Load EVERY delivered file the way the game will (three.js GLTFLoader with MeshoptDecoder in headless Chromium; textures via
TextureLoader; audio via decodeAudioData), check: file loads without errors; conventions from docs/ASSETS.md (+Z forward, +Y up, meters,
plausible real-world bounds, origin placement, required named nodes, clip names, manifest accuracy, file size limits); visual quality (render
a contact sheet and LOOK at it with Read — flag broken normals, missing textures, black/pink materials, inside-out faces, blocky/toy look,
wrong orientation, absurd scale, broken animation retargets). FIX every problem you can directly (re-export, re-orient, rescale, add missing
nodes, correct the manifest, delete junk). Save the final contact sheet(s) as /home/user/code/docs/asset-previews/${c.key}*.png (small PNG/JPG, < 1 MB each).
Ensure no raw/intermediate junk was left in public/assets. Report honestly what remains weak.`, {
    label: `verify:${c.key}`,
    phase: 'Verify',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        issuesFound: { type: 'array', items: { type: 'string' } },
        issuesFixed: { type: 'array', items: { type: 'string' } },
        remainingProblems: { type: 'array', items: { type: 'string' } },
        previews: { type: 'array', items: { type: 'string' } },
        verdict: { type: 'string' },
      },
      required: ['category', 'issuesFound', 'issuesFixed', 'remainingProblems', 'previews', 'verdict'],
    },
  }).then((v) => ({ acquire: acq, verify: v })),
)
return results