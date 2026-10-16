# Catalog: `phone` package

Package folder: `src/content/phone/` (order 60). It has two parts:

1. **The player's phone**, `ctx.game.phone`. This is a 2008 candybar phone, the fictional «NOVA 1120», drawn as a DOM/canvas overlay in the lower right of the screen.
2. **The texts library and its helpers.** About 220 authentic Russian texts with English translations, plus helpers that turn them into readable notices, posters, graffiti, price tags and plates in the world.

Files:

| file | what |
|---|---|
| `index.js` | Package entry. `build` puts the library in the registry. `init` creates the phone. Test hooks. |
| `Phone.js` | The phone: screens, input, SMS schedule, calls, signal and battery. |
| `body.js` | Canvas drawing of the physical phone and the keypad backlight. |
| `lcd.js` | The 96×68 1-bit LCD framebuffer, drawing primitives, and an LCD-looking presenter. |
| `font.js` | Hand-made bitmap font (Latin, Cyrillic, digits, punctuation) and small icons. |
| `snake.js` | «Змейка» (Snake). |
| `sounds.js` | Synthesized phone sounds, monophonic ringtones and a crude formant voice. |
| `texts.js` | The text library: `NOTICES, ADS, GRAFFITI, SHOP, METRO, STREET, SMS`. |
| `draw.js` | Canvas renderers for every `look` (paper, poster, spray paint, plates…). |
| `api.js` | **Public helpers**: `addNotice`, `addPoster`, `addGraffiti`, `addPriceTag`, `addPlate`, `addText`, `addNoticeCluster`, … |
| `testScene.js` | Development wall, built only with `?phonetest=1`. |

---

## 1. The phone (`ctx.game.phone`)

**Game contract** (Game.js drives these calls):

- Q/Tab → `toggle()`.
- While the phone is open, Game calls `handleInput(input, dt)` every frame, and `update(dt)` always.
- Game reads `phone.open`.
- Game calls `close()` on Escape. Inside a sub-screen, Escape steps back one screen. At the top level it closes the phone. `close({force:true})` always closes.

**Controls while open:**

| key | action |
|---|---|
| arrows / WASD | navigate |
| E / Enter / Space | select |
| Backspace | back (closes the phone at standby) |
| Q / Tab | put the phone away |
| F | flashlight |
| 0–9 | number keys, for dialling from standby |
| `*` and `#` | Shift+8 and Shift+3, or the numpad keys |

- Arrows auto-repeat in lists.
- Every key press plays `phone_key` and flashes that key on the drawn keypad.
- While the phone is open, the player cannot walk, but can still look around with the mouse.
- Physics keeps running while the phone is open: lifts, escalators, metro cars and seats all still work. The phone does this by calling `player.update` with movement keys filtered out.

**Screens:**

- **Standby:**
  - operator «МегаЛинк» («Нет сети» when there is no signal)
  - signal bars, which weaken indoors, in stairwells, in the underpass, and drop to 0 in the metro and lifts
  - battery, which drains 3 → 2 → 1 bar over an hour; a "battery low" beep plays once and the phone never dies
  - big clock from `atmos.clock`
  - «Пн 14.01.2008», which never changes
  - an envelope icon for unread messages, a missed-call icon, and a bulb icon when the flashlight is on
- **Menu**: one item per screen with a big icon: Сообщения, Контакты, Журнал, Игры, Фонарик, Настройки.
- **Messages**:
  - Inbox: Mum's «Ты где? Купи хлеба.» (unread at start), «Баланс: 12.40 р.», work, a translit text from Серёга, the classic 2008 scam text, and an old New-Year message from an unknown number.
  - New message: contact → template → send. Without signal it shows «Сообщение не отправлено».
  - Sent.
  - Each message has Reply / Call back options.
