# Animatic renderer — scene authoring guide

The animatic is a timed, fully sound-designed 2D "leica reel" of the whole
film. It renders **every shot in `data/shotlist.json` for exactly its frame
count**, so it is the editorial reference that generated footage is conformed
against.

```
python3 render.py                        # full 240 s animatic + temp audio  -> animatic/gojo_vs_thragg_animatic.mp4
python3 render.py --clean                # no caption overlay
python3 render.py --shots S3             # one sequence (video only)
python3 render.py --sheet S3 --out s3.png    # QA contact sheet: first/middle/last frame of every shot
python3 render.py --still S3-04:12 --out f.png
python3 render.py --ss 1                 # fast draft (no supersampling)
```

## Writing a scene

Each sequence has a module `scenes/seqN.py` exposing `SHOTS = {"S3-01": fn, ...}`.
A shot function receives one `Frame` and draws that frame into it. **It must
be a pure function of the frame.** Do not use global state, wall-clock time or
`random` without a seed. Use `fr.rng`, which is per frame, or
`fr.srng(salt)`, which is stable across the whole shot. Workers render frames
out of order.

```python
from engine import Cam, kf, pulse, EASE, clamp
import env, fx, inserts
from rig import GOJO, THRAGG, P, pose_at, draw_fighter, hand_pos

def s3_04(fr):
    t = fr.t                                   # seconds into the shot (fr.f = frame, fr.n = frames, fr.u = 0..1)
    fr.cam = Cam(x=kf(t, [(0, -2), (1.5, 1)]), y=1.6, zoom=140)    # zoom = px per metre at 1080p
    env.city_street(fr, t_global=fr.gf / 24, state=env.STATE[3])
    pose = pose_at(t, [(0, "g_idle"), (0.4, "g_blue", "snap")])
    G = draw_fighter(fr, GOJO, pose, x=7, y=None, facing=-1, opts={"eyes": "blindfold"})
    fx.blue(fr, -1.0, 3.0, t, r=0.4)
    ...
SHOTS = {"S3-04": s3_04}
```

### World and camera
- **World units are metres. y is up, and the street is at y = 0.** The camera
  always faces NORTH: west is screen-left and east is screen-right. Never
  flip this; it keeps screen direction consistent across the film.
