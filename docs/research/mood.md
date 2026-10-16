# LIMINAL MOSCOW: mood and rendering digest

---

## PART A: MOOD

### A1. What lights a 2008 spalny rayon at night

- **Street and road lighting:** high-pressure sodium lamps (ДНаТ, "дуговая натриевая трубчатая", a sodium arc tube) in cobra-head fixtures (ЖКУ, the "Ж" means sodium).
  - Mounted 8–10 m up on grey concrete poles, spaced about 30–40 m apart along roads.
  - Color temperature about 2000–2100 K, CRI about 20–25. Colors look flattened to orange, brown and black, so red cars and green fences read as mud.
  - Road illuminance about 10–20 lx.
- **Courtyards:** sparser and patchier.
  - Some pole lanterns use **mercury lamps** (ДРЛ in fixtures marked РКУ). They give a bluish-green white, about 4000 K, and look sickly next to sodium.
  - Many buildings carry a sodium floodlight on the facade at 2nd–3rd floor level, aimed into the yard. It throws long tree shadows across the snow.
  - About 1 in 4 or 5 yard lamps is dead or flickering.
  - Yard illuminance about 1–5 lx.
- **Entrances (подъезды):** a 60 W incandescent bulb in a round "шайба" fixture (a puck with a cage) over the steel door. Many are bare bulbs, some broken.
- **Elevator halls and shops:** fluorescent tubes (ЛБ-40). They flicker at 100 Hz on 50 Hz mains, and failing tubes stutter on and off at 0.5–2 Hz.
- **Obstruction lights:** steady red lights at roof corners of 17–25-storey towers and on heat-plant (ТЭЦ) chimneys. Chimneys are 150–250 m tall with red and white bands. Some lights are burnt out.
- **Switching (Russian norm):** outdoor lighting comes on when daylight falls to about 20 lx and goes off when it rises to about 10 lx. In practice that is about 15–25 minutes after sunset.
- **Sun times, Moscow, Dec 22:** sunrise about 08:59, sunset about 15:58.
  - Civil twilight ends about 16:55, nautical about 17:50, astronomical about 18:50.
  - The sun sinks slowly at this latitude (about 6°/h), so blue hour lasts about an hour, roughly 16:10–17:10.
  - By mid-January sunset is about 16:20.
  - Winter clocks in 2008 were UTC+3, the same as today, so modern almanac tables apply.
- **Sunshine:** December averages about 18 hours of sun for the whole month. Overcast is the default.

### A2. Sky, skyglow and "snowglow"

- **Overcast night sky:** low cloud lit from below by sodium light becomes a dirty pink-orange-mauve dome. It is brightest toward the city center and toward big road junctions, darkest at the zenith. No stars.
- **Snowglow:** fresh snow plus low cloud multiplies sky brightness. Snow reflects lamp light up, the cloud sends it back down, and the two bounce repeatedly.
  - Measurements near Berlin found amplification of more than 180×, with ground illuminance above twice a full moon (Jechow & Hölker 2019).
  - In practice, snowy overcast nights in the outskirts are bright enough to see the whole courtyard with no lamp. Shadows are soft and almost directionless.
  - Model this as a global "snowglow" multiplier on ambient light: 1.0 on a clear night without snow, about 3–5 on overcast nights with fresh snow.
- **Clear frosty nights** (−15 to −25 °C) are rarer and darker, with a black-blue zenith.
  - They produce **light pillars** (световые столбы): vertical beams 10–30° tall above lamps and floodlights, caused by plate-shaped ice crystals. Each beam takes the lamp's color.
  - Heat-plant plumes rise straight up, lit orange-grey from below.
  - "Diamond dust" crystals glint in lamp cones.
- **Thaw nights** (−2 to +2 °C) bring fog, wet snow, slush and wet black asphalt with long orange reflections. Visibility drops to 100–300 m and lamp cones become solid.

### A3. Snow, fog, frost and steam

- **Snow visibility:** falling snow is visible almost only **inside lamp cones** and against lit windows. Against the bright sky, flakes read as **dark specks**.
  - Flakes backlit by a lamp (looking toward it) glow strongly because snowflakes scatter light forward.
- **Real fall speeds:** dendrites 0.5–1.0 m/s, aggregates 1–1.5 m/s, wet snow 1.5–2 m/s, graupel 1–3 m/s.
- **Real density:** about 100–300 flakes/m³ in moderate snow.
- **Visibility by snowfall** (Koschmieder relation, V = 3.912/σ):

