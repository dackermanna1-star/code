# LIMINAL MOSCOW: streets, transport and commerce in the outskirts, winter 2007-2009

*Reliability: items marked **[verified]** were checked against sources during this research. Everything else comes from period knowledge and should be read as a plausible typical value, not a measured one. Real brands are listed as references only. Use the parody names in the game.*

---

## 1. Roads, curbs, snow, slush

**Road widths in a typical spalny rayon:**
- **Arterial prospekt:** 6–8 lanes at 3.5 m each, so 21–28 m of carriageway. The median is 2–6 m wide and has a concrete barrier or a strip of snow-covered lawn.
- **District street:** 2–4 lanes, 7–14 m.
- **Internal microdistrict drive (проезд):** 5.5–6 m.
- **Courtyard lane:** 3.5–4.5 m, usually with cars parked half on the sidewalk.
- **Sidewalks:** 1.5–2.25 m in yards, 3–6 m along arterials, plus a 2–5 m lawn strip with birches and poplars between them and the road.

**Curbs:**
- **Road curb:** concrete БР 100.30.15, which is 1.0 m long, 0.30 m tall and 0.15 m wide. About 0.15 m shows above the road, which is less than one voxel, so model it as a 1-voxel step.
- **Garden curb:** БР 100.20.8.
- **Colours:** concrete `#A19D94`, granite `#8D8B86`.
- **Paint:** near crossings and stops, curbs are painted in alternating black and white stripes, one stone (1 m) each, in `#E6E2D6` and `#1E1E1E`. By winter the paint is worn about 50%. Yellow curb paint (`#D9B12A`) means no stopping.

**Snow windrow (снежный вал):** plows leave a continuous ridge against the curb.
- Triangular to trapezoid cross-section, 0.6–1.2 m tall and 1–2 m wide.
- Gaps are cut at crossings, stops and yard entrances.
- Older banks are layered: a fresh top over grey, with a black crust on the side facing the road.

**Snow colours (as seen under sodium light):**

| Surface | Hex |
|---|---|
| Fresh snow, under orange sodium light | `#E8C9A0` |
| Fresh snow, under bluish mercury light | `#C9D3DB` |
| Fresh snow, blue-hour ambient | `#9FB0C8` |
| Day-old snow | `#B8B0A2` |
| Bank, traffic side | `#6F665A` → `#4A443C` |
| Exhaust-soot crust | `#33302B` |
| Brown reagent slush (каша) on the carriageway | `#6E5B45`, wet `#4F4336` |
| Wet asphalt, very reflective at night | `#242426` |
| Dry asphalt with white salt bloom | `#5E5E5C` with `#C9C7C0` streaks |
| Sand-salt (пескосоль) in yards | `#8C7A62` |
| Packed ice ruts in yards | `#A9A79F`, glossy |

**Reagent:** Moscow used liquid and solid calcium-chloride mixes (ХКФ and similar). The visible effects are:
- Slush 3–8 cm deep in the gutter between the windrow and the lane.
- White salt tidemarks on boots, trouser hems and car sills.
- Cars uniformly dirty grey-brown up to the windows, with clean arcs where the wipers reach.
- "ПОМОЙ МЕНЯ" ("wash me") finger-written in the dirt on rear doors.

**Sidewalk hazard zones:** red-white tape (`#D42020` / `#F0F0F0`) between wooden sawhorses, or tied to trees, with a sign: «Осторожно! Сосульки!» ("Caution! Icicles!") or «Опасная зона. Возможен сход снега с крыши» ("Danger zone. Snow may fall from the roof").

**Yards:** cars buried under 20–40 cm of snow, with only the mirrors and an antenna showing. A few surviving metal "ракушка" clam-shell garages and rows of metal garages (`#5C6B5E`, rusty `#7A4A2A`).

---

## 2. Snow-clearing machines

**КДМ (combined road machine) on a KamAZ-65115 or 53215, or on a MAZ-5337/5551; older units on ZiL-130/433362 as KO-713:**
- About 8.5 × 2.5 m. Cab height 3.0 m, and about 3.3 m to the roof beacons.
- Front plow blade 3.0–3.4 m wide and 1.0–1.2 m tall, angled 30°, painted orange with black diagonal hazard stripes.
- A second blade under the belly.
- Rear hopper of sand or reagent with a spinner disk underneath.
- Body orange `#F26B1D` (municipal orange; some cabs white `#E8E8E4`). Black grille. Two amber rotating beacons (`#FFA000`, about 1.5 Hz) on the cab roof.
- Door lettering in white or black, e.g. «ГУП «ДОРСЕРВИС» ВАО» (fictional; the real equivalent is ГУП «Автомобильные дороги»).