- **Contacts**: Мама, Серёга, Работа, ???. Each has Call, Send SMS and its number.
- **Calls always fail**: «Вызов...», then `phone_ring_out` (two Russian ringback tones), then `phone_unavailable`, then «Вызов завершён». During `phone_unavailable` the LCD shows «Абонент недоступен или находится вне зоны действия сети».
- **Журнал**: missed, received and dialled calls. Mum called at 15:47 and 15:58. Selecting an entry calls back.
- **Dialling**: type digits at standby, then E to call. `*100#` checks the balance: «Баланс: 12.40 р.».
- **Игры → Змейка**: Snake. Arrows steer, E pauses, Backspace quits. The high score is saved in `localStorage['liminal-moscow-snake-best']`, guarded with try/catch.
- **Фонарик**: calls `game.toggleFlashlight()`. The F key also works while the phone is open.
- **Настройки**:
  - ringtones: six original monophonic tunes; highlighting one previews it
  - contrast 1–7
  - key tones on/off
  - date and time («Установлено сетью»)
  - about
  - The settings are saved in `localStorage['liminal-moscow-phone']`, guarded with try/catch.

**Look and behaviour of the phone itself:**

- A worn graphite body with a silver navigation ring, a rubber keypad with Latin and Cyrillic letters, and a green keypad backlight.
- A dark knitted winter glove holds it: fingertips wrap the left edge and the thumb rests along the right.
- The LCD has STN pixel shadows and a green backlight.
- The backlight dims after 10 s without a key press.
- The phone sways gently with breathing, lags slightly behind head turns, and slides up and down when taken out or put away.
- The plastic darkens at night; the backlight halo then shows more.
- English translations appear to the left of the phone and never on the LCD. They follow `ui.translations`.
- A short controls hint shows for the first few key presses.

**Rare texts.** At most 3 per session, at least 3 minutes apart, all ordinary:

| trigger | sender | text |
|---|---|---|
| after 20 min of play | Mum | «Ты скоро? Не забудь хлеб.» |
| after 34 min | operator | the «Любимый номер» promo |
| after 48 min | Серёга | translit cinema invite |
| back above ground after more than 40 s without signal (metro) | operator | «Вам звонили: +79164821730, 2 раз(а)…»; Mum's two missed calls are also added to the log |

- Each arrival plays `phone_gsm` (the GSM speaker chatter), then about 1.5 s later `phone_vibrate` and `phone_sms`, muffled if the phone is in the pocket.
- The first arrival in a session also shows one quiet `ui.say` caption.

**Public methods:**

| method | does |
|---|---|
| `toggle()` | open or put away |
| `show(screen?)` | open, optionally on a screen |
| `close({force})` | close (see the Escape rule above) |
| `handleInput(input, dt)` | per-frame input while open (called by Game) |
| `update(dt)` | per-frame update (called by Game) |
| `receive({from, fromEn, ru, en, contact?})` | deliver an SMS. It counts toward the 3-per-session cap, so use it sparingly and only for ordinary texts. |
| `addMissed({who, en, time, contact?})` | add a missed call to the log |
| `trigger('mum'\|'promo'\|'friend'\|'underground')` | fire a scheduled text early |
| `goto(name)` | open a screen; used by the development hooks |

- Properties: `open`, `signal` (0–4), `battery` (1–3), `inbox`, `log`, `settings`.

**Events** (`ctx.events`):

- `'phone'` with `{action: 'open' | 'close' | 'sms' | 'call', msg?, who?}`. The anomaly director may use 'open' as the moment the player is looking down at the phone and away from the world.
- `'read'` with `{item, x, y, z}` when a library text is read in the world.

**Registry:**

- `registry.phone` is the phone.
- `registry.texts` is `{NOTICES, ADS, GRAFFITI, SHOP, METRO, STREET, SMS}`.
- `registry.allTexts` is the flat array of all texts.
- `registry.notices` lists every text placed through the helpers: `{item, sign, interaction, w, h, x, y, z, angle, kind}`.
- Optional input: none needed.

**Development hooks:**

- `?phone=open` opens the phone at init.
- Instead of `open`, you can pass one of these screen names: `menu`, `inbox`, `msg`, `contacts`, `call`, `unavailable`, `log`, `games`, `snake`, `settings`, `ringtones`, `contrast`, `dial`, `sms`.
- `?phonetest=1` builds the test wall north of the spawn stop, at x 236–260, z 505. View it from `--at 244.2,507.2,0` and `--at 249.2,508.5,0`.

**Sounds.** The package calls these names. If the `audio` package has not registered a name, the phone registers its own synthesized version.

