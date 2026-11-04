"""Generate voiceover lines with Kokoro (Apache-2.0) -> audio/vo/Lxx.wav + durations json."""
import json, soundfile as sf, numpy as np, os, sys
from kokoro_onnx import Kokoro
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
k = Kokoro(f'{R}/assets/tts/kokoro-v1.0.onnx', f'{R}/assets/tts/voices-v1.0.bin')
voice = sys.argv[1] if len(sys.argv) > 1 else 'af_heart'
lines = json.load(open(f'{R}/scripts/narration.json'))
out = {}
for L in lines:
    a, sr = k.create(L.get('say', L['text']), voice=voice, speed=0.96, lang='en-us')
    # trim leading/trailing silence
    thr = 0.01; idx = np.where(np.abs(a) > thr)[0]
    a = a[max(0, idx[0]-int(0.03*sr)): idx[-1]+int(0.12*sr)]
    sf.write(f'{R}/audio/vo/{L["id"]}.wav', a, sr)
    out[L['id']] = round(len(a)/sr, 3); print(L['id'], out[L['id']])
json.dump(out, open(f'{R}/audio/vo/durations.json', 'w'), indent=1)
print('TOTAL', sum(out.values()))