**How they work:**
- Columns of 4–6 trucks, staggered diagonally across the lanes (уступом), at 30–40 km/h, mostly between 23:00 and 06:00.
- **Snow loader КО-206 ("лапы"):** an orange low tractor whose two raking arms sweep the windrow onto an inclined conveyor feeding a KamAZ-55111 dump truck. Trucks take the snow to snow-melting stations.
- **Sidewalks:** MTZ-82 "Беларус" tractors (red cab `#B3262A` or blue) with a front blade and a rotary brush. Small orange skid loaders.

**Janitors (дворники):**
- Orange vests with reflective silver stripes, back text «ДЕЗ района …» (the 2008 municipal housing management, later called ГУ ИС).
- Tools: broad pushers (движок), steel scrapers (скребок), plywood shovels.
- Hours: 05:30–08:00. The scrape-scrape of ice under the windows is part of the soundscape.

**Audio recipe:**
- Diesel idle: 25–35 Hz fundamental plus harmonics, rising to about 60 Hz under load.
- Blade on asphalt: band-passed noise at 800–3000 Hz with random grit pulses.
- Hopper spinner: 6–10 Hz rattle.
- Reverse beeper: about 1 kHz, 0.5 s on and 0.5 s off.

---

## 3. Street lighting

**Lamp types:**
- **Sodium (ДНаТ, cobra-head ЖКУ-01/ЖКУ15):** 250 W gives about 27,000 lm, 400 W about 48,000 lm. Colour about 2000 K, emissive `#FFA64A`, cast light `#FF9A3C`.
- **Mercury (ДРЛ, older РКУ-01):** still common on side roads. About 4000 K with a greenish-blue cast, `#CFE6E8`.

**Housings:** grey cast aluminium, about 0.7 m long, with a frosted or clear bowl underneath. Fixed to a bracket arm 1.5–2.5 m long tilted 10–15° up.

**Poles:**

| Type | Height | Section | Colour | Spacing | Notes |
|---|---|---|---|---|---|
| Arterial, galvanized octagonal or conical steel | 10–12 m | 0.25 m at base, 0.1 m at top | `#8F9496` | 30–40 m | single or double arm; double-arm poles on the median |
| Arterial with lamps hung on cables | — | — | — | — | lamps over the road centre from cables between poles |
| Shared trolleybus/lighting pole | — | — | — | — | carries the wire span cable and the lamp arm together |
| Local street, concrete (СВ-95 / СВ-110) | 9.5–11 m | square, about 0.25 m at base tapering to 0.15 m (1 voxel to under 1) | `#9C9A92` | 25–35 m | rust streaks below the clamps; bare grey concrete |
| Yard | 6–8 m | — | — | — | or wall-mounted over entrances (bulb in a glass dome); 30–50% are dead |

- **Light levels:** carriageway about 10–20 lux, yards 1–5 lux with dark gaps between pools of light.
- **Start-up behaviour:** a sodium lamp first glows dim pink-magenta (`#C86A8A`) and reaches full orange over 3–5 min. Whole streets switch on together at dusk. End-of-life sodium lamps "cycle": on, warm-up, off, and repeat every few minutes. Ballast hum is faint, around 100 Hz.

---

## 4. Trolleybus overhead wire geometry

**Contact wires:**
- One pair per direction: + and −, 0.6 m apart.
- Height 5.8 m nominal (allowed range 5.5–6.3 m).
- The pair runs over the right-hand lane, about 3–4 m from the curb.

**Supports:**
- Steel span cables (поперечины) run across the road between poles on both sidewalks every 25–35 m, attached at about 7–7.5 m. Poles are 9–10 m tall and stand 0.5–0.8 m from the curb.
- Curves are polygonal, held by several pull-off cables (оттяжки) fanning out to extra poles.

**Special pieces:**
- Switches ("frogs", стрелки) with a small box on the span.
- Crossing pieces (пересечения) where lines cross.
- Section insulators about every 1 km.
- Wires are grooved copper, about 12 mm thick. Model them as a thin dark line, `#3A3530`.

**Vehicle trolley poles:** about 6 m long, mounted on the roof at about 3.4 m and raised at roughly 20–25°. Rope catchers (уловители) sit at the back of the roof.

**Winter:** blue-white arcing (`#BFE8FF`) at frogs and in freezing drizzle, a crackle, and a metallic "zing" travelling along the wire as a trolleybus approaches.

---

## 5. Public transport vehicles

**Trolleybus ZiU-682 (ZiU-682G / ZiU-682GM1), the backbone of the fleet:**
- About 11.6–11.8 m long, 2.5 m wide (about 2.97 m including mirrors), 3.35 m to the roof.
- 3 doors (2 on early units), 120 passengers nominal. **[verified: GM1 length 11.6 m, roof 3.355 m]**
- Also in service in 2007: VMZ-5298 and Trolza-5265 "Megapolis". **[verified]** Some Trolza-5275 "Optima" and a few ZiU-683 articulated units.

