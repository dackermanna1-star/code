# CaliberCraft Asset Specification

This document is the contract between the Java code and the generated assets. All assets are
**original** and produced procedurally by the scripts in `tools/assetgen/` (see `tools/assetgen/README.md`).
Generated files are committed so the mod builds without Python.

Namespace: `calibercraft`. Asset root: `src/main/resources/assets/calibercraft/`.

---

## 1. Weapons

| ID             | Name                    | Caliber   | Action / reload type          | Animated parts (first person)                 |
|----------------|-------------------------|-----------|-------------------------------|-----------------------------------------------|
| `m9`           | M9 Tactical             | 9mm       | semi-auto, magazine           | `slide`, `magazine`                           |
| `revolver`     | Heavy Revolver          | .44 Mag   | double action, cylinder       | `cylinder`, `hammer`                          |
| `vector9`      | Vector-9                | 9mm       | auto, magazine                | `magazine`, `charging_handle`                 |
| `mp5`          | MP5 Tactical            | 9mm       | auto, magazine                | `magazine`, `charging_handle`                 |
| `ar15`         | AR-15 Carbine           | 5.56      | auto, magazine                | `magazine`, `charging_handle`, `bolt`         |
| `ak`           | AK-Style Rifle          | 7.62x39   | auto, magazine (rock-in)      | `magazine`, `charging_handle`                 |
| `bullpup`      | Bullpup Rifle           | 5.56      | auto, magazine (behind grip)  | `magazine`, `charging_handle`                 |
| `pump_shotgun` | Pump-Action Shotgun     | 12 gauge  | pump, shell-by-shell          | `pump`, `shell`                               |
| `auto_shotgun` | Semi-Automatic Shotgun  | 12 gauge  | semi-auto, box magazine       | `magazine`, `charging_handle`                 |
| `sniper`       | Bolt-Action Sniper      | .338      | bolt, magazine                | `bolt_handle`, `magazine`                     |
| `dmr`          | DMR                     | .308      | semi-auto, magazine           | `magazine`, `charging_handle`                 |
| `lmg`          | LMG                     | 5.56      | auto, belt box                | `feed_cover`, `magazine` (box), `belt`, `charging_handle` |

## 2. Skins (10 finishes x 12 weapons = 120 variants)

Skin IDs (custom model data string index 0, value `calibercraft:<skin>`):
`standard`, `matte_black`, `desert_tan`, `woodland`, `arctic`, `digital`, `industrial`, `worn`, `neon` (emissive), `energy` (rare, animated emissive).

Models are built from **material roles**, never one flat recolor:

| Role        | Used for                                        |
|-------------|-------------------------------------------------|
| `receiver`  | main body / receiver / slide / frame            |
| `furniture` | stock, pistol grip, handguard, pump forend      |
| `metal`     | barrel, bolt, bare steel internals              |
| `detail`    | sights, rails, pins, trigger, small dark parts  |
| `accent`    | accent strips (rendered with light emission in `neon`/`energy`) |
| `mag`       | magazines, belt box                             |
| `brass`     | visible cartridges (not skinned)                |
| `shell`     | visible shotgun shells (not skinned)            |

Attachments use their own fixed materials (`detail`, `metal`, `glass`, `glow`) so they look consistent on every skin.

## 3. Textures (`textures/...`)

### 3.1 Material library — `textures/item/material/<name>.png` (32x32, seamless tile)
Base library: `black_polymer`, `od_polymer`, `tan_polymer`, `grey_polymer`, `walnut_wood`, `dark_walnut`,
`blued_steel`, `parkerized`, `dark_steel`, `stainless`, `gunmetal`, `black_anodized`, `brass`, `copper`,
`red_plastic`, `green_plastic`, `rubber`, `glass_lens`, `glow_red`, `glow_green`, `glow_amber`.

Skin materials (one per role that the skin changes):
`<skin>_receiver`, `<skin>_furniture`, `<skin>_mag`, `<skin>_accent` for skins
`matte_black`, `desert_tan`, `woodland`, `arctic`, `digital`, `industrial`, `worn`, `neon`, `energy`.
`energy_receiver`, `energy_accent` and `neon_accent` are animated (vertical frame strips with `.png.mcmeta`).

