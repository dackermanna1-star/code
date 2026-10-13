# Sound generation spec

All CaliberCraft sounds are synthesized from scratch by `generate_sounds.py` (numpy + scipy, encoded with
ffmpeg/libvorbis). Output: `src/main/resources/assets/calibercraft/sounds/**.ogg` and
`src/main/resources/assets/calibercraft/sounds.json`.

Requirements:
* **Mono**, 44.1 kHz, Ogg Vorbis (`ffmpeg -c:a libvorbis -q:a 5`). Mono is mandatory: Minecraft only
  positions/attenuates mono sounds.
* Peak normalised to about -1 dBFS for gunfire, quieter for mechanics/UI (see "level" column).
  Leave a 2-5 ms fade-in to avoid clicks and fade tails to silence.
* Deterministic (fixed RNG seeds) so the output is reproducible.
* Variation files (`_1`, `_2`, …) differ in random transients, slight pitch/EQ and tail shape — but must
  still clearly sound like the *same* gun.

## sounds.json format

```json
"weapon.ar15.fire": {
  "subtitle": "subtitles.calibercraft.weapon.fire",
  "sounds": [ {"name": "calibercraft:weapon/ar15/fire_1", "attenuation_distance": 48}, ... ]
}
```
`attenuation_distance` per category is listed below. Also write `subtitles_en_us.json` (key → English text)
next to the script so it can be merged into the lang file.

## Per-weapon events (`weapon.<id>.<event>` → files `weapon/<id>/<event>_<n>.ogg`)

Common to every weapon:

| event              | variants | attenuation | length  | notes |
|--------------------|----------|-------------|---------|-------|
| `fire`             | 4        | 48          | 0.6-1.6 s | close-range report: sharp transient + body + mechanical clack + short room tail |
| `fire_far`         | 2        | 192         | 1.5-3 s | distant report: low-passed thump/boom, long rolling echo, no crack |
| `fire_suppressed`  | 3        | 16          | 0.3-0.6 s | suppressed: muffled "thwap"/"pfft" + clearly audible mechanical action |
| `equip`            | 1        | 8           | 0.3-0.6 s | handling rattle appropriate to weapon size |

Weapon character (make each one distinct):

| id             | fire character |
|----------------|----------------|
| `m9`           | snappy, bright, short tail, light slide clack |
| `revolver`     | huge deep boom, long tail, no mechanical clack (cylinder/hammer only) |
| `vector9`      | very short tight pops, fast mechanical buzz (meant for 1100 rpm) |
| `mp5`          | classic crisp mid "tak", roller-delayed metallic ring |
| `ar15`         | sharp supersonic crack, mid body, springy buffer "boing" |
| `ak`           | heavier, lower, harsher "bark" with clanky bolt carrier |
| `bullpup`      | crisp, slightly higher, compact rattle |
| `pump_shotgun` | wide heavy blast, thunderous low end, long tail |
| `auto_shotgun` | blast slightly lighter than pump + fast cycling clack |
| `sniper`       | massive crack + deep boom, very long rolling tail |
| `dmr`          | strong crack, heavier than ar15, medium tail |
| `lmg`          | punchy, mid-heavy, belt/link rattle, made for 720 rpm sustained fire |

Mechanical events (1 variant each unless noted; attenuation 12; level ≈ -10 dBFS):