**Moscow trolleybus livery, adopted 2002 for repainted units [verified]:** blue lower body 83 cm high, then a 5 cm white stripe, a 5 cm blue stripe, white upper body and an ochre roof.
- Suggested values: blue `#2452A0`, white `#F0F0EA`, ochre `#C49A48`.
- Many units in 2008 also carry full-side advertising wraps.
- Fleet number painted in 4 digits, e.g. «3214».

**Buses:**
- **LiAZ-5256, high-floor:** 11.4 × 2.5 × 3.01 m, 3 doors. **[verified]** Main Moscow deliveries were the 5256.25 between 2000 and 2005. **[verified]**
- **LiAZ-6212, articulated:** about 18.0 × 2.5 × 3.0 m, 4 doors.
- **LiAZ-5292, low-floor:** about 12.0 × 2.5 × 2.9 m. These were arriving around 2006–2008, and from 2007 most of the fleet was domestic. **[verified]**
- **Mercedes O325:** in service 1994–2011. **[verified]**
- **Ikarus-280, articulated:** 16.5 × 2.5 × 3.16 m, 4 doors. Bright yellow, the "symbol of 1980s Moscow". **[verified]** By 2008 only a few faded units remained: yellow `#E8B21C` fading to `#C9A050`, with rust.
- **Bus livery:** not confirmed by sources. Suggested mix:
  - plain white `#EEEEE8` with thin coloured lengthwise stripes and blue «МОСГОРТРАНС» lettering;
  - older cream-yellow units;
  - many full-side advertising wraps.

**Plates on route transport:** yellow (`#F2C21B`) in the format «АВ 123 77».

**Fare system 2008:**
- Turnstiles with validators at the front door; you board at the front only.
- Stickers: «Вход через переднюю дверь» ("Enter by the front door"), «Выход через средние и задние двери» ("Exit by the middle and rear doors"), «Не прислоняться» ("Do not lean").
- Route board: printed plate behind the windshield, or an orange LED display on new LiAZ units, e.g. «648 Ст. м. «Кольцевая» — 9-й мкр.»

**Marshrutka (маршрутное такси), GAZelle GAZ-3221/322132:**
- About 5.5 × 2.1 × 2.2 m.
- White `#ECECE6` or yellow `#F2C21B`.
- Hand-lettered board on the windshield, e.g. «512м  М. «Рябиновая» — ул. Строителей — ДК».
- Fare 25–35 rub. Inside: «Остановка по требованию» ("Stops on request"). The fare is passed forward hand to hand.

**Vehicle audio:**
- **ZiU-682:** rheostat contactor clicks during acceleration, a traction-motor whine rising from about 200 to 1200 Hz with speed, an air compressor thumping at about 8–10 Hz while recharging, and a pneumatic door hiss followed by a clunk.
- **LiAZ:** V8 diesel idle at 22–28 Hz with a rough firing pattern.

---

## 6. Bus stops and the terminal loop

**Pavilion, Luzhkov-era modular type:**
- 4–6 m long, 1.5–1.8 m deep, 2.5–2.7 m high.
- Steel-tube frame (60–80 mm) in dark grey `#474A50` or dark blue `#2B3A55`.
- Polycarbonate or glass side and rear panels, scratched and with stickers. Flat roof with a slight slope, or an arched polycarbonate roof.
- Bench 0.45 m high, made of metal or painted wooden slats.
- An illuminated advertising light box (1.2 × 1.8 m, cool white `#F2F6FF`) at one end, and a concrete litter bin.
- Very typical: a stop combined with a kiosk (остановочно-торговый модуль), where the shelter is attached to a tobacco and drinks kiosk.

**Stop sign:**
- On a 3 m pole: official sign 5.16 (blue square, white field, black bus pictogram).
- Below it: the stop name plate, small route number plates, and a framed timetable.
- Nearby: a small Mosgortrans ticket kiosk, «Проездные билеты» ("Travel passes").

**Stop name plate text:** «ОСТАНОВКА «УЛИЦА СТРОИТЕЛЕЙ»» ("Stop: Builders' Street"). Marshrutka stops: «Остановка маршрутного такси».

**Timetable plate** (interval-based, no exact times):
```
АВТОБУС № 648
Ст. м. «Кольцевая» — 9-й микрорайон
ИНТЕРВАЛ ДВИЖЕНИЯ
Будни: 5.40–7.00 — 15 мин; 7.00–10.00 — 6–8 мин;
10.00–17.00 — 12 мин; 17.00–20.00 — 7 мин; 20.00–1.00 — 20 мин
Выходные дни: 15–20 мин
```
Translation: "Bus No. 648, Koltsevaya metro station to 9th microdistrict. Service interval: weekdays 5:40–7:00 every 15 min, 7:00–10:00 every 6–8 min, 10:00–17:00 every 12 min, 17:00–20:00 every 7 min, 20:00–1:00 every 20 min. Weekends every 15–20 min."

