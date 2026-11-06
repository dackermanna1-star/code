# Dead County — Architecture & Module Contracts

Voxel zombie-survival sandbox (Minecraft look & movement + DayZ / Project Zomboid survival) set in the fictional
town of **Millbrook, Kentucky** and its surrounding county. Browser game: **Three.js r187**, plain JavaScript ES
modules, bundled by **Vite**. No other runtime dependencies (fonts: `@fontsource/vt323`, `@fontsource/silkscreen`).

Run: `npm install && npm run dev` → http://localhost:5173

## Conventions

* 1 block = 1 metre. Player is 0.6 × 1.8 m (eye height 1.62). Zombies similar.
* Axes: **X east, Y up, Z south**. Yaw 0 = facing **+Z**; an entity's `root.rotation.y = yaw`.
* World is finite: **1024 × 64 × 1024** blocks. `SURFACE = 20` is the y of the top block of flat town ground
  (road / lawn). Building floor blocks sit at y=20, walls start at y=21. `WATER_LEVEL = 18`.
* All procedural content uses the seeded RNG / noise in `src/core/rng.js` — **never `Math.random()`** in
  generation code (worlds must regenerate identically from the seed; saves store only the seed + diffs).
  Runtime gameplay randomness (combat rolls, particles) may use `Math.random()`.
* Game time: 1 in-game day = 24 real minutes (1 game hour = 1 real minute). Game starts Day 1, 08:00, early October
  (autumn: orange/red leaves, cool nights ~4 °C, days ~16 °C).
* Plain JS objects for all state that is saved (JSON serialisable).

## Directory / ownership

| Path | Owner | Purpose |
|---|---|---|
| `src/core/rng.js` | core | seeded RNG (`makeRng`), hashes, simplex `makeNoise2D/3D`, `fbm2`, `clamp/lerp/smoothstep` |
| `src/world/blocks.js` | core | block registry (`B.name` → id, `BLOCKS[id]` → def), shapes, face textures |
| `src/world/World.js` | core | voxel storage, registries (containers, doors, vehicles, POIs, spawns…), lighting |
| `src/world/raycast.js` | core | voxel DDA raycast, `lineOfSight` |
| `src/world/Mesher.js`, `ChunkRenderer.js` | core | chunk meshing / rendering |
| `src/world/gen/**` | **worldgen** | `generateWorld()` – the town, county, interiors, loot placement, lore notes |
| `src/render/textures.js` | **textures** | procedural 16×16 block textures |
| `src/render/materials.js` | core | shared lighting GLSL, `createEntityMaterial()` |
| `src/render/*` (others) | core | renderer, sky, weather, post-processing |
| `src/audio/**` | **audio** | procedural WebAudio SFX, ambience, music |
| `src/items/**` | **items** | item database, icons, loot tables, crafting recipes |
| `src/inventory/Inventory.js` | core | inventory model (`PlayerInventory`, `moveStack`, `quickMove`) |
| `src/entities/zombie/**`, `src/entities/fx/**`, `src/entities/vehicles/**` | **entities** | zombie models/skins/animation/ragdoll, corpse visuals, blood & impact FX, decals, car models |
| `src/entities/*.js` (top level) | core | zombie AI, zombie manager, item entities |
| `src/player/Viewmodel.js` (+ `src/player/viewmodel/**`) | **viewmodel** | first-person hands & weapon models and animations |
| `src/player/*` (others) | core | player controller, survival, combat |
| `src/ui/**` | **ui** | all DOM UI: HUD, inventory, crafting, health, map, menus |
| `src/core/Game.js`, `src/main.js` | core | orchestration |
| `dev/**` | anyone | test pages / scripts. Prefix your files with your module name. |

Rules for parallel work: only edit files you own. Do not edit `package.json` or add dependencies. Do not commit.
If you need a change in a core file, describe it in your final report instead.

---

## Shared core modules (already written)