| sound | what it is |
|---|---|
| `phone_key` | keypad click and tone; opts `{tone:false, freq}` |
| `phone_sms` | three short beeps; opts `{muffled}` |
| `phone_vibrate` | 165 Hz rattle, two pulses; opts `{muffled, pulses}` |
| `phone_gsm` | 217 Hz GSM interference bursts, 1.4 s |
| `phone_ring_out` | connection hiss and two 425 Hz ringback tones, 6.1 s |
| `phone_unavailable` | SIT tones 950/1400/1800 Hz, then a formant-synth female voice saying «Абонент недоступен, или находится вне зоны действия сети», about 6 s |
| `phone_ringtone` | monophonic pulse-wave tune; opts `{tune: index or 'bpm\|note:dur …' string, repeat, muffled}` |
| `phone_beep` | generic beeps; opts `{freq, dur}` or `{seq: [[hz, s], …]}` |
| `phone_pocket` | fabric rustle when the phone is taken out or put away |
| `click` | from Game's `toggleFlashlight` |
| `paper` | from `ui.showNote` |

All phone sounds play on the `ui` bus, non-spatially.

---

## 2. Texts library (`src/content/phone/texts.js`)

There are 220 items. Each item has this shape: `{ id, kind, ru, en, style, look, … }`.

- `kind`: `'notice' | 'ad' | 'graffiti' | 'shop' | 'metro' | 'street' | 'sms'`
- `style`: the `ui.showNote` style used when the text is read: `'notice' | 'hand' | 'paper' | 'sign' | 'ticket' | 'screen'`
- `look`: how the text is drawn in the world. Can be overridden per placement.
- Optional fields:
  - `title`, `footer`, `addendum` (a reply written underneath in another pen)
  - `sub` (sub-category)
  - `tear` (text on tear-off strips)
  - `paper`, `ink`
  - `photo` (lost pets)
  - `layout`, `colors`, `brand` (posters)
  - `color`, `heart`, `anarchy`, `small` (graffiti)
  - `price`, `unit`, `promo` (price tags)
  - `list`, `sub2` (metro boxes)

| array | n | `sub` values | `look` values |
|---|---|---|---|
| `NOTICES` | 44 | `official`, `residents`, `plea`, `tearoff`, `lost` | `printed`, `handwritten`, `tearoff` |
| `ADS` | 31 | — (`layout`: operator, credit, english, internet, pizza, windows, concert, repair, realestate, shop, beer, civic, flyer) | `poster`, `flyer` |
| `GRAFFITI` | 31 | — | `spray`, `marker`, `scratch`, `stencil`, `tag`, `chalk`, `dust` (finger in the dirt on a car) |
| `SHOP` | 41 | `price`, `label`, `hours`, `card`, `door`, `plate` | `pricetag`, `label`, `hours`, `handcard`, `sticker`, `plate`, `poster` |
| `METRO` | 20 | — | `lightbox`, `plate`, `sticker`, `rules` |
| `STREET` | 26 | — | `plate`, `house`, `stop`, `painted`, `danger`, `hydrant`, `shopsign`, `rules` |
| `SMS` | 27 | — | `sms` (from, ru, en) |

Some useful ids:

- **Notices**:
  - official: `notice_heating`, `notice_meeting`, `notice_lift`, `notice_door`, `notice_vigilance`, `notice_roofsnow`, `notice_snowclearing`, `notice_debtors`, `notice_intercom`, `notice_phones`, `notice_trees`, `notice_windows`
  - handwritten and personal: `notice_sledge`, `notice_mitten`, `notice_lena`, `notice_light5`, `notice_flooding`
  - tear-offs: `notice_garage`, `notice_rent`, `notice_tutor`, `notice_computer`, `notice_kittens`
  - lost and found: `notice_lostdog`, `notice_lostcat`, `notice_lostkey`
