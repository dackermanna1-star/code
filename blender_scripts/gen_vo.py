import sys, soundfile as sf, numpy as np
sys.path.insert(0,'/opt/work')
from vo_lines import LINES
from kokoro_onnx import Kokoro
k = Kokoro('/opt/assets/kokoro/kokoro-v1.0.onnx','/opt/assets/kokoro/voices-v1.0.bin')
voice='am_michael'
# spoken respellings -> exact phoneme fixes for names
SAY = {"Mehran Karimi Nasseri":"Mehrahn Kareemee Nasseree", "Sir Alfred Mehran":"Sir Alfred Mehrahn"}
FIX = {"mˈeɪɹɑːn":"mɛhɹˈɑːn", "kæɹˈiːmiː":"kæɹˈiːmi", "nˈæsɚɹˌiː":"nˌæsəɹˈiː"}
only = sys.argv[1:]
for key, txt in LINES:
    if only and key not in only: continue
    t = txt
    for a,b in SAY.items(): t = t.replace(a,b)
    ph = k.tokenizer.phonemize(t,'en-us')
    for a,b in FIX.items(): ph = ph.replace(a,b)
    s, sr = k.create(ph, voice=voice, speed=1.07, lang='en-us', is_phonemes=True)
    a = np.abs(s); thr = 0.01*a.max(); idx = np.where(a>thr)[0]
    s = s[max(0,idx[0]-int(0.03*sr)): idx[-1]+int(0.08*sr)]
    sf.write(f'/opt/work/vo/{key}.wav', s, sr)
    print(key, round(len(s)/sr,2), ph if key in ('L02','L18') else '')
