# What Derry Keeps — Art Direction

> Visual identity for Episode One and every episode after it. If a new asset
> doesn't look like it belongs on the same shelf as the rest, it's wrong, no
> matter how good it looks on its own.

## The identity in one line

**"Late light."** Derry in the slanting gold of an October afternoon and the
deep blue of a Maine night, drawn like a memory you're not sure is yours:
flat, quiet shapes; warm light that never quite reaches the corners; film grain
over everything.

Touchstones (for mood, never to copy): Edward Hopper's lonely interiors,
Gregory Crewdson's suburban dusk, Firewatch's layered flat landscapes,
Kentucky Route Zero's theatrical lighting, 1990s horror-paperback covers.

## Technique

- **Flat vector shapes, no outlines** on environments. Form comes from value
  contrast between flat fills, never from strokes. Strokes are allowed only for
  thin physical things: wires, branches, cords, chain-link, window mullions.
- **Two-tone shading.** Every solid object has a lit face and a shadow face.
  Key light comes from the upper left (exteriors: the sky; interiors: the main
  window or lamp). Shadow colors are the base color pulled toward the scene's
  shadow tint (cool blue by day, deep navy at night). Never pure black, never
  plain grey.
- **Atmospheric perspective.** Far layers are lower-contrast and pulled toward
  the sky color; near layers are darker and more saturated. Exteriors use 4–6
  depth layers.
- **Light is a shape.** Windows, lamps and streetlights cast (a) a soft radial
  glow (low-opacity radial gradient, `mix-blend-mode: screen` where it helps)
  and (b) hard-edged light shafts or floor pools (polygons at 8–20% opacity).
  A lit window is the warmest, brightest thing in a night scene.
- **Limited palette per scene:** 6–10 colors drawn from the master palette,
  shifted by time of day. If a color isn't doing a job, cut it.
- **Lived-in, not cluttered.** Props tell you who lives there (a crucifix, a
  church calendar from Holy Rosary, a Hummel figurine, fridge magnets), but the
  middle band of the frame — where characters stand — stays calm.
- **Composition for a visual novel.** Canvas is 1600×900. The bottom ~28% is
  usually covered by the dialogue box: keep focal details in the upper 72%.
  Character sprites stand at x≈400, 800 and 1200; keep those columns readable
  (no high-contrast clutter directly behind a head at y≈200–420).
- **Grain, vignette and color grade are applied globally by the engine.**
  Backgrounds should not add their own heavy grain or blur filters (they are
  slow on phones). A single subtle pattern texture on a big flat surface is fine.
- **Irregularity lives in nature.** Architecture is straight and plumb; trees,
  ridgelines, clouds, leaves, and fog get seeded randomness so they never look
  stamped. Use the seeded RNG in the kit so every render is identical.

## Master palette

| Token | Hex | Use |
|---|---|---|
| ink | `#141824` | deepest night shadow |
| navy | `#1f2a3d` | night sky, deep shadow |
| slate | `#3b4a63` | dusk shadow, distant hills at dusk |
| fog | `#8a9bb0` | daytime distance, fog |
| bone | `#ece3cf` | highlights, paper, clapboard in light |
| paper | `#d9ccb0` | aged paper, plaster |
| rust | `#b5532e` | autumn leaves, brick in light, accents |
| ember | `#e08a3c` | maples, sunset |
| mustard | `#d9a441` | birches in fall, school-bus yellow (desaturated) |
| pine | `#2f4a3a` | evergreens |
| moss | `#6b7a45` | grass, army jacket |
| birch | `#c9c2b0` | birch bark, concrete |
| brick | `#8c3b2e` | Derry High, downtown |
| bruise | `#5b4a6b` | dusk clouds, shadow accents |
| rose | `#c98a8a` | dusk glow, wallpaper |
| sodium | `#f2b45a` | streetlights |
| window | `#ffd38a` | lit windows, lamps |
| teal | `#2e8b8b` | 1991 accent (windbreakers, diner vinyl) |
| **lantern** | `#a6e08e` | **supernatural only.** Nothing ordinary is ever this green. |

The lantern green is the game's one bold color. It appears only when something
is wrong. Everything else stays in the autumn/ink range, so that when the green
shows up, the player feels it before they understand it.

## Time-of-day presets

| Preset | Sky (top → horizon) | Mood | Sprite tint (r,g,b multipliers) |
|---|---|---|---|
| `morning` | `#a9c3d6 → #f3e2c0` | pale, hopeful, cold air | 1.00, 0.98, 0.94 |
| `day` | `#b8c6cf → #e4e0d3` | overcast autumn, soft shadows | 0.97, 0.97, 0.97 |
| `afternoon` | `#c9a98a → #f0c07a` | golden, long shadows | 1.03, 0.94, 0.84 |
| `dusk` | `#2f3b5c → #8d5a7a → #e08a5a` | windows coming on, unease | 0.92, 0.80, 0.80 |
| `night` | `#0e1424 → #1f2a44` | blue dark, warm pools of light | 0.62, 0.68, 0.86 |
| `quiet` | `#07090f → #121826` | no warm light anywhere; lantern green is the only source | 0.50, 0.72, 0.58 |
| `rain` | `#59667a → #8995a3` | desaturated blue-grey, wet | 0.78, 0.82, 0.90 |
| `interior_lamp` | — | tungsten warmth, deep corners | 1.00, 0.90, 0.78 |
| `fluorescent` | — | flat, slightly green-white, institutional | 0.94, 0.98, 0.94 |

