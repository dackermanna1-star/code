# Testing

## How to run

```sh
./gradlew test                          # unit tests: core logic + data/asset consistency
./gradlew runGameTest                   # server game tests in a headless test world
xvfb-run -a ./gradlew runClientGameTest # client game test (dev environment), screenshots in build/run/clientGameTest/screenshots
./gradlew runProductionClientGameTest   # same client test against the release jar in a production client (uses Xvfb itself);
                                        # screenshots in build/run/productionClientGameTest/screenshots
python3 tools/assetgen/sounds/check_sounds.py   # sound set against its spec (format, levels, events, subtitles)
```

`./gradlew build` runs the unit tests as part of building the jar.

## Latest results

Run on Linux (Java 21, Mesa llvmpipe software OpenGL under Xvfb, no audio device), October 2026.

| Suite | Result |
|---|---|
| Unit tests (`./gradlew test`) | **42 / 42 passed** |
| Server game tests (`./gradlew runGameTest`) | **13 / 13 passed** (12 CaliberCraft tests + vanilla's built-in `minecraft:always_pass`) |
| Client game test, dev environment (`runClientGameTest`) | **passed** — 26 screenshots reviewed, including the dedicated-server round trip |
| Client game test, production client with the release jar (`runProductionClientGameTest`) | **passed** — same scenario as above with the remapped release jar, Fabric API from Maven and intermediary names, so the shipped mixins and assets are what was tested |
| Release jar on a production Fabric dedicated server (Fabric Loader 0.19.5, Fabric API 0.141.6) | **boots cleanly**: 12 weapons, 24 attachments, 15 ammunition types, 10 skins and 1525 recipes loaded; config created; no errors or mod warnings |
| Sound check (`check_sounds.py`) | **OK** — 119 events, 219 files, all within format and level specs |
| Texture spec validation (run by the texture generator) | **OK** — 132 specified textures |

## What the tests cover

**Unit tests** (`src/test/java`), run on Fabric Loader's JUnit integration:

* `AmmoLogicTest` — self-loading feed, manual actions needing a cycle, revolver cylinder, magazine commit
  with limited reserve, switching ammunition type returns every loaded round, reload availability, single-shell
  capacity.
* `ReloadRunnerTest` — tactical reload commits at the commit tick and keeps the chambered round, cancelling
  before the commit preserves ammunition, empty reload chambers at the chamber tick, reload speed scaling,
  fractional client ticks fire each event once, shell-by-shell loading (until full, stop request finishes the
  current shell, stops when reserve runs out, pumps when empty), cycle timeline, server catch-up window.
* `FireControlTest` — sustained rate never exceeds RPM, jittered but legal traffic is accepted, trigger gate
  enforces semi/burst/auto, heat accumulates, locks and decays.
* `BallisticsTest` — pellets deterministic per seed and inside the cone, zero spread exact, damage falloff,
  armour formula matches vanilla when penetration is zero, spread model.
* `WeaponStatsTest` — add-then-multiply order, stacking, integer rounding and clamping, NaN safety, config
  overrides.
* `ResourceConsistencyTest` — every JSON parses; every definition decodes with its codec; at least 12 weapons
  and 60 skin variants; attachment/slot/default/caliber/skin cross-references; reload timelines are
  consistent; every item model, model parent, texture, particle texture and sound file referenced exists;
  every model face uses a texture variable that resolves; every item, skin and subtitle is translated;
  recipes and loot tables only reference existing items.

**Server game tests** (`src/gametest/.../CaliberCraftGameTests.java`) drive the real server code with a
survival player in a test world: firing consumes a round and damages a zombie; duplicate and replayed packets
are ignored; fire rate and semi-auto are enforced; shots from the wrong slot or while equipping are rejected;
a magazine reload commits at the right time and draws from the reserve; interrupted reloads never lose or
duplicate rounds; the pump shotgun must be cycled between shots; attachments install, remove and are validated
(incompatible and missing items rejected, items returned); customization survives serialization; bullets
shatter glass and continue into the target; melee bash hits a target in front; every registered item and sound
event has its model, translation and `sounds.json` entry.

**Client game test** (`CaliberCraftClientGameTest.java`) starts the real client: every weapon in first person;
aiming, firing (asserts a shot was fired), a magazine reload; the sniper scope; pump cycling after a shot;
third person; the gunsmith screen at GUI scales 2, 3 and 4 on a 1920×1080 window, including hovering an
attachment to preview it; the settings screen; an animated skin; then a real dedicated server is started, the
client connects, and a short mouse click must make the server consume a round.

## Problems found by testing and fixed

* Attachment models referenced textures directly in element faces, which Minecraft does not support; they
  rendered with the missing-texture pattern in the gunsmith screen. The model generator now declares texture
  variables, and a consistency test checks every face.
* A mouse click shorter than one frame (press and release between two frames) did not fire. Consumed clicks
  are now matched against observed presses, so one physical click is always exactly one trigger pull.
* The HUD's reload/cycling label overlapped the round counter; long weapon names were cut off mid-word.
* Gunsmith statistics overlapped the panel frame, and the "worse" arrow was drawn in the wrong colour.
* A `server.json` with a syntax error was replaced by defaults; now the previous settings are kept and the
  file is left for the admin to fix (and `/reload` re-reads it).
* An unused client option (`cosmeticEffects`) was removed.
* Two game tests initially failed because the empty test structure has no floor, so target zombies fell below
  the line of fire; the tests now place actors on the ground.

The server game tests run only in the development environment: in a production runtime, Fabric API's
`@GameTest` annotation cannot be read (its `rotation()` default names an enum constant that is not remapped), so
the production test jar contains just the client test. The production dedicated-server boot above covers the
release jar on the server side.

## Not covered by automated tests

These need a human play session; see also [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

* Listening to the audio (no audio device in the test environment).
* Real GPUs and shader packs; frame-time profiling with many players or very high bullet counts.
* Multiplayer with several players and real network latency.
* Long survival play (loot balance, recipe progression).
* Compatibility with other mods that change first-person rendering or input.