| Snowfall | Visibility | Extinction σ |
|---|---|---|
| Light | about 1 km | 0.004 /m |
| Moderate | about 400 m | 0.01 /m |
| Heavy | about 150 m | 0.026 /m |
| Blizzard | about 50 m | 0.08 /m |

  Recommended game default: σ about 0.012–0.02.
- **Sound:** fresh snow absorbs high frequencies, so the world goes quiet after snowfall.
  - Footsteps squeak (скрип) below about −8 °C and squelch in slush near 0 °C.
  - Parallel slabs 40–60 m apart give a **flutter echo** with about 0.25–0.35 s delay.
  - Sound carries far on frosty nights (temperature inversion): trains, the ring road (MKAD), dogs 1–2 km away.
- **Frost on windows:** fern patterns (морозные узоры) grow from the bottom corners of the *outer* pane in old double wooden frames. Stairwell windows (single glazing, often one pane replaced by plywood) frost heavily.
  - New white PVC windows (about 30–50% of windows by 2008) stay clear but fog at the bottom edge.
- **Steam:** rises from manholes and from snow-free strips over heating mains (теплотрасса). Those strips cross courtyards as melted brown or green lines with cats sitting on the hatches.
  - Steam also comes from basement vents (продухи) and the open small ventilation panes (форточки) of kitchen windows.
- **Icicles and roof snow:** there are icicles on roof edges and balcony lips, red-and-white tape on the sidewalk, and a hand-painted sign: «Осторожно! Сход снега и падение сосулек» ("Caution! Falling snow and icicles").

### A4. Lit-window patterns, weekday in winter

Percentages are for an ordinary 17-storey slab (P-44 type). Shift everything 1 hour later on weekends.

| Time | Lit | What is lit |
|---|---|---|
| 16:30–18:00 | 25–40% | Pensioners, schoolkids. Kitchens and TV rooms. |
| 18:00–20:00 | 55–75% | Commuters return. Kitchens nearly all lit. |
| 20:00–22:30 | 70–85% (peak) | Blue TV flicker in about 20% of lit windows. The 21:00 news means many TVs in sync. |
| 23:00 | 40–50% | Living rooms go dark first. TV-only windows stay. |
| 00:00–01:00 | 15–25% | |
| 01:00–05:00 | 3–8% | Insomnia kitchens, night-shift workers, a child's nightlight. |
| 05:45–08:00 | 15–35% | Kitchens first, then hallways, then off in waves as people leave. |

- **Always lit (if the bulb survives):** stairwells.
  - In 14–25-storey series, smoke-proof stairs are reached through open **transit balconies** (переходные балконы, required for buildings over 28 m). They form a vertical strip of dim bulb-lit openings above each entrance, where people smoke.
  - In 9-storey series the stairwell windows sit half a floor offset from the apartment windows.
- **Dec 20 – Jan 14:** about 5–10% of windows show blinking garlands (red, green, blue, yellow, chase or fade modes at about 1 Hz) and sometimes a tree silhouette.
- **New Year's Eve:** nearly 100% lit from 23:00 to 01:00, with firework bursts.
- **Jan 1, 10:00–14:00** is the emptiest morning of the year. Red firework casings and champagne bottles lie in the snow.
- **Visual variety comes from residents' changes:**
  - Ad-hoc balcony glazing: wooden, aluminium, plywood, each one different.
  - Clutter seen through glass: skis, jars, a bicycle.
  - Outdoor air-conditioner units.
  - Small 0.55–0.6 m satellite dishes on about 5–10% of balconies.

### A5. Palette (sRGB hex, as seen in the final image)

**Sky at blue hour, 16:15–17:10**

| Condition | Zenith | Mid | Horizon |
|---|---|---|---|
| Clear | `#1C2B4F` | `#2E4775` | `#5A6B95` (faint SW band `#8E7A8C` → `#C49A86`) |
| Overcast (more common) | `#3B4560` | | `#66708A` |

**Sky at deep night, overcast with light pollution (the default)**

| Condition | Zenith | Mid | Horizon | Toward the center |
|---|---|---|---|---|
| Normal | `#2B2330` | `#3D2E3A` | `#5E4248` | `#7D5348` |
| Snowglow (fresh snow, low cloud) | `#46363F` | | `#8A6058` | |
| Clear frost | `#0E1424` | | `#3A3040` | |

**Snow**

