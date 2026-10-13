# Research summary — Minecraft & Rust (Deliverable A)

Research was gathered on 2026-10-13 with web search + page fetches. Conventions:

* A plain URL = page was actually fetched and read.
* **(search snippet)** = only seen in a search-result snippet.
* **UNVERIFIED** = no source found; any value given is labelled as prior knowledge.
* Rust balance changes monthly; dated where relevant (latest data: Sep 2026 "Breach and Clear").
* rust.fandom.com returned HTTP 402 and rustlabs/rustclash HTTP 403 — not used except via snippets.

The last section separates **verified facts** from **our design recommendations**, and maps each to
where it shows up in CORRODE.

---

## Rust

### R1. Building tier HP & grid
* Wall HP: Twig 10, Wood 250, Stone 500, Sheet Metal 1,000, Armored 2,000. Floors/foundations/half
  walls/doorways match the wall HP of the same tier in current data (calculator built from 22 Sep 2026
  server files) — https://www.gameserverkings.com/tools/rust/raid-calculator/,
  https://www.gameserverkings.com/knowledge-base/rust/rust-raid-chart.md. Same HP list on
  https://rustafied.com/building-in-rust.
* Foundation ≈ 3 m × 3 m: **UNVERIFIED** (prior knowledge). Indirect support: "50 m ≈ 18 foundations"
  (~2.8 m each) — https://www.rustafied.com/updates/2015/12/8/bag-changes-and-bug-fixes.

### R2. Tool Cupboard, upkeep, decay
* Privilege is emitted by the foundations/blocks connected to the TC, not the TC itself —
  https://wiki.facepunch.com/rust/the_tool_cupboard, model introduced in https://rust.facepunch.com/news/devblog-186.
  Zone extends ~16 m from each outer piece — https://rustafied.com/building-in-rust.
* Placing the TC authorizes the placer; others authorize with E; anyone with access can clear the list;
  unauthorized players can still place twig floors/ladders (wiki above).
* Upkeep = fraction of build cost per 24 h, paid from resources in the TC; building pieces count,
  deployables do not (wiki above). Progressive brackets 10 % / 15 % / 20 % / 33 % by block count —
  https://rust.facepunch.com/news/devblog-189 (thresholds later raised, https://rust.facepunch.com/news/devblog-191;
  current convar defaults only partly verified via search snippets).
* Sep 2026 group-size upkeep tax: first 4 players +0 %, next 6 +2 % each, then +4 % each, cap 300 % —
  https://rust.facepunch.com/news/breach-and-clear.
* Decay: empty TC ⇒ decay starts immediately, outermost pieces first; full decay times twig 1 h,
  wood 3 h, stone 5 h, sheet metal 8 h, armored 12 h — https://wiki.facepunch.com/rust/the_tool_cupboard.

### R3. Raid costs (outside, 22 Sep 2026 data)

| Target | C4 | Rockets | Satchels | Explosive 5.56 |
|---|---|---|---|---|
| Stone wall | 2 | 4 | 10 | 182 |
| Sheet metal wall | 4 | 8 | 23 | 399 |
| Armored wall | 8 | 15 | 46 | 798 |
| Wooden door | 1 | 1 | 2 | 18 |
| Sheet metal door | 1 | 2 | 4 | 63 |
| Garage door | 2 | 3 | 9 | 150 |

Sulfur: C4 2,200; rocket 1,400; satchel 480; explosive 5.56 ≈ 25 each. Satchels dud 20 %.
Explosion protection: wood 10 %, stone/metal/armored 50 %, metal doors 20 %, wooden door & TC −100 %
(double damage). Hard side takes −90 % melee / −50 % bullet vs soft side; explosions identical —
calculator + raid chart above.

### R4. Stability
Foundations on the ground = 100 %; stability falls with distance from ground support; 0 % ⇒ cannot
place / collapses when support is destroyed; shown with the Hammer —
https://xgamingserver.com/blog/rust-base-building-guide/, https://rust-survival.com/01_Building.
Design intent: not a weight model, just to stop absurd structures — https://rust.facepunch.com/news/devblog-35.
Exact per-piece falloff: **UNVERIFIED**.

