# Animations

There are 148 clips on the shared `pubg_m55` skeleton. Read `/assets/characters/README.md` for usage, sockets and gaps.
`manifest.json` has the full metadata for each clip: `speed_mps`, `move_dir` [right, forward], `root_displacement`,
`yaw_change_deg`, `facing_deg`, `hips_y_mean`/`head_y_mean`, `notes`, and the source and license per clip.

| file | clips | size |
|---|---|---|
| locomotion.glb | 31 | 1.09 MB |
| rifle.glb | 55 | 1.48 MB |
| pistol.glb | 17 | 0.38 MB |
| actions.glb | 45 | 2.07 MB |

These files contain skeleton nodes only (no mesh). Clips bind by joint name to any character in `/assets/characters/`.
The tracks are joint quaternions plus the Hips translation, at 30 fps. Mode `loco` means in place: play it at
`timeScale = speed / speed_mps`. Mode `oneshot` keeps root motion (see `root_displacement`). Mode `inplace` means looping in place.
Mode `static` means a held pose, sometimes with procedural breathing. Mode `keep` means looping with the source root
motion (ladders, which are in place).


## Locomotion (unarmed, swim, jump) — `locomotion.glb`

| clip | mode | loop | dur s | speed m/s | source | notes |
|---|---|---|---|---|---|---|
| `idle` | inplace | y | 6.67 |  | RPM |  |
| `walk_f` | loco | y | 1.00 | 1.49 | RPM |  |
| `walk_b` | loco | y | 2.80 | 1.27 | RPM |  |
| `walk_l` | loco | y | 0.93 | 1.661 | Mixamo |  |
| `walk_r` | loco | y | 1.03 | 1.476 | Mixamo |  |
| `jog_f` | loco | y | 0.73 | 3.201 | RPM |  |
| `jog_b` | loco | y | 0.63 | 2.81 | RPM |  |
| `jog_l` | loco | y | 0.67 | 3.852 | Mixamo |  |
| `jog_r` | loco | y | 0.67 | 3.852 | Mixamo |  |
| `run_f` | loco | y | 0.63 | 5.044 | Mixamo | fast run between jog_f and sprint_f |
| `sprint_f` | loco | y | 0.60 | 5.153 | RPM |  |
| `crouch_idle` | inplace | y | 2.53 |  | Mixamo |  |
| `crouch_walk_f` | loco | y | 1.67 | 1.611 | RPM |  |
| `crouch_walk_b` | loco | y | 1.80 | 1.395 | RPM |  |
| `crouch_walk_l` | loco | y | 1.27 | 0.903 | Mixamo |  |
| `crouch_walk_r` | loco | y | 1.10 | 0.96 | Mixamo |  |
| `stand_to_crouch` | oneshot |  | 0.63 |  | Mixamo | moves R+0.01 U-0.37 F-0.16 m; turns +53° |
| `crouch_to_stand` | oneshot |  | 0.63 |  | Mixamo | moves R-0.01 U+0.37 F+0.25 m; turns -53° |
| `prone_idle` | inplace | y | 4.93 |  | Mixamo |  |
| `prone_crawl_f` | loco | y | 2.33 | 0.207 | Mixamo |  |
| `prone_crawl_b` | loco | y | 1.90 | 0.187 | Mixamo |  |
| `prone_turn_l` | oneshot |  | 1.03 |  | Mixamo |  |
| `prone_turn_r` | oneshot |  | 1.33 |  | Mixamo |  |
| `jump_start` | oneshot |  | 0.60 |  | Mixamo | standing jump take-off; feet leave the ground at the end |
| `fall_loop` | inplace | y | 0.70 |  | Mixamo | upright fall, arms up |
| `land` | oneshot |  | 0.90 |  | Mixamo | feet touch down ~0.1 s into the clip; moves R-0.04 U-0.36 F+0.03 m |
| `swim_idle` | inplace | y | 3.00 |  | Mixamo |  |
| `swim_f` | loco | y | 4.53 | 1 | Mixamo | in-place source; speed_mps is a nominal value (front crawl) |
| `swim_b` | loco | y | 3.00 | 0.6 | Mixamo | treading water (no dedicated back-swim clip); nominal speed |
| `swim_l` | loco | y | 3.00 | 0.6 | Mixamo | treading water (no dedicated side-swim clip); nominal speed |
| `swim_r` | loco | y | 3.00 | 0.6 | Mixamo | treading water (no dedicated side-swim clip); nominal speed |

## Rifle — `rifle.glb`

