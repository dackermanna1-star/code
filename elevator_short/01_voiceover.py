"""Generate the voiceover with Piper TTS and build timeline.json (frame timing for every beat
and per-word caption timing). Usage: python3 01_voiceover.py <out_dir>"""
import sys, os, json, wave, re
import numpy as np
from piper import PiperVoice, SynthesisConfig
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from story import LINES, FPS, LEAD_IN

out = sys.argv[1] if len(sys.argv) > 1 else "build"
os.makedirs(out, exist_ok=True)
voice = PiperVoice.load("/opt/voices/en_US-ryan-high.onnx")
cfg = SynthesisConfig(length_scale=0.9, noise_scale=0.6, noise_w_scale=0.7)

def read(path):
    with wave.open(path) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return a, sr

def trim(a, sr, thr=0.012):
    env = np.convolve(np.abs(a), np.ones(int(sr*0.01))/int(sr*0.01), mode="same")
    idx = np.where(env > thr)[0]
    s, e = max(0, idx[0]-int(sr*0.02)), min(len(a), idx[-1]+int(sr*0.05))
    return a[s:e]

def word_times(a, sr, words):
    """Approximate per-word timing: split speech into voiced segments separated by pauses, then
    distribute words over voiced time proportional to their letter count."""
    hop = int(sr*0.01)
    env = np.array([np.sqrt(np.mean(a[i:i+hop]**2)) for i in range(0, len(a)-hop, hop)])
    voiced = env > 0.02
    # time mapping only over voiced frames (pauses don't consume word length)
    vt = np.cumsum(voiced) * 0.01
    total_v = vt[-1]
    weights = [max(2, len(re.sub(r"[^A-Za-z0-9]", "", w))) + 1.5 for w in words]
    cum = np.cumsum([0] + weights) / sum(weights) * total_v
    res = []
    for i, w in enumerate(words):
        t0 = np.searchsorted(vt, cum[i] + 1e-4) * 0.01
        t1 = np.searchsorted(vt, cum[i+1] - 1e-4) * 0.01
        res.append([w, round(float(t0), 3), round(float(max(t1, t0+0.08)), 3)])
    return res

full = []
sr0 = None
t = LEAD_IN
beats = []
for key, text, pad in LINES:
    p = os.path.join(out, f"vo_{key}.wav")
    with wave.open(p, "wb") as w:
        voice.synthesize_wav(text, w, syn_config=cfg)
    a, sr = read(p)
    sr0 = sr
    a = trim(a, sr)
    dur = len(a) / sr
    words = text.split()
    wt = word_times(a, sr, words)
    beats.append(dict(key=key, text=text, start=round(t, 3), vo_end=round(t+dur, 3),
                      end=round(t+dur+pad, 3), words=[[w, round(t+a0, 3), round(t+a1, 3)] for w, a0, a1 in wt]))
    full.append((t, a))
    t += dur + pad

total = t
buf = np.zeros(int(total*sr0) + sr0)
for t0, a in full:
    i = int(t0*sr0); buf[i:i+len(a)] += a
buf = buf[:int(total*sr0)]
with wave.open(os.path.join(out, "voiceover.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr0)
    w.writeframes((np.clip(buf, -1, 1)*32767).astype(np.int16).tobytes())
for b in beats:
    b["f0"] = int(round(b["start"]*FPS)) + 1
    b["f1"] = int(round(b["end"]*FPS))
beats[0]["f0"] = 1
for i in range(len(beats)-1):           # make beats contiguous
    beats[i]["f1"] = beats[i+1]["f0"] - 1
tl = dict(fps=FPS, total_sec=round(total, 3), frame_end=beats[-1]["f1"], beats=beats)
json.dump(tl, open(os.path.join(out, "timeline.json"), "w"), indent=1)
for b in beats:
    print(f'{b["key"]:8s} {b["start"]:6.2f}-{b["end"]:6.2f}  frames {b["f0"]:4d}-{b["f1"]:4d}  {b["text"]}')
print("TOTAL", round(total, 2), "s  frames", tl["frame_end"])
