# Configuration guide

CaliberCraft has two configuration files and a data-driven content format.

| File | Side | Edited with | Applied |
|---|---|---|---|
| `config/calibercraft/server.json` | server (and singleplayer) | text editor | at startup and on `/reload` |
| `config/calibercraft/client.json` | each client | in-game settings screen or text editor | immediately (screen) / at startup (file) |
| `data/<namespace>/calibercraft/...` | server, synced to clients | data packs | at startup and on `/reload` |

Both files are created with defaults on first launch. Every value is validated: out-of-range numbers are
clamped (and a warning names the option), unknown enum values fall back to the default, and the corrected
values are written back so the file always shows what is active. If `server.json` cannot be parsed at all,
the error is logged and the previous settings stay active (defaults at startup); the file is left untouched so
you can fix it and run `/reload`.

## Server options (`server.json`)

| Option | Default | Range | Effect |
|---|---|---|---|
| `displayName` | `"CaliberCraft Arsenal"` | text | Creative tab title |
| `damageMultiplier` | `1.0` | 0 – 100 | Multiplies every weapon's damage |
| `headshots` | `true` | | Enables head-hit multipliers (`headshot_mult`) |
| `infiniteAmmoCreative` | `true` | | Creative players never consume ammunition |
| `infiniteAmmo` | `false` | | Nobody consumes ammunition (reloads still play) |
| `bulletsBreakGlass` | `true` | | Bullets shatter glass and panes; respects spawn protection and build permissions |
| `penetration` | `true` | | Bullets pass through soft blocks and through bodies (per weapon `penetration`) |
| `ricochets` | `true` | | Grazing hits on hard surfaces can ricochet |
| `weaponHeat` | `true` | | Heat build-up and overheating for weapons with `heat_per_shot` (the LMG) |
| `meleeBash` | `true` | | Enables the melee bash key |
| `bulletWhiz` | `true` | | Near-miss whiz sounds for players a bullet passes |
| `fieldCustomization` | `"quick_detach"` | `all`, `quick_detach`, `none` | What can be changed without a gunsmith bench: everything, quick-detach slots only (optic, muzzle, grip, magazine, tactical, charm) or nothing |
| `rareSkinsRequireKit` | `true` | | Rare/legendary skins consume a Prismatic Finish Kit in survival |
| `lootInjection` | `true` | | Adds weapons, attachments, parts and ammunition to vanilla chest loot |
| `maxActiveBullets` | `4096` | 64 – 65536 | Upper bound of simultaneously simulated bullets per dimension (oldest are dropped) |
| `fireBurstAllowance` | `3.0` | 1 – 10 | How many shots may arrive back-to-back faster than the cyclic rate (absorbs network jitter); lower is stricter |
| `maxAimDeviationDegrees` | `35.0` | 1 – 180 | Largest accepted difference between the aim a client reports and the server's view of it; larger differences fire along the server's view |
| `spreadTolerance` | `0.6` | 0 – 1 | Lowest fraction of the server-computed spread a client may report (clients cannot claim tighter spread than this) |
| `audibleRange` | `192.0` | 16 – 1024 | Distance (blocks) at which an unsuppressed gunshot is sent to other players; scaled by the weapon's `loudness` |
| `weaponOverrides` | `{}` | | Per-weapon stat overrides, see below |

### Per-weapon stat overrides

