# homebody 🏠

*A cozy 3D first-person life sim — a whole life, delivered.*

You live on the 24th floor of a downtown tower and you never need to leave.
Everything happens inside your one-bedroom apartment: you browse a dozen
shopping and delivery apps on your phone or computer, deliveries ring the
doorbell minutes later, and every single thing you buy *does something* —
you eat it, drink it, wear it, play it, hang it, plant it, spin it, read it.

Built with [three.js](https://threejs.org) and Vite. **No binary assets**:
every model, texture, sound effect and music track is generated procedurally
at runtime.

## Play

```bash
npm install
npm run dev          # open http://localhost:5173 and click "Move in"
npm run build        # production build in dist/ (static, host anywhere)
```

Use a desktop browser with a mouse. Headphones recommended (spatial audio).

| Key | Action |
| --- | --- |
| WASD / Shift / C / Space | Move · run · crouch · jump (or stand up) |
| Mouse | Look |
| **E** · **F** · **R** · **Q** | Context actions (see the on-screen prompt) |
| Left click | Use the held item (eat, sip, spray, spin, play…) |
| Hold right click | Inspect the held item (rotate with mouse, scroll to zoom) |
| F (while holding) | Place it — on surfaces, walls or the floor (scroll / Q / R rotates) |
| G | Drop · hold to charge a throw |
| X | Stash in storage |
| Tab | Phone · **I** storage · **Esc** pause |

## What's in it

**The apartment** — open living room & kitchen with floor-to-ceiling windows,
a bedroom with a city view, a bathroom and a walk-in closet. Real-time sun
shadows through the windows, soft window light, a day/night cycle, weather
(rain on the glass, thunderstorms, snow, fog), a procedural skyline with
traffic, a river and a bridge, fireworks on weekend nights, pigeons on the
ledge and the neighbor's music through the wall.

**Everything is interactive** — doors, light switches (and smart-home color
scenes), blinds that really block the sun, a fridge whose shelves show what
you've stored, a gas range for cooking (with a timing minigame), a sink,
shower and bathtub (bath bombs!), a toilet, a mirror cabinet with a live
reflection of your outfitted avatar, a wardrobe, a full-length mirror,
storage, a peephole, a thermostat and a hallway where packages land.

**Shopping** — food delivery (GrubHop restaurants, Dashr cafés & sweets),
groceries (FreshCart), an everything store (Primo), fashion (Threadline),
furniture & decor (Nestly), electronics & games (Volt), beauty (Glow),
plants (Greenhouse), art (ArtHaus), blind boxes & trading cards (Kollectiv),
a live sneaker/collectible resale market with price charts (Stockpile) and
luxury goods (Maison Luxe). Daily deals, flash sales, seasonal items and
limited 6 PM drops. Stores unlock as your lifestyle level rises.

**Deliveries** — packages land on your doormat with a doorbell and knock:
paper bags for takeout, shoeboxes, poster tubes, flat-pack furniture you
assemble, cardboard boxes that pop open and toss your stuff into the room.
Break the empties down for a recycling refund.

**Using things** — bite-by-bite eating, sip-by-sip drinking, cans that crack
open, coffee machines, toasters and other countertop appliances, a cookbook
recipe system, toothbrushing at the sink, perfume mist, face masks, outfits
with a style score, TVs with ten channels, consoles with real minigames,
a desktop computer (shopping, freelance gigs, trading, PC games, streaming
for tips), speakers and record players with procedural music stations,
plants that grow and wilt, candles, star projectors, aquariums, robot
vacuums, RC cars & drones, instruments you can practice, an easel where you
paint art you can hang, a journal, puzzles and model kits, books you can read.
Dressers, nightstands, media consoles and bookshelves hold your things, and
tables square up whatever you've left on them. 850+ items across 19
categories, each with its own model and something to do.

**Life** — lightweight needs (hunger, thirst, energy, hygiene, fun,
comfort) with mood buffs; comfort comes from how you've decorated each room.
Daily challenges, achievements, text messages from friends and family,
daily royalties, and a collection log of everything you've discovered.
Progress saves automatically to local storage.

## Project layout

```
src/
  core/        engine (renderer + post FX), procedural audio & music, input, clock, state, textures
  world/       apartment shell, fixtures (kitchen, bathroom, closet, doors, blinds, hallway), sky, city, weather, ambient life
  player/      controller, interaction prompts, held-item view model, placement, needs, outfit, mirror avatar
  items/       item registry, instances & persistence, physics, model kit, behaviors (what items do)
  catalog/     item definitions (models + behavior config)
  shop/        stores, pricing & market, orders & delivery, packaging
  progression/ money, levels, challenges, achievements, messages
  ui/          HUD, phone & apps, computer OS, panels, TV channels, thumbnails
  games/       canvas minigames for consoles, PC, handhelds, arcade & VR, plus freelance gigs
```

Adding content? See **[docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md)**.
`preview.html` renders thumbnails of catalogue items for quick checks, and
`scripts/` contains headless Playwright tours (`shot.mjs`, `flow.mjs`,
`tour.mjs`, `preview.mjs`). With the dev server running,
`node scripts/validate.mjs` checks every item (categories, stores, behaviors,
recipes, wearables) and reports anything unobtainable or purely decorative.
