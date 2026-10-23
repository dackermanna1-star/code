# What Derry Keeps — Art Direction (pixel art)

> If a new asset doesn't look like it belongs on the same shelf as the rest,
> it's wrong, no matter how good it looks on its own.

## The identity in one line

**"Late light, hand-pixelled."** Derry in the slanting gold of an October
afternoon and the deep blue of a Maine night, drawn the way Stardew Valley is
drawn: warm, saturated, chunky but detailed pixel art with hue-shifted ramps,
dark plum outlines and soft, rounded light. It is a small-town horror story,
so the warmth has corners it doesn't reach.

Touchstones: Stardew Valley (portraits and towns), Eastward (lighting, clutter
with purpose), Kentucky Route Zero (theatrical light), 1990s horror paperbacks.

## Pixel size and canvases

| Asset | Native size | Notes |
|---|---|---|
| Backgrounds, CGs, title, map | **320 × 180** | upscaled by a whole number, then fitted to the stage |
| Character sprites | **118 × 176** | chest-up; same pixel size on screen as backgrounds |
| Dialogue portrait | crop of the sprite | `portraitBox` in the character def |

Everything is drawn at native size into a palette-indexed surface
(`js/px/px.js`). Never draw at a higher resolution and scale down. Every pixel
is a choice.

## Palette

All colors come from **ramps** in `js/px/px.js` (`PX.P.<ramp>[shade]`, shade 0
darkest to 5 lightest). Ramps are hue-shifted: darks lean toward violet, lights
toward warm yellow. That is what makes pixel art look painted instead of
filtered. To add a material, add a ramp with `PX.ramp(name, [6 hex colors])` in
your own file (dark → light, hue-shifted). Never pick a one-off hex.

- Shade 0 is the outline / deepest shadow of that material. Outlines are never
  pure black. Use the darkest shade of the thing being outlined, or `ink`.
- **Lantern green** (`lantern` ramp, `green` light channel) is
  **supernatural only.** Nothing ordinary is ever this green.
- Night is blue and warm-lit, never grey. Quiet Night is near-black teal, with
  no warm light anywhere. The Lamp's green is the only light.

## Light

Draw every scene in **daylight colors**. Each time of day is a preset
(`PX.TIME`): an ambient multiply that darkens and tints everything that is not
emissive, plus light sources that lift their surroundings back up in dithered
steps.

- `s.light(channel, cx, cy, rx, ry, amount)` adds an elliptical pool.
  Channels: `warm` (lamps, windows), `sun` (shafts), `cool` (TV, moon),
  `green` (the Lamp only), `white`, `red`.
- `s.lightPoly(channel, poly, amount, {fade:{x0,y0,x1,y1}})` adds shafts and
  cones.
- Emissive pixels ignore the ambient multiply. Draw them with `PX.E(code)`:
  skies, the sun and moon, lit windows (`s.window(..., {lit:true})` does it),
  lamp bulbs, screens, neon, candles, and the Lamp.
- A lit window at night is the warmest, brightest thing in the frame.
  Streetlights get a light pool on the ground. Interiors at night get one or
  two practical lights with real falloff, not a uniform glow.
- Presets: `day morning afternoon dusk evening night quiet dawn rain dim
  flashlight fluorescent festival lanterns empty_night`. A def can map its own
  time names to presets (`preset: {lanterns: 'night'}`) and to sprite tints
  (`light: {...}`).

## Backgrounds

**Composition.** Read the frame as the stage. The dialogue box covers the
bottom ~28% (y > 130), so keep focal details above that. Character sprites
stand at x ≈ 87, 160 and 233 (27/50/73%), with heads at y ≈ 25–80. Keep those
zones calm and mid-value (no high-contrast clutter right behind a head).

**Depth.** Exteriors use 4–6 layers: sky, far hills (lighter and bluer:
atmospheric perspective), mid buildings and trees, foreground props. Far
layers have less contrast and fewer details. Near layers are saturated and
textured.

**Texture with discipline.** Use the texture helpers (`bricks`, `clapboard`,
`shingles`, `planks`, `stones`, `grass`, `foliage`, `pine`, `cloud`, `stars`,
`window`). Clusters, never salt-and-pepper noise. Single stray pixels are
mistakes. Dither only for skies, light falloff and soft transitions, never
for texture.

**Form.** Every solid object has a lit side (upper left) and a shadow side,
plus a contact shadow where it meets the ground or wall (`s.shift(region, -1)`
darkens a region by one shade). Architecture is straight and plumb. Nature gets
seeded irregularity (`o.rng`), so every render is identical.

**Lived-in, not cluttered.** Props tell you who lives there (a crucifix, the
Holy Rosary calendar, a Hummel figurine, fridge magnets, posters, cassette
tapes), but the middle band of the frame stays calm.

## Characters

Built with the rig in `js/px/pxchar.js` (see the API below). The style is
Stardew portraits at a slightly larger scale:

- **Chest-up framing**, three-quarter view facing the viewer's left, light
  from the left. The engine mirrors a sprite automatically when it stands on
  the left, so it faces center stage. Text and logos must go in `decal(s, o)`
  so they aren't mirrored.
- **Rounded forms, not flat polygons.** Faces, necks, shoulders, sleeves,
  clothes and hair are inflated shapes and tubes. The Builder lights them and
  snaps them to 4–5 tones, so nothing looks boxy. Arms read as arms (separate
  sleeves with a crease or gap against the torso). Shoulders slope.
- **Hair is the silhouette.** Build it from a back mass, a crown, and 4–6
  locks (`B.lock`) that each taper to a point and catch a highlight. Bangs end
  above the brows so expressions read. Hair casts a shadow on the forehead
  automatically.
- **Faces:** big clear eyes (a lash line, a rimmed iris, a highlight, a pupil),
  expressive brows, a small three-quarter nose, a small mouth. Lips get color
  for characters who'd wear lipstick (`lips: 'lip_red'`). Age shows with
  `lines: 1..3`, `stubble`, a heavier `jaw`, droopier lids (via `head`).
- **Expressions** (every character): `neutral smile grin laugh sad angry
  surprised afraid worried thinking smirk flat blush cry`. Characters blink.
- **Signature silhouettes** (keep them consistent):

| Character | Age | Silhouette & palette |
|---|---|---|
| **Gus** (Augusta Brennan) | 14 | Messy dark-brown shoulder-length hair, side-swept chunky fringe; freckles; grey-green eyes. Olive army-surplus jacket open over a maroon tee with a faded cassette print; black Walkman headphones around her neck. |
| **Claire** (Mom) | 44 | Dark curls streaked grey, pinned up with a claw clip, strands escaping; reading glasses pushed up on her head; tired eyes. Cornflower scrubs under a long grey cardigan. |
| **Mémère** (Yvette Thibodeau) | 72 | Small. White hair in a bun with wisps; small oval wire glasses; deep smile lines. Mauve cardigan **buttoned wrong**, lace collar, a small **brass lantern pin**. |
| **Teddy** (Theodora Okafor) | 14 | Dark brown skin; high round natural puff with a green/teal scrunchie; big round glasses. Color-block windbreaker (purple / teal / pink), collar up; Saturn enamel pin. |
| **Cal** (Calvin Ashgrove) | 14 | Pale, long narrow face, dark circles. Straight black hair too long, falling over one eye; thin gold wire-rims. Oversized brown tweed jacket over a black tee. |
| **Sloane** (Sloane Ashgrove) | 14 | Cal's twin. Honey-blonde sleek chin-length bob, black velvet headband, pearl studs, arched brows. Cream cable-knit cardigan over a white collared blouse. |
| **Wes** (Wesley Pike) | 15 | Buzz cut growing out; lean face; healing split lip; tired eyes. Too-big red-and-black buffalo-plaid flannel over a grey thermal; pencil behind his ear. |
| **Ms. Whitcomb** (Paige) | 23 | Voluminous auburn hair with curled late-'80s bangs; moon-and-star earrings; big mustard cardigan over a floral dress. |
| **Mr. Teague** | 68 | Grey thinning crew cut, big ears, deep-set eyes, grey stubble. Navy work shirt with an oval name patch, ring of keys, a pipe. |
| **Nate Fortier** | 23 | Long brown hair, goatee, knit beanie, one silver earring; open flannel over a band tee. |
| **Dot Carrier** | 64 | Teased hair dyed red; cat-eye glasses on a chain; pink diner uniform with white apron; pencil behind ear. |
| **Constance Ashgrove** | 48 | Honey-blonde chignon, pearls, red lipstick, camel coat; a brass lantern pin. Sloane in 34 years. |
| **Brett Lindqvist** | 17 | Square jaw, swept sandy hair, easy smile; maroon-and-cream Derry High letterman jacket. |
| **Principal Fenwick** | 50s | Bow tie, walrus mustache, balding grey; brass lantern pin. |
| **Mrs. Fennimore** (librarian) | 60s | Steel-grey bob, half-moon glasses, teal cardigan; brass lantern pin. |
| **Hannah Gagnon** | 8 | Light-brown pigtails, pink sweatshirt, gap-toothed; says what grown-ups won't. |
| **June Brennan** | 14 (always) | Dark bob with blunt bangs, yellow knit sweater gone greyish, a cassette-recorder strap. Gus's smile. `june_ghost` uses the `skin_ghost` ramp and desaturated, cold colors. |

## UI

The interface is pixel art too, drawn with the same kit: frames, buttons,
nameplates and icons are 9-slice pixel panels upscaled crisply, set in a pixel
font. It should feel hand-crafted, like a 1991 object: a cassette J-card, a
composition notebook, a Polaroid.

---

## API reference

### Backgrounds and CGs (`PX.bg`, `PX.cg`)