- **Ads**: `ad_mobitel`, `ad_luch`, `ad_megasvyaz`, `ad_megalink`, `ad_credit`, `ad_english`, `ad_internet`, `ad_pizza`, `ad_windows`, `ad_concert`, `ad_disco80` (an old, faded poster), `ad_repair`, `ad_realestate`, `ad_beer` (carries the legal warning), `ad_family` («2008 — ГОД СЕМЬИ»), `ad_newyear`, `ad_furs`, plus the flyers `ad_ceilings`, `ad_hair`, `ad_locks`.
- **Graffiti**: `gr_tsoi`, `gr_spartak`, `gr_koni`, `gr_lenasasha` (heart), `gr_vasya`, `gr_dasha`, `gr_emo`, `gr_kish`, `gr_anarchy`, `gr_locks_stencil`, `gr_tag_dems`, `gr_tag_zubr`, `gr_washme` (dust, for car bodies), `gr_masha` (chalk).
- **Shop**:
  - price tags: `price_borodinsky`, `price_baton`, `price_milk`, `price_doktorskaya`, `price_mandarins`, …, `price_promo`, `price_newprice`
  - labels: `label_bread`, `label_milk`, `label_grocery`, `label_deli`, `label_wine`, `label_veg`
  - hours: `shop_hours`, `shop_lunch`
  - cards: `shop_base` («Ушла на базу»), `shop_break15`, `shop_nochange`, `shop_tray`
  - door stickers: `shop_push`, `shop_pull`
- **Metro**: `metro_exit`, `metro_trains`, `metro_centre` (direction board with a station list), `metro_kassa`, `metro_police`, `metro_nopass`, `metro_firstcar`, `metro_nolean`, `metro_seats`, `metro_rules`, `metro_fares`, `metro_hours`.
- **Street**:
  - name plates: `street_prospekt`, `street_berezovaya`, `street_zavodskaya`, `street_molodezhny`
  - house plate: `street_house12k2`
  - entrance plate: `street_entrance3`
  - bus stop sign: `street_stop`
  - trolleybus timetable: `street_timetable`
  - warnings: `street_icicles`, `street_danger` («Не влезай — убьёт!»), `street_hydrant`
  - shop signs: `street_pharmacy`, `street_24h`, `street_pawn`
  - buildings: `street_school`, `street_kindergarten`, `street_boiler`, `street_garages`

**Lookup functions:**

- `getText(id)`
- `textsOf(kind, {sub, look, exclude})`
- `pickText(kind, seed, filter)`: deterministic for any number seed.

---

## 3. Helpers (`src/content/phone/api.js`)

```js
import { addNotice, addPoster, addGraffiti, addPriceTag, addPlate, addText, addNoticeCluster,
  addReadable, noteFor, pickText, getText, textsOf } from '../phone/api.js'
```

**Common rules:**

- **Timing.** Call the helpers in `build(ctx)`. Signs are built after all packages' `build`.
- **Position.** `(x, y, z)` is the centre of the item **on the wall surface**. The helper pushes it 1 cm out along the facing normal (`offset`).
- **Angle.** `angle` follows `signs.add`. 0 faces south (+z), π/2 faces east (+x), π faces north, −π/2 faces west. So for a wall whose outward normal is +z, use `angle: 0`.
- **Choosing the text.** Pass an item object, an `id`, or `kind` (+ `sub`). In the last case the text is picked deterministically by `seed`. Without `seed`, a seed is derived from the position.
- **Size.** If you give only `w` or only `h`, the other is derived from the look's natural aspect ratio. For graffiti, `h` is the letter height and the width follows the text.
  - A4 notice 0.21 × 0.297 m
  - notebook sheet 0.165 × 0.205 m
  - poster 0.6 × 0.84 m
  - flyer 0.21 × 0.297 m
  - price tag 0.075 × 0.05 m
  - spray graffiti 0.5 m tall
  - marker graffiti 0.14 m tall
  - metro light box 2.2 × 0.42 m
  - street plate 0.9 × 0.24 m
- **Readable.** Every item is readable by default:
  - prompt «Читать» / Read («Рассмотреть» / Look closer for graffiti), reach 2.3 m
  - the interaction is tagged `'readable'`
  - E opens `ui.showNote({title, ru, en, style, footer})`
  - pass `readable: false` for decoration only
- **Return value.** Every helper returns `{ item, sign, interaction, w, h, x, y, z, angle, kind }` and pushes it to `registry.notices`.

**`addNotice(ctx, o)`** — a paper notice.

