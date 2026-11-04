"""Generate narration with Kokoro-82M (Apache-2.0). Writes one WAV per line plus word timings."""
import json, sys, re
import numpy as np, soundfile as sf
from kokoro import KPipeline

ROOT = sys.argv[1]
cfg = json.load(open(f"{ROOT}/narration.json"))
# phoneme overrides (Kokoro inline syntax [word](/phonemes/))
PRON = {
    "Tsutomu": "[Tsutomu](/tsutˈomu/)",
    "Yamaguchi": "[Yamaguchi](/jˌɑməɡˈuʧi/)",
    "Mitsubishi's": "[Mitsubishi's](/mˌɪtsubˈiʃiz/)",
    "B-29": "[B-29](/bˈi twˈɛnti nˈIn/)",
}
pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
SR = 24000
timings = []
for ln in cfg["lines"]:
    t = ln["text"]
    for k, v in PRON.items():
        t = t.replace(k, v)
    chunks, words, off = [], [], 0.0
    for res in pipe(t, voice=cfg["voice"], speed=cfg["speed"]):
        a = res.audio.numpy() if hasattr(res.audio, "numpy") else np.asarray(res.audio)
        for tok in (res.tokens or []):
            if tok.start_ts is not None and tok.text.strip() and re.search(r"\w", tok.text):
                words.append({"w": tok.text, "s": off + tok.start_ts, "e": off + (tok.end_ts or tok.start_ts)})
        chunks.append(a); off += len(a) / SR
    audio = np.concatenate(chunks)
    sf.write(f"{ROOT}/audio/narration/{ln['id']}.wav", audio, SR)
    timings.append({"id": ln["id"], "dur": len(audio) / SR, "words": words})
    print(ln["id"], round(len(audio) / SR, 2), len(words), flush=True)
json.dump(timings, open(f"{ROOT}/audio/narration/timings.json", "w"), indent=1)