### `src/core/rng.js`
```js
makeRng(seed) -> { next(), range(a,b), int(a,b), chance(p), pick(arr), weighted([[item, w], ...] | [{w,...}]), shuffle(arr), fork(salt) }
hash32(a,b,c,d), hash01(a,b,c,d), seedFromString(str)
makeNoise2D(seed) -> (x,y) => [-1,1];  makeNoise3D(seed) -> (x,y,z) => [-1,1]
fbm2(noise2, x, y, octaves=4, lacunarity=2, gain=0.5)
clamp, lerp, smoothstep
```

### `src/world/blocks.js`
* `B.<name>` → numeric id, `BLOCKS[id]` → def, `blockByName(name)`.
* Def fields: `name, tex, render ('cube'|'boxes'|'cross'|'liquid'|'none'), pass ('opaque'|'cutout'|'translucent'),
  solid, opaque, light, lightFilter, mat, hp, breakWith, drops, becomes, container (default loot table), slots,
  oriented, door, slow, damage, sway, climbable, interact, hides, flammable`.
* `tex` is `{all}` or `{top, bottom, side, front, back}`. `faceTexture(def, face, meta)` resolves it.
* **Facing / meta** (stored sparse in `world.meta`): bits 0-1 facing — `0 = +Z (south)`, `1 = -X (west)`,
  `2 = -Z (north)`, `3 = +X (east)`. Oriented blocks show their `front` texture toward the facing direction.
  Box shapes are authored for facing 0 (front toward +Z, back against z=0) and rotated (`rotateBox`).
  Doors: bit2 open, bit3 top half, bit4 barricaded. `sign_letter`: bits 2-7 char index in `SIGN_CHARS`.
* Stairs (`stairs_wood`, `stairs_concrete`, `roof_*_stairs`): the high step is at the **back (−Z for facing 0)**,
  so you walk up them travelling in the **opposite** direction of facing. A stair with facing 0 is climbed while
  walking toward −Z.
* `allTextureNames()` lists every texture name needed (blocks + `EXTRA_TEXTURES`).
* Fast tables: `SOLID, OPAQUE, LIGHT_EMIT, LIGHT_FILTER, IS_CONTAINER, IS_DOOR, IS_FULL_CUBE` (Uint8Array by id).
* `getBoxes(id, meta)`, `getCollisionBoxes(id, meta)`, `FACING_DIR`, `facingFromDir(dx, dz)`.

### `src/world/World.js`
```js
import { World, SURFACE, WATER_LEVEL, ZONES, CHUNK } from './World.js'
world.SX, SY, SZ; world.seed
world.get(x,y,z) -> id            // 0 = air; y<0 -> bedrock; outside x/z -> air
world.set(x,y,z,id)               // RAW set (generation)
world.fill(x0,y0,z0,x1,y1,z1,id)  // inclusive box (fast, column-major)
world.walls(x0,y0,z0,x1,y1,z1,id) // hollow ring of walls
world.place(x,y,z, nameOrId, facing=0, extraMeta=0)  // set + facing meta
world.getMeta / setMeta
world.placeDoor(x,y,z, facing, kind='door_wood'|'door_white'|'door_metal'|'door_glass'|'door_cell', {locked, open, hp})
       // occupies (x,y,z) and (x,y+1,z). `locked` may be true or a key id string (e.g. 'key_police_armory')
world.placeContainer(x,y,z, blockName, facing, lootTable=null, {name, size, locked, fixed:[{id,count,data}]})
world.addContainer(x,y,z, lootTable, opts)  // register an already placed container block
       // Container blocks NOT registered still work with their block's default loot table.
world.placeSign(x,y,z, text, facing, dx, dz)  // letters A-Z 0-9 and " -+!&.'#", one block each
world.setZone(x0,z0,x1,z1, ZONES.X); world.getZone(x,z)
world.addPOI({name, type, x0, z0, x1, z1})       // named locations (map labels, "entering ..." banner)
world.addVehicle({type, x, y, z, yaw, color, wrecked, burned, alarm, loot, gloveLoot})
world.addCorpse({x, y, z, yaw, outfit, loot})     // dead survivors / soldiers lying around (lootable)
world.addFloorLoot(x, y, z, lootTable, chance)    // items lying on the floor / tables (spawned at game start)
world.addNote(x, y, z, noteId)                    // readable note lying at the position (see gen/lore.js)
world.addZombieSpawn({x, y, z, count, radius, types?, outfit?, indoor?})  // static zombie groups
world.addSpawnPoint({x, y, z, yaw})               // candidate player start positions
world.computeHeightmap(); world.height[z*SX+x]    // highest non-air block
world.skyAt(x,y,z), world.blockLightAt(x,y,z)     // 0..15 (after lighting)
world.forEachSolidBox(minX,minY,minZ,maxX,maxY,maxZ, cb)
world.setBlock(x,y,z,id,meta) // RUNTIME edits (relight + remesh + save diff) – not for generation
```
Zones: `WILD FOREST FARM SUBURB DOWNTOWN COMMERCIAL INDUSTRIAL HIGHWAY MILITARY HOSPITAL POLICE PARK WATER CAMP TRAILER SCHOOL ROAD CEMETERY GAS`.