- Looks: `printed`, `handwritten` (ballpoint on a grid notebook sheet) or `tearoff`.
- Tear-off notices have strips with the phone number written sideways. Some strips are torn off, by seed.
- Tape sits at the corners. Lost-pet notices have a photocopied photo.
- Paper colours: white, yellow, blue, pink, notebook, newsprint.
- Ageing comes from `aged` (default 0.35).
- `tornTabs: 'allButOne'` leaves one strip on the «Пропала собака» notice, which is the classic tiny anomaly.
- Other options: `paper`, `ink`, `tape: false`, `flat: true` (no tilt).

```js
// two notices on an entrance door facing south (door surface at z = 410.62)
addNotice(ctx, { x: 233.4, y: 1.55, z: 410.62, angle: 0, id: 'notice_heating' })
addNotice(ctx, { x: 233.8, y: 1.45, z: 410.62, angle: 0, kind: 'notice', sub: 'tearoff', seed: 33 })
```

**`addPoster(ctx, o)`** — a colour-printed ad.

- It has a brand line, a big headline, an illustration per `layout` and small print.
- It is faded by the weather (`fade`, default 0.3) and wrinkled from pasting.
- Flyers (`look: 'flyer'`) are black-and-white photocopies with tear-off strips.

```js
addPoster(ctx, { x: 412, y: 1.7, z: 557.02, angle: 0, kind: 'ad', seed: 5 })   // random ad, 0.6×0.84 m
addPoster(ctx, { x: 412, y: 2.5, z: 557.02, id: 'ad_megalink', w: 1.2, h: 1.68, emissive: 0.4, schedule: 'street' }) // lit light box at a stop
```

**`addGraffiti(ctx, o)`** — text on a wall in one of these looks:

- `spray`: paint with dithered overspray and drips
- `marker`: wobbly hand
- `scratch`: scratched into paint
- `stencil`
- `tag`: outlined italic with a swoosh
- `chalk`: dropout texture
- `dust`: a finger in the dirt

Options:

- `h`: letter-line height in metres. Without `h`, long phrases shrink to a maximum width: spray 2.6 m, stencil and tag 1.6 m, chalk 1.4 m, marker 0.9 m, dust 0.6 m, scratch 0.45 m. Hearts (`gr_lenasasha`, `gr_mishakatya`) are about 0.42 × 0.34 m.
- `color`: hex
- `look`: override the item's look

The canvas is transparent outside the paint.

```js
addGraffiti(ctx, { x: 300.01, y: 1.2, z: 380, angle: Math.PI / 2, id: 'gr_tsoi' })      // on a wall facing east
addGraffiti(ctx, { x: 160, y: 0.9, z: 420.01, kind: 'graffiti', seed: 7, h: 0.3 })
addGraffiti(ctx, { x: car.x, y: 1.05, z: car.z + 0.9, id: 'gr_washme', readable: false }) // on a dirty car
```

**`addPriceTag(ctx, o)`** — a 7.5 × 5 cm shop price tag. It shows the product, the price in «289-90» style, «Цена за 1 кг», a date and «Подпись ___». The promo tags are yellow with a red «АКЦИЯ» band. The reach is 1.6 m.

```js
for (let i = 0; i < 6; i++) addPriceTag(ctx, { x: 452 + i * 0.12, y: 1.05, z: 575.6, angle: 0, seed: 100 + i, indoor: true })
```

**`addPlate(ctx, o)`** — plates, labels and boxes. The default kind is `'street'`.

- Street name plates are blue and white.
- The house number box is white, with a big number.
- Bus stop signs carry a green «А».
- Warnings: «Не влезай — убьёт!» and «Осторожно! Сосульки!» painted by hand.
- Shop labels, hours plates, handwritten cardboard cards («Ушла на базу»), door stickers.
- Metro light boxes have a red «М» and arrows; pass `emissive` to light them.
- Rules boards (`look: 'rules'`).

```js
addPlate(ctx, { x: 226.5, y: 3.4, z: 410.6, id: 'street_house12k2' })
addPlate(ctx, { x: 385, y: 2.6, z: 512, id: 'metro_exit', kind: 'metro', emissive: 0.8, indoor: true }) // metro: pass indoor:true
addPlate(ctx, { x: 455, y: 1.3, z: 575.8, id: 'shop_base', indoor: true })
```