**Terminal loop (конечная, officially отстойно-разворотная площадка):**
- An asphalt area of about 50 × 70 m, with a loop road (outer radius at least 13 m) around an island of snow, birches and the dispatcher booth.
- A layover lane long enough for about 3 buses, with buses idling there, heaters running and exhaust steaming.
- **Dispatcher booth:** a prefab cabin of about 3 × 6 m, or a brick hut of about 4 × 8 m, painted white and blue. One lit window with a desk lamp and a kettle. Sign «ДИСПЕТЧЕРСКАЯ» ("Dispatcher's office").
- 1–2 blue portable toilets (`#2A5BA8`).
- Windshield placards: «В ПАРК» ("To depot") and «ПОСАДКИ НЕТ» ("No boarding").
- Trolleybus loop: the wire pair follows the loop, with a parallel passing pair.

---

## 7. Car mix, 2008 (spawn table for the outskirts)

| Model | Size L×W×H (m) | Share | Typical colours |
|---|---|---|---|
| VAZ-2104/2105/2106/2107 "classic" | 4.15×1.62×1.44 | 16% | white `#ECEBE4`, cherry «Вишня» `#5A1A24`, faded red `#8C2A22`, beige «Сафари» `#C2AE84`, dark blue `#23304F` |
| VAZ-2108/2109/21099 | 4.01–4.21×1.65×1.40 | 10% | «Мокрый асфальт» `#4C5054`, «Мурена» `#245A5B`, «Баклажан» `#3B2236` |
| VAZ-2113/2114/2115 | 4.12–4.33×1.65×1.40 | 9% | silver «Снежная королева» `#B4B7BA`, «Кварц» `#7E8285`, black |
| VAZ-2110/2111/2112, Priora | 4.27–4.35×1.68×1.42 | 10% | silver, «Мокрый асфальт», dark green `#1F3A30` |
| Niva 2121 / Chevrolet Niva | 3.74–4.05×1.68–1.79×1.64 | 4% | white, dark green, beige |
| Lada Kalina | 4.04×1.70×1.50 | 2% | red `#A42222`, silver |
| Moskvich-2141 / 412 | 4.35×1.69×1.40 | 3% | faded white, blue `#3A5A8A`, rust |
| GAZ-3110/31105 Volga | 4.88×1.80×1.48 | 4% | black `#141516`, white, silver; yellow taxi `#F2C21B` with checker band |
| GAZelle van/minibus | 5.5×2.1×2.2 | 6% | white, yellow |
| Daewoo Nexia, Matiz, Chevrolet Lanos | 4.48×1.66×1.39 (Nexia) | 7% | silver, dark green, dark red |
| Ford Focus II | 4.48×1.84×1.50 | 6% | silver, black, dark blue `#1E2A44` |
| Renault Logan | 4.25×1.74×1.53 | 3% | silver, beige |
| Hyundai Accent, Kia Spectra | 4.24×1.67×1.40 | 4% | silver, dark red |
| Toyota Corolla/Camry, Mitsubishi Lancer, Mazda 3, Nissan Almera | about 4.5–4.8×1.75×1.45 | 8% | silver, black |
| Old imports (VW Passat B3, Audi 80/100, Mercedes W124, BMW E34) | about 4.6–4.8×1.7–1.8×1.42 | 5% | black, dark green, maroon |
| SUVs (RAV4, Pajero, Land Cruiser) | about 4.4–4.9×1.8–1.9×1.7–1.9 | 3% | black, silver |

**Overall colour weights:** silver 25%, black 15%, «мокрый асфальт» grey 10%, white 8%, dark blue 8%, dark red/cherry 8%, dark green/teal 8%, others 18%.

**Service vehicles:**
- **Militsiya** (it was renamed "police" only in 2011): Ford Focus or VAZ-2114, white with a blue stripe, «МИЛИЦИЯ» or «ДПС» lettering, red/blue light bar.
- **Ambulance:** white GAZelle with a red stripe and «03».
- **Trucks:** ZiL-130 with a blue cab, UAZ-452 "буханка" (4.46 × 1.94 × 2.09 m).

**Car audio:**
- Carbureted 4-cylinder idle: about 27 Hz firing frequency at 800 rpm.
- Studded tyres on wet asphalt: a high-frequency hiss and crunch.
- Car alarms: a cycle of rising/falling siren (600–1200 Hz, about 0.5 s sweeps), then two-tone hi-lo, then rapid chirps. The 2-chirp lock beep is about 2.5 kHz.

---

## 8. License plates, 2008