`weaponOverrides` replaces individual base statistics without writing a data pack. Keys are weapon ids, values
map stat names (see [Statistics](#statistics)) to numbers:

```json
"weaponOverrides": {
  "calibercraft:ak": { "damage": 8.0, "rpm": 620 },
  "calibercraft:sniper": { "headshot_mult": 2.5, "magazine": 4 }
}
```

Unknown weapons or stats are reported in the log and ignored. Values are clamped to the stat's limits. Run
`/reload` to apply; connected players receive the new values immediately.

## Client options (`client.json`)

Open the settings from the gunsmith screen (**Settings** button) or bind the *CaliberCraft settings* key.
Every option has a tooltip in game.

| Option | Default | Effect |
|---|---|---|
| `hudEnabled` | `true` | Shows the ammunition panel |
| `hudCorner` | `0` | 0 bottom right, 1 bottom left, 2 top right, 3 top left |
| `hudScale` | `1.0` | 0.5 – 2.0 |
| `hudOffsetX`, `hudOffsetY` | `0` | Fine positioning in GUI pixels (file only) |
| `simplifiedHud` | `false` | High-contrast, text-only panel |
| `hitMarkers` | `true` | Hit/headshot/kill markers at the crosshair |
| `damageNumbers` | `false` | Floating damage numbers |
| `crosshairStyle` | `0` | 0 dynamic (shows the real spread), 1 static dot, 2 hidden |
| `particleQuality` | `2` | 0 low, 1 medium, 2 high |
| `shellCasings` | `true` | Ejected casings |
| `maxCasings` | `64` | Casing particle cap (file only) |
| `tracers` | `true` | Tracer streaks |
| `muzzleFlash` | `true` | Muzzle flash sprite |
| `muzzleLight` | `true` | The first-person weapon is lit by its own muzzle flash for a moment |
| `bulletHoles` | `true` | Bullet hole decals |
| `maxBulletHoles` | `128` | Decal cap (file only) |
| `screenShake` | `1.0` | 0 – 2, camera shake when firing |
| `cameraRecoil` | `1.0` | 0 – 2, how much recoil moves the camera (spread is unaffected) |
| `reducedMotion` | `false` | Disables sway, bobbing, inspect flourishes and screen shake |
| `toggleAim` | `false` | Right-click toggles aiming instead of holding |
| `aimSensitivity` | `1.0` | Mouse sensitivity multiplier while aiming with iron sights / red dots |
| `scopeSensitivity` | `1.0` | Mouse sensitivity multiplier while looking through magnified optics |
| `gunVolume` | `1.0` | 0 – 2, on top of the *Players* volume slider |
| `reduceRepeatedSounds` | `true` | Slightly softens long automatic bursts |
| `soundTravelDelay` | `true` | Distant gunshots arrive later than their flash |
| `soundOcclusion` | `true` | Gunshots behind walls are muffled |

## Data packs

All content is defined by JSON under `data/<namespace>/calibercraft/`:

```
weapon/<id>.json       weapon definitions (the id must match a registered weapon item, e.g. calibercraft:ak)
attachment/<id>.json   attachments
ammo/<id>.json         ammunition types
skin/<id>.json         skins
```

A data pack can retune or replace any shipped definition (same id), change which attachments fit which weapon,
and add new attachments and ammunition types. New attachments and ammunition can use any existing item; only
the shipped attachments have 3D models on the weapons, so a new attachment works mechanically but is not drawn
on the gun. Adding a new *weapon item* requires code (item registration) and models.

Definitions are validated after loading: references to unknown attachments, attachments listed under the wrong
slot, factory attachments that are not allowed, and calibers without ammunition are reported in the log and
ignored instead of breaking the game. The shipped definitions are in
`src/main/resources/data/calibercraft/calibercraft/` and are generated by `tools/datagen/generate_data.py`.

### Weapon

```json
{
  "category": "rifle",                 // pistol, revolver, smg, rifle, shotgun, sniper, lmg
  "caliber": "calibercraft:556",       // ammunition with the same caliber can be loaded
  "fire_modes": ["semi", "burst", "auto"],
  "burst_count": 3,
  "action": "self_loading",            // self_loading, bolt, pump, double_action
  "stats": { "damage": 6.0, "rpm": 750, "magazine": 30, "...": "see Statistics" },
  "reload": {
    "type": "magazine",                // magazine, cylinder, single
    "tactical": { "length": 40, "commit": 26, "cues": [{ "t": 6, "cue": "mag_out" }, { "t": 25, "cue": "mag_in" }] },
    "empty":    { "length": 50, "commit": 26, "chamber": 42, "cues": [ ... ] }
  },
  "cycle": { "length": 12, "chamber": 7, "cues": [ ... ] },
  "attachments": { "optic": ["calibercraft:red_dot", "calibercraft:holo_sight"], "muzzle": [ ... ] },
  "default_attachments": { "optic": "calibercraft:red_dot" },
  "attachment_overrides": { "calibercraft:suppressor": [{ "stat": "loudness", "op": "multiply", "value": 0.5 }] },
  "skins": [],                         // empty = every skin
  "sound_set": "ar15"                  // optional, defaults to the weapon id's path
}
```

Timelines are in ticks. `commit` is the tick at which the magazine is actually swapped (interrupting before it
changes nothing; after it the new magazine is in), `chamber` is the tick at which a round is chambered. `cues`
trigger the mechanical sounds `weapon.<sound_set>.<cue>` and the matching animation. Single-round reloads use
`"single": { "start", "per_round", "round_commit", "round_cue", "end", "end_empty" }`. `cycle` is the bolt or
pump stroke for manual actions and the charging-handle pull for self-loading weapons.

### Attachment

```json
{
  "slot": "muzzle",                    // optic, muzzle, barrel, grip, stock, magazine, tactical, charm
  "item": "calibercraft:suppressor",
  "modifiers": [
    { "stat": "loudness", "op": "multiply", "value": 0.3 },
    { "stat": "ads_time", "op": "add", "value": 1 }
  ],
  "flags": ["suppressed"],             // suppressed (quiet report, no flash), bipod (steady when sneaking)
  "optic": { "reticle": "acog", "overlay": false }   // optics only: red_dot, holo, acog, scope
}
```

### Ammunition

```json
{
  "caliber": "calibercraft:12_gauge",
  "item": "calibercraft:shell_slug",
  "modifiers": [{ "stat": "pellets", "op": "multiply", "value": 0 }, { "stat": "damage", "op": "multiply", "value": 6.5 }],
  "fire_seconds": 0,                   // sets targets on fire for this many seconds
  "tracer_color": "#FFD27F",
  "order": 1                           // position when cycling types with N; the lowest is the default
}
```

### Skin

```json
{ "rarity": "legendary", "requires_kit": true, "swatch": "#9040FF", "order": 9 }
```

Skin textures are part of the resource pack (`assets/calibercraft/textures/item/material/<skin>_*.png` and the
weapon models); the definition controls availability and cost.

## Statistics

Modifiers combine as `(base + Σ add) × Π multiply`, then the result is clamped to the limits below.

| Stat | Meaning | Limits |
|---|---|---|
| `damage` | Damage per projectile (half-hearts) | 0 – 200 |
| `pellets` | Projectiles per shot | 1 – 32 |
| `rpm` | Rounds per minute (also caps semi-automatic fire) | 30 – 2000 |
| `magazine` | Capacity, excluding a chambered round | 1 – 500 |
| `effective_range` | Blocks before damage falloff starts | 1 – 512 |
| `max_range` | Blocks after which a projectile is discarded | 4 – 1024 |
| `min_damage_mult` | Damage multiplier reached at `max_range` | 0.05 – 1 |
| `velocity` | Muzzle velocity, blocks per tick | 2 – 200 |
| `gravity` | Projectile drop, blocks per tick² | 0 – 0.2 |
| `penetration` | Material penetration power (block hardness units; 1 per body) | 0 – 10 |
| `armor_penetration` | Fraction of armour ignored | 0 – 1 |
| `headshot_mult` | Damage multiplier for head hits | 1 – 5 |
| `recoil_vertical` | Upward camera kick per shot, degrees | 0 – 30 |
| `recoil_horizontal` | Maximum sideways kick per shot, degrees | 0 – 20 |
| `recoil_recovery` | Fraction of vertical kick that recovers after firing stops | 0 – 1 |
| `spread_hip` | Hip-fire cone half-angle, degrees | 0 – 30 |
| `spread_ads` | Aimed cone half-angle, degrees | 0 – 30 |
| `spread_move` | Spread multiplier while moving | 1 – 5 |
| `spread_bloom` | Extra spread per consecutive shot, degrees | 0 – 5 |
| `spread_bloom_max` | Cap for accumulated bloom, degrees | 0 – 15 |
| `ads_time` | Ticks to reach full aim | 1 – 40 |
| `equip_time` | Ticks after drawing before the weapon can fire | 1 – 60 |
| `move_speed` | Movement speed multiplier while held | 0.3 – 1.5 |
| `ads_move_speed` | Additional movement multiplier while aiming | 0.2 – 1.2 |
| `reload_speed` | Reload speed multiplier (higher is faster) | 0.25 – 4 |
| `zoom` | Field-of-view divisor when fully aimed | 1 – 12 |
| `loudness` | Report loudness (scales audible range) | 0.05 – 3 |
| `flash` | Muzzle flash size | 0 – 3 |
| `sway` | Aim sway amplitude | 0 – 5 |
| `heat_per_shot` | Heat added per shot (1 = overheated) | 0 – 1 |
| `heat_cooling` | Heat removed per tick once firing stops | 0 – 1 |
| `knockback` | Knockback applied to targets | 0 – 3 |
| `melee_damage` | Damage of a melee bash | 0 – 40 |
