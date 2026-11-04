"""Builds the complete animated short in Blender 4.5 from timeline.json.
Run:  blender -b --factory-startup -P 02_build_scene.py -- <out.blend> [preview]"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector, Matrix
from bl_lib import *
from bl_character import *
import bl_sets as SETS
from bl_sets import CW, CD, CH, DOOR_W, DOOR_H, HALL_Z, HALL_Y, STAIR_X, SHAFT_FRONT
from shots import SHOT, SHOTS, EV, W, B0, B1, FRAME_END, FPS

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, "build", "elevator.blend")
random.seed(7)

reset()
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, FRAME_END
sc.render.fps = FPS

C_SET = coll("Sets")
C_CHAR = coll("Characters")
C_CAM = coll("Cameras")
C_FX = coll("FX")
C_LIGHT = coll("Lights")


def S(name):
    return SHOT[name]


# ===================================================================== world / render
world = D.worlds.new("World")
sc.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.004, 0.005, 0.008, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

# ===================================================================== sets
set_coll(C_SET)
M = SETS.materials()
CAR = empty("CAR", (0, 0, 0), size=0.5)
car = SETS.build_car(M, CAR)
shaft = SETS.build_shaft(M)
hall = SETS.build_hallway(M)
stair = SETS.build_stairwell(M)


def car_z(f):
    if f <= EV["slam"]:
        t = (f - 1) / (EV["slam"] - 1)
        return 10.0 * (1 - t ** 1.7)
    if f >= S("S1_ding")[0]:
        return HALL_Z
    return 0.0


for f in range(1, EV["slam"] + 1, 3):
    kf(CAR, "location", f, (0, 0, car_z(f)), interp='LINEAR')
kf(CAR, "location", EV["slam"], (0, 0, 0), interp='LINEAR')
kf(CAR, "location", EV["slam"] + 2, (0, 0, -0.09))
kf(CAR, "location", EV["slam"] + 5, (0, 0, 0.035))
kf(CAR, "location", EV["slam"] + 8, (0, 0, 0))
kf(CAR, "location", S("S1_ding")[0] - 1, (0, 0, 0), interp='CONSTANT')
kf(CAR, "location", S("S1_ding")[0], (0, 0, HALL_Z), interp='CONSTANT')

# ===================================================================== characters
set_coll(C_CHAR)
HERO = dict(skin=(0.62, 0.34, 0.21), shirt=(0.9, 0.28, 0.03), pants=(0.04, 0.09, 0.25), shoe=(0.75, 0.05, 0.04),
            hair=(0.07, 0.035, 0.015), iris=(0.2, 0.09, 0.03))
TECH = dict(skin=(0.42, 0.24, 0.14), shirt=(0.08, 0.12, 0.2), pants=(0.1, 0.1, 0.12), shoe=(0.15, 0.1, 0.05),
            hair=(0.03, 0.02, 0.015), iris=(0.1, 0.06, 0.03))
hero = build_character("hero", HERO, parent=CAR)
tech = build_character("tech", TECH, parent=None, hat=True, vest=True, mustache=True)


def H(f, loc, rotz=0.0, rotx=0.0, roty=0.0, hipz=None, world=False, interp=None):
    """Key hero root. world=True converts a world-space position into car space."""
    x, y, z = loc
    if world:
        z = z - car_z(f)
    key_root(hero, f, (x, y, z), rotz, rotx, roty, hipz=hipz, interp=interp)


def HP(f, pose, **ov):
    key_pose(hero, f, pose, overrides=ov or None)


def HE(f, e, look=(0, 0), **ov):
    key_expr(hero, f, e, look, overrides=ov or None)


# ===================================================================== props
set_coll(C_SET)
phone = SETS.build_phone("phone", M, hero.wr["R"])
phone["body"].location = (0.0, -0.035, -0.085)
phone["body"].rotation_euler = (rad(90), rad(0), rad(180))
float_phone = SETS.build_phone("fphone", M, CAR)
bottle_t, water_t = SETS.build_bottle("bottle_tech", M, tech.wr["R"])
bottle_t.location = (0, -0.03, -0.09)
bottle_h, water_h = SETS.build_bottle("bottle_hero", M, hero.wr["R"])
bottle_h.location = (0, -0.04, -0.09)
bottle_h.rotation_euler = (rad(90), 0, 0)
crowbar = SETS.build_crowbar("crowbar", M, None)

# ===================================================================== lights
set_coll(C_LIGHT)
L_ceil = light("L_ceiling", 'AREA', (0, 0.05, CH - 0.03), 70, (1.0, 0.9, 0.78), size=1.0, size_y=0.7, parent=CAR)
L_fill = light("L_fill", 'AREA', (0.2, -0.65, 1.9), 15, (1.0, 0.95, 0.9), size=0.6, parent=CAR, target=(0, 0.3, 1.2))
L_rim = light("L_rim", 'AREA', (-0.6, 0.65, 2.0), 0, (1.0, 0.2, 0.1), size=0.4, parent=CAR, target=(0, 0, 1.3))
L_emerg = light("L_emerg", 'POINT', (0.55, -0.6, 2.2), 0, (1.0, 0.25, 0.08), size=0.05, parent=CAR)
L_phone = light("L_phone", 'POINT', (0, -0.08, 0), 0, (0.35, 0.6, 1.0), size=0.05, parent=phone["body"], shadow=False)
L_spot_corner = light("L_corner_spot", 'SPOT', (0.0, -0.2, CH - 0.05), 0, (1.0, 0.85, 0.6), parent=CAR,
                      spot=32, blend=0.35, target=(0.75, 0.7, 0.2), size=0.02)
L_crack = light("L_crack", 'SPOT', (0, -2.3, 2.0), 0, (1.0, 0.93, 0.8), spot=40, blend=0.5,
                target=(0, 0.6, 0.3), size=0.05)
L_sh_key = light("L_shaft_key", 'AREA', (-3.0, -0.4, 2.6), 0, (0.6, 0.72, 1.0), size=2.0, target=(0, 0, 1.0))
L_sh_top = light("L_shaft_top", 'AREA', (0.6, -0.5, 7.5), 0, (0.6, 0.75, 1.0), size=1.5, target=(0, 0, 2))
L_sh_side = light("L_shaft_side", 'AREA', (1.15, 1.2, 3.2), 0, (0.45, 0.6, 1.0), size=1.0, target=(0, 0, 0.8))
L_sparkL = light("L_spark1", 'POINT', (1.1, -0.15, -0.3), 0, (1.0, 0.45, 0.08), size=0.05, parent=CAR)
L_sparkR = light("L_spark2", 'POINT', (-1.1, -0.15, -0.3), 0, (1.0, 0.45, 0.08), size=0.05, parent=CAR)
L_hall_key = light("L_hall_key", 'AREA', (1.4, -3.2, 3.4), 0, (1.0, 0.95, 0.85), size=1.5, target=(0.3, -1.8, 2.0))
L_face = light("L_face", 'AREA', (0.22, -0.62, 0.42), 0, (1.0, 0.92, 0.85), size=0.45, parent=hero.neck,
               target=(0, 0, 0.22))
L_lobby = light("L_lobby_car", 'AREA', (0, 0, CH - 0.03), 0, (1.0, 0.85, 0.65), size=1.2, size_y=0.9, parent=CAR)

INTERIOR = [L_ceil, L_fill, L_rim, L_emerg, L_phone, L_spot_corner, L_lobby]
SHAFT = [L_sh_key, L_sh_top, L_sh_side, L_sparkL, L_sparkR]
HALL = hall.lights + [L_hall_key, L_crack]
STAIR = stair.lights

EXT_SHOTS = ["H2_shaft_drop", "K1_car_hanging", "K2_cables", "K3_brakes"]
HALL_SHOTS = ["L1_crack", "R1_pry", "R2_water", "M1_madeit", "S1_ding"]


def ranges_for(names):
    return [S(n) for n in names]


def ranges_except(names):
    out, cur = [], None
    for n, a, b in SHOTS:
        if n in names:
            if cur:
                out.append(cur)
                cur = None
        else:
            cur = (cur[0], b) if cur else (a, b)
    if cur:
        out.append(cur)
    return out


for l in INTERIOR:
    key_vis(l, ranges_except(EXT_SHOTS + ["M1_madeit", "S2_stairs"]))
for l in SHAFT:
    key_vis(l, ranges_for(EXT_SHOTS))
for l in HALL:
    key_vis(l, ranges_for(HALL_SHOTS))
for l in STAIR:
    key_vis(l, ranges_for(["S2_stairs"]))

# ---- interior light "mood" over the story: (frame, ceiling energy, color, panel emission)
WARM = (1.0, 0.88, 0.74)
DIM = (1.0, 0.72, 0.5)
HOT = (1.0, 0.55, 0.3)
COLD = (0.55, 0.65, 1.0)
mood = [(1, 70, WARM, 6.0)]
for f in range(2, EV["slam"], 3):  # flicker during the fall
    on = (f // 3) % 3 != 1
    mood.append((f, 70 if on else 6, WARM, 6.0 if on else 0.3))
mood += [(EV["slam"], 0, WARM, 0.0), (EV["slam"] + 7, 0, WARM, 0.0), (EV["slam"] + 8, 35, DIM, 2.5),
         (EV["slam"] + 10, 2, DIM, 0.2), (EV["slam"] + 13, 30, DIM, 2.5), (EV["slam"] + 15, 5, DIM, 0.4),
         (EV["slam"] + 18, 45, DIM, 3.0),
         (S("P1_phone_ots")[0], 20, DIM, 1.5), (S("K1_car_hanging")[0] - 1, 20, DIM, 1.5),
         (S("T1_thirst")[0], 8, DIM, 0.8), (S("T1_thirst")[1], 6, DIM, 0.6),
         (S("D1a_pacing")[0], 40, WARM, 3.0), (S("C2_corner")[0], 40, WARM, 3.0), (S("C2_corner")[0] + 1, 6, WARM, 0.6),
         (S("C2_corner")[1], 6, WARM, 0.6), (S("C3_reluctant")[0], 34, WARM, 2.6),
         (S("D2a_headache")[0], 30, HOT, 2.0), (S("A2_fanning")[1], 28, HOT, 1.8),
         (S("E1_lying")[0], 14, COLD, 0.9), (S("E3_eye")[0], 9, COLD, 0.6), (S("E3_eye")[1], 0.5, COLD, 0.05),
         (S("L1_crack")[0], 0.3, COLD, 0.0), (S("M1_madeit")[0] - 1, 0.3, COLD, 0.0),
         (S("S1_ding")[0], 0, WARM, 0.0)]
for f, e, c, p in mood:
    key_light(L_ceil, [(f, e, c)])
    key_emission(M["panel"], f, p)
    key_light(L_fill, [(f, e * 0.25)])
key_emission(M["panel"], S("S1_ding")[0], 9.0)
key_light(L_lobby, [(S("S1_ding")[0] - 1, 0), (S("S1_ding")[0], 80)])
set_interp(L_ceil.data, 'LINEAR')
key_light(L_fill, [(EV["doors_open"] - 10, 0.1, (1.0, 0.9, 0.75)), (EV["doors_open"] + 2, 30), (S("R2_water")[1], 30),
                   (S("R2_water")[1] + 1, 0.1)])
key_light(L_emerg, [(EV["slam"] + 1, 0), (EV["slam"] + 8, 6), (S("D1a_pacing")[0] - 1, 6), (S("D1a_pacing")[0], 0)])
# red/blue dramatic rim per shot
key_light(L_rim, [(1, 0, (1, 0.2, 0.1)), (S("T1_thirst")[0] - 1, 0), (S("T1_thirst")[0], 60, (1.0, 0.15, 0.08)),
                  (S("T1_thirst")[1], 90), (S("T1_thirst")[1] + 1, 0),
                  (S("D2b_dizzy")[0] - 1, 0), (S("D2b_dizzy")[0], 70, (1.0, 0.4, 0.1)), (S("D2c_lips")[1], 70),
                  (S("D2c_lips")[1] + 1, 0), (S("E2_face_floor")[0] - 1, 0), (S("E2_face_floor")[0], 25, (0.4, 0.5, 1.0)),
                  (S("E3_eye")[1], 3), (S("E3_eye")[1] + 1, 0)])
for i, hb in enumerate(EV["heartbeats"]):   # heartbeat pulse in red
    if S("E2_face_floor")[0] <= hb <= S("E3_eye")[1]:
        key_light(L_rim, [(hb - 1, 18, (0.4, 0.5, 1.0)), (hb + 1, 70, (1.0, 0.1, 0.1)), (hb + 6, 18, (0.4, 0.5, 1.0))])
key_light(L_spot_corner, [(S("C2_corner")[0] - 1, 0), (S("C2_corner")[0], 0), (EV["corner_zoom"], 1500),
                          (S("C2_corner")[1], 1500), (S("C2_corner")[1] + 1, 0)])
set_interp(L_spot_corner.data, 'CONSTANT')

# face key light (rides on the neck) -- per-shot energy, CONSTANT between cuts
FACE = {"H1_freefall": 3, "H3_aftermath": 3, "B1_buttons": 2, "B2_alarm": 2, "B3_nothing": 3, "P1_phone_ots": 1.5,
        "P2_battery": 0.5, "P3_phone_face": (1.6, (0.55, 0.7, 1.0)), "T1_thirst": 1.5, "D1a_pacing": 2,
        "D1b_squirm": 3, "C1_eyes": 4, "C2_corner": 0, "C3_reluctant": 4, "D2a_headache": 3.5, "D2b_dizzy": 3.5,
        "D2c_lips": 3.5, "A1_vent": 0, "A2_fanning": 3, "E1_lying": (1.5, (0.7, 0.8, 1.0)),
        "E2_face_floor": (2.5, (0.7, 0.8, 1.0)), "E3_eye": (2.5, (0.7, 0.8, 1.0)), "L1_crack": (0.35, (0.7, 0.8, 1.0)),
        "R1_pry": 1.0, "R2_water": 4, "M1_madeit": 2, "S1_ding": 2, "S2_stairs": 3}
for n, a_, b_ in SHOTS:
    v = FACE.get(n, 0)
    e, col = (v if isinstance(v, tuple) else (v, (1.0, 0.92, 0.85)))
    key_light(L_face, [(a_, e, col)])
key_light(L_face, [(S("E3_eye")[1] - 12, 2.5), (S("E3_eye")[1], 0.2)])
set_interp(L_face.data, 'CONSTANT')

# rim light placement per interior shot (CONSTANT moves)
for name, loc, tgt in [("T1_thirst", (-0.6, 0.65, 2.0), (0, 0.15, 1.6)),
                       ("D2b_dizzy", (0.7, 0.2, 1.4), (0.1, 0.5, 0.8)),
                       ("E2_face_floor", (0.6, -0.3, 0.6), (0.5, 0.55, 0.15))]:
    a = S(name)[0]
    L_rim.location = loc
    look_at(L_rim, Vector(loc), Vector(tgt))
    L_rim.keyframe_insert("location", frame=a)
    L_rim.keyframe_insert("rotation_euler", frame=a)
set_interp(L_rim, 'CONSTANT')

# ---- shaft lights
key_light(L_sh_key, [(1, 700)])
key_light(L_sh_top, [(1, 500)])
key_light(L_sh_side, [(1, 160)])
# cutaway: the shaft's left wall is removed except when we look up the shaft from inside it
key_vis(D.objects["shaft_left"], ranges_for(["K2_cables"]))
# roof cutaway for the top-down shots
ROOF = [o for o in D.objects if o.name.startswith(("car_ceiling", "car_light_panel", "car_panel_frame", "vent_",
                                                   "crosshead", "hitch", "cable", "guide_top"))]
for o in ROOF:
    key_vis(o, ranges_except(["D1a_pacing", "E1_lying"]))
for l in (L_sparkL, L_sparkR):
    keys = [(EV["sparks_on"] - 1, 0)]
    for f in range(EV["sparks_on"], EV["slam"] + 8):
        keys.append((f, random.uniform(15, 60) * (2.0 if f >= EV["slam"] - 1 else 1.0)))
    keys.append((EV["slam"] + 9, 0))
    keys += [(EV["brake_glow"] - 1, 0), (EV["brake_glow"] + 4, 12, (1.0, 0.35, 0.05)), (S("K3_brakes")[1], 4)]
    key_light(l, keys)
# ---- hallway / crack light
key_light(L_crack, [(S("L1_crack")[0], 0), (EV["crack"], 0), (EV["crack"] + 3, 2500), (EV["pry"], 3500),
                    (EV["doors_open"], 6000), (S("R2_water")[1], 1000), (S("M1_madeit")[0], 0)])
for l in hall.lights:
    key_light(l, [(1, 120)])
key_light(L_hall_key, [(S("M1_madeit")[0] - 1, 0), (S("M1_madeit")[0], 220)])
set_interp(L_hall_key.data, 'CONSTANT')

# ===================================================================== doors
def doors(f, gap_car, gap_land=None, interp=None):
    gl = gap_car if gap_land is None else gap_land
    for ob, s in ((car.door_l, -1), (car.door_r, 1)):
        kf(ob, "location", f, (s * (DOOR_W / 2 + gap_car), ob.location.y, ob.location.z), interp=interp)
    dl, dr = shaft.landing[7]
    for ob, s in ((dl, -1), (dr, 1)):
        kf(ob, "location", f, (s * (0.225 + gl), ob.location.y, ob.location.z), interp=interp)


doors(1, 0.0)
doors(EV["crack"] - 1, 0.0)
doors(EV["crack"] + 2, 0.022)
doors(EV["pry"] - 1, 0.022)
doors(EV["pry"] + 3, 0.06)
doors(EV["pry"] + 8, 0.07)
doors(EV["pry"] + 13, 0.2)
doors(EV["doors_open"], 0.44)
doors(S("M1_madeit")[1], 0.44)
# a new day: elevator works again, closed, then "ding" opens invitingly
doors(S("S1_ding")[0], 0.0, interp='CONSTANT')
doors(EV["ding"] + 2, 0.0)
doors(EV["ding"] + 14, 0.44)

# landing doors of other floors stay closed. floor indicator inside the car
ind_seq = [("12", 1, 8), ("11", 9, 16), ("10", 17, 24), ("9", 25, 32), ("8", 33, 38), ("7", 39, EV["slam"] + 4)]
err_r = []
f = EV["slam"] + 5
while f < S("L1_crack")[0]:
    err_r.append((f, f + 9))
    f += 18
for lbl, t in car.ind.items():
    rr = [(a, b) for (l2, a, b) in ind_seq if l2 == lbl]
    if lbl == "ERR":
        rr = err_r
    if lbl == "7":
        rr += [(S("S1_ding")[0], FRAME_END)]
    key_vis(t, rr)

# buttons light up as they are smashed
for i, f in enumerate(EV["btn_presses"]):
    b, m = car.buttons[[1, 6, 3, 8, 0, 5, 2, 9][i % 8]]
    key_emission(m, f - 1, 0.0)
    key_emission(m, f, 8.0)
    key_emission(m, S("B3_nothing")[0] + 6, 8.0)
    key_emission(m, S("B3_nothing")[0] + 10, 0.0)
for k, f in enumerate(range(EV["alarm"], S("B3_nothing")[0] + 8, 4)):
    key_emission(car.alarm_mat, f, 10.0 if k % 2 == 0 else 1.0)
key_emission(car.alarm_mat, EV["alarm"] - 1, 0.0)
key_emission(car.alarm_mat, S("B3_nothing")[0] + 9, 0.0)
set_interp(car.alarm_mat.node_tree, 'CONSTANT')
key_emission(hall.call_mat, EV["ding"] - 4, 0.0)
key_emission(hall.call_mat, EV["ding"] - 3, 6.0)
key_emission(hall.call_mat, EV["ding"] + 10, 0.0)

# brake glow (K3)
key_emission(car.brake_mat, 1, 0.0)
key_emission(car.brake_mat, EV["sparks_on"], 2.0)
key_emission(car.brake_mat, EV["slam"] + 10, 1.0)
key_emission(car.brake_mat, EV["slam"] + 40, 0.0)
key_emission(car.brake_mat, EV["brake_glow"] - 8, 0.0)
key_emission(car.brake_mat, EV["brake_glow"] + 3, 0.9)
key_emission(car.brake_mat, S("K3_brakes")[1], 0.4)
key_emission(car.brake_mat, S("K3_brakes")[1] + 1, 0.0)

# ===================================================================== FX: sparks, steam, dust, light beam
set_coll(C_FX)
spark_m = emit_mat("spark", (1.0, 0.55, 0.12), 40.0)
for i in range(70):
    s = 1 if i % 2 else -1
    f0 = random.randint(EV["sparks_on"], EV["slam"] + 4)
    life = random.randint(5, 10)
    p0 = Vector((s * 1.12, random.uniform(-0.12, 0.12), -0.2 + random.uniform(-0.1, 0.1)))
    v = Vector((s * random.uniform(0.02, 0.06), random.uniform(-0.07, 0.07), random.uniform(0.05, 0.16)))
    if f0 > EV["slam"] - 2:
        v = Vector((s * random.uniform(0.02, 0.09), random.uniform(-0.1, 0.1), random.uniform(-0.04, 0.12)))
    sp = cyl("spark%d" % i, 0.006, 0.07, tuple(p0), spark_m, CAR, verts=6)
    sp.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()
    for k in range(0, life + 1, 2):
        pos = p0 + v * k + Vector((0, 0, -0.004 * k * k))
        kf(sp, "location", f0 + k, tuple(pos))
    key_vis(sp, [(f0, f0 + life)])
steam_m = mat("steam", (0.9, 0.9, 0.92), rough=1.0, alpha=0.18)
for i in range(10):
    st = sphere("steam%d" % i, 0.05, (1.05, -0.1, -0.1), (1, 1, 1), steam_m, CAR, seg=12, ring=8)
    f0 = EV["brake_glow"] + i * 4
    kf(st, "location", f0, (1.05 + random.uniform(-0.05, 0.05), -0.13, -0.1))
    kf(st, "scale", f0, (0.5, 0.5, 0.5))
    kf(st, "location", f0 + 28, (1.0 + random.uniform(-0.1, 0.1), -0.2, 0.35))
    kf(st, "scale", f0 + 28, (2.4, 2.4, 2.4))
    key_vis(st, [(f0, min(f0 + 28, S("K3_brakes")[1]))])
dust_m = emit_mat("dust", (1.0, 0.8, 0.55), 2.0)
vc = car.vent_center
for i in range(28):
    d = sphere("dust%d" % i, 0.0025, (0, 0, 0), (1, 1, 1), dust_m, CAR, seg=6, ring=4)
    a, b = S("A1_vent")
    p0 = Vector((vc.x + random.uniform(-0.3, 0.3), vc.y + random.uniform(-0.3, 0.3), vc.z - random.uniform(0.05, 0.6)))
    kf(d, "location", a, tuple(p0))
    kf(d, "location", b, tuple(p0 + Vector((random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), random.uniform(-0.08, 0.02)))))
    key_vis(d, [(a, b)])
# light beam through the door crack (fake volumetric) - a sheet in the YZ plane, widening as doors open
beam_m = beam_mat("beam", (1.0, 0.92, 0.75), strength=2.0, alpha=0.12)
# light spilling through the crack: inside spill spot + a bright streak on the floor
L_spill = light("L_spill", 'SPOT', (0.0, -0.72, 1.3), 0, (1.0, 0.9, 0.72), spot=28, blend=0.6, parent=CAR,
                target=(0.35, 0.6, 0.0), size=0.02)
key_light(L_spill, [(EV["crack"], 0), (EV["crack"] + 3, 60), (EV["pry"], 80), (EV["doors_open"], 200),
                    (S("R2_water")[1], 120), (S("R2_water")[1] + 1, 0)])
key_vis(L_spill, [(S("L1_crack")[0], S("R2_water")[1])])
key_vis(L_face, ranges_except(EXT_SHOTS + ["A1_vent", "C2_corner"]))
streak_m = emit_mat("streak", (1.0, 0.9, 0.72), 0.0)
bm2 = bmesh.new()
for v in ((-0.012, -CD, 0.002), (0.012, -CD, 0.002), (0.09, CD, 0.002), (-0.09, CD, 0.002)):
    bm2.verts.new(v)
bm2.faces.new(bm2.verts)
streak = obj_from_bm("floor_streak", bm2, streak_m, CAR, smooth=False)
key_emission(streak_m, EV["crack"], 0.0)
key_emission(streak_m, EV["crack"] + 3, 6.0)
key_emission(streak_m, EV["pry"] + 8, 6.0)
key_vis(streak, [(EV["crack"], EV["pry"] + 10)])
bm = bmesh.new()
uvl = bm.loops.layers.uv.new()
vs = [bm.verts.new(p) for p in ((0, -CD, 0.0), (0, -CD, DOOR_H), (0, CD, 0.0), (0, CD, DOOR_H * 0.2))]
f_ = bm.faces.new(vs)
for lp, uv in zip(f_.loops, ((0, 0), (1, 0), (0, 1), (1, 1))):
    lp[uvl].uv = uv
beam = obj_from_bm("light_beam", bm, beam_m, CAR, smooth=False)
key_vis(beam, [(EV["crack"] + 1, S("R2_water")[0] - 1)])
bmesh_beam2 = None
beam.scale = (1, 1, 1)
# sheet widens with a second rotated copy once doors open
beam2 = beam.copy(); beam2.data = beam.data; link(beam2); beam2.parent = CAR
beam2.rotation_euler = (0, 0, rad(12)); key_vis(beam2, [(EV["pry"] + 8, S("R2_water")[0] - 1)])
beam3 = beam.copy(); beam3.data = beam.data; link(beam3); beam3.parent = CAR
beam3.rotation_euler = (0, 0, rad(-12)); key_vis(beam3, [(EV["pry"] + 8, S("R2_water")[0] - 1)])
crack_glow = box("crack_glow", (0.02, 0.005, DOOR_H), (0, -CD - 0.03, DOOR_H / 2), emit_mat("crackm", (1, 0.95, 0.85), 12), CAR)
key_vis(crack_glow, [(EV["crack"] + 1, EV["pry"] + 2)])

# ===================================================================== HERO ANIMATION
# ---------------- H1 free fall (car coords)
a, b = S("H1_freefall")
for i, f in enumerate(range(a, b + 1, 4)):
    t = (f - a) / (b - a)
    H(f, (0.05, 0.1, 0.12 + 0.45 * t), rotz=-15 + 10 * t, rotx=8 - 18 * t, roty=4 - 10 * t)
    HP(f, "freefall" if i % 2 == 0 else "freefall2")
HE(a, "scream", look=(0, 12))
HE(b, "scream", look=(5, 15))
# floating phone tumbling
fp = float_phone["body"]
kf(fp, "location", a, (0.35, -0.25, 0.9)); kf(fp, "rotation_euler", a, (0.3, 0.2, 0.5))
kf(fp, "location", b, (0.32, -0.3, 1.45)); kf(fp, "rotation_euler", b, (2.9, 1.4, 2.0))
kf(fp, "location", EV["land"], (0.35, -0.4, 0.006)); kf(fp, "rotation_euler", EV["land"], (rad(90), 0, 0.5))
key_vis_tree(fp, [(a, S("B1_buttons")[0] - 1)])
# ---------------- H3 aftermath: crash down, dazed, gets up, looks at the indicator
a, b = S("H3_aftermath")
H(a - 1, (0.05, 0.1, 0.4), rotz=-5, rotx=-10)
HP(a - 1, "freefall2")
H(EV["land"], (0.05, 0.1, 0.0), rotz=-5, hipz=0.42)
HP(EV["land"], "crouch_daze")
HE(a, "scream", look=(0, 10))
HE(EV["land"], "closed")
HE(EV["land"] + 4, "dazed", look=(10, -5))
H(EV["land"] + 14, (0.05, 0.1, 0.0), rotz=-5, hipz=0.45)
HP(EV["land"] + 14, "crouch_daze", head=(0, -8, 20))
HE(EV["land"] + 18, "dazed", look=(-15, 0))
H(b - 32, (0.05, 0.1, 0.0), rotz=-5, hipz=0.5)
HP(b - 32, "crouch_daze", head=(0, 8, -20))
H(b - 14, (0.05, 0.1, 0.0), rotz=-5)
HP(b - 14, "brace", head=(-25, 0, 0))
HE(b - 16, "alarmed", look=(0, 25))
H(b, (0.05, 0.05, 0.0), rotz=0)
HP(b, "brace", head=(-30, 0, 0))
HE(b, "panic", look=(0, 25))
# ---------------- B1/B2 buttons + alarm
a, b = S("B1_buttons")
H(a, (0.28, -0.32, 0), rotz=36)
HE(a, "panic", look=(0, -10))
for i, f in enumerate(EV["btn_presses"]):
    HP(f - 1, "press2" if i % 2 else "press", shR=(72 + (i % 3) * 7, 15 + (i % 4) * 5, 0))
    HP(f + 1, "press2", shR=(60 + (i % 3) * 6, 12, 0), elR=50)
HE(EV["btn_presses"][4], "angry", look=(0, -10))
a2, b2 = S("B2_alarm")
H(a2, (0.3, -0.34, 0), rotz=36)
HP(a2, "press2", shR=(50, 15, 0), elR=45, spine=(12, 0, -10))
HP(EV["alarm"] - 3, "press2", shR=(52, 18, 0), elR=40, spine=(14, 0, -10))
HP(EV["alarm"], "press2", shR=(56, 14, 0), elR=10, spine=(16, 0, -10))
HP(b2, "press2", shR=(56, 14, 0), elR=12, spine=(16, 0, -10))
HE(b2, "panic", look=(0, -20))
# reach correction: slide the hero so the jabbing hand actually lands on the button panel
for fr_, tgt, keyf in ((EV["btn_presses"][0] - 1, Vector((0.58, -0.70, 1.26)), (S("B1_buttons")[0],)),
                       (EV["alarm"], Vector((0.62, -0.70, 0.96)), (S("B2_alarm")[0], S("B2_alarm")[1]))):
    hand_ = local_pos(hero.hand["R"], fr_, CAR)
    root_ = local_pos(hero.root, fr_, CAR)
    d_ = tgt - hand_
    d_.z = 0
    for kf_ in keyf:
        H(kf_, tuple(root_ + d_), rotz=36)
    print("reach fix", fr_, tuple(round(v, 3) for v in d_))
# ---------------- B3 nothing
a, b = S("B3_nothing")
H(a, (0.15, -0.1, 0), rotz=-50)
HP(a, "stand", head=(-10, 0, 0))
HE(a, "alarmed", look=(0, 15))
HP(a + 8, "defeat")
HE(a + 8, "defeated", look=(0, -5))
H(b, (0.15, -0.1, 0), rotz=-50)
HP(b, "defeat")
# ---------------- P1-P3 phone
a = S("P1_phone_ots")[0]
b = S("P3_phone_face")[1]
H(a, (0.0, 0.1, 0), rotz=0)
HP(a, "phone")
HE(a, "worried", look=(0, -25))
HP(EV["no_signal"], "phone", shR=(40, 12, 20), head=(32, 0, 0))
HE(EV["no_signal"] + 2, "panic", look=(0, -25))
HE(S("P3_phone_face")[0], "worried", look=(0, -22))
HE(EV["phone_dies"] + 2, "defeated", look=(0, -20))
HP(b, "phone", shR=(30, 12, 20), head=(30, 0, 0))
H(b, (0.0, 0.1, 0), rotz=0)
for ob in phone.values():
    if hasattr(ob, "hide_render"):
        pass
key_vis_tree(phone["body"], [(a, b)])
for k in ("screen", "nosvc", "clock", "bat_frame", "bat_in", "pct"):
    key_vis(phone[k], [(a, EV["phone_dies"])])
key_vis(phone["x"], [(EV["no_signal"], EV["phone_dies"])])
blinks = [(f, f + 4) for f in range(EV["battery"], EV["phone_dies"], 9)]
key_vis(phone["bat_fill"], blinks)
key_vis(float_phone["x"], [])
key_vis(float_phone["pct"], [])
key_vis(float_phone["bat_fill"], [])
key_light(L_phone, [(a - 1, 0), (a, 9.0), (EV["phone_dies"], 9.0), (EV["phone_dies"] + 1, 0)])
set_interp(L_phone.data, 'CONSTANT')
# ---------------- K (exterior): hero idles sitting (unseen); keep a pose
a, b = S("K1_car_hanging")
H(a, (0.0, 0.3, 0), rotz=0, hipz=0.17)
HP(a, "sit_wall")
# ---------------- T1 thirst: standing centre, push-in
a, b = S("T1_thirst")
H(a, (0.0, 0.15, 0), rotz=0)
HP(a, "stand", head=(-6, 0, 0))
HE(a, "grim", look=(0, 3))
HE(EV["thirst"] - 2, "grim", look=(0, 3))
HE(EV["thirst"] + 2, "gulp", look=(0, 3))
HE(EV["thirst"] + 8, "worried", look=(0, 6))
HP(b, "stand", head=(-8, 0, 0), spine=(-3, 0, 0))
H(b, (0.0, 0.15, 0), rotz=0)
HE(b, "worried", look=(0, 8))
# ---------------- D1a pacing in circles (time-lapse), then clutch belly
a, b = S("D1a_pacing")
stop = EV["growl"] - 4


def circle(t):
    ang = -math.pi / 2 + t * 2.4 * math.pi
    return (0.38 * math.cos(ang), 0.05 + 0.32 * math.sin(ang), 0.0, math.degrees(ang) + 180)


walk_cycle(hero, a, stop, circle, period=12)
HE(a, "bored", look=(0, -10))
HE(stop, "bored", look=(0, -10))
x, y, z, rz = circle(1.0)
H(EV["growl"], (x, y, 0), rotz=rz)
HP(EV["growl"], "belly")
HE(EV["growl"] + 1, "pained", look=(0, -20))
H(b, (x, y, 0), rotz=rz)
HP(b, "belly", head=(25, 0, 0))
# ---------------- D1b squirming, sitting against left wall
a, b = S("D1b_squirm")
SITX, SITY = -0.6, 0.1
for i, f in enumerate(range(a, b + 1, 4)):
    H(f, (SITX, SITY, 0), rotz=90, hipz=0.16 + (0.012 if i % 2 else 0))
    HP(f, "sit_squirm", knL=95 + (14 if i % 2 else -6), knR=95 + (-6 if i % 2 else 14),
       hipL=(95, 2 + (10 if i % 2 else 0), 0), hipR=(95, 2 + (0 if i % 2 else 10), 0))
HE(a, "strained", look=(0, 0))
HE(W("day1", 9) - 1, "strained", look=(0, 0))
HE(W("day1", 10), "alarmed", look=(0, 5))
HE(b, "alarmed", look=(0, 5))
# ---------------- C1-C3 the corner
a, b = S("C1_eyes")
H(a, (SITX, SITY, 0), rotz=90, hipz=0.16)
HP(a, "sit_squirm")
HE(a, "worried", look=(0, 0))
HE(a + 4, "worried", look=(0, 0))
HE(b, "squint", look=(38, 4))
a, b = S("C2_corner")
HE(a, "squint", look=(38, 4))
a, b = S("C3_reluctant")
H(a, (SITX, SITY, 0), rotz=90, hipz=0.16)
HP(a, "sit_squirm", head=(0, 0, 25))
HE(a, "embarrass", look=(-8, 0))
key_blush(hero, a, 0.0)
key_blush(hero, a + 8, 0.6)
HP(a + 14, "sit_squirm", head=(12, 0, 15))
HP(a + 20, "sit_squirm", head=(-4, 0, 15))
HP(a + 26, "sit_squirm", head=(12, 0, 15))
HE(a + 24, "embarrass", look=(-5, -10))
HP(b, "sit_squirm", head=(4, 0, 15))
H(b, (SITX, SITY, 0), rotz=90, hipz=0.16)
key_blush(hero, b, 0.6)
key_blush(hero, b + 1, 0.0)
# ---------------- D2 day two: slumped against back wall
SLX, SLY = 0.1, 0.5
a, b = S("D2a_headache")
H(a, (SLX, SLY, 0), rotz=0, hipz=0.16)
HP(a, "headache")
HE(a, "pained", look=(0, -10))
for f in EV["pounds"]:
    HP(f, "headache", head=(26, 0, 0), spine=(16, 0, 0))
    HE(f, "pained", look=(0, -10), lid=70)
    HP(f + 4, "headache")
    HE(f + 4, "pained", look=(0, -10))
HP(b, "headache")
H(b, (SLX, SLY, 0), rotz=0, hipz=0.16)
a, b = S("D2b_dizzy")
H(a, (SLX, SLY, 0), rotz=0, hipz=0.16)
for i, f in enumerate(range(a, b + 1, 5)):
    HP(f, "sit_slump", head=(10 + 8 * math.sin(i), 14 * math.cos(i * 1.3), 10 * math.sin(i * 0.9)))
    HE(f, "dizzy", look=(25 * math.sin(i * 1.7), 15 * math.cos(i * 1.7)))
H(b, (SLX, SLY, 0), rotz=0, hipz=0.16)
# each eye wanders separately (dizzy)
for i, f in enumerate(range(a, b + 1, 5)):
    ey = hero.eyes[0]
    ey.rotation_euler = (rad(15 * math.sin(i * 2.1)), 0, rad(-25 * math.cos(i * 1.4)))
    ey.keyframe_insert("rotation_euler", frame=f)
a, b = S("D2c_lips")
H(a, (SLX, SLY, 0), rotz=0, hipz=0.16)
HP(a, "sit_slump", head=(5, 6, 0))
HE(a, "tired", look=(0, -5), open=0.0, frown=0.6, wide=0.5)
HE(a + 18, "tired", look=(0, -5), open=0.12, o=0.2, frown=0.4)
HE(b, "tired", look=(0, -5), open=0.0, frown=0.7, wide=0.4)
HP(b, "sit_slump", head=(8, 4, 0))
H(b, (SLX, SLY, 0), rotz=0, hipz=0.16)
# ---------------- A1/A2 air: fanning
a = S("A1_vent")[0]
H(a, (SLX, SLY, 0), rotz=0, hipz=0.16)
HP(a, "fan")
a, b = S("A2_fanning")
H(a, (SLX, SLY, 0), rotz=0, hipz=0.16)
HE(a, "hot", look=(0, 15))
breath = W("air", 10)
for i, f in enumerate(range(a, breath, 5)):
    HP(f, "fan" if i % 2 == 0 else "fan2")
HP(breath + 2, "sit_wall", spine=(-12, 0, 0), head=(-25, 0, 0))
HE(breath + 2, "relief", look=(0, 20), open=0.6, o=0.6)
HP(b - 6, "sit_wall", spine=(-4, 0, 0), head=(-5, 0, 0))
HE(b - 4, "tired", look=(0, 0))
H(b, (SLX, SLY, 0), rotz=0, hipz=0.16)
HP(b, "sit_wall")
# ---------------- E day three: lying on the floor (diagonal)
LYX, LYY = -0.6, -0.58
a = S("E1_lying")[0]
b = S("L1_crack")[1]
H(a, (LYX, LYY, 0.13), rotz=-47, rotx=-90)
HP(a, "lying")
HE(a, "exhausted", look=(0, 0))
HE(S("E2_face_floor")[0], "exhausted", look=(-5, 0))
for hb in EV["heartbeats"]:
    pass
HE(S("E3_eye")[0], "exhausted", look=(0, 0), lid=25)
HE(S("E3_eye")[0] + 14, "exhausted", look=(-6, 0), lid=40)
HE(S("E3_eye")[1] - 6, "closed")
HE(EV["crack"] + 6, "closed")
HE(EV["crack"] + 14, "hope", look=(0, -10), lid=10)
HE(b, "hope", look=(-5, -15))
HP(EV["crack"] + 10, "lying")
HP(b, "lying", head=(-10, 0, 25))
H(b, (LYX, LYY, 0.13), rotz=-47, rotx=-90)
# ---------------- R1 pry: sitting up, shielding eyes
a, b = S("R1_pry")
H(a, (0.05, 0.3, 0), rotz=0, hipz=0.18)
HP(a, "sit_up_shield", shR=(40, 20, 0), elR=60)
HE(a, "hope", look=(0, 10))
HP(EV["pry"], "sit_up_shield", shR=(40, 20, 0), elR=60)
HP(EV["pry"] + 10, "sit_up_shield")
HE(EV["pry"] + 10, "squint", look=(0, 15))
HE(EV["doors_open"], "hope", look=(0, 20))
HP(b, "sit_up_shield", shR=(60, 20, 0), elR=40)
H(b, (0.05, 0.3, 0), rotz=0, hipz=0.18)
# ---------------- R2 hand-off and chug
a, b = S("R2_water")
H(a, (0.0, -0.2, 0), rotz=0)
HP(a, "kneel_reach", shR=(110, 10, 0))
HE(a, "hope", look=(0, 30))
HP(EV["handoff"] - 2, "kneel_reach")
HE(EV["handoff"], "joy", look=(0, 30))
HP(EV["handoff"] + 6, "drink")
for i, g in enumerate(EV["gulps"]):
    HP(g, "drink", head=(-38, 0, 0))
    HE(g, "gulp")
    HP(g + 4, "drink", head=(-32, 0, 0))
HE(b - 2, "joy", look=(0, 10))
HP(b, "drink", head=(-25, 0, 0))
H(b, (0.0, -0.2, 0), rotz=0)
key_vis_tree(bottle_t, [(S("R1_pry")[0], EV["handoff"] - 1)])
key_vis_tree(bottle_h, [(EV["handoff"], S("S1_ding")[0] - 1)])
for ob, _ in ((water_t, 0), (water_h, 0)):
    pass
kf(water_h, "scale", EV["handoff"], (1, 1, 1))
kf(water_h, "location", EV["handoff"], (0, 0, -0.005))
for i, g in enumerate(EV["gulps"]):
    lvl = 1 - 0.22 * (i + 1)
    kf(water_h, "scale", g + 3, (1, 1, lvl))
    kf(water_h, "location", g + 3, (0, 0, -0.005 - 0.09 * (1 - lvl)))
# ---------------- M1 made it: hallway victory (world coords; car at z=0)
a, b = S("M1_madeit")
H(a, (0.45, -2.05, HALL_Z), rotz=-15, world=True)
HP(a, "victory")
HE(a, "joy", look=(0, 10))
for i, f in enumerate(range(a + 4, EV["cheer"] + 14, 5)):
    HP(f, "victory" if i % 2 else "victory2")
    H(f, (0.45, -2.05, HALL_Z + (0.06 if i % 2 else 0)), rotz=-15, world=True)
HP(W("madeit", 3), "stand")
HE(W("madeit", 3), "relief", look=(0, 0))
HP(b - 8, "suspicious", head=(0, 0, 40))
HE(b - 8, "squint", look=(30, 0))
H(b, (0.45, -2.05, HALL_Z), rotz=-15, world=True)
HP(b, "suspicious", head=(0, 0, 45))
# ---------------- S1 ding: elevator opens invitingly, hero shakes head
a, b = S("S1_ding")
H(a, (1.35, -2.4, HALL_Z), rotz=-131, world=True)
HP(a, "stand")
HE(a, "neutral", look=(0, 0))
HE(EV["ding"] + 2, "alarmed", look=(0, 0))
HP(EV["ding"] + 4, "nope")
HE(EV["ding"] + 8, "nope", look=(0, 0))
for i, f in enumerate(range(EV["ding"] + 8, b + 1, 4)):
    HP(f, "nope", head=(0, 0, 22 if i % 2 else -22))
H(b, (1.35, -2.4, HALL_Z), rotz=-131, world=True)
# ---------------- S2 stairs: sprint up flight A, turn, thumbs up
a, b = S("S2_stairs")
top = EV["thumbs"] - 8
X = STAIR_X


def stairs_path(t):
    y = 0.05 + 3.55 * t
    zz = HALL_Z + max(0.0, min(1.8, (y - 0.25) * 0.6))
    return (X + 0.75, y, zz, 180)


ws = lambda f, loc, **k: H(f, loc, world=True, **k)
# world->car conversion inside walk_cycle: wrap path to subtract car z
walk_cycle(hero, a, top - 4, lambda t: (lambda p: (p[0], p[1], p[2] - HALL_Z, p[3]))(stairs_path(t)),
           period=10, run=True, stairs=True)
HE(a, "angry", look=(0, 10))
HE(top - 6, "angry", look=(0, 10))
ws(top, (X + 0.55, 3.75, HALL_Z + 1.8), rotz=260)
HP(top, "stand", head=(0, 0, 20))
ws(EV["thumbs"], (X + 0.5, 3.8, HALL_Z + 1.8), rotz=338)
HP(EV["thumbs"], "thumbs")
HE(EV["thumbs"], "smug", look=(-12, 5))
HE(EV["thumbs"] + 6, "grin", look=(-12, 5))
HP(b, "thumbs", head=(-5, 10, 18))
ws(b, (X + 0.5, 3.8, HALL_Z + 1.8), rotz=338)
HE(b, "grin", look=(-12, 5))

# blinks
blink(hero, [12, 70, 105, 140, 230, 300, 470, 520, 590, 700, 790, 850, 905, 960, 1250, 1290, 1320, 1360, 1405])

# ===================================================================== TECHNICIAN
tvis = [(S("R1_pry")[0], S("M1_madeit")[1])]
for ob in [o for o in D.objects if o.name.startswith("tech_")]:
    if ob.type == 'MESH':
        key_vis(ob, tvis)
a = S("R1_pry")[0]
key_root(tech, a, (0.0, -1.55, HALL_Z), 180, hipz=0.62)
key_pose(tech, a, "crouch_work")
key_expr(tech, a, "grim", look=(0, -25))
key_root(tech, EV["doors_open"], (0.0, -1.5, HALL_Z), 180, hipz=0.6)
key_pose(tech, EV["doors_open"], "crouch_work", overrides=dict(spine=(30, 0, 0)))
a2 = S("R2_water")[0]
key_root(tech, a2, (0.0, -1.42, HALL_Z), 180, hipz=0.58)
key_pose(tech, a2, "tech_offer")
key_expr(tech, a2, "friendly", look=(0, -30))
key_pose(tech, EV["handoff"] + 4, "tech_offer", overrides=dict(shR=(60, 10, 0), elR=50))
key_root(tech, S("R2_water")[1], (0.0, -1.42, HALL_Z), 180, hipz=0.58)
a = S("M1_madeit")[0]
key_root(tech, a, (-0.55, -1.75, HALL_Z), 30)
key_pose(tech, a, "thumbs_tech")
key_expr(tech, a, "friendly", look=(15, 0))
key_pose(tech, S("M1_madeit")[1], "thumbs_tech", overrides=dict(head=(5, 0, 25)))
blink(tech, [1180, 1230, 1280])
# crowbar: in the tech's hand via constraint-free parenting
crowbar.parent = tech.wr["L"]
crowbar.location = (0, -0.03, -0.1)
crowbar.rotation_euler = (rad(70), 0, 0)
key_vis(crowbar, [(S("R1_pry")[0], S("R1_pry")[1])])
for c in crowbar.children:
    key_vis(c, [(S("R1_pry")[0], S("R1_pry")[1])])

# ===================================================================== CAMERAS
set_coll(C_CAM)
cams = []
HN = hero.neck   # face close-ups ride on the neck so head motion still reads


def CAM(name, keys, parent=None, dof=None, shk=None, interp='BEZIER'):
    a, b = S(name)
    ks = []
    for k in keys:
        k = dict(k)
        k["f"] = a + int(round(k["f"] * (b - a))) if isinstance(k["f"], float) else k["f"]
        ks.append(k)
    cam = camera("CAM_" + name, ks, parent=parent, dof=dof, interp=interp)
    if shk:
        strength, scale = shk[:2]
        rng = shk[2] if len(shk) > 2 else [(a, b)]
        shake(cam, strength=strength, scale=scale, frames=rng, seed=len(cams))
    cams.append((a, cam))
    return cam


focus_hero = hero.face
CAM("H1_freefall", [dict(f=0.0, loc=(0.6, -0.62, 0.35), at=(0.05, 0.1, 1.2), lens=15, roll=-8),
                    dict(f=1.0, loc=(0.58, -0.6, 0.42), at=(0.05, 0.1, 1.5), lens=17, roll=6)],
    parent=CAR, shk=(0.03, 2.0))
CAM("H2_shaft_drop", [dict(f=0.0, loc=(-3.6, -0.95, -0.8), at=(0.0, 0.0, 2.6), lens=21, roll=3),
                      dict(f=1.0, loc=(-3.5, -0.95, -0.7), at=(0.0, 0.0, 1.0), lens=23, roll=-2)],
    shk=(0.06, 1.5, [(EV["slam"] - 1, EV["slam"] + 4)]))
CAM("H3_aftermath", [dict(f=0.0, loc=(0.64, -0.62, 1.55), at=(0.0, 0.2, 0.55), lens=16),
                     dict(f=0.55, loc=(0.6, -0.6, 1.45), at=(0.0, 0.15, 0.75), lens=18),
                     dict(f=1.0, loc=(0.55, -0.58, 1.3), at=(0.0, 0.0, 1.85), lens=17)],
    parent=CAR, shk=(0.05, 1.5, [(S("H3_aftermath")[0], S("H3_aftermath")[0] + 8)]))
CAM("B1_buttons", [dict(f=0.0, loc=(0.74, -0.28, 1.48), at=(0.6, -0.75, 1.2), lens=24),
                   dict(f=1.0, loc=(0.74, -0.33, 1.42), at=(0.6, -0.75, 1.2), lens=28)],
    parent=CAR, dof=dict(dist=0.6, fstop=3.5), shk=(0.006, 4.0))
CAM("B2_alarm", [dict(f=0.0, loc=(0.75, -0.48, 1.1), at=(0.62, -0.745, 0.95), lens=30),
                 dict(f=1.0, loc=(0.75, -0.52, 1.07), at=(0.62, -0.745, 0.95), lens=36)],
    parent=CAR, dof=dict(dist=0.3, fstop=2.8), shk=(0.004, 4.0))
CAM("B3_nothing", [dict(f=0.0, loc=(-0.66, -0.62, 1.45), at=(0.15, -0.1, 1.35), lens=17),
                   dict(f=1.0, loc=(-0.64, -0.6, 1.4), at=(0.15, -0.1, 1.4), lens=19)], parent=CAR)
# orient the phone so its screen faces the eyes, then frame an over-the-shoulder shot from evaluated positions
fm = (S("P1_phone_ots")[0] + S("P3_phone_face")[1]) // 2
ph_w = wpos(phone["body"], fm)
eye_w = wpos(hero.face, fm)
ph_w = ph_w + (eye_w - ph_w).normalized() * 0.06 + Vector((0, 0, 0.03))
q = (eye_w - ph_w).to_track_quat('-Y', 'Z')
phone["body"].matrix_world = Matrix.LocRotScale(ph_w, q, None)
bpy.context.view_layer.update()
pc_ = CAR.matrix_world.inverted() @ ph_w
hc_ = CAR.matrix_world.inverted() @ eye_w
back = (hc_ - pc_).normalized()
fwd = (pc_ - hc_).normalized()          # POV: from just in front of the eyes down onto the screen
ots0 = hc_ + fwd * 0.07 + Vector((0, 0, 0.02))
ots1 = hc_ + fwd * 0.1 + Vector((0, 0, 0.01))
CAM("P1_phone_ots", [dict(f=0.0, loc=tuple(ots0), at=tuple(pc_), lens=26),
                     dict(f=1.0, loc=tuple(ots1), at=tuple(pc_), lens=30)],
    parent=CAR, dof=dict(obj=phone["body"], fstop=2.8), shk=(0.004, 5.0))
pc = CAM("P2_battery", [dict(f=0.0, loc=(0.0, -0.2, -0.02), at=(0, 0, -0.035), lens=40, roll=0),
                        dict(f=1.0, loc=(0.0, -0.15, -0.035), at=(0, 0, -0.045), lens=42, roll=0)],
         parent=phone["body"], dof=dict(obj=phone["body"], fstop=2.0))
CAM("P3_phone_face", [dict(f=0.0, loc=(0.12, -0.6, 0.2), at=(0.0, 0.0, 0.22), lens=24),
                      dict(f=1.0, loc=(0.1, -0.52, 0.2), at=(0.0, 0.0, 0.22), lens=26)],
    parent=HN, dof=dict(obj=focus_hero, fstop=2.8), shk=(0.003, 6.0))
CAM("K1_car_hanging", [dict(f=0.0, loc=(-3.4, -0.9, 0.2), at=(0.0, 0.1, 1.3), lens=22),
                       dict(f=1.0, loc=(-2.8, -0.8, 1.6), at=(0.0, 0.1, 2.3), lens=24)])
CAM("K2_cables", [dict(f=0.0, loc=(0.75, -0.62, 3.0), at=(-0.05, 0.0, 4.2), lens=18),
                  dict(f=1.0, loc=(0.55, -0.45, 3.4), at=(-0.05, 0.0, 9.0), lens=22)])
CAM("K3_brakes", [dict(f=0.0, loc=(-1.75, -0.72, 0.1), at=(-1.05, 0.0, -0.2), lens=30),
                  dict(f=1.0, loc=(-1.55, -0.62, 0.0), at=(-1.06, 0.0, -0.22), lens=36)],
    dof=dict(dist=0.85, fstop=4.0))
CAM("T1_thirst", [dict(f=0.0, loc=(0.0, -0.75, 0.24), at=(0.0, 0.0, 0.22), lens=26),
                  dict(f=0.6, loc=(0.0, -0.55, 0.25), at=(0.0, 0.0, 0.24), lens=40),
                  dict(f=1.0, loc=(0.0, -0.45, 0.26), at=(0.0, 0.0, 0.25), lens=58)],
    parent=HN, dof=dict(obj=focus_hero, fstop=2.2))
CAM("D1a_pacing", [dict(f=0.0, loc=(0.0, 0.02, 5.2), at=(0.0, 0.03, 0.0), lens=46, roll=0),
                   dict(f=1.0, loc=(0.0, 0.02, 5.0), at=(0.0, 0.03, 0.0), lens=52, roll=40)], parent=CAR)
CAM("D1b_squirm", [dict(f=0.0, loc=(0.6, -0.55, 1.0), at=(-0.5, 0.15, 0.62), lens=22),
                   dict(f=1.0, loc=(0.45, -0.45, 0.9), at=(-0.5, 0.12, 0.7), lens=27)], parent=CAR,
    dof=dict(obj=focus_hero, fstop=4.0))
CAM("C1_eyes", [dict(f=0.0, loc=(0.0, -0.45, 0.28), at=(0.0, 0.0, 0.29), lens=26),
                dict(f=1.0, loc=(0.0, -0.4, 0.28), at=(0.0, 0.0, 0.29), lens=29)],
    parent=HN, dof=dict(obj=focus_hero, fstop=2.8))
CAM("C2_corner", [dict(f=0.0, loc=(-0.3, -0.45, 1.3), at=(0.78, 0.72, 0.5), lens=18),
                  dict(f=EV["corner_zoom"], loc=(-0.25, -0.42, 1.28), at=(0.78, 0.72, 0.45), lens=48),
                  dict(f=1.0, loc=(-0.2, -0.38, 1.25), at=(0.78, 0.72, 0.42), lens=55)], parent=CAR,
    shk=(0.004, 3.0))
CAM("C3_reluctant", [dict(f=0.0, loc=(0.1, -0.62, 0.22), at=(0.0, 0.0, 0.22), lens=24),
                     dict(f=1.0, loc=(0.08, -0.55, 0.22), at=(0.0, 0.0, 0.23), lens=27)],
    parent=HN, dof=dict(obj=focus_hero, fstop=2.8))
pounds = []
d2 = CAM("D2a_headache", [dict(f=0.0, loc=(0.55, -0.5, 0.55), at=(0.1, 0.45, 0.75), lens=22),
                          dict(f=1.0, loc=(-0.35, -0.5, 0.6), at=(0.1, 0.45, 0.8), lens=26)], parent=CAR,
         dof=dict(obj=focus_hero, fstop=4.0))
for f in EV["pounds"]:     # "pounding" punch-zooms
    cd = d2.data
    base = cd.lens
    fc = [c for c in fcurves(cd) if c.data_path == "lens"][0]
    v = fc.evaluate(f)
    fc.keyframe_points.insert(f - 1, v)
    fc.keyframe_points.insert(f, v * 1.35)
    fc.keyframe_points.insert(f + 4, v)
dz = CAM("D2b_dizzy", [dict(f=0.0, loc=(0.0, -0.55, 0.22), at=(0, 0, 0.22), lens=24, roll=-14),
                       dict(f=0.25, loc=(0.05, -0.55, 0.24), at=(0, 0, 0.22), lens=24, roll=12),
                       dict(f=0.5, loc=(-0.05, -0.52, 0.2), at=(0, 0, 0.22), lens=25, roll=-12),
                       dict(f=0.75, loc=(0.04, -0.5, 0.23), at=(0, 0, 0.22), lens=25, roll=12),
                       dict(f=1.0, loc=(0.0, -0.5, 0.22), at=(0, 0, 0.22), lens=26, roll=-8)],
         parent=HN, dof=dict(obj=focus_hero, fstop=2.0))
CAM("D2c_lips", [dict(f=0.0, loc=(0.06, -0.4, 0.14), at=(0.0, 0.0, 0.15), lens=34),
                 dict(f=1.0, loc=(0.04, -0.35, 0.14), at=(0.0, 0.0, 0.15), lens=40)],
    parent=HN, dof=dict(obj=focus_hero, fstop=2.8))
CAM("A1_vent", [dict(f=0.0, loc=(-0.25, 0.2, 1.55), at=(-0.45, 0.45, 2.3), lens=26),
                dict(f=1.0, loc=(-0.3, 0.27, 1.7), at=(-0.45, 0.45, 2.3), lens=30)], parent=CAR,
    dof=dict(dist=0.55, fstop=4.0))
CAM("A2_fanning", [dict(f=0.0, loc=(-0.45, -0.55, 1.05), at=(0.1, 0.45, 0.72), lens=22),
                   dict(f=1.0, loc=(-0.3, -0.35, 0.95), at=(0.1, 0.45, 0.78), lens=28)], parent=CAR,
    dof=dict(obj=focus_hero, fstop=4.0))
CAM("E1_lying", [dict(f=0.0, loc=(0.0, 0.0, 5.2), at=(0.0, 0.01, 0.0), lens=38, roll=-30),
                 dict(f=1.0, loc=(0.05, 0.08, 4.4), at=(0.05, 0.09, 0.0), lens=42, roll=10)], parent=CAR)
CAM("E2_face_floor", [dict(f=0.0, loc=(0.42, -0.42, 0.05), at=(0.0, 0.0, 0.22), lens=34),
                      dict(f=1.0, loc=(0.34, -0.36, 0.08), at=(0.0, 0.0, 0.22), lens=40)],
    parent=HN, dof=dict(obj=focus_hero, fstop=2.2))
CAM("E3_eye", [dict(f=0.0, loc=(0.03, -0.46, 0.27), at=(0.0, 0.0, 0.26), lens=28),
               dict(f=1.0, loc=(0.02, -0.38, 0.27), at=(0.0, 0.0, 0.265), lens=34)],
    parent=HN, dof=dict(obj=focus_hero, fstop=2.8))
CAM("L1_crack", [dict(f=0.0, loc=(0.55, 0.62, 0.45), at=(0.0, -0.75, 0.6), lens=19),
                 dict(f=1.0, loc=(0.5, 0.58, 0.45), at=(0.0, -0.75, 0.75), lens=22)], parent=CAR)
CAM("R1_pry", [dict(f=0.0, loc=(0.45, 0.62, 0.55), at=(0.0, -0.75, 1.35), lens=19),
               dict(f=1.0, loc=(0.4, 0.6, 0.6), at=(0.0, -0.8, 1.55), lens=17)], parent=CAR,
    shk=(0.01, 2.0, [(EV["pry"], EV["doors_open"])]))
CAM("R2_water", [dict(f=0.0, loc=(0.74, 0.62, 1.55), at=(0.0, -0.55, 1.55), lens=19),
                 dict(f=1.0, loc=(0.7, 0.58, 1.45), at=(0.0, -0.45, 1.45), lens=22)], parent=CAR,
    dof=dict(obj=focus_hero, fstop=4.0))
CAM("M1_madeit", [dict(f=0.0, loc=(1.3, -3.9, 1.55), at=(0.2, -1.8, 2.25), lens=17),
                  dict(f=1.0, loc=(0.85, -3.7, 1.6), at=(0.25, -1.9, 2.3), lens=19)])
CAM("S1_ding", [dict(f=0.0, loc=(-0.9, -3.95, 2.0), at=(0.55, -1.5, 2.1), lens=17),
                dict(f=1.0, loc=(-0.75, -3.85, 2.0), at=(0.6, -1.6, 2.15), lens=19)])
sa, sb = S("S2_stairs")
skeys = []
for fr, off, lens in ((sa, (-1.3, -1.6, -0.3), 18), ((sa + top) // 2, (-1.3, -1.7, 0.1), 20),
                      (EV["thumbs"] - 6, (-0.5, -1.6, 0.0), 24), (sb, (-0.4, -1.2, -0.05), 26)):
    hp_ = wpos(hero.face, fr)
    lc = hp_ + Vector(off)
    lc.y = max(lc.y, -1.35)
    lc.x = max(lc.x, X - 1.3)
    skeys.append(dict(f=fr, loc=tuple(lc), at=tuple(hp_ + Vector((0, 0, -0.15))), lens=lens))
CAM("S2_stairs", skeys,
    dof=dict(obj=focus_hero, fstop=5.6))
bind_cameras(sc, cams)

# ===================================================================== render settings
r = sc.render
r.engine = 'BLENDER_EEVEE_NEXT'
r.resolution_x, r.resolution_y = 1080, 1920
r.resolution_percentage = 100
ee = sc.eevee
ee.taa_render_samples = 6
ee.shadow_resolution_scale = 0.5
# minor fill / practical lights don't need shadow maps (big render-time saver on software GL)
for l in [L_fill, L_face, L_phone, L_emerg, L_sparkL, L_sparkR, L_lobby, L_spill] + hall.lights[1:] + stair.lights[2:]:
    l.data.use_shadow = False
ee.use_raytracing = False
ee.use_shadows = True
ee.shadow_ray_count = 1
ee.shadow_step_count = 4
ee.use_gtao = True
ee.gtao_distance = 0.4
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'
sc.view_settings.exposure = 0.3
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGB'
r.image_settings.compression = 15
r.filepath = os.path.join(HERE, "build", "frames", "f_")
r.use_motion_blur = False
if "preview" in argv:
    r.resolution_percentage = 50
    ee.taa_render_samples = 6
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("SAVED", OUT, "frames", sc.frame_start, sc.frame_end, "cams", len(cams))
