"""Composite + overlay every shot that has finished rendering, then encode the MP4.

python3 assemble.py [--only SH01,SH02] [--encode]
"""
import os, sys, json, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import composite as C
import overlays as O

R = "/opt/work/renders"; COMP = "/opt/work/comp"; FINAL = "/opt/work/final"
SHOTS = json.load(open(f"{R}/shots.json"))
GRADE = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "grade.json")))
only = None
if "--only" in sys.argv: only = sys.argv[sys.argv.index("--only") + 1].split(",")


def ready(sid, s):
    d = f"{R}/{sid}"
    if s["mode"] == "thermal":
        return len([x for x in os.listdir(d) if "_thermal_" in x]) >= s["f1"] - s["f0"] + 1
    if not os.path.exists(f"{d}/{sid}_plate.json"): return False
    if s["chars"]:
        n = len([x for x in os.listdir(d) if "_char_" in x])
        if n < s["f1"] - s["f0"] + 1: return False
        if not os.path.exists(f"{d}/breath.log") or "BREATH" not in open(f"{d}/breath.log").read(): return False
    return True


done = []
for sid, s in SHOTS.items():
    if only and sid not in only: continue
    if not ready(sid, s): continue
    g = dict(GRADE["default"]); g.update(GRADE.get(sid, {}))
    fr = [f for f in range(s["f0"], s["f1"] + 1) if not os.path.exists(f"{FINAL}/{f:05d}.png") or only]
    if not fr: done.append(sid); continue
    C.run(sid, f"{R}/{sid}", f"{COMP}/{sid}", SHOTS, g, fr)
    os.makedirs(FINAL, exist_ok=True)
    for f in fr: O.process(f, COMP, FINAL)
    done.append(sid); print("ASSEMBLED", sid, len(fr), flush=True)

if "--encode" in sys.argv:
    out = "/home/user/code/freezer_short/output/could_you_survive_freezer.mp4"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    common = ["ffmpeg", "-y", "-framerate", "30", "-start_number", "1", "-i", f"{FINAL}/%05d.png"]
    v = ["-c:v", "libx264", "-preset", "slow", "-b:v", "5200k", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", "30",
         "-x264-params", "keyint=60:min-keyint=30", "-movflags", "+faststart"]
    subprocess.run(common + v + ["-pass", "1", "-an", "-f", "mp4", "/dev/null"], check=True, cwd="/opt/work")
    subprocess.run(common + ["-i", "/opt/work/mix.wav"] + v + ["-pass", "2", "-c:a", "aac", "-b:a", "192k", "-shortest", out],
                   check=True, cwd="/opt/work")
    print("ENCODED", out)
