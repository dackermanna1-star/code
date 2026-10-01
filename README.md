# Cursed Arts: Gojo vs Sukuna

A 2D arcade fighting game inspired by Jujutsu Kaisen, made for personal use. Everything is
generated in code: the pixel-art characters, the effects, the arena, the music, the sound effects
and the voice. There are no image or audio files.

> **Gojo controls space. Sukuna controls destruction.**

## How to play

Open `index.html` in a desktop browser (Chrome, Edge or Firefox). You don't need a server or a
build step. Double-clicking the file works.

- Keyboard for one or two players. Gamepads are supported too (standard mapping).
- Press **F4** for fullscreen and **F3** to show the FPS counter.
- Voice lines use your browser's speech synthesis, so they need system voices. Subtitles are always
  shown. You can switch voices off, or change the language to Japanese, under **Options**.

Some URL shortcuts for jumping straight into a match:

```
index.html?play=versus                      2 players
index.html?play=arcade&level=hard           vs CPU (easy|normal|hard|extreme|boss)
index.html?play=training&p1=sukuna          training mode
index.html?play=watch&level=boss            CPU vs CPU
```

## Controls

|               | Player 1 (keyboard) | Player 2 (keyboard) | Gamepad      |
|---------------|---------------------|---------------------|--------------|
| Move          | W A S D             | Arrow keys          | D-pad / stick |
| Light (L)     | J                   | Num1 or `,`         | X            |
| Medium (M)    | K                   | Num2 or `.`         | Y            |
| Heavy (H)     | L                   | Num3 or `/`         | RB           |
| Special (SP)  | U                   | Num4 or `;`         | A            |
| Super (SU)    | I                   | Num5 or `'`         | B            |
| Unique (UN)   | O                   | Num6 or `[`         | RT           |
| Throw (L+M)   | H                   | Num0                | LB           |
| Parry (M+H)   | Y                   | Num .               | LT           |
| Dash          | Space or →→         | R-Shift or →→       | L3 or →→     |
| Pause         | Esc / Enter         | Num Enter           | Start        |

The full move lists are under **Move List**, which you can open from the main menu or the pause
menu. Motions are written for a character facing right.

## Systems

- **Combat.** Each character has light, medium and heavy normals that chain into specials, then
  supers, then ultimates. You get launchers, jump-cancel air combos, ground and wall bounces, wall
  splats, counter hits, punish counters, throws and throw escapes. Knockdowns lead to a quick
  recovery or a wake-up with invincibility frames.
- **Defense.** Hold back to block, and block low or high as needed. A *Perfect Guard* means
  starting your block just before the hit: there's no chip damage, you gain meter and you get frame
  advantage back. *Parry* (M+H) is risky but rewarding. Blocking too much drains your guard gauge
  until you suffer a *Guard Break*.
- **Damage scaling** keeps combos fair: there's a juggle limit, hit-stun decays over long combos and
  gravity gets heavier. No combo goes on forever.
- **Cursed Energy (CE)** has 3 levels. Enhanced specials cost 50, supers cost 100 and ultimates
  cost 200–300.
- **Domain gauge.** It fills during the round. Expanding a domain costs 200 CE plus a full gauge.
  Afterwards your technique *burns out* for a few seconds.
- **RCT.** Part of the damage you take is recoverable health that slowly regenerates.
- **Black Flash.** Cancel into a heavy on the exact frame the hit-stop ends. It deals 2.5x damage
  and gives you a big CE boost. Mashing won't trigger it.

### Gojo: Limitless
- **Infinity (UN).** A toggle that drains its own gauge. Attacks crawl to a stop before they reach
  him and projectiles freeze in place. Blocking hits uses up the gauge, and if it empties, Infinity
  *breaks*. Three things go straight through it: Domain Amplification, World Cutting Slash and the
  Malevolent Shrine's sure-hit.
- **Blue**: an orb, a pull, a crush, a movement rush and a counter. **Red**: a shot, a launcher, an
  invincible burst, a counter and **Maximum Output**.
- **Hollow Purple** (→↓↘ + SU, hold to charge). It has three levels and Level 3 is a full cinematic.
  The charge leaves Gojo exposed, and Infinity is suspended while he charges.
- **Unlimited Void.** The opponent is immobilized. They can mash to resist, or spend 100 CE on
  *Simple Domain*. The damage dealt during the domain is capped.

### Sukuna: Shrine
- **Dismantle** comes as single, double, charged, air and cross slashes. **Cleave** comes as normal,
  grab, counter and enhanced versions.
- **Fuga** (↓↓ + SP, hold to charge). It has three levels. Landing Dismantle and Cleave hits builds
  *Kindling*, which makes Fuga charge faster and hit harder.
- **World Cutting Slash** (→↓↘ + SU). Sukuna chants "Dragon Scale. Recoil. Twin Meteors." and the
  aim line is visible the whole time. Hold ↑ or ↓ to aim. The slash bypasses Infinity, but you can
  interrupt him or dodge it.
- **Malevolent Shrine.** An open domain that rains sure-hit slashes and makes Sukuna faster and
  stronger. You have to survive it.
- **Domain Amplification (UN).** His attacks pierce Infinity, but he can't use his techniques while
  it's active.

### Domain Clash
If both players expand a domain at the same time, you get a split-screen clash. Over three rounds,
press any attack when the rings line up. The more precise player's domain wins.

## Modes
Arcade (vs CPU), Versus, CPU vs CPU and Training. The CPU has 5 tiers: Easy, Normal, Hard, Extreme
and Boss. Training mode gives you infinite health and meter, hitbox display, frame data and a frame
meter. It also shows combo damage and lets you set the dummy to stand, crouch, jump, block or play
as a CPU. You can record and play back inputs, and reset positions.

## Development

```
node tools/bundle.js               # build dist/cursed-arts.html (single self-contained file)
node tools/sim.js 20 hard          # headless CPU-vs-CPU balance & crash test
node tools/motion-test.js          # deterministic input / motion recognition tests
node tools/combo-test.js           # verifies core combo routes connect
node tools/domain-test.js          # domain activation / burnout / interruption / clash
node tools/reach.js                # move reach & frame data table
node tools/scenario.js purple out  # browser screenshots of a scripted scenario (Playwright)
```

Code layout: `src/engine` holds the rasterizer, rig/IK, input, FX, camera, font and audio.
`src/game` holds the fighter, combat, the characters, domains, the stage, the HUD, the AI and
training mode. `src/ui` holds the menus.
