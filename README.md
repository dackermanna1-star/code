# Blade Mode

A Fabric mod for Minecraft **1.21.11** that lets you cut anything, along any line you draw, in the
spirit of *Metal Gear Rising: Revengeance*'s blade mode.

Hold attack, stretch a line across the screen, let go: everything along that line is sliced
cleanly along the plane you drew. A cut tree keeps a slanted stump, and its top slides off the cut
and falls over. A house cut diagonally leaves its lower half standing with a sloped edge, while
the upper half slides down the cut and crashes to the ground. A zombie cut at the waist falls in
two, its armor cut with it. Nothing is simply deleted.

## How to use

1. Get the **High-Frequency Blade**. In creative it is in the Combat and Tools & Utilities tabs.
   In survival, craft it (see below).
2. **Hold attack (left mouse).** The world slows down and the camera freezes. Moving the mouse
   now stretches a cut line across the screen.
3. **Release** to slash. Everything on the plane through your eyes and that line, up to 32
   blocks away, is cut.

- **V** switches the line between *from the crosshair to the cursor* (default) and *centred on
  the crosshair* (the line rotates around the crosshair as you move). You can rebind it in
  Controls, under Gameplay.
- A plain click without dragging is a normal sword hit.

## What a cut does

- **Real geometry.** Blocks are split exactly along the cut plane. The part that stays behind
  keeps exactly the remaining shape, so you can see and walk on the slanted cut surface. Cut
  surfaces show the inside of the material: end grain for logs, stripped wood on the sides.
- **Things fall.** Whatever loses its support becomes a physical piece: the crown of a tree,
  the upper half of a house, a bridge span. Pieces are rigid bodies with mass, friction and
  rotation. They slide down steep cuts (fresh cuts are smooth), topple, tumble, bounce, float
  in water, collide with the world, with each other and with mobs, and hurt what they land on.
- **Only what is cut through comes loose.** A structure separates only if the blade passed
  through every connection holding it up. A notch cut into a wall leaves the wall standing.
- **Trees behave like trees.** Leaves go with the branch they grow on, logs hold together
  diagonally, and natural leaves never hold anything up.
- **Attachments come along.** Torches, doors, flowers, buttons and the like move with the
  block they hang on. Containers that get sliced spill their contents. Blocks carried whole
  keep their data, so a chest that falls whole keeps its items.
- **Pieces can be cut again**, even in mid-air. Hitting a piece knocks off the block you hit,
  which drops as items.
- **Pieces settle.** When a piece comes to rest nearly aligned with the block grid, it turns
  back into normal blocks. Two halves of the same block that land together merge back into a
  whole block.
