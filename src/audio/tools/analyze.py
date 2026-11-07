#!/usr/bin/env python3
"""Quick numeric checks of an audio file (any ffmpeg-readable format):
RMS / peak dBFS, clipping, spectral centroid, energy per octave band.
    python3 src/audio/tools/analyze.py file.ogg [more files...]
"""
import subprocess, sys
import numpy as np

def load(path, sr=48000):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'])
    return np.frombuffer(raw, np.float32), sr

def report(a, sr, name):
    a = a[np.isfinite(a)]
    rms = np.sqrt(np.mean(a ** 2) + 1e-20); peak = np.abs(a).max() + 1e-20
    spec = np.abs(np.fft.rfft(a * np.hanning(len(a)))) ** 2
    f = np.fft.rfftfreq(len(a), 1 / sr)
    cen = (spec * f).sum() / spec.sum()
    bands = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    tot = spec.sum()
    bd = ' '.join(f'{b}:{10*np.log10(spec[(f>=b/1.414)&(f<b*1.414)].sum()/tot+1e-12):.0f}' for b in bands)
    print(f'{name}: dur {len(a)/sr:.2f}s rms {20*np.log10(rms):.1f} dBFS peak {20*np.log10(peak):.1f} dBFS clip {(np.abs(a)>=0.999).sum()} centroid {cen:.0f} Hz | {bd}')

if __name__ == '__main__':
    for p in sys.argv[1:]:
        a, sr = load(p); report(a, sr, p.split('/')[-1])