### 3.2 Items — `textures/item/...` (16x16)
Ammo: `ammo/ammo_9mm`, `ammo/ammo_9mm_hp`, `ammo/ammo_44`, `ammo/ammo_44_hp`, `ammo/ammo_556`, `ammo/ammo_556_ap`,
`ammo/ammo_762`, `ammo/ammo_762_ap`, `ammo/ammo_308`, `ammo/ammo_308_ap`, `ammo/ammo_338`, `ammo/ammo_338_ap`,
`ammo/shell_buckshot`, `ammo/shell_slug`, `ammo/shell_incendiary`.
Misc: `gun_parts`, `precision_parts`, `prismatic_finish_kit`.

### 3.3 Block — `textures/block/gunsmith_bench_{top,side,front,bottom}.png` (16x16)

### 3.4 Particles — `textures/particle/<name>.png`
`smoke_0..3` (16x16), `spark_0..1` (8x8), `bullet_hole_0..2` (16x16, transparent), `casing_brass` (8x8), `casing_shell` (8x8), `impact_flash` (16x16).

### 3.5 Effects (direct textures, not atlased) — `textures/effect/`
`muzzle_front_0..2.png` (64x64), `muzzle_side_0..2.png` (64x32, flash cone pointing left→right), `tracer.png` (16x64).

### 3.6 HUD sprites — `textures/gui/sprites/hud/<name>.png` (sprite id `calibercraft:hud/<name>`)
`bullet_pistol` (3x7), `bullet_rifle` (3x9), `bullet_shell` (4x7), `mode_semi`, `mode_burst`, `mode_auto`, `mode_bolt`, `mode_pump` (16x8),
`hitmarker`, `hitmarker_head`, `hitmarker_kill` (15x15), `reticle_red_dot` (15x15), `reticle_holo` (31x31), `reticle_acog` (31x31),
`heat_bar_background`, `heat_bar_fill` (64x4).

### 3.7 Scope overlays — `textures/misc/scope_sniper.png`, `textures/misc/scope_acog.png` (512x512, transparent circular window)

### 3.8 Gunsmith GUI — `textures/gui/sprites/gunsmith/<name>.png`
`panel` (32x32, nine-slice), `slot` / `slot_hover` / `slot_selected` (22x22), slot icons `icon_optic`, `icon_muzzle`, `icon_barrel`,
`icon_grip`, `icon_stock`, `icon_magazine`, `icon_tactical`, `icon_charm`, `icon_skin` (16x16), `stat_up`, `stat_down` (7x7), `lock` (9x9).

## 4. Models

Generated by `tools/assetgen/models/`. Model space: 1 unit = 1 model pixel, bounds [-16, 32].
Weapons point their muzzle toward **-Z**; the bore axis sits on `x = 8`.

* `models/item/weapon/<weapon>/<part>.json` – part geometry with role texture variables (`#receiver` …).
* `models/item/weapon/<weapon>/<part>_glow.json` – same part with `light_emission` on accent elements.
* `models/item/weapon/<weapon>/skin/<skin>/<part>.json` – child model binding a skin's textures.
* `models/item/weapon/<weapon>/att/...` – attachment geometry positioned on that weapon's mounts.
* `models/item/attachment/<attachment>.json` – stand-alone attachment item model.
* `items/<weapon>.json` – full weapon (composite) used everywhere except the first-person renderer.
* `items/fp/<weapon>/static.json`, `items/fp/<weapon>/<part>.json` – first-person split rendering.
* `weapon_render/<weapon>.json` – first-person metadata (part pivots, sight heights, muzzle, ejection port, hand points).

Custom model data string indices (written by the server from the weapon's components):
`0` skin, `1` optic, `2` muzzle, `3` barrel, `4` grip, `5` stock, `6` magazine, `7` tactical, `8` charm.

## 5. Sounds — `sounds/...` (mono Ogg Vorbis, 44.1 kHz) and `sounds.json`

See `tools/assetgen/sounds/README.md` for the complete event list. Event naming:
* `weapon.<weapon>.fire|fire_far|fire_suppressed|<mechanical>`
* `mech.dry_fire`, `mech.fire_mode`, `mech.overheat`, `mech.inspect`
* `casing.brass`, `casing.shell`
* `impact.<stone|dirt|wood|metal|glass|water|flesh|soft>`, `bullet.ricochet`, `bullet.whiz`
* `hit.marker`, `hit.headshot`, `hit.kill`
* `ui.attachment_install`, `ui.attachment_remove`, `ui.click`, `ui.skin_apply`, `ui.gunsmith_open`
