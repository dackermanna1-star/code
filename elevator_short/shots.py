"""Shared timing table (pure Python, no bpy). Used by the Blender build, the audio mixer and the
caption/post pass so that cuts, actions, sound effects and captions all line up with the voiceover."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, "build", "timeline.json")))
FPS = TL["fps"]
BEATS = {b["key"]: b for b in TL["beats"]}
FRAME_END = TL["frame_end"]


def W(key, idx):
    """Frame where word `idx` of beat `key` starts."""
    return int(round(BEATS[key]["words"][idx][1] * FPS)) + 1


def B0(key):
    return BEATS[key]["f0"]


def B1(key):
    return BEATS[key]["f1"]


# ---------------------------------------------------------------- key story events (frames)
EV = {}
EV["slam"] = W("hook", 4) + 3                 # car slams to a stop on "slams"
EV["sparks_on"] = EV["slam"] - 8
EV["land"] = EV["slam"] + 6                   # character crashes to the floor (interior)
EV["power_cut"] = EV["slam"] + 1
EV["btn_presses"] = [W("buttons", 1) + i * 3 for i in range(8)]
EV["alarm"] = W("buttons", 6) - 2
EV["nothing"] = W("buttons", 7)
EV["no_signal"] = W("phone", 2)
EV["battery"] = W("phone", 4)
EV["phone_dies"] = B1("phone") - 6
EV["brake_glow"] = W("brakes", 11)
EV["thirst"] = W("thirst", 4)
EV["growl"] = W("day1", 4) + 2
EV["corner_zoom"] = W("corner", 2) + 4
EV["pounds"] = [W("day2", 5) + i * 7 for i in range(4)]
EV["dizzy"] = W("day2", 7)
EV["heartbeats"] = list(range(W("day3", 6), B1("day3") - 6, 17))
EV["crack"] = W("light", 2) - 2
EV["crowbar"] = W("rescue", 2)
EV["pry"] = W("rescue", 3)
EV["doors_open"] = W("rescue", 6)
EV["handoff"] = W("rescue", 8) + 4
EV["gulps"] = [EV["handoff"] + 12 + i * 8 for i in range(4)]
EV["cheer"] = W("madeit", 1)
EV["ding"] = B0("stairs") + 6
EV["door_bang"] = None   # set below
EV["thumbs"] = FRAME_END - 30

# ---------------------------------------------------------------- shot list
# (name, first_frame, last_frame) -- contiguous
_cuts = [
    ("H1_freefall", 1),
    ("H2_shaft_drop", W("hook", 2)),
    ("H3_aftermath", EV["slam"] + 5),
    ("B1_buttons", B0("buttons")),
    ("B2_alarm", W("buttons", 4) - 2),
    ("B3_nothing", W("buttons", 7)),
    ("P1_phone_ots", B0("phone")),
    ("P2_battery", W("phone", 4) - 1),
    ("P3_phone_face", W("phone", 6) + 3),
    ("K1_car_hanging", B0("brakes")),
    ("K2_cables", W("brakes", 7) - 2),
    ("K3_brakes", W("brakes", 10)),
    ("T1_thirst", B0("thirst")),
    ("D1a_pacing", B0("day1")),
    ("D1b_squirm", W("day1", 5) + 2),
    ("C1_eyes", B0("corner")),
    ("C2_corner", W("corner", 2) - 2),
    ("C3_reluctant", W("corner", 5) + 2),
    ("D2a_headache", B0("day2")),
    ("D2b_dizzy", W("day2", 7) - 2),
    ("D2c_lips", W("day2", 9) - 3),
    ("A1_vent", B0("air")),
    ("A2_fanning", W("air", 7) - 2),
    ("E1_lying", B0("day3")),
    ("E2_face_floor", W("day3", 6) - 2),
    ("E3_eye", W("day3", 13) - 3),
    ("L1_crack", B0("light")),
    ("R1_pry", B0("rescue")),
    ("R2_water", W("rescue", 7) - 2),
    ("M1_madeit", B0("madeit")),
    ("S1_ding", B0("stairs")),
    ("S2_stairs", W("stairs", 3) + 6),
]
SHOTS = []
for i, (n, f) in enumerate(_cuts):
    f1 = (_cuts[i + 1][1] - 1) if i + 1 < len(_cuts) else FRAME_END
    SHOTS.append((n, f, f1))
SHOT = {n: (a, b) for n, a, b in SHOTS}
EV["door_bang"] = SHOT["S2_stairs"][0]

# title cards rendered in the post pass: (text, first_frame, last_frame)
CARDS = [
    ("DAY 1", B0("day1"), B0("day1") + 40),
    ("DAY 2", B0("day2"), B0("day2") + 40),
    ("DAY 3", B0("day3"), B0("day3") + 40),
]

if __name__ == "__main__":
    for n, a, b in SHOTS:
        print(f"{n:18s} {a:5d} {b:5d}  ({b - a + 1} f)")
    for k, v in EV.items():
        print(k, v)
