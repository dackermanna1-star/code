# Blade Mode

A Fabric mod for Minecraft **1.21.11** that lets you cut anything, along any line you draw, in the
spirit of *Metal Gear Rising: Revengeance*'s blade mode.

Hold attack, stretch a line across the screen, let go: everything along that line is sliced
cleanly along the plane you drew. A cut tree keeps a slanted stump, and its top slides off the cut
and falls over. A house cut diagonally leaves its lower half standing with a sloped edge, while
the upper half slides down the cut and crashes to the ground. Nothing is simply deleted.

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
- **Mobs** caught in a slash take heavy damage. Your own pets are spared.
- **Protection is respected.** Blocks you could not break yourself (spawn protection,
  adventure mode, claim mods that use Fabric's block-break event) are not cut. Unbreakable blocks like bedrock are
  never cut and anchor whatever stands on them.

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
./gradlew test               # unit tests: geometry, piece cutting, physics
./gradlew runClient          # development client
./gradlew runClientGameTest  # automated in-game test: builds a tree and a house, cuts them and
                             # saves screenshots to build/run/clientGameTest/screenshots/
```

`runClientGameTest` opens a real game window. On a machine without a display, run it under
`xvfb-run`.

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

## License

MIT, see [LICENSE](LICENSE).
