import json, sys, glob, os
from faster_whisper import WhisperModel
m = WhisperModel('small.en', device='cpu', compute_type='int8')
out = {}
for f in sorted(glob.glob('/opt/work/vo/L*.wav')):
    import soundfile as sf, numpy as np, scipy.signal as ss
    a,sr=sf.read(f); a=ss.resample_poly(a,16000,sr).astype(np.float32)
    segs, info = m.transcribe(a, word_timestamps=True, beam_size=5)
    words = []
    text = ''
    for s in segs:
        text += s.text
        for w in s.words: words.append([w.word.strip(), round(w.start,3), round(w.end,3)])
    k = os.path.basename(f)[:-4]; out[k] = words
    print(k, text)
json.dump(out, open('/opt/work/vo/words.json','w'), indent=0)
