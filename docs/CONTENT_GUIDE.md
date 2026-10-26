# Homebody — Content Guide

How to add items, behaviors, recipes, collectible series and video games.
Everything is procedural: models are built from primitives in code, textures
are drawn on canvases, sounds are synthesized. No binary assets.

## Running & checking your work

```bash
npm install
npm run dev                                   # http://localhost:5173  (game)
# item thumbnails (fast visual check, no game boot):
#   http://localhost:5173/preview.html?q=burger | ?cat=food | ?store=grubhop | ?ids=a,b
node scripts/preview.mjs "store=grubhop" scripts/shots/grubhop.png   # headless screenshot of the grid
node scripts/shot.mjs "http://localhost:5173/?q=low" scripts/shots     # boots the game, tours rooms, prints console errors
npx vite build                                # must pass
```

`scripts/preview.mjs` prints `N items · E errors`; E must be 0. Look at the PNG
it produces — every model should read clearly as what it is.

## Item definitions

Catalogue files live in `src/catalog/*.js` and call `defineItems([...])` from
`src/items/registry.js`. They are imported by `src/catalog/index.js`.

```js
defineItems([{
  id: 'smash_burger',            // unique, snake_case
  name: 'Classic Smash Burger',
  category: 'food',              // see CATEGORIES in registry.js
  price: 11.5,                   // USD, realistic
  stores: ['grubhop'],           // where it's sold (see stores below); [] + hidden:true = not sold
  restaurant: 'smashbros',       // food apps only: restaurant id
  desc: 'One or two lines, playful and concrete.',
  rarity: 'common',              // common | uncommon | rare | epic | legendary
  tags: [],                      // see tags below
  brand: 'Optional brand',
  emoji: '🍔',                   // fallback icon
  build: (def, st) => THREE.Object3D,  // the model
  use: { type: 'eat', ... },     // behavior config (see below) — almost every item needs one
}]);
```

Optional fields: `place` ('surface' default | 'floor' | 'wall'), `furniture`
(true = too big to hold; moved in placement mode; auto when > ~0.95 m),
`hold: { pos:[x,y,z], rot:[x,y,z], scale }` (view-model tweak), `season`
('spring'|'summer'|'autumn'|'winter' — only sold that in-game season),
`limited: true` (only sold during 6 PM limited drops; resells high), `resale`
(base resale value), `hidden: true` (never in shops), `dynamic: true` (model
depends on `st`), `initState: () => ({...})`, `noCollide`, `packaging`
('bag'|'box'|'shoebox'|'tube'|'flatpack').

**Tags**: `rug` (flat floor covering, walkable), `soft` (soft thud sound),
`glass` (clink), `ball`, `recyclable`, `trash`, `framed`, `anywhere` (furniture
that may sit on other furniture), `resell` (sellable on Stockpile), `webcam`,
`microphone` (owning both enables game streaming), `homemade`, `kitchen`,
`bathroom`.

### Model conventions

- Units are meters. Real-world scale (a mug is ~0.1 m, a sofa ~2.2 m).
- Origin at the **bottom center**; the item's **front faces +Z**.
- Wall items (`place: 'wall'`): origin at the **center of the back face**
  (z = 0 touches the wall), artwork facing +Z.
- Seats face +Z (a person sitting looks toward +Z). Beds: headboard at −Z.
- Desks/computers: the user stands/sits on the +Z side looking toward −Z.
- Keep it to roughly 5–40 meshes. Use the kit helpers: they cache geometry
  and materials. Don't allocate new geometries per instance unless `dynamic`.
- Canvas textures: use `labelTexture(key, w, h, draw)` / `decal()` with a stable
  unique key; 256 px is plenty.

### Model kit (`src/items/kit.js`)

`mat(color, {rough, metal, emissive, ei, opacity, transparent, map, clearcoat, sheen, side})`,
`MAT.plastic|gloss|matte|metal|chrome|gold|glass|ceramic|rubber|fabric|knit|wood|paper|cardboard|emissive|leather|screen|skin`,
`box(w,h,d,m)`, `rbox(w,h,d,radius,m)`, `cyl(rTop,rBot,h,m,seg)`, `sph(r,m)`,
`torus(r,tube,m,radSeg,tubSeg,arc)`, `cone(r,h,m)`, `capsule(r,len,m)`,
`plane(w,h,m)`, `disc(r,m)`, `lathe([[r,y],...],m)`, `tube([[x,y,z],...],radius,m)`,
`extrude([[x,y],...],depth,m,bevel)`, `at(obj,x,y,z)`, `rot(obj,x,y,z)`,
`group(...children)`, `labelBox(w,h,d,bodyMat,key,draw)` (box with a painted +Z face),
`decal(w,h,key,draw,{tw,th,emissive})`, `drawLabel(ctx,w,h,{bg,fg,accent,title,sub,emoji,pattern})`,
`fitText`, `blobShadow`, `tint(color,k)`, `mix(a,b,t)`, `FONT`.