### R5. Vitals
* Max hydration 250 (https://rust.facepunch.com/news/devblog-110); max calories 500 **(search snippet)**;
  dehydrated players can't sprint (https://rust.facepunch.com/news/devblog-107). Health max 100: **UNVERIFIED**.
* Bleeding = DoT that blocks healing **(search snippet)**; bandage: bleeding −50, health +5 —
  https://wiki.facepunch.com/rust/item/bandage.
* Radiation zones 2 / 10 / 25 / 45 rads/s; clothing protection subtracts from the rate —
  https://rust.facepunch.com/news/devblog-134.
* Comfort from campfires boosts regen when fed/hydrated; cold drains calories and health, wet makes
  it worse; heat damages — https://xgamingserver.com/blog/rust-radiation-temperature-survival-guide/.
  Exact °C thresholds **UNVERIFIED**.

### R6. Progression
* Workbench 2: 500 frags, 20 HQM, 5 basic blueprint fragments; Workbench 3: 1,000 frags, 100 HQM,
  5 advanced fragments (Oct 2025) — https://wiki.facepunch.com/rust/item/workbench2,
  https://wiki.facepunch.com/rust/item/workbench3, https://rust.facepunch.com/news/meta-shift.
* Research table consumes the item + scrap (≈20 / 75 / 125 / 500 by tier) —
  https://wiki.facepunch.com/rust/item/research.table, https://xgamingserver.com/blog/rust-how-to-unlock-blueprints.
* Per-workbench tech trees spend scrap without owning the item; blueprints persist until a BP wipe.

### R7. Combat & netcode
* Learnable recoil patterns (2017, https://rust.facepunch.com/news/devblog-171), replaced on automatics
  by aim-cone drift in 2022 (https://rust.facepunch.com/news/the-combat-update).
* Bullets are projectiles with travel time and velocity loss (AK 375 m/s, bolt 656 m/s) —
  https://wiki.facepunch.com/rust/item/ammo.rifle.
* **Movement is client-authoritative with server validation**: the server fits a curve through client
  position ticks and checks fly/speed/noclip along it; flooding ticks gets you kicked —
  https://rust.facepunch.com/news/devblog-115. Antihack levels for flyhack/speedhack/noclip/projectile
  (speed → entity → line-of-sight) **(search snippet)**.
* Server tickrate default 10 **(search snippet)**; client input ticks 32/s —
  https://www.gameserverkings.com/knowledge-base/rust/packet-flooding-player-tick/.

### R8. Wipes
Forced map wipe: first Thursday of the month 19:00 London — https://wiki.facepunch.com/rust/server-wipe-timer.
Blueprint wipe cadence: sources conflict — **UNVERIFIED**.

### R9. Death, bags, sleepers
Corpse → backpack after 300 s; backpack lifetime scales with contents
(https://www.rustafied.com/updates/2017/6/29/quality-of-life). Using a bag resets other bags within
50 m (https://www.rustafied.com/updates/2015/12/8/bag-changes-and-bug-fixes); bag cooldown ≈300 s
**(search snippet)**. Logged-out players' bodies stay in the world as sleepers —
https://rust.facepunch.com/news/friday-devblog-7.

### R10. Gathering
Gather damage per hit — ore: rock 5, stone pick 16, metal pick 30; trees: rock 10, stone hatchet 20,
metal hatchet 30 (wiki item pages, e.g. https://wiki.facepunch.com/rust/item/rock). Ore nodes give a
~20 % finishing bonus with real tools (https://rust.facepunch.com/news/devblog-166) and have hotspot
"sparkles" giving 150 % → 300 % streaks without raising total yield (https://wiki.facepunch.com/rust/Ore_nodes).

### R11. Monuments
Keycard tiers green → blue → red → elite crates (https://rust.facepunch.com/news/the-puzzle-update);
radiation from Minor to High; armed scientist NPCs whose hearing is affected by silencers.

### R12. Locks & doors
Code lock: 4 digits, 100 frags, optional guest code (https://wiki.facepunch.com/rust/item/lock.code).
Key lock 75 wood (https://wiki.facepunch.com/rust/item/lock.key). Door HP: wooden 200, sheet metal 250,
garage 600, armored 1,000 (raid chart above).

---

## Minecraft (Java Edition)

* **M1 Storage** — 16×16 chunks, 16³ sections, Y −64…319 since 1.18 (https://minecraft.wiki/w/Chunk);
  palette-indexed packed block storage, 4-bit light arrays (https://minecraft.wiki/w/Chunk_format);
  32×32-chunk Anvil region files, 4 KiB sectors, zlib default (https://minecraft.wiki/w/Region_file_format).
* **M2 World generation** — multi-noise biome placement in a 6-D parameter space; continentalness,
  erosion and peaks-and-valleys drive height splines; temperature does not shape terrain
  (https://minecraft.wiki/w/World_generation, https://minecraft.wiki/w/Noise_router). Cheese,
  spaghetti and noodle caves (https://minecraft.wiki/w/Cave). Height-banded ore batches
  (https://minecraft.wiki/w/Iron_Ore, https://minecraft.wiki/w/Diamond_Ore).
* **M3 Lighting** — 0–15 sky + block light, displayed = max; block light flood fills −1 per block;
  sky light 15 passes straight down; smooth lighting/AO darken inner corners (https://minecraft.wiki/w/Light).
* **M4 Time** — 20 TPS; day = 24,000 ticks = 20 min (https://minecraft.wiki/w/Tick, https://minecraft.wiki/w/Daylight_cycle).
* **M5 Hunger** — 20 hunger, saturation, exhaustion (sprint 0.1/m, jump 0.05, attack 0.1, regen 6/HP),
  starvation 1 HP / 4 s (https://minecraft.wiki/w/Hunger).
* **M6 Mining** — break time = f(tool speed, hardness, correct tool ÷30 vs ÷100), tool speeds wood 2 →
  gold 12 (https://minecraft.wiki/w/Breaking, https://minecraft.wiki/w/Tiers).
* **M7 Server distances** — view-distance vs simulation-distance (default 10 chunks), entity broadcast
  range (https://minecraft.wiki/w/Server.properties); Paper default tracking ranges players 128 /
  animals 96 (https://docs.papermc.io/paper/reference/spigot-configuration).

---

## Facts → CORRODE design decisions

| Finding | What CORRODE does | Fidelity |
|---|---|---|
| R1 tier HP 10/250/500/1000/2000 | `TIERS[].hp` identical | Faithful |
| R3 raid ratios (2/4/8 C4) | Breach Charge 275 structure dmg → 2/4/8 on stone/metal/armored; Fuse Charge 55 → 10 on stone | Ratios faithful, numbers ours |
| R3 wooden door ×2 explosive | `DOORS[0].damageMult.explosive = 2` | Faithful |
| R2 decay 1/3/5/8/12 h | `TIERS[].decayHours` identical | Faithful |
| R2 progressive upkeep brackets | `UPKEEP_BRACKETS` 10/15/20/33 % | Shape faithful, thresholds ours |
| R2 privilege emitted by the building | Claim Totem zone = building footprint + 3 cells (12 blocks) | Adapted (voxel grid) |
| R7 Rust movement is client-authoritative + antihack | **We deliberately go further**: server-authoritative input replay with client prediction (no fly/speed/noclip possible by construction) | Intentional divergence |
| R7 projectiles with travel time | Server-simulated projectiles with gravity, lag-compensated hit tests | Faithful in principle |
| R5 calories 500 / hydration 250 | Same maxima | Faithful |
| R5 radiation levels subtract protection | POI radiation levels; clothing protection multiplies exposure | Adapted |
| R9 sleepers, corpses, bag cooldowns | Corpse loot containers, bag cooldown 300 s; sleepers: planned | Partial |
| R10 gather per hit + finishing bonus | Per-hit proportional yields + 20 % finishing bonus with proper tools | Faithful in principle |
| M1/M2 chunks, multi-noise worldgen, caves | 16×16×128 column chunks, continentalness/erosion/peaks/temperature/humidity, cheese + spaghetti caves, vein ores | Adapted (smaller height) |
| M3 sky/block light 0–15 | Flood-fill sky + block light per chunk, smooth lighting + AO | Faithful in principle |

### The voxel raid problem (our recommendation, not a fact)
A freely editable voxel world lets raiders dig around walls. CORRODE's rules:
1. Player bases use **building pieces** (multi-voxel panels on a 4-block grid with one shared HP pool),
   not individual voxels, so Rust's raid economy carries over unchanged.
2. Inside a Claim Totem's privilege zone, unauthorized players cannot mine or place *any* block.
3. Explosives damage everything, including natural terrain (stone has a modest blast HP), so cave bases
   are possible but never invulnerable.
4. Freeform decorative blocks are cheap and weak against explosives: always worse per resource than
   structure pieces, so they never become the optimal defence.
