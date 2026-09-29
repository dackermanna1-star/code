# Blood Road

A first-person zombie horde defense game for the browser, inspired by *They Are Coming: Zombie Defense*. You hold a straight country road against ever-growing hordes, earn money only by killing zombies, and spend it on guns, barricades, traps and turrets between waves.

Everything is procedural: the voxel zombies and their skins, the weapon models, the textures, the sky and weather, and every sound effect (synthesized at load time, no audio files).

## Play locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # production bundle in dist/
npm run preview    # serve the production bundle
```

Click the game to capture the mouse. If the page is embedded somewhere that blocks mouse capture, the game falls back to free-mouse look; opening it in its own tab gives the best controls.

## Controls

| Action | Key |
| --- | --- |
| Move / sprint / crouch / jump | `WASD` / `Shift` / `C` or `Ctrl` / `Space` |
| Fire / aim down sights | Left mouse / right mouse |
| Reload | `R` |
| Weapons | `1`–`4`, mouse wheel, `Q` (last weapon) |
| Grenade | Hold `G` to aim (shows the throw arc), release to throw |
| Build mode | `F`, then left mouse to place, `Q`/`E`/wheel to rotate, `R` to turn 90°, `1`–`9` to pick a defense, right mouse to exit |
| Pack up a defense (between waves) | Look at it and hold `E` (keeps its current damage) |
| Start the next wave | `Enter` |
| Pause | `Esc` or `P` |

## How a day works

1. **Prepare.** Place the defenses you own (`F`).
2. **Fight.** Press `Enter` to start the wave. Money comes *only* from kills. Special zombies pay more (walker < runner < fatty < riot < brute < abomination).
3. **Survive every wave of the day.** Days 1–10 have 3 waves, days 11–20 have 4, days 21–30 have 5, and so on up to 10.
4. **Shop.** The shop opens only when the day is over: buy weapons, upgrades, defenses, grenades and a medkit, and set your loadout for the next day.

The road fades into a fog wall about 50 m out (closer in bad weather), and the horde walks out of it. There is no repair: a broken barricade is gone. Structures still standing at the end of the day go back into your inventory with their current damage. Ammo refills at the start of each wave, but health never refills on its own: buy a medkit in the shop to start the next day with +50 health.

**Death is permanent.** When you die the run is wiped: money, weapons, defenses and days are gone, and you start over on Day 1 with the starting gear. Only your lifetime records (best day, total kills) are kept.

You start with an M686 revolver, a Super Shorty shotgun, one grenade and one wooden barrier. The shop has 49 weapons across 12 categories: pistols, shotguns, SMGs, assault rifles, machine guns, marksman rifles, snipers, launchers, bows, energy weapons, flamethrowers and particle weapons. Several weapons have upgrade paths, and turret-capable weapons can be mounted on turrets.

## Tech

- **Three.js** rendering into a low-resolution target that is upscaled with nearest-neighbour filtering (the pixel look), plus a custom bloom chain and a tone-mapping/grading pass. The first-person viewmodel is drawn in its own pass.
- **Rapier** (WASM) physics: the character controller, per-limb ragdolls with joint limits, physical grenades and structure debris. About 2.5 seconds after death a ragdoll settles into static scenery that stays for the whole day. You and the zombies walk through it, and bullets and explosions leave it alone.
- **Wounds**: every bullet or pellet leaves a hole pinned to the body part it hit (plus exit wounds for rounds that pass through). Wounds follow the limb through ragdolls into the corpse, and wounded zombies drip blood.
- **Instanced voxel zombies** with box-unwrapped skins in one texture atlas, procedural animation and spring-based hit reactions. Smart zombies use a flow field; the rest walk straight at you and tear through whatever blocks them.
- **GPU particles**, a persistent blood/scorch stain map, pooled lights, tracers, casings and gibs.
- **WebAudio** synthesis of every sound, with positional voices, distance filtering and reverb.

Source layout: `src/core` (math, input, globals), `src/render`, `src/world` (road, fields, mountains, weather), `src/player`, `src/zombies`, `src/fx`, `src/weapons`, `src/defenses`, `src/game` (waves, progression, air strike), `src/ui`, `src/audio`.
