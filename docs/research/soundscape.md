# LIMINAL MOSCOW: soundscape and daily-life digest (spalny rayon, winter evenings 2008)

## 0. Global mix rules

- **Snow acoustics.** Fresh powder absorbs strongly (α≈0.6–0.9 above 500 Hz). Courtyards then sound dry and "cotton-wool" quiet, with RT60 around 0.6–1.0 s. Packed snow, ice and slush reflect sound, so RT60 goes up to 1.5–2.5 s. Apply a global high-shelf of −6 dB above 3 kHz while fresh snow lies on the ground.
- **Courtyard slapback.** Parallel 9–17-storey slabs (27–50 m tall) usually stand 40–70 m apart. That gives a flutter echo delay of 2·d/343, roughly 0.23–0.41 s. Model it as 2–4 feedback taps at −8 dB per tap, lowpassed to 2.5 kHz.
- **Distance.** Use −6 dB per doubling of distance. Add a lowpass with cutoff fc ≈ 16000/(1+d/40) Hz (d in metres). Beyond 200 m almost nothing above 2 kHz survives.
- **Ambient bed.** Courtyard at night is about 38–45 dBA. Next to a prospekt it is 60–68 dBA.

| Source | Typical distance | Relative level (dBFS, master −12) |
|---|---|---|
| Own footsteps | 1.5 m | −18 |
| Wind bed | – | −30 … −20 in gusts |
| Distant traffic drone | 300 m+ | −34 |
| Trolleybus passing | 20 m | −16 |
| Car alarm | 60 m | −20 |
| Crows | 20–80 m | −24 |
| TV through wall | adjacent flat | −38 |
| Transformer hum (TP kiosk) | 5 m | −30 |

## 1. Wind, snow and nature

**Wind between blocks.** Moscow winter wind averages 3–4 m/s, with gusts of 10–15 m/s in the Venturi gaps between slabs.
- **Bed:** brown noise → lowpass 250–500 Hz (Q 0.7). Gain follows a gust LFO.
- **Gust LFO:** random target values every 6–20 s with 2–5 s glides. Add a sub-gust modulator of 0.3–1 Hz at ±3 dB.
- **Aeolian whistles.** The tone follows f ≈ 0.2·U/d:
  - wire, 5 mm: ~320 Hz at 8 m/s
  - antenna coax, 7 mm: ~230 Hz
  - balcony rail, 16 mm: ~100 Hz
  - Recipe: white noise → bandpass with Q 40–80. Tie the centre frequency to the gust value (f = k·U) so the pitch rises in gusts. Gate in only above 6 m/s.
- **Corner howl:** 2–3 bandpasses at 180, 410 and 620 Hz, Q 15, at −12 dB.
- **Blowing snow:** highpass 4 kHz noise at −36 dB, amplitude tied to the gust value cubed (U³).
- **Rattles:** loose roof tin or a balcony sheet. Use random impacts (bandpassed noise 300–1500 Hz, 15 ms) when the gust value is above 0.7. Add a flapping plastic bag on a tree at 8–14 Hz AM noise, 1–3 kHz.

**Snow falling off branches.** "Плюх": noise burst → lowpass 600 Hz, 20 ms attack and 200 ms decay. Then a powder trail of bandpass 2–6 kHz, 0.6–1.5 s. Add a branch spring-back rustle of 8–12 tiny 1 ms ticks.

**Hooded crow (серая ворона, *Corvus cornix*).** Its voice is a "хриплое карканье" (hoarse caw). It is the signature winter bird. At dusk (15:50–16:40 in Dec–Jan) flocks of hundreds stream overhead to their roosts.
- **Caw "каарр":** 0.3–0.6 s long. Sawtooth f0 ≈ 550 Hz, gliding 600→480 Hz. Add ±30 Hz random FM at 80–150 Hz rate for roughness, then a tanh waveshaper, then formant bandpasses at 1.2 and 2.3 kHz (Q 4).
- **Envelope:** 25 ms attack, sustain, 80 ms release.
- **Phrasing:** series of 2–6 caws, 0.5–0.9 s apart. Answering birds come from other roofs.
- **Wingbeats on take-off:** 4–6 lowpass 400 Hz thumps at 5 Hz.
- **Jackdaw (галка) "кья":** f0 1.0–1.4 kHz, 0.12 s, in flocks.
- **Magpie chatter:** noise bursts at 12 Hz for 0.6 s.
- **Daytime only:** great tit "зинь-зинь" (5–7 kHz), sparrows.

