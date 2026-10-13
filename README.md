# CaliberCraft Arsenal

A firearms mod for **Minecraft Java Edition 1.21.11** on **Fabric**. It adds twelve distinct weapons with
server-authoritative ballistics, a modular attachment system, a gunsmith bench with a live 3D preview,
120 weapon skins, procedural first-person animation, layered positional audio, and a configurable HUD.
All models, textures and sounds are original and were generated procedurally by the tools in `tools/`.

| | |
|---|---|
| Minecraft | 1.21.11 (Java Edition) |
| Mod loader | Fabric Loader ≥ 0.17.3 (tested with 0.19.2 and 0.19.5) |
| Required mods | Fabric API (built against 0.141.6+1.21.11) |
| Java | 21 or newer |
| Sides | Install on **both** the client and the server (the server alone owns all gameplay state) |
| License | MIT (code and assets), see [LICENSE](LICENSE) |

## Install

1. Install Fabric Loader for 1.21.11 and put Fabric API in your `mods` folder.
2. Put `calibercraft-1.0.0+mc1.21.11.jar` in the `mods` folder of every client and of the server.
3. Start the game. Weapons are in the **CaliberCraft Arsenal** creative tab; in survival, see
   [Getting weapons](#getting-weapons).

## Controls

All keys can be rebound in *Options → Controls → Key Binds → CaliberCraft*.

| Action | Default | Notes |
|---|---|---|
| Fire | Left mouse | Semi, burst or automatic depending on the selected fire mode |
| Aim down sights | Right mouse | Hold (or toggle, see settings). Right-click still opens doors, chests and the gunsmith bench |
| Reload | R | Tactical reload keeps the chambered round. Pump shotguns load shell by shell; fire to stop early |
| Unload | Sneak + R | Returns the loaded rounds to your inventory |
| Fire mode | B | Cycles the modes the weapon supports |
| Ammunition type | N | Chooses the type loaded on the next reload (e.g. buckshot → slugs) |
| Melee bash | V | Short-range strike with the weapon |
| Inspect | I | |
| Customize | G | Opens the gunsmith screen for the held weapon (field changes only, see below) |
| CaliberCraft settings | unbound | Also reachable from the gunsmith screen |
| Steady / bipod | Sneak | Reduces recoil; with a bipod attached it greatly reduces recoil and spread |

## Getting weapons

* **Crafting.** Craft *Gun Parts* (iron, copper, redstone) and *Precision Parts* (gun parts, diamond, gold,
  redstone), then the weapon itself. Ammunition is crafted from paper/iron/copper and gunpowder in batches.
  Every recipe is listed in [docs/WEAPONS.md](docs/WEAPONS.md) and [docs/ATTACHMENTS.md](docs/ATTACHMENTS.md).
* **Loot.** Weapons, attachments, parts and ammunition appear in vanilla chests in three tiers (common,
  military, rare). Disable with `lootInjection` in the server config.
* **Creative.** Everything is in the creative tab; creative players have infinite ammunition by default.

## Customization

* Press **G** while holding a weapon, or right-click a **Gunsmith Bench** (iron, gun parts, a crafting table
  and planks).
* Pick a slot on the left. Hovering an attachment previews it on the weapon (drag to rotate, scroll to zoom)
  and the statistics panel shows how every stat changes (green/red bars and arrows); click to install it.
* Optics, muzzle devices, grips, magazines, tactical devices and charms are *quick-detach* and can be changed
  anywhere. Barrels and stocks need a bench (configurable with `fieldCustomization`).
* Installing an attachment consumes the attachment item; removing it gives it back. Nothing is ever lost:
  incompatible choices are rejected by the server before anything changes.
* **Finish** selects one of ten skins (Standard plus matte black, desert tan, woodland, arctic, digital,
  industrial, worn, neon and the animated, glowing *Energy* finish). Rare finishes use a *Prismatic Finish
  Kit* in survival. Skins never change statistics.

## Features

* **12 weapons** — M9 Tactical, Heavy Revolver, Vector-9, MP5 Tactical, AR-15 Carbine, AK-Style Rifle,
  Bullpup Rifle, Pump-Action Shotgun, Semi-Automatic Shotgun, Bolt-Action Sniper Rifle, DMR and LMG — each
  with its own statistics, fire modes, reload style (magazine, cylinder, single shells, belt box), manual
  action where appropriate (bolt, pump), sounds and attachment options. Full reference:
  [docs/WEAPONS.md](docs/WEAPONS.md).
* **24 attachments** across optic, muzzle, barrel, underbarrel, stock, magazine, tactical and charm slots,
  plus **15 ammunition types** (FMJ, hollow point, armour piercing, buckshot, slugs, dragon's breath).
  Modifiers are transparent (`(base + add) × multiply`, clamped). Reference: [docs/ATTACHMENTS.md](docs/ATTACHMENTS.md).
* **Ballistics** — simulated projectiles with velocity, drop, damage falloff, headshots, armour
  penetration, penetration through soft blocks and bodies, ricochets on hard surfaces at grazing angles,
  glass shattering (respects spawn protection and build permissions), water slowing and splashes.
* **Server authority** — the server owns ammunition, reload timing, fire rate, heat, spread bounds,
  attachments and damage. Duplicate, replayed, too-fast, wrong-slot and out-of-ammo shots are rejected.
  The client predicts locally so firing feels immediate, and reconciles with the server.
* **Reload state machine** — reloads commit ammunition at a specific animation frame, can be interrupted
  safely at any point without losing or duplicating rounds, and drive the animation and sounds.
* **Animation** — procedural first-person animation with your own arms: equip, idle sway and breathing,
  aim-down-sights, recoil, sprint, per-type reloads (magazine drop and insert, cylinder swing and speedloader,
  shell-by-shell loading, LMG feed cover and belt), slide/bolt lock on empty, bolt and pump cycling, hammer,
  inspect and melee.
* **Audio** — per-weapon close and distant reports, a suppressed report, mechanical cues timed to the
  animation, casings, impacts per material, ricochets, near-miss whizzes, hit and kill confirmation, wall
  occlusion and speed-of-sound delay for distant shots. Volume follows the *Players* sound slider and a
  separate gun-volume setting.
* **Effects** — muzzle flash and light, smoke, ejected brass and shells that bounce, tracers, bullet holes,
  sparks and per-material impact particles. Each is optional and quality-scaled.
* **HUD** — ammunition panel (count, chambered round, reserve, ammo type, fire mode, reload/heat bars),
  dynamic crosshair that shows the actual spread, optic reticles and scope overlay, hit markers and optional
  damage numbers; position, scale and a simplified high-contrast mode are configurable.
* **Accessibility** — reduced-motion mode, adjustable camera recoil and screen shake, toggle aim, separate
  aim and scope sensitivity, subtitles for every gameplay sound (shots, reloads, impacts, whizzes, hit
  confirmation).

## Configuration

* `config/calibercraft/server.json` — gameplay rules (damage multiplier, infinite ammo, glass breaking,
  penetration, ricochets, heat, field customization, loot injection, anti-cheat tolerances, per-weapon stat
  overrides). Re-read on `/reload`.
* `config/calibercraft/client.json` — HUD, effects, controls and audio; edit it in game through the
  CaliberCraft settings screen.
* **Data packs** can redefine or add weapons, attachments, ammunition and skins in
  `data/<namespace>/calibercraft/{weapon,attachment,ammo,skin}/`.

Every option and data field is documented in [docs/CONFIG.md](docs/CONFIG.md).

## Building from source

```sh
./gradlew build                 # compiles, runs the unit tests, writes build/libs/calibercraft-1.0.0+mc1.21.11.jar
./gradlew test                  # unit tests only (core logic + data/asset consistency)
./gradlew runGameTest           # server game tests in a headless test world
./gradlew runClientGameTest     # client test: renders the weapons and screens, takes screenshots
                                # (needs a display; on Linux: xvfb-run -a ./gradlew runClientGameTest)
./gradlew runProductionClientGameTest  # the same client test against the release jar in a production client
./gradlew runClient             # development client
./gradlew runServer             # development dedicated server (accept the EULA in run/eula.txt first)
```

The Gradle wrapper (9.7.1) downloads everything else. Assets and data are generated by Python 3 scripts and
committed; regenerate them only if you change the generators:

```sh
python3 tools/assetgen/textures/generate_textures.py
python3 tools/assetgen/sounds/generate_sounds.py
python3 tools/assetgen/models/generate_models.py
python3 tools/datagen/generate_data.py && python3 tools/datagen/generate_lang.py && python3 tools/datagen/generate_docs.py
```

## Documentation

* [docs/WEAPONS.md](docs/WEAPONS.md) — every weapon's statistics, compatible attachments and acquisition
* [docs/ATTACHMENTS.md](docs/ATTACHMENTS.md) — attachments, ammunition and skins with their exact effects
* [docs/CONFIG.md](docs/CONFIG.md) — server and client options, stat overrides, data pack format
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code layout, networking, how to add a weapon
* [docs/TESTING.md](docs/TESTING.md) — what is tested, how, and the latest results
* [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — limitations and known issues
* [docs/ASSET_SPEC.md](docs/ASSET_SPEC.md) — the asset contract between the generators and the code

## Credits and licensing

CaliberCraft Arsenal is released under the MIT license. All textures, models and sounds were created for this
project by the procedural generators in `tools/assetgen` and are covered by the same license; no third-party
assets are included. Weapon names are generic descriptions; no real-world trademarks are used.

Built with [Fabric](https://fabricmc.net/) (Fabric Loader and Fabric API, Apache-2.0) using Mojang's official
mappings. Minecraft is a trademark of Mojang Synergies AB; this project is not affiliated with Mojang or
Microsoft.