Shared parametric models (`src/catalog/shared.js`): `can`, `bottle`,
`takeawayCup` (incl. clear boba cups), `mug`, `glassTumbler`, `plate`, `bowl`
(with toppings), `burger`, `pizzaSlice`, `foodBox`, `takeoutPail`, `fruit`,
`banana`, `wrapBar`, `carton`, `productBox`, `jar`, `pumpBottle`, `squeezeTube`,
`sprayBottle`, `foldedGarment`, `sneaker`, `capHat`, `beanie`, `bookModel`,
`wallArt({w,h,draw,key,frame})`, `shadeHex`. Read the file for parameters,
and `src/catalog/core_furniture.js` / `core_essentials.js` for examples
(sofa, bed, lamps, PC, plants, coffee machine, toaster...).

Geometry you cache and reuse across builds (e.g. a memoised sneaker upper)
must be marked `geometry.userData.shared = true`: model measurement and the
thumbnail renderer dispose every geometry that isn't marked shared.

## Behaviors (`use: { type, ... }`)

Handlers live in `src/items/behaviors/*.js`. Pick the matching type; add new
handler types with `registerBehaviors({ myType: { held(inst), world(inst), update(inst, dt), init(inst), dispose(inst), subtitle(inst) } })`
(see the interface comment in `behaviors/index.js`). Actions are
`{ key: 'E'|'F'|'R'|'Q'|'T'|'X'|'LMB', label, run }`.

Consumables
- `eat`: `bites, needs:{hunger,thirst,energy,hygiene,fun,comfort}, buff, buffMin, sound ('bite'|'crunch'|'slurp'), crumbs (color), hot, sweet, healthy, cuisine, leftover (item id), emoji`.
  Meshes with `userData.bite = n` disappear in increasing n as you eat; otherwise the model shrinks.
- `drink`: `sips, needs, buff, buffMin, open ('can'|'bottle'|'cup'), fizzy, hot, leftover, sound, emoji`.
  Liquid meshes get `userData.liquid = true` (geometry origin at its bottom, it scales down in Y). Optional named `tab` / `cap`.
- `ingredient`: `uses` (consumed by recipes/appliances).
- `toothbrush`, `toothpaste {uses,color}`, `spray {uses,buff,buffMin,needs,mist,scent,verb}`, `soap {uses,scent}`,
  `shampoo|bodywash|conditioner {uses,scent}` (auto-used in the shower), `skincare {uses|single:true,needs,buff,overlay (css color),overlaySec,verb,sound,leftover}`,
  `bathbomb {color}`, `hairdryer`, `vitamins {uses,buff,needs}`.

Wearables
- `wear`: `slot` ('top'|'bottom'|'shoes'|'hat'|'glasses'|'accessory'), `style`
  (tops: tee, tank, shirt, longsleeve, hoodie, sweater, jacket, coat, puffer, dress;
  bottoms: jeans, pants, sweats, shorts, skirt; shoes: sneakers, boots, slippers, heels, loafers;
  hats: cap, beanie, bucket, beret, crown; glasses: wire, sun, round (+ `lens` color);
  accessory: headphones, chain, necklace, scarf, watch, backpack (+ `metal`)),
  `color`, `color2`, `fabric: 'knit'`, `vibe: [...]` (cozy, street, formal, sporty, basic, luxe, y2k, cottage, dark, retro, preppy, boho, techwear, party),
  `points` (1–10 style points), `comfy`. The mirror avatar renders these.

Home
- `light`/`lamp`: `bulb:[x,y,z], intensity, distance, color, smart, flicker, rainbow, lava, ei, startOn`. Meshes with `userData.bulb` glow when on. Lava lamps: blobs with `userData.blob, baseY, range`.
- `seat`: `seats:[[x,z],...], height, comfort, lie, lieHead, width, verb, sound`.
- `bed`: `length, width, height, quality`; name meshes `duvet`, `pillow`, `sheet` for bedding swaps. `bedding`: `color, color2`.
- `plant`: `thirst` (leaf meshes `userData.leaf`). `wateringcan`.
- `candle`: `burn` (minutes), `flame:[x,y,z], scent` (flame meshes `userData.flame`).
- `diffuser`: `buff, mist` (glow meshes `userData.bulb`).
- `clock`: pivots named `hourHand` / `minuteHand` rotating around Z (faces +Z).
- `neon`: `color` (tube meshes `userData.neon`, emissive). `fan`: named `rotor` (spins on Z), optional `head`.
- `aquarium` (fish meshes `userData.fish`, `userData.r` orbit radius), `vacuum` (named `brush`), `projector {colors}`.
- `decor`: `verb, lines:[...]` (flavour text when admired), `squish` (huggable). Use at least this for any decorative item.