**Dogs barking far away.** Sources are strays at garage co-ops and chained guard dogs at construction sites or car parks.
- **Bark:** 80–180 ms. Sawtooth glide 500→350 Hz (big dogs 250→180 Hz) plus a noise onset of 10 ms. Formants at 600 and 1300 Hz.
- **Phrasing:** runs of 3–8 barks at 2–3 Hz, then 5–40 s of silence. Other dogs answer from another direction.
- **Occasional howl:** 1.5–3 s, sine 450→600→420 Hz with 5 Hz vibrato.
- **Treatment:** lowpass 1.2 kHz at 150 m+, plus the courtyard echo.

## 2. Footsteps (walk 1.8 Hz = 556 ms period, ±15 ms jitter, alternate L/R ±1.5 dB)

Each step is a heel strike followed by a toe-off 60–120 ms later at −6 dB. Use one precomputed white-noise buffer, a random offset per grain, and a BiquadFilter + Gain envelope.

| Surface | Recipe | Duration |
|---|---|---|
| **Fresh snow** (−2…−8 °C) | 30–60 grains (1–3 ms bandpass noise, centre 1.2–2.5 kHz). Grain density rises then falls. Add a compression thump of 90 Hz sine, 40 ms. | 220–300 ms |
| **Fresh snow, cold <−10 °C** | As above, plus a **squeak** ("скрип"): 2–4 resonant bandpass bursts at 1.5–3 kHz, Q 12, 30–60 ms each | 250 ms |
| **Packed snow / trodden path** | 15–25 grains with a brighter centre (2–3.5 kHz). Squeak is dominant, thump is small. | 120–160 ms |
| **Ice** | Hard click: 5 ms noise → bandpass 3 kHz, plus a 2 kHz ring decaying 30 ms. For slips, add 300–600 ms of bandpass 1–3 kHz scrape. A thin puddle crack is a broadband impulse plus 3–4 ringing filters at 3–6 kHz, 60 ms. | 40–80 ms |
| **Slush (каша, salted)** | Lowpass 1.5 kHz noise plus 3–6 "squelch" sine chirps falling 900→300 Hz, 20 ms each. Toe-off suction is a 60 ms bandpass 400 Hz noise swell. | 280–350 ms |
| **Concrete (stairwell)** | Rubber winter sole: thump 120 Hz, 35 ms, plus grit (sand and salt), which is 40 ms of highpass 3 kHz crackle. Stairwell RT60 is 2–3 s and very bright. Stair climbing runs at 2.2 Hz. | 60 ms + reverb |
| **Ceramic tiles (lobby, 150×150 mm brown/beige)** | Sharper: bandpass 2.5 kHz click, 15 ms decay. Grit is louder, and wet soles give a squeak (4 kHz, Q 20, 40 ms). | 50 ms |
| **Metal stairs / entrance grate mat** | Modal clang: partials 310, 742, 1290, 2110 Hz, decaying 0.3–0.8 s, plus a rattle of 3 rapid impacts. | 0.5 s |

At the door people stamp snow off their boots: 2–3 heavy stamps at 2.5 Hz, louder thumps around 80 Hz.

## 3. Traffic and transport

**Distant traffic on wet or salted roads.**
- **Drone:** brown noise → lowpass 300 Hz, plus pink noise → bandpass 900 Hz (Q 0.6). Slow AM at 0.05–0.2 Hz.
- **Wet surface:** add highpass 2 kHz noise at +6 dB relative to dry. This is the spray "шшш".
- **Pass-by at 50–100 m:** Gaussian envelope over 3–6 s. Tyre noise peaks at 800–1200 Hz.
- **Engine tone:** 4-cylinder firing frequency = rpm/30. A Lada at 2500 rpm gives 83 Hz.
- **Studded tyres (most cars in 2008):** add a granular crackle at 3–6 kHz. When slow on ice it becomes discrete clicks at about 15·v Hz (v in km/h).

**Ice crunch under tyres** (courtyard, 5–10 km/h). Low granular crunch: grains lowpassed at 500 Hz, 100–200 grains/s. Add random ice pops (impulse → bandpass 2–4 kHz) at 2–8/s and snow squeak at 1.8 kHz. A Lada stuck in a snowdrift adds wheelspin whine (sine 300→900 Hz with noise) plus engine revving.

