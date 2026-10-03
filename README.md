# Munch Lab

A toy-like 3D cooking sandbox for phones, tablets and desktops. Grab anything from the fridge, chop it, fry it, boil it, bake it, blend it, freeze it, stack it, sauce it... and serve it to **Mochi**, a fuzzy lilac food critic who will happily eat (almost) anything and react to every bite.

There are no levels, timers or wrong answers. Recognised dishes (pizza, cheeseburgers, sushi, smoothies, pancakes, fries, soups...) go into Mochi's cookbook, and everything else gets a silly name of its own.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

- **Fridge** (right edge): drag food out into the kitchen, or tap it to drop it into the station you are looking at.
- **Stations**: tap a station to zoom in. Drag food between stations, or onto the station buttons at the bottom.
  - Cutting board: tap or swipe with the knife; also a peeler, rolling pin and masher.
  - Mixing bowl: whisk in circles (or press *Mix!*) - batter, dough, whipped cream, salads...
  - Frying pan & grill: tap food to flip it; drag the handle to toss. Leave it too long and it burns!
  - Soup pot: stir in circles; enough ingredients turn into soup.
  - Oven, deep fryer, toaster, microwave (popcorn!), blender and freezer.
- **Spices** (bottom right): drag a bottle over food and hold to shake, squeeze, pour, spread or spray.
- **Serve**: put food on Mochi's plate and ring the bell (or tap Mochi). You can also drop food straight onto Mochi.
- **Cookbook** (top right): every dish you have served, plus ideas to try.

## Build

```bash
npm run build         # static site in dist/
npm run build:single  # one self-contained dist-single/index.html (opens from file://)
npm test              # food logic & recipe tests (vitest)
npm run typecheck
```

## How it works

Everything is procedural: no image, model or audio files.

| Area | Where |
| --- | --- |
| Food data model, ingredient catalogue (71 ingredients, 17 kitchen products, 20 seasonings) | `src/food/types.ts`, `src/food/catalog.ts` |
| Cooking, cutting, combining, mixing, blending, freezing rules | `src/food/process.ts` |
| Dish recognition, names, Mochi's taste & reactions | `src/recipes/` |
| Ingredient 3D models (lathe / sweep / blob modelling kit, canvas textures) | `src/models/` |
| Generic cut forms (halves, slices, wedges, dice, sticks, shreds, mash...) and assemblies (stacks, toppings, piles) | `src/food/forms.ts` |
| Food shader: browning, grill marks, deep-fry crust, burning embers, frost, sauces, real bite marks, clipping for cut sandwiches | `src/render/foodMaterial.ts` |
| Kitchen environment & appliances | `src/world/` |
| Stations (board, bowl, pan, grill, pot, oven, fryer, blender, toaster, microwave, freezer, plate) | `src/stations/` |
| Mochi (canvas-drawn face, springy body, eating & 14 reactions) | `src/character/` |
| Particles, debris, sauce decals | `src/fx/` |
| Procedural sound effects, Mochi's voice and music (Web Audio) | `src/audio/` |
| HUD (fridge, spice rack, dock, cookbook) | `src/ui/` |

### Extending

- **New ingredient**: add an entry to `src/food/catalog.ts`, then a model in the matching `src/models/<category>.ts` (only `build()` is required; `profile` / `section` make the generic cuts look right). Recipes and taste pick it up from its tags and flavour.
- **New cooking method / station**: add a `HeatMethod` in `src/food/process.ts` and a station class extending `HeatStation` in `src/stations/`; give it a camera view in `src/world/layout.ts`.
- **New dish**: add a rule to `src/recipes/` (dishes are recognised from the composition of a food state).

### Dev tools

- `/viewer.html` renders model grids, e.g. `/viewer.html?cat=fruit&forms=whole,halved,sliced,diced&states=raw,grilled,burnt`, `/viewer.html?dishes=1`, `/viewer.html?kitchen=1&view=pan`.
- `tools/shot.mjs` and `tools/play.mjs` take screenshots / run scripted playtests in headless Chromium.
- `?speed=3` speeds up game time; `?quality=0..4` pins the render quality level.