| clip | mode | loop | dur s | speed m/s | source | notes |
|---|---|---|---|---|---|---|
| `rifle_idle` | inplace | y | 8.60 |  | Mixamo | relaxed low-ready |
| `rifle_idle_ready` | inplace | y | 2.10 |  | Mixamo | weapon raised (same hold as the rifle locomotion clips) |
| `rifle_aim` | inplace | y | 2.10 |  | Mixamo |  |
| `rifle_aim_up` | static | y | 1.00 |  | Mixamo | barrel 55 deg up; blend with rifle_aim / rifle_aim_down by camera pitch |
| `rifle_aim_down` | static | y | 1.00 |  | Mixamo | barrel 55 deg down |
| `rifle_walk_f` | loco | y | 1.00 | 1.649 | Mixamo |  |
| `rifle_walk_b` | loco | y | 1.00 | 1.655 | Mixamo |  |
| `rifle_walk_l` | loco | y | 1.00 | 1.649 | Mixamo |  |
| `rifle_walk_r` | loco | y | 1.00 | 1.649 | Mixamo |  |
| `rifle_walk_fl` | loco | y | 1.00 | 1.649 | Mixamo |  |
| `rifle_walk_fr` | loco | y | 1.00 | 1.649 | Mixamo |  |
| `rifle_walk_bl` | loco | y | 1.00 | 1.649 | Mixamo |  |
| `rifle_walk_br` | loco | y | 1.00 | 1.649 | Mixamo |  |
| `rifle_jog_f` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_jog_b` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_jog_l` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_jog_r` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_jog_fl` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_jog_fr` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_jog_bl` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_jog_br` | loco | y | 0.50 | 4.123 | Mixamo |  |
| `rifle_aim_walk_f` | loco | y | 1.37 | 0.852 | Mixamo | walking while aiming down sights (weapon levelled forward) |
| `rifle_fire_walk_f` | loco | y | 1.00 | 1.325 | Mixamo | walking while firing |
| `rifle_sprint` | loco | y | 0.50 | 6.185 | Mixamo |  |
| `rifle_sprint_fl` | loco | y | 0.50 | 6.185 | Mixamo |  |
| `rifle_sprint_fr` | loco | y | 0.50 | 6.185 | Mixamo |  |
| `rifle_crouch_idle` | inplace | y | 2.10 |  | Mixamo |  |
| `rifle_crouch_aim` | inplace | y | 2.00 |  | Mixamo |  |
| `rifle_crouch_walk_f` | loco | y | 1.00 | 1.75 | Mixamo |  |
| `rifle_crouch_walk_b` | loco | y | 1.00 | 1.75 | Mixamo |  |
| `rifle_crouch_walk_l` | loco | y | 1.03 | 1.692 | Mixamo |  |
| `rifle_crouch_walk_r` | loco | y | 1.00 | 1.75 | Mixamo |  |
| `rifle_crouch_walk_fl` | loco | y | 1.00 | 1.75 | Mixamo |  |
| `rifle_crouch_walk_fr` | loco | y | 1.00 | 1.75 | Mixamo |  |
| `rifle_crouch_walk_bl` | loco | y | 1.00 | 1.75 | Mixamo |  |
| `rifle_crouch_walk_br` | loco | y | 1.00 | 1.75 | Mixamo |  |
| `rifle_turn_l` | oneshot |  | 1.00 |  | Mixamo | turns +90° |
| `rifle_turn_r` | oneshot |  | 1.00 |  | Mixamo | turns -90° |
| `rifle_crouch_turn_l` | oneshot |  | 1.27 |  | Mixamo | turns +90° |
| `rifle_crouch_turn_r` | oneshot |  | 1.23 |  | Mixamo | turns -90° |
| `rifle_reload` | oneshot |  | 3.30 |  | Mixamo |  |
| `rifle_crouch_reload` | oneshot |  | 6.87 |  | Mixamo |  |
| `rifle_fire` | oneshot |  | 0.27 |  | Mixamo | single shot recoil from the aim pose (0.27 s); play as upper-body overlay |
| `rifle_crouch_fire` | oneshot |  | 1.03 |  | Mixamo |  |
| `rifle_prone_idle` | inplace | y | 4.93 |  | Mixamo |  |
| `rifle_prone_aim` | static | y | 3.00 |  | Mixamo | prone aim (weapon heading exactly forward, ~9 deg muzzle-up like the source) |
| `rifle_prone_fire` | oneshot |  | 0.43 |  | Mixamo |  |
| `rifle_prone_reload` | oneshot |  | 6.40 |  | Mixamo |  |
| `rifle_kneel_to_prone` | oneshot |  | 1.97 |  | Mixamo |  |
| `rifle_prone_to_kneel` | oneshot |  | 1.97 |  | Mixamo |  |
| `rifle_equip` | oneshot |  | 2.03 |  | Mixamo | rifle brought up from the hip/sling into a low-ready (blend into rifle_idle / rifle_idle_ready) |
| `rifle_jump_start` | oneshot |  | 0.53 |  | Mixamo |  |
| `rifle_fall_loop` | inplace | y | 0.97 |  | Mixamo |  |
| `rifle_land` | oneshot |  | 0.67 |  | Mixamo |  |
| `rifle_hit_react` | oneshot |  | 0.43 |  | Mixamo |  |

## Pistol — `pistol.glb`

| clip | mode | loop | dur s | speed m/s | source | notes |
|---|---|---|---|---|---|---|
| `pistol_idle` | inplace | y | 4.00 |  | Mixamo | two-handed low ready |
| `pistol_aim` | inplace | y | 1.33 |  | Mixamo |  |
| `pistol_aim_up` | static | y | 1.00 |  | Mixamo | barrel 55 deg up |
| `pistol_aim_down` | static | y | 1.00 |  | Mixamo | barrel 55 deg down |
| `pistol_fire` | static |  | 0.30 |  | Mixamo+proc. | procedural recoil kick on top of pistol_aim (upper-body overlay) |
| `pistol_fire_alt` | oneshot |  | 1.17 |  | Mixamo | Mixamo "Pistol Shooting" (arms fully extended) |
| `pistol_reload` | oneshot |  | 1.67 |  | UAL (CC0) |  |
| `pistol_draw` | oneshot |  | 2.00 |  | Mixamo | draw from the right hip into pistol_aim |
| `pistol_walk_f` | loco | y | 0.80 | 2.282 | Mixamo |  |
| `pistol_walk_b` | loco | y | 1.03 | 1.255 | Mixamo |  |
| `pistol_walk_l` | loco | y | 0.57 | 1.924 | Mixamo |  |
| `pistol_walk_r` | loco | y | 0.60 | 2.16 | Mixamo |  |
| `pistol_run_f` | loco | y | 0.73 | 2.696 | Mixamo | running while aiming |
| `pistol_run_b` | loco | y | 0.53 | 2.948 | Mixamo | running backwards while aiming |
| `pistol_sprint` | loco | y | 0.50 | 4.243 | Mixamo | weapon lowered |
| `pistol_crouch_aim` | inplace | y | 3.80 |  | Mixamo |  |
| `pistol_crouch_walk_f` | loco | y | 1.67 | 1.611 | RPM+Mixamo | RPM crouch walk legs + pistol_aim upper body (layered from Spine1), weapon levelled |

## Actions, deaths, hits, traversal, vehicles, air — `actions.glb`

| clip | mode | loop | dur s | speed m/s | source | notes |
|---|---|---|---|---|---|---|
| `death_f` | oneshot |  | 2.97 |  | Mixamo | falls forward (shot from behind); moves R-0.23 U-0.65 F+0.98 m |
| `death_b` | oneshot |  | 2.60 |  | Mixamo | falls backward; moves R+0.23 U-0.62 F-0.80 m; turns +133° |
| `death_l` | oneshot |  | 3.30 |  | Mixamo | falls to the left (shot from the right); moves R-0.75 U-0.66 F-0.09 m; turns +70° |
| `death_r` | oneshot |  | 3.30 |  | Mixamo | mirror of death_l: falls to the right; moves R+0.75 U-0.66 F-0.09 m; turns -70° |
| `death_f_alt` | oneshot |  | 3.43 |  | Mixamo | doubles over, falls forward; moves R-0.23 U-0.65 F+0.91 m; turns -26° |
| `death_headshot_f` | oneshot |  | 3.70 |  | Mixamo | falls forward; moves R+0.05 U-0.66 F+0.84 m; turns +152° |
| `death_headshot_b` | oneshot |  | 2.83 |  | Mixamo | falls backward/sideways; moves R+0.26 U-0.72 F-0.22 m; turns -38° |
| `death_crouch` | oneshot |  | 1.90 |  | Mixamo | moves R+0.12 U-0.28 F+0.83 m; turns +142° |
| `death_prone` | oneshot |  | 1.87 |  | Mixamo | turns -84° |
| `knocked_idle` | static | y | 3.00 |  | Mixamo | frame of knocked_crawl with breathing |
| `knocked_crawl` | loco | y | 1.83 | 0.48 | Mixamo | hands-and-knees crawl |
| `hit_react_f` | oneshot |  | 2.60 |  | Mixamo | hit in the torso from the front; in place |
| `hit_react_b` | oneshot |  | 1.00 |  | Mixamo | hit from behind; staggers ~1 m forward (root_displacement); moves R+0.00 U+0.00 F+1.13 m |
| `hit_react_l` | oneshot |  | 1.83 |  | Mixamo | hit on the left side; in place |
| `hit_react_r` | oneshot |  | 1.67 |  | Mixamo | hit on the right side; in place |
| `hit_stagger_f` | oneshot |  | 1.00 |  | Mixamo | big hit from the front; staggers ~1 m back (root_displacement); moves R+0.00 U+0.00 F-1.17 m |
| `hit_stagger_l` | oneshot |  | 1.00 |  | Mixamo | big hit from the left; staggers right; moves R+0.76 U+0.00 F+0.00 m |
| `hit_stagger_r` | oneshot |  | 1.00 |  | Mixamo | big hit from the right; staggers left; moves R-0.76 U+0.00 F+0.00 m |
| `hit_react_head` | oneshot |  | 1.43 |  | Mixamo | in place |
| `throw_grenade` | oneshot |  | 2.20 |  | Mixamo | overhand throw, release at ~0.75 s (right hand) |
| `melee_swing` | oneshot |  | 2.40 |  | Mixamo | one-handed horizontal swing (weapon in the right hand) |
| `melee_swing_unarmed` | oneshot |  | 2.40 |  | Mixamo | right-hand horizontal swing |
| `punch_r` | oneshot |  | 1.00 |  | UAL (CC0) |  |
| `punch_l` | oneshot |  | 0.87 |  | UAL (CC0) |  |
| `use_item` | oneshot |  | 1.70 |  | Mixamo | both hands working at belly height (bandage / kit); turns -44° |
| `drink` | oneshot |  | 4.50 |  | Mixamo | bottle in the LEFT hand; drinks 0.5-4.0 s |
| `pickup` | oneshot |  | 2.00 |  | Mixamo | right hand reaches the floor at ~0.9 s |
| `interact_door` | oneshot |  | 6.20 |  | Rocketbox (MIT) |  |
| `interact` | oneshot |  | 3.23 |  | Mixamo | press a button / switch at chest height |
| `vault` | oneshot |  | 1.17 |  | Mixamo | running speed vault over a ~1 m obstacle (see root_displacement); moves R-0.01 U+0.01 F+4.35 m; turns +32° |
| `climb` | oneshot |  | 2.57 |  | Mixamo | jump-grab-pull-up onto a ~1.7 m ledge (see root_displacement); moves R+0.00 U+1.41 F+0.34 m |
| `climb_low` | oneshot |  | 1.93 |  | Mixamo | mantle onto a ~0.7 m ledge (see root_displacement); moves R+0.20 U+0.58 F+0.80 m; turns +88° |
| `ladder_up` | keep | y | 0.77 |  | Mixamo | in place; move the character up at ~0.65 m/s (one rung ~0.26 m per half cycle) at timeScale 1 |
| `ladder_down` | keep | y | 0.77 |  | Mixamo | ladder_up reversed; move down at ~0.65 m/s |
| `ladder_idle` | static | y | 2.00 |  | Mixamo |  |
| `revive_teammate` | oneshot |  | 5.20 |  | UAL (CC0) |  |
| `drive_sit` | inplace | y | 5.00 |  | Mixamo |  |
| `car_enter` | oneshot |  | 5.47 |  | Mixamo | driver side: step in, turn ~95 deg and sit (ends in drive_sit; see root_displacement / yaw_change_deg); moves R+0.13 U-0.13 F+1.65 m; turns +97° |
| `car_exit` | oneshot |  | 5.80 |  | Mixamo | from drive_sit: turn and step out to the left; moves R-1.68 U+0.13 F+0.18 m; turns +87° |
| `passenger_sit` | inplace | y | 1.67 |  | UAL (CC0) |  |
| `injured_idle` | inplace | y | 11.73 |  | Mixamo |  |
| `injured_walk_f` | loco | y | 2.07 | 0.902 | Mixamo |  |
| `freefall` | inplace | y | 4.50 |  | Mixamo | skydiving: body horizontal, face down |
| `parachute_hang` | inplace | y | 4.73 |  | Mixamo | alternative parachute pose: hanging with both hands up on the risers |
| `parachute_idle` | static | y | 4.00 |  | authored | hanging under canopy, hands on the brake toggles |

## Licenses (summary)

- **Mixamo** (Adobe): free for use in projects, no standalone redistribution. The FBX files were taken from public
  GitHub projects, listed in `tools/assets/characters/anim_sources.tsv`. Re-download them from mixamo.com before release.
- **RPM**: Ready Player Me animation library (intended for RPM avatars). Used for idle, walk_f/b, jog_f/b, sprint_f and
  crouch_walk_f/b. Review this before release.
- **UAL**: Quaternius Universal Animation Library, CC0. **Rocketbox**: MIT. **authored**: generated by `retarget.mjs`.