### `src/world/raycast.js`
`raycast(world, ox,oy,oz, dx,dy,dz, maxDist, filter?) -> {x,y,z,id,nx,ny,nz,dist,px,py,pz} | null`,
`solidFilter`, `sightFilter`, `rayBox(...)`, `lineOfSight(world, ax,ay,az, bx,by,bz)`.

### `src/render/materials.js`
* `globalUniforms` — shared lighting uniforms updated by the renderer every frame (sun/moon, ambient, fog,
  flashlight, 8 dynamic point lights, lightning).
* `LIGHTING_GLSL` — GLSL3 chunk declaring those uniforms plus
  `vec3 computeLighting(vec3 worldPos, vec3 normal, float sky01, float block01, float ao)` and
  `vec3 applyFog(vec3 col, vec3 worldPos)`. Use it in any custom ShaderMaterial (`glslVersion: THREE.GLSL3`,
  spread `...globalUniforms` into your uniforms) so custom geometry is lit like the world.
* `createEntityMaterial({map, color, transparent, alphaTest, side, noFog, emissive, opacity, depthWrite})`
  → lit ShaderMaterial. **Do not use Three.js lights or standard materials** – the scene has no lights.
* `setEntityLight(mat, sky01, block01)` – voxel light at the entity (sample `world.skyAt/blockLightAt` /15).
* `setEntityTint(mat, color, amount)`, `setEntityOpacity(mat, o)`, `setEntityMap(mat, tex)`.
* Textures for entities: use `THREE.CanvasTexture` / `DataTexture` with `magFilter = minFilter = NearestFilter`,
  `colorSpace = THREE.SRGBColorSpace`, `generateMipmaps = false`.
* Output is linear HDR; the post pass applies tone mapping, so colours may be authored normally (sRGB textures).

### `src/inventory/Inventory.js`
```js
EQUIP_SLOTS = ['head','face','torso','jacket','vest','hands','legs','feet','back'];  HOTBAR_SIZE = 9
class PlayerInventory {
  hotbar: Array(9)<stack|null>; equipment: Array(9)<stack|null> (EQUIP_SLOTS order); selected; maxWeight; version
  selectedStack; getEquipped(slot); setEquipped(slot, stack)
  hotbarDesc(); equipmentDesc(); storageDescs()  // container descriptors (see below)
  allDescs()            // hotbar + storage
  totalWeight(); forEachStack(cb); find(pred); count(pred); has(pred,n); remove(pred,n); removeStack(stack)
  addItem(stack) -> leftover|null
  changed()             // bump version + onChange
}
moveStack(srcDesc, si, dstDesc, di, count?) -> bool     // merge / move / swap
quickMove(srcDesc, si, targetDescs[]) -> bool            // shift-click
splitStack(desc, i)
```
**Container descriptor**: `{ key, name, kind, slots: Array<stack|null>, owner?, accepts?(stack, index), onChange?() }`
`kind`: `hotbar | equipment | clothing | world | floor | corpse | vehicle`. Pockets and backpacks are the
`contents` array of the equipped clothing item (items keep their contents when dropped, DayZ-style).