**Civilian plate:**
- 520 × 112 mm. White `#F4F4EF` background, black `#111111` characters and border.
- Format «Х 123 ХХ», plus a region box on the right: «77» on top, «RUS» and the tricolour flag below (white, `#0039A6`, `#D52B1E`).
- Only 12 Cyrillic letters are used: А В Е К М Н О Р С Т У Х.
- Moscow region codes: 77, 97, 99, 177. Moscow Oblast: 50, 90, 150.
- Examples: «А 347 МН 77», «К 902 ЕС 99», «О 115 ТР 177», «В 640 АХ 50».

**Other plates:**
- Route transport and taxis: yellow, «АВ 123 77».
- Militsiya: blue background with white characters, «А 1234 77».

At 0.25 m voxels a plate is about 2 × 0.5 voxels, so apply it as a decal or texture.

---

## 9. Pedestrian underpasses

**Dimensions:**
- Corridor 4–6 m wide, 2.5–2.8 m clear height. Length is the road width plus about 10 m (about 40 m under a 6-lane prospekt).
- 2–4 stairways, each about 3 m wide. About 22–24 steps (0.15 m rise, 0.3 m tread) with a landing, giving a depth of about 3.5 m.
- Steel handrails, and twin metal channels on the stairs for prams.

**Finishes:**
- Walls: glazed 150×150 mm tiles in white `#E8E6DE`, pale blue `#B9D3DC`, pale green `#C5D8C0` or beige `#D9C9A8`, with patched areas in mismatched tiles.
- Floor: granite slabs `#7C6A64`, wet, with cardboard and rubber mats at the bottom of the stairs.
- Ceiling: stained plaster, or white aluminium strip panels in renovated underpasses.

**Lighting:**
- Fluorescent tube fixtures (2×36 W) every 3–4 m, 50–100 lux, cool greenish white `#E6F2E8`.
- 1 in 6 tubes is dead and 1 in 10 flickers.
- 100 Hz mains hum.

**Kiosks inside**, in glass-fronted rows set into the walls, each about 2–3 m wide. Signs:
- «ТАБАК» ("Tobacco")
- «ЦВЕТЫ» ("Flowers")
- «ЧУЛКИ • КОЛГОТКИ» ("Stockings, tights")
- «САЛОН СВЯЗИ • АКСЕССУАРЫ» ("Mobile phone shop, accessories")
- «CD • DVD • MP3», with a hand-written card: «10 фильмов на 1 диске — 100 р.» ("10 films on one disc, 100 rub")
- «ВЫПЕЧКА • КОФЕ» ("Pastries, coffee")
- «РЕМОНТ ЧАСОВ» ("Watch repair")
- «ИЗГОТОВЛЕНИЕ КЛЮЧЕЙ» ("Keys cut")
- «ФОТО НА ДОКУМЕНТЫ» ("ID photos")
- «ТЕАТРАЛЬНАЯ КАССА» ("Theatre tickets")
- «ОПТИКА» ("Optician")

**At street level:** canopies of green `#3E5A48` or grey frame with polycarbonate. Sign 5.17.2 (white stair pictogram on blue).

**Audio:** strong reverb (RT60 of about 1.2–1.8 s), footsteps on wet stone, a busker on accordion or guitar, kiosk radio pop, dripping water.

---

## 10. Kiosks and pavilions

**Ларёк (small kiosk):**
- About 3.0 × 2.4 m footprint, 2.7 m high, with a 0.5 m sign band above.
- Windows packed with cigarettes, chocolate bars, beer, chips, gum, lighters and cans of gin-tonic.
- A 0.35 × 0.35 m serving hatch at 1.1 m height, with a coin ledge.
- One fluorescent tube inside, and a red scrolling LED ticker (бегущая строка) in the window.
- Signs: «ПРОДУКТЫ 24 ЧАСА» ("Groceries 24 hours"), «ПИВО • ВОДЫ • СОКИ» ("Beer, waters, juices"), «ТАБАК».

**Newspaper kiosk:**
- About 2 × 2.5 m, white with a blue band. Fictional name «Мос-Пресса» (the real one is «Роспечать»).
- Glass from 0.9 to 2.1 m, with magazines clipped on wires and crossword booklets.
- Parody titles: «Аргументы и Новости» ("Arguments and News"), «Комсомольская истина» ("Komsomol Truth"), «Спорт-Курьер» ("Sport Courier"), «Теленеделя» ("TV Week").

**Shawarma kiosk:**
- Vertical spit and steam, with a hand-written menu:
  - «Шаурма в лаваше — 80 р.» ("Shawarma in lavash, 80 rub")
  - «Шаурма в пите — 70 р.» ("Shawarma in pita, 70 rub")
  - «Хот-дог — 35 р.» ("Hot dog, 35 rub")
  - «Чебурек — 25 р.» ("Chebureki pastry, 25 rub")
  - «Чай, кофе — 20 р.» ("Tea, coffee, 20 rub")
