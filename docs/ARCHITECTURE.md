# Architecture

CaliberCraft is a single Fabric mod with split client/server source sets (`src/main`, `src/client`), so client
classes can never be loaded on a dedicated server. Gameplay rules live in a dependency-free `core` package that
is unit-tested without Minecraft running.

```
src/main/java/dev/calibercraft/
  CaliberCraft.java      entry point: registries, networking, reload listener, tick hooks
  core/                  pure logic (no world access): stats, ammo/chamber rules, reload state machine,
                         fire-rate limiter, trigger gate, heat, deterministic ballistics math
  data/                  data-driven definitions (weapon/attachment/ammo/skin), loader, validation, holders
  item/                  item classes and WeaponStacks (all reads/writes of a weapon stack's components)
  server/                GunService (firing, actions, ticking), GunsmithService (customization), ammo inventory
  combat/                BulletManager (projectile simulation), damage, surfaces
  network/               payload records and their stream codecs
  registry/              items, blocks, components, sounds, particles, tags, loot injection, creative tab
  config/                ServerConfig (server.json)
src/client/java/dev/calibercraft/client/
  GunController.java     local input → prediction → FirePayload / GunActionPayload; recoil; client reload runner
  animation/             GunAnimator: procedural first-person pose and moving parts
  render/                FirstPersonRenderer (arms + weapon parts), weapon_render data
  hud/                   ammo panel, crosshair, reticles, scope overlay, hit markers
  screen/                gunsmith screen (+ picture-in-picture 3D preview), settings screen
  sound/, fx/            layered gun audio; particles, casings, decals, tracers
  mixin/                 input routing, first-person hand replacement, camera, zoom, third-person pose
  config/                ClientConfig (client.json)
src/test/java            JUnit tests for core logic and data/asset consistency
src/gametest/java        server game tests and the client game test (separate test mod)
tools/                   Python generators for textures, sounds, models, data, language file and docs
```

## Weapon state

A weapon is an ordinary item stack. Its state lives in data components, so it survives inventories, chests,
death drops and server restarts, and is synchronized by vanilla:

* `calibercraft:gun_state` — rounds in the magazine, chambered round, loaded and selected ammunition type,
  fire mode, last accepted shot sequence, heat, and an action counter used to reconcile client prediction.
* `calibercraft:attachments` — installed attachment per slot.
* `calibercraft:skin` — selected finish.
* `minecraft:custom_model_data` — derived from the above (skin + one string per slot); the item model
  definition (`assets/calibercraft/items/<weapon>.json`) uses `select`/`composite` on these strings, so every
  combination of skin and attachments renders without any custom renderer in GUIs, item frames, dropped items
  and third person.

Transient per-player state (reload in progress, aim start, rate limiter, last melee) is kept server-side in
`PlayerGunData` and is never saved.

## A shot, end to end

1. **Client** (`GunController`): the trigger is sampled every frame. If the predicted state can fire and the
   fire-rate interval has elapsed, the client sends `FirePayload(seq, pullId, yaw, pitch, spread, slot)`,
   immediately plays the shot (sound, flash, recoil, casing) and predicts the ammunition change. Pellet
   directions are not sent; both sides derive them from a seed.
2. **Server** (`GunService.handleFire`) validates in order: correct slot, new sequence number (duplicates and
   replays are dropped), not equipping, not reloading/cycling (with a ≤3-tick catch-up for runners about to
   finish, so network jitter does not eat shots), not overheated, a round is chambered, the fire mode allows a
   shot for this trigger pull (semi = one per pull, burst = N per pull), and the token-bucket rate limiter
   allows it. Rejected shots are acknowledged so the client resynchronizes.
3. The server consumes the round (`AmmoLogic.fire`), adds heat, then spawns the projectiles: the aim direction
   is the client's if it is within `maxAimDeviationDegrees` of the server's view, and the spread is the client's
   value clamped between a server-computed minimum and maximum. Directions come from
   `Ballistics.pelletDirections(seed, …)` with a seed derived from a per-player secret salt and the sequence.