| Where | Hex |
|---|---|
| Directly under a sodium lamp | `#F7D29A` |
| Mid cone | `#DDA86C` |
| Cone edge | `#A8784C` |
| Fading to ambient | `#6E5A58` |
| Under mercury light | `#C7D9D2` |
| Open shadow (lit by skyglow) | `#4A4D6A` |
| Deep shadow (under trees, building lee) | `#2C2F45` |
| Stylized violet shadow | `#4B4466` |
| Trodden snow / slush with de-icing reagent | `#6B5F55`, `#4A4038` |

**Concrete facades at night**

| Surface | Hex |
|---|---|
| Lower floors, sodium from below | `#8A7058` |
| Peach or beige painted panel under sodium | `#9A7255` |
| Upper floors in skyglow | `#4A4650` |
| Facade in shadow | `#2A2A33` |
| Panel joints (sealant) | `#1E1C20` |
| White silicate brick 5-storey, under sodium | `#A08C74` |
| Red brick, under sodium | `#6A3A2C` |

**Window and lamp light (emissive colors)**

| Source | Hex |
|---|---|
| Incandescent behind white tulle | `#FFC27A` |
| Beige or yellow curtains | `#F0A048` |
| Orange curtains | `#D2692E` |
| Red curtains | `#A8342A` |
| Bare kitchen bulb | `#FFD9A0` |
| Energy-saving bulb (CFL, about 10% in 2008) | `#F4F2D8` |
| CRT TV, average | `#7A93E8` |
| CRT TV, flicker range | `#3C4C8C` to `#B4C6FF` |
| LCD TV | `#A9B8E0` |
| Fluorescent ЛБ tube | `#EEF3E2` |
| Fluorescent through dirty stairwell glass | `#C9D2B5` |
| Dark window, base | `#0D0F15` |
| Dark window reflecting skyglow | `#1E1A22` |
| Sodium reflection streak on glass | `#3A2A1E` |
| Sodium lamp head core / glow | `#FFB25A` / `#FF9030` |
| Mercury lamp | `#D8ECEA` |
| Entrance bulb | `#FFC07A` |
| Obstruction light | `#FF2A1A` |

- **Sodium light in linear RGB:** about (1.0, 0.37, 0.065).
- **Brightness targets (final sRGB value, 0–255):**
  - Snow under a lamp: 200–230.
  - Snow 10 m from a lamp: about 110.
  - Snow in shadow: 45–65.
  - Facades: 35–60.
  - Sky: 40–80.
  - Dark windows: 15–25.
- **Lift the blacks** to about `#07080C`. Real night photos here are never pure black.

### A6. Lessons from liminal-space and "doomer" aesthetics

1. **Traces, not absence.** Show lit windows, warm car hoods with melted roof snow, smoke from a stub in a bin, a sled leaning by a door. Empty but *recently* occupied.
2. **Teach the baseline first, then deviate** (the Exit 8 principle). Repeating courtyards make tiny differences readable.
3. **Keep everything deniable.** Each oddity needs a mundane explanation the player can almost reach. Never confirm, never escalate to a threat.
4. **Use real scale.** The gap between parallel 17-storey slabs is 60–150 m. Real walking time makes the player feel small and the district endless.
5. **Pools of light, rhythm and dark intervals.** Use slow eye adaptation (time constant 5–10 s), so a dark stretch gradually "opens up". This feels subtly unnatural.
6. **Warm inside, cold outside.** This is the doomer core: other people's lit kitchens are visible and unreachable ("окна чужих квартир", "windows of other people's flats"). The kiosk is the last warm point. A lone smoker sits on a transit balcony.
7. **Audio does half the work.** Use distant life only: an elevator thump inside a building, a TV through a wall, dogs, a car alarm three yards away, a commuter train (электричка) horn. No stingers, almost no music.
8. **Micro-motion against stillness:** a plastic bag in a birch, a swing creak, a flapping notice on a door.
9. **Low fidelity evokes memory.** Reference the look of 2008 compact cameras and phones (2–3 MP, CCD vertical smear streaks from lamps, chroma noise, purple fringing) rather than photorealism.
10. **Avoid anachronism.** "Sovietwave" is a retro-synth music genre, not a 2008 soundscape. 2008 kiosks and taxis played radio pop and chanson stations.

### A7. References