```js
PX.bg('larch_ext', {
  times: ['day', 'dusk', 'night', 'quiet'],   // first is the default
  preset: { lanterns: 'night' },               // optional: time → PX.TIME preset
  light:  { quiet: 'quiet' },                  // optional: time → sprite tint
  variants: ['wall'],                          // optional
  draw(s, o) { /* o.time, o.variant, o.rng, o.night */ }
});
```

`s` is a 320×180 `PX.Surf`. Methods (coordinates in pixels; `c` is a color
code such as `P.brick[3]`, or `PX.E(code)` for emissive):

- pixels and shapes: `px rect hline vline line path poly ellipse circle ring fill`
- gradients and dithering: `vgrad(x,y,w,h,[codes],seam) hgrad dither(x,y,w,h,c,level) ditherPoly`
- regions: `clip(region, fn)`, `clipTo(codes, fn)`, `recolor(map, region)`,
  `shift(region, d, {dither})` (darken or lighten by shades), `stamp(src, x, y)`
- shading helpers: `shape(poly, ramp, {base, band, light, outline})`,
  `outline()`, `edge(codes, code)`
- textures: `bricks(x,y,w,h,ramp,{bw,bh,mortar})`, `clapboard(x,y,w,h,ramp,{board})`,
  `planks(x,y,w,h,ramp,{pw,horiz})`, `shingles`, `stones`,
  `grass(x,y,w,h,ramp,{density})`, `noise(x,y,w,h,[codes],density)`,
  `foliage(cx,cy,rx,ry,ramp|[ramps],{clusters,blob})`, `pine(x,base,h,ramp)`,
  `cloud(cx,cy,w,h,{emit,ramp})`, `stars(x,y,w,h,n)`,
  `window(x,y,w,h,{frame,lit,glass,mull,curtain,light,sill})`
- light: `light(ch, cx, cy, rx, ry, amount)`, `lightPoly(ch, poly, amount, {fade})`
- rooms: `PX.room(bx0, by0, bx1, by1)` returns `back floor ceil left right`
  polygons plus `leftAt rightAt floorAt` helpers for one-point perspective.

### Characters (`PX.person`)

```js
PX.person('teddy', {
  name: 'teddy',
  skin: 'skin_brown', hair: 'hair_dark', eyes: 'eye_brown', lips: 'lip',
  lashes: true, freckles: false, rosy: 0, lines: 0, stubble: false, nose: 'small'|'long',
  brow: 'hair_dark', browThick: 2,
  head: { l, r, top, eyeY, chinY, chinX, jaw, cheek, nearEye:[x,w], farEye:[x,w],
          browY, noseX, noseY, mouthX, mouthY, ear:[x,y], neck },   // any subset
  faceBumps: [[x, y, sx, sy, amp], ...],   // extra form on the face (age, cheeks)
  back(B, c)    { /* hair behind the head */ },
  body(B, c)    { /* arms, torso, clothes (the rig adds the neck after this) */ },
  collar(B, c)  { /* collars, scarves, anything over the neck */ },
  front(B, c)   { /* crown, bangs, locks over the face */ },
  extras(B, c)  { /* glasses frames, hats, etc. as forms */ },
  details(s, c) { /* pixel details after shading: prints, buttons, pins, plaid */ },
  decal(s, o)   { /* text/logos drawn after mirroring */ },
  portraitBox: [x, y, w, h]                   // dialogue-box crop, default [20,6,76,76]
});
```

`c` carries `h` (head geometry), ramps `sk hr ir`, the expression `ex`, and
`B`. The Builder `B`:

- `B.shape(poly, ramp, {kind, round, bumps, z, clip, name, tone, outline, line})`
  inflates a polygon (`round` = edge radius in px).
- `B.ellipse(cx, cy, rx, ry, ramp, o)`, `B.tube(spine, radii, ramp, o)`,
  `B.lock(spine, width, ramp, o)` (hair: tapers, glossy).
- `B.crease(partId, pts, depth, width)` presses folds. `B.bump(partId, x, y, sx, sy, amp)`.
- `B.shadow(casters, receivers, dx, dy, amt)`. Parts are matched by `name`
  (`'hair'` matches `'hair:anything'`). The rig already casts hair → face,
  face → neck, and head → body/collar.
- `kind`: `skin | hair | cloth | soft | metal` (tone thresholds). `tone: ±1`
  shifts a part darker or lighter (the far arm, back hair). Name parts
  `hair:*`, `body:*`, `collar:*` so the shadows find them.
- `RIG.over(s, x, y, ramp, delta)` paints with another ramp at the shade
  already there (prints, plaid, patterns that follow the lighting).

### Review

```
node tools/pxshoot.mjs char teddy:all                 # all expressions + blinks
node tools/pxshoot.mjs bg larch_ext:all --scale 3
node tools/pxshoot.mjs scene larch_ext:dusk gus:smile:left mom:neutral:right
node tools/pxshoot.mjs palette
```

Review at 3–5×, at 1× (the whole frame, squinting), and in a scene composite
with sprites at the stage positions. Iterate: draft → render → critique →
revise, at least three rounds per asset. Budgets: a background renders in
under ~80 ms, a sprite in under ~40 ms.