- Note: Moscow says «шаурма»; «шаверма» is the St Petersburg word.

**«ЦВЕТЫ 24 ЧАСА» ("Flowers 24 hours"):**
- Small glass pavilion with fogged glass and warm interior light (`#FFD9A0`), buckets of flowers.
- «Роза — 70 р.» ("Rose, 70 rub"), «Гвоздика — 35 р.» ("Carnation, 35 rub").

**Slot-machine hall** (very 2008; banned from July 2009):
- Fictional name «ГЕЙЗЕР» (parody of «Вулкан»), with a sign «ИГРОВЫЕ АВТОМАТЫ 24 ЧАСА» ("Slot machines 24 hours").
- Chasing bulb borders and a green/gold palette.

---

## 11. Terminals, payphones, vending machines, ATMs

**Payment terminal** (reference: QIWI/ОСМП, Элекснет; parody «МОМЕНТ-ПЛАТЁЖ»):
- Standalone cabinet about 0.5 × 0.5 × 1.7 m, or wall-mounted. 15" touchscreen, bill acceptor with a green-lit slot, receipt slot.
- Screen tiles: «Сотовая связь» ("Mobile"), «Интернет», «Коммерческое ТВ» ("Commercial TV"), «Погашение кредитов» ("Loan repayments"), «Коммунальные платежи» ("Utility bills").
- Stickers: «Сдачу не выдаёт» ("Gives no change"), «Комиссия 0%» ("0% commission"). Real commissions ran 0–10%.
- Audio: touch beep at 1 kHz, bill acceptor whirr, thermal printer buzz.

**Payphone** (reference: МГТС card phone):
- Grey metal body about 0.35 × 0.6 m, keypad at about 1.3 m height, under a small hood with «ТАКСОФОН» ("Payphone").
- Panel: «Экстренные службы 01, 02, 03 — бесплатно» ("Emergency services free").
- Takes a chip card, «Универсальная карта оплаты» ("Universal payment card").
- Tones for synthesis (Russia uses 425 Hz):
  - Dial tone: continuous.
  - Busy: 0.4 s on, 0.4 s off.
  - Ringback: 0.8 s on, 3.2 s off.

**Vending:**
- Coffee machines in underpasses and at metro exits, 20–25 rub per cup.
- A claw machine («хватайка») at shop entrances.
- Shoe-cover dispensers in clinics at 5 rub.
- Note: 10-rub coins did not exist until late 2009, so 2008 coins are 1, 2 and 5 rub plus kopecks.

**ATMs:**
- Through-wall face about 0.6 × 1.0 m, or a freestanding cabinet about 0.7 × 0.8 × 1.6 m in shops and underpasses.
- Sign «БАНКОМАТ • КРУГЛОСУТОЧНО» ("ATM, 24 hours").
- Parody banks: «Народный Сбербанк» (green, after Сбербанк), «СтолицаБанк» (red/blue).

**Currency exchange LED board, «ОБМЕН ВАЛЮТЫ» ("Currency exchange"), buy/sell rates:**

| Period | USD | EUR |
|---|---|---|
| Spring 2008 | 24.30 / 24.60 | 37.50 / 38.20 |
| December 2008 | 27.80 / 28.30 | 38.50 / 39.50 |
| February 2009 | 35.50 / 36.20 | 45.50 / 46.50 |

---

## 12. Billboards and posters

**Formats:**
- 3 × 6 m board on a single 5–8 m steel post, double-sided, lit by 2–4 floodlights.
- 5 × 15 m "supersite" along arterials.
- Banners on cables across the road.
- Huge ads on blank building end walls.
- Illuminated light boxes (1.2 × 1.8 m) at stops.

**Rules of the period:**
- Outdoor tobacco ads were banned from 2007, so there should be none.
- Beer ads must carry a warning on at least 10% of the area: «ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ ПИВА ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ» ("Excessive consumption of beer harms your health").

**Parody ad texts:**