**Films**
- *Ирония судьбы* (1975), *The Irony of Fate*: the canonical "identical microdistrict" premise. Its 2007 sequel is set exactly in the game's period.
- *Все умрут, а я останусь* (Gai Germanika, 2008), *Everybody Dies but Me*: Moscow outskirts, handheld camera, sodium nights.
- *Шультес* (Bakuradze, 2008), *Shultes*: a detached Moscow, long static takes.
- *Елена* (Zvyagintsev, 2011), *Elena*: center versus outskirts, power-plant chimneys, panel courtyards.
- *Нелюбовь* (Zvyagintsev, 2017), *Loveless*: winter panel blocks, a cold desaturated grade.
- *Майор* (2013), *The Major*, and *Дурак* (2014), *The Fool*, both by Yuri Bykov: winter night, sodium, municipal decay.
- *Петровы в гриппе* (2021), *Petrov's Flu*: a winter panel city.
- *Хрусталь* (2018), *Crystal Swan*: 1990s Minsk suburbs.

**Photographers**
- Alexander Gronsky, *Pastoral: Moscow Suburbs* (about 2009–12): haze and the edge zones where city meets wasteland. The closest reference.
- Elena Chernyshova, *Days of Night – Nights of Day*: Norilsk polar night.
- Danila Tkachenko.
- Dmitry Markov: mundane provincial life.
- Arseniy Kotov: panel-block typologies.
- Christopher Herwig, *Soviet Bus Stops*.
- Igor Mukhin: Moscow street photography.
- Ilya Varlamov's 2008-era LiveJournal posts: documentary, period-accurate.

**Games, and what to take from each**
- **ШХД: ЗИМА / It's Winter** (Ilya Mazo and sad3d, 2019): the closest analog. No goals, a panel apartment, cooking, switching lights, wind outside, low-res rendering. Ordinary activity is the content.
- **PANELKI** (Alexander Gromyko, 2022): a procedurally generated endless Siberian panel city with weather and a day/night cycle.
- **Winter Sadness Simulator:** a walk through a post-Soviet courtyard, with walking as the only activity.
- **Russian Train Trip 1–3** (Stop-TussiN, 2021–23): mundane Russian transport, low-fi, deadpan.
- **Pathologic 2** (Ice-Pick Lodge): fog limits draw distance as mood, the town runs on schedules, and theatrical artifice makes a place feel staged.
- **The Exit 8 / Platform 8:** anomaly spotting against a learned baseline, anomalies graded from obvious to tiny.
- **The Long Dark:** flat painterly shading, strong per-time-of-day color ramps, layered wind audio, aurora as natural uncanniness.
- **Signalis:** low internal resolution, dithering, limited palette, repetition, Eastern-bloc brutalism.
- **Shadows of Doubt:** a voxel city with procedural window lights and resident schedules. The technical analog.
- **BABBDI, Pools, Anemoiapolis, Paratopic:** liminal exploration with no monsters, or with ambiguity only.
- **Tiny Bunny (Зайчик):** a 1990s Russian winter village, dread made from ordinary details.
- **ATOM RPG:** density of Soviet artifacts and signage.
- **Faith:** audio-led restraint. Take only the restraint, not the horror.
- **Names I could not match:**
  - **Paperhead** turns out to be an unrelated paper-world shooter.
  - **Anatoly Ivanov:** no relevant creator or game found. Treat as unknown.

### A8. Twenty ambiguous anomalies (each with a mundane explanation)

1. **The same window in every building.** One window per building has an identical orange curtain and three-arm chandelier, in the same column and floor. *Cover:* typical series, one IKEA-equivalent store.
2. **Upward snow.** Snow briefly falls *upward* in one spot. *Cover:* warm updraft from a basement vent.
3. **The address skips.** Building numbers jump (корпус 3 next to корпус 7). *Cover:* real Moscow addressing.
4. **An elevator in a dark building.** You hear an elevator run in a building where every window is dark. *Cover:* the service tech, or the night shift.
5. **The kiosk with no seller.** The kiosk is lit, the radio plays, nobody is inside. The sign reads «Перерыв 15 мин» ("Break 15 min"). It still says that 40 minutes later.
6. **The old sign.** A shop door says «Ушла на базу» ("Gone to the warehouse"), a classic Soviet-era sign, though this is 2008.
7. **Wrong clock.** A pharmacy clock is exactly 1 hour off. *Cover:* nobody reset it after the October daylight-saving change (Russia still switched clocks until 2011).
8. **TVs in sync.** Several windows across the yard flicker in sync. *Cover:* everyone is watching the 21:00 news.
9. **Footprints from nowhere.** Tracks start in the middle of a courtyard. *Cover:* someone got out of a car that has since left.
10. **Your own tracks.** Following your own footprints leads to a door you never entered. *Cover:* someone else in the same boots.
11. **The snowman.** A snowman faces a different way when you return. *Cover:* kids.
12. **The empty cone.** One lamp cone has no visible snowfall. *Cover:* a wind shadow from the building.
13. **The extra storey.** A building of an identical series has one floor more than its twin. *Cover:* a technical floor, or a different sub-series.
14. **The tear-off notice.** «Пропала собака» ("Lost dog") with every tear-off tab taken except one.
15. **The impossible apartment.** The intercom (домофон) panel accepts an apartment number higher than the building has.
16. **The rising light.** A light moves up a stairwell window column one floor at a time and stops at the top floor. Nobody comes out on the roof.
17. **The same car.** The same parked car, same plate, same snow load, appears in two different yards.
18. **The distant blackout.** Lights in a distant microdistrict go out in a slow wave, then return. *Cover:* a substation switch-over.
19. **The train with no track.** A train horn sounds from a direction with no railway. *Cover:* the temperature inversion carries sound.
20. **The swinging payphone.** A payphone handset hangs off the hook and swings slightly. There is no wind at ground level.

