"""Word-level timestamps for subtitles + an intelligibility check of the TTS,
using faster-whisper (MIT) on the generated narration."""
import sys, json
from faster_whisper import WhisperModel
wav, out = sys.argv[1], sys.argv[2]
m = WhisperModel("small.en", device="cpu", compute_type="int8")
import soundfile as sf, numpy as np
audio, sr = sf.read(wav, dtype="float32")
assert sr == 16000 or True
import scipy.signal as ss
if sr != 16000: audio = ss.resample_poly(audio, 16000, sr).astype("float32")
segs, info = m.transcribe(audio, word_timestamps=True, beam_size=5, language="en")
words = []
for s in segs:
    for w in s.words:
        words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
json.dump(words, open(out, "w"), indent=0)
print(" ".join(w["w"] for w in words))
print("NWORDS", len(words), "LOWCONF", [w["w"] for w in words if w["p"] < 0.5])