| id             | events |
|----------------|--------|
| `m9`           | `mag_out`, `mag_in`, `slide_back`, `slide_release` |
| `revolver`     | `cylinder_open`, `eject` (brass casings falling/tinkling), `speedloader`, `cylinder_close`, `hammer` |
| `vector9`      | `mag_out`, `mag_in`, `charge` |
| `mp5`          | `mag_out`, `mag_in`, `charge_back`, `charge_slap` |
| `ar15`         | `mag_out`, `mag_in`, `charge`, `bolt_release` |
| `ak`           | `mag_out`, `mag_in`, `charge` |
| `bullpup`      | `mag_out`, `mag_in`, `charge` |
| `pump_shotgun` | `pump_back`, `pump_forward`, `shell_insert` (2 variants) |
| `auto_shotgun` | `mag_out`, `mag_in`, `charge` |
| `sniper`       | `bolt_up`, `bolt_back`, `bolt_forward`, `bolt_down`, `mag_out`, `mag_in` |
| `dmr`          | `mag_out`, `mag_in`, `charge` |
| `lmg`          | `cover_open`, `box_out`, `box_in`, `belt`, `cover_close`, `charge` |

## Shared events

| event                  | files                        | variants | attenuation | notes |
|------------------------|------------------------------|----------|-------------|-------|
| `mech.dry_fire`        | `mech/dry_fire_<n>`          | 2 | 8  | hollow trigger/hammer click |
| `mech.fire_mode`       | `mech/fire_mode`             | 1 | 6  | selector switch click |
| `mech.overheat`        | `mech/overheat`              | 1 | 16 | steam hiss + metal tick (1.5 s) |
| `mech.inspect`         | `mech/inspect_<n>`           | 2 | 6  | cloth rustle + soft metal handling |
| `casing.brass`         | `casing/brass_<n>`           | 4 | 10 | small brass casing bouncing on hard ground (tink-tink) |
| `casing.shell`         | `casing/shell_<n>`           | 2 | 10 | plastic shotgun hull bouncing (dull) |
| `impact.stone`         | `impact/stone_<n>`           | 3 | 24 | sharp chip/crack + grit |
| `impact.dirt`          | `impact/dirt_<n>`            | 3 | 20 | dull thud + soil spray |
| `impact.wood`          | `impact/wood_<n>`            | 3 | 24 | woody knock + splinter |
| `impact.metal`         | `impact/metal_<n>`           | 3 | 32 | bright clang/ping with ring |
| `impact.glass`         | `impact/glass_<n>`           | 3 | 24 | small glass crack/shatter tinkle |
| `impact.water`         | `impact/water_<n>`           | 3 | 20 | plop/splash |
| `impact.flesh`         | `impact/flesh_<n>`           | 3 | 16 | muted wet thump (not gory) |
| `impact.soft`          | `impact/soft_<n>`            | 3 | 16 | soft thump for wool/snow/leaves |
| `bullet.ricochet`      | `bullet/ricochet_<n>`        | 4 | 40 | classic "pyeeew" whine |
| `bullet.whiz`          | `bullet/whiz_<n>`            | 3 | 12 | supersonic near-miss snap/whoosh |
| `hit.marker`           | `hit/marker`                 | 1 | 4  | short soft UI tick (played non-positionally) |
| `hit.headshot`         | `hit/headshot`               | 1 | 4  | brighter "ding" tick |
| `hit.kill`             | `hit/kill`                   | 1 | 4  | satisfying double tick |
| `ui.attachment_install`| `ui/attachment_install`      | 1 | 4  | metal snap/rail clamp |
| `ui.attachment_remove` | `ui/attachment_remove`       | 1 | 4  | release click + slide |
| `ui.click`             | `ui/click`                   | 1 | 4  | subtle tactile UI click |
| `ui.skin_apply`        | `ui/skin_apply`              | 1 | 4  | spray-paint hiss + shimmer |
| `ui.gunsmith_open`     | `ui/gunsmith_open`           | 1 | 4  | toolbox/drawer open with tool rattle |

Subtitle keys: weapon events use `subtitles.calibercraft.weapon.fire`, `...weapon.fire_suppressed`,
`...weapon.reload` (all mechanical reload events), `...weapon.equip`; shared events use
`subtitles.calibercraft.<event>` (e.g. `subtitles.calibercraft.impact.metal`), including the hit-confirmation
events (for players who rely on subtitles). UI events have no subtitle.