**Rules:** at most one anomaly per area, never in the player's face. They trigger only at distance or after the player looks away, and are never confirmed or explained.

---

## PART B: RENDERING (three.js / WebGL2)

### B0. Pipeline

1. Render the scene to a HalfFloat render target with a `DepthTexture`.
2. A full-screen **atmosphere pass** applies height fog and in-scattering from the nearest 16 lamps, which the CPU picks each frame.
3. Draw snow points, with their own fog.
4. Bloom.
5. `OutputPass` with `AgXToneMapping` (or ACES), exposure about 1.0.
6. A final pass for grading, grain and dithering.

All intermediate targets must be `HalfFloatType`, or the dark gradients will band.

### B1. Analytic lamp in-scattering (closed form plus equiangular cone sampling)

**Inputs:**
- Ray: origin o, direction d, length D. The point at distance t is x(t) = o + d·t.
- Lamp position p. Let q = o − p.
- b = d·q, the projection of q onto the ray.
- h = √(q·q − b²), the lamp's distance from the ray line.

**Closed form** (isotropic point light, inverse square, no extinction):

∫₀^D dt / |x(t) − p|² = [atan((D + b)/h) − atan(b/h)] / h

**Cone, extinction and phase:**
- Substitute t = h·tan φ − b, so the integrand becomes uniform in φ. This is equiangular sampling (Kulla & Fajardo 2012).
- 3–4 samples in φ, with a blue-noise jitter, are enough to add the downward cone, extinction and a phase function.

```glsl
uniform float uSigma;               // 0.012–0.02 /m
float phaseHG(float c, float g){ float g2=g*g; return (1.-g2)/(12.566*pow(1.+g2-2.*g*c,1.5)); }

vec3 lampInscatter(vec3 ro, vec3 rd, float D, vec3 lp, vec3 Lcol, float cosOuter, float jit){
  vec3 q = ro - lp;
  float b = dot(rd, q);
  float h = sqrt(max(dot(q,q) - b*b, 1e-4));
  float p0 = atan(b/h), p1 = atan((D + b)/h);
  float acc = 0.;
  for (int i = 0; i < 4; i++){
    float t = h*tan(mix(p0, p1, (float(i)+jit)*0.25)) - b;
    vec3 x = ro + rd*t, v = x - lp; float r = length(v); v /= r;
    float cone = smoothstep(cosOuter, cosOuter+0.25, -v.y) + 0.03;   // faint glare above head
    acc += cone * phaseHG(dot(v, -rd), 0.4) * exp(-uSigma*(t + r));  // view + light extinction
  }
  return Lcol * uSigma * acc * (p1 - p0) / (h * 4.0);
}
```

- **Cone setting:** street heads use `cosOuter` of about 0.35 (about 140° full cone).
- **Reconstructing D in the pass:**
  1. `ndc = vec4(uv*2.-1., depth*2.-1., 1.)`
  2. `vp = projInv*ndc; vp /= vp.w`
  3. `D = length(vp.xyz)`
  4. `rd = mat3(camWorld)*normalize(vp.xyz)`
  5. For sky pixels, D = 400.
- **Cost:** 16 lamps × 4 samples. Run at half resolution on integrated GPUs.

### B2. Exponential height fog (iq)

**Density:** σ(y) = σ₀ + a·e^(−b·(y − y_g)), where y_g is ground height.

**Optical depth** for a ray starting at height y₀:

τ = σ₀·D + a·e^(−b·(y₀ − y_g)) · (1 − e^(−b·d_y·D)) / (b·d_y)

The last factor becomes D when d_y ≈ 0.