**Trolleybus (ZiU-682 "ZiU-9" type, DC traction motor, rheostat-contactor control РКСУ).** These are approximate values; tune by ear.
- **Pull-away, in order:**
  - a loud line-contactor "КЛАЦ": impulse plus modes at 180/650/1800 Hz, 150 ms
  - a ratchet of the rheostat controller stepping positions: 8–15 clicks at 4–8/s
  - a rising **whine**. The gear-mesh fundamental is about 11 Hz per km/h (0→60 km/h ≈ 0→660 Hz). Use a sawtooth at −20 dB plus a 2nd harmonic at −26 dB plus a ×4.3 partial at −32 dB, all through a bandpass of 300–3 kHz.
- **Coasting:** whine fades. When the driver releases, contactors drop with a "клац-клац".
- **Air compressor at stops:** a rattling chug "тр-тр-тр", noise AM at 14–18 Hz, lowpass 800 Hz, running 15–30 s on and off.
- **Doors:** pneumatic hiss "пшш" (highpass 2 kHz noise, 0.6 s decay), then folding-door clatter.
- **Overhead:** the trolley shoes hiss along the wire continuously (bandpass 3 kHz, low level). At switches and crossings there is a double "тынц-тынц". In frost (rime on the wire) you get **arcs**: crackling bursts of 20–200 ms made of 10–40 random broadband pops. Each arc flashes violet-blue (#A8B8FF, core #E8E0FF) for 30–80 ms.
- **Announcement (autoinformer):** «Осторожно, двери закрываются. Следующая остановка — „Улица Академика …“» ("Caution, doors closing. Next stop — …").

**Bus diesel idle.** References: LiAZ-5256 with a V8 diesel, and the last Ikarus-280 artics with a 6-cylinder.
- **Idle:** 600–650 rpm. V8 firing is about 40–43 Hz; 6-cylinder is about 30–33 Hz.
- **Recipe:** pulse train at the firing frequency with ±2% jitter → lowpass 400 Hz, plus resonant peaks at 120 and 250 Hz. Add "clatter": 3 ms noise bursts bandpassed 1–3 kHz, gated per firing at −14 dB. Plus a body rattle.
- **Pull-away:** rpm ramps to 1800–2000 over 5 s, so the firing frequency reaches about 130 Hz. An auto-gearbox shift dips 300 rpm.
- **Brake release:** "пшшш", 0.4 s.

**Marshrutka (Gazelle-type minibus).** Petrol 4-cylinder idle at 800 rpm is about 27 Hz. Its signature is the **sliding side door**: a 0.5 s roller rumble (lowpass 400 Hz with rattle) and then a heavy slam (modes 90/210/480 Hz).

**Metro rumble.** Outer-district lines are often shallow (8–15 m) or open-air. Number-series trains (81-717/714 type) run every 2–4 minutes in the evening, about 90 s at peak.
- **Underground / through a building:** brown noise → lowpass 70 Hz plus sines at 31 and 47 Hz. Swell with 6–8 s attack, 4 s hold, 8–10 s release. Faint "та-дам" bogie clicks at 1–2 Hz on jointed sections.
- **In a station:** a rising traction **howl** (about 150→1200 Hz, distinctly "electric"), screeching brakes at 3–5 kHz, door thud, and the male voice «Осторожно, двери закрываются» ("Caution, doors closing").

**Elektrichka (suburban train), distant.** Horn ("тифон") is two tones, roughly 350/440 Hz (approximate), 1–2 s, then rail-joint "та-дам ... та-дам" fading away.

**Night snow clearing.**
- **Courtyard tractor (MTZ-82 type):** diesel 4-cylinder about 30 Hz at idle, blade scraping asphalt (broadband 200–3000 Hz, gritty AM at 30 Hz), and an orange beacon (#FF8A00) rotating at 1.5 Hz.
- **Prospekt:** the snow-loader with gathering "лапы" (arms) clanks at about 1 Hz over a conveyor rumble, with dump trucks queued alongside.

## 4. Building and electrical

**Mains / transformer.** Grid frequency is 50 Hz. The courtyard **ТП** (transformer kiosk, brick, sign «Не влезай — убьёт!», "Do not climb — it will kill!") hums at **100 Hz**. Sines 100/200/300/400/500 Hz at relative amplitudes 1/0.5/0.35/0.2/0.1, with slow ±1 dB jitter. Sodium street lamps (ДНаТ, #FF9F3A at about 2000 K) have a faint ballast buzz.

**Fluorescent ballast (stairwell, elevator).**
- **Buzz:** a 100 Hz pulse/saw → bandpass 300–3000 Hz, plus a lamination rattle (noise AM at 100 Hz).
- **Failing tube:**
  - starter "тик-тик" (glow-switch clicks, 2–3 clicks per 0.3 s)
  - a "тинк" ping (sine 4 kHz, 20 ms) on each strike attempt
  - flashes every 0.5–3 s while the ends glow orange-pink (#FF9A7A)
- **Colour:** tube #DDEFE6 (greenish cool white).
- **Typical stairwell light:** one bare 40–60 W bulb in a cage or plafond (#FFA957). About 30% of landings are dark with a dead bulb.

**Elevator (Mogilev-type, 400 kg / 5 persons; 630 kg cargo-passenger in 17-storey blocks).** This model was not confirmed by web search, so treat the specification as typical-practice estimates.
- **Specification:** speed 1.0 m/s; floor-to-floor 2.8 m, so about 2.8 s per floor.
- **Cabin:** about 1.0 W × 1.1 D × 2.1 H m (630 kg: 1.1 × 2.1 m deep). Door 0.7 m (0.8–1.2 m on the cargo lift), centre- or side-opening telescopic.
- **Interior:** walls of wood-grain laminate (#8B5A2B to #A0703C), brown linoleum, perforated plafond. Plastic buttons in a column «1–9» or «1–17», some burnt black by lighters. Yellow «Вызов» (call/bell) button.
- **Signs:** «Грузоподъёмность 400 кг. Вместимость 5 чел.» ("Load 400 kg. Capacity 5 persons.") and «Перевозка детей дошкольного возраста без сопровождения взрослых запрещается» ("Preschool children may not ride without an adult").
- **Sound sequence:**
  1. Call-button click.
  2. From the machine room, **relay cascade**: 4–12 clicks (2 ms impulse → bandpass 2–5 kHz) in random clusters 10–80 ms apart.
  3. **Brake solenoid** "клац-бум": 70 Hz thump plus a 1.5 kHz clack, 80 ms.
  4. **Motor hum:** 100 Hz plus a 550–700 Hz whine at −18 dB. Heard through concrete it is lowpassed at 400 Hz.
  5. In the cabin: rumble (lowpass 200 Hz noise), guide-shoe "тук" at rail joints every 1–2 s, wind hiss in the shaft, and a "вжух" (whoosh) mid-shaft as the counterweight passes.
  6. Arrival: switch to low speed (the 2-speed motor drops pitch by about 4×), a stop "бух".
  7. Door operator whir (saw 150→250 Hz, 1.5 s), slide rumble, and an end-clang (modes 180/410/760 Hz).
  8. Doors wait 4–6 s, then close with a bang.
- **No "ding"** in typical 2008 stock. If you want a modernized lift: one sine gong at 880 Hz, 1.2 s exponential decay.

**Domofon (intercom).** Real brands were Vizit, Cyfral, Metakom and Eltis. Parodies: «Визор», «Цифрон», «Мегаком».
- **Panel:** steel, with keys 0–9, «В» (Вызов, call) and «К» (key/code), and a round reader for the "таблетка" (pill-shaped contact key fob). The display is a red 7-segment LED (#FF2A1A) showing the flat number. Sticker «Наберите номер квартиры и нажмите В» ("Dial the flat number and press В").
- **Sounds:** these are stylized, since exact melodies were not confirmed.
  - key beep: square wave about 2.2 kHz, 60 ms
  - call: a warbling trill alternating 1.2/1.6 kHz at 10 Hz for 0.8 s, then a 0.6 s gap, repeated up to 30 s
  - key accepted: rising arpeggio of 1047/1319/1568 Hz, 90 ms each
  - while the lock is released: repeating "пи-пи-пи" at about 2 kHz, 5 Hz, for 3–7 s
  - wrong key: low 400 Hz buzz, 0.5 s
  - voice through the panel: bandpass 300–3400 Hz, clipped, with 50 Hz hum underneath
- **Magnetic lock** (300–600 kgf): on release, a soft "тук" and the door springs ajar. On re-engage, the armature plate makes a metallic **"КЛАК"** (1–3 kHz plus a 70 Hz boom).
- **Steel door slam** (60–80 kg): 5 ms noise impulse into modes 70/140/230/390/620/1040 Hz, decaying 0.4–1.2 s. Add a handle rattle (30 ms), then the vestibule (тамбур) reverb.
- **Paint colours:** dark green #2F4A3A, brown #5A3A28, grey hammertone #6B6F72.
- **Costs:** about 25–40 ₽/month on the utility bill. A key copy is about 100–200 ₽.

**Radiators and pipes.** Cast-iron МС-140-type radiators, 7–12 sections, about 0.59 m tall and 0.14 m deep. Flats run hot (24–26 °C), so the форточка (top vent window) is open even at −15 °C.
- **Air gurgle:** random rising sine chirps 300→1200 Hz, 10–30 ms, 2–10 per second in bursts.
- **Expansion ticks:** 1 ms clicks bandpassed at 3 kHz.
- **Neighbour banging the riser with a key:** 3–5 hits at 4 Hz. Each hit rings 800–2000 Hz with a 1 s decay and is heard on several floors.
- **Riser flush rush:** lowpass 1 kHz noise, 4–8 s, swelling and fading.

**Garbage chute** (0.4 m pipe; hopper on the half-landing).
- Hopper hinge squeal: 1–3 kHz chirp, 0.3 s, then a clang.
- The load falls 9–17 floors: random impacts at 10–25/s for 2–4 s, with cutoff falling 3 kHz→500 Hz and level dropping. Final thump at 70 Hz. Occasionally broken glass.

**Through-wall TV and life** (panel walls 14–18 cm reinforced concrete; at mid frequencies TL ≈ 50 dB).
- **Wall filter:** two cascaded lowpasses at 300 Hz, about −40 dB.
- **News intonation:**
  - male anchor f0 110–150 Hz, about 5 syllables/s
  - phrases 2–4 s with 0.3–0.6 s pauses
  - declarative fall of 5–8 semitones at phrase end (IK-1), small rises at commas
  - synthesis: saw → formants 500/1500/2500 Hz, gated by a syllable envelope
- **Schedule:** 21:00 main news on the first channel (real reference «Время», with a Sviridov-style fanfare; parody «Час»). Laugh-track bursts on comedy shows.
- **Other neighbour sounds:**
  - chair scrape (80–300 Hz, 0.7 s)
  - footsteps upstairs (thuds at 40–100 Hz, 1.8 Hz)
  - toilet cistern refill hiss, 40 s
  - hammer drill (перфоратор), 9:00–21:00: about 40 Hz impacts plus a 1.2 kHz whine, bursts of 5–20 s, carried through the structure

**Muffled conversations** (stairwell, smokers on the landing with a sprat-tin ashtray). Bandlimited speech-like formant babble. Phrases:
- «Ну давай, пока» (OK, bye)
- «Ты где?» (Where are you?)
- «Я уже подхожу» (I'm almost there)
- «Хлеба купил?» (Did you buy bread?)
- «Осторожно, скользко!» (Careful, slippery!)
- «Опять лифт не работает» (The lift's broken again)

Plastic carrier bags crinkle (2–8 kHz crackle grains).

## 5. Outdoor human activity

**Dvornik (janitor), 05:30–08:30.** Orange vest (#FF6A13) with reflective stripes.
- **Steel scraper / pusher on asphalt:** broadband scrape 800–4000 Hz with gritty AM at 20–60 Hz (asphalt texture), 1.5–3 s per push, cycle 4–6 s.
- **Plastic or plywood shovel:** duller, 300–1500 Hz. Ends with a hollow knock when tapped to shed snow.
- **Ice chopper (ледоруб):** "тюк" every 0.9–1.2 s. Sharp click at 1–5 kHz plus a 100 Hz thud, ice fragments tinkling.
- **Sand/reagent from a bucket:** "шшш" hiss, 1 s.
- Twig broom (метла): whisks at 1.5 Hz.

**Kids sledding** (a courtyard hill, 17:00–20:00, loudest Jan 1–10).
- **Plastic ледянка (sliding mat):** bandpass 500–3000 Hz scrape, 2–4 s, fading.
- **Runner sled on an asphalt patch:** a screech.
- **Voices:** f0 250–400 Hz, formant /a/ F1 ≈ 1000, F2 ≈ 1700 Hz.
  - «А-а-а!» (Aaah!)
  - «Мама, смотри!» (Mum, look!)
  - «Моя очередь!» (My turn!)
  - «Ещё разок!» (One more time!)
  - «Домой!» (Home!) — parent's call

**Car alarms of the 2000s.** Real brands: Pantera, Sheriff, StarLine, Alligator; parodies «Пантеон», «Шерифф-М». A siren of about 120 dB at 1 m through a horn speaker; square waves through a bandpass at 1–3 kHz and soft clipping. It is set off by passing trucks or falling snow. **Six-tone cycle, about 4 s each, 25–30 s total, then silence:**
1. slow wail 700→1700→700 Hz, period 1.8 s
2. fast yelp, saw-up 700→1700 Hz every 0.25 s
3. hi-lo alternating 1000 and 1400 Hz, 0.35 s each
4. "machine gun": 1.6 kHz pulses at 12 Hz
5. whoop: rising glide 400→1800 Hz over 0.6 s, repeated
6. ray gun: falling glide 2500→600 Hz over 0.1 s, at 6 Hz

Arming is 1 chirp (1.5 kHz, 80 ms) plus an indicator relay "тик-так" at 1.5 Hz. Disarming is 2 chirps.

**January petards.** Real reference «Корсар»; parody «Корсак». Bangs are impulse plus broadband noise, with 3–6 flutter echoes between blocks. Rockets whistle up 1→3 kHz over 1.5 s.

**Shop door** («Продукты 24 часа», 24-hour groceries). IR chime "дин-дон", E5→C5 (659/523 Hz), sine with a 0.8 s decay.

## 6. Hour-by-hour (winter; sunset 15:57 on Dec 22, ~16:30 mid-Jan)

- **16:00–17:00:** crow streams, blue dusk, sodium lights coming on.
- **18:00–20:00:** commuters from the metro, packed marshrutkas, sledding, dog-walkers, lift traffic, door slams every 1–3 minutes.
- **21:00:** TV news through walls.
- **22:00–23:30:** last dog walks, smokers on balconies.
- **23:00–07:00:** quiet hours under Moscow's night-silence law. The distant MKAD (ring road) drone, occasional alarms, snowplows from 02:00.
- **05:30:** first trolleybuses, metro opens 05:35, dvorniki scraping.
- **Lit windows:** about 75% at 19:00, about 35% at 23:00, about 6% at 03:00.

**2008 prices:**
- metro single ride 19 ₽
- bus/trolleybus 17 ₽
- marshrutka about 20–30 ₽
- loaf of bread about 15–20 ₽
- SMS about 1.5–2.5 ₽
- on-net call about 1–3 ₽/min
- top-up cards 100/150/300/500 ₽
- payment-terminal commission 5–10%

## 7. Phones of 2008

**Models and street prices (approximate):**
- Nokia 1110i / 1112: about 1,300–1,800 ₽
- Samsung E250 slider: about 3,500 ₽
- Motorola RAZR V3: about 4,000 ₽; inner screen 176×220, small outer screen
- Sony Ericsson K750i: about 4,500 ₽ used; 176×220, 4×3 icon grid
- Nokia 6300: about 7,500 ₽; 240×320 TFT, 3×3 icon grid

Parody names: «Нокла», «Сони-Эриком», «Моторолла».

**Basic Nokia-like monochrome screen (96×68 px).**
- 1110: inverted (light text on dark). 1110i: green backlight. 1112: white backlight (#DDEEFF on grey-green #9AA88A LCD).
- **Standby layout:**
  - left edge: vertical signal bars with an antenna icon on top
  - right edge: battery bars
  - centre: operator name in bold (real "MTS RUS" / "Bee Line GSM" / "MegaFon"; parody «МТК RUS», «Пчёлка», «ГигаФон»)
  - clock «18:42»
  - softkeys: left «Меню», right «Контакты» (older firmware «Имена», "Names")
- **Menu screens:** one item per screen. Title at the top, item number top-right, a large icon in the centre, a scroll bar on the right, softkeys «Выбрать» (Select) and «Назад» (Back).
- **Main menu:**
  1. Сообщения (Messages)
  2. Контакты (Contacts)
  3. Журнал (Call log)
  4. Настройки (Settings)
  5. Будильник (Alarm)
  6. Напоминания (Reminders)
  7. Игры (Games: Snake Xenzia, Dice, Pocket Carrom)
  8. Доп. функции (Extras: Калькулятор, Секундомер, Таймер — calculator, stopwatch, timer)
  9. Услуги SIM (SIM services)
- **Фонарик (flashlight):** only on the 1100/1200/1208-type, via a long key press. Not on the 1110.
- **Сообщения:** Новое сообщ., Входящие, Исходящие, Отправленные, Шаблоны, Настройки сообщ. (New, Inbox, Outbox, Sent, Templates, Message settings).
- **Журнал:** Непринятые вызовы, Принятые вызовы, Набранные номера, Длительность вызовов (Missed, Received, Dialled, Call duration).
- **Профили (profiles):** Обычный, Без звука, Встреча, На улице, Пейджер (General, Silent, Meeting, Outdoor, Pager).
- **Status popups:**
  - «1 непринятый вызов» (1 missed call) with softkey «Показ.» (Show)
  - «1 новое сообщение» (1 new message) with an envelope icon
  - «Батарея разряжена» (Battery low)
  - «Только 112» (Emergency only)
  - «Вставьте SIM-карту» (Insert SIM)
- **Colour S40 grid (6300-like):** Сообщения, Контакты, Журнал, Настройки, Галерея, Медиа, Органайзер, Приложения, Интернет. Blue/white theme, carrier wallpaper.

**Operator SMS (fictionalized wording; approximate).**
- Balance by USSD «*100#» (MTS and MegaFon style; Beeline used «#102#»). The reply appears as a popup: «Баланс: 47,32 р.» ("Balance: 47.32 rub.")
- «Ваш счёт пополнен на 300.00 руб. Баланс: 312.45 руб.» ("Account topped up by 300 rub. Balance: 312.45")
- «Уважаемый абонент! На Вашем счёте менее 30 руб. Пополните счёт.» ("Dear subscriber, less than 30 rub left. Please top up.")
- Missed-call service when the phone was off: «Вам звонили: +79161234567, 2 раз(а), посл. 18:42 14.01» ("You were called: …, 2 times, last at 18:42 on 14.01")
- «Абонент +7916… снова в сети» ("Subscriber … is back online")
- "Call me" service (free, real-world «*110*номер#» style): «Абонент +7903… просит Вас перезвонить» ("Subscriber … asks you to call back")
- «Вам пришло MMS. Для просмотра зайдите на …» ("You received an MMS. To view, go to …")
- **Classic 2008 scam SMS:** «Мама, у меня проблемы, положи 500 р. на этот номер, потом объясню» ("Mum, I'm in trouble, put 500 rub on this number, will explain later")

**Personal SMS with translit habits.** People typed in Latin because a Cyrillic SMS holds 70 characters versus 160 in Latin, at the same price. Common substitutions: ч→4, ш→w or sh, я→ya or 9, ы→y, щ→sch.
- «Privet! Ty gde? Ya u pod'ezda» (Hi, where are you? I'm at the entrance)
- «Kupi hleba i moloka pliz» (Buy bread and milk please)
- «Mam ya zaderzhus, budu k 10» (Mum, I'll be late, home by 10)
- «4to delaew?» (What are you doing?)
- «Ne mogu govorit, perezvonyu» (Can't talk, will call back)
- «Zakin' mne 50r na tel, plz» (Put 50 rub on my phone please)
- «Lift opyat' slomalsya(((» (The lift's broken again)
- «S Novym Godom!!! S4ast'ya, zdorov'ya!» (Happy New Year! Happiness, health!)
- Cyrillic slang: «щас буду» (be there in a sec), «спс» (thx), «ок», «пжлст» (pls)

**Ringtones and phone sounds.**
- **Monophonic:** square wave or 25% pulse, octaves 5–7 (523–2093 Hz), 100–200 bpm, staccato 80% gate, through a bandpass of 700–5000 Hz to imitate the tiny speaker. Real references: the "Nokia tune" (Gran Vals), the 2003 «Бумер» ringtone, Crazy Frog. Write original parodies.
- **SMS alert:** 2–3 beeps at 1.5–2 kHz, 70 ms.
- **Keypad:** 1 ms clicks.
- **Vibration on a table:** rattle of 150–180 Hz rough noise, 0.8 s on / 0.8 s off.
- **GSM speaker interference** (the iconic 2008 sound before a call or SMS): pulse train at **217 Hz** (577 µs pulses), gated in bursts "дрр-дрр-тр-тр" with an 8 Hz pattern for 1–3 s, out of any nearby radio or TV.

## 8. Windows, interiors and colour temperature

**Colour (blackbody sRGB):**
- 2000 K sodium: #FF8A12
- **2700 K incandescent: #FFA957**
- 3000 K: #FFB46B
- 4000 K CFL/ЛБ tube: #FFD1A3, often greenish in practice (#E6F2D8)
- 6500 K ЛД tube: #F4FAFF with a green tint (#DDEFE6)

**Window mix at 19:00:**
- about 60% warm incandescent (core #FFB25E, edge falloff #E07A2A)
- 10% early cold CFL (#DDE8F0)
- 8% kitchen fluorescent (#C8E6D8)
- 10% TV-only (blue #5A78D8↔#A8C0FF, changing every 2–6 s at scene cuts)
- the rest tinted by curtains: orange #E8893A, red #B8432E, green #8FAF5A, gold #F2C04F
- in January: New Year garlands chasing at 1–2 Hz (red #FF2A2A, green #2AFF5A, blue #3A5AFF, yellow #FFD02A), plus paper snowflakes glued to the glass, until Old New Year (Jan 14)

**Window frames.** About 1.5 × 1.5 m in rooms.
- Old wooden double frames: about 0.13 m gap with cotton wool and paper tape for winter; a форточка (vent pane) of about 0.4 × 0.5 m.
- New white PVC units (стеклопакеты): about 30–40% of windows by 2008.

**Visible interiors** (ceilings 2.5–2.7 m):
- **CRT TV:** 21" about 0.52 W × 0.45 H × 0.48 D m on a тумбочка (low TV cabinet); 14" kitchen TV about 0.36 × 0.34 × 0.36 m.
- **Wall carpet:** 1.5×2 or 2×3 m, burgundy #7A1F2B with a beige/navy medallion, above the sofa or bed.
- **«Стенка» (wall unit):** 3.6–4.2 m long, 2.2 m tall, 0.45 m deep, dark polished walnut #3E2516. Glass doors show crystal glasses and rows of books.
- **Chandelier:** 3–5 brass arms with frosted tulip shades (#F2E6C8) or a Czech crystal cascade, hanging 0.6–0.8 m below the ceiling.
- **Window dressing:** full-width white/ivory patterned tulle, with heavy side curtains (портьеры) in gold, beige or maroon.
- **Kitchen:**
  - short tulle café curtain
  - sill with aloe, red geraniums, violets, three-litre jars, onions
  - oilcloth (клеёнка) on the table
  - white fridge with magnets and a wall calendar
- **Balconies:** glazed in mismatched frames, holding skis, sleds, boxes and frozen laundry. Satellite dishes on the façade (real reference НТВ+; parody «ТВ-Плюс»).

---

Sources:
- [Nokia 1110 review (mobile-review.com)](https://mobile-review.com/review/nokia-1110.shtml)
- [Nokia 1110 (Wikipedia)](https://en.wikipedia.org/wiki/Nokia_1110)
- [Nokia 1112 (Wikipedia)](https://en.wikipedia.org/wiki/Nokia_1112)
- [Rossiyskaya Gazeta, 2008 Moscow tariff rises](https://rg.ru/2007/12/26/moscow2008.html)
- [Interfax, metro fare increase](https://www.interfax.ru/russia/51275)
- [Hooded crow (Ruwiki)](https://ru.ruwiki.ru/wiki/%D1%81%D0%B5%D1%80%D0%B0%D1%8F_%D0%B2%D0%BE%D1%80%D0%BE%D0%BD%D0%B0)
- [MTS «Я на связи» service description](https://media.mts.ru/internet/145601)
- [ZiU-9 family (dic.academic.ru)](https://dic.academic.ru/dic.nsf/ruwiki/928662)
- [Mogilevliftmash range (myfin.by)](https://myfin.by/article/belarus/mogilevliftmas-nacnet-vypuskat-skorostnye-lifty-dla-neboskrebov-48853)

These were checked against the sources: 2008 fares (metro 19 ₽, ground transport 17 ₽), the Nokia 1110 screen (96×68, games list) and backlight differences between 1110, 1110i and 1112, and the crow's "hoarse caw". The other numbers are estimates and should be tuned by ear: acoustic frequencies, the trolleybus and lift mechanics, intercom melodies, and the exact wording of operator SMS.