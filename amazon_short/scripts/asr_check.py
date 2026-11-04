"""Transcribe VO lines with faster-whisper: word timestamps for subtitles + pronunciation check."""
import json, os, subprocess, numpy as np
from faster_whisper import WhisperModel
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m = WhisperModel('small.en', device='cpu', compute_type='int8')
lines = json.load(open(f'{R}/scripts/narration.json')); res = {}
for L in lines:
    pcm = subprocess.run(['ffmpeg','-v','quiet','-i',f'{R}/audio/vo/{L["id"]}.wav','-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout
    segs, _ = m.transcribe(np.frombuffer(pcm, np.float32), word_timestamps=True, beam_size=5)
    words = [dict(w=w.word.strip(), s=round(w.start, 3), e=round(w.end, 3)) for s in segs for w in s.words]
    res[L['id']] = words; print(L['id'], ' '.join(w['w'] for w in words))
json.dump(res, open(f'{R}/audio/vo/words.json', 'w'), indent=0)