---

## Items (`src/items/`) — owner: items

### Files & API (keep these exports)
* `items.js`: `ITEMS` (id → def), `getItemDef(id)`, `createItem(id, opts)`, `itemWeight(stack)`,
  `canStack(a,b)`, `itemDisplayName(stack)`, `itemFreshness(stack, nowHours)`, `ITEM_TAGS` (optional docs).
* `icons.js`: `getItemIcon(idOrDef) -> HTMLCanvasElement (16×16, cached)`, `getItemIconURL(idOrDef) -> dataURL`.
* `loot.js`: `LOOT_TABLES`, `generateLoot(tableName, rng, {scavenging=0 (0..10), day=1, size}) -> stack[]`.
* `crafting.js`: `RECIPES`, `getRecipeStatus(inv, ctx) -> [{recipe, canCraft, missing:[{label, have, need}]}]`,
  `craft(inv, recipe, ctx) -> {ok, message, results: stack[]}`. `ctx = {nearFire, nearWorkbench, skills:{name: level}}`.

### Item stack (instance)
`{ id, count, dur?, ammo?, ammoType?, uses?, age?, contents?, data?, mode? }` — see header of `items.js`.

### Item def schema (fields read by game logic)
```js
{
  id, name, desc, category, weight /*kg*/, stack /*max*/, rarity: 'common'|'uncommon'|'rare'|'epic',
  icon: {...}          // private to icons.js
  model: 'pistol'|...  // first-person model id (see Viewmodel); default 'generic' (extruded icon)
  tags: [...],         // capabilities, see below
  durability?, uses?, capacity? /*slots*/, weightReduction? /*0..1 for bags*/,
  food?:  { hunger, thirst, health, sickness, panic, energy, spoils /*game hours*/, needsOpener, raw, cookTo, leaves /*item id left after eating, e.g. 'tin_can'*/, eatTime },
  drink?: { thirst, sickness, alcohol, energy, perUse: true },   // 1 use consumed per drink when def.uses
  liquidContainer?: { capacity /*uses*/ },  // refillable: stack.data.liquid = 'water'|'dirty_water'|'gasoline'|null
  medical?: { stopBleed, heal, disinfect, antibiotic, antiviral, painkiller, splint, suture, sterile, time },
  melee?:   { damage, speed /*swings per sec*/, range, knockback /*0..2*/, stamina, type: 'blunt'|'blade'|'stab'|'heavy', noise, crit, headMult, sweep, knockdown /*0..1*/, durabilityLoss, twoHanded },
  firearm?: { ammo: [ammoItemIds], magSize, damage, fireRate /*shots per sec*/, modes: ['semi'|'auto'|'pump'|'bolt'], pellets, spread /*hip, radians*/, adsSpread, recoil /*degrees*/, range, reload: 'mag'|'shell'|'single'|'break', reloadTime, shellTime, noise /*radius in blocks*/, aimFov, scope, suppressed, durabilityLoss, sound },
  clothing?: { slot, insulation /*0..1*/, water /*0..1 resistance*/, bite /*0..1*/, scratch /*0..1*/, speed /*mult*/, noise },
  light?:    { range, cone, drain /*battery % per game hour*/ },
  throwable?:{ kind: 'molotov'|'pipebomb'|'grenade'|'flare'|'noise'|'smoke', fuse, radius, damage, noise },
  book?:     { skill, mult, hours } | { panic, boredom },
  attachment?: { kind: 'suppressor', fits: [firearmIds], uses },
}
```
Tags the game logic understands: `can_opener` (opens cans), `blade` (cut/rip clothing, also opens cans),
`chop` `blunt` `heavy` `pry` `dig` (block breaking classes, see block `breakWith`), `hammer` (barricading),
`saw`, `fire_starter`, `lockpick`, `fabric` (clothing that can be ripped into rags), `fuel`, `cooking_pot`,
`repair_blade`, `repair_gun`, `repair_cloth`, `battery`, `watch`, `map`, `compass`, `binoculars`, `radio`.

