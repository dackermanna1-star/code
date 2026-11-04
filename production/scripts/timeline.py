"""Builds timeline.json: global frame ranges for every shot, derived from the narration timings.

Each narration line is placed after the previous one; leading/trailing silence is trimmed from the TTS.
Shots subdivide lines where the picture needs a cut. 30 fps.
"""
import json, sys
import numpy as np, soundfile as sf

ROOT = "/home/user/code/production"
FPS = 30
cfg = json.load(open(f"{ROOT}/narration.json"))

# (line, [(shot_id, set, fraction_of_line_or_None, description)])
SHOTS = {
    "L01": [("S01a", "hiro_street", 0.52, "Hook: Yamaguchi on a Hiroshima street in morning light, slow push-in; title"),
            ("S01b", "office", None, "Hook: bandaged Yamaguchi in the Nagasaki office, light swelling at the window")],
    "L02": [("S02", "office", None, "Nagasaki design office: drafting oil-tanker plans")],
    "L03": [("S03", "home", None, "May 1945: leaving wife and baby son at the door of the Nagasaki house")],
    "L04": [("S04", "hiro_street", None, "6 August, Hiroshima: streetcar stops, he walks toward the shipyard")],
    "L05": [("S05a", "hiro_street", 0.42, "He hears a plane, stops, looks up"),
            ("S05b", "sky", None, "POV: lone B-29 high above, two small parachutes")],
    "L06": [("S06a", "hiro_street", 0.45, "Flash: white light floods the street"),
            ("S06b", "hiro_street", None, "Blast wave: dust wall, he is thrown down")],
    "L07": [("S07", "hiro_ruins", None, "Dust-darkened field: he rises, burned and deafened")],
    "L08": [("S08", "vista_hiro", None, "Wide: the cloud over the flattened city")],
    "L09": [("S09", "night_ruins", None, "Night: three colleagues sit together amid the ruins")],
    "L10": [("S10", "station", None, "7 August: the evacuation train pulls out of the station")],
    "L11": [("S11", "naga_harbor", None, "9 August, Nagasaki: bandaged, he walks to the shipyard office")],
    "L12": [("S12a", "office", 0.5, "He explains to his supervisor"),
            ("S12b", "office", None, "The supervisor does not believe him")],
    "L13": [("S13a", "office", 0.38, "Wall clock: 11:02"),
            ("S13b", "office", None, "The same white light fills the room")],
    "L14": [("S14", "office", None, "On the floor, looking toward the window: the quote")],
    "L15": [("S15a", "vista_naga", 0.33, "Cloud rising over Nagasaki's hills"),
            ("S15b", "home", 0.68, "Reunited with wife and son"),
            ("S15c", "vista_naga", None, "The devastated Urakami valley, quiet")],
    "L16": [("S16", "office_later", None, "Years later: designing ships again, silent")],
    "L17": [("S17", "un_hall", None, "2006: speaking at the United Nations")],
    "L18": [("S18a", "home_later", 0.5, "His hands holding the official recognition"),
            ("S18b", "home_later", None, "Old Yamaguchi, the document on the table")],
    "L19": [("S19", "naga_sunset", None, "Old Yamaguchi at the harbour at sunset")],
    "L20": [("S20", "lanterns", None, "Floating lanterns on the water; end card")],
}

lead_in = 0.6
tail = 3.5
t = lead_in
out = {"fps": FPS, "lines": [], "shots": []}
for ln in cfg["lines"]:
    a, sr = sf.read(f"{ROOT}/audio/narration/{ln['id']}.wav")
    idx = np.where(np.abs(a) > 0.01)[0]
    s0, s1 = idx[0] / sr, idx[-1] / sr
    speech = s1 - s0
    dur = speech + ln["pause_after"] + 0.3
    out["lines"].append({"id": ln["id"], "text": ln["text"], "t": round(t, 3), "audio_trim": round(max(s0 - 0.03, 0), 3),
                         "speech": round(speech, 3), "dur": round(dur, 3)})
    shots = SHOTS[ln["id"]]
    ts = t
    for i, (sid, st, frac, desc) in enumerate(shots):
        te = t + dur * frac if frac else t + dur
        if i == len(shots) - 1:
            te = t + dur
        if ln["id"] == "L20":
            te += tail
        out["shots"].append({"id": sid, "set": st, "line": ln["id"], "desc": desc,
                             "f0": int(round(ts * FPS)) + 1, "f1": int(round(te * FPS))})
        ts = te
    t += dur
# make shots contiguous
for a, b in zip(out["shots"][:-1], out["shots"][1:]):
    b["f0"] = a["f1"] + 1
out["shots"][0]["f0"] = 1
out["total_frames"] = out["shots"][-1]["f1"]
out["total_seconds"] = out["total_frames"] / FPS
json.dump(out, open(f"{ROOT}/timeline.json", "w"), indent=1)
for s in out["shots"]:
    print(f"{s['id']:5s} {s['set']:14s} {s['f0']:5d}-{s['f1']:5d} ({(s['f1']-s['f0']+1)/FPS:4.1f}s) {s['desc']}")
print("TOTAL", out["total_frames"], "frames", round(out["total_seconds"], 1), "s")