## Character portraits

- **Waist-up busts**, front-facing with slight asymmetry, on a 600×900 canvas.
  Head top ≈ y 120, chin ≈ y 410, shoulders ≈ y 500. Same head geometry family
  for everyone so the cast reads as one world; individuality comes from
  silhouette (hair + clothing), palette, face shape, and age details.
- **Stylized realism.** Realistic proportions, simplified features. Eyes are
  almond-shaped and medium-sized (never anime-large) with iris, pupil and one
  catchlight. Brows are bold shapes — they carry most of the emotion.
- **Cel shading with one shadow tone**, key light from upper left: shadow on
  the character's left side of the face (viewer's right), under the chin, under
  the fringe. No outlines except facial features and a few clothing fold lines
  drawn in the clothing's shadow color.
- **Expressions** (every major character): `neutral, smile, grin, laugh, sad,
  angry, surprised, afraid, worried, thinking, smirk, flat, blush, cry`.
  Characters blink.
- **Signature silhouettes** (must stay consistent in every scene):

| Character | Age | Silhouette & palette |
|---|---|---|
| **Gus** (Augusta Brennan) | 14 | Messy low ponytail, loose strands, side-swept fringe; freckles; grey-green eyes. Oversized olive army-surplus jacket (moss) over a faded maroon band tee; **orange foam headphones around her neck**. |
| **Claire** (Mom) | 44 | Dark curls streaked grey, pinned up with a claw clip, strands escaping; reading glasses pushed up on her head; tired eyes. Cornflower scrubs under a long grey cardigan. |
| **Mémère** (Yvette Thibodeau) | 72 | Small and hunched. White hair in a bun with wisps; small oval wire glasses; deep smile lines. Mauve cardigan **buttoned wrong**, lace collar, a small **brass lantern pin**. |
| **Teddy** (Theodora Okafor) | 14 | Dark brown skin; high round natural puff with a teal scrunchie; big round tortoiseshell glasses. Color-block windbreaker (purple / teal / pink), collar up; Saturn enamel pin. |
| **Cal** (Calvin Ashgrove) | 14 | Pale, long narrow face, dark circles. Straight black hair too long, falling over one eye; thin gold wire-rims. Oversized brown tweed jacket over a black tee; holds a black-and-white marbled composition notebook. |
| **Sloane** (Sloane Ashgrove) | 14 | Cal's twin. Honey-blonde sleek chin-length bob, black velvet headband, pearl studs, arched brows. Cream cable-knit cardigan over a white collared blouse. |
| **Wes** (Wesley Pike) | 15 | Buzz cut growing out; lean face; healing split lip; tired eyes. Too-big red-and-black buffalo-plaid flannel over a grey thermal; pencil behind his ear. |
| **Ms. Whitcomb** (Paige) | 23 | Voluminous auburn hair with curled late-'80s bangs; moon-and-star dangly earrings; big mustard cardigan over a floral dress. |
| **Mr. Teague** | 68 | Grey thinning crew cut, big ears, deep-set eyes, grey stubble. Navy work shirt with an oval name patch, ring of keys, a pipe. |
| **Nate Fortier** | 23 | Long brown hair, goatee, knit beanie, one silver earring; open flannel over a band tee. |
| **Dot Carrier** | 64 | Teased hair dyed red; cat-eye glasses on a chain; pink diner uniform with white apron; pencil behind ear. |
| **Constance Ashgrove** | 48 | Honey-blonde chignon, pearls, red lipstick, camel coat; a brass lantern pin. Sloane in 34 years. |
| **Brett Lindqvist** | 17 | Square jaw, swept hair, easy smile; maroon-and-gold Derry High letterman jacket. |
| **June Brennan** | 14 (always) | Shown faded, in tape-transcript art and finally in person: dark bob with blunt bangs, a yellow knit sweater, a cassette recorder on a strap. Her colors are slightly desaturated, as if from an old photo. |

## UI

The interface is made of 1991 objects: cassette J-cards, a composition notebook,
Polaroids, typewritten Lantern Society minutes, masking tape. Type pairs a
literary serif for reading (Literata) with a condensed sans for labels
(Barlow Condensed), a typewriter face for dates and documents (Special Elite),
and handwriting for June's tapes and Gus's notes (Covered By Your Grace, Kalam).
The title wordmark is set in IM Fell English SC.
