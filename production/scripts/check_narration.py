import json, numpy as np, soundfile as sf
from faster_whisper import WhisperModel
m = WhisperModel("small.en", device="cpu", compute_type="int8")
c = json.load(open("narration.json"))
tot = 0
for l in c["lines"]:
    a, sr = sf.read(f"audio/narration/{l['id']}.wav")
    env = np.abs(a) > 0.01
    idx = np.where(env)[0]
    s, e = idx[0] / sr, idx[-1] / sr
    tot += e - s
    import scipy.signal as ss; a16 = ss.resample_poly(a, 2, 3).astype(np.float32); segs, _ = m.transcribe(a16, beam_size=5)
    txt = " ".join(x.text.strip() for x in segs)
    print(f"{l['id']} lead={s:.2f} tail={len(a)/sr-e:.2f} speech={e-s:.2f}\n   ASR: {txt}")
print("total trimmed speech", tot)