| Parody | Real reference | Russian text | Translation |
|---|---|---|---|
| «МобиТел» (red egg) | МТС | «Звони своим — 0 руб./мин!*» | "Call your own network, 0 rub/min!" Tiny footnote |
| «Луч» (yellow/black stripes) | Билайн, «Живи на яркой стороне» | «Живи на светлой стороне» | "Live on the bright side" |
| «МегаСвязь» (green) | МегаФон, «Будущее зависит от тебя» | «Будущее зависит от нас» | "The future depends on us" |
| Credit | — | «КРЕДИТ ЗА 15 МИНУТ! Без справок и поручителей» | "Loan in 15 minutes! No paperwork, no guarantors" |
| Credit | — | «Деньги на всё. Ставка от 0%*» | "Money for everything. Rate from 0%" |
| Beer | «Кто пьёт Клинское?» | «Кто пьёт «Клёвское»?» | "Who drinks 'Klyovskoye'?" |
| Beer | — | «Здоровяк. Пиво для настоящих мужиков» | "Big Guy. Beer for real men" |
| Concert | «Дискотека 80-х» | «ДИСКОТЕКА ЭПОХИ 80-х. Олимпийский, 29 ноября» | "Disco of the 80s era. Olimpiysky, 29 November" |
| Concert | chanson | «Владимир Ветров. Новая программа «Дожди»» | "Vladimir Vetrov. New show 'Rains'" |
| Electronics | «Евросеть, Евросеть — цены просто офигеть» | «ЕвроСвязь — цены просто ого!» | "EuroSvyaz: prices simply wow!" |
| Real estate | — | «Квартиры в Подмосковье от 1,9 млн руб. Сдача IV кв. 2009» | "Apartments outside Moscow from 1.9M rub. Completion Q4 2009" |

**Civic posters (real, not trademarks):**
- «2008 — ГОД СЕМЬИ» ("2008, the Year of the Family"), with a chamomile logo.
- «2 марта — выборы Президента Российской Федерации» ("2 March: Russian presidential election"), for early 2008.
- «С Новым годом, москвичи!» ("Happy New Year, Muscovites!").
- From late 2008: «АНТИКРИЗИСНЫЕ ЦЕНЫ!» ("Anti-crisis prices!") in shop windows.

**Pole flyers with tear-off phone tabs:**
- «СДАМ 1-комн. кв. без посредников» ("1-room flat for rent, no agents")
- «Ремонт квартир под ключ» ("Turnkey flat renovation")
- «Компьютерная помощь на дому» ("Computer help at home")
- «Куплю волосы» ("Buying hair")
- «Вскрытие замков 24 ч» ("Locks opened 24 h")
- «Требуются: охранники, кассиры» ("Wanted: security guards, cashiers")

Use phone numbers in the period format «8 (495) …» or «8-916-…», fictionalized.

---

## 13. Shop signs and typography

- **Sign construction:** light boxes with an acrylic face and vinyl letters, typically red `#D42027` or blue `#1F4FA0` on white. Also vinyl banners with grommets, roof-mounted individual letters, and red LED scrolling tickers.
- **Fonts:** Futura-like Cyrillic «Futuris» (the dominant one), Arial Black, Times, and an old-Russian display face for «Русская кухня» ("Russian cuisine"). Text often horizontally stretched.
- **Common words:** «ПРОДУКТЫ» (groceries), «МИНИ-МАРКЕТ», «УНИВЕРСАМ» (supermarket), «ОВОЩИ-ФРУКТЫ» (fruit and veg), «ХОЗТОВАРЫ» (household goods), «АПТЕКА» (pharmacy, green cross; parody «Аптека 37,2» after «36,6»), «РЕМОНТ ОБУВИ» (shoe repair), «ПАРИКМАХЕРСКАЯ» (hairdresser), «КСЕРОКС» (photocopies), «ЛОМБАРД» (pawnshop), «ШИНОМОНТАЖ» (tyre fitting), «КАФЕ-БАР».
- **Building address plates (2008 style):** an illuminated box with a white background and black text, often unlit. The dark-blue city style came only in about 2013.
- **Hours plate:** «Режим работы: с 8.00 до 23.00, без перерыва и выходных» ("Open 8:00–23:00, no breaks or days off").
- **Door stickers:** «От себя» ("Push"), «К себе» ("Pull").

---

## 14. Grocery store interior

**Counter-service «Продукты» shop** (still common in the residential outskirts), about 8 × 12 m:
- L-shaped refrigerated glass display counters, 1.2 m tall.
- A saleswoman in an apron.
- Departments: «Гастрономия» (deli), «Бакалея» (dry goods), «Молочные продукты» (dairy), «Вино-водка» (wine and vodka).
- Shelves behind the counter with condensed milk, tinned stewed meat, sprats and vodka.
- Electronic scales with red LED digits, and a small cash register.
- A plastic money tray, with a sign «Деньги кладите на тарелочку» ("Put money on the tray").
- Spoken lines: «Мелочь посмотрите» ("Check if you have small change"), «Пакет нужен?» ("Need a bag?", 2–3 rub).

**Self-service universam** (parodies of Пятёрочка / Копейка / Дикси):
- Baskets, 3–6 checkouts, bag lockers marked «Камера хранения» ("Bag storage"), and a guard in black.
- Fixtures:
  - Upright glass-door drink coolers branded red or blue.
  - Ice-cream chest freezers with sliding lids.
  - Beige 300 mm floor tiles with muddy wet tracks and cardboard by the door.
  - 600 mm ceiling tiles with 4×18 W fluorescent panels.
  - A warm-air curtain droning over the door.

