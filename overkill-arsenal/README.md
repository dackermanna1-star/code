# Overkill Arsenal

A Fabric mod for **Minecraft 1.21.11** that adds five absurdly overpowered weapons, plus the particles, screen shake and burning aftermath they leave behind.

![The five weapons](docs/weapons.png)

![Held in third person](docs/held.jpg)

*All in-game screenshots come from the automated headless showcase test (see [Headless showcase test](#headless-showcase-test)).*

| Weapon | What it does |
|---|---|
| **Sunline Rifle** | Hold the trigger and sweep a laser-pointer beam over anything you like. Let go, and 0.6 s later everywhere it pointed explodes. |
| **Worldbreaker Orb Cannon** | Charge it for up to 20 s, then fire an orb that tears through 100–400 blocks a second and leaves a crater about 70 wide. |
| **Riftfang Scythe** | Every hit tears space. Enemies fall through the tears and drop out of the sky. |
| **Stormcaller Gauntlet** | Punches build up lightning charge for chain lightning, Thunder Call and a leaping Thunderfall Slam. |
| **Gravemaker** | Fires black holes that pull in mobs, items and ripped-up terrain, then implode and explode outward. |

All five are in the **Overkill Arsenal** creative tab and can be crafted in survival (see [Recipes](#recipes)).

---

## The weapons

### Sunline Rifle
![Sunline Rifle: sweeping the laser, the detonation and the scorched field it leaves](docs/sunline.jpg)

- **Hold right-click** and a thin white-gold laser (up to **160 blocks**) follows your aim for up to **6 seconds**, like a laser pointer: a crisp line and a bright dot where it lands. You can walk at half speed while you hold it.
- The laser leaves **no trail**, but it remembers every spot it lands on, about every 2 blocks along its path. Even a fast sweep leaves no gaps.
- Every mob the laser passes through takes 6 damage, catches fire and gets **Sunmarked**, which makes it glow. It keeps burning while the laser stays on it.
- **Let go**: a hum rises and, **0.6 seconds later**, everywhere the laser pointed explodes, in the order you pointed at it. Each blast is stronger than TNT (power 5.5), and the last one is a power-9 blast. Together they leave fire, scorched stone, molten rock, sand fused into glass and smoldering ash.
- **Hold the laser on one spot** to heat it up: a spot held for 1.5 s blows 60% harder.
- **Sunmarked targets blow up wherever they've run to**, taking an extra **30 damage**, burning for 10 s and getting **Searing II**.
- Up to 360 spots per shot. The explosions are spread out over a second or two so the server keeps up. Cooldown: 6 s after you let go.

### Worldbreaker Orb Cannon
![Worldbreaker: a full 20 second charge, then the crater it tore through a hill](docs/worldbreaker.jpg)

- **Hold right-click to charge.** The orb grows at the muzzle, dust gets dragged into the barrel and the hum rises. A charge meter on the action bar fills over **20 seconds**, with stage flashes at **1, 5, 10, 15 and 20 s**.
- **Release** to fire an orb that ignores gravity and collision and tears through everything at **100 blocks a second (1 s charge) up to 400 blocks a second (full charge)**. It erases a tunnel up to **14 blocks wide**, lines it with molten rock, and flings and burns anything it passes.
- Once it has burrowed deep enough (**up to 160 blocks** at full charge) or hits bedrock, it detonates. It carves a funnel crater from where it entered the ground down to the blast point. At full charge the crater is **about 70 wide** and follows the tunnel all the way down. The ground caves in from the middle outwards over a few seconds.
- The crater's walls are lined with molten rock, magma and scorched stone, and the rim is left burning and covered in ash. Debris rains down around it, and nearby water, lava and sand pour into the hole.
- **Overcharge warning:** holding a full charge for more than **3 s** makes the cannon unstable (the meter flashes red, an alarm sounds and the screen shakes). Keep holding and it **backfires** on you.

Everything scales smoothly with the charge. Sizes grow fastest early on, so even a few seconds of charging pays off:

| Charge | Speed | Tunnel width | Burrow depth | Crater mouth | Direct hit damage |
|---|---|---|---|---|---|
| 1 s | 100 blocks/s | ~4 | 10 | ~10 wide | 20 |
| 5 s | ~160 blocks/s | ~8 | 79 | ~37 wide | 148 |
| 10 s | ~240 blocks/s | ~11 | 113 | ~50 wide | 213 |
| 20 s | 400 blocks/s | 14 | 160 | ~68 wide | 300 |

The orb detonates at the edge of the simulated world instead of flying on into unloaded chunks. The crater's shape is worked out on a background thread and carved a few thousand blocks per tick, so even a full-charge crater (hundreds of thousands of blocks) doesn't freeze the server.

### Riftfang Scythe
![Riftfang: a tear left by a hit, a hurled rift, and Void Harvest maws](docs/riftfang.jpg)

- 16 attack damage, slow swings, +1.5 block reach. Enchantable like a sword (Sharpness, Sweeping Edge, Fire Aspect...).
- **Every hit** leaves a glowing tear in space that stays for 3 s. Anything that touches it is swallowed, takes void damage that ignores armor, and drops out of a matching tear **18–26 blocks up**, where fall damage finishes the job.
- **Right-click (Rend):** hurls a travelling rift that swallows everything it passes through.
- **Sneak + right-click (Void Harvest):** opens a maw under **every enemy within 20 blocks**, up to 40 of them. The maws hold their victims, swallow them, and spit them out **40 blocks up in the sky**. Recharges in 30 s (shown on the item's bar).

### Stormcaller Gauntlet
![Stormcaller: chain lightning, Thunderfall Slam, Thunder Call](docs/stormcaller.jpg)

- Fast punches (9 damage). Every punch stores **1 charge** (max 10) and arcs chain lightning to nearby enemies. The more charge stored, the more jumps it makes.
- **Look up + right-click (Thunder Call):** lightning strikes everything you punched in the last 15 s, or the nearest monsters if you haven't punched anything. Damage scales with stored charge.
- **Right-click at 10 charge (Thunderfall Slam):** you leap into the air and dive back down. On impact, a ring of lightning and a shockwave expands 13 blocks, launching mobs, setting the ground alight and charring it. You take no fall damage.
- **Right-click with 3+ charge (Static Burst):** arcs lightning to the 5 nearest enemies.
- The gauntlet's texture and the sparks around your hand get brighter as it charges. Unused charge slowly decays.

### Gravemaker
![Gravemaker: black hole ripping up terrain, the collapse, and the void-lined crater](docs/gravemaker.jpg)

- **Right-click** fires a dark marble that blooms into a **black hole** for 4 s. It drags in mobs, items, projectiles and **chunks of ripped-up terrain** in a spiral, and crushes anything at its core.
- Then it **implodes** and **detonates outward**. The debris is flung everywhere, and it leaves a crater lined with obsidian, crying obsidian and blackstone.
- **Sneak + right-click** fires a **white hole** instead. It blasts everything away from it, you included, and forgives your fall damage, so you can use it to launch yourself.

---

## Effects and aftermath

- **19 custom particles:** embers, ash, charred flakes, heavy smoke, magma droplets, blast dust, fire bursts, the sun beam, sparks, void motes, rift glows, rift ground rings, the singularity core, white flares, static sparks, lightning arcs, the energy orb and ground shockwave rings.
- **Screen shake** scales with distance from the blast. It moves only the camera, never your aim.
- **Status effects:**
  - *Searing*: burning damage over time.
  - *Electrified*: slowness plus periodic shocks.
  - *Sunmarked*: the Sunline marker.
- **Aftermath blocks:**
  - **Scorched Stone**: glows, smokes and spits embers while hot, then cools.
  - **Molten Rock**: lights up, burns anything walking on it, bubbles and pops magma. It cools into scorched stone, instantly if it touches water.
  - **Smoldering Ash**: smokes, crackles and singes your feet, then burns out into plain **Ash**.
- **Custom death messages**, for example: "*Steve was unmade by Alex's Worldbreaker*".

## Server settings

| Game rule | Default | Effect |
|---|---|---|
| `/gamerule overkill:terrain_destruction` | `true` | `false` keeps every block intact. Damage and visuals still work. |
| `/gamerule overkill:weapon_fire` | `true` | `false` stops the weapons from starting fires. |

The weapons never hurt their wielder (except the Worldbreaker backfire), their tamed pets or teammates. They only hurt other players when PvP is on. Crater carving is spread over several ticks so even the biggest blast won't freeze a server.

## Recipes

Every weapon needs a **Nether Star**, so you'll need to beat the Wither first.

| Weapon | Ingredients |
|---|---|
| Sunline Rifle | Nether Star, 2 Blaze Rods, Gold Block, Diamond Block, End Rod, Netherite Ingot |
| Worldbreaker Orb Cannon | Nether Star, Heavy Core, Beacon, TNT, 2 Netherite Ingots, Obsidian |
| Riftfang Scythe | Nether Star, 2 Echo Shards, Netherite Ingot, End Rod |
| Stormcaller Gauntlet | Nether Star, Heart of the Sea, 2 Lightning Rods, 2 Copper Blocks, 3 Netherite Ingots |
| Gravemaker | Nether Star, Eye of Ender, Echo Shard, 2 Crying Obsidian, Netherite Ingot, Obsidian |

Exact shapes are in `src/main/resources/data/overkill/recipe/` and in the in-game recipe book.

## Installing

1. Install [Fabric Loader](https://fabricmc.net/use/) 0.17+ for Minecraft **1.21.11**.
2. Put [Fabric API](https://modrinth.com/mod/fabric-api) and `overkill-arsenal-1.0.0.jar` in your `mods` folder.
3. Launch, open the **Overkill Arsenal** creative tab and break something.

## Building

You need JDK 21.

```sh
./gradlew build          # jar ends up in build/libs/
./gradlew runClient      # dev client
```

`tools/generate_textures.py` (Python 3 + Pillow) redraws every texture from code: the weapon pixel art, the block textures and the particle sprites.

### Headless showcase test

`src/gametest` holds a Fabric client gametest. It builds a firing range, fires every weapon and screenshots the results. It runs headless with software rendering:

```sh
xvfb-run -a ./gradlew runClientGameTest
# screenshots: build/run/clientGameTest/screenshots/
# OVERKILL_SHOWCASE=sunline,worldbreaker runs only those sections
# OVERKILL_SHOWCASE=particles runs a quick particle calibration scene
```

Loom wipes `build/run/clientGameTest` at the start of every run, so copy the screenshots somewhere else before running it again.
