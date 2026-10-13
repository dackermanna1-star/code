# Known issues and limitations

## Gameplay

* **No lag compensation.** Hits are resolved against where entities are on the server when the shot arrives.
  At high latency, moving targets have to be led slightly. The client shows its own shots immediately, so a
  tracer can occasionally pass through a target that the server counts as a miss.
* **Shields** follow vanilla's rules for projectile damage (the `calibercraft:bullet` damage type is not in
  `#minecraft:bypasses_shield`). This has not been specifically tested.
* **Third-person animation** is limited to the two-handed hold pose; reloads, bolt and pump actions are only
  animated in first person.
* **Mobs do not use firearms.** Weapons are for players only.
* **Data pack attachments** work mechanically (statistics, flags, compatibility) but have no 3D model on the
  weapon; only the shipped attachments are drawn. **New weapon items** need code and models (see
  [ARCHITECTURE.md](ARCHITECTURE.md#adding-a-weapon)); data packs can retune and rebalance existing weapons.
* Bullet-hole decals and casings are client-side effects; they are not saved and other players see their own.

## Visual

* The LMG's top-mounted optic stays fixed while the feed cover opens during a reload (the optic is not
  attached to the moving cover part).
* The first-person arms are the vanilla arm model stretched along the forearm; very unusual skins may look odd
  at the elbow.
* The rendering was verified with screenshots under software OpenGL (Mesa llvmpipe) at 854×480 and 1920×1080.
  It has not been tried on a range of real GPUs, with shader packs (Iris/Optifine-style pipelines), or with
  mods that also replace first-person hand rendering (for example first-person body mods); those may conflict
  with the `ItemInHandRenderer` mixin.

## Audio

* The development and test environment had no audio device, so the sounds were verified by tooling (every
  file exists, decodes, and meets the loudness/peak targets checked by `tools/assetgen/sounds/check_sounds.py`)
  and by the game loading `sounds.json` without errors, not by listening in game.

## Multiplayer

* The dedicated-server path is covered by an automated test with one real client connecting to a real
  dedicated server (firing is validated and applied by the server). It has not been played with several
  players or over a real high-latency network.

## Compatibility

* Requires Minecraft 1.21.11 with Fabric Loader ≥ 0.17.3 and Fabric API. Forge/NeoForge and Bedrock are not
  supported.
* The mod must be installed on both the client and the server.