**Price tag ("ценник"):** a white tag about 60 × 40 mm:
```
Колбаса «Докторская» вар. в/с
Цена за 1 кг   289-90
Пр-во: Россия   12.12.08   Подпись ____
```
Translation: "Doktorskaya boiled sausage, top grade. Price per 1 kg 289-90. Made in Russia. 12.12.08. Signature."
- Prices use a hyphen before the kopecks: «289-90», «28 р.», «28 руб.»
- Promo tags are yellow or red: «АКЦИЯ» ("Promotion"), «НОВАЯ ЦЕНА!» ("New price!").
- Kiosks use hand-written cardboard cards in marker.

**Audio:** dot-matrix receipt printer screech (about 1 s), scale beep, coins on plastic, freezer compressor hum, 100 Hz fluorescent hum, the door curtain fan.

---

## 15. Prices in 2008 rubles (Moscow residential area)

**Fares:**
- Metro: 19 rub (17 in 2007, 22 in 2009). **[verified]**
- Bus, trolleybus or tram ticket from a kiosk: 17 rub; from the driver: 25 rub. In 2009: 20 and 25 rub. **[verified]**
- Marshrutka: 25–35 rub. Private-car "bombila" ride: 300–500 rub.

**Food and household:**

| Item | Price, rub |
|---|---|
| White loaf «Батон нарезной» | 18–22 |
| «Бородинский» rye bread | 20–25 |
| Milk, 1 L pack | 30–40 |
| Kefir, 1 L | 32–40 |
| Eggs, 10 | 35–50 |
| Butter, 200 g | 45–60 |
| «Докторская» sausage, 1 kg | 250–320 |
| Servelat, 1 kg | 350–450 |
| Pelmeni, 1 kg | 100–150 |
| Sugar, 1 kg | 28–35 |
| Buckwheat | 35–45 |
| Instant noodles | 12–20 |
| Tangerines, 1 kg | 50–70 |
| Chocolate, 100 g | 25–35 |
| Coca-Cola, 0.5 L | 25–30 |

**Beer, vodka, cigarettes:**

| Item | Price, rub |
|---|---|
| Domestic beer, 0.5 L bottle | 28–40 |
| Licensed foreign beer | 45–60 |
| Beer, 1.5 L plastic | 60–80 |
| Vodka, 0.5 L | 120–300 |
| «Прима»-type no-filter cigarettes | about 10 |
| «Ява»-type | 25–30 |
| Winston-type | 35–40 |
| Marlboro-type | 45–55 |
| Parliament-type | 60–75 |

**Other:**

| Item | Price, rub |
|---|---|
| Shawarma | 70–100 |
| Vending coffee | 20–25 |
| Newspaper | 10–20 |
| Rose | 50–100 |
| Petrol AI-92, per litre | about 20–22 |

**Income context:** average Moscow salary about 30,000 rub per month; pension 4,000–6,000.

---

These figures come from my own knowledge, checked against the sources below where marked **[verified]**. Fares, the trolleybus livery and the vehicle sizes are confirmed. Shop prices are typical ranges, because I could not find exact 2008 Moscow retail prices.

**Sources:**
- [Interfax: Metro 3 rubles more expensive (2008/2009 fares)](https://www.interfax.ru/russia/51275)
- [RG: transport fare rise 2008](https://rg.ru/2007/09/25/transport.html)
- [RG: Moscow 2008 tariffs](https://rg.ru/2007/12/26/moscow2008.html)
- [Wikipedia: Московский троллейбус (2002 livery)](https://ru.wikipedia.org/wiki/Московский_троллейбус)
- [Wikipedia: ЛиАЗ-5256](https://ru.wikipedia.org/wiki/ЛиАЗ-5256)
- [Wikipedia: Московский автобус](https://ru.wikipedia.org/wiki/Московский_автобус)
- [Cyclowiki: ЗиУ-682ГМ](https://www.cyclowiki.org/wiki/%D0%97%D0%B8%D0%A3-682%D0%93%D0%9C)
- [gw2ru: Ikarus-280 yellow, symbol of 1980s Moscow](https://www.gw2ru.com/history/2050-foreign-made-buses-in-ussr)
- [vm.ru: history of Moscow buses](https://vm.ru/moscow/1318818-skvoz-stoletiya-kak-izmenilis-stolichnye-avtobusy-s-nachala-ih-zapuska/amp)
- [dp.ru: 2008 inflation, bread +25.9%](https://www.dp.ru/a/2009/01/11/Peterburg_proigral_Moskve)
- [ComNews: OSMP/QIWI commissions](https://www.comnews.ru/content/19396/2009-04-28/osmp-nabiraet-oboroty)
- [NormaCS: lamp mounting heights](https://www.normacs.info/answers/3835)