```glsl
float opticalDepth(vec3 ro, vec3 rd, float D){
  float k = uFogFall*rd.y;
  float f = abs(k) < 1e-4 ? D : (1. - exp(-k*D))/k;
  return uSigma0*D + uFogA*exp(-uFogFall*(ro.y - uGround))*f;
}
// col = col*exp(-tau) + fogCol*(1.-exp(-tau)) + Σ lampInscatter(...)
```

- **Typical values:** σ₀ = 0.006–0.015, a = 0.03–0.06, b = 0.08–0.2 /m (ground mist 5–12 m thick).
- **fogCol:** about 0.8 × the horizon sky color (for example `#4A3E44`). Do not use grey-white, or the fog turns milky.
- **Horizon:** blend the sky and fog colors at the horizon so the far plane disappears.

### B3. Grade, grain and dithering

```glsl
// linear, before encode: Purkinje-style night desaturation + lifted blue black
float l = dot(c, vec3(.2126,.7152,.0722));
c = mix(c, l*vec3(.62,.72,1.)*1.15, (1.-smoothstep(.02,.25,l))*.55);
c = c*.97 + vec3(.006,.006,.010);
// LAST op, after sRGB encode: triangular blue-noise dither (±1 LSB)
vec3 n = texture(tBlueNoise, (gl_FragCoord.xy + vec2(17,29)*uFrame)/64.).rgb*2.-1.;
n = sign(n)*(1. - sqrt(1. - abs(n)));             // uniform → triangular PDF
c += n/255.;
// fallback: interleaved gradient noise (Jimenez 2014)
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(.06711056,.00583715)))); }
```

- **Blue noise source:** Christoph Peters' free 64×64 blue-noise textures (CC0).
- **Retro posterization (optional):** Bayer 4×4 matrix `[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]/16`, then `floor(c*levels + bayer)/levels` with levels = 32–64.
- **Film grain:** 2–3% luminance noise, animated each frame.
- **Lit materials:** set `material.dithering = true` as well.

### B4. Low-intensity bloom

```js
renderer.toneMapping = THREE.AgXToneMapping;
const bloom = new UnrealBloomPass(new THREE.Vector2(w/2, h/2), 0.3 /*strength*/, 0.6 /*radius*/, 1.0 /*threshold, linear HDR*/);
```

- **Emissive levels (linear):** lamp heads 6–10, lit windows 1.5–3, snow under lamps 0.6–0.9 (below threshold, so snow never blooms).
- **Alternative look:** a photographic halation bloom with no threshold, `final = mix(scene, blurredScene, 0.04)`.
- The orange halos should come from fog in-scattering (B1). Keep bloom subtle.

### B5. GPU snow (camera-relative wrap, lamp-lit)

- **Layers:** two `THREE.Points` layers.
  - Near: 12 m box, 15k flakes, about 6 mm flakes.
  - Far: 50 m box, 30k flakes.
  - Optional third layer: a screen-space noise layer for density.
- **Material:** additive blending, `depthWrite: false`, depth test on.

```glsl
attribute vec4 aSeed;                    // xyz ∈[0,1), w random
uniform float uTime, uBox, uPx;          // uPx = viewportH / (2*tan(fov/2))
uniform vec3 uCam, uWind, uAmbient;      // ambient ≈ skyglow*0.05
uniform vec4 uLamp[8]; uniform vec3 uLampCol[8];
varying vec3 vCol; varying float vA;
void main(){
  float r = aSeed.w;
  vec3 p = aSeed.xyz*uBox + uWind*uTime;
  p.y -= mix(0.6, 1.3, r)*uTime;                                         // m/s
  p.xz += 0.25*vec2(sin(uTime*(1.1+r)+r*40.), cos(uTime*(0.8+r)+r*90.)); // flutter
  p = uCam + mod(p - uCam + 0.5*uBox, uBox) - 0.5*uBox;                  // wrap around camera
  vec3 V = normalize(uCam - p), L = uAmbient;
  for (int i = 0; i < 8; i++){
    vec3 d = p - uLamp[i].xyz; float r2 = dot(d,d); vec3 v = d*inversesqrt(r2);
    L += uLampCol[i]*uLamp[i].w*smoothstep(.35,.65,-v.y)*phaseHG(dot(v,V), .55)/r2; // forward glow
  }
  vec4 mv = viewMatrix*vec4(p,1.); float z = -mv.z;
  float s = 0.006*mix(.7,1.4,r)*uPx/z;
  gl_PointSize = clamp(s, 1., 8.);
  vA = (1.-smoothstep(.35*uBox, .5*uBox, length(p-uCam))) * smoothstep(.3,1.,z) * min(s,1.);
  vCol = L; gl_Position = projectionMatrix*mv;
}
// frag: a = vA*(1.-smoothstep(.2,.5,length(gl_PointCoord-.5))); out = vec4(vCol*a, a);
```

