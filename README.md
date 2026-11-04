# "The Man Who Lived in an Airport": a 3D animated YouTube Short

A vertical (1080×1920, 30 fps, ~121 s) Zach-D-Films-style animated short about **Mehran Karimi Nasseri**,
who lived in Terminal 1 of Paris–Charles de Gaulle airport from 26 August 1988 until July 2006.
The scenes, characters, animation, cameras and lighting are generated with **Blender 4.5 LTS Python scripting**.

The final video is `output/mehran_nasseri_short.mp4`.

## Story / historical beats (all narrated + captioned)
| Time | Beat |
|---|---|
| 0–10 s | Hook: "This man lived inside an airport. For eighteen years." Born in Iran, 1945 |
| 10–18 s | Belgium grants him refugee status in 1981 (flashback, sepia) |
| 18–28 s | 1988: sets off for England; says his briefcase with his refugee papers was stolen in Paris |
| 28–38 s | Flies to London anyway, is refused entry and sent back; France can't admit or deport him |
| 38–46 s | 26 August 1988: sits down on a bench in Terminal 1, and stays |
| 46–66 s | Daily life: washing/shaving in the restroom, food from airport workers, newspapers, economics, his diary |
| 66–79 s | Sleeping on the red bench; time-lapse of the years passing (day/night cycles, clock, luggage piling up) |
| 79–91 s | 1999: refuses residency papers because they list him as Iranian; wants to be "Sir Alfred Mehran" |
| 91–100 s | Reporters; his story helps inspire Spielberg's *The Terminal* (2004) |
| 100–107 s | 2006: falls ill, is taken to hospital and leaves the airport |
| 107–121 s | Returns in 2022, dies in Terminal 2F on 12 November 2022; the empty red bench |

## Pipeline (`blender_scripts/`)
* `build_char.py` + `charstyle.py`: characters built with **MPFB 2 (MakeHuman)** and CC0/CC-BY MakeHuman assets
  (skin, hair, mustache, clothes), rigged with the default MakeHuman skeleton, plus 52 ARKit face shape keys for
  blinks and expressions. Nasseri gets an olive skin tone, brown eyes, slicked-back dark hair that greys over the
  years (animated shader value), and a mustache.
* `animlib.py`: a key-pose animation toolkit. Poses use character-space axes; channels are interpolated with
  monotone cubic (PCHIP) easing; follow-through lag on the head and wrists; breathing and idle layers; classic
  2-1-4 animator blinks; arm IK with elbow poles; a walk cycle using analytic two-bone leg IK so feet stay planted
  (heel strike, toe-off, hip bob/sway, counter-rotation).
* `set_terminal.py`: a 1980s CDG Terminal 1-inspired concourse (coffered concrete ceiling, flared columns, glass
  façade onto the apron, check-in desks, beam seating with Nasseri's red bench, a split-flap DÉPARTS board animated by
  `board.py`, signage, café, newsstand, Poly Haven props). `sets_extra.py` adds the Belgian office, the Paris "memory"
  set, UK immigration, the restroom, the runway and a generic airliner.
* `shots.py` / `shotkit.py` / `hero.py`: 20 shots in 13 groups, timed to the voiceover; per-shot cameras (DOF and
  handheld noise), crowds with pull-along suitcases, props passed between hands, lighting presets (day, morning,
  night, 2022), clock hands, and a time-lapse.
* `render_anim.py` / `render_all.sh`: Eevee Next renders (CPU / software GL in this environment).
* `post_audio.py`: mixes the voiceover, music (with ducking), ambience and SFX cues exported by the shot builder.
* `post_video.py`: upscale, colour grade per scene (sepia flashbacks, night, 2022), whip, dip and flash transitions,
  time-lapse ghost trails, titles and lower thirds, and word-highlighted captions; encodes to H.264/AAC.

## Voice
Kokoro-82M TTS (Apache-2.0), voice `am_michael`, with phoneme fixes for the names; checked with faster-whisper,
which also supplies the caption word timings.

## Credits / licences
* Characters and clothing: MakeHuman / MPFB community assets (CC0 and CC-BY packs).
* Props, textures, HDRI: Poly Haven (CC0).
* Fonts: Google Fonts (OFL / Apache).
* Music and SFX: see `audio/CREDITS.md`. The music is by Kevin MacLeod (incompetech.com), CC BY 4.0, so the
  attribution text in that file must go in the video description.