### Required item ids (others reference these; add many more)
Materials: `plank log stick nails rag rag_dirty brick scrap_metal duct_tape glue thread wire rope gunpowder metal_pipe alarm_clock batteries tin_can glass_bottle plastic_bottle wheat corn pumpkin berries electronics`
Weapons: `fists kitchen_knife hunting_knife baseball_bat nail_bat crowbar hammer fire_axe hatchet machete golf_club frying_pan lead_pipe sledgehammer shovel katana spear police_baton wrench pitchfork wooden_club screwdriver`
Firearms: `pistol_m9 pistol_glock pistol_1911 revolver_357 shotgun_pump shotgun_double shotgun_sawed rifle_hunting rifle_ar15 rifle_m4 rifle_ak47 rifle_22 smg_mp5 crossbow bow`
Ammo: `ammo_9mm ammo_45 ammo_357 ammo_12g ammo_12g_slug ammo_556 ammo_762 ammo_308 ammo_22 crossbow_bolt arrow`
Medical: `bandage sterile_bandage disinfectant alcohol_wipes painkillers antibiotics antiviral splint suture_kit first_aid_kit vitamins morphine adrenaline sleeping_pills purification_tablets`
Food/drink: `canned_beans canned_soup canned_tuna canned_peaches canned_corn canned_meat dog_food mre chips chocolate cereal crackers peanut_butter granola_bar apple orange bread cheese raw_meat cooked_meat jerky candy instant_noodles potato carrot water_bottle soda energy_drink juice milk beer whiskey canteen water_jug`
Tools/misc: `flashlight headlamp lighter matches can_opener lockpick saw pot binoculars map_millbrook watch compass radio_handheld gas_can sewing_kit whetstone gun_cleaning_kit note book_aiming book_firstaid book_maintenance book_fitness book_sneaking book_melee book_scavenging novel comic cigarettes wallet photo dog_tags key_police_armory key_gunstore key_pharmacy`
Throwables: `molotov pipe_bomb frag_grenade flare noise_maker smoke_grenade`
Attachments: `suppressor suppressor_bottle`
Clothing (examples, ~50 total): head `baseball_cap beanie cowboy_hat bike_helmet motorcycle_helmet riot_helmet military_helmet firefighter_helmet hard_hat`;
face `bandana gas_mask surgical_mask balaclava`; torso `tshirt tank_top flannel_shirt dress_shirt sweater police_shirt scrubs_top military_shirt hospital_gown`;
jacket `hoodie denim_jacket leather_jacket winter_coat raincoat police_jacket firefighter_jacket military_jacket hunting_jacket lab_coat varsity_jacket`;
vest `tactical_vest police_vest plate_carrier hunting_vest`; hands `work_gloves leather_gloves winter_gloves tactical_gloves`;
legs `jeans cargo_pants sweatpants work_pants police_pants military_pants shorts scrubs_pants`;
feet `sneakers work_boots combat_boots hiking_boots rain_boots dress_shoes`;
back `backpack_school backpack_hiking backpack_military duffel_bag backpack_improvised`.

