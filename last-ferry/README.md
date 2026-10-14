# LAST FERRY

*No one boards dead.*

A dark-comedy zombie arcade shooter in the spirit of The Seal Hunter (2005). One fixed,
angled camera on a rotting seaside pier at dusk. The last ferry is moored at the end of
the pier and survivors are boarding up the gangway, one by one. The town behind you is
burning, and the horde shambles in from the left. You are the Bosun, in a yellow oilskin
coat, holding the line with whatever the ferry's stores could spare. **If a single zombie
reaches the gangway, it's over.**

Everything is procedural: models, animation, the pier, the sea, the sky, every sound effect
and the music. The game ships as **one HTML file** (`release/LastFerry.html`, about 1.3 MB)
that runs offline. Double-click it to play.

## What's new compared to Seal Hunter

- **Not dead till the head's gone.** An ordinary kill leaves a body with glowing eyes. A
  few seconds later it twitches, then gets back up as a crawler. Headshots, fire,
  explosions, the harpoon, three nails, or a stomp from the Bosun's boot (E) keep it down
  for good.
- **The dead are terrain.** Bodies pile up and slow the horde, and joggers trip over them.
  Fire burns the pile away and explosions scatter it.
- **The pier fights back.**
  - **H** blows the ferry's horn, once per chapter: everything staggers.
  - Line up with the crane's hook (it lights up) and shoot it to drop a pallet of fish
    crates on whatever crowds under it. Stray shots from other lanes never cut the rope.
  - Fill **Captain's Favour** and press **F**: the ferry's deck gun shells your lane.
- **Fire and gas.** A flare sets a whole crowd alight and leaves the deck burning; it
  reloads itself in your belt. Bloaters burst into green gas, and gas plus fire makes an
  explosion.
- **Mop up.** Killing the boss isn't the end: the pier is held only once the stragglers
  are down too (the boss bar counts them). Lost a chapter? *Retry chapter* starts it again
  with the money and guns you had.
- **Three chapters, three times of night.**
  - *Last Light* (sunset): boss Big Dave, a 3 m bloater chef.
  - *Blue Hour*: boss The Marathon, 40 joggers in race bibs.
  - *Lights Out* (night, fog, the lighthouse beam sweeping the deck): boss The Riot Squad.
  - Then the ferry sails, and it's *to be continued*.

## Controls

| Action | Keys |
|---|---|
| Move | W A S D / arrow keys (the Bosun always fires left, along his lane) |
| Fire | Space / J / K / left mouse (not Ctrl: Ctrl+W would close the tab) |
| Reload | R |
| Buy best weapon / select or buy | B or Enter / 1–6 or click a tile |
| Cycle weapons | Q / Tab / mouse wheel |
| Stomp (jump) | E / Shift / right mouse (walk into a crawler to kick it) |
| Ferry horn | H (once per chapter) |
| Cannon strike | F (when Captain's Favour is full) |
| Pause | P / Esc |

Gamepads work too.

## Weapons

| Weapon | Price | Notes |
|---|---|---|
| "Old Faithful" revolver | free | Six shots; headshots ×3 |
| Pneumatic nail gun | $600 | Fast; 3 nails pin a downed body to the planks |
| Pump shotgun | $1,500 | 8 pellets; knocks zombies back; loaded shell by shell |
| Flare pistol | $2,200 | Sets a crowd (and the deck) on fire; lights the night; reloads itself when holstered |
| Harpoon gun | $3,500 | Skewers up to 5 zombies and reels them in; goes through riot shields |
| "Outboard" minigun | $12,000 | A boat engine with barrels. Pull-start it, then mind the heat |

## Run it

- **Play:** open `release/LastFerry.html`.
- **Develop** (from the repo root):

  ```bash
  npm install
  npm run ferry            # dev server at http://127.0.0.1:5180
  npm run ferry:test       # unit tests (logic)
  npm run ferry:sim -- 40 0.9   # headless bot balance runs (skill 0..1; MAXCH=1 stops after chapter 1)
  npm run ferry:single     # build release/LastFerry.html
  node last-ferry/tools/e2e.mjs --file release/LastFerry.html [--mode full]
  ```

- **URL options:**
  - `?play` skips the title.
  - `?autoplay` lets the bot play.
  - `?chapter=2` starts at a chapter.
  - `?money=12000` sets starting money.
  - `?god` means nothing ends the run.
  - `?speed=2` changes the game speed.
  - `?quality=low|medium|high` sets the graphics quality.
  - `?nosound` turns the sound off.

## How it's built

| Folder | What |
|---|---|
| `src/core` | Pure, deterministic game logic at 50 ticks/s with a seeded RNG: the world, chapters, zombies, bodies, fire and gas, the pier tools, weapons, the bot. It is unit-tested and bot-simulated. |
| `src/render/env` | The world: the pier deck shader that soaks up blood, the matte-painted backdrop with the burning town and lighthouse, sea, lamps, crane, ferry and survivors, gulls, time of day. |
| `src/render/models` | Procedural characters (7 zombie kinds with about 210 looks), the Bosun, 6 weapons, props and ragdoll specs. |
| `src/render/GameView.ts`, `src/render/view` | Turns logic events into visuals: ragdolls aimed at the logic's body positions, the twitch-and-rise lifecycle, gore, fire, gas, explosions, the cannon, the horn shockwave, screen shake and a shared light pool. |
| `src/ui` | HUD, callouts, world overlay and screens (dark-glass nautical style). |
| `src/audio` | 98 synthesised sound recipes, ambience and adaptive music, all made with the Web Audio API (no audio files). |
| `src/game`, `src/main.ts` | Boot, the title screen with a live demo game, the state machine, input, hit-stop and slow motion. |

The engine (ragdolls, GPU blood decals, batched corpses, particles) comes from the Seal
Hunter 3D remake in the parent folder. `DESIGN.md` is the design bible and holds every rule
and number.