**`addText(ctx, o)`** — the general function behind all of the above.

Options:

- `x, y, z`, `angle`
- `w, h`, `scale`
- `item | id | kind + sub`, `seed`
- `look`
- `aged`, `fade`
- `readable`, `prompt`, `reach`, `tag`
- `indoor`, `emissive`, `schedule`, `double`
- `offset`, `ppm`
- `color`, `tornTabs`, `tape`, `paper`, `ink`, `flat`

**`addNoticeCluster(ctx, {x, y, z, angle, w, h, count = 3, seed, kinds: ['notice'], subs, include: [ids], exclude, aged, indoor})`**

- Several different notices pasted loosely, sometimes overlapping, over a `w × h` area.
- Use it for entrance doors (about 0.9 × 0.7 m), notice boards and lamp poles.
- `kinds: ['notice', 'ad']` mixes in flyers.

```js
addNoticeCluster(ctx, { x: 233.6, y: 1.5, z: 410.62, angle: 0, w: 0.8, h: 0.6, count: 3, seed: entranceSeed })
addNoticeCluster(ctx, { x: 245, y: 1.6, z: 512.2, w: 0.25, h: 1.0, count: 4, kinds: ['notice', 'ad'], subs: ['tearoff'], seed: 9 }) // lamp pole
```

**Lower-level helpers:**

- `addReadable(ctx, {x, y, z, angle, w, h, item | note, prompt, reach})`: makes any custom sign readable.
- `noteFor(item)`: returns the `showNote` payload for an item.
- The renderers, for your own `signs.add({draw})`:
  - `drawNotice(g, W, H, item, opts)`
  - `drawPoster`, `drawGraffiti`, `drawPriceTag`, `drawPlate`
  - `drawItem(g, W, H, item, {seed, look})`
  - `defaultSize(item, look)`
  - `graffitiAspect(item)`

---

## 4. Models

| model | size | pivot | front | note |
|---|---|---|---|---|
| `phone_test_wall` | 12 × 4 × 0.5 m | bottom centre | ±z (both faces) | **Test only.** Placed only with `?phonetest=1`. Do not use in layouts. |

---

## 5. Notes for layout agents

- **Entrance doors (подъезды).**
  - Put 1–4 items on or beside every entrance with `addNoticeCluster` and a different `seed` per entrance, so repetition reads as real life.
  - Good fixed picks: `notice_door`, `notice_vigilance`, `notice_phones`, `notice_intercom`, `notice_debtors`, `notice_lift` (the entrance with a broken lift), `notice_mitten`, and `notice_lostdog` with `tornTabs: 'allButOne'`.
  - For the doppelgänger courtyard (Block F): use the same ids as in Block D, but change one, or the seed, to create a tiny difference.
- **Stops and poles.** Use flyers (`kinds: ['notice','ad'], subs: ['tearoff']`), `street_stop` and `street_timetable`. For the poster box at the stop, use `addPoster` with `w: 1.2, h: 1.8, emissive: 0.4, schedule: 'street'`.
- **Shops.** In the shop interior, pass `indoor: true` to every helper.
  - Use `label_*` above the counters, `price_*` on the shelves, `shop_hours` on the door, and `shop_push` / `shop_pull` on the door glass.
  - Kiosks: `shop_kiosk`, `shop_shawarma`, `shop_coldbeer`, `shop_break15`.
- **Metro.** Pass `indoor: true` underground. Lit boxes need `emissive: 0.6–1.0`.
- **Graffiti.** Put it low on garage rows, the underpass, transformer boxes and the school fence. Spray graffiti is about 0.5 m tall, so keep `y` around 0.8–1.4 m. The `dust` look is for dirty car bodies and kiosk glass.
- **Performance.** Each item is one quad in the shared sign atlas, about 100–500 px. A few hundred items are fine. Keep posters under about 150, and avoid placing hundreds of large `w` items.
- **Readability.** Readable items need the player within about 2.3 m, and the interaction box sits just in front of the wall. If two readables overlap, the nearest wins.