### Loot tables (canonical names — worldgen, blocks, zombies & vehicles use these)
Furniture defaults: `mailbox trash dumpster vending fridge freezer stove kitchen under_sink couch wardrobe dresser bookshelf desk medicine_cabinet laundry workbench garage toolbox gun_cabinet safe store_food store_general pharmacy store_looted store_drinks checkout clothing_store office locker hospital crate military_crate cardboard bar stash barrel`
Location overrides: `hardware_store gun_store gun_store_backroom sporting_goods gas_station liquor_store pharmacy_storage diner_kitchen police_locker police_armory police_evidence police_desk hospital_storage hospital_ward hospital_pharmacy school_locker school_office fire_station church motel_room warehouse farm_barn farm_shed mechanic hunting_cabin ranger_station campsite survivor_stash military_tent military_armory military_medical fema_supply trailer_home library electronics construction truck_cargo airdrop heli_crash`
Vehicles: `car_trunk car_glovebox police_car_trunk ambulance military_truck pickup_bed`
Zombie corpses: `zombie_civilian zombie_police zombie_military zombie_medic zombie_firefighter zombie_worker zombie_prisoner zombie_farmer zombie_hunter zombie_patient zombie_survivor`
Dead survivors: `corpse_civilian corpse_survivor corpse_police corpse_military`
Floor loot: `floor_house floor_store floor_street floor_office floor_military floor_hospital floor_camp`

---

## Audio (`src/audio/AudioEngine.js`) — owner: audio
```js
export class AudioEngine {
  init()                        // create AudioContext (called on first user gesture); safe to call twice
  update(dt)
  setListener(pos:{x,y,z}, forward:{x,y,z})
  play(name, {pos?, volume=1, pitch=1, maxDist?}) -> {stop()}   // pos = positional (HRTF/equalpower panner)
  loop(name, {pos?, volume}) -> {setVolume(v), setPos(p), setPitch(p), stop()}
  setAmbience({rain, wind, storm, night, indoor, underwater, heartbeat, tinnitus, breathing, tension})  // 0..1 each, smoothed
  thunder(distance01)
  setMusic(mood: 'menu'|'calm'|'night'|'tense'|'none')
  setVolumes({master, sfx, music, ambience})
}
```
Sound names: `gun_pistol gun_revolver gun_shotgun gun_rifle gun_ar gun_ak gun_smg gun_sniper gun_22 gun_suppressed crossbow bow dry_fire reload_mag_out reload_mag_in reload_shell pump bolt break_open break_close cock gun_jam swing_light swing_heavy hit_flesh hit_flesh_heavy hit_blunt hit_blade headshot hit_wood hit_metal hit_stone hit_glass glass_break bullet_impact bullet_impact_metal ricochet shell_drop footstep_grass footstep_dirt footstep_stone footstep_wood footstep_metal footstep_gravel footstep_water footstep_sand footstep_leaves footstep_cloth jump land land_hard zombie_groan zombie_idle zombie_alert zombie_attack zombie_hurt zombie_death zombie_scream zombie_bloater_pop zombie_brute_roar zombie_runner_shriek zombie_bash bite player_hurt player_hurt_heavy player_death cough breath_heavy heartbeat eat drink bandage pills zipper item_pickup item_drop equip ui_click ui_hover ui_open ui_close craft door_open door_close door_locked door_break door_bash container_open container_metal_open car_alarm helicopter thunder explosion fire_loop molotov_break flare_loop lighter match wood_chop barricade_hammer pry splash birds crickets owl wolf_howl distant_scream distant_gunshot radio_static flashlight_click block_break shove stomp throw sleep_start level_up`