Tech
- `tv` (mesh named `screen`, a plane facing +Z), `console {bundled:[gameIds]}` (mesh `led`), `handheld {bundled}`,
  `game {game: gameId}`, `arcade {game,title}` (+ `screen`), `computer {userPos,eye,pitch,laptop,portable}` (+ `screen`, `userData.rgb` meshes),
  `speaker`/`radio {station, stations, volume, lofiFilter}` (optional mesh `cone`), `turntable` (named `platter`, `arm`, `disc` > `discLabel`),
  `vinyl {station, color}`, `smartspeaker` (mesh `ring`), `telescope {fov}`, `camera {filter}`, `headphones`, `vr {game}`.
  Music stations: lofi, jazz, synth, ambient, chip, pop, classical, bossa.

Toys & collectibles
- `spinner` (named `rotor`), `bubbles {uses,count,big,tint}`, `ball {bounce,sound}`, `yoyo` (named `yoyo`, `string`),
  `squeak`/`squish {verb,sound,fun,comfort}`, `cube` (named `layer`), `snowglobe {center,r,flake}`, `glider`, `eightball`,
  `instrument {kind: guitar|ukulele|keys|kalimba|harmonica|drums|violin|bass}`, `cradle` (pivots `pivotL`, `pivotR`), `dice {sides}`,
  `cards`, `slinky`, `kendama`, `top`, `clicker {verb,sound}`, `kaleidoscope`, `rc {speed, drone}` (wheels `userData.wheel`, props `userData.prop`).
- `blindbox {series}` and `cardpack {set, count}`: register series/sets by mutating the exports of `src/items/behaviors/toys.js`:
  `SERIES[id] = { name, items: [figureItemIds] }` (figure items have rarities — they're rolled by rarity weight),
  `CARD_SETS[id] = { name, cards: [{ id, name, rarity, emoji, color, value }] }`.

Hobbies
- `book`/`comic`/`magazine`/`ereader {pages, genre, author}` — genres with bespoke prose: 'Cozy Mystery', 'Sci-Fi', 'Fantasy', 'Romance', 'Self-Help' (others use a literary default). Comics: `palette, lines`.
- `cookbook {pages, genre, recipes:[recipeIds]}` (teaches `learn:true` recipes), `easel {free}`, `journal`,
  `project {steps, sessions, seconds, verb, icon, sound, produces, consumeOnDone, doneText}` (meshes with `userData.step` appear as you progress — puzzles, model kits, knitting),
  `workout {verb,label,seconds,needs,buff,standAt,eye,pitch,y,faceBack,sound,icon,handheld}`, `meditate`, `boardgame {game}`.

Kitchen appliances
- `station {recipes:[{label, needs:[itemIds], makes, seconds, free, out:[x,y,z]}], verb, anim ('spin' needs mesh `spin` | 'pop' needs `lever` | 'shake' | 'steam'), loop (sound), out, reheat, doneSound}` — a mesh named `glow` lights while working.
- Stove/oven recipes: `registerRecipes([{ id, name, method: 'stove'|'oven', cookware: 'pan'|'pot', seconds, ingredients:[itemIds], makes, color, learn }])` from `src/world/cooking.js`. Dishes are `hidden` food items.

Buff ids (`src/player/needs.js`): wellFed, caffeinated, sugarRush, fresh, pampered, minty, clean, scented, glowing, goodHair, relaxed, blissful, wellRested, napped, cozy, calm, zen, inspired, reflective, endorphins, groovy, inTheZone, dreamy, stylish, comfy, vitalized, treatYoself, social, freshRoom.

## Stores (`src/shop/stores.js`)

`grubhop` (restaurants), `dashr` (cafés, sweets, convenience), `freshcart` (groceries & essentials),
`primo` (everything store), `threadline` (fashion), `nestly` (furniture & decor), `volt` (electronics & games),
`glow` (beauty & bath), `greenhouse` (plants), `arthaus` (prints & art supplies), `kollectiv` (blind boxes, figures, cards, plush),
`stockpile` (resale: sneakers, collectibles, limited drops; prices move daily), `luxe` (luxury).

Restaurants — grubhop: smashbros, slicehouse, koisushi, noodlenook, tacoloco, greenbowl, curryhouse, wokstar, cluckhut, sunnyside;
dashr: beanery, bobabliss, glazed, scoops, crumb, blendz, nightowl.

## Video games (`src/games/`)

See the API comment at the top of `src/games/index.js`. Each game file calls
`defineGame({ id, title, genre, icon, color, desc, help, platforms, create(api) })` and
is imported from `src/games/all.js`. `create` returns `{ update(dt, input), draw(ctx, w, h), destroy? }`
on a 640×400 canvas; call `api.addScore`, `api.sfx(name)`, `api.music(station)`, `api.gameOver()`.
Freelance gigs (WorkHub on the computer) are games with `gig: true, pay: (score) => dollars, payText`.
Games become playable once their id is in the player's library (bought as a `game` item or `bundled` with a console) or if `free: true`.
SFX names: click, ui, pop, blip, coin, hit, explode, powerup, success, error, levelup, sparkle, reveal, whoosh, thud, squeak, boing, chime, beep.
