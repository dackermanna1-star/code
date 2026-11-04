"""Generate the narration with Kokoro-82M (Apache-2.0) via kokoro-onnx.
Writes one WAV per line plus a combined timeline + JSON with line timings."""
import sys, json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
NAR = sys.argv[1]; OUT = sys.argv[2]; VOICE = sys.argv[3] if len(sys.argv) > 3 else "am_michael"
SPEED = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
import os; os.makedirs(OUT, exist_ok=True)
k = Kokoro("/opt/assets/tts/kokoro-v1.0.onnx", "/opt/assets/tts/voices-v1.0.bin")
if "+" in VOICE:  # blend e.g. am_michael+am_fenrir
    a, b = VOICE.split("+"); voice = 0.6 * k.get_voice_style(a) + 0.4 * k.get_voice_style(b)
else:
    voice = VOICE
lines = [l.strip().split("|") for l in open(NAR) if l.strip() and not l.startswith("#")]
sr = 24000; t = 0.6  # lead-in silence
timeline = []; chunks = [np.zeros(int(sr * t), dtype=np.float32)]
for lid, pause, text in lines:
    samples, sr = k.create(text, voice=voice, speed=SPEED, lang="en-us")
    samples = samples.astype(np.float32)
    # trim leading/trailing near-silence
    idx = np.where(np.abs(samples) > 0.01)[0]
    samples = samples[max(0, idx[0] - 240): idx[-1] + 2400]
    sf.write(f"{OUT}/{lid}.wav", samples, sr)
    dur = len(samples) / sr
    timeline.append({"id": lid, "start": round(t, 3), "end": round(t + dur, 3), "text": text})
    chunks.append(samples); t += dur
    gap = np.zeros(int(sr * float(pause)), dtype=np.float32); chunks.append(gap); t += float(pause)
full = np.concatenate(chunks)
sf.write(f"{OUT}/narration_full.wav", full, sr)
json.dump({"voice": VOICE, "speed": SPEED, "total": round(t, 3), "lines": timeline}, open(f"{OUT}/timeline.json", "w"), indent=1)
print("TOTAL", round(t, 2))
for x in timeline: print(x["id"], x["start"], x["end"], round(x["end"] - x["start"], 2))