## Entities & FX (`src/entities/zombie`, `fx`, `vehicles`) — owner: entities
```js
// zombie/ZombieModel.js
export const ZOMBIE_OUTFITS = ['civilian','civilian_f','office','police','military','medic','patient','firefighter','worker','prisoner','farmer','hunter','survivor']
export const ZOMBIE_VARIANTS = ['walker','runner','crawler','brute','screamer','bloater']
export function createZombieVisual({variant, outfit, seed}) -> ZombieVisual
ZombieVisual {
  root: THREE.Group            // feet at origin, yaw via root.rotation.y (0 faces +Z)
  height, radius
  setLight(sky01, block01)
  flash(colorHex, amount)      // hit flash (decays automatically in update)
  update(dt, anim)             // anim: {state, speed, attackT, aggro, lookYaw?, lookPitch?}
       // states: idle walk run crawl attack bash stagger knockdown down getup feed scream
  hitReact(part, dirWorld:THREE.Vector3, strength01)
  addWound(part, worldPoint?)  // paint blood on the zombie skin texture around that part
  dismember(part) -> THREE.Vector3|null   // 'head'|'armL'|'armR'|'legL'|'legR' — hide part, return stump position
  hasPart(part)
  raycast(origin:Vector3, dir:Vector3, maxDist) -> {part, point:Vector3, distance}|null   // precise per-part hit test
  getPartPosition(part, out:Vector3) -> Vector3
  startRagdoll(impulse:Vector3, hitPart, isSolid:(x,y,z)=>bool)  // switch to verlet ragdoll
  updateRagdoll(dt) -> bool    // false once settled (then cheap / frozen)
  dispose()
}
export function createCorpseVisual({outfit, seed}) -> {root, setLight(sky, block), dispose()}  // lying dead body
// fx/FX.js
export class FX { constructor(scene, world); update(dt, camera); blood(pos, dir, amount); bloodSplat(pos, normal, size);
  bloodPool(pos, size); gore(pos, dir, amount); impact(pos, normal, mat); muzzleFlash(pos, dir); shell(pos, dir, kind);
  glass(pos); explosion(pos, radius); smoke(pos, opts)->{stop()}; fire(pos, opts)->{stop(), setPos(p)}; sparks(pos, dir);
  splash(pos); dust(pos, color?); blockBreak(pos, colorRGB); tracer(from, to); clear() }
// vehicles/CarModels.js
export const CAR_TYPES = ['sedan','hatchback','suv','pickup','van','police','ambulance','military_truck','humvee','bus','semi','firetruck','tractor']
export function createCarVisual({type, color, wrecked, burned, seed}) -> {root, halfExtents:{x,y,z}, setLight(sky, block), lights?:{...}, dispose()}
     // root origin = centre of the car at ground level, front faces +Z (yaw 0)
```

## Viewmodel (`src/player/Viewmodel.js`) — owner: viewmodel
```js
export class Viewmodel {
  constructor()                      // owns its own THREE.Scene + PerspectiveCamera (fov 70)
  scene, camera
  setItem(stack|null)                // builds model from getItemDef(stack.id).model (or extruded icon); plays equip anim
  update(dt, s)                      // s: {moving01, sprinting, aiming, crouching, grounded, lookDX, lookDY, light:{sky, block}, time}
  fire(recoilScale=1)                // kick + muzzle flash sprite
  swing(heavy=false) -> hitDelay     // seconds until the swing "connects"
  shove()
  reloadStart(kind, duration)        // kind: 'mag'|'shell'|'single'|'break'
  reloadInsert()                     // one shell / round inserted (shell / single reload)
  reloadEnd()
  pump(); bolt()                     // cycling animations
  use(kind, duration)                // 'eat'|'drink'|'bandage'|'pills'|'read'|'inject'|'craft'
  throwItem()                        // throw animation
  cancel()                           // stop any action anim
  getMuzzleWorldPosition(mainCamera, out) -> Vector3   // for tracers / muzzle light
  render(renderer)                   // renderer.clearDepth(); renderer.render(scene, camera)
}
```
Model ids: guns `pistol pistol_1911 revolver shotgun_pump shotgun_double shotgun_sawed rifle_hunting rifle_ar rifle_ak rifle_22 smg crossbow bow`;
melee `knife knife_hunting bat bat_nail crowbar hammer axe_fire hatchet machete golf_club pan pipe sledgehammer shovel katana spear baton wrench pitchfork club screwdriver`;
other `fists flashlight molotov pipe_bomb grenade flare bottle generic`.

## UI (`src/ui/`) — owner: ui
See `docs/UI_API.md`.

## World generation (`src/world/gen/`) — owner: worldgen
`export async function generateWorld(world, seed, onProgress)` in `src/world/gen/index.js`;
`await onProgress(fraction01, label)` periodically (it yields to the browser). `src/world/gen/lore.js` exports
`NOTES` (`{[noteId]: {title, text}}`) and `RADIO_BROADCASTS` (`[{day, text}]`).
