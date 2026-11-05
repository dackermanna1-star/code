"""Generate narration with Kokoro-82M (Apache-2.0) and export word timings.
Run with /opt/tts/bin/python. Writes audio/vo/vo_full.wav and story/vo_timing.json"""
import json, numpy as np, soundfile as sf, sys
from kokoro import KPipeline
cfg = json.load(open('/home/user/code/story/narration.json'))
voice = sys.argv[1] if len(sys.argv) > 1 else cfg['voice']
out_wav = sys.argv[2] if len(sys.argv) > 2 else '/home/user/code/audio/vo/vo_full.wav'
SR = 24000
pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
lead = 0.4
audio = [np.zeros(int(lead * SR), dtype=np.float32)]
t = lead
timing = []
for seg in cfg['segments']:
    chunks, words = [], []
    seg_t = 0.0
    for r in pipe(seg['text'], voice=voice, speed=cfg['speed']):
        a = r.audio.numpy() if hasattr(r.audio, 'numpy') else np.asarray(r.audio)
        for tok in (r.tokens or []):
            if tok.start_ts is None: continue
            words.append({'w': tok.text, 'ws': tok.whitespace, 's': round(t + seg_t + tok.start_ts, 3), 'e': round(t + seg_t + (tok.end_ts or tok.start_ts), 3)})
        chunks.append(a); seg_t += len(a) / SR
    a = np.concatenate(chunks)
    # trim trailing near-silence so pauses are controlled by pause_after
    thr = 0.01; nz = np.where(np.abs(a) > thr)[0]
    end = min(len(a), nz[-1] + int(0.08 * SR)) if len(nz) else len(a)
    a = a[:end]
    dur = len(a) / SR
    timing.append({'id': seg['id'], 'text': seg['text'], 'start': round(t, 3), 'end': round(t + dur, 3), 'words': words})
    audio.append(a); t += dur
    gap = seg['pause_after']; audio.append(np.zeros(int(gap * SR), dtype=np.float32)); t += gap
full = np.concatenate(audio)
sf.write(out_wav, full, SR)
json.dump({'voice': voice, 'sr': SR, 'duration': round(t, 3), 'segments': timing}, open('/home/user/code/story/vo_timing.json', 'w'), indent=1)
print('VO duration %.2fs' % t)
for s in timing: print(s['id'], s['start'], s['end'], len(s['words']))
