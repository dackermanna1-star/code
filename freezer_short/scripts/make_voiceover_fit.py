"""Re-voice the narration while keeping every line's start time from the original timeline
(so the picture stays in sync). Each line's speed is raised just enough to fit its slot
(up to 1.30x); the last line may run into the end-card tail."""
import sys, json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
NAR, OLD_TL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
import os; os.makedirs(OUT, exist_ok=True)
k = Kokoro("/opt/assets/tts/kokoro-v1.0.onnx", "/opt/assets/tts/voices-v1.0.bin")
old = json.load(open(OLD_TL)); base_speed = old["speed"]
starts = {l["id"]: l["start"] for l in old["lines"]}
lines = [l.strip().split("|") for l in open(NAR) if l.strip() and not l.startswith("#")]
ids = [l[0] for l in lines]
sr = 24000; total = 131.6
buf = np.zeros(int(total * sr), np.float32); tl = []


def synth(text, speed):
    x, _ = k.create(text, voice="am_michael", speed=speed, lang="en-us")
    x = x.astype(np.float32); idx = np.where(np.abs(x) > 0.01)[0]
    return x[max(0, idx[0] - 240): idx[-1] + 2400]


for i, (lid, pause, text) in enumerate(lines):
    st = starts[lid]
    slot = (starts[ids[i + 1]] - st - 0.12) if i + 1 < len(ids) else (total - 1.2 - st)
    sp = base_speed; x = synth(text, sp)
    while len(x) / sr > slot and sp < 1.30:
        sp = min(1.30, sp * (len(x) / sr) / slot * 1.01); x = synth(text, sp)
    i0 = int(st * sr); buf[i0:i0 + len(x)] += x[: len(buf) - i0]
    tl.append({"id": lid, "start": st, "end": round(st + len(x) / sr, 3), "text": text, "speed": round(sp, 3)})
    print(lid, "slot", round(slot, 2), "dur", round(len(x) / sr, 2), "speed", round(sp, 3), "OVER" if len(x) / sr > slot else "")
sf.write(f"{OUT}/narration_full.wav", buf, sr)
json.dump({"voice": "am_michael", "speed": base_speed, "total": total, "lines": tl}, open(f"{OUT}/timeline.json", "w"), indent=1)