- **Creatures are cut apart too** (see below). Your own pets are spared.
- **Protection is respected.** Blocks you could not break yourself (spawn protection,
  adventure mode, claim mods that use Fabric's block-break event) are not cut. Unbreakable blocks like bedrock are
  never cut and anchor whatever stands on them.

## Cutting creatures

A slash through a creature cuts its body in two along the line you drew, wherever it passes:
through the neck, the waist, a leg, or diagonally from shoulder to hip.

- **The real model is cut.** The pieces are the creature's own model in the pose it was in,
  with everything it wore: armor, a sheep's wool, a saddle, glowing eyes. Cut faces show raw
  meat for creatures with blood, and bone, metal, wood or snow for skeletons, golems, creakings
  and snow golems.
- **The pieces are ragdolls.** Each piece is a jointed body that collapses, flops and rolls.
  Limbs stay attached to the half they belong to, and the halves fall apart in the direction
  the blade moved.
- **Corpses can be cut again**, lying on the ground or still falling. Walking through them
  kicks the pieces around, and explosions throw them.
- **They bleed.** Every cut face sprays, spurts in time with a fading heartbeat, then drips.
  Each creature bleeds its own color. Skeletons shed bone chips, iron golems spark, and blazes
  give off embers.
- Weaker creatures (up to 60 max health by default) die from any slash through them. Tougher
  ones take normal blade damage and are cut apart when a slash kills them. Players are cut
  apart when a slash kills them.

Corpses are purely visual and exist only on the clients. They disappear after 45 seconds, and
the mob drops its loot as usual.

### With Visceral

[Visceral](https://github.com/dackermanna1-star/code) (wounds, blood and ragdolls) is optional.
When it is installed, Blade Mode connects to it automatically:

- Sliced creatures bleed Visceral's blood: its droplets, mist and pools, in each creature's own
  blood type, with stains wherever the blood lands.
- Visceral's whole-body ragdoll is switched off for creatures Blade Mode cut apart, so they are
  not ragdolled twice. Everything that dies any other way still gets Visceral's ragdoll.

Neither mod needs the other.

## Recipe

```
. . D
R D .
S N .
```

D = diamond, R = block of redstone, S = stick, N = netherite ingot.

## Configuration

`config/blademode.json` is created on first launch. Restart the game (or server) after editing it.

| Option | Default | Meaning |
| --- | --- | --- |
| `reach` | `32.0` | How far the blade reaches along the drawn line, in blocks. |
| `maxSlicedBlocks` | `6000` | Most blocks a single slash may slice through. |
| `maxFallingBlocks` | `6000` | A connected structure larger than this counts as anchored and does not fall. |
| `cooldownTicks` | `6` | Ticks between slashes. |
| `cutPlants` | `true` | Break plants, torches and other non-solid blocks the blade passes through. |
| `entityDamage` | `24.0` | Damage dealt to mobs caught in a slash. |
| `sliceCreatures` | `true` | Slashes cut creatures apart instead of only hurting them. |
| `instantSliceMaxHealth` | `60.0` | Creatures with at most this much max health die from any slash through them. |
| `slicePlayers` | `true` | Players killed by a slash are cut apart too. |
| `corpseSeconds` | `45` | How long the pieces of a sliced creature stay (client side). |
| `maxCorpses` | `24` | Most sliced creatures kept at once; the oldest go first (client side). |
| `gore` | `true` | Blood, bone chips and sparks from cut creatures (client side). |
| `slashPush` | `1.2` | How hard the blade drags freshly cut pieces along its path (blocks/second). |
| `slowMotion` | `true` | Slow the world down while drawing a cut. Only applies when one player is online. |
| `slowMotionTickRate` | `6.0` | Tick rate during slow motion (normal is 20). |
| `gravity` | `16.0` | Gravity for pieces, in blocks/second². |
| `friction` | `0.55` | Friction between pieces and ordinary surfaces. |
| `cutFriction` | `0.25` | Friction on cut surfaces. Lower values make cut parts slide off more easily. |
| `restitution` | `0.12` | Bounciness of pieces. |
| `pieceDamage` | `true` | Falling pieces hurt entities they hit. |
| `solidify` | `true` | Turn resting, nearly grid-aligned pieces back into blocks. |
| `solidifyMaxAngle` | `12.0` | Largest tilt (degrees) at which a resting piece still turns back into blocks. |
| `solidifyDelayTicks` | `60` | How long a piece must rest before it turns back into blocks. |

## Multiplayer

Install the mod on the server and on every client. Fabric API is required. Slow motion only
happens when a single player is online, so it never disturbs other players.

## Building

You need JDK 21.

```sh
./gradlew build              # the mod jar is written to build/libs/
./gradlew test               # unit tests: geometry, piece cutting, physics, ragdolls
./gradlew runClient          # development client
./gradlew runClientGameTest  # automated in-game test: cuts a tree, a house and a line of mobs,
                             # saves screenshots to build/run/clientGameTest/screenshots/
```

`runClientGameTest` opens a real game window. On a machine without a display, run it under
`xvfb-run`. Set `BLADEMODE_TEST_SCENES` to run only some scenes (for example
`BLADEMODE_TEST_SCENES=creatures`). Add `-PvisceralJar=/path/to/visceral.jar` to `runClient` or
`runClientGameTest` to run with Visceral installed.

## How it works

- `geom/`: convex clipping of block shapes by cut planes (`ConvexPart`, `PartShape`).
- `cut/CutEngine`: finds every block in the swept sector and splits it in two. It then builds
  a connectivity graph of the halves and their neighbours, using shared face area, diagonal
  log links and leaf distance. Groups that were attached to anchored ground only through the
  cut are detached.
- `block/CutBlock`: the half that stays behind. It keeps its original block state and its
  planes, so drops, sounds, light and the clipped model all match the original block.
- `piece/`: the detached parts. `PhysicsWorld` is a small rigid-body solver with speculative
  contacts against the exact cut geometry, sequential impulses with friction, buoyancy and
  sleeping. `Solidifier` turns resting pieces back into blocks.
- Client: `BladeInput` handles the line drawing. `ClippedMesher` clips the vanilla block models
  along the cut planes and caps the cut faces with the block's inner texture.
- Creatures: the server only decides who dies and sends the cut plane. Each client then draws
  the creature once into `CaptureCollector`, which records every posed model part.
  `RagdollBuilder` turns the parts into jointed rigid bodies (`gore/`, solved with XPBD).
  `Ragdoll.cut` splits the bodies the plane passes through and severs the joints across it.
  `CorpseRenderer` draws the clipped faces with their original textures and caps the cuts with
  flesh. `VisceralBridge` finds Visceral by reflection, and a mixin that is only applied when
  Visceral is present keeps its ragdolls off sliced creatures.

## License

MIT, see [LICENSE](LICENSE).
