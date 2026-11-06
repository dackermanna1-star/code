# SPLEEN: SEPSIS

*An immune-system roguelite.* The full reboot of **SPLEEN** / **SPLEEN II: Neon Descent**.

The Host is dying. A rot has entered the blood. From the Spleen, the body's last armory, you are born:
one white cell with a stubborn grudge. Fight from the **Veins** through the **Heart**, **Lungs**, **Gut** and
**Cortex** to **the Wound** where it all got in, and destroy **SEPSIS**. When you fall, the Spleen
remembers, and the next cell starts a little stronger.

## Play

* **Single file:** open `dist/spleen-sepsis.html` in a modern browser (Chrome, Edge, Firefox, Safari).
* **From source:** open `index.html` (it loads the scripts in `src/`). No build step needed.
* Needs an internet connection the first time, for Babylon.js (jsDelivr) and Google Fonts.

| Action | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD | Left stick | Left thumb |
| Aim / fire | Mouse + hold LMB, or arrow keys | Right stick (auto-fires) / RT | Right thumb |
| Dash (brief invulnerability) | Space / Shift / RMB | A / LB | Dash button |
| Ability | Q | RB / X | Ability button |
| Interact | E | Y | Interact button |
| Pause | Esc / P | Start | Pause button |

## What's in it

* **4 playable strains.** Each one plays differently.
  * **Neutrophil**: steady enzyme stream; NET trap ability.
  * **Macrophage**: tanky close-range lysosome shotgun; Engulf lunge that heals.
  * **Killer T**: fragile; hold to charge piercing perforin lances, high crits; Kill Order marks.
  * **Plasma B**: homing antibodies that latch on and keep dealing damage; Memory Swarm.
* **6 regions, each with its own mechanic:** blood currents that push shots and bodies, heartbeat-synced
  enemy attacks, lung breath winds, acid floors, neural lightning storms, and necrotic elites.
* **23 pathogen types** with telegraphed, readable attacks. **Elite variants:** swollen, frenzied,
  encapsulated, volatile.
* **6 multi-phase bosses:** The Colony, Endocardia, Aspergill, The Long Hunger, Misfold, and Sepsis.
* **50 mutations** (common, uncommon, rare, malignant) built on composable stats and hooks, plus 7 named
  synergies. You **choose 1 of 3** at mutation cysts, buy at the Lymph Node shop, or trade max HP for
  malignant power at Tumors.
* **Meta-progression:** spend Memory on permanent perks in **The Spleen**. **Immune Memory** grants
  +damage against pathogens you've killed many times. Strains unlock by milestone. Beating the game
  unlocks **Fever I–V** difficulty.
* Procedural adaptive soundtrack and SFX (Web Audio), with no audio files.
* Options for volume, screen shake, damage numbers, graphics quality, touch controls, and fullscreen.

## Tech

* [Babylon.js](https://www.babylonjs.com/) 9.30.0, using its glow layer, default rendering pipeline
  (bloom, chromatic aberration, grain, ACES), and thin instances for bullets and particles.
* The gameplay simulation is plain JS on a 2D tile grid (`src/world.js`, `src/combat.js`, …). It is
  decoupled from rendering, so it can run headless.
* All art is procedural: membranes, tissue floors painted to canvas textures, and decals.

```
src/util.js     math, seeded RNG, storage, event bus
src/data.js     regions, strains, pathogens, bosses, mutations, perks (pure data)
src/audio.js    procedural SFX + generative adaptive music
src/input.js    keyboard/mouse, gamepad, touch twin-sticks
src/gfx.js      Babylon renderer, camera, materials, instance pools, room meshes
src/world.js    tiles, collision, line of sight, flow fields, floor generation
src/combat.js   projectiles, damage, status effects, hazards, pickups
src/player.js   strains, weapons, abilities, dash, mutations, companions
src/enemies.js  pathogen AI + visuals, elites, encounters, region mechanics
src/bosses.js   the six bosses
src/ui.js       HUD, menus, modals, title scene
src/game.js     state machine, rooms, rewards, meta save, main loop, autopilot
```

### Development tools

```bash
node tools/build.js                                   # -> dist/spleen-sepsis.html
node tools/sim.js "start=1&seed=5" 600                # headless autopilot playthrough (fast)
node tools/shot.js "start=1&auto=1" /tmp/shot 8000    # screenshot + console errors
```

Debug URL parameters: `?start=1&strain=tcell&floor=3&boss=1&god=1&seed=42&mut=enzyme,mitosis&unlock=1&auto=1`.