- **Sub-pixel flakes:** make them dimmer, not smaller (`min(s,1.)`), to avoid shimmer.
- **Precision:** keep `uTime` below about 1e4 s. Reset it during a scene transition.
- **Frost nights:** add **light pillars** as additive world-up billboards above bright lamps, 10–30 m tall, with a vertical fade.

### B6. Voxel per-vertex AO with greedy meshing (0fps / Lysenko method)

```js
// per face vertex: two edge neighbours s1,s2 and the corner c, on the face's outer layer
const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + c);      // 0 darkest … 3 open
const AO = [0.40, 0.62, 0.82, 1.0];
if (a00 + a11 > a01 + a10) emitFlippedQuad(); else emitQuad();  // fixes anisotropic interpolation
// greedy mask key: merge only identical keys
const key = mat | (a0 << 8) | (a1 << 10) | (a2 << 12) | (a3 << 14);
```

- **Scale:** at 0.25 m voxels AO is very local (window reveals, balcony undersides, panel joints). Add two larger-scale terms:
  - **Sky visibility,** baked per vertex. Cast 8–16 rays through a 1 m occupancy grid up to 20 m, in a worker thread.
  - **Snow bounce:** `bounce = 0.8 * groundLampIrradiance * 0.3 * exp(-heightAboveGround/2.0)`. This makes the lower 2–3 floors glow orange from snow below sodium lamps, which matches reality.
- **Building shells:** build buildings as hollow shells 1–2 voxels thick.
- **Floor height:** use 2.75 m (11 voxels) instead of the real 2.8 m.

### B7. Procedural lit windows (hash of window cell ID)

Facade quads carry facade-local coordinates `uv` (meters along the wall and upward) and a `wallId`.

```glsl
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec3 windowLight(vec2 uv, float wallId, float hour, float time){
  const vec2 BAY = vec2(3.0, 2.75);
  vec2 cell = floor(uv/BAY), f = fract(uv/BAY)*BAY;
  vec2 lo = vec2(.75,.85), hi = vec2(2.25,2.35);                      // 1.5×1.5 m, sill 0.85
  float glass = step(lo.x,f.x)*step(f.x,hi.x)*step(lo.y,f.y)*step(f.y,hi.y);
  float hA = h21(vec2(floor(cell.x/2.), cell.y) + wallId*7.31);        // apartment (2 bays)
  float hR = h21(cell + wallId*3.17 + .5);                              // room
  float t = hour < 12. ? hour + 24. : hour;                             // 12..36
  float eve  = step(16.5 + 5.*hR, t)*step(t, 22. + 5.*hA*hA + hR)*step(.12, hA); // 12% empty flats
  float morn = step(30., t)*step(t, 32.5 + hR)*step(.55, hR);           // 06:00–08:30
  float k = h21(cell.yx + wallId);
  vec3 c = k<.70 ? vec3(1.,.55,.20) : k<.82 ? vec3(1.,.80,.55) : k<.90 ? vec3(.85,.30,.12)
         : vec3(.35,.45,1.)*(.4+.6*h21(vec2(floor(time*.7+k*10.), k)));  // TV "scene cuts"
  vec2 w = (f-lo)/(hi-lo);
  float vig = smoothstep(0.,.25,w.x)*smoothstep(1.,.75,w.x)*mix(.7,1.,w.y); // curtain falloff
  return c*max(eve,morn)*vig*mix(1.2,3.0,hR)*glass;
}
```

- **Facade layouts:** store each series' bay pattern (kitchen, room, stair, loggia) in a small 1D lookup texture indexed by `cell.x % len`.
- **Stair column:** always lit, with a half-floor vertical offset.
- **Distance anti-aliasing:** `a = smoothstep(.3, 1., max(fwidth(uv.x), fwidth(uv.y)))`, then blend toward `avgColor * litFraction * 0.27` (the glass area fraction).
- **Dark glass:** sky color at the reflected direction × Fresnel (about 0.04–0.1).
- **Frost (optional):** `frost = smoothstep(.35,.75, fbm(w*6.)*.6 + (1.-w.y)*.5)`. Frost brightens and blurs the interior light.

### B8. Shadows, cheaply