4. `BulletManager` advances each projectile once per tick (first tick immediately), sub-stepped, with gravity:
   entity hits (head detection, penetration through bodies), water entry, glass shattering, ricochets,
   penetration through blocks by hardness, damage falloff over distance. Damage per target is aggregated per
   shot (so a shotgun blast is one hit with the summed damage) and applied with the `calibercraft:bullet` damage
   type, which bypasses vanilla's hurt cooldown and uses its own armour formula with armour penetration.
5. Nearby players receive `ShotEventPayload` (sound, flash, tracer for other people's shots),
   `ImpactPayload` (impact effects), `WhizPayload` (near misses) and the shooter gets `HitConfirmPayload`.

## Reloads and manual actions

`ReloadRunner` is one state machine shared by client (animation, sounds, prediction) and server (authority).
A reload kind (`TACTICAL`, `EMPTY`, `SINGLE`, `CYCLE`) is chosen from the definition and current state, and a
timeline drives it: **commit** is the tick where the magazine is actually exchanged (rounds move between
weapon and inventory there, never earlier), **chamber** is where a round is chambered, and **cues** fire
sounds and animations. Single-round reloads (pump shotgun) load one shell per step and can be stopped by
firing. Interrupting a reload (switching items or dropping the weapon) before the commit changes nothing;
after it, the exchange already happened, so rounds are never lost or duplicated. Because the server runs the same machine from its own clock, a modified client
cannot reload faster than the definition allows.

## Data flow for definitions

`CaliberDataLoader` (a reload listener) reads `data/*/calibercraft/{weapon,attachment,ammo,skin}`, re-reads
`server.json`, applies `weaponOverrides`, validates cross-references and publishes an immutable `CaliberData`
snapshot. The snapshot plus the client-relevant server settings is sent to each player on join and after
`/reload` (`SyncDataPayload`); the client keeps it in `CaliberDataHolder.client()`. Effective statistics are
always computed the same way on both sides: `WeaponStats.compute(base, modifiers)` =
`(base + Σadd) × Πmultiply`, clamped per stat.

## Customization

`GunsmithPayload` requests (install, remove, skin, reset) are validated by `GunsmithService`: the weapon must be
held and idle, the attachment must be allowed for the slot, the slot must be reachable (quick-detach or bench in
range), and the player must own the attachment item (or the finish kit). Installing consumes the item; removing
or replacing returns the old one; magazine changes that lower capacity return the excess rounds. The screen
previews a candidate locally by applying it to a copy of the stack and computing stats with the same code.

## Rendering

* **GUI, ground, frames, third person:** standard item models generated per weapon/skin/attachment, selected
  through the item model definition (see above). The third-person arm pose is switched to a two-handed hold.
* **First person:** `ItemInHandRendererMixin` replaces the vanilla hand rendering while a firearm is held.
  `FirstPersonRenderer` draws the player's own arms (with their skin) and the weapon split into parts
  (`fp/<weapon>/static` plus moving parts such as the magazine, slide, bolt, pump, cylinder, hammer, feed
  cover). `GunAnimator` computes the pose of each part every frame from the weapon state, the reload runner's
  timeline position, aiming, movement and recoil, so animations and ammunition logic cannot disagree.
  `weapon_render/<weapon>.json` (generated with the models) supplies pivots, hand grip points, sight height,
  muzzle and ejection-port positions.
* **Effects:** custom particles (smoke, sparks, flash, casings with physics, oriented bullet-hole decals),
  tracers rendered after entities, scope overlay and reticles on the HUD.

## Adding a weapon

1. Register the item id in `registry/ModItems.WEAPON_IDS` and its mechanical sound cues in
   `registry/ModSounds.WEAPON_MECHANICS`.
2. Describe the model in `tools/assetgen/models/weapons/<id>.py` (boxes with material roles, moving parts,
   attachment mount points) and list it in `generate_models.py`.
3. Add its statistics, reload timelines, compatible attachments, recipe and loot entries to
   `tools/datagen/generate_data.py`, its sounds to `tools/assetgen/sounds/generate_sounds.py` and its name to
   `tools/datagen/generate_lang.py`.
4. Run the generators (see the README) and `./gradlew test runGameTest`. The resource consistency tests fail
   with a precise message for anything missing (model, texture, sound file, translation, recipe target,
   attachment cross-reference).
