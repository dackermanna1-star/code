# Engine & Content Conventions

Everything is plain browser JavaScript (no build step needed to *run* the game,
no ES modules) so `index.html` works from `file://`, GitHub Pages, or the
published artifact. The only build step compiles the Ink script to
`js/story.js` (`npm run build`).

```
index.html            page shell (full document; tools/build.mjs derives the artifact page)
js/vendor/ink.js      inkjs runtime (fallback if the CDN is unreachable)
js/story.js           compiled Ink story  -> window.STORY_JSON   (generated)
js/art/kit.js         SVG helpers + palette + ART registry       -> window.KIT, window.ART
js/art/bg_*.js        backgrounds  (each file registers several)
js/art/cg.js          full-screen event illustrations
js/art/portraits.js   portrait system + every character
js/audio.js           procedural music / ambience / sfx          -> window.SND
js/data.js            journal text: people, clues, tapes, places -> window.DATA
js/freeform.js        "say something else": Claude + offline fallback
js/engine.js          the visual-novel runtime
story/*.ink           the script
tools/build.mjs       compile Ink, emit js/story.js and dist/artifact.html
tools/playtest.mjs    random-walk every branch, report errors + word counts
tools/shoot.mjs       Playwright screenshots of art for review
```

## Art registry (`js/art/kit.js`)

```js
ART.bg(id, {
  times: ['day', 'dusk', 'night'],          // first entry is the default
  light: { night: 'interior_lamp' },        // optional: map time -> KIT.LIGHT preset
  draw(o) { return '<svg-inner-markup/>'; } // o = {time, variant, W:1600, H:900, id, rng}
});
ART.cg(id, { draw(o) { ... } });            // same signature, o.variant optional
ART.char(id, { name, draw(o) { ... } });    // o = {expr, outfit, id}; 600x900 canvas
```

- `o.id('sky')` returns a per-render unique id. **Every** `id=` / `url(#…)` in a
  drawing must go through it: two renders of the same background are on screen
  together during crossfades.
- `o.rng` is a seeded RNG (`() => [0,1)`) seeded from the background id, so a
  drawing is identical every time it renders.
- Return only the inner markup; the engine wraps it in
  `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">`.
  Because of `slice`, phones crop the sides: keep essentials in x 250–1350.
- No `<filter>` blur/turbulence in backgrounds (slow on phones). Gradients,
  opacity and `mix-blend-mode` are fine.

## Ink script conventions

Lines the runtime understands:

| Line | Meaning |
|---|---|
| `Plain text.` | Narration (second person, present tense). |
| `TEDDY: Text.` / `TEDDY(grin): Text.` | Dialogue; optional expression. Speaker keys are upper-case character ids. |
| `GUS(smirk): Text.` | Gus speaking (her face appears in the dialogue box). |
| `THINK: Text.` | Gus's private thought (italic). |
| `TAPE(june): Text.` | Recorded voice played back from a cassette. |
| `PHONE(dad): Text.` | Voice on the telephone. |
| `RADIO: Text.` | Voice in radio static. |
| `@command args` | Runtime command (never displayed). |

Commands:

```
@bg <id> [time] [variant] [fade|cut|flash|slow|glitch]
@show <char> [expr] [left|center|right|farleft|farright] [outfit]
@expr <char> <expr>
@hide <char>|all
@music <id>|stop          @amb <id>|stop          @sfx <id>
@weather rain|leaves|fog|none
@chapter <n> :: <Title> :: <date line>
@date <text>                       small time/place card
@cg <id> [variant] | @cg off
@fx shake|flash|glitch|pulse|blackout|redout|heartbeat|lights_out
@wait <seconds>
@ctx <one-sentence situation summary for free-text replies>
@clue <id>   @tape <id>   @remember <char> [short note]
@theory <id>                       records the theory Gus just chose
@map                               next choice set renders on the Derry map
@save                              autosave checkpoint
@end                               end-of-episode summary
```

Choices put their tags **inside** the brackets (ink 1.1 choice tags):

```
* ["Mostly eggs is my favorite kind of eggs." #joke]
* [(Say nothing.) #silent]
* {Clues ? locker_initials} ["Who's J.B.?" #ask #clue]
```

- Quoted choice text is spoken aloud by Gus (the runtime echoes it as her line).
  Unquoted text is an action and is not echoed.
- Tone tags drive the card label and Gus's personality tracking:
  `friendly joke sarcastic shy blunt confront manipulate kind ask probe deflect
  honest lie flirt silent leave action look go record`.
- Flow tags: `#timed:8` (on any choice in the set: a countdown; the choice
  tagged `#default` is taken when time runs out), `#nofree` (no write-your-own
  card for this set), `#clue` (shows the clue badge), `#map:<place>` (pin
  location on the hub map).
- Any set with two or more choices and no `#nofree`/`#timed` gets a
  **"Say something else…" / "Do something else…"** card. The player's own words
  are shown as Gus's line, an in-character reaction is written by Claude when
  the page can reach it, and the story continues down the closest scripted
  branch. Write the first line after a choice so it answers the choice's
  *intent*, not its exact wording.

Personality: the runtime increments these Ink variables from tone tags, so the
script can react to who Gus has become:
`t_warm` (friendly, kind, flirt), `t_funny` (joke, sarcastic), `t_bold`
(blunt, confront), `t_careful` (shy, silent, deflect, leave), `t_sly`
(manipulate, lie), `t_honest` (honest), `t_curious` (ask, probe, look).

## Audio (`js/audio.js`) — `window.SND`

```js
await SND.init()                 // must be called from a user gesture
SND.setVolume('master'|'music'|'ambience'|'sfx', 0..1)
SND.music(id|null, {fade:2})     // crossfading generative loops
SND.ambience(id|null, {fade:2})  // environmental bed
SND.weather('rain'|'wind'|null)  // extra layer over ambience
SND.sfx(id, {volume})            // one-shots
SND.tape(true|false)             // cassette hiss + wow/flutter layer
SND.voice(seconds, kind)         // murmur that reads as distant speech on tape: 'girl'|'boy'|'man'|'woman'|'old'
SND.heartbeat(bpm|null)
SND.duck(amount, seconds)
SND.stopAll()
```

Music: `title larch school town barrens mystery tension horror quiet festival warm june sad end`
Ambience: `rain rain_car night wind house school cafeteria classroom hum boiler diner records library creek hill canal festival quiet town attic static`
SFX: `click select hover page notify clue door_open door_close door_knock window_knock footsteps car_door bell locker phone_ring phone_pickup phone_hangup tape_play tape_stop tape_rewind tape_insert record_start static_burst radio_tune thunder heartbeat whisper breath light_switch lantern lights_out bike_bell paper typewriter wind_gust splash match sting`