- **Bake static lamps.** Lamps never move, so at mesh time compute Σ lamp contributions with visibility.
  - Use 3D-DDA (Amanatides & Woo) through the voxel grid.
  - Store the result in a **1 m light volume** (an RGBA8 3D texture), sampled at `p + N*0.5`. This avoids splitting greedy quads.
- **Player capsule shadow** (the long shadow swinging past each lamp):

```glsl
float playerShadow(vec3 wp, vec3 F, vec3 lp){            // F = feet; ground fragment wp
  vec3 H = F + vec3(0., 1.7, 0.);
  vec2 S = lp.xz + (H.xz - lp.xz)*((lp.y - F.y)/(lp.y - H.y)); // head projected to ground
  vec2 pa = wp.xz - F.xz, ba = S - F.xz;
  float u = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.), d = length(pa - ba*u), w = mix(.18,.35,u);
  return mix(.25, 1., smoothstep(w*.6, w, d));            // multiply that lamp's term only
}
```

- **Screen-space contact shadows:** march 12 steps over 0.6 m toward the light in view space. A step is occluded when `0.02 < sceneZ − rayZ < 0.3`. Use this for props under the nearest 1–2 lamps.
- **Cars and benches:** a soft dark quad underneath, offset away from the dominant lamp.

### B9. Footprints that fade

- **Instanced decals:** a `THREE.InstancedMesh` ring buffer of 512 instances.
  - Plane 0.12 × 0.30 m, `polygonOffset` (factor −1, units −4), `depthWrite: false`.
  - Place one per 0.72 m of travel, alternating sides ±0.09 m off the path.
  - Store the spawn time in an instanced attribute `aBorn`.
  - Alpha: `1 − smoothstep(fadeStart, fadeEnd, uTime − aBorn)`.
- **Fade timing:**
  - While snowing: fadeEnd about 300–600 s. Real fill rate is 1–2 cm/h for prints 3–6 cm deep, compressed for the game.
  - **No snowfall: prints never fade.** The player can meet their own old tracks (see anomaly 10).
- **Print look:** a normal map, with the interior darker and bluer. Under sodium light: interior `#9A7860`, snow `#D9A86C`, rim slightly brighter.
- **Alternative:** a top-down "trail" render target (1024² over 64 m, about 6 cm per texel) with toroidal addressing around the player. Stamp prints into it, decay with a ping-pong pass, and sample it in the snow shader for darkening plus normal offset.
- **Pre-baked trails:** worn paths (тропинки) between entrances, the bus stop and the kiosk, baked into the ground texture.

### B10. Extras

- **Snow glints:**
  - Hash cells of 2.5 cm (`floor(wp*40.)`) and keep about 15%.
  - Perturb the normal by the hash and use `pow(max(dot(reflect(-L, n), V), 0.), 400.)`.
  - Fade beyond 15 m.
  - Sparkles then flicker as the camera moves.
- **CCD smear (optional "phone camera" mode):** for each bright lamp on screen, draw an additive 1–2 px vertical line the full screen height.
- **Branch shadows:** project a procedural branch mask from facade floodlights and sway it at about 0.3 Hz.

---

**Sources:**
- [Jechow & Hölker 2019, "Snowglow" (Journal of Imaging)](https://repository.publisso.de/resource/frl:6416512)
- [Atlas Obscura: Snowglow worsens light pollution](https://assets.atlasobscura.com/articles/snowglow-worsens-light-pollution)
- [Sun et al. 2005, analytic single scattering](https://www.cs.columbia.edu/%7ebosun/sig05.htm)
- [Fog notes (Macklin derivation)](https://scrapbox.io/shivaduke-cg/Fog)
- [It's Winter on Steam](https://store.steampowered.com/app/1003360/<strong>_ITS_WINTER)
- [Papaya: It's Winter](https://papaya.rocks/en/news/zycie-na-postsowieckim-blokowisku-tematem-nowej-gry)
- [PANELKI](https://nodal.gg/game/panelki-1836160)
- [Winter Sadness Simulator](https://store.epicgames.com/p/winter-sadness-simulator-50d8f0)
- [Russian Train Trip (SteamSpy)](https://steamspy.com/app/1785440)
- [Paperhead (vgtimes)](https://vgtimes.ru/games/paperhead/)
- [Moscow Times: Moscow December sunshine](https://themoscowtimes.com/news/moscow-gets-6-minutes-of-sunlight-in-december-60192)
- [normacs: smoke-free stair transit balconies](https://www.normacs.info/answers/3902)