- Geography, at depth d = 1:
  - intersection centre: x = 0
  - traffic-light mast: x = +7, top y = 6.4 (Gojo's perch)
  - west block: x -14 … -60
  - unfinished tower: x 80 … 110, 176 m tall
  - Purple's scar: through the west skyline
- `Cam(x, y, zoom, rot, shake)`:
  - `zoom` is px/m at 1080p. 30 ≈ a 64 m wide view; 140 ≈ 14 m; 400 ≈ 5 m.
  - Animate any parameter with `kf()`.
  - `shake=(dx, dy)` is in px. Use it only for heavy or massive impacts, for
    4–8 frames, and keep it under about 18 px.
- **Depth `d`:** every primitive takes `d` (default 1, the fighters' plane).
  - d > 1 is further away: it moves and scales by 1/d (parallax). d < 1 is
    foreground.
  - `draw_fighter(..., depth=3)` puts a fighter far back.
- Screen-space helpers (`fr.s_rect`, `fr.s_poly`, `fr.s_circle`) use 0..1
  coordinates.

### Environments (`env`)
- `env.city_street(fr, tg, state)`: sky, clouds, skyline, smoke, street,
  crater(s), traffic-light gantry.
- `env.open_sky(fr, tg, state)`: high-altitude view. Set `cam.y` to 100–250.
- `env.rooftops(fr, roof_y, x0, x1)`: a roof surface at the fighters' plane.
- `env.tower_interior(fr, floor_y, broken=0..1)` and
  `env.unfinished_tower(fr, collapse_u=0..1)`.
- `env.STATE[seq]` is the damage set at the START of a sequence. Add flags as
  damage happens inside the sequence, e.g.
  `state = env.STATE[3] | ({"west_smash"} if t > 2.1 else set())`.
- Lighting: dusk, warm rim from screen-left. Pass `lit` < 1 to darken during
  the Purple charge, etc.

### Fighters (`rig`)
- `draw_fighter(fr, GOJO|THRAGG, pose, x, y=None, facing=±1, scale=1, view='side'|'front', opts={...}, depth=1)`.
  - `y=None` snaps the feet to the ground; pass a y to fly or hover.
  - `facing=1` faces east (screen-right).
  - It returns the joints `J`. `hand_pos(J, 'n')` gives the near-hand
    position for attaching effects.
- Poses: see `POSES` in `rig.py` (`g_*` Gojo, `t_*` Thragg, plus shared ones).
  - Blend over time with
    `pose_at(t, [(t0, name), (t1, name2, ease), ...])`.
  - Override single angles with `P('t_punch', lean=30)`.
  - Eases: `snap` for strikes, `slam` for impacts, `inout`, `out`, `in`,
    `hold`, `step`.
- `opts`:
  - Gojo: `eyes` 'blindfold' | 'open' | 'narrow'; `hair_down` True once the
    blindfold is off; `mouth` 'smirk' | 'flat'.
  - Thragg: `eyes` 'cold' | 'wide'.
  - `injuries`: list of tags. **These must match the shot list's continuity
    ledger.**
- **Infinity is never drawn as a shield.** Use `fx.infinity()` (refraction)
  plus `fx.suspended_dust()` / `fx.zeno_particles()` (things slowing and
  hanging), and stop the fist short of Gojo using `fx.zeno()` for the
  remaining distance.

### Close-ups (`inserts`)
- `gojo_face(fr, cu, cv, s, expr, eyes, injuries, flip, bg)`
- `gojo_eye_ecu(fr, t, open_u, glow, narrow)`
- `thragg_face(fr, cu, cv, s, expr, injuries, flip, bg)`
- `thragg_eyes_ecu(fr, mood, t, injuries)`
- `thragg_fist(fr, cu, cv, s, rot, flip)`
- `gojo_hand_sign(fr, cu, cv, s, sign='domain'|'point', glow)`
- `inserts._bg(fr, top, bottom)` paints a soft background.

### Effects (`fx`)
Each technique has exactly one grammar (see docs/09-vfx-bible.md):

| Technique | Functions |
|---|---|
| Infinity | `infinity`, `suspended_dust`, `zeno_particles`, `zeno` |
| Blue | `blue`, `pull` |
| Red | `red_charge`, `red_release` |
| Purple | `purple_charge`, `purple_orb`, `purple_channel` |
| Domain | `domain_void` (interior, screen space), `domain_transition`, `domain_dome` (exterior) |
| Impacts | `impact(kind='light'|'heavy'|'massive'|'blocked')`, `shockwave`, `sonic_boom`, `debris`, `dust_cloud`, `glass_shatter`, `cracks` |
| Motion | `speed_lines`, `trail` |
| Other | `rct_heal`, `aura`, `gather`, `blood`, `blood_trail` |

Frame-level post effects (set on `fr`):
- `fr.flash` 0..1: white flash.
- `fr.invert` 0..1: anime impact frame. Use it on 1–2 frames, only for the
  heaviest contacts.
- `fr.blur_dir=(dx, dy)`: smear.
- `fr.letterbox`: 0..1.
- `fr.tint=(r, g, b, a)`.
- `fr.vignette`.

### Rules
1. **Timing comes from the shot list.** Never assume a shot length: use
   `fr.n` / `fr.dur` and keyframe in seconds or as a fraction of `fr.dur`.
2. **Continuity:**
   - A shot starts where the previous shot's `continuity_out` left both
     characters: position, facing, eyes, injuries.
   - Injuries never vanish.
   - City damage only accumulates.
3. **Screen direction:**
   - Thragg starts west (left) of Gojo.
   - When he attacks Gojo he moves left to right, unless the shot list says
     he has circled around.
4. Keep everything readable: big clear silhouettes and one focal action per
   shot. Effects support the action and never bury the characters.
